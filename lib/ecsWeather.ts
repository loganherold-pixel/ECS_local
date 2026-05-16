import type { WeatherFetchResult } from './weatherStore';
import type { DailyForecast, WaypointWeather, WeatherAlert } from './weatherTypes';
import {
  formatWeatherDegrees,
  normalizeTemperatureF,
  normalizeWeatherTemperatureC,
  normalizeWeatherTemperatureF,
  normalizeWindSpeed,
  toFiniteNumber,
  weatherSourceFromFetchSource,
  type ECSNormalizedWeatherSnapshot,
  type NormalizedWeatherForecast,
} from './weatherNormalization';
import { getWeatherFreshness, type WeatherFreshness } from './weatherFreshness';
import type { ResolvedWeatherLocation, WeatherLocationLabelConfidence } from './weatherLocationResolver';
import { ecsLog } from './ecsLogger';

export type ECSWeatherStatusKind =
  | 'loading'
  | 'live'
  | 'cached'
  | 'stale'
  | 'unavailable'
  | 'provider_error'
  | 'permission_required'
  | 'permission-blocked'
  | 'network-blocked'
  | 'waiting_for_gps'
  | 'ready'
  | 'error'
  | 'offline';

export type ECSWeatherSourceType =
  | 'current_location'
  | 'route_origin'
  | 'route_segment'
  | 'selected_coordinate'
  | 'last_known'
  | 'cached';

export interface ECSWeatherCurrent {
  temp: number | null;
  feelsLike: number | null;
  condition: string | null;
  description: string | null;
  iconCode: string | null;
  windSpeed: number | null;
  windGust: number | null;
  windDirection: string | null;
  humidity: number | null;
  precipChance: number | null;
  precipType: string | null;
  visibility: number | null;
  pressure?: number | null;
  sunrise?: number | null;
  sunset?: number | null;
  highTemperature?: number | null;
  lowTemperature?: number | null;
}

export interface ECSWeatherAlert {
  title: string;
  type: WeatherAlert['type'];
  severity: WeatherAlert['severity'];
  effective: string | null;
  expires: string | null;
  description: string;
}

export interface ECSWeatherSnapshot {
  locationName: string;
  location: {
    lat: number | null;
    lng: number | null;
    label: string | null;
    sourceType: ECSWeatherSourceType;
    confidence: number;
    labelConfidence: WeatherLocationLabelConfidence;
    accuracyM: number | null;
    stale: boolean;
    staleReason: string | null;
  };
  fetchedAt: string | null;
  sourceType: ECSWeatherSourceType;
  provider: {
    id: string;
    name: string;
    source: WeatherFetchResult['source'] | null;
    units: 'imperial' | 'metric';
  };
  cache: {
    fetchedAt: string | null;
    cachedAt: number | null;
    cacheAgeMs: number | null;
    freshness: WeatherFreshness;
  };
  cacheAgeMs: number | null;
  locationConfidence: number;
  normalized: ECSNormalizedWeatherSnapshot;
  current: ECSWeatherCurrent;
  alerts: ECSWeatherAlert[];
  hourly: DailyForecast[];
  daily: DailyForecast[];
  status: {
    kind: ECSWeatherStatusKind;
    loading: boolean;
    source: WeatherFetchResult['source'] | null;
    error: string | null;
    stale: boolean;
    freshness: WeatherFreshness;
    ageMinutes: number | null;
    timestampMs: number | null;
    cachedAt: number | null;
    label: string | null;
  };
  raw: WaypointWeather | null;
}

function safeNumber(value: unknown): number | null {
  return toFiniteNumber(value);
}

function readPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
}

function readFirstValue(source: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value != null && value !== '') return value;
  }
  return undefined;
}

function readFirstNumber(source: unknown, paths: string[]): number | null {
  return safeNumber(readFirstValue(source, paths));
}

function readFirstTimestampSeconds(source: unknown, paths: string[]): number | null {
  const value = readFirstValue(source, paths);
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.round(value / 1000) : value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 10_000_000_000 ? Math.round(numeric / 1000) : numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.round(parsed / 1000) : null;
  }
  return null;
}

