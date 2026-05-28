import { Platform } from 'react-native';

import type { TripBuilderRouteInput } from '../tripBuilder';
import { getOfflinePrepRouteCoordinates } from '../offlinePrepPack/offlinePrepPackService';

const EXPLORE_PLANNING_ROUTE_CONTEXT_KEY = 'ecs_explore_planning_route_context';

export type ExplorePlanningRouteContextSource = 'suggested_routes' | 'trip_builder_tab' | 'offline_prep_tab';

export type ExplorePlanningRouteContext = {
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
  const id = String(route.id ?? route.name ?? route.title ?? '').trim();
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

export function saveExplorePlanningRouteContext(args: {
  routes: TripBuilderRouteInput[];
  radiusMiles: number | null;
  refinementLabel?: string | null;
  source?: ExplorePlanningRouteContextSource;
}): ExplorePlanningRouteContext {
  const context: ExplorePlanningRouteContext = {
    routes: args.routes,
    radiusMiles: args.radiusMiles,
    refinementLabel: args.refinementLabel ?? null,
    source: args.source ?? 'suggested_routes',
    createdAt: new Date().toISOString(),
  };
  memoryContext = context;
  try {
    getStorage()?.setItem(EXPLORE_PLANNING_ROUTE_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // Memory context still supports the current native session.
  }
  return context;
}

export function loadExplorePlanningRouteContext(): ExplorePlanningRouteContext | null {
  if (memoryContext) return memoryContext;
  try {
    const raw = getStorage()?.getItem(EXPLORE_PLANNING_ROUTE_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExplorePlanningRouteContext;
    return Array.isArray(parsed?.routes) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearExplorePlanningRouteContext(): void {
  memoryContext = null;
  try {
    getStorage()?.removeItem(EXPLORE_PLANNING_ROUTE_CONTEXT_KEY);
  } catch {
    // No-op.
  }
}
