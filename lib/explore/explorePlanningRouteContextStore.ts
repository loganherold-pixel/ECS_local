import { Platform } from 'react-native';

import type { TripBuilderRouteInput } from '../tripBuilder';
import { getOfflinePrepRouteCoordinates } from '../offlinePrepPack/offlinePrepPackService';
import { createPersistedKeyValueCache } from '../keyValuePersistence';
import { capUniqueRankedRoutes } from './routeSearchResultPolicy';

const EXPLORE_PLANNING_ROUTE_CONTEXT_KEY = 'ecs_explore_planning_route_context';
const EXPLORE_PLANNING_CONTEXT_VERSION = 3;
const planningContextPersistence = createPersistedKeyValueCache('ecs_explore_planning_route_context');

export type ExplorePlanningRouteContextSource = 'suggested_routes' | 'trip_builder_tab' | 'offline_prep_tab';

export type ExplorePlanningRouteContext = {
  schemaVersion: number;
  routes: TripBuilderRouteInput[];
  radiusMiles: number | null;
  refinementLabel: string | null;
  source: ExplorePlanningRouteContextSource;
  createdAt: string;
};

let memoryContext: ExplorePlanningRouteContext | null = null;

function routeGeometryPointCount(route: TripBuilderRouteInput | null | undefined): number {
  if (!route) return 0;
  try {
    return getOfflinePrepRouteCoordinates(route).length;
  } catch {
    return 0;
  }
}

function routeRecord(value: TripBuilderRouteInput | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function planningRouteIdentity(route: TripBuilderRouteInput): string {
  return String(route.id ?? route.name ?? route.title ?? '').trim();
}

function normalizePlanningRoutes(
  routes: readonly TripBuilderRouteInput[],
): TripBuilderRouteInput[] {
  return capUniqueRankedRoutes(routes, planningRouteIdentity);
}

export function mergeExplorePlanningRoute(
  existing: TripBuilderRouteInput | null | undefined,
  incoming: TripBuilderRouteInput,
): TripBuilderRouteInput {
  if (!existing) return incoming;

  const existingGeometryCount = routeGeometryPointCount(existing);
  const incomingGeometryCount = routeGeometryPointCount(incoming);
  if (incomingGeometryCount >= existingGeometryCount) {
    return incoming;
  }

  const existingRecord = routeRecord(existing);
  const incomingRecord = routeRecord(incoming);
  return {
    ...incoming,
    routeGeometry: incoming.routeGeometry ?? existing.routeGeometry,
    trailGeometry: incoming.trailGeometry ?? existing.trailGeometry,
    geojson: incoming.geojson ?? existing.geojson,
    geometry: incomingRecord.geometry ?? existingRecord.geometry,
    coordinates: incomingRecord.coordinates ?? existingRecord.coordinates,
    points: incomingRecord.points ?? existingRecord.points,
    path: incomingRecord.path ?? existingRecord.path,
    polyline: incomingRecord.polyline ?? existingRecord.polyline,
    segments: incoming.segments ?? existing.segments,
    waypoints: incoming.waypoints ?? existing.waypoints,
    routeMetadata: {
      ...(existing.routeMetadata ?? {}),
      ...(incoming.routeMetadata ?? {}),
    },
  };
}

export function upsertExplorePlanningRoute(
  routeMap: Map<string, TripBuilderRouteInput>,
  route: TripBuilderRouteInput,
): void {
  const id = planningRouteIdentity(route);
  if (!id) return;
  routeMap.set(id, mergeExplorePlanningRoute(routeMap.get(id), route));
}

function getStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function normalizeContext(value: unknown): ExplorePlanningRouteContext | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<ExplorePlanningRouteContext>;
  if (parsed.schemaVersion !== EXPLORE_PLANNING_CONTEXT_VERSION || !Array.isArray(parsed.routes)) {
    return null;
  }
  return {
    schemaVersion: EXPLORE_PLANNING_CONTEXT_VERSION,
    routes: normalizePlanningRoutes(parsed.routes),
    radiusMiles: Number.isFinite(Number(parsed.radiusMiles)) ? Number(parsed.radiusMiles) : null,
    refinementLabel: typeof parsed.refinementLabel === 'string' ? parsed.refinementLabel : null,
    source: parsed.source ?? 'suggested_routes',
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date(0).toISOString(),
  };
}

function readPersistedContext(): string | null {
  if (Platform.OS === 'web') return getStorage()?.getItem(EXPLORE_PLANNING_ROUTE_CONTEXT_KEY) ?? null;
  return planningContextPersistence.get(EXPLORE_PLANNING_ROUTE_CONTEXT_KEY);
}

const planningContextHydration = Platform.OS === 'web'
  ? Promise.resolve()
  : planningContextPersistence.waitForHydration().then(() => {
      const raw = readPersistedContext();
      if (!raw || memoryContext) return;
      try { memoryContext = normalizeContext(JSON.parse(raw)); } catch {}
    });

export function saveExplorePlanningRouteContext(args: {
  routes: TripBuilderRouteInput[];
  radiusMiles: number | null;
  refinementLabel?: string | null;
  source?: ExplorePlanningRouteContextSource;
  persist?: boolean;
}): ExplorePlanningRouteContext {
  const context: ExplorePlanningRouteContext = {
    schemaVersion: EXPLORE_PLANNING_CONTEXT_VERSION,
    routes: normalizePlanningRoutes(args.routes),
    radiusMiles: args.radiusMiles,
    refinementLabel: args.refinementLabel ?? null,
    source: args.source ?? 'suggested_routes',
    createdAt: new Date().toISOString(),
  };
  memoryContext = context;
  if (args.persist === false) return context;
  try {
    const serialized = JSON.stringify(context);
    if (Platform.OS === 'web') getStorage()?.setItem(EXPLORE_PLANNING_ROUTE_CONTEXT_KEY, serialized);
    else {
      planningContextPersistence.set(EXPLORE_PLANNING_ROUTE_CONTEXT_KEY, serialized);
      void planningContextPersistence.flush();
    }
  } catch {
    // Memory context still supports the current native session.
  }
  return context;
}

export function loadExplorePlanningRouteContext(): ExplorePlanningRouteContext | null {
  if (memoryContext) return memoryContext;
  try {
    const raw = readPersistedContext();
    if (!raw) return null;
    const parsed = normalizeContext(JSON.parse(raw));
    memoryContext = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearExplorePlanningRouteContext(): Promise<void> {
  memoryContext = null;
  try {
    if (Platform.OS === 'web') getStorage()?.removeItem(EXPLORE_PLANNING_ROUTE_CONTEXT_KEY);
    else {
      planningContextPersistence.delete(EXPLORE_PLANNING_ROUTE_CONTEXT_KEY);
      await planningContextPersistence.flush();
    }
  } catch {
    // No-op.
  }
}

export async function loadExplorePlanningRouteContextAsync(): Promise<ExplorePlanningRouteContext | null> {
  await planningContextHydration;
  return loadExplorePlanningRouteContext();
}

export function waitForExplorePlanningRouteContextHydration(): Promise<void> {
  return planningContextHydration;
}
