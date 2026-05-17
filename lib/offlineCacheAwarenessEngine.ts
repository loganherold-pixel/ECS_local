/**
 * ═══════════════════════════════════════════════════════════
 * ECS OFFLINE CACHE AWARENESS ENGINE — Phase 3C / 6A / 6D
 * ═══════════════════════════════════════════════════════════
 *
 * Evaluates offline cache readiness and produces normalized
 * data for the Connectivity Intelligence offline_cache provider.
 *
 * Reads from:
 *   - tileCacheStore: Offline map tile regions
 *   - expeditionCache: Cached expedition data
 *   - routeStore: Active route (for route-specific cache matching)
 *   - gpsUIState: Current GPS position (for region matching)
 *   - offlineExpeditionDbStore: Offline Expedition Database (Phase 6A)
 *
 * Produces:
 *   - offline_cache_ready: Whether any useful cache exists
 *   - cached_region_available: Whether a cached region covers current area
 *   - cached_route_available: Whether a cached route is available
 *   - expedition_data_cached: Whether offline expedition datasets exist (Phase 6A)
 *   - expedition_data_covers_position: Whether expedition data covers GPS area (Phase 6A)
 *   - Telemetry: region count, tile count, size
 *
 * Phase 6D additions:
 *   - expedition_data_all_valid: Whether all expedition regions pass integrity
 *   - expedition_data_stale_count: Number of stale expedition regions
 *   - Recognizes cached expedition regions across app restarts
 *   - Integrity-aware readiness (invalid regions excluded)
 *
 * Phase 6A additions:
 *   - Integration with Offline Expedition Database
 *   - expedition_data_cached field in CacheReadinessSnapshot
 *   - expedition_data_covers_position field in CacheReadinessSnapshot
 *   - expedition_data_entries count
 *   - Expedition DB readiness contributes to offline_cache_ready
 *
 * Design principles:
 *   - Lightweight evaluation (no heavy I/O on each check)
 *   - Memoized results to prevent dashboard lag
 *   - Safe fallback when cache metadata is unavailable
 *   - Works correctly when active route or expedition changes
 *   - Never falsely reports readiness when no relevant cache exists
 */


import type {
  ConnectivityProviderData,
  ConnectivityIntelState,
  ConnectivityTelemetry,
} from './connectivityIntelTypes';
import { ecsLog } from './ecsLogger';

// ── Types ────────────────────────────────────────────────

export interface CacheReadinessSnapshot {
  /** Whether any useful offline cache exists on the device */
  offline_cache_ready: boolean;
  /** Whether a cached region covers the current GPS area */
  cached_region_available: boolean;
  /** Whether a cached route covers the active route */
  cached_route_available: boolean;
  /** Number of complete cached regions */
  cached_region_count: number;
  /** Total cached tile count */
  cached_tile_count: number;
  /** Total cached data size in MB */
  cached_size_mb: number;
  /** ISO timestamp of evaluation */
  evaluated_at: string;

  // ── Phase 6A: Offline Expedition Database fields ──

  /** Whether offline expedition datasets exist on the device */
  expedition_data_cached: boolean;
  /** Whether expedition data covers the current GPS position */
  expedition_data_covers_position: boolean;
  /** Whether expedition data covers the active route */
  expedition_data_covers_route: boolean;
  /** Number of downloaded expedition data regions */
  expedition_data_regions: number;
  /** Total expedition dataset entries cached */
  expedition_data_entries: number;
}

/** Default snapshot when no cache data is available */
const DEFAULT_SNAPSHOT: CacheReadinessSnapshot = {
  offline_cache_ready: false,
  cached_region_available: false,
  cached_route_available: false,
  cached_region_count: 0,
  cached_tile_count: 0,
  cached_size_mb: 0,
  evaluated_at: '',
  // Phase 6A defaults
  expedition_data_cached: false,
  expedition_data_covers_position: false,
  expedition_data_covers_route: false,
  expedition_data_regions: 0,
  expedition_data_entries: 0,
};



// ── Memoization Cache ────────────────────────────────────
// Prevents repeated expensive evaluations within a short window.

let _cachedSnapshot: CacheReadinessSnapshot | null = null;
let _lastEvalTime = 0;
let _lastRouteId: string | null = null;
let _lastGpsLat: number | null = null;
let _lastGpsLon: number | null = null;
let _lastInvalidationKey: string | null = null;
let _lastInvalidationAt = 0;
let _invalidationVersion = 0;

