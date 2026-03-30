/**
 * Tile Serving Bridge — Native → WebView tile delivery
 *
 * When the MapRenderer WebView can't load a tile from the network or its
 * internal Cache API, it sends a `requestTile` message to React Native.
 * This bridge searches all cached regions in expo-file-system for the
 * requested tile and returns the base64-encoded data.
 *
 * Architecture:
 *   - WebView fetch interceptor → fails → postMessage('requestTile', {z,x,y,url})
 *   - React Native receives message → tileServingBridge.serveTile(z,x,y)
 *   - Bridge searches nativeTileStorage across all regions
 *   - Returns base64 data or null
 *   - React Native sends response back to WebView
 *   - WebView creates Response from base64, stores in Cache API, resolves fetch
 *
 * Also tracks tile source statistics for the UI indicator.
 */
import { Platform } from 'react-native';
import { tileCacheStore } from './tileCacheStore';
import { getNativeTile, isNativeStorageAvailable } from './nativeTileStorage';

// ── Types ───────────────────────────────────────────────

export type TileSource = 'cache' | 'network' | 'native' | 'none';

export interface TileSourceStats {
  cacheHits: number;
  networkHits: number;
  nativeHits: number;
  misses: number;
  total: number;
  /** Dominant source for the current session */
  dominantSource: TileSource;
  /** Whether we're serving primarily from offline storage */
  isOfflineServing: boolean;
}

// ── Tile URL Parsing ────────────────────────────────────

/**
 * Extract z/x/y from a Mapbox tile URL.
 * Handles patterns like:
 *   - api.mapbox.com/v4/{tileset}/{z}/{x}/{y}.vector.pbf
 *   - api.mapbox.com/styles/v1/{owner}/{style}/tiles/{z}/{x}/{y}
 *   - tile.openstreetmap.org/{z}/{x}/{y}.png
 *   - tile.opentopomap.org/{z}/{x}/{y}.png
 */
