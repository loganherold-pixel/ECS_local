/**
 * ═══════════════════════════════════════════════════════════
 * ECS OFFLINE INTERLOCK — Integration Pass 3
 * ═══════════════════════════════════════════════════════════
 *
 * Coordinates Discovery, Navigation, Offline Expedition Database,
 * and Connectivity Intelligence for seamless online/offline
 * expedition operation.
 *
 * Responsibilities:
 *   1. Track current data source mode (online/offline/hybrid)
 *   2. Handle connectivity transitions smoothly with debounce
 *   3. Ensure Discovery uses the correct data source
 *   4. Ensure Navigation retains cached data when offline
 *   5. Trigger Connectivity Intelligence re-evaluation on data changes
 *   6. Trigger Risk Engine re-evaluation on connectivity changes
 *   7. Prevent duplicate markers from live + cached sources
 *   8. Preserve user filters during source switching
 *   9. Provide safe companion data for Android Auto / CarPlay
 *  10. Handle app restart / resume recovery
 *  11. Validate download completeness (no false readiness)
 *  12. Keep stale datasets usable until safely updated
 *  13. Log source transitions without noise
 *
 * Data Source Priority:
 *   ONLINE:  Live API data preferred, offline supplements
 *   HYBRID:  Degraded connectivity — blend live + cached
 *   OFFLINE: Cached data only, clear fallback when missing
 *
 * Integration Points:
 *   - offlineDiscoveryBridge: Discovery offline fallback
 *   - offlineNavigationBridge: Navigation offline overlays
 *   - offlineExpeditionDbStore: Offline dataset management
 *   - connectivityIntelService: Connectivity state
 *   - connectivityIntelStore: Connectivity summary
 *   - offlineCacheAwarenessEngine: Cache readiness
 *   - ecsBus: Cross-system event propagation
 *   - ecsSyncCoordinator: Summary normalization
 *
 * Update Flow:
 *   Connectivity change → mode re-evaluation → source switch
 *     → Discovery/Navigation notified → UI updates
 *   Route change → offline readiness re-eval → CI invalidation
 *     → Risk Engine re-eval → Assistant refresh
 *   Region download → cache invalidation → CI re-eval
 *     → Remoteness update → Risk Engine re-eval
 */

import { AppState, type AppStateStatus } from 'react-native';

const TAG = '[ECS-INTERLOCK]';

// ── Data Source Mode ─────────────────────────────────────

/**
 * Current data source mode for Discovery and Navigation.
 *
 * online:  Full connectivity — use live API data
 * hybrid:  Degraded connectivity — blend live + cached
 * offline: No connectivity — use cached data only
 */
export type DataSourceMode = 'online' | 'hybrid' | 'offline';

/**
 * Source priority for a specific data request.
 * Determines which source to prefer when both live and cached exist.
 */
export type SourcePriority = 'live_only' | 'live_preferred' | 'cached_preferred' | 'cached_only';

/**
 * Interlock state snapshot for UI consumption.
 */
export interface InterlockState {
  /** Current data source mode */
  mode: DataSourceMode;
  /** Whether the mode recently changed (within transition window) */
  in_transition: boolean;
  /** Previous mode before transition */
  previous_mode: DataSourceMode | null;
  /** ISO timestamp of last mode change */
  mode_changed_at: string | null;
  /** Whether offline data is available for Discovery */
  discovery_offline_available: boolean;
  /** Whether offline data is available for Navigation */
  navigation_offline_available: boolean;
  /** Whether the active route is covered by offline data */
  route_covered_offline: boolean;
  /** Whether the current position is covered by offline data */
  position_covered_offline: boolean;
  /** Source priority for Discovery queries */
  discovery_source: SourcePriority;
  /** Source priority for Navigation overlays */
  navigation_source: SourcePriority;
  /** Number of downloaded offline regions */
  offline_region_count: number;
  /** Total offline dataset entries */
  offline_entry_count: number;
  /** Whether any offline regions have integrity issues */
  has_integrity_issues: boolean;
  /** Whether any offline regions are stale */
  has_stale_regions: boolean;
  /** Human-readable status message */
  status_message: string;
  /** ISO timestamp of last evaluation */
  evaluated_at: string;
}

/**
 * Companion interlock data for Android Auto / CarPlay.
 */
