import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../supabase';
import {
  CAMP_SITE_ACCESS_DIFFICULTIES,
  CAMP_SITE_FLAG_REASONS,
  CAMP_SITE_REPORT_SOURCE_TYPES,
  CAMP_SITE_TYPES,
  CAMP_SITE_VISIBILITIES,
  type CampSite,
  type CampSiteAccessDifficulty,
  type CampSiteFlag,
  type CampSiteFlagReason,
  type CampSiteJsonObject,
  type CampSitePhoto,
  type CampSiteReport,
  type CampSiteReportModerationStatus,
  type CampSiteReportReviewState,
  type CampSiteStatus,
  type CampSitePhotoModerationStatus,
  type CampSiteReportSourceType,
  type CampSiteReviewEvent,
  type CampSiteReviewEventType,
  type CampSiteType,
  type CampSiteVisibility,
  getInitialCampSiteReportReviewState,
  validateCampSiteReportRecord,
  validateCampSiteRecord,
} from './campsiteRecommendationTypes';
import {
  buildTrustMetadataFromReport,
  calculateCampSiteTrustScore,
  calculateTrustScoreForCampSite,
  hasRecentUserConfirmation,
  writeTrustMetadata,
} from './campsiteTrustScoring';
import {
  campsiteReviewNotificationService,
  notifyWithoutBlocking,
  type CampsiteReviewNotificationService,
} from './campsiteReviewNotificationService';

const CAMP_SITES_TABLE = 'camp_sites';
const CAMP_SITE_REPORTS_TABLE = 'camp_site_reports';
const CAMP_SITE_FLAGS_TABLE = 'camp_site_flags';
const CAMP_SITE_PHOTOS_TABLE = 'camp_site_photos';
const CAMP_SITE_LIFECYCLE_EVENTS_TABLE = 'camp_site_lifecycle_events';
const MAX_NOTES_LENGTH = 2000;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const SERIOUS_FLAG_REASONS = new Set<CampSiteFlagReason>([
  'private_land',
  'closed_to_camping',
  'sensitive_area',
  'unsafe',
]);
const FLAG_REVIEW_THRESHOLD = 3;

export type CampsiteServiceErrorCode =
  | 'auth_required'
  | 'admin_required'
  | 'permission_denied'
  | 'validation_error'
  | 'not_found'
  | 'backend_unavailable'
  | 'backend_error';

export type CampsiteServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: CampsiteServiceErrorCode; error: string; details?: string[] };

export interface AuthenticatedCampsiteUser {
  id: string;
  isAdmin?: boolean;
}

export type CampSiteReportInsert = Omit<
  CampSiteReport,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'dirty'
>;

export type CampSiteInsert = Omit<
  CampSite,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'dirty'
>;

export type CampSiteFlagInsert = Omit<
  CampSiteFlag,
  'id' | 'created_at' | 'deleted_at' | 'dirty'
>;

export type PublicCampSite = Omit<
  CampSite,
  'owner_user_id' | 'authorized_user_ids' | 'dirty' | 'deleted_at'
>;

export type CampSiteReportResponse = Omit<
  CampSiteReport,
  'submitted_by_user_id' | 'dirty' | 'deleted_at'
>;

export type CampSiteFlagResponse = Omit<CampSiteFlag, 'user_id' | 'dirty' | 'deleted_at'>;
export type CampSitePhotoResponse = Omit<CampSitePhoto, 'user_id' | 'dirty' | 'deleted_at'>;

export interface CreateCampSiteReportInput {
  latitude: number;
  longitude: number;
  source_type: CampSiteReportSourceType;
  location_accuracy_m?: number | null;
  user_stayed_here: boolean;
  verified_in_person: boolean;
  visited_at?: string | null;
  site_type: CampSiteType;
  access_difficulty: CampSiteAccessDifficulty;
  vehicle_fit: string[];
  amenities: CampSiteJsonObject;
  conditions: CampSiteJsonObject;
  notes?: string | null;
  visibility_requested: CampSiteVisibility;
  stewardship_acknowledged: boolean;
  sensitive_area_acknowledged: boolean;
  client_submission_id?: string | null;
}

export interface ListApprovedCampSitesParams {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  limit?: number;
  offset?: number;
  site_type?: CampSiteType;
  access_difficulty?: CampSiteAccessDifficulty;
  trailer_friendly?: boolean;
  cell_signal?: string;
}

export type CampSiteReportBounds = Pick<
  ListApprovedCampSitesParams,
  'minLat' | 'minLng' | 'maxLat' | 'maxLng'
>;

export type ListReportsByUserOptions = {
  privateOnly?: boolean;
  visibilityRequested?: CampSiteVisibility;
  moderationStatuses?: CampSiteReportModerationStatus[];
  reviewStates?: CampSiteReportReviewState[];
  bounds?: CampSiteReportBounds;
  limit?: number;
};

export interface FlagCampSiteInput {
  camp_site_id: string;
  reason: CampSiteFlagReason;
  details?: string | null;
}

export interface ConfirmCampSiteInput {
  camp_site_id: string;
  source_type?: Extract<CampSiteReportSourceType, 'manual' | 'current_location'>;
  location_accuracy_m?: number | null;
  visited_at?: string | null;
  notes?: string | null;
  user_stayed_here?: boolean;
}

export interface ApproveCampSiteReportInput {
  reportId: string;
  existingCampSiteId?: string | null;
}

export type PublishedCampSiteReviewAction =
  | 'keep_published'
  | 'hide'
  | 'merge'
  | 'update_details'
  | 'mark_closed'
  | 'mark_sensitive_removed';

export interface ResolvePublishedCampSiteReviewInput {
  campSiteId: string;
  action: PublishedCampSiteReviewAction;
  mergeTargetCampSiteId?: string | null;
  updates?: Partial<
    Pick<
      CampSite,
      | 'canonical_name'
      | 'site_type'
      | 'access_difficulty'
      | 'vehicle_fit'
      | 'trailer_friendly'
      | 'max_rig_length_ft'
      | 'max_group_size'
      | 'amenities'
      | 'conditions'
      | 'legal_confidence'
    >
  >;
  internal_notes?: string | null;
}

export type PublishedCampSiteReviewQueueItem = PublicCampSite & {
  flags: CampSiteFlagResponse[];
  reviewReason: string;
};

export type CampSiteLifecycleEventType =
  | 'serious_flag_review_started'
  | 'flag_threshold_review_started'
  | 'published_review_vote'
  | 'published_review_resolved';

export type CampSiteLifecycleEventInsert = {
  camp_site_id: string;
  actor_user_id: string | null;
  event_type: CampSiteLifecycleEventType;
  metadata: CampSiteJsonObject;
};
export type CampSiteReviewEventInsert = Omit<
  CampSiteReviewEvent,
  'id' | 'created_at' | 'deleted_at' | 'dirty'
>;

export interface AttachCampSitePhotoInput {
  camp_site_report_id: string;
  storage_url: string;
  thumbnail_url?: string | null;
  exif_stripped: boolean;
}

export interface ModerateCampSitePhotoInput {
  photoId: string;
  moderation_status: Extract<CampSitePhotoModerationStatus, 'approved' | 'rejected'>;
}

