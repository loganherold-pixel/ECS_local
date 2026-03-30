/**
 * ECS Loadout Weight Cache — Items Weight Computation & Notification
 *
 * Computes items_weight_lb = SUM(item.weight_lbs * item.quantity) for all items
 * in the active loadout. Caches per loadout and per vehicle.
 * Notifies listeners on change so dashboard/widgets update immediately.
 *
 * Phase 3: Item Weight Accuracy + Sources
 * Phase 3 Stabilization: Uses DEFAULT_ITEM_WEIGHT_LBS (1 lb) for missing weights
 */
import { Platform } from 'react-native';
import type { LoadoutItem, WeightSource } from './types';
import { sanitizeItemWeight, DEFAULT_ITEM_WEIGHT_LBS } from './vehicleWeightEngine';


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

// ── Types ───────────────────────────────────────────────
export interface LoadoutWeightSummary {
  /** Total weight of all items: SUM(weight_lbs * quantity) */
  items_weight_lb: number;
  /** Number of items with weight data */
  items_with_weight: number;
  /** Total item count */
  total_items: number;
  /** Breakdown by weight source */
  by_source: Record<WeightSource, { count: number; weight_lb: number }>;
}

// ── Persistence ─────────────────────────────────────────
const LS_KEY = 'ecs_loadout_weight_cache';

interface CacheEntry {
  items_weight_lb: number;
  items_with_weight: number;
  total_items: number;
  updated_at: string;
}

function getAllCache(): Record<string, CacheEntry> {
  const raw = lsGet(LS_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

function saveAllCache(data: Record<string, CacheEntry>): void {
  lsSet(LS_KEY, JSON.stringify(data));
}

// ── Change listeners ────────────────────────────────────
type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notifyListeners() {
  listeners.forEach(fn => { try { fn(); } catch {} });
}

// ── Computation helpers ─────────────────────────────────

/**
 * Compute items_weight_lb from a list of LoadoutItems.
 * Handles legacy items with no weight (treats as 0) and no weight_source (treats as 'estimate').
 */
export function computeItemsWeightLb(items: LoadoutItem[]): number {
  return items.reduce((sum, item) => {
    const weight = item.weight_lbs != null && item.weight_lbs >= 0 ? item.weight_lbs : 0;
    const qty = item.quantity != null && item.quantity >= 1 ? item.quantity : 1;
    return sum + (weight * qty);
  }, 0);
}

/**
 * Compute a full weight summary from loadout items.
 */
export function computeWeightSummary(items: LoadoutItem[]): LoadoutWeightSummary {
  const bySource: Record<WeightSource, { count: number; weight_lb: number }> = {
    manufacturer: { count: 0, weight_lb: 0 },
    measured: { count: 0, weight_lb: 0 },
    estimate: { count: 0, weight_lb: 0 },
  };

  let itemsWithWeight = 0;
  let totalWeight = 0;

  for (const item of items) {
    const weight = item.weight_lbs != null && item.weight_lbs >= 0 ? item.weight_lbs : 0;
    const qty = item.quantity != null && item.quantity >= 1 ? item.quantity : 1;
    const source: WeightSource = item.weight_source || 'estimate';
    const lineWeight = weight * qty;

    totalWeight += lineWeight;

    if (weight > 0) {
      itemsWithWeight++;
      bySource[source].count++;
      bySource[source].weight_lb += lineWeight;
    }
  }

  return {
    items_weight_lb: totalWeight,
    items_with_weight: itemsWithWeight,
    total_items: items.length,
    by_source: bySource,
  };
}

// ── Public API ──────────────────────────────────────────
export const loadoutWeightCache = {
  /**
   * Update the cached weight for a loadout after items change.
   * Call this after any item create/update/delete.
   */
  updateFromItems: (loadoutId: string, items: LoadoutItem[]): void => {
    const summary = computeWeightSummary(items);
    const all = getAllCache();
    all[loadoutId] = {
      items_weight_lb: summary.items_weight_lb,
      items_with_weight: summary.items_with_weight,
      total_items: summary.total_items,
      updated_at: new Date().toISOString(),
    };
    saveAllCache(all);
    notifyListeners();
  },

  /**
   * Set items_weight_lb directly for a loadout (e.g., from a quick recompute).
   */
  set: (loadoutId: string, itemsWeightLb: number, totalItems?: number): void => {
    const all = getAllCache();
    const existing = all[loadoutId];
    all[loadoutId] = {
      items_weight_lb: itemsWeightLb,
      items_with_weight: existing?.items_with_weight ?? 0,
      total_items: totalItems ?? existing?.total_items ?? 0,
      updated_at: new Date().toISOString(),
    };
    saveAllCache(all);
    notifyListeners();
  },

  /**
   * Get cached items_weight_lb for a loadout. Returns 0 if not cached.
   */
  get: (loadoutId: string): number => {
    const all = getAllCache();
    return all[loadoutId]?.items_weight_lb ?? 0;
  },

  /**
   * Get full cache entry for a loadout.
   */
  getEntry: (loadoutId: string): CacheEntry | null => {
    const all = getAllCache();
    return all[loadoutId] ?? null;
  },

  /**
   * Get the first cached entry (for dashboard when loadoutId is unknown).
   */
  getFirst: (): { loadoutId: string; itemsWeightLb: number } | null => {
    const all = getAllCache();
    const entries = Object.entries(all);
    if (entries.length === 0) return null;
    // Return the most recently updated entry
    const sorted = entries.sort((a, b) =>
      new Date(b[1].updated_at).getTime() - new Date(a[1].updated_at).getTime()
    );
    const [loadoutId, entry] = sorted[0];
    return { loadoutId, itemsWeightLb: entry.items_weight_lb };
  },

  /**
   * Get total items_weight_lb across all cached loadouts (for vehicles with multiple loadouts).
   * Typically you'd use getFirst() or get(loadoutId) for a single active loadout.
   */
  getTotal: (): number => {
    const all = getAllCache();
    return Object.values(all).reduce((sum, e) => sum + e.items_weight_lb, 0);
  },

  /**
   * Remove cache for a loadout.
   */
  remove: (loadoutId: string): void => {
    const all = getAllCache();
    delete all[loadoutId];
    saveAllCache(all);
    notifyListeners();
  },

  /**
   * Subscribe to weight cache changes.
   */
  subscribe: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};

