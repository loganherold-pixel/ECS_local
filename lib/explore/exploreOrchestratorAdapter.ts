import { assessExploreRecommendationConfidence } from '../ai/confidenceEngine';
import type { ECSOperationalState } from '../ai/degradedOperationsTypes';
import type { ECSExpeditionPhase } from '../ai/expeditionPhaseTypes';
import { operatorTrustModeStore } from '../ai/operatorTrustMode';
import {
  trustModeExploreScoreAdjustment,
  trustModeExploreVisibility,
} from '../ai/operatorTrustResolvers';
import type { ECSOrchestratorCandidate } from '../ai/orchestratorTypes';
import { explainRecommendation } from '../ai/recommendationExplanationEngine';
import { buildTrustMetadata } from '../ai/trustContract';
import { bucketStableScore } from '../ai/scoreStability';
import type { EnrichedDiscoveryRoute } from '../discoveryIntelligenceEngine';
import type { ECSVehicularState } from '../fleet/activeVehicleState';
import type { ECSLiveStatusResult } from '../status/liveStatusTypes';
import {
  getActiveVehicleSnapshotForEcs,
  scoreVehicleSuitabilityForEcs,
} from '../vehicleEcsIntegration';

export type ExploreSectionType = 'hidden_gem' | 'popular_trail';

export type ExploreOrchestrationResult = {
  surfaced: EnrichedDiscoveryRoute[];
  softened: EnrichedDiscoveryRoute[];
  suppressed: EnrichedDiscoveryRoute[];
  summaryNote: string | null;
};

export type ExploreOrchestrationParams = {
  section: ExploreSectionType;
  routes: EnrichedDiscoveryRoute[];
  expeditionPhase?: ECSExpeditionPhase | null;
  operationalState?: ECSOperationalState | null;
  recommendationStatus?: ECSLiveStatusResult | null;
  primaryCandidate?: ECSOrchestratorCandidate | null;
  activeVehicleState?: ECSVehicularState | null;
  hasGPSFix: boolean;
};

type RankedRoute = EnrichedDiscoveryRoute & {
  orchestrationScore: number;
  visibility: 'surface' | 'softened' | 'suppressed';
};

type ExploreRouteWithCurationMetadata = EnrichedDiscoveryRoute & {
  categoryScore?: number;
  sourceMetadata?: {
    confidenceWeightedScore?: number;
    rationaleDrivers?: string[];
  };
};

export function orchestrateExploreSectionRoutes(
  params: ExploreOrchestrationParams,
): ExploreOrchestrationResult {
  const ranked = params.routes
    .map((route) => enrichRouteForExplore(route, params))
    .sort((left, right) => {
      if (right.orchestrationScore !== left.orchestrationScore) {
        return right.orchestrationScore - left.orchestrationScore;
      }
      return left.name.localeCompare(right.name);
    });

  const surfaced = ranked.filter((route) => route.visibility === 'surface');
  const softened = ranked.filter((route) => route.visibility === 'softened');
  const suppressed = ranked.filter((route) => route.visibility === 'suppressed');

  return {
    surfaced,
    softened,
    suppressed,
    summaryNote: buildSectionSummaryNote(params, surfaced.length, softened.length, suppressed.length),
  };
}

