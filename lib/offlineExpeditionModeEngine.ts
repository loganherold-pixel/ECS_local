/**
 * ═══════════════════════════════════════════════════════════
 * ECS OFFLINE EXPEDITION MODE ENGINE
 * ═══════════════════════════════════════════════════════════
 *
 * Core engine that makes ECS reliable and useful even when users
 * lose cellular service or operate in fully remote environments.
 *
 * Responsibilities:
 *   1. Unified connectivity state management (Online/Limited/Offline/Reconnecting)
 *   2. Expedition pack creation, download, and management
 *   3. Dashboard system offline behavior profiles
 *   4. Offline intelligence message generation (calm, tactical)
 *   5. Sync and reconnect coordination
 *   6. Local data persistence and recovery
 *   7. Stale data detection and labeling
 *
 * Design Principles:
 *   - Offline mode should feel professional, not broken
 *   - Avoid panic-style alerts or constant reconnect banners
 *   - Use clear state labels and minimal warnings
 *   - High trust behavior with stable dashboard presentation
 *   - Clean stale-data indicators
 *   - Smooth state transitions (hysteresis/debounce)
 *   - Message cooldowns prevent spamming
 *
 * Data Sources:
 *   - connectivity.ts: Raw connectivity status
 *   - ecsOfflineInterlock.ts: Data source mode
 *   - offlineExpeditionDbStore.ts: Offline expedition data
 *   - expeditionStateStore.ts: Active expedition state
 *   - routeStore: Active route data
 *   - vehicleStore: Vehicle profile
 *   - weatherStore: Cached weather
 *   - telemetryStore: Vehicle telemetry
 *   - remotenessStore: Remoteness data
 *   - expeditionRiskStore: Risk assessment
 */

import { Platform } from 'react-native';
import { ecsLog } from './ecsLogger';
import { createPersistedKeyValueCache } from './keyValuePersistence';
import type {
  OfflineConnectivityState,
  OfflineExpeditionModeState,
  OfflineExpeditionModeSession,
  ExpeditionPack,
  SystemOfflineProfile,
  OfflineIntelMessage,
  SyncState,
} from './offlineExpeditionModeTypes';
import {
  CONNECTIVITY_STATE_DISPLAY,
  DASHBOARD_SYSTEM_DEFAULTS,
  MESSAGE_COOLDOWNS,
  OFFLINE_MODE_SESSION_VERSION,
  createDefaultOfflineModeState,
  createDefaultSyncState,
} from './offlineExpeditionModeTypes';


// ── Constants ────────────────────────────────────────────

const TAG = '[OFFLINE_MODE]';
const STORAGE_KEY = 'ecs_offline_expedition_mode_session';
const OFFLINE_MODE_KEY = 'ecs_offline_mode';
const runtimeFlagsCache = createPersistedKeyValueCache('ecs_runtime_flags');

function debugOfflineMode(message: string, details?: Record<string, unknown>): void {
  ecsLog.debug('SYSTEM', message, details);
}

/** State transition debounce (prevents flicker) */
const STATE_DEBOUNCE_MS = 3_000;
const LIMITED_STATE_DEBOUNCE_MS = 12_000;
const RECONNECTING_STATE_DEBOUNCE_MS = 8_000;
const OFFLINE_STATE_DEBOUNCE_MS = 2_000;
const RECOVERY_TO_ONLINE_SETTLE_MS = 2_500;
const TRANSIENT_SUPPRESSION_LOG_MS = 30_000;

/** Evaluation interval */
const EVAL_INTERVAL_MS = 15_000;

/** Maximum messages to keep active */
const MAX_ACTIVE_MESSAGES = 6;

/** Reconnecting state timeout (max time in reconnecting before falling back) */
const RECONNECTING_TIMEOUT_MS = 30_000;


// ── Storage Helpers ──────────────────────────────────────

const _mem: Record<string, string> = {};
const _ls = {
  get: (k: string): string | null => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        return localStorage.getItem(k);
      }
    } catch {}
    return _mem[k] || null;
  },
  set: (k: string, v: string) => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(k, v);
      }
    } catch {}
    _mem[k] = v;
  },
};


// ── Internal State ───────────────────────────────────────

let _state: OfflineExpeditionModeState = createDefaultOfflineModeState();
let _pendingState: OfflineConnectivityState | null = null;
let _pendingStateTimestamp = 0;
let _lastSuppressedTransitionLogAt = 0;
let _reconnectingTimer: ReturnType<typeof setTimeout> | null = null;
let _evalTimer: ReturnType<typeof setInterval> | null = null;
let _storeUnsubs: (() => void)[] = [];

/** Listeners */
type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify(): void {
  _state.evaluated_at = new Date().toISOString();
  _listeners.forEach(fn => { try { fn(); } catch {} });
}


// ── UUID Helper ──────────────────────────────────────────

function _uuid(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}


// ══════════════════════════════════════════════════════════
// CONNECTIVITY STATE MANAGEMENT
// ══════════════════════════════════════════════════════════

/**
 * Read raw connectivity state from ECS systems.
 */
function _readRawConnectivity(): OfflineConnectivityState {
  try {
    const { connectivity } = require('./connectivity');
    const status = connectivity.status;
    const level = connectivity.getLevel();

    if (status === 'reconnecting') return 'reconnecting';
    if (status === 'offline' || level === 'no_service') return 'offline';
    if (level === 'limited') return 'limited';
    if (level === 'normal') return 'online';
    return 'online';
  } catch {
    return 'online';
  }
}

