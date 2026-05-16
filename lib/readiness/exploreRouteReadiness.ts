import type { AIGeneratedRoute } from '../aiRouteTypes';
import type { ExpeditionOpportunity } from '../discoverEngine';
import type { EnrichedDiscoveryRoute } from '../discoveryIntelligenceEngine';
import { normalizeExploreRoutePreview } from '../exploreRoutePreview';
import { getActiveVehicleState } from '../fleet/activeVehicleState';
import { buildExpeditionReadiness, getTopReadinessConcerns } from './expeditionReadinessScoring';
import { buildReadinessVehicleInputFromFleetState } from './fleetReadinessAdapter';
import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessCategory,
  ExpeditionReadinessConfidence,
  ExpeditionReadinessInput,
  ExpeditionReadinessRouteInput,
  ExpeditionReadinessVehicleInput,
  ExpeditionReadinessSourceKind,
  ExpeditionTripIntent,
  ExpeditionTripIntentSource,
} from './expeditionReadinessTypes';

export type ExploreReadinessRoute = ExpeditionOpportunity | EnrichedDiscoveryRoute | AIGeneratedRoute;

export type ExploreRouteReadinessOptions = {
  hasVehicle?: boolean;
  activeVehicle?: ExpeditionReadinessVehicleInput | null;
  capturedAt?: string;
  tripIntent?: ExpeditionTripIntent | null;
  tripIntentSource?: ExpeditionTripIntentSource | null;
};

export type ExploreRouteReadinessSummary = {
  decisionLabel: string;
  routeConfidenceLabel: string;
  vehicleFitLabel: string;
  campConfidenceLabel: string | null;
  concern: string | null;
  hasLimitedRouteData: boolean;
};

function isEnrichedRoute(route: ExploreReadinessRoute): route is EnrichedDiscoveryRoute {
  return typeof (route as EnrichedDiscoveryRoute).routeLabel === 'string';
}

function isAIRoute(route: ExploreReadinessRoute): route is AIGeneratedRoute {
  return (route as AIGeneratedRoute).isAIGenerated === true;
}

function getNow(capturedAt?: string): string {
  return capturedAt ?? new Date().toISOString();
}

function mapTerrainDifficulty(route: ExploreReadinessRoute): ExpeditionReadinessRouteInput['difficulty'] {
  const difficulty = Number(route.terrainDifficulty);
  if (!Number.isFinite(difficulty)) return 'unknown';
  if (difficulty <= 3) return 'easy';
  if (difficulty <= 5) return 'moderate';
  if (difficulty <= 7) return 'hard';
  return 'technical';
}

function mapRouteRisk(route: ExploreReadinessRoute): ExpeditionReadinessRouteInput['riskLevel'] {
  const riskLevel = isEnrichedRoute(route) ? route.riskPreview?.level?.toLowerCase() : null;
  if (riskLevel?.includes('critical')) return 'critical';
  if (riskLevel?.includes('high')) return 'high';
  if (riskLevel?.includes('moderate') || riskLevel?.includes('medium')) return 'moderate';
  if (riskLevel?.includes('low')) return 'low';

  const difficulty = Number(route.terrainDifficulty);
  const remoteness = Number(route.remotenessScore);
  if (Number.isFinite(difficulty) && difficulty >= 8) return 'high';
  if (Number.isFinite(remoteness) && remoteness >= 8) return 'moderate';
  if (Number.isFinite(difficulty) && difficulty <= 3 && Number.isFinite(remoteness) && remoteness <= 4) return 'low';
  return 'unknown';
}

function confidenceFromRoute(route: ExploreReadinessRoute, hasRouteData: boolean): ExpeditionReadinessConfidence {
  if (!hasRouteData) return 'low';
  if (isAIRoute(route)) {
    if (route.confidence === 'high') return 'medium';
    if (route.confidence === 'good') return 'medium';
    return 'low';
  }
  if (isEnrichedRoute(route)) {
    const level = route.recommendationConfidence?.level;
    if (level === 'high') return 'high';
    if (level === 'moderate') return 'medium';
  }
  return 'medium';
}

