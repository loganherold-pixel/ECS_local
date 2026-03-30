/**
 * Retry Classifier — Intelligent Error Categorization & Retry Strategies
 *
 * Classifies errors from sync action processing into categories, each with
 * a tailored retry strategy:
 *
 *   network_timeout  → Immediate retry (short delay, more attempts)
 *   server_error     → Standard exponential backoff
 *   auth_expired     → Refresh auth token, then retry
 *   rate_limited     → Long backoff with jitter
 *   client_error     → Permanent skip (4xx, payload is wrong)
 *   unrecoverable    → Permanent skip (UUID errors, RLS violations)
 *   unknown          → Conservative backoff (fallback)
 *
 * Integrates with:
 *   - syncActionQueue.ts processQueue() for per-action retry decisions
 *   - auth.ts for token refresh on 401 errors
 *   - SyncQueueIndicator.tsx for displaying error categories in UI
 *   - connectivity.ts for network state awareness
 */

import { supabase } from './supabase';

// ── Error Categories ──────────────────────────────────────────

export type ErrorCategory =
  | 'network_timeout'   // Network timeout, fetch abort, DNS failure, ECONNRESET
  | 'server_error'      // HTTP 5xx — server-side issue, likely transient
  | 'auth_expired'      // HTTP 401 — token expired, needs refresh
  | 'rate_limited'      // HTTP 429 — too many requests, back off
  | 'client_error'      // HTTP 4xx (except 401/429) — payload is wrong, won't fix itself
  | 'unrecoverable'     // UUID parse errors, RLS violations, schema mismatches
  | 'unknown';          // Unclassified — use conservative retry

// ── Retry Strategy ────────────────────────────────────────────

export interface RetryStrategy {
  /** Error category this strategy applies to */
  category: ErrorCategory;
  /** Whether the action should be retried at all */
  shouldRetry: boolean;
  /** Base delay before first retry (ms) */
  baseDelayMs: number;
  /** Maximum number of retry attempts for this category */
  maxRetries: number;
  /** Multiplier applied to delay on each subsequent retry */
  backoffMultiplier: number;
  /** Whether to add random jitter to the delay (prevents thundering herd) */
  jitter: boolean;
  /** Whether an auth token refresh should be attempted before retrying */
  requiresAuthRefresh: boolean;
  /** Human-readable description for logging and UI */
  description: string;
}

// ── Classification Result ─────────────────────────────────────

export interface ErrorClassification {
  /** Determined error category */
  category: ErrorCategory;
  /** Retry strategy for this category */
  strategy: RetryStrategy;
  /** Original error message */
  originalError: string;
  /** HTTP status code if available */
  httpStatus?: number;
  /** Whether this error is considered permanent (no retry) */
  isPermanent: boolean;
  /** Suggested delay for the next retry attempt (ms), accounting for current retry count */
  suggestedDelayMs: number;
}

// ── Strategy Definitions ──────────────────────────────────────

const STRATEGIES: Record<ErrorCategory, RetryStrategy> = {
  network_timeout: {
    category: 'network_timeout',
    shouldRetry: true,
    baseDelayMs: 500,
    maxRetries: 5,
    backoffMultiplier: 1.5,
    jitter: false,
    requiresAuthRefresh: false,
    description: 'Network timeout — retrying quickly',
  },
  server_error: {
    category: 'server_error',
    shouldRetry: true,
    baseDelayMs: 2000,
    maxRetries: 3,
    backoffMultiplier: 2,
    jitter: true,
    requiresAuthRefresh: false,
    description: 'Server error — retrying with backoff',
  },
  auth_expired: {
    category: 'auth_expired',
    shouldRetry: true,
    baseDelayMs: 1000,
    maxRetries: 2,
    backoffMultiplier: 1,
    jitter: false,
    requiresAuthRefresh: true,
    description: 'Auth expired — refreshing token',
  },
  rate_limited: {
    category: 'rate_limited',
    shouldRetry: true,
    baseDelayMs: 10000,
    maxRetries: 3,
    backoffMultiplier: 3,
    jitter: true,
    requiresAuthRefresh: false,
    description: 'Rate limited — backing off',
  },
  client_error: {
    category: 'client_error',
    shouldRetry: false,
    baseDelayMs: 0,
    maxRetries: 0,
    backoffMultiplier: 1,
    jitter: false,
    requiresAuthRefresh: false,
    description: 'Client error — action skipped permanently',
  },
  unrecoverable: {
    category: 'unrecoverable',
    shouldRetry: false,
    baseDelayMs: 0,
    maxRetries: 0,
    backoffMultiplier: 1,
    jitter: false,
    requiresAuthRefresh: false,
    description: 'Unrecoverable error — action skipped permanently',
  },
  unknown: {
    category: 'unknown',
    shouldRetry: true,
    baseDelayMs: 1500,
    maxRetries: 3,
    backoffMultiplier: 2,
    jitter: true,
    requiresAuthRefresh: false,
    description: 'Unknown error — retrying conservatively',
  },
};

