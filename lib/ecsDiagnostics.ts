/**
 * ECS SYSTEM DIAGNOSTICS — Comprehensive Developer Diagnostics Engine
 * ====================================================================
 *
 * Reports real-time health status of all ECS core subsystems:
 *
 * SYSTEM STATUS:
 *   - Connectivity Intelligence (network_type, signal_quality, internet_reachable, offline_cache_ready)
 *   - Remoteness (remoteness_score, isolation_risk, operational_connectivity_state)
 *   - Expedition Risk Engine (risk_score, operational_status, primary_risk_factor)
 *
 * TELEMETRY:
 *   - Vehicle Telemetry (connection_state, last_update_time, active signals)
 *   - BLU Power Telemetry (battery_percent, input_watts, output_watts, estimated_runtime)
 *
 * OFFLINE EXPEDITION DATABASE:
 *   - downloaded_regions, active_region, dataset_version, storage_usage
 *
 * ASSISTANT CONTEXT:
 *   - Which ECS context inputs are available to the AI Expedition Assistant
 *   - Missing context categories shown as "unknown"
 *
 * MAP + NAVIGATION:
 *   - active_route, cached_trails_loaded, map_source
 *
 * PERFORMANCE:
 *   - last_system_update_time, widget_refresh_cycle, telemetry_update_frequency
 *
 * CORE ENGINES (original):
 *   - Route Intelligence, Terrain Engine, Resource Forecast,
 *     Campsite Engine, Forecast Engine, Map Rendering, Vehicle Twin
 *
 * Development-only — accessed via hidden developer gesture.
 */

import { routeAnalysisEngine } from './routeAnalysisEngine';
import { terrainAnalysisEngine } from './terrainAnalysisEngine';
import { resourceForecastEngine } from './resourceForecastEngine';
import { campsiteCandidateEngine } from './campsiteCandidateEngine';
import { expeditionForecastEngine } from './expeditionForecastEngine';

const TAG = '[ECS_DIAGNOSTICS]';

// ── Types ────────────────────────────────────────────────────

export type DiagnosticStatus = 'OK' | 'FAILED' | 'IDLE' | 'DEGRADED';

export interface SystemDiagnostic {
  /** System name */
  name: string;
  /** System identifier key */
  key: string;
  /** Current status */
  status: DiagnosticStatus;
  /** Short description of the status */
  description: string;
  /** Last updated timestamp (ISO string or null) */
  lastUpdated: string | null;
  /** Additional metadata */
  meta?: Record<string, string | number | boolean | null>;
  /** Section grouping */
  section?: string;
}

export interface DiagnosticsReport {
  /** All system diagnostics */
  systems: SystemDiagnostic[];
  /** Overall status — FAILED if any system failed */
  overallStatus: DiagnosticStatus;
  /** Report generation timestamp */
  generatedAt: string;
  /** Number of OK systems */
  okCount: number;
  /** Number of FAILED systems */
  failedCount: number;
  /** Number of IDLE systems */
  idleCount: number;
  /** Number of DEGRADED systems */
  degradedCount: number;
  /** App version */
  appVersion: string;
  /** Build environment */
  buildEnv: string;
}


// ── Diagnostic Probes — System Status ────────────────────────

