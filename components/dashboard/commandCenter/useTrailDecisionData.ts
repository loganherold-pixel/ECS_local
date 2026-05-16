import { useEffect, useMemo, useRef, useState } from 'react';

import { useActiveRouteProgressSnapshot } from '../../../lib/activeRouteProgress';
import {
  getActiveVehicleContext,
  subscribeActiveVehicleState,
  waitForActiveVehicleStateHydration,
  type ActiveVehicleContext,
} from '../../../lib/activeVehicleContext';
import { connectivity } from '../../../lib/connectivity';
import { buildEnvironmentSnapshot } from '../../../lib/environmentSnapshotService';
import { remotenessStore } from '../../../lib/remotenessStore';
import { useThrottledGPS } from '../../../lib/useThrottledGPS';
import { useVehicleHeading } from '../../../lib/useVehicleHeading';
import { vehicleSessionState } from '../../../lib/vehicleSessionState';
import { getCachedWeatherResult, type WeatherFetchResult } from '../../../lib/weatherStore';
import {
  normalizeTrailDecisionCommandData,
  type TrailDecisionCommandData,
} from '../../../lib/navigation/trailDecisionCommandData';

export type UseTrailDecisionDataOptions = {
  enabled?: boolean;
};

function getSessionLocation(session: ReturnType<typeof vehicleSessionState.get>) {
  const location = session.currentVehicleLocation;
  if (location.latitude == null || location.longitude == null) return null;
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyMeters: location.accuracyM,
    updatedAt: location.timestamp ?? null,
  };
}

function getGpsLocation(gps: ReturnType<typeof useThrottledGPS>) {
  const position = gps.rawGPS.position ?? gps.position;
  if (!gps.rawGPS.hasFix && !gps.hasFix) return null;
  if (!position) return null;
  return {
    latitude: position.latitude,
    longitude: position.longitude,
    accuracyMeters: position.accuracyM,
    updatedAt: position.timestamp ?? null,
  };
}

function useActiveVehicleContextSnapshot(): ActiveVehicleContext {
  const [context, setContext] = useState(() => getActiveVehicleContext());

  useEffect(() => {
    const sync = () => setContext(getActiveVehicleContext());
    const unsubscribe = subscribeActiveVehicleState(sync);
    waitForActiveVehicleStateHydration()
      .then(sync)
      .catch(sync);
    return unsubscribe;
  }, []);

  return context;
}

function useRemotenessIndexSnapshot(enabled: boolean) {
  const [remotenessIndex, setRemotenessIndex] = useState(() => remotenessStore.getIndex());

  useEffect(() => {
    if (!enabled) return undefined;
    const wasRunning = remotenessStore.isRunning();
    if (!wasRunning) remotenessStore.start();
    const sync = () => setRemotenessIndex(remotenessStore.getIndex());
    sync();
    const unsubscribe = remotenessStore.subscribe(sync);
    return () => {
      unsubscribe();
      if (!wasRunning) remotenessStore.stop();
    };
  }, [enabled]);

  return remotenessIndex;
}

export function useTrailDecisionData(
  options: UseTrailDecisionDataOptions = {},
): TrailDecisionCommandData {
  const enabled = options.enabled ?? true;
  const gps = useThrottledGPS({ enabled, highAccuracy: true });
  const gpsPosition = gps.rawGPS.position ?? gps.position;
  const heading = useVehicleHeading({
    enabled,
    gpsHeadingDeg: gpsPosition?.headingDeg ?? null,
    speedMph: gpsPosition?.speedMph ?? null,
  });
  const lastHeadingRef = useRef<number | null>(null);
  const [connectivityRevision, setConnectivityRevision] = useState(0);
  const [sessionState, setSessionState] = useState(() => vehicleSessionState.get());
  const vehicleContext = useActiveVehicleContextSnapshot();
  const remotenessIndex = useRemotenessIndexSnapshot(enabled);

  useEffect(() => {
    if (!enabled) return undefined;
    const unsubscribe = connectivity.onStatusChange(() => setConnectivityRevision((value) => value + 1));
    return unsubscribe;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    return vehicleSessionState.subscribe(() => setSessionState(vehicleSessionState.get()));
  }, [enabled]);

  const currentLocation = useMemo(
    () => getGpsLocation(gps) ?? getSessionLocation(sessionState),
    [
      gps,
      sessionState,
    ],
  );
  const routeProgress = useActiveRouteProgressSnapshot({
    gpsLatitude: currentLocation?.latitude ?? null,
    gpsLongitude: currentLocation?.longitude ?? null,
    gpsSpeedMph: gpsPosition?.speedMph ?? null,
    gpsHasFix: gps.rawGPS.hasFix || gps.hasFix,
  });
  const environment = useMemo(
    () =>
      buildEnvironmentSnapshot({
        coordinate: currentLocation
          ? {
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
              accuracyM: currentLocation.accuracyMeters ?? null,
              source: gps.rawGPS.hasFix || gps.hasFix ? 'gps' : 'last_known',
              updatedAt: currentLocation.updatedAt ?? null,
            }
          : null,
        remoteness: remotenessIndex,
      }),
    [
      currentLocation,
      gps.hasFix,
      gps.rawGPS.hasFix,
      remotenessIndex,
    ],
  );
  const weather = useMemo<WeatherFetchResult | null>(() => {
    if (!currentLocation) return null;
    return getCachedWeatherResult(
      [
        {
          lat: currentLocation.latitude,
          lng: currentLocation.longitude,
          label: 'Trail decision location',
          accuracyM: currentLocation.accuracyMeters ?? null,
          timestamp:
            typeof currentLocation.updatedAt === 'number'
              ? currentLocation.updatedAt
              : currentLocation.updatedAt
                ? new Date(currentLocation.updatedAt).getTime()
                : null,
        },
      ],
      'imperial',
      { allowStale: true },
    );
  }, [
    currentLocation,
  ]);
  const isOffline = connectivity.isOffline();
  const isUsingCachedData = Boolean(
    (!gps.rawGPS.hasFix && !gps.hasFix && currentLocation) ||
      weather?.source === 'cache_stale' ||
      weather?.source === 'cache_fresh' ||
      isOffline,
  );
  const headingDegrees =
    heading.heading ?? gpsPosition?.headingDeg ?? lastHeadingRef.current ?? null;
  const sourceUpdatedAt =
    gpsPosition?.timestamp ??
    currentLocation?.updatedAt ??
    routeProgress?.lastUpdated ??
    null;

  const data = useMemo(
    () =>
      normalizeTrailDecisionCommandData({
        currentLocation,
        currentHeadingDegrees: headingDegrees,
        hasLocationPermission: !gps.permissionDenied,
        activeRouteProgress: routeProgress,
        environment,
        weather,
        vehicleContext,
        remotenessIndex,
        terrainAvailable: remotenessIndex?.terrain?.complexity != null,
        terrainSourceLabel: remotenessIndex?.terrain?.complexity ? 'Remoteness terrain' : null,
        isOffline,
        isUsingCachedData,
        sourceUpdatedAt,
      }),
    [
      currentLocation,
      environment,
      gps.permissionDenied,
      headingDegrees,
      isOffline,
      isUsingCachedData,
      remotenessIndex,
      routeProgress,
      sourceUpdatedAt,
      vehicleContext,
      weather,
    ],
  );

  useEffect(() => {
    if (headingDegrees != null) {
      lastHeadingRef.current = headingDegrees;
    }
  }, [headingDegrees]);

  return data;
}

export default useTrailDecisionData;