// ── Error Pattern Matchers ────────────────────────────────────

/** Patterns that indicate a network/timeout error */
const NETWORK_TIMEOUT_PATTERNS = [
  'aborterror',
  'aborted',
  'network request failed',
  'network error',
  'failed to fetch',
  'load failed',
  'econnreset',
  'econnrefused',
  'econnaborted',
  'etimedout',
  'enetunreach',
  'dns',
  'timeout',
  'timed out',
  'request timed out',
  'socket hang up',
  'err_network',
  'err_internet_disconnected',
  'err_connection_refused',
  'err_connection_reset',
  'err_connection_timed_out',
  'err_name_not_resolved',
];

/** Patterns that indicate an unrecoverable error (payload is fundamentally wrong) */
const UNRECOVERABLE_PATTERNS = [
  'invalid input syntax for type uuid',
  'invalid input syntax for uuid',
  'not a valid uuid',
  'violates foreign key constraint',
  'violates row-level security policy',
  'violates check constraint',
  'violates unique constraint',
  'violates not-null constraint',
  'duplicate key value',
  'column .* does not exist',
  'relation .* does not exist',
  'permission denied for',
  'schema .* does not exist',
  'function .* does not exist',
  'pgrst301',  // PostgREST schema cache miss
];

/** Patterns that indicate rate limiting */
const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'too many requests',
  'throttled',
  'quota exceeded',
  'request limit',
  'retry-after',
  '429',
];

/** Patterns that indicate auth issues */
const AUTH_EXPIRED_PATTERNS = [
  'jwt expired',
  'jwt malformed',
  'invalid jwt',
  'token expired',
  'token is expired',
  'invalid refresh token',
  'refresh token not found',
  'not authenticated',
  'authentication required',
  'session expired',
  'invalid claim',
  'pgrst301',  // Can also be auth-related
];

// ── Classification Logic ──────────────────────────────────────

/**
 * Extract HTTP status code from various error shapes.
 * Supabase errors, fetch Response errors, and custom error objects
 * all store status codes in different places.
 */
function extractHttpStatus(error: any): number | undefined {
  if (!error) return undefined;

  // Direct status property
  if (typeof error.status === 'number') return error.status;
  if (typeof error.statusCode === 'number') return error.statusCode;

  // Supabase error shape: { code: '401', ... }
  if (typeof error.code === 'string' && /^\d{3}$/.test(error.code)) {
    return parseInt(error.code, 10);
  }

  // Nested error (Supabase functions.invoke wraps errors)
  if (error.context?.status) return error.context.status;

  // Error message may contain status code
  const msg = typeof error === 'string' ? error : error.message || '';
  const statusMatch = msg.match(/\b(4\d{2}|5\d{2})\b/);
  if (statusMatch) return parseInt(statusMatch[1], 10);

  return undefined;
}

/**
 * Check if an error message matches any pattern in a list.
 */
function matchesPatterns(errorMsg: string, patterns: string[]): boolean {
  const lower = errorMsg.toLowerCase();
  return patterns.some(pattern => lower.includes(pattern));
}

/**
 * Check if an error is a TypeError from fetch (network failure).
 * In browsers, a failed fetch throws TypeError with specific messages.
 */
function isNetworkTypeError(error: any): boolean {
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('network request failed') ||
      msg.includes('load failed') ||
      msg.includes('networkerror')
    );
  }
  return false;
}

