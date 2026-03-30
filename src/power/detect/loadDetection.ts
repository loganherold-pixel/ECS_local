/**
 * loadDetection — lightweight load-detection engine for ECS Power.
 *
 * Analyses recent `wattsOut` samples from the ring buffer and emits
 * discrete PowerEvents:
 *   • LOAD_ON  — sustained step-up in draw (≥ +40 W for ≥ 10 s)
 *   • LOAD_OFF — sustained step-down in draw (≤ −40 W for ≥ 10 s)
 *   • SPIKE    — brief burst > baseline + 200 W that returns within 30 s
 *   • CYCLE    — repeating on/off pattern (≥ 3 cycles, 90 s–20 min period)
 *
 * Phase 3I-2 — no UI changes.
 */

import type { PowerSample } from "../telemetry/PowerSampleBuffer";

// ── Event types ─────────────────────────────────────────────────────────

export type PowerEventType = "LOAD_ON" | "LOAD_OFF" | "SPIKE" | "CYCLE";

export type PowerEvent = {
  /** Unique identifier (type + timestamp bucket) */
  id: string;
  /** Epoch-ms when the event was detected */
  t: number;
  type: PowerEventType;
  /** Magnitude of the step / spike in watts */
  deltaW?: number;
  /** Duration of the spike or cycle period in ms */
  durationMs?: number;
  /** Detection confidence */
  confidence: "low" | "medium" | "high";
  /** Human-readable label */
  label?: string;
  /** Additional context notes */
  notes?: string[];
};

// ── Tunables ────────────────────────────────────────────────────────────

const STEP_THRESHOLD_W = 40;
const STEP_HOLD_MS = 10_000; // 10 s sustained
const SPIKE_THRESHOLD_W = 200;
const SPIKE_MAX_DURATION_MS = 30_000; // 30 s
const CYCLE_ON_THRESHOLD_W = 40; // above baseline
const CYCLE_MIN_REPS = 3;
const CYCLE_MIN_PERIOD_MS = 90_000; // 90 s
const CYCLE_MAX_PERIOD_MS = 20 * 60_000; // 20 min
const BASELINE_WINDOW_MS = 60_000; // 60 s rolling average

// ── Helpers ─────────────────────────────────────────────────────────────

/** Rolling median of the last `n` numeric values (undefined → skip). */
function rollingMedian(values: (number | undefined)[], windowSize: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window: number[] = [];
    for (let j = start; j <= i; j++) {
      const v = values[j];
      if (v !== undefined) window.push(v);
    }
    if (window.length === 0) {
      out.push(0);
    } else {
      window.sort((a, b) => a - b);
      const mid = Math.floor(window.length / 2);
      out.push(
        window.length % 2 === 0
          ? (window[mid - 1] + window[mid]) / 2
          : window[mid],
      );
    }
  }
  return out;
}

/** Compute a simple average of an array of numbers. */
function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}

/** Generate a deterministic event id from type + time bucket (1 s). */
function eventId(type: PowerEventType, t: number): string {
  const bucket = Math.floor(t / 1000);
  return `${type}_${bucket}`;
}

// ── Detector ────────────────────────────────────────────────────────────

/**
 * Run load detection over a window of PowerSamples.
 *
 * Returns an array of newly detected PowerEvents (may be empty).
 * Callers should de-duplicate against previously emitted events.
 */
