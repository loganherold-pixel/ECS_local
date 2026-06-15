import { haversineDistanceMiles } from '../map/routeGeometryUtils';
import type { TripBuilderConfidence } from './tripBuilderTypes';

export type ApproachResupplyCategory = 'fuel' | 'food_supplies';

export type ApproachResupplyCoordinate = {
  latitude: number;
  longitude: number;
};

export type ApproachResupplySearchAnchorBasis =
  | 'approach_corridor'
  | 'trailhead_fallback'
  | 'fallback_anchor';

export type ApproachResupplyFallbackState =
  | 'approach_route'
  | 'trailhead_only';

export type ApproachResupplyCandidate = {
  id: string;
  title: string;
  category: ApproachResupplyCategory;
  coordinate: ApproachResupplyCoordinate;
  sourceType?: string | null;
  confidence?: TripBuilderConfidence | number | { value?: number | null } | null;
  score?: number | null;
  routeOrder?: number | null;
  beforeTrailEntry?: boolean | null;
  distanceFromTrailheadMiles?: number | null;
  distanceFromApproachRouteMiles?: number | null;
  detourDistanceMiles?: number | null;
  warnings?: string[] | null;
};

export type ApproachResupplySearchAnchor = {
  coordinate: ApproachResupplyCoordinate;
  basis: ApproachResupplySearchAnchorBasis;
  progressRatio: number | null;
};

export type ApproachResupplyRankedOption = ApproachResupplyCandidate & {
  rank: number;
  approachScore: number;
  fallbackState: ApproachResupplyFallbackState;
  distanceFromTrailheadMiles: number | null;
  distanceFromApproachRouteMiles: number | null;
  routeDeviationMiles: number | null;
  approachProgressRatio: number | null;
  remainingApproachMilesToTrailhead: number | null;
  beforeTrailEntry: boolean | null;
  warnings: string[];
};

export type BuildApproachResupplySearchAnchorsArgs = {
  trailhead: ApproachResupplyCoordinate | null;
  approachRoute?: ApproachResupplyCoordinate[] | null;
  fallbackAnchor?: ApproachResupplyCoordinate | null;
  maxAnchors?: number | null;
};

export type RankApproachResupplyOptionsArgs = {
  category: ApproachResupplyCategory;
  origin?: ApproachResupplyCoordinate | null;
  trailhead: ApproachResupplyCoordinate | null;
  approachRoute?: ApproachResupplyCoordinate[] | null;
  candidates: ApproachResupplyCandidate[];
  limit?: number | null;
  maxRouteDeviationMiles?: number | null;
};

const DEFAULT_MAX_ROUTE_DEVIATION_MILES = 12;

function isValidCoordinate(point: ApproachResupplyCoordinate | null | undefined): point is ApproachResupplyCoordinate {
  return !!point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180;
}