function enrichRouteForExplore(
  route: EnrichedDiscoveryRoute,
  params: ExploreOrchestrationParams,
): RankedRoute {
  const operatorTrustMode = operatorTrustModeStore.mode;
  const offline =
    params.recommendationStatus?.status === 'offline_capable' ||
    params.operationalState === 'offline_capable' ||
    params.operationalState === 'limited' ||
    params.operationalState === 'unavailable';
  const degraded =
    params.recommendationStatus?.status === 'degraded' ||
    params.operationalState === 'degraded' ||
    params.operationalState === 'limited';
  const adjustedConfidence = assessExploreRecommendationConfidence({
    hasDistanceContext: route.distanceFromUserMiles != null,
    gpsEstimated: !params.hasGPSFix,
    hasVehicleAssessment: (route.vehicleMatch?.score ?? 0) > 0,
    hasHiddenGemSignals:
      params.section === 'hidden_gem'
      ? route.gemScore.score > 0 || route.routeLabel === 'Hidden Gem'
      : route.routeLabel === 'Known Route' || route.routeLabel === 'Local Favorite',
    aiConfidence: route.aiConfidence ?? null,
    offline,
    degraded,
  });

  const drivers = buildExploreDrivers(route, params.section, params.expeditionPhase);
  const explanation = explainRecommendation({
    type: 'hidden_gem',
    drivers,
    confidenceLevel: adjustedConfidence.level,
    degradedState: params.operationalState ?? undefined,
    trustMode: operatorTrustMode,
  }) ?? route.explanation ?? null;

  let rawOrchestrationScore = baseRouteScore(route, params.section);
  rawOrchestrationScore += confidenceBoost(adjustedConfidence.level);
  rawOrchestrationScore += phaseAdjustment(route, params.section, params.expeditionPhase);
  rawOrchestrationScore += degradedAdjustment(params.operationalState, route, params.section);
  rawOrchestrationScore += recommendationStatusAdjustment(params.recommendationStatus);
  rawOrchestrationScore += externalFocusAdjustment(params.primaryCandidate, adjustedConfidence.level);
  rawOrchestrationScore += vehicleSuitabilityAdjustment(route, params);
  rawOrchestrationScore += trustModeExploreScoreAdjustment({
    mode: operatorTrustMode,
    confidenceLevel: adjustedConfidence.level,
    section: params.section,
  });
  const orchestrationScore = bucketStableScore(rawOrchestrationScore, 4);
  const trust = buildTrustMetadata({
    confidence: adjustedConfidence,
    liveStatus: params.recommendationStatus ?? null,
    operationalState: params.operationalState ?? null,
    explanation,
    freshnessClass: 'marker_scoring',
  });

  const visibility = trustModeExploreVisibility(classifyVisibility({
    route,
    section: params.section,
    confidenceLevel: adjustedConfidence.level,
    operationalState: params.operationalState ?? null,
    expeditionPhase: params.expeditionPhase ?? null,
    primaryCandidate: params.primaryCandidate ?? null,
  }), {
    mode: operatorTrustMode,
    confidenceLevel: adjustedConfidence.level,
  });

  return {
    ...route,
    recommendationConfidence: adjustedConfidence,
    explanation,
    trust,
    orchestrationScore,
    visibility,
  };
}

function baseRouteScore(
  route: EnrichedDiscoveryRoute,
  section: ExploreSectionType,
): number {
  if (section === 'hidden_gem') {
    return (route.gemScore.score * 0.68) + ((route.vehicleFit?.score ?? route.vehicleMatch?.score ?? 0) * 0.32);
  }
  const curatedRoute = route as ExploreRouteWithCurationMetadata;
  const curatedPopularScore =
    curatedRoute.sourceMetadata?.confidenceWeightedScore ??
    curatedRoute.categoryScore ??
    route.gemScore.score;
  return (curatedPopularScore * 0.84) + ((route.vehicleFit?.score ?? route.vehicleMatch?.score ?? 0) * 0.16);
}

function routeAccessDemand(route: EnrichedDiscoveryRoute): string | null {
  const fields = [
    (route as any).accessDifficulty,
    (route as any).difficulty,
    (route as any).trailDifficulty,
    (route as any).terrainDifficultyLabel,
    route.riskPreview?.level,
  ].filter(Boolean).join(' ');
  const text = fields.toLowerCase();
  if (text.includes('technical') || text.includes('difficult')) return 'technical';
  if (text.includes('high') || text.includes('clearance')) return 'high_clearance';
  if (text.includes('moderate')) return 'moderate';
  if (text.includes('easy') || text.includes('low')) return 'easy';
  return null;
}

function vehicleSuitabilityAdjustment(
  route: EnrichedDiscoveryRoute,
  params: ExploreOrchestrationParams,
): number {
  const fit = scoreVehicleSuitabilityForEcs({
    activeVehicleState: params.activeVehicleState ?? getActiveVehicleSnapshotForEcs(),
    accessDemand: routeAccessDemand(route),
    routeDistanceMiles: route.distanceMiles ?? route.distanceFromUserMiles ?? null,
    remotenessScore: route.remotenessScore != null ? route.remotenessScore * 10 : null,
  });
  switch (fit.level) {
    case 'strong':
      return 8;
    case 'workable':
      return 4;
    case 'caution':
      return -8;
    case 'limited':
      return -18;
    case 'unknown':
    default:
      return -4;
  }
}

function confidenceBoost(level: EnrichedDiscoveryRoute['recommendationConfidence']['level']): number {
  switch (level) {
    case 'high':
      return 18;
    case 'moderate':
      return 10;
    case 'limited':
      return -8;
    case 'low':
      return -18;
    case 'unknown':
    default:
      return -24;
  }
}

