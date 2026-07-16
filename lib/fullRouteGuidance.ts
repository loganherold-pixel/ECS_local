import type { RoadNavCoordinate } from './mapboxRoadNavigation';
import {
  buildTrailCumulativeDistances,
  computeTrailToleranceM,
  projectOnTrailGeometry,
  trailDistanceMeters,
  type TrailGuidanceLocation,
} from './trailGuidanceEngine';

export type FullRouteGuidancePhase = 'approach' | 'trail' | 'transition' | 'arrived';
export type FullRouteGuidanceStatus = 'ready' | 'blocked_gap' | 'degraded' | 'unavailable';
export type FullRouteGuidanceStartSource = 'road_approach' | 'gps_on_trail' | 'trail_guidance' | 'unknown';

export interface FullRouteGuidanceInput {
  phase: FullRouteGuidancePhase;
  currentLocation?: RoadNavCoordinate | null;
  roadRoutePoints?: RoadNavCoordinate[] | null;
  roadProgressPoints?: RoadNavCoordinate[] | null;
  roadDistanceM?: number | null;
  roadRemainingDistanceM?: number | null;
  trailGeometry?: RoadNavCoordinate[] | null;
  trailProgressPoints?: RoadNavCoordinate[] | null;
  trailDistanceM?: number | null;
  trailRemainingDistanceM?: number | null;
  trailProgressPercent?: number | null;
  trailStartJoinMaxMeters?: number | null;
  trailStartDedupeMeters?: number | null;
}

export interface FullRouteGuidanceModel {
  status: FullRouteGuidanceStatus;
  phase: FullRouteGuidancePhase;
  startSource: FullRouteGuidanceStartSource;
  routePoints: RoadNavCoordinate[];
  progressPoints: RoadNavCoordinate[];
  remainingDistanceM: number | null;
  progressPercent: number | null;
  transitionRouteIndex: number | null;
  trailStartIndex: number;
  finalEndpoint: RoadNavCoordinate | null;
  roadTrailJoinDistanceM: number | null;
  blockedReason: string | null;
}

const DEFAULT_TRAIL_START_JOIN_MAX_METERS = 120;
const DEFAULT_TRAIL_START_DEDUPE_METERS = 30;

function finitePositive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function isValidCoordinate(value: RoadNavCoordinate | null | undefined): value is RoadNavCoordinate {
  return (
    !!value &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    Math.abs(value.lat) <= 90 &&
    Math.abs(value.lng) <= 180
  );
}

function normalizePoints(points: RoadNavCoordinate[] | null | undefined): RoadNavCoordinate[] {
  if (!Array.isArray(points)) return [];
  if (points.some((point) => !isValidCoordinate(point))) return [];
  const normalized: RoadNavCoordinate[] = [];
  points.forEach((point) => {
    if (!isValidCoordinate(point)) return;
    const previous = normalized[normalized.length - 1];
    if (previous && trailDistanceMeters(previous, point) <= 1) return;
    normalized.push(point);
  });
  return normalized;
}

function pathDistanceMeters(points: RoadNavCoordinate[]): number | null {
  if (points.length < 2) return null;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += trailDistanceMeters(points[index - 1], points[index]);
  }
  return total;
}

function progressPercent(totalDistanceM: number | null, remainingDistanceM: number | null): number | null {
  if (!totalDistanceM || totalDistanceM <= 0 || remainingDistanceM == null) return null;
  return Math.max(0, Math.min(100, (1 - remainingDistanceM / totalDistanceM) * 100));
}

function findForwardTrailIndex(cumulativeDistances: number[], traveledDistanceM: number): number {
  const targetDistance = Math.max(0, traveledDistanceM);
  for (let index = 0; index < cumulativeDistances.length; index += 1) {
    if (cumulativeDistances[index] >= targetDistance - 1) {
      return index;
    }
  }
  return Math.max(0, cumulativeDistances.length - 1);
}

