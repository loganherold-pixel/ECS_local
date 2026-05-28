import { ecsLog } from './ecsLogger';

export type RouteGeometryLogReason =
  | 'no_route_selected'
  | 'route_selected_geometry_missing'
  | 'geometry_cache_miss'
  | 'geometry_malformed'
  | 'geometry_successfully_loaded';

export type RouteGeometryLngLat = [number, number];

export interface RouteGeometryLineString {
  type: 'LineString';
  coordinates: RouteGeometryLngLat[];
}

export interface RouteGeometryValidationResult {
  valid: boolean;
  reason: RouteGeometryLogReason;
  lineString: RouteGeometryLineString | null;
  pointCount: number;
  fingerprint: string | null;
}

export interface RouteGeometryLogContext {
  routeId?: string | null;
  cacheKey?: string | null;
  phase?: string | null;
  source?: string | null;
  status?: string | null;
  pointCount?: number | null;
  fingerprint?: string | null;
  message?: string | null;
}

const ROUTE_GEOMETRY_CACHE_LIMIT = 48;
const ROUTE_GEOMETRY_LOG_THROTTLE_MS = 10_000;
const routeGeometryCache = new Map<string, RouteGeometryLineString>();
const routeGeometryLogState = new Map<string, number>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLngLat(value: unknown): RouteGeometryLngLat | null {
  if (Array.isArray(value)) {
    const lng = toFiniteNumber(value[0]);
    const lat = toFiniteNumber(value[1]);
    if (lat == null || lng == null) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return [lng, lat];
  }

  if (!isRecord(value)) return null;

  if (Array.isArray(value.center)) {
    return normalizeLngLat(value.center);
  }

  if (value.type === 'Point' && Array.isArray(value.coordinates)) {
    return normalizeLngLat(value.coordinates);
  }

  const lat = toFiniteNumber(value.latitude ?? value.lat);
  const lng = toFiniteNumber(value.longitude ?? value.lng ?? value.lon);
  if (lat == null || lng == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

function dedupeConsecutive(points: RouteGeometryLngLat[]): RouteGeometryLngLat[] {
  const deduped: RouteGeometryLngLat[] = [];
  points.forEach((point) => {
    const previous = deduped[deduped.length - 1];
    if (previous && previous[0] === point[0] && previous[1] === point[1]) return;
    deduped.push(point);
  });
  return deduped;
}

function hasGeometryCandidate(input: unknown): boolean {
  if (Array.isArray(input)) return input.length > 0;
  if (!isRecord(input)) return false;
  return [
    'geometry',
    'coordinates',
    'routeGeometry',
    'trailGeometry',
    'geojson',
    'polyline',
    'segments',
    'points',
  ].some((key) => input[key] != null);
}

function extractLineCoordinates(input: unknown, depth = 0): RouteGeometryLngLat[] {
  if (depth > 8 || input == null) return [];

  const singlePoint = normalizeLngLat(input);
  if (singlePoint) return [singlePoint];

  if (Array.isArray(input)) {
    return input.flatMap((item) => extractLineCoordinates(item, depth + 1));
  }

  if (!isRecord(input)) return [];

  const type = typeof input.type === 'string' ? input.type : null;
  if (type === 'FeatureCollection' && Array.isArray(input.features)) {
    return input.features.flatMap((feature) => extractLineCoordinates(feature, depth + 1));
  }

  if (type === 'Feature') {
    return extractLineCoordinates(input.geometry, depth + 1);
  }

  if (type === 'LineString' || type === 'MultiLineString' || type === 'Point') {
    return extractLineCoordinates(input.coordinates, depth + 1);
  }

  if (type === 'GeometryCollection' && Array.isArray(input.geometries)) {
    return input.geometries.flatMap((geometry) => extractLineCoordinates(geometry, depth + 1));
  }

  if (Array.isArray(input.segments)) {
    return input.segments.flatMap((segment) => {
      if (!isRecord(segment)) return extractLineCoordinates(segment, depth + 1);
      return extractLineCoordinates(
        segment.points ?? segment.coordinates ?? segment.geometry,
        depth + 1,
      );
    });
  }

  const candidates = [
    input.geometry,
    input.coordinates,
    input.routeGeometry,
    input.trailGeometry,
    input.geojson,
    input.polyline,
    input.points,
  ];

  return candidates.flatMap((candidate) => extractLineCoordinates(candidate, depth + 1));
}

export function normalizeRouteGeometryLineString(input: unknown): RouteGeometryLineString | null {
  const coordinates = dedupeConsecutive(extractLineCoordinates(input));
  if (coordinates.length < 2) return null;
  return {
    type: 'LineString',
    coordinates,
  };
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function formatPoint(point: RouteGeometryLngLat): string {
  return `${point[0].toFixed(5)},${point[1].toFixed(5)}`;
}

export function createRouteGeometryFingerprint(
  lineString: RouteGeometryLineString,
): string {
  const points = lineString.coordinates;
  const sampleStep = Math.max(1, Math.ceil(points.length / 64));
  const sampled = points
    .filter((_, index) => index === 0 || index === points.length - 1 || index % sampleStep === 0)
    .map(formatPoint)
    .join('|');
  return `line:${points.length}:${formatPoint(points[0])}:${formatPoint(points[points.length - 1])}:${hashString(sampled)}`;
}

function getStableRouteId(input: unknown): string | null {
  if (!isRecord(input)) return null;
  const candidate =
    input.routeId ??
    input.id ??
    input.sessionId ??
    (isRecord(input.destination) ? input.destination.id : null) ??
    (isRecord(input.payload) ? input.payload.id : null);
  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

export function getRouteGeometryCacheKey(
  routeLike: unknown,
  keyHint?: string | null,
): string | null {
  if (typeof keyHint === 'string' && keyHint.trim().length > 0) {
    return keyHint.trim();
  }

  const routeId = getStableRouteId(routeLike);
  if (routeId) return `route:${routeId}`;

  const lineString = normalizeRouteGeometryLineString(routeLike);
  return lineString ? `fingerprint:${createRouteGeometryFingerprint(lineString)}` : null;
}

function cloneLineString(lineString: RouteGeometryLineString): RouteGeometryLineString {
  return {
    type: 'LineString',
    coordinates: lineString.coordinates.map((point) => [point[0], point[1]]),
  };
}

function enforceRouteGeometryCacheLimit(): void {
  while (routeGeometryCache.size > ROUTE_GEOMETRY_CACHE_LIMIT) {
    const oldestKey = routeGeometryCache.keys().next().value;
    if (!oldestKey) return;
    routeGeometryCache.delete(oldestKey);
  }
}

export function cacheRouteGeometry(
  cacheKey: string | null | undefined,
  input: unknown,
): RouteGeometryValidationResult {
  const validation = validateRouteGeometry(input);
  if (!validation.valid || !validation.lineString || !cacheKey) return validation;
  routeGeometryCache.set(cacheKey, cloneLineString(validation.lineString));
  enforceRouteGeometryCacheLimit();
  return validation;
}

export function getCachedRouteGeometry(
  cacheKey: string | null | undefined,
): RouteGeometryLineString | null {
  if (!cacheKey) return null;
  const cached = routeGeometryCache.get(cacheKey);
  return cached ? cloneLineString(cached) : null;
}

export function clearRouteGeometryCache(): void {
  routeGeometryCache.clear();
  routeGeometryLogState.clear();
}

export function validateRouteGeometry(input: unknown): RouteGeometryValidationResult {
  if (input == null) {
    return {
      valid: false,
      reason: 'no_route_selected',
      lineString: null,
      pointCount: 0,
      fingerprint: null,
    };
  }

  const lineString = normalizeRouteGeometryLineString(input);
  if (!lineString) {
    return {
      valid: false,
      reason: hasGeometryCandidate(input) ? 'geometry_malformed' : 'route_selected_geometry_missing',
      lineString: null,
      pointCount: 0,
      fingerprint: null,
    };
  }

  const fingerprint = createRouteGeometryFingerprint(lineString);
  return {
    valid: true,
    reason: 'geometry_successfully_loaded',
    lineString,
    pointCount: lineString.coordinates.length,
    fingerprint,
  };
}

function sanitizeLogContext(context: RouteGeometryLogContext = {}): Record<string, unknown> {
  return {
    routeId: context.routeId ?? null,
    cacheKey: context.cacheKey ?? null,
    phase: context.phase ?? null,
    source: context.source ?? null,
    status: context.status ?? null,
    pointCount: context.pointCount ?? null,
    fingerprint: context.fingerprint ?? null,
    message: context.message ?? null,
  };
}

export function logRouteGeometryLifecycle(
  reason: RouteGeometryLogReason,
  context: RouteGeometryLogContext = {},
): void {
  const details = sanitizeLogContext(context);
  const throttleKey = [
    reason,
    details.routeId ?? 'no-route',
    details.cacheKey ?? 'no-cache',
    details.phase ?? 'no-phase',
    details.status ?? 'no-status',
  ].join(':');
  const now = Date.now();
  const lastLoggedAt = routeGeometryLogState.get(throttleKey);
  if (lastLoggedAt && now - lastLoggedAt < ROUTE_GEOMETRY_LOG_THROTTLE_MS) return;
  routeGeometryLogState.set(throttleKey, now);

  const message = `[ROUTE_GEOMETRY] ${reason}`;
  if (reason === 'geometry_malformed' || reason === 'route_selected_geometry_missing' || reason === 'geometry_cache_miss') {
    ecsLog.warn('MAP', message, details);
    return;
  }

  ecsLog.info('MAP', message, details);
}

export function routeGeometryLineStringToLatLng(
  lineString: RouteGeometryLineString,
): Array<{ lat: number; lng: number }> {
  return lineString.coordinates.map(([lng, lat]) => ({ lat, lng }));
}

export function routeGeometryLineStringToLatitudeLongitude(
  lineString: RouteGeometryLineString,
): Array<{ latitude: number; longitude: number }> {
  return lineString.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
}
