import type { ECSWeatherSnapshot } from './ecsWeather';
import { ecsLog } from './ecsLogger';
import type { ResolvedWeatherLocation } from './weatherLocationResolver';
import type { ResolvedECSWeatherTarget } from './weatherService';
import type { WeatherFetchResult } from './weatherStore';

export const WEATHER_DIAGNOSTICS_DEBUG_FLAG = 'ECS_DEBUG_WEATHER';
export const WEATHER_DIAGNOSTICS_TAG = '[WEATHER_DIAGNOSTICS]';
export const DEFAULT_WEATHER_PROVIDER_ENDPOINT = 'supabase:functions/get-weather';

export interface WeatherDiagnosticsInput {
  target?: ResolvedECSWeatherTarget | null;
  location?: ResolvedWeatherLocation | null;
  snapshot?: ECSWeatherSnapshot | null;
  result?: WeatherFetchResult | null;
  providerEndpoint?: string | null;
  lastProviderError?: string | null;
  nowMs?: number;
}

export interface WeatherDiagnosticsSnapshot {
  devOnly: true;
  selectedCoordinateSource: string;
  lat: number | null;
  lon: number | null;
  accuracyMeters: number | null;
  resolvedPlaceLabel: string;
  labelConfidence: string;
  providerEndpoint: string;
  fetchedAt: string | null;
  cacheAgeMs: number | null;
  weatherState: string;
  lastProviderError: string | null;
  diagnosticHint: string;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function coerceError(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  return String(value);
}

function stripSensitiveQueryValues(value: string): string {
  return value.replace(
    /([?&](?:appid|api_key|apikey|key|token|access_token|authorization)=)[^&\s]+/gi,
    '$1[redacted]',
  );
}

export function sanitizeWeatherProviderEndpoint(endpoint?: string | null): string {
  if (!endpoint || !endpoint.trim()) return DEFAULT_WEATHER_PROVIDER_ENDPOINT;
  const trimmed = endpoint.trim();

  try {
    const parsed = new URL(trimmed);
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (/^(appid|api_?key|key|token|access_token|authorization)$/i.test(key)) {
        parsed.searchParams.set(key, '[redacted]');
      }
    }
    return parsed.toString();
  } catch {
    return stripSensitiveQueryValues(trimmed);
  }
}

function resolveDiagnosticHint(input: WeatherDiagnosticsInput, error: string | null): string {
  const snapshot = input.snapshot ?? null;
  const location = input.location ?? input.target?.location ?? null;
  const state = snapshot?.status.kind ?? (location?.status === 'unavailable' ? 'unavailable' : 'unknown');

  if (state === 'permission_required' || /permission/i.test(location?.unavailableReason ?? '')) {
    return 'gps_permission';
  }
  if (location?.accuracyM != null && location.accuracyM > 250) {
    return 'gps_accuracy';
  }
  if (error || state === 'provider_error') {
    return 'provider_error';
  }
  if (snapshot?.status.stale || state === 'stale') {
    return 'cache_stale';
  }
  if (location?.shouldInvalidateLabel) {
    return 'reverse_geocode_label';
  }
  if (state === 'unavailable') {
    return 'location_unavailable';
  }
  return 'ok';
}

export function createWeatherDiagnostics(input: WeatherDiagnosticsInput): WeatherDiagnosticsSnapshot {
  const snapshot = input.snapshot ?? null;
  const location = input.location ?? input.target?.location ?? null;
  const targetCoordinate = input.target?.coordinate ?? null;
  const error = coerceError(input.lastProviderError ?? input.result?.error ?? snapshot?.status.error ?? null);
  const lat =
    finiteNumber(location?.coordinate?.lat) ??
    finiteNumber(targetCoordinate?.lat) ??
    finiteNumber(snapshot?.location.lat);
  const lon =
    finiteNumber(location?.coordinate?.lng) ??
    finiteNumber(targetCoordinate?.lng) ??
    finiteNumber(snapshot?.location.lng);

  return {
    devOnly: true,
    selectedCoordinateSource:
      location?.source ?? input.target?.source ?? snapshot?.location.sourceType ?? snapshot?.sourceType ?? 'unknown',
    lat,
    lon,
    accuracyMeters: finiteNumber(location?.accuracyM) ?? finiteNumber(snapshot?.location.accuracyM),
    resolvedPlaceLabel:
      location?.displayLabel ?? input.target?.label ?? snapshot?.location.label ?? snapshot?.locationName ?? 'Weather location unresolved',
    labelConfidence: location?.labelConfidence ?? snapshot?.location.labelConfidence ?? 'unknown',
    providerEndpoint: sanitizeWeatherProviderEndpoint(input.providerEndpoint),
    fetchedAt: snapshot?.fetchedAt ?? input.result?.data?.fetched_at ?? null,
    cacheAgeMs:
      finiteNumber(snapshot?.cacheAgeMs) ??
      finiteNumber(snapshot?.cache?.cacheAgeMs) ??
      (input.result?.cachedAt != null ? Math.max(0, (input.nowMs ?? Date.now()) - input.result.cachedAt) : null),
    weatherState: snapshot?.status.kind ?? (location?.status === 'unavailable' ? 'unavailable' : 'unknown'),
    lastProviderError: error,
    diagnosticHint: resolveDiagnosticHint(input, error),
  };
}

export function logWeatherDiagnostics(input: WeatherDiagnosticsInput): WeatherDiagnosticsSnapshot {
  const diagnostics = createWeatherDiagnostics(input);
  ecsLog.dev('WEATHER', 'weather_diagnostics', diagnostics, {
    tag: WEATHER_DIAGNOSTICS_TAG,
    debugFlag: WEATHER_DIAGNOSTICS_DEBUG_FLAG,
    fingerprint: [
      diagnostics.selectedCoordinateSource,
      diagnostics.lat?.toFixed(4) ?? 'no-lat',
      diagnostics.lon?.toFixed(4) ?? 'no-lon',
      diagnostics.resolvedPlaceLabel,
      diagnostics.weatherState,
      diagnostics.lastProviderError ?? 'no-error',
    ].join('|'),
    throttleMs: 2500,
    aggregateWindowMs: 10_000,
  });
  return diagnostics;
}
