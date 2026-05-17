/**
 * ECS Setup Store - First-Time Setup Completion Tracking
 *
 * Tracks whether the user has completed the guided system initialization.
 * Web uses localStorage. Native uses file-backed non-secure persistence.
 */
import { createPersistedKeyValueCache } from './keyValuePersistence';
import { vehicleStore } from './vehicleStore';
import { vehicleSpecStore } from './vehicleSpecStore';

const cache = createPersistedKeyValueCache('ecs_setup_state');

const SETUP_COMPLETE_KEY = 'ecs_setup_complete';
const SETUP_VEHICLE_ID_KEY = 'ecs_setup_vehicle_id';
const SETUP_SKIPPED_RESOURCES_KEY = 'ecs_setup_skipped_resources';
const SETUP_CURRENT_STEP_KEY = 'ecs_setup_current_step';
const SETUP_WELCOME_SHOWN_KEY = 'ecs_setup_welcome_shown';
const SETUP_RESOURCE_PROFILE_KEY = 'ecs_setup_resource_profile';

export type SetupStep = 'vehicle-selection' | 'resource-profile' | 'accessories' | 'loadout';
export const SETUP_STEPS: SetupStep[] = ['vehicle-selection', 'resource-profile', 'accessories', 'loadout'];

export interface ResourceProfile {
  fuel_capacity_gal: number;
  water_capacity_gal: number;
  power_storage_wh: number;
  suspension_mode?: 'stock' | 'level' | 'lift';
  suspension_is_leveled?: boolean;
  suspension_lift_inches?: number;
  tire_size_inches?: number;
}

type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

function read(key: string): string | null {
  return cache.get(key);
}

function write(key: string, value: string): void {
  cache.set(key, value);
}

function remove(key: string): void {
  cache.delete(key);
}

function markLegacyVehicleSpecAsComplete(): boolean {
  const firstSpec = vehicleSpecStore.getFirst();
  if (
    firstSpec &&
    firstSpec.spec.gvwr_lb > 0 &&
    firstSpec.spec.base_weight_lb > 0 &&
    vehicleStore.getById(firstSpec.vehicleId)
  ) {
    write(SETUP_COMPLETE_KEY, 'true');
    write(SETUP_VEHICLE_ID_KEY, firstSpec.vehicleId);
    return true;
  }
  return false;
}

export const setupStore = {
  waitForHydration: (): Promise<void> => cache.waitForHydration(),
  isHydrated: (): boolean => cache.isHydrated(),
  flush: (): Promise<void> => cache.flush(),

  isComplete: (): boolean => {
    const flag = read(SETUP_COMPLETE_KEY);
    if (flag === 'true') {
      const setupVehicleId = read(SETUP_VEHICLE_ID_KEY);
      const localVehicles = vehicleStore.getLocalSnapshot();
      const setupVehicleExists = !!(setupVehicleId && vehicleStore.getById(setupVehicleId));

      if (setupVehicleExists) {
        return true;
      }

      if (!setupVehicleId && localVehicles.length > 0) {
        return true;
      }

      remove(SETUP_COMPLETE_KEY);
      remove(SETUP_VEHICLE_ID_KEY);
    }
    return markLegacyVehicleSpecAsComplete();
  },

  markComplete: (vehicleId?: string): void => {
    write(SETUP_COMPLETE_KEY, 'true');
    if (vehicleId) {
      write(SETUP_VEHICLE_ID_KEY, vehicleId);
    }
    remove(SETUP_CURRENT_STEP_KEY);
    remove(SETUP_WELCOME_SHOWN_KEY);
    notifyListeners();
  },

  getSetupVehicleId: (): string | null => read(SETUP_VEHICLE_ID_KEY),

  setSetupVehicleId: (vehicleId: string): void => {
    write(SETUP_VEHICLE_ID_KEY, vehicleId);
    notifyListeners();
  },

  getCurrentStep: (): SetupStep | null => {
    const step = read(SETUP_CURRENT_STEP_KEY);
    if (step && SETUP_STEPS.includes(step as SetupStep)) {
      return step as SetupStep;
    }
    return null;
  },

  setCurrentStep: (step: SetupStep): void => {
    write(SETUP_CURRENT_STEP_KEY, step);
    notifyListeners();
  },

  getCurrentStepIndex: (): number => {
    const step = setupStore.getCurrentStep();
    if (!step) return 0;
    const idx = SETUP_STEPS.indexOf(step);
    return idx >= 0 ? idx : 0;
  },

  setResourceProfile: (profile: ResourceProfile): void => {
    write(SETUP_RESOURCE_PROFILE_KEY, JSON.stringify(profile));
    notifyListeners();
  },

  getResourceProfile: (): ResourceProfile | null => {
    const raw = read(SETUP_RESOURCE_PROFILE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ResourceProfile;
    } catch {
      return null;
    }
  },

  shouldShowWelcomeBanner: (): boolean => {
    if (!setupStore.isComplete()) return false;
    return read(SETUP_WELCOME_SHOWN_KEY) !== 'true';
  },

  markWelcomeBannerShown: (): void => {
    write(SETUP_WELCOME_SHOWN_KEY, 'true');
    notifyListeners();
  },

  wasResourceProfileSkipped: (): boolean => read(SETUP_SKIPPED_RESOURCES_KEY) === 'true',

  markResourceProfileSkipped: (): void => {
    write(SETUP_SKIPPED_RESOURCES_KEY, 'true');
    notifyListeners();
  },

  clearResourceProfileSkipped: (): void => {
    remove(SETUP_SKIPPED_RESOURCES_KEY);
    notifyListeners();
  },

  clearLegacyVehicleFrameworkState: (options: { clearCompletion?: boolean } = {}): void => {
    remove(SETUP_SKIPPED_RESOURCES_KEY);
    remove(SETUP_CURRENT_STEP_KEY);
    remove(SETUP_WELCOME_SHOWN_KEY);
    remove(SETUP_RESOURCE_PROFILE_KEY);
    if (options.clearCompletion) {
      remove(SETUP_COMPLETE_KEY);
      remove(SETUP_VEHICLE_ID_KEY);
    }
    notifyListeners();
  },

  needsAttention: (): boolean => {
    if (setupStore.isComplete()) {
      if (setupStore.wasResourceProfileSkipped()) return true;

      const first = vehicleSpecStore.getFirst();
      if (first) {
        const { spec } = first;
        if (!spec.gvwr_lb || !spec.base_weight_lb) return true;
      }
      return false;
    }
    return true;
  },

  subscribe: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },

  reset: (): void => {
    remove(SETUP_COMPLETE_KEY);
    remove(SETUP_VEHICLE_ID_KEY);
    remove(SETUP_SKIPPED_RESOURCES_KEY);
    remove(SETUP_CURRENT_STEP_KEY);
    remove(SETUP_WELCOME_SHOWN_KEY);
    remove(SETUP_RESOURCE_PROFILE_KEY);
    notifyListeners();
  },
};
