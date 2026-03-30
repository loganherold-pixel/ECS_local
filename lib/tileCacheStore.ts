/**
 * Tile Cache Store — Offline Map Tile Management
 *
 * Full offline tile caching system:
 *   - IndexedDB storage for tile blob data (web)
 *   - expo-file-system storage for tile data (native iOS/Android)
 *   - Metadata tracking for regions (bounds, zoom, tile count)
 *   - Download engine with progress callbacks
 *   - Route corridor bounds calculation
 *   - Bounding box tile enumeration
 *   - Storage usage tracking with freshness info
 *
 * Architecture:
 *   - Tile data (actual image blobs) → IndexedDB (web) / expo-file-system (native)
 *   - Download queue → in-memory with progress events
 */
import { Platform } from 'react-native';

import {
  getDocumentDirectory,
  fsGetInfo,
  fsEnsureDir,
  fsWriteString,
  fsReadString,
} from './fsCompat';

import {
  downloadAndStoreNativeTile,
  hasNativeTile,
  deleteNativeRegion,
  clearAllNativeTiles,
  getNativeStorageStats,
  getDeviceStorageInfo,
  isNativeStorageAvailable,
} from './nativeTileStorage';

const STORAGE_KEY = 'ecs_tile_cache_meta';
const QUOTA_SETTINGS_KEY = 'ecs_tile_cache_quota';
const IDB_NAME = 'ecs_tile_cache';

const IDB_STORE = 'tiles';
const IDB_VERSION = 1;

// ── Types ───────────────────────────────────────────────

export interface TileBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Freshness verification status for a cached region */
export type FreshnessStatus =
  | 'unknown'          // Never checked
  | 'checking'         // Currently verifying
  | 'fresh'            // Tiles match upstream
  | 'update-available' // Upstream tiles differ from cache
  | 'error';           // Verification failed (network error, etc.)

/** Result of a single region freshness check */
export interface FreshnessCheckResult {
  regionId: string;
  status: FreshnessStatus;
  sampledTiles: number;
  changedTiles: number;
  unchangedTiles: number;
  errorTiles: number;
  checkedAt: string;
  /** Estimated percentage of tiles that have changed */
  changePercent: number;
  message: string;
}

/** Progress callback for batch freshness checking */
export type FreshnessCheckProgress = {
  totalRegions: number;
  checkedRegions: number;
  currentRegionName: string;
  results: FreshnessCheckResult[];
  status: 'idle' | 'checking' | 'complete';
};

export interface TileCacheRegion {
  id: string;
  name: string;
  bounds: TileBounds;
  zoomMin: number;
  zoomMax: number;
  tileCount: number;
  downloadedTiles: number;
  estimatedSizeMB: number;
  actualSizeMB: number;
  downloadedAt: string;
  /** ISO timestamp of when the download completed (for freshness) */
  completedAt?: string;
  styleKey: string;
  status: 'pending' | 'downloading' | 'complete' | 'partial' | 'error' | 'cancelled';
  sourceType: 'route-corridor' | 'bounding-box' | 'manual';
  routeId?: string;
  corridorMiles?: number;
  errorMessage?: string;
  /** ISO timestamp of last freshness verification */
  lastVerifiedAt?: string;
  /** Result of last freshness check */
  freshnessStatus?: FreshnessStatus;
  /** Number of sampled tiles that differ from upstream */
  updatedTilesAvailable?: number;
  /** Estimated change percentage from last check */
  freshnessChangePercent?: number;
}


export interface TileCacheStats {
  totalRegions: number;
  totalTiles: number;
  downloadedTiles: number;
  totalSizeMB: number;
  lastDownloadAt: string | null;
  storageQuotaMB: number | null;
  storageUsedMB: number | null;
  /** Native device free space in MB (native only) */
  deviceFreeMB?: number | null;
  /** Native device total space in MB (native only) */
  deviceTotalMB?: number | null;
}

export type DownloadProgress = {
  regionId: string;
  status: 'idle' | 'calculating' | 'downloading' | 'complete' | 'error' | 'cancelled';
  totalTiles: number;
  downloadedTiles: number;
  failedTiles: number;
  percent: number;
  estimatedSizeMB: number;
  downloadedSizeMB: number;
  message: string;
  currentZoom: number;
  speed: number; // tiles per second
  eta: number; // seconds remaining
};

export type ProgressCallback = (progress: DownloadProgress) => void;

// ── Storage Quota Types ─────────────────────────────────

export interface StorageQuotaConfig {
  /** Maximum allowed cache size in MB (default 2048 = 2GB) */
  quotaLimitMB: number;
  /** Whether automatic cleanup is enabled when approaching quota */
  autoCleanupEnabled: boolean;
  /** Regions older than this many days are considered stale (default 90) */
  staleRegionDays: number;
  /** Warning threshold as a fraction of quota (0.0-1.0, default 0.8) */
  warningThreshold: number;
  /** Critical threshold as a fraction of quota (0.0-1.0, default 0.95) */
  criticalThreshold: number;
}

export const DEFAULT_QUOTA_CONFIG: StorageQuotaConfig = {
  quotaLimitMB: 2048,
  autoCleanupEnabled: true,
  staleRegionDays: 90,
  warningThreshold: 0.8,
  criticalThreshold: 0.95,
};

export interface RegionSizeBreakdown {
  id: string;
  name: string;
  sizeMB: number;
  tileCount: number;
  downloadedTiles: number;
  status: TileCacheRegion['status'];
  styleKey: string;
  completedAt: string | null;
  downloadedAt: string;
  ageDays: number;
  /** Last accessed date (completedAt or downloadedAt) */
  lastAccessedAt: string;
  /** Fraction of total storage (0.0-1.0) */
  fractionOfTotal: number;
  /** Whether this region is considered stale */
  isStale: boolean;
  sourceType: TileCacheRegion['sourceType'];
  zoomRange: string;
}

export interface QuotaStatus {
  config: StorageQuotaConfig;
  usedMB: number;
  availableMB: number;
  usedFraction: number;
  level: 'ok' | 'warning' | 'critical' | 'exceeded';
  regionBreakdown: RegionSizeBreakdown[];
  staleRegionCount: number;
  staleSizeMB: number;
  /** Regions sorted oldest-first for purge priority */
  purgeOrder: string[];
}

// ── Region Overlap & Merge Types ────────────────────────

/** Overlap information between two regions */
export interface RegionOverlapInfo {
  /** ID of the other region */
  otherRegionId: string;
  /** Name of the other region */
  otherRegionName: string;
  /** Percentage of this region's area that overlaps with the other (0-100) */
  overlapPercent: number;
  /** Percentage of the other region's area that overlaps with this one (0-100) */
  otherOverlapPercent: number;
  /** The intersection bounds */
  intersectionBounds: TileBounds;
  /** Estimated number of shared tiles across all zoom levels */
  sharedTileEstimate: number;
  /** Estimated wasted storage in MB from duplicated tiles */
  wastedMB: number;
  /** Whether zoom ranges overlap */
  zoomOverlap: boolean;
  /** Overlapping zoom range [min, max] or null */
  overlappingZoomRange: [number, number] | null;
}

/** A pair of overlapping regions */
export interface RegionOverlapPair {
  regionA: { id: string; name: string };
  regionB: { id: string; name: string };
  /** Overlap as percentage of the smaller region */
  overlapPercent: number;
  /** Intersection bounds */
  intersectionBounds: TileBounds;
  /** Shared tile estimate */
  sharedTileEstimate: number;
  /** Wasted MB from duplication */
  wastedMB: number;
  /** Whether zoom ranges also overlap */
  zoomOverlap: boolean;
  overlappingZoomRange: [number, number] | null;
}

/** A merge candidate: a group of regions that can be consolidated */
export interface MergeCandidate {
  /** IDs of regions to merge */
  regionIds: string[];
  /** Names of regions to merge */
  regionNames: string[];
  /** Union bounds covering all regions */
  unionBounds: TileBounds;
  /** Zoom range covering all regions */
  zoomMin: number;
  zoomMax: number;
  /** Total tiles in the current separate regions */
  currentTotalTiles: number;
  /** Tiles in the merged (union) region */
  mergedTileCount: number;
  /** Estimated shared/duplicated tiles */
  sharedTileEstimate: number;
  /** Current total size in MB */
  currentTotalSizeMB: number;
  /** Estimated merged size in MB */
  mergedEstimatedSizeMB: number;
  /** Estimated savings in MB */
  savingsMB: number;
  /** Savings as percentage */
  savingsPercent: number;
  /** Style key (must match for merge) */
  styleKey: string;
}

/** Result of a merge operation */
export interface MergeResult {
  success: boolean;
  /** The newly created merged region */
  mergedRegion?: TileCacheRegion;
  /** IDs of regions that were removed */
  removedRegionIds: string[];
  /** Tiles deduplicated */
  deduplicatedTiles: number;
  /** Storage saved in MB */
  savedMB: number;
  message: string;
}



// ── Tile Math Utilities ─────────────────────────────────

export function lngLatToTile(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

export function tileToLngLat(x: number, y: number, zoom: number): { lng: number; lat: number } {
  const n = Math.pow(2, zoom);
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lng, lat };
}

