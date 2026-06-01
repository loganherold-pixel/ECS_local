import type { CampIntelMarkerPayload } from '../campIntel/campIntelTypes';
import type {
  CampSiteGroupServiceResult,
  GroupCampSiteItem,
} from './campsiteGroupSharingService';

export type GroupCampsiteBounds = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

export type GroupCampsiteMarkerPayload = CampIntelMarkerPayload & {
  markerKind: 'group_campsite';
  groupShareId: string;
  groupId: string;
  reportId?: string | null;
  campSiteId?: string | null;
};

export type GroupCampsiteLayerService = {
  listGroupCampSitesByMapBounds(
    groupId: string,
    bounds: GroupCampsiteBounds,
  ): Promise<CampSiteGroupServiceResult<GroupCampSiteItem[]>>;
};

function labelFromValue(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getGroupCampsiteTarget(item: GroupCampSiteItem) {
  return item.camp_site ?? item.report;
}

export function isRenderableGroupCampSite(item: GroupCampSiteItem): boolean {
  const target = getGroupCampsiteTarget(item);
  return Boolean(
    target &&
      Number.isFinite(target.latitude) &&
      Number.isFinite(target.longitude) &&
      item.share.group_id,
  );
}

export function filterRenderableGroupCampSites(items: GroupCampSiteItem[]): GroupCampSiteItem[] {
  return items.filter(isRenderableGroupCampSite);
}

export async function fetchGroupCampsitesForViewport(
  service: GroupCampsiteLayerService,
  groupId: string,
  bounds: GroupCampsiteBounds,
): Promise<CampSiteGroupServiceResult<GroupCampSiteItem[]>> {
  const result = await service.listGroupCampSitesByMapBounds(groupId, bounds);
  if (!result.ok) return result;
  return { ok: true, data: filterRenderableGroupCampSites(result.data) };
}

export function toGroupCampsiteMarkerPayload(
  item: GroupCampSiteItem,
  selected = false,
): GroupCampsiteMarkerPayload {
  const target = getGroupCampsiteTarget(item);
  if (!target) {
    throw new Error('Group campsite marker requires a report or campsite target.');
  }
  const title =
    item.camp_site?.canonical_name ??
    item.report?.notes?.split(/[.!?]/)[0]?.slice(0, 44) ??
    'Group Campsite';
  const trustScore = item.camp_site?.trust_score ?? 45;

  return {
    id: `group-campsite:${item.share.id}`,
    groupShareId: item.share.id,
    groupId: item.share.group_id,
    reportId: item.share.camp_site_report_id,
    campSiteId: item.share.camp_site_id,
    markerKind: 'group_campsite',
    latitude: target.latitude,
    longitude: target.longitude,
    title,
    subtitle: `${labelFromValue(target.site_type)} - ${labelFromValue(target.access_difficulty)}`,
    category: 'group',
    confidence: trustScore >= 70 ? 'high' : trustScore >= 35 ? 'medium' : 'low',
    confidenceScore: Math.max(0, Math.min(100, trustScore)),
    rating: trustScore >= 85 ? 'A' : trustScore >= 65 ? 'B' : trustScore >= 35 ? 'C' : 'D',
    score: Math.max(0, Math.min(100, trustScore)),
    rankLabel: 'GR',
    ratingFactors: [
      {
        label: 'Visibility',
        value: 'Private group',
        impact: 'neutral',
      },
      {
        label: 'Source',
        value: item.report ? labelFromValue(item.report.source_type) : 'Approved community site',
        impact: item.report?.verified_in_person ? 'positive' : 'neutral',
      },
    ],
    selected,
    badges: [
      { label: 'GROUP', tone: 'info' },
      { label: labelFromValue(target.access_difficulty), tone: 'neutral' },
    ],
  };
}
