/**
 * Weather Intelligence Store
 *
 * Manages weather data fetching, caching, and offline support.
 * Uses the get-weather Supabase Edge Function to fetch data from OpenWeather API.
 */
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { connectivity } from './connectivity';
import { reportDegradedState, reportRecoverableFailure } from './ecsIssueIntelligence';
import { setIssueRuntimeWeatherStatus } from './ecsIssueRuntime';
import type {
  WeatherCoordinate,
  WeatherResponse,
  WaypointWeather,
  CachedWeather,
  TrailFactorStatus,
  TrailOverall,
} from './weatherTypes';

// ── Cache Configuration ──────────────────────────────────────
const CACHE_KEY_PREFIX = 'ecs_weather_';
const CACHE_DURATION_MS = 30 * 60 * 1000;
const STALE_WARNING_MS = 2 * 60 * 60 * 1000;
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 2000;
const EDGE_FUNCTION_TIMEOUT_MS = 12000;

const memoryCache = new Map<string, CachedWeather>();

function coordKey(coords: WeatherCoordinate[]): string {
  return coords.map(c => `${c.lat.toFixed(3)}_${c.lng.toFixed(3)}`).join('|');
}

function singleCoordKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)}_${lon.toFixed(3)}`;
}

function isApiKeyError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('missing openweather_api_key') ||
    lower.includes('openweather_api_key') ||
    lower.includes('invalid api key') ||
    lower.includes('authentication failed') ||
    lower.includes('401')
  );
}

function isNonRetryableError(message: string): boolean {
  return (
    isApiKeyError(message) ||
    message.includes('Invalid') ||
    message.includes('400') ||
    message.includes('not configured')
  );
}

function readLocalStorage(key: string): CachedWeather | null {
  try {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CachedWeather;
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, cached: CachedWeather): void {
  try {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
    localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(cached));
  } catch {}
}

function getCached(key: string, ignoreExpiry = false): CachedWeather | null {
  let cached = memoryCache.get(key) || null;

  if (!cached) {
    cached = readLocalStorage(key);
    if (cached) memoryCache.set(key, cached);
  }

  if (!cached) return null;

  if (!ignoreExpiry && Date.now() - cached.cachedAt > CACHE_DURATION_MS) {
    return null;
  }

  return cached;
}

function getStaleCached(key: string): CachedWeather | null {
  return getCached(key, true);
}

function setCache(key: string, data: WeatherResponse): void {
  const cached: CachedWeather = {
    data,
    cachedAt: Date.now(),
    coordKey: key,
  };
  memoryCache.set(key, cached);
  writeLocalStorage(key, cached);
}

export function isWeatherStale(cachedAt: number): boolean {
  return Date.now() - cachedAt > CACHE_DURATION_MS;
}

export function getWeatherAge(cachedAt: number): string {
  const ageMs = Date.now() - cachedAt;
  const mins = Math.floor(ageMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

export function getWeatherStaleness(cachedAt: number): 'fresh' | 'aging' | 'stale' | 'very_stale' {
  const ageMs = Date.now() - cachedAt;
  if (ageMs <= CACHE_DURATION_MS) return 'fresh';
  if (ageMs <= STALE_WARNING_MS) return 'aging';
  if (ageMs <= MAX_CACHE_AGE_MS) return 'stale';
  return 'very_stale';
}

function toNumber(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapSeverity(raw: any): 'advisory' | 'warning' | 'extreme' {
  const value = String(raw ?? '').toLowerCase();
  if (value.includes('extreme')) return 'extreme';
  if (value.includes('warning')) return 'warning';
  return 'advisory';
}

function inferTrailConditionsFromCurrent(current: any) {
  const wind = toNumber(current?.wind_speed);
  const visibility = toNumber(current?.visibility);
  const weatherMain = String(current?.weather_main ?? '').toLowerCase();
  const temp = toNumber(current?.temp);

  const factors: Array<{ factor: string; status: TrailFactorStatus; detail: string }> = [];

  let overall: TrailOverall = 'good';

  const bumpOverall = (next: TrailOverall) => {
    const order: TrailOverall[] = ['good', 'fair', 'poor', 'hazardous'];
    if (order.indexOf(next) > order.indexOf(overall)) overall = next;
  };

  if (wind != null) {
    let status: TrailFactorStatus = 'good';
    let detail = `Winds ${Math.round(wind)} mph are within normal trail travel range.`;

    if (wind >= 40) {
      status = 'danger';
      detail = `Winds ${Math.round(wind)} mph may create hazardous control and exposure conditions.`;
      bumpOverall('hazardous');
    } else if (wind >= 25) {
      status = 'warning';
      detail = `Winds ${Math.round(wind)} mph may impact stability and visibility on exposed routes.`;
      bumpOverall('poor');
    } else if (wind >= 15) {
      status = 'caution';
      detail = `Winds ${Math.round(wind)} mph may affect comfort and dust conditions.`;
      bumpOverall('fair');
    }

    factors.push({ factor: 'Wind', status, detail });
  }

  if (visibility != null) {
    let status: TrailFactorStatus = 'good';
    let detail = `Visibility is ${Math.round(visibility / 1000)} km and should support normal trail travel.`;

    if (visibility <= 500) {
      status = 'danger';
      detail = `Visibility is critically low and may make route finding unsafe.`;
      bumpOverall('hazardous');
    } else if (visibility <= 1600) {
      status = 'warning';
      detail = `Visibility is reduced and may slow progress or conceal hazards.`;
      bumpOverall('poor');
    } else if (visibility <= 5000) {
      status = 'caution';
      detail = `Visibility is moderately reduced. Increase spacing and scan distance.`;
      bumpOverall('fair');
    }

    factors.push({ factor: 'Visibility', status, detail });
  }

  if (weatherMain) {
    let status: TrailFactorStatus = 'good';
    let detail = `Surface conditions appear stable.`;

    if (weatherMain.includes('snow') || weatherMain.includes('thunderstorm')) {
      status = 'warning';
      detail = `Current weather (${weatherMain}) may degrade traction and route safety.`;
      bumpOverall('poor');
    } else if (weatherMain.includes('rain') || weatherMain.includes('drizzle')) {
      status = 'caution';
      detail = `Current weather (${weatherMain}) may soften surfaces and increase slick sections.`;
      bumpOverall('fair');
    } else if (weatherMain.includes('fog') || weatherMain.includes('mist') || weatherMain.includes('haze')) {
      status = 'warning';
      detail = `Current weather (${weatherMain}) may conceal terrain changes and obstacles.`;
      bumpOverall('poor');
    }

    factors.push({ factor: 'Surface', status, detail });
  }

  if (temp != null) {
    let status: TrailFactorStatus = 'good';
    let detail = `Ambient temperature is within a normal operating range.`;

    if (temp >= 100 || temp <= 20) {
      status = 'warning';
      detail = `Temperature ${Math.round(temp)}° may stress crew, traction, or equipment performance.`;
      bumpOverall('poor');
    } else if (temp >= 90 || temp <= 32) {
      status = 'caution';
      detail = `Temperature ${Math.round(temp)}° may affect comfort, traction, or battery performance.`;
      bumpOverall('fair');
    }

    factors.push({ factor: 'Temperature', status, detail });
  }

  if (factors.length === 0) {
    factors.push({
      factor: 'Data Availability',
      status: 'caution',
      detail: 'Limited live weather detail was available. Use visual assessment on scene.',
    });
    overall = 'fair';
  }

  return { overall, factors };
}

function normalizeForecastList(forecast: any[]): any[] {
  if (!Array.isArray(forecast)) return [];

  return forecast.map((f: any, idx: number) => {
    const rawDate = typeof f?.date === 'string'
      ? f.date
      : typeof f?.dt_txt === 'string'
        ? f.dt_txt.slice(0, 10)
        : new Date(Date.now() + idx * 86400000).toISOString().slice(0, 10);

    return {
      date: rawDate,
      temp_min: toNumber(f?.temp_min ?? f?.main?.temp_min ?? f?.temperature_min),
      temp_max: toNumber(f?.temp_max ?? f?.main?.temp_max ?? f?.temperature_max),
      humidity: toNumber(f?.humidity ?? f?.main?.humidity),
      pressure: toNumber(f?.pressure ?? f?.main?.pressure),
      wind_max: toNumber(f?.wind_max ?? f?.wind?.speed) ?? 0,
      wind_gust_max: toNumber(f?.wind_gust_max ?? f?.wind?.gust) ?? 0,
      pop: Math.round((toNumber(f?.pop) ?? 0) * ((toNumber(f?.pop) ?? 0) <= 1 ? 100 : 1)),
      rain_total: toNumber(f?.rain_total ?? f?.rain?.['3h'] ?? f?.rain?.['1h']) ?? 0,
      snow_total: toNumber(f?.snow_total ?? f?.snow?.['3h'] ?? f?.snow?.['1h']) ?? 0,
      weather_id: toNumber(f?.weather_id ?? f?.weather?.[0]?.id),
      weather_main: f?.weather_main ?? f?.weather?.[0]?.main ?? 'Unknown',
      weather_description: f?.weather_description ?? f?.weather?.[0]?.description ?? 'Unavailable',
      weather_icon: f?.weather_icon ?? f?.weather?.[0]?.icon ?? '01d',
    };
  });
}

function normalizeCurrent(current: any, label?: string | null) {
  if (!current) {
    return {
      temp: null,
      feels_like: null,
      temp_min: null,
      temp_max: null,
      humidity: null,
      pressure: null,
      visibility: null,
      wind_speed: null,
      wind_deg: null,
      wind_gust: null,
      clouds: null,
      weather_id: null,
      weather_main: null,
      weather_description: null,
      weather_icon: null,
      rain_1h: null,
      rain_3h: null,
      snow_1h: null,
      snow_3h: null,
      sunrise: null,
      sunset: null,
      location_name: label ?? null,
      dt: null,
    };
  }

  return {
    temp: toNumber(current?.temp),
    feels_like: toNumber(current?.feels_like),
    temp_min: toNumber(current?.temp_min),
    temp_max: toNumber(current?.temp_max),
    humidity: toNumber(current?.humidity),
    pressure: toNumber(current?.pressure),
    visibility: toNumber(current?.visibility),
    wind_speed: toNumber(current?.wind_speed),
    wind_deg: toNumber(current?.wind_deg),
    wind_gust: toNumber(current?.wind_gust),
    clouds: toNumber(current?.clouds),
    weather_id: toNumber(current?.weather_id),
    weather_main: current?.weather_main ?? null,
    weather_description: current?.weather_description ?? null,
    weather_icon: current?.weather_icon ?? null,
    rain_1h: toNumber(current?.rain_1h),
    rain_3h: toNumber(current?.rain_3h),
    snow_1h: toNumber(current?.snow_1h),
    snow_3h: toNumber(current?.snow_3h),
    sunrise: toNumber(current?.sunrise),
    sunset: toNumber(current?.sunset),
    location_name: current?.location_name ?? label ?? null,
    dt: toNumber(current?.dt),
  };
}

function normalizeResult(raw: any, fallbackLabel?: string | null): WaypointWeather {
  const current = normalizeCurrent(raw?.current, raw?.label ?? fallbackLabel ?? null);
  const forecast = normalizeForecastList(raw?.forecast ?? []);
  const alerts = Array.isArray(raw?.alerts)
    ? raw.alerts.map((a: any) => ({
        severity: mapSeverity(a?.severity),
        title: a?.title ?? 'Weather Notice',
        description: a?.description ?? 'No description available.',
        type: a?.type ?? 'general',
        effective: typeof a?.effective === 'string' ? a.effective : null,
        expires: typeof a?.expires === 'string' ? a.expires : null,
      }))
    : [];

  const trailConditions = raw?.trail_conditions?.overall && Array.isArray(raw?.trail_conditions?.factors)
    ? {
        overall: raw.trail_conditions.overall,
        factors: raw.trail_conditions.factors.map((f: any) => ({
          factor: f?.factor ?? 'Unknown Factor',
          status: (f?.status ?? 'caution') as TrailFactorStatus,
          detail: f?.detail ?? 'No detail available.',
        })),
      }
    : inferTrailConditionsFromCurrent(current);

  return {
    lat: toNumber(raw?.lat) ?? 0,
    lng: toNumber(raw?.lng) ?? 0,
    label: raw?.label ?? fallbackLabel ?? null,
    error: raw?.error ?? null,
    current,
    forecast,
    alerts,
    trail_conditions: trailConditions,
  };
}

async function invokeWeatherEdgeFunction(body: Record<string, unknown>): Promise<{ data: any; error: any }> {
  return await Promise.race([
    supabase.functions.invoke('get-weather', { body }),
    new Promise<{ data: null; error: { message: string } }>(resolve => {
      setTimeout(() => {
        resolve({
          data: null,
          error: { message: 'Weather request timed out' },
        });
      }, EDGE_FUNCTION_TIMEOUT_MS);
    }),
  ]);
}

function normalizeWeatherResponse(
  data: any,
  requestedCoordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric',
): WeatherResponse {
  const rawResults = Array.isArray(data?.results) ? data.results : [];

  const results = requestedCoordinates.map((coord, idx) => {
    const raw = rawResults[idx] ?? {};
    return normalizeResult(raw, coord.label ?? null);
  });

  return {
    results,
    fetched_at: typeof data?.fetched_at === 'string' ? data.fetched_at : new Date().toISOString(),
    units: data?.units === 'metric' ? 'metric' : units,
  };
}

function generateFallbackWeather(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric',
): WeatherResponse {
  const results: WaypointWeather[] = coordinates.map(coord => ({
    lat: coord.lat,
    lng: coord.lng,
    label: coord.label || 'Unknown Location',
    error: 'Weather data unavailable — offline with no cached data',
    current: {
      temp: null,
      feels_like: null,
      temp_min: null,
      temp_max: null,
      humidity: null,
      pressure: null,
      visibility: null,
      wind_speed: null,
      wind_deg: null,
      wind_gust: null,
      clouds: null,
      weather_id: null,
      weather_main: null,
      weather_description: null,
      weather_icon: null,
      rain_1h: null,
      rain_3h: null,
      snow_1h: null,
      snow_3h: null,
      sunrise: null,
      sunset: null,
      location_name: coord.label || null,
      dt: null,
    },
    forecast: [],
    alerts: [],
    trail_conditions: {
      overall: 'fair',
      factors: [
        {
          factor: 'Data Availability',
          status: 'caution',
          detail: 'Weather data unavailable. Unable to assess current trail conditions. Exercise caution and rely on visual assessment.',
        },
      ],
    },
  }));

  return {
    results,
    fetched_at: new Date().toISOString(),
    units,
  };
}

async function callWeatherEdgeFunction(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric',
  retryCount = 1,
): Promise<WeatherResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }

      const { data, error } = await invokeWeatherEdgeFunction({ coordinates, units });

      if (error) {
        const errMsg = typeof error === 'string' ? error : error?.message || 'Edge function error';
        if (isNonRetryableError(errMsg)) throw new Error(errMsg);
        lastError = new Error(errMsg);
        continue;
      }

      if (!data) {
        lastError = new Error('Empty response from weather service');
        continue;
      }

      if (data.error && !data.results) {
        const errMsg = data.error + (data.details ? `: ${data.details}` : '');
        if (isNonRetryableError(errMsg)) throw new Error(errMsg);
        lastError = new Error(errMsg);
        continue;
      }

      if (!Array.isArray(data.results)) {
        lastError = new Error('Invalid response format from weather service');
        continue;
      }

      return normalizeWeatherResponse(data, coordinates, units);
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(err?.message || 'Unknown error');
      if (isNonRetryableError(lastError.message)) throw lastError;
    }
  }

  throw lastError || new Error('Failed to fetch weather after retries');
}

async function callSimpleWeatherEdgeFunction(
  lat: number,
  lon: number,
  units: 'imperial' | 'metric',
  retryCount = 1,
): Promise<WeatherResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }

      const { data, error } = await invokeWeatherEdgeFunction({ lat, lon, units });

      if (error) {
        const errMsg = typeof error === 'string' ? error : error?.message || 'Edge function error';
        if (isNonRetryableError(errMsg)) throw new Error(errMsg);
        lastError = new Error(errMsg);
        continue;
      }

      if (!data) {
        lastError = new Error('Empty response from weather service');
        continue;
      }

      if (data.error && !data.results) {
        const errMsg = data.error + (data.details ? `: ${data.details}` : '');
        if (isNonRetryableError(errMsg)) throw new Error(errMsg);
        lastError = new Error(errMsg);
        continue;
      }

      if (!Array.isArray(data.results)) {
        lastError = new Error('Invalid response format from weather service');
        continue;
      }

      return normalizeWeatherResponse(data, [{ lat, lng: lon, label: undefined }], units);
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(err?.message || 'Unknown error');
      if (isNonRetryableError(lastError.message)) throw lastError;
    }
  }

  throw lastError || new Error('Failed to fetch weather after retries');
}

export interface WeatherFetchResult {
  data: WeatherResponse;
  source: 'live' | 'cache_fresh' | 'cache_stale' | 'fallback';
  cachedAt: number | null;
  error: string | null;
}

export async function fetchWeatherWithStatus(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric' = 'imperial',
  forceRefresh = false,
): Promise<WeatherFetchResult> {
  if (coordinates.length === 0) {
    return {
      data: { results: [], fetched_at: new Date().toISOString(), units },
      source: 'fallback',
      cachedAt: null,
      error: null,
    };
  }

  const key = coordKey(coordinates);

  if (!forceRefresh) {
    const fresh = getCached(key, false);
    if (fresh) {
      setIssueRuntimeWeatherStatus('live');
      return {
        data: fresh.data,
        source: 'cache_fresh',
        cachedAt: fresh.cachedAt,
        error: null,
      };
    }
  }

  try {
    if (!connectivity.isOnline()) {
      throw new Error('Device is offline');
    }

    const response = await callWeatherEdgeFunction(coordinates, units);
    setCache(key, response);

    const waypointErrors = response.results.filter(r => r.error).map(r => r.error);

    setIssueRuntimeWeatherStatus('live');
    return {
      data: response,
      source: 'live',
      cachedAt: Date.now(),
      error: waypointErrors.length > 0
        ? `${waypointErrors.length} waypoint(s) had weather fetch issues`
        : null,
    };
  } catch (fetchErr: any) {
    const errorMsg = fetchErr?.message || 'Failed to fetch weather';
    reportRecoverableFailure({
      severity: errorMsg.toLowerCase().includes('offline') ? 'medium' : 'high',
      issueTitle: 'Weather fetch degraded',
      ecsArea: 'weather',
      error: fetchErr,
      message: errorMsg,
      signature: `weather_fetch:${errorMsg}`,
      metadata: { coordinateCount: coordinates.length, forceRefresh },
    });

    const userFacingError = isApiKeyError(errorMsg)
      ? 'Weather service not configured — OPENWEATHER_API_KEY may be missing or invalid. Contact your administrator.'
      : errorMsg;

    const stale = getStaleCached(key);
    if (stale) {
      setIssueRuntimeWeatherStatus('stale');
      return {
        data: stale.data,
        source: 'cache_stale',
        cachedAt: stale.cachedAt,
        error: userFacingError,
      };
    }

    setIssueRuntimeWeatherStatus('unavailable');
    return {
      data: generateFallbackWeather(coordinates, units),
      source: 'fallback',
      cachedAt: null,
      error: userFacingError,
    };
  }
}

export async function fetchWeather(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric' = 'imperial',
  forceRefresh = false,
): Promise<WeatherResponse> {
  const result = await fetchWeatherWithStatus(coordinates, units, forceRefresh);
  return result.data;
}

export async function fetchWeatherForLocation(
  lat: number,
  lon: number,
  units: 'imperial' | 'metric' = 'imperial',
  forceRefresh = false,
): Promise<WeatherFetchResult> {
  const key = singleCoordKey(lat, lon);

  const fresh = !forceRefresh ? getCached(key, false) : null;
  if (fresh) {
    setIssueRuntimeWeatherStatus('live');
    return {
      data: fresh.data,
      source: 'cache_fresh',
      cachedAt: fresh.cachedAt,
      error: null,
    };
  }

  try {
    if (!connectivity.isOnline()) {
      throw new Error('Device is offline');
    }

    const response = await callSimpleWeatherEdgeFunction(lat, lon, units);
    setCache(key, response);

    const waypointErrors = response.results.filter(r => r.error).map(r => r.error);

    setIssueRuntimeWeatherStatus('live');
    return {
      data: response,
      source: 'live',
      cachedAt: Date.now(),
      error: waypointErrors.length > 0 ? 'Weather data partially unavailable' : null,
    };
  } catch (fetchErr: any) {
    const errorMsg = fetchErr?.message || 'Failed to fetch weather';
    reportDegradedState({
      severity: errorMsg.toLowerCase().includes('offline') ? 'medium' : 'high',
      issueTitle: 'Location weather unavailable',
      ecsArea: 'weather',
      error: fetchErr,
      message: errorMsg,
      signature: `weather_location:${errorMsg}`,
      metadata: {
        latitude: Number.isFinite(lat) ? Number(lat.toFixed(3)) : null,
        longitude: Number.isFinite(lon) ? Number(lon.toFixed(3)) : null,
        forceRefresh,
      },
    });

    const userFacingError = isApiKeyError(errorMsg)
      ? 'Weather service not configured — OPENWEATHER_API_KEY may be missing or invalid.'
      : errorMsg;

    const stale = getStaleCached(key);
    if (stale) {
      setIssueRuntimeWeatherStatus('stale');
      return {
        data: stale.data,
        source: 'cache_stale',
        cachedAt: stale.cachedAt,
        error: userFacingError,
      };
    }

    setIssueRuntimeWeatherStatus('unavailable');
    return {
      data: generateFallbackWeather([{ lat, lng: lon, label: undefined }], units),
      source: 'fallback',
      cachedAt: null,
      error: userFacingError,
    };
  }
}

export function getCachedWeather(coordinates: WeatherCoordinate[]): WeatherResponse | null {
  if (coordinates.length === 0) return null;
  const key = coordKey(coordinates);
  const cached = getCached(key, false);
  return cached?.data || null;
}

export function getAnyCachedWeather(
  coordinates: WeatherCoordinate[],
): { data: WeatherResponse; cachedAt: number } | null {
  if (coordinates.length === 0) return null;
  const key = coordKey(coordinates);
  const cached = getStaleCached(key);
  if (!cached) return null;
  return { data: cached.data, cachedAt: cached.cachedAt };
}

export function clearWeatherCache(): void {
  memoryCache.clear();

  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_KEY_PREFIX)) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    }
  } catch {}
}

export function getWeatherCacheStats(): { count: number; sizeBytes: number; memoryEntries: number } {
  let lsCount = 0;
  let lsSizeBytes = 0;

  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_KEY_PREFIX)) {
          lsCount++;
          const val = localStorage.getItem(k);
          if (val) lsSizeBytes += val.length * 2;
        }
      }
    }
  } catch {}

  return {
    count: Math.max(lsCount, memoryCache.size),
    sizeBytes: lsSizeBytes,
    memoryEntries: memoryCache.size,
  };
}
