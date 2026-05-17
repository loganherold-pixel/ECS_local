import { useMemo } from 'react';

import type { CampIntelMarkerPayload, CampIntelSite } from '../../lib/campIntel/campIntelTypes';
import { MAX_CAMPSITE_MARKERS } from '../../lib/campsites/campsiteThresholds';
import { toCampIntelMarkerPayload } from '../../lib/campIntel/useCampIntel';

function compareCampIntelMarkerRank(a: CampIntelSite, b: CampIntelSite): number {
  return (
    b.overallScore - a.overallScore ||
    b.confidenceScore - a.confidenceScore ||
    (a.detourDistanceMiles ?? Number.POSITIVE_INFINITY) -
      (b.detourDistanceMiles ?? Number.POSITIVE_INFINITY) ||
    a.label.localeCompare(b.label) ||
    a.id.localeCompare(b.id)
  );
}

export function rankCampIntelSitesForMarkerDisplay(sites: CampIntelSite[]): CampIntelSite[] {
  return [...sites].sort(compareCampIntelMarkerRank);
}

export function useCampIntelMarkerLayer(
  sites: CampIntelSite[],
  selectedCampId: string | null,
  _mapZoom: number,
  visible = true,
): CampIntelMarkerPayload[] {
  return useMemo(() => {
    if (!visible || sites.length === 0) return [];

    // The locator service owns scoring; this layer ranks and caps only the displayed marker set.
    return rankCampIntelSitesForMarkerDisplay(sites)
      .slice(0, MAX_CAMPSITE_MARKERS)
      .map((site, index) => ({
        ...toCampIntelMarkerPayload(site, selectedCampId === site.id),
        rank: index + 1,
        rankLabel: String(index + 1),
      }));
  }, [sites, selectedCampId, visible]);
}

export default useCampIntelMarkerLayer;
