/**
 * VehicleDisplayFallback — Shared Fallback Handling Layer
 *
 * Provides graceful degradation for the ECS vehicle interface
 * (Android Auto and Apple CarPlay) when data sources are unavailable,
 * connectivity is poor, or the user is operating in remote terrain.
 *
 * Detects and responds to:
 *   - GPS unavailable
 *   - No active route
 *   - No active expedition
 *   - Offline maps unavailable
 *   - Weather data unavailable
 *   - Connectivity lost
 *   - Breadcrumb data missing
 *
 * Architecture:
 *   - Timer-driven health evaluation (5s interval)
 *   - Reads from gpsUIState, connectivity, weatherStore, breadcrumbTracker
 *   - Produces VehicleSystemHealth for native screens (Android Auto + CarPlay)
 *   - Each screen degrades independently and gracefully
 *   - Does NOT modify the mobile ECS dashboard
 *
 * Design Principles:
 *   - No screen should fail silently or render blank content
 *   - Minimal text, no technical error dumps
 *   - Clear unavailable messaging that reassures the driver
 *   - Each data source failure is isolated (one failing doesn't break others)
 */


import type {
  VehicleSystemHealth,
  VehicleSubsystemStatus,
  VehicleDisplayMode,
} from './vehicleDisplayTypes';


// ── Constants ───────────────────────────────────────────────

const EVAL_INTERVAL_MS = 5_000;  // Evaluate health every 5 seconds
const WEATHER_STALE_MS = 15 * 60 * 1000;  // 15 minutes
const GPS_STALE_MS = 2 * 60 * 1000;       // 2 minutes

// ── Internal State ──────────────────────────────────────────

let _health: VehicleSystemHealth = createDefaultHealth();
let _evalTimer: ReturnType<typeof setInterval> | null = null;
let _isRunning = false;

// Timestamps for stale detection
let _lastGoodGpsAt: number | null = null;
let _lastGoodWeatherAt: number | null = null;
let _lastGoodStatusAt: number | null = null;

// Last known GPS position (retained when GPS drops)
let _lastKnownLat: number | null = null;
let _lastKnownLon: number | null = null;
let _lastKnownHeading: number | null = null;

// Breadcrumb pause/resume tracking
let _breadcrumbWasRecording = false;
let _gpsPausedBreadcrumb = false;

// Listeners
type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify(): void {
  for (const fn of _listeners) {
    try { fn(); } catch {}
  }
}

// ── Default Health ──────────────────────────────────────────

function createDefaultSubsystem(label: string): VehicleSubsystemStatus {
  return {
    available: false,
    label,
    severity: 'unknown',
    detail: null,
    lastGoodDataAt: null,
    isStale: false,
    staleSinceMinutes: null,
  };
}

function createDefaultHealth(): VehicleSystemHealth {
  return {
    gps: createDefaultSubsystem('GPS Unknown'),
    connectivity: createDefaultSubsystem('Connectivity Unknown'),
    weather: createDefaultSubsystem('Weather Unknown'),
    offlineMaps: createDefaultSubsystem('Maps Unknown'),
    route: createDefaultSubsystem('No Route'),
    expedition: createDefaultSubsystem('No Expedition'),
    breadcrumb: createDefaultSubsystem('No Trail'),
    overallStatus: 'nominal',
    statusLine: 'Initializing...',
    lastEvaluatedAt: 0,
  };
}

// ── Stale Detection Helpers ─────────────────────────────────

function minutesSince(timestamp: number | null): number | null {
  if (timestamp == null) return null;
  return Math.round((Date.now() - timestamp) / 60_000);
}

function isStale(timestamp: number | null, thresholdMs: number): boolean {
  if (timestamp == null) return false;
  return Date.now() - timestamp > thresholdMs;
}

// ── Health Evaluation ───────────────────────────────────────