/**
 * Classify an error into a category with an appropriate retry strategy.
 *
 * @param error - The caught error (Error object, string, or Supabase error shape)
 * @param currentRetryCount - How many times this action has already been retried
 * @returns Full classification with category, strategy, and suggested delay
 */
export function classifyError(error: any, currentRetryCount: number = 0): ErrorClassification {
  const errorMsg = typeof error === 'string'
    ? error
    : error?.message || error?.error_description || error?.msg || String(error || '');

  const httpStatus = extractHttpStatus(error);

  // ── 1. Check for network/timeout errors (highest priority) ──
  if (
    isNetworkTypeError(error) ||
    (error?.name === 'AbortError') ||
    matchesPatterns(errorMsg, NETWORK_TIMEOUT_PATTERNS)
  ) {
    return buildClassification('network_timeout', errorMsg, httpStatus, currentRetryCount);
  }

  // ── 2. Check for unrecoverable errors (before HTTP status) ──
  // These are payload-level errors that will never succeed on retry
  if (matchesPatterns(errorMsg, UNRECOVERABLE_PATTERNS)) {
    return buildClassification('unrecoverable', errorMsg, httpStatus, currentRetryCount);
  }

  // ── 3. Check HTTP status codes ──
  if (httpStatus) {
    // 401 Unauthorized — auth token expired
    if (httpStatus === 401) {
      // Double-check it's not a permanent auth error
      if (matchesPatterns(errorMsg, ['permission denied', 'forbidden', 'not allowed'])) {
        return buildClassification('client_error', errorMsg, httpStatus, currentRetryCount);
      }
      return buildClassification('auth_expired', errorMsg, httpStatus, currentRetryCount);
    }

    // 429 Too Many Requests — rate limited
    if (httpStatus === 429) {
      return buildClassification('rate_limited', errorMsg, httpStatus, currentRetryCount);
    }

    // 4xx Client Errors (except 401, 429) — permanent skip
    if (httpStatus >= 400 && httpStatus < 500) {
      return buildClassification('client_error', errorMsg, httpStatus, currentRetryCount);
    }

    // 5xx Server Errors — transient, retry with backoff
    if (httpStatus >= 500) {
      return buildClassification('server_error', errorMsg, httpStatus, currentRetryCount);
    }
  }

  // ── 4. Check error message patterns for rate limiting ──
  if (matchesPatterns(errorMsg, RATE_LIMIT_PATTERNS)) {
    return buildClassification('rate_limited', errorMsg, httpStatus, currentRetryCount);
  }

  // ── 5. Check error message patterns for auth ──
  if (matchesPatterns(errorMsg, AUTH_EXPIRED_PATTERNS)) {
    return buildClassification('auth_expired', errorMsg, httpStatus, currentRetryCount);
  }

  // ── 6. Fallback: unknown error ──
  return buildClassification('unknown', errorMsg, httpStatus, currentRetryCount);
}

/**
 * Build a full ErrorClassification from a category.
 */
function buildClassification(
  category: ErrorCategory,
  originalError: string,
  httpStatus: number | undefined,
  currentRetryCount: number,
): ErrorClassification {
  const strategy = STRATEGIES[category];
  const isPermanent = !strategy.shouldRetry;
  const suggestedDelayMs = isPermanent
    ? 0
    : calculateDelay(strategy, currentRetryCount);

  return {
    category,
    strategy,
    originalError,
    httpStatus,
    isPermanent,
    suggestedDelayMs,
  };
}

/**
 * Calculate the delay for the next retry attempt based on the strategy.
 *
 * Formula: baseDelay * (multiplier ^ retryCount) + optional jitter
 *
 * Jitter adds 0-25% random variance to prevent thundering herd when
 * multiple queued actions hit the same rate limit simultaneously.
 *
 * @param strategy - The retry strategy for this error category
 * @param retryCount - Current retry count (0-based)
 * @returns Delay in milliseconds
 */
