import type {
  NavigationTrailDecisionPoint,
  NavigationTrailWaypoint,
} from './navigationHandoffStore';
import type { RoadNavCoordinate } from './mapboxRoadNavigation';

export type TrailNavigationStatus =
  | 'idle'
  | 'route_preview_trail'
  | 'route_preview_hybrid'
  | 'transition_to_trail'
  | 'navigation_active_trail'
  | 'off_trail'
  | 'rejoining_trail'
  | 'arrived_trail_destination'
  | 'arrived_final_destination'
  | 'cancelled'
  | 'error';

export interface TrailGuidanceLocation {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  headingDeg?: number | null;
  speedMph?: number | null;
  timestamp?: number | null;
}

export interface TrailProgressProjection {
  nearestIndex: number;
  projectedPoint: RoadNavCoordinate;
  traveledDistanceM: number;
  remainingDistanceM: number;
  distanceFromRouteM: number;
  distanceToDestinationM: number;
  progressCoords: RoadNavCoordinate[];
}

export interface TrailPrompt {
  title: string;
  detail: string;
  badge: 'trail' | 'hybrid' | 'off_trail' | 'waypoint' | 'decision' | 'transition' | 'arrived';
  distanceM: number | null;
}

export interface TrailGuidanceSnapshot {
  progress: TrailProgressProjection;
  prompt: TrailPrompt;
  nextWaypoint: NavigationTrailWaypoint | null;
  nextDecisionPoint: NavigationTrailDecisionPoint | null;
  reachedWaypointIds: string[];
  rejoinPoint: RoadNavCoordinate | null;
  rejoinDistanceM: number | null;
  statusLabel: string;
  progressPercent: number;
  isOffTrail: boolean;
}

const ARRIVAL_DISTANCE_M = 200;
const MIN_REACHED_RADIUS_M = 30;
const MAX_REACHED_RADIUS_M = 90;
const CONTINUE_CHUNK_M = 160;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toMetersDeltaLat(latDelta: number): number {
  return latDelta * 111320;
}

function toMetersDeltaLng(lngDelta: number, latitude: number): number {
  return lngDelta * 111320 * Math.cos((latitude * Math.PI) / 180);
}

export function trailDistanceMeters(a: RoadNavCoordinate, b: RoadNavCoordinate): number {
  const dLat = toMetersDeltaLat(b.lat - a.lat);
  const dLng = toMetersDeltaLng(b.lng - a.lng, (a.lat + b.lat) / 2);
  return Math.sqrt(dLat ** 2 + dLng ** 2);
}

export function buildTrailCumulativeDistances(points: RoadNavCoordinate[]): number[] {
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative[i] = cumulative[i - 1] + trailDistanceMeters(points[i - 1], points[i]);
  }
  return cumulative;
}

