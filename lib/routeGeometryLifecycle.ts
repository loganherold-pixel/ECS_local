import { ecsLog } from './ecsLogger';
import { decodeEncodedPolyline } from './routeContext/routeContextGeometry';

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

export type CanonicalRouteGeometryStatus = 'valid' | 'missing' | 'malformed';

export type CanonicalRouteGeometrySourceType =
  | 'geojson_linestring'
  | 'geojson_feature'
  | 'geojson_feature_collection'
  | 'raw_coordinate_array'
  | 'encoded_polyline'
  | 'route_object'
  | 'unknown';

export type CanonicalRouteGeometryAuthority =
  | 'trail'
  | 'approach'
  | 'preview'
  | 'demo'
  | 'unknown';

export interface CanonicalRouteGeometryOptions {
  sourceType?: CanonicalRouteGeometrySourceType | null;
  geometryType?: string | null;
  authority?: CanonicalRouteGeometryAuthority | null;
  encodedPolyline?: string | null;
  encodedPolylinePrecision?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface CanonicalRouteGeometryResult {
  valid: boolean;
  status: CanonicalRouteGeometryStatus;
  reason: RouteGeometryLogReason;
  lineString: RouteGeometryLineString | null;
  coordinates: RouteGeometryLngLat[];
  latLng: Array<{ lat: number; lng: number }>;
  latitudeLongitude: Array<{ latitude: number; longitude: number }>;
  pointCount: number;
  fingerprint: string | null;
  sourceType: CanonicalRouteGeometrySourceType;
  geometryType: string | null;
  authority: CanonicalRouteGeometryAuthority;
  isTrailGeometry: boolean;
  isApproachOnly: boolean;
  isPreviewOrDemo: boolean;
  invalidReason: RouteGeometryLogReason | null;
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

export function normalizeRouteGeometryLngLat(value: unknown): RouteGeometryLngLat | null {
  const point = normalizeLngLat(value);
  return point ? [point[0], point[1]] : null;
}

export function routeGeometryPointToLatitudeLongitude(
  value: unknown,
): { latitude: number; longitude: number } | null {
  const point = normalizeLngLat(value);
  return point ? { latitude: point[1], longitude: point[0] } : null;
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
  if (typeof input === 'string') return input.trim().length > 0;
  if (Array.isArray(input)) return input.length > 0;
  if (!isRecord(input)) return false;
  return [
    'geometry',
    'coordinates',
    'routeGeometry',
    'route_geometry',
    'trailGeometry',
    'trail_geometry',
    'approachGeometry',
    'approach_geometry',
    'geojson',
    'polyline',
    'encodedPolyline',
    'encoded_polyline',
    'segments',
    'points',
    'path',
  ].some((key) => input[key] != null);
}

function encodedPolylineToLngLat(
  encodedPolyline: string | null | undefined,
  precision?: number | null,
): RouteGeometryLngLat[] {
  const points = decodeEncodedPolyline(encodedPolyline, precision ?? 5);
  return points.map((point) => [point.lng, point.lat]);
}

function extractLineCoordinates(input: unknown, depth = 0): RouteGeometryLngLat[] {
  if (depth > 8 || input == null) return [];

  if (typeof input === 'string') {
    return encodedPolylineToLngLat(input);
  }

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
    input.trailGeometry,
    input.trail_geometry,
    input.routeGeometry,
    input.route_geometry,
    input.geometry,
    input.coordinates,
    input.approachGeometry,
    input.approach_geometry,
    input.geojson,
    input.encodedPolyline,
    input.encoded_polyline,
    input.polyline,
    input.points,
    input.path,
  ];

  for (const candidate of candidates) {
    const coordinates = extractLineCoordinates(candidate, depth + 1);
    if (coordinates.length >= 2) return coordinates;
  }
  return [];
}

function lineStringFromCoordinates(coordinates: RouteGeometryLngLat[]): RouteGeometryLineString | null {
  const deduped = dedupeConsecutive(coordinates);
  if (deduped.length < 2) return null;
  return {
    type: 'LineString',
    coordinates: deduped,
  };
}

export function normalizeRouteGeometryLineString(input: unknown): RouteGeometryLineString | null {
  return lineStringFromCoordinates(extractLineCoordinates(input));
}

function textToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function truthyBoolean(value: unknown): boolean {
  const token = textToken(value);
  return value === true || token === 'true' || token === 'yes' || token === '1';
}

function metadataRecords(input: unknown, options: CanonicalRouteGeometryOptions = {}): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  if (options.metadata) records.push(options.metadata);
  if (!isRecord(input)) return records;
  records.push(input);
  [
    input.properties,
    input.routeMetadata,
    input.route_metadata,
    input.metadata,
    input.providerMetadata,
    input.provider_metadata,
  ].forEach((candidate) => {
    if (isRecord(candidate)) records.push(candidate);
  });
  return records;
}

