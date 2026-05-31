import { ecsLog } from '../ecsLogger';
import {
  resolveRouteContextFeatureFlags,
  type RouteContextFeatureFlagOverrides,
} from './routeContextConfig';
import type {
  Confidence,
  RouteContext,
  RouteContextWarning,
  SupplyMode,
} from './routeContextTypes';

export type RouteContextTelemetryEvent =
  | 'route_context_prefetch_started'
  | 'route_context_trailhead_resolved'
  | 'route_context_supply_candidates_found'
  | 'route_context_geometry_ready'
  | 'route_context_ready'
  | 'route_context_partial'
  | 'route_context_error'
  | 'route_context_cache_hit'
  | 'route_context_cache_stale'
  | 'route_context_job_cancelled';

export type RouteContextTelemetryProperties = {
  trailId?: string | null;
  tripId?: string | null;
  supplyMode?: SupplyMode | null;
  status?: string | null;
  confidenceBucket?: 'high' | 'medium' | 'low' | 'unknown';
  supplyCandidateCount?: number;
  campCandidateCount?: number;
  bailoutCandidateCount?: number;
  durationBucket?: string | null;
  cacheState?: 'miss' | 'hit' | 'stale' | 'refreshing' | 'fallback' | 'disabled' | 'cancelled' | null;
  warningCodes?: string[];
  providers?: {
    supplyAvailable: boolean;
    geometryAvailable: boolean;
    campAvailable: boolean;
    bailoutAvailable: boolean;
  };
};

export type RouteContextTelemetrySink = (
  event: RouteContextTelemetryEvent,
  properties: RouteContextTelemetryProperties,
) => void;

let telemetrySink: RouteContextTelemetrySink | null = null;
const testEvents: Array<{ event: RouteContextTelemetryEvent; properties: RouteContextTelemetryProperties }> = [];

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function confidenceBucket(confidence?: Confidence | null): RouteContextTelemetryProperties['confidenceBucket'] {
  const value = finiteNumber(confidence?.value);
  if (value == null) return 'unknown';
  if (value >= 0.78) return 'high';
  if (value >= 0.5) return 'medium';
  if (value > 0) return 'low';
  return 'unknown';
}

function durationBucket(durationMs?: number | null): string | null {
  const value = finiteNumber(durationMs);
  if (value == null || value < 0) return null;
  if (value < 250) return 'lt_250ms';
  if (value < 1000) return '250ms_1s';
  if (value < 3000) return '1s_3s';
  if (value < 10000) return '3s_10s';
  return 'gte_10s';
}

function warningCodes(warnings?: RouteContextWarning[] | null): string[] {
  return Array.from(new Set((warnings ?? []).map((warning) => warning.code).filter(Boolean))).slice(0, 12);
}

export function routeContextProviderAvailability(
  providers?: {
    supplyProvider?: unknown;
    geometryProvider?: unknown;
    campProvider?: unknown;
    bailoutProvider?: unknown;
  } | null,
): NonNullable<RouteContextTelemetryProperties['providers']> {
  return {
    supplyAvailable: providers?.supplyProvider != null,
    geometryAvailable: providers?.geometryProvider != null,
    campAvailable: providers?.campProvider != null,
    bailoutAvailable: providers?.bailoutProvider != null,
  };
}

export function sanitizeRouteContextTelemetryProperties(
  properties: RouteContextTelemetryProperties,
): RouteContextTelemetryProperties {
  return {
    trailId: properties.trailId == null ? null : String(properties.trailId),
    tripId: properties.tripId == null ? null : String(properties.tripId),
    supplyMode: properties.supplyMode ?? null,
    status: properties.status ?? null,
    confidenceBucket: properties.confidenceBucket ?? 'unknown',
    supplyCandidateCount: Math.max(0, Math.trunc(finiteNumber(properties.supplyCandidateCount) ?? 0)),
    campCandidateCount: Math.max(0, Math.trunc(finiteNumber(properties.campCandidateCount) ?? 0)),
    bailoutCandidateCount: Math.max(0, Math.trunc(finiteNumber(properties.bailoutCandidateCount) ?? 0)),
    durationBucket: properties.durationBucket ?? null,
    cacheState: properties.cacheState ?? null,
    warningCodes: Array.from(new Set((properties.warningCodes ?? []).map(String))).slice(0, 12),
    providers: properties.providers
      ? {
          supplyAvailable: properties.providers.supplyAvailable === true,
          geometryAvailable: properties.providers.geometryAvailable === true,
          campAvailable: properties.providers.campAvailable === true,
          bailoutAvailable: properties.providers.bailoutAvailable === true,
        }
      : undefined,
  };
}

