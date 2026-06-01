import { briefCadLogStore } from './briefCadLogStore';
import type { ECSBriefSeverity } from './ai/ecsBriefTypes';
import type { PowerTelemetryTruth } from '../src/power/types/PowerTelemetry';
import { resolveTelemetrySourceState } from './telemetrySourceState';

export const POWER_BRIEF_SUPPRESSION_MS = 15 * 60 * 1000;
export const POWER_BATTERY_RESERVE_PERCENT = 20;
export const POWER_RUNTIME_RESERVE_MINUTES = 120;
export const POWER_HIGH_DRAW_WATTS = 1500;

type PowerAdvisoryKind =
  | 'low_battery'
  | 'low_runtime'
  | 'high_draw'
  | 'source_stale'
  | 'auth_required'
  | 'manual_low_reserve'
  | 'device_disconnected'
  | 'solar_restored'
  | 'device_reconnected';

export interface PowerBriefTelemetryInput {
  batteryPercent?: number | null;
  outputWatts?: number | null;
  solarWatts?: number | null;
  estimatedRuntimeMinutes?: number | null;
  deviceId?: string | null;
  deviceName?: string | null;
  providerId?: string | null;
  truth: PowerTelemetryTruth;
  activeRouteOrCamp?: boolean;
}

export interface PowerBriefAdvisory {
  kind: PowerAdvisoryKind;
  severity: ECSBriefSeverity;
  message: string;
  sourceLine: string;
  recommendedAction: string;
  deviceKey: string;
}

type RecentPowerAdvisory = {
  at: number;
  severity: ECSBriefSeverity;
};

type LastPowerBriefState = {
  connected: boolean;
  live: boolean;
  hadSolarInput: boolean;
};

const recentPowerAdvisories = new Map<string, RecentPowerAdvisory>();
const lastPowerStateByDevice = new Map<string, LastPowerBriefState>();

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

function deviceKey(input: PowerBriefTelemetryInput): string {
  return (
    input.deviceId ??
    input.truth.deviceId ??
    input.providerId ??
    input.truth.providerId ??
    'power-source'
  );
}

function deviceLabel(input: PowerBriefTelemetryInput): string {
  return input.deviceName ?? input.truth.deviceName ?? input.providerId ?? input.truth.providerId ?? 'Power source';
}

function formatUpdatedAge(input: PowerBriefTelemetryInput): string {
  if (typeof input.truth.freshnessMs !== 'number') return 'Updated unknown';
  const seconds = Math.max(0, Math.round(input.truth.freshnessMs / 1000));
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `Updated ${minutes}m ago`;
}

function getBriefPowerTruthLabel(truth: PowerTelemetryTruth): string {
  return resolveTelemetrySourceState({
    sourceType: truth.sourceTruth,
    freshness: truth.isStale
      ? 'stale'
      : truth.isLive
        ? 'live'
        : truth.sourceTruth === 'cached'
          ? 'recent'
          : 'unknown',
    updatedAt: truth.lastUpdatedAt ?? null,
    isStreaming: truth.isLive,
  }).label;
}

function buildSourceLine(input: PowerBriefTelemetryInput): string {
  return `Source: ${deviceLabel(input)} · ${getBriefPowerTruthLabel(input.truth)} · ${formatUpdatedAge(input)}`;
}

export function buildPowerBriefAdvisories(input: PowerBriefTelemetryInput): PowerBriefAdvisory[] {
  const key = deviceKey(input);
  const label = deviceLabel(input);
  const sourceLine = buildSourceLine(input);
  const advisories: PowerBriefAdvisory[] = [];

  if (input.truth.sourceTruth === 'unavailable' || input.truth.sourceTruth === 'device_detected') {
    return advisories;
  }

  if (input.truth.reason && /auth|credential|permission/i.test(input.truth.reason)) {
    advisories.push({
      kind: 'auth_required',
      severity: 'watch',
      message: `${label} provider authorization has expired or needs attention.`,
      sourceLine,
      recommendedAction: 'Open Power setup and confirm provider credentials or device permissions.',
      deviceKey: key,
    });
  }

  if (input.truth.sourceTruth === 'cached' && input.truth.isStale) {
    advisories.push({
      kind: 'source_stale',
      severity: input.activeRouteOrCamp ? 'warning' : 'watch',
      message: `${label} telemetry is stale. Reconnect before relying on runtime estimates.`,
      sourceLine,
      recommendedAction: 'Reconnect the power source or switch to a manual estimate.',
      deviceKey: key,
    });
  }

  if (typeof input.batteryPercent === 'number' && input.batteryPercent <= POWER_BATTERY_RESERVE_PERCENT) {
    advisories.push({
      kind: input.truth.isManual ? 'manual_low_reserve' : 'low_battery',
      severity: input.batteryPercent <= 10 ? 'critical' : 'warning',
      message: input.truth.isManual
        ? 'Manual estimate suggests battery reserve may be below target. Update power profile for better accuracy.'
        : 'Battery reserve is below the configured ECS reserve threshold.',
      sourceLine,
      recommendedAction: input.truth.isManual
        ? 'Update the manual power profile or connect a supported power source.'
        : 'Reduce draw, start charging, or update the power plan.',
      deviceKey: key,
    });
  }

  if (
    typeof input.estimatedRuntimeMinutes === 'number' &&
    input.estimatedRuntimeMinutes <= POWER_RUNTIME_RESERVE_MINUTES
  ) {
    advisories.push({
      kind: 'low_runtime',
      severity: input.estimatedRuntimeMinutes <= 60 ? 'critical' : 'warning',
      message: input.truth.isManual
        ? 'Manual estimate suggests runtime may be below your configured reserve window.'
        : 'Runtime estimate has dropped below your configured reserve window.',
      sourceLine,
      recommendedAction: input.truth.isManual
        ? 'Update power profile for better accuracy before relying on this estimate.'
        : 'Reduce load or add charging before committing to the next leg.',
      deviceKey: key,
    });
  }

  if (typeof input.outputWatts === 'number' && input.outputWatts >= POWER_HIGH_DRAW_WATTS) {
    advisories.push({
      kind: 'high_draw',
      severity: 'watch',
      message: 'Output load exceeds the configured safe draw threshold.',
      sourceLine,
      recommendedAction: 'Confirm inverter load and shed nonessential draw if reserve is limited.',
      deviceKey: key,
    });
  }

  return advisories;
}

