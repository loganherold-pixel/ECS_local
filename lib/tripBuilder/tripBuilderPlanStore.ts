import { createMigratingNonSecureStorage } from '../nonSecureStorage';
import type { TripItineraryEditSession } from './tripItineraryEditSession';
import type { TripPlan } from './tripBuilderTypes';

const TRIP_BUILDER_PLAN_KEY = 'ecs_trip_builder_plan_v1';
const TRIP_BUILDER_PLAN_VERSION = 1;
const planStorage = createMigratingNonSecureStorage('ecs_trip_builder_plan', {
  logTag: 'TripBuilderPlanStore',
});

export type PersistedTripBuilderPlanState = {
  schemaVersion: number;
  selectedRouteId: string | null;
  plan: TripPlan | null;
  visible: boolean;
  itinerarySaved: boolean;
  itineraryEditSession: TripItineraryEditSession | null;
  updatedAt: string;
};

function normalize(value: unknown): PersistedTripBuilderPlanState | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<PersistedTripBuilderPlanState>;
  const selectedRouteId = typeof parsed.selectedRouteId === 'string' && parsed.selectedRouteId.trim()
    ? parsed.selectedRouteId.trim()
    : null;
  if (!selectedRouteId && !parsed.plan) return null;
  return {
    schemaVersion: TRIP_BUILDER_PLAN_VERSION,
    selectedRouteId,
    plan: parsed.plan ?? null,
    visible: parsed.visible === true,
    itinerarySaved: parsed.itinerarySaved === true,
    itineraryEditSession: parsed.itineraryEditSession ?? null,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
  };
}

export async function loadTripBuilderPlanState(): Promise<PersistedTripBuilderPlanState | null> {
  const raw = await planStorage.read(TRIP_BUILDER_PLAN_KEY);
  if (!raw) return null;
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveTripBuilderPlanState(
  state: Omit<PersistedTripBuilderPlanState, 'schemaVersion' | 'updatedAt'>,
): Promise<PersistedTripBuilderPlanState> {
  const snapshot: PersistedTripBuilderPlanState = {
    ...state,
    schemaVersion: TRIP_BUILDER_PLAN_VERSION,
    updatedAt: new Date().toISOString(),
  };
  await planStorage.write(TRIP_BUILDER_PLAN_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export async function clearTripBuilderPlanState(): Promise<void> {
  await planStorage.remove(TRIP_BUILDER_PLAN_KEY);
}

