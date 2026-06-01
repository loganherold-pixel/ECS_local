import { useEffect, useState } from 'react';

import { bluPowerAuthority, type BluAuthoritySnapshot, type PowerFreshnessLabel } from './BluPowerAuthority';
import { bluDeviceRegistry } from './BluDeviceRegistry';
import { bluStateStore } from './BluStateStore';
import type { BluDevice, BluTelemetry } from './BluTypes';
import { computePowerForecast } from '../src/power/forecast/powerForecast';

export type PowerAdvisoryCategory =
  | 'charging_recovering'
  | 'balanced_usage'
  | 'moderate_drain'
  | 'heavy_drain'
  | 'unsustainable_drain'
  | 'critical_reserve'
  | 'unstable_power_state'
  | 'insufficient_data';

export type PowerTrendDirection = 'rising' | 'falling' | 'stable' | 'unknown';
export type PowerDirection = 'charging' | 'draining' | 'balanced' | 'unknown';
export type PowerSustainabilityRating =
  | 'recovering'
  | 'balanced'
  | 'watch'
  | 'unsustainable'
  | 'critical'
  | 'unknown';
export type PowerConfidenceLevel = 'low' | 'medium' | 'high';
export type PowerDataFreshness = 'live' | 'aging' | 'stale' | 'offline';

type AggregatePowerSnapshot = {
  available: boolean;
  connectedDeviceCount: number;
  reportingDeviceCount: number;
  batteryPercent: number | null;
  inputWatts: number | null;
  outputWatts: number | null;
  solarInputWatts: number | null;
  capacityWh: number | null;
  estimatedRuntimeMinutes: number | null;
  providerLabel: string | null;
  deviceLabel: string | null;
  lastUpdatedAt: number | null;
  freshness: PowerDataFreshness;
  freshnessText: string | null;
};

type PowerHistorySample = {
  timestamp: number;
  batteryPercent: number | null;
  inputWatts: number;
  outputWatts: number;
  solarInputWatts: number;
  netWatts: number;
  freshness: PowerDataFreshness;
};

type AggregateTelemetryReading = {
  deviceId: string;
  provider: string;
  batteryPercent: number | null;
  inputWatts: number | null;
  outputWatts: number | null;
  solarInputWatts: number | null;
  capacityWh: number | null;
  estimatedRuntimeMinutes: number | null;
  lastUpdatedAt: number | null;
  freshness: PowerDataFreshness;
  isConnected: boolean;
};

export type EcsPowerIntelligenceSnapshot = {
  available: boolean;
  connectedDeviceCount: number;
  reportingDeviceCount: number;
  batteryPercent: number | null;
  inputWatts: number | null;
  outputWatts: number | null;
  solarInputWatts: number | null;
  netWatts: number | null;
  powerDirection: PowerDirection;
  runtimeHoursRemaining: number | null;
  runtimeSource: 'provider' | 'derived' | 'unavailable';
  projectedDepletionAt: number | null;
  projectedThreshold50At: number | null;
  projectedThreshold20At: number | null;
  solarOffsetRatio: number | null;
  inputOffsetRatio: number | null;
  drainRateTrend: PowerTrendDirection;
  chargeRateTrend: PowerTrendDirection;
  abnormalDrawDetected: boolean;
  sustainabilityRating: PowerSustainabilityRating;
  advisoryCategory: PowerAdvisoryCategory;
  advisoryHeadline: string;
  advisoryDetail: string | null;
  confidenceLevel: PowerConfidenceLevel;
  dataFreshness: PowerDataFreshness;
  isLive: boolean;
  lastUpdatedAt: number | null;
  freshnessText: string | null;
  providerLabel: string | null;
  deviceLabel: string | null;
};

type PowerIntelligenceListener = (snapshot: EcsPowerIntelligenceSnapshot) => void;

const HISTORY_LIMIT = 240;
const RECENT_WINDOW_MS = 5 * 60_000;
const PRIOR_WINDOW_MS = 20 * 60_000;
const LIVE_WINDOW_MS = 45_000;
const STALE_WINDOW_MS = 2 * 60_000;
const BALANCED_NET_THRESHOLD_W = 30;
const MIN_RUNTIME_FOR_OVERNIGHT_HOURS = 6;

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number | null, digits = 1): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentage(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return Math.max(0, Math.min(1.5, numerator / denominator));
}

