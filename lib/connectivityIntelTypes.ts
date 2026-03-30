/**
 * ═══════════════════════════════════════════════════════════
 * ECS CONNECTIVITY INTELLIGENCE — Phase 3D Types
 * ═══════════════════════════════════════════════════════════
 *
 * Defines the unified signal-awareness and connectivity-state
 * layer for ECS. Separate from BLU power telemetry and Vehicle
 * Telemetry — this service normalizes connection-related signals
 * and exposes them to the Remoteness system, dashboard widgets,
 * and expedition decision layers.
 *
 * Phase 3D additions:
 *   - ConnectivityFreshness type for data freshness tracking
 *   - CONNECTIVITY_FRESHNESS_DISPLAY config
 *   - freshness field added to ConnectivitySummary
 *   - Session version bumped to 4
 *
 * Phase 3C additions:
 *   - OperationalReadinessState for expedition connectivity awareness
 *   - cached_region_available and cached_route_available in summary
 *   - Operational readiness display configuration
 *   - offline_cache provider activated
 *
 * Phase 3B additions:
 *   - network_type added to ConnectivitySummary
 *   - ConnectivityQuality type for quality evaluation
 *   - Quality evaluation constants and thresholds
 *   - Enhanced state display with degraded state
 *
 * Provider Model:
 *   - device_network:      Device cellular/WiFi connectivity (active — Phase 3B live)
 *   - gps_context:         GPS-derived isolation scoring
 *   - offline_cache:       Offline map/data cache readiness (active — Phase 3C)
 *   - future_signal_boost: Future signal booster integration
 *   - future_satellite:    Future satellite communicator integration
 *
 * Connectivity States:
 *   - connected:  Full connectivity, internet reachable
 *   - limited:    Partial connectivity, degraded quality
 *   - degraded:   Connectivity present but unreliable
 *   - offline:    No connectivity at all
 *   - unknown:    State not yet determined
 */

// ── Provider Identifiers ─────────────────────────────────

export type ConnectivityProviderId =
  | 'device_network'
  | 'gps_context'
  | 'offline_cache'
  | 'future_signal_boost'
  | 'future_satellite';

export interface ConnectivityProviderDefinition {
  id: ConnectivityProviderId;
  label: string;
  description: string;
  icon: string;
  /** Whether this provider is currently implemented and active */
  active: boolean;
  /** Whether this provider is coming soon (shown but locked) */
  comingSoon: boolean;
  /** Provider category for grouping */
  category: 'network' | 'context' | 'cache' | 'hardware';
  /** Priority weight (higher = preferred when multiple sources available) */
  priority: number;
}

/**
 * Registry of all supported connectivity providers.
 * Active providers contribute to the connectivity summary.
 * Coming-soon providers are displayed but locked in the UI.
 *
 * Phase 3C: offline_cache now active.
 */
export const CONNECTIVITY_PROVIDERS: ConnectivityProviderDefinition[] = [
  {
    id: 'device_network',
    label: 'Device Network',
    description: 'Cellular and WiFi connectivity from the device',
    icon: 'cellular-outline',
    active: true,
    comingSoon: false,
    category: 'network',
    priority: 100,
  },
  {
    id: 'gps_context',
    label: 'GPS Context',
    description: 'Location-derived isolation and coverage estimation',
    icon: 'navigate-outline',
    active: false,
    comingSoon: false,
    category: 'context',
    priority: 50,
  },
  {
    id: 'offline_cache',
    label: 'Offline Cache',
    description: 'Offline map and expedition data cache readiness',
    icon: 'download-outline',
    active: true,
    comingSoon: false,
    category: 'cache',
    priority: 30,
  },
  {
    id: 'future_signal_boost',
    label: 'Signal Booster',
    description: 'External signal booster or repeater integration',
    icon: 'radio-outline',
    active: false,
    comingSoon: true,
    category: 'hardware',
    priority: 80,
  },
  {
    id: 'future_satellite',
    label: 'Satellite Awareness',
    description: 'Satellite communicator connectivity (Garmin inReach, Zoleo, etc.)',
    icon: 'planet-outline',
    active: false,
    comingSoon: true,
    category: 'hardware',
    priority: 90,
  },
];


// ── Connectivity States ──────────────────────────────────

export type ConnectivityIntelState =
  | 'connected'
  | 'limited'
  | 'degraded'
  | 'offline'
  | 'unknown';

/**
 * Display configuration for each connectivity state.
 */
