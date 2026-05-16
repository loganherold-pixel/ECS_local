import type {
  CampCandidate,
  CampCandidateEnrichment,
  CampOpsConfidence,
  CampOpsDecisionPoint,
  CampOpsDecisionPointKind,
  CampOpsGeoPoint,
  CampRecommendationSet,
  CampSearchContext,
} from './campOpsTypes';
import { createEmptyCampRecommendationSet } from './campOpsTypes';
import type { CampOpsHardGateConfig } from './campOpsHardGateConfig';
import {
  evaluateCampHardGateCandidates,
  type CampHardGateCandidateEvaluation,
} from './campOpsHardGates';
import {
  type CampOpsRecommendationConfig,
  type CampOpsRecommendationRolloutConfig,
  getCampOpsFeatureState,
} from './campOpsRecommendationConfig';
import { generateCampRecommendationSet } from './campOpsRecommendations';
import type { CampOpsResourceDebtConfig } from './campOpsResourceDebtConfig';
import { attachCampResourceDebt } from './campOpsResourceDebt';
import type { CampOpsScoringConfigOverrides } from './campOpsScoringConfig';
import {
  rankCampSuitabilityCandidates,
  type CampSuitabilityScoreResult,
} from './campOpsScoring';
import { emitCampOpsEndpointRecommendationGenerated } from './campOpsTelemetry';

export type CampOpsSafeEndPointDelayPreset =
  | 'no_delay'
  | 'delay_30m'
  | 'delay_1h'
  | 'delay_2h';

export type CampOpsSafeEndPointDelayScenario =
  | CampOpsSafeEndPointDelayPreset
  | {
      kind: 'custom';
      minutes: number;
      label?: string;
    };

export type CampOpsSafeEndPointDecisionSummary = {
  status: 'disabled' | 'recommended' | 'no_safe_endpoint' | 'unknown';
  delayEstimateMinutes: number;
  recommendedSafeEndpoint: CampCandidate | null;
  backupEndpoint: CampCandidate | null;
  emergencyEndpoint: CampCandidate | null;
  plannedCampDowngradeReason: string | null;
  decisionDeadlineIso: string | null;
  decisionPoint: CampOpsDecisionPoint | null;
  noDecisionPointReason: string | null;
  keyRisks: string[];
  nextAction: string;
};

export type CampOpsSafeEndPointResult = {
  enabled: boolean;
  scenario: CampOpsSafeEndPointDelayScenario;
  context: CampSearchContext;
  recommendationSet: CampRecommendationSet;
  decisionSummary: CampOpsSafeEndPointDecisionSummary;
};

export type CampOpsFindSafeEndPointInput = {
  /** @deprecated Use rolloutConfig.campopsEndpointRecommendationEnabled. This shortcut no longer enables CampOps. */
  enabled?: boolean | null;
  rolloutConfig?: Partial<CampOpsRecommendationRolloutConfig> | null;
  context?: Partial<CampSearchContext> | null;
  currentLocation?: CampSearchContext['currentLocation'];
  delayEstimateMinutes?: number | null;
  currentRouteDelayMinutes?: number | null;
  delayScenario?: CampOpsSafeEndPointDelayScenario | null;
  desiredArrivalWindow?: CampSearchContext['desiredArrivalWindow'];
  beforeSunset?: boolean | null;
  candidates: CampCandidate[];
  enrichmentsByCandidateId: Record<string, CampCandidateEnrichment | undefined>;
  hardGateConfig?: Partial<CampOpsHardGateConfig> | null;
  scoringConfig?: CampOpsScoringConfigOverrides | null;
  recommendationConfig?: Partial<CampOpsRecommendationConfig> | null;
  resourceDebtConfig?: Partial<CampOpsResourceDebtConfig> | null;
};

export const CAMP_OPS_SAFE_ENDPOINT_DELAY_PRESETS: Record<CampOpsSafeEndPointDelayPreset, number> = {
  no_delay: 0,
  delay_30m: 30,
  delay_1h: 60,
  delay_2h: 120,
};

function finiteMinutes(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.round(numberValue)) : null;
}

