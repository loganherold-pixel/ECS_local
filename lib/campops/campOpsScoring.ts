import type {
  CampCandidate,
  CampCandidateEnrichment,
  CampHardGateResult,
  CampImpactLevel,
  CampLikelihoodLevel,
  CampOperationalRole,
  CampOpsConfidence,
  CampOpsScoreKey,
  CampResourceDebt,
  CampResourceDebtItem,
  CampSearchContext,
  CampSuitabilityScores,
} from './campOpsTypes';
import {
  EMPTY_CAMP_SUITABILITY_SCORES,
  normalizeCampOpsScore,
} from './campOpsTypes';
import type { CampHardGateCandidateEvaluation } from './campOpsHardGates';
import {
  resolveCampOpsScoringConfig,
  type CampOpsScoringConfig,
  type CampOpsCategoryWeights,
  type CampOpsScoringConfigOverrides,
} from './campOpsScoringConfig';
import {
  getActiveVehicleSnapshotForEcs,
  scoreVehicleSuitabilityForEcs,
} from '../vehicleEcsIntegration';

export type CampSuitabilityScoreExplanation = {
  positiveFactors: string[];
  negativeFactors: string[];
  assumptions: string[];
  missingData: string[];
  confidenceNote: string;
  resourceDebt?: CampResourceDebt;
};

export type CampSuitabilityScoreResult = {
  candidate: CampCandidate;
  scores: CampSuitabilityScores;
  rankScore: number | null;
  recommendationEligible: boolean;
  operationalRole: CampOperationalRole;
  hardGateStatus: 'allowed' | 'caution' | 'rejected' | 'unknown';
  explanation: CampSuitabilityScoreExplanation;
};

export type CampSuitabilityScoreInput = {
  context: CampSearchContext;
  candidate: CampCandidate;
  enrichment: CampCandidateEnrichment;
  hardGateEvaluation?: CampHardGateCandidateEvaluation;
  hardGates?: CampHardGateResult[];
  operationalRole?: CampOperationalRole;
  config?: CampOpsScoringConfigOverrides;
};

export type CampSuitabilityRankingInput = {
  context: CampSearchContext;
  candidates: CampCandidate[];
  enrichmentsByCandidateId: Record<string, CampCandidateEnrichment | undefined>;
  hardGateEvaluationsByCandidateId?: Record<string, CampHardGateCandidateEvaluation | undefined>;
  rolesByCandidateId?: Record<string, CampOperationalRole | undefined>;
  config?: CampOpsScoringConfigOverrides;
};

const CONFIDENCE_SCORE: Record<CampOpsConfidence, number> = {
  high: 100,
  medium: 75,
  low: 45,
  unknown: 20,
};

const IMPACT_SCORE: Record<CampImpactLevel, number> = {
  positive: 100,
  neutral: 88,
  watch: 70,
  caution: 42,
  critical: 12,
  unknown: 52,
};

const LIKELIHOOD_SCORE: Record<CampLikelihoodLevel, number> = {
  high: 100,
  moderate: 76,
  low: 45,
  unknown: 60,
};

const FIRE_RISK_SCORE = {
  low: 86,
  medium: 52,
  high: 18,
  unknown: 58,
} as const;

const WEATHER_RISK_SCORE = {
  low: 88,
  medium: 48,
  high: 14,
  unknown: 56,
} as const;

const CATEGORY_GATE_MATCHERS: Record<Exclude<CampOpsScoreKey, 'overall'>, string[]> = {
  legal: ['legal', 'private_land', 'public_access', 'permission_required'],
  access: ['access', 'vehicle'],
  time: ['time', 'eta'],
  resources: ['resources', 'fuel', 'water'],
  terrain: ['terrain'],
  weather: ['weather', 'fire', 'restrictions'],
  groupFit: ['group'],
  trailerFit: ['trailer'],
  lateArrival: ['late_arrival', 'arrival_window'],
  privacy: ['privacy'],
  dataConfidence: ['data', 'missing', 'unconfirmed'],
};