export interface CompanionInterlockData {
  mode: DataSourceMode;
  offline_ready: boolean;
  route_covered: boolean;
  status: string;
}

/**
 * Filter state preserved across source transitions.
 */
export interface PreservedFilters {
  distance_radius_mi: number | null;
  categories: string[] | null;
  search_text: string | null;
  sort_by: string | null;
  preserved_at: string;
}


// ── Configuration ────────────────────────────────────────

/** Debounce window for mode transitions (prevents flicker) */
const MODE_TRANSITION_DEBOUNCE_MS = 3_000;

/** How long a mode transition is considered "in progress" */
const TRANSITION_WINDOW_MS = 5_000;

/** Minimum interval between full re-evaluations */
const EVAL_INTERVAL_MS = 10_000;

/** Log throttle — minimum interval between verbose log entries */
const LOG_THROTTLE_MS = 15_000;

/** Stale interlock state threshold (2 minutes) */
const STALE_THRESHOLD_MS = 120_000;


// ── Internal State ───────────────────────────────────────

let _mode: DataSourceMode = 'offline';
let _previousMode: DataSourceMode | null = null;
let _modeChangedAt: string | null = null;
let _pendingMode: DataSourceMode | null = null;
let _pendingModeTimestamp = 0;
let _inTransition = false;
let _transitionEndTimer: ReturnType<typeof setTimeout> | null = null;

let _lastEvalTimestamp = 0;
let _lastLogTimestamp = 0;
let _evalCount = 0;

/** Preserved filters during source transitions */
let _preservedFilters: PreservedFilters | null = null;

/** Cached interlock state */
let _cachedState: InterlockState | null = null;
let _cachedStateTimestamp = 0;

/** Store subscriptions */
let _storeUnsubs: (() => void)[] = [];
let _appStateSubscription: { remove: () => void } | null = null;
let _initialized = false;
let _monitoring = false;

/** Listeners */
type Listener = (state: InterlockState) => void;
const _listeners = new Set<Listener>();

function _notify(state: InterlockState): void {
  _listeners.forEach(fn => { try { fn(state); } catch {} });
}


// ── Logging ──────────────────────────────────────────────

function _shouldLog(): boolean {
  const now = Date.now();
  if (now - _lastLogTimestamp > LOG_THROTTLE_MS) {
    _lastLogTimestamp = now;
    return true;
  }
  return false;
}


// ── Connectivity Detection ───────────────────────────────

/**
 * Read the current connectivity state from Connectivity Intelligence.
 * Falls back to basic connectivity module if CI is unavailable.
 */
function _readConnectivityState(): {
  state: string;
  internet_reachable: boolean;
  offline_cache_ready: boolean;
  operational_readiness: string;
  quality: string;
} {
  const defaults = {
    state: 'unknown',
    internet_reachable: false,
    offline_cache_ready: false,
    operational_readiness: 'offline_unprepared',
    quality: 'unknown',
  };

  try {
    const { connectivityIntelStore } = require('./connectivityIntelStore');
    if (connectivityIntelStore.isInitialized()) {
      const summary = connectivityIntelStore.getSummary();
      if (summary) {
        return {
          state: summary.connectivity_state || 'unknown',
          internet_reachable: summary.internet_reachable || false,
          offline_cache_ready: summary.offline_cache_ready || false,
          operational_readiness: summary.operational_readiness || 'offline_unprepared',
          quality: summary.quality || 'unknown',
        };
      }
    }
  } catch {}

  // Fallback to raw connectivity
  try {
    const { connectivity } = require('./connectivity');
    const level = connectivity.getLevel();
    return {
      ...defaults,
      state:
        level === 'no_service'
          ? 'offline'
          : level === 'limited'
            ? 'limited'
            : level === 'normal'
              ? 'connected'
              : 'unknown',
      internet_reachable: level === 'normal',
    };
  } catch {}

  return defaults;
}


// ── Offline Data Detection ───────────────────────────────

/**
 * Read offline expedition data readiness.
 */