function _readConnectivityReason(): Record<string, unknown> {
  const reason: Record<string, unknown> = {
    source: 'network_transport',
    userForcedOfflineMode: false,
    realtimeSyncUnavailable: false,
    tileCacheServiceUnavailable: false,
  };

  try {
    reason.userForcedOfflineMode = runtimeFlagsCache.get(OFFLINE_MODE_KEY) === 'true';
  } catch {}

  try {
    const { connectivity } = require('./connectivity');
    reason.connectivityStatus = connectivity.status;
    reason.connectivityLevel = connectivity.getLevel();
    reason.internetReachable = connectivity.isInternetReachable;
    reason.networkType = connectivity.getNetworkType?.() ?? 'unknown';
  } catch {}

  try {
    const { realtimeSync } = require('./realtimeSync');
    const realtimeState = realtimeSync?.stats;
    reason.realtimeStatus = realtimeState?.status ?? 'unknown';
    reason.realtimeFailureReason = realtimeState?.lastFailureReason ?? null;
    reason.realtimeSyncUnavailable =
      realtimeState?.status === 'degraded' ||
      realtimeState?.status === 'timed_out' ||
      realtimeState?.status === 'retrying';
  } catch {}

  try {
    const { tileCacheStore } = require('./tileCacheStore');
    const stats = tileCacheStore?.getStats?.();
    reason.tileCacheServiceUnavailable = false;
    reason.cachedTileRegions = stats?.totalRegions ?? null;
  } catch {
    reason.tileCacheServiceUnavailable = true;
  }

  return reason;
}

function _getDebounceWindowMs(
  rawState: OfflineConnectivityState,
  currentState: OfflineConnectivityState,
): number {
  if (rawState === 'limited') return LIMITED_STATE_DEBOUNCE_MS;
  if (rawState === 'reconnecting') return RECONNECTING_STATE_DEBOUNCE_MS;
  if (rawState === 'offline') return OFFLINE_STATE_DEBOUNCE_MS;
  if (rawState === 'online' && currentState === 'limited') return RECOVERY_TO_ONLINE_SETTLE_MS;
  return STATE_DEBOUNCE_MS;
}

function _logSuppressedTransient(
  rawState: OfflineConnectivityState,
  currentState: OfflineConnectivityState,
  debounceWindowMs: number,
): void {
  const now = Date.now();
  if (now - _lastSuppressedTransitionLogAt < TRANSIENT_SUPPRESSION_LOG_MS) return;
  _lastSuppressedTransitionLogAt = now;
  debugOfflineMode('Offline mode transient state held for hysteresis', {
    currentState,
    rawState,
    debounceWindowMs,
    ..._readConnectivityReason(),
  });
}

/**
 * Apply debounce/hysteresis to state transitions.
 * Prevents rapid flicker between states.
 * Exception: recovery from a true offline state may briefly show reconnecting,
 * but recovery from a limited transient settles directly back to online.
 */
function _debounceState(rawState: OfflineConnectivityState): OfflineConnectivityState {
  const now = Date.now();
  const currentState = _state.connectivity_state;

  // Recovery from limited is common during short reachability checks. Do not
  // surface an extra reconnecting phase; settle back to online after a small
  // confirmation window.
  if (rawState === 'online' && currentState === 'limited') {
    if (_pendingState !== 'online') {
      _pendingState = 'online';
      _pendingStateTimestamp = now;
      _logSuppressedTransient(rawState, currentState, RECOVERY_TO_ONLINE_SETTLE_MS);
      return currentState;
    }

    if ((now - _pendingStateTimestamp) >= RECOVERY_TO_ONLINE_SETTLE_MS) {
      _pendingState = null;
      _pendingStateTimestamp = 0;
      return 'online';
    }

    return currentState;
  }

  // Recovery from offline can show a brief reconnecting state, but only after
  // the online signal has persisted long enough to avoid navigation-time flaps.
  if (rawState === 'online' && currentState !== 'online') {
    if (currentState === 'offline') {
      if (_pendingState !== 'online') {
        _pendingState = 'online';
        _pendingStateTimestamp = now;
        _logSuppressedTransient(rawState, currentState, RECOVERY_TO_ONLINE_SETTLE_MS);
        return currentState;
      }

      if ((now - _pendingStateTimestamp) < RECOVERY_TO_ONLINE_SETTLE_MS) {
        return currentState;
      }

      _pendingState = 'online';
      _pendingStateTimestamp = now;
      return 'reconnecting';
    }

    _pendingState = null;
    _pendingStateTimestamp = 0;
    return rawState;
  }

  // Same as current — clear pending
  if (rawState === currentState) {
    _pendingState = null;
    _pendingStateTimestamp = 0;
    return currentState;
  }

  // New pending state
  if (_pendingState !== rawState) {
    _pendingState = rawState;
    _pendingStateTimestamp = now;
    _logSuppressedTransient(rawState, currentState, _getDebounceWindowMs(rawState, currentState));
    return currentState; // Hold current
  }

  // Same pending — check debounce window
  const debounceWindowMs = _getDebounceWindowMs(rawState, currentState);
  if ((now - _pendingStateTimestamp) >= debounceWindowMs) {
    _pendingState = null;
    _pendingStateTimestamp = 0;
    return rawState;
  }

  return currentState; // Still within debounce
}

/**
 * Apply the connectivity state transition.
 */