function clampScore(value: number): number {
  return normalizeCampOpsScore(value) ?? 0;
}

function finiteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function weightedScore(values: Array<{ score: number; weight: number }>): number {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  return clampScore(values.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);
}

function scoreLegal(enrichment: CampCandidateEnrichment): number {
  const legalStatusScore = {
    allowed: 100,
    likely_allowed: 86,
    restricted: 44,
    prohibited: 0,
    unknown: 34,
  }[enrichment.legalStatus];
  return weightedScore([
    { score: legalStatusScore, weight: 0.65 },
    { score: CONFIDENCE_SCORE[enrichment.legalConfidence], weight: 0.35 },
  ]);
}

function recoverySupportScore(enrichment: CampCandidateEnrichment): number {
  if (enrichment.recoveryFriendly === true) return 100;
  if (enrichment.exitDistanceMiles != null) {
    if (enrichment.exitDistanceMiles <= 3) return 96;
    if (enrichment.exitDistanceMiles <= 8) return 82;
    if (enrichment.exitDistanceMiles <= 20) return 58;
    return 34;
  }
  if (enrichment.serviceDistanceMiles != null) {
    if (enrichment.serviceDistanceMiles <= 10) return 92;
    if (enrichment.serviceDistanceMiles <= 30) return 70;
    return 42;
  }
  return 54;
}

function scoreAccess(
  context: CampSearchContext,
  enrichment: CampCandidateEnrichment,
  config: CampOpsScoringConfig,
): number {
  const difficultyScore = {
    easy: 100,
    moderate: 82,
    high_clearance: 64,
    technical: 42,
    unknown: 48,
  }[enrichment.accessDifficulty];
  const fitScore = {
    fit: 100,
    limited: 62,
    not_fit: 0,
    unknown: 46,
  }[enrichment.vehicleFit];
  const activeVehicleFit = scoreVehicleSuitabilityForEcs({
    activeVehicleState: getActiveVehicleSnapshotForEcs(),
    accessDemand: enrichment.accessDifficulty,
  });
  const items = [
    { score: difficultyScore, weight: 0.35 },
    { score: fitScore, weight: 0.45 },
    { score: activeVehicleFit.score, weight: 0.2 },
  ];
  if (context.convoyProfile?.mechanicalIssueFlag) {
    items.push({
      score: recoverySupportScore(enrichment),
      weight: config.mechanicalIssueRecoveryWeightMultiplier,
    });
  }
  return weightedScore(items);
}

function scoreTime(context: CampSearchContext, enrichment: CampCandidateEnrichment): number {
  const safeLimitIso = context.desiredArrivalWindow?.latestAcceptableIso ?? context.desiredArrivalWindow?.endIso ?? null;
  let arrivalScore = 70;
  if (enrichment.etaIso && safeLimitIso) {
    const etaMs = Date.parse(enrichment.etaIso);
    const limitMs = Date.parse(safeLimitIso);
    if (Number.isFinite(etaMs) && Number.isFinite(limitMs)) {
      const marginMinutes = (limitMs - etaMs) / 60000;
      arrivalScore = marginMinutes >= 60 ? 100 : marginMinutes >= 0 ? 78 : marginMinutes >= -60 ? 42 : 22;
    }
  }

  let daylightScore = 65;
  if (enrichment.sunsetMarginMinutes != null) {
    daylightScore =
      enrichment.sunsetMarginMinutes >= 60
        ? 100
        : enrichment.sunsetMarginMinutes >= 30
          ? 82
          : enrichment.sunsetMarginMinutes >= 0
            ? 56
            : 24;
  }

  return weightedScore([
    { score: arrivalScore, weight: 0.6 },
    { score: daylightScore, weight: 0.4 },
  ]);
}

