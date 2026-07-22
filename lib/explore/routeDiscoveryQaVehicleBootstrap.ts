import { resolveBuildProfileStoragePartition, type EcsStoragePartition } from '../buildProfileStoragePartition';
import { setupStore } from '../setupStore';
import { tiresLiftStore, type TiresLiftConfig } from '../tiresLiftStore';
import type { Vehicle } from '../types';
import { vehicleSetupStore } from '../vehicleSetupStore';
import { vehicleSpecStore, type VehicleSpec } from '../vehicleSpecStore';
import { vehicleStore } from '../vehicleStore';
import { getRouteDiscoveryQaRuntime } from './routeDiscoveryQaRuntime';

export const ROUTE_DISCOVERY_QA_VEHICLE_ID = 'qa-route-discovery-vehicle';
export const ROUTE_DISCOVERY_QA_VEHICLE_NAME = 'QA SYNTHETIC 4X4';
const QA_FIXTURE_TIMESTAMP = '2026-01-01T00:00:00.000Z';

type QaVehicle = Vehicle & {
  wizard_config: {
    vehicleType: 'truck';
    drivetrain: '4x4';
    fourWheelDrive: true;
    qaSynthetic: true;
    source: 'route_discovery_qa_local_fixture';
  };
};

export const ROUTE_DISCOVERY_QA_VEHICLE: Readonly<QaVehicle> = Object.freeze<QaVehicle>({
  id: ROUTE_DISCOVERY_QA_VEHICLE_ID,
  owner_user_id: 'qa-route-discovery-local',
  name: ROUTE_DISCOVERY_QA_VEHICLE_NAME,
  type: 'truck',
  make: null,
  model: null,
  year: null,
  notes: 'Synthetic local-only route-discovery QA fixture.',
  fuel_tank_capacity_gal: 24,
  avg_mpg: 15,
  current_fuel_percent: 100,
  water_capacity_gal: 10,
  current_water_gal: 10,
  water_updated_at: QA_FIXTURE_TIMESTAMP,
  battery_usable_wh: null,
  fuel_type: 'gas',
  base_weight_lb: 5000,
  curb_weight_lb: 5000,
  empty_weight_lb: 5000,
  gvwr_lb: 7000,
  tire_size_inches: 33,
  suspension_lift_inches: 2,
  is_leveled: false,
  front_level_inches: null,
  ground_clearance_inches: 10.5,
  created_at: QA_FIXTURE_TIMESTAMP,
  updated_at: QA_FIXTURE_TIMESTAMP,
  wizard_config: {
    vehicleType: 'truck',
    drivetrain: '4x4',
    fourWheelDrive: true,
    qaSynthetic: true,
    source: 'route_discovery_qa_local_fixture',
  },
});

export const ROUTE_DISCOVERY_QA_VEHICLE_SPEC: Readonly<VehicleSpec> = Object.freeze({
  gvwr_lb: 7000,
  base_weight_lb: 5000,
  base_weight_source: 'route_discovery_qa_local_fixture',
  base_weight_confidence: 100,
  gvwr_source: 'route_discovery_qa_local_fixture',
  gvwr_confidence: 100,
  ground_clearance_inches: 10.5,
  tire_size_inches: 33,
  suspension_lift_inches: 2,
  is_leveled: false,
  front_level_inches: null,
  drivetrain: '4x4',
  payload_capacity_lb: 2000,
  fuel_tank_capacity_gal: 24,
  fuel_type: 'gas',
});

export const ROUTE_DISCOVERY_QA_TIRES_LIFT: Readonly<TiresLiftConfig> = Object.freeze({
  tireSizeInches: 33,
  suspensionLiftInches: 2,
  isLeveled: false,
  frontLevelInches: null,
  updatedAt: QA_FIXTURE_TIMESTAMP,
});

export type RouteDiscoveryQaVehicleBootstrapState =
  | 'not_applicable'
  | 'initializing'
  | 'ready'
  | 'failed';

export type RouteDiscoveryQaVehicleBootstrapSnapshot = {
  state: RouteDiscoveryQaVehicleBootstrapState;
  vehicleId: string | null;
  errorCode: 'qa_vehicle_bootstrap_failed' | null;
};

type HydratedStore = {
  waitForHydration: () => Promise<void>;
  flush: () => Promise<void>;
};

