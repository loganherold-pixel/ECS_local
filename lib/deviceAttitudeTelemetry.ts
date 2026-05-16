import { ATTITUDE_MONITOR_TUNING } from './attitudeMonitorTuning';
import type { AttitudeTelemetryHealth } from './attitudeMonitorModel';

export type DeviceAttitudeSensorStatus =
  | 'LIVE'
  | 'CALIBRATED'
  | 'AWAITING'
  | 'OFFLINE'
  | 'UNAVAILABLE'
  | 'PAUSED'
  | 'BACKGROUND'
  | 'PERMISSION_DENIED';

export type DeviceAttitudeFreshness = 'live' | 'recent' | 'stale' | 'unavailable';

export interface DeviceAttitudeTelemetrySnapshot {
  sourceType: 'device_attitude';
  sourceLabel: 'Device Attitude Live' | 'Device Attitude Recent' | 'Stale' | 'Unavailable';
  sourceChipLabel: 'DEVICE ATTITUDE LIVE' | 'DEVICE ATTITUDE RECENT' | 'STALE' | 'UNAVAILABLE';
  sourceStatusLine: string;
  freshness: DeviceAttitudeFreshness;
  displayHealth: AttitudeTelemetryHealth;
  rollDeg: number | null;
  pitchDeg: number | null;
  rawRollDeg: number | null;
  rawPitchDeg: number | null;
  updatedAt: number | null;
  sensorStatus: DeviceAttitudeSensorStatus;
  isLive: boolean;
  isRecent: boolean;
  isStale: boolean;
  isUnavailable: boolean;
  reason: string;
}

interface NormalizeDeviceAttitudeInput {
  rollDeg?: number | null;
  pitchDeg?: number | null;
  rawRollDeg?: number | null;
  rawPitchDeg?: number | null;
  sensorStatus?: string | null;
  sampleTimestampMs?: number | null;
  nowMs?: number;
}

const LIVE_MAX_AGE_MS = ATTITUDE_MONITOR_TUNING.telemetry.staleAfterMs;
const RECENT_MAX_AGE_MS = ATTITUDE_MONITOR_TUNING.telemetry.holdLastGoodMs;

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeSensorStatus(status: string | null | undefined): DeviceAttitudeSensorStatus {
  switch (status) {
    case 'LIVE':
    case 'CALIBRATED':
    case 'AWAITING':
    case 'UNAVAILABLE':
    case 'PAUSED':
    case 'BACKGROUND':
    case 'PERMISSION_DENIED':
      return status;
    default:
      return 'OFFLINE';
  }
}

function createUnavailableSnapshot(
  status: DeviceAttitudeSensorStatus,
  reason: string,
): DeviceAttitudeTelemetrySnapshot {
  return {
    sourceType: 'device_attitude',
    sourceLabel: 'Unavailable',
    sourceChipLabel: 'UNAVAILABLE',
    sourceStatusLine: `Unavailable - ${reason}`,
    freshness: 'unavailable',
    displayHealth: 'unavailable',
    rollDeg: null,
    pitchDeg: null,
    rawRollDeg: null,
    rawPitchDeg: null,
    updatedAt: null,
    sensorStatus: status,
    isLive: false,
    isRecent: false,
    isStale: false,
    isUnavailable: true,
    reason,
  };
}

export function normalizeDeviceAttitudeTelemetry({
  rollDeg,
  pitchDeg,
  rawRollDeg,
  rawPitchDeg,
  sensorStatus,
  sampleTimestampMs,
  nowMs = Date.now(),
}: NormalizeDeviceAttitudeInput): DeviceAttitudeTelemetrySnapshot {
  const status = normalizeSensorStatus(sensorStatus);
  const normalizedRoll = finiteNumber(rollDeg);
  const normalizedPitch = finiteNumber(pitchDeg);
  const normalizedRawRoll = finiteNumber(rawRollDeg) ?? normalizedRoll;
  const normalizedRawPitch = finiteNumber(rawPitchDeg) ?? normalizedPitch;
  const updatedAt = finiteNumber(sampleTimestampMs);

  if (status === 'PERMISSION_DENIED') {
    return createUnavailableSnapshot(status, 'motion permission denied');
  }
  if (status === 'BACKGROUND') {
    return createUnavailableSnapshot(status, 'app is in background');
  }
  if (status === 'PAUSED') {
    return createUnavailableSnapshot(status, 'sensor updates paused');
  }
  if (status === 'UNAVAILABLE') {
    return createUnavailableSnapshot(status, 'device attitude sensor unavailable');
  }
  if (status === 'AWAITING') {
    return createUnavailableSnapshot(status, 'waiting for sensor calibration');
  }
  if (normalizedRoll == null || normalizedPitch == null || updatedAt == null) {
    return createUnavailableSnapshot(status, 'no valid device attitude sample');
  }

  const sampleAgeMs = Math.max(0, nowMs - updatedAt);
  const streaming = status === 'LIVE' || status === 'CALIBRATED';

  if (streaming && sampleAgeMs <= LIVE_MAX_AGE_MS) {
    return {
      sourceType: 'device_attitude',
      sourceLabel: 'Device Attitude Live',
      sourceChipLabel: 'DEVICE ATTITUDE LIVE',
      sourceStatusLine: 'Device Attitude Live - active motion sensor',
      freshness: 'live',
      displayHealth: 'live',
      rollDeg: normalizedRoll,
      pitchDeg: normalizedPitch,
      rawRollDeg: normalizedRawRoll,
      rawPitchDeg: normalizedRawPitch,
      updatedAt,
      sensorStatus: status,
      isLive: true,
      isRecent: false,
      isStale: false,
      isUnavailable: false,
      reason: 'active motion sensor',
    };
  }

  if (sampleAgeMs <= RECENT_MAX_AGE_MS) {
    return {
      sourceType: 'device_attitude',
      sourceLabel: 'Device Attitude Recent',
      sourceChipLabel: 'DEVICE ATTITUDE RECENT',
      sourceStatusLine: 'Device Attitude Recent - holding last device sample',
      freshness: 'recent',
      displayHealth: 'recent',
      rollDeg: normalizedRoll,
      pitchDeg: normalizedPitch,
      rawRollDeg: normalizedRawRoll,
      rawPitchDeg: normalizedRawPitch,
      updatedAt,
      sensorStatus: status,
      isLive: false,
      isRecent: true,
      isStale: false,
      isUnavailable: false,
      reason: 'holding last device sample',
    };
  }

  return {
    sourceType: 'device_attitude',
    sourceLabel: 'Stale',
    sourceChipLabel: 'STALE',
    sourceStatusLine: 'Stale - device attitude sample expired',
    freshness: 'stale',
    displayHealth: 'stale',
    rollDeg: normalizedRoll,
    pitchDeg: normalizedPitch,
    rawRollDeg: normalizedRawRoll,
    rawPitchDeg: normalizedRawPitch,
    updatedAt,
    sensorStatus: status,
    isLive: false,
    isRecent: false,
    isStale: true,
    isUnavailable: false,
    reason: 'device attitude sample expired',
  };
}
