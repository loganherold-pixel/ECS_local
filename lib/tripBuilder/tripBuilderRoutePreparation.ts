import type { ExpeditionOpportunity } from '../discoverEngine';
import { classifyExploreRouteAuthority } from '../exploreRouteAuthority';
import {
  resolveExploreTripBuilderRouteDetail,
  type RouteDetailFetcher,
} from '../explore/exploreTripBuilderRouteDetail';
import { getCachedRouteCatalogTrailPackDetail } from '../explore/liveTrailPackCatalog';
import { isExploreRouteCatalogDetailDeferred } from '../explore/exploreTripBuilderWizard';
import {
  buildGuidanceRouteDistanceIndex,
  guidanceRouteDistanceMeters,
  orientGuidanceRouteFromStart,
  type GuidanceRouteCoordinate,
} from '../navigation/guidanceRouteProjection';
import { parseNavigateRouteImport } from '../navigateRouteImport';
import { normalizeCanonicalRouteGeometry } from '../routeGeometryLifecycle';
import {
  createECSAsyncRequestFingerprint,
  type ECSAsyncSurfaceState,
} from '../state/asyncSurfaceState';
import { resolveTrailRouteGeometry } from './trailRouteGeometryResolver';
import type { TripBuilderRouteInput } from './tripBuilderTypes';

export const TRIP_BUILDER_CANONICAL_ROUTE_SESSION_VERSION = 1;
export const TRIP_BUILDER_ROUTE_IMPORT_EXTENSIONS = [
  'gpx',
  'xml',
  'kml',
  'geojson',
  'json',
] as const;

export type TripBuilderRoutePreparationStatus =
  | 'idle'
  | 'loading_detail'
  | 'awaiting_trailhead_selection'
  | 'building'
  | 'ready'
  | 'empty_invalid'
  | 'offline_unavailable'
  | 'retryable_error'
  | 'cancelled';

export type TripBuilderRoutePreparationSafeCode =
  | 'TRIP_BUILDER_ROUTE_IDENTITY_MISSING'
  | 'TRIP_BUILDER_ROUTE_DETAIL_EMPTY'
  | 'TRIP_BUILDER_ROUTE_GEOMETRY_INVALID'
  | 'TRIP_BUILDER_ROUTE_REJECTED'
  | 'TRIP_BUILDER_ROUTE_DETAIL_TIMEOUT'
  | 'TRIP_BUILDER_ROUTE_OFFLINE_UNAVAILABLE'
  | 'TRIP_BUILDER_ROUTE_PROVIDER_UNAVAILABLE'
  | 'TRIP_BUILDER_TRAILHEAD_REQUIRED'
  | 'TRIP_BUILDER_ROUTE_CANCELLED'
  | 'TRIP_BUILDER_ROUTE_BUILD_FAILED';

export type TripBuilderTrailheadOption = {
  id: string;
  label: string;
  coordinate: GuidanceRouteCoordinate;
  source: 'provider' | 'route_start' | 'route_end' | 'import';
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  suggested: boolean;
  warnings: string[];
};

export type TripBuilderRoutePreparationState = {
  status: TripBuilderRoutePreparationStatus;
  generation: number;
  requestId: string | null;
  requestFingerprint: string | null;
  startedAt: number | null;
  completedAt: number | null;
  routeId: string | null;
  sourceVersion: string | null;
  source: 'provider' | 'cache' | 'import' | 'stored' | 'unknown';
  summaryRoute: ExpeditionOpportunity | null;
  detailRoute: ExpeditionOpportunity | null;
  canonicalRoute: ExpeditionOpportunity | null;
  trailheadOptions: TripBuilderTrailheadOption[];
  selectedTrailheadId: string | null;
  geometryFingerprint: string | null;
  safeErrorCode: TripBuilderRoutePreparationSafeCode | null;
  retryEligible: boolean;
};

export type ContinueTripBuilderRoutePreparationOptions = {
  signal?: AbortSignal;
  fetchDetail?: RouteDetailFetcher;
  readCachedDetail?: RouteDetailFetcher;
  offline?: boolean;
  now?: number;
};

type TripBuilderGeometryCoordinate = GuidanceRouteCoordinate & {
  elevationMeters?: number;
};

function nowValue(value?: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
}

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function metadata(route: ExpeditionOpportunity | null | undefined): Record<string, unknown> {
  return record(route?.routeMetadata);
}

function routeId(route: ExpeditionOpportunity | null | undefined): string | null {
  const value = String(route?.id ?? '').trim();
  return value || null;
}