function _evaluateGps(): VehicleSubsystemStatus {
  try {
    const { gpsUIState } = require('./gpsUIState');
    const gps = gpsUIState.get();

    if (gps.hasFix && gps.position) {
      _lastGoodGpsAt = Date.now();
      _lastKnownLat = gps.position.latitude;
      _lastKnownLon = gps.position.longitude;
      _lastKnownHeading = gps.position.headingDeg ?? null;

      // Resume breadcrumb if GPS was paused
      if (_gpsPausedBreadcrumb) {
        _gpsPausedBreadcrumb = false;
        try {
          const { breadcrumbTracker } = require('./breadcrumbTracker');
          if (_breadcrumbWasRecording && !breadcrumbTracker.isRecording()) {
            breadcrumbTracker.startRecording();
            console.log('[VehicleDisplayFallback] GPS restored — resuming breadcrumb recording');
          }
        } catch {}
      }

      const quality = gps.fixQuality;
      if (quality === 'HIGH') {
        return {
          available: true,
          label: 'GPS OK',
          severity: 'ok',
          detail: 'Strong signal',
          lastGoodDataAt: _lastGoodGpsAt,
          isStale: false,
          staleSinceMinutes: null,
        };
      } else if (quality === 'MEDIUM') {
        return {
          available: true,
          label: 'GPS OK',
          severity: 'ok',
          detail: 'Moderate signal',
          lastGoodDataAt: _lastGoodGpsAt,
          isStale: false,
          staleSinceMinutes: null,
        };
      } else {
        return {
          available: true,
          label: 'GPS Weak',
          severity: 'warning',
          detail: 'Low accuracy',
          lastGoodDataAt: _lastGoodGpsAt,
          isStale: false,
          staleSinceMinutes: null,
        };
      }
    }

    // No fix — check if we had a recent fix (stale)
    if (_lastGoodGpsAt && !isStale(_lastGoodGpsAt, GPS_STALE_MS)) {
      // Pause breadcrumb recording during GPS drop
      _pauseBreadcrumbOnGpsDrop();

      return {
        available: false,
        label: 'GPS Acquiring',
        severity: 'warning',
        detail: 'Signal lost — acquiring',
        lastGoodDataAt: _lastGoodGpsAt,
        isStale: false,
        staleSinceMinutes: minutesSince(_lastGoodGpsAt),
      };
    }

    // GPS lost for extended period
    _pauseBreadcrumbOnGpsDrop();

    return {
      available: false,
      label: 'GPS Lost',
      severity: 'error',
      detail: gps.permissionDenied ? 'Permission denied' : 'No signal',
      lastGoodDataAt: _lastGoodGpsAt,
      isStale: _lastGoodGpsAt != null,
      staleSinceMinutes: minutesSince(_lastGoodGpsAt),
    };
  } catch {
    return createDefaultSubsystem('GPS Error');
  }
}

function _pauseBreadcrumbOnGpsDrop(): void {
  if (_gpsPausedBreadcrumb) return;
  try {
    const { breadcrumbTracker } = require('./breadcrumbTracker');
    if (breadcrumbTracker.isRecording()) {
      _breadcrumbWasRecording = true;
      _gpsPausedBreadcrumb = true;
      breadcrumbTracker.stopRecording();
      console.log('[VehicleDisplayFallback] GPS lost — pausing breadcrumb recording');
    }
  } catch {}
}

function _evaluateConnectivity(): VehicleSubsystemStatus {
  try {
    const { connectivity } = require('./connectivity');
    const level = connectivity.getLevel();

    switch (level) {
      case 'normal':
        return {
          available: true,
          label: 'Online',
          severity: 'ok',
          detail: null,
          lastGoodDataAt: Date.now(),
          isStale: false,
          staleSinceMinutes: null,
        };
      case 'limited':
        return {
          available: true,
          label: 'Limited',
          severity: 'warning',
          detail: 'Unstable connection',
          lastGoodDataAt: Date.now(),
          isStale: false,
          staleSinceMinutes: null,
        };
      case 'no_service':
        return {
          available: false,
          label: 'Offline',
          severity: 'error',
          detail: 'No network',
          lastGoodDataAt: null,
          isStale: false,
          staleSinceMinutes: null,
        };
      default:
        return createDefaultSubsystem('Connectivity Unknown');
    }
  } catch {
    return createDefaultSubsystem('Connectivity Error');
  }
}

