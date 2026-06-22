/**
 * App-side OpenWeather request boundary.
 *
 * OpenWeather provider URLs and secrets stay server-side in the Supabase Edge Function.
 * Mobile code must pass through this client before invoking that function so ECS can
 * apply session telemetry, local kill switches, and development guardrails.
 */
import { ecsLog } from './ecsLogger';
import { supabase } from './supabase';

export const ECS_WEATHER_DEBUG_FLAG = 'EXPO_PUBLIC_ECS_WEATHER_DEBUG';
export const ECS_DISABLE_OPENWEATHER_FLAG = 'EXPO_PUBLIC_ECS_DISABLE_OPENWEATHER';
export const OPENWEATHER_COORDINATE_BUCKET_DECIMALS = 3;
export const OPENWEATHER_SESSION_CALL_LIMIT_ESTIMATE = 120;
export const OPENWEATHER_CALLS_PER_MINUTE_LIMIT_ESTIMATE = 30;

export interface OpenWeatherEdgeInvokeResult {
  data: any;
  error: any;
}

export interface OpenWeatherClientEnv {
  [key: string]: string | boolean | number | undefined;
}

export interface OpenWeatherInvokeContext {
  source: string;
  screen?: string | null;
  routeSessionId?: string | null;
  requestKey?: string | null;
  env?: OpenWeatherClientEnv;
  nowMs?: number;
  invoke?: (body: Record<string, unknown>) => Promise<OpenWeatherEdgeInvokeResult>;
}

export interface OpenWeatherTelemetryEventInput {
  source: string;
  screen?: string | null;
  routeSessionId?: string | null;
  requestKey?: string | null;
  coordinateBuckets?: string[];
  coordinateCount?: number;
  reason?: string | null;
  nowMs?: number;
}

export interface OpenWeatherScreenTelemetry {
  edgeFunctionInvocations: number;
  totalOpenWeatherCallEstimate: number;
  cacheHits: number;
  cacheMisses: number;
  staleCacheReturns: number;
  duplicateCallsAvoided: number;
  rateLimitDenials: number;
  killSwitchDenials: number;
}

export interface OpenWeatherSessionTelemetrySnapshot {
  debugFlag: typeof ECS_WEATHER_DEBUG_FLAG;
  disableFlag: typeof ECS_DISABLE_OPENWEATHER_FLAG;
  totalOpenWeatherCallEstimate: number;
  edgeFunctionInvocations: number;
  callsPerMinuteEstimate: number;
  callsByScreen: Record<string, OpenWeatherScreenTelemetry>;
  callsByRouteSession: Record<string, OpenWeatherScreenTelemetry>;
  uniqueCoordinateBuckets: string[];
  cacheHits: number;
  cacheMisses: number;
  staleCacheReturns: number;
  duplicateCallsAvoided: number;
  rateLimitDenials: number;
  killSwitchDenials: number;
  bypassWarnings: number;
  lastEvents: Array<Record<string, unknown>>;
}

interface MutableOpenWeatherTelemetry {
  totalOpenWeatherCallEstimate: number;
  edgeFunctionInvocations: number;
  requestTimestamps: number[];
  callsByScreen: Record<string, OpenWeatherScreenTelemetry>;
  callsByRouteSession: Record<string, OpenWeatherScreenTelemetry>;
  uniqueCoordinateBuckets: Set<string>;
  cacheHits: number;
  cacheMisses: number;
  staleCacheReturns: number;
  duplicateCallsAvoided: number;
  rateLimitDenials: number;
  killSwitchDenials: number;
  bypassWarnings: number;
  lastEvents: Array<Record<string, unknown>>;
}

const DEFAULT_SCREEN = 'unknown_screen';
const DEFAULT_ROUTE_SESSION = 'unknown_route_session';
const MAX_EVENT_LOG = 50;

let telemetry: MutableOpenWeatherTelemetry = createOpenWeatherSessionTelemetry();

export function createOpenWeatherSessionTelemetry(): MutableOpenWeatherTelemetry {
  return {
    totalOpenWeatherCallEstimate: 0,
    edgeFunctionInvocations: 0,
    requestTimestamps: [],
    callsByScreen: {},
    callsByRouteSession: {},
    uniqueCoordinateBuckets: new Set<string>(),
    cacheHits: 0,
    cacheMisses: 0,
    staleCacheReturns: 0,
    duplicateCallsAvoided: 0,
    rateLimitDenials: 0,
    killSwitchDenials: 0,
    bypassWarnings: 0,
    lastEvents: [],
  };
}

