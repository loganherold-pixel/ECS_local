import type { ExpeditionOpportunity } from './discoverEngine';
import {
  buildExploreNavigationPayload,
  getRoadDestinationCoordinate,
  type NavigationHandoffPayload,
} from './navigationHandoffStore';
import { computeBounds, type MapBounds } from './mapConfig';

export type ExplorePreviewCoordinate = {
  lat: number;
  lng: number;
};

export type ExploreRoutePreviewWaypoint = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  description?: string;
};

export type ExploreRoutePreviewCameraCommand = {
  mode: 'route_overview';
  center?: { latitude: number; longitude: number } | null;
  zoom?: number | null;
  fitBounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
    padding?: number;
    maxZoom?: number;
  } | null;
  durationMs?: number;
  animate?: boolean;
  reason?: string;
};

export type ExploreRoutePreviewModel = {
  payload: NavigationHandoffPayload;
  origin: ExplorePreviewCoordinate | null;
  routePoints: ExplorePreviewCoordinate[];
  mapPoints: ExplorePreviewCoordinate[];
  waypoints: ExploreRoutePreviewWaypoint[];
  routeBounds: MapBounds | null;
  cameraCommand: ExploreRoutePreviewCameraCommand | null;
  hasFullGeometry: boolean;
  hasRouteData: boolean;
  previewUnavailableReason: string | null;
};

function isValidCoordinate(
  point: ExplorePreviewCoordinate | null | undefined,
): point is ExplorePreviewCoordinate {
  return (
    !!point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

function sameCoordinate(
  left: ExplorePreviewCoordinate | null | undefined,
  right: ExplorePreviewCoordinate | null | undefined,
): boolean {
  if (!isValidCoordinate(left) || !isValidCoordinate(right)) return false;
  return Math.abs(left.lat - right.lat) < 0.00001 && Math.abs(left.lng - right.lng) < 0.00001;
}

function pushUniqueWaypoint(
  waypoints: ExploreRoutePreviewWaypoint[],
  id: string,
  coordinate: ExplorePreviewCoordinate | null | undefined,
  title: string,
  description?: string,
): void {
  if (!isValidCoordinate(coordinate)) return;
  if (waypoints.some((waypoint) => sameCoordinate({ lat: waypoint.latitude, lng: waypoint.longitude }, coordinate))) {
    return;
  }

  waypoints.push({
    id,
    latitude: coordinate.lat,
    longitude: coordinate.lng,
    title,
    description,
  });
}

export function getExploreRoutePreviewRoutePoints(
  payload: NavigationHandoffPayload,
): ExplorePreviewCoordinate[] {
  const geometry = payload.trailGeometry.filter(isValidCoordinate);
  const waypointCoordinates = payload.trailWaypoints
    .map((waypoint) => waypoint.coordinate)
    .filter(isValidCoordinate);
  const routeStart = payload.trailheadCoordinate ?? geometry[0] ?? payload.coordinate;
  const coordinateIsDistinctEndpoint =
    isValidCoordinate(payload.coordinate) && !sameCoordinate(payload.coordinate, routeStart)
      ? payload.coordinate
      : null;
  const roadCoordinateIsDistinctEndpoint =
    isValidCoordinate(payload.roadDestinationCoordinate) &&
    !sameCoordinate(payload.roadDestinationCoordinate, routeStart)
      ? payload.roadDestinationCoordinate
      : null;
  const routeEnd =
    geometry.length > 1
      ? geometry[geometry.length - 1]
      : waypointCoordinates.length > 1
        ? waypointCoordinates[waypointCoordinates.length - 1]
        : coordinateIsDistinctEndpoint ?? roadCoordinateIsDistinctEndpoint;

  if (geometry.length > 1) {
    return geometry;
  }

  if (waypointCoordinates.length > 1) {
    return waypointCoordinates;
  }

  if (isValidCoordinate(routeStart) && isValidCoordinate(routeEnd)) {
    return sameCoordinate(routeStart, routeEnd) ? [routeStart] : [routeStart, routeEnd];
  }

  if (isValidCoordinate(routeStart)) return [routeStart];
  const roadDestination = getRoadDestinationCoordinate(payload);
  if (isValidCoordinate(roadDestination)) return [roadDestination];
  return [];
}

export function buildExploreRoutePreviewCameraCommand(
  points: ExplorePreviewCoordinate[],
  padding = 58,
): { bounds: MapBounds | null; command: ExploreRoutePreviewCameraCommand | null } {
  const validPoints = points.filter(isValidCoordinate);
  if (validPoints.length === 0) {
    return { bounds: null, command: null };
  }

  if (validPoints.length === 1) {
    const point = validPoints[0];
    return {
      bounds: null,
      command: {
        mode: 'route_overview',
        center: { latitude: point.lat, longitude: point.lng },
        zoom: 13,
        durationMs: 450,
        animate: true,
        reason: 'explore_route_preview_single_point',
      },
    };
  }

  const bounds = computeBounds(validPoints as any);
  if (!bounds) {
    return { bounds: null, command: null };
  }

  return {
    bounds,
    command: {
      mode: 'route_overview',
      fitBounds: {
        north: bounds.maxLat,
        south: bounds.minLat,
        east: bounds.maxLng,
        west: bounds.minLng,
        padding,
        maxZoom: 14,
      },
      durationMs: 550,
      animate: true,
      reason: 'explore_route_preview_bounds',
    },
  };
}

export function normalizeNavigationHandoffPreview(
  payload: NavigationHandoffPayload,
  userLocation: ExplorePreviewCoordinate | null,
): ExploreRoutePreviewModel {
  const routePoints = getExploreRoutePreviewRoutePoints(payload);
  const origin = isValidCoordinate(userLocation) ? userLocation : null;
  const routeStart = routePoints[0] ?? null;
  const mapPoints = origin && routeStart
    ? [origin, ...routePoints].filter(isValidCoordinate)
    : routePoints.filter(isValidCoordinate);
  const camera = buildExploreRoutePreviewCameraCommand(mapPoints);
  const waypoints: ExploreRoutePreviewWaypoint[] = [];
  const routeEnd = routePoints[routePoints.length - 1] ?? null;
  const hasRouteData = routePoints.length >= 2;
  const metadataReason =
    typeof payload.routeMetadata?.routePreviewUnavailableReason === 'string'
      ? payload.routeMetadata.routePreviewUnavailableReason
      : null;
  const previewUnavailableReason = hasRouteData
    ? null
    : metadataReason ?? 'Route preview unavailable for this route until endpoint or route geometry is added.';

  pushUniqueWaypoint(waypoints, `${payload.id}-gps`, origin, 'Current GPS', 'Preview origin');
  pushUniqueWaypoint(waypoints, `${payload.id}-start`, routeStart, 'Route start', 'Selected route access point');
  pushUniqueWaypoint(waypoints, `${payload.id}-end`, routeEnd, payload.title, payload.subtitle ?? undefined);

  return {
    payload,
    origin,
    routePoints,
    mapPoints,
    waypoints,
    routeBounds: camera.bounds,
    cameraCommand: camera.command,
    hasFullGeometry: payload.trailGeometry.filter(isValidCoordinate).length > 1,
    hasRouteData,
    previewUnavailableReason,
  };
}

export function normalizeExploreRoutePreview(
  opportunity: ExpeditionOpportunity,
  userLocation: ExplorePreviewCoordinate | null,
): ExploreRoutePreviewModel {
  return normalizeNavigationHandoffPreview(
    buildExploreNavigationPayload(opportunity),
    userLocation,
  );
}
