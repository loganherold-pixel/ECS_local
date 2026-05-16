import { useEffect, useMemo, useState } from 'react';

import { connectivity } from '../../../lib/connectivity';
import { buildEnvironmentSnapshot } from '../../../lib/environmentSnapshotService';
import {
  normalizeCampScoutCommandData,
  type CampScoutCommandCandidateInput,
  type CampScoutCommandData,
} from '../../../lib/navigation/campScoutCommandData';
import { pinStore } from '../../../lib/pinStore';
import { routeStore, type ImportedRoute } from '../../../lib/routeStore';
import { remotenessStore } from '../../../lib/remotenessStore';
import { useThrottledGPS } from '../../../lib/useThrottledGPS';
import { vehicleSessionState } from '../../../lib/vehicleSessionState';
import { getCachedWeatherResult, type WeatherFetchResult } from '../../../lib/weatherStore';
import {
  navigateRouteSessionStore,
  type NavigateRouteSessionSnapshot,
} from '../../../lib/navigateRouteSessionStore';
import type { EstablishedCampsite } from '../../../lib/map/establishedCampsiteTypes';
import { SAMPLE_ESTABLISHED_CAMPSITES } from '../../../lib/map/establishedCampsiteSources';
import type { ECSPin } from '../../navigate/PinTypes';
import type { VehicleSessionState } from '../../../lib/vehicleCompanionTypes';

export type UseCampScoutDataOptions = {
  enabled?: boolean;
  selectedCandidateId?: string | null;
};

