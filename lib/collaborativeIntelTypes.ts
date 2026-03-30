/**
 * ECS Collaborative Expedition Intelligence — Type Definitions (Phase 12)
 * ========================================================================
 *
 * Defines the data structures for community-driven expedition intelligence
 * that allows ECS users to share anonymized field observations such as
 * hazards, trail conditions, campsites, and fuel availability.
 *
 * OBSERVATION TYPES:
 *   1. Hazard
 *   2. Trail Difficulty
 *   3. Water Crossing
 *   4. Campsite
 *   5. Fuel Availability
 *   6. Blocked Route
 *
 * PRIVACY:
 *   All observations are anonymized — no user names, vehicle details,
 *   or account identifiers are stored.
 *
 * OFFLINE:
 *   Observations are cached locally and synced when connectivity returns.
 */

// ── Observation Types ───────────────────────────────────────

export type CollaborativeObservationType =
  | 'hazard'
  | 'trail_difficulty'
  | 'water_crossing'
  | 'campsite'
  | 'fuel_availability'
  | 'blocked_route';

// ── Severity Levels ─────────────────────────────────────────

export type ObservationSeverity = 'low' | 'moderate' | 'high';

// ── Observation Data Model ──────────────────────────────────

/**
 * A shared observation from the collaborative intelligence system.
 */
export interface CollaborativeObservation {
  /** Unique identifier */
  id: string;
  /** Latitude */
  latitude: number;
  /** Longitude */
  longitude: number;
  /** Type of observation */
  observation_type: CollaborativeObservationType;
  /** Short description */
  description: string;
  /** Confidence level (1–5), based on report count */
  confidence_level: number;
  /** Number of users who reported this observation */
  report_count: number;
  /** When this observation was first created */
  created_at: string;
  /** When this observation was last updated */
  updated_at: string;
  /** When this observation expires */
  expires_at: string;
  /** Region hash for spatial bucketing */
  region_hash: string;
  /** Altitude in feet (optional) */
  altitude_ft: number | null;
  /** Severity level (optional) */
  severity: ObservationSeverity | null;
  /** Whether this observation is active */
  is_active: boolean;
  /** Distance from user in km (computed client-side) */
  distance_km?: number;
}

// ── Pending Observation (offline queue) ─────────────────────

/**
 * An observation waiting to be uploaded (offline queue).
 */
export interface PendingObservation {
  /** Local ID */
  localId: string;
  /** Observation data */
  latitude: number;
  longitude: number;
  observation_type: CollaborativeObservationType;
  description: string;
  severity: ObservationSeverity | null;
  altitude_ft: number | null;
  /** When queued */
  queuedAt: string;
  /** Number of upload attempts */
  attempts: number;
}

// ── Nearby Observation Summary ──────────────────────────────

/**
 * Summary of nearby collaborative observations.
 */
export interface NearbyObservationSummary {
  /** Total observations nearby */
  totalCount: number;
  /** Count by type */
  hazardCount: number;
  trailDifficultyCount: number;
  waterCrossingCount: number;
  campsiteCount: number;
  fuelCount: number;
  blockedRouteCount: number;
  /** Most relevant observations (closest, highest confidence) */
  topObservations: CollaborativeObservation[];
  /** Search radius used (km) */
  radiusKm: number;
}

// ── Collaborative Intelligence Output ───────────────────────

/**
 * Complete output from the Collaborative Expedition Intelligence module.
 */
export interface CollaborativeIntelOutput {
  /** Whether the module is active */
  isActive: boolean;
  /** When data was last fetched */
  lastFetchedAt: string | null;
  /** Whether the device is online */
  isOnline: boolean;
  /** Whether data is from cache */
  isCached: boolean;

  /** All nearby observations */
  nearbyObservations: CollaborativeObservation[];
  /** Summary of nearby observations */
  summary: NearbyObservationSummary;

  /** Observations pending upload (offline queue) */
  pendingUploads: PendingObservation[];
  /** Count of pending uploads */
  pendingCount: number;

