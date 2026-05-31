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
  ele?: number;
  ele_m: number;
  elevationFeet: number;
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
const pointElevationCache = new Map<string, number | null>();

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
  const points = Array.isArray(routePoints) ? routePoints.map(normalizeCoordinate).filter(Boolean) : [];
  if (points.length < 2) return `${routeId ?? 'route'}:empty`;
  const first = points[0] as { lat: number; lng: number };
  const last = points[points.length - 1] as { lat: number; lng: number };
  return [
    routeId ?? 'route',
    points.length,
    first.lat.toFixed(5),
    first.lng.toFixed(5),
    last.lat.toFixed(5),
    last.lng.toFixed(5),
  ].join(':');
}

function downsampleRoutePoints(
  routePoints: TerrainElevationSamplingPoint[],
  maxSamples: number,
): Array<{ lat: number; lng: number }> {
  const valid = routePoints
    .map(normalizeCoordinate)
    .filter((point): point is { lat: number; lng: number } => !!point);
  if (valid.length <= maxSamples) return valid;

  const sampled: Array<{ lat: number; lng: number }> = [];
  const usedIndexes = new Set<number>();
  for (let index = 0; index < maxSamples; index += 1) {
    const sourceIndex = Math.round((index / (maxSamples - 1)) * (valid.length - 1));
    if (!usedIndexes.has(sourceIndex)) {
      sampled.push(valid[sourceIndex]);
      usedIndexes.add(sourceIndex);
    }
  }
  return sampled;
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
  const cacheKey = `${args.point.lat.toFixed(5)},${args.point.lng.toFixed(5)},${args.radiusMeters}`;
  if (pointElevationCache.has(cacheKey)) {
    return pointElevationCache.get(cacheKey) ?? null;
  }

  const url =
    `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/${args.point.lng},${args.point.lat}.json` +
    `?layers=contour&radius=${args.radiusMeters}&limit=6&access_token=${encodeURIComponent(args.accessToken)}`;
  const response = await args.fetchImpl(url, args.signal ? { signal: args.signal } : undefined);
  if (!response.ok) {
    pointElevationCache.set(cacheKey, null);
    return null;
  }

  const payload = await response.json();
  const features = Array.isArray((payload as { features?: unknown }).features)
    ? ((payload as { features: unknown[] }).features as TilequeryFeature[])
    : [];
  const candidates = features
    .map((feature) => ({
      elevationMeters: extractContourElevationMeters(feature),
      distance: contourDistance(feature),
    }))
    .filter((candidate): candidate is { elevationMeters: number; distance: number } =>
      candidate.elevationMeters != null && Number.isFinite(candidate.elevationMeters),
    )
    .sort((a, b) => a.distance - b.distance);

  const elevation = candidates[0]?.elevationMeters ?? null;
  pointElevationCache.set(cacheKey, elevation);
  return elevation;
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
  for (const point of sampledPoints) {
    if (args.signal?.aborted) return null;
    const elevationMeters = await fetchPointElevationMetersWithFallback({
      point,
      accessToken: token,
      radiusMeters: args.radiusMeters,
      fetchImpl,
      signal: args.signal,
    });
    if (elevationMeters == null) continue;
    sampled.push({
      lat: point.lat,
      lng: point.lng,
      ele: elevationMeters,
      ele_m: elevationMeters,
      elevationFeet: Math.round(elevationMeters * METERS_TO_FEET),
    });
  }

  return sampled.length >= 2 ? sampled : null;
}
