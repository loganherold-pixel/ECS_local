/**
 * ═══════════════════════════════════════════════════════════
 * ECS OFFLINE EXPEDITION MODE — Type Definitions
 * ═══════════════════════════════════════════════════════════
 *
 * Defines the data structures for the unified Offline Expedition
 * Mode system that makes ECS reliable and useful even when users
 * lose cellular service or operate in fully remote environments.
 *
 * Connectivity States:
 *   Online         — Full connectivity, all services available
 *   Limited        — Degraded connectivity, blend live + cached
 *   Offline        — No connectivity, cached data only
 *   Reconnecting   — Transitioning back to online
 *
 * Expedition Pack:
 *   A downloadable bundle of expedition data for offline use,
 *   including route geometry, map region reference, notes,
 *   checkpoints, vehicle context, and risk/remoteness summaries.
 *
 * Dashboard Adaptation:
 *   Each dashboard system has an offline behavior profile that
 *   determines how it renders when connectivity is unavailable.
 *
 * Intelligence Adaptation:
 *   Offline intelligence messages are calm, tactical, and
 *   avoid spamming connectivity notices repeatedly.
 */


// ── Connectivity State ──────────────────────────────────────

/**
 * Primary connectivity state for the Offline Expedition Mode.
 *
 * online:        Full connectivity — all services available
 * limited:       Degraded connectivity — blend live + cached data
 * offline:       No connectivity — cached data only
 * reconnecting:  Transitioning from offline back to online
 */
export type OfflineConnectivityState =
  | 'online'
  | 'limited'
  | 'offline'
  | 'reconnecting';

/**
 * Display configuration for connectivity states.
 * Calm, professional labels — no panic-style alerts.
 */
export const CONNECTIVITY_STATE_DISPLAY: Record<OfflineConnectivityState, {
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
  description: string;
  bannerVisible: boolean;
}> = {
  online: {
    label: 'Online',
    shortLabel: 'ONLINE',
    color: '#4CAF50',
    icon: 'wifi-outline',
    description: 'Full connectivity — all services available',
    bannerVisible: false,
  },
  limited: {
    label: 'Limited Connectivity',
    shortLabel: 'LIMITED',
    color: '#FFB300',
    icon: 'cellular-outline',
    description: 'Degraded signal — using cached data as fallback',
    bannerVisible: true,
  },
  offline: {
    label: 'Offline Mode',
    shortLabel: 'OFFLINE',
    color: '#78909C',
    icon: 'cloud-offline-outline',
    description: 'No connectivity — using saved expedition data',
    bannerVisible: true,
  },
  reconnecting: {
    label: 'Reconnecting',
    shortLabel: 'SYNC',
    color: '#42A5F5',
    icon: 'sync-outline',
    description: 'Restoring connectivity — syncing data',
    bannerVisible: true,
  },
};


// ── Expedition Pack ─────────────────────────────────────────

/**
 * An expedition pack is a downloadable bundle of expedition data
 * that can be used offline. Users can deliberately download a trip
 * before departure.
 */
export interface ExpeditionPack {
  /** Unique pack identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Associated expedition ID (if from an active expedition) */
  expedition_id: string | null;
  /** Associated route ID */
  route_id: string | null;
  /** Vehicle profile ID */
  vehicle_id: string | null;
  /** Vehicle name for display */
  vehicle_name: string | null;

  // ── Route Data ──
  /** Route geometry (array of lat/lng points) */
  route_geometry: Array<{ lat: number; lng: number; ele?: number }>;
  /** Route total distance in miles */
  route_distance_mi: number | null;
  /** Route elevation gain in feet */
  route_elevation_gain_ft: number | null;
  /** Waypoints along the route */
  waypoints: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    type: string;
    notes?: string;
  }>;

  // ── Map Region ──
  /** Map region bounds for offline tile reference */
  map_bounds: {
    min_lat: number;
    max_lat: number;
    min_lng: number;
    max_lng: number;
  } | null;
  /** Whether offline map tiles are cached for this region */
  map_tiles_cached: boolean;
  /** Offline expedition data region ID (if linked) */
  offline_region_id: string | null;

  // ── Expedition Notes ──
  /** User notes for the expedition */
  notes: string;
  /** Saved checkpoints / camps */
  checkpoints: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    type: 'camp' | 'resupply' | 'waypoint' | 'poi';
    notes?: string;
  }>;

  // ── Vehicle Context ──
  /** Key vehicle setup data */
  vehicle_context: {
    vehicle_type: string | null;
    drivetrain: string | null;
    tire_size: string | null;
    gvwr_lb: number | null;
    build_weight_lb: number | null;
    capability_tier: string | null;
  } | null;

  // ── Risk / Remoteness Summary ──
  /** Pre-computed remoteness summary */
  remoteness_summary: {
    avg_score: number;
    max_score: number;
    tier: string;
  } | null;
  /** Pre-computed risk summary */
  risk_summary: {
    level: string;
    score: number;
    primary_factor: string;
  } | null;

  // ── Resource Tracking ──
  /** Starting fuel level (%) */
  start_fuel_pct: number | null;
  /** Starting water level (gal) */
  start_water_gal: number | null;
  /** Starting power level (%) */
  start_power_pct: number | null;

  // ── Metadata ──
  /** ISO timestamp when pack was created */
  created_at: string;
  /** ISO timestamp when pack was last updated */
  updated_at: string;
  /** Estimated pack size in KB */
  size_kb: number;
  /** Pack version */
  version: number;
}


