/**
 * VehicleDisplayModeEngine — Context-Aware Mode Switching
 *
 * Evaluates driving conditions to intelligently switch between
 * HighwayDrive and ExpeditionDrive vehicle display modes.
 *
 * Reuses ECS context detection signals:
 *   A) Road Classification — from Mapbox road type
 *   B) Vehicle Speed — from gpsUIState
 *   C) Remoteness Index — from remotenessStore
 *   D) Active Expedition — from missionStore
 *
 * Decision Logic:
 *   - Speed > 35 mph + highway road type → HighwayDrive
 *   - Trail/track road type OR remoteness > threshold → ExpeditionDrive
 *   - Active expedition biases toward ExpeditionDrive
 *   - Mixed signals → maintain current mode (hysteresis)
 *
 * Stability / Anti-Flipping:
 *   - 15-second confirmation window: target mode conditions must
 *     remain true for 15 seconds before switching
 *   - 45-second cooldown after any switch
 *   - No switching when GPS signal is lost
 *   - Manual override disables auto-switching
 *   - Minimum 2 agreeing signals required
 *
 * Manual Override:
 *   - Auto: automatic context-based switching (default)
 *   - Highway: force HighwayDrive regardless of context
 *   - Expedition: force ExpeditionDrive regardless of context
 *
 * Transition Notices:
 *   - Brief non-blocking message when mode changes
 *   - Auto-clears after 5 seconds
 *   - Shows "Switched to Highway Mode" or "Switched to Expedition Mode"
 *
 * Architecture:
 *   - Timer-driven evaluation every 8 seconds
 *   - Subscribe/get pattern for reactive UI updates
 *   - Integrates with vehicleDisplayStore for mode application
 *   - Does NOT modify the mobile ECS dashboard
 */

import { gpsUIState } from './gpsUIState';
import { remotenessStore } from './remotenessStore';
import { vehicleDisplayStore } from './vehicleDisplayStore';
import type {
  VehicleDisplayMode,
  VehicleDisplaySignals,
  ModeOverrideSetting,
  ModeTransitionNotice,
} from './vehicleDisplayTypes';
import { VEHICLE_DISPLAY_THRESHOLDS, VEHICLE_DISPLAY_MODE_LABELS } from './vehicleDisplayTypes';

// ── Types ───────────────────────────────────────────────────

export type VehicleDisplayModeRecommendation = VehicleDisplayMode | null;

export interface VehicleDisplayModeEngineOutput {
  currentMode: VehicleDisplayMode;
  autoModeEnabled: boolean;
  modeOverride: ModeOverrideSetting;
  switchRecommended: boolean;
  recommendedMode: VehicleDisplayModeRecommendation;
  recommendationReason: string;
  inCooldown: boolean;
  inConfirmation: boolean;
  confirmationProgress: number;  // 0.0 to 1.0
  signals: VehicleDisplaySignals;
  transitionNotice: ModeTransitionNotice | null;
  lastSwitchTime: number;
}

// ── Constants ───────────────────────────────────────────────

const EVAL_INTERVAL_MS = 8_000;       // 8 seconds
const SWITCH_COOLDOWN_MS = VEHICLE_DISPLAY_THRESHOLDS.switchCooldownMs;    // 45 seconds
const CONFIRMATION_WINDOW_MS = VEHICLE_DISPLAY_THRESHOLDS.confirmationWindowMs; // 15 seconds
const TRANSITION_NOTICE_DURATION_MS = VEHICLE_DISPLAY_THRESHOLDS.transitionNoticeDurationMs; // 5 seconds
const MIN_CONFIDENCE_SIGNALS = 2;

// ── Road Classification Bias ────────────────────────────────

type RoadBias = 'highway' | 'expedition' | 'neutral';

const ROAD_BIAS_MAP: Record<string, RoadBias> = {
  motorway: 'highway',
  trunk: 'highway',
  primary: 'highway',
  secondary: 'highway',
  tertiary: 'neutral',
  service: 'neutral',
  residential: 'neutral',
  track: 'expedition',
  trail: 'expedition',
  unclassified: 'expedition',
  path: 'expedition',
  unknown: 'neutral',
};

// ── Internal State ──────────────────────────────────────────

let _modeOverride: ModeOverrideSetting = 'auto';
let _autoModeEnabled = true;
let _isManualOverride = false;
let _currentRoadType: string = 'unknown';
let _activeExpedition = false;

// Switch state
let _switchRecommended = false;
let _recommendedMode: VehicleDisplayModeRecommendation = null;
let _recommendationReason = '';

