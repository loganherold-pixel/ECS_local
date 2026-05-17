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
import {
  normalizeWeatherTemperatureC,
  normalizeWeatherTemperatureF,
  normalizeWindSpeed,
  toFiniteNumber,
} from './weatherNormalization';
import {
  buildWeatherRequestKey,
  clearInFlightWeatherRequests,
  getInFlightWeatherRequestCount,
  runDedupedWeatherRequest,
} from './weatherRequestDedupe';
import { getWeatherFreshness, parseWeatherTimestampMs } from './weatherFreshness';
import { ecsLog } from './ecsLogger';
import type {
  WeatherCoordinate,
  WeatherResponse,
  WaypointWeather,
  CachedWeather,
  TrailFactorStatus,
  TrailOverall,
} from './weatherTypes';

// Cache Configuration
const CACHE_KEY_PREFIX = 'ecs_weather_';
const CACHE_DURATION_MS = 30 * 60 * 1000;
const STALE_WARNING_MS = 2 * 60 * 60 * 1000;
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 2000;
const EDGE_FUNCTION_TIMEOUT_MS = 12000;
const WEATHER_DEBUG = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
const WEATHER_JOIN_LOG_THROTTLE_MS = 3000;

const memoryCache = new Map<string, CachedWeather>();
const lastJoinedExistingLogAt = new Map<string, number>();

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

function weatherJoinedExistingLog(
  requestKey: string,
  payload: Record<string, unknown>,
): void {
  const now = Date.now();
  const lastLoggedAt = lastJoinedExistingLogAt.get(requestKey) ?? 0;
  if (now - lastLoggedAt < WEATHER_JOIN_LOG_THROTTLE_MS) {
    return;
  }
  lastJoinedExistingLogAt.set(requestKey, now);
  weatherDebugLog('[WEATHER] request_joined_existing', payload);
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

function hasUsableCurrent(current: WaypointWeather['current'] | null | undefined): boolean {
  if (!current) return false;
  return (
    toNumber(current.temp) != null ||
    toNumber(current.temperature) != null ||
    toNumber(current.tempF) != null ||
    toNumber(current.temperatureF) != null ||
    toNumber(current.feels_like) != null ||
    toNumber(current.wind_speed) != null ||
    toNumber(current.wind_gust) != null ||
    toNumber(current.humidity) != null ||
    Boolean(current.weather_main || current.weather_description)
  );
}

export function hasUsableWeatherResponse(data: WeatherResponse | null | undefined): boolean {
  if (!data || !Array.isArray(data.results) || data.results.length === 0) return false;
  return data.results.some(result =>
    hasUsableCurrent(result.current) ||
    Boolean(result.forecast?.length) ||
    Boolean(result.alerts?.length) ||
    Boolean(result.trail_conditions?.factors?.length),
  );
}

export function hasUsableWeatherFetchResult(result: WeatherFetchResult | null | undefined): boolean {
  if (!result) return false;
  if (result.source === 'fallback' && !hasUsableWeatherResponse(result.data)) return false;
  return hasUsableWeatherResponse(result.data);
}

function getValidatedCached(
  key: string,
  units: 'imperial' | 'metric',
  options?: { allowStale?: boolean },
): { data: WeatherResponse; cachedAt: number; source: 'cache_fresh' | 'cache_stale' } | null {
  const cached = options?.allowStale ? getStaleCached(key) : getCached(key, false);
  if (!cached) return null;
  if (cached.data.units !== units) return null;
  if (!hasUsableWeatherResponse(cached.data)) return null;
  return {
    data: cached.data,
    cachedAt: cached.cachedAt,
    source: isWeatherStale(cached.cachedAt) ? 'cache_stale' : 'cache_fresh',
  };
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

function readPath(source: any, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
}

function firstDefined(source: any, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value != null && value !== '') return value;
  }
  return undefined;
}

