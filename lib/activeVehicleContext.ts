import { consumablesStore } from './consumablesStore';
import { tiresLiftStore } from './tiresLiftStore';
import { vehicleSetupStore } from './vehicleSetupStore';
import { vehicleSpecStore } from './vehicleSpecStore';
import { getVehicleResourceProfile } from './vehicleResourceProfile';
import { vehicleStore } from './vehicleStore';
import {
  getAccessoryFrameworkSummary,
  getInstalledAccessoryCount,
  getPlannedAccessoryCount,
  normalizeAccessoryFramework,
  sanitizeContainerZones,
} from './accessoryFramework';
import { getZoneSummaryString } from './vehicleSystemsIntegration';
import {
  loadoutItemStore,
  loadoutStore,
  type LocalLoadoutItem,
} from './loadoutStore';
import type { TripBuilderConfidence, TripBuilderVehicleProfile } from './tripBuilder/tripBuilderTypes';
import { generateFleetFabricPayloadFromSource } from './fleet/fleetFabricService';
import {
  buildActiveVehicleStateFromFleetState,
  getActiveVehicleState,
} from './fleet/activeVehicleState';
import { selectFleetVehicleStateFromRecord } from './fleet/fleetVehicleStateSelectors';
import type { ActiveVehicleContext, VehicleWithExtensions } from './vehicle/activeVehicleTypes';
import type { VehicleSpec } from './vehicleSpecStore';

export type { ActiveVehicleContext, VehicleWithExtensions } from './vehicle/activeVehicleTypes';

function buildProfileSignature(context: Omit<ActiveVehicleContext, 'profileSignature'>): string {
  return JSON.stringify({
    activeVehicleId: context.activeVehicleId,
    updatedAt: context.vehicle?.updated_at ?? null,
    vehicleName: context.vehicle?.name ?? null,
    vehicleType: context.vehicle?.type ?? null,
    vehicleMake: context.vehicle?.make ?? null,
    vehicleModel: context.vehicle?.model ?? null,
    vehicleYear: context.vehicle?.year ?? null,
    vehicleTrim:
      typeof context.wizardConfig?.trim === 'string'
        ? context.wizardConfig.trim
        : null,
    wizardVehicleType:
      typeof context.wizardConfig?.vehicleType === 'string'
        ? context.wizardConfig.vehicleType
        : typeof context.wizardConfig?.platformType === 'string'
          ? context.wizardConfig.platformType
          : null,
    wizardBodyType:
      typeof context.wizardConfig?.bodyType === 'string'
        ? context.wizardConfig.bodyType
        : null,
    fuelTankCapacityGal: context.spec?.fuel_tank_capacity_gal ?? context.resourceProfile.fuelTankCapacityGal,
    fuelType: context.resourceProfile.fuelType,
    currentFuelGallons: context.resourceProfile.currentFuelGallons,
    currentFuelWeightLb: context.resourceProfile.currentFuelWeightLb,
    waterCapacityGal: context.resourceProfile.waterCapacityGal,
    currentWaterGallons: context.resourceProfile.currentWaterGallons,
    currentWaterWeightLb: context.resourceProfile.currentWaterWeightLb,
    batteryUsableWh: context.resourceProfile.batteryUsableWh,
    fuelPercentCurrent: context.resourceProfile.currentFuelPercent,
    waterGallonsCurrent: context.resourceProfile.currentWaterGallons,
    tireSizeInches: context.resourceProfile.tireSizeInches,
    suspensionLiftInches: context.resourceProfile.suspensionLiftInches,
    isLeveled: context.resourceProfile.isLeveled,
    frontLevelInches: context.resourceProfile.frontLevelInches,
    accessoryCount: context.accessoryInstalledCount,
    plannedAccessoryCount: context.accessoryPlannedCount,
    containerZoneCount: context.containerZones.length,
    zoneSummary: context.zoneSummary,
    loadoutId: context.loadout?.id ?? null,
    loadoutUpdatedAt: context.loadout?.updated_at ?? null,
    loadoutItemCount: context.loadoutItemCount,
    loadoutTotalWeightLbs: context.loadoutTotalWeightLbs,
    vehicleStateSignature: context.vehicleState.signature,
  });
}

function sumLoadoutWeight(items: LocalLoadoutItem[]): number {
  return items.reduce((total, item) => {
    const quantity = Number.isFinite(item.quantity) ? Math.max(1, item.quantity) : 1;
    const weight = Number.isFinite(item.weight_lbs as number) ? Math.max(0, item.weight_lbs as number) : 0;
    return total + (weight * quantity);
  }, 0);
}

function positiveNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function tripBuilderConfidenceFromVehicleContext(context: ActiveVehicleContext): TripBuilderConfidence {
  switch (context.vehicleState.confidence.label) {
    case 'verified':
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return context.hasVehicleContext ? 'low' : 'unknown';
  }
}

