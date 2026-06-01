export type MiniMapCoordinate = {
  latitude: number;
  longitude: number;
};

export type MiniMapLineString = {
  type: 'LineString';
  coordinates: [number, number][];
};

export type MiniMapLineStringFeature = {
  type: 'Feature';
  geometry: MiniMapLineString;
  properties?: Record<string, unknown>;
};

export type MiniMapRouteInput = MiniMapLineString | MiniMapLineStringFeature;

export type MiniMapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

const EARTH_RADIUS_M = 6371008.8;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function normalizeCoordinate(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return [longitude, latitude];
}

function coordinateToPoint(coordinate: [number, number]): MiniMapCoordinate {
  return {
    longitude: coordinate[0],
    latitude: coordinate[1],
  };
}

function pointToCoordinate(point: MiniMapCoordinate): [number, number] {
  return [point.longitude, point.latitude];
}

function getSegmentDistanceM(a: [number, number], b: [number, number]) {
  const lon1 = toRadians(a[0]);
  const lat1 = toRadians(a[1]);
  const lon2 = toRadians(b[0]);
  const lat2 = toRadians(b[1]);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const hav =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
}

function interpolateCoordinate(a: [number, number], b: [number, number], ratio: number): [number, number] {
  const clamped = clamp(ratio, 0, 1);
  return [
    a[0] + (b[0] - a[0]) * clamped,
    a[1] + (b[1] - a[1]) * clamped,
  ];
}

function toPlanarMeters(point: MiniMapCoordinate, origin: MiniMapCoordinate) {
  const latitudeScale = 111320;
  const longitudeScale = Math.cos(toRadians(origin.latitude)) * 111320;
  return {
    x: (point.longitude - origin.longitude) * longitudeScale,
    y: (point.latitude - origin.latitude) * latitudeScale,
  };
}

export function normalizeRouteFeature(routeGeoJson?: MiniMapRouteInput | null): MiniMapLineStringFeature | null {
  const geometry =
    routeGeoJson?.type === 'Feature'
      ? routeGeoJson.geometry
      : routeGeoJson?.type === 'LineString'
        ? routeGeoJson
        : null;
  if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
    return null;
  }
  const coordinates = geometry.coordinates
    .map(normalizeCoordinate)
    .filter((coordinate): coordinate is [number, number] => !!coordinate);
  if (coordinates.length < 2) return null;
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates,
    },
    properties: routeGeoJson?.type === 'Feature' ? routeGeoJson.properties ?? {} : {},
  };
}

export function getRouteDistance(route: MiniMapLineStringFeature | null): number {
  const coordinates = route?.geometry.coordinates ?? [];
  let distance = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    distance += getSegmentDistanceM(coordinates[index - 1], coordinates[index]);
  }
  return distance;
}

export function projectLocationToRouteProgress(
  route: MiniMapLineStringFeature | null,
  currentLocation?: MiniMapCoordinate | null,
): number | null {
  const coordinates = route?.geometry.coordinates ?? [];
  if (coordinates.length < 2 || !currentLocation) return null;

  const origin = coordinateToPoint(coordinates[0]);
  const current = toPlanarMeters(currentLocation, origin);
  const totalDistance = getRouteDistance(route);
  if (totalDistance <= 0) return null;

  let bestDistanceSq = Number.POSITIVE_INFINITY;
  let bestDistanceAlong = 0;
  let distanceAlong = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    const startCoordinate = coordinates[index - 1];
    const endCoordinate = coordinates[index];
    const segmentDistance = getSegmentDistanceM(startCoordinate, endCoordinate);
    const start = toPlanarMeters(coordinateToPoint(startCoordinate), origin);
    const end = toPlanarMeters(coordinateToPoint(endCoordinate), origin);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLengthSq = dx * dx + dy * dy;
    const projectionRatio = segmentLengthSq > 0
      ? clamp(((current.x - start.x) * dx + (current.y - start.y) * dy) / segmentLengthSq, 0, 1)
      : 0;
    const projected = {
      x: start.x + dx * projectionRatio,
      y: start.y + dy * projectionRatio,
    };
    const distanceSq = (current.x - projected.x) ** 2 + (current.y - projected.y) ** 2;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestDistanceAlong = distanceAlong + segmentDistance * projectionRatio;
    }
    distanceAlong += segmentDistance;
  }

  return clamp((bestDistanceAlong / totalDistance) * 100, 0, 100);
}

