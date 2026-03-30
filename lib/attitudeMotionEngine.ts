/**
 * Attitude Motion Engine
 *
 * Instrument-grade motion processing for the Attitude Monitor.
 * Provides smooth, dampened, mechanically-precise motion behavior
 * without bounce, elastic overshoot, or spring physics.
 *
 * Pipeline:
 *   1) Rolling average buffer (smooths micro-jitter from sensor noise)
 *   2) Dead-zone filter (changes < DEAD_ZONE_DEG are suppressed)
 *   3) Low-pass filter (additional smoothing layer on top of useAccelerometer's filter)
 *   4) Dynamic duration scaling (small deltas = shorter, large deltas = longer)
 *   5) Output: smoothed angle + computed animation duration
 *
 * Design principles:
 *   - No bounce, no elastic, no spring physics
 *   - Ease-out with slight damping for controlled deceleration
 *   - Clean settling without oscillation
 *   - Mechanically engineered feel
 */

// ── Constants ──────────────────────────────────────────────

/** Minimum angle change (degrees) to trigger a full animation update */
const DEAD_ZONE_DEG = 0.2;

/** Rolling average buffer size (number of samples to average) */
const ROLLING_AVG_WINDOW = 4;

/**
 * Low-pass filter coefficient for the motion engine layer.
 * Lower = smoother but more lag. Higher = more responsive but jittery.
 * This is applied ON TOP of useAccelerometer's own 0.12 filter.
 */
const MOTION_FILTER_ALPHA = 0.35;

/** Minimum animation duration (ms) — for very small angle changes */
const MIN_DURATION_MS = 200;

/** Maximum animation duration (ms) — for large angle changes */
const MAX_DURATION_MS = 350;

/**
 * Angle delta (degrees) at which duration reaches MAX_DURATION_MS.
 * Deltas beyond this still use MAX_DURATION_MS (clamped).
 */
const FULL_SCALE_DELTA_DEG = 15;

/**
 * Demo mode duration range — longer for smooth scenario transitions.
 * These override the normal duration when demo mode is active.
 */
const DEMO_MIN_DURATION_MS = 900;
const DEMO_MAX_DURATION_MS = 1400;
const DEMO_FULL_SCALE_DELTA_DEG = 25;


// ── Types ──────────────────────────────────────────────────

export interface MotionOutput {
  /** Smoothed angle value (degrees) — ready for animation target */
  smoothedAngle: number;
  /** Computed animation duration (ms) based on delta magnitude */
  durationMs: number;
  /** Whether this update should trigger an animation (false if within dead zone) */
  shouldAnimate: boolean;
}

export interface MotionEngineState {
  /** Rolling average buffer */
  buffer: number[];
  /** Previous low-pass filtered value */
  filteredValue: number;
  /** Last output value that triggered an animation */
  lastAnimatedValue: number;
  /** Whether the engine has been initialized with at least one value */
  initialized: boolean;
}


// ── Factory ────────────────────────────────────────────────

/**
 * Create a fresh motion engine state.
 * Call once per axis (roll, pitch) and maintain the reference.
 */
export function createMotionState(): MotionEngineState {
  return {
    buffer: [],
    filteredValue: 0,
    lastAnimatedValue: 0,
    initialized: false,
  };
}


// ── Core Processing ────────────────────────────────────────

/**
 * Process a new raw angle value through the motion pipeline.
 *
 * @param state   Mutable state object for this axis (roll or pitch)
 * @param rawDeg  New angle value in degrees (already calibrated by useAccelerometer)
 * @param isDemo  Whether demo mode is active (uses longer durations)
 * @returns       MotionOutput with smoothed angle, duration, and animation flag
 */
