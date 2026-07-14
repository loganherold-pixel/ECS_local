import type { CampsiteCandidate as GeneratedCampsiteCandidate } from '../campsiteCandidateEngine';
import type { CampScoutCandidate } from '../campScout/types';
import type { CampsiteCandidate as LocatorCampsiteCandidate } from '../campsites/campsiteLocatorService';
import type {
  CampSiteReportResponse,
  PublicCampSite,
} from '../campsites/campsiteRecommendationService';
import type { GroupCampSiteItem } from '../campsites/campsiteGroupSharingService';
import type { DispersedCampingRegion } from '../map/dispersedCampingTypes';
import type { EstablishedCampsite } from '../map/establishedCampsiteTypes';
import { resolveEstablishedCampgroundScore } from '../map/establishedCampgroundScore';
import { pointInPolygonGeometry } from '../map/routeGeometryUtils';
import {
  evaluateSourceTruthRef,
  sanitizeSourceTruthDisplayText,
  type SourceTruthAuthorityKind,
  type SourceTruthFreshness,
  type SourceTruthRef,
} from '../sourceTruth';
import type {
  CampAccessDifficulty,
  CampCandidate,
  CampCandidateAvailabilityStatus,
  CampCandidateOperationalEvidence,
  CampCandidateRecommendationVisibility,
  CampCandidateTrustStatus,
  CampFitStatus,
  CampLegalStatus,
  CampOpsConfidence,
  CampOpsDataSource,
  CampPublicAccessStatus,
} from './campOpsTypes';
import { normalizeCampOpsScore } from './campOpsTypes';
import {
  campOpsEnrichmentFromCandidateEvidence,
  normalizeCampCandidate,
} from './campOpsCandidateNormalization';

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

function validIso(value: string | null | undefined): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function sourceLabel(value: unknown, fallback: string): string {
  return sanitizeSourceTruthDisplayText(value, 96) ?? fallback;
}

function sourceRef(input: {
  id: string;
  origin: SourceTruthRef['origin'];
  policyKey: SourceTruthRef['policyKey'];
  authority: string;
  authorityKind: SourceTruthAuthorityKind;
  provider?: string | null;
  observedAt?: string | null;
  fetchedAt?: string | null;
  confidence: CampOpsConfidence;
  coverage?: SourceTruthRef['coverage'];
  availability?: SourceTruthRef['availability'];
  warnings?: string[];
}): SourceTruthRef {
  return {
    id: input.id,
    origin: input.origin,
    policyKey: input.policyKey,
    authority: sourceLabel(input.authority, 'Camp source'),
    authorityKind: input.authorityKind,
    provider: input.provider ? sourceLabel(input.provider, 'Provider') : null,
    observedAt: validIso(input.observedAt),
    fetchedAt: validIso(input.fetchedAt),
    expiresAt: null,
    confidence: input.confidence,
    coverage: input.coverage ?? 'partial',
    availability: input.availability ?? 'usable',
    conflictState: 'none',
    conflict: false,
    warningCodes: input.warnings ?? [],
  };
}

function freshnessFor(ref: SourceTruthRef, now: string | number | Date): SourceTruthFreshness {
  return evaluateSourceTruthRef(ref, { policyKey: ref.policyKey, now }).freshness;
}

function confidenceFromCampScoutGrade(value: CampScoutCandidate['confidenceGrade']): CampOpsConfidence {
  if (value === 'A') return 'high';
  if (value === 'B') return 'medium';
  if (value === 'C') return 'low';
  return 'unknown';
}

function establishedAuthorityKind(site: EstablishedCampsite): SourceTruthAuthorityKind {
  const source = String(site.primaryProvider ?? site.source).toLowerCase();
  if (source.includes('nps') || source.includes('recreation') || source.includes('ridb') || source.includes('state') || source.includes('county')) {
    return 'official';
  }
  return 'provider';
}

function establishedAvailability(value: string | null | undefined): CampCandidateAvailabilityStatus {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'available' || normalized === 'available_now' || normalized === 'available_tonight') return 'available';
  if (normalized === 'limited' || normalized === 'few_sites') return 'limited';
  if (normalized === 'unavailable' || normalized === 'sold_out' || normalized === 'full') return 'unavailable';
  if (normalized === 'closed') return 'closed';
  return 'unknown';
}

function establishedClosureStatus(value: string | null | undefined): CampCandidateOperationalEvidence['legalAccess']['closureStatus'] {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'closed' || normalized === 'removed' || normalized === 'temporarily_closed') return 'closed';
  if (normalized === 'restricted') return 'restricted';
  if (normalized === 'seasonal') return 'seasonal';
  if (normalized === 'open' || normalized === 'active') return 'open';
  return 'unknown';
}

