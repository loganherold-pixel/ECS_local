import type { NavigateRouteMapPoint } from './navigateRouteSessionStore';

type CoordinateLike = {
  lat?: number | null;
  lng?: number | null;
  lon?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  ele?: number | null;
  ele_m?: number | null;
  elevationFeet?: number | null;
  elevationFt?: number | null;
  altitudeFt?: number | null;
} | null | undefined;

export type ActiveGuidanceProgressPathInput = {
  active: boolean;
  routePoints?: CoordinateLike[] | null;
  progressPoints?: CoordinateLike[] | null;
  currentLocation?: CoordinateLike;
};

const DUPLICATE_EPSILON_DEGREES = 0.000001;
const EARTH_RADIUS_M = 6371000;
const DEFAULT_ACTIVE_GUIDANCE_SNAP_DISTANCE_M = 42;

function normalizeCoordinate(point: CoordinateLike): NavigateRouteMapPoint | null {
  if (!point) return null;
  const lat = Number(point.lat ?? point.latitude);
  const lng = Number(point.lng ?? point.lon ?? point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const ele = Number(point.ele ?? point.ele_m);
  const elevationFeet = Number(point.elevationFeet ?? point.elevationFt ?? point.altitudeFt);
  return {
    lat,
    lng,
    ...(Number.isFinite(ele) ? { ele, ele_m: ele } : null),
    ...(Number.isFinite(elevationFeet) ? { elevationFeet } : null),
  };
}

function normalizeCoordinateList(points: CoordinateLike[] | null | undefined): NavigateRouteMapPoint[] {
  if (!Array.isArray(points)) return [];
  const normalized: NavigateRouteMapPoint[] = [];
  points.forEach((point) => {
    const coordinate = normalizeCoordinate(point);
    if (!coordinate) return;
    const previous = normalized[normalized.length - 1];
    if (previous && sameCoordinate(previous, coordinate)) return;
    normalized.push(coordinate);
  });
  return normalized;
}

function sameCoordinate(a: NavigateRouteMapPoint, b: NavigateRouteMapPoint): boolean {
  return (
    Math.abs(a.lat - b.lat) <= DUPLICATE_EPSILON_DEGREES &&
    Math.abs(a.lng - b.lng) <= DUPLICATE_EPSILON_DEGREES
  );
}

function distanceMeters(a: NavigateRouteMapPoint, b: NavigateRouteMapPoint): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function projectPointToSegmentMeters(
  point: NavigateRouteMapPoint,
  start: NavigateRouteMapPoint,
  end: NavigateRouteMapPoint,
): { point: NavigateRouteMapPoint; distanceM: number } {
  const originLatRad = (point.lat * Math.PI) / 180;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = Math.max(1, 111320 * Math.cos(originLatRad));
  const sx = (start.lng - point.lng) * metersPerDegreeLng;
  const sy = (start.lat - point.lat) * metersPerDegreeLat;
  const ex = (end.lng - point.lng) * metersPerDegreeLng;
  const ey = (end.lat - point.lat) * metersPerDegreeLat;
  const vx = ex - sx;
  const vy = ey - sy;
  const lengthSquared = vx * vx + vy * vy;
  const t = lengthSquared > 0 ? Math.max(0, Math.min(1, -(sx * vx + sy * vy) / lengthSquared)) : 0;
  const projectedX = sx + vx * t;
  const projectedY = sy + vy * t;
  const projected = {
    lat: point.lat + projectedY / metersPerDegreeLat,
    lng: point.lng + projectedX / metersPerDegreeLng,
  };
  return {
    point: projected,
    distanceM: distanceMeters(point, projected),
  };
}

function projectPointToRoute(
  point: NavigateRouteMapPoint,
  routePoints: NavigateRouteMapPoint[],
): { point: NavigateRouteMapPoint; distanceM: number } | null {
  if (routePoints.length < 2) return null;
  let best: { point: NavigateRouteMapPoint; distanceM: number } | null = null;
  for (let index = 1; index < routePoints.length; index += 1) {
    const candidate = projectPointToSegmentMeters(point, routePoints[index - 1], routePoints[index]);
    if (!best || candidate.distanceM < best.distanceM) best = candidate;
  }
  return best;
}

export function resolveActiveGuidanceDisplayLocation(input: ActiveGuidanceProgressPathInput & {
  maxSnapDistanceM?: number | null;
}): NavigateRouteMapPoint | null {
  const liveLocation = normalizeCoordinate(input.currentLocation);
  if (!liveLocation) return null;
  if (!input.active) return liveLocation;

  const routePoints = normalizeCoordinateList(input.routePoints);
  const projection = projectPointToRoute(liveLocation, routePoints);
  const maxSnapDistanceM =
    typeof input.maxSnapDistanceM === 'number' && Number.isFinite(input.maxSnapDistanceM)
      ? Math.max(0, input.maxSnapDistanceM)
      : DEFAULT_ACTIVE_GUIDANCE_SNAP_DISTANCE_M;
  return projection && projection.distanceM <= maxSnapDistanceM
    ? projection.point
    : liveLocation;
}

export function buildActiveGuidanceProgressPath(input: ActiveGuidanceProgressPathInput): NavigateRouteMapPoint[] {
  const progressPoints = normalizeCoordinateList(input.progressPoints);
  if (!input.active) return progressPoints;

  const liveLocation = normalizeCoordinate(input.currentLocation);
  if (!liveLocation || progressPoints.length < 2) return progressPoints;

  const lastProgressPoint = progressPoints[progressPoints.length - 1] ?? null;
  if (lastProgressPoint && sameCoordinate(lastProgressPoint, liveLocation)) {
    return progressPoints;
  }

  return progressPoints;
}