function weatherDebugLog(message: string, payload?: Record<string, unknown>) {
  const event = message.replace(/^\[WEATHER\]\s*/, '').trim();
  if (event.includes('request_failure')) {
    ecsLog.warn('WEATHER', event, payload);
    return;
  }
  if (event.includes('cache_stale')) {
    ecsLog.warn('WEATHER', event, payload);
    return;
  }
  if (!WEATHER_DEBUG) return;
  ecsLog.dev('WEATHER', event, payload, {
    tag: '[WEATHER]',
    debugFlag: 'ECS_DEBUG_WEATHER',
    fingerprint: `${event}:${JSON.stringify(payload ?? {})}`,
    throttleMs: 2500,
    aggregateWindowMs: 10_000,
  });
}

function getOpenWeatherWindUnit(units: 'imperial' | 'metric'): 'mph' | 'mps' {
  return units === 'metric' ? 'mps' : 'mph';
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

  const factors: { factor: string; status: TrailFactorStatus; detail: string }[] = [];

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

function pickArrayValue(source: any, keys: string[], index: number): unknown {
  for (const key of keys) {
    const value = readPath(source, key);
    if (Array.isArray(value)) return value[index];
  }
  return undefined;
}

function normalizeTimestampSeconds(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.round(value / 1000) : value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 10_000_000_000 ? Math.round(numeric / 1000) : numeric;
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.round(parsed / 1000);
  }
  return null;
}

function mapWeatherCodeToCondition(code: unknown): {
  weather_id: number | null;
  weather_main: string;
  weather_description: string;
  weather_icon: string;
} {
  const numeric = toNumber(code);
  if (numeric == null) {
    return {
      weather_id: null,
      weather_main: 'Unknown',
      weather_description: 'Unavailable',
      weather_icon: '01d',
    };
  }

  if (numeric === 0) {
    return { weather_id: 800, weather_main: 'Clear', weather_description: 'clear sky', weather_icon: '01d' };
  }
  if ([1, 2].includes(numeric)) {
    return { weather_id: 801, weather_main: 'Clouds', weather_description: 'partly cloudy', weather_icon: '02d' };
  }
  if (numeric === 3) {
    return { weather_id: 804, weather_main: 'Clouds', weather_description: 'overcast clouds', weather_icon: '04d' };
  }
  if ([45, 48].includes(numeric)) {
    return { weather_id: 741, weather_main: 'Fog', weather_description: 'fog', weather_icon: '50d' };
  }
  if ((numeric >= 51 && numeric <= 67) || (numeric >= 80 && numeric <= 82)) {
    return { weather_id: 500, weather_main: 'Rain', weather_description: 'rain', weather_icon: '10d' };
  }
  if ((numeric >= 71 && numeric <= 77) || (numeric >= 85 && numeric <= 86)) {
    return { weather_id: 600, weather_main: 'Snow', weather_description: 'snow', weather_icon: '13d' };
  }
  if (numeric >= 95) {
    return { weather_id: 200, weather_main: 'Thunderstorm', weather_description: 'thunderstorm', weather_icon: '11d' };
  }
  return { weather_id: numeric, weather_main: 'Unknown', weather_description: 'Unavailable', weather_icon: '01d' };
}

