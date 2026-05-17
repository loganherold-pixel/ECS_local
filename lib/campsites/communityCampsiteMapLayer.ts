import type { CampIntelMarkerPayload } from '../campIntel/campIntelTypes';
import type {
  CampsiteServiceResult,
  CreateCampSiteReportInput,
  ListApprovedCampSitesParams,
  PublicCampSite,
} from './campsiteRecommendationService';

export type CommunityCampsiteBounds = Pick<
  ListApprovedCampSitesParams,
  'minLat' | 'minLng' | 'maxLat' | 'maxLng'
>;

export type CommunityCampsiteFilters = Pick<
  ListApprovedCampSitesParams,
  'site_type' | 'access_difficulty' | 'trailer_friendly' | 'cell_signal'
>;

export type CommunityCampsiteMarkerPayload = CampIntelMarkerPayload & {
  markerKind: 'community_campsite';
  communityCampSiteId: string;
};

export type CommunityCampsiteLayerService = {
  listApprovedCommunityCampsitesByBounds(
    params: ListApprovedCampSitesParams,
  ): Promise<CampsiteServiceResult<PublicCampSite[]>>;
};

function labelFromValue(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function confidenceFromTrustScore(score: number): CommunityCampsiteMarkerPayload['confidence'] {
  if (score >= 70) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

function ratingFromTrustScore(score: number): CommunityCampsiteMarkerPayload['rating'] {
  if (score >= 85) return 'A';
  if (score >= 65) return 'B';
  if (score >= 35) return 'C';
  return 'D';
}

export function isRenderableCommunityCampSite(site: PublicCampSite): boolean {
  return (
    site.status === 'approved' &&
    site.visibility === 'community' &&
    Number.isFinite(site.latitude) &&
    Number.isFinite(site.longitude)
  );
}

export function filterRenderableCommunityCampSites(sites: PublicCampSite[]): PublicCampSite[] {
  return sites.filter(isRenderableCommunityCampSite);
}

export function createCommunityCampsiteBoundsQuery(
  bounds: CommunityCampsiteBounds,
  filters: CommunityCampsiteFilters = {},
): ListApprovedCampSitesParams {
  return {
    minLat: bounds.minLat,
    minLng: bounds.minLng,
    maxLat: bounds.maxLat,
    maxLng: bounds.maxLng,
    limit: 100,
    ...filters,
  };
}

export async function fetchApprovedCommunityCampsitesForViewport(
  service: CommunityCampsiteLayerService,
  bounds: CommunityCampsiteBounds,
  filters: CommunityCampsiteFilters = {},
): Promise<CampsiteServiceResult<PublicCampSite[]>> {
  const result = await service.listApprovedCommunityCampsitesByBounds(
    createCommunityCampsiteBoundsQuery(bounds, filters),
  );
  if (!result.ok) return result;
  return { ok: true, data: filterRenderableCommunityCampSites(result.data) };
}

export function toCommunityCampsiteMarkerPayload(
  site: PublicCampSite,
  selected = false,
): CommunityCampsiteMarkerPayload {
  const trustScore = Number.isFinite(site.trust_score) ? site.trust_score : 0;
  const confidence = confidenceFromTrustScore(trustScore);
  const rating = ratingFromTrustScore(trustScore);

  return {
    id: `community-campsite:${site.id}`,
    communityCampSiteId: site.id,
    markerKind: 'community_campsite',
    latitude: site.latitude,
    longitude: site.longitude,
    title: site.canonical_name ?? 'Community Campsite',
    subtitle: `${labelFromValue(site.site_type)} - ${labelFromValue(site.access_difficulty)}`,
    category: 'community',
    confidence,
    confidenceScore: Math.max(0, Math.min(100, trustScore)),
    rating,
    score: Math.max(0, Math.min(100, trustScore)),
    rankLabel: 'CM',
    ratingFactors: [
      {
        label: 'Community trust',
        value: `${Math.round(trustScore)}/100`,
        impact: trustScore >= 65 ? 'positive' : trustScore >= 35 ? 'neutral' : 'negative',
      },
      {
        label: 'Legal confidence',
        value: labelFromValue(site.legal_confidence),
        impact: site.legal_confidence === 'high' ? 'positive' : site.legal_confidence === 'unknown' ? 'negative' : 'neutral',
      },
    ],
    selected,
    badges: [
      { label: 'COMMUNITY', tone: 'info' },
      { label: labelFromValue(site.access_difficulty), tone: 'neutral' },
    ],
  };
}

export function buildPrivateSaveInputFromCommunityCampsite(
  site: PublicCampSite,
): CreateCampSiteReportInput {
  return {
    latitude: site.latitude,
    longitude: site.longitude,
    source_type: 'manual',
    location_accuracy_m: null,
    user_stayed_here: false,
    verified_in_person: false,
    visited_at: null,
    site_type: site.site_type,
    access_difficulty: site.access_difficulty,
    vehicle_fit: [...site.vehicle_fit],
    amenities: { ...site.amenities },
    conditions: { ...site.conditions },
    notes: site.canonical_name ? `Saved from ECS community map: ${site.canonical_name}` : null,
    visibility_requested: 'private',
    stewardship_acknowledged: false,
    sensitive_area_acknowledged: false,
  };
}

export function formatCommunityCampsiteValue(value: string | null | undefined): string {
  return labelFromValue(value);
}
