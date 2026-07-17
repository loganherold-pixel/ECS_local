import {
  normalizeCanonicalRouteGeometry,
  normalizeRouteGeometryLineString,
  routeGeometryLineStringToLatitudeLongitude,
} from '../routeGeometryLifecycle';
import { normalizeRouteGeometryWithEncodedPolyline } from '../routeContext/routeContextGeometry';
import type {
  GeoPoint,
  ItineraryDataSource,
  RouteGeometryStatus,
  SuggestedRoute,
  TrailheadStartCandidate,
  TripBuilderConfidence,
  TripBuilderRouteInput,
} from './tripBuilderTypes';
import { validateTrailheadStart } from './trailheadStartValidation';

type GeometryInputSourceKind =
  | 'suggested_route'
  | 'existing_route_data'
  | 'imported_route_data'
  | 'supabase_route_record'
  | 'mapbox_route_data';

type GeometryRole = 'approach' | 'trail';

type GeometryInputSource = {
  kind: GeometryInputSourceKind;
  label: string;
  value: unknown;
  state: ItineraryDataSource['state'];
  confidence: TripBuilderConfidence;
};

type GeometryCandidate = {
  role: GeometryRole;
  key: string;
  value: unknown;
  geometry: GeoPoint[];
  pointCount: number;
  source: ItineraryDataSource;
  confidence: TripBuilderConfidence;
};

type CoordinateCandidate = {
  key: string;
  coordinate: GeoPoint;
  source: ItineraryDataSource;
  confidence: TripBuilderConfidence;
};

export type ResolveTrailRouteGeometryArgs = {
  suggestedRoute?: SuggestedRoute | TripBuilderRouteInput | null;
  existingRouteData?: unknown;
  importedRouteData?: unknown;
  supabaseRouteRecord?: unknown;
  mapboxRouteData?: unknown;
};

export type ResolvedTrailRouteGeometry = {
  routeGeometryStatus: RouteGeometryStatus;
  approachRoute: GeoPoint[];
  approachGeometry: GeoPoint[];
  approachGeometryInput?: unknown | null;
  trailRoute: GeoPoint[];
  trailGeometry: GeoPoint[];
  trailGeometryInput?: unknown | null;
  trailheadStartCandidate: TrailheadStartCandidate;
  trailheadStart: GeoPoint | null;
  trailEnd: GeoPoint | null;
  hasApproachGeometryOnly: boolean;
  hasTrueTrailGeometry: boolean;
  hasTrailheadStart: boolean;
  hasTrailEnd: boolean;
  trailEndExplicit: boolean;
  trailGeometryCompleteEnoughForWaypointGeneration: boolean;
  routeGeometryMissing: boolean;
  trailRouteUnavailableReason: string | null;
  trailEndUnavailableReason: string | null;
  sources: {
    approachRoute: ItineraryDataSource | null;
    trailRoute: ItineraryDataSource | null;
    trailheadStart: ItineraryDataSource | null;
    trailEnd: ItineraryDataSource | null;
  };
  confidence: {
    approachRoute: TripBuilderConfidence;
    trailRoute: TripBuilderConfidence;
    trailheadStart: TripBuilderConfidence;
    trailEnd: TripBuilderConfidence;
  };
  warnings: string[];
  metadata: {
    approachGeometryPointCount: number;
    trailGeometryPointCount: number;
    partialTrailGeometryCandidateCount: number;
    sourceKinds: GeometryInputSourceKind[];
  };
};

const APPROACH_GEOMETRY_KEYS = [
  'approachRoute',
  'approach_route',
  'approachGeometry',
  'approach_geometry',
  'accessRouteGeometry',
  'access_route_geometry',
  'roadRouteGeometry',
  'road_route_geometry',
  'routeToTrailheadGeometry',
  'route_to_trailhead_geometry',
  'trailheadApproachGeometry',
  'trailhead_approach_geometry',
] as const;

