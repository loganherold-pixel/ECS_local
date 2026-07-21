import { createMigratingNonSecureStorage } from '../nonSecureStorage';
import type { TripItineraryEditSession } from './tripItineraryEditSession';
import type { ResupplyPoint, TripPlan } from './tripBuilderTypes';

const TRIP_BUILDER_PLAN_KEY = 'ecs_trip_builder_plan_v1';
export const TRIP_BUILDER_PLAN_VERSION = 2;
const planStorage = createMigratingNonSecureStorage('ecs_trip_builder_plan', {
  logTag: 'TripBuilderPlanStore',
});

export type TripBuilderPlanHydrationStatus =
  | 'not_started'
  | 'loading'
  | 'restored'
  | 'empty'
  | 'incompatible'
  | 'failed';

export type PersistedTripBuilderPlanState = {
  schemaVersion: number;
  revision: number;
  selectedRouteId: string | null;
  plan: TripPlan | null;
  selectedResupplyStop: ResupplyPoint | null;
  visible: boolean;
  itinerarySaved: boolean;
  itineraryEditSession: TripItineraryEditSession | null;
  updatedAt: string;
};

export type TripBuilderPlanRuntimeState = Pick<
  PersistedTripBuilderPlanState,
  'selectedRouteId' | 'plan' | 'selectedResupplyStop' | 'visible' | 'itinerarySaved' | 'itineraryEditSession'
>;

export type TripBuilderPlanHydrationResult = {
  status: Exclude<TripBuilderPlanHydrationStatus, 'not_started' | 'loading'>;
  state: PersistedTripBuilderPlanState | null;
  errorCategory: 'none' | 'corrupt_json' | 'incompatible_schema' | 'storage_read_failed';
};

export type TripBuilderPersistenceDiagnosticEvent =
  | 'persistence_write_queued'
  | 'persistence_write_succeeded'
  | 'persistence_write_failed'
  | 'persistence_snapshot_superseded'
  | 'persistence_hydration_started'
  | 'persistence_hydration_restored'
  | 'persistence_hydration_empty'
  | 'persistence_hydration_incompatible'
  | 'persistence_hydration_failed';

export type TripBuilderPersistenceDiagnostic = {
  event: TripBuilderPersistenceDiagnosticEvent;
  schemaVersion: number;
  revision: number;
  planPresent: boolean;
  selectedStopPresent: boolean;
  itineraryItemCount: number;
  semanticOrderingValid: boolean;
  durationBucket: 'none' | 'under_100ms' | 'under_500ms' | 'under_2s' | 'over_2s';
  errorCategory: string;
};

type MutableState = Omit<PersistedTripBuilderPlanState, 'schemaVersion' | 'revision' | 'updatedAt' | 'selectedResupplyStop'> & {
  selectedResupplyStop?: ResupplyPoint | null;
};
type DiagnosticListener = (diagnostic: TripBuilderPersistenceDiagnostic) => void;

let diagnosticListener: DiagnosticListener | null = null;
let revisionClock = 0;
let durableRevision = 0;
let writeQueue: Promise<void> = Promise.resolve();
let hydrationPromise: Promise<TripBuilderPlanHydrationResult> | null = null;
let hydrationStatus: TripBuilderPlanHydrationStatus = 'not_started';
let currentState: PersistedTripBuilderPlanState | null = null;

export function setTripBuilderPersistenceDiagnosticListener(listener: DiagnosticListener | null): void {
  diagnosticListener = listener;
}

function itineraryCount(state: PersistedTripBuilderPlanState | null): number {
  return state?.plan?.suggestedStops?.length ?? 0;
}

function semanticOrderingValid(state: PersistedTripBuilderPlanState | null): boolean {
  const stops = state?.plan?.suggestedStops ?? [];
  return stops.every((stop, index) => stop.sequence === index + 1 || stop.sequence === index);
}

function durationBucket(startedAt: number): TripBuilderPersistenceDiagnostic['durationBucket'] {
  const duration = Date.now() - startedAt;
  if (duration < 100) return 'under_100ms';
  if (duration < 500) return 'under_500ms';
  if (duration < 2000) return 'under_2s';
  return 'over_2s';
}

function emit(event: TripBuilderPersistenceDiagnosticEvent, state: PersistedTripBuilderPlanState | null, startedAt = Date.now(), errorCategory = 'none'): void {
  diagnosticListener?.({
    event,
    schemaVersion: state?.schemaVersion ?? TRIP_BUILDER_PLAN_VERSION,
    revision: state?.revision ?? revisionClock,
    planPresent: state?.plan != null,
    selectedStopPresent: state?.selectedResupplyStop != null,
    itineraryItemCount: itineraryCount(state),
    semanticOrderingValid: semanticOrderingValid(state),
    durationBucket: event === 'persistence_write_queued' || event === 'persistence_hydration_started' ? 'none' : durationBucket(startedAt),
    errorCategory,
  });
}

export function resolveTripBuilderPlanRuntimeState(persisted: PersistedTripBuilderPlanState | null): TripBuilderPlanRuntimeState {
  return persisted ? {
    selectedRouteId: persisted.selectedRouteId,
    plan: persisted.plan,
    selectedResupplyStop: persisted.selectedResupplyStop,
    visible: persisted.visible,
    itinerarySaved: persisted.itinerarySaved,
    itineraryEditSession: persisted.itineraryEditSession,
  } : {
    selectedRouteId: null,
    plan: null,
    selectedResupplyStop: null,
    visible: false,
    itinerarySaved: false,
    itineraryEditSession: null,
  };
}

