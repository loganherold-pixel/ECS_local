import type {
  RouteMatrixCell,
  RouteMatrixResult,
  RoutingProviderAdapter,
  RouteGeometryResult,
} from './routeContextAdapters';
import {
  ROUTE_CONTEXT_SUPPLY_MAX_CANDIDATES_PER_CATEGORY,
  ROUTE_CONTEXT_SUPPLY_PLAN_SCORING_THRESHOLDS,
} from './routeContextConfig';
import {
  boundingBoxFromCoordinates,
  buildRouteGeometrySegments,
  createRouteCorridor,
  decodeEncodedPolyline,
  dedupeConsecutiveCoordinates,
  haversineDistanceMeters,
  normalizeRouteGeometryCoordinates,
  totalRouteDistanceMeters,
} from './routeContextGeometry';
import type {
  RouteContextCoordinate,
  RouteContextProviderMetadata,
  RouteContextWarning,
  RouteGeometry,
  RouteGeometrySegment,
  SupplyCandidate,
  SupplyCandidateCategory,
  SupplyMode,
  TrailheadAnchor,
} from './routeContextTypes';

export type SupplyAwareRouteGeometryInput = {
  trailId: string;
  origin?: RouteContextCoordinate | null;
  trailheadAnchor: TrailheadAnchor;
  selectedSupplyMode: SupplyMode;
  supplyCandidates: SupplyCandidate[];
  routingAdapter?: RoutingProviderAdapter | null;
  trailheadAnchoredSupplyChain?: boolean | null;
  selectedSupplyCandidateIds?: string[] | null;
  trailRouteCoordinates?: RouteContextCoordinate[] | null;
  trailEndpoint?: RouteContextCoordinate | null;
};

export type SupplyAwareRouteGeometryResult = {
  routeGeometry: RouteGeometry | null;
  selectedCandidateIds: string[];
  warnings: RouteContextWarning[];
  providerMetadata: RouteContextProviderMetadata;
};

type RouteStop = {
  id: string;
  category: SupplyCandidateCategory;
  coordinate: RouteContextCoordinate;
  candidate: SupplyCandidate;
};

type RouteVariant = {
  id: string;
  stops: RouteStop[];
  pointSequence: RouteContextCoordinate[];
  segmentIds: string[];
  distanceMeters: number | null;
  durationSeconds: number | null;
  detourDistanceMeters: number | null;
  detourDurationSeconds: number | null;
  segmentMetrics: Array<{ distanceMeters: number | null; durationSeconds: number | null }>;
  providerBacked: boolean;
  planMetrics: RouteVariantPlanMetrics;
  scoreDetails: RouteVariantScoreDetails | null;
};

type RouteMetricEstimate = {
  distanceMeters: number | null;
  durationSeconds: number | null;
  providerBacked: boolean;
};

type RouteVariantPlanMetrics = {
  refuelToTrailhead: RouteMetricEstimate | null;
  resupplyToTrailhead: RouteMetricEstimate | null;
  resupplyToRefuel: RouteMetricEstimate | null;
  providerDistanceEstimated: boolean;
};

type RouteVariantScoreDetails = {
  score: number;
  warnings: RouteContextWarning[];
  components: {
    refuelTrailheadProximityScore?: number | null;
    resupplyTrailheadProximityScore?: number | null;
    resupplyRefuelAdjacencyScore?: number | null;
    totalDurationScore?: number | null;
    totalDetourScore?: number | null;
    stopQualityScore?: number | null;
  };
};

const ROUTE_CORRIDOR_BUFFER_METERS = 1_500;
const EXCESSIVE_DETOUR_DISTANCE_METERS = 30_000;
const EXCESSIVE_DETOUR_DURATION_SECONDS = 45 * 60;
const SUPPLY_PLAN_THRESHOLDS = ROUTE_CONTEXT_SUPPLY_PLAN_SCORING_THRESHOLDS;

function emptyPlanMetrics(): RouteVariantPlanMetrics {
  return {
    refuelToTrailhead: null,
    resupplyToTrailhead: null,
    resupplyToRefuel: null,
    providerDistanceEstimated: false,
  };
}

function warning(
  code: RouteContextWarning['code'],
  message: string,
  severity: RouteContextWarning['severity'] = 'watch',
  source?: string | null,
): RouteContextWarning {
  return { code, message, severity, source };
}

function finitePositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function metricScore(value: number | null | undefined, preferredMax: number, fallbackMax = preferredMax * 4): number {
  if (value == null || !Number.isFinite(value)) return 0.45;
  if (value <= preferredMax * 0.25) return 1;
  if (value <= preferredMax) {
    const ratio = (value - preferredMax * 0.25) / (preferredMax * 0.75);
    return clampScore(1 - ratio * 0.28);
  }
  if (value <= fallbackMax) {
    const ratio = (value - preferredMax) / Math.max(1, fallbackMax - preferredMax);
    return clampScore(0.72 - ratio * 0.5);
  }
  return 0.08;
}

function openStatusScore(openStatus: SupplyCandidate['openStatus']): number {
  if (openStatus === 'open') return 1;
  if (openStatus === 'closed' || openStatus === 'temporarily_closed') return 0.1;
  return 0.68;
}

function ratingScore(rating?: number | null): number {
  if (rating == null || !Number.isFinite(rating)) return 0.66;
  return clampScore(rating / 5);
}

function categoryMatchScore(candidate: SupplyCandidate): number {
  const value = finitePositiveNumber(candidate.providerMetadata?.categoryMatchQuality);
  if (value != null) return clampScore(value);
  return 0.78;
}