function dailyColumnarForecastToList(rawForecast: any): any[] {
  const daily = rawForecast?.daily && typeof rawForecast.daily === 'object'
    ? rawForecast.daily
    : rawForecast;
  const times = Array.isArray(daily?.time) ? daily.time : [];
  if (!times.length) return [];

  return times.map((time: unknown, index: number) => {
    const code = pickArrayValue(daily, ['weather_code', 'weatherCode', 'weather_id'], index);
    const mapped = mapWeatherCodeToCondition(code);
    return {
      date: typeof time === 'string' ? time.slice(0, 10) : undefined,
      temp_day: pickArrayValue(daily, ['temperature_2m_mean', 'temperatureMean', 'temperature_mean', 'apparent_temperature_mean'], index),
      temp_min: pickArrayValue(daily, ['temperature_2m_min', 'temperatureMin', 'temperature_min', 'tempLow', 'temperatureLow', 'low', 'apparent_temperature_min'], index),
      temp_max: pickArrayValue(daily, ['temperature_2m_max', 'temperatureMax', 'temperature_max', 'tempHigh', 'temperatureHigh', 'high', 'apparent_temperature_max'], index),
      humidity: pickArrayValue(daily, ['relative_humidity_2m_mean', 'humidity', 'humidity_mean'], index),
      pressure: pickArrayValue(daily, ['pressure_msl_mean', 'surface_pressure_mean', 'pressure', 'pressure_hpa'], index),
      wind_max: pickArrayValue(daily, ['wind_speed_10m_max', 'windSpeedMax', 'wind_speed_max', 'wind_max'], index),
      wind_gust_max: pickArrayValue(daily, ['wind_gusts_10m_max', 'windGustMax', 'windGust', 'wind_gust_max', 'wind_gusts_max', 'gust'], index),
      wind_deg: pickArrayValue(daily, ['wind_direction_10m_dominant', 'windDirectionDominant', 'wind_deg'], index),
      pop: pickArrayValue(daily, ['precipitation_probability_max', 'pop', 'precipitationChance', 'precipChance'], index),
      rain_total: pickArrayValue(daily, ['rain_sum', 'rain_total'], index),
      snow_total: pickArrayValue(daily, ['snowfall_sum', 'snow_total'], index),
      sunrise: pickArrayValue(daily, ['sunrise', 'sunup', 'sunriseTime', 'sun_up'], index),
      sunset: pickArrayValue(daily, ['sunset', 'sundown', 'sunsetTime', 'sun_down'], index),
      weather_id: mapped.weather_id,
      weather_main: mapped.weather_main,
      weather_description: mapped.weather_description,
      weather_icon: mapped.weather_icon,
    };
  });
}

function resolveForecastList(rawForecast: any): any[] {
  if (Array.isArray(rawForecast)) return rawForecast;
  const columnar = dailyColumnarForecastToList(rawForecast);
  if (columnar.length) return columnar;
  if (Array.isArray(rawForecast?.daily)) return rawForecast.daily;
  if (Array.isArray(rawForecast?.forecast)) return rawForecast.forecast;
  if (Array.isArray(rawForecast?.list)) return rawForecast.list;
  return [];
}

