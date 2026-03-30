/**
 * Blueprint Image Cache — Offline-first image caching for vehicle blueprints
 * ──────────────────────────────────────────────────────────────────────────
 * Downloads vehicle blueprint PNGs on first load and stores them locally
 * using expo-file-system (via fsCompat layer for SDK 54+ safety).
 * On subsequent renders, serves the cached local file instead of hitting
 * the network.
 *
 * Architecture:
 *   - Cache directory: {documentDirectory}ecs-blueprint-cache/
 *   - File naming: SHA-like hash of the URL → deterministic file name
 *   - Platform: Native (iOS/Android) uses expo-file-system (via fsCompat)
 *              Web falls back to network URL (no caching)
 *
 * Exports:
 *   - useCachedBlueprintImage(url) — React hook returning { uri, status }
 *   - getBlueprintCacheStatus(url) — Async check if a URL is cached
 *   - clearBlueprintCache()       — Purge all cached blueprints
 *   - getBlueprintCacheInfo()     — Get cache size and file count
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import {
  getDocumentDirectory,
  fsGetInfo,
  fsEnsureDir,
  fsDelete,
  fsDownload,
  fsReadDir,
} from './fsCompat';

/* ── Types ─────────────────────────────────────────────── */

export type CacheStatus =
  | 'checking'     // Checking if file exists locally
  | 'downloading'  // Downloading from network
  | 'cached'       // Served from local cache
  | 'network'      // Served from network (cache miss or web platform)
  | 'error';       // Download or cache write failed

export interface CachedImageResult {
  /** The URI to use for the Image source — either local file or network URL */
  uri: string;
  /** Current cache status */
  status: CacheStatus;
  /** Error message if status is 'error' */
  error: string | null;
  /** Whether the image is being served from local cache */
  isCached: boolean;
  /** Force re-download from network */
  refresh: () => void;
}

export interface BlueprintCacheInfo {
  /** Number of cached blueprint files */
  fileCount: number;
  /** Total cache size in bytes */
  totalBytes: number;
  /** Human-readable cache size */
  totalSizeDisplay: string;
  /** Whether caching is available on this platform */
  available: boolean;
}

/* ── Constants ─────────────────────────────────────────── */

const CACHE_DIR_NAME = 'ecs-blueprint-cache';
const CACHE_VERSION = 'v1';

/* ── Helpers ───────────────────────────────────────────── */

/**
 * Simple hash function for URL → filename mapping.
 * Produces a deterministic alphanumeric string from any URL.
 */
function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to positive hex string
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  // Extract file extension from URL
  const extMatch = url.match(/\.(png|jpg|jpeg|webp|gif)(\?|$)/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
  return `${CACHE_VERSION}_${hex}.${ext}`;
}

/**
 * Check if native file system is available.
 */
function isNativeAvailable(): boolean {
  return Platform.OS !== 'web';
}

/**
 * Get the full cache directory path.
 */
async function getCacheDir(): Promise<string | null> {
  if (!isNativeAvailable()) return null;
  const docDir = await getDocumentDirectory();
  if (!docDir) return null;
  return `${docDir}${CACHE_DIR_NAME}/`;
}

/**
 * Ensure the cache directory exists.
 */
async function ensureCacheDir(): Promise<string | null> {
  const dir = await getCacheDir();
  if (!dir) return null;

  try {
    await fsEnsureDir(dir);
    return dir;
  } catch (err) {
    console.warn('[BlueprintCache] Failed to create cache dir:', err);
    return null;
  }
}

/**
 * Get the local file path for a given URL.
 */
async function getLocalPath(url: string): Promise<string | null> {
  const dir = await getCacheDir();
  if (!dir) return null;
  return `${dir}${hashUrl(url)}`;
}

/* ── In-memory status cache (avoids redundant FS checks) ── */
const _memoryCache = new Map<string, string>(); // url → local file URI
const _downloadingSet = new Set<string>(); // URLs currently being downloaded

/* ── Core Functions ────────────────────────────────────── */

/**
 * Check if a blueprint image is cached locally.
 * Returns the local URI if cached, null otherwise.
 */
export async function getBlueprintCacheStatus(url: string): Promise<{
  isCached: boolean;
  localUri: string | null;
}> {
  // Check memory cache first
  const memCached = _memoryCache.get(url);
  if (memCached) {
    return { isCached: true, localUri: memCached };
  }

  if (!isNativeAvailable()) return { isCached: false, localUri: null };

  const localPath = await getLocalPath(url);
  if (!localPath) return { isCached: false, localUri: null };

  try {
    const info = await fsGetInfo(localPath);
    if (info.exists && !info.isDirectory) {
      // Verify file has content (not a zero-byte failed download)
      if (info.size > 100) {
        _memoryCache.set(url, localPath);
        return { isCached: true, localUri: localPath };
      }
    }
  } catch {
    // File check failed — treat as not cached
  }

  return { isCached: false, localUri: null };
}

/**
 * Download a blueprint image and cache it locally.
 * Returns the local URI on success, null on failure.
 */
