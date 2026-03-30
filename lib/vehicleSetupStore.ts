/**
 * Vehicle Setup Store — Persistence for vehicle setup workflow
 *
 * Tracks:
 *   - activeVehicleId: The currently selected vehicle
 *   - hasCompletedOnboarding: Whether the user has completed first-run wizard
 *
 * Offline-first: localStorage (web) / memory (native).
 */
import { Platform } from 'react-native';

const memoryStore: Record<string, string> = {};

function lsGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

function lsSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
  memoryStore[key] = value;
}

function lsRemove(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {}
  delete memoryStore[key];
}

// ── Keys ────────────────────────────────────────────────
const ACTIVE_VEHICLE_KEY = 'ecs_active_vehicle_id';
const ONBOARDING_KEY = 'ecs_has_completed_onboarding';

// ── Change listeners ────────────────────────────────────
type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notifyListeners() {
  listeners.forEach(fn => { try { fn(); } catch {} });
}

export const vehicleSetupStore = {
  // ── Active Vehicle ────────────────────────────────────
  getActiveVehicleId: (): string | null => {
    return lsGet(ACTIVE_VEHICLE_KEY);
  },

  setActiveVehicleId: (vehicleId: string): void => {
    lsSet(ACTIVE_VEHICLE_KEY, vehicleId);
    notifyListeners();
  },

  clearActiveVehicleId: (): void => {
    lsRemove(ACTIVE_VEHICLE_KEY);
    notifyListeners();
  },

  // ── Onboarding ────────────────────────────────────────
  hasCompletedOnboarding: (): boolean => {
    return lsGet(ONBOARDING_KEY) === 'true';
  },

  markOnboardingComplete: (): void => {
    lsSet(ONBOARDING_KEY, 'true');
    notifyListeners();
  },

  resetOnboarding: (): void => {
    lsRemove(ONBOARDING_KEY);
    notifyListeners();
  },

  // ── Subscriptions ─────────────────────────────────────
  subscribe: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};

