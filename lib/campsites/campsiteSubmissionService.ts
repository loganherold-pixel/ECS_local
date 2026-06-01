import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../supabase';
import {
  type CampSiteJsonObject,
  type CampSiteReport,
  type CampSiteReportReviewState,
  type CampSiteReviewEvent,
  type CampSiteReviewEventType,
  canTransitionCampSiteReportReviewState,
  validateCampSiteReviewEventRecord,
} from './campsiteRecommendationTypes';
import {
  type CampSiteReportResponse,
  type CampsiteServiceResult,
  sanitizeCampSiteNotes,
} from './campsiteRecommendationService';
import {
  campsiteReviewNotificationService,
  notifyWithoutBlocking,
  type CampsiteReviewNotificationService,
} from './campsiteReviewNotificationService';

const CAMP_SITE_REPORTS_TABLE = 'camp_site_reports';
const CAMP_SITE_REVIEW_EVENTS_TABLE = 'camp_site_review_events';
const DEFAULT_LIST_LIMIT = 100;

type SubmitterAuthUser = {
  id: string;
};

type CampSiteReviewEventInsert = Omit<
  CampSiteReviewEvent,
  'id' | 'created_at' | 'deleted_at' | 'dirty'
>;

export type CampSiteSubmitterVisibleEvent = Omit<
  CampSiteReviewEvent,
  'actor_user_id' | 'dirty' | 'deleted_at'
>;

export type CampsiteSubmissionUpdateInput = {
  notes?: string | null;
  amenities?: CampSiteJsonObject;
  conditions?: CampSiteJsonObject;
  visited_at?: string | null;
  vehicle_fit?: string[];
  stewardship_acknowledged?: boolean;
  sensitive_area_acknowledged?: boolean;
  photos?: unknown[];
};

export type MyCampsiteSubmission = CampSiteReportResponse & {
  events: CampSiteSubmitterVisibleEvent[];
  statusLabel: string;
  statusCopy: string;
  correctionRequest: string | null;
  canEdit: boolean;
  canWithdraw: boolean;
  canRespondToNeedsInfo: boolean;
  canSubmitToCommunity: boolean;
};

export interface CampsiteSubmissionBackend {
  isAvailable(): boolean;
  getCurrentUser(): Promise<SubmitterAuthUser | null>;
  listReportsByUser(userId: string, limit: number): Promise<CampsiteServiceResult<CampSiteReport[]>>;
  getReportById(reportId: string): Promise<CampsiteServiceResult<CampSiteReport>>;
  updateReport(
    reportId: string,
    changes: Partial<CampSiteReport>,
  ): Promise<CampsiteServiceResult<CampSiteReport>>;
  insertReviewEvent(row: CampSiteReviewEventInsert): Promise<CampsiteServiceResult<CampSiteReviewEvent>>;
  listReviewEvents(reportId: string): Promise<CampsiteServiceResult<CampSiteReviewEvent[]>>;
}

type SupabaseResponse<T> = {
  data: T | null;
  error: { message?: string } | null;
};

const ALLOWED_SUBMITTER_UPDATE_FIELDS = new Set([
  'notes',
  'amenities',
  'conditions',
  'visited_at',
  'vehicle_fit',
  'stewardship_acknowledged',
  'sensitive_area_acknowledged',
  'photos',
]);

function toServiceError<T = never>(
  code: 'auth_required' | 'permission_denied' | 'validation_error' | 'not_found' | 'backend_unavailable' | 'backend_error',
  error: string,
  details?: string[],
): CampsiteServiceResult<T> {
  return { ok: false, code, error, details };
}

function mapBackendError(error: { message?: string } | null | undefined): CampsiteServiceResult<never> {
  return toServiceError('backend_error', error?.message ?? 'Campsite submission backend request failed.');
}

function omitReportPii(report: CampSiteReport): CampSiteReportResponse {
  const { submitted_by_user_id: _submitter, dirty: _dirty, deleted_at: _deleted, ...safe } = report;
  return safe;
}

