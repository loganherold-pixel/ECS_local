import type { Vehicle } from './types';

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
  waterCapacityGal: number | null;
  batteryUsableWh: number | null;
};

function normalizeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value > 0 ? value : null;
}

export function getVehicleResourceProfile(
  vehicle: VehicleWithWizardConfig | null | undefined,
): VehicleResourceProfile {
  const mirrored = vehicle?.wizard_config?._resources;

  return {
    fuelTankCapacityGal: normalizeNumber(vehicle?.fuel_tank_capacity_gal ?? null),
    waterCapacityGal: normalizeNumber(
      vehicle?.water_capacity_gal ?? mirrored?.water_capacity_gal ?? null,
    ),
    batteryUsableWh: normalizeNumber(
      vehicle?.battery_usable_wh ?? mirrored?.battery_usable_wh ?? null,
    ),
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
