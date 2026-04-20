import { createPersistedKeyValueCache } from '../keyValuePersistence';
import {
  reportDegradedState,
  reportNonFatalIssue,
  reportRecoverableFailure,
} from '../ecsIssueIntelligence';

export type AuthEntryMode =
  | 'manual_login'
  | 'cold_launch'
  | 'app_resume'
  | 'remembered_session'
  | 'logout_return';

export type AuthFailureCategory =
  | 'invalid_credentials'
  | 'validation_error'
  | 'offline'
  | 'timeout'
  | 'provider_unavailable'
  | 'rate_limited'
  | 'session_expired'
  | 'session_restore_failed'
  | 'entitlement_inactive'
  | 'entitlement_pending'
  | 'entitlement_verification_failed'
  | 'route_guard_mismatch'
  | 'unknown_auth_failure';

export type AuthDiagnosticEventName =
  | 'auth_login_viewed'
  | 'auth_login_submitted'
  | 'auth_login_succeeded'
  | 'auth_login_failed'
  | 'auth_password_reset_submitted'
  | 'auth_password_reset_succeeded'
  | 'auth_password_reset_failed'
  | 'auth_session_restore_started'
  | 'auth_session_restore_succeeded'
  | 'auth_session_restore_failed'
  | 'auth_access_verification_started'
  | 'auth_access_verification_succeeded'
  | 'auth_access_verification_failed'
  | 'auth_logout_started'
  | 'auth_logout_completed'
  | 'auth_reauthentication_required'
  | 'auth_route_guard_fallback'
  | 'auth_authenticated_destination_resolved'
  | 'auth_authenticated_destination_fallback'
  | 'auth_degraded_state_presented'
  | 'auth_first_authenticated_frame_visible';

export interface AuthDiagnosticPayload {
  route?: string | null;
  entry_mode?: AuthEntryMode | null;
  result?: 'success' | 'failure' | 'fallback' | 'started' | 'completed' | null;
  failure_category?: AuthFailureCategory | null;
  duration_ms?: number | null;
  network_state?: 'online' | 'offline' | 'reconnecting' | 'unknown' | null;
  access_state?: string | null;
  retry_count?: number | null;
  metadata?: Record<string, unknown>;
}

export interface AuthDiagnosticEvent extends AuthDiagnosticPayload {
  name: AuthDiagnosticEventName;
  occurred_at: string;
}

const STORAGE = createPersistedKeyValueCache('ecs_auth_diagnostics');
const EVENTS_KEY = 'auth_events_v1';
const COUNTS_KEY = 'auth_counts_v1';
const MAX_EVENTS = 240;
const appLaunchStartedAt = Date.now();
const inMemoryCounters = new Map<string, number>();
const timerMap = new Map<string, number>();

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readEvents(): AuthDiagnosticEvent[] {
  return safeJsonParse<AuthDiagnosticEvent[]>(STORAGE.get(EVENTS_KEY), []);
}

