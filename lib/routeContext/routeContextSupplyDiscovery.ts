import {
  ROUTE_CONTEXT_RESUPPLY_REFUEL_PROXIMITY_TIERS_METERS,
  ROUTE_CONTEXT_RESUPPLY_REFUEL_SEARCH_RADIUS_TIERS_METERS,
  ROUTE_CONTEXT_RESUPPLY_RURAL_FALLBACK_RADIUS_TIERS_METERS,
  ROUTE_CONTEXT_SUPPLY_MAX_CANDIDATES_PER_CATEGORY,
  ROUTE_CONTEXT_SUPPLY_SEARCH_LIMIT_PER_TIER,
  ROUTE_CONTEXT_SUPPLY_SEARCH_RADIUS_TIERS_METERS,
} from './routeContextConfig';
import {
  expandBoundingBoxByMeters,
  haversineDistanceMeters,
  normalizeRouteGeometryCoordinate,
} from './routeContextGeometry';
import type {
  RouteMatrixCell,
  RoutingProviderAdapter,
  PlaceCandidate,
  PlacesProviderAdapter,
} from './routeContextAdapters';
import type { SupplyCandidateRequest } from './routeContextProviders';
import type {
  Confidence,
  RouteContextCoordinate,
  RouteContextProviderMetadata,
  RouteContextWarning,
  SupplyCandidate,
  SupplyCandidateCategory,
  SupplyMode,
} from './routeContextTypes';
import { clampConfidence } from './routeContextTypes';

export type SupplyDiscoverySearchTerm = {
  category: SupplyCandidateCategory;
  query: string;
};

export type SupplyDiscoveryInput = {
  placesAdapter: PlacesProviderAdapter;
  routingAdapter?: RoutingProviderAdapter | null;
  request: SupplyCandidateRequest;
  searchTerms?: SupplyDiscoverySearchTerm[] | null;
  radiusTiersMeters?: readonly number[] | null;
  limitPerTier?: number | null;
  maxCandidatesPerCategory?: number | null;
};

type CandidateRouteMetrics = {
  driveDistanceToTrailheadMeters: number | null;
  driveDurationToTrailheadSeconds: number | null;
  driveDistanceToSupplyChainAnchorMeters: number | null;
  driveDurationToSupplyChainAnchorSeconds: number | null;
  detourDistanceMeters: number | null;
  detourDurationSeconds: number | null;
};

type CandidateScoreComponents = {
  approachScore: number;
  trailheadProximityScore: number;
  refuelAdjacencyScore: number | null;
  supplyChainScore: number | null;
  score: number;
};

type SupplyChainAnchor = {
  coordinate: RouteContextCoordinate;
  candidateId?: string | null;
  candidate?: SupplyCandidate | null;
  role: 'trailhead' | 'refuel';
};

const CATEGORY_MATCH_EXACT = 1;
const CATEGORY_MATCH_FALLBACK = 0.56;
const EXCESSIVE_REFUEL_DETOUR_DISTANCE_METERS = 30_000;
const EXCESSIVE_REFUEL_DETOUR_DURATION_SECONDS = 45 * 60;
const REFUEL_FAR_FROM_TRAILHEAD_METERS = 50_000;

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

function categoriesForMode(mode: SupplyMode): SupplyCandidateCategory[] {
  if (mode === 'gas') return ['gas'];
  if (mode === 'grocery') return ['grocery'];
  if (mode === 'gas_and_grocery') return ['gas', 'grocery'];
  return [];
}

function defaultSearchTerms(mode: SupplyMode): SupplyDiscoverySearchTerm[] {
  return categoriesForMode(mode).map((category) => ({
    category,
    query: category === 'gas' ? 'fuel stop' : 'grocery market',
  }));
}

function candidateCoordinate(place: PlaceCandidate): RouteContextCoordinate | null {
  return normalizeRouteGeometryCoordinate(place.coordinate);
}

function placeCategoryMatchQuality(place: PlaceCandidate, category: SupplyCandidateCategory): number {
  const metadataQuality = finitePositiveNumber(place.providerMetadata?.categoryMatchQuality);
  const directQuality = finitePositiveNumber((place as PlaceCandidate & { categoryMatchQuality?: number | null }).categoryMatchQuality);
  if (directQuality != null) return clampConfidence(directQuality);
  if (metadataQuality != null) return clampConfidence(metadataQuality);
  return place.category === category ? CATEGORY_MATCH_EXACT : CATEGORY_MATCH_FALLBACK;
}

function providerConfidence(place: PlaceCandidate): Confidence {
  const value = finitePositiveNumber(place.confidence);
  if (value != null) return confidence(value, ['Provider supplied normalized place confidence.']);
  return confidence(0.62, ['ECS normalized place provider output.']);
}

