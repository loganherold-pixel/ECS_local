import {
  evaluateSourceTruthRef,
  sanitizeSourceTruthRef,
  type SourceTruthFreshness,
  type SourceTruthRef,
} from '../sourceTruth';
import type {
  CampAccessDifficulty,
  CampAccessRestrictionStatus,
  CampCandidate,
  CampCandidateEnrichment,
  CampCandidateOperationalEvidence,
  CampCandidateRecommendationVisibility,
  CampFitStatus,
  CampLegalStatus,
  CampOpsConfidence,
  CampPublicAccessStatus,
} from './campOpsTypes';
import { normalizeCampOpsScore } from './campOpsTypes';

export type CampCandidatePoolDiagnostics = {
  inputCount: number;
  outputCount: number;
  blockedCount: number;
  duplicateCount: number;
  distanceCheckCount: number;
};

export type CampCandidatePoolResult = {
  candidates: CampCandidate[];
  enrichmentsByCandidateId: Record<string, CampCandidateEnrichment | undefined>;
  aliasesByCandidateId: Record<string, string>;
  excludedCandidates: Array<{ candidate: CampCandidate; reason: string }>;
  diagnostics: CampCandidatePoolDiagnostics;
};

export type CampCandidateDecisionDetail = {
  id: 'legal_access' | 'current_condition' | 'availability' | 'suitability' | 'community_trust';
  label: string;
  value: string;
  confidence: CampOpsConfidence;
  freshness: SourceTruthFreshness | null;
  sourceLabels: string[];
  warning: string | null;
};

const EARTH_RADIUS_MILES = 3958.8;
const DEFAULT_DUPLICATE_RADIUS_MILES = 0.12;

const CONFIDENCE_RANK: Record<CampOpsConfidence, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const FRESHNESS_RANK: Record<SourceTruthFreshness, number> = {
  unavailable: 0,
  expired: 1,
  stale: 2,
  recent: 3,
  live: 4,
};

const SOURCE_RANK: Record<CampCandidate['source'], number> = {
  established_campground: 95,
  private: 90,
  group: 88,
  community: 84,
  user_saved: 82,
  camp_scout: 78,
  gpx: 76,
  manual: 74,
  route_endpoint_candidate: 68,
  route_candidate: 66,
  draw_area_candidate: 64,
  dispersed_region: 58,
  offline_dataset: 54,
  inferred: 48,
  unknown: 0,
};

const VISIBILITY_RANK: Record<CampCandidateRecommendationVisibility, number> = {
  operational: 4,
  personal: 3,
  research_only: 2,
  blocked: 0,
};

const LEGAL_RESTRICTION_RANK: Record<CampLegalStatus, number> = {
  allowed: 0,
  likely_allowed: 1,
  unknown: 2,
  restricted: 3,
  prohibited: 4,
};

const ACCESS_RESTRICTION_RANK: Record<CampAccessRestrictionStatus, number> = {
  open: 0,
  unknown: 1,
  permit_required: 2,
  seasonal: 3,
  restricted: 4,
  closed: 5,
};

const PUBLIC_ACCESS_RESTRICTION_RANK: Record<CampPublicAccessStatus, number> = {
  public: 0,
  unknown: 1,
  permission_required: 2,
  private: 3,
};

const FIT_RESTRICTION_RANK: Record<CampFitStatus, number> = {
  fit: 0,
  unknown: 1,
  limited: 2,
  not_fit: 3,
};

const CONDITION_RESTRICTION_RANK: Record<CampCandidateOperationalEvidence['currentCondition']['status'], number> = {
  clear: 0,
  unknown: 1,
  watch: 2,
  restricted: 3,
  closed: 4,
};

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function token(value: unknown, fallback = 'unknown'): string {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return normalized || fallback;
}

function validCoordinate(candidate: Pick<CampCandidate, 'location'>): boolean {
  return Number.isFinite(candidate.location?.latitude) &&
    Number.isFinite(candidate.location?.longitude) &&
    candidate.location.latitude >= -90 &&
    candidate.location.latitude <= 90 &&
    candidate.location.longitude >= -180 &&
    candidate.location.longitude <= 180;
}