function _readOfflineReadiness(): {
  has_data: boolean;
  region_count: number;
  entry_count: number;
  covers_position: boolean;
  covers_route: boolean;
  has_integrity_issues: boolean;
  has_stale_regions: boolean;
  is_downloading: boolean;
} {
  const defaults = {
    has_data: false,
    region_count: 0,
    entry_count: 0,
    covers_position: false,
    covers_route: false,
    has_integrity_issues: false,
    has_stale_regions: false,
    is_downloading: false,
  };

  try {
    const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
    if (!offlineExpeditionDbStore.isInitialized()) return defaults;

    const readiness = offlineExpeditionDbStore.evaluateReadiness();
    return {
      has_data: readiness.has_offline_data,
      region_count: readiness.downloaded_regions,
      entry_count: readiness.total_entries,
      covers_position: readiness.covers_current_position,
      covers_route: readiness.covers_active_route,
      has_integrity_issues: !(readiness.all_regions_valid ?? true),
      has_stale_regions: (readiness.stale_regions ?? 0) > 0,
      is_downloading: offlineExpeditionDbStore.isDownloading(),
    };
  } catch {}

  return defaults;
}


// ── Mode Computation ─────────────────────────────────────

/**
 * Compute the data source mode from connectivity and offline readiness.
 */
function _computeMode(
  connectivity: ReturnType<typeof _readConnectivityState>,
  offlineReadiness: ReturnType<typeof _readOfflineReadiness>,
): DataSourceMode {
  // Fully connected with internet
  if (connectivity.state === 'connected' && connectivity.internet_reachable) {
    return 'online';
  }

  // Degraded or limited — blend live + cached
  if (connectivity.state === 'degraded' || connectivity.state === 'limited') {
    return 'hybrid';
  }

  // Offline
  if (connectivity.state === 'offline') {
    return 'offline';
  }

  // Unknown startup / unresolved connectivity should stay conservative until
  // transport and reachability are reconciled.
  return 'offline';
}

/**
 * Apply debounce to mode transitions.
 * Prevents rapid flicker between modes during unstable connectivity.
 * Exception: transitions TO 'online' are accepted immediately.
 */
function _debounceMode(rawMode: DataSourceMode): DataSourceMode {
  const now = Date.now();

  // Fast-path: online transitions are immediate (good news travels fast)
  if (rawMode === 'online' && _mode !== 'online') {
    _pendingMode = null;
    _pendingModeTimestamp = 0;
    return rawMode;
  }

  // Same as current — clear pending
  if (rawMode === _mode) {
    _pendingMode = null;
    _pendingModeTimestamp = 0;
    return _mode;
  }

  // New pending mode
  if (_pendingMode !== rawMode) {
    _pendingMode = rawMode;
    _pendingModeTimestamp = now;
    return _mode; // Hold current
  }

  // Same pending — check debounce window
  if ((now - _pendingModeTimestamp) >= MODE_TRANSITION_DEBOUNCE_MS) {
    _pendingMode = null;
    _pendingModeTimestamp = 0;
    return rawMode;
  }

  return _mode; // Still within debounce
}


// ── Source Priority Resolution ───────────────────────────

/**
 * Determine source priority for Discovery based on current mode.
 */
function _resolveDiscoverySource(
  mode: DataSourceMode,
  offlineAvailable: boolean,
): SourcePriority {
  switch (mode) {
    case 'online':
      return 'live_only';
    case 'hybrid':
      return offlineAvailable ? 'live_preferred' : 'live_only';
    case 'offline':
      return offlineAvailable ? 'cached_only' : 'cached_only'; // Will show fallback
    default:
      return 'live_only';
  }
}

/**
 * Determine source priority for Navigation based on current mode.
 */
function _resolveNavigationSource(
  mode: DataSourceMode,
  offlineAvailable: boolean,
): SourcePriority {
  switch (mode) {
    case 'online':
      // Even when online, show cached hazards and resupply points
      return offlineAvailable ? 'live_preferred' : 'live_only';
    case 'hybrid':
      return offlineAvailable ? 'cached_preferred' : 'live_preferred';
    case 'offline':
      return 'cached_only';
    default:
      return 'live_preferred';
  }
}


// ── Status Message Builder ───────────────────────────────

