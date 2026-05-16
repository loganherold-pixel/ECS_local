import type {
  CampsiteCandidate as EngineCampsiteCandidate,
  CampsiteCandidateResult,
} from '../campsiteCandidateEngine';
import { campOpsCandidateFromGeneratedCandidate } from './campOpsAdapters';
import type {
  CampAccessDifficulty,
  CampCandidate,
  CampCandidateEnrichment,
  CampFitStatus,
  CampImpactLevel,
  CampLegalStatus,
  CampOpsConfidence,
  CampOpsOfflineMode,
  CampOpsResourceState,
  CampOpsVehicleProfile,
  CampRecommendationSet,
  CampPublicAccessStatus,
  CampSearchContext,
} from './campOpsTypes';
import {
  type CampOpsHardGateConfig,
} from './campOpsHardGateConfig';
import {
  evaluateCampHardGateCandidates,
  type CampHardGateCandidateEvaluation,
} from './campOpsHardGates';
import {
  type CampOpsFeatureState,
  type CampOpsRecommendationConfig,
  type CampOpsRecommendationRolloutConfig,
  getCampOpsFeatureState,
} from './campOpsRecommendationConfig';
import { generateCampRecommendationSet } from './campOpsRecommendations';
import type { CampOpsResourceDebtConfig } from './campOpsResourceDebtConfig';
import { attachCampResourceDebt } from './campOpsResourceDebt';
import {
  applyCampOpsSourceSignalsToEnrichment,
  type CampOpsExternalSourceSignal,
  type CampOpsSourceProviderBundle,
} from './campOpsSourceAdapters';
import type { CampOpsScoringConfigOverrides } from './campOpsScoringConfig';
import {
  rankCampSuitabilityCandidates,
  type CampSuitabilityScoreResult,
} from './campOpsScoring';

export type CampOpsSearchSource = 'route' | 'polygon';

export type CampOpsSearchIntegrationOptions = {
  /** @deprecated Use rolloutConfig.campopsRecommendationsEnabled. This shortcut no longer enables CampOps. */
  enabled?: boolean | null;
  source: CampOpsSearchSource;
  context?: Partial<CampSearchContext> | null;
  rolloutConfig?: Partial<CampOpsRecommendationRolloutConfig> | null;
  hardGateConfig?: Partial<CampOpsHardGateConfig> | null;
  scoringConfig?: CampOpsScoringConfigOverrides | null;
  recommendationConfig?: Partial<CampOpsRecommendationConfig> | null;
  resourceDebtConfig?: Partial<CampOpsResourceDebtConfig> | null;
  sourceSignalsByCandidateId?: Record<string, CampOpsExternalSourceSignal[] | undefined> | null;
  sourceProviderBundle?: CampOpsSourceProviderBundle | null;
  vehicleProfile?: unknown;
};

type CampOpsSearchPayload = NonNullable<CampsiteCandidateResult['campOps']>;

const CURRENT_TIME_FALLBACK = '1970-01-01T00:00:00.000Z';

function finiteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function confidenceFromScore(score: number | null | undefined): CampOpsConfidence {
  if (score == null || !Number.isFinite(Number(score))) return 'unknown';
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  if (score > 0) return 'low';
  return 'unknown';
}

function confidenceFromEngine(value: string | null | undefined): CampOpsConfidence {
  const normalized = value?.toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
  return 'unknown';
}

function legalStatusFromScore(score: number | null | undefined): CampLegalStatus {
  if (score == null || !Number.isFinite(Number(score))) return 'unknown';
  if (score >= 75) return 'allowed';
  if (score >= 50) return 'likely_allowed';
  return 'restricted';
}

function publicAccessFromLegalScore(score: number | null | undefined): CampPublicAccessStatus {
  return score == null || !Number.isFinite(Number(score)) ? 'unknown' : 'public';
}

