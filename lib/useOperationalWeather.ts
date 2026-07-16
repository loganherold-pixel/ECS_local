import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { buildECSWeatherSnapshot, type ECSWeatherSnapshot, type ECSWeatherSourceType } from './ecsWeather';
import { resolveWeatherLastGoodUpdate } from './weatherLastGoodState';
import {
  hasUsableWeatherFetchResult,
  waitForWeatherCacheHydration,
  type WeatherFetchResult,
} from './weatherStore';
import {
  fetchSharedWeatherForCoordinates,
  getAnyCachedSharedWeather,
  getCachedSharedWeatherResult,
  resolveECSWeatherTarget,
} from './weatherService';
import { buildWeatherRequestKey } from './weatherRequestDedupe';
import type { WeatherCoordinate } from './weatherTypes';
import { ecsLog } from './ecsLogger';
import { logWeatherDiagnostics } from './weatherDiagnostics';
import {
  WEATHER_LOCATION_STALE_DISTANCE_METERS,
  type ResolvedWeatherLocation,
} from './weatherLocationResolver';
import {
  incrementECSPerformanceCounter,
  startECSPerformanceRequest,
} from './performance/ecsPerformanceDiagnostics';
import {
  beginECSAsyncSurfaceRequest,
  cancelECSAsyncSurfaceRequest,
  createECSAsyncSurfaceState,
  isCurrentECSAsyncSurfaceRequest,
  settleECSAsyncSurfaceRequest,
  type ECSAsyncCancellationReason,
  type ECSAsyncRequestIdentity,
  type ECSAsyncSurfaceState,
} from './state/asyncSurfaceState';

interface GPSInput {
  lat?: number | null;
  lng?: number | null;
  hasFix?: boolean;
  permissionDenied?: boolean;
  accuracyM?: number | null;
}

export interface UseOperationalWeatherOptions {
  enabled?: boolean;
  gps?: GPSInput | null;
  routeCoordinate?: WeatherCoordinate | null;
  selectedCoordinate?: WeatherCoordinate | null;
  lastKnownCoordinate?: WeatherCoordinate | null;
  units?: 'imperial' | 'metric';
  freshnessWindowMs?: number;
  movementThresholdM?: number;
}

interface UseOperationalWeatherResult {
  snapshot: ECSWeatherSnapshot;
  refresh: () => void;
  result: WeatherFetchResult | null;
}

interface ResolvedWeatherTarget {
  lat: number | null;
  lng: number | null;
  label: string;
  sourceType: ECSWeatherSourceType;
  waitingForGps: boolean;
  accuracyM: number | null;
  location: ResolvedWeatherLocation | null;
}

const DEFAULT_FRESHNESS_WINDOW_MS = 20 * 60 * 1000;
const DEFAULT_MOVEMENT_THRESHOLD_M = WEATHER_LOCATION_STALE_DISTANCE_METERS;
const SHARED_DEFAULT_LOCATION_LABEL = 'Current Position';
const SHARED_NO_CONSUMER_GRACE_MS = 2500;
const OPERATIONAL_WEATHER_REQUEST_TIMEOUT_MS = 15_000;
const OPERATIONAL_WEATHER_FAILED_RETRY_COOLDOWN_MS = 30_000;

type OperationalWeatherWaitFailure = 'cancelled' | 'timeout';

export class OperationalWeatherWaitError extends Error {
  readonly failure: OperationalWeatherWaitFailure;

  constructor(failure: OperationalWeatherWaitFailure) {
    super(failure === 'timeout' ? 'Operational weather request timed out' : 'Operational weather request cancelled');
    this.name = 'OperationalWeatherWaitError';
    this.failure = failure;
  }
}

export function waitForOperationalWeatherRequest<T>(
  request: Promise<T>,
  options: {
    signal?: AbortSignal | null;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const signal = options.signal ?? null;
  const timeoutMs = Math.max(1, options.timeoutMs ?? OPERATIONAL_WEATHER_REQUEST_TIMEOUT_MS);

  if (signal?.aborted) {
    return Promise.reject(new OperationalWeatherWaitError('cancelled'));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', handleAbort);
      callback();
    };
    const handleAbort = () => {
      finish(() => reject(new OperationalWeatherWaitError('cancelled')));
    };
    const timeout = setTimeout(() => {
      finish(() => reject(new OperationalWeatherWaitError('timeout')));
    }, timeoutMs);

    signal?.addEventListener('abort', handleAbort, { once: true });
    request.then(
      value => finish(() => resolve(value)),
      error => finish(() => reject(error)),
    );
  });
}

const sharedWeatherListeners = new Set<() => void>();
const sharedWeatherConsumers = new Map<string, UseOperationalWeatherOptions>();
let sharedWeatherLastFetchAt = 0;
let sharedWeatherRefreshHandler: (() => void) | null = null;
let sharedWeatherStateSignature = '';
let sharedWeatherConsumerIdSeed = 0;
let sharedWeatherNoConsumerClearLogged = false;
let sharedWeatherLastNoConsumerClearSignature: string | null = null;
let sharedWeatherNoConsumerCleanupTimer: ReturnType<typeof setTimeout> | null = null;
let sharedWeatherRequestController: AbortController | null = null;
let sharedWeatherRequestCancellationReason: ECSAsyncCancellationReason | null = null;
let sharedWeatherActiveRequestKey: string | null = null;
let sharedWeatherLastProviderAttemptAt = 0;
let sharedWeatherLastProviderAttemptKey: string | null = null;
let sharedWeatherLastProviderAttemptSucceeded = false;
let sharedWeatherAppStateSubscription: { remove: () => void } | null = null;
let sharedWeatherPreviousAppState = AppState.currentState;
let _sharedWeatherLastFetchLocation:
  | { lat: number; lng: number; sourceType: ECSWeatherSourceType }
  | null = null;
const operationalWeatherHookRequests = new Map<string, Promise<WeatherFetchResult>>();
const operationalWeatherRecentResults = new Map<string, { result: WeatherFetchResult; completedAt: number }>();
const OPERATIONAL_WEATHER_JOIN_GRACE_MS = 1500;
const OPERATIONAL_WEATHER_RECENT_RESULT_LIMIT = 24;
const WEATHER_EXPIRED_WARNING_THROTTLE_MS = 5 * 60 * 1000;
const weatherExpiredWarningState = new Map<string, number>();

function roundedCoordSignature(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : 'na';
}

function buildSharedSnapshot(
  result: WeatherFetchResult | null,
  loading: boolean,
  target: ResolvedWeatherTarget,
): ECSWeatherSnapshot {
  return buildECSWeatherSnapshot({
    result,
    loading,
    waitingForGps: target.waitingForGps,
    permissionBlocked:
      target.location?.source === 'unavailable' &&
      String(target.location.unavailableReason ?? '').toLowerCase().includes('permission'),
    sourceType: target.sourceType,
    locationFallback: target.label,
    locationResolution: target.location,
  });
}

