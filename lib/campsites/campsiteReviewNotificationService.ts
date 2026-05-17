import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../supabase';
import type {
  CampSite,
  CampSiteJsonObject,
  CampSiteReport,
  CampSiteReviewConfidence,
  CampSiteReviewVoteValue,
} from './campsiteRecommendationTypes';
import type { CampsiteServiceErrorCode, CampsiteServiceResult } from './campsiteRecommendationService';

const CAMP_SITE_REVIEW_NOTIFICATIONS_TABLE = 'camp_site_review_notifications';
const CAMP_SITE_REVIEWER_PROFILES_TABLE = 'camp_site_reviewer_profiles';
const HIGH_FLAG_COUNT_THRESHOLD = 3;

export const CAMP_SITE_REVIEW_NOTIFICATION_TYPES = [
  'community_submission_received',
  'community_review_started',
  'needs_info_requested',
  'approved_published',
  'rejected',
  'merged',
  'withdrawn',
  'new_review_ready',
  'moderator_review_required',
  'blocked_triage',
  'sensitive_vote_escalation',
  'high_flag_count',
] as const;
export type CampSiteReviewNotificationType = (typeof CAMP_SITE_REVIEW_NOTIFICATION_TYPES)[number];

export const CAMP_SITE_REVIEW_NOTIFICATION_AUDIENCES = [
  'submitter',
  'trusted_reviewer',
  'moderator',
] as const;
export type CampSiteReviewNotificationAudience =
  (typeof CAMP_SITE_REVIEW_NOTIFICATION_AUDIENCES)[number];

export const CAMP_SITE_REVIEW_NOTIFICATION_LINK_TARGETS = [
  'my_campsite_submission',
  'community_campsite_review',
  'campsite_reviewer_management',
  'community_campsite_detail',
] as const;
export type CampSiteReviewNotificationLinkTarget =
  (typeof CAMP_SITE_REVIEW_NOTIFICATION_LINK_TARGETS)[number];

export interface CampSiteReviewNotification {
  id: string;
  recipient_user_id: string;
  audience: CampSiteReviewNotificationAudience;
  type: CampSiteReviewNotificationType;
  camp_site_report_id: string | null;
  camp_site_id: string | null;
  title: string;
  body: string;
  link_target: CampSiteReviewNotificationLinkTarget;
  link_params: CampSiteJsonObject;
  read_at: string | null;
  created_at: string;
}

export type CampSiteReviewNotificationInsert = Omit<
  CampSiteReviewNotification,
  'id' | 'read_at' | 'created_at'
>;

export interface CampSiteReviewNotificationBackend {
  isAvailable(): boolean;
  insertNotification(
    row: CampSiteReviewNotificationInsert,
  ): Promise<CampsiteServiceResult<CampSiteReviewNotification>>;
  listTrustedReviewerUserIds?(): Promise<CampsiteServiceResult<string[]>>;
  listModeratorUserIds?(): Promise<CampsiteServiceResult<string[]>>;
  listNotificationsForUser?(
    userId: string,
    limit: number,
  ): Promise<CampsiteServiceResult<CampSiteReviewNotification[]>>;
}

type SupabaseResponse<T> = {
  data: T | null;
  error: { message?: string } | null;
};

function toServiceError<T = never>(
  code: CampsiteServiceErrorCode,
  error: string,
  details?: string[],
): CampsiteServiceResult<T> {
  return { ok: false, code, error, details };
}

function mapBackendError(error: { message?: string } | null | undefined): CampsiteServiceResult<never> {
  return toServiceError('backend_error', error?.message ?? 'Campsite notification backend request failed.');
}

function uniqueUserIds(userIds: string[]): string[] {
  return Array.from(new Set(userIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())));
}

function reportLink(report: CampSiteReport): CampSiteJsonObject {
  return { reportId: report.id };
}

function reviewLink(report: CampSiteReport): CampSiteJsonObject {
  return { reportId: report.id, queue: report.review_state ?? 'community_review' };
}

function siteLink(campSiteId: string | null | undefined, reportId?: string): CampSiteJsonObject {
  return campSiteId ? { campSiteId } : reportId ? { reportId } : {};
}