function delayScenarioMinutes(scenario: CampOpsSafeEndPointDelayScenario | null | undefined): number | null {
  if (!scenario) return null;
  if (typeof scenario === 'string') return CAMP_OPS_SAFE_ENDPOINT_DELAY_PRESETS[scenario];
  return finiteMinutes(scenario.minutes);
}

function delayScenarioFromMinutes(minutes: number): CampOpsSafeEndPointDelayScenario {
  const preset = Object.entries(CAMP_OPS_SAFE_ENDPOINT_DELAY_PRESETS).find(([, value]) => value === minutes)?.[0];
  return (preset as CampOpsSafeEndPointDelayPreset | undefined) ?? { kind: 'custom', minutes };
}

function resolveDelayMinutes(input: CampOpsFindSafeEndPointInput): number {
  return (
    delayScenarioMinutes(input.delayScenario) ??
    finiteMinutes(input.delayEstimateMinutes) ??
    finiteMinutes(input.context?.delayEstimateMinutes) ??
    finiteMinutes(input.currentRouteDelayMinutes) ??
    0
  );
}

function isEnabled(input: CampOpsFindSafeEndPointInput): boolean {
  return getCampOpsFeatureState(input.rolloutConfig ?? {}).endpointRecommendationEnabled;
}

function isDecisionPointEnabled(input: CampOpsFindSafeEndPointInput): boolean {
  return getCampOpsFeatureState(input.rolloutConfig ?? {}).decisionPointsEnabled;
}

function addMinutes(iso: string | null | undefined, minutes: number): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + minutes * 60_000).toISOString();
}

function minutesBetween(startIso: string | null | undefined, endIso: string | null | undefined): number | null {
  if (!startIso || !endIso) return null;
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.round((endMs - startMs) / 60_000);
}

function earlierIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (!Number.isFinite(aMs)) return b;
  if (!Number.isFinite(bMs)) return a;
  return aMs <= bMs ? a : b;
}

function safeArrivalDeadline(context: CampSearchContext): string | null {
  return (
    context.desiredArrivalWindow?.latestAcceptableIso ??
    context.desiredArrivalWindow?.endIso ??
    context.daylightInfo?.civilTwilightEndIso ??
    context.daylightInfo?.sunsetIso ??
    null
  );
}

function arrivesAfter(valueIso: string | null | undefined, limitIso: string | null | undefined): boolean {
  if (!valueIso || !limitIso) return false;
  const valueMs = Date.parse(valueIso);
  const limitMs = Date.parse(limitIso);
  return Number.isFinite(valueMs) && Number.isFinite(limitMs) && valueMs > limitMs;
}

function contextWithDelay(input: CampOpsFindSafeEndPointInput, delayMinutes: number): CampSearchContext {
  const base = input.context ?? {};
  const currentTimeIso = base.currentTimeIso ?? new Date().toISOString();
  const daylightInfo = base.daylightInfo ?? null;
  const desiredWindow = input.desiredArrivalWindow ?? base.desiredArrivalWindow ?? null;
  const sunsetLimit = input.beforeSunset
    ? daylightInfo?.sunsetIso ?? daylightInfo?.civilTwilightEndIso ?? null
    : null;
  const latestAcceptableIso = earlierIso(
    desiredWindow?.latestAcceptableIso ?? desiredWindow?.endIso ?? null,
    sunsetLimit,
  );
  return {
    id: base.id ?? 'campops-find-safe-endpoint',
    currentLocation: input.currentLocation ?? base.currentLocation,
    routeId: base.routeId ?? null,
    tripId: base.tripId ?? null,
    plannedCampId: base.plannedCampId ?? null,
    currentTimeIso,
    desiredArrivalWindow: desiredWindow || latestAcceptableIso
      ? {
          ...(desiredWindow ?? {}),
          latestAcceptableIso,
        }
      : null,
    daylightInfo,
    vehicleProfile: base.vehicleProfile ?? null,
    convoyProfile: base.convoyProfile ?? null,
    resourceState: base.resourceState ?? null,
    userCampPreferences: base.userCampPreferences ?? null,
    riskTolerance: base.riskTolerance ?? 'balanced',
    offlineMode: base.offlineMode ?? 'unknown',
    delayEstimateMinutes: delayMinutes,
    routeProgress: base.routeProgress ?? null,
  };
}