function resolveTarget(
  gps?: GPSInput | null,
  routeCoordinate?: WeatherCoordinate | null,
  selectedCoordinate?: WeatherCoordinate | null,
  lastKnownCoordinate?: WeatherCoordinate | null,
): ResolvedWeatherTarget {
  const resolved = resolveECSWeatherTarget({
    currentGps: hasUsableGps(gps)
      ? {
        lat: Number(gps.lat),
        lng: Number(gps.lng),
        accuracyM: gps.accuracyM ?? null,
      }
      : null,
    currentGpsPermissionDenied: gps?.permissionDenied === true,
    activeRoute: routeCoordinate,
    selectedCoordinate,
    lastKnown: lastKnownCoordinate,
    fallbackLabel: SHARED_DEFAULT_LOCATION_LABEL,
  });

  if (resolved.coordinate) {
    return {
      lat: resolved.coordinate.lat,
      lng: resolved.coordinate.lng,
      label: resolved.coordinate.label || resolved.label,
      sourceType: resolved.sourceType,
      waitingForGps: false,
      accuracyM: resolved.location.accuracyM,
      location: resolved.location,
    };
  }

  return {
    lat: null,
    lng: null,
    label: resolved.label,
    sourceType: 'current_location',
    waitingForGps: gps?.permissionDenied === true ? false : true,
    accuracyM: resolved.location.accuracyM,
    location: resolved.location,
  };
}

function weatherResultSignature(result: WeatherFetchResult | null): string {
  if (!result) return 'none';
  const data = result.data as any;
  const first = Array.isArray(data?.results) ? data.results[0] : null;
  const current = first?.current ?? data?.current ?? null;
  const daily = Array.isArray(first?.daily)
    ? first.daily
    : Array.isArray(data?.daily)
      ? data.daily
      : [];
  return [
    result.source ?? 'unknown',
    result.cachedAt ?? 'no-cache-time',
    result.error ?? 'no-error',
    data?.updatedAt ?? data?.updated_at ?? data?.fetchedAt ?? data?.fetched_at ?? 'no-data-time',
    current?.dt ?? current?.updatedAt ?? current?.updated_at ?? 'no-current-time',
    current?.temp ?? current?.temperature ?? 'no-temp',
    Array.isArray(data?.results) ? data.results.length : 0,
    daily.length,
  ].join('|');
}

function weatherTargetSignature(target: ResolvedWeatherTarget): string {
  return [
    target.lat ?? 'no-lat',
    target.lng ?? 'no-lng',
    target.label,
    target.sourceType,
    target.waitingForGps ? 'waiting' : 'ready',
  ].join('|');
}

function getOperationalWeatherResultAgeMs(
  result: WeatherFetchResult | null,
  now = Date.now(),
): number | null {
  if (!result || result.cachedAt == null) return null;
  const cachedAt = Number(result.cachedAt);
  if (!Number.isFinite(cachedAt)) return null;
  return Math.max(0, now - cachedAt);
}

function normalizeOperationalWeatherCacheSource(
  result: WeatherFetchResult | null,
  freshnessWindowMs: number,
  now = Date.now(),
): WeatherFetchResult | null {
  if (!result || (result.source !== 'cache_fresh' && result.source !== 'cache_stale')) {
    return result;
  }

  const ageMs = getOperationalWeatherResultAgeMs(result, now);
  const source = ageMs != null && ageMs <= freshnessWindowMs
    ? 'cache_fresh'
    : 'cache_stale';
  return result.source === source ? result : { ...result, source };
}

function isOperationalWeatherResultExpired(
  result: WeatherFetchResult | null,
  freshnessWindowMs: number,
  now = Date.now(),
): boolean {
  const ageMs = getOperationalWeatherResultAgeMs(result, now);
  return ageMs != null && ageMs > freshnessWindowMs;
}

function sharedWeatherSignature(
  result: WeatherFetchResult | null,
  loading: boolean,
  target: ResolvedWeatherTarget,
): string {
  return `${loading ? 'loading' : 'idle'}::${weatherTargetSignature(target)}::${weatherResultSignature(result)}`;
}

function weatherConsumerSignature(options: UseOperationalWeatherOptions): string {
  const gps = options.gps;
  const routeCoordinate = options.routeCoordinate;
  const selectedCoordinate = options.selectedCoordinate;
  const lastKnownCoordinate = options.lastKnownCoordinate;
  return [
    options.enabled !== false ? 'enabled' : 'disabled',
    roundedCoordSignature(gps?.lat),
    roundedCoordSignature(gps?.lng),
    gps?.hasFix === true ? 'gps-fix' : 'gps-waiting',
    gps?.permissionDenied === true ? 'gps-denied' : 'gps-allowed',
    roundedCoordSignature(gps?.accuracyM),
    roundedCoordSignature(routeCoordinate?.lat),
    roundedCoordSignature(routeCoordinate?.lng),
    roundedCoordSignature(routeCoordinate?.accuracyM),
    roundedCoordSignature(routeCoordinate?.timestamp),
    routeCoordinate?.label ?? 'no-route-label',
    roundedCoordSignature(selectedCoordinate?.lat),
    roundedCoordSignature(selectedCoordinate?.lng),
    roundedCoordSignature(selectedCoordinate?.accuracyM),
    roundedCoordSignature(selectedCoordinate?.timestamp),
    selectedCoordinate?.label ?? 'no-selected-label',
    roundedCoordSignature(lastKnownCoordinate?.lat),
    roundedCoordSignature(lastKnownCoordinate?.lng),
    roundedCoordSignature(lastKnownCoordinate?.accuracyM),
    roundedCoordSignature(lastKnownCoordinate?.timestamp),
    lastKnownCoordinate?.label ?? 'no-last-known-label',
    options.units ?? 'imperial',
    options.freshnessWindowMs ?? DEFAULT_FRESHNESS_WINDOW_MS,
    options.movementThresholdM ?? DEFAULT_MOVEMENT_THRESHOLD_M,
  ].join('|');
}

let sharedWeatherState: {
  snapshot: ECSWeatherSnapshot;
  result: WeatherFetchResult | null;
} = {
  snapshot: buildSharedSnapshot(null, false, resolveTarget(null, null)),
  result: null,
};
let sharedWeatherLastGoodResult: WeatherFetchResult | null = null;
let sharedWeatherLastTarget = resolveTarget(null, null);
let sharedWeatherAsyncState: ECSAsyncSurfaceState<WeatherFetchResult> =
  createECSAsyncSurfaceState<WeatherFetchResult>({
    surfaceId: 'dashboard_weather',
    provider: 'openweather',
  });

function logWeatherRetention(event: string, payload?: Record<string, unknown>): void {
  const details: Record<string, unknown> = {
    scope: 'shared_operational_weather',
    ...payload,
  };

  const reason = typeof details.reason === 'string' ? details.reason : null;
  const shouldWarn =
    event === 'weather_fetch_failed' ||
    (
      event === 'current_weather_value_cleared' &&
      reason === 'explicit_clear'
    );

  if (shouldWarn) {
    ecsLog.warn('WEATHER', event, details);
    return;
  }

  ecsLog.dev('WEATHER', event, details, {
    tag: '[WEATHER]',
    debugFlag: 'EXPO_PUBLIC_ECS_WEATHER_DEBUG',
    fingerprint: `${event}:${JSON.stringify(details)}`,
    throttleMs: 2500,
    aggregateWindowMs: 10_000,
  });
}

function logWeatherDataExpired(params: {
  target: ResolvedWeatherTarget;
  units: 'imperial' | 'metric';
  result: WeatherFetchResult;
  freshnessWindowMs: number;
  now?: number;
}): void {
  const now = params.now ?? Date.now();
  const ageMs = getOperationalWeatherResultAgeMs(params.result, now);
  if (ageMs == null || ageMs <= params.freshnessWindowMs) return;

  const requestKey =
    buildOperationalWeatherRequestKey(params.target, params.units, false) ??
    weatherTargetSignature(params.target);
  const cacheKey = [
    'shared_operational_weather',
    requestKey,
    params.result.cachedAt ?? 'uncached',
    params.freshnessWindowMs,
  ].join(':');
  const previous = weatherExpiredWarningState.get(cacheKey);
  if (previous != null && now - previous < WEATHER_EXPIRED_WARNING_THROTTLE_MS) {
    return;
  }
  weatherExpiredWarningState.set(cacheKey, now);

  const normalized = normalizeOperationalWeatherCacheSource(
    params.result,
    params.freshnessWindowMs,
    now,
  );
  logWeatherRetention('weather_data_expired', {
    ageMs,
    cacheKey: requestKey,
    freshnessWindowMs: params.freshnessWindowMs,
    source: normalized?.source ?? params.result.source,
  });
}