const TRAIL_GEOMETRY_KEYS = [
  'trailRoute',
  'trail_route',
  'trailGeometry',
  'trail_geometry',
  'offroadTrailGeometry',
  'offroad_trail_geometry',
  'expeditionTrailGeometry',
  'expedition_trail_geometry',
] as const;

const GENERIC_GEOMETRY_KEYS = [
  'routeGeometry',
  'route_geometry',
  'geometry',
  'geojson',
  'segments',
  'coordinates',
  'points',
  'path',
  'polyline',
] as const;

const TRAILHEAD_KEYS = [
  'trailheadStart',
  'trailhead_start',
  'trailheadCoordinate',
  'trailhead_coordinate',
  'trailhead',
  'startCoordinate',
  'start_coordinate',
  'routeStartCoordinate',
  'route_start_coordinate',
  'originCoordinate',
  'origin_coordinate',
] as const;

const GENERIC_START_KEYS = [
  'coordinate',
  'location',
  'point',
] as const;

const EXPLICIT_TRAIL_END_KEYS = [
  'trailEnd',
  'trail_end',
  'trailEndCoordinate',
  'trail_end_coordinate',
  'trailFinishCoordinate',
  'trail_finish_coordinate',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const numberValue = typeof value === 'string' ? Number(value) : value;
  return typeof numberValue === 'number' && Number.isFinite(numberValue) ? numberValue : null;
}

function validPoint(latitude: number | null, longitude: number | null): GeoPoint | null {
  if (latitude == null || longitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function normalizeCoordinate(value: unknown): GeoPoint | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    const longitude = finiteNumber(value[0]);
    const latitude = finiteNumber(value[1]);
    return validPoint(latitude, longitude);
  }

  if (!isRecord(value)) return null;

  if (Array.isArray(value.center)) return normalizeCoordinate(value.center);
  if (value.type === 'Point' && Array.isArray(value.coordinates)) return normalizeCoordinate(value.coordinates);

  const nested = value.coordinate ?? value.location ?? value.point;
  if (nested && nested !== value) {
    const nestedPoint = normalizeCoordinate(nested);
    if (nestedPoint) return nestedPoint;
  }

  const latitude = finiteNumber(value.latitude ?? value.lat ?? value.y);
  const longitude = finiteNumber(value.longitude ?? value.lng ?? value.lon ?? value.x);
  const point = validPoint(latitude, longitude);
  if (!point) return null;

  const elevationFeet = finiteNumber(value.elevationFeet ?? value.elevation_ft);
  const elevationMeters = finiteNumber(value.elevationMeters ?? value.elevation_m ?? value.ele ?? value.ele_m);
  const accuracyMeters = finiteNumber(value.accuracyMeters ?? value.accuracy_m);
  return {
    ...point,
    ...(elevationFeet != null ? { elevationFeet } : {}),
    ...(elevationMeters != null ? { elevationMeters } : {}),
    ...(accuracyMeters != null ? { accuracyMeters } : {}),
    ...(typeof value.source === 'string' || isRecord(value.source) ? { source: value.source as GeoPoint['source'] } : {}),
  };
}

function source(
  label: string,
  state: ItineraryDataSource['state'],
  extras: Partial<ItineraryDataSource> = {},
): ItineraryDataSource {
  return {
    label,
    state,
    ...extras,
  };
}

function normalizeConfidence(value: unknown, fallback: TripBuilderConfidence): TripBuilderConfidence {
  if (value === 'high' || value === 'medium' || value === 'low' || value === 'unknown') return value;
  const numeric = finiteNumber(value);
  if (numeric == null) return fallback;
  if (numeric >= 78 || (numeric <= 1 && numeric >= 0.78)) return 'high';
  if (numeric >= 50 || (numeric <= 1 && numeric >= 0.5)) return 'medium';
  if (numeric > 0) return 'low';
  return fallback;
}

function geometryFromValue(value: unknown): GeoPoint[] {
  const normalized = normalizeCanonicalRouteGeometry(value);
  return normalized.valid ? normalized.latitudeLongitude : [];
}