function normalizeForecastList(forecast: any, units: 'imperial' | 'metric'): any[] {
  const forecastList = resolveForecastList(forecast);
  if (!forecastList.length) return [];
  const windUnit = getOpenWeatherWindUnit(units);

  return forecastList.map((f: any, idx: number) => {
    const dateValue = firstDefined(f, ['date', 'time', 'startTime', 'validTime', 'dt_txt', 'dt', 'timestamp']);
    const rawDate = typeof dateValue === 'string' && dateValue.trim()
      ? dateValue.slice(0, 10)
      : typeof dateValue === 'number' && Number.isFinite(dateValue)
        ? new Date((dateValue > 10_000_000_000 ? dateValue : dateValue * 1000)).toISOString().slice(0, 10)
      : new Date(Date.now() + idx * 86400000).toISOString().slice(0, 10);
    const popValue = toNumber(firstDefined(f, [
      'pop',
      'precipitation_probability_max',
      'precipitationChance',
      'precipChance',
      'probabilityOfPrecipitation.value',
      'values.precipitationProbability',
    ]));

    return {
      date: rawDate,
      temp_day: toNumber(firstDefined(f, ['temp_day', 'temp.day', 'temperature_day', 'temperatureMean', 'temperature_2m_mean', 'temperature', 'temp', 'values.temperature'])),
      temp_min: toNumber(firstDefined(f, ['temp_min', 'main.temp_min', 'temperature_min', 'temp.min', 'temperature.min', 'temperatureMin', 'temperatureLow', 'tempLow', 'low', 'lowTemperature', 'temperature_2m_min', 'values.temperatureMin', 'values.temperatureLow'])),
      temp_max: toNumber(firstDefined(f, ['temp_max', 'main.temp_max', 'temperature_max', 'temp.max', 'temperature.max', 'temperatureMax', 'temperatureHigh', 'tempHigh', 'high', 'highTemperature', 'temperature_2m_max', 'values.temperatureMax', 'values.temperatureHigh'])),
      humidity: toNumber(firstDefined(f, ['humidity', 'main.humidity', 'relative_humidity_2m_mean', 'values.humidity'])),
      pressure: toNumber(firstDefined(f, ['pressure', 'main.pressure', 'pressure_hpa', 'pressureHpa', 'pressure_msl_mean', 'surface_pressure_mean', 'values.pressureSurfaceLevel'])),
      wind_max: normalizeWindSpeed(firstDefined(f, ['wind_max', 'windSpeed', 'wind_speed', 'wind_speed_max', 'windSpeedMax', 'wind.speed', 'values.windSpeed']), windUnit),
      wind_gust_max: normalizeWindSpeed(firstDefined(f, ['wind_gust_max', 'windGust', 'wind_gust', 'wind_gusts_max', 'windGustMax', 'gust', 'wind.gust', 'values.windGust']), windUnit),
      wind_deg: toNumber(firstDefined(f, ['wind_deg', 'windDirectionDeg', 'wind_direction', 'wind.deg', 'values.windDirection'])),
      pop: Math.round((popValue ?? 0) * ((popValue ?? 0) <= 1 ? 100 : 1)),
      rain_total: toNumber(f?.rain_total ?? f?.rain?.['3h'] ?? f?.rain?.['1h']) ?? 0,
      snow_total: toNumber(f?.snow_total ?? f?.snow?.['3h'] ?? f?.snow?.['1h']) ?? 0,
      sunrise: normalizeTimestampSeconds(firstDefined(f, ['sunrise', 'sunup', 'sunriseTime', 'sun_up'])),
      sunset: normalizeTimestampSeconds(firstDefined(f, ['sunset', 'sundown', 'sunsetTime', 'sun_down'])),
      weather_id: toNumber(f?.weather_id ?? f?.weather?.[0]?.id ?? mapWeatherCodeToCondition(f?.weather_code ?? f?.weatherCode).weather_id),
      weather_main: f?.weather_main ?? f?.condition ?? f?.conditions ?? f?.shortForecast ?? f?.weather?.[0]?.main ?? mapWeatherCodeToCondition(f?.weather_code ?? f?.weatherCode).weather_main,
      weather_description: f?.weather_description ?? f?.description ?? f?.summary ?? f?.detailedForecast ?? f?.weather?.[0]?.description ?? mapWeatherCodeToCondition(f?.weather_code ?? f?.weatherCode).weather_description,
      weather_icon: f?.weather_icon ?? f?.weather?.[0]?.icon ?? mapWeatherCodeToCondition(f?.weather_code ?? f?.weatherCode).weather_icon,
    };
  });
}