function routeSourceVersion(route: ExpeditionOpportunity | null | undefined): string | null {
  const value = metadata(route).routeCatalogSourceVersion ?? metadata(route).updatedAt;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function routeSource(route: ExpeditionOpportunity | null | undefined): TripBuilderRoutePreparationState['source'] {
  const routeMetadata = metadata(route);
  if (routeMetadata.tripBuilderImportFingerprint || routeMetadata.source === 'trip_builder_import') {
    return 'import';
  }
  if (routeMetadata.tripBuilderCanonicalState === 'ready') return 'stored';
  const sourceState = String(
    routeMetadata.routeCatalogSourceState ?? routeMetadata.trailPackDataState ?? '',
  ).trim().toLowerCase();
  if (sourceState === 'cached' || sourceState === 'offline' || sourceState === 'stale') {
    return 'cache';
  }
  if (routeMetadata.trailPackId || routeMetadata.source === 'trail_pack') return 'provider';
  return 'unknown';
}

function requestFingerprint(route: ExpeditionOpportunity): string {
  const routeMetadata = metadata(route);
  return createECSAsyncRequestFingerprint({
    surfaceId: 'trip_builder_route_preparation',
    routeId: routeId(route),
    trailPackId: routeMetadata.trailPackId ?? null,
    sourceVersion: routeSourceVersion(route),
    detailDeferred: isExploreRouteCatalogDetailDeferred(route),
  });
}

export function createTripBuilderRoutePreparationState(): TripBuilderRoutePreparationState {
  return {
    status: 'idle',
    generation: 0,
    requestId: null,
    requestFingerprint: null,
    startedAt: null,
    completedAt: null,
    routeId: null,
    sourceVersion: null,
    source: 'unknown',
    summaryRoute: null,
    detailRoute: null,
    canonicalRoute: null,
    trailheadOptions: [],
    selectedTrailheadId: null,
    geometryFingerprint: null,
    safeErrorCode: null,
    retryEligible: false,
  };
}

function terminalState(
  state: TripBuilderRoutePreparationState,
  status: Exclude<TripBuilderRoutePreparationStatus, 'idle' | 'loading_detail' | 'building'>,
  options: {
    code?: TripBuilderRoutePreparationSafeCode | null;
    retryEligible?: boolean;
    route?: ExpeditionOpportunity | null;
    now?: number;
  } = {},
): TripBuilderRoutePreparationState {
  return {
    ...state,
    status,
    completedAt: nowValue(options.now),
    detailRoute: options.route === undefined ? state.detailRoute : options.route,
    safeErrorCode: options.code ?? null,
    retryEligible: options.retryEligible === true,
  };
}

export function beginTripBuilderRoutePreparation(
  previous: TripBuilderRoutePreparationState,
  route: ExpeditionOpportunity,
  now?: number,
): TripBuilderRoutePreparationState {
  const id = routeId(route);
  const generation = previous.generation + 1;
  const fingerprint = requestFingerprint(route);
  const startedAt = nowValue(now);
  const restored = restoreTripBuilderRoutePreparation(route, generation, startedAt);
  if (restored) return restored;
  return {
    ...createTripBuilderRoutePreparationState(),
    status: isExploreRouteCatalogDetailDeferred(route) ? 'loading_detail' : 'building',
    generation,
    requestId: `trip_builder_route_preparation:${generation}:${fingerprint.slice(-10)}`,
    requestFingerprint: fingerprint,
    startedAt,
    routeId: id,
    sourceVersion: routeSourceVersion(route),
    source: routeSource(route),
    summaryRoute: route,
    detailRoute: isExploreRouteCatalogDetailDeferred(route) ? null : route,
    safeErrorCode: id ? null : 'TRIP_BUILDER_ROUTE_IDENTITY_MISSING',
  };
}

function isValidCoordinate(value: GuidanceRouteCoordinate | null | undefined): value is GuidanceRouteCoordinate {
  return !!value &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    Math.abs(value.lat) <= 90 &&
    Math.abs(value.lng) <= 180;
}

function optionalFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function elevationCoordinateKey(coordinate: GuidanceRouteCoordinate): string {
  return `${coordinate.lat.toFixed(7)}:${coordinate.lng.toFixed(7)}`;
}

function elevationMetersFromValue(value: unknown): number | null {
  if (Array.isArray(value)) return optionalFiniteNumber(value[2]);
  const candidate = record(value);
  const meters = optionalFiniteNumber(
    candidate.elevationMeters ??
      candidate.elevation_m ??
      candidate.ele_m ??
      candidate.ele ??
      candidate.altitudeM,
  );
  if (meters != null) return meters;
  const feet = optionalFiniteNumber(candidate.elevationFeet ?? candidate.elevation_ft);
  return feet == null ? null : feet / 3.28084;
}

function addElevationCandidate(
  lookup: Map<string, number>,
  coordinate: GuidanceRouteCoordinate | null,
  value: unknown,
): void {
  if (!coordinate || !isValidCoordinate(coordinate)) return;
  const elevationMeters = elevationMetersFromValue(value);
  if (elevationMeters == null) return;
  lookup.set(elevationCoordinateKey(coordinate), elevationMeters);
}

function collectGeometryElevations(value: unknown, lookup: Map<string, number>): void {
  if (Array.isArray(value)) {
    const coordinate = value.length >= 2 && !Array.isArray(value[0])
      ? toGuidanceCoordinate({ lng: value[0], lat: value[1] })
      : null;
    if (coordinate) {
      addElevationCandidate(lookup, coordinate, value);
      return;
    }
    value.forEach((entry) => collectGeometryElevations(entry, lookup));
    return;
  }
  const candidate = record(value);
  if (Object.keys(candidate).length === 0) return;
  const coordinate = toGuidanceCoordinate(candidate);
  if (coordinate) addElevationCandidate(lookup, coordinate, candidate);
  if (candidate.geometry) collectGeometryElevations(candidate.geometry, lookup);
  if (candidate.coordinates) collectGeometryElevations(candidate.coordinates, lookup);
  if (Array.isArray(candidate.features)) {
    candidate.features.forEach((feature) => collectGeometryElevations(feature, lookup));
  }
}

function routeElevationLookup(route: ExpeditionOpportunity): Map<string, number> {
  const routeRecord = record(route);
  const routeMetadata = metadata(route);
  const lookup = new Map<string, number>();
  [
    routeRecord.trailGeometry,
    routeRecord.routeGeometry,
    routeRecord.geometry,
    routeRecord.routePoints,
    routeMetadata.trailGeometry,
    routeMetadata.routeGeometry,
    routeMetadata.geometry,
    routeMetadata.routePoints,
  ].forEach((value) => collectGeometryElevations(value, lookup));
  return lookup;
}

function applyElevationLookup(
  geometry: GuidanceRouteCoordinate[],
  lookup: Map<string, number>,
): TripBuilderGeometryCoordinate[] {
  return geometry.map((coordinate) => {
    const elevationMeters = lookup.get(elevationCoordinateKey(coordinate));
    return elevationMeters == null ? coordinate : { ...coordinate, elevationMeters };
  });
}

function toGuidanceCoordinate(value: unknown): GuidanceRouteCoordinate | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const lat = Number(candidate.lat ?? candidate.latitude);
  const lng = Number(candidate.lng ?? candidate.lon ?? candidate.longitude);
  return isValidCoordinate({ lat, lng }) ? { lat, lng } : null;
}

