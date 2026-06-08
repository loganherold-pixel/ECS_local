import { haversineDistanceMiles } from '../map/routeGeometryUtils';
import type { GeoPoint } from './tripBuilderTypes';

export const MAX_BAILOUT_PROVIDER_DISTANCE_FROM_ROUTE_START_MILES = 80;
export const MAX_BAILOUT_PROVIDER_DISTANCE_FROM_ROUTE_LINE_MILES = 30;

export type BailoutCandidateQualityPoint = {
  id: string;
  title: string;
  coordinate: GeoPoint;
  source: string;
  distanceFromRouteStartMiles?: number | null;
};

export type BailoutCandidateFilterResult<T extends BailoutCandidateQualityPoint> = {
  candidates: T[];
  rejectedProviderCount: number;
  usedRouteFallback: boolean;
};

function validPoint(point: GeoPoint | null | undefined): point is GeoPoint {
  return !!point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180;
}

function distanceFromRouteStartMiles(point: BailoutCandidateQualityPoint, routeStart: GeoPoint | null): number | null {
  if (typeof point.distanceFromRouteStartMiles === 'number' && Number.isFinite(point.distanceFromRouteStartMiles)) {
    return point.distanceFromRouteStartMiles;
  }
  return validPoint(routeStart) && validPoint(point.coordinate)
    ? haversineDistanceMiles(routeStart, point.coordinate)
    : null;
}

function distanceFromRouteLineMiles(point: BailoutCandidateQualityPoint, routePoints: GeoPoint[]): number | null {
  const validRoutePoints = routePoints.filter(validPoint);
  if (!validPoint(point.coordinate) || validRoutePoints.length < 2) return null;
  return validRoutePoints.reduce(
    (nearest, routePoint) => Math.min(nearest, haversineDistanceMiles(point.coordinate, routePoint)),
    Number.POSITIVE_INFINITY,
  );
}

export function isPlausibleProviderBailoutCandidate(args: {
  candidate: BailoutCandidateQualityPoint;
  routeStart?: GeoPoint | null;
  routePoints?: GeoPoint[] | null;
  maxDistanceFromRouteStartMiles?: number;
  maxDistanceFromRouteLineMiles?: number;
}): boolean {
  const startDistance = distanceFromRouteStartMiles(args.candidate, args.routeStart ?? null);
  if (
    startDistance != null &&
    startDistance > (args.maxDistanceFromRouteStartMiles ?? MAX_BAILOUT_PROVIDER_DISTANCE_FROM_ROUTE_START_MILES)
  ) {
    return false;
  }

  const lineDistance = distanceFromRouteLineMiles(args.candidate, args.routePoints ?? []);
  if (
    lineDistance != null &&
    lineDistance > (args.maxDistanceFromRouteLineMiles ?? MAX_BAILOUT_PROVIDER_DISTANCE_FROM_ROUTE_LINE_MILES)
  ) {
    return false;
  }

  return true;
}

export function filterBailoutPlanCandidates<T extends BailoutCandidateQualityPoint>(args: {
  providerCandidates: T[];
  routeFallbackCandidates: T[];
  routeStart?: GeoPoint | null;
  routePoints?: GeoPoint[] | null;
  limit: number;
}): BailoutCandidateFilterResult<T> {
  const plausibleProviderCandidates = args.providerCandidates.filter((candidate) => (
    isPlausibleProviderBailoutCandidate({
      candidate,
      routeStart: args.routeStart ?? null,
      routePoints: args.routePoints ?? [],
    })
  ));

  const candidates = plausibleProviderCandidates.length > 0
    ? plausibleProviderCandidates
    : args.routeFallbackCandidates;

  return {
    candidates: candidates.slice(0, Math.max(0, args.limit)),
    rejectedProviderCount: args.providerCandidates.length - plausibleProviderCandidates.length,
    usedRouteFallback: plausibleProviderCandidates.length === 0 && args.routeFallbackCandidates.length > 0,
  };
}
