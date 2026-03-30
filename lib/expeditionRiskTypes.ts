/**
 * ═══════════════════════════════════════════════════════════
 * ECS EXPEDITION RISK ENGINE — Phase 4A/4B/4C/4D/4E Types
 * ═══════════════════════════════════════════════════════════
 *
 * Defines the normalized risk input model, evaluation schema,
 * operational status model, and risk summary object for the
 * centralized Expedition Risk Engine.
 *
 * The Risk Engine aggregates signals from:
 *   - Vehicle configuration & health
 *   - Loadout system
 *   - Vehicle Telemetry
 *   - Connectivity Intelligence
 *   - Remoteness system
 *   - Route navigation data
 *   - BLU Power Telemetry
 *   - Consumables system
 *
 * Input Categories:
 *   - vehicle_capability:   Vehicle specs, weight, GVWR margin,
 *                           drivetrain, tires, lift, ground clearance,
 *                           weight class, capability tier, load balance
 *   - vehicle_health:       Telemetry, engine, battery, fuel, coolant,
 *                           anomaly detection, telemetry freshness
 *   - expedition_resources: Water, fuel reserves, power, loadout,
 *                           BLU live telemetry, fuel/water capacity,
 *                           resource freshness, resource sufficiency
 *   - route_difficulty:     Terrain complexity, elevation, distance,
 *                           trail difficulty rating, route challenge score,
 *                           estimated duration, difficulty-vs-capability delta
 *   - remoteness:           Isolation tier, connectivity state,
 *                           route isolation, distance from services
 *   - connectivity_status:  Network, cache readiness, freshness,
 *                           operational readiness state, signal quality
 *
 * Evaluation Outputs:
 *   - risk_score:           Composite 0–100 (higher = more risk)
 *   - capability_score:     Vehicle readiness 0–100 (higher = better)
 *   - health_score:         Vehicle health 0–100 (higher = better)
 *   - resource_readiness:   Resource sufficiency 0–100 (higher = better)
 *   - connectivity_risk:    Connectivity exposure 0–100 (higher = more risk)
 *   - isolation_risk:       Isolation exposure 0–100 (higher = more risk)
 *   - route_difficulty_score: Route challenge 0–100 (higher = harder)
 *   - resource_route_balance: Resource vs route match 0–100 (higher = better)
 *
 * Operational Status:
 *   - optimal:   All systems nominal, low risk
 *   - caution:   Minor concerns, manageable risk
 *   - elevated:  Significant concerns, increased risk
 *   - critical:  Serious issues, high risk
 *
 * Phase 4E additions:
 *   - Finalized risk scoring model with balanced 7-factor weighting
 *   - Operational status stabilization (hysteresis band)
 *   - health_score exposed as separate sub-score
 *   - Production-ready risk evaluation cycle
 *   - Dashboard Risk Indicator widget
 *   - Session version bumped to 4
 */





// ── Risk Input Categories ────────────────────────────────

export type RiskInputCategory =
  | 'vehicle_capability'
  | 'vehicle_health'
  | 'expedition_resources'
  | 'route_difficulty'
  | 'remoteness'
  | 'connectivity_status';

/**
 * Availability state for each input category.
 * Allows the engine to operate with partial data.
 *
 * available:    Data is current and usable
 * stale:        Data exists but may be outdated
 * unavailable:  No data available for this category
 * error:        Data source encountered an error
 */
export type RiskInputAvailability =
  | 'available'
  | 'stale'
  | 'unavailable'
  | 'error';


// ── Vehicle Weight Class ─────────────────────────────────

/**
 * Weight class derived from GVWR.
 * Used for capability scoring and terrain compatibility.
 */
export type VehicleWeightClass =
  | 'light'        // GVWR < 5,500 lbs (Class 1)
  | 'medium'       // GVWR 5,500–7,500 lbs (Class 2a)
  | 'heavy'        // GVWR 7,500–10,000 lbs (Class 2b)
  | 'super_heavy'  // GVWR > 10,000 lbs (Class 3+)
  | 'unknown';

/**
 * Capability tier from tires/lift configuration.
 * Sourced from tiresLiftStore.getCapabilityTier().
 */
export type VehicleCapabilityTier =
  | 'stock'
  | 'mild'
  | 'moderate'
  | 'aggressive'
  | 'extreme'
  | 'unknown';

