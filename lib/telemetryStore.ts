// ============================================================
// ECS TELEMETRY STORE — Live Systems Connection Pass
// ============================================================
// Offline-first persistence for fuel, water, power telemetry.
// Computes readout state from config + event logs and now supports
// managed power device snapshots as a normalized live connection layer.
//
// Goals of this pass:
// - Preserve the existing expedition telemetry API surface
// - Add a normalized bridge from managed power devices
// - Add subscription helpers for UI / AI refresh paths
// - Keep readout generation deterministic and backward compatible
// ============================================================

import { Platform } from 'react-native';
import type {
  TelemetryConfig,
  TelemetryReadout,
  TelemetryState,
  BufferLevel,
  ExpeditionEventType,
} from './missionTypes';
import { missionEventStore, missionExpeditionStore } from './missionStore';
import { powerSetupStore, type ManagedPowerDevice } from './powerSetupStore';
import {
  evaluateTelemetryState,
  type TelemetryAvailability,
  type TelemetryContext,
} from './telemetryStateEngine';

const TAG = '[TELEMETRY]';
const LIVE_POWER_STALE_MS = 10 * 60 * 1000;

// ── Storage helpers (same pattern as missionStore) ───────────
const mem: Record<string, string> = {};

function sGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return mem[key] || null;
  } catch {
    return mem[key] || null;
  }
}

function sSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    mem[key] = value;
  } catch {
    mem[key] = value;
  }
}

const now = () => new Date().toISOString();

const TELEMETRY_KEY_PREFIX = 'ecs_telemetry_';

function configKey(expeditionId: string): string {
  return `${TELEMETRY_KEY_PREFIX}${expeditionId}`;
}

function num(value: any): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampPct(value: number | null): number | null {
  if (value == null) return null;
  return Math.max(0, Math.min(100, value));
}

