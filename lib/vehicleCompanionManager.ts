/**
 * VehicleCompanionManager — Central Communication Layer
 *
 * Maintains synchronized state between:
 *   - Mobile ECS application
 *   - Android Auto vehicle interface
 *   - Apple CarPlay vehicle interface
 *
 * Responsibilities:
 *   1. Subscribe to all relevant ECS stores and sync changes to vehicleSessionState
 *   2. Detect companion connection/disconnection events
 *   3. Restore state automatically when a companion reconnects
 *   4. Route actions from vehicle displays back to the mobile ECS system
 *   5. Manage the reconnect grace period
 *   6. Keep breadcrumb, waypoint, route, and expedition state consistent
 *
 * Data Flow:
 *   ECS Stores → VehicleCompanionManager → vehicleSessionState → Bridges
 *   Bridges → vehicleSessionState → VehicleCompanionManager → ECS Stores
 *
 * Architecture:
 *   - Timer-driven sync (2s interval for store polling)
 *   - Subscription-based reactive updates from ECS stores
 *   - Reconnect grace period (60s) preserves state during short disconnections
 *   - Lightweight — no networking, no backend dependencies
 *   - Does NOT modify the mobile ECS dashboard
 */

import { Platform } from 'react-native';
import { vehicleSessionState } from './vehicleSessionState';
import { vehicleDisplayStore } from './vehicleDisplayStore';
import { vehicleDisplayModeEngine } from './vehicleDisplayModeEngine';
import { breadcrumbTracker } from './breadcrumbTracker';
import type {
  CompanionPlatform,
  CompanionManagerConfig,
  BreadcrumbTrailSync,
  VehicleLocationSync,
  WaypointSync,
  CompanionRestorePayload,
} from './vehicleCompanionTypes';
import { DEFAULT_COMPANION_CONFIG } from './vehicleCompanionTypes';
import type { VehicleDisplayMode, VehicleActionType, ModeOverrideSetting } from './vehicleDisplayTypes';

// ── Internal State ──────────────────────────────────────────

let _config: CompanionManagerConfig = { ...DEFAULT_COMPANION_CONFIG };
let _isRunning = false;
let _syncTimer: ReturnType<typeof setInterval> | null = null;
let _graceTimer: ReturnType<typeof setTimeout> | null = null;

// Store subscriptions
let _displayStoreUnsub: (() => void) | null = null;
let _modeEngineUnsub: (() => void) | null = null;
let _breadcrumbUnsub: (() => void) | null = null;
let _sessionStateUnsub: (() => void) | null = null;

// Cached state for change detection
let _lastSyncedMode: VehicleDisplayMode | null = null;
let _lastSyncedExpeditionId: string | null = null;
let _lastSyncedRouteId: string | null = null;
let _lastBreadcrumbPointCount = 0;
let _lastCompanionConnected = false;

// Listeners
type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify(): void {
  for (const fn of _listeners) {
    try { fn(); } catch {}
  }
}

// ── Store Sync Functions ────────────────────────────────────

/**
 * Sync vehicle display mode from the mode engine to session state.
 * Bidirectional: also applies session state mode to the display store.
 */
function _syncMode(): void {
  const engineMode = vehicleDisplayModeEngine.getCurrentMode();
  const sessionMode = vehicleSessionState.getMode();

  if (engineMode !== sessionMode) {
    // Mode engine is authoritative — push to session state
    vehicleSessionState.setMode(engineMode, 'system');
  }

  const engineOverride = vehicleDisplayModeEngine.getModeOverride();
  const sessionOverride = vehicleSessionState.getModeOverride();
  if (engineOverride !== sessionOverride) {
    vehicleSessionState.setModeOverride(engineOverride, 'system');
  }

  _lastSyncedMode = engineMode;
}

/**
 * Sync expedition status from the mission store to session state.
 */
