import { createPersistedKeyValueCache } from './keyValuePersistence';

export type DispatchProfileSnapshot = {
  displayName: string | null;
  callsign: string | null;
  vehicleLabel: string | null;
  vehicleId: string | null;
  updatedAt: string | null;
};

type DispatchProfileListener = (snapshot: DispatchProfileSnapshot) => void;

export type DispatchProfileCompletenessContext = {
  activeDisplayName?: string | null;
  activeCallsign?: string | null;
  activeVehicleLabel?: string | null;
  activeVehicleId?: string | null;
  hasAvailableVehicle?: boolean;
};

const cache = createPersistedKeyValueCache('ecs_dispatch_profile');
const PROFILE_KEY = 'dispatch_profile';
const listeners = new Set<DispatchProfileListener>();

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readSnapshot(): DispatchProfileSnapshot {
  const raw = cache.get(PROFILE_KEY);
  if (!raw) {
    return {
      displayName: null,
      callsign: null,
      vehicleLabel: null,
      vehicleId: null,
      updatedAt: null,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DispatchProfileSnapshot>;
    return {
      displayName: cleanString(parsed.displayName),
      callsign: cleanString(parsed.callsign),
      vehicleLabel: cleanString(parsed.vehicleLabel),
      vehicleId: cleanString(parsed.vehicleId),
      updatedAt: cleanString(parsed.updatedAt),
    };
  } catch {
    return {
      displayName: null,
      callsign: null,
      vehicleLabel: null,
      vehicleId: null,
      updatedAt: null,
    };
  }
}

export function isDispatchProfileComplete(
  profile: Pick<DispatchProfileSnapshot, 'displayName' | 'callsign' | 'vehicleLabel' | 'vehicleId'>,
  context: DispatchProfileCompletenessContext = {},
): boolean {
  const hasOperatorIdentity = !!(
    cleanString(profile.displayName) ||
    cleanString(profile.callsign) ||
    cleanString(context.activeDisplayName) ||
    cleanString(context.activeCallsign)
  );
  const hasVehicleIdentity = !!(
    cleanString(profile.vehicleLabel) ||
    cleanString(profile.vehicleId) ||
    cleanString(context.activeVehicleLabel) ||
    cleanString(context.activeVehicleId)
  );
  const requiresVehicleIdentity = context.hasAvailableVehicle === true;

  return hasOperatorIdentity && (!requiresVehicleIdentity || hasVehicleIdentity);
}

function emit(): void {
  const snapshot = dispatchProfileStore.getSnapshot();
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.warn('[DISPATCH_PROFILE] listener_error', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export const dispatchProfileStore = {
  getSnapshot(): DispatchProfileSnapshot {
    return readSnapshot();
  },

  subscribe(listener: DispatchProfileListener): () => void {
    listeners.add(listener);
    listener(this.getSnapshot());
    cache.waitForHydration().then(() => {
      if (listeners.has(listener)) {
        listener(this.getSnapshot());
      }
    }).catch(() => {});

    return () => {
      listeners.delete(listener);
    };
  },

  isHydrated(): boolean {
    return cache.isHydrated();
  },

  waitForHydration(): Promise<void> {
    return cache.waitForHydration();
  },

  saveProfile(profile: Pick<DispatchProfileSnapshot, 'displayName' | 'callsign' | 'vehicleLabel' | 'vehicleId'>): DispatchProfileSnapshot {
    const next: DispatchProfileSnapshot = {
      displayName: cleanString(profile.displayName),
      callsign: cleanString(profile.callsign),
      vehicleLabel: cleanString(profile.vehicleLabel),
      vehicleId: cleanString(profile.vehicleId),
      updatedAt: new Date().toISOString(),
    };

    cache.set(PROFILE_KEY, JSON.stringify(next));
    emit();
    return next;
  },
};
