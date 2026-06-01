import type {
  RouteContextCoordinate,
  RouteContextProviderMetadata,
  RouteGeometry,
  RouteGeometryBounds,
  SupplyCandidate,
  SupplyCandidateCategory,
  SupplyMode,
} from './routeContextTypes';
import type {
  RouteContextProviderBundle,
  RouteContextCampProvider,
  RouteContextSupplyProvider,
  RouteContextGeometryProvider,
  RouteGeometryRequest,
  SupplyCandidateRequest,
} from './routeContextProviders';
import {
  boundingBoxFromCoordinates,
  buildRouteGeometrySegments,
  decodeEncodedPolyline,
  normalizeRouteGeometryCoordinate,
  normalizeRouteGeometryCoordinates,
  totalRouteDistanceMeters,
} from './routeContextGeometry';
import { discoverSupplyCandidates } from './routeContextSupplyDiscovery';
import { clampConfidence } from './routeContextTypes';
import type {
  CampCandidateProviderAdapter,
  CampCandidateProviderResult,
} from './routeContextCampCandidates';
import {
  createCampProviderFromAdapter,
} from './routeContextCampCandidates';
import type {
  BailoutCandidateProviderAdapter,
} from './routeContextBailoutCandidates';
import {
  createBailoutProviderFromAdapter,
  createBailoutProviderFromPlacesAdapter,
} from './routeContextBailoutCandidates';

export type RouteProviderCapability =
  | 'routing'
  | 'route_matrix'
  | 'places_nearby'
  | 'places_text'
  | 'place_details'
  | 'forward_geocode'
  | 'reverse_geocode'
  | 'camp_candidates'
  | 'bailout_candidates';

