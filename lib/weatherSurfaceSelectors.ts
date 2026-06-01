import type { ECSWeatherSnapshot } from './ecsWeather';
import type { WeatherFetchResult } from './weatherStore';
import type { DailyForecast, WeatherAlert, WeatherResponse, WaypointWeather } from './weatherTypes';
import { getWindDirection } from './weatherTypes';
import { getWeatherFreshness, parseWeatherTimestampMs } from './weatherFreshness';

export type UnifiedWeatherStaleness =
  | 'fresh'
  | 'aging'
  | 'stale'
  | 'very_stale'
  | 'unknown';

export type UnifiedWeatherSeverity =
  | 'none'
  | 'advisory'
  | 'warning'
  | 'extreme';

export interface UnifiedWeatherPointLike {
  label?: string | null;
  weather: WaypointWeather | null;
}

export interface UnifiedRouteWeatherLike {
  source: 'live' | 'cache_fresh' | 'cache_stale' | 'fallback' | null;
  lastFetchAt: number | null;
  allAlerts: WeatherAlert[];
  points: UnifiedWeatherPointLike[];
  hazardousCount: number;
  cautionCount: number;
  summary: {
    activePoint: UnifiedWeatherPointLike | null;
    headline: string | null;
    detail: string | null;
    severeLine: string | null;
    statusText: string | null;
  };
}

