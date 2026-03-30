/**
 * ECS Weight Dashboard Store
 *
 * Aggregation layer that combines:
 *   - weightEngine (CG calculation from vehicle config)
 *   - stabilityEngine (tilt risk from load distribution)
 *   - weightStore (per-zone weight tracking from loadout items)
 *
 * PHASE 6: ContainerZone-aware computation
 *   - Accepts ContainerZone[] from accessory framework
 *   - Uses matchStorageLocationToZone for accurate item→zone matching
 *   - Uses resolveZoneBias for spatial bias → CG position mapping
 *   - Per-container-zone weight distribution with bias metadata
 *
 * Provides:
 *   - Total vehicle weight (hardware + loadout)
 *   - Per-zone weight distribution with capacity limits
 *   - Center-of-gravity computation
 *   - Tilt risk warnings
 *   - Before/after comparison for item changes
 */

import {
  calculateCG,
  buildWeightModules,
  buildLoadoutWeightModules,
  getIntensityColor,
  getAxleLoadColor,
  type CGResult,
  type WeightModule,
  type LoadoutZoneWeight,
} from './weightEngine';

import {
  computeCG,
  computeStability,
  buildLoadModules,
  DEFAULT_VEHICLE_BASELINE,
  type VehicleBaseline,
  type LoadModule,
  type StabilityResult,
  type ZoneWeightData,
} from './stabilityEngine';

import {
  computeVehicleWeightSummary,
  computeZoneWeights,
  computeItemWeight,
  getWeightStatusColor,
  getWeightStatusLabel,
  zoneCapacityStore,
  type VehicleWeightSummary,
  type ZoneWeightSummary,
} from './weightStore';

import type { ContainerZone, VerticalBias, LongitudinalBias, LateralBias } from './accessoryFramework';
import { resolveZoneBias } from './accessoryFramework';
import { matchStorageLocationToZone } from './containerZoneLoader';

// ── Types ────────────────────────────────────────────────

export interface WeightDashboardData {
  // Total weight
  totalVehicleWeight: number;       // base vehicle + hardware + loadout
  hardwareWeight: number;           // from vehicle config modules
  loadoutWeight: number;            // from loadout items
  baseVehicleWeight: number;        // curb weight

  // CG from weightEngine
  cgResult: CGResult;

  // Stability from stabilityEngine
  stability: StabilityResult;

  // Per-zone breakdown
  zoneSummary: VehicleWeightSummary;

  // Zone limit warnings
  zoneWarnings: ZoneWarning[];

  // Tilt risk
  tiltRisk: TiltRisk;

  // Axle loads
  frontAxleLoad: number;
  rearAxleLoad: number;
  frontAxlePercent: number;
  rearAxlePercent: number;
}

export interface ZoneWarning {
  zoneId: string;
  zoneName: string;
  currentWeight: number;
  capacityLbs: number;
  utilizationPct: number;
  severity: 'ok' | 'warning' | 'critical' | 'overweight';
  color: string;
}

export interface TiltRisk {
  level: 'low' | 'moderate' | 'high' | 'critical';
  color: string;
  label: string;
  rollAngleLimit: number;
  pitchAngleLimit: number;
  stabilityIndex: number;
  cgHeight: number;
  lateralOffset: number;
  recommendations: string[];
}

export interface WeightComparison {
  before: WeightSnapshot;
  after: WeightSnapshot;
  delta: WeightDelta;
}

export interface WeightSnapshot {
  totalWeight: number;
  cgX: number;
  cgZ: number;
  frontAxlePct: number;
  rearAxlePct: number;
  stabilityIndex: number;
  zoneWeights: Record<string, number>;
}

export interface WeightDelta {
  weightChange: number;
  cgXShift: number;
  cgZShift: number;
  frontAxleChange: number;
  rearAxleChange: number;
  stabilityChange: number;
  impactLevel: 'negligible' | 'minor' | 'moderate' | 'significant';
  impactColor: string;
}