function buildPowerBriefTransitionAdvisories(
  input: PowerBriefTelemetryInput,
  previous: LastPowerBriefState | undefined,
): PowerBriefAdvisory[] {
  const key = deviceKey(input);
  const label = deviceLabel(input);
  const sourceLine = buildSourceLine(input);
  const connected =
    input.truth.isLive ||
    input.truth.isManual ||
    (input.truth.sourceTruth === 'cached' && !input.truth.isStale);
  const live = input.truth.isLive;
  const hadSolarInput = typeof input.solarWatts === 'number' && input.solarWatts > 0;
  const advisories: PowerBriefAdvisory[] = [];

  if (previous && previous.live && !connected && input.activeRouteOrCamp) {
    advisories.push({
      kind: 'device_disconnected',
      severity: 'warning',
      message: `${label} disconnected during active route or camp operations.`,
      sourceLine,
      recommendedAction: 'Reconnect the power source or switch to a manual reserve estimate.',
      deviceKey: key,
    });
  }

  if (previous && !previous.live && live) {
    advisories.push({
      kind: 'device_reconnected',
      severity: 'info',
      message: `${label} reconnected. Live telemetry restored.`,
      sourceLine,
      recommendedAction: 'Continue monitoring reserve and runtime before the next leg.',
      deviceKey: key,
    });
  }

  if (previous && !previous.hadSolarInput && hadSolarInput) {
    advisories.push({
      kind: 'solar_restored',
      severity: 'info',
      message: 'Solar input detected after being unavailable.',
      sourceLine,
      recommendedAction: 'Monitor charging trend before increasing power draw.',
      deviceKey: key,
    });
  }

  return advisories;
}

function shouldSuppressPowerAdvisory(advisory: PowerBriefAdvisory, now: number): boolean {
  const key = `${advisory.kind}:${advisory.deviceKey}`;
  const previous = recentPowerAdvisories.get(key);
  if (!previous) return false;
  const insideWindow = now - previous.at < POWER_BRIEF_SUPPRESSION_MS;
  if (!insideWindow) return false;
  return severityRank(advisory.severity) <= severityRank(previous.severity);
}

function rememberPowerAdvisory(advisory: PowerBriefAdvisory, now: number): void {
  const key = `${advisory.kind}:${advisory.deviceKey}`;
  recentPowerAdvisories.set(key, {
    at: now,
    severity: advisory.severity,
  });
}

export function publishPowerBriefAdvisories(
  input: PowerBriefTelemetryInput,
  options?: { now?: number },
): PowerBriefAdvisory[] {
  const now = options?.now ?? Date.now();
  const accepted: PowerBriefAdvisory[] = [];
  const key = deviceKey(input);
  const previous = lastPowerStateByDevice.get(key);
  const connected =
    input.truth.isLive ||
    input.truth.isManual ||
    (input.truth.sourceTruth === 'cached' && !input.truth.isStale);
  const nextState: LastPowerBriefState = {
    connected,
    live: input.truth.isLive,
    hadSolarInput: typeof input.solarWatts === 'number' && input.solarWatts > 0,
  };
  lastPowerStateByDevice.set(key, nextState);

  for (const advisory of [
    ...buildPowerBriefAdvisories(input),
    ...buildPowerBriefTransitionAdvisories(input, previous),
  ]) {
    if (shouldSuppressPowerAdvisory(advisory, now)) continue;
    rememberPowerAdvisory(advisory, now);
    accepted.push(advisory);
    briefCadLogStore.recordUpdate({
      id: `power:${advisory.kind}:${advisory.deviceKey}`,
      text: `${advisory.message} ${advisory.sourceLine}`,
      mode: advisory.severity === 'critical' || advisory.severity === 'warning' ? 'alert' : 'advisory',
      priority: severityRank(advisory.severity),
      queuedAt: now,
      title: advisory.kind === 'device_reconnected' || advisory.kind === 'solar_restored'
        ? 'POWER SOURCE'
        : 'POWER ADVISORY',
      recommendedAction: advisory.recommendedAction,
      source: 'ecs-power',
      severity: advisory.severity,
      eventType: advisory.kind,
      confidence: input.truth.confidence,
    });
  }

  return accepted;
}

export function resetPowerBriefPublisherForTests(): void {
  recentPowerAdvisories.clear();
  lastPowerStateByDevice.clear();
}
