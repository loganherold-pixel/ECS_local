import type { ECSAutomotiveSafeValue } from './automotiveSafeTypes';

export type ECSAutomotiveConnectionLifecycle =
  | 'unavailable'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'background_connected'
  | 'degraded'
  | 'disconnecting';

export interface ECSAutomotivePublishState {
  lastSignature: string | null;
  lastPublishedAt: number;
}

export interface ECSAutomotiveConnectionState {
  connected: boolean;
  lifecycle: ECSAutomotiveConnectionLifecycle;
}

export type ECSAutomotiveConnectionEvent =
  | { type: 'start' }
  | { type: 'native_unavailable' }
  | { type: 'probe_connected'; foreground: boolean }
  | { type: 'probe_disconnected' }
  | { type: 'probe_failed' }
  | { type: 'push_failed' }
  | { type: 'push_recovered'; foreground: boolean }
  | { type: 'app_state'; foreground: boolean }
  | { type: 'stop' };

export interface ECSAutomotiveLocationSample {
  lat: number;
  lon: number;
  heading: number;
  speedMph: number;
  publishedAt: number;
}

export type ECSAutomotiveSafeMetadata = Omit<ECSAutomotiveSafeValue<unknown>, 'value'>;

const EPHEMERAL_SIGNATURE_KEYS = new Set([
  'generatedAt',
  'guidanceUpdatedAt',
  'lastUpdateAt',
  'lastUpdatedAt',
  'observedAt',
  'fetchedAt',
  'positionUpdatedAt',
  'sourceUpdatedAt',
  'timestamp',
  'updatedAt',
]);

export function reduceAutomotiveConnectionState(
  state: ECSAutomotiveConnectionState,
  event: ECSAutomotiveConnectionEvent,
): ECSAutomotiveConnectionState {
  switch (event.type) {
    case 'start':
      return { connected: false, lifecycle: 'connecting' };
    case 'native_unavailable':
      return { connected: false, lifecycle: 'unavailable' };
    case 'probe_connected':
      return {
        connected: true,
        lifecycle: event.foreground ? 'connected' : 'background_connected',
      };
    case 'probe_disconnected':
    case 'stop':
      return { connected: false, lifecycle: 'disconnected' };
    case 'probe_failed':
      return { connected: false, lifecycle: 'degraded' };
    case 'push_failed':
      return { connected: state.connected, lifecycle: 'degraded' };
    case 'push_recovered':
      return state.connected
        ? {
            connected: true,
            lifecycle: event.foreground ? 'connected' : 'background_connected',
          }
        : state;
    case 'app_state':
      return state.connected
        ? {
            connected: true,
            lifecycle: event.foreground ? 'connected' : 'background_connected',
          }
        : state;
  }
}

function normalizeForSignature(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForSignature);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>)
    .filter((key) => !EPHEMERAL_SIGNATURE_KEYS.has(key))
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = normalizeForSignature((value as Record<string, unknown>)[key]);
      return result;
    }, {});
}

export function buildAutomotiveSemanticSignature(value: unknown): string {
  return JSON.stringify(normalizeForSignature(value));
}

export function shouldPublishAutomotiveState(input: {
  signature: string;
  state: ECSAutomotivePublishState;
  nowMs: number;
  minimumIntervalMs: number;
  heartbeatIntervalMs: number;
  force?: boolean;
}): boolean {
  if (input.force) return true;
  if (input.state.lastPublishedAt <= 0) return true;
  const elapsed = input.nowMs - input.state.lastPublishedAt;
  if (elapsed >= input.heartbeatIntervalMs) return true;
  return input.signature !== input.state.lastSignature && elapsed >= input.minimumIntervalMs;
}

export function automotiveSafeMetadata<T>(safeValue: ECSAutomotiveSafeValue<T>) {
  return {
    source: safeValue.source,
    sourceLabel: safeValue.sourceLabel,
    origin: safeValue.origin,
    freshness: safeValue.freshness,
    confidence: safeValue.confidence,
    availability: safeValue.availability,
    actionableStatus: safeValue.actionableStatus,
    lastUpdatedAt: safeValue.lastUpdatedAt,
  };
}

export function buildAutomotiveNativePayload<T extends object>(
  fallbackValue: T,
  safeValue: ECSAutomotiveSafeValue<T>,
): T & { automotiveSafeState: ECSAutomotiveSafeMetadata } {
  return {
    ...(safeValue.value ?? fallbackValue),
    automotiveSafeState: automotiveSafeMetadata(safeValue),
  };
}

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}

function distanceMeters(a: ECSAutomotiveLocationSample, b: Omit<ECSAutomotiveLocationSample, 'publishedAt'>): number {
  const earthRadiusM = 6_371_000;
  const latDelta = degreesToRadians(b.lat - a.lat);
  const lonDelta = degreesToRadians(b.lon - a.lon);
  const lat1 = degreesToRadians(a.lat);
  const lat2 = degreesToRadians(b.lat);
  const h = Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDelta / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function headingDelta(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return Math.min(delta, 360 - delta);
}

export function shouldPublishAutomotiveLocation(input: {
  previous: ECSAutomotiveLocationSample | null;
  next: Omit<ECSAutomotiveLocationSample, 'publishedAt'>;
  nowMs: number;
  minimumIntervalMs?: number;
  heartbeatIntervalMs?: number;
  distanceThresholdM?: number;
  headingThresholdDeg?: number;
  speedThresholdMph?: number;
}): boolean {
  if (!input.previous) return true;
  const elapsed = input.nowMs - input.previous.publishedAt;
  if (elapsed < (input.minimumIntervalMs ?? 1_000)) return false;
  if (elapsed >= (input.heartbeatIntervalMs ?? 10_000)) return true;
  return distanceMeters(input.previous, input.next) >= (input.distanceThresholdM ?? 5) ||
    headingDelta(input.previous.heading, input.next.heading) >= (input.headingThresholdDeg ?? 5) ||
    Math.abs(input.previous.speedMph - input.next.speedMph) >= (input.speedThresholdMph ?? 1);
}