// ── Default zone definitions for dashboard ───────────────

const DEFAULT_DASHBOARD_ZONES = [
  { id: 'front', name: 'Front / Cab', zone_type: 'area' },
  { id: 'mid', name: 'Mid / Roof', zone_type: 'rack' },
  { id: 'rear', name: 'Rear / Bed', zone_type: 'area' },
  { id: 'drawer', name: 'Drawers', zone_type: 'drawer' },
  { id: 'hitch', name: 'Hitch', zone_type: 'hitch' },
];


// ═══════════════════════════════════════════════════════════════
// PHASE 6 — Spatial Bias → CG Position Mapping
// ═══════════════════════════════════════════════════════════════

/**
 * Map verticalBias to normalized Z coordinate (0=ground, 1=roof).
 *
 *   high → 0.85 (roof-level: RTT, cab rack, roof rack)
 *   mid  → 0.45 (bed-level: fridge, interior storage)
 *   low  → 0.22 (undercarriage: drawers, water tank, battery)
 */
function verticalBiasToZ(bias: VerticalBias): number {
  switch (bias) {
    case 'high': return 0.85;
    case 'mid':  return 0.45;
    case 'low':  return 0.22;
    default:     return 0.45;
  }
}

/**
 * Map longitudinalBias to normalized X coordinate (0=front, 1=rear).
 *
 *   front → 0.30 (cab area)
 *   mid   → 0.50 (center of vehicle)
 *   rear  → 0.72 (bed area)
 */
function longitudinalBiasToX(bias: LongitudinalBias): number {
  switch (bias) {
    case 'front': return 0.30;
    case 'mid':   return 0.50;
    case 'rear':  return 0.72;
    default:      return 0.50;
  }
}

/**
 * Map verticalBias to stabilityEngine Z height (inches from ground).
 *
 *   high → 72" (roof-level)
 *   mid  → 36" (bed-level)
 *   low  → 22" (undercarriage)
 */
function verticalBiasToZInches(bias: VerticalBias): number {
  switch (bias) {
    case 'high': return 72;
    case 'mid':  return 36;
    case 'low':  return 22;
    default:     return 36;
  }
}

/**
 * Map longitudinalBias to stabilityEngine X position (inches from rear axle).
 *
 *   front → 80" forward of rear axle (cab area)
 *   mid   → 40" forward of rear axle (center)
 *   rear  → -10" behind rear axle (bed area)
 */
function longitudinalBiasToXInches(bias: LongitudinalBias): number {
  switch (bias) {
    case 'front': return 80;
    case 'mid':   return 40;
    case 'rear':  return -10;
    default:      return 40;
  }
}

/**
 * Map lateralBias to stabilityEngine Y position (inches from centerline).
 */
function lateralBiasToYInches(bias: LateralBias): number {
  switch (bias) {
    case 'left':   return -18;
    case 'right':  return 18;
    case 'center': return 0;
    default:       return 0;
  }
}


// ═══════════════════════════════════════════════════════════════
// PHASE 6 — ContainerZone-Aware Zone Weight Computation
// ═══════════════════════════════════════════════════════════════

/**
 * Build LoadoutZoneWeight[] from loadout items matched to ContainerZones.
 * Uses matchStorageLocationToZone for accurate item→zone matching,
 * and resolveZoneBias for spatial bias → CG position mapping.
 */
function buildZoneWeightsFromContainerZones(
  items: { storage_location: string | null; weight_lbs: number | null; quantity: number }[],
  containerZones: ContainerZone[],
): LoadoutZoneWeight[] {
  // Accumulate weight per container zone
  const zoneWeightMap: Record<string, number> = {};
  for (const zone of containerZones) {
    zoneWeightMap[zone.id] = 0;
  }

  for (const item of items) {
    const matched = matchStorageLocationToZone(containerZones, item.storage_location);
    if (matched) {
      zoneWeightMap[matched.id] += computeItemWeight(item);
    }
  }

  return containerZones.map(zone => {
    const bias = resolveZoneBias(zone);
    return {
      zoneId: zone.id,
      zoneName: zone.label,
      weightLbs: zoneWeightMap[zone.id] || 0,
      posX: longitudinalBiasToX(bias.longitudinalBias),
      posZ: verticalBiasToZ(bias.verticalBias),
    };
  });
}