function _applyStateTransition(newState: OfflineConnectivityState): void {
  const oldState = _state.connectivity_state;
  if (oldState === newState) return;

  _state.previous_state = oldState;
  _state.connectivity_state = newState;
  _state.state_changed_at = new Date().toISOString();
  _state.in_transition = true;

  // Clear transition flag after settling
  setTimeout(() => {
    _state.in_transition = false;
    _notify();
  }, 5_000);

  // Handle reconnecting timeout
  if (newState === 'reconnecting') {
    if (_reconnectingTimer) clearTimeout(_reconnectingTimer);
    _reconnectingTimer = setTimeout(() => {
      // If still reconnecting after timeout, check actual state
      const actual = _readRawConnectivity();
      if (actual === 'online') {
        _applyStateTransition('online');
      } else {
        _applyStateTransition(actual);
      }
    }, RECONNECTING_TIMEOUT_MS);
  } else if (_reconnectingTimer) {
    clearTimeout(_reconnectingTimer);
    _reconnectingTimer = null;
  }

  // Generate intelligence messages for state transitions
  _generateTransitionMessages(oldState, newState);

  // Trigger sync on reconnect
  if (newState === 'online' && (oldState === 'offline' || oldState === 'reconnecting')) {
    _triggerReconnectSync();
  }

  const transitionDetails = {
    previousState: oldState,
    ..._readConnectivityReason(),
  };

  if (newState === 'offline') {
    ecsLog.warn('SYSTEM', `Offline mode state changed to ${newState}`, {
      ...transitionDetails,
    });
  } else if (newState === 'limited' || newState === 'reconnecting') {
    debugOfflineMode(`Offline mode state changed to ${newState}`, transitionDetails);
  } else {
    debugOfflineMode('Offline mode state changed', {
      nextState: newState,
      ...transitionDetails,
    });
  }
  _notify();
}


// ══════════════════════════════════════════════════════════
// DASHBOARD SYSTEM PROFILES
// ══════════════════════════════════════════════════════════

/**
 * Evaluate offline behavior profiles for all dashboard systems.
 */
function _evaluateSystemProfiles(): SystemOfflineProfile[] {
  const profiles: SystemOfflineProfile[] = [];
  const now = Date.now();
  const isOffline = _state.connectivity_state === 'offline';
  const isLimited = _state.connectivity_state === 'limited';

  for (const [systemId, defaults] of Object.entries(DASHBOARD_SYSTEM_DEFAULTS)) {
    let behavior = defaults.default_behavior;
    let hasCachedData = false;
    let lastUpdated: string | null = null;
    let isStale = false;
    let stalenessLabel: string | null = null;
    let statusMessage = '';

    // Check system-specific data availability
    try {
      switch (systemId) {
        case 'gps_position': {
          const { gpsUIState } = require('./gpsUIState');
          const gps = gpsUIState.get();
          hasCachedData = gps.hasFix;
          lastUpdated = gps.position?.timestamp ?? null;
          behavior = 'fully_available';
          statusMessage = gps.hasFix ? 'GPS active' : 'Acquiring GPS fix';
          break;
        }
        case 'vehicle_telemetry': {
          try {
            const { VehicleTelemetryStore } = require('../src/vehicle-telemetry/VehicleTelemetryStore');
            const telem = VehicleTelemetryStore;
            hasCachedData = telem?.isConnected?.() ?? false;
            behavior = hasCachedData ? 'fully_available' : (isOffline ? 'last_known' : 'unavailable');
            statusMessage = hasCachedData ? 'OBD active via Bluetooth' : 'OBD not connected';
          } catch {
            behavior = isOffline ? 'last_known' : 'unavailable';
            statusMessage = 'Telemetry unavailable';
          }
          break;
        }
        case 'power_system': {
          try {
            const { PowerDeviceStore } = require('../src/power/devices/PowerDeviceStore');
            const hasDevices = (PowerDeviceStore?.getDevices?.()?.length ?? 0) > 0;
            hasCachedData = hasDevices;
            behavior = hasDevices ? 'fully_available' : (isOffline ? 'last_known' : 'unavailable');
            statusMessage = hasDevices ? 'Power monitoring active' : (isOffline ? 'Last known values' : 'No devices connected');
          } catch {
            behavior = isOffline ? 'last_known' : 'unavailable';
            statusMessage = isOffline ? 'Last known power data' : 'Power system unavailable';
          }
          break;
        }
        case 'weather': {
          behavior = isOffline ? 'last_known' : 'fully_available';
          statusMessage = isOffline ? 'Weather cache unavailable' : 'Live weather available when refreshed';
          try {
            const { getAnyCachedWeather, getWeatherStaleness } = require('./weatherStore');
            const { gpsUIState } = require('./gpsUIState');
            const gps = gpsUIState.get?.();
            const coordinates = gps?.hasFix && gps?.position
              ? [{ lat: gps.position.latitude, lng: gps.position.longitude, label: 'Current Position' }]
              : [];
            const cached = getAnyCachedWeather?.(coordinates);
            hasCachedData = !!cached;
            const staleness = cached?.cachedAt ? getWeatherStaleness?.(cached.cachedAt) : null;
            if (staleness === 'stale' || staleness === 'very_stale') {
              isStale = true;
              stalenessLabel = staleness === 'very_stale'
                ? 'Weather cache is very stale'
                : 'Weather cache is stale';
            }
            if (cached?.cachedAt) {
              lastUpdated = new Date(cached.cachedAt).toISOString();
            }
          } catch {
            hasCachedData = false;
          }
          if (isOffline) {
            statusMessage = hasCachedData
              ? isStale ? 'Cached weather - stale' : 'Cached weather - last known'
              : 'Weather cache unavailable';
          }
          break;
        }
        case 'remoteness': {
          try {
            const { remotenessStore } = require('./remotenessStore');
            const rem = remotenessStore.get();
            hasCachedData = rem && rem.score > 0;
            lastUpdated = rem?.updatedAt ?? null;
            behavior = hasCachedData ? 'cached_data' : 'degraded';
            statusMessage = hasCachedData
              ? (isOffline ? 'Using cached remoteness data' : 'Remoteness active')
              : 'Remoteness data unavailable';
          } catch {
            behavior = 'degraded';
            statusMessage = 'Remoteness unavailable';
          }
          break;
        }
        case 'expedition_risk': {
          behavior = isOffline ? 'degraded' : 'fully_available';
          statusMessage = isOffline
            ? 'Risk assessment using local data'
            : 'Risk engine active';
          break;
        }
        case 'route_navigation': {
          try {
            const { routeStore } = require('./routeStore');
            const route = routeStore.getActive();
            hasCachedData = route != null;
            behavior = hasCachedData ? 'cached_data' : 'unavailable';
            statusMessage = hasCachedData
              ? 'Saved route geometry loaded; map cache not confirmed'
              : 'No route loaded';
          } catch {
            behavior = 'unavailable';
            statusMessage = 'Route unavailable';
          }
          break;
        }
        case 'loadout':
        case 'vehicle_config': {
          behavior = 'local_only';
          hasCachedData = true;
          statusMessage = 'Available offline';
          break;
        }
        case 'dispatch':
        case 'ai_advisory': {
          behavior = isOffline ? 'unavailable' : 'fully_available';
          statusMessage = isOffline ? 'Requires connectivity' : 'Available';
          break;
        }
        default: {
          behavior = isOffline ? defaults.default_behavior : 'fully_available';
          statusMessage = isOffline ? 'Limited offline' : 'Available';
        }
      }
    } catch {
      // Graceful fallback
      behavior = defaults.default_behavior;
      statusMessage = 'Status unknown';
    }

    // Check staleness
    if (lastUpdated && defaults.stale_threshold_minutes > 0) {
      const ageMs = now - new Date(lastUpdated).getTime();
      const thresholdMs = defaults.stale_threshold_minutes * 60_000;
      if (ageMs > thresholdMs) {
        isStale = true;
        const ageMin = Math.round(ageMs / 60_000);
        stalenessLabel = ageMin < 60
          ? `Updated ${ageMin}m ago`
          : `Updated ${Math.round(ageMin / 60)}h ago`;
      }
    }

    profiles.push({
      system_id: systemId,
      name: defaults.name,
      behavior,
      uses_local_telemetry: defaults.uses_local_telemetry,
      has_cached_data: hasCachedData,
      last_updated: lastUpdated,
      staleness_label: stalenessLabel,
      is_stale: isStale,
      status_message: statusMessage,
    });
  }

  return profiles;
}