function createOperationalWeatherAbortController(): AbortController | null {
  return typeof AbortController === 'function' ? new AbortController() : null;
}

function getOperationalWeatherSafeErrorCode(error: unknown): string {
  if (error instanceof OperationalWeatherWaitError) {
    return error.failure === 'timeout' ? 'WEATHER_REQUEST_TIMEOUT' : 'WEATHER_REQUEST_CANCELLED';
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return 'WEATHER_REQUEST_TIMEOUT';
  }
  if (normalized.includes('offline') || normalized.includes('network')) {
    return 'WEATHER_NETWORK_UNAVAILABLE';
  }
  if (normalized.includes('abort') || normalized.includes('cancel')) {
    return 'WEATHER_REQUEST_CANCELLED';
  }
  return 'WEATHER_PROVIDER_FAILURE';
}

function getOperationalWeatherSafeErrorMessage(safeErrorCode: string): string {
  switch (safeErrorCode) {
    case 'WEATHER_REQUEST_TIMEOUT':
      return 'Weather request timed out. Try again.';
    case 'WEATHER_NETWORK_UNAVAILABLE':
      return 'Weather network unavailable. Cached conditions are shown when available.';
    default:
      return 'Weather provider unavailable. Try again.';
  }
}

function createOperationalWeatherFailureResult(
  units: 'imperial' | 'metric',
  safeErrorCode: string,
  incoming?: WeatherFetchResult | null,
  lastGood: WeatherFetchResult | null = sharedWeatherLastGoodResult,
): WeatherFetchResult {
  const safeMessage = getOperationalWeatherSafeErrorMessage(safeErrorCode);
  if (lastGood && hasUsableWeatherFetchResult(lastGood)) {
    return {
      ...lastGood,
      source: 'cache_stale',
      error: safeMessage,
    };
  }
  if (incoming) {
    return {
      ...incoming,
      source: 'fallback',
      error: safeMessage,
    };
  }
  return {
    data: {
      results: [],
      fetched_at: new Date().toISOString(),
      units,
    },
    source: 'fallback',
    cachedAt: null,
    error: safeMessage,
  };
}

function createSharedWeatherRequestIdentity(): ECSAsyncRequestIdentity {
  return {
    requestId: sharedWeatherAsyncState.requestId,
    generation: sharedWeatherAsyncState.generation,
    requestFingerprint: sharedWeatherAsyncState.requestFingerprint,
  };
}

function settleSharedWeatherRequest(
  identity: ECSAsyncRequestIdentity,
  result: WeatherFetchResult,
  options: {
    safeErrorCode?: string | null;
    cancellationReason?: ECSAsyncCancellationReason | null;
  } = {},
): boolean {
  const usable = hasUsableWeatherFetchResult(result);
  const hasError = Boolean(options.safeErrorCode || result.error);
  const status = !usable
    ? 'error'
    : hasError
      ? 'degraded'
      : result.source === 'cache_stale'
        ? 'stale'
        : 'ready';
  const source = result.source === 'live'
    ? 'live'
    : result.source === 'cache_fresh' || result.source === 'cache_stale'
      ? 'cached'
      : 'unavailable';
  const freshness = result.source === 'live'
    ? 'live'
    : result.source === 'cache_fresh'
      ? 'recent'
      : result.source === 'cache_stale'
        ? 'stale'
        : 'unavailable';
  const transition = settleECSAsyncSurfaceRequest(sharedWeatherAsyncState, {
    ...identity,
    status,
    source,
    freshness,
    data: usable ? result : null,
    lastGoodData: usable ? result : sharedWeatherAsyncState.lastGoodData,
    safeErrorCode: options.safeErrorCode ?? (result.error ? 'WEATHER_PROVIDER_DEGRADED' : null),
    retryEligible: status !== 'ready',
    provider: 'openweather',
    providerStatus: status === 'error' ? 'unavailable' : 'active',
    cancellationReason: options.cancellationReason ?? null,
    resultCount: Array.isArray(result.data?.results) ? result.data.results.length : null,
  });
  sharedWeatherAsyncState = transition.state;
  return transition.applied;
}

function cancelSharedOperationalWeatherRequest(
  reason: ECSAsyncCancellationReason,
): boolean {
  sharedWeatherRequestCancellationReason = reason;
  const controller = sharedWeatherRequestController;
  const identity = createSharedWeatherRequestIdentity();
  const transition = cancelECSAsyncSurfaceRequest(sharedWeatherAsyncState, {
    ...identity,
    reason,
    safeErrorCode: reason === 'timeout' ? 'WEATHER_REQUEST_TIMEOUT' : 'WEATHER_REQUEST_CANCELLED',
  });
  sharedWeatherAsyncState = transition.state;
  if (controller && !controller.signal.aborted) {
    controller.abort();
  }
  if (sharedWeatherRequestController === controller) {
    sharedWeatherRequestController = null;
    sharedWeatherActiveRequestKey = null;
  }
  return transition.applied;
}

function notifySharedWeatherListeners(): void {
  for (const listener of sharedWeatherListeners) {
    try {
      listener();
    } catch {}
  }
}

function getActiveSharedConsumerCount(): number {
  return Array.from(sharedWeatherConsumers.values()).filter(
    consumer => consumer.enabled !== false,
  ).length;
}

function ensureSharedWeatherAppStateSubscription(): void {
  if (sharedWeatherAppStateSubscription) return;
  sharedWeatherPreviousAppState = AppState.currentState;
  sharedWeatherAppStateSubscription = AppState.addEventListener('change', (nextState) => {
    const previousState = sharedWeatherPreviousAppState;
    sharedWeatherPreviousAppState = nextState;
    if (
      nextState === 'active' &&
      previousState !== 'active' &&
      getActiveSharedConsumerCount() > 0
    ) {
      void syncSharedOperationalWeather(false);
    }
  });
}

function removeSharedWeatherAppStateSubscription(): void {
  sharedWeatherAppStateSubscription?.remove();
  sharedWeatherAppStateSubscription = null;
  sharedWeatherPreviousAppState = AppState.currentState;
}

function setSharedWeatherState(
  result: WeatherFetchResult | null,
  loading: boolean,
  target: ResolvedWeatherTarget,
  freshnessWindowMs = DEFAULT_FRESHNESS_WINDOW_MS,
): void {
  sharedWeatherLastTarget = target;
  const normalizedResult = normalizeOperationalWeatherCacheSource(result, freshnessWindowMs);
  const decision = resolveWeatherLastGoodUpdate(
    normalizedResult,
    sharedWeatherLastGoodResult,
    hasUsableWeatherFetchResult(normalizedResult),
  );
  if (decision.lastGood !== sharedWeatherLastGoodResult) {
    sharedWeatherLastGoodResult = decision.lastGood;
  }
  if (decision.retainedLastGood) {
    logWeatherRetention('empty_weather_update_ignored', {
      scope: 'shared_operational_weather',
      loading,
      target: target.sourceType,
    });
    logWeatherRetention('last_good_weather_retained', {
      scope: 'shared_operational_weather',
      source: decision.lastGood?.source ?? null,
    });
  }

  if (sharedWeatherState.result && !decision.value) {
    logWeatherRetention('current_weather_value_cleared', {
      scope: 'shared_operational_weather',
      reason: decision.clearedExplicitly ? 'explicit_clear' : 'empty_weather_without_last_good',
    });
  }

  const nextSignature = sharedWeatherSignature(decision.value, loading, target);
  if (nextSignature === sharedWeatherStateSignature) {
    return;
  }
  sharedWeatherStateSignature = nextSignature;
  sharedWeatherState = {
    snapshot: buildSharedSnapshot(decision.value, loading, target),
    result: decision.value,
  };
  logWeatherDiagnostics({
    location: target.location,
    snapshot: sharedWeatherState.snapshot,
    result: decision.value,
  });
  notifySharedWeatherListeners();
}