function _buildStatusMessage(
  mode: DataSourceMode,
  connectivity: ReturnType<typeof _readConnectivityState>,
  offlineReadiness: ReturnType<typeof _readOfflineReadiness>,
): string {
  if (connectivity.state === 'unknown') {
    return 'Evaluating connectivity…';
  }

  if (offlineReadiness.is_downloading) {
    return 'Downloading offline data\u2026';
  }

  switch (mode) {
    case 'online':
      if (offlineReadiness.has_data) {
        return `Online \u2014 ${offlineReadiness.region_count} offline region${offlineReadiness.region_count !== 1 ? 's' : ''} cached`;
      }
      return 'Online \u2014 live data';

    case 'hybrid':
      if (offlineReadiness.has_data) {
        return `Degraded connectivity \u2014 using cached data as fallback`;
      }
      return 'Degraded connectivity \u2014 no offline cache available';

    case 'offline':
      if (offlineReadiness.has_data) {
        const coverage = [];
        if (offlineReadiness.covers_position) coverage.push('position');
        if (offlineReadiness.covers_route) coverage.push('route');
        const coverageText = coverage.length > 0
          ? ` (covers ${coverage.join(' + ')})`
          : '';
        return `Offline \u2014 using ${offlineReadiness.region_count} cached region${offlineReadiness.region_count !== 1 ? 's' : ''}${coverageText}`;
      }
      return 'Offline \u2014 no cached data available';

    default:
      return 'Evaluating connectivity\u2026';
  }
}


// ══════════════════════════════════════════════════════════
// CORE EVALUATION
// ══════════════════════════════════════════════════════════

/**
 * Full interlock evaluation.
 * Reads all system states, computes mode, resolves source priorities,
 * and notifies listeners if state changed.
 */
function _evaluate(): InterlockState {
  const now = Date.now();

  // Memoization check
  if (_cachedState && (now - _cachedStateTimestamp) < EVAL_INTERVAL_MS) {
    return _cachedState;
  }

  try {
    // Read system states
    const connectivity = _readConnectivityState();
    const offlineReadiness = _readOfflineReadiness();

    // Compute and debounce mode
    const rawMode = _computeMode(connectivity, offlineReadiness);
    const debouncedMode = _debounceMode(rawMode);

    // Detect mode change
    const modeChanged = debouncedMode !== _mode;
    if (modeChanged) {
      _previousMode = _mode;
      _mode = debouncedMode;
      _modeChangedAt = new Date().toISOString();
      _inTransition = true;

      // Clear transition flag after window
      if (_transitionEndTimer) clearTimeout(_transitionEndTimer);
      _transitionEndTimer = setTimeout(() => {
        _inTransition = false;
        _transitionEndTimer = null;
        // Re-evaluate after transition settles
        _evaluate();
      }, TRANSITION_WINDOW_MS);

      // Log mode transition (always, not throttled)
      console.log(
        TAG,
        `Mode transition: ${_previousMode} \u2192 ${_mode} ` +
        `(connectivity: ${connectivity.state}, ` +
        `readiness: ${connectivity.operational_readiness}, ` +
        `offline: ${offlineReadiness.has_data ? 'available' : 'none'})`
      );

      // Trigger downstream re-evaluations
      _onModeChange(debouncedMode, _previousMode);
    }

    // Resolve source priorities
    const discoverySource = _resolveDiscoverySource(_mode, offlineReadiness.has_data);
    const navigationSource = _resolveNavigationSource(_mode, offlineReadiness.has_data);

    // Build state
    const state: InterlockState = {
      mode: _mode,
      in_transition: _inTransition,
      previous_mode: _previousMode,
      mode_changed_at: _modeChangedAt,
      discovery_offline_available: offlineReadiness.has_data,
      navigation_offline_available: offlineReadiness.has_data,
      route_covered_offline: offlineReadiness.covers_route,
      position_covered_offline: offlineReadiness.covers_position,
      discovery_source: discoverySource,
      navigation_source: navigationSource,
      offline_region_count: offlineReadiness.region_count,
      offline_entry_count: offlineReadiness.entry_count,
      has_integrity_issues: offlineReadiness.has_integrity_issues,
      has_stale_regions: offlineReadiness.has_stale_regions,
      status_message: _buildStatusMessage(_mode, connectivity, offlineReadiness),
      evaluated_at: new Date().toISOString(),
    };

    // Cache
    _cachedState = state;
    _cachedStateTimestamp = now;
    _evalCount++;

    // Notify listeners if state changed meaningfully
    if (modeChanged || !_cachedState) {
      _notify(state);
    }

    // Verbose logging (throttled)
    if (_shouldLog()) {
      console.log(
        TAG,
        `State: mode=${_mode}, discovery=${discoverySource}, nav=${navigationSource}, ` +
        `offline=${offlineReadiness.has_data ? `${offlineReadiness.region_count}r/${offlineReadiness.entry_count}e` : 'none'}, ` +
        `covers_pos=${offlineReadiness.covers_position}, covers_route=${offlineReadiness.covers_route}`
      );
    }

    return state;
  } catch (e) {
    console.warn(TAG, 'Evaluation error (graceful fallback):', e);
    return _cachedState || _defaultState();
  }
}