function roundTenths(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function confidenceScore(value: ApproachResupplyCandidate['confidence']): number {
  if (value && typeof value === 'object' && 'value' in value) {
    const numeric = Number(value.value);
    if (Number.isFinite(numeric)) return numeric > 1 ? clamp01(numeric / 100) : clamp01(numeric);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1 ? clamp01(value / 100) : clamp01(value);
  if (value === 'high') return 0.9;
  if (value === 'medium') return 0.68;
  if (value === 'low') return 0.38;
  return 0.52;
}

function routeDistanceMiles(points: ApproachResupplyCoordinate[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineDistanceMiles(points[index - 1], points[index]);
  }
  return total;
}

function coordinateAtRouteProgress(
  points: ApproachResupplyCoordinate[],
  progressRatio: number,
): ApproachResupplyCoordinate | null {
  const validPoints = points.filter(isValidCoordinate);
  if (validPoints.length === 0) return null;
  if (validPoints.length === 1) return validPoints[0];

  const totalMiles = routeDistanceMiles(validPoints);
  if (totalMiles <= 0) return validPoints[validPoints.length - 1] ?? null;

  const targetMiles = totalMiles * clamp01(progressRatio);
  let coveredMiles = 0;

  for (let index = 1; index < validPoints.length; index += 1) {
    const start = validPoints[index - 1];
    const end = validPoints[index];
    const segmentMiles = haversineDistanceMiles(start, end);
    if (coveredMiles + segmentMiles >= targetMiles || index === validPoints.length - 1) {
      const ratio = segmentMiles > 0 ? clamp01((targetMiles - coveredMiles) / segmentMiles) : 0;
      return {
        latitude: start.latitude + (end.latitude - start.latitude) * ratio,
        longitude: start.longitude + (end.longitude - start.longitude) * ratio,
      };
    }
    coveredMiles += segmentMiles;
  }

  return validPoints[validPoints.length - 1] ?? null;
}

function projectionOnApproachRoute(
  points: ApproachResupplyCoordinate[],
  coordinate: ApproachResupplyCoordinate,
): {
  distanceFromRouteMiles: number;
  progressRatio: number;
  remainingMiles: number;
} | null {
  const validPoints = points.filter(isValidCoordinate);
  if (validPoints.length < 2) return null;

  const totalMiles = routeDistanceMiles(validPoints);
  if (totalMiles <= 0) return null;

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestProgressMiles = 0;
  let coveredMiles = 0;

  for (let index = 1; index < validPoints.length; index += 1) {
    const start = validPoints[index - 1];
    const end = validPoints[index];
    const dx = end.longitude - start.longitude;
    const dy = end.latitude - start.latitude;
    const denominator = dx * dx + dy * dy;
    const ratio = denominator > 0
      ? clamp01(((coordinate.longitude - start.longitude) * dx + (coordinate.latitude - start.latitude) * dy) / denominator)
      : 0;
    const projected = {
      latitude: start.latitude + dy * ratio,
      longitude: start.longitude + dx * ratio,
    };
    const segmentMiles = haversineDistanceMiles(start, end);
    const distance = haversineDistanceMiles(coordinate, projected);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestProgressMiles = coveredMiles + segmentMiles * ratio;
    }
    coveredMiles += segmentMiles;
  }

  const progressRatio = clamp01(bestProgressMiles / totalMiles);
  return {
    distanceFromRouteMiles: bestDistance,
    progressRatio,
    remainingMiles: Math.max(0, totalMiles - bestProgressMiles),
  };
}

function distanceScore(distanceMiles: number | null): number {
  if (distanceMiles == null) return 0.42;
  if (distanceMiles <= 8) return 1;
  if (distanceMiles <= 20) return 0.84;
  if (distanceMiles <= 40) return 0.58;
  if (distanceMiles <= 70) return 0.3;
  return 0.12;
}

function deviationScore(distanceMiles: number | null): number {
  if (distanceMiles == null) return 0.48;
  if (distanceMiles <= 0.6) return 1;
  if (distanceMiles <= 2) return 0.88;
  if (distanceMiles <= 6) return 0.6;
  if (distanceMiles <= 12) return 0.34;
  return 0.08;
}

function progressScore(progressRatio: number | null): number {
  if (progressRatio == null) return 0.48;
  if (progressRatio >= 0.72 && progressRatio <= 1) return 1;
  if (progressRatio >= 0.55) return 0.82;
  if (progressRatio >= 0.35) return 0.58;
  return 0.32;
}

function categoryScore(candidate: ApproachResupplyCandidate, category: ApproachResupplyCategory): number {
  return candidate.category === category ? 1 : 0.4;
}

function sameCoordinate(left: ApproachResupplyCoordinate, right: ApproachResupplyCoordinate): boolean {
  return Math.abs(left.latitude - right.latitude) < 0.00001 &&
    Math.abs(left.longitude - right.longitude) < 0.00001;
}

function pushAnchor(
  anchors: ApproachResupplySearchAnchor[],
  anchor: ApproachResupplySearchAnchor,
): void {
  if (!isValidCoordinate(anchor.coordinate)) return;
  if (anchors.some((existing) => sameCoordinate(existing.coordinate, anchor.coordinate))) return;
  anchors.push(anchor);
}

export function buildApproachResupplySearchAnchors({
  trailhead,
  approachRoute = [],
  fallbackAnchor = null,
  maxAnchors = 7,
}: BuildApproachResupplySearchAnchorsArgs): ApproachResupplySearchAnchor[] {
  const limit = Math.max(2, Math.floor(maxAnchors ?? 7));
  const routePoints = (approachRoute ?? []).filter(isValidCoordinate);
  const anchors: ApproachResupplySearchAnchor[] = [];
  const hasTrailhead = !!trailhead && isValidCoordinate(trailhead);
  const approachAnchorLimit = Math.max(1, hasTrailhead ? limit - 1 : limit);

  if (routePoints.length >= 2) {
    const fullCorridorRatios = [0.08, 0.18, 0.34, 0.55, 0.74, 0.94];
    const compactCorridorRatios = [0.12, 0.4, 0.68, 0.92];
    const sampleRatios = approachAnchorLimit <= 4 ? compactCorridorRatios : fullCorridorRatios;
    sampleRatios.slice(0, approachAnchorLimit).forEach((ratio) => {
      const coordinate = coordinateAtRouteProgress(routePoints, ratio);
      if (coordinate) {
        pushAnchor(anchors, {
          coordinate,
          basis: 'approach_corridor',
          progressRatio: Math.round(ratio * 100) / 100,
        });
      }
    });
  } else if (fallbackAnchor && isValidCoordinate(fallbackAnchor)) {
    pushAnchor(anchors, {
      coordinate: fallbackAnchor,
      basis: 'fallback_anchor',
      progressRatio: null,
    });
  }

  if (hasTrailhead) {
    pushAnchor(anchors, {
      coordinate: trailhead,
      basis: 'trailhead_fallback',
      progressRatio: 1,
    });
  }

  return anchors.slice(0, limit);
}

export function rankApproachResupplyOptions({
  category,
  origin = null,
  trailhead,
  approachRoute = [],
  candidates,
  limit = 5,
  maxRouteDeviationMiles = DEFAULT_MAX_ROUTE_DEVIATION_MILES,
}: RankApproachResupplyOptionsArgs): ApproachResupplyRankedOption[] {
  const routePoints = (approachRoute ?? []).filter(isValidCoordinate);
  const hasApproachRoute = isValidCoordinate(origin) && routePoints.length >= 2;
  const fallbackState: ApproachResupplyFallbackState = hasApproachRoute ? 'approach_route' : 'trailhead_only';
  const maxDeviation = maxRouteDeviationMiles ?? DEFAULT_MAX_ROUTE_DEVIATION_MILES;

  return candidates
    .filter((candidate) => candidate.category === category && isValidCoordinate(candidate.coordinate))
    .map((candidate) => {
      const projection = projectionOnApproachRoute(routePoints, candidate.coordinate);
      const distanceFromTrailheadMiles = roundTenths(
        candidate.distanceFromTrailheadMiles ??
        (trailhead && isValidCoordinate(trailhead) ? haversineDistanceMiles(trailhead, candidate.coordinate) : null),
      );
      const distanceFromApproachRouteMiles = roundTenths(
        candidate.distanceFromApproachRouteMiles ??
        projection?.distanceFromRouteMiles ??
        null,
      );
      const routeDeviationMiles = roundTenths(
        candidate.detourDistanceMiles ??
        distanceFromApproachRouteMiles,
      );
      const approachProgressRatio = projection ? Math.round(projection.progressRatio * 1000) / 1000 : null;
      const remainingApproachMilesToTrailhead = roundTenths(
        projection
          ? projection.remainingMiles + Math.max(0, routeDeviationMiles ?? 0)
          : distanceFromTrailheadMiles,
      );
      const beforeTrailEntry = candidate.beforeTrailEntry === false ? false : candidate.beforeTrailEntry ?? (
        projection ? projection.progressRatio <= 1 : null
      );
      const warnings = [...(candidate.warnings ?? [])];
      if (fallbackState === 'trailhead_only') {
        warnings.push('GPS approach route is unavailable; ECS used trailhead-only fallback ranking.');
      }
      if (routeDeviationMiles != null && routeDeviationMiles > maxDeviation) {
        warnings.push('Candidate appears to require a large approach-route deviation.');
      }
      if (beforeTrailEntry === false) {
        warnings.push('Candidate appears after trail entry; keep it out of the pre-trail guidance sequence unless verified.');
      }

      const providerScore = typeof candidate.score === 'number' && Number.isFinite(candidate.score)
        ? clamp01(candidate.score > 1 ? candidate.score / 100 : candidate.score)
        : null;
      const baseScore =
        distanceScore(remainingApproachMilesToTrailhead) * 0.3 +
        deviationScore(routeDeviationMiles) * 0.28 +
        progressScore(approachProgressRatio) * 0.16 +
        (beforeTrailEntry === false ? 0.08 : 1) * 0.12 +
        categoryScore(candidate, category) * 0.08 +
        confidenceScore(candidate.confidence) * 0.06;
      const routeOrderBoost = candidate.routeOrder != null && Number.isFinite(candidate.routeOrder)
        ? Math.max(0, 0.04 - Math.max(0, candidate.routeOrder) * 0.005)
        : 0;
      const approachScore = clamp01(
        (providerScore == null ? baseScore : baseScore * 0.86 + providerScore * 0.14) + routeOrderBoost,
      );

      return {
        ...candidate,
        fallbackState,
        distanceFromTrailheadMiles,
        distanceFromApproachRouteMiles,
        routeDeviationMiles,
        approachProgressRatio,
        remainingApproachMilesToTrailhead,
        beforeTrailEntry,
        warnings,
        approachScore: Math.round(approachScore * 1000) / 1000,
        rank: 0,
      };
    })
    .sort((left, right) => (
      right.approachScore - left.approachScore ||
      (left.routeOrder ?? Number.POSITIVE_INFINITY) - (right.routeOrder ?? Number.POSITIVE_INFINITY) ||
      left.title.localeCompare(right.title)
    ))
    .slice(0, Math.max(0, limit ?? 5))
    .map((option, index) => ({ ...option, rank: index + 1 }));
}
