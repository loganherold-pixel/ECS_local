/**
 * ═══════════════════════════════════════════════════════════
 * ECS AI EXPEDITION ASSISTANT — Context Engine (Phase 7A + 7B + 7D)
 * ═══════════════════════════════════════════════════════════
 *
 * Assembles a normalized context snapshot from all major ECS
 * systems for consumption by the AI Expedition Assistant.
 *
 * Context ingestion is permission-safe — only reads data that
 * is already available to the app. Never blocks or interrupts
 * critical ECS systems.
 *
 * Uses lazy require() to avoid circular dependencies and to
 * gracefully handle systems that may not be initialized.
 *
 * Source Systems:
 *   - vehicleStore + vehicleSpecStore → vehicle_profile
 *   - VehicleTelemetryStore → vehicle_health
 *   - loadoutStore + loadoutWeightCache → loadout_status
 *   - PowerDeviceStore → power_status
 *   - connectivityIntelStore → connectivity_status
 *   - remotenessStore → remoteness_status
 *   - expeditionRiskStore → risk_status
 *   - routeStore → route_context
 *   - offlineExpeditionDbStore → offline_readiness
 *
 * Phase 7A: Architecture foundation — context assembly.
 * Phase 7B: Enhanced assembly with deeper data extraction,
 *           improved error handling, and richer diagnostics.
 * Phase 7D: Context delta computation between snapshots.
 */

import type {
  AssistantContextSnapshot,
  AssistantContextDiagnostics,
  ContextDiagnosticEntry,
  ContextAvailability,
  VehicleProfileContext,
  VehicleHealthContext,
  LoadoutStatusContext,
  PowerStatusContext,
  ConnectivityStatusContext,
  RemotenessStatusContext,
  RiskStatusContext,
  RouteContextData,
  OfflineReadinessContext,
  AssistantContextCategory,
  ContextDelta,
  ContextChange,
} from './assistantTypes';
import { createDefaultAssistantContextSnapshot, ASSISTANT_CONTEXT_CATEGORIES } from './assistantTypes';

const TAG = '[AI-ASSISTANT-CTX]';




// ── Vehicle Profile Context ──────────────────────────────

function _assembleVehicleProfile(): VehicleProfileContext {
  const ctx: VehicleProfileContext = {
    availability: 'unavailable',
    vehicle_name: null,
    vehicle_type: null,
    make: null,
    model: null,
    gvwr_lb: null,
    base_weight_lb: null,
    fuel_tank_capacity_gal: null,
    fuel_type: null,
    has_specs: false,
  };

  try {
    const { vehicleStore } = require('./vehicleStore');
    const vehicle = vehicleStore.getActive?.() || vehicleStore.get?.();
    if (vehicle) {
      ctx.vehicle_name = vehicle.name || vehicle.label || null;
      ctx.vehicle_type = vehicle.vehicleType || vehicle.type || null;
      ctx.make = vehicle.make || null;
      ctx.model = vehicle.model || null;

      // Get specs
      try {
        const { vehicleSpecStore } = require('./vehicleSpecStore');
        const vehicleId = vehicle.id || vehicle.vehicleId;
        if (vehicleId) {
          const spec = vehicleSpecStore.get(vehicleId);
          if (spec) {
            ctx.gvwr_lb = spec.gvwr_lb || null;
            ctx.base_weight_lb = spec.base_weight_lb || null;
            ctx.fuel_tank_capacity_gal = spec.fuel_tank_capacity_gal || null;
            ctx.fuel_type = spec.fuel_type || null;
            ctx.has_specs = true;
            ctx.availability = 'available';
          } else {
            ctx.availability = 'stale';
          }
        } else {
          ctx.availability = 'stale';
        }
      } catch {
        ctx.availability = 'stale';
      }
    }
  } catch (e) {
    console.warn(TAG, 'Vehicle profile assembly error:', e);
    ctx.availability = 'error';
  }

  return ctx;
}


// ── Vehicle Health Context ───────────────────────────────