function handleNoActiveWeatherConsumers(): void {
  const cancelledInFlight = cancelSharedOperationalWeatherRequest('unmount');
  const reason = sharedWeatherState.result
    ? 'no_active_consumers_current_retained'
    : 'no_active_consumers_no_current_value';
  const clearSignature = `${reason}::${weatherResultSignature(sharedWeatherState.result)}`;

  if (
    !sharedWeatherNoConsumerClearLogged ||
    sharedWeatherLastNoConsumerClearSignature !== clearSignature
  ) {
    logWeatherRetention('active_consumer_count_changed', {
      scope: 'shared_operational_weather',
      activeConsumers: 0,
      reason,
    });
    sharedWeatherNoConsumerClearLogged = true;
    sharedWeatherLastNoConsumerClearSignature = clearSignature;
  }

  if (sharedWeatherState.result) {
    logWeatherRetention('last_good_weather_retained', {
      scope: 'shared_operational_weather',
      reason,
      source: sharedWeatherState.result.source,
    });
    if (cancelledInFlight || sharedWeatherState.snapshot.status.loading) {
      setSharedWeatherState(
        sharedWeatherState.result,
        false,
        sharedWeatherLastTarget,
      );
    }
    return;
  }

  logWeatherRetention('no_active_weather_consumer_idle', {
    scope: 'shared_operational_weather',
    reason,
  });
  const emptyTarget = resolveTarget(null, null);
  const emptySignature = sharedWeatherSignature(null, false, emptyTarget);
  if (sharedWeatherStateSignature === emptySignature) {
    return;
  }
  setSharedWeatherState(null, false, emptyTarget);
}

function cancelNoConsumerCleanup(): void {
  if (!sharedWeatherNoConsumerCleanupTimer) return;
  const activeConsumerCount = getActiveSharedConsumerCount();
  if (activeConsumerCount <= 0) return;
  clearTimeout(sharedWeatherNoConsumerCleanupTimer);
  sharedWeatherNoConsumerCleanupTimer = null;
  logWeatherRetention('active_consumer_count_changed', {
    scope: 'shared_operational_weather',
    activeConsumers: activeConsumerCount,
    reason: 'consumer_returned_before_grace_elapsed',
  });
}

function scheduleNoConsumerCleanup(): void {
  if (sharedWeatherNoConsumerCleanupTimer) return;

  logWeatherRetention('active_consumer_count_changed', {
    scope: 'shared_operational_weather',
    activeConsumers: 0,
    reason: 'no_active_consumers_grace_started',
    graceMs: SHARED_NO_CONSUMER_GRACE_MS,
  });

  sharedWeatherNoConsumerCleanupTimer = setTimeout(() => {
    sharedWeatherNoConsumerCleanupTimer = null;
    if (getActiveSharedConsumerCount() > 0) return;
    sharedWeatherRefreshHandler = null;
    removeSharedWeatherAppStateSubscription();
    handleNoActiveWeatherConsumers();
  }, SHARED_NO_CONSUMER_GRACE_MS);
}

function buildTargetCoordinate(target: ResolvedWeatherTarget): WeatherCoordinate[] {
  return target.lat == null || target.lng == null
    ? []
    : [{ lat: target.lat, lng: target.lng, label: target.label }];
}

function buildOperationalWeatherRequestKey(
  target: ResolvedWeatherTarget,
  units: 'imperial' | 'metric',
  forceRefresh: boolean,
): string | null {
  const coordinates = buildTargetCoordinate(target);
  if (coordinates.length === 0) return null;
  return buildWeatherRequestKey({
    mode: 'location',
    coordinates,
    units,
    forceRefresh,
    context: 'operational',
  });
}

function fetchOperationalWeatherForTarget(
  target: ResolvedWeatherTarget,
  units: 'imperial' | 'metric',
  forceRefresh: boolean,
): Promise<WeatherFetchResult> {
  if (target.lat == null || target.lng == null) {
    return Promise.reject(new Error('Weather target missing coordinates'));
  }

  const requestKey = buildOperationalWeatherRequestKey(target, units, forceRefresh);
  if (!requestKey) {
    return Promise.reject(new Error('Weather target missing coordinates'));
  }

  const existing = operationalWeatherHookRequests.get(requestKey);
  if (existing) {
    incrementECSPerformanceCounter('weather_refresh', 'repeated_requests');
    return existing;
  }

  if (!forceRefresh) {
    const recent = operationalWeatherRecentResults.get(requestKey);
    if (recent && Date.now() - recent.completedAt < OPERATIONAL_WEATHER_JOIN_GRACE_MS) {
      incrementECSPerformanceCounter('weather_refresh', 'recent_result_hits');
      return Promise.resolve(recent.result);
    }
  }

  let resolveRequest!: (result: WeatherFetchResult) => void;
  let rejectRequest!: (error: unknown) => void;
  const request = new Promise<WeatherFetchResult>((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });

  operationalWeatherHookRequests.set(requestKey, request);
  const performanceRequest = startECSPerformanceRequest(
    'weather_refresh',
    'operational_weather_provider',
    requestKey,
    { sourceType: target.sourceType, forceRefresh },
  );

  fetchSharedWeatherForCoordinates(
    buildTargetCoordinate(target),
    units,
    forceRefresh,
    target.sourceType,
  )
    .then((result) => {
      const fetchResult = result.result;
      performanceRequest.end('completed', { sourceState: fetchResult.source });
      operationalWeatherRecentResults.set(requestKey, {
        result: fetchResult,
        completedAt: Date.now(),
      });
      if (operationalWeatherRecentResults.size > OPERATIONAL_WEATHER_RECENT_RESULT_LIMIT) {
        const oldestKey = operationalWeatherRecentResults.keys().next().value;
        if (oldestKey) {
          operationalWeatherRecentResults.delete(oldestKey);
        }
      }
      return fetchResult;
    })
    .catch((error) => {
      performanceRequest.end('failed');
      throw error;
    })
    .then(resolveRequest, rejectRequest)
    .finally(() => {
      if (operationalWeatherHookRequests.get(requestKey) === request) {
        operationalWeatherHookRequests.delete(requestKey);
      }
    });

  return request;
}

function abandonOperationalWeatherRequest(
  requestKey: string,
  request: Promise<WeatherFetchResult>,
): void {
  if (operationalWeatherHookRequests.get(requestKey) === request) {
    operationalWeatherHookRequests.delete(requestKey);
  }
}

