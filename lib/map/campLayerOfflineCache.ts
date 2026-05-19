import { createPersistedKeyValueCache } from '../keyValuePersistence';
import type {
  CampLayerFetchBbox,
  CampLayerFetchLayer,
} from './campLayerFetchScheduler';
import {
  buildCampLayerFetchCacheKey,
  normalizeCampLayerFetchBbox,
} from './campLayerFetchScheduler';
import type { DispersedCampingRegion } from './dispersedCampingTypes';
import type { EstablishedCampsite } from './establishedCampsiteTypes';

const CAMP_LAYER_OFFLINE_CACHE_FILE_KEY = 'ecs_camp_layer_offline_cache_v1';
const CAMP_LAYER_OFFLINE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const persistence = createPersistedKeyValueCache(CAMP_LAYER_OFFLINE_CACHE_FILE_KEY);

export type CampLayerOfflineCacheLookup = {
  layer: CampLayerFetchLayer;
  bbox: CampLayerFetchBbox;
  cacheKey: string;
};

type CampLayerOfflineCacheEntryBase = CampLayerOfflineCacheLookup & {
  cachedAt: string;
  expiresAt: string;
};

export type DispersedCampingOfflineCacheEntry = CampLayerOfflineCacheEntryBase & {
  layer: 'dispersed_camping';
  regions: DispersedCampingRegion[];
};

export type EstablishedCampgroundsOfflineCacheEntry = CampLayerOfflineCacheEntryBase & {
  layer: 'established_campgrounds';
  campsites: EstablishedCampsite[];
};

function parseEntry<T extends CampLayerOfflineCacheEntryBase>(
  raw: string | null,
  now = Date.now(),
): T | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<T> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.cacheKey !== 'string' || typeof parsed.cachedAt !== 'string') return null;
    const expiresAt = Date.parse(String(parsed.expiresAt ?? ''));
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

export function resolveCampLayerOfflineCacheLookup(
  layer: CampLayerFetchLayer,
  bbox: CampLayerFetchBbox | null | undefined,
): CampLayerOfflineCacheLookup | null {
  const normalized = normalizeCampLayerFetchBbox(bbox);
  if (!normalized) return null;
  return {
    layer,
    bbox: normalized,
    cacheKey: buildCampLayerFetchCacheKey(layer, normalized),
  };
}

export async function readDispersedCampingOfflineCache(
  cacheKey: string,
  now = Date.now(),
): Promise<DispersedCampingOfflineCacheEntry | null> {
  await persistence.waitForHydration();
  const entry = parseEntry<DispersedCampingOfflineCacheEntry>(persistence.get(cacheKey), now);
  if (!entry || entry.layer !== 'dispersed_camping' || !Array.isArray(entry.regions)) return null;
  return entry;
}

export async function readEstablishedCampgroundsOfflineCache(
  cacheKey: string,
  now = Date.now(),
): Promise<EstablishedCampgroundsOfflineCacheEntry | null> {
  await persistence.waitForHydration();
  const entry = parseEntry<EstablishedCampgroundsOfflineCacheEntry>(persistence.get(cacheKey), now);
  if (!entry || entry.layer !== 'established_campgrounds' || !Array.isArray(entry.campsites)) return null;
  return entry;
}

export function writeDispersedCampingOfflineCache(input: {
  lookup: CampLayerOfflineCacheLookup;
  regions: DispersedCampingRegion[];
  now?: number;
}): void {
  const now = input.now ?? Date.now();
  const entry: DispersedCampingOfflineCacheEntry = {
    ...input.lookup,
    layer: 'dispersed_camping',
    cachedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CAMP_LAYER_OFFLINE_CACHE_MAX_AGE_MS).toISOString(),
    regions: Array.isArray(input.regions) ? input.regions : [],
  };
  persistence.set(input.lookup.cacheKey, JSON.stringify(entry));
}

export function writeEstablishedCampgroundsOfflineCache(input: {
  lookup: CampLayerOfflineCacheLookup;
  campsites: EstablishedCampsite[];
  now?: number;
}): void {
  const now = input.now ?? Date.now();
  const entry: EstablishedCampgroundsOfflineCacheEntry = {
    ...input.lookup,
    layer: 'established_campgrounds',
    cachedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CAMP_LAYER_OFFLINE_CACHE_MAX_AGE_MS).toISOString(),
    campsites: Array.isArray(input.campsites) ? input.campsites : [],
  };
  persistence.set(input.lookup.cacheKey, JSON.stringify(entry));
}

export async function flushCampLayerOfflineCache(): Promise<void> {
  await persistence.flush();
}