function metadataValues(
  input: unknown,
  keys: readonly string[],
  options: CanonicalRouteGeometryOptions = {},
): unknown[] {
  return metadataRecords(input, options).flatMap((record) => keys.map((key) => record[key]));
}

function hasMetadataValue(
  input: unknown,
  keys: readonly string[],
  options: CanonicalRouteGeometryOptions = {},
): boolean {
  return metadataValues(input, keys, options).some((value) => value != null && String(value).trim().length > 0);
}

function hasTruthyMetadataValue(
  input: unknown,
  keys: readonly string[],
  options: CanonicalRouteGeometryOptions = {},
): boolean {
  return metadataValues(input, keys, options).some(truthyBoolean);
}

function metadataTokens(
  input: unknown,
  keys: readonly string[],
  options: CanonicalRouteGeometryOptions = {},
): string[] {
  return metadataValues(input, keys, options)
    .map(textToken)
    .filter(Boolean);
}

function hasRecordKey(input: unknown, keys: readonly string[]): boolean {
  if (!isRecord(input)) return false;
  return keys.some((key) => input[key] != null);
}

function hasEncodedPolylineCandidate(input: unknown, options: CanonicalRouteGeometryOptions = {}): boolean {
  if (typeof options.encodedPolyline === 'string' && options.encodedPolyline.trim().length > 0) return true;
  if (typeof input === 'string' && input.trim().length > 0) return true;
  if (!isRecord(input)) return false;
  return (
    typeof input.encodedPolyline === 'string' ||
    typeof input.encoded_polyline === 'string' ||
    typeof input.polyline === 'string'
  );
}

function inferCanonicalSourceType(
  input: unknown,
  options: CanonicalRouteGeometryOptions = {},
): CanonicalRouteGeometrySourceType {
  if (options.sourceType) return options.sourceType;
  if (hasEncodedPolylineCandidate(input, options)) return 'encoded_polyline';
  if (Array.isArray(input)) return 'raw_coordinate_array';
  if (!isRecord(input)) return 'unknown';

  const type = typeof input.type === 'string' ? input.type : null;
  if (type === 'FeatureCollection') return 'geojson_feature_collection';
  if (type === 'Feature') return 'geojson_feature';
  if (type === 'LineString' || type === 'MultiLineString' || type === 'Point' || type === 'GeometryCollection') {
    return 'geojson_linestring';
  }
  return hasGeometryCandidate(input) ? 'route_object' : 'unknown';
}

function inferCanonicalGeometryType(
  input: unknown,
  options: CanonicalRouteGeometryOptions = {},
  depth = 0,
): string | null {
  if (options.geometryType) return options.geometryType;
  if (depth > 6 || input == null) return null;
  if (hasEncodedPolylineCandidate(input, options)) return 'EncodedPolyline';
  if (Array.isArray(input)) return 'CoordinateArray';
  if (!isRecord(input)) return null;

  const type = typeof input.type === 'string' ? input.type : null;
  if (type === 'Feature') return inferCanonicalGeometryType(input.geometry, options, depth + 1);
  if (type) return type;

  const candidates = [
    input.trailGeometry,
    input.trail_geometry,
    input.approachGeometry,
    input.approach_geometry,
    input.routeGeometry,
    input.route_geometry,
    input.geometry,
    input.geojson,
    input.coordinates,
    input.encodedPolyline,
    input.encoded_polyline,
    input.polyline,
    input.points,
    input.path,
  ];
  for (const candidate of candidates) {
    const candidateType = inferCanonicalGeometryType(candidate, options, depth + 1);
    if (candidateType) return candidateType;
  }
  return null;
}