/**
 * Build stabilityEngine LoadModule[] from items matched to ContainerZones.
 * Uses spatial bias metadata for accurate position estimation.
 */
function buildStabilityModulesFromContainerZones(
  items: { storage_location: string | null; weight_lbs: number | null; quantity: number }[],
  containerZones: ContainerZone[],
): LoadModule[] {
  const zoneWeightMap: Record<string, number> = {};
  for (const zone of containerZones) {
    zoneWeightMap[zone.id] = 0;
  }

  for (const item of items) {
    const matched = matchStorageLocationToZone(containerZones, item.storage_location);
    if (matched) {
      zoneWeightMap[matched.id] += computeItemWeight(item);
    }
  }

  return containerZones
    .filter(zone => zoneWeightMap[zone.id] > 0)
    .map(zone => {
      const bias = resolveZoneBias(zone);
      return {
        zoneName: zone.label,
        weightLbs: zoneWeightMap[zone.id],
        x: longitudinalBiasToXInches(bias.longitudinalBias),
        y: lateralBiasToYInches(bias.lateralBias),
        z: verticalBiasToZInches(bias.verticalBias),
      };
    });
}

/**
 * Compute per-ContainerZone weight summaries for ZoneWeightBars.
 * Uses matchStorageLocationToZone for accurate item matching.
 */
