import type { NavigateRouteMapPoint } from './navigateRouteSessionStore';
import { resolveGuidanceRouteProgress } from './navigation/guidanceRouteProjection';

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
  snappedLocation?: CoordinateLike;
  isOffRoute?: boolean | null;
  accuracyM?: number | null;
  headingDeg?: number | null;
};

const DUPLICATE_EPSILON_DEGREES = 0.000001;
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

export function resolveNavigateMapUserLocation(input: {
  rawLocation: CoordinateLike;
  locationAccessGranted: boolean;
  mapFrozen?: boolean;
}): NavigateRouteMapPoint | null {
  if (!input.locationAccessGranted || input.mapFrozen === true) return null;
  return normalizeCoordinate(input.rawLocation);
}

export function resolveActiveGuidanceDisplayLocation(input: ActiveGuidanceProgressPathInput & {
  maxSnapDistanceM?: number | null;
}): NavigateRouteMapPoint | null {
  const liveLocation = normalizeCoordinate(input.currentLocation);
  if (!liveLocation) return null;
  if (!input.active) return liveLocation;
  if (input.isOffRoute === true) return liveLocation;

  const acceptedSnappedLocation = normalizeCoordinate(input.snappedLocation);
  if (acceptedSnappedLocation) return acceptedSnappedLocation;

  const maxSnapDistanceM =
    typeof input.maxSnapDistanceM === 'number' && Number.isFinite(input.maxSnapDistanceM)
      ? Math.max(0, input.maxSnapDistanceM)
      : DEFAULT_ACTIVE_GUIDANCE_SNAP_DISTANCE_M;

  const progressPoints = normalizeCoordinateList(input.progressPoints);
  const routePoints = normalizeCoordinateList(input.routePoints);
  const projectionGeometry = progressPoints.length > 1 ? progressPoints : routePoints;
  const projection = resolveGuidanceRouteProgress({
    rawPosition: liveLocation,
    routeGeometry: projectionGeometry,
    context: 'road',
    accuracyM: input.accuracyM,
    headingDeg: input.headingDeg,
    snapToleranceM: maxSnapDistanceM,
  });
  return projection.snappedPosition ?? liveLocation;
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
