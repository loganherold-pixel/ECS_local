import {
  haversineDistanceMeters,
  nearestPointOnRoute,
  normalizeRouteGeometryCoordinates,
  totalRouteDistanceMeters,
} from '../routeContext/routeContextGeometry';
import { orientGuidanceRouteFromStart } from '../navigation/guidanceRouteProjection';
import type { TripBuilderConfidence } from './tripBuilderTypes';

const METERS_PER_MILE = 1609.344;

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

export type ApproachResupplyOperatingStatus =
  | 'open'
  | 'closed'
  | 'temporarily_closed'
  | 'unknown';

export type ApproachResupplyRouteEvidenceState =
  | 'provider_route'
  | 'corridor_offset_estimate'
  | 'unavailable';

export type ApproachResupplyRemoteEntrySource =
  | 'practical_trail_entry'
  | 'known_service_boundary'
  | 'route_metadata'
  | 'remoteness_estimate'
  | 'trailhead_estimate'
  | 'unavailable';

export type ApproachResupplyCorridorTier = 'preferred' | 'acceptable';

export type ApproachResupplyCategoryUsefulness =
  | 'combined'
  | 'category_match'
  | 'convenience_only';

export type ApproachResupplyRemoteEntry = {
  coordinate?: ApproachResupplyCoordinate | null;
  progressRatio?: number | null;
  source: ApproachResupplyRemoteEntrySource;
  confidence: TripBuilderConfidence;
  estimated: boolean;
  label: string;
  conflictReason?: 'coordinate_progress_mismatch' | null;
};

export type ApproachResupplyRoutePosition =
  | 'behind_origin'
  | 'on_approach'
  | 'after_remote_entry'
  | 'after_trailhead'
  | 'unknown';

export type ApproachResupplyExclusionReason =
  | 'category_mismatch'
  | 'invalid_coordinate'
  | 'known_closed'
  | 'inaccessible'
  | 'unverified_routed_access'
  | 'approach_route_unavailable'
  | 'behind_origin'
  | 'after_remote_entry'
  | 'after_trailhead'
  | 'excessive_corridor_offset'
  | 'excessive_detour';

export type ApproachResupplyCandidate = {
  id: string;
  placeIdentity?: string | null;
  title: string;
  category: ApproachResupplyCategory;
  categoryCoverage?: ApproachResupplyCategory[] | null;
  coordinate: ApproachResupplyCoordinate;
  sourceType?: string | null;
  confidence?: TripBuilderConfidence | number | { value?: number | null } | null;
  coordinateConfidence?: TripBuilderConfidence | number | null;
  score?: number | null;
  routeOrder?: number | null;
  beforeTrailEntry?: boolean | null;
  distanceFromTrailheadMiles?: number | null;
  distanceFromApproachRouteMiles?: number | null;
  detourDistanceMiles?: number | null;
  detourDurationMinutes?: number | null;
  operatingStatus?: ApproachResupplyOperatingStatus | null;
  accessStatus?: 'accessible' | 'inaccessible' | 'unknown' | null;
  categoryUsefulness?: ApproachResupplyCategoryUsefulness | null;
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
  categoryCoverage: ApproachResupplyCategory[];
  operatingStatus: ApproachResupplyOperatingStatus;
  distanceFromOriginMiles: number | null;
  distanceFromTrailheadMiles: number | null;
  distanceFromApproachRouteMiles: number | null;
  corridorTier: ApproachResupplyCorridorTier;
  routeDeviationMiles: number | null;
  detourDurationMinutes: number | null;
  approachProgressRatio: number | null;
  remainingApproachMilesToTrailhead: number | null;
  distanceBeforeRemoteEntryMiles: number | null;
  beforeTrailEntry: boolean | null;
  beforeRemoteEntry: boolean | null;
  routePosition: ApproachResupplyRoutePosition;
  routeEvidenceState: ApproachResupplyRouteEvidenceState;
  routeAwareConfidence: TripBuilderConfidence;
  remoteEntrySource: ApproachResupplyRemoteEntrySource;
  remoteEntryConfidence: TripBuilderConfidence;
  remoteEntryEstimated: boolean;
  remoteEntryLabel: string;
  categoryUsefulness: ApproachResupplyCategoryUsefulness;
  providerDataCompleteness: number;
  exclusionReasons: [];
  warnings: string[];
};

export type ApproachResupplyExcludedOption = ApproachResupplyCandidate & {
  exclusionReasons: ApproachResupplyExclusionReason[];
  warnings: string[];
};

export type ApproachResupplyDiagnosticRow = {
  candidateId: string;
  candidateName: string;
  category: string;
  corridorOffsetMiles: number | null;
  routeProgress: number | null;
  milesRemainingBeforeTrailEntry: number | null;
  routedDetourMinutes: number | null;
  routedDetourMiles: number | null;
  accepted: boolean;
  rejectionReason: string | null;
  finalRank: number | null;
};

export type ApproachResupplyInventory = {
  ranked: ApproachResupplyRankedOption[];
  excluded: ApproachResupplyExcludedOption[];
  diagnostics: ApproachResupplyDiagnosticRow[];
  fallbackState: ApproachResupplyFallbackState;
  routeAwareConfidence: TripBuilderConfidence;
  remoteEntry: ApproachResupplyRemoteEntry;
};

export type ApproachResupplyStopPlanStatus =
  | 'combined'
  | 'separate'
  | 'partial'
  | 'unavailable';

export type ApproachResupplyStopPlan = {
  status: ApproachResupplyStopPlanStatus;
  stops: ApproachResupplyRankedOption[];
  categoryCoverage: ApproachResupplyCategory[];
  missingCategories: ApproachResupplyCategory[];
  explanation: string;
};

export type ApproachResupplyProviderCoverageState =
  | 'complete'
  | 'partial_results'
  | 'retryable_error';

export type BuildApproachResupplySearchAnchorsArgs = {
  origin?: ApproachResupplyCoordinate | null;
  trailhead: ApproachResupplyCoordinate | null;
  approachRoute?: ApproachResupplyCoordinate[] | null;
  fallbackAnchor?: ApproachResupplyCoordinate | null;
  remoteEntry?: ApproachResupplyRemoteEntry | null;
  remoteEntryProgressRatio?: number | null;
  maxAnchors?: number | null;
  searchRadiusMiles?: number | null;
};

export type ApproachResupplySearchCoverage = {
  complete: boolean;
  totalApproachMiles: number;
  coveredApproachMiles: number;
  gaps: { startMile: number; endMile: number }[];
};