export function routeContextTelemetryFromContext(
  context: RouteContext,
  options: {
    cacheState?: RouteContextTelemetryProperties['cacheState'];
    durationMs?: number | null;
    providers?: RouteContextTelemetryProperties['providers'];
  } = {},
): RouteContextTelemetryProperties {
  return sanitizeRouteContextTelemetryProperties({
    trailId: context.trailId,
    tripId: context.tripId ?? null,
    supplyMode: context.selectedSupplyMode ?? null,
    status: context.status,
    confidenceBucket: confidenceBucket(context.confidence),
    supplyCandidateCount: context.supplyCandidates.length,
    campCandidateCount: context.campCandidates.length,
    bailoutCandidateCount: context.bailoutCandidates.length,
    durationBucket: durationBucket(options.durationMs),
    cacheState: options.cacheState ?? null,
    warningCodes: warningCodes(context.warnings),
    providers: options.providers,
  });
}

export function emitRouteContextTelemetry(
  event: RouteContextTelemetryEvent,
  properties: RouteContextTelemetryProperties,
): void {
  const sanitized = sanitizeRouteContextTelemetryProperties(properties);
  testEvents.push({ event, properties: sanitized });
  if (testEvents.length > 200) testEvents.shift();
  try {
    telemetrySink?.(event, sanitized);
  } catch {
    // Telemetry must never break route context generation.
  }
}

function roundCoordinate(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed == null ? null : Math.round(parsed * 100) / 100;
}

function sanitizeDebugValue(value: unknown, keyHint = '', depth = 0): unknown {
  if (depth > 5) return '[redacted_depth]';
  const key = keyHint.toLowerCase();
  if (key.includes('token') || key.includes('key') || key.includes('secret')) return '[redacted]';
  if (key === 'encodedpolyline' || key === 'polyline' || key === 'coordinates') return '[redacted_geometry]';
  if (key.includes('address') || key.includes('name') || key.includes('label')) return '[redacted_text]';
  if (key === 'lat' || key === 'latitude') return roundCoordinate(value);
  if (key === 'lng' || key === 'lon' || key === 'longitude') return roundCoordinate(value);
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length > 96 ? `${value.slice(0, 96)}...` : value;
  if (Array.isArray(value)) return value.slice(0, 6).map((item) => sanitizeDebugValue(item, keyHint, depth + 1));
  if (typeof value !== 'object') return String(value);
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [itemKey, itemValue]) => {
    acc[itemKey] = sanitizeDebugValue(itemValue, itemKey, depth + 1);
    return acc;
  }, {});
}

export function sanitizeRouteContextDebugPayload(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeDebugValue(value);
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ? sanitized as Record<string, unknown>
    : { value: sanitized };
}

export function debugRouteContext(
  featureFlags: RouteContextFeatureFlagOverrides | undefined,
  message: string,
  details?: Record<string, unknown>,
): void {
  const flags = resolveRouteContextFeatureFlags(featureFlags);
  if (!flags['ecs.routeContextEngine.debugLogging']) return;
  ecsLog.debug('ROUTE_CONTEXT', message, sanitizeRouteContextDebugPayload(details ?? {}));
}

export function setRouteContextTelemetrySink(sink: RouteContextTelemetrySink | null): void {
  telemetrySink = sink;
}

export function getRouteContextTelemetryEvents(): Array<{ event: RouteContextTelemetryEvent; properties: RouteContextTelemetryProperties }> {
  return testEvents.map((entry) => ({
    event: entry.event,
    properties: { ...entry.properties },
  }));
}

export function clearRouteContextTelemetryEvents(): void {
  testEvents.length = 0;
}

export function routeContextDurationBucket(durationMs?: number | null): string | null {
  return durationBucket(durationMs);
}

export function routeContextWarningCodes(warnings?: RouteContextWarning[] | null): string[] {
  return warningCodes(warnings);
}

export function routeContextConfidenceBucket(confidence?: Confidence | null): RouteContextTelemetryProperties['confidenceBucket'] {
  return confidenceBucket(confidence);
}
