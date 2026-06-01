import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../supabase';
import {
  type CampSite,
  type CampSiteJsonObject,
  type CampSitePhoto,
  type CampSiteReport,
  type CampSiteReportReviewState,
  type CampSiteReviewConfidence,
  type CampSiteReviewEvent,
  type CampSiteReviewEventType,
  type CampSiteReviewerProfile,
  type CampSiteReviewVote,
  type CampSiteReviewVoteValue,
  type LandUseReviewResult,
  canTransitionCampSiteReportReviewState,
  sanitizeCampSiteReviewNotes,
  validateCampSiteReviewEventRecord,
  validateCampSiteReviewVoteRecord,
} from './campsiteRecommendationTypes';
import {
  type CampSiteInsert,
  type CampsiteServiceErrorCode,
  type CampsiteServiceResult,
  type PublicCampSite,
} from './campsiteRecommendationService';
import {
  DEFAULT_CAMPSITE_REVIEW_CONFIG,
  type CampsiteReviewConfig,
} from './campsiteReviewConfig';
import {
  buildTrustMetadataFromReport,
  calculateCampSiteTrustScore,
  writeTrustMetadata,
} from './campsiteTrustScoring';
import {
  sanitizeLandUseReviewResult,
  type SanitizedLandUseReviewResult,
} from './campsiteLandUseReviewService';
import {
  campsiteReviewNotificationService,
  notifyWithoutBlocking,
  type CampsiteReviewNotificationService,
} from './campsiteReviewNotificationService';

const CAMP_SITES_TABLE = 'camp_sites';
const CAMP_SITE_REPORTS_TABLE = 'camp_site_reports';
const CAMP_SITE_PHOTOS_TABLE = 'camp_site_photos';
const CAMP_SITE_REVIEW_VOTES_TABLE = 'camp_site_review_votes';
const CAMP_SITE_REVIEW_EVENTS_TABLE = 'camp_site_review_events';
const CAMP_SITE_REVIEWER_PROFILES_TABLE = 'camp_site_reviewer_profiles';
const CAMP_SITE_REVIEWER_AUDIT_EVENTS_TABLE = 'camp_site_reviewer_audit_events';
const LAND_USE_REVIEW_RESULTS_TABLE = 'land_use_review_results';
const DEFAULT_REVIEW_SLA_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_LIST_LIMIT = 50;
const DEFAULT_REVIEW_RATE_WINDOW_MS = 60 * 60 * 1000;

type ReviewAuthUser = {
  id: string;
  isAdmin?: boolean;
  isSystem?: boolean;
  isTrustedReviewer?: boolean;
};

export type CampSiteReviewVoteInput = {
  vote: CampSiteReviewVoteValue;
  confidence: CampSiteReviewConfidence;
  reviewer_notes?: string | null;
};

export type CampSiteReviewOutcomeStatus =
  | 'pending'
  | 'community_approved'
  | 'community_rejected'
  | 'moderator_review'
  | 'needs_info';

export type CampSiteReviewOutcome = {
  status: CampSiteReviewOutcomeStatus;
  reason: string;
  approveCount: number;
  rejectCount: number;
  blockingVoteCount: number;
  duplicateVoteCount: number;
  totalVotes: number;
  shouldPublish: boolean;
};

export type CampSiteReviewQueueItem = Omit<
  CampSiteReport,
  'submitted_by_user_id' | 'dirty' | 'deleted_at'
> & {
  photos?: Omit<CampSitePhoto, 'user_id' | 'dirty' | 'deleted_at'>[];
  nearby_camp_sites?: PublicCampSite[];
  vote_summary?: CampSiteReviewVoteSummary;
  land_use_review?: SanitizedLandUseReviewResult | null;
  can_vote?: boolean;
  ineligible_reason?: string | null;
};

export type CampSiteReviewVoteSummary = {
  approve: number;
  reject: number;
  needs_info: number;
  duplicate: number;
  sensitive: number;
  private_land: number;
  closed_to_camping: number;
  bad_coordinates: number;
  highConfidenceBlocking: number;
};

export type CampSiteReviewReportDetails = CampSiteReviewQueueItem & {
  vote_summary: CampSiteReviewVoteSummary;
  my_vote: Omit<CampSiteReviewVote, 'dirty' | 'deleted_at'> | null;
  reviewer_notes?: Omit<CampSiteReviewVote, 'dirty' | 'deleted_at'>[];
  events: Omit<CampSiteReviewEvent, 'dirty' | 'deleted_at'>[];
};

export type CampSiteReviewerAuditEventType =
  | 'reviewer_promoted'
  | 'reviewer_suspended'
  | 'reviewer_status_changed';

export type CampSiteReviewerAuditEvent = {
  id: string;
  reviewer_user_id: string;
  actor_user_id: string | null;
  event_type: CampSiteReviewerAuditEventType;
  metadata: CampSiteJsonObject;
  created_at: string;
};

export type CampSiteReviewerProfileUpdate = Partial<
  Pick<
    CampSiteReviewerProfile,
    | 'reviewer_status'
    | 'review_count'
    | 'helpful_review_count'
    | 'rejected_review_count'
    | 'reputation_score'
    | 'review_region'
  >
>;

export type CampSiteReviewerManagementItem = CampSiteReviewerProfile & {
  recent_votes?: CampSiteReviewVote[];
  audit_events?: CampSiteReviewerAuditEvent[];
  approve_only_recent?: boolean;
};

export type CampSiteReviewServiceConfig = {
  approveQuorum?: number;
  blockingQuorum?: number;
  reviewSlaMs?: number;
  autoPublishCommunityApproved?: boolean;
  moderatorFinalApprovalRequired?: boolean;
  triageWarningThreshold?: number;
  maxVotesPerHour?: number;
  approveOnlyAuditThreshold?: number;
};

type CampSiteReviewVoteInsert = Omit<
  CampSiteReviewVote,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'dirty'
>;
type CampSiteReviewEventInsert = Omit<
  CampSiteReviewEvent,
  'id' | 'created_at' | 'deleted_at' | 'dirty'
>;
type CampSiteReviewerAuditEventInsert = Omit<CampSiteReviewerAuditEvent, 'id' | 'created_at'>;