// Confirmation window state
let _confirmationStartTime: number = 0;
let _confirmationTargetMode: VehicleDisplayModeRecommendation = null;
let _inConfirmation = false;

// Cooldown
let _lastSwitchTime = 0;
let _lastManualSwitchTime = 0;

// Transition notice
let _transitionNotice: ModeTransitionNotice | null = null;
let _transitionNoticeTimer: ReturnType<typeof setTimeout> | null = null;

// Timer
let _evalTimer: ReturnType<typeof setInterval> | null = null;
let _isRunning = false;

// Cached output
let _cachedOutput: VehicleDisplayModeEngineOutput | null = null;

// Listeners
type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify(): void {
  _cachedOutput = null;
  for (const fn of _listeners) {
    try { fn(); } catch {}
  }
}

// ── Signal Gathering ────────────────────────────────────────

function _gatherSignals(): VehicleDisplaySignals {
  const gps = gpsUIState.get();
  const hasGpsFix = gps.hasFix;
  let speedMph: number | null = null;

  if (hasGpsFix && gps.position) {
    speedMph = gps.position.speedMph ?? null;
  }

  const remoteness = remotenessStore.get();

  return {
    roadClassification: _currentRoadType,
    speedMph,
    remotenessIndex: remoteness.score,
    activeExpedition: _activeExpedition,
    hasGpsFix,
  };
}

// ── Decision Logic ──────────────────────────────────────────

function _evaluateRecommendation(signals: VehicleDisplaySignals): {
  recommended: VehicleDisplayModeRecommendation;
  reason: string;
} {
  if (!signals.hasGpsFix) {
    return { recommended: null, reason: '' };
  }

  const currentMode = vehicleDisplayStore.getMode();
  let highwaySignals = 0;
  let expeditionSignals = 0;
  const reasons: string[] = [];

  // Signal A: Road Classification
  const roadBias = ROAD_BIAS_MAP[signals.roadClassification || 'unknown'] || 'neutral';
  if (roadBias === 'highway') {
    highwaySignals++;
    reasons.push(`Road: ${signals.roadClassification}`);
  } else if (roadBias === 'expedition') {
    expeditionSignals++;
    reasons.push(`Road: ${signals.roadClassification}`);
  }

  // Signal B: Speed
  if (signals.speedMph !== null) {
    if (signals.speedMph > VEHICLE_DISPLAY_THRESHOLDS.highwaySpeedMph) {
      highwaySignals++;
      reasons.push(`Speed: ${Math.round(signals.speedMph)} mph`);
    } else if (signals.speedMph < VEHICLE_DISPLAY_THRESHOLDS.expeditionSpeedMph) {
      expeditionSignals++;
      reasons.push(`Speed: ${Math.round(signals.speedMph)} mph`);
    }
  }

  // Signal C: Remoteness Index
  if (signals.remotenessIndex !== null) {
    if (signals.remotenessIndex > VEHICLE_DISPLAY_THRESHOLDS.expeditionRemotenessThreshold) {
      expeditionSignals++;
      reasons.push(`Remoteness: ${signals.remotenessIndex}`);
    } else if (signals.remotenessIndex < VEHICLE_DISPLAY_THRESHOLDS.highwayRemotenessThreshold) {
      highwaySignals++;
      reasons.push('Low remoteness');
    }
  }

  // Signal D: Active Expedition (bonus signal)
  if (signals.activeExpedition) {
    expeditionSignals++;
    reasons.push('Active expedition');
  }

  // Decision
  if (highwaySignals >= MIN_CONFIDENCE_SIGNALS && currentMode !== 'highway_drive') {
    return {
      recommended: 'highway_drive',
      reason: reasons.join(' \u2022 '),
    };
  }

  if (expeditionSignals >= MIN_CONFIDENCE_SIGNALS && currentMode !== 'expedition_drive') {
    return {
      recommended: 'expedition_drive',
      reason: reasons.join(' \u2022 '),
    };
  }

  return { recommended: null, reason: '' };
}

// ── Mode Switch Execution ───────────────────────────────────

function _createTransitionNotice(
  previousMode: VehicleDisplayMode,
  newMode: VehicleDisplayMode,
  isAutomatic: boolean
): ModeTransitionNotice {
  const label = VEHICLE_DISPLAY_MODE_LABELS[newMode];
  return {
    newMode,
    previousMode,
    message: `Switched to ${label}`,
    timestamp: Date.now(),
    isAutomatic,
    displayDurationMs: TRANSITION_NOTICE_DURATION_MS,
  };
}

