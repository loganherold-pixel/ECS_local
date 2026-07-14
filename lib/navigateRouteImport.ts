import { parseGeoJSON, type GeoJsonParseResult } from './geojsonParser';
import {
  getPrimaryRouteCoordinates,
  parseGeoFile,
  type GpxParseResult,
  type GpxWaypoint,
} from './gpxParser';

export const NAVIGATE_ROUTE_IMPORT_MAX_BYTES = 12 * 1024 * 1024;
export const NAVIGATE_ROUTE_IMPORT_MAX_SOURCE_POINTS = 200_000;
export const NAVIGATE_ROUTE_IMPORT_MAX_PERSISTED_POINTS = 25_000;
export const NAVIGATE_ROUTE_IMPORT_MAX_PREVIEW_POINTS = 1_000;

export type NavigateRouteImportElevationState = 'complete' | 'sparse' | 'missing';

export type NavigateRouteImportPoint = {
  lat: number;
  lng: number;
  ele_m: number | null;
  time: string | null;
  type: 'route' | 'track';
};

export type NavigateRouteImportWaypoint = {
  lat: number;
  lon: number;
  ele: number | null;
  eleFt?: number | null;
  name: string | null;
  description: string | null;
  time: string | null;
  symbol?: string | null;
  type?: string | null;
};

export type NavigateRouteImportResult = {
  name: string;
  format: string;
  sourcePointCount: number;
  persistedPointCount: number;
  previewCoordinates: [number, number][];
  fingerprint: string;
  elevationState: NavigateRouteImportElevationState;
  warnings: string[];
  parsedForRun: {
    name: string;
    routePoints: NavigateRouteImportPoint[];
    trackPoints: NavigateRouteImportPoint[];
    primaryCoords: NavigateRouteImportPoint[];
    waypoints: NavigateRouteImportWaypoint[];
    routes?: GpxParseResult['routes'];
    tracks?: GpxParseResult['tracks'];
    raw?: Record<string, unknown>;
  };
};

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Route import canceled.');
  error.name = 'AbortError';
  throw error;
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