function omitEventPii(event: CampSiteReviewEvent): CampSiteSubmitterVisibleEvent {
  const { actor_user_id: _actor, dirty: _dirty, deleted_at: _deleted, ...safe } = event;
  return safe;
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

function reportState(report: CampSiteReport): CampSiteReportReviewState {
  return report.review_state ?? (report.visibility_requested === 'community' ? 'submitted' : 'private_saved');
}

function isApprovedOrPublished(state: CampSiteReportReviewState): boolean {
  return state === 'approved' || state === 'merged' || state === 'hidden' || state === 'archived';
}

function canEditSubmission(report: CampSiteReport): boolean {
  const state = reportState(report);
  return ['private_saved', 'submitted', 'community_review', 'moderator_review', 'needs_submitter_info'].includes(state);
}

function canWithdrawSubmission(report: CampSiteReport): boolean {
  const state = reportState(report);
  return !isApprovedOrPublished(state) && state !== 'rejected' && state !== 'community_rejected' && state !== 'withdrawn';
}

function statusCopyForState(state: CampSiteReportReviewState): { label: string; copy: string } {
  switch (state) {
    case 'private_saved':
      return { label: 'Private save', copy: 'Only you can see this campsite.' };
    case 'needs_submitter_info':
      return {
        label: 'Needs info',
        copy: 'Needs more information before reviewers can continue.',
      };
    case 'approved':
      return { label: 'Approved', copy: 'Approved and published' };
    case 'rejected':
    case 'community_rejected':
      return { label: 'Rejected', copy: 'This campsite was not published.' };
    case 'withdrawn':
      return { label: 'Withdrawn', copy: 'Withdrawn submission' };
    case 'merged':
      return { label: 'Merged', copy: 'Merged with an existing campsite.' };
    default:
      return {
        label: 'Pending review',
        copy: 'Pending review — not visible to the community.',
      };
  }
}

function latestNeedsInfoRequest(events: CampSiteReviewEvent[]): string | null {
  const request = [...events].reverse().find((event) => event.event_type === 'needs_info_requested');
  if (!request) return null;
  const metadata = request.metadata ?? {};
  const reason = metadata.reason ?? metadata.message ?? metadata.request;
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}

function buildSubmission(report: CampSiteReport, events: CampSiteReviewEvent[]): MyCampsiteSubmission {
  const state = reportState(report);
  const status = statusCopyForState(state);
  return {
    ...omitReportPii(report),
    events: events.map(omitEventPii),
    statusLabel: status.label,
    statusCopy: status.copy,
    correctionRequest: state === 'needs_submitter_info' ? latestNeedsInfoRequest(events) : null,
    canEdit: canEditSubmission(report),
    canWithdraw: canWithdrawSubmission(report),
    canRespondToNeedsInfo: state === 'needs_submitter_info',
    canSubmitToCommunity: state === 'private_saved',
  };
}

function sanitizeUpdateInput(input: CampsiteSubmissionUpdateInput): {
  changes: Partial<CampSiteReport>;
  changedFields: string[];
  errors: string[];
} {
  const errors: string[] = [];
  const changedFields: string[] = [];
  const changes: Partial<CampSiteReport> = {};

  for (const key of Object.keys(input)) {
    if (!ALLOWED_SUBMITTER_UPDATE_FIELDS.has(key)) {
      errors.push(`${key} cannot be changed by submitters`);
    }
  }
  if (errors.length > 0) return { changes, changedFields, errors };

  if (Object.prototype.hasOwnProperty.call(input, 'notes')) {
    changes.notes = sanitizeCampSiteNotes(input.notes);
    changedFields.push('notes');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'amenities')) {
    changes.amenities = normalizeJsonObject(input.amenities);
    changedFields.push('amenities');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'conditions')) {
    changes.conditions = normalizeJsonObject(input.conditions);
    changedFields.push('conditions');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'visited_at')) {
    changes.visited_at = typeof input.visited_at === 'string' && input.visited_at.trim() ? input.visited_at : null;
    changedFields.push('visited_at');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'vehicle_fit')) {
    changes.vehicle_fit = normalizeVehicleFit(input.vehicle_fit);
    changedFields.push('vehicle_fit');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'stewardship_acknowledged')) {
    changes.stewardship_acknowledged = input.stewardship_acknowledged === true;
    changedFields.push('stewardship_acknowledged');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'sensitive_area_acknowledged')) {
    changes.sensitive_area_acknowledged = input.sensitive_area_acknowledged === true;
    changedFields.push('sensitive_area_acknowledged');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'photos')) {
    changedFields.push('photos');
  }

  return { changes, changedFields, errors };
}

export class CampsiteSubmissionService {
  constructor(
    private readonly backend: CampsiteSubmissionBackend,
    private readonly notifications: CampsiteReviewNotificationService | null = null,
  ) {}

  private unavailable(): CampsiteServiceResult<never> | null {
    return this.backend.isAvailable()
      ? null
      : toServiceError('backend_unavailable', 'Campsite submission backend is not configured.');
  }

