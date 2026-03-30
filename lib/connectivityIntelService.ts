/**
 * ═══════════════════════════════════════════════════════════
 * ECS CONNECTIVITY INTELLIGENCE SERVICE — Phase 3D
 * ═══════════════════════════════════════════════════════════
 *
 * The unified signal-awareness and connectivity-state layer for ECS.
 * Manages connectivity providers, normalizes their data, and
 * produces a single ConnectivitySummary for the rest of the system.
 *
 * Phase 3D — Persistence, Signal Recovery, Degraded-State Handling:
 *   - Debounce window prevents UI flicker during rapid state changes
 *   - Grace window preserves last known state during brief interruptions
 *   - Freshness tracking (live/recovering/stale/offline)
 *   - Stale detection timer marks data as stale after grace window
 *   - AppState listener for background/foreground transitions
 *   - Auto-refresh on signal recovery
 *   - Enhanced persistence on app background
 *   - Smooth recovery from offline → online transitions
 *   - Battery-conscious polling (reduced in background)
 *
 * Phase 3C — Offline Cache Awareness:
 *   - offline_cache provider activated
 *   - Cache readiness evaluated from tileCacheStore + expeditionCache
 *   - Operational readiness state computed from connectivity + cache
 *
 * Phase 3B — Live Device Network Detection:
 *   - device_network provider reads live network type
 *   - Internet reachability verified via ping
 *   - Latency measured and used for quality evaluation
 */

import { AppState, type AppStateStatus } from 'react-native';
import { connectivity, LATENCY_THRESHOLDS } from './connectivity';
import type { ConnectivityDetailedState } from './connectivity';
import { connectivityIntelStore } from './connectivityIntelStore';
import {
  buildOfflineCacheProviderData,
  invalidateCacheReadiness,
} from './offlineCacheAwarenessEngine';
import type {
  ConnectivitySummary,
  ConnectivityIntelState,
  ConnectivityProviderData,
  ConnectivityProviderId,
  ConnectivityTelemetry,
  ConnectivityQuality,
  ConnectivityFreshness,
  OperationalReadinessState,
} from './connectivityIntelTypes';
import {
  CONNECTIVITY_PROVIDERS,
  DEFAULT_CONNECTIVITY_SUMMARY,
} from './connectivityIntelTypes';


// ── Constants ────────────────────────────────────────────

/** How often to poll device network state (seconds) */
const DEVICE_NETWORK_POLL_INTERVAL_MS = 15_000;

/** Persist session every N summary updates */
const PERSIST_EVERY_N_UPDATES = 5;

/** Reconnect count threshold for degraded quality */
const RECONNECT_DEGRADED_THRESHOLD = 3;

/** Reconnect count threshold for weak quality */
const RECONNECT_WEAK_THRESHOLD = 5;

/** Phase 3D: Debounce window for state transitions (ms) */
const STATE_DEBOUNCE_MS = 3_000;

/** Phase 3D: How often to check for stale data (ms) */
const STALE_CHECK_INTERVAL_MS = 30_000;

/** Phase 3D: Reduced poll interval when app is in background */
const BACKGROUND_POLL_INTERVAL_MS = 60_000;


// ── Internal State ───────────────────────────────────────

let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _connectivityUnsub: (() => void) | null = null;
let _updateCount = 0;
let _lastState: ConnectivityIntelState = 'unknown';
let _lastNetworkType: string = 'unknown';
let _lastQuality: ConnectivityQuality = 'unknown';
let _lastFreshness: ConnectivityFreshness = 'offline';

// Phase 3C: Track cache readiness transitions
let _lastCacheReady = false;
let _lastRegionAvailable = false;
let _lastRouteAvailable = false;
let _lastOperationalReadiness: OperationalReadinessState = 'offline_unprepared';

// Phase 3C: tileCacheStore subscription for cache change detection
let _tileCacheUnsub: (() => void) | null = null;

// Phase 3D: Debounce state
let _pendingState: ConnectivityIntelState | null = null;
let _pendingStateTimestamp = 0;
let _debouncedState: ConnectivityIntelState = 'unknown';