function confidenceFromScore(score: number | null | undefined): ExpeditionReadinessConfidence {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'low';
  if (score >= 82) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

function sourceForRoute(route: ExploreReadinessRoute): ExpeditionReadinessSourceKind {
  if (isAIRoute(route)) return 'inferred';
  if (isEnrichedRoute(route) && route.isAIGenerated) return 'inferred';
  return 'cached';
}

function resolveExploreVehicleInput(options: ExploreRouteReadinessOptions): ExpeditionReadinessVehicleInput | null {
  if (options.activeVehicle !== undefined) return options.activeVehicle;
  if (!options.hasVehicle) return null;
  return buildReadinessVehicleInputFromFleetState(getActiveVehicleState());
}

function getRoutePreviewFlags(route: ExploreReadinessRoute): {
  hasRouteData: boolean;
  hasFullGeometry: boolean;
  previewUnavailableReason: string | null;
} {
  try {
    const preview = normalizeExploreRoutePreview(route, null);
    return {
      hasRouteData: preview.hasRouteData,
      hasFullGeometry: preview.hasFullGeometry,
      previewUnavailableReason: preview.previewUnavailableReason,
    };
  } catch {
    return {
      hasRouteData: false,
      hasFullGeometry: false,
      previewUnavailableReason: 'Route preview unavailable because route coordinates are missing.',
    };
  }
}

function getRouteRecommendationConfidenceScore(route: ExploreReadinessRoute): number | null {
  if (isEnrichedRoute(route)) {
    const score = route.recommendationConfidence?.score;
    return typeof score === 'number' && Number.isFinite(score) ? score : null;
  }

  if (isAIRoute(route)) {
    if (route.confidence === 'high') return 78;
    if (route.confidence === 'good') return 70;
    return null;
  }

  const score = Number((route as ExploreReadinessRoute & { matchScore?: number }).matchScore);
  return Number.isFinite(score) ? score : null;
}

function getRouteConfidenceLabel(
  route: ExploreReadinessRoute,
  routeRisk: ExpeditionReadinessCategory | undefined,
): string {
  const score = getRouteRecommendationConfidenceScore(route);
  if (typeof score === 'number') {
    if (score >= 80) return 'High';
    if (score >= 70) return 'Medium';
    if (score >= 55) return 'Caution';
    return 'Limited';
  }

  return routeRisk?.confidence === 'high'
    ? 'High'
    : routeRisk?.confidence === 'medium'
      ? 'Medium'
      : 'Limited';
}

function getRouteDataConcern(
  route: ExploreReadinessRoute,
  preview: ReturnType<typeof getRoutePreviewFlags>,
): string | null {
  const score = getRouteRecommendationConfidenceScore(route);
  const highConfidence = typeof score === 'number' && score >= 80;
  const mediumOrBetterConfidence = typeof score === 'number' && score >= 70;

  if (!preview.hasRouteData) {
    if (highConfidence || mediumOrBetterConfidence) {
      return 'Route preview geometry is missing; verify the exact path before building guidance.';
    }
    return 'Route geometry unavailable; confidence is limited until route path data is added.';
  }

  if (!preview.hasFullGeometry) {
    return 'Route line is based on available endpoints or waypoints; verify the exact track before departure.';
  }

  return null;
}

function buildHazards(route: ExploreReadinessRoute, hasRouteData: boolean, hasFullGeometry: boolean): string[] {
  const hazards: string[] = [];
  const score = getRouteRecommendationConfidenceScore(route);
  const highConfidence = typeof score === 'number' && score >= 80;
  if (!hasRouteData) hazards.push('Insufficient route geometry');
  else if (!hasFullGeometry && !highConfidence) hazards.push('Estimated route preview line');
  if (route.permitRequired) hazards.push('Permit or agency review required');
  const cautionNotes = (route as AIGeneratedRoute).cautionNotes;
  if (typeof cautionNotes === 'string' && cautionNotes.trim()) hazards.push(cautionNotes.trim());
  if (isEnrichedRoute(route)) {
    route.riskPreview?.factors?.slice(0, 2).forEach((factor) => {
      if (factor && !hazards.includes(factor)) hazards.push(factor);
    });
  }
  return hazards.slice(0, 4);
}

export function buildExploreRouteReadinessRouteInput(
  route: ExploreReadinessRoute,
  options: ExploreRouteReadinessOptions = {},
): ExpeditionReadinessRouteInput {
  const now = getNow(options.capturedAt);
  const preview = getRoutePreviewFlags(route);
  return {
    routeId: route.id,
    name: route.name,
    distanceMiles: Number.isFinite(Number(route.distanceMiles)) ? Number(route.distanceMiles) : null,
    difficulty: mapTerrainDifficulty(route),
    riskLevel: mapRouteRisk(route),
    routeConfidence: confidenceFromRoute(route, preview.hasRouteData),
    knownHazards: buildHazards(route, preview.hasRouteData, preview.hasFullGeometry),
    closureKnown: null,
    passabilityConfidence: preview.hasRouteData ? confidenceFromRoute(route, preview.hasFullGeometry) : 'low',
    source: sourceForRoute(route),
    updatedAt: now,
    isStale: false,
    isInferred: sourceForRoute(route) === 'inferred',
  };
}

export function isExploreRouteCampingRelevant(route: ExploreReadinessRoute): boolean {
  return (
    Number(route.estimatedDays) > 1 ||
    Number(route.suggestedCamps) > 0 ||
    Number(route.campingPotentialScore) > 0 ||
    typeof (route as AIGeneratedRoute).campSuitability === 'string'
  );
}

export function buildExploreRouteReadinessInput(
  route: ExploreReadinessRoute,
  options: ExploreRouteReadinessOptions = {},
): ExpeditionReadinessInput {
  const now = getNow(options.capturedAt);
  const preview = getRoutePreviewFlags(route);
  const vehicleScore = isEnrichedRoute(route)
    ? route.vehicleMatch?.score
    : route.rigCompatibility ?? route.matchScore;
  const campingRelevant = isExploreRouteCampingRelevant(route);
  const source = sourceForRoute(route);
  const activeVehicle = resolveExploreVehicleInput(options);
  const fallbackVehicle: ExpeditionReadinessVehicleInput | null = options.hasVehicle
    ? {
        vehicleId: 'explore-active-vehicle',
        label: 'Active vehicle',
        profileComplete: typeof vehicleScore === 'number' ? vehicleScore >= 60 : false,
        disabled: false,
        gvwrUsagePct: null,
        payloadRemainingLbs: null,
        clearanceConcern: Number(route.terrainDifficulty) >= 8 || (typeof vehicleScore === 'number' && vehicleScore < 55),
        vehicleFitConfidence: confidenceFromScore(vehicleScore),
        source: 'inferred',
        updatedAt: now,
        isInferred: true,
        missingSpecs: ['Fleet vehicle details unavailable to Explore preview'],
      }
    : null;

  return {
    capturedAt: now,
    tripIntent: options.tripIntent ?? null,
    tripIntentSource: options.tripIntentSource ?? null,
    route: buildExploreRouteReadinessRouteInput(route, { ...options, capturedAt: now }),
    activeVehicle: activeVehicle ?? fallbackVehicle,
    weather: null,
    daylight: null,
    offline: null,
    campCandidates: campingRelevant
      ? [{
          id: `${route.id}-camp-confidence`,
          name: `${route.name} camp access confidence`,
          legalAccessConfidence: 'unknown',
          officialConfirmation: false,
          accessStatus: route.permitRequired ? 'permit_required' : 'unknown',
          suitabilityScore: Number.isFinite(Number(route.campingPotentialScore))
            ? Number(route.campingPotentialScore)
            : Number.isFinite(Number(route.suggestedCamps)) && Number(route.suggestedCamps) > 0
              ? 58
              : null,
          source: 'inferred',
          updatedAt: now,
          isInferred: true,
        }]
      : null,
    fuel: {
      rangeRemainingMiles: null,
      routeDistanceRemainingMiles: Number.isFinite(Number(route.distanceMiles)) ? Number(route.distanceMiles) : null,
      reserveMiles: null,
      fuelPercent: null,
      source,
      updatedAt: now,
      isInferred: source === 'inferred',
    },
    power: null,
    recovery: {
      bailoutRoutesAvailable: null,
      nearestExitMiles: null,
      recoveryGearReady: null,
      recoveryAccessConfidence: preview.hasRouteData && Number(route.remotenessScore) < 8 ? 'medium' : 'low',
      source: 'inferred',
      updatedAt: now,
      isInferred: true,
    },
    communications: {
      signalConfidence: Number(route.remotenessScore) >= 8 ? 'low' : Number(route.remotenessScore) >= 5 ? 'medium' : 'high',
      satelliteCommsReady: null,
      teamCheckInPlanReady: null,
      cellularExpected: null,
      source: 'inferred',
      updatedAt: now,
      isInferred: true,
    },
    telemetry: null,
    currentLocation: null,
  };
}

export function buildExploreRouteReadinessStorePatch(
  route: ExploreReadinessRoute,
  options: ExploreRouteReadinessOptions = {},
): ExpeditionReadinessInput {
  const now = getNow(options.capturedAt);
  const input = buildExploreRouteReadinessInput(route, { ...options, capturedAt: now });
  return {
    capturedAt: now,
    route: input.route,
    campCandidates: input.campCandidates,
    recovery: input.recovery,
    communications: input.communications,
    fuel: input.fuel,
  };
}

export function buildExploreRouteReadinessAssessment(
  route: ExploreReadinessRoute,
  options: ExploreRouteReadinessOptions = {},
): ExpeditionReadinessAssessment {
  return buildExpeditionReadiness(buildExploreRouteReadinessInput(route, options));
}

function categoryLabelFromScore(score: number | null | undefined, missingLabel: string): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return missingLabel;
  if (score >= 82) return 'Strong';
  if (score >= 60) return 'Caution';
  return 'Limited';
}