export function computeContainerZoneWeightSummary(
  containerZones: ContainerZone[],
  items: { storage_location: string | null; weight_lbs: number | null; quantity: number }[],
): VehicleWeightSummary {
  const zoneSummaries: ZoneWeightSummary[] = containerZones.map(zone => {
    const zoneItems = items.filter(item => {
      const matched = matchStorageLocationToZone(containerZones, item.storage_location);
      return matched?.id === zone.id;
    });

    const totalWeightLbs = zoneItems.reduce((sum, item) => sum + computeItemWeight(item), 0);
    const capacityLbs = zoneCapacityStore.getCapacity(zone.id, zone.label, undefined);
    const utilizationPct = capacityLbs > 0 ? Math.round((totalWeightLbs / capacityLbs) * 100) : 0;

    return {
      zoneId: zone.id,
      zoneName: zone.label,
      totalWeightLbs: Math.round(totalWeightLbs * 10) / 10,
      capacityLbs,
      itemCount: zoneItems.length,
      utilizationPct,
      isOverweight: totalWeightLbs > capacityLbs,
      isWarning: !!(totalWeightLbs > capacityLbs * 0.8 && totalWeightLbs <= capacityLbs),
    };
  });

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


// ── Compute Dashboard Data ───────────────────────────────

export function computeWeightDashboard(
  wizardSelections: Record<string, string>,
  loadoutItems: { storage_location: string | null; weight_lbs: number | null; quantity: number }[],
  vehicleZones?: { id: string; name: string; zone_type?: string }[],
  vehicleBaseline?: VehicleBaseline,
  containerZones?: ContainerZone[],
): WeightDashboardData {
  const baseline = vehicleBaseline || DEFAULT_VEHICLE_BASELINE;
  const hasContainerZones = containerZones && containerZones.length > 0;
  const zones = vehicleZones && vehicleZones.length > 0 ? vehicleZones : DEFAULT_DASHBOARD_ZONES;

  // 1. Hardware weight from vehicle config
  const hardwareModules = buildWeightModules(wizardSelections);
  const hardwareWeight = hardwareModules
    .filter(m => m.id !== 'base_vehicle')
    .reduce((sum, m) => sum + m.mass, 0);
  const baseVehicleWeight = baseline.curbWeightLbs;

  // 2. Loadout weight from items
  const loadoutWeight = loadoutItems.reduce((sum, item) => sum + computeItemWeight(item), 0);

  // 3. Total vehicle weight
  const totalVehicleWeight = baseVehicleWeight + hardwareWeight + loadoutWeight;

  // 4. Build loadout zone weights for CG calculation
  //    PHASE 6: Use ContainerZone spatial bias when available
  const zoneWeightsForCG: LoadoutZoneWeight[] = hasContainerZones
    ? buildZoneWeightsFromContainerZones(loadoutItems, containerZones)
    : buildZoneWeightsFromItems(loadoutItems, zones);

  // 5. CG from weightEngine
  const cgResult = calculateCG(wizardSelections, zoneWeightsForCG);

  // 6. Stability from stabilityEngine
  //    PHASE 6: Use ContainerZone bias-derived positions when available
  let loadModules: LoadModule[];
  if (hasContainerZones) {
    loadModules = buildStabilityModulesFromContainerZones(loadoutItems, containerZones);
  } else {
    const zoneWeightData: ZoneWeightData[] = zones.map(z => {
      const zoneItems = loadoutItems.filter(item =>
        item.storage_location?.toLowerCase().includes(z.name.toLowerCase())
      );
      const totalWeightLbs = zoneItems.reduce((sum, item) => sum + computeItemWeight(item), 0);
      return { zoneName: z.name, totalWeightLbs };
    });
    loadModules = buildLoadModules(zoneWeightData);
  }
  const stability = computeStability(baseline, loadModules, 0);

  // 7. Per-zone breakdown
  //    PHASE 6: Use ContainerZone-aware summary when available
  const zoneSummary = hasContainerZones
    ? computeContainerZoneWeightSummary(containerZones, loadoutItems)
    : computeVehicleWeightSummary(zones, loadoutItems);

  // 8. Zone warnings
  const zoneWarnings = computeZoneWarnings(zoneSummary);

  // 9. Tilt risk
  const tiltRisk = computeTiltRisk(stability, cgResult);

  // 10. Axle loads
  const frontAxleLoad = Math.round(totalVehicleWeight * (cgResult.frontAxlePercent / 100));
  const rearAxleLoad = Math.round(totalVehicleWeight * (cgResult.rearAxlePercent / 100));

  return {
    totalVehicleWeight: Math.round(totalVehicleWeight),
    hardwareWeight: Math.round(hardwareWeight),
    loadoutWeight: Math.round(loadoutWeight * 10) / 10,
    baseVehicleWeight,
    cgResult,
    stability,
    zoneSummary,
    zoneWarnings,
    tiltRisk,
    frontAxleLoad,
    rearAxleLoad,
    frontAxlePercent: cgResult.frontAxlePercent,
    rearAxlePercent: cgResult.rearAxlePercent,
  };
}

// ── Build zone weights from loadout items (legacy fallback) ──

function buildZoneWeightsFromItems(
  items: { storage_location: string | null; weight_lbs: number | null; quantity: number }[],
  zones: { id: string; name: string; zone_type?: string }[],
): LoadoutZoneWeight[] {
  return zones.map(zone => {
    const zoneItems = items.filter(item =>
      item.storage_location?.toLowerCase().includes(zone.name.toLowerCase())
    );
    const weightLbs = zoneItems.reduce((sum, item) => sum + computeItemWeight(item), 0);

    // Estimate position based on zone name
    let posX = 0.5;
    let posZ = 0.3;
    const name = zone.name.toLowerCase();

    if (name.includes('front') || name.includes('cab')) { posX = 0.30; posZ = 0.35; }
    else if (name.includes('roof') || name.includes('rack')) { posX = 0.42; posZ = 0.85; }
    else if (name.includes('rear') || name.includes('bed')) { posX = 0.72; posZ = 0.35; }
    else if (name.includes('drawer')) { posX = 0.72; posZ = 0.22; }
    else if (name.includes('hitch')) { posX = 0.98; posZ = 0.28; }

    return {
      zoneId: zone.id,
      zoneName: zone.name,
      weightLbs,
      posX,
      posZ,
    };
  });
}

// ── Zone Warnings ────────────────────────────────────────

function computeZoneWarnings(summary: VehicleWeightSummary): ZoneWarning[] {
  return summary.zones.map(zone => {
    let severity: ZoneWarning['severity'] = 'ok';
    if (zone.utilizationPct > 100) severity = 'overweight';
    else if (zone.utilizationPct > 90) severity = 'critical';
    else if (zone.utilizationPct > 80) severity = 'warning';

    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      currentWeight: zone.totalWeightLbs,
      capacityLbs: zone.capacityLbs,
      utilizationPct: zone.utilizationPct,
      severity,
      color: getWeightStatusColor(zone.utilizationPct),
    };
  });
}

