/**
 * Android Auto Bridge — JS-side integration layer
 *
 * Connects the React Native VehicleDisplayMode system to the native
 * Android Auto components via the ECSAndroidAutoModule NativeModule.
 *
 * Phase 8 Integration:
 *   - Notifies VehicleCompanionManager on connect/disconnect
 *   - Routes polled actions through the companion manager
 *   - Records data push and action timestamps to vehicleSessionState
 *   - Reads from vehicleSessionState for waypoint sync
 *   - Restores state automatically on reconnection
 *
 * Data Flow:
 *   vehicleDisplayStore → androidAutoBridge → NativeModule → SharedPreferences
 *   → ECSVehicle*Screen (native) reads and renders
 *
 *   ECSVehicle*Screen (native) writes action → SharedPreferences
 *   → androidAutoBridge polls → vehicleCompanionManager.handleAction()
 *
 * Architecture:
 *   - Bounded, semantic-deduplicated data publication
 *   - Timer-driven action polling (1s interval)
 *   - Subscribes to vehicleDisplayStore for reactive updates
 *   - Falls back gracefully when NativeModule is unavailable (web/iOS)
 *   - Does NOT modify the mobile ECS dashboard
 */
import {
  AppState,
  Platform,
  NativeModules,
  type AppStateStatus,
} from 'react-native';
import { vehicleDisplayStore } from './vehicleDisplayStore';
import { vehicleDisplayModeEngine } from './vehicleDisplayModeEngine';
import { breadcrumbTracker } from './breadcrumbTracker';
import { vehicleSessionState } from './vehicleSessionState';
import { vehicleCompanionManager } from './vehicleCompanionManager';
import { ecsLog } from './ecsLogger';
import { resolveAutomotiveFeatureAccess } from './automotive/automotiveFeatureAccess';
import {
  automotiveSafeMetadata,
  buildAutomotiveNativePayload,
  buildAutomotiveSemanticSignature,
  reduceAutomotiveConnectionState,
  shouldPublishAutomotiveLocation,
  shouldPublishAutomotiveState,
  type ECSAutomotiveConnectionEvent,
  type ECSAutomotiveConnectionLifecycle,
  type ECSAutomotiveLocationSample,
} from './automotive/automotiveUpdatePolicy';
import type {
  VehicleDisplayMode,
  VehicleWeatherData,
  VehicleActionType,
} from './vehicleDisplayTypes';


// ── NativeModule Reference ──────────────────────────────────

/**
 * Type definition for the ECSAndroidAuto NativeModule.
 * This mirrors the methods exposed by ECSAndroidAutoModule.kt.
 */
interface ECSAndroidAutoNative {
  isConnected(): Promise<boolean>;
  getLastEventTimestamp(): Promise<number>;
  setDisplayMode(mode: string): Promise<boolean>;
  getDisplayMode(): Promise<string>;
  pushMapData(mapDataJson: string): Promise<boolean>;
  pushStatusData(statusDataJson: string): Promise<boolean>;
  pushWeatherData(weatherDataJson: string): Promise<boolean>;
  pushActionsData(actionsDataJson: string): Promise<boolean>;
  pushIndicators(indicatorsJson: string): Promise<boolean>;
  pushBreadcrumbData(breadcrumbDataJson: string): Promise<boolean>;
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
  pushSystemHealth(healthJson: string): Promise<boolean>;
  clearAll(): Promise<boolean>;
}

/**
 * Get the native module reference.
 * Returns null on platforms where Android Auto is not available (web, iOS).
 */
function getNativeModule(): ECSAndroidAutoNative | null {
  if (Platform.OS !== 'android') return null;
  try {
    const mod = NativeModules.ECSAndroidAuto as ECSAndroidAutoNative | undefined;
    return mod || null;
  } catch {
    return null;
  }
}

// ── Internal State ──────────────────────────────────────────

