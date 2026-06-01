export const CAMP_SITE_STATUSES = [
  'approved',
  'hidden',
  'archived',
  'hidden_pending_review',
  'closed',
  'sensitive_removed',
] as const;
export type CampSiteStatus = (typeof CAMP_SITE_STATUSES)[number];

export const CAMP_SITE_VISIBILITIES = ['community', 'group', 'private'] as const;
export type CampSiteVisibility = (typeof CAMP_SITE_VISIBILITIES)[number];

export const CAMP_SITE_GROUP_VISIBILITIES = ['private_group'] as const;
export type CampSiteGroupVisibility = (typeof CAMP_SITE_GROUP_VISIBILITIES)[number];

export const CAMP_SITE_GROUP_MEMBER_ROLES = ['owner', 'admin', 'member'] as const;
export type CampSiteGroupMemberRole = (typeof CAMP_SITE_GROUP_MEMBER_ROLES)[number];

export const CAMP_SITE_GROUP_MEMBER_STATUSES = ['active', 'invited', 'removed'] as const;
export type CampSiteGroupMemberStatus = (typeof CAMP_SITE_GROUP_MEMBER_STATUSES)[number];

export const CAMP_SITE_TYPES = [
  'established_dispersed',
  'developed',
  'paid',
  'trailhead',
  'unknown',
] as const;
export type CampSiteType = (typeof CAMP_SITE_TYPES)[number];

export const CAMP_SITE_ACCESS_DIFFICULTIES = [
  'easy_2wd',
  'awd',
  'high_clearance',
  'four_by_four',
  'technical',
] as const;
export type CampSiteAccessDifficulty = (typeof CAMP_SITE_ACCESS_DIFFICULTIES)[number];

export const CAMP_SITE_LEGAL_CONFIDENCE = ['unknown', 'low', 'medium', 'high'] as const;
export type CampSiteLegalConfidence = (typeof CAMP_SITE_LEGAL_CONFIDENCE)[number];

export const CAMP_SITE_REPORT_SOURCE_TYPES = [
  'current_location',
  'pin_drop',
  'gpx_waypoint',
  'gpx_route',
  'gpx_track_selected_point',
  'manual',
] as const;
export type CampSiteReportSourceType = (typeof CAMP_SITE_REPORT_SOURCE_TYPES)[number];

export const CAMP_SITE_REPORT_MODERATION_STATUSES = [
  'draft',
  'private_saved',
  'pending',
  'approved',
  'rejected',
  'needs_info',
  'merged',
] as const;
export type CampSiteReportModerationStatus =
  (typeof CAMP_SITE_REPORT_MODERATION_STATUSES)[number];

export const CAMP_SITE_REPORT_REVIEW_STATES = [
  'private_saved',
  'submitted',
  'auto_triage_failed',
  'needs_submitter_info',
  'community_review',
  'community_approved',
  'community_rejected',
  'moderator_review',
  'approved',
  'rejected',
  'merged',
  'hidden',
  'archived',
  'withdrawn',
] as const;
export type CampSiteReportReviewState = (typeof CAMP_SITE_REPORT_REVIEW_STATES)[number];

export const CAMP_SITE_FLAG_REASONS = [
  'private_land',
  'closed_to_camping',
  'sensitive_area',
  'duplicate',
  'unsafe',
  'trash_or_damage',
  'bad_coordinates',
  'other',
] as const;
export type CampSiteFlagReason = (typeof CAMP_SITE_FLAG_REASONS)[number];

export const CAMP_SITE_PHOTO_MODERATION_STATUSES = [
  'private',
  'group_visible',
  'pending',
  'approved',
  'rejected',
] as const;
export type CampSitePhotoModerationStatus =
  (typeof CAMP_SITE_PHOTO_MODERATION_STATUSES)[number];

export const CAMP_SITE_REVIEW_VOTES = [
  'approve',
  'reject',
  'needs_info',
  'duplicate',
  'sensitive',
  'private_land',
  'closed_to_camping',
  'bad_coordinates',
] as const;
export type CampSiteReviewVoteValue = (typeof CAMP_SITE_REVIEW_VOTES)[number];

export const CAMP_SITE_REVIEW_CONFIDENCES = ['low', 'medium', 'high'] as const;
export type CampSiteReviewConfidence = (typeof CAMP_SITE_REVIEW_CONFIDENCES)[number];

