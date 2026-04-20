/**
 * ═══════════════════════════════════════════════════════════
 * ECS CORE SYSTEM STABILITY GUARDS
 * ═══════════════════════════════════════════════════════════
 *
 * Shared utilities for defensive coding, metadata validation,
 * rerender prevention, and graceful degradation across the
 * four core ECS systems:
 *
 *   1. Discovery — route loading pipeline
 *   2. Navigation — GPS + map initialization
 *   3. Telemetry — OBD/BLU device connections
 *   4. Risk Engine — risk evaluation scoring
 *
 * Design Principles:
 *   - Never throw — always return safe defaults
 *   - Never block the UI thread
 *   - Prevent duplicate computations
 *   - Log errors without crashing
 *   - Preserve ECS dark-mode styling
 *   - Compatible with Android Auto / CarPlay
 *
 * Phase: Core System Stability Pass
 */

const TAG = '[ECS-STABILITY]';

// ══════════════════════════════════════════════════════════
// METADATA VALIDATION — Discovery Route Cards
// ══════════════════════════════════════════════════════════

/**
 * Validate and fill missing metadata fields on a Discovery route.
 * Returns a safe copy with all required fields populated.
 * Prevents crashes when route data is incomplete.
 */
export function validateRouteMetadata<T extends Record<string, any>>(
  route: T,
  routeId: string,
): T {
  const safe: Record<string, any> = { ...route };

  // String fields — default to empty or descriptive placeholder
  if (!safe.name || typeof safe.name !== 'string') {
    safe.name = `Route ${routeId}`;
    console.warn(TAG, `[Discovery] Missing name for route "${routeId}"`);
  }
  if (!safe.region || typeof safe.region !== 'string') {
    safe.region = 'Unknown Region';
  }
  if (!safe.terrainType || typeof safe.terrainType !== 'string') {
    safe.terrainType = 'Mixed Terrain';
  }
  if (!safe.description || typeof safe.description !== 'string') {
    safe.description = 'No description available.';
  }
  if (!safe.imageTag || typeof safe.imageTag !== 'string') {
    safe.imageTag = 'default';
  }
  if (!safe.bestSeason || typeof safe.bestSeason !== 'string') {
    safe.bestSeason = 'Year-round';
  }

  // Numeric fields — default to safe values
  if (typeof safe.distanceMiles !== 'number' || isNaN(safe.distanceMiles) || safe.distanceMiles < 0) {
    safe.distanceMiles = 0;
  }
  if (typeof safe.remotenessScore !== 'number' || isNaN(safe.remotenessScore)) {
    safe.remotenessScore = 3;
  }
  if (typeof safe.estimatedFuelRequired !== 'number' || isNaN(safe.estimatedFuelRequired)) {
    safe.estimatedFuelRequired = 0;
  }
  if (typeof safe.suggestedCamps !== 'number' || isNaN(safe.suggestedCamps)) {
    safe.suggestedCamps = 0;
  }
  if (typeof safe.elevationGainFt !== 'number' || isNaN(safe.elevationGainFt)) {
    safe.elevationGainFt = 0;
  }
  if (typeof safe.estimatedDays !== 'number' || isNaN(safe.estimatedDays)) {
    safe.estimatedDays = 1;
  }
  if (typeof safe.startLat !== 'number' || isNaN(safe.startLat)) {
    safe.startLat = 39.8283; // US center
  }
  if (typeof safe.startLng !== 'number' || isNaN(safe.startLng)) {
    safe.startLng = -98.5795; // US center
  }

  // Boolean fields
  if (typeof safe.permitRequired !== 'boolean') {
    safe.permitRequired = false;
  }

  // Array fields
  if (!Array.isArray(safe.highlights)) {
    safe.highlights = [];
  }

  // Clamp numeric ranges
  safe.remotenessScore = clampScore(safe.remotenessScore, 1, 10);
  safe.estimatedDays = Math.max(1, safe.estimatedDays);

  return safe as T;
}

// ══════════════════════════════════════════════════════════
// DEDUPLICATION — Prevent duplicate routes across categories
// ══════════════════════════════════════════════════════════

/**
 * Deduplicate an array of items by a key function.
 * Returns items in original order, keeping the first occurrence.
 */
export function deduplicateBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Check for and log duplicate route IDs in a dataset.
 * Returns the count of duplicates found.
 */
export function auditDuplicates<T extends { id: string }>(
  items: T[],
  context: string,
): number {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.id, (counts.get(item.id) || 0) + 1);
  }
  let duplicateCount = 0;
  for (const [id, count] of counts) {
    if (count > 1) {
      duplicateCount += count - 1;
      console.warn(TAG, `[${context}] Duplicate route ID: "${id}" (${count} occurrences)`);
    }
  }
  return duplicateCount;
}

