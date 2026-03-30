/**
 * ═══════════════════════════════════════════════════════════
 * ECS OFFLINE NAVIGATION BRIDGE — Phase 6C/6D
 * ═══════════════════════════════════════════════════════════
 *
 * Provides offline expedition dataset overlays for the
 * Navigation map. Converts DatasetEntry results into
 * map-compatible marker and overlay formats.
 *
 * Integration Points:
 *   - Navigate tab: Offline expedition overlay layer
 *   - MapRenderer: Marker data for offline POIs
 *   - offlineExpeditionDbStore: Local dataset queries
 *   - Connectivity Intelligence: Online/offline detection
 *
 * Behavior:
 *   - When OFFLINE: Provides cached trails and POIs for map display
 *   - Only renders dataset layers relevant to the active view
 *   - Prevents excessive map clutter (limits markers per category)
 *   - Uses ECS-consistent iconography and dark-mode styling
 *   - Active expedition routes remain visible when internet is lost
 *   - Route context preserved during online->offline transition
 *
 * Performance:
 *   - Memoized query results (15-second cache)
 *   - Limits markers per category to prevent map clutter
 *   - Lightweight console logging for query behavior
 *
 * Phase 6D additions:
 *   - Corruption protection: validates entries before marker conversion
 *   - Graceful handling of corrupted datasets (skip, don't crash)
 *   - Works correctly after app restart (reads from persisted store)
 *   - Safe for Android Auto / CarPlay consumption
 *
 * Phase 6C: Initial implementation.
 */

import type {
  DatasetEntry,
  DatasetCategory,
  OfflineDatasetQuery,
  OfflineDatasetQueryResult,
} from './offlineExpeditionDbTypes';
import { DATASET_CATEGORIES, DATASET_CATEGORY_DISPLAY } from './offlineExpeditionDbTypes';

const TAG = '[OfflineNavBridge]';

// ── Constants ────────────────────────────────────────────

/** Maximum markers per category to prevent map clutter */
const MAX_MARKERS_PER_CATEGORY = 15;

/** Default query radius for navigation overlay (miles) */
const DEFAULT_NAV_RADIUS_MI = 25;

/** Memoization cache TTL (15 seconds) */
const CACHE_TTL_MS = 15_000;

/** Earth radius in miles */
const EARTH_RADIUS_MI = 3958.8;


// ── Types ────────────────────────────────────────────────

/**
 * A map marker for an offline expedition dataset entry.
 * Compatible with ECS MapRenderer marker format.
 */
export interface OfflineExpeditionMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  category: DatasetCategory;
  /** Display color for the marker */
  color: string;
  /** Icon name (Ionicons) */
  icon: string;
  /** Short label for the marker */
  label: string;
  /** Single-character map identifier */
  mapChar: string;
  /** Whether this is a hazard marker */
  isHazard: boolean;
  /** Hazard severity (if applicable) */
  hazardSeverity?: 'low' | 'moderate' | 'high' | 'extreme';
  /** Distance from user in miles */
  distanceMi: number | null;
  /** Full entry data for detail views */
  entry: DatasetEntry;
}

/**
 * Result of a navigation overlay query.
 */
export interface OfflineNavigationOverlay {
  /** All markers for the current view */
  markers: OfflineExpeditionMarker[];
  /** Markers grouped by category */
  by_category: Partial<Record<DatasetCategory, OfflineExpeditionMarker[]>>;
  /** Whether offline data is being used */
  is_offline: boolean;
  /** Whether data covers the current position */
  covers_position: boolean;
  /** Source regions contributing data */
  source_regions: string[];
  /** Total entries found (before limit) */
  total_count: number;
  /** Categories with available data */
  available_categories: DatasetCategory[];
  /** ISO timestamp of query */
  queried_at: string;
}

/**
 * Category filter state for the navigation overlay.
 */
export interface OverlayCategoryFilter {
  category: DatasetCategory;
  label: string;
  icon: string;
  color: string;
  enabled: boolean;
  count: number;
}


// ── Map Character Assignments ────────────────────────────

const CATEGORY_MAP_CHARS: Record<DatasetCategory, string> = {
  trails: 'T',
  campsites: 'C',
  fuel_stations: 'F',
  water_sources: 'W',
  ranger_stations: 'R',
  recovery_points: 'X',
  hazard_zones: 'H',
};


