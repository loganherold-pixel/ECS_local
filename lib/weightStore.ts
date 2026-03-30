/**
 * ECS Weight Store — Zone Weight Capacity & Loadout Weight Tracking
 *
 * Manages:
 *   - Per-zone weight capacity limits (configurable)
 *   - Default capacities based on zone type
 *   - Weight computation helpers (per-zone totals, overall vehicle weight)
 *   - Overweight warnings
 *
 * Offline-first: uses localStorage / memory store.
 */
import { Platform } from 'react-native';
import type { LoadoutItem, VehicleZone } from './types';

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

// ── Types ────────────────────────────────────────────────
export interface ZoneWeightCapacity {
  zoneId: string;
  zoneName: string;
  capacityLbs: number;
}

export interface ZoneWeightSummary {
  zoneId: string;
  zoneName: string;
  totalWeightLbs: number;
  capacityLbs: number;
  itemCount: number;
  utilizationPct: number;
  isOverweight: boolean;
  isWarning: boolean; // > 80% capacity
}

export interface VehicleWeightSummary {
  totalLoadoutWeightLbs: number;
  totalCapacityLbs: number;
  zones: ZoneWeightSummary[];
  overweightZones: ZoneWeightSummary[];
  warningZones: ZoneWeightSummary[];
  itemsWithWeight: number;
  itemsWithoutWeight: number;
  totalItems: number;
}

// ── Default Zone Capacities ─────────────────────────────
// Based on common vehicle zone types and typical load ratings
const DEFAULT_CAPACITIES: Record<string, number> = {
  // By zone type
  'area': 500,
  'container': 200,
  'slot': 100,
  'drawer': 150,
  'rack': 300,
  'hitch': 250,
};

// By zone name patterns (overrides zone type defaults)
const NAME_PATTERN_CAPACITIES: { pattern: RegExp; capacity: number }[] = [
  { pattern: /roof\s*rack/i, capacity: 300 },
  { pattern: /cab\s*rack/i, capacity: 250 },
  { pattern: /bed\s*rack/i, capacity: 400 },
  { pattern: /open\s*bed/i, capacity: 1000 },
  { pattern: /cab\s*interior/i, capacity: 150 },
  { pattern: /smart\s*cap|rsi/i, capacity: 600 },
  { pattern: /alu\s*cab/i, capacity: 600 },
  { pattern: /topper|shell/i, capacity: 500 },
  { pattern: /trunk/i, capacity: 300 },
  { pattern: /hatch/i, capacity: 250 },
  { pattern: /cargo/i, capacity: 500 },
  { pattern: /drawer/i, capacity: 150 },
  { pattern: /hitch/i, capacity: 250 },
  { pattern: /hard\s*top/i, capacity: 200 },
];

/**
 * Get default capacity for a zone based on its name and type.
 */
export function getDefaultZoneCapacity(zoneName: string, zoneType?: string): number {
  // Check name patterns first (more specific)
  for (const { pattern, capacity } of NAME_PATTERN_CAPACITIES) {
    if (pattern.test(zoneName)) return capacity;
  }
  // Fall back to zone type
  if (zoneType && DEFAULT_CAPACITIES[zoneType]) {
    return DEFAULT_CAPACITIES[zoneType];
  }
  return 300; // general default
}

// ── Zone Capacity Store ─────────────────────────────────
const LS_ZONE_CAPS = 'ecs_zone_weight_capacities';

