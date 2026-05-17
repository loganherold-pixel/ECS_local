import type {
  CampCandidate,
  CampCandidateEnrichment,
  CampOpsConfidence,
  CampRecommendationSet,
  CampSuitabilityScores,
} from './campOpsTypes';
import { normalizeCampOpsScore } from './campOpsTypes';

export type CampOpsCampIntelMetric = {
  label: string;
  value: string;
  detail?: string;
};

export type CampOpsCampIntelViewModel = {
  candidateId: string;
  title: string;
  campName: string;
  statusLabel: 'ECS-Inferred Camp Candidate';
  overallScore: string;
  sourceConfidence: string;
  metrics: CampOpsCampIntelMetric[];
  rationale: string;
  uncertaintyNotes: string[];
  latitude: number;
  longitude: number;
};

function confidenceLabel(confidence: CampOpsConfidence | string | null | undefined): string {
  switch (confidence) {
    case 'high':
      return 'High source confidence';
    case 'medium':
      return 'Medium source confidence';
    case 'low':
      return 'Low source confidence';
    default:
      return 'Source confidence unknown';
  }
}

function confidenceScore(confidence: CampOpsConfidence | string | null | undefined): number | null {
  switch (confidence) {
    case 'high':
      return 85;
    case 'medium':
      return 72;
    case 'low':
      return 55;
    default:
      return null;
  }
}

function formatScore(value: number | null | undefined): string {
  const score = normalizeCampOpsScore(value);
  return score == null ? 'Needs verification' : `${score}/100`;
}

function formatDistance(miles: number | null | undefined): string {
  if (typeof miles !== 'number' || !Number.isFinite(miles)) return 'Needs verification';
  if (miles < 0.1) return 'On route corridor';
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}

