import type {
  EcsGuidanceCoordinate,
  EcsGuidanceRoute,
  EcsGuidanceStep,
} from './ecsGuidanceModel';
import {
  buildGuidanceRouteDistanceIndex,
  findNearestPlausibleRouteProjection,
  resolveGuidanceRouteProgress,
  type GuidanceRouteProjection,
  type GuidanceRouteProjectionStatus,
  type ResolveGuidanceRouteProgressInput,
} from './guidanceRouteProjection';

export type EcsActiveGuidanceConfidence = 'high' | 'medium' | 'low';
export type EcsActiveGuidanceOffRouteStatus =
  | 'on_route'
  | 'off_route_candidate'
  | 'off_route_confirmed'
  | 'rerouting'
  | 'reroute_failed'
  | 'reroute_applied';

export interface EcsActiveGuidanceProgress {
  routeId: string;
  routeVersion?: string;
  rerouteGeneration: number;
  currentLegIndex: number;
  currentStepIndex: number;
  distanceToNextManeuverMeters: number | null;
  distanceRemainingMeters: number;
  durationRemainingSeconds: number | null;
  currentInstruction: string;
  currentRoadName: string;
  nextInstruction?: string;
  offRouteCandidate: boolean;
  offRouteStatus: EcsActiveGuidanceOffRouteStatus;
  offRouteUpdateCount: number;
  offRouteThresholdMeters: number;
  gpsAccuracyMeters: number | null;
  headingDivergenceDegrees: number | null;
  confidence: EcsActiveGuidanceConfidence;
  updatedAt: string;
  distanceFromRouteMeters: number;
  distanceRemainingOnCurrentStepMeters: number | null;
  nearestRoutePoint: EcsProjectedGuidancePoint | null;
  progressRoutePoint: EcsProjectedGuidancePoint | null;
  nearestStepPoint: EcsProjectedGuidancePoint | null;
  routeDistanceFromStartMeters: number;
  projectionStatus: GuidanceRouteProjectionStatus;
  completedRouteGeometry: EcsGuidanceCoordinate[];
  remainingRouteGeometry: EcsGuidanceCoordinate[];
  currentStep?: EcsGuidanceStep;
  nextStep?: EcsGuidanceStep;
  followingStep?: EcsGuidanceStep;
  upcomingSteps: EcsGuidanceStep[];
  pendingStepJumpIndex?: number;
  pendingStepJumpCount?: number;
  pendingBacktrackCount?: number;
  pendingBacktrackDistanceMeters?: number;
}

export interface ResolveEcsActiveGuidanceProgressInput {
  currentCoordinate: EcsGuidanceCoordinate | { latitude: number; longitude: number };
  currentSpeedMetersPerSecond?: number | null;
  currentHeadingDegrees?: number | null;
  currentGpsAccuracyMeters?: number | null;
  activeRoute: EcsGuidanceRoute;
  previousProgress?: EcsActiveGuidanceProgress | null;
  rerouteStatus?: Extract<
    EcsActiveGuidanceOffRouteStatus,
    'rerouting' | 'reroute_failed' | 'reroute_applied'
  > | null;
  updatedAt?: string;
  thresholds?: Partial<EcsActiveGuidanceThresholds>;
  allowBacktracking?: boolean;
}

export interface EcsActiveGuidanceThresholds {
  roadManeuverCompletionMeters: number;
  trailManeuverCompletionMeters: number;
  arrivalMeters: number;
  offRouteMeters: number;
  trailOffRouteMeters: number;
  lowConfidenceOffRouteMeters: number;
  gpsNoiseGraceUpdates: number;
  headingAlignmentDegrees: number;
}

export interface EcsProjectedGuidancePoint {
  coordinate: EcsGuidanceCoordinate;
  distanceFromUserMeters: number;
  distanceFromRouteStartMeters: number;
  segmentIndex: number;
  segmentFraction?: number;
  continuityScore?: number;
}

type StepMetrics = {
  step: EcsGuidanceStep;
  startMeters: number;
  endMeters: number;
};

