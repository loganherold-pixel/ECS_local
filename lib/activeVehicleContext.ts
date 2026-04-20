import type { Vehicle } from './types';
import { consumablesStore, type ConsumablesState } from './consumablesStore';
import { tiresLiftStore, type TiresLiftConfig } from './tiresLiftStore';
import { vehicleSetupStore } from './vehicleSetupStore';
import { vehicleSpecStore, type VehicleSpec } from './vehicleSpecStore';
import { getVehicleResourceProfile, type VehicleResourceProfile } from './vehicleResourceProfile';
import { vehicleStore } from './vehicleStore';
import {
  getAccessoryFrameworkSummary,
  getInstalledAccessoryCount,
  getPlannedAccessoryCount,
} from './accessoryFramework';
import { getZoneSummaryString } from './vehicleSystemsIntegration';
import {
  loadoutItemStore,
  loadoutStore,
  type LocalLoadout,
  type LocalLoadoutItem,
} from './loadoutStore';

type VehicleWithExtensions = Vehicle & {
  wizard_config?: Record<string, any> | null;
  accessoryFramework?: any;
  containerZones?: any[] | null;
};

export interface ActiveVehicleContext {
  activeVehicleId: string | null;
  hasActiveVehicleId: boolean;
  vehicle: VehicleWithExtensions | null;
  spec: VehicleSpec | null;
  consumables: ConsumablesState | null;
  tiresLift: TiresLiftConfig | null;
  resourceProfile: VehicleResourceProfile;
  accessoryFramework: any | null;
  containerZones: any[];
  accessorySummary: { label: string; status: string; color: string }[];
  accessoryInstalledCount: number;
  accessoryPlannedCount: number;
  zoneSummary: string;
  loadout: LocalLoadout | null;
  loadoutItems: LocalLoadoutItem[];
  loadoutItemCount: number;
  loadoutTotalWeightLbs: number;
  wizardConfig: Record<string, any> | null;
  hasVehicleRecord: boolean;
  hasVehicleContext: boolean;
  profileSignature: string;
}

function buildProfileSignature(context: Omit<ActiveVehicleContext, 'profileSignature'>): string {
  return JSON.stringify({
    activeVehicleId: context.activeVehicleId,
    updatedAt: context.vehicle?.updated_at ?? null,
    fuelTankCapacityGal: context.spec?.fuel_tank_capacity_gal ?? context.resourceProfile.fuelTankCapacityGal,
    waterCapacityGal: context.resourceProfile.waterCapacityGal,
    batteryUsableWh: context.resourceProfile.batteryUsableWh,
    fuelPercentCurrent: context.consumables?.fuel_percent_current ?? null,
    waterGallonsCurrent: context.consumables?.water_gal_current ?? null,
    tireSizeInches: context.tiresLift?.tireSizeInches ?? null,
    suspensionLiftInches: context.tiresLift?.suspensionLiftInches ?? null,
    isLeveled: context.tiresLift?.isLeveled ?? false,
    accessoryCount: context.accessoryInstalledCount,
    plannedAccessoryCount: context.accessoryPlannedCount,
    containerZoneCount: context.containerZones.length,
    zoneSummary: context.zoneSummary,
    loadoutId: context.loadout?.id ?? null,
    loadoutUpdatedAt: context.loadout?.updated_at ?? null,
    loadoutItemCount: context.loadoutItemCount,
    loadoutTotalWeightLbs: context.loadoutTotalWeightLbs,
  });
}

function sumLoadoutWeight(items: LocalLoadoutItem[]): number {
  return items.reduce((total, item) => {
    const quantity = Number.isFinite(item.quantity) ? Math.max(1, item.quantity) : 1;
    const weight = Number.isFinite(item.weight_lbs as number) ? Math.max(0, item.weight_lbs as number) : 0;
    return total + (weight * quantity);
  }, 0);
}

