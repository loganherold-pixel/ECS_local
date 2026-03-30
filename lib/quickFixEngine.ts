/**
 * QuickFixEngine — Load-balancing recommendation engine
 *
 * Analyzes current load distribution using existing ECS data sources:
 *   - Loadout items and weights (from localStorage)
 *   - Storage location mapping
 *   - Zone weight totals
 *   - Axle distribution
 *
 * Generates up to 3 simple corrective suggestions when imbalance exists.
 * Provides simulation functions for "Preview Impact" without data mutation.
 *
 * DISPLAY-ONLY LOGIC — no data mutations, no background tasks.
 */

import { Platform } from 'react-native';

// ── Storage helpers (mirror useVehicleTwinData pattern) ──────
const memoryStore: Record<string, string> = {};

function lsGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

// ── Types ────────────────────────────────────────────────────

export interface LoadoutItem {
  id: string;
  name: string;
  weight_lbs: number;
  quantity: number;
  storage_location: string;
  loadout_id?: string;
}

export interface QuickFixSuggestion {
  id: string;
  /** Type of imbalance being corrected */
  type: 'roof_overload' | 'rear_heavy' | 'lateral_imbalance';
  /** Item being moved */
  itemName: string;
  /** Item weight in lbs (weight_lbs * quantity) */
  itemWeight: number;
  /** Current storage location */
  fromLocation: string;
  /** Suggested new location */
  toLocation: string;
  /** Normalized zone key for 'from' */
  fromZone: 'roof' | 'cab' | 'bed' | 'leftDrawer' | 'rightDrawer' | 'rearContainer';
  /** Normalized zone key for 'to' */
  toZone: 'roof' | 'cab' | 'bed' | 'leftDrawer' | 'rightDrawer' | 'rearContainer';
  /** Severity level */
  severity: 'warn' | 'critical';
}

export interface ZoneWeights {
  leftDrawer: number;
  rightDrawer: number;
  rearContainer: number;
  roof: number;
  cab: number;
  bed: number;
}

export interface SimulatedImpact {
  /** Adjusted zone weights after applying suggestion */
  zoneWeights: ZoneWeights;
  /** Estimated front axle percent change (delta) */
  frontAxleDelta: number;
  /** Estimated stability margin change description */
  stabilityNote: string;
}

// ── Zone classification from storage_location ────────────────

type ZoneKey = 'roof' | 'cab' | 'bed' | 'leftDrawer' | 'rightDrawer' | 'rearContainer';

function classifyItemZone(storageLocation: string): ZoneKey {
  const loc = (storageLocation || '').toLowerCase();

  if (loc.includes('roof') || loc.includes('rack')) return 'roof';
  if (loc.includes('left') && loc.includes('drawer')) return 'leftDrawer';
  if (loc.includes('right') && loc.includes('drawer')) return 'rightDrawer';
  if (loc.includes('rear') && (loc.includes('container') || loc.includes('cargo'))) return 'rearContainer';
  if (loc.includes('cab') || loc.includes('interior') || loc.includes('front')) return 'cab';
  if (
    loc.includes('bed') || loc.includes('drawer') ||
    loc.includes('container') || loc.includes('cargo') ||
    loc.includes('hitch') || loc.includes('topper') ||
    loc.includes('cap') || loc.includes('alu')
  ) return 'bed';

  return 'bed'; // default
}

function zoneDisplayName(zone: ZoneKey): string {
  switch (zone) {
    case 'roof': return 'ROOF';
    case 'cab': return 'CAB Storage';
    case 'bed': return 'BED';
    case 'leftDrawer': return 'Left Drawer';
    case 'rightDrawer': return 'Right Drawer';
    case 'rearContainer': return 'Rear Container';
  }
}

// ── Read loadout items ───────────────────────────────────────

