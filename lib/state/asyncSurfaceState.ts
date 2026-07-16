import { ecsLog } from '../ecsLogger';
import {
  createECSDiagnosticToken,
  fingerprintECSDiagnosticValue,
} from '../observability/ecsDiagnosticRedaction';
import { normalizeECSSafeCode } from '../observability/ecsErrorContract';
import type { SourceTruthFreshness, SourceTruthOrigin } from '../sourceTruth';

export type ECSAsyncSurfaceStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'stale'
  | 'degraded'
  | 'disabled'
  | 'cancelled'
  | 'error';

export type ECSAsyncProviderStatus =
  | 'active'
  | 'disabled'
  | 'unavailable'
  | 'permission_denied';

export type ECSAsyncCancellationReason =
  | 'consumer_cancelled'
  | 'feature_disabled'
  | 'invalid_input'
  | 'permission_denied'
  | 'provider_disabled'
  | 'superseded'
  | 'timeout'
  | 'unmount'
  | 'unknown';

export interface ECSAsyncSurfaceState<T> {
  surfaceId: string;
  status: ECSAsyncSurfaceStatus;
  requestId: string | null;
  generation: number;
  requestFingerprint: string | null;
  startedAt: number | null;
  completedAt: number | null;
  source: SourceTruthOrigin;
  freshness: SourceTruthFreshness;
  data: T | null;
  lastGoodData: T | null;
  safeErrorCode: string | null;
  retryEligible: boolean;
  featureEnabled: boolean;
  provider: string | null;
  providerStatus: ECSAsyncProviderStatus;
  cancellationReason: ECSAsyncCancellationReason | null;
  resultCount: number | null;
}

export interface ECSAsyncRequestIdentity {
  requestId: string | null;
  generation: number;
  requestFingerprint?: string | null;
}

export type ECSAsyncTerminalStatus = Exclude<ECSAsyncSurfaceStatus, 'idle' | 'loading'>;

export interface ECSAsyncSurfaceDiagnostic {
  surfaceId: string;
  status: ECSAsyncSurfaceStatus;
  requestFingerprint: string | null;
  provider: string | null;
  source: SourceTruthOrigin;
  freshness: SourceTruthFreshness;
  elapsedMs: number | null;
  resultCount: number | null;
  cancellationReason: ECSAsyncCancellationReason | null;
  safeErrorCode: string | null;
}

type CreateStateOptions<T> = {
  surfaceId: string;
  provider?: string | null;
  featureEnabled?: boolean;
  providerStatus?: ECSAsyncProviderStatus;
  data?: T | null;
  lastGoodData?: T | null;
  source?: SourceTruthOrigin;
  freshness?: SourceTruthFreshness;
  now?: number;
};

type BeginRequestOptions = {
  now?: number;
  fingerprintInput?: unknown;
  requestFingerprint?: unknown;
  provider?: string | null;
  providerStatus?: ECSAsyncProviderStatus;
  preserveData?: boolean;
  preserveLastGood?: boolean;
};

export type SettleRequestOptions<T> = ECSAsyncRequestIdentity & {
  status: ECSAsyncTerminalStatus;
  now?: number;
  source?: SourceTruthOrigin;
  freshness?: SourceTruthFreshness;
  data?: T | null;
  lastGoodData?: T | null;
  safeErrorCode?: string | null;
  retryEligible?: boolean;
  provider?: string | null;
  providerStatus?: ECSAsyncProviderStatus;
  cancellationReason?: ECSAsyncCancellationReason | null;
  resultCount?: number | null;
  preserveLastGood?: boolean;
};

export type ECSAsyncSurfaceTransition<T> = {
  state: ECSAsyncSurfaceState<T>;
  applied: boolean;
};

function safeNow(value?: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
}

function normalizeLabel(value: string | null | undefined, fallback: string): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72);
  return normalized || fallback;
}

function inferResultCount(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') {
    const size = (value as { size?: unknown }).size;
    if (typeof size === 'number' && Number.isFinite(size) && size >= 0) {
      return Math.floor(size);
    }
  }
  return null;
}

function safeErrorCode(value: string | null | undefined): string | null {
  return value ? normalizeECSSafeCode(value) : null;
}

export function createECSAsyncRequestFingerprint(input: unknown): string {
  const serialized = fingerprintECSDiagnosticValue(input);
  return createECSDiagnosticToken('request', serialized) ?? 'request_none';
}

