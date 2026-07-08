import type { RoadNavCoordinate, RoadNavRoute } from './mapboxRoadNavigation';

export const ROAD_GUIDANCE_STEP_SNAP_DISTANCE_M = 35;
export const ROAD_NAVIGATION_MAX_PROGRESS_GEOMETRY_POINTS = 512;
const ROAD_GUIDANCE_PROGRESS_REGRESSION_TOLERANCE_M = 18;

type GeometryProgress = {
  nearestIndex: number;
  progressCoords: RoadNavCoordinate[];
  traveledDistanceM: number;
  remainingDistanceM: number;
  offRouteDistanceM: number;
  distanceToDestinationM: number;
};

type StepProgressMatch = {
  stepIndex: number;
  traveledDistanceM: number;
  offRouteDistanceM: number;
};

export type RoadNavigationProgressLocation = RoadNavCoordinate & {
  accuracyM?: number | null;
};

export type RoadNavigationProgressInput = {
  location: RoadNavigationProgressLocation;
  previousStepIndex?: number | null;
  previousRemainingDistanceM?: number | null;
  lockForwardProgress?: boolean;
};

export type RoadNavigationProgressResult = {
  currentStepIndex: number;
  nextInstruction: string | null;
  nextInstructionDistanceM: number | null;
  remainingDistanceM: number;
  offRouteDistanceM: number;
  distanceToDestinationM: number;
  progressGeometry: RoadNavCoordinate[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toMetersDeltaLat(latDelta: number): number {
  return latDelta * 111320;
}

function toMetersDeltaLng(lngDelta: number, latitude: number): number {
  return lngDelta * 111320 * Math.cos((latitude * Math.PI) / 180);
}

function distanceMeters(a: RoadNavCoordinate, b: RoadNavCoordinate): number {
  const dLat = toMetersDeltaLat(b.lat - a.lat);
  const dLng = toMetersDeltaLng(b.lng - a.lng, (a.lat + b.lat) / 2);
  return Math.sqrt(dLat ** 2 + dLng ** 2);
}

function buildCumulativeDistances(points: RoadNavCoordinate[]): number[] {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative[i] = cumulative[i - 1] + distanceMeters(points[i - 1], points[i]);
  }
  return cumulative;
}

function isArrivalLikeInstruction(instruction: string | null | undefined): boolean {
  const normalized = String(instruction ?? '').trim().toLowerCase();
  return normalized.includes('arrive') || normalized.includes('destination');
}

function getRouteDistanceScale(routeDistanceM: number, geometryDistanceM: number): number {
  if (!Number.isFinite(routeDistanceM) || routeDistanceM <= 0) return 1;
  if (!Number.isFinite(geometryDistanceM) || geometryDistanceM <= 0) return 1;
  return routeDistanceM / geometryDistanceM;
}

function projectProgressOnPolyline(
  location: RoadNavCoordinate,
  points: RoadNavCoordinate[],
  cumulativeDistances: number[],
): GeometryProgress {
  if (points.length === 0) {
    return {
      nearestIndex: 0,
      progressCoords: [],
      traveledDistanceM: 0,
      remainingDistanceM: 0,
      offRouteDistanceM: Infinity,
      distanceToDestinationM: Infinity,
    };
  }

  if (points.length === 1) {
    const distanceToDestinationM = distanceMeters(location, points[0]);
    return {
      nearestIndex: 0,
      progressCoords: [points[0]],
      traveledDistanceM: 0,
      remainingDistanceM: 0,
      offRouteDistanceM: distanceToDestinationM,
      distanceToDestinationM,
    };
  }

  let bestDistanceM = Infinity;
  let bestNearestIndex = 0;
  let bestAlongDistanceM = 0;
  let bestProjection = points[0];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const referenceLat = (start.lat + end.lat + location.lat) / 3;

    const bx = toMetersDeltaLng(end.lng - start.lng, referenceLat);
    const by = toMetersDeltaLat(end.lat - start.lat);
    const px = toMetersDeltaLng(location.lng - start.lng, referenceLat);
    const py = toMetersDeltaLat(location.lat - start.lat);
    const segmentLengthSquared = bx * bx + by * by;
    const tRaw =
      segmentLengthSquared > 0 ? (px * bx + py * by) / segmentLengthSquared : 0;
    const t = clamp(tRaw, 0, 1);
    const projectionX = bx * t;
    const projectionY = by * t;
    const distanceFromSegmentM = Math.sqrt(
      (px - projectionX) ** 2 + (py - projectionY) ** 2,
    );

    if (distanceFromSegmentM < bestDistanceM) {
      bestDistanceM = distanceFromSegmentM;
      bestNearestIndex = i + (t >= 0.5 ? 1 : 0);
      bestAlongDistanceM =
        cumulativeDistances[i] + Math.sqrt(projectionX ** 2 + projectionY ** 2);
      bestProjection = {
        lat: start.lat + (end.lat - start.lat) * t,
        lng: start.lng + (end.lng - start.lng) * t,
      };
    }
  }

  const progressCoords = points.slice(0, Math.max(bestNearestIndex, 1));
  progressCoords.push(bestProjection);

  const totalDistanceM = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;
  const remainingDistanceM = Math.max(totalDistanceM - bestAlongDistanceM, 0);

  return {
    nearestIndex: bestNearestIndex,
    progressCoords,
    traveledDistanceM: bestAlongDistanceM,
    remainingDistanceM,
    offRouteDistanceM: bestDistanceM,
    distanceToDestinationM: distanceMeters(location, points[points.length - 1]),
  };
}