// ══════════════════════════════════════════════════════════
// INTELLIGENCE MESSAGE GENERATION
// ══════════════════════════════════════════════════════════

/**
 * Generate intelligence messages for state transitions.
 * Uses cooldowns to prevent spamming.
 */
function _generateTransitionMessages(
  oldState: OfflineConnectivityState,
  newState: OfflineConnectivityState,
): void {
  const now = Date.now();

  // Check cooldown
  const cooldownKey = `connectivity_${oldState}_${newState}`;
  const lastShown = _state.message_history[cooldownKey] || 0;
  if (now - lastShown < MESSAGE_COOLDOWNS.connectivity_change) return;

  const messages: OfflineIntelMessage[] = [];

  if (newState === 'offline') {
    messages.push({
      key: 'offline_mode_active',
      message: 'Offline mode active — using saved expedition data',
      category: 'connectivity',
      severity: 'info',
      icon: 'cloud-offline-outline',
      color: '#78909C',
      timestamp: new Date().toISOString(),
      shown: false,
      cooldown_ms: MESSAGE_COOLDOWNS.connectivity_change,
    });

    // Check if we have offline data
    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      const readiness = offlineExpeditionDbStore.evaluateReadiness();
      if (readiness.has_offline_data) {
        messages.push({
          key: 'offline_data_available',
          message: `${readiness.downloaded_regions} cached region${readiness.downloaded_regions !== 1 ? 's' : ''} available offline`,
          category: 'data',
          severity: 'info',
          icon: 'folder-outline',
          color: '#4CAF50',
          timestamp: new Date().toISOString(),
          shown: false,
          cooldown_ms: MESSAGE_COOLDOWNS.data_staleness,
        });
      } else {
        messages.push({
          key: 'no_offline_data',
          message: 'No cached expedition data — download regions when connected',
          category: 'data',
          severity: 'advisory',
          icon: 'download-outline',
          color: '#FFB300',
          timestamp: new Date().toISOString(),
          shown: false,
          cooldown_ms: MESSAGE_COOLDOWNS.data_staleness,
        });
      }
    } catch {}

    // Check route availability
    try {
      const { routeStore } = require('./routeStore');
      if (routeStore.getActive()) {
        messages.push({
          key: 'route_available_offline',
          message: 'Route remains available locally',
          category: 'navigation',
          severity: 'info',
          icon: 'navigate-outline',
          color: '#42A5F5',
          timestamp: new Date().toISOString(),
          shown: false,
          cooldown_ms: MESSAGE_COOLDOWNS.navigation_info,
        });
      }
    } catch {}
  }

  if (newState === 'limited') {
    messages.push({
      key: 'limited_connectivity',
      message: 'Limited connectivity — using cached data as fallback',
      category: 'connectivity',
      severity: 'advisory',
      icon: 'cellular-outline',
      color: '#FFB300',
      timestamp: new Date().toISOString(),
      shown: false,
      cooldown_ms: MESSAGE_COOLDOWNS.connectivity_change,
    });
  }

  if (newState === 'reconnecting') {
    messages.push({
      key: 'reconnecting',
      message: 'Signal recovering - syncing saved data',
      category: 'connectivity',
      severity: 'info',
      icon: 'sync-outline',
      color: '#42A5F5',
      timestamp: new Date().toISOString(),
      shown: false,
      cooldown_ms: MESSAGE_COOLDOWNS.connectivity_change,
    });
  }

  if (newState === 'online' && (oldState === 'offline' || oldState === 'reconnecting')) {
    messages.push({
      key: 'back_online',
      message: 'Back online - refreshing live services',
      category: 'connectivity',
      severity: 'info',
      icon: 'wifi-outline',
      color: '#4CAF50',
      timestamp: new Date().toISOString(),
      shown: false,
      cooldown_ms: MESSAGE_COOLDOWNS.connectivity_change,
    });
  }

  // Add messages and update cooldowns
  for (const msg of messages) {
    _addMessage(msg);
  }
  _state.message_history[cooldownKey] = now;
}