function _syncExpedition(): void {
  try {
    const { missionExpeditionStore } = require('./missionStore');
    const activeExp = missionExpeditionStore.getActive();

    if (activeExp && activeExp.id !== _lastSyncedExpeditionId) {
      vehicleSessionState.setExpeditionActive(activeExp.id, activeExp.name, 'system');
      _lastSyncedExpeditionId = activeExp.id;

      // Feed expedition state to mode engine
      vehicleDisplayModeEngine.feedExpeditionState(true);
    } else if (!activeExp && _lastSyncedExpeditionId) {
      vehicleSessionState.setExpeditionInactive('system');
      _lastSyncedExpeditionId = null;

      // Feed expedition state to mode engine
      vehicleDisplayModeEngine.feedExpeditionState(false);
    }
  } catch {}
}

/**
 * Sync route status from the route store to session state.
 */
function _syncRoute(): void {
  try {
    const { routeStore } = require('./routeStore');
    const activeRoute = routeStore.getActive();

    if (activeRoute && activeRoute.id !== _lastSyncedRouteId) {
      vehicleSessionState.setRouteActive(activeRoute.id, activeRoute.name, 'system');
      _lastSyncedRouteId = activeRoute.id;

      // Update vehicle display store route flags
      vehicleDisplayStore.updateMapData({
        routeLine: true,
        importedGpxRoute: activeRoute.source_format === 'gpx',
      });
    } else if (!activeRoute && _lastSyncedRouteId) {
      vehicleSessionState.setRouteInactive('system');
      _lastSyncedRouteId = null;

      // Clear vehicle display store route flags
      vehicleDisplayStore.updateMapData({
        routeLine: false,
        importedGpxRoute: false,
      });
    }
  } catch {}
}

/**
 * Sync breadcrumb tracker state to session state.
 */
function _syncBreadcrumb(): void {
  try {
    const bcState = breadcrumbTracker.get();
    const { gpsUIState } = require('./gpsUIState');
    const gps = gpsUIState.get();

    const trail: BreadcrumbTrailSync = {
      isRecording: bcState.isRecording,
      pointCount: bcState.pointCount,
      totalTrailDistanceMi: bcState.totalTrailDistanceMi,
      distanceFromStartMi: bcState.distanceFromStartMi,
      elevationGainFt: bcState.elevationGainFt,
      elevationLossFt: bcState.elevationLossFt,
      bearingToStartDeg: bcState.bearingToStartDeg,
      canReturnToStart: bcState.canReturnToStart,
      isReturningToStart: bcState.isReturningToStart,
      isPausedByGps: !gps?.hasFix && bcState.pointCount > 0,
      recordingStartedAt: bcState.recordingStartedAt,
    };

    vehicleSessionState.updateBreadcrumbTrail(trail);
    _lastBreadcrumbPointCount = bcState.pointCount;
  } catch {}
}

/**
 * Sync GPS location to session state.
 */
function _syncLocation(): void {
  try {
    const { gpsUIState } = require('./gpsUIState');
    const gps = gpsUIState.get();

    if (gps.hasFix && gps.position) {
      const location: VehicleLocationSync = {
        latitude: gps.position.latitude,
        longitude: gps.position.longitude,
        headingDeg: gps.position.headingDeg ?? null,
        speedMph: gps.position.speedMph ?? null,
        altitudeM: gps.position.altitudeM ?? null,
        accuracyM: gps.position.accuracyM ?? null,
        timestamp: new Date().toISOString(),
        isLive: true,
      };
      vehicleSessionState.updateVehicleLocation(location);
    } else {
      // Use fallback last known position
      const lastKnown = vehicleDisplayStore.getLastKnownPosition();
      if (lastKnown) {
        vehicleSessionState.updateVehicleLocation({
          latitude: lastKnown.lat,
          longitude: lastKnown.lon,
          headingDeg: lastKnown.heading,
          speedMph: null,
          altitudeM: null,
          accuracyM: null,
          timestamp: new Date().toISOString(),
          isLive: false,
        });
      }
    }
  } catch {}
}

/**
 * Sync connectivity status to session state.
 */
function _syncConnectivity(): void {
  try {
    const { connectivity } = require('./connectivity');
    const level = connectivity.getLevel();
    switch (level) {
      case 'normal':
        vehicleSessionState.setConnectivityStatus('online');
        break;
      case 'limited':
        vehicleSessionState.setConnectivityStatus('limited');
        break;
      case 'no_service':
        vehicleSessionState.setConnectivityStatus('offline');
        break;
      default:
        vehicleSessionState.setConnectivityStatus('unknown');
        break;
    }
  } catch {}
}

