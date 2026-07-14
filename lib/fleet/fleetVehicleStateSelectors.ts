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
import { incrementECSPerformanceCounter } from '../performance/ecsPerformanceDiagnostics';

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

export type FleetVehicleStateSelectorDiagnostics = {
  calculations: number;
  cacheHits: number;
  evictions: number;
  cacheSize: number;
  maxCacheSize: number;
};

const MAX_FLEET_VEHICLE_STATE_CACHE_SIZE = 24;
const fleetVehicleStateCache = new Map<string, {
  fingerprint: string;
  state: FleetCanonicalVehicleState;
}>();
let fleetVehicleStateCalculations = 0;
let fleetVehicleStateCacheHits = 0;
let fleetVehicleStateEvictions = 0;

function stableSerialize(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'invalid-number';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(String(value));
}

function hashFingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createFleetVehicleStateFingerprint(input: {
  vehicle: VehicleWithFleetExtensions;
  spec: VehicleSpec | null;
  consumables: ConsumablesState;
  tiresLift: TiresLiftConfig | null;
  activeLoadout: LocalLoadout | null;
  legacyLoadoutItems: readonly LocalLoadoutItem[];
  buildLoadoutState: FleetBuildLoadoutState;
  frameworkContainerZones: readonly ContainerZone[];
  useCaseChips: readonly string[];
}): string {
  return hashFingerprint(stableSerialize(input));
}

export function invalidateFleetVehicleStateCache(vehicleId?: string | null): void {
  if (vehicleId) fleetVehicleStateCache.delete(vehicleId);
  else fleetVehicleStateCache.clear();
}

export function getFleetVehicleStateSelectorDiagnostics(): FleetVehicleStateSelectorDiagnostics {
  return {
    calculations: fleetVehicleStateCalculations,
    cacheHits: fleetVehicleStateCacheHits,
    evictions: fleetVehicleStateEvictions,
    cacheSize: fleetVehicleStateCache.size,
    maxCacheSize: MAX_FLEET_VEHICLE_STATE_CACHE_SIZE,
  };
}

export function resetFleetVehicleStateSelectorDiagnosticsForTests(): void {
  fleetVehicleStateCalculations = 0;
  fleetVehicleStateCacheHits = 0;
  fleetVehicleStateEvictions = 0;
  fleetVehicleStateCache.clear();
}

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
  const fingerprint = createFleetVehicleStateFingerprint({
    vehicle,
    spec,
    consumables,
    tiresLift,
    activeLoadout,
    legacyLoadoutItems,
    buildLoadoutState,
    frameworkContainerZones,
    useCaseChips,
  });
  const cached = fleetVehicleStateCache.get(vehicle.id);
  if (cached?.fingerprint === fingerprint) {
    fleetVehicleStateCacheHits += 1;
    incrementECSPerformanceCounter('active_vehicle_propagation', 'fleet_selector_cache_hits');
    return cached.state;
  }

  fleetVehicleStateCalculations += 1;
  incrementECSPerformanceCounter('active_vehicle_propagation', 'fleet_selector_calculations');
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

  const state: FleetCanonicalVehicleState = {
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
  if (!fleetVehicleStateCache.has(vehicle.id) && fleetVehicleStateCache.size >= MAX_FLEET_VEHICLE_STATE_CACHE_SIZE) {
    const oldestVehicleId = fleetVehicleStateCache.keys().next().value as string | undefined;
    if (oldestVehicleId) {
      fleetVehicleStateCache.delete(oldestVehicleId);
      fleetVehicleStateEvictions += 1;
    }
  }
  fleetVehicleStateCache.delete(vehicle.id);
  fleetVehicleStateCache.set(vehicle.id, { fingerprint, state });
  return state;
}

export function selectFleetVehicleState(vehicleId: string | null | undefined): FleetCanonicalVehicleState | null {
  if (!vehicleId) return null;
  const vehicle = vehicleStore.getById(vehicleId) as VehicleWithFleetExtensions | null;
  return vehicle ? selectFleetVehicleStateFromRecord({ vehicle }) : null;
}
