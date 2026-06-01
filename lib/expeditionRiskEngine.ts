/**
 * ═══════════════════════════════════════════════════════════
 * ECS EXPEDITION RISK ENGINE — Phase 4E Service Layer
 * ═══════════════════════════════════════════════════════════
 *
 * Centralized expedition safety evaluation system.
 * Aggregates signals from all major ECS systems and produces
 * a normalized risk assessment.
 *
 * Architecture:
 *   - Operates independently from UI components
 *   - Periodic evaluation on a configurable interval
 *   - Signal-change triggered evaluation with debounce
 *   - Graceful degradation when inputs are unavailable
 *   - Safe for Android Auto / CarPlay consumption
 *   - Failures never crash ECS systems
 *
 * Input Sources (12 signal sources):
 *   1. Vehicle Specs (vehicleSpecStore, weightEngine)
 *   2. Vehicle Telemetry (VehicleTelemetryStore)
 *   3. Tires & Lift (tiresLiftStore)
 *   4. Vehicle Config (vehicleStore → wizard_config)
 *   5. Loadout Weight (loadoutWeightCache)
 *   6. Weight Distribution (weightEngine → calculateCG)
 *   7. Expedition Resources (telemetryStore, missionStore)
 *   8. Route Data (routeStore, elevationComplexity)
 *   9. Remoteness (remotenessStore)
 *  10. Connectivity Intelligence (connectivityIntelStore)
 *  11. BLU Power Telemetry (bluStateStore)
 *  12. Consumables (consumablesStore)
 *
 * Phase 4E: Production-Ready Risk Scoring Model
 *   - Finalized 7-factor weighted composite scoring
 *   - health_score exposed as independent sub-score
 *   - Operational status stabilization via store hysteresis
 *   - Dashboard Risk Indicator widget integration
 *   - All 6 input categories active and weighted
 *
 * Evaluation Cycle:
 *   1. Gather inputs from all sources
 *   2. Normalize into RiskInputSnapshot
 *   3. Compute sub-scores (7 factors)
 *   4. Compute composite risk score (weighted)
 *   5. Determine operational status (stabilized in store)
 *   6. Identify primary risk factor
 *   7. Update store → notify subscribers → dashboard updates
 *
 * Debounce:
 *   - Periodic evaluation: every 15 seconds
 *   - Signal-change evaluation: 3-second debounce window
 *   - Prevents excessive recalculation during rapid changes
 *
 * Risk Score Weighting (Phase 4E Final):
 *   - Isolation risk:              22%  (environmental)
 *   - Connectivity risk:           17%  (environmental)
 *   - Resource readiness (inv):    18%  (supplies)
 *   - Vehicle capability (inv):    13%  (vehicle)
 *   - Vehicle health (inv):        10%  (vehicle)
 *   - Route difficulty:            10%  (route)
 *   - Resource-route balance (inv): 10% (cross-factor)
 *   + Route-capability mismatch amplifier: up to +10
 */
import {
  createDefaultRiskInputSnapshot,
  OPERATIONAL_CONNECTIVITY_RISK_WEIGHTS,
  type VehicleWeightClass,
  type OperationalConnectivityState,
  type VehicleCapabilityInput,
  type VehicleCapabilityTier,
  type WeightDistributionStability,
  type VehicleHealthInput,
  type ExpeditionResourcesInput,
  type RouteDifficultyInput,
  type RemotenessInput,
  type ConnectivityStatusInput,
  type RiskInputSnapshot,
  type PrimaryRiskFactor,
  type OperationalStatus,
  type RiskEvaluation,
} from './expeditionRiskTypes';
import {
  validateRiskScore,
  hashRiskInputs,
  clampScore,
  stabilityLog,
} from './ecsStabilityGuards';
import { expeditionRiskStore } from './expeditionRiskStore';



// ── Constants ────────────────────────────────────────────

/** Periodic evaluation interval (15 seconds) */
const EVALUATION_INTERVAL_MS = 15_000;

/** Debounce window for signal-change triggered evaluations (3 seconds) */
const SIGNAL_DEBOUNCE_MS = 3_000;

/** Maximum evaluation time before logging a warning (500ms) */
const MAX_EVAL_TIME_MS = 500;

/** Coolant temperature thresholds (°F) */
const COOLANT_WARNING_F = 220;
const COOLANT_HIGH_F = 230;

/** Battery voltage thresholds */
const BATTERY_GOOD_V = 12.4;
const BATTERY_FAIR_V = 12.0;
const BATTERY_LOW_V = 11.5;

/** Spike detection: max change per reading interval */
const SPIKE_COOLANT_DELTA_F = 40;   // >40°F jump in one reading = spike
const SPIKE_BATTERY_DELTA_V = 2.0;  // >2V jump in one reading = spike

const TAG = '[RiskEngine]';


// ── Internal State ───────────────────────────────────────

let _periodicTimer: ReturnType<typeof setInterval> | null = null;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _subscriptions: (() => void)[] = [];
let _lastEvalTimestamp = 0;

/** Phase 4B: Previous telemetry values for spike detection */
let _prevCoolantTempF: number | null = null;
let _prevBatteryVoltage: number | null = null;

/** Phase 15: Input change detection hash */
let _lastInputHash: string = '';

/** Phase 15: Previous risk score for sanity validation */
let _previousRiskScore: number | null = null;


// ══════════════════════════════════════════════════════════
// HELPER: Weight Class Classification
// ══════════════════════════════════════════════════════════

function _classifyWeightClass(gvwrLb: number | null): VehicleWeightClass {
  if (gvwrLb == null || gvwrLb <= 0) return 'unknown';
  if (gvwrLb < 5500) return 'light';
  if (gvwrLb < 7500) return 'medium';
  if (gvwrLb < 10000) return 'heavy';
  return 'super_heavy';
}

/**
 * Infer drivetrain from vehicle type and wizard config.
 * Most overlanding vehicles are 4WD; Subarus are AWD.
 */
function _inferDrivetrain(vehicleType: string | null, make?: string | null): '4wd' | '2wd' | 'awd' | 'unknown' {
  if (!vehicleType) return 'unknown';
  const makeLower = (make || '').toLowerCase();
  if (makeLower.includes('subaru')) return 'awd';
  if (vehicleType === 'jeep') return '4wd';
  if (vehicleType === 'truck') return '4wd';
  if (vehicleType === 'suv_van') return '4wd';
  if (vehicleType === 'car_crossover') return 'awd';
  return 'unknown';
}


// ══════════════════════════════════════════════════════════
// SPIKE DETECTION
// ══════════════════════════════════════════════════════════

function _isCoolantSpike(currentF: number | null): boolean {
  if (currentF == null || _prevCoolantTempF == null) return false;
  const delta = Math.abs(currentF - _prevCoolantTempF);
  return delta > SPIKE_COOLANT_DELTA_F;
}

function _isBatterySpike(currentV: number | null): boolean {
  if (currentV == null || _prevBatteryVoltage == null) return false;
  const delta = Math.abs(currentV - _prevBatteryVoltage);
  return delta > SPIKE_BATTERY_DELTA_V;
}


// ══════════════════════════════════════════════════════════
// PHASE 4C HELPER: Operational Connectivity State Mapping
// ══════════════════════════════════════════════════════════

/**
 * Phase 4C: Map operational readiness string from Connectivity
 * Intelligence into a typed OperationalConnectivityState.
 */