let _isRunning = false;
let _dataPushTimer: ReturnType<typeof setInterval> | null = null;
let _pendingDataPushTimer: ReturnType<typeof setTimeout> | null = null;
let _actionPollTimer: ReturnType<typeof setInterval> | null = null;
let _connectionProbeTimer: ReturnType<typeof setInterval> | null = null;
let _storeUnsubscribe: (() => void) | null = null;
let _modeEngineUnsubscribe: (() => void) | null = null;
let _appStateSubscription: { remove: () => void } | null = null;
let _appState: AppStateStatus = AppState.currentState;
let _isConnected = false;
let _connectionLifecycle: ECSAutomotiveConnectionLifecycle = 'unavailable';
let _lastPushTimestamp = 0;
let _lastInactiveLogKey: string | null = null;
let _lastPayloadSignature: string | null = null;
let _pushInFlight: Promise<void> | null = null;
let _dataPushPending = false;
let _lastLocationSample: ECSAutomotiveLocationSample | null = null;
let _publishCount = 0;
let _dedupedPublishCount = 0;
let _lastActionKey: string | null = null;

// Connected displays get responsive actions and a low-frequency state heartbeat.
// Disconnected devices only check the inexpensive native connection flag.
const DATA_PUSH_INTERVAL_MS = 15_000;
const BACKGROUND_DATA_PUSH_INTERVAL_MS = 30_000;
const DATA_HEARTBEAT_INTERVAL_MS = 60_000;
const MINIMUM_DATA_PUSH_INTERVAL_MS = 5_000;
const ACTION_POLL_INTERVAL_MS = 1_000;
const CONNECTED_PROBE_INTERVAL_MS = 10_000;
const DISCONNECTED_PROBE_INTERVAL_MS = 15_000;
const BACKGROUND_DISCONNECTED_PROBE_INTERVAL_MS = 60_000;

// Listeners
type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify(): void {
  for (const fn of _listeners) {
    try { fn(); } catch {}
  }
}

function _isDevRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : false;
}

function _logInactive(reason: 'not_android' | 'missing_native_module'): void {
  if (_lastInactiveLogKey === reason) return;
  _lastInactiveLogKey = reason;

  const details = {
    platform: Platform.OS,
    dev: _isDevRuntime(),
  };

  if (reason === 'missing_native_module' && Platform.OS === 'android' && !_isDevRuntime()) {
    ecsLog.warn('SYSTEM', '[AndroidAutoBridge] Native module unavailable; bridge inactive', details);
    return;
  }

  ecsLog.debug(
    'SYSTEM',
    reason === 'not_android'
      ? '[AndroidAutoBridge] Non-Android runtime; bridge inactive'
      : '[AndroidAutoBridge] Native module unavailable in optional/dev runtime; bridge inactive',
    details,
  );
}

function _setConnectionState(
  connected: boolean,
  lifecycle: ECSAutomotiveConnectionLifecycle,
): void {
  const connectionChanged = connected !== _isConnected;
  const lifecycleChanged = lifecycle !== _connectionLifecycle;
  if (!connectionChanged && !lifecycleChanged) return;
  _isConnected = connected;
  _connectionLifecycle = lifecycle;
  vehicleDisplayStore.setConnected(connected);

  if (connectionChanged) {
    if (connected) vehicleCompanionManager.onCompanionConnected('android_auto');
    else vehicleCompanionManager.onCompanionDisconnected();
  }
  _reconcileRuntimeTimers();
  _notify();
}

function _transitionConnection(event: ECSAutomotiveConnectionEvent): void {
  const next = reduceAutomotiveConnectionState({
    connected: _isConnected,
    lifecycle: _connectionLifecycle,
  }, event);
  _setConnectionState(next.connected, next.lifecycle);
}

function _isAppForeground(): boolean {
  return _appState !== 'background' && _appState !== 'inactive';
}