/**
 * Sync weather status to session state.
 */
function _syncWeather(): void {
  try {
    const weather = vehicleDisplayStore.getWeatherHazardData();
    if (weather.status === 'unavailable') {
      vehicleSessionState.setWeatherStatus('unavailable');
    } else if (weather.source === 'cached' || weather.status === 'fallback') {
      vehicleSessionState.setWeatherStatus('stale');
    } else {
      vehicleSessionState.setWeatherStatus('available');
    }
  } catch {}
}

/**
 * Sync waypoints from the pin store to session state.
 */
function _syncWaypoints(): void {
  try {
    const { pinStore } = require('./pinStore');
    const allPins = pinStore.getAll();
    const expeditionId = vehicleSessionState.getActiveExpeditionId();

    // Get pins relevant to the current expedition (or all unattached pins)
    const relevantPins = allPins.filter((p: any) =>
      p.expedition_id === expeditionId || !p.expedition_id
    );

    // Convert to WaypointSync format
    const waypoints: WaypointSync[] = relevantPins.map((p: any) => ({
      id: p.id,
      type: _mapPinTypeToWaypointType(p.type),
      title: p.title || 'Unnamed',
      notes: p.notes || '',
      lat: p.lat,
      lng: p.lng,
      createdAt: p.created_at,
      source: 'mobile' as const,
      expeditionId: p.expedition_id || null,
    }));

    // Only update if the waypoint set has changed
    const currentWaypoints = vehicleSessionState.getWaypoints();
    const currentIds = new Set(currentWaypoints.map(w => w.id));
    const newIds = new Set(waypoints.map((w: WaypointSync) => w.id));

    // Check for additions
    for (const wp of waypoints) {
      if (!currentIds.has(wp.id)) {
        vehicleSessionState.addWaypoint(wp, 'mobile');
      }
    }

    // Check for removals
    for (const wp of currentWaypoints) {
      if (!newIds.has(wp.id) && wp.source === 'mobile') {
        vehicleSessionState.removeWaypoint(wp.id, 'mobile');
      }
    }
  } catch {}
}

function _mapPinTypeToWaypointType(pinType: string): WaypointSync['type'] {
  switch (pinType) {
    case 'waypoint':
    case 'poi':
    case 'trailhead':
    case 'campsite':
      return 'waypoint';
    case 'incident':
    case 'vehicle_issue':
    case 'road_damage':
    case 'obstacle':
      return 'incident';
    case 'note':
    case 'photo':
      return 'note';
    case 'hazard':
    case 'wildlife':
    case 'weather_event':
      return 'hazard';
    case 'fuel':
    case 'water':
    case 'resupply':
      return 'fuel';
    case 'camp':
    case 'rest_stop':
      return 'camp';
    default:
      return 'waypoint';
  }
}

// ── Companion Connection Handling ────────────────────────────

/**
 * Handle companion connection event.
 * Called by the Android Auto or CarPlay bridge when connection is detected.
 */
function _onCompanionConnected(platform: CompanionPlatform): void {
  const wasInGrace = vehicleSessionState.getCompanionConnection().isInReconnectGrace;

  vehicleSessionState.setCompanionConnected(platform);

  // Clear any pending grace timer
  if (_graceTimer) {
    clearTimeout(_graceTimer);
    _graceTimer = null;
  }

  // If reconnecting during grace period, restore state
  if (wasInGrace && _config.autoRestoreOnReconnect) {
    _restoreCompanionState(platform);
  }

  // Force an immediate full sync
  _fullSync();

  _lastCompanionConnected = true;
  _notify();
}

/**
 * Handle companion disconnection event.
 * Called by the Android Auto or CarPlay bridge when disconnection is detected.
 */
function _onCompanionDisconnected(): void {
  vehicleSessionState.setCompanionDisconnected();

  // Start the reconnect grace timer
  if (_graceTimer) {
    clearTimeout(_graceTimer);
  }
  _graceTimer = setTimeout(() => {
    vehicleSessionState.clearReconnectGrace();
    _graceTimer = null;
    console.log('[VehicleCompanionManager] Reconnect grace period expired');
  }, _config.reconnectGracePeriodMs);

  _lastCompanionConnected = false;
  _notify();
}