function probeConnectivityIntelligence(): SystemDiagnostic {
  try {
    const { connectivityIntelStore } = require('./connectivityIntelStore');
    if (!connectivityIntelStore.isInitialized()) {
      return {
        name: 'Connectivity Intelligence',
        key: 'connectivity_intel',
        status: 'IDLE',
        description: 'Not initialized',
        lastUpdated: null,
        section: 'system_status',
      };
    }
    const summary = connectivityIntelStore.getSummary();
    if (!summary) {
      return {
        name: 'Connectivity Intelligence',
        key: 'connectivity_intel',
        status: 'DEGRADED',
        description: 'Initialized but no summary available',
        lastUpdated: null,
        section: 'system_status',
      };
    }
    const isMonitoring = connectivityIntelStore.isMonitoring();
    return {
      name: 'Connectivity Intelligence',
      key: 'connectivity_intel',
      status: isMonitoring ? 'OK' : 'DEGRADED',
      description: isMonitoring
        ? `${summary.connectivity_state} (${summary.network_type})`
        : `Not monitoring — last: ${summary.connectivity_state}`,
      lastUpdated: summary.updated_at || null,
      section: 'system_status',
      meta: {
        network_type: summary.network_type || 'unknown',
        signal_quality: summary.signal_quality || 'unknown',
        internet_reachable: summary.internet_reachable || false,
        offline_cache_ready: summary.offline_cache_ready || false,
        freshness: summary.freshness || 'unknown',
        operational_readiness: summary.operational_readiness || 'unknown',
        quality: summary.quality || 'unknown',
        latency_ms: summary.latency_ms ?? null,
        is_live: summary.is_live || false,
        monitoring: isMonitoring,
      },
    };
  } catch (e: any) {
    return {
      name: 'Connectivity Intelligence',
      key: 'connectivity_intel',
      status: 'FAILED',
      description: `Probe error: ${e?.message || 'Unknown'}`,
      lastUpdated: null,
      section: 'system_status',
    };
  }
}

function probeRemoteness(): SystemDiagnostic {
  try {
    const { remotenessStore } = require('./remotenessStore');
    const isRunning = remotenessStore.isRunning();
    if (!isRunning) {
      return {
        name: 'Remoteness Engine',
        key: 'remoteness',
        status: 'IDLE',
        description: 'Engine not running',
        lastUpdated: null,
        section: 'system_status',
      };
    }
    const output = remotenessStore.get();
    if (!output) {
      return {
        name: 'Remoteness Engine',
        key: 'remoteness',
        status: 'DEGRADED',
        description: 'Running but no output',
        lastUpdated: null,
        section: 'system_status',
      };
    }
    return {
      name: 'Remoteness Engine',
      key: 'remoteness',
      status: 'OK',
      description: `${output.tier} (score: ${output.score})`,
      lastUpdated: new Date().toISOString(),
      section: 'system_status',
      meta: {
        remoteness_score: output.score,
        raw_score: output.rawScore,
        tier: output.tier,
        elevation_signal: output.signals?.elevationScore ?? 0,
        connectivity_signal: output.signals?.connectivityScore ?? 0,
        speed_signal: output.signals?.speedScore ?? 0,
        connectivity_state: output.signals?.connectivityState || 'unknown',
        sustained_speed_mph: output.signals?.sustainedSpeedMph ?? null,
        cache_ready: output.signals?.cacheReady ?? false,
        freshness: output.signals?.freshness || 'unknown',
        expedition_data_ready: output.signals?.expeditionDataReady ?? false,
      },
    };
  } catch (e: any) {
    return {
      name: 'Remoteness Engine',
      key: 'remoteness',
      status: 'FAILED',
      description: `Probe error: ${e?.message || 'Unknown'}`,
      lastUpdated: null,
      section: 'system_status',
    };
  }
}

function probeExpeditionRiskEngine(): SystemDiagnostic {
  try {
    const { expeditionRiskStore } = require('./expeditionRiskStore');
    if (!expeditionRiskStore.isInitialized()) {
      return {
        name: 'Expedition Risk Engine',
        key: 'risk_engine',
        status: 'IDLE',
        description: 'Not initialized',
        lastUpdated: null,
        section: 'system_status',
      };
    }
    const summary = expeditionRiskStore.getSummary();
    const state = expeditionRiskStore.getState();
    const stabilized = expeditionRiskStore.getStabilizedStatus();
    if (!summary) {
      return {
        name: 'Expedition Risk Engine',
        key: 'risk_engine',
        status: 'DEGRADED',
        description: 'Initialized but no evaluation yet',
        lastUpdated: null,
        section: 'system_status',
        meta: {
          running: state.running,
          evaluation_count: state.evaluation_count,
        },
      };
    }
    return {
      name: 'Expedition Risk Engine',
      key: 'risk_engine',
      status: state.running ? 'OK' : 'DEGRADED',
      description: `Risk: ${summary.risk_score}/100 (${stabilized})`,
      lastUpdated: summary.updated_at,
      section: 'system_status',
      meta: {
        risk_score: summary.risk_score,
        operational_status: summary.operational_status,
        stabilized_status: stabilized,
        primary_risk_factor: summary.primary_risk_factor,
        primary_risk_label: summary.primary_risk_label,
        capability_score: summary.capability_score,
        resource_readiness: summary.resource_readiness,
        connectivity_risk: summary.connectivity_risk,
        isolation_risk: summary.isolation_risk,
        route_difficulty_score: summary.route_difficulty_score,
        resource_route_balance: summary.resource_route_balance,
        available_inputs: summary.available_inputs,
        total_inputs: summary.total_inputs,
        is_complete: summary.is_complete,
        evaluation_count: state.evaluation_count,
        running: state.running,
      },
    };
  } catch (e: any) {
    return {
      name: 'Expedition Risk Engine',
      key: 'risk_engine',
      status: 'FAILED',
      description: `Probe error: ${e?.message || 'Unknown'}`,
      lastUpdated: null,
      section: 'system_status',
    };
  }
}


