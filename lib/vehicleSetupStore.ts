/**
 * Vehicle Setup Store - Persistence for vehicle setup workflow
 *
 * Tracks:
 *   - activeVehicleId: The currently selected vehicle
 *   - hasCompletedOnboarding: Whether the user has completed first-run wizard
 *
 * Offline-first: localStorage (web) / file-backed persistence (native).
 */
import { createPersistedKeyValueCache } from './keyValuePersistence';
import { measureECSPerformanceSync } from './performance/ecsPerformanceDiagnostics';

const cache = createPersistedKeyValueCache('ecs_vehicle_setup_state');

function read(key: string): string | null {
  return cache.get(key);
}

function write(key: string, value: string): void {
  cache.set(key, value);
}

function remove(key: string): void {
  cache.delete(key);
}

const ACTIVE_VEHICLE_KEY = 'ecs_active_vehicle_id';
const ONBOARDING_KEY = 'ecs_has_completed_onboarding';
const SCHEMA_VERSION_KEY = 'ecs_vehicle_setup_schema_version';

export const ECS_VEHICLE_SETUP_SCHEMA_VERSION = 2;

export type ActiveVehicleSelectionReason =
  | 'user_selection'
  | 'single_vehicle_restore'
  | 'fleet_reconciliation'
  | 'vehicle_deleted'
  | 'legacy_migration'
  | 'cleared'
  | 'onboarding_changed';

export type ActiveVehicleSelectionEvent = {
  schemaVersion: typeof ECS_VEHICLE_SETUP_SCHEMA_VERSION;
  revision: number;
  previousVehicleId: string | null;
  activeVehicleId: string | null;
  reason: ActiveVehicleSelectionReason;
};

type Listener = (event: ActiveVehicleSelectionEvent) => void;
const listeners: Set<Listener> = new Set();
let selectionRevision = 0;
let migrationPromise: Promise<void> | null = null;

function normalizeVehicleId(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized.slice(0, 160) : null;
}

function notifyListeners(event: ActiveVehicleSelectionEvent) {
  listeners.forEach((fn) => {
    try {
      fn(event);
    } catch {}
  });
}

function transitionActiveVehicle(
  nextVehicleId: string | null,
  reason: ActiveVehicleSelectionReason,
): boolean {
  const previousVehicleId = normalizeVehicleId(read(ACTIVE_VEHICLE_KEY));
  const normalizedNext = normalizeVehicleId(nextVehicleId);
  if (previousVehicleId === normalizedNext) return false;

  measureECSPerformanceSync('active_vehicle_propagation', normalizedNext ? 'store_write_and_notify' : 'store_clear_and_notify', () => {
    write(SCHEMA_VERSION_KEY, String(ECS_VEHICLE_SETUP_SCHEMA_VERSION));
    if (normalizedNext) write(ACTIVE_VEHICLE_KEY, normalizedNext);
    else remove(ACTIVE_VEHICLE_KEY);
    selectionRevision += 1;
    notifyListeners({
      schemaVersion: ECS_VEHICLE_SETUP_SCHEMA_VERSION,
      revision: selectionRevision,
      previousVehicleId,
      activeVehicleId: normalizedNext,
      reason,
    });
  }, { listenerCount: listeners.size });
  return true;
}

async function migratePersistedState(): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    await cache.waitForHydration();
    const rawVehicleId = read(ACTIVE_VEHICLE_KEY);
    const normalizedVehicleId = normalizeVehicleId(rawVehicleId);
    let changed = read(SCHEMA_VERSION_KEY) !== String(ECS_VEHICLE_SETUP_SCHEMA_VERSION);
    if (rawVehicleId !== normalizedVehicleId) {
      if (normalizedVehicleId) write(ACTIVE_VEHICLE_KEY, normalizedVehicleId);
      else remove(ACTIVE_VEHICLE_KEY);
      changed = true;
    }
    if (changed) {
      write(SCHEMA_VERSION_KEY, String(ECS_VEHICLE_SETUP_SCHEMA_VERSION));
      await cache.flush();
    }
  })();
  return migrationPromise;
}

export const vehicleSetupStore = {
  waitForHydration: (): Promise<void> => migratePersistedState(),
  isHydrated: (): boolean => cache.isHydrated(),
  flush: (): Promise<void> => cache.flush(),
  getSchemaVersion: (): number => Number(read(SCHEMA_VERSION_KEY)) || 1,
  getSelectionRevision: (): number => selectionRevision,

  getActiveVehicleId: (): string | null => {
    return normalizeVehicleId(read(ACTIVE_VEHICLE_KEY));
  },

  setActiveVehicleId: (
    vehicleId: string,
    reason: ActiveVehicleSelectionReason = 'user_selection',
  ): boolean => {
    return transitionActiveVehicle(vehicleId, reason);
  },

  clearActiveVehicleId: (
    reason: ActiveVehicleSelectionReason = 'cleared',
  ): boolean => {
    return transitionActiveVehicle(null, reason);
  },

  reconcileActiveVehicle: (
    availableVehicleIds: readonly string[],
    options: {
      preferredVehicleId?: string | null;
      autoSelectSingle?: boolean;
      autoSelectFirst?: boolean;
      reason?: ActiveVehicleSelectionReason;
    } = {},
  ): string | null => {
    const availableIds = Array.from(new Set(availableVehicleIds.map(normalizeVehicleId).filter((id): id is string => Boolean(id))));
    const currentVehicleId = normalizeVehicleId(read(ACTIVE_VEHICLE_KEY));
    const preferredVehicleId = normalizeVehicleId(options.preferredVehicleId);
    const nextVehicleId = currentVehicleId && availableIds.includes(currentVehicleId)
      ? currentVehicleId
      : preferredVehicleId && availableIds.includes(preferredVehicleId)
        ? preferredVehicleId
        : options.autoSelectFirst && availableIds.length > 0
          ? availableIds[0]
          : options.autoSelectSingle !== false && availableIds.length === 1
            ? availableIds[0]
            : null;

    transitionActiveVehicle(nextVehicleId, options.reason ?? 'fleet_reconciliation');
    return nextVehicleId;
  },

  hasCompletedOnboarding: (): boolean => {
    return read(ONBOARDING_KEY) === 'true';
  },

  markOnboardingComplete: (): void => {
    write(ONBOARDING_KEY, 'true');
    const activeVehicleId = normalizeVehicleId(read(ACTIVE_VEHICLE_KEY));
    notifyListeners({
      schemaVersion: ECS_VEHICLE_SETUP_SCHEMA_VERSION,
      revision: selectionRevision,
      previousVehicleId: activeVehicleId,
      activeVehicleId,
      reason: 'onboarding_changed',
    });
  },

  resetOnboarding: (): void => {
    remove(ONBOARDING_KEY);
    const activeVehicleId = normalizeVehicleId(read(ACTIVE_VEHICLE_KEY));
    notifyListeners({
      schemaVersion: ECS_VEHICLE_SETUP_SCHEMA_VERSION,
      revision: selectionRevision,
      previousVehicleId: activeVehicleId,
      activeVehicleId,
      reason: 'onboarding_changed',
    });
  },

  subscribe: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
