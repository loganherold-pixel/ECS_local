import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ActiveRouteProgressSnapshot } from './activeRouteProgress';
import { getMapboxToken } from './mapConfig';
import type { ImportedRoute } from './routeStore';
import type { ActiveVehicleContext } from './vehicle/activeVehicleTypes';
import {
  buildTerrainRiskCommandRoute,
  type TerrainRiskRoute,
  type TerrainRiskRouteContext,
} from './terrainRiskCommandProfile';
import {
  buildTerrainRiskDashboardPresentation,
  type TerrainRiskDashboardPresentation,
  type TerrainRiskMissingDataReason,
  type TerrainRiskProfileSource,
} from './terrainRiskDashboardPresentation';
import {
  classifyTerrainRiskProfileSource,
  countFiniteTerrainElevationSamples,
  isTerrainRiskProfileRouteForProgress,
  resolveTerrainRiskProfileObservedAt,
} from './terrainRiskDashboardSource';
import {
  invalidateTerrainElevationSamplingCache,
  routeNeedsTerrainElevationSampling,
  sampleRouteElevationFromMapboxTerrainContours,
  terrainElevationRouteSignature,
  type TerrainElevationSampledRoutePoint,
} from './terrainElevationSampling';
import {
  beginECSAsyncSurfaceRequest,
  cancelECSAsyncSurfaceRequest,
  createECSAsyncSurfaceState,
  settleECSAsyncSurfaceRequest,
  type ECSAsyncSurfaceState,
  type SettleRequestOptions,
} from './state/asyncSurfaceState';
import {
  buildTerrainIntelligenceSnapshot,
  type TerrainIntelligenceSnapshot,
} from './terrainIntelligencePresentation';

export type TerrainRiskGpsElevationFreshness = 'live' | 'recent' | 'stale' | 'unavailable';

export type TerrainRiskDashboardRuntimeInput = {
  routeProgress: ActiveRouteProgressSnapshot | null;
  activeRoute: ImportedRoute | null;
  hasRenderableGeometry: boolean;
  currentGpsElevationFeet: number | null;
  currentGpsElevationFreshness: TerrainRiskGpsElevationFreshness;
  activeVehicleContext?: ActiveVehicleContext | null;
  profileDensity?: 'compact' | 'expanded' | 'all';
};

export type TerrainRiskDashboardRuntime = {
  active: boolean;
  route: TerrainRiskRoute | null;
  presentation: TerrainRiskDashboardPresentation;
  terrainIntelligence: TerrainIntelligenceSnapshot;
  completedDistanceMiles: number | null;
  onRetryElevation: (() => void) | null;
};

/**
 * Authoritative route-progress -> terrain/elevation presentation bridge shared by
 * the Attitude Command panel and the standalone Terrain Risk widget. Provider
 * sampling uses the existing point-level in-flight dedupe/cache and is never
 * performed during render.
 */
