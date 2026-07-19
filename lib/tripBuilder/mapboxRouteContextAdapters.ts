import {
  createRoadSearchSessionToken,
  resolveRoadDestination,
  searchRoadDestinations,
  type RoadNavDestination,
  type RoadNavSearchSuggestion,
} from '../mapboxRoadNavigation';
import type {
  PlaceCandidate,
  PlaceCategory,
  PlacesProviderAdapter,
  PlacesSearchInput,
  RouteGeometryResult,
  RouteMatrixResult,
  RoutingProviderAdapter,
  RouteMatrixInput,
  RoutingProviderInput,
  RouteContextProviderRegistryInput,
} from '../routeContext/routeContextAdapters';
import type {
  RouteContextCoordinate,
  RouteContextProviderMetadata,
  RouteGeometryBounds,
} from '../routeContext/routeContextTypes';
import { classifyLiveSmartResupplyPoiCandidate } from './liveSmartResupplyPoiFilter';

const DIRECTIONS_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving';
const MATRIX_URL = 'https://api.mapbox.com/directions-matrix/v1/mapbox/driving';
const DEFAULT_ROUTE_CONTEXT_SEARCH_LIMIT = 8;

type SessionTokenFactory = string | (() => string);

function accessTokenAvailable(accessToken: string | null | undefined): accessToken is string {
  return typeof accessToken === 'string' && accessToken.trim().length > 0;
}

function cleanAccessToken(accessToken: string): string {
  return accessToken.trim();
}

function nextSessionToken(factory?: SessionTokenFactory | null): string {
  if (typeof factory === 'function') {
    const token = String(factory() ?? '').trim();
    return token || createRoadSearchSessionToken();
  }
  const token = String(factory ?? '').trim();
  return token || createRoadSearchSessionToken();
}

function isValidCoordinate(point: RouteContextCoordinate | null | undefined): point is RouteContextCoordinate {
  return !!point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180;
}

function coordinateParam(point: RouteContextCoordinate): string {
  return `${point.lng},${point.lat}`;
}

function providerMetadata(
  providerId: string,
  metadata?: RouteContextProviderMetadata | null,
): RouteContextProviderMetadata {
  return {
    providerId,
    ...(metadata ?? {}),
  };
}

