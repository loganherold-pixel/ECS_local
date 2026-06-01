/**
 * ECS Vehicle Spec Store — Per-Vehicle Weight & Fuel Specifications
 *
 * Stores GVWR, base/curb weight, fuel tank capacity, and fuel type
 * per vehicle for payload margin computation and fuel-percent weight conversion.
 * Offline-first: localStorage (web) / memory (native).
 *
 * Includes presets by vehicle make/model for quick population.
 */
import { Platform } from 'react-native';
import { createPersistedKeyValueCache } from './keyValuePersistence';

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

// ── Fuel type constants ─────────────────────────────────
export type FuelType = 'diesel' | 'gas';

/** Weight of fuel per gallon (lbs) */
export const FUEL_WEIGHT_PER_GAL: Record<FuelType, number> = {
  diesel: 7.1,
  gas: 6.0,
};


export interface VehicleSpec {
  gvwr_lb: number;
  base_weight_lb: number;
  front_base_weight_lb?: number;
  rear_base_weight_lb?: number;
  front_gawr_lb?: number;
  rear_gawr_lb?: number;
  wheelbase_in?: number;
  ground_clearance_inches?: number;
  tire_size_inches?: number;
  suspension_lift_inches?: number;
  is_leveled?: boolean;
  front_level_inches?: number | null;
  trim?: string;
  engine?: string;
  drivetrain?: string;
  cab?: string;
  bed_length?: string;
  payload_capacity_lb?: number | null;
  overall_length_in?: number | null;
  overall_width_in?: number | null;
  overall_height_in?: number | null;
  track_width_front_in?: number | null;
  track_width_rear_in?: number | null;
  approach_angle_deg?: number | null;
  breakover_angle_deg?: number | null;
  departure_angle_deg?: number | null;
  turning_diameter_ft?: number | null;
  oem_reference_id?: string | null;
  oem_reference_label?: string | null;
  oem_reference_confidence?: number | null;
  oem_reference_notes?: string | null;
  /** Fuel tank capacity in gallons (required for fuel percent conversion) */
  fuel_tank_capacity_gal: number;
  /** Fuel type: diesel or gas (default diesel) */
  fuel_type: FuelType;
  /** Cached hardware additions weight from last wizard config deploy */
  hardware_additions_lb?: number;
}


export interface VehicleSpecPreset {
  id?: string;
  label: string;
  make?: string;
  model?: string;
  gvwr_lb: number;
  base_weight_lb: number;
  fuel_tank_capacity_gal: number;
  fuel_type: FuelType;
  fuelProfiles?: Partial<Record<FuelType, VehicleSpec>>;
}

function buildPresetId(preset: VehicleSpecPreset): string {
  const source = [
    preset.make || '',
    preset.model || '',
    preset.label || '',
    preset.fuel_type || '',
  ]
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return source || 'vehicle-preset';
}

export function getVehiclePresetId(preset: VehicleSpecPreset): string {
  return preset.id || buildPresetId(preset);
}

export function getVehiclePresetFuelOptions(preset: VehicleSpecPreset): FuelType[] {
  const profileFuelTypes = Object.keys(preset.fuelProfiles || {}) as FuelType[];
  if (profileFuelTypes.length > 0) return profileFuelTypes;
  return [preset.fuel_type];
}

export function resolveVehicleSpecPreset(
  preset: VehicleSpecPreset,
  preferredFuelType?: FuelType | null,
): VehicleSpec {
  const requestedFuelType = preferredFuelType || preset.fuel_type;
  const profile =
    preset.fuelProfiles?.[requestedFuelType] ||
    preset.fuelProfiles?.[preset.fuel_type] ||
    preset.fuelProfiles?.[getVehiclePresetFuelOptions(preset)[0]];

  if (profile) {
    return {
      gvwr_lb: profile.gvwr_lb,
      base_weight_lb: profile.base_weight_lb,
      fuel_tank_capacity_gal: profile.fuel_tank_capacity_gal,
      fuel_type: profile.fuel_type,
      hardware_additions_lb: profile.hardware_additions_lb,
    };
  }

  return {
    gvwr_lb: preset.gvwr_lb,
    base_weight_lb: preset.base_weight_lb,
    fuel_tank_capacity_gal: preset.fuel_tank_capacity_gal,
    fuel_type: preset.fuel_type,
  };
}