export function detectLoadEvents(samples: PowerSample[]): PowerEvent[] {
  if (samples.length < 5) return [];

  const events: PowerEvent[] = [];

  // Extract timestamps
  const timestamps = samples.map((s) => s.t);

  // 1) Smooth: rolling median of last 5 samples
  const smoothed = rollingMedian(
    samples.map((s) => s.wattsOut),
    5,
  );

  // 2) Compute per-sample baseline (rolling average of samples within last 60 s)
  const baselines: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const cutoff = timestamps[i] - BASELINE_WINDOW_MS;
    const window: number[] = [];
    for (let j = Math.max(0, i - 120); j < i; j++) {
      if (timestamps[j] >= cutoff) {
        window.push(smoothed[j]);
      }
    }
    baselines.push(window.length > 0 ? avg(window) : smoothed[i]);
  }

  // ── Step detection (LOAD_ON / LOAD_OFF) ─────────────────────────────
  detectStepEvents(smoothed, baselines, timestamps, events);

  // ── Spike detection ─────────────────────────────────────────────────
  detectSpikeEvents(smoothed, baselines, timestamps, events);

  // ── Cycle detection ─────────────────────────────────────────────────
  detectCycleEvents(smoothed, baselines, timestamps, events);

  return events;
}


// ── Step detection ──────────────────────────────────────────────────────

function detectStepEvents(
  smoothed: number[],
  baselines: number[],
  timestamps: number[],
  events: PowerEvent[],
): void {

  let stepStart: number | null = null;
  let stepDir: "up" | "down" | null = null;
  let stepDelta = 0;

  for (let i = 0; i < smoothed.length; i++) {
    const delta = smoothed[i] - baselines[i];

    if (delta > STEP_THRESHOLD_W) {
      if (stepDir !== "up") {
        stepStart = timestamps[i];
        stepDir = "up";
        stepDelta = delta;
      } else {
        stepDelta = Math.max(stepDelta, delta);
      }
    } else if (delta < -STEP_THRESHOLD_W) {
      if (stepDir !== "down") {
        // If we were tracking an "up" step, check if it was sustained
        if (stepDir === "up" && stepStart !== null) {
          maybeEmitStep("up", stepStart, timestamps[i], stepDelta, events);
        }
        stepStart = timestamps[i];
        stepDir = "down";
        stepDelta = Math.abs(delta);
      } else {
        stepDelta = Math.max(stepDelta, Math.abs(delta));
      }
    } else {
      // Back within threshold — check if previous step was sustained
      if (stepDir === "up" && stepStart !== null) {
        maybeEmitStep("up", stepStart, timestamps[i], stepDelta, events);
      } else if (stepDir === "down" && stepStart !== null) {
        maybeEmitStep("down", stepStart, timestamps[i], stepDelta, events);
      }
      stepStart = null;
      stepDir = null;
      stepDelta = 0;
    }
  }

  // Handle trailing step at end of window
  if (stepDir && stepStart !== null) {
    const lastT = timestamps[timestamps.length - 1];
    maybeEmitStep(stepDir, stepStart, lastT, stepDelta, events);
  }
}

function maybeEmitStep(
  dir: "up" | "down",
  start: number,
  end: number,
  deltaW: number,
  events: PowerEvent[],
): void {
  const duration = end - start;
  if (duration < STEP_HOLD_MS) return;

  const type: PowerEventType = dir === "up" ? "LOAD_ON" : "LOAD_OFF";
  const confidence: PowerEvent["confidence"] =
    deltaW > 150 ? "high" : deltaW > 80 ? "medium" : "low";

  events.push({
    id: eventId(type, start),
    t: start,
    type,
    deltaW: Math.round(deltaW),
    durationMs: duration,
    confidence,
    label: type === "LOAD_ON" ? "Load Increase Detected" : "Load Decrease Detected",
    notes: [`ΔW ≈ ${Math.round(deltaW)} W sustained for ${Math.round(duration / 1000)} s`],
  });
}

// ── Spike detection ─────────────────────────────────────────────────────