async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs = 9000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Mapbox request failed (${response.status})`);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

function uniqueRoutePoints(input: RoutingProviderInput): RouteContextCoordinate[] {
  const origin = input.origin ?? input.routeCoordinates?.[0] ?? null;
  const destination = input.destination;
  const points = [
    origin,
    ...(input.waypoints ?? []),
    destination,
  ].filter(isValidCoordinate);

  const deduped: RouteContextCoordinate[] = [];
  points.forEach((point) => {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(previous.lat - point.lat) < 0.000001 && Math.abs(previous.lng - point.lng) < 0.000001) {
      return;
    }
    deduped.push(point);
  });
  return deduped.slice(0, 25);
}

function routeBounds(points: RouteContextCoordinate[]): RouteGeometryBounds | null {
  if (points.length === 0) return null;
  return points.reduce<RouteGeometryBounds>((bounds, point) => ({
    west: Math.min(bounds.west, point.lng),
    south: Math.min(bounds.south, point.lat),
    east: Math.max(bounds.east, point.lng),
    north: Math.max(bounds.north, point.lat),
  }), {
    west: points[0].lng,
    south: points[0].lat,
    east: points[0].lng,
    north: points[0].lat,
  });
}

function mapboxRouteCoordinates(value: unknown): RouteContextCoordinate[] {
  const rawCoordinates = (value as { geometry?: { coordinates?: unknown } })?.geometry?.coordinates;
  return Array.isArray(rawCoordinates)
    ? rawCoordinates
        .map((coordinate) => {
          if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
          const lng = Number(coordinate[0]);
          const lat = Number(coordinate[1]);
          return isValidCoordinate({ lat, lng }) ? { lat, lng } : null;
        })
        .filter((point): point is RouteContextCoordinate => point != null)
    : [];
}

function routeResultFromMapbox(route: unknown, fallbackPoints: RouteContextCoordinate[], providerId: string): RouteGeometryResult {
  const record = route as { distance?: unknown; duration?: unknown };
  const coordinates = mapboxRouteCoordinates(route);
  const points = coordinates.length >= 2 ? coordinates : fallbackPoints;
  return {
    coordinates: points,
    distanceMeters: Number.isFinite(Number(record.distance)) ? Number(record.distance) : null,
    durationSeconds: Number.isFinite(Number(record.duration)) ? Number(record.duration) : null,
    bbox: routeBounds(points),
    providerMetadata: providerMetadata(providerId, {
      source: 'mapbox_directions',
      pointCount: points.length,
    }),
  };
}

export function createMapboxRoutingProviderAdapter(
  accessToken: string | null | undefined,
): RoutingProviderAdapter {
  const token = accessTokenAvailable(accessToken) ? cleanAccessToken(accessToken) : null;
  return {
    id: 'mapbox_route_context_routing',
    isAvailable: () => token != null,
    async computeRoute(input: RoutingProviderInput): Promise<RouteGeometryResult> {
      if (!token) throw new Error('mapbox_access_token_missing');
      const points = uniqueRoutePoints(input);
      if (points.length < 2) throw new Error('route_points_missing');

      const url = new URL(`${DIRECTIONS_URL}/${points.map(coordinateParam).join(';')}`);
      url.searchParams.set('access_token', token);
      url.searchParams.set('geometries', 'geojson');
      url.searchParams.set('overview', 'full');
      url.searchParams.set('steps', 'false');
      url.searchParams.set('alternatives', 'false');
      url.searchParams.set('language', 'en');

      const data = await fetchJsonWithTimeout<{ routes?: unknown[] }>(url.toString());
      const route = data.routes?.[0];
      if (!route) throw new Error('mapbox_route_missing');
      return routeResultFromMapbox(route, points, 'mapbox_route_context_routing');
    },
    async computeRouteMatrix(input: RouteMatrixInput): Promise<RouteMatrixResult> {
      if (!token) throw new Error('mapbox_access_token_missing');
      const origins = input.origins.filter(isValidCoordinate).slice(0, 12);
      const destinations = input.destinations.filter(isValidCoordinate).slice(0, 12);
      if (origins.length === 0 || destinations.length === 0) return { cells: [] };

      const coordinates = [...origins, ...destinations].slice(0, 25);
      const destinationOffset = origins.length;
      const url = new URL(`${MATRIX_URL}/${coordinates.map(coordinateParam).join(';')}`);
      url.searchParams.set('access_token', token);
      url.searchParams.set('annotations', 'distance,duration');
      url.searchParams.set('sources', origins.map((_, index) => String(index)).join(';'));
      url.searchParams.set('destinations', destinations.map((_, index) => String(destinationOffset + index)).join(';'));

      const data = await fetchJsonWithTimeout<{
        distances?: Array<Array<number | null>>;
        durations?: Array<Array<number | null>>;
      }>(url.toString());
      const cells = origins.flatMap((_, originIndex) => (
        destinations.map((__, destinationIndex) => ({
          originIndex,
          destinationIndex,
          distanceMeters: data.distances?.[originIndex]?.[destinationIndex] ?? null,
          durationSeconds: data.durations?.[originIndex]?.[destinationIndex] ?? null,
          status: data.distances?.[originIndex]?.[destinationIndex] == null ? 'unknown' : 'ok',
          providerMetadata: providerMetadata('mapbox_route_context_routing', {
            source: 'mapbox_matrix',
          }),
        }))
      ));
      return {
        cells,
        providerMetadata: providerMetadata('mapbox_route_context_routing', {
          source: 'mapbox_matrix',
        }),
      };
    },
  };
}

function queryForCategory(category: PlaceCategory): string {
  switch (category) {
    case 'gas':
      return 'fuel stop';
    case 'grocery':
      return 'grocery market';
    case 'camp':
      return 'campground campsite';
    case 'bailout':
      return 'ranger station hospital town';
    case 'water':
      return 'water refill';
    case 'repair':
      return 'auto repair';
    case 'medical':
      return 'hospital clinic';
    case 'trailhead':
      return 'trailhead';
    default:
      return 'point of interest';
  }
}

function primaryCategory(input: PlacesSearchInput): PlaceCategory {
  return input.categories?.[0] ?? 'poi';
}

function searchQuery(input: PlacesSearchInput): string {
  const explicit = String(input.query ?? '').trim();
  if (explicit) return explicit;
  const categories: PlaceCategory[] = input.categories?.length ? input.categories : ['poi'];
  return categories.map(queryForCategory).join(' ');
}

function placeFromRoadDestination(args: {
  suggestion: RoadNavSearchSuggestion;
  destination: RoadNavDestination;
  category: PlaceCategory;
  providerId: string;
  metadata?: RouteContextProviderMetadata | null;
}): PlaceCandidate | null {
  const coordinate = {
    lat: args.destination.coordinate.lat,
    lng: args.destination.coordinate.lng,
    label: args.destination.title,
  };
  if (!isValidCoordinate(coordinate)) return null;
  const smartResupplyCategory = args.category === 'gas'
    ? 'fuel'
    : args.category === 'grocery'
      ? 'food_supplies'
      : null;
  const smartResupplyClassification = smartResupplyCategory
    ? classifyLiveSmartResupplyPoiCandidate({
        suggestion: args.suggestion,
        destination: args.destination,
      })
    : null;
  if (
    smartResupplyCategory &&
    !smartResupplyClassification?.categoryCoverage.includes(smartResupplyCategory)
  ) {
    return null;
  }
  return {
    id: `mapbox-${String(args.destination.id || args.suggestion.id)}`,
    providerPlaceId: args.destination.mapboxId ?? args.suggestion.mapboxId ?? args.destination.id ?? args.suggestion.id,
    category: args.category,
    name: args.destination.title || args.suggestion.title || 'Mapbox place',
    coordinate,
    address: args.destination.subtitle ?? args.suggestion.subtitle ?? null,
    openStatus: 'unknown',
    businessStatus: null,
    rating: null,
    confidence: 0.72,
    score: null,
    categoryMatchQuality: args.category === 'poi' ? 0.56 : 0.82,
    providerMetadata: providerMetadata(args.providerId, {
      ...(args.metadata ?? {}),
      source: 'mapbox_search',
      sourceType: args.destination.sourceType,
      ...(smartResupplyClassification
        ? {
            smartResupplyCategoryCoverage: smartResupplyClassification.categoryCoverage,
            smartResupplyCategoryUsefulness: smartResupplyClassification.usefulness,
          }
        : {}),
    }),
  };
}

async function searchMapboxPlaces(args: {
  accessToken: string;
  sessionTokenFactory?: SessionTokenFactory | null;
  input: PlacesSearchInput;
  providerId: string;
}): Promise<PlaceCandidate[]> {
  const category = primaryCategory(args.input);
  const sessionToken = nextSessionToken(args.sessionTokenFactory);
  const suggestions = await searchRoadDestinations({
    accessToken: args.accessToken,
    query: searchQuery(args.input),
    sessionToken,
    proximity: args.input.center ?? args.input.origin ?? null,
    bbox: args.input.bbox ?? null,
    limit: args.input.limit ?? DEFAULT_ROUTE_CONTEXT_SEARCH_LIMIT,
    billingContext: {
      flow: 'trip_builder_route_context_places',
      surface: 'Trip Builder',
      operatorAction: `${category} route context places search`,
    },
  });
  const places: PlaceCandidate[] = [];
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    try {
      const destination = await resolveRoadDestination({
        accessToken: args.accessToken,
        sessionToken,
        suggestion,
        billingContext: {
          flow: 'trip_builder_route_context_places',
          surface: 'Trip Builder',
          operatorAction: `${category} route context places retrieve`,
        },
      });
      const place = placeFromRoadDestination({
        suggestion,
        destination,
        category,
        providerId: args.providerId,
        metadata: args.input.providerMetadata ?? null,
      });
      if (!place) continue;
      const key = `${place.category}:${place.name.toLowerCase()}:${place.coordinate.lat.toFixed(5)},${place.coordinate.lng.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      places.push(place);
    } catch {}
  }
  return places;
}

