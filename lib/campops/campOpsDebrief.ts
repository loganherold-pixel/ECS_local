import type {
  CampAccessDifficulty,
  CampCandidate,
  CampFitStatus,
  CampImpactLevel,
  CampLikelihoodLevel,
  CampOpsConfidence,
  CampOpsGeoPoint,
} from './campOpsTypes';
import {
  isCampOpsDebriefCommunityPublishingFeatureEnabled,
  type CampOpsRecommendationRolloutConfig,
} from './campOpsRecommendationConfig';
import { emitCampOpsDebriefCreated } from './campOpsTelemetry';

export const CAMP_OPS_DEBRIEF_OBSERVED_LEGAL_STATUSES = [
  'posted_allowed',
  'posted_restricted',
  'posted_prohibited',
  'no_signage_observed',
  'unknown',
] as const;
export type CampOpsDebriefObservedLegalStatus =
  (typeof CAMP_OPS_DEBRIEF_OBSERVED_LEGAL_STATUSES)[number];

export const CAMP_OPS_DEBRIEF_FLATNESS_LEVELS = ['flat', 'mostly_flat', 'sloped', 'uneven', 'unknown'] as const;
export type CampOpsDebriefFlatnessLevel = (typeof CAMP_OPS_DEBRIEF_FLATNESS_LEVELS)[number];

export const CAMP_OPS_DEBRIEF_TRAILER_TURNAROUND_LEVELS = [
  'easy',
  'tight',
  'difficult',
  'not_possible',
  'unknown',
] as const;
export type CampOpsDebriefTrailerTurnaroundLevel =
  (typeof CAMP_OPS_DEBRIEF_TRAILER_TURNAROUND_LEVELS)[number];

export const CAMP_OPS_DEBRIEF_LATE_ARRIVAL_LEVELS = ['good', 'caution', 'not_recommended', 'unknown'] as const;
export type CampOpsDebriefLateArrivalLevel = (typeof CAMP_OPS_DEBRIEF_LATE_ARRIVAL_LEVELS)[number];

export const CAMP_OPS_DEBRIEF_RECOMMENDATION_VALUES = ['yes', 'no', 'unknown'] as const;
export type CampOpsDebriefRecommendationValue = (typeof CAMP_OPS_DEBRIEF_RECOMMENDATION_VALUES)[number];

export const CAMP_OPS_DEBRIEF_PRIVACY_VISIBILITIES = [
  'private',
  'shared_with_convoy',
  'community_anonymized',
  'public_verified',
] as const;
export const LEGACY_CAMP_OPS_DEBRIEF_PRIVACY_VISIBILITIES = ['group', 'community_candidate'] as const;
export type CampOpsDebriefPrivacyVisibility =
  | (typeof CAMP_OPS_DEBRIEF_PRIVACY_VISIBILITIES)[number]
  | (typeof LEGACY_CAMP_OPS_DEBRIEF_PRIVACY_VISIBILITIES)[number];

export const CAMP_OPS_DEBRIEF_PUBLISHING_STATES = [
  'private',
  'shared_with_convoy',
  'community_draft',
  'pending_review',
  'approved_anonymized',
  'rejected',
  'removed',
] as const;
export type CampOpsDebriefPublishingState = (typeof CAMP_OPS_DEBRIEF_PUBLISHING_STATES)[number];

export type CampOpsDebriefPublishingConsent = {
  shareWithConvoy?: boolean;
  publishCommunityAnonymized?: boolean;
  publishPublicVerified?: boolean;
  acceptedAtIso?: string | null;
  consentVersion?: string | null;
};

export type CampOpsDebriefPrivacyOptions = {
  storePreciseLocation?: boolean;
  storeUserId?: boolean;
  storeVehicleProfileAssociation?: boolean;
  storePhotoRefs?: boolean;
  retentionDays?: number | null;
};

export type CampOpsDebriefPublishingConsentMetadata = {
  scope: 'shared_with_convoy' | 'community_anonymized' | 'public_verified';
  acceptedAtIso: string | null;
  consentVersion: string | null;
};

export type CampOpsDebriefPrivacyMetadata = {
  preciseLocationStored: boolean;
  userIdStored: boolean;
  vehicleProfileStored: boolean;
  photoRefsStored: boolean;
  retentionExpiresAtIso: string | null;
  publishingConsent: CampOpsDebriefPublishingConsentMetadata | null;
};

export type CampOpsDebriefPhotoRef = {
  id?: string | null;
  localUri?: string | null;
  storageUrl?: string | null;
  thumbnailUrl?: string | null;
  exifStripped?: boolean | null;
  visibility: CampOpsDebriefPrivacyVisibility;
};