function toTripBuilderGeometryCoordinate(value: unknown): TripBuilderGeometryCoordinate | null {
  const coordinate = toGuidanceCoordinate(value);
  if (!coordinate) return null;
  const elevationMeters = elevationMetersFromValue(value);
  return elevationMeters == null ? coordinate : { ...coordinate, elevationMeters };
}

function addTrailheadOption(
  options: TripBuilderTrailheadOption[],
  option: TripBuilderTrailheadOption,
): void {
  if (!isValidCoordinate(option.coordinate)) return;
  const duplicate = options.some(
    (current) => guidanceRouteDistanceMeters(current.coordinate, option.coordinate) <= 12,
  );
  if (!duplicate) options.push(option);
}

function normalizedRouteGeometry(route: ExpeditionOpportunity): {
  geometry: TripBuilderGeometryCoordinate[];
  fingerprint: string | null;
  trailheadOptions: TripBuilderTrailheadOption[];
} | null {
  const elevationLookup = routeElevationLookup(route);
  const resolved = resolveTrailRouteGeometry({
    suggestedRoute: route as unknown as TripBuilderRouteInput,
  });
  const canonical = normalizeCanonicalRouteGeometry(route);
  const resolvedGeometry = resolved.trailGeometry
    .map((point) => {
      const coordinate = { lat: Number(point.latitude), lng: Number(point.longitude) };
      addElevationCandidate(elevationLookup, coordinate, point);
      return coordinate;
    })
    .filter(isValidCoordinate);
  const fallbackGeometry = canonical.latLng.filter(isValidCoordinate);
  const geometry = resolvedGeometry.length >= 2
    ? resolvedGeometry
    : classifyExploreRouteAuthority(route).canUseForTrailItinerary && fallbackGeometry.length >= 2
      ? fallbackGeometry
      : [];
  const distanceIndex = buildGuidanceRouteDistanceIndex(geometry);
  if (distanceIndex.geometry.length < 2 || distanceIndex.totalDistanceM <= 0) return null;
  const canonicalGeometry = applyElevationLookup(distanceIndex.geometry, elevationLookup);

  const options: TripBuilderTrailheadOption[] = [];
  const summaryTrailheadCoordinate = toGuidanceCoordinate(
    metadata(route).tripBuilderSummaryTrailheadCandidate,
  );
  if (summaryTrailheadCoordinate) {
    addTrailheadOption(options, {
      id: 'summary_trailhead',
      label: 'Suggested trailhead',
      coordinate: summaryTrailheadCoordinate,
      source: 'provider',
      confidence: 'medium',
      suggested: true,
      warnings: ['Confirm current access and posted trailhead conditions before departure.'],
    });
  }
  const candidateCoordinate = resolved.trailheadStartCandidate.coordinate
    ? {
        lat: Number(resolved.trailheadStartCandidate.coordinate.latitude),
        lng: Number(resolved.trailheadStartCandidate.coordinate.longitude),
      }
    : null;
  if (isValidCoordinate(candidateCoordinate)) {
    addTrailheadOption(options, {
      id: 'suggested_trailhead',
      label: resolved.trailheadStartCandidate.name?.trim() || 'Suggested trailhead',
      coordinate: candidateCoordinate,
      source: routeSource(route) === 'import' ? 'import' : 'provider',
      confidence: resolved.trailheadStartCandidate.confidence,
      suggested: options.length === 0,
      warnings: resolved.trailheadStartCandidate.warnings.slice(),
    });
  }

  addTrailheadOption(options, {
    id: 'route_start',
    label: routeSource(route) === 'import' ? 'Imported route start' : 'Route start',
    coordinate: canonicalGeometry[0],
    source: routeSource(route) === 'import' ? 'import' : 'route_start',
    confidence: 'medium',
    suggested: options.length === 0,
    warnings: ['Confirm legal access and current trailhead conditions before departure.'],
  });
  addTrailheadOption(options, {
    id: 'route_end',
    label: routeSource(route) === 'import' ? 'Imported route end' : 'Route end',
    coordinate: canonicalGeometry[canonicalGeometry.length - 1],
    source: routeSource(route) === 'import' ? 'import' : 'route_end',
    confidence: 'medium',
    suggested: false,
    warnings: ['Selecting this endpoint reverses the canonical route when needed.'],
  });

  return {
    geometry: canonicalGeometry,
    fingerprint: canonical.fingerprint,
    trailheadOptions: options,
  };
}