/**
 * Weight distribution stability classification.
 * Sourced from weightEngine.calculateCG().
 */
export type WeightDistributionStability =
  | 'balanced'
  | 'moderate_rear'
  | 'extreme_rear'
  | 'unknown';


// ── Phase 4C: Operational Connectivity State ─────────────

/**
 * Phase 4C: Operational connectivity state for risk weighting.
 *
 * Maps from Connectivity Intelligence operational readiness
 * into risk-weighted categories.
 *
 * States:
 *   - online_ready:         Full connectivity + cache available → lowest risk
 *   - offline_ready:        Offline but useful cache exists → moderate risk
 *   - degraded_ready:       Degraded connectivity + cache fallback → moderate-high risk
 *   - degraded_unprepared:  Degraded connectivity, no cache → high risk
 *   - offline_unprepared:   Offline, no cache → highest risk
 */
export type OperationalConnectivityState =
  | 'online_ready'
  | 'offline_ready'
  | 'degraded_ready'
  | 'degraded_unprepared'
  | 'offline_unprepared';

/**
 * Phase 4C: Risk weight mapping for operational connectivity states.
 * Higher = more risk. Used by _computeConnectivityRisk().
 */
export const OPERATIONAL_CONNECTIVITY_RISK_WEIGHTS: Record<OperationalConnectivityState, number> = {
  online_ready: 5,
  offline_ready: 30,
  degraded_ready: 40,
  degraded_unprepared: 65,
  offline_unprepared: 85,
};


// ── Normalized Risk Inputs ───────────────────────────────

export interface VehicleCapabilityInput {
  availability: RiskInputAvailability;
  /** Whether vehicle specs (base weight, GVWR) are configured */
  has_specs: boolean;
  /** Payload margin in lbs (positive = under GVWR) */
  payload_margin_lb: number | null;
  /** Payload margin as percentage of GVWR */
  payload_margin_pct: number | null;
  /** Whether the vehicle is overweight */
  is_overweight: boolean;
  /** Build weight in lbs */
  build_weight_lb: number | null;
  /** GVWR in lbs */
  gvwr_lb: number | null;

  // ── Phase 4B: Expanded Vehicle Capability ──────────────

  /** Vehicle type from wizard config (truck, jeep, suv_van, car_crossover) */
  vehicle_type: string | null;
  /** Drivetrain type inferred from vehicle profile */
  drivetrain: '4wd' | '2wd' | 'awd' | 'unknown';
  /** Tire diameter in inches (0 = stock/unknown) */
  tire_size_inches: number;
  /** Suspension lift in inches (0 = stock) */
  suspension_lift_inches: number;
  /** Estimated ground clearance delta from stock (inches) */
  ground_clearance_delta_inches: number;
  /** Vehicle weight class derived from GVWR */
  weight_class: VehicleWeightClass;
  /** Capability tier from tires/lift combo */
  capability_tier: VehicleCapabilityTier;

  // ── Phase 4B: Load Balance ─────────────────────────────

  /** Total cargo/items weight in lbs */
  items_weight_lb: number;
  /** Weight distribution stability */
  weight_distribution: WeightDistributionStability;
  /** Rear axle load percentage (0–100) */
  rear_axle_pct: number | null;
  /** Whether weight distribution is concerning */
  load_imbalanced: boolean;
}

export interface VehicleHealthInput {
  availability: RiskInputAvailability;
  /** Whether live vehicle telemetry is connected */
  has_live_telemetry: boolean;
  /** Engine status: running, idle, off, unknown */
  engine_status: 'running' | 'idle' | 'off' | 'unknown';
  /** Battery voltage (null if unavailable) */
  battery_voltage: number | null;
  /** Battery health assessment */
  battery_health: 'good' | 'fair' | 'low' | 'critical' | 'unknown';
  /** Fuel level percentage (0–100) */
  fuel_percent: number | null;
  /** Whether fuel is critically low (<15%) */
  fuel_critical: boolean;

  // ── Phase 4B: Expanded Vehicle Health ──────────────────

