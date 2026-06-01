import type {
  CampCandidate,
  CampOpsConfidence,
  CampOpsDataSource,
  CampRecommendationSet,
} from './campOpsTypes';
import { normalizeCampOpsScore } from './campOpsTypes';

export type CampOpsMapPinRole = 'recommended' | 'backup' | 'emergency';
export type CampOpsMapPinKind = CampOpsMapPinRole | 'candidate';

export type CampOpsSharedCampPinSourceType =
  | 'ecs_inferred'
  | 'official_mapped'
  | 'community_suggested'
  | 'imported_route_context'
  | 'unknown';

export type CampOpsSharedCampPinGrade = 'A' | 'B' | 'C' | 'D';

export type CampOpsMapPinPayload = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  sourceType: CampOpsSharedCampPinSourceType;
  confidenceGrade: CampOpsSharedCampPinGrade;
  confidenceScore: number;
  rank: number;
  rankLabel: string;
  selected?: boolean;
  pinFamily: 'campops';
  campOpsRole: CampOpsMapPinKind;
  campOpsCandidateId: string;
  campOpsRoleLabel: string;
  accessibilityLabel: string;
};

type BuildCampOpsMapPinOptions = {
  selectedCampOpsCandidateId?: string | null;
  allowFallbackRoleCandidates?: boolean;
  minimumConfidenceScore?: number | null;
};

const ROLE_CONFIG: Record<
  CampOpsMapPinKind,
  { label: string; rank: number; rankLabel: string }
> = {
  candidate: { label: 'Camp candidate', rank: 0, rankLabel: '1' },
  recommended: { label: 'Recommended endpoint', rank: 1, rankLabel: 'REC' },
  backup: { label: 'Backup endpoint', rank: 2, rankLabel: 'BKP' },
  emergency: { label: 'Emergency fallback', rank: 3, rankLabel: 'EMG' },
};
const CAMP_OPS_ROUTE_PIN_LIMIT = 5;
const CAMP_OPS_ROUTE_PIN_MIN_CONFIDENCE_SCORE = 70;

const CONFIDENCE_FALLBACK_SCORE: Record<CampOpsConfidence, number> = {
  high: 85,
  medium: 72,
  low: 55,
  unknown: 0,
};

export function getCampOpsMapPinRoleLabel(role: CampOpsMapPinRole): string {
  return ROLE_CONFIG[role].label;
}

export function isCampOpsMapPinPayload(payload: unknown): payload is CampOpsMapPinPayload {
  return (
    !!payload &&
    typeof payload === 'object' &&
    (payload as { pinFamily?: unknown }).pinFamily === 'campops' &&
    typeof (payload as { campOpsCandidateId?: unknown }).campOpsCandidateId === 'string'
  );
}

export function campOpsSourceToSharedCampPinSource(
  source: CampOpsDataSource | null | undefined,
): CampOpsSharedCampPinSourceType {
  switch (source) {
    case 'community':
      return 'community_suggested';
    case 'private':
    case 'group':
    case 'gpx':
    case 'manual':
    case 'user_saved':
      return 'imported_route_context';
    case 'route_candidate':
    case 'draw_area_candidate':
    case 'inferred':
    case 'offline_dataset':
      return 'ecs_inferred';
    case 'unknown':
    default:
      return 'unknown';
  }
}

export function campOpsConfidenceToSharedCampPinGrade(
  confidence: CampOpsConfidence | null | undefined,
): CampOpsSharedCampPinGrade {
  switch (confidence) {
    case 'high':
      return 'A';
    case 'medium':
      return 'B';
    case 'low':
      return 'C';
    case 'unknown':
    default:
      return 'D';
  }
}

function confidenceFromScore(score: number | null, fallback: CampOpsConfidence): CampOpsConfidence {
  if (score == null) return fallback;
  if (score >= 85) return 'high';
  if (score >= 70) return 'medium';
  if (score > 0) return 'low';
  return 'unknown';
}