function lateArrivalRiskForDelay(
  context: CampSearchContext,
  enrichment: CampCandidateEnrichment,
): CampCandidateEnrichment['lateArrivalRisk'] {
  const deadline = safeArrivalDeadline(context);
  const afterDeadline = arrivesAfter(enrichment.etaIso, deadline);
  const afterSunset = arrivesAfter(enrichment.etaIso, context.daylightInfo?.sunsetIso);
  if (afterSunset || (afterDeadline && (context.delayEstimateMinutes ?? 0) >= 120)) return 'critical';
  if (afterDeadline) return 'caution';
  if (enrichment.sunsetMarginMinutes != null && enrichment.sunsetMarginMinutes < 0) return 'critical';
  if (enrichment.sunsetMarginMinutes != null && enrichment.sunsetMarginMinutes < 30) return 'caution';
  return enrichment.lateArrivalRisk === 'critical' ? 'caution' : enrichment.lateArrivalRisk;
}

function applyDelayToEnrichment(
  context: CampSearchContext,
  candidate: CampCandidate,
  enrichment: CampCandidateEnrichment | undefined,
  delayMinutes: number,
  resourceDebtConfig?: Partial<CampOpsResourceDebtConfig> | null,
): CampCandidateEnrichment | undefined {
  if (!enrichment) return undefined;
  const etaIso = addMinutes(enrichment.etaIso, delayMinutes);
  const sunsetMarginMinutes =
    etaIso && context.daylightInfo?.sunsetIso
      ? minutesBetween(etaIso, context.daylightInfo.sunsetIso)
      : enrichment.sunsetMarginMinutes == null
        ? null
        : enrichment.sunsetMarginMinutes - delayMinutes;
  const delayed: CampCandidateEnrichment = {
    ...enrichment,
    etaIso,
    etaMinutesFromNow:
      enrichment.etaMinutesFromNow == null ? null : enrichment.etaMinutesFromNow + delayMinutes,
    sunsetMarginMinutes,
  };
  delayed.lateArrivalRisk = lateArrivalRiskForDelay(context, delayed);
  return attachCampResourceDebt({
    context,
    candidate,
    enrichment: delayed,
    config: resourceDebtConfig ?? {},
  });
}

function delayedEnrichments(
  context: CampSearchContext,
  candidates: CampCandidate[],
  enrichmentsByCandidateId: Record<string, CampCandidateEnrichment | undefined>,
  delayMinutes: number,
  resourceDebtConfig?: Partial<CampOpsResourceDebtConfig> | null,
): Record<string, CampCandidateEnrichment | undefined> {
  const output: Record<string, CampCandidateEnrichment | undefined> = {};
  for (const candidate of candidates) {
    output[candidate.id] = applyDelayToEnrichment(
      context,
      candidate,
      enrichmentsByCandidateId[candidate.id],
      delayMinutes,
      resourceDebtConfig,
    );
  }
  return output;
}

function buildRecommendationSet(
  context: CampSearchContext,
  candidates: CampCandidate[],
  enrichmentsByCandidateId: Record<string, CampCandidateEnrichment | undefined>,
  input: CampOpsFindSafeEndPointInput,
): CampRecommendationSet {
  const hardGateEvaluations = evaluateCampHardGateCandidates({
    context,
    candidates,
    enrichmentsByCandidateId,
    config: input.hardGateConfig ?? {},
  });
  const hardGateEvaluationsByCandidateId: Record<string, CampHardGateCandidateEvaluation> = {};
  hardGateEvaluations.forEach((evaluation) => {
    hardGateEvaluationsByCandidateId[evaluation.candidate.id] = evaluation;
  });
  const scores = rankCampSuitabilityCandidates({
    context,
    candidates,
    enrichmentsByCandidateId,
    hardGateEvaluationsByCandidateId,
    config: input.scoringConfig ?? {},
  });
  const suitabilityScoresByCandidateId: Record<string, CampSuitabilityScoreResult> = {};
  scores.forEach((score) => {
    suitabilityScoresByCandidateId[score.candidate.id] = score;
  });
  return generateCampRecommendationSet({
    context,
    candidates,
    enrichmentsByCandidateId,
    hardGateEvaluationsByCandidateId,
    suitabilityScoresByCandidateId,
    config: input.recommendationConfig ?? {},
  });
}