export function parseTileCoords(url: string): { z: number; x: number; y: number } | null {
  try {
    // Pattern 1: /v4/{tileset}/{z}/{x}/{y}.vector.pbf
    let match = url.match(/\/v4\/[^/]+\/(\d+)\/(\d+)\/(\d+)/);
    if (match) {
      return { z: parseInt(match[1]), x: parseInt(match[2]), y: parseInt(match[3]) };
    }

    // Pattern 2: /tiles/{z}/{x}/{y}
    match = url.match(/\/tiles\/(\d+)\/(\d+)\/(\d+)/);
    if (match) {
      return { z: parseInt(match[1]), x: parseInt(match[2]), y: parseInt(match[3]) };
    }

    // Pattern 3: generic /{z}/{x}/{y}.ext (OSM, OpenTopo, etc.)
    match = url.match(/\/(\d+)\/(\d+)\/(\d+)\.\w+/);
    if (match) {
      const z = parseInt(match[1]);
      const x = parseInt(match[2]);
      const y = parseInt(match[3]);
      // Sanity check: z should be 0-22, x/y should be within range
      if (z >= 0 && z <= 22) {
        return { z, x, y };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ── Native Tile Lookup ──────────────────────────────────

/**
 * Search all cached regions for a tile at the given z/x/y coordinates.
 * Returns base64-encoded tile data if found, null otherwise.
 */
export async function findCachedTile(
  z: number,
  x: number,
  y: number
): Promise<string | null> {
  if (!isNativeStorageAvailable()) return null;

  try {
    const regions = tileCacheStore.getRegions();
    
    // Search regions that are complete or partial (have some tiles)
    const candidateRegions = regions.filter(
      r => r.status === 'complete' || r.status === 'partial' || r.downloadedTiles > 0
    );

    for (const region of candidateRegions) {
      // Quick bounds check: is this z/x/y within the region's bounds?
      if (z >= region.zoomMin && z <= region.zoomMax) {
        // Check if the tile coordinates fall within the region's geographic bounds
        if (isTileInBounds(z, x, y, region.bounds)) {
          const data = await getNativeTile(region.id, x, y, z);
          if (data) {
            return data;
          }
        }
      }
    }

    return null;
  } catch (e) {
    console.warn('[TileServingBridge] findCachedTile error:', e);
    return null;
  }
}

/**
 * Check if a tile at z/x/y falls within geographic bounds.
 */
function isTileInBounds(
  z: number,
  x: number,
  y: number,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
): boolean {
  const n = Math.pow(2, z);

  // Convert tile x to longitude range
  const tileLngMin = (x / n) * 360 - 180;
  const tileLngMax = ((x + 1) / n) * 360 - 180;

  // Convert tile y to latitude range
  const tileLatMax = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * (180 / Math.PI);
  const tileLatMin = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * (180 / Math.PI);

  // Check overlap
  return (
    tileLngMax >= bounds.minLng &&
    tileLngMin <= bounds.maxLng &&
    tileLatMax >= bounds.minLat &&
    tileLatMin <= bounds.maxLat
  );
}

// ── Tile Source Stats Tracker ───────────────────────────

class TileSourceTracker {
  private stats: TileSourceStats = {
    cacheHits: 0,
    networkHits: 0,
    nativeHits: 0,
    misses: 0,
    total: 0,
    dominantSource: 'none',
    isOfflineServing: false,
  };

  private listeners: Array<(stats: TileSourceStats) => void> = [];

  recordHit(source: TileSource): void {
    this.stats.total++;
    switch (source) {
      case 'cache':
        this.stats.cacheHits++;
        break;
      case 'network':
        this.stats.networkHits++;
        break;
      case 'native':
        this.stats.nativeHits++;
        break;
      case 'none':
        this.stats.misses++;
        break;
    }
    this.updateDominant();
    this.notifyListeners();
  }

  recordBatch(cache: number, network: number, native: number, misses: number): void {
    this.stats.cacheHits += cache;
    this.stats.networkHits += network;
    this.stats.nativeHits += native;
    this.stats.misses += misses;
    this.stats.total += cache + network + native + misses;
    this.updateDominant();
    this.notifyListeners();
  }

  getStats(): TileSourceStats {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = {
      cacheHits: 0,
      networkHits: 0,
      nativeHits: 0,
      misses: 0,
      total: 0,
      dominantSource: 'none',
      isOfflineServing: false,
    };
    this.notifyListeners();
  }

  onStatsChange(fn: (stats: TileSourceStats) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private updateDominant(): void {
    const { cacheHits, networkHits, nativeHits, misses, total } = this.stats;
    if (total === 0) {
      this.stats.dominantSource = 'none';
      this.stats.isOfflineServing = false;
      return;
    }

    const offlineHits = cacheHits + nativeHits;
    const onlineHits = networkHits;

    if (offlineHits > onlineHits) {
      this.stats.dominantSource = nativeHits > cacheHits ? 'native' : 'cache';
      this.stats.isOfflineServing = true;
    } else if (onlineHits > 0) {
      this.stats.dominantSource = 'network';
      this.stats.isOfflineServing = false;
    } else {
      this.stats.dominantSource = 'none';
      this.stats.isOfflineServing = false;
    }
  }

  private notifyListeners(): void {
    const snapshot = this.getStats();
    for (const fn of this.listeners) {
      try { fn(snapshot); } catch {}
    }
  }
}

export const tileSourceTracker = new TileSourceTracker();

// ── Service Function (called from MapRenderer message handler) ──

/**
 * Handle a tile request from the WebView.
 * Looks up the tile in native storage and returns base64 data.
 */
export async function handleTileRequest(
  url: string
): Promise<{ found: boolean; data: string | null; contentType: string }> {
  const coords = parseTileCoords(url);
  if (!coords) {
    return { found: false, data: null, contentType: '' };
  }

  const data = await findCachedTile(coords.z, coords.x, coords.y);
  if (data) {
    tileSourceTracker.recordHit('native');
    // Determine content type from URL
    let contentType = 'application/x-protobuf';
    if (url.includes('.png')) contentType = 'image/png';
    else if (url.includes('.jpg') || url.includes('.jpeg')) contentType = 'image/jpeg';
    else if (url.includes('.pbf')) contentType = 'application/x-protobuf';

    return { found: true, data, contentType };
  }

  tileSourceTracker.recordHit('none');
  return { found: false, data: null, contentType: '' };
}

