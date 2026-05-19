/**
 * VehicleSessionState — Shared State for Vehicle Companion Synchronization
 *
 * This is the central synchronized state object that maintains consistency
 * between the mobile ECS application and vehicle display interfaces
 * (Android Auto and Apple CarPlay).
 *
 * The session state contains:
 *   - activeVehicleDisplayMode (HighwayDrive / ExpeditionDrive)
 *   - activeExpedition status
 *   - activeRoute status
 *   - activeBreadcrumbTrail
 *   - currentVehicleLocation
 *   - activeWaypoints
 *   - connectivityStatus
 *   - gpsStatus
 *   - weatherStatus
 *
 * Architecture:
 *   - Singleton store with subscribe/get pattern
 *   - All mutations go through this store
 *   - Both bridges read from this store
 *   - Mobile app writes to this store
 *   - Vehicle display actions write to this store
 *   - Changes propagate via subscription to all listeners
 *   - State persists during short disconnections
 *   - Reconnecting companions restore from this state
 *
 * Does NOT modify the mobile ECS dashboard.
 */

import { Platform } from 'react-native';
import type {
  VehicleSessionState,
  BreadcrumbTrailSync,
  VehicleLocationSync,
  WaypointSync,
  CompanionConnectionState,
  CompanionPlatform,
  CompanionSyncEvent,
  CompanionSyncEventRecord,
  CompanionRestorePayload,
} from './vehicleCompanionTypes';
import type { VehicleDisplayMode, ModeOverrideSetting } from './vehicleDisplayTypes';
import { ecsLog } from './ecsLogger';

// ── Storage helpers ──────────────────────────────────────────
const STORAGE_KEY = 'ecs_vehicle_session_state';
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

// ── Default State Factories ─────────────────────────────────

function createDefaultBreadcrumbSync(): BreadcrumbTrailSync {
  return {
    isRecording: false,
    pointCount: 0,
    totalTrailDistanceMi: 0,
    distanceFromStartMi: 0,
    elevationGainFt: 0,
    elevationLossFt: 0,
    bearingToStartDeg: null,
    canReturnToStart: false,
    isReturningToStart: false,
    isPausedByGps: false,
    recordingStartedAt: null,
  };
}

function createDefaultLocation(): VehicleLocationSync {
  return {
    latitude: null,
    longitude: null,
    headingDeg: null,
    speedMph: null,
    altitudeM: null,
    accuracyM: null,
    timestamp: null,
    isLive: false,
  };
}

function createDefaultConnection(): CompanionConnectionState {
  return {
    platform: 'none',
    isConnected: false,
    connectedAt: null,
    disconnectedAt: null,
    reconnectCount: 0,
    isInReconnectGrace: false,
    lastDataPushAt: 0,
    lastActionReceivedAt: 0,
  };
}

function createDefaultSessionState(): VehicleSessionState {
  return {
    activeVehicleDisplayMode: 'highway_drive',
    modeOverride: 'auto',
    activeExpedition: false,
    activeExpeditionId: null,
    activeExpeditionName: null,
    activeRoute: false,
    activeRouteId: null,
    activeRouteName: null,
    activeBreadcrumbTrail: createDefaultBreadcrumbSync(),
    currentVehicleLocation: createDefaultLocation(),
    activeWaypoints: [],
    connectivityStatus: 'unknown',
    gpsStatus: 'none',
    weatherStatus: 'unavailable',
    companionConnection: createDefaultConnection(),
    sessionStartedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    version: 0,
  };
}

// ── Internal State ──────────────────────────────────────────

let _state: VehicleSessionState = createDefaultSessionState();
let _eventHistory: CompanionSyncEventRecord[] = [];
const MAX_EVENT_HISTORY = 200;

function logVehicleSessionDebug(message: string, details?: Record<string, unknown>): void {
  ecsLog.dev('SYSTEM', message, details, {
    tag: '[VehicleSessionState]',
    debugFlag: 'ECS_DEBUG_VEHICLE_SESSION',
    fingerprint: `${message}:${JSON.stringify(details ?? {})}`,
    throttleMs: 2500,
    aggregateWindowMs: 30_000,
  });
}

// Listeners
type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify(): void {
  _state.version++;
  _state.lastUpdatedAt = new Date().toISOString();
  for (const fn of _listeners) {
    try { fn(); } catch {}
  }
}

// ── Event History ───────────────────────────────────────────

