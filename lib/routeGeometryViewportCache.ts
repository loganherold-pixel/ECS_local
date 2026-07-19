import { createPersistedKeyValueCache } from './keyValuePersistence';
import {
  buildRouteGeometryViewportCacheKey,
  capRouteGeometryViewportResult,
  normalizeRouteGeometryViewportBbox,
  normalizeRouteGeometrySourceProviderPrefix,
  type RouteGeometryViewportBbox,
  type RouteGeometryViewportResult,
} from './routeGeometryViewport';
import type {
  RouteCatalogViewportBbox,
  RouteCatalogViewportFeature,
  RouteCatalogViewportResult,
} from './routeCatalogViewport';
import {
  capUniqueRankedRoutes,
} from './explore/routeSearchResultPolicy';

const ROUTE_GEOMETRY_VIEWPORT_CACHE_FILE_KEY = 'ecs_route_geometry_viewport_cache_v1';
const ROUTE_GEOMETRY_VIEWPORT_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const persistence = createPersistedKeyValueCache(ROUTE_GEOMETRY_VIEWPORT_CACHE_FILE_KEY);

export type RouteGeometryViewportOfflineCacheLookup = {
  bbox: RouteGeometryViewportBbox;
  cacheKey: string;
  sourceProviderPrefix?: string | null;
};

export type RouteGeometryViewportOfflineCacheEntry = RouteGeometryViewportOfflineCacheLookup & {
  cachedAt: string;
  expiresAt: string;
  result: RouteGeometryViewportResult;
};

export type RouteCatalogViewportOfflineCacheEntry = {
  bbox: RouteCatalogViewportBbox;
  cacheKey: string;
  cachedAt: string;
  expiresAt: string;
  result: RouteCatalogViewportResult;
};

function finiteNonNegativeInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function routeCatalogFeatureIdentity(feature: RouteCatalogViewportFeature): string {
  return String(feature.properties?.routeId || feature.id || '').trim().toLowerCase();
}

function countUniqueIdentities<T>(
  values: readonly T[],
  getIdentity: (value: T) => string,
): number {
  const identities = new Set<string>();
  values.forEach((value) => {
    const identity = getIdentity(value);
    if (identity) identities.add(identity);
  });
  return identities.size;
}

function capRouteCatalogViewportResult(
  result: RouteCatalogViewportResult,
): RouteCatalogViewportResult {
  const originalFeatures = Array.isArray(result.featureCollection?.features)
    ? result.featureCollection.features
    : [];
  const features = capUniqueRankedRoutes(
    originalFeatures,
    routeCatalogFeatureIdentity,
  );
  const lineFeatureCount = features.filter(
    (feature) => feature.geometry.type !== 'Point',
  ).length;
  const markerFeatureCount = features.length - lineFeatureCount;

  return {
    ...result,
    featureCollection: {
      type: 'FeatureCollection',
      features,
    },
    candidateCount: Math.max(
      finiteNonNegativeInteger(result.candidateCount),
      countUniqueIdentities(originalFeatures, routeCatalogFeatureIdentity),
    ),
    returnedCount: features.length,
    lineFeatureCount,
    markerFeatureCount,
    guidanceReadyCount: features.filter(
      (feature) => feature.properties.guidanceReady,
    ).length,
    trailheadOnlyCount: features.filter(
      (feature) => feature.properties.geometryStatus === 'trailhead_only',
    ).length,
    insufficientGeometryCount: features.filter(
      (feature) => feature.properties.geometryStatus === 'insufficient_geometry',
    ).length,
  };
}

function parseEntry(raw: string | null, now = Date.now()): RouteGeometryViewportOfflineCacheEntry | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RouteGeometryViewportOfflineCacheEntry> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.cacheKey !== 'string' || typeof parsed.cachedAt !== 'string') return null;
    const expiresAt = Date.parse(String(parsed.expiresAt ?? ''));
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
    if (!parsed.result || !Array.isArray(parsed.result.segments)) return null;
    return {
      ...(parsed as RouteGeometryViewportOfflineCacheEntry),
      result: capRouteGeometryViewportResult(parsed.result),
    };
  } catch {
    return null;
  }
}

export function resolveRouteGeometryViewportOfflineCacheLookup(
  bbox: RouteGeometryViewportBbox | null | undefined,
  zoom: number,
  options: {
    includeReferenceGeometry?: boolean;
    vehicleClass?: string | null;
    sourceProviderPrefix?: string | null;
  } = {},
): RouteGeometryViewportOfflineCacheLookup | null {
  const normalized = normalizeRouteGeometryViewportBbox(bbox);
  if (!normalized) return null;
  return {
    bbox: normalized,
    cacheKey: buildRouteGeometryViewportCacheKey(normalized, zoom, options),
    sourceProviderPrefix: normalizeRouteGeometrySourceProviderPrefix(options.sourceProviderPrefix),
  };
}

function parseRouteCatalogEntry(
  raw: string | null,
  now = Date.now(),
): RouteCatalogViewportOfflineCacheEntry | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RouteCatalogViewportOfflineCacheEntry> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.cacheKey !== 'string' || typeof parsed.cachedAt !== 'string') return null;
    const expiresAt = Date.parse(String(parsed.expiresAt ?? ''));
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
    if (
      !parsed.result ||
      parsed.result.source !== 'route_catalog' ||
      parsed.result.featureCollection?.type !== 'FeatureCollection' ||
      !Array.isArray(parsed.result.featureCollection.features)
    ) {
      return null;
    }
    return {
      ...(parsed as RouteCatalogViewportOfflineCacheEntry),
      result: capRouteCatalogViewportResult(parsed.result),
    };
  } catch {
    return null;
  }
}

export async function readRouteGeometryViewportOfflineCache(
  cacheKey: string,
  now = Date.now(),
): Promise<RouteGeometryViewportOfflineCacheEntry | null> {
  await persistence.waitForHydration();
  return parseEntry(persistence.get(cacheKey), now);
}

export function writeRouteGeometryViewportOfflineCache(input: {
  lookup: RouteGeometryViewportOfflineCacheLookup;
  result: RouteGeometryViewportResult;
  now?: number;
}): void {
  const now = input.now ?? Date.now();
  const entry: RouteGeometryViewportOfflineCacheEntry = {
    ...input.lookup,
    cachedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ROUTE_GEOMETRY_VIEWPORT_CACHE_MAX_AGE_MS).toISOString(),
    result: capRouteGeometryViewportResult(input.result),
  };
  persistence.set(input.lookup.cacheKey, JSON.stringify(entry));
}

export async function readRouteCatalogViewportOfflineCache(
  cacheKey: string,
  now = Date.now(),
): Promise<RouteCatalogViewportOfflineCacheEntry | null> {
  await persistence.waitForHydration();
  return parseRouteCatalogEntry(persistence.get(cacheKey), now);
}

export function writeRouteCatalogViewportOfflineCache(input: {
  bbox: RouteCatalogViewportBbox;
  cacheKey: string;
  result: RouteCatalogViewportResult;
  now?: number;
}): void {
  const now = input.now ?? Date.now();
  const entry: RouteCatalogViewportOfflineCacheEntry = {
    bbox: input.bbox,
    cacheKey: input.cacheKey,
    cachedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ROUTE_GEOMETRY_VIEWPORT_CACHE_MAX_AGE_MS).toISOString(),
    result: capRouteCatalogViewportResult(input.result),
  };
  persistence.set(input.cacheKey, JSON.stringify(entry));
}

export async function flushRouteGeometryViewportOfflineCache(): Promise<void> {
  await persistence.flush();
}