// ── Mode Change Handler ──────────────────────────────────

/**
 * Called when the data source mode changes.
 * Triggers downstream re-evaluations in the correct order.
 */
function _onModeChange(newMode: DataSourceMode, previousMode: DataSourceMode | null): void {
  // 1. Invalidate offline cache readiness (forces re-evaluation)
  try {
    const { invalidateCacheReadiness } = require('./offlineCacheAwarenessEngine');
    invalidateCacheReadiness();
  } catch {}

  // 2. Invalidate navigation overlay cache
  try {
    const { offlineNavigationBridge } = require('./offlineNavigationBridge');
    offlineNavigationBridge.invalidateCache();
  } catch {}

  // 3. Trigger Connectivity Intelligence re-evaluation
  try {
    const { connectivityIntelService } = require('./connectivityIntelService');
    connectivityIntelService.invalidateCache();
  } catch {}

  // 4. Publish to ECS bus for Risk Engine and Assistant
  try {
    const { ecsBus } = require('./ecsBus');
    const offlineReadiness = _readOfflineReadiness();
    ecsBus.publish('offline_readiness', 'offline_interlock', {
      updated_at: new Date().toISOString(),
      freshness: offlineReadiness.has_data ? 'live' : 'unavailable',
      available: offlineReadiness.has_data,
      has_data: offlineReadiness.has_data,
      region_count: offlineReadiness.region_count,
      entry_count: offlineReadiness.entry_count,
      covers_position: offlineReadiness.covers_position,
      covers_route: offlineReadiness.covers_route,
    });
  } catch {}
}


// ── Route Change Handler ─────────────────────────────────

/**
 * Called when the active route changes.
 * Re-evaluates offline readiness for the new route.
 */
function _onRouteChange(): void {
  // Invalidate caches that depend on route
  try {
    const { invalidateCacheReadiness } = require('./offlineCacheAwarenessEngine');
    invalidateCacheReadiness();
  } catch {}

  try {
    const { offlineNavigationBridge } = require('./offlineNavigationBridge');
    offlineNavigationBridge.invalidateCache();
  } catch {}

  // Invalidate cached interlock state
  _cachedState = null;
  _cachedStateTimestamp = 0;

  // Re-evaluate
  const state = _evaluate();

  console.log(
    TAG,
    `Route change \u2192 re-evaluated: route_covered=${state.route_covered_offline}, ` +
    `mode=${state.mode}`
  );
}


// ── Region Download Change Handler ───────────────────────

/**
 * Called when offline regions are downloaded, deleted, or updated.
 * Re-evaluates connectivity, remoteness, and risk.
 */
function _onRegionChange(): void {
  // Invalidate all caches
  try {
    const { invalidateCacheReadiness } = require('./offlineCacheAwarenessEngine');
    invalidateCacheReadiness();
  } catch {}

  try {
    const { offlineNavigationBridge } = require('./offlineNavigationBridge');
    offlineNavigationBridge.invalidateCache();
  } catch {}

  // Invalidate cached interlock state
  _cachedState = null;
  _cachedStateTimestamp = 0;

  // Re-evaluate
  const state = _evaluate();

  // Trigger CI re-evaluation (region changes affect operational readiness)
  try {
    const { connectivityIntelService } = require('./connectivityIntelService');
    connectivityIntelService.invalidateCache();
    connectivityIntelService.forceUpdate();
  } catch {}

  console.log(
    TAG,
    `Region change \u2192 re-evaluated: regions=${state.offline_region_count}, ` +
    `entries=${state.offline_entry_count}, mode=${state.mode}`
  );
}


