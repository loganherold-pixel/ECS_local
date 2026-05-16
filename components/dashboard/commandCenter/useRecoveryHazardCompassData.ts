import { useEffect, useMemo, useRef, useState } from 'react';

import { routeStore, type ImportedRoute, type RouteWaypoint } from '../../../lib/routeStore';
import { waypointProgressStore } from '../../../lib/waypointProgressStore';
import { pinStore } from '../../../lib/pinStore';
import { connectivity } from '../../../lib/connectivity';
import { useThrottledGPS } from '../../../lib/useThrottledGPS';
import { useVehicleHeading } from '../../../lib/useVehicleHeading';
import { vehicleSessionState } from '../../../lib/vehicleSessionState';
import {
  navigateRouteSessionStore,
  type NavigateRouteMapPoint,
  type NavigateRouteSessionSnapshot,
} from '../../../lib/navigateRouteSessionStore';
import {
  calculateBearingDegrees,
  calculateDistanceMiles,
  normalizeCoordinate,
  type NavigationCoordinate,
} from '../../../lib/navigation/bearingUtils';
import {
  normalizeRecoveryHazardCompassData,
  type RecoveryHazardCompassData,
  type RecoveryHazardCompassPointInput,
  type RecoveryHazardCompassRouteInput,
} from '../../../lib/navigation/recoveryHazardCompassData';
import type { ECSPin } from '../../navigate/PinTypes';
import type { VehicleSessionState } from '../../../lib/vehicleCompanionTypes';

export type UseRecoveryHazardCompassDataOptions = {
  enabled?: boolean;
  explicitRecoveryTarget?: RecoveryHazardCompassPointInput | null;
};

function sameActiveRoute(a: ImportedRoute | null, b: ImportedRoute | null): boolean {
  return (
    a?.id === b?.id &&
    a?.updated_at === b?.updated_at &&
    a?.is_active === b?.is_active &&
    a?.waypoint_count === b?.waypoint_count &&
    a?.segment_count === b?.segment_count
  );
}

