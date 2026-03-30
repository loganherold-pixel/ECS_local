/**
 * Rate Limit Store — Tracks rate limit state per ECS edge function
 *
 * Captures rate limit headers from edge function responses and provides
 * reactive state for the RateLimitBanner component.
 *
 * Response headers consumed:
 *   X-RateLimit-Limit     — Max requests per window
 *   X-RateLimit-Remaining — Requests remaining in current window
 *   X-RateLimit-Reset     — ISO timestamp when the window resets
 *   Retry-After           — Seconds until next request allowed (on 429)
 *
 * Integrates with:
 *   - weatherStore.ts, debriefStore.ts, dispatchStore.ts (producers)
 *   - RateLimitBanner.tsx (consumer)
 *   - retryClassifier.ts (error classification)
 */

// ── Types ─────────────────────────────────────────────────────

export interface RateLimitInfo {
  /** Edge function name */
  functionName: string;
  /** Human-readable label for the function */
  label: string;
  /** Max requests allowed per window */
  limit: number;
  /** Requests remaining in current window */
  remaining: number;
  /** ISO timestamp when the current window resets */
  resetAt: string;
  /** Seconds until rate limit resets (for 429 responses) */
  retryAfter: number;
  /** Whether the user is currently rate limited (429 received) */
  isLimited: boolean;
  /** Whether the user is approaching the limit (< 20% remaining) */
  isWarning: boolean;
  /** Timestamp when this info was last updated */
  updatedAt: number;
}

export type RateLimitListener = (states: Record<string, RateLimitInfo>) => void;

// ── Function Labels ───────────────────────────────────────────

const FUNCTION_LABELS: Record<string, string> = {
  'analyze-expedition': 'AI Analysis',
  'cross-expedition-trends': 'AI Trends',
  'get-weather': 'Weather',
  'dispatch-feed': 'Dispatch',
};

// ── Warning Threshold ─────────────────────────────────────────

/** Show warning when remaining requests drop below this fraction of the limit */
const WARNING_THRESHOLD = 0.2;

// ── Store State ───────────────────────────────────────────────

const _state: Record<string, RateLimitInfo> = {};
const _listeners: Set<RateLimitListener> = new Set();
let _activeCountdownTimer: ReturnType<typeof setInterval> | null = null;

// ── Notify ────────────────────────────────────────────────────

function _notify() {
  const snapshot = { ..._state };
  _listeners.forEach(fn => {
    try { fn(snapshot); } catch (e) { /* swallow */ }
  });
}

// ── Countdown Timer ───────────────────────────────────────────

function _startCountdownIfNeeded() {
  if (_activeCountdownTimer) return;

  const hasActiveLimit = Object.values(_state).some(s => s.isLimited && s.retryAfter > 0);
  if (!hasActiveLimit) return;

  _activeCountdownTimer = setInterval(() => {
    let anyActive = false;

    for (const key of Object.keys(_state)) {
      const info = _state[key];
      if (info.isLimited && info.retryAfter > 0) {
        info.retryAfter = Math.max(0, info.retryAfter - 1);
        if (info.retryAfter <= 0) {
          info.isLimited = false;
          info.remaining = 1; // Optimistic: allow one request
          info.isWarning = true;
        } else {
          anyActive = true;
        }
      }
    }

    _notify();

    if (!anyActive && _activeCountdownTimer) {
      clearInterval(_activeCountdownTimer);
      _activeCountdownTimer = null;
    }
  }, 1000);
}

// ── Public API ────────────────────────────────────────────────

/**
 * Update rate limit state from edge function response headers.
 *
 * Call this after every edge function invocation that returns rate limit headers.
 * Works with both successful responses and 429 errors.
 *
 * @param functionName - Edge function name (e.g. 'get-weather')
 * @param headers - Response headers object or plain object
 * @param httpStatus - HTTP status code of the response
 */