function resolveAlreadyOnTrail(
  currentLocation: RoadNavCoordinate | null,
  trailGeometry: RoadNavCoordinate[],
): {
  routePoints: RoadNavCoordinate[];
  progressPoints: RoadNavCoordinate[];
  trailStartIndex: number;
  remainingDistanceM: number | null;
} | null {
  if (!currentLocation || trailGeometry.length < 2) return null;
  const location: TrailGuidanceLocation = { lat: currentLocation.lat, lng: currentLocation.lng };
  const cumulative = buildTrailCumulativeDistances(trailGeometry);
  const projection = projectOnTrailGeometry(location, trailGeometry, cumulative);
  const toleranceM = computeTrailToleranceM(null);
  if (projection.distanceFromRouteM > toleranceM) return null;
  const forwardTrailIndex = findForwardTrailIndex(cumulative, projection.traveledDistanceM);

  return {
    routePoints: trailGeometry,
    progressPoints: projection.progressCoords,
    trailStartIndex: forwardTrailIndex,
    remainingDistanceM: projection.remainingDistanceM,
  };
}

export function buildFullRouteGuidanceModel(input: FullRouteGuidanceInput): FullRouteGuidanceModel {
  const hasInvalidCanonicalGeometry =
    (Array.isArray(input.trailGeometry) && input.trailGeometry.some((point) => !isValidCoordinate(point))) ||
    (Array.isArray(input.roadRoutePoints) && input.roadRoutePoints.some((point) => !isValidCoordinate(point)));
  const trailGeometry = normalizePoints(input.trailGeometry);
  const roadRoutePoints = normalizePoints(input.roadRoutePoints);
  const roadProgressPoints = normalizePoints(input.roadProgressPoints);
  const trailProgressPoints = normalizePoints(input.trailProgressPoints);
  const currentLocation = isValidCoordinate(input.currentLocation) ? input.currentLocation : null;
  const finalEndpoint = trailGeometry[trailGeometry.length - 1] ?? roadRoutePoints[roadRoutePoints.length - 1] ?? null;
  const trailDistanceM = finitePositive(input.trailDistanceM) ?? pathDistanceMeters(trailGeometry);
  const roadDistanceM = finitePositive(input.roadDistanceM) ?? pathDistanceMeters(roadRoutePoints);
  const trailRemainingFromInput = finiteNonNegative(input.trailRemainingDistanceM);
  const roadRemainingM = finiteNonNegative(input.roadRemainingDistanceM);
  const trailStartJoinMaxMeters = Math.max(
    0,
    finitePositive(input.trailStartJoinMaxMeters) ?? DEFAULT_TRAIL_START_JOIN_MAX_METERS,
  );
  const trailStartDedupeMeters = Math.max(
    0,
    finitePositive(input.trailStartDedupeMeters) ?? DEFAULT_TRAIL_START_DEDUPE_METERS,
  );

  if (hasInvalidCanonicalGeometry) {
    return {
      status: 'degraded',
      phase: input.phase,
      startSource: 'unknown',
      routePoints: [],
      progressPoints: [],
      remainingDistanceM: null,
      progressPercent: null,
      transitionRouteIndex: null,
      trailStartIndex: 0,
      finalEndpoint: null,
      roadTrailJoinDistanceM: null,
      blockedReason: 'Full route guidance is degraded because canonical geometry is malformed.',
    };
  }

  if (trailGeometry.length < 2) {
    return {
      status: roadRoutePoints.length > 1 ? 'ready' : 'unavailable',
      phase: input.phase,
      startSource: roadRoutePoints.length > 1 ? 'road_approach' : 'unknown',
      routePoints: roadRoutePoints,
      progressPoints: roadProgressPoints,
      remainingDistanceM: roadRemainingM,
      progressPercent: progressPercent(roadDistanceM, roadRemainingM),
      transitionRouteIndex: null,
      trailStartIndex: 0,
      finalEndpoint,
      roadTrailJoinDistanceM: null,
      blockedReason: roadRoutePoints.length > 1 ? null : 'Full route guidance requires trail geometry.',
    };
  }

  const alreadyOnTrail = resolveAlreadyOnTrail(currentLocation, trailGeometry);
  if (
    alreadyOnTrail &&
    (input.phase === 'approach' || input.phase === 'trail' || input.phase === 'transition')
  ) {
    const remainingDistanceM = trailRemainingFromInput ?? alreadyOnTrail.remainingDistanceM;
    return {
      status: 'ready',
      phase: 'trail',
      startSource: 'gps_on_trail',
      routePoints: alreadyOnTrail.routePoints,
      progressPoints: trailProgressPoints.length > 1 ? trailProgressPoints : alreadyOnTrail.progressPoints,
      remainingDistanceM,
      progressPercent: input.trailProgressPercent ?? progressPercent(trailDistanceM, remainingDistanceM),
      transitionRouteIndex: 0,
      trailStartIndex: alreadyOnTrail.trailStartIndex,
      finalEndpoint: trailGeometry[trailGeometry.length - 1],
      roadTrailJoinDistanceM: null,
      blockedReason: null,
    };
  }

  if (input.phase === 'trail' || input.phase === 'transition' || input.phase === 'arrived') {
    const remainingDistanceM = trailRemainingFromInput;
    return {
      status: 'ready',
      phase: input.phase,
      startSource: 'trail_guidance',
      routePoints: trailGeometry,
      progressPoints: trailProgressPoints,
      remainingDistanceM,
      progressPercent: input.trailProgressPercent ?? progressPercent(trailDistanceM, remainingDistanceM),
      transitionRouteIndex: 0,
      trailStartIndex: 0,
      finalEndpoint: trailGeometry[trailGeometry.length - 1],
      roadTrailJoinDistanceM: null,
      blockedReason: null,
    };
  }

  if (roadRoutePoints.length < 2) {
    return {
      status: 'unavailable',
      phase: input.phase,
      startSource: 'unknown',
      routePoints: [],
      progressPoints: [],
      remainingDistanceM: null,
      progressPercent: null,
      transitionRouteIndex: null,
      trailStartIndex: 0,
      finalEndpoint: trailGeometry[trailGeometry.length - 1],
      roadTrailJoinDistanceM: null,
      blockedReason: 'Full route guidance requires road approach geometry or an on-trail GPS start.',
    };
  }

  const roadEnd = roadRoutePoints[roadRoutePoints.length - 1];
  const trailStart = trailGeometry[0];
  const roadTrailJoinDistanceM = trailDistanceMeters(roadEnd, trailStart);
  if (
    roadTrailJoinDistanceM > trailStartJoinMaxMeters ||
    roadTrailJoinDistanceM > trailStartDedupeMeters
  ) {
    return {
      status: 'blocked_gap',
      phase: input.phase,
      startSource: 'road_approach',
      routePoints: roadRoutePoints,
      progressPoints: roadProgressPoints,
      remainingDistanceM: roadRemainingM,
      progressPercent: progressPercent(roadDistanceM, roadRemainingM),
      transitionRouteIndex: null,
      trailStartIndex: 0,
      finalEndpoint: trailGeometry[trailGeometry.length - 1],
      roadTrailJoinDistanceM,
      blockedReason:
        'Full route guidance is blocked because the approach route does not meet the trail start on a canonical connector.',
    };
  }

  const dedupeTrailStart = roadTrailJoinDistanceM <= trailStartDedupeMeters;
  const routePoints = dedupeTrailStart
    ? [...roadRoutePoints, ...trailGeometry.slice(1)]
    : [...roadRoutePoints, ...trailGeometry];
  const transitionRouteIndex = roadRoutePoints.length - 1;
  const remainingDistanceM =
    roadRemainingM != null || trailRemainingFromInput != null
      ? (roadRemainingM ?? 0) + (trailRemainingFromInput ?? 0)
      : null;
  const totalDistanceM =
    roadDistanceM != null || trailDistanceM != null
      ? (roadDistanceM ?? 0) + (trailDistanceM ?? 0)
      : pathDistanceMeters(routePoints);

  return {
    status: 'ready',
    phase: input.phase,
    startSource: 'road_approach',
    routePoints,
    progressPoints: roadProgressPoints,
    remainingDistanceM,
    progressPercent: progressPercent(totalDistanceM, remainingDistanceM),
    transitionRouteIndex,
    trailStartIndex: 0,
    finalEndpoint: trailGeometry[trailGeometry.length - 1],
    roadTrailJoinDistanceM,
    blockedReason: null,
  };
}