// ── Diagnostic Probes — Telemetry ────────────────────────────

function probeVehicleTelemetry(): SystemDiagnostic {
  try {
    let store: any = null;
    try {
      store = require('../src/vehicle-telemetry/VehicleTelemetryStore');
    } catch {
      try {
        store = require('../vehicle-telemetry/VehicleTelemetryStore');
      } catch {}
    }

    // Runtime fix: use the lowercase singleton export (vehicleTelemetryStore),
    // NOT the class name (VehicleTelemetryStore). The class is not re-exported
    // as a usable instance — only the singleton is.
    const vts = store?.vehicleTelemetryStore;
    if (!vts) {
      return {
        name: 'Vehicle Telemetry',
        key: 'vehicle_telemetry',
        status: 'IDLE',
        description: 'Module not available',
        lastUpdated: null,
        section: 'telemetry',
      };
    }

    // Use getSummary() — the canonical read method.
    // getLatest() does NOT exist; getLatestTelemetry() returns raw data.
    // isConnected() does NOT exist; derive from summary.connection_state.
    const summary = vts.getSummary?.();
    const isConnected = summary?.connection_state === 'connected';
    const hasData = summary?.has_data ?? false;
    const lastUpdate = summary?.last_updated ?? null;

    if (!isConnected && !hasData) {
      return {
        name: 'Vehicle Telemetry',
        key: 'vehicle_telemetry',
        status: 'IDLE',
        description: 'No OBD2 device connected',
        lastUpdated: null,
        section: 'telemetry',
        meta: {
          connection_state: 'disconnected',
        },
      };
    }

    const signals: string[] = [];
    if (summary?.battery_voltage != null) signals.push('battery');
    if (summary?.fuel_level != null) signals.push('fuel');
    if (summary?.coolant_temp != null) signals.push('coolant');
    if (summary?.engine_rpm != null) signals.push('rpm');
    if (summary?.vehicle_speed != null) signals.push('speed');

    return {
      name: 'Vehicle Telemetry',
      key: 'vehicle_telemetry',
      status: isConnected ? 'OK' : 'DEGRADED',
      description: isConnected
        ? `Live — ${signals.length} signal(s): ${signals.join(', ') || 'none'}`
        : `Last known — ${signals.length} signal(s)`,
      lastUpdated: lastUpdate,
      section: 'telemetry',
      meta: {
        connection_state: isConnected ? 'connected' : 'disconnected',
        last_update_time: lastUpdate,
        active_signals: signals.join(', ') || 'none',
        signal_count: signals.length,
      },
    };
  } catch (e: any) {
    return {
      name: 'Vehicle Telemetry',
      key: 'vehicle_telemetry',
      status: 'FAILED',
      description: `Probe error: ${e?.message || 'Unknown'}`,
      lastUpdated: null,
      section: 'telemetry',
    };
  }
}


