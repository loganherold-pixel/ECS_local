/**
 * ═══════════════════════════════════════════════════════════
 * ECS CROSS-SYSTEM SYNC — Normalized Summary Types
 * ═══════════════════════════════════════════════════════════
 *
 * Integration Pass 1: Defines the canonical summary types that
 * all ECS systems expose for cross-system consumption.
 *
 * These summaries are the ONLY data contract between systems.
 * Widgets and downstream consumers MUST use these summaries
 * instead of reaching into raw provider responses.
 *
 * Update Order (canonical):
 *   1. Provider/device input (BLU, OBD2, network)
 *   2. Store update (normalized service state)
 *   3. Summary object computed
 *   4. Bus publication (ecsBus)
 *   5. Widget/UI update
 *   6. Risk Engine re-evaluation (debounced)
 *   7. Assistant context refresh (debounced)
 *
 * Systems:
 *   - BLU Power          → EcsPowerSummary
 *   - Vehicle Telemetry  → EcsVehicleHealthSummary
 *   - Connectivity Intel → EcsConnectivitySummary
 *   - Remoteness         → EcsRemotenessSummary
 *   - Expedition Risk    → EcsRiskSummary
 *   - Offline Data       → EcsOfflineReadinessSummary
 *   - Route              → EcsRouteSummary
 *   - Loadout            → EcsLoadoutSummary
 *   - Vehicle Profile    → EcsVehicleProfileSummary
 */


// ── System Channel IDs ───────────────────────────────────

/**
 * Canonical channel identifiers for the ECS bus.
 * Each system publishes to exactly one channel.
 */
export type EcsChannel =
  | 'power'
  | 'vehicle_health'
  | 'connectivity'
  | 'remoteness'
  | 'risk'
  | 'offline_readiness'
  | 'route'
  | 'loadout'
  | 'vehicle_profile'
  | 'assistant';

export const ECS_CHANNELS: EcsChannel[] = [
  'power',
  'vehicle_health',
  'connectivity',
  'remoteness',
  'risk',
  'offline_readiness',
  'route',
  'loadout',
  'vehicle_profile',
  'assistant',
];

/**
 * Update priority for each channel.
 * Lower number = updated first in the cascade.
 * Systems at the same priority level update concurrently.
 */
export const ECS_CHANNEL_PRIORITY: Record<EcsChannel, number> = {
  // Tier 1: Raw provider data (updated first)
  power: 1,
  vehicle_health: 1,
  connectivity: 1,
  remoteness: 1,
  route: 1,
  loadout: 1,
  vehicle_profile: 1,
  offline_readiness: 1,
  // Tier 2: Computed aggregates (updated after raw data)
  risk: 2,
  // Tier 3: AI/advisory layer (updated last)
  assistant: 3,
};


// ── Data Freshness ───────────────────────────────────────

/**
 * Freshness state for any summary object.
 * Used for timestamp-aware update handling.
 */
export type EcsFreshness = 'live' | 'recent' | 'stale' | 'unavailable';

/**
 * Base interface for all ECS summaries.
 * Provides timestamp and freshness for staleness detection.
 */
export interface EcsSummaryBase {
  /** ISO timestamp when this summary was computed */
  updated_at: string;
  /** Data freshness state */
  freshness: EcsFreshness;
  /** Whether this system has usable data */
  available: boolean;
}


// ── Power Summary ────────────────────────────────────────

export interface EcsPowerSummary extends EcsSummaryBase {
  has_devices: boolean;
  device_count: number;
  battery_percent: number | null;
  input_watts: number | null;
  output_watts: number | null;
  runtime_minutes: number | null;
  is_sustainable: boolean;
}


// ── Vehicle Health Summary ───────────────────────────────

export interface EcsVehicleHealthSummary extends EcsSummaryBase {
  has_telemetry: boolean;
  engine_status: string;
  battery_voltage: number | null;
  battery_health: string;
  fuel_percent: number | null;
  coolant_temp_f: number | null;
  has_anomaly: boolean;
  anomaly_flags: string[];
}


// ── Connectivity Summary ─────────────────────────────────