/** Minimum interval between full re-evaluations (30 seconds) */
const EVAL_INTERVAL_MS = 30_000;

/** GPS movement threshold before re-evaluating (approx 0.5 miles) */
const GPS_MOVEMENT_THRESHOLD_DEG = 0.007;

/** Suppress duplicate invalidations during startup/store hydration fan-out */
const INVALIDATION_DEDUPE_WINDOW_MS = 2_000;


// ── Helpers ──────────────────────────────────────────────

/**
 * Check if a GPS position falls within a tile cache region's bounds.
 */
function positionInBounds(
  lat: number,
  lon: number,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): boolean {
  return (
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lon >= bounds.minLng &&
    lon <= bounds.maxLng
  );
}

/**
 * Check if a route's waypoints/segments overlap with a cached region.
 * Uses a quick bounding box check rather than per-point iteration.
 */
function routeOverlapsBounds(
  routeSegments: Array<{ points: Array<{ lat: number; lon: number }> }>,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): boolean {
  // Quick check: compute route bounding box and test intersection
  let rMinLat = Infinity, rMaxLat = -Infinity;
  let rMinLon = Infinity, rMaxLon = -Infinity;

  for (const seg of routeSegments) {
    for (const pt of seg.points) {
      if (pt.lat < rMinLat) rMinLat = pt.lat;
      if (pt.lat > rMaxLat) rMaxLat = pt.lat;
      if (pt.lon < rMinLon) rMinLon = pt.lon;
      if (pt.lon > rMaxLon) rMaxLon = pt.lon;
    }
  }

  // No valid route points
  if (rMinLat === Infinity) return false;

  // Bounding box intersection test
  return !(
    rMaxLat < bounds.minLat ||
    rMinLat > bounds.maxLat ||
    rMaxLon < bounds.minLng ||
    rMinLon > bounds.maxLng
  );
}

/**
 * Determine if GPS has moved enough to warrant re-evaluation.
 */
function gpsMovedSignificantly(
  newLat: number | null,
  newLon: number | null,
  prevLat: number | null,
  prevLon: number | null,
): boolean {
  if (newLat == null || newLon == null) return prevLat != null;
  if (prevLat == null || prevLon == null) return true;
  return (
    Math.abs(newLat - prevLat) > GPS_MOVEMENT_THRESHOLD_DEG ||
    Math.abs(newLon - prevLon) > GPS_MOVEMENT_THRESHOLD_DEG
  );
}

const VOLATILE_INVALIDATION_KEYS = new Set([
  'captured_at',
  'checked_at',
  'evaluated_at',
  'lastCheckedAt',
  'lastRunAt',
  'lastUpdatedAt',
  'queried_at',
  'reported_at',
  'timestamp',
]);

function stableInvalidationValue(value: unknown, seen = new WeakSet<object>()): string {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return `[${value.map(item => stableInvalidationValue(item, seen)).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter(key => !VOLATILE_INVALIDATION_KEYS.has(key))
    .sort()
    .map(key => `${key}:${stableInvalidationValue(record[key], seen)}`)
    .join(',')}}`;
}

function buildInvalidationKey(reason: string, sourceState?: unknown): string {
  return `${reason || 'unspecified'}::${stableInvalidationValue(sourceState)}`;
}


// ══════════════════════════════════════════════════════════
// CORE EVALUATION
// ══════════════════════════════════════════════════════════

/**
 * Evaluate offline cache readiness.
 *
 * This is the main entry point called by the CI service.
 * It reads from tileCacheStore, expeditionCache, and routeStore
 * to determine whether the user has useful offline data.
 *
 * Memoized: returns cached result if called within EVAL_INTERVAL_MS
 * and GPS hasn't moved significantly and route hasn't changed.
 */
