/**
 * Canonical guidance geometry contract.
 *
 * Raw GPS and recorded breadcrumbs remain unsnapped observations owned by their
 * respective stores. This module only derives: the accepted position on the
 * canonical planned route, completed canonical geometry, and remaining
 * canonical geometry. It never mutates or inserts the raw position into the
 * route line.
 *
 * ECS route bounds currently do not support antimeridian-spanning geometry;
 * callers must treat such routes as outside the supported route scope.
 */

export type GuidanceRouteCoordinate = {
  lat: number;
  lng: number;
};

export type GuidanceRouteContext = 'road' | 'trail' | 'imported' | 'offline';
export type GuidanceRouteProjectionStatus = 'snapped' | 'off_route' | 'degraded';

export type GuidanceRouteProjection = {
  coordinate: GuidanceRouteCoordinate;
  segmentIndex: number;
  segmentFraction: number;
  distanceFromPositionM: number;
  distanceFromRouteStartM: number;
  segmentBearingDeg: number | null;
  continuityScore: number;
};

export type GuidanceRouteDistanceIndex = {
  geometry: GuidanceRouteCoordinate[];
  cumulativeDistancesM: number[];
  totalDistanceM: number;
  invalidPointCount: number;
};

export type GuidanceRouteProgressResult = {
  status: GuidanceRouteProjectionStatus;
  rawPosition: GuidanceRouteCoordinate;
  geometry: GuidanceRouteCoordinate[];
  invalidPointCount: number;
  routeLengthM: number;
  routeDistanceM: number;
  remainingDistanceM: number;
  offRouteDistanceM: number;
  toleranceM: number;
  nearestProjection: GuidanceRouteProjection | null;
  progressProjection: GuidanceRouteProjection | null;
  snappedPosition: GuidanceRouteCoordinate | null;
  completedGeometry: GuidanceRouteCoordinate[];
  remainingGeometry: GuidanceRouteCoordinate[];
};

export type ResolveGuidanceRouteProgressInput = {
  rawPosition: GuidanceRouteCoordinate;
  routeGeometry: GuidanceRouteCoordinate[];
  context: GuidanceRouteContext;
  accuracyM?: number | null;
  headingDeg?: number | null;
  speedMps?: number | null;
  elapsedMs?: number | null;
  previousProjection?: GuidanceRouteProjection | null;
  allowBacktracking?: boolean;
  snapToleranceM?: number | null;
};

const EARTH_RADIUS_M = 6371000;
const DUPLICATE_EPSILON_M = 0.05;
const ORDINARY_BACKTRACK_TOLERANCE_M = 18;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isValidCoordinate(
  point: GuidanceRouteCoordinate | null | undefined,
): point is GuidanceRouteCoordinate {
  return !!point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180;
}

function normalizeHeading(value: number): number {
  return ((value % 360) + 360) % 360;
}

function headingDeltaDegrees(a: number, b: number): number {
  const delta = Math.abs(normalizeHeading(a) - normalizeHeading(b));
  return delta > 180 ? 360 - delta : delta;
}

export function guidanceRouteDistanceMeters(
  a: GuidanceRouteCoordinate,
  b: GuidanceRouteCoordinate,
): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/**
 * Keeps canonical route geometry intact while orienting it from a confirmed
 * start/trailhead. The caller remains responsible for validating the route;
 * this helper only chooses which existing endpoint is the start.
 */
export function orientGuidanceRouteFromStart<T extends GuidanceRouteCoordinate>(
  routeGeometry: T[],
  preferredStart: GuidanceRouteCoordinate | null | undefined,
): T[] {
  const geometry = Array.isArray(routeGeometry) ? routeGeometry.slice() : [];
  if (
    geometry.length < 2 ||
    !isValidCoordinate(preferredStart) ||
    !isValidCoordinate(geometry[0]) ||
    !isValidCoordinate(geometry[geometry.length - 1])
  ) {
    return geometry;
  }

  const firstDistanceM = guidanceRouteDistanceMeters(preferredStart, geometry[0]);
  const lastDistanceM = guidanceRouteDistanceMeters(
    preferredStart,
    geometry[geometry.length - 1],
  );
  return lastDistanceM < firstDistanceM ? geometry.reverse() : geometry;
}