function normalizeCurrent(current: any, label?: string | null, units: 'imperial' | 'metric' = 'imperial') {
  const windUnit = getOpenWeatherWindUnit(units);

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

  const tempF = normalizeWeatherTemperatureF(current, units);
  const tempC = normalizeWeatherTemperatureC(current, units);
  const genericTemp = units === 'metric' ? tempC : tempF;
  const feelsLikeF =
    toFiniteNumber(current?.feelsLikeF ?? current?.feels_like_f ?? current?.apparentTemperatureF) ??
    (toFiniteNumber(current?.feelsLikeC ?? current?.feels_like_c ?? current?.apparentTemperatureC) != null
      ? normalizeWeatherTemperatureF(
          { temperatureC: current?.feelsLikeC ?? current?.feels_like_c ?? current?.apparentTemperatureC },
          'metric',
        )
      : normalizeWeatherTemperatureF(
          { temperature: current?.feels_like ?? current?.feelsLike ?? current?.apparentTemperature },
          units,
        ));
  const feelsLikeC =
    toFiniteNumber(current?.feelsLikeC ?? current?.feels_like_c ?? current?.apparentTemperatureC) ??
    (toFiniteNumber(current?.feelsLikeF ?? current?.feels_like_f ?? current?.apparentTemperatureF) != null
      ? normalizeWeatherTemperatureC(
          { temperatureF: current?.feelsLikeF ?? current?.feels_like_f ?? current?.apparentTemperatureF },
          'imperial',
        )
      : normalizeWeatherTemperatureC(
          { temperature: current?.feels_like ?? current?.feelsLike ?? current?.apparentTemperature },
          units,
        ));
  const feelsLikeValue = units === 'metric' ? feelsLikeC : feelsLikeF;

  return {
    temp: genericTemp,
    temperature: genericTemp,
    tempF,
    temperatureF: tempF,
    tempC,
    temperatureC: tempC,
    temp_f: tempF,
    temp_c: tempC,
    feels_like: feelsLikeValue,
    feelsLikeF,
    feelsLikeC,
    temp_min: toNumber(firstDefined(current, ['temp_min', 'temperature_min', 'temperatureMin', 'temperatureLow', 'tempLow', 'low', 'lowTemperature', 'temp.min', 'temperature.min', 'daily.low'])),
    temp_max: toNumber(firstDefined(current, ['temp_max', 'temperature_max', 'temperatureMax', 'temperatureHigh', 'tempHigh', 'high', 'highTemperature', 'temp.max', 'temperature.max', 'daily.high'])),
    humidity: toNumber(current?.humidity),
    pressure: toNumber(current?.pressure ?? current?.pressure_hpa ?? current?.pressureHpa ?? current?.pressure_msl ?? current?.surface_pressure ?? current?.main?.pressure),
    visibility: toNumber(current?.visibility),
    wind_speed: normalizeWindSpeed(current?.wind_speed ?? current?.windSpeed ?? current?.wind?.speed, windUnit),
    wind_deg: toNumber(current?.wind_deg ?? current?.windDirectionDeg ?? current?.wind_direction ?? current?.wind?.deg),
    wind_gust: normalizeWindSpeed(current?.wind_gust ?? current?.windGust ?? current?.gust ?? current?.wind?.gust, windUnit),
    clouds: toNumber(current?.clouds),
    weather_id: toNumber(current?.weather_id),
    weather_main: current?.weather_main ?? current?.condition ?? current?.conditions ?? null,
    weather_description: current?.weather_description ?? current?.description ?? current?.summary ?? null,
    weather_icon: current?.weather_icon ?? null,
    rain_1h: toNumber(current?.rain_1h),
    rain_3h: toNumber(current?.rain_3h),
    snow_1h: toNumber(current?.snow_1h),
    snow_3h: toNumber(current?.snow_3h),
    sunrise: normalizeTimestampSeconds(firstDefined(current, ['sunrise', 'sunup', 'sunriseTime', 'sun_up', 'sys.sunrise'])),
    sunset: normalizeTimestampSeconds(firstDefined(current, ['sunset', 'sundown', 'sunsetTime', 'sun_down', 'sys.sunset'])),
    location_name: current?.location_name ?? label ?? null,
    dt: toNumber(current?.dt),
  };
}