function _showTransitionNotice(notice: ModeTransitionNotice): void {
  // Clear any existing notice timer
  if (_transitionNoticeTimer) {
    clearTimeout(_transitionNoticeTimer);
    _transitionNoticeTimer = null;
  }

  _transitionNotice = notice;

  // Auto-clear the notice after display duration
  _transitionNoticeTimer = setTimeout(() => {
    _transitionNotice = null;
    _transitionNoticeTimer = null;
    _notify();
  }, notice.displayDurationMs);
}

function _performSwitch(newMode: VehicleDisplayMode, isAutomatic: boolean): void {
  const previousMode = vehicleDisplayStore.getMode();
  if (previousMode === newMode) return;

  // Create and show transition notice
  const notice = _createTransitionNotice(previousMode, newMode, isAutomatic);
  _showTransitionNotice(notice);

  // Apply the mode change
  vehicleDisplayStore.setMode(newMode);
  _lastSwitchTime = Date.now();

  // Reset confirmation state
  _switchRecommended = false;
  _recommendedMode = null;
  _recommendationReason = '';
  _inConfirmation = false;
  _confirmationStartTime = 0;
  _confirmationTargetMode = null;

  console.log(
    `[VehicleDisplayModeEngine] Mode switched: ${previousMode} → ${newMode} (${isAutomatic ? 'auto' : 'manual'})`
  );

  _notify();
}

// ── Core Evaluation ─────────────────────────────────────────

