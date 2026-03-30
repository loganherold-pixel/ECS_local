/**
 * ECS Vehicle Weight Engine — Phase 5 + Phase 3 Stabilization
 *
 * Isolated, pure-function module for zone-based weight aggregation,
 * load bias computation, and attitude monitor integration.
 *
 * SUB-PHASES:
 *   5A — Zone Weight Aggregation (calculateZoneWeights, calculateVehicleWeight, calculateGvwrPercentage)
 *   5B — Vertical / Longitudinal Load Bias Awareness (computeLoadBias, calculateBiasProfile)
 *   5C — Attitude Monitor Integration (buildStabilityModulesFromZoneWeights, computeAttitudeAwareStability)
 *
 * PHASE 3 STABILIZATION ADDITIONS:
 *   - Default weight (1 lb) for items with missing weight_lbs
 *   - Negative weight prevention (clamped to 0)
 *   - Container weight cap (MAX_CONTAINER_WEIGHT_LBS = 9999)
 *   - Liquid container validation (gallons/liters → weight conversion)
 *   - Liquid-only container enforcement
 *
 * RULES:
 *   - No hooks inside this engine
 *   - No hardcoded container names — zones derive ONLY from vehicle.containerZones
 *   - Missing zone items return 0 weight
 *   - All functions are pure (no side effects, no storage access)
 *   - Results are designed for memoized selectors, NOT persisted to DB
 */

import type {
  ContainerZone,
  VerticalBias,
  LongitudinalBias,
  LateralBias,
} from './accessoryFramework';
import { resolveZoneBias } from './accessoryFramework';
import {
  computeStability,
  computeSimplifiedStability,
  DEFAULT_VEHICLE_BASELINE,
  type LoadModule,
  type VehicleBaseline,
  type StabilityResult,
} from './stabilityEngine';

// ── Phase 3 Stabilization Constants ─────────────────────────
/** Default weight for items with missing weight_lbs (lbs) */
export const DEFAULT_ITEM_WEIGHT_LBS = 1;

/** Maximum weight per container zone (lbs) — safety cap */
export const MAX_CONTAINER_WEIGHT_LBS = 9999;

/** Maximum total vehicle weight (lbs) — numeric safety limit */
export const MAX_VEHICLE_WEIGHT_LBS = 99999;

/** Water density: lbs per gallon */
export const WATER_LBS_PER_GALLON = 8.34;

/** Water density: lbs per liter */
export const WATER_LBS_PER_LITER = 2.205;

/** Liquid unit types accepted by liquid containers */
export type LiquidUnit = 'gallons' | 'liters';

/**
 * Convert liquid volume to weight in lbs using standard water density.
 * @param volume - Volume in gallons or liters
 * @param unit - 'gallons' or 'liters'
 * @returns Weight in lbs
 */
export function liquidVolumeToWeight(volume: number, unit: LiquidUnit): number {
  if (volume <= 0 || typeof volume !== 'number' || isNaN(volume)) return 0;
  switch (unit) {
    case 'gallons': return Math.round(volume * WATER_LBS_PER_GALLON * 10) / 10;
    case 'liters': return Math.round(volume * WATER_LBS_PER_LITER * 10) / 10;
    default: return 0;
  }
}

/**
 * Sanitize an item weight value.
 * - null/undefined/NaN → DEFAULT_ITEM_WEIGHT_LBS (1 lb)
 * - Negative → 0
 * - Positive → as-is
 */
export function sanitizeItemWeight(weightLbs: number | null | undefined): number {
  if (weightLbs == null || typeof weightLbs !== 'number' || isNaN(weightLbs)) {
    return DEFAULT_ITEM_WEIGHT_LBS;
  }
  return Math.max(0, weightLbs);
}

/**
 * Clamp a container zone weight total to safe numeric limits.
 */
export function clampContainerWeight(weightLbs: number): number {
  return Math.max(0, Math.min(MAX_CONTAINER_WEIGHT_LBS, weightLbs));
}

/**
 * Clamp a vehicle total weight to safe numeric limits.
 */
export function clampVehicleWeight(weightLbs: number): number {
  return Math.max(0, Math.min(MAX_VEHICLE_WEIGHT_LBS, weightLbs));
}

/**
 * Check if an item category is liquid-compatible.
 * Only 'water' category items can be placed in liquid-only containers.
 */
export function isLiquidCategory(category: string): boolean {
  return category === 'water';
}



// ═══════════════════════════════════════════════════════════════
// TYPES — Phase 5A: Zone Weight Aggregation
// ═══════════════════════════════════════════════════════════════

/**
 * Loadout item shape expected by the weight engine.
 * Matches the LoadoutItem model's relevant fields.
 *
 * containerZoneId maps to storage_location in the loadout item model.
 * The engine matches items to zones by this field.
 */
export interface WeightEngineItem {
  id: string;
  name: string;
  /** Weight per unit in lbs */
  weight: number;
  /** Quantity of this item */
  quantity: number;
  /** Container zone ID this item is assigned to */
  containerZoneId: string;
  /** Whether this item is mission-critical */
  critical?: boolean;
}

/**
 * Per-zone weight aggregation result.
 */
export interface ZoneWeightEntry {
  zoneId: string;
  zoneLabel: string;
  /** Total weight in lbs for this zone */
  weightLbs: number;
  /** Number of items in this zone */
  itemCount: number;
  /** Number of critical items in this zone */
  criticalCount: number;
}

/**
 * Complete zone weight aggregation result — Phase 5A output.
 */