export type RouteDiscoveryQaVehicleBootstrapDependencies = {
  runtime: { enabled: boolean };
  partition: EcsStoragePartition;
  vehicles: HydratedStore & {
    getLocalSnapshot: () => Vehicle[];
    getById: (vehicleId: string) => Vehicle | null;
    replaceIsolatedLocalSnapshot: (
      vehicles: Vehicle[],
    ) => Promise<{ changed: boolean; vehicleCount: number }>;
  };
  specs: HydratedStore & {
    get: (vehicleId: string) => VehicleSpec | null;
    set: (vehicleId: string, spec: VehicleSpec) => void;
  };
  tiresLift: HydratedStore & {
    get: (vehicleId: string) => TiresLiftConfig | null;
    set: (vehicleId: string, config: TiresLiftConfig) => void;
  };
  activeVehicle: HydratedStore & {
    getActiveVehicleId: () => string | null;
    setActiveVehicleId: (vehicleId: string) => void;
    hasCompletedOnboarding: () => boolean;
    markOnboardingComplete: () => void;
  };
  setup: HydratedStore & {
    isComplete: () => boolean;
    getSetupVehicleId: () => string | null;
    markComplete: (vehicleId?: string) => void;
  };
};

function defaultDependencies(): RouteDiscoveryQaVehicleBootstrapDependencies {
  return {
    runtime: getRouteDiscoveryQaRuntime(),
    partition: resolveBuildProfileStoragePartition(),
    vehicles: vehicleStore,
    specs: vehicleSpecStore,
    tiresLift: tiresLiftStore,
    activeVehicle: vehicleSetupStore,
    setup: setupStore,
  };
}

function matchesSpec(spec: VehicleSpec | null): boolean {
  return Boolean(
    spec &&
      spec.gvwr_lb === ROUTE_DISCOVERY_QA_VEHICLE_SPEC.gvwr_lb &&
      spec.base_weight_lb === ROUTE_DISCOVERY_QA_VEHICLE_SPEC.base_weight_lb &&
      spec.fuel_tank_capacity_gal === ROUTE_DISCOVERY_QA_VEHICLE_SPEC.fuel_tank_capacity_gal &&
      spec.fuel_type === ROUTE_DISCOVERY_QA_VEHICLE_SPEC.fuel_type &&
      spec.ground_clearance_inches === ROUTE_DISCOVERY_QA_VEHICLE_SPEC.ground_clearance_inches &&
      spec.tire_size_inches === ROUTE_DISCOVERY_QA_VEHICLE_SPEC.tire_size_inches &&
      spec.suspension_lift_inches === ROUTE_DISCOVERY_QA_VEHICLE_SPEC.suspension_lift_inches &&
      spec.drivetrain === ROUTE_DISCOVERY_QA_VEHICLE_SPEC.drivetrain,
  );
}

function matchesTiresLift(config: TiresLiftConfig | null): boolean {
  return Boolean(
    config &&
      config.tireSizeInches === ROUTE_DISCOVERY_QA_TIRES_LIFT.tireSizeInches &&
      config.suspensionLiftInches === ROUTE_DISCOVERY_QA_TIRES_LIFT.suspensionLiftInches &&
      config.isLeveled === ROUTE_DISCOVERY_QA_TIRES_LIFT.isLeveled &&
      config.frontLevelInches === ROUTE_DISCOVERY_QA_TIRES_LIFT.frontLevelInches,
  );
}

