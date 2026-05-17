/**
 * CarPlay Bridge — JS-side integration layer
 *
 * Connects the React Native VehicleDisplayMode system to the native
 * CarPlay components via the ECSCarPlayModule NativeModule.
 *
 * Phase 8 Integration:
 *   - Notifies VehicleCompanionManager on connect/disconnect
 *   - Routes polled actions through the companion manager
 *   - Records data push and action timestamps to vehicleSessionState
 *   - Reads from vehicleSessionState for waypoint sync
 *   - Restores state automatically on reconnection
 *
 * Data Flow:
 *   vehicleDisplayStore → carPlayBridge → NativeModule → UserDefaults
 *   → ECSCarPlay*Screen (native) reads and renders
 *
 *   ECSCarPlay*Screen (native) writes action → UserDefaults
 *   → carPlayBridge polls → vehicleCompanionManager.handleAction()
 *
 * Architecture:
 *   - Timer-driven data push (2s interval)
 *   - Timer-driven action polling (1s interval)
 *   - Subscribes to vehicleDisplayStore for reactive updates
 *   - Falls back gracefully when NativeModule is unavailable (web/Android)
 *   - Does NOT modify the mobile ECS dashboard
 *
 * Mirrors the Android Auto bridge for consistent cross-platform behavior.
 */
import { Platform, NativeModules } from 'react-native';
import { vehicleDisplayStore } from './vehicleDisplayStore';
import { vehicleDisplayModeEngine } from './vehicleDisplayModeEngine';
import { breadcrumbTracker } from './breadcrumbTracker';
import { vehicleSessionState } from './vehicleSessionState';
import { vehicleCompanionManager } from './vehicleCompanionManager';
import type {
  VehicleDisplayMode,
  VehicleMapData,
  VehicleStatusData,
  VehicleWeatherData,
  VehicleIndicators,
  VehicleActionType,
  ModeOverrideSetting,
} from './vehicleDisplayTypes';


// ── NativeModule Reference ──────────────────────────────────

/**
 * Type definition for the ECSCarPlay NativeModule.
 * This mirrors the methods exposed by ECSCarPlayModule.swift.
 */
interface ECSCarPlayNative {
  isConnected(): Promise<boolean>;
  getLastEventTimestamp(): Promise<number>;
  setDisplayMode(mode: string): Promise<boolean>;
  getDisplayMode(): Promise<string>;
  pushMapData(mapDataJson: string): Promise<boolean>;
  pushStatusData(statusDataJson: string): Promise<boolean>;
  pushWeatherData(weatherDataJson: string): Promise<boolean>;
  pushActionsData(actionsDataJson: string): Promise<boolean>;
  pushIndicators(indicatorsJson: string): Promise<boolean>;
  pushModeState(modeStateJson: string): Promise<boolean>;
  pushBreadcrumbData(breadcrumbDataJson: string): Promise<boolean>;
  pushSystemHealth(healthJson: string): Promise<boolean>;
  pushVehicleLocation(
    lat: number,
    lon: number,
    heading: number,
    speedMph: number
  ): Promise<boolean>;
  pushRouteState(
    hasActiveRoute: boolean,
    hasExpeditionTrack: boolean
  ): Promise<boolean>;
  pollPendingAction(): Promise<string | null>;
  pushFullState(
    mode: string,
    mapDataJson: string,
    indicatorsJson: string
  ): Promise<boolean>;
  pushAllScreenData(
    mapDataJson: string,
    statusDataJson: string,
    weatherDataJson: string,
    actionsDataJson: string
  ): Promise<boolean>;
  clearAll(): Promise<boolean>;
}

/**
 * Get the native module reference.
 * Returns null on platforms where CarPlay is not available (web, Android).
 */
function getNativeModule(): ECSCarPlayNative | null {
  if (Platform.OS !== 'ios') return null;
  try {
    const mod = NativeModules.ECSCarPlay as ECSCarPlayNative | undefined;
    return mod || null;
  } catch {
    return null;
  }
}

// ── Internal State ──────────────────────────────────────────

let _isRunning = false;
let _dataPushTimer: ReturnType<typeof setInterval> | null = null;
let _actionPollTimer: ReturnType<typeof setInterval> | null = null;
let _storeUnsubscribe: (() => void) | null = null;
let _modeEngineUnsubscribe: (() => void) | null = null;
let _isConnected = false;
let _lastPushTimestamp = 0;