// ── Default State ────────────────────────────────────────

function _defaultState(): InterlockState {
  return {
    mode: 'offline',
    in_transition: false,
    previous_mode: null,
    mode_changed_at: null,
    discovery_offline_available: false,
    navigation_offline_available: false,
    route_covered_offline: false,
    position_covered_offline: false,
    discovery_source: 'cached_only',
    navigation_source: 'cached_only',
    offline_region_count: 0,
    offline_entry_count: 0,
    has_integrity_issues: false,
    has_stale_regions: false,
    status_message: 'Initializing\u2026',
    evaluated_at: new Date().toISOString(),
  };
}


// ── Store Subscriptions ──────────────────────────────────

function _subscribeToStores(): void {
  // Subscribe to Connectivity Intelligence changes
  try {
    const { connectivityIntelStore } = require('./connectivityIntelStore');
    const unsub = connectivityIntelStore.subscribe(() => {
      _cachedState = null;
      _cachedStateTimestamp = 0;
      _evaluate();
    });
    _storeUnsubs.push(unsub);
  } catch {}

  // Subscribe to Offline Expedition DB changes
  try {
    const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
    const unsub = offlineExpeditionDbStore.subscribe(() => {
      _onRegionChange();
    });
    _storeUnsubs.push(unsub);
  } catch {}

  // Subscribe to Route Store changes
  try {
    const { routeStore } = require('./routeStore');
    const unsub = routeStore.subscribe(() => {
      _onRouteChange();
    });
    _storeUnsubs.push(unsub);
  } catch {}

  // Subscribe to Tile Cache Store changes
  try {
    const { tileCacheStore } = require('./tileCacheStore');
    const unsub = tileCacheStore.subscribe(() => {
      _onRegionChange();
    });
    _storeUnsubs.push(unsub);
  } catch {}

  console.log(TAG, `Store subscriptions: ${_storeUnsubs.length} active`);
}

function _unsubscribeFromStores(): void {
  for (const unsub of _storeUnsubs) {
    try { unsub(); } catch {}
  }
  _storeUnsubs = [];
}


// ── App State Handler ────────────────────────────────────

function _handleAppStateChange(nextAppState: AppStateStatus): void {
  if (nextAppState === 'active') {
    // Returning to foreground — force re-evaluation
    _cachedState = null;
    _cachedStateTimestamp = 0;
    _evaluate();
    console.log(TAG, 'App resumed \u2014 re-evaluating interlock state');
  }
}


// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