export function updateFromResponse(
  functionName: string,
  headers: Record<string, string> | null,
  httpStatus?: number,
): void {
  if (!headers) return;

  // Normalize header access (handle case-insensitive keys)
  const getHeader = (name: string): string | null => {
    if (!headers) return null;
    const lower = name.toLowerCase();
    for (const [key, val] of Object.entries(headers)) {
      if (key.toLowerCase() === lower) return val;
    }
    return null;
  };

  const limitStr = getHeader('X-RateLimit-Limit');
  const remainingStr = getHeader('X-RateLimit-Remaining');
  const resetAt = getHeader('X-RateLimit-Reset');
  const retryAfterStr = getHeader('Retry-After');

  // Only update if we got rate limit headers
  if (!limitStr && !remainingStr && !retryAfterStr && httpStatus !== 429) return;

  const limit = limitStr ? parseInt(limitStr, 10) : (_state[functionName]?.limit ?? 0);
  const remaining = remainingStr ? parseInt(remainingStr, 10) : 0;
  const retryAfter = retryAfterStr ? parseInt(retryAfterStr, 10) : 0;
  const isLimited = httpStatus === 429 || remaining <= 0;
  const isWarning = !isLimited && limit > 0 && (remaining / limit) <= WARNING_THRESHOLD;

  _state[functionName] = {
    functionName,
    label: FUNCTION_LABELS[functionName] || functionName,
    limit: isNaN(limit) ? 0 : limit,
    remaining: isNaN(remaining) ? 0 : remaining,
    resetAt: resetAt || '',
    retryAfter: isNaN(retryAfter) ? 0 : retryAfter,
    isLimited,
    isWarning,
    updatedAt: Date.now(),
  };

  _notify();

  if (isLimited && retryAfter > 0) {
    _startCountdownIfNeeded();
  }
}

/**
 * Update rate limit state from a JSON response body that includes rate limit fields.
 * Some ECS edge functions include rate limit info in the response body.
 */
export function updateFromBody(
  functionName: string,
  body: any,
  httpStatus?: number,
): void {
  if (!body?._rateLimit) return;

  const rl = body._rateLimit;
  const limit = typeof rl.limit === 'number' ? rl.limit : (_state[functionName]?.limit ?? 0);
  const remaining = typeof rl.remaining === 'number' ? rl.remaining : 0;
  const retryAfter = typeof rl.retryAfter === 'number' ? rl.retryAfter : 0;
  const isLimited = httpStatus === 429 || remaining <= 0;
  const isWarning = !isLimited && limit > 0 && (remaining / limit) <= WARNING_THRESHOLD;

  _state[functionName] = {
    functionName,
    label: FUNCTION_LABELS[functionName] || functionName,
    limit,
    remaining,
    resetAt: rl.resetAt || '',
    retryAfter,
    isLimited,
    isWarning,
    updatedAt: Date.now(),
  };

  _notify();

  if (isLimited && retryAfter > 0) {
    _startCountdownIfNeeded();
  }
}

/**
 * Manually mark a function as rate limited (e.g. when a 429 is caught).
 */
export function markLimited(functionName: string, retryAfterSeconds: number = 60): void {
  const existing = _state[functionName];
  _state[functionName] = {
    functionName,
    label: FUNCTION_LABELS[functionName] || functionName,
    limit: existing?.limit ?? 0,
    remaining: 0,
    resetAt: new Date(Date.now() + retryAfterSeconds * 1000).toISOString(),
    retryAfter: retryAfterSeconds,
    isLimited: true,
    isWarning: false,
    updatedAt: Date.now(),
  };

  _notify();
  _startCountdownIfNeeded();
}

/**
 * Clear rate limit state for a function (e.g. after window resets).
 */
export function clearLimit(functionName: string): void {
  delete _state[functionName];
  _notify();
}

/**
 * Get current rate limit state for all tracked functions.
 */
export function getAll(): Record<string, RateLimitInfo> {
  return { ..._state };
}

/**
 * Get rate limit state for a specific function.
 */
export function get(functionName: string): RateLimitInfo | null {
  return _state[functionName] || null;
}

/**
 * Check if any function is currently rate limited.
 */
export function hasAnyLimit(): boolean {
  return Object.values(_state).some(s => s.isLimited);
}

/**
 * Check if any function has a warning (approaching limit).
 */
export function hasAnyWarning(): boolean {
  return Object.values(_state).some(s => s.isWarning || s.isLimited);
}

/**
 * Get all functions that are currently limited or warning.
 */
export function getActive(): RateLimitInfo[] {
  return Object.values(_state).filter(s => s.isLimited || s.isWarning);
}

/**
 * Subscribe to rate limit state changes.
 * Returns an unsubscribe function.
 */
export function subscribe(listener: RateLimitListener): () => void {
  _listeners.add(listener);
  // Immediately notify with current state
  try { listener({ ..._state }); } catch (e) { /* swallow */ }
  return () => { _listeners.delete(listener); };
}

/**
 * Format retry-after seconds into human-readable string.
 */
export function formatRetryAfter(seconds: number): string {
  if (seconds <= 0) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