// ── Dashboard System Offline Behavior ───────────────────────

/**
 * Offline behavior profile for a dashboard system.
 * Determines how each system renders when connectivity is unavailable.
 */
export type SystemOfflineBehavior =
  | 'fully_available'    // System works fully offline (GPS, OBD via BT)
  | 'last_known'         // Shows last known data with timestamp
  | 'cached_data'        // Uses cached/downloaded data
  | 'local_only'         // Only local device data (no network needed)
  | 'degraded'           // Partially available with limitations
  | 'unavailable';       // Requires connectivity, show placeholder

/**
 * Dashboard system offline profile.
 */
export interface SystemOfflineProfile {
  /** System identifier */
  system_id: string;
  /** Display name */
  name: string;
  /** Offline behavior */
  behavior: SystemOfflineBehavior;
  /** Whether the system uses local telemetry (BT, GPS) */
  uses_local_telemetry: boolean;
  /** Whether the system has cached data available */
  has_cached_data: boolean;
  /** Last data update timestamp (ISO) */
  last_updated: string | null;
  /** Human-readable staleness label */
  staleness_label: string | null;
  /** Whether data is considered stale */
  is_stale: boolean;
  /** Short status message for the system */
  status_message: string;
}

/**
 * Known dashboard systems and their default offline behaviors.
 */
export const DASHBOARD_SYSTEM_DEFAULTS: Record<string, {
  name: string;
  default_behavior: SystemOfflineBehavior;
  uses_local_telemetry: boolean;
  stale_threshold_minutes: number;
}> = {
  gps_position: {
    name: 'GPS Position',
    default_behavior: 'fully_available',
    uses_local_telemetry: true,
    stale_threshold_minutes: 1,
  },
  vehicle_telemetry: {
    name: 'Vehicle Telemetry',
    default_behavior: 'fully_available',
    uses_local_telemetry: true,
    stale_threshold_minutes: 5,
  },
  power_system: {
    name: 'Power System',
    default_behavior: 'fully_available',
    uses_local_telemetry: true,
    stale_threshold_minutes: 5,
  },
  weather: {
    name: 'Weather',
    default_behavior: 'last_known',
    uses_local_telemetry: false,
    stale_threshold_minutes: 60,
  },
  remoteness: {
    name: 'Remoteness',
    default_behavior: 'cached_data',
    uses_local_telemetry: false,
    stale_threshold_minutes: 30,
  },
  expedition_risk: {
    name: 'Expedition Risk',
    default_behavior: 'degraded',
    uses_local_telemetry: false,
    stale_threshold_minutes: 15,
  },
  route_navigation: {
    name: 'Route Navigation',
    default_behavior: 'cached_data',
    uses_local_telemetry: true,
    stale_threshold_minutes: 0,
  },
  terrain_risk: {
    name: 'Terrain Risk',
    default_behavior: 'cached_data',
    uses_local_telemetry: false,
    stale_threshold_minutes: 30,
  },
  discovery: {
    name: 'Discovery',
    default_behavior: 'cached_data',
    uses_local_telemetry: false,
    stale_threshold_minutes: 120,
  },
  dispatch: {
    name: 'Dispatch',
    default_behavior: 'unavailable',
    uses_local_telemetry: false,
    stale_threshold_minutes: 0,
  },
  ai_advisory: {
    name: 'AI Advisory',
    default_behavior: 'unavailable',
    uses_local_telemetry: false,
    stale_threshold_minutes: 0,
  },
  loadout: {
    name: 'Loadout',
    default_behavior: 'local_only',
    uses_local_telemetry: false,
    stale_threshold_minutes: 0,
  },
  vehicle_config: {
    name: 'Vehicle Config',
    default_behavior: 'local_only',
    uses_local_telemetry: false,
    stale_threshold_minutes: 0,
  },
};


// ── Offline Intelligence Messages ───────────────────────────

/**
 * Offline intelligence message — calm, tactical advisory.
 */
