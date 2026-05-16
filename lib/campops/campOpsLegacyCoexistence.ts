import type {
  CampsiteCandidate as LegacyCampsiteCandidate,
  CampsiteCandidateResult,
} from '../campsiteCandidateEngine';
import { campOpsCandidateFromGeneratedCandidate } from './campOpsAdapters';
import type {
  CampAccessDifficulty,
  CampCandidate,
  CampCandidateEnrichment,
  CampOpsConfidence,
  CampOpsDataSource,
  CampRecommendationSet,
} from './campOpsTypes';
import { normalizeCampOpsScore } from './campOpsTypes';

export type CampOpsLegacyCandidateStatusKind =
  | 'recommended_endpoint'
  | 'backup_endpoint'
  | 'emergency_fallback'
  | 'not_recommended'
  | 'caution'
  | 'available_result';

export type CampOpsLegacyCandidateStatus = {
  kind: CampOpsLegacyCandidateStatusKind;
  label: string;
  detail: string;
};

export const CAMP_OPS_ENDPOINT_RECOMMENDATION_LABEL = 'Endpoint recommendation';
export const CAMP_OPS_LEGACY_SEARCH_RESULTS_LABEL = 'Search results';

export type CampOpsLegacyDisplayFields = {
  campOpsCandidateId: string;
  status: CampOpsLegacyCandidateStatus;
  listLabel: typeof CAMP_OPS_LEGACY_SEARCH_RESULTS_LABEL;
  endpointLabel: typeof CAMP_OPS_ENDPOINT_RECOMMENDATION_LABEL;
  legacyRankMeaning: 'search_result_rank';
  legacyRankCopy: 'Search result rank';
  recommendedDisplayRank: number | null;
  displayScore: number | null;
  displayScoreMeaning: 'campops_suitability_score' | 'legacy_display_score';
  displayLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  displayConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  roleLabels: string[];
  displayReasons: string[];
  shouldDeemphasizeLegacyRank: boolean;
};

export type CampOpsLegacyCandidateEnrichmentDraft = Pick<
  CampCandidateEnrichment,
  | 'candidateId'
  | 'legalConfidence'
  | 'accessDifficulty'
  | 'routeDistanceToCampMiles'
  | 'terrainSlopeEstimate'
  | 'dataConfidence'
  | 'dataLimitations'
> & Partial<CampCandidateEnrichment>;

export function legacySourceForCampOps(
  result: Pick<CampsiteCandidateResult, 'analysisSource' | 'source'>,
): Extract<CampOpsDataSource, 'route_candidate' | 'draw_area_candidate'> {
  return result.analysisSource === 'polygon' || result.source === 'polygon'
    ? 'draw_area_candidate'
    : 'route_candidate';
}

export function campOpsIdForLegacyCandidate(
  candidate: Pick<LegacyCampsiteCandidate, 'segmentIndex' | 'coordinates'>,
  result: Pick<CampsiteCandidateResult, 'analysisSource' | 'source'>,
): string {
  const source = legacySourceForCampOps(result);
  return `generated:${source}:${candidate.segmentIndex}:${candidate.coordinates[0].toFixed(5)},${candidate.coordinates[1].toFixed(5)}`;
}

function confidenceFromLegacyConfidence(confidence: string | null | undefined): CampOpsConfidence {
  const normalized = String(confidence ?? '').toLowerCase();
  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'low') return 'low';
  return 'unknown';
}

function confidenceFromScore(score: number | null | undefined): CampOpsConfidence {
  const normalized = normalizeCampOpsScore(score);
  if (normalized == null) return 'unknown';
  if (normalized >= 75) return 'high';
  if (normalized >= 50) return 'medium';
  if (normalized > 0) return 'low';
  return 'unknown';
}

function accessDifficultyForCampOps(value: LegacyCampsiteCandidate['difficulty']): CampAccessDifficulty {
  if (value === 'easy') return 'easy';
  if (value === 'moderate') return 'moderate';
  if (value === 'challenging') return 'high_clearance';
  if (value === 'difficult') return 'technical';
  return 'unknown';
}

function legacyDisplayLevelFromScore(score: number | null): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score == null) return 'LOW';
  if (score >= 75) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
}