function normalizeResult(raw: any, fallbackLabel?: string | null, units: 'imperial' | 'metric' = 'imperial'): WaypointWeather {
  const forecast = normalizeForecastList(raw?.forecast ?? raw?.forecastDays ?? raw?.dailyForecast ?? raw?.daily ?? raw?.forecast_daily ?? raw?.weather?.forecast ?? [], units);
  const normalizedCurrent = normalizeCurrent(raw?.current, raw?.label ?? fallbackLabel ?? null, units);
  const firstForecast = forecast[0] ?? null;
  const current = {
    ...normalizedCurrent,
    temp_min: normalizedCurrent.temp_min ?? firstForecast?.temp_min ?? null,
    temp_max: normalizedCurrent.temp_max ?? firstForecast?.temp_max ?? null,
    pressure: normalizedCurrent.pressure ?? firstForecast?.pressure ?? null,
    sunrise: normalizedCurrent.sunrise ?? normalizeTimestampSeconds(firstForecast?.sunrise) ?? null,
    sunset: normalizedCurrent.sunset ?? normalizeTimestampSeconds(firstForecast?.sunset) ?? null,
  };
  const rawAlerts = Array.isArray(raw?.alerts)
    ? raw.alerts
    : Array.isArray(raw?.weather_alerts)
      ? raw.weather_alerts
      : Array.isArray(raw?.warnings)
        ? raw.warnings
        : [];
  const alerts = rawAlerts
    .map((a: any) => ({
        severity: mapSeverity(a?.severity),
        title: a?.title ?? 'Weather Notice',
        description: a?.description ?? a?.body ?? a?.message ?? 'No description available.',
        type: a?.type ?? 'general',
        effective: typeof a?.effective === 'string' ? a.effective : null,
        expires: typeof a?.expires === 'string' ? a.expires : null,
      }));

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
  const responseUnits = data?.units === 'metric' ? 'metric' : units;

  const results = requestedCoordinates.map((coord, idx) => {
    const raw = rawResults[idx] ?? {};
    return normalizeResult(raw, coord.label ?? null, responseUnits);
  });
  const first = results[0];
  weatherDebugLog('[WEATHER] normalize_input keys=', {
    keys: data && typeof data === 'object' ? Object.keys(data).join(',') : 'none',
  });
  weatherDebugLog('[WEATHER] normalize_output hasCurrent= hasForecast= windMph=', {
    hasCurrent: first?.current?.temp != null || first?.current?.feels_like != null || first?.current?.wind_speed != null,
    hasForecast: Boolean(first?.forecast?.length),
    windMph: first?.current?.wind_speed ?? null,
  });

  return {
    results,
    fetched_at: typeof data?.fetched_at === 'string' ? data.fetched_at : new Date().toISOString(),
    units: responseUnits,
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
    error: 'Weather data unavailable - offline with no cached data',
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

function setIssueRuntimeWeatherFromResult(result: WeatherFetchResult): void {
  const hasWeatherData = hasUsableWeatherResponse(result.data);
  const freshness = getWeatherFreshness({
    source: result.source,
    fetchedAt: result.data.fetched_at,
    cachedAt: result.cachedAt,
    hasWeatherData,
  });
  if (!hasWeatherData && result.source !== 'fallback') {
    weatherDebugLog('[WEATHER] empty_weather_update_ignored', {
      scope: 'issue_runtime_weather',
      source: result.source,
    });
    return;
  }

  const status =
    freshness.freshness === 'missing'
      ? 'unavailable'
      : freshness.stale
        ? 'stale'
        : 'live';
  const fetchedAtMs = parseWeatherTimestampMs(result.data.fetched_at);
  const lastSuccessfulFetchAt = status === 'unavailable'
    ? null
    : freshness.timestampMs ?? result.cachedAt ?? fetchedAtMs ?? Date.now();

  setIssueRuntimeWeatherStatus(status, {
    source: result.source,
    freshness: freshness.freshness,
    fetchedAt: fetchedAtMs,
    cachedAt: result.cachedAt,
    stale: freshness.stale,
    lastSuccessfulFetchAt,
  });
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
  const requestKey = buildWeatherRequestKey({
    mode: 'coordinates',
    coordinates,
    units,
    forceRefresh,
  });

  if (!forceRefresh) {
    const fresh = getValidatedCached(key, units, { allowStale: false });
    if (fresh) {
      setIssueRuntimeWeatherFromResult({
        data: fresh.data,
        source: fresh.source,
        cachedAt: fresh.cachedAt,
        error: null,
      });
      weatherDebugLog('[WEATHER] request_skipped_fresh_cache', {
        mode: 'coordinates',
        coordinateCount: coordinates.length,
        units,
        requestKey,
      });
      return {
        data: fresh.data,
        source: fresh.source,
        cachedAt: fresh.cachedAt,
        error: null,
      };
    }
  }

  return runDedupedWeatherRequest(requestKey, async () => {
    try {
    weatherDebugLog('[WEATHER] request_start', {
      mode: 'coordinates',
      coordinateCount: coordinates.length,
      units,
      forceRefresh,
      requestKey,
    });
    if (!connectivity.isOnline()) {
      throw new Error('Device is offline');
    }

    const response = await callWeatherEdgeFunction(coordinates, units);
    setCache(key, response);
    const successAt = Date.now();

    const waypointErrors = response.results.filter(r => r.error).map(r => r.error);

    setIssueRuntimeWeatherFromResult({
      data: response,
      source: 'live',
      cachedAt: successAt,
      error: null,
    });
    weatherDebugLog('[WEATHER] request_success source=live', {
      mode: 'coordinates',
      coordinateCount: coordinates.length,
      hasForecast: response.results.some(result => (result.forecast?.length ?? 0) > 0),
      requestKey,
    });
    return {
      data: response,
      source: 'live',
      cachedAt: successAt,
      error: waypointErrors.length > 0
        ? `${waypointErrors.length} waypoint(s) had weather fetch issues`
        : null,
    };
    } catch (fetchErr: any) {
    const errorMsg = fetchErr?.message || 'Failed to fetch weather';
    weatherDebugLog('[WEATHER] request_failure', {
      mode: 'coordinates',
      coordinateCount: coordinates.length,
      forceRefresh,
      requestKey,
      reason: errorMsg,
    });
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
      ? 'Weather service not configured - OPENWEATHER_API_KEY may be missing or invalid. Contact your administrator.'
      : errorMsg;

    const stale = getValidatedCached(key, units, { allowStale: true });
    if (stale) {
      setIssueRuntimeWeatherFromResult({
        data: stale.data,
        source: stale.source === 'cache_fresh' ? 'cache_fresh' : 'cache_stale',
        cachedAt: stale.cachedAt,
        error: userFacingError,
      });
      weatherDebugLog('[WEATHER] request_success source=cache_stale', {
        mode: 'coordinates',
        coordinateCount: coordinates.length,
        requestKey,
      });
      return {
        data: stale.data,
        source: stale.source === 'cache_fresh' ? 'cache_fresh' : 'cache_stale',
        cachedAt: stale.cachedAt,
        error: userFacingError,
      };
    }

    const fallback = generateFallbackWeather(coordinates, units);
    setIssueRuntimeWeatherFromResult({
      data: fallback,
      source: 'fallback',
      cachedAt: null,
      error: userFacingError,
    });
    return {
      data: fallback,
      source: 'fallback',
      cachedAt: null,
      error: userFacingError,
    };
    }
  }, () => {
    weatherJoinedExistingLog(requestKey, {
      mode: 'coordinates',
      coordinateCount: coordinates.length,
      units,
      forceRefresh,
      requestKey,
    });
  });
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
  const coordinates: WeatherCoordinate[] = [{ lat, lng: lon, label: undefined }];
  const requestKey = buildWeatherRequestKey({
    mode: 'location',
    coordinates,
    units,
    forceRefresh,
  });

  const fresh = !forceRefresh ? getValidatedCached(key, units, { allowStale: false }) : null;
  if (fresh) {
    setIssueRuntimeWeatherFromResult({
      data: fresh.data,
      source: fresh.source,
      cachedAt: fresh.cachedAt,
      error: null,
    });
    weatherDebugLog('[WEATHER] request_skipped_fresh_cache', {
      mode: 'location',
      units,
      requestKey,
    });
    return {
      data: fresh.data,
      source: fresh.source,
      cachedAt: fresh.cachedAt,
      error: null,
    };
  }

  return runDedupedWeatherRequest(requestKey, async () => {
    try {
    weatherDebugLog('[WEATHER] request_start', {
      mode: 'location',
      units,
      forceRefresh,
      requestKey,
    });
    if (!connectivity.isOnline()) {
      throw new Error('Device is offline');
    }

    const response = await callSimpleWeatherEdgeFunction(lat, lon, units);
    setCache(key, response);
    const successAt = Date.now();

    const waypointErrors = response.results.filter(r => r.error).map(r => r.error);

    setIssueRuntimeWeatherFromResult({
      data: response,
      source: 'live',
      cachedAt: successAt,
      error: null,
    });
    weatherDebugLog('[WEATHER] request_success source=live', {
      mode: 'location',
      hasForecast: response.results.some(result => (result.forecast?.length ?? 0) > 0),
      requestKey,
    });
    return {
      data: response,
      source: 'live',
      cachedAt: successAt,
      error: waypointErrors.length > 0 ? 'Weather data partially unavailable' : null,
    };
    } catch (fetchErr: any) {
    const errorMsg = fetchErr?.message || 'Failed to fetch weather';
    weatherDebugLog('[WEATHER] request_failure', {
      mode: 'location',
      units,
      forceRefresh,
      requestKey,
      reason: errorMsg,
    });
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
      ? 'Weather service not configured - OPENWEATHER_API_KEY may be missing or invalid.'
      : errorMsg;

    const stale = getValidatedCached(key, units, { allowStale: true });
    if (stale) {
      setIssueRuntimeWeatherFromResult({
        data: stale.data,
        source: stale.source === 'cache_fresh' ? 'cache_fresh' : 'cache_stale',
        cachedAt: stale.cachedAt,
        error: userFacingError,
      });
      weatherDebugLog('[WEATHER] request_success source=cache_stale', {
        mode: 'location',
        requestKey,
      });
      return {
        data: stale.data,
        source: stale.source === 'cache_fresh' ? 'cache_fresh' : 'cache_stale',
        cachedAt: stale.cachedAt,
        error: userFacingError,
      };
    }

    const fallback = generateFallbackWeather([{ lat, lng: lon, label: undefined }], units);
    setIssueRuntimeWeatherFromResult({
      data: fallback,
      source: 'fallback',
      cachedAt: null,
      error: userFacingError,
    });
    return {
      data: fallback,
      source: 'fallback',
      cachedAt: null,
      error: userFacingError,
    };
    }
  }, () => {
    weatherJoinedExistingLog(requestKey, {
      mode: 'location',
      units,
      forceRefresh,
      requestKey,
    });
  });
}

export function getCachedWeather(coordinates: WeatherCoordinate[]): WeatherResponse | null {
  if (coordinates.length === 0) return null;
  const key = coordKey(coordinates);
  const cached = getCached(key, false);
  return cached?.data || null;
}

export function getCachedWeatherResult(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric' = 'imperial',
  options?: { allowStale?: boolean },
): WeatherFetchResult | null {
  if (coordinates.length === 0) return null;
  const key = coordKey(coordinates);
  const cached = getValidatedCached(key, units, { allowStale: options?.allowStale ?? true });
  if (!cached) return null;
  return {
    data: cached.data,
    source: cached.source,
    cachedAt: cached.cachedAt,
    error: null,
  };
}

export function getAnyCachedWeather(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric' = 'imperial',
): { data: WeatherResponse; cachedAt: number; source: 'cache_fresh' | 'cache_stale' } | null {
  if (coordinates.length === 0) return null;
  const key = coordKey(coordinates);
  const cached = getValidatedCached(key, units, { allowStale: true });
  if (!cached) return null;
  return { data: cached.data, cachedAt: cached.cachedAt, source: cached.source };
}

export function clearWeatherCache(): void {
  memoryCache.clear();
  clearInFlightWeatherRequests();
  weatherDebugLog('[WEATHER] weather_cleared_explicitly', {
    scope: 'weather_cache',
  });

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

export const weatherRequestDedupeTestHooks = {
  buildWeatherRequestKey,
  clearInFlightWeatherRequests,
  getCachedWeatherResult,
  getInFlightWeatherRequestCount,
  runDedupedWeatherRequest,
};

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