export function projectOnTrailGeometry(
  location: TrailGuidanceLocation,
  points: RoadNavCoordinate[],
  cumulativeDistances: number[],
): TrailProgressProjection {
  if (points.length === 0) {
    return {
      nearestIndex: 0,
      projectedPoint: { lat: location.lat, lng: location.lng },
      traveledDistanceM: 0,
      remainingDistanceM: 0,
      distanceFromRouteM: Infinity,
      distanceToDestinationM: Infinity,
      progressCoords: [],
    };
  }

  if (points.length === 1) {
    const destinationDistance = trailDistanceMeters(location, points[0]);
    return {
      nearestIndex: 0,
      projectedPoint: points[0],
      traveledDistanceM: 0,
      remainingDistanceM: 0,
      distanceFromRouteM: destinationDistance,
      distanceToDestinationM: destinationDistance,
      progressCoords: [points[0]],
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
    const lengthSquared = bx * bx + by * by;
    const tRaw = lengthSquared > 0 ? (px * bx + py * by) / lengthSquared : 0;
    const t = clamp(tRaw, 0, 1);
    const projectionX = bx * t;
    const projectionY = by * t;
    const distanceFromSegmentM = Math.sqrt((px - projectionX) ** 2 + (py - projectionY) ** 2);

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

  return {
    nearestIndex: bestNearestIndex,
    projectedPoint: bestProjection,
    traveledDistanceM: bestAlongDistanceM,
    remainingDistanceM: Math.max(totalDistanceM - bestAlongDistanceM, 0),
    distanceFromRouteM: bestDistanceM,
    distanceToDestinationM: trailDistanceMeters(location, points[points.length - 1]),
    progressCoords,
  };
}

function getReachedRadiusM(
  waypoint: NavigationTrailWaypoint,
  accuracyM: number,
): number {
  const explicit = Number.isFinite(Number(waypoint.reachedRadiusM))
    ? Number(waypoint.reachedRadiusM)
    : MIN_REACHED_RADIUS_M;
  return clamp(Math.max(explicit, accuracyM + 10), MIN_REACHED_RADIUS_M, MAX_REACHED_RADIUS_M);
}

function formatFeetOrMiles(distanceM: number | null | undefined): string {
  if (distanceM == null || !Number.isFinite(distanceM)) return '--';
  if (distanceM < 160) {
    return `${Math.max(Math.round(distanceM / 5) * 5, 5)} ft`;
  }
  const miles = distanceM / 1609.344;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function quantizeDistance(distanceM: number): number {
  if (distanceM <= 120) return Math.max(Math.round(distanceM / 10) * 10, 10);
  if (distanceM <= 800) return Math.round(distanceM / 25) * 25;
  return Math.round(distanceM / CONTINUE_CHUNK_M) * CONTINUE_CHUNK_M;
}

function buildDecisionPrompt(
  decisionPoint: NavigationTrailDecisionPoint,
  distanceM: number,
): TrailPrompt {
  if (decisionPoint.instructionText) {
    return {
      title: decisionPoint.instructionText,
      detail: `Decision ahead in ${formatFeetOrMiles(distanceM)}`,
      badge: 'decision',
      distanceM,
    };
  }

  const labelMap: Record<NavigationTrailDecisionPoint['type'], string> = {
    fork_left: 'Veer left at next fork',
    fork_right: 'Stay right at split',
    continue: 'Continue through next junction',
    waypoint: 'Waypoint ahead',
    gate: 'Gate ahead',
    hazard: 'Caution ahead',
    landmark: decisionPoint.landmarkName ? `Approaching ${decisionPoint.landmarkName}` : 'Landmark ahead',
    summit: 'Summit ahead',
    junction: 'Junction ahead',
  };

  return {
    title: labelMap[decisionPoint.type] ?? 'Decision ahead',
    detail: `${formatFeetOrMiles(distanceM)}`,
    badge: decisionPoint.type === 'waypoint' ? 'waypoint' : 'decision',
    distanceM,
  };
}

function buildWaypointPrompt(
  waypoint: NavigationTrailWaypoint,
  distanceM: number,
): TrailPrompt {
  const title = waypoint.name
    ? `Approaching ${waypoint.name}`
    : 'Waypoint ahead';

  return {
    title,
    detail: `${formatFeetOrMiles(distanceM)}`,
    badge: 'waypoint',
    distanceM,
  };
}

function buildContinuePrompt(
  remainingDistanceM: number,
): TrailPrompt {
  const quantized = quantizeDistance(remainingDistanceM);
  return {
    title: 'Continue on current trail',
    detail:
      remainingDistanceM > CONTINUE_CHUNK_M
        ? `for ${formatFeetOrMiles(quantized)}`
        : 'Stay on highlighted route',
    badge: 'trail',
    distanceM: quantized,
  };
}

export function computeTrailToleranceM(accuracyM: number | null | undefined): number {
  const accuracy = Number.isFinite(Number(accuracyM)) ? Number(accuracyM) : 18;
  return clamp(Math.max(accuracy + 18, 28), 28, 95);
}

export function buildTrailGuidanceSnapshot(params: {
  geometry: RoadNavCoordinate[];
  location: TrailGuidanceLocation;
  waypoints: NavigationTrailWaypoint[];
  decisionPoints: NavigationTrailDecisionPoint[];
  reachedWaypointIds: string[];
  mode: 'trail' | 'hybrid';
}): TrailGuidanceSnapshot {
  const cumulativeDistances = buildTrailCumulativeDistances(params.geometry);
  const progress = projectOnTrailGeometry(params.location, params.geometry, cumulativeDistances);
  const accuracyM = Number.isFinite(Number(params.location.accuracyM))
    ? Number(params.location.accuracyM)
    : 18;
  const toleranceM = computeTrailToleranceM(accuracyM);
  const isOffTrail = progress.distanceFromRouteM > toleranceM;
  const progressPercent =
    cumulativeDistances.length > 1 && cumulativeDistances[cumulativeDistances.length - 1] > 0
      ? clamp(
          Math.round(
            (progress.traveledDistanceM / cumulativeDistances[cumulativeDistances.length - 1]) * 100,
          ),
          0,
          100,
        )
      : 0;

  const reachedWaypointIds = new Set(params.reachedWaypointIds);
  let nextWaypoint: NavigationTrailWaypoint | null = null;
  for (const waypoint of params.waypoints) {
    if (reachedWaypointIds.has(waypoint.id)) continue;
    const routeIndex = waypoint.routeIndex ?? 0;
    const distanceToWaypointM = trailDistanceMeters(params.location, waypoint.coordinate);
    const reachedRadiusM = getReachedRadiusM(waypoint, accuracyM);
    if (distanceToWaypointM <= reachedRadiusM) {
      reachedWaypointIds.add(waypoint.id);
      continue;
    }
    if (routeIndex + 3 >= progress.nearestIndex) {
      nextWaypoint = waypoint;
      break;
    }
  }

  let nextDecisionPoint: NavigationTrailDecisionPoint | null = null;
  for (const decisionPoint of params.decisionPoints) {
    const routeIndex = decisionPoint.routeIndex ?? 0;
    if (routeIndex + 2 < progress.nearestIndex) continue;
    nextDecisionPoint = decisionPoint;
    break;
  }

  let prompt: TrailPrompt;
  let statusLabel = params.mode === 'hybrid' ? 'Trail Guidance' : 'Trail Guidance';
  let rejoinPoint: RoadNavCoordinate | null = null;
  let rejoinDistanceM: number | null = null;

  if (isOffTrail) {
    rejoinPoint = progress.projectedPoint;
    rejoinDistanceM = progress.distanceFromRouteM;
    prompt = {
      title: 'Off trail',
      detail: `Rejoin route in ${formatFeetOrMiles(progress.distanceFromRouteM)}`,
      badge: 'off_trail',
      distanceM: progress.distanceFromRouteM,
    };
    statusLabel = 'Off Trail';
  } else if (nextDecisionPoint) {
    const routeIndex = clamp(nextDecisionPoint.routeIndex ?? progress.nearestIndex, 0, cumulativeDistances.length - 1);
    const distanceToDecisionM = Math.max(
      (cumulativeDistances[routeIndex] ?? progress.traveledDistanceM) - progress.traveledDistanceM,
      0,
    );
    const displayRadiusM = Number.isFinite(Number(nextDecisionPoint.displayRadiusM))
      ? Number(nextDecisionPoint.displayRadiusM)
      : 150;

    if (distanceToDecisionM <= displayRadiusM) {
      prompt = buildDecisionPrompt(nextDecisionPoint, distanceToDecisionM);
      statusLabel = 'Decision Ahead';
    } else if (nextWaypoint) {
      const distanceToWaypointM = trailDistanceMeters(params.location, nextWaypoint.coordinate);
      prompt = buildWaypointPrompt(nextWaypoint, distanceToWaypointM);
      statusLabel = 'Waypoint Ahead';
    } else {
      prompt = buildContinuePrompt(progress.remainingDistanceM);
    }
  } else if (nextWaypoint) {
    const distanceToWaypointM = trailDistanceMeters(params.location, nextWaypoint.coordinate);
    if (distanceToWaypointM <= 240) {
      prompt = buildWaypointPrompt(nextWaypoint, distanceToWaypointM);
      statusLabel = 'Waypoint Ahead';
    } else {
      prompt = buildContinuePrompt(progress.remainingDistanceM);
    }
  } else if (progress.remainingDistanceM <= ARRIVAL_DISTANCE_M) {
    prompt = {
      title: 'Final destination ahead',
      detail: 'Expedition route complete',
      badge: 'arrived',
      distanceM: progress.remainingDistanceM,
    };
    statusLabel = 'Arriving';
  } else {
    prompt = buildContinuePrompt(progress.remainingDistanceM);
  }

  return {
    progress,
    prompt,
    nextWaypoint,
    nextDecisionPoint,
    reachedWaypointIds: Array.from(reachedWaypointIds),
    rejoinPoint,
    rejoinDistanceM,
    statusLabel,
    progressPercent,
    isOffTrail,
  };
}
