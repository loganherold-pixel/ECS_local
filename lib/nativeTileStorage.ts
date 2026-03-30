/**
 * Native Tile Storage — expo-file-system adapter for offline map tiles
 *
 * Provides persistent tile storage on native iOS/Android devices using
 * expo-file-system (via fsCompat layer for SDK 54+ safety).
 * Falls back gracefully on web (where IndexedDB is used).
 *
 * Architecture:
 *   - Tiles stored as individual files: {documentDirectory}/ecs-tiles/{regionId}/{z}/{x}/{y}.pbf
 *   - Metadata index stored as JSON: {documentDirectory}/ecs-tiles/_meta.json
 *   - Region manifest stored per region: {documentDirectory}/ecs-tiles/{regionId}/_manifest.json
 *   - Supports concurrent downloads with configurable batch size
 *   - Tracks per-tile byte sizes for accurate storage reporting
 *
 * Integration:
 *   - Used by tileCacheStore.ts on native platforms (Platform.OS !== 'web')
 *   - Web platforms continue using IndexedDB via the existing IDB adapter
 */
import { Platform } from 'react-native';
import {
  getDocumentDirectory,
  fsGetInfo,
  fsEnsureDir,
  fsMakeDir,
  fsDelete,
  fsWriteString,
  fsReadString,
  fsDownload,
  fsReadDir,
  fsGetDiskStorage,
} from './fsCompat';

// ── Types ───────────────────────────────────────────────

export interface NativeTileMeta {
  key: string;        // regionId/z/x/y
  regionId: string;
  z: number;
  x: number;
  y: number;
  sizeBytes: number;
  cachedAt: string;   // ISO timestamp
}

export interface RegionManifest {
  regionId: string;
  tileCount: number;
  totalSizeBytes: number;
  createdAt: string;
  lastAccessedAt: string;
  tiles: Record<string, { sizeBytes: number; cachedAt: string }>;
}

export interface NativeStorageStats {
  totalRegions: number;
  totalTiles: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  regions: Array<{
    regionId: string;
    tileCount: number;
    sizeMB: number;
    createdAt: string;
    lastAccessedAt: string;
  }>;
}

// ── File System Helpers ─────────────────────────────────

function getTileDir(): string {
  // Will be resolved at runtime with actual documentDirectory
  return 'ecs-tiles';
}

async function getBaseDir(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const docDir = await getDocumentDirectory();
  if (!docDir) return null;
  return `${docDir}${getTileDir()}`;
}

async function ensureDir(dirPath: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await fsEnsureDir(dirPath);
  } catch (e) {
    console.warn('[NativeTileStorage] ensureDir failed:', e);
    return false;
  }
}

// ── Manifest Management ─────────────────────────────────

async function getManifestPath(regionId: string): Promise<string | null> {
  const base = await getBaseDir();
  if (!base) return null;
  return `${base}/${regionId}/_manifest.json`;
}

async function loadManifest(regionId: string): Promise<RegionManifest | null> {
  if (Platform.OS === 'web') return null;
  const path = await getManifestPath(regionId);
  if (!path) return null;

  try {
    const info = await fsGetInfo(path);
    if (!info.exists) return null;

    const raw = await fsReadString(path);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}


async function saveManifest(manifest: RegionManifest): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const path = await getManifestPath(manifest.regionId);
  if (!path) return false;

  try {
    const dir = path.replace('/_manifest.json', '');
    await ensureDir(dir);
    await fsWriteString(path, JSON.stringify(manifest));
    return true;
  } catch (e) {
    console.warn('[NativeTileStorage] saveManifest failed:', e);
    return false;
  }
}

// ── Tile Storage Operations ─────────────────────────────

/**
 * Store a tile as a file on the native filesystem.
 * Returns the size in bytes, or -1 on failure.
 */