export interface EcsConnectivitySummary extends EcsSummaryBase {
  state: string;
  signal_quality: string;
  internet_reachable: boolean;
  offline_cache_ready: boolean;
  operational_readiness: string;
  network_type: string;
}


// ── Remoteness Summary ───────────────────────────────────

export interface EcsRemotenessSummary extends EcsSummaryBase {
  score: number | null;
  tier: string | null;
  engine_running: boolean;
  cache_ready: boolean;
}


// ── Risk Summary ─────────────────────────────────────────

export interface EcsRiskSummary extends EcsSummaryBase {
  risk_score: number;
  operational_status: string;
  primary_risk_factor: string;
  primary_risk_label: string;
  capability_score: number;
  resource_readiness: number;
  connectivity_risk: number;
  isolation_risk: number;
  is_complete: boolean;
  summary_line: string;
}


// ── Offline Readiness Summary ────────────────────────────

export interface EcsOfflineReadinessSummary extends EcsSummaryBase {
  has_data: boolean;
  region_count: number;
  entry_count: number;
  covers_position: boolean;
  covers_route: boolean;
}


// ── Route Summary ────────────────────────────────────────

export interface EcsRouteSummary extends EcsSummaryBase {
  has_active_route: boolean;
  route_name: string | null;
  distance_mi: number | null;
  elevation_gain_ft: number | null;
  waypoint_count: number;
}


// ── Loadout Summary ──────────────────────────────────────

export interface EcsLoadoutSummary extends EcsSummaryBase {
  has_loadout: boolean;
  total_items: number;
  packed_items: number;
  readiness_pct: number;
  total_weight_lbs: number | null;
  is_overweight: boolean;
  critical_missing: number;
}


// ── Vehicle Profile Summary ──────────────────────────────

export interface EcsVehicleProfileSummary extends EcsSummaryBase {
  vehicle_name: string | null;
  vehicle_type: string | null;
  gvwr_lb: number | null;
  has_specs: boolean;
}


// ── Aggregate Summary Map ────────────────────────────────

/**
 * Complete map of all ECS system summaries.
 * This is the canonical cross-system data contract.
 */
export interface EcsSummaryMap {
  power: EcsPowerSummary | null;
  vehicle_health: EcsVehicleHealthSummary | null;
  connectivity: EcsConnectivitySummary | null;
  remoteness: EcsRemotenessSummary | null;
  risk: EcsRiskSummary | null;
  offline_readiness: EcsOfflineReadinessSummary | null;
  route: EcsRouteSummary | null;
  loadout: EcsLoadoutSummary | null;
  vehicle_profile: EcsVehicleProfileSummary | null;
}


// ── Bus Event Types ──────────────────────────────────────

export interface EcsBusEvent {
  channel: EcsChannel;
  timestamp: string;
  source: string;
  /** Prevents re-entrant propagation */
  propagation_id: string;
}

export interface EcsBusSubscription {
  channel: EcsChannel;
  callback: (event: EcsBusEvent) => void;
  /** If set, this subscription will NOT fire during propagation from this source */
  exclude_source?: string;
}


// ── Sync Coordinator State ───────────────────────────────

export type SyncCoordinatorLifecycle =
  | 'idle'
  | 'initializing'
  | 'running'
  | 'suspended'
  | 'stopped';

export interface SyncCoordinatorState {
  lifecycle: SyncCoordinatorLifecycle;
  subscription_count: number;
  last_cascade_at: string | null;
  cascade_count: number;
  channels_active: EcsChannel[];
  channels_stale: EcsChannel[];
  channels_unavailable: EcsChannel[];
}


// ── Companion Summary (Android Auto / CarPlay) ───────────

/**
 * Simplified summary safe for Android Auto / CarPlay consumption.
 * Contains only essential operational data.
 */
export interface EcsCompanionSummary {
  risk_status: string;
  risk_score: number;
  risk_summary: string;
  fuel_percent: number | null;
  power_percent: number | null;
  connectivity: string;
  remoteness: string | null;
  guidance: string | null;
  updated_at: string;
}