function _mapOperationalConnectivityState(
  readiness: string,
  connectivityState: string,
  cacheReady: boolean,
  cachedRegion: boolean,
  cachedRoute: boolean,
): OperationalConnectivityState {
  // Direct mapping from CI operational readiness states
  switch (readiness) {
    case 'online_ready': return 'online_ready';
    case 'offline_ready': return 'offline_ready';
    case 'degraded_ready': return 'degraded_ready';
    case 'degraded_unprepared': return 'degraded_unprepared';
    case 'offline_unprepared': return 'offline_unprepared';
  }

  // Fallback: infer from connectivity state + cache
  const cacheUseful = cacheReady && (cachedRegion || cachedRoute);
  if (connectivityState === 'connected') return 'online_ready';
  if (connectivityState === 'offline') {
    return cacheUseful ? 'offline_ready' : 'offline_unprepared';
  }
  if (connectivityState === 'degraded' || connectivityState === 'limited') {
    return cacheUseful ? 'degraded_ready' : 'degraded_unprepared';
  }
  return 'offline_unprepared';
}


// ══════════════════════════════════════════════════════════
// INPUT GATHERING
// ══════════════════════════════════════════════════════════

/**
 * Phase 4B: Gather vehicle capability input from vehicleSpecStore,
 * tiresLiftStore, vehicleStore, weightEngine, and loadoutWeightCache.
 */
function _gatherVehicleCapability(): VehicleCapabilityInput {
  try {
    const { vehicleSpecStore } = require('./vehicleSpecStore');
    const { computeFullBuildWeightBreakdown, calculateCG } = require('./weightEngine');

    const specEntry = vehicleSpecStore.getFirst();
    if (!specEntry?.spec) {
      return {
        availability: 'unavailable',
        has_specs: false,
        payload_margin_lb: null,
        payload_margin_pct: null,
        is_overweight: false,
        build_weight_lb: null,
        gvwr_lb: null,
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
      };
    }

    const vehicleId = specEntry.vehicleId;

    // ── Build weight breakdown (SINGLE SOURCE OF TRUTH) ──
    const bw = computeFullBuildWeightBreakdown();
    const marginPct = bw.gvwr_lb > 0
      ? Math.round((bw.payload_margin_lb / bw.gvwr_lb) * 100)
      : null;

    // ── Vehicle type from wizard config ──
    let vehicleType: string | null = null;
    let vehicleMake: string | null = null;
    let wizardSelections: Record<string, string> = {};
    try {
      const { vehicleStore } = require('./vehicleStore');
      const vehicle = vehicleStore.getById(vehicleId);
      if (vehicle) {
        vehicleMake = vehicle.make || null;
        const wc = (vehicle as any).wizard_config;
        if (wc && typeof wc === 'object') {
          wizardSelections = wc;
          vehicleType = wc.vehicle_type || null;
        }
      }
    } catch {}

    // ── Tires & Lift ──
    let tireSizeInches = 0;
    let suspensionLiftInches = 0;
    let groundClearanceDelta = 0;
    let capabilityTier: VehicleCapabilityTier = 'unknown';
    try {
      const { tiresLiftStore } = require('./tiresLiftStore');
      const tlConfig = tiresLiftStore.get(vehicleId);
      if (tlConfig) {
        tireSizeInches = tlConfig.tireSizeInches || 0;
        suspensionLiftInches = tlConfig.suspensionLiftInches || 0;
        groundClearanceDelta = tiresLiftStore.estimateGroundClearanceDelta(vehicleId);
        capabilityTier = tiresLiftStore.getCapabilityTier(vehicleId) as VehicleCapabilityTier;
      }
    } catch {}

    // ── Weight distribution (CG) ──
    let weightDistribution: WeightDistributionStability = 'unknown';
    let rearAxlePct: number | null = null;
    let loadImbalanced = false;
    try {
      if (Object.keys(wizardSelections).length > 0) {
        const cgResult = calculateCG(wizardSelections);
        if (cgResult && cgResult.totalMass > 0) {
          weightDistribution = cgResult.stability as WeightDistributionStability;
          rearAxlePct = cgResult.rearAxlePercent;
          loadImbalanced = cgResult.stability === 'extreme_rear';
        }
      }
    } catch {}

    // ── Weight class ──
    const weightClass = _classifyWeightClass(bw.gvwr_lb);

    // ── Drivetrain ──
    const drivetrain = _inferDrivetrain(vehicleType, vehicleMake);

    console.log(
      `${TAG} [4B] Vehicle capability: type=${vehicleType} drivetrain=${drivetrain} ` +
      `tires=${tireSizeInches}" lift=${suspensionLiftInches}" tier=${capabilityTier} ` +
      `class=${weightClass} margin=${bw.payload_margin_lb}lb dist=${weightDistribution}`
    );

    return {
      availability: 'available',
      has_specs: bw.has_specs,
      payload_margin_lb: bw.payload_margin_lb,
      payload_margin_pct: marginPct,
      is_overweight: bw.payload_margin_lb < 0,
      build_weight_lb: bw.build_weight_lb,
      gvwr_lb: bw.gvwr_lb,
      vehicle_type: vehicleType,
      drivetrain,
      tire_size_inches: tireSizeInches,
      suspension_lift_inches: suspensionLiftInches,
      ground_clearance_delta_inches: groundClearanceDelta,
      weight_class: weightClass,
      capability_tier: capabilityTier,
      items_weight_lb: bw.items_weight_lb,
      weight_distribution: weightDistribution,
      rear_axle_pct: rearAxlePct,
      load_imbalanced: loadImbalanced,
    };
  } catch (e) {
    console.warn(`${TAG} Failed to gather vehicle capability:`, e);
    return {
      availability: 'error',
      has_specs: false,
      payload_margin_lb: null,
      payload_margin_pct: null,
      is_overweight: false,
      build_weight_lb: null,
      gvwr_lb: null,
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
    };
  }
}

/**
 * Phase 4B: Gather vehicle health input from Vehicle Telemetry
 * with coolant temp, anomaly detection, spike suppression, and freshness.
 */