// Phase 3D: Stale detection timer
let _staleCheckTimer: ReturnType<typeof setInterval> | null = null;

// Phase 3D: AppState tracking
let _appStateSubscription: { remove: () => void } | null = null;
let _isInBackground = false;
let _backgroundPollTimer: ReturnType<typeof setInterval> | null = null;

// Phase 3D: Last known good summary (for grace window)
let _lastKnownGoodSummary: ConnectivitySummary | null = null;


// ══════════════════════════════════════════════════════════
// PHASE 3D: DEBOUNCE LAYER
//
// Prevents rapid state oscillation from causing UI flicker.
// A new state must be sustained for STATE_DEBOUNCE_MS before
// it's accepted as the actual state.
//
// Exception: transitions TO 'connected' are accepted immediately
// (users should see connectivity restored ASAP).
// ══════════════════════════════════════════════════════════

function _debounceState(rawState: ConnectivityIntelState): ConnectivityIntelState {
  const now = Date.now();

  // Fast-path: connected transitions are immediate (good news travels fast)
  if (rawState === 'connected' && _debouncedState !== 'connected') {
    _debouncedState = rawState;
    _pendingState = null;
    _pendingStateTimestamp = 0;
    return rawState;
  }

  // If raw state matches debounced, clear any pending
  if (rawState === _debouncedState) {
    _pendingState = null;
    _pendingStateTimestamp = 0;
    return _debouncedState;
  }

  // New pending state
  if (_pendingState !== rawState) {
    _pendingState = rawState;
    _pendingStateTimestamp = now;
    return _debouncedState; // Hold current state
  }

  // Same pending state — check if debounce window has elapsed
  if ((now - _pendingStateTimestamp) >= STATE_DEBOUNCE_MS) {
    _debouncedState = rawState;
    _pendingState = null;
    _pendingStateTimestamp = 0;
    return rawState;
  }

  // Still within debounce window — hold current state
  return _debouncedState;
}


// ══════════════════════════════════════════════════════════
// PHASE 3D: FRESHNESS COMPUTATION
//
// Determines the freshness state from:
//   - Last update age
//   - Current connectivity state
//   - Recovery window status
//   - Stale threshold
//
// States:
//   live:       Data is current (updated within stale threshold)
//   recovering: Signal recently returned, validating
//   stale:      No updates within grace window
//   offline:    Device confirmed offline
// ══════════════════════════════════════════════════════════

function _computeFreshness(
  connectivityState: ConnectivityIntelState,
  isLive: boolean,
): ConnectivityFreshness {
  // Offline is always 'offline' freshness
  if (connectivityState === 'offline') {
    return 'offline';
  }

  // Check if we're in recovery window
  if (connectivityIntelStore.isRecovering()) {
    return 'recovering';
  }

  // Check staleness
  const lastUpdateAge = connectivityIntelStore.getLastUpdateAge();
  const { staleThresholdMs } = connectivityIntelStore.getTimingConstants();

  if (lastUpdateAge > staleThresholdMs) {
    return 'stale';
  }

  // If we have live data and it's fresh, we're live
  if (isLive) {
    return 'live';
  }

  // Restored from session but not yet live
  return 'stale';
}


// ══════════════════════════════════════════════════════════
// QUALITY EVALUATION LAYER
// ══════════════════════════════════════════════════════════

