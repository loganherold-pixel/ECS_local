/**
 * Dashboard Mode Engine — Phase 5: Context-Aware Auto-Activation
 *
 * Evaluates driving conditions to intelligently switch between
 * Highway and Expedition dashboard modes automatically.
 *
 * ═══════════════════════════════════════════════════════════════
 * Phase 5 Enhancements:
 *   - Sustained condition tracking: 30-second delay before switching
 *   - Geofence exit signal (signal D)
 *   - Route type signal (signal E)
 *   - Mode activation notification banner
 *   - CarPlay / Android Auto companion bridge sync
 *   - Manual override visible indicator
 *   - Improved fail-safes for missing data
 *   - Independent widget layout preservation per mode
 * ═══════════════════════════════════════════════════════════════
 *
 * Signals evaluated:
 *   A) Road Classification — from Mapbox road type (via roadClassificationBridge)
 *   B) GPS Speed — from gpsUIState (throttled 1Hz)
 *   C) Remoteness Index — from remotenessStore
 *   D) Geofence Exit — from expeditionStateStore (populated area exit)
 *   E) Route Type — from routeStore (trail/off-road/expedition route)
 *
 * Decision Logic:
 *   - Need ≥2 signals agreeing on a mode to trigger a recommendation
 *   - Conditions must be sustained for 30 seconds before switching
 *   - If conditions revert before 30s, the pending switch is cancelled
 *   - After switch, 60-second cooldown prevents rapid toggling
 *
 * Mode States:
 *   - 'highway'         — auto-selected or manually selected highway mode
 *   - 'expedition'      — auto-selected or manually selected expedition mode
 *   - 'manual_override' — user has disabled auto-switching (visible indicator)
 *
 * Expedition Mode prioritizes:
 *   Attitude Monitor, Remoteness, Vehicle Systems, Progress, Sustainability
 *
 * Highway Mode prioritizes:
 *   Navigation, Fuel/Range, Weather, Quick Actions, Road Travel Status
 *
 * Fail-Safes:
 *   - 60-second cooldown after any switch
 *   - 30-second sustained condition requirement
 *   - No switching when GPS signal is lost
 *   - No switching when user recently switched manually
 *   - Graceful degradation when signals are unavailable
 *   - Auto mode can be toggled on/off
 *
 * Architecture:
 *   - Timer-driven evaluation every 10 seconds
 *   - Subscribe/get pattern for reactive UI updates
 *   - Integrates with gpsUIState, remotenessStore, expeditionStateStore, routeStore
 *   - Syncs mode to CarPlay/Android Auto companion bridges
 */

import { gpsUIState } from './gpsUIState';
import { getRemotenessRuntimeSnapshot } from './remotenessRuntime';

// ── Types ───────────────────────────────────────────────

export type DashboardModeState = 'highway' | 'expedition' | 'manual_override';

export type RoadClassification =
  | 'motorway'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'service'
  | 'track'
  | 'trail'
  | 'unclassified'
  | 'unknown';

export type RecommendedMode = 'highway' | 'expedition' | null;

export interface ModeEngineOutput {
  /** Current active mode */
  currentMode: 'highway' | 'expedition';
  /** Whether auto-switching is enabled */
  autoModeEnabled: boolean;
  /** Whether a switch is currently being recommended (banner visible) */
  switchRecommended: boolean;
  /** The recommended mode to switch to (null if no recommendation) */
  recommendedMode: RecommendedMode;
  /** Reason for the recommendation */
  recommendationReason: string;
  /** Time remaining on the recommendation banner (seconds) */
  bannerCountdown: number;
  /** Whether the engine is in cooldown (recently switched) */
  inCooldown: boolean;
  /** Whether manual override is active (auto-switching disabled by user) */
  isManualOverride: boolean;
  /** Individual signal values for debugging/display */
  signals: {
    roadType: RoadClassification;
    speedMph: number | null;
    remotenessScore: number;
    remotenessTier: string;
    hasGpsFix: boolean;
    geofenceExited: boolean;
    routeType: string;
  };
  /** Phase 5: Mode activation notification */
  modeActivation: {
    /** Whether a mode activation banner should be shown */
    showBanner: boolean;
    /** The mode that was just activated */
    activatedMode: 'highway' | 'expedition' | null;
    /** Banner text (e.g., "Expedition Mode Active") */
    bannerText: string;
  };
  /** Phase 5: Sustained condition tracking */
  sustainedCondition: {
    /** Whether conditions are being sustained toward a switch */
    isSustaining: boolean;
    /** How many seconds conditions have been sustained */
    sustainedSeconds: number;
    /** Required seconds before switch (30) */
    requiredSeconds: number;
    /** The mode being sustained toward */
    targetMode: RecommendedMode;
  };
}