function minutesAgoLabel(timestamp: string | null | undefined): string {
  if (!timestamp) return 'manual';
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

// ── Subscription layer ──────────────────────────────────────
type TelemetryListener = (payload: {
  expeditionId: string | null;
  config: TelemetryConfig | null;
  readout: TelemetryReadout | null;
}) => void;

const telemetryListeners = new Set<TelemetryListener>();

function notifyTelemetryListeners(expeditionId: string | null): void {
  const config = expeditionId ? telemetryConfigStore.get(expeditionId) : null;
  const readout = expeditionId ? computeTelemetryReadout(expeditionId) : null;
  telemetryListeners.forEach((fn) => {
    try {
      fn({ expeditionId, config, readout });
    } catch {}
  });
}

export function subscribeTelemetry(listener: TelemetryListener): () => void {
  telemetryListeners.add(listener);
  return () => telemetryListeners.delete(listener);
}

// ── Live managed power device bridge ────────────────────────
export type LivePowerDeviceSnapshot = {
  deviceId: string;
  provider: string;
  connectionMethod: string;
  connectionState: ManagedPowerDevice['connectionState'];
  label: string;
  isPrimary: boolean;
  role: ManagedPowerDevice['role'];
  vehicleId: string | null;
  batterySocPercent: number | null;
  batteryCapacityWh: number | null;
  batteryRemainingWh: number | null;
  avgDrawWatts: number | null;
  wattsIn: number | null;
  wattsOut: number | null;
  estimatedRuntimeHours: number | null;
  signalStrength: number | null;
  lastSeenAt: string | null;
  isStale: boolean;
};

function getDeviceCapacityWh(device: ManagedPowerDevice, config: TelemetryConfig | null): number | null {
  const fromConfig = num(config?.powerCapacityWh);
  return fromConfig != null && fromConfig > 0 ? fromConfig : null;
}

export function getManagedPowerSnapshot(expeditionId?: string | null): LivePowerDeviceSnapshot | null {
  const config = expeditionId ? telemetryConfigStore.get(expeditionId) : null;
  const device = powerSetupStore.getPrimary();
  if (!device) return null;

  const batterySocPercent = clampPct(num(device.lastSocPct));
  const batteryCapacityWh = getDeviceCapacityWh(device, config);
  const batteryRemainingWh =
    batterySocPercent != null && batteryCapacityWh != null
      ? Math.round((batterySocPercent / 100) * batteryCapacityWh)
      : num(config?.powerRemainingWh);
  const wattsIn = num(device.lastWattsIn);
  const wattsOut = num(device.lastWattsOut);
  const avgDrawWatts = wattsOut != null && wattsOut >= 0 ? wattsOut : num(config?.powerAvgDrawW);
  const estimatedRuntimeHours =
    batteryRemainingWh != null && avgDrawWatts != null && avgDrawWatts > 0
      ? Math.round((batteryRemainingWh / avgDrawWatts) * 10) / 10
      : null;

  const lastSeenAt = device.lastSeenAt ?? null;
  const isStale =
    !lastSeenAt || Date.now() - new Date(lastSeenAt).getTime() > LIVE_POWER_STALE_MS;

  return {
    deviceId: device.id,
    provider: device.provider,
    connectionMethod: device.connectionMethod,
    connectionState: device.connectionState,
    label: device.customName || device.originalName || device.model || device.provider,
    isPrimary: !!device.isPrimary,
    role: device.role,
    vehicleId: device.vehicleId,
    batterySocPercent,
    batteryCapacityWh,
    batteryRemainingWh,
    avgDrawWatts,
    wattsIn,
    wattsOut,
    estimatedRuntimeHours,
    signalStrength: num(device.signalStrength),
    lastSeenAt,
    isStale,
  };
}

export function getTelemetryContext(expeditionId?: string | null): TelemetryContext {
  const device = powerSetupStore.getPrimary();
  const config = expeditionId ? telemetryConfigStore.get(expeditionId) : null;
  const hasMissionConfig = !!expeditionId || !!config?.fuelCapacityGal || !!config?.waterCapacityL || !!config?.powerCapacityWh;

  return {
    hasPowerDevice: !!device,
    powerDeviceError: device?.connectionState === 'unavailable',
    ecoflowStatus:
      device?.provider === 'EcoFlow'
        ? device.connectionState === 'connected'
          ? 'live'
          : device.connectionState === 'reconnecting'
            ? 'connecting'
            : 'offline'
        : undefined,
    hasMissionConfig,
  };
}

export function getTelemetryAvailability(widgetId: string, expeditionId?: string | null): TelemetryAvailability {
  return evaluateTelemetryState(widgetId, getTelemetryContext(expeditionId));
}

function mergeLivePowerIntoConfig(current: TelemetryConfig, snapshot: LivePowerDeviceSnapshot | null): TelemetryConfig {
  if (!snapshot) return current;

  return {
    ...current,
    powerConfigured:
      current.powerConfigured ||
      snapshot.batteryCapacityWh != null ||
      snapshot.batterySocPercent != null ||
      snapshot.avgDrawWatts != null,
    powerCapacityWh:
      snapshot.batteryCapacityWh != null ? snapshot.batteryCapacityWh : current.powerCapacityWh,
    powerRemainingWh:
      snapshot.batteryRemainingWh != null ? snapshot.batteryRemainingWh : current.powerRemainingWh,
    powerAvgDrawW:
      snapshot.avgDrawWatts != null ? snapshot.avgDrawWatts : current.powerAvgDrawW,
    lastPowerUpdate: snapshot.lastSeenAt ?? current.lastPowerUpdate,
    lastUpdate: snapshot.lastSeenAt ?? current.lastUpdate,
    updatedAt: now(),
  };
}

// ── Default config ───────────────────────────────────────────
function defaultConfig(expeditionId: string): TelemetryConfig {
  return {
    expeditionId,
    fuelCapacityGal: null,
    fuelRemainingGal: null,
    fuelMpg: null,
    waterCapacityL: null,
    waterRemainingL: null,
    waterDailyBurnL: null,
    powerCapacityWh: null,
    powerRemainingWh: null,
    powerAvgDrawW: null,
    powerConfigured: false,
    distanceTraveledMi: 0,
    lastFuelUpdate: null,
    lastWaterUpdate: null,
    lastPowerUpdate: null,
    lastUpdate: null,
    updatedAt: now(),
  };
}

// ============================================================
// TELEMETRY CONFIG STORE
// ============================================================
export const telemetryConfigStore = {
  get: (expeditionId: string): TelemetryConfig => {
    let base = defaultConfig(expeditionId);
    try {
      const raw = sGet(configKey(expeditionId));
      if (raw) {
        const parsed = JSON.parse(raw);
        base = { ...base, ...parsed };
      }
    } catch {
      // fallback to default config
    }

    return mergeLivePowerIntoConfig(base, getManagedPowerSnapshot(expeditionId));
  },

  getPersisted: (expeditionId: string): TelemetryConfig => {
    try {
      const raw = sGet(configKey(expeditionId));
      if (raw) {
        return { ...defaultConfig(expeditionId), ...JSON.parse(raw) };
      }
    } catch {}
    return defaultConfig(expeditionId);
  },

  save: (config: TelemetryConfig): void => {
    const next = { ...config, updatedAt: now() };
    sSet(configKey(next.expeditionId), JSON.stringify(next));
    notifyTelemetryListeners(next.expeditionId);
  },

  update: (expeditionId: string, patch: Partial<TelemetryConfig>): TelemetryConfig => {
    const current = telemetryConfigStore.getPersisted(expeditionId);
    const updated = { ...current, ...patch, updatedAt: now() };
    telemetryConfigStore.save(updated);
    return telemetryConfigStore.get(expeditionId);
  },

  syncManagedPowerDevice: (expeditionId: string): TelemetryConfig => {
    const current = telemetryConfigStore.getPersisted(expeditionId);
    const merged = mergeLivePowerIntoConfig(current, getManagedPowerSnapshot(expeditionId));
    telemetryConfigStore.save(merged);
    return telemetryConfigStore.get(expeditionId);
  },

  // ── Initialize from snapshot data ──────────────────────────
  initFromSnapshot: (expeditionId: string, snapshot: {
    fuelCapacityGal?: number;
    fuelMpg?: number;
    waterCapacityL?: number;
    waterDailyBurnL?: number;
    peopleCount?: number;
    tripLengthDays?: number;
  }): TelemetryConfig => {
    const config = defaultConfig(expeditionId);

    if (snapshot.fuelCapacityGal) {
      config.fuelCapacityGal = snapshot.fuelCapacityGal;
      config.fuelRemainingGal = snapshot.fuelCapacityGal;
      config.fuelMpg = snapshot.fuelMpg || 16;
    }

    const people = snapshot.peopleCount || 2;
    const dailyBurn = snapshot.waterDailyBurnL || people * 3.5;
    config.waterDailyBurnL = dailyBurn;
    if (snapshot.waterCapacityL) {
      config.waterCapacityL = snapshot.waterCapacityL;
      config.waterRemainingL = snapshot.waterCapacityL;
    }

    config.lastUpdate = now();
    telemetryConfigStore.save(config);
    console.log(TAG, `Initialized telemetry for ${expeditionId}`);
    return telemetryConfigStore.get(expeditionId);
  },

  logFuel: (expeditionId: string, gallons: number, mode: 'added' | 'used'): TelemetryConfig => {
    const config = telemetryConfigStore.getPersisted(expeditionId);
    const currentFuel = config.fuelRemainingGal || 0;

    config.fuelRemainingGal =
      mode === 'added'
        ? Math.min(currentFuel + gallons, config.fuelCapacityGal || currentFuel + gallons)
        : Math.max(0, currentFuel - gallons);

    config.lastFuelUpdate = now();
    config.lastUpdate = now();

    missionEventStore.append(expeditionId, 'FUEL_LOGGED' as ExpeditionEventType, {
      gallons,
      mode,
      remainingGal: config.fuelRemainingGal,
    });

    telemetryConfigStore.save(config);
    return telemetryConfigStore.get(expeditionId);
  },

  logWater: (expeditionId: string, liters: number): TelemetryConfig => {
    const config = telemetryConfigStore.getPersisted(expeditionId);
    const currentWater = config.waterRemainingL || 0;
    config.waterRemainingL = Math.max(0, currentWater - liters);
    config.lastWaterUpdate = now();
    config.lastUpdate = now();

    missionEventStore.append(expeditionId, 'WATER_USED', {
      liters,
      remainingL: config.waterRemainingL,
    });

    telemetryConfigStore.save(config);
    return telemetryConfigStore.get(expeditionId);
  },

  configurePower: (expeditionId: string, capacityWh: number, avgDrawW: number): TelemetryConfig => {
    const config = telemetryConfigStore.getPersisted(expeditionId);
    config.powerCapacityWh = capacityWh;
    config.powerRemainingWh = capacityWh;
    config.powerAvgDrawW = avgDrawW;
    config.powerConfigured = true;
    config.lastPowerUpdate = now();
    config.lastUpdate = now();

    missionEventStore.append(expeditionId, 'POWER_CONFIGURED' as ExpeditionEventType, {
      capacityWh,
      avgDrawW,
    });

    telemetryConfigStore.save(config);
    return telemetryConfigStore.get(expeditionId);
  },

  logPower: (expeditionId: string, whUsed?: number, percentUsed?: number): TelemetryConfig => {
    const config = telemetryConfigStore.getPersisted(expeditionId);
    if (!config.powerConfigured && !config.powerCapacityWh) return telemetryConfigStore.get(expeditionId);

    if (typeof whUsed === 'number') {
      config.powerRemainingWh = Math.max(0, (config.powerRemainingWh || 0) - whUsed);
    } else if (typeof percentUsed === 'number' && config.powerCapacityWh) {
      const whAmount = (percentUsed / 100) * config.powerCapacityWh;
      config.powerRemainingWh = Math.max(0, (config.powerRemainingWh || 0) - whAmount);
    }

    config.lastPowerUpdate = now();
    config.lastUpdate = now();

    missionEventStore.append(expeditionId, 'POWER_UPDATED' as ExpeditionEventType, {
      whUsed,
      percentUsed,
      remainingWh: config.powerRemainingWh,
    });

    telemetryConfigStore.save(config);
    return telemetryConfigStore.get(expeditionId);
  },

  applyLivePowerSnapshot: (
    expeditionId: string,
    payload: {
      socPct?: number | null;
      wattsIn?: number | null;
      wattsOut?: number | null;
      capacityWh?: number | null;
      deviceId?: string | null;
      connected?: boolean;
      observedAt?: string | null;
    }
  ): TelemetryConfig => {
    const config = telemetryConfigStore.getPersisted(expeditionId);
    const observedAt = payload.observedAt || now();
    const capacityWh = num(payload.capacityWh) ?? num(config.powerCapacityWh);
    const socPct = clampPct(num(payload.socPct));
    const wattsOut = num(payload.wattsOut);

    config.powerConfigured = !!capacityWh || socPct != null || wattsOut != null || config.powerConfigured;
    if (capacityWh != null) config.powerCapacityWh = capacityWh;
    if (socPct != null && capacityWh != null) {
      config.powerRemainingWh = Math.round((socPct / 100) * capacityWh);
    }
    if (wattsOut != null) config.powerAvgDrawW = wattsOut;
    config.lastPowerUpdate = observedAt;
    config.lastUpdate = observedAt;

    telemetryConfigStore.save(config);
    return telemetryConfigStore.get(expeditionId);
  },

  logDistance: (expeditionId: string, miles: number): TelemetryConfig => {
    const config = telemetryConfigStore.getPersisted(expeditionId);
    config.distanceTraveledMi += miles;

    if (config.fuelMpg && config.fuelRemainingGal !== null) {
      const fuelUsed = miles / config.fuelMpg;
      config.fuelRemainingGal = Math.max(0, config.fuelRemainingGal - fuelUsed);
    }

    config.lastUpdate = now();
    telemetryConfigStore.save(config);
    return telemetryConfigStore.get(expeditionId);
  },

  updateMpg: (expeditionId: string, mpg: number): TelemetryConfig => {
    return telemetryConfigStore.update(expeditionId, { fuelMpg: mpg });
  },

  setupFuel: (expeditionId: string, capacityGal: number, currentGal: number, mpg: number): TelemetryConfig => {
    return telemetryConfigStore.update(expeditionId, {
      fuelCapacityGal: capacityGal,
      fuelRemainingGal: currentGal,
      fuelMpg: mpg,
      lastFuelUpdate: now(),
      lastUpdate: now(),
    });
  },

  setupWater: (expeditionId: string, capacityL: number, currentL: number, dailyBurnL: number): TelemetryConfig => {
    return telemetryConfigStore.update(expeditionId, {
      waterCapacityL: capacityL,
      waterRemainingL: currentL,
      waterDailyBurnL: dailyBurnL,
      lastWaterUpdate: now(),
      lastUpdate: now(),
    });
  },
};

function deriveTelemetryState(config: TelemetryConfig, criticals: string[], fuelConfigured: boolean, waterConfigured: boolean): TelemetryState {
  if (criticals.length > 0) return 'ATTENTION';
  if (!fuelConfigured || !waterConfigured || !config.powerConfigured) return 'PARTIAL';
  return 'LIVE';
}

export function computeTelemetryReadout(expeditionId: string): TelemetryReadout {
  const config = telemetryConfigStore.get(expeditionId);
  const expedition = missionExpeditionStore.getById(expeditionId);
  const livePower = getManagedPowerSnapshot(expeditionId);

  const fuelConfigured = config.fuelCapacityGal !== null && config.fuelRemainingGal !== null;
  let fuelRangeMi: number | null = null;
  let fuelSafeRangeMi: number | null = null;
  let fuelPercent: number | null = null;

  if (fuelConfigured && config.fuelMpg) {
    fuelRangeMi = Math.round((config.fuelRemainingGal || 0) * config.fuelMpg);
    fuelSafeRangeMi = Math.round(fuelRangeMi * 0.75);
    fuelPercent = config.fuelCapacityGal
      ? Math.round(((config.fuelRemainingGal || 0) / config.fuelCapacityGal) * 100)
      : null;
  }

  const waterConfigured = config.waterCapacityL !== null && config.waterRemainingL !== null;
  let waterAutonomyDays: number | null = null;
  if (waterConfigured && config.waterDailyBurnL && config.waterDailyBurnL > 0) {
    waterAutonomyDays = Math.round(((config.waterRemainingL || 0) / config.waterDailyBurnL) * 10) / 10;
  }

  let powerPercent: number | null = null;
  let powerEstHours: number | null = null;
  const effectiveCapacityWh = num(config.powerCapacityWh);
  const effectiveRemainingWh = num(config.powerRemainingWh);
  const effectiveDrawW = num(config.powerAvgDrawW);

  if (config.powerConfigured && effectiveCapacityWh) {
    powerPercent = Math.round(((effectiveRemainingWh || 0) / effectiveCapacityWh) * 100);
    if (effectiveDrawW && effectiveDrawW > 0) {
      powerEstHours = Math.round(((effectiveRemainingWh || 0) / effectiveDrawW) * 10) / 10;
    }
  }

  const buffers: { system: 'fuel' | 'water' | 'power'; percent: number }[] = [];
  if (fuelConfigured && fuelPercent !== null) buffers.push({ system: 'fuel', percent: fuelPercent });
  if (waterConfigured && config.waterCapacityL) {
    const waterPct = Math.round(((config.waterRemainingL || 0) / config.waterCapacityL) * 100);
    buffers.push({ system: 'water', percent: waterPct });
  }
  if (config.powerConfigured && powerPercent !== null) buffers.push({ system: 'power', percent: powerPercent });

  let bufferPercent = 100;
  let bufferLimiter: 'fuel' | 'water' | 'power' | 'none' = 'none';
  if (buffers.length > 0) {
    const minBuffer = buffers.reduce((min, b) => (b.percent < min.percent ? b : min), buffers[0]);
    bufferPercent = minBuffer.percent;
    bufferLimiter = minBuffer.system;
  }

  let bufferLevel: BufferLevel = 'HIGH';
  if (bufferPercent < 25) bufferLevel = 'LOW';
  else if (bufferPercent < 50) bufferLevel = 'MED';

  const criticals: string[] = [];
  if (fuelConfigured && fuelPercent !== null && fuelPercent < 15) {
    criticals.push(`CRITICAL: Fuel below ${fuelPercent}%`);
  }
  if (waterConfigured && waterAutonomyDays !== null && waterAutonomyDays < 1) {
    criticals.push(`CRITICAL: Water reserve below 1 day (${waterAutonomyDays.toFixed(1)}d)`);
  }
  if (config.powerConfigured && powerPercent !== null && powerPercent < 15) {
    criticals.push(`CRITICAL: Power below ${powerPercent}%`);
  }
  if (livePower?.connectionState === 'unavailable') {
    criticals.push('CRITICAL: Power telemetry source unavailable');
  }

  const state = deriveTelemetryState(config, criticals, fuelConfigured, waterConfigured);

  let durationStr = '0h 0m';
  if ((expedition as any)?.startedAt) {
    const start = new Date((expedition as any).startedAt).getTime();
    const end = (expedition as any).endedAt ? new Date((expedition as any).endedAt).getTime() : Date.now();
    const totalMin = Math.floor((end - start) / (1000 * 60));
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    durationStr = `${hours}h ${mins}m`;
  }

  return {
    state,
    fuelRangeMi,
    fuelSafeRangeMi,
    fuelRemainingGal: config.fuelRemainingGal,
    fuelPercent,
    fuelConfigured,
    waterAutonomyDays,
    waterRemainingL: config.waterRemainingL,
    waterDailyBurnL: config.waterDailyBurnL,
    waterConfigured,
    powerPercent,
    powerRemainingWh: config.powerRemainingWh,
    powerEstHours,
    powerAvgDrawW: config.powerAvgDrawW,
    powerConfigured: config.powerConfigured,
    bufferLevel,
    bufferPercent,
    bufferLimiter,
    distanceMi: config.distanceTraveledMi,
    durationStr,
    lastUpdateStr: minutesAgoLabel(config.lastUpdate),
    criticals,
  };
}

export function getTelemetryConnectionSummary(expeditionId: string | null | undefined) {
  const snapshot = getManagedPowerSnapshot(expeditionId);
  const availability = getTelemetryAvailability('ecoflow-power', expeditionId);
  return {
    availability,
    snapshot,
    hasConnectedDevice: !!snapshot && snapshot.connectionState === 'connected',
    isStale: snapshot?.isStale ?? false,
    provider: snapshot?.provider ?? null,
    label: snapshot?.label ?? null,
  };
}

export function syncManagedPowerDevicesToTelemetry(expeditionId: string | null | undefined): TelemetryConfig | null {
  if (!expeditionId) return null;
  return telemetryConfigStore.syncManagedPowerDevice(expeditionId);
}

// Keep telemetry store reactive to managed power device changes.
powerSetupStore.subscribe(() => {
  const activeExpedition = missionExpeditionStore.getActive?.() || null;
  const expeditionId = activeExpedition?.id ?? null;
  if (!expeditionId) return;
  telemetryConfigStore.syncManagedPowerDevice(expeditionId);
});