  /** Coolant temperature in °F (null if unavailable) */
  coolant_temp_f: number | null;
  /** Whether coolant temperature is abnormally high (>230°F) */
  coolant_high: boolean;
  /** Whether coolant temperature is in warning range (220–230°F) */
  coolant_warning: boolean;
  /** Telemetry data freshness */
  telemetry_freshness: 'live' | 'reconnecting' | 'stale' | 'disconnected' | 'last_known';
  /** Whether any telemetry anomaly has been detected */
  has_anomaly: boolean;
  /** List of active anomaly flags for diagnostics */
  anomaly_flags: string[];
  /** Whether this reading is suppressed due to spike detection */
  spike_suppressed: boolean;
}


export interface ExpeditionResourcesInput {
  availability: RiskInputAvailability;
  /** Whether an active expedition exists */
  has_active_expedition: boolean;
  /** Fuel remaining as percentage (0–100) */
  fuel_percent: number | null;
  /** Estimated fuel range in miles */
  fuel_range_mi: number | null;
  /** Water remaining in gallons */
  water_gal: number | null;
  /** Estimated water autonomy in days */
  water_autonomy_days: number | null;
  /** Power remaining as percentage (0–100) */
  power_percent: number | null;
  /** Estimated power runtime in hours */
  power_runtime_hrs: number | null;
  /** Loadout readiness percentage (0–100) */
  loadout_readiness_pct: number | null;
  /** Number of critical items missing */
  critical_items_missing: number;

  // ── Phase 4D: Expanded Resource Signals ─────────────────

  /** Fuel tank capacity in gallons (null if not configured) */
  fuel_capacity_gal: number | null;
  /** Water capacity in gallons (null if not configured) */
  water_capacity_gal: number | null;
  /** Power storage capacity in Wh (null if not configured) */
  power_capacity_wh: number | null;
  /** Whether BLU live telemetry is connected */
  has_blu_telemetry: boolean;
  /** BLU battery state of charge (0–100, null if unavailable) */
  blu_battery_percent: number | null;
  /** BLU input watts (solar + charging, null if unavailable) */
  blu_input_watts: number | null;
  /** BLU output watts (load, null if unavailable) */
  blu_output_watts: number | null;
  /** BLU estimated runtime remaining in minutes (null if unavailable) */
  blu_runtime_minutes: number | null;
  /** Whether BLU power is sustainable (input >= output) */
  blu_power_sustainable: boolean;
  /** Resource data freshness */
  resource_freshness: 'live' | 'profile' | 'stale' | 'unavailable';
  /** Whether fuel is below minimum threshold (<25%) */
  fuel_low: boolean;
  /** Whether water is below minimum threshold (<2 gal) */
  water_low: boolean;
  /** Whether power runtime is limited (<2 hrs) */
  power_limited: boolean;
}

export interface RouteDifficultyInput {
  availability: RiskInputAvailability;
  /** Whether an active route is loaded */
  has_active_route: boolean;
  /** Total route distance in miles */
  total_distance_mi: number | null;
  /** Elevation gain in feet */
  elevation_gain_ft: number | null;
  /** Terrain complexity tier */
  terrain_complexity: 'low' | 'medium' | 'high' | null;
  /** Number of waypoints */
  waypoint_count: number;
  /** Whether GPS fix is available */
  has_gps_fix: boolean;

  // ── Phase 4D: Expanded Route Difficulty Signals ─────────

  /**
   * Trail difficulty rating (1–5 scale).
   * 1 = paved/easy, 2 = gravel, 3 = moderate trail,
   * 4 = difficult trail, 5 = extreme/technical.
   * null if not rated.
   */
  trail_difficulty_rating: number | null;
  /** Normalized route challenge score (0–100, higher = harder) */
  route_challenge_score: number;
  /** Estimated route duration in hours (null if unknown) */
  estimated_duration_hrs: number | null;
  /** Elevation gain per mile (ft/mi, null if unknown) */
  elevation_gain_per_mi: number | null;
  /**
   * Delta between route difficulty and vehicle capability.
   * Positive = route exceeds capability (risk increases).
   * Negative = vehicle exceeds route demands (risk decreases).
   * null if either input is unavailable.
   */
  difficulty_vs_capability_delta: number | null;
  /** Whether route difficulty exceeds vehicle capability */
  route_exceeds_capability: boolean;
}


export interface RemotenessInput {
  availability: RiskInputAvailability;
  /** Remoteness score (0–100, smoothed) */
  remoteness_score: number | null;
  /** Remoteness tier label */
  remoteness_tier: string | null;
  /** Whether remoteness engine is running */
  engine_running: boolean;