function getLoadoutItemsLocal(): LoadoutItem[] {
  try {
    const raw = lsGet('ecs_local_loadout_items');
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

function getLoadoutsLocal(): any[] {
  try {
    const raw = lsGet('ecs_local_loadouts');
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

function getVehicleItems(vehicleId: string): LoadoutItem[] {
  try {
    const loadouts = getLoadoutsLocal();
    const vehicleLoadoutIds = loadouts
      .filter((l: any) => l.vehicle_id === vehicleId)
      .map((l: any) => l.id);

    const allItems = getLoadoutItemsLocal();

    if (vehicleLoadoutIds.length === 0) {
      return allItems; // fallback: use all items
    }

    return allItems.filter((item: any) =>
      vehicleLoadoutIds.includes(item.loadout_id)
    );
  } catch {
    return [];
  }
}

// ── Imbalance detection thresholds ───────────────────────────

const ROOF_OVERLOAD_PCT = 0.15;      // roof > 15% of total zone load
const LATERAL_IMBALANCE_PCT = 0.10;  // left/right > 10% difference
const REAR_HEAVY_PCT = 1.10;         // rear axle > front * 1.10

interface ImbalanceConditions {
  roofOverloaded: boolean;
  roofPct: number;
  rearHeavy: boolean;
  rearExcessPct: number;
  leftHeavy: boolean;
  rightHeavy: boolean;
  lateralDiffPct: number;
}

function detectImbalance(
  zoneWeights: ZoneWeights,
  frontAxleLbs: number | null,
  rearAxleLbs: number | null,
): ImbalanceConditions {
  const totalZone = zoneWeights.roof + zoneWeights.cab + zoneWeights.bed;
  const roofPct = totalZone > 0 ? zoneWeights.roof / totalZone : 0;
  const roofOverloaded = roofPct > ROOF_OVERLOAD_PCT && zoneWeights.roof > 0;

  const front = frontAxleLbs ?? 0;
  const rear = rearAxleLbs ?? 0;
  const rearHeavy = front > 0 && rear > 0 && rear > front * REAR_HEAVY_PCT;
  const rearExcessPct = front > 0 ? ((rear - front) / front) * 100 : 0;

  const left = zoneWeights.leftDrawer;
  const right = zoneWeights.rightDrawer;
  const maxSide = Math.max(left, right);
  const lateralDiffPct = maxSide > 0 ? Math.abs(left - right) / maxSide : 0;
  const leftHeavy = lateralDiffPct > LATERAL_IMBALANCE_PCT && left > right;
  const rightHeavy = lateralDiffPct > LATERAL_IMBALANCE_PCT && right > left;

  return {
    roofOverloaded,
    roofPct,
    rearHeavy,
    rearExcessPct,
    leftHeavy,
    rightHeavy,
    lateralDiffPct,
  };
}

// ── Suggestion generator ─────────────────────────────────────

export function generateQuickFixes(
  vehicleId: string | null,
  zoneWeights: ZoneWeights,
  frontAxleLbs: number | null,
  rearAxleLbs: number | null,
): QuickFixSuggestion[] {
  if (!vehicleId) return [];

  const conditions = detectImbalance(zoneWeights, frontAxleLbs, rearAxleLbs);
  const hasAnyImbalance = conditions.roofOverloaded || conditions.rearHeavy ||
    conditions.leftHeavy || conditions.rightHeavy;

  if (!hasAnyImbalance) return [];

  const items = getVehicleItems(vehicleId);
  if (items.length === 0) return [];

  // Classify items by zone and sort by effective weight (heaviest first)
  const itemsByZone: Record<ZoneKey, Array<LoadoutItem & { effectiveWeight: number; zone: ZoneKey }>> = {
    roof: [], cab: [], bed: [], leftDrawer: [], rightDrawer: [], rearContainer: [],
  };

  for (const item of items) {
    const zone = classifyItemZone(item.storage_location);
    const effectiveWeight = (item.weight_lbs || 0) * Math.max(1, item.quantity || 1);
    if (effectiveWeight > 0) {
      itemsByZone[zone].push({ ...item, effectiveWeight, zone });
    }
  }

  // Sort each zone by weight descending
  for (const zone of Object.keys(itemsByZone) as ZoneKey[]) {
    itemsByZone[zone].sort((a, b) => b.effectiveWeight - a.effectiveWeight);
  }

  const suggestions: QuickFixSuggestion[] = [];
  const usedItemIds = new Set<string>();
  const MAX_SUGGESTIONS = 3;

  // ── A) Roof overload → move heavy roof items to BED or CAB ──
  if (conditions.roofOverloaded && suggestions.length < MAX_SUGGESTIONS) {
    const roofItems = itemsByZone.roof.filter(i => !usedItemIds.has(i.id));
    if (roofItems.length > 0) {
      const heaviest = roofItems[0];
      // Prefer BED if bed has capacity, otherwise CAB
      const toZone: ZoneKey = 'bed';
      suggestions.push({
        id: `roof-to-${toZone}-${heaviest.id}`,
        type: 'roof_overload',
        itemName: heaviest.name || 'Item',
        itemWeight: Math.round(heaviest.effectiveWeight),
        fromLocation: heaviest.storage_location || 'Roof Rack',
        toLocation: zoneDisplayName(toZone),
        fromZone: 'roof',
        toZone,
        severity: conditions.roofPct > 0.25 ? 'critical' : 'warn',
      });
      usedItemIds.add(heaviest.id);
    }
  }

  // ── B) Rear-heavy → move heavy rear items forward ──
  if (conditions.rearHeavy && suggestions.length < MAX_SUGGESTIONS) {
    // Look for heavy items in bed, rearContainer
    const rearItems = [
      ...itemsByZone.rearContainer,
      ...itemsByZone.bed,
    ].filter(i => !usedItemIds.has(i.id))
     .sort((a, b) => b.effectiveWeight - a.effectiveWeight);

    if (rearItems.length > 0) {
      const heaviest = rearItems[0];
      suggestions.push({
        id: `rear-to-cab-${heaviest.id}`,
        type: 'rear_heavy',
        itemName: heaviest.name || 'Item',
        itemWeight: Math.round(heaviest.effectiveWeight),
        fromLocation: heaviest.storage_location || 'Rear',
        toLocation: zoneDisplayName('cab'),
        fromZone: heaviest.zone,
        toZone: 'cab',
        severity: conditions.rearExcessPct > 20 ? 'critical' : 'warn',
      });
      usedItemIds.add(heaviest.id);
    }
  }

  // ── C) Left/right imbalance → swap or relocate drawer items ──
  if ((conditions.leftHeavy || conditions.rightHeavy) && suggestions.length < MAX_SUGGESTIONS) {
    const heavySide: ZoneKey = conditions.leftHeavy ? 'leftDrawer' : 'rightDrawer';
    const lightSide: ZoneKey = conditions.leftHeavy ? 'rightDrawer' : 'leftDrawer';

    const heavySideItems = itemsByZone[heavySide].filter(i => !usedItemIds.has(i.id));
    if (heavySideItems.length > 0) {
      const heaviest = heavySideItems[0];
      suggestions.push({
        id: `lateral-${heaviest.id}`,
        type: 'lateral_imbalance',
        itemName: heaviest.name || 'Item',
        itemWeight: Math.round(heaviest.effectiveWeight),
        fromLocation: heaviest.storage_location || zoneDisplayName(heavySide),
        toLocation: zoneDisplayName(lightSide),
        fromZone: heavySide,
        toZone: lightSide,
        severity: conditions.lateralDiffPct > 0.25 ? 'critical' : 'warn',
      });
      usedItemIds.add(heaviest.id);
    }
  }

  return suggestions.slice(0, MAX_SUGGESTIONS);
}

// ── Simulation ───────────────────────────────────────────────

/**
 * Simulate the impact of applying a suggestion.
 * Returns adjusted zone weights and estimated impact notes.
 * Does NOT modify any stored data.
 */
export function simulateSuggestion(
  currentWeights: ZoneWeights,
  suggestion: QuickFixSuggestion,
): SimulatedImpact {
  // Clone current weights
  const adjusted: ZoneWeights = { ...currentWeights };

  const weight = suggestion.itemWeight;

  // Subtract from source zone
  const fromKey = suggestion.fromZone;
  adjusted[fromKey] = Math.max(0, adjusted[fromKey] - weight);

  // Add to destination zone
  const toKey = suggestion.toZone;
  adjusted[toKey] = adjusted[toKey] + weight;

  // Estimate front axle delta (simplified heuristic)
  // Moving weight forward (to cab) increases front axle load
  // Moving weight down (from roof) improves stability
  let frontAxleDelta = 0;
  let stabilityNote = '';

  if (suggestion.type === 'roof_overload') {
    stabilityNote = 'Lowers center of gravity, improves roll stability';
    frontAxleDelta = suggestion.toZone === 'cab' ? 1.5 : 0.5;
  } else if (suggestion.type === 'rear_heavy') {
    stabilityNote = 'Shifts weight forward, improves axle balance';
    frontAxleDelta = 2.0;
  } else if (suggestion.type === 'lateral_imbalance') {
    stabilityNote = 'Balances left/right weight, reduces roll tendency';
    frontAxleDelta = 0;
  }

  return {
    zoneWeights: adjusted,
    frontAxleDelta,
    stabilityNote,
  };
}

/**
 * Check if any imbalance conditions exist.
 * Used to determine whether to show "optimal" message.
 */
export function hasImbalanceConditions(
  zoneWeights: ZoneWeights,
  frontAxleLbs: number | null,
  rearAxleLbs: number | null,
): boolean {
  const conditions = detectImbalance(zoneWeights, frontAxleLbs, rearAxleLbs);
  return conditions.roofOverloaded || conditions.rearHeavy ||
    conditions.leftHeavy || conditions.rightHeavy;
}