export function getWindDirectionLabel(deg: number | null): string | null {
  if (deg == null || !Number.isFinite(deg)) return null;
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16] ?? null;
}

function getAgeMinutes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round((Date.now() - ms) / 60000));
}

function getPrecipChance(raw: WaypointWeather | null): number | null {
  if (!raw) return null;
  const immediatePrecip =
    safeNumber(raw.current?.rain_1h) != null ||
    safeNumber(raw.current?.rain_3h) != null ||
    safeNumber(raw.current?.snow_1h) != null ||
    safeNumber(raw.current?.snow_3h) != null;

  if (immediatePrecip) return 100;

  const nextForecast = Array.isArray(raw.forecast) ? raw.forecast[0] : null;
  if (!nextForecast) return null;
  return safeNumber(nextForecast.pop);
}

function getPrecipType(raw: WaypointWeather | null): string | null {
  if (!raw) return null;

  if ((safeNumber(raw.current?.snow_1h) ?? 0) > 0 || (safeNumber(raw.current?.snow_3h) ?? 0) > 0) {
    return 'snow';
  }
  if ((safeNumber(raw.current?.rain_1h) ?? 0) > 0 || (safeNumber(raw.current?.rain_3h) ?? 0) > 0) {
    return 'rain';
  }

  const main = String(raw.current?.weather_main ?? '').toLowerCase();
  if (main.includes('snow')) return 'snow';
  if (main.includes('rain') || main.includes('drizzle') || main.includes('storm')) return 'rain';

  const nextForecast = Array.isArray(raw.forecast) ? raw.forecast[0] : null;
  const nextMain = String(nextForecast?.weather_main ?? '').toLowerCase();
  if (nextMain.includes('snow')) return 'snow';
  if (nextMain.includes('rain') || nextMain.includes('drizzle') || nextMain.includes('storm')) return 'rain';

  return null;
}

function getStatusKind(params: {
  permissionBlocked?: boolean;
  networkBlocked?: boolean;
  waitingForGps?: boolean;
  loading: boolean;
  source: WeatherFetchResult['source'] | null;
  error: string | null;
  hasLiveCurrent: boolean;
  ageMinutes: number | null;
  stale: boolean;
}): ECSWeatherStatusKind {
  const {
    permissionBlocked,
    networkBlocked,
    waitingForGps,
    loading,
    source,
    error,
    hasLiveCurrent,
    ageMinutes,
    stale,
  } = params;

  if (permissionBlocked) return 'permission_required';
  if (waitingForGps) return 'waiting_for_gps';
  if (loading && !hasLiveCurrent) return 'loading';
  if (networkBlocked && !hasLiveCurrent) return 'unavailable';
  if (hasLiveCurrent) {
    if (stale || source === 'cache_stale') return 'stale';
    if (source === 'cache_fresh') return 'cached';
    if (source === 'fallback' && error) return 'provider_error';
    return 'live';
  }
  if (!hasLiveCurrent && error) return source === 'fallback' ? 'provider_error' : 'provider_error';
  if (!hasLiveCurrent && !loading) return 'unavailable';
  return 'live';
}

function getStatusLabel(kind: ECSWeatherStatusKind, ageMinutes: number | null): string | null {
  switch (kind) {
    case 'permission-blocked':
    case 'permission_required':
      return 'Location permission required';
    case 'network-blocked':
      return 'Network required for live weather';
    case 'waiting_for_gps':
      return 'Waiting for GPS';
    case 'loading':
      return 'Loading weather';
    case 'error':
    case 'unavailable':
      return 'Weather unavailable';
    case 'provider_error':
      return 'Weather provider unavailable';
    case 'cached':
      return ageMinutes != null ? `Cached - ${ageMinutes}m old` : 'Cached weather';
    case 'live':
      return null;
    case 'offline':
      return ageMinutes != null ? 'Offline - last known forecast' : 'Weather unavailable';
    case 'stale':
      return ageMinutes != null ? `Stale - ${ageMinutes}m old` : 'Stale weather';
    default:
      return null;
  }
}

function getCacheAgeMs(cachedAt: number | null | undefined): number | null {
  return cachedAt == null ? null : Math.max(0, Date.now() - cachedAt);
}