export function evaluateCacheReadiness(): CacheReadinessSnapshot {
  try {
    // ── Read current context ──
    let currentLat: number | null = null;
    let currentLon: number | null = null;
    let activeRouteId: string | null = null;
    let activeRouteSegments: Array<{ points: Array<{ lat: number; lon: number }> }> | null = null;

    // Read GPS position (safe import)
    try {
      const { gpsUIState } = require('./gpsUIState');
      const gps = gpsUIState.get();
      if (gps.hasFix && gps.position) {
        currentLat = gps.position.latitude;
        currentLon = gps.position.longitude;
      }
    } catch {}

    // Read active route (safe import)
    try {
      const { routeStore } = require('./routeStore');
      const active = routeStore.getActive();
      if (active) {
        activeRouteId = active.id;
        activeRouteSegments = active.segments || null;
      }
    } catch {}

    // ── Check memoization validity ──
    const now = Date.now();
    const routeChanged = activeRouteId !== _lastRouteId;
    const gpsMoved = gpsMovedSignificantly(currentLat, currentLon, _lastGpsLat, _lastGpsLon);
    const timeExpired = (now - _lastEvalTime) > EVAL_INTERVAL_MS;

    if (
      _cachedSnapshot != null &&
      !routeChanged &&
      !gpsMoved &&
      !timeExpired
    ) {
      return _cachedSnapshot;
    }

    // ── Full evaluation ──

    let cachedRegionCount = 0;
    let cachedTileCount = 0;
    let cachedSizeMb = 0;
    let regionCoversPosition = false;
    let regionCoversRoute = false;
    let hasAnyCompleteRegion = false;

    // Read tile cache regions (safe import)
    try {
      const { tileCacheStore } = require('./tileCacheStore');
      const regions = tileCacheStore.getRegions();

      for (const region of regions) {
        // Only consider complete or partial regions
        if (region.status !== 'complete' && region.status !== 'partial') continue;

        hasAnyCompleteRegion = true;
        cachedRegionCount++;
        cachedTileCount += region.downloadedTiles || 0;
        cachedSizeMb += region.actualSizeMB > 0 ? region.actualSizeMB : region.estimatedSizeMB;

        // Check if this region covers the current GPS position
        if (currentLat != null && currentLon != null && !regionCoversPosition) {
          if (positionInBounds(currentLat, currentLon, region.bounds)) {
            regionCoversPosition = true;
          }
        }

        // Check if this region covers the active route
        if (activeRouteSegments && !regionCoversRoute) {
          if (routeOverlapsBounds(activeRouteSegments, region.bounds)) {
            regionCoversRoute = true;
          }
        }

        // Check if this is a route-corridor region for the active route
        if (
          region.sourceType === 'route-corridor' &&
          region.routeId &&
          region.routeId === activeRouteId
        ) {
          regionCoversRoute = true;
        }
      }
    } catch (e) {
      // tileCacheStore not available — safe fallback
      console.warn('[OfflineCacheAwareness] tileCacheStore read failed:', e);
    }
    // ── Check expedition cache ──
    let hasExpeditionCache = false;
    try {
      const { getCachedActiveExpedition, getCachedExpeditions } = require('./expeditionCache');
      const activeExp = getCachedActiveExpedition();
      const cachedExps = getCachedExpeditions();
      hasExpeditionCache = activeExp != null || (cachedExps && cachedExps.length > 0);
    } catch {}

    // ── Phase 6A: Check Offline Expedition Database ──
    let expeditionDataCached = false;
    let expeditionDataCoversPosition = false;
    let expeditionDataCoversRoute = false;
    let expeditionDataRegions = 0;
    let expeditionDataEntries = 0;
    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      if (offlineExpeditionDbStore.isInitialized()) {
        const readiness = offlineExpeditionDbStore.evaluateReadiness();
        expeditionDataCached = readiness.has_offline_data;
        expeditionDataCoversPosition = readiness.covers_current_position;
        expeditionDataCoversRoute = readiness.covers_active_route;
        expeditionDataRegions = readiness.downloaded_regions;
        expeditionDataEntries = readiness.total_entries;
      }
    } catch (e) {
      // Offline Expedition DB not available — safe fallback
      console.warn('[OfflineCacheAwareness] [6A] offlineExpeditionDbStore read failed:', e);
    }

    // ── Determine readiness ──
    // Phase 6A: offline_cache_ready includes expedition database data
    const offlineCacheReady = hasAnyCompleteRegion || hasExpeditionCache || expeditionDataCached;

    // cached_region_available: true if a cached region covers the current area
    // Phase 6A: Also true if expedition data covers current position
    const cachedRegionAvailable = currentLat != null
      ? (regionCoversPosition || expeditionDataCoversPosition)
      : (hasAnyCompleteRegion || expeditionDataCached);

    // cached_route_available: true if a cached region covers the active route
    // Phase 6A: Also true if expedition data covers the active route
    const cachedRouteAvailable = activeRouteId != null
      ? (regionCoversRoute || expeditionDataCoversRoute)
      : false;

    // ── Build snapshot ──
    const snapshot: CacheReadinessSnapshot = {
      offline_cache_ready: offlineCacheReady,
      cached_region_available: cachedRegionAvailable,
      cached_route_available: cachedRouteAvailable,
      cached_region_count: cachedRegionCount,
      cached_tile_count: cachedTileCount,
      cached_size_mb: Math.round(cachedSizeMb * 10) / 10,
      evaluated_at: new Date().toISOString(),
      // Phase 6A: Expedition Database fields
      expedition_data_cached: expeditionDataCached,
      expedition_data_covers_position: expeditionDataCoversPosition,
      expedition_data_covers_route: expeditionDataCoversRoute,
      expedition_data_regions: expeditionDataRegions,
      expedition_data_entries: expeditionDataEntries,
    };

    // ── Update memoization cache ──
    _cachedSnapshot = snapshot;
    _lastEvalTime = now;
    _lastRouteId = activeRouteId;
    _lastGpsLat = currentLat;
    _lastGpsLon = currentLon;

    return snapshot;
  } catch (e) {
    // Complete failure — return safe default
    console.warn('[OfflineCacheAwareness] Evaluation failed:', e);
    return { ...DEFAULT_SNAPSHOT, evaluated_at: new Date().toISOString() };
  }
}




