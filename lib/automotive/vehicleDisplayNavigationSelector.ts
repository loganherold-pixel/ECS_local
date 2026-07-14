import type { NavigateRouteSessionSnapshot } from '../navigateRouteSessionStore';
import type { PersistedRoadNavigationSession } from '../roadNavigationStore';
import {
  buildContinueRouteInstruction,
  buildReadyRouteInstruction,
} from '../routeGuidanceCopy';
import type {
  VehicleDisplayMode,
  VehicleNavigationData,
  VehicleRouteSessionState,
  VehicleWeatherHazardData,
} from '../vehicleDisplayTypes';

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

export interface VehicleNavigationSelectorInput {
  mode: VehicleDisplayMode;
  routeSession: NavigateRouteSessionSnapshot;
  gps: any;
  activeRoute: any | null;
  roadSession: PersistedRoadNavigationSession | null;
  remotenessIndex: any | null;
  weatherData: VehicleWeatherHazardData;
  breadcrumbRecording: boolean;
}

function roundTenths(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function normalizeTimestamp(value: number | string | null | undefined): string | null {
  if (value == null) return null;
  const parsed = typeof value === 'number'
    ? value < 10_000_000_000 ? value * 1000 : value
    : Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function formatEta(etaIso: string | null, minutes: number | null): string | null {
  const parsedEta = etaIso ? Date.parse(etaIso) : NaN;
  const timestamp = Number.isFinite(parsedEta)
    ? parsedEta
    : minutes != null
      ? Date.now() + minutes * 60_000
      : NaN;
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function computeEtaMinutes(distanceMiles: number | null, speedMph: number | null, fallbackMph = 25): number | null {
  if (distanceMiles == null) return null;
  const speed = speedMph != null && speedMph > 3 ? speedMph : fallbackMph;
  return Math.max(0, Math.round((distanceMiles / speed) * 60));
}

function legacyRoutePhase(
  activeRoute: any | null,
  roadSession: PersistedRoadNavigationSession | null,
  hasPosition: boolean,
): VehicleRouteSessionState {
  if (roadSession?.status === 'arrived') return 'completed';
  if (roadSession?.status === 'rerouting' || ((activeRoute || roadSession) && !hasPosition)) {
    return 'alerting_or_degraded';
  }
  if (roadSession?.status === 'navigation_active') return 'route_active';
  if (activeRoute || roadSession) return 'route_selected';
  return 'inactive';
}

function canonicalRoutePhase(
  session: NavigateRouteSessionSnapshot,
  hasPosition: boolean,
): VehicleRouteSessionState {
  if (session.lifecycle === 'arrived') return 'completed';
  if (session.lifecycle === 'active') {
    return session.isRerouting || session.isOffRoute || !hasPosition
      ? 'alerting_or_degraded'
      : 'route_active';
  }
  if (session.lifecycle === 'preview') return 'route_selected';
  return 'inactive';
}

export function selectVehicleDisplayNavigationData(
  input: VehicleNavigationSelectorInput,
): VehicleNavigationData {
  const session = input.routeSession;
  const canonicalRouteAvailable = session.lifecycle !== 'inactive';
  const sessionLocation = session.currentLocation ?? session.gpsSample ?? null;
  const currentLat = sessionLocation?.latitude ?? input.gps?.position?.latitude ?? null;
  const currentLon = sessionLocation?.longitude ?? input.gps?.position?.longitude ?? null;
  const speedMph = sessionLocation?.speedMph ?? input.gps?.position?.speedMph ?? null;
  const headingDeg = session.headingDeg ?? sessionLocation?.headingDeg ?? input.gps?.position?.headingDeg ?? null;
  const hasPosition = currentLat != null && currentLon != null;
  const routePhase = canonicalRouteAvailable
    ? canonicalRoutePhase(session, hasPosition)
    : legacyRoutePhase(input.activeRoute, input.roadSession, hasPosition);
  const routeLoaded = routePhase !== 'inactive';

  const distanceRemainingMiles = routePhase === 'completed'
    ? 0
    : canonicalRouteAvailable && session.remainingDistanceM != null
      ? roundTenths(session.remainingDistanceM / METERS_PER_MILE)
      : null;
  const etaMinutes = routePhase === 'completed'
    ? 0
    : canonicalRouteAvailable && session.remainingDurationS != null
      ? Math.max(0, Math.round(session.remainingDurationS / 60))
      : computeEtaMinutes(distanceRemainingMiles, speedMph);
  const roadDestination = input.roadSession?.destination?.title ?? null;
  const nextManeuver = routePhase === 'completed'
    ? 'Route complete'
    : canonicalRouteAvailable
      ? session.instruction
      : roadDestination && input.roadSession?.status === 'navigation_active'
        ? buildContinueRouteInstruction(roadDestination)
        : roadDestination
          ? buildReadyRouteInstruction(roadDestination)
          : routeLoaded
            ? 'Open Navigate for route guidance'
            : null;

  const nearbyFuelDistance = input.remotenessIndex?.proximity?.nearestFuelStation?.distanceMi;
  const nearbyFuelServices = nearbyFuelDistance != null
    ? [{
        id: 'nearest-fuel',
        name: 'Nearest Fuel',
        type: 'fuel' as const,
        distanceMiles: Math.max(0, roundTenths(nearbyFuelDistance) ?? nearbyFuelDistance),
        bearing: '--',
      }]
    : [];
  const offlineReady = Boolean(
    input.remotenessIndex?.signals?.cacheReady || input.remotenessIndex?.signals?.expeditionDataReady,
  );
  const degraded = routePhase === 'alerting_or_degraded';
  const hazardLabel = degraded
    ? session.isOffRoute
      ? 'Off route'
      : session.isRerouting
        ? 'Rerouting'
        : 'GPS degraded'
    : input.weatherData.hazardState === 'warning' || input.weatherData.hazardState === 'critical'
      ? input.weatherData.alertSummary ?? input.weatherData.routeHazard
      : null;
  const guidanceUpdatedAt = canonicalRouteAvailable
    ? session.updatedAt
    : input.roadSession?.updatedAt ?? null;
  const positionUpdatedAt = normalizeTimestamp(
    sessionLocation?.timestamp ?? input.gps?.lastEmitTs ?? input.gps?.position?.timestamp,
  );
  const offRouteDistanceM = canonicalRouteAvailable
    ? session.offRouteDistanceM
    : input.roadSession?.status === 'rerouting'
      ? 91.44
      : null;

  return {
    mode: input.mode,
    routePhase,
    currentLat,
    currentLon,
    headingDeg,
    speedMph,
    routeLine: canonicalRouteAvailable ? session.routePoints.length > 1 : routeLoaded,
    nextManeuver,
    distanceRemainingMiles,
    etaMinutes,
    nearbyFuelServices,
    breadcrumbTrail: input.breadcrumbRecording,
    importedGpxRoute: input.activeRoute?.source_format === 'gpx',
    offRouteAlert: session.isOffRoute || session.isRerouting || input.roadSession?.status === 'rerouting',
    offRouteDistanceFt: offRouteDistanceM != null ? Math.round(offRouteDistanceM * FEET_PER_METER) : null,
    elevationShading: input.mode === 'expedition_drive',
    offlineMapIndicator: offlineReady,
    offlineMapRegion: offlineReady ? 'OFFLINE READY' : null,
    routeName: canonicalRouteAvailable
      ? session.routeTitle
      : input.activeRoute?.name ?? roadDestination ?? null,
    destinationName: canonicalRouteAvailable ? session.routeSubtitle : roadDestination,
    statusLabel:
      routePhase === 'route_active'
        ? session.statusLabel || 'Route active'
        : routePhase === 'route_selected'
          ? session.statusLabel || 'Route ready'
          : routePhase === 'alerting_or_degraded'
            ? session.statusLabel || 'Guidance degraded'
            : routePhase === 'completed'
              ? 'Route complete'
              : 'No route staged',
    progressPct: routePhase === 'completed'
      ? 100
      : canonicalRouteAvailable && session.progressPercent != null
        ? Math.max(0, Math.min(100, Math.round(session.progressPercent)))
        : null,
    etaLabel: formatEta(canonicalRouteAvailable ? session.etaIso : null, etaMinutes),
    hazardState: degraded ? 'warning' : input.weatherData.hazardState,
    hazardLabel,
    offRouteDetected: session.isOffRoute || input.roadSession?.status === 'rerouting',
    unavailableReason: routeLoaded ? null : hasPosition ? 'Select a route to begin guidance' : 'GPS required',
    guidanceUpdatedAt,
    positionUpdatedAt,
  };
}