/**
 * Generate periodic intelligence messages based on current state.
 */
function _generatePeriodicMessages(): void {
  const now = Date.now();
  const isOffline = _state.connectivity_state === 'offline';
  const isLimited = _state.connectivity_state === 'limited';

  if (!isOffline && !isLimited) return;

  // Check weather staleness
  const weatherKey = 'weather_unavailable_offline';
  const weatherLastShown = _state.message_history[weatherKey] || 0;
  if (isOffline && (now - weatherLastShown) > MESSAGE_COOLDOWNS.data_staleness) {
    _addMessage({
      key: weatherKey,
      message: 'Live weather unavailable offline',
      category: 'data',
      severity: 'info',
      icon: 'partly-sunny-outline',
      color: '#78909C',
      timestamp: new Date().toISOString(),
      shown: false,
      cooldown_ms: MESSAGE_COOLDOWNS.data_staleness,
    });
    _state.message_history[weatherKey] = now;
  }

  // Check OBD telemetry
  try {
    const obdKey = 'obd_local_active';
    const obdLastShown = _state.message_history[obdKey] || 0;
    if (isOffline && (now - obdLastShown) > MESSAGE_COOLDOWNS.system_status) {
      // Check if OBD is connected locally
      const profile = _state.system_profiles.find(p => p.system_id === 'vehicle_telemetry');
      if (profile?.behavior === 'fully_available') {
        _addMessage({
          key: obdKey,
          message: 'OBD telemetry active locally via Bluetooth',
          category: 'system',
          severity: 'info',
          icon: 'bluetooth-outline',
          color: '#4CAF50',
          timestamp: new Date().toISOString(),
          shown: false,
          cooldown_ms: MESSAGE_COOLDOWNS.system_status,
        });
        _state.message_history[obdKey] = now;
      }
    }
  } catch {}

  // Check remoteness
  try {
    const remKey = 'remoteness_elevated_offline';
    const remLastShown = _state.message_history[remKey] || 0;
    if (isOffline && (now - remLastShown) > MESSAGE_COOLDOWNS.navigation_info) {
      const { remotenessStore } = require('./remotenessStore');
      const rem = remotenessStore.get();
      if (rem && rem.score > 50) {
        _addMessage({
          key: remKey,
          message: 'Remoteness remains elevated — plan accordingly',
          category: 'navigation',
          severity: 'advisory',
          icon: 'compass-outline',
          color: '#E67E22',
          timestamp: new Date().toISOString(),
          shown: false,
          cooldown_ms: MESSAGE_COOLDOWNS.navigation_info,
        });
        _state.message_history[remKey] = now;
      }
    }
  } catch {}
}

/**
 * Add a message to the active messages list.
 * Enforces max message limit and deduplication.
 */
function _addMessage(msg: OfflineIntelMessage): void {
  // Deduplicate by key
  const existing = _state.messages.findIndex(m => m.key === msg.key);
  if (existing >= 0) {
    _state.messages[existing] = msg;
  } else {
    _state.messages.push(msg);
  }

  // Trim to max
  if (_state.messages.length > MAX_ACTIVE_MESSAGES) {
    _state.messages = _state.messages.slice(-MAX_ACTIVE_MESSAGES);
  }
}


// ══════════════════════════════════════════════════════════
// EXPEDITION PACK MANAGEMENT
// ══════════════════════════════════════════════════════════

/**
 * Create an expedition pack from the current expedition and route.
 */