export type CampOpsDebriefStructuredFields = {
  wasCampAccessible: CampOpsDebriefRecommendationValue;
  observedLegalStatus: CampOpsDebriefObservedLegalStatus;
  approximateVehicleCapacity: number | null;
  flatness: CampOpsDebriefFlatnessLevel;
  trailerTurnaroundDifficulty: CampOpsDebriefTrailerTurnaroundLevel;
  privacy: CampLikelihoodLevel;
  windExposure: CampImpactLevel;
  fireRestrictionSignage: CampOpsDebriefObservedLegalStatus;
  hazards: string[];
  lateArrivalSuitability: CampOpsDebriefLateArrivalLevel;
  petsSuitability: CampOpsDebriefRecommendationValue;
  kidsSuitability: CampOpsDebriefRecommendationValue;
  recommendSoloVehicle: CampOpsDebriefRecommendationValue;
  recommendFamily: CampOpsDebriefRecommendationValue;
  recommendTrailer: CampOpsDebriefRecommendationValue;
  recommendLargeGroup: CampOpsDebriefRecommendationValue;
};

export type CampOpsDebriefInput = {
  campId?: string | null;
  campName?: string | null;
  location?: CampOpsGeoPoint | null;
  visitedAtIso: string;
  submittedAtIso?: string | null;
  userId?: string | null;
  vehicleProfileId?: string | null;
  allowVehicleProfileAssociation?: boolean;
  privacy?: CampOpsDebriefPrivacyOptions;
  source: 'visited_camp' | 'marked_visited' | 'manual' | 'recommendation_set';
  visibility?: CampOpsDebriefPrivacyVisibility;
  publishingState?: CampOpsDebriefPublishingState;
  publishingConsent?: CampOpsDebriefPublishingConsent;
  rolloutConfig?: Partial<CampOpsRecommendationRolloutConfig> | null;
  structured: CampOpsDebriefStructuredFields;
  notes?: string | null;
  photos?: CampOpsDebriefPhotoRef[];
  relatedCampCandidate?: CampCandidate | null;
};

export type CampOpsDebriefRecord = {
  id: string;
  campId: string | null;
  campName: string | null;
  location: CampOpsGeoPoint | null;
  userId: string | null;
  vehicleProfileId: string | null;
  visibility: CampOpsDebriefPrivacyVisibility;
  publishingState: CampOpsDebriefPublishingState;
  source: CampOpsDebriefInput['source'];
  structured: CampOpsDebriefStructuredFields;
  notes: string | null;
  photos: CampOpsDebriefPhotoRef[];
  privacy: CampOpsDebriefPrivacyMetadata;
  visitedAtIso: string;
  submittedAtIso: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type CampOpsDebriefSuitabilityPatch = {
  candidateId: string | null;
  campName: string | null;
  accessDifficulty?: CampAccessDifficulty | null;
  legalConfidence?: CampOpsConfidence | null;
  vehicleFit?: CampFitStatus | null;
  trailerSuitability?: CampFitStatus | null;
  groupCapacityEstimate?: number | null;
  terrainFlatness?: CampOpsDebriefFlatnessLevel;
  windExposure?: CampImpactLevel;
  privacyLikelihood?: CampLikelihoodLevel;
  lateArrivalRisk?: CampImpactLevel;
  fireRestrictionObserved?: CampOpsDebriefObservedLegalStatus;
  hazards: string[];
  recommendationHints: {
    soloVehicle: CampOpsDebriefRecommendationValue;
    family: CampOpsDebriefRecommendationValue;
    trailer: CampOpsDebriefRecommendationValue;
    largeGroup: CampOpsDebriefRecommendationValue;
  };
};

export type CampOpsCommunitySafeDebrief = {
  campId: string | null;
  campName: string | null;
  approximateLocation: CampOpsGeoPoint | null;
  observedAccess: CampOpsDebriefRecommendationValue;
  observedLegalStatus: CampOpsDebriefObservedLegalStatus;
  observedCapacity: number | null;
  observedTrailerSuitability: CampFitStatus | null;
  observedFireSignage: CampOpsDebriefObservedLegalStatus;
  observedHazards: string[];
  dateBucket: string | null;
  confidence: CampOpsConfidence;
  sourceVisibility: 'community_anonymized' | 'public_verified';
  publishingState: 'approved_anonymized';
};

export type CampOpsDebriefValidationResult = {
  ok: boolean;
  errors: string[];
};

export type CampOpsDebriefServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: 'validation_error' | 'backend_error'; error: string; details?: string[] };