function _gatherVehicleHealth(): VehicleHealthInput {
  try {
    const { vehicleTelemetryStore } = require('../src/vehicle-telemetry/VehicleTelemetryStore');
    const store = vehicleTelemetryStore;
    const summary = store.getSummary();
    const hasData = store.hasData();

    if (!hasData) {
      return {
        availability: 'unavailable',
        has_live_telemetry: false,
        engine_status: 'unknown',
        battery_voltage: null,
        battery_health: 'unknown',
        fuel_percent: null,
        fuel_critical: false,
        coolant_temp_f: null,
        coolant_high: false,
        coolant_warning: false,
        telemetry_freshness: 'disconnected',
        has_anomaly: false,
        anomaly_flags: [],
        spike_suppressed: false,
      };
    }

    // ── Telemetry freshness ──
    let telemetryFreshness: VehicleHealthInput['telemetry_freshness'] = 'disconnected';
    try {
      telemetryFreshness = store.getFreshnessLabel() || 'disconnected';
    } catch {}

    // ── Battery voltage + spike detection ──
    const rawBattV = summary.battery_voltage ?? null;
    const batterySpike = _isBatterySpike(rawBattV);
    const battV = batterySpike ? _prevBatteryVoltage : rawBattV;
    if (rawBattV != null && !batterySpike) {
      _prevBatteryVoltage = rawBattV;
    }

    let battHealth: VehicleHealthInput['battery_health'] = 'unknown';
    if (battV != null) {
      if (battV >= BATTERY_GOOD_V) battHealth = 'good';
      else if (battV >= BATTERY_FAIR_V) battHealth = 'fair';
      else if (battV >= BATTERY_LOW_V) battHealth = 'low';
      else battHealth = 'critical';
    }

    // ── Fuel level ──
    const fuelPct = summary.fuel_level ?? null;

    // ── Engine status ──
    const engineRunning = summary.engine_rpm != null && summary.engine_rpm > 0;
    const engineStatus: VehicleHealthInput['engine_status'] =
      engineRunning ? 'running' : (summary.engine_rpm === 0 ? 'idle' : 'unknown');

    // ── Coolant temperature + spike detection ──
    const rawCoolantF = summary.coolant_temp ?? null;
    const coolantSpike = _isCoolantSpike(rawCoolantF);
    const coolantF = coolantSpike ? _prevCoolantTempF : rawCoolantF;
    if (rawCoolantF != null && !coolantSpike) {
      _prevCoolantTempF = rawCoolantF;
    }

    const coolantHigh = coolantF != null && coolantF > COOLANT_HIGH_F;
    const coolantWarning = coolantF != null && coolantF > COOLANT_WARNING_F && !coolantHigh;

    // ── Anomaly detection ──
    const anomalyFlags: string[] = [];
    if (battHealth === 'critical') anomalyFlags.push('battery_critical');
    if (battHealth === 'low') anomalyFlags.push('battery_low');
    if (coolantHigh) anomalyFlags.push('coolant_high');
    if (coolantWarning) anomalyFlags.push('coolant_warning');
    if (fuelPct != null && fuelPct < 15) anomalyFlags.push('fuel_critical');
    if (fuelPct != null && fuelPct < 25 && fuelPct >= 15) anomalyFlags.push('fuel_low');

    const hasAnomaly = anomalyFlags.length > 0;
    const spikeSuppressed = batterySpike || coolantSpike;

    if (spikeSuppressed) {
      console.log(`${TAG} [4B] Telemetry spike suppressed: battery=${batterySpike} coolant=${coolantSpike}`);
    }

    if (hasAnomaly) {
      console.log(`${TAG} [4B] Vehicle health anomalies: ${anomalyFlags.join(', ')}`);
    }

    return {
      availability: telemetryFreshness === 'live' ? 'available' : 'stale',
      has_live_telemetry: true,
      engine_status: engineStatus,
      battery_voltage: battV,
      battery_health: battHealth,
      fuel_percent: fuelPct,
      fuel_critical: fuelPct != null && fuelPct < 15,
      coolant_temp_f: coolantF,
      coolant_high: coolantHigh,
      coolant_warning: coolantWarning,
      telemetry_freshness: telemetryFreshness,
      has_anomaly: hasAnomaly,
      anomaly_flags: anomalyFlags,
      spike_suppressed: spikeSuppressed,
    };
  } catch {
    return {
      availability: 'unavailable',
      has_live_telemetry: false,
      engine_status: 'unknown',
      battery_voltage: null,
      battery_health: 'unknown',
      fuel_percent: null,
      fuel_critical: false,
      coolant_temp_f: null,
      coolant_high: false,
      coolant_warning: false,
      telemetry_freshness: 'disconnected',
      has_anomaly: false,
      anomaly_flags: [],
      spike_suppressed: false,
    };
  }
}

/**
 * Phase 4D: Gather expedition resources input from telemetry + mission stores
 * + BLU power telemetry + consumables with expanded resource signals.
 */
function _gatherExpeditionResources(): ExpeditionResourcesInput {
  const defaults: ExpeditionResourcesInput = {
    availability: 'unavailable',
    has_active_expedition: false,
    fuel_percent: null, fuel_range_mi: null,
    water_gal: null, water_autonomy_days: null,
    power_percent: null, power_runtime_hrs: null,
    loadout_readiness_pct: null, critical_items_missing: 0,
    fuel_capacity_gal: null, water_capacity_gal: null, power_capacity_wh: null,
    has_blu_telemetry: false, blu_battery_percent: null,
    blu_input_watts: null, blu_output_watts: null,
    blu_runtime_minutes: null, blu_power_sustainable: false,
    resource_freshness: 'unavailable',
    fuel_low: false, water_low: false, power_limited: false,
  };

  try {
    const { missionExpeditionStore } = require('./missionStore');
    const { consumablesStore } = require('./consumablesStore');
    const { vehicleSpecStore } = require('./vehicleSpecStore');

    const activeExp = missionExpeditionStore.getActive();
    const specEntry = vehicleSpecStore.getFirst();
    const { vehicleSetupStore } = require('./vehicleSetupStore');
    const { vehicleStore } = require('./vehicleStore');
    const { getVehicleResourceProfile } = require('./vehicleResourceProfile');
    const vehicleId = specEntry?.vehicleId || vehicleSetupStore.getActiveVehicleId();
    const vehicle = vehicleId ? vehicleStore.getById(vehicleId) : null;
    const resourceProfile = getVehicleResourceProfile(vehicle);

    // ── Phase 4D: BLU telemetry ──
    let hasBlu = false;
    let bluBattery: number | null = null;
    let bluIn: number | null = null;
    let bluOut: number | null = null;
    let bluRuntime: number | null = null;
    let bluSustainable = false;
    try {
      const { bluStateStore } = require('../src/power/blu/BluStateStore');
      const bluSummary = bluStateStore.getSummary();
      if (bluSummary && bluSummary.status !== 'placeholder') {
        hasBlu = true;
        bluBattery = bluSummary.battery_percent ?? null;
        bluIn = bluSummary.input_watts ?? null;
        bluOut = bluSummary.output_watts ?? null;
        bluRuntime = bluSummary.estimated_runtime_minutes ?? null;
        bluSustainable = (bluIn ?? 0) >= (bluOut ?? 0) && bluIn != null;
      }
    } catch {}

    // ── Phase 4D: Consumables for capacity ──
    let fuelCapGal: number | null = null;
    let waterCapGal: number | null = null;
    let consumables: any = null;
    try {
      if (vehicleId) {
        consumables = consumablesStore.get(vehicleId);
      }
    } catch {}

    // ── Phase 4D: Vehicle spec for capacities ──
    try {
      if (specEntry?.spec) {
        fuelCapGal = specEntry.spec.fuel_tank_capacity_gal ?? null;
      }
    } catch {}
    waterCapGal = resourceProfile.waterCapacityGal ?? waterCapGal;
    const powerCapWh = resourceProfile.batteryUsableWh;

    // ── Base resource data ──
    let fuelPct: number | null = consumables?.fuel_percent_current ?? null;
    let waterGal: number | null = consumables?.water_gal_current ?? null;
    let fuelRangeMi: number | null = null;
    let waterAutoDays: number | null = null;
    let powerPct: number | null = hasBlu ? bluBattery : null;
    let powerRuntimeHrs: number | null = bluRuntime != null ? bluRuntime / 60 : null;
    let loadoutReadinessPct: number | null = null;
    let criticalsMissing = 0;
    let hasActiveExp = !!activeExp;
    let resourceFreshness: ExpeditionResourcesInput['resource_freshness'] = 'unavailable';

    if (activeExp) {
      try {
        const { computeTelemetryReadout } = require('./telemetryStore');
        const readout = computeTelemetryReadout(activeExp.id);
        fuelPct = readout.fuelPercent ?? fuelPct;
        fuelRangeMi = readout.fuelRangeMi ?? null;
        waterGal = readout.waterRemainingL != null ? readout.waterRemainingL * 0.264172 : waterGal;
        waterAutoDays = readout.waterAutonomyDays ?? null;
        if (readout.powerPercent != null) powerPct = readout.powerPercent;
        if (readout.powerEstHours != null) powerRuntimeHrs = readout.powerEstHours;
        criticalsMissing = readout.criticals?.length ?? 0;
        resourceFreshness = 'live';
      } catch {
        resourceFreshness = fuelPct != null ? 'profile' : 'unavailable';
      }
    } else {
      resourceFreshness = fuelPct != null || hasBlu ? 'profile' : 'unavailable';
    }

    if (hasBlu) resourceFreshness = 'live';

    const fuelLow = fuelPct != null && fuelPct < 25;
    const waterLow = waterGal != null && waterGal < 2;
    const powerLimited = powerRuntimeHrs != null && powerRuntimeHrs < 2;

    const hasAnyData = fuelPct != null || waterGal != null || powerPct != null || hasBlu;

    console.log(
      `${TAG} [4D] Resources: fuel=${fuelPct}% water=${waterGal}gal power=${powerPct}% ` +
      `blu=${hasBlu} bluSOC=${bluBattery}% bluIn=${bluIn}W bluOut=${bluOut}W ` +
      `runtime=${bluRuntime}min sustainable=${bluSustainable} fresh=${resourceFreshness}`
    );

    return {
      availability: hasAnyData ? 'available' : 'unavailable',
      has_active_expedition: hasActiveExp,
      fuel_percent: fuelPct, fuel_range_mi: fuelRangeMi,
      water_gal: waterGal, water_autonomy_days: waterAutoDays,
      power_percent: powerPct, power_runtime_hrs: powerRuntimeHrs,
      loadout_readiness_pct: loadoutReadinessPct,
      critical_items_missing: criticalsMissing,
      fuel_capacity_gal: fuelCapGal, water_capacity_gal: waterCapGal,
      power_capacity_wh: powerCapWh,
      has_blu_telemetry: hasBlu,
      blu_battery_percent: bluBattery, blu_input_watts: bluIn,
      blu_output_watts: bluOut, blu_runtime_minutes: bluRuntime,
      blu_power_sustainable: bluSustainable,
      resource_freshness: resourceFreshness,
      fuel_low: fuelLow, water_low: waterLow, power_limited: powerLimited,
    };
  } catch (e) {
    console.warn(`${TAG} [4D] Failed to gather resources:`, e);
    return { ...defaults, availability: 'error' };
  }
}

