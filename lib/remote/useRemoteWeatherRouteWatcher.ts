import { useEffect, useRef } from 'react';

import type { ECSWeatherSnapshot } from '../ecsWeather';
import type { NavigateRouteSessionSnapshot } from '../navigateRouteSessionStore';
import { navigateRouteSessionStore } from '../navigateRouteSessionStore';
import { remotenessStore, type RemotenessOutput } from '../remotenessStore';
import type { RemotenessIndexOutput } from '../remotenessTypes';
import {
  getSharedOperationalWeatherState,
  subscribeSharedOperationalWeather,
} from '../useOperationalWeather';
import { bluPowerAuthority } from '../BluPowerAuthority';
import { assessRemoteWeatherHazard, type RemoteWeatherHazardInput } from './remoteWeatherHazardEngine';
import { publishRemoteWeatherBriefEvent } from './remoteWeatherBriefPublisher';
import { buildNavigateRouteConfidenceSummary } from './routeConfidenceSummary';

export const REMOTE_WEATHER_ROUTE_WATCH_INTERVAL_MS = 5 * 60 * 1000;
export const REMOTE_WEATHER_ROUTE_WATCH_DISTANCE_MI = 30;
export const REMOTE_WEATHER_ROUTE_WATCH_DURATION_MIN = 60;
export const REMOTE_WEATHER_ROUTE_WATCH_SEGMENT_MILES = 5;
export const REMOTE_WEATHER_RISK_MATERIAL_DELTA = 0.15;

export type RemoteWeatherRouteWatcherOptions = {
  enabled?: boolean;
  powerHours?: number | null;
  teamCount?: number | null;
  now?: () => number;
};

export type RemoteWeatherRiskSnapshot = {
  weatherRisk: number;
  windMph: number | null;
  precipProb: number | null;
  tempF: number | null;
  smokeRisk: number | null;
  fireRisk: number | null;
};

type RouteWatcherBuildInput = {
  route: NavigateRouteSessionSnapshot;
  remotenessIndex: RemotenessIndexOutput | null;
  remoteness: RemotenessOutput | null;
  weather: ECSWeatherSnapshot;
  powerHours?: number | null;
  teamCount?: number | null;
};

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function metersToMiles(value: number | null | undefined): number | null {
  return finiteNumber(value) ? Math.max(0, value / 1609.344) : null;
}

function secondsToMinutes(value: number | null | undefined): number | null {
  return finiteNumber(value) ? Math.max(0, value / 60) : null;
}

function normalizeProbability(value: number | null | undefined): number | null {
  if (!finiteNumber(value)) return null;
  return value > 1 ? clamp(value / 100) : clamp(value);
}