function _clearRuntimeTimers(): void {
  if (_dataPushTimer) {
    clearInterval(_dataPushTimer);
    _dataPushTimer = null;
  }
  if (_actionPollTimer) {
    clearInterval(_actionPollTimer);
    _actionPollTimer = null;
  }
  if (_connectionProbeTimer) {
    clearInterval(_connectionProbeTimer);
    _connectionProbeTimer = null;
  }
  if (_pendingDataPushTimer) {
    clearTimeout(_pendingDataPushTimer);
    _pendingDataPushTimer = null;
  }
}

function _schedulePendingDataPush(delayMs: number): void {
  if (!_isRunning || !_isConnected || _pendingDataPushTimer) return;
  _pendingDataPushTimer = setTimeout(() => {
    _pendingDataPushTimer = null;
    _pushData().catch(() => {});
  }, Math.max(0, delayMs));
}

function _reconcileRuntimeTimers(): void {
  _clearRuntimeTimers();
  if (!_isRunning) return;

  if (_isConnected) {
    _dataPushTimer = setInterval(() => {
      _pushData().catch(() => {});
    }, _isAppForeground() ? DATA_PUSH_INTERVAL_MS : BACKGROUND_DATA_PUSH_INTERVAL_MS);
    _actionPollTimer = setInterval(() => {
      _pollActions().catch(() => {});
    }, ACTION_POLL_INTERVAL_MS);
    _connectionProbeTimer = setInterval(() => {
      _checkConnection().catch(() => {});
    }, CONNECTED_PROBE_INTERVAL_MS);
    return;
  }

  const probeInterval = _isAppForeground()
    ? DISCONNECTED_PROBE_INTERVAL_MS
    : BACKGROUND_DISCONNECTED_PROBE_INTERVAL_MS;
  _connectionProbeTimer = setInterval(() => {
    _checkConnection().catch(() => {});
  }, probeInterval);
}

function _handleAppStateChange(nextState: AppStateStatus): void {
  if (_appState === nextState) return;
  _appState = nextState;

  // The head unit remains supported in background, with a reduced data cadence.
  if (_isRunning) {
    _reconcileRuntimeTimers();
  }
  _transitionConnection({ type: 'app_state', foreground: _isAppForeground() });
}

// ── Data Push ───────────────────────────────────────────────

/**
 * Push the current vehicle display state to the native Android Auto layer.
 * Pushes all four screen data blobs plus mode and indicators.
 */