export function resetOpenWeatherSessionTelemetry(): void {
  telemetry = createOpenWeatherSessionTelemetry();
}

function emptyScreenTelemetry(): OpenWeatherScreenTelemetry {
  return {
    edgeFunctionInvocations: 0,
    totalOpenWeatherCallEstimate: 0,
    cacheHits: 0,
    cacheMisses: 0,
    staleCacheReturns: 0,
    duplicateCallsAvoided: 0,
    rateLimitDenials: 0,
    killSwitchDenials: 0,
  };
}

function cloneScreenTelemetry(value: OpenWeatherScreenTelemetry): OpenWeatherScreenTelemetry {
  return { ...value };
}

function incrementBucket(
  map: Record<string, OpenWeatherScreenTelemetry>,
  key: string | null | undefined,
  field: keyof OpenWeatherScreenTelemetry,
  amount = 1,
): void {
  const bucketKey = key || DEFAULT_SCREEN;
  const current = map[bucketKey] ?? emptyScreenTelemetry();
  current[field] += amount;
  map[bucketKey] = current;
}

function incrementScreenAndRoute(
  input: OpenWeatherTelemetryEventInput,
  field: keyof OpenWeatherScreenTelemetry,
  amount = 1,
): void {
  incrementBucket(telemetry.callsByScreen, input.screen || DEFAULT_SCREEN, field, amount);
  if (input.routeSessionId) {
    incrementBucket(telemetry.callsByRouteSession, input.routeSessionId || DEFAULT_ROUTE_SESSION, field, amount);
  }
}

function snapshotMap(map: Record<string, OpenWeatherScreenTelemetry>): Record<string, OpenWeatherScreenTelemetry> {
  return Object.keys(map)
    .sort()
    .reduce<Record<string, OpenWeatherScreenTelemetry>>((acc, key) => {
      acc[key] = cloneScreenTelemetry(map[key]);
      return acc;
    }, {});
}

export function getOpenWeatherSessionTelemetrySnapshot(nowMs = Date.now()): OpenWeatherSessionTelemetrySnapshot {
  pruneRequestWindow(nowMs);
  return {
    debugFlag: ECS_WEATHER_DEBUG_FLAG,
    disableFlag: ECS_DISABLE_OPENWEATHER_FLAG,
    totalOpenWeatherCallEstimate: telemetry.totalOpenWeatherCallEstimate,
    edgeFunctionInvocations: telemetry.edgeFunctionInvocations,
    callsPerMinuteEstimate: telemetry.requestTimestamps.length,
    callsByScreen: snapshotMap(telemetry.callsByScreen),
    callsByRouteSession: snapshotMap(telemetry.callsByRouteSession),
    uniqueCoordinateBuckets: Array.from(telemetry.uniqueCoordinateBuckets).sort(),
    cacheHits: telemetry.cacheHits,
    cacheMisses: telemetry.cacheMisses,
    staleCacheReturns: telemetry.staleCacheReturns,
    duplicateCallsAvoided: telemetry.duplicateCallsAvoided,
    rateLimitDenials: telemetry.rateLimitDenials,
    killSwitchDenials: telemetry.killSwitchDenials,
    bypassWarnings: telemetry.bypassWarnings,
    lastEvents: telemetry.lastEvents.slice(),
  };
}

function pushTelemetryEvent(event: string, input: OpenWeatherTelemetryEventInput, extra?: Record<string, unknown>): void {
  for (const bucket of input.coordinateBuckets ?? []) {
    telemetry.uniqueCoordinateBuckets.add(bucket);
  }

  telemetry.lastEvents.push({
    event,
    source: input.source,
    screen: input.screen ?? DEFAULT_SCREEN,
    routeSessionId: input.routeSessionId ?? null,
    requestKey: input.requestKey ?? null,
    coordinateBuckets: input.coordinateBuckets ?? [],
    coordinateCount: input.coordinateCount ?? input.coordinateBuckets?.length ?? 0,
    reason: input.reason ?? null,
    at: new Date(input.nowMs ?? Date.now()).toISOString(),
    ...extra,
  });
  if (telemetry.lastEvents.length > MAX_EVENT_LOG) {
    telemetry.lastEvents.splice(0, telemetry.lastEvents.length - MAX_EVENT_LOG);
  }
}