function writeEvents(events: AuthDiagnosticEvent[]): void {
  STORAGE.set(EVENTS_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
}

function readCounters(): Record<string, number> {
  return safeJsonParse<Record<string, number>>(STORAGE.get(COUNTS_KEY), {});
}

function writeCounters(counters: Record<string, number>): void {
  STORAGE.set(COUNTS_KEY, JSON.stringify(counters));
}

function bumpCounter(key: string): number {
  const persisted = readCounters();
  const next = (inMemoryCounters.get(key) ?? persisted[key] ?? 0) + 1;
  inMemoryCounters.set(key, next);
  writeCounters({
    ...persisted,
    [key]: next,
  });
  return next;
}

function shouldEscalate(name: AuthDiagnosticEventName, failureCategory?: AuthFailureCategory | null): boolean {
  return (
    name === 'auth_session_restore_failed' ||
    name === 'auth_access_verification_failed' ||
    name === 'auth_route_guard_fallback' ||
    name === 'auth_reauthentication_required' ||
    name === 'auth_login_failed' ||
    failureCategory === 'session_expired' ||
    failureCategory === 'session_restore_failed' ||
    failureCategory === 'route_guard_mismatch' ||
    failureCategory === 'entitlement_verification_failed'
  );
}

function reportEscalatedAuthIssue(
  name: AuthDiagnosticEventName,
  payload: AuthDiagnosticPayload,
  retryCount: number,
): void {
  const failureCategory = payload.failure_category ?? null;
  const metadata = {
    authEvent: name,
    entryMode: payload.entry_mode ?? null,
    durationMs: payload.duration_ms ?? null,
    networkState: payload.network_state ?? null,
    accessState: payload.access_state ?? null,
    retryCount,
    ...(payload.metadata ?? {}),
  };

  if (name === 'auth_route_guard_fallback') {
    reportDegradedState({
      severity: retryCount > 1 ? 'medium' : 'low',
      issueTitle: 'Auth route guard fallback',
      ecsArea: 'app_shell',
      message: 'Auth routing used a guarded fallback before the intended destination settled.',
      signature: `auth:${name}:${payload.route ?? 'unknown'}:${failureCategory ?? 'none'}`,
      metadata,
    });
    return;
  }

  if (name === 'auth_access_verification_failed' || failureCategory === 'entitlement_verification_failed') {
    reportRecoverableFailure({
      severity: retryCount > 1 ? 'high' : 'medium',
      issueTitle: 'ECS access verification failed',
      ecsArea: 'app_shell',
      message: 'Account access could not be verified cleanly at the auth boundary.',
      signature: `auth:${name}:${failureCategory ?? 'none'}:${payload.route ?? 'unknown'}`,
      metadata,
    });
    return;
  }

  if (name === 'auth_session_restore_failed' || failureCategory === 'session_restore_failed' || failureCategory === 'session_expired') {
    reportRecoverableFailure({
      severity: retryCount > 1 ? 'high' : 'medium',
      issueTitle: 'Session restore failed',
      ecsArea: 'app_shell',
      message: 'Remembered-session restore did not resolve cleanly.',
      signature: `auth:${name}:${failureCategory ?? 'none'}:${payload.entry_mode ?? 'unknown'}`,
      metadata,
    });
    return;
  }

  if (name === 'auth_reauthentication_required') {
    reportNonFatalIssue({
      severity: retryCount > 2 ? 'medium' : 'low',
      issueTitle: 'Re-authentication required',
      ecsArea: 'app_shell',
      message: 'The current ECS session required a fresh sign-in.',
      signature: `auth:${name}:${failureCategory ?? 'none'}:${payload.entry_mode ?? 'unknown'}`,
      metadata,
    });
    return;
  }

  if (name === 'auth_login_failed') {
    reportRecoverableFailure({
      severity:
        failureCategory === 'provider_unavailable' ||
        failureCategory === 'timeout' ||
        failureCategory === 'unknown_auth_failure'
          ? 'medium'
          : 'low',
      issueTitle: 'Login attempt failed',
      ecsArea: 'app_shell',
      message: 'An ECS sign-in attempt did not complete successfully.',
      signature: `auth:${name}:${failureCategory ?? 'none'}:${payload.network_state ?? 'unknown'}`,
      metadata,
    });
  }
}

export function classifyAuthFailure(params: {
  rawMessage?: string | null;
  normalizedMessage?: string | null;
  offline?: boolean;
  sessionExpired?: boolean;
  accessState?: string | null;
}): AuthFailureCategory {
  const raw = String(params.rawMessage ?? '').toLowerCase();
  const normalized = String(params.normalizedMessage ?? '').toLowerCase();
  const combined = `${raw} ${normalized}`;

  if (params.sessionExpired || combined.includes('session has expired')) {
    return 'session_expired';
  }
  if (params.offline || combined.includes('offline') || combined.includes('network connection')) {
    return 'offline';
  }
  if (combined.includes('valid email address') || combined.includes('enter your password')) {
    return 'validation_error';
  }
  if (combined.includes('not recognized') || combined.includes('invalid login credentials')) {
    return 'invalid_credentials';
  }
  if (combined.includes('too many attempts') || combined.includes('rate limit') || combined.includes('too many requests')) {
    return 'rate_limited';
  }
  if (combined.includes('timeout') || combined.includes('timed out')) {
    return 'timeout';
  }
  if (combined.includes('service unavailable') || combined.includes('cloud services are initializing') || combined.includes('provider')) {
    return 'provider_unavailable';
  }
  if (combined.includes('unable to verify your session')) {
    return 'session_restore_failed';
  }
  if (combined.includes('access required') || params.accessState === 'inactive' || params.accessState === 'expired') {
    return 'entitlement_inactive';
  }
  if (combined.includes('verification pending') || params.accessState === 'pending_sync') {
    return 'entitlement_pending';
  }
  if (combined.includes('verify access')) {
    return 'entitlement_verification_failed';
  }

  return 'unknown_auth_failure';
}

export function recordAuthDiagnostic(
  name: AuthDiagnosticEventName,
  payload: AuthDiagnosticPayload = {},
): void {
  const counterKey = payload.failure_category
    ? `${name}:${payload.failure_category}`
    : name;
  const retryCount = bumpCounter(counterKey);
  const event: AuthDiagnosticEvent = {
    name,
    occurred_at: new Date().toISOString(),
    route: payload.route ?? null,
    entry_mode: payload.entry_mode ?? null,
    result: payload.result ?? null,
    failure_category: payload.failure_category ?? null,
    duration_ms: payload.duration_ms ?? null,
    network_state: payload.network_state ?? null,
    access_state: payload.access_state ?? null,
    retry_count: retryCount,
    metadata: payload.metadata ?? {},
  };

  writeEvents([...readEvents(), event]);

  if (shouldEscalate(name, payload.failure_category)) {
    reportEscalatedAuthIssue(name, payload, retryCount);
  }
}

export function markAuthTimingStart(key: string): void {
  timerMap.set(key, Date.now());
}

export function consumeAuthTiming(key: string): number | null {
  const startedAt = timerMap.get(key);
  if (!startedAt) return null;
  timerMap.delete(key);
  return Math.max(0, Date.now() - startedAt);
}

export function getAppLaunchDurationMs(): number {
  return Math.max(0, Date.now() - appLaunchStartedAt);
}

export function getAuthDiagnosticsSnapshot(): {
  events: AuthDiagnosticEvent[];
  counters: Record<string, number>;
} {
  return {
    events: readEvents(),
    counters: readCounters(),
  };
}