// ── Haversine Distance ───────────────────────────────────

function haversineDistanceMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// ── Memoization Cache ────────────────────────────────────

let _cachedOverlay: OfflineNavigationOverlay | null = null;
let _cacheTime = 0;
let _cacheLat: number | null = null;
let _cacheLng: number | null = null;
let _cacheRadius: number | null = null;

/** GPS movement threshold before re-querying (approx 0.3 miles) */
const GPS_MOVEMENT_THRESHOLD_DEG = 0.004;

function _shouldRefreshCache(lat: number, lng: number, radiusMi: number): boolean {
  if (!_cachedOverlay) return true;
  if (Date.now() - _cacheTime > CACHE_TTL_MS) return true;
  if (_cacheRadius !== radiusMi) return true;
  if (_cacheLat == null || _cacheLng == null) return true;
  if (
    Math.abs(lat - _cacheLat) > GPS_MOVEMENT_THRESHOLD_DEG ||
    Math.abs(lng - _cacheLng) > GPS_MOVEMENT_THRESHOLD_DEG
  ) return true;
  return false;
}


// ── Phase 6D: Entry Validation ───────────────────────────

/**
 * Validate that a DatasetEntry has the minimum required fields.
 * Prevents corrupted entries from crashing Navigation.
 */
function _isValidEntry(entry: any): entry is DatasetEntry {
  return (
    entry != null &&
    typeof entry.id === 'string' &&
    typeof entry.latitude === 'number' &&
    typeof entry.longitude === 'number' &&
    typeof entry.name === 'string' &&
    !isNaN(entry.latitude) &&
    !isNaN(entry.longitude)
  );
}


// ── Entry -> Marker Conversion ────────────────────────────

function _convertToMarker(
  entry: DatasetEntry,
  userLat?: number,
  userLng?: number,
): OfflineExpeditionMarker | null {
  // Phase 6D: Validate entry before conversion
  if (!_isValidEntry(entry)) {
    return null;
  }

  try {
    const display = DATASET_CATEGORY_DISPLAY[entry.category];
    let distanceMi: number | null = null;
    if (userLat != null && userLng != null) {
      distanceMi = Math.round(
        haversineDistanceMiles(userLat, userLng, entry.latitude, entry.longitude) * 10
      ) / 10;
    }

    return {
      id: entry.id,
      lat: entry.latitude,
      lng: entry.longitude,
      title: entry.name,
      category: entry.category,
      color: display?.color || '#78909C',
      icon: display?.icon || 'location-outline',
      label: display?.label || entry.category,
      mapChar: CATEGORY_MAP_CHARS[entry.category] || '?',
      isHazard: entry.category === 'hazard_zones',
      hazardSeverity: entry.hazard_severity,
      distanceMi,
      entry,
    };
  } catch {
    // Phase 6D: Conversion failed — skip this entry
    return null;
  }
}


// ── Connectivity Detection ───────────────────────────────

function _isDeviceOffline(): boolean {
  try {
    const { connectivityIntelStore } = require('./connectivityIntelStore');
    if (connectivityIntelStore.isInitialized() && connectivityIntelStore.isMonitoring()) {
      const summary = connectivityIntelStore.getSummary();
      if (summary) {
        return summary.connectivity_state === 'offline' ||
               (summary.connectivity_state === 'degraded' && !summary.internet_reachable);
      }
    }
  } catch {}

  try {
    const { connectivity } = require('./connectivity');
    return connectivity.getLevel() === 'no_service';
  } catch {}

  return false;
}


// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