function _evaluateWeather(): VehicleSubsystemStatus {
  try {
    const { vehicleDisplayStore } = require('./vehicleDisplayStore');
    const weatherData = vehicleDisplayStore.getWeatherData();

    // Check if we have any meaningful weather data
    const hasData = weatherData.temperatureF != null ||
                    weatherData.weatherMain != null ||
                    weatherData.windSpeedMph != null;

    if (hasData) {
      _lastGoodWeatherAt = Date.now();

      return {
        available: true,
        label: 'Weather OK',
        severity: 'ok',
        detail: null,
        lastGoodDataAt: _lastGoodWeatherAt,
        isStale: false,
        staleSinceMinutes: null,
      };
    }

    // No current data — check staleness
    if (_lastGoodWeatherAt) {
      const staleMinutes = minutesSince(_lastGoodWeatherAt);
      const stale = isStale(_lastGoodWeatherAt, WEATHER_STALE_MS);

      return {
        available: false,
        label: stale ? 'Weather Stale' : 'Weather Updating',
        severity: stale ? 'warning' : 'ok',
        detail: staleMinutes != null ? `Last updated ${staleMinutes} min ago` : null,
        lastGoodDataAt: _lastGoodWeatherAt,
        isStale: stale,
        staleSinceMinutes: staleMinutes,
      };
    }

    return {
      available: false,
      label: 'No Weather',
      severity: 'warning',
      detail: 'Check connection',
      lastGoodDataAt: null,
      isStale: false,
      staleSinceMinutes: null,
    };
  } catch {
    return createDefaultSubsystem('Weather Error');
  }
}

function _evaluateOfflineMaps(): VehicleSubsystemStatus {
  try {
    const { vehicleDisplayStore } = require('./vehicleDisplayStore');
    const indicators = vehicleDisplayStore.getIndicators();

    if (indicators.offlineMaps) {
      return {
        available: true,
        label: 'Maps Ready',
        severity: 'ok',
        detail: null,
        lastGoodDataAt: Date.now(),
        isStale: false,
        staleSinceMinutes: null,
      };
    }

    return {
      available: false,
      label: 'No Offline Maps',
      severity: 'warning',
      detail: 'Online maps only',
      lastGoodDataAt: null,
      isStale: false,
      staleSinceMinutes: null,
    };
  } catch {
    return createDefaultSubsystem('Maps Unknown');
  }
}

function _evaluateRoute(): VehicleSubsystemStatus {
  try {
    const { vehicleDisplayStore } = require('./vehicleDisplayStore');
    const mapData = vehicleDisplayStore.getMapData();

    const hasRoute = mapData.routeLine || mapData.importedGpxRoute;

    if (hasRoute) {
      return {
        available: true,
        label: 'Route Active',
        severity: 'ok',
        detail: mapData.importedGpxRoute ? 'GPX route' : 'Navigation route',
        lastGoodDataAt: Date.now(),
        isStale: false,
        staleSinceMinutes: null,
      };
    }

    return {
      available: false,
      label: 'No Route',
      severity: 'ok',  // Not an error — just informational
      detail: 'Free driving',
      lastGoodDataAt: null,
      isStale: false,
      staleSinceMinutes: null,
    };
  } catch {
    return createDefaultSubsystem('Route Unknown');
  }
}

function _evaluateExpedition(): VehicleSubsystemStatus {
  try {
    const { vehicleDisplayStore } = require('./vehicleDisplayStore');
    const mode = vehicleDisplayStore.getMode();

    if (mode === 'expedition_drive') {
      return {
        available: true,
        label: 'Expedition Active',
        severity: 'ok',
        detail: null,
        lastGoodDataAt: Date.now(),
        isStale: false,
        staleSinceMinutes: null,
      };
    }

    return {
      available: false,
      label: 'No Expedition',
      severity: 'ok',  // Not an error
      detail: null,
      lastGoodDataAt: null,
      isStale: false,
      staleSinceMinutes: null,
    };
  } catch {
    return createDefaultSubsystem('Expedition Unknown');
  }
}

function _evaluateBreadcrumb(): VehicleSubsystemStatus {
  try {
    const { breadcrumbTracker } = require('./breadcrumbTracker');
    const state = breadcrumbTracker.get();

    if (state.isRecording && state.pointCount > 0) {
      return {
        available: true,
        label: 'Trail Recording',
        severity: 'ok',
        detail: `${state.pointCount} pts`,
        lastGoodDataAt: Date.now(),
        isStale: false,
        staleSinceMinutes: null,
      };
    }

    if (!state.isRecording && state.pointCount > 0) {
      return {
        available: true,
        label: _gpsPausedBreadcrumb ? 'Trail Paused (GPS)' : 'Trail Paused',
        severity: _gpsPausedBreadcrumb ? 'warning' : 'ok',
        detail: `${state.pointCount} pts saved`,
        lastGoodDataAt: Date.now(),
        isStale: false,
        staleSinceMinutes: null,
      };
    }

    return {
      available: false,
      label: 'No Trail',
      severity: 'ok',  // Not an error
      detail: null,
      lastGoodDataAt: null,
      isStale: false,
      staleSinceMinutes: null,
    };
  } catch {
    return createDefaultSubsystem('Trail Unknown');
  }
}