function buildProgressCoordsAtDistance(
  points: RoadNavCoordinate[],
  cumulativeDistances: number[],
  traveledDistanceM: number,
): RoadNavCoordinate[] {
  if (points.length <= 1) return points.slice();

  const totalDistanceM = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;
  const clampedDistance = clamp(traveledDistanceM, 0, totalDistanceM);

  for (let i = 0; i < points.length - 1; i += 1) {
    const segmentStartDistance = cumulativeDistances[i] ?? 0;
    const segmentEndDistance = cumulativeDistances[i + 1] ?? segmentStartDistance;
    if (clampedDistance > segmentEndDistance && i < points.length - 2) continue;

    const segmentDistance = Math.max(segmentEndDistance - segmentStartDistance, 0);
    const t = segmentDistance > 0
      ? clamp((clampedDistance - segmentStartDistance) / segmentDistance, 0, 1)
      : 0;
    const start = points[i];
    const end = points[i + 1];
    const projection = {
      lat: start.lat + (end.lat - start.lat) * t,
      lng: start.lng + (end.lng - start.lng) * t,
    };
    const progressCoords = points.slice(0, i + 1);
    progressCoords.push(projection);
    return progressCoords;
  }

  return points.slice();
}

function boundProgressGeometry(points: RoadNavCoordinate[]): RoadNavCoordinate[] {
  if (points.length <= ROAD_NAVIGATION_MAX_PROGRESS_GEOMETRY_POINTS) return points;

  const lastIndex = points.length - 1;
  const selectedIndexes = new Set<number>([0, lastIndex]);
  const step = lastIndex / Math.max(ROAD_NAVIGATION_MAX_PROGRESS_GEOMETRY_POINTS - 1, 1);

  for (let slot = 1; slot < ROAD_NAVIGATION_MAX_PROGRESS_GEOMETRY_POINTS - 1; slot += 1) {
    selectedIndexes.add(Math.round(slot * step));
  }

  return Array.from(selectedIndexes)
    .sort((left, right) => left - right)
    .map((index) => points[index])
    .filter((point): point is RoadNavCoordinate => !!point);
}

function findStepIndexForDistance(steps: RoadNavRoute['steps'], traveledDistanceM: number): number {
  if (steps.length === 0) return 0;
  const stepIndex = steps.findIndex((step) => traveledDistanceM < step.endDistanceM);
  return stepIndex >= 0 ? stepIndex : Math.max(steps.length - 1, 0);
}

function selectGuidanceStep(
  steps: RoadNavRoute['steps'],
  currentStepIndex: number,
): { stepIndex: number; step: RoadNavRoute['steps'][number] | null } {
  if (steps.length === 0) {
    return { stepIndex: 0, step: null };
  }

  const resolvedCurrentIndex = clamp(currentStepIndex, 0, steps.length - 1);
  const currentStep = steps[resolvedCurrentIndex] ?? null;
  if (!currentStep) {
    return { stepIndex: resolvedCurrentIndex, step: null };
  }

  const lastIndex = steps.length - 1;
  if (
    resolvedCurrentIndex >= lastIndex ||
    currentStep.maneuverType === 'arrive' ||
    isArrivalLikeInstruction(currentStep.instruction)
  ) {
    return { stepIndex: resolvedCurrentIndex, step: currentStep };
  }

  return {
    stepIndex: resolvedCurrentIndex + 1,
    step: steps[resolvedCurrentIndex + 1] ?? currentStep,
  };
}