function _recordEvent(
  event: CompanionSyncEvent,
  source: 'mobile' | 'android_auto' | 'carplay' | 'system',
  payload?: Record<string, unknown>,
): void {
  const record: CompanionSyncEventRecord = {
    event,
    timestamp: new Date().toISOString(),
    source,
    payload,
  };
  _eventHistory.push(record);
  if (_eventHistory.length > MAX_EVENT_HISTORY) {
    _eventHistory = _eventHistory.slice(-MAX_EVENT_HISTORY);
  }
}

// ── Persistence ─────────────────────────────────────────────

interface PersistedSessionState {
  activeVehicleDisplayMode: VehicleDisplayMode;
  modeOverride: ModeOverrideSetting;
  activeExpedition: boolean;
  activeExpeditionId: string | null;
  activeRoute: boolean;
  activeRouteId: string | null;
  activeWaypoints: WaypointSync[];
  breadcrumbPointCount: number;
  breadcrumbIsRecording: boolean;
}

function _persistState(): void {
  try {
    const persisted: PersistedSessionState = {
      activeVehicleDisplayMode: _state.activeVehicleDisplayMode,
      modeOverride: _state.modeOverride,
      activeExpedition: _state.activeExpedition,
      activeExpeditionId: _state.activeExpeditionId,
      activeRoute: _state.activeRoute,
      activeRouteId: _state.activeRouteId,
      activeWaypoints: _state.activeWaypoints,
      breadcrumbPointCount: _state.activeBreadcrumbTrail.pointCount,
      breadcrumbIsRecording: _state.activeBreadcrumbTrail.isRecording,
    };
    sSet(STORAGE_KEY, JSON.stringify(persisted));
  } catch {}
}

function _loadPersistedState(): void {
  try {
    const raw = sGet(STORAGE_KEY);
    if (!raw) return;
    const persisted: PersistedSessionState = JSON.parse(raw);
    if (persisted.activeVehicleDisplayMode) {
      _state.activeVehicleDisplayMode = persisted.activeVehicleDisplayMode;
    }
    if (persisted.modeOverride) {
      _state.modeOverride = persisted.modeOverride;
    }
    if (persisted.activeExpedition != null) {
      _state.activeExpedition = persisted.activeExpedition;
      _state.activeExpeditionId = persisted.activeExpeditionId;
    }
    if (persisted.activeRoute != null) {
      _state.activeRoute = persisted.activeRoute;
      _state.activeRouteId = persisted.activeRouteId;
    }
    if (Array.isArray(persisted.activeWaypoints)) {
      _state.activeWaypoints = persisted.activeWaypoints;
    }
  } catch {}
}

// Load persisted state on initialization
_loadPersistedState();

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