function awaitingTrailheadState(
  state: TripBuilderRoutePreparationState,
  route: ExpeditionOpportunity,
  now?: number,
): TripBuilderRoutePreparationState {
  const normalized = normalizedRouteGeometry(route);
  if (!normalized || normalized.trailheadOptions.length === 0) {
    return terminalState(state, 'empty_invalid', {
      code: 'TRIP_BUILDER_ROUTE_GEOMETRY_INVALID',
      retryEligible: false,
      route,
      now,
    });
  }
  return terminalState({
    ...state,
    status: 'awaiting_trailhead_selection',
    detailRoute: route,
    trailheadOptions: normalized.trailheadOptions,
    geometryFingerprint: normalized.fingerprint,
  }, 'awaiting_trailhead_selection', {
    code: 'TRIP_BUILDER_TRAILHEAD_REQUIRED',
    route,
    now,
  });
}

function preparationCodeFromDetail(
  safeCode: string,
): TripBuilderRoutePreparationSafeCode {
  if (safeCode === 'ROUTE_CATALOG_DETAIL_IDENTITY_MISSING') {
    return 'TRIP_BUILDER_ROUTE_IDENTITY_MISSING';
  }
  if (safeCode === 'ROUTE_CATALOG_DETAIL_EMPTY') return 'TRIP_BUILDER_ROUTE_DETAIL_EMPTY';
  if (safeCode === 'ROUTE_CATALOG_DETAIL_INVALID_GEOMETRY') {
    return 'TRIP_BUILDER_ROUTE_GEOMETRY_INVALID';
  }
  if (safeCode === 'ROUTE_CATALOG_DETAIL_REJECTED') return 'TRIP_BUILDER_ROUTE_REJECTED';
  if (safeCode === 'ROUTE_CATALOG_DETAIL_TIMEOUT') return 'TRIP_BUILDER_ROUTE_DETAIL_TIMEOUT';
  return 'TRIP_BUILDER_ROUTE_PROVIDER_UNAVAILABLE';
}

function settleTripBuilderDetailError(
  state: TripBuilderRoutePreparationState,
  detail: {
    route: ExpeditionOpportunity;
    safeErrorCode: string;
    retryEligible: boolean;
  },
  now?: number,
): TripBuilderRoutePreparationState {
  const code = preparationCodeFromDetail(detail.safeErrorCode);
  const status = code === 'TRIP_BUILDER_ROUTE_DETAIL_EMPTY' ||
    code === 'TRIP_BUILDER_ROUTE_GEOMETRY_INVALID' ||
    code === 'TRIP_BUILDER_ROUTE_REJECTED' ||
    code === 'TRIP_BUILDER_ROUTE_IDENTITY_MISSING'
    ? 'empty_invalid'
    : 'retryable_error';
  return terminalState(state, status, {
    code,
    retryEligible: detail.retryEligible,
    route: detail.route,
    now,
  });
}