function detectSpikeEvents(
  smoothed: number[],
  baselines: number[],
  timestamps: number[],
  events: PowerEvent[],
): void {

  let spikeStart: number | null = null;
  let spikePeak = 0;

  for (let i = 0; i < smoothed.length; i++) {
    const delta = smoothed[i] - baselines[i];

    if (delta > SPIKE_THRESHOLD_W) {
      if (spikeStart === null) {
        spikeStart = timestamps[i];
        spikePeak = delta;
      } else {
        spikePeak = Math.max(spikePeak, delta);
      }
    } else if (spikeStart !== null) {
      // Spike ended — check duration
      const duration = timestamps[i] - spikeStart;
      if (duration > 0 && duration <= SPIKE_MAX_DURATION_MS) {
        const confidence: PowerEvent["confidence"] =
          spikePeak > 500 ? "high" : spikePeak > 300 ? "medium" : "low";

        events.push({
          id: eventId("SPIKE", spikeStart),
          t: spikeStart,
          type: "SPIKE",
          deltaW: Math.round(spikePeak),
          durationMs: duration,
          confidence,
          label: "High Draw Spike",
          notes: [
            `Peak ≈ ${Math.round(spikePeak)} W above baseline`,
            `Duration ≈ ${Math.round(duration / 1000)} s`,
          ],
        });
      }
      spikeStart = null;
      spikePeak = 0;
    }
  }
}

// ── Cycle detection ─────────────────────────────────────────────────────

function detectCycleEvents(
  smoothed: number[],
  baselines: number[],
  timestamps: number[],
  events: PowerEvent[],
): void {

  // Identify "on" windows where smoothed > baseline + CYCLE_ON_THRESHOLD_W
  type OnWindow = { start: number; end: number };
  const onWindows: OnWindow[] = [];
  let windowStart: number | null = null;

  for (let i = 0; i < smoothed.length; i++) {
    const above = smoothed[i] - baselines[i] > CYCLE_ON_THRESHOLD_W;
    if (above && windowStart === null) {
      windowStart = timestamps[i];
    } else if (!above && windowStart !== null) {
      onWindows.push({ start: windowStart, end: timestamps[i] });
      windowStart = null;
    }
  }
  // Close trailing window
  if (windowStart !== null) {
    onWindows.push({ start: windowStart, end: timestamps[timestamps.length - 1] });
  }

  // Need at least CYCLE_MIN_REPS on-windows to consider a cycle
  if (onWindows.length < CYCLE_MIN_REPS) return;

  // Compute inter-onset intervals
  const intervals: number[] = [];
  for (let i = 1; i < onWindows.length; i++) {
    intervals.push(onWindows[i].start - onWindows[i - 1].start);
  }

  if (intervals.length < CYCLE_MIN_REPS - 1) return;

  // Check if intervals are roughly consistent (within 50% of median)
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const medianInterval =
    sortedIntervals.length % 2 === 0
      ? (sortedIntervals[sortedIntervals.length / 2 - 1] +
          sortedIntervals[sortedIntervals.length / 2]) /
        2
      : sortedIntervals[Math.floor(sortedIntervals.length / 2)];

  // Filter intervals within 50% of median
  const consistent = intervals.filter(
    (iv) => iv >= medianInterval * 0.5 && iv <= medianInterval * 1.5,
  );

  // Need at least (CYCLE_MIN_REPS - 1) consistent intervals
  if (consistent.length < CYCLE_MIN_REPS - 1) return;

  // Check period bounds
  if (medianInterval < CYCLE_MIN_PERIOD_MS || medianInterval > CYCLE_MAX_PERIOD_MS) return;

  const confidence: PowerEvent["confidence"] =
    consistent.length >= 5 ? "high" : consistent.length >= 3 ? "medium" : "low";

  const periodSec = Math.round(medianInterval / 1000);

  events.push({
    id: eventId("CYCLE", onWindows[0].start),
    t: onWindows[0].start,
    type: "CYCLE",
    durationMs: medianInterval,
    confidence,
    label: "Possible Compressor Cycle",
    notes: [
      `${onWindows.length} on-windows detected`,
      `Period ≈ ${periodSec} s (${Math.round(periodSec / 60)} min)`,
      `${consistent.length} of ${intervals.length} intervals consistent`,
    ],
  });
}