export function createRouteDiscoveryQaVehicleBootstrap(
  dependencies: RouteDiscoveryQaVehicleBootstrapDependencies = defaultDependencies(),
) {
  const isolationValid =
    dependencies.partition.id === 'route_discovery_qa' &&
    dependencies.partition.isolated &&
    !dependencies.partition.cloudVehicleSyncAllowed;
  let state: RouteDiscoveryQaVehicleBootstrapState = dependencies.runtime.enabled
    ? 'initializing'
    : 'not_applicable';
  let errorCode: RouteDiscoveryQaVehicleBootstrapSnapshot['errorCode'] = null;
  let inFlight: Promise<RouteDiscoveryQaVehicleBootstrapSnapshot> | null = null;

  const snapshot = (): RouteDiscoveryQaVehicleBootstrapSnapshot => ({
    state,
    vehicleId: state === 'ready' ? ROUTE_DISCOVERY_QA_VEHICLE_ID : null,
    errorCode,
  });

  const initialize = async (): Promise<RouteDiscoveryQaVehicleBootstrapSnapshot> => {
    if (!dependencies.runtime.enabled || state === 'ready') return snapshot();
    if (inFlight) return inFlight;

    state = 'initializing';
    errorCode = null;
    const task = (async () => {
      try {
        if (!isolationValid) {
          throw new Error('QA vehicle bootstrap requires isolated local storage.');
        }
        await Promise.all([
          dependencies.vehicles.waitForHydration(),
          dependencies.specs.waitForHydration(),
          dependencies.tiresLift.waitForHydration(),
          dependencies.activeVehicle.waitForHydration(),
          dependencies.setup.waitForHydration(),
        ]);

        await dependencies.vehicles.replaceIsolatedLocalSnapshot([
          ROUTE_DISCOVERY_QA_VEHICLE as Vehicle,
        ]);

        if (!matchesSpec(dependencies.specs.get(ROUTE_DISCOVERY_QA_VEHICLE_ID))) {
          dependencies.specs.set(
            ROUTE_DISCOVERY_QA_VEHICLE_ID,
            ROUTE_DISCOVERY_QA_VEHICLE_SPEC as VehicleSpec,
          );
        }
        if (!matchesTiresLift(dependencies.tiresLift.get(ROUTE_DISCOVERY_QA_VEHICLE_ID))) {
          dependencies.tiresLift.set(
            ROUTE_DISCOVERY_QA_VEHICLE_ID,
            ROUTE_DISCOVERY_QA_TIRES_LIFT as TiresLiftConfig,
          );
        }
        if (dependencies.activeVehicle.getActiveVehicleId() !== ROUTE_DISCOVERY_QA_VEHICLE_ID) {
          dependencies.activeVehicle.setActiveVehicleId(ROUTE_DISCOVERY_QA_VEHICLE_ID);
        }
        if (!dependencies.activeVehicle.hasCompletedOnboarding()) {
          dependencies.activeVehicle.markOnboardingComplete();
        }
        if (
          dependencies.setup.getSetupVehicleId() !== ROUTE_DISCOVERY_QA_VEHICLE_ID ||
          !dependencies.setup.isComplete()
        ) {
          dependencies.setup.markComplete(ROUTE_DISCOVERY_QA_VEHICLE_ID);
        }

        await Promise.all([
          dependencies.vehicles.flush(),
          dependencies.specs.flush(),
          dependencies.tiresLift.flush(),
          dependencies.activeVehicle.flush(),
          dependencies.setup.flush(),
        ]);

        const vehicles = dependencies.vehicles.getLocalSnapshot();
        const verified =
          vehicles.length === 1 &&
          vehicles[0]?.id === ROUTE_DISCOVERY_QA_VEHICLE_ID &&
          dependencies.vehicles.getById(ROUTE_DISCOVERY_QA_VEHICLE_ID)?.name ===
            ROUTE_DISCOVERY_QA_VEHICLE_NAME &&
          dependencies.activeVehicle.getActiveVehicleId() === ROUTE_DISCOVERY_QA_VEHICLE_ID &&
          dependencies.setup.getSetupVehicleId() === ROUTE_DISCOVERY_QA_VEHICLE_ID &&
          dependencies.setup.isComplete() &&
          matchesSpec(dependencies.specs.get(ROUTE_DISCOVERY_QA_VEHICLE_ID)) &&
          matchesTiresLift(dependencies.tiresLift.get(ROUTE_DISCOVERY_QA_VEHICLE_ID));

        if (!verified) {
          throw new Error('QA vehicle context verification failed.');
        }

        state = 'ready';
        return snapshot();
      } catch {
        state = 'failed';
        errorCode = 'qa_vehicle_bootstrap_failed';
        return snapshot();
      }
    })();
    inFlight = task;
    void task.finally(() => {
      if (inFlight === task) inFlight = null;
    });
    return task;
  };

  return {
    snapshot,
    initialize,
    retry: initialize,
  };
}

export const routeDiscoveryQaVehicleBootstrap = createRouteDiscoveryQaVehicleBootstrap();
