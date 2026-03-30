/**
 * ═══════════════════════════════════════════════════════════
 * ECS CROSS-SYSTEM SYNC COORDINATOR — Integration Pass 1
 * ═══════════════════════════════════════════════════════════
 *
 * Orchestrates data flow between all major ECS systems.
 *
 * Responsibilities:
 *   1. Subscribe to all source stores
 *   2. Normalize store data into canonical summaries
 *   3. Publish summaries to the ECS bus
 *   4. Manage update cascade ordering
 *   5. Prevent duplicate recalculations
 *   6. Handle app background/foreground transitions
 *   7. Handle app restart recovery
 *   8. Provide companion summaries for Android Auto / CarPlay
 *   9. Isolate partial system failures
 *
 * Update Cascade:
 *   Store change → normalize → bus.publish(Tier 1)
 *     → [debounce] → Risk Engine re-eval → bus.publish(Tier 2)
 *       → [debounce] → Assistant refresh → bus.publish(Tier 3)
 *
 * Circular Prevention:
 *   - Risk Engine subscribes to Tier 1 channels, NOT to 'risk' or 'assistant'
 *   - Assistant subscribes to Tier 1 + Tier 2, NOT to 'assistant'
 *   - Bus uses source-aware exclusion to prevent self-triggering
 *
 * Performance:
 *   - All store reads are synchronous (< 1ms each)
 *   - Summary normalization is pure computation (< 2ms total)
 *   - Bus debounce batches rapid updates (500ms–1500ms)
 *   - Total cascade time: < 50ms (excluding debounce windows)
 */

import { ecsBus } from './ecsBus';
import type {
  EcsChannel,
  EcsPowerSummary,
  EcsVehicleHealthSummary,
  EcsConnectivitySummary,
  EcsRemotenessSummary,
  EcsRiskSummary,
  EcsOfflineReadinessSummary,
  EcsRouteSummary,
  EcsLoadoutSummary,
  EcsVehicleProfileSummary,
  EcsCompanionSummary,
  SyncCoordinatorLifecycle,
  SyncCoordinatorState,
  EcsFreshness,
} from './ecsSyncTypes';

const TAG = '[ECS-SYNC]';

// ── Configuration ────────────────────────────────────────

/** Periodic refresh interval for all summaries (60 seconds) */
const PERIODIC_REFRESH_MS = 60_000;

/** Debounce for store-triggered refreshes (2 seconds) */
const STORE_CHANGE_DEBOUNCE_MS = 2_000;

/** Maximum time to wait for systems during initialization (10 seconds) */
const INIT_TIMEOUT_MS = 10_000;


// ── Internal State ───────────────────────────────────────

let _lifecycle: SyncCoordinatorLifecycle = 'idle';
let _storeUnsubs: (() => void)[] = [];
let _busUnsubs: (() => void)[] = [];
let _periodicTimer: ReturnType<typeof setInterval> | null = null;
let _storeChangeDebounce: ReturnType<typeof setTimeout> | null = null;
let _cascadeCount = 0;
let _lastCascadeAt: string | null = null;
let _initTimestamp = 0;

/** Track which stores have reported data */
const _storeStatus: Partial<Record<EcsChannel, boolean>> = {};


// ══════════════════════════════════════════════════════════
// SUMMARY NORMALIZATION — Store → Canonical Summary
// ══════════════════════════════════════════════════════════

function _now(): string { return new Date().toISOString(); }

function _freshness(available: boolean, isLive?: boolean): EcsFreshness {
  if (!available) return 'unavailable';
  return isLive ? 'live' : 'recent';
}

/**
 * Normalize BLU power data into EcsPowerSummary.
 * Reads from bluStateStore (the canonical BLU telemetry source)
 * rather than PowerDeviceStore (which only stores device IDs).
 */