export function createECSAsyncSurfaceState<T>(
  options: CreateStateOptions<T>,
): ECSAsyncSurfaceState<T> {
  const featureEnabled = options.featureEnabled !== false;
  const data = options.data ?? null;
  return {
    surfaceId: normalizeLabel(options.surfaceId, 'async_surface'),
    status: featureEnabled ? 'idle' : 'disabled',
    requestId: null,
    generation: 0,
    requestFingerprint: null,
    startedAt: null,
    completedAt: featureEnabled ? null : safeNow(options.now),
    source: options.source ?? (data == null ? 'unavailable' : 'cached'),
    freshness: options.freshness ?? (data == null ? 'unavailable' : 'stale'),
    data,
    lastGoodData: options.lastGoodData ?? data,
    safeErrorCode: featureEnabled ? null : 'FEATURE_DISABLED',
    retryEligible: false,
    featureEnabled,
    provider: options.provider ? normalizeLabel(options.provider, 'provider') : null,
    providerStatus: options.providerStatus ?? (featureEnabled ? 'active' : 'disabled'),
    cancellationReason: featureEnabled ? null : 'feature_disabled',
    resultCount: inferResultCount(data),
  };
}

export function beginECSAsyncSurfaceRequest<T>(
  state: ECSAsyncSurfaceState<T>,
  options: BeginRequestOptions = {},
): ECSAsyncSurfaceState<T> {
  const generation = state.generation + 1;
  const requestFingerprint = createECSAsyncRequestFingerprint(
    options.requestFingerprint ?? options.fingerprintInput ?? {
      surfaceId: state.surfaceId,
      generation,
    },
  );
  const requestId = `${state.surfaceId}:${generation}:${requestFingerprint.slice(-8)}`;
  const preserveData = options.preserveData !== false;
  const preserveLastGood = options.preserveLastGood !== false;

  return {
    ...state,
    status: 'loading',
    requestId,
    generation,
    requestFingerprint,
    startedAt: safeNow(options.now),
    completedAt: null,
    data: preserveData ? state.data : null,
    lastGoodData: preserveLastGood ? state.lastGoodData : null,
    safeErrorCode: null,
    retryEligible: false,
    featureEnabled: true,
    provider: options.provider
      ? normalizeLabel(options.provider, 'provider')
      : state.provider,
    providerStatus: options.providerStatus ?? 'active',
    cancellationReason: null,
    resultCount: preserveData ? state.resultCount : null,
  };
}

export function isCurrentECSAsyncSurfaceRequest<T>(
  state: ECSAsyncSurfaceState<T>,
  identity: ECSAsyncRequestIdentity,
): boolean {
  return state.status === 'loading'
    && identity.requestId != null
    && state.requestId === identity.requestId
    && state.generation === identity.generation
    && (
      identity.requestFingerprint == null
      || state.requestFingerprint === identity.requestFingerprint
    );
}

export function settleECSAsyncSurfaceRequest<T>(
  state: ECSAsyncSurfaceState<T>,
  options: SettleRequestOptions<T>,
): ECSAsyncSurfaceTransition<T> {
  if (!isCurrentECSAsyncSurfaceRequest(state, options)) {
    return { state, applied: false };
  }

  const hasData = options.data !== undefined;
  const hasLastGood = options.lastGoodData !== undefined;
  const preserveLastGood = options.preserveLastGood !== false;
  const fallbackData = preserveLastGood ? state.lastGoodData ?? state.data : null;
  let data: T | null;

  if (hasData) {
    data = options.data ?? null;
  } else if (options.status === 'stale' || options.status === 'degraded') {
    data = fallbackData;
  } else if (options.status === 'error' || options.status === 'cancelled' || options.status === 'disabled') {
    data = fallbackData;
  } else {
    data = null;
  }

  let lastGoodData = preserveLastGood ? state.lastGoodData : null;
  if (hasLastGood) {
    lastGoodData = options.lastGoodData ?? null;
  } else if (options.status === 'ready' && data != null) {
    lastGoodData = data;
  } else if (lastGoodData == null && (options.status === 'stale' || options.status === 'degraded') && data != null) {
    lastGoodData = data;
  }

  const resultCount = options.resultCount != null
    ? Math.max(0, Math.floor(options.resultCount))
    : options.status === 'empty'
      ? 0
      : inferResultCount(data);
  const featureEnabled = options.status === 'disabled' ? false : state.featureEnabled;
  const providerStatus = options.providerStatus
    ?? (options.status === 'disabled' ? 'disabled' : state.providerStatus);

  const next: ECSAsyncSurfaceState<T> = {
    ...state,
    status: options.status,
    completedAt: safeNow(options.now),
    source: options.source ?? state.source,
    freshness: options.freshness ?? state.freshness,
    data,
    lastGoodData,
    safeErrorCode: safeErrorCode(options.safeErrorCode),
    retryEligible: options.retryEligible
      ?? (options.status === 'error' || options.status === 'stale' || options.status === 'degraded'),
    featureEnabled,
    provider: options.provider
      ? normalizeLabel(options.provider, 'provider')
      : state.provider,
    providerStatus,
    cancellationReason: options.cancellationReason ?? null,
    resultCount,
  };

  logECSAsyncSurfaceDiagnostic(next, next.completedAt ?? undefined);
  return { state: next, applied: true };
}