function getLocationConfidence(params: {
  raw: WaypointWeather | null;
  source: WeatherFetchResult['source'] | null;
  sourceType: ECSWeatherSourceType;
  resolution?: ResolvedWeatherLocation | null;
}): number {
  const { raw, source, sourceType, resolution } = params;
  if (resolution) return resolution.confidence;
  const hasCoordinate =
    typeof raw?.lat === 'number' &&
    Number.isFinite(raw.lat) &&
    typeof raw?.lng === 'number' &&
    Number.isFinite(raw.lng);
  if (!hasCoordinate) return 0;
  if (source === 'live') return sourceType === 'current_location' ? 0.96 : 0.92;
  if (source === 'cache_fresh') return 0.86;
  if (source === 'cache_stale') return 0.68;
  return 0.2;
}

function getFallbackLocationLabelConfidence(
  source: WeatherFetchResult['source'] | null,
  sourceType: ECSWeatherSourceType,
): WeatherLocationLabelConfidence {
  if (source === 'live' && (sourceType === 'current_location' || sourceType === 'selected_coordinate')) {
    return 'medium';
  }
  if (source === 'cache_fresh' || source === 'cache_stale' || sourceType === 'last_known' || sourceType === 'cached') {
    return 'medium';
  }
  return 'low';
}

function sanitizeWeatherText(value: string | null): string | null {
  if (!value) return value;
  return value
    .replace(/°/g, '°')
    .replace(/Ã‚°/g, '°')
    .replace(/Â°/g, '°')
    .replace(/â€¢/g, '-')
    .replace(/â€”/g, '-')
    .replace(/\uFFFD/g, '');
}

function isMeaningfulCurrent(current: WaypointWeather['current'] | null): boolean {
  if (!current) return false;
  return (
    normalizeWeatherTemperatureF(current, 'imperial') != null ||
    normalizeFeelsLikeF(current, 'imperial') != null ||
    safeNumber(current.wind_speed) != null ||
    safeNumber(current.wind_gust) != null ||
    safeNumber(current.humidity) != null ||
    Boolean(current.weather_main || current.weather_description)
  );
}

function normalizeFeelsLikeF(current: unknown, units: 'imperial' | 'metric'): number | null {
  const value = current as Record<string, unknown> | null | undefined;
  if (!value) return null;
  const explicitF = safeNumber(value.feelsLikeF) ?? safeNumber(value.feels_like_f) ?? safeNumber(value.apparentTemperatureF);
  if (explicitF != null) return explicitF;
  const explicitC = safeNumber(value.feelsLikeC) ?? safeNumber(value.feels_like_c) ?? safeNumber(value.apparentTemperatureC);
  if (explicitC != null) return normalizeTemperatureF(explicitC, 'metric');
  return normalizeTemperatureF(value.feels_like ?? value.feelsLike ?? value.apparentTemperature, units);
}

