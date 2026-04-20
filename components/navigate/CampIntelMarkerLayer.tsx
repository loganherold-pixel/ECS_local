import { useMemo } from 'react';

import type { CampIntelMarkerPayload, CampIntelSite } from '../../lib/campIntel/campIntelTypes';
import { bucketStableScore } from '../../lib/ai/scoreStability';
import { toCampIntelMarkerPayload } from '../../lib/campIntel/useCampIntel';

function coordinateDistanceScore(a: CampIntelSite, b: CampIntelSite): number {
  return Math.abs(a.coordinate.latitude - b.coordinate.latitude) + Math.abs(a.coordinate.longitude - b.coordinate.longitude);
}

function pushUnique(target: CampIntelSite[], site: CampIntelSite | null | undefined) {
  if (!site) return;
  if (target.some((entry) => entry.id === site.id)) return;
  target.push(site);
}

export function useCampIntelMarkerLayer(
  sites: CampIntelSite[],
  selectedCampId: string | null,
  mapZoom: number,
  visible = true,
): CampIntelMarkerPayload[] {
  return useMemo(() => {
    if (!visible || sites.length === 0) return [];

    const selectedSite = selectedCampId ? sites.find((site) => site.id === selectedCampId) ?? null : null;
    const ranked = [...sites].sort((a, b) => {
      const selectedDelta = Number(b.id === selectedCampId) - Number(a.id === selectedCampId);
      if (selectedDelta !== 0) return selectedDelta;
      const savedDelta = Number(b.isSaved) - Number(a.isSaved);
      if (savedDelta !== 0) return savedDelta;
      const stableScoreDelta =
        bucketStableScore(b.overallScore, 4) - bucketStableScore(a.overallScore, 4);
      if (stableScoreDelta !== 0) return stableScoreDelta;
      return b.overallScore - a.overallScore;
    });

    const zoom = Number.isFinite(mapZoom) ? mapZoom : 10;
    const maxMarkers = zoom >= 13.5 ? 6 : 3;
    const minimumSpacing = zoom >= 13.5 ? 0.0018 : zoom >= 11.5 ? 0.0036 : 0.0075;

    const curated: CampIntelSite[] = [];
    const topSuggested =
      ranked.find((site) => site.classification === 'suggested' || site.category === 'suggested') ??
      ranked[0] ??
      null;
    const bestBackup =
      ranked.find((site) => site.classification === 'backup' || site.category === 'backup') ?? null;
    const bestEmergency =
      ranked.find((site) => site.classification === 'emergency' || site.category === 'emergency') ?? null;

    pushUnique(curated, selectedSite);
    pushUnique(curated, topSuggested);
    pushUnique(curated, bestBackup);
    pushUnique(curated, bestEmergency);

    if (zoom >= 13.5) {
      ranked
        .filter((site) => site.isSaved || site.category === 'saved' || site.category === 'previously_used')
        .slice(0, 2)
        .forEach((site) => pushUnique(curated, site));
    }

    if (zoom >= 13.5) {
      for (const site of ranked) {
        if (curated.some((existing) => existing.id === site.id)) continue;
        const overlaps = curated.some((existing) => coordinateDistanceScore(existing, site) < minimumSpacing);
        if (overlaps && !site.isSaved) continue;
        curated.push(site);
        if (curated.length >= maxMarkers) break;
      }
    }

    return curated.map((site) => toCampIntelMarkerPayload(site, selectedCampId === site.id));
  }, [sites, selectedCampId, mapZoom, visible]);
}

export default useCampIntelMarkerLayer;