function getSessionLocation(session: VehicleSessionState) {
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

function activeRoutePoints(activeRoute: ImportedRoute | null): { latitude: number; longitude: number }[] {
  if (!activeRoute) return [];
  return activeRoute.segments.flatMap((segment) =>
    segment.points.map((point) => ({ latitude: point.lat, longitude: point.lon })),
  );
}

function navigateSessionRoutePoints(
  navigateSession: NavigateRouteSessionSnapshot,
): { latitude: number; longitude: number }[] {
  if (navigateSession.lifecycle === 'inactive') return [];
  return navigateSession.routePoints.map((point) => ({ latitude: point.lat, longitude: point.lng }));
}

function pinToCampCandidate(pin: ECSPin): CampScoutCommandCandidateInput | null {
  if (pin.resolved || pin.type !== 'camp') return null;
  return {
    id: pin.id,
    name: pin.title || 'Saved camp pin',
    latitude: pin.lat,
    longitude: pin.lng,
    source: 'savedPin',
    legalAccessConfidence: 'verify',
    flatnessScore: null,
    remotenessScore: null,
    vehicleAccessConfidence: 'unknown',
    notes: pin.notes,
    isEstimated: true,
    sourceLabel: 'Saved camp pin',
  };
}

function establishedToCampCandidate(site: EstablishedCampsite): CampScoutCommandCandidateInput {
  return {
    id: site.id,
    name: site.name,
    latitude: site.latitude,
    longitude: site.longitude,
    source: 'establishedCampground',
    legalAccessConfidence: 'established',
    flatnessScore: site.campsiteType === 'rv_park' || site.campsiteType === 'campground' ? 74 : 62,
    remotenessScore: site.source === 'PRIVATE' ? 34 : 48,
    vehicleAccessConfidence:
      site.rvAllowed || site.trailersAllowed || site.maxVehicleLengthFt != null ? 'good' : 'limited',
    notes: [
      site.feeStatus === 'paid' ? 'Pay-per-night' : site.feeStatus === 'free' ? 'Fee not listed' : 'Fee unknown',
      site.reservationStatus === 'reservable' || site.reservationStatus === 'required'
        ? 'Reservation signal'
        : 'Reservation unknown',
    ].join(' · '),
    isEstimated: true,
    sourceLabel: site.source.replace(/_/g, ' '),
  };
}

function isEstablishedCandidateSourceEnabled(): boolean {
  const envValue =
    typeof process !== 'undefined'
      ? process.env.EXPO_PUBLIC_ECS_ESTABLISHED_CAMPSITES_LAYER
      : undefined;
  return envValue === 'true' || envValue === '1';
}

function usePinSnapshot(enabled: boolean): ECSPin[] {
  const [pins, setPins] = useState<ECSPin[]>(() => pinStore.getAll());
  useEffect(() => {
    if (!enabled) return undefined;
    const sync = () => setPins(pinStore.getAll());
    sync();
    return pinStore.subscribe(sync);
  }, [enabled]);
  return pins;
}

function useRouteSnapshot(enabled: boolean): {
  activeRoute: ImportedRoute | null;
  navigateSession: NavigateRouteSessionSnapshot;
} {
  const [activeRoute, setActiveRoute] = useState<ImportedRoute | null>(() => routeStore.getActive());
  const [navigateSession, setNavigateSession] = useState<NavigateRouteSessionSnapshot>(() =>
    navigateRouteSessionStore.getSnapshot(),
  );

  useEffect(() => {
    if (!enabled) return undefined;
    const sync = () => setActiveRoute(routeStore.getActive());
    sync();
    return routeStore.subscribe(sync);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let mounted = true;
    const unsubscribe = navigateRouteSessionStore.subscribe((next) => {
      if (mounted) setNavigateSession(next);
    });
    void navigateRouteSessionStore.hydrateFromPersistence().then((snapshot) => {
      if (mounted) setNavigateSession(snapshot);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [enabled]);

  return { activeRoute, navigateSession };
}

function useRemotenessIndex(enabled: boolean) {
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

export function useCampScoutData(options: UseCampScoutDataOptions = {}): CampScoutCommandData {
  const enabled = options.enabled ?? true;
  const gps = useThrottledGPS({ enabled, highAccuracy: true });
  const pins = usePinSnapshot(enabled);
  const { activeRoute, navigateSession } = useRouteSnapshot(enabled);
  const remotenessIndex = useRemotenessIndex(enabled);
  const [sessionState, setSessionState] = useState<VehicleSessionState>(() => vehicleSessionState.get());
  const [connectivityRevision, setConnectivityRevision] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    return vehicleSessionState.subscribe(() => setSessionState(vehicleSessionState.get()));
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    return connectivity.onStatusChange(() => setConnectivityRevision((value) => value + 1));
  }, [enabled]);

  const currentLocation = useMemo(
    () => getGpsLocation(gps) ?? getSessionLocation(sessionState),
    [
      gps,
      sessionState,
    ],
  );

  const routePoints = useMemo(() => {
    const sessionPoints = navigateSessionRoutePoints(navigateSession);
    return sessionPoints.length > 0 ? sessionPoints : activeRoutePoints(activeRoute);
  }, [activeRoute, navigateSession]);

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
          label: 'Camp scout location',
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

  const candidates = useMemo<CampScoutCommandCandidateInput[]>(() => {
    const saved = pins.map(pinToCampCandidate).filter((entry): entry is CampScoutCommandCandidateInput => !!entry);
    const established = isEstablishedCandidateSourceEnabled()
      ? SAMPLE_ESTABLISHED_CAMPSITES.map(establishedToCampCandidate)
      : [];
    return [...saved, ...established];
  }, [pins]);

  const isOffline = connectivity.isOffline() || sessionState.connectivityStatus === 'offline';
  const isUsingCachedData = Boolean(
    (!gps.rawGPS.hasFix && !gps.hasFix && currentLocation) ||
      weather?.source === 'cache_stale' ||
      weather?.source === 'cache_fresh' ||
      isOffline,
  );
  const sourceUpdatedAt =
    gps.rawGPS.position?.timestamp ??
    gps.position?.timestamp ??
    currentLocation?.updatedAt ??
    navigateSession.updatedAt ??
    activeRoute?.updated_at ??
    null;

  return useMemo(
    () =>
      normalizeCampScoutCommandData({
        currentLocation,
        routePoints,
        routeActive:
          navigateSession.lifecycle === 'active' ||
          Boolean(activeRoute?.is_active),
        candidates,
        selectedCandidateId: options.selectedCandidateId ?? null,
        environment,
        weather,
        isOffline,
        isUsingCachedData,
        sourceUpdatedAt,
      }),
    [
      activeRoute?.is_active,
      candidates,
      currentLocation,
      environment,
      isOffline,
      isUsingCachedData,
      navigateSession.lifecycle,
      options.selectedCandidateId,
      routePoints,
      sourceUpdatedAt,
      weather,
    ],
  );
}

export default useCampScoutData;
