/**
 * ECS Tires & Lift Store — Per-Vehicle Tire Size & Suspension Configuration
 *
 * Stores tire diameter, suspension lift height, and leveled state
 * per vehicle for future attitude monitor, articulation logic,
 * vehicle capability scoring, and terrain handling assumptions.
 *
 * Offline-first: localStorage (web) / memory (native).
 *
 * Data model is structured for future integration with:
 *   - Attitude monitor (ground clearance estimation)
 *   - Articulation logic (tire diameter affects approach/departure angles)
 *   - Vehicle capability scoring (lift + tire combo)
 *   - Discover compatibility engine (terrain handling assumptions)
 *   - Terrain risk engine (ground clearance vs obstacle height)
 */
import { Platform } from 'react-native';

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

// ── Data Model ──────────────────────────────────────────

export interface TiresLiftConfig {
  /** Tire diameter in inches (e.g. 29, 31, 33, 35, 37, 40) */
  tireSizeInches: number;
  /** Suspension lift in inches (0 = stock) */
  suspensionLiftInches: number;
  /** Whether the vehicle is leveled (front raised to match rear) */
  isLeveled: boolean;
  /** Optional: tire width (e.g. 12.5 for 285/75R17) — future use */
  tireWidthInches?: number;
  /** Optional: wheel diameter (e.g. 17) — future use */
  wheelDiameterInches?: number;
  /** Optional: tire model/brand string — future use */
  tireModel?: string;
  /** Timestamp of last update */
  updatedAt: string;
}

/** Default (empty/stock) configuration */
export const DEFAULT_TIRES_LIFT: TiresLiftConfig = {
  tireSizeInches: 0,
  suspensionLiftInches: 0,
  isLeveled: false,
  updatedAt: new Date().toISOString(),
};

// ── Preset Options ──────────────────────────────────────

export const TIRE_SIZE_OPTIONS: { label: string; value: number }[] = [
  { label: '29"', value: 29 },
  { label: '31"', value: 31 },
  { label: '33"', value: 33 },
  { label: '35"', value: 35 },
  { label: '37"', value: 37 },
  { label: '40"', value: 40 },
];

export const SUSPENSION_OPTIONS: { label: string; value: number; isLeveled?: boolean }[] = [
  { label: 'Stock', value: 0 },
  { label: 'Leveled', value: 0, isLeveled: true },
  { label: '2" Lift', value: 2 },
  { label: '3" Lift', value: 3 },
  { label: '4" Lift', value: 4 },
  { label: '6" Lift', value: 6 },
];

// ── Persistence ─────────────────────────────────────────
const LS_KEY = 'ecs_tires_lift';

function getAllConfigs(): Record<string, TiresLiftConfig> {
  const raw = lsGet(LS_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

function saveAllConfigs(configs: Record<string, TiresLiftConfig>): void {
  lsSet(LS_KEY, JSON.stringify(configs));
}

// ── Change listeners ────────────────────────────────────
type Listener = (vehicleId: string) => void;
const listeners: Set<Listener> = new Set();

function notifyListeners(vehicleId: string) {
  listeners.forEach(fn => { try { fn(vehicleId); } catch {} });
}

// ── Public API ──────────────────────────────────────────
export const tiresLiftStore = {
  /**
   * Get tires/lift config for a specific vehicle.
   * Returns null if not configured.
   */
  get: (vehicleId: string): TiresLiftConfig | null => {
    const all = getAllConfigs();
    return all[vehicleId] || null;
  },

  /**
   * Check if a vehicle has any tires/lift configuration set.
   */
  isConfigured: (vehicleId: string): boolean => {
    const config = tiresLiftStore.get(vehicleId);
    if (!config) return false;
    return config.tireSizeInches > 0 || config.suspensionLiftInches > 0 || config.isLeveled;
  },

  /**
   * Set full tires/lift config for a vehicle.
   */
  set: (vehicleId: string, config: TiresLiftConfig): void => {
    const all = getAllConfigs();
    all[vehicleId] = { ...config, updatedAt: new Date().toISOString() };
    saveAllConfigs(all);
    notifyListeners(vehicleId);
  },

  /**
   * Update partial tires/lift config for a vehicle.
   */
  update: (vehicleId: string, partial: Partial<TiresLiftConfig>): void => {
    const all = getAllConfigs();
    const existing = all[vehicleId] || { ...DEFAULT_TIRES_LIFT };
    all[vehicleId] = { ...existing, ...partial, updatedAt: new Date().toISOString() };
    saveAllConfigs(all);
    notifyListeners(vehicleId);
  },

  /**
   * Remove tires/lift config for a vehicle.
   */
  remove: (vehicleId: string): void => {
    const all = getAllConfigs();
    delete all[vehicleId];
    saveAllConfigs(all);
    notifyListeners(vehicleId);
  },

  /**
   * Subscribe to tires/lift config changes.
   * Returns an unsubscribe function.
   */
  subscribe: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  /**
   * Get a compact summary string for display on Fleet cards.
   * Returns null if not configured.
   *
   * Examples:
   *   "33\" Tires  /  2\" Lift"
   *   "35\" Tires  /  Leveled"
   *   "37\" Tires  /  Stock"
   *   "Stock  /  3\" Lift"
   */
  getSummary: (vehicleId: string): { tires: string | null; suspension: string | null } | null => {
    const config = tiresLiftStore.get(vehicleId);
    if (!config) return null;

    const hasTires = config.tireSizeInches > 0;
    const hasLift = config.suspensionLiftInches > 0;
    const hasLeveled = config.isLeveled;

    if (!hasTires && !hasLift && !hasLeveled) return null;

    const tires = hasTires ? `${config.tireSizeInches}"` : null;
    let suspension: string | null = null;
    if (hasLift) {
      suspension = `${config.suspensionLiftInches}" Lift`;
    } else if (hasLeveled) {
      suspension = 'Leveled';
    }

    return { tires, suspension };
  },

  // ── Future Integration Helpers ────────────────────────

  /**
   * Estimate ground clearance delta from stock (inches).
   * Rough formula: (tireSizeDelta / 2) + liftInches
   * Assumes stock tire is ~29" for most trucks.
   */
  estimateGroundClearanceDelta: (vehicleId: string, stockTireSizeInches: number = 29): number => {
    const config = tiresLiftStore.get(vehicleId);
    if (!config) return 0;
    const tireDelta = Math.max(0, config.tireSizeInches - stockTireSizeInches) / 2;
    return tireDelta + config.suspensionLiftInches;
  },

  /**
   * Get a capability tier based on tire/lift combo.
   * Useful for Discover compatibility engine.
   */
  getCapabilityTier: (vehicleId: string): 'stock' | 'mild' | 'moderate' | 'aggressive' | 'extreme' => {
    const config = tiresLiftStore.get(vehicleId);
    if (!config) return 'stock';

    const tireScore = config.tireSizeInches >= 37 ? 3 : config.tireSizeInches >= 35 ? 2 : config.tireSizeInches >= 33 ? 1 : 0;
    const liftScore = config.suspensionLiftInches >= 6 ? 3 : config.suspensionLiftInches >= 4 ? 2 : config.suspensionLiftInches >= 2 ? 1 : 0;
    const total = tireScore + liftScore;

    if (total >= 5) return 'extreme';
    if (total >= 4) return 'aggressive';
    if (total >= 2) return 'moderate';
    if (total >= 1 || config.isLeveled) return 'mild';
    return 'stock';
  },
};