function geometryPointCount(value: unknown): number {
  const encodedPolyline = typeof value === 'string' ? value : null;
  const routeContextPoints = normalizeRouteGeometryWithEncodedPolyline(value, encodedPolyline);
  if (routeContextPoints.length > 0) return routeContextPoints.length;
  const lineString = normalizeRouteGeometryLineString(value);
  return lineString?.coordinates.length ?? 0;
}

function hasGeometryValue(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (!isRecord(value)) return false;
  return [
    'geometry',
    'coordinates',
    'routeGeometry',
    'route_geometry',
    'trailGeometry',
    'trail_geometry',
    'geojson',
    'polyline',
    'encodedPolyline',
    'points',
    'path',
    'segments',
  ].some((key) => value[key] != null);
}

function metadataRecords(record: Record<string, unknown>): Array<[string, Record<string, unknown>]> {
  const records: Array<[string, Record<string, unknown>]> = [];
  [
    ['routeMetadata', record.routeMetadata],
    ['route_metadata', record.route_metadata],
    ['metadata', record.metadata],
    ['providerMetadata', record.providerMetadata],
    ['provider_metadata', record.provider_metadata],
  ].forEach(([label, value]) => {
    if (isRecord(value)) records.push([String(label), value]);
  });
  return records;
}

function fieldValues(
  record: Record<string, unknown>,
  keys: readonly string[],
): Array<{ key: string; value: unknown }> {
  const values: Array<{ key: string; value: unknown }> = [];
  keys.forEach((key) => {
    if (record[key] != null) values.push({ key, value: record[key] });
  });

  metadataRecords(record).forEach(([metadataKey, metadata]) => {
    keys.forEach((key) => {
      if (metadata[key] != null) values.push({ key: `${metadataKey}.${key}`, value: metadata[key] });
    });
  });

  return values;
}

function textToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function truthyBoolean(value: unknown): boolean {
  return value === true || textToken(value) === 'true' || textToken(value) === 'yes';
}

function evidenceValues(record: Record<string, unknown>): unknown[] {
  const keys = [
    'geometryRole',
    'geometry_role',
    'routeGeometryRole',
    'route_geometry_role',
    'routeType',
    'route_type',
    'routeCategory',
    'route_category',
    'sourceFormat',
    'source_format',
    'sourceFileType',
    'source_file_type',
    'source',
    'routeSource',
    'route_source',
    'sourceApp',
    'source_app',
  ];
  return [
    ...keys.map((key) => record[key]),
    ...metadataRecords(record).flatMap(([, metadata]) => keys.map((key) => metadata[key])),
  ];
}

function hasExplicitTrailGeometryEvidence(record: Record<string, unknown>, sourceKind: GeometryInputSourceKind): boolean {
  if (sourceKind === 'imported_route_data') return true;
  if (sourceKind === 'mapbox_route_data') return false;

  const booleanKeys = [
    'isTrailGeometry',
    'is_trail_geometry',
    'hasTrailGeometry',
    'has_trail_geometry',
    'containsTrailGeometry',
    'contains_trail_geometry',
  ];
  if (
    booleanKeys.some((key) => truthyBoolean(record[key])) ||
    metadataRecords(record).some(([, metadata]) => booleanKeys.some((key) => truthyBoolean(metadata[key])))
  ) {
    return true;
  }

  return evidenceValues(record).some((value) => {
    const token = textToken(value);
    if (!token) return false;
    if (token === 'trailhead' || token.includes('trailhead')) return false;
    return (
      token === 'trail' ||
      token === 'offroad' ||
      token === 'off_road' ||
      token === 'custom' ||
      token === 'custom_route' ||
      token === 'imported' ||
      token === 'trip_builder_import' ||
      token === 'gpx' ||
      token === 'kml' ||
      token === 'geojson' ||
      token.includes('gpx') ||
      token.includes('kml') ||
      token.includes('geojson') ||
      token.includes('route_builder') ||
      token.includes('operator_supplied')
    );
  });
}

