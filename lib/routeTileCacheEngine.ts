/**
 * Route Tile Cache Engine — Smart automatic tile pre-caching for expedition routes
 *
 * Analyzes route characteristics and automatically pre-downloads map tiles
 * along planned expedition routes for offline navigation.
 *
 * Features:
 *   - Smart zoom level selection based on route length and type
 *   - Bounding box computation with configurable corridor buffer
 *   - Auto-detection of existing cached regions for a route
 *   - Per-route caching state tracking
 *   - Storage usage monitoring
 *   - Automatic cache invalidation for stale regions
 *
 * Integrates with:
 *   - tileCacheStore for tile storage + metadata + quota
 *   - runStore for route data
 *   - connectivity for online/offline detection
 */
import { Platform } from 'react-native';
import {
  tileCacheStore,
  computeRouteCorridor,
  countTilesForRegion,
  estimateSizeMB,
  getTileBreakdown,
  type TileCacheRegion,
  type TileBounds,
  type DownloadProgress,
} from './tileCacheStore';
import type { ECSRun, RunPoint } from './runStore';
import { connectivity } from './connectivity';

// ── Types ───────────────────────────────────────────────

export interface RouteAnalysis {
  /** Route ID */
  routeId: string;
  /** Route name */
  routeName: string;
  /** Total route distance in miles */
  distanceMiles: number;
  /** Number of route points */
  pointCount: number;
  /** Route bounding box */
  bounds: TileBounds;
  /** Corridor bounds with buffer */
  corridorBounds: TileBounds;
  /** Buffer distance in miles */
  bufferMiles: number;
  /** Recommended zoom levels */
  zoomMin: number;
  zoomMax: number;
  /** Route type classification */
  routeType: 'short' | 'medium' | 'long' | 'expedition';
  /** Total tiles needed */
  tileCount: number;
  /** Estimated download size in MB */
  estimatedSizeMB: number;
  /** Per-zoom breakdown */
  zoomBreakdown: Array<{ zoom: number; tiles: number; sizeMB: number }>;
  /** Whether this route already has cached tiles */
  hasCachedRegion: boolean;
  /** Existing cached region if any */
  cachedRegion: TileCacheRegion | null;
  /** Whether the cache covers the full route */
  cacheComplete: boolean;
  /** Cache coverage percentage (0-100) */
  cacheCoverage: number;
  /** Whether auto-caching is recommended */
  autoRecommended: boolean;
  /** Reason for recommendation */
  recommendationReason: string;
}

export interface CacheProgress {
  routeId: string;
  regionId: string;
  status: 'idle' | 'preparing' | 'downloading' | 'complete' | 'error' | 'cancelled';
  totalTiles: number;
  downloadedTiles: number;
  failedTiles: number;
  percent: number;
  downloadedSizeMB: number;
  estimatedSizeMB: number;
  speed: number;
  eta: number;
  message: string;
  currentZoom: number;
}

export interface StorageOverview {
  totalCachedMB: number;
  totalRegions: number;
  quotaLimitMB: number;
  quotaUsedPercent: number;
  quotaLevel: 'ok' | 'warning' | 'critical' | 'exceeded';
  routeCachedRegions: number;
  availableMB: number;
}

// ── Constants ───────────────────────────────────────────

/** Route type thresholds in miles */
const ROUTE_TYPE_THRESHOLDS = {
  short: 10,      // < 10 mi
  medium: 50,     // 10-50 mi
  long: 200,      // 50-200 mi
  expedition: Infinity, // > 200 mi
};

/** Zoom level recommendations per route type */
const ZOOM_RECOMMENDATIONS: Record<string, { min: number; max: number; buffer: number }> = {
  short: { min: 12, max: 17, buffer: 1 },
  medium: { min: 10, max: 16, buffer: 2 },
  long: { min: 8, max: 15, buffer: 3 },
  expedition: { min: 6, max: 14, buffer: 5 },
};

/** Maximum tiles before warning */
const MAX_TILES_WARNING = 50000;
const MAX_TILES_LIMIT = 100000;

