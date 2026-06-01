import { Platform } from 'react-native';
import {
  buildTripBuilderSuggestedRouteHandoff,
  type BuildTripBuilderSuggestedRouteHandoffOptions,
  type TripBuilderRouteHandoff,
} from './tripBuilderSuggestedRouteHandoff';
import type { TripBuilderRouteInput } from './tripBuilderTypes';

const TRIP_BUILDER_ROUTE_HANDOFF_KEY = 'ecs_trip_builder_route_handoff';

let memoryHandoff: TripBuilderRouteHandoff | null = null;

function getStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function saveTripBuilderRouteHandoff(
  route: TripBuilderRouteInput,
  options: BuildTripBuilderSuggestedRouteHandoffOptions = {},
): TripBuilderRouteHandoff {
  const handoff = buildTripBuilderSuggestedRouteHandoff(route, options);
  memoryHandoff = handoff;
  try {
    getStorage()?.setItem(TRIP_BUILDER_ROUTE_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // Memory handoff still supports the current native session.
  }
  return handoff;
}

export function loadTripBuilderRouteHandoff(): TripBuilderRouteHandoff | null {
  if (memoryHandoff) return memoryHandoff;
  try {
    const raw = getStorage()?.getItem(TRIP_BUILDER_ROUTE_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TripBuilderRouteHandoff;
    return parsed?.route ? parsed : null;
  } catch {
    return null;
  }
}

export function clearTripBuilderRouteHandoff(): void {
  memoryHandoff = null;
  try {
    getStorage()?.removeItem(TRIP_BUILDER_ROUTE_HANDOFF_KEY);
  } catch {
    // No-op.
  }
}