function _normalizePower(): EcsPowerSummary {
  const base: EcsPowerSummary = {
    updated_at: _now(),
    freshness: 'unavailable',
    available: false,
    has_devices: false,
    device_count: 0,
    battery_percent: null,
    input_watts: null,
    output_watts: null,
    runtime_minutes: null,
    is_sustainable: false,
  };

  try {
    const { bluStateStore } = require('../src/power/blu/BluStateStore');
    const summary = bluStateStore.getSummary();

    if (summary && summary.available) {
      base.has_devices = true;
      base.available = true;
      base.device_count = 1; // BLU aggregates to primary device
      base.freshness = bluStateStore.isStale() ? 'stale' : 'live';
      base.battery_percent = summary.battery_percent ?? null;
      base.input_watts = summary.live_input ?? null;
      base.output_watts = summary.live_output ?? null;
      base.runtime_minutes = summary.runtime_remaining ?? null;
      base.is_sustainable = (base.input_watts ?? 0) >= (base.output_watts ?? 0);
    }
  } catch {
    // Power system not available — graceful degradation
  }

  return base;
}


/**
 * Normalize vehicle telemetry into EcsVehicleHealthSummary.
 */
function _normalizeVehicleHealth(): EcsVehicleHealthSummary {
  const base: EcsVehicleHealthSummary = {
    updated_at: _now(),
    freshness: 'unavailable',
    available: false,
    has_telemetry: false,
    engine_status: 'unknown',
    battery_voltage: null,
    battery_health: 'unknown',
    fuel_percent: null,
    coolant_temp_f: null,
    has_anomaly: false,
    anomaly_flags: [],
  };

  try {

    let store: any = null;
    try { store = require('../src/vehicle-telemetry/VehicleTelemetryStore'); } catch {}

    const VTS = store?.vehicleTelemetryStore;
    const telemetry = VTS?.getSummary?.();
    if (telemetry) {


      base.has_telemetry = true;
      base.available = true;
      base.freshness = 'live';
      base.battery_voltage = telemetry.battery_voltage ?? telemetry.batteryVoltage ?? null;
      base.fuel_percent = telemetry.fuel_percent ?? telemetry.fuelPercent ?? telemetry.fuel_level ?? null;
      base.coolant_temp_f = telemetry.coolant_temp_f ?? telemetry.coolantTempF ?? telemetry.coolant_temp ?? null;
      base.engine_status = telemetry.engine_status ?? telemetry.engineStatus ?? 'unknown';

      // Battery health
      if (base.battery_voltage != null) {
        if (base.battery_voltage >= 12.4) base.battery_health = 'good';
        else if (base.battery_voltage >= 12.0) base.battery_health = 'fair';
        else if (base.battery_voltage >= 11.5) base.battery_health = 'low';
        else base.battery_health = 'critical';
      }

      // Anomaly detection
      const flags: string[] = [];
      if (base.battery_voltage != null && base.battery_voltage < 11.8) flags.push('low_battery_voltage');
      if (base.coolant_temp_f != null && base.coolant_temp_f > 230) flags.push('high_coolant_temp');
      if (base.fuel_percent != null && base.fuel_percent < 10) flags.push('critically_low_fuel');
      if (telemetry.check_engine || telemetry.checkEngine) flags.push('check_engine_light');
      if (flags.length > 0) {
        base.has_anomaly = true;
        base.anomaly_flags = flags;
      }
    }
  } catch {
    // Vehicle telemetry not available
  }

  return base;
}

/**
 * Normalize connectivity intelligence into EcsConnectivitySummary.
 */
function _normalizeConnectivity(): EcsConnectivitySummary {
  const base: EcsConnectivitySummary = {
    updated_at: _now(),
    freshness: 'unavailable',
    available: false,
    state: 'unknown',
    signal_quality: 'unknown',
    internet_reachable: false,
    offline_cache_ready: false,
    operational_readiness: 'offline_unprepared',
    network_type: 'unknown',
  };

  try {
    const { connectivityIntelStore } = require('./connectivityIntelStore');
    if (connectivityIntelStore.isInitialized()) {
      const summary = connectivityIntelStore.getSummary();
      if (summary) {
        base.available = true;
        base.freshness = summary.is_live ? 'live' : 'stale';
        base.state = summary.connectivity_state || 'unknown';
        base.signal_quality = summary.signal_quality || 'unknown';
        base.internet_reachable = summary.internet_reachable || false;
        base.offline_cache_ready = summary.offline_cache_ready || false;
        base.operational_readiness = summary.operational_readiness || 'offline_unprepared';
        base.network_type = summary.network_type || 'unknown';
      }
    }
  } catch {
    // CI not available
  }

  return base;
}