// ══════════════════════════════════════════════════════════
// SCORE CLAMPING — Risk Engine & Match Score Sanity
// ══════════════════════════════════════════════════════════

/**
 * Clamp a score to a valid range.
 * Returns the clamped value, logging a warning if clamping occurred.
 */
export function clampScore(
  value: number,
  min: number = 0,
  max: number = 100,
  context?: string,
): number {
  if (typeof value !== 'number' || isNaN(value)) {
    if (context) console.warn(TAG, `[${context}] NaN score detected, defaulting to ${min}`);
    return min;
  }
  if (value < min) {
    if (context) console.warn(TAG, `[${context}] Score ${value} below min ${min}, clamping`);
    return min;
  }
  if (value > max) {
    if (context) console.warn(TAG, `[${context}] Score ${value} above max ${max}, clamping`);
    return max;
  }
  return value;
}

/**
 * Validate that a risk score is sensible.
 * Extreme scores (>95 or sudden jumps >30 points) are flagged.
 */
export function validateRiskScore(
  newScore: number,
  previousScore: number | null,
): { score: number; flagged: boolean; reason: string | null } {
  const clamped = clampScore(newScore, 0, 100, 'RiskEngine');

  // Flag extreme scores
  if (clamped > 95) {
    return { score: clamped, flagged: true, reason: 'Extreme risk score (>95)' };
  }

  // Flag sudden jumps (>30 points in one evaluation)
  if (previousScore != null) {
    const delta = Math.abs(clamped - previousScore);
    if (delta > 30) {
      return { score: clamped, flagged: true, reason: `Large score jump: ${previousScore} → ${clamped} (Δ${delta})` };
    }
  }

  return { score: clamped, flagged: false, reason: null };
}

// ══════════════════════════════════════════════════════════
// RERENDER GUARDS — Prevent excessive UI updates
// ══════════════════════════════════════════════════════════

/**
 * Create a shallow equality checker for preventing unnecessary state updates.
 * Returns true if the values are shallowly equal.
 */
export function shallowEqual<T extends Record<string, any>>(a: T, b: T): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Create a debounced version of a function.
 * Prevents rapid-fire calls from causing excessive re-renders.
 */
export function createDebouncer(delayMs: number = 300): {
  debounce: (fn: () => void) => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    debounce(fn: () => void) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; fn(); }, delayMs);
    },
    cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
    },
  };
}

/**
 * Create a throttled version of a function.
 * Ensures a function is called at most once per interval.
 */
export function createThrottler(intervalMs: number = 1000): {
  throttle: (fn: () => void) => void;
  reset: () => void;
} {
  let lastCall = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  return {
    throttle(fn: () => void) {
      const now = Date.now();
      const elapsed = now - lastCall;
      if (elapsed >= intervalMs) {
        lastCall = now;
        fn();
      } else if (!pending) {
        pending = setTimeout(() => {
          pending = null;
          lastCall = Date.now();
          fn();
        }, intervalMs - elapsed);
      }
    },
    reset() {
      lastCall = 0;
      if (pending) { clearTimeout(pending); pending = null; }
    },
  };
}

// ══════════════════════════════════════════════════════════
// SAFE ASYNC — Non-blocking operations
// ══════════════════════════════════════════════════════════

/**
 * Run a function on the next frame to avoid blocking the UI thread.
 * Uses requestAnimationFrame on web, setTimeout(0) on native.
 */
export function runOnNextFrame(fn: () => void): void {
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(fn);
  } else {
    setTimeout(fn, 0);
  }
}

/**
 * Wrap an async operation with a timeout.
 * Returns null if the operation exceeds the timeout.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context: string = 'operation',
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.warn(TAG, `[${context}] Timed out after ${timeoutMs}ms`);
      resolve(null);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer!);
    return result;
  } catch (e) {
    clearTimeout(timer!);
    console.warn(TAG, `[${context}] Failed:`, e);
    return null;
  }
}

// ══════════════════════════════════════════════════════════
// SAFE STORE SUBSCRIPTION — Cleanup-safe subscriptions
// ══════════════════════════════════════════════════════════

/**
 * Subscribe to a store with automatic cleanup on unmount.
 * Returns an unsubscribe function that is safe to call multiple times.
 */
export function safeSubscribe(
  subscribeFn: (callback: () => void) => () => void,
  callback: () => void,
  mountedRef: { current: boolean },
): () => void {
  let unsubscribed = false;
  const wrappedCallback = () => {
    if (mountedRef.current && !unsubscribed) {
      try {
        callback();
      } catch (e) {
        console.warn(TAG, 'Subscription callback error:', e);
      }
    }
  };

  const unsub = subscribeFn(wrappedCallback);

  return () => {
    if (!unsubscribed) {
      unsubscribed = true;
      try { unsub(); } catch {}
    }
  };
}

// ══════════════════════════════════════════════════════════
// GPS SAFETY — Navigation initialization guards
// ══════════════════════════════════════════════════════════

