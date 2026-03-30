/**
 * ECS Inactivity Guard — Phase 6
 *
 * Pauses all automatic narrative event logging when the app is
 * inactive for an extended period, and prevents false timeline
 * entries during inactivity.
 *
 * DEFINITION OF INACTIVE:
 *   App in background state
 *   OR app not foreground-active
 *   OR no GPS updates detected
 *   …for > 5 minutes (INACTIVITY_THRESHOLD_MS)
 *
 * BEHAVIOR:
 *   1) When inactivity threshold exceeded:
 *      - Set paused = true
 *      - Suspend all automatic event logging
 *      - Do not generate remoteness, waypoint, payload, or offline events
 *
 *   2) When user returns to active app state:
 *      - Resume tracking (paused = false)
 *      - Fire onResume callback → narrative engine emits
 *        a single "Resumed tracking" event
 *
 *   3) Do not retroactively generate events for the inactive period.
 *
 *   4) If expeditionState === IN_PROGRESS and inactivity > 60 min:
 *      - Do NOT auto-end expedition.
 *      - Simply remain paused.
 *
 * PERFORMANCE:
 *   - Checks inactivity state via timer every 30 seconds.
 *   - Uses AppState from React Native for lifecycle hooks.
 *   - Reads gpsUIState.get().lastEmitTs for GPS freshness.
 *
 * ARCHITECTURE:
 *   - Singleton module with start/stop lifecycle
 *   - Narrative engine calls start() on engine start, stop() on engine stop
 *   - Narrative engine checks isPaused() before emitting automatic events
 *   - On resume, narrative engine receives callback to emit "Resumed tracking"
 */

import { AppState, type AppStateStatus } from 'react-native';
import { gpsUIState } from './gpsUIState';

// ══════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════

/** Inactivity threshold before pausing (ms) — 5 minutes */
const INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000;

/** How often to check inactivity state (ms) — 30 seconds */
const CHECK_INTERVAL_MS = 30_000;

// ══════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════

/** Whether automatic event logging is currently paused */
let _paused = false;

/** Whether the guard is actively running */
let _running = false;

/** Timestamp of last detected activity (ms since epoch) */
let _lastActivityTs = 0;

/** Current AppState value */
let _appState: AppStateStatus = 'active';

/** Timer for periodic inactivity checks */
let _checkTimer: ReturnType<typeof setInterval> | null = null;

/** AppState subscription */
let _appStateSubscription: { remove: () => void } | null = null;

/** GPS state subscription */
let _gpsUnsub: (() => void) | null = null;

/** Callback fired when transitioning from paused → active */
let _onResumeCallback: ((pauseDurationMs: number) => void) | null = null;

/** Timestamp when pause began (for computing pause duration) */
let _pauseStartTs = 0;

// ══════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ══════════════════════════════════════════════════════════

/**
 * Record that user activity was detected.
 * Resets the inactivity timer.
 */
function _recordActivity(): void {
  _lastActivityTs = Date.now();
}

/**
 * Determine whether the app is currently in an inactive state.
 *
 * Inactive = any of:
 *   - AppState is not 'active' (background, inactive)
 *   - No GPS updates for > INACTIVITY_THRESHOLD_MS
 *   - No recorded activity for > INACTIVITY_THRESHOLD_MS
 */
function _isInactive(): boolean {
  const now = Date.now();

  // 1. App not in foreground
  if (_appState !== 'active') {
    const timeSinceActivity = now - _lastActivityTs;
    return timeSinceActivity >= INACTIVITY_THRESHOLD_MS;
  }

  // 2. Check GPS freshness — if GPS is feeding, user is active
  try {
    const gpsState = gpsUIState.get();
    if (gpsState.lastEmitTs > 0) {
      const gpsFreshness = now - gpsState.lastEmitTs;
      if (gpsFreshness < INACTIVITY_THRESHOLD_MS) {
        // GPS is fresh — user is active
        _recordActivity();
        return false;
      }
    }
  } catch {
    // gpsUIState may not be initialized
  }

  // 3. Check general activity timestamp
  const timeSinceActivity = now - _lastActivityTs;
  return timeSinceActivity >= INACTIVITY_THRESHOLD_MS;
}

/**
 * Handle AppState change events.
 *
 * When app goes to background: record the timestamp.
 * When app returns to foreground: record activity and
 * potentially trigger resume if was paused.
 */
function _onAppStateChange(nextState: AppStateStatus): void {
  const prevState = _appState;
  _appState = nextState;

  if (!_running) return;

  // App returned to foreground
  if (nextState === 'active' && prevState !== 'active') {
    _recordActivity();

    // If we were paused, trigger resume
    if (_paused) {
      _triggerResume();
    }
  }

  // App went to background — note: we don't immediately pause.
  // The 30-second check timer will detect inactivity after the
  // threshold is exceeded. This prevents false pauses from brief
  // app switches (e.g., checking a text message).
}