export interface ZoneWeightResult {
  /** Weight per zone, keyed by zoneId */
  zoneWeights: Record<string, number>;
  /** Detailed per-zone breakdown */
  zoneDetails: ZoneWeightEntry[];
  /** Total weight of all loadout items across all zones */
  totalLoadoutWeight: number;
  /** Total vehicle weight (base + loadout) */
  vehicleTotalWeight: number;
  /** GVWR utilization percentage (0–100+) */
  gvwrPercent: number;
  /** Whether vehicle is over GVWR */
  isOverGvwr: boolean;
  /** Remaining payload capacity in lbs */
  remainingPayloadLbs: number;
  /** Total item count */
  totalItems: number;
  /** Total critical items */
  totalCriticalItems: number;
  /** Items with no zone assignment */
  unassignedItems: WeightEngineItem[];
  /** Weight of unassigned items */
  unassignedWeightLbs: number;
}


// ═══════════════════════════════════════════════════════════════
// TYPES — Phase 5B: Load Bias Awareness
// ═══════════════════════════════════════════════════════════════

/**
 * Load bias classification for a single axis.
 */
export type BiasLevel = 'balanced' | 'slight' | 'moderate' | 'heavy';

/**
 * Longitudinal and vertical load bias result.
 *
 * Longitudinal bias: how much weight is shifted front/rear.
 * Vertical bias: how high the center of loaded weight sits.
 */
export interface LoadBiasResult {
  /** Longitudinal bias direction: 'front' | 'rear' | 'center' */
  longitudinalDirection: 'front' | 'rear' | 'center';
  /** Longitudinal bias severity */
  longitudinalLevel: BiasLevel;
  /** Longitudinal bias value (negative = front, positive = rear, 0 = center) */
  longitudinalValue: number;
  /** Longitudinal bias as a normalized -1 to +1 value */
  longitudinalNormalized: number;

  /** Vertical bias direction: 'low' | 'high' | 'mid' */
  verticalDirection: 'low' | 'high' | 'mid';
  /** Vertical bias severity */
  verticalLevel: BiasLevel;
  /** Vertical CG estimate in inches from ground */
  verticalCgInches: number;
  /** Vertical bias as a normalized 0 to 1 value (0=ground, 1=roof) */
  verticalNormalized: number;

  /** Combined bias risk assessment */
  overallRisk: 'low' | 'moderate' | 'elevated' | 'high';
  /** Human-readable summary */
  summary: string;
}


// ═══════════════════════════════════════════════════════════════
// TYPES — Phase 5C: Attitude Monitor Integration
// ═══════════════════════════════════════════════════════════════
/**
 * Attitude-aware stability result — extends StabilityResult with
 * zone weight context for the Attitude Monitor widget.
 *
 * Phase 5C: Added weightSignals for alert indicator integration.
 */
export interface AttitudeAwareResult {
  /** Full stability computation from stabilityEngine */
  stability: StabilityResult;
  /** Load modules generated from zone weights */
  loadModules: LoadModule[];
  /** Load bias analysis */
  loadBias: LoadBiasResult;
  /** Zone weight aggregation */
  zoneWeights: ZoneWeightResult;
  /** Whether advanced mode should be enabled (sufficient zone data) */
  advancedEnabled: boolean;
  /** Phase 5C: Weight-derived alert signals for the Attitude Monitor */
  weightSignals?: AttitudeWeightSignals;
}


// ═══════════════════════════════════════════════════════════════
// CONSTANTS — Zone Position Estimation
// ═══════════════════════════════════════════════════════════════

/**
 * Zone name → estimated position mapping.
 * Uses the same pattern-matching approach as stabilityEngine.ts
 * but returns normalized values suitable for the weight engine.
 *
 * Positions are in inches from reference points:
 *   x: longitudinal (positive = forward of rear axle)
 *   z: vertical (inches from ground)
 *   y: lateral (inches from centerline, positive = right)
 */
interface ZonePositionEstimate {
  pattern: RegExp;
  /** Longitudinal position (inches from rear axle, positive = forward) */
  xIn: number;
  /** Vertical position (inches from ground) */
  zIn: number;
  /** Lateral position (inches from centerline) */
  yIn: number;
}

const ZONE_POSITION_ESTIMATES: ZonePositionEstimate[] = [
  // Roof / high-mounted zones
  { pattern: /roof.*rack|crossbar/i,         xIn: 40,  zIn: 72, yIn: 0 },
  { pattern: /cab.*rack/i,                   xIn: 80,  zIn: 72, yIn: 0 },
  { pattern: /cab.*rack.*acc/i,              xIn: 78,  zIn: 70, yIn: 0 },
  { pattern: /roof.*top.*tent|rtt/i,         xIn: 35,  zIn: 78, yIn: 0 },

  // Mid-height zones
  { pattern: /interior.*storage|interior/i,  xIn: 60,  zIn: 36, yIn: 0 },
  { pattern: /fridge|slide/i,                xIn: -5,  zIn: 30, yIn: 0 },
  { pattern: /bed.*drawer|bed.*storage/i,    xIn: -5,  zIn: 24, yIn: 0 },

  // Low zones
  { pattern: /recovery.*mount|recovery/i,    xIn: -30, zIn: 22, yIn: 0 },
  { pattern: /water.*storage|water/i,        xIn: -8,  zIn: 20, yIn: 0 },
  { pattern: /power.*system|power.*battery|battery/i, xIn: -5, zIn: 18, yIn: 0 },

  // Fallback patterns
  { pattern: /rear|bed|cargo|trunk/i,        xIn: -10, zIn: 32, yIn: 0 },
  { pattern: /front|cab/i,                   xIn: 80,  zIn: 36, yIn: 0 },
  { pattern: /hitch|bumper/i,                xIn: -35, zIn: 22, yIn: 0 },
];

/** Default position for zones that don't match any pattern */
const DEFAULT_ZONE_POSITION = { xIn: 0, zIn: 30, yIn: 0 };

/**
 * Estimate physical position for a container zone based on its label.
 */
