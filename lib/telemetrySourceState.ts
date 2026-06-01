import type {
  ECSTelemetryFreshness,
  ECSTelemetrySourceType,
  PowerTelemetrySourceType,
} from '../src/types/telemetry';

export const TELEMETRY_LIVE_MAX_AGE_MS = 30_000;
export const TELEMETRY_RECENT_MAX_AGE_MS = 5 * 60_000;

export type TelemetrySourceStateTone =
  | 'live'
  | 'good'
  | 'attention'
  | 'warning'
  | 'stale'
  | 'unavailable'
  | 'neutral';

export type TelemetrySourceTypeLike =
  | ECSTelemetrySourceType
  | PowerTelemetrySourceType
  | 'ecs_inferred'
  | null
  | undefined;

export interface ResolveTelemetrySourceStateInput {
  sourceType?: TelemetrySourceTypeLike | string;
  freshness?: ECSTelemetryFreshness | null;
  updatedAt?: string | number | Date | null;
  now?: number;
  isStreaming?: boolean | null;
  liveMaxAgeMs?: number;
  recentMaxAgeMs?: number;
}

export interface TelemetrySourceState {
  label: string;
  compactLabel: string;
  freshness: ECSTelemetryFreshness;
  tone: TelemetrySourceStateTone;
  isHighConfidenceLive: boolean;
  isLive: boolean;
  isRecent: boolean;
  isStale: boolean;
  isManual: boolean;
  isSimulated: boolean;
  isUnavailable: boolean;
}

const LIVE_SOURCE_LABELS: Record<string, string> = {
  obd_live: 'OBD Live',
  ble_live: 'BLE Live',
  device_sensor: 'Sensor Live',
  blu_power_live: 'Power Live',
  live_provider: 'Power Live',
  live_ble: 'BLE Live',
};

function parseUpdatedAt(value: ResolveTelemetrySourceStateInput['updatedAt']): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function freshnessFromAge(
  updatedAtMs: number | null,
  now: number,
  liveMaxAgeMs: number,
  recentMaxAgeMs: number,
): ECSTelemetryFreshness | null {
  if (updatedAtMs == null) return null;
  const ageMs = now - updatedAtMs;
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'unknown';
  if (ageMs <= liveMaxAgeMs) return 'live';
  if (ageMs <= recentMaxAgeMs) return 'recent';
  return 'stale';
}

function isLiveCapableSource(sourceType: string): boolean {
  return Object.prototype.hasOwnProperty.call(LIVE_SOURCE_LABELS, sourceType);
}

function liveLabel(sourceType: string): string {
  return LIVE_SOURCE_LABELS[sourceType] ?? 'Live';
}

export function resolveTelemetrySourceState(
  input: ResolveTelemetrySourceStateInput,
): TelemetrySourceState {
  const sourceType = input.sourceType ?? 'unavailable';
  const sourceTypeText = String(sourceType);
  const explicitFreshness = input.freshness ?? 'unknown';
  const liveMaxAgeMs = input.liveMaxAgeMs ?? TELEMETRY_LIVE_MAX_AGE_MS;
  const recentMaxAgeMs = input.recentMaxAgeMs ?? TELEMETRY_RECENT_MAX_AGE_MS;
  const ageFreshness = freshnessFromAge(
    parseUpdatedAt(input.updatedAt),
    input.now ?? Date.now(),
    liveMaxAgeMs,
    recentMaxAgeMs,
  );

  if (sourceTypeText === 'manual') {
    return buildState('Manual', 'Manual', 'recent', 'neutral', {
      isManual: true,
    });
  }

  if (sourceTypeText === 'simulated') {
    return buildState('Simulation', 'Simulation', 'unknown', 'warning', {
      isSimulated: true,
    });
  }

  if (sourceTypeText === 'ecs_inferred') {
    return buildState('ECS-Inferred', 'ECS', 'unknown', 'attention', {});
  }

  if (
    sourceTypeText === 'unavailable'
    || explicitFreshness === 'offline'
    || sourceTypeText === 'device_detected'
  ) {
    return buildState('Unavailable', 'Unavailable', 'offline', 'unavailable', {
      isUnavailable: true,
    });
  }

  if (sourceTypeText === 'cached') {
    const cachedFreshness = ageFreshness === 'stale' || explicitFreshness === 'stale'
      ? 'stale'
      : 'recent';
    return buildState(
      cachedFreshness === 'stale' ? 'Stale' : 'Recent',
      cachedFreshness === 'stale' ? 'Stale' : 'Recent',
      cachedFreshness,
      cachedFreshness === 'stale' ? 'stale' : 'attention',
      {},
    );
  }

  const isLiveCapable = isLiveCapableSource(sourceTypeText);
  const effectiveFreshness = explicitFreshness === 'stale'
    ? 'stale'
    : explicitFreshness === 'recent'
      ? 'recent'
      : ageFreshness ?? explicitFreshness;

  if (effectiveFreshness === 'stale') {
    return buildState('Stale', 'Stale', 'stale', 'stale', {});
  }

  if (effectiveFreshness === 'recent') {
    return buildState('Recent', 'Recent', 'recent', 'attention', {});
  }

  if (isLiveCapable && effectiveFreshness === 'live' && input.isStreaming !== false) {
    const label = liveLabel(sourceTypeText);
    return buildState(label, label, 'live', 'live', {
      isHighConfidenceLive: true,
    });
  }

  return buildState('Unavailable', 'Unavailable', 'unknown', 'unavailable', {
    isUnavailable: true,
  });
}

function buildState(
  label: string,
  compactLabel: string,
  freshness: ECSTelemetryFreshness,
  tone: TelemetrySourceStateTone,
  flags: Partial<Pick<
    TelemetrySourceState,
    'isHighConfidenceLive' | 'isManual' | 'isSimulated' | 'isUnavailable'
  >>,
): TelemetrySourceState {
  const isHighConfidenceLive = flags.isHighConfidenceLive === true;
  return {
    label,
    compactLabel,
    freshness,
    tone,
    isHighConfidenceLive,
    isLive: isHighConfidenceLive,
    isRecent: freshness === 'recent',
    isStale: freshness === 'stale',
    isManual: flags.isManual === true,
    isSimulated: flags.isSimulated === true,
    isUnavailable: flags.isUnavailable === true || freshness === 'offline',
  };
}