/** Auto-cache threshold — routes shorter than this always auto-cache */
const AUTO_CACHE_DISTANCE_THRESHOLD = 100; // miles

/** Key for tracking which routes have been offered auto-cache */
const AUTO_CACHE_OFFERED_KEY = 'ecs_route_auto_cache_offered';

// ── Storage helpers ─────────────────────────────────────

const memoryStore: Record<string, string> = {};

function lsGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return memoryStore[key] || null;
}

function lsSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
  }
  memoryStore[key] = value;
}

// ── Route Analysis ──────────────────────────────────────

/**
 * Classify route type based on distance
 */
function classifyRouteType(distanceMiles: number): 'short' | 'medium' | 'long' | 'expedition' {
  if (distanceMiles < ROUTE_TYPE_THRESHOLDS.short) return 'short';
  if (distanceMiles < ROUTE_TYPE_THRESHOLDS.medium) return 'medium';
  if (distanceMiles < ROUTE_TYPE_THRESHOLDS.long) return 'long';
  return 'expedition';
}

/**
 * Compute raw bounding box from route points (no buffer)
 */
function computeRawBounds(points: Array<{ lat: number; lng: number }>): TileBounds | null {
  if (points.length === 0) return null;

  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;

  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }

  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Check if a cached region covers a route's corridor bounds
 */
function computeCoverage(region: TileCacheRegion, corridorBounds: TileBounds): number {
  const rb = region.bounds;

  // Compute intersection
  const intMinLat = Math.max(rb.minLat, corridorBounds.minLat);
  const intMaxLat = Math.min(rb.maxLat, corridorBounds.maxLat);
  const intMinLng = Math.max(rb.minLng, corridorBounds.minLng);
  const intMaxLng = Math.min(rb.maxLng, corridorBounds.maxLng);

  if (intMinLat >= intMaxLat || intMinLng >= intMaxLng) return 0;

  const intArea = (intMaxLat - intMinLat) * (intMaxLng - intMinLng);
  const corridorArea = (corridorBounds.maxLat - corridorBounds.minLat) *
    (corridorBounds.maxLng - corridorBounds.minLng);

  if (corridorArea <= 0) return 0;
  return Math.min(100, Math.round((intArea / corridorArea) * 100));
}

/**
 * Find existing cached regions that cover this route
 */
function findExistingCacheForRoute(routeId: string, corridorBounds: TileBounds): {
  region: TileCacheRegion | null;
  coverage: number;
} {
  const regions = tileCacheStore.getRegions();

  // First: look for regions explicitly tagged with this route ID
  const tagged = regions.find(r => r.routeId === routeId &&
    (r.status === 'complete' || r.status === 'downloading' || r.status === 'partial'));
  if (tagged) {
    const coverage = computeCoverage(tagged, corridorBounds);
    return { region: tagged, coverage };
  }

  // Second: look for any complete region that covers this corridor
  let bestRegion: TileCacheRegion | null = null;
  let bestCoverage = 0;

  for (const region of regions) {
    if (region.status !== 'complete' && region.status !== 'partial') continue;
    const coverage = computeCoverage(region, corridorBounds);
    if (coverage > bestCoverage) {
      bestCoverage = coverage;
      bestRegion = region;
    }
  }

  return { region: bestRegion, coverage: bestCoverage };
}

/**
 * Analyze a route and compute caching recommendations
 */