function establishedLegalStatus(site: EstablishedCampsite): {
  legalStatus: CampLegalStatus;
  publicAccessStatus: CampPublicAccessStatus;
  confidence: CampOpsConfidence;
} {
  const source = String(site.primaryProvider ?? site.source).toLowerCase();
  if (source.includes('osm')) {
    return { legalStatus: 'unknown', publicAccessStatus: 'unknown', confidence: 'low' };
  }
  if (site.source === 'PRIVATE') {
    return { legalStatus: 'restricted', publicAccessStatus: 'permission_required', confidence: 'medium' };
  }
  const confidence = confidenceFromScore(site.sourceConfidence);
  return {
    legalStatus: 'likely_allowed',
    publicAccessStatus: 'public',
    confidence: confidence === 'unknown' ? 'medium' : confidence,
  };
}

function fitFromBoolean(value: boolean | undefined): CampFitStatus {
  if (value === true) return 'fit';
  if (value === false) return 'not_fit';
  return 'unknown';
}

function trustStatusForPublicSite(site: PublicCampSite): CampCandidateTrustStatus {
  if (site.status !== 'approved') return site.status === 'hidden' ? 'flagged' : 'pending';
  if (site.trust_score >= 85 && site.confirmation_count > 0 && site.flag_count === 0) return 'verified';
  if (site.trust_score >= 70) return 'trusted';
  return 'approved';
}

function visibilityForPublicSite(site: PublicCampSite): CampCandidateRecommendationVisibility {
  if (site.status !== 'approved') return 'blocked';
  if (site.visibility === 'community') return 'operational';
  if (site.visibility === 'private' || site.visibility === 'group') return 'personal';
  return 'blocked';
}

function campScoutVisibility(candidate: CampScoutCandidate): CampCandidateRecommendationVisibility {
  if (candidate.sourceType === 'community_suggested') {
    return candidate.moderationStatus === 'approved' || candidate.moderationStatus === 'trusted'
      ? 'operational'
      : 'blocked';
  }
  if (candidate.sourceType === 'ecs_inferred' || candidate.sourceType === 'unknown') return 'research_only';
  return 'operational';
}

function campScoutLegalStatus(candidate: CampScoutCandidate): CampLegalStatus {
  if (candidate.isPrivateLand || candidate.isProtectedArea || candidate.isClosed || candidate.noCamping) return 'prohibited';
  if (candidate.legalityStatus === 'verified_allowed') return 'allowed';
  if (candidate.legalityStatus === 'likely_allowed_needs_verification') return 'likely_allowed';
  if (candidate.legalityStatus === 'restricted_or_not_allowed') return 'restricted';
  return 'unknown';
}

function publicAccessFromCampScout(candidate: CampScoutCandidate): CampPublicAccessStatus {
  if (candidate.isPrivateLand) return 'private';
  if (candidate.isProtectedArea) return 'permission_required';
  return candidate.legalityStatus === 'verified_allowed' || candidate.legalityStatus === 'likely_allowed_needs_verification'
    ? 'public'
    : 'unknown';
}

function accessFromScore(value: number | null | undefined): CampAccessDifficulty {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value >= 80) return 'easy';
  if (value >= 65) return 'moderate';
  if (value >= 45) return 'high_clearance';
  return 'technical';
}

