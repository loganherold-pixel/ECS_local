import {
  ROUTE_CONTEXT_BAILOUT_CANDIDATE_CORRIDOR_METERS,
  ROUTE_CONTEXT_BAILOUT_CANDIDATE_LIMIT,
} from './routeContextConfig';
import {
  estimateDistanceFromRouteMeters,
  haversineDistanceMeters,
  nearestPointOnRoute,
  normalizeRouteGeometryCoordinate,
  normalizeRouteGeometryCoordinates,
} from './routeContextGeometry';
import type {
  PlaceCandidate,
  PlacesProviderAdapter,
  RoutingProviderAdapter,
} from './routeContextAdapters';
import type {
  BailoutCandidateRequest,
  RouteContextBailoutProvider,
} from './routeContextProviders';
import type {
  BailoutCandidate,
  Confidence,
  RouteContextCoordinate,
  RouteContextProviderMetadata,
  RouteContextWarning,
  RouteGeometry,
  TrailheadAnchor,
} from './routeContextTypes';
import { clampConfidence } from './routeContextTypes';

export type BailoutCandidateCategory = NonNullable<BailoutCandidate['category']>;

export type BailoutCandidateSearchInput = {
  routeGeometry: RouteGeometry | null;
  trailGeometry?: RouteContextCoordinate[] | null;
  trailheadAnchor: TrailheadAnchor;
  corridor?: RouteGeometry['corridor'] | null;
  existingPoiData?: unknown[] | null;
  limit?: number | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type BailoutCandidateProviderResult = {
  id?: string | null;
  providerPlaceId?: string | null;
  label?: string | null;
  name?: string | null;
  category?: string | null;
  coordinate?: unknown;
  location?: unknown;
  lat?: number | null;
  lng?: number | null;
  source?: string | null;
  reachableByVehicle?: boolean | null;
  driveTimeToSafetySeconds?: number | null;
  confidence?: number | Confidence | null;
  score?: number | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

export interface BailoutCandidateProviderAdapter {
  id: string;
  searchBailoutCandidates(input: BailoutCandidateSearchInput): Promise<BailoutCandidateProviderResult[]>;
  isAvailable(): boolean;
}

export type BailoutCandidateServiceInput = BailoutCandidateSearchInput & {
  provider?: BailoutCandidateProviderAdapter | null;
  routingAdapter?: RoutingProviderAdapter | null;
  candidates?: BailoutCandidateProviderResult[] | null;
};

export type BailoutCandidateServiceResult = {
  candidates: BailoutCandidate[];
  warnings: RouteContextWarning[];
};

function warning(
  code: RouteContextWarning['code'],
  message: string,
  severity: RouteContextWarning['severity'] = 'watch',
  source?: string | null,
): RouteContextWarning {
  return { code, message, severity, source };
}

function confidence(value: number, reasons: string[]): Confidence {
  return { value: clampConfidence(value), reasons };
}

function finitePositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function candidateCoordinate(candidate: BailoutCandidateProviderResult): RouteContextCoordinate | null {
  return normalizeRouteGeometryCoordinate(
    candidate.coordinate ??
      candidate.location ??
      (
        candidate.lat != null && candidate.lng != null
          ? { lat: candidate.lat, lng: candidate.lng }
          : null
      ),
  );
}

function normalizeBailoutCategory(value: unknown): BailoutCandidateCategory {
  if (value == null || value === '') return 'unknown';
  const text = String(value).toLowerCase();
  if (text.includes('return')) return 'return_to_start';
  if (text.includes('road') || text.includes('trailhead') || text.includes('access')) return 'road_access';
  if (text.includes('town') || text.includes('city') || text.includes('village')) return 'town';
  if (text.includes('fuel') || text.includes('gas')) return 'fuel';
  if (text.includes('ranger')) return 'ranger_station';
  if (text.includes('visitor')) return 'visitor_center';
  if (text.includes('medical') || text.includes('hospital') || text.includes('clinic')) return 'medical';
  if (text.includes('support') || text.includes('repair') || text.includes('service')) return 'support';
  return 'unknown';
}

function providerConfidence(input: BailoutCandidateProviderResult): Confidence {
  if (typeof input.confidence === 'object' && input.confidence && Number.isFinite(input.confidence.value)) {
    return {
      value: clampConfidence(input.confidence.value),
      reasons: [...input.confidence.reasons],
    };
  }
  const value = finitePositiveNumber(input.confidence);
  if (value != null) return confidence(value, ['Provider supplied normalized bailout confidence.']);
  return confidence(0.5, ['ECS normalized bailout candidate provider output.']);
}

function distanceScore(distanceMeters?: number | null): number {
  if (distanceMeters == null) return 0.46;
  if (distanceMeters <= 500) return 1;
  if (distanceMeters <= 2_000) return 0.88;
  if (distanceMeters <= 8_000) return 0.62;
  if (distanceMeters <= 25_000) return 0.34;
  return 0.14;
}

function driveTimeScore(seconds?: number | null): number {
  if (seconds == null) return 0.52;
  if (seconds <= 10 * 60) return 1;
  if (seconds <= 30 * 60) return 0.8;
  if (seconds <= 60 * 60) return 0.5;
  return 0.22;
}

function categoryScore(category: BailoutCandidateCategory): number {
  if (category === 'road_access' || category === 'return_to_start') return 0.86;
  if (category === 'town' || category === 'fuel' || category === 'ranger_station' || category === 'visitor_center') return 0.74;
  if (category === 'medical') return 0.68;
  if (category === 'support') return 0.62;
  return 0.36;
}

function reachableScore(reachableByVehicle?: boolean | null): number {
  if (reachableByVehicle === true) return 0.9;
  if (reachableByVehicle === false) return 0.22;
  return 0.45;
}

function routePositionScore(routeMileMarker?: number | null): number {
  if (routeMileMarker == null) return 0.5;
  return 0.72;
}

function scoreBailoutCandidate(args: {
  distanceFromRouteMeters: number | null;
  driveTimeToSafetySeconds: number | null;
  routeMileMarker: number | null;
  category: BailoutCandidateCategory;
  reachableByVehicle?: boolean | null;
  confidence: Confidence;
  providerScore?: number | null;
}): number {
  const providerScore = finitePositiveNumber(args.providerScore);
  return clampConfidence(
    distanceScore(args.distanceFromRouteMeters) * 0.24 +
      driveTimeScore(args.driveTimeToSafetySeconds) * 0.18 +
      routePositionScore(args.routeMileMarker) * 0.1 +
      args.confidence.value * 0.18 +
      categoryScore(args.category) * 0.16 +
      reachableScore(args.reachableByVehicle) * 0.1 +
      (providerScore ?? 0.55) * 0.04,
  );
}

function candidateWarnings(args: {
  category: BailoutCandidateCategory;
  reachableByVehicle?: boolean | null;
  driveTimeToSafetySeconds?: number | null;
  source?: string | null;
}): RouteContextWarning[] {
  const warnings: RouteContextWarning[] = [];
  if (args.reachableByVehicle !== true) {
    warnings.push(warning('unknown_bailout_reachability', 'Bailout candidate reachability is unverified and must be checked before relying on it.', 'watch', args.source));
  }
  if (
    args.category === 'medical' ||
    args.category === 'ranger_station' ||
    args.category === 'visitor_center' ||
    args.category === 'support' ||
    args.driveTimeToSafetySeconds == null
  ) {
    warnings.push(warning('unverified_bailout_support', 'Bailout support details are not verified emergency service guarantees.', 'info', args.source));
  }
  return warnings;
}

async function routeMatrixDriveTimes(args: {
  routingAdapter?: RoutingProviderAdapter | null;
  candidates: Array<{ id: string; coordinate: RouteContextCoordinate }>;
  destination: RouteContextCoordinate;
}): Promise<Map<string, number>> {
  const times = new Map<string, number>();
  if (!args.routingAdapter?.isAvailable() || args.candidates.length === 0) return times;
  try {
    const result = await args.routingAdapter.computeRouteMatrix({
      origins: args.candidates.map((candidate) => candidate.coordinate),
      destinations: [args.destination],
      mode: 'driving',
    });
    result.cells.forEach((cell) => {
      if (cell.destinationIndex !== 0 || cell.status === 'unreachable') return;
      const candidate = args.candidates[cell.originIndex];
      if (!candidate || cell.durationSeconds == null || !Number.isFinite(cell.durationSeconds)) return;
      times.set(candidate.id, Math.round(cell.durationSeconds));
    });
  } catch {
    return times;
  }
  return times;
}

function normalizeBailoutCandidate(args: {
  input: BailoutCandidateProviderResult;
  routeCoordinates: RouteContextCoordinate[];
  trailheadAnchor: TrailheadAnchor;
  providerId?: string | null;
  driveTimeToSafetySeconds?: number | null;
}): BailoutCandidate | null {
  const coordinate = candidateCoordinate(args.input);
  if (!coordinate) return null;
  const nearest = nearestPointOnRoute(coordinate, args.routeCoordinates);
  const distanceFromRouteMeters = estimateDistanceFromRouteMeters(coordinate, args.routeCoordinates);
  const distanceFromTrailheadMeters = haversineDistanceMeters(args.trailheadAnchor, coordinate);
  const routeMileMarker = nearest
    ? Math.round((nearest.distanceAlongRouteMeters / 1609.344) * 10) / 10
    : null;
  const category = normalizeBailoutCategory(args.input.category);
  const source = args.input.source ?? args.providerId ?? 'route_context_bailout_provider';
  const candidateConfidence = providerConfidence(args.input);
  const driveTimeToSafetySeconds = finitePositiveNumber(args.input.driveTimeToSafetySeconds) ?? args.driveTimeToSafetySeconds ?? null;
  const score = scoreBailoutCandidate({
    distanceFromRouteMeters,
    driveTimeToSafetySeconds,
    routeMileMarker,
    category,
    reachableByVehicle: args.input.reachableByVehicle ?? null,
    confidence: candidateConfidence,
    providerScore: args.input.score,
  });
  const providerPlaceId = args.input.providerPlaceId ?? args.input.id ?? null;
  return {
    id: String(args.input.id ?? providerPlaceId ?? `${source}:${coordinate.lat.toFixed(5)},${coordinate.lng.toFixed(5)}`),
    label: String(args.input.label ?? args.input.name ?? 'Bailout option'),
    lat: coordinate.lat,
    lng: coordinate.lng,
    source,
    category,
    routeMileMarker,
    distanceFromRouteMeters: distanceFromRouteMeters == null ? null : Math.round(distanceFromRouteMeters),
    distanceFromTrailheadMeters: distanceFromTrailheadMeters == null ? null : Math.round(distanceFromTrailheadMeters),
    driveTimeToSafetySeconds,
    reachableByVehicle: args.input.reachableByVehicle ?? null,
    score,
    confidence: candidateConfidence,
    warnings: candidateWarnings({
      category,
      reachableByVehicle: args.input.reachableByVehicle ?? null,
      driveTimeToSafetySeconds,
      source,
    }),
    providerMetadata: {
      providerId: args.providerId ?? null,
      providerPlaceId: providerPlaceId == null ? null : String(providerPlaceId),
      providerMetadata: args.input.providerMetadata ?? null,
    },
  };
}

function dedupeBailoutCandidates(candidates: BailoutCandidate[]): BailoutCandidate[] {
  const seen = new Set<string>();
  const unique: BailoutCandidate[] = [];
  candidates.forEach((candidate) => {
    const key = candidate.providerMetadata?.providerPlaceId
      ? `provider:${candidate.providerMetadata.providerPlaceId}`
      : `${candidate.category ?? 'unknown'}:${candidate.label}:${candidate.lat.toFixed(5)},${candidate.lng.toFixed(5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(candidate);
  });
  return unique;
}

function providerResultFromPlace(place: PlaceCandidate, providerId: string): BailoutCandidateProviderResult | null {
  const coordinate = normalizeRouteGeometryCoordinate(place.coordinate);
  if (!coordinate) return null;
  const metadata = place.providerMetadata ?? null;
  return {
    id: place.id,
    providerPlaceId: place.providerPlaceId ?? place.id,
    label: place.name,
    category: place.category,
    coordinate,
    source: providerId,
    reachableByVehicle: typeof metadata?.reachableByVehicle === 'boolean' ? metadata.reachableByVehicle : null,
    confidence: place.confidence ?? null,
    score: place.score ?? null,
    providerMetadata: {
      providerId,
      providerPlaceId: place.providerPlaceId ?? null,
      businessStatus: place.businessStatus ?? null,
      sourceCategory: place.category,
      placeProviderMetadata: metadata,
    },
  };
}

export async function findBailoutCandidates(input: BailoutCandidateServiceInput): Promise<BailoutCandidateServiceResult> {
  const warnings: RouteContextWarning[] = [];
  const routeCoordinates = normalizeRouteGeometryCoordinates(input.routeGeometry?.coordinates ?? input.trailGeometry ?? []);
  if (routeCoordinates.length < 2) {
    warnings.push(warning('missing_route_geometry', 'Route geometry is unavailable; bailout candidate search was skipped.', 'info'));
    return { candidates: [], warnings };
  }

  let rawCandidates = (input.candidates ?? [])
    .concat((input.existingPoiData ?? []) as BailoutCandidateProviderResult[]);
  if (input.provider) {
    if (!input.provider.isAvailable()) {
      warnings.push(warning('provider_unavailable', 'Bailout candidate provider is unavailable.', 'info', input.provider.id));
      return { candidates: [], warnings };
    }
    try {
      rawCandidates = rawCandidates.concat(await input.provider.searchBailoutCandidates({
        routeGeometry: input.routeGeometry,
        trailGeometry: routeCoordinates,
        trailheadAnchor: input.trailheadAnchor,
        corridor: input.corridor ?? input.routeGeometry?.corridor ?? null,
        existingPoiData: input.existingPoiData ?? null,
        limit: input.limit ?? ROUTE_CONTEXT_BAILOUT_CANDIDATE_LIMIT,
        providerMetadata: input.providerMetadata ?? null,
      }));
    } catch {
      warnings.push(warning('provider_unavailable', 'Bailout candidate provider was unavailable.', 'watch', input.provider.id));
      return { candidates: [], warnings };
    }
  }

  if (rawCandidates.length === 0) {
    warnings.push(warning('no_bailout_candidates_found', 'No bailout candidates were available for this route context.', 'info'));
    return { candidates: [], warnings };
  }

  const coordinateCandidates = rawCandidates
    .map((candidate) => ({ candidate, coordinate: candidateCoordinate(candidate) }))
    .filter((item): item is { candidate: BailoutCandidateProviderResult; coordinate: RouteContextCoordinate } => item.coordinate != null);
  const ids = coordinateCandidates.map((item, index) => ({
    id: String(item.candidate.id ?? item.candidate.providerPlaceId ?? `candidate-${index}`),
    coordinate: item.coordinate,
  }));
  const driveTimes = await routeMatrixDriveTimes({
    routingAdapter: input.routingAdapter,
    candidates: ids,
    destination: input.trailheadAnchor,
  });

  const corridorMeters = input.corridor?.widthMeters ?? input.routeGeometry?.corridor?.widthMeters ?? ROUTE_CONTEXT_BAILOUT_CANDIDATE_CORRIDOR_METERS;
  const limit = input.limit ?? ROUTE_CONTEXT_BAILOUT_CANDIDATE_LIMIT;
  const normalized = dedupeBailoutCandidates(
    coordinateCandidates
      .map((item, index) => {
        const id = ids[index]?.id;
        return normalizeBailoutCandidate({
          input: item.candidate,
          routeCoordinates,
          trailheadAnchor: input.trailheadAnchor,
          providerId: input.provider?.id ?? null,
          driveTimeToSafetySeconds: id ? driveTimes.get(id) ?? null : null,
        });
      })
      .filter((candidate): candidate is BailoutCandidate => candidate != null)
      .filter((candidate) => (
        candidate.distanceFromRouteMeters == null ||
        candidate.distanceFromRouteMeters <= Math.max(corridorMeters * 3, corridorMeters + 15_000)
      )),
  )
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || right.confidence.value - left.confidence.value)
    .slice(0, limit);

  if (normalized.length === 0) {
    warnings.push(warning('no_bailout_candidates_found', 'No bailout candidates were close enough to the route corridor.', 'info'));
  }

  return { candidates: normalized, warnings };
}

export function createBailoutProviderFromAdapter(
  adapter: BailoutCandidateProviderAdapter,
  routingAdapter?: RoutingProviderAdapter | null,
): RouteContextBailoutProvider | null {
  if (!adapter.isAvailable()) return null;
  return {
    id: adapter.id,
    async findBailoutCandidates(request: BailoutCandidateRequest): Promise<BailoutCandidate[]> {
      const result = await findBailoutCandidates({
        provider: adapter,
        routingAdapter,
        routeGeometry: request.routeGeometry,
        trailGeometry: request.trailGeometry ?? null,
        trailheadAnchor: request.trailheadAnchor,
        corridor: request.routeGeometry?.corridor ?? null,
        existingPoiData: request.existingPoiData ?? null,
      });
      return result.candidates;
    },
  };
}

export function createBailoutProviderFromPlacesAdapter(
  adapter: PlacesProviderAdapter,
  routingAdapter?: RoutingProviderAdapter | null,
): RouteContextBailoutProvider | null {
  if (!adapter.isAvailable()) return null;
  const bailoutAdapter: BailoutCandidateProviderAdapter = {
    id: adapter.id,
    isAvailable: () => adapter.isAvailable(),
    async searchBailoutCandidates(input) {
      const limit = input.limit ?? ROUTE_CONTEXT_BAILOUT_CANDIDATE_LIMIT;
      const categories = ['bailout', 'trailhead', 'gas', 'repair', 'medical', 'poi'] as const;
      const nearby = await adapter.searchNearby({
        center: input.trailheadAnchor,
        categories: [...categories],
        bbox: input.routeGeometry?.bbox ?? undefined,
        radiusMeters: input.corridor?.widthMeters ? input.corridor.widthMeters * 3 : 36_000,
        limit,
        providerMetadata: input.providerMetadata ?? null,
      });
      const normalized = nearby
        .map((place) => providerResultFromPlace(place, adapter.id))
        .filter((candidate): candidate is BailoutCandidateProviderResult => candidate != null);
      if (normalized.length > 0) return normalized;
      const text = await adapter.searchText({
        center: input.trailheadAnchor,
        categories: [...categories],
        query: 'road access town fuel ranger visitor center',
        bbox: input.routeGeometry?.bbox ?? undefined,
        limit,
        providerMetadata: input.providerMetadata ?? null,
      });
      return text
        .map((place) => providerResultFromPlace(place, adapter.id))
        .filter((candidate): candidate is BailoutCandidateProviderResult => candidate != null);
    },
  };
  return createBailoutProviderFromAdapter(bailoutAdapter, routingAdapter);
}

export function createNoopBailoutCandidateProviderAdapter(id = 'noop-bailout-candidate-provider'): BailoutCandidateProviderAdapter {
  return {
    id,
    isAvailable: () => false,
    async searchBailoutCandidates(): Promise<BailoutCandidateProviderResult[]> {
      return [];
    },
  };
}
