import { briefCadLogStore } from './briefCadLogStore';
import type { ECSBriefSeverity } from './ai/ecsBriefTypes';
import type {
  ECSTelemetryConfidence,
  VehicleTelemetrySnapshot,
} from '../src/types/telemetry';

export const TELEMETRY_BRIEF_SUPPRESSION_MS = 10 * 60 * 1000;
export const TELEMETRY_LOW_BATTERY_WARNING_V = 11.8;
export const TELEMETRY_LOW_BATTERY_CRITICAL_V = 11.2;
export const TELEMETRY_HIGH_COOLANT_WARNING_F = 235;
export const TELEMETRY_HIGH_COOLANT_CRITICAL_F = 250;
export const TELEMETRY_HIGH_TRANSMISSION_WARNING_F = 240;
export const TELEMETRY_HIGH_TRANSMISSION_CRITICAL_F = 260;

type TelemetryBriefAdvisoryKind =
  | 'low_battery_voltage'
  | 'high_coolant_temp'
  | 'high_transmission_temp'
  | 'telemetry_disconnected'
  | 'stale_active_navigation'
  | 'attitude_sensor_unavailable';

export interface TelemetryBriefInput {
  snapshot: VehicleTelemetrySnapshot;
  scannerConnected?: boolean;
  scannerSourceStatus?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  activeNavigation?: boolean;
  attitudeWidgetActive?: boolean;
  attitudeSensorAvailable?: boolean | null;
}

export interface AttitudeTelemetryBriefInput {
  attitudeWidgetActive: boolean;
  attitudeSensorAvailable: boolean;
  sensorStatus?: string | null;
  deviceId?: string | null;
  now?: number;
}

export interface TelemetryBriefAdvisory {
  kind: TelemetryBriefAdvisoryKind;
  severity: ECSBriefSeverity;
  message: string;
  sourceLine: string;
  recommendedAction: string;
  sourceLabel: string;
  deviceKey: string;
  confidence: number;
}

type RecentTelemetryAdvisory = {
  at: number;
  severity: ECSBriefSeverity;
};

type LastTelemetryBriefState = {
  connected: boolean;
  live: boolean;
  sourceLabel: string;
};

const recentTelemetryAdvisories = new Map<string, RecentTelemetryAdvisory>();
const lastTelemetryStateByDevice = new Map<string, LastTelemetryBriefState>();
let lastGlobalVehicleTelemetryState: LastTelemetryBriefState | null = null;

function severityRank(severity: ECSBriefSeverity): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'warning':
      return 3;
    case 'watch':
      return 2;
    case 'info':
    default:
      return 1;
  }
}

function confidenceScore(confidence: ECSTelemetryConfidence): number {
  switch (confidence) {
    case 'high':
      return 0.92;
    case 'medium':
      return 0.72;
    case 'low':
      return 0.42;
    case 'unverified':
    default:
      return 0.18;
  }
}

function deviceKey(input: TelemetryBriefInput): string {
  return input.deviceId ?? input.snapshot.deviceId ?? input.deviceName ?? input.snapshot.sourceType ?? 'vehicle-telemetry';
}

function getBriefTelemetrySourceLabel(snapshot: VehicleTelemetrySnapshot): string {
  switch (snapshot.sourceType) {
    case 'obd_live':
    case 'ble_live':
      return snapshot.isLive && snapshot.freshness === 'live' ? 'OBD Live' : 'ECS-Inferred';
    case 'device_sensor':
      return 'Device Attitude';
    case 'manual':
      return 'Manual Profile';
    case 'cached':
    case 'simulated':
    case 'unavailable':
    case 'blu_power_live':
    default:
      return 'ECS-Inferred';
  }
}

function formatUpdatedAge(snapshot: VehicleTelemetrySnapshot, now: number): string {
  if (!snapshot.updatedAt) return 'Updated unknown';
  const updatedAtMs = Date.parse(snapshot.updatedAt);
  if (!Number.isFinite(updatedAtMs)) return 'Updated unknown';
  const seconds = Math.max(0, Math.round((now - updatedAtMs) / 1000));
  if (seconds < 60) return `Updated ${seconds}s ago`;
  return `Updated ${Math.round(seconds / 60)}m ago`;
}

