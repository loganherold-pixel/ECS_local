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

type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export const vehicleSetupStore = {
  waitForHydration: (): Promise<void> => cache.waitForHydration(),
  isHydrated: (): boolean => cache.isHydrated(),
  flush: (): Promise<void> => cache.flush(),

  getActiveVehicleId: (): string | null => {
    return read(ACTIVE_VEHICLE_KEY);
  },

  setActiveVehicleId: (vehicleId: string): void => {
    if (read(ACTIVE_VEHICLE_KEY) === vehicleId) return;
    write(ACTIVE_VEHICLE_KEY, vehicleId);
    notifyListeners();
  },

  clearActiveVehicleId: (): void => {
    if (!read(ACTIVE_VEHICLE_KEY)) return;
    remove(ACTIVE_VEHICLE_KEY);
    notifyListeners();
  },

  hasCompletedOnboarding: (): boolean => {
    return read(ONBOARDING_KEY) === 'true';
  },

  markOnboardingComplete: (): void => {
    write(ONBOARDING_KEY, 'true');
    notifyListeners();
  },

  resetOnboarding: (): void => {
    remove(ONBOARDING_KEY);
    notifyListeners();
  },

  subscribe: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