export function analyzeRoute(run: ECSRun): RouteAnalysis | null {
  const points = run.points.map(p => ({ lat: p.lat, lng: p.lng }));
  if (points.length < 2) return null;

  const rawBounds = computeRawBounds(points);
  if (!rawBounds) return null;

  const routeType = classifyRouteType(run.stats.distance_miles);
  const recommendation = ZOOM_RECOMMENDATIONS[routeType];

  const corridorBounds = computeRouteCorridor(points, recommendation.buffer);
  if (!corridorBounds) return null;

  const tileCount = countTilesForRegion(corridorBounds, recommendation.min, recommendation.max);
  const estSizeMB = estimateSizeMB(tileCount, 'tactical');
  const zoomBreakdown = getTileBreakdown(corridorBounds, recommendation.min, recommendation.max);

  // Check existing cache
  const { region: cachedRegion, coverage: cacheCoverage } = findExistingCacheForRoute(run.id, corridorBounds);
  const hasCachedRegion = cachedRegion !== null && cacheCoverage > 50;
  const cacheComplete = cachedRegion?.status === 'complete' && cacheCoverage >= 90;

  // Determine auto-cache recommendation
  let autoRecommended = false;
  let recommendationReason = '';

  if (cacheComplete) {
    recommendationReason = 'Route tiles are fully cached for offline use';
  } else if (hasCachedRegion && cacheCoverage >= 70) {
    recommendationReason = `${cacheCoverage}% of route corridor is cached`;
  } else if (tileCount > MAX_TILES_LIMIT) {
    recommendationReason = 'Route too large for automatic caching — use manual region selection';
  } else if (!connectivity.isOnline()) {
    recommendationReason = 'No network — caching unavailable';
  } else if (run.stats.distance_miles <= AUTO_CACHE_DISTANCE_THRESHOLD) {
    autoRecommended = true;
    recommendationReason = `${routeType} route — auto-cache recommended (${tileCount.toLocaleString()} tiles, ~${estSizeMB.toFixed(1)} MB)`;
  } else {
    autoRecommended = true;
    recommendationReason = `${routeType} route — cache for offline navigation (${tileCount.toLocaleString()} tiles, ~${estSizeMB.toFixed(1)} MB)`;
  }

  return {
    routeId: run.id,
    routeName: run.title,
    distanceMiles: run.stats.distance_miles,
    pointCount: points.length,
    bounds: rawBounds,
    corridorBounds,
    bufferMiles: recommendation.buffer,
    zoomMin: recommendation.min,
    zoomMax: recommendation.max,
    routeType,
    tileCount,
    estimatedSizeMB: estSizeMB,
    zoomBreakdown,
    hasCachedRegion,
    cachedRegion: cachedRegion || null,
    cacheComplete,
    cacheCoverage,
    autoRecommended,
    recommendationReason,
  };
}

/**
 * Check if auto-cache has already been offered for this route
 */
export function wasAutoCacheOffered(routeId: string): boolean {
  try {
    const raw = lsGet(AUTO_CACHE_OFFERED_KEY);
    if (!raw) return false;
    const offered: string[] = JSON.parse(raw);
    return offered.includes(routeId);
  } catch {
    return false;
  }
}

/**
 * Mark that auto-cache was offered for this route
 */
export function markAutoCacheOffered(routeId: string): void {
  try {
    const raw = lsGet(AUTO_CACHE_OFFERED_KEY);
    const offered: string[] = raw ? JSON.parse(raw) : [];
    if (!offered.includes(routeId)) {
      offered.push(routeId);
      // Keep only last 50 entries
      if (offered.length > 50) offered.splice(0, offered.length - 50);
      lsSet(AUTO_CACHE_OFFERED_KEY, JSON.stringify(offered));
    }
  } catch {}
}

/**
 * Start caching tiles for a route
 */