export function processAngle(
  state: MotionEngineState,
  rawDeg: number,
  isDemo: boolean = false,
): MotionOutput {
  // ── Step 1: Rolling average buffer ──
  // Push new value, maintain window size
  state.buffer.push(rawDeg);
  if (state.buffer.length > ROLLING_AVG_WINDOW) {
    state.buffer.shift();
  }

  // Compute rolling average
  const bufferAvg =
    state.buffer.reduce((sum, v) => sum + v, 0) / state.buffer.length;

  // ── Step 2: Low-pass filter ──
  // Apply additional smoothing on top of the rolling average
  if (!state.initialized) {
    state.filteredValue = bufferAvg;
    state.lastAnimatedValue = bufferAvg;
    state.initialized = true;
  } else {
    state.filteredValue =
      MOTION_FILTER_ALPHA * bufferAvg +
      (1 - MOTION_FILTER_ALPHA) * state.filteredValue;
  }

  // Round to 1 decimal for clean output
  const smoothed = Math.round(state.filteredValue * 10) / 10;

  // ── Step 3: Dead-zone filter ──
  // Only trigger animation if the change exceeds the dead zone
  const delta = Math.abs(smoothed - state.lastAnimatedValue);
  const shouldAnimate = delta >= DEAD_ZONE_DEG;

  if (shouldAnimate) {
    state.lastAnimatedValue = smoothed;
  }

  // ── Step 4: Dynamic duration scaling ──
  // Map the delta magnitude to a duration range
  const durationMs = shouldAnimate
    ? computeDuration(delta, isDemo)
    : isDemo ? DEMO_MIN_DURATION_MS : MIN_DURATION_MS;

  return {
    smoothedAngle: shouldAnimate ? smoothed : state.lastAnimatedValue,
    durationMs,
    shouldAnimate,
  };
}


/**
 * Reset the motion engine state (e.g., when switching between demo and live mode).
 */
export function resetMotionState(state: MotionEngineState): void {
  state.buffer = [];
  state.filteredValue = 0;
  state.lastAnimatedValue = 0;
  state.initialized = false;
}


/**
 * Force-set the motion engine to a specific angle (e.g., for demo scenario jumps).
 * Bypasses the rolling average and filter — used when the target angle changes
 * discontinuously (like switching demo scenarios).
 */
export function setMotionTarget(
  state: MotionEngineState,
  targetDeg: number,
  isDemo: boolean = false,
): MotionOutput {
  const delta = Math.abs(targetDeg - state.lastAnimatedValue);

  // Clear the buffer and seed with the new target
  state.buffer = [targetDeg];
  // Don't snap the filter — let it animate from current position
  // The filtered value stays where it is; the animation system handles the transition
  state.lastAnimatedValue = targetDeg;

  const durationMs = computeDuration(delta, isDemo);

  return {
    smoothedAngle: targetDeg,
    durationMs,
    shouldAnimate: true,
  };
}


// ── Duration Computation ───────────────────────────────────

/**
 * Compute animation duration based on angle delta magnitude.
 *
 * Small changes → shorter duration (snappy, responsive)
 * Large changes → longer duration (smooth, controlled)
 *
 * Uses a square-root curve for natural-feeling scaling:
 * duration = MIN + (MAX - MIN) * sqrt(clamp(delta / fullScale, 0, 1))
 */
function computeDuration(deltaDeg: number, isDemo: boolean): number {
  const minMs = isDemo ? DEMO_MIN_DURATION_MS : MIN_DURATION_MS;
  const maxMs = isDemo ? DEMO_MAX_DURATION_MS : MAX_DURATION_MS;
  const fullScale = isDemo ? DEMO_FULL_SCALE_DELTA_DEG : FULL_SCALE_DELTA_DEG;

  // Normalize delta to 0..1 range
  const normalized = Math.min(1, Math.max(0, deltaDeg / fullScale));

  // Square-root curve: fast initial response, gradual extension for large deltas
  const t = Math.sqrt(normalized);

  return Math.round(minMs + (maxMs - minMs) * t);
}


// ── Easing Configuration ───────────────────────────────────

/**
 * Recommended easing parameters for Animated.timing().
 *
 * Uses a custom cubic bezier approximation via Easing.bezier()
 * that provides:
 *   - Quick initial response (instrument snaps toward target)
 *   - Gradual deceleration (controlled settling)
 *   - No overshoot or bounce
 *   - Clean stop without oscillation
 *
 * The bezier curve (0.25, 0.1, 0.25, 1.0) is equivalent to
 * CSS ease-out but with slightly more damping in the tail.
 *
 * For React Native's Easing module:
 *   Easing.out(Easing.cubic) provides a good approximation.
 *   For even more control, use Easing.bezier(0.25, 0.1, 0.25, 1.0).
 */
export const INSTRUMENT_EASING = {
  /** Control point 1 x */
  p1x: 0.25,
  /** Control point 1 y */
  p1y: 0.1,
  /** Control point 2 x */
  p2x: 0.25,
  /** Control point 2 y */
  p2y: 1.0,
} as const;