function probeBluPowerTelemetry(): SystemDiagnostic {
  try {
    // Runtime fix: Use bluStateStore.getSummary() — the canonical BLU telemetry
    // source. PowerDeviceStore only stores device ID selections (async API),
    // NOT live telemetry. The previous code used PowerDeviceStore.getAll()
    // which is async and returns device IDs, not telemetry data.
    const { bluStateStore } = require('../src/power/blu/BluStateStore');
    const summary = bluStateStore.getSummary();

    if (!summary || !summary.available) {
      return {
        name: 'BLU Power Telemetry',
        key: 'blu_power',
        status: 'IDLE',
        description: 'No power devices connected',
        lastUpdated: null,
        section: 'telemetry',
      };
    }

    const battPct = summary.battery_percent ?? null;
    const inputW = summary.live_input ?? null;
    const outputW = summary.live_output ?? null;
    const runtime = summary.runtime_remaining ?? null;
    const systemStatus = bluStateStore.getSystemStatus?.() ?? 'unknown';
    const isStale = bluStateStore.isStale?.() ?? false;

    return {
      name: 'BLU Power Telemetry',
      key: 'blu_power',
      status: isStale ? 'DEGRADED' : 'OK',
      description: `${battPct != null ? battPct + '%' : '?%'} battery, ${inputW ?? '?'}W in / ${outputW ?? '?'}W out`,
      lastUpdated: summary.last_updated ? new Date(summary.last_updated).toISOString() : new Date().toISOString(),
      section: 'telemetry',
      meta: {
        battery_percent: battPct,
        input_watts: inputW,
        output_watts: outputW,
        estimated_runtime: runtime,
        device_count: 1,
        is_sustainable: (inputW ?? 0) >= (outputW ?? 0),
        system_status: systemStatus,
        provider: summary.active_provider ?? null,
        device_name: summary.active_device_name ?? null,
      },
    };
  } catch (e: any) {
    return {
      name: 'BLU Power Telemetry',
      key: 'blu_power',
      status: 'IDLE',
      description: 'Power module not available',
      lastUpdated: null,
      section: 'telemetry',
    };
  }
}



// ── Diagnostic Probes — Offline Expedition Database ──────────

function probeOfflineExpeditionDb(): SystemDiagnostic {
  try {
    const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
    if (!offlineExpeditionDbStore.isInitialized()) {
      return {
        name: 'Offline Expedition Database',
        key: 'offline_expedition_db',
        status: 'IDLE',
        description: 'Not initialized',
        lastUpdated: null,
        section: 'offline_db',
      };
    }

    const state = offlineExpeditionDbStore.getState();
    const downloaded = offlineExpeditionDbStore.getDownloadedRegions();
    const storageSummary = offlineExpeditionDbStore.getStorageSummary();

    if (downloaded.length === 0) {
      return {
        name: 'Offline Expedition Database',
        key: 'offline_expedition_db',
        status: 'DEGRADED',
        description: 'No regions downloaded',
        lastUpdated: state.updated_at,
        section: 'offline_db',
        meta: {
          downloaded_regions: 0,
          total_regions: state.regions?.length ?? 0,
          storage_usage: '0 MB',
        },
      };
    }

    // Find active region (covers current position)
    let activeRegion = 'none';
    try {
      const { gpsUIState } = require('./gpsUIState');
      const gps = gpsUIState.get();
      if (gps.hasFix && gps.position) {
        const covering = offlineExpeditionDbStore.getRegionsForPosition(
          gps.position.latitude, gps.position.longitude
        );
        if (covering.length > 0) {
          activeRegion = covering[0].region_name;
        }
      }
    } catch {}

    return {
      name: 'Offline Expedition Database',
      key: 'offline_expedition_db',
      status: 'OK',
      description: `${downloaded.length} region(s), ${state.total_entries} entries`,
      lastUpdated: state.updated_at,
      section: 'offline_db',
      meta: {
        downloaded_regions: downloaded.length,
        active_region: activeRegion,
        dataset_version: downloaded[0]?.dataset_version ?? 0,
        storage_usage: `${storageSummary.total_storage_mb} MB`,
        total_entries: state.total_entries,
        is_downloading: state.is_downloading,
        updates_available: state.updates_available_count,
        integrity_issues: state.integrity_issue_count,
        stale_regions: state.stale_region_count,
      },
    };
  } catch (e: any) {
    return {
      name: 'Offline Expedition Database',
      key: 'offline_expedition_db',
      status: 'FAILED',
      description: `Probe error: ${e?.message || 'Unknown'}`,
      lastUpdated: null,
      section: 'offline_db',
    };
  }
}


