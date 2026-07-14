import type {
  AdapterRunResult,
  ProviderAdapterRunContext,
  SourceObservation,
  SourceObservationSourceType,
} from './ecs5ObservationPipeline';

export type OperationalWeatherDataKind =
  | 'observation'
  | 'forecast'
  | 'alert'
  | 'air_quality'
  | 'fire_detection'
  | 'derived_route_hazard';

export type OperationalWeatherCacheState =
  | 'live'
  | 'cache_fresh'
  | 'cache_stale'
  | 'last_good'
  | 'unavailable';

export type OperationalWeatherProviderStatus =
  | 'success'
  | 'degraded'
  | 'timeout'
  | 'cancelled'
  | 'unavailable'
  | 'failed';

export type OperationalWeatherAuthority =
  | 'official'
  | 'commercial'
  | 'satellite'
  | 'sensor'
  | 'manual'
  | 'unknown';

export interface OperationalWeatherDatum {
  id: string;
  observationId: string;
  kind: OperationalWeatherDataKind;
  providerId: string;
  sourceName: string;
  sourceType: SourceObservationSourceType;
  authority: OperationalWeatherAuthority;
  observedAt: string | null;
  forecastValidFrom: string | null;
  forecastValidUntil: string | null;
  retrievedAt: string;
  expiresAt: string | null;
  cacheState: OperationalWeatherCacheState;
  stale: boolean;
  confidence: number;
  subjectId: string | null;
  contentHash: string;
  geometry: SourceObservation['geometry'];
  payload: unknown;
  knownLimitations: string[];
  legalClosureImplied: false;
}

export interface OperationalWeatherProviderOutcome {
  providerId: string;
  status: OperationalWeatherProviderStatus;
  cacheState: OperationalWeatherCacheState;
  dataCount: number;
  durationMs: number;
  warnings: string[];
  errorCode: string | null;
}

export interface OperationalWeatherConflict {
  kind: 'observation' | 'forecast' | 'air_quality';
  providerIds: string[];
  reason: string;
  datumIds: string[];
}

export interface OperationalWeatherBrokerRequest {
  coordinate: { lat: number; lon: number };
  providerIds: string[];
  kinds?: OperationalWeatherDataKind[];
  units?: 'imperial' | 'metric' | 'standard';
  timeWindow?: string | null;
  forceRefresh?: boolean;
  fixturePayloadByProvider?: Record<string, unknown>;
  fixtureMode?: boolean;
  requestScope?: string | null;
  signal?: AbortSignal | null;
  now?: Date;
  serverFetch?: ProviderAdapterRunContext['serverFetch'];
}

export interface OperationalWeatherBrokerResult {
  requestKey: string;
  generatedAt: string;
  data: OperationalWeatherDatum[];
  byKind: Record<OperationalWeatherDataKind, OperationalWeatherDatum[]>;
  providers: OperationalWeatherProviderOutcome[];
  conflicts: OperationalWeatherConflict[];
  warnings: string[];
  stale: boolean;
  cacheHit: boolean;
  diagnostics: {
    requestDurationMs: number;
    providerCallsAttempted: number;
    providerCallsAvoided: number;
    alertDuplicatesSuppressed: number;
  };
}

export interface OperationalWeatherAdapterRegistry {
  runAdapter(
    providerId: string,
    input?: unknown,
    context?: ProviderAdapterRunContext,
  ): Promise<AdapterRunResult>;
}

export interface OperationalWeatherBrokerPersistedState {
  schemaVersion: 1;
  savedAt: string;
  entries: Array<{
    key: string;
    result: OperationalWeatherBrokerResult;
    expiresAtMs: number;
    lastAccessedAtMs: number;
  }>;
  lastGood: Array<{
    key: string;
    data: OperationalWeatherDatum[];
    storedAtMs: number;
  }>;
}

export interface OperationalWeatherBrokerDiagnostics {
  devOnly: true;
  requestCount: number;
  providerCallCount: number;
  joinedRequestCount: number;
  cacheHitCount: number;
  staleCacheHitCount: number;
  lastGoodFallbackCount: number;
  timeoutCount: number;
  failureCount: number;
  cancellationCount: number;
  cacheEvictionCount: number;
  subscriberNotificationCount: number;
  subscriberCount: number;
  inFlightCount: number;
  cacheSize: number;
  lastGoodSize: number;
  totalRequestDurationMs: number;
  providerHealth: Array<{
    providerId: string;
    status: OperationalWeatherProviderStatus;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    consecutiveFailures: number;
    lastErrorCode: string | null;
  }>;
}

export interface OperationalWeatherEnvironmentBrokerConfig {
  registry: OperationalWeatherAdapterRegistry;
  nowMs?: () => number;
  isOnline?: () => boolean;
  timeoutMs?: number;
  cacheTtlMs?: number;
  staleRetentionMs?: number;
  maxCacheEntries?: number;
  maxLastGoodEntries?: number;
  initialState?: OperationalWeatherBrokerPersistedState | null;
  onStateChanged?: (state: OperationalWeatherBrokerPersistedState) => void;
}

export interface OperationalWeatherRouteJobToken {
  scope: string;
  fingerprint: string;
  signal: AbortSignal;
  isCurrent: () => boolean;
  finish: () => void;
}

const ALL_KINDS: OperationalWeatherDataKind[] = [
  'observation',
  'forecast',
  'alert',
  'air_quality',
  'fire_detection',
  'derived_route_hazard',
];
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_STALE_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_CACHE_ENTRIES = 64;
const DEFAULT_MAX_LAST_GOOD_ENTRIES = 128;
const WEATHER_COORDINATE_BUCKET_DEGREES = 0.05;