function _assembleVehicleHealth(): VehicleHealthContext {
  const ctx: VehicleHealthContext = {
    availability: 'unavailable',
    has_live_telemetry: false,
    engine_status: 'unknown',
    battery_voltage: null,
    battery_health: 'unknown',
    fuel_percent: null,
    coolant_temp_f: null,
    has_anomaly: false,
    anomaly_flags: [],
    telemetry_freshness: 'disconnected',
  };

  try {
    // Runtime fix: Use the lowercase singleton export (vehicleTelemetryStore),
    // NOT the class name (VehicleTelemetryStore). The class is not re-exported
    // as a usable instance. Use getSummary() for widget-safe data and
    // getLatestTelemetry() for raw readings.
    let store: any = null;
    try {
      store = require('../src/vehicle-telemetry/VehicleTelemetryStore');
    } catch {
      try {
        store = require('../vehicle-telemetry/VehicleTelemetryStore');
      } catch {}
    }

    const vts = store?.vehicleTelemetryStore;
    if (!vts) return ctx;

    const summary = vts.getSummary?.();
    if (!summary || !summary.has_data) return ctx;

    ctx.has_live_telemetry = true;
    ctx.availability = 'available';
    ctx.telemetry_freshness = vts.getFreshnessLabel?.() ?? 'live';

    // Read from summary (canonical widget-safe fields)
    ctx.battery_voltage = summary.battery_voltage ?? null;
    ctx.fuel_percent = summary.fuel_level ?? null;
    ctx.coolant_temp_f = summary.coolant_temp ?? null;
    ctx.engine_status = summary.engine_status ?? 'unknown';

    // Battery health derivation
    if (ctx.battery_voltage != null) {
      if (ctx.battery_voltage >= 12.4) ctx.battery_health = 'good';
      else if (ctx.battery_voltage >= 12.0) ctx.battery_health = 'fair';
      else ctx.battery_health = 'low';
    }

    // Anomaly detection
    const flags: string[] = [];
    if (ctx.battery_voltage != null && ctx.battery_voltage < 11.8) flags.push('low_battery_voltage');
    if (ctx.coolant_temp_f != null && ctx.coolant_temp_f > 230) flags.push('high_coolant_temp');
    if (ctx.fuel_percent != null && ctx.fuel_percent < 10) flags.push('critically_low_fuel');

    // Check raw telemetry for additional flags
    try {
      const raw = vts.getLatestTelemetry?.();
      if (raw) {
        if (raw.check_engine || raw.checkEngine) flags.push('check_engine_light');
        if (raw.oil_pressure_low || raw.oilPressureLow) flags.push('low_oil_pressure');
      }
    } catch {}

    if (flags.length > 0) {
      ctx.has_anomaly = true;
      ctx.anomaly_flags = flags;
    }
  } catch {
    // Vehicle telemetry not available — this is normal
  }

  return ctx;
}



// ── Loadout Status Context ───────────────────────────────

function _assembleLoadoutStatus(): LoadoutStatusContext {
  const ctx: LoadoutStatusContext = {
    availability: 'unavailable',
    has_active_loadout: false,
    loadout_name: null,
    total_items: 0,
    packed_items: 0,
    critical_items: 0,
    critical_missing: 0,
    readiness_pct: 0,
    total_weight_lbs: null,
    payload_margin_lb: null,
    is_overweight: false,
  };

  try {
    const { loadoutWeightCache } = require('./loadoutWeightCache');
    const cache = loadoutWeightCache.getAll?.();
    if (cache && Object.keys(cache).length > 0) {
      const firstKey = Object.keys(cache)[0];
      const data = cache[firstKey];
      if (data) {
        ctx.has_active_loadout = true;
        ctx.loadout_name = data.loadout_name ?? data.name ?? firstKey;
        ctx.total_items = data.item_count ?? data.total_items ?? 0;
        ctx.packed_items = data.packed_count ?? data.packed_items ?? 0;
        ctx.critical_items = data.critical_count ?? data.critical_items ?? 0;
        ctx.critical_missing = data.critical_missing ?? 0;
        ctx.readiness_pct = data.readiness_pct ?? (ctx.total_items > 0 ? Math.round((ctx.packed_items / ctx.total_items) * 100) : 0);
        ctx.total_weight_lbs = data.total_weight_lbs ?? data.total_weight ?? null;
        ctx.payload_margin_lb = data.payload_margin_lb ?? null;
        ctx.is_overweight = data.is_overweight ?? (ctx.payload_margin_lb != null && ctx.payload_margin_lb < 0);
        ctx.availability = 'available';
      }
    }
  } catch {
    // Loadout cache not available
  }

  return ctx;
}


// ── Power Status Context ─────────────────────────────────

function _assemblePowerStatus(): PowerStatusContext {
  const ctx: PowerStatusContext = {
    availability: 'unavailable',
    has_blu_telemetry: false,
    battery_percent: null,
    input_watts: null,
    output_watts: null,
    runtime_minutes: null,
    is_sustainable: false,
    device_count: 0,
  };

  try {
    // Runtime fix: Use bluStateStore.getSummary() — the canonical BLU telemetry
    // source. PowerDeviceStore only stores device ID selections (async API),
    // NOT live telemetry data. The previous code used PowerDeviceStore.getAll()
    // which is async and returns device IDs, not telemetry.
    const { bluStateStore } = require('../src/power/blu/BluStateStore');
    const summary = bluStateStore.getSummary();

    if (summary && summary.available) {
      ctx.has_blu_telemetry = true;
      ctx.availability = 'available';
      ctx.device_count = 1; // BLU aggregates to primary device
      ctx.battery_percent = summary.battery_percent ?? null;
      ctx.input_watts = summary.live_input ?? null;
      ctx.output_watts = summary.live_output ?? null;
      ctx.runtime_minutes = summary.runtime_remaining ?? null;
      ctx.is_sustainable = (ctx.input_watts ?? 0) >= (ctx.output_watts ?? 0);
    }
  } catch {
    // Power system not available — graceful degradation
  }

  return ctx;
}



