/**
 * ═══════════════════════════════════════════════════════════
 * ECS OFFLINE DISCOVERY BRIDGE — Phase 6C/6D
 * ═══════════════════════════════════════════════════════════
 *
 * Routes Discovery queries to the Offline Expedition Database
 * when the device is offline. Converts DatasetEntry results
 * into ExpeditionOpportunity format for seamless UI rendering.
 *
 * Integration Points:
 *   - Discovery tab: Offline fallback for trail browsing
 *   - discoverEngine: Offline-aware opportunity loading
 *   - offlineExpeditionDbStore: Local dataset queries
 *   - Connectivity Intelligence: Online/offline detection
 *
 * Behavior:
 *   - When ONLINE: Discovery uses normal seed data + API
 *   - When OFFLINE + cached data: Discovery queries local DB
 *   - When OFFLINE + no data: Shows clear fallback message
 *   - Offline results include source indicator ("OFFLINE DATA")
 *   - Distance filtering still works for offline queries
 *   - Trail difficulty and match score logic preserved
 *
 * Phase 6D additions:
 *   - Corruption protection: validates entries before returning
 *   - Graceful handling of corrupted datasets (skip, don't crash)
 *   - Works correctly after app restart (reads from persisted store)
 *   - Enhanced logging for offline query behavior
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

const TAG = '[OfflineDiscoveryBridge]';

// ── Types ────────────────────────────────────────────────

/**
 * Result of an offline Discovery query.
 * Wraps the raw DB result with Discovery-specific metadata.
 */
export interface OfflineDiscoveryResult {
  /** Whether the device is currently offline */
  is_offline: boolean;
  /** Whether offline data was available for the query */
  has_offline_data: boolean;
  /** Whether a cached region covers the user's current area */
  covers_user_area: boolean;
  /** Trail entries converted to Discovery-compatible format */
  trails: OfflineTrailEntry[];
  /** Non-trail POI entries (campsites, fuel, water, etc.) */
  points_of_interest: OfflinePoiEntry[];
  /** Source regions that contributed to the results */
  source_regions: string[];
  /** Total entries found */
  total_count: number;
  /** Human-readable status message */
  status_message: string;
  /** Fallback message when no data is available */
  fallback_message: string | null;
  /** ISO timestamp of query */
  queried_at: string;
}

/**
 * A trail entry from the offline database, formatted for
 * Discovery UI consumption.
 */
export interface OfflineTrailEntry {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  description: string;
  difficulty_rating: number;
  trail_distance_mi: number;
  elevation_gain_ft: number;
  terrain_type: string;
  tags: string[];
  source: string;
  /** Distance from user in miles (computed if user location available) */
  distance_from_user_miles: number | null;
  /** Match score (0–100, computed from distance + difficulty) */
  match_score: number;
  /** Whether this entry came from offline data */
  is_offline: boolean;
}

/**
 * A non-trail POI entry from the offline database.
 */
export interface OfflinePoiEntry {
  id: string;
  name: string;
  category: DatasetCategory;
  category_label: string;
  category_color: string;
  category_icon: string;
  latitude: number;
  longitude: number;
  description: string;
  /** Distance from user in miles */
  distance_from_user_miles: number | null;
  /** Category-specific metadata */
  metadata: Record<string, any>;
  /** Whether this entry came from offline data */
  is_offline: boolean;
}

/**
 * Default empty result.
 */
const EMPTY_RESULT: OfflineDiscoveryResult = {
  is_offline: false,
  has_offline_data: false,
  covers_user_area: false,
  trails: [],
  points_of_interest: [],
  source_regions: [],
  total_count: 0,
  status_message: '',
  fallback_message: null,
  queried_at: '',
};


// ── Haversine Distance ───────────────────────────────────

const EARTH_RADIUS_MI = 3958.8;

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


// ── Connectivity Detection ───────────────────────────────

