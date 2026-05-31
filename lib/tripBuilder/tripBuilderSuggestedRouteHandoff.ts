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

export type TripBuilderHandoffUserLocationState = 'live' | 'pending' | 'unknown';

export type TripBuilderRouteHandoff = {
  route: TripBuilderRouteInput;
  draftItinerary: TripItinerary | null;
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
): TripBuilderRouteInput {
  if (!draftItinerary) return route;

  const routeMetadata = isRecord(route.routeMetadata) ? route.routeMetadata : {};
  return {
    ...route,
    itinerary: draftItinerary,
    itineraryConfidence: draftItinerary.confidence,
    routeMetadata: {
      ...routeMetadata,
      tripBuilderDraftItineraryId: draftItinerary.id,
      tripBuilderDraftItineraryStatus: draftItinerary.status ?? 'draft',
      tripBuilderUserStartState: locationState,
    },
  };
}

export function buildTripBuilderSuggestedRouteHandoff(
  route: TripBuilderRouteInput,
  options: BuildTripBuilderSuggestedRouteHandoffOptions = {},
): TripBuilderRouteHandoff {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const locationState = userLocationState(options.userLocation);
  const suggestedRoute = toSuggestedRoute(route);
  const draftItinerary = buildTripItineraryFromSuggestedRoute({
    suggestedRoute,
    userLocation: options.userLocation ?? null,
    userPreferences: options.userPreferences ?? null,
    vehicleProfile: options.vehicleProfile ?? null,
    telemetry: options.telemetry ?? null,
    routeContext: options.routeContext ?? null,
    generatedAt: createdAt,
  });

  return {
    route: routeWithDraftItinerary(route, draftItinerary, locationState),
    draftItinerary,
    createdAt,
    userLocationState: locationState,
  };
}