// Push intervals
const DATA_PUSH_INTERVAL_MS = 2_000;   // Push data every 2 seconds
const ACTION_POLL_INTERVAL_MS = 1_000;  // Poll actions every 1 second

// Listeners
type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify(): void {
  for (const fn of _listeners) {
    try { fn(); } catch {}
  }
}

// ── Data Push ───────────────────────────────────────────────

/**
 * Push the current vehicle display state to the native CarPlay layer.
 * Pushes all four screen data blobs plus mode, indicators, and system health.
 */
async function _pushData(): Promise<void> {
  const native = getNativeModule();
  if (!native) return;

  try {
    const state = vehicleDisplayStore.get();

    // Push mode + map data + indicators (full state)
    const mapDataJson = JSON.stringify(state.mapData);
    const indicatorsJson = JSON.stringify(state.indicators);
    await native.pushFullState(state.mode, mapDataJson, indicatorsJson);

    // Push status data
    const statusDataJson = JSON.stringify(state.statusData);
    await native.pushStatusData(statusDataJson);

    // Push weather data
    const weatherDataJson = JSON.stringify(state.weatherData);
    await native.pushWeatherData(weatherDataJson);

    // Push actions data (action availability context from session state)
    const actionsData = _buildActionsData(state.mode);
    await native.pushActionsData(JSON.stringify(actionsData));

    // Push mode state (override, transition notices)
    const modeEngineOutput = vehicleDisplayModeEngine.get();
    const modeState = {
      mode: state.mode,
      modeOverride: modeEngineOutput.modeOverride,
      isManualOverride: !modeEngineOutput.autoModeEnabled,
      inConfirmation: modeEngineOutput.inConfirmation,
      transitionNotice: modeEngineOutput.transitionNotice ? {
        message: modeEngineOutput.transitionNotice.message,
        newMode: modeEngineOutput.transitionNotice.newMode,
        timestamp: modeEngineOutput.transitionNotice.timestamp,
      } : null,
    };
    await native.pushModeState(JSON.stringify(modeState));

    // Push system health
    const healthPayload = vehicleDisplayStore.buildNativeHealthPayload();
    await native.pushSystemHealth(JSON.stringify(healthPayload));

    // Push breadcrumb data if available
    try {
      const bcState = breadcrumbTracker.get();
      if (bcState) {
        const bcData = {
          pointCount: bcState.pointCount,
          isRecording: bcState.isRecording,
          canReturnToStart: bcState.canReturnToStart,
          isReturningToStart: bcState.isReturningToStart || false,
          distanceFromStartMi: bcState.distanceFromStartMi,
          totalTrailDistanceMi: bcState.totalTrailDistanceMi,
          elevationGainFt: bcState.elevationGainFt,
          elevationLossFt: bcState.elevationLossFt,
          bearingToStartDeg: bcState.bearingToStartDeg,
        };
        await native.pushBreadcrumbData(JSON.stringify(bcData));
      }
    } catch {}

    // Push route state from session
    try {
      const sessionState = vehicleSessionState.get();
      await native.pushRouteState(
        sessionState.activeRoute,
        sessionState.activeVehicleDisplayMode === 'expedition_drive',
      );
    } catch {}

    _lastPushTimestamp = Date.now();

    // Record data push in session state
    vehicleSessionState.recordDataPush();
  } catch (err) {
    console.warn('[CarPlayBridge] Data push failed:', err);
  }
}

/**
 * Build the actions data payload for the native Actions screen.
 * Uses vehicleSessionState for context-aware action availability.
 */
function _buildActionsData(mode: VehicleDisplayMode): Record<string, unknown> {
  const sessionState = vehicleSessionState.get();
  const data: Record<string, unknown> = {
    mode,
    timestamp: Date.now(),
  };

  // Add breadcrumb context for Return to Start availability
  const bcTrail = sessionState.activeBreadcrumbTrail;
  data.canReturnToStart = bcTrail.canReturnToStart;
  data.breadcrumbPointCount = bcTrail.pointCount;
  data.distanceFromStartMi = bcTrail.distanceFromStartMi;

  // Add expedition and route context
  data.hasExpedition = sessionState.activeExpedition;
  data.hasRoute = sessionState.activeRoute;
  data.hasConnectivity = sessionState.connectivityStatus !== 'offline';

  // Add action availability flags
  if (mode === 'highway_drive') {
    data.actions = {
      add_waypoint: true,
      quick_note: true,
      find_fuel: true,
      report_hazard: true,
      navigate_home: sessionState.activeRoute,
    };
  } else {
    data.actions = {
      drop_waypoint: true,
      incident_marker: sessionState.activeExpedition,
      quick_note: true,
      return_to_start: bcTrail.canReturnToStart && !bcTrail.isPausedByGps,
      emergency_comms: sessionState.connectivityStatus !== 'offline',
    };
  }

  return data;
}