export const CONNECTIVITY_STATE_DISPLAY: Record<ConnectivityIntelState, {
  label: string;
  color: string;
  icon: string;
  description: string;
}> = {
  connected:  { label: 'CONNECTED',  color: '#4CAF50', icon: 'wifi-outline',           description: 'Full connectivity available' },
  limited:    { label: 'LIMITED',    color: '#FFB300', icon: 'cellular-outline',       description: 'Partial or degraded connectivity' },
  degraded:   { label: 'DEGRADED',   color: '#E67E22', icon: 'warning-outline',        description: 'Connectivity present but unreliable' },
  offline:    { label: 'OFFLINE',    color: '#EF5350', icon: 'cloud-offline-outline',  description: 'No connectivity' },
  unknown:    { label: 'UNKNOWN',    color: '#78909C', icon: 'help-circle-outline',    description: 'Connectivity state not determined' },
};


// ── Connectivity Quality ─────────────────────────────────

/**
 * Phase 3B: Connectivity quality evaluation.
 * Normalized across all providers.
 *
 * strong:      Low latency, stable connection, internet reachable
 * moderate:    Moderate latency or occasional instability
 * weak:        High latency, frequent reconnects, or degraded signal
 * unavailable: No connectivity at all
 * unknown:     Quality not yet determined
 */
export type ConnectivityQuality =
  | 'strong'
  | 'moderate'
  | 'weak'
  | 'unavailable'
  | 'unknown';

/**
 * Phase 3B: Display configuration for connectivity quality.
 */
export const CONNECTIVITY_QUALITY_DISPLAY: Record<ConnectivityQuality, {
  label: string;
  color: string;
  icon: string;
}> = {
  strong:      { label: 'Strong',      color: '#4CAF50', icon: 'wifi' },
  moderate:    { label: 'Moderate',    color: '#FFB300', icon: 'wifi' },
  weak:        { label: 'Weak',        color: '#E67E22', icon: 'wifi' },
  unavailable: { label: 'Unavailable', color: '#EF5350', icon: 'wifi-off' },
  unknown:     { label: 'Unknown',     color: '#78909C', icon: 'wifi' },
};


// ── Connectivity Freshness (Phase 3D) ────────────────────

/**
 * Phase 3D: Connectivity data freshness indicator.
 *
 * Tracks whether the connectivity summary is based on live data,
 * recovering from a signal interruption, stale, or fully offline.
 *
 * States:
 *   - live:       Data is current and actively updating
 *   - recovering: Signal recently returned; validating new data
 *   - stale:      No updates received within the grace window
 *   - offline:    Device is confirmed offline (no network)
 */
export type ConnectivityFreshness =
  | 'live'
  | 'recovering'
  | 'stale'
  | 'offline';

/**
 * Phase 3D: Display configuration for connectivity freshness.
 */
export const CONNECTIVITY_FRESHNESS_DISPLAY: Record<ConnectivityFreshness, {
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
  description: string;
}> = {
  live: {
    label: 'Live',
    shortLabel: 'LIVE',
    color: '#4CAF50',
    icon: 'pulse-outline',
    description: 'Connectivity data is current and actively updating',
  },
  recovering: {
    label: 'Recovering',
    shortLabel: 'RECOVERING',
    color: '#FFB300',
    icon: 'sync-outline',
    description: 'Signal recently returned — validating connectivity',
  },
  stale: {
    label: 'Stale',
    shortLabel: 'STALE',
    color: '#E67E22',
    icon: 'time-outline',
    description: 'No recent connectivity updates — using last known data',
  },
  offline: {
    label: 'Offline',
    shortLabel: 'OFFLINE',
    color: '#EF5350',
    icon: 'cloud-offline-outline',
    description: 'Device is confirmed offline',
  },
};


// ── Operational Readiness State (Phase 3C) ───────────────

/**
 * Phase 3C: Operational readiness state for expedition connectivity awareness.
 *
 * Determined from:
 *   - internet reachability
 *   - network quality
 *   - offline cache readiness
 *   - cached route availability
 *
 * States:
 *   - online_ready:         Internet reachable + good quality + cache available
 *   - offline_ready:        Offline but useful cache exists for current area
 *   - degraded_ready:       Degraded connectivity but cache is available as fallback
 *   - degraded_unprepared:  Degraded connectivity and no useful cache
 *   - offline_unprepared:   Offline and no useful cache — highest risk
 */
export type OperationalReadinessState =
  | 'online_ready'
  | 'offline_ready'
  | 'degraded_ready'
  | 'degraded_unprepared'
  | 'offline_unprepared';