export interface OfflineIntelMessage {
  /** Unique message key for deduplication */
  key: string;
  /** Message text */
  message: string;
  /** Message category */
  category: 'connectivity' | 'data' | 'system' | 'resource' | 'navigation' | 'safety';
  /** Severity level */
  severity: 'info' | 'advisory' | 'caution';
  /** Icon name (Ionicons) */
  icon: string;
  /** Display color */
  color: string;
  /** ISO timestamp */
  timestamp: string;
  /** Whether this message has been shown before (for dedup) */
  shown: boolean;
  /** Cooldown period before showing again (ms) */
  cooldown_ms: number;
}

/**
 * Cooldown periods for different message categories.
 * Prevents spamming the same type of notice repeatedly.
 */
export const MESSAGE_COOLDOWNS: Record<string, number> = {
  connectivity_change: 120_000,    // 2 minutes
  data_staleness: 300_000,         // 5 minutes
  system_status: 180_000,          // 3 minutes
  resource_warning: 60_000,        // 1 minute
  navigation_info: 120_000,        // 2 minutes
  safety_notice: 30_000,           // 30 seconds
};


// ── Sync State ──────────────────────────────────────────────

/**
 * Sync state for reconnection behavior.
 */
export interface SyncState {
  /** Whether sync is in progress */
  syncing: boolean;
  /** Number of items pending sync */
  pending_count: number;
  /** Number of items successfully synced */
  synced_count: number;
  /** Number of items that failed to sync */
  failed_count: number;
  /** Whether there are offline edits to preserve */
  has_offline_edits: boolean;
  /** ISO timestamp of last successful sync */
  last_sync_at: string | null;
  /** Human-readable sync status */
  status_message: string;
  /** Whether sync completed successfully */
  sync_complete: boolean;
}


// ── Offline Mode State ──────────────────────────────────────

/**
 * Complete state of the Offline Expedition Mode system.
 */
export interface OfflineExpeditionModeState {
  /** Whether the system has been initialized */
  initialized: boolean;
  /** Current connectivity state */
  connectivity_state: OfflineConnectivityState;
  /** Previous connectivity state (for transition detection) */
  previous_state: OfflineConnectivityState | null;
  /** ISO timestamp of last state change */
  state_changed_at: string | null;
  /** Whether we're in a state transition */
  in_transition: boolean;

  // ── Expedition Packs ──
  /** Downloaded expedition packs */
  packs: ExpeditionPack[];
  /** Active pack ID (currently in use) */
  active_pack_id: string | null;
  /** Whether a pack download is in progress */
  downloading_pack: boolean;

  // ── Dashboard Profiles ──
  /** Current offline profiles for dashboard systems */
  system_profiles: SystemOfflineProfile[];

  // ── Intelligence ──
  /** Active offline intelligence messages */
  messages: OfflineIntelMessage[];
  /** Message history for cooldown tracking */
  message_history: Record<string, number>; // key → last shown timestamp

  // ── Sync ──
  /** Current sync state */
  sync_state: SyncState;

  // ── Metadata ──
  /** Total offline data size in MB */
  total_offline_data_mb: number;
  /** Whether offline data covers current position */
  covers_position: boolean;
  /** Whether offline data covers active route */
  covers_route: boolean;
  /** ISO timestamp of last evaluation */
  evaluated_at: string;
}


// ── Session Persistence ─────────────────────────────────────

export interface OfflineExpeditionModeSession {
  version: number;
  packs: ExpeditionPack[];
  active_pack_id: string | null;
  message_history: Record<string, number>;
  last_sync_at: string | null;
  persisted_at: string;
}

export const OFFLINE_MODE_SESSION_VERSION = 1;


// ── Default Factories ───────────────────────────────────────

export function createDefaultOfflineModeState(): OfflineExpeditionModeState {
  return {
    initialized: false,
    connectivity_state: 'online',
    previous_state: null,
    state_changed_at: null,
    in_transition: false,
    packs: [],
    active_pack_id: null,
    downloading_pack: false,
    system_profiles: [],
    messages: [],
    message_history: {},
    sync_state: {
      syncing: false,
      pending_count: 0,
      synced_count: 0,
      failed_count: 0,
      has_offline_edits: false,
      last_sync_at: null,
      status_message: 'Idle',
      sync_complete: false,
    },
    total_offline_data_mb: 0,
    covers_position: false,
    covers_route: false,
    evaluated_at: new Date().toISOString(),
  };
}

export function createDefaultSyncState(): SyncState {
  return {
    syncing: false,
    pending_count: 0,
    synced_count: 0,
    failed_count: 0,
    has_offline_edits: false,
    last_sync_at: null,
    status_message: 'Idle',
    sync_complete: false,
  };
}