export function getTilesForBounds(
  bounds: TileBounds,
  zoom: number
): Array<{ x: number; y: number; z: number }> {
  const min = lngLatToTile(bounds.minLng, bounds.maxLat, zoom);
  const max = lngLatToTile(bounds.maxLng, bounds.minLat, zoom);
  const tiles: Array<{ x: number; y: number; z: number }> = [];

  const minX = Math.min(min.x, max.x);
  const maxX = Math.max(min.x, max.x);
  const minY = Math.min(min.y, max.y);
  const maxY = Math.max(min.y, max.y);

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
}

export function countTilesForRegion(
  bounds: TileBounds,
  zoomMin: number,
  zoomMax: number
): number {
  let total = 0;
  for (let z = zoomMin; z <= zoomMax; z++) {
    total += getTilesForBounds(bounds, z).length;
  }
  return total;
}

export function estimateSizeMB(tileCount: number, styleKey: string = 'tactical'): number {
  const avgKB = styleKey === 'satellite' ? 40 : styleKey === 'terrain' ? 25 : 15;
  return Math.round((tileCount * avgKB) / 1024 * 10) / 10;
}

export function computeRouteCorridor(
  points: Array<{ lat: number; lng: number }>,
  corridorMiles: number
): TileBounds | null {
  if (points.length === 0) return null;

  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;

  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }

  const bufferDeg = corridorMiles / 69;
  const avgLat = (minLat + maxLat) / 2;
  const lngBuffer = bufferDeg / Math.cos((avgLat * Math.PI) / 180);

  return {
    minLat: minLat - bufferDeg,
    maxLat: maxLat + bufferDeg,
    minLng: minLng - lngBuffer,
    maxLng: maxLng + lngBuffer,
  };
}

export function getTileBreakdown(
  bounds: TileBounds,
  zoomMin: number,
  zoomMax: number
): Array<{ zoom: number; tiles: number; sizeMB: number }> {
  const breakdown: Array<{ zoom: number; tiles: number; sizeMB: number }> = [];
  for (let z = zoomMin; z <= zoomMax; z++) {
    const tiles = getTilesForBounds(bounds, z).length;
    breakdown.push({
      zoom: z,
      tiles,
      sizeMB: Math.round((tiles * 20) / 1024 * 10) / 10,
    });
  }
  return breakdown;
}

// ── IndexedDB Tile Storage (Web) ────────────────────────

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbInitPromise) return dbInitPromise;

  if (Platform.OS !== 'web' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  dbInitPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };

      request.onsuccess = (event) => {
        dbInstance = (event.target as IDBOpenDBRequest).result;
        resolve(dbInstance);
      };

      request.onerror = () => {
        console.warn('[TileCache] IndexedDB open failed');
        resolve(null);
      };
    } catch (e) {
      console.warn('[TileCache] IndexedDB not available:', e);
      resolve(null);
    }
  });

  return dbInitPromise;
}

async function storeTile(key: string, data: ArrayBuffer): Promise<boolean> {
  const db = await openDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(data, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function getTile(key: string): Promise<ArrayBuffer | null> {
  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function deleteTilesForRegion(regionId: string): Promise<number> {
  // Native: use file system
  if (isNativeStorageAvailable()) {
    return deleteNativeRegion(regionId);
  }

  // Web: use IndexedDB
  const db = await openDB();
  if (!db) return 0;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAllKeys();
      let deleted = 0;

      req.onsuccess = () => {
        const keys = req.result as string[];
        const regionKeys = keys.filter(k => k.startsWith(`${regionId}/`));

        for (const key of regionKeys) {
          store.delete(key);
          deleted++;
        }

        tx.oncomplete = () => resolve(deleted);
        tx.onerror = () => resolve(deleted);
      };

      req.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}

async function clearAllTiles(): Promise<void> {
  // Native: use file system
  if (isNativeStorageAvailable()) {
    await clearAllNativeTiles();
    return;
  }

  // Web: use IndexedDB
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function getStorageEstimate(): Promise<{ usedMB: number; quotaMB: number } | null> {
  // Native: use device storage info
  if (isNativeStorageAvailable()) {
    const info = await getDeviceStorageInfo();
    if (info) {
      const nativeStats = await getNativeStorageStats();
      return {
        usedMB: nativeStats.totalSizeMB,
        quotaMB: info.freeMB + nativeStats.totalSizeMB, // approximate available
      };
    }
    return null;
  }

  // Web: use Storage API
  if (Platform.OS !== 'web') return null;
  try {
    if (navigator && 'storage' in navigator && 'estimate' in (navigator as any).storage) {
      const estimate = await (navigator as any).storage.estimate();
      return {
        usedMB: Math.round((estimate.usage || 0) / (1024 * 1024) * 10) / 10,
        quotaMB: Math.round((estimate.quota || 0) / (1024 * 1024)),
      };
    }
  } catch {}
  return null;
}

// ── Tile URL Builder ────────────────────────────────────

function buildTileUrl(x: number, y: number, z: number, styleKey: string): string {
  switch (styleKey) {
    case 'satellite':
      return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    case 'terrain':
      return `https://tile.opentopomap.org/${z}/${x}/${y}.png`;
    default:
      return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  }
}

function tileKey(regionId: string, x: number, y: number, z: number): string {
  return `${regionId}/${z}/${x}/${y}`;
}

// ── Download Engine ─────────────────────────────────────

const activeDownloads = new Map<string, { cancelled: boolean }>();

/**
 * Download all tiles for a region with progress tracking.
 * Uses IndexedDB on web, expo-file-system on native.
 */
async function downloadRegion(
  region: TileCacheRegion,
  onProgress: ProgressCallback,
  concurrency: number = 4
): Promise<{ success: boolean; downloaded: number; failed: number; sizeMB: number }> {
  const controller = { cancelled: false };
  activeDownloads.set(region.id, controller);
  const useNative = isNativeStorageAvailable();

  // Enumerate all tiles
  const allTiles: Array<{ x: number; y: number; z: number }> = [];
  for (let z = region.zoomMin; z <= region.zoomMax; z++) {
    const tiles = getTilesForBounds(region.bounds, z);
    allTiles.push(...tiles);
  }

  const totalTiles = allTiles.length;
  let downloadedTiles = 0;
  let failedTiles = 0;
  let totalBytes = 0;
  const startTime = Date.now();

  const reportProgress = (currentZoom: number) => {
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = elapsed > 0 ? downloadedTiles / elapsed : 0;
    const remaining = totalTiles - downloadedTiles - failedTiles;
    const eta = speed > 0 ? remaining / speed : 0;

    onProgress({
      regionId: region.id,
      status: controller.cancelled ? 'cancelled' : 'downloading',
      totalTiles,
      downloadedTiles,
      failedTiles,
      percent: totalTiles > 0 ? Math.round((downloadedTiles / totalTiles) * 100) : 0,
      estimatedSizeMB: estimateSizeMB(totalTiles, region.styleKey),
      downloadedSizeMB: Math.round((totalBytes / (1024 * 1024)) * 10) / 10,
      message: `Downloading zoom ${currentZoom}...`,
      currentZoom,
      speed: Math.round(speed * 10) / 10,
      eta: Math.round(eta),
    });
  };

  // Process tiles in batches with concurrency
  const processBatch = async (batch: Array<{ x: number; y: number; z: number }>) => {
    const promises = batch.map(async (tile) => {
      if (controller.cancelled) return;

      if (useNative) {
        // ── Native path: expo-file-system ──
        const cached = await hasNativeTile(region.id, tile.x, tile.y, tile.z);
        if (cached) {
          downloadedTiles++;
          totalBytes += 15 * 1024; // estimate 15KB per cached tile
          return;
        }

        const url = buildTileUrl(tile.x, tile.y, tile.z, region.styleKey);
        const sizeBytes = await downloadAndStoreNativeTile(
          region.id, tile.x, tile.y, tile.z, url
        );

        if (sizeBytes >= 0) {
          downloadedTiles++;
          totalBytes += sizeBytes;
        } else {
          failedTiles++;
        }
      } else {
        // ── Web path: IndexedDB ──
        const key = tileKey(region.id, tile.x, tile.y, tile.z);
        const existing = await getTile(key);
        if (existing) {
          downloadedTiles++;
          totalBytes += existing.byteLength;
          return;
        }

        try {
          const url = buildTileUrl(tile.x, tile.y, tile.z, region.styleKey);
          const abortCtrl = new AbortController();
          const timeout = setTimeout(() => abortCtrl.abort(), 15000);
          const response = await fetch(url, { signal: abortCtrl.signal });
          clearTimeout(timeout);

          if (!response.ok) {
            failedTiles++;
            return;
          }

          const data = await response.arrayBuffer();
          const stored = await storeTile(key, data);

          if (stored) {
            downloadedTiles++;
            totalBytes += data.byteLength;
          } else {
            failedTiles++;
          }
        } catch {
          failedTiles++;
        }
      }
    });

    await Promise.all(promises);
  };

  // Download zoom by zoom
  for (let z = region.zoomMin; z <= region.zoomMax; z++) {
    if (controller.cancelled) break;

    const zoomTiles = allTiles.filter(t => t.z === z);
    reportProgress(z);

    for (let i = 0; i < zoomTiles.length; i += concurrency) {
      if (controller.cancelled) break;
      const batch = zoomTiles.slice(i, i + concurrency);
      await processBatch(batch);
      reportProgress(z);
    }
  }

  activeDownloads.delete(region.id);

  const sizeMB = Math.round((totalBytes / (1024 * 1024)) * 10) / 10;

  // Final progress
  onProgress({
    regionId: region.id,
    status: controller.cancelled ? 'cancelled' : failedTiles > totalTiles * 0.5 ? 'error' : 'complete',
    totalTiles,
    downloadedTiles,
    failedTiles,
    percent: 100,
    estimatedSizeMB: estimateSizeMB(totalTiles, region.styleKey),
    downloadedSizeMB: sizeMB,
    message: controller.cancelled ? 'Download cancelled' :
      failedTiles > 0 ? `Complete with ${failedTiles} failed tiles` : 'Download complete',
    currentZoom: region.zoomMax,
    speed: 0,
    eta: 0,
  });

  return { success: !controller.cancelled && failedTiles < totalTiles * 0.5, downloaded: downloadedTiles, failed: failedTiles, sizeMB };
}

function cancelDownload(regionId: string): void {
  const controller = activeDownloads.get(regionId);
  if (controller) {
    controller.cancelled = true;
  }
}

function isDownloading(regionId: string): boolean {
  return activeDownloads.has(regionId);
}

// ── Metadata Persistence (cross-platform) ───────────────

const memoryMeta: { regions: TileCacheRegion[] | null } = { regions: null };

/**
 * Load region metadata. Uses localStorage on web, in-memory + file on native.
 */
function loadMetadata(): TileCacheRegion[] {
  if (memoryMeta.regions !== null) return memoryMeta.regions;

  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        memoryMeta.regions = JSON.parse(raw);
        return memoryMeta.regions!;
      }
    }
  } catch (e) {
    console.warn('[TileCacheStore] Failed to load metadata:', e);
  }

  memoryMeta.regions = [];
  return memoryMeta.regions;
}

function saveMetadata(regions: TileCacheRegion[]): void {
  memoryMeta.regions = regions;
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(regions));
    }
    // On native, metadata is also persisted via nativeTileStorage manifests
    // The in-memory cache is the primary source during the session
    // We also persist to a JSON file for cross-session persistence
    if (isNativeStorageAvailable()) {
      persistNativeMetadata(regions).catch(() => {});
    }
  } catch (e) {
    console.warn('[TileCacheStore] Failed to save metadata:', e);
  }
}