function _evaluateQuality(
  detailed: ConnectivityDetailedState,
): ConnectivityQuality {
  if (detailed.status === 'offline' || detailed.networkType === 'none') {
    return 'unavailable';
  }
  if (detailed.status === 'reconnecting') {
    return 'weak';
  }
  if (!detailed.initialized) {
    return 'unknown';
  }
  if (!detailed.isInternetReachable) {
    return 'weak';
  }

  if (detailed.latencyMs != null) {
    if (detailed.latencyMs < LATENCY_THRESHOLDS.excellent) {
      if (detailed.reconnectCount >= RECONNECT_WEAK_THRESHOLD) {
        return 'moderate';
      }
      return 'strong';
    }
    if (detailed.latencyMs < LATENCY_THRESHOLDS.good) {
      return detailed.reconnectCount >= RECONNECT_DEGRADED_THRESHOLD ? 'moderate' : 'strong';
    }
    if (detailed.latencyMs < LATENCY_THRESHOLDS.fair) {
      return 'moderate';
    }
    return 'weak';
  }

  if (detailed.reconnectCount >= RECONNECT_WEAK_THRESHOLD) {
    return 'weak';
  }
  if (detailed.reconnectCount >= RECONNECT_DEGRADED_THRESHOLD) {
    return 'moderate';
  }

  return 'moderate';
}


// ══════════════════════════════════════════════════════════
// PROVIDER: device_network
// ══════════════════════════════════════════════════════════

function _readDeviceNetwork(): ConnectivityProviderData {
  const detailed = connectivity.getDetailedState();

  let state: ConnectivityIntelState;

  if (!detailed.initialized) {
    state = 'unknown';
  } else if (detailed.status === 'offline' || detailed.networkType === 'none') {
    state = 'offline';
  } else if (detailed.status === 'reconnecting') {
    state = 'limited';
  } else if (detailed.isOnline && !detailed.isInternetReachable) {
    state = 'degraded';
  } else if (detailed.isOnline && detailed.isInternetReachable) {
    if (detailed.reconnectCount >= RECONNECT_WEAK_THRESHOLD) {
      state = 'limited';
    } else {
      state = 'connected';
    }
  } else {
    state = 'unknown';
  }

  const quality = _evaluateQuality(detailed);

  let signalQuality: ConnectivityTelemetry['signal_quality'];
  switch (quality) {
    case 'strong':      signalQuality = 'excellent'; break;
    case 'moderate':    signalQuality = 'good'; break;
    case 'weak':        signalQuality = 'poor'; break;
    case 'unavailable': signalQuality = 'none'; break;
    default:            signalQuality = undefined;
  }

  let signalStrength: number | undefined;
  if (detailed.latencyMs != null && detailed.isInternetReachable) {
    if (detailed.latencyMs < LATENCY_THRESHOLDS.excellent) {
      signalStrength = 90;
    } else if (detailed.latencyMs < LATENCY_THRESHOLDS.good) {
      signalStrength = 70;
    } else if (detailed.latencyMs < LATENCY_THRESHOLDS.fair) {
      signalStrength = 45;
    } else {
      signalStrength = 20;
    }
    if (detailed.reconnectCount >= RECONNECT_WEAK_THRESHOLD) {
      signalStrength = Math.max(10, signalStrength - 25);
    } else if (detailed.reconnectCount >= RECONNECT_DEGRADED_THRESHOLD) {
      signalStrength = Math.max(10, signalStrength - 10);
    }
  } else if (state === 'offline') {
    signalStrength = 0;
  } else if (state === 'degraded') {
    signalStrength = 15;
  } else if (state === 'limited') {
    signalStrength = 25;
  }

  const telemetry: ConnectivityTelemetry = {
    network_type: detailed.networkType,
    signal_strength: signalStrength,
    signal_quality: signalQuality,
    internet_reachable: detailed.isInternetReachable,
    last_online_at: detailed.lastOnlineAt || undefined,
    latency_ms: detailed.latencyMs ?? undefined,
    reconnect_count: detailed.reconnectCount,
    cellular_generation: detailed.cellularGeneration ?? undefined,
    source_provider: 'device_network',
    captured_at: new Date().toISOString(),
  };

  return {
    provider_id: 'device_network',
    state,
    telemetry,
    reported_at: new Date().toISOString(),
    is_active: true,
  };
}


// ══════════════════════════════════════════════════════════
// PROVIDER: offline_cache (Phase 3C)
// ══════════════════════════════════════════════════════════

function _readOfflineCache(): ConnectivityProviderData {
  return buildOfflineCacheProviderData();
}


