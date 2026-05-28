import type { ECSUtilitySensorTelemetryReading } from './ECSTelemetryTypes';

export type ECSUtilitySensorResourceKind = 'water' | 'propane';

export type ECSUtilitySensorResourceStatus =
  | 'live'
  | 'linked'
  | 'parser_pending'
  | 'stale'
  | 'offline'
  | 'error';

export interface ECSUtilitySensorResourceState {
  kind: ECSUtilitySensorResourceKind;
  deviceId: string;
  deviceName: string;
  providerLabel: string;
  source: 'sensor';
  status: ECSUtilitySensorResourceStatus;
  levelPercent: number | null;
  signalStrength: number | null;
  parserStatus: string | null;
  lastUpdated: number;
  canProvideLiveLevel: boolean;
}

export interface ECSUtilitySensorResourceSnapshot {
  water: ECSUtilitySensorResourceState | null;
  propane: ECSUtilitySensorResourceState | null;
}

function hasFinitePercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function normalizedText(reading: ECSUtilitySensorTelemetryReading): string {
  return [
    reading.category,
    reading.profileId,
    reading.provider,
    reading.providerLabel,
    reading.deviceName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function inferUtilitySensorResourceKind(
  reading: ECSUtilitySensorTelemetryReading,
): ECSUtilitySensorResourceKind | null {
  const text = normalizedText(reading);
  if (/\bwater\b|fresh\s*tank|see\s*level|seelevel|fluid/.test(text)) return 'water';
  if (/\bpropane\b|\blpg\b|mopeka|tank\s*check|pro\s*check/.test(text)) return 'propane';
  return null;
}

function resolveSensorStatus(reading: ECSUtilitySensorTelemetryReading): ECSUtilitySensorResourceStatus {
  if (reading.quality === 'error') return 'error';
  if (hasFinitePercent(reading.levelPercent)) return 'live';
  if (reading.linkState === 'connected' && reading.parserStatus === 'parser_pending') return 'parser_pending';
  if (
    reading.linkState === 'connected' &&
    (reading.parserStatus === 'live_ready' || reading.parserStatus === 'awaiting_level')
  ) {
    return 'linked';
  }
  if (reading.quality === 'unavailable') return 'offline';
  if (reading.quality === 'stale' || reading.isStale) return 'stale';
  if (reading.parserStatus === 'parser_pending') return 'parser_pending';
  return reading.linkState === 'connected' ? 'linked' : 'parser_pending';
}

export function toUtilitySensorResourceState(
  reading: ECSUtilitySensorTelemetryReading,
): ECSUtilitySensorResourceState | null {
  const kind = inferUtilitySensorResourceKind(reading);
  if (!kind) return null;
  const levelPercent = hasFinitePercent(reading.levelPercent) ? reading.levelPercent : null;
  return {
    kind,
    deviceId: reading.deviceId,
    deviceName: reading.deviceName,
    providerLabel: reading.providerLabel,
    source: 'sensor',
    status: resolveSensorStatus(reading),
    levelPercent,
    signalStrength: reading.signalStrength,
    parserStatus: reading.parserStatus,
    lastUpdated: reading.lastUpdated,
    canProvideLiveLevel: levelPercent != null,
  };
}

function stateRank(state: ECSUtilitySensorResourceState): number {
  if (state.status === 'live') return 0;
  if (state.status === 'linked') return 1;
  if (state.status === 'parser_pending') return 2;
  if (state.status === 'stale') return 3;
  if (state.status === 'error') return 4;
  return 5;
}

export function selectUtilitySensorResourceStates(
  readings: ECSUtilitySensorTelemetryReading[],
): ECSUtilitySensorResourceSnapshot {
  const states = readings
    .map(toUtilitySensorResourceState)
    .filter((state): state is ECSUtilitySensorResourceState => !!state)
    .sort((a, b) => stateRank(a) - stateRank(b) || b.lastUpdated - a.lastUpdated);

  return {
    water: states.find((state) => state.kind === 'water') ?? null,
    propane: states.find((state) => state.kind === 'propane') ?? null,
  };
}

export function getUtilitySensorCurrentFromCapacity(
  state: ECSUtilitySensorResourceState | null | undefined,
  capacity: number | null | undefined,
): number | null {
  if (!state || state.levelPercent == null) return null;
  if (typeof capacity !== 'number' || !Number.isFinite(capacity) || capacity <= 0) return null;
  return capacity * (state.levelPercent / 100);
}

export function formatUtilitySensorModeLabel(
  state: ECSUtilitySensorResourceState | null | undefined,
  fallback: string,
): string {
  if (!state) return fallback;
  if (state.status === 'live') return 'Sensor';
  if (state.status === 'stale') return 'Sensor stale';
  if (state.status === 'offline') return 'Sensor offline';
  if (state.status === 'error') return 'Sensor error';
  return 'Sensor linked';
}