function findNearestRoutePointIndex(
  location: NavigationCoordinate | null,
  points: NavigateRouteMapPoint[],
): number {
  if (!location || points.length === 0) return 0;
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const distance = calculateDistanceMiles(location, { latitude: point.lat, longitude: point.lng });
    if (distance != null && distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

function routePointToInput(
  point: NavigateRouteMapPoint | null | undefined,
  id: string,
  label: string,
): RecoveryHazardCompassPointInput | null {
  if (!point) return null;
  return {
    id,
    label,
    latitude: point.lat,
    longitude: point.lng,
    type: 'waypoint',
  };
}

function routeWaypointToInput(
  waypoint: RouteWaypoint | null | undefined,
  id: string,
  fallbackLabel: string,
): RecoveryHazardCompassPointInput | null {
  if (!waypoint) return null;
  return {
    id,
    label: waypoint.name ?? fallbackLabel,
    latitude: waypoint.lat,
    longitude: waypoint.lon,
    type: waypoint.waypointType ?? 'waypoint',
  };
}

function getImportedRouteStart(activeRoute: ImportedRoute | null): RecoveryHazardCompassPointInput | null {
  if (!activeRoute) return null;
  const waypointStart = routeWaypointToInput(
    activeRoute.waypoints[0],
    `${activeRoute.id}-start-waypoint`,
    'Route start',
  );
  if (waypointStart) return { ...waypointStart, type: 'routeStart' };

  const segmentStart = activeRoute.segments[0]?.points[0];
  if (!segmentStart) return null;
  return {
    id: `${activeRoute.id}-route-start`,
    label: 'Route start',
    latitude: segmentStart.lat,
    longitude: segmentStart.lon,
    type: 'routeStart',
  };
}

function getImportedRouteNextWaypoint(activeRoute: ImportedRoute | null): RecoveryHazardCompassPointInput | null {
  if (!activeRoute) return null;
  const waypointIndex = waypointProgressStore.getIndex(activeRoute.id);
  const waypoint = activeRoute.waypoints[Math.max(0, Math.min(waypointIndex, activeRoute.waypoints.length - 1))];
  const waypointInput = routeWaypointToInput(
    waypoint,
    `${activeRoute.id}-wp-${waypointIndex}`,
    `Waypoint ${waypointIndex + 1}`,
  );
  if (waypointInput) return waypointInput;

  const firstRoutePoint = activeRoute.segments[0]?.points[0];
  if (!firstRoutePoint) return null;
  return {
    id: `${activeRoute.id}-route-point-0`,
    label: activeRoute.name || 'Route point',
    latitude: firstRoutePoint.lat,
    longitude: firstRoutePoint.lon,
    type: 'waypoint',
  };
}

function getNavigateSessionNextWaypoint(
  navigateSession: NavigateRouteSessionSnapshot,
  currentLocation: NavigationCoordinate | null,
): RecoveryHazardCompassPointInput | null {
  const points = navigateSession.routePoints;
  if (!Array.isArray(points) || points.length === 0) return null;
  const nearestIndex = findNearestRoutePointIndex(currentLocation, points);
  const nextIndex = Math.min(nearestIndex + 1, points.length - 1);
  return routePointToInput(
    points[nextIndex],
    `${navigateSession.routeId ?? navigateSession.sessionId ?? 'navigate-route'}-point-${nextIndex}`,
    navigateSession.instruction?.trim() || navigateSession.routeTitle?.trim() || 'Next route point',
  );
}

function getNavigateSessionRouteStart(
  navigateSession: NavigateRouteSessionSnapshot,
): RecoveryHazardCompassPointInput | null {
  const point = navigateSession.routePoints[0];
  return routePointToInput(
    point,
    `${navigateSession.routeId ?? navigateSession.sessionId ?? 'navigate-route'}-start`,
    'Route start',
  );
}

function getNavigateSessionRoutePoints(
  navigateSession: NavigateRouteSessionSnapshot,
): RecoveryHazardCompassPointInput[] {
  return navigateSession.routePoints.map((point, index) => ({
    id: `${navigateSession.routeId ?? navigateSession.sessionId ?? 'navigate-route'}-corridor-${index}`,
    label: `Route corridor ${index + 1}`,
    latitude: point.lat,
    longitude: point.lng,
    type: 'route',
  }));
}

function getImportedRoutePoints(activeRoute: ImportedRoute | null): RecoveryHazardCompassPointInput[] {
  if (!activeRoute) return [];
  return activeRoute.segments.flatMap((segment, segmentIndex) =>
    segment.points.map((point, pointIndex) => ({
      id: `${activeRoute.id}-segment-${segmentIndex}-point-${pointIndex}`,
      label: `Route corridor ${pointIndex + 1}`,
      latitude: point.lat,
      longitude: point.lon,
      type: 'route',
    })),
  );
}

function mapPinToCompassPoint(pin: ECSPin): RecoveryHazardCompassPointInput {
  return {
    id: pin.id,
    label: pin.title || pin.type,
    latitude: pin.lat,
    longitude: pin.lng,
    type: pin.type,
    severity: pin.severity ?? null,
  };
}

function mapRouteHazards(activeRoute: ImportedRoute | null): RecoveryHazardCompassPointInput[] {
  if (!activeRoute) return [];
  return activeRoute.waypoints
    .map((waypoint, index) => ({ waypoint, index }))
    .filter(({ waypoint }) => waypoint.waypointType === 'hazard')
    .map(({ waypoint, index }) => ({
      id: `${activeRoute.id}-hazard-${index}`,
      label: waypoint.name ?? `Route hazard ${index + 1}`,
      latitude: waypoint.lat,
      longitude: waypoint.lon,
      type: 'routeHazard',
      severity: 'medium' as const,
    }));
}

function getSessionLocation(session: VehicleSessionState): RecoveryHazardCompassPointInput | null {
  const location = session.currentVehicleLocation;
  if (location.latitude == null || location.longitude == null) return null;
  return {
    id: 'vehicle-session-location',
    label: location.isLive ? 'Vehicle location' : 'Last known vehicle location',
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyMeters: location.accuracyM,
  };
}

function getLiveGpsLocation(gps: ReturnType<typeof useThrottledGPS>): RecoveryHazardCompassPointInput | null {
  const position = gps.rawGPS.position ?? gps.position;
  if (!gps.rawGPS.hasFix && !gps.hasFix) return null;
  if (!position) return null;
  return {
    id: 'gps-current-location',
    label: 'Current GPS location',
    latitude: position.latitude,
    longitude: position.longitude,
    accuracyMeters: position.accuracyM,
  };
}

function buildRouteInput(params: {
  activeRoute: ImportedRoute | null;
  navigateSession: NavigateRouteSessionSnapshot;
  currentLocation: NavigationCoordinate | null;
}): RecoveryHazardCompassRouteInput | null {
  const { activeRoute, navigateSession, currentLocation } = params;
  const navigateHasRoute =
    navigateSession.lifecycle !== 'inactive' &&
    (Boolean(navigateSession.routeId) || navigateSession.routePoints.length > 0);
  if (navigateHasRoute) {
    return {
      id: navigateSession.routeId ?? navigateSession.sessionId ?? 'navigate-route',
      label: navigateSession.routeTitle ?? navigateSession.statusLabel,
      isActive: navigateSession.lifecycle === 'active',
      nextWaypoint: getNavigateSessionNextWaypoint(navigateSession, currentLocation),
      routeStart: getNavigateSessionRouteStart(navigateSession),
      routePoints: getNavigateSessionRoutePoints(navigateSession),
      updatedAt: navigateSession.updatedAt,
    };
  }
  if (!activeRoute) return null;
  return {
    id: activeRoute.id,
    label: activeRoute.name,
    isActive: activeRoute.is_active,
    nextWaypoint: getImportedRouteNextWaypoint(activeRoute),
    routeStart: getImportedRouteStart(activeRoute),
    routePoints: getImportedRoutePoints(activeRoute),
    updatedAt: activeRoute.updated_at,
  };
}

export function useRecoveryHazardCompassData(
  options: UseRecoveryHazardCompassDataOptions = {},
): RecoveryHazardCompassData {
  const enabled = options.enabled ?? true;
  const gps = useThrottledGPS({ enabled, highAccuracy: true });
  const gpsPosition = gps.rawGPS.position ?? gps.position;
  const heading = useVehicleHeading({
    enabled,
    gpsHeadingDeg: gpsPosition?.headingDeg ?? null,
    speedMph: gpsPosition?.speedMph ?? null,
  });
  const lastKnownHeadingRef = useRef<number | null>(null);

  const [activeRoute, setActiveRoute] = useState<ImportedRoute | null>(() => routeStore.getActive());
  const [navigateSession, setNavigateSession] = useState<NavigateRouteSessionSnapshot>(() =>
    navigateRouteSessionStore.getSnapshot(),
  );
  const [pins, setPins] = useState<ECSPin[]>(() => pinStore.getAll());
  const [sessionState, setSessionState] = useState<VehicleSessionState>(() => vehicleSessionState.get());
  const [connectivityRevision, setConnectivityRevision] = useState(0);

  useEffect(() => {
    const syncRoute = () => {
      const next = routeStore.getActive();
      setActiveRoute((current) => (sameActiveRoute(current, next) ? current : next));
    };
    syncRoute();
    return routeStore.subscribe(syncRoute);
  }, []);

  useEffect(() => {
    let mounted = true;
    const sync = (next: NavigateRouteSessionSnapshot) => {
      setNavigateSession((current) => (current === next ? current : next));
    };
    const unsubscribe = navigateRouteSessionStore.subscribe(sync);
    void navigateRouteSessionStore.hydrateFromPersistence().then((snapshot) => {
      if (mounted) sync(snapshot);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => pinStore.subscribe(() => setPins(pinStore.getAll())), []);

  useEffect(() => vehicleSessionState.subscribe(() => setSessionState(vehicleSessionState.get())), []);

  useEffect(() => {
    const unsubscribe = connectivity.onStatusChange(() => {
      setConnectivityRevision((value) => value + 1);
    });
    return unsubscribe;
  }, []);

  const sourceUpdatedAt =
    gpsPosition?.timestamp != null
      ? gpsPosition.timestamp
      : sessionState.currentVehicleLocation.timestamp ?? navigateSession.updatedAt ?? activeRoute?.updated_at ?? null;

  const sessionLocation = useMemo(
    () => getSessionLocation(sessionState),
    [
      sessionState,
    ],
  );
  const currentLocationInput = useMemo(
    () => getLiveGpsLocation(gps) ?? sessionLocation,
    [
      gps,
      sessionLocation,
    ],
  );
  const currentLocation = useMemo(() => normalizeCoordinate(currentLocationInput), [currentLocationInput]);
  const activeRouteInput = useMemo(
    () =>
      buildRouteInput({
        activeRoute,
        navigateSession,
        currentLocation,
      }),
    [activeRoute, currentLocation, navigateSession],
  );
  const estimatedRouteBearingDegrees = useMemo(
    () =>
      calculateBearingDegrees(
        currentLocation,
        normalizeCoordinate(activeRouteInput?.nextWaypoint),
      ),
    [activeRouteInput?.nextWaypoint, currentLocation],
  );
  const hazardPins = useMemo(
    () => pins.filter((pin) => pin.type === 'hazard' && !pin.resolved).map(mapPinToCompassPoint),
    [pins],
  );
  const savedPins = useMemo(
    () => pins.filter((pin) => !pin.resolved).map(mapPinToCompassPoint),
    [pins],
  );
  const activeRouteHazards = useMemo(() => mapRouteHazards(activeRoute), [activeRoute]);
  const isOffline = connectivity.isOffline() || sessionState.connectivityStatus === 'offline';
  const isUsingCachedData = Boolean(
    (!gps.rawGPS.hasFix && !gps.hasFix && sessionLocation) ||
      (isOffline && (activeRouteInput || savedPins.length > 0 || hazardPins.length > 0)),
  );

  const data = useMemo(
    () =>
      normalizeRecoveryHazardCompassData({
        liveCompassHeadingDegrees: heading.source === 'compass' ? heading.heading : null,
        gpsCourseDegrees: gpsPosition?.headingDeg ?? null,
        gpsSpeedMph: gpsPosition?.speedMph ?? null,
        estimatedRouteBearingDegrees,
        lastKnownHeadingDegrees: lastKnownHeadingRef.current,
        currentLocation: currentLocationInput,
        explicitRecoveryTarget: options.explicitRecoveryTarget ?? null,
        activeRoute: activeRouteInput,
        savedPins,
        activeRouteHazards,
        hazardPins,
        offlineCachedHazards: isOffline ? hazardPins : [],
        isOffline,
        isUsingCachedData,
        sourceUpdatedAt,
      }),
    [
      activeRouteHazards,
      activeRouteInput,
      currentLocationInput,
      estimatedRouteBearingDegrees,
      gpsPosition?.headingDeg,
      gpsPosition?.speedMph,
      hazardPins,
      heading.heading,
      heading.source,
      isOffline,
      isUsingCachedData,
      options.explicitRecoveryTarget,
      savedPins,
      sourceUpdatedAt,
    ],
  );

  useEffect(() => {
    if (data.headingDegrees != null) {
      lastKnownHeadingRef.current = data.headingDegrees;
    }
  }, [data.headingDegrees]);

  return data;
}