function keyRisks(set: CampRecommendationSet): string[] {
  return Array.from(new Set([
    ...(set.warnings ?? []),
    ...(set.explanations?.plannedCampDowngrade ? [set.explanations.plannedCampDowngrade] : []),
    ...set.rejectedCandidates.flatMap((candidate) => candidate.reasons),
    ...set.confidenceSummary.missingDataFields.map((field) => `${field} is missing or unresolved.`),
  ])).slice(0, 6);
}

function hasRouteDecisionData(context: CampSearchContext): boolean {
  const progress = context.routeProgress;
  return Boolean(
    progress?.currentSegmentLabel ||
    progress?.routeMileMarker != null ||
    progress?.latestTurnoffMileMarker != null ||
    progress?.latestTurnoffLocation ||
    progress?.lastTrailerTurnaroundMileMarker != null ||
    progress?.lastTrailerTurnaroundLocation ||
    progress?.nextResupplyMileMarker != null ||
    progress?.nextResupplyLocation ||
    progress?.nextLegalBoundaryMileMarker != null ||
    progress?.nextLegalBoundaryLocation ||
    context.currentLocation?.value,
  );
}

function confidenceForDecisionPoint(context: CampSearchContext, set: CampRecommendationSet): CampOpsConfidence {
  if (!hasRouteDecisionData(context)) return 'unknown';
  if (context.routeProgress?.confidence === 'low' || set.confidenceSummary.level === 'low') return 'low';
  if (context.routeProgress?.confidence === 'high' && set.confidenceSummary.level === 'high') return 'high';
  return 'medium';
}

function optionFor(candidate: CampCandidate | null, enrichment: CampCandidateEnrichment | undefined, fallbackLabel: string): CampOpsDecisionPoint['continueOption'] {
  if (!candidate) return null;
  return {
    campId: candidate.id,
    label: candidate.name || fallbackLabel,
    etaIso: enrichment?.etaIso ?? null,
    summary: `${candidate.name || fallbackLabel} remains the ${fallbackLabel.toLowerCase()} option in the current CampOps set.`,
  };
}

function plannedCandidate(context: CampSearchContext, set: CampRecommendationSet): CampCandidate | null {
  const plannedId = context.plannedCampId;
  if (!plannedId) return null;
  const allCandidates = [
    set.recommendedCamp,
    set.backupCamp,
    set.emergencyCamp,
    set.weatherFallbackCamp ?? null,
    set.resupplyCamp ?? null,
    set.trailerSafeCamp ?? null,
    ...set.rejectedCandidates.map((item) => item.candidate),
  ].filter((candidate): candidate is CampCandidate => Boolean(candidate));
  return allCandidates.find((candidate) => candidate.id === plannedId) ?? null;
}