/**
 * Push display mode change to native layer.
 */
async function _pushMode(mode: VehicleDisplayMode): Promise<void> {
  const native = getNativeModule();
  if (!native) return;

  try {
    await native.setDisplayMode(mode);
    console.log(`[CarPlayBridge] Mode pushed: ${mode}`);
  } catch (err) {
    console.warn('[CarPlayBridge] Mode push failed:', err);
  }
}

// ── Action Polling ──────────────────────────────────────────

/**
 * Poll for pending actions from CarPlay.
 * When an action is found, dispatch it through the VehicleCompanionManager.
 */
async function _pollActions(): Promise<void> {
  const native = getNativeModule();
  if (!native) return;

  try {
    const actionJson = await native.pollPendingAction();
    if (!actionJson) return;

    const action = JSON.parse(actionJson) as {
      actionType: string;
      timestamp: number;
      mode: string;
      source: string;
      label?: string;
    };

    console.log(
      `[CarPlayBridge] Action received from ${action.source}: ${action.actionType}`
    );

    // Route through the companion manager for synchronized handling
    vehicleCompanionManager.handleAction(
      action.actionType as VehicleActionType,
      'carplay',
    );

    // Record in session state
    vehicleSessionState.recordActionReceived();

    // Notify listeners about the action
    _notify();
  } catch (err) {
    console.warn('[CarPlayBridge] Action poll failed:', err);
  }
}

// ── Connection Monitoring ───────────────────────────────────

/**
 * Check CarPlay connection state.
 * Notifies the VehicleCompanionManager on connection state changes.
 */
async function _checkConnection(): Promise<boolean> {
  const native = getNativeModule();
  if (!native) return false;

  try {
    const connected = await native.isConnected();
    if (connected !== _isConnected) {
      _isConnected = connected;
      vehicleDisplayStore.setConnected(connected);

      // Notify companion manager of connection state change
      if (connected) {
        vehicleCompanionManager.onCompanionConnected('carplay');
        console.log('[CarPlayBridge] CarPlay connected — companion manager notified');
      } else {
        vehicleCompanionManager.onCompanionDisconnected();
        console.log('[CarPlayBridge] CarPlay disconnected — companion manager notified');
      }

      _notify();
    }
    return connected;
  } catch {
    return false;
  }
}

// ── Store Subscription ──────────────────────────────────────

/**
 * Handle vehicleDisplayStore state changes.
 */
function _onStoreChange(): void {
  if (!_isRunning) return;

  // Debounce: don't push more than once per second
  const now = Date.now();
  if (now - _lastPushTimestamp < 1000) return;

  _pushData().catch(() => {});
}

/**
 * Handle mode engine changes.
 */