/**
 * Restore companion state after reconnection.
 * Pushes the current session state to the reconnecting companion.
 */
function _restoreCompanionState(platform: CompanionPlatform): void {
  const payload = vehicleSessionState.buildRestorePayload();
  console.log(
    `[VehicleCompanionManager] Restoring ${platform} state: ` +
    `mode=${payload.mode}, expedition=${payload.hasExpedition}, ` +
    `route=${payload.hasRoute}, breadcrumb=${payload.breadcrumb.pointCount}pts`
  );

  // Apply the restore payload to the vehicle display store
  vehicleDisplayStore.setMode(payload.mode);
  if (payload.modeOverride !== 'auto') {
    vehicleDisplayModeEngine.setModeOverride(payload.modeOverride);
  }

  // The bridges will pick up the restored state on their next push cycle
  _notify();
}

// ── Action Dispatch ─────────────────────────────────────────

/**
 * Handle an action dispatched from a vehicle display.
 * Routes the action to the appropriate ECS system.
 */
function _handleVehicleAction(
  actionType: VehicleActionType,
  source: CompanionPlatform,
): void {
  console.log(`[VehicleCompanionManager] Action from ${source}: ${actionType}`);

  vehicleSessionState.recordActionReceived();

  switch (actionType) {
    case 'add_waypoint':
    case 'drop_waypoint':
      _handleAddWaypoint(source);
      break;

    case 'incident_marker':
      _handleIncidentMarker(source);
      break;

    case 'quick_note':
      _handleQuickNote(source);
      break;

    case 'return_to_start':
      _handleReturnToStart();
      break;

    case 'navigate_home':
      _handleNavigateHome();
      break;

    case 'find_fuel':
      _handleFindFuel();
      break;

    case 'report_hazard':
      _handleReportHazard(source);
      break;

    case 'emergency_comms':
      _handleEmergencyComms();
      break;

    case 'set_mode_auto':
      vehicleDisplayModeEngine.setModeOverride('auto');
      break;

    case 'set_mode_highway':
      vehicleDisplayModeEngine.setModeOverride('highway');
      break;

    case 'set_mode_expedition':
      vehicleDisplayModeEngine.setModeOverride('expedition');
      break;

    default:
      console.warn(`[VehicleCompanionManager] Unknown action: ${actionType}`);
      break;
  }

  _notify();
}

function _handleAddWaypoint(source: CompanionPlatform): void {
  const location = vehicleSessionState.getVehicleLocation();
  if (!location.latitude || !location.longitude) {
    console.warn('[VehicleCompanionManager] Cannot add waypoint — no GPS');
    return;
  }

  try {
    const { pinStore } = require('./pinStore');
    const pin = pinStore.create({
      type: 'waypoint',
      lat: location.latitude,
      lng: location.longitude,
      title: `Waypoint ${new Date().toLocaleTimeString()}`,
      expedition_id: vehicleSessionState.getActiveExpeditionId(),
    });

    // Also add to session state for immediate sync
    vehicleSessionState.addWaypoint({
      id: pin.id,
      type: 'waypoint',
      title: pin.title,
      notes: '',
      lat: pin.lat,
      lng: pin.lng,
      createdAt: pin.created_at,
      source: source === 'android_auto' ? 'android_auto' : source === 'carplay' ? 'carplay' : 'mobile',
      expeditionId: pin.expedition_id,
    }, source === 'android_auto' ? 'android_auto' : source === 'carplay' ? 'carplay' : 'mobile');
  } catch (err) {
    console.warn('[VehicleCompanionManager] Failed to add waypoint:', err);
  }
}

function _handleIncidentMarker(source: CompanionPlatform): void {
  const location = vehicleSessionState.getVehicleLocation();
  if (!location.latitude || !location.longitude) return;

  try {
    const { pinStore } = require('./pinStore');
    const pin = pinStore.create({
      type: 'incident',
      lat: location.latitude,
      lng: location.longitude,
      title: `Incident ${new Date().toLocaleTimeString()}`,
      expedition_id: vehicleSessionState.getActiveExpeditionId(),
      severity: 'low',
    });

    vehicleSessionState.addWaypoint({
      id: pin.id,
      type: 'incident',
      title: pin.title,
      notes: '',
      lat: pin.lat,
      lng: pin.lng,
      createdAt: pin.created_at,
      source: source === 'android_auto' ? 'android_auto' : 'carplay',
      expeditionId: pin.expedition_id,
    }, source === 'android_auto' ? 'android_auto' : 'carplay');
  } catch {}
}