function normalizeForecastEntry(
  entry: DailyForecast,
  units: 'imperial' | 'metric',
): NormalizedWeatherForecast | null {
  const rawTime = readFirstValue(entry, ['date', 'time', 'startTime', 'validTime', 'dt_txt', 'dt', 'timestamp']);
  const time = typeof rawTime === 'string' && rawTime.trim()
    ? rawTime
    : typeof rawTime === 'number' && Number.isFinite(rawTime)
      ? new Date((rawTime > 10_000_000_000 ? rawTime : rawTime * 1000)).toISOString().slice(0, 10)
      : null;
  if (!time) return null;

  const highTemperatureF = normalizeTemperatureF(readFirstValue(entry, [
    'temp_max',
    'temperature_max',
    'temperatureMax',
    'temperatureHigh',
    'tempHigh',
    'high',
    'highTemperature',
    'temp.max',
    'temperature.max',
    'values.temperatureMax',
    'values.temperatureHigh',
  ]), units);
  const lowTemperatureF = normalizeTemperatureF(readFirstValue(entry, [
    'temp_min',
    'temperature_min',
    'temperatureMin',
    'temperatureLow',
    'tempLow',
    'low',
    'lowTemperature',
    'temp.min',
    'temperature.min',
    'values.temperatureMin',
    'values.temperatureLow',
  ]), units);
  const dayTemperature = readFirstValue(entry, ['temp_day', 'temperature_day', 'temperatureMean', 'temperature', 'temp', 'values.temperature']);
  const temperatureF = dayTemperature != null
    ? normalizeTemperatureF(dayTemperature, units)
    : highTemperatureF ?? lowTemperatureF;
  const condition = entry.weather_main || entry.weather_description || (readFirstValue(entry, ['condition', 'conditions', 'shortForecast', 'summary']) as string | undefined);
  const windMph = normalizeWindSpeed(readFirstValue(entry, ['wind_max', 'windSpeed', 'wind_speed', 'windSpeedMax', 'wind.speed', 'values.windSpeed']), 'mph');
  const windGustMph = normalizeWindSpeed(readFirstValue(entry, ['wind_gust_max', 'windGust', 'wind_gust', 'windGustMax', 'gust', 'wind.gust', 'values.windGust']), 'mph');
  const windDirectionDeg = readFirstNumber(entry, ['wind_deg', 'windDirectionDeg', 'wind_direction', 'wind.deg', 'values.windDirection']);
  const precipitationChanceRaw = readFirstNumber(entry, ['pop', 'precipitationChance', 'precipChance', 'precipitation_probability_max', 'probabilityOfPrecipitation.value', 'values.precipitationProbability']);
  const precipitationChance = precipitationChanceRaw != null && precipitationChanceRaw <= 1
    ? precipitationChanceRaw * 100
    : precipitationChanceRaw;
  const sunrise = readFirstTimestampSeconds(entry, ['sunrise', 'sunup', 'sunriseTime', 'sun_up']);
  const sunset = readFirstTimestampSeconds(entry, ['sunset', 'sundown', 'sunsetTime', 'sun_down']);

  if (
    temperatureF == null &&
    !condition &&
    windMph == null &&
    windGustMph == null &&
    precipitationChance == null &&
    sunrise == null &&
    sunset == null
  ) return null;

  return {
    time,
    ...(temperatureF != null ? { temperatureF } : null),
    ...(highTemperatureF != null ? { highTemperatureF } : null),
    ...(lowTemperatureF != null ? { lowTemperatureF } : null),
    ...(sunrise != null ? { sunrise } : null),
    ...(sunset != null ? { sunset } : null),
    ...(condition ? { condition } : null),
    ...(windMph != null ? { windMph } : null),
    ...(windGustMph != null ? { windGustMph } : null),
    ...(windDirectionDeg != null ? { windDirectionDeg } : null),
    ...(precipitationChance != null ? { precipitationChance } : null),
  };
}

let lastNormalizeLogKey: string | null = null;

function logWeatherNormalization(params: {
  inputKeys: string[];
  hasCurrent: boolean;
  hasForecast: boolean;
  windMph: number | null;
  source: ECSNormalizedWeatherSnapshot['source'];
}) {
  const key = `${params.inputKeys.join(',')}:${params.hasCurrent}:${params.hasForecast}:${params.windMph}:${params.source}`;
  if (lastNormalizeLogKey === key) return;
  lastNormalizeLogKey = key;
  ecsLog.dev('WEATHER', 'normalize_input', { keys: params.inputKeys }, {
    tag: '[WEATHER]',
    debugFlag: 'ECS_DEBUG_WEATHER',
    fingerprint: `normalize_input:${key}`,
    throttleMs: 5000,
    aggregateWindowMs: 30_000,
  });
  ecsLog.dev('WEATHER', 'normalize_output', {
    hasCurrent: params.hasCurrent,
    hasForecast: params.hasForecast,
    windMph: params.windMph,
  }, {
    tag: '[WEATHER]',
    debugFlag: 'ECS_DEBUG_WEATHER',
    fingerprint: `normalize_output:${key}`,
    throttleMs: 5000,
    aggregateWindowMs: 30_000,
  });
}