function _evaluate(): void {
  // Skip if manual override is active
  if (!_autoModeEnabled || _isManualOverride) return;

  const now = Date.now();

  // Skip if in cooldown period
  if (now - _lastSwitchTime < SWITCH_COOLDOWN_MS) return;
  if (now - _lastManualSwitchTime < SWITCH_COOLDOWN_MS) return;

  const signals = _gatherSignals();
  const { recommended, reason } = _evaluateRecommendation(signals);

  if (recommended) {
    // Check if we're already confirming this mode
    if (_inConfirmation && _confirmationTargetMode === recommended) {
      // Check if confirmation window has elapsed
      const elapsed = now - _confirmationStartTime;
      if (elapsed >= CONFIRMATION_WINDOW_MS) {
        // Confirmation window passed — execute the switch
        _performSwitch(recommended, true);
      }
      // Otherwise, keep waiting (confirmation in progress)
    } else if (_inConfirmation && _confirmationTargetMode !== recommended) {
      // Different mode recommended — reset confirmation
      _confirmationStartTime = now;
      _confirmationTargetMode = recommended;
      _recommendedMode = recommended;
      _recommendationReason = reason;
      _switchRecommended = true;
      _notify();
    } else {
      // Start new confirmation window
      _inConfirmation = true;
      _confirmationStartTime = now;
      _confirmationTargetMode = recommended;
      _recommendedMode = recommended;
      _recommendationReason = reason;
      _switchRecommended = true;
      _notify();
    }
  } else {
    // No recommendation — reset confirmation if active
    if (_inConfirmation) {
      _inConfirmation = false;
      _confirmationStartTime = 0;
      _confirmationTargetMode = null;
      _switchRecommended = false;
      _recommendedMode = null;
      _recommendationReason = '';
      _notify();
    }
  }
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

export const vehicleDisplayModeEngine = {
  /**
   * Get current engine output.
   */
  get(): VehicleDisplayModeEngineOutput {
    if (_cachedOutput) return _cachedOutput;

    const signals = _gatherSignals();
    const now = Date.now();
    const inCooldown = (now - _lastSwitchTime < SWITCH_COOLDOWN_MS) ||
                       (now - _lastManualSwitchTime < SWITCH_COOLDOWN_MS);

    let confirmationProgress = 0;
    if (_inConfirmation && _confirmationStartTime > 0) {
      const elapsed = now - _confirmationStartTime;
      confirmationProgress = Math.min(1.0, elapsed / CONFIRMATION_WINDOW_MS);
    }

    _cachedOutput = {
      currentMode: vehicleDisplayStore.getMode(),
      autoModeEnabled: _autoModeEnabled,
      modeOverride: _modeOverride,
      switchRecommended: _switchRecommended,
      recommendedMode: _recommendedMode,
      recommendationReason: _recommendationReason,
      inCooldown,
      inConfirmation: _inConfirmation,
      confirmationProgress,
      signals,
      transitionNotice: _transitionNotice,
      lastSwitchTime: _lastSwitchTime,
    };

    return _cachedOutput;
  },

  /**
   * Get current mode.
   */
  getCurrentMode(): VehicleDisplayMode {
    return vehicleDisplayStore.getMode();
  },

  /**
   * Get the current mode override setting.
   */
  getModeOverride(): ModeOverrideSetting {
    return _modeOverride;
  },

  /**
   * Get the active transition notice, or null.
   */
  getTransitionNotice(): ModeTransitionNotice | null {
    return _transitionNotice;
  },

  /**
   * Whether auto-switching is enabled.
   */
  isAutoModeEnabled(): boolean {
    return _autoModeEnabled;
  },

  /**
   * Whether the engine is in a confirmation window.
   */
  isInConfirmation(): boolean {
    return _inConfirmation;
  },

  /**
   * Set the mode override.
   *
   * Options:
   *   - 'auto': enable automatic context-based switching
   *   - 'highway': force HighwayDrive regardless of context
   *   - 'expedition': force ExpeditionDrive regardless of context
   */
  setModeOverride(setting: ModeOverrideSetting): void {
    _modeOverride = setting;

    if (setting === 'auto') {
      // Re-enable automatic switching
      _autoModeEnabled = true;
      _isManualOverride = false;
      vehicleDisplayStore.setManualOverride(false);
      vehicleDisplayStore.setModeOverride('auto');
    } else if (setting === 'highway') {
      // Force highway mode
      _autoModeEnabled = false;
      _isManualOverride = true;
      vehicleDisplayStore.setManualOverride(true);
      vehicleDisplayStore.setModeOverride('highway');
      _performSwitch('highway_drive', false);
      _lastManualSwitchTime = Date.now();
    } else if (setting === 'expedition') {
      // Force expedition mode
      _autoModeEnabled = false;
      _isManualOverride = true;
      vehicleDisplayStore.setManualOverride(true);
      vehicleDisplayStore.setModeOverride('expedition');
      _performSwitch('expedition_drive', false);
      _lastManualSwitchTime = Date.now();
    }

    // Reset confirmation state
    _inConfirmation = false;
    _confirmationStartTime = 0;
    _confirmationTargetMode = null;
    _switchRecommended = false;
    _recommendedMode = null;
    _recommendationReason = '';

    _cachedOutput = null;
    _notify();
  },

  /**
   * Toggle auto mode.
   * @deprecated Use setModeOverride() instead.
   */
  setAutoMode(enabled: boolean): void {
    if (enabled) {
      vehicleDisplayModeEngine.setModeOverride('auto');
    } else {
      // When disabling auto, keep current mode as manual override
      const currentMode = vehicleDisplayStore.getMode();
      vehicleDisplayModeEngine.setModeOverride(
        currentMode === 'highway_drive' ? 'highway' : 'expedition'
      );
    }
  },

  /**
   * Manually set the vehicle display mode.
   * @deprecated Use setModeOverride() instead.
   */
  setMode(mode: VehicleDisplayMode): void {
    vehicleDisplayModeEngine.setModeOverride(
      mode === 'highway_drive' ? 'highway' : 'expedition'
    );
  },

  /**
   * Feed road classification data.
   */
  feedRoadClassification(roadType: string): void {
    _currentRoadType = roadType;
  },

  /**
   * Feed active expedition state.
   */
  feedExpeditionState(active: boolean): void {
    _activeExpedition = active;
  },

  /**
   * Start the evaluation engine.
   */
  start(): void {
    if (_isRunning) return;
    _isRunning = true;
    _evaluate();
    _evalTimer = setInterval(_evaluate, EVAL_INTERVAL_MS);
  },

  /**
   * Stop the evaluation engine.
   */
  stop(): void {
    _isRunning = false;
    if (_evalTimer) {
      clearInterval(_evalTimer);
      _evalTimer = null;
    }
  },

  /**
   * Whether the engine is running.
   */
  isRunning(): boolean {
    return _isRunning;
  },

  /**
   * Reset all state.
   */
  reset(): void {
    vehicleDisplayModeEngine.stop();
    _modeOverride = 'auto';
    _autoModeEnabled = true;
    _isManualOverride = false;
    _currentRoadType = 'unknown';
    _activeExpedition = false;
    _switchRecommended = false;
    _recommendedMode = null;
    _recommendationReason = '';
    _inConfirmation = false;
    _confirmationStartTime = 0;
    _confirmationTargetMode = null;
    _lastSwitchTime = 0;
    _lastManualSwitchTime = 0;
    _transitionNotice = null;
    if (_transitionNoticeTimer) {
      clearTimeout(_transitionNoticeTimer);
      _transitionNoticeTimer = null;
    }
    _cachedOutput = null;
    _notify();
  },

  /**
   * Subscribe to engine state changes.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};