function normalizeCoordinate(raw: unknown): [number, number, number | null] | null {
  if (!Array.isArray(raw)) return null;
  const lng = Number(raw[0]);
  const lat = Number(raw[1]);
  const elevation = Number(raw[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat, Number.isFinite(elevation) ? elevation : null];
}

function dedupeSequentialCoordinates(
  coordinates: Array<[number, number, number | null]>,
): Array<[number, number, number | null]> {
  const output: Array<[number, number, number | null]> = [];
  for (const coordinate of coordinates) {
    const previous = output[output.length - 1];
    if (previous && previous[0] === coordinate[0] && previous[1] === coordinate[1]) continue;
    output.push(coordinate);
  }
  return output;
}

export function sampleNavigateRouteCoordinates<T>(coordinates: T[], maxPoints: number): T[] {
  if (coordinates.length <= maxPoints) return coordinates;
  const output: T[] = [];
  const lastIndex = coordinates.length - 1;
  for (let index = 0; index < maxPoints; index += 1) {
    output.push(coordinates[Math.round((index / (maxPoints - 1)) * lastIndex)]);
  }
  return output;
}

function extractGeoJsonLines(geometry: Record<string, unknown> | null | undefined): unknown[][] {
  if (!geometry) return [];
  const type = String(geometry.type ?? '');
  const coordinates = geometry.coordinates;
  if (type === 'LineString' && Array.isArray(coordinates)) return [coordinates];
  if (type === 'MultiLineString' && Array.isArray(coordinates)) {
    return coordinates.filter((line): line is unknown[] => Array.isArray(line));
  }
  if (type === 'Polygon' && Array.isArray(coordinates) && Array.isArray(coordinates[0])) {
    return [coordinates[0] as unknown[]];
  }
  return [];
}

function geoJsonCoordinates(parsed: GeoJsonParseResult): Array<[number, number, number | null]> {
  return dedupeSequentialCoordinates(
    parsed.routes
      .flatMap((route) => extractGeoJsonLines(route.geometry))
      .flatMap((line) => line)
      .map(normalizeCoordinate)
      .filter((coordinate): coordinate is [number, number, number | null] => !!coordinate),
  );
}

function gpxCoordinates(parsed: GpxParseResult): {
  coordinates: Array<[number, number, number | null]>;
  pointType: 'route' | 'track';
} {
  const trackPoints = parsed.tracks.flatMap((track) =>
    track.segments.flatMap((segment) => segment.points),
  );
  const routePoints = parsed.routes.flatMap((route) => route.points);
  const primaryPoints = trackPoints.length >= 2 ? trackPoints : routePoints;
  if (primaryPoints.length >= 2) {
    return {
      coordinates: dedupeSequentialCoordinates(
        primaryPoints
          .map((point) => normalizeCoordinate([point.lon, point.lat, point.ele]))
          .filter((coordinate): coordinate is [number, number, number | null] => !!coordinate),
      ),
      pointType: trackPoints.length >= 2 ? 'track' : 'route',
    };
  }
  const primary = getPrimaryRouteCoordinates(parsed);
  return {
    coordinates: dedupeSequentialCoordinates(
      primary
        .map((coordinate) => normalizeCoordinate([coordinate[0], coordinate[1], null]))
        .filter((coordinate): coordinate is [number, number, number | null] => !!coordinate),
    ),
    pointType: 'route',
  };
}

function normalizeGpxWaypoints(waypoints: GpxWaypoint[]): NavigateRouteImportWaypoint[] {
  return waypoints
    .filter((waypoint) => Number.isFinite(waypoint.lat) && Number.isFinite(waypoint.lon))
    .map((waypoint) => ({ ...waypoint }));
}

function normalizeGeoJsonWaypoints(parsed: GeoJsonParseResult): NavigateRouteImportWaypoint[] {
  return parsed.waypoints
    .filter((waypoint) => Number.isFinite(waypoint.lat) && Number.isFinite(waypoint.lon))
    .map((waypoint) => ({
      lat: waypoint.lat,
      lon: waypoint.lon,
      ele: waypoint.ele,
      eleFt: waypoint.eleFt,
      name: waypoint.name,
      description: waypoint.description,
      time: null,
      symbol: waypoint.symbol,
      type: waypoint.kind,
    }));
}

function hashImport(name: string, coordinates: Array<[number, number, number | null]>): string {
  const sampled = sampleNavigateRouteCoordinates(coordinates, 64);
  const source = `${name.toLowerCase()}:${coordinates.length}:${sampled
    .map(([lng, lat, elevation]) => `${lng.toFixed(6)},${lat.toFixed(6)},${elevation ?? ''}`)
    .join(';')}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `route-import-${(hash >>> 0).toString(16)}`;
}

function elevationState(
  coordinates: Array<[number, number, number | null]>,
): NavigateRouteImportElevationState {
  const withElevation = coordinates.filter((coordinate) => coordinate[2] != null).length;
  if (withElevation === 0) return 'missing';
  return withElevation / coordinates.length >= 0.8 ? 'complete' : 'sparse';
}

export function parseNavigateRouteImport(input: {
  fileName: string;
  content: string;
  signal?: AbortSignal;
}): NavigateRouteImportResult {
  throwIfAborted(input.signal);
  if (!input.content.trim()) throw new Error('IMPORT FAILED - Route file is empty.');
  const contentBytes = utf8ByteLength(input.content);
  if (contentBytes > NAVIGATE_ROUTE_IMPORT_MAX_BYTES) {
    throw new Error('IMPORT FAILED - Route file exceeds the 12 MB safety limit.');
  }

  const format = input.fileName.split('.').pop()?.toLowerCase() || '';
  const fallbackName = input.fileName.replace(/\.[^.]+$/, '') || 'Imported Route';
  let name = fallbackName;
  let coordinates: Array<[number, number, number | null]> = [];
  let pointType: 'route' | 'track' = 'route';
  let waypoints: NavigateRouteImportWaypoint[] = [];
  let routes: GpxParseResult['routes'] | undefined;
  let tracks: GpxParseResult['tracks'] | undefined;
  let raw: Record<string, unknown> | undefined;

  if (format === 'geojson' || format === 'json') {
    const parsed = parseGeoJSON(input.content);
    name = parsed.name || fallbackName;
    coordinates = geoJsonCoordinates(parsed);
    waypoints = normalizeGeoJsonWaypoints(parsed);
    raw = parsed.raw;
  } else {
    const parsed = parseGeoFile(input.fileName, input.content);
    name = parsed.name || fallbackName;
    const gpxGeometry = gpxCoordinates(parsed);
    coordinates = gpxGeometry.coordinates;
    pointType = gpxGeometry.pointType;
    waypoints = normalizeGpxWaypoints(parsed.waypoints);
    routes = parsed.routes;
    tracks = parsed.tracks;
  }
  throwIfAborted(input.signal);

  if (coordinates.length < 2) {
    throw new Error('IMPORT FAILED - Route needs at least 2 valid points.');
  }
  if (coordinates.length > NAVIGATE_ROUTE_IMPORT_MAX_SOURCE_POINTS) {
    throw new Error('IMPORT FAILED - Route exceeds the 200,000 point safety limit.');
  }

  const sourcePointCount = coordinates.length;
  const persisted = sampleNavigateRouteCoordinates(
    coordinates,
    NAVIGATE_ROUTE_IMPORT_MAX_PERSISTED_POINTS,
  );
  const state = elevationState(coordinates);
  const warnings: string[] = [];
  if (state === 'missing') warnings.push('Elevation is unavailable for this route.');
  if (state === 'sparse') warnings.push('Elevation coverage is partial; gaps remain unknown.');
  if (persisted.length < coordinates.length) {
    warnings.push('Route geometry was sampled to the supported navigation limit.');
  }

  const persistedPoints = persisted.map(([lng, lat, elevation]) => ({
    lat,
    lng,
    ele_m: elevation,
    time: null,
    type: pointType,
  }));
  return {
    name,
    format,
    sourcePointCount,
    persistedPointCount: persistedPoints.length,
    previewCoordinates: sampleNavigateRouteCoordinates(
      persisted.map(([lng, lat]) => [lng, lat] as [number, number]),
      NAVIGATE_ROUTE_IMPORT_MAX_PREVIEW_POINTS,
    ),
    fingerprint: hashImport(name, coordinates),
    elevationState: state,
    warnings,
    parsedForRun: {
      name,
      routePoints: pointType === 'route' ? persistedPoints : [],
      trackPoints: pointType === 'track' ? persistedPoints : [],
      primaryCoords: [],
      waypoints,
      routes,
      tracks,
      raw,
    },
  };
}

export class NavigateRouteImportRegistry {
  private readonly recent = new Map<string, number>();

  constructor(
    private readonly ttlMs = 10_000,
    private readonly maxEntries = 32,
  ) {}

  has(fingerprint: string, now = Date.now()): boolean {
    this.prune(now);
    const importedAt = this.recent.get(fingerprint);
    return importedAt != null && now - importedAt <= this.ttlMs;
  }

  mark(fingerprint: string, now = Date.now()): void {
    this.recent.set(fingerprint, now);
    this.prune(now);
    while (this.recent.size > this.maxEntries) {
      const oldest = this.recent.keys().next().value as string | undefined;
      if (!oldest) break;
      this.recent.delete(oldest);
    }
  }

  private prune(now: number): void {
    for (const [fingerprint, importedAt] of this.recent) {
      if (now - importedAt > this.ttlMs) this.recent.delete(fingerprint);
    }
  }
}