  // ── Phase 4C: Expanded Remoteness Signals ──────────────

  /** Raw (unsmoothed) remoteness score (0–100) */
  raw_score: number | null;
  /** Tier display color from remoteness system */
  tier_color: string | null;
  /** Route isolation score from remoteness signals (0–100) */
  route_isolation_score: number | null;
  /** Estimated distance from nearest services in miles (null if unknown) */
  distance_from_services_mi: number | null;
  /** Elevation signal contribution to remoteness score */
  elevation_signal_score: number;
  /** Connectivity signal contribution to remoteness score */
  connectivity_signal_score: number;
  /** Speed nuance signal contribution to remoteness score */
  speed_signal_score: number;
  /** Sustained speed in mph from remoteness speed analysis */
  sustained_speed_mph: number | null;
  /** Whether offline cache is ready (from remoteness connectivity resolution) */
  cache_ready: boolean;
  /** Data freshness from remoteness connectivity resolution */
  remoteness_freshness: string;
}

export interface ConnectivityStatusInput {
  availability: RiskInputAvailability;
  /** Current connectivity state */
  connectivity_state: 'connected' | 'limited' | 'degraded' | 'offline' | 'unknown';
  /** Whether internet is reachable */
  internet_reachable: boolean;
  /** Whether offline cache is ready */
  offline_cache_ready: boolean;
  /** Whether cached region covers current area */
  cached_region_available: boolean;
  /** Whether cached route covers active route */
  cached_route_available: boolean;
  /** Operational readiness state */
  operational_readiness: string;
  /** Data freshness */
  freshness: 'live' | 'recovering' | 'stale' | 'offline';

  // ── Phase 4C: Expanded Connectivity Signals ────────────

  /** Signal quality assessment from Connectivity Intelligence */
  signal_quality: 'excellent' | 'good' | 'fair' | 'poor' | 'none' | 'unknown';
  /** ISO timestamp of last known online state */
  last_online_at: string | null;
  /** Network type: wifi, cellular, ethernet, none, unknown */
  network_type: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';
  /** Normalized connectivity quality */
  quality: 'strong' | 'moderate' | 'weak' | 'unavailable' | 'unknown';
  /** Last measured latency in milliseconds (null if unavailable) */
  latency_ms: number | null;
  /**
   * Phase 4C: Operational connectivity state for risk weighting.
   * Maps from operational_readiness into a typed risk category.
   */
  operational_connectivity_state: OperationalConnectivityState;
  /** Hours since last online (null if currently online or unknown) */
  hours_since_online: number | null;
  /** Whether the device is in a recovery window after reconnect */
  is_recovering: boolean;
}

/**
 * Complete set of normalized risk inputs.
 * All categories are always present; availability indicates data quality.
 */
export interface RiskInputSnapshot {
  vehicle_capability: VehicleCapabilityInput;
  vehicle_health: VehicleHealthInput;
  expedition_resources: ExpeditionResourcesInput;
  route_difficulty: RouteDifficultyInput;
  remoteness: RemotenessInput;
  connectivity_status: ConnectivityStatusInput;
  /** ISO timestamp when this snapshot was captured */
  captured_at: string;
}


// ── Risk Evaluation Outputs ──────────────────────────────

/**
 * Operational status model for expedition risk.
 *
 * optimal:   All systems nominal, low risk
 * caution:   Minor concerns, manageable risk
 * elevated:  Significant concerns, increased risk
 * critical:  Serious issues, high risk
 */
export type OperationalStatus =
  | 'optimal'
  | 'caution'
  | 'elevated'
  | 'critical';

/**
 * Display configuration for operational status.
 */
export const OPERATIONAL_STATUS_DISPLAY: Record<OperationalStatus, {
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
  description: string;
}> = {
  optimal: {
    label: 'Optimal',
    shortLabel: 'OPT',
    color: '#4CAF50',
    icon: 'checkmark-circle-outline',
    description: 'All systems nominal — low expedition risk',
  },
  caution: {
    label: 'Caution',
    shortLabel: 'CTN',
    color: '#FFB300',
    icon: 'alert-circle-outline',
    description: 'Minor concerns detected — manageable risk',
  },
  elevated: {
    label: 'Elevated',
    shortLabel: 'ELV',
    color: '#E67E22',
    icon: 'warning-outline',
    description: 'Significant concerns — increased expedition risk',
  },
  critical: {
    label: 'Critical',
    shortLabel: 'CRT',
    color: '#EF5350',
    icon: 'alert-outline',
    description: 'Serious issues detected — high expedition risk',
  },
};