export function matchesVehicleSpecPreset(
  preset: VehicleSpecPreset,
  spec: VehicleSpec | null | undefined,
): boolean {
  if (!spec) return false;
  const resolved = resolveVehicleSpecPreset(preset, spec.fuel_type);
  return (
    resolved.gvwr_lb === spec.gvwr_lb &&
    resolved.base_weight_lb === spec.base_weight_lb &&
    resolved.fuel_tank_capacity_gal === spec.fuel_tank_capacity_gal &&
    resolved.fuel_type === spec.fuel_type
  );
}

// ── Presets by vehicle type ──────────────────────────────
// Common overlanding vehicles with published GVWR, curb weight, and fuel specs
export const VEHICLE_SPEC_PRESETS: Record<string, VehicleSpecPreset[]> = {
  truck: [
    { label: 'Toyota Tacoma TRD Pro', make: 'Toyota', model: 'Tacoma', gvwr_lb: 5600, base_weight_lb: 4480, fuel_tank_capacity_gal: 21.1, fuel_type: 'gas' },
    { label: 'Toyota Tacoma SR5', make: 'Toyota', model: 'Tacoma', gvwr_lb: 5600, base_weight_lb: 4250, fuel_tank_capacity_gal: 21.1, fuel_type: 'gas' },
    { label: 'Toyota Tacoma Trailhunter', make: 'Toyota', model: 'Tacoma', gvwr_lb: 6205, base_weight_lb: 5000, fuel_tank_capacity_gal: 18.2, fuel_type: 'gas' },
    { label: 'Toyota Tundra Trailhunter', make: 'Toyota', model: 'Tundra', gvwr_lb: 7400, base_weight_lb: 5980, fuel_tank_capacity_gal: 32.2, fuel_type: 'gas' },
    { label: 'Toyota Tundra TRD Pro', make: 'Toyota', model: 'Tundra', gvwr_lb: 7175, base_weight_lb: 5680, fuel_tank_capacity_gal: 32.2, fuel_type: 'gas' },
    { label: 'Ford F-150 Tremor', make: 'Ford', model: 'F-150', gvwr_lb: 7050, base_weight_lb: 5370, fuel_tank_capacity_gal: 36.0, fuel_type: 'gas' },
    { label: 'Ford Ranger Tremor', make: 'Ford', model: 'Ranger', gvwr_lb: 6050, base_weight_lb: 4640, fuel_tank_capacity_gal: 21.0, fuel_type: 'gas' },
    { label: 'Ford Ranger Raptor', make: 'Ford', model: 'Ranger', gvwr_lb: 6790, base_weight_lb: 5415, fuel_tank_capacity_gal: 20.3, fuel_type: 'gas' },
    { label: 'Ford F-150 Raptor', make: 'Ford', model: 'F-150', gvwr_lb: 7050, base_weight_lb: 5700, fuel_tank_capacity_gal: 36.0, fuel_type: 'gas' },
    {
      id: 'ford-f250-super-duty',
      label: 'Ford F-250 Super Duty',
      make: 'Ford',
      model: 'F-250 Super Duty',
      gvwr_lb: 10000,
      base_weight_lb: 6400,
      fuel_tank_capacity_gal: 34.0,
      fuel_type: 'gas',
      fuelProfiles: {
        gas: { gvwr_lb: 10000, base_weight_lb: 6400, fuel_tank_capacity_gal: 34.0, fuel_type: 'gas' },
        diesel: { gvwr_lb: 10000, base_weight_lb: 6600, fuel_tank_capacity_gal: 34.0, fuel_type: 'diesel' },
      },
    },
    { label: 'RAM 1500 Rebel', make: 'RAM', model: '1500', gvwr_lb: 6900, base_weight_lb: 5380, fuel_tank_capacity_gal: 26.0, fuel_type: 'gas' },
    { label: 'RAM 1500 TRX', make: 'RAM', model: '1500', gvwr_lb: 7100, base_weight_lb: 6350, fuel_tank_capacity_gal: 33.0, fuel_type: 'gas' },
    { label: 'RAM 2500 Power Wagon', make: 'RAM', model: '2500 Power Wagon', gvwr_lb: 8510, base_weight_lb: 6900, fuel_tank_capacity_gal: 32.0, fuel_type: 'gas' },
    { id: 'ram-2500-hd', label: 'RAM 2500', make: 'RAM', model: '2500', gvwr_lb: 10000, base_weight_lb: 7200, fuel_tank_capacity_gal: 32.0, fuel_type: 'diesel' },
    { id: 'ram-3500-hd', label: 'RAM 3500', make: 'RAM', model: '3500', gvwr_lb: 14000, base_weight_lb: 7700, fuel_tank_capacity_gal: 32.0, fuel_type: 'diesel' },
    { label: 'Chevy Colorado ZR2', make: 'Chevrolet', model: 'Colorado', gvwr_lb: 6100, base_weight_lb: 4700, fuel_tank_capacity_gal: 21.0, fuel_type: 'gas' },
    { label: 'Chevy Colorado Trail Boss', make: 'Chevrolet', model: 'Colorado', gvwr_lb: 6250, base_weight_lb: 4520, fuel_tank_capacity_gal: 21.4, fuel_type: 'gas' },
    { label: 'Chevy Silverado 1500 ZR2', make: 'Chevrolet', model: 'Silverado', gvwr_lb: 7100, base_weight_lb: 5800, fuel_tank_capacity_gal: 24.0, fuel_type: 'gas' },
    { label: 'Chevy Silverado 1500 Trail Boss', make: 'Chevrolet', model: 'Silverado', gvwr_lb: 7200, base_weight_lb: 5150, fuel_tank_capacity_gal: 24.0, fuel_type: 'gas' },
    { label: 'Nissan Frontier PRO-4X', make: 'Nissan', model: 'Frontier', gvwr_lb: 5940, base_weight_lb: 4540, fuel_tank_capacity_gal: 21.1, fuel_type: 'gas' },
    { label: 'GMC Sierra 1500 AT4X', make: 'GMC', model: 'Sierra', gvwr_lb: 7100, base_weight_lb: 5930, fuel_tank_capacity_gal: 24.0, fuel_type: 'gas' },
    { label: 'GMC Canyon AT4X', make: 'GMC', model: 'Canyon', gvwr_lb: 6100, base_weight_lb: 4750, fuel_tank_capacity_gal: 21.0, fuel_type: 'gas' },
    { label: 'Rivian R1T', make: 'Rivian', model: 'R1T', gvwr_lb: 8532, base_weight_lb: 7148, fuel_tank_capacity_gal: 0, fuel_type: 'gas' },
  ],
  suv_van: [
    { label: 'Toyota 4Runner TRD Pro', make: 'Toyota', model: '4Runner', gvwr_lb: 5750, base_weight_lb: 4675, fuel_tank_capacity_gal: 23.0, fuel_type: 'gas' },
    { label: 'Toyota 4Runner Trailhunter', make: 'Toyota', model: '4Runner', gvwr_lb: 6300, base_weight_lb: 5150, fuel_tank_capacity_gal: 19.0, fuel_type: 'gas' },
    { label: 'Toyota Sequoia TRD Pro', make: 'Toyota', model: 'Sequoia', gvwr_lb: 7615, base_weight_lb: 6150, fuel_tank_capacity_gal: 22.5, fuel_type: 'gas' },
    { label: 'Toyota Land Cruiser', make: 'Toyota', model: 'Land Cruiser', gvwr_lb: 6800, base_weight_lb: 5615, fuel_tank_capacity_gal: 22.5, fuel_type: 'gas' },
    { label: 'Lexus GX 460 Premium', make: 'Lexus', model: 'GX', gvwr_lb: 6600, base_weight_lb: 5130, fuel_tank_capacity_gal: 23.0, fuel_type: 'gas' },
    { label: 'Lexus GX 550', make: 'Lexus', model: 'GX', gvwr_lb: 6834, base_weight_lb: 5465, fuel_tank_capacity_gal: 21.7, fuel_type: 'gas' },
    { label: 'Lexus LX 600 Overtrail', make: 'Lexus', model: 'LX', gvwr_lb: 7380, base_weight_lb: 5950, fuel_tank_capacity_gal: 21.1, fuel_type: 'gas' },
    { label: 'Ford Bronco Badlands', make: 'Ford', model: 'Bronco', gvwr_lb: 5700, base_weight_lb: 4700, fuel_tank_capacity_gal: 20.8, fuel_type: 'gas' },
    { label: 'Ford Expedition', make: 'Ford', model: 'Expedition', gvwr_lb: 7500, base_weight_lb: 5800, fuel_tank_capacity_gal: 28.0, fuel_type: 'gas' },
    { label: 'Chevy Tahoe Z71', make: 'Chevrolet', model: 'Tahoe', gvwr_lb: 7300, base_weight_lb: 5680, fuel_tank_capacity_gal: 24.0, fuel_type: 'gas' },
    { label: 'Chevy Suburban Z71', make: 'Chevrolet', model: 'Suburban', gvwr_lb: 7700, base_weight_lb: 5900, fuel_tank_capacity_gal: 28.0, fuel_type: 'gas' },
    { label: 'GMC Yukon AT4', make: 'GMC', model: 'Yukon', gvwr_lb: 7600, base_weight_lb: 5900, fuel_tank_capacity_gal: 24.0, fuel_type: 'gas' },
    { label: 'Nissan Armada PRO-4X', make: 'Nissan', model: 'Armada', gvwr_lb: 7600, base_weight_lb: 6180, fuel_tank_capacity_gal: 24.0, fuel_type: 'gas' },
    { label: 'INEOS Grenadier Station Wagon', make: 'INEOS', model: 'Grenadier', gvwr_lb: 7716, base_weight_lb: 5675, fuel_tank_capacity_gal: 23.8, fuel_type: 'gas' },
    { id: 'mercedes-sprinter-awd', label: 'Mercedes Sprinter AWD', make: 'Mercedes', model: 'Sprinter', gvwr_lb: 8550, base_weight_lb: 6100, fuel_tank_capacity_gal: 24.5, fuel_type: 'diesel' },
    { id: 'mercedes-sprinter-170-awd', label: 'Mercedes Sprinter 170 AWD', make: 'Mercedes', model: 'Sprinter 170', gvwr_lb: 9050, base_weight_lb: 6600, fuel_tank_capacity_gal: 24.5, fuel_type: 'diesel' },
    { label: 'Ford Transit AWD', make: 'Ford', model: 'Transit', gvwr_lb: 9500, base_weight_lb: 6300, fuel_tank_capacity_gal: 25.0, fuel_type: 'gas' },
    { label: 'Ford Transit Trail AWD', make: 'Ford', model: 'Transit', gvwr_lb: 9500, base_weight_lb: 6450, fuel_tank_capacity_gal: 31.0, fuel_type: 'gas' },
    { label: 'RAM ProMaster', make: 'RAM', model: 'ProMaster', gvwr_lb: 9350, base_weight_lb: 5900, fuel_tank_capacity_gal: 24.0, fuel_type: 'gas' },
    { label: 'Rivian R1S', make: 'Rivian', model: 'R1S', gvwr_lb: 8532, base_weight_lb: 7200, fuel_tank_capacity_gal: 0, fuel_type: 'gas' },
  ],
  jeep: [
    { label: 'Jeep Wrangler Rubicon 2dr', make: 'Jeep', model: 'Wrangler', gvwr_lb: 5300, base_weight_lb: 4450, fuel_tank_capacity_gal: 17.5, fuel_type: 'gas' },
    { label: 'Jeep Wrangler Rubicon 4dr', make: 'Jeep', model: 'Wrangler', gvwr_lb: 5700, base_weight_lb: 4800, fuel_tank_capacity_gal: 21.5, fuel_type: 'gas' },
    { label: 'Jeep Wrangler 392', make: 'Jeep', model: 'Wrangler', gvwr_lb: 6200, base_weight_lb: 5300, fuel_tank_capacity_gal: 21.5, fuel_type: 'gas' },
    { label: 'Jeep Wrangler 4xe', make: 'Jeep', model: 'Wrangler', gvwr_lb: 6050, base_weight_lb: 5100, fuel_tank_capacity_gal: 17.5, fuel_type: 'gas' },
    { label: 'Jeep Gladiator Rubicon', make: 'Jeep', model: 'Gladiator', gvwr_lb: 6250, base_weight_lb: 5100, fuel_tank_capacity_gal: 22.0, fuel_type: 'gas' },
    { label: 'Jeep Grand Cherokee Trailhawk', make: 'Jeep', model: 'Grand Cherokee', gvwr_lb: 6500, base_weight_lb: 5050, fuel_tank_capacity_gal: 24.6, fuel_type: 'gas' },
  ],
  car_crossover: [
    { label: 'Subaru Forester Wilderness', make: 'Subaru', model: 'Forester', gvwr_lb: 4891, base_weight_lb: 3650, fuel_tank_capacity_gal: 16.6, fuel_type: 'gas' },
    { label: 'Subaru Outback Wilderness', make: 'Subaru', model: 'Outback', gvwr_lb: 5050, base_weight_lb: 3900, fuel_tank_capacity_gal: 18.5, fuel_type: 'gas' },
    { label: 'Subaru Crosstrek', make: 'Subaru', model: 'Crosstrek', gvwr_lb: 4630, base_weight_lb: 3500, fuel_tank_capacity_gal: 16.6, fuel_type: 'gas' },
    { label: 'Toyota RAV4 TRD Off-Road', make: 'Toyota', model: 'RAV4', gvwr_lb: 5060, base_weight_lb: 3900, fuel_tank_capacity_gal: 14.5, fuel_type: 'gas' },
    { label: 'Honda Passport TrailSport', make: 'Honda', model: 'Passport', gvwr_lb: 5500, base_weight_lb: 4300, fuel_tank_capacity_gal: 19.5, fuel_type: 'gas' },
    { label: 'Hyundai Santa Cruz', make: 'Hyundai', model: 'Santa Cruz', gvwr_lb: 5510, base_weight_lb: 4100, fuel_tank_capacity_gal: 17.7, fuel_type: 'gas' },
  ],
};

