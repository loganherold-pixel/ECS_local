import {
  CATALOG_GUIDANCE_JOIN_GAP_MAX_METERS,
  normalizeNavigationGuidanceGeometry,
} from '../navigationCatalogGuidanceGeometry';
import {
  buildGuidanceRouteDistanceIndex,
  findNearestPlausibleRouteProjection,
  guidanceRouteDistanceMeters,
  orientGuidanceRouteFromStart,
  splitGuidanceRouteAtProjection,
  type GuidanceRouteCoordinate,
  type GuidanceRouteProjection,
} from '../navigation/guidanceRouteProjection';
import { routeAllowsLoopGuidance } from '../navigation/routeLoopGuidancePolicy';
import type { RoadNavCoordinate } from '../mapboxRoadNavigation';
import {
  createRouteGeometryFingerprint,
  routeGeometryPointToLatitudeLongitude,
  type RouteGeometryLineString,
} from '../routeGeometryLifecycle';
import { resolveTrailRouteGeometry } from './trailRouteGeometryResolver';
import type { GeoPoint, SuggestedRoute, TripBuilderRouteInput } from './tripBuilderTypes';

export type TripBuilderCanonicalRouteSpineStatus = 'ready' | 'trail_only' | 'invalid';

export type TripBuilderCanonicalRouteSpineSafeCode =
  | 'TRIP_BUILDER_SPINE_READY'
  | 'TRIP_BUILDER_SPINE_APPROACH_UNAVAILABLE'
  | 'TRIP_BUILDER_SPINE_TRAIL_UNAVAILABLE'
  | 'TRIP_BUILDER_SPINE_TRAIL_TOPOLOGY_INVALID'
  | 'TRIP_BUILDER_SPINE_ORIGIN_APPROACH_DISJOINT'
  | 'TRIP_BUILDER_SPINE_APPROACH_TRAILHEAD_DISJOINT'
  | 'TRIP_BUILDER_SPINE_TRAILHEAD_TRAIL_DISJOINT'
  | 'TRIP_BUILDER_SPINE_TRAIL_END_DISJOINT'
  | 'TRIP_BUILDER_SPINE_UNEXPECTED_CLOSURE';

export type TripBuilderCanonicalRouteSpine = {
  status: TripBuilderCanonicalRouteSpineStatus;
  safeCode: TripBuilderCanonicalRouteSpineSafeCode;
  lineString: RouteGeometryLineString | null;
  coordinates: GeoPoint[];
  fingerprint: string | null;
  sourceLineCount: 0 | 1;
  origin: GeoPoint | null;
  trailhead: GeoPoint | null;
  trailEnd: GeoPoint | null;
  approachPointCount: number;
  trailPointCount: number;
  allowLoop: boolean;
};

export type BuildTripBuilderCanonicalRouteSpineInput = {
  route: SuggestedRoute | TripBuilderRouteInput | Record<string, unknown>;
  origin?: unknown;
  approachGeometry?: unknown;
  trailhead?: unknown;
  trailEnd?: unknown;
  includeApproach?: boolean;
  allowLoop?: boolean;
  joinGapMaxMeters?: number;
};

const SPINE_DUPLICATE_EPSILON_METERS = 1;
const SPINE_CLOSURE_TOLERANCE_METERS = 35;

function normalizePoint(value: unknown): GeoPoint | null {
  const point = routeGeometryPointToLatitudeLongitude(value);
  return point ? { latitude: point.latitude, longitude: point.longitude } : null;
}

function toGuidance(point: GeoPoint): RoadNavCoordinate {
  return {
    lat: point.latitude,
    lng: point.longitude,
    ...(point.elevationMeters != null ? { ele: point.elevationMeters, ele_m: point.elevationMeters } : {}),
    ...(point.elevationFeet != null ? { elevationFeet: point.elevationFeet } : {}),
  };
}

function toGeoPoint(point: RoadNavCoordinate): GeoPoint {
  const elevationMeters = point.ele_m ?? point.ele ?? null;
  return {
    latitude: point.lat,
    longitude: point.lng,
    ...(elevationMeters != null ? { elevationMeters } : {}),
    ...(point.elevationFeet != null ? { elevationFeet: point.elevationFeet } : {}),
  };
}

function invalidResult(args: {
  safeCode: Exclude<TripBuilderCanonicalRouteSpineSafeCode, 'TRIP_BUILDER_SPINE_READY' | 'TRIP_BUILDER_SPINE_APPROACH_UNAVAILABLE'>;
  origin: GeoPoint | null;
  trailhead: GeoPoint | null;
  trailEnd: GeoPoint | null;
  approachPointCount?: number;
  trailPointCount?: number;
  allowLoop: boolean;
}): TripBuilderCanonicalRouteSpine {
  return {
    status: 'invalid',
    safeCode: args.safeCode,
    lineString: null,
    coordinates: [],
    fingerprint: null,
    sourceLineCount: 0,
    origin: args.origin,
    trailhead: args.trailhead,
    trailEnd: args.trailEnd,
    approachPointCount: args.approachPointCount ?? 0,
    trailPointCount: args.trailPointCount ?? 0,
    allowLoop: args.allowLoop,
  };
}

