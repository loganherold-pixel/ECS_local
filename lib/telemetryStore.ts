// ============================================================
// ECS TELEMETRY STORE — Vehicle Systems Mission Telemetry
// ============================================================
// Offline-first persistence for fuel, water, power telemetry.
// Computes readout state from config + event logs.
// ============================================================

import { Platform } from 'react-native';
import type {
  TelemetryConfig,
  TelemetryReadout,
  TelemetryState,
  BufferLevel,
  MissionExpedition,
  ExpeditionEventType,
} from './missionTypes';
import { missionEventStore, missionExpeditionStore } from './missionStore';

const TAG = '[TELEMETRY]';

// ── Storage helpers (same pattern as missionStore) ───────────
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

const now = () => new Date().toISOString();

const TELEMETRY_KEY_PREFIX = 'ecs_telemetry_';

function configKey(expeditionId: string): string {
  return `${TELEMETRY_KEY_PREFIX}${expeditionId}`;
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
    try {
      const raw = sGet(configKey(expeditionId));
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...defaultConfig(expeditionId), ...parsed };
      }
    } catch { /* fallback */ }
    return defaultConfig(expeditionId);
  },

  save: (config: TelemetryConfig): void => {
    config.updatedAt = now();
    sSet(configKey(config.expeditionId), JSON.stringify(config));
  },

  update: (expeditionId: string, patch: Partial<TelemetryConfig>): TelemetryConfig => {
    const current = telemetryConfigStore.get(expeditionId);
    const updated = { ...current, ...patch, updatedAt: now() };
    telemetryConfigStore.save(updated);
    return updated;
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

    // Fuel defaults
    if (snapshot.fuelCapacityGal) {
      config.fuelCapacityGal = snapshot.fuelCapacityGal;
      config.fuelRemainingGal = snapshot.fuelCapacityGal; // assume full tank at launch
      config.fuelMpg = snapshot.fuelMpg || 16; // default MPG
    }

    // Water defaults
    const people = snapshot.peopleCount || 2;
    const dailyBurn = snapshot.waterDailyBurnL || (people * 3.5); // 3.5L/person/day
    config.waterDailyBurnL = dailyBurn;
    if (snapshot.waterCapacityL) {
      config.waterCapacityL = snapshot.waterCapacityL;
      config.waterRemainingL = snapshot.waterCapacityL; // assume full at launch
    }

    config.lastUpdate = now();
    telemetryConfigStore.save(config);
    console.log(TAG, `Initialized telemetry for ${expeditionId}`);
    return config;
  },

  // ── Fuel operations ────────────────────────────────────────
  logFuel: (expeditionId: string, gallons: number, mode: 'added' | 'used'): TelemetryConfig => {
    const config = telemetryConfigStore.get(expeditionId);
    const currentFuel = config.fuelRemainingGal || 0;

    if (mode === 'added') {
      config.fuelRemainingGal = Math.min(
        currentFuel + gallons,
        config.fuelCapacityGal || currentFuel + gallons
      );
    } else {
      config.fuelRemainingGal = Math.max(0, currentFuel - gallons);
    }
    config.lastFuelUpdate = now();
    config.lastUpdate = now();

    // Log event
    missionEventStore.append(expeditionId, 'FUEL_LOGGED' as ExpeditionEventType, {
      gallons,
      mode,
      remainingGal: config.fuelRemainingGal,
    });

    telemetryConfigStore.save(config);
    return config;
  },

  // ── Water operations ───────────────────────────────────────
  logWater: (expeditionId: string, liters: number): TelemetryConfig => {
    const config = telemetryConfigStore.get(expeditionId);
    const currentWater = config.waterRemainingL || 0;
    config.waterRemainingL = Math.max(0, currentWater - liters);
    config.lastWaterUpdate = now();
    config.lastUpdate = now();

    // Also log as event for timeline
    missionEventStore.append(expeditionId, 'WATER_USED', {
      liters,
      remainingL: config.waterRemainingL,
    });

    telemetryConfigStore.save(config);
    return config;
  },

  // ── Power operations ───────────────────────────────────────
  configurePower: (expeditionId: string, capacityWh: number, avgDrawW: number): TelemetryConfig => {
    const config = telemetryConfigStore.get(expeditionId);
    config.powerCapacityWh = capacityWh;
    config.powerRemainingWh = capacityWh; // assume full
    config.powerAvgDrawW = avgDrawW;
    config.powerConfigured = true;
    config.lastPowerUpdate = now();
    config.lastUpdate = now();

    missionEventStore.append(expeditionId, 'POWER_CONFIGURED' as ExpeditionEventType, {
      capacityWh,
      avgDrawW,
    });

    telemetryConfigStore.save(config);
    return config;
  },

  logPower: (expeditionId: string, whUsed?: number, percentUsed?: number): TelemetryConfig => {
    const config = telemetryConfigStore.get(expeditionId);
    if (!config.powerConfigured) return config;

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
    return config;
  },

  // ── Distance logging ───────────────────────────────────────
  logDistance: (expeditionId: string, miles: number): TelemetryConfig => {
    const config = telemetryConfigStore.get(expeditionId);
    config.distanceTraveledMi += miles;

    // Auto-deduct fuel based on MPG if configured
    if (config.fuelMpg && config.fuelRemainingGal !== null) {
      const fuelUsed = miles / config.fuelMpg;
      config.fuelRemainingGal = Math.max(0, config.fuelRemainingGal - fuelUsed);
    }

    config.lastUpdate = now();
    telemetryConfigStore.save(config);
    return config;
  },

  // ── Update MPG ─────────────────────────────────────────────
  updateMpg: (expeditionId: string, mpg: number): TelemetryConfig => {
    return telemetryConfigStore.update(expeditionId, { fuelMpg: mpg });
  },

  // ── Setup fuel (initial config) ────────────────────────────
  setupFuel: (expeditionId: string, capacityGal: number, currentGal: number, mpg: number): TelemetryConfig => {
    return telemetryConfigStore.update(expeditionId, {
      fuelCapacityGal: capacityGal,
      fuelRemainingGal: currentGal,
      fuelMpg: mpg,
      lastFuelUpdate: now(),
      lastUpdate: now(),
    });
  },

  // ── Setup water ────────────────────────────────────────────
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