function defaultEvidence(input: {
  confidence: CampOpsConfidence;
  sourceRefs?: SourceTruthRef[];
  legalSourceRefs?: SourceTruthRef[];
  conditionSourceRefs?: SourceTruthRef[];
  availabilitySourceRefs?: SourceTruthRef[];
  legalStatus?: CampLegalStatus;
  publicAccessStatus?: CampPublicAccessStatus;
  closureStatus?: CampCandidateOperationalEvidence['legalAccess']['closureStatus'];
  legalFreshness?: SourceTruthFreshness;
  conditionStatus?: CampCandidateOperationalEvidence['currentCondition']['status'];
  conditionFreshness?: SourceTruthFreshness;
  conditionSummary?: string | null;
  availabilityStatus?: CampCandidateAvailabilityStatus;
  availabilityFreshness?: SourceTruthFreshness;
  availabilityUsable?: boolean;
  suitabilityScore?: number | null;
  vehicleFit?: CampFitStatus;
  trailerFit?: CampFitStatus;
  groupCapacity?: number | null;
  trustStatus?: CampCandidateTrustStatus;
  trustScore?: number | null;
  confirmationCount?: number;
  negativeReportCount?: number;
  requiresVerification?: boolean;
  notes?: string[];
}): CampCandidateOperationalEvidence {
  const refs = input.sourceRefs ?? [];
  const legalRefs = input.legalSourceRefs ?? refs;
  const conditionRefs = input.conditionSourceRefs ?? refs;
  const availabilityRefs = input.availabilitySourceRefs ?? refs;
  const notes = input.notes ?? [];
  return {
    legalAccess: {
      legalStatus: input.legalStatus ?? 'unknown',
      publicAccessStatus: input.publicAccessStatus ?? 'unknown',
      closureStatus: input.closureStatus ?? 'unknown',
      requiresVerification: input.requiresVerification ?? true,
      confidence: input.confidence,
      freshness: input.legalFreshness ?? 'unavailable',
      conflict: false,
      sourceRefs: legalRefs,
      notes,
    },
    currentCondition: {
      status: input.conditionStatus ?? 'unknown',
      summary: input.conditionSummary ?? null,
      confidence: input.confidence,
      freshness: input.conditionFreshness ?? 'unavailable',
      conflict: false,
      sourceRefs: conditionRefs,
      notes,
    },
    availability: {
      status: input.availabilityStatus ?? 'unknown',
      usableForDecision: input.availabilityUsable ?? false,
      observedAt: availabilityRefs[0]?.observedAt ?? null,
      confidence: input.confidence,
      freshness: input.availabilityFreshness ?? 'unavailable',
      conflict: false,
      sourceRefs: availabilityRefs,
      notes,
    },
    suitability: {
      score: normalizeCampOpsScore(input.suitabilityScore),
      vehicleFit: input.vehicleFit ?? 'unknown',
      trailerFit: input.trailerFit ?? 'unknown',
      groupCapacity: input.groupCapacity ?? null,
      confidence: input.confidence,
      reasons: notes,
    },
    communityTrust: {
      status: input.trustStatus ?? 'unknown',
      score: normalizeCampOpsScore(input.trustScore),
      confirmationCount: Math.max(0, input.confirmationCount ?? 0),
      negativeReportCount: Math.max(0, input.negativeReportCount ?? 0),
      confidence: input.confidence,
      notes,
    },
  };
}

export function campOpsCandidateFromGeneratedCandidate(
  candidate: GeneratedCampsiteCandidate,
  source: Extract<CampOpsDataSource, 'route_candidate' | 'route_endpoint_candidate' | 'draw_area_candidate'> = 'route_candidate',
): CampCandidate {
  const score = normalizeCampOpsScore(candidate.score ?? candidate.qualityScore);
  const confidence = confidenceFromLegacy(candidate.confidence.toLowerCase());
  const legalConfidence = candidate.legalAccessScore == null ? 'unknown' : confidenceFromScore(candidate.legalAccessScore);
  return normalizeCampCandidate({
    id: `generated:${source}:${candidate.segmentIndex}:${candidate.coordinates[0].toFixed(5)},${candidate.coordinates[1].toFixed(5)}`,
    name: candidate.segmentRange || `Camp option ${candidate.segmentIndex + 1}`,
    location: {
      latitude: candidate.coordinates[0],
      longitude: candidate.coordinates[1],
    },
    source,
    sourceConfidence: confidence,
    candidateClass: 'generated',
    recommendationVisibility: 'operational',
    poiType: 'generated_camp_candidate',
    category: candidate.credibilityTier,
    description: candidate.candidateReason.join('; ') || null,
    rating: candidate.rating ?? null,
    score,
    tags: candidate.candidateReason,
    accessDifficulty: candidate.difficulty,
    legalConfidence,
    ratingFactors: candidate.ratingFactors,
    provenance: {
      canonicalId: '',
      candidateClass: 'generated',
      sourceRecordIds: [`campsite_candidate:${candidate.segmentIndex}:${candidate.segmentRange}`],
      sourceLabels: ['ECS generated route candidate'],
      attribution: [],
    },
    evidence: defaultEvidence({
      confidence,
      legalStatus: candidate.legalAccessScore == null ? 'unknown' : 'likely_allowed',
      publicAccessStatus: 'unknown',
      closureStatus: 'unknown',
      suitabilityScore: score,
      vehicleFit: candidate.difficulty === 'difficult' ? 'limited' : 'unknown',
      trailerFit: candidate.difficulty === 'difficult' ? 'not_fit' : 'unknown',
      notes: ['ECS-generated planning candidate; legal access and current conditions require provider verification.'],
    }),
    existingRef: {
      system: 'campsite_candidate',
      id: `${candidate.segmentIndex}:${candidate.segmentRange}`,
    },
  });
}