export function useTerrainRiskDashboardRuntime({
  routeProgress,
  activeRoute,
  hasRenderableGeometry,
  currentGpsElevationFeet,
  currentGpsElevationFreshness,
  activeVehicleContext,
  profileDensity = 'all',
}: TerrainRiskDashboardRuntimeInput): TerrainRiskDashboardRuntime {
  const hasActiveRoute = Boolean(routeProgress?.isActive);
  const hasLiveGuidance = Boolean(hasActiveRoute && hasRenderableGeometry);
  const profileRoute =
    activeRoute &&
    routeProgress &&
    isTerrainRiskProfileRouteForProgress(activeRoute, routeProgress.activeRouteId)
      ? activeRoute
      : null;
  const rawRoutePoints = useMemo(
    () => (routeProgress?.routePoints ?? []).map((point) => ({
      lat: point.lat,
      lng: point.lng,
      ele: point.ele ?? point.ele_m ?? null,
      ele_m: point.ele_m ?? point.ele ?? null,
      elevationFeet: point.elevationFeet ?? null,
    })),
    [routeProgress?.routePoints],
  );
  const [sampledRoutePoints, setSampledRoutePoints] = useState<TerrainElevationSampledRoutePoint[] | null>(null);
  const [sampledRouteSignature, setSampledRouteSignature] = useState<string | null>(null);
  const [samplingRetryGeneration, setSamplingRetryGeneration] = useState(0);
  const [samplingState, setSamplingState] = useState<ECSAsyncSurfaceState<TerrainElevationSampledRoutePoint[]>>(
    () => createECSAsyncSurfaceState({
      surfaceId: 'dashboard_terrain_elevation_profile',
      provider: 'mapbox_terrain_contours',
    }),
  );
  const samplingStateRef = useRef(samplingState);
  const unmountingRef = useRef(false);
  const commitSamplingState = useCallback((next: ECSAsyncSurfaceState<TerrainElevationSampledRoutePoint[]>) => {
    samplingStateRef.current = next;
    if (!unmountingRef.current) setSamplingState(next);
  }, []);

  useEffect(() => {
    samplingStateRef.current = samplingState;
  }, [samplingState]);

  useEffect(() => {
    unmountingRef.current = false;
    return () => {
      unmountingRef.current = true;
    };
  }, []);

  const samplingSignature = useMemo(
    () => terrainElevationRouteSignature(routeProgress?.activeRouteId ?? profileRoute?.id ?? null, rawRoutePoints),
    [profileRoute?.id, rawRoutePoints, routeProgress?.activeRouteId],
  );
  const sampleSourcePointsRef = useRef(rawRoutePoints);
  const storedSegmentElevationCount = useMemo(
    () => (profileRoute?.segments ?? []).reduce((count, segment) => (
      count + (segment.points ?? []).reduce((segmentCount, point) => {
        const elevationValue = point.ele;
        return segmentCount + (typeof elevationValue === 'number' && Number.isFinite(elevationValue) ? 1 : 0);
      }, 0)
    ), 0),
    [profileRoute?.segments],
  );
  const needsElevationSampling = storedSegmentElevationCount < 2 && routeNeedsTerrainElevationSampling(
    hasLiveGuidance,
    rawRoutePoints,
  );
  const samplingNeededRef = useRef(needsElevationSampling);
  samplingNeededRef.current = needsElevationSampling;

  useEffect(() => {
    sampleSourcePointsRef.current = rawRoutePoints;
  }, [rawRoutePoints, samplingSignature]);

  useEffect(() => {
    if (!needsElevationSampling) {
      setSampledRoutePoints(null);
      setSampledRouteSignature(null);
      return;
    }

    const abortController = new AbortController();
    const requestSignature = samplingSignature;
    const routePointsForSampling = sampleSourcePointsRef.current;
    let timedOut = false;
    const started = beginECSAsyncSurfaceRequest(samplingStateRef.current, {
      fingerprintInput: {
        routeSignature: requestSignature,
        retryGeneration: samplingRetryGeneration,
      },
      provider: 'mapbox_terrain_contours',
      preserveData: false,
      preserveLastGood: true,
    });
    const requestIdentity = {
      requestId: started.requestId,
      generation: started.generation,
      requestFingerprint: started.requestFingerprint,
    };
    commitSamplingState(started);

    const settleRequest = (options: SettleRequestOptions<TerrainElevationSampledRoutePoint[]>) => {
      const transition = settleECSAsyncSurfaceRequest(samplingStateRef.current, options);
      if (transition.applied) commitSamplingState(transition.state);
    };
    const settleTimedOutRequest = () => settleRequest({
      ...requestIdentity,
      status: 'error',
      source: 'unavailable',
      freshness: 'unavailable',
      safeErrorCode: 'TERRAIN_ELEVATION_TIMEOUT',
      retryEligible: true,
      providerStatus: 'active',
      cancellationReason: 'timeout',
      resultCount: 0,
    });
    const timeoutId = setTimeout(() => {
      timedOut = true;
      abortController.abort();
      settleTimedOutRequest();
    }, 12_000);

    void (async () => {
      try {
        const token = await getMapboxToken();
        if (!token || abortController.signal.aborted) {
          if (!abortController.signal.aborted) {
            settleRequest({
              ...requestIdentity,
              status: 'error',
              source: 'unavailable',
              freshness: 'unavailable',
              safeErrorCode: 'TERRAIN_PROVIDER_UNAVAILABLE',
              retryEligible: true,
              providerStatus: 'unavailable',
              resultCount: 0,
            });
          }
          return;
        }
        const sampledPoints = await sampleRouteElevationFromMapboxTerrainContours({
          routePoints: routePointsForSampling,
          accessToken: token,
          signal: abortController.signal,
        });
        if (!abortController.signal.aborted && !unmountingRef.current) {
          const sampledElevationCount = countFiniteTerrainElevationSamples(sampledPoints);
          if (sampledPoints && sampledElevationCount >= 2) {
            setSampledRoutePoints(sampledPoints);
            setSampledRouteSignature(requestSignature);
            settleRequest({
              ...requestIdentity,
              status: 'ready',
              source: 'estimated',
              freshness: 'recent',
              data: sampledPoints,
              lastGoodData: sampledPoints,
              retryEligible: false,
              providerStatus: 'active',
              resultCount: sampledElevationCount,
            });
          } else {
            settleRequest({
              ...requestIdentity,
              status: 'error',
              source: 'unavailable',
              freshness: 'unavailable',
              safeErrorCode: 'TERRAIN_ELEVATION_EMPTY',
              retryEligible: true,
              providerStatus: 'active',
              resultCount: sampledElevationCount,
            });
          }
        }
      } catch {
        if (timedOut) {
          settleTimedOutRequest();
        } else if (!abortController.signal.aborted) {
          settleRequest({
            ...requestIdentity,
            status: 'error',
            source: 'unavailable',
            freshness: 'unavailable',
            safeErrorCode: 'TERRAIN_ELEVATION_PROVIDER_ERROR',
            retryEligible: true,
            providerStatus: 'active',
            resultCount: 0,
          });
        }
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
      const transition = cancelECSAsyncSurfaceRequest(samplingStateRef.current, {
        ...requestIdentity,
        reason: unmountingRef.current
          ? 'unmount'
          : samplingNeededRef.current
            ? 'superseded'
            : 'consumer_cancelled',
      });
      if (transition.applied) commitSamplingState(transition.state);
    };
  }, [
    commitSamplingState,
    needsElevationSampling,
    samplingRetryGeneration,
    samplingSignature,
  ]);

  const sampledElevationReady = Boolean(
    sampledRoutePoints && sampledRouteSignature === samplingSignature,
  );
  const samplingPending =
    needsElevationSampling &&
    !sampledElevationReady &&
    samplingState.status === 'loading';
  const stableRoutePointsRef = useRef<{
    key: string;
    points: NonNullable<TerrainRiskRouteContext['routePoints']>;
  } | null>(null);
  const routePoints = useMemo(() => {
    const sampled = sampledRoutePoints && sampledRouteSignature === samplingSignature
      ? sampledRoutePoints
      : null;
    const key = `${samplingSignature}:${sampled ? 'sampled' : 'raw'}`;
    if (stableRoutePointsRef.current?.key === key) return stableRoutePointsRef.current.points;
    const points = sampled ?? rawRoutePoints;
    stableRoutePointsRef.current = { key, points };
    return points;
  }, [rawRoutePoints, sampledRoutePoints, sampledRouteSignature, samplingSignature]);
  const routePointElevationCount = useMemo(
    () => countFiniteTerrainElevationSamples(routePoints),
    [routePoints],
  );
  const routePointsHaveElevation = routePointElevationCount >= 2;
  const routeContext = useMemo<TerrainRiskRouteContext>(() => ({
    active: hasLiveGuidance,
    routeId: routeProgress?.activeRouteId ?? profileRoute?.id ?? null,
    routeName: routeProgress?.routeLabel ?? profileRoute?.name ?? null,
    totalDistanceMiles: routeProgress?.totalDistance ?? profileRoute?.total_distance_miles ?? null,
    completedDistanceMiles: 0,
    sourceLabel: sampledElevationReady
      ? 'Mapbox terrain contour estimate'
      : profileRoute
        ? `${profileRoute.source_format.toUpperCase()} route elevation samples`
        : routePointsHaveElevation
          ? 'Canonical guidance route elevation samples'
          : samplingPending
            ? 'Terrain elevation sampling pending'
            : 'Active guidance route without elevation samples',
    routeSegments: profileRoute?.segments ?? null,
    routePoints,
    currentElevationFeet: null,
  }), [
    hasLiveGuidance,
    profileRoute,
    routePoints,
    routePointsHaveElevation,
    routeProgress?.activeRouteId,
    routeProgress?.routeLabel,
    routeProgress?.totalDistance,
    sampledElevationReady,
    samplingPending,
  ]);
  const route = useMemo(() => buildTerrainRiskCommandRoute(routeContext), [routeContext]);
  const profileSource = useMemo<TerrainRiskProfileSource>(() => {
    if (route) {
      const sampled = sampledElevationReady;
      const manual = profileRoute?.source_format === 'custom';
      const imported = Boolean(profileRoute) || routeProgress?.source === 'imported-route';
      return classifyTerrainRiskProfileSource({
        label: sampled
          ? 'Mapbox terrain contour elevation estimate'
          : manual
            ? 'Manual route elevation samples'
            : imported
              ? `Imported ${(profileRoute?.source_format ?? 'route').toUpperCase()} elevation samples`
              : 'Canonical guidance route elevation samples',
        origin: sampled ? 'estimated' : manual ? 'manual' : imported ? 'cached' : 'live',
        confidence: route.elevationCoverage === 'complete' ? 'medium' : 'low',
        coverage: route.elevationCoverage,
        observedAt: resolveTerrainRiskProfileObservedAt({
          sampledCompletedAt: sampled ? samplingState.completedAt : null,
          routeSourceFormat: profileRoute?.source_format ?? null,
          routeCapturedAt: profileRoute?.lifecycle?.routeProvenance?.geometry.capturedAt ?? null,
          routeCreatedAt: profileRoute?.created_at ?? null,
          routeUpdatedAt: profileRoute?.updated_at ?? null,
          guidanceUpdatedAt: routeProgress?.updatedAt ?? null,
        }),
        provider: sampled
          ? 'Mapbox Terrain'
          : profileRoute?.source_app ?? routeProgress?.sourceDetail ?? null,
      });
    }
    return {
      label: samplingPending
        ? 'Mapbox terrain contour elevation request in progress'
        : samplingState.safeErrorCode === 'TERRAIN_PROVIDER_UNAVAILABLE'
          ? 'Elevation provider unavailable'
          : 'Elevation profile unavailable',
      origin: 'unavailable',
      freshness: 'unavailable',
      confidence: 'unknown',
      coverage: 'unknown',
      observedAt: null,
      provider: 'Mapbox Terrain',
    };
  }, [
    profileRoute,
    route,
    routeProgress?.source,
    routeProgress?.sourceDetail,
    routeProgress?.updatedAt,
    sampledElevationReady,
    samplingPending,
    samplingState.completedAt,
    samplingState.safeErrorCode,
  ]);
  const missingDataReason: TerrainRiskMissingDataReason | null = !hasActiveRoute
    ? 'no_active_route'
    : !hasRenderableGeometry
      ? 'route_geometry_unavailable'
      : samplingPending
        ? 'elevation_profile_loading'
        : samplingState.safeErrorCode === 'TERRAIN_PROVIDER_UNAVAILABLE'
          ? 'provider_unavailable'
          : samplingState.status === 'error'
            ? 'provider_error'
            : samplingState.status === 'cancelled'
              ? 'request_cancelled'
              : routePointElevationCount > 0
                ? 'insufficient_elevation_samples'
                : 'elevation_samples_unavailable';
  const completedDistanceMiles = routeProgress?.completedMiles ?? (
    route && typeof routeProgress?.progressPercent === 'number'
      ? route.totalDistanceMiles * Math.max(0, Math.min(100, routeProgress.progressPercent)) / 100
      : 0
  );
  const presentation = useMemo(
    () => buildTerrainRiskDashboardPresentation({
      active: hasActiveRoute,
      routeIdentity: {
        id: routeProgress?.activeRouteId ?? profileRoute?.id ?? null,
        name: routeProgress?.routeLabel ?? profileRoute?.name ?? null,
        fingerprint: samplingSignature,
      },
      route,
      completedDistanceMiles,
      currentGpsElevation: {
        elevationFeet: currentGpsElevationFeet,
        freshness: currentGpsElevationFreshness,
      },
      source: profileSource,
      requestStatus: needsElevationSampling ? samplingState.status : 'empty',
      missingDataReason,
    }),
    [
      completedDistanceMiles,
      currentGpsElevationFeet,
      currentGpsElevationFreshness,
      hasActiveRoute,
      missingDataReason,
      needsElevationSampling,
      profileRoute?.id,
      profileRoute?.name,
      profileSource,
      route,
      routeProgress?.activeRouteId,
      routeProgress?.routeLabel,
      samplingSignature,
      samplingState.status,
    ],
  );
  const terrainIntelligence = useMemo(
    () => buildTerrainIntelligenceSnapshot({
      presentation,
      route,
      activeVehicleContext,
      profileDensity,
    }),
    [activeVehicleContext?.profileSignature, presentation, profileDensity, route],
  );
  const handleElevationRetry = useCallback(() => {
    invalidateTerrainElevationSamplingCache();
    setSamplingRetryGeneration((current) => current + 1);
  }, []);

  return {
    active: hasActiveRoute,
    route,
    presentation,
    terrainIntelligence,
    completedDistanceMiles,
    onRetryElevation: needsElevationSampling && samplingState.retryEligible
      ? handleElevationRetry
      : null,
  };
}
