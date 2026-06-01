import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../supabase';
import {
  type CampSite,
  type CampSiteJsonObject,
  type CampSiteReport,
  type CampSiteReportReviewState,
  type CampSiteReviewEvent,
  validateCampSiteReportRecord,
} from './campsiteRecommendationTypes';
import {
  type CampsiteServiceErrorCode,
  type CampsiteServiceResult,
} from './campsiteRecommendationService';
import {
  DEFAULT_CAMPSITE_REVIEW_CONFIG,
  type CampsiteReviewConfig,
  resolveCampsiteReviewConfig,
} from './campsiteReviewConfig';
import {
  landUseReviewService,
  type CampsiteLandUseReviewService,
} from './campsiteLandUseReviewService';
import {
  campsiteReviewNotificationService,
  notifyWithoutBlocking,
  type CampsiteReviewNotificationService,
} from './campsiteReviewNotificationService';

const CAMP_SITES_TABLE = 'camp_sites';
const CAMP_SITE_REPORTS_TABLE = 'camp_site_reports';
const CAMP_SITE_REVIEW_EVENTS_TABLE = 'camp_site_review_events';
const EARTH_RADIUS_METERS = 6_371_000;

export type CampsiteTriageStatus = 'passed' | 'warning' | 'blocked' | 'unknown';

export interface CampsiteTriageCheckResult {
  key: string;
  status: CampsiteTriageStatus;
  message: string;
  scoreImpact: number;
}

export interface CampsiteDuplicateCandidate {
  id: string;
  source: 'camp_site' | 'camp_site_report';
  distance_meters: number;
  status?: string | null;
  review_state?: string | null;
}

export interface CampsiteTriageSummary {
  checks: CampsiteTriageCheckResult[];
  warnings: string[];
  blocking_reasons: string[];
  duplicate_candidates: CampsiteDuplicateCandidate[];
  recommended_next_state: CampSiteReportReviewState;
  land_use_status: 'unknown' | 'clear' | 'warning' | 'blocked';
  land_use_review?: CampSiteJsonObject;
}

export interface CampsiteTriageResult {
  triage_score: number;
  triage_status: CampsiteTriageStatus;
  triage_summary: CampsiteTriageSummary;
}

export interface CampsiteTriageContext {
  duplicateCandidates?: CampsiteDuplicateCandidate[];
  recentCommunitySubmissionCount?: number | null;
  rejectedSubmissionCount?: number | null;
  landUseStatus?: 'unknown' | 'clear' | 'warning' | 'blocked';
  landUseReview?: CampSiteJsonObject | null;
}

type TriageAuthUser = {
  id: string;
  isAdmin?: boolean;
  isSystem?: boolean;
};

type CampSiteReviewEventInsert = Omit<
  CampSiteReviewEvent,
  'id' | 'created_at' | 'deleted_at' | 'dirty'
>;