// ── Tilt Risk ────────────────────────────────────────────

function computeTiltRisk(stability: StabilityResult, cgResult: CGResult): TiltRisk {
  const idx = stability.stabilityIndex;
  const recommendations: string[] = [];

  let level: TiltRisk['level'] = 'low';
  let color = '#66BB6A';
  let label = 'STABLE';

  if (idx >= 90) {
    level = 'critical';
    color = '#EF5350';
    label = 'CRITICAL RISK';
    recommendations.push('Immediately reduce roof-mounted weight');
    recommendations.push('Lower center of gravity by moving heavy items to drawers');
    recommendations.push('Avoid steep side-slopes and off-camber terrain');
  } else if (idx >= 75) {
    level = 'high';
    color = '#FF9800';
    label = 'HIGH RISK';
    recommendations.push('Consider redistributing weight from roof to lower zones');
    recommendations.push('Reduce speed on off-camber sections');
  } else if (idx >= 50) {
    level = 'moderate';
    color = '#C48A2C';
    label = 'MODERATE';
    recommendations.push('Weight distribution is acceptable but could be improved');
    recommendations.push('Monitor stability on steep terrain');
  } else {
    recommendations.push('Weight distribution is within safe parameters');
  }

  // Check rear bias
  if (cgResult.rearAxlePercent > 70) {
    recommendations.push('Rear-heavy: consider moving items forward');
  }

  // Check high CG
  if (stability.cg.zCg > 35) {
    recommendations.push('High center of gravity detected — minimize roof loads');
  }

  return {
    level,
    color,
    label,
    rollAngleLimit: Math.round(stability.criticalRollAngleDeg * 10) / 10,
    pitchAngleLimit: Math.round(stability.criticalPitchAngleDeg * 10) / 10,
    stabilityIndex: Math.round(stability.stabilityIndex),
    cgHeight: Math.round(stability.cg.zCg * 10) / 10,
    lateralOffset: Math.round(stability.cg.yCg * 10) / 10,
    recommendations,
  };
}

// ── Before/After Comparison ──────────────────────────────