// ══════════════════════════════════════════════════════════
// OPERATIONAL READINESS (Phase 3C)
// ══════════════════════════════════════════════════════════

function _computeOperationalReadiness(
  connectivityState: ConnectivityIntelState,
  internetReachable: boolean,
  offlineCacheReady: boolean,
  cachedRegionAvailable: boolean,
  cachedRouteAvailable: boolean,
): OperationalReadinessState {
  const cacheUseful = offlineCacheReady && (cachedRegionAvailable || cachedRouteAvailable);

  if (connectivityState === 'connected' && internetReachable) {
    return 'online_ready';
  }

  if (connectivityState === 'degraded' || connectivityState === 'limited') {
    return cacheUseful ? 'degraded_ready' : 'degraded_unprepared';
  }

  if (connectivityState === 'offline') {
    return cacheUseful ? 'offline_ready' : 'offline_unprepared';
  }

  if (connectivityState === 'unknown') {
    return cacheUseful ? 'degraded_ready' : 'degraded_unprepared';
  }

  return 'offline_unprepared';
}


// ══════════════════════════════════════════════════════════
// PRIORITY MODEL
// ══════════════════════════════════════════════════════════

function _selectBestSource(
  providers: Map<ConnectivityProviderId, ConnectivityProviderData>,
): ConnectivityProviderData | null {
  const active = Array.from(providers.values()).filter(
    p => p.is_active && p.provider_id !== 'offline_cache'
  );
  if (active.length === 0) return null;

  const priorityMap = new Map<ConnectivityProviderId, number>();
  CONNECTIVITY_PROVIDERS.forEach(p => priorityMap.set(p.id, p.priority));

  active.sort((a, b) => {
    const pa = priorityMap.get(a.provider_id) ?? 0;
    const pb = priorityMap.get(b.provider_id) ?? 0;
    return pb - pa;
  });

  return active[0];
}


// ══════════════════════════════════════════════════════════
// SUMMARY COMPUTATION
//
// Phase 3D: Applies debounce, grace window, and freshness.
// ══════════════════════════════════════════════════════════

function _computeSummary(
  providers: Map<ConnectivityProviderId, ConnectivityProviderData>,
): ConnectivitySummary {
  const best = _selectBestSource(providers);
  const activeCount = Array.from(providers.values()).filter(p => p.is_active).length;

  if (!best) {
    return {
      ...DEFAULT_CONNECTIVITY_SUMMARY,
      // Phase 3D: Preserve last_online_at from persisted store
      last_online_at: connectivityIntelStore.getPersistedLastOnlineAt(),
      freshness: 'offline',
      updated_at: new Date().toISOString(),
    };
  }

  const t = best.telemetry;

  // ── Phase 3C: Read cache readiness from offline_cache provider ──
  const cacheProvider = providers.get('offline_cache');
  const cacheActive = cacheProvider?.is_active ?? false;
  const cacheTelemetry = cacheActive ? cacheProvider!.telemetry : null;

  const offlineCacheReady = cacheTelemetry?.offline_cache_ready ?? false;
  const cachedRegionAvailable = cacheTelemetry?.cached_region_available ?? false;
  const cachedRouteAvailable = cacheTelemetry?.cached_route_available ?? false;

  const detailed = connectivity.getDetailedState();
  const quality = _evaluateQuality(detailed);

  // Phase 3D: Apply debounce to the raw state
  const rawState = best.state;
  const debouncedState = _debounceState(rawState);

  // Phase 3D: Determine last_online_at with persistence
  let lastOnlineAt = t.last_online_at ?? connectivityIntelStore.getPersistedLastOnlineAt();
  if (debouncedState === 'connected' || (detailed.isOnline && detailed.isInternetReachable)) {
    lastOnlineAt = new Date().toISOString();
  }

  // Phase 3C: Compute operational readiness
  const operationalReadiness = _computeOperationalReadiness(
    debouncedState,
    t.internet_reachable ?? false,
    offlineCacheReady,
    cachedRegionAvailable,
    cachedRouteAvailable,
  );

  // Phase 3D: Compute freshness
  const freshness = _computeFreshness(debouncedState, true);

  return {
    connectivity_state: debouncedState,
    signal_quality: t.signal_quality ?? 'unknown',
    internet_reachable: t.internet_reachable ?? false,
    offline_cache_ready: offlineCacheReady,
    last_online_at: lastOnlineAt,
    active_source: best.provider_id,
    active_provider_count: activeCount,
    is_live: true,
    updated_at: new Date().toISOString(),
    // Phase 3B
    network_type: t.network_type ?? 'unknown',
    quality,
    latency_ms: t.latency_ms ?? null,
    // Phase 3C
    cached_region_available: cachedRegionAvailable,
    cached_route_available: cachedRouteAvailable,
    operational_readiness: operationalReadiness,
    // Phase 3D
    freshness,
  };
}