  private async currentUser(): Promise<CampsiteServiceResult<SubmitterAuthUser>> {
    const unavailable = this.unavailable();
    if (unavailable) return unavailable;
    const user = await this.backend.getCurrentUser();
    if (!user?.id) return toServiceError('auth_required', 'Sign in to view campsite submissions.');
    return { ok: true, data: user };
  }

  private async ownedReport(reportId: string, userId: string): Promise<CampsiteServiceResult<CampSiteReport>> {
    const report = await this.backend.getReportById(reportId);
    if (!report.ok) return report;
    if (report.data.submitted_by_user_id !== userId) {
      return toServiceError('permission_denied', 'You can only manage your own campsite submissions.');
    }
    return report;
  }

  async listMyCampsiteSubmissions(limit = DEFAULT_LIST_LIMIT): Promise<CampsiteServiceResult<MyCampsiteSubmission[]>> {
    const user = await this.currentUser();
    if (!user.ok) return user;
    const reports = await this.backend.listReportsByUser(user.data.id, Math.max(1, Math.min(DEFAULT_LIST_LIMIT, limit)));
    if (!reports.ok) return reports;

    const submissions: MyCampsiteSubmission[] = [];
    for (const report of reports.data) {
      const events = await this.backend.listReviewEvents(report.id);
      submissions.push(buildSubmission(report, events.ok ? events.data : []));
    }
    return { ok: true, data: submissions };
  }

  async getMyCampsiteSubmission(reportId: string): Promise<CampsiteServiceResult<MyCampsiteSubmission>> {
    const user = await this.currentUser();
    if (!user.ok) return user;
    const report = await this.ownedReport(reportId, user.data.id);
    if (!report.ok) return report;
    const events = await this.backend.listReviewEvents(reportId);
    if (!events.ok) return events;
    return { ok: true, data: buildSubmission(report.data, events.data) };
  }

  async updateMyCampsiteSubmission(
    reportId: string,
    input: CampsiteSubmissionUpdateInput,
  ): Promise<CampsiteServiceResult<MyCampsiteSubmission>> {
    const user = await this.currentUser();
    if (!user.ok) return user;
    const report = await this.ownedReport(reportId, user.data.id);
    if (!report.ok) return report;
    if (!canEditSubmission(report.data)) {
      return toServiceError('validation_error', 'This campsite submission can no longer be edited.');
    }

    const sanitized = sanitizeUpdateInput(input);
    if (sanitized.errors.length > 0) {
      return toServiceError('validation_error', 'Submitter update contains protected fields.', sanitized.errors);
    }

    const updated = Object.keys(sanitized.changes).length > 0
      ? await this.backend.updateReport(reportId, sanitized.changes)
      : report;
    if (!updated.ok) return updated;

    const event = await this.insertEvent(reportId, user.data.id, 'submitter_updated', {
      changed_fields: sanitized.changedFields,
      review_state: reportState(updated.data),
    });
    if (!event.ok) return event;
    return this.getMyCampsiteSubmission(reportId);
  }

  async withdrawMyCampsiteSubmission(reportId: string): Promise<CampsiteServiceResult<MyCampsiteSubmission>> {
    const user = await this.currentUser();
    if (!user.ok) return user;
    const report = await this.ownedReport(reportId, user.data.id);
    if (!report.ok) return report;
    if (!canWithdrawSubmission(report.data)) {
      return toServiceError('validation_error', 'This campsite submission cannot be withdrawn.');
    }

    const state = reportState(report.data);
    const updated = await this.transitionReport(
      report.data,
      {
        review_state: 'withdrawn',
        moderation_status: 'rejected',
        community_review_completed_at:
          state === 'community_review' ? report.data.community_review_completed_at ?? new Date().toISOString() : report.data.community_review_completed_at,
        moderator_review_completed_at:
          state === 'moderator_review' ? report.data.moderator_review_completed_at ?? new Date().toISOString() : report.data.moderator_review_completed_at,
      },
      'withdrawn',
      user.data.id,
      { previous_state: state },
    );
    if (!updated.ok) return updated;
    notifyWithoutBlocking(this.notifications?.notifyWithdrawn(updated.data));
    return this.getMyCampsiteSubmission(reportId);
  }