export interface CampOpsDebriefBackend {
  insertDebrief(record: CampOpsDebriefRecord): Promise<CampOpsDebriefServiceResult<CampOpsDebriefRecord>>;
}

export const DEFAULT_CAMP_OPS_DEBRIEF_STRUCTURED_FIELDS: CampOpsDebriefStructuredFields = {
  wasCampAccessible: 'unknown',
  observedLegalStatus: 'unknown',
  approximateVehicleCapacity: null,
  flatness: 'unknown',
  trailerTurnaroundDifficulty: 'unknown',
  privacy: 'unknown',
  windExposure: 'unknown',
  fireRestrictionSignage: 'unknown',
  hazards: [],
  lateArrivalSuitability: 'unknown',
  petsSuitability: 'unknown',
  kidsSuitability: 'unknown',
  recommendSoloVehicle: 'unknown',
  recommendFamily: 'unknown',
  recommendTrailer: 'unknown',
  recommendLargeGroup: 'unknown',
};

const MAX_NOTES_LENGTH = 2000;
const MAX_HAZARDS = 20;
export const CAMP_OPS_DEBRIEF_STORAGE_KEY = 'ecs_campops_debriefs_v1';
export const CAMP_OPS_PRIVATE_DEBRIEF_RETENTION_DAYS = 365;
export const CAMP_OPS_CONVOY_DEBRIEF_RETENTION_DAYS = 180;
export const CAMP_OPS_COMMUNITY_DEBRIEF_RETENTION_DAYS = 90;
let memoryDebriefRecords: CampOpsDebriefRecord[] = [];

function isFiniteLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isFiniteLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number]);
}

function normalizeVisibility(visibility: CampOpsDebriefPrivacyVisibility | null | undefined): CampOpsDebriefPrivacyVisibility {
  if (visibility === 'group') return 'shared_with_convoy';
  if (visibility === 'community_candidate') return 'community_anonymized';
  return visibility ?? 'private';
}

function isKnownVisibility(value: unknown): value is CampOpsDebriefPrivacyVisibility {
  return (
    isOneOf(CAMP_OPS_DEBRIEF_PRIVACY_VISIBILITIES, value) ||
    isOneOf(LEGACY_CAMP_OPS_DEBRIEF_PRIVACY_VISIBILITIES, value)
  );
}

function isKnownPublishingState(value: unknown): value is CampOpsDebriefPublishingState {
  return isOneOf(CAMP_OPS_DEBRIEF_PUBLISHING_STATES, value);
}

function isCommunityVisible(visibility: CampOpsDebriefPrivacyVisibility): boolean {
  return visibility === 'community_anonymized' || visibility === 'public_verified';
}

const CAMP_OPS_DEBRIEF_PUBLISHING_STATE_TRANSITIONS: Record<CampOpsDebriefPublishingState, CampOpsDebriefPublishingState[]> = {
  private: ['shared_with_convoy', 'community_draft'],
  shared_with_convoy: ['private', 'community_draft'],
  community_draft: ['private', 'pending_review', 'removed'],
  pending_review: ['approved_anonymized', 'rejected', 'removed'],
  approved_anonymized: ['removed'],
  rejected: ['community_draft', 'removed'],
  removed: [],
};

function defaultPublishingStateForVisibility(visibility: CampOpsDebriefPrivacyVisibility): CampOpsDebriefPublishingState {
  if (visibility === 'shared_with_convoy') return 'shared_with_convoy';
  if (isCommunityVisible(visibility)) return 'community_draft';
  return 'private';
}

function normalizePublishingState(
  state: CampOpsDebriefPublishingState | null | undefined,
  visibility: CampOpsDebriefPrivacyVisibility,
): CampOpsDebriefPublishingState {
  return state ?? defaultPublishingStateForVisibility(visibility);
}