function buildNormalizedSnapshot(params: {
  result: WeatherFetchResult | null;
  current: WaypointWeather['current'] | null;
  raw: WaypointWeather | null;
  fetchedAt: string | null;
  statusKind: ECSWeatherStatusKind;
}): ECSNormalizedWeatherSnapshot {
  const { result, current, raw, fetchedAt, statusKind } = params;
  const units = result?.data.units === 'metric' ? 'metric' : 'imperial';
  const forecast = (Array.isArray(raw?.forecast) ? raw.forecast : [])
    .map(entry => normalizeForecastEntry(entry, units))
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .slice(0, 16);
  const temperatureF = normalizeWeatherTemperatureF(current, units);
  const temperatureC = normalizeWeatherTemperatureC(current, units);
  const feelsLikeF = normalizeFeelsLikeF(current, units);
  const windMph = normalizeWindSpeed(current?.wind_speed, 'mph');
  const windGustMph = normalizeWindSpeed(readFirstValue(current, ['wind_gust', 'windGust', 'gust', 'wind.gust']), 'mph');
  const windDirectionDeg = readFirstNumber(current, ['wind_deg', 'windDirectionDeg', 'wind_direction', 'wind.deg']);
  const precipitationChance = getPrecipChance(raw);
  const pressureHpa = safeNumber(current?.pressure);
  const sunrise =
    readFirstTimestampSeconds(current, ['sunrise', 'sunup', 'sunriseTime', 'sun_up', 'sys.sunrise']) ??
    forecast[0]?.sunrise ??
    null;
  const sunset =
    readFirstTimestampSeconds(current, ['sunset', 'sundown', 'sunsetTime', 'sun_down', 'sys.sunset']) ??
    forecast[0]?.sunset ??
    null;
  const highTemperatureF =
    normalizeTemperatureF(readFirstValue(current, ['temp_max', 'temperature_max', 'temperatureMax', 'temperatureHigh', 'tempHigh', 'high', 'highTemperature', 'temp.max', 'temperature.max', 'daily.high']), units) ??
    forecast[0]?.highTemperatureF ??
    null;
  const lowTemperatureF =
    normalizeTemperatureF(readFirstValue(current, ['temp_min', 'temperature_min', 'temperatureMin', 'temperatureLow', 'tempLow', 'low', 'lowTemperature', 'temp.min', 'temperature.min', 'daily.low']), units) ??
    forecast[0]?.lowTemperatureF ??
    null;
  const condition = current?.weather_main || current?.weather_description || undefined;
  const hasCurrent =
    temperatureF != null ||
    feelsLikeF != null ||
    windMph != null ||
    pressureHpa != null ||
    sunrise != null ||
    sunset != null ||
    precipitationChance != null ||
    Boolean(condition);

  return {
    source: statusKind === 'offline' || statusKind === 'stale'
      ? 'cache'
      : weatherSourceFromFetchSource(result?.source),
    ...(fetchedAt ? { updatedAt: fetchedAt } : null),
    ...(hasCurrent
      ? {
          current: {
            ...(temperatureF != null ? { tempF: temperatureF } : null),
            ...(temperatureC != null ? { tempC: temperatureC } : null),
            ...(temperatureF != null ? { temperature: temperatureF } : null),
            ...(temperatureF != null ? { temperatureF } : null),
            ...(temperatureC != null ? { temperatureC } : null),
            ...(feelsLikeF != null ? { feelsLikeF } : null),
            ...(condition ? { condition } : null),
            ...(windMph != null ? { windMph } : null),
            ...(windGustMph != null ? { windGustMph } : null),
            ...(windDirectionDeg != null ? { windDirectionDeg } : null),
            ...(precipitationChance != null ? { precipitationChance } : null),
            ...(pressureHpa != null ? { pressureHpa } : null),
            ...(sunrise != null ? { sunrise } : null),
            ...(sunset != null ? { sunset } : null),
            ...(highTemperatureF != null ? { highTemperatureF } : null),
            ...(lowTemperatureF != null ? { lowTemperatureF } : null),
          },
        }
      : null),
    forecast,
    ...(result?.error ? { error: sanitizeWeatherText(result.error) ?? result.error } : null),
  };
}