// ── Overall Health Computation ──────────────────────────────

function _computeOverallStatus(health: VehicleSystemHealth): 'nominal' | 'degraded' | 'critical' {
  const subsystems = [
    health.gps,
    health.connectivity,
    health.weather,
    health.offlineMaps,
    health.route,
    health.expedition,
    health.breadcrumb,
  ];

  const errorCount = subsystems.filter(s => s.severity === 'error').length;
  const warningCount = subsystems.filter(s => s.severity === 'warning').length;

  // GPS error is always critical
  if (health.gps.severity === 'error') return 'critical';

  // Multiple errors = critical
  if (errorCount >= 2) return 'critical';

  // Any errors or multiple warnings = degraded
  if (errorCount >= 1 || warningCount >= 2) return 'degraded';

  return 'nominal';
}

function _buildStatusLine(health: VehicleSystemHealth): string {
  const parts: string[] = [];

  // Always show GPS status
  parts.push(health.gps.label);

  // Show connectivity if not online
  if (health.connectivity.severity !== 'ok') {
    parts.push(health.connectivity.label);
  }

  // Show weather if unavailable
  if (!health.weather.available) {
    parts.push(health.weather.label);
  }

  // Show expedition status if active
  if (health.expedition.available) {
    parts.push('Expedition');
  }

  // Show breadcrumb warning if paused by GPS
  if (health.breadcrumb.severity === 'warning') {
    parts.push(health.breadcrumb.label);
  }

  return parts.join(' \u2022 ');
}

// ── Core Evaluation ─────────────────────────────────────────