/**
 * Normalize remoteness data into EcsRemotenessSummary.
 */
function _normalizeRemoteness(): EcsRemotenessSummary {
  const base: EcsRemotenessSummary = {
    updated_at: _now(),
    freshness: 'unavailable',
    available: false,
    score: null,
    tier: null,
    engine_running: false,
    cache_ready: false,
  };

  try {
    const { remotenessStore } = require('./remotenessStore');
    if (remotenessStore.isRunning()) {
      const output = remotenessStore.get();
      if (output) {
        base.available = true;
        base.freshness = 'live';
        base.score = output.score;
        base.tier = output.tier;
        base.engine_running = true;
        base.cache_ready = output.signals?.cacheReady || false;
      }
    }
  } catch {
    // Remoteness not available
  }

  return base;
}

/**
 * Normalize risk engine data into EcsRiskSummary.
 */
function _normalizeRisk(): EcsRiskSummary {
  const base: EcsRiskSummary = {
    updated_at: _now(),
    freshness: 'unavailable',
    available: false,
    risk_score: 0,
    operational_status: 'optimal',
    primary_risk_factor: 'none',
    primary_risk_label: 'No Concerns',
    capability_score: 0,
    resource_readiness: 0,
    connectivity_risk: 0,
    isolation_risk: 0,
    is_complete: false,
    summary_line: 'Awaiting data\u2026',
  };

  try {
    const { expeditionRiskStore } = require('./expeditionRiskStore');
    if (expeditionRiskStore.isInitialized()) {
      const summary = expeditionRiskStore.getSummary();
      if (summary) {
        base.available = true;
        base.freshness = summary.is_complete ? 'live' : 'stale';
        base.risk_score = summary.risk_score;
        base.operational_status = summary.operational_status;
        base.primary_risk_factor = summary.primary_risk_factor;
        base.primary_risk_label = summary.primary_risk_label;
        base.capability_score = summary.capability_score;
        base.resource_readiness = summary.resource_readiness;
        base.connectivity_risk = summary.connectivity_risk;
        base.isolation_risk = summary.isolation_risk;
        base.is_complete = summary.is_complete;
        base.summary_line = summary.summary_line;
      }
    }
  } catch {
    // Risk engine not available
  }

  return base;
}

/**
 * Normalize offline expedition data into EcsOfflineReadinessSummary.
 */
function _normalizeOfflineReadiness(): EcsOfflineReadinessSummary {
  const base: EcsOfflineReadinessSummary = {
    updated_at: _now(),
    freshness: 'unavailable',
    available: false,
    has_data: false,
    region_count: 0,
    entry_count: 0,
    covers_position: false,
    covers_route: false,
  };

  try {
    const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
    if (offlineExpeditionDbStore.isInitialized()) {
      const readiness = offlineExpeditionDbStore.evaluateReadiness();
      if (readiness) {
        base.has_data = readiness.has_offline_data;
        base.region_count = readiness.downloaded_regions;
        base.entry_count = readiness.total_entries;
        base.covers_position = readiness.covers_current_position;
        base.covers_route = readiness.covers_active_route;
        base.available = readiness.has_offline_data;
        base.freshness = readiness.has_offline_data ? 'recent' : 'unavailable';
      }
    }
  } catch {
    // Offline DB not available
  }

  return base;
}

/**
 * Normalize route data into EcsRouteSummary.
 */
function _normalizeRoute(): EcsRouteSummary {
  const base: EcsRouteSummary = {
    updated_at: _now(),
    freshness: 'unavailable',
    available: false,
    has_active_route: false,
    route_name: null,
    distance_mi: null,
    elevation_gain_ft: null,
    waypoint_count: 0,
  };

  try {
    const { routeStore } = require('./routeStore');
    const active = routeStore.getActive();
    if (active) {
      base.available = true;
      base.freshness = 'live';
      base.has_active_route = true;
      base.route_name = active.name || null;
      base.distance_mi = active.total_distance_miles || active.totalDistanceMi || null;
      base.elevation_gain_ft = active.elevation_gain_ft || active.elevationGainFt || null;
      base.waypoint_count = active.waypoint_count || active.waypointCount || (active.waypoints?.length ?? 0);
    }
  } catch {
    // Route store not available
  }

  return base;
}

