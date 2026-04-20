import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { buildECSWeatherSnapshot, type ECSWeatherSnapshot, type ECSWeatherSourceType } from './ecsWeather';
import {
  fetchWeatherForLocation,
  getAnyCachedWeather,
  type WeatherFetchResult,
} from './weatherStore';
import type { WeatherCoordinate } from './weatherTypes';

interface GPSInput {
  lat?: number | null;
  lng?: number | null;
  hasFix?: boolean;
}

interface UseOperationalWeatherOptions {
  enabled?: boolean;
  gps?: GPSInput | null;
  routeCoordinate?: WeatherCoordinate | null;
  units?: 'imperial' | 'metric';
  freshnessWindowMs?: number;
  movementThresholdM?: number;
}

interface UseOperationalWeatherResult {
  snapshot: ECSWeatherSnapshot;
  refresh: () => void;
  result: WeatherFetchResult | null;
}

const DEFAULT_FRESHNESS_WINDOW_MS = 20 * 60 * 1000;
const DEFAULT_MOVEMENT_THRESHOLD_M = 5000;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasUsableGps(gps?: GPSInput | null): gps is Required<GPSInput> {
  return !!gps &&
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
  units = 'imperial',
  freshnessWindowMs = DEFAULT_FRESHNESS_WINDOW_MS,
  movementThresholdM = DEFAULT_MOVEMENT_THRESHOLD_M,
}: UseOperationalWeatherOptions): UseOperationalWeatherResult {
  const { isOnline } = useApp();
  const [result, setResult] = useState<WeatherFetchResult | null>(null);
  const [loading, setLoading] = useState(false);

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const lastFetchAtRef = useRef(0);
  const lastFetchLocationRef = useRef<{ lat: number; lng: number; sourceType: ECSWeatherSourceType } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const target = useMemo(() => {
    if (hasUsableGps(gps)) {
      return {
        lat: gps.lat,
        lng: gps.lng,
        label: 'Current Position',
        sourceType: 'current_location' as ECSWeatherSourceType,
        waitingForGps: false,
      };
    }

    if (routeCoordinate && Number.isFinite(routeCoordinate.lat) && Number.isFinite(routeCoordinate.lng)) {
      return {
        lat: routeCoordinate.lat,
        lng: routeCoordinate.lng,
        label: routeCoordinate.label || 'Route Origin',
        sourceType: 'route_origin' as ECSWeatherSourceType,
        waitingForGps: false,
      };
    }

    return {
      lat: null,
      lng: null,
      label: 'Current Position',
      sourceType: 'current_location' as ECSWeatherSourceType,
      waitingForGps: true,
    };
  }, [gps, routeCoordinate]);

  useEffect(() => {
    if (target.lat == null || target.lng == null) return;
    const cached = getAnyCachedWeather([{ lat: target.lat, lng: target.lng, label: target.label }]);
    if (!cached) return;

    setResult(prev => prev ?? {
      data: cached.data,
      source: 'cache_stale',
      cachedAt: cached.cachedAt,
      error: null,
    });
  }, [target.label, target.lat, target.lng]);

  const runFetch = useCallback(async (force = false) => {
    if (!enabled || target.lat == null || target.lng == null) return;

    const now = Date.now();
    const lastFetch = lastFetchLocationRef.current;
    const locationChanged =
      !lastFetch ||
      lastFetch.sourceType !== target.sourceType ||
      haversineMeters(lastFetch.lat, lastFetch.lng, target.lat, target.lng) >= movementThresholdM;
    const isStale = now - lastFetchAtRef.current >= freshnessWindowMs;

    if (!force && !locationChanged && !isStale && result) {
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      const next = await fetchWeatherForLocation(target.lat, target.lng, units, force);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      setResult(next);
      lastFetchAtRef.current = Date.now();
      lastFetchLocationRef.current = {
        lat: target.lat,
        lng: target.lng,
        sourceType: target.sourceType,
      };
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [
    enabled,
    freshnessWindowMs,
    movementThresholdM,
    result,
    target.lat,
    target.lng,
    target.sourceType,
    units,
  ]);

  useEffect(() => {
    if (!enabled || target.lat == null || target.lng == null) return;
    void runFetch(false);
  }, [enabled, runFetch, target.lat, target.lng]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || target.lat == null || target.lng == null) return undefined;
      const due = Date.now() - lastFetchAtRef.current >= freshnessWindowMs;
      if (due || !result || (!isOnline && result.source === 'live')) {
        void runFetch(false);
      }
      return undefined;
    }, [enabled, freshnessWindowMs, isOnline, result, runFetch, target.lat, target.lng])
  );

  const refresh = useCallback(() => {
    void runFetch(true);
  }, [runFetch]);

  const snapshot = useMemo(() => {
    return buildECSWeatherSnapshot({
      result,
      loading,
      waitingForGps: target.waitingForGps,
      sourceType: target.sourceType,
      locationFallback: target.label,
    });
  }, [loading, result, target.label, target.sourceType, target.waitingForGps]);

  return {
    snapshot,
    refresh,
    result,
  };
}