function stopQualityScore(stops: RouteStop[]): number {
  if (stops.length === 0) return 0.5;
  const total = stops.reduce((sum, stop) => {
    const candidate = stop.candidate;
    return sum +
      categoryMatchScore(candidate) * 0.36 +
      openStatusScore(candidate.openStatus) * 0.26 +
      candidate.confidence.value * 0.26 +
      ratingScore(candidate.rating) * 0.12;
  }, 0);
  return clampScore(total / stops.length);
}

function routeMetricScore(metric: RouteMetricEstimate | null, preferredMeters: number): number {
  return metricScore(metric?.distanceMeters ?? null, preferredMeters, SUPPLY_PLAN_THRESHOLDS.ruralFallbackMaxRadiusMeters);
}

function totalDurationScore(durationSeconds: number | null): number {
  return metricScore(durationSeconds, SUPPLY_PLAN_THRESHOLDS.maxPreferredTotalDetourSeconds * 2, SUPPLY_PLAN_THRESHOLDS.maxPreferredTotalDetourSeconds * 6);
}

function totalDetourScore(distanceMeters: number | null, durationSeconds: number | null): number {
  const distance = metricScore(
    distanceMeters,
    SUPPLY_PLAN_THRESHOLDS.maxPreferredTotalDetourMeters,
    SUPPLY_PLAN_THRESHOLDS.maxPreferredTotalDetourMeters * 3,
  );
  const duration = metricScore(
    durationSeconds,
    SUPPLY_PLAN_THRESHOLDS.maxPreferredTotalDetourSeconds,
    SUPPLY_PLAN_THRESHOLDS.maxPreferredTotalDetourSeconds * 3,
  );
  return clampScore(distance * 0.58 + duration * 0.42);
}

function supplyCoordinate(candidate: SupplyCandidate): RouteContextCoordinate | null {
  if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) return null;
  if (Math.abs(candidate.lat) > 90 || Math.abs(candidate.lng) > 180) return null;
  return { lat: candidate.lat, lng: candidate.lng, label: candidate.name };
}

