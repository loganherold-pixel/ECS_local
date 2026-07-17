import { buildTripItineraryFromSuggestedRoute } from './tripItineraryBuilderService';
import type {
  GeoPoint,
  TripBuilderFuelTelemetry,
  TripBuilderRouteContextInput,
  SuggestedRoute,
  TripBuilderVehicleProfile,
  TripBuilderRouteInput,
  TripItinerary,
} from './tripBuilderTypes';
import {
  attachJourneyLinkageToMetadata,
  canonicalJourneyEntityId,
  mergeJourneyLinkage,
  readJourneyLinkageFromMetadata,
  type ECSJourneyLinkage,
} from '../lifecycle/routeTripExpeditionLifecycle';

export const TRIP_BUILDER_HANDOFF_SCHEMA_VERSION = 2;

export type TripBuilderHandoffUserLocationState = 'live' | 'pending' | 'unknown';

export type TripBuilderRouteHandoff = {
  schemaVersion: number;
  handoffId: string;
  idempotencyKey: string;
  route: TripBuilderRouteInput;
  draftItinerary: TripItinerary | null;
  lifecycle: ECSJourneyLinkage;
  createdAt: string;
  userLocationState: TripBuilderHandoffUserLocationState;
};

export type BuildTripBuilderSuggestedRouteHandoffOptions = {
  userLocation?: GeoPoint | null;
  userPreferences?: Record<string, unknown> | null;
  vehicleProfile?: TripBuilderVehicleProfile | null;
  telemetry?: TripBuilderFuelTelemetry | Record<string, unknown> | null;
  routeContext?: TripBuilderRouteContextInput | null;
  createdAt?: string;
  /** Explore summary handoffs defer itinerary/geometry work to Trip Builder. */
  deferItineraryBuild?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function routeId(route: TripBuilderRouteInput): string {
  return String(route.id ?? route.name ?? route.title ?? 'selected-route').trim() || 'selected-route';
}

function routeName(route: TripBuilderRouteInput, id: string): string {
  return String(route.name ?? route.title ?? id).trim() || id;
}

function toSuggestedRoute(route: TripBuilderRouteInput): SuggestedRoute {
  const id = routeId(route);
  return {
    ...route,
    id,
    name: routeName(route, id),
  } as SuggestedRoute;
}

function userLocationState(userLocation: GeoPoint | null | undefined): TripBuilderHandoffUserLocationState {
  return userLocation ? 'live' : 'pending';
}

function routeWithDraftItinerary(
  route: TripBuilderRouteInput,
  draftItinerary: TripItinerary | null,
  locationState: TripBuilderHandoffUserLocationState,
  lifecycle: ECSJourneyLinkage,
): TripBuilderRouteInput {
  const routeMetadata = isRecord(route.routeMetadata) ? route.routeMetadata : {};
  return {
    ...route,
    ...(draftItinerary
      ? {
          itinerary: draftItinerary,
          itineraryConfidence: draftItinerary.confidence,
        }
      : null),
    routeMetadata: attachJourneyLinkageToMetadata({
      ...routeMetadata,
      tripBuilderDraftItineraryId: draftItinerary?.id ?? null,
      tripBuilderDraftItineraryStatus: draftItinerary?.status ?? 'draft',
      tripBuilderUserStartState: locationState,
    }, lifecycle),
  };
}

export function buildTripBuilderSuggestedRouteHandoff(
  route: TripBuilderRouteInput,
  options: BuildTripBuilderSuggestedRouteHandoffOptions = {},
): TripBuilderRouteHandoff {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const locationState = userLocationState(options.userLocation);
  const suggestedRoute = toSuggestedRoute(route);
  const sourceId = routeId(route);
  const routeMetadata = isRecord(route.routeMetadata) ? route.routeMetadata : {};
  const currentLifecycle = readJourneyLinkageFromMetadata(routeMetadata);
  const routeAssetId = typeof routeMetadata.sourceAssetId === 'string'
    ? routeMetadata.sourceAssetId
    : typeof routeMetadata.importedRouteId === 'string'
      ? canonicalJourneyEntityId('route_asset', routeMetadata.importedRouteId)
      : currentLifecycle?.identity.routeAssetId ?? null;
  const tripPlanId = canonicalJourneyEntityId('trip_plan', sourceId);
  const lifecycle = mergeJourneyLinkage(currentLifecycle, {
    phase: 'planned',
    identity: {
      discoveryId: currentLifecycle?.identity.discoveryId ?? canonicalJourneyEntityId('discovery_route', sourceId),
      routeAssetId,
      tripPlanId,
    },
    activeVehicleId: options.vehicleProfile?.id ?? currentLifecycle?.activeVehicleId ?? null,
    updatedAt: createdAt,
  });
  const draftItinerary = options.deferItineraryBuild
    ? null
    : buildTripItineraryFromSuggestedRoute({
        suggestedRoute,
        userLocation: options.userLocation ?? null,
        userPreferences: options.userPreferences ?? null,
        vehicleProfile: options.vehicleProfile ?? null,
        telemetry: options.telemetry ?? null,
        routeContext: options.routeContext ?? null,
        generatedAt: createdAt,
      });

  return {
    schemaVersion: TRIP_BUILDER_HANDOFF_SCHEMA_VERSION,
    handoffId: `trip-builder-handoff:${tripPlanId}`,
    idempotencyKey: `trip-builder:${sourceId}`,
    route: routeWithDraftItinerary(route, draftItinerary, locationState, lifecycle),
    draftItinerary,
    lifecycle,
    createdAt,
    userLocationState: locationState,
  };
}