// ── Constants ───────────────────────────────────────────────

/** Evaluation interval (how often we check conditions) */
const EVAL_INTERVAL_MS = 10_000; // 10 seconds

/** Cooldown after a mode switch before re-evaluating */
const SWITCH_COOLDOWN_MS = 60_000; // 60 seconds

/** How long the banner shows before auto-switching */
const BANNER_AUTO_SWITCH_MS = 5_000; // 5 seconds

/** Phase 5: Sustained condition requirement before recommending a switch */
const SUSTAINED_CONDITION_MS = 30_000; // 30 seconds

/** Speed thresholds */
const HIGHWAY_SPEED_THRESHOLD_MPH = 30;
const EXPEDITION_SPEED_THRESHOLD_MPH = 20;

/** Remoteness threshold for favoring expedition */
const REMOTENESS_EXPEDITION_THRESHOLD = 60;

/** Minimum confidence signals needed to recommend a switch */
const MIN_CONFIDENCE_SIGNALS = 2;

/** Phase 5: Mode activation banner display duration */
const MODE_ACTIVATION_BANNER_MS = 3_000; // 3 seconds

// ── Road Classification Scoring ─────────────────────────

type RoadBias = 'highway' | 'expedition' | 'neutral';

const ROAD_BIAS: Record<RoadClassification, RoadBias> = {
  motorway: 'highway',
  primary: 'highway',
  secondary: 'highway',
  tertiary: 'neutral',
  service: 'neutral',
  track: 'expedition',
  trail: 'expedition',
  unclassified: 'expedition',
  unknown: 'neutral',
};

// ── Internal State ──────────────────────────────────────

let _currentMode: 'highway' | 'expedition' = 'highway';
let _autoModeEnabled = true;
let _isManualOverride = false;

// Road classification (fed externally from map data)
let _currentRoadType: RoadClassification = 'unknown';

// Direct speed feed (fed externally from GPS)
let _directSpeedMph: number | null = null;
let _directSpeedTimestamp = 0;
const DIRECT_SPEED_STALE_MS = 15_000; // 15 seconds before direct speed is considered stale

// Phase 5: Geofence exit signal (fed from expeditionStateStore)
let _geofenceExited = false;
let _geofenceExitTimestamp = 0;
const GEOFENCE_SIGNAL_STALE_MS = 120_000; // 2 minutes

// Phase 5: Route type signal (fed from routeStore)
let _currentRouteType = 'unknown'; // 'highway', 'trail', 'off-road', 'expedition', 'unknown'

// Switch recommendation state
let _switchRecommended = false;
let _recommendedMode: RecommendedMode = null;
let _recommendationReason = '';
let _bannerCountdown = 0;
let _bannerTimerActive = false;

// Phase 5: Sustained condition tracking
let _sustainedTargetMode: RecommendedMode = null;
let _sustainedStartTime = 0;
let _sustainedSeconds = 0;

// Phase 5: Mode activation notification
let _modeActivationBanner = false;
let _modeActivationMode: 'highway' | 'expedition' | null = null;
let _modeActivationText = '';
let _modeActivationTimer: ReturnType<typeof setTimeout> | null = null;

// Cooldown state
let _lastSwitchTime = 0;
let _lastManualSwitchTime = 0;

// Timers
let _evalTimer: ReturnType<typeof setInterval> | null = null;
let _bannerTimer: ReturnType<typeof setInterval> | null = null;
let _isRunning = false;

// Cached output for identity stability
let _cachedOutput: ModeEngineOutput | null = null;

// Listeners
type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify(): void {
  _cachedOutput = null; // Invalidate cache
  for (const fn of _listeners) {
    try { fn(); } catch {}
  }
}

// ── Signal Gathering ────────────────────────────────────

interface GatheredSignals {
  roadType: RoadClassification;
  speedMph: number | null;
  remotenessScore: number;
  remotenessTier: string;
  hasGpsFix: boolean;
  geofenceExited: boolean;
  routeType: string;
}