/**
 * Primary risk factor — the single most significant risk contributor.
 *
 * Phase 4C additions:
 *   - offline_unprepared: Offline with no cache — highest connectivity risk
 *   - degraded_unprepared: Degraded connectivity, no cache fallback
 *   - deep_isolation: Deep remote or extreme remoteness tier
 *
 * Phase 4D additions:
 *   - resource_depleted: Critical resource levels (fuel/water/power)
 *   - route_capability_mismatch: Route difficulty exceeds vehicle capability
 *   - power_unsustainable: BLU output exceeds input with low battery
 */
export type PrimaryRiskFactor =
  | 'vehicle_overweight'
  | 'fuel_critical'
  | 'water_critical'
  | 'power_critical'
  | 'no_connectivity'
  | 'high_remoteness'
  | 'terrain_difficulty'
  | 'vehicle_health'
  | 'loadout_incomplete'
  | 'no_route'
  | 'multiple_concerns'
  | 'offline_unprepared'
  | 'degraded_unprepared'
  | 'deep_isolation'
  | 'resource_depleted'
  | 'route_capability_mismatch'
  | 'power_unsustainable'
  | 'none';

/**
 * Display labels for primary risk factors.
 */
export const RISK_FACTOR_LABELS: Record<PrimaryRiskFactor, string> = {
  vehicle_overweight: 'Vehicle Overweight',
  fuel_critical: 'Fuel Critical',
  water_critical: 'Water Critical',
  power_critical: 'Power Critical',
  no_connectivity: 'No Connectivity',
  high_remoteness: 'High Remoteness',
  terrain_difficulty: 'Terrain Difficulty',
  vehicle_health: 'Vehicle Health',
  loadout_incomplete: 'Loadout Incomplete',
  no_route: 'No Route Loaded',
  multiple_concerns: 'Multiple Concerns',
  offline_unprepared: 'Offline \u2014 No Cache',
  degraded_unprepared: 'Degraded \u2014 No Cache',
  deep_isolation: 'Deep Isolation',
  resource_depleted: 'Resources Depleted',
  route_capability_mismatch: 'Route Exceeds Capability',
  power_unsustainable: 'Power Unsustainable',
  none: 'No Concerns',
};



// ── Risk Evaluation Result ───────────────────────────────

export interface RiskEvaluation {
  /**
   * Composite risk score (0–100).
   * Higher = more risk.
   * Weighted combination of all sub-scores.
   */
  risk_score: number;

  /**
   * Vehicle capability score (0–100).
   * Higher = better prepared.
   * Based on specs, weight margin, configuration.
   */
  capability_score: number;

  /**
   * Phase 4E: Vehicle health score (0–100).
   * Higher = healthier.
   * Based on telemetry, battery, fuel, coolant, anomalies.
   * Separated from capability_score for independent visibility.
   */
  health_score: number;

  /**
   * Resource readiness score (0–100).
   * Higher = better prepared.
   * Based on fuel, water, power, loadout.
   */
  resource_readiness: number;

  /**
   * Connectivity risk score (0–100).
   * Higher = more risk.
   * Based on connectivity state, cache readiness.
   */
  connectivity_risk: number;

  /**
   * Isolation risk score (0–100).
   * Higher = more risk.
   * Based on remoteness tier, terrain difficulty.
   */
  isolation_risk: number;

  // ── Phase 4D: Expanded Evaluation Outputs ──────────────

  /**
   * Route difficulty score (0–100).
   * Higher = harder route.
   * Based on terrain complexity, elevation, distance, trail rating.
   */
  route_difficulty_score: number;

  /**
   * Resource-to-route balance score (0–100).
   * Higher = better match between resources and route demands.
   * Reduced when resources are insufficient for route challenge.
   */
  resource_route_balance: number;

  /**
   * Operational status derived from risk_score.
   * Phase 4E: Stabilized via hysteresis in the store.
   */
  operational_status: OperationalStatus;

