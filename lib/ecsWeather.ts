import type { WeatherFetchResult } from './weatherStore';
import type { DailyForecast, WaypointWeather, WeatherAlert } from './weatherTypes';

export type ECSWeatherStatusKind =
  | 'waiting_for_gps'
  | 'loading'
  | 'ready'
  | 'error'
  | 'offline'
  | 'stale';

export type ECSWeatherSourceType =
  | 'current_location'
  | 'route_origin'
  | 'route_segment'
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
}

export interface ECSWeatherAlert {
  title: string;
  severity: WeatherAlert['severity'];
  effective: string | null;
  expires: string | null;
  description: string;
}

export interface ECSWeatherSnapshot {
  locationName: string;
  fetchedAt: string | null;
  sourceType: ECSWeatherSourceType;
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
    ageMinutes: number | null;
    label: string | null;
  };
  raw: WaypointWeather | null;
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
  waitingForGps?: boolean;
  loading: boolean;
  source: WeatherFetchResult['source'] | null;
  error: string | null;
  hasLiveCurrent: boolean;
  ageMinutes: number | null;
}): ECSWeatherStatusKind {
  const { waitingForGps, loading, source, error, hasLiveCurrent, ageMinutes } = params;

  if (waitingForGps) return 'waiting_for_gps';
  if (loading && !hasLiveCurrent) return 'loading';
  if ((source === 'cache_stale' || source === 'fallback') && hasLiveCurrent) {
    return source === 'cache_stale' || (ageMinutes != null && ageMinutes > 45) ? 'stale' : 'offline';
  }
  if (!hasLiveCurrent && error) return source === 'fallback' ? 'offline' : 'error';
  return 'ready';
}

function getStatusLabel(kind: ECSWeatherStatusKind, ageMinutes: number | null): string | null {
  switch (kind) {
    case 'waiting_for_gps':
      return 'Waiting for GPS';
    case 'loading':
      return 'Loading weather';
    case 'error':
      return 'Weather unavailable';
    case 'offline':
      return ageMinutes != null ? 'Offline • last known forecast' : 'Weather unavailable';
    case 'stale':
      return ageMinutes != null ? `Stale • ${ageMinutes}m old` : 'Stale weather';
    default:
      return null;
  }
}

export function buildECSWeatherSnapshot(params: {
  result: WeatherFetchResult | null;
  waypoint?: WaypointWeather | null;
  loading?: boolean;
  waitingForGps?: boolean;
  sourceType: ECSWeatherSourceType;
  locationFallback?: string | null;
}): ECSWeatherSnapshot {
  const { result, waypoint, loading = false, waitingForGps = false, sourceType, locationFallback } = params;
  const raw = waypoint ?? result?.data.results?.[0] ?? null;
  const fetchedAt = result?.data.fetched_at ?? null;
  const ageMinutes = getAgeMinutes(fetchedAt);
  const current = raw?.current ?? null;
  const hasLiveCurrent = !!current && Object.values(current).some(value => value != null);
  const statusKind = getStatusKind({
    waitingForGps,
    loading,
    source: result?.source ?? null,
    error: result?.error ?? null,
    hasLiveCurrent,
    ageMinutes,
  });

  return {
    locationName:
      raw?.label ||
      current?.location_name ||
      locationFallback ||
      (sourceType === 'route_origin' ? 'Route Origin' : 'Current Position'),
    fetchedAt,
    sourceType: result?.source === 'cache_fresh' || result?.source === 'cache_stale' ? 'cached' : sourceType,
    current: {
      temp: safeNumber(current?.temp),
      feelsLike: safeNumber(current?.feels_like),
      condition: current?.weather_main ?? null,
      description: current?.weather_description ?? null,
      iconCode: current?.weather_icon ?? null,
      windSpeed: safeNumber(current?.wind_speed),
      windGust: safeNumber(current?.wind_gust),
      windDirection: getWindDirectionLabel(safeNumber(current?.wind_deg)),
      humidity: safeNumber(current?.humidity),
      precipChance: getPrecipChance(raw),
      precipType: getPrecipType(raw),
      visibility: safeNumber(current?.visibility),
    },
    alerts: Array.isArray(raw?.alerts)
      ? raw.alerts.map(alert => ({
          title: alert.title,
          severity: alert.severity,
          effective: alert.effective ?? null,
          expires: alert.expires ?? null,
          description: alert.description,
        }))
      : [],
    hourly: [],
    daily: Array.isArray(raw?.forecast) ? raw.forecast.slice(0, 5) : [],
    status: {
      kind: statusKind,
      loading,
      source: result?.source ?? null,
      error: result?.error ?? null,
      stale: statusKind === 'stale',
      ageMinutes,
      label: getStatusLabel(statusKind, ageMinutes),
    },
    raw,
  };
}

export function formatWeatherHeadline(snapshot: ECSWeatherSnapshot): string {
  const condition = snapshot.current.condition ?? 'Weather';
  const temp = snapshot.current.temp != null ? `${Math.round(snapshot.current.temp)}°` : '--';
  return `${condition} • ${temp}`;
}

export function formatWeatherWindLine(snapshot: ECSWeatherSnapshot): string {
  const wind = snapshot.current.windSpeed != null ? `${Math.round(snapshot.current.windSpeed)} mph` : '--';
  const direction = snapshot.current.windDirection ? ` ${snapshot.current.windDirection}` : '';
  const precipChance = snapshot.current.precipChance != null ? `${Math.round(snapshot.current.precipChance)}%` : '--';
  const precipLabel = snapshot.current.precipType === 'snow' ? 'Snow' : 'Rain';
  return `Wind ${wind}${direction} • ${precipLabel} ${precipChance}`;
}

export function formatWeatherAlertLine(snapshot: ECSWeatherSnapshot): string | null {
  const topAlert = snapshot.alerts[0];
  if (topAlert) {
    const suffix = topAlert.expires ? ` until ${new Date(topAlert.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}` : '';
    return `${topAlert.title}${suffix}`;
  }
  return snapshot.status.label;
}