export const CAMP_SITE_REVIEW_EVENT_TYPES = [
  'submitted',
  'community_review',
  'triage_passed',
  'triage_failed',
  'vote_added',
  'vote_changed',
  'needs_info_requested',
  'community_approved',
  'community_rejected',
  'moderator_review',
  'moderator_approved',
  'moderator_rejected',
  'merged',
  'hidden',
  'published',
  'submitter_updated',
  'needs_info_responded',
  'withdrawn',
  'review_abuse_flagged',
  'reputation_updated',
] as const;
export type CampSiteReviewEventType = (typeof CAMP_SITE_REVIEW_EVENT_TYPES)[number];

export const CAMP_SITE_REVIEWER_STATUSES = ['none', 'candidate', 'trusted', 'suspended'] as const;
export type CampSiteReviewerStatus = (typeof CAMP_SITE_REVIEWER_STATUSES)[number];

export const LAND_USE_REVIEW_STATUSES = [
  'not_checked',
  'passed',
  'warning',
  'blocked',
  'unknown',
] as const;
export type LandUseReviewStatus = (typeof LAND_USE_REVIEW_STATUSES)[number];

export const GPX_IMPORT_STATUSES = ['parsed', 'rejected', 'deleted'] as const;
export type GpxImportStatus = (typeof GPX_IMPORT_STATUSES)[number];

export const GPX_IMPORT_RAW_FILE_RETENTIONS = ['delete_after_parse', 'retained'] as const;
export type GpxImportRawFileRetention = (typeof GPX_IMPORT_RAW_FILE_RETENTIONS)[number];

export const GPX_IMPORT_CANDIDATE_TYPES = [
  'waypoint',
  'route_selected_point',
  'track_selected_point',
] as const;
export type GpxImportCandidateType = (typeof GPX_IMPORT_CANDIDATE_TYPES)[number];

export type CampSiteJsonObject = Record<string, unknown>;

export interface CampSite {
  id: string;
  canonical_name: string | null;
  latitude: number;
  longitude: number;
  status: CampSiteStatus;
  visibility: CampSiteVisibility;
  site_type: CampSiteType;
  access_difficulty: CampSiteAccessDifficulty;
  vehicle_fit: string[];
  trailer_friendly: boolean | null;
  max_rig_length_ft: number | null;
  max_group_size: number | null;
  amenities: CampSiteJsonObject;
  conditions: CampSiteJsonObject;
  trust_score: number;
  legal_confidence: CampSiteLegalConfidence;
  last_confirmed_at: string | null;
  confirmation_count: number;
  flag_count: number;
  owner_user_id?: string | null;
  authorized_user_ids?: string[];
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  dirty?: boolean | number;
}

export interface CampSiteReport {
  id: string;
  camp_site_id: string | null;
  submitted_by_user_id: string;
  latitude: number;
  longitude: number;
  source_type: CampSiteReportSourceType;
  location_accuracy_m: number | null;
  user_stayed_here: boolean;
  verified_in_person: boolean;
  visited_at: string | null;
  site_type: CampSiteType;
  access_difficulty: CampSiteAccessDifficulty;
  vehicle_fit: string[];
  amenities: CampSiteJsonObject;
  conditions: CampSiteJsonObject;
  notes: string | null;
  visibility_requested: CampSiteVisibility;
  moderation_status: CampSiteReportModerationStatus;
  stewardship_acknowledged: boolean;
  sensitive_area_acknowledged: boolean;
  client_submission_id?: string | null;
  review_state?: CampSiteReportReviewState;
  triage_score?: number | null;
  triage_summary?: CampSiteJsonObject | null;
  community_review_started_at?: string | null;
  community_review_completed_at?: string | null;
  moderator_review_started_at?: string | null;
  moderator_review_completed_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  dirty?: boolean | number;
}

export interface CampSiteFlag {
  id: string;
  camp_site_id: string;
  user_id: string;
  reason: CampSiteFlagReason;
  details: string | null;
  created_at: string;
  deleted_at?: string | null;
  dirty?: boolean | number;
}

export interface CampSitePhoto {
  id: string;
  camp_site_report_id: string;
  camp_site_id: string | null;
  user_id: string;
  storage_url: string;
  thumbnail_url: string | null;
  exif_stripped: boolean;
  moderation_status: CampSitePhotoModerationStatus;
  created_at: string;
  deleted_at?: string | null;
  dirty?: boolean | number;
}