export function getExploreRouteReadinessSummary(
  assessment: ExpeditionReadinessAssessment,
  route: ExploreReadinessRoute,
  options: ExploreRouteReadinessOptions = {},
): ExploreRouteReadinessSummary {
  const category = (id: string) => assessment.categories.find((item) => item.id === id);
  const vehicle = category('vehicle_fit');
  const camp = category('camp_legality_confidence');
  const routeRisk = category('route_risk');
  const preview = getRoutePreviewFlags(route);
  const routeDataConcern = getRouteDataConcern(route, preview);
  const topConcern =
    assessment.blockers[0]?.detail ??
    assessment.warnings[0]?.detail ??
    getTopReadinessConcerns(assessment, 1)[0]?.summary ??
    null;

  return {
    decisionLabel:
      assessment.status === 'ready'
        ? 'Ready'
        : assessment.status === 'caution'
          ? 'Caution'
          : 'Hold',
    routeConfidenceLabel: getRouteConfidenceLabel(route, routeRisk),
    vehicleFitLabel: options.hasVehicle
      ? categoryLabelFromScore(vehicle?.score, 'Limited')
      : 'Select vehicle for personalized readiness',
    campConfidenceLabel: isExploreRouteCampingRelevant(route)
      ? categoryLabelFromScore(camp?.score, 'Limited')
      : null,
    concern: routeDataConcern
      ? routeDataConcern
      : !options.hasVehicle
        ? 'Select vehicle for personalized readiness.'
        : topConcern,
    hasLimitedRouteData: !preview.hasRouteData,
  };
}