export interface CampsiteReviewBackend {
  isAvailable(): boolean;
  getCurrentUser(): Promise<ReviewAuthUser | null>;
  getReportById(reportId: string): Promise<CampsiteServiceResult<CampSiteReport>>;
  updateReport(
    reportId: string,
    changes: Partial<CampSiteReport>,
  ): Promise<CampsiteServiceResult<CampSiteReport>>;
  insertCampSite(row: CampSiteInsert): Promise<CampsiteServiceResult<CampSite>>;
  updatePhotosForReport?(
    reportId: string,
    changes: Partial<Pick<CampSitePhoto, 'camp_site_id' | 'moderation_status'>>,
  ): Promise<CampsiteServiceResult<CampSitePhoto[]>>;
  countApprovedPhotosForReport?(reportId: string): Promise<CampsiteServiceResult<number>>;
  getReviewerProfile(userId: string): Promise<CampsiteServiceResult<CampSiteReviewerProfile | null>>;
  upsertReviewerProfile?(
    userId: string,
    changes: CampSiteReviewerProfileUpdate,
  ): Promise<CampsiteServiceResult<CampSiteReviewerProfile>>;
  updateReviewerProfile?(
    userId: string,
    changes: CampSiteReviewerProfileUpdate,
  ): Promise<CampsiteServiceResult<CampSiteReviewerProfile>>;
  listReviewerProfiles?(limit: number): Promise<CampsiteServiceResult<CampSiteReviewerProfile[]>>;
  getVoteForReviewer(
    reportId: string,
    reviewerUserId: string,
  ): Promise<CampsiteServiceResult<CampSiteReviewVote | null>>;
  insertReviewVote(row: CampSiteReviewVoteInsert): Promise<CampsiteServiceResult<CampSiteReviewVote>>;
  updateReviewVote(
    voteId: string,
    changes: Partial<CampSiteReviewVote>,
  ): Promise<CampsiteServiceResult<CampSiteReviewVote>>;
  listReviewVotes(reportId: string): Promise<CampsiteServiceResult<CampSiteReviewVote[]>>;
  listReviewerVotes?(
    reviewerUserId: string,
    limit: number,
  ): Promise<CampsiteServiceResult<CampSiteReviewVote[]>>;
  listReviewerVotesSince?(
    reviewerUserId: string,
    sinceIso: string,
  ): Promise<CampsiteServiceResult<CampSiteReviewVote[]>>;
  insertReviewEvent(row: CampSiteReviewEventInsert): Promise<CampsiteServiceResult<CampSiteReviewEvent>>;
  listReviewEvents(reportId: string): Promise<CampsiteServiceResult<CampSiteReviewEvent[]>>;
  insertReviewerAuditEvent?(
    row: CampSiteReviewerAuditEventInsert,
  ): Promise<CampsiteServiceResult<CampSiteReviewerAuditEvent>>;
  listReviewerAuditEvents?(
    reviewerUserId: string,
    limit: number,
  ): Promise<CampsiteServiceResult<CampSiteReviewerAuditEvent[]>>;
  listCommunityReviewReports(limit: number): Promise<CampsiteServiceResult<CampSiteReport[]>>;
  listPhotosForReport?(reportId: string): Promise<CampsiteServiceResult<CampSitePhoto[]>>;
  listNearbyApprovedCampSites?(
    report: CampSiteReport,
    limit: number,
  ): Promise<CampsiteServiceResult<CampSite[]>>;
  getLatestLandUseReviewResult?(reportId: string): Promise<CampsiteServiceResult<LandUseReviewResult | null>>;
}

type SupabaseResponse<T> = {
  data: T | null;
  error: { message?: string } | null;
  count?: number | null;
};

function toServiceError(
  code: CampsiteServiceErrorCode,
  error: string,
  details?: string[],
): CampsiteServiceResult<never> {
  return { ok: false, code, error, details };
}

function mapBackendError(error: { message?: string } | null | undefined): CampsiteServiceResult<never> {
  return toServiceError('backend_error', error?.message ?? 'Campsite review backend request failed.');
}

function isReviewPrivileged(user: ReviewAuthUser | null): user is ReviewAuthUser {
  return Boolean(user?.isAdmin || user?.isSystem || user?.isTrustedReviewer);
}

function isModeratorOrSystem(user: ReviewAuthUser | null): user is ReviewAuthUser {
  return Boolean(user?.isAdmin || user?.isSystem);
}

function publicCampSite(site: CampSite): PublicCampSite {
  const { owner_user_id: _owner, authorized_user_ids: _authorized, dirty: _dirty, deleted_at: _deleted, ...rest } = site;
  return rest;
}

function publicPhoto(photo: CampSitePhoto): Omit<CampSitePhoto, 'user_id' | 'dirty' | 'deleted_at'> {
  const { user_id: _userId, dirty: _dirty, deleted_at: _deleted, ...rest } = photo;
  return rest;
}

function reviewQueueItem(
  report: CampSiteReport,
  photos: CampSitePhoto[] = [],
  nearbyCampSites: CampSite[] = [],
  currentUser: ReviewAuthUser | null = null,
  summary?: CampSiteReviewVoteSummary,
  landUseReview?: LandUseReviewResult | null,
): CampSiteReviewQueueItem {
  const {
    submitted_by_user_id: _submitter,
    dirty: _dirty,
    deleted_at: _deleted,
    ...rest
  } = report;
  return {
    ...rest,
    photos: photos.map(publicPhoto),
    nearby_camp_sites: nearbyCampSites.map(publicCampSite),
    vote_summary: summary,
    land_use_review: landUseReview
      ? sanitizeLandUseReviewResult(
          landUseReview,
          isModeratorOrSystem(currentUser) ? 'moderator' : 'reviewer',
        )
      : null,
    can_vote:
      currentUser != null &&
      isReviewPrivileged(currentUser) &&
      report.submitted_by_user_id !== currentUser.id &&
      canReceiveVote(report),
    ineligible_reason:
      currentUser == null
        ? 'Sign in to review campsite recommendations.'
        : !isReviewPrivileged(currentUser)
          ? 'Trusted reviewer or moderator access is required.'
          : report.submitted_by_user_id === currentUser.id
            ? 'You cannot vote on your own campsite submission.'
            : !canReceiveVote(report)
              ? 'This campsite is not open for review voting.'
              : null,
  };
}

function voteSummary(votes: CampSiteReviewVote[]): CampSiteReviewVoteSummary {
  return votes.reduce<CampSiteReviewVoteSummary>(
    (summary, vote) => {
      summary[vote.vote] += 1;
      if (isBlockingVote(vote.vote) && vote.confidence === 'high') {
        summary.highConfidenceBlocking += 1;
      }
      return summary;
    },
    {
      approve: 0,
      reject: 0,
      needs_info: 0,
      duplicate: 0,
      sensitive: 0,
      private_land: 0,
      closed_to_camping: 0,
      bad_coordinates: 0,
      highConfidenceBlocking: 0,
    },
  );
}

function isBlockingVote(vote: CampSiteReviewVoteValue): boolean {
  return vote === 'sensitive' || vote === 'private_land' || vote === 'closed_to_camping';
}

function isConflictVote(vote: CampSiteReviewVoteValue): boolean {
  return vote !== 'approve';
}