function _createExpeditionPack(params: {
  name?: string;
  expedition_id?: string;
  route_id?: string;
}): ExpeditionPack | null {
  try {
    const pack: ExpeditionPack = {
      id: _uuid(),
      name: params.name || 'Expedition Pack',
      expedition_id: params.expedition_id || null,
      route_id: params.route_id || null,
      vehicle_id: null,
      vehicle_name: null,
      route_geometry: [],
      route_distance_mi: null,
      route_elevation_gain_ft: null,
      waypoints: [],
      map_bounds: null,
      map_tiles_cached: false,
      offline_region_id: null,
      notes: '',
      checkpoints: [],
      vehicle_context: null,
      remoteness_summary: null,
      risk_summary: null,
      start_fuel_pct: null,
      start_water_gal: null,
      start_power_pct: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      size_kb: 0,
      version: 1,
    };

    // Populate route data
    try {
      const { routeStore } = require('./routeStore');
      const route = routeStore.getActive();
      if (route) {
        pack.route_id = route.id;
        pack.route_distance_mi = route.total_distance_mi ?? null;
        pack.route_elevation_gain_ft = route.elevation_gain_ft ?? null;

        // Extract geometry
        if (route.segments) {
          for (const seg of route.segments) {
            for (const pt of (seg.points || [])) {
              pack.route_geometry.push({
                lat: pt.lat,
                lng: pt.lon ?? pt.lng,
                ele: pt.ele,
              });
            }
          }
        }

        // Extract waypoints
        if (route.waypoints) {
          pack.waypoints = route.waypoints.map((wp: any) => ({
            id: wp.id || _uuid(),
            name: wp.name || 'Waypoint',
            lat: wp.lat,
            lng: wp.lon ?? wp.lng,
            type: wp.type || 'waypoint',
            notes: wp.notes,
          }));
        }

        // Compute map bounds from route geometry
        if (pack.route_geometry.length > 0) {
          let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
          for (const pt of pack.route_geometry) {
            minLat = Math.min(minLat, pt.lat);
            maxLat = Math.max(maxLat, pt.lat);
            minLng = Math.min(minLng, pt.lng);
            maxLng = Math.max(maxLng, pt.lng);
          }
          // Add padding (0.05 degrees ~ 3.5 miles)
          pack.map_bounds = {
            min_lat: minLat - 0.05,
            max_lat: maxLat + 0.05,
            min_lng: minLng - 0.05,
            max_lng: maxLng + 0.05,
          };
        }
      }
    } catch {}

    // Populate vehicle context
    try {
      const { vehicleStore } = require('./vehicleStore');
      const vehicle = vehicleStore.getActive();
      if (vehicle) {
        pack.vehicle_id = vehicle.id;
        pack.vehicle_name = vehicle.name;
        pack.vehicle_context = {
          vehicle_type: vehicle.vehicle_type || null,
          drivetrain: vehicle.drivetrain || null,
          tire_size: vehicle.tire_size || null,
          gvwr_lb: vehicle.gvwr_lb || null,
          build_weight_lb: vehicle.build_weight_lb || null,
          capability_tier: vehicle.capability_tier || null,
        };
      }
    } catch {}

    // Populate remoteness summary
    try {
      const { remotenessStore } = require('./remotenessStore');
      const rem = remotenessStore.get();
      if (rem && rem.score > 0) {
        pack.remoteness_summary = {
          avg_score: rem.score,
          max_score: rem.score,
          tier: rem.tier,
        };
      }
    } catch {}

    // Populate risk summary
    try {
      const { expeditionRiskStore } = require('./expeditionRiskStore');
      const risk = expeditionRiskStore.getSummary();
      if (risk) {
        pack.risk_summary = {
          level: risk.operational_status,
          score: risk.risk_score,
          primary_factor: risk.primary_risk_label,
        };
      }
    } catch {}

    // Check offline map coverage
    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      if (pack.route_geometry.length > 0) {
        const samplePoints = pack.route_geometry
          .filter((_, i) => i % 10 === 0)
          .map(pt => ({ lat: pt.lat, lng: pt.lng }));
        pack.map_tiles_cached = offlineExpeditionDbStore.coversRoute(samplePoints);
      }

      // Link to offline region if available
      const regions = offlineExpeditionDbStore.getDownloadedRegions();
      if (regions.length > 0 && pack.map_bounds) {
        for (const region of regions) {
          const rb = region.geographic_bounds;
          if (
            rb.min_lat <= pack.map_bounds.min_lat &&
            rb.max_lat >= pack.map_bounds.max_lat &&
            rb.min_lng <= pack.map_bounds.min_lng &&
            rb.max_lng >= pack.map_bounds.max_lng
          ) {
            pack.offline_region_id = region.region_id;
            break;
          }
        }
      }
    } catch {}

    // Estimate size
    pack.size_kb = Math.round(JSON.stringify(pack).length / 1024);

    return pack;
  } catch (e) {
    console.warn(`${TAG} Failed to create expedition pack:`, e);
    return null;
  }
}


// ══════════════════════════════════════════════════════════
// SYNC / RECONNECT
// ══════════════════════════════════════════════════════════

/**
 * Trigger sync operations when connectivity is restored.
 */
function _triggerReconnectSync(): void {
  _state.sync_state = {
    syncing: true,
    pending_count: 0,
    synced_count: 0,
    failed_count: 0,
    has_offline_edits: false,
    last_sync_at: null,
    status_message: 'Syncing...',
    sync_complete: false,
  };
  _notify();

  // Perform sync operations
  setTimeout(async () => {
    let syncedCount = 0;
    let failedCount = 0;

    // 1. Sync offline queue
    try {
      const { offlineQueue } = require('./offlineQueue');
      const pending = offlineQueue?.getPendingCount?.() ?? 0;
      _state.sync_state.pending_count += pending;
      if (pending > 0) {
        await offlineQueue.processQueue();
        syncedCount += pending;
      }
    } catch {
      failedCount++;
    }

    // 2. Sync expedition state
    try {
      const { expeditionStateStore } = require('./expeditionStateStore');
      const expedition = expeditionStateStore.getCurrentExpedition();
      if (expedition && expedition.state === 'active') {
        // Expedition data will auto-sync via its own cloud sync
        syncedCount++;
      }
    } catch {}

    // 3. Refresh stale network-based systems
    try {
      const { connectivityIntelService } = require('./connectivityIntelService');
      connectivityIntelService.invalidateCache?.();
    } catch {}

    // Update sync state
    _state.sync_state = {
      syncing: false,
      pending_count: 0,
      synced_count: syncedCount,
      failed_count: failedCount,
      has_offline_edits: false,
      last_sync_at: new Date().toISOString(),
      status_message: failedCount > 0
        ? `Synced ${syncedCount} items, ${failedCount} failed`
        : syncedCount > 0
          ? `Synced ${syncedCount} items`
          : 'Sync complete',
      sync_complete: true,
    };
    _notify();

  debugOfflineMode('Offline mode reconnect sync completed', {
    failedCount,
    syncedCount,
  });
  }, 1000);
}