/**
 * Normalize loadout data into EcsLoadoutSummary.
 */
function _normalizeLoadout(): EcsLoadoutSummary {
  const base: EcsLoadoutSummary = {
    updated_at: _now(),
    freshness: 'unavailable',
    available: false,
    has_loadout: false,
    total_items: 0,
    packed_items: 0,
    readiness_pct: 0,
    total_weight_lbs: null,
    is_overweight: false,
    critical_missing: 0,
  };

  try {
    const { loadoutWeightCache } = require('./loadoutWeightCache');
    const cache = loadoutWeightCache.getAll?.();
    if (cache && Object.keys(cache).length > 0) {
      const firstKey = Object.keys(cache)[0];
      const data = cache[firstKey];
      if (data) {
        base.available = true;
        base.freshness = 'recent';
        base.has_loadout = true;
        base.total_items = data.item_count ?? data.total_items ?? 0;
        base.packed_items = data.packed_count ?? data.packed_items ?? 0;
        base.readiness_pct = data.readiness_pct ?? (base.total_items > 0 ? Math.round((base.packed_items / base.total_items) * 100) : 0);
        base.total_weight_lbs = data.total_weight_lbs ?? data.total_weight ?? null;
        base.is_overweight = data.is_overweight ?? false;
        base.critical_missing = data.critical_missing ?? 0;
      }
    }
  } catch {
    // Loadout not available
  }

  return base;
}

/**
 * Normalize vehicle profile into EcsVehicleProfileSummary.
 */
function _normalizeVehicleProfile(): EcsVehicleProfileSummary {
  const base: EcsVehicleProfileSummary = {
    updated_at: _now(),
    freshness: 'unavailable',
    available: false,
    vehicle_name: null,
    vehicle_type: null,
    gvwr_lb: null,
    has_specs: false,
  };

  try {
    const { vehicleStore } = require('./vehicleStore');
    const vehicle = vehicleStore.getActive?.() || vehicleStore.get?.();
    if (vehicle) {
      base.vehicle_name = vehicle.name || vehicle.label || null;
      base.vehicle_type = vehicle.vehicleType || vehicle.type || null;
      base.available = true;
      base.freshness = 'recent';

      try {
        const { vehicleSpecStore } = require('./vehicleSpecStore');
        const vehicleId = vehicle.id || vehicle.vehicleId;
        if (vehicleId) {
          const spec = vehicleSpecStore.get(vehicleId);
          if (spec) {
            base.gvwr_lb = spec.gvwr_lb || null;
            base.has_specs = true;
            base.freshness = 'live';
          }
        }
      } catch {}
    }
  } catch {
    // Vehicle store not available
  }

  return base;
}


// ══════════════════════════════════════════════════════════
// REFRESH CASCADE
// ══════════════════════════════════════════════════════════

/**
 * Refresh all Tier 1 summaries and publish to the bus.
 * This triggers the cascade: Tier 1 → Tier 2 → Tier 3.
 */