function endpointDistanceMeters(
  left: GuidanceRouteCoordinate | null | undefined,
  right: GuidanceRouteCoordinate | null | undefined,
): number {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return guidanceRouteDistanceMeters(left, right);
}

function normalizedGeometry(
  value: unknown,
  preferredStart: GuidanceRouteCoordinate | null,
  allowLoop: boolean,
) {
  return normalizeNavigationGuidanceGeometry(value, {
    preferredStart,
    allowLoop,
    joinGapMaxMeters: CATALOG_GUIDANCE_JOIN_GAP_MAX_METERS,
  });
}

function appendCoordinate(
  target: RoadNavCoordinate[],
  point: RoadNavCoordinate,
): void {
  const previous = target[target.length - 1];
  if (previous && endpointDistanceMeters(previous, point) <= SPINE_DUPLICATE_EPSILON_METERS) {
    target[target.length - 1] = {
      ...previous,
      ...(previous.ele == null && point.ele != null ? { ele: point.ele } : {}),
      ...(previous.ele_m == null && point.ele_m != null ? { ele_m: point.ele_m } : {}),
      ...(previous.elevationFeet == null && point.elevationFeet != null
        ? { elevationFeet: point.elevationFeet }
        : {}),
    };
    return;
  }
  target.push({ ...point });
}

function appendGeometry(
  target: RoadNavCoordinate[],
  geometry: RoadNavCoordinate[],
): void {
  geometry.forEach((point) => appendCoordinate(target, point));
}

function lineStringFromGeometry(geometry: GuidanceRouteCoordinate[]): RouteGeometryLineString {
  return {
    type: 'LineString',
    coordinates: geometry.map((point) => [point.lng, point.lat]),
  };
}

function projectionCoordinateWithElevation(
  geometry: RoadNavCoordinate[],
  projection: GuidanceRouteProjection,
): RoadNavCoordinate {
  if (projection.segmentFraction <= 0.000001) {
    return { ...geometry[projection.segmentIndex] };
  }
  if (projection.segmentFraction >= 0.999999) {
    return { ...geometry[projection.segmentIndex + 1] };
  }
  return { ...projection.coordinate };
}

function rotateLoopFromProjection(
  geometry: RoadNavCoordinate[],
  projection: GuidanceRouteProjection,
): RoadNavCoordinate[] {
  const rotated: RoadNavCoordinate[] = [];
  const projectedStart = projectionCoordinateWithElevation(geometry, projection);
  const closingIndex = geometry.length - 1;
  appendCoordinate(rotated, projectedStart);
  for (let index = projection.segmentIndex + 1; index < closingIndex; index += 1) {
    appendCoordinate(rotated, geometry[index]);
  }
  for (let index = 0; index <= projection.segmentIndex; index += 1) {
    appendCoordinate(rotated, geometry[index]);
  }
  appendCoordinate(rotated, projectedStart);
  return rotated;
}

function prepareTrailFromTrailhead(args: {
  geometry: RoadNavCoordinate[];
  trailhead: GuidanceRouteCoordinate;
  declaredTrailEnd: GuidanceRouteCoordinate | null;
  allowLoop: boolean;
}): {
  geometry: RoadNavCoordinate[];
  distanceFromTrailheadM: number;
  sourceIsLoop: boolean;
} {
  const sourceIsLoop = args.allowLoop &&
    args.geometry.length >= 3 &&
    endpointDistanceMeters(args.geometry[0], args.geometry[args.geometry.length - 1]) <= SPINE_CLOSURE_TOLERANCE_METERS;
  let oriented = args.geometry.slice();
  if (!sourceIsLoop) {
    if (args.declaredTrailEnd) {
      const firstToEndM = endpointDistanceMeters(oriented[0], args.declaredTrailEnd);
      const lastToEndM = endpointDistanceMeters(oriented[oriented.length - 1], args.declaredTrailEnd);
      if (firstToEndM < lastToEndM) oriented.reverse();
    } else {
      oriented = orientGuidanceRouteFromStart(oriented, args.trailhead);
    }
  }

  const routeIndex = buildGuidanceRouteDistanceIndex(oriented);
  const projection = findNearestPlausibleRouteProjection({
    position: args.trailhead,
    routeIndex,
  });
  if (!projection) {
    return {
      geometry: [],
      distanceFromTrailheadM: Number.POSITIVE_INFINITY,
      sourceIsLoop,
    };
  }
  if (sourceIsLoop) {
    return {
      geometry: rotateLoopFromProjection(oriented, projection),
      distanceFromTrailheadM: projection.distanceFromPositionM,
      sourceIsLoop,
    };
  }

  const split = splitGuidanceRouteAtProjection(oriented, projection);
  const remaining = split.remaining as RoadNavCoordinate[];
  if (remaining.length > 0) {
    remaining[0] = projectionCoordinateWithElevation(oriented, projection);
  }
  return {
    geometry: remaining,
    distanceFromTrailheadM: projection.distanceFromPositionM,
    sourceIsLoop,
  };
}

