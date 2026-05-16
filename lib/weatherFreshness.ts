export type WeatherFreshness = 'fresh' | 'aging' | 'stale' | 'very_stale' | 'unknown' | 'missing';

export const WEATHER_CURRENT_FRESH_TTL_MS = 10 * 60 * 1000;
export const WEATHER_HOURLY_FRESH_TTL_MS = 30 * 60 * 1000;
export const WEATHER_DAILY_FRESH_TTL_MS = 2 * 60 * 60 * 1000;
export const WEATHER_FRESH_TTL_MS = WEATHER_CURRENT_FRESH_TTL_MS;
export const WEATHER_AGING_TTL_MS = WEATHER_HOURLY_FRESH_TTL_MS;
export const WEATHER_STALE_TTL_MS = WEATHER_DAILY_FRESH_TTL_MS;

export type WeatherFreshnessInput = {
  source?: 'live' | 'cache_fresh' | 'cache_stale' | 'fallback' | 'cache' | 'none' | null;
  fetchedAt?: string | number | null;
  fetched_at?: string | number | null;
  cachedAt?: string | number | null;
  updatedAt?: string | number | null;
  timestamp?: string | number | null;
  hasWeatherData?: boolean;
  now?: number;
  freshTtlMs?: number;
  agingTtlMs?: number;
  staleTtlMs?: number;
};

export function parseWeatherTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getWeatherFreshness(input: WeatherFreshnessInput): {
  freshness: WeatherFreshness;
  stale: boolean;
  ageMinutes: number | null;
  timestampMs: number | null;
} {
  const now = input.now ?? Date.now();
  const source = input.source ?? null;
  const timestampMs =
    parseWeatherTimestampMs(input.cachedAt) ??
    parseWeatherTimestampMs(input.fetchedAt) ??
    parseWeatherTimestampMs(input.fetched_at) ??
    parseWeatherTimestampMs(input.updatedAt) ??
    parseWeatherTimestampMs(input.timestamp);
  const hasWeatherData = input.hasWeatherData !== false;

  if (!hasWeatherData || source === 'fallback' || source === 'none') {
    return { freshness: 'missing', stale: true, ageMinutes: null, timestampMs };
  }

  if (timestampMs == null) {
    if (source === 'live' || source === 'cache_fresh') {
      return { freshness: 'fresh', stale: false, ageMinutes: null, timestampMs };
    }
    return { freshness: 'unknown', stale: false, ageMinutes: null, timestampMs };
  }

  const ageMs = Math.max(0, now - timestampMs);
  const ageMinutes = Math.round(ageMs / 60000);
  if (source === 'live' || source === 'cache_fresh') {
    const freshTtlMs = input.freshTtlMs ?? WEATHER_FRESH_TTL_MS;
    if (ageMs <= freshTtlMs) {
      return { freshness: 'fresh', stale: false, ageMinutes, timestampMs };
    }
  }

  const agingTtlMs = input.agingTtlMs ?? WEATHER_AGING_TTL_MS;
  const staleTtlMs = input.staleTtlMs ?? WEATHER_STALE_TTL_MS;
  if (ageMs <= agingTtlMs) return { freshness: 'aging', stale: false, ageMinutes, timestampMs };
  if (ageMs <= staleTtlMs) return { freshness: 'stale', stale: true, ageMinutes, timestampMs };
  return { freshness: 'very_stale', stale: true, ageMinutes, timestampMs };
}
