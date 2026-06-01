import type { Vehicle } from './types';
import type { ConsumablesState } from './consumablesStore';
import { FUEL_DENSITY_LB_PER_GAL, WATER_DENSITY_LB_PER_GAL } from './consumablesStore';
import type { TiresLiftConfig } from './tiresLiftStore';
import type { FuelType, VehicleSpec } from './vehicleSpecStore';

type WizardResourceMirror = {
  water_capacity_gal?: number | null;
  battery_usable_wh?: number | null;
};

type VehicleWithWizardConfig = Vehicle & {
  wizard_config?: {
    _resources?: WizardResourceMirror | null;
    [key: string]: any;
  } | null;
};

export type VehicleResourceProfile = {
  fuelTankCapacityGal: number | null;
  fuelType: FuelType;
  currentFuelPercent: number | null;
  currentFuelGallons: number;
  currentFuelWeightLb: number;
  waterCapacityGal: number | null;
  currentWaterGallons: number;
  currentWaterWeightLb: number;
  batteryUsableWh: number | null;
  tireSizeInches: number | null;
  suspensionLiftInches: number;
  isLeveled: boolean;
  frontLevelInches: number | null;
};

function normalizeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value > 0 ? value : null;
}

function normalizeNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value >= 0 ? value : null;
}

function normalizePercent(value: unknown): number | null {
  const normalized = normalizeNonNegativeNumber(value);
  if (normalized == null) return null;
  return Math.max(0, Math.min(100, normalized));
}

function normalizeFuelType(value: unknown): FuelType {
  return value === 'gas' || value === 'diesel' ? value : 'gas';
}

type VehicleResourceProfileInputs = {
  spec?: VehicleSpec | null;
  consumables?: ConsumablesState | null;
  tiresLift?: TiresLiftConfig | null;
};

export function getVehicleResourceProfile(
  vehicle: VehicleWithWizardConfig | null | undefined,
  inputs: VehicleResourceProfileInputs = {},
): VehicleResourceProfile {
  const mirrored = vehicle?.wizard_config?._resources;
  const spec = inputs.spec ?? null;
  const consumables = inputs.consumables ?? null;
  const tiresLift = inputs.tiresLift ?? null;
  const fuelTankCapacityGal = normalizeNumber(
    spec?.fuel_tank_capacity_gal ?? vehicle?.fuel_tank_capacity_gal ?? null,
  );
  const fuelType = normalizeFuelType(spec?.fuel_type ?? vehicle?.fuel_type);
  const currentFuelPercent = normalizePercent(
    consumables?.fuel_percent_current ?? vehicle?.current_fuel_percent ?? null,
  );
  const explicitFuelGallons = normalizeNonNegativeNumber(consumables?.fuel_gal_current);
  const currentFuelGallons =
    explicitFuelGallons ??
    (fuelTankCapacityGal != null && currentFuelPercent != null
      ? fuelTankCapacityGal * (currentFuelPercent / 100)
      : 0);
  const currentWaterGallons =
    normalizeNonNegativeNumber(consumables?.water_gal_current ?? vehicle?.current_water_gal ?? null) ?? 0;
  const waterCapacityGal = normalizeNumber(
    vehicle?.water_capacity_gal ?? mirrored?.water_capacity_gal ?? null,
  ) ?? normalizeNumber(currentWaterGallons);
  const tireSizeInches = normalizeNumber(
    tiresLift?.tireSizeInches ?? spec?.tire_size_inches ?? vehicle?.tire_size_inches ?? null,
  );
  const suspensionLiftInches =
    normalizeNonNegativeNumber(
      tiresLift?.suspensionLiftInches ??
      spec?.suspension_lift_inches ??
      vehicle?.suspension_lift_inches ??
      null,
    ) ?? 0;
  const isLeveled = Boolean(tiresLift?.isLeveled ?? spec?.is_leveled ?? vehicle?.is_leveled ?? false);
  const frontLevelInches = normalizeNonNegativeNumber(
    tiresLift?.frontLevelInches ?? spec?.front_level_inches ?? vehicle?.front_level_inches ?? null,
  );

  return {
    fuelTankCapacityGal,
    fuelType,
    currentFuelPercent,
    currentFuelGallons,
    currentFuelWeightLb: currentFuelGallons * FUEL_DENSITY_LB_PER_GAL[fuelType],
    waterCapacityGal,
    currentWaterGallons,
    currentWaterWeightLb: currentWaterGallons * WATER_DENSITY_LB_PER_GAL,
    batteryUsableWh: normalizeNumber(
      vehicle?.battery_usable_wh ?? mirrored?.battery_usable_wh ?? null,
    ),
    tireSizeInches,
    suspensionLiftInches,
    isLeveled,
    frontLevelInches,
  };
}

export function buildVehicleResourceMirror(
  existingWizardConfig: Record<string, any> | null | undefined,
  resources: {
    waterCapacityGal?: number | null;
    batteryUsableWh?: number | null;
  },
): Record<string, any> {
  const existing = existingWizardConfig && typeof existingWizardConfig === 'object'
    ? existingWizardConfig
    : {};
  const existingResources = existing._resources && typeof existing._resources === 'object'
    ? existing._resources
    : {};

  return {
    ...existing,
    _resources: {
      ...existingResources,
      water_capacity_gal: normalizeNumber(resources.waterCapacityGal ?? null),
      battery_usable_wh: normalizeNumber(resources.batteryUsableWh ?? null),
    },
  };
}
