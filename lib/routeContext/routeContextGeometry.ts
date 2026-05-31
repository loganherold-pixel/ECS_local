import type {
  RouteContextCoordinate,
  RouteContextProviderMetadata,
  RouteGeometry,
  RouteGeometryBounds,
  RouteGeometryCorridor,
  RouteGeometrySegment,
} from './routeContextTypes';

export type RouteNearestPointResult = {
  point: RouteContextCoordinate;
  distanceMeters: number;
  segmentIndex: number;
  segmentRatio: number;
  distanceAlongRouteMeters: number;
};

export type RouteCorridor = RouteGeometryCorridor & {
  bufferMeters: number;
  centerline: RouteContextCoordinate[];
  sampleIntervalMeters?: number | null;
};

export type RouteSegmentInput = {
  id?: string | null;
  start?: unknown;
  end?: unknown;
  coordinates?: unknown;
  encodedPolyline?: string | null;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type CombineRouteSegmentsOptions = {
  origin?: RouteContextCoordinate | null;
  encodedPolyline?: string | null;
  durationSeconds?: number | null;
  corridorBufferMeters?: number | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

const EARTH_RADIUS_METERS = 6_371_008.8;
const METERS_PER_DEGREE_LATITUDE = 111_320;

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidLatLng(lat: unknown, lng: unknown): boolean {
  const latitude = toFiniteNumber(lat);
  const longitude = toFiniteNumber(lng);
  return (
    latitude != null &&
    longitude != null &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeRouteGeometryCoordinate(
  value: unknown,
): RouteContextCoordinate | null {
  if (value == null) return null;

  if (Array.isArray(value)) {
    const lng = toFiniteNumber(value[0]);
    const lat = toFiniteNumber(value[1]);
    if (!isValidLatLng(lat, lng)) return null;
    return { lat: lat as number, lng: lng as number };
  }

  if (!isRecord(value)) return null;

  if (value.type === 'Point' && Array.isArray(value.coordinates)) {
    return normalizeRouteGeometryCoordinate(value.coordinates);
  }

  if (Array.isArray(value.center)) {
    return normalizeRouteGeometryCoordinate(value.center);
  }

  const lat = toFiniteNumber(value.lat ?? value.latitude ?? value.y);
  const lng = toFiniteNumber(value.lng ?? value.lon ?? value.longitude ?? value.x);
  if (!isValidLatLng(lat, lng)) return null;

  const label = typeof value.label === 'string' || typeof value.name === 'string' || typeof value.title === 'string'
    ? String(value.label ?? value.name ?? value.title)
    : null;
  return label
    ? { lat: lat as number, lng: lng as number, label }
    : { lat: lat as number, lng: lng as number };
}

function extractCoordinates(input: unknown, depth = 0): RouteContextCoordinate[] {
  if (depth > 8 || input == null) return [];
  const point = normalizeRouteGeometryCoordinate(input);
  if (point) return [point];
  if (Array.isArray(input)) return input.flatMap((item) => extractCoordinates(item, depth + 1));
  if (!isRecord(input)) return [];

  const type = typeof input.type === 'string' ? input.type : null;
  if (type === 'FeatureCollection' && Array.isArray(input.features)) {
    return input.features.flatMap((feature) => extractCoordinates(feature, depth + 1));
  }
  if (type === 'Feature') return extractCoordinates(input.geometry, depth + 1);
  if (type === 'LineString' || type === 'MultiLineString') {
    return extractCoordinates(input.coordinates, depth + 1);
  }
  if (type === 'GeometryCollection' && Array.isArray(input.geometries)) {
    return input.geometries.flatMap((geometry) => extractCoordinates(geometry, depth + 1));
  }
  if (Array.isArray(input.segments)) {
    return input.segments.flatMap((segment) => extractCoordinates(segment, depth + 1));
  }

  return [
    input.routeGeometry,
    input.trailGeometry,
    input.geojson,
    input.geometry,
    input.coordinates,
    input.points,
    input.path,
    input.polyline,
  ].flatMap((candidate) => extractCoordinates(candidate, depth + 1));
}

export function normalizeRouteGeometryCoordinates(input: unknown): RouteContextCoordinate[] {
  return dedupeConsecutiveCoordinates(extractCoordinates(input));
}

export function dedupeConsecutiveCoordinates(
  coordinates: readonly RouteContextCoordinate[],
): RouteContextCoordinate[] {
  const deduped: RouteContextCoordinate[] = [];
  coordinates.forEach((coordinate) => {
    const point = normalizeRouteGeometryCoordinate(coordinate);
    if (!point) return;
    const previous = deduped[deduped.length - 1];
    if (previous && previous.lat === point.lat && previous.lng === point.lng) return;
    deduped.push(point);
  });
  return deduped;
}

export function haversineDistanceMeters(
  left: RouteContextCoordinate | null | undefined,
  right: RouteContextCoordinate | null | undefined,
): number | null {
  const a = normalizeRouteGeometryCoordinate(left);
  const b = normalizeRouteGeometryCoordinate(right);
  if (!a || !b) return null;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function totalRouteDistanceMeters(coordinates: unknown): number {
  const points = normalizeRouteGeometryCoordinates(coordinates);
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineDistanceMeters(points[index - 1], points[index]) ?? 0;
  }
  return total;
}

export function boundingBoxFromCoordinates(coordinates: unknown): RouteGeometryBounds | null {
  const points = normalizeRouteGeometryCoordinates(coordinates);
  if (points.length === 0) return null;
  return points.reduce<RouteGeometryBounds>(
    (bounds, point) => ({
      west: Math.min(bounds.west, point.lng),
      south: Math.min(bounds.south, point.lat),
      east: Math.max(bounds.east, point.lng),
      north: Math.max(bounds.north, point.lat),
    }),
    {
      west: points[0].lng,
      south: points[0].lat,
      east: points[0].lng,
      north: points[0].lat,
    },
  );
}

export function expandBoundingBoxByMeters(
  bbox: RouteGeometryBounds | null | undefined,
  meters: number,
): RouteGeometryBounds | null {
  if (!bbox || !Number.isFinite(meters) || meters < 0) return bbox ?? null;
  const centerLat = clamp((bbox.north + bbox.south) / 2, -89.999, 89.999);
  const latDelta = meters / METERS_PER_DEGREE_LATITUDE;
  const lngScale = Math.max(1, Math.cos(toRadians(centerLat)) * METERS_PER_DEGREE_LATITUDE);
  const lngDelta = meters / lngScale;
  return {
    west: clamp(bbox.west - lngDelta, -180, 180),
    south: clamp(bbox.south - latDelta, -90, 90),
    east: clamp(bbox.east + lngDelta, -180, 180),
    north: clamp(bbox.north + latDelta, -90, 90),
  };
}

export function expandBoundingBoxByKilometers(
  bbox: RouteGeometryBounds | null | undefined,
  kilometers: number,
): RouteGeometryBounds | null {
  return expandBoundingBoxByMeters(bbox, kilometers * 1000);
}

function interpolateCoordinate(
  start: RouteContextCoordinate,
  end: RouteContextCoordinate,
  ratio: number,
): RouteContextCoordinate {
  const clamped = clamp(ratio, 0, 1);
  return {
    lat: start.lat + (end.lat - start.lat) * clamped,
    lng: start.lng + (end.lng - start.lng) * clamped,
  };
}

export function sampleRouteAtIntervalMeters(
  coordinates: unknown,
  intervalMeters: number,
): RouteContextCoordinate[] {
  const points = normalizeRouteGeometryCoordinates(coordinates);
  if (points.length <= 1) return points;
  if (!Number.isFinite(intervalMeters) || intervalMeters <= 0) return points;

  const sampled: RouteContextCoordinate[] = [points[0]];
  let nextSampleAt = intervalMeters;
  let distanceAlong = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segmentDistance = haversineDistanceMeters(start, end) ?? 0;
    if (segmentDistance <= 0) continue;
    while (nextSampleAt <= distanceAlong + segmentDistance) {
      const ratio = (nextSampleAt - distanceAlong) / segmentDistance;
      sampled.push(interpolateCoordinate(start, end, ratio));
      nextSampleAt += intervalMeters;
    }
    distanceAlong += segmentDistance;
  }

  const last = points[points.length - 1];
  const previous = sampled[sampled.length - 1];
  if (!previous || previous.lat !== last.lat || previous.lng !== last.lng) sampled.push(last);
  return sampled;
}

function projectToMeters(
  point: RouteContextCoordinate,
  origin: RouteContextCoordinate,
): { x: number; y: number } {
  const lngScale = Math.max(1, Math.cos(toRadians(origin.lat)) * METERS_PER_DEGREE_LATITUDE);
  return {
    x: (point.lng - origin.lng) * lngScale,
    y: (point.lat - origin.lat) * METERS_PER_DEGREE_LATITUDE,
  };
}

export function nearestPointOnRoute(
  candidate: unknown,
  routeCoordinates: unknown,
): RouteNearestPointResult | null {
  const point = normalizeRouteGeometryCoordinate(candidate);
  const route = normalizeRouteGeometryCoordinates(routeCoordinates);
  if (!point || route.length === 0) return null;
  if (route.length === 1) {
    return {
      point: route[0],
      distanceMeters: haversineDistanceMeters(point, route[0]) ?? 0,
      segmentIndex: 0,
      segmentRatio: 0,
      distanceAlongRouteMeters: 0,
    };
  }

  let best: RouteNearestPointResult | null = null;
  let distanceAlong = 0;
  for (let index = 1; index < route.length; index += 1) {
    const start = route[index - 1];
    const end = route[index];
    const segmentDistance = haversineDistanceMeters(start, end) ?? 0;
    const projectedPoint = projectToMeters(point, start);
    const projectedStart = { x: 0, y: 0 };
    const projectedEnd = projectToMeters(end, start);
    const dx = projectedEnd.x - projectedStart.x;
    const dy = projectedEnd.y - projectedStart.y;
    const segmentLengthSquared = dx * dx + dy * dy;
    const segmentRatio = segmentLengthSquared > 0
      ? clamp(((projectedPoint.x * dx) + (projectedPoint.y * dy)) / segmentLengthSquared, 0, 1)
      : 0;
    const nearest = interpolateCoordinate(start, end, segmentRatio);
    const distanceMeters = haversineDistanceMeters(point, nearest) ?? 0;
    if (!best || distanceMeters < best.distanceMeters) {
      best = {
        point: nearest,
        distanceMeters,
        segmentIndex: index - 1,
        segmentRatio,
        distanceAlongRouteMeters: distanceAlong + segmentDistance * segmentRatio,
      };
    }
    distanceAlong += segmentDistance;
  }

  return best;
}

export function estimateDistanceFromRouteMeters(
  candidate: unknown,
  routeCoordinates: unknown,
): number | null {
  return nearestPointOnRoute(candidate, routeCoordinates)?.distanceMeters ?? null;
}

export function createRouteCorridor(
  coordinates: unknown,
  bufferMeters: number,
  sampleIntervalMeters: number | null = null,
): RouteCorridor | null {
  const centerline = sampleIntervalMeters && sampleIntervalMeters > 0
    ? sampleRouteAtIntervalMeters(coordinates, sampleIntervalMeters)
    : normalizeRouteGeometryCoordinates(coordinates);
  if (centerline.length === 0 || !Number.isFinite(bufferMeters) || bufferMeters < 0) return null;
  const bbox = expandBoundingBoxByMeters(boundingBoxFromCoordinates(centerline), bufferMeters);
  return {
    widthMeters: bufferMeters * 2,
    bufferMeters,
    bbox,
    centerline,
    sampleIntervalMeters,
    providerMetadata: {
      source: 'ecs_route_context_geometry',
      routePointCount: normalizeRouteGeometryCoordinates(coordinates).length,
      centerlinePointCount: centerline.length,
    },
  };
}

export function isPointInRouteCorridor(
  candidate: unknown,
  routeCoordinates: unknown,
  bufferMeters: number,
): boolean {
  const point = normalizeRouteGeometryCoordinate(candidate);
  const corridor = createRouteCorridor(routeCoordinates, bufferMeters);
  if (!point || !corridor?.bbox) return false;
  if (
    point.lng < corridor.bbox.west ||
    point.lng > corridor.bbox.east ||
    point.lat < corridor.bbox.south ||
    point.lat > corridor.bbox.north
  ) {
    return false;
  }
  const distance = estimateDistanceFromRouteMeters(point, routeCoordinates);
  return distance != null && distance <= bufferMeters;
}

export function buildRouteGeometrySegments(
  coordinates: unknown,
  providerMetadata?: RouteContextProviderMetadata | null,
): RouteGeometrySegment[] {
  const points = normalizeRouteGeometryCoordinates(coordinates);
  const segments: RouteGeometrySegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    segments.push({
      id: `segment-${index}`,
      start,
      end,
      distanceMeters: Math.round(haversineDistanceMeters(start, end) ?? 0),
      durationSeconds: null,
      providerMetadata: providerMetadata ?? null,
    });
  }
  return segments;
}

export function decodeEncodedPolyline(
  encodedPolyline: string | null | undefined,
  precision = 5,
): RouteContextCoordinate[] {
  if (typeof encodedPolyline !== 'string' || encodedPolyline.length === 0) return [];
  const coordinates: RouteContextCoordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = 10 ** precision;

  try {
    while (index < encodedPolyline.length) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encodedPolyline.charCodeAt(index) - 63;
        index += 1;
        if (!Number.isFinite(byte) || byte < 0) return [];
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index <= encodedPolyline.length);
      const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += deltaLat;

      result = 0;
      shift = 0;
      do {
        byte = encodedPolyline.charCodeAt(index) - 63;
        index += 1;
        if (!Number.isFinite(byte) || byte < 0) return [];
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index <= encodedPolyline.length);
      const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += deltaLng;

      const point = normalizeRouteGeometryCoordinate({ lat: lat / factor, lng: lng / factor });
      if (!point) return [];
      coordinates.push(point);
    }
  } catch {
    return [];
  }

  return dedupeConsecutiveCoordinates(coordinates);
}