async function swallowNotification(result: Promise<CampsiteServiceResult<unknown>>): Promise<void> {
  try {
    await result;
  } catch {
    // Notifications are operationally useful but must not block review state transitions.
  }
}

export class CampsiteReviewNotificationService {
  constructor(private readonly backend: CampSiteReviewNotificationBackend | null) {}

  private available(): boolean {
    return Boolean(this.backend?.isAvailable());
  }

  private async notifyMany(
    recipientUserIds: string[],
    row: Omit<CampSiteReviewNotificationInsert, 'recipient_user_id'>,
  ): Promise<CampsiteServiceResult<CampSiteReviewNotification[]>> {
    if (!this.available() || !this.backend) {
      return toServiceError('backend_unavailable', 'Campsite notification backend is not configured.');
    }
    const notifications: CampSiteReviewNotification[] = [];
    for (const recipient_user_id of uniqueUserIds(recipientUserIds)) {
      const inserted = await this.backend.insertNotification({ ...row, recipient_user_id });
      if (!inserted.ok) return inserted;
      notifications.push(inserted.data);
    }
    return { ok: true, data: notifications };
  }

  async listNotificationsForUser(
    userId: string,
    limit = 50,
  ): Promise<CampsiteServiceResult<CampSiteReviewNotification[]>> {
    if (!this.available() || !this.backend?.listNotificationsForUser) {
      return toServiceError('backend_unavailable', 'Campsite notification backend is not configured.');
    }
    return this.backend.listNotificationsForUser(userId, Math.max(1, Math.min(100, Math.floor(limit))));
  }

  notifyCommunitySubmissionReceived(report: CampSiteReport): Promise<CampsiteServiceResult<CampSiteReviewNotification[]>> {
    return this.notifyMany([report.submitted_by_user_id], {
      audience: 'submitter',
      type: 'community_submission_received',
      camp_site_report_id: report.id,
      camp_site_id: report.camp_site_id,
      title: 'Submitted for ECS review',
      body: 'Your campsite submission was received. It is pending review and is not visible to the community yet.',
      link_target: 'my_campsite_submission',
      link_params: reportLink(report),
    });
  }

  async notifyCommunityReviewStarted(report: CampSiteReport): Promise<CampsiteServiceResult<CampSiteReviewNotification[]>> {
    const submitter = await this.notifyMany([report.submitted_by_user_id], {
      audience: 'submitter',
      type: 'community_review_started',
      camp_site_report_id: report.id,
      camp_site_id: report.camp_site_id,
      title: 'Community review started',
      body: 'Your campsite is now being reviewed by trusted ECS reviewers. It is not public yet.',
      link_target: 'my_campsite_submission',
      link_params: reportLink(report),
    });
    if (!submitter.ok) return submitter;

    const reviewerIds = await this.backend?.listTrustedReviewerUserIds?.();
    if (!reviewerIds?.ok || reviewerIds.data.length === 0) return submitter;
    const reviewers = await this.notifyMany(reviewerIds.data, {
      audience: 'trusted_reviewer',
      type: 'new_review_ready',
      camp_site_report_id: report.id,
      camp_site_id: report.camp_site_id,
      title: 'New campsite ready for review',
      body: 'A community campsite submission is ready for trusted review.',
      link_target: 'community_campsite_review',
      link_params: reviewLink(report),
    });
    if (!reviewers.ok) return reviewers;
    return { ok: true, data: [...submitter.data, ...reviewers.data] };
  }

  notifyNeedsInfo(report: CampSiteReport, reason?: string): Promise<CampsiteServiceResult<CampSiteReviewNotification[]>> {
    return this.notifyMany([report.submitted_by_user_id], {
      audience: 'submitter',
      type: 'needs_info_requested',
      camp_site_report_id: report.id,
      camp_site_id: report.camp_site_id,
      title: 'Campsite needs more information',
      body: reason
        ? `Reviewers need more information before they can continue: ${reason}`
        : 'Reviewers need more information before they can continue.',
      link_target: 'my_campsite_submission',
      link_params: reportLink(report),
    });
  }