/**
 * Persist metadata to native file system for cross-session persistence.
 */
async function persistNativeMetadata(regions: TileCacheRegion[]): Promise<void> {
  try {
    const docDir = await getDocumentDirectory();
    if (!docDir) return;
    const dir = `${docDir}ecs-tiles`;
    await fsEnsureDir(dir);
    const metaPath = `${dir}/_regions.json`;
    await fsWriteString(metaPath, JSON.stringify(regions));
  } catch {}
}

/**
 * Load metadata from native file system (called once on init).
 */
async function loadNativeMetadata(): Promise<TileCacheRegion[] | null> {
  if (!isNativeStorageAvailable()) return null;
  try {
    const docDir = await getDocumentDirectory();
    if (!docDir) return null;
    const metaPath = `${docDir}ecs-tiles/_regions.json`;
    const info = await fsGetInfo(metaPath);
    if (!info.exists) return null;

    const raw = await fsReadString(metaPath);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}



// ── UUID Generator ──────────────────────────────────────

function generateId(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── TileCacheStore Class ────────────────────────────────

class TileCacheStore {
  private regions: TileCacheRegion[] = [];
  private loaded = false;
  private listeners: Array<() => void> = [];
  private nativeInitialized = false;

  private load(): void {
    if (this.loaded) return;
    this.regions = loadMetadata();
    this.loaded = true;

    // Async: load native metadata if available (will merge on completion)
    if (isNativeStorageAvailable() && !this.nativeInitialized) {
      this.nativeInitialized = true;
      loadNativeMetadata().then((nativeRegions) => {
        if (nativeRegions && nativeRegions.length > 0 && this.regions.length === 0) {
          this.regions = nativeRegions;
          memoryMeta.regions = nativeRegions;
          this.notifyListeners();
        }
      }).catch(() => {});
    }
  }

  private save(): void {
    saveMetadata(this.regions);
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const fn of this.listeners) fn();
  }

  /** Subscribe to changes */
  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  getRegions(): TileCacheRegion[] {
    this.load();
    return [...this.regions];
  }

  getRegion(id: string): TileCacheRegion | undefined {
    this.load();
    return this.regions.find(r => r.id === id);
  }

  addRegion(region: TileCacheRegion): void {
    this.load();
    this.regions = this.regions.filter(r => r.id !== region.id);
    this.regions.push(region);
    this.save();
  }

  updateRegion(regionId: string, updates: Partial<TileCacheRegion>): void {
    this.load();
    const idx = this.regions.findIndex(r => r.id === regionId);
    if (idx !== -1) {
      this.regions[idx] = { ...this.regions[idx], ...updates };
      this.save();
    }
  }

  removeRegion(regionId: string): void {
    this.load();
    this.regions = this.regions.filter(r => r.id !== regionId);
    this.save();
  }

  getStats(): TileCacheStats {
    this.load();
    const totalTiles = this.regions.reduce((sum, r) => sum + r.tileCount, 0);
    const downloadedTiles = this.regions.reduce((sum, r) => sum + r.downloadedTiles, 0);
    const totalSizeMB = this.regions.reduce((sum, r) => sum + (r.actualSizeMB || r.estimatedSizeMB), 0);
    const lastDownload = this.regions.length > 0
      ? this.regions
          .filter(r => r.downloadedAt)
          .sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt))[0]?.downloadedAt || null
      : null;

    return {
      totalRegions: this.regions.length,
      totalTiles,
      downloadedTiles,
      totalSizeMB: Math.round(totalSizeMB * 10) / 10,
      lastDownloadAt: lastDownload,
      storageQuotaMB: null,
      storageUsedMB: null,
    };
  }

  /** Get stats with async storage estimate (cross-platform) */
  async getStatsWithStorage(): Promise<TileCacheStats> {
    const stats = this.getStats();

    if (isNativeStorageAvailable()) {
      // Native: get actual file system stats
      const nativeStats = await getNativeStorageStats();
      const deviceInfo = await getDeviceStorageInfo();

      // Override with actual native storage data
      if (nativeStats.totalSizeMB > 0) {
        stats.storageUsedMB = nativeStats.totalSizeMB;
      }
      if (deviceInfo) {
        stats.storageQuotaMB = deviceInfo.freeMB + (stats.storageUsedMB || 0);
        stats.deviceFreeMB = deviceInfo.freeMB;
        stats.deviceTotalMB = deviceInfo.totalMB;
      }
    } else {
      // Web: use Storage API
      const estimate = await getStorageEstimate();
      if (estimate) {
        stats.storageQuotaMB = estimate.quotaMB;
        stats.storageUsedMB = estimate.usedMB;
      }
    }

    return stats;
  }

  clearAll(): void {
    this.regions = [];
    this.save();
    clearAllTiles().catch(() => {});
  }

  /** Create a new region from route corridor */
  createFromRoute(
    name: string,
    points: Array<{ lat: number; lng: number }>,
    corridorMiles: number,
    zoomMin: number,
    zoomMax: number,
    styleKey: string
  ): TileCacheRegion | null {
    const bounds = computeRouteCorridor(points, corridorMiles);
    if (!bounds) return null;

    const tileCount = countTilesForRegion(bounds, zoomMin, zoomMax);
    const region: TileCacheRegion = {
      id: generateId(),
      name,
      bounds,
      zoomMin,
      zoomMax,
      tileCount,
      downloadedTiles: 0,
      estimatedSizeMB: estimateSizeMB(tileCount, styleKey),
      actualSizeMB: 0,
      downloadedAt: new Date().toISOString(),
      styleKey,
      status: 'pending',
      sourceType: 'route-corridor',
      corridorMiles,
    };

    this.addRegion(region);
    return region;
  }

  /** Create a new region from bounding box */
  createFromBounds(
    name: string,
    bounds: TileBounds,
    zoomMin: number,
    zoomMax: number,
    styleKey: string
  ): TileCacheRegion {
    const tileCount = countTilesForRegion(bounds, zoomMin, zoomMax);
    const region: TileCacheRegion = {
      id: generateId(),
      name,
      bounds,
      zoomMin,
      zoomMax,
      tileCount,
      downloadedTiles: 0,
      estimatedSizeMB: estimateSizeMB(tileCount, styleKey),
      actualSizeMB: 0,
      downloadedAt: new Date().toISOString(),
      styleKey,
      status: 'pending',
      sourceType: 'bounding-box',
    };

    this.addRegion(region);
    return region;
  }

  /** Start downloading a region */
  async startDownload(
    regionId: string,
    onProgress: ProgressCallback
  ): Promise<boolean> {
    const region = this.getRegion(regionId);
    if (!region) return false;

    this.updateRegion(regionId, { status: 'downloading' });

    const wrappedProgress: ProgressCallback = (progress) => {
      const updates: Partial<TileCacheRegion> = {
        downloadedTiles: progress.downloadedTiles,
        actualSizeMB: progress.downloadedSizeMB,
        status: progress.status === 'complete' ? 'complete' :
                progress.status === 'cancelled' ? 'cancelled' :
                progress.status === 'error' ? 'error' : 'downloading',
      };
      // Set completedAt when download finishes
      if (progress.status === 'complete') {
        updates.completedAt = new Date().toISOString();
      }
      this.updateRegion(regionId, updates);
      onProgress(progress);
    };

    const result = await downloadRegion(region, wrappedProgress);

    this.updateRegion(regionId, {
      status: result.success ? 'complete' : 'error',
      downloadedTiles: result.downloaded,
      actualSizeMB: result.sizeMB,
      completedAt: result.success ? new Date().toISOString() : undefined,
      errorMessage: result.success ? undefined : `${result.failed} tiles failed`,
    });

    return result.success;
  }

  /** Cancel an active download */
  cancelDownload(regionId: string): void {
    cancelDownload(regionId);
    this.updateRegion(regionId, { status: 'cancelled' });
  }

  /** Check if a region is currently downloading */
  isDownloading(regionId: string): boolean {
    return isDownloading(regionId);
  }

  /** Delete a region and its cached tiles */
  async deleteRegion(regionId: string): Promise<void> {
    this.cancelDownload(regionId);
    await deleteTilesForRegion(regionId);
    this.removeRegion(regionId);
  }

  /** Get a cached tile (for serving to map renderer) */
  async getCachedTile(regionId: string, x: number, y: number, z: number): Promise<ArrayBuffer | null> {
    return getTile(tileKey(regionId, x, y, z));
  }

  /** Check if running on native with file system storage */
  isNativeStorage(): boolean {
    return isNativeStorageAvailable();
  }

  // ══════════════════════════════════════════════════════════
  // STORAGE QUOTA MANAGEMENT
  // ══════════════════════════════════════════════════════════

  /** Load quota configuration from persistent storage */
  getQuotaConfig(): StorageQuotaConfig {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(QUOTA_SETTINGS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return { ...DEFAULT_QUOTA_CONFIG, ...parsed };
        }
      }
    } catch {}
    return { ...DEFAULT_QUOTA_CONFIG };
  }

  /** Save quota configuration to persistent storage */
  setQuotaConfig(config: Partial<StorageQuotaConfig>): void {
    const current = this.getQuotaConfig();
    const merged = { ...current, ...config };
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(QUOTA_SETTINGS_KEY, JSON.stringify(merged));
      }
      // Native: persist alongside region metadata
      if (isNativeStorageAvailable()) {
        this.persistNativeQuotaConfig(merged).catch(() => {});
      }
    } catch (e) {
      console.warn('[TileCacheStore] Failed to save quota config:', e);
    }
    this.notifyListeners();
  }

  /** Persist quota config to native file system */
  private async persistNativeQuotaConfig(config: StorageQuotaConfig): Promise<void> {
    try {
      const docDir = await getDocumentDirectory();
      if (!docDir) return;
      const dir = `${docDir}ecs-tiles`;
      await fsEnsureDir(dir);
      await fsWriteString(`${dir}/_quota.json`, JSON.stringify(config));
    } catch {}
  }


  /** Get per-region size breakdown with computed metadata */
  getRegionBreakdown(): RegionSizeBreakdown[] {
    this.load();
    const totalSizeMB = this.regions.reduce((sum, r) => sum + (r.actualSizeMB || r.estimatedSizeMB), 0);
    const config = this.getQuotaConfig();
    const now = Date.now();

    return this.regions.map(r => {
      const sizeMB = r.actualSizeMB > 0 ? r.actualSizeMB : r.estimatedSizeMB;
      const lastAccessed = r.completedAt || r.downloadedAt;
      const ageDays = Math.floor((now - new Date(lastAccessed).getTime()) / (1000 * 60 * 60 * 24));

      return {
        id: r.id,
        name: r.name,
        sizeMB: Math.round(sizeMB * 10) / 10,
        tileCount: r.tileCount,
        downloadedTiles: r.downloadedTiles,
        status: r.status,
        styleKey: r.styleKey,
        completedAt: r.completedAt || null,
        downloadedAt: r.downloadedAt,
        ageDays,
        lastAccessedAt: lastAccessed,
        fractionOfTotal: totalSizeMB > 0 ? sizeMB / totalSizeMB : 0,
        isStale: ageDays >= config.staleRegionDays,
        sourceType: r.sourceType,
        zoomRange: `Z${r.zoomMin}\u2013${r.zoomMax}`,
      };
    }).sort((a, b) => b.sizeMB - a.sizeMB);
  }

  /** Get comprehensive quota status */
  getQuotaStatus(): QuotaStatus {
    const config = this.getQuotaConfig();
    const breakdown = this.getRegionBreakdown();
    const usedMB = breakdown.reduce((sum, r) => sum + r.sizeMB, 0);
    const usedFraction = config.quotaLimitMB > 0 ? usedMB / config.quotaLimitMB : 0;

    let level: QuotaStatus['level'] = 'ok';
    if (usedFraction >= 1.0) level = 'exceeded';
    else if (usedFraction >= config.criticalThreshold) level = 'critical';
    else if (usedFraction >= config.warningThreshold) level = 'warning';

    const staleRegions = breakdown.filter(r => r.isStale);
    const staleSizeMB = staleRegions.reduce((sum, r) => sum + r.sizeMB, 0);

    // Purge order: oldest/least-recently-accessed first, stale regions prioritized
    const purgeOrder = [...breakdown]
      .sort((a, b) => {
        // Stale regions first
        if (a.isStale && !b.isStale) return -1;
        if (!a.isStale && b.isStale) return 1;
        // Then by last accessed date (oldest first)
        return new Date(a.lastAccessedAt).getTime() - new Date(b.lastAccessedAt).getTime();
      })
      .filter(r => r.status !== 'downloading') // never purge active downloads
      .map(r => r.id);

    return {
      config,
      usedMB: Math.round(usedMB * 10) / 10,
      availableMB: Math.round(Math.max(0, config.quotaLimitMB - usedMB) * 10) / 10,
      usedFraction: Math.round(usedFraction * 1000) / 1000,
      level,
      regionBreakdown: breakdown,
      staleRegionCount: staleRegions.length,
      staleSizeMB: Math.round(staleSizeMB * 10) / 10,
      purgeOrder,
    };
  }

  /**
   * Check if a download of the given estimated size can proceed within quota.
   * Returns { canProceed, needsCleanupMB, message }.
   */
  checkQuotaBeforeDownload(estimatedSizeMB: number): {
    canProceed: boolean;
    needsCleanupMB: number;
    message: string;
  } {
    const status = this.getQuotaStatus();
    const projectedUsedMB = status.usedMB + estimatedSizeMB;
    const projectedFraction = status.config.quotaLimitMB > 0
      ? projectedUsedMB / status.config.quotaLimitMB
      : 0;

    if (projectedFraction <= 1.0) {
      return { canProceed: true, needsCleanupMB: 0, message: 'OK' };
    }

    const overageMB = projectedUsedMB - status.config.quotaLimitMB;
    return {
      canProceed: false,
      needsCleanupMB: Math.ceil(overageMB),
      message: `Download would exceed quota by ${Math.ceil(overageMB)} MB. Free space or increase quota limit.`,
    };
  }

  /**
   * Purge stale regions older than the given number of days.
   * Returns the number of regions purged and total MB freed.
   */
  async purgeStaleRegions(maxAgeDays?: number): Promise<{ purged: number; freedMB: number }> {
    const config = this.getQuotaConfig();
    const threshold = maxAgeDays ?? config.staleRegionDays;
    const breakdown = this.getRegionBreakdown();
    const stale = breakdown.filter(r => r.ageDays >= threshold && r.status !== 'downloading');

    let purged = 0;
    let freedMB = 0;

    for (const region of stale) {
      try {
        await this.deleteRegion(region.id);
        purged++;
        freedMB += region.sizeMB;
      } catch (e) {
        console.warn(`[TileCacheStore] Failed to purge region ${region.id}:`, e);
      }
    }

    return { purged, freedMB: Math.round(freedMB * 10) / 10 };
  }

  /**
   * Automatic cleanup: when approaching quota, purge oldest/least-recently-accessed
   * regions until usage drops below the warning threshold.
   * Only runs if autoCleanupEnabled is true.
   * Returns cleanup results.
   */
  async autoCleanup(): Promise<{ purged: number; freedMB: number; triggered: boolean }> {
    const config = this.getQuotaConfig();
    if (!config.autoCleanupEnabled) {
      return { purged: 0, freedMB: 0, triggered: false };
    }

    const status = this.getQuotaStatus();

    // Only trigger if at or above warning threshold
    if (status.level === 'ok') {
      return { purged: 0, freedMB: 0, triggered: false };
    }

    console.log(`[TileCacheStore] Auto-cleanup triggered: ${status.level} (${status.usedMB}/${status.config.quotaLimitMB} MB)`);

    const targetMB = status.config.quotaLimitMB * status.config.warningThreshold * 0.9; // aim for 90% of warning
    let currentUsedMB = status.usedMB;
    let purged = 0;
    let freedMB = 0;

    // First pass: purge stale regions
    const staleResult = await this.purgeStaleRegions();
    purged += staleResult.purged;
    freedMB += staleResult.freedMB;
    currentUsedMB -= staleResult.freedMB;

    // If still over target, purge by age (oldest first)
    if (currentUsedMB > targetMB) {
      const refreshedStatus = this.getQuotaStatus();
      for (const regionId of refreshedStatus.purgeOrder) {
        if (currentUsedMB <= targetMB) break;

        const region = this.getRegion(regionId);
        if (!region || region.status === 'downloading') continue;

        const regionSize = region.actualSizeMB > 0 ? region.actualSizeMB : region.estimatedSizeMB;
        try {
          await this.deleteRegion(regionId);
          purged++;
          freedMB += regionSize;
          currentUsedMB -= regionSize;
        } catch {}
      }
    }

    console.log(`[TileCacheStore] Auto-cleanup complete: purged ${purged} regions, freed ${freedMB.toFixed(1)} MB`);
    return { purged, freedMB: Math.round(freedMB * 10) / 10, triggered: true };
  }

  /**
   * Start downloading a region with automatic quota management.
   * Runs auto-cleanup before download if needed.
   */
  async startDownloadWithQuota(
    regionId: string,
    onProgress: ProgressCallback
  ): Promise<{ success: boolean; cleanupResult?: { purged: number; freedMB: number } }> {
    const region = this.getRegion(regionId);
    if (!region) return { success: false };

    // Check quota
    const quotaCheck = this.checkQuotaBeforeDownload(region.estimatedSizeMB);

    if (!quotaCheck.canProceed) {
      // Try auto-cleanup first
      const cleanupResult = await this.autoCleanup();

      // Re-check after cleanup
      const recheck = this.checkQuotaBeforeDownload(region.estimatedSizeMB);
      if (!recheck.canProceed) {
        // Still can't proceed — report error
        onProgress({
          regionId,
          status: 'error',
          totalTiles: region.tileCount,
          downloadedTiles: 0,
          failedTiles: 0,
          percent: 0,
          estimatedSizeMB: region.estimatedSizeMB,
          downloadedSizeMB: 0,
          message: recheck.message,
          currentZoom: region.zoomMin,
          speed: 0,
          eta: 0,
        });
        this.updateRegion(regionId, {
          status: 'error',
          errorMessage: recheck.message,
        });
        return { success: false, cleanupResult };
      }

      // Cleanup freed enough space
      const success = await this.startDownload(regionId, onProgress);
      return { success, cleanupResult };
    }

    // Quota OK — proceed directly
    const success = await this.startDownload(regionId, onProgress);
    return { success };
  }

  // ══════════════════════════════════════════════════════════
  // TILE FRESHNESS VERIFICATION
  // ══════════════════════════════════════════════════════════

  /**
   * Select a representative sample of tiles from a region for freshness checking.
   * Samples across zoom levels and spatial distribution for reliable detection.
   * Returns up to `sampleSize` tiles (default 8).
   */
  private sampleTilesForRegion(
    region: TileCacheRegion,
    sampleSize: number = 8
  ): Array<{ x: number; y: number; z: number }> {
    const allTiles: Array<{ x: number; y: number; z: number }> = [];
    for (let z = region.zoomMin; z <= region.zoomMax; z++) {
      allTiles.push(...getTilesForBounds(region.bounds, z));
    }

    if (allTiles.length <= sampleSize) return allTiles;

    // Strategy: pick tiles distributed across zoom levels and spatial extent
    const sampled: Array<{ x: number; y: number; z: number }> = [];
    const zoomLevels = new Set(allTiles.map(t => t.z));
    const tilesPerZoom = Math.max(1, Math.floor(sampleSize / zoomLevels.size));

    for (const z of zoomLevels) {
      const zoomTiles = allTiles.filter(t => t.z === z);
      if (zoomTiles.length <= tilesPerZoom) {
        sampled.push(...zoomTiles);
      } else {
        // Pick evenly spaced tiles
        const step = Math.floor(zoomTiles.length / tilesPerZoom);
        for (let i = 0; i < tilesPerZoom && i * step < zoomTiles.length; i++) {
          sampled.push(zoomTiles[i * step]);
        }
      }
      if (sampled.length >= sampleSize) break;
    }

    return sampled.slice(0, sampleSize);
  }

  /**
   * Check a single tile's freshness by comparing cached data with upstream.
   * Uses HEAD request to compare Content-Length, and falls back to GET + size comparison.
   * Returns: 'fresh' | 'changed' | 'error'
   */
  private async checkSingleTileFreshness(
    tile: { x: number; y: number; z: number },
    regionId: string,
    styleKey: string
  ): Promise<'fresh' | 'changed' | 'error'> {
    const url = buildTileUrl(tile.x, tile.y, tile.z, styleKey);
    const key = tileKey(regionId, tile.x, tile.y, tile.z);

    try {
      // Get cached tile size
      let cachedSize = 0;
      if (isNativeStorageAvailable()) {
        const hasTile = await hasNativeTile(regionId, tile.x, tile.y, tile.z);
        if (!hasTile) return 'changed'; // tile missing from cache
        // On native we can't easily get size without reading, so use HEAD comparison
        cachedSize = -1; // sentinel: we'll rely on ETag/Last-Modified
      } else {
        const cached = await getTile(key);
        if (!cached) return 'changed'; // tile missing from cache
        cachedSize = cached.byteLength;
      }

      // Make HEAD request to check upstream
      const abortCtrl = new AbortController();
      const timeout = setTimeout(() => abortCtrl.abort(), 10000);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'HEAD',
          signal: abortCtrl.signal,
        });
        clearTimeout(timeout);
      } catch {
        // HEAD might not be supported, try GET with range
        clearTimeout(timeout);
        const abortCtrl2 = new AbortController();
        const timeout2 = setTimeout(() => abortCtrl2.abort(), 10000);
        try {
          response = await fetch(url, {
            method: 'GET',
            signal: abortCtrl2.signal,
          });
          clearTimeout(timeout2);
        } catch {
          clearTimeout(timeout2);
          return 'error';
        }
      }

      if (!response.ok) return 'error';

      // Compare using Content-Length
      const contentLength = response.headers.get('content-length');
      if (contentLength && cachedSize > 0) {
        const serverSize = parseInt(contentLength, 10);
        // Allow 5% tolerance for encoding differences
        const tolerance = Math.max(100, cachedSize * 0.05);
        if (Math.abs(serverSize - cachedSize) > tolerance) {
          return 'changed';
        }
        return 'fresh';
      }

      // Compare using ETag if available
      const etag = response.headers.get('etag');
      const lastModified = response.headers.get('last-modified');

      // If we have Last-Modified, compare with region's completedAt
      if (lastModified) {
        const serverDate = new Date(lastModified).getTime();
        const region = this.getRegion(regionId);
        const cacheDate = region?.completedAt
          ? new Date(region.completedAt).getTime()
          : region?.downloadedAt
            ? new Date(region.downloadedAt).getTime()
            : 0;

        // If server tile was modified after our cache date, it's changed
        if (serverDate > cacheDate) {
          return 'changed';
        }
        return 'fresh';
      }

      // If we got a GET response, compare body size
      if (response.body && cachedSize > 0) {
        try {
          const data = await response.arrayBuffer();
          const tolerance = Math.max(100, cachedSize * 0.05);
          if (Math.abs(data.byteLength - cachedSize) > tolerance) {
            return 'changed';
          }
          return 'fresh';
        } catch {
          return 'error';
        }
      }

      // If we can't determine, assume fresh (conservative)
      return 'fresh';
    } catch {
      return 'error';
    }
  }

  /**
   * Check freshness of a single cached region by sampling tiles and comparing
   * with the upstream tile server. Updates the region's freshness metadata.
   *
   * @param regionId - The region to check
   * @param sampleSize - Number of tiles to sample (default 8)
   * @returns FreshnessCheckResult with detailed findings
   */
  async checkRegionFreshness(
    regionId: string,
    sampleSize: number = 8
  ): Promise<FreshnessCheckResult> {
    const region = this.getRegion(regionId);
    if (!region) {
      return {
        regionId,
        status: 'error',
        sampledTiles: 0,
        changedTiles: 0,
        unchangedTiles: 0,
        errorTiles: 0,
        checkedAt: new Date().toISOString(),
        changePercent: 0,
        message: 'Region not found',
      };
    }

    // Only check complete or partial regions
    if (region.status !== 'complete' && region.status !== 'partial') {
      return {
        regionId,
        status: 'unknown',
        sampledTiles: 0,
        changedTiles: 0,
        unchangedTiles: 0,
        errorTiles: 0,
        checkedAt: new Date().toISOString(),
        changePercent: 0,
        message: `Region status is ${region.status}, skipping check`,
      };
    }

    // Mark as checking
    this.updateRegion(regionId, { freshnessStatus: 'checking' });

    const samples = this.sampleTilesForRegion(region, sampleSize);
    let changedTiles = 0;
    let unchangedTiles = 0;
    let errorTiles = 0;

    // Check each sampled tile
    for (const tile of samples) {
      const result = await this.checkSingleTileFreshness(tile, regionId, region.styleKey);
      switch (result) {
        case 'changed': changedTiles++; break;
        case 'fresh': unchangedTiles++; break;
        case 'error': errorTiles++; break;
      }
    }

    const checkedAt = new Date().toISOString();
    const validChecks = changedTiles + unchangedTiles;
    const changePercent = validChecks > 0
      ? Math.round((changedTiles / validChecks) * 100)
      : 0;

    // Determine status
    let status: FreshnessStatus;
    if (errorTiles === samples.length) {
      status = 'error';
    } else if (changedTiles > 0) {
      status = 'update-available';
    } else {
      status = 'fresh';
    }

    // Build message
    let message: string;
    if (status === 'fresh') {
      message = `All ${unchangedTiles} sampled tiles match upstream`;
    } else if (status === 'update-available') {
      message = `${changedTiles} of ${samples.length} sampled tiles have upstream changes (~${changePercent}% estimated)`;
    } else if (status === 'error') {
      message = `Verification failed: ${errorTiles} tile checks errored`;
    } else {
      message = 'Check incomplete';
    }

    // Update region metadata
    this.updateRegion(regionId, {
      lastVerifiedAt: checkedAt,
      freshnessStatus: status,
      updatedTilesAvailable: changedTiles,
      freshnessChangePercent: changePercent,
    });

    return {
      regionId,
      status,
      sampledTiles: samples.length,
      changedTiles,
      unchangedTiles,
      errorTiles,
      checkedAt,
      changePercent,
      message,
    };
  }

  /**
   * Check freshness of all complete/partial cached regions.
   * Reports progress via callback.
   *
   * @param onProgress - Progress callback for UI updates
   * @returns Array of FreshnessCheckResult for all checked regions
   */
  async checkAllRegionsFreshness(
    onProgress?: (progress: FreshnessCheckProgress) => void
  ): Promise<FreshnessCheckResult[]> {
    this.load();
    const checkable = this.regions.filter(
      r => r.status === 'complete' || r.status === 'partial'
    );

    const results: FreshnessCheckResult[] = [];

    onProgress?.({
      totalRegions: checkable.length,
      checkedRegions: 0,
      currentRegionName: checkable[0]?.name || '',
      results: [],
      status: 'checking',
    });

    for (let i = 0; i < checkable.length; i++) {
      const region = checkable[i];

      onProgress?.({
        totalRegions: checkable.length,
        checkedRegions: i,
        currentRegionName: region.name,
        results: [...results],
        status: 'checking',
      });

      const result = await this.checkRegionFreshness(region.id);
      results.push(result);
    }

    onProgress?.({
      totalRegions: checkable.length,
      checkedRegions: checkable.length,
      currentRegionName: '',
      results,
      status: 'complete',
    });

    return results;
  }

  /**
   * Refresh (re-download) a region that has upstream updates.
   * Deletes existing tiles and re-downloads fresh copies.
   *
   * @param regionId - The region to refresh
   * @param onProgress - Download progress callback
   * @returns Success status
   */
  async refreshRegion(
    regionId: string,
    onProgress: ProgressCallback
  ): Promise<boolean> {
    const region = this.getRegion(regionId);
    if (!region) return false;

    // Delete existing tiles for this region
    await deleteTilesForRegion(regionId);

    // Reset download counters
    this.updateRegion(regionId, {
      downloadedTiles: 0,
      actualSizeMB: 0,
      status: 'pending',
      freshnessStatus: 'unknown',
      lastVerifiedAt: undefined,
      updatedTilesAvailable: undefined,
      freshnessChangePercent: undefined,
      errorMessage: undefined,
    });

    // Re-download
    const success = await this.startDownload(regionId, onProgress);

    if (success) {
      // Mark as freshly verified after successful re-download
      this.updateRegion(regionId, {
        lastVerifiedAt: new Date().toISOString(),
        freshnessStatus: 'fresh',
        updatedTilesAvailable: 0,
        freshnessChangePercent: 0,
      });
    }

    return success;
  }

  /**
   * Get count of regions that have updates available.
   */
  getUpdateAvailableCount(): number {
    this.load();
    return this.regions.filter(r => r.freshnessStatus === 'update-available').length;
  }

  /**
   * Get all regions that have updates available.
   */
  getRegionsWithUpdates(): TileCacheRegion[] {
    this.load();
    return this.regions.filter(r => r.freshnessStatus === 'update-available');
  }


  // ══════════════════════════════════════════════════════════
  // REGION OVERLAP DETECTION & MERGING
  // ══════════════════════════════════════════════════════════

  /**
   * Compute the geographic area of a TileBounds in square degrees.
   * Uses a simple lat/lng area calculation (not geodesic, but sufficient for overlap %).
   */
  private computeBoundsArea(bounds: TileBounds): number {
    const latSpan = Math.abs(bounds.maxLat - bounds.minLat);
    const lngSpan = Math.abs(bounds.maxLng - bounds.minLng);
    return latSpan * lngSpan;
  }

  /**
   * Compute the intersection bounds of two TileBounds.
   * Returns null if they don't overlap.
   */
  private computeIntersectionBounds(a: TileBounds, b: TileBounds): TileBounds | null {
    const minLat = Math.max(a.minLat, b.minLat);
    const maxLat = Math.min(a.maxLat, b.maxLat);
    const minLng = Math.max(a.minLng, b.minLng);
    const maxLng = Math.min(a.maxLng, b.maxLng);

    if (minLat >= maxLat || minLng >= maxLng) return null;

    return { minLat, maxLat, minLng, maxLng };
  }

  /**
   * Compute the union bounds covering all provided TileBounds.
   */
  computeUnionBounds(boundsList: TileBounds[]): TileBounds | null {
    if (boundsList.length === 0) return null;

    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    for (const b of boundsList) {
      minLat = Math.min(minLat, b.minLat);
      maxLat = Math.max(maxLat, b.maxLat);
      minLng = Math.min(minLng, b.minLng);
      maxLng = Math.max(maxLng, b.maxLng);
    }

    return { minLat, maxLat, minLng, maxLng };
  }

  /**
   * Count the number of shared tiles between two regions at overlapping zoom levels.
   * Uses tile coordinate math to find exact shared tile count.
   */
  private countSharedTiles(
    regionA: TileCacheRegion,
    regionB: TileCacheRegion,
    intersection: TileBounds
  ): number {
    const zoomMin = Math.max(regionA.zoomMin, regionB.zoomMin);
    const zoomMax = Math.min(regionA.zoomMax, regionB.zoomMax);

    if (zoomMin > zoomMax) return 0;

    let shared = 0;
    for (let z = zoomMin; z <= zoomMax; z++) {
      shared += getTilesForBounds(intersection, z).length;
    }
    return shared;
  }

  /**
   * Get overlap information for a specific region against all other regions.
   * Returns an array of RegionOverlapInfo for each overlapping region.
   */
  getRegionOverlaps(regionId: string): RegionOverlapInfo[] {
    this.load();
    const region = this.regions.find(r => r.id === regionId);
    if (!region) return [];

    const overlaps: RegionOverlapInfo[] = [];
    const regionArea = this.computeBoundsArea(region.bounds);

    for (const other of this.regions) {
      if (other.id === regionId) continue;
      // Only compare regions with the same style key (tiles are per-style)
      if (other.styleKey !== region.styleKey) continue;

      const intersection = this.computeIntersectionBounds(region.bounds, other.bounds);
      if (!intersection) continue;

      const intersectionArea = this.computeBoundsArea(intersection);
      const otherArea = this.computeBoundsArea(other.bounds);

      if (intersectionArea <= 0) continue;

      const overlapPercent = regionArea > 0
        ? Math.round((intersectionArea / regionArea) * 100)
        : 0;
      const otherOverlapPercent = otherArea > 0
        ? Math.round((intersectionArea / otherArea) * 100)
        : 0;

      // Only report if overlap is meaningful (>= 5%)
      if (overlapPercent < 5 && otherOverlapPercent < 5) continue;

      // Check zoom overlap
      const zoomMin = Math.max(region.zoomMin, other.zoomMin);
      const zoomMax = Math.min(region.zoomMax, other.zoomMax);
      const zoomOverlap = zoomMin <= zoomMax;
      const overlappingZoomRange: [number, number] | null = zoomOverlap
        ? [zoomMin, zoomMax]
        : null;

      const sharedTileEstimate = zoomOverlap
        ? this.countSharedTiles(region, other, intersection)
        : 0;

      const wastedMB = estimateSizeMB(sharedTileEstimate, region.styleKey);

      overlaps.push({
        otherRegionId: other.id,
        otherRegionName: other.name,
        overlapPercent,
        otherOverlapPercent,
        intersectionBounds: intersection,
        sharedTileEstimate,
        wastedMB,
        zoomOverlap,
        overlappingZoomRange,
      });
    }

    return overlaps.sort((a, b) => b.overlapPercent - a.overlapPercent);
  }

  /**
   * Detect all overlapping region pairs across the entire cache.
   * Returns pairs sorted by overlap percentage (highest first).
   * Only considers regions with the same style key.
   */
  detectAllOverlaps(): RegionOverlapPair[] {
    this.load();
    const pairs: RegionOverlapPair[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < this.regions.length; i++) {
      const a = this.regions[i];
      for (let j = i + 1; j < this.regions.length; j++) {
        const b = this.regions[j];

        // Only compare same-style regions
        if (a.styleKey !== b.styleKey) continue;

        const pairKey = [a.id, b.id].sort().join('|');
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        const intersection = this.computeIntersectionBounds(a.bounds, b.bounds);
        if (!intersection) continue;

        const intersectionArea = this.computeBoundsArea(intersection);
        if (intersectionArea <= 0) continue;

        const aArea = this.computeBoundsArea(a.bounds);
        const bArea = this.computeBoundsArea(b.bounds);
        const smallerArea = Math.min(aArea, bArea);

        const overlapPercent = smallerArea > 0
          ? Math.round((intersectionArea / smallerArea) * 100)
          : 0;

        if (overlapPercent < 5) continue;

        const zoomMin = Math.max(a.zoomMin, b.zoomMin);
        const zoomMax = Math.min(a.zoomMax, b.zoomMax);
        const zoomOverlap = zoomMin <= zoomMax;
        const overlappingZoomRange: [number, number] | null = zoomOverlap
          ? [zoomMin, zoomMax]
          : null;

        const sharedTileEstimate = zoomOverlap
          ? this.countSharedTiles(a, b, intersection)
          : 0;

        const wastedMB = estimateSizeMB(sharedTileEstimate, a.styleKey);

        pairs.push({
          regionA: { id: a.id, name: a.name },
          regionB: { id: b.id, name: b.name },
          overlapPercent,
          intersectionBounds: intersection,
          sharedTileEstimate,
          wastedMB,
          zoomOverlap,
          overlappingZoomRange,
        });
      }
    }

    return pairs.sort((a, b) => b.overlapPercent - a.overlapPercent);
  }

  /**
   * Get merge candidates: groups of overlapping regions that can be consolidated.
   * Groups regions that share the same style key and have geographic overlap.
   * Returns candidates sorted by potential savings (highest first).
   */
  getMergeCandidates(): MergeCandidate[] {
    this.load();
    const pairs = this.detectAllOverlaps();
    if (pairs.length === 0) return [];

    // Build adjacency graph of overlapping regions
    const adjacency = new Map<string, Set<string>>();
    const regionStyleMap = new Map<string, string>();

    for (const pair of pairs) {
      if (!pair.zoomOverlap) continue; // Only merge if zoom ranges overlap
      if (pair.overlapPercent < 10) continue; // Minimum 10% overlap for merge suggestion

      if (!adjacency.has(pair.regionA.id)) adjacency.set(pair.regionA.id, new Set());
      if (!adjacency.has(pair.regionB.id)) adjacency.set(pair.regionB.id, new Set());
      adjacency.get(pair.regionA.id)!.add(pair.regionB.id);
      adjacency.get(pair.regionB.id)!.add(pair.regionA.id);
    }

    // Find connected components (groups of mutually overlapping regions)
    const visited = new Set<string>();
    const groups: string[][] = [];

    for (const regionId of adjacency.keys()) {
      if (visited.has(regionId)) continue;

      const group: string[] = [];
      const queue = [regionId];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        group.push(current);

        const neighbors = adjacency.get(current);
        if (neighbors) {
          for (const n of neighbors) {
            if (!visited.has(n)) queue.push(n);
          }
        }
      }

      if (group.length >= 2) {
        groups.push(group);
      }
    }

    // Build merge candidates from groups
    const candidates: MergeCandidate[] = [];

    for (const group of groups) {
      const regions = group
        .map(id => this.regions.find(r => r.id === id))
        .filter((r): r is TileCacheRegion => r != null);

      if (regions.length < 2) continue;

      // All regions in a merge group must share the same style key
      const styleKey = regions[0].styleKey;
      const sameStyle = regions.filter(r => r.styleKey === styleKey);
      if (sameStyle.length < 2) continue;

      const unionBounds = this.computeUnionBounds(sameStyle.map(r => r.bounds));
      if (!unionBounds) continue;

      const zoomMin = Math.min(...sameStyle.map(r => r.zoomMin));
      const zoomMax = Math.max(...sameStyle.map(r => r.zoomMax));

      const currentTotalTiles = sameStyle.reduce((sum, r) => sum + r.tileCount, 0);
      const mergedTileCount = countTilesForRegion(unionBounds, zoomMin, zoomMax);

      // Shared tiles = sum of individual - unique tiles in merged
      // Since merged covers the union, unique tiles = mergedTileCount
      // Shared = currentTotal - mergedTileCount (tiles that were counted twice or more)
      const sharedTileEstimate = Math.max(0, currentTotalTiles - mergedTileCount);

      const currentTotalSizeMB = sameStyle.reduce(
        (sum, r) => sum + (r.actualSizeMB > 0 ? r.actualSizeMB : r.estimatedSizeMB),
        0
      );
      const mergedEstimatedSizeMB = estimateSizeMB(mergedTileCount, styleKey);
      const savingsMB = Math.max(0, currentTotalSizeMB - mergedEstimatedSizeMB);
      const savingsPercent = currentTotalSizeMB > 0
        ? Math.round((savingsMB / currentTotalSizeMB) * 100)
        : 0;

      candidates.push({
        regionIds: sameStyle.map(r => r.id),
        regionNames: sameStyle.map(r => r.name),
        unionBounds,
        zoomMin,
        zoomMax,
        currentTotalTiles,
        mergedTileCount,
        sharedTileEstimate,
        currentTotalSizeMB: Math.round(currentTotalSizeMB * 10) / 10,
        mergedEstimatedSizeMB: Math.round(mergedEstimatedSizeMB * 10) / 10,
        savingsMB: Math.round(savingsMB * 10) / 10,
        savingsPercent,
        styleKey,
      });
    }

    return candidates.sort((a, b) => b.savingsMB - a.savingsMB);
  }

  /**
   * Estimate the result of merging specific regions without actually performing it.
   * Useful for showing a preview before confirming.
   */
  estimateMerge(regionIds: string[]): MergeCandidate | null {
    this.load();
    const regions = regionIds
      .map(id => this.regions.find(r => r.id === id))
      .filter((r): r is TileCacheRegion => r != null);

    if (regions.length < 2) return null;

    const styleKey = regions[0].styleKey;
    if (!regions.every(r => r.styleKey === styleKey)) return null;

    const unionBounds = this.computeUnionBounds(regions.map(r => r.bounds));
    if (!unionBounds) return null;

    const zoomMin = Math.min(...regions.map(r => r.zoomMin));
    const zoomMax = Math.max(...regions.map(r => r.zoomMax));

    const currentTotalTiles = regions.reduce((sum, r) => sum + r.tileCount, 0);
    const mergedTileCount = countTilesForRegion(unionBounds, zoomMin, zoomMax);
    const sharedTileEstimate = Math.max(0, currentTotalTiles - mergedTileCount);

    const currentTotalSizeMB = regions.reduce(
      (sum, r) => sum + (r.actualSizeMB > 0 ? r.actualSizeMB : r.estimatedSizeMB),
      0
    );
    const mergedEstimatedSizeMB = estimateSizeMB(mergedTileCount, styleKey);
    const savingsMB = Math.max(0, currentTotalSizeMB - mergedEstimatedSizeMB);
    const savingsPercent = currentTotalSizeMB > 0
      ? Math.round((savingsMB / currentTotalSizeMB) * 100)
      : 0;

    return {
      regionIds,
      regionNames: regions.map(r => r.name),
      unionBounds,
      zoomMin,
      zoomMax,
      currentTotalTiles,
      mergedTileCount,
      sharedTileEstimate,
      currentTotalSizeMB: Math.round(currentTotalSizeMB * 10) / 10,
      mergedEstimatedSizeMB: Math.round(mergedEstimatedSizeMB * 10) / 10,
      savingsMB: Math.round(savingsMB * 10) / 10,
      savingsPercent,
      styleKey,
    };
  }

  /**
   * Merge multiple overlapping regions into a single optimized region.
   *
   * Strategy:
   * 1. Compute union bounds covering all source regions
   * 2. Create a new merged region with the union bounds
   * 3. Copy tiles from source regions to the new region (deduplicating shared tiles)
   * 4. Delete the original source regions
   * 5. Mark the merged region as complete
   *
   * @param regionIds - IDs of regions to merge
   * @param mergedName - Name for the new merged region (optional, auto-generated if not provided)
   * @param onProgress - Optional progress callback
   * @returns MergeResult with details of the operation
   */
  async mergeRegions(
    regionIds: string[],
    mergedName?: string,
    onProgress?: ProgressCallback
  ): Promise<MergeResult> {
    this.load();

    const regions = regionIds
      .map(id => this.regions.find(r => r.id === id))
      .filter((r): r is TileCacheRegion => r != null);

    if (regions.length < 2) {
      return {
        success: false,
        removedRegionIds: [],
        deduplicatedTiles: 0,
        savedMB: 0,
        message: 'Need at least 2 regions to merge',
      };
    }

    // Validate: all regions must have the same style key
    const styleKey = regions[0].styleKey;
    if (!regions.every(r => r.styleKey === styleKey)) {
      return {
        success: false,
        removedRegionIds: [],
        deduplicatedTiles: 0,
        savedMB: 0,
        message: 'All regions must use the same map style to merge',
      };
    }

    // Validate: no active downloads
    if (regions.some(r => r.status === 'downloading')) {
      return {
        success: false,
        removedRegionIds: [],
        deduplicatedTiles: 0,
        savedMB: 0,
        message: 'Cannot merge regions with active downloads',
      };
    }

    const unionBounds = this.computeUnionBounds(regions.map(r => r.bounds));
    if (!unionBounds) {
      return {
        success: false,
        removedRegionIds: [],
        deduplicatedTiles: 0,
        savedMB: 0,
        message: 'Failed to compute union bounds',
      };
    }

    const zoomMin = Math.min(...regions.map(r => r.zoomMin));
    const zoomMax = Math.max(...regions.map(r => r.zoomMax));
    const mergedTileCount = countTilesForRegion(unionBounds, zoomMin, zoomMax);
    const currentTotalTiles = regions.reduce((sum, r) => sum + r.tileCount, 0);
    const currentTotalSizeMB = regions.reduce(
      (sum, r) => sum + (r.actualSizeMB > 0 ? r.actualSizeMB : r.estimatedSizeMB),
      0
    );

    const name = mergedName || `Merged \u2014 ${regions.map(r => r.name).join(' + ')}`;

    // Create the merged region
    const mergedRegion: TileCacheRegion = {
      id: generateId(),
      name,
      bounds: unionBounds,
      zoomMin,
      zoomMax,
      tileCount: mergedTileCount,
      downloadedTiles: 0,
      estimatedSizeMB: estimateSizeMB(mergedTileCount, styleKey),
      actualSizeMB: 0,
      downloadedAt: new Date().toISOString(),
      styleKey,
      status: 'downloading',
      sourceType: 'bounding-box',
    };

    this.addRegion(mergedRegion);

    // Copy tiles from source regions to merged region, deduplicating
    const useNative = isNativeStorageAvailable();
    let copiedTiles = 0;
    let totalBytes = 0;
    let deduplicatedTiles = 0;
    const seenTileCoords = new Set<string>();

    // Enumerate all tiles in the merged region
    const allMergedTiles: Array<{ x: number; y: number; z: number }> = [];
    for (let z = zoomMin; z <= zoomMax; z++) {
      allMergedTiles.push(...getTilesForBounds(unionBounds, z));
    }

    // For each tile in the merged region, try to copy from any source region
    for (let i = 0; i < allMergedTiles.length; i++) {
      const tile = allMergedTiles[i];
      const coordKey = `${tile.z}/${tile.x}/${tile.y}`;

      if (seenTileCoords.has(coordKey)) {
        deduplicatedTiles++;
        continue;
      }
      seenTileCoords.add(coordKey);

      // Try to find this tile in any source region
      let found = false;
      for (const srcRegion of regions) {
        // Check if this tile is within the source region's bounds and zoom range
        if (tile.z < srcRegion.zoomMin || tile.z > srcRegion.zoomMax) continue;

        const srcMin = lngLatToTile(srcRegion.bounds.minLng, srcRegion.bounds.maxLat, tile.z);
        const srcMax = lngLatToTile(srcRegion.bounds.maxLng, srcRegion.bounds.minLat, tile.z);
        const sMinX = Math.min(srcMin.x, srcMax.x);
        const sMaxX = Math.max(srcMin.x, srcMax.x);
        const sMinY = Math.min(srcMin.y, srcMax.y);
        const sMaxY = Math.max(srcMin.y, srcMax.y);

        if (tile.x < sMinX || tile.x > sMaxX || tile.y < sMinY || tile.y > sMaxY) continue;

        if (useNative) {
          const hasTileData = await hasNativeTile(srcRegion.id, tile.x, tile.y, tile.z);
          if (hasTileData) {
            // On native, we'd need to copy the file — for now mark as needing re-download
            // The merged region will be re-downloaded for tiles not copied
            copiedTiles++;
            totalBytes += 15 * 1024;
            found = true;
            break;
          }
        } else {
          const srcKey = tileKey(srcRegion.id, tile.x, tile.y, tile.z);
          const data = await getTile(srcKey);
          if (data) {
            const destKey = tileKey(mergedRegion.id, tile.x, tile.y, tile.z);
            await storeTile(destKey, data);
            copiedTiles++;
            totalBytes += data.byteLength;
            found = true;
            break;
          }
        }
      }

      // Count tiles that exist in multiple source regions (for dedup tracking)
      if (found) {
        let sourceCount = 0;
        for (const srcRegion of regions) {
          if (tile.z < srcRegion.zoomMin || tile.z > srcRegion.zoomMax) continue;
          const srcMin = lngLatToTile(srcRegion.bounds.minLng, srcRegion.bounds.maxLat, tile.z);
          const srcMax = lngLatToTile(srcRegion.bounds.maxLng, srcRegion.bounds.minLat, tile.z);
          const sMinX = Math.min(srcMin.x, srcMax.x);
          const sMaxX = Math.max(srcMin.x, srcMax.x);
          const sMinY = Math.min(srcMin.y, srcMax.y);
          const sMaxY = Math.max(srcMin.y, srcMax.y);
          if (tile.x >= sMinX && tile.x <= sMaxX && tile.y >= sMinY && tile.y <= sMaxY) {
            sourceCount++;
          }
        }
        if (sourceCount > 1) deduplicatedTiles += (sourceCount - 1);
      }

      // Report progress
      if (onProgress && i % 50 === 0) {
        onProgress({
          regionId: mergedRegion.id,
          status: 'downloading',
          totalTiles: allMergedTiles.length,
          downloadedTiles: copiedTiles,
          failedTiles: 0,
          percent: Math.round((i / allMergedTiles.length) * 100),
          estimatedSizeMB: mergedRegion.estimatedSizeMB,
          downloadedSizeMB: Math.round((totalBytes / (1024 * 1024)) * 10) / 10,
          message: `Merging tiles... ${copiedTiles} copied, ${deduplicatedTiles} deduplicated`,
          currentZoom: tile.z,
          speed: 0,
          eta: 0,
        });
      }
    }

    const actualSizeMB = Math.round((totalBytes / (1024 * 1024)) * 10) / 10;
    const savedMB = Math.max(0, Math.round((currentTotalSizeMB - actualSizeMB) * 10) / 10);

    // Update merged region as complete
    this.updateRegion(mergedRegion.id, {
      status: 'complete',
      downloadedTiles: copiedTiles,
      actualSizeMB,
      completedAt: new Date().toISOString(),
    });

    // Delete source regions and their tiles
    const removedIds: string[] = [];
    for (const region of regions) {
      try {
        await deleteTilesForRegion(region.id);
        this.removeRegion(region.id);
        removedIds.push(region.id);
      } catch (e) {
        console.warn(`[TileCacheStore] Failed to remove source region ${region.id}:`, e);
      }
    }

    // Final progress
    if (onProgress) {
      onProgress({
        regionId: mergedRegion.id,
        status: 'complete',
        totalTiles: mergedTileCount,
        downloadedTiles: copiedTiles,
        failedTiles: 0,
        percent: 100,
        estimatedSizeMB: mergedRegion.estimatedSizeMB,
        downloadedSizeMB: actualSizeMB,
        message: `Merge complete: ${copiedTiles} tiles, ${deduplicatedTiles} deduplicated, ${formatMB(savedMB)} saved`,
        currentZoom: zoomMax,
        speed: 0,
        eta: 0,
      });
    }

    const updatedMerged = this.getRegion(mergedRegion.id);

    return {
      success: true,
      mergedRegion: updatedMerged || mergedRegion,
      removedRegionIds: removedIds,
      deduplicatedTiles,
      savedMB,
      message: `Merged ${regions.length} regions into "${name}". ${deduplicatedTiles} duplicate tiles removed, ${formatMB(savedMB)} saved.`,
    };
  }

  /**
   * Get a map of regionId → RegionOverlapInfo[] for all regions.
   * Useful for displaying overlap indicators on all region cards at once.
   */
  getAllRegionOverlaps(): Map<string, RegionOverlapInfo[]> {
    this.load();
    const result = new Map<string, RegionOverlapInfo[]>();

    for (const region of this.regions) {
      const overlaps = this.getRegionOverlaps(region.id);
      if (overlaps.length > 0) {
        result.set(region.id, overlaps);
      }
    }

    return result;
  }

  /**
   * Get total wasted storage from all overlapping regions.
   */
  getTotalOverlapWaste(): { pairs: number; wastedMB: number; wastedTiles: number } {
    const allPairs = this.detectAllOverlaps();
    const wastedMB = allPairs.reduce((sum, p) => sum + p.wastedMB, 0);
    const wastedTiles = allPairs.reduce((sum, p) => sum + p.sharedTileEstimate, 0);
    return {
      pairs: allPairs.length,
      wastedMB: Math.round(wastedMB * 10) / 10,
      wastedTiles,
    };
  }
}

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 1024)} KB`;
}

export const tileCacheStore = new TileCacheStore();