export const ecsOfflineInterlock = {

  // ── Lifecycle ──────────────────────────────────────────

  /**
   * Initialize the offline interlock.
   * Subscribes to relevant stores and performs initial evaluation.
   */
  initialize(): void {
    if (_initialized) return;

    console.log(TAG, 'Initializing (Integration Pass 3)...');
    _initialized = true;

    _subscribeToStores();

    // App state listener
    try {
      _appStateSubscription = AppState.addEventListener('change', _handleAppStateChange);
    } catch {}

    // Initial evaluation (deferred to let stores settle)
    setTimeout(() => {
      _evaluate();
    }, 1000);
  },

  /**
   * Start monitoring (alias for initialize).
   */
  startMonitoring(): void {
    ecsOfflineInterlock.initialize();
    _monitoring = true;
  },

  /**
   * Stop monitoring and clean up.
   */
  stopMonitoring(): void {
    _unsubscribeFromStores();

    if (_appStateSubscription) {
      _appStateSubscription.remove();
      _appStateSubscription = null;
    }

    if (_transitionEndTimer) {
      clearTimeout(_transitionEndTimer);
      _transitionEndTimer = null;
    }

    _monitoring = false;
    console.log(TAG, `Stopped (evaluations: ${_evalCount})`);
  },


  // ── State Access ───────────────────────────────────────

  /**
   * Get the current interlock state.
   * Triggers re-evaluation if state is stale.
   */
  getState(): InterlockState {
    return _evaluate();
  },

  /**
   * Get the current data source mode.
   */
  getMode(): DataSourceMode {
    return _mode;
  },

  /**
   * Whether the interlock is in a transition between modes.
   */
  isInTransition(): boolean {
    return _inTransition;
  },

  /**
   * Whether the interlock has been initialized.
   */
  isInitialized(): boolean {
    return _initialized;
  },

  /**
   * Whether the interlock is actively monitoring.
   */
  isMonitoring(): boolean {
    return _monitoring;
  },


  // ── Discovery Integration ──────────────────────────────

  /**
   * Determine whether Discovery should use offline data.
   *
   * Returns true when:
   *   - Device is offline AND cached data exists
   *   - Device is in hybrid mode AND cached data covers the area
   *
   * Returns false when:
   *   - Device is online (use live API)
   *   - No cached data exists
   */
  shouldDiscoveryUseOffline(): boolean {
    const state = _evaluate();
    if (state.mode === 'offline' && state.discovery_offline_available) return true;
    if (state.mode === 'hybrid' && state.discovery_offline_available) return true;
    return false;
  },

  /**
   * Get the source priority for Discovery queries.
   */
  getDiscoverySourcePriority(): SourcePriority {
    const state = _evaluate();
    return state.discovery_source;
  },

  /**
   * Check if Discovery should show a fallback message.
   * True when offline with no cached data.
   */
  shouldDiscoveryShowFallback(): boolean {
    const state = _evaluate();
    return state.mode === 'offline' && !state.discovery_offline_available;
  },

  /**
   * Get the Discovery fallback message.
   */
  getDiscoveryFallbackMessage(): string | null {
    if (!ecsOfflineInterlock.shouldDiscoveryShowFallback()) return null;
    return 'No internet connection and no offline expedition data cached for this area. ' +
           'Download offline regions when connected to browse trails offline.';
  },


  // ── Navigation Integration ─────────────────────────────

  /**
   * Determine whether Navigation should show offline overlays.
   *
   * Returns true when:
   *   - Device is offline AND cached data exists
   *   - Device is in hybrid mode AND cached data exists
   *   - Even when online, if hazard data is cached (safety priority)
   */
  shouldNavigationShowOfflineOverlays(): boolean {
    const state = _evaluate();
    if (state.mode === 'offline') return state.navigation_offline_available;
    if (state.mode === 'hybrid') return state.navigation_offline_available;
    // Even online, show cached hazards if available
    return false;
  },

  /**
   * Get the source priority for Navigation overlays.
   */
  getNavigationSourcePriority(): SourcePriority {
    const state = _evaluate();
    return state.navigation_source;
  },

  /**
   * Check if the active route is covered by offline data.
   * Used to determine if route display should continue when going offline.
   */
  isActiveRouteCoveredOffline(): boolean {
    const state = _evaluate();
    return state.route_covered_offline;
  },

  /**
   * Check if the current position is covered by offline data.
   */
  isPositionCoveredOffline(): boolean {
    const state = _evaluate();
    return state.position_covered_offline;
  },


  // ── Source Deduplication ────────────────────────────────

  /**
   * Determine whether to suppress live markers that overlap with cached data.
   * Prevents duplicate markers when both sources are active.
   *
   * In hybrid mode: live data takes priority, cached supplements gaps
   * In online mode: no deduplication needed (cached not shown)
   * In offline mode: no deduplication needed (live not available)
   */
  shouldDeduplicateMarkers(): boolean {
    return _mode === 'hybrid';
  },

  /**
   * Given a set of live marker IDs and cached marker IDs,
   * return the cached IDs that should be suppressed (already in live).
   */
  getSupressedCachedIds(liveIds: Set<string>, cachedIds: Set<string>): Set<string> {
    if (_mode !== 'hybrid') return new Set();
    const suppressed = new Set<string>();
    for (const id of cachedIds) {
      if (liveIds.has(id)) {
        suppressed.add(id);
      }
    }
    return suppressed;
  },


  // ── Filter Preservation ────────────────────────────────

  /**
   * Preserve the current Discovery/Navigation filters before a source switch.
   * Call this before transitioning to a different data source.
   */
  preserveFilters(filters: Partial<PreservedFilters>): void {
    _preservedFilters = {
      distance_radius_mi: filters.distance_radius_mi ?? null,
      categories: filters.categories ?? null,
      search_text: filters.search_text ?? null,
      sort_by: filters.sort_by ?? null,
      preserved_at: new Date().toISOString(),
    };
  },

  /**
   * Get preserved filters from before the last source switch.
   * Returns null if no filters were preserved.
   */
  getPreservedFilters(): PreservedFilters | null {
    return _preservedFilters;
  },

  /**
   * Clear preserved filters (after they've been applied).
   */
  clearPreservedFilters(): void {
    _preservedFilters = null;
  },


  // ── Companion Data ─────────────────────────────────────

  /**
   * Get safe companion data for Android Auto / CarPlay.
   */
  getCompanionData(): CompanionInterlockData {
    const state = _evaluate();
    return {
      mode: state.mode,
      offline_ready: state.discovery_offline_available || state.navigation_offline_available,
      route_covered: state.route_covered_offline,
      status: state.mode === 'offline'
        ? (state.navigation_offline_available ? 'Offline \u2014 Cached' : 'Offline \u2014 Limited')
        : state.mode === 'hybrid'
          ? 'Degraded'
          : 'Online',
    };
  },


  // ── Validation ─────────────────────────────────────────

  /**
   * Check if a region download is truly complete (not interrupted).
   * Prevents falsely marking a region as ready.
   */
  isRegionDownloadComplete(regionId: string): boolean {
    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      const region = offlineExpeditionDbStore.getRegion(regionId);
      if (!region) return false;

      // Must be marked as downloaded
      if (region.download_status !== 'downloaded' && region.download_status !== 'update_available') {
        return false;
      }

      // Must not have invalid integrity
      if (region.integrity_status === 'invalid') return false;

      // Must have all categories completed
      const { DATASET_CATEGORIES } = require('./offlineExpeditionDbTypes');
      const completed = new Set(region.completed_categories || []);
      for (const cat of DATASET_CATEGORIES) {
        if (!completed.has(cat)) return false;
      }

      return true;
    } catch {
      return false;
    }
  },

  /**
   * Check if a stale region is still usable.
   * Stale regions remain usable until safely updated.
   */
  isStaleRegionUsable(regionId: string): boolean {
    try {
      const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
      const region = offlineExpeditionDbStore.getRegion(regionId);
      if (!region) return false;

      // Stale but valid integrity = still usable
      return (
        (region.download_status === 'downloaded' || region.download_status === 'update_available') &&
        region.integrity_status !== 'invalid'
      );
    } catch {
      return false;
    }
  },


  // ── Force Re-evaluation ────────────────────────────────

  /**
   * Force an immediate re-evaluation of the interlock state.
   * Bypasses memoization cache.
   */
  forceEvaluate(): InterlockState {
    _cachedState = null;
    _cachedStateTimestamp = 0;
    return _evaluate();
  },


  // ── Subscriptions ──────────────────────────────────────

  /**
   * Subscribe to interlock state changes.
   * Returns unsubscribe function.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },


  // ── Diagnostics ────────────────────────────────────────

  /**
   * Get diagnostic information for debugging.
   */
  getDiagnostics(): {
    initialized: boolean;
    monitoring: boolean;
    mode: DataSourceMode;
    previous_mode: DataSourceMode | null;
    in_transition: boolean;
    eval_count: number;
    store_subscription_count: number;
    has_preserved_filters: boolean;
    pending_mode: DataSourceMode | null;
    cached_state_age_ms: number;
  } {
    return {
      initialized: _initialized,
      monitoring: _monitoring,
      mode: _mode,
      previous_mode: _previousMode,
      in_transition: _inTransition,
      eval_count: _evalCount,
      store_subscription_count: _storeUnsubs.length,
      has_preserved_filters: _preservedFilters != null,
      pending_mode: _pendingMode,
      cached_state_age_ms: _cachedStateTimestamp > 0 ? Date.now() - _cachedStateTimestamp : -1,
    };
  },


  // ── Reset ──────────────────────────────────────────────

  /**
   * Full reset — stops monitoring and clears all state.
   */
  reset(): void {
    ecsOfflineInterlock.stopMonitoring();
    _mode = 'offline';
    _previousMode = null;
    _modeChangedAt = null;
    _pendingMode = null;
    _pendingModeTimestamp = 0;
    _inTransition = false;
    _cachedState = null;
    _cachedStateTimestamp = 0;
    _preservedFilters = null;
    _evalCount = 0;
    _initialized = false;
    _listeners.clear();
    console.log(TAG, 'Reset complete');
  },
};