/**
 * Builds the sole Trip Builder primary route spine. Approach and trail inputs
 * stay semantically separate until this bounded join; camps, bailouts, POIs,
 * raw GPS history, and alternate egress are intentionally not accepted.
 */
export function buildTripBuilderCanonicalRouteSpine(
  input: BuildTripBuilderCanonicalRouteSpineInput,
): TripBuilderCanonicalRouteSpine {
  const includeApproach = input.includeApproach !== false;
  const allowLoop = routeAllowsLoopGuidance(input.route) && input.allowLoop !== false;
  const joinGapMaxMeters = Math.max(
    SPINE_DUPLICATE_EPSILON_METERS,
    input.joinGapMaxMeters ?? CATALOG_GUIDANCE_JOIN_GAP_MAX_METERS,
  );
  const resolution = resolveTrailRouteGeometry({
    suggestedRoute: input.route as SuggestedRoute,
  });
  const origin = normalizePoint(input.origin);
  const trailhead = normalizePoint(input.trailhead) ?? normalizePoint(resolution.trailheadStart);
  const declaredTrailEnd = normalizePoint(input.trailEnd) ?? (
    resolution.trailEndExplicit ? normalizePoint(resolution.trailEnd) : null
  );
  const trailPreferredStart = trailhead ? toGuidance(trailhead) : null;
  const trailSource = resolution.trailGeometryInput ?? resolution.trailGeometry;
  const trailResult = normalizedGeometry(trailSource, trailPreferredStart, allowLoop);
  const sourceTrail = trailResult.points.length >= 2
    ? trailResult.points
    : trailResult.segments.length === 1
      ? trailResult.segments[0]
      : [];

  if (
    !allowLoop &&
    sourceTrail.length >= 3 &&
    endpointDistanceMeters(sourceTrail[0], sourceTrail[sourceTrail.length - 1]) <= SPINE_CLOSURE_TOLERANCE_METERS
  ) {
    return invalidResult({
      safeCode: 'TRIP_BUILDER_SPINE_UNEXPECTED_CLOSURE',
      origin,
      trailhead,
      trailEnd: declaredTrailEnd,
      trailPointCount: sourceTrail.length,
      allowLoop,
    });
  }

  if (trailResult.status !== 'ready' || trailResult.points.length < 2) {
    return invalidResult({
      safeCode: trailResult.sourceSegmentCount > 0
        ? 'TRIP_BUILDER_SPINE_TRAIL_TOPOLOGY_INVALID'
        : 'TRIP_BUILDER_SPINE_TRAIL_UNAVAILABLE',
      origin,
      trailhead,
      trailEnd: declaredTrailEnd,
      trailPointCount: sourceTrail.length,
      allowLoop,
    });
  }

  const resolvedTrailhead = trailhead ?? toGeoPoint(trailResult.points[0]);
  const resolvedTrailheadGuidance = toGuidance(resolvedTrailhead);
  const preparedTrail = prepareTrailFromTrailhead({
    geometry: trailResult.points,
    trailhead: resolvedTrailheadGuidance,
    declaredTrailEnd: declaredTrailEnd ? toGuidance(declaredTrailEnd) : null,
    allowLoop,
  });
  const orientedTrail = preparedTrail.geometry;
  if (
    orientedTrail.length < 2 ||
    preparedTrail.distanceFromTrailheadM > joinGapMaxMeters
  ) {
    return invalidResult({
      safeCode: 'TRIP_BUILDER_SPINE_TRAILHEAD_TRAIL_DISJOINT',
      origin,
      trailhead: resolvedTrailhead,
      trailEnd: declaredTrailEnd,
      trailPointCount: orientedTrail.length,
      allowLoop,
    });
  }

  const resolvedTrailEnd = preparedTrail.sourceIsLoop
    ? resolvedTrailhead
    : declaredTrailEnd ?? toGeoPoint(orientedTrail[orientedTrail.length - 1]);
  if (
    endpointDistanceMeters(
      orientedTrail[orientedTrail.length - 1],
      toGuidance(resolvedTrailEnd),
    ) > joinGapMaxMeters
  ) {
    return invalidResult({
      safeCode: 'TRIP_BUILDER_SPINE_TRAIL_END_DISJOINT',
      origin,
      trailhead: resolvedTrailhead,
      trailEnd: resolvedTrailEnd,
      trailPointCount: orientedTrail.length,
      allowLoop,
    });
  }

  const approachSource = includeApproach
    ? input.approachGeometry ?? resolution.approachGeometryInput ?? resolution.approachGeometry
    : null;
  const approachPreferredStart = origin ? toGuidance(origin) : null;
  const approachResult = approachSource
    ? normalizedGeometry(approachSource, approachPreferredStart, false)
    : null;
  let orientedApproach: RoadNavCoordinate[] = [];

  if (includeApproach && approachResult?.status === 'ready' && approachResult.points.length >= 2) {
    orientedApproach = origin
      ? orientGuidanceRouteFromStart(approachResult.points, approachPreferredStart)
      : orientGuidanceRouteFromStart(approachResult.points, resolvedTrailheadGuidance).reverse();

    if (
      origin &&
      endpointDistanceMeters(toGuidance(origin), orientedApproach[0]) > joinGapMaxMeters
    ) {
      return invalidResult({
        safeCode: 'TRIP_BUILDER_SPINE_ORIGIN_APPROACH_DISJOINT',
        origin,
        trailhead: resolvedTrailhead,
        trailEnd: resolvedTrailEnd,
        approachPointCount: orientedApproach.length,
        trailPointCount: orientedTrail.length,
        allowLoop,
      });
    }
    if (
      endpointDistanceMeters(orientedApproach[orientedApproach.length - 1], resolvedTrailheadGuidance) > joinGapMaxMeters
    ) {
      return invalidResult({
        safeCode: 'TRIP_BUILDER_SPINE_APPROACH_TRAILHEAD_DISJOINT',
        origin,
        trailhead: resolvedTrailhead,
        trailEnd: resolvedTrailEnd,
        approachPointCount: orientedApproach.length,
        trailPointCount: orientedTrail.length,
        allowLoop,
      });
    }
  }

  const hasUsableApproach = orientedApproach.length >= 2;
  const originAtTrailhead = !!origin &&
    endpointDistanceMeters(toGuidance(origin), resolvedTrailheadGuidance) <= joinGapMaxMeters;
  const geometry: RoadNavCoordinate[] = [];

  if (includeApproach && hasUsableApproach) {
    if (origin) appendCoordinate(geometry, toGuidance(origin));
    appendGeometry(geometry, orientedApproach);
  } else if (includeApproach && originAtTrailhead && origin) {
    appendCoordinate(geometry, toGuidance(origin));
  }

  appendCoordinate(geometry, resolvedTrailheadGuidance);
  appendGeometry(geometry, orientedTrail);
  appendCoordinate(geometry, toGuidance(resolvedTrailEnd));

  if (
    !preparedTrail.sourceIsLoop &&
    origin &&
    geometry.length >= 2 &&
    endpointDistanceMeters(toGuidance(origin), geometry[geometry.length - 1]) <= SPINE_CLOSURE_TOLERANCE_METERS
  ) {
    return invalidResult({
      safeCode: 'TRIP_BUILDER_SPINE_UNEXPECTED_CLOSURE',
      origin,
      trailhead: resolvedTrailhead,
      trailEnd: resolvedTrailEnd,
      approachPointCount: orientedApproach.length,
      trailPointCount: orientedTrail.length,
      allowLoop,
    });
  }

  const distanceIndex = buildGuidanceRouteDistanceIndex(geometry);
  if (distanceIndex.geometry.length < 2 || distanceIndex.totalDistanceM <= 0) {
    return invalidResult({
      safeCode: 'TRIP_BUILDER_SPINE_TRAIL_UNAVAILABLE',
      origin,
      trailhead: resolvedTrailhead,
      trailEnd: resolvedTrailEnd,
      approachPointCount: orientedApproach.length,
      trailPointCount: orientedTrail.length,
      allowLoop,
    });
  }

  const lineString = lineStringFromGeometry(geometry);
  const status: TripBuilderCanonicalRouteSpineStatus = includeApproach && (hasUsableApproach || originAtTrailhead)
    ? 'ready'
    : 'trail_only';
  return {
    status,
    safeCode: status === 'ready'
      ? 'TRIP_BUILDER_SPINE_READY'
      : 'TRIP_BUILDER_SPINE_APPROACH_UNAVAILABLE',
    lineString,
    coordinates: geometry.map(toGeoPoint),
    fingerprint: createRouteGeometryFingerprint(lineString),
    sourceLineCount: 1,
    origin,
    trailhead: resolvedTrailhead,
    trailEnd: resolvedTrailEnd,
    approachPointCount: orientedApproach.length,
    trailPointCount: orientedTrail.length,
    allowLoop,
  };
}