function routeLocationForKind(context: CampSearchContext, kind: CampOpsDecisionPointKind): {
  location: CampOpsGeoPoint | null;
  routeMileMarker: number | null;
  label: string | null;
  distanceMiles: number | null;
} {
  const progress = context.routeProgress;
  if (kind === 'trailer_turnaround') {
    return {
      location: progress?.lastTrailerTurnaroundLocation ?? progress?.latestTurnoffLocation ?? context.currentLocation?.value ?? null,
      routeMileMarker: progress?.lastTrailerTurnaroundMileMarker ?? progress?.latestTurnoffMileMarker ?? progress?.routeMileMarker ?? null,
      label: progress?.lastTrailerTurnaroundLabel ?? progress?.latestTurnoffLabel ?? progress?.currentSegmentLabel ?? null,
      distanceMiles: progress?.lastTrailerTurnaroundDistanceMiles ?? progress?.latestTurnoffDistanceMiles ?? null,
    };
  }
  if (kind === 'resupply') {
    return {
      location: progress?.nextResupplyLocation ?? progress?.latestTurnoffLocation ?? context.currentLocation?.value ?? null,
      routeMileMarker: progress?.nextResupplyMileMarker ?? progress?.latestTurnoffMileMarker ?? progress?.routeMileMarker ?? null,
      label: progress?.nextResupplyLabel ?? progress?.latestTurnoffLabel ?? progress?.currentSegmentLabel ?? null,
      distanceMiles: progress?.nextResupplyDistanceMiles ?? progress?.latestTurnoffDistanceMiles ?? null,
    };
  }
  if (kind === 'legal_boundary') {
    return {
      location: progress?.nextLegalBoundaryLocation ?? progress?.latestTurnoffLocation ?? context.currentLocation?.value ?? null,
      routeMileMarker: progress?.nextLegalBoundaryMileMarker ?? progress?.latestTurnoffMileMarker ?? progress?.routeMileMarker ?? null,
      label: progress?.nextLegalBoundaryLabel ?? progress?.latestTurnoffLabel ?? progress?.currentSegmentLabel ?? null,
      distanceMiles: progress?.nextLegalBoundaryDistanceMiles ?? progress?.latestTurnoffDistanceMiles ?? null,
    };
  }
  return {
    location: progress?.nextDecisionLocation ?? progress?.latestTurnoffLocation ?? context.currentLocation?.value ?? null,
    routeMileMarker: progress?.latestTurnoffMileMarker ?? progress?.routeMileMarker ?? null,
    label: progress?.latestTurnoffLabel ?? progress?.currentSegmentLabel ?? null,
    distanceMiles: progress?.latestTurnoffDistanceMiles ?? null,
  };
}

function deadlineForTurnoff(context: CampSearchContext, distanceMiles: number | null | undefined): string | null {
  if (distanceMiles == null || distanceMiles < 0) return null;
  const remainingDistance = context.routeProgress?.distanceRemainingMiles;
  const remainingMinutes = context.routeProgress?.driveTimeRemainingMinutes;
  if (remainingDistance == null || remainingDistance <= 0 || remainingMinutes == null || remainingMinutes <= 0) {
    return null;
  }
  const minutesToTurnoff = Math.max(0, Math.round((distanceMiles / remainingDistance) * remainingMinutes));
  return addMinutes(context.currentTimeIso, minutesToTurnoff);
}

function decisionKind(context: CampSearchContext, set: CampRecommendationSet): CampOpsDecisionPointKind {
  const recommended = set.recommendedCamp;
  const recommendedEnrichment = recommended ? set.enrichmentsByCandidateId?.[recommended.id] : undefined;
  const planned = plannedCandidate(context, set);
  const plannedEnrichment = planned ? set.enrichmentsByCandidateId?.[planned.id] : undefined;
  const fuelDebt = recommendedEnrichment?.resourceDebt?.fuel?.status;
  const waterDebt = recommendedEnrichment?.resourceDebt?.water?.status;
  if (context.vehicleProfile?.trailerAttached || (context.convoyProfile?.trailerCount ?? 0) > 0) {
    if (plannedEnrichment?.trailerSuitability === 'not_fit' || recommendedEnrichment?.trailerSuitability === 'fit') {
      return 'trailer_turnaround';
    }
  }
  if (
    set.explanations?.plannedCampDowngrade ||
    plannedEnrichment?.lateArrivalRisk === 'critical' ||
    plannedEnrichment?.sunsetMarginMinutes != null && plannedEnrichment.sunsetMarginMinutes < 30
  ) {
    return 'before_dark';
  }
  if (fuelDebt === 'critical' || fuelDebt === 'tight' || waterDebt === 'critical' || waterDebt === 'tight' || set.resupplyCamp?.id === recommended?.id) {
    return 'resupply';
  }
  if (
    set.rejectedCandidates.some((item) =>
      item.gates.some((gate) => gate.gateId.includes('legal') || gate.gateId.includes('closure') || gate.gateId.includes('access')),
    )
  ) {
    return 'legal_boundary';
  }
  if (recommendedEnrichment?.accessDifficulty === 'technical' || recommendedEnrichment?.accessDifficulty === 'high_clearance') return 'technical_section';
  return 'unknown';
}

