/**
 * ECS Consumables Store — Fuel % + Water Gallons
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

// ── Storage helpers ─────────────────────────────────────
const memoryStore: Record<string, string> = {};

function lsGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

function lsSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
  memoryStore[key] = value;
}

// ── Density constants ───────────────────────────────────
export const FUEL_DENSITY_LB_PER_GAL: Record<FuelType, number> = {
  diesel: 7.1,
  gas: 6.0,
};

export const WATER_DENSITY_LB_PER_GAL = 8.34;

// ── Types ───────────────────────────────────────────────
export interface ConsumablesState {
  /** Fuel level as percentage 0–100 */
  fuel_percent_current: number;
  /** Water on board in gallons (>= 0) */
  water_gal_current: number;
}

// ── Persistence ─────────────────────────────────────────
const LS_KEY = 'ecs_consumables';

function getAllConsumables(): Record<string, ConsumablesState> {
  const raw = lsGet(LS_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

function saveAllConsumables(data: Record<string, ConsumablesState>): void {
  lsSet(LS_KEY, JSON.stringify(data));
}

// ── Change listeners ────────────────────────────────────
type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notifyListeners() {
  listeners.forEach(fn => { try { fn(); } catch {} });
}

// ── Public API ──────────────────────────────────────────
export const consumablesStore = {
  /**
   * Get consumables state for a vehicle. Returns defaults if not set.
   */
  get: (vehicleId: string): ConsumablesState => {
    const all = getAllConsumables();
    const raw = all[vehicleId];
    if (!raw) return { fuel_percent_current: 100, water_gal_current: 0 };
    return {
      fuel_percent_current: clampFuel(raw.fuel_percent_current ?? 100),
      water_gal_current: clampWater(raw.water_gal_current ?? 0),
    };
  },

  /**
   * Set full consumables state for a vehicle.
   */
  set: (vehicleId: string, state: ConsumablesState): void => {
    const all = getAllConsumables();
    all[vehicleId] = {
      fuel_percent_current: clampFuel(state.fuel_percent_current),
      water_gal_current: clampWater(state.water_gal_current),
    };
    saveAllConsumables(all);
    notifyListeners();
  },

  /**
   * Update fuel percent for a vehicle. Persists immediately.
   */
  setFuelPercent: (vehicleId: string, fuelPercent: number): void => {
    const all = getAllConsumables();
    const existing = all[vehicleId] || { fuel_percent_current: 100, water_gal_current: 0 };
    all[vehicleId] = {
      ...existing,
      fuel_percent_current: clampFuel(fuelPercent),
    };
    saveAllConsumables(all);
    notifyListeners();
  },

  /**
   * Update water gallons for a vehicle. Persists immediately.
   */
  setWaterGal: (vehicleId: string, waterGal: number): void => {
    const all = getAllConsumables();
    const existing = all[vehicleId] || { fuel_percent_current: 100, water_gal_current: 0 };
    all[vehicleId] = {
      ...existing,
      water_gal_current: clampWater(waterGal),
    };
    saveAllConsumables(all);
    notifyListeners();
  },

  /**
   * Compute fuel weight in lbs from current fuel percent.
   * Returns 0 if fuel_tank_capacity_gal is not configured.
   */
  computeFuelWeightLb: (vehicleId: string): number => {
    const state = consumablesStore.get(vehicleId);
    const spec = vehicleSpecStore.get(vehicleId);
    if (!spec || !spec.fuel_tank_capacity_gal) return 0;
    const fuelType = spec.fuel_type || 'diesel';
    const fuelGalCurrent = spec.fuel_tank_capacity_gal * (state.fuel_percent_current / 100);
    return fuelGalCurrent * FUEL_DENSITY_LB_PER_GAL[fuelType];
  },

  /**
   * Compute water weight in lbs from current water gallons.
   */
  computeWaterWeightLb: (vehicleId: string): number => {
    const state = consumablesStore.get(vehicleId);
    return state.water_gal_current * WATER_DENSITY_LB_PER_GAL;
  },

  /**
   * Compute total consumables weight (fuel + water).
   */
  computeConsumablesWeightLb: (vehicleId: string): number => {
    return consumablesStore.computeFuelWeightLb(vehicleId)
         + consumablesStore.computeWaterWeightLb(vehicleId);
  },

  /**
   * Check if fuel tank capacity is configured (needed for fuel weight).
   */
  hasFuelTankCapacity: (vehicleId: string): boolean => {
    const spec = vehicleSpecStore.get(vehicleId);
    return !!(spec && spec.fuel_tank_capacity_gal > 0);
  },

  /**
   * Get the first stored consumables state (for dashboard when vehicleId unknown).
   */
  getFirst: (): { vehicleId: string; state: ConsumablesState } | null => {
    const all = getAllConsumables();
    const entries = Object.entries(all);
    if (entries.length === 0) {
      // Fall back to first vehicle spec entry
      const specEntry = vehicleSpecStore.getFirst();
      if (specEntry) {
        return {
          vehicleId: specEntry.vehicleId,
          state: { fuel_percent_current: 100, water_gal_current: 0 },
        };
      }
      return null;
    }
    const [vehicleId, raw] = entries[0];
    return {
      vehicleId,
      state: {
        fuel_percent_current: clampFuel(raw.fuel_percent_current ?? 100),
        water_gal_current: clampWater(raw.water_gal_current ?? 0),
      },
    };
  },


  /**
   * Subscribe to consumables changes.
   */
  subscribe: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  /**
   * Remove consumables state for a vehicle.
   * Called during vehicle deletion to clean up orphaned data.
   */
  remove: (vehicleId: string): void => {
    const all = getAllConsumables();
    if (vehicleId in all) {
      delete all[vehicleId];
      saveAllConsumables(all);
      notifyListeners();
    }
  },
};


// ── Clamping helpers ────────────────────────────────────
function clampFuel(v: number): number {
  if (typeof v !== 'number' || isNaN(v)) return 100;
  return Math.max(0, Math.min(100, v));
}

function clampWater(v: number): number {
  if (typeof v !== 'number' || isNaN(v)) return 0;
  return Math.max(0, v);
}