function _gatherSignals(): GatheredSignals {
  // GPS state
  let hasGpsFix = false;
  let speedMph: number | null = null;

  try {
    const gps = gpsUIState.get();
    hasGpsFix = gps.hasFix;

    // Prefer direct speed feed from Navigate tab if fresh,
    // otherwise fall back to gpsUIState speed
    const now = Date.now();
    if (_directSpeedMph !== null && (now - _directSpeedTimestamp) < DIRECT_SPEED_STALE_MS) {
      speedMph = _directSpeedMph;
    } else if (hasGpsFix && gps.position) {
      speedMph = gps.position.speedMph ?? null;
    }
  } catch {
    // GPS unavailable — fail gracefully
  }

  // Remoteness
  let remotenessScore = 0;
  let remotenessTier = 'NEAR CIVILIZATION';
  try {
    const remoteness = getRemotenessRuntimeSnapshot();
    remotenessScore = remoteness.score;
    remotenessTier = remoteness.tier ?? 'NEAR CIVILIZATION';
  } catch {
    // Remoteness unavailable — fail gracefully
  }

  // Phase 5: Geofence exit freshness check
  const now = Date.now();
  const geofenceExited = _geofenceExited && (now - _geofenceExitTimestamp) < GEOFENCE_SIGNAL_STALE_MS;

  return {
    roadType: _currentRoadType,
    speedMph,
    remotenessScore,
    remotenessTier,
    hasGpsFix,
    geofenceExited,
    routeType: _currentRouteType,
  };
}


// ── Decision Logic ──────────────────────────────────────

function _evaluateRecommendation(signals: GatheredSignals): {
  recommended: RecommendedMode;
  reason: string;
} {
  // Fail-safe: no GPS fix → no recommendation
  if (!signals.hasGpsFix) {
    return { recommended: null, reason: '' };
  }

  // Count signals favoring each mode
  let highwaySignals = 0;
  let expeditionSignals = 0;
  const reasons: string[] = [];

  // Signal A: Road Classification
  const roadBias = ROAD_BIAS[signals.roadType];
  if (roadBias === 'highway') {
    highwaySignals++;
    reasons.push(`Road: ${signals.roadType}`);
  } else if (roadBias === 'expedition') {
    expeditionSignals++;
    reasons.push(`Road: ${signals.roadType}`);
  }

  // Signal B: Speed
  if (signals.speedMph !== null) {
    if (signals.speedMph > HIGHWAY_SPEED_THRESHOLD_MPH) {
      highwaySignals++;
      reasons.push(`Speed: ${Math.round(signals.speedMph)} mph`);
    } else if (signals.speedMph < EXPEDITION_SPEED_THRESHOLD_MPH) {
      expeditionSignals++;
      reasons.push(`Speed: ${Math.round(signals.speedMph)} mph`);
    }
  }

  // Signal C: Remoteness Index
  if (signals.remotenessScore > REMOTENESS_EXPEDITION_THRESHOLD) {
    expeditionSignals++;
    reasons.push(`Remoteness: ${signals.remotenessTier}`);
  } else if (signals.remotenessScore < 20) {
    highwaySignals++;
    reasons.push('Low remoteness');
  }

  // Signal D: Geofence Exit (Phase 5)
  if (signals.geofenceExited) {
    expeditionSignals++;
    reasons.push('Geofence exit detected');
  }

  // Signal E: Route Type (Phase 5)
  if (signals.routeType === 'trail' || signals.routeType === 'off-road' || signals.routeType === 'expedition') {
    expeditionSignals++;
    reasons.push(`Route: ${signals.routeType}`);
  } else if (signals.routeType === 'highway' || signals.routeType === 'road') {
    highwaySignals++;
    reasons.push(`Route: ${signals.routeType}`);
  }

  // Decision: need at least MIN_CONFIDENCE_SIGNALS agreeing
  if (highwaySignals >= MIN_CONFIDENCE_SIGNALS && _currentMode !== 'highway') {
    return {
      recommended: 'highway',
      reason: reasons.join(' \u2022 '),
    };
  }

  if (expeditionSignals >= MIN_CONFIDENCE_SIGNALS && _currentMode !== 'expedition') {
    return {
      recommended: 'expedition',
      reason: reasons.join(' \u2022 '),
    };
  }

  return { recommended: null, reason: '' };
}

// ── Phase 5: Sustained Condition Tracking ───────────────