export function createCampCandidateCanonicalId(
  candidate: Pick<CampCandidate, 'name' | 'location' | 'candidateClass' | 'existingRef'>,
): string {
  const latitude = validCoordinate(candidate as Pick<CampCandidate, 'location'>)
    ? candidate.location.latitude.toFixed(4)
    : 'unknown-lat';
  const longitude = validCoordinate(candidate as Pick<CampCandidate, 'location'>)
    ? candidate.location.longitude.toFixed(4)
    : 'unknown-lng';
  const name = token(candidate.name, candidate.existingRef?.system ?? 'camp');
  return `camp:${candidate.candidateClass ?? 'unknown'}:${name}:${latitude}:${longitude}`;
}

function sanitizeRefs(refs: readonly SourceTruthRef[] | null | undefined): SourceTruthRef[] {
  const seen = new Set<string>();
  const output: SourceTruthRef[] = [];
  for (const rawRef of refs ?? []) {
    const ref = sanitizeSourceTruthRef(rawRef);
    const key = `${ref.id}:${ref.provider ?? ''}:${ref.observedAt ?? ''}:${ref.role ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(ref);
  }
  return output;
}

function normalizeEvidence(evidence: CampCandidateOperationalEvidence | undefined): CampCandidateOperationalEvidence | undefined {
  if (!evidence) return undefined;
  return {
    legalAccess: {
      ...evidence.legalAccess,
      sourceRefs: sanitizeRefs(evidence.legalAccess.sourceRefs),
      notes: unique(evidence.legalAccess.notes),
    },
    currentCondition: {
      ...evidence.currentCondition,
      sourceRefs: sanitizeRefs(evidence.currentCondition.sourceRefs),
      notes: unique(evidence.currentCondition.notes),
    },
    availability: {
      ...evidence.availability,
      sourceRefs: sanitizeRefs(evidence.availability.sourceRefs),
      notes: unique(evidence.availability.notes),
    },
    suitability: {
      ...evidence.suitability,
      score: normalizeCampOpsScore(evidence.suitability.score),
      groupCapacity: Number.isFinite(evidence.suitability.groupCapacity)
        ? Math.max(0, Number(evidence.suitability.groupCapacity))
        : null,
      reasons: unique(evidence.suitability.reasons),
    },
    communityTrust: {
      ...evidence.communityTrust,
      score: normalizeCampOpsScore(evidence.communityTrust.score),
      confirmationCount: Math.max(0, Math.trunc(evidence.communityTrust.confirmationCount || 0)),
      negativeReportCount: Math.max(0, Math.trunc(evidence.communityTrust.negativeReportCount || 0)),
      notes: unique(evidence.communityTrust.notes),
    },
  };
}

export function normalizeCampCandidate(candidate: CampCandidate): CampCandidate {
  const canonicalId = candidate.canonicalId?.trim() || createCampCandidateCanonicalId(candidate);
  const sourceRecordIds = unique([
    ...(candidate.provenance?.sourceRecordIds ?? []),
    candidate.existingRef ? `${candidate.existingRef.system}:${candidate.existingRef.id}` : null,
  ]);
  return {
    ...candidate,
    canonicalId,
    candidateClass: candidate.candidateClass ?? 'unknown',
    recommendationVisibility: candidate.recommendationVisibility ?? 'operational',
    tags: unique(candidate.tags ?? []),
    evidence: normalizeEvidence(candidate.evidence),
    provenance: {
      canonicalId,
      candidateClass: candidate.candidateClass ?? candidate.provenance?.candidateClass ?? 'unknown',
      sourceRecordIds,
      sourceLabels: unique(candidate.provenance?.sourceLabels ?? [candidate.source]),
      attribution: unique(candidate.provenance?.attribution ?? []),
    },
  };
}

function freshestRefState(
  refs: SourceTruthRef[],
  fallback: SourceTruthFreshness,
  now: string | number | Date,
): SourceTruthFreshness {
  return refs.reduce<SourceTruthFreshness>((freshest, ref) => {
    const evaluated = evaluateSourceTruthRef(ref, { policyKey: ref.policyKey, now }).freshness;
    return FRESHNESS_RANK[evaluated] > FRESHNESS_RANK[freshest] ? evaluated : freshest;
  }, refs.length > 0 ? 'unavailable' : fallback);
}

export function refreshCampCandidateSourceTruth(
  candidate: CampCandidate,
  now: string | number | Date,
): CampCandidate {
  const normalized = normalizeCampCandidate(candidate);
  const evidence = normalized.evidence;
  if (!evidence) return normalized;
  const legalFreshness = freshestRefState(evidence.legalAccess.sourceRefs, evidence.legalAccess.freshness, now);
  const conditionFreshness = freshestRefState(
    evidence.currentCondition.sourceRefs,
    evidence.currentCondition.freshness,
    now,
  );
  const availabilityFreshness = freshestRefState(
    evidence.availability.sourceRefs,
    evidence.availability.freshness,
    now,
  );
  return {
    ...normalized,
    evidence: {
      ...evidence,
      legalAccess: { ...evidence.legalAccess, freshness: legalFreshness },
      currentCondition: { ...evidence.currentCondition, freshness: conditionFreshness },
      availability: {
        ...evidence.availability,
        freshness: availabilityFreshness,
        usableForDecision:
          evidence.availability.status !== 'unknown' &&
          (availabilityFreshness === 'live' || availabilityFreshness === 'recent'),
      },
    },
  };
}

function knownAccessDifficulty(value: CampCandidate['accessDifficulty']): CampAccessDifficulty {
  return value === 'easy' || value === 'moderate' || value === 'high_clearance' || value === 'technical'
    ? value
    : 'unknown';
}

export function campOpsEnrichmentFromCandidateEvidence(
  candidate: CampCandidate,
  overrides: Partial<CampCandidateEnrichment> = {},
): CampCandidateEnrichment {
  const evidence = candidate.evidence;
  const limitations = unique([
    ...(evidence?.legalAccess.notes ?? []),
    ...(evidence?.currentCondition.notes ?? []),
    ...(evidence?.availability.notes ?? []),
    ...(evidence?.communityTrust.notes ?? []),
    ...(overrides.dataLimitations ?? []),
  ]);
  const base: CampCandidateEnrichment = {
    candidateId: candidate.id,
    legalStatus: evidence?.legalAccess.legalStatus ?? 'unknown',
    legalConfidence: evidence?.legalAccess.confidence ?? 'unknown',
    closureStatus: evidence?.legalAccess.closureStatus ?? 'unknown',
    publicAccessStatus: evidence?.legalAccess.publicAccessStatus ?? 'unknown',
    accessDifficulty: knownAccessDifficulty(candidate.accessDifficulty),
    vehicleFit: evidence?.suitability.vehicleFit ?? 'unknown',
    trailerSuitability: evidence?.suitability.trailerFit ?? 'unknown',
    groupCapacityEstimate: evidence?.suitability.groupCapacity ?? null,
    groupCapacityConfidence: evidence?.suitability.confidence ?? 'unknown',
    weatherExposure: 'unknown',
    fireRestrictionStatus: 'unknown',
    privacyLikelihood: 'unknown',
    occupancyLikelihood: 'unknown',
    lateArrivalRisk: 'unknown',
    availabilityStatus: evidence?.availability.status ?? 'unknown',
    availabilityFreshness: evidence?.availability.freshness ?? 'unavailable',
    availabilityUsableForDecision: evidence?.availability.usableForDecision ?? false,
    dataConfidence: candidate.sourceConfidence,
    dataLimitations: limitations,
  };
  return {
    ...base,
    ...overrides,
    candidateId: candidate.id,
    dataLimitations: unique([...limitations, ...(overrides.dataLimitations ?? [])]),
  };
}

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMiles(left: CampCandidate, right: CampCandidate): number {
  const dLat = radians(right.location.latitude - left.location.latitude);
  const dLng = radians(right.location.longitude - left.location.longitude);
  const lat1 = radians(left.location.latitude);
  const lat2 = radians(right.location.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function nameTerms(name: string): Set<string> {
  const ignored = new Set(['camp', 'campground', 'campsite', 'site', 'rv', 'park', 'the', 'and']);
  return new Set(token(name).split('-').filter((part) => part.length > 1 && !ignored.has(part)));
}

function namesLikelyMatch(left: CampCandidate, right: CampCandidate, miles: number): boolean {
  const leftTerms = nameTerms(left.name);
  const rightTerms = nameTerms(right.name);
  if (leftTerms.size === 0 || rightTerms.size === 0) return miles <= 0.03;
  const overlap = [...leftTerms].filter((term) => rightTerms.has(term)).length;
  const denominator = Math.max(leftTerms.size, rightTerms.size);
  return overlap / denominator >= 0.5;
}

function sourcePreference(candidate: CampCandidate): number {
  const visibility = candidate.recommendationVisibility ?? 'operational';
  const freshness = candidate.evidence?.currentCondition.freshness ?? 'unavailable';
  return SOURCE_RANK[candidate.source] * 100 +
    VISIBILITY_RANK[visibility] * 20 +
    CONFIDENCE_RANK[candidate.sourceConfidence] * 5 +
    FRESHNESS_RANK[freshness];
}

function preferredCandidate(left: CampCandidate, right: CampCandidate): CampCandidate {
  const difference = sourcePreference(right) - sourcePreference(left);
  if (difference !== 0) return difference > 0 ? right : left;
  return right.id.localeCompare(left.id) < 0 ? right : left;
}

function moreRestrictive<T extends string>(left: T, right: T, rank: Record<T, number>): T {
  return rank[right] > rank[left] ? right : left;
}

function lowerConfidence(left: CampOpsConfidence, right: CampOpsConfidence): CampOpsConfidence {
  return CONFIDENCE_RANK[right] < CONFIDENCE_RANK[left] ? right : left;
}

function lowerFreshness(left: SourceTruthFreshness, right: SourceTruthFreshness): SourceTruthFreshness {
  return FRESHNESS_RANK[right] < FRESHNESS_RANK[left] ? right : left;
}

function mergeEvidence(
  winner: CampCandidate,
  entries: Array<{ candidate: CampCandidate; enrichment?: CampCandidateEnrichment }>,
): CampCandidateOperationalEvidence | undefined {
  const all = entries
    .map((entry) => entry.candidate.evidence)
    .filter((evidence): evidence is CampCandidateOperationalEvidence => Boolean(evidence));
  if (all.length === 0) return winner.evidence;
  const preferred = winner.evidence ?? all[0];
  const legalValues = new Set(all.map((evidence) => evidence.legalAccess.legalStatus).filter((value) => value !== 'unknown'));
  const closureValues = new Set(all.map((evidence) => evidence.legalAccess.closureStatus).filter((value) => value !== 'unknown'));
  const conditionValues = new Set(all.map((evidence) => evidence.currentCondition.status).filter((value) => value !== 'unknown'));
  const availabilityEvidence = all.filter((evidence) =>
    evidence.availability.status !== 'unknown' || evidence.availability.sourceRefs.length > 0);
  const availabilityInputs = availabilityEvidence.length > 0 ? availabilityEvidence : all;
  const availabilityValues = Array.from(new Set(
    availabilityInputs.map((evidence) => evidence.availability.status).filter((value) => value !== 'unknown'),
  ));
  const availabilityConflict = availabilityValues.length > 1;
  const availabilityStatus = availabilityConflict
    ? 'unknown'
    : availabilityValues[0] ?? 'unknown';
  const availabilityFreshness = availabilityInputs
    .map((evidence) => evidence.availability.freshness)
    .reduce(lowerFreshness, availabilityInputs[0]?.availability.freshness ?? 'unavailable');
  const availabilityConfidence = availabilityInputs
    .map((evidence) => evidence.availability.confidence)
    .reduce(lowerConfidence, availabilityInputs[0]?.availability.confidence ?? 'unknown');
  const availabilityRefs = sanitizeRefs(availabilityInputs.flatMap((evidence) => evidence.availability.sourceRefs));
  const availabilityNotes = unique(availabilityInputs.flatMap((evidence) => evidence.availability.notes));

  return all.reduce<CampCandidateOperationalEvidence>((merged, evidence) => ({
    legalAccess: {
      ...merged.legalAccess,
      legalStatus: moreRestrictive(merged.legalAccess.legalStatus, evidence.legalAccess.legalStatus, LEGAL_RESTRICTION_RANK),
      publicAccessStatus: moreRestrictive(
        merged.legalAccess.publicAccessStatus,
        evidence.legalAccess.publicAccessStatus,
        PUBLIC_ACCESS_RESTRICTION_RANK,
      ),
      closureStatus: moreRestrictive(
        merged.legalAccess.closureStatus,
        evidence.legalAccess.closureStatus,
        ACCESS_RESTRICTION_RANK,
      ),
      requiresVerification: merged.legalAccess.requiresVerification || evidence.legalAccess.requiresVerification,
      confidence: lowerConfidence(merged.legalAccess.confidence, evidence.legalAccess.confidence),
      freshness: lowerFreshness(merged.legalAccess.freshness, evidence.legalAccess.freshness),
      conflict: legalValues.size > 1 || closureValues.size > 1 || merged.legalAccess.conflict || evidence.legalAccess.conflict,
      sourceRefs: sanitizeRefs([...merged.legalAccess.sourceRefs, ...evidence.legalAccess.sourceRefs]),
      notes: unique([...merged.legalAccess.notes, ...evidence.legalAccess.notes]),
    },
    currentCondition: {
      ...merged.currentCondition,
      status: moreRestrictive(
        merged.currentCondition.status,
        evidence.currentCondition.status,
        CONDITION_RESTRICTION_RANK,
      ),
      summary: unique([merged.currentCondition.summary, evidence.currentCondition.summary]).join('; ') || null,
      confidence: lowerConfidence(merged.currentCondition.confidence, evidence.currentCondition.confidence),
      freshness: lowerFreshness(merged.currentCondition.freshness, evidence.currentCondition.freshness),
      conflict: conditionValues.size > 1 || merged.currentCondition.conflict || evidence.currentCondition.conflict,
      sourceRefs: sanitizeRefs([...merged.currentCondition.sourceRefs, ...evidence.currentCondition.sourceRefs]),
      notes: unique([...merged.currentCondition.notes, ...evidence.currentCondition.notes]),
    },
    availability: {
      ...merged.availability,
      status: availabilityStatus,
      usableForDecision: !availabilityConflict && availabilityInputs.some((item) =>
        item.availability.status === availabilityStatus && item.availability.usableForDecision),
      observedAt: availabilityInputs
        .map((item) => item.availability.observedAt)
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null,
      confidence: availabilityConfidence,
      freshness: availabilityFreshness,
      conflict: availabilityConflict || merged.availability.conflict || evidence.availability.conflict,
      sourceRefs: availabilityRefs,
      notes: unique([
        ...availabilityNotes,
        ...(availabilityConflict ? ['Availability providers conflict; current availability is unknown.'] : []),
      ]),
    },
    suitability: {
      ...merged.suitability,
      score: merged.suitability.score == null
        ? evidence.suitability.score
        : evidence.suitability.score == null
          ? merged.suitability.score
          : Math.min(merged.suitability.score, evidence.suitability.score),
      vehicleFit: moreRestrictive(merged.suitability.vehicleFit, evidence.suitability.vehicleFit, FIT_RESTRICTION_RANK),
      trailerFit: moreRestrictive(merged.suitability.trailerFit, evidence.suitability.trailerFit, FIT_RESTRICTION_RANK),
      groupCapacity: merged.suitability.groupCapacity == null
        ? evidence.suitability.groupCapacity
        : evidence.suitability.groupCapacity == null
          ? merged.suitability.groupCapacity
          : Math.min(merged.suitability.groupCapacity, evidence.suitability.groupCapacity),
      confidence: lowerConfidence(merged.suitability.confidence, evidence.suitability.confidence),
      reasons: unique([...merged.suitability.reasons, ...evidence.suitability.reasons]),
    },
    communityTrust: {
      ...merged.communityTrust,
      confirmationCount: Math.max(merged.communityTrust.confirmationCount, evidence.communityTrust.confirmationCount),
      negativeReportCount: Math.max(merged.communityTrust.negativeReportCount, evidence.communityTrust.negativeReportCount),
      notes: unique([...merged.communityTrust.notes, ...evidence.communityTrust.notes]),
    },
  }), preferred);
}

function mergeEnrichments(
  winner: CampCandidate,
  entries: Array<{ candidate: CampCandidate; enrichment?: CampCandidateEnrichment }>,
): CampCandidateEnrichment | undefined {
  const available = entries.map((entry) => entry.enrichment).filter((item): item is CampCandidateEnrichment => Boolean(item));
  if (available.length === 0) return undefined;
  const preferred = entries.find((entry) => entry.candidate.id === winner.id)?.enrichment ?? available[0];
  return available.reduce<CampCandidateEnrichment>((merged, enrichment) => ({
    ...merged,
    candidateId: winner.id,
    legalStatus: moreRestrictive(merged.legalStatus, enrichment.legalStatus, LEGAL_RESTRICTION_RANK),
    legalConfidence: lowerConfidence(merged.legalConfidence, enrichment.legalConfidence),
    closureStatus: moreRestrictive(
      merged.closureStatus ?? 'unknown',
      enrichment.closureStatus ?? 'unknown',
      ACCESS_RESTRICTION_RANK,
    ),
    publicAccessStatus: moreRestrictive(
      merged.publicAccessStatus ?? 'unknown',
      enrichment.publicAccessStatus ?? 'unknown',
      PUBLIC_ACCESS_RESTRICTION_RANK,
    ),
    vehicleFit: moreRestrictive(merged.vehicleFit, enrichment.vehicleFit, FIT_RESTRICTION_RANK),
    trailerSuitability: moreRestrictive(
      merged.trailerSuitability,
      enrichment.trailerSuitability,
      FIT_RESTRICTION_RANK,
    ),
    dataConfidence: lowerConfidence(merged.dataConfidence, enrichment.dataConfidence),
    dataLimitations: unique([...(merged.dataLimitations ?? []), ...(enrichment.dataLimitations ?? [])]),
    sourceSignals: [...(merged.sourceSignals ?? []), ...(enrichment.sourceSignals ?? [])],
    sourceResolutions: [...(merged.sourceResolutions ?? []), ...(enrichment.sourceResolutions ?? [])],
  }), { ...preferred, candidateId: winner.id });
}

function mergeCandidateGroup(entries: Array<{ candidate: CampCandidate; enrichment?: CampCandidateEnrichment }>): {
  candidate: CampCandidate;
  enrichment?: CampCandidateEnrichment;
} {
  const winner = entries.reduce((current, entry) => preferredCandidate(current, entry.candidate), entries[0].candidate);
  const evidence = mergeEvidence(winner, entries);
  const merged = normalizeCampCandidate({
    ...winner,
    tags: unique(entries.flatMap((entry) => entry.candidate.tags ?? [])),
    provenance: {
      canonicalId: winner.canonicalId ?? createCampCandidateCanonicalId(winner),
      candidateClass: winner.candidateClass ?? 'unknown',
      sourceRecordIds: unique(entries.flatMap((entry) => entry.candidate.provenance?.sourceRecordIds ?? [])),
      sourceLabels: unique(entries.flatMap((entry) => entry.candidate.provenance?.sourceLabels ?? [entry.candidate.source])),
      attribution: unique(entries.flatMap((entry) => entry.candidate.provenance?.attribution ?? [])),
    },
    evidence,
  });
  const mergedEnrichment = mergeEnrichments(merged, entries);
  return {
    candidate: merged,
    enrichment: mergedEnrichment && merged.evidence
      ? {
          ...mergedEnrichment,
          availabilityStatus: merged.evidence.availability.status,
          availabilityFreshness: merged.evidence.availability.freshness,
          availabilityUsableForDecision: merged.evidence.availability.usableForDecision,
        }
      : mergedEnrichment,
  };
}

export function normalizeCampCandidatePool(input: {
  candidates: CampCandidate[];
  enrichmentsByCandidateId?: Record<string, CampCandidateEnrichment | undefined>;
  duplicateRadiusMiles?: number;
  includeBlocked?: boolean;
}): CampCandidatePoolResult {
  const duplicateRadiusMiles = Math.max(0, input.duplicateRadiusMiles ?? DEFAULT_DUPLICATE_RADIUS_MILES);
  const excludedCandidates: CampCandidatePoolResult['excludedCandidates'] = [];
  const entries = input.candidates
    .map(normalizeCampCandidate)
    .filter((candidate) => {
      if (!validCoordinate(candidate)) {
        excludedCandidates.push({ candidate, reason: 'Candidate coordinates are invalid.' });
        return false;
      }
      if (candidate.recommendationVisibility === 'blocked' && input.includeBlocked !== true) {
        excludedCandidates.push({ candidate, reason: 'Candidate is blocked from operational recommendations.' });
        return false;
      }
      return true;
    })
    .map((candidate) => ({ candidate, enrichment: input.enrichmentsByCandidateId?.[candidate.id] }));

  const parent = entries.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]];
      cursor = parent[cursor];
    }
    return cursor;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  const exact = new Map<string, number>();
  const buckets = new Map<string, number[]>();
  const cellDegrees = Math.max(0.0001, duplicateRadiusMiles / 69);
  let distanceCheckCount = 0;
  entries.forEach((entry, index) => {
    const canonical = entry.candidate.canonicalId ?? createCampCandidateCanonicalId(entry.candidate);
    const exactMatch = exact.get(canonical);
    if (exactMatch != null) union(index, exactMatch);
    else exact.set(canonical, index);

    const latBucket = Math.floor(entry.candidate.location.latitude / cellDegrees);
    const lngBucket = Math.floor(entry.candidate.location.longitude / cellDegrees);
    const longitudeRange = Math.max(1, Math.ceil(1 / Math.max(0.1, Math.cos(radians(entry.candidate.location.latitude)))));
    for (let latDelta = -1; latDelta <= 1; latDelta += 1) {
      for (let lngDelta = -longitudeRange; lngDelta <= longitudeRange; lngDelta += 1) {
        const nearby = buckets.get(`${latBucket + latDelta}:${lngBucket + lngDelta}`) ?? [];
        for (const candidateIndex of nearby) {
          distanceCheckCount += 1;
          const miles = distanceMiles(entry.candidate, entries[candidateIndex].candidate);
          if (miles <= duplicateRadiusMiles && namesLikelyMatch(entry.candidate, entries[candidateIndex].candidate, miles)) {
            union(index, candidateIndex);
          }
        }
      }
    }
    const key = `${latBucket}:${lngBucket}`;
    buckets.set(key, [...(buckets.get(key) ?? []), index]);
  });

  const groups = new Map<number, typeof entries>();
  entries.forEach((entry, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), entry]);
  });

  const candidates: CampCandidate[] = [];
  const enrichmentsByCandidateId: Record<string, CampCandidateEnrichment | undefined> = {};
  const aliasesByCandidateId: Record<string, string> = {};
  for (const group of groups.values()) {
    const merged = mergeCandidateGroup(group);
    candidates.push(merged.candidate);
    enrichmentsByCandidateId[merged.candidate.id] = merged.enrichment;
    group.forEach((entry) => {
      aliasesByCandidateId[entry.candidate.id] = merged.candidate.id;
    });
  }
  candidates.sort((left, right) => left.id.localeCompare(right.id));

  return {
    candidates,
    enrichmentsByCandidateId,
    aliasesByCandidateId,
    excludedCandidates,
    diagnostics: {
      inputCount: input.candidates.length,
      outputCount: candidates.length,
      blockedCount: excludedCandidates.filter((entry) => entry.candidate.recommendationVisibility === 'blocked').length,
      duplicateCount: Math.max(0, entries.length - candidates.length),
      distanceCheckCount,
    },
  };
}

function title(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function sourceLabels(refs: SourceTruthRef[] | undefined, fallback: string[]): string[] {
  return unique([...(refs ?? []).map((ref) => ref.provider ?? ref.authority ?? ref.id), ...fallback]).slice(0, 4);
}

export function buildCampCandidateDecisionDetails(
  candidate: CampCandidate,
  enrichment?: CampCandidateEnrichment,
): CampCandidateDecisionDetail[] {
  const evidence = candidate.evidence;
  const availability = evidence?.availability.status ?? enrichment?.availabilityStatus ?? 'unknown';
  const availabilityFreshness = evidence?.availability.freshness ?? enrichment?.availabilityFreshness ?? null;
  const legalStatus = evidence?.legalAccess.legalStatus ?? enrichment?.legalStatus ?? 'unknown';
  const closureStatus = evidence?.legalAccess.closureStatus ?? enrichment?.closureStatus ?? 'unknown';
  return [
    {
      id: 'legal_access',
      label: 'Legal / access',
      value: `${title(legalStatus)} / ${title(closureStatus)}`,
      confidence: evidence?.legalAccess.confidence ?? enrichment?.legalConfidence ?? 'unknown',
      freshness: evidence?.legalAccess.freshness ?? null,
      sourceLabels: sourceLabels(evidence?.legalAccess.sourceRefs, candidate.provenance?.sourceLabels ?? []),
      warning: legalStatus === 'unknown' || closureStatus === 'unknown' ? 'Verify legal access and current closures.' : null,
    },
    {
      id: 'current_condition',
      label: 'Current condition',
      value: title(evidence?.currentCondition.status ?? 'unknown'),
      confidence: evidence?.currentCondition.confidence ?? 'unknown',
      freshness: evidence?.currentCondition.freshness ?? null,
      sourceLabels: sourceLabels(evidence?.currentCondition.sourceRefs, []),
      warning: evidence?.currentCondition.status === 'clear' ? null : 'Current condition is not fully cleared.',
    },
    {
      id: 'availability',
      label: 'Availability',
      value: title(availability),
      confidence: evidence?.availability.confidence ?? 'unknown',
      freshness: availabilityFreshness,
      sourceLabels: sourceLabels(evidence?.availability.sourceRefs, []),
      warning: evidence?.availability.usableForDecision === true ? null : 'Availability is stale, missing, or not decision-ready.',
    },
    {
      id: 'suitability',
      label: 'Suitability',
      value: evidence?.suitability.score == null ? 'Needs Verification' : `${evidence.suitability.score}/100`,
      confidence: evidence?.suitability.confidence ?? enrichment?.dataConfidence ?? 'unknown',
      freshness: null,
      sourceLabels: candidate.provenance?.sourceLabels ?? [],
      warning: evidence?.suitability.vehicleFit === 'not_fit' ? 'Vehicle fit is not suitable.' : null,
    },
    {
      id: 'community_trust',
      label: 'Community trust',
      value: title(evidence?.communityTrust.status ?? 'unknown'),
      confidence: evidence?.communityTrust.confidence ?? 'unknown',
      freshness: null,
      sourceLabels: candidate.source === 'community' ? ['ECS community review'] : [],
      warning: candidate.recommendationVisibility === 'blocked' ? 'This record is not approved for public recommendations.' : null,
    },
  ];
}
