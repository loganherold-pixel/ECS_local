import type {
  CampCandidate,
  CampCandidateEnrichment,
  CampOpsConfidence,
  CampOpsDataSource,
  CampOperationalRole,
  CampRecommendationExplanations,
  CampRecommendationSet,
  CampRejectedCandidate,
  CampSearchContext,
  CampSuitabilityScores,
} from './campOpsTypes';
import {
  createEmptyCampRecommendationSet,
  normalizeCampOpsScore,
  type CampHardGateResult,
} from './campOpsTypes';
import type { CampHardGateCandidateEvaluation } from './campOpsHardGates';
import type { CampSuitabilityScoreResult } from './campOpsScoring';
import {
  resolveCampOpsRecommendationConfig,
  type CampOpsRecommendationConfig,
} from './campOpsRecommendationConfig';
import { emitCampOpsRecommendationGenerated } from './campOpsTelemetry';

export type CampRecommendationInput = {
  context: CampSearchContext;
  candidates: CampCandidate[];
  enrichmentsByCandidateId: Record<string, CampCandidateEnrichment | undefined>;
  hardGateEvaluationsByCandidateId: Record<string, CampHardGateCandidateEvaluation | undefined>;
  suitabilityScoresByCandidateId: Record<string, CampSuitabilityScoreResult | undefined>;
  config?: Partial<CampOpsRecommendationConfig>;
};

type CandidateBundle = {
  candidate: CampCandidate;
  enrichment?: CampCandidateEnrichment;
  hardGate?: CampHardGateCandidateEvaluation;
  score?: CampSuitabilityScoreResult;
};

const CONFIDENCE_RANK: Record<CampOpsConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};

const SOURCE_RANK: Record<CampOpsDataSource, number> = {
  community: 5,
  private: 5,
  group: 5,
  user_saved: 5,
  gpx: 4,
  manual: 4,
  route_candidate: 3,
  draw_area_candidate: 3,
  offline_dataset: 2,
  inferred: 1,
  unknown: 0,
};