export function canTransitionCampOpsDebriefPublishingState(
  from: CampOpsDebriefPublishingState,
  to: CampOpsDebriefPublishingState,
): boolean {
  return CAMP_OPS_DEBRIEF_PUBLISHING_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

function consentScopeForVisibility(
  visibility: CampOpsDebriefPrivacyVisibility,
): CampOpsDebriefPublishingConsentMetadata['scope'] | null {
  if (visibility === 'shared_with_convoy') return 'shared_with_convoy';
  if (visibility === 'community_anonymized') return 'community_anonymized';
  if (visibility === 'public_verified') return 'public_verified';
  return null;
}

function hasConsentForVisibility(
  visibility: CampOpsDebriefPrivacyVisibility,
  consent: CampOpsDebriefPublishingConsent | undefined,
): boolean {
  if (visibility === 'private') return true;
  if (visibility === 'shared_with_convoy') return consent?.shareWithConvoy === true;
  if (visibility === 'community_anonymized') return consent?.publishCommunityAnonymized === true;
  if (visibility === 'public_verified') return consent?.publishPublicVerified === true;
  return false;
}

function normalizeDateIso(value: string | null | undefined, fallbackIso: string): string {
  if (!value) return fallbackIso;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
}

function sanitizeText(value: string | null | undefined, maxLength = MAX_NOTES_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const sanitized = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized ? sanitized.slice(0, maxLength) : null;
}

export function redactCampOpsDebriefNoteForCommunity(value: string | null | undefined): string | null {
  const sanitized = sanitizeText(value, MAX_NOTES_LENGTH);
  if (!sanitized) return null;
  return sanitized
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted email]')
    .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, '[redacted phone]')
    .replace(/\b(?:user|vehicle|vin|plate|license)\s*[:#-]?\s*[A-Z0-9_-]{4,}\b/gi, '[redacted identifier]')
    .replace(/\b(?:file|content):\/\/\S+/gi, '[redacted local ref]');
}

function normalizeHazards(hazards: unknown): string[] {
  if (!Array.isArray(hazards)) return [];
  return Array.from(
    new Set(
      hazards
        .map((hazard) => sanitizeText(typeof hazard === 'string' ? hazard : null, 120))
        .filter((hazard): hazard is string => Boolean(hazard))
        .slice(0, MAX_HAZARDS),
    ),
  );
}

function resolvePrivacyOptions(
  visibility: CampOpsDebriefPrivacyVisibility,
  options: CampOpsDebriefPrivacyOptions | undefined,
): Required<CampOpsDebriefPrivacyOptions> {
  const privateRecord = visibility === 'private';
  return {
    storePreciseLocation: options?.storePreciseLocation ?? privateRecord,
    storeUserId: options?.storeUserId ?? privateRecord,
    storeVehicleProfileAssociation: options?.storeVehicleProfileAssociation ?? privateRecord,
    storePhotoRefs: options?.storePhotoRefs ?? privateRecord,
    retentionDays: options?.retentionDays ?? defaultRetentionDaysForVisibility(visibility),
  };
}

function defaultRetentionDaysForVisibility(visibility: CampOpsDebriefPrivacyVisibility): number {
  if (visibility === 'shared_with_convoy') return CAMP_OPS_CONVOY_DEBRIEF_RETENTION_DAYS;
  if (visibility === 'community_anonymized' || visibility === 'public_verified') {
    return CAMP_OPS_COMMUNITY_DEBRIEF_RETENTION_DAYS;
  }
  return CAMP_OPS_PRIVATE_DEBRIEF_RETENTION_DAYS;
}

function buildPublishingConsentMetadata(
  visibility: CampOpsDebriefPrivacyVisibility,
  consent: CampOpsDebriefPublishingConsent | undefined,
): CampOpsDebriefPublishingConsentMetadata | null {
  const scope = consentScopeForVisibility(visibility);
  if (!scope || !hasConsentForVisibility(visibility, consent)) return null;
  return {
    scope,
    acceptedAtIso: normalizeDateIso(consent?.acceptedAtIso ?? null, new Date().toISOString()),
    consentVersion: sanitizeText(consent?.consentVersion, 80),
  };
}

function retentionExpiresAt(nowIso: string, retentionDays: number | null): string | null {
  if (retentionDays == null || !Number.isFinite(retentionDays) || retentionDays <= 0) return null;
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs)) return null;
  return new Date(nowMs + Math.round(retentionDays) * 24 * 60 * 60 * 1000).toISOString();
}

function isDebriefExpired(record: CampOpsDebriefRecord, nowIso = new Date().toISOString()): boolean {
  const expiresAtIso = record.privacy?.retentionExpiresAtIso;
  if (!expiresAtIso) return false;
  const expiresAtMs = Date.parse(expiresAtIso);
  const nowMs = Date.parse(nowIso);
  return Number.isFinite(expiresAtMs) && Number.isFinite(nowMs) && expiresAtMs <= nowMs;
}

function pruneExpiredDebriefs(records: CampOpsDebriefRecord[], nowIso = new Date().toISOString()): CampOpsDebriefRecord[] {
  return records.filter((record) => !isDebriefExpired(record, nowIso));
}