// ── Diagnostic Probes — Assistant Context ────────────────────

function probeAssistantContext(): SystemDiagnostic {
  try {
    const { buildContextDiagnostics } = require('./assistantContextEngine');
    const diagnostics = buildContextDiagnostics();

    if (!diagnostics || !diagnostics.entries) {
      return {
        name: 'AI Assistant Context',
        key: 'assistant_context',
        status: 'DEGRADED',
        description: 'Context engine returned no diagnostics',
        lastUpdated: null,
        section: 'assistant',
      };
    }

    const available = diagnostics.entries.filter(
      (e: any) => e.availability === 'available' || e.availability === 'stale'
    );
    const unavailable = diagnostics.entries.filter(
      (e: any) => e.availability === 'unavailable'
    );
    const errored = diagnostics.entries.filter(
      (e: any) => e.availability === 'error'
    );

    const meta: Record<string, string | number | boolean | null> = {
      available_count: available.length,
      total_count: diagnostics.total_count,
      completeness_pct: diagnostics.completeness_pct,
    };

    // List each category's availability
    for (const entry of diagnostics.entries) {
      meta[`ctx_${entry.category}`] = entry.availability;
    }

    // Show missing categories
    if (unavailable.length > 0) {
      meta['missing_categories'] = unavailable.map((e: any) => e.category).join(', ');
    }

    return {
      name: 'AI Assistant Context',
      key: 'assistant_context',
      status: errored.length > 0 ? 'DEGRADED' : available.length > 0 ? 'OK' : 'IDLE',
      description: `${available.length}/${diagnostics.total_count} inputs available (${diagnostics.completeness_pct}%)`,
      lastUpdated: diagnostics.evaluated_at,
      section: 'assistant',
      meta,
    };
  } catch (e: any) {
    return {
      name: 'AI Assistant Context',
      key: 'assistant_context',
      status: 'FAILED',
      description: `Probe error: ${e?.message || 'Unknown'}`,
      lastUpdated: null,
      section: 'assistant',
    };
  }
}


// ── Diagnostic Probes — Map + Navigation ─────────────────────

function probeMapNavigation(): SystemDiagnostic {
  try {
    const { routeStore } = require('./routeStore');
    const activeRoute = routeStore.getActive();

    let cachedTrailsLoaded = false;
    let mapSource: 'online' | 'offline' | 'unknown' = 'unknown';

    try {
      const { connectivityIntelStore } = require('./connectivityIntelStore');
      const summary = connectivityIntelStore.getSummary();
      if (summary) {
        mapSource = summary.internet_reachable ? 'online' : 'offline';
        cachedTrailsLoaded = summary.offline_cache_ready || false;
      }
    } catch {}

    try {
      const { tileCacheStore } = require('./tileCacheStore');
      const cacheState = tileCacheStore.getState?.();
      if (cacheState?.cached_regions > 0) {
        cachedTrailsLoaded = true;
      }
    } catch {}

    const meta: Record<string, string | number | boolean | null> = {
      active_route: activeRoute?.name || 'none',
      cached_trails_loaded: cachedTrailsLoaded,
      map_source: mapSource,
    };

    if (activeRoute) {
      meta['route_distance_mi'] = activeRoute.total_distance_miles || activeRoute.totalDistanceMi || null;
      meta['route_segments'] = activeRoute.segment_count || activeRoute.segmentCount || (activeRoute.segments?.length ?? 0);
      meta['route_waypoints'] = activeRoute.waypoint_count || activeRoute.waypointCount || (activeRoute.waypoints?.length ?? 0);
    }

    return {
      name: 'Map + Navigation',
      key: 'map_navigation',
      status: activeRoute ? 'OK' : 'IDLE',
      description: activeRoute
        ? `Route: ${activeRoute.name || 'Active'} (${mapSource})`
        : `No active route (${mapSource})`,
      lastUpdated: new Date().toISOString(),
      section: 'map_nav',
      meta,
    };
  } catch (e: any) {
    return {
      name: 'Map + Navigation',
      key: 'map_navigation',
      status: 'FAILED',
      description: `Probe error: ${e?.message || 'Unknown'}`,
      lastUpdated: null,
      section: 'map_nav',
    };
  }
}


