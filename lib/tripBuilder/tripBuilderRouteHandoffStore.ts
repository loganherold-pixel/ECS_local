import { Platform } from 'react-native';
import { createPersistedKeyValueCache } from '../keyValuePersistence';
import {
  canonicalJourneyEntityId,
  mergeJourneyLinkage,
  readJourneyLinkageFromMetadata,
} from '../lifecycle/routeTripExpeditionLifecycle';
import {
  buildTripBuilderSuggestedRouteHandoff,
  TRIP_BUILDER_HANDOFF_SCHEMA_VERSION,
  type BuildTripBuilderSuggestedRouteHandoffOptions,
  type TripBuilderRouteHandoff,
} from './tripBuilderSuggestedRouteHandoff';
import type { TripBuilderRouteInput } from './tripBuilderTypes';

const TRIP_BUILDER_ROUTE_HANDOFF_KEY = 'ecs_trip_builder_route_handoff';
const handoffPersistence = createPersistedKeyValueCache('ecs_trip_builder_route_handoff');

let memoryHandoff: TripBuilderRouteHandoff | null = null;

function getStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function normalizeHandoff(value: unknown): TripBuilderRouteHandoff | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<TripBuilderRouteHandoff>;
  if (!parsed.route) return null;
  const sourceId = String(parsed.route.id ?? parsed.route.name ?? parsed.route.title ?? '').trim();
  if (!sourceId) return null;
  const createdAt = typeof parsed.createdAt === 'string' && parsed.createdAt
    ? parsed.createdAt
    : new Date(0).toISOString();
  const metadataLifecycle = readJourneyLinkageFromMetadata(parsed.route.routeMetadata);
  const tripPlanId = canonicalJourneyEntityId('trip_plan', sourceId);
  const lifecycle = mergeJourneyLinkage(parsed.lifecycle ?? metadataLifecycle, {
    phase: 'planned',
    identity: { tripPlanId },
    updatedAt: createdAt,
  });
  return {
    schemaVersion: TRIP_BUILDER_HANDOFF_SCHEMA_VERSION,
    handoffId: parsed.handoffId ?? `trip-builder-handoff:${tripPlanId}`,
    idempotencyKey: parsed.idempotencyKey ?? `trip-builder:${sourceId}`,
    route: parsed.route,
    draftItinerary: parsed.draftItinerary ?? null,
    lifecycle,
    createdAt,
    userLocationState: parsed.userLocationState ?? 'unknown',
  };
}

function readPersistedHandoff(): string | null {
  if (Platform.OS === 'web') return getStorage()?.getItem(TRIP_BUILDER_ROUTE_HANDOFF_KEY) ?? null;
  return handoffPersistence.get(TRIP_BUILDER_ROUTE_HANDOFF_KEY);
}

const tripBuilderHandoffHydration = Platform.OS === 'web'
  ? Promise.resolve()
  : handoffPersistence.waitForHydration().then(() => {
      const raw = readPersistedHandoff();
      if (!raw || memoryHandoff) return;
      try { memoryHandoff = normalizeHandoff(JSON.parse(raw)); } catch {}
    });

export function saveTripBuilderRouteHandoff(
  route: TripBuilderRouteInput,
  options: BuildTripBuilderSuggestedRouteHandoffOptions = {},
): TripBuilderRouteHandoff {
  const handoff = buildTripBuilderSuggestedRouteHandoff(route, options);
  memoryHandoff = handoff;
  try {
    const serialized = JSON.stringify(handoff);
    if (Platform.OS === 'web') getStorage()?.setItem(TRIP_BUILDER_ROUTE_HANDOFF_KEY, serialized);
    else {
      handoffPersistence.set(TRIP_BUILDER_ROUTE_HANDOFF_KEY, serialized);
      void handoffPersistence.flush();
    }
  } catch {
    // Memory handoff still supports the current native session.
  }
  return handoff;
}

export function loadTripBuilderRouteHandoff(): TripBuilderRouteHandoff | null {
  if (memoryHandoff) return memoryHandoff;
  try {
    const raw = readPersistedHandoff();
    if (!raw) return null;
    const parsed = normalizeHandoff(JSON.parse(raw));
    memoryHandoff = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearTripBuilderRouteHandoff(): Promise<void> {
  memoryHandoff = null;
  try {
    if (Platform.OS === 'web') getStorage()?.removeItem(TRIP_BUILDER_ROUTE_HANDOFF_KEY);
    else {
      handoffPersistence.delete(TRIP_BUILDER_ROUTE_HANDOFF_KEY);
      await handoffPersistence.flush();
    }
  } catch {
    // No-op.
  }
}

export async function loadTripBuilderRouteHandoffAsync(): Promise<TripBuilderRouteHandoff | null> {
  await tripBuilderHandoffHydration;
  return loadTripBuilderRouteHandoff();
}

export function waitForTripBuilderRouteHandoffHydration(): Promise<void> {
  return tripBuilderHandoffHydration;
}