// ============================================================
// COMPUTE TELEMETRY READOUT
// ============================================================
export function computeTelemetryReadout(expeditionId: string): TelemetryReadout {
  const config = telemetryConfigStore.get(expeditionId);
  const expedition = missionExpeditionStore.getById(expeditionId);

  // ── Fuel calculations ──────────────────────────────────────
  const fuelConfigured = config.fuelCapacityGal !== null && config.fuelRemainingGal !== null;
  let fuelRangeMi: number | null = null;
  let fuelSafeRangeMi: number | null = null;
  let fuelPercent: number | null = null;

  if (fuelConfigured && config.fuelMpg) {
    fuelRangeMi = Math.round((config.fuelRemainingGal || 0) * config.fuelMpg);
    fuelSafeRangeMi = Math.round(fuelRangeMi * 0.75); // 75% safe range
    fuelPercent = config.fuelCapacityGal
      ? Math.round(((config.fuelRemainingGal || 0) / config.fuelCapacityGal) * 100)
      : null;
  }

  // ── Water calculations ─────────────────────────────────────
  const waterConfigured = config.waterCapacityL !== null && config.waterRemainingL !== null;
  let waterAutonomyDays: number | null = null;

  if (waterConfigured && config.waterDailyBurnL && config.waterDailyBurnL > 0) {
    waterAutonomyDays = Math.round(((config.waterRemainingL || 0) / config.waterDailyBurnL) * 10) / 10;
  }

  // ── Power calculations ─────────────────────────────────────
  let powerPercent: number | null = null;
  let powerEstHours: number | null = null;

  if (config.powerConfigured && config.powerCapacityWh) {
    powerPercent = Math.round(((config.powerRemainingWh || 0) / config.powerCapacityWh) * 100);
    if (config.powerAvgDrawW && config.powerAvgDrawW > 0) {
      powerEstHours = Math.round(((config.powerRemainingWh || 0) / config.powerAvgDrawW) * 10) / 10;
    }
  }

  // ── Buffer calculation ─────────────────────────────────────
  const buffers: { system: 'fuel' | 'water' | 'power'; percent: number }[] = [];

  if (fuelConfigured && fuelPercent !== null) {
    buffers.push({ system: 'fuel', percent: fuelPercent });
  }
  if (waterConfigured && config.waterCapacityL) {
    const waterPct = Math.round(((config.waterRemainingL || 0) / config.waterCapacityL) * 100);
    buffers.push({ system: 'water', percent: waterPct });
  }
  if (config.powerConfigured && powerPercent !== null) {
    buffers.push({ system: 'power', percent: powerPercent });
  }

  let bufferPercent = 100;
  let bufferLimiter: 'fuel' | 'water' | 'power' | 'none' = 'none';

  if (buffers.length > 0) {
    const minBuffer = buffers.reduce((min, b) => b.percent < min.percent ? b : min, buffers[0]);
    bufferPercent = minBuffer.percent;
    bufferLimiter = minBuffer.system;
  }

  let bufferLevel: BufferLevel = 'HIGH';
  if (bufferPercent < 25) bufferLevel = 'LOW';
  else if (bufferPercent < 50) bufferLevel = 'MED';

  // ── Telemetry state ────────────────────────────────────────
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

  let state: TelemetryState = 'LIVE';
  if (criticals.length > 0) {
    state = 'ATTENTION';
  } else if (!fuelConfigured || !waterConfigured) {
    state = 'PARTIAL';
  }

  // ── Duration ───────────────────────────────────────────────
  let durationStr = '0h 0m';
  if (expedition?.startedAt) {
    const start = new Date(expedition.startedAt).getTime();
    const end = expedition.endedAt ? new Date(expedition.endedAt).getTime() : Date.now();
    const totalMin = Math.floor((end - start) / (1000 * 60));
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    durationStr = `${hours}h ${mins}m`;
  }

  // ── Last update ────────────────────────────────────────────
  let lastUpdateStr = 'manual';
  if (config.lastUpdate) {
    const diff = Date.now() - new Date(config.lastUpdate).getTime();
    const mins = Math.floor(diff / (1000 * 60));
    if (mins < 1) lastUpdateStr = 'just now';
    else if (mins < 60) lastUpdateStr = `${mins}m ago`;
    else if (mins < 1440) lastUpdateStr = `${Math.floor(mins / 60)}h ago`;
    else lastUpdateStr = `${Math.floor(mins / 1440)}d ago`;
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
    lastUpdateStr,
    criticals,
  };
}