function _handleQuickNote(source: CompanionPlatform): void {
  const location = vehicleSessionState.getVehicleLocation();
  if (!location.latitude || !location.longitude) return;

  try {
    const { pinStore } = require('./pinStore');
    const pin = pinStore.create({
      type: 'waypoint',
      lat: location.latitude,
      lng: location.longitude,
      title: `Note ${new Date().toLocaleTimeString()}`,
      notes: 'Quick note from vehicle display',
      expedition_id: vehicleSessionState.getActiveExpeditionId(),
    });

    vehicleSessionState.addWaypoint({
      id: pin.id,
      type: 'note',
      title: pin.title,
      notes: pin.notes,
      lat: pin.lat,
      lng: pin.lng,
      createdAt: pin.created_at,
      source: source === 'android_auto' ? 'android_auto' : 'carplay',
      expeditionId: pin.expedition_id,
    }, source === 'android_auto' ? 'android_auto' : 'carplay');
  } catch {}
}

function _handleReturnToStart(): void {
  try {
    const route = breadcrumbTracker.returnToStart();
    if (route) {
      console.log(
        `[VehicleCompanionManager] Return to start activated: ` +
        `${route.straightLineDistanceMi} mi straight, ${route.trailDistanceMi} mi trail`
      );
    } else {
      console.warn('[VehicleCompanionManager] Cannot return to start — insufficient breadcrumbs');
    }
  } catch {}
}

function _handleNavigateHome(): void {
  // Navigate home uses the route store's home waypoint if available
  console.log('[VehicleCompanionManager] Navigate home requested');
}

function _handleFindFuel(): void {
  console.log('[VehicleCompanionManager] Find fuel requested');
}

function _handleReportHazard(source: CompanionPlatform): void {
  const location = vehicleSessionState.getVehicleLocation();
  if (!location.latitude || !location.longitude) return;

  try {
    const { pinStore } = require('./pinStore');
    const pin = pinStore.create({
      type: 'hazard' as any,
      lat: location.latitude,
      lng: location.longitude,
      title: `Hazard ${new Date().toLocaleTimeString()}`,
      expedition_id: vehicleSessionState.getActiveExpeditionId(),
    });

    vehicleSessionState.addWaypoint({
      id: pin.id,
      type: 'hazard',
      title: pin.title,
      notes: '',
      lat: pin.lat,
      lng: pin.lng,
      createdAt: pin.created_at,
      source: source === 'android_auto' ? 'android_auto' : 'carplay',
      expeditionId: pin.expedition_id,
    }, source === 'android_auto' ? 'android_auto' : 'carplay');
  } catch {}
}

function _handleEmergencyComms(): void {
  console.log('[VehicleCompanionManager] Emergency comms activated');
  // Emergency comms are handled by the emergency system
}

// ── Full Sync ───────────────────────────────────────────────

/**
 * Perform a full synchronization of all data sources.
 */
function _fullSync(): void {
  _syncMode();
  _syncExpedition();
  _syncRoute();
  _syncBreadcrumb();
  _syncLocation();
  _syncConnectivity();
  _syncWeather();
  _syncWaypoints();
}

// ── Store Change Handlers ───────────────────────────────────

function _onDisplayStoreChange(): void {
  if (!_isRunning) return;
  // The display store changed — sync mode to session state
  _syncMode();
}

function _onModeEngineChange(): void {
  if (!_isRunning) return;
  _syncMode();
}

