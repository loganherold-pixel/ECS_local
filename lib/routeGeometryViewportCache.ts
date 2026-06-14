import { createPersistedKeyValueCache } from './keyValuePersistence';
import {
  buildRouteGeometryViewportCacheKey,
  normalizeRouteGeometryViewportBbox,
  type RouteGeometryViewportBbox,
  type RouteGeometryViewportResult,
} from './routeGeometryViewport';

const ROUTE_GEOMETRY_VIEWPORT_CACHE_FILE_KEY = 'ecs_route_geometry_viewport_cache_v1';
const ROUTE_GEOMETRY_VIEWPORT_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const persistence = createPersistedKeyValueCache(ROUTE_GEOMETRY_VIEWPORT_CACHE_FILE_KEY);

export type RouteGeometryViewportOfflineCacheLookup = {
  bbox: RouteGeometryViewportBbox;
  cacheKey: string;
};

export type RouteGeometryViewportOfflineCacheEntry = RouteGeometryViewportOfflineCacheLookup & {
  cachedAt: string;
  expiresAt: string;
  result: RouteGeometryViewportResult;
};

function parseEntry(raw: string | null, now = Date.now()): RouteGeometryViewportOfflineCacheEntry | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RouteGeometryViewportOfflineCacheEntry> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.cacheKey !== 'string' || typeof parsed.cachedAt !== 'string') return null;
    const expiresAt = Date.parse(String(parsed.expiresAt ?? ''));
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
    if (!parsed.result || !Array.isArray(parsed.result.segments)) return null;
    return parsed as RouteGeometryViewportOfflineCacheEntry;
  } catch {
    return null;
  }
}

export function resolveRouteGeometryViewportOfflineCacheLookup(
  bbox: RouteGeometryViewportBbox | null | undefined,
  zoom: number,
  options: { includeReferenceGeometry?: boolean; vehicleClass?: string | null } = {},
): RouteGeometryViewportOfflineCacheLookup | null {
  const normalized = normalizeRouteGeometryViewportBbox(bbox);
  if (!normalized) return null;
  return {
    bbox: normalized,
    cacheKey: buildRouteGeometryViewportCacheKey(normalized, zoom, options),
  };
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
    result: input.result,
  };
  persistence.set(input.lookup.cacheKey, JSON.stringify(entry));
}

export async function flushRouteGeometryViewportOfflineCache(): Promise<void> {
  await persistence.flush();
}