function getActiveSharedConsumer(): UseOperationalWeatherOptions | null {
  let selected: UseOperationalWeatherOptions | null = null;
  let selectedScore = -1;

  for (const consumer of sharedWeatherConsumers.values()) {
    if (consumer.enabled === false) continue;
    const target = resolveTarget(
      consumer.gps,
      consumer.routeCoordinate,
      consumer.selectedCoordinate,
      consumer.lastKnownCoordinate,
    );
    const score = target.lat == null || target.lng == null
      ? 0
      : target.sourceType === 'current_location'
        ? 4
        : target.sourceType === 'route_origin'
          ? 3
          : target.sourceType === 'selected_coordinate'
            ? 2
            : 1;
    if (score > selectedScore) {
      selected = consumer;
      selectedScore = score;
    }
  }

  return selected;
}

async function syncSharedOperationalWeather(force = false): Promise<void> {
  const consumer = getActiveSharedConsumer();
  if (!consumer) {
    handleNoActiveWeatherConsumers();
    return;
  }

  const target = resolveTarget(
    consumer.gps,
    consumer.routeCoordinate,
    consumer.selectedCoordinate,
    consumer.lastKnownCoordinate,
  );
  const freshnessWindowMs = consumer.freshnessWindowMs ?? DEFAULT_FRESHNESS_WINDOW_MS;
  if (target.lat == null || target.lng == null) {
    const cancellationReason: ECSAsyncCancellationReason =
      consumer.gps?.permissionDenied === true ? 'permission_denied' : 'invalid_input';
    const cancelledInFlight = cancelSharedOperationalWeatherRequest(cancellationReason);
    setSharedWeatherState(sharedWeatherState.result, false, target, freshnessWindowMs);
    if (cancelledInFlight) {
      logWeatherRetention('weather_request_cancelled', {
        reason: cancellationReason,
      });
    }
    return;
  }

  const movementThresholdM = consumer.movementThresholdM ?? DEFAULT_MOVEMENT_THRESHOLD_M;
  const now = Date.now();
  const locationChanged =
    !_sharedWeatherLastFetchLocation ||
    _sharedWeatherLastFetchLocation.sourceType !== target.sourceType ||
    haversineMeters(
      _sharedWeatherLastFetchLocation.lat,
      _sharedWeatherLastFetchLocation.lng,
      target.lat,
      target.lng,
    ) >= movementThresholdM;
  const isStale = now - sharedWeatherLastFetchAt >= freshnessWindowMs;
  if (sharedWeatherState.result && isOperationalWeatherResultExpired(sharedWeatherState.result, freshnessWindowMs, now)) {
    logWeatherDataExpired({
      target,
      units: consumer.units ?? 'imperial',
      result: sharedWeatherState.result,
      freshnessWindowMs,
      now,
    });
  }

  const hasFreshLiveResult = Boolean(
    sharedWeatherState.result &&
    sharedWeatherState.result.source === 'live' &&
    !sharedWeatherState.result.error &&
    hasUsableWeatherFetchResult(sharedWeatherState.result) &&
    !locationChanged &&
    !isStale,
  );
  if (!force && hasFreshLiveResult) {
    setSharedWeatherState(sharedWeatherState.result, false, target, freshnessWindowMs);
    return;
  }

  const units = consumer.units ?? 'imperial';
  const cached = normalizeOperationalWeatherCacheSource(
    getCachedSharedWeatherResult(buildTargetCoordinate(target), units, {
      allowStale: true,
    }),
    freshnessWindowMs,
    now,
  );
  // Cache hydration is presentation data, not proof that this process completed a
  // provider refresh. Bypass broker/store cache once so an eligible Dashboard
  // mount can transition from cached to live.
  const shouldForceRefresh = force || !hasFreshLiveResult || isStale || cached?.source === 'cache_stale';
  const requestKey = buildOperationalWeatherRequestKey(target, units, shouldForceRefresh);
  if (!requestKey) {
    cancelSharedOperationalWeatherRequest('invalid_input');
    setSharedWeatherState(sharedWeatherState.result, false, target, freshnessWindowMs);
    return;
  }
  const requestLifecycleKey = `${requestKey}::${weatherTargetSignature(target)}`;
  if (
    sharedWeatherAsyncState.status === 'loading' &&
    sharedWeatherActiveRequestKey === requestLifecycleKey
  ) {
    return;
  }

  const providerAttemptKey = buildOperationalWeatherRequestKey(target, units, false);
  if (
    !force &&
    !sharedWeatherLastProviderAttemptSucceeded &&
    providerAttemptKey != null &&
    providerAttemptKey === sharedWeatherLastProviderAttemptKey &&
    now - sharedWeatherLastProviderAttemptAt < OPERATIONAL_WEATHER_FAILED_RETRY_COOLDOWN_MS
  ) {
    setSharedWeatherState(cached ?? sharedWeatherState.result, false, target, freshnessWindowMs);
    return;
  }

  cancelSharedOperationalWeatherRequest('superseded');
  sharedWeatherAsyncState = beginECSAsyncSurfaceRequest(sharedWeatherAsyncState, {
    fingerprintInput: {
      sourceType: target.sourceType,
      coordinateBucket: `${roundedCoordSignature(target.lat)},${roundedCoordSignature(target.lng)}`,
      units,
      forceRefresh: shouldForceRefresh,
    },
    provider: 'openweather',
    providerStatus: 'active',
    preserveData: true,
    preserveLastGood: true,
  });
  const identity = createSharedWeatherRequestIdentity();
  const controller = createOperationalWeatherAbortController();
  sharedWeatherRequestController = controller;
  sharedWeatherRequestCancellationReason = null;
  sharedWeatherActiveRequestKey = requestLifecycleKey;
  sharedWeatherLastProviderAttemptAt = now;
  sharedWeatherLastProviderAttemptKey = providerAttemptKey;
  sharedWeatherLastProviderAttemptSucceeded = false;

  if (cached) {
    setSharedWeatherState(cached, true, target, freshnessWindowMs);
  } else if (locationChanged && sharedWeatherState.result && hasUsableWeatherFetchResult(sharedWeatherState.result)) {
    setSharedWeatherState({ ...sharedWeatherState.result, source: 'cache_stale' }, true, target, freshnessWindowMs);
  } else {
    setSharedWeatherState(sharedWeatherState.result, true, target, freshnessWindowMs);
  }

  const providerRequest = fetchOperationalWeatherForTarget(
    target,
    units,
    shouldForceRefresh,
  );
  try {
    const nextRaw = await waitForOperationalWeatherRequest(providerRequest, {
      signal: controller?.signal,
      timeoutMs: OPERATIONAL_WEATHER_REQUEST_TIMEOUT_MS,
    });
    if (!isCurrentECSAsyncSurfaceRequest(sharedWeatherAsyncState, identity)) return;

    const normalized = normalizeOperationalWeatherCacheSource(nextRaw, freshnessWindowMs) ?? nextRaw;
    const safeErrorCode = normalized.error
      ? getOperationalWeatherSafeErrorCode(normalized.error)
      : null;
    const safeNormalized = safeErrorCode
      ? { ...normalized, error: getOperationalWeatherSafeErrorMessage(safeErrorCode) }
      : normalized;
    const next = hasUsableWeatherFetchResult(safeNormalized)
      ? safeNormalized
      : createOperationalWeatherFailureResult(units, safeErrorCode ?? 'WEATHER_PROVIDER_FAILURE', safeNormalized);

    const completedLiveRefresh = Boolean(
      next.source === 'live' &&
      !next.error &&
      hasUsableWeatherFetchResult(next),
    );
    sharedWeatherLastProviderAttemptSucceeded = completedLiveRefresh;
    if (completedLiveRefresh) {
      sharedWeatherLastFetchAt = Date.now();
      _sharedWeatherLastFetchLocation = {
        lat: target.lat,
        lng: target.lng,
        sourceType: target.sourceType,
      };
    }
    settleSharedWeatherRequest(identity, next, { safeErrorCode });
    setSharedWeatherState(next, false, target, freshnessWindowMs);
  } catch (error) {
    if (!isCurrentECSAsyncSurfaceRequest(sharedWeatherAsyncState, identity)) return;

    sharedWeatherLastProviderAttemptSucceeded = false;
    const safeErrorCode = getOperationalWeatherSafeErrorCode(error);
    const cancellationReason = error instanceof OperationalWeatherWaitError && error.failure === 'timeout'
      ? 'timeout'
      : sharedWeatherRequestCancellationReason;
    if (cancellationReason === 'timeout') {
      if (controller && !controller.signal.aborted) controller.abort();
      abandonOperationalWeatherRequest(requestKey, providerRequest);
    }
    const failure = createOperationalWeatherFailureResult(units, safeErrorCode);
    settleSharedWeatherRequest(identity, failure, {
      safeErrorCode,
      cancellationReason,
    });
    setSharedWeatherState(failure, false, target, freshnessWindowMs);
    logWeatherRetention('weather_fetch_failed', {
      safeErrorCode,
      retainedLastGood: hasUsableWeatherFetchResult(failure),
    });
  } finally {
    if (sharedWeatherRequestController === controller) {
      sharedWeatherRequestController = null;
      sharedWeatherRequestCancellationReason = null;
    }
    if (sharedWeatherActiveRequestKey === requestLifecycleKey) {
      sharedWeatherActiveRequestKey = null;
    }
    if (isCurrentECSAsyncSurfaceRequest(sharedWeatherAsyncState, identity)) {
      const failure = createOperationalWeatherFailureResult(units, 'WEATHER_PROVIDER_FAILURE');
      settleSharedWeatherRequest(identity, failure, {
        safeErrorCode: 'WEATHER_PROVIDER_FAILURE',
      });
      setSharedWeatherState(failure, false, target, freshnessWindowMs);
    }
  }
}

