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

function distanceMilesBetween(
  a: NavigateRouteProfileCoordinate,
  b: NavigateRouteProfileCoordinate,
): number {
  const radiusMiles = 3958.8;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function interpolateRouteCoordinateByRatio(
  routeCoordinates: NavigateRouteProfileCoordinate[],
  distanceRatio: number,
): NavigateRouteProfileCoordinate | null {
  if (routeCoordinates.length === 0) return null;
  if (routeCoordinates.length === 1) return routeCoordinates[0];

  const clampedRatio = clamp(distanceRatio, 0, 1);
  const cumulativeDistances = [0];
  let routeDistanceMiles = 0;
  for (let index = 1; index < routeCoordinates.length; index += 1) {
    routeDistanceMiles += distanceMilesBetween(routeCoordinates[index - 1], routeCoordinates[index]);
    cumulativeDistances.push(routeDistanceMiles);
  }

  if (!Number.isFinite(routeDistanceMiles) || routeDistanceMiles <= 0) {
    const coordinateIndex = Math.min(
      routeCoordinates.length - 1,
      Math.max(0, Math.round(clampedRatio * (routeCoordinates.length - 1))),
    );
    return routeCoordinates[coordinateIndex];
  }

  const targetDistanceMiles = routeDistanceMiles * clampedRatio;
  for (let index = 1; index < cumulativeDistances.length; index += 1) {
    const previousDistance = cumulativeDistances[index - 1];
    const nextDistance = cumulativeDistances[index];
    if (targetDistanceMiles > nextDistance) continue;

    const segmentDistance = Math.max(0, nextDistance - previousDistance);
    const segmentRatio =
      segmentDistance > 0
        ? clamp((targetDistanceMiles - previousDistance) / segmentDistance, 0, 1)
        : 0;
    const previous = routeCoordinates[index - 1];
    const next = routeCoordinates[index];
    return {
      latitude: previous.latitude + (next.latitude - previous.latitude) * segmentRatio,
      longitude: previous.longitude + (next.longitude - previous.longitude) * segmentRatio,
    };
  }

  return routeCoordinates[routeCoordinates.length - 1];
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

  const ratio = clamp(distanceMiles / totalDistance, 0, 1);
  const coordinate = interpolateRouteCoordinateByRatio(routeCoordinates, ratio);
  if (!coordinate) return null;
  const referenceEvent =
    (input.referenceEvents ?? []).find((event) => Math.abs(event.distanceMiles - distanceMiles) <= 0.08) ?? null;

  return {
    point,
    coordinate,
    distanceMiles,
    referenceEvent,
  };
}
