export type DashboardNavigationPoint = {
  latitude: number;
  longitude: number;
};

export type DashboardNavigationRoutePoint = {
  lat: number;
  lng: number;
};

export type DashboardNavigationChaseBearingSource =
  | 'gps-heading'
  | 'route-session-heading'
  | 'route-ahead'
  | 'fallback'
  | 'none';

export type DashboardNavigationChaseCamera = {
  userLocation: DashboardNavigationPoint | null;
  cameraTarget: DashboardNavigationPoint | null;
  bearingDeg: number | null;
  bearingSource: DashboardNavigationChaseBearingSource;
};

const EARTH_RADIUS_M = 6371008.8;
const MIN_ROUTE_AHEAD_DISTANCE_M = 18;
const ROUTE_AHEAD_LOOKUP_DISTANCE_M = 95;
const MAX_ROUTE_SNAP_DISTANCE_M = 900;
const DEFAULT_ACTIVE_LOOKAHEAD_M = 62;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

export function normalizeNavigationBearingDeg(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function isValidDashboardNavigationPoint(
  point: DashboardNavigationPoint | null | undefined,
): point is DashboardNavigationPoint {
  return (
    !!point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

export function getDashboardNavigationDistanceMeters(
  from: DashboardNavigationPoint,
  to: DashboardNavigationPoint,
): number {
  if (!isValidDashboardNavigationPoint(from) || !isValidDashboardNavigationPoint(to)) return Number.POSITIVE_INFINITY;
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const halfChord =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(halfChord), Math.sqrt(Math.max(0, 1 - halfChord)));
}

export function getDashboardNavigationBearingBetween(
  from: DashboardNavigationPoint,
  to: DashboardNavigationPoint,
): number | null {
  if (!isValidDashboardNavigationPoint(from) || !isValidDashboardNavigationPoint(to)) return null;
  if (getDashboardNavigationDistanceMeters(from, to) < 2) return null;
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return normalizeNavigationBearingDeg(toDegrees(Math.atan2(y, x)));
}

export function projectDashboardNavigationPoint(
  point: DashboardNavigationPoint,
  bearingDeg: number,
  distanceMeters: number,
): DashboardNavigationPoint | null {
  if (!isValidDashboardNavigationPoint(point)) return null;
  const bearing = normalizeNavigationBearingDeg(bearingDeg);
  if (bearing == null || !Number.isFinite(distanceMeters) || distanceMeters <= 0) return point;

  const angularDistance = distanceMeters / EARTH_RADIUS_M;
  const bearingRad = toRadians(bearing);
  const lat1 = toRadians(point.latitude);
  const lon1 = toRadians(point.longitude);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    latitude: toDegrees(lat2),
    longitude: ((toDegrees(lon2) + 540) % 360) - 180,
  };
}

function normalizeRoutePoint(point: DashboardNavigationRoutePoint | null | undefined): DashboardNavigationPoint | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  return {
    latitude: point.lat,
    longitude: point.lng,
  };
}

export function resolveRouteAheadBearingDeg(
  currentLocation: DashboardNavigationPoint | null | undefined,
  routePoints: readonly DashboardNavigationRoutePoint[] | null | undefined,
  lookAheadMeters = ROUTE_AHEAD_LOOKUP_DISTANCE_M,
): number | null {
  if (!isValidDashboardNavigationPoint(currentLocation) || !Array.isArray(routePoints) || routePoints.length < 2) {
    return null;
  }

  const normalizedRoute = routePoints
    .map(normalizeRoutePoint)
    .filter((point): point is DashboardNavigationPoint => isValidDashboardNavigationPoint(point));
  if (normalizedRoute.length < 2) return null;

  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  normalizedRoute.forEach((point, index) => {
    const distance = getDashboardNavigationDistanceMeters(currentLocation, point);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  if (nearestIndex < 0 || nearestDistance > MAX_ROUTE_SNAP_DISTANCE_M) return null;

  let aheadPoint = normalizedRoute[Math.min(nearestIndex + 1, normalizedRoute.length - 1)];
  let accumulatedMeters = 0;
  for (let index = nearestIndex; index < normalizedRoute.length - 1; index += 1) {
    const from = normalizedRoute[index];
    const to = normalizedRoute[index + 1];
    accumulatedMeters += getDashboardNavigationDistanceMeters(from, to);
    aheadPoint = to;
    if (accumulatedMeters >= Math.max(MIN_ROUTE_AHEAD_DISTANCE_M, lookAheadMeters)) break;
  }

  return getDashboardNavigationBearingBetween(currentLocation, aheadPoint);
}

export function resolveDashboardNavigationChaseCamera(input: {
  currentLocation: DashboardNavigationPoint | null | undefined;
  routePoints?: readonly DashboardNavigationRoutePoint[] | null;
  gpsHeadingDeg?: number | null;
  routeSessionHeadingDeg?: number | null;
  fallbackBearingDeg?: number | null;
  hasActiveGuidance?: boolean;
  speedMph?: number | null;
  activeLookAheadMeters?: number;
}): DashboardNavigationChaseCamera {
  const userLocation = isValidDashboardNavigationPoint(input.currentLocation)
    ? input.currentLocation
    : null;
  if (!userLocation) {
    return {
      userLocation: null,
      cameraTarget: null,
      bearingDeg: null,
      bearingSource: 'none',
    };
  }

  const gpsHeading = normalizeNavigationBearingDeg(input.gpsHeadingDeg);
  const routeSessionHeading = normalizeNavigationBearingDeg(input.routeSessionHeadingDeg);
  const routeAheadHeading = input.hasActiveGuidance
    ? resolveRouteAheadBearingDeg(userLocation, input.routePoints)
    : null;
  const fallbackHeading = normalizeNavigationBearingDeg(input.fallbackBearingDeg);

  const bearingDeg =
    gpsHeading ??
    routeAheadHeading ??
    routeSessionHeading ??
    fallbackHeading;
  const bearingSource: DashboardNavigationChaseBearingSource =
    gpsHeading != null
      ? 'gps-heading'
      : routeAheadHeading != null
        ? 'route-ahead'
        : routeSessionHeading != null
          ? 'route-session-heading'
          : fallbackHeading != null
            ? 'fallback'
            : 'none';

  const speedMph = typeof input.speedMph === 'number' && Number.isFinite(input.speedMph)
    ? Math.max(0, input.speedMph)
    : null;
  const activeLookAheadMeters =
    input.activeLookAheadMeters ??
    (speedMph != null && speedMph > 35
      ? 90
      : speedMph != null && speedMph < 7
        ? 42
        : DEFAULT_ACTIVE_LOOKAHEAD_M);

  const cameraTarget =
    input.hasActiveGuidance && bearingDeg != null
      ? projectDashboardNavigationPoint(userLocation, bearingDeg, activeLookAheadMeters)
      : userLocation;

  return {
    userLocation,
    cameraTarget: cameraTarget ?? userLocation,
    bearingDeg,
    bearingSource,
  };
}
