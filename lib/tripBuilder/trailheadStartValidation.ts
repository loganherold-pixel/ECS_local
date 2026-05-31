import type {
  GeoPoint,
  ItineraryDataSource,
  RouteGeometryStatus,
  SuggestedRoute,
  TrailheadStartCandidate,
  TrailheadStartStatus,
  TripBuilderConfidence,
  TripBuilderRouteInput,
} from './tripBuilderTypes';

export type ValidateTrailheadStartArgs = {
  suggestedRoute?: SuggestedRoute | TripBuilderRouteInput | Record<string, unknown> | null;
  routeGeometryStatus?: RouteGeometryStatus | null;
  routeMetadata?: Record<string, unknown> | null;
  approachGeometry?: GeoPoint[] | null;
  trailGeometry?: GeoPoint[] | null;
  sourceLabel?: string | null;
};

const EXPLICIT_TRAILHEAD_KEYS = [
  'trailheadStart',
  'trailhead_start',
  'explicitTrailhead',
  'explicit_trailhead',
  'trailheadCoordinate',
  'trailhead_coordinate',
  'trailHeadCoordinate',
  'trailhead',
  'trailheadLocation',
  'trailhead_location',
] as const;

const NAMED_TRAILHEAD_DESTINATION_KEYS = [
  'trailheadDestination',
  'trailhead_destination',
  'trailheadDestinationCoordinate',
  'trailhead_destination_coordinate',
  'destinationTrailhead',
  'destination_trailhead',
] as const;

const START_KEYS = [
  'startCoordinate',
  'start_coordinate',
  'routeStartCoordinate',
  'route_start_coordinate',
  'originCoordinate',
  'origin_coordinate',
  'startLocation',
  'start_location',
] as const;

const GENERIC_DESTINATION_KEYS = [
  'destinationCoordinate',
  'destination_coordinate',
  'endpointCoordinate',
  'endpoint_coordinate',
  'endCoordinate',
  'end_coordinate',
  'finishCoordinate',
  'finish_coordinate',
  'roadDestinationCoordinate',
  'road_destination_coordinate',
  'destination',
  'coordinate',
] as const;

const TRAILHEAD_NAME_KEYS = [
  'trailheadName',
  'trailhead_name',
  'trailheadTitle',
  'trailhead_title',
  'trailheadLabel',
  'trailhead_label',
] as const;

const DESTINATION_NAME_KEYS = [
  'destinationName',
  'destination_name',
  'destinationTitle',
  'destination_title',
  'destinationLabel',
  'destination_label',
  'endpointName',
  'endpoint_name',
  'endpointTitle',
  'endpoint_title',
] as const;

