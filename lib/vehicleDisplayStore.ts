/**
 * VehicleDisplayStore — State Management for Vehicle Display Surfaces
 *
 * Manages the state of the VehicleDisplayMode system, including:
 *   - Current operating mode (HighwayDrive / ExpeditionDrive)
 *   - Active screen selection (Map / Status / Weather / Actions)
 *   - Shared vehicle indicators (GPS, connectivity, offline maps, battery)
 *   - Per-screen data aggregation
 *   - Persistence across sessions
 *
 * Architecture:
 *   - Singleton store with subscribe/get pattern
 *   - Timer-driven data refresh (5s interval)
 *   - Reads from gpsUIState, remotenessStore, connectivity, weatherStore
 *   - Does NOT modify the mobile dashboard state
 *
 * The mobile device remains the full ECS command console.
 * This store only manages the vehicle display surface state.
 */

import { Platform } from 'react-native';
import type {
  VehicleDisplayMode,
  VehicleDisplayScreen,
  VehicleDisplayState,
  VehicleIndicators,
  VehicleMapData,
  VehicleStatusData,
  VehicleWeatherData,
  VehicleAction,
  VehicleActionType,
  VehicleSystemHealth,
  VehicleSubsystemStatus,
  ModeOverrideSetting,
  ModeTransitionNotice,
  HIGHWAY_ACTIONS,
  EXPEDITION_ACTIONS,
} from './vehicleDisplayTypes';



// ── Storage helpers ──────────────────────────────────────────
const STORAGE_KEY = 'ecs_vehicle_display_state';
const mem: Record<string, string> = {};

function sGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return mem[key] || null;
  } catch { return mem[key] || null; }
}

function sSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    mem[key] = value;
  } catch { mem[key] = value; }
}

// ── Default State ────────────────────────────────────────────

function createDefaultIndicators(): VehicleIndicators {
  return {
    gpsSignal: 'none',
    connectivity: 'unknown',
    offlineMaps: false,
    batteryPercent: null,
    batteryCharging: false,
  };
}

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