function normalizeLocation(
  location: CampOpsGeoPoint | null | undefined,
  storePreciseLocation: boolean,
): CampOpsGeoPoint | null {
  if (!location) return null;
  if (storePreciseLocation) return location;
  return {
    latitude: Math.round(location.latitude * 100) / 100,
    longitude: Math.round(location.longitude * 100) / 100,
    accuracyMeters: null,
    label: null,
  };
}

export function redactCampOpsDebriefLocationForCommunity(
  location: CampOpsGeoPoint | null | undefined,
): CampOpsGeoPoint | null {
  if (!location) return null;
  return {
    latitude: Math.round(location.latitude * 10) / 10,
    longitude: Math.round(location.longitude * 10) / 10,
    accuracyMeters: null,
    label: null,
  };
}

function dateBucketFromIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 7);
}

function normalizePhotos(
  photos: CampOpsDebriefPhotoRef[] | undefined,
  visibility: CampOpsDebriefPrivacyVisibility,
  storePhotoRefs: boolean,
): CampOpsDebriefPhotoRef[] {
  if (!storePhotoRefs) return [];
  return (photos ?? []).slice(0, 20).map((photo) => ({
    id: sanitizeText(photo.id, 128),
    localUri: sanitizeText(photo.localUri, 500),
    storageUrl: sanitizeText(photo.storageUrl, 500),
    thumbnailUrl: sanitizeText(photo.thumbnailUrl, 500),
    exifStripped: photo.exifStripped ?? null,
    visibility: photo.visibility ?? visibility,
  }));
}

export function createDefaultCampOpsDebriefInput(
  overrides: Partial<CampOpsDebriefInput> = {},
): CampOpsDebriefInput {
  const now = new Date().toISOString();
  const structured = {
    ...DEFAULT_CAMP_OPS_DEBRIEF_STRUCTURED_FIELDS,
    ...(overrides.structured ?? {}),
  };
  return {
    campId: null,
    campName: null,
    location: null,
    visitedAtIso: now,
    submittedAtIso: now,
    userId: null,
    vehicleProfileId: null,
    allowVehicleProfileAssociation: false,
    privacy: undefined,
    source: 'manual',
    visibility: 'private',
    publishingConsent: undefined,
    notes: null,
    photos: [],
    relatedCampCandidate: null,
    ...overrides,
    structured,
  };
}