/**
 * Validate GPS coordinates.
 * Returns true if coordinates are within valid ranges.
 */
export function isValidGPS(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Validate route geometry (array of points).
 * Returns true if the route has at least 2 valid points.
 */
export function isValidRouteGeometry(
  points: Array<{ lat: number; lng: number }> | null | undefined,
): boolean {
  if (!points || !Array.isArray(points)) return false;
  if (points.length < 2) return false;
  // Check first and last points are valid
  const first = points[0];
  const last = points[points.length - 1];
  return isValidGPS(first?.lat, first?.lng) && isValidGPS(last?.lat, last?.lng);
}

// ══════════════════════════════════════════════════════════
// TELEMETRY SAFETY — Connection retry and cleanup
// ══════════════════════════════════════════════════════════

/**
 * Exponential backoff calculator for connection retries.
 * Returns the delay in milliseconds for the given attempt number.
 * Caps at maxDelayMs to prevent excessive waits.
 */
export function calculateBackoff(
  attempt: number,
  baseDelayMs: number = 2000,
  maxDelayMs: number = 60000,
): number {
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  // Add jitter (±25%) to prevent thundering herd
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

/**
 * Maximum retry attempts before giving up.
 * Prevents infinite retry loops that drain battery.
 */
export const MAX_TELEMETRY_RETRIES = 5;

/**
 * Cooldown period after max retries exhausted (5 minutes).
 * Prevents repeated connection attempts that drain battery.
 */
export const RETRY_COOLDOWN_MS = 5 * 60 * 1000;

// ══════════════════════════════════════════════════════════
// INPUT CHANGE DETECTION — Risk Engine optimization
// ══════════════════════════════════════════════════════════

/**
 * Create a hash of risk engine inputs for change detection.
 * Only triggers re-evaluation when inputs actually change.
 */
export function hashRiskInputs(inputs: {
  vehicle_capability: { availability: string; payload_margin_lb: number | null; capability_tier: string };
  vehicle_health: { availability: string; battery_voltage: number | null; coolant_temp_f: number | null };
  expedition_resources: { availability: string; fuel_percent: number | null; water_gal: number | null };
  route_difficulty: { availability: string; route_challenge_score: number };
  remoteness: { availability: string; remoteness_score: number | null };
  connectivity_status: { availability: string; operational_connectivity_state: string };
}): string {
  try {
    return [
      inputs.vehicle_capability.availability,
      inputs.vehicle_capability.payload_margin_lb ?? 'null',
      inputs.vehicle_capability.capability_tier,
      inputs.vehicle_health.availability,
      inputs.vehicle_health.battery_voltage ?? 'null',
      inputs.vehicle_health.coolant_temp_f ?? 'null',
      inputs.expedition_resources.availability,
      inputs.expedition_resources.fuel_percent ?? 'null',
      inputs.expedition_resources.water_gal ?? 'null',
      inputs.route_difficulty.availability,
      inputs.route_difficulty.route_challenge_score,
      inputs.remoteness.availability,
      inputs.remoteness.remoteness_score ?? 'null',
      inputs.connectivity_status.availability,
      inputs.connectivity_status.operational_connectivity_state,
    ].join('|');
  } catch {
    return Date.now().toString(); // Force evaluation on hash failure
  }
}

// ══════════════════════════════════════════════════════════
// LOGGING — Lightweight diagnostic logging
// ══════════════════════════════════════════════════════════

/**
 * Log a stability event at the appropriate level.
 * Lightweight — does not persist or transmit.
 */
export function stabilityLog(
  system: 'Discovery' | 'Navigation' | 'Telemetry' | 'RiskEngine',
  level: 'info' | 'warn' | 'error',
  message: string,
  data?: any,
): void {
  const prefix = `${TAG} [${system}]`;
  switch (level) {
    case 'info':
      console.log(prefix, message, data !== undefined ? data : '');
      break;
    case 'warn':
      console.warn(prefix, message, data !== undefined ? data : '');
      break;
    case 'error':
      console.error(prefix, message, data !== undefined ? data : '');
      break;
  }
}

// ══════════════════════════════════════════════════════════
// VEHICLE DISPLAY COMPATIBILITY
// ══════════════════════════════════════════════════════════

/**
 * Simplify a data object for Android Auto / CarPlay consumption.
 * Strips complex nested objects and limits string lengths.
 */
export function simplifyForVehicleDisplay<T extends Record<string, any>>(
  data: T,
  maxStringLength: number = 50,
): Record<string, string | number | boolean | null> {
  const simplified: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value == null) {
      simplified[key] = null;
    } else if (typeof value === 'string') {
      simplified[key] = value.length > maxStringLength
        ? value.substring(0, maxStringLength) + '...'
        : value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      simplified[key] = value;
    }
    // Skip objects, arrays, functions
  }
  return simplified;
}