export function buildECSWeatherSnapshot(params: {
  result: WeatherFetchResult | null;
  waypoint?: WaypointWeather | null;
  loading?: boolean;
  waitingForGps?: boolean;
  permissionBlocked?: boolean;
  networkBlocked?: boolean;
  sourceType: ECSWeatherSourceType;
  locationFallback?: string | null;
  locationResolution?: ResolvedWeatherLocation | null;
}): ECSWeatherSnapshot {
  const {
    result,
    waypoint,
    loading = false,
    waitingForGps = false,
    permissionBlocked = false,
    networkBlocked = false,
    sourceType,
    locationFallback,
    locationResolution = null,
  } = params;
  const raw = waypoint ?? result?.data.results?.[0] ?? null;
  const fetchedAt = result?.data.fetched_at ?? null;
  const current = raw?.current ?? null;
  const units = result?.data.units === 'metric' ? 'metric' : 'imperial';
  const currentTemperatureF = normalizeWeatherTemperatureF(current, units);
  const currentFeelsLikeF = normalizeFeelsLikeF(current, units);
  const hasLiveCurrent = isMeaningfulCurrent(current);
  const preliminaryFreshness = getWeatherFreshness({
    source: result?.source ?? null,
    fetchedAt,
    cachedAt: result?.cachedAt ?? null,
    hasWeatherData: hasLiveCurrent || Boolean(raw?.forecast?.length || raw?.alerts?.length),
  });
  const ageMinutes = preliminaryFreshness.ageMinutes ?? getAgeMinutes(fetchedAt);
  const cacheAgeMs = getCacheAgeMs(result?.cachedAt ?? null);
  const statusKind = getStatusKind({
    permissionBlocked,
    networkBlocked,
    waitingForGps,
    loading,
    source: result?.source ?? null,
    error: result?.error ?? null,
    hasLiveCurrent,
    ageMinutes,
    stale: preliminaryFreshness.stale,
  });
  const normalized = buildNormalizedSnapshot({ result, current, raw, fetchedAt, statusKind });
  const effectiveSourceType = result?.source === 'cache_fresh' || result?.source === 'cache_stale' ? 'cached' : sourceType;
  const locationConfidence = getLocationConfidence({
    raw,
    source: result?.source ?? null,
    sourceType: effectiveSourceType,
    resolution: locationResolution,
  });
  const resolvedLocationLabel = locationResolution?.displayLabel ?? null;
  const resolvedLat =
    typeof locationResolution?.coordinate?.lat === 'number' && Number.isFinite(locationResolution.coordinate.lat)
      ? locationResolution.coordinate.lat
      : null;
  const resolvedLng =
    typeof locationResolution?.coordinate?.lng === 'number' && Number.isFinite(locationResolution.coordinate.lng)
      ? locationResolution.coordinate.lng
      : null;
  const locationLabel =
    resolvedLocationLabel ||
    raw?.label ||
    current?.location_name ||
    locationFallback ||
    null;
  const labelConfidence =
    locationResolution?.labelConfidence ??
    getFallbackLocationLabelConfidence(result?.source ?? null, effectiveSourceType);

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    logWeatherNormalization({
      inputKeys: result?.data ? Object.keys(result.data) : raw ? Object.keys(raw) : [],
      hasCurrent: Boolean(normalized.current),
      hasForecast: Boolean(normalized.forecast?.length),
      windMph: normalized.current?.windMph ?? null,
      source: normalized.source,
    });
  }

  return {
    locationName:
      resolvedLocationLabel ||
      raw?.label ||
      current?.location_name ||
      locationFallback ||
      (sourceType === 'route_origin' ? 'Route Origin' : 'Current Position'),
    location: {
      lat: resolvedLat ?? (typeof raw?.lat === 'number' && Number.isFinite(raw.lat) ? raw.lat : null),
      lng: resolvedLng ?? (typeof raw?.lng === 'number' && Number.isFinite(raw.lng) ? raw.lng : null),
      label: locationLabel,
      sourceType: effectiveSourceType,
      confidence: locationConfidence,
      labelConfidence,
      accuracyM: locationResolution?.accuracyM ?? null,
      stale: locationResolution?.stale ?? false,
      staleReason: locationResolution?.staleReason ?? null,
    },
    fetchedAt,
    sourceType: effectiveSourceType,
    provider: {
      id: 'ecs_weather',
      name: 'ECS Weather Pipeline',
      source: result?.source ?? null,
      units,
    },
    cache: {
      fetchedAt,
      cachedAt: result?.cachedAt ?? null,
      cacheAgeMs,
      freshness: preliminaryFreshness.freshness,
    },
    cacheAgeMs,
    locationConfidence,
    normalized,
    current: {
      temp: currentTemperatureF,
      feelsLike: currentFeelsLikeF,
      condition: current?.weather_main ?? null,
      description: current?.weather_description ?? null,
      iconCode: current?.weather_icon ?? null,
      windSpeed: normalizeWindSpeed(readFirstValue(current, ['wind_speed', 'windSpeed', 'wind.speed']), 'mph'),
      windGust: normalizeWindSpeed(readFirstValue(current, ['wind_gust', 'windGust', 'gust', 'wind.gust']), 'mph'),
      windDirection: getWindDirectionLabel(readFirstNumber(current, ['wind_deg', 'windDirectionDeg', 'wind_direction', 'wind.deg'])),
      humidity: safeNumber(current?.humidity),
      precipChance: getPrecipChance(raw),
      precipType: getPrecipType(raw),
      visibility: safeNumber(current?.visibility),
      pressure: safeNumber(current?.pressure),
      sunrise: readFirstTimestampSeconds(current, ['sunrise', 'sunup', 'sunriseTime', 'sun_up', 'sys.sunrise']) ?? normalized.current?.sunrise ?? null,
      sunset: readFirstTimestampSeconds(current, ['sunset', 'sundown', 'sunsetTime', 'sun_down', 'sys.sunset']) ?? normalized.current?.sunset ?? null,
      highTemperature: normalized.current?.highTemperatureF ?? null,
      lowTemperature: normalized.current?.lowTemperatureF ?? null,
    },
    alerts: Array.isArray(raw?.alerts)
      ? raw.alerts.map(alert => ({
          title: alert.title,
          type: alert.type,
          severity: alert.severity,
          effective: alert.effective ?? null,
          expires: alert.expires ?? null,
          description: alert.description,
        }))
      : [],
    hourly: [],
    daily: Array.isArray(raw?.forecast) ? raw.forecast.slice(0, 16) : [],
    status: {
      kind: statusKind,
      loading,
      source: result?.source ?? null,
      error: result?.error ?? null,
      stale: preliminaryFreshness.stale || statusKind === 'stale',
      freshness: preliminaryFreshness.freshness,
      ageMinutes,
      timestampMs: preliminaryFreshness.timestampMs,
      cachedAt: result?.cachedAt ?? null,
      label: sanitizeWeatherText(getStatusLabel(statusKind, ageMinutes)),
    },
    raw,
  };
}