function estimateZonePosition(zoneLabel: string): { xIn: number; zIn: number; yIn: number } {
  for (const est of ZONE_POSITION_ESTIMATES) {
    if (est.pattern.test(zoneLabel)) {
      return { xIn: est.xIn, zIn: est.zIn, yIn: est.yIn };
    }
  }
  return { ...DEFAULT_ZONE_POSITION };
}


// ═══════════════════════════════════════════════════════════════
// PHASE 5A — Zone Weight Aggregation
// ═══════════════════════════════════════════════════════════════
/**
 * Convert loadout items (from the loadout store) into WeightEngineItems.
 *
 * Maps storage_location → containerZoneId by matching against
 * the vehicle's container zones.
 *
 * Phase 3 Stabilization:
 *   - Missing weight_lbs defaults to DEFAULT_ITEM_WEIGHT_LBS (1 lb)
 *   - Negative weights clamped to 0
 *   - Quantity minimum enforced at 1
 *
 * @param items - Raw loadout items from the store
 * @param containerZones - Vehicle's container zones
 * @returns WeightEngineItem[] ready for the weight engine
 */
export function normalizeLoadoutItems(
  items: {
    id: string;
    name: string;
    weight_lbs: number | null;
    quantity: number;
    storage_location: string | null;
    is_critical?: boolean;
  }[],
  containerZones: ContainerZone[],
): WeightEngineItem[] {
  return items.map(item => {
    // Match storage_location to a container zone
    let containerZoneId = '';
    const loc = (item.storage_location || '').toLowerCase().trim();

    if (loc) {
      // Try exact ID match first
      const exactMatch = containerZones.find(z => z.id.toLowerCase() === loc);
      if (exactMatch) {
        containerZoneId = exactMatch.id;
      } else {
        // Try label match
        const labelMatch = containerZones.find(z =>
          z.label.toLowerCase() === loc ||
          loc.includes(z.label.toLowerCase()) ||
          z.label.toLowerCase().includes(loc)
        );
        if (labelMatch) {
          containerZoneId = labelMatch.id;
        }
      }
    }

    // Phase 3: Use sanitizeItemWeight for default (1 lb) and negative prevention
    const weight = sanitizeItemWeight(item.weight_lbs);

    return {
      id: item.id,
      name: item.name,
      weight,
      quantity: Math.max(1, item.quantity || 1),
      containerZoneId,
      critical: item.is_critical || false,
    };
  });
}


/**
 * Calculate per-zone weight totals from loadout items and container zones.
 *
 * RULES:
 *   - Zones derive ONLY from containerZones parameter
 *   - No hardcoded container names
 *   - Missing zone items return 0 weight
 *   - Item weight contribution: weight * quantity
 *
 * @param loadoutItems - Normalized loadout items with containerZoneId
 * @param containerZones - Vehicle's container zones
 * @returns Record<zoneId, weightLbs>
 */
export function calculateZoneWeights(
  loadoutItems: WeightEngineItem[],
  containerZones: ContainerZone[],
): Record<string, number> {
  const zoneWeights: Record<string, number> = {};

  // Initialize all zones to 0
  for (const zone of containerZones) {
    zoneWeights[zone.id] = 0;
  }

  // Aggregate item weights into zones
  for (const item of loadoutItems) {
    if (!item.containerZoneId) continue;
    const itemWeight = item.weight * item.quantity;
    if (itemWeight <= 0) continue;

    if (zoneWeights[item.containerZoneId] !== undefined) {
      zoneWeights[item.containerZoneId] += itemWeight;
    }
    // Items with unrecognized zones are silently ignored (0 weight)
  }

  // Round to 1 decimal
  for (const key of Object.keys(zoneWeights)) {
    zoneWeights[key] = Math.round(zoneWeights[key] * 10) / 10;
  }

  return zoneWeights;
}

/**
 * Calculate total vehicle weight from base weight and zone weights.
 *
 * @param baseWeight - Vehicle base/curb weight in lbs
 * @param zoneWeights - Per-zone weight totals from calculateZoneWeights
 * @returns Total vehicle weight in lbs
 */
export function calculateVehicleWeight(
  baseWeight: number,
  zoneWeights: Record<string, number>,
): number {
  const loadoutTotal = Object.values(zoneWeights).reduce((sum, w) => sum + w, 0);
  return Math.round((baseWeight + loadoutTotal) * 10) / 10;
}

/**
 * Calculate GVWR utilization percentage.
 *
 * @param vehicleWeight - Total vehicle weight in lbs
 * @param gvwr - Gross Vehicle Weight Rating in lbs
 * @returns Percentage (0–100+), 0 if gvwr is 0
 */
export function calculateGvwrPercentage(
  vehicleWeight: number,
  gvwr: number,
): number {
  if (gvwr <= 0) return 0;
  return Math.round((vehicleWeight / gvwr) * 1000) / 10; // 1 decimal precision
}

/**
 * Compute the complete zone weight aggregation result.
 *
 * This is the primary Phase 5A entry point — call from memoized selectors.
 *
 * @param loadoutItems - Normalized loadout items
 * @param containerZones - Vehicle's container zones
 * @param baseWeight - Vehicle base/curb weight in lbs (0 if unknown)
 * @param gvwr - Gross Vehicle Weight Rating in lbs (0 if unknown)
 * @returns ZoneWeightResult — complete aggregation
 */
