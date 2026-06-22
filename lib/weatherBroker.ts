import { connectivity } from './connectivity';
import { ecsLog } from './ecsLogger';
import type { ECSWeatherSourceType } from './ecsWeather';
import type { WeatherFetchResult } from './weatherStore';
import type {
  CurrentConditions,
  DailyForecast,
  HourlyForecast,
  WeatherAlert,
  WeatherCoordinate,
  WeatherResponse,
  WaypointWeather,
} from './weatherTypes';

export type WeatherBrokerUseCase =
  | 'active_navigation'
  | 'explore_list'
  | 'route_planning'
  | 'weather_alerts'
  | 'offline_packet'
  | 'default';

export type WeatherBrokerSection = 'current' | 'hourly' | 'daily' | 'alerts';

export interface WeatherBrokerFetchOptions {
  useCase?: WeatherBrokerUseCase;
  sections?: WeatherBrokerSection[];
  sourceType?: ECSWeatherSourceType;
  forceRefresh?: boolean;
  debugForceRefresh?: boolean;
  routeSessionId?: string | null;
  nowMs?: number;
}

export interface WeatherBrokerProviderContext {
  sourceType?: ECSWeatherSourceType | null;
  screen?: string | null;
  routeSessionId?: string | null;
  providerExclude?: string | null;
  brokerBucketKey?: string | null;
  brokerUseCase?: WeatherBrokerUseCase | null;
  brokerSections?: WeatherBrokerSection[];
}

export interface EcsWeatherBrokerEntry {
  provider: 'openweather';
  product: 'onecall3';
  requestedAt: string;
  expiresAt: string;
  stale: boolean;
  cacheHit: boolean;
  bucketKey: string;
  sourceCoordinate: WeatherCoordinate;
  normalizedCoordinate: WeatherCoordinate;
  current: CurrentConditions | null;
  hourly: HourlyForecast[] | null;
  daily: DailyForecast[] | null;
  alerts: WeatherAlert[];
  providerCostMetadata: WeatherBrokerCostMetadata;
}

export interface WeatherBrokerCostMetadata {
  providerCallsAttempted: number;
  providerCallsAvoided: number;
  budgetDenied: boolean;
  budgetRemaining: number;
  sessionRemaining: number;
  rateLimited: boolean;
  cooldownActive: boolean;
  offline: boolean;
  sections: WeatherBrokerSection[];
  exclude: string;
}

export interface EcsWeatherBrokerSummary {
  provider: 'openweather';
  product: 'onecall3';
  requestedAt: string;
  expiresAt: string;
  stale: boolean;
  cacheHit: boolean;
  bucketKey: string;
  bucketKeys: string[];
  sourceCoordinate: WeatherCoordinate;
  normalizedCoordinate: WeatherCoordinate;
  entries: EcsWeatherBrokerEntry[];
  providerCostMetadata: WeatherBrokerCostMetadata;
}

export type BrokeredWeatherFetchResult = WeatherFetchResult & {
  broker: EcsWeatherBrokerSummary;
};

type ProviderFetch = (
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric',
  forceRefresh: boolean,
  context: WeatherBrokerProviderContext,
) => Promise<WeatherFetchResult>;

type CachedFetch = (
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric',
) => Promise<WeatherFetchResult | null>;

type BackgroundScheduler = (refresh: () => Promise<void>) => void;

interface WeatherBrokerConfig {
  bucketSizeDegrees?: number;
  dailyBudget?: number;
  sessionBudget?: number;
  sameBucketThrottleMs?: number;
  nearbyNavigationThrottleMs?: number;
  rateLimitCooldownMs?: number;
  nowMs?: () => number;
  isOnline?: () => boolean;
  providerFetch?: ProviderFetch;
  cachedFetch?: CachedFetch;
  scheduleBackgroundRefresh?: BackgroundScheduler;
}

interface WeatherBrokerCacheEntry {
  key: string;
  bucketKey: string;
  normalizedCoordinate: WeatherCoordinate;
  result: WeatherFetchResult;
  requestedAtMs: number;
  expiresAtMs: number;
  sections: WeatherBrokerSection[];
  exclude: string;
}