export interface CampSiteGroup {
  id: string;
  name: string;
  owner_user_id: string;
  visibility: CampSiteGroupVisibility;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  dirty?: boolean | number;
}

export interface CampSiteGroupMembership {
  id: string;
  group_id: string;
  user_id: string;
  role: CampSiteGroupMemberRole;
  status: CampSiteGroupMemberStatus;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  dirty?: boolean | number;
}

export interface CampSiteGroupShare {
  id: string;
  camp_site_report_id: string | null;
  camp_site_id: string | null;
  group_id: string;
  shared_by_user_id: string;
  created_at: string;
  deleted_at?: string | null;
  dirty?: boolean | number;
}

export interface CampSiteReviewVote {
  id: string;
  camp_site_report_id: string;
  reviewer_user_id: string;
  vote: CampSiteReviewVoteValue;
  confidence: CampSiteReviewConfidence;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  dirty?: boolean | number;
}

export interface CampSiteReviewEvent {
  id: string;
  camp_site_report_id: string;
  actor_user_id: string | null;
  event_type: CampSiteReviewEventType;
  metadata: CampSiteJsonObject;
  created_at: string;
  deleted_at?: string | null;
  dirty?: boolean | number;
}

export interface CampSiteReviewerProfile {
  id: string;
  user_id: string;
  reviewer_status: CampSiteReviewerStatus;
  review_region: CampSiteJsonObject | null;
  review_count: number;
  helpful_review_count: number;
  rejected_review_count: number;
  reputation_score: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  dirty?: boolean | number;
}

export interface LandUseReviewResult {
  id: string;
  camp_site_report_id: string;
  status: LandUseReviewStatus;
  matched_layers: CampSiteJsonObject;
  warnings: string[];
  blocking_reasons: string[];
  provider_version: string | null;
  created_at: string;
  deleted_at?: string | null;
  dirty?: boolean | number;
}

export interface GpxImport {
  id: string;
  user_id: string;
  client_import_id?: string | null;
  original_filename: string | null;
  file_size_bytes: number;
  parser_version: string;
  waypoint_count: number;
  route_count: number;
  track_count: number;
  status: GpxImportStatus;
  raw_file_retention: GpxImportRawFileRetention;
  metadata: CampSiteJsonObject;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  dirty?: boolean | number;
}

export interface GpxImportCandidate {
  id: string;
  gpx_import_id: string;
  user_id: string;
  candidate_type: GpxImportCandidateType;
  name: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  elevation_m: number | null;
  recorded_at: string | null;
  source_route_name?: string | null;
  source_track_name?: string | null;
  source_segment_index?: number | null;
  selected_for_save: boolean;
  selected_for_community_submission: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  dirty?: boolean | number;
}

export type CampSiteValidationResult = {
  ok: boolean;
  errors: string[];
};

const MAX_REVIEWER_NOTES_LENGTH = 2000;

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number]);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function sanitizeCampSiteReviewNotes(notes: string | null | undefined): string | null {
  if (typeof notes !== 'string') return null;
  const sanitized = notes
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized ? sanitized.slice(0, MAX_REVIEWER_NOTES_LENGTH) : null;
}

export function getInitialCampSiteReportReviewState(
  visibility: CampSiteVisibility,
): CampSiteReportReviewState {
  return visibility === 'community' ? 'submitted' : 'private_saved';
}

const CAMP_SITE_REPORT_REVIEW_TRANSITIONS: Record<
  CampSiteReportReviewState,
  CampSiteReportReviewState[]
> = {
  private_saved: ['submitted', 'archived', 'withdrawn'],
  submitted: ['auto_triage_failed', 'community_review', 'moderator_review', 'needs_submitter_info', 'withdrawn'],
  auto_triage_failed: ['needs_submitter_info', 'community_review', 'moderator_review', 'rejected', 'withdrawn'],
  needs_submitter_info: ['submitted', 'community_review', 'moderator_review', 'rejected', 'withdrawn'],
  community_review: ['community_approved', 'community_rejected', 'needs_submitter_info', 'moderator_review', 'withdrawn'],
  community_approved: ['moderator_review', 'approved', 'merged', 'withdrawn'],
  community_rejected: ['moderator_review', 'rejected', 'needs_submitter_info', 'withdrawn'],
  moderator_review: ['approved', 'community_rejected', 'rejected', 'merged', 'hidden', 'needs_submitter_info', 'withdrawn'],
  approved: ['hidden', 'archived'],
  rejected: ['archived'],
  merged: ['hidden', 'archived'],
  hidden: ['archived'],
  archived: [],
  withdrawn: ['archived'],
};