export function computeZoneWeightAggregation(
  loadoutItems: WeightEngineItem[],
  containerZones: ContainerZone[],
  baseWeight: number = 0,
  gvwr: number = 0,
): ZoneWeightResult {
  const zoneWeights = calculateZoneWeights(loadoutItems, containerZones);

  // Build detailed zone entries
  const zoneDetails: ZoneWeightEntry[] = containerZones.map(zone => {
    const zoneItems = loadoutItems.filter(i => i.containerZoneId === zone.id);
    return {
      zoneId: zone.id,
      zoneLabel: zone.label,
      weightLbs: zoneWeights[zone.id] || 0,
      itemCount: zoneItems.length,
      criticalCount: zoneItems.filter(i => i.critical).length,
    };
  });

  const totalLoadoutWeight = Object.values(zoneWeights).reduce((sum, w) => sum + w, 0);
  const vehicleTotalWeight = calculateVehicleWeight(baseWeight, zoneWeights);
  const gvwrPercent = calculateGvwrPercentage(vehicleTotalWeight, gvwr);

  // Unassigned items (no zone match)
  const unassignedItems = loadoutItems.filter(i => !i.containerZoneId);
  const unassignedWeightLbs = unassignedItems.reduce(
    (sum, i) => sum + i.weight * i.quantity, 0
  );

  return {
    zoneWeights,
    zoneDetails,
    totalLoadoutWeight: Math.round(totalLoadoutWeight * 10) / 10,
    vehicleTotalWeight,
    gvwrPercent,
    isOverGvwr: gvwr > 0 && vehicleTotalWeight > gvwr,
    remainingPayloadLbs: gvwr > 0
      ? Math.round((gvwr - vehicleTotalWeight) * 10) / 10
      : 0,
    totalItems: loadoutItems.length,
    totalCriticalItems: loadoutItems.filter(i => i.critical).length,
    unassignedItems,
    unassignedWeightLbs: Math.round(unassignedWeightLbs * 10) / 10,
  };
}


// ═══════════════════════════════════════════════════════════════
// PHASE 5B — Vertical / Longitudinal Load Bias Awareness
// ═══════════════════════════════════════════════════════════════

/**
 * Classify a bias value into a severity level.
 */
function classifyBias(absValue: number, thresholds: [number, number, number]): BiasLevel {
  if (absValue >= thresholds[2]) return 'heavy';
  if (absValue >= thresholds[1]) return 'moderate';
  if (absValue >= thresholds[0]) return 'slight';
  return 'balanced';
}

/**
 * Compute longitudinal and vertical load bias from zone weights.
 *
 * Uses zone position estimates to determine where weight is concentrated.
 * Returns bias direction, severity, and normalized values for UI display.
 *
 * @param zoneWeightResult - Output from computeZoneWeightAggregation
 * @param containerZones - Vehicle's container zones (for label-based position estimation)
 * @param vehicleBaseline - Optional vehicle baseline for reference dimensions
 * @returns LoadBiasResult
 */
export function computeLoadBias(
  zoneWeightResult: ZoneWeightResult,
  containerZones: ContainerZone[],
  vehicleBaseline?: VehicleBaseline,
): LoadBiasResult {
  const baseline = vehicleBaseline || DEFAULT_VEHICLE_BASELINE;
  const { zoneWeights, totalLoadoutWeight } = zoneWeightResult;

  // Default result for no loadout
  if (totalLoadoutWeight <= 0) {
    return {
      longitudinalDirection: 'center',
      longitudinalLevel: 'balanced',
      longitudinalValue: 0,
      longitudinalNormalized: 0,
      verticalDirection: 'mid',
      verticalLevel: 'balanced',
      verticalCgInches: baseline.baseCgHeightIn,
      verticalNormalized: 0.5,
      overallRisk: 'low',
      summary: 'No loadout weight — baseline vehicle CG',
    };
  }

  // Compute weighted average position of loaded weight
  let sumWX = 0;
  let sumWZ = 0;
  let sumWY = 0;
  let totalW = 0;

  for (const zone of containerZones) {
    const w = zoneWeights[zone.id] || 0;
    if (w <= 0) continue;

    const pos = estimateZonePosition(zone.label);
    sumWX += w * pos.xIn;
    sumWZ += w * pos.zIn;
    sumWY += w * pos.yIn;
    totalW += w;
  }

  // Also account for unassigned items at a default position
  if (zoneWeightResult.unassignedWeightLbs > 0) {
    const uw = zoneWeightResult.unassignedWeightLbs;
    sumWX += uw * DEFAULT_ZONE_POSITION.xIn;
    sumWZ += uw * DEFAULT_ZONE_POSITION.zIn;
    sumWY += uw * DEFAULT_ZONE_POSITION.yIn;
    totalW += uw;
  }

  if (totalW <= 0) {
    return {
      longitudinalDirection: 'center',
      longitudinalLevel: 'balanced',
      longitudinalValue: 0,
      longitudinalNormalized: 0,
      verticalDirection: 'mid',
      verticalLevel: 'balanced',
      verticalCgInches: baseline.baseCgHeightIn,
      verticalNormalized: 0.5,
      overallRisk: 'low',
      summary: 'No measurable weight distribution',
    };
  }

  const loadCgX = sumWX / totalW;  // inches from rear axle
  const loadCgZ = sumWZ / totalW;  // inches from ground
  const loadCgY = sumWY / totalW;  // inches from centerline

  // ── Longitudinal Bias ──
  // Reference: rear axle = 0, front axle = wheelbase
  // Center of wheelbase = wheelbase / 2
  const wheelbaseCenter = baseline.wheelbaseIn / 2;
  const longitudinalOffset = loadCgX - wheelbaseCenter; // positive = forward, negative = rearward

  // Normalize to -1 (full rear) to +1 (full front)
  const halfWheelbase = baseline.wheelbaseIn / 2;
  const longitudinalNormalized = halfWheelbase > 0
    ? Math.max(-1, Math.min(1, longitudinalOffset / halfWheelbase))
    : 0;

  const longitudinalDirection: LoadBiasResult['longitudinalDirection'] =
    longitudinalOffset > 5 ? 'front' :
    longitudinalOffset < -5 ? 'rear' :
    'center';

  // Thresholds in inches: slight=10, moderate=25, heavy=40
  const longitudinalLevel = classifyBias(Math.abs(longitudinalOffset), [10, 25, 40]);

  // ── Vertical Bias ──
  // Combine base vehicle CG with loadout CG
  const combinedMass = baseline.curbWeightLbs + totalW;
  const combinedCgZ = combinedMass > 0
    ? (baseline.curbWeightLbs * baseline.baseCgHeightIn + totalW * loadCgZ) / combinedMass
    : baseline.baseCgHeightIn;

  // Normalize: 0 = ground, 1 = max roof height (~80 inches)
  const maxHeight = 80;
  const verticalNormalized = Math.max(0, Math.min(1, combinedCgZ / maxHeight));

  const verticalDirection: LoadBiasResult['verticalDirection'] =
    combinedCgZ > baseline.baseCgHeightIn + 8 ? 'high' :
    combinedCgZ < baseline.baseCgHeightIn - 5 ? 'low' :
    'mid';

  // Vertical bias severity based on CG rise above baseline
  const cgRise = combinedCgZ - baseline.baseCgHeightIn;
  const verticalLevel = classifyBias(Math.abs(cgRise), [3, 6, 12]);

  // ── Overall Risk Assessment ──
  const longScore = { balanced: 0, slight: 1, moderate: 2, heavy: 3 }[longitudinalLevel];
  const vertScore = { balanced: 0, slight: 1, moderate: 2, heavy: 3 }[verticalLevel];
  const combinedScore = longScore + vertScore;

  const overallRisk: LoadBiasResult['overallRisk'] =
    combinedScore >= 5 ? 'high' :
    combinedScore >= 3 ? 'elevated' :
    combinedScore >= 1 ? 'moderate' :
    'low';

  // ── Summary ──
  const parts: string[] = [];
  if (longitudinalLevel !== 'balanced') {
    parts.push(`${longitudinalLevel} ${longitudinalDirection} bias`);
  }
  if (verticalLevel !== 'balanced') {
    parts.push(`${verticalLevel} ${verticalDirection} CG`);
  }
  if (parts.length === 0) {
    parts.push('Balanced load distribution');
  }

  return {
    longitudinalDirection,
    longitudinalLevel,
    longitudinalValue: Math.round(longitudinalOffset * 10) / 10,
    longitudinalNormalized: Math.round(longitudinalNormalized * 100) / 100,
    verticalDirection,
    verticalLevel,
    verticalCgInches: Math.round(combinedCgZ * 10) / 10,
    verticalNormalized: Math.round(verticalNormalized * 100) / 100,
    overallRisk,
    summary: parts.join(' · '),
  };
}


