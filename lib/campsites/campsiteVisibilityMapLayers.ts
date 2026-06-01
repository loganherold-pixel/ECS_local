import type { CampIntelMarkerPayload } from '../campIntel/campIntelTypes';
import type {
  CampSiteReportReviewState,
  CampSiteVisibility,
} from './campsiteRecommendationTypes';
import type {
  CampSiteReportBounds,
  CampSiteReportResponse,
  CampsiteServiceResult,
} from './campsiteRecommendationService';
import type { CampSiteReviewQueueItem } from './campsiteReviewService';

export type CampsiteVisibilityLayerScope =
  | 'community'
  | 'private'
  | 'group'
  | 'pending'
  | 'reviewer_pending';

export type CampsiteVisibilityMarkerKind =
  | 'community_campsite'
  | 'private_campsite'
  | 'group_campsite'
  | 'pending_campsite'
  | 'reviewer_pending_campsite';

export type CampsiteVisibilityLayerToggle = {
  key: CampsiteVisibilityLayerScope;
  label: string;
  detail: string;
  markerKind: CampsiteVisibilityMarkerKind;
  privileged?: boolean;
  defaultVisible: boolean;
};

export const PENDING_REVIEW_PUBLIC_LABEL = 'Pending review - not public';

export const CAMPSITE_VISIBILITY_LAYER_TOGGLES: CampsiteVisibilityLayerToggle[] = [
  {
    key: 'community',
    label: 'ECS Community Campsites',
    detail: 'Approved public campsites only.',
    markerKind: 'community_campsite',
    defaultVisible: true,
  },
  {
    key: 'private',
    label: 'My Private Campsites',
    detail: 'Private saves visible only to you.',
    markerKind: 'private_campsite',
    defaultVisible: true,
  },
  {
    key: 'group',
    label: 'My Group Campsites',
    detail: 'Shared campsites for active group members.',
    markerKind: 'group_campsite',
    defaultVisible: true,
  },
  {
    key: 'pending',
    label: 'My Pending Community Submissions',
    detail: PENDING_REVIEW_PUBLIC_LABEL,
    markerKind: 'pending_campsite',
    defaultVisible: false,
  },
  {
    key: 'reviewer_pending',
    label: 'Reviewer Pending Layer',
    detail: 'Community review items for trusted reviewers and moderators.',
    markerKind: 'reviewer_pending_campsite',
    privileged: true,
    defaultVisible: false,
  },
];

export const DEFAULT_CAMPSITE_LAYER_VISIBILITY: Record<CampsiteVisibilityLayerScope, boolean> =
  CAMPSITE_VISIBILITY_LAYER_TOGGLES.reduce(
    (acc, toggle) => {
      acc[toggle.key] = toggle.defaultVisible;
      return acc;
    },
    {} as Record<CampsiteVisibilityLayerScope, boolean>,
  );

export type ScopedCampsiteMarkerPayload = CampIntelMarkerPayload & {
  markerKind: Exclude<CampsiteVisibilityMarkerKind, 'community_campsite' | 'group_campsite'>;
  reportId: string;
  visibilityScope: Extract<CampsiteVisibilityLayerScope, 'private' | 'pending' | 'reviewer_pending'>;
  reviewState?: CampSiteReportReviewState | null;
  statusLabel?: string;
};

export type CampsiteMarkerDetailAction =
  | 'save'
  | 'confirm'
  | 'flag'
  | 'edit'
  | 'delete'
  | 'share'
  | 'submit_to_community'
  | 'withdraw'
  | 'open_group'
  | 'remove_group_share'
  | 'open_review';

export type CampsiteVisibilityLayerService = {
  listCurrentUserPrivateReportsByBounds(
    bounds: CampSiteReportBounds,
  ): Promise<CampsiteServiceResult<CampSiteReportResponse[]>>;
  listCurrentUserPendingCommunityReportsByBounds(
    bounds: CampSiteReportBounds,
  ): Promise<CampsiteServiceResult<CampSiteReportResponse[]>>;
};

export type ReviewerPendingLayerService = {
  listCommunityReviewQueue(limit?: number): Promise<CampsiteServiceResult<CampSiteReviewQueueItem[]>>;
};