/**
 * Phase 4D: Gather route difficulty input from routeStore + elevation analysis
 * with trail difficulty rating, route challenge score, and capability delta.
 */
function _gatherRouteDifficulty(): RouteDifficultyInput {
  const defaults: RouteDifficultyInput = {
    availability: 'unavailable', has_active_route: false,
    total_distance_mi: null, elevation_gain_ft: null,
    terrain_complexity: null, waypoint_count: 0, has_gps_fix: false,
    trail_difficulty_rating: null, route_challenge_score: 0,
    estimated_duration_hrs: null, elevation_gain_per_mi: null,
    difficulty_vs_capability_delta: null, route_exceeds_capability: false,
  };

  try {
    const { routeStore } = require('./routeStore');
    const { gpsUIState } = require('./gpsUIState');

    const activeRoute = routeStore.getActive();
    const gps = gpsUIState.get();

    if (!activeRoute) {
      return { ...defaults, has_gps_fix: gps.hasFix };
    }

    let terrainComplexity: RouteDifficultyInput['terrain_complexity'] = null;
    try {
      const { remotenessStore } = require('./remotenessStore');
      const elevResult = remotenessStore.getElevationResult();
      if (elevResult?.hasElevation) {
        terrainComplexity = elevResult.tier as any;
      }
    } catch {}

    const distMi = activeRoute.total_distance_miles ?? null;
    const elevGainFt = activeRoute.elevation_gain_ft ?? null;

    // ── Phase 4D: Elevation gain per mile ──
    let elevGainPerMi: number | null = null;
    if (distMi != null && distMi > 0 && elevGainFt != null) {
      elevGainPerMi = Math.round(elevGainFt / distMi);
    }

    // ── Phase 4D: Trail difficulty rating (1–5) ──
    // Infer from terrain complexity + elevation gain per mile
    let trailRating: number | null = null;
    if (terrainComplexity === 'high') trailRating = 4;
    else if (terrainComplexity === 'medium') trailRating = 3;
    else if (terrainComplexity === 'low') trailRating = 2;
    // Adjust up if elevation gain per mile is extreme
    if (trailRating != null && elevGainPerMi != null && elevGainPerMi > 300) {
      trailRating = Math.min(5, trailRating + 1);
    }

    // ── Phase 4D: Route challenge score (0–100) ──
    let challengeScore = 0;
    // Trail rating contribution (0–40)
    if (trailRating != null) challengeScore += (trailRating / 5) * 40;
    else challengeScore += 10; // unknown = mild baseline
    // Distance contribution (0–25): longer routes = harder
    if (distMi != null) {
      if (distMi > 100) challengeScore += 25;
      else if (distMi > 50) challengeScore += 20;
      else if (distMi > 20) challengeScore += 12;
      else challengeScore += 5;
    }
    // Elevation gain per mile contribution (0–25)
    if (elevGainPerMi != null) {
      if (elevGainPerMi > 300) challengeScore += 25;
      else if (elevGainPerMi > 200) challengeScore += 20;
      else if (elevGainPerMi > 100) challengeScore += 12;
      else challengeScore += 5;
    }
    // Terrain complexity contribution (0–10)
    if (terrainComplexity === 'high') challengeScore += 10;
    else if (terrainComplexity === 'medium') challengeScore += 5;
    challengeScore = Math.max(0, Math.min(100, Math.round(challengeScore)));

    // ── Phase 4D: Estimated duration (rough heuristic) ──
    let estDurationHrs: number | null = null;
    if (distMi != null && distMi > 0) {
      // Base speed: 15 mph for trails, 25 mph for moderate, 40 mph for easy
      const avgSpeed = trailRating != null && trailRating >= 4 ? 12
        : trailRating != null && trailRating >= 3 ? 20 : 30;
      estDurationHrs = Math.round((distMi / avgSpeed) * 10) / 10;
    }

    // ── Phase 4D: Difficulty vs capability delta ──
    let capDelta: number | null = null;
    let routeExceedsCap = false;
    try {
      const { vehicleSpecStore } = require('./vehicleSpecStore');
      const { tiresLiftStore } = require('./tiresLiftStore');
      const specEntry = vehicleSpecStore.getFirst();
      if (specEntry?.vehicleId) {
        const capTier = tiresLiftStore.getCapabilityTier(specEntry.vehicleId);
        const capScoreMap: Record<string, number> = {
          extreme: 100, aggressive: 80, moderate: 60, mild: 40, stock: 20, unknown: 30,
        };
        const capNum = capScoreMap[capTier] ?? 30;
        capDelta = challengeScore - capNum;
        routeExceedsCap = capDelta > 0;
      }
    } catch {}

    console.log(
      `${TAG} [4D] Route: dist=${distMi}mi elev=${elevGainFt}ft ` +
      `gainPerMi=${elevGainPerMi} trail=${trailRating} challenge=${challengeScore} ` +
      `duration=${estDurationHrs}h capDelta=${capDelta} exceeds=${routeExceedsCap}`
    );

    return {
      availability: 'available',
      has_active_route: true,
      total_distance_mi: distMi,
      elevation_gain_ft: elevGainFt,
      terrain_complexity: terrainComplexity,
      waypoint_count: activeRoute.waypoints?.length ?? 0,
      has_gps_fix: gps.hasFix,
      trail_difficulty_rating: trailRating,
      route_challenge_score: challengeScore,
      estimated_duration_hrs: estDurationHrs,
      elevation_gain_per_mi: elevGainPerMi,
      difficulty_vs_capability_delta: capDelta,
      route_exceeds_capability: routeExceedsCap,
    };
  } catch (e) {
    console.warn(`${TAG} [4D] Failed to gather route difficulty:`, e);
    return { ...defaults, availability: 'error' };
  }
}

/**
 * Phase 4C: Gather remoteness input from remotenessStore
 * with expanded signal extraction.
 */