export function splitRouteAtProgress(
  route: MiniMapLineStringFeature | null,
  progressPercent: number,
): {
  completedRouteGeoJson: MiniMapLineStringFeature | null;
  remainingRouteGeoJson: MiniMapLineStringFeature | null;
} {
  const coordinates = route?.geometry.coordinates ?? [];
  if (coordinates.length < 2) {
    return { completedRouteGeoJson: null, remainingRouteGeoJson: route };
  }

  const totalDistance = getRouteDistance(route);
  if (totalDistance <= 0) {
    return { completedRouteGeoJson: null, remainingRouteGeoJson: route };
  }

  const targetDistance = totalDistance * (clamp(progressPercent, 0, 100) / 100);
  const completed: [number, number][] = [coordinates[0]];
  const remaining: [number, number][] = [];
  let distance = 0;
  let splitCoordinate: [number, number] | null = null;

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const segmentDistance = getSegmentDistanceM(start, end);
    const nextDistance = distance + segmentDistance;

    if (!splitCoordinate && targetDistance <= nextDistance) {
      const ratio = segmentDistance > 0 ? (targetDistance - distance) / segmentDistance : 0;
      splitCoordinate = interpolateCoordinate(start, end, ratio);
      completed.push(splitCoordinate);
      remaining.push(splitCoordinate, end);
    } else if (splitCoordinate) {
      remaining.push(end);
    } else {
      completed.push(end);
    }

    distance = nextDistance;
  }

  if (!splitCoordinate) {
    splitCoordinate = coordinates[coordinates.length - 1];
    remaining.push(splitCoordinate);
  }

  return {
    completedRouteGeoJson: completed.length > 1
      ? { type: 'Feature', geometry: { type: 'LineString', coordinates: completed }, properties: {} }
      : null,
    remainingRouteGeoJson: remaining.length > 1
      ? { type: 'Feature', geometry: { type: 'LineString', coordinates: remaining }, properties: {} }
      : null,
  };
}

export function getRouteBearing(route: MiniMapLineStringFeature | null): number | null {
  const coordinates = route?.geometry.coordinates ?? [];
  if (coordinates.length < 2) return null;
  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];
  const startLat = toRadians(start[1]);
  const endLat = toRadians(end[1]);
  const deltaLon = toRadians(end[0] - start[0]);
  const y = Math.sin(deltaLon) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLon);
  const bearing = (toDegrees(Math.atan2(y, x)) + 360) % 360;
  return Number.isFinite(bearing) ? bearing : null;
}

export function getRouteCameraBearing(route: MiniMapLineStringFeature | null): number {
  const routeBearing = getRouteBearing(route);
  if (routeBearing == null) return 0;
  return (routeBearing - 90 + 360) % 360;
}

export function getRouteBounds(
  route: MiniMapLineStringFeature | null,
  extraPoints: (MiniMapCoordinate | null | undefined)[] = [],
): MiniMapBounds | null {
  const routePoints = (route?.geometry.coordinates ?? []).map(coordinateToPoint);
  const points = [
    ...routePoints,
    ...extraPoints.filter((point): point is MiniMapCoordinate =>
      !!point &&
      isFiniteNumber(point.latitude) &&
      isFiniteNumber(point.longitude),
    ),
  ];
  if (points.length === 0) return null;
  return points.reduce<MiniMapBounds>(
    (bounds, point) => ({
      north: Math.max(bounds.north, point.latitude),
      south: Math.min(bounds.south, point.latitude),
      east: Math.max(bounds.east, point.longitude),
      west: Math.min(bounds.west, point.longitude),
    }),
    {
      north: points[0].latitude,
      south: points[0].latitude,
      east: points[0].longitude,
      west: points[0].longitude,
    },
  );
}

export function getCurrentPointOnRoute(
  route: MiniMapLineStringFeature | null,
  progressPercent: number,
): MiniMapCoordinate | null {
  const split = splitRouteAtProgress(route, progressPercent).completedRouteGeoJson;
  const coordinates = split?.geometry.coordinates ?? [];
  if (coordinates.length === 0) return null;
  return coordinateToPoint(coordinates[coordinates.length - 1]);
}

export function featureToRoutePoints(route: MiniMapLineStringFeature | null): MiniMapCoordinate[] {
  return (route?.geometry.coordinates ?? []).map(coordinateToPoint);
}

export function pointsToLineStringFeature(points: MiniMapCoordinate[]): MiniMapLineStringFeature | null {
  const coordinates = points
    .filter((point) => isFiniteNumber(point.latitude) && isFiniteNumber(point.longitude))
    .map(pointToCoordinate);
  if (coordinates.length < 2) return null;
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates,
    },
    properties: {},
  };
}