function getDistanceToGuidanceStep(
  selection: { stepIndex: number; step: RoadNavRoute['steps'][number] | null },
  currentStepIndex: number,
  traveledDistanceM: number,
): number | null {
  const step = selection.step;
  if (!step) return null;

  const targetDistanceM =
    selection.stepIndex > currentStepIndex ||
    step.maneuverType === 'arrive' ||
    isArrivalLikeInstruction(step.instruction)
      ? step.startDistanceM
      : step.endDistanceM;

  return Math.max(targetDistanceM - traveledDistanceM, 0);
}

function getAccuracySnapPadMeters(location: RoadNavigationProgressLocation): number {
  const accuracyM = Number(location.accuracyM);
  if (!Number.isFinite(accuracyM) || accuracyM <= 0) return 0;
  return clamp(accuracyM, 0, 40) * 0.35;
}

function projectStepProgress(
  location: RoadNavigationProgressLocation,
  step: RoadNavRoute['steps'][number],
  stepIndex: number,
): StepProgressMatch | null {
  const stepDistanceM = Math.max(step.endDistanceM - step.startDistanceM, 0);

  if (Array.isArray(step.geometry) && step.geometry.length >= 2) {
    const cumulative = buildCumulativeDistances(step.geometry);
    const localProgress = projectProgressOnPolyline(location, step.geometry, cumulative);
    const geometryDistanceM = cumulative[cumulative.length - 1] ?? 0;
    const localRatio = geometryDistanceM > 0
      ? clamp(localProgress.traveledDistanceM / geometryDistanceM, 0, 1)
      : 0;
    return {
      stepIndex,
      traveledDistanceM: step.startDistanceM + stepDistanceM * localRatio,
      offRouteDistanceM: localProgress.offRouteDistanceM,
    };
  }

  if (step.location) {
    return {
      stepIndex,
      traveledDistanceM: step.startDistanceM,
      offRouteDistanceM: distanceMeters(location, step.location),
    };
  }

  return null;
}

function findNearestStepProgress(
  route: RoadNavRoute,
  location: RoadNavigationProgressLocation,
): StepProgressMatch | null {
  let best: StepProgressMatch | null = null;

  route.steps.forEach((step, stepIndex) => {
    const match = projectStepProgress(location, step, stepIndex);
    if (!match) return;
    if (!best || match.offRouteDistanceM < best.offRouteDistanceM) {
      best = match;
    }
  });

  return best;
}