export function validateCampOpsDebriefInput(input: CampOpsDebriefInput): CampOpsDebriefValidationResult {
  const errors: string[] = [];
  const structured = input.structured;
  const visibility = normalizeVisibility(input.visibility);

  if (!input.visitedAtIso) errors.push('visitedAtIso is required');
  if (!structured) errors.push('structured debrief fields are required');
  if (!isKnownVisibility(input.visibility ?? 'private')) errors.push('visibility is invalid');
  if (!isKnownPublishingState(input.publishingState ?? defaultPublishingStateForVisibility(visibility))) {
    errors.push('publishingState is invalid');
  }
  if (visibility === 'shared_with_convoy' && !hasConsentForVisibility(visibility, input.publishingConsent)) {
    errors.push('shared_with_convoy visibility requires explicit convoy sharing consent');
  }
  if (isCommunityVisible(visibility) && !hasConsentForVisibility(visibility, input.publishingConsent)) {
    errors.push(`${visibility} visibility requires explicit community publishing consent`);
  }
  if (
    isCommunityVisible(visibility) &&
    !isCampOpsDebriefCommunityPublishingFeatureEnabled(input.rolloutConfig ?? {})
  ) {
    errors.push(`${visibility} visibility is disabled for this CampOps rollout`);
  }
  const publishingState = normalizePublishingState(input.publishingState, visibility);
  if (isCommunityVisible(visibility) && (publishingState === 'private' || publishingState === 'shared_with_convoy')) {
    errors.push(`${visibility} visibility requires a community publishing state`);
  }
  if (!isCommunityVisible(visibility) && ['community_draft', 'pending_review', 'approved_anonymized'].includes(publishingState)) {
    errors.push(`${publishingState} requires community visibility`);
  }
  if (input.location) {
    if (!isFiniteLatitude(input.location.latitude)) errors.push('location.latitude must be between -90 and 90');
    if (!isFiniteLongitude(input.location.longitude)) errors.push('location.longitude must be between -180 and 180');
  }
  if (structured) {
    if (!isOneOf(CAMP_OPS_DEBRIEF_RECOMMENDATION_VALUES, structured.wasCampAccessible)) {
      errors.push('wasCampAccessible is invalid');
    }
    if (!isOneOf(CAMP_OPS_DEBRIEF_OBSERVED_LEGAL_STATUSES, structured.observedLegalStatus)) {
      errors.push('observedLegalStatus is invalid');
    }
    if (
      structured.approximateVehicleCapacity != null &&
      (!Number.isFinite(structured.approximateVehicleCapacity) || structured.approximateVehicleCapacity < 0)
    ) {
      errors.push('approximateVehicleCapacity must be a non-negative number');
    }
    if (!isOneOf(CAMP_OPS_DEBRIEF_FLATNESS_LEVELS, structured.flatness)) errors.push('flatness is invalid');
    if (!isOneOf(CAMP_OPS_DEBRIEF_TRAILER_TURNAROUND_LEVELS, structured.trailerTurnaroundDifficulty)) {
      errors.push('trailerTurnaroundDifficulty is invalid');
    }
    if (!['low', 'moderate', 'high', 'unknown'].includes(structured.privacy)) errors.push('privacy is invalid');
    if (!['positive', 'neutral', 'watch', 'caution', 'critical', 'unknown'].includes(structured.windExposure)) {
      errors.push('windExposure is invalid');
    }
    if (!isOneOf(CAMP_OPS_DEBRIEF_OBSERVED_LEGAL_STATUSES, structured.fireRestrictionSignage)) {
      errors.push('fireRestrictionSignage is invalid');
    }
    if (!isOneOf(CAMP_OPS_DEBRIEF_LATE_ARRIVAL_LEVELS, structured.lateArrivalSuitability)) {
      errors.push('lateArrivalSuitability is invalid');
    }
    for (const key of ['petsSuitability', 'kidsSuitability', 'recommendSoloVehicle', 'recommendFamily', 'recommendTrailer', 'recommendLargeGroup'] as const) {
      if (!isOneOf(CAMP_OPS_DEBRIEF_RECOMMENDATION_VALUES, structured[key])) errors.push(`${key} is invalid`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function createCampOpsDebriefRecord(
  input: CampOpsDebriefInput,
  nowIso = new Date().toISOString(),
): CampOpsDebriefRecord {
  const requestedVisibility = normalizeVisibility(input.visibility);
  const communityAllowed =
    !isCommunityVisible(requestedVisibility) ||
    isCampOpsDebriefCommunityPublishingFeatureEnabled(input.rolloutConfig ?? {});
  const visibility = hasConsentForVisibility(requestedVisibility, input.publishingConsent) && communityAllowed
    ? requestedVisibility
    : 'private';
  const requestedPublishingState = normalizePublishingState(input.publishingState, requestedVisibility);
  const publishingState =
    visibility === 'private'
      ? 'private'
      : visibility === 'shared_with_convoy'
        ? 'shared_with_convoy'
        : requestedPublishingState;
  const privacyOptions = resolvePrivacyOptions(visibility, input.privacy);
  const location = normalizeLocation(
    input.location ?? input.relatedCampCandidate?.location ?? null,
    privacyOptions.storePreciseLocation,
  );
  const userId = privacyOptions.storeUserId ? sanitizeText(input.userId, 128) : null;
  const vehicleProfileId =
    input.allowVehicleProfileAssociation && privacyOptions.storeVehicleProfileAssociation
      ? sanitizeText(input.vehicleProfileId, 128)
      : null;
  return {
    id: `campops_debrief_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    campId: sanitizeText(input.campId, 128),
    campName: sanitizeText(input.campName ?? input.relatedCampCandidate?.name ?? null, 180),
    location,
    userId,
    vehicleProfileId,
    visibility,
    publishingState,
    source: input.source,
    structured: {
      ...DEFAULT_CAMP_OPS_DEBRIEF_STRUCTURED_FIELDS,
      ...input.structured,
      hazards: normalizeHazards(input.structured.hazards),
    },
    notes: sanitizeText(input.notes),
    photos: normalizePhotos(input.photos, visibility, privacyOptions.storePhotoRefs),
    privacy: {
      preciseLocationStored: privacyOptions.storePreciseLocation,
      userIdStored: Boolean(userId),
      vehicleProfileStored: Boolean(vehicleProfileId),
      photoRefsStored: privacyOptions.storePhotoRefs,
      retentionExpiresAtIso: retentionExpiresAt(nowIso, privacyOptions.retentionDays),
      publishingConsent: buildPublishingConsentMetadata(visibility, input.publishingConsent),
    },
    visitedAtIso: normalizeDateIso(input.visitedAtIso, nowIso),
    submittedAtIso: normalizeDateIso(input.submittedAtIso, nowIso),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
}

export function buildCampOpsDebriefSuitabilityPatch(record: CampOpsDebriefRecord): CampOpsDebriefSuitabilityPatch {
  const { structured } = record;
  const trailerSuitability: CampFitStatus | null =
    structured.trailerTurnaroundDifficulty === 'easy'
      ? 'fit'
      : structured.trailerTurnaroundDifficulty === 'tight'
        ? 'limited'
        : structured.trailerTurnaroundDifficulty === 'difficult' || structured.trailerTurnaroundDifficulty === 'not_possible'
          ? 'not_fit'
          : null;
  const lateArrivalRisk: CampImpactLevel =
    structured.lateArrivalSuitability === 'good'
      ? 'neutral'
      : structured.lateArrivalSuitability === 'caution'
        ? 'caution'
        : structured.lateArrivalSuitability === 'not_recommended'
          ? 'critical'
          : 'unknown';
  const legalConfidence: CampOpsConfidence | null =
    structured.observedLegalStatus === 'posted_allowed'
      ? 'high'
      : structured.observedLegalStatus === 'posted_restricted' || structured.observedLegalStatus === 'posted_prohibited'
        ? 'medium'
        : structured.observedLegalStatus === 'no_signage_observed'
          ? 'low'
          : null;

  return {
    candidateId: record.campId,
    campName: record.campName,
    accessDifficulty: structured.wasCampAccessible === 'yes' ? 'easy' : structured.wasCampAccessible === 'no' ? 'technical' : null,
    legalConfidence,
    vehicleFit: structured.wasCampAccessible === 'yes' ? 'fit' : structured.wasCampAccessible === 'no' ? 'not_fit' : null,
    trailerSuitability,
    groupCapacityEstimate: structured.approximateVehicleCapacity,
    terrainFlatness: structured.flatness,
    windExposure: structured.windExposure,
    privacyLikelihood: structured.privacy,
    lateArrivalRisk,
    fireRestrictionObserved: structured.fireRestrictionSignage,
    hazards: structured.hazards,
    recommendationHints: {
      soloVehicle: structured.recommendSoloVehicle,
      family: structured.recommendFamily,
      trailer: structured.recommendTrailer,
      largeGroup: structured.recommendLargeGroup,
    },
  };
}

function trailerSuitabilityFromDebrief(
  value: CampOpsDebriefTrailerTurnaroundLevel,
): CampFitStatus | null {
  if (value === 'easy') return 'fit';
  if (value === 'tight') return 'limited';
  if (value === 'difficult' || value === 'not_possible') return 'not_fit';
  return null;
}

function publicDebriefConfidence(structured: CampOpsDebriefStructuredFields): CampOpsConfidence {
  const unknownCount = [
    structured.wasCampAccessible,
    structured.observedLegalStatus,
    structured.trailerTurnaroundDifficulty,
    structured.fireRestrictionSignage,
  ].filter((value) => value === 'unknown').length;
  if (structured.observedLegalStatus === 'posted_allowed' && structured.wasCampAccessible === 'yes' && unknownCount === 0) {
    return 'high';
  }
  if (unknownCount <= 1 && structured.observedLegalStatus !== 'unknown') return 'medium';
  if (unknownCount <= 2) return 'low';
  return 'unknown';
}

export function buildCampOpsCommunitySafeDebrief(
  record: CampOpsDebriefRecord,
  options: {
    allowApproximateLocation?: boolean;
    rolloutConfig?: Partial<CampOpsRecommendationRolloutConfig> | null;
  } = {},
): CampOpsCommunitySafeDebrief | null {
  if (!isCampOpsDebriefCommunityPublishingFeatureEnabled(options.rolloutConfig ?? {})) return null;
  if (record.visibility !== 'community_anonymized' && record.visibility !== 'public_verified') return null;
  if (record.publishingState !== 'approved_anonymized') return null;
  if (!record.privacy.publishingConsent || record.privacy.publishingConsent.scope !== record.visibility) return null;
  const { structured } = record;
  return {
    campId: record.campId,
    campName: record.campName,
    approximateLocation: options.allowApproximateLocation
      ? redactCampOpsDebriefLocationForCommunity(record.location)
      : null,
    observedAccess: structured.wasCampAccessible,
    observedLegalStatus: structured.observedLegalStatus,
    observedCapacity: structured.approximateVehicleCapacity,
    observedTrailerSuitability: trailerSuitabilityFromDebrief(structured.trailerTurnaroundDifficulty),
    observedFireSignage: structured.fireRestrictionSignage,
    observedHazards: structured.hazards.slice(0, MAX_HAZARDS),
    dateBucket: dateBucketFromIso(record.visitedAtIso),
    confidence: publicDebriefConfidence(structured),
    sourceVisibility: record.visibility,
    publishingState: 'approved_anonymized',
  };
}

export function transitionCampOpsDebriefPublishingState(
  record: CampOpsDebriefRecord,
  nextState: CampOpsDebriefPublishingState,
  nowIso = new Date().toISOString(),
): CampOpsDebriefRecord | null {
  if (!canTransitionCampOpsDebriefPublishingState(record.publishingState, nextState)) return null;
  const nextVisibility =
    nextState === 'shared_with_convoy'
      ? 'shared_with_convoy'
      : nextState === 'community_draft' || nextState === 'pending_review' || nextState === 'approved_anonymized'
        ? record.visibility === 'public_verified'
          ? 'public_verified'
          : 'community_anonymized'
        : record.visibility;
  return {
    ...record,
    visibility: nextVisibility,
    publishingState: nextState,
    updatedAtIso: normalizeDateIso(nowIso, record.updatedAtIso),
  };
}

export class MemoryCampOpsDebriefBackend implements CampOpsDebriefBackend {
  readonly records: CampOpsDebriefRecord[] = [];

  async insertDebrief(record: CampOpsDebriefRecord): Promise<CampOpsDebriefServiceResult<CampOpsDebriefRecord>> {
    this.records.push(record);
    return { ok: true, data: record };
  }
}

function canUseDebriefLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function loadStoredDebriefs(): CampOpsDebriefRecord[] {
  if (!canUseDebriefLocalStorage()) {
    const pruned = pruneExpiredDebriefs(memoryDebriefRecords);
    if (pruned.length !== memoryDebriefRecords.length) memoryDebriefRecords = pruned;
    return pruned;
  }
  try {
    const raw = localStorage.getItem(CAMP_OPS_DEBRIEF_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const pruned = pruneExpiredDebriefs(parsed);
    if (pruned.length !== parsed.length) saveStoredDebriefs(pruned);
    return pruned;
  } catch {
    return [];
  }
}

function saveStoredDebriefs(records: CampOpsDebriefRecord[]): void {
  memoryDebriefRecords = records;
  if (!canUseDebriefLocalStorage()) return;
  try {
    localStorage.setItem(CAMP_OPS_DEBRIEF_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Debrief persistence is best effort when storage is restricted.
  }
}

export class LocalCampOpsDebriefBackend implements CampOpsDebriefBackend {
  async insertDebrief(record: CampOpsDebriefRecord): Promise<CampOpsDebriefServiceResult<CampOpsDebriefRecord>> {
    const records = loadStoredDebriefs();
    records.push(record);
    saveStoredDebriefs(records);
    return { ok: true, data: record };
  }
}

export function getStoredCampOpsDebriefs(): CampOpsDebriefRecord[] {
  return loadStoredDebriefs();
}

export function clearStoredCampOpsDebriefs(): void {
  memoryDebriefRecords = [];
  if (canUseDebriefLocalStorage()) {
    try {
      localStorage.removeItem(CAMP_OPS_DEBRIEF_STORAGE_KEY);
    } catch {
      // Ignore restricted storage.
    }
  }
}

export function deleteStoredCampOpsDebrief(recordId: string): boolean {
  const records = loadStoredDebriefs();
  const remaining = records.filter((record) => record.id !== recordId);
  if (remaining.length === records.length) return false;
  saveStoredDebriefs(remaining);
  return true;
}

export function clearStoredCampOpsDebriefsForTest(): void {
  clearStoredCampOpsDebriefs();
}

export class CampOpsDebriefService {
  constructor(private readonly backend: CampOpsDebriefBackend = new LocalCampOpsDebriefBackend()) {}

  async captureDebrief(input: CampOpsDebriefInput): Promise<CampOpsDebriefServiceResult<CampOpsDebriefRecord>> {
    const validation = validateCampOpsDebriefInput(input);
    if (!validation.ok) {
      return {
        ok: false,
        code: 'validation_error',
        error: 'CampOps debrief input is invalid.',
        details: validation.errors,
      };
    }
    try {
      const result = await this.backend.insertDebrief(createCampOpsDebriefRecord(input));
      if (result.ok) emitCampOpsDebriefCreated(result.data);
      return result;
    } catch (error) {
      return {
        ok: false,
        code: 'backend_error',
        error: error instanceof Error ? error.message : 'CampOps debrief storage failed.',
      };
    }
  }
}

export const campOpsDebriefService = new CampOpsDebriefService();