export function buildGuidanceRouteDistanceIndex(
  routeGeometry: GuidanceRouteCoordinate[],
): GuidanceRouteDistanceIndex {
  const geometry: GuidanceRouteCoordinate[] = [];
  let invalidPointCount = 0;

  for (const candidate of Array.isArray(routeGeometry) ? routeGeometry : []) {
    if (!isValidCoordinate(candidate)) {
      invalidPointCount += 1;
      continue;
    }
    const point = { lat: candidate.lat, lng: candidate.lng };
    const previous = geometry[geometry.length - 1];
    if (previous && guidanceRouteDistanceMeters(previous, point) <= DUPLICATE_EPSILON_M) {
      continue;
    }
    geometry.push(point);
  }

  const cumulativeDistancesM = [0];
  for (let index = 1; index < geometry.length; index += 1) {
    cumulativeDistancesM[index] =
      cumulativeDistancesM[index - 1] +
      guidanceRouteDistanceMeters(geometry[index - 1], geometry[index]);
  }

  return {
    geometry,
    cumulativeDistancesM,
    totalDistanceM: cumulativeDistancesM[cumulativeDistancesM.length - 1] ?? 0,
    invalidPointCount,
  };
}

function segmentBearingDegrees(
  start: GuidanceRouteCoordinate,
  end: GuidanceRouteCoordinate,
): number | null {
  const referenceLat = ((start.lat + end.lat) / 2) * (Math.PI / 180);
  const east = (end.lng - start.lng) * Math.cos(referenceLat);
  const north = end.lat - start.lat;
  if (Math.abs(east) < 1e-12 && Math.abs(north) < 1e-12) return null;
  return normalizeHeading((Math.atan2(east, north) * 180) / Math.PI);
}

export function projectPointToGuidanceSegment(input: {
  position: GuidanceRouteCoordinate;
  segmentStart: GuidanceRouteCoordinate;
  segmentEnd: GuidanceRouteCoordinate;
  segmentIndex: number;
  distanceFromRouteStartM: number;
}): GuidanceRouteProjection {
  const { position, segmentStart, segmentEnd } = input;
  const referenceLat = ((position.lat + segmentStart.lat + segmentEnd.lat) / 3) * (Math.PI / 180);
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = Math.max(1, 111320 * Math.cos(referenceLat));
  const segmentX = (segmentEnd.lng - segmentStart.lng) * metersPerDegreeLng;
  const segmentY = (segmentEnd.lat - segmentStart.lat) * metersPerDegreeLat;
  const positionX = (position.lng - segmentStart.lng) * metersPerDegreeLng;
  const positionY = (position.lat - segmentStart.lat) * metersPerDegreeLat;
  const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
  const segmentFraction = segmentLengthSquared > 0
    ? clamp((positionX * segmentX + positionY * segmentY) / segmentLengthSquared, 0, 1)
    : 0;
  const projectedX = segmentX * segmentFraction;
  const projectedY = segmentY * segmentFraction;
  const coordinate = {
    lat: segmentStart.lat + (segmentEnd.lat - segmentStart.lat) * segmentFraction,
    lng: segmentStart.lng + (segmentEnd.lng - segmentStart.lng) * segmentFraction,
  };

  return {
    coordinate,
    segmentIndex: input.segmentIndex,
    segmentFraction,
    distanceFromPositionM: Math.hypot(positionX - projectedX, positionY - projectedY),
    distanceFromRouteStartM:
      input.distanceFromRouteStartM + guidanceRouteDistanceMeters(segmentStart, coordinate),
    segmentBearingDeg: segmentBearingDegrees(segmentStart, segmentEnd),
    continuityScore: 0,
  };
}