function _updateSustainedCondition(recommended: RecommendedMode): void {
  const now = Date.now();

  if (recommended === null) {
    // Conditions reverted — cancel sustained tracking
    if (_sustainedTargetMode !== null) {
      _sustainedTargetMode = null;
      _sustainedStartTime = 0;
      _sustainedSeconds = 0;
    }
    return;
  }

  if (recommended === _sustainedTargetMode) {
    // Same target — update sustained duration
    _sustainedSeconds = Math.round((now - _sustainedStartTime) / 1000);
  } else {
    // New target — reset sustained tracking
    _sustainedTargetMode = recommended;
    _sustainedStartTime = now;
    _sustainedSeconds = 0;
  }
}

function _isSustainedConditionMet(): boolean {
  if (_sustainedTargetMode === null) return false;
  return (Date.now() - _sustainedStartTime) >= SUSTAINED_CONDITION_MS;
}

// ── Phase 5: Mode Activation Banner ─────────────────────

function _showModeActivationBanner(mode: 'highway' | 'expedition'): void {
  // Clear any existing timer
  if (_modeActivationTimer) {
    clearTimeout(_modeActivationTimer);
    _modeActivationTimer = null;
  }

  const label = mode === 'expedition' ? 'Expedition' : 'Highway';
  _modeActivationBanner = true;
  _modeActivationMode = mode;
  _modeActivationText = `${label} Mode Active`;

  _notify();

  // Auto-dismiss after 3 seconds
  _modeActivationTimer = setTimeout(() => {
    _modeActivationBanner = false;
    _modeActivationMode = null;
    _modeActivationText = '';
    _modeActivationTimer = null;
    _notify();
  }, MODE_ACTIVATION_BANNER_MS);
}

// ── Phase 5: Companion Bridge Sync ──────────────────────

function _syncCompanionBridges(mode: 'highway' | 'expedition'): void {
  // Sync to CarPlay and Android Auto bridges
  // These are async but we fire-and-forget
  try {
    // Dynamic import to avoid circular dependencies
    // The bridges expose setDisplayMode() which pushes to native
    const displayMode = mode === 'expedition' ? 'expedition' : 'highway';

    // Emit a custom event that bridges can listen to
    _companionListeners.forEach(fn => {
      try { fn(displayMode); } catch {}
    });
  } catch {
    // Companion bridges unavailable — fail gracefully
  }
}

// Companion bridge listeners (CarPlay/Android Auto subscribe to these)
type CompanionListener = (mode: string) => void;
const _companionListeners = new Set<CompanionListener>();

// ── Banner Countdown ────────────────────────────────────

function _startBannerCountdown(): void {
  if (_bannerTimerActive) return;
  _bannerTimerActive = true;
  _bannerCountdown = Math.ceil(BANNER_AUTO_SWITCH_MS / 1000);

  _bannerTimer = setInterval(() => {
    _bannerCountdown--;
    if (_bannerCountdown <= 0) {
      // Auto-switch
      _performSwitch(_recommendedMode!);
      _clearBanner();
    }
    _notify();
  }, 1000);
}

function _clearBanner(): void {
  _switchRecommended = false;
  _recommendedMode = null;
  _recommendationReason = '';
  _bannerCountdown = 0;
  _bannerTimerActive = false;
  if (_bannerTimer) {
    clearInterval(_bannerTimer);
    _bannerTimer = null;
  }
}

// ── Mode Switch Execution ───────────────────────────────

function _performSwitch(newMode: 'highway' | 'expedition'): void {
  const prevMode = _currentMode;
  _currentMode = newMode;
  _lastSwitchTime = Date.now();

  // Reset sustained condition tracking
  _sustainedTargetMode = null;
  _sustainedStartTime = 0;
  _sustainedSeconds = 0;

  _clearBanner();

  // Phase 5: Show mode activation banner
  _showModeActivationBanner(newMode);

  // Phase 5: Sync to companion bridges (CarPlay / Android Auto)
  _syncCompanionBridges(newMode);

  _notify();
}

// ── Core Evaluation (timer-driven) ──────────────────────