export function calculateDelay(strategy: RetryStrategy, retryCount: number): number {
  if (!strategy.shouldRetry) return 0;

  const base = strategy.baseDelayMs * Math.pow(strategy.backoffMultiplier, retryCount);

  // Cap at 60 seconds to prevent absurdly long waits
  const capped = Math.min(base, 60_000);

  if (strategy.jitter) {
    // Add 0-25% random jitter
    const jitterRange = capped * 0.25;
    const jitter = Math.random() * jitterRange;
    return Math.round(capped + jitter);
  }

  return Math.round(capped);
}

// ── Auth Refresh ──────────────────────────────────────────────

/**
 * Attempt to refresh the Supabase auth session.
 *
 * Called by processQueue when an action fails with auth_expired.
 * If refresh succeeds, the action is retried with the new token.
 * If refresh fails, the action is marked as failed (user must re-login).
 *
 * @returns true if the session was refreshed successfully
 */
export async function attemptAuthRefresh(): Promise<boolean> {
  try {
    console.log('[RetryClassifier] Attempting auth token refresh...');

    const { data, error } = await supabase.auth.refreshSession();

    if (error) {
      console.warn('[RetryClassifier] Auth refresh failed:', error.message);
      return false;
    }

    if (data?.session) {
      console.log('[RetryClassifier] Auth token refreshed successfully');
      return true;
    }

    console.warn('[RetryClassifier] Auth refresh returned no session');
    return false;
  } catch (e: any) {
    console.warn('[RetryClassifier] Auth refresh threw:', e?.message || e);
    return false;
  }
}

// ── Retry-After Header Parsing ────────────────────────────────

/**
 * Extract a Retry-After delay from an error or response.
 * Some APIs return a Retry-After header with 429 responses.
 *
 * @param error - The error object (may contain headers or retryAfter field)
 * @returns Delay in milliseconds, or null if not found
 */
export function extractRetryAfter(error: any): number | null {
  if (!error) return null;

  // Direct retryAfter field (some SDKs normalize this)
  if (typeof error.retryAfter === 'number') {
    return error.retryAfter * 1000; // Convert seconds to ms
  }

  // Check headers (Response-like objects)
  const headers = error.headers || error.response?.headers;
  if (headers) {
    const retryAfter = typeof headers.get === 'function'
      ? headers.get('retry-after')
      : headers['retry-after'];

    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) return seconds * 1000;

      // Could be a date string
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        const delayMs = date.getTime() - Date.now();
        return delayMs > 0 ? delayMs : null;
      }
    }
  }

  return null;
}

// ── Strategy Lookup ───────────────────────────────────────────

/**
 * Get the retry strategy for a specific error category.
 */
export function getStrategy(category: ErrorCategory): RetryStrategy {
  return STRATEGIES[category];
}

/**
 * Get all strategy definitions (for UI display or debugging).
 */
export function getAllStrategies(): Record<ErrorCategory, RetryStrategy> {
  return { ...STRATEGIES };
}

// ── UI Helpers ────────────────────────────────────────────────

/** Human-readable labels for error categories (used in SyncQueueIndicator) */
export const ERROR_CATEGORY_LABELS: Record<ErrorCategory, string> = {
  network_timeout: 'TIMEOUT',
  server_error: 'SERVER',
  auth_expired: 'AUTH',
  rate_limited: 'RATE LIMIT',
  client_error: 'CLIENT',
  unrecoverable: 'PERMANENT',
  unknown: 'UNKNOWN',
};

/** Colors for error category badges in the UI */
export const ERROR_CATEGORY_COLORS: Record<ErrorCategory, string> = {
  network_timeout: '#FF9500',   // Orange — transient, will resolve
  server_error: '#FF6B35',      // Deep orange — server issue
  auth_expired: '#AF52DE',      // Purple — auth needs attention
  rate_limited: '#5856D6',      // Indigo — throttled
  client_error: '#FF3B30',      // Red — permanent
  unrecoverable: '#FF3B30',     // Red — permanent
  unknown: '#8E8E93',           // Gray — unclassified
};

/** Icons for error category badges */
export const ERROR_CATEGORY_ICONS: Record<ErrorCategory, string> = {
  network_timeout: 'wifi-outline',
  server_error: 'server-outline',
  auth_expired: 'key-outline',
  rate_limited: 'speedometer-outline',
  client_error: 'close-circle-outline',
  unrecoverable: 'ban-outline',
  unknown: 'help-circle-outline',
};