function scoreResources(enrichment: CampCandidateEnrichment, config: CampOpsScoringConfig): number {
  if (enrichment.resourceDebt) {
    const debtStatusScore: Record<string, number> = {
      safe: 100,
      tight: 56,
      critical: 12,
      after_dark: 20,
      unknown: 48,
    };
    return weightedScore([
      { score: debtStatusScore[enrichment.resourceDebt.fuel.status], weight: 0.5 },
      { score: debtStatusScore[enrichment.resourceDebt.water.status], weight: 0.5 },
    ]);
  }

  const fuelValue = enrichment.fuelImpact?.unit === 'miles' ? finiteNumber(enrichment.fuelImpact.value) : null;
  const fuelImpactScore = enrichment.fuelImpact ? IMPACT_SCORE[enrichment.fuelImpact.impact] : 58;
  const fuelMarginScore =
    fuelValue == null
      ? 58
      : fuelValue >= config.minimumFuelComfortMarginMiles
        ? 100
        : fuelValue >= config.minimumFuelComfortMarginMiles * 0.5
          ? 66
          : 28;

  const waterValue = finiteNumber(enrichment.waterImpact?.value);
  const waterImpactScore = enrichment.waterImpact ? IMPACT_SCORE[enrichment.waterImpact.impact] : 58;
  const waterMarginScore =
    waterValue == null
      ? 58
      : enrichment.waterImpact?.unit === 'percent'
        ? waterValue >= config.minimumWaterComfortMarginPercent
          ? 100
          : waterValue >= config.minimumWaterComfortMarginPercent * 0.5
            ? 62
            : 28
        : waterValue >= config.minimumWaterComfortMarginGallons
          ? 100
          : waterValue >= config.minimumWaterComfortMarginGallons * 0.5
            ? 62
            : 28;

  return weightedScore([
    { score: fuelImpactScore, weight: 0.25 },
    { score: fuelMarginScore, weight: 0.3 },
    { score: waterImpactScore, weight: 0.2 },
    { score: waterMarginScore, weight: 0.25 },
  ]);
}

function scoreTerrain(enrichment: CampCandidateEnrichment): number {
  const slopeValue = finiteNumber(enrichment.terrainSlopeEstimate?.value);
  if (slopeValue == null) return 58;
  if (enrichment.terrainSlopeEstimate?.unit === 'score') return clampScore(slopeValue);
  return slopeValue <= 3 ? 100 : slopeValue <= 6 ? 82 : slopeValue <= 10 ? 56 : 30;
}

function scoreWeather(enrichment: CampCandidateEnrichment): number {
  const fireScore = {
    none_known: 100,
    restrictions_possible: 72,
    restricted: 48,
    fire_ban: 18,
    unknown: 55,
  }[enrichment.fireRestrictionStatus];
  const campfireScore = {
    yes: 96,
    restricted: 48,
    no: 24,
    unknown: 55,
  }[enrichment.campfireAllowed ?? 'unknown'];
  const stoveScore = {
    yes: 94,
    restricted: 52,
    no: 28,
    unknown: 58,
  }[enrichment.stoveAllowed ?? 'unknown'];
  return weightedScore([
    { score: IMPACT_SCORE[enrichment.weatherExposure], weight: 0.4 },
    { score: fireScore, weight: 0.28 },
    { score: campfireScore, weight: 0.12 },
    { score: stoveScore, weight: 0.08 },
    { score: FIRE_RISK_SCORE[enrichment.redFlagRisk ?? 'unknown'], weight: 0.07 },
    { score: FIRE_RISK_SCORE[enrichment.smokeOrAirQualityRisk ?? 'unknown'], weight: 0.05 },
    { score: WEATHER_RISK_SCORE[enrichment.stormRisk ?? 'unknown'], weight: 0.07 },
    { score: WEATHER_RISK_SCORE[enrichment.heatRisk ?? 'unknown'], weight: 0.04 },
    { score: WEATHER_RISK_SCORE[enrichment.coldRisk ?? 'unknown'], weight: 0.04 },
    { score: WEATHER_RISK_SCORE[enrichment.precipitationRisk ?? 'unknown'], weight: 0.04 },
  ]);
}