/**
 * Phase 3C: Display configuration for operational readiness states.
 * Designed to be subtle and useful, not alarm-heavy.
 */
export const OPERATIONAL_READINESS_DISPLAY: Record<OperationalReadinessState, {
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
  description: string;
  severity: 'info' | 'caution' | 'warning';
}> = {
  online_ready: {
    label: 'Online & Ready',
    shortLabel: 'Ready',
    color: '#4CAF50',
    icon: 'checkmark-circle-outline',
    description: 'Full connectivity with offline cache available',
    severity: 'info',
  },
  offline_ready: {
    label: 'Offline — Cached',
    shortLabel: 'Cached',
    color: '#2196F3',
    icon: 'cloud-download-outline',
    description: 'Offline but cached maps and data available for this area',
    severity: 'info',
  },
  degraded_ready: {
    label: 'Degraded — Cached',
    shortLabel: 'Degraded',
    color: '#FFB300',
    icon: 'alert-circle-outline',
    description: 'Connectivity degraded but offline cache available as fallback',
    severity: 'caution',
  },
  degraded_unprepared: {
    label: 'Degraded — No Cache',
    shortLabel: 'Unprepared',
    color: '#E67E22',
    icon: 'warning-outline',
    description: 'Connectivity degraded and no offline cache for this area',
    severity: 'warning',
  },
  offline_unprepared: {
    label: 'Offline — No Cache',
    shortLabel: 'Exposed',
    color: '#EF5350',
    icon: 'alert-outline',
    description: 'Offline with no cached data — limited functionality',
    severity: 'warning',
  },
};


// ── Normalized Connectivity Telemetry Schema ─────────────

/**
 * Normalized telemetry from a connectivity provider.
 * All fields are optional — only populated when the active
 * provider or platform supports them.
 */
export interface ConnectivityTelemetry {
  /** Network type: wifi, cellular, ethernet, none, unknown */
  network_type?: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';

  /** Signal strength 0–100 (normalized from provider-specific values) */
  signal_strength?: number;

  /** Signal quality: excellent, good, fair, poor, none */
  signal_quality?: 'excellent' | 'good' | 'fair' | 'poor' | 'none';

  /** Whether internet is actually reachable (ping verified) */
  internet_reachable?: boolean;

  /** Whether offline cache is ready for the current area */
  offline_cache_ready?: boolean;

  /** ISO timestamp of last known online state */
  last_online_at?: string;

  /** Whether GPS fix is available */
  gps_available?: boolean;

  /** Route isolation score 0–100 (higher = more isolated) */
  route_isolation_score?: number;

  /** Cellular carrier name (when available) */
  carrier_name?: string;

  /** Cellular generation: 2g, 3g, 4g, 5g */
  cellular_generation?: '2g' | '3g' | '4g' | '5g';

  /** Number of reconnection attempts since monitoring started */
  reconnect_count?: number;

  /** Latency in milliseconds (when measurable) */
  latency_ms?: number;

  /** Provider that generated this telemetry */
  source_provider?: ConnectivityProviderId;

  /** ISO timestamp when this telemetry was captured */
  captured_at?: string;

  // ── Phase 3C: Offline cache telemetry fields ──

  /** Whether a cached region covers the current/active area */
  cached_region_available?: boolean;

  /** Whether a cached route covers the active route */
  cached_route_available?: boolean;

  /** Number of cached regions on the device */
  cached_region_count?: number;

  /** Total cached tile count */
  cached_tile_count?: number;

  /** Total cached data size in MB */
  cached_size_mb?: number;

  // ── Phase 6A: Offline Expedition Database telemetry fields ──

  /** Whether offline expedition datasets exist on the device */
  expedition_data_cached?: boolean;

  /** Whether expedition data covers the current GPS position */
  expedition_data_covers_position?: boolean;

  /** Whether expedition data covers the active route */
  expedition_data_covers_route?: boolean;

  /** Number of downloaded expedition data regions */
  expedition_data_regions?: number;

  /** Total expedition dataset entries cached */
  expedition_data_entries?: number;
}


// ── Connectivity Summary Object ──────────────────────────

/**
 * The connectivity summary object consumed by dashboard widgets,
 * the Remoteness system, and expedition decision layers.
 *
 * This is the primary output of the Connectivity Intelligence service.
 *
 * Phase 3D additions:
 *   - freshness: Data freshness indicator (live/recovering/stale/offline)
 *
 * Phase 3C additions:
 *   - cached_region_available: Whether a cached region covers the current area
 *   - cached_route_available: Whether a cached route covers the active route
 *   - operational_readiness: Expedition operational readiness state
 *
 * Phase 3B additions:
 *   - network_type: Current network type (wifi/cellular/ethernet/none/unknown)
 *   - quality: Normalized connectivity quality evaluation
 *   - latency_ms: Last measured latency (when available)
 */