// ══════════════════════════════════════════════════════════
// CORE UPDATE CYCLE
// ══════════════════════════════════════════════════════════

function _update(): void {
  try {
    // Read device_network provider
    const deviceNetworkData = _readDeviceNetwork();
    connectivityIntelStore.updateProviderData(deviceNetworkData);

    // Phase 3C: Read offline_cache provider
    const offlineCacheData = _readOfflineCache();
    connectivityIntelStore.updateProviderData(offlineCacheData);

    // Compute summary from all providers
    const providers = new Map<ConnectivityProviderId, ConnectivityProviderData>();
    const activeProviders = connectivityIntelStore.getActiveProviders();
    activeProviders.forEach(p => providers.set(p.provider_id, p));
    providers.set('device_network', deviceNetworkData);
    providers.set('offline_cache', offlineCacheData);

    const summary = _computeSummary(providers);

    // Phase 3D: Track last known good summary for grace window
    if (summary.connectivity_state === 'connected' || summary.connectivity_state === 'limited') {
      _lastKnownGoodSummary = { ...summary };
    }

    // Phase 3D: Enhanced transition logging
    if (summary.connectivity_state !== _lastState) {
      console.log(
        `[ConnectivityIntel] State transition: ${_lastState} → ${summary.connectivity_state} ` +
        `(type: ${summary.network_type}, quality: ${summary.quality}, ` +
        `reachable: ${summary.internet_reachable}, ` +
        `freshness: ${summary.freshness}, ` +
        `latency: ${summary.latency_ms != null ? summary.latency_ms + 'ms' : 'n/a'})`
      );
      _lastState = summary.connectivity_state;
    }

    // Phase 3B: Log network type changes
    if (summary.network_type !== _lastNetworkType) {
      console.log(`[ConnectivityIntel] Network type: ${_lastNetworkType} → ${summary.network_type}`);
      _lastNetworkType = summary.network_type;
    }

    // Phase 3B: Log quality changes
    if (summary.quality !== _lastQuality) {
      console.log(`[ConnectivityIntel] Quality: ${_lastQuality} → ${summary.quality}`);
      _lastQuality = summary.quality;
    }

    // Phase 3D: Log freshness changes
    if (summary.freshness !== _lastFreshness) {
      console.log(`[ConnectivityIntel] Freshness: ${_lastFreshness} → ${summary.freshness}`);
      _lastFreshness = summary.freshness;
    }

    // Phase 3C: Log cache readiness transitions
    if (summary.offline_cache_ready !== _lastCacheReady) {
      console.log(
        `[ConnectivityIntel] Cache readiness: ${_lastCacheReady} → ${summary.offline_cache_ready}`
      );
      _lastCacheReady = summary.offline_cache_ready;
    }

    if (summary.cached_region_available !== _lastRegionAvailable) {
      console.log(
        `[ConnectivityIntel] Cached region: ${_lastRegionAvailable} → ${summary.cached_region_available}`
      );
      _lastRegionAvailable = summary.cached_region_available;
    }

    if (summary.cached_route_available !== _lastRouteAvailable) {
      console.log(
        `[ConnectivityIntel] Cached route: ${_lastRouteAvailable} → ${summary.cached_route_available}`
      );
      _lastRouteAvailable = summary.cached_route_available;
    }

    if (summary.operational_readiness !== _lastOperationalReadiness) {
      console.log(
        `[ConnectivityIntel] Operational readiness: ${_lastOperationalReadiness} → ${summary.operational_readiness}`
      );
      _lastOperationalReadiness = summary.operational_readiness;
    }

    // Push to store
    connectivityIntelStore.updateSummary(summary);

    // Periodic persistence
    _updateCount++;
    if (_updateCount % PERSIST_EVERY_N_UPDATES === 0) {
      connectivityIntelStore.persist();
    }
  } catch (e) {
    // Phase 3D: Never crash ECS from connectivity updates
    console.warn('[ConnectivityIntel] Update cycle error (non-fatal):', e);
  }
}