export interface CampsiteRecommendationBackend {
  isAvailable(): boolean;
  getCurrentUser(): Promise<AuthenticatedCampsiteUser | null>;
  insertReport(row: CampSiteReportInsert): Promise<CampsiteServiceResult<CampSiteReport>>;
  updateReport(
    reportId: string,
    changes: Partial<CampSiteReport>,
  ): Promise<CampsiteServiceResult<CampSiteReport>>;
  getReportById(reportId: string): Promise<CampsiteServiceResult<CampSiteReport>>;
  getReportByClientSubmissionId?(
    clientSubmissionId: string,
    userId: string,
  ): Promise<CampsiteServiceResult<CampSiteReport | null>>;
  listReportsByUser(
    userId: string,
    options?: ListReportsByUserOptions,
  ): Promise<CampsiteServiceResult<CampSiteReport[]>>;
  listApprovedCommunityCampSitesByBounds(
    params: Required<Pick<ListApprovedCampSitesParams, 'minLat' | 'minLng' | 'maxLat' | 'maxLng' | 'limit' | 'offset'>> &
      Pick<
        ListApprovedCampSitesParams,
        'site_type' | 'access_difficulty' | 'trailer_friendly' | 'cell_signal'
      >,
  ): Promise<CampsiteServiceResult<CampSite[]>>;
  getApprovedCommunityCampSiteById(campSiteId: string): Promise<CampsiteServiceResult<CampSite>>;
  getCampSiteById(campSiteId: string): Promise<CampsiteServiceResult<CampSite>>;
  insertCampSite(row: CampSiteInsert): Promise<CampsiteServiceResult<CampSite>>;
  updateCampSite(
    campSiteId: string,
    changes: Partial<CampSite>,
  ): Promise<CampsiteServiceResult<CampSite>>;
  insertFlag(row: CampSiteFlagInsert): Promise<CampsiteServiceResult<CampSiteFlag>>;
  getFlagByUserForCampSite?(
    campSiteId: string,
    userId: string,
  ): Promise<CampsiteServiceResult<CampSiteFlag | null>>;
  countFlags(campSiteId: string): Promise<CampsiteServiceResult<number>>;
  listFlagsForCampSite?(campSiteId: string): Promise<CampsiteServiceResult<CampSiteFlag[]>>;
  listFlaggedCampSites?(limit: number): Promise<CampsiteServiceResult<CampSite[]>>;
  insertCampSiteLifecycleEvent?(
    row: CampSiteLifecycleEventInsert,
  ): Promise<CampsiteServiceResult<CampSiteLifecycleEventInsert & { id: string; created_at: string }>>;
  insertReviewEvent?(row: CampSiteReviewEventInsert): Promise<CampsiteServiceResult<CampSiteReviewEvent>>;
  countApprovedPhotosForReport?(reportId: string): Promise<CampsiteServiceResult<number>>;
  insertPhoto?(
    row: Omit<CampSitePhoto, 'id' | 'created_at' | 'deleted_at' | 'dirty'>,
  ): Promise<CampsiteServiceResult<CampSitePhoto>>;
  listPhotosForReport?(reportId: string): Promise<CampsiteServiceResult<CampSitePhoto[]>>;
  listApprovedPhotosForCampSite?(campSiteId: string): Promise<CampsiteServiceResult<CampSitePhoto[]>>;
  getPhotoById?(photoId: string): Promise<CampsiteServiceResult<CampSitePhoto>>;
  updatePhoto?(
    photoId: string,
    changes: Partial<Pick<CampSitePhoto, 'camp_site_id' | 'moderation_status'>>,
  ): Promise<CampsiteServiceResult<CampSitePhoto>>;
  updatePhotosForReport?(
    reportId: string,
    changes: Partial<Pick<CampSitePhoto, 'camp_site_id' | 'moderation_status'>>,
  ): Promise<CampsiteServiceResult<CampSitePhoto[]>>;
  listPendingReports(limit: number): Promise<CampsiteServiceResult<CampSiteReport[]>>;
}

export function sanitizeCampSiteNotes(notes: string | null | undefined): string | null {
  if (typeof notes !== 'string') return null;
  const sanitized = notes
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!sanitized) return null;
  return sanitized.slice(0, MAX_NOTES_LENGTH);
}

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number]);
}

function isFiniteLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isFiniteLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

function normalizeJsonObject(value: unknown): CampSiteJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as CampSiteJsonObject) };
}

function normalizeVehicleFit(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20),
    ),
  );
}

function limitForQuery(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIST_LIMIT;
  return Math.max(1, Math.min(MAX_LIST_LIMIT, Math.floor(Number(limit))));
}

function toServiceError(
  code: CampsiteServiceErrorCode,
  error: string,
  details?: string[],
): CampsiteServiceResult<never> {
  return { ok: false, code, error, details };
}

function mapBackendError(error: unknown, fallback = 'Campsite backend request failed.') {
  const maybeError = error as { message?: string } | null;
  return toServiceError('backend_error', maybeError?.message ?? fallback);
}

function omitReportPii(report: CampSiteReport): CampSiteReportResponse {
  const { submitted_by_user_id: _submittedByUserId, dirty: _dirty, deleted_at: _deletedAt, ...safe } = report;
  return safe;
}

function omitCampSitePrivateFields(campSite: CampSite): PublicCampSite {
  const {
    owner_user_id: _ownerUserId,
    authorized_user_ids: _authorizedUserIds,
    dirty: _dirty,
    deleted_at: _deletedAt,
    ...safe
  } = campSite;
  return safe;
}

function omitFlagPii(flag: CampSiteFlag): CampSiteFlagResponse {
  const { user_id: _userId, dirty: _dirty, deleted_at: _deletedAt, ...safe } = flag;
  return safe;
}

function omitPhotoPii(photo: CampSitePhoto): CampSitePhotoResponse {
  const { user_id: _userId, dirty: _dirty, deleted_at: _deletedAt, ...safe } = photo;
  return safe;
}

function photoStatusForReport(report: CampSiteReport): CampSitePhotoModerationStatus {
  if (report.visibility_requested === 'private' || report.moderation_status === 'private_saved') {
    return 'private';
  }
  if (report.visibility_requested === 'group') return 'group_visible';
  return 'pending';
}

function reportStatusForVisibility(
  visibility: CampSiteVisibility,
): CampSiteReportModerationStatus {
  return visibility === 'community' ? 'pending' : 'private_saved';
}

function validateCreateReportInput(input: CreateCampSiteReportInput): string[] {
  const errors: string[] = [];
  if (!isFiniteLatitude(input.latitude)) errors.push('latitude must be between -90 and 90');
  if (!isFiniteLongitude(input.longitude)) errors.push('longitude must be between -180 and 180');
  if (!isOneOf(CAMP_SITE_REPORT_SOURCE_TYPES, input.source_type)) {
    errors.push('source_type is invalid');
  }
  if (!isOneOf(CAMP_SITE_TYPES, input.site_type)) errors.push('site_type is invalid');
  if (!isOneOf(CAMP_SITE_ACCESS_DIFFICULTIES, input.access_difficulty)) {
    errors.push('access_difficulty is invalid');
  }
  if (!Array.isArray(input.vehicle_fit)) errors.push('vehicle_fit must be an array');
  if (!isOneOf(CAMP_SITE_VISIBILITIES, input.visibility_requested)) {
    errors.push('visibility_requested is invalid');
  }
  if (input.visibility_requested === 'community') {
    if (!input.stewardship_acknowledged) {
      errors.push('community submissions require stewardship acknowledgement');
    }
    if (!input.sensitive_area_acknowledged) {
      errors.push('community submissions require sensitive area acknowledgement');
    }
  }
  if (
    input.client_submission_id != null &&
    (typeof input.client_submission_id !== 'string' ||
      input.client_submission_id.trim().length === 0 ||
      input.client_submission_id.length > 128)
  ) {
    errors.push('client_submission_id is invalid');
  }
  return errors;
}