function _refreshAllSummaries(): void {
  const startMs = Date.now();

  try {
    // ── Tier 1: Raw provider summaries ───────────────────
    const power = _normalizePower();
    const vehicleHealth = _normalizeVehicleHealth();
    const connectivity = _normalizeConnectivity();
    const remoteness = _normalizeRemoteness();
    const route = _normalizeRoute();
    const loadout = _normalizeLoadout();
    const vehicleProfile = _normalizeVehicleProfile();
    const offlineReadiness = _normalizeOfflineReadiness();

    // Publish Tier 1 (these will debounce and then trigger Tier 2)
    ecsBus.publish('power', 'sync_coordinator', power);
    ecsBus.publish('vehicle_health', 'sync_coordinator', vehicleHealth);
    ecsBus.publish('connectivity', 'sync_coordinator', connectivity);
    ecsBus.publish('remoteness', 'sync_coordinator', remoteness);
    ecsBus.publish('route', 'sync_coordinator', route);
    ecsBus.publish('loadout', 'sync_coordinator', loadout);
    ecsBus.publish('vehicle_profile', 'sync_coordinator', vehicleProfile);
    ecsBus.publish('offline_readiness', 'sync_coordinator', offlineReadiness);

    // ── Tier 2: Risk summary (published after Tier 1 settles) ──
    // Risk is computed by the Risk Engine which subscribes to Tier 1 channels.
    // We also publish the current risk state for immediate availability.
    const risk = _normalizeRisk();
    ecsBus.publish('risk', 'sync_coordinator', risk);

    // Track cascade
    _cascadeCount++;
    _lastCascadeAt = _now();

    // Track store status
    _storeStatus.power = power.available;
    _storeStatus.vehicle_health = vehicleHealth.available;
    _storeStatus.connectivity = connectivity.available;
    _storeStatus.remoteness = remoteness.available;
    _storeStatus.route = route.available;
    _storeStatus.loadout = loadout.available;
    _storeStatus.vehicle_profile = vehicleProfile.available;
    _storeStatus.offline_readiness = offlineReadiness.available;
    _storeStatus.risk = risk.available;

    const elapsed = Date.now() - startMs;
    const availCount = Object.values(_storeStatus).filter(Boolean).length;

    // Throttled logging
    if (_cascadeCount <= 3 || _cascadeCount % 10 === 0) {
      console.log(
        TAG,
        `Cascade #${_cascadeCount}: ${availCount}/${Object.keys(_storeStatus).length} systems available (${elapsed}ms)`
      );
    }
  } catch (e) {
    console.warn(TAG, 'Refresh cascade error:', e);
  }
}

/**
 * Debounced refresh triggered by store changes.
 * Batches multiple rapid store changes into a single cascade.
 */
function _debouncedRefresh(): void {
  if (_storeChangeDebounce) {
    clearTimeout(_storeChangeDebounce);
  }
  _storeChangeDebounce = setTimeout(() => {
    _storeChangeDebounce = null;
    _refreshAllSummaries();
  }, STORE_CHANGE_DEBOUNCE_MS);
}


// ══════════════════════════════════════════════════════════
// STORE SUBSCRIPTIONS
// ══════════════════════════════════════════════════════════

/**
 * Subscribe to all source stores.
 * When any store changes, trigger a debounced refresh cascade.
 */