function providerMetadata(
  providerId: string,
  place: PlaceCandidate,
  category: SupplyCandidateCategory,
  radiusMeters: number,
  categoryMatchQuality: number,
  supplyChainAnchor?: SupplyChainAnchor | null,
): RouteContextProviderMetadata {
  const placeProviderMetadata = (place.providerMetadata?.providerMetadata as RouteContextProviderMetadata | undefined)
    ?? place.providerMetadata
    ?? null;
  return {
    providerId,
    providerPlaceId: place.providerPlaceId ?? null,
    businessStatus: place.businessStatus ?? null,
    sourceCategory: place.category,
    categoryMatchQuality,
    searchCategory: category,
    searchRadiusMeters: radiusMeters,
    ...(supplyChainAnchor
      ? {
          supplyChain: {
            enabled: true,
            anchorRole: supplyChainAnchor.role,
            anchorCandidateId: supplyChainAnchor.candidateId ?? null,
            anchorCoordinate: supplyChainAnchor.coordinate,
            anchorName: supplyChainAnchor.candidate?.name ?? supplyChainAnchor.coordinate.label ?? null,
            anchorAddress: supplyChainAnchor.candidate?.address ?? null,
          },
        }
      : {}),
    placeProviderMetadata,
  };
}

function ratingScore(rating?: number | null): number {
  if (rating == null || !Number.isFinite(rating)) return 0.66;
  return clampConfidence(rating / 5);
}

function distanceScore(distanceMeters?: number | null): number {
  if (distanceMeters == null) return 0.45;
  if (distanceMeters <= 1_500) return 1;
  if (distanceMeters <= 5_000) return 0.9;
  if (distanceMeters <= 15_000) return 0.74;
  if (distanceMeters <= 35_000) return 0.52;
  if (distanceMeters <= 60_000) return 0.32;
  return 0.18;
}

function driveToTrailheadScore(distanceMeters?: number | null, durationSeconds?: number | null): number {
  const distance = distanceScore(distanceMeters);
  if (durationSeconds == null) return distance;
  if (durationSeconds <= 8 * 60) return Math.max(distance, 0.95);
  if (durationSeconds <= 20 * 60) return Math.max(distance, 0.78);
  if (durationSeconds <= 45 * 60) return Math.min(distance, 0.55);
  return Math.min(distance, 0.25);
}

function detourScore(distanceMeters?: number | null, durationSeconds?: number | null): number {
  if (distanceMeters == null && durationSeconds == null) return 0.62;
  const distance = distanceMeters ?? 0;
  const duration = durationSeconds ?? 0;
  if (distance <= 1_000 && duration <= 5 * 60) return 1;
  if (distance <= 5_000 && duration <= 12 * 60) return 0.86;
  if (distance <= 15_000 && duration <= 25 * 60) return 0.58;
  if (distance <= 30_000 && duration <= 45 * 60) return 0.32;
  return 0.12;
}

function approachScore(originAvailable: boolean, metrics: CandidateRouteMetrics): number {
  if (!originAvailable) return 0.72;
  if (metrics.detourDistanceMeters == null && metrics.detourDurationSeconds == null) return 0.5;
  return detourScore(metrics.detourDistanceMeters, metrics.detourDurationSeconds);
}

function trailheadProximityScore(
  distanceToTrailheadMeters: number | null,
  metrics: CandidateRouteMetrics,
): number {
  return driveToTrailheadScore(
    metrics.driveDistanceToTrailheadMeters ?? distanceToTrailheadMeters,
    metrics.driveDurationToTrailheadSeconds,
  );
}