export async function storeNativeTile(
  regionId: string,
  x: number,
  y: number,
  z: number,
  data: string, // base64-encoded tile data
): Promise<number> {
  if (Platform.OS === 'web') return -1;

  const base = await getBaseDir();
  if (!base) return -1;

  const tilePath = `${base}/${regionId}/${z}/${x}`;
  const filePath = `${tilePath}/${y}.tile`;

  try {
    await ensureDir(tilePath);
    await fsWriteString(filePath, data, 'base64');

    const info = await fsGetInfo(filePath);
    const sizeBytes = info.exists && info.size ? info.size : data.length * 0.75; // estimate from base64

    // Update manifest
    const manifest = await loadManifest(regionId) || {
      regionId,
      tileCount: 0,
      totalSizeBytes: 0,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      tiles: {},
    };

    const key = `${z}/${x}/${y}`;
    const oldSize = manifest.tiles[key]?.sizeBytes || 0;
    manifest.tiles[key] = {
      sizeBytes: sizeBytes as number,
      cachedAt: new Date().toISOString(),
    };
    manifest.tileCount = Object.keys(manifest.tiles).length;
    manifest.totalSizeBytes = manifest.totalSizeBytes - oldSize + (sizeBytes as number);
    manifest.lastAccessedAt = new Date().toISOString();

    await saveManifest(manifest);
    return sizeBytes as number;
  } catch (e) {
    console.warn('[NativeTileStorage] storeNativeTile failed:', e);
    return -1;
  }
}

/**
 * Retrieve a cached tile from the native filesystem.
 * Returns base64-encoded data, or null if not found.
 */
export async function getNativeTile(
  regionId: string,
  x: number,
  y: number,
  z: number,
): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const base = await getBaseDir();
  if (!base) return null;

  const filePath = `${base}/${regionId}/${z}/${x}/${y}.tile`;

  try {
    const info = await fsGetInfo(filePath);
    if (!info.exists) return null;

    return await fsReadString(filePath, 'base64');
  } catch {
    return null;
  }
}


/**
 * Check if a tile exists in the native cache.
 */
export async function hasNativeTile(
  regionId: string,
  x: number,
  y: number,
  z: number,
): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const base = await getBaseDir();
  if (!base) return false;

  const filePath = `${base}/${regionId}/${z}/${x}/${y}.tile`;
  try {
    const info = await fsGetInfo(filePath);
    return info.exists;
  } catch {
    return false;
  }
}

/**
 * Delete all tiles for a region from the native filesystem.
 * Returns the number of tiles deleted.
 */
export async function deleteNativeRegion(regionId: string): Promise<number> {
  if (Platform.OS === 'web') return 0;

  const base = await getBaseDir();
  if (!base) return 0;

  const regionDir = `${base}/${regionId}`;

  try {
    const manifest = await loadManifest(regionId);
    const tileCount = manifest?.tileCount || 0;

    const info = await fsGetInfo(regionDir);
    if (info.exists) {
      await fsDelete(regionDir, { idempotent: true });
    }
    return tileCount;
  } catch (e) {
    console.warn('[NativeTileStorage] deleteNativeRegion failed:', e);
    return 0;
  }
}

/**
 * Clear all cached tiles from the native filesystem.
 */
export async function clearAllNativeTiles(): Promise<void> {
  if (Platform.OS === 'web') return;

  const base = await getBaseDir();
  if (!base) return;

  try {
    const info = await fsGetInfo(base);
    if (info.exists) {
      await fsDelete(base, { idempotent: true });
    }
  } catch (e) {
    console.warn('[NativeTileStorage] clearAllNativeTiles failed:', e);
  }
}

/**
 * Get storage statistics for all cached regions.
 */