const DEFAULT_THRESHOLDS: EcsActiveGuidanceThresholds = {
  roadManeuverCompletionMeters: 25,
  trailManeuverCompletionMeters: 40,
  arrivalMeters: 35,
  offRouteMeters: 35,
  trailOffRouteMeters: 60,
  lowConfidenceOffRouteMeters: 85,
  gpsNoiseGraceUpdates: 2,
  headingAlignmentDegrees: 55,
};

function normalizeThresholds(
  input?: Partial<EcsActiveGuidanceThresholds>,
): EcsActiveGuidanceThresholds {
  return { ...DEFAULT_THRESHOLDS, ...(input ?? {}) };
}

function toCoordinate(
  input: ResolveEcsActiveGuidanceProgressInput['currentCoordinate'],
): EcsGuidanceCoordinate {
  const lat = Number('lat' in input ? input.lat : input.latitude);
  const lng = Number('lng' in input ? input.lng : input.longitude);
  return { lat, lng };
}

function isFiniteCoordinate(point: EcsGuidanceCoordinate | null | undefined): point is EcsGuidanceCoordinate {
  return !!point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180;
}

function toMetersDeltaLat(latDelta: number): number {
  return latDelta * 111320;
}

function toMetersDeltaLng(lngDelta: number, latitude: number): number {
  return lngDelta * 111320 * Math.cos((latitude * Math.PI) / 180);
}

function distanceMeters(a: EcsGuidanceCoordinate, b: EcsGuidanceCoordinate): number {
  const referenceLat = (a.lat + b.lat) / 2;
  const dx = toMetersDeltaLng(b.lng - a.lng, referenceLat);
  const dy = toMetersDeltaLat(b.lat - a.lat);
  return Math.sqrt(dx * dx + dy * dy);
}

function buildCumulativeDistances(points: EcsGuidanceCoordinate[]): number[] {
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative[index] = cumulative[index - 1] + distanceMeters(points[index - 1], points[index]);
  }
  return cumulative;
}

function projectOnPolyline(
  location: EcsGuidanceCoordinate,
  points: EcsGuidanceCoordinate[],
): EcsProjectedGuidancePoint | null {
  const projection = findNearestPlausibleRouteProjection({
    position: location,
    routeIndex: buildGuidanceRouteDistanceIndex(points),
  });
  return toEcsProjectedGuidancePoint(projection);
}

function toEcsProjectedGuidancePoint(
  projection: GuidanceRouteProjection | null | undefined,
): EcsProjectedGuidancePoint | null {
  if (!projection) return null;
  return {
    coordinate: projection.coordinate,
    distanceFromUserMeters: projection.distanceFromPositionM,
    distanceFromRouteStartMeters: projection.distanceFromRouteStartM,
    segmentIndex: projection.segmentIndex,
    segmentFraction: projection.segmentFraction,
    continuityScore: projection.continuityScore,
  };
}

function toGuidanceRouteProjection(
  projection: EcsProjectedGuidancePoint | null | undefined,
): GuidanceRouteProjection | null {
  if (!projection) return null;
  return {
    coordinate: projection.coordinate,
    distanceFromPositionM: projection.distanceFromUserMeters,
    distanceFromRouteStartM: projection.distanceFromRouteStartMeters,
    segmentIndex: projection.segmentIndex,
    segmentFraction: projection.segmentFraction ?? 0,
    segmentBearingDeg: null,
    continuityScore: projection.continuityScore ?? 0,
  };
}

function buildStepMetrics(route: EcsGuidanceRoute): StepMetrics[] {
  let cursor = 0;
  return route.steps.map((step) => {
    const distance =
      typeof step.distanceMeters === 'number' && Number.isFinite(step.distanceMeters) && step.distanceMeters > 0
        ? step.distanceMeters
        : Array.isArray(step.geometry) && step.geometry.length > 1
          ? (buildCumulativeDistances(step.geometry).at(-1) ?? 0)
          : 0;
    const metrics = {
      step,
      startMeters: cursor,
      endMeters: cursor + distance,
    };
    cursor += distance;
    return metrics;
  });
}

function totalStepDistance(metrics: StepMetrics[]): number {
  return metrics.length > 0 ? metrics[metrics.length - 1].endMeters : 0;
}

function stepIndexForDistance(metrics: StepMetrics[], traveledMeters: number): number {
  if (metrics.length === 0) return 0;
  const index = metrics.findIndex((metric) => traveledMeters < metric.endMeters);
  return index >= 0 ? index : metrics.length - 1;
}