export function canTransitionCampSiteReportReviewState(
  from: CampSiteReportReviewState,
  to: CampSiteReportReviewState,
): boolean {
  return from === to || (CAMP_SITE_REPORT_REVIEW_TRANSITIONS[from] ?? []).includes(to);
}

export function createDefaultCampSiteReviewerProfile(
  userId: string,
  now = new Date().toISOString(),
): CampSiteReviewerProfile {
  return {
    id: `reviewer-${userId}`,
    user_id: userId,
    reviewer_status: 'none',
    review_region: null,
    review_count: 0,
    helpful_review_count: 0,
    rejected_review_count: 0,
    reputation_score: 0,
    created_at: now,
    updated_at: now,
  };
}

export function isValidCampSiteLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidCampSiteLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function validateCampSiteRecord(record: Partial<CampSite>): CampSiteValidationResult {
  const errors: string[] = [];

  if (!record.id) errors.push('id is required');
  if (!isValidCampSiteLatitude(record.latitude)) errors.push('latitude must be between -90 and 90');
  if (!isValidCampSiteLongitude(record.longitude)) {
    errors.push('longitude must be between -180 and 180');
  }
  if (!isOneOf(CAMP_SITE_STATUSES, record.status)) errors.push('status is invalid');
  if (!isOneOf(CAMP_SITE_VISIBILITIES, record.visibility)) errors.push('visibility is invalid');
  if (!isOneOf(CAMP_SITE_TYPES, record.site_type)) errors.push('site_type is invalid');
  if (!isOneOf(CAMP_SITE_ACCESS_DIFFICULTIES, record.access_difficulty)) {
    errors.push('access_difficulty is invalid');
  }
  if (!Array.isArray(record.vehicle_fit)) errors.push('vehicle_fit must be an array');
  if (typeof record.trust_score !== 'number' || !Number.isFinite(record.trust_score)) {
    errors.push('trust_score must be a number');
  }
  if (!isOneOf(CAMP_SITE_LEGAL_CONFIDENCE, record.legal_confidence)) {
    errors.push('legal_confidence is invalid');
  }

  return { ok: errors.length === 0, errors };
}

export function validateCampSiteReportRecord(
  record: Partial<CampSiteReport>,
): CampSiteValidationResult {
  const errors: string[] = [];

  if (!record.id) errors.push('id is required');
  if (!record.submitted_by_user_id) errors.push('submitted_by_user_id is required');
  if (!isValidCampSiteLatitude(record.latitude)) errors.push('latitude must be between -90 and 90');
  if (!isValidCampSiteLongitude(record.longitude)) {
    errors.push('longitude must be between -180 and 180');
  }
  if (!isOneOf(CAMP_SITE_REPORT_SOURCE_TYPES, record.source_type)) {
    errors.push('source_type is invalid');
  }
  if (!isOneOf(CAMP_SITE_TYPES, record.site_type)) errors.push('site_type is invalid');
  if (!isOneOf(CAMP_SITE_ACCESS_DIFFICULTIES, record.access_difficulty)) {
    errors.push('access_difficulty is invalid');
  }
  if (!Array.isArray(record.vehicle_fit)) errors.push('vehicle_fit must be an array');
  if (!isOneOf(CAMP_SITE_VISIBILITIES, record.visibility_requested)) {
    errors.push('visibility_requested is invalid');
  }
  if (!isOneOf(CAMP_SITE_REPORT_MODERATION_STATUSES, record.moderation_status)) {
    errors.push('moderation_status is invalid');
  }
  if (record.review_state != null && !isOneOf(CAMP_SITE_REPORT_REVIEW_STATES, record.review_state)) {
    errors.push('review_state is invalid');
  }
  if (
    record.triage_score != null &&
    (typeof record.triage_score !== 'number' ||
      !Number.isFinite(record.triage_score) ||
      record.triage_score < 0 ||
      record.triage_score > 100)
  ) {
    errors.push('triage_score must be between 0 and 100');
  }
  if (
    record.client_submission_id != null &&
    (typeof record.client_submission_id !== 'string' || record.client_submission_id.length > 128)
  ) {
    errors.push('client_submission_id is invalid');
  }

  return { ok: errors.length === 0, errors };
}