export function campOpsCandidateFromLocatorCandidate(
  candidate: LocatorCampsiteCandidate,
  source: CampOpsDataSource = 'route_candidate',
): CampCandidate {
  const score = normalizeCampOpsScore(candidate.score);
  const confidence = confidenceFromScore(score);
  const legalConfidence = candidate.legalAccessScore == null ? 'unknown' : confidenceFromScore(candidate.legalAccessScore);
  return normalizeCampCandidate({
    id: candidate.id,
    name: candidate.name ?? candidate.label ?? candidate.id,
    location: {
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    },
    source,
    sourceConfidence: confidence,
    candidateClass: 'generated',
    recommendationVisibility: 'operational',
    poiType: candidate.source ?? null,
    category: candidate.viabilityTier ?? null,
    description: candidate.explanation ?? candidate.reason ?? null,
    rating: candidate.rating ?? null,
    score,
    tags: candidate.reason ? [candidate.reason] : [],
    accessDifficulty: normalizeAccessDifficulty(candidate.accessType ?? candidate.roadClass ?? null),
    legalConfidence,
    ratingFactors: candidate.ratingFactors,
    provenance: {
      canonicalId: '',
      candidateClass: 'generated',
      sourceRecordIds: [`campsite_candidate:${candidate.id}`],
      sourceLabels: ['ECS campsite locator'],
      attribution: [],
    },
    evidence: defaultEvidence({
      confidence,
      legalStatus: candidate.legalAccessScore == null ? 'unknown' : 'likely_allowed',
      publicAccessStatus: 'unknown',
      closureStatus: 'unknown',
      suitabilityScore: score,
      notes: ['Locator candidate; legal access and current conditions require separate verification.'],
    }),
    existingRef: {
      system: 'campsite_candidate',
      id: candidate.id,
    },
  });
}

export function campOpsCandidateFromPublicCampSite(
  site: PublicCampSite,
  now: string | number | Date = Date.now(),
): CampCandidate {
  const score = normalizeCampOpsScore(site.trust_score);
  const confidence = confidenceFromScore(score);
  const legalConfidence = confidenceFromLegacy(site.legal_confidence);
  const observedAt = site.last_confirmed_at ?? site.updated_at;
  const legalRef = sourceRef({
    id: `camp-site:${site.id}:legal`,
    origin: 'cached',
    policyKey: 'route_legal_access_evidence',
    authority: 'ECS community campsite record',
    authorityKind: 'community',
    provider: 'ECS community',
    observedAt,
    fetchedAt: site.updated_at,
    confidence: legalConfidence,
    coverage: 'partial',
  });
  const conditionRef = sourceRef({
    id: `camp-site:${site.id}:condition`,
    origin: 'cached',
    policyKey: 'condition_closure_advisory',
    authority: 'ECS community confirmations',
    authorityKind: 'community',
    provider: 'ECS community',
    observedAt,
    fetchedAt: site.updated_at,
    confidence,
    coverage: 'partial',
  });
  const closed = site.status === 'closed' || site.status === 'archived' || site.status === 'sensitive_removed';
  const trustStatus = trustStatusForPublicSite(site);
  return normalizeCampCandidate({
    id: `camp-site:${site.id}`,
    name: site.canonical_name ?? 'Community campsite',
    location: {
      latitude: site.latitude,
      longitude: site.longitude,
    },
    source: 'community',
    sourceConfidence: confidence,
    candidateClass: 'community',
    recommendationVisibility: visibilityForPublicSite(site),
    lastVerifiedDate: site.last_confirmed_at,
    poiType: site.site_type,
    category: site.status,
    rating: null,
    score,
    tags: site.vehicle_fit,
    amenities: site.amenities,
    conditions: site.conditions,
    accessDifficulty: normalizeAccessDifficulty(site.access_difficulty),
    legalConfidence,
    visibility: site.visibility,
    provenance: {
      canonicalId: '',
      candidateClass: 'community',
      sourceRecordIds: [`camp_site:${site.id}`],
      sourceLabels: ['ECS community campsite'],
      attribution: [],
    },
    evidence: defaultEvidence({
      confidence,
      legalSourceRefs: [legalRef],
      conditionSourceRefs: [conditionRef],
      legalStatus: closed ? 'prohibited' : legalConfidence === 'unknown' ? 'unknown' : 'likely_allowed',
      publicAccessStatus: site.visibility === 'private'
        ? 'private'
        : site.visibility === 'group'
          ? 'permission_required'
          : 'unknown',
      closureStatus: closed ? 'closed' : 'unknown',
      legalFreshness: freshnessFor(legalRef, now),
      conditionStatus: closed ? 'closed' : 'unknown',
      conditionFreshness: freshnessFor(conditionRef, now),
      conditionSummary: closed ? 'Community record is closed or removed.' : null,
      suitabilityScore: score,
      vehicleFit: site.vehicle_fit.length > 0 ? 'fit' : 'unknown',
      trailerFit: fitFromBoolean(site.trailer_friendly ?? undefined),
      groupCapacity: site.max_group_size,
      trustStatus,
      trustScore: score,
      confirmationCount: site.confirmation_count,
      negativeReportCount: site.flag_count,
      requiresVerification: true,
      notes: [
        'Community approval and trust do not establish legal access or current conditions.',
        ...(site.status !== 'approved' ? ['This campsite is not approved for public recommendations.'] : []),
      ],
    }),
    existingRef: {
      system: 'camp_site',
      id: site.id,
    },
  });
}