export function resolveRoadNavigationProgress(
  route: RoadNavRoute,
  input: RoadNavigationProgressInput,
): RoadNavigationProgressResult {
  const routeGeometry = Array.isArray(route.geometry) ? route.geometry : [];
  const cumulativeDistances = buildCumulativeDistances(routeGeometry);
  const routeGeometryDistanceM = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;
  const routeDistanceM =
    typeof route.distanceM === 'number' && Number.isFinite(route.distanceM) && route.distanceM > 0
      ? route.distanceM
      : routeGeometryDistanceM;
  const routeDistanceScale = getRouteDistanceScale(routeDistanceM, routeGeometryDistanceM);
  const projected = projectProgressOnPolyline(input.location, routeGeometry, cumulativeDistances);
  const projectedRouteDistanceM = projected.traveledDistanceM * routeDistanceScale;
  const previousStepIndex =
    typeof input.previousStepIndex === 'number' && Number.isFinite(input.previousStepIndex)
      ? clamp(input.previousStepIndex, 0, Math.max(route.steps.length - 1, 0))
      : null;
  const previousProgressDistanceM =
    typeof input.previousRemainingDistanceM === 'number' &&
    Number.isFinite(input.previousRemainingDistanceM) &&
    input.previousRemainingDistanceM >= 0
      ? clamp(routeDistanceM - input.previousRemainingDistanceM, 0, routeDistanceM)
      : null;
  const lockForwardProgress = input.lockForwardProgress === true;
  const snapThresholdM = ROAD_GUIDANCE_STEP_SNAP_DISTANCE_M + getAccuracySnapPadMeters(input.location);

  let resolvedTraveledDistanceM = projectedRouteDistanceM;
  let resolvedStepIndex = findStepIndexForDistance(route.steps, resolvedTraveledDistanceM);
  const nearestStepProgress = findNearestStepProgress(route, input.location);

  if (nearestStepProgress && nearestStepProgress.offRouteDistanceM <= snapThresholdM) {
    const maxForwardStepIndex =
      previousStepIndex == null
        ? resolvedStepIndex + 1
        : Math.max(previousStepIndex + 1, resolvedStepIndex + 1);
    const safeForwardMatch =
      nearestStepProgress.stepIndex >= resolvedStepIndex &&
      nearestStepProgress.stepIndex <= maxForwardStepIndex;
    const safePreviousMatch =
      previousStepIndex != null &&
      nearestStepProgress.stepIndex >= previousStepIndex &&
      nearestStepProgress.stepIndex <= previousStepIndex + 1;

    if (safeForwardMatch || safePreviousMatch) {
      resolvedStepIndex = Math.max(resolvedStepIndex, nearestStepProgress.stepIndex);
      resolvedTraveledDistanceM = Math.max(
        resolvedTraveledDistanceM,
        nearestStepProgress.traveledDistanceM,
      );
    }
  }

  if (lockForwardProgress && previousStepIndex != null && resolvedStepIndex < previousStepIndex) {
    resolvedStepIndex = previousStepIndex;
    const previousStep = route.steps[previousStepIndex] ?? null;
    if (previousStep) {
      resolvedTraveledDistanceM = Math.max(resolvedTraveledDistanceM, previousStep.startDistanceM);
    }
  }

  if (lockForwardProgress && previousProgressDistanceM != null) {
    resolvedTraveledDistanceM = Math.max(
      resolvedTraveledDistanceM,
      previousProgressDistanceM - ROAD_GUIDANCE_PROGRESS_REGRESSION_TOLERANCE_M,
    );
  }

  resolvedTraveledDistanceM = clamp(resolvedTraveledDistanceM, 0, routeDistanceM);
  resolvedStepIndex = findStepIndexForDistance(route.steps, resolvedTraveledDistanceM);
  if (lockForwardProgress && previousStepIndex != null && resolvedStepIndex < previousStepIndex) {
    resolvedStepIndex = previousStepIndex;
  }

  const currentStep = route.steps[resolvedStepIndex] ?? null;
  if (currentStep) {
    resolvedTraveledDistanceM = Math.max(resolvedTraveledDistanceM, currentStep.startDistanceM);
  }

  const guidanceStepSelection = selectGuidanceStep(route.steps, resolvedStepIndex);
  const nextInstructionDistanceM = getDistanceToGuidanceStep(
    guidanceStepSelection,
    resolvedStepIndex,
    resolvedTraveledDistanceM,
  );
  const resolvedGeometryDistanceM =
    routeDistanceScale > 0 ? resolvedTraveledDistanceM / routeDistanceScale : projected.traveledDistanceM;
  const progressGeometry =
    resolvedTraveledDistanceM > projectedRouteDistanceM + 1 ||
    (lockForwardProgress && previousProgressDistanceM != null)
      ? buildProgressCoordsAtDistance(routeGeometry, cumulativeDistances, resolvedGeometryDistanceM)
      : projected.progressCoords;
  const boundedProgressGeometry = boundProgressGeometry(progressGeometry);
  const offRouteDistanceM = nearestStepProgress
    ? Math.min(projected.offRouteDistanceM, nearestStepProgress.offRouteDistanceM)
    : projected.offRouteDistanceM;

  return {
    currentStepIndex: resolvedStepIndex,
    nextInstruction: guidanceStepSelection.step?.instruction ?? currentStep?.instruction ?? null,
    nextInstructionDistanceM,
    remainingDistanceM: Math.max(routeDistanceM - resolvedTraveledDistanceM, 0),
    offRouteDistanceM,
    distanceToDestinationM: projected.distanceToDestinationM,
    progressGeometry: boundedProgressGeometry,
  };
}