export function validateCampSiteGroupRecord(
  record: Partial<CampSiteGroup>,
): CampSiteValidationResult {
  const errors: string[] = [];
  if (!record.id) errors.push('id is required');
  if (!record.name || typeof record.name !== 'string') errors.push('name is required');
  if (!record.owner_user_id) errors.push('owner_user_id is required');
  if (!isOneOf(CAMP_SITE_GROUP_VISIBILITIES, record.visibility)) {
    errors.push('visibility is invalid');
  }
  return { ok: errors.length === 0, errors };
}

export function validateCampSiteGroupMembershipRecord(
  record: Partial<CampSiteGroupMembership>,
): CampSiteValidationResult {
  const errors: string[] = [];
  if (!record.id) errors.push('id is required');
  if (!record.group_id) errors.push('group_id is required');
  if (!record.user_id) errors.push('user_id is required');
  if (!isOneOf(CAMP_SITE_GROUP_MEMBER_ROLES, record.role)) errors.push('role is invalid');
  if (!isOneOf(CAMP_SITE_GROUP_MEMBER_STATUSES, record.status)) {
    errors.push('status is invalid');
  }
  return { ok: errors.length === 0, errors };
}

export function validateCampSiteGroupShareRecord(
  record: Partial<CampSiteGroupShare>,
): CampSiteValidationResult {
  const errors: string[] = [];
  if (!record.id) errors.push('id is required');
  if (!record.group_id) errors.push('group_id is required');
  if (!record.shared_by_user_id) errors.push('shared_by_user_id is required');
  if (!record.camp_site_report_id && !record.camp_site_id) {
    errors.push('camp_site_report_id or camp_site_id is required');
  }
  if (record.camp_site_report_id && record.camp_site_id) {
    errors.push('share must reference either a report or a campsite, not both');
  }
  return { ok: errors.length === 0, errors };
}

export function validateLandUseReviewResultRecord(
  record: Partial<LandUseReviewResult>,
): CampSiteValidationResult {
  const errors: string[] = [];
  if (!record.id) errors.push('id is required');
  if (!record.camp_site_report_id) errors.push('camp_site_report_id is required');
  if (!isOneOf(LAND_USE_REVIEW_STATUSES, record.status)) errors.push('status is invalid');
  if (!record.matched_layers || typeof record.matched_layers !== 'object') {
    errors.push('matched_layers must be an object');
  }
  if (!Array.isArray(record.warnings)) errors.push('warnings must be an array');
  if (!Array.isArray(record.blocking_reasons)) errors.push('blocking_reasons must be an array');
  return { ok: errors.length === 0, errors };
}

export function validateCampSiteReviewVoteRecord(
  record: Partial<CampSiteReviewVote>,
): CampSiteValidationResult {
  const errors: string[] = [];

  if (!record.id) errors.push('id is required');
  if (!record.camp_site_report_id) errors.push('camp_site_report_id is required');
  if (!record.reviewer_user_id) errors.push('reviewer_user_id is required');
  if (!isOneOf(CAMP_SITE_REVIEW_VOTES, record.vote)) errors.push('vote is invalid');
  if (!isOneOf(CAMP_SITE_REVIEW_CONFIDENCES, record.confidence)) {
    errors.push('confidence is invalid');
  }
  if (
    record.reviewer_notes != null &&
    sanitizeCampSiteReviewNotes(record.reviewer_notes) !== record.reviewer_notes
  ) {
    errors.push('reviewer_notes must be sanitized');
  }

  return { ok: errors.length === 0, errors };
}

export function validateCampSiteReviewEventRecord(
  record: Partial<CampSiteReviewEvent>,
): CampSiteValidationResult {
  const errors: string[] = [];

  if (!record.id) errors.push('id is required');
  if (!record.camp_site_report_id) errors.push('camp_site_report_id is required');
  if (!isOneOf(CAMP_SITE_REVIEW_EVENT_TYPES, record.event_type)) {
    errors.push('event_type is invalid');
  }
  if (record.metadata == null || typeof record.metadata !== 'object' || Array.isArray(record.metadata)) {
    errors.push('metadata must be an object');
  }
  if (!record.created_at) errors.push('created_at is required');

  return { ok: errors.length === 0, errors };
}