export interface ConnectivitySummary {
  /** Current normalized connectivity state */
  connectivity_state: ConnectivityIntelState;

  /** Signal quality assessment */
  signal_quality: 'excellent' | 'good' | 'fair' | 'poor' | 'none' | 'unknown';

  /** Whether internet is reachable */
  internet_reachable: boolean;

  /** Whether offline cache is ready */
  offline_cache_ready: boolean;

  /** ISO timestamp of last known online state */
  last_online_at: string | null;

  /** The provider that is currently driving the summary */
  active_source: ConnectivityProviderId | null;

  /** Number of active providers contributing data */
  active_provider_count: number;

  /** Whether the summary is based on live data or a last-known snapshot */
  is_live: boolean;

  /** ISO timestamp when the summary was last updated */
  updated_at: string;

  // ── Phase 3B additions ──

  /** Current network type (wifi/cellular/ethernet/none/unknown) */
  network_type: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';

  /** Normalized connectivity quality evaluation */
  quality: ConnectivityQuality;

  /** Last measured latency in milliseconds (null if unavailable) */
  latency_ms: number | null;

  // ── Phase 3C additions ──

  /** Whether a cached region covers the current/active area */
  cached_region_available: boolean;

  /** Whether a cached route covers the active route */
  cached_route_available: boolean;

  /** Operational readiness state for expedition awareness */
  operational_readiness: OperationalReadinessState;

  // ── Phase 3D additions ──

  /** Data freshness indicator */
  freshness: ConnectivityFreshness;
}

/**
 * Default connectivity summary (before any provider reports data).
 * Phase 3D: Includes freshness default.
 */
export const DEFAULT_CONNECTIVITY_SUMMARY: ConnectivitySummary = {
  connectivity_state: 'unknown',
  signal_quality: 'unknown',
  internet_reachable: false,
  offline_cache_ready: false,
  last_online_at: null,
  active_source: null,
  active_provider_count: 0,
  is_live: false,
  updated_at: new Date().toISOString(),
  // Phase 3B defaults
  network_type: 'unknown',
  quality: 'unknown',
  latency_ms: null,
  // Phase 3C defaults
  cached_region_available: false,
  cached_route_available: false,
  operational_readiness: 'offline_unprepared',
  // Phase 3D defaults
  freshness: 'offline',
};


// ── Provider Data Entry ──────────────────────────────────

/**
 * Data reported by a single connectivity provider.
 * The service normalizes and merges these into the summary.
 */
export interface ConnectivityProviderData {
  provider_id: ConnectivityProviderId;
  state: ConnectivityIntelState;
  telemetry: ConnectivityTelemetry;
  /** ISO timestamp when this data was reported */
  reported_at: string;
  /** Whether this provider is currently active and reporting */
  is_active: boolean;
}


// ── Persisted Session Metadata ───────────────────────────

/**
 * Metadata persisted to user storage for session restoration.
 */
export interface ConnectivityIntelSession {
  /** Schema version for forward compatibility */
  version: number;
  /** Last known summary snapshot */
  last_summary: ConnectivitySummary;
  /** Active provider IDs at time of persistence */
  active_providers: ConnectivityProviderId[];
  /** Last known telemetry from each provider */
  provider_snapshots: Record<string, ConnectivityProviderData>;
  /** ISO timestamp when session was persisted */
  persisted_at: string;
}

/**
 * Current session schema version.
 * v1: Phase 3A initial
 * v2: Phase 3B (added network_type, quality, latency_ms)
 * v3: Phase 3C (added cached_region_available, cached_route_available, operational_readiness)
 * v4: Phase 3D (added freshness)
 */
export const CONNECTIVITY_INTEL_SESSION_VERSION = 4;


// ── Service State ────────────────────────────────────────

/**
 * Internal state of the Connectivity Intelligence service.
 */
export interface ConnectivityIntelServiceState {
  /** Whether the service has been initialized */
  initialized: boolean;
  /** Whether the service is actively monitoring */
  monitoring: boolean;
  /** Current summary */
  summary: ConnectivitySummary;
  /** Data from each registered provider */
  providers: Map<ConnectivityProviderId, ConnectivityProviderData>;
  /** Session recovery status */
  recovery_status: 'idle' | 'restoring' | 'restored' | 'failed' | 'no_session';
}