function validateBounds(params: ListApprovedCampSitesParams): string[] {
  const errors: string[] = [];
  if (!isFiniteLatitude(params.minLat)) errors.push('minLat must be between -90 and 90');
  if (!isFiniteLatitude(params.maxLat)) errors.push('maxLat must be between -90 and 90');
  if (!isFiniteLongitude(params.minLng)) errors.push('minLng must be between -180 and 180');
  if (!isFiniteLongitude(params.maxLng)) errors.push('maxLng must be between -180 and 180');
  if (Number(params.minLat) > Number(params.maxLat)) errors.push('minLat must be <= maxLat');
  if (Number(params.minLng) > Number(params.maxLng)) errors.push('minLng must be <= maxLng');
  if (params.site_type && !isOneOf(CAMP_SITE_TYPES, params.site_type)) {
    errors.push('site_type filter is invalid');
  }
  if (
    params.access_difficulty &&
    !isOneOf(CAMP_SITE_ACCESS_DIFFICULTIES, params.access_difficulty)
  ) {
    errors.push('access_difficulty filter is invalid');
  }
  return errors;
}

function buildReportInsert(
  input: CreateCampSiteReportInput,
  userId: string,
): CampSiteReportInsert {
  return {
    camp_site_id: null,
    submitted_by_user_id: userId,
    latitude: input.latitude,
    longitude: input.longitude,
    source_type: input.source_type,
    location_accuracy_m: input.location_accuracy_m ?? null,
    user_stayed_here: input.user_stayed_here,
    verified_in_person: input.verified_in_person,
    visited_at: input.visited_at ?? null,
    site_type: input.site_type,
    access_difficulty: input.access_difficulty,
    vehicle_fit: normalizeVehicleFit(input.vehicle_fit),
    amenities: normalizeJsonObject(input.amenities),
    conditions: normalizeJsonObject(input.conditions),
    notes: sanitizeCampSiteNotes(input.notes),
    visibility_requested: input.visibility_requested,
    moderation_status: reportStatusForVisibility(input.visibility_requested),
    review_state: getInitialCampSiteReportReviewState(input.visibility_requested),
    stewardship_acknowledged: input.stewardship_acknowledged,
    sensitive_area_acknowledged: input.sensitive_area_acknowledged,
    client_submission_id: input.client_submission_id?.trim() || null,
  };
}

function buildCampSiteFromReport(report: CampSiteReport, approvedPhotoCount = 0): CampSiteInsert {
  const confirmed = report.verified_in_person || report.user_stayed_here;
  const lastConfirmedAt = confirmed ? report.visited_at ?? report.created_at : null;
  const confirmationCount = confirmed ? 1 : 0;
  const conditions = writeTrustMetadata(
    normalizeJsonObject(report.conditions),
    buildTrustMetadataFromReport(report, approvedPhotoCount),
  );

  return {
    canonical_name: null,
    latitude: report.latitude,
    longitude: report.longitude,
    status: 'approved',
    visibility: 'community',
    site_type: report.site_type,
    access_difficulty: report.access_difficulty,
    vehicle_fit: normalizeVehicleFit(report.vehicle_fit),
    trailer_friendly: null,
    max_rig_length_ft: null,
    max_group_size: null,
    amenities: normalizeJsonObject(report.amenities),
    conditions,
    trust_score: calculateCampSiteTrustScore({
      originalVerifiedInPerson: report.verified_in_person,
      originalUserStayedHere: report.user_stayed_here,
      originalLocationAccuracyM: report.location_accuracy_m,
      approvedPhotoCount,
      uniqueConfirmationCount: confirmationCount,
      unresolvedFlagCount: 0,
      lastConfirmedAt,
    }),
    legal_confidence: 'unknown',
    last_confirmed_at: lastConfirmedAt,
    confirmation_count: confirmationCount,
    flag_count: 0,
    owner_user_id: report.submitted_by_user_id,
    authorized_user_ids: [],
  };
}

function mergeCampSiteAggregate(
  campSite: CampSite,
  report: CampSiteReport,
): Partial<CampSite> {
  const confirmed = report.verified_in_person || report.user_stayed_here;
  const confirmation_count = campSite.confirmation_count + (confirmed ? 1 : 0);
  const last_confirmed_at = confirmed ? report.visited_at ?? report.created_at : campSite.last_confirmed_at;
  const nextSite = {
    ...campSite,
    confirmation_count,
    last_confirmed_at,
    flag_count: campSite.flag_count,
  };
  return {
    site_type: report.site_type === 'unknown' ? campSite.site_type : report.site_type,
    access_difficulty: report.access_difficulty,
    vehicle_fit: Array.from(new Set([...campSite.vehicle_fit, ...report.vehicle_fit])),
    amenities: { ...campSite.amenities, ...report.amenities },
    conditions: { ...campSite.conditions, ...report.conditions },
    trust_score: calculateTrustScoreForCampSite(nextSite),
    last_confirmed_at,
    confirmation_count,
  };
}

function shouldTriggerPublishedCampSiteReview(reason: CampSiteFlagReason, flagCount: number): boolean {
  return SERIOUS_FLAG_REASONS.has(reason) || flagCount >= FLAG_REVIEW_THRESHOLD;
}

function flagReviewReason(reason: CampSiteFlagReason, flagCount: number): string {
  if (SERIOUS_FLAG_REASONS.has(reason)) {
    return `Serious campsite flag requires moderator review: ${reason.replace(/_/g, ' ')}.`;
  }
  return `Campsite reached ${flagCount} unresolved flags.`;
}

function statusForPublishedReviewAction(action: PublishedCampSiteReviewAction): CampSiteStatus {
  switch (action) {
    case 'keep_published':
    case 'update_details':
      return 'approved';
    case 'mark_closed':
      return 'closed';
    case 'mark_sensitive_removed':
      return 'sensitive_removed';
    case 'merge':
    case 'hide':
    default:
      return 'hidden';
  }
}

async function writeReviewEvent(
  backend: CampsiteRecommendationBackend,
  report: CampSiteReport,
  eventType: CampSiteReviewEventType,
  actorUserId: string | null,
  metadata: CampSiteJsonObject = {},
): Promise<void> {
  await backend.insertReviewEvent?.({
    camp_site_report_id: report.id,
    actor_user_id: actorUserId,
    event_type: eventType,
    metadata,
  });
}

async function requireAuthenticatedUser(
  backend: CampsiteRecommendationBackend,
): Promise<CampsiteServiceResult<AuthenticatedCampsiteUser>> {
  if (!backend.isAvailable()) {
    return toServiceError('backend_unavailable', 'Campsite backend is not configured.');
  }

  const user = await backend.getCurrentUser();
  if (!user?.id) {
    return toServiceError('auth_required', 'Authentication is required.');
  }
  return { ok: true, data: user };
}

async function requireAdminUser(
  backend: CampsiteRecommendationBackend,
): Promise<CampsiteServiceResult<AuthenticatedCampsiteUser>> {
  const userResult = await requireAuthenticatedUser(backend);
  if (!userResult.ok) return userResult;
  if (!userResult.data.isAdmin) {
    return toServiceError('admin_required', 'Admin access is required.');
  }
  return userResult;
}