function isArrivalStep(step: EcsGuidanceStep | undefined): boolean {
  if (!step) return false;
  const type = String(step.maneuverType ?? '').toLowerCase();
  const instruction = String(step.instruction ?? '').toLowerCase();
  return type === 'arrive' || type === 'arrival' || instruction.includes('arrived');
}

function getManeuverThreshold(
  route: EcsGuidanceRoute,
  thresholds: EcsActiveGuidanceThresholds,
): number {
  return routeUsesTrailThreshold(route)
    ? thresholds.trailManeuverCompletionMeters
    : thresholds.roadManeuverCompletionMeters;
}

function routeUsesTrailThreshold(route: EcsGuidanceRoute): boolean {
  if (route.source === 'imported_trace') return true;
  return route.steps.some((step) => {
    const mode = String(step.mode ?? '').toLowerCase();
    const road = String(step.displayRoadName ?? step.roadName ?? '').toLowerCase();
    return (
      mode.includes('trail') ||
      mode.includes('path') ||
      mode.includes('offroad') ||
      mode.includes('off-road') ||
      road.includes('trail') ||
      road.includes('path')
    );
  });
}

function normalizeHeading(value: number): number {
  return ((value % 360) + 360) % 360;
}

function headingDeltaDegrees(a: number, b: number): number {
  const delta = Math.abs(normalizeHeading(a) - normalizeHeading(b));
  return delta > 180 ? 360 - delta : delta;
}

function geometryBearingDegrees(points: EcsGuidanceCoordinate[] | undefined): number | null {
  if (!Array.isArray(points) || points.length < 2) return null;
  const start = points[0];
  const end = points[points.length - 1];
  if (!isFiniteCoordinate(start) || !isFiniteCoordinate(end)) return null;
  const referenceLat = (start.lat + end.lat) / 2;
  const dx = toMetersDeltaLng(end.lng - start.lng, referenceLat);
  const dy = toMetersDeltaLat(end.lat - start.lat);
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return null;
  return normalizeHeading((Math.atan2(dx, dy) * 180) / Math.PI);
}

function routeSegmentBearingDegrees(
  route: EcsGuidanceRoute,
  projection: EcsProjectedGuidancePoint | null,
): number | null {
  if (!projection) return null;
  const start = route.geometry[projection.segmentIndex];
  const end = route.geometry[projection.segmentIndex + 1];
  if (!isFiniteCoordinate(start) || !isFiniteCoordinate(end)) return null;
  return geometryBearingDegrees([start, end]);
}

function stepBearingAfter(step: EcsGuidanceStep | undefined): number | null {
  if (!step) return null;
  if (typeof step.bearingAfter === 'number' && Number.isFinite(step.bearingAfter)) {
    return normalizeHeading(step.bearingAfter);
  }
  return geometryBearingDegrees(step.geometry);
}

function headingAlignsWithStep(
  headingDegrees: number | null | undefined,
  step: EcsGuidanceStep | undefined,
  thresholds: EcsActiveGuidanceThresholds,
): boolean {
  if (typeof headingDegrees !== 'number' || !Number.isFinite(headingDegrees)) return false;
  const target = stepBearingAfter(step);
  if (target == null) return false;
  return headingDeltaDegrees(headingDegrees, target) <= thresholds.headingAlignmentDegrees;
}

function projectOnStepGeometry(
  location: EcsGuidanceCoordinate,
  step: EcsGuidanceStep | undefined,
): EcsProjectedGuidancePoint | null {
  if (!step?.geometry || step.geometry.length < 1) return null;
  return projectOnPolyline(location, step.geometry);
}

