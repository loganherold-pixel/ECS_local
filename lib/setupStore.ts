/**
 * ECS Setup Store — First-Time Setup Completion Tracking
 *
 * Phase 8: Enhanced with step tracking for resume capability,
 * welcome banner flag, and resource profile data persistence.
 *
 * Tracks whether the user has completed the guided system initialization.
 * Offline-first: localStorage (web) / memory (native).
 *
 * Setup flow (4 steps):
 *   1. Vehicle Selection — Choose vehicle preset or enter specs
 *   2. Resource Profile — Fuel, water, power capacities
 *   3. Accessories Configuration — Vehicle accessory framework
 *   4. Loadout Configuration — Container-based loadout review
 *
 * Setup is considered complete when:
 *   1. GVWR and Base Weight have been entered (vehicleSpec exists)
 *   2. The user has explicitly completed the setup flow
 *
 * If setup is incomplete, the app redirects to /setup before dashboard access.
 * Dashboard shows a welcome banner on first load after setup completion.
 */
import { Platform } from 'react-native';
import { vehicleSpecStore } from './vehicleSpecStore';

// ── Storage helpers ─────────────────────────────────────
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
const SETUP_COMPLETE_KEY = 'ecs_setup_complete';
const SETUP_VEHICLE_ID_KEY = 'ecs_setup_vehicle_id';
const SETUP_SKIPPED_RESOURCES_KEY = 'ecs_setup_skipped_resources';
const SETUP_CURRENT_STEP_KEY = 'ecs_setup_current_step';
const SETUP_WELCOME_SHOWN_KEY = 'ecs_setup_welcome_shown';
const SETUP_RESOURCE_PROFILE_KEY = 'ecs_setup_resource_profile';

// ── Step definitions ────────────────────────────────────
export type SetupStep = 'vehicle-selection' | 'resource-profile' | 'accessories' | 'loadout';
export const SETUP_STEPS: SetupStep[] = ['vehicle-selection', 'resource-profile', 'accessories', 'loadout'];

// ── Resource Profile Data ───────────────────────────────
export interface ResourceProfile {
  fuel_capacity_gal: number;
  water_capacity_gal: number;
  power_storage_wh: number;
}

// ── Change listeners ────────────────────────────────────
type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notifyListeners() {
  listeners.forEach(fn => { try { fn(); } catch {} });
}