export function computeWeightComparison(
  wizardSelections: Record<string, string>,
  itemsBefore: { storage_location: string | null; weight_lbs: number | null; quantity: number }[],
  itemsAfter: { storage_location: string | null; weight_lbs: number | null; quantity: number }[],
  vehicleZones?: { id: string; name: string; zone_type?: string }[],
  containerZones?: ContainerZone[],
): WeightComparison {
  const zones = vehicleZones && vehicleZones.length > 0 ? vehicleZones : DEFAULT_DASHBOARD_ZONES;

  const before = computeSnapshot(wizardSelections, itemsBefore, zones, containerZones);
  const after = computeSnapshot(wizardSelections, itemsAfter, zones, containerZones);

  const weightChange = after.totalWeight - before.totalWeight;
  const cgXShift = after.cgX - before.cgX;
  const cgZShift = after.cgZ - before.cgZ;
  const frontAxleChange = after.frontAxlePct - before.frontAxlePct;
  const rearAxleChange = after.rearAxlePct - before.rearAxlePct;
  const stabilityChange = after.stabilityIndex - before.stabilityIndex;

  // Determine impact level
  const absWeight = Math.abs(weightChange);
  let impactLevel: WeightDelta['impactLevel'] = 'negligible';
  let impactColor = '#66BB6A';

  if (absWeight > 200 || Math.abs(stabilityChange) > 15) {
    impactLevel = 'significant';
    impactColor = '#EF5350';
  } else if (absWeight > 100 || Math.abs(stabilityChange) > 8) {
    impactLevel = 'moderate';
    impactColor = '#FF9800';
  } else if (absWeight > 25 || Math.abs(stabilityChange) > 3) {
    impactLevel = 'minor';
    impactColor = '#C48A2C';
  }

  return {
    before,
    after,
    delta: {
      weightChange: Math.round(weightChange * 10) / 10,
      cgXShift: Math.round(cgXShift * 1000) / 1000,
      cgZShift: Math.round(cgZShift * 1000) / 1000,
      frontAxleChange: Math.round(frontAxleChange),
      rearAxleChange: Math.round(rearAxleChange),
      stabilityChange: Math.round(stabilityChange),
      impactLevel,
      impactColor,
    },
  };
}

function computeSnapshot(
  wizardSelections: Record<string, string>,
  items: { storage_location: string | null; weight_lbs: number | null; quantity: number }[],
  zones: { id: string; name: string; zone_type?: string }[],
  containerZones?: ContainerZone[],
): WeightSnapshot {
  const hasContainerZones = containerZones && containerZones.length > 0;

  const zoneWeightsForCG = hasContainerZones
    ? buildZoneWeightsFromContainerZones(items, containerZones)
    : buildZoneWeightsFromItems(items, zones);
  const cgResult = calculateCG(wizardSelections, zoneWeightsForCG);
  const loadoutWeight = items.reduce((sum, item) => sum + computeItemWeight(item), 0);
  const totalWeight = DEFAULT_VEHICLE_BASELINE.curbWeightLbs + cgResult.totalMass - 6500 + loadoutWeight;

  const zoneWeights: Record<string, number> = {};

  if (hasContainerZones) {
    for (const zone of containerZones) {
      const zoneItems = items.filter(item => {
        const matched = matchStorageLocationToZone(containerZones, item.storage_location);
        return matched?.id === zone.id;
      });
      zoneWeights[zone.id] = zoneItems.reduce((sum, item) => sum + computeItemWeight(item), 0);
    }
  } else {
    for (const zone of zones) {
      const zoneItems = items.filter(item =>
        item.storage_location?.toLowerCase().includes(zone.name.toLowerCase())
      );
      zoneWeights[zone.id] = zoneItems.reduce((sum, item) => sum + computeItemWeight(item), 0);
    }
  }

  let loadModules: LoadModule[];
  if (hasContainerZones) {
    loadModules = buildStabilityModulesFromContainerZones(items, containerZones);
  } else {
    loadModules = buildLoadModules(zones.map(z => ({
      zoneName: z.name,
      totalWeightLbs: zoneWeights[z.id] || 0,
    })));
  }
  const stability = computeStability(DEFAULT_VEHICLE_BASELINE, loadModules, 0);

  return {
    totalWeight: Math.round(totalWeight),
    cgX: cgResult.xCG,
    cgZ: cgResult.zCG,
    frontAxlePct: cgResult.frontAxlePercent,
    rearAxlePct: cgResult.rearAxlePercent,
    stabilityIndex: Math.round(stability.stabilityIndex),
    zoneWeights,
  };
}