async function downloadAndCache(url: string): Promise<string | null> {
  // Prevent duplicate concurrent downloads
  if (_downloadingSet.has(url)) {
    // Wait for existing download to complete
    return new Promise((resolve) => {
      const check = setInterval(async () => {
        if (!_downloadingSet.has(url)) {
          clearInterval(check);
          const cached = _memoryCache.get(url);
          resolve(cached || null);
        }
      }, 200);
      // Timeout after 30s
      setTimeout(() => {
        clearInterval(check);
        resolve(null);
      }, 30000);
    });
  }

  if (!isNativeAvailable()) return null;

  const dir = await ensureCacheDir();
  if (!dir) return null;

  const localPath = await getLocalPath(url);
  if (!localPath) return null;

  _downloadingSet.add(url);

  try {
    const downloadResult = await fsDownload(url, localPath);

    if (downloadResult && downloadResult.status === 200) {
      // Verify the downloaded file
      const info = await fsGetInfo(localPath);
      if (info.exists) {
        if (info.size > 100) {
          _memoryCache.set(url, localPath);
          _downloadingSet.delete(url);
          console.log(`[BlueprintCache] Cached: ${hashUrl(url)} (${formatBytes(info.size)})`);
          return localPath;
        }
      }
      // File is too small — likely corrupt
      try { await fsDelete(localPath, { idempotent: true }); } catch {}
    }
  } catch (err) {
    console.warn('[BlueprintCache] Download failed:', err);
    // Clean up partial file
    try {
      if (localPath) {
        await fsDelete(localPath, { idempotent: true });
      }
    } catch {}
  }

  _downloadingSet.delete(url);
  return null;
}

/**
 * Clear all cached blueprint images.
 */
export async function clearBlueprintCache(): Promise<void> {
  if (!isNativeAvailable()) return;

  const dir = await getCacheDir();
  if (!dir) return;

  try {
    await fsDelete(dir, { idempotent: true });
    _memoryCache.clear();
    console.log('[BlueprintCache] Cache cleared');
  } catch (err) {
    console.warn('[BlueprintCache] Failed to clear cache:', err);
  }
}

/**
 * Get information about the blueprint cache.
 */
export async function getBlueprintCacheInfo(): Promise<BlueprintCacheInfo> {
  const notAvailable: BlueprintCacheInfo = {
    fileCount: 0,
    totalBytes: 0,
    totalSizeDisplay: '0 B',
    available: false,
  };

  if (Platform.OS === 'web') return notAvailable;

  const dir = await getCacheDir();
  if (!dir) return notAvailable;

  try {
    const dirInfo = await fsGetInfo(dir);
    if (!dirInfo.exists) {
      return { ...notAvailable, available: true };
    }

    const files = await fsReadDir(dir);
    let totalBytes = 0;

    for (const file of files) {
      try {
        const fileInfo = await fsGetInfo(`${dir}${file}`);
        if (fileInfo.exists && !fileInfo.isDirectory) {
          totalBytes += fileInfo.size;
        }
      } catch {}
    }

    return {
      fileCount: files.length,
      totalBytes,
      totalSizeDisplay: formatBytes(totalBytes),
      available: true,
    };
  } catch {
    return { ...notAvailable, available: true };
  }
}

/* ── Format helpers ────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/* ═══════════════════════════════════════════════════════════
   React Hook — useCachedBlueprintImage
   ═══════════════════════════════════════════════════════════ */

/**
 * React hook that returns a cached local URI for a vehicle blueprint image.
 * On first call, checks for a local cached version. If not found, downloads
 * the image and caches it. Returns the network URL as fallback during download.
 *
 * @param networkUrl — The remote CDN URL for the blueprint image
 * @returns CachedImageResult with uri, status, and cache info
 */
export function useCachedBlueprintImage(networkUrl: string): CachedImageResult {
  const [uri, setUri] = useState<string>(networkUrl);
  const [status, setStatus] = useState<CacheStatus>('checking');
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const mountedRef = useRef(true);
  const urlRef = useRef(networkUrl);

  // Track URL changes
  urlRef.current = networkUrl;

  const loadImage = useCallback(async (forceRefresh = false) => {
    const url = urlRef.current;

    // Web platform — no caching, use network directly
    if (Platform.OS === 'web') {
      setUri(url);
      setStatus('network');
      setIsCached(false);
      setError(null);
      return;
    }

    setStatus('checking');
    setError(null);

    // Check local cache (unless force refresh)
    if (!forceRefresh) {
      const cached = await getBlueprintCacheStatus(url);
      if (cached.isCached && cached.localUri && mountedRef.current) {
        setUri(cached.localUri);
        setStatus('cached');
        setIsCached(true);
        return;
      }
    }

    // Not cached — show network URL immediately while downloading
    if (mountedRef.current) {
      setUri(url);
      setStatus('downloading');
      setIsCached(false);
    }

    // Download and cache in background
    const localUri = await downloadAndCache(url);

    if (!mountedRef.current) return;

    if (localUri) {
      setUri(localUri);
      setStatus('cached');
      setIsCached(true);
    } else {
      // Download failed — continue using network URL
      setUri(url);
      setStatus('network');
      setIsCached(false);
    }
  }, []);

  const refresh = useCallback(() => {
    // Clear memory cache for this URL
    _memoryCache.delete(urlRef.current);
    loadImage(true);
  }, [loadImage]);

  useEffect(() => {
    mountedRef.current = true;
    loadImage();
    return () => {
      mountedRef.current = false;
    };
  }, [networkUrl, loadImage]);

  return { uri, status, error, isCached, refresh };
}

