/**
 * Loadout 2.0 — Data Model Types & Helpers
 *
 * Single source of truth for the container-based loadout system.
 * Mirrors the Accessory Framework container structure.
 *
 * TYPES:
 *   Loadout2           — Top-level loadout (wraps existing Loadout)
 *   LoadoutContainer   — A container within a loadout (derived from ContainerZone)
 *   LoadoutItem2       — An item assigned to a container
 *   ChecklistTemplateItem — For Part 3 checklist feature
 *
 * HELPERS:
 *   computeItemTotal()       — qty * unitWeight
 *   computeContainerTotal()  — sum of all item totals in a container
 *   computeLoadoutTotal()    — sum of all container totals
 *   getContainerItemCount()  — count items in a container
 */

import { getContainerFrameworkWeightLbs, type ContainerZone } from './accessoryFramework';
import type { LoadoutItem } from './types';
import { matchStorageLocationToZone } from './containerZoneLoader';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Loadout 2.0 — top-level loadout entity.
 * Extends the existing Loadout type with container-aware metadata.
 */
export interface Loadout2 {
  id: string;
  name: string;
  vehicleId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A container within a loadout.
 * Derived from the vehicle's ContainerZone (accessory framework).
 */
export interface LoadoutContainer {
  /** Unique container ID (matches ContainerZone.id, e.g., 'cab_rack') */
  id: string;
  /** Parent loadout ID */
  loadoutId: string;
  /** Snake_case key matching accessory category */
  key: string;
  /** Human-readable label (e.g., 'Cab Rack') */
  label: string;
  /** Icon key for display (Ionicons name) */
  iconKey: string;
  /** Accent color for UI rendering */
  color: string;
  /** Whether this container is enabled/active */
  isEnabled: boolean;
  /** Display sort order */
  sortOrder: number;
}

/**
 * An item within a loadout container.
 */
export interface LoadoutItem2 {
  id: string;
  loadoutId: string;
  containerKey: string;
  name: string;
  qty: number;
  unitWeight: number;
  unitWeightUnit: 'lb' | 'kg';
  totalWeight: number;
  notes?: string | null;
  isCritical?: boolean;
  isPacked?: boolean;
  category?: string;
  createdAt: string;
  /** Liquid-specific fields (only for water_storage container) */
  isLiquid?: boolean;
  liquidType?: 'water' | 'fuel' | 'other';
  liquidAmount?: number;
  liquidUnit?: 'gallons' | 'liters';
}


/**
 * Liquid density constants (lb per unit volume).
 */
export const LIQUID_DENSITIES = {
  water: { lbPerGallon: 8.34, kgPerLiter: 1.0 },
  fuel: { lbPerGallon: 6.3, kgPerLiter: 0.755 },
  other: { lbPerGallon: 8.34, kgPerLiter: 1.0 }, // default to water
} as const;

/**
 * The container key that triggers liquid-entry mode.
 */
export const LIQUID_CONTAINER_KEY = 'water_storage';

/**
 * Compute weight from liquid amount and type.
 * Returns weight in lbs.
 */
export function computeLiquidWeight(
  amount: number,
  unit: 'gallons' | 'liters',
  liquidType: 'water' | 'fuel' | 'other' = 'water',
): number {
  const density = LIQUID_DENSITIES[liquidType];
  if (unit === 'gallons') {
    return Math.round(amount * density.lbPerGallon * 100) / 100;
  }
  // liters → kg → lbs (1 kg = 2.20462 lbs)
  const kg = amount * density.kgPerLiter;
  return Math.round(kg * 2.20462 * 100) / 100;
}

/**
 * Checklist template item (for Part 3).
 */
export interface ChecklistTemplateItem {
  id: string;
  label: string;
  containerKey: string | null;
  category: string | null;
  isCritical: boolean;
  sortOrder: number;
}


// ═══════════════════════════════════════════════════════════════
// WEIGHT COMPUTATION HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Compute total weight for a single item: qty * unitWeight.
 */
export function computeItemTotal(qty: number, unitWeight: number): number {
  return Math.round((qty * unitWeight) * 100) / 100;
}

/**
 * Compute total weight for all items in a container.
 */
export function computeContainerTotal(items: LoadoutItem2[]): number {
  return Math.round(
    items.reduce((sum, item) => sum + computeItemTotal(item.qty, item.unitWeight), 0) * 100
  ) / 100;
}

/**
 * Compute total weight across all containers.
 */
export function computeLoadoutTotal(containerItems: Record<string, LoadoutItem2[]>): number {
  let total = 0;
  for (const items of Object.values(containerItems)) {
    total += computeContainerTotal(items);
  }
  return Math.round(total * 100) / 100;
}

/**
 * Get item count for a specific container.
 */
export function getContainerItemCount(
  items: LoadoutItem[],
  containerZones: ContainerZone[],
  containerKey: string,
): number {
  return items.filter(item => {
    if (!item.storage_location) return false;
    const matched = matchStorageLocationToZone(containerZones, item.storage_location);
    return matched?.id === containerKey;
  }).length;
}

/**
 * Get total weight (lbs) for a specific container from existing LoadoutItems.
 * Uses storage_location matching against container zones.
 */
export function getContainerWeight(
  items: LoadoutItem[],
  containerZones: ContainerZone[],
  containerKey: string,
): number {
  let total = getContainerFrameworkWeightLbs(containerKey);
  for (const item of items) {
    if (!item.storage_location) continue;
    const matched = matchStorageLocationToZone(containerZones, item.storage_location);
    if (matched?.id === containerKey) {
      total += (item.weight_lbs || 0) * (item.quantity || 1);
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Get total weight across all containers from existing LoadoutItems.
 */
export function getTotalLoadoutWeight(
  items: LoadoutItem[],
  containerZones?: ContainerZone[],
): number {
  const itemWeight = items.reduce(
    (sum, item) => sum + ((item.weight_lbs || 0) * (item.quantity || 1)),
    0,
  );
  const frameworkWeight = containerZones
    ? containerZones.reduce((sum, zone) => sum + getContainerFrameworkWeightLbs(zone.id), 0)
    : 0;

  return Math.round((itemWeight + frameworkWeight) * 100) / 100;
}

/**
 * Get count of unassigned items (no storage_location or no matching zone).
 */
export function getUnassignedItemCount(
  items: LoadoutItem[],
  containerZones: ContainerZone[],
): number {
  return items.filter(item => {
    if (!item.storage_location) return true;
    return !matchStorageLocationToZone(containerZones, item.storage_location);
  }).length;
}

/**
 * Get weight of unassigned items.
 */
export function getUnassignedWeight(
  items: LoadoutItem[],
  containerZones: ContainerZone[],
): number {
  let total = 0;
  for (const item of items) {
    if (!item.storage_location || !matchStorageLocationToZone(containerZones, item.storage_location)) {
      total += (item.weight_lbs || 0) * (item.quantity || 1);
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Convert ContainerZone[] to LoadoutContainer[] for a given loadout.
 */
export function containerZonesToLoadoutContainers(
  zones: ContainerZone[],
  loadoutId: string,
): LoadoutContainer[] {
  return zones.map(zone => ({
    id: zone.id,
    loadoutId,
    key: zone.id,
    label: zone.label,
    iconKey: zone.icon,
    color: zone.color,
    isEnabled: true,
    sortOrder: zone.sortOrder,
  }));
}