  /** Route-relevant observations (filtered by proximity to route) */
  routeObservations: CollaborativeObservation[];

  /** Whether a fetch is currently in progress */
  isFetching: boolean;
  /** Last error message (if any) */
  lastError: string | null;
}

// ── Display Constants ───────────────────────────────────────

export const OBSERVATION_TYPE_LABELS: Record<CollaborativeObservationType, string> = {
  hazard: 'Hazard',
  trail_difficulty: 'Trail Difficulty',
  water_crossing: 'Water Crossing',
  campsite: 'Campsite',
  fuel_availability: 'Fuel',
  blocked_route: 'Blocked Route',
};

export const OBSERVATION_TYPE_SHORT_LABELS: Record<CollaborativeObservationType, string> = {
  hazard: 'HAZARD',
  trail_difficulty: 'TRAIL',
  water_crossing: 'WATER',
  campsite: 'CAMP',
  fuel_availability: 'FUEL',
  blocked_route: 'BLOCKED',
};

export const OBSERVATION_TYPE_ICONS: Record<CollaborativeObservationType, string> = {
  hazard: 'warning-outline',
  trail_difficulty: 'trail-sign-outline',
  water_crossing: 'water-outline',
  campsite: 'bonfire-outline',
  fuel_availability: 'speedometer-outline',
  blocked_route: 'close-circle-outline',
};

export const OBSERVATION_TYPE_COLORS: Record<CollaborativeObservationType, string> = {
  hazard: '#EF5350',
  trail_difficulty: '#FF7043',
  water_crossing: '#42A5F5',
  campsite: '#66BB6A',
  fuel_availability: '#FFB300',
  blocked_route: '#AB47BC',
};

export const OBSERVATION_TYPE_BG_COLORS: Record<CollaborativeObservationType, string> = {
  hazard: 'rgba(239,83,80,0.15)',
  trail_difficulty: 'rgba(255,112,67,0.15)',
  water_crossing: 'rgba(66,165,245,0.15)',
  campsite: 'rgba(102,187,106,0.15)',
  fuel_availability: 'rgba(255,179,0,0.15)',
  blocked_route: 'rgba(171,71,188,0.15)',
};

export const CONFIDENCE_LABELS: Record<number, string> = {
  1: 'Unverified',
  2: 'Low',
  3: 'Moderate',
  4: 'High',
  5: 'Confirmed',
};

export const CONFIDENCE_COLORS: Record<number, string> = {
  1: '#8B949E',
  2: '#FFB74D',
  3: '#FFA726',
  4: '#66BB6A',
  5: '#4CAF50',
};

export const SEVERITY_COLORS: Record<ObservationSeverity, string> = {
  low: '#66BB6A',
  moderate: '#FFB300',
  high: '#EF5350',
};

export const SEVERITY_LABELS: Record<ObservationSeverity, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};

/** All observation types for iteration */
export const ALL_OBSERVATION_TYPES: CollaborativeObservationType[] = [
  'hazard',
  'trail_difficulty',
  'water_crossing',
  'campsite',
  'fuel_availability',
  'blocked_route',
];

/** Default search radius (km) */
export const DEFAULT_SEARCH_RADIUS_KM = 15;

/** Maximum observations to display on map */
export const MAX_MAP_MARKERS = 25;

/** Maximum observations to show in list */
export const MAX_LIST_ITEMS = 30;

/** Minimum confidence to show on map (filter low-confidence) */
export const MIN_MAP_CONFIDENCE = 1;

/** Cache duration (ms) — 10 minutes */
export const CACHE_DURATION_MS = 10 * 60 * 1000;

/** Fetch interval (ms) — 5 minutes */
export const FETCH_INTERVAL_MS = 5 * 60 * 1000;

/** Offline queue storage key */
export const OFFLINE_QUEUE_KEY = 'ecs_collab_intel_queue';

/** Cached observations storage key */
export const CACHE_STORAGE_KEY = 'ecs_collab_intel_cache';

