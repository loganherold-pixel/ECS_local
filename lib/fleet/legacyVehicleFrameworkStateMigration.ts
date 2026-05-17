import { setupStore } from '../setupStore';
import { vehicleSetupStore } from '../vehicleSetupStore';
import { vehicleStore } from '../vehicleStore';
import { wizardDraftStore } from '../wizardDraftStore';
import { createPersistedKeyValueCache } from '../keyValuePersistence';
import { ecsLog } from '../ecsLogger';

const SHELL_ROUTE_KEY = 'last_shell_route_v1';
const MIGRATION_KEY = 'ecs_legacy_vehicle_framework_cleanup_v1';
const shellRouteCache = createPersistedKeyValueCache('ecs_shell_state');
const setupStateCache = createPersistedKeyValueCache('ecs_setup_state');

let migrationLogEmitted = false;

function normalizeLegacyRoute(route: string | null): string | null {
  if (!route) return null;
  return route.replace(/\/\([^/]+\)/g, '').replace(/\/index$/, '') || '/';
}

function isLegacyVehicleFrameworkRoute(route: string | null): boolean {
  const normalized = normalizeLegacyRoute(route);
  return normalized === '/setup' || normalized === '/vehicle-config';
}

function logMigrationOnce(details: Record<string, unknown>) {
  if (migrationLogEmitted) return;
  migrationLogEmitted = true;
  ecsLog.debug('CONFIG', '[FleetMigration] Retired vehicle framework state sanitized', details);
}

export async function sanitizeLegacyVehicleFrameworkState(): Promise<void> {
  await Promise.all([
    setupStore.waitForHydration(),
    vehicleSetupStore.waitForHydration(),
    vehicleStore.waitForHydration(),
    shellRouteCache.waitForHydration(),
    setupStateCache.waitForHydration(),
  ]);

  const localVehicles = vehicleStore.getLocalSnapshot();
  const hasVehicles = localVehicles.length > 0;
  const setupVehicleId = setupStore.getSetupVehicleId();
  const activeVehicleId = vehicleSetupStore.getActiveVehicleId();
  const setupStep = setupStore.getCurrentStep();
  const wizardDraft = wizardDraftStore.load();
  const storedShellRoute = shellRouteCache.get(SHELL_ROUTE_KEY);
  const setupVehicleExists = !!(setupVehicleId && vehicleStore.getById(setupVehicleId));
  const activeVehicleExists = !!(activeVehicleId && vehicleStore.getById(activeVehicleId));
  let changed = false;

  if (setupStep || (!hasVehicles && setupVehicleId)) {
    setupStore.clearLegacyVehicleFrameworkState({
      clearCompletion: !hasVehicles || (!!setupVehicleId && !setupVehicleExists),
    });
    changed = true;
  }

  if (activeVehicleId && !activeVehicleExists) {
    vehicleSetupStore.clearActiveVehicleId();
    changed = true;
  }

  if (wizardDraft && (!wizardDraft.vehicleId || !vehicleStore.getById(wizardDraft.vehicleId))) {
    wizardDraftStore.clear();
    changed = true;
  }

  if (isLegacyVehicleFrameworkRoute(storedShellRoute)) {
    shellRouteCache.set(SHELL_ROUTE_KEY, '/fleet');
    await shellRouteCache.flush();
    changed = true;
  }

  if (changed) {
    await Promise.all([
      setupStore.flush(),
      vehicleSetupStore.flush(),
    ]);
    logMigrationOnce({
      vehicleCount: localVehicles.length,
      clearedSetupStep: setupStep ?? null,
      clearedSetupVehicleId: setupVehicleId && !setupVehicleExists ? setupVehicleId : null,
      clearedActiveVehicleId: activeVehicleId && !activeVehicleExists ? activeVehicleId : null,
      clearedWizardDraftVehicleId: wizardDraft?.vehicleId ?? null,
      replacedShellRoute: isLegacyVehicleFrameworkRoute(storedShellRoute) ? storedShellRoute : null,
    });
  }

  if (setupStateCache.get(MIGRATION_KEY) !== 'true') {
    setupStateCache.set(MIGRATION_KEY, 'true');
    await setupStateCache.flush();
  }
}