type CacheEntry = OperationalWeatherBrokerPersistedState['entries'][number];
type LastGoodEntry = OperationalWeatherBrokerPersistedState['lastGood'][number];
type InFlightRequest = {
  promise: Promise<OperationalWeatherBrokerResult>;
  controller: AbortController;
  consumers: number;
  settled: boolean;
};

type MutableDiagnostics = Omit<OperationalWeatherBrokerDiagnostics,
  'devOnly' | 'subscriberCount' | 'inFlightCount' | 'cacheSize' | 'lastGoodSize' | 'providerHealth'>;

type MutableProviderHealth = {
  providerId: string;
  status: OperationalWeatherProviderStatus;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  lastErrorCode: string | null;
};

export class OperationalWeatherRequestCancelledError extends Error {
  constructor(message = 'Operational weather request cancelled.') {
    super(message);
    this.name = 'OperationalWeatherRequestCancelledError';
  }
}

export class OperationalWeatherProviderTimeoutError extends Error {
  constructor(providerId: string) {
    super(`${providerId} weather provider timed out.`);
    this.name = 'OperationalWeatherProviderTimeoutError';
  }
}

export function createOperationalWeatherRouteJobCoordinator() {
  const jobs = new Map<string, {
    fingerprint: string;
    controller: AbortController;
    consumers: number;
  }>();
  let started = 0;
  let cancelled = 0;

  function begin(scope: string, fingerprint: string): OperationalWeatherRouteJobToken {
    const normalizedScope = cleanKey(scope, 'weather-route');
    const normalizedFingerprint = cleanKey(fingerprint, 'unknown-route');
    const previous = jobs.get(normalizedScope);
    if (previous && previous.fingerprint !== normalizedFingerprint) {
      previous.controller.abort();
      jobs.delete(normalizedScope);
      cancelled += 1;
    }

    let active = jobs.get(normalizedScope);
    if (!active) {
      active = {
        fingerprint: normalizedFingerprint,
        controller: new AbortController(),
        consumers: 0,
      };
      jobs.set(normalizedScope, active);
      started += 1;
    }
    const job = active;
    job.consumers += 1;
    let finished = false;

    return {
      scope: normalizedScope,
      fingerprint: normalizedFingerprint,
      signal: job.controller.signal,
      isCurrent: () => jobs.get(normalizedScope) === job && !job.controller.signal.aborted,
      finish: () => {
        if (finished) return;
        finished = true;
        job.consumers = Math.max(0, job.consumers - 1);
        if (jobs.get(normalizedScope) === job && job.consumers === 0) jobs.delete(normalizedScope);
      },
    };
  }

  return {
    begin,
    cancel(scope: string): void {
      const normalizedScope = cleanKey(scope, 'weather-route');
      const job = jobs.get(normalizedScope);
      if (!job) return;
      job.controller.abort();
      jobs.delete(normalizedScope);
      cancelled += 1;
    },
    clear(): void {
      for (const job of jobs.values()) job.controller.abort();
      cancelled += jobs.size;
      jobs.clear();
    },
    getDiagnostics() {
      return { started, cancelled, active: jobs.size };
    },
  };
}