// ── Connectivity Status Context ──────────────────────────

function _assembleConnectivityStatus(): ConnectivityStatusContext {
  const ctx: ConnectivityStatusContext = {
    availability: 'unavailable',
    connectivity_state: 'unknown',
    signal_quality: 'unknown',
    internet_reachable: false,
    offline_cache_ready: false,
    operational_readiness: 'offline_unprepared',
    freshness: 'offline',
    network_type: 'unknown',
  };

  try {
    const { connectivityIntelStore } = require('./connectivityIntelStore');
    if (connectivityIntelStore.isInitialized()) {
      const summary = connectivityIntelStore.getSummary();
      if (summary) {
        ctx.connectivity_state = summary.connectivity_state || 'unknown';
        ctx.signal_quality = summary.signal_quality || 'unknown';
        ctx.internet_reachable = summary.internet_reachable || false;
        ctx.offline_cache_ready = summary.offline_cache_ready || false;
        ctx.operational_readiness = summary.operational_readiness || 'offline_unprepared';
        ctx.freshness = summary.freshness || 'offline';
        ctx.network_type = summary.network_type || 'unknown';
        ctx.availability = summary.is_live ? 'available' : 'stale';
      }
    }
  } catch {
    // CI not available
  }

  return ctx;
}


// ── Remoteness Status Context ────────────────────────────

function _assembleRemotenessStatus(): RemotenessStatusContext {
  const ctx: RemotenessStatusContext = {
    availability: 'unavailable',
    remoteness_score: null,
    remoteness_tier: null,
    engine_running: false,
    cache_ready: false,
  };

  try {
    const { remotenessStore } = require('./remotenessStore');
    if (remotenessStore.isRunning()) {
      const output = remotenessStore.get();
      if (output) {
        ctx.remoteness_score = output.score;
        ctx.remoteness_tier = output.tier;
        ctx.engine_running = true;
        ctx.cache_ready = output.signals?.cacheReady || false;
        ctx.availability = 'available';
      }
    }
  } catch {
    // Remoteness not available
  }

  return ctx;
}


// ── Risk Status Context ──────────────────────────────────
// Integration Pass 4: Enhanced to read route_difficulty_score,
// resource_route_balance, health_score, and stabilized_status
// from the Risk Engine summary. Uses the bridge's canonical
// interpretation to prevent contradictions with the dashboard.

function _assembleRiskStatus(): RiskStatusContext {
  const ctx: RiskStatusContext = {
    availability: 'unavailable',
    risk_score: 0,
    operational_status: 'optimal',
    primary_risk_factor: 'none',
    primary_risk_label: 'No Concerns',
    capability_score: 0,
    resource_readiness: 0,
    connectivity_risk: 0,
    isolation_risk: 0,
    summary_line: 'Awaiting data\u2026',
    is_complete: false,
    route_difficulty_score: 0,
    resource_route_balance: 100,
    health_score: 0,
    stabilized_status: 'optimal',
  };

  try {
    const { expeditionRiskStore } = require('./expeditionRiskStore');
    if (expeditionRiskStore.isInitialized()) {
      const summary = expeditionRiskStore.getSummary();
      const stabilizedStatus = expeditionRiskStore.getStabilizedStatus();
      const evaluation = expeditionRiskStore.getEvaluation();

      if (summary) {
        ctx.risk_score = summary.risk_score;
        // Integration Pass 4: Use stabilized status (hysteresis-protected)
        // to match the dashboard Risk Indicator exactly
        ctx.operational_status = stabilizedStatus || summary.operational_status;
        ctx.stabilized_status = stabilizedStatus || summary.operational_status;
        ctx.primary_risk_factor = summary.primary_risk_factor;
        ctx.primary_risk_label = summary.primary_risk_label;
        ctx.capability_score = summary.capability_score;
        ctx.resource_readiness = summary.resource_readiness;
        ctx.connectivity_risk = summary.connectivity_risk;
        ctx.isolation_risk = summary.isolation_risk;
        ctx.summary_line = summary.summary_line;
        ctx.is_complete = summary.is_complete;
        // Integration Pass 4: Read expanded sub-scores
        ctx.route_difficulty_score = summary.route_difficulty_score ?? 0;
        ctx.resource_route_balance = summary.resource_route_balance ?? 100;
        // Read health_score from evaluation (not in summary)
        ctx.health_score = evaluation?.health_score ?? 0;
        ctx.availability = summary.is_complete ? 'available' : 'stale';
      }
    }
  } catch {
    // Risk engine not available — this is non-fatal
  }

  return ctx;
}



// ── Route Context ────────────────────────────────────────