function normalize(value: unknown): TripBuilderPlanHydrationResult {
  if (!value || typeof value !== 'object') return { status: 'incompatible', state: null, errorCategory: 'incompatible_schema' };
  const parsed = value as Partial<PersistedTripBuilderPlanState>;
  const sourceVersion = Number(parsed.schemaVersion ?? 1);
  if (sourceVersion < 1 || sourceVersion > TRIP_BUILDER_PLAN_VERSION) {
    return { status: 'incompatible', state: null, errorCategory: 'incompatible_schema' };
  }
  const selectedRouteId = typeof parsed.selectedRouteId === 'string' && parsed.selectedRouteId.trim() ? parsed.selectedRouteId.trim() : null;
  if (!selectedRouteId && !parsed.plan) return { status: 'empty', state: null, errorCategory: 'none' };
  const state: PersistedTripBuilderPlanState = {
    schemaVersion: TRIP_BUILDER_PLAN_VERSION,
    revision: Math.max(1, Number.isFinite(parsed.revision) ? Math.trunc(parsed.revision as number) : 1),
    selectedRouteId,
    plan: parsed.plan ?? null,
    selectedResupplyStop: sourceVersion >= 2 ? parsed.selectedResupplyStop ?? null : null,
    visible: parsed.visible === true,
    itinerarySaved: parsed.itinerarySaved === true,
    itineraryEditSession: parsed.itineraryEditSession ?? null,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
  };
  return { status: 'restored', state, errorCategory: 'none' };
}

export function getTripBuilderPlanHydrationStatus(): TripBuilderPlanHydrationStatus {
  return hydrationStatus;
}

export async function hydrateTripBuilderPlanState(): Promise<TripBuilderPlanHydrationResult> {
  if (hydrationPromise) return hydrationPromise;
  hydrationStatus = 'loading';
  const startedAt = Date.now();
  emit('persistence_hydration_started', null, startedAt);
  hydrationPromise = (async () => {
    try {
      const raw = await planStorage.read(TRIP_BUILDER_PLAN_KEY);
      if (!raw) {
        hydrationStatus = 'empty';
        emit('persistence_hydration_empty', null, startedAt);
        return { status: 'empty', state: null, errorCategory: 'none' } as const;
      }
      let parsed: unknown;
      try { parsed = JSON.parse(raw); }
      catch {
        hydrationStatus = 'incompatible';
        emit('persistence_hydration_incompatible', null, startedAt, 'corrupt_json');
        return { status: 'incompatible', state: null, errorCategory: 'corrupt_json' } as const;
      }
      const result = normalize(parsed);
      hydrationStatus = result.status;
      if (result.state) {
        currentState = result.state;
        revisionClock = Math.max(revisionClock, result.state.revision);
        durableRevision = Math.max(durableRevision, result.state.revision);
      }
      emit(result.status === 'restored' ? 'persistence_hydration_restored' : result.status === 'empty' ? 'persistence_hydration_empty' : 'persistence_hydration_incompatible', result.state, startedAt, result.errorCategory);
      return result;
    } catch {
      hydrationStatus = 'failed';
      emit('persistence_hydration_failed', null, startedAt, 'storage_read_failed');
      return { status: 'failed', state: null, errorCategory: 'storage_read_failed' } as const;
    }
  })();
  return hydrationPromise;
}

export async function loadTripBuilderPlanState(): Promise<PersistedTripBuilderPlanState | null> {
  await hydrateTripBuilderPlanState();
  return currentState;
}

export function createTripBuilderPlanSnapshot(state: MutableState): PersistedTripBuilderPlanState {
  return {
    ...state,
    selectedResupplyStop: state.selectedResupplyStop ?? null,
    schemaVersion: TRIP_BUILDER_PLAN_VERSION,
    revision: ++revisionClock,
    updatedAt: new Date().toISOString(),
  };
}

export function saveTripBuilderPlanSnapshot(snapshot: PersistedTripBuilderPlanState): Promise<PersistedTripBuilderPlanState> {
  emit('persistence_write_queued', snapshot);
  const operation = writeQueue.catch(() => undefined).then(async () => {
    if (snapshot.revision <= durableRevision) {
      emit('persistence_snapshot_superseded', snapshot);
      return snapshot;
    }
    const startedAt = Date.now();
    try {
      await planStorage.writeStrict(TRIP_BUILDER_PLAN_KEY, JSON.stringify(snapshot));
      durableRevision = snapshot.revision;
      currentState = snapshot;
      emit('persistence_write_succeeded', snapshot, startedAt);
      return snapshot;
    } catch (error) {
      emit('persistence_write_failed', snapshot, startedAt, error instanceof Error ? 'storage_write_failed' : 'unknown_write_failure');
      throw error;
    }
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function saveTripBuilderPlanState(state: MutableState): Promise<PersistedTripBuilderPlanState> {
  await hydrateTripBuilderPlanState();
  return saveTripBuilderPlanSnapshot(createTripBuilderPlanSnapshot(state));
}

export async function flushTripBuilderPlanState(): Promise<void> {
  await writeQueue;
  await planStorage.flushStrict();
}

export async function clearTripBuilderPlanState(): Promise<void> {
  await hydrateTripBuilderPlanState();
  const revision = ++revisionClock;
  const operation = writeQueue.catch(() => undefined).then(async () => {
    if (revision <= durableRevision) return;
    await planStorage.writeStrict(TRIP_BUILDER_PLAN_KEY, null);
    durableRevision = revision;
    currentState = null;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  await operation;
}

export function __resetTripBuilderPlanStoreForTests(): void {
  revisionClock = 0;
  durableRevision = 0;
  writeQueue = Promise.resolve();
  hydrationPromise = null;
  hydrationStatus = 'not_started';
  currentState = null;
  diagnosticListener = null;
}