export function createOperationalWeatherEnvironmentBroker(
  config: OperationalWeatherEnvironmentBrokerConfig,
) {
  const nowMs = config.nowMs ?? (() => Date.now());
  const isOnline = config.isOnline ?? (() => true);
  const timeoutMs = positiveNumber(config.timeoutMs, DEFAULT_TIMEOUT_MS);
  const cacheTtlMs = positiveNumber(config.cacheTtlMs, DEFAULT_CACHE_TTL_MS);
  const staleRetentionMs = positiveNumber(config.staleRetentionMs, DEFAULT_STALE_RETENTION_MS);
  const maxCacheEntries = Math.min(1024, positiveInteger(config.maxCacheEntries, DEFAULT_MAX_CACHE_ENTRIES));
  const maxLastGoodEntries = Math.min(2048, positiveInteger(config.maxLastGoodEntries, DEFAULT_MAX_LAST_GOOD_ENTRIES));
  const cache = new Map<string, CacheEntry>();
  const lastGood = new Map<string, LastGoodEntry>();
  const inFlight = new Map<string, InFlightRequest>();
  const subscribers = new Set<(result: OperationalWeatherBrokerResult) => void>();
  const providerHealth = new Map<string, MutableProviderHealth>();
  const metrics: MutableDiagnostics = {
    requestCount: 0,
    providerCallCount: 0,
    joinedRequestCount: 0,
    cacheHitCount: 0,
    staleCacheHitCount: 0,
    lastGoodFallbackCount: 0,
    timeoutCount: 0,
    failureCount: 0,
    cancellationCount: 0,
    cacheEvictionCount: 0,
    subscriberNotificationCount: 0,
    totalRequestDurationMs: 0,
  };

  if (config.initialState) hydrate(config.initialState);

  function persist(): void {
    config.onStateChanged?.(exportState());
  }

  function hydrate(state: OperationalWeatherBrokerPersistedState | null | undefined): void {
    if (!state || state.schemaVersion !== 1) return;
    const now = nowMs();
    for (const entry of state.entries ?? []) {
      if (!entry?.key || !entry.result || entry.expiresAtMs + staleRetentionMs < now) continue;
      cache.set(entry.key, entry);
    }
    for (const entry of state.lastGood ?? []) {
      if (!entry?.key || !Array.isArray(entry.data) || entry.storedAtMs + staleRetentionMs < now) continue;
      lastGood.set(entry.key, entry);
    }
    pruneMap(cache, maxCacheEntries, () => { metrics.cacheEvictionCount += 1; });
    pruneMap(lastGood, maxLastGoodEntries, () => { metrics.cacheEvictionCount += 1; });
  }

  function exportState(): OperationalWeatherBrokerPersistedState {
    return {
      schemaVersion: 1,
      savedAt: new Date(nowMs()).toISOString(),
      entries: [...cache.values()],
      lastGood: [...lastGood.values()],
    };
  }

  function getDiagnostics(): OperationalWeatherBrokerDiagnostics {
    return {
      devOnly: true,
      ...metrics,
      subscriberCount: subscribers.size,
      inFlightCount: inFlight.size,
      cacheSize: cache.size,
      lastGoodSize: lastGood.size,
      providerHealth: [...providerHealth.values()].map((entry) => ({ ...entry })),
    };
  }

  function updateProviderHealth(
    providerId: string,
    status: OperationalWeatherProviderStatus,
    errorCode: string | null,
    now: number,
  ): void {
    const previous = providerHealth.get(providerId);
    providerHealth.set(providerId, {
      providerId,
      status,
      lastAttemptAt: new Date(now).toISOString(),
      lastSuccessAt: status === 'success' || status === 'degraded'
        ? new Date(now).toISOString()
        : previous?.lastSuccessAt ?? null,
      consecutiveFailures: status === 'success' || status === 'degraded'
        ? 0
        : (previous?.consecutiveFailures ?? 0) + 1,
      lastErrorCode: errorCode,
    });
  }

  function notify(result: OperationalWeatherBrokerResult): void {
    for (const subscriber of subscribers) {
      try {
        subscriber(result);
        metrics.subscriberNotificationCount += 1;
      } catch {}
    }
  }

  async function fetch(
    request: OperationalWeatherBrokerRequest,
  ): Promise<OperationalWeatherBrokerResult> {
    assertCoordinate(request.coordinate.lat, 'lat', -90, 90);
    assertCoordinate(request.coordinate.lon, 'lon', -180, 180);
    if (request.signal?.aborted) {
      metrics.cancellationCount += 1;
      throw new OperationalWeatherRequestCancelledError();
    }

    const requestKey = buildOperationalWeatherEnvironmentRequestKey(request);
    const now = request.now?.getTime() ?? nowMs();
    metrics.requestCount += 1;
    const cached = cache.get(requestKey);
    if (!request.forceRefresh && cached) {
      const stale = cached.expiresAtMs <= now || !isOnline();
      if (cached.expiresAtMs + staleRetentionMs >= now) {
        touchMapEntry(cache, requestKey, { ...cached, lastAccessedAtMs: now });
        if (stale) metrics.staleCacheHitCount += 1;
        else metrics.cacheHitCount += 1;
        const result = cloneCachedResult(cached.result, stale, now);
        return result;
      }
      cache.delete(requestKey);
    }

    const existing = inFlight.get(requestKey);
    if (existing && !existing.controller.signal.aborted) {
      metrics.joinedRequestCount += 1;
      return joinInFlightRequest(existing, request.signal);
    }
    if (existing) inFlight.delete(requestKey);

    const startedAt = nowMs();
    const controller = new AbortController();
    const sharedRequest: OperationalWeatherBrokerRequest = {
      ...request,
      signal: controller.signal,
    };
    let entry: InFlightRequest;
    const promise = executeRequest(sharedRequest, requestKey, now)
      .then((result) => {
        const duration = Math.max(0, nowMs() - startedAt);
        metrics.totalRequestDurationMs += duration;
        const completed = {
          ...result,
          diagnostics: { ...result.diagnostics, requestDurationMs: duration },
        };
        if (!controller.signal.aborted) {
          const entry: CacheEntry = {
            key: requestKey,
            result: completed,
            expiresAtMs: cacheExpiryForResult(completed, now, cacheTtlMs),
            lastAccessedAtMs: now,
          };
          cache.set(requestKey, entry);
          pruneMap(cache, maxCacheEntries, () => { metrics.cacheEvictionCount += 1; });
          persist();
          notify(completed);
        }
        return completed;
      })
      .finally(() => {
        entry.settled = true;
        if (inFlight.get(requestKey) === entry) inFlight.delete(requestKey);
      });

    entry = {
      promise,
      controller,
      consumers: 0,
      settled: false,
    };
    inFlight.set(requestKey, entry);
    return joinInFlightRequest(entry, request.signal);
  }

  function joinInFlightRequest(
    entry: InFlightRequest,
    signal?: AbortSignal | null,
  ): Promise<OperationalWeatherBrokerResult> {
    entry.consumers += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      entry.consumers = Math.max(0, entry.consumers - 1);
      if (entry.consumers === 0 && !entry.settled) entry.controller.abort();
    };

    if (!signal) return entry.promise.finally(release);
    if (signal.aborted) {
      metrics.cancellationCount += 1;
      release();
      return Promise.reject(new OperationalWeatherRequestCancelledError());
    }

    const consumerPromise = new Promise<OperationalWeatherBrokerResult>((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort);
        metrics.cancellationCount += 1;
        reject(new OperationalWeatherRequestCancelledError());
      };
      signal.addEventListener('abort', onAbort, { once: true });
      entry.promise.then(
        (result) => {
          signal.removeEventListener('abort', onAbort);
          resolve(result);
        },
        (error) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
    return consumerPromise.finally(release);
  }

  async function executeRequest(
    request: OperationalWeatherBrokerRequest,
    requestKey: string,
    now: number,
  ): Promise<OperationalWeatherBrokerResult> {
    const requestedKinds = normalizeKinds(request.kinds);
    const providers = normalizeProviderIds(request.providerIds);
    const providerOutcomes = await Promise.all(providers.map((providerId) =>
      fetchProvider(providerId, request, requestKey, now, requestedKinds)));
    if (request.signal?.aborted) {
      metrics.cancellationCount += 1;
      throw new OperationalWeatherRequestCancelledError();
    }

    const rawData = providerOutcomes.flatMap((outcome) => outcome.data);
    const deduped = dedupeEnvironmentalData(rawData);
    const data = deduped.data.filter((datum) => requestedKinds.includes(datum.kind));
    const conflicts = detectOperationalWeatherConflicts(data);
    const outcomes = providerOutcomes.map((outcome) => outcome.outcome);
    const result: OperationalWeatherBrokerResult = {
      requestKey,
      generatedAt: new Date(now).toISOString(),
      data,
      byKind: groupByKind(data),
      providers: outcomes,
      conflicts,
      warnings: uniqueStrings(outcomes.flatMap((outcome) => outcome.warnings)),
      stale: data.length > 0 && data.every((datum) => datum.stale),
      cacheHit: outcomes.length > 0 && outcomes.every((outcome) =>
        outcome.cacheState === 'cache_fresh' ||
        outcome.cacheState === 'cache_stale' ||
        outcome.cacheState === 'last_good'),
      diagnostics: {
        requestDurationMs: 0,
        providerCallsAttempted: outcomes.filter((outcome) =>
          outcome.cacheState === 'live' || outcome.status === 'timeout' || outcome.status === 'failed').length,
        providerCallsAvoided: outcomes.filter((outcome) =>
          outcome.cacheState === 'cache_fresh' ||
          outcome.cacheState === 'cache_stale' ||
          outcome.cacheState === 'last_good').length,
        alertDuplicatesSuppressed: deduped.alertDuplicatesSuppressed,
      },
    };
    return result;
  }

  async function fetchProvider(
    providerId: string,
    request: OperationalWeatherBrokerRequest,
    requestKey: string,
    now: number,
    requestedKinds: OperationalWeatherDataKind[],
  ): Promise<{ data: OperationalWeatherDatum[]; outcome: OperationalWeatherProviderOutcome }> {
    const startedAt = nowMs();
    const lastGoodKey = `${requestKey}|provider=${providerId}`;
    if (!isOnline()) {
      return fallbackProviderOutcome(providerId, lastGoodKey, 'unavailable', 'offline', startedAt, now);
    }
    if (request.signal?.aborted) {
      return cancelledProviderOutcome(providerId, startedAt, now);
    }

    metrics.providerCallCount += 1;
    const controller = new AbortController();
    const removeAbortForwarder = forwardAbort(request.signal, controller);
    try {
      const fixturePayload = request.fixturePayloadByProvider?.[providerId];
      const adapterPromise = config.registry.runAdapter(providerId, {
        lat: request.coordinate.lat,
        lon: request.coordinate.lon,
        units: request.units ?? 'imperial',
        timeWindow: request.timeWindow ?? null,
        fixturePayload,
      }, {
        fixtureMode: request.fixtureMode === true || fixturePayload != null,
        forceRefresh: request.forceRefresh,
        now: new Date(now),
        serverFetch: request.serverFetch,
        signal: controller.signal,
      });
      const run = await withProviderTimeout(adapterPromise, providerId, timeoutMs, controller);
      if (request.signal?.aborted) return cancelledProviderOutcome(providerId, startedAt, now);

      const cacheState = cacheStateForAdapterRun(run);
      const stale = run.stale || cacheState === 'cache_stale';
      const data = run.observations.flatMap((observation) =>
        normalizeSourceObservation(observation, cacheState, stale, now))
        .filter((datum) => requestedKinds.includes(datum.kind));
      const status: OperationalWeatherProviderStatus = data.length > 0
        ? stale || run.warnings.length > 0 ? 'degraded' : 'success'
        : 'unavailable';
      const errorCode = data.length > 0 ? null : cacheStateForAdapterRun(run);
      updateProviderHealth(providerId, status, errorCode, now);

      if (data.length > 0) {
        lastGood.set(lastGoodKey, { key: lastGoodKey, data, storedAtMs: now });
        pruneMap(lastGood, maxLastGoodEntries, () => { metrics.cacheEvictionCount += 1; });
        return {
          data,
          outcome: {
            providerId,
            status,
            cacheState,
            dataCount: data.length,
            durationMs: Math.max(0, nowMs() - startedAt),
            warnings: uniqueStrings(run.warnings),
            errorCode,
          },
        };
      }

      return fallbackProviderOutcome(
        providerId,
        lastGoodKey,
        'unavailable',
        errorCode ?? 'no_data',
        startedAt,
        now,
        run.warnings,
      );
    } catch (error) {
      if (request.signal?.aborted || controller.signal.aborted && !(error instanceof OperationalWeatherProviderTimeoutError)) {
        return cancelledProviderOutcome(providerId, startedAt, now);
      }
      if (error instanceof OperationalWeatherProviderTimeoutError) {
        metrics.timeoutCount += 1;
        return fallbackProviderOutcome(providerId, lastGoodKey, 'timeout', 'timeout', startedAt, now);
      }
      metrics.failureCount += 1;
      return fallbackProviderOutcome(
        providerId,
        lastGoodKey,
        'failed',
        classifyErrorCode(error),
        startedAt,
        now,
        [safeErrorMessage(error)],
      );
    } finally {
      removeAbortForwarder();
    }
  }

  function cancelledProviderOutcome(
    providerId: string,
    startedAt: number,
    now: number,
  ): { data: OperationalWeatherDatum[]; outcome: OperationalWeatherProviderOutcome } {
    metrics.cancellationCount += 1;
    updateProviderHealth(providerId, 'cancelled', 'cancelled', now);
    return {
      data: [],
      outcome: {
        providerId,
        status: 'cancelled',
        cacheState: 'unavailable',
        dataCount: 0,
        durationMs: Math.max(0, nowMs() - startedAt),
        warnings: ['Provider request was cancelled because route or location context changed.'],
        errorCode: 'cancelled',
      },
    };
  }

  function fallbackProviderOutcome(
    providerId: string,
    lastGoodKey: string,
    status: 'timeout' | 'unavailable' | 'failed',
    errorCode: string,
    startedAt: number,
    now: number,
    warnings: string[] = [],
  ): { data: OperationalWeatherDatum[]; outcome: OperationalWeatherProviderOutcome } {
    const cached = lastGood.get(lastGoodKey);
    const usableCached = cached && cached.storedAtMs + staleRetentionMs >= now ? cached : null;
    if (usableCached) {
      metrics.lastGoodFallbackCount += 1;
      touchMapEntry(lastGood, lastGoodKey, usableCached);
    }
    updateProviderHealth(providerId, usableCached ? 'degraded' : status, errorCode, now);
    const data = usableCached
      ? usableCached.data.map((datum) => ({
          ...datum,
          cacheState: 'last_good' as const,
          stale: true,
          knownLimitations: uniqueStrings([
            ...datum.knownLimitations,
            `${providerId} refresh failed; ECS retained last-good data.`,
          ]),
        }))
      : [];
    return {
      data,
      outcome: {
        providerId,
        status: usableCached ? 'degraded' : status,
        cacheState: usableCached ? 'last_good' : 'unavailable',
        dataCount: data.length,
        durationMs: Math.max(0, nowMs() - startedAt),
        warnings: uniqueStrings([
          ...warnings,
          usableCached
            ? `${providerId} unavailable; using visibly stale last-good data.`
            : `${providerId} unavailable and no usable last-good data exists.`,
        ]),
        errorCode,
      },
    };
  }

  return {
    fetch,
    subscribe(listener: (result: OperationalWeatherBrokerResult) => void): () => void {
      subscribers.add(listener);
      return () => { subscribers.delete(listener); };
    },
    getDiagnostics,
    exportState,
    hydrate,
    clear(): void {
      cache.clear();
      lastGood.clear();
      for (const request of inFlight.values()) request.controller.abort();
      inFlight.clear();
      providerHealth.clear();
      persist();
    },
  };
}