function resolveCandidateStepIndex(input: {
  route: EcsGuidanceRoute;
  metrics: StepMetrics[];
  routeProjection: EcsProjectedGuidancePoint | null;
  previousProgress: EcsActiveGuidanceProgress | null | undefined;
  location: EcsGuidanceCoordinate;
  headingDegrees?: number | null;
  thresholds: EcsActiveGuidanceThresholds;
  allowBacktracking?: boolean;
}): number {
  const { route, metrics, routeProjection, previousProgress, location, headingDegrees, thresholds } = input;
  if (metrics.length === 0) return 0;

  const previousIndex = Math.max(
    0,
    Math.min(metrics.length - 1, previousProgress?.currentStepIndex ?? 0),
  );
  const routeIndex = stepIndexForDistance(metrics, routeProjection?.distanceFromRouteStartMeters ?? 0);
  let candidateIndex = input.allowBacktracking
    ? routeIndex
    : Math.max(previousIndex, routeIndex);
  const currentMetric = metrics[previousIndex];
  const currentStep = currentMetric?.step;
  const nextStep = metrics[previousIndex + 1]?.step;
  const maneuverThreshold = getManeuverThreshold(route, thresholds);

  if (nextStep && !isArrivalStep(nextStep)) {
    const maneuverLocation = currentStep?.maneuverLocation
      ? { lng: currentStep.maneuverLocation[0], lat: currentStep.maneuverLocation[1] }
      : currentStep?.geometry?.[currentStep.geometry.length - 1] ?? null;
    const nearManeuver =
      maneuverLocation && isFiniteCoordinate(maneuverLocation)
        ? distanceMeters(location, maneuverLocation) <= maneuverThreshold
        : false;
    if (nearManeuver && headingAlignsWithStep(headingDegrees, nextStep, thresholds)) {
      candidateIndex = Math.max(candidateIndex, previousIndex + 1);
    }
  }

  const arrivalStep = metrics.at(-1)?.step;
  if (isArrivalStep(arrivalStep)) {
    const destination = route.geometry.at(-1) ?? arrivalStep?.geometry?.at(-1) ?? null;
    const arrived =
      destination && isFiniteCoordinate(destination)
        ? distanceMeters(location, destination) <= thresholds.arrivalMeters
        : false;
    if (!arrived) {
      candidateIndex = Math.min(candidateIndex, metrics.length - 2 >= 0 ? metrics.length - 2 : 0);
    } else {
      candidateIndex = metrics.length - 1;
    }
  }

  if (candidateIndex > previousIndex + 1) {
    const clearlyPast =
      routeProjection != null &&
      routeProjection.distanceFromRouteStartMeters >= (metrics[previousIndex + 1]?.endMeters ?? Infinity) + maneuverThreshold;
    const pendingCount =
      previousProgress?.pendingStepJumpIndex === candidateIndex
        ? (previousProgress.pendingStepJumpCount ?? 0) + 1
        : 1;
    if (!clearlyPast && pendingCount < thresholds.gpsNoiseGraceUpdates) {
      return previousIndex;
    }
  }

  return Math.max(0, Math.min(metrics.length - 1, candidateIndex));
}

