import type { RoadNavRoute } from '../mapboxRoadNavigation';
import type { NavigationHandoffPayload } from '../navigationHandoffStore';
import {
  buildTripBuilderGuidanceItinerary,
  type TripBuilderGuidanceItineraryRole,
} from './tripBuilderGuidanceItinerary';
import type { GeoPoint, TripPlan } from './tripBuilderTypes';

function roleLabel(role: TripBuilderGuidanceItineraryRole): string {
  switch (role) {
    case 'origin': return 'Starting point';
    case 'resupply': return 'Fuel / groceries / supplies';
    case 'trailhead': return 'Trail entry';
    case 'destination': return 'Trip destination';
    default: return 'Itinerary point';
  }
}

export type BuildTripBuilderNavigationOutputInput = {
  basePayload: NavigationHandoffPayload;
  plan: TripPlan;
  preparedRoadRoute: RoadNavRoute;
  spinePoints: GeoPoint[];
  origin?: unknown;
  trailhead?: unknown;
  destination?: unknown;
  canonicalRoute: unknown;
};

/**
 * Creates the single Trip Builder → Navigate handoff contract. The same spine
 * drives metadata and projection, while source GPX waypoints are replaced by
 * the exact origin/resupply/trailhead/destination itinerary.
 */
export function buildTripBuilderNavigationOutput(
  input: BuildTripBuilderNavigationOutputInput,
): NavigationHandoffPayload {
  const routeGeometry = {
    type: 'LineString' as const,
    coordinates: input.spinePoints.map((point) => [
      point.longitude,
      point.latitude,
    ] as [number, number]),
  };
  const guidanceItinerary = buildTripBuilderGuidanceItinerary({
    plan: input.plan,
    origin: input.origin,
    trailhead: input.trailhead,
    destination: input.destination,
    routeGeometry,
  });

  return {
    ...input.basePayload,
    routeSource: 'built',
    requiresOnlineRouting: false,
    preparedRoadRoute: input.preparedRoadRoute,
    trailWaypoints: guidanceItinerary.map((point) => ({
      id: point.id,
      coordinate: {
        lat: point.coordinate.latitude,
        lng: point.coordinate.longitude,
      },
      name: point.title,
      type: point.role,
      note: roleLabel(point.role),
      routeIndex: point.routeIndex,
      reachedRadiusM: point.role === 'resupply' ? 45 : 35,
    })),
    routeMetadata: {
      ...(input.basePayload.routeMetadata ?? {}),
      tripBuilderPlanId: input.plan.id,
      tripBuilderGuidanceItinerary: guidanceItinerary,
      tripBuilderPrimarySpine: routeGeometry,
      tripBuilderPrimarySpinePointCount: input.spinePoints.length,
      tripBuilderRoadGuidanceMode: input.preparedRoadRoute.guidanceMode,
      autoStartNavigation: true,
      routePreviewStartGuidance: true,
    },
    raw: {
      route: input.canonicalRoute,
      tripPlan: input.plan,
      guidanceItinerary,
    },
  };
}