function accessDifficultyFromCandidate(candidate: EngineCampsiteCandidate): CampAccessDifficulty {
  if (candidate.difficulty === 'easy') return 'easy';
  if (candidate.difficulty === 'moderate') return 'moderate';
  if (candidate.difficulty === 'challenging') return 'high_clearance';
  if (candidate.difficulty === 'difficult') return 'technical';
  return 'unknown';
}

function fitFromAccessDifficulty(difficulty: CampAccessDifficulty): CampFitStatus {
  if (difficulty === 'technical') return 'limited';
  if (difficulty === 'unknown') return 'unknown';
  return 'fit';
}

function trailerFitFromAccessDifficulty(difficulty: CampAccessDifficulty): CampFitStatus {
  if (difficulty === 'technical') return 'not_fit';
  if (difficulty === 'high_clearance') return 'limited';
  if (difficulty === 'unknown') return 'unknown';
  return 'fit';
}

function impactFromRemaining(value: number | null, safe: number, tight: number): CampImpactLevel {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value < tight) return 'critical';
  if (value < safe) return 'caution';
  return 'neutral';
}

function addHours(baseIso: string, hours: number | null | undefined): string | null {
  if (hours == null || !Number.isFinite(Number(hours))) return null;
  const baseMs = Date.parse(baseIso);
  if (!Number.isFinite(baseMs)) return null;
  return new Date(baseMs + Number(hours) * 60 * 60 * 1000).toISOString();
}

function minutesBetween(startIso: string | null | undefined, endIso: string | null | undefined): number | null {
  if (!startIso || !endIso) return null;
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.round((endMs - startMs) / 60000);
}

function isAfterIso(valueIso: string | null, limitIso: string | null | undefined): boolean {
  if (!valueIso || !limitIso) return false;
  const valueMs = Date.parse(valueIso);
  const limitMs = Date.parse(limitIso);
  return Number.isFinite(valueMs) && Number.isFinite(limitMs) && valueMs > limitMs;
}

function lateArrivalRisk(context: CampSearchContext, etaIso: string | null, sunsetMarginMinutes: number | null): CampImpactLevel {
  const latest = context.desiredArrivalWindow?.latestAcceptableIso ?? context.desiredArrivalWindow?.endIso ?? null;
  if (isAfterIso(etaIso, latest)) return 'critical';
  if (sunsetMarginMinutes != null && sunsetMarginMinutes < 0) return 'critical';
  if (sunsetMarginMinutes != null && sunsetMarginMinutes < 30) return 'caution';
  if (!etaIso && latest) return 'unknown';
  return 'neutral';
}

function normalizeOfflineMode(value: CampOpsOfflineMode | undefined): CampOpsOfflineMode {
  if (value === 'online' || value === 'degraded' || value === 'offline' || value === 'unknown') return value;
  return 'unknown';
}

function vehicleProfileFromUnknown(value: unknown): CampOpsVehicleProfile | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    vehicleId: typeof record.vehicleId === 'string' ? record.vehicleId : typeof record.id === 'string' ? record.id : null,
    label: typeof record.label === 'string' ? record.label : typeof record.name === 'string' ? record.name : null,
    vehicleType: typeof record.vehicleType === 'string' ? record.vehicleType : typeof record.type === 'string' ? record.type : null,
    widthInches: finiteNumber(record.widthInches),
    wheelbaseInches: finiteNumber(record.wheelbaseInches),
    clearanceInches: finiteNumber(record.clearanceInches ?? record.groundClearanceInches),
    tireSizeInches: finiteNumber(record.tireSizeInches),
    suspensionLiftInches: finiteNumber(record.suspensionLiftInches),
    trailerAttached: typeof record.trailerAttached === 'boolean' ? record.trailerAttached : null,
    rooftopTent: typeof record.rooftopTent === 'boolean' ? record.rooftopTent : null,
    operatingWeightLbs: finiteNumber(record.operatingWeightLbs),
    payloadRemainingLbs: finiteNumber(record.payloadRemainingLbs),
    source: 'inferred',
    confidence: 'low',
  };
}