  notifyApprovedPublished(
    report: CampSiteReport,
    campSiteId?: string | null,
  ): Promise<CampsiteServiceResult<CampSiteReviewNotification[]>> {
    return this.notifyMany([report.submitted_by_user_id], {
      audience: 'submitter',
      type: 'approved_published',
      camp_site_report_id: report.id,
      camp_site_id: campSiteId ?? report.camp_site_id,
      title: 'Campsite approved',
      body: 'This campsite is now visible on the ECS Community Campsites layer.',
      link_target: campSiteId || report.camp_site_id ? 'community_campsite_detail' : 'my_campsite_submission',
      link_params: siteLink(campSiteId ?? report.camp_site_id, report.id),
    });
  }

  notifyRejected(report: CampSiteReport, reason?: string | null): Promise<CampsiteServiceResult<CampSiteReviewNotification[]>> {
    return this.notifyMany([report.submitted_by_user_id], {
      audience: 'submitter',
      type: 'rejected',
      camp_site_report_id: report.id,
      camp_site_id: report.camp_site_id,
      title: 'Campsite not published',
      body: reason ? `This campsite was not published: ${reason}` : 'This campsite was not published.',
      link_target: 'my_campsite_submission',
      link_params: reportLink(report),
    });
  }

  notifyMerged(
    report: CampSiteReport,
    campSiteId?: string | null,
  ): Promise<CampsiteServiceResult<CampSiteReviewNotification[]>> {
    return this.notifyMany([report.submitted_by_user_id], {
      audience: 'submitter',
      type: 'merged',
      camp_site_report_id: report.id,
      camp_site_id: campSiteId ?? report.camp_site_id,
      title: 'Campsite merged',
      body: 'Your submission was merged with an existing ECS community campsite.',
      link_target: campSiteId || report.camp_site_id ? 'community_campsite_detail' : 'my_campsite_submission',
      link_params: siteLink(campSiteId ?? report.camp_site_id, report.id),
    });
  }

  notifyWithdrawn(report: CampSiteReport): Promise<CampsiteServiceResult<CampSiteReviewNotification[]>> {
    return this.notifyMany([report.submitted_by_user_id], {
      audience: 'submitter',
      type: 'withdrawn',
      camp_site_report_id: report.id,
      camp_site_id: report.camp_site_id,
      title: 'Submission withdrawn',
      body: 'Your campsite submission was withdrawn and is no longer in community review.',
      link_target: 'my_campsite_submission',
      link_params: reportLink(report),
    });
  }

  async notifyModeratorReviewRequired(
    report: CampSiteReport,
    reason?: string,
  ): Promise<CampsiteServiceResult<CampSiteReviewNotification[]>> {
    const moderatorIds = await this.backend?.listModeratorUserIds?.();
    if (!moderatorIds?.ok) {
      return toServiceError('backend_unavailable', 'Moderator notification recipients are not available.');
    }
    return this.notifyMany(moderatorIds.data, {
      audience: 'moderator',
      type: 'moderator_review_required',
      camp_site_report_id: report.id,
      camp_site_id: report.camp_site_id,
      title: 'Moderator review required',
      body: reason ? `A campsite submission needs moderator review: ${reason}` : 'A campsite submission needs moderator review.',
      link_target: 'community_campsite_review',
      link_params: reviewLink(report),
    });
  }

  async notifyBlockedTriage(
    report: CampSiteReport,
    reason?: string,
  ): Promise<CampsiteServiceResult<CampSiteReviewNotification[]>> {
    const moderatorIds = await this.backend?.listModeratorUserIds?.();
    if (!moderatorIds?.ok) {
      return toServiceError('backend_unavailable', 'Moderator notification recipients are not available.');
    }
    return this.notifyMany(moderatorIds.data, {
      audience: 'moderator',
      type: 'blocked_triage',
      camp_site_report_id: report.id,
      camp_site_id: report.camp_site_id,
      title: 'Campsite triage blocked',
      body: reason ? `Automated triage blocked a campsite submission: ${reason}` : 'Automated triage blocked a campsite submission.',
      link_target: 'community_campsite_review',
      link_params: reviewLink(report),
    });
  }

