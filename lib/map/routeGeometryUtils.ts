import type { GeoJSON } from './dispersedCampingTypes';

export type RouteCoordinate =
  | { lat?: number | null; lng?: number | null; latitude?: number | null; longitude?: number | null }
  | [number, number]
  | null
  | undefined;

export type NormalizedRouteCoordinate = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_MILES = 3958.7613;
const MIN_VALID_LATITUDE = -90;
const MAX_VALID_LATITUDE = 90;
const MIN_VALID_LONGITUDE = -180;
const MAX_VALID_LONGITUDE = 180;

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidLatitude(value: number): boolean {
  return value >= MIN_VALID_LATITUDE && value <= MAX_VALID_LATITUDE;
}

function isValidLongitude(value: number): boolean {
  return value >= MIN_VALID_LONGITUDE && value <= MAX_VALID_LONGITUDE;
}

export function normalizeRouteCoordinate(
  coordinate: RouteCoordinate,
): NormalizedRouteCoordinate | null {
  if (!coordinate) return null;

  const latitude = Array.isArray(coordinate)
    ? coordinate[1]
    : coordinate.latitude ?? coordinate.lat;
  const longitude = Array.isArray(coordinate)
    ? coordinate[0]
    : coordinate.longitude ?? coordinate.lng;

  if (!isFiniteCoordinate(latitude) || !isFiniteCoordinate(longitude)) return null;
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;

  return { latitude, longitude };
}

export function normalizeRouteCoordinates(
  coordinates: readonly RouteCoordinate[] | null | undefined,
): NormalizedRouteCoordinate[] {
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .map(normalizeRouteCoordinate)
    .filter((coordinate): coordinate is NormalizedRouteCoordinate => coordinate != null);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMiles(
  a: NormalizedRouteCoordinate,
  b: NormalizedRouteCoordinate,
): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLng = toRadians(b.longitude - a.longitude);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const value =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function projectToMiles(
  coordinate: NormalizedRouteCoordinate,
  origin: NormalizedRouteCoordinate,
): { x: number; y: number } {
  const latRadians = toRadians(origin.latitude);
  const milesPerDegreeLatitude = 69.0;
  const milesPerDegreeLongitude = 69.172 * Math.cos(latRadians);
  return {
    x: (coordinate.longitude - origin.longitude) * milesPerDegreeLongitude,
    y: (coordinate.latitude - origin.latitude) * milesPerDegreeLatitude,
  };
}

function distancePointToSegmentMiles(
  point: NormalizedRouteCoordinate,
  segmentStart: NormalizedRouteCoordinate,
  segmentEnd: NormalizedRouteCoordinate,
): number {
  const p = projectToMiles(point, segmentStart);
  const a = { x: 0, y: 0 };
  const b = projectToMiles(segmentEnd, segmentStart);
  const segmentLengthSquared = b.x * b.x + b.y * b.y;
  if (segmentLengthSquared <= 0) {
    return haversineDistanceMiles(point, segmentStart);
  }

  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / segmentLengthSquared),
  );
  const closest = {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  };
  const dx = p.x - closest.x;
  const dy = p.y - closest.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distancePointToRouteMiles(
  point: NormalizedRouteCoordinate,
  routeCoordinates: readonly RouteCoordinate[] | null | undefined,
): number | null {
  const route = normalizeRouteCoordinates(routeCoordinates);
  if (route.length === 0) return null;
  if (route.length === 1) return haversineDistanceMiles(point, route[0]);

  let minDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < route.length; index += 1) {
    minDistance = Math.min(
      minDistance,
      distancePointToSegmentMiles(point, route[index - 1], route[index]),
    );
  }
  return Number.isFinite(minDistance) ? minDistance : null;
}

function positionToCoordinate(position: GeoJSON.Position): NormalizedRouteCoordinate | null {
  const [longitude, latitude] = position;
  if (!isFiniteCoordinate(latitude) || !isFiniteCoordinate(longitude)) return null;
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
  return { latitude, longitude };
}

export function polygonGeometryToCoordinates(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): NormalizedRouteCoordinate[] {
  const rings =
    geometry.type === 'Polygon'
      ? geometry.coordinates
      : geometry.coordinates.flatMap((polygon) => polygon);

  return rings
    .flatMap((ring) => ring)
    .map(positionToCoordinate)
    .filter((coordinate): coordinate is NormalizedRouteCoordinate => coordinate != null);
}

export function getGeometryCentroid(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): NormalizedRouteCoordinate | null {
  const coordinates = polygonGeometryToCoordinates(geometry);
  if (coordinates.length === 0) return null;
  const totals = coordinates.reduce(
    (sum, coordinate) => ({
      latitude: sum.latitude + coordinate.latitude,
      longitude: sum.longitude + coordinate.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: totals.latitude / coordinates.length,
    longitude: totals.longitude / coordinates.length,
  };
}

function pointInRing(point: NormalizedRouteCoordinate, ring: GeoJSON.Position[]): boolean {
  let inside = false;
  const x = point.longitude;
  const y = point.latitude;

  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const current = positionToCoordinate(ring[index]);
    const previous = positionToCoordinate(ring[previousIndex]);
    if (!current || !previous) continue;

    const intersects =
      current.latitude > y !== previous.latitude > y &&
      x <
        ((previous.longitude - current.longitude) * (y - current.latitude)) /
          (previous.latitude - current.latitude || Number.EPSILON) +
          current.longitude;
    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygon(point: NormalizedRouteCoordinate, polygon: GeoJSON.Position[][]): boolean {
  const [outerRing, ...holes] = polygon;
  if (!outerRing || !pointInRing(point, outerRing)) return false;
  return !holes.some((hole) => pointInRing(point, hole));
}

export function pointInPolygonGeometry(
  point: NormalizedRouteCoordinate,
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): boolean {
  if (geometry.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
  return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
}

export function distanceRegionToRouteMiles(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  routeCoordinates: readonly RouteCoordinate[] | null | undefined,
): number | null {
  const route = normalizeRouteCoordinates(routeCoordinates);
  if (route.some((coordinate) => pointInPolygonGeometry(coordinate, geometry))) {
    return 0;
  }

  const regionCoordinates = polygonGeometryToCoordinates(geometry);
  if (regionCoordinates.length === 0) return null;

  let minDistance = Number.POSITIVE_INFINITY;
  for (const coordinate of regionCoordinates) {
    const distance = distancePointToRouteMiles(coordinate, routeCoordinates);
    if (distance != null) minDistance = Math.min(minDistance, distance);
  }

  const centroid = getGeometryCentroid(geometry);
  if (centroid) {
    const centroidDistance = distancePointToRouteMiles(centroid, routeCoordinates);
    if (centroidDistance != null) minDistance = Math.min(minDistance, centroidDistance);
  }

  return Number.isFinite(minDistance) ? minDistance : null;
}

export function getClosestRouteIndex(
  point: NormalizedRouteCoordinate,
  routeCoordinates: readonly RouteCoordinate[] | null | undefined,
): number | null {
  const route = normalizeRouteCoordinates(routeCoordinates);
  if (route.length === 0) return null;

  let closestIndex = 0;
  let minDistance = Number.POSITIVE_INFINITY;
  route.forEach((coordinate, index) => {
    const distance = haversineDistanceMiles(point, coordinate);
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = index;
    }
  });

  return Number.isFinite(minDistance) ? closestIndex : null;
}
