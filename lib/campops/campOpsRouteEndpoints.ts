import type {
  CampCandidate,
  CampCandidateEnrichment,
  CampOpsConfidence,
  CampOpsGeoPoint,
  CampOpsRouteCampEndpointPlan,
  CampOpsRouteEndpointMetadata,
  CampOpsRouteEndpointRole,
  CampOpsRouteEndpointWindow,
  CampOpsRouteSide,
  CampRecommendationSet,
  CampSearchContext,
} from './campOpsTypes';
import {
  createEmptyCampRecommendationSet,
  normalizeCampOpsScore,
} from './campOpsTypes';
import type { CampHardGateCandidateEvaluation } from './campOpsHardGates';
import { evaluateCampOpsRecommendations } from './campOpsRecommendationCoordinator';

export const CAMP_OPS_ROUTE_ENDPOINT_DEFAULT_SEARCH_CORRIDOR_MILES = 3;
export const CAMP_OPS_ROUTE_ENDPOINT_PREFERRED_ROUTE_BAND_MILES = 0.5;

type RouteCoordinate = CampOpsGeoPoint | { lat?: number | null; lng?: number | null; lon?: number | null } | [number, number];

export type CampOpsRouteEndpointTripType =
  | 'day_trip'
  | 'overnight_camping'
  | 'weekend_overland'
  | 'multi_day_expedition'
  | string;

export type BuildCampOpsRouteEndpointPlanInput = {
  routeId: string;
  tripId?: string | null;
  tripType?: CampOpsRouteEndpointTripType | null;
  priorities?: string[] | null;
  campPlanningEnabled?: boolean | null;
  routeCoordinates: RouteCoordinate[];
  routeDistanceMiles?: number | null;
  plannedDays?: number | null;
  plannedNights?: number | null;
  generatedAt?: string | null;
  candidates?: CampCandidate[] | null;
  enrichmentsByCandidateId?: Record<string, CampCandidateEnrichment | undefined> | null;
  context?: Partial<CampSearchContext> | null;
  selectedEndpointIds?: string[] | null;
  searchCorridorMiles?: number | null;
};

export type CampOpsRouteProjection = {
  routeSide: CampOpsRouteSide;
  routeMileMarker: number | null;
  nearestSegmentIndex: number | null;
  distanceFromRouteMiles: number | null;
};

type NormalizedRoutePoint = {
  latitude: number;
  longitude: number;
};

type EndpointCandidateBundle = {
  candidate: CampCandidate;
  enrichment: CampCandidateEnrichment;
  projection: CampOpsRouteProjection;
  window: CampOpsRouteEndpointWindow;
};

const MILES_PER_LATITUDE_DEGREE = 69;
const SIDE_EPSILON_MILES = 0.001;