// ═══════════════════════════════════════════════════════════════
// PHASE 5B (Extended) — Bias Profile from Zone Metadata
//
// Uses the Phase 5B zone metadata (verticalBias, longitudinalBias,
// lateralBias) from ContainerZone to compute proportional weight
// distribution scoring. No advanced physics — purely proportional.
// ═══════════════════════════════════════════════════════════════

/**
 * Simple weight distribution profile computed from zone bias metadata.
 *
 * Uses the verticalBias / longitudinalBias / lateralBias fields
 * on each ContainerZone to classify weight into buckets.
 *
 * This is a proportional-scoring approach (no physics engine).
 */
export interface BiasProfile {
  // ── Vertical Distribution ──
  /** Total weight in zones classified as verticalBias: "high" */
  highLoad: number;
  /** Total weight in zones classified as verticalBias: "mid" */
  midVerticalLoad: number;
  /** Total weight in zones classified as verticalBias: "low" */
  lowLoad: number;
  /** Percent of total weight in high zones (0–100) */
  highLoadPercent: number;
  /** Percent of total weight in low zones (0–100) */
  lowLoadPercent: number;

  // ── Longitudinal Distribution ──
  /** Total weight in zones classified as longitudinalBias: "front" */
  frontBiasWeight: number;
  /** Total weight in zones classified as longitudinalBias: "mid" */
  midLongitudinalWeight: number;
  /** Total weight in zones classified as longitudinalBias: "rear" */
  rearBiasWeight: number;
  /** Percent of total weight in front zones (0–100) */
  frontBiasPercent: number;
  /** Percent of total weight in rear zones (0–100) */
  rearBiasPercent: number;

  // ── Lateral Distribution ──
  /** Total weight in zones classified as lateralBias: "left" */
  leftWeight: number;
  /** Total weight in zones classified as lateralBias: "right" */
  rightWeight: number;
  /** Total weight in zones classified as lateralBias: "center" */
  centerWeight: number;

  // ── Totals ──
  /** Total loadout weight across all zones */
  totalWeight: number;
  /** Number of zones with weight > 0 */
  loadedZoneCount: number;
}

/**
 * Calculate proportional weight distribution using zone bias metadata.
 *
 * This is the Phase 5B metadata-driven approach:
 *   - Reads verticalBias, longitudinalBias, lateralBias from each zone
 *   - Sums weights by classification
 *   - Computes percent of high-weight / front-weight / rear-weight relative to total
 *
 * Uses resolveZoneBias() for backward compatibility with pre-Phase 5B zones.
 *
 * RULES:
 *   - Zones derive ONLY from containerZones parameter
 *   - No hardcoded container names
 *   - Missing zone items return 0 weight
 *   - No hooks inside this engine
 *
 * @param zoneWeights - Per-zone weight totals (from calculateZoneWeights)
 * @param containerZones - Vehicle's container zones with bias metadata
 * @returns BiasProfile — proportional weight distribution
 */