const START_NAME_KEYS = [
  'startName',
  'start_name',
  'startTitle',
  'start_title',
  'startLabel',
  'start_label',
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

function confidenceFromScore(score: number): TripBuilderConfidence {
  if (score >= 80) return 'high';
  if (score >= 55) return 'medium';
  if (score > 0) return 'low';
  return 'unknown';
}

function statusFromScore(score: number, confirmed: boolean): TrailheadStartStatus {
  if (confirmed) return 'confirmed';
  if (score > 0) return 'likely';
  return 'unavailable';
}

function normalizeConfidenceScore(value: unknown, fallback: number): number {
  const numeric = finiteNumber(value);
  if (numeric == null) return fallback;
  const score = numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function recordFromArgs(args: ValidateTrailheadStartArgs): Record<string, unknown> {
  return isRecord(args.suggestedRoute) ? args.suggestedRoute : {};
}

function metadataFromArgs(args: ValidateTrailheadStartArgs): Record<string, unknown> {
  const route = recordFromArgs(args);
  return {
    ...(isRecord(route.routeMetadata) ? route.routeMetadata : {}),
    ...(isRecord(route.route_metadata) ? route.route_metadata : {}),
    ...(isRecord(route.metadata) ? route.metadata : {}),
    ...(isRecord(args.routeMetadata) ? args.routeMetadata : {}),
  };
}

function namedValue(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const candidate = value.name ?? value.title ?? value.label;
  const text = typeof candidate === 'string' ? candidate.trim() : '';
  return text.length > 0 ? text : null;
}

function nameFromKeys(record: Record<string, unknown>, metadata: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const candidate = record[key] ?? metadata[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function fieldValues(
  record: Record<string, unknown>,
  metadata: Record<string, unknown>,
  keys: readonly string[],
): Array<{ key: string; value: unknown }> {
  const values: Array<{ key: string; value: unknown }> = [];
  keys.forEach((key) => {
    if (record[key] != null) values.push({ key, value: record[key] });
    if (metadata[key] != null) values.push({ key: `routeMetadata.${key}`, value: metadata[key] });
  });
  return values;
}

function routeId(record: Record<string, unknown>): string | null {
  const value = record.id ?? record.routeId ?? record.route_id;
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function containsTrailheadLanguage(value: unknown): boolean {
  const text = String(value ?? '').toLowerCase();
  return /\b(trailhead|trail head|trail start|staging|staging area|trail access|trail parking|parking area)\b/.test(text);
}

function candidate(args: {
  coordinate: GeoPoint | null;
  name?: string | null;
  confidenceScore: number;
  sourceKey: string;
  sourceLabel: string;
  sourceState: ItineraryDataSource['state'];
  isConfirmedTrailhead: boolean;
  warnings?: string[];
  metadata?: Record<string, unknown> | null;
  routeId?: string | null;
}): TrailheadStartCandidate {
  const confidenceScore = Math.max(0, Math.min(100, Math.round(args.confidenceScore)));
  const confidence = confidenceFromScore(confidenceScore);
  return {
    coordinate: args.coordinate,
    name: args.name ?? null,
    confidenceScore,
    confidence,
    source: source(args.sourceLabel, args.sourceState, {
      id: args.routeId ?? null,
      source: args.sourceKey,
      confidence,
    }),
    warnings: args.warnings ?? [],
    isConfirmedTrailhead: args.isConfirmedTrailhead,
    status: statusFromScore(confidenceScore, args.isConfirmedTrailhead),
    metadata: args.metadata ?? null,
  };
}

function unavailableCandidate(sourceLabel: string, warnings: string[]): TrailheadStartCandidate {
  return candidate({
    coordinate: null,
    name: null,
    confidenceScore: 0,
    sourceKey: 'unavailable',
    sourceLabel,
    sourceState: 'missing',
    isConfirmedTrailhead: false,
    warnings,
  });
}

function startLatLngCandidate(record: Record<string, unknown>): GeoPoint | null {
  return validPoint(finiteNumber(record.startLat), finiteNumber(record.startLng));
}

function bestCoordinateFromKeys(
  record: Record<string, unknown>,
  metadata: Record<string, unknown>,
  keys: readonly string[],
): { key: string; value: unknown; coordinate: GeoPoint; name: string | null } | null {
  for (const { key, value } of fieldValues(record, metadata, keys)) {
    const coordinate = normalizeCoordinate(value);
    if (!coordinate) continue;
    return {
      key,
      value,
      coordinate,
      name: namedValue(value),
    };
  }
  return null;
}

export function validateTrailheadStart(args: ValidateTrailheadStartArgs): TrailheadStartCandidate {
  const record = recordFromArgs(args);
  const metadata = metadataFromArgs(args);
  const sourceLabel = args.sourceLabel ?? 'suggested_route_trailhead';
  const warnings: string[] = [];
  const id = routeId(record);

  const explicit = bestCoordinateFromKeys(record, metadata, EXPLICIT_TRAILHEAD_KEYS);
  if (explicit) {
    const name = explicit.name ?? nameFromKeys(record, metadata, TRAILHEAD_NAME_KEYS);
    const score = normalizeConfidenceScore(isRecord(explicit.value) ? explicit.value.confidence : null, 95);
    return candidate({
      coordinate: explicit.coordinate,
      name,
      confidenceScore: score,
      sourceKey: explicit.key,
      sourceLabel,
      sourceState: 'cached',
      isConfirmedTrailhead: true,
      warnings,
      routeId: id,
      metadata: {
        sourceKind: 'explicit_trailhead',
        routeGeometryStatus: args.routeGeometryStatus ?? null,
      },
    });
  }

  const namedTrailheadDestination = bestCoordinateFromKeys(record, metadata, NAMED_TRAILHEAD_DESTINATION_KEYS);
  if (namedTrailheadDestination) {
    const name = namedTrailheadDestination.name ?? nameFromKeys(record, metadata, TRAILHEAD_NAME_KEYS);
    return candidate({
      coordinate: namedTrailheadDestination.coordinate,
      name,
      confidenceScore: 88,
      sourceKey: namedTrailheadDestination.key,
      sourceLabel,
      sourceState: 'cached',
      isConfirmedTrailhead: true,
      warnings,
      routeId: id,
      metadata: {
        sourceKind: 'named_trailhead_destination',
        routeGeometryStatus: args.routeGeometryStatus ?? null,
      },
    });
  }

  const genericNamedDestination = bestCoordinateFromKeys(record, metadata, GENERIC_DESTINATION_KEYS);
  const destinationName = genericNamedDestination?.name ?? nameFromKeys(record, metadata, DESTINATION_NAME_KEYS);
  if (genericNamedDestination && destinationName && containsTrailheadLanguage(destinationName)) {
    return candidate({
      coordinate: genericNamedDestination.coordinate,
      name: destinationName,
      confidenceScore: 84,
      sourceKey: genericNamedDestination.key,
      sourceLabel,
      sourceState: 'cached',
      isConfirmedTrailhead: true,
      warnings,
      routeId: id,
      metadata: {
        sourceKind: 'named_destination_trailhead',
        routeGeometryStatus: args.routeGeometryStatus ?? null,
      },
    });
  }

  const trailGeometryStart = args.trailGeometry?.[0] ?? null;
  if (trailGeometryStart) {
    return candidate({
      coordinate: trailGeometryStart,
      name: null,
      confidenceScore: 78,
      sourceKey: 'trailGeometry[0]',
      sourceLabel: 'trail_geometry_start',
      sourceState: 'estimated',
      isConfirmedTrailhead: false,
      warnings: [
        ...warnings,
        'Trailhead start was derived from the first point of true trail geometry; verify the trailhead before departure.',
      ],
      routeId: id,
      metadata: {
        sourceKind: 'trail_geometry_start',
        routeGeometryStatus: args.routeGeometryStatus ?? null,
      },
    });
  }

  const startCoordinate = startLatLngCandidate(record) ?? startLatLngCandidate(metadata);
  if (startCoordinate) {
    return candidate({
      coordinate: startCoordinate,
      name: nameFromKeys(record, metadata, START_NAME_KEYS),
      confidenceScore: 72,
      sourceKey: 'startLat/startLng',
      sourceLabel,
      sourceState: 'cached',
      isConfirmedTrailhead: false,
      warnings: [
        ...warnings,
        'Route start coordinate was used as a likely trailhead; it is not confirmed trailhead data.',
      ],
      routeId: id,
      metadata: {
        sourceKind: 'route_start_coordinate',
        routeGeometryStatus: args.routeGeometryStatus ?? null,
      },
    });
  }

  const explicitStart = bestCoordinateFromKeys(record, metadata, START_KEYS);
  if (explicitStart) {
    return candidate({
      coordinate: explicitStart.coordinate,
      name: explicitStart.name ?? nameFromKeys(record, metadata, START_NAME_KEYS),
      confidenceScore: 70,
      sourceKey: explicitStart.key,
      sourceLabel,
      sourceState: 'cached',
      isConfirmedTrailhead: false,
      warnings: [
        ...warnings,
        'Route start coordinate was used as a likely trailhead; it is not confirmed trailhead data.',
      ],
      routeId: id,
      metadata: {
        sourceKind: 'route_start_coordinate',
        routeGeometryStatus: args.routeGeometryStatus ?? null,
      },
    });
  }

  const approachEndpoint = args.approachGeometry?.[args.approachGeometry.length - 1] ?? null;
  if (approachEndpoint) {
    return candidate({
      coordinate: approachEndpoint,
      name: null,
      confidenceScore: 62,
      sourceKey: 'approachGeometry[end]',
      sourceLabel: 'approach_geometry_endpoint',
      sourceState: 'estimated',
      isConfirmedTrailhead: false,
      warnings: [
        ...warnings,
        'Trailhead start was estimated from the end of approach guidance; it is not confirmed trailhead data.',
      ],
      routeId: id,
      metadata: {
        sourceKind: 'approach_geometry_endpoint',
        routeGeometryStatus: args.routeGeometryStatus ?? null,
      },
    });
  }

  if (genericNamedDestination) {
    return candidate({
      coordinate: genericNamedDestination.coordinate,
      name: destinationName ?? null,
      confidenceScore: 42,
      sourceKey: genericNamedDestination.key,
      sourceLabel,
      sourceState: 'cached',
      isConfirmedTrailhead: false,
      warnings: [
        ...warnings,
        'Generic destination coordinate was used as a low-confidence trailhead candidate; it is not a confirmed trailhead.',
      ],
      routeId: id,
      metadata: {
        sourceKind: 'generic_destination_coordinate',
        routeGeometryStatus: args.routeGeometryStatus ?? null,
      },
    });
  }

  return unavailableCandidate(sourceLabel, [
    ...warnings,
    'Trailhead start is unavailable because no usable trailhead, start, or destination coordinate was provided.',
  ]);
}