export async function startRouteCaching(
  analysis: RouteAnalysis,
  styleKey: string = 'tactical',
  onProgress: (progress: CacheProgress) => void,
  additionalCacheSizeMB: number = 0,
): Promise<{ success: boolean; regionId: string | null; error?: string }> {
  if (!connectivity.isOnline()) {
    return { success: false, regionId: null, error: 'No network connection' };
  }

  if (analysis.tileCount > MAX_TILES_LIMIT) {
    return { success: false, regionId: null, error: `Too many tiles (${analysis.tileCount.toLocaleString()}). Max: ${MAX_TILES_LIMIT.toLocaleString()}` };
  }

  // Check quota
  const safeAdditionalSizeMB =
    typeof additionalCacheSizeMB === 'number' && Number.isFinite(additionalCacheSizeMB)
      ? Math.max(0, additionalCacheSizeMB)
      : 0;
  const quotaCheck = tileCacheStore.checkQuotaBeforeDownload(analysis.estimatedSizeMB + safeAdditionalSizeMB);
  if (!quotaCheck.canProceed) {
    return { success: false, regionId: null, error: quotaCheck.message };
  }

  // Create region
  const routePoints = analysis.corridorBounds;
  const regionName = `Route: ${analysis.routeName}`;

  const region = tileCacheStore.createFromBounds(
    regionName,
    analysis.corridorBounds,
    analysis.zoomMin,
    analysis.zoomMax,
    styleKey,
  );

  // Tag with route ID
  tileCacheStore.updateRegion(region.id, { routeId: analysis.routeId, sourceType: 'route-corridor', corridorMiles: analysis.bufferMiles });

  // Report initial progress
  onProgress({
    routeId: analysis.routeId,
    regionId: region.id,
    status: 'preparing',
    totalTiles: region.tileCount,
    downloadedTiles: 0,
    failedTiles: 0,
    percent: 0,
    downloadedSizeMB: 0,
    estimatedSizeMB: analysis.estimatedSizeMB,
    speed: 0,
    eta: 0,
    message: 'Preparing download...',
    currentZoom: analysis.zoomMin,
  });

  // Start download
  const result = await tileCacheStore.startDownloadWithQuota(region.id, (dlProgress) => {
    onProgress({
      routeId: analysis.routeId,
      regionId: region.id,
      status: dlProgress.status === 'complete' ? 'complete' :
        dlProgress.status === 'error' ? 'error' :
        dlProgress.status === 'cancelled' ? 'cancelled' : 'downloading',
      totalTiles: dlProgress.totalTiles,
      downloadedTiles: dlProgress.downloadedTiles,
      failedTiles: dlProgress.failedTiles,
      percent: dlProgress.percent,
      downloadedSizeMB: dlProgress.downloadedSizeMB,
      estimatedSizeMB: dlProgress.estimatedSizeMB,
      speed: dlProgress.speed,
      eta: dlProgress.eta,
      message: dlProgress.message,
      currentZoom: dlProgress.currentZoom,
    });
  });

  if (result.cleanupResult && result.cleanupResult.purged > 0) {
    console.log(`[RouteTileCache] Auto-cleanup freed ${result.cleanupResult.freedMB} MB`);
  }

  return {
    success: result.success,
    regionId: region.id,
    error: result.success ? undefined : 'Download failed',
  };
}

/**
 * Cancel an active route tile download
 */
export function cancelRouteCaching(regionId: string): void {
  tileCacheStore.cancelDownload(regionId);
}

/**
 * Delete cached tiles for a route
 */
export async function deleteRouteCache(routeId: string): Promise<void> {
  const regions = tileCacheStore.getRegions();
  const routeRegions = regions.filter(r => r.routeId === routeId);

  for (const region of routeRegions) {
    await tileCacheStore.deleteRegion(region.id);
  }
}

/**
 * Get storage overview for display
 */
export function getStorageOverview(): StorageOverview {
  const quotaStatus = tileCacheStore.getQuotaStatus();
  const regions = tileCacheStore.getRegions();
  const routeCachedRegions = regions.filter(r => r.sourceType === 'route-corridor').length;

  return {
    totalCachedMB: quotaStatus.usedMB,
    totalRegions: quotaStatus.regionBreakdown.length,
    quotaLimitMB: quotaStatus.config.quotaLimitMB,
    quotaUsedPercent: Math.round(quotaStatus.usedFraction * 100),
    quotaLevel: quotaStatus.level,
    routeCachedRegions,
    availableMB: quotaStatus.availableMB,
  };
}

/**
 * Format bytes/MB for display
 */
export function formatStorageSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 1024)} KB`;
}

/**
 * Format ETA seconds for display
 */
export function formatETA(seconds: number): string {
  if (seconds <= 0) return '';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