function _assembleRouteContext(): RouteContextData {
  const ctx: RouteContextData = {
    availability: 'unavailable',
    has_active_route: false,
    route_name: null,
    total_distance_mi: null,
    elevation_gain_ft: null,
    waypoint_count: 0,
    segment_count: 0,
    source_format: null,
  };

  try {
    const { routeStore } = require('./routeStore');
    const activeRoute = routeStore.getActive();
    if (activeRoute) {
      ctx.has_active_route = true;
      ctx.route_name = activeRoute.name || null;
      ctx.total_distance_mi = activeRoute.total_distance_miles || activeRoute.totalDistanceMi || null;
      ctx.elevation_gain_ft = activeRoute.elevation_gain_ft || activeRoute.elevationGainFt || null;
      ctx.waypoint_count = activeRoute.waypoint_count || activeRoute.waypointCount || (activeRoute.waypoints?.length ?? 0);
      ctx.segment_count = activeRoute.segment_count || activeRoute.segmentCount || (activeRoute.segments?.length ?? 0);
      ctx.source_format = activeRoute.source_format || activeRoute.sourceFormat || null;
      ctx.availability = 'available';
    }
  } catch {
    // Route store not available
  }

  return ctx;
}


// ── Offline Readiness Context ────────────────────────────

function _assembleOfflineReadiness(): OfflineReadinessContext {
  const ctx: OfflineReadinessContext = {
    availability: 'unavailable',
    has_offline_data: false,
    downloaded_regions: 0,
    total_entries: 0,
    storage_mb: 0,
    covers_current_position: false,
    covers_active_route: false,
    available_categories: [],
    all_regions_valid: false,
  };

  try {
    const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
    if (offlineExpeditionDbStore.isInitialized()) {
      const readiness = offlineExpeditionDbStore.evaluateReadiness();
      if (readiness) {
        ctx.has_offline_data = readiness.has_offline_data;
        ctx.downloaded_regions = readiness.downloaded_regions;
        ctx.total_entries = readiness.total_entries;
        ctx.storage_mb = readiness.storage_mb;
        ctx.covers_current_position = readiness.covers_current_position;
        ctx.covers_active_route = readiness.covers_active_route;
        ctx.available_categories = readiness.available_categories || [];
        ctx.all_regions_valid = readiness.all_regions_valid || false;
        ctx.availability = readiness.has_offline_data ? 'available' : 'unavailable';
      }
    }
  } catch {
    // Offline DB not available
  }

  return ctx;
}


// ══════════════════════════════════════════════════════════
// PUBLIC API — Context Assembly
// ══════════════════════════════════════════════════════════

/**
 * Assemble a complete context snapshot from all ECS systems.
 *
 * This is the primary entry point for the assistant to gather
 * context. Each category is assembled independently — if one
 * system fails, the others still contribute.
 *
 * Performance: ~1–5ms typical (all synchronous reads).
 */
export function assembleContextSnapshot(): AssistantContextSnapshot {
  const startTime = Date.now();

  const snapshot = createDefaultAssistantContextSnapshot();

  // Assemble each category independently
  snapshot.vehicle_profile = _assembleVehicleProfile();
  snapshot.vehicle_health = _assembleVehicleHealth();
  snapshot.loadout_status = _assembleLoadoutStatus();
  snapshot.power_status = _assemblePowerStatus();
  snapshot.connectivity_status = _assembleConnectivityStatus();
  snapshot.remoteness_status = _assembleRemotenessStatus();
  snapshot.risk_status = _assembleRiskStatus();
  snapshot.route_context = _assembleRouteContext();
  snapshot.offline_readiness = _assembleOfflineReadiness();

  // Compute availability counts
  const categories: ContextAvailability[] = [
    snapshot.vehicle_profile.availability,
    snapshot.vehicle_health.availability,
    snapshot.loadout_status.availability,
    snapshot.power_status.availability,
    snapshot.connectivity_status.availability,
    snapshot.remoteness_status.availability,
    snapshot.risk_status.availability,
    snapshot.route_context.availability,
    snapshot.offline_readiness.availability,
  ];

  snapshot.available_count = categories.filter(a => a === 'available' || a === 'stale').length;
  snapshot.total_count = categories.length;
  snapshot.is_complete = snapshot.available_count === snapshot.total_count;
  snapshot.assembled_at = new Date().toISOString();

  const elapsed = Date.now() - startTime;
  console.log(TAG, `Context assembled: ${snapshot.available_count}/${snapshot.total_count} categories available (${elapsed}ms)`);

  return snapshot;
}


/**
 * Build a diagnostics report showing what context is available.
 */
