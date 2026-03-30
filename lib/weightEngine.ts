/**
 * ECS Weight Distribution Engine
 *
 * Calculates center-of-gravity (CG), axle loads, and weight zone data
 * from vehicle configuration selections AND loadout zone weights.
 *
 * SINGLE SOURCE OF TRUTH for build_weight_lb and payload_margin_lb.
 * All screens/widgets must use computeFullBuildWeightBreakdown().
 *
 * Vehicle coordinate system (normalized 0–1):

 *   x = 0.0 → front bumper
 *   x = 1.0 → rear bumper
 *   z = 0.0 → ground/axle line
 *   z = 1.0 → max roof height
 *
 * Axle positions (RAM 2500 proportions):
 *   Front axle: x = 0.22
 *   Rear axle:  x = 0.72
 *   Wheelbase:  0.50 (normalized)
 *
 * EXPANDED: Drawer system + Trailer hitch module specs.
 * NEW: Loadout zone weight integration for live CG computation.
 *
 * Phase 10: Defensive NaN/Infinity guards on all numeric outputs.
 */

import { vehicleSpecStore, type FuelType } from './vehicleSpecStore';
import { consumablesStore, FUEL_DENSITY_LB_PER_GAL, WATER_DENSITY_LB_PER_GAL } from './consumablesStore';
import { loadoutWeightCache } from './loadoutWeightCache';
import { ecsLog } from './ecsLogger';