function scoreForCamp(
  camp: CampCandidate,
  role: CampOpsMapPinKind,
  recommendationSet: CampRecommendationSet,
): number {
  const score =
    normalizeCampOpsScore(recommendationSet.scoresByCandidateId?.[camp.id]?.overall) ??
    normalizeCampOpsScore(camp.score) ??
    normalizeCampOpsScore(recommendationSet.confidenceSummary.score) ??
    CONFIDENCE_FALLBACK_SCORE[camp.sourceConfidence ?? recommendationSet.confidenceSummary.level];

  if (role === 'emergency') return Math.min(100, Math.max(0, score));
  return Math.min(100, Math.max(0, score));
}

function pinForCamp(
  role: CampOpsMapPinKind,
  camp: CampCandidate | null | undefined,
  recommendationSet: CampRecommendationSet,
  options: BuildCampOpsMapPinOptions,
  rankOverride?: number,
): CampOpsMapPinPayload | null {
  if (!camp) return null;
  if (
    !camp.location ||
    typeof camp.location.latitude !== 'number' ||
    typeof camp.location.longitude !== 'number' ||
    !Number.isFinite(camp.location.latitude) ||
    !Number.isFinite(camp.location.longitude)
  ) {
    return null;
  }

  const roleConfig = ROLE_CONFIG[role];
  const rank = rankOverride ?? roleConfig.rank;
  const displayLabel = role === 'candidate' ? `Camp ${rank}` : roleConfig.label;
  const score = scoreForCamp(camp, role, recommendationSet);
  const confidence = confidenceFromScore(score, camp.sourceConfidence ?? 'unknown');
  const grade = campOpsConfidenceToSharedCampPinGrade(confidence);
  const title = role === 'candidate' ? displayLabel : camp.name?.trim() || roleConfig.label;

  return {
    id: `campops-${role}-${camp.id}`,
    latitude: camp.location.latitude,
    longitude: camp.location.longitude,
    title,
    sourceType: campOpsSourceToSharedCampPinSource(camp.source),
    confidenceGrade: grade,
    confidenceScore: score,
    rank,
    rankLabel: role === 'candidate' ? String(rank) : roleConfig.rankLabel,
    selected: options.selectedCampOpsCandidateId === camp.id,
    pinFamily: 'campops',
    campOpsRole: role,
    campOpsCandidateId: camp.id,
    campOpsRoleLabel: displayLabel,
    accessibilityLabel: `${displayLabel}: ${camp.name?.trim() || 'camp candidate'}. ${confidence} confidence. Verify legal and access status before committing.`,
  };
}

function fallbackRoleCandidates(recommendationSet: CampRecommendationSet): CampCandidate[] {
  return [
    recommendationSet.recommendedCamp,
    recommendationSet.backupCamp,
    recommendationSet.emergencyCamp,
    recommendationSet.weatherFallbackCamp,
    recommendationSet.resupplyCamp,
    recommendationSet.trailerSafeCamp,
  ].filter((camp): camp is CampCandidate => !!camp);
}

export function buildCampOpsCampScoutMapPins(
  recommendationSet: CampRecommendationSet | null | undefined,
  options: BuildCampOpsMapPinOptions = {},
): CampOpsMapPinPayload[] {
  if (!recommendationSet) return [];

  const seen = new Set<string>();
  const rankedCandidates = Array.isArray(recommendationSet.rankedCandidates)
    ? recommendationSet.rankedCandidates
    : options.allowFallbackRoleCandidates === true
      ? fallbackRoleCandidates(recommendationSet)
      : [];
  const minimumConfidenceScore =
    options.minimumConfidenceScore === null
      ? null
      : typeof options.minimumConfidenceScore === 'number'
      ? Math.max(0, Math.min(100, options.minimumConfidenceScore))
      : CAMP_OPS_ROUTE_PIN_MIN_CONFIDENCE_SCORE;
  const pins: CampOpsMapPinPayload[] = [];

  for (const camp of rankedCandidates) {
    if (seen.has(camp.id)) continue;
    seen.add(camp.id);
    const pin = pinForCamp('candidate', camp, recommendationSet, options, pins.length + 1);
    if (!pin) continue;
    if (minimumConfidenceScore != null && pin.confidenceScore < minimumConfidenceScore) continue;
    pins.push(pin);
    if (pins.length >= CAMP_OPS_ROUTE_PIN_LIMIT) break;
  }

  return pins;
}
