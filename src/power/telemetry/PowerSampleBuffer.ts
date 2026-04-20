/**
 * PowerSampleBuffer — fixed-size ring buffer for recent power samples.
 *
 * Stores up to `maxSamples` (default 600) readings for use by the
 * forecast engine and load-detection algorithms.
 *
 * 600 samples ≈ 10 min @ 1 Hz or 50 min @ 5 s polling.
 *
 * Phase 3I-1 — no UI changes.
 */

// ── Sample type ─────────────────────────────────────────────────────────

export type PowerSample = {
  /** Epoch-ms timestamp of this sample */
  t: number;
  /** Power flowing into the battery (W) */
  wattsIn?: number;
  /** Power flowing out of the battery (W) */
  wattsOut?: number;
  /** Solar input power (W) */
  solarWatts?: number;
  /** State-of-charge percentage (0–100) */
  socPct?: number;
  /** Whether the reading was flagged stale at capture time */
  stale?: boolean;
};

// ── Ring buffer ─────────────────────────────────────────────────────────

const DEFAULT_MAX_SAMPLES = 600;

export class PowerSampleBuffer {
  private readonly buf: (PowerSample | undefined)[];
  private head = 0; // next write position
  private count = 0;
  readonly maxSamples: number;

  constructor(maxSamples: number = DEFAULT_MAX_SAMPLES) {
    this.maxSamples = Math.max(1, Math.floor(maxSamples));
    this.buf = new Array(this.maxSamples).fill(undefined);
  }

  // ── Mutators ────────────────────────────────────────────────────────

  /** Append a sample. Drops the oldest when the buffer is full. */
  push(sample: PowerSample): void {
    this.buf[this.head] = sample;
    this.head = (this.head + 1) % this.maxSamples;
    if (this.count < this.maxSamples) {
      this.count++;
    }
  }

  /** Remove all samples. */
  clear(): void {
    this.buf.fill(undefined);
    this.head = 0;
    this.count = 0;
  }

  // ── Accessors ───────────────────────────────────────────────────────

  /** Number of samples currently stored. */
  get length(): number {
    return this.count;
  }

  /**
   * Return all stored samples ordered oldest → newest.
   * Returns a new array each call — safe to mutate.
   */
  getAll(): PowerSample[] {
    if (this.count === 0) return [];

    const result: PowerSample[] = new Array(this.count);

    // Oldest sample sits at `head` when buffer is full,
    // otherwise at index 0.
    const start = this.count < this.maxSamples ? 0 : this.head;

    for (let i = 0; i < this.count; i++) {
      result[i] = this.buf[(start + i) % this.maxSamples] as PowerSample;
    }
    return result;
  }

  /**
   * Return samples whose timestamp falls within the last `ms`
   * milliseconds (relative to `Date.now()`).
   *
   * Ordered oldest → newest.
   */
  getWindow(ms: number): PowerSample[] {
    if (this.count === 0 || ms <= 0) return [];

    const cutoff = Date.now() - ms;
    const all = this.getAll();

    // Samples are already sorted by time (oldest first).
    // Binary-search for the first sample >= cutoff would be optimal,
    // but with ≤600 items a simple filter is fast enough.
    return all.filter((s) => s.t >= cutoff);
  }

  /**
   * Return the most recent sample, or `undefined` if the buffer is empty.
   */
  latest(): PowerSample | undefined {
    if (this.count === 0) return undefined;
    const idx = (this.head - 1 + this.maxSamples) % this.maxSamples;
    return this.buf[idx];
  }
}

// ── Singleton ───────────────────────────────────────────────────────────
export const powerSampleBuffer = new PowerSampleBuffer();