function humanize(value: string | null | undefined): string {
  if (!value) return 'Needs verification';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatEstimate(
  estimate: CampCandidateEnrichment['terrainSlopeEstimate'],
  fallback: string,
): string {
  if (!estimate || estimate.value == null || !Number.isFinite(estimate.value)) return fallback;
  if (estimate.unit === 'degrees') return `${estimate.value} deg slope estimate`;
  if (estimate.unit === 'percent_grade') return `${estimate.value}% grade estimate`;
  if (estimate.unit === 'score') return `${estimate.value}/100 terrain estimate`;
  return fallback;
}

function firstKnownScore(
  scores: CampSuitabilityScores | undefined,
  keys: Array<keyof CampSuitabilityScores>,
): number | null {
  for (const key of keys) {
    const score = normalizeCampOpsScore(scores?.[key]);
    if (score != null) return score;
  }
  return null;
}

function candidateRank(
  recommendationSet: CampRecommendationSet,
  candidateId: string,
): number | null {
  const ranked = recommendationSet.rankedCandidates ?? [];
  const index = ranked.findIndex((candidate) => candidate.id === candidateId);
  return index >= 0 ? index + 1 : null;
}

function candidatePool(recommendationSet: CampRecommendationSet): CampCandidate[] {
  return [
    ...(recommendationSet.rankedCandidates ?? []),
    recommendationSet.recommendedCamp,
    recommendationSet.backupCamp,
    recommendationSet.emergencyCamp,
    recommendationSet.weatherFallbackCamp,
    recommendationSet.resupplyCamp,
    recommendationSet.trailerSafeCamp,
  ].filter((candidate): candidate is CampCandidate => !!candidate);
}

function candidateRationale(
  candidate: CampCandidate,
  scores: CampSuitabilityScores | undefined,
  enrichment: CampCandidateEnrichment | undefined,
  recommendationSet: CampRecommendationSet,
): string {
  const tradeoff = recommendationSet.explanations?.keyTradeoffs?.[0];
  if (tradeoff) return tradeoff;
  const reason = candidate.tags?.find((tag) => typeof tag === 'string' && tag.trim().length > 0);
  if (reason) return reason;
  const score = normalizeCampOpsScore(scores?.overall ?? candidate.score);
  if (score != null && score >= 75) {
    return 'Likely suitable based on the available CampOps route, terrain, access, and source-confidence signals.';
  }
  if (enrichment?.lateArrivalRisk === 'critical' || enrichment?.weatherExposure === 'critical') {
    return 'Usable only with caution because time, weather, or arrival risk needs field verification.';
  }
  return 'CampOps surfaced this candidate from available route and camp signals. Verify access, posted rules, and current conditions before committing.';
}

function uncertaintyNotes(
  candidate: CampCandidate,
  enrichment: CampCandidateEnrichment | undefined,
  recommendationSet: CampRecommendationSet,
): string[] {
  const notes = [
    candidate.legalConfidence !== 'high'
      ? 'Access not fully verified. Do not treat this as an allowed overnight stop until confirmed by posted rules or provider data.'
      : null,
    enrichment?.legalStatus && enrichment.legalStatus !== 'allowed'
      ? `Legal/source status: ${humanize(enrichment.legalStatus)}. Verify before arrival.`
      : null,
    enrichment?.dataConfidence && enrichment.dataConfidence !== 'high'
      ? `${confidenceLabel(enrichment.dataConfidence)}. Missing or stale inputs may affect ranking.`
      : null,
    ...(enrichment?.dataLimitations ?? []),
    ...(recommendationSet.warnings ?? []),
  ].filter((note): note is string => !!note && note.trim().length > 0);

  return Array.from(new Set(notes)).slice(0, 4);
}

export function buildCampOpsCampIntelViewModel(
  recommendationSet: CampRecommendationSet | null | undefined,
  candidateId: string | null | undefined,
): CampOpsCampIntelViewModel | null {
  if (!recommendationSet || !candidateId) return null;
  const candidate = candidatePool(recommendationSet).find((item) => item.id === candidateId);
  if (!candidate?.location) return null;
  const { latitude, longitude } = candidate.location;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const rank = candidateRank(recommendationSet, candidate.id);
  const scores = recommendationSet.scoresByCandidateId?.[candidate.id];
  const enrichment = recommendationSet.enrichmentsByCandidateId?.[candidate.id];
  const overallScore =
    normalizeCampOpsScore(scores?.overall) ??
    normalizeCampOpsScore(candidate.score) ??
    normalizeCampOpsScore(recommendationSet.confidenceSummary.score);
  const accessScore =
    firstKnownScore(scores, ['access']) ??
    confidenceScore(enrichment?.roadWidthConfidence) ??
    confidenceScore(candidate.sourceConfidence);
  const legalScore =
    firstKnownScore(scores, ['legal']) ??
    confidenceScore(enrichment?.legalConfidence) ??
    confidenceScore(candidate.legalConfidence);
  const distanceMiles =
    enrichment?.routeDistanceToCampMiles ??
    enrichment?.straightLineDistanceToCampMiles ??
    null;

  return {
    candidateId: candidate.id,
    title: rank ? `Camp ${rank}` : candidate.name || 'Camp candidate',
    campName: candidate.name || (rank ? `Camp ${rank}` : 'Camp candidate'),
    statusLabel: 'ECS-Inferred Camp Candidate',
    overallScore: formatScore(overallScore),
    sourceConfidence: confidenceLabel(candidate.sourceConfidence),
    metrics: [
      {
        label: 'Terrain suitability',
        value: formatScore(firstKnownScore(scores, ['terrain'])),
        detail: formatEstimate(enrichment?.terrainSlopeEstimate, 'Terrain source coverage may be incomplete.'),
      },
      {
        label: 'Access confidence',
        value: formatScore(accessScore),
        detail: humanize(enrichment?.accessDifficulty ?? candidate.accessDifficulty ?? 'unknown'),
      },
      {
        label: 'Legal/source confidence',
        value: formatScore(legalScore),
        detail: confidenceLabel(enrichment?.legalConfidence ?? candidate.legalConfidence ?? candidate.sourceConfidence),
      },
      {
        label: 'Weather exposure',
        value: formatScore(firstKnownScore(scores, ['weather'])),
        detail: humanize(enrichment?.weatherExposureLevel ?? enrichment?.weatherExposure ?? 'unknown'),
      },
      {
        label: 'Remoteness / late-arrival',
        value: formatScore(firstKnownScore(scores, ['privacy', 'lateArrival', 'time'])),
        detail: `Late arrival: ${humanize(enrichment?.lateArrivalRisk ?? 'unknown')}`,
      },
      {
        label: 'Distance from route',
        value: formatDistance(distanceMiles),
        detail: distanceMiles == null ? 'Route offset unavailable' : 'Route corridor estimate',
      },
    ],
    rationale: candidateRationale(candidate, scores, enrichment, recommendationSet),
    uncertaintyNotes: uncertaintyNotes(candidate, enrichment, recommendationSet),
    latitude,
    longitude,
  };
}