export async function continueTripBuilderRoutePreparation(
  started: TripBuilderRoutePreparationState,
  route: ExpeditionOpportunity,
  options: ContinueTripBuilderRoutePreparationOptions = {},
): Promise<TripBuilderRoutePreparationState> {
  if (options.signal?.aborted) return cancelTripBuilderRoutePreparation(started, options.now);
  if (!routeId(route)) {
    return terminalState(started, 'empty_invalid', {
      code: 'TRIP_BUILDER_ROUTE_IDENTITY_MISSING',
      route,
      now: options.now,
    });
  }

  const restored = restoreTripBuilderRoutePreparation(route, started.generation, options.now);
  if (restored) return restored;

  if (isExploreRouteCatalogDetailDeferred(route)) {
    let cacheHit = false;
    const cachedDetail = await resolveExploreTripBuilderRouteDetail(route, {
      signal: options.signal,
      fetchDetail: async (trailPack, cacheOptions) => {
        const detail = await (options.readCachedDetail ?? (async (cachedTrailPack, cachedOptions) => (
          getCachedRouteCatalogTrailPackDetail(cachedTrailPack, cachedOptions)
        )))(trailPack, cacheOptions);
        cacheHit = detail != null;
        return detail;
      },
    });
    if (cachedDetail.status === 'cancelled' || options.signal?.aborted) {
      return cancelTripBuilderRoutePreparation(started, options.now);
    }
    if (cacheHit) {
      if (cachedDetail.status === 'error') {
        return settleTripBuilderDetailError(
          { ...started, source: 'cache' },
          cachedDetail,
          options.now,
        );
      }
      return awaitingTrailheadState(
        { ...started, source: 'cache' },
        cachedDetail.route,
        options.now,
      );
    }
    if (options.offline) {
      return terminalState({ ...started, source: 'unknown' }, 'offline_unavailable', {
        code: 'TRIP_BUILDER_ROUTE_OFFLINE_UNAVAILABLE',
        retryEligible: true,
        route,
        now: options.now,
      });
    }
    const detail = await resolveExploreTripBuilderRouteDetail(route, {
      signal: options.signal,
      fetchDetail: options.fetchDetail,
    });
    if (detail.status === 'cancelled' || options.signal?.aborted) {
      return cancelTripBuilderRoutePreparation(started, options.now);
    }
    if (detail.status === 'error') {
      return settleTripBuilderDetailError(started, detail, options.now);
    }
    return awaitingTrailheadState({ ...started, source: 'provider' }, detail.route, options.now);
  }

  return awaitingTrailheadState(started, route, options.now);
}

export function selectTripBuilderPreparationTrailhead(
  state: TripBuilderRoutePreparationState,
  trailheadId: string,
): TripBuilderRoutePreparationState {
  if (state.status !== 'awaiting_trailhead_selection') return state;
  if (!state.trailheadOptions.some((option) => option.id === trailheadId)) return state;
  return {
    ...state,
    status: 'building',
    completedAt: null,
    selectedTrailheadId: trailheadId,
    safeErrorCode: null,
    retryEligible: false,
  };
}

function lineString(geometry: TripBuilderGeometryCoordinate[]): {
  type: 'LineString';
  coordinates: Array<[number, number] | [number, number, number]>;
} {
  return {
    type: 'LineString',
    coordinates: geometry.map((point) => (
      point.elevationMeters == null
        ? [point.lng, point.lat]
        : [point.lng, point.lat, point.elevationMeters]
    )),
  };
}