function _gatherRemoteness(): RemotenessInput {
  try {
    const { remotenessStore } = require('./remotenessStore');
    const output = remotenessStore.get();
    const running = remotenessStore.isRunning();

    if (!running && output.score === 0) {
      return {
        availability: 'unavailable', remoteness_score: null, remoteness_tier: null,
        engine_running: false, raw_score: null, tier_color: null,
        route_isolation_score: null, distance_from_services_mi: null,
        elevation_signal_score: 0, connectivity_signal_score: 0,
        speed_signal_score: 0, sustained_speed_mph: null,
        cache_ready: false, remoteness_freshness: 'offline',
      };
    }

    const signals = output.signals;
    const routeIsolationScore = Math.min(100, Math.round(
      (signals.connectivityScore / 20) * 60 + (signals.speedScore / 6) * 40
    ));

    let distFromServicesMi: number | null = null;
    if (output.score > 0) {
      if (output.score <= 15) distFromServicesMi = Math.round(output.score * 0.33);
      else if (output.score <= 35) distFromServicesMi = Math.round(5 + (output.score - 15) * 0.75);
      else if (output.score <= 60) distFromServicesMi = Math.round(20 + (output.score - 35) * 1.2);
      else if (output.score <= 80) distFromServicesMi = Math.round(50 + (output.score - 60) * 2.5);
      else distFromServicesMi = Math.round(100 + (output.score - 80) * 5);
    }

    return {
      availability: running ? 'available' : 'stale',
      remoteness_score: output.score, remoteness_tier: output.tier,
      engine_running: running, raw_score: output.rawScore,
      tier_color: output.tierColor, route_isolation_score: routeIsolationScore,
      distance_from_services_mi: distFromServicesMi,
      elevation_signal_score: signals.elevationScore,
      connectivity_signal_score: signals.connectivityScore,
      speed_signal_score: signals.speedScore,
      sustained_speed_mph: signals.sustainedSpeedMph,
      cache_ready: signals.cacheReady, remoteness_freshness: signals.freshness,
    };
  } catch {
    return {
      availability: 'error', remoteness_score: null, remoteness_tier: null,
      engine_running: false, raw_score: null, tier_color: null,
      route_isolation_score: null, distance_from_services_mi: null,
      elevation_signal_score: 0, connectivity_signal_score: 0,
      speed_signal_score: 0, sustained_speed_mph: null,
      cache_ready: false, remoteness_freshness: 'offline',
    };
  }
}

/**
 * Phase 4C: Gather connectivity status input from connectivityIntelStore.
 */
function _gatherConnectivityStatus(): ConnectivityStatusInput {
  const unavail: ConnectivityStatusInput = {
    availability: 'unavailable', connectivity_state: 'unknown',
    internet_reachable: false, offline_cache_ready: false,
    cached_region_available: false, cached_route_available: false,
    operational_readiness: 'offline_unprepared', freshness: 'offline',
    signal_quality: 'unknown', last_online_at: null,
    network_type: 'unknown', quality: 'unknown', latency_ms: null,
    operational_connectivity_state: 'offline_unprepared',
    hours_since_online: null, is_recovering: false,
  };

  try {
    const { connectivityIntelStore } = require('./connectivityIntelStore');
    if (!connectivityIntelStore.isInitialized()) return unavail;

    const summary = connectivityIntelStore.getSummary();
    if (!summary) return unavail;

    const opConnState = _mapOperationalConnectivityState(
      summary.operational_readiness, summary.connectivity_state,
      summary.offline_cache_ready, summary.cached_region_available,
      summary.cached_route_available,
    );

    let hoursSinceOnline: number | null = null;
    const lastOnlineAt = summary.last_online_at || connectivityIntelStore.getPersistedLastOnlineAt();
    if (lastOnlineAt && !summary.internet_reachable) {
      const ms = new Date(lastOnlineAt).getTime();
      if (!isNaN(ms)) hoursSinceOnline = Math.round((Date.now() - ms) / 3600000 * 10) / 10;
    }

    let isRecovering = false;
    try { isRecovering = connectivityIntelStore.isRecovering(); } catch {}

    return {
      availability: summary.is_live ? 'available' : 'stale',
      connectivity_state: summary.connectivity_state,
      internet_reachable: summary.internet_reachable,
      offline_cache_ready: summary.offline_cache_ready,
      cached_region_available: summary.cached_region_available,
      cached_route_available: summary.cached_route_available,
      operational_readiness: summary.operational_readiness,
      freshness: summary.freshness,
      signal_quality: summary.signal_quality, last_online_at: lastOnlineAt,
      network_type: summary.network_type, quality: summary.quality,
      latency_ms: summary.latency_ms,
      operational_connectivity_state: opConnState,
      hours_since_online: hoursSinceOnline, is_recovering: isRecovering,
    };
  } catch {
    return { ...unavail, availability: 'error' };
  }
}


function _gatherAllInputs(): RiskInputSnapshot {
  return {
    vehicle_capability: _gatherVehicleCapability(),
    vehicle_health: _gatherVehicleHealth(),
    expedition_resources: _gatherExpeditionResources(),
    route_difficulty: _gatherRouteDifficulty(),
    remoteness: _gatherRemoteness(),
    connectivity_status: _gatherConnectivityStatus(),
    captured_at: new Date().toISOString(),
  };
}


// ══════════════════════════════════════════════════════════
// RISK EVALUATION — Phase 4B/4C/4D: Active Scoring
// ══════════════════════════════════════════════════════════

function _computePayloadMarginScore(input: VehicleCapabilityInput): number {
  if (!input.has_specs) return 0;
  if (input.payload_margin_pct == null) return 50;
  if (input.is_overweight) return Math.max(0, 20 + input.payload_margin_pct);
  if (input.payload_margin_pct >= 25) return 100;
  if (input.payload_margin_pct >= 15) return 85;
  if (input.payload_margin_pct >= 5) return 60;
  return 45;
}

function _computeCapabilityTierScore(input: VehicleCapabilityInput): number {
  const m: Record<string, number> = { extreme: 100, aggressive: 85, moderate: 70, mild: 55, stock: 40, unknown: 30 };
  let s = m[input.capability_tier] ?? 30;
  if (input.drivetrain === '4wd') s += 5;
  else if (input.drivetrain === 'awd') s += 3;
  else if (input.drivetrain === '2wd') s -= 10;
  if (input.ground_clearance_delta_inches > 0) s += Math.min(10, input.ground_clearance_delta_inches * 2);
  return Math.max(0, Math.min(100, Math.round(s)));
}

function _computeLoadBalanceScore(input: VehicleCapabilityInput): number {
  if (input.weight_distribution === 'balanced') return 100;
  if (input.weight_distribution === 'moderate_rear') return 60;
  if (input.weight_distribution === 'extreme_rear') return 20;
  return 50;
}

function _computeVehicleHealthScore(input: VehicleHealthInput): number {
  if (!input.has_live_telemetry) return 0;
  let s = 100;
  if (input.battery_health === 'critical') s -= 50;
  else if (input.battery_health === 'low') s -= 30;
  else if (input.battery_health === 'fair') s -= 10;
  if (input.coolant_high) s -= 40;
  else if (input.coolant_warning) s -= 20;
  if (input.fuel_critical) s -= 15;
  if (input.telemetry_freshness === 'stale') s -= 10;
  if (input.spike_suppressed) s -= 5;
  return Math.max(0, Math.min(100, s));
}

function _computeCapabilityScore(cap: VehicleCapabilityInput, health: VehicleHealthInput): number {
  if (cap.availability === 'unavailable' || cap.availability === 'error') {
    const hs = _computeVehicleHealthScore(health);
    return hs > 0 ? hs : 0;
  }
  if (!cap.has_specs) return 0;
  const p = _computePayloadMarginScore(cap);
  const t = _computeCapabilityTierScore(cap);
  const l = _computeLoadBalanceScore(cap);
  const h = _computeVehicleHealthScore(health);
  if (health.has_live_telemetry) {
    return Math.max(0, Math.min(100, Math.round(p * 0.40 + t * 0.25 + l * 0.20 + h * 0.15)));
  }
  return Math.max(0, Math.min(100, Math.round(p * 0.50 + t * 0.30 + l * 0.20)));
}

/**
 * Phase 4D: Compute resource readiness (0–100) with BLU telemetry integration.
 * Fuel, water, and power each contribute a sub-score. BLU sustainability
 * provides a bonus; unsustainable BLU with low battery reduces score.
 */