export function getCurrentWeatherTemperatureF(snapshot: ECSWeatherSnapshot): number | null {
  return safeNumber(
    snapshot.normalized.current?.temperatureF ??
      snapshot.normalized.current?.tempF ??
      snapshot.normalized.current?.temperature ??
      snapshot.current.temp,
  );
}

export function formatWeatherHeadline(snapshot: ECSWeatherSnapshot): string {
  const condition = snapshot.current.condition ?? 'Weather';
  const temp = formatWeatherDegrees(getCurrentWeatherTemperatureF(snapshot));
  return `${condition} - ${temp}`;
}

export function formatWeatherWindLine(snapshot: ECSWeatherSnapshot): string {
  const wind = snapshot.current.windSpeed != null ? `${Math.round(snapshot.current.windSpeed)} mph` : '--';
  const direction = snapshot.current.windDirection ? ` ${snapshot.current.windDirection}` : '';
  const precipChance = snapshot.current.precipChance != null ? `${Math.round(snapshot.current.precipChance)}%` : '--';
  const precipLabel = snapshot.current.precipType === 'snow' ? 'Snow' : 'Rain';
  return `Wind ${wind}${direction} - ${precipLabel} ${precipChance}`;
}

export function formatWeatherAlertLine(snapshot: ECSWeatherSnapshot): string | null {
  const topAlert = snapshot.alerts[0];
  if (topAlert) {
    const suffix = topAlert.expires ? ` until ${new Date(topAlert.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}` : '';
    return `${topAlert.title}${suffix}`;
  }
  return snapshot.status.label;
}