function resolvePlausibleForwardDistanceM(input: {
  elapsedMs?: number | null;
  speedMps?: number | null;
  accuracyM?: number | null;
}): number {
  const elapsedSeconds = clamp((finiteNumber(input.elapsedMs) ?? 0) / 1000, 0, 120);
  const speedMps = clamp(finiteNumber(input.speedMps) ?? 0, 0, 70);
  const accuracyM = clamp(finiteNumber(input.accuracyM) ?? 10, 0, 100);
  return Math.max(75, speedMps * elapsedSeconds * 3 + accuracyM * 2 + 25);
}

export function scoreGuidanceProjectionContinuity(input: {
  candidate: GuidanceRouteProjection;
  previousProjection?: GuidanceRouteProjection | null;
  headingDeg?: number | null;
  elapsedMs?: number | null;
  speedMps?: number | null;
  accuracyM?: number | null;
  allowBacktracking?: boolean;
}): number {
  const headingDeg = finiteNumber(input.headingDeg);
  let score = input.candidate.distanceFromPositionM;

  if (headingDeg != null && input.candidate.segmentBearingDeg != null) {
    const headingDelta = headingDeltaDegrees(headingDeg, input.candidate.segmentBearingDeg);
    if (headingDelta > 50) score += (headingDelta - 50) * 0.3;
  }

  const previous = input.previousProjection;
  if (!previous) return score;

  const routeDeltaM = input.candidate.distanceFromRouteStartM - previous.distanceFromRouteStartM;
  const plausibleForwardM = resolvePlausibleForwardDistanceM(input);
  const segmentDelta = Math.abs(input.candidate.segmentIndex - previous.segmentIndex);
  score += Math.min(segmentDelta * 1.5, 30);

  if (routeDeltaM < -ORDINARY_BACKTRACK_TOLERANCE_M && !input.allowBacktracking) {
    score += 1000 + Math.abs(routeDeltaM) * 4;
  } else if (routeDeltaM > plausibleForwardM) {
    score += (routeDeltaM - plausibleForwardM) * 2;
  } else {
    score += Math.abs(routeDeltaM) * 0.01;
  }

  return score;
}

function enumerateRouteProjections(
  position: GuidanceRouteCoordinate,
  routeIndex: GuidanceRouteDistanceIndex,
): GuidanceRouteProjection[] {
  const candidates: GuidanceRouteProjection[] = [];
  for (let segmentIndex = 0; segmentIndex < routeIndex.geometry.length - 1; segmentIndex += 1) {
    candidates.push(projectPointToGuidanceSegment({
      position,
      segmentStart: routeIndex.geometry[segmentIndex],
      segmentEnd: routeIndex.geometry[segmentIndex + 1],
      segmentIndex,
      distanceFromRouteStartM: routeIndex.cumulativeDistancesM[segmentIndex] ?? 0,
    }));
  }
  return candidates;
}

export function findNearestPlausibleRouteProjection(input: {
  position: GuidanceRouteCoordinate;
  routeIndex: GuidanceRouteDistanceIndex;
  previousProjection?: GuidanceRouteProjection | null;
  headingDeg?: number | null;
  accuracyM?: number | null;
  elapsedMs?: number | null;
  speedMps?: number | null;
  allowBacktracking?: boolean;
}): GuidanceRouteProjection | null {
  const candidates = enumerateRouteProjections(input.position, input.routeIndex);
  if (candidates.length === 0) return null;

  const nearestDistanceM = Math.min(...candidates.map((candidate) => candidate.distanceFromPositionM));
  const lateralSlackM = nearestDistanceM <= 1
    ? clamp((finiteNumber(input.accuracyM) ?? 10) * 0.2, 1, 3)
    : clamp((finiteNumber(input.accuracyM) ?? 10) * 0.6, 12, 40);
  const continuitySearchRadiusM = clamp(
    Math.max(35, (finiteNumber(input.accuracyM) ?? 10) + 20),
    35,
    95,
  );
  const plausibleCandidates = candidates.filter(
    (candidate) =>
      candidate.distanceFromPositionM <= nearestDistanceM + lateralSlackM ||
      (!!input.previousProjection &&
        candidate.distanceFromPositionM <= continuitySearchRadiusM &&
        Math.abs(candidate.segmentIndex - input.previousProjection.segmentIndex) <= 2),
  );

  const scored = plausibleCandidates.map((candidate) => {
    const continuityScore = scoreGuidanceProjectionContinuity({
      candidate,
      previousProjection: input.previousProjection,
      headingDeg: input.headingDeg,
      elapsedMs: input.elapsedMs,
      speedMps: input.speedMps,
      accuracyM: input.accuracyM,
      allowBacktracking: input.allowBacktracking,
    });
    return { ...candidate, continuityScore };
  });

  scored.sort((left, right) =>
    left.continuityScore - right.continuityScore ||
    left.distanceFromPositionM - right.distanceFromPositionM ||
    left.segmentIndex - right.segmentIndex ||
    left.segmentFraction - right.segmentFraction,
  );
  return scored[0] ?? null;
}

