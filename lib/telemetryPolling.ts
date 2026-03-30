// ============================================================
// ECS TELEMETRY POLLING ENGINE
// ============================================================
// Real-time polling mechanism for live telemetry updates.
// Tracks consumption history, calculates rates vs plan,
// provides color-coded status, and estimates fuel range.
// Integrates with GPS distance tracker for real driving data.
// ============================================================

import { Platform } from 'react-native';
import { telemetryConfigStore, computeTelemetryReadout } from './telemetryStore';
import { missionEventStore, missionExpeditionStore } from './missionStore';
import { gpsDistanceTracker, type TrackerSnapshot } from './gpsDistanceTracker';
import type { TelemetryReadout, TelemetryConfig, ExpeditionEvent } from './missionTypes';

// ── Storage helpers ──────────────────────────────────────────
const mem: Record<string, string> = {};

function sGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return mem[key] || null;
  } catch { return mem[key] || null; }
}

function sSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    mem[key] = value;
  } catch { mem[key] = value; }
}

// ── Types ────────────────────────────────────────────────────

export type ResourceType = 'fuel' | 'water' | 'power';
export type StatusColor = 'green' | 'amber' | 'red';

export interface TelemetrySnapshot {
  timestamp: string;
  fuelPercent: number | null;
  fuelRemainingGal: number | null;
  waterPercent: number | null;
  waterRemainingL: number | null;
  powerPercent: number | null;
  powerRemainingWh: number | null;
  distanceMi: number;
}

export interface ConsumptionRate {
  resource: ResourceType;
  ratePerHour: number;       // units consumed per hour
  ratePerDay: number;        // units consumed per day
  plannedRatePerDay: number; // planned daily rate
  ratioVsPlan: number;       // actual/planned (1.0 = on plan, >1 = over)
  status: StatusColor;       // green/amber/red based on ratio
  trend: 'stable' | 'increasing' | 'decreasing'; // consumption trend
  unitLabel: string;         // 'gal' | 'L' | 'Wh'
}

export interface FuelRangeEstimate {
  currentRangeMi: number | null;
  trendRangeMi: number | null;     // range based on actual consumption trend
  safeRangeMi: number | null;      // 75% of trend range
  hoursRemaining: number | null;
  daysRemaining: number | null;
  confidence: 'high' | 'medium' | 'low';
  consumptionMpg: number | null;   // actual computed MPG
}

export interface LiveTelemetryState {
  readout: TelemetryReadout;
  config: TelemetryConfig;
  snapshots: TelemetrySnapshot[];
  fuelRate: ConsumptionRate | null;
  waterRate: ConsumptionRate | null;
  powerRate: ConsumptionRate | null;
  fuelRange: FuelRangeEstimate;
  fuelStatus: StatusColor;
  waterStatus: StatusColor;
  powerStatus: StatusColor;
  overallStatus: StatusColor;
  elapsedHours: number;
  lastPollTime: string;
}

export interface ResourceHistoryPoint {
  timestamp: string;
  value: number;        // remaining amount
  percent: number;      // remaining percent
  eventType?: string;   // what caused the change
  delta?: number;       // amount consumed in this event
}

// ── History Keys ─────────────────────────────────────────────
const HISTORY_KEY = (expId: string) => `ecs_telemetry_history_${expId}`;
const SNAPSHOT_KEY = (expId: string) => `ecs_telemetry_snapshots_${expId}`;

// ── Snapshot Management ──────────────────────────────────────