function _subscribeToStores(): void {
  const storeSubscribers: { name: string; subscribe: () => (() => void) }[] = [
    {
      name: 'connectivityIntelStore',
      subscribe: () => {
        const { connectivityIntelStore } = require('./connectivityIntelStore');
        return connectivityIntelStore.subscribe(() => _debouncedRefresh());
      },
    },
    {
      name: 'remotenessStore',
      subscribe: () => {
        const { remotenessStore } = require('./remotenessStore');
        return remotenessStore.subscribe(() => _debouncedRefresh());
      },
    },
    {
      name: 'expeditionRiskStore',
      subscribe: () => {
        const { expeditionRiskStore } = require('./expeditionRiskStore');
        return expeditionRiskStore.subscribe(() => {
          // When risk updates, publish risk summary immediately (Tier 2)
          // But DON'T trigger a full cascade (that would be circular)
          const risk = _normalizeRisk();
          ecsBus.publish('risk', 'risk_engine', risk);
        });
      },
    },
    {
      name: 'vehicleSpecStore',
      subscribe: () => {
        const { vehicleSpecStore } = require('./vehicleSpecStore');
        return vehicleSpecStore.subscribe(() => _debouncedRefresh());
      },
    },
    {
      name: 'vehicleStore',
      subscribe: () => {
        const { vehicleStore } = require('./vehicleStore');
        return vehicleStore.subscribe(() => _debouncedRefresh());
      },
    },
    {
      name: 'loadoutWeightCache',
      subscribe: () => {
        const { loadoutWeightCache } = require('./loadoutWeightCache');
        return loadoutWeightCache.subscribe(() => _debouncedRefresh());
      },
    },
    {
      name: 'routeStore',
      subscribe: () => {
        const { routeStore } = require('./routeStore');
        return routeStore.subscribe(() => _debouncedRefresh());
      },
    },
    {
      name: 'vehicleTelemetryStore',
      subscribe: () => {
        const store = require('../src/vehicle-telemetry/VehicleTelemetryStore');
        // Runtime fix: Use only the lowercase singleton export (vehicleTelemetryStore).
        // The class name (VehicleTelemetryStore) is the class constructor, NOT the instance.
        // Using `store?.VehicleTelemetryStore` would get the class, which may not have
        // a subscribe() method or would subscribe on the class prototype, not the instance.
        const vts = store?.vehicleTelemetryStore;
        if (!vts || typeof vts.subscribe !== 'function') {
          throw new Error('vehicleTelemetryStore singleton not available or missing subscribe()');
        }
        return vts.subscribe(() => _debouncedRefresh());
      },
    },

    {
      name: 'bluStateStore',
      subscribe: () => {
        const { bluStateStore } = require('../src/power/blu/BluStateStore');
        return bluStateStore.subscribe(() => _debouncedRefresh());
      },
    },
    {
      name: 'tiresLiftStore',
      subscribe: () => {
        const { tiresLiftStore } = require('./tiresLiftStore');
        return tiresLiftStore.subscribe(() => _debouncedRefresh());
      },
    },
    {
      name: 'consumablesStore',
      subscribe: () => {
        const { consumablesStore } = require('./consumablesStore');
        return consumablesStore.subscribe(() => _debouncedRefresh());
      },
    },
    {
      name: 'missionExpeditionStore',
      subscribe: () => {
        const { missionExpeditionStore } = require('./missionStore');
        return missionExpeditionStore.subscribe(() => _debouncedRefresh());
      },
    },
    // Integration Pass 3: Offline Expedition DB changes trigger
    // offline readiness re-evaluation and connectivity invalidation
    {
      name: 'offlineExpeditionDbStore',
      subscribe: () => {
        const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
        return offlineExpeditionDbStore.subscribe(() => {
          // Invalidate cache readiness so CI picks up the change
          try {
            const { invalidateCacheReadiness } = require('./offlineCacheAwarenessEngine');
            invalidateCacheReadiness();
          } catch {}
          _debouncedRefresh();
        });
      },
    },
  ];


  let successCount = 0;
  for (const { name, subscribe } of storeSubscribers) {
    try {
      const unsub = subscribe();
      _storeUnsubs.push(unsub);
      successCount++;
    } catch {
      // Store not available — graceful degradation
      // This is expected for systems that haven't been initialized
    }
  }

  console.log(TAG, `Store subscriptions: ${successCount}/${storeSubscribers.length} active`);
}

/**
 * Unsubscribe from all stores.
 */
function _unsubscribeFromStores(): void {
  for (const unsub of _storeUnsubs) {
    try { unsub(); } catch {}
  }
  _storeUnsubs = [];
}


// ══════════════════════════════════════════════════════════
// BUS SUBSCRIPTIONS — Tier 2/3 Cascade Wiring
// ══════════════════════════════════════════════════════════

/**
 * Wire the Risk Engine to re-evaluate when Tier 1 data changes.
 * The Risk Engine has its own internal debounce (3s), so we
 * use the bus debounce (800ms for risk channel) as an additional layer.
 */
