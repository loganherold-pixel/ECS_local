import { hydrateCustomPresets, hydrateDashboardState } from '../dashboardStore';
import { waitForExpeditionStateHydration } from '../expeditionStateStore';
import { dispatchPersistenceAdapter } from '../dispatchPersistenceAdapter';
import { sanitizeLegacyVehicleFrameworkState } from '../fleet/legacyVehicleFrameworkStateMigration';
import { createPersistedKeyValueCache } from '../keyValuePersistence';
import { loadoutStore } from '../loadoutStore';
import { waitForECSShellRouteStateHydration } from '../navigation/ecsShellRouteState';
import { offlineReadinessCoordinator } from '../offlinePrepPack/offlineReadinessCoordinator';
import { offlineTileSyncCoordinator } from '../offlineTileSyncCoordinator';
import { powerSetupStore } from '../powerSetupStore';
import { sessionStore } from '../sessionStore';
import { setupStore } from '../setupStore';
import { tiresLiftStore } from '../tiresLiftStore';
import { consumablesStore } from '../consumablesStore';
import { vehicleSetupStore } from '../vehicleSetupStore';
import { vehicleSpecStore } from '../vehicleSpecStore';
import { vehicleStore } from '../vehicleStore';
import {
  ecsStoreHydrationCoordinator,
  type ECSStoreHydrationPlanResult,
  type ECSStoreHydrationTask,
} from './storeHydrationCoordinator';

export const ECS_REQUIRED_STARTUP_HYDRATION_PLAN_ID = 'ecs_required_startup_state_v1';
export const ECS_OPTIONAL_STARTUP_HYDRATION_PLAN_ID = 'ecs_optional_startup_state_v1';

const runtimeFlagsCache = createPersistedKeyValueCache('ecs_runtime_flags');
const setupStateCache = createPersistedKeyValueCache('ecs_setup_state');

function requiredStartupTasks(timeoutMs: number): ECSStoreHydrationTask[] {
  const task = (
    id: string,
    hydrate: () => Promise<unknown> | unknown,
    dependencies: readonly string[] = [],
  ): ECSStoreHydrationTask => ({ id, hydrate, dependencies, timeoutMs, required: true });

  return [
    task('session_preferences', () => sessionStore.waitForHydration()),
    task('setup_progress', () => setupStore.waitForHydration()),
    task('active_vehicle_selection', () => vehicleSetupStore.waitForHydration()),
    task('vehicle_records', () => vehicleStore.waitForHydration()),
    task('vehicle_specs', () => vehicleSpecStore.waitForHydration()),
    task('vehicle_loadouts', () => loadoutStore.waitForHydration()),
    task('vehicle_consumables', () => consumablesStore.waitForHydration()),
    task('vehicle_tires_lift', () => tiresLiftStore.waitForHydration()),
    task('power_setup', () => powerSetupStore.waitForHydration()),
    task('runtime_flags', () => runtimeFlagsCache.waitForHydration()),
    task('legacy_setup_state', () => setupStateCache.waitForHydration()),
    task('shell_route_state', () => waitForECSShellRouteStateHydration()),
    task(
      'legacy_vehicle_framework_migration',
      () => sanitizeLegacyVehicleFrameworkState(),
      [
        'setup_progress',
        'active_vehicle_selection',
        'vehicle_records',
        'vehicle_specs',
        'vehicle_loadouts',
        'vehicle_consumables',
        'vehicle_tires_lift',
      ],
    ),
  ];
}

function optionalStartupTasks(timeoutMs: number): ECSStoreHydrationTask[] {
  return [
    {
      id: 'dashboard_layout',
      hydrate: () => hydrateDashboardState(),
      timeoutMs,
      required: false,
    },
    {
      id: 'dashboard_custom_presets',
      hydrate: () => hydrateCustomPresets(),
      dependencies: ['dashboard_layout'],
      timeoutMs,
      required: false,
    },
    {
      id: 'active_expedition',
      hydrate: () => waitForExpeditionStateHydration(),
      timeoutMs,
      required: false,
    },
    {
      id: 'offline_readiness_manifest',
      hydrate: () => offlineReadinessCoordinator.waitForHydration(),
      timeoutMs,
      required: false,
    },
    {
      id: 'offline_tile_sync',
      hydrate: () => offlineTileSyncCoordinator.waitForHydration(),
      timeoutMs,
      required: false,
    },
    {
      id: 'dispatch_local_runtime',
      hydrate: () => dispatchPersistenceAdapter.waitForHydration(),
      dependencies: ['active_expedition'],
      timeoutMs,
      required: false,
    },
  ];
}

export function hydrateECSRequiredStartupState(
  timeoutMs = 3_000,
): Promise<ECSStoreHydrationPlanResult> {
  return ecsStoreHydrationCoordinator.runPlan({
    id: ECS_REQUIRED_STARTUP_HYDRATION_PLAN_ID,
    tasks: requiredStartupTasks(timeoutMs),
  });
}

export function hydrateECSOptionalStartupState(
  timeoutMs = 2_200,
): Promise<ECSStoreHydrationPlanResult> {
  return ecsStoreHydrationCoordinator.runPlan({
    id: ECS_OPTIONAL_STARTUP_HYDRATION_PLAN_ID,
    tasks: optionalStartupTasks(timeoutMs),
  });
}