function buildSourceLine(input: TelemetryBriefInput, now: number, sourceLabel = getBriefTelemetrySourceLabel(input.snapshot)): string {
  return `Source: ${sourceLabel} · ${formatUpdatedAge(input.snapshot, now)}`;
}

function canUseTelemetryForNumericAdvisory(snapshot: VehicleTelemetrySnapshot): boolean {
  if (snapshot.sourceType === 'simulated' || snapshot.sourceType === 'unavailable') return false;
  if (snapshot.confidence === 'unverified') return false;
  if (snapshot.sourceType === 'device_sensor' || snapshot.sourceType === 'blu_power_live') return false;
  return true;
}

function numericSeverity(
  snapshot: VehicleTelemetrySnapshot,
  value: number | null | undefined,
  warningThreshold: number,
  criticalThreshold: number,
  direction: 'below' | 'above',
): ECSBriefSeverity | null {
  if (value == null || !Number.isFinite(value)) return null;
  const crossedWarning = direction === 'below' ? value <= warningThreshold : value >= warningThreshold;
  if (!crossedWarning || !canUseTelemetryForNumericAdvisory(snapshot)) return null;

  if (
    snapshot.sourceType === 'manual' ||
    snapshot.sourceType === 'cached' ||
    snapshot.confidence === 'low' ||
    !snapshot.isLive ||
    snapshot.freshness !== 'live'
  ) {
    return 'watch';
  }

  const crossedCritical = direction === 'below' ? value <= criticalThreshold : value >= criticalThreshold;
  if (crossedCritical && snapshot.confidence === 'high') return 'critical';
  return 'warning';
}

function isConnected(input: TelemetryBriefInput): boolean {
  return Boolean(
    input.scannerConnected ||
      input.snapshot.isLive ||
      input.snapshot.sourceType === 'manual' ||
      (input.snapshot.sourceType === 'cached' && input.snapshot.freshness !== 'stale'),
  );
}

function isLiveTelemetry(snapshot: VehicleTelemetrySnapshot): boolean {
  return Boolean(
    snapshot.isLive &&
      snapshot.freshness === 'live' &&
      (snapshot.sourceType === 'obd_live' || snapshot.sourceType === 'ble_live' || snapshot.sourceType === 'device_sensor'),
  );
}

function addNumericAdvisory(
  advisories: TelemetryBriefAdvisory[],
  input: TelemetryBriefInput,
  now: number,
  kind: Extract<TelemetryBriefAdvisoryKind, 'low_battery_voltage' | 'high_coolant_temp' | 'high_transmission_temp'>,
  severity: ECSBriefSeverity | null,
  message: string,
  recommendedAction: string,
): void {
  if (!severity) return;
  const sourceLabel = getBriefTelemetrySourceLabel(input.snapshot);
  advisories.push({
    kind,
    severity,
    message,
    sourceLine: buildSourceLine(input, now, sourceLabel),
    recommendedAction,
    sourceLabel,
    deviceKey: deviceKey(input),
    confidence: confidenceScore(input.snapshot.confidence),
  });
}