// ══════════════════════════════════════════════════════════
// PHASE 3D: STALE DETECTION
//
// Periodically checks if data has become stale and updates
// the freshness indicator accordingly. Also ends the recovery
// window when appropriate.
// ══════════════════════════════════════════════════════════

function _checkStale(): void {
  try {
    const { staleThresholdMs, recoveryWindowMs } = connectivityIntelStore.getTimingConstants();
    const lastUpdateAge = connectivityIntelStore.getLastUpdateAge();
    const currentSummary = connectivityIntelStore.getSummary();

    // End recovery window if expired
    if (connectivityIntelStore.isRecovering()) {
      const stateChangeTs = connectivityIntelStore.getStateChangeTimestamp();
      if (stateChangeTs > 0 && (Date.now() - stateChangeTs) > recoveryWindowMs) {
        connectivityIntelStore.endRecoveryWindow();
        // Trigger an update to refresh freshness
        _update();
        return;
      }
    }

    // Check if data has gone stale
    if (lastUpdateAge > staleThresholdMs && currentSummary.freshness !== 'stale' && currentSummary.freshness !== 'offline') {
      console.log(
        `[ConnectivityIntel] Data stale (${Math.round(lastUpdateAge / 1000)}s since last update)`
      );
      // Update freshness to stale without changing other fields
      const staleSummary: ConnectivitySummary = {
        ...currentSummary,
        freshness: 'stale',
        is_live: false,
      };
      connectivityIntelStore.updateSummary(staleSummary);
    }
  } catch (e) {
    console.warn('[ConnectivityIntel] Stale check error (non-fatal):', e);
  }
}


// ══════════════════════════════════════════════════════════
// PHASE 3D: APP STATE HANDLING
//
// Handles transitions between foreground and background:
//   - Background: Persist state, reduce polling frequency
//   - Foreground: Restore polling, force immediate update
// ══════════════════════════════════════════════════════════

function _handleAppStateChange(nextAppState: AppStateStatus): void {
  try {
    if (nextAppState === 'active' && _isInBackground) {
      // ── Returning to foreground ──
      _isInBackground = false;
      console.log('[ConnectivityIntel] App resumed — refreshing connectivity');

      // Stop background polling
      if (_backgroundPollTimer) {
        clearInterval(_backgroundPollTimer);
        _backgroundPollTimer = null;
      }

      // Restart normal polling
      _startNormalPolling();

      // Force immediate update
      _update();

    } else if (nextAppState === 'background' && !_isInBackground) {
      // ── Going to background ──
      _isInBackground = true;
      console.log('[ConnectivityIntel] App backgrounded — persisting state');

      // Persist current state
      connectivityIntelStore.persist();

      // Stop normal polling
      _stopNormalPolling();

      // Start reduced background polling
      _backgroundPollTimer = setInterval(() => {
        _update();
      }, BACKGROUND_POLL_INTERVAL_MS);
    }
  } catch (e) {
    console.warn('[ConnectivityIntel] AppState handler error (non-fatal):', e);
  }
}


// ── Polling helpers ──────────────────────────────────────