export function buildContextDiagnostics(snapshot?: AssistantContextSnapshot): AssistantContextDiagnostics {
  const ctx = snapshot || assembleContextSnapshot();

  const categoryMap: Record<AssistantContextCategory, {
    availability: ContextAvailability;
    source: string;
    summary: string;
  }> = {
    vehicle_profile: {
      availability: ctx.vehicle_profile.availability,
      source: 'vehicleStore + vehicleSpecStore',
      summary: ctx.vehicle_profile.has_specs
        ? `${ctx.vehicle_profile.vehicle_name || 'Vehicle'} (GVWR: ${ctx.vehicle_profile.gvwr_lb || '?'} lb)`
        : 'No vehicle specs configured',
    },
    vehicle_health: {
      availability: ctx.vehicle_health.availability,
      source: 'VehicleTelemetryStore',
      summary: ctx.vehicle_health.has_live_telemetry
        ? `Live telemetry (${ctx.vehicle_health.telemetry_freshness})${ctx.vehicle_health.has_anomaly ? ' — ANOMALIES DETECTED' : ''}`
        : 'No live telemetry connected',
    },
    loadout_status: {
      availability: ctx.loadout_status.availability,
      source: 'loadoutStore + loadoutWeightCache',
      summary: ctx.loadout_status.has_active_loadout
        ? `${ctx.loadout_status.total_items} items, ${ctx.loadout_status.readiness_pct}% ready${ctx.loadout_status.critical_missing > 0 ? ` — ${ctx.loadout_status.critical_missing} CRITICAL MISSING` : ''}`
        : 'No active loadout',
    },
    power_status: {
      availability: ctx.power_status.availability,
      source: 'PowerDeviceStore',
      summary: ctx.power_status.has_blu_telemetry
        ? `${ctx.power_status.device_count} device(s), ${ctx.power_status.battery_percent ?? '?'}% battery${ctx.power_status.is_sustainable ? '' : ' — NOT SUSTAINABLE'}`
        : 'No power devices connected',
    },
    connectivity_status: {
      availability: ctx.connectivity_status.availability,
      source: 'connectivityIntelStore',
      summary: `${ctx.connectivity_status.connectivity_state} (${ctx.connectivity_status.freshness})`,
    },
    remoteness_status: {
      availability: ctx.remoteness_status.availability,
      source: 'remotenessStore',
      summary: ctx.remoteness_status.engine_running
        ? `Score: ${ctx.remoteness_status.remoteness_score}, Tier: ${ctx.remoteness_status.remoteness_tier}`
        : 'Remoteness engine not running',
    },
    risk_status: {
      availability: ctx.risk_status.availability,
      source: 'expeditionRiskStore',
      summary: ctx.risk_status.is_complete
        ? `Risk: ${ctx.risk_status.risk_score}/100 (${ctx.risk_status.operational_status})`
        : ctx.risk_status.summary_line,
    },
    route_context: {
      availability: ctx.route_context.availability,
      source: 'routeStore',
      summary: ctx.route_context.has_active_route
        ? `${ctx.route_context.route_name} (${ctx.route_context.total_distance_mi?.toFixed(1) || '?'} mi)`
        : 'No active route',
    },
    offline_readiness: {
      availability: ctx.offline_readiness.availability,
      source: 'offlineExpeditionDbStore',
      summary: ctx.offline_readiness.has_offline_data
        ? `${ctx.offline_readiness.downloaded_regions} region(s), ${ctx.offline_readiness.total_entries} entries${ctx.offline_readiness.all_regions_valid ? '' : ' — INTEGRITY ISSUES'}`
        : 'No offline data cached',
    },
  };

  const entries: ContextDiagnosticEntry[] = ASSISTANT_CONTEXT_CATEGORIES.map(cat => ({
    category: cat,
    availability: categoryMap[cat].availability,
    source_module: categoryMap[cat].source,
    last_updated: ctx.assembled_at,
    data_summary: categoryMap[cat].summary,
  }));

  const availableCount = entries.filter(e =>
    e.availability === 'available' || e.availability === 'stale'
  ).length;

  return {
    entries,
    available_count: availableCount,
    total_count: entries.length,
    completeness_pct: Math.round((availableCount / entries.length) * 100),
    evaluated_at: new Date().toISOString(),
  };
}


/**
 * Serialize the context snapshot into a compact text summary
 * suitable for AI prompt injection.
 *
 * Phase 7B: Enhanced with deeper data and anomaly reporting.
 */