function buildCampSiteFromApprovedReport(report: CampSiteReport, approvedPhotoCount = 0): CampSiteInsert {
  const confirmed = report.verified_in_person || report.user_stayed_here;
  const lastConfirmedAt = confirmed ? report.visited_at ?? report.created_at : null;
  const confirmationCount = confirmed ? 1 : 0;
  return {
    canonical_name: null,
    latitude: report.latitude,
    longitude: report.longitude,
    status: 'approved',
    visibility: 'community',
    site_type: report.site_type,
    access_difficulty: report.access_difficulty,
    vehicle_fit: report.vehicle_fit,
    trailer_friendly:
      typeof report.conditions.trailer_friendly === 'boolean'
        ? report.conditions.trailer_friendly
        : null,
    max_rig_length_ft:
      typeof report.conditions.max_rig_length_ft === 'number'
        ? report.conditions.max_rig_length_ft
        : null,
    max_group_size:
      typeof report.conditions.max_group_size === 'number'
        ? report.conditions.max_group_size
        : null,
    amenities: report.amenities,
    conditions: writeTrustMetadata(
      report.conditions,
      buildTrustMetadataFromReport(report, approvedPhotoCount),
    ),
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
    owner_user_id: null,
    authorized_user_ids: [],
  };
}

function isSubmittedForReview(report: CampSiteReport): boolean {
  return (
    report.visibility_requested === 'community' &&
    (report.review_state === 'submitted' ||
      report.review_state == null ||
      report.moderation_status === 'pending')
  );
}

function canReceiveVote(report: CampSiteReport): boolean {
  return report.review_state === 'community_review' || report.review_state === 'moderator_review';
}