export function calculateBiasProfile(
  zoneWeights: Record<string, number>,
  containerZones: ContainerZone[],
): BiasProfile {
  // Initialize accumulators
  let highLoad = 0;
  let midVerticalLoad = 0;
  let lowLoad = 0;

  let frontBiasWeight = 0;
  let midLongitudinalWeight = 0;
  let rearBiasWeight = 0;

  let leftWeight = 0;
  let rightWeight = 0;
  let centerWeight = 0;

  let totalWeight = 0;
  let loadedZoneCount = 0;

  for (const zone of containerZones) {
    const w = zoneWeights[zone.id] || 0;
    if (w <= 0) continue;

    loadedZoneCount++;
    totalWeight += w;

    // Resolve bias (handles backward compat for pre-Phase 5B zones)
    const bias = resolveZoneBias(zone);

    // Vertical classification
    switch (bias.verticalBias) {
      case 'high': highLoad += w; break;
      case 'mid':  midVerticalLoad += w; break;
      case 'low':  lowLoad += w; break;
    }

    // Longitudinal classification
    switch (bias.longitudinalBias) {
      case 'front': frontBiasWeight += w; break;
      case 'mid':   midLongitudinalWeight += w; break;
      case 'rear':  rearBiasWeight += w; break;
    }

    // Lateral classification
    switch (bias.lateralBias) {
      case 'left':   leftWeight += w; break;
      case 'right':  rightWeight += w; break;
      case 'center': centerWeight += w; break;
    }
  }

  // Compute percentages (0–100), safe division
  const pct = (val: number) => totalWeight > 0
    ? Math.round((val / totalWeight) * 1000) / 10
    : 0;

  return {
    highLoad: Math.round(highLoad * 10) / 10,
    midVerticalLoad: Math.round(midVerticalLoad * 10) / 10,
    lowLoad: Math.round(lowLoad * 10) / 10,
    highLoadPercent: pct(highLoad),
    lowLoadPercent: pct(lowLoad),

    frontBiasWeight: Math.round(frontBiasWeight * 10) / 10,
    midLongitudinalWeight: Math.round(midLongitudinalWeight * 10) / 10,
    rearBiasWeight: Math.round(rearBiasWeight * 10) / 10,
    frontBiasPercent: pct(frontBiasWeight),
    rearBiasPercent: pct(rearBiasWeight),

    leftWeight: Math.round(leftWeight * 10) / 10,
    rightWeight: Math.round(rightWeight * 10) / 10,
    centerWeight: Math.round(centerWeight * 10) / 10,

    totalWeight: Math.round(totalWeight * 10) / 10,
    loadedZoneCount,
  };
}

/**
 * Get a human-readable summary of a BiasProfile.
 *
 * Example outputs:
 *   "62% rear · 48% high — rear-heavy, elevated CG"
 *   "Balanced distribution"
 *
 * @param profile - BiasProfile from calculateBiasProfile
 * @returns Human-readable summary string
 */
export function getBiasProfileSummary(profile: BiasProfile): string {
  if (profile.totalWeight <= 0) return 'No loadout weight';

  const parts: string[] = [];

  // Longitudinal summary
  if (profile.rearBiasPercent > 65) {
    parts.push(`${profile.rearBiasPercent}% rear`);
  } else if (profile.frontBiasPercent > 65) {
    parts.push(`${profile.frontBiasPercent}% front`);
  }

  // Vertical summary
  if (profile.highLoadPercent > 50) {
    parts.push(`${profile.highLoadPercent}% high`);
  } else if (profile.lowLoadPercent > 70) {
    parts.push(`${profile.lowLoadPercent}% low`);
  }

  if (parts.length === 0) return 'Balanced distribution';

  // Descriptive suffix
  const descriptors: string[] = [];
  if (profile.rearBiasPercent > 65) descriptors.push('rear-heavy');
  if (profile.frontBiasPercent > 65) descriptors.push('front-heavy');
  if (profile.highLoadPercent > 50) descriptors.push('elevated CG');
  if (profile.lowLoadPercent > 70) descriptors.push('low CG');

  return parts.join(' · ') + (descriptors.length > 0 ? ` — ${descriptors.join(', ')}` : '');
}

/**
 * Get a color for a BiasProfile based on risk level.
 *
 * Evaluates both vertical and longitudinal concentration.
 * High concentration in any direction = higher risk.
 */
export function getBiasProfileColor(profile: BiasProfile): string {
  if (profile.totalWeight <= 0) return '#66BB6A';

  // Risk factors
  const highRatio = profile.highLoadPercent;
  const rearRatio = profile.rearBiasPercent;
  const frontRatio = profile.frontBiasPercent;

  // Worst single-axis concentration
  const worstConcentration = Math.max(highRatio, rearRatio, frontRatio);

  if (worstConcentration > 80) return '#EF5350';   // red — extreme concentration
  if (worstConcentration > 65) return '#FFB74D';    // amber — significant bias
  if (worstConcentration > 50) return '#C48A2C';    // tactical amber — moderate
  return '#66BB6A';                                  // green — well distributed
}


// ═══════════════════════════════════════════════════════════════
// PHASE 5C — Attitude Monitor Integration
// ═══════════════════════════════════════════════════════════════

// ── Alert Thresholds ──────────────────────────────────────────
// These thresholds define when the Attitude Monitor shows
// subtle amber/red indicators for weight-derived signals.
//
// Amber = caution, operator should be aware
// Red = critical, immediate attention needed

/** Roof load % thresholds (highLoad / totalLoadoutWeight) */
export const ROOF_LOAD_AMBER_THRESHOLD = 35;   // > 35% → amber
export const ROOF_LOAD_RED_THRESHOLD = 50;      // > 50% → red

/** Rear bias % thresholds (rearBiasWeight / totalLoadoutWeight) */
export const REAR_BIAS_AMBER_THRESHOLD = 60;    // > 60% → amber
export const REAR_BIAS_RED_THRESHOLD = 70;       // > 70% → red