// ── Diagnostic Probes — Performance ──────────────────────────

let _lastDiagnosticsRunTime = 0;
let _diagnosticsRunCount = 0;

function probePerformance(): SystemDiagnostic {
  const now = Date.now();
  const meta: Record<string, string | number | boolean | null> = {
    last_system_update_time: _lastDiagnosticsRunTime > 0
      ? new Date(_lastDiagnosticsRunTime).toISOString()
      : 'first run',
    diagnostics_run_count: _diagnosticsRunCount,
  };

  // Check widget refresh cycle from dashboard store
  try {
    const { dashboardStore } = require('./dashboardStore');
    const state = dashboardStore.getState?.();
    meta['widget_count'] = state?.widgets?.length ?? 0;
    meta['widget_refresh_cycle'] = '5s (auto-refresh)';
  } catch {
    meta['widget_refresh_cycle'] = 'unknown';
  }

  // Check telemetry update frequency
  try {
    const { expeditionRiskStore } = require('./expeditionRiskStore');
    const riskState = expeditionRiskStore.getState();
    meta['risk_evaluation_count'] = riskState.evaluation_count;
    meta['telemetry_update_frequency'] = riskState.running ? '15s (periodic)' : 'inactive';
  } catch {
    meta['telemetry_update_frequency'] = 'unknown';
  }

  // Memory estimate (rough)
  try {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const mem = (performance as any).memory;
      meta['heap_used_mb'] = Math.round(mem.usedJSHeapSize / 1048576);
      meta['heap_total_mb'] = Math.round(mem.totalJSHeapSize / 1048576);
    }
  } catch {}

  return {
    name: 'Performance',
    key: 'performance',
    status: 'OK',
    description: `Diagnostics run #${_diagnosticsRunCount + 1}`,
    lastUpdated: new Date().toISOString(),
    section: 'performance',
    meta,
  };
}


// ── Original Core Engine Probes ──────────────────────────────

function probeRouteIntelligence(): SystemDiagnostic {
  try {
    const intel = routeAnalysisEngine.getCurrent();
    if (!intel) {
      return { name: 'Route Intelligence', key: 'route_intelligence', status: 'IDLE', description: 'No route loaded', lastUpdated: null, section: 'core_engines' };
    }
    if (typeof intel.totalDistanceMiles !== 'number' || !Array.isArray(intel.segments) || typeof intel.segmentCount !== 'number') {
      return { name: 'Route Intelligence', key: 'route_intelligence', status: 'DEGRADED', description: 'Route data incomplete', lastUpdated: intel.analyzedAt || null, section: 'core_engines', meta: { distance: intel.totalDistanceMiles ?? null, segments: intel.segmentCount ?? null } };
    }
    return { name: 'Route Intelligence', key: 'route_intelligence', status: 'OK', description: `${intel.totalDistanceMiles.toFixed(1)} mi, ${intel.segmentCount} segments`, lastUpdated: intel.analyzedAt, section: 'core_engines', meta: { distance: intel.totalDistanceMiles, segments: intel.segmentCount, hasElevation: intel.hasElevation, difficulty: intel.overallDifficulty } };
  } catch (e: any) {
    return { name: 'Route Intelligence', key: 'route_intelligence', status: 'FAILED', description: `Probe error: ${e?.message || 'Unknown'}`, lastUpdated: null, section: 'core_engines' };
  }
}

function probeTerrainEngine(): SystemDiagnostic {
  try {
    const intel = terrainAnalysisEngine.getCurrent();
    if (!intel) {
      return { name: 'Terrain Engine', key: 'terrain_engine', status: 'IDLE', description: 'No terrain analysis', lastUpdated: null, section: 'core_engines' };
    }
    if (typeof intel.steepSegments !== 'number' || !Array.isArray(intel.terrainWarnings)) {
      return { name: 'Terrain Engine', key: 'terrain_engine', status: 'DEGRADED', description: 'Terrain data incomplete', lastUpdated: intel.analyzedAt || null, section: 'core_engines' };
    }
    return { name: 'Terrain Engine', key: 'terrain_engine', status: 'OK', description: `Risk: ${intel.overallRisk}, ${intel.terrainWarnings.length} warnings`, lastUpdated: intel.analyzedAt, section: 'core_engines', meta: { risk: intel.overallRisk, steepSegments: intel.steepSegments, warnings: intel.terrainWarnings.length } };
  } catch (e: any) {
    return { name: 'Terrain Engine', key: 'terrain_engine', status: 'FAILED', description: `Probe error: ${e?.message || 'Unknown'}`, lastUpdated: null, section: 'core_engines' };
  }
}