function readEnvValue(key: string, env?: OpenWeatherClientEnv): unknown {
  if (env && Object.prototype.hasOwnProperty.call(env, key)) {
    return env[key];
  }
  try {
    const globalValue = (globalThis as unknown as Record<string, unknown>)[key];
    const alternateGlobalValue = (globalThis as unknown as Record<string, unknown>)[`__${key}`];
    if (globalValue != null) return globalValue;
    if (alternateGlobalValue != null) return alternateGlobalValue;
  } catch {
    // ignored
  }
  try {
    return (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
  } catch {
    return undefined;
  }
}

function isTruthy(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isWeatherDebugEnabled(env?: OpenWeatherClientEnv): boolean {
  return isTruthy(readEnvValue(ECS_WEATHER_DEBUG_FLAG, env));
}

function isOpenWeatherDisabled(env?: OpenWeatherClientEnv): boolean {
  return isTruthy(readEnvValue(ECS_DISABLE_OPENWEATHER_FLAG, env));
}

function finiteCoordinate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function buildOpenWeatherCoordinateBucket(coord: { lat?: unknown; lng?: unknown; lon?: unknown }): string {
  const lat = finiteCoordinate(coord.lat);
  const lon = finiteCoordinate(coord.lng ?? coord.lon);
  const fixed = OPENWEATHER_COORDINATE_BUCKET_DECIMALS;
  return `${lat == null ? 'na' : lat.toFixed(fixed)},${lon == null ? 'na' : lon.toFixed(fixed)}`;
}

function coordinateBucketsFromBody(body: Record<string, unknown>): string[] {
  const rawCoordinates = body.coordinates;
  if (Array.isArray(rawCoordinates)) {
    return rawCoordinates
      .map((coord) => {
        if (!coord || typeof coord !== 'object') return null;
        return buildOpenWeatherCoordinateBucket(coord as { lat?: unknown; lng?: unknown; lon?: unknown });
      })
      .filter((bucket): bucket is string => bucket != null);
  }
  return [buildOpenWeatherCoordinateBucket({ lat: body.lat, lon: body.lon ?? body.lng })];
}

function estimateProviderCallCount(body: Record<string, unknown>, coordinateBuckets: string[]): number {
  if (Array.isArray(body.coordinates)) {
    return coordinateBuckets.length;
  }
  return coordinateBuckets.length > 0 ? 1 : 0;
}

function pruneRequestWindow(nowMs: number): void {
  telemetry.requestTimestamps = telemetry.requestTimestamps.filter((timestamp) => nowMs - timestamp < 60_000);
}

function wouldExceedSessionLimit(estimatedCalls: number, nowMs: number): boolean {
  pruneRequestWindow(nowMs);
  if (telemetry.totalOpenWeatherCallEstimate + estimatedCalls > OPENWEATHER_SESSION_CALL_LIMIT_ESTIMATE) {
    return true;
  }
  return telemetry.requestTimestamps.length + estimatedCalls > OPENWEATHER_CALLS_PER_MINUTE_LIMIT_ESTIMATE;
}

function logOpenWeatherDebug(event: string, input: OpenWeatherTelemetryEventInput, extra?: Record<string, unknown>): void {
  ecsLog.dev(
    'WEATHER',
    event,
    {
      source: input.source,
      screen: input.screen ?? DEFAULT_SCREEN,
      routeSessionId: input.routeSessionId ?? null,
      requestKey: input.requestKey ?? null,
      coordinateBuckets: input.coordinateBuckets ?? [],
      coordinateCount: input.coordinateCount ?? input.coordinateBuckets?.length ?? 0,
      ...extra,
    },
    {
      tag: '[OPENWEATHER]',
      debugFlag: ECS_WEATHER_DEBUG_FLAG,
      fingerprint: `${event}:${input.source}:${input.requestKey ?? ''}:${(input.coordinateBuckets ?? []).join('|')}`,
      throttleMs: 1000,
      aggregateWindowMs: 10_000,
    },
  );
}

function makeWeatherClientError(code: string, message: string): { code: string; message: string } {
  return { code, message };
}

export async function invokeOpenWeatherOneCallEdgeFunction(
  body: Record<string, unknown>,
  context: OpenWeatherInvokeContext,
): Promise<OpenWeatherEdgeInvokeResult> {
  const nowMs = context.nowMs ?? Date.now();
  const coordinateBuckets = coordinateBucketsFromBody(body);
  const estimatedCalls = estimateProviderCallCount(body, coordinateBuckets);
  const input: OpenWeatherTelemetryEventInput = {
    source: context.source,
    screen: context.screen,
    routeSessionId: context.routeSessionId,
    requestKey: context.requestKey,
    coordinateBuckets,
    coordinateCount: estimatedCalls,
    nowMs,
  };

  if (isOpenWeatherDisabled(context.env)) {
    telemetry.killSwitchDenials += 1;
    incrementScreenAndRoute(input, 'killSwitchDenials');
    pushTelemetryEvent('openweather_disabled', input, { estimatedCalls });
    logOpenWeatherDebug('openweather_disabled', input, { estimatedCalls, flag: ECS_DISABLE_OPENWEATHER_FLAG });
    return {
      data: null,
      error: makeWeatherClientError(
        'openweather_disabled',
        `OpenWeather disabled by ${ECS_DISABLE_OPENWEATHER_FLAG}`,
      ),
    };
  }

  if (wouldExceedSessionLimit(estimatedCalls, nowMs)) {
    recordOpenWeatherRateLimitDenial({
      ...input,
      reason: 'session_or_minute_estimate_limit',
    });
    return {
      data: null,
      error: makeWeatherClientError(
        'openweather_rate_limit_denied',
        'OpenWeather session safety limit denied this request',
      ),
    };
  }

  telemetry.edgeFunctionInvocations += 1;
  telemetry.totalOpenWeatherCallEstimate += estimatedCalls;
  telemetry.requestTimestamps.push(...Array.from({ length: Math.max(estimatedCalls, 1) }, () => nowMs));
  incrementScreenAndRoute(input, 'edgeFunctionInvocations');
  incrementScreenAndRoute(input, 'totalOpenWeatherCallEstimate', estimatedCalls);
  pushTelemetryEvent('openweather_edge_invoked', input, { estimatedCalls });

  if (isWeatherDebugEnabled(context.env)) {
    logOpenWeatherDebug('openweather_edge_invoked', input, {
      estimatedCalls,
      sessionTotalEstimate: telemetry.totalOpenWeatherCallEstimate,
      callsPerMinuteEstimate: telemetry.requestTimestamps.length,
    });
  }

  const invoke = context.invoke ?? ((requestBody: Record<string, unknown>) => supabase.functions.invoke('get-weather', { body: requestBody }));
  return invoke(body);
}

function recordCounter(
  event: string,
  input: OpenWeatherTelemetryEventInput,
  counter: keyof Pick<
    MutableOpenWeatherTelemetry,
    'cacheHits' | 'cacheMisses' | 'staleCacheReturns' | 'duplicateCallsAvoided' | 'rateLimitDenials' | 'bypassWarnings'
  >,
  screenField: keyof OpenWeatherScreenTelemetry,
): void {
  telemetry[counter] += 1;
  incrementScreenAndRoute(input, screenField);
  pushTelemetryEvent(event, input);
  logOpenWeatherDebug(event, input);
}

export function recordOpenWeatherCacheHit(input: OpenWeatherTelemetryEventInput): void {
  recordCounter('openweather_cache_hit', input, 'cacheHits', 'cacheHits');
}

export function recordOpenWeatherCacheMiss(input: OpenWeatherTelemetryEventInput): void {
  recordCounter('openweather_cache_miss', input, 'cacheMisses', 'cacheMisses');
}

export function recordOpenWeatherDuplicateAvoided(input: OpenWeatherTelemetryEventInput): void {
  recordCounter('openweather_duplicate_avoided', input, 'duplicateCallsAvoided', 'duplicateCallsAvoided');
}

export function recordOpenWeatherStaleCacheReturn(input: OpenWeatherTelemetryEventInput): void {
  recordCounter('openweather_stale_cache_return', input, 'staleCacheReturns', 'staleCacheReturns');
}

export function recordOpenWeatherRateLimitDenial(input: OpenWeatherTelemetryEventInput): void {
  recordCounter('openweather_rate_limit_denied', input, 'rateLimitDenials', 'rateLimitDenials');
}

export function warnOpenWeatherBypass(input: OpenWeatherTelemetryEventInput): void {
  telemetry.bypassWarnings += 1;
  pushTelemetryEvent('openweather_bypass_warning', input);
  ecsLog.warn('WEATHER', 'OpenWeather call bypassed central service', {
    source: input.source,
    screen: input.screen ?? DEFAULT_SCREEN,
    routeSessionId: input.routeSessionId ?? null,
    requestKey: input.requestKey ?? null,
    coordinateBuckets: input.coordinateBuckets ?? [],
  });
}

export function getOpenWeatherCoordinateBucketsForRequestBody(body: Record<string, unknown>): string[] {
  return coordinateBucketsFromBody(body);
}