interface BucketFetchOutcome {
  bucketKey: string;
  normalizedCoordinate: WeatherCoordinate;
  result: WeatherFetchResult;
  requestedAtMs: number;
  expiresAtMs: number;
  stale: boolean;
  cacheHit: boolean;
  providerCallsAttempted: number;
  providerCallsAvoided: number;
  budgetDenied: boolean;
  rateLimited: boolean;
  cooldownActive: boolean;
  offline: boolean;
  sections: WeatherBrokerSection[];
  exclude: string;
}

const DEFAULT_BUCKET_SIZE_DEGREES = 0.05;
const DEFAULT_DAILY_BUDGET = 100;
const DEFAULT_SESSION_BUDGET = 100;
const DEFAULT_SAME_BUCKET_THROTTLE_MS = 10 * 60 * 1000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;
const DEFAULT_SECTIONS: WeatherBrokerSection[] = ['current', 'hourly', 'daily', 'alerts'];
const ONECALL_SECTIONS: WeatherBrokerSection[] = ['current', 'hourly', 'daily', 'alerts'];
const ONECALL_EXCLUDE_ORDER = ['current', 'minutely', 'hourly', 'daily', 'alerts'] as const;

function readEnvNumber(key: string, fallback: number): number {
  try {
    const value = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function roundToBucket(value: number, bucketSize: number): number {
  const rounded = Math.round(value / bucketSize) * bucketSize;
  return Number(rounded.toFixed(4));
}

function formatBucketCoord(value: number): string {
  return value.toFixed(2);
}

function normalizeSections(sections?: WeatherBrokerSection[]): WeatherBrokerSection[] {
  const unique = Array.from(new Set((sections && sections.length ? sections : DEFAULT_SECTIONS)
    .filter((section): section is WeatherBrokerSection => ONECALL_SECTIONS.includes(section))));
  return unique.length ? unique : DEFAULT_SECTIONS.slice();
}

function sectionsKey(sections: WeatherBrokerSection[]): string {
  return normalizeSections(sections).slice().sort().join('_');
}

export function buildOpenWeatherExclude(sections?: WeatherBrokerSection[]): string {
  const requested = new Set(normalizeSections(sections));
  return ONECALL_EXCLUDE_ORDER
    .filter((section) => section === 'minutely' || !requested.has(section))
    .join(',');
}

export function buildWeatherBucket(
  coordinate: WeatherCoordinate,
  bucketSizeDegrees = DEFAULT_BUCKET_SIZE_DEGREES,
): { key: string; normalizedCoordinate: WeatherCoordinate } {
  const lat = roundToBucket(coordinate.lat, bucketSizeDegrees);
  const lng = roundToBucket(coordinate.lng, bucketSizeDegrees);
  const normalizedCoordinate: WeatherCoordinate = { lat, lng };
  if (coordinate.label) normalizedCoordinate.label = coordinate.label;
  if (coordinate.accuracyM != null) normalizedCoordinate.accuracyM = coordinate.accuracyM;
  if (coordinate.timestamp != null) normalizedCoordinate.timestamp = coordinate.timestamp;
  return {
    key: `${formatBucketCoord(lat)}_${formatBucketCoord(lng)}`,
    normalizedCoordinate,
  };
}

export function getWeatherBrokerTtlMs(useCase: WeatherBrokerUseCase = 'default'): number {
  switch (useCase) {
    case 'active_navigation':
      return 10 * 60 * 1000;
    case 'explore_list':
      return 45 * 60 * 1000;
    case 'route_planning':
      return 30 * 60 * 1000;
    case 'weather_alerts':
      return 10 * 60 * 1000;
    case 'offline_packet':
      return Number.POSITIVE_INFINITY;
    default:
      return 30 * 60 * 1000;
  }
}

function hasUsableWaypoint(waypoint: WaypointWeather | null | undefined): boolean {
  return Boolean(
    waypoint &&
    !waypoint.error &&
    (
      waypoint.current ||
      (waypoint.hourly?.length ?? 0) > 0 ||
      (waypoint.daily?.length ?? 0) > 0 ||
      (waypoint.forecast?.length ?? 0) > 0 ||
      (waypoint.alerts?.length ?? 0) > 0
    ),
  );
}

function hasUsableResult(result: WeatherFetchResult | null | undefined): boolean {
  return Boolean(result?.data?.results?.some(hasUsableWaypoint));
}

function cloneWaypointForSource(
  waypoint: WaypointWeather | null | undefined,
  sourceCoordinate: WeatherCoordinate,
): WaypointWeather {
  return {
    lat: sourceCoordinate.lat,
    lng: sourceCoordinate.lng,
    label: sourceCoordinate.label ?? waypoint?.label ?? null,
    error: waypoint?.error ?? null,
    current: waypoint?.current ?? null,
    hourly: waypoint?.hourly ?? [],
    daily: waypoint?.daily ?? [],
    forecast: waypoint?.forecast ?? waypoint?.daily ?? [],
    alerts: waypoint?.alerts ?? [],
    trail_conditions: waypoint?.trail_conditions ?? null,
  };
}

function createFallbackWeatherResult(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric',
  nowMs: number,
  error: string,
): WeatherFetchResult {
  return {
    data: {
      results: coordinates.map((coordinate) => ({
        lat: coordinate.lat,
        lng: coordinate.lng,
        label: coordinate.label ?? null,
        error,
        current: null,
        hourly: [],
        daily: [],
        forecast: [],
        alerts: [],
        trail_conditions: null,
      })),
      fetched_at: new Date(nowMs).toISOString(),
      units,
      provider: 'openweather',
      errors: [{ status: null, code: 'weather_broker_fallback', message: error }],
    },
    source: 'fallback',
    cachedAt: null,
    error,
  };
}

function isRateLimited(result: WeatherFetchResult): boolean {
  const lowerError = String(result.error ?? '').toLowerCase();
  if (lowerError.includes('429') || lowerError.includes('rate limit')) return true;
  return Boolean(
    result.data?.errors?.some((error) =>
      error.status === 429 ||
      String(error.code ?? '').toLowerCase().includes('rate') ||
      String(error.message ?? '').toLowerCase().includes('too many'),
    ) ||
    result.data?.results?.some((waypoint) => {
      const message = String(waypoint.error ?? '').toLowerCase();
      return message.includes('429') || message.includes('rate limit') || message.includes('too many');
    }),
  );
}

function defaultScheduler(refresh: () => Promise<void>): void {
  setTimeout(() => {
    refresh().catch((error) => {
      ecsLog.warn('WEATHER', 'weather_broker_background_refresh_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, 0);
}

async function defaultProviderFetch(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric',
  forceRefresh: boolean,
  context: WeatherBrokerProviderContext,
): Promise<WeatherFetchResult> {
  const { fetchWeatherWithStatus } = await import('./weatherStore');
  return fetchWeatherWithStatus(coordinates, units, forceRefresh, context);
}

async function defaultCachedFetch(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric',
): Promise<WeatherFetchResult | null> {
  const { getCachedWeatherResult } = await import('./weatherStore');
  return getCachedWeatherResult(coordinates, units, { allowStale: true });
}

function getFetchSource(outcomes: BucketFetchOutcome[]): WeatherFetchResult['source'] {
  if (outcomes.some((outcome) => outcome.result.source === 'live')) return 'live';
  if (outcomes.some((outcome) => outcome.result.source === 'fallback')) return 'fallback';
  if (outcomes.some((outcome) => outcome.stale || outcome.result.source === 'cache_stale')) return 'cache_stale';
  return 'cache_fresh';
}

function earliestMs(values: number[]): number {
  return values.reduce((min, value) => Math.min(min, value), values[0] ?? Date.now());
}

function latestMs(values: number[]): number {
  return values.reduce((max, value) => Math.max(max, value), values[0] ?? Date.now());
}

export function createWeatherBroker(config: WeatherBrokerConfig = {}) {
  const bucketSizeDegrees = config.bucketSizeDegrees ?? DEFAULT_BUCKET_SIZE_DEGREES;
  const sameBucketThrottleMs = config.sameBucketThrottleMs ?? DEFAULT_SAME_BUCKET_THROTTLE_MS;
  const nearbyNavigationThrottleMs = config.nearbyNavigationThrottleMs ?? sameBucketThrottleMs;
  const rateLimitCooldownMs = config.rateLimitCooldownMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  const providerFetch = config.providerFetch ?? defaultProviderFetch;
  const cachedFetch = config.cachedFetch ?? defaultCachedFetch;
  const scheduleBackgroundRefresh = config.scheduleBackgroundRefresh ?? defaultScheduler;
  const nowMs = config.nowMs ?? (() => Date.now());
  const isOnline = config.isOnline ?? (() => connectivity.isOnline());
  const dailyBudget = config.dailyBudget ?? readEnvNumber('EXPO_PUBLIC_ECS_OPENWEATHER_DAILY_BUDGET', DEFAULT_DAILY_BUDGET);
  const sessionBudget = config.sessionBudget ?? readEnvNumber('EXPO_PUBLIC_ECS_OPENWEATHER_SESSION_BUDGET', DEFAULT_SESSION_BUDGET);

  const cache = new Map<string, WeatherBrokerCacheEntry>();
  const inFlight = new Map<string, Promise<BucketFetchOutcome>>();
  const lastProviderAttemptAt = new Map<string, number>();
  let currentDayKey = dayKey(nowMs());
  let dailyCalls = 0;
  let sessionCalls = 0;
  let cooldownUntilMs = 0;

  function resetDayIfNeeded(now: number): void {
    const nextDayKey = dayKey(now);
    if (nextDayKey !== currentDayKey) {
      currentDayKey = nextDayKey;
      dailyCalls = 0;
    }
  }

  function budgetRemaining(now: number): number {
    resetDayIfNeeded(now);
    return Math.max(0, dailyBudget - dailyCalls);
  }

  function sessionRemaining(): number {
    return Math.max(0, sessionBudget - sessionCalls);
  }

  function canSpendProviderCall(now: number): boolean {
    resetDayIfNeeded(now);
    return budgetRemaining(now) > 0 && sessionRemaining() > 0;
  }

  function spendProviderCall(now: number): void {
    resetDayIfNeeded(now);
    dailyCalls += 1;
    sessionCalls += 1;
  }

  function cacheKey(
    bucketKey: string,
    units: 'imperial' | 'metric',
    sections: WeatherBrokerSection[],
  ): string {
    return [
      'provider=openweather',
      'product=onecall3',
      `bucket=${bucketKey}`,
      `sections=${sectionsKey(sections)}`,
      `units=${units}`,
      'lang=en',
    ].join('|');
  }

  function findCompatibleCacheEntry(
    bucketKey: string,
    units: 'imperial' | 'metric',
    sections: WeatherBrokerSection[],
  ): WeatherBrokerCacheEntry | null {
    return Array.from(cache.values()).find((entry) =>
      entry.bucketKey === bucketKey &&
      entry.result.data.units === units &&
      sections.every((section) => entry.sections.includes(section)),
    ) ?? null;
  }

  function costMetadata(
    outcome: Pick<BucketFetchOutcome, 'providerCallsAttempted' | 'providerCallsAvoided' | 'budgetDenied' | 'rateLimited' | 'cooldownActive' | 'offline' | 'sections' | 'exclude'>,
    now: number,
  ): WeatherBrokerCostMetadata {
    return {
      providerCallsAttempted: outcome.providerCallsAttempted,
      providerCallsAvoided: outcome.providerCallsAvoided,
      budgetDenied: outcome.budgetDenied,
      budgetRemaining: budgetRemaining(now),
      sessionRemaining: sessionRemaining(),
      rateLimited: outcome.rateLimited,
      cooldownActive: outcome.cooldownActive,
      offline: outcome.offline,
      sections: outcome.sections,
      exclude: outcome.exclude,
    };
  }

  function outcomeFromCache(
    entry: WeatherBrokerCacheEntry,
    now: number,
    options: { stale: boolean; providerCallsAvoided?: number; offline?: boolean; cooldownActive?: boolean; budgetDenied?: boolean },
  ): BucketFetchOutcome {
    return {
      bucketKey: entry.bucketKey,
      normalizedCoordinate: entry.normalizedCoordinate,
      result: {
        ...entry.result,
        source: options.stale ? 'cache_stale' : 'cache_fresh',
        cachedAt: entry.requestedAtMs,
      },
      requestedAtMs: entry.requestedAtMs,
      expiresAtMs: entry.expiresAtMs,
      stale: options.stale,
      cacheHit: true,
      providerCallsAttempted: 0,
      providerCallsAvoided: options.providerCallsAvoided ?? 1,
      budgetDenied: options.budgetDenied === true,
      rateLimited: false,
      cooldownActive: options.cooldownActive === true,
      offline: options.offline === true,
      sections: entry.sections,
      exclude: entry.exclude,
    };
  }

  function scheduleRefreshIfAllowed(
    key: string,
    coordinate: WeatherCoordinate,
    units: 'imperial' | 'metric',
    fetchOptions: Required<Pick<WeatherBrokerFetchOptions, 'useCase' | 'sections'>> & WeatherBrokerFetchOptions,
  ): void {
    const now = nowMs();
    if (!isOnline()) return;
    if (cooldownUntilMs > now) return;
    if (!canSpendProviderCall(now)) return;
    const lastAttempt = lastProviderAttemptAt.get(key) ?? 0;
    const throttle = fetchOptions.useCase === 'active_navigation' ? nearbyNavigationThrottleMs : sameBucketThrottleMs;
    if (now - lastAttempt < throttle) return;
    scheduleBackgroundRefresh(async () => {
      await fetchBucket(coordinate, units, { ...fetchOptions, forceRefresh: true, debugForceRefresh: true }, true);
    });
  }

  async function providerFetchBucket(
    key: string,
    bucketKey: string,
    coordinate: WeatherCoordinate,
    units: 'imperial' | 'metric',
    options: Required<Pick<WeatherBrokerFetchOptions, 'useCase' | 'sections'>> & WeatherBrokerFetchOptions,
    background: boolean,
  ): Promise<BucketFetchOutcome> {
    const now = options.nowMs ?? nowMs();
    const ttlMs = getWeatherBrokerTtlMs(options.useCase);
    const exclude = buildOpenWeatherExclude(options.sections);
    const cooldownActive = cooldownUntilMs > now;
    if (cooldownActive) {
      const cached = cache.get(key);
      if (cached) return outcomeFromCache(cached, now, { stale: true, cooldownActive: true });
      return fallbackOutcome(bucketKey, coordinate, units, now, options.sections, exclude, 'OpenWeather cooldown active', { cooldownActive: true });
    }
    if (!isOnline()) {
      const cached = cache.get(key);
      if (cached) return outcomeFromCache(cached, now, { stale: true, offline: true });
      return fallbackOutcome(bucketKey, coordinate, units, now, options.sections, exclude, 'Weather unavailable while offline', { offline: true });
    }
    if (!canSpendProviderCall(now)) {
      const cached = cache.get(key);
      if (cached) return outcomeFromCache(cached, now, { stale: true, budgetDenied: true });
      return fallbackOutcome(bucketKey, coordinate, units, now, options.sections, exclude, 'OpenWeather budget exhausted', { budgetDenied: true });
    }

    const lastAttempt = lastProviderAttemptAt.get(key) ?? 0;
    if (!options.debugForceRefresh && !options.forceRefresh && now - lastAttempt < sameBucketThrottleMs) {
      const cached = cache.get(key);
      if (cached) return outcomeFromCache(cached, now, { stale: true });
    }

    lastProviderAttemptAt.set(key, now);
    spendProviderCall(now);
    const result = await providerFetch([coordinate], units, true, {
      sourceType: options.sourceType ?? null,
      routeSessionId: options.routeSessionId ?? null,
      providerExclude: exclude,
      brokerBucketKey: bucketKey,
      brokerUseCase: options.useCase,
      brokerSections: options.sections,
    });
    const rateLimited = isRateLimited(result);
    if (rateLimited) {
      cooldownUntilMs = now + rateLimitCooldownMs;
      const cached = cache.get(key);
      if (cached) return {
        ...outcomeFromCache(cached, now, { stale: true, cooldownActive: true }),
        rateLimited: true,
        providerCallsAttempted: 1,
      };
      return {
        ...fallbackOutcome(bucketKey, coordinate, units, now, options.sections, exclude, 'OpenWeather rate limit', {
          cooldownActive: true,
          rateLimited: true,
        }),
        providerCallsAttempted: 1,
      };
    }

    const expiresAtMs = Number.isFinite(ttlMs) ? now + ttlMs : Number.MAX_SAFE_INTEGER;
    const resultToCache = {
      ...result,
      source: hasUsableResult(result) ? 'live' as const : result.source,
      cachedAt: now,
    };
    cache.set(key, {
      key,
      bucketKey,
      normalizedCoordinate: coordinate,
      result: resultToCache,
      requestedAtMs: now,
      expiresAtMs,
      sections: options.sections,
      exclude,
    });

    return {
      bucketKey,
      normalizedCoordinate: coordinate,
      result: resultToCache,
      requestedAtMs: now,
      expiresAtMs,
      stale: false,
      cacheHit: false,
      providerCallsAttempted: 1,
      providerCallsAvoided: background ? 0 : 0,
      budgetDenied: false,
      rateLimited,
      cooldownActive: false,
      offline: false,
      sections: options.sections,
      exclude,
    };
  }

  function fallbackOutcome(
    bucketKey: string,
    coordinate: WeatherCoordinate,
    units: 'imperial' | 'metric',
    now: number,
    sections: WeatherBrokerSection[],
    exclude: string,
    error: string,
    flags: Partial<Pick<BucketFetchOutcome, 'budgetDenied' | 'cooldownActive' | 'offline' | 'rateLimited'>>,
  ): BucketFetchOutcome {
    return {
      bucketKey,
      normalizedCoordinate: coordinate,
      result: createFallbackWeatherResult([coordinate], units, now, error),
      requestedAtMs: now,
      expiresAtMs: now,
      stale: true,
      cacheHit: false,
      providerCallsAttempted: 0,
      providerCallsAvoided: 0,
      budgetDenied: flags.budgetDenied === true,
      rateLimited: flags.rateLimited === true,
      cooldownActive: flags.cooldownActive === true,
      offline: flags.offline === true,
      sections,
      exclude,
    };
  }

  async function fetchBucket(
    sourceCoordinate: WeatherCoordinate,
    units: 'imperial' | 'metric',
    options: Required<Pick<WeatherBrokerFetchOptions, 'useCase' | 'sections'>> & WeatherBrokerFetchOptions,
    background = false,
  ): Promise<BucketFetchOutcome> {
    const now = options.nowMs ?? nowMs();
    const bucket = buildWeatherBucket(sourceCoordinate, bucketSizeDegrees);
    const key = cacheKey(bucket.key, units, options.sections);
    const cached = cache.get(key) ?? findCompatibleCacheEntry(bucket.key, units, options.sections);
    if (!options.forceRefresh && cached) {
      if (cooldownUntilMs > now) return outcomeFromCache(cached, now, { stale: true, cooldownActive: true });
      if (!isOnline()) return outcomeFromCache(cached, now, { stale: true, offline: true });
      const stale = cached.expiresAtMs <= now;
      if (!stale) return outcomeFromCache(cached, now, { stale: false });
      scheduleRefreshIfAllowed(key, bucket.normalizedCoordinate, units, options);
      return outcomeFromCache(cached, now, { stale: true });
    }

    if (!options.forceRefresh) {
      const persisted = await cachedFetch([bucket.normalizedCoordinate], units);
      if (persisted && hasUsableResult(persisted)) {
        const ttlMs = getWeatherBrokerTtlMs(options.useCase);
        const cachedAt = persisted.cachedAt ?? now;
        const entry: WeatherBrokerCacheEntry = {
          key,
          bucketKey: bucket.key,
          normalizedCoordinate: bucket.normalizedCoordinate,
          result: persisted,
          requestedAtMs: cachedAt,
          expiresAtMs: Number.isFinite(ttlMs) ? cachedAt + ttlMs : Number.MAX_SAFE_INTEGER,
          sections: options.sections,
          exclude: buildOpenWeatherExclude(options.sections),
        };
        cache.set(key, entry);
        const stale = entry.expiresAtMs <= now;
        if (stale) scheduleRefreshIfAllowed(key, bucket.normalizedCoordinate, units, options);
        return outcomeFromCache(entry, now, { stale });
      }
    }

    const existing = inFlight.get(key);
    if (existing) return existing;

    const request = providerFetchBucket(key, bucket.key, bucket.normalizedCoordinate, units, options, background)
      .finally(() => {
        if (inFlight.get(key) === request) inFlight.delete(key);
      });
    inFlight.set(key, request);
    return request;
  }

  async function fetchWeather(
    coordinates: WeatherCoordinate[],
    units: 'imperial' | 'metric' = 'imperial',
    options: WeatherBrokerFetchOptions = {},
  ): Promise<BrokeredWeatherFetchResult> {
    const now = options.nowMs ?? nowMs();
    const useCase = options.useCase ?? 'default';
    const sections = normalizeSections(options.sections);
    const fetchOptions = {
      ...options,
      useCase,
      sections,
    };
    if (coordinates.length === 0) {
      const fallback = createFallbackWeatherResult([], units, now, 'No weather coordinates requested');
      return attachBrokerSummary(fallback, [], [], now, sections, buildOpenWeatherExclude(sections));
    }

    const buckets = coordinates.map((coordinate) => buildWeatherBucket(coordinate, bucketSizeDegrees));
    const uniqueBucketIndexes = new Map<string, number>();
    buckets.forEach((bucket, index) => {
      const key = cacheKey(bucket.key, units, sections);
      if (!uniqueBucketIndexes.has(key)) uniqueBucketIndexes.set(key, index);
    });

    const outcomesByCacheKey = new Map<string, BucketFetchOutcome>();
    await Promise.all(Array.from(uniqueBucketIndexes.entries()).map(async ([key, index]) => {
      outcomesByCacheKey.set(key, await fetchBucket(coordinates[index], units, fetchOptions));
    }));

    const outcomes = buckets.map((bucket) => outcomesByCacheKey.get(cacheKey(bucket.key, units, sections)))
      .filter((outcome): outcome is BucketFetchOutcome => Boolean(outcome));
    const waypoints = outcomes.map((outcome, index) =>
      cloneWaypointForSource(outcome.result.data.results[0], coordinates[index]),
    );
    const source = getFetchSource(outcomes);
    const error = outcomes.map((outcome) => outcome.result.error).find(Boolean) ?? null;
    const result: WeatherFetchResult = {
      data: {
        results: waypoints,
        fetched_at: new Date(earliestMs(outcomes.map((outcome) => outcome.requestedAtMs))).toISOString(),
        units,
        provider: 'openweather',
        errors: outcomes.flatMap((outcome) => outcome.result.data.errors ?? []),
      },
      source,
      cachedAt: source === 'fallback' ? null : earliestMs(outcomes.map((outcome) => outcome.requestedAtMs)),
      error,
    };
    return attachBrokerSummary(
      result,
      coordinates,
      outcomes,
      now,
      sections,
      buildOpenWeatherExclude(sections),
      Math.max(0, coordinates.length - uniqueBucketIndexes.size),
    );
  }

  function attachBrokerSummary(
    result: WeatherFetchResult,
    coordinates: WeatherCoordinate[],
    outcomes: BucketFetchOutcome[],
    now: number,
    sections: WeatherBrokerSection[],
    exclude: string,
    duplicateAvoided = 0,
  ): BrokeredWeatherFetchResult {
    const firstOutcome = outcomes[0];
    const uniqueOutcomes = Array.from(new Map(outcomes.map((outcome) => [outcome.bucketKey, outcome])).values());
    const firstCoordinate = coordinates[0] ?? firstOutcome?.normalizedCoordinate ?? { lat: 0, lng: 0 };
    const requestedAtMs = outcomes.length ? earliestMs(outcomes.map((outcome) => outcome.requestedAtMs)) : now;
    const expiresAtMs = outcomes.length ? latestMs(outcomes.map((outcome) => outcome.expiresAtMs)) : now;
    const aggregateOutcome = {
      providerCallsAttempted: uniqueOutcomes.reduce((sum, outcome) => sum + outcome.providerCallsAttempted, 0),
      providerCallsAvoided: uniqueOutcomes.reduce((sum, outcome) => sum + outcome.providerCallsAvoided, duplicateAvoided),
      budgetDenied: uniqueOutcomes.some((outcome) => outcome.budgetDenied),
      rateLimited: uniqueOutcomes.some((outcome) => outcome.rateLimited),
      cooldownActive: uniqueOutcomes.some((outcome) => outcome.cooldownActive),
      offline: uniqueOutcomes.some((outcome) => outcome.offline),
      sections,
      exclude,
    };
    const entries = outcomes.map((outcome, index): EcsWeatherBrokerEntry => {
      const waypoint = outcome.result.data.results[0] ?? null;
      return {
        provider: 'openweather',
        product: 'onecall3',
        requestedAt: new Date(outcome.requestedAtMs).toISOString(),
        expiresAt: new Date(outcome.expiresAtMs).toISOString(),
        stale: outcome.stale,
        cacheHit: outcome.cacheHit,
        bucketKey: outcome.bucketKey,
        sourceCoordinate: coordinates[index] ?? outcome.normalizedCoordinate,
        normalizedCoordinate: outcome.normalizedCoordinate,
        current: waypoint?.current ?? null,
        hourly: waypoint?.hourly ?? [],
        daily: waypoint?.daily ?? waypoint?.forecast ?? [],
        alerts: waypoint?.alerts ?? [],
        providerCostMetadata: costMetadata(outcome, now),
      };
    });
    return {
      ...result,
      broker: {
        provider: 'openweather',
        product: 'onecall3',
        requestedAt: new Date(requestedAtMs).toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
        stale: outcomes.some((outcome) => outcome.stale),
        cacheHit: outcomes.length > 0 && outcomes.every((outcome) => outcome.cacheHit),
        bucketKey: firstOutcome?.bucketKey ?? 'none',
        bucketKeys: Array.from(new Set(outcomes.map((outcome) => outcome.bucketKey))),
        sourceCoordinate: firstCoordinate,
        normalizedCoordinate: firstOutcome?.normalizedCoordinate ?? firstCoordinate,
        entries,
        providerCostMetadata: costMetadata(aggregateOutcome, now),
      },
    };
  }

  return {
    fetchWeather,
    getBudgetSnapshot() {
      const now = nowMs();
      return {
        dayKey: currentDayKey,
        dailyBudget,
        dailyCalls,
        budgetRemaining: budgetRemaining(now),
        sessionBudget,
        sessionCalls,
        sessionRemaining: sessionRemaining(),
        cooldownUntilMs,
        cacheSize: cache.size,
        inFlightCount: inFlight.size,
      };
    },
    clear() {
      cache.clear();
      inFlight.clear();
      lastProviderAttemptAt.clear();
      cooldownUntilMs = 0;
      dailyCalls = 0;
      sessionCalls = 0;
      currentDayKey = dayKey(nowMs());
    },
  };
}

const defaultWeatherBroker = createWeatherBroker();

export async function fetchWeatherThroughBroker(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric' = 'imperial',
  forceRefresh = false,
  options: WeatherBrokerFetchOptions = {},
): Promise<BrokeredWeatherFetchResult> {
  return defaultWeatherBroker.fetchWeather(coordinates, units, {
    ...options,
    forceRefresh,
  });
}

export function getWeatherBrokerBudgetSnapshot() {
  return defaultWeatherBroker.getBudgetSnapshot();
}

export function clearWeatherBrokerForTests(): void {
  defaultWeatherBroker.clear();
}