const sharedEnvironmentBrokers = new WeakMap<
  OperationalWeatherAdapterRegistry,
  ReturnType<typeof createOperationalWeatherEnvironmentBroker>
>();
const sharedRouteJobCoordinator = createOperationalWeatherRouteJobCoordinator();

export function getOperationalWeatherEnvironmentBroker(
  registry: OperationalWeatherAdapterRegistry,
  config: Omit<OperationalWeatherEnvironmentBrokerConfig, 'registry'> = {},
) {
  const existing = sharedEnvironmentBrokers.get(registry);
  if (existing) return existing;
  const broker = createOperationalWeatherEnvironmentBroker({
    ...config,
    registry,
  });
  sharedEnvironmentBrokers.set(registry, broker);
  return broker;
}

export function beginOperationalWeatherRouteJob(scope: string, fingerprint: string) {
  return sharedRouteJobCoordinator.begin(scope, fingerprint);
}

export function cancelOperationalWeatherRouteJob(scope: string): void {
  sharedRouteJobCoordinator.cancel(scope);
}

export function getOperationalWeatherRouteJobDiagnostics() {
  return sharedRouteJobCoordinator.getDiagnostics();
}

export function clearOperationalWeatherRouteJobsForTests(): void {
  sharedRouteJobCoordinator.clear();
}