export function campOpsCandidateFromReport(
  report: CampSiteReportResponse,
  source: Extract<CampOpsDataSource, 'private' | 'community' | 'manual' | 'gpx'> = 'private',
  now: string | number | Date = Date.now(),
): CampCandidate {
  const confidence: CampOpsConfidence = report.verified_in_person
    ? 'high'
    : report.user_stayed_here
      ? 'medium'
      : 'low';
  const reportClass = source === 'gpx' ? 'imported' : source === 'manual' ? 'manual' : source === 'community' ? 'community' : 'private';
  const approved = report.moderation_status === 'approved' || report.review_state === 'approved';
  const visibility: CampCandidateRecommendationVisibility =
    report.visibility_requested === 'private' || report.visibility_requested === 'group'
      ? 'personal'
      : approved
        ? 'operational'
        : 'blocked';
  const observedAt = report.visited_at ?? report.updated_at;
  const reportRef = sourceRef({
    id: `camp-report:${report.id}`,
    origin: 'manual',
    policyKey: 'manual_user_state',
    authority: report.verified_in_person ? 'User in-person report' : 'User campsite report',
    authorityKind: 'user',
    observedAt,
    fetchedAt: report.updated_at,
    confidence,
    coverage: 'partial',
  });
  return normalizeCampCandidate({
    id: `camp-report:${report.id}`,
    name: report.notes?.split('\n')[0]?.trim() || 'Reported campsite',
    location: {
      latitude: report.latitude,
      longitude: report.longitude,
      accuracyMeters: report.location_accuracy_m,
    },
    source,
    sourceConfidence: confidence,
    candidateClass: reportClass,
    recommendationVisibility: visibility,
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
    provenance: {
      canonicalId: '',
      candidateClass: reportClass,
      sourceRecordIds: [`camp_site_report:${report.id}`],
      sourceLabels: [report.verified_in_person ? 'User in-person report' : 'User campsite report'],
      attribution: [],
    },
    evidence: defaultEvidence({
      confidence,
      sourceRefs: [reportRef],
      legalStatus: 'unknown',
      publicAccessStatus: report.visibility_requested === 'private'
        ? 'private'
        : report.visibility_requested === 'group'
          ? 'permission_required'
          : 'unknown',
      closureStatus: 'unknown',
      legalFreshness: freshnessFor(reportRef, now),
      conditionStatus: 'unknown',
      conditionFreshness: freshnessFor(reportRef, now),
      suitabilityScore: report.triage_score,
      vehicleFit: report.vehicle_fit.length > 0 ? 'fit' : 'unknown',
      trustStatus: approved ? 'approved' : report.moderation_status === 'rejected' ? 'rejected' : 'pending',
      trustScore: report.triage_score,
      confirmationCount: report.verified_in_person || report.user_stayed_here ? 1 : 0,
      requiresVerification: true,
      notes: [
        'Manual campsite reports do not establish legal access, current conditions, or live availability.',
        ...(!approved && report.visibility_requested === 'community'
          ? ['Community report is awaiting approval and is excluded from public recommendations.']
          : []),
      ],
    }),
    existingRef: {
      system: 'camp_site_report',
      id: report.id,
    },
  });
}

export function campOpsCandidateFromGroupItem(item: GroupCampSiteItem): CampCandidate | null {
  if (item.camp_site) {
    return normalizeCampCandidate({
      ...campOpsCandidateFromPublicCampSite(item.camp_site),
      source: 'group',
      candidateClass: 'group',
      recommendationVisibility: 'personal',
      existingRef: {
        system: 'group_share',
        id: item.share.id,
      },
    });
  }
  if (item.report) {
    return normalizeCampCandidate({
      ...campOpsCandidateFromReport(item.report, 'private'),
      source: 'group',
      candidateClass: 'group',
      recommendationVisibility: 'personal',
      existingRef: {
        system: 'group_share',
        id: item.share.id,
      },
    });
  }
  return null;
}