  async notifySensitiveVoteEscalation(
    report: CampSiteReport,
    vote: CampSiteReviewVoteValue,
    confidence: CampSiteReviewConfidence,
  ): Promise<CampsiteServiceResult<CampSiteReviewNotification[]>> {
    const moderatorIds = await this.backend?.listModeratorUserIds?.();
    if (!moderatorIds?.ok) {
      return toServiceError('backend_unavailable', 'Moderator notification recipients are not available.');
    }
    return this.notifyMany(moderatorIds.data, {
      audience: 'moderator',
      type: 'sensitive_vote_escalation',
      camp_site_report_id: report.id,
      camp_site_id: report.camp_site_id,
      title: 'Review escalation',
      body: `A ${confidence}-confidence ${vote.replace(/_/g, ' ')} vote requires moderator attention.`,
      link_target: 'community_campsite_review',
      link_params: reviewLink(report),
    });
  }

  async notifyHighFlagCount(
    campSite: Pick<CampSite, 'id' | 'flag_count'>,
    threshold = HIGH_FLAG_COUNT_THRESHOLD,
  ): Promise<CampsiteServiceResult<CampSiteReviewNotification[]>> {
    if (campSite.flag_count < threshold) return { ok: true, data: [] };
    const moderatorIds = await this.backend?.listModeratorUserIds?.();
    if (!moderatorIds?.ok) {
      return toServiceError('backend_unavailable', 'Moderator notification recipients are not available.');
    }
    return this.notifyMany(moderatorIds.data, {
      audience: 'moderator',
      type: 'high_flag_count',
      camp_site_report_id: null,
      camp_site_id: campSite.id,
      title: 'Campsite flag threshold reached',
      body: 'A published campsite has accumulated multiple flags and may need moderator review.',
      link_target: 'community_campsite_detail',
      link_params: siteLink(campSite.id),
    });
  }

  async notifyPublishedCampsiteReviewRequired(
    campSite: Pick<CampSite, 'id' | 'flag_count'>,
    reason: string,
  ): Promise<CampsiteServiceResult<CampSiteReviewNotification[]>> {
    const moderatorIds = await this.backend?.listModeratorUserIds?.();
    if (!moderatorIds?.ok) {
      return toServiceError('backend_unavailable', 'Moderator notification recipients are not available.');
    }
    return this.notifyMany(moderatorIds.data, {
      audience: 'moderator',
      type: 'high_flag_count',
      camp_site_report_id: null,
      camp_site_id: campSite.id,
      title: 'Published campsite needs review',
      body: reason,
      link_target: 'community_campsite_detail',
      link_params: siteLink(campSite.id),
    });
  }
}

export function notifyWithoutBlocking(
  notificationPromise: Promise<CampsiteServiceResult<unknown>> | null | undefined,
): void {
  if (notificationPromise) void swallowNotification(notificationPromise);
}

export function createSupabaseCampsiteReviewNotificationBackend(
  client: SupabaseClient = supabase,
): CampSiteReviewNotificationBackend {
  return {
    isAvailable() {
      return isSupabaseConfigured;
    },

    async insertNotification(row) {
      const result = (await client
        .from(CAMP_SITE_REVIEW_NOTIFICATIONS_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<CampSiteReviewNotification>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async listTrustedReviewerUserIds() {
      const result = (await client
        .from(CAMP_SITE_REVIEWER_PROFILES_TABLE)
        .select('user_id')
        .eq('reviewer_status', 'trusted')) as SupabaseResponse<{ user_id: string }[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: uniqueUserIds(result.data.map((profile) => profile.user_id)) };
    },

    async listModeratorUserIds() {
      const result = (await client
        .from('operators')
        .select('user_id')
        .eq('role', 'super_admin')
        .eq('status', 'active')) as SupabaseResponse<{ user_id: string }[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: uniqueUserIds(result.data.map((operator) => operator.user_id)) };
    },

    async listNotificationsForUser(userId, limit) {
      const result = (await client
        .from(CAMP_SITE_REVIEW_NOTIFICATIONS_TABLE)
        .select('*')
        .eq('recipient_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)) as SupabaseResponse<CampSiteReviewNotification[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },
  };
}

export const campsiteReviewNotificationService = new CampsiteReviewNotificationService(
  createSupabaseCampsiteReviewNotificationBackend(),
);