export function getSharedOperationalWeatherState(): {
  snapshot: ECSWeatherSnapshot;
  result: WeatherFetchResult | null;
  asyncState: ECSAsyncSurfaceState<WeatherFetchResult>;
} {
  return {
    ...sharedWeatherState,
    asyncState: sharedWeatherAsyncState,
  };
}

/**
 * Safe shared-weather lifecycle diagnostics. Coordinate values, consumer IDs,
 * provider payloads, and credentials are deliberately excluded.
 */
export function getSharedOperationalWeatherDiagnostics() {
  return {
    registeredConsumerCount: sharedWeatherConsumers.size,
    activeConsumerCount: getActiveSharedConsumerCount(),
    presentationSubscriberCount: sharedWeatherListeners.size,
    appStateSubscriptionActive: sharedWeatherAppStateSubscription != null,
    requestStatus: sharedWeatherAsyncState.status,
    requestFingerprint: sharedWeatherAsyncState.requestFingerprint,
    provider: sharedWeatherAsyncState.provider,
    providerStatus: sharedWeatherAsyncState.providerStatus,
    sourceState: sharedWeatherAsyncState.source,
    resultCount: sharedWeatherAsyncState.resultCount,
    cancellationReason: sharedWeatherAsyncState.cancellationReason,
    safeErrorCode: sharedWeatherAsyncState.safeErrorCode,
    lastCompletedAt: sharedWeatherAsyncState.completedAt,
  };
}

export function subscribeSharedOperationalWeather(listener: () => void): () => void {
  sharedWeatherListeners.add(listener);
  return () => {
    sharedWeatherListeners.delete(listener);
  };
}

function hydrateActiveSharedWeatherCache(): void {
  void waitForWeatherCacheHydration()
    .then(() => {
      const consumer = getActiveSharedConsumer();
      if (!consumer) return;
      const target = resolveTarget(
        consumer.gps,
        consumer.routeCoordinate,
        consumer.selectedCoordinate,
        consumer.lastKnownCoordinate,
      );
      const freshnessWindowMs = consumer.freshnessWindowMs ?? DEFAULT_FRESHNESS_WINDOW_MS;
      const movementThresholdM = consumer.movementThresholdM ?? DEFAULT_MOVEMENT_THRESHOLD_M;
      const currentLiveMatchesTarget = Boolean(
        sharedWeatherState.result?.source === 'live' &&
        !sharedWeatherState.result.error &&
        _sharedWeatherLastFetchLocation &&
        _sharedWeatherLastFetchLocation.sourceType === target.sourceType &&
        target.lat != null &&
        target.lng != null &&
        haversineMeters(
          _sharedWeatherLastFetchLocation.lat,
          _sharedWeatherLastFetchLocation.lng,
          target.lat,
          target.lng,
        ) < movementThresholdM &&
        Date.now() - sharedWeatherLastFetchAt < freshnessWindowMs,
      );
      const cached = normalizeOperationalWeatherCacheSource(
        getCachedSharedWeatherResult(buildTargetCoordinate(target), consumer.units ?? 'imperial', {
          allowStale: true,
        }),
        freshnessWindowMs,
      );
      if (cached && !currentLiveMatchesTarget) {
        setSharedWeatherState(cached, true, target, freshnessWindowMs);
      }
      void syncSharedOperationalWeather(false);
    })
    .catch(() => {
      // Persistence failure must not prevent a live provider attempt.
      void syncSharedOperationalWeather(false);
    });
}

export function setSharedOperationalWeatherConsumer(
  id: string,
  options: UseOperationalWeatherOptions,
): void {
  const previous = sharedWeatherConsumers.get(id);
  const previousSignature = previous ? weatherConsumerSignature(previous) : null;
  const nextSignature = weatherConsumerSignature(options);
  const previousActiveConsumerCount = getActiveSharedConsumerCount();

  if (previousSignature === nextSignature) {
    if (previousActiveConsumerCount > 0) {
      cancelNoConsumerCleanup();
      ensureSharedWeatherAppStateSubscription();
      void syncSharedOperationalWeather(false);
    }
    return;
  }

  sharedWeatherConsumers.set(id, options);
  const nextActiveConsumerCount = getActiveSharedConsumerCount();

  if (previousActiveConsumerCount !== nextActiveConsumerCount) {
    logWeatherRetention('active_consumer_count_changed', {
      scope: 'shared_operational_weather',
      activeConsumers: nextActiveConsumerCount,
      reason: previous ? 'consumer_updated' : 'consumer_registered',
    });
  }
  if (nextActiveConsumerCount > 0) {
    cancelNoConsumerCleanup();
    ensureSharedWeatherAppStateSubscription();
  }
  if (nextActiveConsumerCount === 0) {
    scheduleNoConsumerCleanup();
  }
  sharedWeatherRefreshHandler = () => {
    void syncSharedOperationalWeather(true);
  };

  if (nextActiveConsumerCount === 0) return;
  hydrateActiveSharedWeatherCache();
  void syncSharedOperationalWeather(false);
}