function formatClockTime(timestamp: number | null): string | null {
  if (timestamp == null || !Number.isFinite(timestamp)) return null;
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

function hoursUntilLocalMorning(targetHour = 6): number {
  const now = new Date();
  const morning = new Date(now);
  morning.setHours(targetHour, 0, 0, 0);
  if (morning.getTime() <= now.getTime()) {
    morning.setDate(morning.getDate() + 1);
  }
  return Math.max(0, (morning.getTime() - now.getTime()) / 3_600_000);
}

function mapFreshness(
  freshness: PowerFreshnessLabel | string | null | undefined,
  lastUpdatedAt: number | null,
): PowerDataFreshness {
  const ageMs = lastUpdatedAt != null ? Math.max(0, Date.now() - lastUpdatedAt) : null;
  const normalized = String(freshness ?? '').trim().toLowerCase();

  if (normalized === 'reconnecting') {
    return ageMs != null && ageMs <= LIVE_WINDOW_MS ? 'aging' : 'stale';
  }

  if (normalized === 'stale' || normalized === 'last_known' || normalized === 'last known') {
    return 'stale';
  }

  if (normalized === 'disconnected') {
    return lastUpdatedAt != null && ageMs != null && ageMs <= STALE_WINDOW_MS ? 'stale' : 'offline';
  }

  if (ageMs == null) {
    return normalized === 'live' ? 'live' : 'offline';
  }

  if (ageMs <= LIVE_WINDOW_MS) return 'live';
  if (ageMs <= STALE_WINDOW_MS) return 'aging';
  return 'stale';
}

function telemetryMapKey(provider: string, deviceId: string): string {
  return `${provider}:${deviceId}`;
}

function resolveTelemetryReadings(authority: BluAuthoritySnapshot): AggregateTelemetryReading[] {
  const telemetryMap = new Map<string, BluTelemetry>();

  try {
    for (const telemetry of bluStateStore.getAllTelemetry()) {
      telemetryMap.set(telemetryMapKey(telemetry.provider, telemetry.device_id), telemetry);
    }
  } catch {}

  let devices: BluDevice[] = [];
  try {
    devices = bluDeviceRegistry.getAll();
  } catch {}

  const readings: AggregateTelemetryReading[] = devices.map((device) => {
    const telemetry =
      telemetryMap.get(telemetryMapKey(device.provider, device.device_id))
      ?? (authority.primaryDevice?.device_id === device.device_id ? authority.primaryTelemetry ?? null : null);
    const providerState =
      device.provider in authority.providers
        ? authority.providers[device.provider as keyof typeof authority.providers]
        : null;
    const providerFreshness = providerState?.freshness ?? authority.freshness;
    const lastUpdatedAt = safeNumber(telemetry?.timestamp);
    const freshness = mapFreshness(providerFreshness, lastUpdatedAt);

    return {
      deviceId: device.device_id,
      provider: device.provider,
      batteryPercent: safeNumber(telemetry?.battery_percent),
      inputWatts: safeNumber(telemetry?.input_watts),
      outputWatts: safeNumber(telemetry?.output_watts),
      solarInputWatts: safeNumber(telemetry?.solar_input_watts),
      capacityWh: safeNumber(telemetry?.capacity_wh),
      estimatedRuntimeMinutes: safeNumber(telemetry?.estimated_runtime_minutes),
      lastUpdatedAt,
      freshness,
      isConnected:
        device.connection_state === 'connected'
        && freshness !== 'offline',
    } satisfies AggregateTelemetryReading;
  });

  if (!readings.length && authority.primaryTelemetry) {
    readings.push({
      deviceId: authority.primaryDevice?.device_id ?? 'authority-primary',
      provider: authority.activeProvider ?? 'unknown',
      batteryPercent: safeNumber(authority.primaryTelemetry.battery_percent),
      inputWatts: safeNumber(authority.primaryTelemetry.input_watts),
      outputWatts: safeNumber(authority.primaryTelemetry.output_watts),
      solarInputWatts: safeNumber(authority.primaryTelemetry.solar_input_watts),
      capacityWh: safeNumber(authority.primaryTelemetry.capacity_wh),
      estimatedRuntimeMinutes: safeNumber(authority.primaryTelemetry.estimated_runtime_minutes),
      lastUpdatedAt: safeNumber(authority.primaryTelemetry.timestamp),
      freshness: mapFreshness(authority.freshness, safeNumber(authority.primaryTelemetry.timestamp)),
      isConnected: authority.connectionState === 'connected',
    });
  }

  return readings;
}

function aggregateSnapshotFromAuthority(authority: BluAuthoritySnapshot): AggregatePowerSnapshot {
  const readings = resolveTelemetryReadings(authority);
  const usableReadings = readings.filter((reading) => reading.freshness === 'live' || reading.freshness === 'aging');
  const fallbackReadings = usableReadings.length ? usableReadings : readings.filter((reading) => reading.freshness !== 'offline');
  const activeReadings = fallbackReadings.length ? fallbackReadings : readings;

  const batteryReadings = activeReadings.filter((reading) => reading.batteryPercent != null);
  const weightedBatteryReadings = activeReadings.filter(
    (reading) => reading.batteryPercent != null && reading.capacityWh != null,
  );
  const totalCapacity = activeReadings.reduce((sum, reading) => sum + (reading.capacityWh ?? 0), 0);
  const weightedCapacity = weightedBatteryReadings.reduce((sum, reading) => sum + (reading.capacityWh ?? 0), 0);
  const weightedBatteryPercent =
    weightedCapacity > 0
      ? weightedBatteryReadings.reduce((sum, reading) => sum + ((reading.batteryPercent ?? 0) * (reading.capacityWh ?? 0)), 0) / weightedCapacity
      : average(batteryReadings.map((reading) => reading.batteryPercent as number));

  const inputWatts = activeReadings.reduce((sum, reading) => sum + (reading.inputWatts ?? 0), 0);
  const outputWatts = activeReadings.reduce((sum, reading) => sum + (reading.outputWatts ?? 0), 0);
  const solarInputWatts = activeReadings.reduce((sum, reading) => sum + (reading.solarInputWatts ?? 0), 0);
  const latestTimestamp = activeReadings.reduce<number | null>((latest, reading) => {
    if (reading.lastUpdatedAt == null) return latest;
    return latest == null ? reading.lastUpdatedAt : Math.max(latest, reading.lastUpdatedAt);
  }, authority.lastUpdatedAt ?? null);
  const mappedFreshness = mapFreshness(authority.freshness, latestTimestamp);
  const estimatedRuntimeMinutes =
    activeReadings.length <= 1
      ? activeReadings[0]?.estimatedRuntimeMinutes ?? safeNumber(authority.estimatedRuntimeMinutes)
      : null;

  return {
    available: Boolean(activeReadings.length || authority.hasPowerData || authority.primaryDevice),
    connectedDeviceCount: readings.filter((reading) => reading.isConnected).length,
    reportingDeviceCount: activeReadings.length,
    batteryPercent: round(weightedBatteryPercent, 0),
    inputWatts: activeReadings.length ? inputWatts : safeNumber(authority.inputWatts),
    outputWatts: activeReadings.length ? outputWatts : safeNumber(authority.outputWatts),
    solarInputWatts: activeReadings.length ? solarInputWatts : safeNumber(authority.solarInputWatts),
    capacityWh: totalCapacity > 0 ? totalCapacity : safeNumber(authority.capacityWh),
    estimatedRuntimeMinutes,
    providerLabel: authority.providerLabel ?? null,
    deviceLabel: authority.deviceLabel ?? null,
    lastUpdatedAt: latestTimestamp,
    freshness: mappedFreshness,
    freshnessText: authority.freshnessText ?? null,
  };
}

function pushHistorySample(history: PowerHistorySample[], aggregate: AggregatePowerSnapshot): PowerHistorySample[] {
  if (!aggregate.lastUpdatedAt || aggregate.batteryPercent == null) {
    return history;
  }

  const sample: PowerHistorySample = {
    timestamp: aggregate.lastUpdatedAt,
    batteryPercent: aggregate.batteryPercent,
    inputWatts: aggregate.inputWatts ?? 0,
    outputWatts: aggregate.outputWatts ?? 0,
    solarInputWatts: aggregate.solarInputWatts ?? 0,
    netWatts: (aggregate.inputWatts ?? 0) - (aggregate.outputWatts ?? 0),
    freshness: aggregate.freshness,
  };

  const lastSample = history[history.length - 1];
  if (lastSample && lastSample.timestamp === sample.timestamp) {
    if (
      lastSample.batteryPercent === sample.batteryPercent
      && lastSample.inputWatts === sample.inputWatts
      && lastSample.outputWatts === sample.outputWatts
      && lastSample.solarInputWatts === sample.solarInputWatts
      && lastSample.freshness === sample.freshness
    ) {
      return history;
    }

    const next = [...history];
    next[next.length - 1] = sample;
    return next;
  }

  const next = [...history, sample];
  if (next.length > HISTORY_LIMIT) {
    next.splice(0, next.length - HISTORY_LIMIT);
  }
  return next;
}

function historyWindow(
  history: PowerHistorySample[],
  maxAgeMs: number,
  minAgeMs = 0,
): PowerHistorySample[] {
  const now = Date.now();
  return history.filter((sample) => {
    const age = now - sample.timestamp;
    return age >= minAgeMs && age <= maxAgeMs && sample.freshness !== 'offline' && sample.freshness !== 'stale';
  });
}

function deriveTrend(
  recent: number | null,
  prior: number | null,
): PowerTrendDirection {
  if (recent == null || prior == null) return 'unknown';
  const delta = recent - prior;
  const ratioBase = Math.max(1, Math.abs(prior));
  if (Math.abs(delta) < 40 || Math.abs(delta) / ratioBase < 0.2) return 'stable';
  return delta > 0 ? 'rising' : 'falling';
}

function estimateThresholdAt(params: {
  batteryPercent: number | null;
  thresholdPercent: number;
  capacityWh: number | null;
  drainWatts: number | null;
}): number | null {
  const { batteryPercent, thresholdPercent, capacityWh, drainWatts } = params;
  if (batteryPercent == null || capacityWh == null || drainWatts == null || drainWatts <= 0) return null;
  if (batteryPercent <= thresholdPercent) return Date.now();
  const remainingWh = capacityWh * ((batteryPercent - thresholdPercent) / 100);
  const hours = remainingWh / drainWatts;
  if (!Number.isFinite(hours) || hours < 0) return null;
  return Date.now() + (hours * 3_600_000);
}

function deriveConfidence(params: {
  aggregate: AggregatePowerSnapshot;
  recentSamples: PowerHistorySample[];
  runtimeMinutes: number | null;
}): PowerConfidenceLevel {
  const { aggregate, recentSamples, runtimeMinutes } = params;
  if (
    aggregate.freshness === 'live'
    && aggregate.batteryPercent != null
    && aggregate.capacityWh != null
    && aggregate.inputWatts != null
    && aggregate.outputWatts != null
    && recentSamples.length >= 3
    && runtimeMinutes != null
  ) {
    return 'high';
  }

  if (
    (aggregate.freshness === 'live' || aggregate.freshness === 'aging')
    && aggregate.batteryPercent != null
    && (runtimeMinutes != null || aggregate.capacityWh != null)
  ) {
    return 'medium';
  }

  return 'low';
}

function buildAdvisory(params: {
  aggregate: AggregatePowerSnapshot;
  runtimeMinutes: number | null;
  runtimeSource: 'provider' | 'derived' | 'unavailable';
  netWatts: number | null;
  inputOffsetRatio: number | null;
  solarOffsetRatio: number | null;
  drainRateTrend: PowerTrendDirection;
  chargeRateTrend: PowerTrendDirection;
  abnormalDrawDetected: boolean;
  projectedDepletionAt: number | null;
  projectedThreshold20At: number | null;
  confidenceLevel: PowerConfidenceLevel;
}): Pick<
  EcsPowerIntelligenceSnapshot,
  'advisoryCategory' | 'advisoryHeadline' | 'advisoryDetail' | 'sustainabilityRating' | 'powerDirection'
> {
  const {
    aggregate,
    runtimeMinutes,
    runtimeSource,
    netWatts,
    inputOffsetRatio,
    solarOffsetRatio,
    drainRateTrend,
    chargeRateTrend,
    abnormalDrawDetected,
    projectedDepletionAt,
    projectedThreshold20At,
    confidenceLevel,
  } = params;

  const batteryPercent = aggregate.batteryPercent;
  const inputWatts = aggregate.inputWatts ?? 0;
  const outputWatts = aggregate.outputWatts ?? 0;
  const isOvernight = new Date().getHours() >= 17 || new Date().getHours() < 5;
  const runtimeHours = runtimeMinutes != null ? runtimeMinutes / 60 : null;
  const depletionText = formatClockTime(projectedDepletionAt);
  const threshold20Text = formatClockTime(projectedThreshold20At);

  if (aggregate.freshness === 'offline') {
    return {
      advisoryCategory: 'insufficient_data',
      advisoryHeadline: 'No live power telemetry is available.',
      advisoryDetail: 'Connect a supported power device to restore runtime and sustainability guidance.',
      sustainabilityRating: 'unknown',
      powerDirection: 'unknown',
    };
  }

  if (aggregate.freshness === 'stale') {
    return {
      advisoryCategory: 'insufficient_data',
      advisoryHeadline: 'Runtime estimate limited by stale power data.',
      advisoryDetail: 'Latest power telemetry is not current enough to mark as live.',
      sustainabilityRating: 'unknown',
      powerDirection: 'unknown',
    };
  }

  if (aggregate.freshness === 'aging') {
    return {
      advisoryCategory: 'unstable_power_state',
      advisoryHeadline: 'Power state is stabilizing while telemetry refreshes.',
      advisoryDetail: 'Live runtime guidance will settle once the power session returns to a fresh state.',
      sustainabilityRating: 'watch',
      powerDirection: 'unknown',
    };
  }

  if (batteryPercent == null || (runtimeSource === 'unavailable' && confidenceLevel === 'low')) {
    return {
      advisoryCategory: 'insufficient_data',
      advisoryHeadline: 'Runtime estimate limited due to incomplete live input data.',
      advisoryDetail: 'Battery reserve or load telemetry is incomplete, so ECS is holding guidance to a conservative posture.',
      sustainabilityRating: 'unknown',
      powerDirection: 'unknown',
    };
  }

  if (netWatts == null) {
    return {
      advisoryCategory: 'insufficient_data',
      advisoryHeadline: 'Power posture is available, but runtime confidence is limited.',
      advisoryDetail: 'ECS can see battery reserve, but it does not have enough live flow data to rate sustainability.',
      sustainabilityRating: 'unknown',
      powerDirection: 'unknown',
    };
  }

  const powerDirection: PowerDirection =
    netWatts > BALANCED_NET_THRESHOLD_W
      ? 'charging'
      : netWatts < -BALANCED_NET_THRESHOLD_W
        ? 'draining'
        : 'balanced';

  if (batteryPercent <= 12 || (runtimeHours != null && runtimeHours <= 1.5 && powerDirection === 'draining')) {
    return {
      advisoryCategory: 'critical_reserve',
      advisoryHeadline: 'Reserve power is approaching a critical margin.',
      advisoryDetail:
        depletionText
          ? `At current usage, battery will deplete around ${depletionText}.`
          : threshold20Text
            ? `At the present load, reserve is likely to fall below 20% around ${threshold20Text}.`
            : 'Reduce non-essential load and prioritize recovery input where available.',
      sustainabilityRating: 'critical',
      powerDirection,
    };
  }

  if (powerDirection === 'charging' && netWatts > BALANCED_NET_THRESHOLD_W) {
    return {
      advisoryCategory: 'charging_recovering',
      advisoryHeadline:
        chargeRateTrend === 'rising'
          ? 'Power trend is improving; battery recovery is strengthening.'
          : 'Battery recovery is positive; current charge input exceeds usage.',
      advisoryDetail:
        outputWatts > 0 && solarOffsetRatio != null
          ? `Solar is covering about ${Math.round(solarOffsetRatio * 100)}% of active load while total input remains ahead of demand.`
          : `Current input is exceeding load by about ${Math.round(netWatts)}W.`,
      sustainabilityRating: 'recovering',
      powerDirection,
    };
  }

  if (powerDirection === 'balanced') {
    const overnightHours = hoursUntilLocalMorning();
    const overnightSafe = isOvernight && runtimeHours != null && runtimeHours >= Math.max(MIN_RUNTIME_FOR_OVERNIGHT_HOURS, overnightHours);
    return {
      advisoryCategory: 'balanced_usage',
      advisoryHeadline:
        overnightSafe
          ? 'Current load appears sustainable for overnight use.'
          : 'Current power posture is holding near balance.',
      advisoryDetail:
        inputOffsetRatio != null && outputWatts > 0
          ? `Input is covering about ${Math.round(inputOffsetRatio * 100)}% of active output.`
          : 'Net flow is holding close enough to neutral to avoid a meaningful reserve change.',
      sustainabilityRating: overnightSafe ? 'balanced' : 'watch',
      powerDirection,
    };
  }

  const offsetPct = inputOffsetRatio != null ? Math.round(inputOffsetRatio * 100) : null;
  const heavyDrain = abnormalDrawDetected || outputWatts >= 250 || drainRateTrend === 'rising';
  const unsustainable =
    (runtimeHours != null && runtimeHours <= 6)
    || (batteryPercent <= 30 && inputOffsetRatio != null && inputOffsetRatio < 0.5)
    || (isOvernight && runtimeHours != null && runtimeHours < hoursUntilLocalMorning());

  if (unsustainable) {
    return {
      advisoryCategory: 'unsustainable_drain',
      advisoryHeadline: 'Current power posture is not sustainable at the present load.',
      advisoryDetail:
        depletionText
          ? `At current usage, reserve is tracking to ${depletionText}.`
          : offsetPct != null
            ? `Input is offsetting only ${offsetPct}% of current output.`
            : 'Active demand is draining reserve faster than ECS considers sustainable.',
      sustainabilityRating: runtimeHours != null && runtimeHours <= 2.5 ? 'critical' : 'unsustainable',
      powerDirection,
    };
  }

  if (heavyDrain) {
    return {
      advisoryCategory: 'heavy_drain',
      advisoryHeadline:
        drainRateTrend === 'rising'
          ? 'Active load is causing accelerated drain.'
          : 'Load demand is pulling a heavy reserve drain.',
      advisoryDetail:
        offsetPct != null
          ? `Input is offsetting about ${offsetPct}% of current output.`
          : `Net drain is running about ${Math.round(Math.abs(netWatts))}W.`,
      sustainabilityRating: 'watch',
      powerDirection,
    };
  }

  return {
    advisoryCategory: 'moderate_drain',
    advisoryHeadline: 'Battery drain is outpacing recovery.',
    advisoryDetail:
      threshold20Text
        ? `At the present load, reserve is likely to fall below 20% around ${threshold20Text}.`
        : depletionText
          ? `At current usage, reserve is tracking to ${depletionText}.`
          : offsetPct != null
            ? `Input is offsetting about ${offsetPct}% of current output.`
            : 'Current output is exceeding charge input by a modest margin.',
    sustainabilityRating: 'watch',
    powerDirection,
  };
}

function computeSnapshot(
  aggregate: AggregatePowerSnapshot,
  history: PowerHistorySample[],
): EcsPowerIntelligenceSnapshot {
  const recentSamples = historyWindow(history, RECENT_WINDOW_MS);
  const priorSamples = historyWindow(history, PRIOR_WINDOW_MS, RECENT_WINDOW_MS);

  const smoothedInputWatts = average(recentSamples.map((sample) => sample.inputWatts)) ?? aggregate.inputWatts;
  const smoothedOutputWatts = average(recentSamples.map((sample) => sample.outputWatts)) ?? aggregate.outputWatts;
  const smoothedSolarWatts = average(recentSamples.map((sample) => sample.solarInputWatts)) ?? aggregate.solarInputWatts;
  const netWatts =
    smoothedInputWatts != null && smoothedOutputWatts != null
      ? smoothedInputWatts + (smoothedSolarWatts ?? 0) - smoothedOutputWatts
      : null;
  const totalRecoveryWatts = smoothedInputWatts != null
    ? smoothedInputWatts + (smoothedSolarWatts ?? 0)
    : smoothedSolarWatts;
  const inputOffsetRatio = percentage(totalRecoveryWatts, smoothedOutputWatts);
  const solarOffsetRatio = percentage(smoothedSolarWatts, smoothedOutputWatts);

  const drainRateTrend = deriveTrend(
    average(recentSamples.map((sample) => Math.max(0, sample.outputWatts - sample.inputWatts))),
    average(priorSamples.map((sample) => Math.max(0, sample.outputWatts - sample.inputWatts))),
  );
  const chargeRateTrend = deriveTrend(
    average(recentSamples.map((sample) => Math.max(0, sample.inputWatts - sample.outputWatts))),
    average(priorSamples.map((sample) => Math.max(0, sample.inputWatts - sample.outputWatts))),
  );
  const recentOutput = average(recentSamples.map((sample) => sample.outputWatts));
  const priorOutput = average(priorSamples.map((sample) => sample.outputWatts));
  const abnormalDrawDetected =
    recentOutput != null
    && priorOutput != null
    && recentOutput - priorOutput >= 60
    && recentOutput / Math.max(1, priorOutput) >= 1.25;

  const derivedForecast =
    aggregate.batteryPercent != null
    && aggregate.capacityWh != null
    && smoothedOutputWatts != null
      ? computePowerForecast({
          socPct: aggregate.batteryPercent,
          wattsIn: (smoothedInputWatts ?? 0) + (smoothedSolarWatts ?? 0),
          wattsOut: smoothedOutputWatts,
          capacityWh: aggregate.capacityWh,
        })
      : null;

  const runtimeMinutes =
    aggregate.freshness === 'live' && aggregate.estimatedRuntimeMinutes != null
      ? aggregate.estimatedRuntimeMinutes
      : derivedForecast?.estDepletionMin ?? null;
  const runtimeSource: EcsPowerIntelligenceSnapshot['runtimeSource'] =
    aggregate.freshness === 'live' && aggregate.estimatedRuntimeMinutes != null
      ? 'provider'
      : derivedForecast?.estDepletionMin != null
        ? 'derived'
        : 'unavailable';
  const projectedDepletionAt =
    runtimeMinutes != null && runtimeMinutes > 0 && netWatts != null && netWatts < -BALANCED_NET_THRESHOLD_W
      ? Date.now() + (runtimeMinutes * 60_000)
      : null;
  const drainWatts = netWatts != null && netWatts < 0 ? Math.abs(netWatts) : null;
  const projectedThreshold50At = estimateThresholdAt({
    batteryPercent: aggregate.batteryPercent,
    thresholdPercent: 50,
    capacityWh: aggregate.capacityWh,
    drainWatts,
  });
  const projectedThreshold20At = estimateThresholdAt({
    batteryPercent: aggregate.batteryPercent,
    thresholdPercent: 20,
    capacityWh: aggregate.capacityWh,
    drainWatts,
  });
  const confidenceLevel = deriveConfidence({
    aggregate,
    recentSamples,
    runtimeMinutes,
  });

  const advisory = buildAdvisory({
    aggregate,
    runtimeMinutes,
    runtimeSource,
    netWatts,
    inputOffsetRatio,
    solarOffsetRatio,
    drainRateTrend,
    chargeRateTrend,
    abnormalDrawDetected,
    projectedDepletionAt,
    projectedThreshold20At,
    confidenceLevel,
  });

  return {
    available: aggregate.available,
    connectedDeviceCount: aggregate.connectedDeviceCount,
    reportingDeviceCount: aggregate.reportingDeviceCount,
    batteryPercent: aggregate.batteryPercent,
    inputWatts: round(smoothedInputWatts, 0),
    outputWatts: round(smoothedOutputWatts, 0),
    solarInputWatts: round(smoothedSolarWatts, 0),
    netWatts: round(netWatts, 0),
    powerDirection: advisory.powerDirection,
    runtimeHoursRemaining: runtimeMinutes != null ? round(runtimeMinutes / 60, 1) : null,
    runtimeSource,
    projectedDepletionAt,
    projectedThreshold50At,
    projectedThreshold20At,
    solarOffsetRatio: round(solarOffsetRatio, 2),
    inputOffsetRatio: round(inputOffsetRatio, 2),
    drainRateTrend,
    chargeRateTrend,
    abnormalDrawDetected,
    sustainabilityRating: advisory.sustainabilityRating,
    advisoryCategory: advisory.advisoryCategory,
    advisoryHeadline: advisory.advisoryHeadline,
    advisoryDetail: advisory.advisoryDetail,
    confidenceLevel,
    dataFreshness: aggregate.freshness,
    isLive: aggregate.freshness === 'live',
    lastUpdatedAt: aggregate.lastUpdatedAt,
    freshnessText: aggregate.freshnessText,
    providerLabel: aggregate.providerLabel,
    deviceLabel: aggregate.deviceLabel,
  };
}

function emptySnapshot(): EcsPowerIntelligenceSnapshot {
  return {
    available: false,
    connectedDeviceCount: 0,
    reportingDeviceCount: 0,
    batteryPercent: null,
    inputWatts: null,
    outputWatts: null,
    solarInputWatts: null,
    netWatts: null,
    powerDirection: 'unknown',
    runtimeHoursRemaining: null,
    runtimeSource: 'unavailable',
    projectedDepletionAt: null,
    projectedThreshold50At: null,
    projectedThreshold20At: null,
    solarOffsetRatio: null,
    inputOffsetRatio: null,
    drainRateTrend: 'unknown',
    chargeRateTrend: 'unknown',
    abnormalDrawDetected: false,
    sustainabilityRating: 'unknown',
    advisoryCategory: 'insufficient_data',
    advisoryHeadline: 'No live power telemetry is available.',
    advisoryDetail: 'Connect a supported power device to restore runtime and sustainability guidance.',
    confidenceLevel: 'low',
    dataFreshness: 'offline',
    isLive: false,
    lastUpdatedAt: null,
    freshnessText: null,
    providerLabel: null,
    deviceLabel: null,
  };
}

class EcsPowerIntelligenceAuthority {
  private listeners = new Set<PowerIntelligenceListener>();
  private unsubs: (() => void)[] = [];
  private history: PowerHistorySample[] = [];
  private lastSnapshot: EcsPowerIntelligenceSnapshot = emptySnapshot();
  private started = false;

  constructor() {
    this.start();
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    try {
      this.unsubs.push(bluPowerAuthority.subscribe(() => this.refresh()));
    } catch {}

    try {
      this.unsubs.push(bluStateStore.subscribe(() => this.refresh()));
    } catch {}

    try {
      this.unsubs.push(bluDeviceRegistry.subscribe(() => this.refresh()));
    } catch {}

    this.refresh();
  }

  stop(): void {
    this.unsubs.forEach((unsub) => {
      try { unsub(); } catch {}
    });
    this.unsubs = [];
    this.started = false;
  }

  subscribe(listener: PowerIntelligenceListener): () => void {
    this.listeners.add(listener);
    listener(this.lastSnapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): EcsPowerIntelligenceSnapshot {
    return this.lastSnapshot;
  }

  private refresh(): void {
    let authority: BluAuthoritySnapshot;

    try {
      authority = bluPowerAuthority.getSnapshot();
    } catch {
      this.lastSnapshot = emptySnapshot();
      return;
    }

    const aggregate = aggregateSnapshotFromAuthority(authority);
    this.history = pushHistorySample(this.history, aggregate);
    this.lastSnapshot = computeSnapshot(aggregate, this.history);

    for (const listener of this.listeners) {
      try { listener(this.lastSnapshot); } catch {}
    }
  }
}

export const ecsPowerIntelligence = new EcsPowerIntelligenceAuthority();

export function usePowerIntelligence(): EcsPowerIntelligenceSnapshot {
  const [snapshot, setSnapshot] = useState<EcsPowerIntelligenceSnapshot>(() => ecsPowerIntelligence.getSnapshot());

  useEffect(() => {
    const off = ecsPowerIntelligence.subscribe((next) => setSnapshot(next));
    return off;
  }, []);

  return snapshot;
}

export function getPowerIntelligenceTone(
  snapshot: Pick<EcsPowerIntelligenceSnapshot, 'advisoryCategory' | 'sustainabilityRating' | 'dataFreshness'> | null | undefined,
): 'good' | 'attention' | 'critical' | 'degraded' | 'neutral' {
  if (!snapshot) return 'neutral';
  if (snapshot.dataFreshness === 'stale' || snapshot.dataFreshness === 'offline') return 'degraded';
  if (snapshot.advisoryCategory === 'critical_reserve' || snapshot.sustainabilityRating === 'critical') return 'critical';
  if (
    snapshot.advisoryCategory === 'unsustainable_drain'
    || snapshot.advisoryCategory === 'heavy_drain'
    || snapshot.sustainabilityRating === 'unsustainable'
  ) {
    return 'attention';
  }
  if (
    snapshot.advisoryCategory === 'charging_recovering'
    || snapshot.advisoryCategory === 'balanced_usage'
    || snapshot.sustainabilityRating === 'recovering'
    || snapshot.sustainabilityRating === 'balanced'
  ) {
    return 'good';
  }
  return 'neutral';
}

export function formatPowerProjectionTime(timestamp: number | null): string | null {
  return formatClockTime(timestamp);
}