export type RankApproachResupplyOptionsArgs = {
  category: ApproachResupplyCategory;
  origin?: ApproachResupplyCoordinate | null;
  trailhead: ApproachResupplyCoordinate | null;
  approachRoute?: ApproachResupplyCoordinate[] | null;
  candidates: ApproachResupplyCandidate[];
  limit?: number | null;
  maxRouteDeviationMiles?: number | null;
  maxCorridorOffsetMiles?: number | null;
  preferredRouteBufferMiles?: number | null;
  preferredRoutedDetourMiles?: number | null;
  preferredCorridorOffsetMiles?: number | null;
  remoteEntry?: ApproachResupplyRemoteEntry | null;
  remoteEntryProgressRatio?: number | null;
  remoteEntryBufferMiles?: number | null;
  requireRoutedAccess?: boolean | null;
};

export const APPROACH_RESUPPLY_POLICY = Object.freeze({
  preferredCorridorOffsetMiles: 0.1,
  preferredRoutedDetourMiles: 10,
  maximumCorridorOffsetMiles: 0.2,
  // Backward-compatible name for callers that still supply the routed-detour preference.
  preferredRouteBufferMiles: 10,
  maximumRouteDetourMiles: 20,
  maximumRemoteEntryProjectionOffsetMiles: 5,
  maximumRemoteEntryProgressMismatchRatio: 0.08,
  trailheadEstimateProgressRatio: 1,
  minimumRemoteEntryProgressRatio: 0.55,
});

function isValidCoordinate(point: ApproachResupplyCoordinate | null | undefined): point is ApproachResupplyCoordinate {
  return !!point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180;
}

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function roundTenths(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;
}