export interface UnifiedWeatherSurface {
  current: WaypointWeather | null;
  response: WeatherResponse | null;
  source: 'live' | 'cache' | 'none';
  staleness: UnifiedWeatherStaleness;
  currentStaleness: UnifiedWeatherStaleness;
  routeStaleness: UnifiedWeatherStaleness;
  ageLabel: string | null;
  severity: UnifiedWeatherSeverity;
  weatherSeverity: number;
  summaryLabel: string | null;
  label: string | null;
  windMph: number | null;
  windGustMph: number | null;
  windDirectionDeg: number | null;
  windDirectionLabel: string | null;
  visibilityMiles: number | null;
  precipitationIntensity: number | null;
  temperatureF: number | null;
  forecast: DailyForecast[];
  alertsCount: number;
  alerts: WeatherAlert[];
  results: WaypointWeather[];
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseTimestampMs(value: unknown): number | null {
  return parseWeatherTimestampMs(value);
}

function formatAgeLabel(ageMinutes: number | null): string | null {
  if (ageMinutes == null || !Number.isFinite(ageMinutes)) return null;
  return `${Math.max(0, Math.round(ageMinutes))} min old`;
}

function dedupeAlerts(alerts: WeatherAlert[]): WeatherAlert[] {
  const seen = new Set<string>();
  const deduped: WeatherAlert[] = [];
  for (const alert of alerts) {
    const key = [
      alert.severity ?? 'unknown',
      alert.type ?? 'unknown',
      alert.title?.trim().toLowerCase() ?? '',
      alert.effective ?? '',
      alert.expires ?? '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(alert);
  }
  return deduped;
}

function dedupeResults(results: (WaypointWeather | null | undefined)[]): WaypointWeather[] {
  const seen = new Set<string>();
  const deduped: WaypointWeather[] = [];

  for (const candidate of results) {
    if (!candidate) continue;
    const key = [
      safeNumber(candidate.lat)?.toFixed(5) ?? 'na',
      safeNumber(candidate.lng)?.toFixed(5) ?? 'na',
      candidate.label ?? candidate.current?.location_name ?? '',
      safeNumber(candidate.current?.dt) ?? 'na',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

function severityLabelFromScore(score: number): UnifiedWeatherSeverity {
  if (score >= 3) return 'extreme';
  if (score >= 2) return 'warning';
  if (score >= 1) return 'advisory';
  return 'none';
}

function classifyWeatherSeverityScore(weather: WaypointWeather | null): 0 | 1 | 2 | 3 {
  if (!weather) return 0;

  const alerts = Array.isArray(weather.alerts) ? weather.alerts : [];
  if (alerts.some((alert) => alert?.severity === 'extreme')) return 3;
  if (alerts.some((alert) => alert?.severity === 'warning')) return 2;
  if (alerts.some((alert) => alert?.severity === 'advisory')) return 1;

  const current = weather.current;
  const wind = safeNumber(current?.wind_speed) ?? 0;
  const visibility = safeNumber(current?.visibility);
  const main = String(current?.weather_main ?? '').toLowerCase();

  if (wind >= 40 || (visibility != null && visibility <= 500)) return 3;
  if (
    wind >= 25 ||
    (visibility != null && visibility <= 1600) ||
    main.includes('thunderstorm') ||
    main.includes('snow')
  ) {
    return 2;
  }
  if (
    wind >= 15 ||
    (visibility != null && visibility <= 5000) ||
    main.includes('rain') ||
    main.includes('drizzle') ||
    main.includes('fog') ||
    main.includes('mist') ||
    main.includes('haze')
  ) {
    return 1;
  }
  return 0;
}

export function getWeatherSnapshotStaleness(snapshot: ECSWeatherSnapshot): UnifiedWeatherStaleness {
  if (snapshot.status.freshness && snapshot.status.freshness !== 'missing') {
    return snapshot.status.freshness === 'unknown' ? 'unknown' : snapshot.status.freshness;
  }

  const freshness = getWeatherFreshness({
    source: snapshot.status.source,
    fetchedAt: snapshot.fetchedAt,
    updatedAt: snapshot.normalized.updatedAt,
    cachedAt: snapshot.status.cachedAt ?? snapshot.status.timestampMs,
    hasWeatherData: Boolean(snapshot.raw || snapshot.daily.length || snapshot.alerts.length),
  }).freshness;
  if (freshness === 'missing') return 'unknown';
  return freshness;
}

function routeStaleness(routeWeather?: UnifiedRouteWeatherLike | null): UnifiedWeatherStaleness {
  if (!routeWeather) return 'unknown';
  const hasRouteWeatherData =
    routeWeather.points.some(point => !!point.weather) ||
    routeWeather.allAlerts.length > 0;
  if (!hasRouteWeatherData) return 'unknown';
  const freshness = getWeatherFreshness({
    source: routeWeather.source,
    cachedAt: routeWeather.lastFetchAt,
    hasWeatherData: hasRouteWeatherData,
  }).freshness;
  if (freshness === 'missing') return 'unknown';
  return freshness === 'unknown' ? 'unknown' : freshness;
}

function stalenessRank(staleness: UnifiedWeatherStaleness): number {
  switch (staleness) {
    case 'very_stale':
      return 4;
    case 'stale':
      return 3;
    case 'aging':
      return 2;
    case 'fresh':
      return 1;
    default:
      return 0;
  }
}

function pickWorseStaleness(
  left: UnifiedWeatherStaleness,
  right: UnifiedWeatherStaleness,
): UnifiedWeatherStaleness {
  return stalenessRank(left) >= stalenessRank(right) ? left : right;
}

function mapUnifiedSource(
  snapshot: ECSWeatherSnapshot,
  routeWeather?: UnifiedRouteWeatherLike | null,
): 'live' | 'cache' | 'none' {
  if (snapshot.status.source === 'live' || routeWeather?.source === 'live') return 'live';
  if (
    snapshot.status.source === 'cache_fresh' ||
    snapshot.status.source === 'cache_stale' ||
    routeWeather?.source === 'cache_fresh' ||
    routeWeather?.source === 'cache_stale'
  ) {
    return 'cache';
  }
  return 'none';
}

function mergeCurrentWithAlerts(
  weather: WaypointWeather | null,
  alerts: WeatherAlert[],
): WaypointWeather | null {
  if (!weather) return null;
  return {
    ...weather,
    alerts,
  };
}

function buildMergedResponse(params: {
  result: WeatherFetchResult | null;
  results: WaypointWeather[];
  routeWeather?: UnifiedRouteWeatherLike | null;
}): WeatherResponse | null {
  const { result, results, routeWeather } = params;
  if (results.length === 0) return null;

  const fetchedAtMs = Math.max(
    parseTimestampMs(result?.data?.fetched_at) ?? 0,
    parseTimestampMs(routeWeather?.lastFetchAt) ?? 0,
  );

  const fetchedAt =
    (fetchedAtMs > 0 ? new Date(fetchedAtMs).toISOString() : null) ??
    result?.data?.fetched_at ??
    null;

  if (!fetchedAt) return null;

  return {
    results,
    fetched_at: fetchedAt,
    units: result?.data?.units ?? 'imperial',
  };
}

export function hasUsableWeatherPayload(
  weather:
    | Partial<Pick<UnifiedWeatherSurface, 'current' | 'response'>>
    | null
    | undefined,
): boolean {
  if (!weather) return false;
  if (weather.current) return true;
  if (weather.response?.results && weather.response.results.length > 0) return true;
  return false;
}

export function getWeatherSolarTimes(weather: WaypointWeather | null | undefined): {
  sunrise: number | null;
  sunset: number | null;
} {
  const firstForecast = weather?.forecast?.[0] ?? null;
  return {
    sunrise: safeNumber(weather?.current?.sunrise) ?? safeNumber(firstForecast?.sunrise),
    sunset: safeNumber(weather?.current?.sunset) ?? safeNumber(firstForecast?.sunset),
  };
}

export function buildUnifiedWeatherCorridor(params: {
  snapshot: ECSWeatherSnapshot;
  result: WeatherFetchResult | null;
  routeWeather?: UnifiedRouteWeatherLike | null;
}): UnifiedWeatherSurface {
  const { snapshot, result, routeWeather } = params;
  const routePoints = routeWeather?.points ?? [];
  const routeResults = routePoints.map((point) => point.weather);
  const mergedAlerts = dedupeAlerts([
    ...(snapshot.raw?.alerts ?? []),
    ...(routeWeather?.allAlerts ?? []),
  ]);
  const mergedResults = dedupeResults([
    snapshot.raw,
    ...(result?.data?.results ?? []),
    ...routeResults,
  ]);

  const routeActiveWeather = routeWeather?.summary?.activePoint?.weather ?? null;
  const currentBase = snapshot.raw ?? routeActiveWeather ?? mergedResults[0] ?? null;
  const current = mergeCurrentWithAlerts(currentBase, mergedAlerts);

  const routeSeverity = Math.max(
    routeWeather?.hazardousCount ? 3 : 0,
    routeWeather?.cautionCount ? 1 : 0,
    ...routeResults.map((point) => classifyWeatherSeverityScore(point)),
  );
  const snapshotSeverity = classifyWeatherSeverityScore(current);
  const weatherSeverity = Math.max(snapshotSeverity, routeSeverity);
  const severity = severityLabelFromScore(weatherSeverity);

  const routeAgeMinutes = (() => {
    const fetchedAtMs = parseTimestampMs(routeWeather?.lastFetchAt);
    if (fetchedAtMs == null) return null;
    return Math.max(0, Math.round((Date.now() - fetchedAtMs) / 60000));
  })();

  const currentStaleness = getWeatherSnapshotStaleness(snapshot);
  const routeWeatherStaleness = routeStaleness(routeWeather);
  const staleness =
    currentStaleness !== 'unknown'
      ? currentStaleness
      : routeWeatherStaleness;

  const activeCurrent = routeActiveWeather?.current ?? null;
  const activeForecast = current?.forecast ?? routeActiveWeather?.forecast ?? snapshot.daily ?? [];
  const visibilityMeters =
    safeNumber(snapshot.current.visibility) ??
    safeNumber(activeCurrent?.visibility);
  const visibilityMiles =
    visibilityMeters != null ? Number((visibilityMeters / 1609.34).toFixed(1)) : null;

  const precipitationIntensity =
    safeNumber(snapshot.current.precipChance) ??
    safeNumber(routeActiveWeather?.forecast?.[0]?.pop) ??
    safeNumber(activeCurrent?.rain_1h) ??
    safeNumber(activeCurrent?.rain_3h) ??
    safeNumber(activeCurrent?.snow_1h) ??
    safeNumber(activeCurrent?.snow_3h);

  const windDirectionDeg =
    safeNumber(snapshot.normalized.current?.windDirectionDeg) ??
    safeNumber(current?.current?.wind_deg) ??
    safeNumber(activeCurrent?.wind_deg);

  return {
    current,
    response: buildMergedResponse({ result, results: mergedResults, routeWeather }),
    source: mapUnifiedSource(snapshot, routeWeather),
    staleness,
    currentStaleness,
    routeStaleness: routeWeatherStaleness,
    ageLabel: formatAgeLabel(routeAgeMinutes ?? snapshot.status.ageMinutes),
    severity,
    weatherSeverity,
    summaryLabel:
      routeWeather?.summary?.severeLine ??
      routeWeather?.summary?.headline ??
      routeWeather?.summary?.detail ??
      snapshot.status.label ??
      snapshot.current.description ??
      snapshot.current.condition ??
      null,
    label:
      snapshot.current.condition ??
      snapshot.current.description ??
      routeActiveWeather?.current?.weather_main ??
      null,
    windMph:
      safeNumber(snapshot.current.windSpeed) ??
      safeNumber(activeCurrent?.wind_speed),
    windGustMph:
      safeNumber(snapshot.current.windGust) ??
      safeNumber(current?.current?.wind_gust) ??
      safeNumber(activeCurrent?.wind_gust),
    windDirectionDeg,
    windDirectionLabel: windDirectionDeg != null
      ? getWindDirection(windDirectionDeg)
      : snapshot.current.windDirection ?? null,
    visibilityMiles,
    precipitationIntensity,
    temperatureF:
      safeNumber(snapshot.current.temp) ??
      safeNumber(activeCurrent?.temp),
    forecast: Array.isArray(activeForecast) ? activeForecast.slice(0, 16) : [],
    alertsCount: mergedAlerts.length,
    alerts: mergedAlerts,
    results: mergedResults,
  };
}
