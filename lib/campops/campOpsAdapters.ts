import type { CampsiteCandidate as GeneratedCampsiteCandidate } from '../campsiteCandidateEngine';
import type { CampsiteCandidate as LocatorCampsiteCandidate } from '../campsites/campsiteLocatorService';
import type {
  CampSiteReportResponse,
  PublicCampSite,
} from '../campsites/campsiteRecommendationService';
import type { GroupCampSiteItem } from '../campsites/campsiteGroupSharingService';
import type {
  CampAccessDifficulty,
  CampCandidate,
  CampOpsConfidence,
  CampOpsDataSource,
} from './campOpsTypes';
import { normalizeCampOpsScore } from './campOpsTypes';

function confidenceFromScore(score: number | null | undefined): CampOpsConfidence {
  if (score == null || !Number.isFinite(Number(score))) return 'unknown';
  const normalized = normalizeCampOpsScore(score) ?? 0;
  if (normalized >= 75) return 'high';
  if (normalized >= 50) return 'medium';
  if (normalized > 0) return 'low';
  return 'unknown';
}

function confidenceFromLegacy(value: string | null | undefined): CampOpsConfidence {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'unknown';
}

function normalizeAccessDifficulty(value: string | null | undefined): CampAccessDifficulty | string | null {
  if (!value) return null;
  if (value === 'easy' || value === 'moderate') return value;
  if (value === 'high_clearance') return 'high_clearance';
  if (value === 'technical') return 'technical';
  return value;
}

export function campOpsCandidateFromGeneratedCandidate(
  candidate: GeneratedCampsiteCandidate,
  source: Extract<CampOpsDataSource, 'route_candidate' | 'draw_area_candidate'> = 'route_candidate',
): CampCandidate {
  const score = normalizeCampOpsScore(candidate.score ?? candidate.qualityScore);
  return {
    id: `generated:${source}:${candidate.segmentIndex}:${candidate.coordinates[0].toFixed(5)},${candidate.coordinates[1].toFixed(5)}`,
    name: candidate.segmentRange || `Camp option ${candidate.segmentIndex + 1}`,
    location: {
      latitude: candidate.coordinates[0],
      longitude: candidate.coordinates[1],
    },
    source,
    sourceConfidence: confidenceFromLegacy(candidate.confidence.toLowerCase()),
    poiType: 'generated_camp_candidate',
    category: candidate.credibilityTier,
    description: candidate.candidateReason.join('; ') || null,
    rating: candidate.rating ?? null,
    score,
    tags: candidate.candidateReason,
    accessDifficulty: candidate.difficulty,
    legalConfidence: candidate.legalAccessScore == null ? 'unknown' : confidenceFromScore(candidate.legalAccessScore),
    ratingFactors: candidate.ratingFactors,
    existingRef: {
      system: 'campsite_candidate',
      id: `${candidate.segmentIndex}:${candidate.segmentRange}`,
    },
  };
}

export function campOpsCandidateFromLocatorCandidate(
  candidate: LocatorCampsiteCandidate,
  source: CampOpsDataSource = 'route_candidate',
): CampCandidate {
  const score = normalizeCampOpsScore(candidate.score);
  return {
    id: candidate.id,
    name: candidate.name ?? candidate.label ?? candidate.id,
    location: {
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    },
    source,
    sourceConfidence: confidenceFromScore(score),
    poiType: candidate.source ?? null,
    category: candidate.viabilityTier ?? null,
    description: candidate.explanation ?? candidate.reason ?? null,
    rating: candidate.rating ?? null,
    score,
    tags: candidate.reason ? [candidate.reason] : [],
    accessDifficulty: normalizeAccessDifficulty(candidate.accessType ?? candidate.roadClass ?? null),
    legalConfidence: candidate.legalAccessScore == null ? 'unknown' : confidenceFromScore(candidate.legalAccessScore),
    ratingFactors: candidate.ratingFactors,
    existingRef: {
      system: 'campsite_candidate',
      id: candidate.id,
    },
  };
}

export function campOpsCandidateFromPublicCampSite(site: PublicCampSite): CampCandidate {
  const score = normalizeCampOpsScore(site.trust_score);
  return {
    id: `camp-site:${site.id}`,
    name: site.canonical_name ?? 'Community campsite',
    location: {
      latitude: site.latitude,
      longitude: site.longitude,
    },
    source: 'community',
    sourceConfidence: confidenceFromScore(score),
    lastVerifiedDate: site.last_confirmed_at,
    poiType: site.site_type,
    category: site.status,
    rating: null,
    score,
    tags: site.vehicle_fit,
    amenities: site.amenities,
    conditions: site.conditions,
    accessDifficulty: normalizeAccessDifficulty(site.access_difficulty),
    legalConfidence: confidenceFromLegacy(site.legal_confidence),
    visibility: site.visibility,
    existingRef: {
      system: 'camp_site',
      id: site.id,
    },
  };
}

export function campOpsCandidateFromReport(
  report: CampSiteReportResponse,
  source: Extract<CampOpsDataSource, 'private' | 'community' | 'manual' | 'gpx'> = 'private',
): CampCandidate {
  const confidence: CampOpsConfidence = report.verified_in_person
    ? 'high'
    : report.user_stayed_here
      ? 'medium'
      : 'low';
  return {
    id: `camp-report:${report.id}`,
    name: report.notes?.split('\n')[0]?.trim() || 'Reported campsite',
    location: {
      latitude: report.latitude,
      longitude: report.longitude,
      accuracyMeters: report.location_accuracy_m,
    },
    source,
    sourceConfidence: confidence,
    lastVerifiedDate: report.visited_at,
    poiType: report.site_type,
    category: report.review_state ?? report.moderation_status,
    description: report.notes,
    rating: null,
    score: report.triage_score == null ? null : normalizeCampOpsScore(report.triage_score),
    tags: report.vehicle_fit,
    amenities: report.amenities,
    conditions: report.conditions,
    accessDifficulty: normalizeAccessDifficulty(report.access_difficulty),
    legalConfidence: 'unknown',
    visibility: report.visibility_requested,
    existingRef: {
      system: 'camp_site_report',
      id: report.id,
    },
  };
}

export function campOpsCandidateFromGroupItem(item: GroupCampSiteItem): CampCandidate | null {
  if (item.camp_site) {
    return {
      ...campOpsCandidateFromPublicCampSite(item.camp_site),
      source: 'group',
      existingRef: {
        system: 'group_share',
        id: item.share.id,
      },
    };
  }
  if (item.report) {
    return {
      ...campOpsCandidateFromReport(item.report, 'private'),
      source: 'group',
      existingRef: {
        system: 'group_share',
        id: item.share.id,
      },
    };
  }
  return null;
}