function routeIdFromRecord(record: unknown): string | null {
  if (!isRecord(record)) return null;
  const value = record.id ?? record.routeId ?? record.route_id;
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function createGeometryCandidate(
  role: GeometryRole,
  input: GeometryInputSource,
  key: string,
  value: unknown,
): GeometryCandidate | null {
  if (!hasGeometryValue(value)) return null;
  const geometry = geometryFromValue(value);
  const pointCount = geometry.length >= 2 ? geometry.length : geometryPointCount(value);
  if (geometry.length < 2 && pointCount === 0) return null;
  const label = role === 'approach'
    ? `${input.label}_approach_geometry`
    : `${input.label}_trail_geometry`;
  return {
    role,
    key,
    value,
    geometry,
    pointCount,
    source: source(label, input.state, {
      id: routeIdFromRecord(input.value),
      source: key,
      confidence: input.confidence,
    }),
    confidence: geometry.length >= 2 ? input.confidence : 'low',
  };
}

function collectGeometryCandidates(input: GeometryInputSource): GeometryCandidate[] {
  if (!isRecord(input.value)) return [];
  const candidates: GeometryCandidate[] = [];
  const explicitTrailEvidence = hasExplicitTrailGeometryEvidence(input.value, input.kind);

  fieldValues(input.value, APPROACH_GEOMETRY_KEYS).forEach(({ key, value }) => {
    const candidate = createGeometryCandidate('approach', input, key, value);
    if (candidate) candidates.push(candidate);
  });

  fieldValues(input.value, TRAIL_GEOMETRY_KEYS).forEach(({ key, value }) => {
    const candidate = createGeometryCandidate('trail', input, key, value);
    if (candidate) candidates.push(candidate);
  });

  if (input.kind === 'mapbox_route_data') {
    collectMapboxApproachCandidates(input).forEach((candidate) => candidates.push(candidate));
    return candidates;
  }

  fieldValues(input.value, GENERIC_GEOMETRY_KEYS).forEach(({ key, value }) => {
    const role: GeometryRole = explicitTrailEvidence ? 'trail' : 'approach';
    const candidate = createGeometryCandidate(role, input, key, value);
    if (candidate) candidates.push(candidate);
  });

  return candidates;
}

function collectMapboxApproachCandidates(input: GeometryInputSource): GeometryCandidate[] {
  if (!isRecord(input.value)) return [];
  const record = input.value;
  const values: Array<{ key: string; value: unknown }> = [];
  const routes = record.routes;
  if (Array.isArray(routes) && routes.length > 0) {
    const firstRoute = routes[0];
    if (isRecord(firstRoute)) {
      values.push({ key: 'routes[0].geometry', value: firstRoute.geometry });
      values.push({ key: 'routes[0].polyline', value: firstRoute.polyline ?? firstRoute.encodedPolyline });
      values.push({ key: 'routes[0]', value: firstRoute });
    }
  }

  ['geometry', 'routeGeometry', 'route_geometry', 'polyline', 'encodedPolyline'].forEach((key) => {
    if (record[key] != null) values.push({ key, value: record[key] });
  });

  const candidates: GeometryCandidate[] = [];
  values.forEach(({ key, value }) => {
    const candidate = createGeometryCandidate('approach', input, key, value);
    if (candidate) candidates.push(candidate);
  });
  return candidates;
}

function inputSources(args: ResolveTrailRouteGeometryArgs): GeometryInputSource[] {
  const sources: GeometryInputSource[] = [
    {
      kind: 'suggested_route',
      label: 'suggested_route',
      value: args.suggestedRoute,
      state: 'cached',
      confidence: 'medium',
    },
    {
      kind: 'existing_route_data',
      label: 'existing_route_data',
      value: args.existingRouteData,
      state: 'cached',
      confidence: 'medium',
    },
    {
      kind: 'imported_route_data',
      label: 'imported_route_data',
      value: args.importedRouteData,
      state: 'manual',
      confidence: 'high',
    },
    {
      kind: 'supabase_route_record',
      label: 'supabase_route_record',
      value: args.supabaseRouteRecord,
      state: 'cached',
      confidence: 'medium',
    },
    {
      kind: 'mapbox_route_data',
      label: 'mapbox_route_data',
      value: args.mapboxRouteData,
      state: 'cached',
      confidence: 'medium',
    },
  ];
  return sources.filter((input) => input.value != null);
}

function pickGeometry(candidates: GeometryCandidate[], role: GeometryRole): GeometryCandidate | null {
  return candidates.find((candidate) => candidate.role === role && candidate.geometry.length >= 2) ?? null;
}

function coordinateCandidate(
  input: GeometryInputSource,
  key: string,
  value: unknown,
  fallbackConfidence: TripBuilderConfidence,
): CoordinateCandidate | null {
  const coordinate = normalizeCoordinate(value);
  if (!coordinate) return null;
  const confidence = isRecord(value)
    ? normalizeConfidence(value.confidence ?? value.reliability, fallbackConfidence)
    : fallbackConfidence;
  return {
    key,
    coordinate,
    source: source(`${input.label}_${key}`, input.state, {
      id: routeIdFromRecord(input.value),
      source: key,
      confidence,
    }),
    confidence,
  };
}

function startLatLngCandidate(input: GeometryInputSource): CoordinateCandidate | null {
  if (!isRecord(input.value)) return null;
  const coordinate = validPoint(finiteNumber(input.value.startLat), finiteNumber(input.value.startLng));
  if (!coordinate) return null;
  return {
    key: 'startLat/startLng',
    coordinate,
    source: source(`${input.label}_start_lat_lng`, input.state, {
      id: routeIdFromRecord(input.value),
      source: 'startLat/startLng',
      confidence: input.confidence,
    }),
    confidence: input.confidence,
  };
}

function pickTrailheadStart(inputs: GeometryInputSource[], trail: GeometryCandidate | null, approach: GeometryCandidate | null): CoordinateCandidate | null {
  for (const input of inputs) {
    if (!isRecord(input.value)) continue;
    for (const { key, value } of fieldValues(input.value, TRAILHEAD_KEYS)) {
      const candidate = coordinateCandidate(input, key, value, input.confidence);
      if (candidate) return candidate;
    }
    const startLatLng = startLatLngCandidate(input);
    if (startLatLng) return startLatLng;
    for (const { key, value } of fieldValues(input.value, GENERIC_START_KEYS)) {
      const candidate = coordinateCandidate(input, key, value, 'low');
      if (candidate) return candidate;
    }
  }

  if (trail?.geometry[0]) {
    return {
      key: 'trail_geometry_first_point',
      coordinate: trail.geometry[0],
      source: source('trail_geometry_first_point', trail.source.state, {
        id: trail.source.id,
        source: trail.key,
        confidence: 'medium',
        notes: ['Trailhead start was derived from explicit trail geometry.'],
      }),
      confidence: 'medium',
    };
  }

  if (approach) {
    const approachEnd = approach.geometry[approach.geometry.length - 1] ?? null;
    if (!approachEnd) return null;
    return {
      key: 'approach_geometry_endpoint',
      coordinate: approachEnd,
      source: source('approach_geometry_endpoint', 'estimated', {
        id: approach.source.id,
        source: approach.key,
        confidence: 'low',
        notes: ['Trailhead start was estimated from the end of the approach route.'],
      }),
      confidence: 'low',
    };
  }

  return null;
}

function pickExplicitTrailEnd(inputs: GeometryInputSource[]): CoordinateCandidate | null {
  for (const input of inputs) {
    if (!isRecord(input.value)) continue;
    for (const { key, value } of fieldValues(input.value, EXPLICIT_TRAIL_END_KEYS)) {
      const candidate = coordinateCandidate(input, key, value, input.confidence);
      if (candidate) return candidate;
    }
  }
  return null;
}

function pickTrailEnd(inputs: GeometryInputSource[], trail: GeometryCandidate | null): CoordinateCandidate | null {
  const explicit = pickExplicitTrailEnd(inputs);
  if (explicit) return explicit;

  if (!trail) return null;
  const trailEnd = trail.geometry[trail.geometry.length - 1] ?? null;
  if (!trailEnd) return null;
  return {
    key: 'trail_geometry_last_point',
    coordinate: trailEnd,
    source: source('trail_geometry_last_point', trail.source.state, {
      id: trail.source.id,
      source: trail.key,
      confidence: trail.confidence,
      notes: ['Trail end was derived from explicit trail geometry.'],
    }),
    confidence: trail.confidence,
  };
}

function coordinateFromTrailheadCandidate(candidate: TrailheadStartCandidate): CoordinateCandidate | null {
  if (!candidate.coordinate) return null;
  return {
    key: String(candidate.source.source ?? 'validated_trailhead_start'),
    coordinate: candidate.coordinate,
    source: candidate.source,
    confidence: candidate.confidence,
  };
}

function pickValidatedTrailheadStart(
  inputs: GeometryInputSource[],
  status: RouteGeometryStatus,
  trail: GeometryCandidate | null,
  approach: GeometryCandidate | null,
): TrailheadStartCandidate {
  const validationInputs = inputs.length > 0
    ? inputs
    : [{
        kind: 'suggested_route' as const,
        label: 'route_geometry',
        value: null,
        state: 'unknown' as const,
        confidence: 'unknown' as const,
      }];

  const candidates = validationInputs.map((input) => validateTrailheadStart({
    suggestedRoute: isRecord(input.value) ? input.value : null,
    routeGeometryStatus: status,
    routeMetadata: isRecord(input.value) && isRecord(input.value.routeMetadata)
      ? input.value.routeMetadata
      : null,
    approachGeometry: approach?.geometry ?? null,
    trailGeometry: trail?.geometry ?? null,
    sourceLabel: `${input.label}_trailhead`,
  }));
  const available = candidates
    .filter((candidate) => candidate.coordinate != null)
    .sort((left, right) => right.confidenceScore - left.confidenceScore);

  if (available[0]) return available[0];

  const unavailable = validateTrailheadStart({
    suggestedRoute: null,
    routeGeometryStatus: status,
    approachGeometry: approach?.geometry ?? null,
    trailGeometry: trail?.geometry ?? null,
    sourceLabel: 'route_geometry_trailhead',
  });
  return {
    ...unavailable,
    warnings: Array.from(new Set([
      ...candidates.flatMap((candidate) => candidate.warnings),
      ...unavailable.warnings,
    ])),
  };
}

function routeGeometryStatus(args: {
  approach: GeometryCandidate | null;
  trail: GeometryCandidate | null;
  partialTrailCandidates: GeometryCandidate[];
  trailheadStart: CoordinateCandidate | null;
  trailEnd: CoordinateCandidate | null;
}): RouteGeometryStatus {
  if (args.trail) return args.trailEnd ? 'trail_available' : 'partial_trail';
  if (args.partialTrailCandidates.length > 0) return 'partial_trail';
  if (args.approach) return 'approach_only';
  if (args.trailheadStart || args.trailEnd) return 'trail_missing';
  return 'unknown';
}

export function resolveTrailRouteGeometry(args: ResolveTrailRouteGeometryArgs): ResolvedTrailRouteGeometry {
  const inputs = inputSources(args);
  const geometryCandidates = inputs.flatMap(collectGeometryCandidates);
  const approach = pickGeometry(geometryCandidates, 'approach');
  const trail = pickGeometry(geometryCandidates, 'trail');
  const partialTrailCandidates = geometryCandidates.filter((candidate) => (
    candidate.role === 'trail' &&
    candidate.geometry.length < 2 &&
    candidate.pointCount > 0
  ));
  const trailEnd = pickTrailEnd(inputs, trail);
  const trailEndExplicit = trailEnd != null && trailEnd.key !== 'trail_geometry_last_point';
  const preliminaryStatus = routeGeometryStatus({
    approach,
    trail,
    partialTrailCandidates,
    trailheadStart: null,
    trailEnd,
  });
  const trailheadStartCandidate = pickValidatedTrailheadStart(inputs, preliminaryStatus, trail, approach);
  const trailheadStart = coordinateFromTrailheadCandidate(trailheadStartCandidate);
  const status = routeGeometryStatus({
    approach,
    trail,
    partialTrailCandidates,
    trailheadStart,
    trailEnd,
  });
  const approachGeometry = approach?.geometry ?? [];
  const trailGeometry = trail?.geometry ?? [];
  const hasApproachGeometryOnly = approachGeometry.length >= 2 && trailGeometry.length < 2 && partialTrailCandidates.length === 0;
  const hasTrueTrailGeometry = trailGeometry.length >= 2;
  const hasTrailheadStart = trailheadStart != null;
  const hasTrailEnd = trailEnd != null;
  const trailGeometryCompleteEnoughForWaypointGeneration = hasTrueTrailGeometry && hasTrailheadStart && hasTrailEnd;
  const routeGeometryMissing = approachGeometry.length < 2 && trailGeometry.length < 2;
  const warnings: string[] = [...trailheadStartCandidate.warnings];

  if (status === 'approach_only') {
    warnings.push('Only approach guidance to the trailhead is available; true trail route geometry is unavailable.');
  } else if (status === 'partial_trail') {
    warnings.push('Trail route geometry is partial and is not complete enough for trail waypoint generation.');
  } else if (status === 'trail_missing') {
    warnings.push('Trail route geometry is unavailable.');
  } else if (status === 'unknown') {
    warnings.push('Route geometry is unavailable.');
  }

  if (!hasTrailEnd) {
    warnings.push('Trail end is unavailable.');
  }

  return {
    routeGeometryStatus: status,
    approachRoute: approachGeometry,
    approachGeometry,
    approachGeometryInput: approach?.value ?? null,
    trailRoute: trailGeometry,
    trailGeometry,
    trailGeometryInput: trail?.value ?? null,
    trailheadStartCandidate,
    trailheadStart: trailheadStart?.coordinate ?? null,
    trailEnd: trailEnd?.coordinate ?? null,
    hasApproachGeometryOnly,
    hasTrueTrailGeometry,
    hasTrailheadStart,
    hasTrailEnd,
    trailEndExplicit,
    trailGeometryCompleteEnoughForWaypointGeneration,
    routeGeometryMissing,
    trailRouteUnavailableReason: hasTrueTrailGeometry
      ? null
      : 'True trail route geometry was not provided by selected route data.',
    trailEndUnavailableReason: hasTrailEnd
      ? null
      : 'Trail end was not provided and cannot be derived without true trail geometry.',
    sources: {
      approachRoute: approach?.source ?? null,
      trailRoute: trail?.source ?? null,
      trailheadStart: trailheadStartCandidate.source ?? null,
      trailEnd: trailEnd?.source ?? null,
    },
    confidence: {
      approachRoute: approach?.confidence ?? 'unknown',
      trailRoute: trail?.confidence ?? (partialTrailCandidates.length > 0 ? 'low' : 'unknown'),
      trailheadStart: trailheadStartCandidate.confidence,
      trailEnd: trailEnd?.confidence ?? 'unknown',
    },
    warnings,
    metadata: {
      approachGeometryPointCount: approachGeometry.length,
      trailGeometryPointCount: trailGeometry.length,
      partialTrailGeometryCandidateCount: partialTrailCandidates.length,
      sourceKinds: inputs.map((input) => input.kind),
    },
  };
}