export function cancelECSAsyncSurfaceRequest<T>(
  state: ECSAsyncSurfaceState<T>,
  options: ECSAsyncRequestIdentity & {
    reason: ECSAsyncCancellationReason;
    now?: number;
    safeErrorCode?: string;
  },
): ECSAsyncSurfaceTransition<T> {
  return settleECSAsyncSurfaceRequest(state, {
    ...options,
    status: 'cancelled',
    source: state.source,
    freshness: state.freshness,
    safeErrorCode: options.safeErrorCode ?? 'REQUEST_CANCELLED',
    retryEligible: options.reason !== 'unmount' && options.reason !== 'feature_disabled',
    cancellationReason: options.reason,
  });
}

export function disableECSAsyncSurface<T>(
  state: ECSAsyncSurfaceState<T>,
  options: {
    reason: Extract<ECSAsyncCancellationReason, 'feature_disabled' | 'permission_denied' | 'provider_disabled' | 'invalid_input'>;
    safeErrorCode: string;
    providerStatus?: ECSAsyncProviderStatus;
    now?: number;
    preserveLastGood?: boolean;
  },
): ECSAsyncSurfaceState<T> {
  const preserveLastGood = options.preserveLastGood !== false;
  const data = preserveLastGood ? state.lastGoodData ?? state.data : null;
  const next: ECSAsyncSurfaceState<T> = {
    ...state,
    status: 'disabled',
    completedAt: safeNow(options.now),
    source: data == null ? 'unavailable' : state.source,
    freshness: data == null ? 'unavailable' : state.freshness,
    data,
    lastGoodData: preserveLastGood ? state.lastGoodData : null,
    safeErrorCode: safeErrorCode(options.safeErrorCode),
    retryEligible: false,
    featureEnabled: options.reason === 'feature_disabled' ? false : state.featureEnabled,
    providerStatus: options.providerStatus
      ?? (options.reason === 'permission_denied' ? 'permission_denied' : 'disabled'),
    cancellationReason: options.reason,
    resultCount: inferResultCount(data),
  };
  logECSAsyncSurfaceDiagnostic(next, next.completedAt ?? undefined);
  return next;
}

export function createECSAsyncSurfaceDiagnostic<T>(
  state: ECSAsyncSurfaceState<T>,
  now: number = Date.now(),
): ECSAsyncSurfaceDiagnostic {
  const terminalAt = state.completedAt ?? safeNow(now);
  const elapsedMs = state.startedAt == null
    ? null
    : Math.max(0, terminalAt - state.startedAt);
  return {
    surfaceId: state.surfaceId,
    status: state.status,
    requestFingerprint: state.requestFingerprint,
    provider: state.provider,
    source: state.source,
    freshness: state.freshness,
    elapsedMs,
    resultCount: state.resultCount,
    cancellationReason: state.cancellationReason,
    safeErrorCode: state.safeErrorCode,
  };
}

export function logECSAsyncSurfaceDiagnostic<T>(
  state: ECSAsyncSurfaceState<T>,
  now?: number,
): void {
  const diagnostic = createECSAsyncSurfaceDiagnostic(state, now);
  ecsLog.dev('SYSTEM', 'async_surface_state', diagnostic, {
    debugFlag: 'async_surface_state',
    fingerprint: [
      diagnostic.surfaceId,
      diagnostic.status,
      diagnostic.requestFingerprint ?? 'none',
      diagnostic.safeErrorCode ?? 'none',
    ].join(':'),
  });
}