function displayConfidenceFromCampOps(confidence: CampOpsConfidence | null | undefined): CampOpsLegacyDisplayFields['displayConfidence'] {
  if (confidence === 'high') return 'HIGH';
  if (confidence === 'medium') return 'MEDIUM';
  if (confidence === 'low') return 'LOW';
  return 'UNKNOWN';
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function roleLabelsForCandidate(candidateId: string, recommendationSet: CampRecommendationSet): string[] {
  const labels: string[] = [];
  if (recommendationSet.recommendedCamp?.id === candidateId) labels.push('Recommended endpoint');
  if (recommendationSet.backupCamp?.id === candidateId) labels.push('Backup endpoint');
  if (recommendationSet.emergencyCamp?.id === candidateId) labels.push('Emergency fallback');
  if (recommendationSet.weatherFallbackCamp?.id === candidateId) labels.push('Weather fallback');
  if (recommendationSet.resupplyCamp?.id === candidateId) labels.push('Resupply option');
  if (recommendationSet.trailerSafeCamp?.id === candidateId) labels.push('Trailer-compatible option');
  for (const role of recommendationSet.rolesByCandidateId?.[candidateId] ?? []) {
    if (role === 'primary') labels.push('Recommended endpoint');
    if (role === 'backup') labels.push('Backup endpoint');
    if (role === 'emergency') labels.push('Emergency fallback');
    if (role === 'weather_fallback') labels.push('Weather fallback');
    if (role === 'resupply') labels.push('Resupply option');
    if (role === 'trailer_safe') labels.push('Trailer-compatible option');
  }
  return dedupeStrings(labels);
}

function recommendationRankForCandidate(candidateId: string, recommendationSet: CampRecommendationSet): number | null {
  if (recommendationSet.recommendedCamp?.id === candidateId) return 1;
  if (recommendationSet.backupCamp?.id === candidateId) return 2;
  if (recommendationSet.emergencyCamp?.id === candidateId) return 3;
  if (recommendationSet.weatherFallbackCamp?.id === candidateId) return 4;
  if (recommendationSet.resupplyCamp?.id === candidateId) return 5;
  if (recommendationSet.trailerSafeCamp?.id === candidateId) return 6;
  return null;
}

export function campOpsCandidateFromLegacySearchResult(
  candidate: LegacyCampsiteCandidate,
  result: Pick<CampsiteCandidateResult, 'analysisSource' | 'source'>,
): CampCandidate {
  return campOpsCandidateFromGeneratedCandidate(candidate, legacySourceForCampOps(result));
}

export function campOpsEnrichmentDraftFromLegacyCandidate(
  candidate: LegacyCampsiteCandidate,
  result: Pick<CampsiteCandidateResult, 'analysisSource' | 'source'>,
): CampOpsLegacyCandidateEnrichmentDraft {
  const campOpsCandidateId = campOpsIdForLegacyCandidate(candidate, result);
  const terrainScore = normalizeCampOpsScore(candidate.terrainScore ?? candidate.qualityScore);
  const legalConfidence = confidenceFromScore(candidate.legalAccessScore);
  const dataConfidence = candidate.legalAccessScore == null
    ? confidenceFromLegacyConfidence(candidate.confidence)
    : legalConfidence;
  return {
    candidateId: campOpsCandidateId,
    legalConfidence,
    accessDifficulty: accessDifficultyForCampOps(candidate.difficulty),
    routeDistanceToCampMiles: Number.isFinite(candidate.distanceMiles) ? candidate.distanceMiles : null,
    terrainSlopeEstimate: {
      value: terrainScore,
      unit: 'score',
      confidence: confidenceFromScore(terrainScore),
      source: 'inferred',
    },
    dataConfidence,
    dataLimitations: [
      'Converted from legacy generated camp result data.',
      'Legal, closure, fire, weather, services, occupancy, and resource details may require CampOps providers.',
    ],
  };
}

export function getCampOpsLegacyCandidateStatus(
  candidate: Pick<LegacyCampsiteCandidate, 'segmentIndex' | 'coordinates'>,
  result: Pick<CampsiteCandidateResult, 'analysisSource' | 'source'>,
  recommendationSet: CampRecommendationSet | null | undefined,
): CampOpsLegacyCandidateStatus | null {
  if (!recommendationSet) return null;
  const candidateId = campOpsIdForLegacyCandidate(candidate, result);
  const rejected = recommendationSet.rejectedCandidates.find((item) => item.candidate.id === candidateId);
  if (rejected) {
    return {
      kind: 'not_recommended',
      label: 'Not recommended',
      detail: rejected.reasons[0] ?? 'CampOps rejected this search result.',
    };
  }
  if (recommendationSet.recommendedCamp?.id === candidateId) {
    return {
      kind: 'recommended_endpoint',
      label: 'Endpoint recommendation',
      detail: 'CampOps selected this as the operational endpoint.',
    };
  }
  if (recommendationSet.backupCamp?.id === candidateId) {
    return {
      kind: 'backup_endpoint',
      label: 'Backup endpoint',
      detail: 'CampOps selected this as the backup endpoint.',
    };
  }
  if (recommendationSet.emergencyCamp?.id === candidateId) {
    return {
      kind: 'emergency_fallback',
      label: 'Emergency fallback',
      detail: 'CampOps selected this as an emergency fallback.',
    };
  }
  const scores = recommendationSet.scoresByCandidateId?.[candidateId];
  const enrichment = recommendationSet.enrichmentsByCandidateId?.[candidateId];
  if (
    (scores?.overall != null && scores.overall < 60) ||
    enrichment?.lateArrivalRisk === 'critical' ||
    enrichment?.lateArrivalRisk === 'caution'
  ) {
    return {
      kind: 'caution',
      label: 'CampOps caution',
      detail: 'CampOps scored this search result with caution.',
    };
  }
  return {
    kind: 'available_result',
    label: 'Search result',
    detail: 'Available in the legacy search list; not the primary CampOps endpoint.',
  };
}

export function campOpsRecommendationToLegacyDisplayFields(
  candidate: LegacyCampsiteCandidate,
  result: Pick<CampsiteCandidateResult, 'analysisSource' | 'source'>,
  recommendationSet: CampRecommendationSet | null | undefined,
): CampOpsLegacyDisplayFields | null {
  const status = getCampOpsLegacyCandidateStatus(candidate, result, recommendationSet);
  if (!status || !recommendationSet) return null;
  const candidateId = campOpsIdForLegacyCandidate(candidate, result);
  const campOpsScore = recommendationSet.scoresByCandidateId?.[candidateId]?.overall ?? null;
  const legacyScore = normalizeCampOpsScore(candidate.score ?? candidate.qualityScore);
  const displayScore = campOpsScore ?? legacyScore;
  const roleLabels = roleLabelsForCandidate(candidateId, recommendationSet);
  const rejected = recommendationSet.rejectedCandidates.find((item) => item.candidate.id === candidateId);
  return {
    campOpsCandidateId: candidateId,
    status,
    listLabel: CAMP_OPS_LEGACY_SEARCH_RESULTS_LABEL,
    endpointLabel: CAMP_OPS_ENDPOINT_RECOMMENDATION_LABEL,
    legacyRankMeaning: 'search_result_rank',
    legacyRankCopy: 'Search result rank',
    recommendedDisplayRank: recommendationRankForCandidate(candidateId, recommendationSet),
    displayScore,
    displayScoreMeaning: campOpsScore == null ? 'legacy_display_score' : 'campops_suitability_score',
    displayLevel: legacyDisplayLevelFromScore(displayScore),
    displayConfidence: displayConfidenceFromCampOps(
      recommendationSet.enrichmentsByCandidateId?.[candidateId]?.dataConfidence
        ?? recommendationSet.confidenceSummary.level,
    ),
    roleLabels,
    displayReasons: dedupeStrings([
      status.detail,
      rejected?.reasons[0],
      ...candidate.candidateReason,
      ...candidate.confidenceReasons,
    ]).slice(0, 5),
    shouldDeemphasizeLegacyRank: status.kind === 'not_recommended' || status.kind === 'caution',
  };
}

export function orderLegacyCandidatesByCampOpsCompatibility(
  result: Pick<CampsiteCandidateResult, 'suggestedCampsites' | 'analysisSource' | 'source'>,
  recommendationSet: CampRecommendationSet | null | undefined,
): LegacyCampsiteCandidate[] {
  if (!recommendationSet) return result.suggestedCampsites;
  const originalIndex = new Map(result.suggestedCampsites.map((candidate, index) => [candidate, index]));
  const weightForCandidate = (candidate: LegacyCampsiteCandidate): number => {
    const status = getCampOpsLegacyCandidateStatus(candidate, result, recommendationSet);
    if (status?.kind === 'recommended_endpoint') return 0;
    if (status?.kind === 'backup_endpoint') return 1;
    if (status?.kind === 'available_result') return 2;
    if (status?.kind === 'emergency_fallback') return 3;
    if (status?.kind === 'caution') return 4;
    if (status?.kind === 'not_recommended') return 5;
    return 6;
  };
  return [...result.suggestedCampsites].sort((a, b) => {
    const weightDelta = weightForCandidate(a) - weightForCandidate(b);
    if (weightDelta !== 0) return weightDelta;
    return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
  });
}

export function getCampOpsLegacyListNotice(
  result: Pick<CampsiteCandidateResult, 'suggestedCampsites' | 'analysisSource' | 'source'>,
  recommendationSet: CampRecommendationSet | null | undefined,
): string | null {
  if (!recommendationSet) return null;
  const topLegacyCandidate = result.suggestedCampsites[0];
  const recommendedId = recommendationSet.recommendedCamp?.id ?? null;
  if (!topLegacyCandidate || !recommendedId) {
    return 'CampOps did not select a primary endpoint; legacy entries remain available search results.';
  }
  const topLegacyId = campOpsIdForLegacyCandidate(topLegacyCandidate, result);
  const topStatus = getCampOpsLegacyCandidateStatus(topLegacyCandidate, result, recommendationSet);
  if (topStatus?.kind === 'not_recommended') {
    return 'Top search result is not recommended by CampOps; use Endpoint recommendation cards for the operational choice.';
  }
  if (recommendationSet.explanations?.plannedCampDowngrade) {
    return 'Planned camp was downgraded by CampOps; legacy search order is not the endpoint recommendation.';
  }
  if (topLegacyId !== recommendedId) {
    return 'Endpoint recommendation differs from top search result; legacy entries remain available search results.';
  }
  return 'CampOps cards are operational recommendations; legacy entries remain available search results.';
}