export function campOpsCandidateFromEstablishedCampsite(
  site: EstablishedCampsite,
  now: string | number | Date = Date.now(),
): CampCandidate {
  const scoreSummary = resolveEstablishedCampgroundScore(site, new Date(now).getTime());
  const confidence = confidenceFromScore(site.sourceConfidence ?? scoreSummary.score);
  const legal = establishedLegalStatus(site);
  const provider = sourceLabel(site.primaryProvider ?? site.source, 'Campground provider');
  const authority = sourceLabel(
    site.managingAgency ?? site.managingOrg ?? site.operatorName ?? provider,
    'Campground operator',
  );
  const legalObservedAt = site.lastVerifiedAt ?? site.sourceUpdatedAt ?? site.lastSyncedAt ?? null;
  const conditionObservedAt = site.sourceUpdatedAt ?? site.lastVerifiedAt ?? site.lastSyncedAt ?? null;
  const legalRef = sourceRef({
    id: `established:${site.id}:legal`,
    origin: 'cached',
    policyKey: 'route_legal_access_evidence',
    authority,
    authorityKind: establishedAuthorityKind(site),
    provider,
    observedAt: legalObservedAt,
    fetchedAt: site.lastSyncedAt,
    confidence: legal.confidence,
    coverage: 'partial',
  });
  const conditionRef = sourceRef({
    id: `established:${site.id}:condition`,
    origin: 'cached',
    policyKey: 'condition_closure_advisory',
    authority,
    authorityKind: establishedAuthorityKind(site),
    provider,
    observedAt: conditionObservedAt,
    fetchedAt: site.lastSyncedAt,
    confidence,
    coverage: 'partial',
  });
  const availabilityRef = sourceRef({
    id: `established:${site.id}:availability`,
    origin: site.lastAvailabilityCheckedAt ? 'live' : 'unavailable',
    policyKey: 'camp_provider_availability',
    authority,
    authorityKind: establishedAuthorityKind(site),
    provider,
    observedAt: site.lastAvailabilityCheckedAt,
    fetchedAt: site.lastSyncedAt,
    confidence,
    coverage: site.availabilityStatus ? 'partial' : 'unknown',
    availability: site.availabilityStatus ? 'usable' : 'unavailable',
  });
  const legalFreshness = freshnessFor(legalRef, now);
  const conditionFreshness = freshnessFor(conditionRef, now);
  const availabilityFreshness = freshnessFor(availabilityRef, now);
  const availabilityStatus = establishedAvailability(site.availabilityStatus);
  const availabilityUsable =
    (availabilityFreshness === 'live' || availabilityFreshness === 'recent') &&
    availabilityStatus !== 'unknown';
  const closureStatus = establishedClosureStatus(site.status);
  const currentCondition = closureStatus === 'closed'
    ? 'closed'
    : closureStatus === 'seasonal' || closureStatus === 'restricted'
      ? 'restricted'
      : closureStatus === 'open' && (conditionFreshness === 'live' || conditionFreshness === 'recent')
        ? 'clear'
        : 'unknown';
  return normalizeCampCandidate({
    id: `established:${site.id}`,
    name: site.name,
    location: { latitude: site.latitude, longitude: site.longitude },
    source: 'established_campground',
    sourceConfidence: confidence,
    candidateClass: 'established',
    recommendationVisibility: 'operational',
    lastVerifiedDate: site.lastVerifiedAt ?? site.lastSyncedAt ?? null,
    poiType: site.campsiteType,
    category: site.status ?? 'unknown',
    description: scoreSummary.explanation,
    rating: null,
    score: scoreSummary.score,
    tags: [site.feeStatus, site.reservationStatus, ...(site.siteTypes ?? [])],
    amenities: Object.fromEntries(site.amenities.map((amenity) => [amenity, true])),
    conditions: {
      status: site.status ?? 'unknown',
      availabilityStatus: site.availabilityStatus ?? 'unknown',
      reservationStatus: site.reservationStatus,
    },
    accessDifficulty: 'unknown',
    legalConfidence: legal.confidence,
    provenance: {
      canonicalId: '',
      candidateClass: 'established',
      sourceRecordIds: [`established_campground:${site.id}`],
      sourceLabels: [provider],
      attribution: site.attribution ? [sourceLabel(site.attribution, provider)] : [provider],
    },
    evidence: defaultEvidence({
      confidence,
      legalSourceRefs: [legalRef],
      conditionSourceRefs: [conditionRef],
      availabilitySourceRefs: [availabilityRef],
      legalStatus: closureStatus === 'closed' ? 'prohibited' : legal.legalStatus,
      publicAccessStatus: legal.publicAccessStatus,
      closureStatus,
      legalFreshness,
      conditionStatus: currentCondition,
      conditionFreshness,
      conditionSummary: site.status ? `Provider status: ${sourceLabel(site.status, 'unknown')}.` : null,
      availabilityStatus,
      availabilityFreshness,
      availabilityUsable,
      suitabilityScore: scoreSummary.score,
      vehicleFit: site.maxVehicleLengthFt != null || site.rvAllowed === true ? 'fit' : 'unknown',
      trailerFit: fitFromBoolean(site.trailersAllowed),
      groupCapacity: site.siteCount,
      trustStatus: 'unknown',
      requiresVerification: true,
      notes: [
        ...scoreSummary.dataBasis,
        ...(!availabilityUsable && availabilityStatus !== 'unknown'
          ? ['Reported availability is stale or expired and is not used as current availability.']
          : []),
        ...(site.source === 'OSM'
          ? ['OpenStreetMap is supplemental POI data, not authority for legal status or live availability.']
          : []),
      ],
    }),
    existingRef: { system: 'established_campground', id: site.id },
  });
}