export async function getNativeStorageStats(): Promise<NativeStorageStats> {
  const emptyStats: NativeStorageStats = {
    totalRegions: 0,
    totalTiles: 0,
    totalSizeBytes: 0,
    totalSizeMB: 0,
    regions: [],
  };

  if (Platform.OS === 'web') return emptyStats;

  const base = await getBaseDir();
  if (!base) return emptyStats;

  try {
    const info = await fsGetInfo(base);
    if (!info.exists) return emptyStats;

    const contents = await fsReadDir(base);
    const regionDirs = contents.filter((name: string) => !name.startsWith('_'));

    let totalTiles = 0;
    let totalSizeBytes = 0;
    const regions: NativeStorageStats['regions'] = [];

    for (const regionId of regionDirs) {
      const manifest = await loadManifest(regionId);
      if (manifest) {
        totalTiles += manifest.tileCount;
        totalSizeBytes += manifest.totalSizeBytes;
        regions.push({
          regionId,
          tileCount: manifest.tileCount,
          sizeMB: Math.round((manifest.totalSizeBytes / (1024 * 1024)) * 10) / 10,
          createdAt: manifest.createdAt,
          lastAccessedAt: manifest.lastAccessedAt,
        });
      }
    }

    return {
      totalRegions: regions.length,
      totalTiles,
      totalSizeBytes,
      totalSizeMB: Math.round((totalSizeBytes / (1024 * 1024)) * 10) / 10,
      regions,
    };
  } catch (e) {
    console.warn('[NativeTileStorage] getNativeStorageStats failed:', e);
    return emptyStats;
  }
}

/**
 * Get the manifest for a specific region (for freshness/size info).
 */
export async function getRegionManifest(regionId: string): Promise<RegionManifest | null> {
  return loadManifest(regionId);
}

/**
 * Get device free space estimate (native only).
 */
export async function getDeviceStorageInfo(): Promise<{
  freeMB: number;
  totalMB: number;
} | null> {
  if (Platform.OS === 'web') return null;

  try {
    const diskInfo = await fsGetDiskStorage();
    if (!diskInfo) return null;
    return {
      freeMB: Math.round(diskInfo.freeBytes / (1024 * 1024)),
      totalMB: Math.round(diskInfo.totalBytes / (1024 * 1024)),
    };
  } catch {
    return null;
  }
}

/**
 * Download a single tile from a URL and store it natively.
 * Returns size in bytes on success, -1 on failure.
 */
export async function downloadAndStoreNativeTile(
  regionId: string,
  x: number,
  y: number,
  z: number,
  url: string,
): Promise<number> {
  if (Platform.OS === 'web') return -1;

  const base = await getBaseDir();
  if (!base) return -1;

  const tilePath = `${base}/${regionId}/${z}/${x}`;
  const filePath = `${tilePath}/${y}.tile`;

  try {
    // Check if already cached
    const existing = await fsGetInfo(filePath);
    if (existing.exists) {
      return existing.size || 0;
    }

    await ensureDir(tilePath);

    // Download directly to file
    const downloadResult = await fsDownload(url, filePath);

    if (downloadResult.status !== 200) {
      // Clean up failed download
      try { await fsDelete(filePath, { idempotent: true }); } catch {}
      return -1;
    }

    const info = await fsGetInfo(filePath);
    const sizeBytes = info.exists && info.size ? info.size : 0;

    // Update manifest
    const manifest = await loadManifest(regionId) || {
      regionId,
      tileCount: 0,
      totalSizeBytes: 0,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      tiles: {},
    };

    const key = `${z}/${x}/${y}`;
    const oldSize = manifest.tiles[key]?.sizeBytes || 0;
    manifest.tiles[key] = {
      sizeBytes,
      cachedAt: new Date().toISOString(),
    };
    manifest.tileCount = Object.keys(manifest.tiles).length;
    manifest.totalSizeBytes = manifest.totalSizeBytes - oldSize + sizeBytes;
    manifest.lastAccessedAt = new Date().toISOString();

    await saveManifest(manifest);
    return sizeBytes;
  } catch (e) {
    console.warn('[NativeTileStorage] downloadAndStoreNativeTile failed:', e);
    return -1;
  }
}

/**
 * Check if the native tile storage system is available.
 */
export function isNativeStorageAvailable(): boolean {
  return Platform.OS !== 'web';
}