export const vehicleSessionState = {
  // ── Read ───────────────────────────────────────────────

  /**
   * Get the full session state.
   */
  get(): VehicleSessionState {
    return _state;
  },

  /**
   * Get the current vehicle display mode.
   */
  getMode(): VehicleDisplayMode {
    return _state.activeVehicleDisplayMode;
  },

  /**
   * Get the mode override setting.
   */
  getModeOverride(): ModeOverrideSetting {
    return _state.modeOverride;
  },

  /**
   * Whether an expedition is active.
   */
  hasActiveExpedition(): boolean {
    return _state.activeExpedition;
  },

  /**
   * Get the active expedition ID.
   */
  getActiveExpeditionId(): string | null {
    return _state.activeExpeditionId;
  },

  /**
   * Whether an active route exists.
   */
  hasActiveRoute(): boolean {
    return _state.activeRoute;
  },

  /**
   * Get the active route ID.
   */
  getActiveRouteId(): string | null {
    return _state.activeRouteId;
  },

  /**
   * Get the breadcrumb trail sync state.
   */
  getBreadcrumbTrail(): BreadcrumbTrailSync {
    return _state.activeBreadcrumbTrail;
  },

  /**
   * Get the current vehicle location.
   */
  getVehicleLocation(): VehicleLocationSync {
    return _state.currentVehicleLocation;
  },

  /**
   * Get all active waypoints.
   */
  getWaypoints(): WaypointSync[] {
    return _state.activeWaypoints;
  },

  /**
   * Get the companion connection state.
   */
  getCompanionConnection(): CompanionConnectionState {
    return _state.companionConnection;
  },

  /**
   * Whether any companion is connected.
   */
  isCompanionConnected(): boolean {
    return _state.companionConnection.isConnected;
  },

  /**
   * Get the connected companion platform.
   */
  getCompanionPlatform(): CompanionPlatform {
    return _state.companionConnection.platform;
  },

  /**
   * Get the current session version (for change detection).
   */
  getVersion(): number {
    return _state.version;
  },

  /**
   * Get the sync event history.
   */
  getEventHistory(): CompanionSyncEventRecord[] {
    return [..._eventHistory];
  },

  /**
   * Get the last N sync events.
   */
  getRecentEvents(count: number = 20): CompanionSyncEventRecord[] {
    return _eventHistory.slice(-count);
  },

  // ── Mode Sync ─────────────────────────────────────────

  /**
   * Set the vehicle display mode.
   * Called from mobile app, mode engine, or vehicle display.
   * Propagates to all listeners (including bridges).
   */
  setMode(
    mode: VehicleDisplayMode,
    source: 'mobile' | 'android_auto' | 'carplay' | 'system' = 'system',
  ): void {
    if (_state.activeVehicleDisplayMode === mode) return;
    const previousMode = _state.activeVehicleDisplayMode;
    _state.activeVehicleDisplayMode = mode;
    _recordEvent('mode_changed', source, { previousMode, newMode: mode });
    _persistState();
    _notify();
    logVehicleSessionDebug('mode_changed', { previousMode, mode, source });
  },

  /**
   * Set the mode override setting.
   */
  setModeOverride(
    override: ModeOverrideSetting,
    source: 'mobile' | 'android_auto' | 'carplay' | 'system' = 'system',
  ): void {
    if (_state.modeOverride === override) return;
    _state.modeOverride = override;
    _recordEvent('mode_changed', source, { modeOverride: override });
    _persistState();
    _notify();
  },

  // ── Expedition Sync ───────────────────────────────────

  /**
   * Mark an expedition as started.
   * Called when the user launches an expedition from the mobile app.
   */
  setExpeditionActive(
    expeditionId: string,
    expeditionName: string,
    source: 'mobile' | 'system' = 'mobile',
  ): void {
    _state.activeExpedition = true;
    _state.activeExpeditionId = expeditionId;
    _state.activeExpeditionName = expeditionName;
    _recordEvent('expedition_started', source, { expeditionId, expeditionName });
    _persistState();
    _notify();
    logVehicleSessionDebug('expedition_started', { expeditionId, expeditionName, source });
  },

  /**
   * Mark the expedition as ended.
   */
  setExpeditionInactive(
    source: 'mobile' | 'system' = 'mobile',
  ): void {
    if (!_state.activeExpedition) return;
    const prevId = _state.activeExpeditionId;
    _state.activeExpedition = false;
    _state.activeExpeditionId = null;
    _state.activeExpeditionName = null;
    _recordEvent('expedition_ended', source, { expeditionId: prevId });
    _persistState();
    _notify();
    logVehicleSessionDebug('expedition_ended', { expeditionId: prevId, source });
  },

  // ── Route Sync ────────────────────────────────────────

  /**
   * Set the active route.
   * Called when a route is loaded or activated from the mobile app.
   */
  setRouteActive(
    routeId: string,
    routeName: string,
    source: 'mobile' | 'system' = 'mobile',
  ): void {
    _state.activeRoute = true;
    _state.activeRouteId = routeId;
    _state.activeRouteName = routeName;
    _recordEvent('route_activated', source, { routeId, routeName });
    _persistState();
    _notify();
    logVehicleSessionDebug('route_activated', { routeId, routeName, source });
  },

  /**
   * Clear the active route.
   */
  setRouteInactive(
    source: 'mobile' | 'system' = 'mobile',
  ): void {
    if (!_state.activeRoute) return;
    const prevId = _state.activeRouteId;
    _state.activeRoute = false;
    _state.activeRouteId = null;
    _state.activeRouteName = null;
    _recordEvent('route_deactivated', source, { routeId: prevId });
    _persistState();
    _notify();
    logVehicleSessionDebug('route_deactivated', { routeId: prevId, source });
  },

  // ── Breadcrumb Sync ───────────────────────────────────

  /**
   * Update the breadcrumb trail sync state.
   * Called by the breadcrumbTracker subscription.
   */
  updateBreadcrumbTrail(trail: BreadcrumbTrailSync): void {
    const prev = _state.activeBreadcrumbTrail;
    _state.activeBreadcrumbTrail = trail;

    // Detect state transitions for event recording
    if (!prev.isRecording && trail.isRecording) {
      _recordEvent('breadcrumb_started', 'system');
    } else if (prev.isRecording && !trail.isRecording && trail.isPausedByGps) {
      _recordEvent('breadcrumb_paused', 'system', { reason: 'gps_lost' });
    } else if (prev.isRecording && !trail.isRecording && !trail.isPausedByGps) {
      _recordEvent('breadcrumb_stopped', 'system');
    } else if (!prev.isRecording && trail.isRecording && prev.isPausedByGps) {
      _recordEvent('breadcrumb_resumed', 'system', { reason: 'gps_restored' });
    }

    if (!prev.isReturningToStart && trail.isReturningToStart) {
      _recordEvent('return_to_start_activated', 'system');
    } else if (prev.isReturningToStart && !trail.isReturningToStart) {
      _recordEvent('return_to_start_cancelled', 'system');
    }

    _notify();
  },

  // ── Location Sync ─────────────────────────────────────

  /**
   * Update the current vehicle location.
   * Called by the GPS tracking system.
   */
  updateVehicleLocation(location: VehicleLocationSync): void {
    const prevGps = _state.gpsStatus;
    _state.currentVehicleLocation = location;

    // Update GPS status based on location quality
    if (location.isLive && location.latitude != null) {
      if (location.accuracyM != null && location.accuracyM <= 10) {
        _state.gpsStatus = 'strong';
      } else if (location.accuracyM != null && location.accuracyM <= 30) {
        _state.gpsStatus = 'moderate';
      } else {
        _state.gpsStatus = 'weak';
      }
    } else if (!location.isLive && location.latitude != null) {
      _state.gpsStatus = 'weak';
    } else {
      _state.gpsStatus = 'none';
    }

    if (prevGps !== _state.gpsStatus) {
      _recordEvent('gps_status_changed', 'system', {
        previousStatus: prevGps,
        newStatus: _state.gpsStatus,
      });
    }

    // Don't persist on every location update (too frequent)
    _notify();
  },

  // ── Waypoint Sync ─────────────────────────────────────

  /**
   * Add a waypoint from any interface.
   * The waypoint appears on both mobile and vehicle displays.
   */
  addWaypoint(
    waypoint: WaypointSync,
    source: 'mobile' | 'android_auto' | 'carplay' = 'mobile',
  ): void {
    // Avoid duplicates
    if (_state.activeWaypoints.some(w => w.id === waypoint.id)) return;

    _state.activeWaypoints.push({
      ...waypoint,
      source,
    });
    _recordEvent('waypoint_added', source, {
      waypointId: waypoint.id,
      type: waypoint.type,
      title: waypoint.title,
    });
    _persistState();
    _notify();
    logVehicleSessionDebug('waypoint_added', {
      waypointId: waypoint.id,
      type: waypoint.type,
      title: waypoint.title,
      source,
    });
  },

  /**
   * Remove a waypoint.
   */
  removeWaypoint(
    waypointId: string,
    source: 'mobile' | 'android_auto' | 'carplay' = 'mobile',
  ): void {
    const idx = _state.activeWaypoints.findIndex(w => w.id === waypointId);
    if (idx === -1) return;
    const removed = _state.activeWaypoints.splice(idx, 1)[0];
    _recordEvent('waypoint_removed', source, {
      waypointId: removed.id,
      type: removed.type,
      title: removed.title,
    });
    _persistState();
    _notify();
    logVehicleSessionDebug('waypoint_removed', {
      waypointId,
      type: removed.type,
      title: removed.title,
      source,
    });
  },

  /**
   * Get waypoints for a specific expedition.
   */
  getExpeditionWaypoints(expeditionId: string): WaypointSync[] {
    return _state.activeWaypoints.filter(w => w.expeditionId === expeditionId);
  },

  // ── Connectivity Sync ─────────────────────────────────

  /**
   * Update connectivity status.
   */
  setConnectivityStatus(
    status: 'online' | 'limited' | 'offline' | 'unknown',
  ): void {
    if (_state.connectivityStatus === status) return;
    const prev = _state.connectivityStatus;
    _state.connectivityStatus = status;
    _recordEvent('connectivity_changed', 'system', {
      previousStatus: prev,
      newStatus: status,
    });
    _notify();
  },

  /**
   * Update weather data status.
   */
  setWeatherStatus(
    status: 'available' | 'stale' | 'unavailable',
  ): void {
    if (_state.weatherStatus === status) return;
    const prev = _state.weatherStatus;
    _state.weatherStatus = status;
    _recordEvent('weather_status_changed', 'system', {
      previousStatus: prev,
      newStatus: status,
    });
    _notify();
  },

  // ── Companion Connection ──────────────────────────────

  /**
   * Record a companion connection.
   */
  setCompanionConnected(platform: CompanionPlatform): void {
    const wasConnected = _state.companionConnection.isConnected;
    const wasSamePlatform = _state.companionConnection.platform === platform;

    _state.companionConnection.platform = platform;
    _state.companionConnection.isConnected = true;
    _state.companionConnection.connectedAt = new Date().toISOString();
    _state.companionConnection.isInReconnectGrace = false;

    if (wasConnected && wasSamePlatform) {
      // Reconnection
      _state.companionConnection.reconnectCount++;
      _recordEvent('companion_reconnected', platform === 'android_auto' ? 'android_auto' : 'carplay', {
        platform,
        reconnectCount: _state.companionConnection.reconnectCount,
      });
      logVehicleSessionDebug('companion_reconnected', {
        platform,
        reconnectCount: _state.companionConnection.reconnectCount,
      });
    } else {
      // Fresh connection
      _state.companionConnection.reconnectCount = 0;
      _recordEvent('companion_connected', platform === 'android_auto' ? 'android_auto' : 'carplay', {
        platform,
      });
      logVehicleSessionDebug('companion_connected', { platform });
    }

    _persistState();
    _notify();
  },

  /**
   * Record a companion disconnection.
   */
  setCompanionDisconnected(): void {
    if (!_state.companionConnection.isConnected) return;
    const platform = _state.companionConnection.platform;

    _state.companionConnection.isConnected = false;
    _state.companionConnection.disconnectedAt = new Date().toISOString();
    _state.companionConnection.isInReconnectGrace = true;

    _recordEvent('companion_disconnected', platform === 'android_auto' ? 'android_auto' : 'carplay', {
      platform,
    });

    _persistState();
    _notify();
    logVehicleSessionDebug('companion_disconnected', { platform, reconnectGrace: true });
  },

  /**
   * Clear the reconnect grace period.
   * Called when the grace period expires without reconnection.
   */
  clearReconnectGrace(): void {
    if (!_state.companionConnection.isInReconnectGrace) return;
    _state.companionConnection.isInReconnectGrace = false;
    _state.companionConnection.platform = 'none';
    _notify();
    logVehicleSessionDebug('reconnect_grace_expired');
  },

  /**
   * Record a data push timestamp.
   */
  recordDataPush(): void {
    _state.companionConnection.lastDataPushAt = Date.now();
  },

  /**
   * Record an action received timestamp.
   */
  recordActionReceived(): void {
    _state.companionConnection.lastActionReceivedAt = Date.now();
  },

  // ── Reconnect Restore ─────────────────────────────────

  /**
   * Build a restore payload for a reconnecting companion.
   * Contains everything needed to bring the vehicle display back
   * to its pre-disconnect state.
   */
  buildRestorePayload(): CompanionRestorePayload {
    return {
      mode: _state.activeVehicleDisplayMode,
      modeOverride: _state.modeOverride,
      hasExpedition: _state.activeExpedition,
      expeditionId: _state.activeExpeditionId,
      hasRoute: _state.activeRoute,
      routeId: _state.activeRouteId,
      breadcrumb: {
        isRecording: _state.activeBreadcrumbTrail.isRecording,
        pointCount: _state.activeBreadcrumbTrail.pointCount,
        canReturnToStart: _state.activeBreadcrumbTrail.canReturnToStart,
        distanceFromStartMi: _state.activeBreadcrumbTrail.distanceFromStartMi,
      },
      location: { ..._state.currentVehicleLocation },
      waypointCount: _state.activeWaypoints.length,
      snapshotAt: new Date().toISOString(),
    };
  },

  // ── Lifecycle ─────────────────────────────────────────

  /**
   * Reset the session state to defaults.
   * Called on app logout or full reset.
   */
  reset(): void {
    _state = createDefaultSessionState();
    _eventHistory = [];
    _persistState();
    _notify();
    logVehicleSessionDebug('session_state_reset');
  },

  /**
   * Subscribe to state changes.
   * Returns unsubscribe function.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },

  /**
   * Get debug info for the session state.
   */
  getDebugInfo(): Record<string, unknown> {
    return {
      mode: _state.activeVehicleDisplayMode,
      modeOverride: _state.modeOverride,
      expedition: _state.activeExpedition ? _state.activeExpeditionId : 'none',
      route: _state.activeRoute ? _state.activeRouteId : 'none',
      breadcrumb: {
        recording: _state.activeBreadcrumbTrail.isRecording,
        points: _state.activeBreadcrumbTrail.pointCount,
        canReturn: _state.activeBreadcrumbTrail.canReturnToStart,
      },
      gps: _state.gpsStatus,
      connectivity: _state.connectivityStatus,
      weather: _state.weatherStatus,
      companion: {
        platform: _state.companionConnection.platform,
        connected: _state.companionConnection.isConnected,
        reconnects: _state.companionConnection.reconnectCount,
        grace: _state.companionConnection.isInReconnectGrace,
      },
      waypoints: _state.activeWaypoints.length,
      version: _state.version,
      eventCount: _eventHistory.length,
    };
  },
};