export function campOpsCandidateFromCampScoutCandidate(
  candidate: CampScoutCandidate,
  now: string | number | Date = Date.now(),
): CampCandidate {
  const confidence = confidenceFromCampScoutGrade(candidate.confidenceGrade);
  const timestamp = candidate.lastVerifiedAt ?? candidate.sourceTimestamp ?? candidate.createdAt ?? null;
  const authorityKind: SourceTruthAuthorityKind = candidate.sourceType === 'official_mapped'
    ? 'official'
    : candidate.sourceType === 'community_suggested'
      ? 'community'
      : candidate.sourceType === 'ecs_inferred'
        ? 'ecs'
        : 'unknown';
  const origin: SourceTruthRef['origin'] = candidate.sourceType === 'ecs_inferred'
    ? 'inferred'
    : candidate.offlineEstimate
      ? 'cached'
      : 'live';
  const provider = sourceLabel(candidate.sourceLabel ?? candidate.sourceType, 'CampScout');
  const legalRef = sourceRef({
    id: `camp-scout:${candidate.id}:legal`,
    origin,
    policyKey: 'route_legal_access_evidence',
    authority: provider,
    authorityKind,
    provider,
    observedAt: timestamp,
    fetchedAt: candidate.sourceTimestamp,
    confidence: confidenceFromScore(candidate.legalityConfidence),
    coverage: 'partial',
  });
  const conditionRef = sourceRef({
    id: `camp-scout:${candidate.id}:condition`,
    origin,
    policyKey: 'condition_closure_advisory',
    authority: provider,
    authorityKind,
    provider,
    observedAt: timestamp,
    fetchedAt: candidate.sourceTimestamp,
    confidence,
    coverage: 'partial',
  });
  const closed = Boolean(candidate.isClosed || candidate.noCamping);
  const restricted = Boolean(candidate.isPrivateLand || candidate.isProtectedArea);
  const trustStatus: CampCandidateTrustStatus = candidate.sourceType !== 'community_suggested'
    ? 'unknown'
    : candidate.moderationStatus === 'approved' || candidate.moderationStatus === 'trusted'
      ? candidate.moderationStatus
      : candidate.moderationStatus === 'rejected'
        ? 'rejected'
        : candidate.moderationStatus === 'flagged'
          ? 'flagged'
          : 'pending';
  return normalizeCampCandidate({
    id: `camp-scout:${candidate.id}`,
    name: candidate.title,
    location: candidate.coordinate,
    source: 'camp_scout',
    sourceConfidence: confidence,
    candidateClass: 'camp_scout',
    recommendationVisibility: campScoutVisibility(candidate),
    lastVerifiedDate: candidate.lastVerifiedAt ?? null,
    poiType: candidate.sourceType,
    category: candidate.confidenceGrade,
    description: candidate.reasons.join('; ') || null,
    rating: null,
    score: candidate.confidenceScore,
    tags: [...candidate.reasons, ...candidate.cautions],
    conditions: {
      offlineEstimate: candidate.offlineEstimate ?? false,
      seasonalRiskPossible: candidate.seasonalRiskPossible ?? false,
      restrictions: candidate.restrictions ?? [],
    },
    accessDifficulty: accessFromScore(candidate.accessConfidence),
    legalConfidence: confidenceFromScore(candidate.legalityConfidence),
    provenance: {
      canonicalId: '',
      candidateClass: 'camp_scout',
      sourceRecordIds: [`camp_scout:${candidate.id}`],
      sourceLabels: [provider],
      attribution: [],
    },
    evidence: defaultEvidence({
      confidence,
      legalSourceRefs: [legalRef],
      conditionSourceRefs: [conditionRef],
      legalStatus: campScoutLegalStatus(candidate),
      publicAccessStatus: publicAccessFromCampScout(candidate),
      closureStatus: closed ? 'closed' : restricted ? 'restricted' : 'unknown',
      legalFreshness: freshnessFor(legalRef, now),
      conditionStatus: closed ? 'closed' : restricted ? 'restricted' : candidate.warnings?.length ? 'watch' : 'unknown',
      conditionFreshness: freshnessFor(conditionRef, now),
      conditionSummary: candidate.warnings?.join('; ') ?? null,
      suitabilityScore: candidate.scoreBreakdown.total,
      trustStatus,
      trustScore: candidate.communitySignalScore,
      confirmationCount: candidate.verificationCount ?? candidate.recommendationCount ?? 0,
      negativeReportCount: candidate.negativeReportsCount ?? 0,
      requiresVerification: candidate.legalityStatus !== 'verified_allowed',
      notes: [...candidate.cautions, ...(candidate.sourceNotes ?? [])],
    }),
    existingRef: { system: 'camp_scout', id: candidate.id },
  });
}