/** GVWR % thresholds */
export const GVWR_AMBER_THRESHOLD = 85;          // > 85% → amber
export const GVWR_RED_THRESHOLD = 100;            // >= 100% → red

/**
 * Alert severity for a single signal.
 * null = no alert (within normal range).
 */
export type AttitudeAlertSeverity = 'amber' | 'red' | null;

/**
 * Boolean warning flags for the Attitude Monitor.
 *
 * These are the primary integration point — the widget checks these
 * to decide whether to show subtle amber/red indicators.
 */
export interface AttitudeAlertFlags {
  /** True if roof load exceeds amber threshold (> 35%) */
  roofLoadWarning: boolean;
  /** True if rear bias exceeds amber threshold (> 60%) */
  rearBiasWarning: boolean;
  /** True if GVWR exceeds red threshold (>= 100%) */
  gvwrExceeded: boolean;
}

/**
 * Complete weight signal payload for the Attitude Monitor widget.
 *
 * Contains the three computed percentages, their alert severities,
 * and the boolean warning flags. Designed for injection into the
 * widget as a single optional prop.
 */
export interface AttitudeWeightSignals {
  // ── Computed Percentages ──
  /** Roof load % = highLoad / totalLoadoutWeight (0–100) */
  roofLoadPercent: number;
  /** Rear bias % = rearBiasWeight / totalLoadoutWeight (0–100) */
  rearBiasPercent: number;
  /** GVWR utilization % (0–100+) */
  gvwrPercent: number;

  // ── Per-Signal Severity ──
  /** Roof load alert severity: null | 'amber' | 'red' */
  roofLoadSeverity: AttitudeAlertSeverity;
  /** Rear bias alert severity: null | 'amber' | 'red' */
  rearBiasSeverity: AttitudeAlertSeverity;
  /** GVWR alert severity: null | 'amber' | 'red' */
  gvwrSeverity: AttitudeAlertSeverity;

  // ── Boolean Flags (spec requirement) ──
  /** Warning flags for quick boolean checks */
  flags: AttitudeAlertFlags;

  // ── Context ──
  /** Whether weight data is available (at least one zone has weight) */
  hasData: boolean;
  /** Total loadout weight in lbs */
  totalLoadoutWeight: number;
  /** Total vehicle weight in lbs */
  vehicleTotalWeight: number;
}

/**
 * Classify a single signal value against amber/red thresholds.
 */
function classifySignal(
  value: number,
  amberThreshold: number,
  redThreshold: number,
): AttitudeAlertSeverity {
  if (value >= redThreshold) return 'red';
  if (value > amberThreshold) return 'amber';
  return null;
}

/**
 * Compute attitude alert signals from a BiasProfile and GVWR data.
 *
 * This is the primary Phase 5C alert computation function.
 * Call from a memoized selector and pass the result as a prop
 * to the AttitudeMonitorWidget.
 *
 * @param biasProfile - Output from calculateBiasProfile()
 * @param gvwrPercent - GVWR utilization % from computeZoneWeightAggregation()
 * @param totalLoadoutWeight - Total loadout weight in lbs
 * @param vehicleTotalWeight - Total vehicle weight in lbs
 * @returns AttitudeWeightSignals for the Attitude Monitor widget
 */
export function computeAttitudeAlertSignals(
  biasProfile: BiasProfile,
  gvwrPercent: number,
  totalLoadoutWeight: number = 0,
  vehicleTotalWeight: number = 0,
): AttitudeWeightSignals {
  const hasData = biasProfile.totalWeight > 0;

  // Compute the three signal percentages
  const roofLoadPercent = hasData ? biasProfile.highLoadPercent : 0;
  const rearBiasPercent = hasData ? biasProfile.rearBiasPercent : 0;

  // Classify each signal
  const roofLoadSeverity = classifySignal(roofLoadPercent, ROOF_LOAD_AMBER_THRESHOLD, ROOF_LOAD_RED_THRESHOLD);
  const rearBiasSeverity = classifySignal(rearBiasPercent, REAR_BIAS_AMBER_THRESHOLD, REAR_BIAS_RED_THRESHOLD);
  const gvwrSeverity = classifySignal(gvwrPercent, GVWR_AMBER_THRESHOLD, GVWR_RED_THRESHOLD);

  // Boolean flags (spec requirement)
  const flags: AttitudeAlertFlags = {
    roofLoadWarning: roofLoadSeverity !== null,
    rearBiasWarning: rearBiasSeverity !== null,
    gvwrExceeded: gvwrPercent >= GVWR_RED_THRESHOLD,
  };

  return {
    roofLoadPercent: Math.round(roofLoadPercent * 10) / 10,
    rearBiasPercent: Math.round(rearBiasPercent * 10) / 10,
    gvwrPercent: Math.round(gvwrPercent * 10) / 10,
    roofLoadSeverity,
    rearBiasSeverity,
    gvwrSeverity,
    flags,
    hasData,
    totalLoadoutWeight,
    vehicleTotalWeight,
  };
}

/**
 * Get the display color for an attitude alert severity.
 */
export function getAttitudeAlertColor(severity: AttitudeAlertSeverity): string {
  switch (severity) {
    case 'red': return '#C0392B';
    case 'amber': return '#E67E22';
    case null: return '#4CAF50';
  }
}

/**
 * Get the label for an attitude alert severity.
 */
export function getAttitudeAlertLabel(severity: AttitudeAlertSeverity): string {
  switch (severity) {
    case 'red': return 'CRITICAL';
    case 'amber': return 'CAUTION';
    case null: return 'NOMINAL';
  }
}