function normalizedText(value?: string | null): string | null {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  return text.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function sameCommercialArea(
  place: PlaceCandidate,
  anchor?: SupplyCandidate | null,
  distanceToRefuelMeters?: number | null,
): boolean {
  if (!anchor || distanceToRefuelMeters == null || distanceToRefuelMeters > ROUTE_CONTEXT_RESUPPLY_REFUEL_PROXIMITY_TIERS_METERS.strong) {
    return false;
  }
  if (distanceToRefuelMeters <= 75) return true;
  const placeAddress = normalizedText(place.address);
  const anchorAddress = normalizedText(anchor.address);
  return placeAddress != null && anchorAddress != null && placeAddress === anchorAddress;
}

function refuelAdjacencyScore(args: {
  place: PlaceCandidate;
  supplyChainAnchor?: SupplyChainAnchor | null;
  distanceToRefuelMeters?: number | null;
  metrics: CandidateRouteMetrics;
}): number | null {
  if (args.supplyChainAnchor?.role !== 'refuel') return null;
  const driveDistance = args.metrics.driveDistanceToSupplyChainAnchorMeters;
  const distance = driveDistance ?? args.distanceToRefuelMeters;
  if (sameCommercialArea(args.place, args.supplyChainAnchor.candidate, args.distanceToRefuelMeters)) {
    return 1;
  }
  if (distance == null) return 0.42;
  if (distance <= ROUTE_CONTEXT_RESUPPLY_REFUEL_PROXIMITY_TIERS_METERS.excellent) return 1;
  if (distance <= ROUTE_CONTEXT_RESUPPLY_REFUEL_PROXIMITY_TIERS_METERS.strong) return 0.92;
  if (distance <= ROUTE_CONTEXT_RESUPPLY_REFUEL_PROXIMITY_TIERS_METERS.acceptable) return 0.72;
  if (distance <= ROUTE_CONTEXT_RESUPPLY_REFUEL_PROXIMITY_TIERS_METERS.excessive) return 0.35;
  return 0.12;
}

function openStatusScore(status: SupplyCandidate['openStatus']): number {
  if (status === 'open') return 1;
  if (status === 'closed') return 0.05;
  if (status === 'temporarily_closed') return 0.18;
  return 0.72;
}

function buildCandidateWarnings(
  place: PlaceCandidate,
  category: SupplyCandidateCategory,
  categoryMatchQuality: number,
  metrics: CandidateRouteMetrics,
  distanceToTrailheadMeters: number | null,
  distanceToRefuelMeters: number | null,
  supplyChainAnchor?: SupplyChainAnchor | null,
): RouteContextWarning[] {
  const warnings: RouteContextWarning[] = [];
  if (place.openStatus === 'closed' || place.openStatus === 'temporarily_closed') {
    warnings.push(warning('closed_supply_candidate', 'Supply candidate appears unavailable or closed.', 'watch'));
  }
  if (categoryMatchQuality < 0.62) {
    warnings.push(warning('poor_category_match', 'Supply candidate category match is weak; keep it as a fallback.', 'info'));
  }
  if ((metrics.detourDistanceMeters ?? 0) > 30_000 || (metrics.detourDurationSeconds ?? 0) > 45 * 60) {
    warnings.push(warning('excessive_detour', 'Supply candidate may require a large approach detour.', 'watch'));
  }
  if (category === 'gas') {
    const refuelDistance = metrics.driveDistanceToTrailheadMeters ?? distanceToTrailheadMeters;
    if (metrics.driveDistanceToTrailheadMeters == null) {
      warnings.push(warning(
        'refuel_drive_distance_unavailable',
        'Drive distance from refuel candidate to trailhead is unavailable; ECS used proximity fallback.',
        'info',
      ));
    }
    if ((metrics.detourDistanceMeters ?? 0) > EXCESSIVE_REFUEL_DETOUR_DISTANCE_METERS ||
        (metrics.detourDurationSeconds ?? 0) > EXCESSIVE_REFUEL_DETOUR_DURATION_SECONDS) {
      warnings.push(warning('excessive_refuel_detour', 'Refuel candidate may require excessive approach backtracking.', 'watch'));
    }
    if (refuelDistance != null && refuelDistance > REFUEL_FAR_FROM_TRAILHEAD_METERS) {
      warnings.push(warning('refuel_far_from_trailhead', 'Refuel candidate is far from the selected trailhead.', 'info'));
    }
  }
  if (category === 'grocery' && supplyChainAnchor?.role === 'refuel') {
    const resupplyDistance = metrics.driveDistanceToSupplyChainAnchorMeters ?? distanceToRefuelMeters;
    if (metrics.driveDistanceToSupplyChainAnchorMeters == null) {
      warnings.push(warning(
        'resupply_drive_distance_unavailable',
        'Drive distance from refuel stop to resupply candidate is unavailable; ECS used proximity fallback.',
        'info',
      ));
    }
    if (resupplyDistance != null && resupplyDistance > ROUTE_CONTEXT_RESUPPLY_REFUEL_PROXIMITY_TIERS_METERS.acceptable) {
      warnings.push(warning('resupply_far_from_refuel', 'Resupply candidate is not close to the selected refuel stop.', 'watch'));
    }
  }
  return warnings;
}

function scoreSupplyCandidate(args: {
  category: SupplyCandidateCategory;
  distanceToTrailheadMeters: number | null;
  distanceToSupplyChainAnchorMeters?: number | null;
  metrics: CandidateRouteMetrics;
  openStatus: SupplyCandidate['openStatus'];
  categoryMatchQuality: number;
  rating?: number | null;
  confidence: Confidence;
  originAvailable: boolean;
  place: PlaceCandidate;
  supplyChainAnchor?: SupplyChainAnchor | null;
}): CandidateScoreComponents {
  const open = openStatusScore(args.openStatus);
  const category = clampConfidence(args.categoryMatchQuality);
  const rating = ratingScore(args.rating);
  const provider = args.confidence.value;
  const approach = approachScore(args.originAvailable, args.metrics);
  const trailheadProximity = trailheadProximityScore(args.distanceToTrailheadMeters, args.metrics);
  const adjacency = refuelAdjacencyScore({
    place: args.place,
    supplyChainAnchor: args.supplyChainAnchor,
    distanceToRefuelMeters: args.distanceToSupplyChainAnchorMeters ?? null,
    metrics: args.metrics,
  });

  if (args.category === 'gas') {
    return {
      approachScore: approach,
      trailheadProximityScore: trailheadProximity,
      refuelAdjacencyScore: null,
      supplyChainScore: null,
      score: clampConfidence(
        trailheadProximity * (args.originAvailable ? 0.42 : 0.58) +
          approach * (args.originAvailable ? 0.24 : 0) +
          open * (args.originAvailable ? 0.14 : 0.15) +
          category * (args.originAvailable ? 0.09 : 0.11) +
          provider * (args.originAvailable ? 0.07 : 0.11) +
          rating * (args.originAvailable ? 0.04 : 0.05),
      ),
    };
  }

  if (args.supplyChainAnchor?.role === 'refuel') {
    const supplyChainScore = clampConfidence(
      (adjacency ?? 0.42) * 0.46 +
        detourScore(args.metrics.detourDistanceMeters, args.metrics.detourDurationSeconds) * 0.18 +
        trailheadProximity * 0.1 +
        category * 0.11 +
        open * 0.08 +
        provider * 0.05 +
        rating * 0.02,
    );
    return {
      approachScore: approach,
      trailheadProximityScore: trailheadProximity,
      refuelAdjacencyScore: adjacency,
      supplyChainScore,
      score: supplyChainScore,
    };
  }

  if (args.distanceToSupplyChainAnchorMeters != null) {
    return {
      approachScore: approach,
      trailheadProximityScore: trailheadProximity,
      refuelAdjacencyScore: null,
      supplyChainScore: null,
      score: clampConfidence(
        distanceScore(args.distanceToSupplyChainAnchorMeters) * 0.34 +
          detourScore(args.metrics.detourDistanceMeters, args.metrics.detourDurationSeconds) * 0.24 +
          trailheadProximity * 0.12 +
          distanceScore(args.distanceToTrailheadMeters) * 0.08 +
          open * 0.1 +
          category * 0.06 +
          rating * 0.03 +
          provider * 0.03,
      ),
    };
  }
  if (args.originAvailable) {
    return {
      approachScore: approach,
      trailheadProximityScore: trailheadProximity,
      refuelAdjacencyScore: null,
      supplyChainScore: null,
      score: clampConfidence(
        approach * 0.35 +
          distanceScore(args.distanceToTrailheadMeters) * 0.2 +
          trailheadProximity * 0.15 +
          open * 0.12 +
          category * 0.1 +
          rating * 0.04 +
          provider * 0.04,
      ),
    };
  }
  return {
    approachScore: approach,
    trailheadProximityScore: trailheadProximity,
    refuelAdjacencyScore: null,
    supplyChainScore: null,
    score: clampConfidence(
      distanceScore(args.distanceToTrailheadMeters) * 0.45 +
        open * 0.18 +
        category * 0.17 +
        rating * 0.08 +
        provider * 0.12,
    ),
  };
}

function placeToCandidate(args: {
  place: PlaceCandidate;
  category: SupplyCandidateCategory;
  request: SupplyCandidateRequest;
  providerId: string;
  radiusMeters: number;
  metrics?: CandidateRouteMetrics | null;
  supplyChainAnchor?: SupplyChainAnchor | null;
}): SupplyCandidate | null {
  const coordinate = candidateCoordinate(args.place);
  if (!coordinate) return null;
  const distanceToTrailheadMeters = haversineDistanceMeters(args.request.trailheadAnchor, coordinate);
  const distanceToSupplyChainAnchorMeters = args.supplyChainAnchor
    ? haversineDistanceMeters(args.supplyChainAnchor.coordinate, coordinate)
    : null;
  const metrics = args.metrics ?? {
    driveDistanceToTrailheadMeters: null,
    driveDurationToTrailheadSeconds: null,
    driveDistanceToSupplyChainAnchorMeters: null,
    driveDurationToSupplyChainAnchorSeconds: null,
    detourDistanceMeters: null,
    detourDurationSeconds: null,
  };
  const distanceToRefuelMeters = args.supplyChainAnchor?.role === 'refuel'
    ? distanceToSupplyChainAnchorMeters
    : null;
  const categoryMatchQuality = placeCategoryMatchQuality(args.place, args.category);
  const candidateConfidence = providerConfidence(args.place);
  const scoreComponents = scoreSupplyCandidate({
    category: args.category,
    distanceToTrailheadMeters,
    distanceToSupplyChainAnchorMeters,
    metrics,
    openStatus: args.place.openStatus ?? null,
    categoryMatchQuality,
    rating: args.place.rating ?? null,
    confidence: candidateConfidence,
    originAvailable: args.request.origin != null,
    place: args.place,
    supplyChainAnchor: args.supplyChainAnchor ?? null,
  });
  return {
    id: args.place.id,
    providerPlaceId: args.place.providerPlaceId ?? null,
    category: args.category,
    name: args.place.name,
    lat: coordinate.lat,
    lng: coordinate.lng,
    address: args.place.address ?? null,
    distanceToTrailheadMeters: distanceToTrailheadMeters == null ? null : Math.round(distanceToTrailheadMeters),
    distanceToSupplyChainAnchorMeters: distanceToSupplyChainAnchorMeters == null ? null : Math.round(distanceToSupplyChainAnchorMeters),
    distanceToRefuelMeters: distanceToRefuelMeters == null ? null : Math.round(distanceToRefuelMeters),
    driveDistanceToTrailheadMeters: metrics.driveDistanceToTrailheadMeters,
    driveDurationToTrailheadSeconds: metrics.driveDurationToTrailheadSeconds,
    driveDistanceToRefuelMeters: args.supplyChainAnchor?.role === 'refuel' ? metrics.driveDistanceToSupplyChainAnchorMeters : null,
    driveDurationToRefuelSeconds: args.supplyChainAnchor?.role === 'refuel' ? metrics.driveDurationToSupplyChainAnchorSeconds : null,
    detourDistanceMeters: metrics.detourDistanceMeters,
    detourDurationSeconds: metrics.detourDurationSeconds,
    approachScore: scoreComponents.approachScore,
    trailheadProximityScore: scoreComponents.trailheadProximityScore,
    refuelAdjacencyScore: scoreComponents.refuelAdjacencyScore,
    supplyChainScore: scoreComponents.supplyChainScore,
    openStatus: args.place.openStatus ?? null,
    rating: args.place.rating ?? null,
    confidence: candidateConfidence,
    score: scoreComponents.score,
    warnings: buildCandidateWarnings(
      args.place,
      args.category,
      categoryMatchQuality,
      metrics,
      distanceToTrailheadMeters,
      distanceToRefuelMeters,
      args.supplyChainAnchor ?? null,
    ),
    providerMetadata: providerMetadata(
      args.providerId,
      args.place,
      args.category,
      args.radiusMeters,
      categoryMatchQuality,
      args.supplyChainAnchor,
    ),
  };
}

function uniquePlaces(places: Array<{ place: PlaceCandidate; category: SupplyCandidateCategory; radiusMeters: number }>) {
  const seen = new Set<string>();
  const unique: Array<{ place: PlaceCandidate; category: SupplyCandidateCategory; radiusMeters: number }> = [];
  places.forEach((item) => {
    const coordinate = candidateCoordinate(item.place);
    if (!coordinate) return;
    const key = item.place.providerPlaceId
      ? `${item.category}:provider:${item.place.providerPlaceId}`
      : `${item.category}:${item.place.name}:${coordinate.lat.toFixed(5)},${coordinate.lng.toFixed(5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(item);
  });
  return unique;
}

function routeMatrixCell(
  cells: RouteMatrixCell[],
  originIndex: number,
  destinationIndex: number,
): RouteMatrixCell | null {
  return cells.find((cell) => cell.originIndex === originIndex && cell.destinationIndex === destinationIndex) ?? null;
}

async function routeMetricsForCandidates(
  routingAdapter: RoutingProviderAdapter | null | undefined,
  origin: RouteContextCoordinate | null | undefined,
  trailhead: RouteContextCoordinate,
  candidates: SupplyCandidate[],
): Promise<Map<string, CandidateRouteMetrics>> {
  const empty = new Map<string, CandidateRouteMetrics>();
  if (!routingAdapter?.isAvailable() || candidates.length === 0) return empty;

  try {
    if (!origin) {
      const result = await routingAdapter.computeRouteMatrix({
        origins: candidates.map((candidate) => ({ lat: candidate.lat, lng: candidate.lng })),
        destinations: [trailhead],
        mode: 'driving',
        providerMetadata: { source: 'route_context_supply_discovery' },
      });
      candidates.forEach((candidate, index) => {
        const candidateToTrailhead = routeMatrixCell(result.cells, index, 0);
        const driveDistanceToTrailheadMeters = finitePositiveNumber(candidateToTrailhead?.distanceMeters);
        const driveDurationToTrailheadSeconds = finitePositiveNumber(candidateToTrailhead?.durationSeconds);
        empty.set(candidate.id, {
          driveDistanceToTrailheadMeters: driveDistanceToTrailheadMeters == null ? null : Math.round(driveDistanceToTrailheadMeters),
          driveDurationToTrailheadSeconds: driveDurationToTrailheadSeconds == null ? null : Math.round(driveDurationToTrailheadSeconds),
          driveDistanceToSupplyChainAnchorMeters: null,
          driveDurationToSupplyChainAnchorSeconds: null,
          detourDistanceMeters: null,
          detourDurationSeconds: null,
        });
      });
      return empty;
    }

    const destinations: RouteContextCoordinate[] = [
      ...candidates.map((candidate) => ({ lat: candidate.lat, lng: candidate.lng })),
      trailhead,
    ];
    const origins: RouteContextCoordinate[] = [
      origin,
      ...candidates.map((candidate) => ({ lat: candidate.lat, lng: candidate.lng })),
    ];
    const result = await routingAdapter.computeRouteMatrix({
      origins,
      destinations,
      mode: 'driving',
      providerMetadata: { source: 'route_context_supply_discovery' },
    });
    const trailheadDestinationIndex = destinations.length - 1;
    const direct = routeMatrixCell(result.cells, 0, trailheadDestinationIndex);
    candidates.forEach((candidate, index) => {
      const originToCandidate = routeMatrixCell(result.cells, 0, index);
      const candidateToTrailhead = routeMatrixCell(result.cells, index + 1, trailheadDestinationIndex);
      const driveDistanceToTrailheadMeters = finitePositiveNumber(candidateToTrailhead?.distanceMeters);
      const driveDurationToTrailheadSeconds = finitePositiveNumber(candidateToTrailhead?.durationSeconds);
      const approachDistance = finitePositiveNumber(originToCandidate?.distanceMeters);
      const approachDuration = finitePositiveNumber(originToCandidate?.durationSeconds);
      const directDistance = finitePositiveNumber(direct?.distanceMeters);
      const directDuration = finitePositiveNumber(direct?.durationSeconds);
      const detourDistanceMeters = approachDistance != null && driveDistanceToTrailheadMeters != null && directDistance != null
        ? Math.max(0, Math.round(approachDistance + driveDistanceToTrailheadMeters - directDistance))
        : null;
      const detourDurationSeconds = approachDuration != null && driveDurationToTrailheadSeconds != null && directDuration != null
        ? Math.max(0, Math.round(approachDuration + driveDurationToTrailheadSeconds - directDuration))
        : null;
      empty.set(candidate.id, {
        driveDistanceToTrailheadMeters: driveDistanceToTrailheadMeters == null ? null : Math.round(driveDistanceToTrailheadMeters),
        driveDurationToTrailheadSeconds: driveDurationToTrailheadSeconds == null ? null : Math.round(driveDurationToTrailheadSeconds),
        driveDistanceToSupplyChainAnchorMeters: approachDistance == null ? null : Math.round(approachDistance),
        driveDurationToSupplyChainAnchorSeconds: approachDuration == null ? null : Math.round(approachDuration),
        detourDistanceMeters,
        detourDurationSeconds,
      });
    });
  } catch {
    return empty;
  }
  return empty;
}

function sortAndLimitCandidates(
  candidates: SupplyCandidate[],
  maxPerCategory: number,
  selectedIds: string[] = [],
): SupplyCandidate[] {
  return categoriesForMode('gas_and_grocery')
    .flatMap((category) => limitCategoryCandidates(
      candidates.filter((candidate) => candidate.category === category),
      maxPerCategory,
      selectedIds,
    ));
}

function selectedCandidateIdsForCategory(
  request: SupplyCandidateRequest,
  category: SupplyCandidateCategory,
): string[] {
  const direct = category === 'gas'
    ? request.selectedRefuelCandidateId
    : request.selectedResupplyCandidateId;
  return Array.from(new Set([
    direct,
    ...(request.selectedSupplyCandidateIds ?? []),
  ].map((id) => String(id ?? '').trim()).filter(Boolean)));
}

function preferredCandidate(
  candidates: SupplyCandidate[],
  selectedIds: string[] = [],
): SupplyCandidate | null {
  for (const selectedId of selectedIds) {
    const selected = candidates.find((candidate) => candidate.id === selectedId || candidate.providerPlaceId === selectedId);
    if (selected) return selected;
  }
  return candidates[0] ?? null;
}

function appendWarnings(
  candidate: SupplyCandidate,
  warnings: RouteContextWarning[],
  providerMetadata: RouteContextProviderMetadata = {},
): SupplyCandidate {
  const existing = new Set(candidate.warnings.map((item) => `${item.code}:${item.message}`));
  const mergedWarnings = [...candidate.warnings];
  warnings.forEach((item) => {
    const key = `${item.code}:${item.message}`;
    if (existing.has(key)) return;
    existing.add(key);
    mergedWarnings.push(item);
  });
  return {
    ...candidate,
    warnings: mergedWarnings,
    providerMetadata: {
      ...(candidate.providerMetadata ?? {}),
      ...providerMetadata,
    },
  };
}

function hasRefuelAdjacentResupply(candidates: SupplyCandidate[]): boolean {
  return candidates.some((candidate) => (
    candidate.category === 'grocery' &&
    (candidate.driveDistanceToRefuelMeters ?? candidate.distanceToRefuelMeters ?? Number.POSITIVE_INFINITY) <=
      ROUTE_CONTEXT_RESUPPLY_REFUEL_PROXIMITY_TIERS_METERS.acceptable
  ));
}

async function searchCategory(
  input: SupplyDiscoveryInput,
  category: SupplyCandidateCategory,
  query: string | null,
  options: {
    center?: RouteContextCoordinate | null;
    radiusTiersMeters?: readonly number[] | null;
    providerMetadata?: RouteContextProviderMetadata | null;
  } = {},
): Promise<Array<{ place: PlaceCandidate; category: SupplyCandidateCategory; radiusMeters: number }>> {
  const radiusTiers = options.radiusTiersMeters?.length
    ? [...options.radiusTiersMeters]
    : input.radiusTiersMeters?.length
      ? [...input.radiusTiersMeters]
    : [...ROUTE_CONTEXT_SUPPLY_SEARCH_RADIUS_TIERS_METERS];
  const limit = input.limitPerTier ?? ROUTE_CONTEXT_SUPPLY_SEARCH_LIMIT_PER_TIER;
  const found: Array<{ place: PlaceCandidate; category: SupplyCandidateCategory; radiusMeters: number }> = [];
  const center = options.center ?? input.request.trailheadAnchor;

  for (const radiusMeters of radiusTiers) {
    const bbox = expandBoundingBoxByMeters({
      west: center.lng,
      east: center.lng,
      south: center.lat,
      north: center.lat,
    }, radiusMeters);
    const nearby = await input.placesAdapter.searchNearby({
      center,
      origin: input.request.origin ?? null,
      categories: [category],
      radiusMeters,
      bbox,
      limit,
      providerMetadata: {
        ...(options.providerMetadata ?? {}),
        searchCategory: category,
        searchRadiusMeters: radiusMeters,
      },
    });
    const text = nearby.length > 0 || !query
      ? []
        : await input.placesAdapter.searchText({
          center,
          origin: input.request.origin ?? null,
          categories: [category],
          query,
          radiusMeters,
          bbox,
          limit,
          providerMetadata: {
            ...(options.providerMetadata ?? {}),
            searchCategory: category,
            searchRadiusMeters: radiusMeters,
            fallback: 'text',
          },
        });
    [...nearby, ...text].forEach((place) => {
      found.push({ place, category, radiusMeters });
    });
    if (found.length > 0) break;
  }

  return uniquePlaces(found);
}

async function discoverCandidatesForCategory(
  input: SupplyDiscoveryInput,
  category: SupplyCandidateCategory,
  query: string | null,
  options: {
    searchCenter?: RouteContextCoordinate | null;
    routeOrigin?: RouteContextCoordinate | null;
    radiusTiersMeters?: readonly number[] | null;
    supplyChainAnchor?: SupplyChainAnchor | null;
  } = {},
): Promise<SupplyCandidate[]> {
  const places = await searchCategory(input, category, query, {
    center: options.searchCenter,
    radiusTiersMeters: options.radiusTiersMeters,
    providerMetadata: options.supplyChainAnchor
      ? {
          supplyChain: {
            enabled: true,
            anchorRole: options.supplyChainAnchor.role,
            anchorCandidateId: options.supplyChainAnchor.candidateId ?? null,
            anchorCoordinate: options.supplyChainAnchor.coordinate,
          },
        }
      : null,
  });
  const initialCandidates = uniquePlaces(places)
    .map((item) => placeToCandidate({
      place: item.place,
      category: item.category,
      request: input.request,
      providerId: input.placesAdapter.id,
      radiusMeters: item.radiusMeters,
      supplyChainAnchor: options.supplyChainAnchor ?? null,
    }))
    .filter((candidate): candidate is SupplyCandidate => candidate != null);

  const routeMetrics = await routeMetricsForCandidates(
    input.routingAdapter,
    options.routeOrigin ?? input.request.origin,
    input.request.trailheadAnchor,
    initialCandidates,
  );
  return initialCandidates.map((candidate) => {
    const metrics = routeMetrics.get(candidate.id);
    if (!metrics) return candidate;
    const placeLike: PlaceCandidate = {
      id: candidate.id,
      providerPlaceId: candidate.providerPlaceId ?? null,
      category: candidate.category,
      name: candidate.name,
      coordinate: { lat: candidate.lat, lng: candidate.lng },
      address: candidate.address ?? null,
      openStatus: candidate.openStatus ?? null,
      rating: candidate.rating ?? null,
      confidence: candidate.confidence.value,
      providerMetadata: candidate.providerMetadata ?? null,
    };
    return placeToCandidate({
      place: placeLike,
      category: candidate.category,
      request: input.request,
      providerId: input.placesAdapter.id,
      radiusMeters: Number(candidate.providerMetadata?.searchRadiusMeters ?? 0),
      metrics,
      supplyChainAnchor: options.supplyChainAnchor ?? null,
    }) ?? candidate;
  });
}

function limitCategoryCandidates(
  candidates: SupplyCandidate[],
  maxPerCategory: number,
  selectedIds: string[] = [],
): SupplyCandidate[] {
  const selected = selectedIds
    .map((id) => candidates.find((candidate) => candidate.id === id || candidate.providerPlaceId === id))
    .filter((candidate): candidate is SupplyCandidate => candidate != null);
  const seen = new Set(selected.map((candidate) => candidate.id));
  const sorted = candidates
    .filter((candidate) => !seen.has(candidate.id))
    .sort((left, right) => right.score - left.score || right.confidence.value - left.confidence.value)
    .slice(0, Math.max(0, maxPerCategory - selected.length));
  return [...selected, ...sorted].slice(0, maxPerCategory);
}

async function discoverTrailheadAnchoredSupplyChain(
  input: SupplyDiscoveryInput,
  searchTerms: SupplyDiscoverySearchTerm[],
): Promise<SupplyCandidate[]> {
  const maxPerCategory = input.maxCandidatesPerCategory ?? ROUTE_CONTEXT_SUPPLY_MAX_CANDIDATES_PER_CATEGORY;
  const gasQuery = searchTerms.find((item) => item.category === 'gas')?.query ?? null;
  const groceryQuery = searchTerms.find((item) => item.category === 'grocery')?.query ?? null;
  const selectedRefuelIds = selectedCandidateIdsForCategory(input.request, 'gas');
  const selectedResupplyIds = selectedCandidateIdsForCategory(input.request, 'grocery');
  const gasCandidates = limitCategoryCandidates(
    await discoverCandidatesForCategory(input, 'gas', gasQuery, {
      searchCenter: input.request.trailheadAnchor,
      routeOrigin: input.request.origin ?? null,
      supplyChainAnchor: {
        role: 'trailhead',
        coordinate: input.request.trailheadAnchor,
      },
    }),
    maxPerCategory,
    selectedRefuelIds,
  );
  const selectedFuel = preferredCandidate(gasCandidates, selectedRefuelIds);
  if (!selectedFuel) return gasCandidates;

  const fuelCoordinate = { lat: selectedFuel.lat, lng: selectedFuel.lng, label: selectedFuel.name };
  const refuelAnchor: SupplyChainAnchor = {
    role: 'refuel',
    candidateId: selectedFuel.id,
    candidate: selectedFuel,
    coordinate: fuelCoordinate,
  };
  const refuelGroceryCandidates = limitCategoryCandidates(
    await discoverCandidatesForCategory(input, 'grocery', groceryQuery, {
      searchCenter: fuelCoordinate,
      routeOrigin: fuelCoordinate,
      radiusTiersMeters: ROUTE_CONTEXT_RESUPPLY_REFUEL_SEARCH_RADIUS_TIERS_METERS,
      supplyChainAnchor: refuelAnchor,
    }),
    maxPerCategory,
    selectedResupplyIds,
  );
  let groceryCandidates = refuelGroceryCandidates;

  if (groceryCandidates.length === 0) {
    groceryCandidates = limitCategoryCandidates(
      (await discoverCandidatesForCategory(input, 'grocery', groceryQuery, {
        searchCenter: fuelCoordinate,
        routeOrigin: fuelCoordinate,
        radiusTiersMeters: ROUTE_CONTEXT_RESUPPLY_RURAL_FALLBACK_RADIUS_TIERS_METERS,
        supplyChainAnchor: refuelAnchor,
      })).map((candidate) => appendWarnings(
        candidate,
        [
          warning('no_resupply_near_refuel', 'No grocery/resupply candidate was found near the selected refuel stop.', 'watch'),
          warning('rural_resupply_fallback_used', 'Resupply search expanded beyond the preferred refuel area for rural fallback coverage.', 'info'),
        ],
        { ruralResupplyFallback: true },
      )),
      maxPerCategory,
      selectedResupplyIds,
    );
  }

  if (groceryCandidates.length === 0) {
    groceryCandidates = limitCategoryCandidates(
      (await discoverCandidatesForCategory(input, 'grocery', groceryQuery, {
        searchCenter: input.request.trailheadAnchor,
        routeOrigin: fuelCoordinate,
        supplyChainAnchor: refuelAnchor,
      })).map((candidate) => appendWarnings(
        candidate,
        [
          warning('no_resupply_near_refuel', 'No grocery/resupply candidate was found near the selected refuel stop.', 'watch'),
          warning('rural_resupply_fallback_used', 'Resupply candidate was found near the trailhead after refuel-area search failed.', 'info'),
        ],
        { trailheadResupplyFallback: true },
      )),
      maxPerCategory,
      selectedResupplyIds,
    );
  }

  if (!hasRefuelAdjacentResupply(groceryCandidates)) {
    groceryCandidates = groceryCandidates.map((candidate) => appendWarnings(
      candidate,
      [warning('no_resupply_near_refuel', 'No grocery/resupply candidate is within the preferred refuel adjacency range.', 'watch')],
      { noAdjacentResupplyNearRefuel: true },
    ));
  }

  const selectedGrocery = preferredCandidate(groceryCandidates, selectedResupplyIds);
  if (selectedGrocery && groceryCandidates[0]?.id !== selectedGrocery.id) {
    groceryCandidates = [
      selectedGrocery,
      ...groceryCandidates.filter((candidate) => candidate.id !== selectedGrocery.id),
    ];
  }

  return sortAndLimitCandidates(
    [...gasCandidates, ...groceryCandidates],
    maxPerCategory,
    [...selectedRefuelIds, ...selectedResupplyIds],
  );
}

export async function discoverSupplyCandidates(input: SupplyDiscoveryInput): Promise<SupplyCandidate[]> {
  if (!input.placesAdapter.isAvailable()) return [];
  const categories = categoriesForMode(input.request.mode);
  if (categories.length === 0) return [];
  const searchTerms = input.searchTerms ?? defaultSearchTerms(input.request.mode);

  if (input.request.trailheadAnchoredSupplyChain === true && input.request.mode === 'gas_and_grocery') {
    return discoverTrailheadAnchoredSupplyChain(input, searchTerms);
  }

  const enriched = (await Promise.all(categories.map((category) => {
    const term = searchTerms.find((item) => item.category === category)?.query ?? null;
    return discoverCandidatesForCategory(input, category, term);
  }))).flat();
  return sortAndLimitCandidates(
    enriched,
    input.maxCandidatesPerCategory ?? ROUTE_CONTEXT_SUPPLY_MAX_CANDIDATES_PER_CATEGORY,
    [
      ...selectedCandidateIdsForCategory(input.request, 'gas'),
      ...selectedCandidateIdsForCategory(input.request, 'grocery'),
    ],
  );
}
