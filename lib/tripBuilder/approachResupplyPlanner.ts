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
  | 'known_service_boundary'
  | 'route_metadata'
  | 'remoteness_estimate'
  | 'trailhead_estimate'
  | 'unavailable';

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
  exclusionReasons: [];
  warnings: string[];
};

export type ApproachResupplyExcludedOption = ApproachResupplyCandidate & {
  exclusionReasons: ApproachResupplyExclusionReason[];
  warnings: string[];
};

export type ApproachResupplyInventory = {
  ranked: ApproachResupplyRankedOption[];
  excluded: ApproachResupplyExcludedOption[];
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
};

export const APPROACH_RESUPPLY_POLICY = Object.freeze({
  preferredCorridorOffsetMiles: 0.2,
  preferredRoutedDetourMiles: 10,
  maximumCorridorOffsetMiles: 20,
  // Backward-compatible name for callers that still supply the routed-detour preference.
  preferredRouteBufferMiles: 10,
  maximumRouteDetourMiles: 20,
  maximumRemoteEntryProjectionOffsetMiles: 5,
  maximumRemoteEntryProgressMismatchRatio: 0.08,
  trailheadEstimateProgressRatio: 0.985,
  minimumRemoteEntryProgressRatio: 0.55,
  remoteEntrySearchBackoffRatio: 0.04,
  remoteEntryRatiosByRemoteness: Object.freeze({
    high: 0.88,
    remote: 0.9,
    watch: 0.93,
  }),
  remoteEntryRemotenessThresholds: Object.freeze({
    high: 8,
    remote: 7,
    watch: 6,
  }),
  scoreWeights: Object.freeze({
    progressTowardRemoteEntry: 0.4,
    routeDetour: 0.3,
    categoryCoverage: 0.1,
    providerConfidence: 0.1,
    operatingEvidence: 0.05,
    providerScore: 0.05,
  }),
  routeEvidenceScoreMultiplier: Object.freeze({
    provider_route: 1,
    corridor_offset_estimate: 0.55,
    unavailable: 0.25,
  }),
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
  return oriented;
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

  const remoteness = typeof input.remotenessScore === 'number' && Number.isFinite(input.remotenessScore)
    ? input.remotenessScore
    : null;
  if (remoteness != null && remoteness >= APPROACH_RESUPPLY_POLICY.remoteEntryRemotenessThresholds.watch) {
    const ratio = remoteness >= APPROACH_RESUPPLY_POLICY.remoteEntryRemotenessThresholds.high
      ? APPROACH_RESUPPLY_POLICY.remoteEntryRatiosByRemoteness.high
      : remoteness >= APPROACH_RESUPPLY_POLICY.remoteEntryRemotenessThresholds.remote
        ? APPROACH_RESUPPLY_POLICY.remoteEntryRatiosByRemoteness.remote
        : APPROACH_RESUPPLY_POLICY.remoteEntryRatiosByRemoteness.watch;
    return {
      coordinate: null,
      progressRatio: ratio,
      source: 'remoteness_estimate',
      confidence: 'low',
      estimated: true,
      label: 'Estimated service-loss entry from ECS remoteness',
    };
  }

  if (input.allowTrailheadEstimate !== false) {
    return {
      coordinate: null,
      progressRatio: APPROACH_RESUPPLY_POLICY.trailheadEstimateProgressRatio,
      source: 'trailhead_estimate',
      confidence: 'low',
      estimated: true,
      label: 'Estimated service boundary near trailhead',
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
  remoteEntry = null,
  remoteEntryProgressRatio = null,
  maxAnchors = 7,
}: BuildApproachResupplySearchAnchorsArgs): ApproachResupplySearchAnchor[] {
  const limit = Math.max(2, Math.floor(maxAnchors ?? 7));
  const route = canonicalizeApproachRoute(approachRoute ?? [], origin, trailhead);
  const anchors: ApproachResupplySearchAnchor[] = [];
  const hasTrailhead = !!trailhead && isValidCoordinate(trailhead);
  const approachAnchorLimit = Math.max(1, hasTrailhead ? limit - 1 : limit);
  const resolvedRemoteEntry = resolveRemoteEntry(route, remoteEntry, remoteEntryProgressRatio);
  const remoteEntryRatio = resolvedRemoteEntry.progressRatio ?? APPROACH_RESUPPLY_POLICY.trailheadEstimateProgressRatio;
  const minimumSearchRatio = resolvedRemoteEntry.estimated ? 0.12 : 0;
  const remoteSearchRatio = Math.round(
    clampProgress(
      remoteEntryRatio - APPROACH_RESUPPLY_POLICY.remoteEntrySearchBackoffRatio,
      minimumSearchRatio,
      0.96,
    ) * 100,
  ) / 100;

  if (route.length >= 2) {
    const knownBoundaryRatios = [
      remoteSearchRatio,
      Math.max(0, remoteEntryRatio * 0.6),
      Math.max(0, remoteEntryRatio * 0.25),
      0,
    ].map((ratio) => Math.round(ratio * 100) / 100);
    const ratios = !resolvedRemoteEntry.estimated && resolvedRemoteEntry.progressRatio != null
      ? knownBoundaryRatios
      : approachAnchorLimit <= 3
        ? [remoteSearchRatio, 0.55, 0.18]
        : [remoteSearchRatio, 0.74, 0.55, 0.34, 0.18, 0.08, 0.94];
    Array.from(new Set(ratios))
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

export function interleaveApproachSearchResults<T>(buckets: ReadonlyArray<ReadonlyArray<T>>): T[] {
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

export function classifyApproachResupplyProviderCoverage(input: {
  expectedAnchorCount: number;
  coveredAnchorCount: number;
  failedAnchorCount: number;
  resultCount: number;
}): ApproachResupplyProviderCoverageState {
  const incomplete = input.failedAnchorCount > 0 || input.coveredAnchorCount < input.expectedAnchorCount;
  if (!incomplete) return 'complete';
  return input.resultCount > 0 ? 'partial_results' : 'retryable_error';
}

function routeDetourScore(distanceMiles: number | null, maximumDetourMiles: number): number {
  if (distanceMiles == null) return 0.35;
  if (maximumDetourMiles <= 0) return distanceMiles <= 0 ? 1 : 0;
  return clamp01(1 - distanceMiles / maximumDetourMiles);
}

function operationalRouteFitBand(
  routeEvidenceState: ApproachResupplyRouteEvidenceState,
  routedDetourMiles: number | null,
  corridorOffsetMiles: number | null,
  preferredRoutedDetourMiles: number,
  maximumRoutedDetourMiles: number,
  preferredCorridorOffsetMiles: number,
  maximumCorridorOffsetMiles: number,
): number {
  const distanceMiles = routeEvidenceState === 'provider_route'
    ? routedDetourMiles
    : routeEvidenceState === 'corridor_offset_estimate'
      ? corridorOffsetMiles
      : null;
  const preferredMiles = routeEvidenceState === 'provider_route'
    ? preferredRoutedDetourMiles
    : preferredCorridorOffsetMiles;
  const maximumMiles = routeEvidenceState === 'provider_route'
    ? maximumRoutedDetourMiles
    : maximumCorridorOffsetMiles;
  if (distanceMiles == null) return 2;
  if (distanceMiles <= preferredMiles) return 0;
  if (distanceMiles <= maximumMiles) return 1;
  return 3;
}

function routeEvidenceBand(state: ApproachResupplyRouteEvidenceState): number {
  if (state === 'provider_route') return 0;
  if (state === 'corridor_offset_estimate') return 1;
  return 2;
}

function coordinateIntegrityBand(candidate: ApproachResupplyCandidate): number {
  if (candidate.coordinateConfidence == null) return 0;
  const score = confidenceScore(candidate.coordinateConfidence);
  return score >= 0.5 ? 0 : score > 0 ? 1 : 2;
}

function operatingEvidenceScore(status: ApproachResupplyOperatingStatus): number {
  return status === 'open' ? 1 : status === 'unknown' ? 0.45 : 0;
}

function providerScore(candidate: ApproachResupplyCandidate): number {
  const score = candidate.score;
  if (typeof score !== 'number' || !Number.isFinite(score)) return 0.5;
  return score > 1 ? clamp01(score / 100) : clamp01(score);
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
  evidence: Array<{
    accessStatus?: ApproachResupplyCandidate['accessStatus'];
    operatingStatus?: ApproachResupplyCandidate['operatingStatus'];
    coordinateConfidence?: ApproachResupplyCandidate['coordinateConfidence'];
  }>,
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
  evidence: Array<{
    routeEvidenceState: ApproachResupplyRouteEvidenceState;
    routeDeviationMiles: number | null;
    distanceFromApproachRouteMiles: number | null;
    detourDurationMinutes: number | null;
  }>,
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

  for (const candidate of candidates) {
    const coverage = normalizeCategoryCoverage(candidate);
    const exclusionReasons: ApproachResupplyExclusionReason[] = [];
    const warnings = [...(candidate.warnings ?? [])];
    if (!coverage.includes(category)) exclusionReasons.push('category_mismatch');
    if (!isValidCoordinate(candidate.coordinate)) exclusionReasons.push('invalid_coordinate');
    const operatingStatus = normalizeOperatingStatus(candidate.operatingStatus);
    if (operatingStatus === 'closed' || operatingStatus === 'temporarily_closed') exclusionReasons.push('known_closed');
    if (candidate.accessStatus === 'inaccessible') exclusionReasons.push('inaccessible');

    if (!isValidCoordinate(candidate.coordinate)) {
      excluded.push({ ...candidate, exclusionReasons, warnings });
      continue;
    }

    const projection = hasApproachRoute
      ? nearestPointOnRoute(toRouteCoordinate(candidate.coordinate), route)
      : null;
    const endpointPosition = projection
      ? endpointRoutePosition(route, candidate.coordinate, projection)
      : 'on_approach';
    const distanceFromOriginMiles = roundTenths(
      projection ? projection.distanceAlongRouteMeters / METERS_PER_MILE : null,
    );
    const approachProgressRatio = roundThousandths(
      projection && totalMeters > 0 ? projection.distanceAlongRouteMeters / totalMeters : null,
    );
    const distanceFromTrailheadMiles = roundTenths(
      finiteNonNegative(candidate.distanceFromTrailheadMiles) ??
      (isValidCoordinate(trailhead)
        ? (haversineDistanceMeters(toRouteCoordinate(trailhead), toRouteCoordinate(candidate.coordinate)) ?? 0) / METERS_PER_MILE
        : null),
    );
    const distanceFromApproachRouteMiles = roundTenths(
      finiteNonNegative(candidate.distanceFromApproachRouteMiles) ??
      (projection ? projection.distanceMeters / METERS_PER_MILE : null),
    );
    const providerDetour = finiteNonNegative(candidate.detourDistanceMiles);
    const routeDeviationMiles = roundTenths(providerDetour ?? distanceFromApproachRouteMiles);
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
    const remainingApproachMilesToTrailhead = roundTenths(
      projection ? Math.max(0, totalMeters - projection.distanceAlongRouteMeters) / METERS_PER_MILE : null,
    );
    const rawDistanceBeforeRemoteEntryMiles = projection && remoteEntryMeters != null
      ? (remoteEntryMeters - projection.distanceAlongRouteMeters) / METERS_PER_MILE
      : null;
    const distanceBeforeRemoteEntryMiles = roundTenths(rawDistanceBeforeRemoteEntryMiles);
    const afterRemoteEntry = rawDistanceBeforeRemoteEntryMiles != null && rawDistanceBeforeRemoteEntryMiles <= 0;
    let routePosition: ApproachResupplyRoutePosition = fallbackState === 'trailhead_only'
      ? 'unknown'
      : endpointPosition;
    if (routePosition === 'on_approach' && afterRemoteEntry) routePosition = 'after_remote_entry';
    if (candidate.beforeTrailEntry === false) routePosition = 'after_trailhead';
    const beforeTrailEntry = fallbackState === 'trailhead_only'
      ? candidate.beforeTrailEntry ?? null
      : routePosition !== 'after_trailhead';
    const beforeRemoteEntry = fallbackState === 'trailhead_only'
      ? null
      : routePosition !== 'after_remote_entry' && routePosition !== 'after_trailhead';

    if (routePosition === 'behind_origin') exclusionReasons.push('behind_origin');
    if (routePosition === 'after_remote_entry') exclusionReasons.push('after_remote_entry');
    if (routePosition === 'after_trailhead') exclusionReasons.push('after_trailhead');
    if (providerDetour != null && providerDetour > maximumRoutedDetour) {
      exclusionReasons.push('excessive_detour');
    } else if (
      providerDetour == null &&
      distanceFromApproachRouteMiles != null &&
      distanceFromApproachRouteMiles > maximumCorridorOffset
    ) {
      exclusionReasons.push('excessive_corridor_offset');
    }

    if (fallbackState === 'trailhead_only') {
      warnings.push('Approach route unavailable; ECS used trailhead proximity only. Route order, accessibility, and detour remain unknown.');
    } else {
      if (resolvedRemoteEntry.estimated) warnings.push(`${resolvedRemoteEntry.label}; verify service coverage before relying on this boundary.`);
      if (resolvedRemoteEntry.conflictReason === 'coordinate_progress_mismatch') {
        warnings.push(`${resolvedRemoteEntry.label}; verify the service-loss boundary before relying on this recommendation.`);
      }
      if (routeEvidenceState === 'corridor_offset_estimate') {
        warnings.push('Approach offset is geometric only; routed detour time and road access remain unverified.');
        if (
          distanceFromApproachRouteMiles != null &&
          distanceFromApproachRouteMiles > preferredCorridorOffset &&
          distanceFromApproachRouteMiles <= maximumCorridorOffset
        ) {
          warnings.push(
            `Candidate is outside the preferred ${preferredCorridorOffset}-mile geometric approach corridor; keep it as a broader fallback and verify road access.`,
          );
        }
      }
      if (
        routeEvidenceState === 'provider_route' &&
        providerDetour != null &&
        providerDetour > preferredRoutedDetour &&
        providerDetour <= maximumRoutedDetour
      ) {
        warnings.push(
          `Provider-routed detour exceeds the preferred ${preferredRoutedDetour}-mile approach detour; keep it as a broader fallback and verify before selecting.`,
        );
      }
    }
    if (operatingStatus === 'unknown') warnings.push('Hours and current operating availability are unknown; verify before departure.');

    if (exclusionReasons.length > 0) {
      excluded.push({ ...candidate, exclusionReasons: Array.from(new Set(exclusionReasons)), warnings: Array.from(new Set(warnings)) });
      continue;
    }

    const progressTowardRemoteEntry = projection && remoteEntryMeters && remoteEntryMeters > 0
      ? clamp01(projection.distanceAlongRouteMeters / remoteEntryMeters)
      : distanceFromTrailheadMiles == null
        ? 0.35
        : clamp01(1 - distanceFromTrailheadMiles / 75);
    const weights = APPROACH_RESUPPLY_POLICY.scoreWeights;
    const score =
      progressTowardRemoteEntry * weights.progressTowardRemoteEntry +
      routeDetourScore(
        routeEvidenceState === 'provider_route' ? providerDetour : distanceFromApproachRouteMiles,
        routeEvidenceState === 'provider_route' ? maximumRoutedDetour : maximumCorridorOffset,
      ) *
        APPROACH_RESUPPLY_POLICY.routeEvidenceScoreMultiplier[routeEvidenceState] *
        weights.routeDetour +
      clamp01(coverage.length / 2) * weights.categoryCoverage +
      confidenceScore(candidate.confidence) * weights.providerConfidence +
      operatingEvidenceScore(operatingStatus) * weights.operatingEvidence +
      providerScore(candidate) * weights.providerScore;
    evaluated.push({
      ...candidate,
      categoryCoverage: coverage,
      operatingStatus,
      fallbackState,
      distanceFromOriginMiles,
      distanceFromTrailheadMiles,
      distanceFromApproachRouteMiles,
      routeDeviationMiles,
      detourDurationMinutes: roundTenths(finiteNonNegative(candidate.detourDurationMinutes)),
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
      approachScore: Math.round(clamp01(score) * 1000) / 1000,
      rank: 0,
    });
  }

  const ranked = evaluated
    .sort((left, right) => {
      const fallbackDelta = (left.fallbackState === 'approach_route' ? 0 : 1) -
        (right.fallbackState === 'approach_route' ? 0 : 1);
      if (fallbackDelta !== 0) return fallbackDelta;
      const bandDelta = operationalRouteFitBand(
        left.routeEvidenceState,
        left.routeEvidenceState === 'provider_route' ? left.routeDeviationMiles : null,
        left.distanceFromApproachRouteMiles,
        preferredRoutedDetour,
        maximumRoutedDetour,
        preferredCorridorOffset,
        maximumCorridorOffset,
      ) - operationalRouteFitBand(
        right.routeEvidenceState,
        right.routeEvidenceState === 'provider_route' ? right.routeDeviationMiles : null,
        right.distanceFromApproachRouteMiles,
        preferredRoutedDetour,
        maximumRoutedDetour,
        preferredCorridorOffset,
        maximumCorridorOffset,
      );
      if (bandDelta !== 0) return bandDelta;
      const evidenceDelta = routeEvidenceBand(left.routeEvidenceState) - routeEvidenceBand(right.routeEvidenceState);
      if (evidenceDelta !== 0) return evidenceDelta;
      const coordinateConfidenceDelta = coordinateIntegrityBand(left) - coordinateIntegrityBand(right);
      if (coordinateConfidenceDelta !== 0) return coordinateConfidenceDelta;
      const remoteDelta =
        (left.distanceBeforeRemoteEntryMiles ?? left.distanceFromTrailheadMiles ?? Number.POSITIVE_INFINITY) -
        (right.distanceBeforeRemoteEntryMiles ?? right.distanceFromTrailheadMiles ?? Number.POSITIVE_INFINITY);
      if (Math.abs(remoteDelta) > 0.01) return remoteDelta;
      const detourDelta = (left.routeDeviationMiles ?? Number.POSITIVE_INFINITY) -
        (right.routeDeviationMiles ?? Number.POSITIVE_INFINITY);
      if (Math.abs(detourDelta) > 0.01) return detourDelta;
      const durationDelta = (left.detourDurationMinutes ?? Number.POSITIVE_INFINITY) -
        (right.detourDurationMinutes ?? Number.POSITIVE_INFINITY);
      if (Math.abs(durationDelta) > 0.01) return durationDelta;
      if (left.categoryCoverage.length !== right.categoryCoverage.length) {
        return right.categoryCoverage.length - left.categoryCoverage.length;
      }
      const operatingDelta = operatingEvidenceScore(right.operatingStatus) - operatingEvidenceScore(left.operatingStatus);
      if (Math.abs(operatingDelta) > 0.001) return operatingDelta;
      const confidenceDelta = confidenceScore(right.coordinateConfidence ?? right.confidence) -
        confidenceScore(left.coordinateConfidence ?? left.confidence);
      if (Math.abs(confidenceDelta) > 0.001) return confidenceDelta;
      return left.id.localeCompare(right.id);
    })
    .slice(0, Math.max(0, limit ?? 5))
    .map((option, index) => ({ ...option, rank: index + 1 }));

  return {
    ranked,
    excluded,
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