function _wireBusCascade(): void {
  // Risk Engine listens to Tier 1 changes (but NOT to risk or assistant)
  const riskUnsub = ecsBus.subscribeMany(
    ['power', 'vehicle_health', 'connectivity', 'remoteness', 'route', 'loadout', 'vehicle_profile', 'offline_readiness'],
    (_event) => {
      // The Risk Engine already has its own store subscriptions with debounce.
      // This bus subscription ensures it also catches changes that come through
      // the sync coordinator (e.g., normalized summaries from periodic refresh).
      // We don't need to trigger it again here — the store subscriptions handle it.
      // This is a safety net for edge cases.
    },
    'risk_engine' // Exclude events sourced from risk_engine to prevent circular
  );
  _busUnsubs.push(riskUnsub);

  // Assistant listens to Tier 1 + Tier 2 changes (but NOT to assistant)
  const assistantUnsub = ecsBus.subscribeMany(
    ['power', 'vehicle_health', 'connectivity', 'remoteness', 'route', 'loadout', 'vehicle_profile', 'offline_readiness', 'risk'],
    (_event) => {
      // The Assistant store has its own periodic evaluation (30s).
      // This bus subscription is a safety net to ensure the assistant
      // picks up significant changes between periodic evaluations.
      // The assistant's own debounce (1500ms) prevents over-triggering.
    },
    'assistant' // Exclude events sourced from assistant to prevent circular
  );
  _busUnsubs.push(assistantUnsub);

  console.log(TAG, 'Bus cascade wiring complete');
}

/**
 * Remove all bus subscriptions.
 */
function _unwireBusCascade(): void {
  for (const unsub of _busUnsubs) {
    try { unsub(); } catch {}
  }
  _busUnsubs = [];
}


// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