export function buildOperationalWeatherEnvironmentRequestKey(
  request: OperationalWeatherBrokerRequest,
): string {
  const bucket = coordinateBucket(request.coordinate.lat, request.coordinate.lon);
  const providers = normalizeProviderIds(request.providerIds).join(',');
  const kinds = normalizeKinds(request.kinds).slice().sort().join(',');
  const timeWindow = normalizeTimeBucket(request.timeWindow);
  const fixtureFingerprint = stableHash(request.fixturePayloadByProvider ?? {});
  return [
    'operational-weather-environment-v1',
    `bucket=${bucket}`,
    `time=${timeWindow}`,
    `providers=${providers}`,
    `kinds=${kinds}`,
    `units=${request.units ?? 'imperial'}`,
    `fixtures=${fixtureFingerprint}`,
  ].join('|');
}

export function normalizeSourceObservation(
  observation: SourceObservation,
  cacheState: OperationalWeatherCacheState,
  staleFromProvider: boolean,
  nowMs: number,
): OperationalWeatherDatum[] {
  const payload = isRecord(observation.normalizedPayload)
    ? observation.normalizedPayload
    : {};
  const stale = staleFromProvider || isObservationExpired(observation, nowMs);
  const base = {
    observationId: observation.id,
    providerId: String(observation.providerId),
    sourceName: observation.sourceName,
    sourceType: observation.sourceType,
    authority: authorityForSource(observation.sourceType),
    observedAt: validIso(observation.observedAt),
    retrievedAt: validIso(observation.ingestedAt) ?? new Date(nowMs).toISOString(),
    expiresAt: validIso(observation.expiresAt ?? observation.validUntil),
    cacheState: stale && cacheState === 'live' ? 'cache_stale' as const : cacheState,
    stale,
    confidence: clamp(observation.confidenceScore, 0, 100),
    subjectId: observation.subjectId,
    contentHash: observation.contentHash,
    geometry: observation.geometry,
    knownLimitations: uniqueStrings(observation.knownLimitations ?? []),
    legalClosureImplied: false as const,
  };

  if (observation.subjectType === 'weather_forecast') {
    const output: OperationalWeatherDatum[] = [];
    if (isRecord(payload.current) && Object.keys(payload.current).length > 0) {
      output.push({
        ...base,
        id: `${observation.id}:observation`,
        kind: 'observation',
        forecastValidFrom: null,
        forecastValidUntil: null,
        payload: payload.current,
      });
    }
    const forecastPayload = pickForecastPayload(payload);
    if (Object.keys(forecastPayload).length > 0 || output.length === 0) {
      const forecastRange = forecastValidityRange(forecastPayload);
      output.push({
        ...base,
        id: `${observation.id}:forecast`,
        kind: 'forecast',
        forecastValidFrom: forecastRange.from,
        forecastValidUntil: forecastRange.until,
        payload: forecastPayload,
      });
    }
    return output;
  }

  if (observation.subjectType === 'weather_alert') {
    return [{
      ...base,
      id: `${observation.id}:alert`,
      kind: 'alert',
      forecastValidFrom: firstIso([
        payload.effective,
        payload.onset,
        payload.start,
        observation.observedAt,
      ]),
      forecastValidUntil: firstIso([
        payload.expires,
        payload.ends,
        payload.end,
        observation.expiresAt,
      ]),
      payload,
    }];
  }

  if (observation.subjectType === 'smoke_aqi') {
    const isForecast = /forecast/i.test(String(payload.dataType ?? payload.type ?? payload.reportType ?? ''));
    return [{
      ...base,
      id: `${observation.id}:air-quality`,
      kind: 'air_quality',
      forecastValidFrom: isForecast
        ? firstIso([payload.forecastAt, payload.forecastDate, payload.dateForecast, observation.observedAt])
        : null,
      forecastValidUntil: isForecast ? validIso(observation.expiresAt) : null,
      payload,
    }];
  }

  if (
    observation.subjectType === 'active_fire' ||
    observation.subjectType === 'fire_perimeter' ||
    observation.subjectType === 'fire_incident'
  ) {
    return [{
      ...base,
      id: `${observation.id}:fire-detection`,
      kind: 'fire_detection',
      forecastValidFrom: null,
      forecastValidUntil: null,
      payload: {
        ...payload,
        legalClosureSignal: false,
      },
    }];
  }

  return [];
}

