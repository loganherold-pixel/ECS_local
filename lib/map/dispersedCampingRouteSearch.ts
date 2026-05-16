import type {
  DispersedCampingConfidence,
  DispersedCampingLandManager,
  DispersedCampingRegion,
} from './dispersedCampingTypes';
import {
  distancePointToRouteMiles,
  distanceRegionToRouteMiles,
  getClosestRouteIndex,
  getGeometryCentroid,
  haversineDistanceMiles,
  normalizeRouteCoordinate,
  normalizeRouteCoordinates,
  type NormalizedRouteCoordinate,
  type RouteCoordinate,
} from './routeGeometryUtils';

export const DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES = 5;
export const DEFAULT_DISPERSED_CAMPING_ROUTE_SUMMARY_LIMIT = 3;

export type RouteNearbyDispersedCampingRegion = {
  regionId: string;
  confidence: DispersedCampingConfidence;
  landManager: DispersedCampingLandManager;
  distanceFromRouteMiles?: number;
  distanceFromCurrentLocationMiles?: number;
  eligibilityLabel: string;
  basis: string[];
  restrictions: string[];
  requiresVerification: boolean;
};

export type DispersedCampingRouteSearchOptions = {
  regions: DispersedCampingRegion[];
  routeCoordinates: readonly RouteCoordinate[] | null | undefined;
  currentLocation?: RouteCoordinate;
  corridorMiles?: number;
  maxResults?: number;
};

type SearchCandidate = RouteNearbyDispersedCampingRegion & {
  routeIndexScore?: number;
  aheadOfCurrentLocation?: boolean;
};

const CONFIDENCE_RANK: Record<DispersedCampingConfidence, number> = {
  high: 0,
  medium: 1,
  verify: 2,
  restricted: 3,
};

function clampPositiveMiles(value: number | null | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function roundMiles(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 10) / 10;
}

function getRegionCurrentLocationDistance(
  centroid: NormalizedRouteCoordinate | null,
  currentLocation: RouteCoordinate,
): number | undefined {
  const normalizedLocation = normalizeRouteCoordinate(currentLocation);
  if (!centroid || !normalizedLocation) return undefined;
  return roundMiles(haversineDistanceMiles(centroid, normalizedLocation));
}

function getRegionRouteIndexScore(
  centroid: NormalizedRouteCoordinate | null,
  routeCoordinates: readonly RouteCoordinate[] | null | undefined,
): number | undefined {
  if (!centroid) return undefined;
  const index = getClosestRouteIndex(centroid, routeCoordinates);
  return index ?? undefined;
}

export function findDispersedCampingRegionsNearRoute({
  regions,
  routeCoordinates,
  currentLocation,
  corridorMiles = DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES,
  maxResults = DEFAULT_DISPERSED_CAMPING_ROUTE_SUMMARY_LIMIT,
}: DispersedCampingRouteSearchOptions): RouteNearbyDispersedCampingRegion[] {
  const route = normalizeRouteCoordinates(routeCoordinates);
  if (route.length < 2 || !Array.isArray(regions) || regions.length === 0) return [];

  const corridor = clampPositiveMiles(corridorMiles, DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES);
  const limit = Math.max(1, Math.floor(maxResults || DEFAULT_DISPERSED_CAMPING_ROUTE_SUMMARY_LIMIT));
  const currentRouteIndex =
    currentLocation != null
      ? (() => {
          const normalizedCurrent = normalizeRouteCoordinate(currentLocation);
          return normalizedCurrent ? getClosestRouteIndex(normalizedCurrent, route) : null;
        })()
      : null;

  const candidates: SearchCandidate[] = [];
  for (const region of regions) {
    if (region.confidence === 'restricted') continue;

    const distanceFromRoute = distanceRegionToRouteMiles(region.geometry, route);
    if (distanceFromRoute == null || distanceFromRoute > corridor) continue;

    const centroid = getGeometryCentroid(region.geometry);
    const routeIndexScore = getRegionRouteIndexScore(centroid, route);
    const aheadOfCurrentLocation =
      currentRouteIndex != null && routeIndexScore != null
        ? routeIndexScore >= currentRouteIndex
        : undefined;

    candidates.push({
      regionId: region.id,
      confidence: region.confidence,
      landManager: region.landManager,
      distanceFromRouteMiles: roundMiles(distanceFromRoute),
      distanceFromCurrentLocationMiles: getRegionCurrentLocationDistance(centroid, currentLocation),
      eligibilityLabel: region.eligibilityLabel,
      basis: region.basis,
      restrictions: region.restrictions,
      requiresVerification: region.requiresVerification,
      routeIndexScore,
      aheadOfCurrentLocation,
    });
  }

  candidates.sort((a, b) => {
    const confidenceDelta = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
    if (confidenceDelta !== 0) return confidenceDelta;

    if (a.aheadOfCurrentLocation !== b.aheadOfCurrentLocation) {
      if (a.aheadOfCurrentLocation === true) return -1;
      if (b.aheadOfCurrentLocation === true) return 1;
    }

    const distanceDelta =
      (a.distanceFromRouteMiles ?? Number.POSITIVE_INFINITY) -
      (b.distanceFromRouteMiles ?? Number.POSITIVE_INFINITY);
    if (distanceDelta !== 0) return distanceDelta;

    return (a.routeIndexScore ?? Number.POSITIVE_INFINITY) - (b.routeIndexScore ?? Number.POSITIVE_INFINITY);
  });

  return candidates.slice(0, limit).map(({ routeIndexScore, aheadOfCurrentLocation, ...result }) => result);
}

export function getDispersedCampingRouteNearbyIdSet(
  results: readonly RouteNearbyDispersedCampingRegion[],
): Set<string> {
  return new Set(results.map((result) => result.regionId));
}

export function getDispersedCampingRouteDistanceByRegionId(
  results: readonly RouteNearbyDispersedCampingRegion[],
): Record<string, number> {
  return results.reduce<Record<string, number>>((acc, result) => {
    if (typeof result.distanceFromRouteMiles === 'number') {
      acc[result.regionId] = result.distanceFromRouteMiles;
    }
    return acc;
  }, {});
}

export function buildDispersedCampingRouteSearchSignature(input: {
  routeCoordinates: readonly RouteCoordinate[] | null | undefined;
  regionIds: readonly string[];
  corridorMiles?: number;
}): string {
  const route = normalizeRouteCoordinates(input.routeCoordinates);
  const routeKey = route
    .map((coordinate) => `${coordinate.latitude.toFixed(4)},${coordinate.longitude.toFixed(4)}`)
    .join('|');
  return [
    routeKey,
    input.regionIds.join(','),
    clampPositiveMiles(input.corridorMiles, DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES),
  ].join('::');
}

export function hasRouteGeometryForDispersedCampingSearch(
  routeCoordinates: readonly RouteCoordinate[] | null | undefined,
): boolean {
  return normalizeRouteCoordinates(routeCoordinates).length > 1;
}

export { distancePointToRouteMiles };
