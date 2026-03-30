/**
 * ECS TELEMETRY THROTTLE — Performance Guard for Telemetry Updates
 * ================================================================
 *
 * Prevents excessive UI re-renders from high-frequency telemetry updates
 * (EcoFlow, GPS, accelerometer, etc.).
 *
 * Max telemetry refresh rate: 1 update per second (configurable).
 *
 * Usage:
 *   const throttle = createTelemetryThrottle(1000);
 *   throttle.push(newData);
 *   const latest = throttle.getLatest();
 *
 * React Hook:
 *   const throttledValue = useThrottledValue(rawValue, 1000);
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const TAG = '[TELEMETRY_THROTTLE]';

// ── Generic Throttle Class ───────────────────────────────────

export class TelemetryThrottle<T> {
  private latest: T | null = null;
  private lastEmitted: T | null = null;
  private lastEmitTime = 0;
  private intervalMs: number;
  private listeners: Array<(value: T) => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(intervalMs: number = 1000) {
    this.intervalMs = Math.max(100, intervalMs);
  }

  /**
   * Push a new value. If enough time has passed since the last emit,
   * emit immediately. Otherwise, schedule an emit at the next interval.
   */
  push(value: T): void {
    this.latest = value;
    const now = Date.now();
    const elapsed = now - this.lastEmitTime;

    if (elapsed >= this.intervalMs) {
      this.emit(value);
    } else if (!this.timer) {
      // Schedule emit at next interval boundary
      const remaining = this.intervalMs - elapsed;
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.latest !== null) {
          this.emit(this.latest);
        }
      }, remaining);
    }
  }

  private emit(value: T): void {
    this.lastEmitted = value;
    this.lastEmitTime = Date.now();
    for (const listener of this.listeners) {
      try {
        listener(value);
      } catch (e) {
        console.warn(TAG, 'Listener error:', e);
      }
    }
  }

  /**
   * Get the latest value (may not have been emitted yet).
   */
  getLatest(): T | null {
    return this.latest;
  }

  /**
   * Get the last emitted (throttled) value.
   */
  getLastEmitted(): T | null {
    return this.lastEmitted;
  }

  /**
   * Subscribe to throttled emissions.
   */
  subscribe(listener: (value: T) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Clean up pending timer.
   */
  destroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.listeners = [];
  }
}

// ── React Hook: useThrottledValue ────────────────────────────

/**
 * Throttles a rapidly-changing value to update state at most once per interval.
 * Prevents excessive re-renders from high-frequency data sources.
 *
 * @param rawValue - The raw value that may change frequently
 * @param intervalMs - Minimum interval between state updates (default: 1000ms)
 * @returns The throttled value
 */
export function useThrottledValue<T>(rawValue: T, intervalMs: number = 1000): T {
  const [throttled, setThrottled] = useState<T>(rawValue);
  const lastEmitRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<T>(rawValue);

  useEffect(() => {
    latestRef.current = rawValue;
    const now = Date.now();
    const elapsed = now - lastEmitRef.current;

    if (elapsed >= intervalMs) {
      lastEmitRef.current = now;
      setThrottled(rawValue);
    } else if (!timerRef.current) {
      const remaining = intervalMs - elapsed;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        lastEmitRef.current = Date.now();
        setThrottled(latestRef.current);
      }, remaining);
    }
  }, [rawValue, intervalMs]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return throttled;
}

// ── React Hook: useThrottledCallback ─────────────────────────

/**
 * Returns a throttled version of a callback that fires at most once per interval.
 * Useful for throttling event handlers that trigger re-renders.
 *
 * @param callback - The callback to throttle
 * @param intervalMs - Minimum interval between invocations (default: 1000ms)
 * @returns Throttled callback
 */
export function useThrottledCallback<T extends (...args: any[]) => void>(
  callback: T,
  intervalMs: number = 1000,
): T {
  const lastCallRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestArgsRef = useRef<any[]>([]);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const throttled = useCallback((...args: any[]) => {
    latestArgsRef.current = args;
    const now = Date.now();
    const elapsed = now - lastCallRef.current;

    if (elapsed >= intervalMs) {
      lastCallRef.current = now;
      callbackRef.current(...args);
    } else if (!timerRef.current) {
      const remaining = intervalMs - elapsed;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        lastCallRef.current = Date.now();
        callbackRef.current(...latestArgsRef.current);
      }, remaining);
    }
  }, [intervalMs]) as unknown as T;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return throttled;
}

// ── Factory ──────────────────────────────────────────────────

/**
 * Create a standalone TelemetryThrottle instance.
 * Useful for non-React contexts (stores, engines).
 */
export function createTelemetryThrottle<T>(intervalMs: number = 1000): TelemetryThrottle<T> {
  return new TelemetryThrottle<T>(intervalMs);
}