export function detectOperationalWeatherConflicts(
  data: OperationalWeatherDatum[],
): OperationalWeatherConflict[] {
  const conflicts: OperationalWeatherConflict[] = [];
  for (const kind of ['observation', 'forecast', 'air_quality'] as const) {
    const candidates = data.filter((datum) => datum.kind === kind && !datum.stale);
    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
        const left = candidates[leftIndex];
        const right = candidates[rightIndex];
        if (left.providerId === right.providerId) continue;
        const reason = materialConflictReason(left, right);
        if (!reason) continue;
        conflicts.push({
          kind,
          providerIds: [left.providerId, right.providerId].sort(),
          reason,
          datumIds: [left.id, right.id],
        });
      }
    }
  }
  return dedupeBy(conflicts, (conflict) => [
    conflict.kind,
    conflict.providerIds.join(','),
    conflict.reason,
  ].join('|'));
}

function cacheStateForAdapterRun(run: AdapterRunResult): OperationalWeatherCacheState {
  switch (run.cacheStatus) {
    case 'hit_fresh':
      return 'cache_fresh';
    case 'hit_stale':
      return 'cache_stale';
    case 'miss':
      return 'live';
    default:
      return 'unavailable';
  }
}

function groupByKind(
  data: OperationalWeatherDatum[],
): Record<OperationalWeatherDataKind, OperationalWeatherDatum[]> {
  const grouped: Record<OperationalWeatherDataKind, OperationalWeatherDatum[]> = {
    observation: [],
    forecast: [],
    alert: [],
    air_quality: [],
    fire_detection: [],
    derived_route_hazard: [],
  };
  for (const datum of data) grouped[datum.kind].push(datum);
  return grouped;
}

function cloneCachedResult(
  result: OperationalWeatherBrokerResult,
  stale: boolean,
  now: number,
): OperationalWeatherBrokerResult {
  const cacheState: OperationalWeatherCacheState = stale ? 'cache_stale' : 'cache_fresh';
  let newlyExpired = 0;
  const data = result.data.map((datum) => {
    const datumStale = stale || datum.stale || isDatumExpiredAt(datum, now);
    if (datumStale && !datum.stale) newlyExpired += 1;
    return {
      ...datum,
      stale: datumStale,
      cacheState: datumStale ? 'cache_stale' as const : cacheState,
    };
  });
  const allDataStale = data.length > 0 && data.every((datum) => datum.stale);
  return {
    ...result,
    generatedAt: new Date(now).toISOString(),
    data,
    byKind: groupByKind(data),
    providers: result.providers.map((provider) => ({
      ...provider,
      status: stale || newlyExpired > 0 ? 'degraded' : provider.status,
      cacheState: allDataStale ? 'cache_stale' : cacheState,
    })),
    warnings: newlyExpired > 0
      ? uniqueStrings([...result.warnings, 'Cached environmental facts crossed their provider validity boundary and are now stale.'])
      : result.warnings,
    stale: allDataStale,
    cacheHit: true,
    diagnostics: {
      ...result.diagnostics,
      requestDurationMs: 0,
      providerCallsAttempted: 0,
      providerCallsAvoided: Math.max(1, result.providers.length),
    },
  };
}