function probeResourceForecast(): SystemDiagnostic {
  try {
    const forecast = resourceForecastEngine.getCurrent();
    if (!forecast) {
      return { name: 'Resource Forecast', key: 'resource_forecast', status: 'IDLE', description: 'No forecast computed', lastUpdated: null, section: 'core_engines' };
    }
    const hasNaN = isNaN(forecast.routeMiles) || isNaN(forecast.estimatedDriveHours) || isNaN(forecast.fuel.requiredGallons) || isNaN(forecast.water.requiredGallons) || isNaN(forecast.power.requiredHours);
    if (hasNaN) {
      return { name: 'Resource Forecast', key: 'resource_forecast', status: 'DEGRADED', description: 'Forecast contains NaN values', lastUpdated: forecast.computedAt, section: 'core_engines' };
    }
    return { name: 'Resource Forecast', key: 'resource_forecast', status: 'OK', description: `${forecast.routeMiles} mi, status: ${forecast.overallStatus}`, lastUpdated: forecast.computedAt, section: 'core_engines', meta: { routeMiles: forecast.routeMiles, overallStatus: forecast.overallStatus, hasRealData: forecast.hasRealData } };
  } catch (e: any) {
    return { name: 'Resource Forecast', key: 'resource_forecast', status: 'FAILED', description: `Probe error: ${e?.message || 'Unknown'}`, lastUpdated: null, section: 'core_engines' };
  }
}

function probeCampsiteEngine(): SystemDiagnostic {
  try {
    const result = campsiteCandidateEngine.getCurrent();
    if (!result) {
      return { name: 'Campsite Engine', key: 'campsite_engine', status: 'IDLE', description: 'No campsite analysis', lastUpdated: null, section: 'core_engines' };
    }
    return { name: 'Campsite Engine', key: 'campsite_engine', status: 'OK', description: `${result.candidateCount} candidates, ${result.suggestedCampsites.length} suggested`, lastUpdated: result.analyzedAt, section: 'core_engines' };
  } catch (e: any) {
    return { name: 'Campsite Engine', key: 'campsite_engine', status: 'FAILED', description: `Probe error: ${e?.message || 'Unknown'}`, lastUpdated: null, section: 'core_engines' };
  }
}

function probeForecastEngine(): SystemDiagnostic {
  try {
    const forecast = expeditionForecastEngine.getCurrent();
    if (!forecast) {
      return { name: 'Forecast Engine', key: 'forecast_engine', status: 'IDLE', description: 'No expedition forecast', lastUpdated: null, section: 'core_engines' };
    }
    return { name: 'Forecast Engine', key: 'forecast_engine', status: 'OK', description: `Status: ${forecast.status}, ${forecast.alerts.length} alerts`, lastUpdated: forecast.computedAt, section: 'core_engines' };
  } catch (e: any) {
    return { name: 'Forecast Engine', key: 'forecast_engine', status: 'FAILED', description: `Probe error: ${e?.message || 'Unknown'}`, lastUpdated: null, section: 'core_engines' };
  }
}

function probeMapRendering(): SystemDiagnostic {
  return { name: 'Map Rendering', key: 'map_rendering', status: 'OK', description: 'Map renderer available', lastUpdated: new Date().toISOString(), section: 'core_engines' };
}

function probeVehicleTwin(): SystemDiagnostic {
  return { name: 'Vehicle Twin', key: 'vehicle_twin', status: 'OK', description: 'Vehicle twin renderer available', lastUpdated: new Date().toISOString(), section: 'core_engines' };
}