  /**
   * The single most significant risk contributor.
   */
  primary_risk_factor: PrimaryRiskFactor;

  /**
   * Human-readable risk summary line.
   */
  summary_line: string;

  /**
   * Number of input categories that were available.
   */
  available_inputs: number;

  /**
   * Total number of input categories.
   */
  total_inputs: number;

  /**
   * Whether this evaluation is based on complete data.
   */
  is_complete: boolean;

  /**
   * ISO timestamp when this evaluation was computed.
   */
  evaluated_at: string;
}




// ── Risk Summary Object (Dashboard Use) ──────────────────

/**
 * Compact risk summary for dashboard widgets and
 * Android Auto / Apple CarPlay consumption.
 *
 * Phase 4D additions:
 *   - route_difficulty_score: Route challenge 0–100
 *   - resource_route_balance: Resource vs route match 0–100
 */
export interface RiskSummary {
  /** Composite risk score (0–100) */
  risk_score: number;
  /** Operational status */
  operational_status: OperationalStatus;
  /** Primary risk factor */
  primary_risk_factor: PrimaryRiskFactor;
  /** Human-readable primary risk factor label */
  primary_risk_label: string;
  /** Sub-scores */
  capability_score: number;
  resource_readiness: number;
  connectivity_risk: number;
  isolation_risk: number;
  /** Phase 4D: Route difficulty score (0–100, higher = harder) */
  route_difficulty_score: number;
  /** Phase 4D: Resource-to-route balance (0–100, higher = better) */
  resource_route_balance: number;
  /** Data completeness */
  available_inputs: number;
  total_inputs: number;
  is_complete: boolean;
  /** Summary line */
  summary_line: string;
  /** ISO timestamp */
  updated_at: string;
}



// ── Risk Engine State ────────────────────────────────────

export interface RiskEngineState {
  /** Whether the engine has been initialized */
  initialized: boolean;
  /** Whether the engine is actively evaluating */
  running: boolean;
  /** Current risk evaluation */
  evaluation: RiskEvaluation | null;
  /** Current risk summary (dashboard-ready) */
  summary: RiskSummary | null;
  /** Most recent input snapshot */
  last_input_snapshot: RiskInputSnapshot | null;
  /** Number of evaluations completed */
  evaluation_count: number;
  /** ISO timestamp of last evaluation */
  last_evaluation_at: string | null;
  /** Whether the last evaluation was triggered by a signal change */
  last_trigger: 'periodic' | 'signal_change' | 'manual' | null;
}


// ── Risk Engine Session (Persistence) ────────────────────

export interface RiskEngineSession {
  /** Schema version */
  version: number;
  /** Last known evaluation */
  last_evaluation: RiskEvaluation | null;
  /** Last known summary */
  last_summary: RiskSummary | null;
  /** Evaluation count */
  evaluation_count: number;
  /** ISO timestamp when session was persisted */
  persisted_at: string;
}

/** Current session schema version (Phase 4E: bumped to 4) */
export const RISK_ENGINE_SESSION_VERSION = 4;

/**
 * Phase 4E: Operational status stabilization thresholds.
 *
 * Hysteresis bands prevent rapid oscillation between operational states.
 * To transition UP in severity, the score must exceed the upper threshold.
 * To transition DOWN in severity, the score must drop below the lower threshold.
 *
 * Example: caution → elevated requires score > 52 (not just > 50).
 *          elevated → caution requires score < 48 (not just < 50).
 */
export const OPERATIONAL_STATUS_THRESHOLDS = {
  optimal_to_caution: 27,    // score must exceed 27 to leave optimal
  caution_to_optimal: 23,    // score must drop below 23 to return to optimal
  caution_to_elevated: 52,   // score must exceed 52 to enter elevated
  elevated_to_caution: 48,   // score must drop below 48 to return to caution
  elevated_to_critical: 77,  // score must exceed 77 to enter critical
  critical_to_elevated: 73,  // score must drop below 73 to leave critical
} as const;



// ── Default Values ───────────────────────────────────────