export function createMapboxPlacesProviderAdapter(
  accessToken: string | null | undefined,
  sessionTokenFactory?: SessionTokenFactory | null,
): PlacesProviderAdapter {
  const token = accessTokenAvailable(accessToken) ? cleanAccessToken(accessToken) : null;
  return {
    id: 'mapbox_route_context_places',
    isAvailable: () => token != null,
    async searchNearby(input: PlacesSearchInput): Promise<PlaceCandidate[]> {
      if (!token) return [];
      return searchMapboxPlaces({
        accessToken: token,
        sessionTokenFactory,
        input,
        providerId: 'mapbox_route_context_places',
      });
    },
    async searchText(input: PlacesSearchInput): Promise<PlaceCandidate[]> {
      if (!token) return [];
      return searchMapboxPlaces({
        accessToken: token,
        sessionTokenFactory,
        input,
        providerId: 'mapbox_route_context_places',
      });
    },
  };
}

export function createMapboxRouteContextProviderRegistry(
  accessToken: string | null | undefined,
  sessionTokenFactory?: SessionTokenFactory | null,
): RouteContextProviderRegistryInput | null {
  if (!accessTokenAvailable(accessToken)) return null;
  return {
    routing: createMapboxRoutingProviderAdapter(accessToken),
    places: createMapboxPlacesProviderAdapter(accessToken, sessionTokenFactory),
  };
}
