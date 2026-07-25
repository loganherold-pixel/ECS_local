import type {
  TerrainIntelligenceRiskSegment,
  TerrainIntelligenceSnapshot,
} from './terrainIntelligencePresentation';
import type { TerrainProfilePoint } from './terrainRiskCommandProfile';

export type TerrainCommandRange = 'next_1_mi' | 'next_5_mi' | 'full_route';
export type TerrainCommandRoutePoint = { lat: number; lng: number };

export type TerrainCommandVisibleProfile = {
  profile: TerrainProfilePoint[];
  startDistanceMiles: number;
  endDistanceMiles: number;
  spanMiles: number;
  label: string;
};

export function buildTerrainCommandVisibleProfile(
  snapshot: TerrainIntelligenceSnapshot,
  range: TerrainCommandRange,
  progressDistanceMiles = snapshot.currentProgressDistanceMiles,
): TerrainCommandVisibleProfile {
  return buildTerrainCommandVisibleProfileFromPoints(
    snapshot.expandedProfile,
    range,
    progressDistanceMiles,
  );
}

export function buildTerrainCommandVisibleProfileFromPoints(
  source: TerrainProfilePoint[],
  range: TerrainCommandRange,
  progressDistanceMiles: number | null,
): TerrainCommandVisibleProfile {
  const routeEnd = source[source.length - 1]?.distanceMiles ?? 0;
  const progress = Math.max(0, Math.min(progressDistanceMiles ?? 0, routeEnd));
  const start = range === 'full_route' ? 0 : progress;
  const requestedSpan = range === 'next_1_mi' ? 1 : range === 'next_5_mi' ? 5 : routeEnd;
  const end = range === 'full_route' ? routeEnd : Math.min(routeEnd, start + requestedSpan);
  const visible = source.filter((point) => point.distanceMiles >= start && point.distanceMiles <= end);
  const bounded = visible.length >= 2
    ? visible
    : [...source]
        .sort((left, right) =>
          Math.abs(left.distanceMiles - start) - Math.abs(right.distanceMiles - start))
        .slice(0, 2)
        .sort((left, right) => left.distanceMiles - right.distanceMiles);
  return {
    profile: bounded.map((point) => ({
      ...point,
      distanceMiles: Math.max(0, Math.min(Math.max(0, end - start), point.distanceMiles - start)),
    })),
    startDistanceMiles: start,
    endDistanceMiles: end,
    spanMiles: Math.max(0, end - start),
    label: `${start.toFixed(1)}–${end.toFixed(1)} MI`,
  };
}

export function selectTerrainCommandRiskSegment(
  segments: readonly TerrainIntelligenceRiskSegment[],
  distanceMiles: number | null,
): TerrainIntelligenceRiskSegment | null {
  if (distanceMiles == null) return null;
  return segments.find((segment) =>
    distanceMiles >= segment.startDistanceMiles && distanceMiles <= segment.endDistanceMiles) ?? null;
}

export function resolveTerrainCommandInteractionPolicy(isDriving: boolean) {
  return {
    autoFollowForced: isDriving,
    scrubbingEnabled: !isDriving,
    rangeControlsEnabled: !isDriving,
    emphasizeOnlyNextEvent: isDriving,
    reducedMotion: isDriving,
  };
}

function haversineMiles(a: TerrainCommandRoutePoint, b: TerrainCommandRoutePoint): number {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function projectTerrainInspectionCoordinate(
  points: readonly TerrainCommandRoutePoint[],
  distanceMiles: number,
): { lat: number; lng: number } | null {
  const valid = points.filter((point) =>
    Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180);
  if (valid.length === 0) return null;
  if (valid.length === 1 || distanceMiles <= 0) return { lat: valid[0].lat, lng: valid[0].lng };
  let cumulative = 0;
  for (let index = 1; index < valid.length; index += 1) {
    const previous = valid[index - 1];
    const next = valid[index];
    const span = haversineMiles(previous, next);
    if (cumulative + span >= distanceMiles && span > 0) {
      const ratio = Math.max(0, Math.min(1, (distanceMiles - cumulative) / span));
      return {
        lat: previous.lat + (next.lat - previous.lat) * ratio,
        lng: previous.lng + (next.lng - previous.lng) * ratio,
      };
    }
    cumulative += span;
  }
  const last = valid[valid.length - 1];
  return { lat: last.lat, lng: last.lng };
}