function confidenceForDistance(
  distanceFromRouteMeters: number,
  thresholds: EcsActiveGuidanceThresholds,
): EcsActiveGuidanceConfidence {
  if (distanceFromRouteMeters <= thresholds.offRouteMeters) return 'high';
  if (distanceFromRouteMeters <= thresholds.lowConfidenceOffRouteMeters) return 'medium';
  return 'low';
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveOffRouteThresholdMeters(input: {
  route: EcsGuidanceRoute;
  thresholds: EcsActiveGuidanceThresholds;
  gpsAccuracyMeters: number | null;
  speedMetersPerSecond: number | null;
}): number {
  const base = routeUsesTrailThreshold(input.route)
    ? input.thresholds.trailOffRouteMeters
    : input.thresholds.offRouteMeters;
  const accuracyPad =
    input.gpsAccuracyMeters != null
      ? clamp(input.gpsAccuracyMeters * 0.5, 0, 25)
      : 0;
  const highSpeedPoorAccuracyPad =
    input.speedMetersPerSecond != null &&
    input.speedMetersPerSecond >= 22 &&
    (input.gpsAccuracyMeters ?? 0) >= 20
      ? 10
      : 0;
  return base + accuracyPad + highSpeedPoorAccuracyPad;
}

function resolveHeadingDivergenceDegrees(input: {
  route: EcsGuidanceRoute;
  routeProjection: EcsProjectedGuidancePoint | null;
  currentHeadingDegrees?: number | null;
}): number | null {
  const heading = finiteNumber(input.currentHeadingDegrees);
  if (heading == null) return null;
  const routeBearing = routeSegmentBearingDegrees(input.route, input.routeProjection);
  if (routeBearing == null) return null;
  return headingDeltaDegrees(heading, routeBearing);
}

function previousOffRouteCount(
  route: EcsGuidanceRoute,
  previousProgress: EcsActiveGuidanceProgress | null | undefined,
): number {
  if (!previousProgress) return 0;
  if (
    previousProgress.routeId !== route.id ||
    previousProgress.rerouteGeneration !== route.rerouteGeneration
  ) {
    return 0;
  }
  return previousProgress.offRouteUpdateCount ?? 0;
}

function progressMatchesRoute(
  route: EcsGuidanceRoute,
  previousProgress: EcsActiveGuidanceProgress | null | undefined,
): previousProgress is EcsActiveGuidanceProgress {
  if (!previousProgress) return false;
  if (previousProgress.routeId !== route.id) return false;
  if (previousProgress.rerouteGeneration !== route.rerouteGeneration) return false;
  if (route.routeVersion && previousProgress.routeVersion !== route.routeVersion) {
    return false;
  }
  return true;
}

function resolveOffRouteState(input: {
  route: EcsGuidanceRoute;
  thresholds: EcsActiveGuidanceThresholds;
  distanceFromRouteMeters: number;
  offRouteThresholdMeters: number;
  previousProgress: EcsActiveGuidanceProgress | null | undefined;
  headingDivergenceDegrees: number | null;
  speedMetersPerSecond: number | null;
  rerouteStatus?: ResolveEcsActiveGuidanceProgressInput['rerouteStatus'];
}): {
  offRouteStatus: EcsActiveGuidanceOffRouteStatus;
  offRouteUpdateCount: number;
  offRouteCandidate: boolean;
} {
  const previousCount = previousOffRouteCount(input.route, input.previousProgress);
  const overrideStatus = input.rerouteStatus ?? null;
  if (overrideStatus) {
    return {
      offRouteStatus: overrideStatus,
      offRouteUpdateCount: previousCount,
      offRouteCandidate: overrideStatus === 'rerouting' || overrideStatus === 'reroute_failed',
    };
  }

  const speed = input.speedMetersPerSecond;
  const moving = speed == null || speed >= 1.2;
  const headingSupportsOffRoute =
    input.headingDivergenceDegrees == null ||
    input.headingDivergenceDegrees >= 35 ||
    input.distanceFromRouteMeters >= input.offRouteThresholdMeters + 18;
  const candidate =
    input.distanceFromRouteMeters > input.offRouteThresholdMeters &&
    (moving || input.distanceFromRouteMeters >= input.offRouteThresholdMeters + 25) &&
    headingSupportsOffRoute;

  if (!candidate) {
    return {
      offRouteStatus: 'on_route',
      offRouteUpdateCount: 0,
      offRouteCandidate: false,
    };
  }

  const nextCount = previousCount + 1;
  return {
    offRouteStatus:
      nextCount >= input.thresholds.gpsNoiseGraceUpdates
        ? 'off_route_confirmed'
        : 'off_route_candidate',
    offRouteUpdateCount: nextCount,
    offRouteCandidate: true,
  };
}

function resolveDistanceToNextManeuver(
  metrics: StepMetrics[],
  currentStepIndex: number,
  traveledMeters: number,
): number | null {
  const currentStep = metrics[currentStepIndex]?.step;
  if (!currentStep) return null;
  if (isArrivalStep(currentStep)) return 0;
  const currentEnd = metrics[currentStepIndex]?.endMeters ?? traveledMeters;
  return Math.max(0, currentEnd - traveledMeters);
}

function resolveRemainingOnCurrentStep(
  metrics: StepMetrics[],
  currentStepIndex: number,
  traveledMeters: number,
): number | null {
  const metric = metrics[currentStepIndex];
  if (!metric) return null;
  return Math.max(0, metric.endMeters - traveledMeters);
}

function resolveDurationRemaining(route: EcsGuidanceRoute, remainingMeters: number): number | null {
  if (route.distanceMeters > 0 && route.durationSeconds > 0) {
    return Math.max(0, (route.durationSeconds * remainingMeters) / route.distanceMeters);
  }
  return null;
}

export function resolveEcsActiveGuidanceProgress(
  input: ResolveEcsActiveGuidanceProgressInput,
): EcsActiveGuidanceProgress {
  const thresholds = normalizeThresholds(input.thresholds);
  const location = toCoordinate(input.currentCoordinate);
  const route = input.activeRoute;
  const previousProgress = progressMatchesRoute(route, input.previousProgress)
    ? input.previousProgress
    : null;
  const metrics = buildStepMetrics(route);
  const gpsAccuracyMeters = finiteNumber(input.currentGpsAccuracyMeters);
  const speedMetersPerSecond = finiteNumber(input.currentSpeedMetersPerSecond);
  const offRouteThresholdMeters = resolveOffRouteThresholdMeters({
    route,
    thresholds,
    gpsAccuracyMeters,
    speedMetersPerSecond,
  });
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const currentUpdatedAtMs = Date.parse(updatedAt);
  const previousUpdatedAtMs = previousProgress ? Date.parse(previousProgress.updatedAt) : NaN;
  const projectionInput: ResolveGuidanceRouteProgressInput = {
    rawPosition: location,
    routeGeometry: route.geometry,
    context: routeUsesTrailThreshold(route) ? 'trail' : 'road',
    accuracyM: gpsAccuracyMeters,
    headingDeg: input.currentHeadingDegrees,
    speedMps: speedMetersPerSecond,
    elapsedMs:
      Number.isFinite(currentUpdatedAtMs) && Number.isFinite(previousUpdatedAtMs)
        ? Math.max(0, currentUpdatedAtMs - previousUpdatedAtMs)
        : null,
    previousProjection: toGuidanceRouteProjection(
      previousProgress?.progressRoutePoint ?? previousProgress?.nearestRoutePoint,
    ),
    allowBacktracking: input.allowBacktracking === true,
    snapToleranceM: offRouteThresholdMeters,
  };
  let allowBacktracking = input.allowBacktracking === true;
  let routeProgress = resolveGuidanceRouteProgress(projectionInput);
  let pendingBacktrackCount = 0;
  let pendingBacktrackDistanceMeters: number | undefined;
  const previousAcceptedDistanceM =
    previousProgress?.progressRoutePoint?.distanceFromRouteStartMeters ??
    previousProgress?.routeDistanceFromStartMeters ??
    null;
  const nearestCandidate = routeProgress.nearestProjection;
  const currentHeading = finiteNumber(input.currentHeadingDegrees);
  const reverseHeading =
    currentHeading != null &&
    nearestCandidate?.segmentBearingDeg != null &&
    headingDeltaDegrees(currentHeading, nearestCandidate.segmentBearingDeg) >= 120;
  const reverseCandidate =
    !allowBacktracking &&
    previousAcceptedDistanceM != null &&
    nearestCandidate != null &&
    nearestCandidate.distanceFromPositionM <= offRouteThresholdMeters &&
    nearestCandidate.distanceFromRouteStartM < previousAcceptedDistanceM - 18 &&
    reverseHeading &&
    speedMetersPerSecond != null &&
    speedMetersPerSecond >= 1.2;

  if (reverseCandidate && nearestCandidate) {
    pendingBacktrackCount = (previousProgress?.pendingBacktrackCount ?? 0) + 1;
    pendingBacktrackDistanceMeters = nearestCandidate.distanceFromRouteStartM;
    if (pendingBacktrackCount >= 3) {
      allowBacktracking = true;
      routeProgress = resolveGuidanceRouteProgress({
        ...projectionInput,
        allowBacktracking: true,
      });
      pendingBacktrackCount = 0;
      pendingBacktrackDistanceMeters = undefined;
    }
  }
  const routeProjection = toEcsProjectedGuidancePoint(routeProgress.nearestProjection);
  const progressRoutePoint = toEcsProjectedGuidancePoint(routeProgress.progressProjection);
  const currentStepIndex = resolveCandidateStepIndex({
    route,
    metrics,
    routeProjection: progressRoutePoint,
    previousProgress,
    location,
    headingDegrees: input.currentHeadingDegrees,
    thresholds,
    allowBacktracking,
  });
  const currentMetric = metrics[currentStepIndex] ?? null;
  const currentStep = currentMetric?.step;
  const nextStep = metrics[currentStepIndex + 1]?.step;
  const followingStep = metrics[currentStepIndex + 2]?.step;
  const routeDistanceMeters =
    route.distanceMeters > 0
      ? route.distanceMeters
      : totalStepDistance(metrics) > 0
        ? totalStepDistance(metrics)
        : routeProgress.routeLengthM;
  const routeGeometryDistanceScale =
    routeProgress.routeLengthM > 0 && routeDistanceMeters > 0
      ? routeDistanceMeters / routeProgress.routeLengthM
      : 1;
  const projectedTraveledMeters = routeProgress.routeDistanceM * routeGeometryDistanceScale;
  const traveledMeters = Math.max(
    currentMetric?.startMeters ?? 0,
    projectedTraveledMeters,
  );
  const distanceRemainingMeters = Math.max(0, routeDistanceMeters - traveledMeters);
  const distanceFromRouteMeters = routeProgress.offRouteDistanceM;
  const headingDivergenceDegrees = resolveHeadingDivergenceDegrees({
    route,
    routeProjection,
    currentHeadingDegrees: input.currentHeadingDegrees,
  });
  const offRouteState = resolveOffRouteState({
    route,
    thresholds,
    distanceFromRouteMeters,
    offRouteThresholdMeters,
    previousProgress,
    headingDivergenceDegrees,
    speedMetersPerSecond,
    rerouteStatus: input.rerouteStatus,
  });
  const confidence = confidenceForDistance(distanceFromRouteMeters, thresholds);
  const upcomingSteps = route.steps.slice(currentStepIndex);
  const pendingStepJumpIndex =
    currentStepIndex > (previousProgress?.currentStepIndex ?? currentStepIndex) + 1
      ? currentStepIndex
      : undefined;
  const pendingStepJumpCount =
    pendingStepJumpIndex != null
      ? previousProgress?.pendingStepJumpIndex === pendingStepJumpIndex
        ? (previousProgress.pendingStepJumpCount ?? 0) + 1
        : 1
      : undefined;

  return {
    routeId: route.id,
    ...(route.routeVersion ? { routeVersion: route.routeVersion } : null),
    rerouteGeneration: route.rerouteGeneration,
    currentLegIndex: currentStep?.legIndex ?? 0,
    currentStepIndex,
    distanceToNextManeuverMeters: resolveDistanceToNextManeuver(metrics, currentStepIndex, traveledMeters),
    distanceRemainingMeters,
    durationRemainingSeconds: resolveDurationRemaining(route, distanceRemainingMeters),
    currentInstruction: currentStep?.instruction ?? 'Continue on highlighted route',
    currentRoadName: currentStep?.displayRoadName ?? currentStep?.roadName ?? 'Unnamed road',
    ...(nextStep ? { nextInstruction: nextStep.instruction } : null),
    offRouteCandidate: offRouteState.offRouteCandidate,
    offRouteStatus: offRouteState.offRouteStatus,
    offRouteUpdateCount: offRouteState.offRouteUpdateCount,
    offRouteThresholdMeters,
    gpsAccuracyMeters,
    headingDivergenceDegrees,
    confidence,
    updatedAt,
    distanceFromRouteMeters,
    distanceRemainingOnCurrentStepMeters: resolveRemainingOnCurrentStep(metrics, currentStepIndex, traveledMeters),
    nearestRoutePoint: routeProjection,
    progressRoutePoint,
    nearestStepPoint: projectOnStepGeometry(location, currentStep),
    routeDistanceFromStartMeters: projectedTraveledMeters,
    projectionStatus: routeProgress.status,
    completedRouteGeometry: routeProgress.completedGeometry,
    remainingRouteGeometry: routeProgress.remainingGeometry,
    ...(currentStep ? { currentStep } : null),
    ...(nextStep ? { nextStep } : null),
    ...(followingStep ? { followingStep } : null),
    upcomingSteps,
    ...(pendingStepJumpIndex != null ? { pendingStepJumpIndex } : null),
    ...(pendingStepJumpCount != null ? { pendingStepJumpCount } : null),
    ...(pendingBacktrackCount > 0 ? { pendingBacktrackCount } : null),
    ...(pendingBacktrackDistanceMeters != null ? { pendingBacktrackDistanceMeters } : null),
  };
}