function reasonForDecisionKind(kind: CampOpsDecisionPointKind, context: CampSearchContext, set: CampRecommendationSet): string {
  if (kind === 'trailer_turnaround') return 'Trailer context requires choosing before the last known turnaround or narrow approach.';
  if (kind === 'resupply') return 'Fuel or water margin makes the next resupply opportunity operationally important.';
  if (kind === 'before_dark') return 'Delay and arrival window make the last reasonable camp before dark the decision point.';
  if (kind === 'legal_boundary') return 'Legal, closure, or access uncertainty changes after the next boundary.';
  if (kind === 'technical_section') return 'The route is approaching a more technical section with fewer practical diversion options.';
  return set.explanations?.plannedCampDowngrade ?? 'CampOps has enough route context to identify a continue-or-divert decision.';
}

function riskIfContinues(kind: CampOpsDecisionPointKind): string {
  if (kind === 'trailer_turnaround') return 'Continuing can leave the trailer committed past the last known turnaround.';
  if (kind === 'resupply') return 'Continuing can reduce fuel or water margin before the next reliable exit or service.';
  if (kind === 'before_dark') return 'Continuing can push final approach after the recommended arrival window.';
  if (kind === 'legal_boundary') return 'Continuing can move the route into restricted or unresolved access context.';
  if (kind === 'technical_section') return 'Continuing can reduce practical options before technical terrain.';
  return 'Continuing can reduce practical diversion options.';
}

function buildDecisionPoint(context: CampSearchContext, set: CampRecommendationSet): {
  decisionDeadlineIso: string | null;
  decisionPoint: CampOpsDecisionPoint | null;
  noDecisionPointReason: string | null;
} {
  const deadline = safeArrivalDeadline(context);
  if (!hasRouteDecisionData(context)) {
    return {
      decisionDeadlineIso: deadline,
      decisionPoint: null,
      noDecisionPointReason: 'Route geometry or progress data is not detailed enough to identify a practical decision point.',
    };
  }
  const kind = decisionKind(context, set);
  const routeLocation = routeLocationForKind(context, kind);
  const decisionDeadlineIso = earlierIso(deadline, deadlineForTurnoff(context, routeLocation.distanceMiles));
  const planned = plannedCandidate(context, set);
  const recommended = set.recommendedCamp;
  const plannedEnrichment = planned ? set.enrichmentsByCandidateId?.[planned.id] : undefined;
  const recommendedEnrichment = recommended ? set.enrichmentsByCandidateId?.[recommended.id] : undefined;
  const latestRecommendedTurnoff = {
    label: routeLocation.label,
    location: routeLocation.location,
    routeMileMarker: routeLocation.routeMileMarker,
    distanceMiles: routeLocation.distanceMiles,
  };
  return {
    decisionDeadlineIso,
    noDecisionPointReason: null,
    decisionPoint: {
      kind,
      location: routeLocation.location,
      routeMileMarker: routeLocation.routeMileMarker,
      decisionDeadlineIso,
      reason: reasonForDecisionKind(kind, context, set),
      recommendedAction: recommended
        ? `Diversion recommended toward ${recommended.name}; verify access before committing.`
        : 'Continue not recommended until CampOps has a viable endpoint or better route data.',
      continueOption: optionFor(planned, plannedEnrichment, 'Continue'),
      divertOption: optionFor(recommended, recommendedEnrichment, 'Divert'),
      riskIfContinues: riskIfContinues(kind),
      latestRecommendedTurnoff,
      confidence: confidenceForDecisionPoint(context, set),
    },
  };
}