export function validateCampSiteReviewerProfileRecord(
  record: Partial<CampSiteReviewerProfile>,
): CampSiteValidationResult {
  const errors: string[] = [];

  if (!record.id) errors.push('id is required');
  if (!record.user_id) errors.push('user_id is required');
  if (!isOneOf(CAMP_SITE_REVIEWER_STATUSES, record.reviewer_status)) {
    errors.push('reviewer_status is invalid');
  }
  if (!isFiniteNonNegativeNumber(record.review_count)) errors.push('review_count is invalid');
  if (!isFiniteNonNegativeNumber(record.helpful_review_count)) {
    errors.push('helpful_review_count is invalid');
  }
  if (!isFiniteNonNegativeNumber(record.rejected_review_count)) {
    errors.push('rejected_review_count is invalid');
  }
  if (!isFiniteNonNegativeNumber(record.reputation_score)) {
    errors.push('reputation_score is invalid');
  }

  return { ok: errors.length === 0, errors };
}

export function validateGpxImportRecord(record: Partial<GpxImport>): CampSiteValidationResult {
  const errors: string[] = [];

  if (!record.id) errors.push('id is required');
  if (!record.user_id) errors.push('user_id is required');
  if (
    record.client_import_id != null &&
    (typeof record.client_import_id !== 'string' ||
      record.client_import_id.trim().length === 0 ||
      record.client_import_id.length > 128)
  ) {
    errors.push('client_import_id is invalid');
  }
  if (typeof record.file_size_bytes !== 'number' || record.file_size_bytes < 0) {
    errors.push('file_size_bytes must be non-negative');
  }
  if (!record.parser_version) errors.push('parser_version is required');
  if (typeof record.waypoint_count !== 'number' || record.waypoint_count < 0) {
    errors.push('waypoint_count must be non-negative');
  }
  if (typeof record.route_count !== 'number' || record.route_count < 0) {
    errors.push('route_count must be non-negative');
  }
  if (typeof record.track_count !== 'number' || record.track_count < 0) {
    errors.push('track_count must be non-negative');
  }
  if (!isOneOf(GPX_IMPORT_STATUSES, record.status)) errors.push('status is invalid');
  if (!isOneOf(GPX_IMPORT_RAW_FILE_RETENTIONS, record.raw_file_retention)) {
    errors.push('raw_file_retention is invalid');
  }
  if (!record.created_at) errors.push('created_at is required');
  if (!record.updated_at) errors.push('updated_at is required');

  return { ok: errors.length === 0, errors };
}

export function validateGpxImportCandidateRecord(
  record: Partial<GpxImportCandidate>,
): CampSiteValidationResult {
  const errors: string[] = [];

  if (!record.id) errors.push('id is required');
  if (!record.gpx_import_id) errors.push('gpx_import_id is required');
  if (!record.user_id) errors.push('user_id is required');
  if (!isOneOf(GPX_IMPORT_CANDIDATE_TYPES, record.candidate_type)) {
    errors.push('candidate_type is invalid');
  }
  if (!isValidCampSiteLatitude(record.latitude)) errors.push('latitude must be between -90 and 90');
  if (!isValidCampSiteLongitude(record.longitude)) errors.push('longitude must be between -180 and 180');
  if (
    record.elevation_m != null &&
    (typeof record.elevation_m !== 'number' || !Number.isFinite(record.elevation_m))
  ) {
    errors.push('elevation_m must be a finite number when present');
  }
  if (
    record.source_segment_index != null &&
    (!Number.isInteger(record.source_segment_index) || record.source_segment_index < 0)
  ) {
    errors.push('source_segment_index must be a non-negative integer when present');
  }
  if (typeof record.selected_for_save !== 'boolean') errors.push('selected_for_save is required');
  if (typeof record.selected_for_community_submission !== 'boolean') {
    errors.push('selected_for_community_submission is required');
  }
  if (!record.created_at) errors.push('created_at is required');
  if (!record.updated_at) errors.push('updated_at is required');

  return { ok: errors.length === 0, errors };
}