function _onBreadcrumbChange(): void {
  if (!_isRunning) return;
  _syncBreadcrumb();
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

export const vehicleCompanionManager = {
  /**
   * Whether the companion manager is running.
   */
  isRunning(): boolean {
    return _isRunning;
  },

  /**
   * Get the current configuration.
   */
  getConfig(): CompanionManagerConfig {
    return { ..._config };
  },

  /**
   * Update configuration.
   */
  updateConfig(partial: Partial<CompanionManagerConfig>): void {
    _config = { ..._config, ...partial };
  },

  /**
   * Start the companion manager.
   *
   * This begins:
   *   - Subscribing to all relevant ECS stores
   *   - Periodic sync timer
   *   - Companion connection monitoring
   *   - Action dispatch routing
   */
  start(): void {
    if (_isRunning) return;
    _isRunning = true;

    console.log('[VehicleCompanionManager] Starting companion manager');

    // Subscribe to ECS stores for reactive updates
    _displayStoreUnsub = vehicleDisplayStore.subscribe(_onDisplayStoreChange);
    _modeEngineUnsub = vehicleDisplayModeEngine.subscribe(_onModeEngineChange);
    _breadcrumbUnsub = breadcrumbTracker.subscribe(_onBreadcrumbChange);

    // Perform initial full sync
    _fullSync();

    // Start periodic sync timer
    _syncTimer = setInterval(() => {
      _fullSync();
    }, _config.syncIntervalMs);
  },

  /**
   * Stop the companion manager.
   */
  stop(): void {
    if (!_isRunning) return;
    _isRunning = false;

    console.log('[VehicleCompanionManager] Stopping companion manager');

    // Stop sync timer
    if (_syncTimer) {
      clearInterval(_syncTimer);
      _syncTimer = null;
    }

    // Stop grace timer
    if (_graceTimer) {
      clearTimeout(_graceTimer);
      _graceTimer = null;
    }

    // Unsubscribe from stores
    if (_displayStoreUnsub) {
      _displayStoreUnsub();
      _displayStoreUnsub = null;
    }
    if (_modeEngineUnsub) {
      _modeEngineUnsub();
      _modeEngineUnsub = null;
    }
    if (_breadcrumbUnsub) {
      _breadcrumbUnsub();
      _breadcrumbUnsub = null;
    }
    if (_sessionStateUnsub) {
      _sessionStateUnsub();
      _sessionStateUnsub = null;
    }
  },

  /**
   * Notify the manager that a companion has connected.
   * Called by the Android Auto or CarPlay bridge.
   */
  onCompanionConnected(platform: CompanionPlatform): void {
    _onCompanionConnected(platform);
  },

  /**
   * Notify the manager that a companion has disconnected.
   * Called by the Android Auto or CarPlay bridge.
   */
  onCompanionDisconnected(): void {
    _onCompanionDisconnected();
  },

  /**
   * Handle an action dispatched from a vehicle display.
   * Called by the Android Auto or CarPlay bridge when an action is polled.
   */
  handleAction(actionType: VehicleActionType, source: CompanionPlatform): void {
    _handleVehicleAction(actionType, source);
  },

  /**
   * Get the restore payload for a reconnecting companion.
   */
  getRestorePayload(): CompanionRestorePayload {
    return vehicleSessionState.buildRestorePayload();
  },

  /**
   * Force a full sync of all data sources.
   * Useful after significant state changes.
   */
  forceSync(): void {
    _fullSync();
  },

  /**
   * Get the shared session state.
   * Convenience accessor for the vehicleSessionState.
   */
  getSessionState() {
    return vehicleSessionState.get();
  },

  /**
   * Reset the companion manager and session state.
   */
  reset(): void {
    vehicleCompanionManager.stop();
    vehicleSessionState.reset();
    _lastSyncedMode = null;
    _lastSyncedExpeditionId = null;
    _lastSyncedRouteId = null;
    _lastBreadcrumbPointCount = 0;
    _lastCompanionConnected = false;
    _notify();
    console.log('[VehicleCompanionManager] Companion manager reset');
  },

  /**
   * Subscribe to companion manager state changes.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },

  /**
   * Get debug info.
   */
  getDebugInfo(): Record<string, unknown> {
    return {
      isRunning: _isRunning,
      config: _config,
      sessionState: vehicleSessionState.getDebugInfo(),
      lastSyncedMode: _lastSyncedMode,
      lastSyncedExpeditionId: _lastSyncedExpeditionId,
      lastSyncedRouteId: _lastSyncedRouteId,
      lastBreadcrumbPointCount: _lastBreadcrumbPointCount,
      lastCompanionConnected: _lastCompanionConnected,
    };
  },
};

