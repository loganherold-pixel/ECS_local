import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { buildECSWeatherSnapshot, type ECSWeatherSnapshot, type ECSWeatherSourceType } from './ecsWeather';
import { resolveWeatherLastGoodUpdate } from './weatherLastGoodState';
import {
  hasUsableWeatherFetchResult,
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

const sharedWeatherListeners = new Set<() => void>();
const sharedWeatherConsumers = new Map<string, UseOperationalWeatherOptions>();
let sharedWeatherLastFetchAt = 0;
let sharedWeatherRequestId = 0;
let sharedWeatherRefreshHandler: (() => void) | null = null;
let sharedWeatherStateSignature = '';
let sharedWeatherConsumerIdSeed = 0;
let sharedWeatherNoConsumerClearLogged = false;
let sharedWeatherLastNoConsumerClearSignature: string | null = null;
let sharedWeatherNoConsumerCleanupTimer: ReturnType<typeof setTimeout> | null = null;
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
    routeCoordinate?.label ?? 'no-route-label',
    roundedCoordSignature(selectedCoordinate?.lat),
    roundedCoordSignature(selectedCoordinate?.lng),
    selectedCoordinate?.label ?? 'no-selected-label',
    roundedCoordSignature(lastKnownCoordinate?.lat),
    roundedCoordSignature(lastKnownCoordinate?.lng),
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
    debugFlag: 'ECS_DEBUG_WEATHER',
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

function setSharedWeatherState(
  result: WeatherFetchResult | null,
  loading: boolean,
  target: ResolvedWeatherTarget,
  freshnessWindowMs = DEFAULT_FRESHNESS_WINDOW_MS,
): void {
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

async function fetchOperationalWeatherForTarget(
  target: ResolvedWeatherTarget,
  units: 'imperial' | 'metric',
  forceRefresh: boolean,
): Promise<WeatherFetchResult> {
  if (target.lat == null || target.lng == null) {
    throw new Error('Weather target missing coordinates');
  }

  const requestKey = buildOperationalWeatherRequestKey(target, units, forceRefresh);
  if (!requestKey) {
    throw new Error('Weather target missing coordinates');
  }

  const existing = operationalWeatherHookRequests.get(requestKey);
  if (existing) {
    return existing;
  }

  if (!forceRefresh) {
    const recent = operationalWeatherRecentResults.get(requestKey);
    if (recent && Date.now() - recent.completedAt < OPERATIONAL_WEATHER_JOIN_GRACE_MS) {
      return recent.result;
    }
  }

  let resolveRequest!: (result: WeatherFetchResult) => void;
  let rejectRequest!: (error: unknown) => void;
  const request = new Promise<WeatherFetchResult>((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });

  operationalWeatherHookRequests.set(requestKey, request);

  fetchSharedWeatherForCoordinates(
    buildTargetCoordinate(target),
    units,
    forceRefresh,
    target.sourceType,
  )
    .then((result) => {
      const fetchResult = result.result;
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
    .then(resolveRequest, rejectRequest)
    .finally(() => {
      if (operationalWeatherHookRequests.get(requestKey) === request) {
        operationalWeatherHookRequests.delete(requestKey);
      }
    });

  return request;
}

function getActiveSharedConsumer(): UseOperationalWeatherOptions | null {
  const activeConsumers = Array.from(sharedWeatherConsumers.values()).filter(
    consumer => consumer.enabled !== false,
  );
  return activeConsumers.length > 0 ? activeConsumers[activeConsumers.length - 1] : null;
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
    setSharedWeatherState(sharedWeatherState.result, false, target, freshnessWindowMs);
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

  if (!force && !locationChanged && !isStale && sharedWeatherState.result) {
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
  if (!force && cached?.source === 'cache_fresh') {
    sharedWeatherLastFetchAt = cached.cachedAt ?? Date.now();
    _sharedWeatherLastFetchLocation = {
      lat: target.lat,
      lng: target.lng,
      sourceType: target.sourceType,
    };
    setSharedWeatherState(cached, false, target, freshnessWindowMs);
    return;
  }

  if (cached) {
    setSharedWeatherState(cached, true, target, freshnessWindowMs);
  } else {
    setSharedWeatherState(sharedWeatherState.result, true, target, freshnessWindowMs);
  }

  const requestId = ++sharedWeatherRequestId;
  const nextRaw = await fetchOperationalWeatherForTarget(
    target,
    units,
    force || isStale || cached?.source === 'cache_stale',
  );
  const next = normalizeOperationalWeatherCacheSource(nextRaw, freshnessWindowMs) ?? nextRaw;

  if (requestId !== sharedWeatherRequestId) return;

  sharedWeatherLastFetchAt = Date.now();
  _sharedWeatherLastFetchLocation = {
    lat: target.lat,
    lng: target.lng,
    sourceType: target.sourceType,
  };
  setSharedWeatherState(next, false, target, freshnessWindowMs);
}

export function getSharedOperationalWeatherState(): {
  snapshot: ECSWeatherSnapshot;
  result: WeatherFetchResult | null;
} {
  return sharedWeatherState;
}

export function subscribeSharedOperationalWeather(listener: () => void): () => void {
  sharedWeatherListeners.add(listener);
  return () => {
    sharedWeatherListeners.delete(listener);
  };
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
  }
  if (nextActiveConsumerCount === 0) {
    scheduleNoConsumerCleanup();
  }
  sharedWeatherRefreshHandler = () => {
    void syncSharedOperationalWeather(true);
  };

  if (nextActiveConsumerCount === 0) return;
  const target = resolveTarget(
    options.gps,
    options.routeCoordinate,
    options.selectedCoordinate,
    options.lastKnownCoordinate,
  );
  const freshnessWindowMs = options.freshnessWindowMs ?? DEFAULT_FRESHNESS_WINDOW_MS;
  const cached = normalizeOperationalWeatherCacheSource(
    getCachedSharedWeatherResult(buildTargetCoordinate(target), options.units ?? 'imperial', {
      allowStale: true,
    }),
    freshnessWindowMs,
  );
  if (cached) {
    setSharedWeatherState(cached, cached.source !== 'cache_fresh', target, freshnessWindowMs);
    if (cached.source === 'cache_fresh') {
      sharedWeatherLastFetchAt = cached.cachedAt ?? Date.now();
      if (target.lat != null && target.lng != null) {
        _sharedWeatherLastFetchLocation = {
          lat: target.lat,
          lng: target.lng,
          sourceType: target.sourceType,
        };
      }
    }
  }
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
    };
  }, []);

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
        }
      : null,
    selectedCoordinate: selectedCoordinate
      ? {
          lat: selectedCoordinate.lat,
          lng: selectedCoordinate.lng,
          label: selectedCoordinate.label,
        }
      : null,
    lastKnownCoordinate: lastKnownCoordinate
      ? {
          lat: lastKnownCoordinate.lat,
          lng: lastKnownCoordinate.lng,
          label: lastKnownCoordinate.label,
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
    routeCoordinate?.lat,
    routeCoordinate?.lng,
    selectedCoordinate?.label,
    selectedCoordinate?.lat,
    selectedCoordinate?.lng,
    lastKnownCoordinate?.label,
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
    setSharedWeatherState(cachedResult, cachedResult.source !== 'cache_fresh', target, freshnessWindowMs);
    if (cachedResult.source === 'cache_fresh') {
      lastFetchAtRef.current = cached.cachedAt;
      lastFetchLocationRef.current = {
        lat: target.lat,
        lng: target.lng,
        sourceType: target.sourceType,
      };
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
      if (cached.source === 'cache_fresh') {
        lastFetchAtRef.current = cached.cachedAt ?? Date.now();
        lastFetchLocationRef.current = {
          lat: target.lat,
          lng: target.lng,
          sourceType: target.sourceType,
        };
        return;
      }
    }

    const requestId = ++requestIdRef.current;
    inFlightRequestKeyRef.current = requestKey;
    lastRequestedRequestKeyRef.current = requestKey;
    lastRequestedAtRef.current = now;
    setLoading(true);

    try {
      const nextRaw = await fetchOperationalWeatherForTarget(target, units, shouldForceRefresh);
      const next = normalizeOperationalWeatherCacheSource(nextRaw, freshnessWindowMs) ?? nextRaw;
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

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
      lastFetchAtRef.current = Date.now();
      lastFetchLocationRef.current = {
        lat: target.lat,
        lng: target.lng,
        sourceType: target.sourceType,
      };
    } finally {
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
    void runFetch(true);
    sharedWeatherRefreshHandler?.();
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
