import type { ContainerZone } from '../accessoryFramework';
import { resolveVehicleContainerZones } from '../accessoryFramework';
import {
  loadoutItemStore,
  loadoutStore,
  type LocalLoadout,
  type LocalLoadoutItem,
} from '../loadoutStore';
import type { Vehicle } from '../types';
import { getVehicleResourceProfile, type VehicleResourceProfile } from '../vehicleResourceProfile';
import { consumablesStore, type ConsumablesState } from '../consumablesStore';
import { tiresLiftStore, type TiresLiftConfig } from '../tiresLiftStore';
import { vehicleSpecStore, type VehicleSpec } from '../vehicleSpecStore';
import { vehicleStore } from '../vehicleStore';
import {
  adaptLegacyVehicleToFleetVehicle,
  scoreFleetVehicle,
  type FleetAccessoryInstall,
  type FleetLoadoutItem,
  type FleetScoringResult,
  type FleetVehicle,
} from './fleetPremiumDomain';
import {
  readFleetBuildLoadoutState,
  type FleetBuildLoadoutState,
} from './fleetBuildLoadout';
import {
  calculateVehicleOperatingWeight,
  type FleetOperatingWeightOutput,
} from './fleetOperatingWeight';
import {
  buildFleetWeightSummary,
  type FleetWeightSummary,
} from './fleetWeightSummary';

type VehicleWithFleetExtensions = Vehicle & {
  wizard_config?: Record<string, any> | null;
  containerZones?: ContainerZone[] | null;
};

export type FleetCanonicalWeightNames = {
  baseVehicleWeight: 'baseNetWeight';
  accessoryLoadoutWeight: 'installedAccessoryWeight + activeLoadoutWeight';
  waterWeight: 'currentWaterWeight';
  fuelWeight: 'currentFuelWeight';
  totalOperationalVehicleWeight: 'operatingWeight';
  centerOfGravityAdjustedLoadout: 'centerOfGravity';
};

export type FleetCanonicalVehicleState = {
  vehicle: VehicleWithFleetExtensions;
  spec: VehicleSpec | null;
  consumables: ConsumablesState;
  tiresLift: TiresLiftConfig | null;
  resourceProfile: VehicleResourceProfile;
  fleetVehicle: FleetVehicle;
  useCaseChips: string[];
  activeLoadout: LocalLoadout | null;
  legacyLoadoutItems: LocalLoadoutItem[];
  buildLoadoutState: FleetBuildLoadoutState;
  frameworkContainerZones: ContainerZone[];
  accessories: FleetAccessoryInstall[];
  loadoutItems: FleetLoadoutItem[];
  operatingWeight: FleetOperatingWeightOutput;
  scoringResult: FleetScoringResult;
  weightSummary: FleetWeightSummary;
  naming: FleetCanonicalWeightNames;
};

export type FleetVehicleStateSelectorInput = {
  vehicle: VehicleWithFleetExtensions;
  spec?: VehicleSpec | null;
  consumables?: ConsumablesState | null;
  tiresLift?: TiresLiftConfig | null;
  activeLoadout?: LocalLoadout | null;
  legacyLoadoutItems?: readonly LocalLoadoutItem[] | null;
  buildLoadoutState?: FleetBuildLoadoutState | null;
  frameworkContainerZones?: readonly ContainerZone[] | null;
  useCaseChips?: readonly string[] | null;
};

export const FLEET_CANONICAL_WEIGHT_NAMES: FleetCanonicalWeightNames = {
  baseVehicleWeight: 'baseNetWeight',
  accessoryLoadoutWeight: 'installedAccessoryWeight + activeLoadoutWeight',
  waterWeight: 'currentWaterWeight',
  fuelWeight: 'currentFuelWeight',
  totalOperationalVehicleWeight: 'operatingWeight',
  centerOfGravityAdjustedLoadout: 'centerOfGravity',
};

export function resolveFleetUseCaseChips(vehicle: VehicleWithFleetExtensions): string[] {
  const wizardConfig =
    vehicle?.wizard_config && typeof vehicle.wizard_config === 'object'
      ? vehicle.wizard_config
      : {};
  const rawUseCases = [
    wizardConfig.primary_use_case,
    wizardConfig.use_case,
    ...(Array.isArray(wizardConfig.use_cases) ? wizardConfig.use_cases : []),
  ].filter(Boolean);
  const chips = rawUseCases
    .map((value) => String(value).replace(/[_-]+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 4);
  return chips.length > 0 ? chips : ['daily'];
}

export function selectFleetVehicleStateFromRecord(
  input: FleetVehicleStateSelectorInput,
): FleetCanonicalVehicleState {
  const vehicle = input.vehicle;
  const spec = input.spec === undefined ? vehicleSpecStore.get(vehicle.id) : input.spec;
  const consumables = input.consumables ?? consumablesStore.get(vehicle.id);
  const tiresLift = input.tiresLift === undefined ? tiresLiftStore.get(vehicle.id) : input.tiresLift;
  const resourceProfile = getVehicleResourceProfile(vehicle, { spec, consumables, tiresLift });
  const useCaseChips = [...(input.useCaseChips ?? resolveFleetUseCaseChips(vehicle))];
  const activeLoadout =
    input.activeLoadout === undefined
      ? loadoutStore.getLatestLocalByVehicleIdSync(vehicle.id)
      : input.activeLoadout;
  const legacyLoadoutItems =
    input.legacyLoadoutItems == null
      ? activeLoadout
        ? loadoutItemStore.getLocalByLoadoutIdSync(activeLoadout.id)
        : []
      : [...input.legacyLoadoutItems];
  const buildLoadoutState =
    input.buildLoadoutState ?? readFleetBuildLoadoutState(vehicle);
  const frameworkContainerZones = [
    ...(input.frameworkContainerZones ?? resolveVehicleContainerZones(vehicle)),
  ];
  const fleetVehicle = adaptLegacyVehicleToFleetVehicle({
    vehicle,
    specs: spec as any,
    consumables,
    tiresLift: tiresLift as any,
    useCases: useCaseChips,
  });
  const operatingWeight = calculateVehicleOperatingWeight({
    vehicle: fleetVehicle,
    buildState: buildLoadoutState,
    legacyLoadoutItems,
    frameworkContainerZones,
  });
  const scoringResult = scoreFleetVehicle(fleetVehicle, operatingWeight.weightResult, []);
  const weightSummary = buildFleetWeightSummary(fleetVehicle, operatingWeight.weightResult, scoringResult);

  return {
    vehicle,
    spec,
    consumables,
    tiresLift,
    resourceProfile,
    fleetVehicle,
    useCaseChips,
    activeLoadout,
    legacyLoadoutItems,
    buildLoadoutState,
    frameworkContainerZones,
    accessories: operatingWeight.accessories,
    loadoutItems: operatingWeight.loadoutItems,
    operatingWeight,
    scoringResult,
    weightSummary,
    naming: FLEET_CANONICAL_WEIGHT_NAMES,
  };
}

export function selectFleetVehicleState(vehicleId: string | null | undefined): FleetCanonicalVehicleState | null {
  if (!vehicleId) return null;
  const vehicle = vehicleStore.getById(vehicleId) as VehicleWithFleetExtensions | null;
  return vehicle ? selectFleetVehicleStateFromRecord({ vehicle }) : null;
}