export class CampsiteRecommendationService {
  constructor(
    private readonly backend: CampsiteRecommendationBackend,
    private readonly notifications: CampsiteReviewNotificationService | null = null,
  ) {}

  async createCampsiteReport(
    input: CreateCampSiteReportInput,
  ): Promise<CampsiteServiceResult<CampSiteReportResponse>> {
    const userResult = await requireAuthenticatedUser(this.backend);
    if (!userResult.ok) return userResult;

    const inputErrors = validateCreateReportInput(input);
    if (inputErrors.length > 0) {
      return toServiceError('validation_error', 'Invalid campsite report input.', inputErrors);
    }

    const row = buildReportInsert(input, userResult.data.id);
    const validation = validateCampSiteReportRecord({
      ...row,
      id: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (!validation.ok) {
      return toServiceError('validation_error', 'Invalid campsite report.', validation.errors);
    }

    if (row.client_submission_id && this.backend.getReportByClientSubmissionId) {
      const existing = await this.backend.getReportByClientSubmissionId(
        row.client_submission_id,
        userResult.data.id,
      );
      if (existing.ok && existing.data) {
        return { ok: true, data: omitReportPii(existing.data) };
      }
      if (!existing.ok) return existing;
    }

    const result = await this.backend.insertReport(row);
    if (!result.ok) {
      if (row.client_submission_id && this.backend.getReportByClientSubmissionId) {
        const existing = await this.backend.getReportByClientSubmissionId(
          row.client_submission_id,
          userResult.data.id,
        );
        if (existing.ok && existing.data) {
          return { ok: true, data: omitReportPii(existing.data) };
        }
      }
      return result;
    }
    if (result.data.visibility_requested === 'community') {
      notifyWithoutBlocking(this.notifications?.notifyCommunitySubmissionReceived(result.data));
    }
    return { ok: true, data: omitReportPii(result.data) };
  }

  async listApprovedCommunityCampsitesByBounds(
    params: ListApprovedCampSitesParams,
  ): Promise<CampsiteServiceResult<PublicCampSite[]>> {
    const validation = validateBounds(params);
    if (validation.length > 0) {
      return toServiceError('validation_error', 'Invalid campsite bounds.', validation);
    }

    if (!this.backend.isAvailable()) {
      return toServiceError('backend_unavailable', 'Campsite backend is not configured.');
    }

    const result = await this.backend.listApprovedCommunityCampSitesByBounds({
      minLat: params.minLat,
      minLng: params.minLng,
      maxLat: params.maxLat,
      maxLng: params.maxLng,
      limit: limitForQuery(params.limit),
      offset: Math.max(0, Math.floor(params.offset ?? 0)),
      site_type: params.site_type,
      access_difficulty: params.access_difficulty,
      trailer_friendly: params.trailer_friendly,
      cell_signal: params.cell_signal,
    });
    if (!result.ok) return result;
    return { ok: true, data: result.data.map(omitCampSitePrivateFields) };
  }

  async getCampsiteDetails(campSiteId: string): Promise<CampsiteServiceResult<PublicCampSite>> {
    if (!campSiteId) return toServiceError('validation_error', 'campSiteId is required.');
    if (!this.backend.isAvailable()) {
      return toServiceError('backend_unavailable', 'Campsite backend is not configured.');
    }

    const result = await this.backend.getApprovedCommunityCampSiteById(campSiteId);
    if (!result.ok) return result;
    return { ok: true, data: omitCampSitePrivateFields(result.data) };
  }

  async listCurrentUserPrivateReports(): Promise<CampsiteServiceResult<CampSiteReportResponse[]>> {
    const userResult = await requireAuthenticatedUser(this.backend);
    if (!userResult.ok) return userResult;

    const result = await this.backend.listReportsByUser(userResult.data.id, { privateOnly: true });
    if (!result.ok) return result;
    return { ok: true, data: result.data.map(omitReportPii) };
  }

  async listCurrentUserPrivateReportsByBounds(
    bounds: CampSiteReportBounds,
  ): Promise<CampsiteServiceResult<CampSiteReportResponse[]>> {
    const validation = validateBounds({ ...bounds });
    if (validation.length > 0) {
      return toServiceError('validation_error', 'Invalid campsite bounds.', validation);
    }
    const userResult = await requireAuthenticatedUser(this.backend);
    if (!userResult.ok) return userResult;

    const result = await this.backend.listReportsByUser(userResult.data.id, {
      privateOnly: true,
      bounds,
      limit: MAX_LIST_LIMIT,
    });
    if (!result.ok) return result;
    return { ok: true, data: result.data.map(omitReportPii) };
  }

  async listCurrentUserPendingCommunityReportsByBounds(
    bounds: CampSiteReportBounds,
  ): Promise<CampsiteServiceResult<CampSiteReportResponse[]>> {
    const validation = validateBounds({ ...bounds });
    if (validation.length > 0) {
      return toServiceError('validation_error', 'Invalid campsite bounds.', validation);
    }
    const userResult = await requireAuthenticatedUser(this.backend);
    if (!userResult.ok) return userResult;

    const result = await this.backend.listReportsByUser(userResult.data.id, {
      visibilityRequested: 'community',
      reviewStates: ['submitted', 'community_review', 'moderator_review', 'needs_submitter_info'],
      bounds,
      limit: MAX_LIST_LIMIT,
    });
    if (!result.ok) return result;
    return { ok: true, data: result.data.map(omitReportPii) };
  }

  async attachPhotoToReport(
    input: AttachCampSitePhotoInput,
  ): Promise<CampsiteServiceResult<CampSitePhotoResponse>> {
    const userResult = await requireAuthenticatedUser(this.backend);
    if (!userResult.ok) return userResult;
    if (!this.backend.insertPhoto) {
      return toServiceError('backend_unavailable', 'Campsite photo upload is not configured.');
    }

    if (!input.camp_site_report_id) {
      return toServiceError('validation_error', 'camp_site_report_id is required.');
    }
    if (!input.storage_url || typeof input.storage_url !== 'string') {
      return toServiceError('validation_error', 'storage_url is required.');
    }
    if (!input.exif_stripped) {
      return toServiceError('validation_error', 'Photo metadata must be stripped before upload.');
    }

    const report = await this.backend.getReportById(input.camp_site_report_id);
    if (!report.ok) return report;
    if (report.data.submitted_by_user_id !== userResult.data.id && !userResult.data.isAdmin) {
      return toServiceError('auth_required', 'Only the submitting user can attach photos.');
    }

    const moderationStatus = photoStatusForReport(report.data);
    const result = await this.backend.insertPhoto({
      camp_site_report_id: report.data.id,
      camp_site_id: report.data.camp_site_id,
      user_id: userResult.data.id,
      storage_url: input.storage_url,
      thumbnail_url: input.thumbnail_url ?? null,
      exif_stripped: true,
      moderation_status: moderationStatus,
    });
    if (!result.ok) return result;
    return { ok: true, data: omitPhotoPii(result.data) };
  }

  async listPhotosForReport(reportId: string): Promise<CampsiteServiceResult<CampSitePhotoResponse[]>> {
    const userResult = await requireAuthenticatedUser(this.backend);
    if (!userResult.ok) return userResult;
    if (!this.backend.listPhotosForReport) {
      return { ok: true, data: [] };
    }

    const report = await this.backend.getReportById(reportId);
    if (!report.ok) return report;
    if (report.data.submitted_by_user_id !== userResult.data.id && !userResult.data.isAdmin) {
      return toServiceError('auth_required', 'Only the owner or an admin can view report photos.');
    }

    const result = await this.backend.listPhotosForReport(reportId);
    if (!result.ok) return result;
    return { ok: true, data: result.data.map(omitPhotoPii) };
  }

  async listApprovedPhotosForCampSite(
    campSiteId: string,
  ): Promise<CampsiteServiceResult<CampSitePhotoResponse[]>> {
    if (!campSiteId) return toServiceError('validation_error', 'campSiteId is required.');
    if (!this.backend.listApprovedPhotosForCampSite) {
      return { ok: true, data: [] };
    }
    const site = await this.backend.getApprovedCommunityCampSiteById(campSiteId);
    if (!site.ok) return site;
    const result = await this.backend.listApprovedPhotosForCampSite(campSiteId);
    if (!result.ok) return result;
    return { ok: true, data: result.data.map(omitPhotoPii) };
  }

  async moderatePhoto(
    input: ModerateCampSitePhotoInput,
  ): Promise<CampsiteServiceResult<CampSitePhotoResponse>> {
    const adminResult = await requireAdminUser(this.backend);
    if (!adminResult.ok) return adminResult;
    if (!this.backend.getPhotoById || !this.backend.updatePhoto) {
      return toServiceError('backend_unavailable', 'Campsite photo moderation is not configured.');
    }
    if (!input.photoId) return toServiceError('validation_error', 'photoId is required.');
    if (input.moderation_status !== 'approved' && input.moderation_status !== 'rejected') {
      return toServiceError('validation_error', 'Photo moderation status must be approved or rejected.');
    }

    const photo = await this.backend.getPhotoById(input.photoId);
    if (!photo.ok) return photo;
    if (input.moderation_status === 'approved' && !photo.data.exif_stripped) {
      return toServiceError('validation_error', 'Photo metadata must be stripped before public approval.');
    }

    const report = await this.backend.getReportById(photo.data.camp_site_report_id);
    if (!report.ok) return report;
    const result = await this.backend.updatePhoto(photo.data.id, {
      camp_site_id: report.data.camp_site_id,
      moderation_status: input.moderation_status,
    });
    if (!result.ok) return result;
    return { ok: true, data: omitPhotoPii(result.data) };
  }

  async flagCampsite(
    input: FlagCampSiteInput,
  ): Promise<CampsiteServiceResult<{ flag: CampSiteFlagResponse; flag_count: number }>> {
    const userResult = await requireAuthenticatedUser(this.backend);
    if (!userResult.ok) return userResult;

    if (!input.camp_site_id) return toServiceError('validation_error', 'camp_site_id is required.');
    if (!isOneOf(CAMP_SITE_FLAG_REASONS, input.reason)) {
      return toServiceError('validation_error', 'Flag reason is invalid.');
    }

    const campSite = await this.backend.getCampSiteById(input.camp_site_id);
    if (!campSite.ok) return campSite;
    if (campSite.data.status !== 'approved' || campSite.data.visibility !== 'community') {
      return toServiceError('validation_error', 'Only approved community campsites can be flagged.');
    }
    const existingFlag = await this.backend.getFlagByUserForCampSite?.(
      input.camp_site_id,
      userResult.data.id,
    );
    if (existingFlag?.ok && existingFlag.data) {
      const countResult = await this.backend.countFlags(input.camp_site_id);
      if (!countResult.ok) return countResult;
      return {
        ok: true,
        data: {
          flag: omitFlagPii(existingFlag.data),
          flag_count: countResult.data,
        },
      };
    }
    if (existingFlag && !existingFlag.ok) return existingFlag;

    const flagResult = await this.backend.insertFlag({
      camp_site_id: input.camp_site_id,
      user_id: userResult.data.id,
      reason: input.reason,
      details: sanitizeCampSiteNotes(input.details),
    });
    if (!flagResult.ok) return flagResult;

    const countResult = await this.backend.countFlags(input.camp_site_id);
    if (!countResult.ok) return countResult;

    const updatedSite = await this.backend.updateCampSite(input.camp_site_id, {
      flag_count: countResult.data,
      trust_score: calculateTrustScoreForCampSite({
        ...campSite.data,
        flag_count: countResult.data,
      }),
    });
    if (!updatedSite.ok) return updatedSite;
    let siteAfterFlag = updatedSite.data;
    if (shouldTriggerPublishedCampSiteReview(input.reason, countResult.data)) {
      const reason = flagReviewReason(input.reason, countResult.data);
      const reviewStatus =
        updatedSite.data.status === 'approved' ? 'hidden_pending_review' : updatedSite.data.status;
      const reviewSite =
        reviewStatus !== updatedSite.data.status
          ? await this.backend.updateCampSite(input.camp_site_id, { status: reviewStatus })
          : updatedSite;
      if (!reviewSite.ok) return reviewSite;
      siteAfterFlag = reviewSite.data;
      await this.backend.insertCampSiteLifecycleEvent?.({
        camp_site_id: input.camp_site_id,
        actor_user_id: userResult.data.id,
        event_type: SERIOUS_FLAG_REASONS.has(input.reason)
          ? 'serious_flag_review_started'
          : 'flag_threshold_review_started',
        metadata: {
          reason: input.reason,
          flag_count: countResult.data,
          previous_status: campSite.data.status,
          next_status: siteAfterFlag.status,
        },
      });
      notifyWithoutBlocking(
        this.notifications?.notifyPublishedCampsiteReviewRequired(siteAfterFlag, reason),
      );
    } else {
      notifyWithoutBlocking(this.notifications?.notifyHighFlagCount(siteAfterFlag));
    }

    return {
      ok: true,
      data: {
        flag: omitFlagPii(flagResult.data),
        flag_count: siteAfterFlag.flag_count,
      },
    };
  }

  async confirmCampsite(
    input: ConfirmCampSiteInput,
  ): Promise<CampsiteServiceResult<{ report: CampSiteReportResponse; camp_site: PublicCampSite }>> {
    const userResult = await requireAuthenticatedUser(this.backend);
    if (!userResult.ok) return userResult;

    const sourceType = input.source_type ?? 'manual';
    if (sourceType !== 'manual' && sourceType !== 'current_location') {
      return toServiceError(
        'validation_error',
        'Confirm campsite source_type must be manual or current_location.',
      );
    }

    const siteResult = await this.backend.getApprovedCommunityCampSiteById(input.camp_site_id);
    if (!siteResult.ok) return siteResult;
    const campSite = siteResult.data;

    const userReports = await this.backend.listReportsByUser(userResult.data.id);
    if (userReports.ok) {
      const recentConfirmation = userReports.data
        .filter(
          (report) =>
            report.camp_site_id === campSite.id &&
            report.moderation_status === 'approved' &&
            report.verified_in_person,
        )
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
      if (
        recentConfirmation &&
        hasRecentUserConfirmation(userReports.data, campSite.id)
      ) {
        return {
          ok: true,
          data: {
            report: omitReportPii(recentConfirmation),
            camp_site: omitCampSitePrivateFields(campSite),
          },
        };
      }
    }

    const reportResult = await this.backend.insertReport({
      camp_site_id: campSite.id,
      submitted_by_user_id: userResult.data.id,
      latitude: campSite.latitude,
      longitude: campSite.longitude,
      source_type: sourceType,
      location_accuracy_m: input.location_accuracy_m ?? null,
      user_stayed_here: input.user_stayed_here ?? true,
      verified_in_person: true,
      visited_at: input.visited_at ?? new Date().toISOString(),
      site_type: campSite.site_type,
      access_difficulty: campSite.access_difficulty,
      vehicle_fit: campSite.vehicle_fit,
      amenities: campSite.amenities,
      conditions: campSite.conditions,
      notes: sanitizeCampSiteNotes(input.notes),
      visibility_requested: 'community',
      moderation_status: 'approved',
      stewardship_acknowledged: true,
      sensitive_area_acknowledged: true,
    });
    if (!reportResult.ok) return reportResult;

    const updatedSite = await this.backend.updateCampSite(campSite.id, {
      last_confirmed_at: reportResult.data.visited_at ?? reportResult.data.created_at,
      confirmation_count: campSite.confirmation_count + 1,
      trust_score: calculateTrustScoreForCampSite({
        ...campSite,
        last_confirmed_at: reportResult.data.visited_at ?? reportResult.data.created_at,
        confirmation_count: campSite.confirmation_count + 1,
      }),
    });
    if (!updatedSite.ok) return updatedSite;

    return {
      ok: true,
      data: {
        report: omitReportPii(reportResult.data),
        camp_site: omitCampSitePrivateFields(updatedSite.data),
      },
    };
  }

  async listPendingReports(limit = DEFAULT_LIST_LIMIT): Promise<CampsiteServiceResult<CampSiteReportResponse[]>> {
    const adminResult = await requireAdminUser(this.backend);
    if (!adminResult.ok) return adminResult;

    const result = await this.backend.listPendingReports(limitForQuery(limit));
    if (!result.ok) return result;
    return { ok: true, data: result.data.map(omitReportPii) };
  }

  async listFlaggedCampsiteReviewQueue(
    limit = DEFAULT_LIST_LIMIT,
  ): Promise<CampsiteServiceResult<PublishedCampSiteReviewQueueItem[]>> {
    const adminResult = await requireAdminUser(this.backend);
    if (!adminResult.ok) return adminResult;
    if (!this.backend.listFlaggedCampSites || !this.backend.listFlagsForCampSite) {
      return toServiceError('backend_unavailable', 'Published campsite re-review backend is not configured.');
    }

    const result = await this.backend.listFlaggedCampSites(limitForQuery(limit));
    if (!result.ok) return result;
    const items: PublishedCampSiteReviewQueueItem[] = [];
    for (const site of result.data) {
      const flags = await this.backend.listFlagsForCampSite(site.id);
      if (!flags.ok) return flags;
      items.push({
        ...omitCampSitePrivateFields(site),
        flags: flags.data.map(omitFlagPii),
        reviewReason:
          site.status === 'hidden_pending_review'
            ? 'Under review due to serious or repeated community flags.'
            : 'Published campsite has unresolved flags.',
      });
    }
    return { ok: true, data: items };
  }

  async resolveFlaggedCampsiteReview(
    input: ResolvePublishedCampSiteReviewInput,
  ): Promise<CampsiteServiceResult<PublicCampSite>> {
    const adminResult = await requireAdminUser(this.backend);
    if (!adminResult.ok) return adminResult;
    if (!input.campSiteId) return toServiceError('validation_error', 'campSiteId is required.');

    const siteResult = await this.backend.getCampSiteById(input.campSiteId);
    if (!siteResult.ok) return siteResult;
    const site = siteResult.data;
    const status = statusForPublishedReviewAction(input.action);
    const changes: Partial<CampSite> = {
      ...(input.updates ?? {}),
      status,
    };

    if (input.action === 'merge') {
      if (!input.mergeTargetCampSiteId) {
        return toServiceError('validation_error', 'mergeTargetCampSiteId is required for merge actions.');
      }
      const target = await this.backend.getCampSiteById(input.mergeTargetCampSiteId);
      if (!target.ok) return target;
      await this.backend.updateCampSite(target.data.id, {
        vehicle_fit: Array.from(new Set([...target.data.vehicle_fit, ...site.vehicle_fit])),
        confirmation_count: target.data.confirmation_count + site.confirmation_count,
        flag_count: target.data.flag_count + site.flag_count,
        last_confirmed_at: target.data.last_confirmed_at ?? site.last_confirmed_at,
        trust_score: calculateTrustScoreForCampSite({
          ...target.data,
          confirmation_count: target.data.confirmation_count + site.confirmation_count,
          flag_count: target.data.flag_count + site.flag_count,
          last_confirmed_at: target.data.last_confirmed_at ?? site.last_confirmed_at,
        }),
      });
    }

    const updated = await this.backend.updateCampSite(input.campSiteId, changes);
    if (!updated.ok) return updated;
    await this.backend.insertCampSiteLifecycleEvent?.({
      camp_site_id: input.campSiteId,
      actor_user_id: adminResult.data.id,
      event_type: 'published_review_resolved',
      metadata: {
        action: input.action,
        merge_target_camp_site_id: input.mergeTargetCampSiteId ?? null,
        internal_notes: sanitizeCampSiteNotes(input.internal_notes),
        previous_status: site.status,
        next_status: updated.data.status,
      },
    });
    return { ok: true, data: omitCampSitePrivateFields(updated.data) };
  }

  async approveReport(
    input: ApproveCampSiteReportInput,
  ): Promise<CampsiteServiceResult<{ report: CampSiteReportResponse; camp_site: PublicCampSite }>> {
    const adminResult = await requireAdminUser(this.backend);
    if (!adminResult.ok) return adminResult;

    const reportResult = await this.backend.getReportById(input.reportId);
    if (!reportResult.ok) return reportResult;
    const report = reportResult.data;

    if (input.existingCampSiteId) {
      const existingSite = await this.backend.getCampSiteById(input.existingCampSiteId);
      if (!existingSite.ok) return existingSite;
      const updatedSite = await this.backend.updateCampSite(existingSite.data.id, {
        ...mergeCampSiteAggregate(existingSite.data, report),
      });
      if (!updatedSite.ok) return updatedSite;
      const updatedReport = await this.backend.updateReport(report.id, {
        camp_site_id: existingSite.data.id,
        moderation_status: 'merged',
        review_state: 'merged',
      });
      if (!updatedReport.ok) return updatedReport;
      await writeReviewEvent(this.backend, updatedReport.data, 'merged', adminResult.data.id, {
        camp_site_id: existingSite.data.id,
      });
      await this.backend.updatePhotosForReport?.(report.id, {
        camp_site_id: existingSite.data.id,
      });
      const approvedPhotoCountResult = await this.backend.countApprovedPhotosForReport?.(report.id);
      if (approvedPhotoCountResult?.ok) {
        const updatedConditions = writeTrustMetadata(
          updatedSite.data.conditions,
          buildTrustMetadataFromReport(report, approvedPhotoCountResult.data),
        );
        const refreshedSite = await this.backend.updateCampSite(updatedSite.data.id, {
          conditions: updatedConditions,
          trust_score: calculateCampSiteTrustScore({
            originalVerifiedInPerson: report.verified_in_person,
            originalUserStayedHere: report.user_stayed_here,
            originalLocationAccuracyM: report.location_accuracy_m,
            uniqueConfirmationCount: updatedSite.data.confirmation_count,
            unresolvedFlagCount: updatedSite.data.flag_count,
            approvedPhotoCount: approvedPhotoCountResult.data,
            lastConfirmedAt: updatedSite.data.last_confirmed_at,
          }),
        });
        if (refreshedSite.ok) {
          notifyWithoutBlocking(
            this.notifications?.notifyMerged(updatedReport.data, refreshedSite.data.id),
          );
          return {
            ok: true,
            data: {
              report: omitReportPii(updatedReport.data),
              camp_site: omitCampSitePrivateFields(refreshedSite.data),
            },
          };
        }
      }
      notifyWithoutBlocking(this.notifications?.notifyMerged(updatedReport.data, updatedSite.data.id));
      return {
        ok: true,
        data: {
          report: omitReportPii(updatedReport.data),
          camp_site: omitCampSitePrivateFields(updatedSite.data),
        },
      };
    }

    const approvedPhotoCountResult = await this.backend.countApprovedPhotosForReport?.(report.id);
    const insert = buildCampSiteFromReport(
      report,
      approvedPhotoCountResult?.ok ? approvedPhotoCountResult.data : 0,
    );
    const siteValidation = validateCampSiteRecord({
      ...insert,
      id: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (!siteValidation.ok) {
      return toServiceError('validation_error', 'Reviewed campsite record is invalid.', siteValidation.errors);
    }

    const createdSite = await this.backend.insertCampSite(insert);
    if (!createdSite.ok) return createdSite;
    const updatedReport = await this.backend.updateReport(report.id, {
      camp_site_id: createdSite.data.id,
      moderation_status: 'approved',
      review_state: 'approved',
    });
    if (!updatedReport.ok) return updatedReport;
    await writeReviewEvent(this.backend, updatedReport.data, 'moderator_approved', adminResult.data.id, {
      camp_site_id: createdSite.data.id,
    });
    await this.backend.updatePhotosForReport?.(report.id, {
      camp_site_id: createdSite.data.id,
    });
    const refreshedPhotoCount = await this.backend.countApprovedPhotosForReport?.(report.id);
    const finalSite =
      refreshedPhotoCount?.ok && refreshedPhotoCount.data > 0
        ? await this.backend.updateCampSite(createdSite.data.id, {
            conditions: writeTrustMetadata(
              createdSite.data.conditions,
              buildTrustMetadataFromReport(report, refreshedPhotoCount.data),
            ),
            trust_score: calculateCampSiteTrustScore({
              originalVerifiedInPerson: report.verified_in_person,
              originalUserStayedHere: report.user_stayed_here,
              originalLocationAccuracyM: report.location_accuracy_m,
              uniqueConfirmationCount: createdSite.data.confirmation_count,
              unresolvedFlagCount: createdSite.data.flag_count,
              approvedPhotoCount: refreshedPhotoCount.data,
              lastConfirmedAt: createdSite.data.last_confirmed_at,
            }),
          })
        : createdSite;
    notifyWithoutBlocking(
      this.notifications?.notifyApprovedPublished(
        updatedReport.data,
        finalSite.ok ? finalSite.data.id : createdSite.data.id,
      ),
    );

    return {
      ok: true,
      data: {
        report: omitReportPii(updatedReport.data),
        camp_site: omitCampSitePrivateFields(finalSite.ok ? finalSite.data : createdSite.data),
      },
    };
  }

  async rejectReport(
    reportId: string,
    _internalReason?: string | null,
  ): Promise<CampsiteServiceResult<CampSiteReportResponse>> {
    const adminResult = await requireAdminUser(this.backend);
    if (!adminResult.ok) return adminResult;

    const result = await this.backend.updateReport(reportId, {
      moderation_status: 'rejected',
      review_state: 'rejected',
    });
    if (!result.ok) return result;
    await writeReviewEvent(this.backend, result.data, 'moderator_rejected', adminResult.data.id, {
      reason: sanitizeCampSiteNotes(_internalReason),
    });
    notifyWithoutBlocking(this.notifications?.notifyRejected(result.data, _internalReason));
    return { ok: true, data: omitReportPii(result.data) };
  }

  async markReportNeedsInfo(reportId: string): Promise<CampsiteServiceResult<CampSiteReportResponse>> {
    const adminResult = await requireAdminUser(this.backend);
    if (!adminResult.ok) return adminResult;

    const result = await this.backend.updateReport(reportId, {
      moderation_status: 'needs_info',
      review_state: 'needs_submitter_info',
    });
    if (!result.ok) return result;
    await writeReviewEvent(this.backend, result.data, 'needs_info_requested', adminResult.data.id, {});
    notifyWithoutBlocking(this.notifications?.notifyNeedsInfo(result.data));
    return { ok: true, data: omitReportPii(result.data) };
  }

  async mergeReportIntoCampSite(
    reportId: string,
    campSiteId: string,
  ): Promise<CampsiteServiceResult<{ report: CampSiteReportResponse; camp_site: PublicCampSite }>> {
    return this.approveReport({ reportId, existingCampSiteId: campSiteId });
  }

  async hideCampSite(campSiteId: string): Promise<CampsiteServiceResult<PublicCampSite>> {
    const adminResult = await requireAdminUser(this.backend);
    if (!adminResult.ok) return adminResult;

    const result = await this.backend.updateCampSite(campSiteId, { status: 'hidden' });
    if (!result.ok) return result;
    await this.backend.insertCampSiteLifecycleEvent?.({
      camp_site_id: campSiteId,
      actor_user_id: adminResult.data.id,
      event_type: 'published_review_resolved',
      metadata: {
        action: 'hide',
        previous_status: 'unknown',
        next_status: 'hidden',
      },
    });
    return { ok: true, data: omitCampSitePrivateFields(result.data) };
  }
}

type SupabaseResponse<T> = {
  data: T | null;
  error: { message?: string } | null;
  count?: number | null;
};

export function createSupabaseCampsiteRecommendationBackend(
  client: SupabaseClient = supabase,
): CampsiteRecommendationBackend {
  return {
    isAvailable() {
      return isSupabaseConfigured;
    },

    async getCurrentUser() {
      const { data } = await client.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) return null;

      const operatorResult = (await client
        .from('operators')
        .select('role,status')
        .eq('user_id', userId)
        .maybeSingle()) as SupabaseResponse<{ role?: string | null; status?: string | null }>;

      return {
        id: userId,
        isAdmin:
          operatorResult.data?.role === 'super_admin' &&
          operatorResult.data?.status === 'active',
      };
    },

    async insertReport(row) {
      const result = (await client
        .from(CAMP_SITE_REPORTS_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<CampSiteReport>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async updateReport(reportId, changes) {
      const result = (await client
        .from(CAMP_SITE_REPORTS_TABLE)
        .update(changes)
        .eq('id', reportId)
        .select('*')
        .single()) as SupabaseResponse<CampSiteReport>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async getReportById(reportId) {
      const result = (await client
        .from(CAMP_SITE_REPORTS_TABLE)
        .select('*')
        .eq('id', reportId)
        .single()) as SupabaseResponse<CampSiteReport>;
      if (result.error || !result.data) return toServiceError('not_found', 'Campsite report was not found.');
      return { ok: true, data: result.data };
    },

    async getReportByClientSubmissionId(clientSubmissionId, userId) {
      const result = (await client
        .from(CAMP_SITE_REPORTS_TABLE)
        .select('*')
        .eq('client_submission_id', clientSubmissionId)
        .eq('submitted_by_user_id', userId)
        .maybeSingle()) as SupabaseResponse<CampSiteReport>;
      if (result.error) return mapBackendError(result.error);
      return { ok: true, data: result.data ?? null };
    },

    async listReportsByUser(userId, options) {
      let query = client
        .from(CAMP_SITE_REPORTS_TABLE)
        .select('*')
        .eq('submitted_by_user_id', userId)
        .order('updated_at', { ascending: false });
      if (options?.privateOnly) {
        query = query.eq('visibility_requested', 'private');
      }
      if (options?.visibilityRequested) {
        query = query.eq('visibility_requested', options.visibilityRequested);
      }
      if (options?.moderationStatuses?.length) {
        query = query.in('moderation_status', options.moderationStatuses);
      }
      if (options?.reviewStates?.length) {
        query = query.in('review_state', options.reviewStates);
      }
      if (options?.bounds) {
        query = query
          .gte('latitude', options.bounds.minLat)
          .lte('latitude', options.bounds.maxLat)
          .gte('longitude', options.bounds.minLng)
          .lte('longitude', options.bounds.maxLng);
      }
      const result = (await query.limit(limitForQuery(options?.limit))) as SupabaseResponse<CampSiteReport[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async listApprovedCommunityCampSitesByBounds(params) {
      let query = client
        .from(CAMP_SITES_TABLE)
        .select('*')
        .eq('status', 'approved')
        .eq('visibility', 'community')
        .gte('latitude', params.minLat)
        .lte('latitude', params.maxLat)
        .gte('longitude', params.minLng)
        .lte('longitude', params.maxLng)
        .order('trust_score', { ascending: false });

      if (params.site_type) query = query.eq('site_type', params.site_type);
      if (params.access_difficulty) query = query.eq('access_difficulty', params.access_difficulty);
      if (typeof params.trailer_friendly === 'boolean') {
        query = query.eq('trailer_friendly', params.trailer_friendly);
      }
      if (params.cell_signal) {
        query = query.contains('conditions', { cell_signal: params.cell_signal });
      }

      const result = (await query.range(
        params.offset,
        params.offset + params.limit - 1,
      )) as SupabaseResponse<CampSite[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async getApprovedCommunityCampSiteById(campSiteId) {
      const result = (await client
        .from(CAMP_SITES_TABLE)
        .select('*')
        .eq('id', campSiteId)
        .eq('status', 'approved')
        .eq('visibility', 'community')
        .single()) as SupabaseResponse<CampSite>;
      if (result.error || !result.data) return toServiceError('not_found', 'Campsite was not found.');
      return { ok: true, data: result.data };
    },

    async getCampSiteById(campSiteId) {
      const result = (await client
        .from(CAMP_SITES_TABLE)
        .select('*')
        .eq('id', campSiteId)
        .single()) as SupabaseResponse<CampSite>;
      if (result.error || !result.data) return toServiceError('not_found', 'Campsite was not found.');
      return { ok: true, data: result.data };
    },

    async insertCampSite(row) {
      const result = (await client
        .from(CAMP_SITES_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<CampSite>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async updateCampSite(campSiteId, changes) {
      const result = (await client
        .from(CAMP_SITES_TABLE)
        .update(changes)
        .eq('id', campSiteId)
        .select('*')
        .single()) as SupabaseResponse<CampSite>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async insertFlag(row) {
      const result = (await client
        .from(CAMP_SITE_FLAGS_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<CampSiteFlag>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async getFlagByUserForCampSite(campSiteId, userId) {
      const result = (await client
        .from(CAMP_SITE_FLAGS_TABLE)
        .select('*')
        .eq('camp_site_id', campSiteId)
        .eq('user_id', userId)
        .maybeSingle()) as SupabaseResponse<CampSiteFlag>;
      if (result.error) return mapBackendError(result.error);
      return { ok: true, data: result.data ?? null };
    },

    async countFlags(campSiteId) {
      const result = (await client
        .from(CAMP_SITE_FLAGS_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('camp_site_id', campSiteId)) as SupabaseResponse<null>;
      if (result.error) return mapBackendError(result.error);
      return { ok: true, data: result.count ?? 0 };
    },

    async listFlagsForCampSite(campSiteId) {
      const result = (await client
        .from(CAMP_SITE_FLAGS_TABLE)
        .select('*')
        .eq('camp_site_id', campSiteId)
        .order('created_at', { ascending: false })) as SupabaseResponse<CampSiteFlag[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async listFlaggedCampSites(limit) {
      const result = (await client
        .from(CAMP_SITES_TABLE)
        .select('*')
        .eq('visibility', 'community')
        .in('status', ['hidden_pending_review', 'approved'])
        .gt('flag_count', 0)
        .order('flag_count', { ascending: false })
        .limit(limit)) as SupabaseResponse<CampSite[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return {
        ok: true,
        data: result.data.filter(
          (site) => site.status === 'hidden_pending_review' || site.flag_count >= FLAG_REVIEW_THRESHOLD,
        ),
      };
    },

    async insertCampSiteLifecycleEvent(row) {
      const result = (await client
        .from(CAMP_SITE_LIFECYCLE_EVENTS_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<CampSiteLifecycleEventInsert & { id: string; created_at: string }>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async insertReviewEvent(row) {
      const result = (await client
        .from('camp_site_review_events')
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<CampSiteReviewEvent>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async countApprovedPhotosForReport(reportId) {
      const result = (await client
        .from(CAMP_SITE_PHOTOS_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('camp_site_report_id', reportId)
        .eq('moderation_status', 'approved')) as SupabaseResponse<null>;
      if (result.error) return mapBackendError(result.error);
      return { ok: true, data: result.count ?? 0 };
    },

    async insertPhoto(row) {
      const result = (await client
        .from(CAMP_SITE_PHOTOS_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<CampSitePhoto>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async listPhotosForReport(reportId) {
      const result = (await client
        .from(CAMP_SITE_PHOTOS_TABLE)
        .select('*')
        .eq('camp_site_report_id', reportId)
        .order('created_at', { ascending: true })) as SupabaseResponse<CampSitePhoto[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async listApprovedPhotosForCampSite(campSiteId) {
      const result = (await client
        .from(CAMP_SITE_PHOTOS_TABLE)
        .select('*')
        .eq('camp_site_id', campSiteId)
        .eq('moderation_status', 'approved')
        .eq('exif_stripped', true)
        .order('created_at', { ascending: true })) as SupabaseResponse<CampSitePhoto[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async getPhotoById(photoId) {
      const result = (await client
        .from(CAMP_SITE_PHOTOS_TABLE)
        .select('*')
        .eq('id', photoId)
        .single()) as SupabaseResponse<CampSitePhoto>;
      if (result.error || !result.data) return toServiceError('not_found', 'Campsite photo was not found.');
      return { ok: true, data: result.data };
    },

    async updatePhoto(photoId, changes) {
      const result = (await client
        .from(CAMP_SITE_PHOTOS_TABLE)
        .update(changes)
        .eq('id', photoId)
        .select('*')
        .single()) as SupabaseResponse<CampSitePhoto>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async updatePhotosForReport(reportId, changes) {
      const result = (await client
        .from(CAMP_SITE_PHOTOS_TABLE)
        .update(changes)
        .eq('camp_site_report_id', reportId)
        .select('*')) as SupabaseResponse<CampSitePhoto[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async listPendingReports(limit) {
      const result = (await client
        .from(CAMP_SITE_REPORTS_TABLE)
        .select('*')
        .eq('moderation_status', 'pending')
        .order('created_at', { ascending: true })
        .limit(limit)) as SupabaseResponse<CampSiteReport[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },
  };
}

export const campsiteRecommendationService = new CampsiteRecommendationService(
  createSupabaseCampsiteRecommendationBackend(),
  campsiteReviewNotificationService,
);