export interface CampsiteTriageBackend {
  isAvailable(): boolean;
  getCurrentUser(): Promise<TriageAuthUser | null>;
  getReportById(reportId: string): Promise<CampsiteServiceResult<CampSiteReport>>;
  updateReport(
    reportId: string,
    changes: Partial<CampSiteReport>,
  ): Promise<CampsiteServiceResult<CampSiteReport>>;
  listDuplicateCandidates(
    report: CampSiteReport,
    radiusMeters: number,
  ): Promise<CampsiteServiceResult<CampsiteDuplicateCandidate[]>>;
  countRecentCommunityReportsByUser(
    userId: string,
    sinceIso: string,
  ): Promise<CampsiteServiceResult<number>>;
  countRejectedReportsByUser(userId: string): Promise<CampsiteServiceResult<number>>;
  insertReviewEvent?(row: CampSiteReviewEventInsert): Promise<CampsiteServiceResult<CampSiteReviewEvent>>;
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
  return toServiceError('backend_error', error?.message ?? 'Campsite triage backend request failed.');
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function isFiniteLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isFiniteLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function distanceMeters(
  a: Pick<CampSiteReport, 'latitude' | 'longitude'>,
  b: Pick<CampSiteReport, 'latitude' | 'longitude'>,
): number {
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function addCheck(
  checks: CampsiteTriageCheckResult[],
  key: string,
  status: CampsiteTriageStatus,
  message: string,
  scoreImpact: number,
): void {
  checks.push({ key, status, message, scoreImpact });
}

function determineStatus(
  blockingReasons: string[],
  warnings: string[],
  landUseStatus: CampsiteTriageSummary['land_use_status'],
): CampsiteTriageStatus {
  if (blockingReasons.length > 0 || landUseStatus === 'blocked') return 'blocked';
  if (warnings.length > 0 || landUseStatus === 'warning') return 'warning';
  if (landUseStatus === 'unknown') return 'warning';
  return 'passed';
}

function recommendedStateForStatus(
  status: CampsiteTriageStatus,
  report: CampSiteReport,
): CampSiteReportReviewState {
  if (report.visibility_requested === 'private') return 'private_saved';
  if (status === 'blocked') return 'auto_triage_failed';
  if (status === 'warning' || status === 'unknown') return 'moderator_review';
  return 'community_review';
}

export function evaluateCampsiteTriage(
  report: CampSiteReport,
  context: CampsiteTriageContext = {},
  config: Partial<CampsiteReviewConfig> = {},
): CampsiteTriageResult {
  const resolved = resolveCampsiteReviewConfig(config);
  const checks: CampsiteTriageCheckResult[] = [];
  const warnings: string[] = [];
  const blockingReasons: string[] = [];
  let score = 100;

  if (report.visibility_requested === 'private') {
    addCheck(checks, 'visibility', 'passed', 'Private save skips community triage.', 0);
    return {
      triage_score: 100,
      triage_status: 'passed',
      triage_summary: {
        checks,
        warnings,
        blocking_reasons: [],
        duplicate_candidates: [],
        recommended_next_state: 'private_saved',
        land_use_status: 'unknown',
        land_use_review: context.landUseReview ?? undefined,
      },
    };
  }

  if (!isFiniteLatitude(report.latitude) || !isFiniteLongitude(report.longitude)) {
    blockingReasons.push('Coordinates are outside valid latitude/longitude bounds.');
    score -= 60;
    addCheck(checks, 'coordinates', 'blocked', 'Coordinates are invalid.', -60);
  } else if (report.latitude === 0 && report.longitude === 0) {
    blockingReasons.push('Coordinates point to null island.');
    score -= 55;
    addCheck(checks, 'coordinates', 'blocked', 'Coordinates point to null island.', -55);
  } else {
    addCheck(checks, 'coordinates', 'passed', 'Coordinates are within valid bounds.', 5);
    score += 5;
  }

  const validation = validateCampSiteReportRecord(report);
  if (!validation.ok) {
    blockingReasons.push(...validation.errors);
    score -= Math.min(40, validation.errors.length * 10);
    addCheck(checks, 'required_fields', 'blocked', 'Required report fields are missing or invalid.', -20);
  } else {
    addCheck(checks, 'required_fields', 'passed', 'Required report fields are present.', 5);
    score += 5;
  }

  if (!report.stewardship_acknowledged || !report.sensitive_area_acknowledged) {
    blockingReasons.push('Community submission acknowledgements are missing.');
    score -= 40;
    addCheck(checks, 'acknowledgements', 'blocked', 'Community acknowledgements are required.', -40);
  } else {
    addCheck(checks, 'acknowledgements', 'passed', 'Community acknowledgements are present.', 5);
    score += 5;
  }

  if (!report.visited_at && (report.user_stayed_here || report.verified_in_person)) {
    warnings.push('Visited date is missing for an in-person report.');
    score -= 8;
    addCheck(checks, 'visited_at', 'warning', 'Visited date missing for field-confirmed report.', -8);
  } else if (!report.visited_at) {
    warnings.push('Visited date is unknown; this appears to be a planning suggestion.');
    score -= 5;
    addCheck(checks, 'visited_at', 'warning', 'Visited date unknown or planning-derived.', -5);
  } else {
    addCheck(checks, 'visited_at', 'passed', 'Visited date is present.', 4);
    score += 4;
  }

  if (report.source_type === 'current_location') {
    if (typeof report.location_accuracy_m === 'number' && report.location_accuracy_m <= 50) {
      score += 12;
      addCheck(checks, 'source_confidence', 'passed', 'Current location has high accuracy.', 12);
    } else {
      warnings.push('Current location accuracy is missing or above 50 meters.');
      score -= 8;
      addCheck(checks, 'source_confidence', 'warning', 'Current location accuracy is reduced.', -8);
    }
  } else if (report.source_type === 'pin_drop') {
    score += 4;
    addCheck(checks, 'source_confidence', 'passed', 'Dropped pin is acceptable for review.', 4);
  } else if (report.source_type === 'gpx_waypoint') {
    if (report.user_stayed_here || report.verified_in_person) {
      score += 4;
      addCheck(checks, 'source_confidence', 'passed', 'GPX waypoint has in-person confirmation.', 4);
    } else {
      warnings.push('GPX waypoint is lower confidence without in-person confirmation.');
      score -= 8;
      addCheck(checks, 'source_confidence', 'warning', 'GPX waypoint lacks in-person confirmation.', -8);
    }
  } else if (report.source_type === 'gpx_route') {
    const explicitlySelected = report.conditions?.explicit_user_selection === true;
    if (!explicitlySelected) {
      blockingReasons.push('Route-derived campsite point requires explicit user selection.');
      score -= 35;
      addCheck(checks, 'source_confidence', 'blocked', 'Route-derived point was not explicitly selected.', -35);
    } else {
      warnings.push('Route-derived point requires reviewer confirmation.');
      score -= 12;
      addCheck(checks, 'source_confidence', 'warning', 'Route-derived point was explicitly selected.', -12);
    }
  }

  const duplicateCandidates = context.duplicateCandidates ?? [];
  if (duplicateCandidates.length > 0) {
    warnings.push('Nearby campsite or pending report may already represent this location.');
    score -= 18;
    addCheck(checks, 'duplicates', 'warning', 'Potential duplicate candidates found.', -18);
  } else {
    addCheck(checks, 'duplicates', 'passed', 'No nearby duplicates found within the configured radius.', 5);
    score += 5;
  }

  const recentCount = context.recentCommunitySubmissionCount;
  if (typeof recentCount === 'number' && recentCount > resolved.maxCommunitySubmissionsPerDay) {
    warnings.push('Submitter has many recent community submissions.');
    score -= 16;
    addCheck(checks, 'abuse_rate', 'warning', 'Recent submission volume exceeds configured limit.', -16);
  } else if (typeof recentCount === 'number') {
    addCheck(checks, 'abuse_rate', 'passed', 'Recent submission volume is within configured limits.', 4);
    score += 4;
  } else {
    warnings.push('Recent submission rate could not be verified.');
    score -= 4;
    addCheck(checks, 'abuse_rate', 'unknown', 'Recent submission rate unavailable.', -4);
  }

  const rejectedCount = context.rejectedSubmissionCount;
  if (typeof rejectedCount === 'number' && rejectedCount >= 3) {
    warnings.push('Submitter has repeated rejected community submissions.');
    score -= 14;
    addCheck(checks, 'abuse_rejections', 'warning', 'Submitter rejection history requires moderator awareness.', -14);
  } else if (typeof rejectedCount === 'number') {
    addCheck(checks, 'abuse_rejections', 'passed', 'Rejected submission history is within limits.', 3);
    score += 3;
  } else {
    warnings.push('Rejected submitter history could not be verified.');
    score -= 3;
    addCheck(checks, 'abuse_rejections', 'unknown', 'Rejected submitter history unavailable.', -3);
  }

  const landUseStatus = context.landUseStatus ?? 'unknown';
  if (landUseStatus === 'unknown') {
    warnings.push('Land-use review is unavailable; verify access before publication.');
    score -= 10;
    addCheck(checks, 'land_use', 'unknown', 'Land-use service unavailable.', -10);
  } else if (landUseStatus === 'blocked') {
    blockingReasons.push('Land-use review blocked this location.');
    score -= 45;
    addCheck(checks, 'land_use', 'blocked', 'Land-use review blocked this location.', -45);
  } else if (landUseStatus === 'warning') {
    warnings.push('Land-use review returned a warning.');
    score -= 18;
    addCheck(checks, 'land_use', 'warning', 'Land-use review requires moderator awareness.', -18);
  } else {
    addCheck(checks, 'land_use', 'passed', 'Land-use review did not flag this location.', 8);
    score += 8;
  }

  const triageStatus = determineStatus(blockingReasons, warnings, landUseStatus);
  return {
    triage_score: clampScore(score),
    triage_status: triageStatus,
    triage_summary: {
      checks,
      warnings,
      blocking_reasons: blockingReasons,
      duplicate_candidates: duplicateCandidates,
      recommended_next_state: recommendedStateForStatus(triageStatus, report),
      land_use_status: landUseStatus,
      land_use_review: context.landUseReview ?? undefined,
    },
  };
}

export class CampsiteTriageService {
  constructor(
    private readonly backend: CampsiteTriageBackend,
    private readonly config: Partial<CampsiteReviewConfig> = {},
    private readonly landUseReview?: Pick<CampsiteLandUseReviewService, 'reviewCampSiteReport'>,
    private readonly notifications: CampsiteReviewNotificationService | null = null,
  ) {}

  private unavailable(): CampsiteServiceResult<never> | null {
    return this.backend.isAvailable()
      ? null
      : toServiceError('backend_unavailable', 'Campsite triage backend is not configured.');
  }

  async runTriage(campSiteReportId: string): Promise<CampsiteServiceResult<CampsiteTriageResult>> {
    const unavailable = this.unavailable();
    if (unavailable) return unavailable;
    const user = await this.backend.getCurrentUser();
    if (!user) return toServiceError('auth_required', 'Sign in to run campsite triage.');
    if (!user.isAdmin && !user.isSystem) {
      return toServiceError('admin_required', 'Only moderators or ECS system services can run campsite triage.');
    }

    const report = await this.backend.getReportById(campSiteReportId);
    if (!report.ok) return report;

    if (report.data.visibility_requested === 'private') {
      const result = evaluateCampsiteTriage(report.data, {}, this.config);
      return { ok: true, data: result };
    }

    const config = resolveCampsiteReviewConfig(this.config);
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [duplicates, recentCount, rejectedCount] = await Promise.all([
      this.backend.listDuplicateCandidates(report.data, config.duplicateRadiusMeters),
      this.backend.countRecentCommunityReportsByUser(report.data.submitted_by_user_id, sinceIso),
      this.backend.countRejectedReportsByUser(report.data.submitted_by_user_id),
    ]);

    const landUseResult = this.landUseReview
      ? await this.landUseReview.reviewCampSiteReport(report.data)
      : null;
    const landUseStatus =
      landUseResult?.ok && landUseResult.data.status === 'passed'
        ? 'clear'
        : landUseResult?.ok && landUseResult.data.status === 'blocked'
          ? 'blocked'
          : landUseResult?.ok && landUseResult.data.status === 'warning'
            ? 'warning'
            : 'unknown';
    const landUseReviewSummary =
      landUseResult?.ok
        ? {
            status: landUseResult.data.status,
            warnings: landUseResult.data.warnings,
            blocking_reasons: landUseResult.data.blocking_reasons,
            provider_version: landUseResult.data.provider_version,
          }
        : null;

    const result = evaluateCampsiteTriage(
      report.data,
      {
        duplicateCandidates: duplicates.ok ? duplicates.data : [],
        recentCommunitySubmissionCount: recentCount.ok ? recentCount.data : null,
        rejectedSubmissionCount: rejectedCount.ok ? rejectedCount.data : null,
        landUseStatus,
        landUseReview: landUseReviewSummary,
      },
      this.config,
    );

    const now = new Date().toISOString();
    const changes: Partial<CampSiteReport> = {
      triage_score: result.triage_score,
      triage_summary: result.triage_summary as unknown as CampSiteJsonObject,
      review_state: result.triage_summary.recommended_next_state,
    };
    if (changes.review_state === 'community_review') {
      changes.community_review_started_at = report.data.community_review_started_at ?? now;
    }
    if (changes.review_state === 'moderator_review') {
      changes.moderator_review_started_at = report.data.moderator_review_started_at ?? now;
    }
    const updated = await this.backend.updateReport(report.data.id, changes);
    if (!updated.ok) return updated;

    await this.backend.insertReviewEvent?.({
      camp_site_report_id: report.data.id,
      actor_user_id: user.id,
      event_type: result.triage_status === 'blocked' ? 'triage_failed' : 'triage_passed',
      metadata: {
        triage_score: result.triage_score,
        triage_status: result.triage_status,
        recommended_next_state: result.triage_summary.recommended_next_state,
      },
    });
    if (updated.data.review_state === 'auto_triage_failed') {
      notifyWithoutBlocking(
        this.notifications?.notifyBlockedTriage(
          updated.data,
          result.triage_summary.blocking_reasons[0],
        ),
      );
    } else if (updated.data.review_state === 'moderator_review') {
      notifyWithoutBlocking(
        this.notifications?.notifyModeratorReviewRequired(
          updated.data,
          result.triage_summary.warnings[0] ?? 'Automated triage requires moderator review.',
        ),
      );
    } else if (updated.data.review_state === 'community_review') {
      notifyWithoutBlocking(this.notifications?.notifyCommunityReviewStarted(updated.data));
    }

    return { ok: true, data: result };
  }
}

function boundingDeltaDegrees(radiusMeters: number): number {
  return Math.max(0.001, radiusMeters / 111_320);
}

function toDuplicateFromSite(report: CampSiteReport, site: CampSite): CampsiteDuplicateCandidate {
  return {
    id: site.id,
    source: 'camp_site',
    distance_meters: Math.round(distanceMeters(report, site)),
    status: site.status,
  };
}

function toDuplicateFromReport(report: CampSiteReport, candidate: CampSiteReport): CampsiteDuplicateCandidate {
  return {
    id: candidate.id,
    source: 'camp_site_report',
    distance_meters: Math.round(distanceMeters(report, candidate)),
    status: candidate.moderation_status,
    review_state: candidate.review_state ?? null,
  };
}

export function createSupabaseCampsiteTriageBackend(
  client: SupabaseClient = supabase,
): CampsiteTriageBackend {
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

    async listDuplicateCandidates(report, radiusMeters) {
      const delta = boundingDeltaDegrees(radiusMeters);
      const sites = (await client
        .from(CAMP_SITES_TABLE)
        .select('*')
        .eq('visibility', 'community')
        .in('status', ['approved', 'hidden'])
        .gte('latitude', report.latitude - delta)
        .lte('latitude', report.latitude + delta)
        .gte('longitude', report.longitude - delta)
        .lte('longitude', report.longitude + delta)) as SupabaseResponse<CampSite[]>;
      if (sites.error || !Array.isArray(sites.data)) return mapBackendError(sites.error);

      const reports = (await client
        .from(CAMP_SITE_REPORTS_TABLE)
        .select('*')
        .eq('visibility_requested', 'community')
        .neq('id', report.id)
        .in('review_state', ['submitted', 'community_review', 'moderator_review', 'community_approved'])
        .gte('latitude', report.latitude - delta)
        .lte('latitude', report.latitude + delta)
        .gte('longitude', report.longitude - delta)
        .lte('longitude', report.longitude + delta)) as SupabaseResponse<CampSiteReport[]>;
      if (reports.error || !Array.isArray(reports.data)) return mapBackendError(reports.error);

      const candidates = [
        ...sites.data.map((site) => toDuplicateFromSite(report, site)),
        ...reports.data.map((candidate) => toDuplicateFromReport(report, candidate)),
      ].filter((candidate) => candidate.distance_meters <= radiusMeters);
      return { ok: true, data: candidates };
    },

    async countRecentCommunityReportsByUser(userId, sinceIso) {
      const result = (await client
        .from(CAMP_SITE_REPORTS_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('submitted_by_user_id', userId)
        .eq('visibility_requested', 'community')
        .gte('created_at', sinceIso)) as SupabaseResponse<null>;
      if (result.error) return mapBackendError(result.error);
      return { ok: true, data: result.count ?? 0 };
    },

    async countRejectedReportsByUser(userId) {
      const result = (await client
        .from(CAMP_SITE_REPORTS_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('submitted_by_user_id', userId)
        .eq('visibility_requested', 'community')
        .in('review_state', ['community_rejected', 'rejected', 'auto_triage_failed'])) as SupabaseResponse<null>;
      if (result.error) return mapBackendError(result.error);
      return { ok: true, data: result.count ?? 0 };
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
  };
}

export const campsiteTriageService = new CampsiteTriageService(
  createSupabaseCampsiteTriageBackend(),
  DEFAULT_CAMPSITE_REVIEW_CONFIG,
  landUseReviewService,
  campsiteReviewNotificationService,
);