function scoreGroupFit(context: CampSearchContext, enrichment: CampCandidateEnrichment): number {
  const vehicleCount = finiteNumber(context.convoyProfile?.vehicleCount);
  const personCount = finiteNumber(context.convoyProfile?.peopleCount);
  const peopleCount = vehicleCount != null && personCount != null
    ? Math.max(vehicleCount, personCount)
    : vehicleCount ?? personCount;
  const capacity = finiteNumber(enrichment.groupCapacityEstimate);
  if (peopleCount == null) return 82;
  const confidencePenalty =
    enrichment.groupCapacityConfidence === 'high' ? 0 :
      enrichment.groupCapacityConfidence === 'medium' ? 8 :
        enrichment.groupCapacityConfidence === 'low' ? 18 : 28;
  if (capacity == null) return clampScore(46 - confidencePenalty);
  const capacityConfidencePenalty =
    enrichment.groupCapacityConfidence != null
      ? confidencePenalty
      : peopleCount >= 6 && enrichment.dataConfidence !== 'high'
        ? enrichment.dataConfidence === 'medium'
          ? 8
          : 18
        : 0;
  if (capacity >= peopleCount + 2) return clampScore(100 - capacityConfidencePenalty);
  if (capacity >= peopleCount) return clampScore(84 - capacityConfidencePenalty);
  if (capacity + 1 >= peopleCount) return clampScore(48 - capacityConfidencePenalty);
  return clampScore(20 - capacityConfidencePenalty);
}

function trailerRequired(context: CampSearchContext): boolean {
  return Boolean(
    context.vehicleProfile?.trailerAttached ||
      (context.convoyProfile?.trailerCount ?? 0) > 0 ||
      context.convoyProfile?.trailerPresent ||
      context.convoyProfile?.leastCapableVehicleProfile?.trailerAttached ||
      context.userCampPreferences?.trailerFriendlyRequired,
  );
}

function scoreTrailerFit(context: CampSearchContext, enrichment: CampCandidateEnrichment): number {
  const required = trailerRequired(context);
  const fitScore = {
    fit: 100,
    limited: required ? 46 : 76,
    not_fit: required ? 0 : 70,
    unknown: required ? 30 : 78,
  }[enrichment.trailerSuitability];
  if (!required) return fitScore;
  const turnaroundScore = {
    fit: 100,
    limited: 38,
    not_fit: 0,
    unknown: 24,
  }[enrichment.turnaroundSuitability ?? 'unknown'];
  const confidenceScore = CONFIDENCE_SCORE[enrichment.trailerTurnaroundConfidence ?? 'unknown'];
  const deadEndScore = {
    low: 94,
    medium: 56,
    high: 12,
    unknown: 42,
  }[enrichment.deadEndRisk ?? 'unknown'];
  const backingScore = enrichment.backingRequired === true ? 34 : enrichment.backingRequired === false ? 92 : 48;
  const roadWidthScore = CONFIDENCE_SCORE[enrichment.roadWidthConfidence ?? 'unknown'];
  return weightedScore([
    { score: fitScore, weight: 0.28 },
    { score: turnaroundScore, weight: 0.34 },
    { score: confidenceScore, weight: 0.16 },
    { score: deadEndScore, weight: 0.12 },
    { score: backingScore, weight: 0.06 },
    { score: roadWidthScore, weight: 0.04 },
  ]);
}

function scoreLateArrival(enrichment: CampCandidateEnrichment): number {
  return IMPACT_SCORE[enrichment.lateArrivalRisk];
}

function scorePrivacy(enrichment: CampCandidateEnrichment): number {
  return LIKELIHOOD_SCORE[enrichment.privacyLikelihood];
}

