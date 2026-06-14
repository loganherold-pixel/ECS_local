import type { TerrainProfilePoint } from './terrainRiskCommandProfile';
import type { TerrainRiskReferenceEvent } from './terrainRiskReferenceEvents';

export type NavigateRouteProfileCoordinate = {
  latitude: number;
  longitude: number;
};

export type NavigateRouteProfileFocus = {
  point: TerrainProfilePoint;
  coordinate: NavigateRouteProfileCoordinate;
  distanceMiles: number;
  referenceEvent: TerrainRiskReferenceEvent | null;
};

export type ResolveNavigateRouteProfileFocusInput = {
  profile: TerrainProfilePoint[];
  routeCoordinates: NavigateRouteProfileCoordinate[];
  referenceEvents?: TerrainRiskReferenceEvent[];
  distanceMiles?: number | null;
  distanceRatio?: number | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nearestProfilePoint(
  profile: TerrainProfilePoint[],
  distanceMiles: number,
): TerrainProfilePoint | null {
  let nearest: TerrainProfilePoint | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const point of profile) {
    const distance = Math.abs(point.distanceMiles - distanceMiles);
    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function resolveNavigateRouteProfileFocus(
  input: ResolveNavigateRouteProfileFocusInput,
): NavigateRouteProfileFocus | null {
  const profile = input.profile ?? [];
  const routeCoordinates = input.routeCoordinates ?? [];
  if (profile.length === 0 || routeCoordinates.length === 0) return null;

  const totalDistance = Math.max(...profile.map((point) => point.distanceMiles).filter(Number.isFinite));
  if (!Number.isFinite(totalDistance) || totalDistance <= 0) return null;
  const distanceMiles =
    Number.isFinite(input.distanceMiles ?? NaN)
      ? clamp(input.distanceMiles ?? 0, 0, totalDistance)
      : clamp(input.distanceRatio ?? 0, 0, 1) * totalDistance;
  const point = nearestProfilePoint(profile, distanceMiles);
  if (!point) return null;

  const ratio = clamp(point.distanceMiles / totalDistance, 0, 1);
  const coordinateIndex = Math.min(
    routeCoordinates.length - 1,
    Math.max(0, Math.round(ratio * (routeCoordinates.length - 1))),
  );
  const coordinate = routeCoordinates[coordinateIndex];
  const referenceEvent =
    (input.referenceEvents ?? []).find((event) => Math.abs(event.distanceMiles - point.distanceMiles) <= 0.08) ?? null;

  return {
    point,
    coordinate,
    distanceMiles: point.distanceMiles,
    referenceEvent,
  };
}