function _computeResourceReadiness(input: ExpeditionResourcesInput): number {
  if (input.availability === 'unavailable' || input.availability === 'error') return 0;
  const scores: number[] = [];

  // Fuel sub-score
  if (input.fuel_percent != null) {
    if (input.fuel_percent >= 75) scores.push(100);
    else if (input.fuel_percent >= 50) scores.push(80);
    else if (input.fuel_percent >= 25) scores.push(50);
    else if (input.fuel_percent >= 15) scores.push(25);
    else scores.push(10);
  }

  // Water sub-score
  if (input.water_autonomy_days != null) {
    if (input.water_autonomy_days >= 3) scores.push(100);
    else if (input.water_autonomy_days >= 2) scores.push(80);
    else if (input.water_autonomy_days >= 1) scores.push(50);
    else scores.push(15);
  } else if (input.water_gal != null) {
    if (input.water_gal >= 10) scores.push(90);
    else if (input.water_gal >= 5) scores.push(70);
    else if (input.water_gal >= 2) scores.push(50);
    else scores.push(input.water_gal > 0 ? 25 : 10);
  }

  // Power sub-score (Phase 4D: BLU-aware)
  if (input.has_blu_telemetry && input.blu_battery_percent != null) {
    let powerScore: number;
    if (input.blu_battery_percent >= 80) powerScore = 100;
    else if (input.blu_battery_percent >= 50) powerScore = 75;
    else if (input.blu_battery_percent >= 25) powerScore = 45;
    else powerScore = 15;
    // BLU sustainability bonus/penalty
    if (input.blu_power_sustainable) powerScore = Math.min(100, powerScore + 10);
    else if (input.blu_battery_percent < 30) powerScore = Math.max(0, powerScore - 10);
    // Runtime modifier
    if (input.blu_runtime_minutes != null && input.blu_runtime_minutes < 120) {
      powerScore = Math.max(0, powerScore - 10);
    }
    scores.push(powerScore);
  } else if (input.power_percent != null) {
    if (input.power_percent >= 60) scores.push(100);
    else if (input.power_percent >= 30) scores.push(60);
    else scores.push(20);
  }

  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * Phase 4D: Compute route difficulty score (0–100).
 * Uses the pre-computed route_challenge_score from the snapshot.
 */
function _computeRouteDifficultyScore(input: RouteDifficultyInput): number {
  if (input.availability === 'unavailable' || input.availability === 'error') return 0;
  if (!input.has_active_route) return 0;
  return Math.max(0, Math.min(100, input.route_challenge_score));
}

/**
 * Phase 4D: Compute resource-to-route balance (0–100).
 * Higher = better match. Reduced when resources are low relative to route challenge.
 */
function _computeResourceRouteBalance(
  resourceReadiness: number,
  routeDifficulty: number,
): number {
  if (resourceReadiness === 0 && routeDifficulty === 0) return 100; // no data = neutral
  if (routeDifficulty === 0) return 100; // easy/no route = always balanced

  // Balance = resource readiness minus difficulty penalty
  // If resources >> difficulty, balance is high
  // If difficulty >> resources, balance is low
  const surplus = resourceReadiness - routeDifficulty;
  let balance: number;
  if (surplus >= 30) balance = 100;
  else if (surplus >= 10) balance = 85;
  else if (surplus >= 0) balance = 70;
  else if (surplus >= -15) balance = 50;
  else if (surplus >= -30) balance = 30;
  else balance = 10;

  return Math.max(0, Math.min(100, balance));
}

function _computeConnectivityRisk(input: ConnectivityStatusInput): number {
  if (input.availability === 'unavailable' || input.availability === 'error') return 50;
  let risk = OPERATIONAL_CONNECTIVITY_RISK_WEIGHTS[input.operational_connectivity_state]
    ?? OPERATIONAL_CONNECTIVITY_RISK_WEIGHTS.offline_unprepared;
  if (input.signal_quality === 'poor') risk += 5;
  else if (input.signal_quality === 'none') risk += 10;
  if (input.freshness === 'stale') risk += 8;
  if (input.is_recovering) risk -= 5;
  if (input.hours_since_online != null && input.hours_since_online > 12) risk += 5;
  if (input.latency_ms != null && input.latency_ms > 500) risk += 5;
  return Math.max(0, Math.min(100, Math.round(risk)));
}

function _computeIsolationRisk(remoteness: RemotenessInput, route: RouteDifficultyInput): number {
  let risk = 0;
  if (remoteness.remoteness_score != null) risk = remoteness.remoteness_score;
  else risk = 30;
  if (remoteness.route_isolation_score != null) risk += Math.min(10, Math.round(remoteness.route_isolation_score * 0.1));
  if (remoteness.distance_from_services_mi != null && remoteness.distance_from_services_mi > 50) risk += 5;
  if (remoteness.connectivity_signal_score > 10) risk += Math.min(5, Math.round((remoteness.connectivity_signal_score - 10) * 0.5));
  if (remoteness.cache_ready && risk > 30) risk -= 5;
  if (route.terrain_complexity === 'high') risk += 10;
  else if (route.terrain_complexity === 'medium') risk += 5;
  if (!route.has_active_route) risk += 5;
  return Math.max(0, Math.min(100, Math.round(risk)));
}

/**
 * Phase 4D: Determine primary risk factor with resource + route inputs.
 */
function _determinePrimaryRiskFactor(
  snapshot: RiskInputSnapshot,
  capScore: number,
  resScore: number,
  connRisk: number,
  isoRisk: number,
  routeDiffScore: number,
  resourceRouteBalance: number,
): PrimaryRiskFactor {
  const factors: { factor: PrimaryRiskFactor; severity: number }[] = [];

  if (snapshot.vehicle_capability.is_overweight) factors.push({ factor: 'vehicle_overweight', severity: 90 });
  if (snapshot.vehicle_health.coolant_high) factors.push({ factor: 'vehicle_health', severity: 88 });
  if (snapshot.vehicle_health.battery_health === 'critical') factors.push({ factor: 'vehicle_health', severity: 75 });

  // Phase 4D: Resource depletion (multiple resources critically low)
  const resInput = snapshot.expedition_resources;
  const critCount = [resInput.fuel_low, resInput.water_low, resInput.power_limited].filter(Boolean).length;
  if (critCount >= 2) factors.push({ factor: 'resource_depleted', severity: 82 });

  if (resInput.fuel_percent != null && resInput.fuel_percent < 15) factors.push({ factor: 'fuel_critical', severity: 85 });
  if (resInput.water_autonomy_days != null && resInput.water_autonomy_days < 1) factors.push({ factor: 'water_critical', severity: 80 });
  if (resInput.water_gal != null && resInput.water_gal < 1 && resInput.water_autonomy_days == null) factors.push({ factor: 'water_critical', severity: 78 });
  if (resInput.power_percent != null && resInput.power_percent < 15) factors.push({ factor: 'power_critical', severity: 70 });

  // Phase 4D: BLU power unsustainable
  if (resInput.has_blu_telemetry && !resInput.blu_power_sustainable && resInput.blu_battery_percent != null && resInput.blu_battery_percent < 20) {
    factors.push({ factor: 'power_unsustainable', severity: 68 });
  }

  // Phase 4D: Route exceeds capability
  if (snapshot.route_difficulty.route_exceeds_capability && snapshot.route_difficulty.difficulty_vs_capability_delta != null && snapshot.route_difficulty.difficulty_vs_capability_delta > 20) {
    factors.push({ factor: 'route_capability_mismatch', severity: 66 });
  }

  if (snapshot.connectivity_status.operational_connectivity_state === 'offline_unprepared') factors.push({ factor: 'offline_unprepared', severity: 72 });
  if (snapshot.connectivity_status.operational_connectivity_state === 'degraded_unprepared') factors.push({ factor: 'degraded_unprepared', severity: 58 });

  const tier = snapshot.remoteness.remoteness_tier;
  if (tier === 'DEEP REMOTE' || tier === 'EXTREME') factors.push({ factor: 'deep_isolation', severity: 62 });
  else if (snapshot.remoteness.remoteness_score != null && snapshot.remoteness.remoteness_score >= 60) factors.push({ factor: 'high_remoteness', severity: 55 });

  if (snapshot.route_difficulty.terrain_complexity === 'high') factors.push({ factor: 'terrain_difficulty', severity: 50 });
  if (snapshot.vehicle_health.battery_health === 'low') factors.push({ factor: 'vehicle_health', severity: 60 });
  if (snapshot.vehicle_capability.load_imbalanced) factors.push({ factor: 'vehicle_health', severity: 45 });
  if (!snapshot.route_difficulty.has_active_route) factors.push({ factor: 'no_route', severity: 20 });

  if (factors.length === 0) return 'none';
  if (factors.length >= 3) return 'multiple_concerns';
  factors.sort((a, b) => b.severity - a.severity);
  return factors[0].factor;
}

function _determineOperationalStatus(riskScore: number): OperationalStatus {
  if (riskScore <= 25) return 'optimal';
  if (riskScore <= 50) return 'caution';
  if (riskScore <= 75) return 'elevated';
  return 'critical';
}

/**
 * Phase 4D: Generate summary line with resource + route factors.
 */
function _generateSummaryLine(
  status: OperationalStatus, factor: PrimaryRiskFactor,
  availableInputs: number, totalInputs: number,
): string {
  if (availableInputs === 0) return 'Awaiting data\u2026';
  if (availableInputs < totalInputs / 2) return 'Limited data \u2014 partial assessment';

  switch (status) {
    case 'optimal': return 'All systems nominal';
    case 'caution':
      switch (factor) {
        case 'fuel_critical': return 'Fuel reserves low';
        case 'water_critical': return 'Water reserves low';
        case 'power_unsustainable': return 'Power draw exceeds input';
        case 'route_capability_mismatch': return 'Route may exceed vehicle capability';
        case 'resource_depleted': return 'Multiple resources running low';
        case 'no_connectivity': return 'Connectivity limited';
        case 'degraded_unprepared': return 'Degraded connectivity \u2014 no cache';
        case 'high_remoteness': return 'Remote area \u2014 monitor conditions';
        case 'no_route': return 'No route loaded';
        case 'vehicle_health': return 'Vehicle health concern';
        default: return 'Minor concerns detected';
      }
    case 'elevated':
      switch (factor) {
        case 'vehicle_overweight': return 'Vehicle overweight \u2014 reduce load';
        case 'fuel_critical': return 'Fuel critical \u2014 resupply needed';
        case 'water_critical': return 'Water critical \u2014 resupply needed';
        case 'resource_depleted': return 'Resources depleted \u2014 resupply urgently';
        case 'power_unsustainable': return 'Power unsustainable \u2014 reduce load or charge';
        case 'route_capability_mismatch': return 'Route exceeds vehicle capability \u2014 reassess';
        case 'deep_isolation': return 'Deep isolation \u2014 limited support access';
        case 'offline_unprepared': return 'Offline \u2014 no cached data available';
        case 'vehicle_health': return 'Vehicle health alert \u2014 review telemetry';
        case 'multiple_concerns': return 'Multiple concerns \u2014 review systems';
        default: return 'Elevated risk \u2014 review conditions';
      }
    case 'critical':
      switch (factor) {
        case 'vehicle_overweight': return 'OVERWEIGHT \u2014 immediate action required';
        case 'fuel_critical': return 'FUEL CRITICAL \u2014 immediate resupply';
        case 'water_critical': return 'WATER CRITICAL \u2014 immediate resupply';
        case 'resource_depleted': return 'RESOURCES DEPLETED \u2014 immediate resupply';
        case 'power_unsustainable': return 'POWER CRITICAL \u2014 unsustainable draw';
        case 'route_capability_mismatch': return 'ROUTE EXCEEDS CAPABILITY \u2014 turn back';
        case 'vehicle_health': return 'VEHICLE HEALTH CRITICAL \u2014 stop and assess';
        case 'deep_isolation': return 'EXTREME ISOLATION \u2014 high exposure';
        case 'offline_unprepared': return 'OFFLINE \u2014 NO CACHE \u2014 high exposure';
        case 'multiple_concerns': return 'MULTIPLE CRITICAL ISSUES';
        default: return 'Critical risk \u2014 immediate review';
      }
  }
}


/**
 * Phase 4E: Run a complete risk evaluation cycle.
 *
 * Finalized 7-factor weighted composite scoring model:
 *   - Isolation risk:              22%  (environmental)
 *   - Connectivity risk:           17%  (environmental)
 *   - Resource readiness (inv):    18%  (supplies)
 *   - Vehicle capability (inv):    13%  (vehicle)
 *   - Vehicle health (inv):        10%  (vehicle)
 *   - Route difficulty:            10%  (route)
 *   - Resource-route balance (inv): 10% (cross-factor)
 *   + Route-capability mismatch amplifier: up to +10
 *
 * Operational status is determined from the raw score but
 * stabilized via hysteresis in the store to prevent flicker.
 */
function _evaluate(trigger: 'periodic' | 'signal_change' | 'manual' = 'periodic'): void {
  const startMs = Date.now();

  try {
    const snapshot = _gatherAllInputs();

    // ── Phase 15: Input change detection — skip redundant evaluations ──
    // On periodic triggers, skip if inputs haven't changed since last evaluation.
    // Signal-change and manual triggers always proceed.
    const currentHash = hashRiskInputs(snapshot);
    if (trigger === 'periodic' && currentHash === _lastInputHash) {
      // Inputs unchanged — skip evaluation to reduce CPU usage
      return;
    }
    _lastInputHash = currentHash;

    const categories = [
      snapshot.vehicle_capability, snapshot.vehicle_health,
      snapshot.expedition_resources, snapshot.route_difficulty,
      snapshot.remoteness, snapshot.connectivity_status,
    ];
    const availableInputs = categories.filter(c => c.availability === 'available' || c.availability === 'stale').length;
    const totalInputs = categories.length;

    // ── Phase 4E: Compute all 7 sub-scores independently ──
    const capabilityScore = _computeCapabilityScore(snapshot.vehicle_capability, snapshot.vehicle_health);
    const healthScore = _computeVehicleHealthScore(snapshot.vehicle_health);
    const resourceReadiness = _computeResourceReadiness(snapshot.expedition_resources);
    const connectivityRisk = _computeConnectivityRisk(snapshot.connectivity_status);
    const isolationRisk = _computeIsolationRisk(snapshot.remoteness, snapshot.route_difficulty);
    const routeDifficultyScore = _computeRouteDifficultyScore(snapshot.route_difficulty);
    const resourceRouteBalance = _computeResourceRouteBalance(resourceReadiness, routeDifficultyScore);

    // ── Phase 4E: Finalized 7-factor weighted composite ──
    const inverseCapability = 100 - capabilityScore;
    const inverseHealth = 100 - healthScore;
    const inverseResources = 100 - resourceReadiness;
    const inverseBalance = 100 - resourceRouteBalance;

    let compositeRisk = Math.round(
      isolationRisk      * 0.22 +
      connectivityRisk   * 0.17 +
      inverseResources   * 0.18 +
      inverseCapability  * 0.13 +
      inverseHealth      * 0.10 +
      routeDifficultyScore * 0.10 +
      inverseBalance     * 0.10
    );

    // No data = no risk assertion
    if (availableInputs === 0) compositeRisk = 0;
    compositeRisk = Math.max(0, Math.min(100, compositeRisk));

    // Phase 4D/4E: Route-capability mismatch amplifier (up to +10)
    if (snapshot.route_difficulty.route_exceeds_capability && snapshot.route_difficulty.difficulty_vs_capability_delta != null) {
      const amp = Math.min(10, Math.round(snapshot.route_difficulty.difficulty_vs_capability_delta * 0.2));
      compositeRisk = Math.min(100, compositeRisk + amp);
    }

    // ── Phase 15: Validate risk score for sanity ──
    // Flag extreme scores (>95) or sudden jumps (>30 points) before updating the store.
    const validation = validateRiskScore(compositeRisk, _previousRiskScore);
    if (validation.flagged) {
      stabilityLog('RiskEngine', 'warn', `Score validation flagged: ${validation.reason}`, {
        newScore: compositeRisk,
        previousScore: _previousRiskScore,
        trigger,
      });
    }
    // Use the clamped score from validation (ensures 0–100 range)
    compositeRisk = validation.score;
    _previousRiskScore = compositeRisk;

    // Phase 4E: Raw operational status (stabilization happens in the store)
    const rawOperationalStatus = availableInputs === 0 ? 'optimal' as OperationalStatus : _determineOperationalStatus(compositeRisk);
    const primaryRiskFactor = availableInputs === 0 ? 'none' as PrimaryRiskFactor
      : _determinePrimaryRiskFactor(snapshot, capabilityScore, resourceReadiness, connectivityRisk, isolationRisk, routeDifficultyScore, resourceRouteBalance);
    const summaryLine = _generateSummaryLine(rawOperationalStatus, primaryRiskFactor, availableInputs, totalInputs);

    // Phase 4E: Log sub-scores for diagnostics
    console.log(
      `${TAG} [4E] Sub-scores: cap=${capabilityScore} health=${healthScore} ` +
      `res=${resourceReadiness} conn=${connectivityRisk} iso=${isolationRisk} ` +
      `route=${routeDifficultyScore} balance=${resourceRouteBalance} → composite=${compositeRisk}`
    );

    const evaluation: RiskEvaluation = {
      risk_score: compositeRisk,
      capability_score: capabilityScore,
      health_score: healthScore,
      resource_readiness: resourceReadiness,
      connectivity_risk: connectivityRisk,
      isolation_risk: isolationRisk,
      route_difficulty_score: routeDifficultyScore,
      resource_route_balance: resourceRouteBalance,
      operational_status: rawOperationalStatus,
      primary_risk_factor: primaryRiskFactor,
      summary_line: summaryLine,
      available_inputs: availableInputs,
      total_inputs: totalInputs,
      is_complete: availableInputs === totalInputs,
      evaluated_at: new Date().toISOString(),
    };

    expeditionRiskStore.updateInputSnapshot(snapshot);
    expeditionRiskStore.updateEvaluation(evaluation, trigger);
    _lastEvalTimestamp = Date.now();

    const elapsedMs = Date.now() - startMs;
    if (elapsedMs > MAX_EVAL_TIME_MS) {
      stabilityLog('RiskEngine', 'warn', `Evaluation took ${elapsedMs}ms (threshold: ${MAX_EVAL_TIME_MS}ms)`);
    }
  } catch (e) {
    stabilityLog('RiskEngine', 'error', 'Evaluation failed', e);
  }
}



// ══════════════════════════════════════════════════════════
// SIGNAL CHANGE SUBSCRIPTIONS — Phase 4E
// ══════════════════════════════════════════════════════════

function _subscribeToSignals(): void {
  try {
    const { remotenessStore } = require('./remotenessStore');
    _subscriptions.push(remotenessStore.subscribe(() => _debouncedEvaluate('signal_change')));
  } catch {}

  try {
    const { connectivityIntelStore } = require('./connectivityIntelStore');
    _subscriptions.push(connectivityIntelStore.subscribe(() => _debouncedEvaluate('signal_change')));
  } catch {}

  try {
    const { vehicleTelemetryStore } = require('../src/vehicle-telemetry/VehicleTelemetryStore');
    _subscriptions.push(vehicleTelemetryStore.subscribe(() => _debouncedEvaluate('signal_change')));
  } catch {}

  try {
    const { vehicleSpecStore } = require('./vehicleSpecStore');
    _subscriptions.push(vehicleSpecStore.subscribe(() => _debouncedEvaluate('signal_change')));
  } catch {}

  try {
    const { loadoutWeightCache } = require('./loadoutWeightCache');
    _subscriptions.push(loadoutWeightCache.subscribe(() => _debouncedEvaluate('signal_change')));
  } catch {}

  try {
    const { vehicleStore } = require('./vehicleStore');
    _subscriptions.push(vehicleStore.subscribe(() => _debouncedEvaluate('signal_change')));
  } catch {}

  try {
    const { tiresLiftStore } = require('./tiresLiftStore');
    _subscriptions.push(tiresLiftStore.subscribe(() => _debouncedEvaluate('signal_change')));
  } catch {}

  try {
    const { routeStore } = require('./routeStore');
    _subscriptions.push(routeStore.subscribe(() => _debouncedEvaluate('signal_change')));
  } catch {}

  // ── Phase 4D: BLU state changes ──
  try {
    const { bluStateStore } = require('../src/power/blu/BluStateStore');
    _subscriptions.push(bluStateStore.subscribe(() => _debouncedEvaluate('signal_change')));
  } catch {}

  // ── Phase 4D: Consumables changes ──
  try {
    const { consumablesStore } = require('./consumablesStore');
    _subscriptions.push(consumablesStore.subscribe(() => _debouncedEvaluate('signal_change')));
  } catch {}

  // ── Phase 4D: Mission expedition changes ──
  try {
    const { missionExpeditionStore } = require('./missionStore');
    _subscriptions.push(missionExpeditionStore.subscribe(() => _debouncedEvaluate('signal_change')));
  } catch {}

  console.log(`${TAG} [4E] Signal subscriptions: ${_subscriptions.length}`);
}

function _unsubscribeFromSignals(): void {
  for (const unsub of _subscriptions) { try { unsub(); } catch {} }
  _subscriptions = [];
}

function _debouncedEvaluate(trigger: 'signal_change'): void {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => { _debounceTimer = null; _evaluate(trigger); }, SIGNAL_DEBOUNCE_MS);
}