// ── Phase 10: Safe numeric helper ────────────────────────────
function _sn(value: any, fallback: number = 0): number {
  if (value == null) return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ── Types ────────────────────────────────────────────────────

export interface WeightModule {
  id: string;
  label: string;
  /** Mass in lbs */
  mass: number;
  /** Longitudinal position (0=front, 1=rear) */
  x: number;
  /** Vertical position (0=ground, 1=roof) */
  z: number;
  /** Zone: 'front' | 'mid' | 'rear' */
  zone: 'front' | 'mid' | 'rear';
  /** Color intensity category */
  intensity: 'light' | 'moderate' | 'heavy' | 'excessive';
  /** Source: 'hardware' for config modules, 'loadout' for zone weights */
  source?: 'hardware' | 'loadout';
}

export interface CGResult {
  /** Longitudinal CG (0=front, 1=rear) */
  xCG: number;
  /** Vertical CG (0=ground, 1=roof) */
  zCG: number;
  /** Total mass in lbs */
  totalMass: number;
  /** Front axle load percentage */
  frontAxlePercent: number;
  /** Rear axle load percentage */
  rearAxlePercent: number;
  /** Stability classification */
  stability: 'balanced' | 'moderate_rear' | 'extreme_rear';
  /** All weight modules */
  modules: WeightModule[];
}

/** Loadout zone weight data for CG integration */
export interface LoadoutZoneWeight {
  zoneId: string;
  zoneName: string;
  weightLbs: number;
  /** Position overrides (normalized 0–1) */
  posX?: number;
  posY?: number;
  posZ?: number;
}

// ── Constants ────────────────────────────────────────────────
const FRONT_AXLE_X = 0.22;
const REAR_AXLE_X = 0.72;
const WHEELBASE = REAR_AXLE_X - FRONT_AXLE_X; // 0.50

// ── Base vehicle mass (empty truck) ──────────────────────────
const BASE_VEHICLE: WeightModule = {
  id: 'base_vehicle',
  label: 'Base Vehicle',
  mass: 6500,
  x: 0.42,
  z: 0.25,
  zone: 'mid',
  intensity: 'heavy',
  source: 'hardware',
};

// ── Module Weight Database ───────────────────────────────────
interface ModuleSpec {
  id: string;
  label: string;
  mass: number;
  x: number;
  z: number;
  zone: 'front' | 'mid' | 'rear';
}

const MODULE_SPECS: Record<string, ModuleSpec[]> = {
  // ── Cab Rack ──────────────────────────────────────────
  truck_cab_rack_yes: [
    { id: 'cab_rack', label: 'Cab Rack', mass: 85, x: 0.30, z: 0.85, zone: 'mid' },
  ],
  truck_cab_rack_setup_storage_boxes: [
    { id: 'cab_rack_storage', label: 'Cab Rack Storage', mass: 120, x: 0.30, z: 0.90, zone: 'mid' },
  ],
  truck_cab_rack_setup_rtt: [
    { id: 'cab_rack_rtt', label: 'Cab Rack RTT', mass: 160, x: 0.30, z: 0.92, zone: 'mid' },
  ],
  truck_cab_rack_setup_both: [
    { id: 'cab_rack_storage', label: 'Cab Rack Storage', mass: 120, x: 0.28, z: 0.90, zone: 'mid' },
    { id: 'cab_rack_rtt', label: 'Cab Rack RTT', mass: 160, x: 0.32, z: 0.95, zone: 'mid' },
  ],

  // ── Bed Configurations ────────────────────────────────
  truck_bed_rack: [
    { id: 'bed_rack', label: 'Bed Rack', mass: 95, x: 0.72, z: 0.65, zone: 'rear' },
  ],
  truck_bed_rack_setup_storage: [
    { id: 'bed_rack_storage', label: 'Bed Rack Storage', mass: 150, x: 0.72, z: 0.72, zone: 'rear' },
  ],
  truck_bed_rack_setup_rtt: [
    { id: 'bed_rack_rtt', label: 'Bed Rack RTT', mass: 165, x: 0.72, z: 0.80, zone: 'rear' },
  ],
  truck_bed_rack_setup_both: [
    { id: 'bed_rack_storage', label: 'Bed Rack Storage', mass: 150, x: 0.70, z: 0.72, zone: 'rear' },
    { id: 'bed_rack_rtt', label: 'Bed Rack RTT', mass: 165, x: 0.74, z: 0.85, zone: 'rear' },
  ],

  truck_bed_cover: [
    { id: 'bed_cover', label: 'Bed Cover', mass: 65, x: 0.72, z: 0.42, zone: 'rear' },
  ],
  truck_bed_cover_setup_storage: [
    { id: 'bed_cover_storage', label: 'Cover Storage', mass: 100, x: 0.72, z: 0.48, zone: 'rear' },
  ],
  truck_bed_cover_setup_rtt: [
    { id: 'bed_cover_rtt', label: 'Cover RTT', mass: 165, x: 0.72, z: 0.60, zone: 'rear' },
  ],
  truck_bed_cover_setup_both: [
    { id: 'bed_cover_storage', label: 'Cover Storage', mass: 100, x: 0.70, z: 0.48, zone: 'rear' },
    { id: 'bed_cover_rtt', label: 'Cover RTT', mass: 165, x: 0.74, z: 0.60, zone: 'rear' },
  ],

  truck_bed_rsi_smart_cap: [
    { id: 'rsi_cap', label: 'RSI SmartCap', mass: 220, x: 0.72, z: 0.50, zone: 'rear' },
  ],
  truck_rsi_setup_storage: [
    { id: 'rsi_storage', label: 'SmartCap Storage', mass: 80, x: 0.72, z: 0.62, zone: 'rear' },
  ],
  truck_rsi_setup_rtt: [
    { id: 'rsi_rtt', label: 'SmartCap RTT', mass: 165, x: 0.72, z: 0.72, zone: 'rear' },
  ],
  truck_rsi_setup_both: [
    { id: 'rsi_storage', label: 'SmartCap Storage', mass: 80, x: 0.70, z: 0.62, zone: 'rear' },
    { id: 'rsi_rtt', label: 'SmartCap RTT', mass: 165, x: 0.74, z: 0.72, zone: 'rear' },
  ],
  truck_rsi_bins_kitchen: [
    { id: 'rsi_kitchen', label: 'Kitchen Module', mass: 110, x: 0.78, z: 0.35, zone: 'rear' },
  ],
  truck_rsi_bins_half_bins: [
    { id: 'rsi_half_bins', label: 'Half Bins', mass: 60, x: 0.76, z: 0.30, zone: 'rear' },
  ],
  truck_rsi_bins_full_bins: [
    { id: 'rsi_full_bins', label: 'Full Bins', mass: 90, x: 0.76, z: 0.30, zone: 'rear' },
  ],

  truck_bed_alu_cab: [
    { id: 'alu_cab', label: 'ALU Cab', mass: 280, x: 0.72, z: 0.55, zone: 'rear' },
  ],
  truck_alu_setup_storage: [
    { id: 'alu_storage', label: 'ALU Storage', mass: 100, x: 0.72, z: 0.62, zone: 'rear' },
  ],
  truck_alu_setup_storage_rtt: [
    { id: 'alu_storage', label: 'ALU Storage', mass: 100, x: 0.70, z: 0.62, zone: 'rear' },
    { id: 'alu_rtt', label: 'ALU RTT', mass: 165, x: 0.74, z: 0.78, zone: 'rear' },
  ],

  truck_bed_other_topper: [
    { id: 'topper', label: 'Topper', mass: 140, x: 0.72, z: 0.50, zone: 'rear' },
  ],
  truck_topper_setup_storage: [
    { id: 'topper_storage', label: 'Topper Storage', mass: 80, x: 0.72, z: 0.58, zone: 'rear' },
  ],
  truck_topper_setup_rtt: [
    { id: 'topper_rtt', label: 'Topper RTT', mass: 165, x: 0.72, z: 0.68, zone: 'rear' },
  ],
  truck_topper_setup_both: [
    { id: 'topper_storage', label: 'Topper Storage', mass: 80, x: 0.70, z: 0.58, zone: 'rear' },
    { id: 'topper_rtt', label: 'Topper RTT', mass: 165, x: 0.74, z: 0.68, zone: 'rear' },
  ],

  truck_bed_open_bed: [
    { id: 'open_bed', label: 'Open Bed', mass: 0, x: 0.72, z: 0.30, zone: 'rear' },
  ],

  // ── Drawer System (NEW) ───────────────────────────────
  truck_drawers_single: [
    { id: 'drawer_single', label: 'Single Drawer', mass: 65, x: 0.72, z: 0.22, zone: 'rear' },
  ],
  truck_drawers_dual: [
    { id: 'drawer_left', label: 'Drawer Left', mass: 55, x: 0.70, z: 0.22, zone: 'rear' },
    { id: 'drawer_right', label: 'Drawer Right', mass: 55, x: 0.74, z: 0.22, zone: 'rear' },
  ],
  truck_drawers_drawer_kitchen: [
    { id: 'drawer_main', label: 'Drawer', mass: 55, x: 0.70, z: 0.22, zone: 'rear' },
    { id: 'kitchen_slideout', label: 'Slide-Out Kitchen', mass: 85, x: 0.78, z: 0.25, zone: 'rear' },
  ],

  // ── Trailer Hitch Accessories (NEW) ───────────────────
  truck_hitch_tire_carrier: [
    { id: 'hitch_tire', label: 'Tire Carrier', mass: 95, x: 0.98, z: 0.35, zone: 'rear' },
  ],
  truck_hitch_hitch_box: [
    { id: 'hitch_box', label: 'Hitch Cargo Box', mass: 75, x: 0.98, z: 0.28, zone: 'rear' },
  ],
  truck_hitch_bike_rack: [
    { id: 'hitch_bike', label: 'Bike Rack', mass: 45, x: 0.98, z: 0.35, zone: 'rear' },
  ],
  truck_hitch_recovery_mount: [
    { id: 'hitch_recovery', label: 'Recovery Mount', mass: 60, x: 0.98, z: 0.28, zone: 'rear' },
  ],

  // ── Car/Crossover ─────────────────────────────────────
  car_roof_rack_yes: [
    { id: 'car_roof_rack', label: 'Roof Rack', mass: 45, x: 0.42, z: 0.90, zone: 'mid' },
  ],
  car_roof_rack_setup_storage_boxes: [
    { id: 'car_roof_storage', label: 'Roof Storage', mass: 80, x: 0.42, z: 0.95, zone: 'mid' },
  ],
  car_roof_rack_setup_rtt: [
    { id: 'car_roof_rtt', label: 'Roof RTT', mass: 140, x: 0.42, z: 0.95, zone: 'mid' },
  ],
  car_roof_rack_setup_both: [
    { id: 'car_roof_storage', label: 'Roof Storage', mass: 80, x: 0.38, z: 0.95, zone: 'mid' },
    { id: 'car_roof_rtt', label: 'Roof RTT', mass: 140, x: 0.46, z: 0.95, zone: 'mid' },
  ],

  // Car hitch
  car_hitch_tire_carrier: [
    { id: 'car_hitch_tire', label: 'Tire Carrier', mass: 85, x: 0.98, z: 0.30, zone: 'rear' },
  ],
  car_hitch_hitch_box: [
    { id: 'car_hitch_box', label: 'Hitch Cargo Box', mass: 65, x: 0.98, z: 0.25, zone: 'rear' },
  ],
  car_hitch_bike_rack: [
    { id: 'car_hitch_bike', label: 'Bike Rack', mass: 40, x: 0.98, z: 0.30, zone: 'rear' },
  ],
  car_hitch_recovery_mount: [
    { id: 'car_hitch_recovery', label: 'Recovery Mount', mass: 50, x: 0.98, z: 0.25, zone: 'rear' },
  ],

  // ── SUV/Van ───────────────────────────────────────────
  suv_roof_rack_yes: [
    { id: 'suv_roof_rack', label: 'Roof Rack', mass: 55, x: 0.42, z: 0.90, zone: 'mid' },
  ],
  suv_roof_rack_setup_storage_boxes: [
    { id: 'suv_roof_storage', label: 'Roof Storage', mass: 100, x: 0.42, z: 0.95, zone: 'mid' },
  ],
  suv_roof_rack_setup_rtt: [
    { id: 'suv_roof_rtt', label: 'Roof RTT', mass: 150, x: 0.42, z: 0.95, zone: 'mid' },
  ],
  suv_roof_rack_setup_both: [
    { id: 'suv_roof_storage', label: 'Roof Storage', mass: 100, x: 0.38, z: 0.95, zone: 'mid' },
    { id: 'suv_roof_rtt', label: 'Roof RTT', mass: 150, x: 0.46, z: 0.95, zone: 'mid' },
  ],

  // SUV hitch
  suv_hitch_tire_carrier: [
    { id: 'suv_hitch_tire', label: 'Tire Carrier', mass: 90, x: 0.98, z: 0.32, zone: 'rear' },
  ],
  suv_hitch_hitch_box: [
    { id: 'suv_hitch_box', label: 'Hitch Cargo Box', mass: 70, x: 0.98, z: 0.26, zone: 'rear' },
  ],
  suv_hitch_bike_rack: [
    { id: 'suv_hitch_bike', label: 'Bike Rack', mass: 42, x: 0.98, z: 0.32, zone: 'rear' },
  ],
  suv_hitch_recovery_mount: [
    { id: 'suv_hitch_recovery', label: 'Recovery Mount', mass: 55, x: 0.98, z: 0.26, zone: 'rear' },
  ],

  // ── Jeep ──────────────────────────────────────────────
  jeep_bed_yes: [
    { id: 'jeep_cargo', label: 'Rear Cargo', mass: 0, x: 0.68, z: 0.30, zone: 'rear' },
  ],
  jeep_rack_yes: [
    { id: 'jeep_rack', label: 'Rack System', mass: 75, x: 0.50, z: 0.85, zone: 'mid' },
  ],
  jeep_rsi_yes: [
    { id: 'jeep_rsi', label: 'RSI SmartCap', mass: 200, x: 0.68, z: 0.50, zone: 'rear' },
  ],

  // Jeep drawers (NEW)
  jeep_drawers_single: [
    { id: 'jeep_drawer_single', label: 'Single Drawer', mass: 55, x: 0.68, z: 0.22, zone: 'rear' },
  ],
  jeep_drawers_dual: [
    { id: 'jeep_drawer_left', label: 'Drawer Left', mass: 45, x: 0.66, z: 0.22, zone: 'rear' },
    { id: 'jeep_drawer_right', label: 'Drawer Right', mass: 45, x: 0.70, z: 0.22, zone: 'rear' },
  ],
  jeep_drawers_drawer_kitchen: [
    { id: 'jeep_drawer_main', label: 'Drawer', mass: 45, x: 0.66, z: 0.22, zone: 'rear' },
    { id: 'jeep_kitchen', label: 'Slide-Out Kitchen', mass: 75, x: 0.72, z: 0.25, zone: 'rear' },
  ],

  // Jeep hitch (NEW)
  jeep_hitch_tire_carrier: [
    { id: 'jeep_hitch_tire', label: 'Tire Carrier', mass: 90, x: 0.98, z: 0.35, zone: 'rear' },
  ],
  jeep_hitch_hitch_box: [
    { id: 'jeep_hitch_box', label: 'Hitch Cargo Box', mass: 70, x: 0.98, z: 0.28, zone: 'rear' },
  ],
  jeep_hitch_bike_rack: [
    { id: 'jeep_hitch_bike', label: 'Bike Rack', mass: 42, x: 0.98, z: 0.35, zone: 'rear' },
  ],
  jeep_hitch_recovery_mount: [
    { id: 'jeep_hitch_recovery', label: 'Recovery Mount', mass: 55, x: 0.98, z: 0.28, zone: 'rear' },
  ],
};

// ── Bin count multiplier ─────────────────────────────────────
function getBinMassMultiplier(binCount: string | undefined): number {
  const count = parseInt(binCount || '1', 10);
  return Math.max(1, Math.min(count, 4));
}

// ── Intensity classification ─────────────────────────────────
function classifyIntensity(mass: number): 'light' | 'moderate' | 'heavy' | 'excessive' {
  if (mass <= 50) return 'light';
  if (mass <= 150) return 'moderate';
  if (mass <= 300) return 'heavy';
  return 'excessive';
}

// ── Zone classification ──────────────────────────────────────
function classifyZone(x: number): 'front' | 'mid' | 'rear' {
  if (x < 0.35) return 'front';
  if (x > 0.60) return 'rear';
  return 'mid';
}

/**
 * Build weight modules from wizard selections.
 */
export function buildWeightModules(selections: Record<string, string>): WeightModule[] {
  const modules: WeightModule[] = [];
  const vt = selections.vehicle_type;

  // Always include base vehicle
  modules.push({ ...BASE_VEHICLE });

  // Helper to add modules from spec
  const addFromSpec = (key: string) => {
    const specs = MODULE_SPECS[key];
    if (specs) {
      for (const spec of specs) {
        modules.push({
          ...spec,
          intensity: classifyIntensity(spec.mass),
          source: 'hardware',
        });
      }
    }
  };

  if (vt === 'truck') {
    // Cab rack
    if (selections.truck_cab_rack === 'yes') {
      addFromSpec('truck_cab_rack_yes');
      if (selections.truck_cab_rack_setup) {
        addFromSpec(`truck_cab_rack_setup_${selections.truck_cab_rack_setup}`);
      }
    }

    // Bed configuration
    if (selections.truck_bed) {
      addFromSpec(`truck_bed_${selections.truck_bed}`);

      if (selections.truck_bed === 'rack' && selections.truck_bed_rack_setup) {
        addFromSpec(`truck_bed_rack_setup_${selections.truck_bed_rack_setup}`);
      }
      if (selections.truck_bed === 'cover' && selections.truck_bed_cover_setup) {
        addFromSpec(`truck_bed_cover_setup_${selections.truck_bed_cover_setup}`);
      }
      if (selections.truck_bed === 'rsi_smart_cap') {
        if (selections.truck_rsi_setup) {
          addFromSpec(`truck_rsi_setup_${selections.truck_rsi_setup}`);
        }
        if (selections.truck_rsi_bins && selections.truck_rsi_bins !== 'none') {
          addFromSpec(`truck_rsi_bins_${selections.truck_rsi_bins}`);
          if ((selections.truck_rsi_bins === 'half_bins' || selections.truck_rsi_bins === 'full_bins') && selections.truck_rsi_bin_count) {
            const mult = getBinMassMultiplier(selections.truck_rsi_bin_count);
            const lastMod = modules[modules.length - 1];
            if (lastMod) lastMod.mass *= mult;
          }
        }
      }
      if (selections.truck_bed === 'alu_cab' && selections.truck_alu_setup) {
        addFromSpec(`truck_alu_setup_${selections.truck_alu_setup}`);
      }
      if (selections.truck_bed === 'other_topper' && selections.truck_topper_setup) {
        addFromSpec(`truck_topper_setup_${selections.truck_topper_setup}`);
      }
    }

    // Drawer system (NEW)
    if (selections.truck_drawers && selections.truck_drawers !== 'none') {
      addFromSpec(`truck_drawers_${selections.truck_drawers}`);
    }

    // Trailer hitch (NEW)
    if (selections.truck_hitch && selections.truck_hitch !== 'none') {
      addFromSpec(`truck_hitch_${selections.truck_hitch}`);
    }
  }

  if (vt === 'car_crossover') {
    if (selections.car_roof_rack === 'yes') {
      addFromSpec('car_roof_rack_yes');
      if (selections.car_roof_rack_setup) {
        addFromSpec(`car_roof_rack_setup_${selections.car_roof_rack_setup}`);
      }
    }
    // Car hitch (NEW)
    if (selections.car_hitch && selections.car_hitch !== 'none') {
      addFromSpec(`car_hitch_${selections.car_hitch}`);
    }
  }

  if (vt === 'suv_van') {
    if (selections.suv_roof_rack === 'yes') {
      addFromSpec('suv_roof_rack_yes');
      if (selections.suv_roof_rack_setup) {
        addFromSpec(`suv_roof_rack_setup_${selections.suv_roof_rack_setup}`);
      }
    }
    // SUV hitch (NEW)
    if (selections.suv_hitch && selections.suv_hitch !== 'none') {
      addFromSpec(`suv_hitch_${selections.suv_hitch}`);
    }
  }

  if (vt === 'jeep') {
    if (selections.jeep_bed === 'yes') addFromSpec('jeep_bed_yes');
    if (selections.jeep_rack === 'yes') addFromSpec('jeep_rack_yes');
    if (selections.jeep_rsi === 'yes') addFromSpec('jeep_rsi_yes');

    // Jeep drawers (NEW)
    if (selections.jeep_drawers && selections.jeep_drawers !== 'none') {
      addFromSpec(`jeep_drawers_${selections.jeep_drawers}`);
    }

    // Jeep hitch (NEW)
    if (selections.jeep_hitch && selections.jeep_hitch !== 'none') {
      addFromSpec(`jeep_hitch_${selections.jeep_hitch}`);
    }
  }

  // Reclassify intensities after any mass multipliers
  for (const m of modules) {
    m.intensity = classifyIntensity(m.mass);
  }

  return modules;
}

/**
 * Build weight modules from loadout zone weights.
 * These are added ON TOP of hardware modules for combined CG.
 */
export function buildLoadoutWeightModules(zoneWeights: LoadoutZoneWeight[]): WeightModule[] {
  if (!Array.isArray(zoneWeights)) return [];
  return zoneWeights
    .filter(z => _sn(z.weightLbs) > 0)
    .map(z => ({
      id: `loadout_${z.zoneId}`,
      label: z.zoneName || 'Unknown Zone',
      mass: _sn(z.weightLbs),
      x: _sn(z.posX, 0.50),
      z: _sn(z.posZ, 0.30),
      zone: classifyZone(_sn(z.posX, 0.50)),
      intensity: classifyIntensity(_sn(z.weightLbs)),
      source: 'loadout' as const,
    }));
}


/**
 * Calculate center of gravity and axle loads.
 *
 * x_cg = Σ(m_i · x_i) / Σ(m_i)
 * z_cg = Σ(m_i · z_i) / Σ(m_i)
 *
 * Axle loads via lever arm:
 *   rearLoad = (x_cg - frontAxle) / wheelbase
 *   frontLoad = 1 - rearLoad
 *
 * @param selections - Wizard selections for hardware modules
 * @param loadoutWeights - Optional loadout zone weights for combined CG
 */
export function calculateCG(
  selections: Record<string, string>,
  loadoutWeights?: LoadoutZoneWeight[],
): CGResult {
  // Phase 10: Wrap in try-catch for crash protection
  try {
    const hardwareModules = buildWeightModules(selections || {});
    const loadoutModules = loadoutWeights ? buildLoadoutWeightModules(loadoutWeights) : [];
    const allModules = [...hardwareModules, ...loadoutModules];

    // Phase 10: Guard each module mass against NaN
    for (const m of allModules) {
      m.mass = _sn(m.mass);
      m.x = _sn(m.x, 0.5);
      m.z = _sn(m.z, 0.25);
    }

    const totalMass = _sn(allModules.reduce((sum, m) => sum + m.mass, 0));

    if (totalMass === 0) {
      return {
        xCG: 0.45,
        zCG: 0.25,
        totalMass: 0,
        frontAxlePercent: 50,
        rearAxlePercent: 50,
        stability: 'balanced',
        modules: [],
      };
    }

    const xCG = _sn(allModules.reduce((sum, m) => sum + m.mass * m.x, 0) / totalMass, 0.45);
    const zCG = _sn(allModules.reduce((sum, m) => sum + m.mass * m.z, 0) / totalMass, 0.25);

    // Axle load calculation
    const rearLoadFraction = Math.max(0, Math.min(1, _sn((xCG - FRONT_AXLE_X) / WHEELBASE, 0.5)));
    const frontLoadFraction = 1 - rearLoadFraction;

    const rearAxlePercent = _sn(Math.round(rearLoadFraction * 100), 50);
    const frontAxlePercent = _sn(Math.round(frontLoadFraction * 100), 50);

    // Stability classification
    let stability: CGResult['stability'] = 'balanced';
    if (rearAxlePercent > 75) stability = 'extreme_rear';
    else if (rearAxlePercent > 65) stability = 'moderate_rear';

    return {
      xCG,
      zCG,
      totalMass,
      frontAxlePercent,
      rearAxlePercent,
      stability,
      modules: allModules.filter(m => m.id !== 'base_vehicle'),
    };
  } catch (err) {
    ecsLog.error('WEIGHT', 'calculateCG crashed — returning neutral defaults', err);
    return {
      xCG: 0.45,
      zCG: 0.25,
      totalMass: 0,
      frontAxlePercent: 50,
      rearAxlePercent: 50,
      stability: 'balanced',
      modules: [],
    };
  }
}


/**
 * Get the total weight of hardware additions ONLY (excludes base vehicle).
 * Used with user-entered base_weight_lb for accurate build weight.
 */
export function getHardwareAdditionsWeight(selections: Record<string, string>): number {
  const modules = buildWeightModules(selections);
  return modules
    .filter(m => m.id !== 'base_vehicle')
    .reduce((sum, m) => sum + m.mass, 0);
}

/**

 * Compute total build weight using user-entered base weight + hardware additions.
 * build_weight = base_weight_lb + hardware_additions
 */
export function computeBuildWeightWithSpecs(
  baseWeightLb: number,
  selections: Record<string, string>,
): number {
  const hardwareAdditions = getHardwareAdditionsWeight(selections);
  return baseWeightLb + hardwareAdditions;
}

/**

 * Compute total build weight INCLUDING consumables AND loadout items.
 * build_weight = base_weight_lb + hardware_additions + items_weight_lb + consumables_weight_lb
 *
 * @param baseWeightLb - User-entered base/curb weight
 * @param hardwareAdditionsLb - Weight from wizard modules (or cached hardware_additions_lb)
 * @param consumablesWeightLb - Fuel + water weight from consumablesStore
 * @param itemsWeightLb - Total loadout items weight (SUM of item.weight_lbs * item.quantity)
 */
export function computeBuildWeightFull(
  baseWeightLb: number,
  hardwareAdditionsLb: number,
  consumablesWeightLb: number,
  itemsWeightLb: number = 0,
): number {
  // Phase 10: Guard all inputs against NaN
  const total = _sn(baseWeightLb) + _sn(hardwareAdditionsLb) + _sn(consumablesWeightLb) + _sn(itemsWeightLb);
  if (!Number.isFinite(total)) {
    ecsLog.error('WEIGHT', 'computeBuildWeightFull returned non-finite value', null, {
      baseWeightLb, hardwareAdditionsLb, consumablesWeightLb, itemsWeightLb, total,
    });
    return _sn(baseWeightLb) + _sn(hardwareAdditionsLb);
  }
  return Math.max(0, total);
}



/**
 * Compute payload margin: GVWR - build weight.
 * Positive = remaining capacity. Negative = overweight.
 */
export function computePayloadMargin(gvwrLb: number, buildWeightLb: number): number {
  const g = _sn(gvwrLb);
  const b = _sn(buildWeightLb);
  return g - b;
}

/**
 * Get payload margin status color.
 * Phase 10: Guards against NaN/Infinity in division.
 */
export function getPayloadMarginColor(marginLb: number, gvwrLb: number): string {
  const m = _sn(marginLb);
  const g = _sn(gvwrLb, 1); // avoid division by zero
  if (m <= 0) return '#EF5350';           // red — overweight
  if (g <= 0) return '#8A8A85';           // no GVWR data
  const pct = (m / g) * 100;
  if (!Number.isFinite(pct)) return '#8A8A85';
  if (pct < 10) return '#FFB74D';                // amber — near limit
  if (pct < 20) return '#C48A2C';                // tactical amber
  return '#66BB6A';                               // green — good
}

/**
 * Get payload margin status label.
 * Phase 4: Uses "OVER LIMIT" and "NEAR LIMIT" for dashboard guardrails.
 * Phase 10: Guards against NaN/Infinity in division.
 */
export function getPayloadMarginLabel(marginLb: number, gvwrLb: number): string {
  const m = _sn(marginLb);
  const g = _sn(gvwrLb, 1);
  if (m <= 0) return 'OVER LIMIT';
  if (g <= 0) return 'GOOD';
  const pct = (m / g) * 100;
  if (!Number.isFinite(pct)) return 'GOOD';
  if (pct < 10) return 'NEAR LIMIT';
  if (pct < 20) return 'MODERATE';
  return 'GOOD';
}




/**
 * Get color for weight bar based on intensity.
 */
export function getIntensityColor(intensity: WeightModule['intensity']): string {
  switch (intensity) {
    case 'light': return 'rgba(212, 175, 55, 0.6)';
    case 'moderate': return '#D4AF37';
    case 'heavy': return '#FF9500';
    case 'excessive': return '#C0392B';
  }
}

/**
 * Get color for axle load percentage.
 */
export function getAxleLoadColor(percent: number): string {
  if (percent > 75) return '#C0392B';
  if (percent > 65) return '#FF9500';
  return '#D4AF37';
}

/**
 * Get the active zone IDs for step-sensitive emphasis.
 * Maps wizard step IDs to vehicle zones.
 */
export function getActiveZoneForStep(stepId: string): string | null {
  const zoneMap: Record<string, string> = {
    truck_cab_rack: 'roof',
    truck_cab_rack_setup: 'roof',
    truck_bed: 'bed',
    truck_bed_rack_setup: 'bed',
    truck_bed_cover_setup: 'bed',
    truck_rsi_setup: 'bed',
    truck_rsi_bins: 'bed',
    truck_rsi_bin_count: 'bed',
    truck_alu_setup: 'bed',
    truck_topper_setup: 'bed',
    truck_drawers: 'drawer',
    truck_hitch: 'hitch',
    car_roof_rack: 'roof',
    car_roof_rack_setup: 'roof',
    car_cargo: 'bed',
    car_drawers: 'drawer',
    car_drawer_count: 'drawer',
    car_hitch: 'hitch',
    suv_roof_rack: 'roof',
    suv_roof_rack_setup: 'roof',
    suv_drawers: 'drawer',
    suv_drawer_count: 'drawer',
    suv_hitch: 'hitch',
    jeep_bed: 'bed',
    jeep_drawers: 'drawer',
    jeep_top: 'roof',
    jeep_hardtop_setup: 'roof',
    jeep_other_top_setup: 'roof',
    jeep_rack: 'roof',
    jeep_rack_setup: 'roof',
    jeep_rack_bins: 'roof',
    jeep_rack_bin_count: 'roof',
    jeep_rsi: 'bed',
    jeep_rsi_setup: 'bed',
    jeep_rsi_bins: 'bed',
    jeep_rsi_bin_count: 'bed',
    jeep_hitch: 'hitch',
  };
  return zoneMap[stepId] || null;
}

/**
 * Get build summary text from selections.
 */
export function getBuildSummaryText(selections: Record<string, string>): string {
  const parts: string[] = [];
  const vt = selections.vehicle_type;

  if (vt === 'truck') parts.push('TRUCK');
  else if (vt === 'car_crossover') parts.push('CAR/CROSSOVER');
  else if (vt === 'suv_van') parts.push('SUV/VAN');
  else if (vt === 'jeep') parts.push('JEEP');

  if (selections.truck_cab_rack === 'yes') parts.push('CAB RACK');
  if (selections.truck_bed === 'rsi_smart_cap') parts.push('SMARTCAP');
  else if (selections.truck_bed === 'alu_cab') parts.push('ALU CAB');
  else if (selections.truck_bed === 'rack') parts.push('BED RACK');
  else if (selections.truck_bed === 'cover') parts.push('BED COVER');
  else if (selections.truck_bed === 'other_topper') parts.push('TOPPER');

  if (selections.truck_rsi_bins === 'half_bins') parts.push('HALF BINS');
  else if (selections.truck_rsi_bins === 'full_bins') parts.push('FULL BINS');
  else if (selections.truck_rsi_bins === 'kitchen') parts.push('KITCHEN');

  // Drawer system
  if (selections.truck_drawers === 'single') parts.push('DRAWER');
  else if (selections.truck_drawers === 'dual') parts.push('DUAL DRAWER');
  else if (selections.truck_drawers === 'drawer_kitchen') parts.push('DRAWER+KITCHEN');

  // Hitch
  const hitchKey = selections.truck_hitch || selections.car_hitch || selections.suv_hitch || selections.jeep_hitch;
  if (hitchKey && hitchKey !== 'none') {
    const hitchLabels: Record<string, string> = {
      tire_carrier: 'TIRE CARRIER',
      hitch_box: 'HITCH BOX',
      bike_rack: 'BIKE RACK',
      recovery_mount: 'RECOVERY MOUNT',
    };
    parts.push(hitchLabels[hitchKey] || 'HITCH');
  }

  if (selections.car_roof_rack === 'yes' || selections.suv_roof_rack === 'yes') parts.push('ROOF RACK');

  // Jeep drawers
  if (selections.jeep_drawers === 'single') parts.push('DRAWER');
  else if (selections.jeep_drawers === 'dual') parts.push('DUAL DRAWER');
  else if (selections.jeep_drawers === 'drawer_kitchen') parts.push('DRAWER+KITCHEN');

  return parts.join(' \u2022 ');
}



// ═══════════════════════════════════════════════════════════════
// SINGLE SOURCE OF TRUTH — Build Weight Breakdown
//
// All screens/widgets MUST use this function for build_weight_lb
// and payload_margin_lb to prevent desync.
//
// Reads from: vehicleSpecStore, consumablesStore, loadoutWeightCache
// Accepts optional overrides for form-preview scenarios.
// ═══════════════════════════════════════════════════════════════

export interface BuildWeightBreakdown {
  // ── Input values ──
  base_weight_lb: number;
  gvwr_lb: number;
  hardware_additions_lb: number;

  // ── Consumables ──
  fuel_percent_current: number;
  fuel_gal_current: number;
  fuel_weight_lb: number;
  fuel_tank_capacity_gal: number;
  fuel_type: FuelType;
  has_fuel_tank_capacity: boolean;
  water_gal_current: number;
  water_weight_lb: number;
  consumables_weight_lb: number;

  // ── Fuel display helpers ──
  /** Fuel density in lbs/gal for the current fuel type */
  fuel_density_lb_per_gal: number;
  /** Weight of a full fuel tank in lbs */
  fuel_weight_full_tank_lb: number;

  // ── Items ──
  items_weight_lb: number;

  // ── Totals ──
  build_weight_lb: number;
  payload_margin_lb: number;
  /** Total available payload: gvwr - base_weight */
  payload_capacity_lb: number;

  // ── Status ──
  has_specs: boolean;
  status_tag: 'OVER LIMIT' | 'NEAR LIMIT' | null;
  status_color: string;
  margin_color: string;
  /**
   * Full margin label covering all states.
   * 'OVER LIMIT' | 'NEAR LIMIT' | 'MODERATE' | 'GOOD' | null
   * null when has_specs is false.
   */
  margin_label: 'OVER LIMIT' | 'NEAR LIMIT' | 'MODERATE' | 'GOOD' | null;
}


export interface BuildWeightOverrides {
  base_weight_lb?: number;
  gvwr_lb?: number;
  hardware_additions_lb?: number;
  fuel_tank_capacity_gal?: number;
  fuel_type?: FuelType;
  items_weight_lb?: number;
}

/**
 * SINGLE SOURCE OF TRUTH for build weight and payload margin.
 *
 * Reads vehicle specs, consumables, and item weights from their stores.
 * Returns a complete breakdown that all UI components should consume.
 *
 * @param vehicleId - Vehicle to compute for (uses first vehicle if omitted)
 * @param overrides - Optional overrides for form-preview (e.g., VehicleSpecsSection)
 */
export function computeFullBuildWeightBreakdown(
  vehicleId?: string,
  overrides?: BuildWeightOverrides,
): BuildWeightBreakdown {
  // Phase 10: Wrap entire function in try-catch for crash protection
  try {

  // ── Resolve vehicle spec ──
  let resolvedVehicleId = vehicleId || '';
  let spec = vehicleId ? vehicleSpecStore.get(vehicleId) : null;
  if (!spec) {
    const first = vehicleSpecStore.getFirst();
    if (first) {
      spec = first.spec;
      resolvedVehicleId = first.vehicleId;
    }
  }

  const base_weight_lb = overrides?.base_weight_lb ?? spec?.base_weight_lb ?? 0;
  const gvwr_lb = overrides?.gvwr_lb ?? spec?.gvwr_lb ?? 0;
  const hardware_additions_lb = overrides?.hardware_additions_lb ?? spec?.hardware_additions_lb ?? 0;
  const fuel_tank_capacity_gal = overrides?.fuel_tank_capacity_gal ?? spec?.fuel_tank_capacity_gal ?? 0;
  const fuel_type: FuelType = overrides?.fuel_type ?? spec?.fuel_type ?? 'diesel';
  const has_fuel_tank_capacity = fuel_tank_capacity_gal > 0;

  // ── Consumables ──
  const consumablesState = resolvedVehicleId ? consumablesStore.get(resolvedVehicleId) : null;
  const fuel_percent_current = consumablesState?.fuel_percent_current ?? 100;
  const water_gal_current = consumablesState?.water_gal_current ?? 0;

  const fuel_gal_current = has_fuel_tank_capacity
    ? fuel_tank_capacity_gal * (fuel_percent_current / 100)
    : 0;
  const fuelDensity = FUEL_DENSITY_LB_PER_GAL[fuel_type] ?? 7.1;
  const fuel_weight_lb = has_fuel_tank_capacity ? fuel_gal_current * fuelDensity : 0;
  const water_weight_lb = water_gal_current * WATER_DENSITY_LB_PER_GAL;
  const consumables_weight_lb = fuel_weight_lb + water_weight_lb;

  // ── Items weight ──
  // Use override if provided, otherwise read from loadout weight cache
  const items_weight_lb = overrides?.items_weight_lb != null
    ? overrides.items_weight_lb
    : (loadoutWeightCache.getFirst()?.itemsWeightLb ?? 0);

  // ── Build weight ──
  const build_weight_lb = base_weight_lb > 0
    ? computeBuildWeightFull(base_weight_lb, hardware_additions_lb, consumables_weight_lb, items_weight_lb)
    : 0;

  // ── Payload margin ──
  const payload_margin_lb = gvwr_lb > 0 && build_weight_lb > 0
    ? gvwr_lb - build_weight_lb
    : 0;
  const payload_capacity_lb = gvwr_lb > 0 && base_weight_lb > 0
    ? gvwr_lb - base_weight_lb
    : 0;

  const has_specs = base_weight_lb > 0 && gvwr_lb > 0;

  // ── Status tag (Phase 4 guardrails) ──
  let status_tag: BuildWeightBreakdown['status_tag'] = null;
  let status_color = '#8A8A85'; // muted default

  if (has_specs) {
    if (payload_margin_lb < 0) {
      status_tag = 'OVER LIMIT';
      status_color = '#EF5350';
    } else if (payload_capacity_lb > 0 && payload_margin_lb < payload_capacity_lb * 0.10) {
      status_tag = 'NEAR LIMIT';
      status_color = '#FFB74D';
    }
  }

  // ── Margin color (uses GVWR-based thresholds matching getPayloadMarginColor) ──
  const margin_color = has_specs
    ? getPayloadMarginColor(payload_margin_lb, gvwr_lb)
    : '#8A8A85';

  // ── Full margin label (covers all states for UI badges) ──
  const margin_label: BuildWeightBreakdown['margin_label'] = has_specs
    ? (getPayloadMarginLabel(payload_margin_lb, gvwr_lb) as BuildWeightBreakdown['margin_label'])
    : null;

  // ── Fuel display helpers ──
  const fuel_density_lb_per_gal = fuelDensity;
  const fuel_weight_full_tank_lb = has_fuel_tank_capacity
    ? fuel_tank_capacity_gal * fuelDensity
    : 0;

  return {
    base_weight_lb,
    gvwr_lb,
    hardware_additions_lb,
    fuel_percent_current,
    fuel_gal_current,
    fuel_weight_lb,
    fuel_tank_capacity_gal,
    fuel_type,
    has_fuel_tank_capacity,
    water_gal_current,
    water_weight_lb,
    consumables_weight_lb,
    fuel_density_lb_per_gal,
    fuel_weight_full_tank_lb,
    items_weight_lb,
    build_weight_lb,
    payload_margin_lb,
    payload_capacity_lb,
    has_specs,
    status_tag,
    status_color,
    margin_color,
    margin_label,
  };

  } catch (err) {
    // Phase 10: Return safe zero-state breakdown on crash
    ecsLog.critical('WEIGHT', 'computeFullBuildWeightBreakdown crashed — returning safe defaults', err);
    return {
      base_weight_lb: 0,
      gvwr_lb: 0,
      hardware_additions_lb: 0,
      fuel_percent_current: 100,
      fuel_gal_current: 0,
      fuel_weight_lb: 0,
      fuel_tank_capacity_gal: 0,
      fuel_type: 'diesel' as FuelType,
      has_fuel_tank_capacity: false,
      water_gal_current: 0,
      water_weight_lb: 0,
      consumables_weight_lb: 0,
      fuel_density_lb_per_gal: 7.1,
      fuel_weight_full_tank_lb: 0,
      items_weight_lb: 0,
      build_weight_lb: 0,
      payload_margin_lb: 0,
      payload_capacity_lb: 0,
      has_specs: false,
      status_tag: null,
      status_color: '#8A8A85',
      margin_color: '#8A8A85',
      margin_label: null,
    };
  }
}