function importedElevationIsExplicit(
  format: string,
  content: string,
  elevationState: string,
): boolean {
  if (elevationState !== 'complete') return false;
  if (format !== 'kml') return true;
  return /<coordinates\b[^>]*>[\s\S]*?[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d/i.test(content);
}

export function completeTripBuilderRoutePreparation(
  state: TripBuilderRoutePreparationState,
  now?: number,
): TripBuilderRoutePreparationState {
  if (state.status === 'ready') return state;
  if (state.status !== 'building' || !state.detailRoute || !state.selectedTrailheadId) {
    return terminalState(state, 'empty_invalid', {
      code: 'TRIP_BUILDER_ROUTE_BUILD_FAILED',
      retryEligible: false,
      now,
    });
  }
  const normalized = normalizedRouteGeometry(state.detailRoute);
  const selectedTrailhead = state.trailheadOptions.find(
    (option) => option.id === state.selectedTrailheadId,
  ) ?? null;
  if (!normalized || !selectedTrailhead) {
    return terminalState(state, 'empty_invalid', {
      code: 'TRIP_BUILDER_ROUTE_GEOMETRY_INVALID',
      retryEligible: false,
      now,
    });
  }
  const oriented = orientGuidanceRouteFromStart(normalized.geometry, selectedTrailhead.coordinate);
  const distanceIndex = buildGuidanceRouteDistanceIndex(oriented);
  if (distanceIndex.geometry.length < 2 || distanceIndex.totalDistanceM <= 0) {
    return terminalState(state, 'empty_invalid', {
      code: 'TRIP_BUILDER_ROUTE_GEOMETRY_INVALID',
      retryEligible: false,
      now,
    });
  }
  const orientedElevationLookup = new Map<string, number>();
  oriented.forEach((coordinate) => addElevationCandidate(
    orientedElevationLookup,
    coordinate,
    coordinate,
  ));
  const canonicalGeometry = applyElevationLookup(
    distanceIndex.geometry,
    orientedElevationLookup,
  );
  const preparedAt = new Date(nowValue(now)).toISOString();
  const trailStart = canonicalGeometry[0];
  const trailEnd = canonicalGeometry[canonicalGeometry.length - 1];
  const geometry = lineString(canonicalGeometry);
  const canonicalGeometryFingerprint = normalizeCanonicalRouteGeometry({
    routeGeometry: geometry,
  }).fingerprint ?? normalized.fingerprint;
  const routeMetadata = metadata(state.detailRoute);
  const canonicalRoute = {
    ...state.detailRoute,
    startLat: trailStart.lat,
    startLng: trailStart.lng,
    coordinate: { lat: trailStart.lat, lng: trailStart.lng },
    trailheadStart: {
      latitude: selectedTrailhead.coordinate.lat,
      longitude: selectedTrailhead.coordinate.lng,
    },
    trailStart: { latitude: trailStart.lat, longitude: trailStart.lng },
    trailEnd: { latitude: trailEnd.lat, longitude: trailEnd.lng },
    destinationCoordinate: { lat: trailEnd.lat, lng: trailEnd.lng },
    endpointCoordinate: { lat: trailEnd.lat, lng: trailEnd.lng },
    routeGeometry: geometry,
    trailGeometry: geometry,
    routeMetadata: {
      ...routeMetadata,
      isTrailGeometry: true,
      geometryRole: 'trail',
      routeGeometryMode: 'full',
      tripBuilderCanonicalSessionVersion: TRIP_BUILDER_CANONICAL_ROUTE_SESSION_VERSION,
      tripBuilderCanonicalState: 'ready',
      tripBuilderCanonicalPreparedAt: preparedAt,
      tripBuilderCanonicalGeometryFingerprint: canonicalGeometryFingerprint,
      tripBuilderCanonicalSource: state.source,
      tripBuilderSelectedTrailheadId: selectedTrailhead.id,
      tripBuilderSelectedTrailhead: {
        label: selectedTrailhead.label,
        coordinate: selectedTrailhead.coordinate,
        source: selectedTrailhead.source,
        confidence: selectedTrailhead.confidence,
      },
      tripBuilderTrailStart: trailStart,
      tripBuilderTrailEnd: trailEnd,
      tripBuilderRoutePointCount: canonicalGeometry.length,
      tripBuilderRouteLengthM: Math.round(distanceIndex.totalDistanceM),
    },
  } as ExpeditionOpportunity;

  return terminalState({
    ...state,
    canonicalRoute,
    detailRoute: canonicalRoute,
    geometryFingerprint: canonicalGeometryFingerprint,
  }, 'ready', {
    route: canonicalRoute,
    now,
  });
}

export function cancelTripBuilderRoutePreparation(
  state: TripBuilderRoutePreparationState,
  now?: number,
): TripBuilderRoutePreparationState {
  return terminalState(state, 'cancelled', {
    code: 'TRIP_BUILDER_ROUTE_CANCELLED',
    retryEligible: true,
    now,
  });
}

export function failTripBuilderRoutePreparation(
  state: TripBuilderRoutePreparationState,
  code: TripBuilderRoutePreparationSafeCode = 'TRIP_BUILDER_ROUTE_BUILD_FAILED',
  now?: number,
): TripBuilderRoutePreparationState {
  return terminalState(state, 'retryable_error', {
    code,
    retryEligible: true,
    now,
  });
}

export function restoreTripBuilderRoutePreparation(
  route: ExpeditionOpportunity,
  generation = 0,
  _now?: number,
): TripBuilderRoutePreparationState | null {
  const routeMetadata = metadata(route);
  const stableRouteId = routeId(route);
  if (
    !stableRouteId ||
    routeMetadata.tripBuilderCanonicalState !== 'ready' ||
    Number(routeMetadata.tripBuilderCanonicalSessionVersion) !==
      TRIP_BUILDER_CANONICAL_ROUTE_SESSION_VERSION
  ) {
    return null;
  }
  const routeRecord = record(route);
  const normalized = normalizeCanonicalRouteGeometry(
    routeRecord.routeGeometry ?? routeRecord.trailGeometry,
  );
  if (!normalized.valid || normalized.pointCount < 2 || !normalized.fingerprint) return null;
  const canonicalGeometry = applyElevationLookup(
    normalized.latLng.filter(isValidCoordinate),
    routeElevationLookup(route),
  );
  if (canonicalGeometry.length < 2) return null;
  const storedFingerprint = typeof routeMetadata.tripBuilderCanonicalGeometryFingerprint === 'string'
    ? routeMetadata.tripBuilderCanonicalGeometryFingerprint.trim()
    : '';
  if (!storedFingerprint || storedFingerprint !== normalized.fingerprint) {
    return null;
  }
  const selectedTrailheadRecord = record(routeMetadata.tripBuilderSelectedTrailhead);
  const selectedTrailhead = toTripBuilderGeometryCoordinate(selectedTrailheadRecord.coordinate);
  const selectedTrailheadId = typeof routeMetadata.tripBuilderSelectedTrailheadId === 'string'
    ? routeMetadata.tripBuilderSelectedTrailheadId.trim()
    : '';
  const storedTrailStart = toTripBuilderGeometryCoordinate(routeMetadata.tripBuilderTrailStart);
  const storedTrailEnd = toTripBuilderGeometryCoordinate(routeMetadata.tripBuilderTrailEnd);
  const routeTrailhead = toGuidanceCoordinate(record(route).trailheadStart);
  const geometryStart = canonicalGeometry[0];
  const geometryEnd = canonicalGeometry[canonicalGeometry.length - 1];
  if (
    !selectedTrailhead ||
    !selectedTrailheadId ||
    !storedTrailStart ||
    !storedTrailEnd ||
    !routeTrailhead ||
    guidanceRouteDistanceMeters(routeTrailhead, selectedTrailhead) > 3 ||
    guidanceRouteDistanceMeters(geometryStart, storedTrailStart) > 3 ||
    guidanceRouteDistanceMeters(geometryEnd, storedTrailEnd) > 3 ||
    Number(routeMetadata.tripBuilderRoutePointCount) !== canonicalGeometry.length
  ) {
    return null;
  }
  const storedSource = String(selectedTrailheadRecord.source ?? 'provider');
  const selectedSource: TripBuilderTrailheadOption['source'] =
    storedSource === 'provider' ||
    storedSource === 'route_start' ||
    storedSource === 'route_end' ||
    storedSource === 'import'
      ? storedSource
      : 'provider';
  const storedConfidence = String(selectedTrailheadRecord.confidence ?? 'unknown');
  const selectedConfidence: TripBuilderTrailheadOption['confidence'] =
    storedConfidence === 'high' ||
    storedConfidence === 'medium' ||
    storedConfidence === 'low' ||
    storedConfidence === 'unknown'
      ? storedConfidence
      : 'unknown';
  const selectedOption: TripBuilderTrailheadOption = {
    id: selectedTrailheadId,
    label: String(selectedTrailheadRecord.label ?? 'Selected trailhead'),
    coordinate: selectedTrailhead,
    source: selectedSource,
    confidence: selectedConfidence,
    suggested: true,
    warnings: [],
  };
  const options = [selectedOption];
  addTrailheadOption(options, {
    id: 'route_start',
    label: selectedSource === 'import' ? 'Imported route start' : 'Route start',
    coordinate: geometryStart,
    source: selectedSource === 'import' ? 'import' : 'route_start',
    confidence: 'medium',
    suggested: false,
    warnings: ['Confirm legal access and current trailhead conditions before departure.'],
  });
  addTrailheadOption(options, {
    id: 'route_end',
    label: selectedSource === 'import' ? 'Imported route end' : 'Route end',
    coordinate: geometryEnd,
    source: selectedSource === 'import' ? 'import' : 'route_end',
    confidence: 'medium',
    suggested: false,
    warnings: ['Selecting this endpoint reverses the canonical route when needed.'],
  });
  const preparedAt = Date.parse(String(routeMetadata.tripBuilderCanonicalPreparedAt ?? ''));
  if (!Number.isFinite(preparedAt)) return null;
  const completedAt = preparedAt;
  const fingerprint = requestFingerprint(route);
  return {
    ...createTripBuilderRoutePreparationState(),
    status: 'ready',
    generation,
    requestId: `trip_builder_route_preparation:${generation}:${fingerprint.slice(-10)}`,
    requestFingerprint: fingerprint,
    startedAt: completedAt,
    completedAt,
    routeId: stableRouteId,
    sourceVersion: routeSourceVersion(route),
    source: 'stored',
    summaryRoute: route,
    detailRoute: route,
    canonicalRoute: route,
    trailheadOptions: options,
    selectedTrailheadId,
    geometryFingerprint: storedFingerprint,
  };
}

export function tripBuilderRouteFromImport(input: {
  fileName: string;
  content: string;
  signal?: AbortSignal;
}): ExpeditionOpportunity {
  const extension = input.fileName.split('.').pop()?.trim().toLowerCase() ?? '';
  if (!(TRIP_BUILDER_ROUTE_IMPORT_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new Error(
      `Unsupported file type .${extension || 'unknown'}. Use .gpx, .kml, .geojson, .json, or .xml.`,
    );
  }
  const parsed = parseNavigateRouteImport(input);
  const points = parsed.parsedForRun.trackPoints.length >= 2
    ? parsed.parsedForRun.trackPoints
    : parsed.parsedForRun.routePoints;
  const sourceSegments = parsed.parsedForRun.geometrySegments;
  const segmentCoordinates = sourceSegments.map((segment) => segment.map((point) => (
    point.ele_m == null
      ? [point.lng, point.lat]
      : [point.lng, point.lat, point.ele_m]
  )));
  const sourceGeometry = segmentCoordinates.length === 1
    ? { type: 'LineString', coordinates: segmentCoordinates[0] }
    : { type: 'MultiLineString', coordinates: segmentCoordinates };
  const first = points[0];
  const last = points[points.length - 1];
  const distanceMiles = Math.round((buildGuidanceRouteDistanceIndex(
    points.map((point) => ({ lat: point.lat, lng: point.lng })),
  ).totalDistanceM / 1609.344) * 10) / 10;
  let elevationGainMeters = 0;
  let previousElevationMeters: number | null = null;
  points.forEach((point) => {
    if (point.ele_m == null || !Number.isFinite(point.ele_m)) return;
    if (previousElevationMeters != null && point.ele_m > previousElevationMeters) {
      elevationGainMeters += point.ele_m - previousElevationMeters;
    }
    previousElevationMeters = point.ele_m;
  });
  const elevationGainFt = importedElevationIsExplicit(
    parsed.format,
    input.content,
    parsed.elevationState,
  )
    ? Math.round(elevationGainMeters * 3.28084)
    : null;
  const route = {
    id: parsed.fingerprint,
    name: parsed.name,
    region: 'Imported route',
    regionGroup: 'great-basin',
    distanceMiles,
    terrainType: `Imported ${parsed.format.toUpperCase()} route`,
    remotenessScore: 5,
    estimatedFuelRequired: Math.max(1, Math.round((distanceMiles / 14) * 10) / 10),
    suggestedCamps: distanceMiles >= 45 ? 1 : 0,
    description: `Imported from ${input.fileName}.`,
    highlights: ['Operator supplied route file'],
    ...(elevationGainFt == null ? null : { elevationGainFt }),
    estimatedDays: Math.max(1, Math.ceil(distanceMiles / 75)),
    bestSeason: 'Verify locally',
    permitRequired: false,
    imageTag: 'imported-route',
    startLat: first.lat,
    startLng: first.lng,
    estimatedTravelHours: Math.max(0.5, Math.round((distanceMiles / 18) * 10) / 10),
    coordinate: { lat: first.lat, lng: first.lng },
    destinationCoordinate: { lat: last.lat, lng: last.lng },
    endpointCoordinate: { lat: last.lat, lng: last.lng },
    routeGeometry: sourceGeometry,
    trailGeometry: sourceGeometry,
    routeMetadata: {
      source: 'trip_builder_import',
      sourceFileName: input.fileName,
      sourceFileType: parsed.format,
      routePointCount: parsed.persistedPointCount,
      sourcePointCount: parsed.sourcePointCount,
      sourceGeometryType: sourceGeometry.type,
      sourceGeometrySegmentCount: parsed.sourceSegmentCount,
      joinedSourceSegmentGapCount: parsed.joinedSegmentGapCount,
      maxSourceSegmentGapMeters: parsed.maxSegmentGapMeters,
      elevationState: parsed.elevationState,
      importWarnings: parsed.warnings,
      tripBuilderImportFingerprint: parsed.fingerprint,
      isTrailGeometry: true,
      geometryRole: 'trail',
    },
  } as unknown as ExpeditionOpportunity;
  return route;
}

export function getTripBuilderNavigationHandoffUnavailableReason(
  state: TripBuilderRoutePreparationState | null | undefined,
): string | null {
  if (!state || state.status !== 'ready' || !state.canonicalRoute) {
    return 'Canonical route geometry must be prepared in Trip Builder before Navigate guidance.';
  }
  const normalized = normalizeCanonicalRouteGeometry(state.canonicalRoute);
  return normalized.valid && normalized.pointCount >= 2
    ? null
    : 'Canonical route geometry is invalid and cannot be handed to Navigate.';
}

export function tripBuilderRoutePreparationToAsyncState(
  state: TripBuilderRoutePreparationState,
): ECSAsyncSurfaceState<ExpeditionOpportunity> {
  const status = state.status === 'loading_detail' || state.status === 'building'
    ? 'loading'
    : state.status === 'ready'
      ? 'ready'
      : state.status === 'cancelled'
        ? 'cancelled'
        : state.status === 'offline_unavailable'
          ? 'error'
          : state.status === 'idle'
            ? 'idle'
            : 'error';
  const data = state.status === 'ready' ? state.canonicalRoute : null;
  const source = data == null
    ? 'unavailable'
    : state.source === 'import'
      ? 'manual'
      : state.source === 'stored' || state.source === 'cache'
        ? 'cached'
        : state.source === 'provider'
          ? 'live'
          : 'unavailable';
  const freshness = data == null
    ? 'unavailable'
    : state.source === 'provider'
      ? 'live'
      : state.source === 'stored'
        ? 'stale'
        : state.source === 'import' || state.source === 'cache'
          ? 'recent'
        : 'unavailable';
  return {
    surfaceId: 'trip_builder_route_preparation',
    status,
    requestId: state.requestId,
    generation: state.generation,
    requestFingerprint: state.requestFingerprint,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    source,
    freshness,
    data,
    lastGoodData: data,
    safeErrorCode: state.safeErrorCode,
    retryEligible: state.retryEligible,
    featureEnabled: true,
    provider: state.source === 'provider'
      ? 'route_catalog_detail'
      : state.source === 'cache'
        ? 'route_catalog_detail_cache'
        : state.source === 'import'
          ? 'trip_builder_route_import'
          : state.source === 'stored'
            ? 'trip_builder_route_session'
            : null,
    providerStatus: state.status === 'offline_unavailable' ? 'unavailable' : 'active',
    cancellationReason: state.status === 'cancelled' ? 'consumer_cancelled' : null,
    resultCount: data ? 1 : 0,
  };
}