function normalizedSelectedIds(selectedSupplyCandidateIds?: string[] | null): string[] {
  return Array.from(new Set(
    (selectedSupplyCandidateIds ?? [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean),
  ));
}

function candidateMatchesId(candidate: SupplyCandidate, selectedId: string): boolean {
  return candidate.id === selectedId || candidate.providerPlaceId === selectedId;
}

function stopRole(category: SupplyCandidateCategory): 'refuel' | 'resupply' {
  return category === 'gas' ? 'refuel' : 'resupply';
}

function stopsForCategory(
  candidates: SupplyCandidate[],
  category: SupplyCandidateCategory,
  limit = ROUTE_CONTEXT_SUPPLY_MAX_CANDIDATES_PER_CATEGORY,
  selectedSupplyCandidateIds: string[] = [],
): RouteStop[] {
  const selected = selectedSupplyCandidateIds
    .map((id) => candidates.find((candidate) => (
      candidate.category === category && candidateMatchesId(candidate, id)
    )))
    .filter((candidate): candidate is SupplyCandidate => candidate != null);
  const selectedIds = new Set(selected.map((candidate) => candidate.id));
  return [
    ...selected,
    ...candidates
    .filter((candidate) => candidate.category === category)
      .filter((candidate) => !selectedIds.has(candidate.id))
    .sort((left, right) => right.score - left.score || right.confidence.value - left.confidence.value)
      .slice(0, Math.max(0, limit - selected.length)),
  ]
    .slice(0, limit)
    .map((candidate) => {
      const coordinate = supplyCoordinate(candidate);
      return coordinate ? { id: candidate.id, category, coordinate, candidate } : null;
    })
    .filter((item): item is RouteStop => item != null);
}

function variantSegmentIds(stops: RouteStop[], hasOrigin = true): string[] {
  if (stops.length === 0) return hasOrigin ? ['origin_to_trailhead'] : [];
  const ids: string[] = [];
  if (hasOrigin) {
    ids.push(`origin_to_${stopRole(stops[0].category)}`);
  }
  for (let index = 1; index < stops.length; index += 1) {
    ids.push(`${stopRole(stops[index - 1].category)}_to_${stopRole(stops[index].category)}`);
  }
  ids.push(`${stopRole(stops[stops.length - 1].category)}_to_trailhead`);
  return ids;
}

function buildVariantId(stops: RouteStop[]): string {
  if (stops.length === 0) return 'direct_approach';
  return stops.map((stop) => stop.category).join('_then_');
}

function buildRouteVariants(
  origin: RouteContextCoordinate,
  trailhead: RouteContextCoordinate,
  mode: SupplyMode,
  candidates: SupplyCandidate[],
  trailheadAnchoredSupplyChain = false,
  selectedSupplyCandidateIds: string[] = [],
): RouteVariant[] {
  const selectedIds = normalizedSelectedIds(selectedSupplyCandidateIds);
  const gasStops = stopsForCategory(candidates, 'gas', 3, selectedIds);
  const groceryStops = stopsForCategory(candidates, 'grocery', 3, selectedIds);
  const variants: RouteVariant[] = [];
  const create = (stops: RouteStop[]): RouteVariant => ({
    id: buildVariantId(stops),
    stops,
    pointSequence: [origin, ...stops.map((stop) => stop.coordinate), trailhead],
    segmentIds: variantSegmentIds(stops),
    distanceMeters: null,
    durationSeconds: null,
    detourDistanceMeters: null,
    detourDurationSeconds: null,
    segmentMetrics: [],
    providerBacked: false,
    planMetrics: emptyPlanMetrics(),
    scoreDetails: null,
  });

  variants.push(create([]));
  if (mode === 'gas') {
    gasStops.forEach((gas) => variants.push(create([gas])));
  } else if (mode === 'grocery') {
    groceryStops.forEach((grocery) => variants.push(create([grocery])));
  } else if (mode === 'gas_and_grocery') {
    if (gasStops.length === 0 || groceryStops.length === 0) {
      gasStops.forEach((gas) => variants.push(create([gas])));
      groceryStops.forEach((grocery) => variants.push(create([grocery])));
    } else {
      gasStops.forEach((gas) => {
        groceryStops.forEach((grocery) => {
          if (gas.id === grocery.id) return;
          const groceryAnchorId = String(
            (grocery.candidate.providerMetadata?.supplyChain as Record<string, unknown> | undefined)?.anchorCandidateId ?? '',
          );
          if (trailheadAnchoredSupplyChain && groceryAnchorId && groceryAnchorId !== gas.id) return;
          variants.push(create([gas, grocery]));
        });
      });
    }
  }

  return variants;
}

function buildPartialRouteVariantsWithoutOrigin(
  trailhead: RouteContextCoordinate,
  mode: SupplyMode,
  candidates: SupplyCandidate[],
  selectedSupplyCandidateIds: string[] = [],
): RouteVariant[] {
  const selectedIds = normalizedSelectedIds(selectedSupplyCandidateIds);
  const gasStops = stopsForCategory(candidates, 'gas', 3, selectedIds);
  const groceryStops = stopsForCategory(candidates, 'grocery', 3, selectedIds);
  const create = (stops: RouteStop[]): RouteVariant => ({
    id: buildVariantId(stops),
    stops,
    pointSequence: [...stops.map((stop) => stop.coordinate), trailhead],
    segmentIds: variantSegmentIds(stops, false),
    distanceMeters: null,
    durationSeconds: null,
    detourDistanceMeters: null,
    detourDurationSeconds: null,
    segmentMetrics: [],
    providerBacked: false,
    planMetrics: emptyPlanMetrics(),
    scoreDetails: null,
  });

  if (mode === 'gas') return gasStops.length > 0 ? gasStops.map((gas) => create([gas])) : [create([])];
  if (mode === 'grocery') return groceryStops.length > 0 ? groceryStops.map((grocery) => create([grocery])) : [create([])];
  if (mode === 'gas_and_grocery') {
    if (gasStops.length > 0 && groceryStops.length > 0) {
      return gasStops.flatMap((gas) => groceryStops
        .filter((grocery) => {
          if (gas.id === grocery.id) return false;
          const groceryAnchorId = String(
            (grocery.candidate.providerMetadata?.supplyChain as Record<string, unknown> | undefined)?.anchorCandidateId ?? '',
          );
          return !groceryAnchorId || groceryAnchorId === gas.id;
        })
        .map((grocery) => create([gas, grocery])));
    }
    if (gasStops.length > 0) return gasStops.map((gas) => create([gas]));
    if (groceryStops.length > 0) return groceryStops.map((grocery) => create([grocery]));
  }
  return [create([])];
}

function matrixCell(
  matrix: RouteMatrixResult | null,
  originIndex: number,
  destinationIndex: number,
): RouteMatrixCell | null {
  return matrix?.cells.find((cell) => (
    cell.originIndex === originIndex &&
    cell.destinationIndex === destinationIndex &&
    (cell.status == null || cell.status === 'ok')
  )) ?? null;
}

function sequenceMetrics(
  points: RouteContextCoordinate[],
  matrix: RouteMatrixResult | null,
  nodeIndexByKey: Map<string, number>,
): {
  distanceMeters: number | null;
  durationSeconds: number | null;
  segmentMetrics: Array<{ distanceMeters: number | null; durationSeconds: number | null }>;
  providerBacked: boolean;
} {
  let distanceMeters = 0;
  let durationSeconds = 0;
  let hasDuration = true;
  let providerBacked = matrix != null;
  const segmentMetrics: Array<{ distanceMeters: number | null; durationSeconds: number | null }> = [];

  for (let index = 1; index < points.length; index += 1) {
    const from = nodeIndexByKey.get(pointKey(points[index - 1]));
    const to = nodeIndexByKey.get(pointKey(points[index]));
    const cell = from == null || to == null ? null : matrixCell(matrix, from, to);
    const cellDistance = finitePositiveNumber(cell?.distanceMeters);
    const cellDuration = finitePositiveNumber(cell?.durationSeconds);
    if (cellDistance == null) {
      providerBacked = false;
      const fallbackDistance = Math.round(haversineDistanceMeters(points[index - 1], points[index]) ?? 0);
      distanceMeters += fallbackDistance;
      segmentMetrics.push({ distanceMeters: fallbackDistance, durationSeconds: null });
    } else {
      distanceMeters += cellDistance;
      segmentMetrics.push({
        distanceMeters: Math.round(cellDistance),
        durationSeconds: cellDuration == null ? null : Math.round(cellDuration),
      });
    }
    if (cellDuration == null) {
      hasDuration = false;
    } else {
      durationSeconds += cellDuration;
    }
  }

  return {
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: hasDuration ? Math.round(durationSeconds) : null,
    segmentMetrics,
    providerBacked,
  };
}

function pointKey(point: RouteContextCoordinate): string {
  return `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
}

function routeMetricBetween(
  from: RouteContextCoordinate,
  to: RouteContextCoordinate,
  matrix: RouteMatrixResult | null,
  nodeIndexByKey: Map<string, number>,
  candidateDistanceMeters?: number | null,
  candidateDurationSeconds?: number | null,
): RouteMetricEstimate {
  const fromIndex = nodeIndexByKey.get(pointKey(from));
  const toIndex = nodeIndexByKey.get(pointKey(to));
  const cell = fromIndex == null || toIndex == null ? null : matrixCell(matrix, fromIndex, toIndex);
  const matrixDistance = finitePositiveNumber(cell?.distanceMeters);
  const matrixDuration = finitePositiveNumber(cell?.durationSeconds);
  if (matrixDistance != null) {
    return {
      distanceMeters: Math.round(matrixDistance),
      durationSeconds: matrixDuration == null ? null : Math.round(matrixDuration),
      providerBacked: true,
    };
  }
  const candidateDistance = finitePositiveNumber(candidateDistanceMeters);
  if (candidateDistance != null) {
    const candidateDuration = finitePositiveNumber(candidateDurationSeconds);
    return {
      distanceMeters: Math.round(candidateDistance),
      durationSeconds: candidateDuration == null ? null : Math.round(candidateDuration),
      providerBacked: true,
    };
  }
  return {
    distanceMeters: Math.round(haversineDistanceMeters(from, to) ?? 0),
    durationSeconds: null,
    providerBacked: false,
  };
}

function uniqueRouteNodes(points: RouteContextCoordinate[]): RouteContextCoordinate[] {
  const seen = new Set<string>();
  const unique: RouteContextCoordinate[] = [];
  points.forEach((point) => {
    const key = pointKey(point);
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(point);
  });
  return unique;
}

async function computeMatrix(
  routingAdapter: RoutingProviderAdapter,
  nodes: RouteContextCoordinate[],
): Promise<RouteMatrixResult | null> {
  try {
    return await routingAdapter.computeRouteMatrix({
      origins: nodes,
      destinations: nodes,
      mode: 'driving',
      providerMetadata: { source: 'route_context_supply_aware_geometry' },
    });
  } catch {
    return null;
  }
}

function addUniqueWarning(warnings: RouteContextWarning[], item: RouteContextWarning): void {
  if (warnings.some((existing) => existing.code === item.code && existing.message === item.message)) return;
  warnings.push(item);
}

function variantPlanMetrics(
  variant: RouteVariant,
  matrix: RouteMatrixResult | null,
  nodeIndexByKey: Map<string, number>,
): RouteVariantPlanMetrics {
  const trailhead = variant.pointSequence[variant.pointSequence.length - 1];
  const refuel = variant.stops.find((stop) => stop.category === 'gas') ?? null;
  const resupply = variant.stops.find((stop) => stop.category === 'grocery') ?? null;
  const refuelToTrailhead = refuel
    ? routeMetricBetween(
        refuel.coordinate,
        trailhead,
        matrix,
        nodeIndexByKey,
        refuel.candidate.driveDistanceToTrailheadMeters,
        refuel.candidate.driveDurationToTrailheadSeconds,
      )
    : null;
  const resupplyToTrailhead = resupply
    ? routeMetricBetween(
        resupply.coordinate,
        trailhead,
        matrix,
        nodeIndexByKey,
        resupply.candidate.driveDistanceToTrailheadMeters,
        resupply.candidate.driveDurationToTrailheadSeconds,
      )
    : null;
  const resupplyToRefuel = refuel && resupply
    ? routeMetricBetween(
        refuel.coordinate,
        resupply.coordinate,
        matrix,
        nodeIndexByKey,
        resupply.candidate.driveDistanceToRefuelMeters,
        resupply.candidate.driveDurationToRefuelSeconds,
      )
    : null;
  return {
    refuelToTrailhead,
    resupplyToTrailhead,
    resupplyToRefuel,
    providerDistanceEstimated: [refuelToTrailhead, resupplyToTrailhead, resupplyToRefuel]
      .filter((metric): metric is RouteMetricEstimate => metric != null)
      .some((metric) => !metric.providerBacked),
  };
}

function scoreRouteVariant(
  variant: RouteVariant,
  mode: SupplyMode,
  hasOrigin: boolean,
): RouteVariantScoreDetails {
  const warnings: RouteContextWarning[] = [];
  const refuel = variant.stops.find((stop) => stop.category === 'gas') ?? null;
  const resupply = variant.stops.find((stop) => stop.category === 'grocery') ?? null;
  const quality = stopQualityScore(variant.stops);
  const detour = hasOrigin
    ? totalDetourScore(variant.detourDistanceMeters, variant.detourDurationSeconds)
    : 0.58;
  const duration = totalDurationScore(variant.durationSeconds);

  if (variant.planMetrics.providerDistanceEstimated || !variant.providerBacked) {
    addUniqueWarning(warnings, warning(
      'supply_chain_provider_distance_estimated',
      'Supply chain distance was estimated because provider-backed routing distance was unavailable for every segment.',
      'info',
    ));
  }

  if ((variant.detourDistanceMeters ?? 0) > SUPPLY_PLAN_THRESHOLDS.maxPreferredTotalDetourMeters ||
      (variant.detourDurationSeconds ?? 0) > SUPPLY_PLAN_THRESHOLDS.maxPreferredTotalDetourSeconds) {
    addUniqueWarning(warnings, warning(
      'supply_chain_excessive_detour',
      'Supply chain may add more detour than the preferred route context threshold.',
      'watch',
    ));
  }

  if (mode === 'gas_and_grocery' && (!refuel || !resupply)) {
    addUniqueWarning(warnings, warning(
      'supply_chain_partial',
      'Supply chain is partial because both refuel and resupply stops are not available.',
      'watch',
    ));
  }

  if (mode === 'gas') {
    const refuelProximity = routeMetricScore(
      variant.planMetrics.refuelToTrailhead,
      SUPPLY_PLAN_THRESHOLDS.maxPreferredRefuelDistanceToTrailheadMeters,
    );
    const score = clampScore(
      refuelProximity * (hasOrigin ? 0.42 : 0.58) +
        duration * 0.16 +
        detour * (hasOrigin ? 0.2 : 0.04) +
        quality * (hasOrigin ? 0.22 : 0.22),
    );
    return {
      score,
      warnings,
      components: {
        refuelTrailheadProximityScore: refuelProximity,
        totalDurationScore: duration,
        totalDetourScore: detour,
        stopQualityScore: quality,
      },
    };
  }

  if (mode === 'grocery') {
    const resupplyProximity = routeMetricScore(
      variant.planMetrics.resupplyToTrailhead,
      SUPPLY_PLAN_THRESHOLDS.maxPreferredRefuelDistanceToTrailheadMeters,
    );
    const score = clampScore(
      resupplyProximity * (hasOrigin ? 0.4 : 0.56) +
        duration * 0.16 +
        detour * (hasOrigin ? 0.2 : 0.04) +
        quality * (hasOrigin ? 0.24 : 0.24),
    );
    return {
      score,
      warnings,
      components: {
        resupplyTrailheadProximityScore: resupplyProximity,
        totalDurationScore: duration,
        totalDetourScore: detour,
        stopQualityScore: quality,
      },
    };
  }

  if (mode === 'gas_and_grocery') {
    const refuelProximity = routeMetricScore(
      variant.planMetrics.refuelToTrailhead,
      SUPPLY_PLAN_THRESHOLDS.maxPreferredRefuelDistanceToTrailheadMeters,
    );
    const resupplyAdjacency = routeMetricScore(
      variant.planMetrics.resupplyToRefuel,
      SUPPLY_PLAN_THRESHOLDS.maxPreferredResupplyDistanceToRefuelMeters,
    );
    const refuelDistance = variant.planMetrics.refuelToTrailhead?.distanceMeters ?? refuel?.candidate.distanceToTrailheadMeters ?? null;
    const resupplyDistance = variant.planMetrics.resupplyToRefuel?.distanceMeters ?? resupply?.candidate.distanceToRefuelMeters ?? null;
    let guardrailMultiplier = 1;

    if (refuelDistance != null && refuelDistance > SUPPLY_PLAN_THRESHOLDS.maxPreferredRefuelDistanceToTrailheadMeters) {
      if (
        SUPPLY_PLAN_THRESHOLDS.ruralFallbackExpansionEnabled &&
        refuelDistance <= SUPPLY_PLAN_THRESHOLDS.ruralFallbackMaxRadiusMeters
      ) {
        guardrailMultiplier *= 0.78;
        addUniqueWarning(warnings, warning(
          'supply_chain_rural_fallback',
          'Supply chain uses a farther refuel stop as a rural fallback.',
          'info',
        ));
      } else {
        guardrailMultiplier *= 0.38;
        addUniqueWarning(warnings, warning(
          'refuel_far_from_trailhead',
          'Refuel stop is too far from the trailhead to be a preferred supply-chain anchor.',
          'watch',
        ));
      }
    }

    if (resupplyDistance != null && resupplyDistance > SUPPLY_PLAN_THRESHOLDS.maxPreferredResupplyDistanceToRefuelMeters) {
      if (
        SUPPLY_PLAN_THRESHOLDS.ruralFallbackExpansionEnabled &&
        resupplyDistance <= SUPPLY_PLAN_THRESHOLDS.ruralFallbackMaxRadiusMeters
      ) {
        guardrailMultiplier *= 0.86;
        addUniqueWarning(warnings, warning(
          'supply_chain_rural_fallback',
          'Supply chain uses a farther resupply stop as a rural fallback.',
          'info',
        ));
      } else {
        guardrailMultiplier *= 0.45;
        addUniqueWarning(warnings, warning(
          'resupply_far_from_refuel',
          'Resupply stop is too far from the selected refuel stop to be a preferred supply-chain pair.',
          'watch',
        ));
      }
    }

    if ((variant.detourDistanceMeters ?? 0) > SUPPLY_PLAN_THRESHOLDS.maxPreferredTotalDetourMeters ||
        (variant.detourDurationSeconds ?? 0) > SUPPLY_PLAN_THRESHOLDS.maxPreferredTotalDetourSeconds) {
      guardrailMultiplier *= 0.76;
    }

    const rawScore = clampScore(
      refuelProximity * 0.28 +
        resupplyAdjacency * 0.26 +
        duration * 0.18 +
        detour * (hasOrigin ? 0.16 : 0.05) +
        quality * (hasOrigin ? 0.12 : 0.23),
    );
    return {
      score: clampScore(rawScore * guardrailMultiplier),
      warnings,
      components: {
        refuelTrailheadProximityScore: refuelProximity,
        resupplyRefuelAdjacencyScore: resupplyAdjacency,
        totalDurationScore: duration,
        totalDetourScore: detour,
        stopQualityScore: quality,
      },
    };
  }

  return {
    score: variant.stops.length === 0 ? 1 : clampScore(quality * 0.5 + duration * 0.3 + detour * 0.2),
    warnings,
    components: {
      totalDurationScore: duration,
      totalDetourScore: detour,
      stopQualityScore: quality,
    },
  };
}

function enrichVariantsWithMetrics(
  variants: RouteVariant[],
  matrix: RouteMatrixResult | null,
  nodeIndexByKey: Map<string, number>,
  mode: SupplyMode,
  hasOrigin: boolean,
): RouteVariant[] {
  const direct = variants.find((variant) => variant.stops.length === 0);
  const directMetrics = direct
    ? sequenceMetrics(direct.pointSequence, matrix, nodeIndexByKey)
    : null;

  return variants.map((variant) => {
    const metrics = sequenceMetrics(variant.pointSequence, matrix, nodeIndexByKey);
    const enriched: RouteVariant = {
      ...variant,
      distanceMeters: metrics.distanceMeters,
      durationSeconds: metrics.durationSeconds,
      detourDistanceMeters: directMetrics?.distanceMeters != null && metrics.distanceMeters != null
        ? Math.max(0, metrics.distanceMeters - directMetrics.distanceMeters)
        : null,
      detourDurationSeconds: directMetrics?.durationSeconds != null && metrics.durationSeconds != null
        ? Math.max(0, metrics.durationSeconds - directMetrics.durationSeconds)
        : null,
      segmentMetrics: metrics.segmentMetrics,
      providerBacked: metrics.providerBacked,
      planMetrics: emptyPlanMetrics(),
      scoreDetails: null,
    };
    const planMetrics = variantPlanMetrics(enriched, matrix, nodeIndexByKey);
    const scored = {
      ...enriched,
      planMetrics,
    };
    return {
      ...scored,
      scoreDetails: scoreRouteVariant(scored, mode, hasOrigin),
    };
  });
}

function variantSortValue(variant: RouteVariant): number {
  const detourDistance = variant.detourDistanceMeters ?? 0;
  const detourDuration = variant.detourDurationSeconds ?? 0;
  const totalDistance = variant.distanceMeters ?? totalRouteDistanceMeters(variant.pointSequence);
  const totalDuration = variant.durationSeconds ?? 0;
  return detourDuration * 20 + detourDistance + totalDuration * 4 + totalDistance * 0.08;
}

function compareRouteVariants(left: RouteVariant, right: RouteVariant): number {
  const leftScore = left.scoreDetails?.score ?? 0;
  const rightScore = right.scoreDetails?.score ?? 0;
  if (rightScore !== leftScore) return rightScore - leftScore;
  return variantSortValue(left) - variantSortValue(right);
}

function variantContainsSelectedIds(variant: RouteVariant, selectedIds: string[]): boolean {
  if (selectedIds.length === 0) return false;
  const variantIds = new Set(variant.stops.flatMap((stop) => [
    stop.id,
    stop.candidate.providerPlaceId ?? '',
  ]));
  return selectedIds.every((id) => variantIds.has(id));
}

function selectBestVariant(
  variants: RouteVariant[],
  mode: SupplyMode,
  selectedSupplyCandidateIds: string[] = [],
): RouteVariant {
  const selectedIds = selectedSupplyCandidateIds.map((id) => String(id ?? '').trim()).filter(Boolean);
  const selectedEligible = selectedIds.length > 0
    ? variants.filter((variant) => variantContainsSelectedIds(variant, selectedIds))
    : [];
  if (selectedEligible.length > 0) {
    return [...selectedEligible].sort(compareRouteVariants)[0];
  }
  const eligible = mode === 'none'
    ? variants.filter((variant) => variant.stops.length === 0)
    : variants.filter((variant) => variant.stops.length > 0);
  return [...(eligible.length > 0 ? eligible : variants)]
    .sort(compareRouteVariants)[0];
}

function normalizeRouteResultCoordinates(
  result: RouteGeometryResult | null,
  fallbackPoints: RouteContextCoordinate[],
): RouteContextCoordinate[] {
  if (!result) return fallbackPoints;
  const direct = normalizeRouteGeometryCoordinates(result.coordinates);
  if (direct.length >= 2) return direct;
  const decoded = decodeEncodedPolyline(result.encodedPolyline);
  return decoded.length >= 2 ? decoded : fallbackPoints;
}

async function computeSelectedRoute(
  routingAdapter: RoutingProviderAdapter,
  variant: RouteVariant,
): Promise<RouteGeometryResult | null> {
  try {
    const waypoints = variant.pointSequence.slice(1, -1);
    return await routingAdapter.computeRoute({
      origin: variant.pointSequence[0],
      destination: variant.pointSequence[variant.pointSequence.length - 1],
      waypoints,
      routeCoordinates: variant.pointSequence,
      mode: 'driving',
      providerMetadata: {
        source: 'route_context_supply_aware_geometry',
        variantId: variant.id,
        selectedSupplyCandidateIds: variant.stops.map((stop) => stop.id),
      },
    });
  } catch {
    return null;
  }
}

function logicalSegmentsFromVariant(
  variant: RouteVariant,
  providerMetadata: RouteContextProviderMetadata,
): RouteGeometrySegment[] {
  const segments: RouteGeometrySegment[] = [];
  for (let index = 1; index < variant.pointSequence.length; index += 1) {
    segments.push({
      id: variant.segmentIds[index - 1] ?? `segment-${index}`,
      start: variant.pointSequence[index - 1],
      end: variant.pointSequence[index],
      distanceMeters: Math.round(haversineDistanceMeters(variant.pointSequence[index - 1], variant.pointSequence[index]) ?? 0),
      durationSeconds: null,
      providerMetadata,
    });
  }
  return segments;
}

function fullApproachChainSegment(
  variant: RouteVariant,
  providerMetadata: RouteContextProviderMetadata,
): RouteGeometrySegment | null {
  if (variant.pointSequence.length < 2) return null;
  return {
    id: 'full_approach_chain',
    start: variant.pointSequence[0],
    end: variant.pointSequence[variant.pointSequence.length - 1],
    distanceMeters: variant.distanceMeters,
    durationSeconds: variant.durationSeconds,
    providerMetadata: {
      ...providerMetadata,
      logicalSegment: 'full_approach_chain',
      aggregate: true,
      sequence: variant.segmentIds.length + 1,
    },
  };
}

function routeGeometryFromVariant(
  variant: RouteVariant,
  routeResult: RouteGeometryResult | null,
  providerId: string,
  trailRouteCoordinates?: RouteContextCoordinate[] | null,
  trailEndpoint?: RouteContextCoordinate | null,
): RouteGeometry {
  const approachCoordinates = dedupeConsecutiveCoordinates(
    normalizeRouteResultCoordinates(routeResult, variant.pointSequence),
  );
  const trailCoordinates = trailRoutePoints(
    variant.pointSequence[variant.pointSequence.length - 1],
    trailRouteCoordinates,
    trailEndpoint,
  );
  const coordinates = dedupeConsecutiveCoordinates([
    ...approachCoordinates,
    ...trailCoordinates,
  ]);
  const providerMetadata: RouteContextProviderMetadata = {
    providerId,
    source: routeResult ? 'routing_provider' : 'ecs_haversine_route_fallback',
    supplyAware: true,
    variantId: variant.id,
    selectedSupplyCandidateIds: variant.stops.map((stop) => stop.id),
    selectedSupplyCategories: variant.stops.map((stop) => stop.category),
    detourDistanceMeters: variant.detourDistanceMeters,
    detourDurationSeconds: variant.detourDurationSeconds,
    supplyPlanScore: variant.scoreDetails?.score ?? null,
    supplyPlanScoreComponents: variant.scoreDetails?.components ?? null,
    supplyPlanWarnings: variant.scoreDetails?.warnings ?? [],
    supplyPlanMetrics: variant.planMetrics,
    appendedTrailGeometryPointCount: trailCoordinates.length,
    routeProviderMetadata: routeResult?.providerMetadata ?? null,
  };
  const logicalSegments = logicalSegmentsFromVariant(variant, providerMetadata).map((segment, index) => ({
    ...segment,
    distanceMeters: variant.segmentMetrics[index]?.distanceMeters ?? segment.distanceMeters,
    durationSeconds: variant.segmentMetrics[index]?.durationSeconds ?? null,
    providerMetadata: {
      ...providerMetadata,
      logicalSegment: segment.id,
      sequence: index + 1,
    },
  }));
  const fullApproach = fullApproachChainSegment(variant, providerMetadata);
  const trailSegments = trailSegmentsFromPoints(trailCoordinates, {
    ...providerMetadata,
    source: 'designated_trail_geometry',
  }, logicalSegments.length + (fullApproach ? 1 : 0));
  const approachDistance = routeResult?.distanceMeters != null
    ? Math.round(Number(routeResult.distanceMeters))
    : variant.distanceMeters ?? Math.round(totalRouteDistanceMeters(approachCoordinates));
  const trailDistance = trailCoordinates.length >= 2
    ? Math.round(totalRouteDistanceMeters(trailCoordinates))
    : 0;

  return {
    origin: variant.pointSequence[0],
    destination: coordinates[coordinates.length - 1] ?? variant.pointSequence[variant.pointSequence.length - 1],
    waypoints: variant.pointSequence.slice(1, -1),
    encodedPolyline: routeResult?.encodedPolyline ?? null,
    coordinates,
    distanceMeters: approachDistance + trailDistance,
    durationSeconds: routeResult?.durationSeconds != null
      ? Math.round(Number(routeResult.durationSeconds))
      : variant.durationSeconds,
    bbox: boundingBoxFromCoordinates(coordinates) ?? routeResult?.bbox ?? null,
    corridor: createRouteCorridor(coordinates, ROUTE_CORRIDOR_BUFFER_METERS),
    segments: logicalSegments.length > 0 || fullApproach || trailSegments.length > 0
      ? [...logicalSegments, ...(fullApproach ? [fullApproach] : []), ...trailSegments]
      : buildRouteGeometrySegments(coordinates, providerMetadata),
    providerMetadata,
  };
}

function samePoint(left: RouteContextCoordinate | null | undefined, right: RouteContextCoordinate | null | undefined): boolean {
  return !!left && !!right && Math.abs(left.lat - right.lat) < 0.000001 && Math.abs(left.lng - right.lng) < 0.000001;
}

function trailRoutePoints(
  trailhead: RouteContextCoordinate,
  trailRouteCoordinates?: RouteContextCoordinate[] | null,
  trailEndpoint?: RouteContextCoordinate | null,
): RouteContextCoordinate[] {
  const trailPoints = normalizeRouteGeometryCoordinates(trailRouteCoordinates ?? []);
  if (trailEndpoint && !trailPoints.some((point) => samePoint(point, trailEndpoint))) {
    trailPoints.push(trailEndpoint);
  }
  if (trailPoints.length < 2) return [];
  const withTrailhead = samePoint(trailPoints[0], trailhead)
    ? trailPoints
    : [trailhead, ...trailPoints];
  return dedupeConsecutiveCoordinates(withTrailhead);
}

function trailSegmentsFromPoints(
  points: RouteContextCoordinate[],
  providerMetadata: RouteContextProviderMetadata,
  offset: number,
): RouteGeometrySegment[] {
  if (points.length < 2) return [];
  const segments: RouteGeometrySegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    segments.push({
      id: index === 1 ? 'trailhead_to_route_end' : `trail_route_${index}`,
      start: points[index - 1],
      end: points[index],
      distanceMeters: Math.round(haversineDistanceMeters(points[index - 1], points[index]) ?? 0),
      durationSeconds: null,
      providerMetadata: {
        ...providerMetadata,
        logicalSegment: 'trail_route',
        sequence: offset + index,
      },
    });
  }
  return segments;
}

function trailheadOnlyGeometry(
  anchor: TrailheadAnchor,
  providerMetadata: RouteContextProviderMetadata,
): RouteGeometry {
  const point = { lat: anchor.lat, lng: anchor.lng, label: anchor.label ?? 'Trailhead' };
  return {
    origin: null,
    destination: point,
    waypoints: [],
    coordinates: [point],
    distanceMeters: null,
    durationSeconds: null,
    bbox: boundingBoxFromCoordinates([point]),
    corridor: null,
    segments: [],
    providerMetadata,
  };
}

export async function buildSupplyAwareRouteGeometry(
  input: SupplyAwareRouteGeometryInput,
): Promise<SupplyAwareRouteGeometryResult> {
  const warnings: RouteContextWarning[] = [];
  const trailhead = { lat: input.trailheadAnchor.lat, lng: input.trailheadAnchor.lng, label: input.trailheadAnchor.label ?? 'Trailhead' };
  if (!input.origin) {
    warnings.push(warning('missing_origin', 'Origin is unavailable; supply-aware route geometry starts at the selected supply chain or trailhead.', 'info'));
    const partialVariants = buildPartialRouteVariantsWithoutOrigin(
      trailhead,
      input.selectedSupplyMode,
      input.supplyCandidates,
      input.selectedSupplyCandidateIds ?? [],
    );
    const uniqueNodes = uniqueRouteNodes(partialVariants.flatMap((variant) => variant.pointSequence));
    const nodeIndexByKey = new Map(uniqueNodes.map((point, index) => [pointKey(point), index]));
    const variants = enrichVariantsWithMetrics(partialVariants, null, nodeIndexByKey, input.selectedSupplyMode, false);
    const selected = selectBestVariant(
      variants,
      input.selectedSupplyMode,
      input.selectedSupplyCandidateIds ?? [],
    );
    selected.scoreDetails?.warnings.forEach((item) => addUniqueWarning(warnings, item));
    if (selected.pointSequence.length >= 2) {
      const routeGeometry = routeGeometryFromVariant(
        selected,
        null,
        'ecs_haversine_route_fallback',
        input.trailRouteCoordinates,
        input.trailEndpoint,
      );
      const providerMetadata = {
        ...(routeGeometry.providerMetadata ?? {}),
        source: 'partial_supply_chain_missing_origin',
        supplyAware: true,
        missingOrigin: true,
        matrixProviderBacked: false,
        candidateVariantCount: variants.length,
      };
      return {
        routeGeometry: {
          ...routeGeometry,
          origin: null,
          providerMetadata,
        },
        selectedCandidateIds: selected.stops.map((stop) => stop.id),
        warnings,
        providerMetadata,
      };
    }
    return {
      routeGeometry: trailheadOnlyGeometry(input.trailheadAnchor, {
        source: 'trailhead_only',
        supplyAware: true,
        missingOrigin: true,
      }),
      selectedCandidateIds: [],
      warnings,
      providerMetadata: { source: 'trailhead_only', supplyAware: true, missingOrigin: true },
    };
  }

  const variants = buildRouteVariants(
    input.origin,
    trailhead,
    input.selectedSupplyMode,
    input.supplyCandidates,
    input.trailheadAnchoredSupplyChain === true,
    input.selectedSupplyCandidateIds ?? [],
  );
  const uniqueNodes = uniqueRouteNodes(variants.flatMap((variant) => variant.pointSequence));
  const nodeIndexByKey = new Map(uniqueNodes.map((point, index) => [pointKey(point), index]));

  if (!input.routingAdapter?.isAvailable()) {
    warnings.push(warning('provider_unavailable', 'Routing provider is unavailable; route geometry uses coarse haversine planning only.', 'watch'));
  }

  const matrix = input.routingAdapter?.isAvailable()
    ? await computeMatrix(input.routingAdapter, uniqueNodes)
    : null;
  if (input.routingAdapter?.isAvailable() && !matrix) {
    warnings.push(warning('provider_unavailable', 'Routing matrix was unavailable; route comparison uses coarse haversine distance.', 'watch', input.routingAdapter.id));
  }

  const enrichedVariants = enrichVariantsWithMetrics(variants, matrix, nodeIndexByKey, input.selectedSupplyMode, true);
  const selected = selectBestVariant(
    enrichedVariants,
    input.selectedSupplyMode,
    input.selectedSupplyCandidateIds ?? [],
  );
  selected.scoreDetails?.warnings.forEach((item) => addUniqueWarning(warnings, item));
  if ((selected.detourDistanceMeters ?? 0) > EXCESSIVE_DETOUR_DISTANCE_METERS ||
      (selected.detourDurationSeconds ?? 0) > EXCESSIVE_DETOUR_DURATION_SECONDS) {
    warnings.push(warning('excessive_detour', 'Selected supply-aware route may require a large detour.', 'watch'));
  }

  const routeResult = input.routingAdapter?.isAvailable()
    ? await computeSelectedRoute(input.routingAdapter, selected)
    : null;
  if (input.routingAdapter?.isAvailable() && !routeResult) {
    warnings.push(warning('partial_route_geometry', 'Routing provider did not return full selected route geometry; using coarse route points.', 'watch', input.routingAdapter.id));
  }

  const providerId = input.routingAdapter?.id ?? 'ecs_haversine_route_fallback';
  const routeGeometry = routeGeometryFromVariant(
    selected,
    routeResult,
    providerId,
    input.trailRouteCoordinates,
    input.trailEndpoint,
  );
  const providerMetadata = {
    ...(routeGeometry.providerMetadata ?? {}),
    matrixProviderBacked: matrix != null,
    candidateVariantCount: variants.length,
  };

  return {
    routeGeometry: {
      ...routeGeometry,
      providerMetadata,
    },
    selectedCandidateIds: selected.stops.map((stop) => stop.id),
    warnings,
    providerMetadata,
  };
}