function phaseAdjustment(
  route: EnrichedDiscoveryRoute,
  section: ExploreSectionType,
  phase: ECSExpeditionPhase | null | undefined,
): number {
  const distance = route.distanceFromUserMiles ?? route.distanceMiles ?? 0;
  const days = route.estimatedDays ?? 1;
  const remoteness = route.remotenessScore ?? 0;

  switch (phase) {
    case 'vehicle_setup':
    case 'staging':
      return distance <= 180 && days <= 2 && (route.vehicleMatch?.score ?? 0) >= 60
        ? 14
        : remoteness >= 8 || days >= 4
          ? -14
          : 0;
    case 'transit':
      return distance <= 140 && days <= 2
        ? 12
        : remoteness >= 8 || days >= 3
          ? -16
          : 0;
    case 'trail_entry':
    case 'active_expedition':
      return distance <= 120
        ? 14
        : remoteness >= 7 && section === 'popular_trail'
          ? -10
          : 4;
    case 'camp_stationary':
      return distance <= 100 && days <= 2
        ? 12
        : days >= 4
          ? -10
          : 0;
    case 'recovery_exit':
      return section === 'popular_trail' && distance <= 140
        ? 10
        : remoteness >= 7 || days > 2
          ? -22
          : -8;
    default:
      return 0;
  }
}

function degradedAdjustment(
  state: ECSOperationalState | null | undefined,
  route: EnrichedDiscoveryRoute,
  section: ExploreSectionType,
): number {
  switch (state) {
    case 'fully_operational':
      return 0;
    case 'offline_capable':
      return section === 'hidden_gem' ? -6 : -4;
    case 'degraded':
      return section === 'hidden_gem' ? -10 : -8;
    case 'limited':
      return section === 'hidden_gem' ? -18 : -12;
    case 'unavailable':
      return route.aiConfidence ? -24 : -16;
    default:
      return 0;
  }
}

function recommendationStatusAdjustment(status: ECSLiveStatusResult | null | undefined): number {
  switch (status?.status) {
    case 'live':
      return 4;
    case 'waiting':
      return -8;
    case 'degraded':
      return -10;
    case 'offline_capable':
      return -6;
    case 'unavailable':
      return -18;
    default:
      return 0;
  }
}

function externalFocusAdjustment(
  primaryCandidate: ECSOrchestratorCandidate | null | undefined,
  confidenceLevel: EnrichedDiscoveryRoute['recommendationConfidence']['level'],
): number {
  const rank = primaryCandidate?.priority?.rank ?? 0;
  const externalFocus = primaryCandidate && primaryCandidate.source !== 'explore' && rank >= 4;
  if (!externalFocus) return 0;

  switch (confidenceLevel) {
    case 'high':
      return -4;
    case 'moderate':
      return -10;
    case 'limited':
      return -18;
    case 'low':
    case 'unknown':
    default:
      return -28;
  }
}

function classifyVisibility(params: {
  route: EnrichedDiscoveryRoute;
  section: ExploreSectionType;
  confidenceLevel: EnrichedDiscoveryRoute['recommendationConfidence']['level'];
  operationalState: ECSOperationalState | null;
  expeditionPhase: ECSExpeditionPhase | null;
  primaryCandidate: ECSOrchestratorCandidate | null;
}): RankedRoute['visibility'] {
  const { route, section, confidenceLevel, operationalState, expeditionPhase, primaryCandidate } = params;
  const remoteness = route.remotenessScore ?? 0;
  const days = route.estimatedDays ?? 1;
  const distance = route.distanceFromUserMiles ?? route.distanceMiles ?? 0;
  const externalFocus = primaryCandidate && primaryCandidate.source !== 'explore' && (primaryCandidate.priority?.rank ?? 0) >= 4;

  if (section === 'hidden_gem' && (route.routeLabel === 'Known Route' || route.routeLabel === 'Local Favorite')) {
    return 'suppressed';
  }

  if (confidenceLevel === 'low' || confidenceLevel === 'unknown') {
    return 'suppressed';
  }

  if (
    section === 'hidden_gem' &&
    confidenceLevel === 'limited' &&
    (operationalState === 'limited' || operationalState === 'unavailable')
  ) {
    return 'suppressed';
  }

  if (
    expeditionPhase === 'recovery_exit' &&
    section === 'hidden_gem' &&
    (remoteness >= 7 || days > 2 || distance > 140)
  ) {
    return 'suppressed';
  }

  if (externalFocus && confidenceLevel === 'limited') {
    return 'softened';
  }

  if (
    operationalState &&
    operationalState !== 'fully_operational' &&
    operationalState !== 'offline_capable'
  ) {
    return confidenceLevel === 'moderate' ? 'softened' : 'surface';
  }

  return confidenceLevel === 'limited' ? 'softened' : 'surface';
}