function roundThousandths(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 1000) / 1000;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampProgress(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function toRouteCoordinate(point: ApproachResupplyCoordinate): { lat: number; lng: number } {
  return { lat: point.latitude, lng: point.longitude };
}

function fromRouteCoordinate(point: { lat: number; lng: number }): ApproachResupplyCoordinate {
  return { latitude: point.lat, longitude: point.lng };
}

function normalizeOperatingStatus(value: ApproachResupplyCandidate['operatingStatus']): ApproachResupplyOperatingStatus {
  return value === 'open' || value === 'closed' || value === 'temporarily_closed' ? value : 'unknown';
}

function normalizeCategoryCoverage(candidate: ApproachResupplyCandidate): ApproachResupplyCategory[] {
  const coverage = [candidate.category, ...(candidate.categoryCoverage ?? [])]
    .filter((category): category is ApproachResupplyCategory => category === 'fuel' || category === 'food_supplies');
  return Array.from(new Set(coverage));
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
  return 0.42;
}

function confidenceLabel(value: ApproachResupplyCandidate['confidence']): TripBuilderConfidence {
  const score = confidenceScore(value);
  if (score >= 0.78) return 'high';
  if (score >= 0.5) return 'medium';
  if (score > 0) return 'low';
  return 'unknown';
}

function canonicalizeApproachRoute(
  points: ApproachResupplyCoordinate[],
  origin: ApproachResupplyCoordinate | null | undefined,
  trailhead: ApproachResupplyCoordinate | null | undefined,
): { lat: number; lng: number }[] {
  const valid = normalizeRouteGeometryCoordinates(points.filter(isValidCoordinate).map(toRouteCoordinate));
  if (valid.length < 2) return valid;
  const preferredOrigin = isValidCoordinate(origin) ? toRouteCoordinate(origin) : null;
  let oriented = orientGuidanceRouteFromStart(valid, preferredOrigin);
  if (preferredOrigin && isValidCoordinate(trailhead)) {
    const trailheadPoint = toRouteCoordinate(trailhead);
    const first = oriented[0];
    const last = oriented[oriented.length - 1];
    const forwardCost =
      (haversineDistanceMeters(preferredOrigin, first) ?? 0) +
      (haversineDistanceMeters(trailheadPoint, last) ?? 0);
    const reverseCost =
      (haversineDistanceMeters(preferredOrigin, last) ?? 0) +
      (haversineDistanceMeters(trailheadPoint, first) ?? 0);
    if (reverseCost < forwardCost) oriented = oriented.slice().reverse();
  }

  const startProjection = preferredOrigin
    ? nearestPointOnRoute(preferredOrigin, oriented)
    : null;
  if (!isValidCoordinate(trailhead)) return oriented;
  const entryProjection = nearestPointOnRoute(toRouteCoordinate(trailhead), oriented);
  if (
    !entryProjection ||
    entryProjection.distanceMeters / METERS_PER_MILE >
      APPROACH_RESUPPLY_POLICY.maximumRemoteEntryProjectionOffsetMiles
  ) {
    return [];
  }
  if (
    preferredOrigin &&
    (!startProjection ||
      startProjection.distanceMeters / METERS_PER_MILE >
        APPROACH_RESUPPLY_POLICY.maximumRemoteEntryProjectionOffsetMiles)
  ) {
    return [];
  }

  const startMeters = startProjection?.distanceAlongRouteMeters ?? 0;
  if (startMeters > entryProjection.distanceAlongRouteMeters + 1) return [];
  const startPoint = startProjection?.point ?? oriented[0];
  const startSegmentIndex = startProjection?.segmentIndex ?? 0;
  const sliced = [startPoint];
  for (
    let index = startSegmentIndex + 1;
    index <= entryProjection.segmentIndex && index < oriented.length;
    index += 1
  ) {
    sliced.push(oriented[index]);
  }
  sliced.push(entryProjection.point);
  return normalizeRouteGeometryCoordinates(sliced);
}

export function buildApproachResupplyRouteFingerprint(
  approachRoute: ApproachResupplyCoordinate[],
): string {
  const route = canonicalizeApproachRoute(approachRoute, null, null);
  if (route.length < 2) return 'no-approach';
  let hash = 0x811c9dc5;
  route.forEach((point) => {
    const encoded = `${point.lat.toFixed(5)},${point.lng.toFixed(5)};`;
    for (let index = 0; index < encoded.length; index += 1) {
      hash ^= encoded.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  });
  const distanceMeters = Math.round(totalRouteDistanceMeters(route));
  return `approach:${route.length}:${distanceMeters}:${(hash >>> 0).toString(36)}`;
}

function coordinateAtRouteProgress(
  points: { lat: number; lng: number }[],
  progressRatio: number,
): ApproachResupplyCoordinate | null {
  if (points.length === 0) return null;
  if (points.length === 1) return fromRouteCoordinate(points[0]);
  const totalMeters = totalRouteDistanceMeters(points);
  if (totalMeters <= 0) return fromRouteCoordinate(points[points.length - 1]);
  const targetMeters = totalMeters * clamp01(progressRatio);
  let coveredMeters = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segmentMeters = haversineDistanceMeters(start, end) ?? 0;
    if (coveredMeters + segmentMeters >= targetMeters || index === points.length - 1) {
      const ratio = segmentMeters > 0 ? clamp01((targetMeters - coveredMeters) / segmentMeters) : 0;
      return {
        latitude: start.lat + (end.lat - start.lat) * ratio,
        longitude: start.lng + (end.lng - start.lng) * ratio,
      };
    }
    coveredMeters += segmentMeters;
  }
  return fromRouteCoordinate(points[points.length - 1]);
}

function signedAlongSegmentMeters(
  segmentStart: { lat: number; lng: number },
  segmentEnd: { lat: number; lng: number },
  point: { lat: number; lng: number },
): number {
  const referenceLat = ((segmentStart.lat + segmentEnd.lat + point.lat) / 3) * (Math.PI / 180);
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = Math.max(1, 111320 * Math.cos(referenceLat));
  const segmentX = (segmentEnd.lng - segmentStart.lng) * metersPerDegreeLng;
  const segmentY = (segmentEnd.lat - segmentStart.lat) * metersPerDegreeLat;
  const pointX = (point.lng - segmentStart.lng) * metersPerDegreeLng;
  const pointY = (point.lat - segmentStart.lat) * metersPerDegreeLat;
  const segmentLength = Math.hypot(segmentX, segmentY);
  return segmentLength > 0 ? (pointX * segmentX + pointY * segmentY) / segmentLength : 0;
}

function endpointRoutePosition(
  route: { lat: number; lng: number }[],
  coordinate: ApproachResupplyCoordinate,
  projection: ReturnType<typeof nearestPointOnRoute>,
): 'behind_origin' | 'after_trailhead' | 'on_approach' {
  if (!projection || route.length < 2) return 'on_approach';
  const point = toRouteCoordinate(coordinate);
  if (projection.segmentIndex === 0 && projection.segmentRatio <= 0.000001) {
    if (signedAlongSegmentMeters(route[0], route[1], point) < -1) return 'behind_origin';
  }
  const lastSegmentIndex = route.length - 2;
  if (projection.segmentIndex === lastSegmentIndex && projection.segmentRatio >= 0.999999) {
    if (signedAlongSegmentMeters(route[route.length - 2], route[route.length - 1], point) >
      (haversineDistanceMeters(route[route.length - 2], route[route.length - 1]) ?? 0) + 1) {
      return 'after_trailhead';
    }
  }
  return 'on_approach';
}

export function classifyApproachResupplyRoutePosition(input: {
  approachRoute: ApproachResupplyCoordinate[];
  coordinate: ApproachResupplyCoordinate;
  origin?: ApproachResupplyCoordinate | null;
  trailhead?: ApproachResupplyCoordinate | null;
}): ApproachResupplyRoutePosition {
  if (!isValidCoordinate(input.coordinate)) return 'unknown';
  const route = canonicalizeApproachRoute(input.approachRoute, input.origin, input.trailhead);
  if (route.length < 2) return 'unknown';
  const projection = nearestPointOnRoute(toRouteCoordinate(input.coordinate), route);
  return projection ? endpointRoutePosition(route, input.coordinate, projection) : 'unknown';
}

export function inferApproachRemoteEntry(input: {
  knownCoordinate?: ApproachResupplyCoordinate | null;
  knownProgressRatio?: number | null;
  source?: 'known_service_boundary' | 'route_metadata';
  confidence?: TripBuilderConfidence | null;
  remotenessScore?: number | null;
  allowTrailheadEstimate?: boolean;
}): ApproachResupplyRemoteEntry {
  if (isValidCoordinate(input.knownCoordinate) || typeof input.knownProgressRatio === 'number') {
    return {
      coordinate: isValidCoordinate(input.knownCoordinate) ? input.knownCoordinate : null,
      progressRatio: typeof input.knownProgressRatio === 'number'
        ? clampProgress(input.knownProgressRatio, 0, 1)
        : null,
      source: input.source ?? 'known_service_boundary',
      confidence: input.confidence ?? 'high',
      estimated: false,
      label: input.source === 'route_metadata' ? 'Route metadata service boundary' : 'Known service-loss boundary',
    };
  }

  if (input.allowTrailheadEstimate !== false) {
    return {
      coordinate: null,
      progressRatio: APPROACH_RESUPPLY_POLICY.trailheadEstimateProgressRatio,
      source: 'practical_trail_entry',
      confidence: 'high',
      estimated: false,
      label: 'Resolved practical trail entry',
    };
  }

  return {
    coordinate: null,
    progressRatio: null,
    source: 'unavailable',
    confidence: 'unknown',
    estimated: false,
    label: 'Service-loss entry unavailable',
  };
}

function resolveRemoteEntry(
  route: { lat: number; lng: number }[],
  supplied: ApproachResupplyRemoteEntry | null | undefined,
  legacyRatio: number | null | undefined,
): ApproachResupplyRemoteEntry {
  if (route.length < 2) return inferApproachRemoteEntry({ allowTrailheadEstimate: false });
  const base = supplied ?? (typeof legacyRatio === 'number'
    ? {
        coordinate: null,
        progressRatio: legacyRatio,
        source: 'remoteness_estimate' as const,
        confidence: 'low' as const,
        estimated: true,
        label: 'Estimated service-loss entry from ECS remoteness',
      }
    : inferApproachRemoteEntry({}));
  const suppliedProgressRatio = finiteNonNegative(base.progressRatio);
  if (suppliedProgressRatio != null) {
    let coordinate = base.coordinate ?? null;
    let label = base.label;
    let progressRatio = clampProgress(
      suppliedProgressRatio,
      base.estimated ? APPROACH_RESUPPLY_POLICY.minimumRemoteEntryProgressRatio : 0,
      1,
    );
    if (isValidCoordinate(coordinate)) {
      const projection = nearestPointOnRoute(toRouteCoordinate(coordinate), route);
      const totalMeters = totalRouteDistanceMeters(route);
      const projectionOffsetMiles = projection?.distanceMeters == null
        ? Number.POSITIVE_INFINITY
        : projection.distanceMeters / METERS_PER_MILE;
      if (projectionOffsetMiles > APPROACH_RESUPPLY_POLICY.maximumRemoteEntryProjectionOffsetMiles) {
        coordinate = null;
        label = `${label}; off-approach boundary coordinate ignored in favor of explicit approach progress`;
      } else if (projection && totalMeters > 0) {
        const projectedProgressRatio = clampProgress(projection.distanceAlongRouteMeters / totalMeters, 0, 1);
        const conflict = Math.abs(projectedProgressRatio - progressRatio) >
          APPROACH_RESUPPLY_POLICY.maximumRemoteEntryProgressMismatchRatio;
        progressRatio = projectedProgressRatio;
        if (conflict) {
          return {
            ...base,
            coordinate,
            progressRatio,
            confidence: 'low',
            estimated: false,
            conflictReason: 'coordinate_progress_mismatch',
            label: `${label}; conflicting route metadata, boundary progress projected from on-approach coordinate`,
          };
        }
      }
    }
    return {
      ...base,
      coordinate,
      label,
      progressRatio,
    };
  }
  if (isValidCoordinate(base.coordinate)) {
    const projection = nearestPointOnRoute(toRouteCoordinate(base.coordinate), route);
    const totalMeters = totalRouteDistanceMeters(route);
    const projectionOffsetMiles = projection?.distanceMeters == null
      ? Number.POSITIVE_INFINITY
      : projection.distanceMeters / METERS_PER_MILE;
    if (
      projection &&
      totalMeters > 0 &&
      projectionOffsetMiles <= APPROACH_RESUPPLY_POLICY.maximumRemoteEntryProjectionOffsetMiles
    ) {
      return {
        ...base,
        progressRatio: clampProgress(projection.distanceAlongRouteMeters / totalMeters, 0, 1),
      };
    }
  }
  return {
    coordinate: null,
    progressRatio: APPROACH_RESUPPLY_POLICY.trailheadEstimateProgressRatio,
    source: 'trailhead_estimate',
    confidence: 'low',
    estimated: true,
    label: isValidCoordinate(base.coordinate)
      ? 'Estimated service boundary near trailhead; supplied boundary was outside the canonical approach corridor'
      : 'Estimated service boundary near trailhead; supplied boundary lacked usable approach position',
  };
}

function sameCoordinate(left: ApproachResupplyCoordinate, right: ApproachResupplyCoordinate): boolean {
  return Math.abs(left.latitude - right.latitude) < 0.00001 &&
    Math.abs(left.longitude - right.longitude) < 0.00001;
}

function pushAnchor(anchors: ApproachResupplySearchAnchor[], anchor: ApproachResupplySearchAnchor): void {
  if (!isValidCoordinate(anchor.coordinate)) return;
  if (anchors.some((existing) => sameCoordinate(existing.coordinate, anchor.coordinate))) return;
  anchors.push(anchor);
}

export function buildApproachResupplySearchAnchors({
  origin = null,
  trailhead,
  approachRoute = [],
  fallbackAnchor = null,
  remoteEntry: _remoteEntry = null,
  remoteEntryProgressRatio: _remoteEntryProgressRatio = null,
  maxAnchors = 7,
  searchRadiusMiles = 10,
}: BuildApproachResupplySearchAnchorsArgs): ApproachResupplySearchAnchor[] {
  const limit = Math.max(2, Math.floor(maxAnchors ?? 7));
  const route = canonicalizeApproachRoute(approachRoute ?? [], origin, trailhead);
  const anchors: ApproachResupplySearchAnchor[] = [];
  const hasTrailhead = !!trailhead && isValidCoordinate(trailhead);
  const approachAnchorLimit = Math.max(1, hasTrailhead ? limit - 1 : limit);

  if (route.length >= 2) {
    const totalMiles = totalRouteDistanceMeters(route) / METERS_PER_MILE;
    const radiusMiles = Math.max(0.25, finiteNonNegative(searchRadiusMiles) ?? 10);
    // Ninety-percent diameter spacing gives neighboring provider windows a
    // deterministic overlap instead of leaving fixed-ratio gaps on long routes.
    const spacingMiles = Math.max(0.25, radiusMiles * 1.8);
    const ratios: number[] = [];
    for (let distanceFromEntry = spacingMiles; distanceFromEntry < totalMiles; distanceFromEntry += spacingMiles) {
      ratios.push(clamp01(1 - distanceFromEntry / totalMiles));
    }
    ratios.push(0);
    ratios
      .slice(0, approachAnchorLimit)
      .forEach((ratio) => {
        const coordinate = coordinateAtRouteProgress(route, ratio);
        if (coordinate) pushAnchor(anchors, { coordinate, basis: 'approach_corridor', progressRatio: ratio });
      });
  } else if (fallbackAnchor && isValidCoordinate(fallbackAnchor)) {
    pushAnchor(anchors, { coordinate: fallbackAnchor, basis: 'fallback_anchor', progressRatio: null });
  }

  if (hasTrailhead) {
    pushAnchor(anchors, { coordinate: trailhead, basis: 'trailhead_fallback', progressRatio: 1 });
  }
  return anchors.slice(0, limit);
}

export function assessApproachResupplySearchCoverage(input: {
  origin?: ApproachResupplyCoordinate | null;
  trailhead: ApproachResupplyCoordinate | null;
  approachRoute?: ApproachResupplyCoordinate[] | null;
  anchors: ApproachResupplySearchAnchor[];
  searchRadiusMiles: number;
}): ApproachResupplySearchCoverage {
  const route = canonicalizeApproachRoute(input.approachRoute ?? [], input.origin, input.trailhead);
  const totalApproachMiles = totalRouteDistanceMeters(route) / METERS_PER_MILE;
  if (route.length < 2 || totalApproachMiles <= 0) {
    return { complete: false, totalApproachMiles, coveredApproachMiles: 0, gaps: [] };
  }
  const radiusMiles = Math.max(0, finiteNonNegative(input.searchRadiusMiles) ?? 0);
  const intervals = input.anchors
    .flatMap((anchor) => {
      const projection = nearestPointOnRoute(toRouteCoordinate(anchor.coordinate), route);
      if (!projection) return [];
      const centerMile = projection.distanceAlongRouteMeters / METERS_PER_MILE;
      return [{
        startMile: Math.max(0, centerMile - radiusMiles),
        endMile: Math.min(totalApproachMiles, centerMile + radiusMiles),
      }];
    })
    .sort((left, right) => left.startMile - right.startMile || left.endMile - right.endMile);
  const merged: { startMile: number; endMile: number }[] = [];
  intervals.forEach((interval) => {
    const previous = merged[merged.length - 1];
    if (!previous || interval.startMile > previous.endMile + 0.01) {
      merged.push({ ...interval });
    } else {
      previous.endMile = Math.max(previous.endMile, interval.endMile);
    }
  });
  const gaps: { startMile: number; endMile: number }[] = [];
  let cursor = 0;
  merged.forEach((interval) => {
    if (interval.startMile > cursor + 0.01) gaps.push({ startMile: cursor, endMile: interval.startMile });
    cursor = Math.max(cursor, interval.endMile);
  });
  if (cursor < totalApproachMiles - 0.01) gaps.push({ startMile: cursor, endMile: totalApproachMiles });
  const coveredApproachMiles = merged.reduce(
    (sum, interval) => sum + Math.max(0, interval.endMile - interval.startMile),
    0,
  );
  return {
    complete: gaps.length === 0,
    totalApproachMiles,
    coveredApproachMiles: Math.min(totalApproachMiles, coveredApproachMiles),
    gaps,
  };
}

export function interleaveApproachSearchResults<T>(buckets: readonly (readonly T[])[]): T[] {
  const results: T[] = [];
  const maximumBucketLength = buckets.reduce((maximum, bucket) => Math.max(maximum, bucket.length), 0);
  for (let offset = 0; offset < maximumBucketLength; offset += 1) {
    buckets.forEach((bucket) => {
      const candidate = bucket[offset];
      if (candidate !== undefined) results.push(candidate);
    });
  }
  return results;
}

export function prioritizeApproachSearchResults<T>(input: {
  anchors: ApproachResupplySearchAnchor[];
  buckets: readonly (readonly T[])[];
  finalApproachProgressRatio?: number;
  reservedPerFinalAnchor?: number;
}): T[] {
  const finalApproachProgressRatio = clamp01(input.finalApproachProgressRatio ?? 0.75);
  const reservedPerFinalAnchor = Math.max(1, Math.floor(input.reservedPerFinalAnchor ?? 3));
  const orderedAnchorIndexes = input.anchors
    .map((anchor, index) => ({ anchor, index }))
    .sort((left, right) => (
      (right.anchor.progressRatio ?? Number.NEGATIVE_INFINITY) -
        (left.anchor.progressRatio ?? Number.NEGATIVE_INFINITY) ||
      left.index - right.index
    ));
  const finalAnchorIndexes = orderedAnchorIndexes
    .filter(({ anchor }) => (anchor.progressRatio ?? 0) >= finalApproachProgressRatio)
    .map(({ index }) => index);
  const reserved = finalAnchorIndexes.flatMap((index) => (
    (input.buckets[index] ?? []).slice(0, reservedPerFinalAnchor)
  ));
  const remainingBuckets = orderedAnchorIndexes.map(({ index }) => (
    (input.buckets[index] ?? []).slice(finalAnchorIndexes.includes(index) ? reservedPerFinalAnchor : 0)
  ));
  return [...reserved, ...interleaveApproachSearchResults(remainingBuckets)];
}

export function classifyApproachResupplyProviderCoverage(input: {
  expectedAnchorCount: number;
  coveredAnchorCount: number;
  failedAnchorCount: number;
  resultCount: number;
  routeCoverageComplete?: boolean;
}): ApproachResupplyProviderCoverageState {
  const incomplete = input.routeCoverageComplete === false ||
    input.failedAnchorCount > 0 ||
    input.coveredAnchorCount < input.expectedAnchorCount;
  if (!incomplete) return 'complete';
  return input.resultCount > 0 ? 'partial_results' : 'retryable_error';
}

function normalizeCategoryUsefulness(
  candidate: ApproachResupplyCandidate,
  coverage: ApproachResupplyCategory[],
): ApproachResupplyCategoryUsefulness {
  // A fuel stop whose only supply evidence is a convenience store remains the
  // weaker supply match even though it technically covers both categories.
  if (candidate.categoryUsefulness === 'convenience_only') return 'convenience_only';
  if (coverage.includes('fuel') && coverage.includes('food_supplies')) return 'combined';
  return 'category_match';
}

function categoryUsefulnessRank(value: ApproachResupplyCategoryUsefulness): number {
  if (value === 'combined') return 0;
  if (value === 'category_match') return 1;
  return 2;
}

function providerDataCompleteness(candidate: ApproachResupplyCandidate): number {
  return [
    candidate.coordinateConfidence != null,
    normalizeOperatingStatus(candidate.operatingStatus) !== 'unknown',
    candidate.accessStatus === 'accessible',
    finiteNonNegative(candidate.detourDistanceMiles) != null,
    finiteNonNegative(candidate.detourDurationMinutes) != null,
  ].filter(Boolean).length;
}

function finiteSortValue(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : Number.POSITIVE_INFINITY;
}

/**
 * Product-order comparator. Hard eligibility is resolved before this runs;
 * no blended score, provider popularity, or evidence-source preference may
 * move an earlier approach stop ahead of the last practical valid stop.
 */
export function compareApproachResupplyRankedOptions(
  left: ApproachResupplyRankedOption,
  right: ApproachResupplyRankedOption,
): number {
  const remainingDelta =
    finiteSortValue(left.remainingApproachMilesToTrailhead) -
    finiteSortValue(right.remainingApproachMilesToTrailhead);
  if (Math.abs(remainingDelta) > 0.000001) return remainingDelta;

  const corridorTierDelta =
    (left.corridorTier === 'preferred' ? 0 : 1) -
    (right.corridorTier === 'preferred' ? 0 : 1);
  if (corridorTierDelta !== 0) return corridorTierDelta;

  const detourTimeDelta =
    finiteSortValue(left.detourDurationMinutes) -
    finiteSortValue(right.detourDurationMinutes);
  if (Math.abs(detourTimeDelta) > 0.000001) return detourTimeDelta;

  const detourDistanceDelta =
    finiteSortValue(left.routeDeviationMiles) -
    finiteSortValue(right.routeDeviationMiles);
  if (Math.abs(detourDistanceDelta) > 0.000001) return detourDistanceDelta;

  const usefulnessDelta =
    categoryUsefulnessRank(left.categoryUsefulness) -
    categoryUsefulnessRank(right.categoryUsefulness);
  if (usefulnessDelta !== 0) return usefulnessDelta;

  if (left.providerDataCompleteness !== right.providerDataCompleteness) {
    return right.providerDataCompleteness - left.providerDataCompleteness;
  }
  const confidenceDelta =
    confidenceScore(right.coordinateConfidence ?? right.confidence) -
    confidenceScore(left.coordinateConfidence ?? left.confidence);
  if (Math.abs(confidenceDelta) > 0.000001) return confidenceDelta;
  return left.id.localeCompare(right.id);
}

export function buildApproachResupplyRerankEvidence(input: {
  routeEvidenceState: ApproachResupplyRouteEvidenceState;
  routeDeviationMiles: number | null;
  distanceFromApproachRouteMiles: number | null;
  providerScore?: number | null;
}): Pick<ApproachResupplyCandidate, 'distanceFromApproachRouteMiles' | 'detourDistanceMiles' | 'score'> {
  return {
    distanceFromApproachRouteMiles: input.distanceFromApproachRouteMiles,
    detourDistanceMiles: input.routeEvidenceState === 'provider_route'
      ? input.routeDeviationMiles
      : null,
    score: input.providerScore ?? null,
  };
}

export function mergeApproachResupplySafetyEvidence(
  evidence: {
    accessStatus?: ApproachResupplyCandidate['accessStatus'];
    operatingStatus?: ApproachResupplyCandidate['operatingStatus'];
    coordinateConfidence?: ApproachResupplyCandidate['coordinateConfidence'];
  }[],
): {
  accessStatus: 'accessible' | 'inaccessible' | 'unknown';
  operatingStatus: ApproachResupplyOperatingStatus;
  coordinateConfidence: TripBuilderConfidence | null;
} {
  const accessStatuses = evidence.map((item) => item.accessStatus ?? 'unknown');
  const operatingStatuses = evidence.map((item) => normalizeOperatingStatus(item.operatingStatus));
  const coordinateConfidences = evidence
    .map((item) => item.coordinateConfidence)
    .filter((value): value is NonNullable<ApproachResupplyCandidate['coordinateConfidence']> => value != null);
  const normalizedCoordinateConfidences = coordinateConfidences.map((value): TripBuilderConfidence => {
    if (value === 'high' || value === 'medium' || value === 'low' || value === 'unknown') return value;
    const score = confidenceScore(value);
    if (score >= 0.78) return 'high';
    if (score >= 0.5) return 'medium';
    if (score > 0) return 'low';
    return 'unknown';
  });
  const confidenceOrder: Record<TripBuilderConfidence, number> = {
    unknown: 0,
    low: 1,
    medium: 2,
    high: 3,
  };
  const coordinateConfidence = normalizedCoordinateConfidences.length === 0
    ? null
    : normalizedCoordinateConfidences.reduce((lowest, current) => (
        confidenceOrder[current] < confidenceOrder[lowest] ? current : lowest
      ));
  return {
    accessStatus: accessStatuses.includes('inaccessible')
      ? 'inaccessible'
      : accessStatuses.includes('accessible')
        ? 'accessible'
        : 'unknown',
    operatingStatus: operatingStatuses.includes('closed')
      ? 'closed'
      : operatingStatuses.includes('temporarily_closed')
        ? 'temporarily_closed'
        : operatingStatuses.includes('open')
          ? 'open'
          : 'unknown',
    coordinateConfidence,
  };
}

export function mergeApproachResupplyRouteEvidence(
  evidence: {
    routeEvidenceState: ApproachResupplyRouteEvidenceState;
    routeDeviationMiles: number | null;
    distanceFromApproachRouteMiles: number | null;
    detourDurationMinutes: number | null;
  }[],
): {
  routeEvidenceState: ApproachResupplyRouteEvidenceState;
  routeDeviationMiles: number | null;
  distanceFromApproachRouteMiles: number | null;
  detourDurationMinutes: number | null;
} {
  const providerEvidence = evidence
    .filter((item) => item.routeEvidenceState === 'provider_route')
    .sort((left, right) => (
      (right.routeDeviationMiles ?? Number.NEGATIVE_INFINITY) -
      (left.routeDeviationMiles ?? Number.NEGATIVE_INFINITY)
    ))[0];
  if (providerEvidence) return providerEvidence;
  const corridorEvidence = evidence
    .filter((item) => item.routeEvidenceState === 'corridor_offset_estimate')
    .sort((left, right) => (
      (right.distanceFromApproachRouteMiles ?? Number.NEGATIVE_INFINITY) -
      (left.distanceFromApproachRouteMiles ?? Number.NEGATIVE_INFINITY)
    ))[0];
  if (corridorEvidence) return corridorEvidence;
  return {
    routeEvidenceState: 'unavailable',
    routeDeviationMiles: null,
    distanceFromApproachRouteMiles: null,
    detourDurationMinutes: null,
  };
}

export function evaluateApproachResupplyOptions({
  category,
  origin = null,
  trailhead,
  approachRoute = [],
  candidates,
  limit = 5,
  maxRouteDeviationMiles = APPROACH_RESUPPLY_POLICY.maximumRouteDetourMiles,
  maxCorridorOffsetMiles = APPROACH_RESUPPLY_POLICY.maximumCorridorOffsetMiles,
  preferredRouteBufferMiles = null,
  preferredRoutedDetourMiles = null,
  preferredCorridorOffsetMiles = APPROACH_RESUPPLY_POLICY.preferredCorridorOffsetMiles,
  remoteEntry = null,
  remoteEntryProgressRatio = null,
  requireRoutedAccess = true,
}: RankApproachResupplyOptionsArgs): ApproachResupplyInventory {
  const route = canonicalizeApproachRoute(approachRoute ?? [], origin, trailhead);
  const hasApproachRoute = isValidCoordinate(origin) && route.length >= 2;
  const fallbackState: ApproachResupplyFallbackState = hasApproachRoute ? 'approach_route' : 'trailhead_only';
  const routeAwareConfidence: TripBuilderConfidence = hasApproachRoute ? 'high' : 'unknown';
  const resolvedRemoteEntry = resolveRemoteEntry(hasApproachRoute ? route : [], remoteEntry, remoteEntryProgressRatio);
  const totalMeters = hasApproachRoute ? totalRouteDistanceMeters(route) : 0;
  const remoteEntryMeters = totalMeters > 0 && resolvedRemoteEntry.progressRatio != null
    ? totalMeters * resolvedRemoteEntry.progressRatio
    : null;
  const maximumRoutedDetour = finiteNonNegative(maxRouteDeviationMiles) ??
    APPROACH_RESUPPLY_POLICY.maximumRouteDetourMiles;
  const maximumCorridorOffset = finiteNonNegative(maxCorridorOffsetMiles) ??
    APPROACH_RESUPPLY_POLICY.maximumCorridorOffsetMiles;
  const preferredRoutedDetour = Math.min(
    maximumRoutedDetour,
    finiteNonNegative(preferredRoutedDetourMiles) ??
      finiteNonNegative(preferredRouteBufferMiles) ??
      APPROACH_RESUPPLY_POLICY.preferredRoutedDetourMiles,
  );
  const preferredCorridorOffset = Math.min(
    maximumCorridorOffset,
    finiteNonNegative(preferredCorridorOffsetMiles) ?? APPROACH_RESUPPLY_POLICY.preferredCorridorOffsetMiles,
  );
  const excluded: ApproachResupplyExcludedOption[] = [];
  const evaluated: ApproachResupplyRankedOption[] = [];
  const diagnostics: ApproachResupplyDiagnosticRow[] = [];

  for (const candidate of candidates) {
    const coverage = normalizeCategoryCoverage(candidate);
    const exclusionReasons: ApproachResupplyExclusionReason[] = [];
    const warnings = [...(candidate.warnings ?? [])];
    if (!coverage.includes(category)) exclusionReasons.push('category_mismatch');
    if (!isValidCoordinate(candidate.coordinate)) exclusionReasons.push('invalid_coordinate');
    const operatingStatus = normalizeOperatingStatus(candidate.operatingStatus);
    if (operatingStatus === 'closed' || operatingStatus === 'temporarily_closed') exclusionReasons.push('known_closed');
    if (candidate.accessStatus === 'inaccessible') exclusionReasons.push('inaccessible');
    if (!hasApproachRoute) exclusionReasons.push('approach_route_unavailable');

    if (!isValidCoordinate(candidate.coordinate)) {
      excluded.push({ ...candidate, exclusionReasons, warnings });
      diagnostics.push({
        candidateId: candidate.id,
        candidateName: candidate.title,
        category: coverage.join(' + ') || candidate.category,
        corridorOffsetMiles: null,
        routeProgress: null,
        milesRemainingBeforeTrailEntry: null,
        routedDetourMinutes: finiteNonNegative(candidate.detourDurationMinutes),
        routedDetourMiles: finiteNonNegative(candidate.detourDistanceMiles),
        accepted: false,
        rejectionReason: Array.from(new Set(exclusionReasons)).join(', '),
        finalRank: null,
      });
      continue;
    }

    const projection = hasApproachRoute
      ? nearestPointOnRoute(toRouteCoordinate(candidate.coordinate), route)
      : null;
    const endpointPosition = projection
      ? endpointRoutePosition(route, candidate.coordinate, projection)
      : 'on_approach';
    const distanceFromOriginMiles = projection
      ? projection.distanceAlongRouteMeters / METERS_PER_MILE
      : null;
    const approachProgressRatio = projection && totalMeters > 0
      ? projection.distanceAlongRouteMeters / totalMeters
      : null;
    const distanceFromTrailheadMiles = roundTenths(
      finiteNonNegative(candidate.distanceFromTrailheadMiles) ??
      (isValidCoordinate(trailhead)
        ? (haversineDistanceMeters(toRouteCoordinate(trailhead), toRouteCoordinate(candidate.coordinate)) ?? 0) / METERS_PER_MILE
        : null),
    );
    // The geometric projection is authoritative for corridor eligibility. A
    // provider's routed detour is a different measurement and cannot replace it.
    const distanceFromApproachRouteMiles = projection
      ? projection.distanceMeters / METERS_PER_MILE
      : finiteNonNegative(candidate.distanceFromApproachRouteMiles);
    const providerDetour = finiteNonNegative(candidate.detourDistanceMiles);
    const routeDeviationMiles = providerDetour;
    const detourDurationMinutes = finiteNonNegative(candidate.detourDurationMinutes);
    const routeEvidenceState: ApproachResupplyRouteEvidenceState = providerDetour != null
      ? 'provider_route'
      : projection
        ? 'corridor_offset_estimate'
        : 'unavailable';
    const candidateRouteAwareConfidence: TripBuilderConfidence = routeEvidenceState === 'provider_route'
      ? confidenceLabel(candidate.confidence)
      : routeEvidenceState === 'corridor_offset_estimate'
        ? 'low'
        : 'unknown';
    const remainingApproachMilesToTrailhead = projection
      ? Math.max(0, totalMeters - projection.distanceAlongRouteMeters) / METERS_PER_MILE
      : null;
    const rawDistanceBeforeRemoteEntryMiles = projection && remoteEntryMeters != null
      ? (remoteEntryMeters - projection.distanceAlongRouteMeters) / METERS_PER_MILE
      : null;
    const distanceBeforeRemoteEntryMiles = rawDistanceBeforeRemoteEntryMiles;
    let routePosition: ApproachResupplyRoutePosition = fallbackState === 'trailhead_only'
      ? 'unknown'
      : endpointPosition;
    if (candidate.beforeTrailEntry === false) routePosition = 'after_trailhead';
    const beforeTrailEntry = fallbackState === 'trailhead_only'
      ? candidate.beforeTrailEntry ?? null
      : routePosition !== 'after_trailhead';
    const beforeRemoteEntry = fallbackState === 'trailhead_only'
      ? null
      : rawDistanceBeforeRemoteEntryMiles == null
        ? routePosition !== 'after_trailhead'
        : rawDistanceBeforeRemoteEntryMiles >= 0 && routePosition !== 'after_trailhead';

    if (routePosition === 'behind_origin') exclusionReasons.push('behind_origin');
    if (routePosition === 'after_trailhead') exclusionReasons.push('after_trailhead');
    if (
      distanceFromApproachRouteMiles == null ||
      distanceFromApproachRouteMiles > maximumCorridorOffset
    ) {
      exclusionReasons.push('excessive_corridor_offset');
    }
    if (providerDetour != null && providerDetour > maximumRoutedDetour) exclusionReasons.push('excessive_detour');
    const hasRoutedAccessEvidence = candidate.accessStatus === 'accessible' || providerDetour != null;
    if (requireRoutedAccess !== false && !hasRoutedAccessEvidence) {
      exclusionReasons.push('unverified_routed_access');
    }

    if (fallbackState === 'trailhead_only') {
      warnings.push('The origin-to-entry driving approach is unavailable; this candidate cannot enter normal Smart Resupply results.');
    } else {
      if (resolvedRemoteEntry.conflictReason === 'coordinate_progress_mismatch') {
        warnings.push(`${resolvedRemoteEntry.label}; verify the practical entry boundary before relying on this recommendation.`);
      }
      if (distanceFromApproachRouteMiles != null && distanceFromApproachRouteMiles > preferredCorridorOffset) {
        warnings.push(
          `Candidate is in the acceptable ${preferredCorridorOffset.toFixed(2)}-${maximumCorridorOffset.toFixed(2)} mile corridor tier.`,
        );
      }
      if (routeEvidenceState !== 'provider_route') {
        warnings.push('Actual routed detour distance and time are unavailable.');
      } else if (providerDetour != null && providerDetour > preferredRoutedDetour) {
        warnings.push(
          `Actual routed detour exceeds the preferred ${preferredRoutedDetour}-mile detour.`,
        );
      }
    }
    if (operatingStatus === 'unknown') warnings.push('Hours and current operating availability are unknown; verify before departure.');

    if (exclusionReasons.length > 0) {
      const uniqueReasons = Array.from(new Set(exclusionReasons));
      excluded.push({ ...candidate, exclusionReasons: uniqueReasons, warnings: Array.from(new Set(warnings)) });
      diagnostics.push({
        candidateId: candidate.id,
        candidateName: candidate.title,
        category: coverage.join(' + ') || candidate.category,
        corridorOffsetMiles: distanceFromApproachRouteMiles,
        routeProgress: approachProgressRatio,
        milesRemainingBeforeTrailEntry: remainingApproachMilesToTrailhead,
        routedDetourMinutes: detourDurationMinutes,
        routedDetourMiles: providerDetour,
        accepted: false,
        rejectionReason: uniqueReasons.join(', '),
        finalRank: null,
      });
      continue;
    }

    const progressTowardTrailEntry = projection && totalMeters > 0
      ? clamp01(projection.distanceAlongRouteMeters / totalMeters)
      : 0;
    const corridorTier: ApproachResupplyCorridorTier =
      (distanceFromApproachRouteMiles ?? Number.POSITIVE_INFINITY) <= preferredCorridorOffset
        ? 'preferred'
        : 'acceptable';
    const categoryUsefulness = normalizeCategoryUsefulness(candidate, coverage);
    evaluated.push({
      ...candidate,
      categoryCoverage: coverage,
      categoryUsefulness,
      providerDataCompleteness: providerDataCompleteness(candidate),
      operatingStatus,
      fallbackState,
      distanceFromOriginMiles,
      distanceFromTrailheadMiles,
      distanceFromApproachRouteMiles,
      corridorTier,
      routeDeviationMiles,
      detourDurationMinutes,
      approachProgressRatio,
      remainingApproachMilesToTrailhead,
      distanceBeforeRemoteEntryMiles,
      beforeTrailEntry,
      beforeRemoteEntry,
      routePosition,
      routeEvidenceState,
      routeAwareConfidence: candidateRouteAwareConfidence,
      remoteEntrySource: resolvedRemoteEntry.source,
      remoteEntryConfidence: resolvedRemoteEntry.confidence,
      remoteEntryEstimated: resolvedRemoteEntry.estimated,
      remoteEntryLabel: resolvedRemoteEntry.label,
      exclusionReasons: [],
      warnings: Array.from(new Set(warnings)),
      // Retained for backward-compatible evidence display only. Ranking uses
      // compareApproachResupplyRankedOptions and never this value.
      approachScore: roundThousandths(progressTowardTrailEntry) ?? 0,
      rank: 0,
    });
    diagnostics.push({
      candidateId: candidate.id,
      candidateName: candidate.title,
      category: coverage.join(' + ') || candidate.category,
      corridorOffsetMiles: distanceFromApproachRouteMiles,
      routeProgress: approachProgressRatio,
      milesRemainingBeforeTrailEntry: remainingApproachMilesToTrailhead,
      routedDetourMinutes: detourDurationMinutes,
      routedDetourMiles: providerDetour,
      accepted: true,
      rejectionReason: null,
      finalRank: null,
    });
  }

  const allRanked = evaluated
    .sort(compareApproachResupplyRankedOptions)
    .map((option, index) => ({ ...option, rank: index + 1 }));
  const rankById = new Map(allRanked.map((option) => [option.id, option.rank]));
  const ranked = allRanked.slice(0, Math.max(0, limit ?? 5));

  return {
    ranked,
    excluded,
    diagnostics: diagnostics.map((row) => ({
      ...row,
      finalRank: row.accepted ? rankById.get(row.candidateId) ?? null : null,
    })),
    fallbackState,
    routeAwareConfidence,
    remoteEntry: resolvedRemoteEntry,
  };
}

export function rankApproachResupplyOptions(args: RankApproachResupplyOptionsArgs): ApproachResupplyRankedOption[] {
  return evaluateApproachResupplyOptions(args).ranked;
}

function samePhysicalStop(left: ApproachResupplyRankedOption, right: ApproachResupplyRankedOption): boolean {
  if (left.placeIdentity && right.placeIdentity && left.placeIdentity === right.placeIdentity) return true;
  if (left.id === right.id) return true;
  const distance = haversineDistanceMeters(toRouteCoordinate(left.coordinate), toRouteCoordinate(right.coordinate));
  return left.title.trim().toLowerCase() === right.title.trim().toLowerCase() && distance != null && distance <= 80;
}

export function buildApproachResupplyStopPlan(input: {
  fuelOptions: ApproachResupplyRankedOption[];
  supplyOptions: ApproachResupplyRankedOption[];
  requestedCategories: ApproachResupplyCategory[];
}): ApproachResupplyStopPlan {
  const requested = Array.from(new Set(input.requestedCategories));
  const fuel = input.fuelOptions[0] ?? null;
  const supply = input.supplyOptions[0] ?? null;
  const combined = fuel && requested.includes('food_supplies') && (
    fuel.categoryCoverage.includes('food_supplies') || (supply ? samePhysicalStop(fuel, supply) : false)
  )
    ? {
        ...fuel,
        categoryCoverage: Array.from(
          new Set<ApproachResupplyCategory>([...fuel.categoryCoverage, 'food_supplies']),
        ),
      }
    : null;
  const stops = combined
    ? [combined]
    : [requested.includes('fuel') ? fuel : null, requested.includes('food_supplies') ? supply : null]
      .filter((option): option is ApproachResupplyRankedOption => option != null)
      .sort((left, right) => (
        (left.approachProgressRatio ?? Number.POSITIVE_INFINITY) -
          (right.approachProgressRatio ?? Number.POSITIVE_INFINITY) ||
        (left.distanceFromOriginMiles ?? Number.POSITIVE_INFINITY) -
          (right.distanceFromOriginMiles ?? Number.POSITIVE_INFINITY) ||
        left.id.localeCompare(right.id)
      ));
  const coverage = Array.from(
    new Set<ApproachResupplyCategory>(stops.flatMap((stop) => stop.categoryCoverage)),
  );
  const missingCategories = requested.filter((category) => !coverage.includes(category));
  const status: ApproachResupplyStopPlanStatus = combined
    ? 'combined'
    : missingCategories.length === 0 && stops.length > 0
      ? 'separate'
      : stops.length > 0
        ? 'partial'
        : 'unavailable';
  const explanation = status === 'combined'
    ? `${combined?.title ?? 'One stop'} covers the requested fuel and grocery/supply categories; verify current availability.`
    : status === 'separate'
      ? 'Separate viable fuel and grocery/supply stops are planned along the approach.'
      : status === 'partial'
        ? `No viable ${missingCategories.join(' and ').replace('food_supplies', 'grocery/supply')} stop was found before the service boundary.`
        : 'No viable on-approach resupply stop was found before the service boundary.';
  return { status, stops, categoryCoverage: coverage, missingCategories, explanation };
}