export function createDefaultRiskInputSnapshot(): RiskInputSnapshot {
  return {
    vehicle_capability: {
      availability: 'unavailable',
      has_specs: false,
      payload_margin_lb: null,
      payload_margin_pct: null,
      is_overweight: false,
      build_weight_lb: null,
      gvwr_lb: null,
      // Phase 4B defaults
      vehicle_type: null,
      drivetrain: 'unknown',
      tire_size_inches: 0,
      suspension_lift_inches: 0,
      ground_clearance_delta_inches: 0,
      weight_class: 'unknown',
      capability_tier: 'unknown',
      items_weight_lb: 0,
      weight_distribution: 'unknown',
      rear_axle_pct: null,
      load_imbalanced: false,
    },
    vehicle_health: {
      availability: 'unavailable',
      has_live_telemetry: false,
      engine_status: 'unknown',
      battery_voltage: null,
      battery_health: 'unknown',
      fuel_percent: null,
      fuel_critical: false,
      // Phase 4B defaults
      coolant_temp_f: null,
      coolant_high: false,
      coolant_warning: false,
      telemetry_freshness: 'disconnected',
      has_anomaly: false,
      anomaly_flags: [],
      spike_suppressed: false,
    },
    expedition_resources: {
      availability: 'unavailable',
      has_active_expedition: false,
      fuel_percent: null,
      fuel_range_mi: null,
      water_gal: null,
      water_autonomy_days: null,
      power_percent: null,
      power_runtime_hrs: null,
      loadout_readiness_pct: null,
      critical_items_missing: 0,
      // Phase 4D defaults
      fuel_capacity_gal: null,
      water_capacity_gal: null,
      power_capacity_wh: null,
      has_blu_telemetry: false,
      blu_battery_percent: null,
      blu_input_watts: null,
      blu_output_watts: null,
      blu_runtime_minutes: null,
      blu_power_sustainable: false,
      resource_freshness: 'unavailable',
      fuel_low: false,
      water_low: false,
      power_limited: false,
    },
    route_difficulty: {
      availability: 'unavailable',
      has_active_route: false,
      total_distance_mi: null,
      elevation_gain_ft: null,
      terrain_complexity: null,
      waypoint_count: 0,
      has_gps_fix: false,
      // Phase 4D defaults
      trail_difficulty_rating: null,
      route_challenge_score: 0,
      estimated_duration_hrs: null,
      elevation_gain_per_mi: null,
      difficulty_vs_capability_delta: null,
      route_exceeds_capability: false,
    },

    remoteness: {
      availability: 'unavailable',
      remoteness_score: null,
      remoteness_tier: null,
      engine_running: false,
      // Phase 4C defaults
      raw_score: null,
      tier_color: null,
      route_isolation_score: null,
      distance_from_services_mi: null,
      elevation_signal_score: 0,
      connectivity_signal_score: 0,
      speed_signal_score: 0,
      sustained_speed_mph: null,
      cache_ready: false,
      remoteness_freshness: 'offline',
    },
    connectivity_status: {
      availability: 'unavailable',
      connectivity_state: 'unknown',
      internet_reachable: false,
      offline_cache_ready: false,
      cached_region_available: false,
      cached_route_available: false,
      operational_readiness: 'offline_unprepared',
      freshness: 'offline',
      // Phase 4C defaults
      signal_quality: 'unknown',
      last_online_at: null,
      network_type: 'unknown',
      quality: 'unknown',
      latency_ms: null,
      operational_connectivity_state: 'offline_unprepared',
      hours_since_online: null,
      is_recovering: false,
    },
    captured_at: new Date().toISOString(),
  };
}


export function createDefaultRiskEvaluation(): RiskEvaluation {
  return {
    risk_score: 0,
    capability_score: 0,
    health_score: 0,
    resource_readiness: 0,
    connectivity_risk: 0,
    isolation_risk: 0,
    route_difficulty_score: 0,
    resource_route_balance: 100,
    operational_status: 'optimal',
    primary_risk_factor: 'none',
    summary_line: 'Awaiting data\u2026',
    available_inputs: 0,
    total_inputs: 6,
    is_complete: false,
    evaluated_at: new Date().toISOString(),
  };
}


export function createDefaultRiskSummary(): RiskSummary {
  return {
    risk_score: 0,
    operational_status: 'optimal',
    primary_risk_factor: 'none',
    primary_risk_label: 'No Concerns',
    capability_score: 0,
    resource_readiness: 0,
    connectivity_risk: 0,
    isolation_risk: 0,
    route_difficulty_score: 0,
    resource_route_balance: 100,
    available_inputs: 0,
    total_inputs: 6,
    is_complete: false,
    summary_line: 'Awaiting data\u2026',
    updated_at: new Date().toISOString(),
  };
}