export function getVehicleContext(vehicleId: string | null | undefined): ActiveVehicleContext {
  if (!vehicleId) {
    const emptyContext: Omit<ActiveVehicleContext, 'profileSignature'> = {
      activeVehicleId: null,
      hasActiveVehicleId: false,
      vehicle: null,
      spec: null,
      consumables: null,
      tiresLift: null,
      resourceProfile: {
        fuelTankCapacityGal: null,
        waterCapacityGal: null,
        batteryUsableWh: null,
      },
      accessoryFramework: null,
      containerZones: [],
      accessorySummary: [],
      accessoryInstalledCount: 0,
      accessoryPlannedCount: 0,
      zoneSummary: '',
      loadout: null,
      loadoutItems: [],
      loadoutItemCount: 0,
      loadoutTotalWeightLbs: 0,
      wizardConfig: null,
      hasVehicleRecord: false,
      hasVehicleContext: false,
    };

    return {
      ...emptyContext,
      profileSignature: buildProfileSignature(emptyContext),
    };
  }

  const vehicle = vehicleStore.getById(vehicleId) as VehicleWithExtensions | null;
  const spec = vehicleSpecStore.get(vehicleId);
  const consumables = consumablesStore.get(vehicleId);
  const tiresLift = tiresLiftStore.get(vehicleId);
  const resourceProfile = getVehicleResourceProfile(vehicle);
  const accessoryFramework = vehicle?.accessoryFramework ?? null;
  const containerZones = Array.isArray(vehicle?.containerZones) ? vehicle.containerZones : [];
  const accessorySummary = accessoryFramework ? getAccessoryFrameworkSummary(accessoryFramework) : [];
  const accessoryInstalledCount = accessoryFramework ? getInstalledAccessoryCount(accessoryFramework) : 0;
  const accessoryPlannedCount = accessoryFramework ? getPlannedAccessoryCount(accessoryFramework) : 0;
  const zoneSummary = getZoneSummaryString(accessoryFramework, containerZones, 4);
  const loadout = loadoutStore.getLatestLocalByVehicleIdSync(vehicleId);
  const loadoutItems = loadout ? loadoutItemStore.getLocalByLoadoutIdSync(loadout.id) : [];
  const loadoutItemCount = loadoutItems.length;
  const loadoutTotalWeightLbs =
    loadout?.total_weight_lbs != null && Number.isFinite(loadout.total_weight_lbs)
      ? loadout.total_weight_lbs
      : sumLoadoutWeight(loadoutItems);
  const wizardConfig =
    vehicle?.wizard_config && typeof vehicle.wizard_config === 'object'
      ? vehicle.wizard_config
      : null;

  const baseContext: Omit<ActiveVehicleContext, 'profileSignature'> = {
    activeVehicleId: vehicleId,
    hasActiveVehicleId: true,
    vehicle,
    spec,
    consumables,
    tiresLift,
    resourceProfile,
    accessoryFramework,
    containerZones,
    accessorySummary,
    accessoryInstalledCount,
    accessoryPlannedCount,
    zoneSummary,
    loadout,
    loadoutItems,
    loadoutItemCount,
    loadoutTotalWeightLbs,
    wizardConfig,
    hasVehicleRecord: Boolean(vehicle),
    hasVehicleContext: Boolean(
      vehicle ||
        spec ||
        tiresLift ||
        loadout ||
        accessoryInstalledCount > 0 ||
        accessoryPlannedCount > 0 ||
        resourceProfile.fuelTankCapacityGal != null ||
        resourceProfile.waterCapacityGal != null ||
        resourceProfile.batteryUsableWh != null
    ),
  };

  return {
    ...baseContext,
    profileSignature: buildProfileSignature(baseContext),
  };
}

export function getActiveVehicleContext(): ActiveVehicleContext {
  return getVehicleContext(vehicleSetupStore.getActiveVehicleId());
}

export function getActiveVehicle(): VehicleWithExtensions | null {
  return getActiveVehicleContext().vehicle;
}
