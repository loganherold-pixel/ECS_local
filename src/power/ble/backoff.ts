/**
 * backoff — exponential backoff utility for BLE reconnection.
 *
 * Phase 2B — small internal helper used by BleConnector for retry logic.
 */

export interface BackoffConfig {
  /** Initial delay in ms before the first retry. Default: 500 */
  initialDelayMs: number;
  /** Maximum delay cap in ms. Default: 30_000 */
  maxDelayMs: number;
  /** Multiplier applied after each attempt. Default: 2 */
  factor: number;
  /** Random jitter factor (0–1). 0 = no jitter, 1 = full jitter. Default: 0.25 */
  jitter: number;
}

const DEFAULT_CONFIG: BackoffConfig = {
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  factor: 2,
  jitter: 0.25,
};

/**
 * Stateful backoff calculator.
 *
 * Usage:
 * ```ts
 * const bo = createBackoff();
 * const delay = bo.next();   // 500
 * const delay2 = bo.next();  // ~1000
 * bo.reset();                // back to initial
 * ```
 */
export interface Backoff {
  /** Return the next delay in ms and advance the internal counter. */
  next(): number;
  /** Reset the counter back to zero (call after a successful connection). */
  reset(): void;
  /** Return the current attempt number (0-based). */
  attempt(): number;
}

export function createBackoff(config?: Partial<BackoffConfig>): Backoff {
  const cfg: BackoffConfig = { ...DEFAULT_CONFIG, ...config };
  let attempts = 0;

  return {
    next(): number {
      const base = Math.min(
        cfg.initialDelayMs * Math.pow(cfg.factor, attempts),
        cfg.maxDelayMs,
      );
      // Apply jitter: delay ∈ [base * (1 - jitter), base * (1 + jitter)]
      const jitterRange = base * cfg.jitter;
      const delay = base - jitterRange + Math.random() * jitterRange * 2;
      attempts++;
      return Math.round(Math.max(0, delay));
    },

    reset(): void {
      attempts = 0;
    },

    attempt(): number {
      return attempts;
    },
  };
}

