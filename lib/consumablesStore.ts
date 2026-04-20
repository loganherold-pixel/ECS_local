/**
 * ECS Consumables Store - Fuel % + Water Gallons
 *
 * Single source of truth for dynamic consumable weight contributors.
 * Persists fuel_percent_current and water_gal_current per vehicle.
 * Notifies listeners on change so dashboard/widgets update immediately.
 *
 * DENSITY DEFAULTS:
 *   diesel: 7.1 lb/gal
 *   gas:    6.0 lb/gal
 *   water:  8.34 lb/gal
 */
import { Platform } from 'react-native';
import { vehicleSpecStore, type FuelType } from './vehicleSpecStore';
import { createPersistedKeyValueCache } from './keyValuePersistence';

const memoryStore: Record<string, string> = {};
const consumablesPersistence = createPersistedKeyValueCache('ecs_consumables_store');

function lsGet(key: string): string | null {
  if (Platform.OS !== 'web') {
    return consumablesPersistence.get(key);
  }
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

function lsSet(key: string, value: string): void {
  if (Platform.OS !== 'web') {
    consumablesPersistence.set(key, value);
    return;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
  memoryStore[key] = value;
}

export const FUEL_DENSITY_LB_PER_GAL: Record<FuelType, number> = {
  diesel: 7.1,
  gas: 6.0,
};

export const WATER_DENSITY_LB_PER_GAL = 8.34;

export type ConsumableInputSource = 'manual' | 'sensor';

export interface ConsumablesState {
  fuel_percent_current: number;
  fuel_source?: ConsumableInputSource;
  water_gal_current: number;
  water_source?: ConsumableInputSource;
  water_updated_at?: number | null;
  alternate_fluid_label?: string | null;
  alternate_fluid_unit?: string | null;
  alternate_fluid_current?: number | null;
  alternate_fluid_capacity?: number | null;
  alternate_fluid_source?: ConsumableInputSource;
  alternate_fluid_updated_at?: number | null;
}

const LS_KEY = 'ecs_consumables';

function getAllConsumables(): Record<string, ConsumablesState> {
  const raw = lsGet(LS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveAllConsumables(data: Record<string, ConsumablesState>): void {
  lsSet(LS_KEY, JSON.stringify(data));
}

type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

function getDefaultConsumablesState(): ConsumablesState {
  return {
    fuel_percent_current: 100,
    fuel_source: 'manual',
    water_gal_current: 0,
    water_source: 'manual',
    water_updated_at: null,
    alternate_fluid_label: null,
    alternate_fluid_unit: null,
    alternate_fluid_current: null,
    alternate_fluid_capacity: null,
    alternate_fluid_source: 'manual',
    alternate_fluid_updated_at: null,
  };
}

function sanitizeConsumablesState(state: Partial<ConsumablesState> | null | undefined): ConsumablesState {
  return {
    fuel_percent_current: clampFuel(state?.fuel_percent_current ?? 100),
    fuel_source: state?.fuel_source === 'sensor' ? 'sensor' : 'manual',
    water_gal_current: clampWater(state?.water_gal_current ?? 0),
    water_source: state?.water_source === 'sensor' ? 'sensor' : 'manual',
    water_updated_at: typeof state?.water_updated_at === 'number' ? state.water_updated_at : null,
    alternate_fluid_label: sanitizeOptionalText(state?.alternate_fluid_label),
    alternate_fluid_unit: sanitizeOptionalText(state?.alternate_fluid_unit),
    alternate_fluid_current: clampOptionalQuantity(state?.alternate_fluid_current),
    alternate_fluid_capacity: clampOptionalQuantity(state?.alternate_fluid_capacity),
    alternate_fluid_source: state?.alternate_fluid_source === 'sensor' ? 'sensor' : 'manual',
    alternate_fluid_updated_at:
      typeof state?.alternate_fluid_updated_at === 'number' ? state.alternate_fluid_updated_at : null,
  };
}

export const consumablesStore = {
  get: (vehicleId: string): ConsumablesState => {
    const all = getAllConsumables();
    return sanitizeConsumablesState(all[vehicleId] ?? getDefaultConsumablesState());
  },

  set: (vehicleId: string, state: ConsumablesState): void => {
    const all = getAllConsumables();
    all[vehicleId] = {
      ...sanitizeConsumablesState(state),
      fuel_source: state.fuel_source === 'sensor' ? 'sensor' : 'manual',
      water_updated_at:
        typeof state.water_updated_at === 'number' ? state.water_updated_at : Date.now(),
      alternate_fluid_updated_at:
        typeof state.alternate_fluid_updated_at === 'number'
          ? state.alternate_fluid_updated_at
          : state.alternate_fluid_current != null
            ? Date.now()
            : null,
    };
    saveAllConsumables(all);
    notifyListeners();
  },

  setFuelPercent: (
    vehicleId: string,
    fuelPercent: number,
    source: ConsumableInputSource = 'manual',
  ): void => {
    const all = getAllConsumables();
    const existing = sanitizeConsumablesState(all[vehicleId] ?? getDefaultConsumablesState());
    all[vehicleId] = {
      ...existing,
      fuel_percent_current: clampFuel(fuelPercent),
      fuel_source: source,
    };
    saveAllConsumables(all);
    notifyListeners();
  },

  setWaterGal: (
    vehicleId: string,
    waterGal: number,
    source: ConsumableInputSource = 'manual',
  ): void => {
    const all = getAllConsumables();
    const existing = sanitizeConsumablesState(all[vehicleId] ?? getDefaultConsumablesState());
    all[vehicleId] = {
      ...existing,
      water_gal_current: clampWater(waterGal),
      water_source: source,
      water_updated_at: Date.now(),
    };
    saveAllConsumables(all);
    notifyListeners();
  },

  setAlternateFluid: (
    vehicleId: string,
    payload: {
      current?: number | null;
      capacity?: number | null;
      label?: string | null;
      unit?: string | null;
      source?: ConsumableInputSource;
    },
  ): void => {
    const all = getAllConsumables();
    const existing = sanitizeConsumablesState(all[vehicleId] ?? getDefaultConsumablesState());
    const nextCurrent = payload.current === undefined
      ? existing.alternate_fluid_current ?? null
      : clampOptionalQuantity(payload.current);
    const nextCapacity = payload.capacity === undefined
      ? existing.alternate_fluid_capacity ?? null
      : clampOptionalQuantity(payload.capacity);
    all[vehicleId] = {
      ...existing,
      alternate_fluid_current: nextCurrent,
      alternate_fluid_capacity: nextCapacity,
      alternate_fluid_label:
        payload.label === undefined ? existing.alternate_fluid_label ?? null : sanitizeOptionalText(payload.label),
      alternate_fluid_unit:
        payload.unit === undefined ? existing.alternate_fluid_unit ?? null : sanitizeOptionalText(payload.unit),
      alternate_fluid_source: payload.source === 'sensor' ? 'sensor' : 'manual',
      alternate_fluid_updated_at: nextCurrent != null ? Date.now() : null,
    };
    saveAllConsumables(all);
    notifyListeners();
  },

  computeFuelWeightLb: (vehicleId: string): number => {
    const state = consumablesStore.get(vehicleId);
    const spec = vehicleSpecStore.get(vehicleId);
    if (!spec || !spec.fuel_tank_capacity_gal) return 0;
    const fuelType = spec.fuel_type || 'diesel';
    const fuelGalCurrent = spec.fuel_tank_capacity_gal * (state.fuel_percent_current / 100);
    return fuelGalCurrent * FUEL_DENSITY_LB_PER_GAL[fuelType];
  },

  computeWaterWeightLb: (vehicleId: string): number => {
    const state = consumablesStore.get(vehicleId);
    return state.water_gal_current * WATER_DENSITY_LB_PER_GAL;
  },

  computeConsumablesWeightLb: (vehicleId: string): number => {
    return consumablesStore.computeFuelWeightLb(vehicleId)
      + consumablesStore.computeWaterWeightLb(vehicleId);
  },

  hasFuelTankCapacity: (vehicleId: string): boolean => {
    const spec = vehicleSpecStore.get(vehicleId);
    return !!(spec && spec.fuel_tank_capacity_gal > 0);
  },

  getFirst: (): { vehicleId: string; state: ConsumablesState } | null => {
    const all = getAllConsumables();
    const entries = Object.entries(all);
    if (entries.length === 0) {
      const specEntry = vehicleSpecStore.getFirst();
      if (specEntry) {
        return {
          vehicleId: specEntry.vehicleId,
          state: getDefaultConsumablesState(),
        };
      }
      return null;
    }
    const [vehicleId, raw] = entries[0];
    return {
      vehicleId,
      state: sanitizeConsumablesState(raw),
    };
  },

  subscribe: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },

  remove: (vehicleId: string): void => {
    const all = getAllConsumables();
    if (vehicleId in all) {
      delete all[vehicleId];
      saveAllConsumables(all);
      notifyListeners();
    }
  },

  waitForHydration: (): Promise<void> => consumablesPersistence.waitForHydration(),

  flush: (): Promise<void> => consumablesPersistence.flush(),
};

function clampFuel(v: number): number {
  if (typeof v !== 'number' || isNaN(v)) return 100;
  return Math.max(0, Math.min(100, v));
}

function clampWater(v: number): number {
  if (typeof v !== 'number' || isNaN(v)) return 0;
  return Math.max(0, v);
}

function clampOptionalQuantity(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v !== 'number' || isNaN(v)) return null;
  return Math.max(0, v);
}

function sanitizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