export function serializeContextForPrompt(snapshot: AssistantContextSnapshot): string {
  const lines: string[] = [];

  lines.push('=== ECS EXPEDITION CONTEXT ===');
  lines.push(`Context completeness: ${snapshot.available_count}/${snapshot.total_count}`);
  lines.push('');

  // Vehicle
  if (snapshot.vehicle_profile.availability !== 'unavailable') {
    const vp = snapshot.vehicle_profile;
    lines.push(`VEHICLE: ${vp.vehicle_name || 'Unknown'} (${vp.vehicle_type || 'unknown type'})`);
    if (vp.has_specs) {
      lines.push(`  GVWR: ${vp.gvwr_lb} lb, Base: ${vp.base_weight_lb} lb`);
      lines.push(`  Fuel tank: ${vp.fuel_tank_capacity_gal} gal (${vp.fuel_type})`);
    }
  }

  // Health
  if (snapshot.vehicle_health.availability !== 'unavailable') {
    const vh = snapshot.vehicle_health;
    lines.push(`VEHICLE HEALTH: ${vh.engine_status}`);
    if (vh.battery_voltage) lines.push(`  Battery: ${vh.battery_voltage}V (${vh.battery_health})`);
    if (vh.fuel_percent != null) lines.push(`  Fuel: ${vh.fuel_percent}%`);
    if (vh.coolant_temp_f != null) lines.push(`  Coolant: ${vh.coolant_temp_f}\u00B0F`);
    if (vh.has_anomaly) lines.push(`  ANOMALIES: ${vh.anomaly_flags.join(', ')}`);
  }

  // Loadout
  if (snapshot.loadout_status.availability !== 'unavailable') {
    const ls = snapshot.loadout_status;
    lines.push(`LOADOUT: ${ls.total_items} items, ${ls.readiness_pct}% ready`);
    if (ls.critical_missing > 0) lines.push(`  CRITICAL MISSING: ${ls.critical_missing}`);
    if (ls.total_weight_lbs) lines.push(`  Weight: ${ls.total_weight_lbs} lb`);
    if (ls.is_overweight) lines.push(`  WARNING: OVERWEIGHT`);
  }

  // Power
  if (snapshot.power_status.availability !== 'unavailable') {
    const ps = snapshot.power_status;
    lines.push(`POWER: ${ps.device_count} device(s)`);
    if (ps.battery_percent != null) lines.push(`  Battery: ${ps.battery_percent}%`);
    if (ps.input_watts != null) lines.push(`  Input: ${ps.input_watts}W, Output: ${ps.output_watts}W`);
    lines.push(`  Sustainable: ${ps.is_sustainable ? 'Yes' : 'No'}`);
  }

  // Connectivity
  if (snapshot.connectivity_status.availability !== 'unavailable') {
    const cs = snapshot.connectivity_status;
    lines.push(`CONNECTIVITY: ${cs.connectivity_state} (${cs.network_type})`);
    lines.push(`  Quality: ${cs.signal_quality}, Freshness: ${cs.freshness}`);
    lines.push(`  Readiness: ${cs.operational_readiness}`);
  }

  // Remoteness
  if (snapshot.remoteness_status.availability !== 'unavailable') {
    const rs = snapshot.remoteness_status;
    lines.push(`REMOTENESS: ${rs.remoteness_tier} (score: ${rs.remoteness_score})`);
  }

  // Risk
  if (snapshot.risk_status.availability !== 'unavailable') {
    const rk = snapshot.risk_status;
    lines.push(`RISK: ${rk.risk_score}/100 (${rk.operational_status})`);
    lines.push(`  Primary factor: ${rk.primary_risk_label}`);
    lines.push(`  ${rk.summary_line}`);
  }

  // Route
  if (snapshot.route_context.availability !== 'unavailable') {
    const rc = snapshot.route_context;
    lines.push(`ROUTE: ${rc.route_name || 'Active route'}`);
    if (rc.total_distance_mi) lines.push(`  Distance: ${rc.total_distance_mi.toFixed(1)} mi`);
    if (rc.elevation_gain_ft) lines.push(`  Elevation gain: ${rc.elevation_gain_ft} ft`);
    lines.push(`  Waypoints: ${rc.waypoint_count}`);
  }

  // Offline
  if (snapshot.offline_readiness.availability !== 'unavailable') {
    const or = snapshot.offline_readiness;
    lines.push(`OFFLINE DATA: ${or.downloaded_regions} region(s), ${or.total_entries} entries`);
    lines.push(`  Covers position: ${or.covers_current_position ? 'Yes' : 'No'}`);
    lines.push(`  Covers route: ${or.covers_active_route ? 'Yes' : 'No'}`);
  }

  lines.push('');
  lines.push(`Assembled: ${snapshot.assembled_at}`);

  return lines.join('\n');
}


// ══════════════════════════════════════════════════════════
// Phase 7D: Context Delta Computation
// ══════════════════════════════════════════════════════════

function _isAvail(a: ContextAvailability): boolean {
  return a === 'available' || a === 'stale';
}

/**
 * Compute the delta between two context snapshots.
 * Identifies what changed, whether it improved or degraded,
 * and produces human-readable descriptions.
 *
 * Phase 7D addition.
 */