export function normalizeRouteGeometryWithEncodedPolyline(
  input: unknown,
  encodedPolyline?: string | null,
): RouteContextCoordinate[] {
  const direct = normalizeRouteGeometryCoordinates(input);
  if (direct.length > 0) return direct;
  if (isRecord(input)) {
    const decoded = decodeEncodedPolyline(
      typeof input.encodedPolyline === 'string'
        ? input.encodedPolyline
        : typeof input.polyline === 'string'
          ? input.polyline
          : encodedPolyline,
    );
    if (decoded.length > 0) return decoded;
  }
  return decodeEncodedPolyline(encodedPolyline);
}

export function combineRouteSegmentsIntoGeometry(
  segments: readonly RouteSegmentInput[],
  options: CombineRouteSegmentsOptions = {},
): RouteGeometry | null {
  const coordinates = segments.flatMap((segment) => {
    const explicit = normalizeRouteGeometryWithEncodedPolyline(segment.coordinates, segment.encodedPolyline);
    if (explicit.length > 0) return explicit;
    return [
      normalizeRouteGeometryCoordinate(segment.start),
      normalizeRouteGeometryCoordinate(segment.end),
    ].filter((point): point is RouteContextCoordinate => point != null);
  });
  const points = dedupeConsecutiveCoordinates(coordinates);
  if (points.length < 2) return null;

  const distanceMeters = segments.some((segment) => Number.isFinite(segment.distanceMeters ?? NaN))
    ? segments.reduce((sum, segment) => sum + (Number.isFinite(segment.distanceMeters ?? NaN) ? Number(segment.distanceMeters) : 0), 0)
    : totalRouteDistanceMeters(points);
  const durationSeconds = options.durationSeconds ??
    (segments.some((segment) => Number.isFinite(segment.durationSeconds ?? NaN))
      ? segments.reduce((sum, segment) => sum + (Number.isFinite(segment.durationSeconds ?? NaN) ? Number(segment.durationSeconds) : 0), 0)
      : null);

  return {
    origin: options.origin ?? null,
    destination: points[points.length - 1],
    waypoints: points.slice(1, -1),
    encodedPolyline: options.encodedPolyline ?? null,
    coordinates: points,
    distanceMeters: Math.round(distanceMeters),
    durationSeconds,
    bbox: boundingBoxFromCoordinates(points),
    corridor: options.corridorBufferMeters != null
      ? createRouteCorridor(points, options.corridorBufferMeters)
      : null,
    segments: buildRouteGeometrySegments(points, options.providerMetadata),
    providerMetadata: options.providerMetadata ?? null,
  };
}

export function bearingDegrees(
  start: RouteContextCoordinate,
  end: RouteContextCoordinate,
): number | null {
  const a = normalizeRouteGeometryCoordinate(start);
  const b = normalizeRouteGeometryCoordinate(end);
  if (!a || !b) return null;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}