function buildExploreDrivers(
  route: EnrichedDiscoveryRoute,
  section: ExploreSectionType,
  phase: ECSExpeditionPhase | null | undefined,
): string[] {
  const drivers: string[] = [];

  if (section === 'hidden_gem') {
    const fit = scoreVehicleSuitabilityForEcs({
      accessDemand: routeAccessDemand(route),
      routeDistanceMiles: route.distanceMiles ?? route.distanceFromUserMiles ?? null,
      remotenessScore: route.remotenessScore != null ? route.remotenessScore * 10 : null,
    });
    if (fit.level === 'strong' || fit.level === 'workable') {
      drivers.push(fit.label.toLowerCase());
    } else if (fit.concerns[0]) {
      drivers.push(fit.concerns[0].toLowerCase());
    }
    if (route.gemScore.factors.lowPopularity >= 70 || route.routeLabel === 'Hidden Gem') {
      drivers.push('lower exposure');
    }
    if ((route.vehicleMatch?.score ?? 0) >= 70) {
      drivers.push('strong fit for your configured vehicle');
    }
    if ((route.distanceFromUserMiles ?? route.distanceMiles ?? 0) <= 120) {
      drivers.push('moderate distance');
    }
    if ((route.remotenessScore ?? 0) <= 5) {
      drivers.push('better town access');
    } else if ((route.remotenessScore ?? 0) >= 7) {
      drivers.push('remote setting');
    }
  } else {
    const fit = scoreVehicleSuitabilityForEcs({
      accessDemand: routeAccessDemand(route),
      routeDistanceMiles: route.distanceMiles ?? route.distanceFromUserMiles ?? null,
      remotenessScore: route.remotenessScore != null ? route.remotenessScore * 10 : null,
    });
    if (fit.level === 'strong' || fit.level === 'workable') {
      drivers.push(fit.label.toLowerCase());
    }
    const curatedDrivers = (route as ExploreRouteWithCurationMetadata).sourceMetadata?.rationaleDrivers ?? [];
    if (curatedDrivers.length > 0) {
      drivers.push(...curatedDrivers);
    } else {
      drivers.push('destination-grade trail identity');
      if ((route.vehicleMatch?.score ?? 0) >= 65) {
        drivers.push('good fit for your configured vehicle');
      }
      if ((route.distanceFromUserMiles ?? route.distanceMiles ?? 0) <= 150) {
        drivers.push('practical distance');
      }
    }
  }

  if (phase === 'camp_stationary' && (route.estimatedDays ?? 1) <= 2) {
    drivers.push('next-day friendly planning');
  } else if ((phase === 'vehicle_setup' || phase === 'staging') && (route.riskPreview?.level === 'Low' || route.riskPreview?.level === 'Moderate')) {
    drivers.push('planning-friendly route fit');
  } else if ((phase === 'trail_entry' || phase === 'active_expedition') && (route.distanceFromUserMiles ?? route.distanceMiles ?? 0) <= 120) {
    drivers.push('locally relevant option');
  }

  return Array.from(new Set(drivers)).slice(0, 3);
}

function buildSectionSummaryNote(
  params: ExploreOrchestrationParams,
  surfacedCount: number,
  softenedCount: number,
  suppressedCount: number,
): string | null {
  const rank = params.primaryCandidate?.priority?.rank ?? 0;
  const externalFocus = params.primaryCandidate && params.primaryCandidate.source !== 'explore' && rank >= 4;

  if (externalFocus) {
    return `${params.primaryCandidate?.title ?? 'Another command surface'} is the current command focus, so weaker Explore picks are held back.`;
  }

  if (params.recommendationStatus?.shortReason) {
    return params.recommendationStatus.shortReason;
  }

  switch (params.operationalState) {
    case 'offline_capable':
      return 'Offline map and local route data remain usable; cloud-backed recommendation certainty is softened.';
    case 'degraded':
      return 'Estimated from partial data where signal, weather freshness, or live systems are reduced.';
    case 'limited':
      return 'Limited guidance: only stronger locally supported route picks remain surfaced.';
    case 'unavailable':
      return 'Explore is holding only routes with enough local support to avoid false certainty.';
    default:
      break;
  }

  if (suppressedCount > 0 && surfacedCount > 0) {
    return `${suppressedCount} weaker recommendation${suppressedCount === 1 ? '' : 's'} were held back to keep this section curated.`;
  }

  if (softenedCount > 0) {
    return `${softenedCount} route${softenedCount === 1 ? '' : 's'} are shown with softened confidence because signal quality is partial.`;
  }

  return null;
}