function getStoredCapacities(): Record<string, number> {
  const raw = lsGet(LS_ZONE_CAPS);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

function saveCapacities(caps: Record<string, number>): void {
  lsSet(LS_ZONE_CAPS, JSON.stringify(caps));
}

export const zoneCapacityStore = {
  /**
   * Get capacity for a specific zone. Returns stored override or default.
   */
  getCapacity: (zoneId: string, zoneName: string, zoneType?: string): number => {
    const stored = getStoredCapacities();
    if (stored[zoneId] != null) return stored[zoneId];
    return getDefaultZoneCapacity(zoneName, zoneType);
  },

  /**
   * Set custom capacity for a zone.
   */
  setCapacity: (zoneId: string, capacityLbs: number): void => {
    const stored = getStoredCapacities();
    stored[zoneId] = capacityLbs;
    saveCapacities(stored);
  },

  /**
   * Reset a zone's capacity to default.
   */
  resetCapacity: (zoneId: string): void => {
    const stored = getStoredCapacities();
    delete stored[zoneId];
    saveCapacities(stored);
  },

  /**
   * Get all stored overrides.
   */
  getAllOverrides: (): Record<string, number> => {
    return getStoredCapacities();
  },
};

// ── Weight Computation ──────────────────────────────────

/**
 * Compute weight for a single item (weight_lbs * quantity).
 */
export function computeItemWeight(item: { weight_lbs: number | null; quantity: number }): number {
  return (item.weight_lbs || 0) * (item.quantity || 1);
}

/**
 * Compute per-zone weight summaries from loadout items and vehicle zones.
 */
export function computeZoneWeights(
  zones: { id: string; name: string; zone_type?: string }[],
  items: { storage_location: string | null; weight_lbs: number | null; quantity: number }[],
): ZoneWeightSummary[] {
  return zones.map(zone => {
    const zoneName = zone.name || 'Zone';
    const zoneItems = items.filter(item =>
      item.storage_location?.toLowerCase().includes(zoneName.toLowerCase())
    );
    const totalWeightLbs = zoneItems.reduce((sum, item) => sum + computeItemWeight(item), 0);
    const capacityLbs = zoneCapacityStore.getCapacity(zone.id, zoneName, zone.zone_type);
    const utilizationPct = capacityLbs > 0 ? Math.round((totalWeightLbs / capacityLbs) * 100) : 0;

    return {
      zoneId: zone.id,
      zoneName,
      totalWeightLbs: Math.round(totalWeightLbs * 10) / 10,
      capacityLbs,
      itemCount: zoneItems.length,
      utilizationPct,
      isOverweight: totalWeightLbs > capacityLbs,
      isWarning: !!(totalWeightLbs > capacityLbs * 0.8 && totalWeightLbs <= capacityLbs),
    };
  });
}

/**
 * Compute full vehicle weight summary.
 */
export function computeVehicleWeightSummary(
  zones: { id: string; name: string; zone_type?: string }[],
  items: { storage_location: string | null; weight_lbs: number | null; quantity: number }[],
): VehicleWeightSummary {
  const zoneSummaries = computeZoneWeights(zones, items);

  const totalLoadoutWeightLbs = items.reduce((sum, item) => sum + computeItemWeight(item), 0);
  const totalCapacityLbs = zoneSummaries.reduce((sum, z) => sum + z.capacityLbs, 0);
  const itemsWithWeight = items.filter(i => i.weight_lbs != null && i.weight_lbs > 0).length;
  const itemsWithoutWeight = items.length - itemsWithWeight;

  return {
    totalLoadoutWeightLbs: Math.round(totalLoadoutWeightLbs * 10) / 10,
    totalCapacityLbs,
    zones: zoneSummaries,
    overweightZones: zoneSummaries.filter(z => z.isOverweight),
    warningZones: zoneSummaries.filter(z => z.isWarning),
    itemsWithWeight,
    itemsWithoutWeight,
    totalItems: items.length,
  };
}

/**
 * Get status color for a weight utilization percentage.
 */
export function getWeightStatusColor(utilizationPct: number): string {
  if (utilizationPct > 100) return '#EF5350'; // red - overweight
  if (utilizationPct > 80) return '#FFB74D';  // amber - warning
  if (utilizationPct > 50) return '#C48A2C';  // tactical amber
  return '#66BB6A';                            // green - good
}

/**
 * Get status label for weight utilization.
 */
export function getWeightStatusLabel(utilizationPct: number): string {
  if (utilizationPct > 100) return 'OVERWEIGHT';
  if (utilizationPct > 80) return 'NEAR LIMIT';
  if (utilizationPct > 50) return 'MODERATE';
  return 'GOOD';
}

/**
 * Convert lbs to kg.
 */
export function lbsToKg(lbs: number): number {
  return Math.round(lbs * 0.453592 * 10) / 10;
}

/**
 * Convert kg to lbs.
 */
export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