export type RouteGeometryResult = {
  coordinates?: unknown;
  encodedPolyline?: string | null;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  bbox?: RouteGeometryBounds | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type RouteMatrixCell = {
  originIndex: number;
  destinationIndex: number;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  status?: 'ok' | 'unreachable' | 'unknown' | string | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type RouteMatrixResult = {
  cells: RouteMatrixCell[];
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type RoutingProviderInput = {
  origin?: RouteContextCoordinate | null;
  destination: RouteContextCoordinate;
  waypoints?: RouteContextCoordinate[] | null;
  routeCoordinates?: RouteContextCoordinate[] | null;
  mode?: 'driving' | 'walking' | 'cycling' | 'offroad' | string | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type RouteMatrixInput = {
  origins: RouteContextCoordinate[];
  destinations: RouteContextCoordinate[];
  mode?: 'driving' | 'walking' | 'cycling' | 'offroad' | string | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

export interface RoutingProviderAdapter {
  id: string;
  computeRoute(input: RoutingProviderInput): Promise<RouteGeometryResult>;
  computeRouteMatrix(input: RouteMatrixInput): Promise<RouteMatrixResult>;
  isAvailable(): boolean;
}

export type PlaceCategory =
  | SupplyCandidateCategory
  | 'camp'
  | 'bailout'
  | 'water'
  | 'repair'
  | 'medical'
  | 'trailhead'
  | 'poi'
  | 'unknown';

export type PlaceOpenStatus = 'open' | 'closed' | 'temporarily_closed' | 'unknown';

export type PlaceCandidate = {
  id: string;
  providerPlaceId?: string | null;
  category: PlaceCategory;
  name: string;
  coordinate: RouteContextCoordinate;
  address?: string | null;
  openStatus?: PlaceOpenStatus | null;
  businessStatus?: string | null;
  rating?: number | null;
  confidence?: number | null;
  score?: number | null;
  categoryMatchQuality?: number | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type PlacesSearchInput = {
  center?: RouteContextCoordinate | null;
  origin?: RouteContextCoordinate | null;
  query?: string | null;
  categories?: PlaceCategory[];
  radiusMeters?: number | null;
  bbox?: RouteGeometryBounds | null;
  limit?: number | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

export interface PlacesProviderAdapter {
  id: string;
  searchNearby(input: PlacesSearchInput): Promise<PlaceCandidate[]>;
  searchText(input: PlacesSearchInput): Promise<PlaceCandidate[]>;
  getPlaceDetails?(placeId: string, input?: PlacesSearchInput): Promise<PlaceCandidate | null>;
  isAvailable(): boolean;
}

export type GeocodeResult = {
  coordinate: RouteContextCoordinate;
  label?: string | null;
  address?: string | null;
  providerPlaceId?: string | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type ForwardGeocodeInput = {
  query: string;
  proximity?: RouteContextCoordinate | null;
  bbox?: RouteGeometryBounds | null;
  limit?: number | null;
};

export type ReverseGeocodeInput = {
  coordinate: RouteContextCoordinate;
  limit?: number | null;
};

export interface GeocoderProviderAdapter {
  id: string;
  forwardGeocode(input: ForwardGeocodeInput): Promise<GeocodeResult[]>;
  reverseGeocode(input: ReverseGeocodeInput): Promise<GeocodeResult[]>;
  isAvailable(): boolean;
}

export type RouteContextProviderRegistryInput = {
  routing?: RoutingProviderAdapter | null;
  places?: PlacesProviderAdapter | null;
  geocoder?: GeocoderProviderAdapter | null;
  camp?: CampCandidateProviderAdapter | null;
  bailout?: BailoutCandidateProviderAdapter | null;
};

export type RouteContextProviderRegistry = {
  routing: RoutingProviderAdapter | null;
  places: PlacesProviderAdapter | null;
  geocoder: GeocoderProviderAdapter | null;
  camp: CampCandidateProviderAdapter | null;
  bailout: BailoutCandidateProviderAdapter | null;
  canRoute(): boolean;
  canComputeMatrix(): boolean;
  canSearchPlaces(): boolean;
  canGeocode(): boolean;
  canSearchCampCandidates(): boolean;
  canSearchBailoutCandidates(): boolean;
  getCapabilities(): RouteProviderCapability[];
  toProviderBundle(): RouteContextProviderBundle;
};

function finitePositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function scoreConfidence(value: unknown, fallback: number): { value: number; reasons: string[] } {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return { value: clampConfidence(parsed), reasons: ['Provider-normalized confidence score.'] };
  }
  return { value: fallback, reasons: ['ECS normalized provider candidate.'] };
}

function sanitizedProviderMetadata(
  providerId: string,
  metadata?: RouteContextProviderMetadata | null,
): RouteContextProviderMetadata {
  return {
    providerId,
    ...(metadata ?? {}),
  };
}

function normalizePlaceCategory(category: PlaceCategory, mode?: SupplyMode | null): SupplyCandidateCategory | null {
  if (category === 'gas' || category === 'grocery') return category;
  if (mode === 'gas') return 'gas';
  if (mode === 'grocery') return 'grocery';
  return null;
}

function supplyQueriesForMode(mode: SupplyMode): Array<{ category: SupplyCandidateCategory; query: string }> {
  if (mode === 'gas') return [{ category: 'gas', query: 'fuel stop' }];
  if (mode === 'grocery') return [{ category: 'grocery', query: 'grocery market' }];
  if (mode === 'gas_and_grocery') {
    return [
      { category: 'gas', query: 'fuel stop' },
      { category: 'grocery', query: 'grocery market' },
    ];
  }
  return [];
}

export function normalizeRouteGeometryResult(
  result: RouteGeometryResult | null | undefined,
  fallback?: {
    origin?: RouteContextCoordinate | null;
    destination?: RouteContextCoordinate | null;
    providerId?: string | null;
  },
): RouteGeometry | null {
  if (!result) return null;
  const decoded = decodeEncodedPolyline(result.encodedPolyline);
  const coordinates = normalizeRouteGeometryCoordinates(result.coordinates);
  const points = coordinates.length >= 2 ? coordinates : decoded;
  if (points.length < 2) return null;

  const distanceMeters = finitePositiveNumber(result.distanceMeters) ?? totalRouteDistanceMeters(points);
  const durationSeconds = finitePositiveNumber(result.durationSeconds);
  const providerMetadata = sanitizedProviderMetadata(
    fallback?.providerId ?? 'route_context_routing_adapter',
    result.providerMetadata,
  );
  return {
    origin: fallback?.origin ?? null,
    destination: fallback?.destination ?? points[points.length - 1],
    waypoints: points.slice(1, -1),
    encodedPolyline: result.encodedPolyline ?? null,
    coordinates: points,
    distanceMeters: Math.round(distanceMeters),
    durationSeconds,
    bbox: result.bbox ?? boundingBoxFromCoordinates(points),
    corridor: null,
    segments: buildRouteGeometrySegments(points, providerMetadata),
    providerMetadata,
  };
}

export function normalizePlaceCandidate(
  input: unknown,
  fallbackCategory: PlaceCategory = 'unknown',
  providerId = 'route_context_places_adapter',
): PlaceCandidate | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const coordinate = normalizeRouteGeometryCoordinate(
    record.coordinate ?? record.location ?? record.center ?? record.geometry ?? record,
  );
  if (!coordinate) return null;

  const providerPlaceId = record.providerPlaceId ?? record.placeId ?? record.id ?? null;
  const name = String(record.name ?? record.title ?? record.label ?? 'Unnamed place').trim();
  const category = String(record.category ?? record.type ?? fallbackCategory) as PlaceCategory;
  const address = record.address ?? record.formattedAddress ?? record.fullAddress ?? record.subtitle ?? null;
  const rating = finitePositiveNumber(record.rating);
  const score = finitePositiveNumber(record.score);
  const confidence = finitePositiveNumber(record.confidence);
  const categoryMatchQuality = finitePositiveNumber(
    record.categoryMatchQuality ?? record.category_match_quality,
  );
  return {
    id: String(record.id ?? providerPlaceId ?? `${providerId}:${name}:${coordinate.lat},${coordinate.lng}`),
    providerPlaceId: providerPlaceId == null ? null : String(providerPlaceId),
    category,
    name: name || 'Unnamed place',
    coordinate,
    address: address == null ? null : String(address),
    openStatus: normalizeOpenStatus(record.openStatus ?? record.open_status),
    businessStatus: record.businessStatus == null ? null : String(record.businessStatus),
    rating,
    confidence,
    score,
    categoryMatchQuality,
    providerMetadata: sanitizedProviderMetadata(providerId, {
      categoryMatchQuality,
      sourceCategory: record.category ?? record.type ?? null,
      providerMetadata: record.providerMetadata ?? null,
    }),
  };
}

function normalizeOpenStatus(value: unknown): PlaceOpenStatus | null {
  if (value == null) return null;
  const text = String(value).toLowerCase();
  if (text === 'open' || text === 'closed' || text === 'temporarily_closed' || text === 'unknown') return text;
  if (text.includes('temporarily')) return 'temporarily_closed';
  if (text.includes('closed')) return 'closed';
  if (text.includes('open')) return 'open';
  return 'unknown';
}

export function createGeometryProviderFromRoutingAdapter(
  adapter: RoutingProviderAdapter,
): RouteContextGeometryProvider | null {
  if (!adapter.isAvailable()) return null;
  return {
    id: adapter.id,
    async buildRouteGeometry(request: RouteGeometryRequest): Promise<RouteGeometry | null> {
      const destination = request.destination ?? request.routeCoordinates?.[request.routeCoordinates.length - 1] ?? null;
      if (!destination) return null;
      const result = await adapter.computeRoute({
        origin: request.origin ?? request.trailheadAnchor,
        destination,
        waypoints: request.routeCoordinates?.slice(1, -1) ?? [],
        routeCoordinates: request.routeCoordinates ?? [],
      });
      return normalizeRouteGeometryResult(result, {
        origin: request.origin ?? request.trailheadAnchor,
        destination,
        providerId: adapter.id,
      });
    },
  };
}

export function createSupplyProviderFromPlacesAdapter(
  adapter: PlacesProviderAdapter,
  routingAdapter?: RoutingProviderAdapter | null,
): RouteContextSupplyProvider | null {
  if (!adapter.isAvailable()) return null;
  return {
    id: adapter.id,
    async findSupplyCandidates(request: SupplyCandidateRequest): Promise<SupplyCandidate[]> {
      const normalizingAdapter: PlacesProviderAdapter = {
        ...adapter,
        async searchNearby(input) {
          const places = await adapter.searchNearby(input);
          return places
            .map((place) => normalizePlaceCandidate(place, input.categories?.[0] ?? 'unknown', adapter.id))
            .filter((place): place is PlaceCandidate => place != null);
        },
        async searchText(input) {
          const places = await adapter.searchText(input);
          return places
            .map((place) => normalizePlaceCandidate(place, input.categories?.[0] ?? 'unknown', adapter.id))
            .filter((place): place is PlaceCandidate => place != null);
        },
      };
      return discoverSupplyCandidates({
        placesAdapter: normalizingAdapter,
        routingAdapter: routingAdapter?.isAvailable() ? routingAdapter : null,
        request,
        searchTerms: supplyQueriesForMode(request.mode),
      });
    },
  };
}

function campCandidateProviderResultFromPlace(
  place: PlaceCandidate,
  providerId: string,
): CampCandidateProviderResult | null {
  const normalized = normalizePlaceCandidate(place, 'camp', providerId);
  if (!normalized) return null;
  return {
    id: normalized.id,
    providerCampId: normalized.providerPlaceId ?? normalized.id,
    name: normalized.name,
    coordinate: normalized.coordinate,
    source: providerId,
    accessStatus: normalized.openStatus ?? normalized.businessStatus ?? 'unknown',
    legalStatus: normalized.providerMetadata?.legalStatus == null
      ? 'unknown'
      : String(normalized.providerMetadata.legalStatus),
    restrictionStatus: normalized.providerMetadata?.restrictionStatus == null
      ? null
      : String(normalized.providerMetadata.restrictionStatus),
    confidence: normalized.confidence ?? null,
    score: normalized.score ?? null,
    providerMetadata: {
      providerId,
      providerPlaceId: normalized.providerPlaceId ?? null,
      businessStatus: normalized.businessStatus ?? null,
      sourceCategory: normalized.category,
      placeProviderMetadata: normalized.providerMetadata ?? null,
    },
  };
}

export function createCampProviderFromPlacesAdapter(
  adapter: PlacesProviderAdapter,
): RouteContextCampProvider | null {
  if (!adapter.isAvailable()) return null;
  const campAdapter: CampCandidateProviderAdapter = {
    id: adapter.id,
    isAvailable: () => adapter.isAvailable(),
    async searchCampCandidates(input) {
      const limit = input.limit ?? 8;
      const nearby = await adapter.searchNearby({
        center: input.trailheadAnchor,
        categories: ['camp'],
        bbox: input.routeGeometry?.bbox ?? undefined,
        radiusMeters: input.corridor?.widthMeters ? input.corridor.widthMeters * 3 : 24_000,
        limit,
        providerMetadata: input.providerMetadata ?? null,
      });
      const normalized = nearby
        .map((place) => campCandidateProviderResultFromPlace(place, adapter.id))
        .filter((candidate): candidate is CampCandidateProviderResult => candidate != null);
      if (normalized.length > 0) return normalized;
      const text = await adapter.searchText({
        center: input.trailheadAnchor,
        categories: ['camp'],
        query: 'campground campsite',
        bbox: input.routeGeometry?.bbox ?? undefined,
        limit,
        providerMetadata: input.providerMetadata ?? null,
      });
      return text
        .map((place) => campCandidateProviderResultFromPlace(place, adapter.id))
        .filter((candidate): candidate is CampCandidateProviderResult => candidate != null);
    },
  };
  return createCampProviderFromAdapter(campAdapter);
}

export function createRouteContextProviderRegistry(
  input: RouteContextProviderRegistryInput = {},
): RouteContextProviderRegistry {
  const routing = input.routing?.isAvailable() ? input.routing : null;
  const places = input.places?.isAvailable() ? input.places : null;
  const geocoder = input.geocoder?.isAvailable() ? input.geocoder : null;
  const camp = input.camp?.isAvailable() ? input.camp : null;
  const bailout = input.bailout?.isAvailable() ? input.bailout : null;

  return {
    routing,
    places,
    geocoder,
    camp,
    bailout,
    canRoute: () => routing != null,
    canComputeMatrix: () => routing != null,
    canSearchPlaces: () => places != null,
    canGeocode: () => geocoder != null,
    canSearchCampCandidates: () => camp != null || places != null,
    canSearchBailoutCandidates: () => bailout != null || places != null,
    getCapabilities: () => [
      ...(routing ? ['routing', 'route_matrix'] as const : []),
      ...(places ? ['places_nearby', 'places_text'] as const : []),
      ...(places?.getPlaceDetails ? ['place_details'] as const : []),
      ...(geocoder ? ['forward_geocode', 'reverse_geocode'] as const : []),
      ...((camp || places) ? ['camp_candidates'] as const : []),
      ...((bailout || places) ? ['bailout_candidates'] as const : []),
    ],
    toProviderBundle: () => ({
      geometryProvider: routing ? createGeometryProviderFromRoutingAdapter(routing) : null,
      supplyProvider: places ? createSupplyProviderFromPlacesAdapter(places, routing) : null,
      campProvider: camp
        ? createCampProviderFromAdapter(camp)
        : places
          ? createCampProviderFromPlacesAdapter(places)
          : null,
      bailoutProvider: bailout
        ? createBailoutProviderFromAdapter(bailout, routing)
        : places
          ? createBailoutProviderFromPlacesAdapter(places, routing)
          : null,
    }),
  };
}

export function createNoopRoutingProviderAdapter(id = 'noop-routing-provider'): RoutingProviderAdapter {
  return {
    id,
    isAvailable: () => false,
    async computeRoute(): Promise<RouteGeometryResult> {
      throw new Error('routing_provider_unavailable');
    },
    async computeRouteMatrix(): Promise<RouteMatrixResult> {
      throw new Error('routing_provider_unavailable');
    },
  };
}

export function createNoopPlacesProviderAdapter(id = 'noop-places-provider'): PlacesProviderAdapter {
  return {
    id,
    isAvailable: () => false,
    async searchNearby(): Promise<PlaceCandidate[]> {
      return [];
    },
    async searchText(): Promise<PlaceCandidate[]> {
      return [];
    },
  };
}

export function createNoopGeocoderProviderAdapter(id = 'noop-geocoder-provider'): GeocoderProviderAdapter {
  return {
    id,
    isAvailable: () => false,
    async forwardGeocode(): Promise<GeocodeResult[]> {
      return [];
    },
    async reverseGeocode(): Promise<GeocodeResult[]> {
      return [];
    },
  };
}

export { createNoopCampCandidateProviderAdapter } from './routeContextCampCandidates';
export { createNoopBailoutCandidateProviderAdapter } from './routeContextBailoutCandidates';
