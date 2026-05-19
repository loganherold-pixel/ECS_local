import { Platform } from 'react-native';

import type { TripBuilderRouteInput } from '../tripBuilder';

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