export function buildTelemetryBriefAdvisories(input: TelemetryBriefInput, options?: { now?: number }): TelemetryBriefAdvisory[] {
  const now = options?.now ?? Date.now();
  const advisories: TelemetryBriefAdvisory[] = [];

  addNumericAdvisory(
    advisories,
    input,
    now,
    'low_battery_voltage',
    numericSeverity(
      input.snapshot,
      input.snapshot.batteryVoltage,
      TELEMETRY_LOW_BATTERY_WARNING_V,
      TELEMETRY_LOW_BATTERY_CRITICAL_V,
      'below',
    ),
    input.snapshot.sourceType === 'manual'
      ? 'Manual profile battery voltage is below target.'
      : 'Low battery voltage detected.',
    input.snapshot.sourceType === 'manual'
      ? 'Update the manual vehicle profile or connect a live telemetry source.'
      : 'Reduce accessory draw and confirm charging system status.',
  );

  addNumericAdvisory(
    advisories,
    input,
    now,
    'high_coolant_temp',
    numericSeverity(
      input.snapshot,
      input.snapshot.coolantTempF,
      TELEMETRY_HIGH_COOLANT_WARNING_F,
      TELEMETRY_HIGH_COOLANT_CRITICAL_F,
      'above',
    ),
    'High coolant temperature detected.',
    'Reduce load and reassess engine temperature before continuing.',
  );

  addNumericAdvisory(
    advisories,
    input,
    now,
    'high_transmission_temp',
    numericSeverity(
      input.snapshot,
      input.snapshot.transmissionTempF,
      TELEMETRY_HIGH_TRANSMISSION_WARNING_F,
      TELEMETRY_HIGH_TRANSMISSION_CRITICAL_F,
      'above',
    ),
    'High transmission temperature detected.',
    'Reduce load and monitor transmission temperature trend.',
  );

  if (
    input.activeNavigation &&
    (input.snapshot.freshness === 'stale' || input.snapshot.sourceType === 'cached') &&
    input.snapshot.sourceType !== 'simulated'
  ) {
    const sourceLabel = getBriefTelemetrySourceLabel(input.snapshot);
    advisories.push({
      kind: 'stale_active_navigation',
      severity: 'watch',
      message: 'Telemetry is stale during active navigation.',
      sourceLine: buildSourceLine(input, now, sourceLabel),
      recommendedAction: 'Reconnect telemetry or treat vehicle values as last known.',
      sourceLabel,
      deviceKey: deviceKey(input),
      confidence: confidenceScore(input.snapshot.confidence),
    });
  }

  if (input.attitudeWidgetActive && input.attitudeSensorAvailable === false) {
    advisories.push({
      kind: 'attitude_sensor_unavailable',
      severity: 'watch',
      message: 'Attitude sensor unavailable.',
      sourceLine: buildSourceLine(input, now, 'Device Attitude'),
      recommendedAction: 'Check motion permission or device sensor availability.',
      sourceLabel: 'Device Attitude',
      deviceKey: deviceKey(input),
      confidence: 0.5,
    });
  }

  return advisories;
}

function buildTelemetryBriefTransitionAdvisories(
  input: TelemetryBriefInput,
  previous: LastTelemetryBriefState | undefined | null,
  now: number,
): TelemetryBriefAdvisory[] {
  if (!previous?.live || isConnected(input)) return [];
  const sourceLabel = previous.sourceLabel || getBriefTelemetrySourceLabel(input.snapshot);
  return [{
    kind: 'telemetry_disconnected',
    severity: input.activeNavigation ? 'warning' : 'watch',
    message: 'Live telemetry disconnected.',
    sourceLine: buildSourceLine(input, now, sourceLabel),
    recommendedAction: 'Reconnect the telemetry source or use manual profile values.',
    sourceLabel,
    deviceKey: deviceKey(input),
    confidence: confidenceScore(input.snapshot.confidence),
  }];
}

function shouldSuppressTelemetryAdvisory(advisory: TelemetryBriefAdvisory, now: number): boolean {
  const key = `${advisory.kind}:${advisory.deviceKey}`;
  const previous = recentTelemetryAdvisories.get(key);
  if (!previous) return false;
  const insideWindow = now - previous.at < TELEMETRY_BRIEF_SUPPRESSION_MS;
  if (!insideWindow) return false;
  return severityRank(advisory.severity) <= severityRank(previous.severity);
}

function rememberTelemetryAdvisory(advisory: TelemetryBriefAdvisory, now: number): void {
  recentTelemetryAdvisories.set(`${advisory.kind}:${advisory.deviceKey}`, {
    at: now,
    severity: advisory.severity,
  });
}