  async respondToNeedsInfo(
    reportId: string,
    input: CampsiteSubmissionUpdateInput,
  ): Promise<CampsiteServiceResult<MyCampsiteSubmission>> {
    const user = await this.currentUser();
    if (!user.ok) return user;
    const report = await this.ownedReport(reportId, user.data.id);
    if (!report.ok) return report;
    if (reportState(report.data) !== 'needs_submitter_info') {
      return toServiceError('validation_error', 'This campsite submission is not waiting for submitter information.');
    }

    const sanitized = sanitizeUpdateInput(input);
    if (sanitized.errors.length > 0) {
      return toServiceError('validation_error', 'Needs-info response contains protected fields.', sanitized.errors);
    }

    const nextState: CampSiteReportReviewState = report.data.community_review_started_at
      ? 'community_review'
      : 'submitted';
    const updated = await this.transitionReport(
      report.data,
      {
        ...sanitized.changes,
        review_state: nextState,
        moderation_status: 'pending',
      },
      'needs_info_responded',
      user.data.id,
      { changed_fields: sanitized.changedFields, previous_state: 'needs_submitter_info' },
    );
    if (!updated.ok) return updated;
    return this.getMyCampsiteSubmission(reportId);
  }

  async submitPrivateSaveToCommunity(
    reportId: string,
    input: CampsiteSubmissionUpdateInput = {},
  ): Promise<CampsiteServiceResult<MyCampsiteSubmission>> {
    const user = await this.currentUser();
    if (!user.ok) return user;
    const report = await this.ownedReport(reportId, user.data.id);
    if (!report.ok) return report;
    if (reportState(report.data) !== 'private_saved') {
      return toServiceError('validation_error', 'Only private campsite saves can be submitted to community review.');
    }

    const stewardship = input.stewardship_acknowledged ?? report.data.stewardship_acknowledged;
    const sensitive = input.sensitive_area_acknowledged ?? report.data.sensitive_area_acknowledged;
    if (!stewardship || !sensitive) {
      return toServiceError('validation_error', 'Community submissions require both campsite acknowledgements.');
    }

    const sanitized = sanitizeUpdateInput(input);
    if (sanitized.errors.length > 0) {
      return toServiceError('validation_error', 'Community submission contains protected fields.', sanitized.errors);
    }

    const updated = await this.transitionReport(
      report.data,
      {
        ...sanitized.changes,
        visibility_requested: 'community',
        moderation_status: 'pending',
        review_state: 'submitted',
        stewardship_acknowledged: stewardship,
        sensitive_area_acknowledged: sensitive,
      },
      'submitted',
      user.data.id,
      { from_review_state: 'private_saved' },
    );
    if (!updated.ok) return updated;
    notifyWithoutBlocking(this.notifications?.notifyCommunitySubmissionReceived(updated.data));
    return this.getMyCampsiteSubmission(reportId);
  }

  private async transitionReport(
    report: CampSiteReport,
    changes: Partial<CampSiteReport>,
    eventType: CampSiteReviewEventType,
    actorUserId: string | null,
    metadata: CampSiteJsonObject,
  ): Promise<CampsiteServiceResult<CampSiteReport>> {
    const from = reportState(report);
    const to = changes.review_state ?? from;
    if (!canTransitionCampSiteReportReviewState(from, to)) {
      return toServiceError('validation_error', `Invalid campsite submitter transition: ${from} -> ${to}.`);
    }
    const updated = await this.backend.updateReport(report.id, changes);
    if (!updated.ok) return updated;
    const event = await this.insertEvent(report.id, actorUserId, eventType, {
      ...metadata,
      from_review_state: from,
      to_review_state: to,
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
      return toServiceError('validation_error', 'Submitter review event is invalid.', validation.errors);
    }
    return event;
  }
}

export function createSupabaseCampsiteSubmissionBackend(
  client: SupabaseClient = supabase,
): CampsiteSubmissionBackend {
  return {
    isAvailable() {
      return isSupabaseConfigured;
    },

    async getCurrentUser() {
      const { data } = await client.auth.getSession();
      const userId = data.session?.user?.id;
      return userId ? { id: userId } : null;
    },

    async listReportsByUser(userId, limit) {
      const result = (await client
        .from(CAMP_SITE_REPORTS_TABLE)
        .select('*')
        .eq('submitted_by_user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(limit)) as SupabaseResponse<CampSiteReport[]>;
      if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async getReportById(reportId) {
      const result = (await client
        .from(CAMP_SITE_REPORTS_TABLE)
        .select('*')
        .eq('id', reportId)
        .single()) as SupabaseResponse<CampSiteReport>;
      if (result.error || !result.data) return toServiceError('not_found', 'Campsite submission was not found.');
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
  };
}

export const campsiteSubmissionService = new CampsiteSubmissionService(
  createSupabaseCampsiteSubmissionBackend(),
  campsiteReviewNotificationService,
);