function _onModeChange(): void {
  if (!_isRunning) return;

  const mode = vehicleDisplayModeEngine.getCurrentMode();
  _pushMode(mode).catch(() => {});
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

export const carPlayBridge = {
  /**
   * Whether the bridge is currently running.
   */
  isRunning(): boolean {
    return _isRunning;
  },

  /**
   * Whether CarPlay is currently connected.
   */
  isConnected(): boolean {
    return _isConnected;
  },

  /**
   * Whether the native module is available on this platform.
   */
  isAvailable(): boolean {
    return getNativeModule() !== null;
  },

  /**
   * Start the CarPlay bridge.
   *
   * This begins:
   *   - Periodic data push to native layer (all 4 screens)
   *   - Periodic action polling from native layer
   *   - Store subscription for reactive updates
   *   - Connection state monitoring
   *   - Companion manager integration
   *
   * Safe to call on any platform — no-ops on web/Android.
   */
  start(): void {
    if (_isRunning) return;
    if (Platform.OS !== 'ios') {
      console.log('[CarPlayBridge] Not on iOS — bridge inactive');
      return;
    }

    const native = getNativeModule();
    if (!native) {
      console.log('[CarPlayBridge] NativeModule not available — bridge inactive');
      return;
    }

    _isRunning = true;
    console.log('[CarPlayBridge] Starting CarPlay bridge');

    // Initial connection check
    _checkConnection().catch(() => {});

    // Initial data push
    _pushData().catch(() => {});

    // Subscribe to store changes
    _storeUnsubscribe = vehicleDisplayStore.subscribe(_onStoreChange);
    _modeEngineUnsubscribe = vehicleDisplayModeEngine.subscribe(_onModeChange);

    // Start periodic data push
    _dataPushTimer = setInterval(() => {
      _pushData().catch(() => {});
      _checkConnection().catch(() => {});
    }, DATA_PUSH_INTERVAL_MS);

    // Start periodic action polling
    _actionPollTimer = setInterval(() => {
      _pollActions().catch(() => {});
    }, ACTION_POLL_INTERVAL_MS);
  },

  /**
   * Stop the CarPlay bridge.
   */
  stop(): void {
    if (!_isRunning) return;
    _isRunning = false;

    console.log('[CarPlayBridge] Stopping CarPlay bridge');

    if (_dataPushTimer) {
      clearInterval(_dataPushTimer);
      _dataPushTimer = null;
    }

    if (_actionPollTimer) {
      clearInterval(_actionPollTimer);
      _actionPollTimer = null;
    }

    if (_storeUnsubscribe) {
      _storeUnsubscribe();
      _storeUnsubscribe = null;
    }

    if (_modeEngineUnsubscribe) {
      _modeEngineUnsubscribe();
      _modeEngineUnsubscribe = null;
    }

  },

  /**
   * Force an immediate data push to CarPlay.
   */
  async forcePush(): Promise<void> {
    await _pushData();
  },

  /**
   * Push vehicle location to CarPlay.
   */
  async pushLocation(
    lat: number,
    lon: number,
    heading: number,
    speedMph: number
  ): Promise<void> {
    const native = getNativeModule();
    if (!native) return;

    try {
      await native.pushVehicleLocation(lat, lon, heading, speedMph);
    } catch (err) {
      console.warn('[CarPlayBridge] Location push failed:', err);
    }
  },

  /**
   * Push route state to CarPlay.
   */
  async pushRouteState(
    hasActiveRoute: boolean,
    hasExpeditionTrack: boolean
  ): Promise<void> {
    const native = getNativeModule();
    if (!native) return;

    try {
      await native.pushRouteState(hasActiveRoute, hasExpeditionTrack);
    } catch (err) {
      console.warn('[CarPlayBridge] Route state push failed:', err);
    }
  },

  /**
   * Push weather data to CarPlay.
   */
  async pushWeather(weatherData: VehicleWeatherData): Promise<void> {
    const native = getNativeModule();
    if (!native) return;

    try {
      await native.pushWeatherData(JSON.stringify(weatherData));
    } catch (err) {
      console.warn('[CarPlayBridge] Weather data push failed:', err);
    }
  },

  /**
   * Push actions data to CarPlay.
   */
  async pushActions(mode: VehicleDisplayMode): Promise<void> {
    const native = getNativeModule();
    if (!native) return;

    try {
      const actionsData = _buildActionsData(mode);
      await native.pushActionsData(JSON.stringify(actionsData));
    } catch (err) {
      console.warn('[CarPlayBridge] Actions data push failed:', err);
    }
  },

  /**
   * Clear all CarPlay data.
   */
  async clearAll(): Promise<void> {
    const native = getNativeModule();
    if (!native) return;

    try {
      await native.clearAll();
      _isConnected = false;
      _notify();
    } catch (err) {
      console.warn('[CarPlayBridge] Clear failed:', err);
    }
  },

  /**
   * Subscribe to bridge state changes.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => {
      _listeners.delete(fn);
    };
  },

  /**
   * Get bridge status info for debugging.
   */
  getStatus(): {
    isRunning: boolean;
    isConnected: boolean;
    isAvailable: boolean;
    lastPushTimestamp: number;
    platform: string;
  } {
    return {
      isRunning: _isRunning,
      isConnected: _isConnected,
      isAvailable: getNativeModule() !== null,
      lastPushTimestamp: _lastPushTimestamp,
      platform: Platform.OS,
    };
  },
};

