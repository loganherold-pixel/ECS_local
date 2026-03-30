/**
 * src/power/forecast/powerForecast.ts
 *
 * Phase 3H-1 — Power Forecast Engine.
 *
 * Pure utility that estimates runtime-to-depletion and time-to-full based on
 * current telemetry values. No side-effects, no UI — just math.
 *
 * Usage:
 *   import { computePowerForecast } from "src/power";
 *   const forecast = computePowerForecast({
 *     socPct: 72,
 *     wattsIn: 120,
 *     wattsOut: 340,
 *     capacityWh: 2016,
 *   });
 */

// ── Constants ───────────────────────────────────────────────────────────
const DEFAULT_MIN_WATTS = 10;
const MAX_ESTIMATE_MIN = 10_080; // 7 days in minutes — sanity clamp

// ── Types ───────────────────────────────────────────────────────────────

export type PowerForecastInput = {
  /** Battery state-of-charge percentage (0–100). */
  socPct?: number;
  /** Total watts flowing into the battery (solar + AC/DC charge). */
  wattsIn?: number;
  /** Total watts flowing out of the battery to loads. */
  wattsOut?: number;
  /** Total system capacity in watt-hours. */
  capacityWh?: number;
  /**
   * Minimum watt threshold to avoid division-by-tiny-number noise.
   * Defaults to 10 W.
   */
  minWatts?: number;
};

export type PowerForecastStatus =
  | "unknown"
  | "draining"
  | "charging"
  | "balanced";

export type PowerForecastConfidence = "low" | "medium" | "high";

export type PowerForecast = {
  /** Net power: positive = charging, negative = draining. */
  netWatts?: number;
  /** High-level status derived from net power flow. */
  status: PowerForecastStatus;
  /** Estimated minutes until battery reaches 0 % (draining only). */
  estDepletionMin?: number;
  /** Estimated minutes until battery reaches 100 % (charging only). */
  estFullMin?: number;
  /** Confidence in the estimate based on available inputs. */
  confidence: PowerForecastConfidence;
  /** Optional human-readable notes about the forecast. */
  notes?: string[];
};

// ── Core Function ───────────────────────────────────────────────────────

/**
 * Compute a power forecast from the given telemetry snapshot.
 *
 * Pure function — no side-effects, safe to call on every render / poll cycle.
 */
export function computePowerForecast(
  input: PowerForecastInput,
): PowerForecast {
  const {
    socPct,
    wattsIn,
    wattsOut,
    capacityWh,
    minWatts = DEFAULT_MIN_WATTS,
  } = input;

  const notes: string[] = [];

  // ── Guard: insufficient data → unknown ──────────────────────────────
  if (socPct === undefined || socPct === null) {
    notes.push("SOC not available — cannot estimate.");
    return { status: "unknown", confidence: "low", notes };
  }

  if (capacityWh === undefined || capacityWh === null || capacityWh <= 0) {
    notes.push("System capacity (Wh) not available — cannot estimate.");
    return { status: "unknown", confidence: "low", notes };
  }

  // ── Derived values ──────────────────────────────────────────────────
  const effectiveIn = wattsIn ?? 0;
  const effectiveOut = wattsOut ?? 0;
  const netWatts = effectiveIn - effectiveOut;
  const remainingWh = capacityWh * (socPct / 100);

  // ── Confidence ──────────────────────────────────────────────────────
  const confidence = deriveConfidence(socPct, wattsIn, wattsOut);

  if (wattsIn === undefined) {
    notes.push("Watts-in not reported — assuming 0 W input.");
  }

  // ── Balanced (net ≈ 0) ─────────────────────────────────────────────
  if (Math.abs(netWatts) < minWatts) {
    notes.push(
      `Net power (${netWatts.toFixed(1)} W) below threshold (±${minWatts} W) — balanced.`,
    );
    return {
      netWatts,
      status: "balanced",
      confidence,
      notes,
    };
  }

  // ── Draining ───────────────────────────────────────────────────────
  if (netWatts < 0) {
    const drainW = Math.max(Math.abs(netWatts), minWatts);
    const rawMin = (remainingWh / drainW) * 60;
    const estDepletionMin = clampMinutes(rawMin);

    if (rawMin > MAX_ESTIMATE_MIN) {
      notes.push(
        `Raw depletion estimate (${Math.round(rawMin)} min) clamped to 7-day max.`,
      );
    }

    return {
      netWatts,
      status: "draining",
      estDepletionMin,
      confidence,
      notes: notes.length ? notes : undefined,
    };
  }

  // ── Charging ───────────────────────────────────────────────────────
  const neededWh = capacityWh - remainingWh;

  if (neededWh <= 0) {
    notes.push("Battery already at or above 100 % — fully charged.");
    return {
      netWatts,
      status: "charging",
      estFullMin: 0,
      confidence,
      notes,
    };
  }

  const rawMin = (neededWh / netWatts) * 60;
  const estFullMin = clampMinutes(rawMin);

  if (rawMin > MAX_ESTIMATE_MIN) {
    notes.push(
      `Raw charge estimate (${Math.round(rawMin)} min) clamped to 7-day max.`,
    );
  }

  return {
    netWatts,
    status: "charging",
    estFullMin,
    confidence,
    notes: notes.length ? notes : undefined,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function deriveConfidence(
  socPct: number | undefined,
  wattsIn: number | undefined,
  wattsOut: number | undefined,
): PowerForecastConfidence {
  const hasSoc = socPct !== undefined && socPct !== null;
  const hasOut = wattsOut !== undefined && wattsOut !== null;
  const hasIn = wattsIn !== undefined && wattsIn !== null;

  if (hasSoc && hasOut && hasIn) return "high";
  if (hasOut) return "medium"; // wattsIn missing, assumed 0
  return "low";
}

function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < 0) return 0;
  return Math.min(minutes, MAX_ESTIMATE_MIN);
}

