export type TerrainElevationSamplingPoint = {
  lat?: number | null;
  lng?: number | null;
  lon?: number | null;
  ele?: number | null;
  ele_m?: number | null;
  elevationFeet?: number | null;
};

export type TerrainElevationSampledRoutePoint = {
  lat: number;
  lng: number;
  ele?: number | null;
  ele_m?: number | null;
  elevationFeet?: number | null;
};

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

type TilequeryFeature = {
  properties?: Record<string, unknown> | null;
};

const METERS_TO_FEET = 3.28084;
const DEFAULT_MAX_SAMPLES = 24;
const DEFAULT_RADIUS_METERS = 450;
const DEFAULT_FALLBACK_RADIUS_METERS = [DEFAULT_RADIUS_METERS, 900, 1200];
const MAX_ROUTE_ID_SIGNATURE_LENGTH = 80;
const MAX_POINT_ELEVATION_CACHE_ENTRIES = 512;

export const TERRAIN_ELEVATION_POSITIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const TERRAIN_ELEVATION_NEGATIVE_CACHE_TTL_MS = 60 * 1000;

type PointElevationCacheEntry = {
  elevationMeters: number | null;
  cachedAt: number;
  expiresAt: number;
  result: 'positive' | 'negative';
};

type PointElevationInFlightEntry = {
  controller: AbortController;
  promise: Promise<number | null>;
  activeConsumers: number;
  settled: boolean;
};

const pointElevationCache = new Map<string, PointElevationCacheEntry>();
const pointElevationInFlight = new Map<string, PointElevationInFlightEntry>();
let pointElevationCacheGeneration = 0;

function finiteNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeCoordinate(point: TerrainElevationSamplingPoint): { lat: number; lng: number } | null {
  const lat = finiteNumber(point.lat);
  const lng = finiteNumber(point.lng ?? point.lon);
  if (lat == null || lng == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function normalizeElevationFeet(point: TerrainElevationSamplingPoint): number | null {
  const elevationFeet = finiteNumber(point.elevationFeet);
  if (elevationFeet != null) return elevationFeet;
  const elevationMeters = finiteNumber(point.ele_m ?? point.ele);
  return elevationMeters != null ? elevationMeters * METERS_TO_FEET : null;
}

function hasUsableElevationCoverage(routePoints: TerrainElevationSamplingPoint[]): boolean {
  const elevations = routePoints
    .filter((point) => normalizeCoordinate(point) != null)
    .map(normalizeElevationFeet)
    .filter((elevationFeet): elevationFeet is number => elevationFeet != null);
  if (elevations.length < 2) return false;

  const minElevationFeet = Math.min(...elevations);
  const maxElevationFeet = Math.max(...elevations);
  const hasNonZeroElevation = elevations.some((elevationFeet) => Math.abs(elevationFeet) >= 1);
  const hasElevationRelief = maxElevationFeet - minElevationFeet >= 3;
  return hasNonZeroElevation || hasElevationRelief;
}

export function routeNeedsTerrainElevationSampling(
  active: boolean | null | undefined,
  routePoints: TerrainElevationSamplingPoint[] | null | undefined,
): boolean {
  if (!active || !Array.isArray(routePoints) || routePoints.length < 2) return false;
  return !hasUsableElevationCoverage(routePoints);
}

export function terrainElevationRouteSignature(
  routeId: string | null | undefined,
  routePoints: TerrainElevationSamplingPoint[] | null | undefined,
): string {
  const routeKey = boundedRouteSignatureId(routeId);
  const points = Array.isArray(routePoints)
    ? routePoints
        .map((point) => {
          const coordinate = normalizeCoordinate(point);
          return coordinate ? { ...coordinate, elevationFeet: normalizeElevationFeet(point) } : null;
        })
        .filter(
          (
            point,
          ): point is {
            lat: number;
            lng: number;
            elevationFeet: number | null;
          } => point != null,
        )
    : [];
  if (points.length < 2) return `${routeKey}:empty`;

  const geometryDigest = hashRouteSignaturePoints(points);
  return `${routeKey}:${points.length}:${geometryDigest}`;
}

function boundedRouteSignatureId(routeId: string | null | undefined): string {
  const normalized = routeId?.trim() || 'route';
  if (normalized.length <= MAX_ROUTE_ID_SIGNATURE_LENGTH) return normalized;
  const prefix = normalized.slice(0, MAX_ROUTE_ID_SIGNATURE_LENGTH - 9);
  return `${prefix}~${hashText(normalized)}`;
}

function routeSignaturePointToken(point: { lat: number; lng: number; elevationFeet: number | null }): string {
  const elevation = point.elevationFeet == null ? 'na' : point.elevationFeet.toFixed(0);
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)},${elevation}`;
}

function appendTextHash(hash: number, value: string): number {
  let nextHash = hash;
  for (let index = 0; index < value.length; index += 1) {
    nextHash ^= value.charCodeAt(index);
    nextHash = Math.imul(nextHash, 0x01000193) >>> 0;
  }
  return nextHash;
}

function hashText(value: string): string {
  return appendTextHash(0x811c9dc5, value).toString(16).padStart(8, '0');
}

function hashRouteSignaturePoints(points: { lat: number; lng: number; elevationFeet: number | null }[]): string {
  let hash = 0x811c9dc5;
  points.forEach((point) => {
    hash = appendTextHash(hash, routeSignaturePointToken(point));
    hash = appendTextHash(hash, '|');
  });
  return hash.toString(16).padStart(8, '0');
}

function evenlySpacedIndexes(length: number, maximumCount: number): number[] {
  if (length <= 0 || maximumCount <= 0) return [];
  if (length <= maximumCount) return Array.from({ length }, (_, index) => index);
  if (maximumCount === 1) return [0];

  const indexes: number[] = [];
  const usedIndexes = new Set<number>();
  for (let index = 0; index < maximumCount; index += 1) {
    const sourceIndex = Math.round((index / (maximumCount - 1)) * (length - 1));
    if (!usedIndexes.has(sourceIndex)) {
      indexes.push(sourceIndex);
      usedIndexes.add(sourceIndex);
    }
  }
  return indexes;
}

function downsampleRoutePoints(
  routePoints: TerrainElevationSamplingPoint[],
  maxSamples: number,
): { lat: number; lng: number }[] {
  const valid = routePoints.map(normalizeCoordinate).filter((point): point is { lat: number; lng: number } => !!point);
  if (valid.length <= maxSamples) return valid;
  return evenlySpacedIndexes(valid.length, maxSamples).map((index) => valid[index]);
}

function extractContourElevationMeters(feature: TilequeryFeature): number | null {
  const properties = feature.properties ?? {};
  const elevationMeters =
    finiteNumber(properties.ele) ??
    finiteNumber(properties.elevation) ??
    finiteNumber(properties.ELEV) ??
    finiteNumber(properties.contour);
  if (elevationMeters != null) return elevationMeters;

  const elevationFeet = finiteNumber(properties.ele_ft) ?? finiteNumber(properties.elevation_ft);
  return elevationFeet != null ? elevationFeet / METERS_TO_FEET : null;
}

function contourDistance(feature: TilequeryFeature): number {
  const properties = feature.properties ?? {};
  const tilequery = properties.tilequery as Record<string, unknown> | null | undefined;
  return finiteNumber(tilequery?.distance) ?? finiteNumber(properties.distance) ?? Number.MAX_SAFE_INTEGER;
}

async function fetchPointElevationMeters(args: {
  point: { lat: number; lng: number };
  accessToken: string;
  radiusMeters: number;
  fetchImpl: FetchLike;
  signal?: AbortSignal;
}): Promise<number | null> {
  const tokenFingerprint = hashText(args.accessToken);
  const cacheKey = `${args.point.lat.toFixed(5)},${args.point.lng.toFixed(5)},${args.radiusMeters},${tokenFingerprint}`;
  if (args.signal?.aborted) return null;

  const cached = readPointElevationCache(cacheKey);
  if (cached.hit) return cached.elevationMeters;

  const existingRequest = pointElevationInFlight.get(cacheKey);
  const request =
    existingRequest ??
    createPointElevationRequest({
      cacheKey,
      point: args.point,
      accessToken: args.accessToken,
      radiusMeters: args.radiusMeters,
      fetchImpl: args.fetchImpl,
    });
  return waitForSharedPointElevationRequest(request, args.signal);
}

function readPointElevationCache(cacheKey: string): {
  hit: boolean;
  elevationMeters: number | null;
} {
  const cached = pointElevationCache.get(cacheKey);
  if (!cached) return { hit: false, elevationMeters: null };
  if (cached.expiresAt <= Date.now()) {
    pointElevationCache.delete(cacheKey);
    return { hit: false, elevationMeters: null };
  }
  return { hit: true, elevationMeters: cached.elevationMeters };
}

function writePointElevationCache(cacheKey: string, elevationMeters: number | null): void {
  const cachedAt = Date.now();
  const ttlMs =
    elevationMeters == null ? TERRAIN_ELEVATION_NEGATIVE_CACHE_TTL_MS : TERRAIN_ELEVATION_POSITIVE_CACHE_TTL_MS;

  prunePointElevationCache(cachedAt);
  pointElevationCache.delete(cacheKey);
  pointElevationCache.set(cacheKey, {
    elevationMeters,
    cachedAt,
    expiresAt: cachedAt + ttlMs,
    result: elevationMeters == null ? 'negative' : 'positive',
  });
}

function prunePointElevationCache(now: number): void {
  pointElevationCache.forEach((entry, cacheKey) => {
    if (entry.expiresAt <= now) pointElevationCache.delete(cacheKey);
  });

  while (pointElevationCache.size >= MAX_POINT_ELEVATION_CACHE_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestTimestamp = Number.POSITIVE_INFINITY;
    pointElevationCache.forEach((entry, cacheKey) => {
      if (entry.cachedAt < oldestTimestamp) {
        oldestTimestamp = entry.cachedAt;
        oldestKey = cacheKey;
      }
    });
    if (oldestKey == null) break;
    pointElevationCache.delete(oldestKey);
  }
}

function createPointElevationRequest(args: {
  cacheKey: string;
  point: { lat: number; lng: number };
  accessToken: string;
  radiusMeters: number;
  fetchImpl: FetchLike;
}): PointElevationInFlightEntry {
  const controller = new AbortController();
  const cacheGeneration = pointElevationCacheGeneration;
  let entry: PointElevationInFlightEntry;

  const promise = requestPointElevationMeters({
    point: args.point,
    accessToken: args.accessToken,
    radiusMeters: args.radiusMeters,
    fetchImpl: args.fetchImpl,
    signal: controller.signal,
  })
    .then((elevationMeters) => {
      if (!controller.signal.aborted && cacheGeneration === pointElevationCacheGeneration) {
        writePointElevationCache(args.cacheKey, elevationMeters);
      }
      return elevationMeters;
    })
    .finally(() => {
      entry.settled = true;
      if (pointElevationInFlight.get(args.cacheKey) === entry) {
        pointElevationInFlight.delete(args.cacheKey);
      }
    });

  entry = {
    controller,
    promise,
    activeConsumers: 0,
    settled: false,
  };
  pointElevationInFlight.set(args.cacheKey, entry);
  return entry;
}

async function requestPointElevationMeters(args: {
  point: { lat: number; lng: number };
  accessToken: string;
  radiusMeters: number;
  fetchImpl: FetchLike;
  signal: AbortSignal;
}): Promise<number | null> {
  const url =
    `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/${args.point.lng},${args.point.lat}.json` +
    `?layers=contour&radius=${args.radiusMeters}&limit=6&access_token=${encodeURIComponent(args.accessToken)}`;
  const response = await args.fetchImpl(url, { signal: args.signal });
  if (!response.ok) return null;

  const payload = await response.json();
  const features = Array.isArray((payload as { features?: unknown }).features)
    ? ((payload as { features: unknown[] }).features as TilequeryFeature[])
    : [];
  const candidates = features
    .map((feature) => ({
      elevationMeters: extractContourElevationMeters(feature),
      distance: contourDistance(feature),
    }))
    .filter(
      (candidate): candidate is { elevationMeters: number; distance: number } =>
        candidate.elevationMeters != null && Number.isFinite(candidate.elevationMeters),
    )
    .sort((a, b) => a.distance - b.distance);

  return candidates[0]?.elevationMeters ?? null;
}

function waitForSharedPointElevationRequest(
  entry: PointElevationInFlightEntry,
  signal?: AbortSignal,
): Promise<number | null> {
  if (signal?.aborted) {
    if (entry.activeConsumers === 0 && !entry.settled) entry.controller.abort();
    return Promise.resolve(null);
  }

  entry.activeConsumers += 1;
  return new Promise<number | null>((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal?.removeEventListener('abort', handleAbort);
      entry.activeConsumers = Math.max(0, entry.activeConsumers - 1);
      if (entry.activeConsumers === 0 && !entry.settled) entry.controller.abort();
    };
    const handleAbort = () => {
      release();
      resolve(null);
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
    entry.promise.then(
      (elevationMeters) => {
        if (released) return;
        release();
        resolve(elevationMeters);
      },
      (error) => {
        if (released) return;
        release();
        if (signal?.aborted) resolve(null);
        else reject(error);
      },
    );

    if (signal?.aborted) handleAbort();
  });
}

/**
 * Clears cached samples for an explicit user retry without cancelling consumers
 * already awaiting a shared request. Requests started before invalidation cannot
 * repopulate the cache, and the retry starts a new provider execution.
 */
export function invalidateTerrainElevationSamplingCache(): void {
  pointElevationCacheGeneration += 1;
  pointElevationCache.clear();
  pointElevationInFlight.clear();
}

function radiusCandidates(radiusMeters?: number): number[] {
  const preferredRadius = finiteNumber(radiusMeters);
  if (preferredRadius == null || preferredRadius <= 0) return DEFAULT_FALLBACK_RADIUS_METERS;

  return Array.from(new Set([
    Math.round(preferredRadius),
    Math.max(900, Math.round(preferredRadius * 2)),
    Math.max(1200, Math.round(preferredRadius * 3)),
  ]));
}

async function fetchPointElevationMetersWithFallback(args: {
  point: { lat: number; lng: number };
  accessToken: string;
  radiusMeters?: number;
  fetchImpl: FetchLike;
  signal?: AbortSignal;
}): Promise<number | null> {
  for (const radiusMeters of radiusCandidates(args.radiusMeters)) {
    if (args.signal?.aborted) return null;
    const elevationMeters = await fetchPointElevationMeters({
      point: args.point,
      accessToken: args.accessToken,
      radiusMeters,
      fetchImpl: args.fetchImpl,
      signal: args.signal,
    });
    if (elevationMeters != null) return elevationMeters;
  }
  return null;
}

export async function sampleRouteElevationFromMapboxTerrainContours(args: {
  routePoints: TerrainElevationSamplingPoint[];
  accessToken: string;
  maxSamples?: number;
  radiusMeters?: number;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}): Promise<TerrainElevationSampledRoutePoint[] | null> {
  const token = args.accessToken.trim();
  const fetchImpl = args.fetchImpl ?? globalThis.fetch;
  if (!token || !fetchImpl || args.routePoints.length < 2) return null;

  const sampledPoints = downsampleRoutePoints(args.routePoints, args.maxSamples ?? DEFAULT_MAX_SAMPLES);
  if (sampledPoints.length < 2) return null;

  const sampled: TerrainElevationSampledRoutePoint[] = [];
  let elevationPointCount = 0;
  for (const point of sampledPoints) {
    if (args.signal?.aborted) return null;
    const elevationMeters = await fetchPointElevationMetersWithFallback({
      point,
      accessToken: token,
      radiusMeters: args.radiusMeters,
      fetchImpl,
      signal: args.signal,
    });
    if (elevationMeters == null) {
      sampled.push({
        lat: point.lat,
        lng: point.lng,
        ele: null,
        ele_m: null,
        elevationFeet: null,
      });
      continue;
    }
    elevationPointCount += 1;
    sampled.push({
      lat: point.lat,
      lng: point.lng,
      ele: elevationMeters,
      ele_m: elevationMeters,
      elevationFeet: Math.round(elevationMeters * METERS_TO_FEET),
    });
  }

  return elevationPointCount >= 2 ? sampled : null;
}