const CONFIDENCE_RANK: Record<CampOpsConfidence, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeRouteCoordinate(point: RouteCoordinate): NormalizedRoutePoint | null {
  if (Array.isArray(point)) {
    const latitude = finiteNumber(point[0]);
    const longitude = finiteNumber(point[1]);
    if (latitude == null || longitude == null) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return { latitude, longitude };
  }
  const latitude = finiteNumber((point as CampOpsGeoPoint).latitude ?? (point as { lat?: number }).lat);
  const longitude = finiteNumber(
    (point as CampOpsGeoPoint).longitude ??
      (point as { lng?: number }).lng ??
      (point as { lon?: number }).lon,
  );
  if (latitude == null || longitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function normalizeRouteCoordinates(points: RouteCoordinate[] | null | undefined): NormalizedRoutePoint[] {
  return (points ?? []).map(normalizeRouteCoordinate).filter((point): point is NormalizedRoutePoint => !!point);
}

function pointToMiles(point: NormalizedRoutePoint, origin: NormalizedRoutePoint): { x: number; y: number } {
  const latitudeScale = Math.cos(((point.latitude + origin.latitude) / 2) * Math.PI / 180);
  return {
    x: (point.longitude - origin.longitude) * MILES_PER_LATITUDE_DEGREE * latitudeScale,
    y: (point.latitude - origin.latitude) * MILES_PER_LATITUDE_DEGREE,
  };
}

function distanceMiles(a: NormalizedRoutePoint, b: NormalizedRoutePoint): number {
  const pa = pointToMiles(a, a);
  const pb = pointToMiles(b, a);
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function routeDistanceMiles(route: NormalizedRoutePoint[]): number | null {
  if (route.length < 2) return null;
  let total = 0;
  for (let index = 1; index < route.length; index += 1) {
    total += distanceMiles(route[index - 1], route[index]);
  }
  return Number.isFinite(total) && total > 0 ? total : null;
}

function confidenceAtLeast(value: CampOpsConfidence | null | undefined, minimum: CampOpsConfidence): boolean {
  return CONFIDENCE_RANK[value ?? 'unknown'] >= CONFIDENCE_RANK[minimum];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function projectCampPointToRoute(
  point: RouteCoordinate,
  routeCoordinates: RouteCoordinate[],
): CampOpsRouteProjection {
  const route = normalizeRouteCoordinates(routeCoordinates);
  const campPoint = normalizeRouteCoordinate(point);
  if (!campPoint || route.length < 2) {
    return {
      routeSide: 'unknown',
      routeMileMarker: null,
      nearestSegmentIndex: null,
      distanceFromRouteMiles: null,
    };
  }

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestSide: CampOpsRouteSide = 'unknown';
  let bestSegmentIndex: number | null = null;
  let bestRouteMileMarker: number | null = null;
  let cumulativeMiles = 0;

  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const startPoint = pointToMiles(start, start);
    const endPoint = pointToMiles(end, start);
    const camp = pointToMiles(campPoint, start);
    const vx = endPoint.x - startPoint.x;
    const vy = endPoint.y - startPoint.y;
    const wx = camp.x - startPoint.x;
    const wy = camp.y - startPoint.y;
    const segmentLengthSquared = vx * vx + vy * vy;
    const segmentLength = Math.sqrt(segmentLengthSquared);
    if (!Number.isFinite(segmentLength) || segmentLength <= 0) continue;

    const t = clamp01((wx * vx + wy * vy) / segmentLengthSquared);
    const projectedX = startPoint.x + t * vx;
    const projectedY = startPoint.y + t * vy;
    const dx = camp.x - projectedX;
    const dy = camp.y - projectedY;
    const candidateDistance = Math.sqrt(dx * dx + dy * dy);
    const cross = vx * wy - vy * wx;
    const side: CampOpsRouteSide =
      Math.abs(cross) <= SIDE_EPSILON_MILES
        ? 'unknown'
        : cross > 0
          ? 'left'
          : 'right';

    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestSide = side;
      bestSegmentIndex = index;
      bestRouteMileMarker = cumulativeMiles + segmentLength * t;
    }

    cumulativeMiles += segmentLength;
  }

  return {
    routeSide: bestSide,
    routeMileMarker: bestRouteMileMarker,
    nearestSegmentIndex: bestSegmentIndex,
    distanceFromRouteMiles: Number.isFinite(bestDistance) ? bestDistance : null,
  };
}

export function campTripNeedsRouteEndpoints(input: {
  tripType?: CampOpsRouteEndpointTripType | null;
  priorities?: string[] | null;
  campPlanningEnabled?: boolean | null;
}): boolean {
  if (input.campPlanningEnabled === true) return true;
  if ((input.priorities ?? []).some((priority) => String(priority).toLowerCase() === 'camping')) return true;
  return (
    input.tripType === 'overnight_camping' ||
    input.tripType === 'weekend_overland' ||
    input.tripType === 'multi_day_expedition'
  );
}

function plannedNightCount(input: BuildCampOpsRouteEndpointPlanInput): number {
  const explicitNights = finiteNumber(input.plannedNights);
  if (explicitNights != null && explicitNights > 0) return Math.min(14, Math.floor(explicitNights));
  const plannedDays = finiteNumber(input.plannedDays);
  if (plannedDays != null && plannedDays > 1) return Math.min(14, Math.floor(plannedDays - 1));
  if (input.tripType === 'weekend_overland') return 2;
  if (input.tripType === 'multi_day_expedition') return 3;
  return input.tripType === 'overnight_camping' ? 1 : 0;
}

function buildEndpointWindows(input: BuildCampOpsRouteEndpointPlanInput, totalRouteMiles: number | null): CampOpsRouteEndpointWindow[] {
  if (!campTripNeedsRouteEndpoints(input)) return [];
  const nights = plannedNightCount(input);
  const corridor = finiteNumber(input.searchCorridorMiles) ?? CAMP_OPS_ROUTE_ENDPOINT_DEFAULT_SEARCH_CORRIDOR_MILES;
  return Array.from({ length: nights }, (_, index) => {
    const progress = (index + 1) / (nights + 1);
    return {
      id: `${input.routeId}:camp-endpoint-window-${index + 1}`,
      plannedDay: index + 1,
      nightIndex: index,
      targetRouteMile: totalRouteMiles == null ? null : totalRouteMiles * progress,
      targetEtaIso: null,
      latestArrivalIso: input.context?.desiredArrivalWindow?.latestAcceptableIso ?? null,
      searchCorridorMiles: Math.max(0.25, Math.min(25, corridor)),
    };
  });
}

function normalizeContext(input: BuildCampOpsRouteEndpointPlanInput): CampSearchContext {
  return {
    id: input.context?.id ?? `campops-route-endpoints:${input.routeId}`,
    currentLocation: input.context?.currentLocation,
    routeId: input.context?.routeId ?? input.routeId,
    tripId: input.context?.tripId ?? input.tripId ?? null,
    plannedCampId: input.context?.plannedCampId ?? null,
    currentTimeIso: input.context?.currentTimeIso ?? input.generatedAt ?? new Date().toISOString(),
    desiredArrivalWindow: input.context?.desiredArrivalWindow ?? null,
    daylightInfo: input.context?.daylightInfo ?? null,
    vehicleProfile: input.context?.vehicleProfile ?? null,
    convoyProfile: input.context?.convoyProfile ?? null,
    resourceState: input.context?.resourceState ?? null,
    userCampPreferences: input.context?.userCampPreferences ?? null,
    riskTolerance: input.context?.riskTolerance ?? 'conservative',
    offlineMode: input.context?.offlineMode ?? 'unknown',
    delayEstimateMinutes: input.context?.delayEstimateMinutes ?? null,
    routeProgress: input.context?.routeProgress ?? null,
  };
}

function placeholderEnrichment(candidate: CampCandidate): CampCandidateEnrichment {
  return {
    candidateId: candidate.id,
    legalStatus: 'unknown',
    legalConfidence: 'unknown',
    closureStatus: 'unknown',
    publicAccessStatus: 'unknown',
    accessDifficulty: 'unknown',
    vehicleFit: 'unknown',
    trailerSuitability: 'unknown',
    turnaroundSuitability: 'unknown',
    trailerTurnaroundConfidence: 'unknown',
    deadEndRisk: 'unknown',
    backingRequired: null,
    roadWidthConfidence: 'unknown',
    groupCapacityEstimate: null,
    groupCapacityConfidence: 'unknown',
    etaIso: null,
    etaMinutesFromNow: null,
    sunsetMarginMinutes: null,
    routeDistanceToCampMiles: null,
    fuelImpact: { value: null, unit: 'unknown', impact: 'unknown', confidence: 'unknown' },
    waterImpact: { value: null, unit: 'unknown', impact: 'unknown', confidence: 'unknown' },
    reliableWaterRefillAvailable: null,
    terrainSlopeEstimate: { value: null, unit: 'unknown', confidence: 'unknown', source: candidate.source },
    weatherExposure: 'unknown',
    fireRestrictionStatus: 'unknown',
    privacyLikelihood: 'unknown',
    occupancyLikelihood: 'unknown',
    lateArrivalRisk: 'unknown',
    dataConfidence: 'unknown',
    dataLimitations: ['CampOps route endpoint enrichment is missing for this sourced candidate.'],
  };
}

function nearestWindow(
  projection: CampOpsRouteProjection,
  windows: CampOpsRouteEndpointWindow[],
): CampOpsRouteEndpointWindow | null {
  if (windows.length === 0) return null;
  if (projection.routeMileMarker == null) return windows[0];
  let best = windows[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const window of windows) {
    const target = window.targetRouteMile;
    const distance = target == null ? 0 : Math.abs(target - projection.routeMileMarker);
    if (distance < bestDistance) {
      best = window;
      bestDistance = distance;
    }
  }
  return best;
}

function isVerifiedFirstPrimaryCandidate(
  candidate: CampCandidate,
  enrichment: CampCandidateEnrichment | undefined,
  hardGateEvaluation: CampHardGateCandidateEvaluation | undefined,
): boolean {
  if (!enrichment) return false;
  if (hardGateEvaluation?.status === 'rejected') return false;
  if (hardGateEvaluation?.failedGates?.length) return false;
  if (enrichment.legalStatus !== 'allowed' && enrichment.legalStatus !== 'likely_allowed') return false;
  if (enrichment.publicAccessStatus !== 'public') return false;
  if (enrichment.closureStatus && enrichment.closureStatus !== 'open') return false;
  if (!confidenceAtLeast(enrichment.legalConfidence, 'medium')) return false;
  if (!confidenceAtLeast(enrichment.dataConfidence, 'medium')) return false;
  if (!confidenceAtLeast(candidate.sourceConfidence, 'medium')) return false;
  if ((enrichment.sourceSignals ?? []).some((signal) => signal.isStale || signal.freshnessStatus === 'stale' || signal.freshnessStatus === 'expired')) {
    return false;
  }
  return true;
}

function sortEndpointBundles(a: EndpointCandidateBundle, b: EndpointCandidateBundle): number {
  const scoreA = normalizeCampOpsScore(a.candidate.score) ?? 0;
  const scoreB = normalizeCampOpsScore(b.candidate.score) ?? 0;
  if (scoreA !== scoreB) return scoreB - scoreA;
  const distanceA = a.projection.distanceFromRouteMiles ?? Number.POSITIVE_INFINITY;
  const distanceB = b.projection.distanceFromRouteMiles ?? Number.POSITIVE_INFINITY;
  const bandA = distanceA <= CAMP_OPS_ROUTE_ENDPOINT_PREFERRED_ROUTE_BAND_MILES ? 0 : 1;
  const bandB = distanceB <= CAMP_OPS_ROUTE_ENDPOINT_PREFERRED_ROUTE_BAND_MILES ? 0 : 1;
  if (bandA !== bandB) return bandA - bandB;
  return distanceA - distanceB;
}

function recommendationForWindow(args: {
  context: CampSearchContext;
  bundles: EndpointCandidateBundle[];
}): { set: CampRecommendationSet; hardGateEvaluationsByCandidateId: Record<string, CampHardGateCandidateEvaluation> } {
  if (args.bundles.length === 0) {
    return {
      set: createEmptyCampRecommendationSet('unknown'),
      hardGateEvaluationsByCandidateId: {},
    };
  }

  const candidates = args.bundles.map((bundle) => bundle.candidate);
  const enrichmentsByCandidateId = Object.fromEntries(
    args.bundles.map((bundle) => [bundle.candidate.id, bundle.enrichment]),
  );
  const evaluation = evaluateCampOpsRecommendations({
    context: args.context,
    candidates,
    enrichmentsByCandidateId,
    hardGateConfig: {},
    scoringConfig: {},
    recommendationConfig: {},
  });
  const hardGateEvaluationsByCandidateId = evaluation.hardGateEvaluationsByCandidateId;
  const normalizedEnrichments = evaluation.enrichmentsByCandidateId;
  const baseSet = evaluation.recommendationSet;
  const verifiedPrimary = (baseSet.rankedCandidates ?? candidates).find((candidate) =>
    isVerifiedFirstPrimaryCandidate(
      candidate,
      normalizedEnrichments[candidate.id],
      hardGateEvaluationsByCandidateId[candidate.id],
    ),
  ) ?? null;

  return {
    set: {
      ...baseSet,
      recommendedCamp: verifiedPrimary,
      warnings: verifiedPrimary
        ? baseSet.warnings
        : Array.from(new Set([
            ...baseSet.warnings,
            'No verified-first camp endpoint qualified as a primary recommendation for this overnight window.',
          ])),
    },
    hardGateEvaluationsByCandidateId,
  };
}

function roleForCandidate(candidate: CampCandidate, set: CampRecommendationSet): CampOpsRouteEndpointRole {
  if (set.recommendedCamp?.id === candidate.id) return 'primary';
  if (set.backupCamp?.id === candidate.id) return 'backup';
  if (set.emergencyCamp?.id === candidate.id) return 'emergency';
  return 'verify';
}

function routeEndpointMetadata(bundle: EndpointCandidateBundle): CampOpsRouteEndpointMetadata {
  const exactness =
    bundle.candidate.source === 'route_endpoint_candidate' ||
    bundle.candidate.source === 'route_candidate' ||
    bundle.candidate.source === 'draw_area_candidate'
      ? 'area_candidate'
      : bundle.candidate.existingRef
        ? 'known_site'
        : 'area_candidate';
  return {
    windowId: bundle.window.id,
    routeSide: bundle.projection.routeSide,
    routeMileMarker: bundle.projection.routeMileMarker,
    nearestSegmentIndex: bundle.projection.nearestSegmentIndex,
    distanceFromRouteMiles: bundle.projection.distanceFromRouteMiles,
    detourMiles: bundle.projection.distanceFromRouteMiles,
    exactness,
  };
}

function appendUnique(target: string[], values: Array<string | null | undefined>): string[] {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text && !target.includes(text)) target.push(text);
  }
  return target;
}

