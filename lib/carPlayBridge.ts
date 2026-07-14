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
 *   - Bounded, semantic-deduplicated data publication
 *   - Timer-driven action polling (1s interval)
 *   - Subscribes to vehicleDisplayStore for reactive updates
 *   - Falls back gracefully when NativeModule is unavailable (web/Android)
 *   - Does NOT modify the mobile ECS dashboard
 *
 * Mirrors the Android Auto bridge for consistent cross-platform behavior.
 */
import { AppState, Platform, NativeModules, type AppStateStatus } from 'react-native';
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
let _lastPayloadSignature: string | null = null;
let _pushInFlight: Promise<void> | null = null;
let _dataPushPending = false;
let _lastLocationSample: ECSAutomotiveLocationSample | null = null;
let _publishCount = 0;
let _dedupedPublishCount = 0;
let _lastActionKey: string | null = null;

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

function _isAppForeground(): boolean {
  return _appState !== 'background' && _appState !== 'inactive';
}

function _clearRuntimeTimers(): void {
  if (_dataPushTimer) clearInterval(_dataPushTimer);
  if (_pendingDataPushTimer) clearTimeout(_pendingDataPushTimer);
  if (_actionPollTimer) clearInterval(_actionPollTimer);
  if (_connectionProbeTimer) clearInterval(_connectionProbeTimer);
  _dataPushTimer = null;
  _pendingDataPushTimer = null;
  _actionPollTimer = null;
  _connectionProbeTimer = null;
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
  _connectionProbeTimer = setInterval(() => {
    _checkConnection().catch(() => {});
  }, _isAppForeground() ? DISCONNECTED_PROBE_INTERVAL_MS : BACKGROUND_DISCONNECTED_PROBE_INTERVAL_MS);
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
    if (connected) vehicleCompanionManager.onCompanionConnected('carplay');
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

function _handleAppStateChange(nextState: AppStateStatus): void {
  if (_appState === nextState) return;
  _appState = nextState;
  if (_isRunning) _reconcileRuntimeTimers();
  _transitionConnection({ type: 'app_state', foreground: _isAppForeground() });
}

// ── Data Push ───────────────────────────────────────────────

/**
 * Push the current vehicle display state to the native CarPlay layer.
 * Pushes all four screen data blobs plus mode, indicators, and system health.
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
    modeState,
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
      await native.pushModeState(JSON.stringify(modeState));
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
      ecsLog.warn('SYSTEM', '[CarPlayBridge] Data push failed', {
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
    ecsLog.debug('SYSTEM', '[CarPlayBridge] Mode pushed', { mode });
  } catch (err) {
    ecsLog.warn('SYSTEM', '[CarPlayBridge] Mode push failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Action Polling ──────────────────────────────────────────

/**
 * Poll for pending actions from CarPlay.
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

    ecsLog.debug('SYSTEM', '[CarPlayBridge] Action received', {
      source: action.source,
      actionType: action.actionType,
    });

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
    ecsLog.warn('SYSTEM', '[CarPlayBridge] Action poll failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Connection Monitoring ───────────────────────────────────

/**
 * Check CarPlay connection state.
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
    ecsLog.debug('SYSTEM', '[CarPlayBridge] Connection probe failed', {
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
    ecsLog.warn('SYSTEM', '[CarPlayBridge] Location push failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Handle vehicleDisplayStore state changes.
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
 */
function _onModeChange(): void {
  if (!_isRunning || !_isConnected) return;

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
      _transitionConnection({ type: 'native_unavailable' });
      return;
    }

    const native = getNativeModule();
    const featureDecision = resolveAutomotiveFeatureAccess('carplay_bridge', {
      platform: Platform.OS,
      androidAutoNativeAvailable: false,
      carPlayNativeAvailable: Boolean(native),
    });
    if (!native || featureDecision.availability !== 'available') {
      _transitionConnection({ type: 'native_unavailable' });
      ecsLog.debug('SYSTEM', '[CarPlayBridge] Rollout gate kept bridge inactive', {
        reason: native ? featureDecision.reason : 'missing_native_module',
      });
      return;
    }

    _isRunning = true;
    _appState = AppState.currentState;
    _lastPayloadSignature = null;
    _dataPushPending = false;
    _lastLocationSample = null;
    _lastActionKey = null;

    _storeUnsubscribe = vehicleDisplayStore.subscribe(_onStoreChange);
    _modeEngineUnsubscribe = vehicleDisplayModeEngine.subscribe(_onModeChange);
    _appStateSubscription = AppState.addEventListener('change', _handleAppStateChange);
    _transitionConnection({ type: 'start' });
    _checkConnection().catch(() => {});
  },

  /**
   * Stop the CarPlay bridge.
   */
  stop(): void {
    if (!_isRunning) return;
    _isRunning = false;
    _clearRuntimeTimers();

    _appStateSubscription?.remove();
    _appStateSubscription = null;

    _storeUnsubscribe?.();
    _storeUnsubscribe = null;

    _modeEngineUnsubscribe?.();
    _modeEngineUnsubscribe = null;

    _transitionConnection({ type: 'stop' });
    _pushInFlight = null;
    _dataPushPending = false;
    _lastLocationSample = null;
    _lastActionKey = null;
  },

  /**
   * Force an immediate data push to CarPlay.
   */
  async forcePush(): Promise<void> {
    await _pushData(true);
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
    await _pushVehicleLocation(lat, lon, heading, speedMph);
  },

  /**
   * Push route state to CarPlay.
   */
  async pushRouteState(
    _hasActiveRoute: boolean,
    _hasExpeditionTrack: boolean
  ): Promise<void> {
    await _pushData();
  },

  /**
   * Push weather data to CarPlay.
   */
  async pushWeather(_weatherData: VehicleWeatherData): Promise<void> {
    await _pushData();
  },

  /**
   * Push actions data to CarPlay.
   */
  async pushActions(_mode: VehicleDisplayMode): Promise<void> {
    await _pushData();
  },

  /**
   * Clear all CarPlay data.
   */
  async clearAll(): Promise<void> {
    const native = getNativeModule();
    if (!native) return;

    try {
      await native.clearAll();
      _transitionConnection({ type: 'probe_disconnected' });
    } catch (err) {
      ecsLog.warn('SYSTEM', '[CarPlayBridge] Clear failed', {
        error: err instanceof Error ? err.message : String(err),
      });
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