export function getVehicleContext(vehicleId: string | null | undefined): ActiveVehicleContext {
  if (!vehicleId) {
    const vehicleState = getActiveVehicleState(null);
    const emptyContext: Omit<ActiveVehicleContext, 'profileSignature'> = {
      activeVehicleId: null,
      hasActiveVehicleId: false,
      vehicle: null,
      spec: null,
      consumables: null,
      tiresLift: null,
      resourceProfile: getVehicleResourceProfile(null),
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
      vehicleState,
      weightSnapshot: vehicleState.weight,
      capabilitySnapshot: vehicleState.capability,
      intelligenceSnapshot: vehicleState.intelligence,
      fleetFabricPayload: null,
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
  const resourceProfile = getVehicleResourceProfile(vehicle, { spec, consumables, tiresLift });
  const accessoryFramework = normalizeAccessoryFramework(vehicle?.accessoryFramework ?? null);
  const containerZones = sanitizeContainerZones(vehicle?.containerZones);
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
  const fleetState = vehicle
    ? selectFleetVehicleStateFromRecord({
        vehicle,
        spec,
        consumables,
        tiresLift,
        activeLoadout: loadout,
        legacyLoadoutItems: loadoutItems,
        frameworkContainerZones: containerZones,
      })
    : null;
  const vehicleState = buildActiveVehicleStateFromFleetState(fleetState, vehicleId);

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
    vehicleState,
    weightSnapshot: vehicleState.weight,
    capabilitySnapshot: vehicleState.capability,
    intelligenceSnapshot: vehicleState.intelligence,
    fleetFabricPayload: vehicle
        ? generateFleetFabricPayloadFromSource({
            vehicle,
            specs: spec,
            consumables,
            tiresLift,
            containerZones,
            activeLoadout: loadout,
            loadoutItems,
          tacticalUiState: { routeTarget: 'fleet' },
        })
      : null,
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
        resourceProfile.batteryUsableWh != null ||
        resourceProfile.currentFuelGallons > 0 ||
        resourceProfile.currentWaterGallons > 0 ||
        resourceProfile.tireSizeInches != null ||
        resourceProfile.suspensionLiftInches > 0 ||
        resourceProfile.isLeveled
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

/**
 * Resolves the current operational rig first and uses a route/build vehicle only
 * when Fleet has no active selection. Historical route metadata must not pin
 * Navigate, CampOps, or readiness consumers to a vehicle that is no longer
 * active.
 */
export function getActiveVehicleContextWithFallback(
  fallbackVehicleId: string | null | undefined,
): ActiveVehicleContext {
  const activeVehicleId = vehicleSetupStore.getActiveVehicleId();
  return getVehicleContext(activeVehicleId ?? fallbackVehicleId);
}

export function getActiveVehicle(): VehicleWithExtensions | null {
  return getActiveVehicleContext().vehicle;
}

export function getActiveVehicleSpec(): VehicleSpec | null {
  return getActiveVehicleContext().spec;
}

export function getActiveVehicleTripBuilderProfile(): TripBuilderVehicleProfile | null {
  const context = getActiveVehicleContext();
  if (!context.hasVehicleContext) return null;

  const vehicle = context.vehicle;
  const resourceProfile = context.resourceProfile;
  const fuelCapacity = positiveNumber(resourceProfile.fuelTankCapacityGal);
  const avgMpg = positiveNumber(vehicle?.avg_mpg ?? null);
  const rangeFuelGallons = positiveNumber(resourceProfile.currentFuelGallons) ?? fuelCapacity;
  const rangeMiles = avgMpg && rangeFuelGallons ? roundToTenth(avgMpg * rangeFuelGallons) : null;
  const hasManualFuelInput = Boolean(
    fuelCapacity ||
      avgMpg ||
      resourceProfile.currentFuelPercent != null ||
      positiveNumber(vehicle?.current_fuel_percent ?? null),
  );
  const waterCapacity = positiveNumber(resourceProfile.waterCapacityGal);
  const accessoryLabels = context.accessorySummary
    .map((item) => item.label)
    .filter(Boolean);

  return {
    id: context.activeVehicleId,
    label: vehicle?.name ?? context.vehicleState.identity.displayName,
    vehicleType: vehicle?.type ?? context.vehicleState.identity.vehicleType,
    rangeMiles,
    rangeSource: rangeMiles == null ? 'unknown' : hasManualFuelInput ? 'manual' : 'estimated',
    fuelTankCapacityGal: fuelCapacity,
    avgMpg,
    currentFuelGallons: resourceProfile.currentFuelGallons,
    fuelLevelPct: resourceProfile.currentFuelPercent,
    waterCapacityGal: waterCapacity,
    currentWaterGallons: resourceProfile.currentWaterGallons,
    waterSource: waterCapacity || resourceProfile.currentWaterGallons > 0 ? 'manual' : 'unknown',
    payloadRemainingLbs: context.weightSnapshot.remainingPayloadLbs,
    clearanceInches: positiveNumber(context.spec?.ground_clearance_inches ?? vehicle?.ground_clearance_inches ?? null),
    tireSizeInches: positiveNumber(resourceProfile.tireSizeInches),
    trailerAttached: null,
    supportReadiness: {
      water: waterCapacity != null || resourceProfile.currentWaterGallons > 0,
      foodSupplies: null,
      repair: null,
      medical: null,
      recovery: accessoryLabels.some((label) => /recovery|winch|traction|strap|shackle/i.test(label)) || null,
      source: 'activeVehicleContext',
      labels: accessoryLabels,
    },
    confidence: tripBuilderConfidenceFromVehicleContext(context),
    source: 'activeVehicleContext',
    updatedAt: context.vehicleState.updatedAt,
  };
}

export {
  getActiveVehicleState,
  getVehicleCapabilitySnapshot,
  getVehicleWeightSnapshot,
  subscribeActiveVehicleState,
  waitForActiveVehicleStateHydration,
} from './fleet/activeVehicleState';
export type {
  ECSVehicleCapabilitySnapshot,
  ECSVehicleCenterOfGravitySnapshot,
  ECSVehicleConfidenceLabel,
  ECSVehicleIdentitySnapshot,
  ECSVehicleIntelligenceSnapshot,
  ECSVehicleLoadoutSnapshot,
  ECSVehicleModificationSnapshot,
  ECSVehicularState,
  ECSVehicularStateStatus,
  ECSVehicleWeightSnapshot,
} from './fleet/activeVehicleState';