export function removeSharedOperationalWeatherConsumer(id: string): void {
  const removed = sharedWeatherConsumers.delete(id);
  if (!removed) return;
  const activeConsumerCount = getActiveSharedConsumerCount();
  logWeatherRetention('active_consumer_count_changed', {
    scope: 'shared_operational_weather',
    activeConsumers: activeConsumerCount,
    reason: 'consumer_removed',
  });

  if (activeConsumerCount === 0) {
    scheduleNoConsumerCleanup();
    return;
  }

  cancelNoConsumerCleanup();
  void syncSharedOperationalWeather(false);
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasUsableGps(
  gps?: GPSInput | null,
): gps is GPSInput & { lat: number; lng: number; hasFix: true } {
  return !!gps &&
    gps.permissionDenied !== true &&
    gps.hasFix === true &&
    typeof gps.lat === 'number' &&
    Number.isFinite(gps.lat) &&
    typeof gps.lng === 'number' &&
    Number.isFinite(gps.lng);
}

export function useOperationalWeather({
  enabled = true,
  gps,
  routeCoordinate,
  selectedCoordinate,
  lastKnownCoordinate,
  units = 'imperial',
  freshnessWindowMs = DEFAULT_FRESHNESS_WINDOW_MS,
  movementThresholdM = DEFAULT_MOVEMENT_THRESHOLD_M,
}: UseOperationalWeatherOptions): UseOperationalWeatherResult {
  const consumerIdRef = useRef<string | null>(null);
  if (!consumerIdRef.current) {
    sharedWeatherConsumerIdSeed += 1;
    consumerIdRef.current = `use_operational_weather_${sharedWeatherConsumerIdSeed}`;
  }
  const registeredSharedConsumerRef = useRef(false);
  const target = useMemo(
    () => resolveTarget(gps, routeCoordinate, selectedCoordinate, lastKnownCoordinate),
    [
      gps?.hasFix,
      gps?.lat,
      gps?.lng,
      gps?.permissionDenied,
      gps?.accuracyM,
      routeCoordinate?.label,
      routeCoordinate?.lat,
      routeCoordinate?.lng,
      selectedCoordinate?.label,
      selectedCoordinate?.lat,
      selectedCoordinate?.lng,
      lastKnownCoordinate?.label,
      lastKnownCoordinate?.lat,
      lastKnownCoordinate?.lng,
    ],
  );
  const initialCachedResultRef = useRef<WeatherFetchResult | null>(
    normalizeOperationalWeatherCacheSource(
      getCachedSharedWeatherResult(buildTargetCoordinate(target), units, { allowStale: true }),
      freshnessWindowMs,
    ),
  );
  const [result, setResult] = useState<WeatherFetchResult | null>(() => initialCachedResultRef.current);
  const [loading, setLoading] = useState(false);

  const mountedRef = useRef(true);
  const lastGoodResultRef = useRef<WeatherFetchResult | null>(
    hasUsableWeatherFetchResult(initialCachedResultRef.current)
      ? initialCachedResultRef.current
      : null,
  );
  const requestIdRef = useRef(0);
  const requestAbortControllerRef = useRef<AbortController | null>(null);
  const lastFetchAtRef = useRef(0);
  const lastFetchLocationRef = useRef<{ lat: number; lng: number; sourceType: ECSWeatherSourceType } | null>(null);
  const inFlightRequestKeyRef = useRef<string | null>(null);
  const lastRequestedRequestKeyRef = useRef<string | null>(null);
  const lastRequestedAtRef = useRef(0);
  const resultRef = useRef<WeatherFetchResult | null>(initialCachedResultRef.current);
  const resultSignatureRef = useRef(weatherResultSignature(initialCachedResultRef.current));

  const setResultIfChanged = useCallback((next: WeatherFetchResult | null): boolean => {
    const normalizedNext = normalizeOperationalWeatherCacheSource(next, freshnessWindowMs);
    const nextSignature = weatherResultSignature(normalizedNext);
    if (nextSignature === resultSignatureRef.current) {
      return false;
    }
    resultSignatureRef.current = nextSignature;
    resultRef.current = normalizedNext;
    setResult(normalizedNext);
    return true;
  }, [freshnessWindowMs]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      const controller = requestAbortControllerRef.current;
      requestAbortControllerRef.current = null;
      if (controller && !controller.signal.aborted) controller.abort();
    };
  }, []);

  useEffect(() => {
    requestIdRef.current += 1;
    const controller = requestAbortControllerRef.current;
    requestAbortControllerRef.current = null;
    if (controller && !controller.signal.aborted) controller.abort();
    inFlightRequestKeyRef.current = null;
  }, [enabled, target.lat, target.lng, target.sourceType, units]);

  useEffect(() => subscribeSharedOperationalWeather(() => {
    const shared = getSharedOperationalWeatherState();
    if (hasUsableWeatherFetchResult(shared.result)) {
      lastGoodResultRef.current = shared.result;
    }
    setResultIfChanged(shared.result);
    setLoading((current) => (
      current === shared.snapshot.status.loading ? current : shared.snapshot.status.loading
    ));
  }), [setResultIfChanged]);

  const sharedConsumerOptions = useMemo<UseOperationalWeatherOptions>(() => ({
    enabled,
    gps: {
      lat: gps?.lat ?? null,
      lng: gps?.lng ?? null,
      hasFix: gps?.hasFix === true,
      permissionDenied: gps?.permissionDenied === true,
      accuracyM: gps?.accuracyM ?? null,
    },
    routeCoordinate: routeCoordinate
      ? {
          lat: routeCoordinate.lat,
          lng: routeCoordinate.lng,
          label: routeCoordinate.label,
          accuracyM: routeCoordinate.accuracyM,
          timestamp: routeCoordinate.timestamp,
        }
      : null,
    selectedCoordinate: selectedCoordinate
      ? {
          lat: selectedCoordinate.lat,
          lng: selectedCoordinate.lng,
          label: selectedCoordinate.label,
          accuracyM: selectedCoordinate.accuracyM,
          timestamp: selectedCoordinate.timestamp,
        }
      : null,
    lastKnownCoordinate: lastKnownCoordinate
      ? {
          lat: lastKnownCoordinate.lat,
          lng: lastKnownCoordinate.lng,
          label: lastKnownCoordinate.label,
          accuracyM: lastKnownCoordinate.accuracyM,
          timestamp: lastKnownCoordinate.timestamp,
        }
      : null,
    units,
    freshnessWindowMs,
    movementThresholdM,
  }), [
    enabled,
    freshnessWindowMs,
    gps?.hasFix,
    gps?.lat,
    gps?.lng,
    gps?.permissionDenied,
    gps?.accuracyM,
    movementThresholdM,
    routeCoordinate?.label,
    routeCoordinate?.accuracyM,
    routeCoordinate?.timestamp,
    routeCoordinate?.lat,
    routeCoordinate?.lng,
    selectedCoordinate?.label,
    selectedCoordinate?.accuracyM,
    selectedCoordinate?.timestamp,
    selectedCoordinate?.lat,
    selectedCoordinate?.lng,
    lastKnownCoordinate?.label,
    lastKnownCoordinate?.accuracyM,
    lastKnownCoordinate?.timestamp,
    lastKnownCoordinate?.lat,
    lastKnownCoordinate?.lng,
    units,
  ]);
  const sharedConsumerOptionsRef = useRef(sharedConsumerOptions);
  sharedConsumerOptionsRef.current = sharedConsumerOptions;

  useEffect(() => {
    const consumerId = consumerIdRef.current;
    if (!consumerId) return undefined;
    registeredSharedConsumerRef.current = true;
    setSharedOperationalWeatherConsumer(consumerId, sharedConsumerOptionsRef.current);
    return () => {
      registeredSharedConsumerRef.current = false;
      removeSharedOperationalWeatherConsumer(consumerId);
    };
  }, []);

  useEffect(() => {
    const consumerId = consumerIdRef.current;
    if (!consumerId || !registeredSharedConsumerRef.current) return;
    setSharedOperationalWeatherConsumer(consumerId, sharedConsumerOptions);
  }, [sharedConsumerOptions]);

  useEffect(() => {
    if (!enabled) return;
    if (target.lat == null || target.lng == null) return;
    const cached = getAnyCachedSharedWeather(buildTargetCoordinate(target), units);
    if (!cached) return;

    const cachedResult = normalizeOperationalWeatherCacheSource({
      data: cached.data,
      source: cached.source,
      cachedAt: cached.cachedAt,
      error: null,
    }, freshnessWindowMs);
    if (!cachedResult) return;
    if (hasUsableWeatherFetchResult(cachedResult)) {
      lastGoodResultRef.current = cachedResult;
    }
    if (!resultRef.current) {
      setResultIfChanged(cachedResult);
    }
  }, [enabled, freshnessWindowMs, setResultIfChanged, target.label, target.lat, target.lng, target.sourceType, units]);

  const runFetch = useCallback(async (force = false) => {
    if (!enabled || target.lat == null || target.lng == null) return;

    const now = Date.now();
    const lastFetch = lastFetchLocationRef.current;
    const locationChanged =
      !lastFetch ||
      lastFetch.sourceType !== target.sourceType ||
      haversineMeters(lastFetch.lat, lastFetch.lng, target.lat, target.lng) >= movementThresholdM;
    const isStale = now - lastFetchAtRef.current >= freshnessWindowMs;
    const currentResult = resultRef.current;

    if (!force && !locationChanged && !isStale && currentResult) {
      return;
    }

    const cached = normalizeOperationalWeatherCacheSource(
      getCachedSharedWeatherResult(buildTargetCoordinate(target), units, { allowStale: true }),
      freshnessWindowMs,
      now,
    );
    const shouldForceRefresh = force || isStale || cached?.source === 'cache_stale';
    const requestKey = buildOperationalWeatherRequestKey(target, units, shouldForceRefresh);
    if (!requestKey) return;
    if (!force && inFlightRequestKeyRef.current === requestKey) {
      return;
    }
    if (
      !force &&
      lastRequestedRequestKeyRef.current === requestKey &&
      now - lastRequestedAtRef.current < OPERATIONAL_WEATHER_JOIN_GRACE_MS &&
      currentResult
    ) {
      return;
    }

    if (!force && cached) {
      if (hasUsableWeatherFetchResult(cached)) {
        lastGoodResultRef.current = cached;
      }
      setResultIfChanged(cached);
      setSharedWeatherState(cached, cached.source !== 'cache_fresh', target, freshnessWindowMs);
    }

    const requestId = ++requestIdRef.current;
    const previousController = requestAbortControllerRef.current;
    if (previousController && !previousController.signal.aborted) previousController.abort();
    const controller = createOperationalWeatherAbortController();
    requestAbortControllerRef.current = controller;
    inFlightRequestKeyRef.current = requestKey;
    lastRequestedRequestKeyRef.current = requestKey;
    lastRequestedAtRef.current = now;
    setLoading(true);

    const providerRequest = fetchOperationalWeatherForTarget(target, units, shouldForceRefresh);
    try {
      const nextRaw = await waitForOperationalWeatherRequest(providerRequest, {
        signal: controller?.signal,
        timeoutMs: OPERATIONAL_WEATHER_REQUEST_TIMEOUT_MS,
      });
      const normalized = normalizeOperationalWeatherCacheSource(nextRaw, freshnessWindowMs) ?? nextRaw;
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      const safeErrorCode = normalized.error
        ? getOperationalWeatherSafeErrorCode(normalized.error)
        : null;
      const safeNormalized = safeErrorCode
        ? { ...normalized, error: getOperationalWeatherSafeErrorMessage(safeErrorCode) }
        : normalized;
      const next = hasUsableWeatherFetchResult(safeNormalized)
        ? safeNormalized
        : createOperationalWeatherFailureResult(
            units,
            safeErrorCode ?? 'WEATHER_PROVIDER_FAILURE',
            safeNormalized,
            lastGoodResultRef.current,
          );

      const decision = resolveWeatherLastGoodUpdate(
        next,
        lastGoodResultRef.current,
        hasUsableWeatherFetchResult(next),
      );
      lastGoodResultRef.current = decision.lastGood;
      if (decision.retainedLastGood) {
        logWeatherRetention('empty_weather_update_ignored', {
          scope: 'use_operational_weather',
          source: next.source,
          force,
        });
        logWeatherRetention('last_good_weather_retained', {
          scope: 'use_operational_weather',
          source: decision.lastGood?.source ?? null,
        });
      }
      setResultIfChanged(decision.value);
      setSharedWeatherState(decision.value, false, target, freshnessWindowMs);
      if (next.source === 'live' && !next.error && hasUsableWeatherFetchResult(next)) {
        lastFetchAtRef.current = Date.now();
        lastFetchLocationRef.current = {
          lat: target.lat,
          lng: target.lng,
          sourceType: target.sourceType,
        };
      }
    } catch (error) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      const safeErrorCode = getOperationalWeatherSafeErrorCode(error);
      if (error instanceof OperationalWeatherWaitError && error.failure === 'timeout') {
        if (controller && !controller.signal.aborted) controller.abort();
        abandonOperationalWeatherRequest(requestKey, providerRequest);
      }
      const failure = createOperationalWeatherFailureResult(
        units,
        safeErrorCode,
        null,
        lastGoodResultRef.current,
      );
      if (hasUsableWeatherFetchResult(failure)) {
        lastGoodResultRef.current = failure;
      }
      setResultIfChanged(failure);
      setSharedWeatherState(failure, false, target, freshnessWindowMs);
      logWeatherRetention('weather_fetch_failed', {
        scope: 'use_operational_weather',
        safeErrorCode,
        retainedLastGood: hasUsableWeatherFetchResult(failure),
      });
    } finally {
      if (requestAbortControllerRef.current === controller) {
        requestAbortControllerRef.current = null;
      }
      if (inFlightRequestKeyRef.current === requestKey) {
        inFlightRequestKeyRef.current = null;
      }
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [
    enabled,
    freshnessWindowMs,
    movementThresholdM,
    setResultIfChanged,
    target.label,
    target.lat,
    target.lng,
    target.sourceType,
    units,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || target.lat == null || target.lng == null) return undefined;
      const consumerId = consumerIdRef.current;
      if (consumerId && registeredSharedConsumerRef.current) {
        setSharedOperationalWeatherConsumer(consumerId, sharedConsumerOptions);
      }
      return undefined;
    }, [enabled, sharedConsumerOptions, target.lat, target.lng])
  );

  const refresh = useCallback(() => {
    if (sharedWeatherRefreshHandler) {
      sharedWeatherRefreshHandler();
      return;
    }
    void runFetch(true);
  }, [runFetch]);

  const snapshot = useMemo(() => {
    const effectiveResult =
      hasUsableWeatherFetchResult(result)
        ? result
        : lastGoodResultRef.current;
    if (result && !hasUsableWeatherFetchResult(result) && lastGoodResultRef.current) {
      logWeatherRetention('last_good_weather_retained', {
        scope: 'use_operational_weather_snapshot',
        source: lastGoodResultRef.current.source,
      });
    }
    return buildECSWeatherSnapshot({
      result: effectiveResult,
      loading,
      waitingForGps: target.waitingForGps,
      permissionBlocked:
        target.location?.source === 'unavailable' &&
        String(target.location.unavailableReason ?? '').toLowerCase().includes('permission'),
      networkBlocked: Boolean(
        result?.error &&
        /offline|network/i.test(result.error) &&
        !hasUsableWeatherFetchResult(effectiveResult),
      ),
      sourceType: target.sourceType,
      locationFallback: target.label,
      locationResolution: target.location,
    });
  }, [loading, result, target.label, target.location, target.sourceType, target.waitingForGps]);

  return {
    snapshot,
    refresh,
    result,
  };
}