function scoreDataConfidence(
  candidate: CampCandidate,
  enrichment: CampCandidateEnrichment,
  hardGates: CampHardGateResult[],
  config: CampOpsScoringConfig,
): number {
  const missingCount = unique(hardGates.flatMap((gate) => gate.missingDataFields)).length;
  const limitationCount = enrichment.dataLimitations?.length ?? 0;
  const sourceScore = CONFIDENCE_SCORE[candidate.sourceConfidence];
  const enrichmentScore = CONFIDENCE_SCORE[enrichment.dataConfidence];
  return clampScore(
    weightedScore([
      { score: sourceScore, weight: 0.35 },
      { score: enrichmentScore, weight: 0.65 },
    ]) -
      missingCount * config.missingDataPenalty -
      limitationCount * config.dataLimitationPenalty,
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function applyGatePenalties(
  scores: CampSuitabilityScores,
  hardGates: CampHardGateResult[],
  config: CampOpsScoringConfig,
): CampSuitabilityScores {
  const next = { ...scores };
  for (const gate of hardGates) {
    const penalty = gate.state === 'caution' ? config.cautionGatePenalty : gate.state === 'unknown' ? config.unknownGatePenalty : 0;
    if (penalty <= 0) continue;
    const loweredGateId = gate.gateId.toLowerCase();
    for (const [scoreKey, fragments] of Object.entries(CATEGORY_GATE_MATCHERS)) {
      if (fragments.some((fragment) => loweredGateId.includes(fragment))) {
        const key = scoreKey as Exclude<CampOpsScoreKey, 'overall'>;
        next[key] = clampScore((next[key] ?? 0) - penalty);
      }
    }
  }
  return next;
}

function adjustWeightsForContext(
  context: CampSearchContext,
  operationalRole: CampOperationalRole,
  config: CampOpsScoringConfig,
): CampOpsCategoryWeights {
  const weights: CampOpsCategoryWeights = { ...config.weights };
  if (config.mode === 'field') {
    weights.lateArrival *= config.fieldModeLateArrivalWeightMultiplier;
    weights.time *= 1.25;
  }
  if (trailerRequired(context)) {
    weights.trailerFit *= config.trailerPresentWeightMultiplier;
    weights.access *= 1.2;
  }
  const peopleCount = finiteNumber(context.convoyProfile?.peopleCount);
  if (peopleCount != null) {
    weights.groupFit *= peopleCount >= config.largeGroupPeopleThreshold
      ? config.largeGroupKnownWeightMultiplier
      : config.groupKnownWeightMultiplier;
  }
  if (context.convoyProfile?.lowestFuelReserveVehicle || context.convoyProfile?.lowestWaterReserveVehicle) {
    weights.resources *= config.convoyResourceDebtWeightMultiplier;
  }
  if (context.convoyProfile?.mechanicalIssueFlag) {
    weights.access *= config.mechanicalIssueRecoveryWeightMultiplier;
    weights.resources *= 1.2;
    weights.privacy *= 0.65;
  }
  if (operationalRole === 'emergency') {
    weights.privacy *= config.emergencyComfortWeightMultiplier;
    weights.terrain *= config.emergencyComfortWeightMultiplier;
    weights.legal *= config.emergencySafetyWeightMultiplier;
    weights.access *= config.emergencySafetyWeightMultiplier;
    weights.resources *= config.emergencySafetyWeightMultiplier;
    weights.time *= config.emergencySafetyWeightMultiplier;
  }
  return weights;
}

function computeOverall(scores: CampSuitabilityScores, weights: CampOpsCategoryWeights): number {
  const items = Object.entries(weights).map(([key, weight]) => ({
    score: scores[key as Exclude<CampOpsScoreKey, 'overall'>] ?? 0,
    weight,
  }));
  return weightedScore(items);
}

function hardGateStatus(
  hardGateEvaluation?: CampHardGateCandidateEvaluation,
  hardGates: CampHardGateResult[] = [],
): 'allowed' | 'caution' | 'rejected' | 'unknown' {
  if (hardGateEvaluation) return hardGateEvaluation.status;
  if (hardGates.some((gate) => gate.state === 'rejected')) return 'rejected';
  if (hardGates.some((gate) => gate.state === 'caution')) return 'caution';
  if (hardGates.some((gate) => gate.state === 'unknown')) return 'unknown';
  return 'allowed';
}

function buildExplanation({
  scores,
  candidate,
  enrichment,
  hardGates,
  status,
  operationalRole,
}: {
  scores: CampSuitabilityScores;
  candidate: CampCandidate;
  enrichment: CampCandidateEnrichment;
  hardGates: CampHardGateResult[];
  status: 'allowed' | 'caution' | 'rejected' | 'unknown';
  operationalRole: CampOperationalRole;
}): CampSuitabilityScoreExplanation {
  const positiveFactors: string[] = [];
  const negativeFactors: string[] = [];
  const assumptions: string[] = [];
  const missingData = unique(hardGates.flatMap((gate) => gate.missingDataFields));
  const resourceDebtItems = enrichment.resourceDebt
    ? Object.values(enrichment.resourceDebt).filter((item): item is CampResourceDebtItem => item != null)
    : [];

  if ((scores.legal ?? 0) >= 80) positiveFactors.push('Legal status and legal confidence are strong.');
  if ((scores.access ?? 0) >= 80) positiveFactors.push('Vehicle access looks workable.');
  const activeVehicleFit = scoreVehicleSuitabilityForEcs({
    activeVehicleState: getActiveVehicleSnapshotForEcs(),
    accessDemand: enrichment.accessDifficulty,
  });
  if (activeVehicleFit.level === 'strong' || activeVehicleFit.level === 'workable') {
    positiveFactors.push(`${activeVehicleFit.label} from active Fleet profile.`);
  }
  if ((scores.resources ?? 0) >= 80) positiveFactors.push('Fuel and water margins look healthy.');
  if ((scores.lateArrival ?? 0) >= 80) positiveFactors.push('Late-arrival risk is low.');
  if (operationalRole === 'emergency') positiveFactors.push('Scored using emergency endpoint priorities.');

  if (status === 'rejected') negativeFactors.push('Rejected hard gates block normal recommendation scoring.');
  for (const gate of hardGates.filter((gate) => gate.state === 'rejected')) {
    negativeFactors.push(gate.reason);
  }
  if ((scores.legal ?? 100) < 65) negativeFactors.push('Legal status or legal confidence materially reduces suitability.');
  if ((scores.resources ?? 100) < 65) negativeFactors.push('Fuel or water debt reduces operational margin.');
  if (enrichment.resourceDebt?.fuel.status === 'tight' || enrichment.resourceDebt?.fuel.status === 'critical') {
    negativeFactors.push(enrichment.resourceDebt.fuel.reason);
  }
  if (enrichment.resourceDebt?.water.status === 'tight' || enrichment.resourceDebt?.water.status === 'critical') {
    negativeFactors.push(enrichment.resourceDebt.water.reason);
  }
  if (enrichment.resourceDebt?.daylight.status === 'tight' || enrichment.resourceDebt?.daylight.status === 'after_dark') {
    negativeFactors.push(enrichment.resourceDebt.daylight.reason);
  }
  if (
    enrichment.resourceDebt?.campUncertainty.status === 'tight' ||
    enrichment.resourceDebt?.campUncertainty.status === 'critical'
  ) {
    negativeFactors.push(enrichment.resourceDebt.campUncertainty.reason);
  }
  if ((scores.trailerFit ?? 100) < 65) negativeFactors.push('Trailer fit is a constraint for this candidate.');
  if ((scores.groupFit ?? 100) < 65) negativeFactors.push('Known group capacity is tight or unclear.');
  if (enrichment.turnaroundSuitability === 'unknown') {
    assumptions.push('Trailer turnaround confidence is unknown and should not be treated as good.');
  } else if (enrichment.turnaroundSuitability === 'limited' || enrichment.turnaroundSuitability === 'not_fit') {
    negativeFactors.push('Trailer turnaround is limited or not confirmed for this camp.');
  }
  if (enrichment.deadEndRisk === 'high') negativeFactors.push('Dead-end risk is high for trailer handling.');
  if (enrichment.backingRequired === true) negativeFactors.push('Backing appears required for trailer handling.');
  if (enrichment.groupCapacityConfidence === 'low' || enrichment.groupCapacityConfidence === 'unknown') {
    assumptions.push('Group capacity confidence is limited.');
  }
  if (enrichment.recoveryFriendly === true && (scores.access ?? 0) >= 75) {
    positiveFactors.push('Recovery access is favorable for a convoy with mechanical concerns.');
  }
  if ((scores.access ?? 100) < 65 && enrichment.recoveryFriendly !== true) {
    negativeFactors.push('Recovery access is limited or unclear for the convoy.');
  }
  if (activeVehicleFit.level === 'caution' || activeVehicleFit.level === 'limited') {
    negativeFactors.push(activeVehicleFit.concerns[0] ?? 'Active vehicle fit needs verification.');
  } else if (activeVehicleFit.level === 'unknown') {
    assumptions.push('Active Fleet vehicle suitability is not configured.');
  }
  if ((scores.dataConfidence ?? 100) < 65) negativeFactors.push('Missing or low-confidence data reduces trust in the score.');
  if (enrichment.campfireAllowed === 'no') negativeFactors.push('Campfires are prohibited by the provided fire restriction source.');
  if (enrichment.campfireAllowed === 'unknown') assumptions.push('Campfire status is unknown.');
  if (enrichment.stoveAllowed === 'no' || enrichment.stoveAllowed === 'restricted') {
    negativeFactors.push('Stove use is restricted by the provided fire restriction source.');
  }
  if (enrichment.redFlagRisk === 'high') negativeFactors.push('Red-flag fire weather risk is high.');
  if (enrichment.smokeOrAirQualityRisk === 'high') negativeFactors.push('Smoke or air quality risk is high.');
  if (enrichment.weatherExposureLevel === 'high') negativeFactors.push('Weather exposure is high for this endpoint.');
  if (enrichment.stormRisk === 'high') negativeFactors.push('Storm risk is high during the forecast window.');
  if (enrichment.heatRisk === 'high') negativeFactors.push('Heat risk increases water and recovery margin needs.');
  if (enrichment.coldRisk === 'high') negativeFactors.push('Cold risk may affect crew exposure and overnight margin.');
  if (!enrichment.weatherExposureLevel || enrichment.weatherExposureLevel === 'unknown') assumptions.push('Weather exposure is unknown.');
  for (const gate of hardGates.filter((gate) => gate.state === 'caution')) {
    negativeFactors.push(gate.reason);
  }

  if (enrichment.reliableWaterRefillAvailable == null) assumptions.push('Water refill reliability is not confirmed.');
  if (status !== 'rejected' && (enrichment.resourceDebt?.fuel.reason.includes('convoy limiting vehicle/resource') || enrichment.resourceDebt?.water.reason.includes('convoy limiting vehicle/resource'))) {
    assumptions.push('Recommendation is based on the convoy’s limiting vehicle/resource.');
  }
  if (candidate.lastVerifiedDate == null) assumptions.push('No last-verified date is available for this camp candidate.');
  if (enrichment.dataLimitations?.length) assumptions.push(...enrichment.dataLimitations);
  if (enrichment.resourceDebt) {
    for (const debt of resourceDebtItems) {
      if (debt.status === 'unknown') assumptions.push(debt.reason);
    }
  }

  const confidenceNote =
    status === 'rejected'
      ? 'No normal recommendation score is produced because deterministic hard gates rejected the camp.'
      : missingData.length > 0
        ? `Score confidence reduced by missing data: ${missingData.join(', ')}.`
        : `Score confidence reflects ${enrichment.dataConfidence} CampOps data confidence.`;

  return {
    positiveFactors: unique(positiveFactors),
    negativeFactors: unique(negativeFactors),
    assumptions: unique(assumptions),
    missingData: unique(missingData.concat(resourceDebtItems.flatMap((debt) => debt.missingDataFields))),
    confidenceNote,
    resourceDebt: enrichment.resourceDebt,
  };
}

export function scoreCampSuitability({
  context,
  candidate,
  enrichment,
  hardGateEvaluation,
  hardGates,
  operationalRole = 'primary',
  config: configOverrides = {},
}: CampSuitabilityScoreInput): CampSuitabilityScoreResult {
  const config = resolveCampOpsScoringConfig(configOverrides);
  const gateResults = hardGateEvaluation?.allGates ?? hardGates ?? [];
  const status = hardGateStatus(hardGateEvaluation, gateResults);

  if (status === 'rejected') {
    return {
      candidate,
      scores: { ...EMPTY_CAMP_SUITABILITY_SCORES },
      rankScore: null,
      recommendationEligible: false,
      operationalRole,
      hardGateStatus: status,
      explanation: buildExplanation({
        scores: { ...EMPTY_CAMP_SUITABILITY_SCORES },
        candidate,
        enrichment,
        hardGates: gateResults,
        status,
        operationalRole,
      }),
    };
  }

  const rawScores: CampSuitabilityScores = {
    overall: null,
    legal: scoreLegal(enrichment),
    access: scoreAccess(context, enrichment, config),
    time: scoreTime(context, enrichment),
    resources: scoreResources(enrichment, config),
    terrain: scoreTerrain(enrichment),
    weather: scoreWeather(enrichment),
    groupFit: scoreGroupFit(context, enrichment),
    trailerFit: scoreTrailerFit(context, enrichment),
    lateArrival: scoreLateArrival(enrichment),
    privacy: scorePrivacy(enrichment),
    dataConfidence: scoreDataConfidence(candidate, enrichment, gateResults, config),
  };
  const penalizedScores = applyGatePenalties(rawScores, gateResults, config);
  const weights = adjustWeightsForContext(context, operationalRole, config);
  const overall = computeOverall(penalizedScores, weights);
  const scores: CampSuitabilityScores = {
    ...penalizedScores,
    overall,
  };

  return {
    candidate,
    scores,
    rankScore: overall,
    recommendationEligible: status === 'allowed' || status === 'caution',
    operationalRole,
    hardGateStatus: status,
    explanation: buildExplanation({
      scores,
      candidate,
      enrichment,
      hardGates: gateResults,
      status,
      operationalRole,
    }),
  };
}

export function rankCampSuitabilityCandidates({
  context,
  candidates,
  enrichmentsByCandidateId,
  hardGateEvaluationsByCandidateId = {},
  rolesByCandidateId = {},
  config,
}: CampSuitabilityRankingInput): CampSuitabilityScoreResult[] {
  return candidates
    .map((candidate) => {
      const enrichment = enrichmentsByCandidateId[candidate.id];
      if (!enrichment) return null;
      return scoreCampSuitability({
        context,
        candidate,
        enrichment,
        hardGateEvaluation: hardGateEvaluationsByCandidateId[candidate.id],
        operationalRole: rolesByCandidateId[candidate.id] ?? 'primary',
        config,
      });
    })
    .filter((item): item is CampSuitabilityScoreResult => item != null)
    .sort((left, right) => (right.rankScore ?? -1) - (left.rankScore ?? -1));
}