function collectSourceWarnings(candidate: CampCandidate, enrichment: CampCandidateEnrichment): string[] {
  const warnings: string[] = [];
  if (candidate.source === 'manual') {
    warnings.push(`Camp endpoint ${candidate.name || candidate.id} includes manual input; verify before use.`);
  }
  if (candidate.source === 'offline_dataset') {
    warnings.push(`Camp endpoint ${candidate.name || candidate.id} came from offline/cached data.`);
  }
  appendUnique(warnings, enrichment.dataLimitations ?? []);
  for (const signal of enrichment.sourceSignals ?? []) {
    if (signal.isStale || signal.freshnessStatus === 'stale') {
      warnings.push(`Camp endpoint ${candidate.name || candidate.id} has stale ${signal.source} source data.`);
    }
    if (signal.freshnessStatus === 'expired') {
      warnings.push(`Camp endpoint ${candidate.name || candidate.id} has expired ${signal.source} source data.`);
    }
    if (signal.cachedAt) {
      warnings.push(`Camp endpoint ${candidate.name || candidate.id} uses cached ${signal.source} data from ${signal.cachedAt}.`);
    }
    appendUnique(warnings, [signal.limitation]);
  }
  return warnings;
}

export function buildCampOpsRouteEndpointPlan(
  input: BuildCampOpsRouteEndpointPlanInput,
): CampOpsRouteCampEndpointPlan {
  const route = normalizeRouteCoordinates(input.routeCoordinates);
  const totalRouteMiles = finiteNumber(input.routeDistanceMiles) ?? routeDistanceMiles(route);
  const windows = buildEndpointWindows(input, totalRouteMiles);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const warnings: string[] = [];
  const context = normalizeContext(input);

  if (windows.length === 0) {
    return {
      routeId: input.routeId,
      tripId: input.tripId ?? null,
      generatedAt,
      windows,
      endpointCandidates: [],
      recommendationsByWindow: {},
      selectedEndpointIds: input.selectedEndpointIds ?? [],
      warnings,
    };
  }

  if (route.length < 2) {
    warnings.push('Camp Endpoints require route geometry; no route-corridor camp endpoints were generated.');
  }
  if (context.offlineMode === 'offline' || context.offlineMode === 'degraded') {
    warnings.push('Camp Endpoint planning is using degraded/offline data; stale, cached, manual, and missing data labels remain required.');
  }

  const bundles = (input.candidates ?? [])
    .map((candidate) => {
      const projection = projectCampPointToRoute(candidate.location, route);
      const window = nearestWindow(projection, windows);
      if (!window) return null;
      if (
        projection.distanceFromRouteMiles == null ||
        projection.distanceFromRouteMiles > window.searchCorridorMiles
      ) {
        return null;
      }
      const enrichment =
        input.enrichmentsByCandidateId?.[candidate.id] ?? placeholderEnrichment(candidate);
      return {
        candidate,
        enrichment,
        projection,
        window,
      };
    })
    .filter((bundle): bundle is EndpointCandidateBundle => !!bundle)
    .sort(sortEndpointBundles);

  const recommendationsByWindow: Record<string, CampRecommendationSet> = {};
  const hardGateEvaluationsByCandidateId: Record<string, CampHardGateCandidateEvaluation> = {};
  const endpointCandidates: CampOpsRouteCampEndpointPlan['endpointCandidates'] = [];

  for (const window of windows) {
    const windowBundles = bundles.filter((bundle) => bundle.window.id === window.id);
    const recommendation = recommendationForWindow({
      context: {
        ...context,
        routeProgress: {
          ...(context.routeProgress ?? {}),
          routeMileMarker: window.targetRouteMile,
          source: 'route_endpoint_candidate',
          confidence: 'medium',
        },
      },
      bundles: windowBundles,
    });
    recommendationsByWindow[window.id] = recommendation.set;
    Object.assign(hardGateEvaluationsByCandidateId, recommendation.hardGateEvaluationsByCandidateId);
    if (windowBundles.length === 0) {
      warnings.push(`No sourced camp endpoint candidates were available for planned night ${window.nightIndex + 1}; ECS did not create a centerline pseudo-camp.`);
    }
    appendUnique(warnings, recommendation.set.warnings);
  }

  for (const bundle of bundles) {
    const set = recommendationsByWindow[bundle.window.id] ?? createEmptyCampRecommendationSet('unknown');
    endpointCandidates.push({
      candidate: bundle.candidate,
      enrichment: bundle.enrichment,
      routeEndpoint: routeEndpointMetadata(bundle),
      role: roleForCandidate(bundle.candidate, set),
    });
    appendUnique(warnings, collectSourceWarnings(bundle.candidate, bundle.enrichment));
  }

  return {
    routeId: input.routeId,
    tripId: input.tripId ?? null,
    generatedAt,
    windows,
    endpointCandidates,
    recommendationsByWindow,
    selectedEndpointIds: input.selectedEndpointIds ?? [],
    warnings,
  };
}