function buildContext(
  result: CampsiteCandidateResult,
  options: CampOpsSearchIntegrationOptions,
): CampSearchContext {
  const routeProgress =
    result.totalDistanceMiles || result.estimatedDriveTimeHours
      ? {
          distanceRemainingMiles: result.totalDistanceMiles || null,
          driveTimeRemainingMinutes: result.estimatedDriveTimeHours
            ? Math.round(result.estimatedDriveTimeHours * 60)
            : null,
          source: 'inferred' as const,
          confidence: 'low' as const,
        }
      : null;
  const currentTimeIso =
    options.context?.currentTimeIso ?? result.analyzedAt ?? new Date().toISOString?.() ?? CURRENT_TIME_FALLBACK;
  return {
    id: options.context?.id ?? `campops:${options.source}:${result.routeIntelligenceId}`,
    routeId: options.context?.routeId ?? (options.source === 'route' ? result.routeIntelligenceId : null),
    tripId: options.context?.tripId ?? null,
    plannedCampId: options.context?.plannedCampId ?? null,
    currentTimeIso,
    desiredArrivalWindow: options.context?.desiredArrivalWindow ?? null,
    daylightInfo: options.context?.daylightInfo ?? null,
    vehicleProfile:
      options.context?.vehicleProfile ?? vehicleProfileFromUnknown(options.vehicleProfile) ?? null,
    convoyProfile: options.context?.convoyProfile ?? null,
    resourceState: options.context?.resourceState ?? null,
    userCampPreferences: options.context?.userCampPreferences ?? null,
    riskTolerance: options.context?.riskTolerance ?? 'balanced',
    offlineMode: normalizeOfflineMode(options.context?.offlineMode),
    delayEstimateMinutes: options.context?.delayEstimateMinutes ?? null,
    routeProgress: options.context?.routeProgress ?? routeProgress,
    currentLocation: options.context?.currentLocation,
  };
}

function fuelImpact(resourceState: CampOpsResourceState | null | undefined) {
  const reserveMiles = finiteNumber(resourceState?.fuelReserveMiles ?? resourceState?.fuelRangeMiles);
  return {
    value: reserveMiles,
    unit: reserveMiles == null ? 'unknown' as const : 'miles' as const,
    impact: impactFromRemaining(reserveMiles, 50, 25),
    confidence: resourceState?.confidence ?? confidenceFromScore(resourceState?.fuelPercent),
  };
}

function waterImpact(resourceState: CampOpsResourceState | null | undefined) {
  const gallons = finiteNumber(resourceState?.waterGallons);
  const percent = finiteNumber(resourceState?.waterPercent);
  const value = gallons ?? percent;
  return {
    value,
    unit: gallons == null ? (percent == null ? 'unknown' as const : 'percent' as const) : 'gallons' as const,
    impact: gallons == null
      ? impactFromRemaining(percent, 30, 15)
      : impactFromRemaining(gallons, 5, 2),
    confidence: resourceState?.confidence ?? confidenceFromScore(percent),
  };
}