async function _pushData(force = false): Promise<void> {
  if (!_isRunning || !_isConnected) return;
  const native = getNativeModule();
  if (!native) return;
  if (_pushInFlight) {
    _dataPushPending = true;
    return _pushInFlight;
  }

  const state = vehicleDisplayStore.get();
  const mapPayload = {
    ...buildAutomotiveNativePayload(
      state.mapData,
      state.automotiveProjection.navigation,
    ),
    automotivePositionState: automotiveSafeMetadata(
      state.automotiveProjection.navigation.position,
    ),
  };
  const statusPayload = {
    ...state.statusData,
    automotiveSafeState: automotiveSafeMetadata(state.automotiveProjection.resources),
  };
  const weatherPayload = {
    ...state.weatherData,
    automotiveSafeState: automotiveSafeMetadata(state.automotiveProjection.weatherHazard),
  };
  const actionsData = _buildActionsData(state.mode);
  const healthPayload = vehicleDisplayStore.buildNativeHealthPayload();
  const bcState = breadcrumbTracker.get();
  const breadcrumbPayload = bcState
    ? {
        pointCount: bcState.pointCount,
        isRecording: bcState.isRecording,
        canReturnToStart: bcState.canReturnToStart,
        isReturningToStart: bcState.isReturningToStart || false,
        distanceFromStartMi: bcState.distanceFromStartMi,
        totalTrailDistanceMi: bcState.totalTrailDistanceMi,
        elevationGainFt: bcState.elevationGainFt,
        elevationLossFt: bcState.elevationLossFt,
        bearingToStartDeg: bcState.bearingToStartDeg,
      }
    : null;
  const sessionState = vehicleSessionState.get();
  const semanticPayload = {
    mode: state.mode,
    mapPayload,
    indicators: state.indicators,
    statusPayload,
    weatherPayload,
    actionsData,
    healthPayload,
    breadcrumbPayload,
    activeRoute: sessionState.activeRoute,
    expeditionTrack: sessionState.activeVehicleDisplayMode === 'expedition_drive',
  };
  const signature = buildAutomotiveSemanticSignature(semanticPayload);
  const now = Date.now();
  if (!shouldPublishAutomotiveState({
    signature,
    state: { lastSignature: _lastPayloadSignature, lastPublishedAt: _lastPushTimestamp },
    nowMs: now,
    minimumIntervalMs: MINIMUM_DATA_PUSH_INTERVAL_MS,
    heartbeatIntervalMs: DATA_HEARTBEAT_INTERVAL_MS,
    force,
  })) {
    _dedupedPublishCount += 1;
    if (signature !== _lastPayloadSignature) {
      _schedulePendingDataPush(
        Math.max(0, MINIMUM_DATA_PUSH_INTERVAL_MS - (now - _lastPushTimestamp)),
      );
    }
    return;
  }

  const push = (async () => {
    try {
      await native.pushFullState(state.mode, JSON.stringify(mapPayload), JSON.stringify(state.indicators));
      await native.pushStatusData(JSON.stringify(statusPayload));
      await native.pushWeatherData(JSON.stringify(weatherPayload));
      await native.pushActionsData(JSON.stringify(actionsData));
      await native.pushSystemHealth(JSON.stringify(healthPayload));
      if (breadcrumbPayload) await native.pushBreadcrumbData(JSON.stringify(breadcrumbPayload));
      await native.pushRouteState(semanticPayload.activeRoute, semanticPayload.expeditionTrack);

      _lastPayloadSignature = signature;
      _lastPushTimestamp = Date.now();
      _publishCount += 1;
      vehicleSessionState.recordDataPush();
      _transitionConnection({ type: 'push_recovered', foreground: _isAppForeground() });
    } catch (err) {
      _transitionConnection({ type: 'push_failed' });
      ecsLog.warn('SYSTEM', '[AndroidAutoBridge] Data push failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      _pushInFlight = null;
      if (_dataPushPending) {
        _dataPushPending = false;
        _schedulePendingDataPush(MINIMUM_DATA_PUSH_INTERVAL_MS);
      }
    }
  })();
  _pushInFlight = push;
  return push;
}

/**
 * Build the actions data payload for the native Actions screen.
 * Includes action availability flags and contextual state from session.
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
      emergency_comms: false,
    };
    data.emergencySupportCopy = 'Use a phone or radio. ECS does not contact emergency services.';
  }

  return data;
}

/**
 * Push display mode change to native layer.
 */
async function _pushMode(mode: VehicleDisplayMode): Promise<void> {
  if (!_isRunning || !_isConnected) return;
  const native = getNativeModule();
  if (!native) return;

  try {
    await native.setDisplayMode(mode);
    ecsLog.debug('SYSTEM', '[AndroidAutoBridge] Mode pushed', { mode });
  } catch (err) {
    ecsLog.warn('SYSTEM', '[AndroidAutoBridge] Mode push failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Action Polling ──────────────────────────────────────────

/**
 * Poll for pending actions from Android Auto.
 * When an action is found, dispatch it through the VehicleCompanionManager.
 */
async function _pollActions(): Promise<void> {
  if (!_isRunning || !_isConnected) return;
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
    const actionTimestamp = Number(action.timestamp);
    if (!Number.isFinite(actionTimestamp) || Math.abs(Date.now() - actionTimestamp) > 30_000) return;
    const actionKey = `${action.actionType}:${actionTimestamp}`;
    if (actionKey === _lastActionKey) return;
    _lastActionKey = actionKey;

    ecsLog.debug('SYSTEM', '[AndroidAutoBridge] Action received', {
      source: action.source,
      actionType: action.actionType,
    });

    // Route through the companion manager for synchronized handling
    vehicleCompanionManager.handleAction(
      action.actionType as VehicleActionType,
      'android_auto',
    );

    // Record in session state
    vehicleSessionState.recordActionReceived();

    // Notify listeners about the action
    _notify();
  } catch (err) {
    ecsLog.warn('SYSTEM', '[AndroidAutoBridge] Action poll failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Connection Monitoring ───────────────────────────────────

/**
 * Check Android Auto connection state.
 * Notifies the VehicleCompanionManager on connection state changes.
 */
async function _checkConnection(): Promise<boolean> {
  if (!_isRunning) return false;
  const native = getNativeModule();
  if (!native) {
    _transitionConnection({ type: 'native_unavailable' });
    return false;
  }

  try {
    const connected = await native.isConnected();
    if (!_isRunning) return false;
    const connectionChanged = connected !== _isConnected;
    _transitionConnection(connected
      ? { type: 'probe_connected', foreground: _isAppForeground() }
      : { type: 'probe_disconnected' });

    if (connected && connectionChanged) {
      _pushData(true).catch(() => {});
      _pushMode(vehicleDisplayModeEngine.getCurrentMode()).catch(() => {});
    }
    return connected;
  } catch (err) {
    _transitionConnection({ type: 'probe_failed' });
    ecsLog.debug('SYSTEM', '[AndroidAutoBridge] Connection probe failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ── Store Subscription ──────────────────────────────────────

async function _pushVehicleLocation(
  lat: number,
  lon: number,
  heading: number,
  speedMph: number,
): Promise<void> {
  if (!_isRunning || !_isConnected) return;
  const native = getNativeModule();
  if (!native) return;
  const now = Date.now();
  const next = { lat, lon, heading, speedMph };
  if (!shouldPublishAutomotiveLocation({ previous: _lastLocationSample, next, nowMs: now })) {
    return;
  }

  try {
    await native.pushVehicleLocation(lat, lon, heading, speedMph);
    _lastLocationSample = { ...next, publishedAt: now };
  } catch (err) {
    ecsLog.warn('SYSTEM', '[AndroidAutoBridge] Location push failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Handle vehicleDisplayStore state changes.
 * Pushes updated data to the native Android Auto layer.
 */
function _onStoreChange(): void {
  if (!_isRunning || !_isConnected) return;
  const positionState = vehicleDisplayStore.get().automotiveProjection.navigation.position;
  if (
    positionState.value &&
    positionState.availability !== 'unavailable' &&
    (positionState.freshness === 'live' || positionState.freshness === 'recent')
  ) {
    void _pushVehicleLocation(
      positionState.value.lat,
      positionState.value.lon,
      positionState.value.headingDeg ?? _lastLocationSample?.heading ?? 0,
      positionState.value.speedMph ?? 0,
    );
  }
  _pushData().catch(() => {});
}

/**
 * Handle mode engine changes.
 * Pushes mode updates to the native Android Auto layer.
 */
function _onModeChange(): void {
  if (!_isRunning || !_isConnected) return;

  const mode = vehicleDisplayModeEngine.getCurrentMode();
  _pushMode(mode).catch(() => {});
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

export const androidAutoBridge = {
  /**
   * Whether the bridge is currently running.
   */
  isRunning(): boolean {
    return _isRunning;
  },

  /**
   * Whether Android Auto is currently connected.
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
   * Start the Android Auto bridge.
   *
   * This begins:
   *   - Periodic data push to native layer (all 4 screens)
   *   - Periodic action polling from native layer
   *   - Store subscription for reactive updates
   *   - Connection state monitoring
   *   - Companion manager integration
   *
   * Safe to call on any platform — no-ops on web/iOS.
   */
  start(): void {
    if (_isRunning) return;
    if (Platform.OS !== 'android') {
      _logInactive('not_android');
      return;
    }

    const native = getNativeModule();
    const featureDecision = resolveAutomotiveFeatureAccess('android_auto_bridge', {
      platform: Platform.OS,
      androidAutoNativeAvailable: Boolean(native),
      carPlayNativeAvailable: false,
    });
    if (!native || featureDecision.availability !== 'available') {
      _transitionConnection({ type: 'native_unavailable' });
      if (!native) _logInactive('missing_native_module');
      else ecsLog.debug('SYSTEM', '[AndroidAutoBridge] Rollout gate kept bridge inactive', {
        reason: featureDecision.reason,
      });
      return;
    }

    _isRunning = true;
    _appState = AppState.currentState;
    _lastPayloadSignature = null;
    _dataPushPending = false;
    _lastLocationSample = null;
    _lastActionKey = null;

    // Subscribe to store changes
    _storeUnsubscribe = vehicleDisplayStore.subscribe(_onStoreChange);
    _modeEngineUnsubscribe = vehicleDisplayModeEngine.subscribe(_onModeChange);
    _appStateSubscription = AppState.addEventListener('change', _handleAppStateChange);
    _transitionConnection({ type: 'start' });

    // Stay inexpensive until a native vehicle-display session is confirmed.
    _checkConnection().catch(() => {});
  },

  /**
   * Stop the Android Auto bridge.
   *
   * Stops all timers and unsubscribes from stores.
   */
  stop(): void {
    if (!_isRunning) return;
    _isRunning = false;
    _clearRuntimeTimers();

    if (_appStateSubscription) {
      _appStateSubscription.remove();
      _appStateSubscription = null;
    }

    if (_storeUnsubscribe) {
      _storeUnsubscribe();
      _storeUnsubscribe = null;
    }

    if (_modeEngineUnsubscribe) {
      _modeEngineUnsubscribe();
      _modeEngineUnsubscribe = null;
    }

    _transitionConnection({ type: 'stop' });
    _pushInFlight = null;
    _dataPushPending = false;
    _lastLocationSample = null;
    _lastActionKey = null;
  },

  /**
   * Force an immediate data push to Android Auto.
   * Useful after significant state changes.
   */
  async forcePush(): Promise<void> {
    await _pushData(true);
  },

  /**
   * Push vehicle location to Android Auto.
   * Called by the GPS tracking system for real-time location updates.
   */
  async pushLocation(
    lat: number,
    lon: number,
    heading: number,
    speedMph: number
  ): Promise<void> {
    await _pushVehicleLocation(lat, lon, heading, speedMph);
  },

  /**
   * Push route state to Android Auto.
   * Called when routes are loaded/unloaded.
   */
  async pushRouteState(
    _hasActiveRoute: boolean,
    _hasExpeditionTrack: boolean
  ): Promise<void> {
    await _pushData();
  },

  /**
   * Push weather data to Android Auto.
   * Called when weather data is refreshed.
   */
  async pushWeather(_weatherData: VehicleWeatherData): Promise<void> {
    await _pushData();
  },

  /**
   * Push actions data to Android Auto.
   * Called when action availability changes.
   */
  async pushActions(_mode: VehicleDisplayMode): Promise<void> {
    await _pushData();
  },

  /**
   * Clear all Android Auto data.
   * Called on logout or app reset.
   */
  async clearAll(): Promise<void> {
    const native = getNativeModule();
    if (!native) return;

    try {
      await native.clearAll();
      _transitionConnection({ type: 'probe_disconnected' });
    } catch (err) {
      ecsLog.warn('SYSTEM', '[AndroidAutoBridge] Clear failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  /**
   * Subscribe to bridge state changes.
   * Returns unsubscribe function.
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
    connectionLifecycle: ECSAutomotiveConnectionLifecycle;
    publishCount: number;
    dedupedPublishCount: number;
  } {
    return {
      isRunning: _isRunning,
      isConnected: _isConnected,
      isAvailable: getNativeModule() !== null,
      lastPushTimestamp: _lastPushTimestamp,
      platform: Platform.OS,
      connectionLifecycle: _connectionLifecycle,
      publishCount: _publishCount,
      dedupedPublishCount: _dedupedPublishCount,
    };
  },
};