function buildDecisionSummary(
  context: CampSearchContext,
  set: CampRecommendationSet,
  delayMinutes: number,
  enabled: boolean,
  decisionPointsEnabled: boolean,
): CampOpsSafeEndPointDecisionSummary {
  const { decisionDeadlineIso, decisionPoint: point, noDecisionPointReason } = decisionPointsEnabled
    ? buildDecisionPoint(context, set)
    : {
        decisionDeadlineIso: safeArrivalDeadline(context),
        decisionPoint: null,
        noDecisionPointReason: 'CampOps decision points are disabled for this rollout.',
      };
  if (!enabled) {
    return {
      status: 'disabled',
      delayEstimateMinutes: delayMinutes,
      recommendedSafeEndpoint: null,
      backupEndpoint: null,
      emergencyEndpoint: null,
      plannedCampDowngradeReason: null,
      decisionDeadlineIso,
      decisionPoint: point,
      noDecisionPointReason,
      keyRisks: [],
      nextAction: 'Enable CampOps recommendations to compute an endpoint recommendation.',
    };
  }
  const recommended = set.recommendedCamp;
  const risks = keyRisks(set);
  return {
    status: recommended ? 'recommended' : set.emergencyCamp ? 'unknown' : 'no_safe_endpoint',
    delayEstimateMinutes: delayMinutes,
    recommendedSafeEndpoint: recommended,
    backupEndpoint: set.backupCamp,
    emergencyEndpoint: set.emergencyCamp,
    plannedCampDowngradeReason: set.explanations?.plannedCampDowngrade ?? null,
    decisionDeadlineIso,
    decisionPoint: point,
    noDecisionPointReason,
    keyRisks: risks,
    nextAction: recommended
      ? `Use ${recommended.name} as the CampOps endpoint candidate and verify access before committing.`
      : set.emergencyCamp
        ? `No primary camp cleared; treat ${set.emergencyCamp.name} as emergency-only and reassess now.`
        : 'No endpoint cleared CampOps gates; stop, reassess route context, and identify a lower-risk option.',
  };
}

export function findCampOpsSafeEndPoint(input: CampOpsFindSafeEndPointInput): CampOpsSafeEndPointResult {
  const delayMinutes = resolveDelayMinutes(input);
  const scenario = input.delayScenario ?? delayScenarioFromMinutes(delayMinutes);
  const context = contextWithDelay(input, delayMinutes);
  const enabled = isEnabled(input);
  const decisionPointsEnabled = isDecisionPointEnabled(input);
  if (!enabled) {
    const emptySet = createEmptyCampRecommendationSet('unknown');
    const decisionSummary = buildDecisionSummary(context, emptySet, delayMinutes, false, false);
    return {
      enabled: false,
      scenario,
      context,
      recommendationSet: {
        ...emptySet,
        decisionPoint: decisionSummary.decisionPoint,
      },
      decisionSummary,
    };
  }
  const enrichmentsByCandidateId = delayedEnrichments(
    context,
    input.candidates,
    input.enrichmentsByCandidateId,
    delayMinutes,
    input.resourceDebtConfig,
  );
  const recommendationSet = buildRecommendationSet(context, input.candidates, enrichmentsByCandidateId, input);
  const decisionSummary = buildDecisionSummary(context, recommendationSet, delayMinutes, true, decisionPointsEnabled);
  const result: CampOpsSafeEndPointResult = {
    enabled: true,
    scenario,
    context,
    recommendationSet: {
      ...recommendationSet,
      decisionPoint: decisionSummary.decisionPoint,
    },
    decisionSummary,
  };
  emitCampOpsEndpointRecommendationGenerated(context, result.recommendationSet, {
    featureEnabled: true,
    endpointStatus: decisionSummary.status,
  });
  return result;
}

export function findCampOpsSafeEndPointScenarios(
  input: Omit<CampOpsFindSafeEndPointInput, 'delayScenario' | 'delayEstimateMinutes'>,
  scenarios: CampOpsSafeEndPointDelayScenario[] = ['no_delay', 'delay_30m', 'delay_1h', 'delay_2h'],
): CampOpsSafeEndPointResult[] {
  return scenarios.map((delayScenario) =>
    findCampOpsSafeEndPoint({
      ...input,
      delayScenario,
    }),
  );
}