function _startNormalPolling(): void {
  _stopNormalPolling();
  _pollTimer = setInterval(() => {
    _update();
  }, DEVICE_NETWORK_POLL_INTERVAL_MS);
}

function _stopNormalPolling(): void {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}


// ══════════════════════════════════════════════════════════
// PUBLIC SERVICE API
// ══════════════════════════════════════════════════════════

export const connectivityIntelService = {

  /**
   * Initialize the Connectivity Intelligence service.
   * Restores previous session if available, then starts monitoring.
   */
  initialize(): void {
    if (connectivityIntelStore.isInitialized()) {
      console.log('[ConnectivityIntel] Already initialized');
      return;
    }

    console.log('[ConnectivityIntel] Initializing service (Phase 3D — Persistence & Recovery)...');

    // Attempt session restore
    const restored = connectivityIntelStore.restore();
    if (restored) {
      console.log('[ConnectivityIntel] Previous session restored — will validate with live data');
    }

    connectivityIntelStore.setInitialized(true);

    // Start monitoring
    this.startMonitoring();
  },

  /**
   * Start active connectivity monitoring.
   * Phase 3D: Includes AppState listener, stale detection, and debounce.
   */
  startMonitoring(): void {
    if (connectivityIntelStore.isMonitoring()) return;

    console.log('[ConnectivityIntel] Starting monitoring (Phase 3D — with persistence & recovery)...');
    connectivityIntelStore.setMonitoring(true);

    // Ensure connectivity monitor is running
    connectivity.startMonitoring();

    // Subscribe to connectivity status changes for immediate updates
    _connectivityUnsub = connectivity.onStatusChange(() => {
      _update();
    });

    // Phase 3C: Subscribe to tileCacheStore changes for cache invalidation
    try {
      const { tileCacheStore } = require('./tileCacheStore');
      _tileCacheUnsub = tileCacheStore.subscribe(() => {
        invalidateCacheReadiness();
        _update();
      });
    } catch (e) {
      console.warn('[ConnectivityIntel] tileCacheStore subscription failed (non-fatal):', e);
    }

    // Phase 3D: Start AppState listener
    try {
      _appStateSubscription = AppState.addEventListener('change', _handleAppStateChange);
    } catch (e) {
      console.warn('[ConnectivityIntel] AppState listener failed (non-fatal):', e);
    }

    // Phase 3D: Start stale detection timer
    _staleCheckTimer = setInterval(() => {
      _checkStale();
    }, STALE_CHECK_INTERVAL_MS);

    // Initial update
    _update();

    // Start normal polling
    _startNormalPolling();
  },

  /**
   * Stop active connectivity monitoring.
   * Phase 3D: Persists state and cleans up all timers/listeners.
   */
  stopMonitoring(): void {
    if (!connectivityIntelStore.isMonitoring()) return;

    console.log('[ConnectivityIntel] Stopping monitoring...');

    // Persist before stopping
    connectivityIntelStore.persist();

    // Clean up normal polling
    _stopNormalPolling();

    // Clean up background polling
    if (_backgroundPollTimer) {
      clearInterval(_backgroundPollTimer);
      _backgroundPollTimer = null;
    }

    // Clean up connectivity subscription
    if (_connectivityUnsub) {
      _connectivityUnsub();
      _connectivityUnsub = null;
    }

    // Phase 3C: Clean up tileCacheStore subscription
    if (_tileCacheUnsub) {
      _tileCacheUnsub();
      _tileCacheUnsub = null;
    }

    // Phase 3D: Clean up AppState listener
    if (_appStateSubscription) {
      _appStateSubscription.remove();
      _appStateSubscription = null;
    }

    // Phase 3D: Clean up stale detection timer
    if (_staleCheckTimer) {
      clearInterval(_staleCheckTimer);
      _staleCheckTimer = null;
    }

    connectivityIntelStore.setMonitoring(false);
  },

  /**
   * Force an immediate update cycle.
   */
  forceUpdate(): void {
    _update();
  },

  /**
   * Phase 3C: Invalidate and re-evaluate offline cache readiness.
   */
  invalidateCache(): void {
    invalidateCacheReadiness();
    _update();
  },

  /**
   * Report data from an external provider.
   */
  reportProviderData(data: ConnectivityProviderData): void {
    console.log(`[ConnectivityIntel] Provider data received: ${data.provider_id} (${data.state})`);
    connectivityIntelStore.updateProviderData(data);
    _update();
  },

  /**
   * Deactivate a provider.
   */
  deactivateProvider(providerId: ConnectivityProviderId): void {
    const existing = connectivityIntelStore.getProviderData(providerId);
    if (existing) {
      connectivityIntelStore.updateProviderData({
        ...existing,
        is_active: false,
      });
      console.log(`[ConnectivityIntel] Provider deactivated: ${providerId}`);
      _update();
    }
  },

  /**
   * Get the current service state for debugging.
   * Phase 3D: Includes freshness, debounce, and grace window state.
   */
  getDebugState(): {
    initialized: boolean;
    monitoring: boolean;
    recoveryStatus: string;
    activeProviderCount: number;
    summary: ConnectivitySummary;
    updateCount: number;
    lastState: ConnectivityIntelState;
    networkType: string;
    quality: ConnectivityQuality;
    freshness: ConnectivityFreshness;
    latencyMs: number | null;
    detailedConnectivity: ConnectivityDetailedState;
    cacheReady: boolean;
    cachedRegionAvailable: boolean;
    cachedRouteAvailable: boolean;
    operationalReadiness: OperationalReadinessState;
    // Phase 3D debug fields
    isRecovering: boolean;
    isInGraceWindow: boolean;
    isInBackground: boolean;
    lastUpdateAgeMs: number;
    debouncedState: ConnectivityIntelState;
    pendingState: ConnectivityIntelState | null;
    hasLastKnownGood: boolean;
    persistedLastOnlineAt: string | null;
  } {
    const summary = connectivityIntelStore.getSummary();
    return {
      initialized: connectivityIntelStore.isInitialized(),
      monitoring: connectivityIntelStore.isMonitoring(),
      recoveryStatus: connectivityIntelStore.getRecoveryStatus(),
      activeProviderCount: connectivityIntelStore.getActiveProviderCount(),
      summary,
      updateCount: _updateCount,
      lastState: _lastState,
      networkType: _lastNetworkType,
      quality: _lastQuality,
      freshness: _lastFreshness,
      latencyMs: connectivityIntelStore.getLatencyMs(),
      detailedConnectivity: connectivity.getDetailedState(),
      cacheReady: summary.offline_cache_ready,
      cachedRegionAvailable: summary.cached_region_available,
      cachedRouteAvailable: summary.cached_route_available,
      operationalReadiness: summary.operational_readiness,
      // Phase 3D
      isRecovering: connectivityIntelStore.isRecovering(),
      isInGraceWindow: connectivityIntelStore.isInGraceWindow(),
      isInBackground: _isInBackground,
      lastUpdateAgeMs: connectivityIntelStore.getLastUpdateAge(),
      debouncedState: _debouncedState,
      pendingState: _pendingState,
      hasLastKnownGood: _lastKnownGoodSummary != null,
      persistedLastOnlineAt: connectivityIntelStore.getPersistedLastOnlineAt(),
    };
  },

  /**
   * Reset the service completely.
   */
  reset(): void {
    this.stopMonitoring();
    connectivityIntelStore.reset();
    invalidateCacheReadiness();
    _updateCount = 0;
    _lastState = 'unknown';
    _lastNetworkType = 'unknown';
    _lastQuality = 'unknown';
    _lastFreshness = 'offline';
    _lastCacheReady = false;
    _lastRegionAvailable = false;
    _lastRouteAvailable = false;
    _lastOperationalReadiness = 'offline_unprepared';
    _pendingState = null;
    _pendingStateTimestamp = 0;
    _debouncedState = 'unknown';
    _lastKnownGoodSummary = null;
    _isInBackground = false;
    console.log('[ConnectivityIntel] Service reset');
  },
};