// ══════════════════════════════════════════════════════════
// PUBLIC API — Phase 4E
// ══════════════════════════════════════════════════════════

export const expeditionRiskEngine = {
  initialize(): void {
    if (expeditionRiskStore.isInitialized()) return;
    console.log(`${TAG} Initializing (Phase 4E)...`);
    expeditionRiskStore.restore();
    expeditionRiskStore.setInitialized(true);
    console.log(`${TAG} Initialized`);
  },

  start(): void {
    if (expeditionRiskStore.isRunning()) return;
    if (!expeditionRiskStore.isInitialized()) expeditionRiskEngine.initialize();
    console.log(`${TAG} Starting (Phase 4E)...`);
    expeditionRiskStore.setRunning(true);
    _subscribeToSignals();
    _evaluate('manual');
    _periodicTimer = setInterval(() => _evaluate('periodic'), EVALUATION_INTERVAL_MS);
    console.log(`${TAG} Started (interval: ${EVALUATION_INTERVAL_MS}ms, subs: ${_subscriptions.length})`);
  },

  stop(): void {
    if (!expeditionRiskStore.isRunning()) return;
    if (_periodicTimer) { clearInterval(_periodicTimer); _periodicTimer = null; }
    if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
    _unsubscribeFromSignals();
    expeditionRiskStore.persist();
    expeditionRiskStore.setRunning(false);
    console.log(`${TAG} Stopped`);
  },

  evaluate(): void { _evaluate('manual'); },

  reset(): void {
    expeditionRiskEngine.stop();
    expeditionRiskStore.reset();
    _lastEvalTimestamp = 0;
    _prevCoolantTempF = null;
    _prevBatteryVoltage = null;
    console.log(`${TAG} Reset complete`);
  },

  getEvaluationIntervalMs(): number { return EVALUATION_INTERVAL_MS; },
  getDebounceMs(): number { return SIGNAL_DEBOUNCE_MS; },
  getLastEvalTimestamp(): number { return _lastEvalTimestamp; },
  getSubscriptionCount(): number { return _subscriptions.length; },
};