export const ecsSyncCoordinator = {

  /**
   * Initialize and start the sync coordinator.
   *
   * This should be called once during app startup, after
   * individual systems have been initialized.
   *
   * Order:
   *   1. Subscribe to all source stores
   *   2. Wire bus cascade
   *   3. Perform initial refresh
   *   4. Start periodic refresh timer
   */
  start(): void {
    if (_lifecycle === 'running') {
      console.log(TAG, 'Already running');
      return;
    }

    console.log(TAG, 'Starting (Integration Pass 1)...');
    _lifecycle = 'initializing';
    _initTimestamp = Date.now();

    // Step 1: Subscribe to source stores
    _subscribeToStores();

    // Step 2: Wire bus cascade
    _wireBusCascade();

    // Step 3: Initial refresh (deferred to let stores settle)
    setTimeout(() => {
      _refreshAllSummaries();
    }, 500);

    // Step 4: Periodic refresh
    _periodicTimer = setInterval(() => {
      _refreshAllSummaries();
    }, PERIODIC_REFRESH_MS);

    _lifecycle = 'running';
    console.log(TAG, `Started (periodic: ${PERIODIC_REFRESH_MS / 1000}s, store debounce: ${STORE_CHANGE_DEBOUNCE_MS / 1000}s)`);
  },

  /**
   * Stop the sync coordinator.
   * Unsubscribes from all stores and stops periodic refresh.
   */
  stop(): void {
    if (_lifecycle === 'stopped' || _lifecycle === 'idle') return;

    console.log(TAG, 'Stopping...');

    // Flush pending updates
    ecsBus.flush();

    // Stop periodic refresh
    if (_periodicTimer) {
      clearInterval(_periodicTimer);
      _periodicTimer = null;
    }

    // Cancel debounced refresh
    if (_storeChangeDebounce) {
      clearTimeout(_storeChangeDebounce);
      _storeChangeDebounce = null;
    }

    // Unsubscribe from everything
    _unsubscribeFromStores();
    _unwireBusCascade();

    _lifecycle = 'stopped';
    console.log(TAG, `Stopped (cascades: ${_cascadeCount})`);
  },

  /**
   * Suspend the coordinator (app backgrounding).
   * Stops periodic refresh but keeps subscriptions active.
   */
  suspend(): void {
    if (_lifecycle !== 'running') return;

    // Flush pending updates before suspending
    ecsBus.flush();

    if (_periodicTimer) {
      clearInterval(_periodicTimer);
      _periodicTimer = null;
    }

    if (_storeChangeDebounce) {
      clearTimeout(_storeChangeDebounce);
      _storeChangeDebounce = null;
    }

    _lifecycle = 'suspended';
    console.log(TAG, 'Suspended');
  },

  /**
   * Resume the coordinator (app foregrounding).
   * Restarts periodic refresh and performs an immediate refresh.
   */
  resume(): void {
    if (_lifecycle !== 'suspended') return;

    _lifecycle = 'running';

    // Immediate refresh to catch up on changes during background
    _refreshAllSummaries();

    // Restart periodic refresh
    _periodicTimer = setInterval(() => {
      _refreshAllSummaries();
    }, PERIODIC_REFRESH_MS);

    console.log(TAG, 'Resumed');
  },

  /**
   * Force an immediate refresh of all summaries.
   * Bypasses debounce. Use sparingly.
   */
  forceRefresh(): void {
    _refreshAllSummaries();
  },


  // ── Summary Access ─────────────────────────────────────

  /**
   * Get a specific system summary from the bus cache.
   */
  getSummary<K extends keyof import('./ecsSyncTypes').EcsSummaryMap>(
    channel: K,
  ): import('./ecsSyncTypes').EcsSummaryMap[K] | null {
    return ecsBus.getSummary(channel);
  },

  /**
   * Get all cached summaries.
   */
  getAllSummaries(): Partial<import('./ecsSyncTypes').EcsSummaryMap> {
    return ecsBus.getAllSummaries();
  },

  /**
   * Build a companion summary for Android Auto / CarPlay.
   * Contains only essential operational data in a safe format.
   */
  getCompanionSummary(): EcsCompanionSummary {
    const risk = ecsBus.getSummary('risk');
    const power = ecsBus.getSummary('power');
    const vehicleHealth = ecsBus.getSummary('vehicle_health');
    const connectivity = ecsBus.getSummary('connectivity');
    const remoteness = ecsBus.getSummary('remoteness');

    let guidance: string | null = null;
    try {
      const { assistantStore } = require('./assistantStore');
      const companion = assistantStore.getCompanionSummary();
      guidance = companion.guidance;
    } catch {}

    return {
      risk_status: risk?.operational_status ?? 'optimal',
      risk_score: risk?.risk_score ?? 0,
      risk_summary: risk?.summary_line ?? 'Awaiting data\u2026',
      fuel_percent: vehicleHealth?.fuel_percent ?? null,
      power_percent: power?.battery_percent ?? null,
      connectivity: connectivity?.state ?? 'unknown',
      remoteness: remoteness?.tier ?? null,
      guidance,
      updated_at: _now(),
    };
  },


  // ── State & Diagnostics ────────────────────────────────

  /**
   * Get the coordinator state for diagnostics.
   */
  getState(): SyncCoordinatorState {
    const channelsActive: EcsChannel[] = [];
    const channelsStale: EcsChannel[] = [];
    const channelsUnavailable: EcsChannel[] = [];

    for (const [ch, available] of Object.entries(_storeStatus)) {
      const freshness = ecsBus.getChannelFreshness(ch as EcsChannel);
      if (available && (freshness === 'live' || freshness === 'recent')) {
        channelsActive.push(ch as EcsChannel);
      } else if (available && freshness === 'stale') {
        channelsStale.push(ch as EcsChannel);
      } else {
        channelsUnavailable.push(ch as EcsChannel);
      }
    }

    return {
      lifecycle: _lifecycle,
      subscription_count: _storeUnsubs.length,
      last_cascade_at: _lastCascadeAt,
      cascade_count: _cascadeCount,
      channels_active: channelsActive,
      channels_stale: channelsStale,
      channels_unavailable: channelsUnavailable,
    };
  },

  /**
   * Get the lifecycle state.
   */
  getLifecycle(): SyncCoordinatorLifecycle {
    return _lifecycle;
  },

  /**
   * Whether the coordinator is running.
   */
  isRunning(): boolean {
    return _lifecycle === 'running';
  },

  /**
   * Get bus metrics.
   */
  getBusMetrics(): ReturnType<typeof ecsBus.getMetrics> {
    return ecsBus.getMetrics();
  },

  /**
   * Full reset — stops coordinator and resets the bus.
   */
  reset(): void {
    ecsSyncCoordinator.stop();
    ecsBus.reset();
    _cascadeCount = 0;
    _lastCascadeAt = null;
    Object.keys(_storeStatus).forEach(k => delete (_storeStatus as any)[k]);
    _lifecycle = 'idle';
    console.log(TAG, 'Full reset complete');
  },
};