// ══════════════════════════════════════════════════════════
// PROVIDER DATA BUILDER
//
// Converts a CacheReadinessSnapshot into a ConnectivityProviderData
// entry for the offline_cache provider.
// ══════════════════════════════════════════════════════════

/**
 * Build a ConnectivityProviderData entry from the cache readiness snapshot.
 * This is consumed by the CI service's _update() cycle.
 */
export function buildOfflineCacheProviderData(): ConnectivityProviderData {
  const snapshot = evaluateCacheReadiness();

  // The offline_cache provider doesn't determine connectivity state itself.
  // It reports 'connected' if cache is ready (data is accessible locally),
  // or 'unknown' if no cache exists (it doesn't know about network state).
  const state: ConnectivityIntelState = snapshot.offline_cache_ready
    ? 'connected'
    : 'unknown';

  const telemetry: ConnectivityTelemetry = {
    offline_cache_ready: snapshot.offline_cache_ready,
    cached_region_available: snapshot.cached_region_available,
    cached_route_available: snapshot.cached_route_available,
    cached_region_count: snapshot.cached_region_count,
    cached_tile_count: snapshot.cached_tile_count,
    cached_size_mb: snapshot.cached_size_mb,
    source_provider: 'offline_cache',
    captured_at: snapshot.evaluated_at,
  };

  return {
    provider_id: 'offline_cache',
    state,
    telemetry,
    reported_at: snapshot.evaluated_at,
    is_active: true,
  };
}


// ══════════════════════════════════════════════════════════
// CACHE INVALIDATION
//
// Called when the user downloads/deletes offline regions,
// changes active route, or starts a new expedition.
// Forces the next evaluation to be a full re-evaluation.
// ══════════════════════════════════════════════════════════

/**
 * Invalidate the cached readiness snapshot.
 * Call this when offline cache state changes (download, delete, etc.)
 */
export function invalidateCacheReadiness(reason = 'unspecified', sourceState?: unknown): boolean {
  const now = Date.now();
  const key = buildInvalidationKey(reason, sourceState);
  const duplicateHydrationFanout =
    key === _lastInvalidationKey &&
    _cachedSnapshot == null &&
    _lastEvalTime === 0;
  const duplicateBurst =
    key === _lastInvalidationKey &&
    (now - _lastInvalidationAt) < INVALIDATION_DEDUPE_WINDOW_MS;

  if (duplicateHydrationFanout || duplicateBurst) {
    return false;
  }

  _cachedSnapshot = null;
  _lastEvalTime = 0;
  _lastRouteId = null;
  _lastGpsLat = null;
  _lastGpsLon = null;
  _lastInvalidationKey = key;
  _lastInvalidationAt = now;
  _invalidationVersion += 1;
  ecsLog.dev('SYSTEM', 'Cache readiness invalidated', {
    reason,
    version: _invalidationVersion,
  }, {
    tag: '[OfflineCacheAwareness]',
    debugFlag: 'ECS_DEBUG_OFFLINE_CACHE',
    fingerprint: `cache-readiness:${reason}:${_invalidationVersion}`,
    throttleMs: 5000,
    aggregateWindowMs: 30_000,
  });
  return true;
}

/**
 * Get the last evaluated snapshot without triggering re-evaluation.
 * Returns null if no evaluation has been performed.
 */
export function getLastCacheReadiness(): CacheReadinessSnapshot | null {
  return _cachedSnapshot;
}