// ── Persistence ─────────────────────────────────────────
const LS_KEY = 'ecs_vehicle_specs';
const vehicleSpecPersistence = createPersistedKeyValueCache('ecs_vehicle_specs_store');

function getAllSpecs(): Record<string, VehicleSpec> {
  const raw = vehicleSpecPersistence.get(LS_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

function saveAllSpecs(specs: Record<string, VehicleSpec>): void {
  vehicleSpecPersistence.set(LS_KEY, JSON.stringify(specs));
}

function normalizeSpecNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

// ── Migration: backfill fuel and advanced-spec fields on existing specs ────
export function migrateSpec(spec: any): VehicleSpec {
  return {
    gvwr_lb: spec.gvwr_lb || 0,
    base_weight_lb: spec.base_weight_lb || 0,
    fuel_tank_capacity_gal: spec.fuel_tank_capacity_gal ?? 0,
    fuel_type: spec.fuel_type || 'diesel',
    hardware_additions_lb: spec.hardware_additions_lb,
    front_base_weight_lb: spec.front_base_weight_lb,
    rear_base_weight_lb: spec.rear_base_weight_lb,
    front_gawr_lb: spec.front_gawr_lb,
    rear_gawr_lb: spec.rear_gawr_lb,
    wheelbase_in: spec.wheelbase_in,
    ground_clearance_inches: spec.ground_clearance_inches,
    tire_size_inches: spec.tire_size_inches,
    suspension_lift_inches: normalizeSpecNumber(spec.suspension_lift_inches, 0),
    is_leveled: Boolean(spec.is_leveled ?? false),
    front_level_inches: spec.front_level_inches ?? null,
    trim: spec.trim,
    engine: spec.engine,
    drivetrain: spec.drivetrain,
    cab: spec.cab,
    bed_length: spec.bed_length,
    payload_capacity_lb: spec.payload_capacity_lb,
    overall_length_in: spec.overall_length_in,
    overall_width_in: spec.overall_width_in,
    overall_height_in: spec.overall_height_in,
    track_width_front_in: spec.track_width_front_in,
    track_width_rear_in: spec.track_width_rear_in,
    approach_angle_deg: spec.approach_angle_deg,
    breakover_angle_deg: spec.breakover_angle_deg,
    departure_angle_deg: spec.departure_angle_deg,
    turning_diameter_ft: spec.turning_diameter_ft,
    oem_reference_id: spec.oem_reference_id,
    oem_reference_label: spec.oem_reference_label,
    oem_reference_confidence: spec.oem_reference_confidence,
    oem_reference_notes: spec.oem_reference_notes,
  };
}

// ── Change listeners ────────────────────────────────────
type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notifyListeners() {
  listeners.forEach(fn => { try { fn(); } catch {} });
}

// ── Public API ──────────────────────────────────────────
export const vehicleSpecStore = {
  /**
   * Get specs for a specific vehicle. Returns null if not set.
   */
  get: (vehicleId: string): VehicleSpec | null => {
    const all = getAllSpecs();
    const raw = all[vehicleId];
    if (!raw) return null;
    return migrateSpec(raw);
  },

  /**
   * Set specs for a specific vehicle.
   */
  set: (vehicleId: string, spec: VehicleSpec): void => {
    const all = getAllSpecs();
    all[vehicleId] = spec;
    saveAllSpecs(all);
    notifyListeners();
  },

  /**
   * Update partial specs for a vehicle.
   */
  update: (vehicleId: string, partial: Partial<VehicleSpec>): void => {
    const all = getAllSpecs();
    const existing = all[vehicleId]
      ? migrateSpec(all[vehicleId])
      : { gvwr_lb: 0, base_weight_lb: 0, fuel_tank_capacity_gal: 0, fuel_type: 'diesel' as FuelType };
    all[vehicleId] = { ...existing, ...partial };
    saveAllSpecs(all);
    notifyListeners();
  },

  /**
   * Remove specs for a vehicle.
   */
  remove: (vehicleId: string): void => {
    const all = getAllSpecs();
    delete all[vehicleId];
    saveAllSpecs(all);
    notifyListeners();
  },

  /**
   * Get presets for a given vehicle type key.
   */
  getPresets: (vehicleType: string): VehicleSpecPreset[] => {
    return VEHICLE_SPEC_PRESETS[vehicleType] || [];
  },

  /**
   * Try to auto-match a preset based on vehicle make/model.
   */
  findPreset: (vehicleType: string, make?: string | null, model?: string | null): VehicleSpecPreset | null => {
    if (!make && !model) return null;
    const presets = VEHICLE_SPEC_PRESETS[vehicleType] || [];
    const makeLower = (make || '').toLowerCase();
    const modelLower = (model || '').toLowerCase();
    let bestMatch: { score: number; preset: VehicleSpecPreset } | null = null;

    for (const preset of presets) {
      const presetMake = (preset.make || '').toLowerCase();
      const presetModel = (preset.model || '').toLowerCase();
      const presetLabel = preset.label.toLowerCase();
      let score = 0;

      if (makeLower && presetMake === makeLower) score += 4;

      if (modelLower) {
        if (presetModel === modelLower || presetLabel === modelLower) {
          score += 6;
        } else if (
          presetModel.includes(modelLower) ||
          modelLower.includes(presetModel) ||
          presetLabel.includes(modelLower)
        ) {
          score += 3;
        }
      }

      if (score > (bestMatch?.score ?? 0)) {
        bestMatch = { score, preset };
      }
    }

    return bestMatch?.preset || null;
  },

  /**
   * Subscribe to spec changes.
   */
  subscribe: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  /**
   * Compute payload margin.
   * Returns null if specs are not set.
   */
  computePayloadMargin: (vehicleId: string, buildWeightLb: number): number | null => {
    const spec = vehicleSpecStore.get(vehicleId);
    if (!spec || !spec.gvwr_lb) return null;
    return spec.gvwr_lb - buildWeightLb;
  },

  /**
   * Compute build weight from base weight + hardware additions.
   * hardwareWeightLb = total mass from wizard modules (excluding base vehicle constant).
   */
  computeBuildWeight: (vehicleId: string, hardwareWeightLb: number): number | null => {
    const spec = vehicleSpecStore.get(vehicleId);
    if (!spec || !spec.base_weight_lb) return null;
    return spec.base_weight_lb + hardwareWeightLb;
  },

  /**
   * Compute fuel weight in lbs from a fuel percentage.
   * Uses fuel_tank_capacity_gal and fuel_type to convert.
   * Returns null if fuel specs are not configured.
   */
  computeFuelWeightLb: (vehicleId: string, fuelPercent: number): number | null => {
    const spec = vehicleSpecStore.get(vehicleId);
    if (!spec || !spec.fuel_tank_capacity_gal) return null;
    const fuelType = spec.fuel_type || 'diesel';
    const gallons = spec.fuel_tank_capacity_gal * (fuelPercent / 100);
    return gallons * FUEL_WEIGHT_PER_GAL[fuelType];
  },

  /**
   * Compute full-tank fuel weight in lbs.
   */
  computeFullTankWeightLb: (vehicleId: string): number | null => {
    const spec = vehicleSpecStore.get(vehicleId);
    if (!spec || !spec.fuel_tank_capacity_gal) return null;
    const fuelType = spec.fuel_type || 'diesel';
    return spec.fuel_tank_capacity_gal * FUEL_WEIGHT_PER_GAL[fuelType];
  },

  /**
   * Get the first stored spec (for dashboard widget when vehicleId is unknown).
   */
  getFirst: (): { vehicleId: string; spec: VehicleSpec } | null => {
    const all = getAllSpecs();
    const entries = Object.entries(all);
    if (entries.length === 0) return null;
    const [vehicleId, rawSpec] = entries[0];
    return { vehicleId, spec: migrateSpec(rawSpec) };
  },

  /**
   * Get all stored specs (for iteration).
   */
  getAll: (): Record<string, VehicleSpec> => {
    const raw = getAllSpecs();
    const migrated: Record<string, VehicleSpec> = {};
    for (const [k, v] of Object.entries(raw)) {
      migrated[k] = migrateSpec(v);
    }
    return migrated;
  },

  waitForHydration: (): Promise<void> => vehicleSpecPersistence.waitForHydration(),

  flush: (): Promise<void> => vehicleSpecPersistence.flush(),
};