// ── Public API ──────────────────────────────────────────
export const setupStore = {
  /**
   * Check if first-time setup has been completed.
   * Returns true if the setup flow was finished OR if a vehicleSpec already exists
   * (e.g., user configured via vehicle-config tab before this feature existed).
   */
  isComplete: (): boolean => {
    // Explicit completion flag
    const flag = lsGet(SETUP_COMPLETE_KEY);
    if (flag === 'true') return true;

    // Legacy check: if any vehicleSpec exists, consider setup done
    const firstSpec = vehicleSpecStore.getFirst();
    if (firstSpec && firstSpec.spec.gvwr_lb > 0 && firstSpec.spec.base_weight_lb > 0) {
      // Auto-mark as complete for legacy users
      lsSet(SETUP_COMPLETE_KEY, 'true');
      lsSet(SETUP_VEHICLE_ID_KEY, firstSpec.vehicleId);
      return true;
    }

    return false;
  },

  /**
   * Mark setup as complete.
   */
  markComplete: (vehicleId?: string): void => {
    lsSet(SETUP_COMPLETE_KEY, 'true');
    if (vehicleId) {
      lsSet(SETUP_VEHICLE_ID_KEY, vehicleId);
    }
    // Clear step tracking — setup is done
    lsRemove(SETUP_CURRENT_STEP_KEY);
    // Mark welcome banner as not yet shown (will show on next dashboard load)
    lsRemove(SETUP_WELCOME_SHOWN_KEY);
    notifyListeners();
  },

  /**
   * Get the vehicle ID created during setup.
   */
  getSetupVehicleId: (): string | null => {
    return lsGet(SETUP_VEHICLE_ID_KEY);
  },

  /**
   * Set the vehicle ID from setup.
   */
  setSetupVehicleId: (vehicleId: string): void => {
    lsSet(SETUP_VEHICLE_ID_KEY, vehicleId);
  },

  // ── Step Tracking (Phase 8) ───────────────────────────

  /**
   * Get the last completed setup step for resume capability.
   * Returns null if no step has been started.
   */
  getCurrentStep: (): SetupStep | null => {
    const step = lsGet(SETUP_CURRENT_STEP_KEY);
    if (step && SETUP_STEPS.includes(step as SetupStep)) {
      return step as SetupStep;
    }
    return null;
  },

  /**
   * Save the current setup step for resume capability.
   */
  setCurrentStep: (step: SetupStep): void => {
    lsSet(SETUP_CURRENT_STEP_KEY, step);
  },

  /**
   * Get the step index (0-based) for the current step.
   */
  getCurrentStepIndex: (): number => {
    const step = setupStore.getCurrentStep();
    if (!step) return 0;
    const idx = SETUP_STEPS.indexOf(step);
    return idx >= 0 ? idx : 0;
  },

  // ── Resource Profile (Phase 8) ────────────────────────

  /**
   * Save resource profile data during setup.
   */
  setResourceProfile: (profile: ResourceProfile): void => {
    lsSet(SETUP_RESOURCE_PROFILE_KEY, JSON.stringify(profile));
  },

  /**
   * Get saved resource profile data.
   */
  getResourceProfile: (): ResourceProfile | null => {
    const raw = lsGet(SETUP_RESOURCE_PROFILE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ResourceProfile;
    } catch {
      return null;
    }
  },

  // ── Welcome Banner (Phase 8) ──────────────────────────

  /**
   * Check if the welcome banner should be shown on the dashboard.
   * Returns true only once after setup completion.
   */
  shouldShowWelcomeBanner: (): boolean => {
    if (!setupStore.isComplete()) return false;
    return lsGet(SETUP_WELCOME_SHOWN_KEY) !== 'true';
  },

  /**
   * Mark the welcome banner as shown (won't show again).
   */
  markWelcomeBannerShown: (): void => {
    lsSet(SETUP_WELCOME_SHOWN_KEY, 'true');
  },

  /**
   * Check if resource profile was skipped during setup.
   */
  wasResourceProfileSkipped: (): boolean => {
    return lsGet(SETUP_SKIPPED_RESOURCES_KEY) === 'true';
  },

  /**
   * Mark resource profile as skipped.
   */
  markResourceProfileSkipped: (): void => {
    lsSet(SETUP_SKIPPED_RESOURCES_KEY, 'true');
  },

  /**
   * Clear the skipped flag (user later configured resources).
   */
  clearResourceProfileSkipped: (): void => {
    lsRemove(SETUP_SKIPPED_RESOURCES_KEY);
  },

  /**
   * Check if vehicle spec is partially configured (has vehicle but missing required fields).
   * Used by dashboard to show "Complete Vehicle Setup" banner.
   */
  needsAttention: (): boolean => {
    if (setupStore.isComplete()) {
      // Check if resource profile was skipped
      if (setupStore.wasResourceProfileSkipped()) return true;

      // Check if spec has zero values
      const first = vehicleSpecStore.getFirst();
      if (first) {
        const { spec } = first;
        if (!spec.gvwr_lb || !spec.base_weight_lb) return true;
      }
      return false;
    }
    return true; // Setup not complete at all
  },

  /**
   * Subscribe to setup state changes.
   */
  subscribe: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  /**
   * Reset setup state (for testing / re-initialization).
   */
  reset: (): void => {
    lsRemove(SETUP_COMPLETE_KEY);
    lsRemove(SETUP_VEHICLE_ID_KEY);
    lsRemove(SETUP_SKIPPED_RESOURCES_KEY);
    lsRemove(SETUP_CURRENT_STEP_KEY);
    lsRemove(SETUP_WELCOME_SHOWN_KEY);
    lsRemove(SETUP_RESOURCE_PROFILE_KEY);
    notifyListeners();
  },
};