function numericScore(score: number | null | undefined): number {
  return Number.isFinite(Number(score)) ? Number(score) : -1;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function confidenceLevel(score: number | null): 'high' | 'medium' | 'low' | 'unknown' {
  if (score == null) return 'unknown';
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  if (score >= 35) return 'low';
  return 'unknown';
}

function milesBetween(a: CampCandidate, b: CampCandidate): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const lat1 = toRadians(a.location.latitude);
  const lat2 = toRadians(b.location.latitude);
  const deltaLat = toRadians(b.location.latitude - a.location.latitude);
  const deltaLng = toRadians(b.location.longitude - a.location.longitude);
  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function isEligible(bundle: CandidateBundle): boolean {
  return Boolean(bundle.score?.recommendationEligible && bundle.score.rankScore != null);
}

function isRejected(bundle: CandidateBundle): boolean {
  return bundle.hardGate?.status === 'rejected' || bundle.score?.hardGateStatus === 'rejected';
}

function routeDistanceMiles(bundle: CandidateBundle): number {
  const routeDistance = bundle.enrichment?.routeDistanceToCampMiles;
  if (Number.isFinite(Number(routeDistance))) return Number(routeDistance);
  const straightLineDistance = bundle.enrichment?.straightLineDistanceToCampMiles;
  if (Number.isFinite(Number(straightLineDistance))) return Number(straightLineDistance);
  return Number.POSITIVE_INFINITY;
}

function sourceConfidenceScore(bundle: CandidateBundle): number {
  const sourceScore = SOURCE_RANK[bundle.candidate.source] * 10;
  const candidateConfidenceScore = CONFIDENCE_RANK[bundle.candidate.sourceConfidence] * 4;
  const legalConfidenceScore = CONFIDENCE_RANK[bundle.enrichment?.legalConfidence ?? 'unknown'] * 3;
  const dataConfidenceScore = CONFIDENCE_RANK[bundle.enrichment?.dataConfidence ?? 'unknown'] * 2;
  return sourceScore + candidateConfidenceScore + legalConfidenceScore + dataConfidenceScore;
}

function campSuitabilityScore(bundle: CandidateBundle): number {
  return (
    normalizeCampOpsScore(bundle.candidate.score) ??
    normalizeCampOpsScore(bundle.score?.scores.overall) ??
    normalizeCampOpsScore(bundle.score?.rankScore) ??
    -1
  );
}

function scoreOrReason(
  score: number,
  threshold: number,
  label: string,
): string | null {
  if (score >= threshold) return null;
  const displayScore = score >= 0 ? Math.round(score) : 'missing';
  return `${label} below CampOps beta threshold (${displayScore}/${threshold}).`;
}

function thresholdRejectionReasons(
  bundle: CandidateBundle,
  config: CampOpsRecommendationConfig,
): string[] {
  if (!isEligible(bundle)) return ['CampOps suitability scoring did not mark the candidate recommendation eligible.'];
  if (isRejected(bundle)) return [];
  const scores = bundle.score?.scores;
  const reasons = [
    scoreOrReason(
      numericScore(bundle.score?.rankScore),
      config.minimumPrimaryScore,
      'Rank score',
    ),
    scoreOrReason(
      numericScore(scores?.overall),
      config.minimumOverallScore,
      'Overall suitability',
    ),
    scoreOrReason(
      numericScore(scores?.terrain),
      config.minimumTerrainScore,
      'Terrain suitability',
    ),
    scoreOrReason(
      numericScore(scores?.access),
      config.minimumAccessScore,
      'Access confidence',
    ),
    scoreOrReason(
      numericScore(scores?.legal),
      config.minimumLegalSourceScore,
      'Legal/source confidence',
    ),
    scoreOrReason(
      campSuitabilityScore(bundle),
      config.minimumCampSuitabilityScore,
      'Camp suitability',
    ),
  ].filter((reason): reason is string => Boolean(reason));

  if (bundle.candidate.source === 'unknown' || bundle.candidate.sourceConfidence === 'unknown') {
    reasons.push('Source attribution or source confidence is unknown.');
  }
  if ((bundle.enrichment?.dataLimitations ?? []).some((limitation) => limitation.toLowerCase().includes('demo'))) {
    reasons.push('Demo data is not eligible for production CampOps route candidates.');
  }
  return unique(reasons);
}

function isQualifiedRouteCandidate(
  bundle: CandidateBundle,
  config: CampOpsRecommendationConfig,
): boolean {
  return !isRejected(bundle) && thresholdRejectionReasons(bundle, config).length === 0;
}

function sortQualifiedRouteCandidates(
  bundles: CandidateBundle[],
  config: CampOpsRecommendationConfig,
): CandidateBundle[] {
  return bundles.sort((left, right) => {
    const leftScore = numericScore(left.score?.rankScore ?? left.score?.scores.overall);
    const rightScore = numericScore(right.score?.rankScore ?? right.score?.scores.overall);
    const scoreDelta = rightScore - leftScore;
    if (Math.abs(scoreDelta) > config.sourcePreferenceScoreDelta) return scoreDelta;

    const distanceDelta = routeDistanceMiles(left) - routeDistanceMiles(right);
    if (Math.abs(distanceDelta) > 0.05) return distanceDelta;

    const sourceDelta = sourceConfidenceScore(right) - sourceConfidenceScore(left);
    if (sourceDelta !== 0) return sourceDelta;
    if (scoreDelta !== 0) return scoreDelta;
    return left.candidate.id.localeCompare(right.candidate.id);
  });
}

function topDedupedRouteCandidates(
  eligible: CandidateBundle[],
  config: CampOpsRecommendationConfig,
): CandidateBundle[] {
  const kept: CandidateBundle[] = [];
  const seenIds = new Set<string>();
  for (const bundle of eligible) {
    if (seenIds.has(bundle.candidate.id)) continue;
    const duplicate = kept.some(
      (existing) => milesBetween(existing.candidate, bundle.candidate) <= config.duplicateCandidateRadiusMiles,
    );
    if (duplicate) continue;
    kept.push(bundle);
    seenIds.add(bundle.candidate.id);
    if (kept.length >= config.routeCandidateLimit) break;
  }
  return kept;
}

function sortedEligible(bundles: CandidateBundle[], config: CampOpsRecommendationConfig): CandidateBundle[] {
  return topDedupedRouteCandidates(
    sortQualifiedRouteCandidates(
      bundles.filter((bundle) => isQualifiedRouteCandidate(bundle, config)),
      config,
    ),
    config,
  );
}

function pickRecommended(
  context: CampSearchContext,
  eligible: CandidateBundle[],
  config: CampOpsRecommendationConfig,
): CandidateBundle | null {
  if (eligible.length === 0) return null;
  const top = eligible[0];
  const planned = context.plannedCampId
    ? eligible.find((bundle) => bundle.candidate.id === context.plannedCampId)
    : null;
  if (
    planned &&
    numericScore(top.score?.rankScore) - numericScore(planned.score?.rankScore) <= config.plannedCampRetentionScoreDelta
  ) {
    return planned;
  }
  return top;
}

function pickBackup(
  recommended: CandidateBundle | null,
  eligible: CandidateBundle[],
  config: CampOpsRecommendationConfig,
): CandidateBundle | null {
  if (!recommended) return null;
  const alternatives = eligible.filter((bundle) => bundle.candidate.id !== recommended.candidate.id);
  if (alternatives.length === 0) return null;
  const meaningfullyDifferent = alternatives.find(
    (bundle) =>
      milesBetween(recommended.candidate, bundle.candidate) >= config.backupMeaningfulDistanceMiles ||
      bundle.candidate.source !== recommended.candidate.source ||
      bundle.enrichment?.accessDifficulty !== recommended.enrichment?.accessDifficulty,
  );
  return meaningfullyDifferent ?? alternatives[0];
}

function emergencyScore(bundle: CandidateBundle): number {
  const scores = bundle.score?.scores;
  if (!scores || isRejected(bundle)) return -1;
  return (
    numericScore(scores.legal) * 2.2 +
    numericScore(scores.access) * 2.4 +
    numericScore(scores.resources) * 1.4 +
    numericScore(scores.time) * 1.1 +
    numericScore(scores.dataConfidence) * 1.8 +
    numericScore(scores.weather) * 0.8
  ) / 9.7;
}

function pickEmergency(
  bundles: CandidateBundle[],
  config: CampOpsRecommendationConfig,
): CandidateBundle | null {
  const ranked = bundles
    .filter((bundle) => !isRejected(bundle))
    .map((bundle) => ({ bundle, score: emergencyScore(bundle) }))
    .filter((item) => item.score >= config.minimumEmergencySafetyScore)
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.bundle ?? null;
}

function pickWeatherFallback(
  eligible: CandidateBundle[],
  config: CampOpsRecommendationConfig,
): CandidateBundle | null {
  const ranked = eligible
    .filter((bundle) => bundle.enrichment && bundle.enrichment.weatherExposure !== 'unknown')
    .filter((bundle) => numericScore(bundle.score?.scores.weather) >= config.weatherFallbackMinimumWeatherScore)
    .sort((left, right) => numericScore(right.score?.scores.weather) - numericScore(left.score?.scores.weather));
  return ranked[0] ?? null;
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

function pickTrailerSafe(
  context: CampSearchContext,
  eligible: CandidateBundle[],
  config: CampOpsRecommendationConfig,
): CandidateBundle | null {
  if (!trailerRequired(context)) return null;
  const ranked = eligible
    .filter((bundle) => numericScore(bundle.score?.scores.trailerFit) >= config.trailerSafeMinimumTrailerScore)
    .sort((left, right) => {
      const trailerDelta = numericScore(right.score?.scores.trailerFit) - numericScore(left.score?.scores.trailerFit);
      if (trailerDelta !== 0) return trailerDelta;
      return numericScore(right.score?.scores.access) - numericScore(left.score?.scores.access);
    });
  return ranked[0] ?? null;
}

function pickResupply(
  eligible: CandidateBundle[],
  config: CampOpsRecommendationConfig,
): CandidateBundle | null {
  const ranked = eligible
    .filter((bundle) => numericScore(bundle.score?.scores.resources) >= config.resupplyMinimumResourceScore)
    .sort((left, right) => numericScore(right.score?.scores.resources) - numericScore(left.score?.scores.resources));
  return ranked[0] ?? null;
}

function pickRecovery(
  context: CampSearchContext,
  eligible: CandidateBundle[],
): CandidateBundle | null {
  if (!context.convoyProfile?.mechanicalIssueFlag) return null;
  const ranked = eligible
    .filter((bundle) => bundle.enrichment?.recoveryFriendly === true || bundle.enrichment?.nearestRepair)
    .sort((left, right) => {
      const leftDistance = left.enrichment?.nearestRepair?.routeAwareDistanceMiles ??
        left.enrichment?.nearestRepair?.distanceFromCampMiles ??
        left.enrichment?.serviceDistanceMiles ??
        Number.POSITIVE_INFINITY;
      const rightDistance = right.enrichment?.nearestRepair?.routeAwareDistanceMiles ??
        right.enrichment?.nearestRepair?.distanceFromCampMiles ??
        right.enrichment?.serviceDistanceMiles ??
        Number.POSITIVE_INFINITY;
      const accessDelta = numericScore(right.score?.scores.access) - numericScore(left.score?.scores.access);
      return accessDelta !== 0 ? accessDelta : leftDistance - rightDistance;
    });
  return ranked[0] ?? null;
}

function addRole(
  rolesByCandidateId: Record<string, CampOperationalRole[]>,
  candidate: CampCandidate | null | undefined,
  role: CampOperationalRole,
): void {
  if (!candidate) return;
  rolesByCandidateId[candidate.id] = unique([...(rolesByCandidateId[candidate.id] ?? []), role]) as CampOperationalRole[];
}

function rejectedCandidates(
  bundles: CandidateBundle[],
  config: CampOpsRecommendationConfig,
): CampRejectedCandidate[] {
  return bundles
    .flatMap((bundle): CampRejectedCandidate[] => {
      if (isRejected(bundle)) {
        return [{
          candidate: bundle.candidate,
          gates: bundle.hardGate?.failedGates ?? bundle.hardGate?.allGates ?? [],
          reasons: bundle.hardGate?.reasons ?? bundle.score?.explanation.negativeFactors ?? [],
        }];
      }
      const thresholdReasons = thresholdRejectionReasons(bundle, config);
      if (thresholdReasons.length === 0) return [];
      return [{
        candidate: bundle.candidate,
        gates: [],
        reasons: thresholdReasons,
      }];
    });
}

function buildWarnings(
  context: CampSearchContext,
  bundles: CandidateBundle[],
  recommended: CandidateBundle | null,
): string[] {
  const warnings: string[] = [];
  if (!recommended) warnings.push('No camp candidate cleared CampOps recommendation thresholds.');
  if (context.convoyProfile?.mechanicalIssueFlag && recommended?.enrichment?.recoveryFriendly !== true) {
    warnings.push('Convoy mechanical issue is active; recovery-friendly data is limited for the recommended camp.');
  }
  if (context.offlineMode === 'offline' || context.offlineMode === 'degraded') {
    warnings.push('CampOps is using offline or degraded data; verify freshness before committing.');
  }
  for (const bundle of bundles) {
    if (bundle.hardGate?.status === 'unknown') {
      warnings.push(`${bundle.candidate.name}: hard gates could not be fully cleared.`);
    }
    if (bundle.candidate.lastVerifiedDate == null) {
      warnings.push(`${bundle.candidate.name}: data freshness is unknown.`);
    }
    for (const limitation of bundle.enrichment?.dataLimitations ?? []) {
      if (limitation.toLowerCase().includes('stale') || limitation.toLowerCase().includes('freshness')) {
        warnings.push(`${bundle.candidate.name}: ${limitation}`);
      }
    }
    if (bundle.enrichment?.campfireAllowed === 'no') {
      warnings.push(`${bundle.candidate.name}: campfires are prohibited by the provided fire restriction source.`);
    } else if (bundle.enrichment?.campfireAllowed === 'unknown') {
      warnings.push(`${bundle.candidate.name}: campfire status unknown.`);
    }
    if (bundle.enrichment?.stoveAllowed === 'no' || bundle.enrichment?.stoveAllowed === 'restricted') {
      warnings.push(`${bundle.candidate.name}: stove use is restricted or prohibited.`);
    }
    if (bundle.enrichment?.redFlagRisk === 'high') {
      warnings.push(`${bundle.candidate.name}: high red-flag fire weather risk.`);
    }
    if (bundle.enrichment?.smokeOrAirQualityRisk === 'high') {
      warnings.push(`${bundle.candidate.name}: high smoke or air-quality risk.`);
    }
    if (bundle.enrichment?.weatherExposureLevel === 'high') {
      warnings.push(`${bundle.candidate.name}: high weather exposure during the forecast window.`);
    } else if (!bundle.enrichment?.weatherExposureLevel || bundle.enrichment.weatherExposureLevel === 'unknown') {
      warnings.push(`${bundle.candidate.name}: weather exposure unknown.`);
    }
    if (bundle.enrichment?.stormRisk === 'high') {
      warnings.push(`${bundle.candidate.name}: high storm risk in the forecast window.`);
    }
    if (bundle.enrichment?.heatRisk === 'high') {
      warnings.push(`${bundle.candidate.name}: high heat risk; water margin should be verified.`);
    }
    if (bundle.enrichment?.coldRisk === 'high') {
      warnings.push(`${bundle.candidate.name}: high cold risk; overnight exposure margin should be verified.`);
    }
    if (bundle.enrichment?.nearestFuel?.status === 'unknown') {
      warnings.push(`${bundle.candidate.name}: nearest fuel status is unknown.`);
    }
    if (bundle.enrichment?.nearestWater?.status === 'unknown') {
      warnings.push(`${bundle.candidate.name}: nearest water status is unknown.`);
    }
    if (bundle.enrichment?.nearestRepair?.status === 'unknown') {
      warnings.push(`${bundle.candidate.name}: nearest repair status is unknown.`);
    }
    if (trailerRequired(context) && (!bundle.enrichment?.turnaroundSuitability || bundle.enrichment.turnaroundSuitability === 'unknown')) {
      warnings.push(`${bundle.candidate.name}: trailer turnaround confidence unknown.`);
    }
    if (trailerRequired(context) && bundle.enrichment?.deadEndRisk === 'high') {
      warnings.push(`${bundle.candidate.name}: high dead-end risk for trailer handling.`);
    }
    if (context.convoyProfile?.vehicleCount != null && bundle.enrichment?.groupCapacityConfidence !== 'high') {
      warnings.push(`${bundle.candidate.name}: group capacity confidence is limited for the convoy size.`);
    }
  }
  return unique(warnings);
}

function buildAssumptions(context: CampSearchContext, bundles: CandidateBundle[]): string[] {
  return unique(
    [
      context.convoyProfile?.lowestFuelReserveVehicle || context.convoyProfile?.lowestWaterReserveVehicle
        ? 'Recommendation is based on the convoy’s limiting vehicle/resource.'
        : null,
      context.convoyProfile?.leastCapableVehicleProfile
        ? 'Access and trailer handling should be interpreted against the least capable vehicle in the convoy.'
        : null,
      context.convoyProfile?.mechanicalIssueFlag
        ? 'Mechanical issue flag favors endpoints with stronger recovery access where data exists.'
        : null,
      trailerRequired(context)
        ? 'Trailer handling uses turnaround, dead-end, backing, and road-width confidence where available.'
        : null,
      context.convoyProfile?.vehicleCount != null
        ? 'Group fit uses known group capacity and confidence where available.'
        : null,
      ...bundles.flatMap((bundle) => [
        ...(bundle.score?.explanation.assumptions ?? []),
        ...(bundle.enrichment?.dataLimitations ?? []),
      ]),
    ].filter((value): value is string => Boolean(value)),
  );
}

function explainSelection(
  label: string,
  bundle: CandidateBundle | null,
  details: string,
): string | null {
  if (!bundle) return null;
  const overall = bundle.score?.scores.overall;
  return `${bundle.candidate.name} selected for ${label}: ${details} Overall score ${overall ?? 'n/a'}.`;
}

function plannedDowngrade(
  context: CampSearchContext,
  planned: CandidateBundle | null,
  recommended: CandidateBundle | null,
): string | null {
  if (!context.plannedCampId || !planned || !recommended || planned.candidate.id === recommended.candidate.id) {
    return null;
  }
  const plannedScore = planned.score?.scores.overall ?? planned.score?.rankScore ?? null;
  const recommendedScore = recommended.score?.scores.overall ?? recommended.score?.rankScore ?? null;
  const reasons = planned.score?.explanation.negativeFactors.slice(0, 2).join(' ') || 'another camp has better operational margin.';
  return `Planned camp ${planned.candidate.name} was downgraded from primary because ${reasons} Planned score ${plannedScore ?? 'n/a'} vs recommended score ${recommendedScore ?? 'n/a'}.`;
}

function keyTradeoffs(
  context: CampSearchContext,
  recommended: CandidateBundle | null,
  backup: CandidateBundle | null,
  weatherFallback: CandidateBundle | null,
  resupply: CandidateBundle | null,
  trailerSafe: CandidateBundle | null,
): string[] {
  const tradeoffs: string[] = [];
  if (context.convoyProfile?.lowestFuelReserveVehicle || context.convoyProfile?.lowestWaterReserveVehicle) {
    tradeoffs.push('Recommendation is based on the convoy’s limiting vehicle/resource.');
  }
  if (context.convoyProfile?.mechanicalIssueFlag) {
    tradeoffs.push('Mechanical issue handling favors camps with easier recovery access when that data exists.');
  }
  if (recommended?.score?.explanation.negativeFactors.length) {
    tradeoffs.push(...recommended.score.explanation.negativeFactors.slice(0, 2));
  }
  if (backup && recommended && backup.candidate.id !== recommended.candidate.id) {
    tradeoffs.push(`${backup.candidate.name} is kept as a backup in case the primary endpoint changes.`);
  }
  if (weatherFallback && weatherFallback.candidate.id !== recommended?.candidate.id) {
    tradeoffs.push(`${weatherFallback.candidate.name} has stronger weather margin.`);
  }
  if (resupply && resupply.candidate.id !== recommended?.candidate.id) {
    tradeoffs.push(`${resupply.candidate.name} has stronger resource margin.`);
  }
  if (trailerSafe && trailerSafe.candidate.id !== recommended?.candidate.id) {
    tradeoffs.push(`${trailerSafe.candidate.name} has stronger trailer handling confidence.`);
  }
  return unique(tradeoffs);
}

function confidenceSummary(
  recommended: CandidateBundle | null,
  bundles: CandidateBundle[],
): CampRecommendationSet['confidenceSummary'] {
  const score = recommended?.score?.scores.dataConfidence ?? recommended?.score?.scores.overall ?? null;
  const missingDataFields = unique(
    bundles.flatMap((bundle) => [
      ...(bundle.hardGate?.missingData ?? []),
      ...(bundle.score?.explanation.missingData ?? []),
    ]),
  );
  const reasons = recommended
    ? [recommended.score?.explanation.confidenceNote ?? 'Recommended camp has CampOps scoring output.']
    : ['No recommended camp was selected from the provided candidates.'];
  return {
    level: confidenceLevel(score),
    score,
    reasons,
    missingDataFields,
  };
}

export function generateCampRecommendationSet({
  context,
  candidates,
  enrichmentsByCandidateId,
  hardGateEvaluationsByCandidateId,
  suitabilityScoresByCandidateId,
  config: configOverrides = {},
}: CampRecommendationInput): CampRecommendationSet {
  const config = resolveCampOpsRecommendationConfig(configOverrides);
  const bundles: CandidateBundle[] = candidates.map((candidate) => ({
    candidate,
    enrichment: enrichmentsByCandidateId[candidate.id],
    hardGate: hardGateEvaluationsByCandidateId[candidate.id],
    score: suitabilityScoresByCandidateId[candidate.id],
  }));
  const eligible = sortedEligible(bundles, config);
  const rankedCandidates = eligible.map((bundle) => bundle.candidate);
  const recommended = pickRecommended(context, eligible, config);
  const backup = pickBackup(recommended, eligible, config);
  const emergency = pickEmergency(bundles, config);
  const weatherFallback = pickWeatherFallback(eligible, config);
  const resupply = pickResupply(eligible, config);
  const recovery = pickRecovery(context, eligible);
  const trailerSafe = pickTrailerSafe(context, eligible, config);
  const planned = context.plannedCampId
    ? bundles.find((bundle) => bundle.candidate.id === context.plannedCampId) ?? null
    : null;

  const rolesByCandidateId: Record<string, CampOperationalRole[]> = {};
  addRole(rolesByCandidateId, recommended?.candidate, 'primary');
  addRole(rolesByCandidateId, backup?.candidate, 'backup');
  addRole(rolesByCandidateId, emergency?.candidate, 'emergency');
  addRole(rolesByCandidateId, weatherFallback?.candidate, 'weather_fallback');
  addRole(rolesByCandidateId, resupply?.candidate, 'resupply');
  addRole(rolesByCandidateId, recovery?.candidate, 'recovery');
  addRole(rolesByCandidateId, trailerSafe?.candidate, 'trailer_safe');

  const scoresByCandidateId: Record<string, CampSuitabilityScores> = {};
  const serializableEnrichmentsByCandidateId: Record<string, CampCandidateEnrichment> = {};
  for (const bundle of bundles) {
    if (bundle.score) scoresByCandidateId[bundle.candidate.id] = bundle.score.scores;
    if (bundle.enrichment) serializableEnrichmentsByCandidateId[bundle.candidate.id] = bundle.enrichment;
  }

  const explanations: CampRecommendationExplanations = {
    whyRecommended: explainSelection(
      'recommended camp',
      recommended,
      'best balance of safety, legality, access, resources, time, and group fit.',
    ),
    whyBackup: explainSelection(
      'backup camp',
      backup,
      'viable alternative if the primary camp is occupied, inaccessible, or conditions change.',
    ),
    whyEmergency: explainSelection(
      'emergency camp',
      emergency,
      'prioritizes safety, access certainty, resources, time, and data confidence over comfort.',
    ),
    whyWeatherFallback: explainSelection('weather fallback', weatherFallback, 'best weather exposure score among viable camps.'),
    whyResupply: explainSelection('resupply camp', resupply, 'best resource margin among viable camps.'),
    whyTrailerSafe: explainSelection('trailer-safe camp', trailerSafe, 'best trailer fit and access margin for the group.'),
    plannedCampDowngrade: plannedDowngrade(context, planned, recommended),
    keyTradeoffs: keyTradeoffs(context, recommended, backup, weatherFallback, resupply, trailerSafe),
  };

  const recommendationSet: CampRecommendationSet = {
    ...createEmptyCampRecommendationSet(confidenceSummary(recommended, bundles).level),
    recommendedCamp: recommended?.candidate ?? null,
    backupCamp: backup?.candidate ?? null,
    emergencyCamp: emergency?.candidate ?? null,
    weatherFallbackCamp: weatherFallback?.candidate ?? null,
    resupplyCamp: resupply?.candidate ?? null,
    trailerSafeCamp: trailerSafe?.candidate ?? null,
    rankedCandidates,
    rejectedCandidates: rejectedCandidates(bundles, config),
    warnings: buildWarnings(context, bundles, recommended).concat(
      recommended && numericScore(recommended.score?.rankScore) < config.noGoodCampWarningScore
        ? ['Recommended camp score is below the preferred operating threshold.']
        : [],
    ),
    assumptions: buildAssumptions(context, bundles),
    confidenceSummary: confidenceSummary(recommended, bundles),
    rolesByCandidateId,
    scoresByCandidateId,
    enrichmentsByCandidateId: serializableEnrichmentsByCandidateId,
    explanations,
  };
  emitCampOpsRecommendationGenerated(context, recommendationSet, true);
  return recommendationSet;
}