function cacheExpiryForResult(
  result: OperationalWeatherBrokerResult,
  storedAt: number,
  cacheTtlMs: number,
): number {
  const degraded = result.data.length === 0 || result.providers.some((provider) =>
    provider.status !== 'success' ||
    provider.cacheState === 'cache_stale' ||
    provider.cacheState === 'last_good');
  const defaultExpiry = storedAt + Math.min(cacheTtlMs, degraded ? 60_000 : cacheTtlMs);
  const validityBoundaries = result.data.flatMap((datum) => [datum.expiresAt, datum.forecastValidUntil])
    .map((value) => validIso(value))
    .filter((value): value is string => value != null)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  if (validityBoundaries.length === 0) return defaultExpiry;
  const providerExpiry = Math.min(...validityBoundaries);
  return Math.max(storedAt + 60_000, Math.min(defaultExpiry, providerExpiry));
}

function isDatumExpiredAt(datum: OperationalWeatherDatum, now: number): boolean {
  const boundaries = [datum.expiresAt, datum.forecastValidUntil]
    .map((value) => validIso(value))
    .filter((value): value is string => value != null)
    .map((value) => Date.parse(value));
  return boundaries.length > 0 && Math.min(...boundaries) <= now;
}

function dedupeEnvironmentalData(data: OperationalWeatherDatum[]): {
  data: OperationalWeatherDatum[];
  alertDuplicatesSuppressed: number;
} {
  const sorted = [...data].sort(compareDatumPriority);
  const output: OperationalWeatherDatum[] = [];
  const keys = new Set<string>();
  let alertDuplicatesSuppressed = 0;
  for (const datum of sorted) {
    const key = datum.kind === 'alert'
      ? alertFingerprint(datum)
      : `${datum.providerId}|${datum.kind}|${datum.contentHash}`;
    if (keys.has(key)) {
      if (datum.kind === 'alert') alertDuplicatesSuppressed += 1;
      continue;
    }
    keys.add(key);
    output.push(datum);
  }
  return { data: output, alertDuplicatesSuppressed };
}

function compareDatumPriority(left: OperationalWeatherDatum, right: OperationalWeatherDatum): number {
  const authorityDelta = authorityRank(right.authority) - authorityRank(left.authority);
  if (authorityDelta !== 0) return authorityDelta;
  if (left.stale !== right.stale) return left.stale ? 1 : -1;
  return right.confidence - left.confidence;
}

function alertFingerprint(datum: OperationalWeatherDatum): string {
  const payload = isRecord(datum.payload) ? datum.payload : {};
  const title = normalizeText(
    payload.event ?? payload.headline ?? payload.title ?? datum.subjectId ?? 'weather-alert',
  );
  return [
    'alert',
    title,
    normalizeAlertTime(datum.forecastValidFrom ?? datum.observedAt),
    normalizeAlertTime(datum.forecastValidUntil ?? datum.expiresAt),
  ].join('|');
}

function normalizeAlertTime(value: string | null): string {
  const iso = validIso(value);
  if (!iso) return 'unknown';
  const date = new Date(iso);
  date.setUTCMinutes(Math.floor(date.getUTCMinutes() / 15) * 15, 0, 0);
  return date.toISOString();
}

function materialConflictReason(
  left: OperationalWeatherDatum,
  right: OperationalWeatherDatum,
): string | null {
  const leftMetrics = extractComparableMetrics(left);
  const rightMetrics = extractComparableMetrics(right);
  if (left.kind === 'air_quality' && right.kind === 'air_quality') {
    if (leftMetrics.aqi != null && rightMetrics.aqi != null && Math.abs(leftMetrics.aqi - rightMetrics.aqi) >= 50) {
      return `AQI differs materially (${Math.round(leftMetrics.aqi)} vs ${Math.round(rightMetrics.aqi)}); providers remain separate.`;
    }
    return null;
  }
  if (leftMetrics.temperature != null && rightMetrics.temperature != null &&
      Math.abs(leftMetrics.temperature - rightMetrics.temperature) >= 10) {
    return `Temperature differs materially (${Math.round(leftMetrics.temperature)} vs ${Math.round(rightMetrics.temperature)}); providers remain separate.`;
  }
  if (leftMetrics.wind != null && rightMetrics.wind != null &&
      Math.abs(leftMetrics.wind - rightMetrics.wind) >= 15) {
    return `Wind differs materially (${Math.round(leftMetrics.wind)} vs ${Math.round(rightMetrics.wind)}); providers remain separate.`;
  }
  return null;
}

function extractComparableMetrics(datum: OperationalWeatherDatum): {
  temperature: number | null;
  wind: number | null;
  aqi: number | null;
} {
  const payload = isRecord(datum.payload) ? datum.payload : {};
  const firstHourly = Array.isArray(payload.hourly) && isRecord(payload.hourly[0]) ? payload.hourly[0] : {};
  const firstForecast = Array.isArray(payload.forecast) && isRecord(payload.forecast[0]) ? payload.forecast[0] : {};
  return {
    temperature: firstNumber([
      payload.temp,
      payload.temperature,
      payload.temperatureF,
      firstHourly.temp,
      firstHourly.temperature,
      firstForecast.temperature,
    ]),
    wind: firstNumber([
      payload.wind_speed,
      payload.windSpeed,
      payload.windSpeedMph,
      firstHourly.wind_speed,
      firstHourly.windSpeed,
      firstForecast.windSpeed,
    ]),
    aqi: firstNumber([payload.aqi, payload.AQI, payload.airQualityIndex]),
  };
}

function pickForecastPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    'timezone',
    'timezone_offset',
    'minutely',
    'hourly',
    'daily',
    'forecast',
    'point',
    'sourceEndpoints',
  ];
  return Object.fromEntries(keys.filter((key) => payload[key] != null).map((key) => [key, payload[key]]));
}

function forecastValidityRange(payload: Record<string, unknown>): {
  from: string | null;
  until: string | null;
} {
  const timestamps: string[] = [];
  for (const key of ['minutely', 'hourly', 'daily', 'forecast']) {
    const rows = Array.isArray(payload[key]) ? payload[key] : [];
    for (const row of rows) {
      if (!isRecord(row)) continue;
      for (const value of [row.dt, row.startTime, row.endTime, row.validTime, row.timestamp]) {
        const iso = validIso(value);
        if (iso) timestamps.push(iso);
      }
    }
  }
  timestamps.sort((left, right) => Date.parse(left) - Date.parse(right));
  return {
    from: timestamps[0] ?? null,
    until: timestamps[timestamps.length - 1] ?? null,
  };
}

function authorityForSource(sourceType: SourceObservationSourceType): OperationalWeatherAuthority {
  if (
    sourceType === 'federal_agency' ||
    sourceType === 'state_agency' ||
    sourceType === 'local_agency' ||
    sourceType === 'tribal_agency' ||
    sourceType === 'official_api' ||
    sourceType === 'official_webpage' ||
    sourceType === 'official_gis'
  ) return 'official';
  if (sourceType === 'commercial_weather' || sourceType === 'partner_feed') return 'commercial';
  if (sourceType === 'satellite') return 'satellite';
  if (sourceType === 'sensor') return 'sensor';
  if (sourceType === 'manual_admin') return 'manual';
  return 'unknown';
}

function authorityRank(authority: OperationalWeatherAuthority): number {
  switch (authority) {
    case 'official': return 6;
    case 'satellite': return 5;
    case 'sensor': return 4;
    case 'commercial': return 3;
    case 'manual': return 2;
    default: return 1;
  }
}

function isObservationExpired(observation: SourceObservation, now: number): boolean {
  const staleAt = validIso(observation.staleAt);
  const expiresAt = validIso(observation.expiresAt ?? observation.validUntil);
  const boundary = staleAt ?? expiresAt;
  return boundary != null && Date.parse(boundary) <= now;
}

function withProviderTimeout<T>(
  promise: Promise<T>,
  providerId: string,
  timeoutMs: number,
  controller: AbortController,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new OperationalWeatherProviderTimeoutError(providerId));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function forwardAbort(
  source: AbortSignal | null | undefined,
  target: AbortController,
): () => void {
  if (!source) return () => {};
  if (source.aborted) {
    target.abort();
    return () => {};
  }
  const onAbort = () => target.abort();
  source.addEventListener('abort', onAbort, { once: true });
  return () => source.removeEventListener('abort', onAbort);
}

function normalizeKinds(kinds?: OperationalWeatherDataKind[]): OperationalWeatherDataKind[] {
  const normalized = uniqueStrings(kinds ?? ALL_KINDS)
    .filter((kind): kind is OperationalWeatherDataKind => ALL_KINDS.includes(kind as OperationalWeatherDataKind));
  return normalized.length > 0 ? normalized : [...ALL_KINDS];
}

function normalizeProviderIds(providerIds: string[]): string[] {
  return uniqueStrings(providerIds.map((providerId) => cleanKey(providerId, '')))
    .filter(Boolean)
    .sort();
}

function coordinateBucket(lat: number, lon: number): string {
  const roundedLat = Math.round(lat / WEATHER_COORDINATE_BUCKET_DEGREES) * WEATHER_COORDINATE_BUCKET_DEGREES;
  const roundedLon = Math.round(lon / WEATHER_COORDINATE_BUCKET_DEGREES) * WEATHER_COORDINATE_BUCKET_DEGREES;
  return `${roundedLat.toFixed(2)},${roundedLon.toFixed(2)}`;
}

function normalizeTimeBucket(value: string | null | undefined): string {
  if (!value) return 'current';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'invalid';
  const date = new Date(parsed);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

function validIso(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function firstIso(values: unknown[]): string | null {
  for (const value of values) {
    const iso = validIso(value);
    if (iso) return iso;
  }
  return null;
}

function firstNumber(values: unknown[]): number | null {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function assertCoordinate(value: number, label: string, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid operational weather ${label}.`);
  }
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.round(positiveNumber(value, fallback)));
}

function cleanKey(value: string | null | undefined, fallback: string): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '-');
  return normalized || fallback;
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 .:/_-]+/g, '');
}

function stableHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function classifyErrorCode(error: unknown): string {
  if (error instanceof OperationalWeatherProviderTimeoutError) return 'timeout';
  if (error instanceof OperationalWeatherRequestCancelledError) return 'cancelled';
  const message = error instanceof Error ? error.message : String(error ?? 'unknown');
  if (/permission|unauthorized|forbidden|401|403/i.test(message)) return 'permission_denied';
  if (/configuration|not configured|missing/i.test(message)) return 'missing_config';
  if (/network|offline|fetch/i.test(message)) return 'provider_unavailable';
  return 'provider_failed';
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? 'Provider failed.');
  return message
    .replace(/([?&](?:api_?key|appid|token|secret|authorization)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\b(?:api_?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '[redacted credential]');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function dedupeBy<T>(items: T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFor(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function touchMapEntry<T>(map: Map<string, T>, key: string, value: T): void {
  map.delete(key);
  map.set(key, value);
}

function pruneMap<T>(map: Map<string, T>, maxEntries: number, onEvict: () => void): void {
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (typeof oldestKey !== 'string') return;
    map.delete(oldestKey);
    onEvict();
  }
}