function emptyReviewerProfile(userId: string, now = new Date().toISOString()): CampSiteReviewerProfile {
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

function isSafetyMinorityVote(vote: CampSiteReviewVote): boolean {
  return (
    (vote.vote === 'sensitive' ||
      vote.vote === 'private_land' ||
      vote.vote === 'closed_to_camping') &&
    (vote.confidence === 'medium' || vote.confidence === 'high')
  );
}

function voteAlignsWithFinalState(
  vote: CampSiteReviewVote,
  finalState: CampSiteReportReviewState,
): 'aligned' | 'conflicted' | 'preserve' {
  if (finalState === 'approved' || finalState === 'merged') {
    if (vote.vote === 'approve') return 'aligned';
    return isSafetyMinorityVote(vote) ? 'preserve' : 'conflicted';
  }
  if (finalState === 'community_rejected' || finalState === 'rejected' || finalState === 'hidden') {
    return vote.vote === 'approve' ? 'conflicted' : 'aligned';
  }
  return 'preserve';
}

function scoreForProfile(profile: CampSiteReviewerProfile): number {
  const base = profile.reviewer_status === 'trusted' ? 60 : profile.reviewer_status === 'candidate' ? 35 : 0;
  const score =
    base +
    profile.helpful_review_count * 4 -
    profile.rejected_review_count * 6 +
    Math.min(profile.review_count, 40) * 0.5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function mergeConfig(config?: CampSiteReviewServiceConfig): Required<CampSiteReviewServiceConfig> {
  return {
    approveQuorum: config?.approveQuorum ?? DEFAULT_CAMPSITE_REVIEW_CONFIG.minTrustedApprovals,
    blockingQuorum: config?.blockingQuorum ?? 2,
    reviewSlaMs: config?.reviewSlaMs ?? DEFAULT_REVIEW_SLA_MS,
    autoPublishCommunityApproved:
      config?.autoPublishCommunityApproved ?? DEFAULT_CAMPSITE_REVIEW_CONFIG.autoPublishAfterCommunityQuorum,
    moderatorFinalApprovalRequired:
      config?.moderatorFinalApprovalRequired ??
      !DEFAULT_CAMPSITE_REVIEW_CONFIG.autoPublishAfterCommunityQuorum,
    triageWarningThreshold: config?.triageWarningThreshold ?? DEFAULT_CAMPSITE_REVIEW_CONFIG.triageWarningThreshold,
    maxVotesPerHour: config?.maxVotesPerHour ?? 30,
    approveOnlyAuditThreshold: config?.approveOnlyAuditThreshold ?? 8,
  };
}

export function toCommunityReviewServiceConfig(
  config: Partial<CampsiteReviewConfig>,
): CampSiteReviewServiceConfig {
  return {
    approveQuorum: config.minTrustedApprovals,
    autoPublishCommunityApproved: config.autoPublishAfterCommunityQuorum,
    moderatorFinalApprovalRequired:
      typeof config.autoPublishAfterCommunityQuorum === 'boolean'
        ? !config.autoPublishAfterCommunityQuorum
        : undefined,
    triageWarningThreshold: config.triageWarningThreshold,
  };
}

export class CampsiteReviewService {
  constructor(
    private readonly backend: CampsiteReviewBackend,
    private readonly config: CampSiteReviewServiceConfig = {},
    private readonly notifications: CampsiteReviewNotificationService | null = null,
  ) {}

  private get effectiveConfig() {
    return mergeConfig(this.config);
  }

  private unavailable(): CampsiteServiceResult<never> | null {
    return this.backend.isAvailable()
      ? null
      : toServiceError('backend_unavailable', 'Campsite review backend is not configured.');
  }

  private async currentUser(): Promise<CampsiteServiceResult<ReviewAuthUser>> {
    const unavailable = this.unavailable();
    if (unavailable) return unavailable;
    const user = await this.backend.getCurrentUser();
    if (!user) return toServiceError('auth_required', 'Sign in to review campsite recommendations.');
    return { ok: true, data: user };
  }

  async startCommunityReview(
    campSiteReportId: string,
  ): Promise<CampsiteServiceResult<CampSiteReviewQueueItem>> {
    const userResult = await this.currentUser();
    if (!userResult.ok) return userResult;
    if (!isModeratorOrSystem(userResult.data)) {
      return toServiceError('admin_required', 'Only moderators or ECS system services can start community review.');
    }

    const reportResult = await this.backend.getReportById(campSiteReportId);
    if (!reportResult.ok) return reportResult;
    if (!isSubmittedForReview(reportResult.data)) {
      return toServiceError('validation_error', 'Campsite report is not ready for community review.');
    }
    if (typeof reportResult.data.triage_score !== 'number' || !reportResult.data.triage_summary) {
      return toServiceError('validation_error', 'Automated campsite triage must run before community review.');
    }

    const now = new Date().toISOString();
    const updated = await this.transitionReport(
      reportResult.data,
      {
        review_state: 'community_review',
        community_review_started_at: reportResult.data.community_review_started_at ?? now,
      },
      'community_review',
      userResult.data.id,
      { previous_state: reportResult.data.review_state ?? null },
    );
    if (!updated.ok) return updated;
    notifyWithoutBlocking(this.notifications?.notifyCommunityReviewStarted(updated.data));
    return { ok: true, data: reviewQueueItem(updated.data, [], [], userResult.data) };
  }

  async castReviewVote(
    campSiteReportId: string,
    voteInput: CampSiteReviewVoteInput,
  ): Promise<CampsiteServiceResult<{ vote: CampSiteReviewVote; outcome: CampSiteReviewOutcome }>> {
    const userResult = await this.currentUser();
    if (!userResult.ok) return userResult;
    const user = userResult.data;
    if (!isReviewPrivileged(user)) {
      return toServiceError('admin_required', 'Only trusted reviewers or moderators can vote on campsite recommendations.');
    }

    const reportResult = await this.backend.getReportById(campSiteReportId);
    if (!reportResult.ok) return reportResult;
    const report = reportResult.data;
    if (report.submitted_by_user_id === user.id) {
      return toServiceError('validation_error', 'You cannot review your own campsite submission.');
    }
    if (!canReceiveVote(report)) {
      return toServiceError('validation_error', 'Campsite report is not open for review voting.');
    }
    const eligibility = await this.checkReviewerEligibility(user, report);
    if (!eligibility.ok) return eligibility;

    const sanitizedNotes = sanitizeCampSiteReviewNotes(voteInput.reviewer_notes);
    const existing = await this.backend.getVoteForReviewer(campSiteReportId, user.id);
    if (!existing.ok) return existing;
    if (
      existing.data &&
      existing.data.vote === voteInput.vote &&
      existing.data.confidence === voteInput.confidence &&
      existing.data.reviewer_notes === sanitizedNotes
    ) {
      const outcome = await this.calculateCommunityReviewOutcome(campSiteReportId);
      if (!outcome.ok) return outcome;
      return { ok: true, data: { vote: existing.data, outcome: outcome.data } };
    }

    const eventType: CampSiteReviewEventType = existing.data ? 'vote_changed' : 'vote_added';
    const now = new Date().toISOString();
    const voteRecord = existing.data
      ? await this.backend.updateReviewVote(existing.data.id, {
          vote: voteInput.vote,
          confidence: voteInput.confidence,
          reviewer_notes: sanitizedNotes,
        })
      : await this.backend.insertReviewVote({
          camp_site_report_id: campSiteReportId,
          reviewer_user_id: user.id,
          vote: voteInput.vote,
          confidence: voteInput.confidence,
          reviewer_notes: sanitizedNotes,
        });
    if (!voteRecord.ok) return voteRecord;
    if (!existing.data) {
      const stats = await this.recordReviewerVoteStats(user.id);
      if (!stats.ok) return stats;
    }

    const voteValidation = validateCampSiteReviewVoteRecord(voteRecord.data);
    if (!voteValidation.ok) {
      return toServiceError('validation_error', 'Review vote is invalid.', voteValidation.errors);
    }

    const event = await this.insertEvent(campSiteReportId, user.id, eventType, {
      vote: voteInput.vote,
      confidence: voteInput.confidence,
      updated_at: now,
    });
    if (!event.ok) return event;
    if (voteInput.confidence === 'high' && isBlockingVote(voteInput.vote)) {
      notifyWithoutBlocking(
        this.notifications?.notifySensitiveVoteEscalation(report, voteInput.vote, voteInput.confidence),
      );
    }
    await this.auditApproveOnlyPattern(campSiteReportId, user.id);

    const outcome = await this.calculateCommunityReviewOutcome(campSiteReportId);
    if (!outcome.ok) return outcome;
    if (outcome.data.status !== 'pending') {
      const applied = await this.applyCommunityReviewOutcome(campSiteReportId, outcome.data);
      if (!applied.ok) return applied;
    }

    return { ok: true, data: { vote: voteRecord.data, outcome: outcome.data } };
  }

  async calculateCommunityReviewOutcome(
    campSiteReportId: string,
  ): Promise<CampsiteServiceResult<CampSiteReviewOutcome>> {
    const reportResult = await this.backend.getReportById(campSiteReportId);
    if (!reportResult.ok) return reportResult;
    const votesResult = await this.backend.listReviewVotes(campSiteReportId);
    if (!votesResult.ok) return votesResult;

    return {
      ok: true,
      data: this.calculateOutcomeFromData(reportResult.data, votesResult.data),
    };
  }

  async applyCommunityReviewOutcome(
    campSiteReportId: string,
    suppliedOutcome?: CampSiteReviewOutcome,
  ): Promise<CampsiteServiceResult<CampSiteReviewQueueItem>> {
    const userResult = await this.currentUser();
    if (!userResult.ok) return userResult;
    const user = userResult.data;
    if (!isReviewPrivileged(user)) {
      return toServiceError('admin_required', 'Only trusted reviewers or moderators can apply review outcomes.');
    }

    const reportResult = await this.backend.getReportById(campSiteReportId);
    if (!reportResult.ok) return reportResult;
    let outcome = suppliedOutcome;
    if (!outcome) {
      const votes = await this.backend.listReviewVotes(campSiteReportId);
      if (!votes.ok) return votes;
      outcome = this.calculateOutcomeFromData(reportResult.data, votes.data);
    }
    const now = new Date().toISOString();

    if (outcome.status === 'pending') {
      return { ok: true, data: reviewQueueItem(reportResult.data, [], [], user) };
    }

    if (outcome.status === 'needs_info') {
      const updated = await this.transitionReport(
        reportResult.data,
        {
          review_state: 'needs_submitter_info',
          moderation_status: 'needs_info',
          community_review_completed_at: reportResult.data.community_review_completed_at ?? now,
        },
        'needs_info_requested',
        user.id,
        { reason: outcome.reason },
      );
      if (!updated.ok) return updated;
      await this.updateReputationForFinalOutcome(reportResult.data.id, 'approved');
      notifyWithoutBlocking(this.notifications?.notifyNeedsInfo(updated.data, outcome.reason));
      return { ok: true, data: reviewQueueItem(updated.data, [], [], user) };
    }

    if (outcome.status === 'community_rejected') {
      const updated = await this.transitionReport(
        reportResult.data,
        {
          review_state: 'community_rejected',
          community_review_completed_at: reportResult.data.community_review_completed_at ?? now,
        },
        'community_rejected',
        user.id,
        { reason: outcome.reason },
      );
      if (!updated.ok) return updated;
      await this.updateReputationForFinalOutcome(reportResult.data.id, 'community_rejected');
      notifyWithoutBlocking(this.notifications?.notifyRejected(updated.data, outcome.reason));
      return { ok: true, data: reviewQueueItem(updated.data, [], [], user) };
    }

    if (outcome.status === 'moderator_review' || this.effectiveConfig.moderatorFinalApprovalRequired) {
      const updated = await this.transitionReport(
        reportResult.data,
        {
          review_state: 'moderator_review',
          moderator_review_started_at: reportResult.data.moderator_review_started_at ?? now,
          community_review_completed_at:
            reportResult.data.review_state === 'community_review'
              ? reportResult.data.community_review_completed_at ?? now
              : reportResult.data.community_review_completed_at,
        },
        outcome.status === 'community_approved' ? 'community_approved' : 'moderator_review',
        user.id,
        { reason: outcome.reason },
      );
      if (!updated.ok) return updated;
      notifyWithoutBlocking(this.notifications?.notifyModeratorReviewRequired(updated.data, outcome.reason));
      return { ok: true, data: reviewQueueItem(updated.data, [], [], user) };
    }

    if (outcome.status === 'community_approved') {
      if (!this.effectiveConfig.autoPublishCommunityApproved || !isModeratorOrSystem(user)) {
        const updated = await this.transitionReport(
          reportResult.data,
          {
            review_state: 'moderator_review',
            moderator_review_started_at: reportResult.data.moderator_review_started_at ?? now,
            community_review_completed_at: reportResult.data.community_review_completed_at ?? now,
          },
          'community_approved',
          user.id,
          { reason: 'Moderator approval required before publication.' },
        );
        if (!updated.ok) return updated;
        notifyWithoutBlocking(
          this.notifications?.notifyModeratorReviewRequired(
            updated.data,
            'Moderator approval required before publication.',
          ),
        );
        return { ok: true, data: reviewQueueItem(updated.data, [], [], user) };
      }

      const photoCount = await this.backend.countApprovedPhotosForReport?.(reportResult.data.id);
      const site = await this.backend.insertCampSite(
        buildCampSiteFromApprovedReport(reportResult.data, photoCount?.ok ? photoCount.data : 0),
      );
      if (!site.ok) return site;
      await this.backend.updatePhotosForReport?.(reportResult.data.id, {
        camp_site_id: site.data.id,
        moderation_status: 'approved',
      });
      const updated = await this.transitionReport(
        reportResult.data,
        {
          camp_site_id: site.data.id,
          review_state: 'approved',
          moderation_status: 'approved',
          community_review_completed_at: reportResult.data.community_review_completed_at ?? now,
          moderator_review_completed_at: reportResult.data.moderator_review_completed_at ?? now,
        },
        'published',
        user.id,
        { camp_site_id: site.data.id, reason: outcome.reason },
      );
      if (!updated.ok) return updated;
      notifyWithoutBlocking(this.notifications?.notifyApprovedPublished(updated.data, site.data.id));
      return { ok: true, data: reviewQueueItem(updated.data, [], [], user) };
    }

    return { ok: true, data: reviewQueueItem(reportResult.data, [], [], user) };
  }

  async listCommunityReviewQueue(limit = DEFAULT_LIST_LIMIT): Promise<CampsiteServiceResult<CampSiteReviewQueueItem[]>> {
    const userResult = await this.currentUser();
    if (!userResult.ok) return userResult;
    if (!isReviewPrivileged(userResult.data)) {
      return toServiceError('admin_required', 'Only trusted reviewers or moderators can view the community review queue.');
    }

    const reports = await this.backend.listCommunityReviewReports(Math.max(1, Math.min(DEFAULT_LIST_LIMIT, limit)));
    if (!reports.ok) return reports;
    const items: CampSiteReviewQueueItem[] = [];
    const visibleReports = userResult.data.isAdmin || userResult.data.isSystem
      ? reports.data
      : reports.data.filter((report) => report.review_state === 'community_review');
    for (const report of visibleReports) {
      const photos = await this.backend.listPhotosForReport?.(report.id);
      const nearby = await this.backend.listNearbyApprovedCampSites?.(report, 8);
      const votes = await this.backend.listReviewVotes(report.id);
      const landUse = await this.backend.getLatestLandUseReviewResult?.(report.id);
      items.push(
        reviewQueueItem(
          report,
          photos?.ok ? photos.data : [],
          nearby?.ok ? nearby.data : [],
          userResult.data,
          votes.ok ? voteSummary(votes.data) : undefined,
          landUse?.ok ? landUse.data : null,
        ),
      );
    }
    return { ok: true, data: items };
  }

  async getCommunityReviewReportDetails(
    campSiteReportId: string,
  ): Promise<CampsiteServiceResult<CampSiteReviewReportDetails>> {
    const userResult = await this.currentUser();
    if (!userResult.ok) return userResult;
    const user = userResult.data;
    if (!isReviewPrivileged(user)) {
      return toServiceError('admin_required', 'Only trusted reviewers or moderators can view review details.');
    }

    const report = await this.backend.getReportById(campSiteReportId);
    if (!report.ok) return report;
    const votes = await this.backend.listReviewVotes(campSiteReportId);
    if (!votes.ok) return votes;
    const events = await this.backend.listReviewEvents(campSiteReportId);
    if (!events.ok) return events;
    const photos = await this.backend.listPhotosForReport?.(campSiteReportId);
    const nearby = await this.backend.listNearbyApprovedCampSites?.(report.data, 8);
    const landUse = await this.backend.getLatestLandUseReviewResult?.(campSiteReportId);
    const myVote = votes.data.find((vote) => vote.reviewer_user_id === user.id) ?? null;
    return {
      ok: true,
      data: {
        ...reviewQueueItem(
          report.data,
          photos?.ok ? photos.data : [],
          nearby?.ok ? nearby.data : [],
          user,
          undefined,
          landUse?.ok ? landUse.data : null,
        ),
        vote_summary: voteSummary(votes.data),
        my_vote: myVote,
        reviewer_notes: user.isAdmin || user.isSystem ? votes.data : undefined,
        events: events.data,
      },
    };
  }

  async listReviewerProfiles(
    limit = DEFAULT_LIST_LIMIT,
  ): Promise<CampsiteServiceResult<CampSiteReviewerManagementItem[]>> {
    const userResult = await this.currentUser();
    if (!userResult.ok) return userResult;
    if (!isModeratorOrSystem(userResult.data)) {
      return toServiceError('admin_required', 'Only moderators can manage campsite reviewers.');
    }
    if (!this.backend.listReviewerProfiles) {
      return toServiceError('backend_unavailable', 'Reviewer management backend is not available.');
    }
    const profiles = await this.backend.listReviewerProfiles(Math.max(1, Math.min(DEFAULT_LIST_LIMIT, limit)));
    if (!profiles.ok) return profiles;
    const items: CampSiteReviewerManagementItem[] = [];
    for (const profile of profiles.data) {
      const recentVotes = await this.backend.listReviewerVotes?.(profile.user_id, 20);
      const audit = await this.backend.listReviewerAuditEvents?.(profile.user_id, 20);
      const approveOnlyRecent =
        recentVotes?.ok &&
        recentVotes.data.length >= this.effectiveConfig.approveOnlyAuditThreshold &&
        recentVotes.data.every((vote) => vote.vote === 'approve');
      items.push({
        ...profile,
        recent_votes: recentVotes?.ok ? recentVotes.data : [],
        audit_events: audit?.ok ? audit.data : [],
        approve_only_recent: approveOnlyRecent === true,
      });
    }
    return { ok: true, data: items };
  }

  async getReviewerDetails(
    reviewerUserId: string,
  ): Promise<CampsiteServiceResult<CampSiteReviewerManagementItem>> {
    const userResult = await this.currentUser();
    if (!userResult.ok) return userResult;
    if (!isModeratorOrSystem(userResult.data)) {
      return toServiceError('admin_required', 'Only moderators can view reviewer details.');
    }
    const profile = await this.backend.getReviewerProfile(reviewerUserId);
    if (!profile.ok) return profile;
    const resolvedProfile = profile.data ?? emptyReviewerProfile(reviewerUserId);
    const recentVotes = await this.backend.listReviewerVotes?.(reviewerUserId, 50);
    const audit = await this.backend.listReviewerAuditEvents?.(reviewerUserId, 50);
    return {
      ok: true,
      data: {
        ...resolvedProfile,
        recent_votes: recentVotes?.ok ? recentVotes.data : [],
        audit_events: audit?.ok ? audit.data : [],
        approve_only_recent:
          recentVotes?.ok === true &&
          recentVotes.data.length >= this.effectiveConfig.approveOnlyAuditThreshold &&
          recentVotes.data.every((vote) => vote.vote === 'approve'),
      },
    };
  }

  async promoteReviewer(
    reviewerUserId: string,
  ): Promise<CampsiteServiceResult<CampSiteReviewerProfile>> {
    return this.setReviewerStatus(reviewerUserId, 'trusted', 'reviewer_promoted');
  }

  async suspendReviewer(
    reviewerUserId: string,
    reason?: string | null,
  ): Promise<CampsiteServiceResult<CampSiteReviewerProfile>> {
    return this.setReviewerStatus(reviewerUserId, 'suspended', 'reviewer_suspended', { reason: reason ?? null });
  }

  private async checkReviewerEligibility(
    user: ReviewAuthUser,
    report: CampSiteReport,
  ): Promise<CampsiteServiceResult<true>> {
    const userId = user.id;
    const isModerator = isModeratorOrSystem(user);
    const profile = await this.backend.getReviewerProfile(userId);
    if (!profile.ok) return profile;
    if (profile.data?.reviewer_status === 'suspended') {
      await this.insertEvent(report.id, userId, 'review_abuse_flagged', {
        reason: 'suspended_reviewer_vote_attempt',
      });
      return toServiceError('admin_required', 'This reviewer is suspended and cannot vote.');
    }
    if (!isModerator && profile.data?.reviewer_status !== 'trusted') {
      return toServiceError('admin_required', 'Only trusted reviewers or moderators can vote on campsite recommendations.');
    }
    if (!isModerator && this.backend.listReviewerVotesSince) {
      const since = new Date(Date.now() - DEFAULT_REVIEW_RATE_WINDOW_MS).toISOString();
      const recentVotes = await this.backend.listReviewerVotesSince(userId, since);
      if (!recentVotes.ok) return recentVotes;
      if (recentVotes.data.length >= this.effectiveConfig.maxVotesPerHour) {
        await this.insertEvent(report.id, userId, 'review_abuse_flagged', {
          reason: 'review_rate_limit_exceeded',
          count: recentVotes.data.length,
          window_ms: DEFAULT_REVIEW_RATE_WINDOW_MS,
        });
        return toServiceError('validation_error', 'Review rate limit reached. Slow down before voting again.');
      }
    }
    return { ok: true, data: true };
  }

  private async recordReviewerVoteStats(reviewerUserId: string): Promise<CampsiteServiceResult<CampSiteReviewerProfile | null>> {
    if (!this.backend.updateReviewerProfile && !this.backend.upsertReviewerProfile) {
      return { ok: true, data: null };
    }
    const profile = await this.backend.getReviewerProfile(reviewerUserId);
    if (!profile.ok) return profile;
    const current = profile.data ?? emptyReviewerProfile(reviewerUserId);
    const changes: CampSiteReviewerProfileUpdate = {
      review_count: current.review_count + 1,
      reputation_score: scoreForProfile({
        ...current,
        review_count: current.review_count + 1,
      }),
    };
    return this.writeReviewerProfile(reviewerUserId, changes);
  }

  private async auditApproveOnlyPattern(reportId: string, reviewerUserId: string): Promise<void> {
    if (!this.backend.listReviewerVotes) return;
    const votes = await this.backend.listReviewerVotes(reviewerUserId, this.effectiveConfig.approveOnlyAuditThreshold);
    if (
      votes.ok &&
      votes.data.length >= this.effectiveConfig.approveOnlyAuditThreshold &&
      votes.data.every((vote) => vote.vote === 'approve')
    ) {
      await this.insertEvent(reportId, reviewerUserId, 'review_abuse_flagged', {
        reason: 'approve_only_pattern',
        recent_vote_count: votes.data.length,
      });
    }
  }

  private async updateReputationForFinalOutcome(
    reportId: string,
    finalState: CampSiteReportReviewState,
  ): Promise<void> {
    if (!this.backend.updateReviewerProfile && !this.backend.upsertReviewerProfile) return;
    const votes = await this.backend.listReviewVotes(reportId);
    if (!votes.ok) return;
    for (const vote of votes.data) {
      const profileResult = await this.backend.getReviewerProfile(vote.reviewer_user_id);
      if (!profileResult.ok) continue;
      const current = profileResult.data ?? emptyReviewerProfile(vote.reviewer_user_id);
      const alignment = voteAlignsWithFinalState(vote, finalState);
      const next = {
        ...current,
        helpful_review_count:
          alignment === 'aligned' ? current.helpful_review_count + 1 : current.helpful_review_count,
        rejected_review_count:
          alignment === 'conflicted' ? current.rejected_review_count + 1 : current.rejected_review_count,
      };
      const updated = await this.writeReviewerProfile(vote.reviewer_user_id, {
        helpful_review_count: next.helpful_review_count,
        rejected_review_count: next.rejected_review_count,
        reputation_score: scoreForProfile(next),
      });
      if (updated.ok) {
        await this.insertEvent(reportId, vote.reviewer_user_id, 'reputation_updated', {
          final_state: finalState,
          vote: vote.vote,
          confidence: vote.confidence,
          alignment,
        });
      }
    }
  }

  private async setReviewerStatus(
    reviewerUserId: string,
    reviewerStatus: CampSiteReviewerProfile['reviewer_status'],
    eventType: CampSiteReviewerAuditEventType,
    metadata: CampSiteJsonObject = {},
  ): Promise<CampsiteServiceResult<CampSiteReviewerProfile>> {
    const userResult = await this.currentUser();
    if (!userResult.ok) return userResult;
    if (!isModeratorOrSystem(userResult.data)) {
      return toServiceError('admin_required', 'Only moderators can manage campsite reviewers.');
    }
    const profile = await this.backend.getReviewerProfile(reviewerUserId);
    if (!profile.ok) return profile;
    const updated = await this.writeReviewerProfile(reviewerUserId, {
      reviewer_status: reviewerStatus,
      reputation_score: scoreForProfile({
        ...(profile.data ?? emptyReviewerProfile(reviewerUserId)),
        reviewer_status: reviewerStatus,
      }),
    });
    if (!updated.ok) return updated;
    if (!updated.data) {
      return toServiceError('backend_unavailable', 'Reviewer profile write backend is not available.');
    }
    await this.backend.insertReviewerAuditEvent?.({
      reviewer_user_id: reviewerUserId,
      actor_user_id: userResult.data.id,
      event_type: eventType,
      metadata: {
        ...metadata,
        reviewer_status: reviewerStatus,
      },
    });
    return { ok: true, data: updated.data };
  }

  private async writeReviewerProfile(
    reviewerUserId: string,
    changes: CampSiteReviewerProfileUpdate,
  ): Promise<CampsiteServiceResult<CampSiteReviewerProfile | null>> {
    if (this.backend.updateReviewerProfile) {
      const updated = await this.backend.updateReviewerProfile(reviewerUserId, changes);
      if (updated.ok || !this.backend.upsertReviewerProfile) return updated;
    }
    if (this.backend.upsertReviewerProfile) {
      return this.backend.upsertReviewerProfile(reviewerUserId, changes);
    }
    return { ok: true, data: null };
  }

  private calculateOutcomeFromData(
    report: CampSiteReport,
    votes: CampSiteReviewVote[],
  ): CampSiteReviewOutcome {
    const config = this.effectiveConfig;
    const summary = voteSummary(votes);
    const blockingVoteCount = summary.sensitive + summary.private_land + summary.closed_to_camping;
    const duplicateVoteCount = summary.duplicate;
    const hasConflict = summary.approve > 0 && votes.some((vote) => isConflictVote(vote.vote));
    const triageUnknown = report.triage_score == null;
    const triageWarning =
      typeof report.triage_score === 'number' && report.triage_score < config.triageWarningThreshold;
    const startedAt = report.community_review_started_at
      ? Date.parse(report.community_review_started_at)
      : NaN;
    const reviewExpired = Number.isFinite(startedAt) && Date.now() - startedAt > config.reviewSlaMs;

    const base = {
      approveCount: summary.approve,
      rejectCount: summary.reject,
      blockingVoteCount,
      duplicateVoteCount,
      totalVotes: votes.length,
      shouldPublish: false,
    };

    if (blockingVoteCount >= config.blockingQuorum) {
      return {
        ...base,
        status: 'community_rejected',
        reason: 'Multiple trusted reviewers flagged legal, sensitive, or closure risk.',
        shouldPublish: false,
      };
    }
    if (summary.needs_info > 0 && votes.length < config.approveQuorum) {
      return {
        ...base,
        status: 'needs_info',
        reason: 'Reviewer requested more information before this campsite can proceed.',
        shouldPublish: false,
      };
    }
    if (
      summary.highConfidenceBlocking > 0 ||
      duplicateVoteCount > 0 ||
      hasConflict ||
      triageUnknown ||
      triageWarning ||
      reviewExpired
    ) {
      return {
        ...base,
        status: 'moderator_review',
        reason: summary.highConfidenceBlocking > 0
          ? 'High-confidence sensitive, private-land, or closure risk requires moderator review.'
          : duplicateVoteCount > 0
            ? 'Possible duplicate requires moderator review.'
            : hasConflict
              ? 'Reviewer votes conflict and require moderator review.'
              : triageUnknown || triageWarning
                ? 'Triage confidence is unknown or below the review threshold.'
                : 'Community review exceeded the review SLA.',
        shouldPublish: false,
      };
    }
    if (summary.approve >= config.approveQuorum) {
      return {
        ...base,
        status: 'community_approved',
        reason: 'Trusted reviewer approve quorum reached.',
        shouldPublish: config.autoPublishCommunityApproved && !config.moderatorFinalApprovalRequired,
      };
    }
    return {
      ...base,
      status: 'pending',
      reason: 'Trusted reviewer quorum has not been reached.',
      shouldPublish: false,
    };
  }

  private async transitionReport(
    report: CampSiteReport,
    changes: Partial<CampSiteReport>,
    eventType: CampSiteReviewEventType,
    actorUserId: string | null,
    metadata: CampSiteJsonObject,
  ): Promise<CampsiteServiceResult<CampSiteReport>> {
    if (
      changes.review_state &&
      report.review_state &&
      !canTransitionCampSiteReportReviewState(report.review_state, changes.review_state)
    ) {
      return toServiceError(
        'validation_error',
        `Invalid campsite review transition: ${report.review_state} -> ${changes.review_state}.`,
      );
    }
    const updated = await this.backend.updateReport(report.id, changes);
    if (!updated.ok) return updated;
    const event = await this.insertEvent(report.id, actorUserId, eventType, {
      ...metadata,
      from_review_state: report.review_state ?? null,
      to_review_state: changes.review_state ?? report.review_state ?? null,
    });
    if (!event.ok) return event;
    return updated;
  }

  private async insertEvent(
    reportId: string,
    actorUserId: string | null,
    eventType: CampSiteReviewEventType,
    metadata: CampSiteJsonObject,
  ): Promise<CampsiteServiceResult<CampSiteReviewEvent>> {
    const row: CampSiteReviewEventInsert = {
      camp_site_report_id: reportId,
      actor_user_id: actorUserId,
      event_type: eventType,
      metadata,
    };
    const event = await this.backend.insertReviewEvent(row);
    if (!event.ok) return event;
    const validation = validateCampSiteReviewEventRecord(event.data);
    if (!validation.ok) {
      return toServiceError('validation_error', 'Review event is invalid.', validation.errors);
    }
    return event;
  }
}

export function createSupabaseCampsiteReviewBackend(
  client: SupabaseClient = supabase,
): CampsiteReviewBackend {
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
      const reviewerResult = (await client
        .from(CAMP_SITE_REVIEWER_PROFILES_TABLE)
        .select('reviewer_status')
        .eq('user_id', userId)
        .maybeSingle()) as SupabaseResponse<{ reviewer_status?: string | null }>;

      return {
        id: userId,
        isAdmin:
          operatorResult.data?.role === 'super_admin' &&
          operatorResult.data?.status === 'active',
        isTrustedReviewer: reviewerResult.data?.reviewer_status === 'trusted',
      };
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

    async insertCampSite(row) {
      const result = (await client
        .from(CAMP_SITES_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<CampSite>;
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

    async countApprovedPhotosForReport(reportId) {
      const result = (await client
        .from(CAMP_SITE_PHOTOS_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('camp_site_report_id', reportId)
        .eq('moderation_status', 'approved')) as SupabaseResponse<null>;
      if (result.error) return mapBackendError(result.error);
      return { ok: true, data: result.count ?? 0 };
    },

    async getReviewerProfile(userId) {
      const result = (await client
        .from(CAMP_SITE_REVIEWER_PROFILES_TABLE)
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()) as SupabaseResponse<CampSiteReviewerProfile>;
      if (result.error) return mapBackendError(result.error);
      return { ok: true, data: result.data ?? null };
    },

    async upsertReviewerProfile(userId, changes) {
      const now = new Date().toISOString();
      const result = (await client
        .from(CAMP_SITE_REVIEWER_PROFILES_TABLE)
        .upsert(
          {
            user_id: userId,
            reviewer_status: changes.reviewer_status ?? 'none',
            review_region: changes.review_region ?? null,
            review_count: changes.review_count ?? 0,
            helpful_review_count: changes.helpful_review_count ?? 0,
            rejected_review_count: changes.rejected_review_count ?? 0,
            reputation_score: changes.reputation_score ?? 0,
            updated_at: now,
          },
          { onConflict: 'user_id' },
        )
        .select('*')
        .single()) as SupabaseResponse<CampSiteReviewerProfile>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async updateReviewerProfile(userId, changes) {
      const result = (await client
        .from(CAMP_SITE_REVIEWER_PROFILES_TABLE)
        .update(changes)
        .eq('user_id', userId)
        .select('*')
        .maybeSingle()) as SupabaseResponse<CampSiteReviewerProfile>;
      if (result.error) return mapBackendError(result.error);
      if (result.data) return { ok: true, data: result.data };
      return this.upsertReviewerProfile
        ? this.upsertReviewerProfile(userId, changes)
        : toServiceError('not_found', 'Reviewer profile was not found.');
    },

    async listReviewerProfiles(limit) {
      const result = (await client
        .from(CAMP_SITE_REVIEWER_PROFILES_TABLE)
        .select('*')
        .order('reputation_score', { ascending: false })
        .limit(limit)) as SupabaseResponse<CampSiteReviewerProfile[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async getVoteForReviewer(reportId, reviewerUserId) {
      const result = (await client
        .from(CAMP_SITE_REVIEW_VOTES_TABLE)
        .select('*')
        .eq('camp_site_report_id', reportId)
        .eq('reviewer_user_id', reviewerUserId)
        .maybeSingle()) as SupabaseResponse<CampSiteReviewVote>;
      if (result.error) return mapBackendError(result.error);
      return { ok: true, data: result.data ?? null };
    },

    async insertReviewVote(row) {
      const result = (await client
        .from(CAMP_SITE_REVIEW_VOTES_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<CampSiteReviewVote>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async updateReviewVote(voteId, changes) {
      const result = (await client
        .from(CAMP_SITE_REVIEW_VOTES_TABLE)
        .update(changes)
        .eq('id', voteId)
        .select('*')
        .single()) as SupabaseResponse<CampSiteReviewVote>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async listReviewVotes(reportId) {
      const result = (await client
        .from(CAMP_SITE_REVIEW_VOTES_TABLE)
        .select('*')
        .eq('camp_site_report_id', reportId)
        .order('updated_at', { ascending: true })) as SupabaseResponse<CampSiteReviewVote[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async listReviewerVotes(reviewerUserId, limit) {
      const result = (await client
        .from(CAMP_SITE_REVIEW_VOTES_TABLE)
        .select('*')
        .eq('reviewer_user_id', reviewerUserId)
        .order('updated_at', { ascending: false })
        .limit(limit)) as SupabaseResponse<CampSiteReviewVote[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async listReviewerVotesSince(reviewerUserId, sinceIso) {
      const result = (await client
        .from(CAMP_SITE_REVIEW_VOTES_TABLE)
        .select('*')
        .eq('reviewer_user_id', reviewerUserId)
        .gte('updated_at', sinceIso)
        .order('updated_at', { ascending: false })) as SupabaseResponse<CampSiteReviewVote[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async insertReviewEvent(row) {
      const result = (await client
        .from(CAMP_SITE_REVIEW_EVENTS_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<CampSiteReviewEvent>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async listReviewEvents(reportId) {
      const result = (await client
        .from(CAMP_SITE_REVIEW_EVENTS_TABLE)
        .select('*')
        .eq('camp_site_report_id', reportId)
        .order('created_at', { ascending: true })) as SupabaseResponse<CampSiteReviewEvent[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async insertReviewerAuditEvent(row) {
      const result = (await client
        .from(CAMP_SITE_REVIEWER_AUDIT_EVENTS_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<CampSiteReviewerAuditEvent>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async listReviewerAuditEvents(reviewerUserId, limit) {
      const result = (await client
        .from(CAMP_SITE_REVIEWER_AUDIT_EVENTS_TABLE)
        .select('*')
        .eq('reviewer_user_id', reviewerUserId)
        .order('created_at', { ascending: false })
        .limit(limit)) as SupabaseResponse<CampSiteReviewerAuditEvent[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async listCommunityReviewReports(limit) {
      const result = (await client
        .from(CAMP_SITE_REPORTS_TABLE)
        .select('*')
        .eq('visibility_requested', 'community')
        .in('review_state', ['community_review', 'moderator_review'])
        .order('community_review_started_at', { ascending: true, nullsFirst: false })
        .limit(limit)) as SupabaseResponse<CampSiteReport[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
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

    async listNearbyApprovedCampSites(report, limit) {
      const delta = 0.03;
      const result = (await client
        .from(CAMP_SITES_TABLE)
        .select('*')
        .eq('status', 'approved')
        .eq('visibility', 'community')
        .gte('latitude', report.latitude - delta)
        .lte('latitude', report.latitude + delta)
        .gte('longitude', report.longitude - delta)
        .lte('longitude', report.longitude + delta)
        .limit(limit)) as SupabaseResponse<CampSite[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async getLatestLandUseReviewResult(reportId) {
      const result = (await client
        .from(LAND_USE_REVIEW_RESULTS_TABLE)
        .select('*')
        .eq('camp_site_report_id', reportId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()) as SupabaseResponse<LandUseReviewResult>;
      if (result.error) return mapBackendError(result.error);
      return { ok: true, data: result.data ?? null };
    },
  };
}

export const campsiteReviewService = new CampsiteReviewService(
  createSupabaseCampsiteReviewBackend(),
  {},
  campsiteReviewNotificationService,
);
