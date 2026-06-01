import type {
  EstablishedCampsite,
  EstablishedCampsiteFeeStatus,
  EstablishedCampsiteReservationStatus,
  EstablishedCampsiteSource,
} from './establishedCampsiteTypes';
import {
  distancePointToRouteMiles,
  haversineDistanceMiles,
  normalizeRouteCoordinate,
  normalizeRouteCoordinates,
  type RouteCoordinate,
} from './routeGeometryUtils';

export const DEFAULT_ESTABLISHED_CAMPSITE_ROUTE_CORRIDOR_MILES = 10;
export const DEFAULT_ESTABLISHED_CAMPSITE_ROUTE_SUMMARY_LIMIT = 3;

export type RouteNearbyEstablishedCampsite = EstablishedCampsite & {
  distanceFromRouteMiles?: number;
  distanceFromCurrentLocationMiles?: number;
};

export type EstablishedCampsiteRouteSearchOptions = {
  campsites: readonly EstablishedCampsite[];
  routeCoordinates: readonly RouteCoordinate[] | null | undefined;
  currentLocation?: RouteCoordinate;
  corridorMiles?: number;
  maxResults?: number;
};

function clampPositiveMiles(value: number | null | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function roundMiles(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 10) / 10;
}

function isValidCampsiteCoordinate(campsite: EstablishedCampsite): boolean {
  return (
    Number.isFinite(campsite.latitude) &&
    Number.isFinite(campsite.longitude) &&
    campsite.latitude >= -90 &&
    campsite.latitude <= 90 &&
    campsite.longitude >= -180 &&
    campsite.longitude <= 180
  );
}

function getReservationRank(value: EstablishedCampsiteReservationStatus): number {
  switch (value) {
    case 'required':
    case 'reservable':
      return 0;
    case 'mixed':
      return 1;
    case 'first_come':
      return 2;
    case 'unknown':
    default:
      return 3;
  }
}

function getFeeRank(value: EstablishedCampsiteFeeStatus): number {
  return value === 'unknown' ? 1 : 0;
}

function getSourceReliabilityRank(value: EstablishedCampsiteSource): number {
  switch (value) {
    case 'RECREATION_GOV':
    case 'NPS':
      return 0;
    case 'STATE':
    case 'COUNTY':
      return 1;
    case 'OSM':
      return 2;
    case 'PRIVATE':
      return 3;
    case 'UNKNOWN':
    default:
      return 4;
  }
}

function getCurrentLocationDistanceMiles(
  campsite: EstablishedCampsite,
  currentLocation?: RouteCoordinate,
): number | undefined {
  const normalizedCurrent = normalizeRouteCoordinate(currentLocation);
  if (!normalizedCurrent) return undefined;
  return roundMiles(
    haversineDistanceMiles(
      { latitude: campsite.latitude, longitude: campsite.longitude },
      normalizedCurrent,
    ),
  );
}

export function findEstablishedCampsitesNearRoute({
  campsites,
  routeCoordinates,
  currentLocation,
  corridorMiles = DEFAULT_ESTABLISHED_CAMPSITE_ROUTE_CORRIDOR_MILES,
  maxResults = DEFAULT_ESTABLISHED_CAMPSITE_ROUTE_SUMMARY_LIMIT,
}: EstablishedCampsiteRouteSearchOptions): RouteNearbyEstablishedCampsite[] {
  const route = normalizeRouteCoordinates(routeCoordinates);
  if (route.length < 2 || !Array.isArray(campsites) || campsites.length === 0) return [];

  const corridor = clampPositiveMiles(corridorMiles, DEFAULT_ESTABLISHED_CAMPSITE_ROUTE_CORRIDOR_MILES);
  const limit = Math.max(1, Math.floor(maxResults || DEFAULT_ESTABLISHED_CAMPSITE_ROUTE_SUMMARY_LIMIT));
  const candidates: RouteNearbyEstablishedCampsite[] = [];

  campsites.forEach((campsite) => {
    if (!isValidCampsiteCoordinate(campsite)) return;
    const distanceFromRoute = distancePointToRouteMiles(
      { latitude: campsite.latitude, longitude: campsite.longitude },
      route,
    );
    if (distanceFromRoute == null || distanceFromRoute > corridor) return;

    candidates.push({
      ...campsite,
      distanceFromRouteMiles: roundMiles(distanceFromRoute),
      distanceFromCurrentLocationMiles: getCurrentLocationDistanceMiles(campsite, currentLocation),
    });
  });

  candidates.sort((a, b) => {
    const routeDistanceDelta =
      (a.distanceFromRouteMiles ?? Number.POSITIVE_INFINITY) -
      (b.distanceFromRouteMiles ?? Number.POSITIVE_INFINITY);
    if (routeDistanceDelta !== 0) return routeDistanceDelta;

    const reservationDelta =
      getReservationRank(a.reservationStatus) - getReservationRank(b.reservationStatus);
    if (reservationDelta !== 0) return reservationDelta;

    const feeDelta = getFeeRank(a.feeStatus) - getFeeRank(b.feeStatus);
    if (feeDelta !== 0) return feeDelta;

    const sourceDelta = getSourceReliabilityRank(a.source) - getSourceReliabilityRank(b.source);
    if (sourceDelta !== 0) return sourceDelta;

    return (
      (a.distanceFromCurrentLocationMiles ?? Number.POSITIVE_INFINITY) -
      (b.distanceFromCurrentLocationMiles ?? Number.POSITIVE_INFINITY)
    );
  });

  return candidates.slice(0, limit);
}

export function hasRouteGeometryForEstablishedCampsiteSearch(
  routeCoordinates: readonly RouteCoordinate[] | null | undefined,
): boolean {
  return normalizeRouteCoordinates(routeCoordinates).length > 1;
}