function _evaluate(): void {
  // Skip if auto mode is disabled or manual override active
  if (!_autoModeEnabled || _isManualOverride) return;

  // Skip if in cooldown
  const now = Date.now();
  if (now - _lastSwitchTime < SWITCH_COOLDOWN_MS) return;
  if (now - _lastManualSwitchTime < SWITCH_COOLDOWN_MS) return;

  // Skip if a banner is already showing
  if (_switchRecommended) return;

  const signals = _gatherSignals();
  const { recommended, reason } = _evaluateRecommendation(signals);

  // Phase 5: Update sustained condition tracking
  _updateSustainedCondition(recommended);

  if (recommended && recommended !== _currentMode) {
    // Phase 5: Only show recommendation after sustained 30-second condition
    if (_isSustainedConditionMet()) {
      _switchRecommended = true;
      _recommendedMode = recommended;
      _recommendationReason = reason;
      _startBannerCountdown();
    }
    // If not yet sustained, the tracking continues on next eval tick
  }

  _notify();
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

export const dashboardModeEngine = {
  /**
   * Get current engine output.
   * Returns a stable cached object when values haven't changed.
   */
  get(): ModeEngineOutput {
    if (_cachedOutput) return _cachedOutput;

    const signals = _gatherSignals();
    const inCooldown = (Date.now() - _lastSwitchTime < SWITCH_COOLDOWN_MS) ||
                       (Date.now() - _lastManualSwitchTime < SWITCH_COOLDOWN_MS);

    _cachedOutput = {
      currentMode: _currentMode,
      autoModeEnabled: _autoModeEnabled,
      switchRecommended: _switchRecommended,
      recommendedMode: _recommendedMode,
      recommendationReason: _recommendationReason,
      bannerCountdown: _bannerCountdown,
      inCooldown,
      isManualOverride: _isManualOverride,
      signals: {
        roadType: signals.roadType,
        speedMph: signals.speedMph,
        remotenessScore: signals.remotenessScore,
        remotenessTier: signals.remotenessTier,
        hasGpsFix: signals.hasGpsFix,
        geofenceExited: signals.geofenceExited,
        routeType: signals.routeType,
      },
      modeActivation: {
        showBanner: _modeActivationBanner,
        activatedMode: _modeActivationMode,
        bannerText: _modeActivationText,
      },
      sustainedCondition: {
        isSustaining: _sustainedTargetMode !== null,
        sustainedSeconds: _sustainedSeconds,
        requiredSeconds: Math.round(SUSTAINED_CONDITION_MS / 1000),
        targetMode: _sustainedTargetMode,
      },
    };

    return _cachedOutput;
  },

  /**
   * Get the current active dashboard mode.
   */
  getCurrentMode(): 'highway' | 'expedition' {
    return _currentMode;
  },

  /**
   * Whether auto-switching is enabled.
   */
  isAutoModeEnabled(): boolean {
    return _autoModeEnabled;
  },

  /**
   * Whether manual override is active.
   */
  isManualOverride(): boolean {
    return _isManualOverride;
  },

  /**
   * Toggle auto mode on/off.
   * When disabled, the engine stops recommending switches
   * and sets manual override state.
   */
  setAutoMode(enabled: boolean): void {
    _autoModeEnabled = enabled;
    if (!enabled) {
      _isManualOverride = true;
      _clearBanner();
      // Reset sustained tracking
      _sustainedTargetMode = null;
      _sustainedStartTime = 0;
      _sustainedSeconds = 0;
    } else {
      _isManualOverride = false;
    }
    _cachedOutput = null;
    _notify();
  },

  /**
   * Manually set the dashboard mode.
   * This triggers a manual override cooldown.
   */
  setMode(mode: 'highway' | 'expedition'): void {
    const prevMode = _currentMode;
    _currentMode = mode;
    _lastManualSwitchTime = Date.now();
    _clearBanner();

    // Reset sustained tracking
    _sustainedTargetMode = null;
    _sustainedStartTime = 0;
    _sustainedSeconds = 0;

    // Phase 5: Show activation banner on manual switch too
    if (prevMode !== mode) {
      _showModeActivationBanner(mode);
      _syncCompanionBridges(mode);
    }

    _cachedOutput = null;
    _notify();
  },

  /**
   * Accept the recommended switch.
   * Called when user taps "Switch" on the banner.
   */
  acceptSwitch(): void {
    if (_recommendedMode) {
      _performSwitch(_recommendedMode);
    }
  },

  /**
   * Dismiss the recommended switch.
   * Called when user taps "Stay Current" on the banner.
   */
  dismissSwitch(): void {
    _clearBanner();
    // Reset sustained tracking
    _sustainedTargetMode = null;
    _sustainedStartTime = 0;
    _sustainedSeconds = 0;
    // Set a cooldown so we don't immediately re-recommend
    _lastSwitchTime = Date.now();
    _notify();
  },

  /**
   * Dismiss the mode activation banner manually.
   */
  dismissActivationBanner(): void {
    if (_modeActivationTimer) {
      clearTimeout(_modeActivationTimer);
      _modeActivationTimer = null;
    }
    _modeActivationBanner = false;
    _modeActivationMode = null;
    _modeActivationText = '';
    _cachedOutput = null;
    _notify();
  },

  /**
   * Feed road classification data from the map system.
   * Called when the user's road type changes.
   */
  feedRoadClassification(roadType: RoadClassification): void {
    _currentRoadType = roadType;
    _cachedOutput = null;
    // Don't trigger evaluation here — let the timer handle it
  },

  /**
   * Feed GPS speed data directly from the Navigate tab.
   * Called when gps.position changes with a new speedMph value.
   * This provides a direct, low-latency speed signal that takes
   * priority over the gpsUIState fallback in _gatherSignals().
   * Stale after 15 seconds (DIRECT_SPEED_STALE_MS).
   */
  feedSpeed(speedMph: number): void {
    _directSpeedMph = speedMph;
    _directSpeedTimestamp = Date.now();
    _cachedOutput = null; // Invalidate so next get() reflects new speed
  },

  /**
   * Phase 5: Feed geofence exit signal.
   * Called when the user exits a populated-area geofence.
   * This is a strong expedition indicator.
   */
  feedGeofenceExit(exited: boolean): void {
    _geofenceExited = exited;
    if (exited) {
      _geofenceExitTimestamp = Date.now();
    }
    _cachedOutput = null;
  },

  /**
   * Phase 5: Feed route type signal.
   * Called when the active route type changes.
   * Values: 'highway', 'road', 'trail', 'off-road', 'expedition', 'unknown'
   */
  feedRouteType(routeType: string): void {
    _currentRouteType = routeType || 'unknown';
    _cachedOutput = null;
  },

  /**
   * Phase 5: Subscribe to companion bridge mode changes.
   * CarPlay and Android Auto bridges call this to receive mode updates.
   * Returns unsubscribe function.
   */
  subscribeCompanion(fn: CompanionListener): () => void {
    _companionListeners.add(fn);
    return () => { _companionListeners.delete(fn); };
  },


  /**
   * Start the evaluation engine.
   * Call when the dashboard mounts.
   */
  start(): void {
    if (_isRunning) return;
    _isRunning = true;

    // Immediate first evaluation
    _evaluate();

    // Periodic evaluation
    _evalTimer = setInterval(_evaluate, EVAL_INTERVAL_MS);
  },

  /**
   * Stop the evaluation engine.
   * Call when the dashboard unmounts.
   */
  stop(): void {
    _isRunning = false;
    if (_evalTimer) {
      clearInterval(_evalTimer);
      _evalTimer = null;
    }
    _clearBanner();
    // Don't clear activation banner — let it finish its display
  },

  /**
   * Whether the engine is actively evaluating.
   */
  isRunning(): boolean {
    return _isRunning;
  },

  /**
   * Reset all state.
   */
  reset(): void {
    dashboardModeEngine.stop();
    _currentMode = 'highway';
    _autoModeEnabled = true;
    _isManualOverride = false;
    _currentRoadType = 'unknown';
    _directSpeedMph = null;
    _directSpeedTimestamp = 0;
    _geofenceExited = false;
    _geofenceExitTimestamp = 0;
    _currentRouteType = 'unknown';
    _switchRecommended = false;
    _recommendedMode = null;
    _recommendationReason = '';
    _bannerCountdown = 0;
    _sustainedTargetMode = null;
    _sustainedStartTime = 0;
    _sustainedSeconds = 0;
    _modeActivationBanner = false;
    _modeActivationMode = null;
    _modeActivationText = '';
    if (_modeActivationTimer) {
      clearTimeout(_modeActivationTimer);
      _modeActivationTimer = null;
    }
    _lastSwitchTime = 0;
    _lastManualSwitchTime = 0;
    _cachedOutput = null;
    _notify();
  },


  /**
   * Subscribe to engine state changes.
   * Returns unsubscribe function.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};

