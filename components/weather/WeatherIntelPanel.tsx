/**
 * Weather Intelligence Panel
 *
 * Main weather panel component that orchestrates weather data fetching
 * and displays current conditions, forecast, alerts, and trail conditions.
 *
 * Offline Support:
 * - Shows stale cached data with age indicator when offline
 * - Displays "unavailable" state gracefully with fallback data
 * - Auto-refreshes when connectivity is restored
 * - Never crashes when weather data is missing
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import {
  fetchSharedWeatherForCoordinates,
  getAnyCachedSharedWeather,
  getCachedSharedWeatherResult,
} from '../../lib/weatherService';
import {
  getWeatherAge,
  getWeatherStaleness,
  hasUsableWeatherResponse,
  type WeatherFetchResult,
} from '../../lib/weatherStore';
import type { ECSWeatherSnapshot } from '../../lib/ecsWeather';
import type { WeatherCoordinate, WaypointWeather } from '../../lib/weatherTypes';
import { getTrailOverallColor } from '../../lib/weatherTypes';
import { useApp } from '../../context/AppContext';
import CurrentConditionsCard from './CurrentConditionsCard';
import ForecastTimeline from './ForecastTimeline';
import WeatherAlerts from './WeatherAlerts';
import TrailConditionsCard from './TrailConditionsCard';
import { ecsLog } from '../../lib/ecsLogger';

type WeatherTab = 'current' | 'forecast' | 'trail';

const WEATHER_PANEL_FETCH_MEMORY_TTL_MS = 30 * 60 * 1000;
const WEATHER_PANEL_FETCH_MEMORY_LIMIT = 48;
const weatherPanelFetchMemory = new Map<string, {
  coords: WeatherCoordinate[];
  rememberedAt: number;
}>();

interface Props {
  coordinates?: WeatherCoordinate[];
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  locationLabel?: string;
  autoFetch?: boolean;
  compact?: boolean;
  units?: 'imperial' | 'metric';
  weatherSnapshot?: ECSWeatherSnapshot | null;
  onRefreshWeather?: (() => void) | null;
  frameless?: boolean;
  trailAssessmentActive?: boolean;
}

function coordsChanged(
  a: WeatherCoordinate[],
  b: WeatherCoordinate[],
): boolean {
  if (a.length !== b.length) return true;

  for (let i = 0; i < a.length; i += 1) {
    const latA = Number(a[i].lat.toFixed(3));
    const lngA = Number(a[i].lng.toFixed(3));
    const latB = Number(b[i].lat.toFixed(3));
    const lngB = Number(b[i].lng.toFixed(3));

    if (
      latA !== latB ||
      lngA !== lngB ||
      (a[i].label ?? '') !== (b[i].label ?? '')
    ) {
      return true;
    }
  }

  return false;
}

function buildWeatherPanelFetchKey(
  coords: WeatherCoordinate[],
  units: 'imperial' | 'metric',
): string {
  return `${coords.map(c => `${c.lat.toFixed(3)},${c.lng.toFixed(3)},${c.label ?? ''}`).join('|')}|${units}`;
}

function copyWeatherCoords(coords: WeatherCoordinate[]): WeatherCoordinate[] {
  return coords.map(coord => ({
    lat: coord.lat,
    lng: coord.lng,
    label: coord.label,
    accuracyM: coord.accuracyM,
    timestamp: coord.timestamp,
  }));
}

function pruneWeatherPanelFetchMemory(now = Date.now()): void {
  for (const [key, entry] of weatherPanelFetchMemory) {
    if (now - entry.rememberedAt > WEATHER_PANEL_FETCH_MEMORY_TTL_MS) {
      weatherPanelFetchMemory.delete(key);
    }
  }

  while (weatherPanelFetchMemory.size > WEATHER_PANEL_FETCH_MEMORY_LIMIT) {
    const oldestKey = weatherPanelFetchMemory.keys().next().value;
    if (!oldestKey) break;
    weatherPanelFetchMemory.delete(oldestKey);
  }
}

function rememberWeatherPanelFetchKey(
  fetchKey: string,
  coords: WeatherCoordinate[],
  now = Date.now(),
): void {
  if (!fetchKey || coords.length === 0) return;
  pruneWeatherPanelFetchMemory(now);
  weatherPanelFetchMemory.set(fetchKey, {
    coords: copyWeatherCoords(coords),
    rememberedAt: now,
  });
}

function getRememberedWeatherPanelCoords(
  fetchKey: string,
  now = Date.now(),
): WeatherCoordinate[] | null {
  if (!fetchKey) return null;
  const remembered = weatherPanelFetchMemory.get(fetchKey);
  if (!remembered) return null;
  if (now - remembered.rememberedAt > WEATHER_PANEL_FETCH_MEMORY_TTL_MS) {
    weatherPanelFetchMemory.delete(fetchKey);
    return null;
  }
  remembered.rememberedAt = now;
  return copyWeatherCoords(remembered.coords);
}

function hasUsableWeatherRows(rows: WaypointWeather[] | null | undefined): boolean {
  if (!rows || rows.length === 0) return false;
  return rows.some(weather =>
    weather.current?.temp != null ||
    weather.current?.temperature != null ||
    weather.current?.tempF != null ||
    weather.current?.temperatureF != null ||
    weather.current?.wind_speed != null ||
    weather.current?.weather_main ||
    weather.current?.weather_description ||
    (weather.forecast?.length ?? 0) > 0 ||
    (weather.alerts?.length ?? 0) > 0,
  );
}

function logWeatherPanelRetention(event: string, payload?: Record<string, unknown>): void {
  ecsLog.dev('WEATHER', event, payload, {
    tag: '[WEATHER]',
    debugFlag: 'ECS_DEBUG_WEATHER',
    fingerprint: `${event}:${JSON.stringify(payload ?? {})}`,
    throttleMs: 5000,
    aggregateWindowMs: 30_000,
  });
}

function getSnapshotError(snapshot: ECSWeatherSnapshot | null): string | null {
  switch (snapshot?.status.kind) {
    case 'permission_required':
    case 'permission-blocked':
      return 'Location permission is required to load live weather for your current position.';
    case 'network-blocked':
      return 'Network access is required to load live weather.';
    case 'offline':
      return 'Live weather is unavailable while offline.';
    case 'error':
    case 'provider_error':
      return snapshot.status.error || 'Weather data unavailable.';
    case 'unavailable':
      return snapshot.status.error || 'No valid weather location is available.';
    default:
      return snapshot?.status.error ?? null;
  }
}

function normalizeSunTimestampSeconds(value: unknown): number | null {
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

function resolveWeatherPanelCoordinates(params: {
  coordinates?: WeatherCoordinate[];
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  locationLabel?: string;
}): WeatherCoordinate[] {
  const { coordinates, latitude, longitude, locationLabel } = params;
  if (Array.isArray(coordinates) && coordinates.length > 0) {
    return coordinates.filter(c =>
      c != null &&
      Number.isFinite(c.lat) &&
      Number.isFinite(c.lng),
    );
  }

  if (latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return [{
      lat: latitude,
      lng: longitude,
      label: locationLabel || undefined,
    }];
  }

  return [];
}

export default function WeatherIntelPanel({
  coordinates,
  latitude,
  longitude,
  locationLabel,
  autoFetch = true,
  compact = false,
  units = 'imperial',
  weatherSnapshot = null,
  onRefreshWeather = null,
  frameless = false,
  trailAssessmentActive = true,
}: Props) {
  const { isOnline } = useApp();
  const initialCoords = resolveWeatherPanelCoordinates({
    coordinates,
    latitude,
    longitude,
    locationLabel,
  });
  const initialCachedWeatherRef = useRef<WeatherFetchResult | null>(
    weatherSnapshot ? null : getCachedSharedWeatherResult(initialCoords, units, { allowStale: true }),
  );
  const initialFetchKey = buildWeatherPanelFetchKey(initialCoords, units);
  const initialRememberedCoords = getRememberedWeatherPanelCoords(initialFetchKey);
  const initialHasFreshCache = initialCachedWeatherRef.current?.source === 'cache_fresh';

  const [tab, setTab] = useState<WeatherTab>('current');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<WaypointWeather[] | null>(
    () => initialCachedWeatherRef.current?.data.results ?? null,
  );
  const [fetchedAt, setFetchedAt] = useState<string | null>(
    () => initialCachedWeatherRef.current?.data.fetched_at ?? null,
  );
  const [expanded, setExpanded] = useState(!compact);
  const [selectedWaypointIdx, setSelectedWaypointIdx] = useState(0);
  const [dataSource, setDataSource] = useState<'live' | 'cache_fresh' | 'cache_stale' | 'fallback' | null>(
    () => initialCachedWeatherRef.current?.source ?? null,
  );
  const [cachedAt, setCachedAt] = useState<number | null>(
    () => initialCachedWeatherRef.current?.cachedAt ?? null,
  );

  const mountedRef = useRef(true);
  const lastGoodWeatherRef = useRef<{
    rows: WaypointWeather[];
    fetchedAt: string | null;
    dataSource: 'live' | 'cache_fresh' | 'cache_stale' | 'fallback' | null;
    cachedAt: number | null;
  } | null>(
    hasUsableWeatherResponse(initialCachedWeatherRef.current?.data)
      ? {
          rows: initialCachedWeatherRef.current?.data.results ?? [],
          fetchedAt: initialCachedWeatherRef.current?.data.fetched_at ?? null,
          dataSource: initialCachedWeatherRef.current?.source ?? null,
          cachedAt: initialCachedWeatherRef.current?.cachedAt ?? null,
        }
      : null,
  );
  const prevOnlineRef = useRef(isOnline);
  const prevCoordsRef = useRef<WeatherCoordinate[]>(
    initialRememberedCoords ?? (initialHasFreshCache ? copyWeatherCoords(initialCoords) : []),
  );
  const lastFetchKeyRef = useRef<string>(
    initialRememberedCoords || initialHasFreshCache ? initialFetchKey : '',
  );
  const injectedWeatherActive = weatherSnapshot != null;

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const effectiveCoords = useMemo<WeatherCoordinate[]>(() => {
    return resolveWeatherPanelCoordinates({ coordinates, latitude, longitude, locationLabel });
  }, [coordinates, latitude, longitude, locationLabel]);

  const effectiveCoordsKey = useMemo(
    () => buildWeatherPanelFetchKey(effectiveCoords, units),
    [effectiveCoords, units],
  );

  const injectedWeatherData = useMemo<WaypointWeather[] | null>(() => {
    if (!weatherSnapshot) return null;
    if (weatherSnapshot.status.source === 'fallback') return null;
    const canonicalCurrent = weatherSnapshot.current;
    const normalizedForecast = weatherSnapshot.normalized.forecast ?? [];
    const normalizedCurrent = weatherSnapshot.normalized.current ?? null;
    const firstNormalizedForecast = normalizedForecast[0] ?? null;
    const rawWeather = weatherSnapshot.raw ?? (
      canonicalCurrent.temp != null || normalizedCurrent || normalizedForecast.length > 0
        ? {
            lat: 0,
            lng: 0,
            label: weatherSnapshot.locationName ?? 'Current Position',
            error: null,
            current: {
              temp: canonicalCurrent.temp ?? normalizedCurrent?.temperatureF ?? normalizedCurrent?.tempF ?? null,
              temperature: canonicalCurrent.temp ?? normalizedCurrent?.temperatureF ?? normalizedCurrent?.tempF ?? null,
              tempF: canonicalCurrent.temp ?? normalizedCurrent?.temperatureF ?? normalizedCurrent?.tempF ?? null,
              temperatureF: canonicalCurrent.temp ?? normalizedCurrent?.temperatureF ?? normalizedCurrent?.tempF ?? null,
              tempC: normalizedCurrent?.tempC ?? null,
              temperatureC: normalizedCurrent?.tempC ?? null,
              temp_f: canonicalCurrent.temp ?? normalizedCurrent?.temperatureF ?? normalizedCurrent?.tempF ?? null,
              temp_c: normalizedCurrent?.tempC ?? null,
              feels_like: canonicalCurrent.feelsLike ?? normalizedCurrent?.feelsLikeF ?? null,
              feelsLikeF: canonicalCurrent.feelsLike ?? normalizedCurrent?.feelsLikeF ?? null,
              feelsLikeC: null,
              temp_min:
                canonicalCurrent.lowTemperature ??
                normalizedCurrent?.lowTemperatureF ??
                firstNormalizedForecast?.lowTemperatureF ??
                null,
              temp_max:
                canonicalCurrent.highTemperature ??
                normalizedCurrent?.highTemperatureF ??
                firstNormalizedForecast?.highTemperatureF ??
                null,
              humidity: canonicalCurrent.humidity ?? null,
              pressure: canonicalCurrent.pressure ?? normalizedCurrent?.pressureHpa ?? null,
              visibility: canonicalCurrent.visibility ?? null,
              wind_speed: canonicalCurrent.windSpeed ?? normalizedCurrent?.windMph ?? null,
              wind_deg: normalizedCurrent?.windDirectionDeg ?? null,
              wind_gust: canonicalCurrent.windGust ?? normalizedCurrent?.windGustMph ?? null,
              clouds: null,
              weather_id: null,
              weather_main: canonicalCurrent.condition ?? normalizedCurrent?.condition ?? null,
              weather_description: canonicalCurrent.description ?? normalizedCurrent?.condition ?? null,
              weather_icon: canonicalCurrent.iconCode ?? null,
              rain_1h: null,
              rain_3h: null,
              snow_1h: null,
              snow_3h: null,
              sunrise:
                canonicalCurrent.sunrise ??
                normalizedCurrent?.sunrise ??
                normalizeSunTimestampSeconds(firstNormalizedForecast?.sunrise) ??
                null,
              sunset:
                canonicalCurrent.sunset ??
                normalizedCurrent?.sunset ??
                normalizeSunTimestampSeconds(firstNormalizedForecast?.sunset) ??
                null,
              location_name: weatherSnapshot.locationName ?? 'Current Position',
              dt: weatherSnapshot.fetchedAt ? Math.floor(Date.parse(weatherSnapshot.fetchedAt) / 1000) : null,
            },
            forecast: null,
            alerts: weatherSnapshot.alerts,
            trail_conditions: null,
          }
        : null
    );
    if (!rawWeather) return null;
    const rawForecast = Array.isArray(rawWeather.forecast) ? rawWeather.forecast : [];
    const hydratedForecast = rawForecast.length > 0
      ? rawForecast.map((day, index) => {
          const normalized = normalizedForecast[index];
          if (!normalized) return day;
          return {
            ...day,
            date: day.date ?? normalized.time,
            temp_day: day.temp_day ?? normalized.temperatureF ?? null,
            temp_min: day.temp_min ?? normalized.lowTemperatureF ?? null,
            temp_max: day.temp_max ?? normalized.highTemperatureF ?? null,
            sunrise: normalizeSunTimestampSeconds(day.sunrise) ?? normalized.sunrise ?? null,
            sunset: normalizeSunTimestampSeconds(day.sunset) ?? normalized.sunset ?? null,
            wind_max: day.wind_max ?? normalized.windMph ?? null,
            wind_gust_max: day.wind_gust_max ?? normalized.windGustMph ?? null,
            wind_deg: day.wind_deg ?? normalized.windDirectionDeg ?? null,
            pop: day.pop ?? normalized.precipitationChance ?? 0,
            weather_main: day.weather_main ?? normalized.condition ?? null,
            weather_description: day.weather_description ?? normalized.condition ?? null,
          };
        })
      : normalizedForecast.map(day => ({
          date: day.time,
          temp_day: day.temperatureF ?? null,
          temp_min: day.lowTemperatureF ?? null,
          temp_max: day.highTemperatureF ?? null,
          humidity: null,
          pressure: null,
          wind_max: day.windMph ?? null,
          wind_gust_max: day.windGustMph ?? null,
          wind_deg: day.windDirectionDeg ?? null,
          pop: day.precipitationChance ?? 0,
          rain_total: 0,
          snow_total: 0,
          sunrise: normalizeSunTimestampSeconds(day.sunrise) ?? null,
          sunset: normalizeSunTimestampSeconds(day.sunset) ?? null,
          weather_id: null,
          weather_main: day.condition ?? 'Forecast',
          weather_description: day.condition ?? 'Forecast',
          weather_icon: '01d',
        }));
    const todayForecast = hydratedForecast[0] ?? null;
    return [{
      ...rawWeather,
      label: weatherSnapshot.locationName || rawWeather.label,
      forecast: hydratedForecast.slice(0, 16),
      current: rawWeather.current
        ? {
            ...rawWeather.current,
            temp: rawWeather.current.temp ?? canonicalCurrent.temp,
            temperature: rawWeather.current.temperature ?? canonicalCurrent.temp,
            tempF: rawWeather.current.tempF ?? canonicalCurrent.temp,
            temperatureF: rawWeather.current.temperatureF ?? canonicalCurrent.temp,
            feels_like: rawWeather.current.feels_like ?? canonicalCurrent.feelsLike,
            feelsLikeF: rawWeather.current.feelsLikeF ?? canonicalCurrent.feelsLike,
            wind_speed: rawWeather.current.wind_speed ?? canonicalCurrent.windSpeed,
            wind_gust: rawWeather.current.wind_gust ?? canonicalCurrent.windGust,
            humidity: rawWeather.current.humidity ?? canonicalCurrent.humidity,
            pressure: rawWeather.current.pressure ?? canonicalCurrent.pressure ?? weatherSnapshot.normalized.current?.pressureHpa ?? null,
            visibility: rawWeather.current.visibility ?? canonicalCurrent.visibility,
            temp_min:
              rawWeather.current.temp_min ??
              canonicalCurrent.lowTemperature ??
              weatherSnapshot.normalized.current?.lowTemperatureF ??
              todayForecast?.temp_min ??
              null,
            temp_max:
              rawWeather.current.temp_max ??
              canonicalCurrent.highTemperature ??
              weatherSnapshot.normalized.current?.highTemperatureF ??
              todayForecast?.temp_max ??
              null,
            sunrise:
              rawWeather.current.sunrise ??
              canonicalCurrent.sunrise ??
              weatherSnapshot.normalized.current?.sunrise ??
              normalizeSunTimestampSeconds(todayForecast?.sunrise) ??
              null,
            sunset:
              rawWeather.current.sunset ??
              canonicalCurrent.sunset ??
              weatherSnapshot.normalized.current?.sunset ??
              normalizeSunTimestampSeconds(todayForecast?.sunset) ??
              null,
            weather_main: rawWeather.current.weather_main ?? canonicalCurrent.condition,
            weather_description: rawWeather.current.weather_description ?? canonicalCurrent.description,
          }
        : rawWeather.current,
    }];
  }, [weatherSnapshot]);

  useEffect(() => {
    if (!injectedWeatherActive || !injectedWeatherData || !hasUsableWeatherRows(injectedWeatherData)) return;
    lastGoodWeatherRef.current = {
      rows: injectedWeatherData,
      fetchedAt: weatherSnapshot?.fetchedAt ?? null,
      dataSource: weatherSnapshot?.status.source ?? null,
      cachedAt: weatherSnapshot?.status.cachedAt ?? null,
    };
  }, [
    injectedWeatherActive,
    injectedWeatherData,
    weatherSnapshot?.fetchedAt,
    weatherSnapshot?.status.cachedAt,
    weatherSnapshot?.status.source,
  ]);

  const retainedInjectedWeatherRows =
    injectedWeatherActive && !injectedWeatherData && lastGoodWeatherRef.current
      ? lastGoodWeatherRef.current.rows
      : null;
  const effectiveWeatherData = injectedWeatherActive
    ? injectedWeatherData ?? retainedInjectedWeatherRows
    : weatherData;
  const effectiveDataSource = injectedWeatherActive
    ? weatherSnapshot?.status.source ?? lastGoodWeatherRef.current?.dataSource ?? null
    : dataSource;
  const effectiveStatusKind = injectedWeatherActive ? weatherSnapshot?.status.kind ?? 'error' : null;
  const effectiveLoading =
    injectedWeatherActive
      ? Boolean(weatherSnapshot?.status.loading || effectiveStatusKind === 'waiting_for_gps')
      : loading;
  const effectiveError = injectedWeatherActive ? getSnapshotError(weatherSnapshot) : error;

  const applyWeatherRows = useCallback((params: {
    rows: WaypointWeather[] | null | undefined;
    fetchedAt: string | null;
    dataSource: 'live' | 'cache_fresh' | 'cache_stale' | 'fallback' | null;
    cachedAt: number | null;
    reason: string;
  }) => {
    const usable = hasUsableWeatherRows(params.rows);
    if (usable && params.rows) {
      lastGoodWeatherRef.current = {
        rows: params.rows,
        fetchedAt: params.fetchedAt,
        dataSource: params.dataSource,
        cachedAt: params.cachedAt,
      };
      setWeatherData(params.rows);
      setFetchedAt(params.fetchedAt);
      setDataSource(params.dataSource);
      setCachedAt(params.cachedAt);
      setSelectedWaypointIdx(0);
      return true;
    }

    if (lastGoodWeatherRef.current) {
      logWeatherPanelRetention('empty_weather_update_ignored', {
        scope: 'weather_intel_panel',
        reason: params.reason,
        source: params.dataSource,
      });
      logWeatherPanelRetention('last_good_weather_retained', {
        scope: 'weather_intel_panel',
        source: lastGoodWeatherRef.current.dataSource,
      });
      setWeatherData(lastGoodWeatherRef.current.rows);
      setFetchedAt(lastGoodWeatherRef.current.fetchedAt);
      setDataSource(lastGoodWeatherRef.current.dataSource);
      setCachedAt(lastGoodWeatherRef.current.cachedAt);
      setSelectedWaypointIdx(0);
      return false;
    }

    setWeatherData(params.rows ?? null);
    setFetchedAt(params.fetchedAt);
    setDataSource(params.dataSource);
    setCachedAt(params.cachedAt);
    setSelectedWaypointIdx(0);
    return false;
  }, []);

  const selectedWeather = effectiveWeatherData && effectiveWeatherData.length > 0
    ? effectiveWeatherData[Math.min(selectedWaypointIdx, effectiveWeatherData.length - 1)]
    : null;
  const weatherDetailSource = injectedWeatherActive
    ? weatherSnapshot?.normalized.source ?? weatherSnapshot?.status.source ?? lastGoodWeatherRef.current?.dataSource ?? 'unavailable'
    : dataSource ?? 'unavailable';
  const weatherDetailHasTemp = selectedWeather?.current?.temp != null;
  const weatherDetailForecastCount = selectedWeather?.forecast?.length ?? 0;

  useEffect(() => {
    logWeatherPanelRetention('detail_render', {
      source: weatherDetailSource,
      hasTemp: weatherDetailHasTemp,
      hasForecast: weatherDetailForecastCount > 0,
    });
  }, [weatherDetailForecastCount, weatherDetailHasTemp, weatherDetailSource]);

  const totalAlerts = effectiveWeatherData
    ? effectiveWeatherData.reduce((sum, w) => sum + (w.alerts?.length || 0), 0)
    : 0;

  const hasAlerts = totalAlerts > 0;

  const worstTrailStatus = useMemo(() => {
    if (!effectiveWeatherData || effectiveWeatherData.length === 0) return null;
    const order = ['good', 'fair', 'poor', 'hazardous'];
    let worst = 0;

    for (const w of effectiveWeatherData) {
      const overall = w?.trail_conditions?.overall;
      if (!overall) continue;
      const idx = order.indexOf(overall);
      if (idx > worst) worst = idx;
    }

    return order[worst] as 'good' | 'fair' | 'poor' | 'hazardous';
  }, [effectiveWeatherData]);

  const stalenessInfo = useMemo(() => {
    const referenceTimestamp =
      injectedWeatherActive
        ? (() => {
            const parsed = Date.parse(weatherSnapshot?.fetchedAt ?? '');
            return Number.isFinite(parsed) ? parsed : null;
          })()
        : cachedAt;
    if (!referenceTimestamp) return null;
    return {
      age: getWeatherAge(referenceTimestamp),
      level: getWeatherStaleness(referenceTimestamp),
    };
  }, [cachedAt, injectedWeatherActive, weatherSnapshot?.fetchedAt]);

  const isFallback = effectiveDataSource === 'fallback';
  const isStale = effectiveDataSource === 'cache_stale' || effectiveStatusKind === 'stale';
  const trailSourceLabel = effectiveDataSource === 'live'
    ? 'Derived from live weather'
    : effectiveDataSource === 'cache_fresh'
      ? 'Derived from fresh cached weather'
      : effectiveDataSource === 'cache_stale'
        ? 'Derived from stale cached weather'
        : effectiveDataSource === 'fallback'
          ? 'Weather source unavailable'
          : null;
  const showOfflineBanner =
    !!effectiveWeatherData &&
    (
      !isOnline ||
      isStale ||
      isFallback ||
      effectiveStatusKind === 'permission-blocked' ||
      effectiveStatusKind === 'network-blocked' ||
      effectiveStatusKind === 'error'
    );
  const headerStatusText = useMemo(() => {
    if (selectedWeather?.current?.temp != null) {
      return `${Math.round(selectedWeather.current.temp)}° ${selectedWeather.current.weather_main || ''}`.trim();
    }
    if (!injectedWeatherActive) {
      return isFallback ? 'Data unavailable' : 'Awaiting conditions';
    }
    switch (weatherSnapshot?.status.kind) {
      case 'permission_required':
      case 'permission-blocked':
        return 'Location permission required';
      case 'network-blocked':
        return 'Network required';
      case 'waiting_for_gps':
        return 'Waiting for GPS';
      case 'loading':
        return 'Loading weather';
      case 'offline':
        return 'Offline weather unavailable';
      case 'cached':
        return 'Cached conditions';
      case 'error':
      case 'provider_error':
        return 'Weather unavailable';
      case 'unavailable':
        return 'Weather unavailable';
      case 'stale':
        return 'Cached conditions';
      default:
        return weatherSnapshot?.status.label || 'Awaiting conditions';
    }
  }, [injectedWeatherActive, isFallback, selectedWeather, weatherSnapshot]);

  const handleFetch = useCallback(async (force = false) => {
    if (injectedWeatherActive) {
      if (force) onRefreshWeather?.();
      return;
    }

    if (effectiveCoords.length === 0) {
      setError('No coordinates available for weather lookup');
      return;
    }

    const cached = getCachedSharedWeatherResult(effectiveCoords, units, { allowStale: true });
    if (!force && cached) {
      const fetchKey = buildWeatherPanelFetchKey(effectiveCoords, units);
      applyWeatherRows({
        rows: cached.data.results,
        fetchedAt: cached.data.fetched_at,
        dataSource: cached.source,
        cachedAt: cached.cachedAt,
        reason: 'fresh_or_stale_cache_before_fetch',
      });
      setError(null);
      prevCoordsRef.current = effectiveCoords;
      lastFetchKeyRef.current = fetchKey;
      if (cached.source === 'cache_fresh') {
        rememberWeatherPanelFetchKey(fetchKey, effectiveCoords);
      }
      if (cached.source === 'cache_fresh') {
        return;
      }
    }

    logWeatherPanelRetention('panel_fetch_triggered', {
      force,
      coords: effectiveCoords.length,
      first: effectiveCoords[0],
      units,
    });

    setLoading(true);
    setError(null);

    try {
      const sharedWeather = await fetchSharedWeatherForCoordinates(
        effectiveCoords,
        units,
        force,
        effectiveCoords.length > 1 ? 'route_segment' : 'selected_coordinate',
      );
      const result: WeatherFetchResult = sharedWeather.result;

      if (!mountedRef.current) return;

      const appliedUsableWeather = applyWeatherRows({
        rows: result.data.results,
        fetchedAt: result.data.fetched_at,
        dataSource: result.source,
        cachedAt: result.cachedAt,
        reason: 'fetch_result',
      });
      if (appliedUsableWeather) {
        const fetchKey = buildWeatherPanelFetchKey(effectiveCoords, units);
        prevCoordsRef.current = effectiveCoords;
        lastFetchKeyRef.current = fetchKey;
        rememberWeatherPanelFetchKey(fetchKey, effectiveCoords);
      }

      logWeatherPanelRetention('panel_fetch_completed', {
        source: result.source,
        results: result.data?.results?.length ?? 0,
        cachedAt: result.cachedAt,
        error: result.error,
      });

      if (!appliedUsableWeather && lastGoodWeatherRef.current) {
        setError(result.error || null);
      } else if (result.source === 'fallback') {
        setError(result.error || 'Weather data unavailable');
      } else if (result.source === 'cache_stale') {
        setError(result.error || 'Using cached data - unable to refresh');
      } else {
        setError(result.error || null);
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      console.warn('[WEATHER PANEL] Fetch failed', err?.message || err);
      setError(err?.message || 'Failed to fetch weather data');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [applyWeatherRows, effectiveCoords, injectedWeatherActive, onRefreshWeather, units]);

  useEffect(() => {
    if (injectedWeatherActive) return;
    if (effectiveCoords.length === 0) return;

    const cached = getAnyCachedSharedWeather(effectiveCoords, units);
    if (cached) {
      logWeatherPanelRetention('panel_cache_loaded', {
        coords: effectiveCoords.length,
        age: getWeatherAge(cached.cachedAt),
      });

      applyWeatherRows({
        rows: cached.data.results,
        fetchedAt: cached.data.fetched_at,
        dataSource: cached.source,
        cachedAt: cached.cachedAt,
        reason: 'cache_hydration',
      });
    }
  }, [applyWeatherRows, effectiveCoords, injectedWeatherActive, units]);

  useEffect(() => {
    if (injectedWeatherActive) return;
    if (!autoFetch) return;
    if (effectiveCoords.length === 0) return;

    const fetchKey = effectiveCoordsKey;
    const rememberedCoords = getRememberedWeatherPanelCoords(fetchKey);
    if (rememberedCoords && lastFetchKeyRef.current !== fetchKey) {
      prevCoordsRef.current = rememberedCoords;
      lastFetchKeyRef.current = fetchKey;
    }
    const firstTimeForKey = lastFetchKeyRef.current !== fetchKey;
    const cached = getCachedSharedWeatherResult(effectiveCoords, units, { allowStale: true });
    if (cached?.source === 'cache_fresh' && firstTimeForKey) {
      prevCoordsRef.current = effectiveCoords;
      lastFetchKeyRef.current = fetchKey;
      rememberWeatherPanelFetchKey(fetchKey, effectiveCoords);
    }
    const effectiveCoordsAreNew = cached?.source === 'cache_fresh'
      ? false
      : coordsChanged(prevCoordsRef.current, effectiveCoords);
    const effectiveFirstTimeForKey = cached?.source === 'cache_fresh'
      ? false
      : lastFetchKeyRef.current !== fetchKey;
    const hasWeatherData = Boolean(
      weatherData?.some(weather =>
        weather.current?.temp != null ||
        weather.current?.wind_speed != null ||
        weather.current?.weather_main ||
        weather.current?.weather_description ||
        (weather.forecast?.length ?? 0) > 0 ||
        (weather.alerts?.length ?? 0) > 0,
      ) || cached,
    );

    logWeatherPanelRetention('panel_auto_fetch_check', {
      coordsAreNew: effectiveCoordsAreNew,
      firstTimeForKey: effectiveFirstTimeForKey,
      coords: effectiveCoords.length,
      fetchKey,
      hasWeatherData,
      cachedSource: cached?.source ?? null,
    });

    if (cached) {
      applyWeatherRows({
        rows: cached.data.results,
        fetchedAt: cached.data.fetched_at,
        dataSource: cached.source,
        cachedAt: cached.cachedAt,
        reason: 'auto_fetch_cache_check',
      });
      setError(null);
      prevCoordsRef.current = effectiveCoords;
      lastFetchKeyRef.current = fetchKey;
      if (cached.source === 'cache_fresh') {
        rememberWeatherPanelFetchKey(fetchKey, effectiveCoords);
      }
      if (cached.source === 'cache_fresh') {
        return;
      }
    }

    if (effectiveCoordsAreNew || effectiveFirstTimeForKey || !hasWeatherData || cached?.source === 'cache_stale') {
      prevCoordsRef.current = effectiveCoords;
      lastFetchKeyRef.current = fetchKey;
      handleFetch(false);
    }
  }, [applyWeatherRows, autoFetch, effectiveCoords, effectiveCoordsKey, units, handleFetch, weatherData, injectedWeatherActive]);

  useEffect(() => {
    if (injectedWeatherActive) return;
    if (isOnline && !prevOnlineRef.current && effectiveCoords.length > 0) {
      logWeatherPanelRetention('panel_connectivity_restored_refreshing');
      handleFetch(true);
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, effectiveCoords.length, handleFetch, injectedWeatherActive]);

  if (effectiveCoords.length === 0 && !injectedWeatherActive) {
    return (
      <View style={[styles.emptyContainer, frameless ? styles.emptyContainerFrameless : null]}>
        <View style={styles.emptyHeader}>
          <Ionicons name="cloud-outline" size={14} color={TACTICAL.textMuted} />
          <Text style={styles.emptyTitle}>CURRENT CONDITIONS</Text>
        </View>
        <Text style={styles.emptyText}>
          No location data available. Add waypoints or enable GPS to view weather intelligence.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, frameless ? styles.containerFrameless : null]}>
      <TouchableOpacity
        style={[styles.panelHeader, frameless ? styles.panelHeaderFrameless : null]}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.85}
      >
        <View style={styles.panelHeaderLeft}>
          <View style={[
            styles.weatherIconBg,
            isFallback && { borderColor: 'rgba(138,138,133,0.28)', backgroundColor: 'rgba(138,138,133,0.12)' },
          ]}>
            <Ionicons
              name={isFallback ? 'cloud-offline-outline' : 'cloud-outline'}
              size={16}
              color={isFallback ? TACTICAL.textMuted : TACTICAL.amber}
            />
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.panelTitleRow}>
              {!isOnline && (
                <View style={styles.offlinePill}>
                  <View style={styles.offlineDot} />
                  <Text style={styles.offlinePillText}>OFFLINE</Text>
                </View>
              )}
            </View>

            <View style={styles.panelSubRow}>
              {selectedWeather?.current?.temp != null ? (
                <Text style={styles.panelTemp}>
                  {Math.round(selectedWeather.current.temp)}° {selectedWeather.current.weather_main || ''}
                </Text>
              ) : (
                <Text style={[styles.panelTemp, { color: TACTICAL.textMuted }]}>
                  {headerStatusText}
                </Text>
              )}

              {worstTrailStatus && (
                <View style={[
                  styles.trailMiniPill,
                  { backgroundColor: getTrailOverallColor(worstTrailStatus) + '18' },
                ]}>
                  <View
                    style={[
                      styles.trailMiniDot,
                      { backgroundColor: getTrailOverallColor(worstTrailStatus) },
                    ]}
                  />
                  <Text
                    style={[
                      styles.trailMiniText,
                      { color: getTrailOverallColor(worstTrailStatus) },
                    ]}
                  >
                    {worstTrailStatus.toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.panelHeaderRight}>
          {hasAlerts && (
            <View style={styles.alertBadge}>
              <Ionicons name="warning-outline" size={10} color="#EF5350" />
              <Text style={styles.alertBadgeText}>{totalAlerts}</Text>
            </View>
          )}
          {effectiveLoading && <ActivityIndicator size="small" color={TACTICAL.amber} />}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={TACTICAL.textMuted}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={[styles.panelBody, frameless ? styles.panelBodyFrameless : null]}>
          {showOfflineBanner && effectiveWeatherData && (
            <View
              style={[
                styles.statusBanner,
                isFallback ? styles.statusBannerError : styles.statusBannerWarn,
                frameless ? styles.statusBannerFrameless : null,
              ]}
            >
              <Ionicons
                name={isFallback ? 'cloud-offline-outline' : isStale ? 'time-outline' : 'wifi-outline'}
                size={13}
                color={isFallback ? '#EF5350' : '#FFB300'}
              />
              <View style={styles.statusBannerContent}>
                <Text
                  style={[
                    styles.statusBannerTitle,
                    { color: isFallback ? '#EF5350' : '#FFB300' },
                  ]}
                >
                  {isFallback
                    ? 'WEATHER UNAVAILABLE'
                    : effectiveStatusKind === 'permission-blocked'
                      ? 'LOCATION REQUIRED'
                      : effectiveStatusKind === 'network-blocked'
                        ? 'NETWORK REQUIRED'
                    : isStale
                      ? 'WEATHER STALE'
                      : 'OFFLINE MODE'}
                </Text>
                <Text style={styles.statusBannerDesc}>
                  {effectiveStatusKind === 'permission-blocked'
                    ? 'Enable location access to keep weather tied to your live device position.'
                    : effectiveStatusKind === 'network-blocked'
                      ? 'Connect to the internet to refresh live weather.'
                    : isFallback
                    ? 'Connect to fetch current conditions.'
                    : isStale && stalenessInfo
                      ? 'Connect to refresh conditions.'
                      : 'Weather will refresh when online.'}
                </Text>
              </View>
              {isOnline && (isStale || isFallback || effectiveStatusKind === 'network-blocked') && (
                <TouchableOpacity
                  style={styles.statusBannerRetry}
                  onPress={() => handleFetch(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh-outline" size={12} color={TACTICAL.amber} />
                </TouchableOpacity>
              )}
            </View>
          )}

            <View style={[styles.tabBar, frameless ? styles.tabBarFrameless : null]}>
            {([
              { key: 'current' as WeatherTab, label: 'CONDITIONS', icon: 'thermometer-outline' },
              { key: 'forecast' as WeatherTab, label: 'FORECAST', icon: 'calendar-outline' },
              { key: 'trail' as WeatherTab, label: 'TRAIL', icon: 'trail-sign-outline' },
            ]).map(t => {
              const isActive = tab === t.key;
              const isDisabled =
                (t.key === 'forecast' && (isFallback || !selectedWeather?.forecast?.length)) ||
                (t.key === 'trail' && trailAssessmentActive && !selectedWeather?.trail_conditions);

              return (
                <TouchableOpacity
                  key={t.key}
                  style={[
                    styles.tabBtn,
                    isActive && styles.tabBtnActive,
                    isDisabled && styles.tabBtnDisabled,
                  ]}
                  onPress={() => !isDisabled && setTab(t.key)}
                  activeOpacity={isDisabled ? 1 : 0.85}
                >
                  <Ionicons
                    name={t.icon as any}
                    size={12}
                    color={
                      isDisabled
                        ? `${TACTICAL.textMuted}50`
                        : isActive
                          ? TACTICAL.amber
                          : TACTICAL.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.tabLabel,
                      isActive && styles.tabLabelActive,
                      isDisabled && styles.tabLabelDisabled,
                    ]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {effectiveWeatherData && effectiveWeatherData.length > 1 && (
              <View style={[styles.waypointSelector, frameless ? styles.waypointSelectorFrameless : null]}>
              {effectiveWeatherData.map((w, idx) => (
                <TouchableOpacity
                  key={`${w.label ?? 'wp'}_${idx}`}
                  style={[
                    styles.waypointPill,
                    selectedWaypointIdx === idx && styles.waypointPillActive,
                  ]}
                  onPress={() => setSelectedWaypointIdx(idx)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="location-outline"
                    size={10}
                    color={selectedWaypointIdx === idx ? TACTICAL.amber : TACTICAL.textMuted}
                  />
                  <Text
                    style={[
                      styles.waypointPillText,
                      selectedWaypointIdx === idx && styles.waypointPillTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {w.label || `WP ${idx + 1}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {effectiveError && !effectiveWeatherData && !effectiveLoading && (
            <View style={[styles.errorBox, frameless ? styles.errorBoxFrameless : null]}>
              <Ionicons name="alert-circle-outline" size={16} color="#EF5350" />
              <Text style={styles.errorText}>{effectiveError}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => handleFetch(true)}
                disabled={!isOnline || effectiveStatusKind === 'permission-blocked'}
                activeOpacity={0.85}
              >
                <Text style={styles.retryText}>RETRY</Text>
              </TouchableOpacity>
            </View>
          )}

          {effectiveLoading && !effectiveWeatherData && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={TACTICAL.amber} />
              <Text style={styles.loadingText}>
                {effectiveStatusKind === 'waiting_for_gps'
                  ? 'WAITING FOR GPS FIX...'
                  : 'FETCHING WEATHER DATA...'}
              </Text>
            </View>
          )}

          {isFallback && selectedWeather && !selectedWeather.current?.temp && tab === 'current' && (
            <View style={[styles.fallbackBox, frameless ? styles.fallbackBoxFrameless : null]}>
              <Ionicons name="cloud-offline-outline" size={28} color={TACTICAL.textMuted} />
              <Text style={styles.fallbackTitle}>NO WEATHER DATA</Text>
              <Text style={styles.fallbackDesc}>
                Weather conditions are unavailable while offline.
                {'\n'}Connect to the internet to fetch current conditions.
              </Text>
              {isOnline && (
                <TouchableOpacity
                  style={styles.fallbackRetryBtn}
                  onPress={() => handleFetch(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh-outline" size={14} color={TACTICAL.amber} />
                  <Text style={styles.fallbackRetryText}>FETCH NOW</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {selectedWeather && !isFallback && (
            <View style={[styles.contentArea, frameless ? styles.contentAreaFrameless : null]}>
              {selectedWeather.alerts && selectedWeather.alerts.length > 0 && (
                <WeatherAlerts alerts={selectedWeather.alerts} />
              )}

              {tab === 'current' && selectedWeather.current && (
                <CurrentConditionsCard
                  conditions={selectedWeather.current}
                  locationName={selectedWeather.label}
                  units={units}
                />
              )}

              {tab === 'forecast' && selectedWeather.forecast && (
                <ForecastTimeline
                  forecast={selectedWeather.forecast}
                  units={units}
                />
              )}

              {tab === 'trail' && (!trailAssessmentActive || selectedWeather.trail_conditions) && (
                <TrailConditionsCard
                  conditions={selectedWeather.trail_conditions}
                  sourceLabel={trailSourceLabel}
                  assessmentActive={trailAssessmentActive}
                />
              )}
            </View>
          )}

          {isFallback && tab === 'trail' && selectedWeather && (!trailAssessmentActive || selectedWeather.trail_conditions) && (
            <View style={[styles.contentArea, frameless ? styles.contentAreaFrameless : null]}>
              <TrailConditionsCard
                conditions={selectedWeather.trail_conditions}
                sourceLabel={trailSourceLabel}
                assessmentActive={trailAssessmentActive}
              />
            </View>
          )}

          <View style={[styles.footer, styles.footerActionsOnly, frameless ? styles.footerFrameless : null]}>
            <TouchableOpacity
              style={[
                styles.refreshBtn,
                !isOnline && styles.refreshBtnDisabled,
              ]}
              onPress={() => handleFetch(true)}
              disabled={effectiveLoading || !isOnline || effectiveStatusKind === 'permission-blocked'}
              activeOpacity={0.85}
            >
              {effectiveLoading ? (
                <ActivityIndicator size="small" color={TACTICAL.amber} />
              ) : (
                <>
                  <Ionicons
                    name="refresh-outline"
                    size={12}
                    color={isOnline ? TACTICAL.amber : TACTICAL.textMuted}
                  />
                  <Text
                    style={[
                      styles.refreshText,
                      !isOnline && { color: TACTICAL.textMuted },
                    ]}
                  >
                    {isOnline ? 'REFRESH' : 'OFFLINE'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.35)',
    overflow: 'hidden',
  },
  containerFrameless: {
    marginTop: 0,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  emptyContainer: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.25)',
    padding: 14,
    gap: 8,
  },
  emptyContainerFrameless: {
    marginTop: 0,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  emptyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  emptyText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    lineHeight: 16,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  panelHeaderFrameless: {
    paddingHorizontal: 0,
    paddingTop: 2,
    paddingBottom: 12,
  },
  panelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  weatherIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(138,138,133,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.25)',
  },
  offlineDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#8A8A85',
  },
  offlinePillText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#8A8A85',
    letterSpacing: 1,
  },
  panelSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  panelTemp: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  trailMiniPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trailMiniDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  trailMiniText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },
  panelHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(239,83,80,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.25)',
  },
  alertBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#EF5350',
    fontFamily: 'Courier',
  },
  panelBody: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.20)',
  },
  panelBodyFrameless: {
    borderTopWidth: 0,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBannerFrameless: {
    marginHorizontal: 0,
  },
  statusBannerWarn: {
    backgroundColor: 'rgba(255,179,0,0.06)',
    borderColor: 'rgba(255,179,0,0.20)',
  },
  statusBannerError: {
    backgroundColor: 'rgba(239,83,80,0.06)',
    borderColor: 'rgba(239,83,80,0.20)',
  },
  statusBannerContent: {
    flex: 1,
  },
  statusBannerTitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  statusBannerDesc: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 2,
    lineHeight: 13,
  },
  statusBannerRetry: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.30)',
  },
  tabBar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tabBarFrameless: {
    paddingHorizontal: 0,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.20)',
  },
  tabBtnActive: {
    backgroundColor: 'rgba(196,138,44,0.10)',
    borderColor: 'rgba(196,138,44,0.35)',
  },
  tabBtnDisabled: {
    opacity: 0.4,
  },
  tabLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  tabLabelActive: {
    color: TACTICAL.amber,
  },
  tabLabelDisabled: {
    color: TACTICAL.textMuted,
  },
  waypointSelector: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  waypointSelectorFrameless: {
    paddingHorizontal: 0,
  },
  waypointPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.20)',
    maxWidth: 120,
  },
  waypointPillActive: {
    backgroundColor: 'rgba(196,138,44,0.10)',
    borderColor: 'rgba(196,138,44,0.35)',
  },
  waypointPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  waypointPillTextActive: {
    color: TACTICAL.amber,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.20)',
  },
  errorBoxFrameless: {
    marginHorizontal: 0,
  },
  errorText: {
    fontSize: 11,
    color: '#EF5350',
    flex: 1,
  },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(239,83,80,0.15)',
  },
  retryText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#EF5350',
    letterSpacing: 1,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
  loadingText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  fallbackBox: {
    alignItems: 'center',
    gap: 8,
    padding: 24,
    margin: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.20)',
  },
  fallbackBoxFrameless: {
    marginHorizontal: 0,
  },
  fallbackTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  fallbackDesc: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 15,
  },
  fallbackRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(196,138,44,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.30)',
    marginTop: 4,
  },
  fallbackRetryText: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  contentArea: {
    paddingHorizontal: 14,
    gap: 12,
    paddingBottom: 4,
  },
  contentAreaFrameless: {
    paddingHorizontal: 0,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.12)',
    marginTop: 8,
  },
  footerActionsOnly: {
    justifyContent: 'flex-end',
  },
  footerFrameless: {
    paddingHorizontal: 0,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(196,138,44,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.30)',
  },
  refreshBtnDisabled: {
    backgroundColor: 'rgba(62,79,60,0.06)',
    borderColor: 'rgba(62,79,60,0.15)',
  },
  refreshText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
});