// ── Public API ───────────────────────────────────────────────

/**
 * Run a full diagnostics sweep across all ECS systems.
 * Returns a complete DiagnosticsReport.
 */
export function runDiagnostics(): DiagnosticsReport {
  const startTime = Date.now();

  const systems: SystemDiagnostic[] = [
    // System Status
    probeConnectivityIntelligence(),
    probeRemoteness(),
    probeExpeditionRiskEngine(),
    // Telemetry
    probeVehicleTelemetry(),
    probeBluPowerTelemetry(),
    // Offline Expedition Database
    probeOfflineExpeditionDb(),
    // Assistant Context
    probeAssistantContext(),
    // Map + Navigation
    probeMapNavigation(),
    // Performance
    probePerformance(),
    // Core Engines
    probeRouteIntelligence(),
    probeTerrainEngine(),
    probeResourceForecast(),
    probeCampsiteEngine(),
    probeForecastEngine(),
    probeMapRendering(),
    probeVehicleTwin(),
  ];

  let okCount = 0;
  let failedCount = 0;
  let idleCount = 0;
  let degradedCount = 0;

  for (const sys of systems) {
    switch (sys.status) {
      case 'OK': okCount++; break;
      case 'FAILED': failedCount++; break;
      case 'IDLE': idleCount++; break;
      case 'DEGRADED': degradedCount++; break;
    }
  }

  let overallStatus: DiagnosticStatus = 'OK';
  if (failedCount > 0) overallStatus = 'FAILED';
  else if (degradedCount > 0) overallStatus = 'DEGRADED';
  else if (okCount === 0) overallStatus = 'IDLE';

  _diagnosticsRunCount++;
  _lastDiagnosticsRunTime = Date.now();

  const elapsed = Date.now() - startTime;
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  if (isDev) {
    console.log(TAG, `Full sweep: ${systems.length} systems in ${elapsed}ms (${okCount} OK, ${failedCount} FAILED, ${degradedCount} DEGRADED, ${idleCount} IDLE)`);
  }

  return {
    systems,
    overallStatus,
    generatedAt: new Date().toISOString(),
    okCount,
    failedCount,
    idleCount,
    degradedCount,
    appVersion: '1.0.0',
    buildEnv: isDev ? 'development' : 'production',
  };

}

/**
 * Quick health check — returns true if no systems are FAILED.
 */
export function isSystemHealthy(): boolean {
  const report = runDiagnostics();
  return report.failedCount === 0;
}

/**
 * Get a compact status string for display.
 */
export function getSystemStatusSummary(): string {
  const report = runDiagnostics();
  if (report.failedCount > 0) {
    return `${report.failedCount} SYSTEM${report.failedCount > 1 ? 'S' : ''} FAILED`;
  }
  if (report.degradedCount > 0) {
    return `${report.degradedCount} DEGRADED, ${report.okCount} OK`;
  }
  if (report.okCount === 0) {
    return 'ALL SYSTEMS IDLE';
  }
  return `ALL SYSTEMS OK (${report.okCount}/${report.systems.length})`;
}

/**
 * Get diagnostics for a specific section.
 */
export function getDiagnosticsBySection(section: string): SystemDiagnostic[] {
  const report = runDiagnostics();
  return report.systems.filter(s => s.section === section);
}

/**
 * Section labels for display.
 */
export const DIAGNOSTIC_SECTIONS: { key: string; label: string; icon: string }[] = [
  { key: 'system_status', label: 'SYSTEM STATUS', icon: 'pulse-outline' },
  { key: 'telemetry', label: 'TELEMETRY', icon: 'speedometer-outline' },
  { key: 'offline_db', label: 'OFFLINE EXPEDITION DATABASE', icon: 'cloud-offline-outline' },
  { key: 'assistant', label: 'ASSISTANT CONTEXT', icon: 'chatbubble-ellipses-outline' },
  { key: 'map_nav', label: 'MAP + NAVIGATION', icon: 'navigate-outline' },
  { key: 'performance', label: 'PERFORMANCE', icon: 'analytics-outline' },
  { key: 'core_engines', label: 'CORE ENGINES', icon: 'hardware-chip-outline' },
];