export const offlineNavigationBridge = {

  /**
   * Query the offline database for navigation overlay markers.
   *
   * Phase 6D: Includes corruption protection — validates entries
   * before marker conversion. Corrupted entries are silently skipped.
   *
   * @param lat        User latitude
   * @param lng        User longitude
   * @param radiusMi   Query radius in miles (default 25)
   * @param categories Optional category filter (default all)
   */
  queryForOverlay(
    lat: number,
    lng: number,
    radiusMi: number = DEFAULT_NAV_RADIUS_MI,
    categories?: DatasetCategory[],
  ): OfflineNavigationOverlay {
    // Check memoization
    if (!_shouldRefreshCache(lat, lng, radiusMi) && _cachedOverlay) {
      return _cachedOverlay;
    }

    const now = new Date().toISOString();
    const isOffline = _isDeviceOffline();

    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      if (!offlineExpeditionDbStore.isInitialized()) {
        console.log(`${TAG} Store not initialized`);
        return _emptyOverlay(isOffline, now);
      }

      const readiness = offlineExpeditionDbStore.evaluateReadiness();
      if (!readiness.has_offline_data) {
        return _emptyOverlay(isOffline, now);
      }

      const coversPosition = offlineExpeditionDbStore.coversPosition(lat, lng);

      // Query all requested categories
      const queryCategories = categories || [
        'trails', 'hazard_zones', 'fuel_stations',
        'water_sources', 'recovery_points', 'campsites',
        'ranger_stations',
      ];

      const query: OfflineDatasetQuery = {
        categories: queryCategories,
        near: { latitude: lat, longitude: lng, radius_miles: radiusMi },
        sort_by: 'distance',
        sort_direction: 'asc',
      };

      const result = offlineExpeditionDbStore.query(query);

      // Convert to markers and group by category
      const byCategory: Partial<Record<DatasetCategory, OfflineExpeditionMarker[]>> = {};
      const allMarkers: OfflineExpeditionMarker[] = [];
      let skippedEntries = 0;

      for (const entry of result.entries) {
        // Phase 6D: Safe marker conversion with validation
        const marker = _convertToMarker(entry, lat, lng);
        if (!marker) {
          skippedEntries++;
          continue;
        }

        if (!byCategory[entry.category]) {
          byCategory[entry.category] = [];
        }

        // Limit markers per category to prevent clutter
        if (byCategory[entry.category]!.length < MAX_MARKERS_PER_CATEGORY) {
          byCategory[entry.category]!.push(marker);
          allMarkers.push(marker);
        }
      }

      if (skippedEntries > 0) {
        console.warn(`${TAG} [6D] Skipped ${skippedEntries} invalid entries during overlay build`);
      }

      const availableCategories = Object.keys(byCategory) as DatasetCategory[];

      console.log(
        `${TAG} Nav overlay: ${allMarkers.length} markers across ` +
        `${availableCategories.length} categories ` +
        `(radius: ${radiusMi} mi, covers: ${coversPosition})`
      );

      const overlay: OfflineNavigationOverlay = {
        markers: allMarkers,
        by_category: byCategory,
        is_offline: isOffline,
        covers_position: coversPosition,
        source_regions: result.source_regions,
        total_count: result.total_count,
        available_categories: availableCategories,
        queried_at: now,
      };

      // Update cache
      _cachedOverlay = overlay;
      _cacheTime = Date.now();
      _cacheLat = lat;
      _cacheLng = lng;
      _cacheRadius = radiusMi;

      return overlay;
    } catch (e) {
      // Phase 6D: Catch-all protection — never crash Navigation
      console.warn(`${TAG} [6D] Overlay query failed (graceful fallback):`, e);
      return _emptyOverlay(isOffline, now);
    }
  },

  /**
   * Query specifically for cached trails near a position.
   * Used when the device goes offline to keep trails visible on the map.
   */
  getCachedTrails(
    lat: number,
    lng: number,
    radiusMi: number = 50,
  ): OfflineExpeditionMarker[] {
    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      if (!offlineExpeditionDbStore.isInitialized()) return [];

      const result = offlineExpeditionDbStore.query({
        category: 'trails',
        near: { latitude: lat, longitude: lng, radius_miles: radiusMi },
        sort_by: 'distance',
        sort_direction: 'asc',
        limit: 20,
      });

      // Phase 6D: Filter out invalid entries
      return result.entries
        .map(e => _convertToMarker(e, lat, lng))
        .filter((m): m is OfflineExpeditionMarker => m != null);
    } catch {
      return [];
    }
  },

  /**
   * Query specifically for hazard zones near a position.
   * Hazards should always be visible when cached data exists.
   */
  getCachedHazards(
    lat: number,
    lng: number,
    radiusMi: number = 30,
  ): OfflineExpeditionMarker[] {
    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      if (!offlineExpeditionDbStore.isInitialized()) return [];

      const result = offlineExpeditionDbStore.query({
        category: 'hazard_zones',
        near: { latitude: lat, longitude: lng, radius_miles: radiusMi },
        sort_by: 'distance',
        sort_direction: 'asc',
        limit: 10,
      });

      return result.entries
        .map(e => _convertToMarker(e, lat, lng))
        .filter((m): m is OfflineExpeditionMarker => m != null);
    } catch {
      return [];
    }
  },

  /**
   * Query for fuel and water sources near a position.
   * Critical for route planning when offline.
   */
  getCachedResupplyPoints(
    lat: number,
    lng: number,
    radiusMi: number = 40,
  ): OfflineExpeditionMarker[] {
    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      if (!offlineExpeditionDbStore.isInitialized()) return [];

      const result = offlineExpeditionDbStore.query({
        categories: ['fuel_stations', 'water_sources'],
        near: { latitude: lat, longitude: lng, radius_miles: radiusMi },
        sort_by: 'distance',
        sort_direction: 'asc',
        limit: 15,
      });

      return result.entries
        .map(e => _convertToMarker(e, lat, lng))
        .filter((m): m is OfflineExpeditionMarker => m != null);
    } catch {
      return [];
    }
  },

  /**
   * Get category filter options for the navigation overlay.
   * Shows which categories have data and their counts.
   */
  getCategoryFilters(
    lat: number,
    lng: number,
    radiusMi: number = DEFAULT_NAV_RADIUS_MI,
  ): OverlayCategoryFilter[] {
    try {
      const overlay = offlineNavigationBridge.queryForOverlay(lat, lng, radiusMi);

      return DATASET_CATEGORIES.map(cat => {
        const display = DATASET_CATEGORY_DISPLAY[cat];
        const markers = overlay.by_category[cat] || [];
        return {
          category: cat,
          label: display.pluralLabel,
          icon: display.icon,
          color: display.color,
          enabled: markers.length > 0,
          count: markers.length,
        };
      });
    } catch {
      // Phase 6D: Safe fallback
      return DATASET_CATEGORIES.map(cat => {
        const display = DATASET_CATEGORY_DISPLAY[cat];
        return {
          category: cat,
          label: display.pluralLabel,
          icon: display.icon,
          color: display.color,
          enabled: false,
          count: 0,
        };
      });
    }
  },

  /**
   * Check if offline expedition data covers the active route.
   * Used to preserve route context during online->offline transition.
   */
  coversActiveRoute(): boolean {
    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      if (!offlineExpeditionDbStore.isInitialized()) return false;

      const { routeStore } = require('./routeStore');
      const activeRoute = routeStore.getActive();
      if (!activeRoute?.segments) return false;

      const points: Array<{ lat: number; lng: number }> = [];
      for (const seg of activeRoute.segments) {
        for (const pt of seg.points || []) {
          points.push({ lat: pt.lat, lng: pt.lon ?? pt.lng });
        }
      }

      if (points.length === 0) return false;
      const sampled = points.filter((_, i) => i % 10 === 0);
      return offlineExpeditionDbStore.coversRoute(sampled);
    } catch {
      return false;
    }
  },

  /**
   * Invalidate the memoization cache.
   * Call when offline data changes (download, delete, etc.)
   */
  invalidateCache(): void {
    _cachedOverlay = null;
    _cacheTime = 0;
    _cacheLat = null;
    _cacheLng = null;
    _cacheRadius = null;
    console.log(`${TAG} Cache invalidated`);
  },

  /**
   * Check if offline data is available for navigation.
   */
  hasOfflineData(): boolean {
    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      if (!offlineExpeditionDbStore.isInitialized()) return false;
      return offlineExpeditionDbStore.getDownloadedCount() > 0;
    } catch {
      return false;
    }
  },
};


// ── Helper ───────────────────────────────────────────────

function _emptyOverlay(isOffline: boolean, now: string): OfflineNavigationOverlay {
  return {
    markers: [],
    by_category: {},
    is_offline: isOffline,
    covers_position: false,
    source_regions: [],
    total_count: 0,
    available_categories: [],
    queried_at: now,
  };
}