function _evaluate(): void {
  const gps = _evaluateGps();
  const conn = _evaluateConnectivity();
  const weather = _evaluateWeather();
  const offlineMaps = _evaluateOfflineMaps();
  const route = _evaluateRoute();
  const expedition = _evaluateExpedition();
  const breadcrumb = _evaluateBreadcrumb();

  const newHealth: VehicleSystemHealth = {
    gps,
    connectivity: conn,
    weather,
    offlineMaps,
    route,
    expedition,
    breadcrumb,
    overallStatus: 'nominal',
    statusLine: '',
    lastEvaluatedAt: Date.now(),
  };

  newHealth.overallStatus = _computeOverallStatus(newHealth);
  newHealth.statusLine = _buildStatusLine(newHealth);

  _health = newHealth;
  _notify();
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

export const vehicleDisplayFallback = {
  /**
   * Get current system health state.
   */
  get(): VehicleSystemHealth {
    return _health;
  },

  /**
   * Get the overall system status.
   */
  getOverallStatus(): 'nominal' | 'degraded' | 'critical' {
    return _health.overallStatus;
  },

  /**
   * Get the compact status line for display.
   */
  getStatusLine(): string {
    return _health.statusLine;
  },

  /**
   * Whether GPS is currently available.
   */
  hasGps(): boolean {
    return _health.gps.available;
  },

  /**
   * Whether weather data is currently available.
   */
  hasWeather(): boolean {
    return _health.weather.available;
  },

  /**
   * Whether an active route exists.
   */
  hasRoute(): boolean {
    return _health.route.available;
  },

  /**
   * Whether an active expedition is running.
   */
  hasExpedition(): boolean {
    return _health.expedition.available;
  },

  /**
   * Whether breadcrumb trail data exists.
   */
  hasBreadcrumb(): boolean {
    return _health.breadcrumb.available;
  },

  /**
   * Whether connectivity is available.
   */
  hasConnectivity(): boolean {
    return _health.connectivity.available;
  },

  /**
   * Get the last known GPS position (retained when GPS drops).
   * Returns null if GPS has never had a fix.
   */
  getLastKnownPosition(): { lat: number; lon: number; heading: number | null } | null {
    if (_lastKnownLat == null || _lastKnownLon == null) return null;
    return {
      lat: _lastKnownLat,
      lon: _lastKnownLon,
      heading: _lastKnownHeading,
    };
  },

  /**
   * Get the weather stale info.
   * Returns null if weather has never been available.
   */
  getWeatherStaleInfo(): { isStale: boolean; minutesAgo: number | null } | null {
    if (_lastGoodWeatherAt == null) return null;
    return {
      isStale: isStale(_lastGoodWeatherAt, WEATHER_STALE_MS),
      minutesAgo: minutesSince(_lastGoodWeatherAt),
    };
  },

  /**
   * Whether breadcrumb recording was paused due to GPS loss.
   */
  isBreadcrumbPausedByGps(): boolean {
    return _gpsPausedBreadcrumb;
  },

  /**
   * Mark weather data as received (updates stale tracking).
   */
  markWeatherReceived(): void {
    _lastGoodWeatherAt = Date.now();
  },

  /**
   * Mark GPS data as received (updates stale tracking).
   */
  markGpsReceived(): void {
    _lastGoodGpsAt = Date.now();
  },

  /**
   * Build the system health JSON for pushing to native vehicle displays
   * (Android Auto SharedPreferences and CarPlay UserDefaults).
   */

  buildNativeHealthPayload(): Record<string, unknown> {
    const h = _health;
    return {
      overallStatus: h.overallStatus,
      statusLine: h.statusLine,
      lastEvaluatedAt: h.lastEvaluatedAt,
      gps: {
        available: h.gps.available,
        label: h.gps.label,
        severity: h.gps.severity,
        detail: h.gps.detail,
        isStale: h.gps.isStale,
        staleSinceMinutes: h.gps.staleSinceMinutes,
      },
      connectivity: {
        available: h.connectivity.available,
        label: h.connectivity.label,
        severity: h.connectivity.severity,
      },
      weather: {
        available: h.weather.available,
        label: h.weather.label,
        severity: h.weather.severity,
        detail: h.weather.detail,
        isStale: h.weather.isStale,
        staleSinceMinutes: h.weather.staleSinceMinutes,
      },
      offlineMaps: {
        available: h.offlineMaps.available,
        label: h.offlineMaps.label,
        severity: h.offlineMaps.severity,
      },
      route: {
        available: h.route.available,
        label: h.route.label,
        detail: h.route.detail,
      },
      expedition: {
        available: h.expedition.available,
        label: h.expedition.label,
      },
      breadcrumb: {
        available: h.breadcrumb.available,
        label: h.breadcrumb.label,
        severity: h.breadcrumb.severity,
        detail: h.breadcrumb.detail,
      },
      lastKnownPosition: _lastKnownLat != null ? {
        lat: _lastKnownLat,
        lon: _lastKnownLon,
        heading: _lastKnownHeading,
      } : null,
    };
  },

  // ── Lifecycle ─────────────────────────────────────────────

  /**
   * Start the fallback evaluation engine.
   */
  start(): void {
    if (_isRunning) return;
    _isRunning = true;

    // Immediate first evaluation
    _evaluate();

    // Periodic evaluation
    _evalTimer = setInterval(_evaluate, EVAL_INTERVAL_MS);

    console.log('[VehicleDisplayFallback] Fallback engine started');
  },

  /**
   * Stop the fallback evaluation engine.
   */
  stop(): void {
    _isRunning = false;
    if (_evalTimer) {
      clearInterval(_evalTimer);
      _evalTimer = null;
    }
  },

  /**
   * Whether the engine is running.
   */
  isRunning(): boolean {
    return _isRunning;
  },

  /**
   * Reset all state.
   */
  reset(): void {
    vehicleDisplayFallback.stop();
    _health = createDefaultHealth();
    _lastGoodGpsAt = null;
    _lastGoodWeatherAt = null;
    _lastGoodStatusAt = null;
    _lastKnownLat = null;
    _lastKnownLon = null;
    _lastKnownHeading = null;
    _breadcrumbWasRecording = false;
    _gpsPausedBreadcrumb = false;
    _notify();
  },

  /**
   * Force an immediate health evaluation.
   */
  evaluate(): void {
    _evaluate();
  },

  /**
   * Subscribe to health state changes.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};