// ══════════════════════════════════════════════════════════
// CORE EVALUATION
// ══════════════════════════════════════════════════════════

function _evaluate(): void {
  try {
    // 1. Read and debounce connectivity state
    const rawState = _readRawConnectivity();
    const debouncedState = _debounceState(rawState);

    if (debouncedState !== _state.connectivity_state) {
      _applyStateTransition(debouncedState);
    }

    // 2. Evaluate system profiles
    _state.system_profiles = _evaluateSystemProfiles();

    // 3. Generate periodic intelligence messages
    _generatePeriodicMessages();

    // 4. Update offline data coverage
    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      const readiness = offlineExpeditionDbStore.evaluateReadiness();
      _state.covers_position = readiness.covers_current_position;
      _state.covers_route = readiness.covers_active_route;
      _state.total_offline_data_mb = readiness.storage_mb;
    } catch {}

    _notify();
  } catch (e) {
    console.warn(`${TAG} Evaluation error:`, e);
  }
}


// ══════════════════════════════════════════════════════════
// PERSISTENCE
// ══════════════════════════════════════════════════════════

function _persist(): void {
  try {
    const session: OfflineExpeditionModeSession = {
      version: OFFLINE_MODE_SESSION_VERSION,
      packs: _state.packs,
      active_pack_id: _state.active_pack_id,
      message_history: _state.message_history,
      last_sync_at: _state.sync_state.last_sync_at,
      persisted_at: new Date().toISOString(),
    };
    _ls.set(STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn(`${TAG} Failed to persist session:`, e);
  }
}

function _restore(): boolean {
  try {
    const raw = _ls.get(STORAGE_KEY);
    if (!raw) return false;

    const session: OfflineExpeditionModeSession = JSON.parse(raw);
    if (session.version !== OFFLINE_MODE_SESSION_VERSION) return false;

    _state.packs = session.packs || [];
    _state.active_pack_id = session.active_pack_id;
    _state.message_history = session.message_history || {};
    if (session.last_sync_at) {
      _state.sync_state.last_sync_at = session.last_sync_at;
    }

  debugOfflineMode('Offline mode session restored', { packs: _state.packs.length });
    return true;
  } catch {
    return false;
  }
}


// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

export const offlineExpeditionModeEngine = {

  // ── Lifecycle ──────────────────────────────────────────

  initialize(): void {
    if (_state.initialized) return;
  debugOfflineMode('Offline mode initializing');

    _restore();
    _state.initialized = true;

    // Subscribe to connectivity changes
    try {
      const { connectivity } = require('./connectivity');
      const unsub = connectivity.onStatusChange(() => {
        _evaluate();
      });
      _storeUnsubs.push(unsub);
    } catch {}

    // Initial evaluation
    _evaluate();

    // Start periodic evaluation
    _evalTimer = setInterval(_evaluate, EVAL_INTERVAL_MS);

  debugOfflineMode('Offline mode initialized', {
    packs: _state.packs.length,
    state: _state.connectivity_state,
  });
  },

  stop(): void {
    if (_evalTimer) {
      clearInterval(_evalTimer);
      _evalTimer = null;
    }
    if (_reconnectingTimer) {
      clearTimeout(_reconnectingTimer);
      _reconnectingTimer = null;
    }
    for (const unsub of _storeUnsubs) {
      try { unsub(); } catch {}
    }
    _storeUnsubs = [];
    _persist();
  debugOfflineMode('Offline mode stopped');
  },


  // ── State Access ───────────────────────────────────────

  getState(): OfflineExpeditionModeState {
    return { ..._state };
  },

  getConnectivityState(): OfflineConnectivityState {
    return _state.connectivity_state;
  },

  isOffline(): boolean {
    return _state.connectivity_state === 'offline';
  },

  isLimited(): boolean {
    return _state.connectivity_state === 'limited';
  },

  isOnline(): boolean {
    return _state.connectivity_state === 'online';
  },

  isReconnecting(): boolean {
    return _state.connectivity_state === 'reconnecting';
  },

  /**
   * Whether the offline banner should be visible.
   */
  shouldShowBanner(): boolean {
    return CONNECTIVITY_STATE_DISPLAY[_state.connectivity_state].bannerVisible;
  },

  /**
   * Get the display configuration for the current state.
   */
  getDisplayConfig() {
    return CONNECTIVITY_STATE_DISPLAY[_state.connectivity_state];
  },


  // ── System Profiles ────────────────────────────────────

  getSystemProfiles(): SystemOfflineProfile[] {
    return [..._state.system_profiles];
  },

  getSystemProfile(systemId: string): SystemOfflineProfile | null {
    return _state.system_profiles.find(p => p.system_id === systemId) ?? null;
  },

  /**
   * Check if a specific system is available offline.
   */
  isSystemAvailable(systemId: string): boolean {
    const profile = _state.system_profiles.find(p => p.system_id === systemId);
    if (!profile) return false;
    return profile.behavior !== 'unavailable';
  },

  /**
   * Get a stale data label for a system (null if not stale).
   */
  getStaleLabel(systemId: string): string | null {
    const profile = _state.system_profiles.find(p => p.system_id === systemId);
    return profile?.staleness_label ?? null;
  },


  // ── Intelligence Messages ──────────────────────────────

  getMessages(): OfflineIntelMessage[] {
    return [..._state.messages];
  },

  getRecentMessages(count: number = 3): OfflineIntelMessage[] {
    return _state.messages.slice(-count);
  },

  /**
   * Dismiss a specific message.
   */
  dismissMessage(key: string): void {
    _state.messages = _state.messages.filter(m => m.key !== key);
    _notify();
  },

  /**
   * Clear all messages.
   */
  clearMessages(): void {
    _state.messages = [];
    _notify();
  },


  // ── Expedition Packs ───────────────────────────────────

  getPacks(): ExpeditionPack[] {
    return [..._state.packs];
  },

  getActivePack(): ExpeditionPack | null {
    if (!_state.active_pack_id) return null;
    return _state.packs.find(p => p.id === _state.active_pack_id) ?? null;
  },

  /**
   * Create and save an expedition pack from current state.
   */
  createPack(params?: { name?: string; expedition_id?: string }): ExpeditionPack | null {
    const pack = _createExpeditionPack({
      name: params?.name,
      expedition_id: params?.expedition_id,
    });
    if (!pack) return null;

    // Replace existing pack with same expedition_id
    if (pack.expedition_id) {
      _state.packs = _state.packs.filter(p => p.expedition_id !== pack.expedition_id);
    }

    _state.packs.push(pack);
    _state.active_pack_id = pack.id;
    _persist();
    _notify();

  debugOfflineMode('Offline expedition pack created', {
    name: pack.name,
    sizeKb: pack.size_kb,
  });
    return pack;
  },

  /**
   * Set the active pack.
   */
  setActivePack(packId: string): boolean {
    const pack = _state.packs.find(p => p.id === packId);
    if (!pack) return false;
    _state.active_pack_id = packId;
    _persist();
    _notify();
    return true;
  },

  /**
   * Delete a pack.
   */
  deletePack(packId: string): void {
    _state.packs = _state.packs.filter(p => p.id !== packId);
    if (_state.active_pack_id === packId) {
      _state.active_pack_id = _state.packs[0]?.id ?? null;
    }
    _persist();
    _notify();
  },

  /**
   * Update an existing pack with current data.
   */
  refreshPack(packId: string): ExpeditionPack | null {
    const existing = _state.packs.find(p => p.id === packId);
    if (!existing) return null;

    const updated = _createExpeditionPack({
      name: existing.name,
      expedition_id: existing.expedition_id ?? undefined,
      route_id: existing.route_id ?? undefined,
    });
    if (!updated) return null;

    updated.id = packId;
    updated.created_at = existing.created_at;
    updated.version = existing.version + 1;

    const idx = _state.packs.findIndex(p => p.id === packId);
    if (idx >= 0) {
      _state.packs[idx] = updated;
    }
    _persist();
    _notify();

  debugOfflineMode('Offline expedition pack refreshed', {
    name: updated.name,
    version: updated.version,
  });
    return updated;
  },


  // ── Sync State ─────────────────────────────────────────

  getSyncState(): SyncState {
    return { ..._state.sync_state };
  },

  /**
   * Whether sync is currently in progress.
   */
  isSyncing(): boolean {
    return _state.sync_state.syncing;
  },


  // ── Offline Coverage ───────────────────────────────────

  coversCurrentPosition(): boolean {
    return _state.covers_position;
  },

  coversActiveRoute(): boolean {
    return _state.covers_route;
  },

  getTotalOfflineDataMb(): number {
    return _state.total_offline_data_mb;
  },


  // ── Compact Summary ────────────────────────────────────

  /**
   * Get a compact summary string for display.
   */
  getCompactSummary(): string {
    const display = CONNECTIVITY_STATE_DISPLAY[_state.connectivity_state];
    const state = _state.connectivity_state;

    if (state === 'online') return 'Online';
    if (state === 'reconnecting') return 'Reconnecting...';

    if (state === 'offline') {
      if (_state.covers_route) return 'Offline — Route cached';
      if (_state.covers_position) return 'Offline — Area cached';
      if (_state.packs.length > 0) return 'Offline — Pack available';
      return 'Offline — No cached data';
    }

    if (state === 'limited') {
      return 'Limited connectivity';
    }

    return display.label;
  },

  /**
   * Get an expedition intelligence message for the current state.
   * Returns a single calm, tactical message.
   */
  getIntelligenceMessage(): string {
    const state = _state.connectivity_state;

    if (state === 'online') return 'All expedition services available';
    if (state === 'reconnecting') return 'Restoring connectivity — syncing expedition data';

    if (state === 'offline') {
      const msgs: string[] = [];
      if (_state.covers_route) msgs.push('Route available locally');
      if (_state.covers_position) msgs.push('Area data cached');

      const profile = _state.system_profiles.find(p => p.system_id === 'vehicle_telemetry');
      if (profile?.behavior === 'fully_available') msgs.push('OBD active locally');

      if (msgs.length > 0) return `Offline mode — ${msgs.join(', ')}`;
      return 'Offline mode — using saved expedition data';
    }

    if (state === 'limited') {
      return 'Signal degraded — blending live and cached data';
    }

    return 'Evaluating connectivity';
  },


  // ── Subscriptions ──────────────────────────────────────

  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },


  // ── Force Evaluation ───────────────────────────────────

  forceEvaluate(): void {
    _evaluate();
  },


  // ── Reset ──────────────────────────────────────────────

  reset(): void {
    offlineExpeditionModeEngine.stop();
    _state = createDefaultOfflineModeState();
    _pendingState = null;
    _pendingStateTimestamp = 0;
    _listeners.clear();
  debugOfflineMode('Offline mode reset complete');
  },
};