export function computeContextDelta(
  previous: AssistantContextSnapshot,
  current: AssistantContextSnapshot,
): ContextDelta {
  const now = new Date().toISOString();
  const changes: ContextChange[] = [];

  // ── Risk changes ───────────────────────────────────────
  if (_isAvail(current.risk_status.availability) && _isAvail(previous.risk_status.availability)) {
    const prevScore = previous.risk_status.risk_score;
    const currScore = current.risk_status.risk_score;
    const diff = currScore - prevScore;
    if (Math.abs(diff) >= 10) {
      changes.push({
        category: 'risk_status',
        description: diff > 0
          ? `Risk increased from ${prevScore} to ${currScore}/100 (${current.risk_status.primary_risk_label})`
          : `Risk decreased from ${prevScore} to ${currScore}/100`,
        direction: diff > 0 ? 'degraded' : 'improved',
        detected_at: now,
      });
    }
    if (previous.risk_status.operational_status !== current.risk_status.operational_status) {
      changes.push({
        category: 'risk_status',
        description: `Operational status changed: ${previous.risk_status.operational_status} \u2192 ${current.risk_status.operational_status}`,
        direction: currScore > prevScore ? 'degraded' : 'improved',
        detected_at: now,
      });
    }
  }

  // ── Vehicle health changes ─────────────────────────────
  if (_isAvail(current.vehicle_health.availability) && _isAvail(previous.vehicle_health.availability)) {
    const prevFuel = previous.vehicle_health.fuel_percent;
    const currFuel = current.vehicle_health.fuel_percent;
    if (prevFuel != null && currFuel != null && Math.abs(currFuel - prevFuel) >= 5) {
      changes.push({
        category: 'vehicle_health',
        description: `Fuel changed: ${prevFuel}% \u2192 ${currFuel}%`,
        direction: currFuel < prevFuel ? 'degraded' : 'improved',
        detected_at: now,
      });
    }
    if (!previous.vehicle_health.has_anomaly && current.vehicle_health.has_anomaly) {
      changes.push({
        category: 'vehicle_health',
        description: `New vehicle anomaly detected: ${current.vehicle_health.anomaly_flags.join(', ')}`,
        direction: 'degraded',
        detected_at: now,
      });
    } else if (previous.vehicle_health.has_anomaly && !current.vehicle_health.has_anomaly) {
      changes.push({
        category: 'vehicle_health',
        description: 'Vehicle anomalies resolved',
        direction: 'improved',
        detected_at: now,
      });
    }
  }

  // ── Power changes ──────────────────────────────────────
  if (_isAvail(current.power_status.availability) && _isAvail(previous.power_status.availability)) {
    const prevBat = previous.power_status.battery_percent;
    const currBat = current.power_status.battery_percent;
    if (prevBat != null && currBat != null && Math.abs(currBat - prevBat) >= 5) {
      changes.push({
        category: 'power_status',
        description: `Power battery changed: ${prevBat}% \u2192 ${currBat}%`,
        direction: currBat < prevBat ? 'degraded' : 'improved',
        detected_at: now,
      });
    }
    if (previous.power_status.is_sustainable && !current.power_status.is_sustainable) {
      changes.push({
        category: 'power_status',
        description: 'Power became unsustainable (output exceeds input)',
        direction: 'degraded',
        detected_at: now,
      });
    } else if (!previous.power_status.is_sustainable && current.power_status.is_sustainable) {
      changes.push({
        category: 'power_status',
        description: 'Power became sustainable (input meets output)',
        direction: 'improved',
        detected_at: now,
      });
    }
  }

  // ── Connectivity changes ───────────────────────────────
  if (_isAvail(current.connectivity_status.availability) && _isAvail(previous.connectivity_status.availability)) {
    if (previous.connectivity_status.internet_reachable && !current.connectivity_status.internet_reachable) {
      changes.push({
        category: 'connectivity_status',
        description: 'Lost internet connectivity',
        direction: 'degraded',
        detected_at: now,
      });
    } else if (!previous.connectivity_status.internet_reachable && current.connectivity_status.internet_reachable) {
      changes.push({
        category: 'connectivity_status',
        description: 'Internet connectivity restored',
        direction: 'improved',
        detected_at: now,
      });
    }
    if (previous.connectivity_status.signal_quality !== current.connectivity_status.signal_quality) {
      const qualOrder = ['none', 'poor', 'fair', 'good', 'excellent'];
      const prevIdx = qualOrder.indexOf(previous.connectivity_status.signal_quality);
      const currIdx = qualOrder.indexOf(current.connectivity_status.signal_quality);
      if (prevIdx >= 0 && currIdx >= 0 && Math.abs(currIdx - prevIdx) >= 2) {
        changes.push({
          category: 'connectivity_status',
          description: `Signal quality changed: ${previous.connectivity_status.signal_quality} \u2192 ${current.connectivity_status.signal_quality}`,
          direction: currIdx > prevIdx ? 'improved' : 'degraded',
          detected_at: now,
        });
      }
    }
  }

  // ── Remoteness changes ─────────────────────────────────
  if (_isAvail(current.remoteness_status.availability) && _isAvail(previous.remoteness_status.availability)) {
    const prevScore = previous.remoteness_status.remoteness_score ?? 0;
    const currScore = current.remoteness_status.remoteness_score ?? 0;
    if (Math.abs(currScore - prevScore) >= 15) {
      changes.push({
        category: 'remoteness_status',
        description: `Remoteness changed: ${previous.remoteness_status.remoteness_tier} (${prevScore}) \u2192 ${current.remoteness_status.remoteness_tier} (${currScore})`,
        direction: currScore > prevScore ? 'degraded' : 'improved',
        detected_at: now,
      });
    }
  }

  // ── Loadout changes ────────────────────────────────────
  if (_isAvail(current.loadout_status.availability) && _isAvail(previous.loadout_status.availability)) {
    const prevReady = previous.loadout_status.readiness_pct;
    const currReady = current.loadout_status.readiness_pct;
    if (Math.abs(currReady - prevReady) >= 10) {
      changes.push({
        category: 'loadout_status',
        description: `Loadout readiness changed: ${prevReady}% \u2192 ${currReady}%`,
        direction: currReady > prevReady ? 'improved' : 'degraded',
        detected_at: now,
      });
    }
    if (!previous.loadout_status.is_overweight && current.loadout_status.is_overweight) {
      changes.push({
        category: 'loadout_status',
        description: 'Vehicle is now overweight',
        direction: 'degraded',
        detected_at: now,
      });
    } else if (previous.loadout_status.is_overweight && !current.loadout_status.is_overweight) {
      changes.push({
        category: 'loadout_status',
        description: 'Vehicle weight is now within GVWR limits',
        direction: 'improved',
        detected_at: now,
      });
    }
  }

  // ── Route changes ──────────────────────────────────────
  if (previous.route_context.has_active_route !== current.route_context.has_active_route) {
    changes.push({
      category: 'route_context',
      description: current.route_context.has_active_route
        ? `Route loaded: ${current.route_context.route_name || 'new route'}`
        : 'Active route cleared',
      direction: 'neutral',
      detected_at: now,
    });
  }

  // ── Offline readiness changes ──────────────────────────
  if (_isAvail(current.offline_readiness.availability) && _isAvail(previous.offline_readiness.availability)) {
    if (!previous.offline_readiness.covers_active_route && current.offline_readiness.covers_active_route) {
      changes.push({
        category: 'offline_readiness',
        description: 'Offline data now covers active route',
        direction: 'improved',
        detected_at: now,
      });
    } else if (previous.offline_readiness.covers_active_route && !current.offline_readiness.covers_active_route) {
      changes.push({
        category: 'offline_readiness',
        description: 'Offline data no longer covers active route',
        direction: 'degraded',
        detected_at: now,
      });
    }
  }

  // ── Availability transitions ───────────────────────────
  const catKeys: AssistantContextCategory[] = ASSISTANT_CONTEXT_CATEGORIES;
  for (const cat of catKeys) {
    const prevAvail = (previous as any)[cat]?.availability;
    const currAvail = (current as any)[cat]?.availability;
    if (prevAvail && currAvail && prevAvail !== currAvail) {
      if (prevAvail === 'unavailable' && _isAvail(currAvail)) {
        changes.push({
          category: cat,
          description: `${cat.replace(/_/g, ' ')} became available`,
          direction: 'improved',
          detected_at: now,
        });
      } else if (_isAvail(prevAvail) && currAvail === 'unavailable') {
        changes.push({
          category: cat,
          description: `${cat.replace(/_/g, ' ')} became unavailable`,
          direction: 'degraded',
          detected_at: now,
        });
      }
    }
  }

  const improved = changes.filter(c => c.direction === 'improved').length;
  const degraded = changes.filter(c => c.direction === 'degraded').length;

  const delta: ContextDelta = {
    changes,
    improved_count: improved,
    degraded_count: degraded,
    has_significant_changes: changes.length > 0,
    previous_snapshot_at: previous.assembled_at,
    current_snapshot_at: current.assembled_at,
  };

  if (changes.length > 0) {
    console.log(TAG, `Context delta: ${changes.length} change(s) (${improved} improved, ${degraded} degraded)`);
  }

  return delta;
}

/**
 * Summarize recent context deltas into a human-readable string
 * for inclusion in assistant responses.
 *
 * Phase 7D addition.
 */
export function summarizeRecentChanges(deltas: ContextDelta[], maxChanges: number = 5): string | null {
  const allChanges: ContextChange[] = [];
  for (const delta of deltas) {
    allChanges.push(...delta.changes);
  }

  if (allChanges.length === 0) return null;

  // Sort by time, most recent first
  allChanges.sort((a, b) => b.detected_at.localeCompare(a.detected_at));

  const recent = allChanges.slice(0, maxChanges);
  const lines = recent.map(c => {
    const arrow = c.direction === 'improved' ? '\u2191' : c.direction === 'degraded' ? '\u2193' : '\u2194';
    return `${arrow} ${c.description}`;
  });

  return `Recent changes during this session:\n${lines.join('\n')}`;
}