/**
 * Determine if the device is currently offline.
 * Checks Connectivity Intelligence first, then falls back to
 * the raw connectivity module.
 */
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
    const level = connectivity.getLevel();
    return level === 'no_service';
  } catch {}

  return false;
}


// ── Phase 6D: Entry Validation ───────────────────────────

/**
 * Validate that a DatasetEntry has the minimum required fields.
 * Prevents corrupted entries from crashing Discovery.
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


// ── Entry Conversion ─────────────────────────────────────

/**
 * Convert a DatasetEntry (trail) to an OfflineTrailEntry.
 */
function _convertTrailEntry(
  entry: DatasetEntry,
  userLat?: number,
  userLng?: number,
): OfflineTrailEntry {
  let distanceFromUser: number | null = null;
  if (userLat != null && userLng != null) {
    distanceFromUser = Math.round(
      haversineDistanceMiles(userLat, userLng, entry.latitude, entry.longitude)
    );
  }

  // Compute a simple match score based on distance and difficulty
  let matchScore = 50; // neutral default
  if (distanceFromUser != null) {
    // Closer = higher score (max 40 points from distance)
    const distScore = Math.max(0, 40 - Math.round(distanceFromUser / 12.5));
    matchScore = distScore;
  }
  // Add difficulty balance (moderate difficulty scores highest)
  const diff = entry.difficulty_rating ?? 3;
  const diffScore = diff >= 2 && diff <= 4 ? 30 : diff === 1 || diff === 5 ? 20 : 25;
  matchScore += diffScore;
  // Add trail quality bonus
  if (entry.trail_distance_mi && entry.trail_distance_mi > 20) matchScore += 10;
  if (entry.elevation_gain_ft && entry.elevation_gain_ft > 2000) matchScore += 10;
  matchScore = Math.max(0, Math.min(100, matchScore));

  return {
    id: entry.id,
    name: entry.name,
    latitude: entry.latitude,
    longitude: entry.longitude,
    description: entry.description || '',
    difficulty_rating: entry.difficulty_rating ?? 3,
    trail_distance_mi: entry.trail_distance_mi ?? 0,
    elevation_gain_ft: entry.elevation_gain_ft ?? 0,
    terrain_type: entry.terrain_type || 'Mixed',
    tags: entry.tags || [],
    source: entry.source || 'offline',
    distance_from_user_miles: distanceFromUser,
    match_score: matchScore,
    is_offline: true,
  };
}

/**
 * Convert a DatasetEntry (non-trail) to an OfflinePoiEntry.
 */
function _convertPoiEntry(
  entry: DatasetEntry,
  userLat?: number,
  userLng?: number,
): OfflinePoiEntry {
  let distanceFromUser: number | null = null;
  if (userLat != null && userLng != null) {
    distanceFromUser = Math.round(
      haversineDistanceMiles(userLat, userLng, entry.latitude, entry.longitude)
    );
  }

  const display = DATASET_CATEGORY_DISPLAY[entry.category];

  // Extract category-specific metadata
  const metadata: Record<string, any> = {};
  if (entry.campsite_type) metadata.campsite_type = entry.campsite_type;
  if (entry.water_available != null) metadata.water_available = entry.water_available;
  if (entry.permit_required != null) metadata.permit_required = entry.permit_required;
  if (entry.max_capacity != null) metadata.max_capacity = entry.max_capacity;
  if (entry.service_type) metadata.service_type = entry.service_type;
  if (entry.seasonal != null) metadata.seasonal = entry.seasonal;
  if (entry.hours) metadata.hours = entry.hours;
  if (entry.phone) metadata.phone = entry.phone;
  if (entry.hazard_type) metadata.hazard_type = entry.hazard_type;
  if (entry.hazard_severity) metadata.hazard_severity = entry.hazard_severity;
  if (entry.hazard_description) metadata.hazard_description = entry.hazard_description;
  if (entry.recovery_type) metadata.recovery_type = entry.recovery_type;

  return {
    id: entry.id,
    name: entry.name,
    category: entry.category,
    category_label: display?.pluralLabel || entry.category,
    category_color: display?.color || '#78909C',
    category_icon: display?.icon || 'location-outline',
    latitude: entry.latitude,
    longitude: entry.longitude,
    description: entry.description || display?.description || '',
    distance_from_user_miles: distanceFromUser,
    metadata,
    is_offline: true,
  };
}


// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

export const offlineDiscoveryBridge = {

  /**
   * Check if the device is offline and offline data is available.
   * Used by the Discover tab to decide which data source to use.
   */
  shouldUseOfflineData(): boolean {
    if (!_isDeviceOffline()) return false;

    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      if (!offlineExpeditionDbStore.isInitialized()) return false;
      const readiness = offlineExpeditionDbStore.evaluateReadiness();
      return readiness.has_offline_data;
    } catch {
      return false;
    }
  },

  /**
   * Check if the device is currently offline (regardless of data availability).
   */
  isOffline(): boolean {
    return _isDeviceOffline();
  },

  /**
   * Check if offline expedition data exists for the current area.
   */
  hasOfflineDataForArea(lat?: number, lng?: number): boolean {
    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      if (!offlineExpeditionDbStore.isInitialized()) return false;

      if (lat != null && lng != null) {
        return offlineExpeditionDbStore.coversPosition(lat, lng);
      }

      return offlineExpeditionDbStore.getDownloadedCount() > 0;
    } catch {
      return false;
    }
  },

  /**
   * Query the offline database for Discovery-compatible trail data.
   *
   * Phase 6D: Includes corruption protection — validates all entries
   * before returning. Corrupted entries are silently filtered out.
   *
   * @param userLat  User latitude (for distance filtering)
   * @param userLng  User longitude (for distance filtering)
   * @param radiusMiles  Maximum distance from user (default 200)
   * @param categories  Dataset categories to query (default all)
   */
  queryForDiscovery(
    userLat?: number,
    userLng?: number,
    radiusMiles: number = 200,
    categories?: DatasetCategory[],
  ): OfflineDiscoveryResult {
    const now = new Date().toISOString();
    const isOffline = _isDeviceOffline();

    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      if (!offlineExpeditionDbStore.isInitialized()) {
        console.log(`${TAG} Store not initialized`);
        return {
          ...EMPTY_RESULT,
          is_offline: isOffline,
          status_message: 'Offline database not initialized',
          fallback_message: isOffline
            ? 'No offline expedition data found for this area'
            : null,
          queried_at: now,
        };
      }

      const readiness = offlineExpeditionDbStore.evaluateReadiness();
      if (!readiness.has_offline_data) {
        console.log(`${TAG} No offline data available`);
        return {
          ...EMPTY_RESULT,
          is_offline: isOffline,
          status_message: 'No offline expedition data downloaded',
          fallback_message: isOffline
            ? 'No offline expedition data found for this area'
            : null,
          queried_at: now,
        };
      }

      // Check if data covers user area
      const coversArea = userLat != null && userLng != null
        ? offlineExpeditionDbStore.coversPosition(userLat, userLng)
        : true;

      // ── Query trails ──
      const trailQuery: OfflineDatasetQuery = {
        category: 'trails',
        sort_by: 'distance',
        sort_direction: 'asc',
      };
      if (userLat != null && userLng != null) {
        trailQuery.near = {
          latitude: userLat,
          longitude: userLng,
          radius_miles: radiusMiles,
        };
      }

      const trailResult = offlineExpeditionDbStore.query(trailQuery);

      // Phase 6D: Validate entries before conversion
      let invalidTrailCount = 0;
      const trails: OfflineTrailEntry[] = [];
      for (const entry of trailResult.entries) {
        if (_isValidEntry(entry)) {
          try {
            trails.push(_convertTrailEntry(entry, userLat, userLng));
          } catch {
            invalidTrailCount++;
          }
        } else {
          invalidTrailCount++;
        }
      }

      if (invalidTrailCount > 0) {
        console.warn(`${TAG} [6D] Filtered ${invalidTrailCount} invalid trail entries`);
      }

      // Sort trails by match score (highest first)
      trails.sort((a, b) => b.match_score - a.match_score);

      // ── Query POIs (non-trail categories) ──
      const poiCategories = (categories || DATASET_CATEGORIES)
        .filter(c => c !== 'trails');

      const poiQuery: OfflineDatasetQuery = {
        categories: poiCategories,
        sort_by: 'distance',
        sort_direction: 'asc',
      };
      if (userLat != null && userLng != null) {
        poiQuery.near = {
          latitude: userLat,
          longitude: userLng,
          radius_miles: radiusMiles,
        };
      }

      const poiResult = offlineExpeditionDbStore.query(poiQuery);

      // Phase 6D: Validate POI entries
      let invalidPoiCount = 0;
      const pois: OfflinePoiEntry[] = [];
      for (const entry of poiResult.entries) {
        if (_isValidEntry(entry)) {
          try {
            pois.push(_convertPoiEntry(entry, userLat, userLng));
          } catch {
            invalidPoiCount++;
          }
        } else {
          invalidPoiCount++;
        }
      }

      if (invalidPoiCount > 0) {
        console.warn(`${TAG} [6D] Filtered ${invalidPoiCount} invalid POI entries`);
      }

      const totalCount = trails.length + pois.length;
      const allSourceRegions = [
        ...new Set([...trailResult.source_regions, ...poiResult.source_regions]),
      ];

      // Build status message
      let statusMessage: string;
      if (totalCount === 0) {
        statusMessage = 'No offline expedition data within range';
      } else {
        const trailText = trails.length === 1 ? '1 trail' : `${trails.length} trails`;
        const poiText = pois.length === 1 ? '1 point' : `${pois.length} points`;
        statusMessage = `${trailText}, ${poiText} from offline data`;
      }

      console.log(
        `${TAG} Discovery query: ${trails.length} trails, ${pois.length} POIs ` +
        `from ${allSourceRegions.length} region(s) ` +
        `(radius: ${radiusMiles} mi, offline: ${isOffline})`
      );

      return {
        is_offline: isOffline,
        has_offline_data: true,
        covers_user_area: coversArea,
        trails,
        points_of_interest: pois,
        source_regions: allSourceRegions,
        total_count: totalCount,
        status_message: statusMessage,
        fallback_message: totalCount === 0 && isOffline
          ? 'No offline expedition data found for this area'
          : null,
        queried_at: now,
      };
    } catch (e) {
      // Phase 6D: Catch-all protection — never crash Discovery
      console.warn(`${TAG} [6D] Query failed (graceful fallback):`, e);
      return {
        ...EMPTY_RESULT,
        is_offline: isOffline,
        status_message: 'Offline query failed',
        fallback_message: isOffline
          ? 'No offline expedition data found for this area'
          : null,
        queried_at: now,
      };
    }
  },

  /**
   * Get the number of downloaded regions and total entries.
   * Lightweight check for UI badges.
   */
  getOfflineStats(): {
    downloaded_regions: number;
    total_entries: number;
    has_data: boolean;
  } {
    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      if (!offlineExpeditionDbStore.isInitialized()) {
        return { downloaded_regions: 0, total_entries: 0, has_data: false };
      }
      return {
        downloaded_regions: offlineExpeditionDbStore.getDownloadedCount(),
        total_entries: offlineExpeditionDbStore.getTotalEntries(),
        has_data: offlineExpeditionDbStore.getDownloadedCount() > 0,
      };
    } catch {
      return { downloaded_regions: 0, total_entries: 0, has_data: false };
    }
  },
};