function getSnapshots(expeditionId: string): TelemetrySnapshot[] {
  try {
    const raw = sGet(SNAPSHOT_KEY(expeditionId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSnapshot(expeditionId: string, snapshot: TelemetrySnapshot): void {
  const snaps = getSnapshots(expeditionId);
  snaps.push(snapshot);
  // Keep last 200 snapshots
  const trimmed = snaps.slice(-200);
  sSet(SNAPSHOT_KEY(expeditionId), JSON.stringify(trimmed));
}

function captureSnapshot(expeditionId: string): TelemetrySnapshot {
  const config = telemetryConfigStore.get(expeditionId);
  const fuelPct = config.fuelCapacityGal && config.fuelRemainingGal !== null
    ? Math.round((config.fuelRemainingGal / config.fuelCapacityGal) * 100)
    : null;
  const waterPct = config.waterCapacityL && config.waterRemainingL !== null
    ? Math.round((config.waterRemainingL / config.waterCapacityL) * 100)
    : null;
  const powerPct = config.powerCapacityWh && config.powerRemainingWh !== null
    ? Math.round((config.powerRemainingWh / config.powerCapacityWh) * 100)
    : null;

  const snap: TelemetrySnapshot = {
    timestamp: new Date().toISOString(),
    fuelPercent: fuelPct,
    fuelRemainingGal: config.fuelRemainingGal,
    waterPercent: waterPct,
    waterRemainingL: config.waterRemainingL,
    powerPercent: powerPct,
    powerRemainingWh: config.powerRemainingWh,
    distanceMi: config.distanceTraveledMi,
  };

  saveSnapshot(expeditionId, snap);
  return snap;
}

// ── Consumption Rate Calculation ─────────────────────────────

function getStatusColor(ratioVsPlan: number): StatusColor {
  if (ratioVsPlan <= 1.1) return 'green';   // within 10% of plan
  if (ratioVsPlan <= 1.5) return 'amber';   // 10-50% over plan
  return 'red';                              // >50% over plan
}

function getStatusColorFromPercent(percent: number | null): StatusColor {
  if (percent === null) return 'amber';
  if (percent > 35) return 'green';
  if (percent >= 15) return 'amber';
  return 'red';
}

function computeTrend(snapshots: TelemetrySnapshot[], field: keyof TelemetrySnapshot): 'stable' | 'increasing' | 'decreasing' {
  if (snapshots.length < 3) return 'stable';
  const recent = snapshots.slice(-5);
  const values = recent.map(s => s[field] as number | null).filter((v): v is number => v !== null);
  if (values.length < 2) return 'stable';

  // Compare first half avg to second half avg
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const diff = avgFirst - avgSecond; // positive = consuming more (remaining decreasing faster)
  const threshold = avgFirst * 0.05; // 5% threshold

  if (Math.abs(diff) < threshold) return 'stable';
  return diff > 0 ? 'increasing' : 'decreasing';
}

function computeConsumptionRate(
  expeditionId: string,
  resource: ResourceType,
  config: TelemetryConfig,
  snapshots: TelemetrySnapshot[],
  elapsedHours: number,
): ConsumptionRate | null {
  if (elapsedHours < 0.01) return null;

  let totalConsumed = 0;
  let capacity = 0;
  let plannedDaily = 0;
  let unitLabel = '';
  let configured = false;

  switch (resource) {
    case 'fuel':
      if (!config.fuelCapacityGal || config.fuelRemainingGal === null) return null;
      configured = true;
      capacity = config.fuelCapacityGal;
      totalConsumed = capacity - config.fuelRemainingGal;
      // Planned: based on MPG and expected daily distance (~100mi/day default)
      plannedDaily = config.fuelMpg ? (100 / config.fuelMpg) : 6.25; // ~100mi/day at 16mpg
      unitLabel = 'gal';
      break;
    case 'water':
      if (!config.waterCapacityL || config.waterRemainingL === null) return null;
      configured = true;
      capacity = config.waterCapacityL;
      totalConsumed = capacity - config.waterRemainingL;
      plannedDaily = config.waterDailyBurnL || 7; // default 7L/day
      unitLabel = 'L';
      break;
    case 'power':
      if (!config.powerConfigured || !config.powerCapacityWh || config.powerRemainingWh === null) return null;
      configured = true;
      capacity = config.powerCapacityWh;
      totalConsumed = capacity - config.powerRemainingWh;
      plannedDaily = (config.powerAvgDrawW || 50) * 24; // watts * 24hrs
      unitLabel = 'Wh';
      break;
  }

  if (!configured) return null;

  const ratePerHour = totalConsumed / Math.max(elapsedHours, 0.1);
  const ratePerDay = ratePerHour * 24;
  const ratioVsPlan = plannedDaily > 0 ? ratePerDay / plannedDaily : 1;

  const trendField: keyof TelemetrySnapshot = resource === 'fuel'
    ? 'fuelPercent'
    : resource === 'water'
      ? 'waterPercent'
      : 'powerPercent';

  return {
    resource,
    ratePerHour: Math.round(ratePerHour * 100) / 100,
    ratePerDay: Math.round(ratePerDay * 100) / 100,
    plannedRatePerDay: Math.round(plannedDaily * 100) / 100,
    ratioVsPlan: Math.round(ratioVsPlan * 100) / 100,
    status: getStatusColor(ratioVsPlan),
    trend: computeTrend(snapshots, trendField),
    unitLabel,
  };
}

// ── Fuel Range Estimator ─────────────────────────────────────

function computeFuelRangeEstimate(
  config: TelemetryConfig,
  fuelRate: ConsumptionRate | null,
  elapsedHours: number,
): FuelRangeEstimate {
  const noData: FuelRangeEstimate = {
    currentRangeMi: null,
    trendRangeMi: null,
    safeRangeMi: null,
    hoursRemaining: null,
    daysRemaining: null,
    confidence: 'low',
    consumptionMpg: null,
  };

  if (!config.fuelCapacityGal || config.fuelRemainingGal === null || !config.fuelMpg) {
    return noData;
  }

  // Basic range from MPG
  const currentRangeMi = Math.round(config.fuelRemainingGal * config.fuelMpg);

  // Trend-based range
  let trendRangeMi: number | null = null;
  let consumptionMpg: number | null = config.fuelMpg;
  let hoursRemaining: number | null = null;
  let daysRemaining: number | null = null;
  let confidence: 'high' | 'medium' | 'low' = 'low';

  if (fuelRate && fuelRate.ratePerHour > 0 && config.distanceTraveledMi > 0 && elapsedHours > 0.5) {
    // Compute actual MPG from consumption data
    const fuelUsed = config.fuelCapacityGal - config.fuelRemainingGal;
    if (fuelUsed > 0) {
      consumptionMpg = Math.round((config.distanceTraveledMi / fuelUsed) * 10) / 10;
      trendRangeMi = Math.round(config.fuelRemainingGal * consumptionMpg);
    }

    // Hours remaining at current rate
    hoursRemaining = Math.round((config.fuelRemainingGal / fuelRate.ratePerHour) * 10) / 10;
    daysRemaining = Math.round((hoursRemaining / 24) * 10) / 10;

    // Confidence based on data points
    if (elapsedHours > 4) confidence = 'high';
    else if (elapsedHours > 1) confidence = 'medium';
  }

  return {
    currentRangeMi,
    trendRangeMi: trendRangeMi ?? currentRangeMi,
    safeRangeMi: Math.round((trendRangeMi ?? currentRangeMi) * 0.75),
    hoursRemaining,
    daysRemaining,
    confidence,
    consumptionMpg,
  };
}

// ── Resource History Builder ─────────────────────────────────

export function buildResourceHistory(
  expeditionId: string,
  resource: ResourceType,
): ResourceHistoryPoint[] {
  const events = missionEventStore.getByExpeditionId(expeditionId);
  const config = telemetryConfigStore.get(expeditionId);
  const points: ResourceHistoryPoint[] = [];

  // Sort events chronologically
  const sorted = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let capacity = 0;

  switch (resource) {
    case 'fuel': {
      capacity = config.fuelCapacityGal || 100;
      let remaining = capacity;

      // Initial point
      points.push({
        timestamp: sorted[0]?.createdAt || new Date().toISOString(),
        value: remaining,
        percent: 100,
        eventType: 'INITIAL',
      });

      for (const evt of sorted) {
        if (evt.type === 'FUEL_LOGGED' || (evt.type as string) === 'FUEL_USED') {
          const p = evt.payload || {};
          const gallons = p.gallons || 0;
          if (p.mode === 'added') {
            remaining = Math.min(remaining + gallons, capacity);
          } else {
            remaining = Math.max(0, remaining - gallons);
          }
          points.push({
            timestamp: evt.createdAt,
            value: Math.round(remaining * 100) / 100,
            percent: Math.round((remaining / capacity) * 100),
            eventType: evt.type,
            delta: gallons,
          });
        }
      }

      // Current point
      if (config.fuelRemainingGal !== null) {
        points.push({
          timestamp: new Date().toISOString(),
          value: config.fuelRemainingGal,
          percent: Math.round((config.fuelRemainingGal / capacity) * 100),
          eventType: 'CURRENT',
        });
      }
      break;
    }
    case 'water': {
      capacity = config.waterCapacityL || 50;
      let remaining = capacity;

      points.push({
        timestamp: sorted[0]?.createdAt || new Date().toISOString(),
        value: remaining,
        percent: 100,
        eventType: 'INITIAL',
      });

      for (const evt of sorted) {
        if (evt.type === 'WATER_USED') {
          const liters = evt.payload?.liters || 0;
          remaining = Math.max(0, remaining - liters);
          points.push({
            timestamp: evt.createdAt,
            value: Math.round(remaining * 100) / 100,
            percent: Math.round((remaining / capacity) * 100),
            eventType: evt.type,
            delta: liters,
          });
        }
      }

      if (config.waterRemainingL !== null) {
        points.push({
          timestamp: new Date().toISOString(),
          value: config.waterRemainingL,
          percent: Math.round((config.waterRemainingL / capacity) * 100),
          eventType: 'CURRENT',
        });
      }
      break;
    }
    case 'power': {
      capacity = config.powerCapacityWh || 1000;
      let remaining = capacity;

      points.push({
        timestamp: sorted[0]?.createdAt || new Date().toISOString(),
        value: remaining,
        percent: 100,
        eventType: 'INITIAL',
      });

      for (const evt of sorted) {
        if (evt.type === 'POWER_UPDATED') {
          const p = evt.payload || {};
          if (p.whUsed) {
            remaining = Math.max(0, remaining - p.whUsed);
          } else if (p.percentUsed && config.powerCapacityWh) {
            remaining = Math.max(0, remaining - (p.percentUsed / 100) * config.powerCapacityWh);
          }
          points.push({
            timestamp: evt.createdAt,
            value: Math.round(remaining * 100) / 100,
            percent: Math.round((remaining / capacity) * 100),
            eventType: evt.type,
            delta: p.whUsed || (p.percentUsed ? (p.percentUsed / 100) * capacity : 0),
          });
        }
      }

      if (config.powerRemainingWh !== null) {
        points.push({
          timestamp: new Date().toISOString(),
          value: config.powerRemainingWh,
          percent: Math.round((config.powerRemainingWh / capacity) * 100),
          eventType: 'CURRENT',
        });
      }
      break;
    }
  }

  return points;
}

// ── Main Poll Function ───────────────────────────────────────

export function pollTelemetry(expeditionId: string): LiveTelemetryState {
  const config = telemetryConfigStore.get(expeditionId);
  const readout = computeTelemetryReadout(expeditionId);
  const expedition = missionExpeditionStore.getById(expeditionId);

  // Capture snapshot
  const snapshot = captureSnapshot(expeditionId);
  const snapshots = getSnapshots(expeditionId);

  // Calculate elapsed hours
  let elapsedHours = 0;
  if (expedition?.startedAt) {
    const start = new Date(expedition.startedAt).getTime();
    const end = expedition.endedAt ? new Date(expedition.endedAt).getTime() : Date.now();
    elapsedHours = (end - start) / (1000 * 60 * 60);
  }

  // Compute consumption rates
  const fuelRate = computeConsumptionRate(expeditionId, 'fuel', config, snapshots, elapsedHours);
  const waterRate = computeConsumptionRate(expeditionId, 'water', config, snapshots, elapsedHours);
  const powerRate = computeConsumptionRate(expeditionId, 'power', config, snapshots, elapsedHours);

  // Fuel range estimate
  const fuelRange = computeFuelRangeEstimate(config, fuelRate, elapsedHours);

  // Status colors
  const fuelStatus = fuelRate ? fuelRate.status : getStatusColorFromPercent(readout.fuelPercent);
  const waterStatus = waterRate ? waterRate.status : getStatusColorFromPercent(
    readout.waterConfigured && config.waterCapacityL && config.waterRemainingL !== null
      ? Math.round((config.waterRemainingL / config.waterCapacityL) * 100)
      : null
  );
  const powerStatus = powerRate ? powerRate.status : getStatusColorFromPercent(readout.powerPercent);

  // Overall status = worst of all configured systems
  const statuses = [fuelStatus, waterStatus, powerStatus];
  const overallStatus: StatusColor = statuses.includes('red') ? 'red'
    : statuses.includes('amber') ? 'amber' : 'green';

  return {
    readout,
    config,
    snapshots,
    fuelRate,
    waterRate,
    powerRate,
    fuelRange,
    fuelStatus,
    waterStatus,
    powerStatus,
    overallStatus,
    elapsedHours,
    lastPollTime: new Date().toISOString(),
  };
}

// ── Color Hex Mapping ────────────────────────────────────────

export const STATUS_COLORS: Record<StatusColor, string> = {
  green: '#4CAF50',
  amber: '#C48A2C',
  red: '#E53935',
};

export function getStatusHex(status: StatusColor): string {
  return STATUS_COLORS[status];
}

// ── Polling Hook Helper ──────────────────────────────────────
// Returns a function that sets up interval-based polling.
// Usage in React: useEffect with setInterval.

export const POLL_INTERVAL_MS = 10000; // 10 seconds
export const FAST_POLL_MS = 3000;      // 3 seconds after an update