function buildCandidateEnrichment(
  context: CampSearchContext,
  candidate: CampCandidate,
  sourceCandidate: EngineCampsiteCandidate,
  sourceSignals?: CampOpsExternalSourceSignal[] | null,
  resourceDebtConfig?: Partial<CampOpsResourceDebtConfig> | null,
): CampCandidateEnrichment {
  const accessDifficulty = accessDifficultyFromCandidate(sourceCandidate);
  const legalAccessScore = finiteNumber(sourceCandidate.legalAccessScore);
  const etaIso = addHours(context.currentTimeIso, sourceCandidate.estimatedArrivalHour);
  const sunsetMarginMinutes =
    etaIso && context.daylightInfo?.sunsetIso
      ? minutesBetween(etaIso, context.daylightInfo.sunsetIso)
      : sourceCandidate.estimatedArrivalHour != null && context.daylightInfo?.daylightRemainingMinutes != null
        ? Math.round(context.daylightInfo.daylightRemainingMinutes - sourceCandidate.estimatedArrivalHour * 60)
        : null;
  const terrainScore = finiteNumber(sourceCandidate.terrainScore ?? sourceCandidate.qualityScore);
  const dataConfidence =
    sourceCandidate.legalAccessScore == null
      ? confidenceFromEngine(sourceCandidate.confidence)
      : confidenceFromScore(sourceCandidate.legalAccessScore);
  const base: CampCandidateEnrichment = {
    candidateId: candidate.id,
    legalStatus: legalStatusFromScore(legalAccessScore),
    legalConfidence: confidenceFromScore(legalAccessScore),
    closureStatus: 'open',
    publicAccessStatus: publicAccessFromLegalScore(legalAccessScore),
    accessDifficulty,
    vehicleFit: fitFromAccessDifficulty(accessDifficulty),
    trailerSuitability: trailerFitFromAccessDifficulty(accessDifficulty),
    turnaroundSuitability: trailerFitFromAccessDifficulty(accessDifficulty),
    trailerTurnaroundConfidence: confidenceFromEngine(sourceCandidate.confidence),
    deadEndRisk: 'unknown',
    backingRequired: null,
    roadWidthConfidence: confidenceFromEngine(sourceCandidate.confidence),
    groupCapacityEstimate: null,
    groupCapacityConfidence: 'unknown',
    etaIso,
    etaMinutesFromNow:
      sourceCandidate.estimatedArrivalHour == null
        ? null
        : Math.round(sourceCandidate.estimatedArrivalHour * 60),
    sunsetMarginMinutes,
    routeDistanceToCampMiles: finiteNumber(sourceCandidate.distanceMiles),
    fuelImpact: fuelImpact(context.resourceState),
    waterImpact: waterImpact(context.resourceState),
    reliableWaterRefillAvailable: context.resourceState?.waterGallons != null || context.resourceState?.waterPercent != null
      ? false
      : null,
    terrainSlopeEstimate: {
      value: terrainScore,
      unit: 'score',
      confidence: confidenceFromScore(terrainScore),
      source: 'inferred',
    },
    weatherExposure: 'unknown',
    fireRestrictionStatus: 'unknown',
    privacyLikelihood: sourceCandidate.remotenessScore != null && sourceCandidate.remotenessScore >= 75
      ? 'high'
      : 'moderate',
    occupancyLikelihood: 'unknown',
    lateArrivalRisk: lateArrivalRisk(context, etaIso, sunsetMarginMinutes),
    dataConfidence,
    dataLimitations: [
      'CampOps is using existing generated camp candidate data only.',
      'Legal, weather, fire, occupancy, and service data may require later dedicated sources.',
    ],
  };
  const merged = applyCampOpsSourceSignalsToEnrichment({
    enrichment: base,
    signals: sourceSignals,
    currentTimeIso: context.currentTimeIso,
  });
  return attachCampResourceDebt({
    context,
    candidate,
    enrichment: merged,
    config: resourceDebtConfig ?? {},
  });
}

function buildCampOpsInputs(
  result: CampsiteCandidateResult,
  options: CampOpsSearchIntegrationOptions,
  featureState: CampOpsFeatureState,
): {
  context: CampSearchContext;
  candidates: CampCandidate[];
  enrichmentsByCandidateId: Record<string, CampCandidateEnrichment>;
} {
  const context = buildContext(result, options);
  const source = options.source === 'polygon' ? 'draw_area_candidate' : 'route_candidate';
  const candidates = result.candidates.map((candidate) => campOpsCandidateFromGeneratedCandidate(candidate, source));
  const enrichmentsByCandidateId: Record<string, CampCandidateEnrichment> = {};
  candidates.forEach((candidate, index) => {
    const sourceCandidate = result.candidates[index];
    const sourceSignals = featureState.providerAdaptersEnabled
      ? [
          ...(options.sourceSignalsByCandidateId?.[candidate.id] ?? []),
          ...(options.sourceProviderBundle?.signalsByCandidateId[candidate.id] ?? []),
        ]
      : [];
    enrichmentsByCandidateId[candidate.id] = buildCandidateEnrichment(
      context,
      candidate,
      sourceCandidate,
      sourceSignals,
      options.resourceDebtConfig,
    );
  });
  return { context, candidates, enrichmentsByCandidateId };
}