/**
 * Periodic check for inactivity state.
 * Called every CHECK_INTERVAL_MS (30 seconds).
 */
function _checkInactivity(): void {
  if (!_running) return;

  const inactive = _isInactive();

  if (inactive && !_paused) {
    // Transition: active → paused
    _paused = true;
    _pauseStartTs = Date.now();
    console.log('[InactivityGuard] Paused — inactivity threshold exceeded');
  } else if (!inactive && _paused) {
    // Transition: paused → active
    _triggerResume();
  }
}

/**
 * Trigger the resume transition.
 * Sets paused = false and fires the onResume callback
 * with the pause duration.
 */
function _triggerResume(): void {
  if (!_paused) return;

  const pauseDuration = _pauseStartTs > 0
    ? Date.now() - _pauseStartTs
    : 0;

  _paused = false;
  _pauseStartTs = 0;
  _recordActivity();

  console.log(
    `[InactivityGuard] Resumed — was paused for ${Math.round(pauseDuration / 1000)}s`
  );

  // Fire callback so narrative engine can emit "Resumed tracking"
  if (_onResumeCallback) {
    try {
      _onResumeCallback(pauseDuration);
    } catch (err) {
      console.warn('[InactivityGuard] onResume callback error:', err);
    }
  }
}

/**
 * Handle GPS state changes — any GPS update means the user
 * is active (device is receiving location data).
 */
function _onGPSUpdate(): void {
  if (!_running) return;

  _recordActivity();

  // If we were paused and GPS just came in, resume
  if (_paused) {
    _triggerResume();
  }
}

// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

export const inactivityGuard = {
  /**
   * Start the inactivity guard.
   *
   * @param onResume — Callback fired when transitioning from
   *   paused → active. Receives the pause duration in ms.
   *   The narrative engine uses this to emit "Resumed tracking".
   */
  start(onResume: (pauseDurationMs: number) => void): void {
    if (_running) return;

    _running = true;
    _paused = false;
    _pauseStartTs = 0;
    _onResumeCallback = onResume;
    _recordActivity();

    // Get current AppState
    _appState = AppState.currentState || 'active';

    // Subscribe to AppState changes
    _appStateSubscription = AppState.addEventListener(
      'change',
      _onAppStateChange,
    );

    // Subscribe to GPS updates (any GPS update = activity)
    _gpsUnsub = gpsUIState.subscribe(_onGPSUpdate);

    // Start periodic inactivity check (every 30s)
    _checkTimer = setInterval(_checkInactivity, CHECK_INTERVAL_MS);

    console.log('[InactivityGuard] Started');
  },

  /**
   * Stop the inactivity guard.
   * Cleans up all subscriptions and timers.
   */
  stop(): void {
    if (!_running) return;

    _running = false;
    _paused = false;
    _pauseStartTs = 0;
    _onResumeCallback = null;

    // Remove AppState listener
    if (_appStateSubscription) {
      _appStateSubscription.remove();
      _appStateSubscription = null;
    }

    // Remove GPS subscription
    if (_gpsUnsub) {
      _gpsUnsub();
      _gpsUnsub = null;
    }

    // Clear check timer
    if (_checkTimer) {
      clearInterval(_checkTimer);
      _checkTimer = null;
    }

    console.log('[InactivityGuard] Stopped');
  },

  /**
   * Whether automatic event logging is currently paused
   * due to inactivity.
   *
   * The narrative engine checks this before emitting any
   * automatic event. If true, the event is silently suppressed.
   */
  isPaused(): boolean {
    return _paused;
  },

  /**
   * Whether the guard is currently running.
   */
  isRunning(): boolean {
    return _running;
  },

  /**
   * Manually record user activity.
   *
   * Call this when the user performs an explicit action
   * (e.g., taps a button, opens a modal) to prevent
   * false inactivity detection while the user is actively
   * using the app but GPS is unavailable.
   */
  recordActivity(): void {
    _recordActivity();

    // If paused and user explicitly interacted, resume
    if (_paused && _running) {
      _triggerResume();
    }
  },

  /**
   * Get diagnostic info for debugging.
   */
  getState(): {
    running: boolean;
    paused: boolean;
    lastActivityTs: number;
    appState: AppStateStatus;
    pauseStartTs: number;
    msSinceActivity: number;
  } {
    return {
      running: _running,
      paused: _paused,
      lastActivityTs: _lastActivityTs,
      appState: _appState,
      pauseStartTs: _pauseStartTs,
      msSinceActivity: _lastActivityTs > 0 ? Date.now() - _lastActivityTs : -1,
    };
  },

  /**
   * Reset the guard completely (for testing/cleanup).
   */
  reset(): void {
    inactivityGuard.stop();
    _lastActivityTs = 0;
    _appState = 'active';
  },
};

