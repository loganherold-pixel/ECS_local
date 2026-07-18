import {
  buildGuidanceRouteDistanceIndex,
  findNearestPlausibleRouteProjection,
} from '../navigation/guidanceRouteProjection';
import { normalizeCanonicalRouteGeometry } from '../routeGeometryLifecycle';
import type {
  GeoPoint,
  TripPlan,
  TripPlanStop,
} from './tripBuilderTypes';

export type TripBuilderGuidanceItineraryRole =
  | 'origin'
  | 'resupply'
  | 'trailhead'
  | 'destination';

export type TripBuilderGuidanceItineraryPoint = {
  id: string;
  title: string;
  role: TripBuilderGuidanceItineraryRole;
  coordinate: GeoPoint;
  routeIndex: number | null;
  distanceFromSpineM: number | null;
  sourceStopId: string | null;
};

export type BuildTripBuilderGuidanceItineraryInput = {
  plan: Pick<TripPlan, 'id' | 'suggestedStops'>;
  origin?: unknown;
  trailhead?: unknown;
  destination?: unknown;
  routeGeometry?: unknown;
};

const ITINERARY_POINT_DEDUPE_METERS = 8;

function coordinate(value: unknown): GeoPoint | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const latitude = Number(candidate.latitude ?? candidate.lat);
  const longitude = Number(candidate.longitude ?? candidate.lng ?? candidate.lon);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

function distanceMeters(left: GeoPoint, right: GeoPoint): number {
  const earthRadiusM = 6371008.8;
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLng = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function isGuidanceResupplyStop(stop: TripPlanStop): boolean {
  return stop.guidanceRole !== 'reference_only' &&
    (stop.type === 'fuel' || stop.type === 'supply' || stop.type === 'resupply') &&
    coordinate(stop.coordinate) != null;
}

function uniqueResupplyStops(stops: TripPlanStop[]): TripPlanStop[] {
  return stops
    .filter(isGuidanceResupplyStop)
    .sort((left, right) => left.sequence - right.sequence);
}

function appendPoint(
  target: Array<Omit<TripBuilderGuidanceItineraryPoint, 'routeIndex' | 'distanceFromSpineM'>>,
  point: Omit<TripBuilderGuidanceItineraryPoint, 'routeIndex' | 'distanceFromSpineM'>,
): void {
  const duplicate = target.find((existing) => (
    distanceMeters(existing.coordinate, point.coordinate) <= ITINERARY_POINT_DEDUPE_METERS
  ));
  if (!duplicate) {
    target.push(point);
    return;
  }
  if (duplicate.role === 'resupply' && point.role === 'resupply' && duplicate.title !== point.title) {
    duplicate.title = `${duplicate.title} + ${point.title}`;
  }
}

/**
 * Builds the only ordered guidance checkpoint sequence for a Trip Builder
 * plan. Camp, bailout, scenic, and analysis references intentionally remain
 * annotations and cannot enter this sequence.
 */
export function buildTripBuilderGuidanceItinerary(
  input: BuildTripBuilderGuidanceItineraryInput,
): TripBuilderGuidanceItineraryPoint[] {
  const points: Array<Omit<
    TripBuilderGuidanceItineraryPoint,
    'routeIndex' | 'distanceFromSpineM'
  >> = [];
  const origin = coordinate(input.origin);
  const trailhead = coordinate(input.trailhead);
  const destination = coordinate(input.destination);

  if (origin) {
    appendPoint(points, {
      id: `${input.plan.id}:origin`,
      title: 'Trip origin',
      role: 'origin',
      coordinate: origin,
      sourceStopId: null,
    });
  }
  uniqueResupplyStops(input.plan.suggestedStops).forEach((stop) => {
    const stopCoordinate = coordinate(stop.coordinate);
    if (!stopCoordinate) return;
    appendPoint(points, {
      id: `${input.plan.id}:resupply:${stop.id}`,
      title: stop.title,
      role: 'resupply',
      coordinate: stopCoordinate,
      sourceStopId: stop.id,
    });
  });
  if (trailhead) {
    appendPoint(points, {
      id: `${input.plan.id}:trailhead`,
      title: 'Trailhead',
      role: 'trailhead',
      coordinate: trailhead,
      sourceStopId: null,
    });
  }
  if (destination) {
    appendPoint(points, {
      id: `${input.plan.id}:destination`,
      title: 'Route end',
      role: 'destination',
      coordinate: destination,
      sourceStopId: null,
    });
  }

  const geometry = normalizeCanonicalRouteGeometry(input.routeGeometry).latLng;
  const routeIndex = buildGuidanceRouteDistanceIndex(geometry);
  return points.map((point) => {
    if (routeIndex.geometry.length < 2) {
      return { ...point, routeIndex: null, distanceFromSpineM: null };
    }
    const projection = findNearestPlausibleRouteProjection({
      position: {
        lat: point.coordinate.latitude,
        lng: point.coordinate.longitude,
      },
      routeIndex,
    });
    return {
      ...point,
      routeIndex: projection == null
        ? null
        : Math.min(
            routeIndex.geometry.length - 1,
            projection.segmentIndex + (projection.segmentFraction >= 0.5 ? 1 : 0),
          ),
      distanceFromSpineM: projection?.distanceFromPositionM ?? null,
    };
  });
}
