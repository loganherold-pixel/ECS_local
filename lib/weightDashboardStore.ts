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
import {
  FLEET_LOAD_ZONES,
  type FleetLoadZone,
  type FleetWeightResult,
} from './fleet/fleetPremiumDomain';

// ── Types ────────────────────────────────────────────────

export interface WeightDashboardData {
  vehicleType?: string | null;

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

  // Real Fleet operating-weight metadata when sourced from the current Fleet model
  operatingWeightMeta?: {
    gvwrLb: number | null;
    payloadRemainingLb: number | null;
    gvwrUsagePct: number | null;
    confidenceScore: number;
    sourceLabels: string[];
    partialDataReasons: string[];
    warnings: string[];
    centerOfGravity?: FleetDashboardCenterOfGravity;
  };
}

export type FleetCenterOfGravityDataQuality =
  | 'complete'
  | 'partial'
  | 'missing_item_weights'
  | 'missing_zone_metadata';

export interface FleetDashboardCenterOfGravity {
  x: number;
  y: number;
  z: number;
  totalKnownWeightLb: number;
  dataQuality: FleetCenterOfGravityDataQuality;
  warnings: string[];
  missingWeightCount: number;
  missingZoneMetadataCount: number;
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

const FRONT_AXLE_X = 0.22;
const REAR_AXLE_X = 0.72;
const WHEELBASE = REAR_AXLE_X - FRONT_AXLE_X;

const FLEET_ZONE_POSITION: Record<FleetLoadZone, {
  label: string;
  x: number;
  y: number;
  z: number;
  xIn: number;
  zIn: number;
  yIn?: number;
  moduleZone: WeightModule['zone'];
}> = {
  frontLow: { label: 'Front Low', x: 0.26, y: 0.50, z: 0.20, xIn: 86, zIn: 20, moduleZone: 'front' },
  rearLow: { label: 'Rear Low', x: 0.78, y: 0.50, z: 0.22, xIn: -16, zIn: 22, moduleZone: 'rear' },
  bedLow: { label: 'Bed Low', x: 0.70, y: 0.50, z: 0.25, xIn: -4, zIn: 24, moduleZone: 'rear' },
  bedHigh: { label: 'Bed High', x: 0.70, y: 0.50, z: 0.62, xIn: -4, zIn: 54, moduleZone: 'rear' },
  roof: { label: 'Roof', x: 0.48, y: 0.50, z: 0.86, xIn: 42, zIn: 72, moduleZone: 'mid' },
  cab: { label: 'Cab', x: 0.36, y: 0.50, z: 0.42, xIn: 76, zIn: 36, moduleZone: 'front' },
  underbody: { label: 'Underbody', x: 0.50, y: 0.50, z: 0.16, xIn: 36, zIn: 16, moduleZone: 'mid' },
  hitch: { label: 'Hitch', x: 0.94, y: 0.50, z: 0.22, xIn: -36, zIn: 22, moduleZone: 'rear' },
  trailer: { label: 'Trailer', x: 0.98, y: 0.50, z: 0.32, xIn: -60, zIn: 32, moduleZone: 'rear' },
};


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
      posY: bias.lateralBias === 'left' ? 0.28 : bias.lateralBias === 'right' ? 0.72 : 0.5,
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

function clampUnit(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function classifyFleetModuleIntensity(weightLbs: number): WeightModule['intensity'] {
  if (weightLbs >= 500) return 'excessive';
  if (weightLbs >= 150) return 'heavy';
  if (weightLbs >= 50) return 'moderate';
  return 'light';
}

function normalizedBaseXFromBaseline(baseline: VehicleBaseline): number {
  if (baseline.wheelbaseIn <= 0) return 0.42;
  return clampUnit(REAR_AXLE_X - (baseline.baseCgXIn / baseline.wheelbaseIn) * WHEELBASE, 0.42);
}

function normalizedBaseZFromBaseline(baseline: VehicleBaseline): number {
  return clampUnit(baseline.baseCgHeightIn / 84, 0.25);
}

function buildFleetWeightModules(
  weightResult: FleetWeightResult,
  baseline: VehicleBaseline,
): WeightModule[] {
  const modules: WeightModule[] = [];
  const baseWeight = Math.max(0, weightResult.baseNetWeight.lbs);

  if (baseWeight > 0) {
    modules.push({
      id: 'base_vehicle',
      label: weightResult.baseNetWeight.sourceLabel ?? 'Base vehicle',
      mass: baseWeight,
      x: normalizedBaseXFromBaseline(baseline),
      y: 0.5,
      z: normalizedBaseZFromBaseline(baseline),
      zone: 'mid',
      intensity: classifyFleetModuleIntensity(baseWeight),
      source: 'hardware',
    });
  }

  for (const zone of FLEET_LOAD_ZONES) {
    const zoneResult = weightResult.zoneWeights[zone];
    const totalWeight = Math.max(0, zoneResult.totalWeight.lbs);
    if (totalWeight <= 0) continue;
    const position = FLEET_ZONE_POSITION[zone];
    modules.push({
      id: `fleet_${zone}`,
      label: position.label,
      mass: totalWeight,
      x: position.x,
      y: position.y,
      z: position.z,
      zone: position.moduleZone,
      intensity: classifyFleetModuleIntensity(totalWeight),
      source: zoneResult.accessoryWeight.lbs > 0 && zoneResult.loadoutWeight.lbs <= 0 ? 'hardware' : 'loadout',
    });
  }

  return modules;
}

function buildFleetStabilityModules(weightResult: FleetWeightResult): LoadModule[] {
  return FLEET_LOAD_ZONES
    .map((zone) => {
      const zoneResult = weightResult.zoneWeights[zone];
      const totalWeight = Math.max(0, zoneResult.totalWeight.lbs);
      const position = FLEET_ZONE_POSITION[zone];
      return {
        zoneName: position.label,
        weightLbs: totalWeight,
        x: position.xIn,
        y: position.yIn ?? 0,
        z: position.zIn,
      };
    })
    .filter((module) => module.weightLbs > 0);
}

function computeCgFromFleetModules(modules: WeightModule[]): CGResult {
  const totalMass = modules.reduce((sum, module) => sum + Math.max(0, module.mass), 0);
  if (totalMass <= 0) {
    return {
      xCG: 0.45,
      yCG: 0.5,
      zCG: 0.25,
      totalMass: 0,
      frontAxlePercent: 50,
      rearAxlePercent: 50,
      stability: 'balanced',
      modules: [],
    };
  }

  const xCG = modules.reduce((sum, module) => sum + module.mass * module.x, 0) / totalMass;
  const yCG = modules.reduce((sum, module) => sum + module.mass * (module.y ?? 0.5), 0) / totalMass;
  const zCG = modules.reduce((sum, module) => sum + module.mass * module.z, 0) / totalMass;
  const rearLoadFraction = Math.max(0, Math.min(1, (xCG - FRONT_AXLE_X) / WHEELBASE));
  const rearAxlePercent = Math.round(rearLoadFraction * 100);
  const frontAxlePercent = Math.round((1 - rearLoadFraction) * 100);
  const stability: CGResult['stability'] =
    rearAxlePercent > 75 ? 'extreme_rear' :
    rearAxlePercent > 65 ? 'moderate_rear' :
    'balanced';

  return {
    xCG,
    yCG,
    zCG,
    totalMass: Math.round(totalMass * 10) / 10,
    frontAxlePercent,
    rearAxlePercent,
    stability,
    modules: modules.filter((module) => module.id !== 'base_vehicle'),
  };
}

function buildFleetZoneSummary(weightResult: FleetWeightResult): VehicleWeightSummary {
  const zones: ZoneWeightSummary[] = FLEET_LOAD_ZONES.map((zone) => {
    const zoneResult = weightResult.zoneWeights[zone];
    const totalWeightLbs = Math.round(zoneResult.totalWeight.lbs * 10) / 10;
    return {
      zoneId: zone,
      zoneName: FLEET_ZONE_POSITION[zone].label,
      totalWeightLbs,
      capacityLbs: 0,
      itemCount: totalWeightLbs > 0 ? 1 : 0,
      utilizationPct: 0,
      isOverweight: false,
      isWarning: false,
    };
  });

  return {
    totalLoadoutWeightLbs: Math.round(weightResult.activeLoadoutWeight.lbs * 10) / 10,
    totalCapacityLbs: 0,
    zones,
    overweightZones: [],
    warningZones: [],
    itemsWithWeight: zones.filter((zone) => zone.totalWeightLbs > 0).length,
    itemsWithoutWeight: 0,
    totalItems: zones.filter((zone) => zone.totalWeightLbs > 0).length,
  };
}

function buildFleetPartialDataReasons(weightResult: FleetWeightResult): string[] {
  const reasons = [...weightResult.warnings];
  if (weightResult.baseNetWeight.source === 'unknown' || weightResult.baseNetWeight.confidence <= 0) {
    reasons.push('Base vehicle weight is unavailable.');
  }
  if (weightResult.gvwr == null) {
    reasons.push('GVWR is unavailable, so payload margin cannot be confirmed.');
  }
  if (weightResult.baseNetWeight.source === 'ecs_default' || weightResult.baseNetWeight.confidence < 75) {
    reasons.push('Base vehicle weight is estimated; verify with manufacturer data or a scale ticket.');
  }
  if (weightResult.installedAccessoryWeight.confidence < 75 && weightResult.installedAccessoryWeight.lbs > 0) {
    reasons.push('Some installed accessory weights are estimated.');
  }
  if (weightResult.activeLoadoutWeight.confidence < 75 && weightResult.activeLoadoutWeight.lbs > 0) {
    reasons.push('Some loadout item weights are estimated or user-entered.');
  }
  return Array.from(new Set(reasons));
}

export function computeWeightDashboardFromFleetWeightResult(
  weightResult: FleetWeightResult,
  vehicleBaseline?: VehicleBaseline,
  centerOfGravity?: FleetDashboardCenterOfGravity,
): WeightDashboardData {
  const baseline = {
    ...DEFAULT_VEHICLE_BASELINE,
    ...(vehicleBaseline ?? {}),
    curbWeightLbs: Math.max(0, vehicleBaseline?.curbWeightLbs ?? weightResult.baseNetWeight.lbs),
  };
  const modules = buildFleetWeightModules(weightResult, baseline);
  const rawCgResult = computeCgFromFleetModules(modules);
  const cgResult = centerOfGravity
    ? {
        ...rawCgResult,
        xCG: centerOfGravity.x,
        yCG: centerOfGravity.y,
        zCG: centerOfGravity.z,
        totalMass: centerOfGravity.totalKnownWeightLb || rawCgResult.totalMass,
        frontAxlePercent: Math.round((1 - Math.max(0, Math.min(1, (centerOfGravity.x - FRONT_AXLE_X) / WHEELBASE))) * 100),
        rearAxlePercent: Math.round(Math.max(0, Math.min(1, (centerOfGravity.x - FRONT_AXLE_X) / WHEELBASE)) * 100),
        stability:
          Math.round(Math.max(0, Math.min(1, (centerOfGravity.x - FRONT_AXLE_X) / WHEELBASE)) * 100) > 75
            ? 'extreme_rear' as const
            : Math.round(Math.max(0, Math.min(1, (centerOfGravity.x - FRONT_AXLE_X) / WHEELBASE)) * 100) > 65
              ? 'moderate_rear' as const
              : 'balanced' as const,
      }
    : rawCgResult;
  const stability = computeStability(baseline, buildFleetStabilityModules(weightResult), 0);
  const zoneSummary = buildFleetZoneSummary(weightResult);
  const zoneWarnings = computeZoneWarnings(zoneSummary);
  const totalVehicleWeight = weightResult.operatingWeight.lbs;
  const frontAxleLoad = Math.round(totalVehicleWeight * (cgResult.frontAxlePercent / 100));
  const rearAxleLoad = Math.round(totalVehicleWeight * (cgResult.rearAxlePercent / 100));
  const sourceLabels = [
    weightResult.baseNetWeight.sourceLabel,
    weightResult.installedAccessoryWeight.sourceLabel,
    weightResult.activeLoadoutWeight.sourceLabel,
    weightResult.gvwr?.sourceLabel,
  ].filter((label): label is string => Boolean(label));

  return {
    totalVehicleWeight,
    hardwareWeight: weightResult.installedAccessoryWeight.lbs,
    loadoutWeight: weightResult.activeLoadoutWeight.lbs,
    baseVehicleWeight: weightResult.baseNetWeight.lbs,
    cgResult,
    stability,
    zoneSummary,
    zoneWarnings,
    tiltRisk: computeTiltRisk(stability, cgResult),
    frontAxleLoad,
    rearAxleLoad,
    frontAxlePercent: cgResult.frontAxlePercent,
    rearAxlePercent: cgResult.rearAxlePercent,
    operatingWeightMeta: {
      gvwrLb: weightResult.gvwr?.lbs ?? null,
      payloadRemainingLb: weightResult.payloadRemaining?.lbs ?? null,
      gvwrUsagePct: weightResult.gvwrUsagePct,
      confidenceScore: weightResult.confidence,
      sourceLabels,
      partialDataReasons: buildFleetPartialDataReasons(weightResult),
      warnings: [...weightResult.warnings],
      centerOfGravity: centerOfGravity ?? {
        x: cgResult.xCG,
        y: cgResult.yCG ?? 0.5,
        z: cgResult.zCG,
        totalKnownWeightLb: cgResult.totalMass,
        dataQuality: weightResult.confidence >= 75 ? 'partial' : 'missing_item_weights',
        warnings: [...weightResult.warnings],
        missingWeightCount: 0,
        missingZoneMetadataCount: 0,
      },
    },
  };
}

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
  const hardwareAndLoadoutWeight = Math.max(0, cgResult.totalMass - 6500);
  const totalWeight = DEFAULT_VEHICLE_BASELINE.curbWeightLbs + hardwareAndLoadoutWeight;

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