export function getGuidanceRouteDistanceAtProjection(
  projection: GuidanceRouteProjection | null | undefined,
): number {
  return projection?.distanceFromRouteStartM ?? 0;
}

export function getGuidanceOffRouteDistanceMeters(
  projection: GuidanceRouteProjection | null | undefined,
): number {
  return projection?.distanceFromPositionM ?? Infinity;
}

function sameCoordinate(a: GuidanceRouteCoordinate, b: GuidanceRouteCoordinate): boolean {
  return guidanceRouteDistanceMeters(a, b) <= DUPLICATE_EPSILON_M;
}

function appendIfDistinct(
  target: GuidanceRouteCoordinate[],
  coordinate: GuidanceRouteCoordinate,
): void {
  const previous = target[target.length - 1];
  if (!previous || !sameCoordinate(previous, coordinate)) target.push(coordinate);
}

export function splitGuidanceRouteAtProjection(
  geometry: GuidanceRouteCoordinate[],
  projection: GuidanceRouteProjection | null | undefined,
): { completed: GuidanceRouteCoordinate[]; remaining: GuidanceRouteCoordinate[] } {
  if (!projection || geometry.length < 2) {
    return { completed: [], remaining: geometry.slice() };
  }

  const segmentIndex = clamp(projection.segmentIndex, 0, geometry.length - 2);
  const completed = geometry.slice(0, segmentIndex + 1);
  appendIfDistinct(completed, projection.coordinate);
  const remaining: GuidanceRouteCoordinate[] = [projection.coordinate];
  for (const point of geometry.slice(segmentIndex + 1)) appendIfDistinct(remaining, point);
  return { completed, remaining };
}

export function projectGuidanceRouteAtDistance(
  routeIndex: GuidanceRouteDistanceIndex,
  routeDistanceM: number,
): GuidanceRouteProjection | null {
  if (routeIndex.geometry.length < 2) return null;
  const targetDistanceM = clamp(routeDistanceM, 0, routeIndex.totalDistanceM);
  let segmentIndex = routeIndex.geometry.length - 2;

  for (let index = 0; index < routeIndex.geometry.length - 1; index += 1) {
    const segmentEndM = routeIndex.cumulativeDistancesM[index + 1] ?? routeIndex.totalDistanceM;
    if (targetDistanceM <= segmentEndM || index === routeIndex.geometry.length - 2) {
      segmentIndex = index;
      break;
    }
  }

  const start = routeIndex.geometry[segmentIndex];
  const end = routeIndex.geometry[segmentIndex + 1];
  const segmentStartM = routeIndex.cumulativeDistancesM[segmentIndex] ?? 0;
  const segmentEndM = routeIndex.cumulativeDistancesM[segmentIndex + 1] ?? segmentStartM;
  const segmentLengthM = Math.max(0, segmentEndM - segmentStartM);
  const segmentFraction = segmentLengthM > 0
    ? clamp((targetDistanceM - segmentStartM) / segmentLengthM, 0, 1)
    : 0;
  return {
    coordinate: {
      lat: start.lat + (end.lat - start.lat) * segmentFraction,
      lng: start.lng + (end.lng - start.lng) * segmentFraction,
    },
    segmentIndex,
    segmentFraction,
    distanceFromPositionM: 0,
    distanceFromRouteStartM: targetDistanceM,
    segmentBearingDeg: segmentBearingDegrees(start, end),
    continuityScore: 0,
  };
}