function textIncludesAny(value: string, needles: string[]): boolean {
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function weatherAlertRisk(severity: unknown): number {
  const normalized = String(severity ?? '').toLowerCase();
  if (normalized.includes('extreme') || normalized.includes('critical')) return 0.9;
  if (normalized.includes('severe') || normalized.includes('warning')) return 0.72;
  if (normalized.includes('watch')) return 0.58;
  if (normalized.includes('advisory') || normalized.includes('moderate')) return 0.45;
  if (normalized.includes('minor')) return 0.28;
  return 0.35;
}

export function deriveRemoteWeatherRiskFromSnapshot(
  snapshot: ECSWeatherSnapshot,
): RemoteWeatherRiskSnapshot {
  const tempF = finiteNumber(snapshot.current.temp)
    ? snapshot.current.temp
    : finiteNumber(snapshot.current.feelsLike)
      ? snapshot.current.feelsLike
      : null;
  const windMph = Math.max(
    finiteNumber(snapshot.current.windSpeed) ? snapshot.current.windSpeed : 0,
    finiteNumber(snapshot.current.windGust) ? snapshot.current.windGust : 0,
  ) || null;
  const precipProb = normalizeProbability(snapshot.current.precipChance);
  const weatherText = [
    snapshot.current.condition,
    snapshot.current.description,
    snapshot.current.precipType,
    ...snapshot.alerts.flatMap((alert) => [alert.title, alert.type, alert.severity, alert.description]),
  ].filter(Boolean).join(' ');

  let weatherRisk = 0;
  let smokeRisk: number | null = null;
  let fireRisk: number | null = null;

  for (const alert of snapshot.alerts) {
    const alertText = [alert.title, alert.type, alert.description].join(' ');
    const alertRisk = weatherAlertRisk(alert.severity);
    weatherRisk = Math.max(weatherRisk, alertRisk);
    if (textIncludesAny(alertText, ['smoke', 'air quality', 'ash'])) {
      smokeRisk = Math.max(smokeRisk ?? 0, alertRisk);
    }
    if (textIncludesAny(alertText, ['wildfire', 'fire', 'red flag'])) {
      fireRisk = Math.max(fireRisk ?? 0, alertRisk);
    }
    if (textIncludesAny(alertText, ['flood', 'flash flood'])) {
      weatherRisk = Math.max(weatherRisk, 0.75);
    }
  }

  if (windMph != null) {
    if (windMph >= 35) weatherRisk = Math.max(weatherRisk, 0.65);
    else if (windMph >= 25) weatherRisk = Math.max(weatherRisk, 0.45);
  }
  if (precipProb != null) {
    if (precipProb >= 0.7) weatherRisk = Math.max(weatherRisk, 0.55);
    else if (precipProb >= 0.4) weatherRisk = Math.max(weatherRisk, 0.35);
  }
  if (tempF != null && (tempF >= 100 || tempF <= 20)) {
    weatherRisk = Math.max(weatherRisk, 0.65);
  }
  if (textIncludesAny(weatherText, ['smoke', 'air quality', 'ash'])) {
    smokeRisk = Math.max(smokeRisk ?? 0, 0.6);
    weatherRisk = Math.max(weatherRisk, 0.5);
  }
  if (textIncludesAny(weatherText, ['wildfire', 'red flag'])) {
    fireRisk = Math.max(fireRisk ?? 0, 0.7);
    weatherRisk = Math.max(weatherRisk, 0.7);
  } else if (textIncludesAny(weatherText, ['fire'])) {
    fireRisk = Math.max(fireRisk ?? 0, 0.6);
    weatherRisk = Math.max(weatherRisk, 0.6);
  }

  if (snapshot.status.stale || snapshot.status.kind === 'offline' || snapshot.status.kind === 'stale') {
    weatherRisk = weatherRisk > 0 ? Math.max(0.15, weatherRisk * 0.85) : 0.15;
  } else if (snapshot.status.kind !== 'ready' && snapshot.status.kind !== 'live' && weatherRisk === 0) {
    weatherRisk = 0.1;
  }

  return {
    weatherRisk: Number(clamp(weatherRisk).toFixed(2)),
    windMph,
    precipProb,
    tempF,
    smokeRisk: smokeRisk == null ? null : Number(clamp(smokeRisk).toFixed(2)),
    fireRisk: fireRisk == null ? null : Number(clamp(fireRisk).toFixed(2)),
  };
}

function getRouteWindowDistanceMi(route: NavigateRouteSessionSnapshot, remotenessIndex: RemotenessIndexOutput | null): number {
  const remainingDistanceMi = metersToMiles(route.remainingDistanceM);
  if (remainingDistanceMi != null) {
    return Math.min(REMOTE_WEATHER_ROUTE_WATCH_DISTANCE_MI, remainingDistanceMi);
  }
  if (remotenessIndex?.forecast.available && finiteNumber(remotenessIndex.forecast.peakDistanceMi)) {
    return Math.min(REMOTE_WEATHER_ROUTE_WATCH_DISTANCE_MI, remotenessIndex.forecast.peakDistanceMi);
  }
  return REMOTE_WEATHER_ROUTE_WATCH_DISTANCE_MI;
}

function getRouteWindowEtaMinutes(route: NavigateRouteSessionSnapshot): number {
  const remainingMinutes = secondsToMinutes(route.remainingDurationS);
  return Math.min(REMOTE_WEATHER_ROUTE_WATCH_DURATION_MIN, remainingMinutes ?? REMOTE_WEATHER_ROUTE_WATCH_DURATION_MIN);
}

function getWindowForecastSegments(remotenessIndex: RemotenessIndexOutput | null) {
  const segments = remotenessIndex?.forecast.available ? remotenessIndex.forecast.segments : [];
  return segments.filter((segment) => (
    segment.distanceAheadMi <= REMOTE_WEATHER_ROUTE_WATCH_DISTANCE_MI ||
    segment.timeAheadMin <= REMOTE_WEATHER_ROUTE_WATCH_DURATION_MIN
  ));
}

function getWindowRemotenessScore(
  remotenessIndex: RemotenessIndexOutput | null,
  remoteness: RemotenessOutput | null,
): number {
  const forecastSegments = getWindowForecastSegments(remotenessIndex);
  const peakForecastScore = forecastSegments.reduce(
    (peak, segment) => Math.max(peak, finiteNumber(segment.score) ? segment.score : 0),
    0,
  );
  const indexScore = finiteNumber(remotenessIndex?.score) ? remotenessIndex.score : 0;
  const legacyScore = finiteNumber(remoteness?.score) ? remoteness.score : 0;
  return Math.round(clampScore(Math.max(peakForecastScore, indexScore, legacyScore)));
}

function getSignalLossMiles(
  remotenessIndex: RemotenessIndexOutput | null,
  routeDistanceWindowMi: number,
): number | null {
  const forecastSegments = getWindowForecastSegments(remotenessIndex);
  const noSignalSegments = forecastSegments.filter((segment) => segment.score >= 76);
  if (noSignalSegments.length > 0) {
    const first = noSignalSegments[0];
    const last = noSignalSegments[noSignalSegments.length - 1];
    return Math.max(10, Math.round((last.distanceAheadMi - first.distanceAheadMi) + 5));
  }

  const signal = remotenessIndex?.connectivity.signal;
  if (signal === 'no_signal' || signal === 'offline') {
    return Math.max(10, Math.round(routeDistanceWindowMi));
  }
  if (signal === 'weak' || signal === 'intermittent') {
    return Math.round(Math.max(0, Math.min(routeDistanceWindowMi, 12)));
  }
  return null;
}

function getCacheReady(
  remotenessIndex: RemotenessIndexOutput | null,
  remoteness: RemotenessOutput | null,
  weather: ECSWeatherSnapshot,
): boolean {
  const proximityEstimates = remotenessIndex?.proximity
    ? Object.values(remotenessIndex.proximity)
    : [];
  const hasCachedProximity = proximityEstimates.some((estimate) => estimate?.sourceState === 'cache');
  const hasCachedWeather =
    weather.status.source === 'cache_fresh' ||
    weather.status.source === 'cache_stale' ||
    weather.status.cachedAt != null;
  return Boolean(
    remoteness?.signals.cacheReady ||
    remoteness?.signals.expeditionDataReady ||
    hasCachedProximity ||
    hasCachedWeather,
  );
}

export function getRemoteWeatherRouteWatcherSegmentId(route: NavigateRouteSessionSnapshot): string {
  const routeKey = route.routeId ?? route.sessionId ?? 'active-route';
  const remainingMiles = metersToMiles(route.remainingDistanceM);
  const segmentBucket = remainingMiles == null
    ? 'unknown'
    : Math.floor(remainingMiles / REMOTE_WEATHER_ROUTE_WATCH_SEGMENT_MILES);
  const instructionKey = String(route.instruction ?? route.statusLabel ?? '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 48);
  return [route.source, routeKey, segmentBucket, instructionKey || 'segment'].join(':');
}

export function shouldEvaluateForWeatherRiskChange(
  previousRisk: number | null,
  nextRisk: number,
): boolean {
  return previousRisk == null || Math.abs(nextRisk - previousRisk) >= REMOTE_WEATHER_RISK_MATERIAL_DELTA;
}

export function buildRemoteWeatherHazardInputFromSnapshots(
  input: RouteWatcherBuildInput,
): RemoteWeatherHazardInput | null {
  if (input.route.lifecycle !== 'active' || !input.route.sessionId) return null;

  const routeDistanceWindowMi = getRouteWindowDistanceMi(input.route, input.remotenessIndex);
  const routeEtaWindowMinutes = getRouteWindowEtaMinutes(input.route);
  const weather = deriveRemoteWeatherRiskFromSnapshot(input.weather);
  const cacheReady = getCacheReady(input.remotenessIndex, input.remoteness, input.weather);
  const remotenessScore = getWindowRemotenessScore(input.remotenessIndex, input.remoteness);
  const routeConfidence = buildNavigateRouteConfidenceSummary({
    routePoints: input.route.routePoints,
    remotenessScore,
    cacheReady,
    powerHours: input.powerHours ?? null,
    weatherRisk: weather.weatherRisk,
    teamCount: input.teamCount ?? 1,
  });

  return {
    routeId: input.route.routeId ?? input.route.sessionId ?? undefined,
    segmentId: getRemoteWeatherRouteWatcherSegmentId(input.route),
    remotenessScore,
    routeConfidence: routeConfidence.confidence,
    weatherRisk: weather.weatherRisk,
    windMph: weather.windMph,
    precipProb: weather.precipProb,
    tempF: weather.tempF,
    smokeRisk: weather.smokeRisk,
    fireRisk: weather.fireRisk,
    signalLossMiles: getSignalLossMiles(input.remotenessIndex, routeDistanceWindowMi),
    cacheReady,
    powerHours: input.powerHours ?? null,
    distanceAheadMi: Math.round(routeDistanceWindowMi * 10) / 10,
    etaMinutes: Math.round(routeEtaWindowMinutes),
  };
}

function getPowerHours(optionPowerHours?: number | null): number | null {
  if (finiteNumber(optionPowerHours)) return optionPowerHours;
  try {
    const snapshot = bluPowerAuthority.getSnapshot();
    const runtimeMinutes = snapshot.hasPowerData && finiteNumber(snapshot.estimatedRuntimeMinutes)
      ? snapshot.estimatedRuntimeMinutes
      : null;
    return runtimeMinutes == null ? null : Math.max(0, runtimeMinutes / 60);
  } catch {
    return null;
  }
}

export function useRemoteWeatherRouteWatcher({
  enabled = true,
  powerHours,
  teamCount = 1,
  now = Date.now,
}: RemoteWeatherRouteWatcherOptions = {}): void {
  const lastRouteKeyRef = useRef<string | null>(null);
  const lastSegmentIdRef = useRef<string | null>(null);
  const lastWeatherRiskRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingEvaluationRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearRouteInterval = () => {
      if (intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const resetRouteState = () => {
      clearRouteInterval();
      lastRouteKeyRef.current = null;
      lastSegmentIdRef.current = null;
      lastWeatherRiskRef.current = null;
    };

    const evaluate = () => {
      if (!enabled) {
        resetRouteState();
        return;
      }

      const route = navigateRouteSessionStore.getSnapshot();
      if (route.lifecycle !== 'active' || !route.sessionId) {
        resetRouteState();
        return;
      }

      const weatherState = getSharedOperationalWeatherState();
      const hazardInput = buildRemoteWeatherHazardInputFromSnapshots({
        route,
        remotenessIndex: remotenessStore.getIndex(),
        remoteness: remotenessStore.get(),
        weather: weatherState.snapshot,
        powerHours: getPowerHours(powerHours),
        teamCount,
      });
      if (!hazardInput) return;

      lastWeatherRiskRef.current = hazardInput.weatherRisk;
      const hazard = assessRemoteWeatherHazard(hazardInput);
      if (!hazard.shouldEmit) return;

      publishRemoteWeatherBriefEvent({
        hazard,
        routeId: hazardInput.routeId,
        segmentId: hazardInput.segmentId,
        remotenessScore: hazardInput.remotenessScore,
        routeConfidence: hazardInput.routeConfidence,
        weatherRisk: hazardInput.weatherRisk,
        distanceAheadMi: hazardInput.distanceAheadMi,
        etaMinutes: hazardInput.etaMinutes,
        createdAt: now(),
      });
    };

    const scheduleEvaluation = () => {
      if (pendingEvaluationRef.current != null) return;
      pendingEvaluationRef.current = setTimeout(() => {
        pendingEvaluationRef.current = null;
        evaluate();
      }, 0);
    };

    const ensureRouteInterval = () => {
      if (intervalRef.current != null) return;
      intervalRef.current = setInterval(scheduleEvaluation, REMOTE_WEATHER_ROUTE_WATCH_INTERVAL_MS);
    };

    const handleRouteSnapshot = (route: NavigateRouteSessionSnapshot) => {
      if (!enabled || route.lifecycle !== 'active' || !route.sessionId) {
        resetRouteState();
        return;
      }

      ensureRouteInterval();
      const routeKey = `${route.source}:${route.routeId ?? route.sessionId}`;
      const segmentId = getRemoteWeatherRouteWatcherSegmentId(route);
      const routeStarted = routeKey !== lastRouteKeyRef.current;
      const segmentChanged = segmentId !== lastSegmentIdRef.current;

      lastRouteKeyRef.current = routeKey;
      lastSegmentIdRef.current = segmentId;

      if (routeStarted || segmentChanged) {
        scheduleEvaluation();
      }
    };

    const handleWeatherChange = () => {
      const route = navigateRouteSessionStore.getSnapshot();
      if (!enabled || route.lifecycle !== 'active' || !route.sessionId) return;

      const weatherRisk = deriveRemoteWeatherRiskFromSnapshot(
        getSharedOperationalWeatherState().snapshot,
      ).weatherRisk;
      if (shouldEvaluateForWeatherRiskChange(lastWeatherRiskRef.current, weatherRisk)) {
        scheduleEvaluation();
      }
    };

    const unsubscribeRoute = navigateRouteSessionStore.subscribe(handleRouteSnapshot);
    const unsubscribeWeather = subscribeSharedOperationalWeather(handleWeatherChange);

    handleRouteSnapshot(navigateRouteSessionStore.getSnapshot());

    return () => {
      unsubscribeRoute();
      unsubscribeWeather();
      clearRouteInterval();
      if (pendingEvaluationRef.current != null) {
        clearTimeout(pendingEvaluationRef.current);
        pendingEvaluationRef.current = null;
      }
    };
  }, [enabled, now, powerHours, teamCount]);
}