export function campOpsCandidateFromDispersedCampingRegion(
  region: DispersedCampingRegion,
  location: { latitude: number; longitude: number },
  now: string | number | Date = Date.now(),
): CampCandidate | null {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  if (location.latitude < -90 || location.latitude > 90 || location.longitude < -180 || location.longitude > 180) return null;
  if (!pointInPolygonGeometry(location, region.geometry)) return null;
  const confidence: CampOpsConfidence = region.confidence === 'high'
    ? 'high'
    : region.confidence === 'medium'
      ? 'medium'
      : region.confidence === 'verify'
        ? 'low'
        : 'unknown';
  const provider = sourceLabel(region.sourceProvider ?? region.source ?? region.landManager, 'Land manager');
  const ref = sourceRef({
    id: `dispersed-region:${region.id}:eligibility`,
    origin: 'cached',
    policyKey: 'route_legal_access_evidence',
    authority: region.landManager,
    authorityKind: region.landManager === 'UNKNOWN' ? 'unknown' : 'official',
    provider,
    observedAt: region.sourceUpdatedAt,
    fetchedAt: region.sourceUpdatedAt,
    confidence,
    coverage: 'partial',
  });
  const closureActive = region.closureActive === true;
  const restricted = region.confidence === 'restricted';
  return normalizeCampCandidate({
    id: `dispersed-region:${region.id}:${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`,
    name: region.name ?? `${region.landManager} dispersed camping area`,
    location,
    source: 'dispersed_region',
    sourceConfidence: confidence,
    candidateClass: 'dispersed_region',
    recommendationVisibility: 'research_only',
    lastVerifiedDate: region.sourceUpdatedAt ?? null,
    poiType: 'dispersed_camping_region',
    category: region.eligibilityLabel,
    description: region.basis.join('; ') || null,
    rating: null,
    score: null,
    tags: [...region.basis, ...region.restrictions],
    conditions: {
      permitRequired: region.permitRequired ?? false,
      closureKnown: region.closureKnown ?? false,
      closureActive,
      fireRestrictionKnown: region.fireRestrictionKnown ?? false,
      seasonalAccessKnown: region.seasonalAccessKnown ?? false,
    },
    accessDifficulty: 'unknown',
    legalConfidence: confidence,
    provenance: {
      canonicalId: '',
      candidateClass: 'dispersed_region',
      sourceRecordIds: [`dispersed_region:${region.id}`],
      sourceLabels: region.sourceNames.length > 0 ? region.sourceNames : [provider],
      attribution: region.sourceNames,
    },
    evidence: defaultEvidence({
      confidence,
      sourceRefs: [ref],
      legalStatus: closureActive ? 'prohibited' : restricted ? 'restricted' : region.confidence === 'verify' ? 'unknown' : 'likely_allowed',
      publicAccessStatus: region.landManager === 'PRIVATE'
        ? 'private'
        : region.landManager === 'UNKNOWN'
          ? 'unknown'
          : 'public',
      closureStatus: closureActive
        ? 'closed'
        : region.permitRequired
          ? 'permit_required'
          : region.seasonalAccessKnown
            ? 'seasonal'
            : 'unknown',
      legalFreshness: freshnessFor(ref, now),
      conditionStatus: closureActive ? 'closed' : region.restrictions.length > 0 ? 'watch' : 'unknown',
      conditionFreshness: 'unavailable',
      conditionSummary: region.restrictions.join('; ') || null,
      requiresVerification: true,
      notes: [
        ...region.restrictions,
        'A dispersed eligibility region is planning reference data, not a verified campsite or current access determination.',
      ],
    }),
    existingRef: { system: 'dispersed_region', id: region.id },
  });
}

export function campOpsCandidateBundle(candidate: CampCandidate): {
  candidate: CampCandidate;
  enrichment: ReturnType<typeof campOpsEnrichmentFromCandidateEvidence>;
} {
  const normalized = normalizeCampCandidate(candidate);
  return {
    candidate: normalized,
    enrichment: campOpsEnrichmentFromCandidateEvidence(normalized),
  };
}