export function resolveGuidanceSnapToleranceMeters(input: {
  context: GuidanceRouteContext;
  accuracyM?: number | null;
}): number {
  const baseM =
    input.context === 'trail' || input.context === 'imported'
      ? 60
      : 35;
  const maxM =
    input.context === 'trail' || input.context === 'imported'
      ? 95
      : 60;
  const accuracyM = clamp(finiteNumber(input.accuracyM) ?? 0, 0, 200);
  return Math.min(maxM, baseM + clamp(accuracyM * 0.5, 0, maxM - baseM));
}

export function resolveGuidanceRouteProgress(
  input: ResolveGuidanceRouteProgressInput,
): GuidanceRouteProgressResult {
  const rawPosition = { lat: input.rawPosition.lat, lng: input.rawPosition.lng };
  const routeIndex = buildGuidanceRouteDistanceIndex(input.routeGeometry);
  const explicitToleranceM = finiteNumber(input.snapToleranceM);
  const toleranceM = explicitToleranceM == null
    ? resolveGuidanceSnapToleranceMeters(input)
    : clamp(explicitToleranceM, 0, 95);

  if (!isValidCoordinate(rawPosition) || routeIndex.geometry.length < 2) {
    return {
      status: 'degraded',
      rawPosition,
      geometry: routeIndex.geometry,
      invalidPointCount: routeIndex.invalidPointCount,
      routeLengthM: routeIndex.totalDistanceM,
      routeDistanceM: 0,
      remainingDistanceM: routeIndex.totalDistanceM,
      offRouteDistanceM: Infinity,
      toleranceM,
      nearestProjection: null,
      progressProjection: null,
      snappedPosition: null,
      completedGeometry: [],
      remainingGeometry: routeIndex.geometry.slice(),
    };
  }

  const nearestProjection = findNearestPlausibleRouteProjection({
    position: rawPosition,
    routeIndex,
    previousProjection: input.previousProjection,
    headingDeg: input.headingDeg,
    accuracyM: input.accuracyM,
    elapsedMs: input.elapsedMs,
    speedMps: input.speedMps,
    allowBacktracking: input.allowBacktracking,
  });
  const offRouteDistanceM = getGuidanceOffRouteDistanceMeters(nearestProjection);
  const isOffRoute = offRouteDistanceM > toleranceM;

  let acceptedRouteDistanceM: number | null = nearestProjection?.distanceFromRouteStartM ?? null;
  const previousDistanceM = input.previousProjection?.distanceFromRouteStartM ?? null;
  if (isOffRoute) {
    acceptedRouteDistanceM = previousDistanceM;
  } else if (
    acceptedRouteDistanceM != null &&
    previousDistanceM != null &&
    !input.allowBacktracking &&
    acceptedRouteDistanceM < previousDistanceM - ORDINARY_BACKTRACK_TOLERANCE_M
  ) {
    acceptedRouteDistanceM = previousDistanceM;
  }

  const progressProjection = acceptedRouteDistanceM == null
    ? null
    : projectGuidanceRouteAtDistance(routeIndex, acceptedRouteDistanceM);
  const split = splitGuidanceRouteAtProjection(routeIndex.geometry, progressProjection);
  const status: GuidanceRouteProjectionStatus = isOffRoute
    ? 'off_route'
    : routeIndex.invalidPointCount > 0
      ? 'degraded'
      : 'snapped';
  const routeDistanceM = progressProjection?.distanceFromRouteStartM ?? 0;

  return {
    status,
    rawPosition,
    geometry: routeIndex.geometry,
    invalidPointCount: routeIndex.invalidPointCount,
    routeLengthM: routeIndex.totalDistanceM,
    routeDistanceM,
    remainingDistanceM: Math.max(0, routeIndex.totalDistanceM - routeDistanceM),
    offRouteDistanceM,
    toleranceM,
    nearestProjection,
    progressProjection,
    snappedPosition: isOffRoute ? null : progressProjection?.coordinate ?? null,
    completedGeometry: split.completed,
    remainingGeometry: split.remaining,
  };
}