function resolveSearchFeatureState(options: CampOpsSearchIntegrationOptions): CampOpsFeatureState {
  return getCampOpsFeatureState(options.rolloutConfig ?? {});
}

function stripSourceTransparency(set: CampRecommendationSet): CampRecommendationSet {
  const enrichmentsByCandidateId: Record<string, CampCandidateEnrichment> = {};
  for (const [candidateId, enrichment] of Object.entries(set.enrichmentsByCandidateId ?? {})) {
    const { sourceSignals, sourceResolutions, ...rest } = enrichment;
    enrichmentsByCandidateId[candidateId] = rest;
  }
  return {
    ...set,
    enrichmentsByCandidateId,
  };
}

export function generateCampOpsSearchPayload(
  result: CampsiteCandidateResult,
  options: CampOpsSearchIntegrationOptions,
): CampOpsSearchPayload | null {
  const featureState = resolveSearchFeatureState(options);
  if (!featureState.recommendationsEnabled) return null;
  const { context, candidates, enrichmentsByCandidateId } = buildCampOpsInputs(result, options, featureState);
  const hardGateEvaluations = evaluateCampHardGateCandidates({
    context,
    candidates,
    enrichmentsByCandidateId,
    config: options.hardGateConfig ?? {},
  });
  const hardGateEvaluationsByCandidateId: Record<string, CampHardGateCandidateEvaluation> = {};
  hardGateEvaluations.forEach((evaluation) => {
    hardGateEvaluationsByCandidateId[evaluation.candidate.id] = evaluation;
  });
  const suitabilityScores = rankCampSuitabilityCandidates({
    context,
    candidates,
    enrichmentsByCandidateId,
    hardGateEvaluationsByCandidateId,
    config: options.scoringConfig ?? {},
  });
  const suitabilityScoresByCandidateId: Record<string, CampSuitabilityScoreResult> = {};
  suitabilityScores.forEach((score) => {
    suitabilityScoresByCandidateId[score.candidate.id] = score;
  });
  const recommendationSet = generateCampRecommendationSet({
    context,
    candidates,
    enrichmentsByCandidateId,
    hardGateEvaluationsByCandidateId,
    suitabilityScoresByCandidateId,
    config: options.recommendationConfig ?? {},
  });
  const providerWarnings = featureState.providerAdaptersEnabled ? options.sourceProviderBundle?.warnings ?? [] : [];
  const providerErrors = featureState.providerAdaptersEnabled ? options.sourceProviderBundle?.errors ?? [] : [];
  const exposedRecommendationSet = featureState.sourceTransparencyEnabled
    ? recommendationSet
    : stripSourceTransparency(recommendationSet);
  return {
    enabled: true,
    recommendationSet: {
      ...exposedRecommendationSet,
      warnings: Array.from(new Set([
        ...exposedRecommendationSet.warnings,
        ...providerWarnings,
        ...providerErrors.map((error) => `Source provider error: ${error}`),
      ])),
      assumptions: Array.from(new Set([
        ...exposedRecommendationSet.assumptions,
        ...(featureState.providerAdaptersEnabled && options.sourceProviderBundle ? ['CampOps source provider outputs were normalized before scoring.'] : []),
      ])),
    },
  };
}

export function withCampOpsSearchPayload(
  result: CampsiteCandidateResult,
  options: CampOpsSearchIntegrationOptions,
): CampsiteCandidateResult {
  const payload = generateCampOpsSearchPayload(result, options);
  if (!payload) return result;
  return {
    ...result,
    campOps: payload,
  };
}