/**
 * Convert zone weight aggregation into LoadModule[] for the stability engine.
 *
 * Each container zone with weight becomes a LoadModule with estimated
 * physical position. The stability engine uses these to compute CG
 * and rollover thresholds.
 *
 * @param zoneWeightResult - Output from computeZoneWeightAggregation
 * @param containerZones - Vehicle's container zones
 * @returns LoadModule[] for stabilityEngine.computeStability()
 */
export function buildStabilityModulesFromZoneWeights(
  zoneWeightResult: ZoneWeightResult,
  containerZones: ContainerZone[],
): LoadModule[] {
  const modules: LoadModule[] = [];

  for (const zone of containerZones) {
    const weight = zoneWeightResult.zoneWeights[zone.id] || 0;
    if (weight <= 0) continue;

    const pos = estimateZonePosition(zone.label);

    modules.push({
      zoneName: zone.label,
      weightLbs: weight,
      x: pos.xIn,
      y: pos.yIn,
      z: pos.zIn,
    });
  }

  // Include unassigned weight as a single module at default position
  if (zoneWeightResult.unassignedWeightLbs > 0) {
    modules.push({
      zoneName: 'Unassigned Items',
      weightLbs: zoneWeightResult.unassignedWeightLbs,
      x: DEFAULT_ZONE_POSITION.xIn,
      y: DEFAULT_ZONE_POSITION.yIn,
      z: DEFAULT_ZONE_POSITION.zIn,
    });
  }

  return modules;
}

/**
 * Compute attitude-aware stability from zone weights.
 *
 * This is the primary Phase 5C integration point — provides everything
 * the Attitude Monitor widget needs:
 *   - StabilityResult (roll/pitch thresholds, stability index)
 *   - LoadModule[] (for advanced CG visualization)
 *   - LoadBiasResult (for load distribution awareness)
 *   - ZoneWeightResult (for weight summary display)
 *   - AttitudeWeightSignals (for alert indicators) — NEW in Phase 5C
 *
 * @param loadoutItems - Normalized loadout items
 * @param containerZones - Vehicle's container zones
 * @param baseWeight - Vehicle base/curb weight in lbs
 * @param gvwr - Gross Vehicle Weight Rating in lbs
 * @param vehicleBaseline - Optional vehicle baseline dimensions
 * @param currentRollAngleDeg - Current roll angle for stability index
 * @returns AttitudeAwareResult (now includes weightSignals)
 */
export function computeAttitudeAwareStability(
  loadoutItems: WeightEngineItem[],
  containerZones: ContainerZone[],
  baseWeight: number = 0,
  gvwr: number = 0,
  vehicleBaseline?: VehicleBaseline,
  currentRollAngleDeg: number = 0,
): AttitudeAwareResult {
  const baseline = vehicleBaseline || DEFAULT_VEHICLE_BASELINE;

  // Phase 5A: Zone weight aggregation
  const zoneWeights = computeZoneWeightAggregation(
    loadoutItems,
    containerZones,
    baseWeight,
    gvwr,
  );

  // Phase 5C: Build stability modules
  const loadModules = buildStabilityModulesFromZoneWeights(zoneWeights, containerZones);

  // Phase 5B: Load bias
  const loadBias = computeLoadBias(zoneWeights, containerZones, baseline);

  // Phase 5B (Extended): Bias profile from zone metadata
  const biasProfile = calculateBiasProfile(zoneWeights.zoneWeights, containerZones);

  // Phase 5C: Attitude alert signals
  const weightSignals = computeAttitudeAlertSignals(
    biasProfile,
    zoneWeights.gvwrPercent,
    zoneWeights.totalLoadoutWeight,
    zoneWeights.vehicleTotalWeight,
  );

  // Determine if we have sufficient data for advanced mode
  const advancedEnabled = loadModules.length >= 2;

  // Compute stability
  const stability: StabilityResult = advancedEnabled
    ? computeStability(baseline, loadModules, currentRollAngleDeg)
    : computeSimplifiedStability(currentRollAngleDeg);

  return {
    stability,
    loadModules,
    loadBias,
    zoneWeights,
    advancedEnabled,
    weightSignals,
  };
}


// ═══════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get a color for a GVWR percentage value.
 */
export function getGvwrPercentColor(gvwrPercent: number): string {
  if (gvwrPercent > 100) return '#EF5350';   // red — over GVWR
  if (gvwrPercent > 90) return '#FFB74D';    // amber — near limit
  if (gvwrPercent > 75) return '#C48A2C';    // tactical amber
  return '#66BB6A';                           // green — good
}

/**
 * Get a label for a GVWR percentage value.
 */
export function getGvwrPercentLabel(gvwrPercent: number): string {
  if (gvwrPercent > 100) return 'OVER GVWR';
  if (gvwrPercent > 90) return 'NEAR LIMIT';
  if (gvwrPercent > 75) return 'MODERATE';
  return 'GOOD';
}

/**
 * Get a color for a load bias risk level.
 */
export function getLoadBiasColor(risk: LoadBiasResult['overallRisk']): string {
  switch (risk) {
    case 'high': return '#EF5350';
    case 'elevated': return '#FFB74D';
    case 'moderate': return '#C48A2C';
    case 'low': return '#66BB6A';
  }
}

/**
 * Get a color for a bias level.
 */
export function getBiasLevelColor(level: BiasLevel): string {
  switch (level) {
    case 'heavy': return '#EF5350';
    case 'moderate': return '#FFB74D';
    case 'slight': return '#C48A2C';
    case 'balanced': return '#66BB6A';
  }
}

/**
 * Format weight in lbs with optional unit suffix.
 */
export function formatWeight(lbs: number, showUnit: boolean = true): string {
  if (lbs >= 1000) {
    return `${(lbs / 1000).toFixed(1)}${showUnit ? 'k lbs' : 'k'}`;
  }
  return `${Math.round(lbs)}${showUnit ? ' lbs' : ''}`;
}