// ═══════════════════════════════════════════════════════════
// PHASE 5: FORWARD RISK FORECAST
// ═══════════════════════════════════════════════════════════

/**
 * User-facing expedition risk level.
 * Maps from operational status to user-friendly labels.
 */
export type ExpeditionRiskLevel = 'Low' | 'Moderate' | 'Elevated' | 'High';

export const EXPEDITION_RISK_LEVEL_MAP: Record<OperationalStatus, ExpeditionRiskLevel> = {
  optimal: 'Low',
  caution: 'Moderate',
  elevated: 'Elevated',
  critical: 'High',
};

export const EXPEDITION_RISK_LEVEL_COLORS: Record<ExpeditionRiskLevel, string> = {
  Low: '#4CAF50',
  Moderate: '#FFB300',
  Elevated: '#E67E22',
  High: '#EF5350',
};

/**
 * Internal risk category classification.
 * Groups risk contributors for reasoning about total risk.
 */
export type RiskCategory =
  | 'vehicle'
  | 'terrain'
  | 'resource'
  | 'environmental'
  | 'isolation'
  | 'connectivity'
  | 'time_completion';

export interface RiskCategoryScore {
  category: RiskCategory;
  label: string;
  score: number;       // 0–100 (higher = more risk)
  contributing: boolean; // true if this category is actively contributing
  description: string;
}

/**
 * Forward risk forecast for the route ahead.
 * Predicts risk at 4 distance intervals.
 */
export interface ForwardRiskSegment {
  /** Distance ahead in miles */
  distance_mi: number;
  /** Label for this segment (e.g., "5 mi") */
  label: string;
  /** Predicted risk score (0–100) */
  predicted_score: number;
  /** Predicted risk level */
  predicted_level: ExpeditionRiskLevel;
  /** Primary concern for this segment */
  primary_concern: string;
  /** Color for display */
  color: string;
}

export interface ForwardRiskForecast {
  /** Whether forecast data is available */
  available: boolean;
  /** Forecast segments (typically 4: 5mi, 10mi, 15mi, 20mi) */
  segments: ForwardRiskSegment[];
  /** Overall trend: improving, stable, worsening */
  trend: 'improving' | 'stable' | 'worsening';
  /** Trend description for display */
  trend_description: string;
  /** ISO timestamp when forecast was computed */
  computed_at: string;
}

/**
 * Expedition risk advisory — calm, tactical intelligence message.
 */
export interface ExpeditionRiskAdvisory {
  /** Unique key for deduplication */
  key: string;
  /** Severity level */
  severity: 'info' | 'watch' | 'caution' | 'warning';
  /** Short advisory message */
  message: string;
  /** Risk category this advisory relates to */
  category: RiskCategory;
  /** Color for display */
  color: string;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * Complete expedition risk output combining current assessment,
 * forward forecast, risk categories, and advisories.
 */
export interface ExpeditionRiskOutput {
  /** Current risk level (user-facing) */
  level: ExpeditionRiskLevel;
  /** Current risk score (0–100) */
  score: number;
  /** Short descriptor for the current state */
  descriptor: string;
  /** Operational status (internal) */
  status: OperationalStatus;
  /** Primary risk factor label */
  primary_factor: string;
  /** Summary line */
  summary: string;
  /** Risk category breakdown */
  categories: RiskCategoryScore[];
  /** Forward risk forecast */
  forward_forecast: ForwardRiskForecast;
  /** Active advisories (max 5) */
  advisories: ExpeditionRiskAdvisory[];
  /** Top contributing factors (max 3) */
  top_factors: string[];
  /** Data completeness */
  data_completeness: number; // 0–100
  /** Whether the engine is running */
  engine_active: boolean;
  /** ISO timestamp */
  updated_at: string;
}

/**
 * Expedition risk descriptor map — short status wording.
 */
export const EXPEDITION_RISK_DESCRIPTORS: Record<ExpeditionRiskLevel, string> = {
  Low: 'Stable',
  Moderate: 'Watch Conditions',
  Elevated: 'Elevated Exposure',
  High: 'High Exposure',
};