function createDefaultSystemHealth(): VehicleSystemHealth {
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

function createDefaultMapData(mode: VehicleDisplayMode): VehicleMapData {
  return {
    mode,
    currentLat: null,
    currentLon: null,
    headingDeg: null,
    speedMph: null,
    routeLine: false,
    nextManeuver: null,
    distanceRemainingMiles: null,
    etaMinutes: null,
    nearbyFuelServices: [],
    breadcrumbTrail: mode === 'expedition_drive',
    importedGpxRoute: false,
    offRouteAlert: false,
    offRouteDistanceFt: null,
    elevationShading: mode === 'expedition_drive',
    offlineMapIndicator: false,
    offlineMapRegion: null,
  };
}

function createDefaultStatusData(mode: VehicleDisplayMode): VehicleStatusData {
  return {
    mode,
    tripDistanceMiles: null,
    tripDurationHours: null,
    daylightRemainingHours: null,
    connectivityForecast: 'unknown',
    remotenessIndex: null,
    remotenessTier: null,
    distanceFromStartMiles: null,
    elevationGainFt: null,
    vehicleSystemsSummary: [],
    weatherRisk: 'unknown',
  };
}

function createDefaultWeatherData(mode: VehicleDisplayMode): VehicleWeatherData {
  return {
    mode,
    radarOverlay: false,
    stormMovement: null,
    windSpeedMph: null,
    windDirection: null,
    temperatureF: null,
    temperatureTrend: 'unknown',
    weatherAlerts: [],
    weatherMain: null,
    weatherDescription: null,
    humidity: null,
    feelsLikeF: null,
    lightningRisk: 'unknown',
    windExposure: 'unknown',
    temperatureDropForecastF: null,
  };
}

function createDefaultState(): VehicleDisplayState {
  const mode: VehicleDisplayMode = 'highway_drive';
  return {
    mode,
    activeScreen: 'map',
    isConnected: false,
    isManualOverride: false,
    modeOverride: 'auto',
    indicators: createDefaultIndicators(),
    systemHealth: createDefaultSystemHealth(),
    mapData: createDefaultMapData(mode),
    statusData: createDefaultStatusData(mode),
    weatherData: createDefaultWeatherData(mode),
    actions: [],
    lastUpdatedAt: new Date().toISOString(),
    transitionNotice: null,
  };
}



// ── Persistence ──────────────────────────────────────────────

interface PersistedVehicleDisplayState {
  mode: VehicleDisplayMode;
  activeScreen: VehicleDisplayScreen;
  isManualOverride: boolean;
}

function loadPersistedState(): Partial<PersistedVehicleDisplayState> {
  try {
    const raw = sGet(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persistState(state: VehicleDisplayState): void {
  const persisted: PersistedVehicleDisplayState = {
    mode: state.mode,
    activeScreen: state.activeScreen,
    isManualOverride: state.isManualOverride,
  };
  sSet(STORAGE_KEY, JSON.stringify(persisted));
}

// ── Internal State ───────────────────────────────────────────

let _state: VehicleDisplayState = createDefaultState();
let _refreshTimer: ReturnType<typeof setInterval> | null = null;
let _isRunning = false;

// Apply persisted state on load
const _persisted = loadPersistedState();
if (_persisted.mode) _state.mode = _persisted.mode;
if (_persisted.activeScreen) _state.activeScreen = _persisted.activeScreen;
if (_persisted.isManualOverride != null) _state.isManualOverride = _persisted.isManualOverride;

// ── Listeners ────────────────────────────────────────────────

type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify(): void {
  _state.lastUpdatedAt = new Date().toISOString();
  persistState(_state);
  for (const fn of _listeners) {
    try { fn(); } catch {}
  }
}

// ── Data Refresh ─────────────────────────────────────────────

function _refreshIndicators(): void {
  // Read from available stores (lazy imports to avoid circular deps)
  try {
    const { gpsUIState } = require('./gpsUIState');
    const gps = gpsUIState.get();

    if (!gps.hasFix) {
      _state.indicators.gpsSignal = 'none';
    } else if (gps.fixQuality === 'HIGH') {
      _state.indicators.gpsSignal = 'strong';
    } else if (gps.fixQuality === 'MEDIUM') {
      _state.indicators.gpsSignal = 'moderate';
    } else {
      _state.indicators.gpsSignal = 'weak';
    }

    // Update map data with GPS
    if (gps.hasFix && gps.position) {
      _state.mapData.currentLat = gps.position.latitude;
      _state.mapData.currentLon = gps.position.longitude;
      _state.mapData.headingDeg = gps.position.headingDeg ?? null;
      _state.mapData.speedMph = gps.position.speedMph ?? null;
    }
  } catch {}

  try {
    const { connectivity } = require('./connectivity');
    const level = connectivity.getLevel();
    switch (level) {
      case 'normal': _state.indicators.connectivity = 'online'; break;
      case 'limited': _state.indicators.connectivity = 'limited'; break;
      case 'no_service': _state.indicators.connectivity = 'offline'; break;
      default: _state.indicators.connectivity = 'unknown'; break;
    }

    // Update status connectivity forecast
    _state.statusData.connectivityForecast =
      level === 'normal' ? 'strong' :
      level === 'limited' ? 'moderate' :
      level === 'no_service' ? 'none' : 'unknown';
  } catch {}

  try {
    const { remotenessStore } = require('./remotenessStore');
    const remoteness = remotenessStore.get();
    _state.statusData.remotenessIndex = remoteness.score;
    _state.statusData.remotenessTier = remoteness.tier;
  } catch {}
}

function _refreshScreenData(): void {
  const mode = _state.mode;

  // Rebuild map data mode-specific flags
  _state.mapData.mode = mode;
  _state.mapData.breadcrumbTrail = mode === 'expedition_drive';
  _state.mapData.elevationShading = mode === 'expedition_drive';

  // Rebuild status data
  _state.statusData.mode = mode;

  // Rebuild weather data
  _state.weatherData.mode = mode;

  // Rebuild actions
  try {
    const types = require('./vehicleDisplayTypes');
    _state.actions = mode === 'highway_drive'
      ? [...types.HIGHWAY_ACTIONS]
      : [...types.EXPEDITION_ACTIONS];
  } catch {
    _state.actions = [];
  }
}

function _refresh(): void {
  _refreshIndicators();
  _refreshScreenData();
  _notify();
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

export const vehicleDisplayStore = {
  /**
   * Get current vehicle display state.
   */
  get(): VehicleDisplayState {
    return _state;
  },

  /**
   * Get current operating mode.
   */
  getMode(): VehicleDisplayMode {
    return _state.mode;
  },

  /**
   * Get active screen.
   */
  getActiveScreen(): VehicleDisplayScreen {
    return _state.activeScreen;
  },

  /**
   * Get shared indicators.
   */
  getIndicators(): VehicleIndicators {
    return _state.indicators;
  },

  /**
   * Get map screen data.
   */
  getMapData(): VehicleMapData {
    return _state.mapData;
  },

  /**
   * Get status screen data.
   */
  getStatusData(): VehicleStatusData {
    return _state.statusData;
  },

  /**
   * Get weather screen data.
   */
  getWeatherData(): VehicleWeatherData {
    return _state.weatherData;
  },

  /**
   * Get actions for current mode.
   */
  getActions(): VehicleAction[] {
    return _state.actions;
  },

  /**
   * Whether vehicle display is connected.
   */
  isConnected(): boolean {
    return _state.isConnected;
  },

  // ── Mutations ──────────────────────────────────────────

  /**
   * Set the operating mode.
   */
  setMode(mode: VehicleDisplayMode): void {
    if (_state.mode === mode) return;
    _state.mode = mode;
    _state.mapData = createDefaultMapData(mode);
    _state.statusData = createDefaultStatusData(mode);
    _state.weatherData = createDefaultWeatherData(mode);
    _refreshScreenData();
    _notify();
  },

  /**
   * Set the active screen.
   */
  setActiveScreen(screen: VehicleDisplayScreen): void {
    if (_state.activeScreen === screen) return;
    _state.activeScreen = screen;
    _notify();
  },

  /**
   * Set connected state (vehicle display attached/detached).
   */
  setConnected(connected: boolean): void {
    _state.isConnected = connected;
    _notify();
  },

  /**
   * Toggle manual mode override.
   */
  setManualOverride(override: boolean): void {
    _state.isManualOverride = override;
    _notify();
  },

  /**
   * Set the mode override setting.
   */
  setModeOverride(setting: ModeOverrideSetting): void {
    _state.modeOverride = setting;
    _notify();
  },

  /**
   * Get the current mode override setting.
   */
  getModeOverride(): ModeOverrideSetting {
    return _state.modeOverride;
  },

  /**
   * Set the active transition notice.
   */
  setTransitionNotice(notice: ModeTransitionNotice | null): void {
    _state.transitionNotice = notice;
    _notify();
  },

  /**
   * Get the active transition notice.
   */
  getTransitionNotice(): ModeTransitionNotice | null {
    return _state.transitionNotice;
  },


  /**
   * Update map data fields.
   */

  updateMapData(partial: Partial<VehicleMapData>): void {
    _state.mapData = { ..._state.mapData, ...partial };
    _notify();
  },

  /**
   * Update status data fields.
   */
  updateStatusData(partial: Partial<VehicleStatusData>): void {
    _state.statusData = { ..._state.statusData, ...partial };
    _notify();
  },

  /**
   * Update weather data fields.
   */
  updateWeatherData(partial: Partial<VehicleWeatherData>): void {
    _state.weatherData = { ..._state.weatherData, ...partial };
    _notify();
  },

  /**
   * Update shared indicators.
   */
  updateIndicators(partial: Partial<VehicleIndicators>): void {
    _state.indicators = { ..._state.indicators, ...partial };
    _notify();
  },

  /**
   * Get current system health.
   */
  getSystemHealth(): VehicleSystemHealth {
    return _state.systemHealth;
  },

  /**
   * Update system health from the fallback engine.
   */
  updateSystemHealth(health: VehicleSystemHealth): void {
    _state.systemHealth = health;
    // Don't call _notify() here to avoid circular updates;
    // the fallback engine notifies its own listeners
  },

  /**
   * Execute a vehicle display action.
   * Returns the action type for the caller to handle.
   */
  executeAction(actionType: VehicleActionType): VehicleActionType {
    // Log the action execution
    console.log(`[VehicleDisplay] Action executed: ${actionType}`);
    return actionType;
  },

  // ── Lifecycle ──────────────────────────────────────────

  /**
   * Start the refresh timer.
   * Call when vehicle display connects or the display page mounts.
   */
  start(): void {
    if (_isRunning) return;
    _isRunning = true;

    // Immediate first refresh
    _refresh();

    // Periodic refresh (5s)
    _refreshTimer = setInterval(_refresh, 5000);
  },

  /**
   * Stop the refresh timer.
   * Call when vehicle display disconnects or the display page unmounts.
   */
  stop(): void {
    _isRunning = false;
    if (_refreshTimer) {
      clearInterval(_refreshTimer);
      _refreshTimer = null;
    }
  },

  /**
   * Whether the store is actively refreshing.
   */
  isRunning(): boolean {
    return _isRunning;
  },

  /**
   * Reset to default state.
   */
  reset(): void {
    vehicleDisplayStore.stop();
    _state = createDefaultState();
    _notify();
  },

  /**
   * Subscribe to state changes.
   * Returns unsubscribe function.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};