export function publishTelemetryBriefAdvisories(
  input: TelemetryBriefInput,
  options?: { now?: number },
): TelemetryBriefAdvisory[] {
  const now = options?.now ?? Date.now();
  const key = deviceKey(input);
  const previous = lastTelemetryStateByDevice.get(key) ??
    (input.snapshot.sourceType === 'device_sensor' ? null : lastGlobalVehicleTelemetryState);
  const nextState: LastTelemetryBriefState = {
    connected: isConnected(input),
    live: isLiveTelemetry(input.snapshot),
    sourceLabel: getBriefTelemetrySourceLabel(input.snapshot),
  };
  lastTelemetryStateByDevice.set(key, nextState);
  if (input.snapshot.sourceType !== 'device_sensor') {
    lastGlobalVehicleTelemetryState = nextState;
  }

  const accepted: TelemetryBriefAdvisory[] = [];
  for (const advisory of [
    ...buildTelemetryBriefAdvisories(input, { now }),
    ...buildTelemetryBriefTransitionAdvisories(input, previous, now),
  ]) {
    if (shouldSuppressTelemetryAdvisory(advisory, now)) continue;
    rememberTelemetryAdvisory(advisory, now);
    accepted.push(advisory);
    briefCadLogStore.recordUpdate({
      id: `telemetry:${advisory.kind}:${advisory.deviceKey}`,
      text: `${advisory.message} ${advisory.sourceLine}`,
      mode: advisory.severity === 'critical' || advisory.severity === 'warning' ? 'alert' : 'advisory',
      priority: severityRank(advisory.severity),
      queuedAt: now,
      title: advisory.kind === 'attitude_sensor_unavailable' ? 'ATTITUDE SENSOR' : 'TELEMETRY ADVISORY',
      recommendedAction: advisory.recommendedAction,
      source: 'ecs-telemetry',
      severity: advisory.severity,
      eventType: advisory.kind,
      confidence: advisory.confidence,
    });
  }

  return accepted;
}

function createAttitudeSnapshot(input: AttitudeTelemetryBriefInput): VehicleTelemetrySnapshot {
  const live = input.attitudeSensorAvailable;
  const updatedAt = live ? new Date(input.now ?? Date.now()).toISOString() : null;
  return {
    sourceType: 'device_sensor',
    sourceLabel: 'Device Attitude',
    freshness: live ? 'live' : 'offline',
    confidence: live ? 'high' : 'unverified',
    updatedAt,
    source: live ? 'native_vehicle_live' : 'unavailable',
    isLive: live,
    deviceId: input.deviceId ?? 'device-attitude',
    speedMph: null,
    rpm: null,
    coolantTempF: null,
    intakeTempF: null,
    engineLoadPct: null,
    throttlePct: null,
    batteryVoltage: null,
    fuelLevelPct: null,
    rangeMiles: null,
    oilTempF: null,
    transmissionTempF: null,
    pitchDeg: null,
    rollDeg: null,
    headingDeg: null,
    warnings: input.sensorStatus ? [{
      id: `attitude-${input.sensorStatus.toLowerCase()}`,
      message: `Device attitude sensor status: ${input.sensorStatus}`,
      severity: live ? 'info' : 'watch',
      source: 'Device Attitude',
    }] : [],
  };
}

export function publishAttitudeTelemetryBriefAdvisory(input: AttitudeTelemetryBriefInput): TelemetryBriefAdvisory[] {
  return publishTelemetryBriefAdvisories({
    snapshot: createAttitudeSnapshot(input),
    deviceId: input.deviceId ?? 'device-attitude',
    deviceName: 'Device Attitude',
    attitudeWidgetActive: input.attitudeWidgetActive,
    attitudeSensorAvailable: input.attitudeSensorAvailable,
  }, { now: input.now });
}

export function resetTelemetryBriefPublisherForTests(): void {
  recentTelemetryAdvisories.clear();
  lastTelemetryStateByDevice.clear();
  lastGlobalVehicleTelemetryState = null;
}