function inferCanonicalAuthority(
  input: unknown,
  options: CanonicalRouteGeometryOptions = {},
): CanonicalRouteGeometryAuthority {
  if (options.authority) return options.authority;

  const sourceTokens = metadataTokens(input, [
    'geometrySource',
    'geometry_source',
    'source',
    'routeSource',
    'route_source',
    'sourceKind',
    'source_kind',
    'sourceLabel',
    'source_label',
    'sourceFileType',
    'source_file_type',
    'routeScope',
    'route_scope',
    'geometryRole',
    'geometry_role',
    'routeGeometryRole',
    'route_geometry_role',
    'routeType',
    'route_type',
    'routeCategory',
    'route_category',
  ], options);
  const hasToken = (predicate: (token: string) => boolean): boolean => sourceTokens.some(predicate);

  if (
    hasTruthyMetadataValue(input, ['isDemoGeometry', 'is_demo_geometry'], options) ||
    hasToken((token) => token === 'ecs_demo_full_route_fixture' || token === 'demo' || token.includes('_demo') || token.includes('fixture'))
  ) {
    return 'demo';
  }

  if (
    hasMetadataValue(input, ['previewMetadataStatus', 'preview_metadata_status'], options) ||
    hasTruthyMetadataValue(input, ['isPreviewGeometry', 'is_preview_geometry'], options) ||
    hasToken((token) => token.includes('preview') || token === 'trailhead_only')
  ) {
    return 'preview';
  }

  if (
    hasTruthyMetadataValue(input, [
      'isTrailGeometry',
      'is_trail_geometry',
      'hasTrailGeometry',
      'has_trail_geometry',
      'containsTrailGeometry',
      'contains_trail_geometry',
    ], options) ||
    hasRecordKey(input, ['trailGeometry', 'trail_geometry']) ||
    hasToken((token) => (
      token === 'trail' ||
      token === 'offroad' ||
      token === 'off_road' ||
      token === 'custom_route' ||
      token === 'operator_supplied' ||
      token === 'operator_verified' ||
      token === 'trip_builder_import' ||
      token === 'imported' ||
      token === 'gpx' ||
      token === 'kml' ||
      token === 'geojson' ||
      token === 'full_trail_route' ||
      token.includes('gpx') ||
      token.includes('kml') ||
      token.includes('geojson')
    ))
  ) {
    return 'trail';
  }

  if (
    hasTruthyMetadataValue(input, ['isApproachGeometry', 'is_approach_geometry', 'isApproachRoute', 'is_approach_route'], options) ||
    hasRecordKey(input, ['approachGeometry', 'approach_geometry', 'approachRoute', 'approach_route']) ||
    hasToken((token) => (
      token === 'approach' ||
      token === 'approach_only' ||
      token === 'road_approach' ||
      token === 'mapbox' ||
      token === 'mapbox_directions' ||
      token.includes('approach')
    ))
  ) {
    return 'approach';
  }

  return 'unknown';
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

function lineStringFromInputAndOptions(
  input: unknown,
  options: CanonicalRouteGeometryOptions = {},
): RouteGeometryLineString | null {
  const direct = normalizeRouteGeometryLineString(input);
  if (direct) return direct;
  if (typeof options.encodedPolyline !== 'string' || options.encodedPolyline.trim().length === 0) return null;
  return lineStringFromCoordinates(encodedPolylineToLngLat(options.encodedPolyline, options.encodedPolylinePrecision));
}

export function normalizeCanonicalRouteGeometry(
  input: unknown,
  options: CanonicalRouteGeometryOptions = {},
): CanonicalRouteGeometryResult {
  const sourceType = inferCanonicalSourceType(input, options);
  const geometryType = inferCanonicalGeometryType(input, options);
  const authority = inferCanonicalAuthority(input, options);
  const lineString = lineStringFromInputAndOptions(input, options);

  if (!lineString) {
    const reason: RouteGeometryLogReason = input == null && !hasEncodedPolylineCandidate(input, options)
      ? 'no_route_selected'
      : hasGeometryCandidate(input) || hasEncodedPolylineCandidate(input, options)
        ? 'geometry_malformed'
        : 'route_selected_geometry_missing';
    const status: CanonicalRouteGeometryStatus = reason === 'geometry_malformed' ? 'malformed' : 'missing';
    return {
      valid: false,
      status,
      reason,
      lineString: null,
      coordinates: [],
      latLng: [],
      latitudeLongitude: [],
      pointCount: 0,
      fingerprint: null,
      sourceType,
      geometryType,
      authority,
      isTrailGeometry: false,
      isApproachOnly: authority === 'approach',
      isPreviewOrDemo: authority === 'preview' || authority === 'demo',
      invalidReason: reason,
    };
  }

  const fingerprint = createRouteGeometryFingerprint(lineString);
  return {
    valid: true,
    status: 'valid',
    reason: 'geometry_successfully_loaded',
    lineString,
    coordinates: lineString.coordinates.map((point) => [point[0], point[1]]),
    latLng: routeGeometryLineStringToLatLng(lineString),
    latitudeLongitude: routeGeometryLineStringToLatitudeLongitude(lineString),
    pointCount: lineString.coordinates.length,
    fingerprint,
    sourceType,
    geometryType,
    authority,
    isTrailGeometry: authority === 'trail',
    isApproachOnly: authority === 'approach',
    isPreviewOrDemo: authority === 'preview' || authority === 'demo',
    invalidReason: null,
  };
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
  const normalized = normalizeCanonicalRouteGeometry(input);
  return {
    valid: normalized.valid,
    reason: normalized.reason,
    lineString: normalized.lineString,
    pointCount: normalized.pointCount,
    fingerprint: normalized.fingerprint,
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