const PENDING_REVIEW_STATES = new Set<CampSiteReportReviewState>([
  'submitted',
  'community_review',
  'moderator_review',
  'needs_submitter_info',
]);

function labelFromValue(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function isFiniteCoordinate(report: Pick<CampSiteReportResponse, 'latitude' | 'longitude'>): boolean {
  return Number.isFinite(report.latitude) && Number.isFinite(report.longitude);
}

export function isWithinCampsiteBounds(
  point: Pick<CampSiteReportResponse, 'latitude' | 'longitude'>,
  bounds: CampSiteReportBounds,
): boolean {
  return (
    point.latitude >= bounds.minLat &&
    point.latitude <= bounds.maxLat &&
    point.longitude >= bounds.minLng &&
    point.longitude <= bounds.maxLng
  );
}

export function isPrivateCampsiteReport(report: CampSiteReportResponse): boolean {
  return (
    report.visibility_requested === 'private' &&
    (report.moderation_status === 'private_saved' || report.review_state === 'private_saved') &&
    isFiniteCoordinate(report)
  );
}

export function isPendingCommunitySubmission(report: CampSiteReportResponse): boolean {
  const reviewState = report.review_state ?? null;
  return (
    report.visibility_requested === 'community' &&
    reviewState != null &&
    PENDING_REVIEW_STATES.has(reviewState) &&
    isFiniteCoordinate(report)
  );
}

export function isReviewerPendingReport(report: CampSiteReviewQueueItem): boolean {
  return (
    report.visibility_requested === 'community' &&
    report.review_state === 'community_review' &&
    isFiniteCoordinate(report)
  );
}

export function filterRenderablePrivateCampsiteReports(
  reports: CampSiteReportResponse[],
  bounds?: CampSiteReportBounds,
): CampSiteReportResponse[] {
  return reports.filter(
    (report) => isPrivateCampsiteReport(report) && (!bounds || isWithinCampsiteBounds(report, bounds)),
  );
}

export function filterRenderablePendingCommunityReports(
  reports: CampSiteReportResponse[],
  bounds?: CampSiteReportBounds,
): CampSiteReportResponse[] {
  return reports.filter(
    (report) => isPendingCommunitySubmission(report) && (!bounds || isWithinCampsiteBounds(report, bounds)),
  );
}

export function filterRenderableReviewerPendingReports(
  reports: CampSiteReviewQueueItem[],
  bounds?: CampSiteReportBounds,
): CampSiteReviewQueueItem[] {
  return reports.filter(
    (report) => isReviewerPendingReport(report) && (!bounds || isWithinCampsiteBounds(report, bounds)),
  );
}

export async function fetchPrivateCampsitesForViewport(
  service: CampsiteVisibilityLayerService,
  bounds: CampSiteReportBounds,
): Promise<CampsiteServiceResult<CampSiteReportResponse[]>> {
  const result = await service.listCurrentUserPrivateReportsByBounds(bounds);
  if (!result.ok) return result;
  return { ok: true, data: filterRenderablePrivateCampsiteReports(result.data, bounds) };
}

export async function fetchPendingCommunitySubmissionsForViewport(
  service: CampsiteVisibilityLayerService,
  bounds: CampSiteReportBounds,
): Promise<CampsiteServiceResult<CampSiteReportResponse[]>> {
  const result = await service.listCurrentUserPendingCommunityReportsByBounds(bounds);
  if (!result.ok) return result;
  return { ok: true, data: filterRenderablePendingCommunityReports(result.data, bounds) };
}

export async function fetchReviewerPendingCampsitesForViewport(
  service: ReviewerPendingLayerService,
  bounds: CampSiteReportBounds,
): Promise<CampsiteServiceResult<CampSiteReviewQueueItem[]>> {
  const result = await service.listCommunityReviewQueue(100);
  if (!result.ok) return result;
  return { ok: true, data: filterRenderableReviewerPendingReports(result.data, bounds) };
}

function titleFromReport(report: CampSiteReportResponse, fallback: string): string {
  return report.notes?.split(/[.!?]/)[0]?.slice(0, 44) || fallback;
}

function markerBase(
  report: CampSiteReportResponse,
  selected: boolean,
  scope: ScopedCampsiteMarkerPayload['visibilityScope'],
  markerKind: ScopedCampsiteMarkerPayload['markerKind'],
  rankLabel: string,
  title: string,
  statusLabel: string,
): ScopedCampsiteMarkerPayload {
  const verifiedScore = report.verified_in_person ? 74 : report.user_stayed_here ? 64 : 48;
  const category =
    scope === 'private'
      ? 'private'
      : scope === 'reviewer_pending'
        ? 'review'
        : 'pending';
  return {
    id: `${markerKind}:${report.id}`,
    reportId: report.id,
    markerKind,
    visibilityScope: scope,
    reviewState: report.review_state ?? null,
    statusLabel,
    latitude: report.latitude,
    longitude: report.longitude,
    title,
    subtitle: `${labelFromValue(report.site_type)} - ${labelFromValue(report.access_difficulty)}`,
    category,
    confidence: verifiedScore >= 70 ? 'high' : verifiedScore >= 50 ? 'medium' : 'low',
    confidenceScore: verifiedScore,
    rating: verifiedScore >= 80 ? 'A' : verifiedScore >= 60 ? 'B' : verifiedScore >= 40 ? 'C' : 'D',
    score: verifiedScore,
    rankLabel,
    ratingFactors: [
      {
        label: 'Visibility',
        value: statusLabel,
        impact: scope === 'pending' || scope === 'reviewer_pending' ? 'neutral' : 'positive',
      },
      {
        label: 'Source',
        value: labelFromValue(report.source_type),
        impact: report.verified_in_person ? 'positive' : 'neutral',
      },
    ],
    selected,
    badges: [
      { label: rankLabel, tone: scope === 'pending' || scope === 'reviewer_pending' ? 'warning' : 'info' },
      { label: labelFromValue(report.access_difficulty), tone: 'neutral' },
    ],
  };
}

export function toPrivateCampsiteMarkerPayload(
  report: CampSiteReportResponse,
  selected = false,
): ScopedCampsiteMarkerPayload {
  return markerBase(
    report,
    selected,
    'private',
    'private_campsite',
    'PR',
    titleFromReport(report, 'Private Campsite'),
    'Private save',
  );
}

export function toPendingCampsiteMarkerPayload(
  report: CampSiteReportResponse,
  selected = false,
): ScopedCampsiteMarkerPayload {
  const needsInfo = report.review_state === 'needs_submitter_info';
  return markerBase(
    report,
    selected,
    'pending',
    'pending_campsite',
    needsInfo ? 'NI' : 'PN',
    titleFromReport(report, 'Pending Campsite'),
    needsInfo ? 'Needs info - not public' : PENDING_REVIEW_PUBLIC_LABEL,
  );
}

export function toReviewerPendingCampsiteMarkerPayload(
  report: CampSiteReviewQueueItem,
  selected = false,
): ScopedCampsiteMarkerPayload {
  return markerBase(
    report,
    selected,
    'reviewer_pending',
    'reviewer_pending_campsite',
    'RV',
    titleFromReport(report, 'Review Campsite'),
    'Community review',
  );
}

export function getCampsiteLayerActions(
  scope: CampsiteVisibilityLayerScope,
  options: { canAdminGroup?: boolean } = {},
): CampsiteMarkerDetailAction[] {
  switch (scope) {
    case 'community':
      return ['save', 'confirm', 'flag'];
    case 'private':
      return ['edit', 'delete', 'share', 'submit_to_community'];
    case 'group':
      return options.canAdminGroup ? ['open_group', 'remove_group_share'] : ['open_group'];
    case 'pending':
      return ['edit', 'withdraw'];
    case 'reviewer_pending':
      return ['open_review'];
  }
}

export function layerSupportsVisibility(
  scope: CampsiteVisibilityLayerScope,
  visibility: CampSiteVisibility,
): boolean {
  if (scope === 'community') return visibility === 'community';
  if (scope === 'private') return visibility === 'private';
  if (scope === 'group') return visibility === 'group';
  return visibility === 'community';
}
