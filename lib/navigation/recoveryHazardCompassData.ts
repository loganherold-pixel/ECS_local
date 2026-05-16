import {
  calculateBearingDegrees,
  calculateDistanceMiles,
  degreesToCardinalDirection,
  isValidCoordinate,
  normalizeCoordinate,
  normalizeDegrees,
  type NavigationCoordinate,
} from './bearingUtils';

export type RecoveryHazardCompassState = 'live' | 'estimated' | 'partial' | 'offline' | 'setupNeeded';
export type RecoveryHazardCompassHeadingSource =
  | 'sensor'
  | 'gpsCourse'
  | 'estimated'
  | 'unavailable';
export type RecoveryHazardTargetType = 'savedPin' | 'waypoint' | 'routeStart' | 'vehicle' | 'manual';
export type RecoveryHazardSeverity = 'low' | 'medium' | 'high';
export type RecoveryHazardDriftLevel = 'nominal' | 'watch' | 'caution' | 'critical';
export type RecoveryHazardCommsConfidence = 'good' | 'limited' | 'poor' | 'offline' | 'unknown';
export type RecoveryDifficulty = 'low' | 'moderate' | 'high' | 'unknown';

export type RecoveryHazardCompassTarget = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  type: RecoveryHazardTargetType | 'route' | 'hazard' | string;
};

export interface RecoveryHazardCompassData {
  headingDegrees: number | null;
  currentHeadingDegrees: number | null;
  headingSource: RecoveryHazardCompassHeadingSource;
  cardinalDirection: string;
  currentLocation: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
  } | null;
  currentCoordinates: {
    latitude: number;
    longitude: number;
  } | null;
  locationAccuracyMeters: number | null;
  speedMph: number | null;
  hasActiveRoute: boolean;
  recoveryTarget: RecoveryHazardCompassTarget | null;
  nearestHazard: (RecoveryHazardCompassTarget & {
    severity?: RecoveryHazardSeverity;
  }) | null;
  activeRoute: {
    id: string;
    label?: string;
    isActive: boolean;
    nextWaypoint?: {
      latitude: number;
      longitude: number;
      label?: string;
    } | null;
    routeStart?: {
      latitude: number;
      longitude: number;
      label?: string;
    } | null;
  } | null;
  savedPins: Array<{
    id: string;
    label: string;
    latitude: number;
    longitude: number;
    type?: string;
  }>;
  nearestRoutePoint: RecoveryHazardCompassTarget | null;
  bearingToRoute: number | null;
  distanceToRouteMiles: number | null;
  bearingToStart: number | null;
  distanceToStartMiles: number | null;
  bearingToNearestWaypoint: number | null;
  distanceToNearestWaypointMiles: number | null;
  nearestWaypointName: string | null;
  bearingToNearestSavedPin: number | null;
  distanceToNearestSavedPinMiles: number | null;
  nearestSavedPinName: string | null;
  hazardBearingDegrees: number | null;
  hazardLabel: string | null;
  safeCorridorBearingDegrees: number | null;
  routeDriftLevel: RecoveryHazardDriftLevel;
  commsConfidence: RecoveryHazardCommsConfidence;
  recoveryDifficulty: RecoveryDifficulty;
  recommendedAction: string;
  confidenceLabel: string;
  missingInputs: string[];
  isOffline: boolean;
  isUsingCachedData: boolean;
  lastUpdatedAt: Date | null;
  state: RecoveryHazardCompassState;
  dataState: RecoveryHazardCompassState;
}

export interface RecoveryHazardCompassPointInput {
  id?: string | null;
  label?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
  lon?: number | null;
  type?: string | null;
  severity?: RecoveryHazardSeverity | 'med' | null;
  accuracyMeters?: number | null;
  accuracyM?: number | null;
}

export interface RecoveryHazardCompassRouteInput {
  id: string;
  label?: string | null;
  isActive: boolean;
  nextWaypoint?: RecoveryHazardCompassPointInput | null;
  routeStart?: RecoveryHazardCompassPointInput | null;
  routePoints?: RecoveryHazardCompassPointInput[] | null;
  updatedAt?: string | number | Date | null;
}

export interface RecoveryHazardCompassSourceSnapshot {
  liveCompassHeadingDegrees?: number | null;
  gpsCourseDegrees?: number | null;
  gpsSpeedMph?: number | null;
  estimatedRouteBearingDegrees?: number | null;
  lastKnownHeadingDegrees?: number | null;
  currentLocation?: RecoveryHazardCompassPointInput | null;
  explicitRecoveryTarget?: RecoveryHazardCompassPointInput | null;
  activeRoute?: RecoveryHazardCompassRouteInput | null;
  savedPins?: RecoveryHazardCompassPointInput[] | null;
  activeRouteHazards?: RecoveryHazardCompassPointInput[] | null;
  hazardPins?: RecoveryHazardCompassPointInput[] | null;
  offlineCachedHazards?: RecoveryHazardCompassPointInput[] | null;
  isOffline?: boolean | null;
  isUsingCachedData?: boolean | null;
  sourceUpdatedAt?: string | number | Date | null;
}

type NormalizedPoint = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  type?: string;
  severity?: RecoveryHazardSeverity;
  accuracyMeters?: number | null;
};

const GPS_MOVING_THRESHOLD_MPH = 2;
const PRIORITY_TARGET_PIN_TYPES = new Set(['vehicle', 'camp', 'recovery', 'base']);

function parseDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function latestDate(...values: Array<string | number | Date | null | undefined>): Date | null {
  let latest: Date | null = null;
  for (const value of values) {
    const date = parseDate(value);
    if (!date) continue;
    if (!latest || date.getTime() > latest.getTime()) latest = date;
  }
  return latest;
}

function normalizeSpeed(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function normalizeSeverity(value: RecoveryHazardCompassPointInput['severity']): RecoveryHazardSeverity | undefined {
  if (value === 'med') return 'medium';
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return undefined;
}

function normalizePoint(
  point: RecoveryHazardCompassPointInput | null | undefined,
  fallbackId: string,
  fallbackLabel: string,
): NormalizedPoint | null {
  const coordinate = normalizeCoordinate(point);
  if (!coordinate) return null;
  const rawId = typeof point?.id === 'string' ? point.id.trim() : '';
  const rawLabel = typeof point?.label === 'string' ? point.label.trim() : '';
  const rawType = typeof point?.type === 'string' ? point.type.trim() : '';
  return {
    id: rawId || fallbackId,
    label: rawLabel || fallbackLabel,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    type: rawType || undefined,
    severity: normalizeSeverity(point?.severity),
    accuracyMeters:
      Number.isFinite(Number(point?.accuracyMeters ?? point?.accuracyM))
        ? Number(point?.accuracyMeters ?? point?.accuracyM)
        : null,
  };
}

function toTarget(point: NormalizedPoint, typeOverride?: RecoveryHazardCompassTarget['type']): RecoveryHazardCompassTarget {
  return {
    id: point.id,
    label: point.label,
    latitude: point.latitude,
    longitude: point.longitude,
    type: typeOverride ?? point.type ?? 'waypoint',
  };
}

function getDistanceFromLocation(point: NormalizedPoint, currentLocation: NavigationCoordinate | null): number {
  const distance = calculateDistanceMiles(currentLocation, point);
  return distance == null ? Number.POSITIVE_INFINITY : distance;
}

function sortByNearest(points: NormalizedPoint[], currentLocation: NavigationCoordinate | null): NormalizedPoint[] {
  if (!currentLocation) return points;
  return [...points].sort(
    (a, b) => getDistanceFromLocation(a, currentLocation) - getDistanceFromLocation(b, currentLocation),
  );
}

function normalizeRoutePoints(route: RecoveryHazardCompassRouteInput | null | undefined): NormalizedPoint[] {
  return (route?.routePoints ?? [])
    .map((point, index) => normalizePoint(point, `${route?.id ?? 'route'}-point-${index}`, `Route point ${index + 1}`))
    .filter((point): point is NormalizedPoint => !!point);
}

function resolveNearestRoutePoint(
  routePoints: NormalizedPoint[],
  currentLocation: NavigationCoordinate | null,
): RecoveryHazardCompassTarget | null {
  const nearest = sortByNearest(routePoints, currentLocation)[0] ?? null;
  return nearest ? toTarget(nearest, 'route') : null;
}

function resolveHeading(snapshot: RecoveryHazardCompassSourceSnapshot): {
  headingDegrees: number | null;
  headingSource: RecoveryHazardCompassHeadingSource;
} {
  const liveCompassHeading = normalizeDegrees(snapshot.liveCompassHeadingDegrees);
  if (liveCompassHeading != null) {
    return { headingDegrees: liveCompassHeading, headingSource: 'sensor' };
  }

  const gpsSpeed = Number(snapshot.gpsSpeedMph);
  const gpsCourse = normalizeDegrees(snapshot.gpsCourseDegrees);
  if (gpsCourse != null && Number.isFinite(gpsSpeed) && gpsSpeed >= GPS_MOVING_THRESHOLD_MPH) {
    return { headingDegrees: gpsCourse, headingSource: 'gpsCourse' };
  }

  const routeBearing = normalizeDegrees(snapshot.estimatedRouteBearingDegrees);
  if (routeBearing != null) {
    return { headingDegrees: routeBearing, headingSource: 'estimated' };
  }

  const lastKnownHeading = normalizeDegrees(snapshot.lastKnownHeadingDegrees);
  if (lastKnownHeading != null) {
    return { headingDegrees: lastKnownHeading, headingSource: 'estimated' };
  }

  return { headingDegrees: null, headingSource: 'unavailable' };
}

function resolveRecoveryTarget(params: {
  snapshot: RecoveryHazardCompassSourceSnapshot;
  currentLocation: NavigationCoordinate | null;
  nearestRoutePoint: RecoveryHazardCompassTarget | null;
  nearestWaypoint: NormalizedPoint | null;
  nearestSavedPin: NormalizedPoint | null;
  routeStart: NormalizedPoint | null;
}): RecoveryHazardCompassData['recoveryTarget'] {
  const explicit = normalizePoint(params.snapshot.explicitRecoveryTarget, 'manual-recovery-target', 'Recovery target');
  if (explicit) {
    return toTarget(
      explicit,
      explicit.type === 'vehicle' ? 'vehicle' : explicit.type === 'waypoint' ? 'waypoint' : 'manual',
    );
  }

  if (params.nearestRoutePoint) return params.nearestRoutePoint;
  if (params.nearestWaypoint) return toTarget(params.nearestWaypoint, 'waypoint');

  const savedPins = (params.snapshot.savedPins ?? [])
    .map((pin, index) => normalizePoint(pin, `saved-pin-${index}`, 'Saved pin'))
    .filter((pin): pin is NormalizedPoint => !!pin);
  const priorityPins = savedPins.filter((pin) => pin.type && PRIORITY_TARGET_PIN_TYPES.has(pin.type));
  const nearestPriorityPin = sortByNearest(priorityPins, params.currentLocation)[0] ?? null;
  if (nearestPriorityPin) {
    return toTarget(nearestPriorityPin, nearestPriorityPin.type === 'vehicle' ? 'vehicle' : 'savedPin');
  }

  if (params.routeStart) return toTarget(params.routeStart, 'routeStart');
  if (params.nearestSavedPin) return toTarget(params.nearestSavedPin, 'savedPin');
  return null;
}

function resolveNearestHazard(
  snapshot: RecoveryHazardCompassSourceSnapshot,
  currentLocation: NavigationCoordinate | null,
): RecoveryHazardCompassData['nearestHazard'] {
  const hazards = [
    ...(snapshot.activeRouteHazards ?? []),
    ...(snapshot.hazardPins ?? []),
    ...(snapshot.offlineCachedHazards ?? []),
  ]
    .map((hazard, index) => normalizePoint(hazard, `hazard-${index}`, 'Hazard'))
    .filter((hazard): hazard is NormalizedPoint => !!hazard);

  const nearest = sortByNearest(hazards, currentLocation)[0] ?? null;
  if (!nearest) return null;
  return {
    ...toTarget(nearest, 'hazard'),
    severity: nearest.severity,
  };
}

function resolveRouteDriftLevel(distanceToRouteMiles: number | null): RecoveryHazardDriftLevel {
  if (distanceToRouteMiles == null) return 'watch';
  if (distanceToRouteMiles < 0.1) return 'nominal';
  if (distanceToRouteMiles < 0.5) return 'watch';
  if (distanceToRouteMiles < 1.5) return 'caution';
  return 'critical';
}

function resolveCommsConfidence(params: {
  isOffline: boolean;
  isUsingCachedData: boolean;
  currentLocation: RecoveryHazardCompassData['currentLocation'];
}): RecoveryHazardCommsConfidence {
  if (params.isOffline) return 'offline';
  if (!params.currentLocation) return 'unknown';
  if (params.isUsingCachedData) return 'limited';
  const accuracy = params.currentLocation.accuracyMeters;
  if (accuracy != null && accuracy > 100) return 'limited';
  return 'good';
}

function resolveRecoveryDifficulty(params: {
  distanceToRouteMiles: number | null;
  isOffline: boolean;
  hasAnyTarget: boolean;
  locationAccuracyMeters: number | null;
}): RecoveryDifficulty {
  if (!params.hasAnyTarget) return 'unknown';
  if (params.isOffline) return 'high';
  if (params.locationAccuracyMeters != null && params.locationAccuracyMeters > 100) return 'moderate';
  if (params.distanceToRouteMiles == null) return 'unknown';
  if (params.distanceToRouteMiles < 0.1) return 'low';
  if (params.distanceToRouteMiles < 0.5) return 'moderate';
  return 'high';
}

function resolveMissingInputs(params: {
  currentLocation: RecoveryHazardCompassData['currentLocation'];
  headingSource: RecoveryHazardCompassHeadingSource;
  activeRoute: RecoveryHazardCompassData['activeRoute'];
  savedPins: RecoveryHazardCompassData['savedPins'];
  nearestHazard: RecoveryHazardCompassData['nearestHazard'];
}): string[] {
  const missing: string[] = [];
  if (!params.currentLocation) missing.push('Location');
  if (params.headingSource === 'unavailable') missing.push('Heading');
  if (!params.activeRoute) missing.push('Active route');
  if (params.savedPins.length === 0) missing.push('Saved pins');
  if (!params.nearestHazard) missing.push('Hazard data');
  return missing;
}

function resolveState(params: {
  isOffline: boolean;
  isUsingCachedData: boolean;
  currentLocation: RecoveryHazardCompassData['currentLocation'];
  headingSource: RecoveryHazardCompassHeadingSource;
  activeRoute: RecoveryHazardCompassData['activeRoute'];
  savedPins: RecoveryHazardCompassData['savedPins'];
  recoveryTarget: RecoveryHazardCompassData['recoveryTarget'];
}): RecoveryHazardCompassState {
  if (!params.currentLocation && !params.recoveryTarget && !params.activeRoute && params.savedPins.length === 0) {
    return 'setupNeeded';
  }
  if (params.isOffline) return 'offline';
  if (!params.currentLocation) return 'setupNeeded';
  if (!params.activeRoute && params.savedPins.length === 0) return 'setupNeeded';
  if (params.isUsingCachedData) return 'partial';
  if (params.headingSource === 'estimated') return 'estimated';
  if (params.headingSource === 'unavailable' || !params.activeRoute) return 'partial';
  return 'live';
}

function resolveConfidenceLabel(state: RecoveryHazardCompassState, missingInputs: string[]): string {
  if (state === 'live') return 'Live recovery sources';
  if (state === 'estimated') return 'Estimated bearing';
  if (state === 'offline') return 'Last-known data';
  if (state === 'setupNeeded') return 'Setup needed';
  if (missingInputs.length === 0) return 'Partial source mix';
  return `Missing ${missingInputs.slice(0, 2).join(', ')}`;
}

function resolveRecommendedAction(params: {
  state: RecoveryHazardCompassState;
  routeDriftLevel: RecoveryHazardDriftLevel;
  recoveryDifficulty: RecoveryDifficulty;
  hasActiveRoute: boolean;
  hasWaypointOrPin: boolean;
  nearestHazard: RecoveryHazardCompassData['nearestHazard'];
}): string {
  if (params.state === 'setupNeeded') return 'ENABLE LOCATION OR SELECT WAYPOINT';
  if (params.state === 'offline') return 'OFFLINE - USING LAST KNOWN POSITION';
  if (params.nearestHazard?.severity === 'high') return 'HAZARD NEARBY - VERIFY ROUTE';
  if (!params.hasActiveRoute && !params.hasWaypointOrPin) return 'ROUTE UNKNOWN - SELECT WAYPOINT';
  if (!params.hasActiveRoute) return 'CONTINUE TO WAYPOINT';
  if (params.routeDriftLevel === 'critical' || params.recoveryDifficulty === 'high') return 'RETURN TO ROUTE';
  if (params.routeDriftLevel === 'caution') return 'ROUTE DRIFT ELEVATED';
  if (params.routeDriftLevel === 'watch') return 'VERIFY ROUTE CORRIDOR';
  return 'LOW RECOVERY RISK';
}

export function normalizeRecoveryHazardCompassData(
  snapshot: RecoveryHazardCompassSourceSnapshot = {},
): RecoveryHazardCompassData {
  const currentPoint = normalizePoint(snapshot.currentLocation, 'current-location', 'Current location');
  const currentLocation = currentPoint
    ? {
        latitude: currentPoint.latitude,
        longitude: currentPoint.longitude,
        accuracyMeters: currentPoint.accuracyMeters ?? null,
      }
    : null;
  const currentCoordinate = currentLocation
    ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude }
    : null;
  const routePoints = normalizeRoutePoints(snapshot.activeRoute);
  const nearestRoutePoint = resolveNearestRoutePoint(routePoints, currentCoordinate);
  const activeRouteNext = normalizePoint(snapshot.activeRoute?.nextWaypoint, 'route-next-waypoint', 'Next waypoint');
  const routeStart = normalizePoint(snapshot.activeRoute?.routeStart, 'route-start', 'Route start');
  const nearestSavedPin =
    sortByNearest(
      (snapshot.savedPins ?? [])
        .map((pin, index) => normalizePoint(pin, `saved-pin-${index}`, 'Saved pin'))
        .filter((pin): pin is NormalizedPoint => !!pin),
      currentCoordinate,
    )[0] ?? null;
  const routeBearing = calculateBearingDegrees(currentCoordinate, nearestRoutePoint ?? activeRouteNext);
  const heading = resolveHeading({
    ...snapshot,
    estimatedRouteBearingDegrees: snapshot.estimatedRouteBearingDegrees ?? routeBearing,
  });
  const savedPins = (snapshot.savedPins ?? [])
    .map((pin, index) => normalizePoint(pin, `saved-pin-${index}`, 'Saved pin'))
    .filter((pin): pin is NormalizedPoint => !!pin)
    .map((pin) => ({
      id: pin.id,
      label: pin.label,
      latitude: pin.latitude,
      longitude: pin.longitude,
      type: pin.type,
    }));
  const activeRoute =
    snapshot.activeRoute && typeof snapshot.activeRoute.id === 'string' && snapshot.activeRoute.id.trim()
      ? {
          id: snapshot.activeRoute.id,
          label: snapshot.activeRoute.label?.trim() || undefined,
          isActive: Boolean(snapshot.activeRoute.isActive),
          nextWaypoint: activeRouteNext
            ? {
                latitude: activeRouteNext.latitude,
                longitude: activeRouteNext.longitude,
                label: activeRouteNext.label,
              }
            : null,
          routeStart: routeStart
            ? {
                latitude: routeStart.latitude,
                longitude: routeStart.longitude,
                label: routeStart.label,
              }
            : null,
        }
      : null;
  const nearestHazard = resolveNearestHazard(snapshot, currentCoordinate);
  const recoveryTarget = resolveRecoveryTarget({
    snapshot,
    currentLocation: currentCoordinate,
    nearestRoutePoint,
    nearestWaypoint: activeRouteNext,
    nearestSavedPin,
    routeStart,
  });
  const isOffline = Boolean(snapshot.isOffline);
  const isUsingCachedData = Boolean(snapshot.isUsingCachedData);
  const distanceToRouteMiles = calculateDistanceMiles(currentCoordinate, nearestRoutePoint);
  const locationAccuracyMeters = currentLocation?.accuracyMeters ?? null;
  const routeDriftLevel = activeRoute ? resolveRouteDriftLevel(distanceToRouteMiles) : 'watch';
  const commsConfidence = resolveCommsConfidence({ isOffline, isUsingCachedData, currentLocation });
  const recoveryDifficulty = resolveRecoveryDifficulty({
    distanceToRouteMiles,
    isOffline,
    hasAnyTarget: Boolean(recoveryTarget),
    locationAccuracyMeters,
  });
  const missingInputs = resolveMissingInputs({
    currentLocation,
    headingSource: heading.headingSource,
    activeRoute,
    savedPins,
    nearestHazard,
  });
  const state = resolveState({
    isOffline,
    isUsingCachedData,
    currentLocation,
    headingSource: heading.headingSource,
    activeRoute,
    savedPins,
    recoveryTarget,
  });
  const hasWaypointOrPin = Boolean(activeRouteNext || nearestSavedPin || recoveryTarget);
  const recommendedAction = resolveRecommendedAction({
    state,
    routeDriftLevel,
    recoveryDifficulty,
    hasActiveRoute: Boolean(activeRoute),
    hasWaypointOrPin,
    nearestHazard,
  });

  return {
    headingDegrees: heading.headingDegrees,
    currentHeadingDegrees: heading.headingDegrees,
    headingSource: heading.headingSource,
    cardinalDirection: degreesToCardinalDirection(heading.headingDegrees),
    currentLocation,
    currentCoordinates: currentCoordinate,
    locationAccuracyMeters,
    speedMph: normalizeSpeed(snapshot.gpsSpeedMph),
    hasActiveRoute: Boolean(activeRoute),
    recoveryTarget,
    nearestHazard,
    activeRoute,
    savedPins,
    nearestRoutePoint,
    bearingToRoute: calculateBearingDegrees(currentCoordinate, nearestRoutePoint),
    distanceToRouteMiles,
    bearingToStart: calculateBearingDegrees(currentCoordinate, routeStart),
    distanceToStartMiles: calculateDistanceMiles(currentCoordinate, routeStart),
    bearingToNearestWaypoint: calculateBearingDegrees(currentCoordinate, activeRouteNext),
    distanceToNearestWaypointMiles: calculateDistanceMiles(currentCoordinate, activeRouteNext),
    nearestWaypointName: activeRouteNext?.label ?? null,
    bearingToNearestSavedPin: calculateBearingDegrees(currentCoordinate, nearestSavedPin),
    distanceToNearestSavedPinMiles: calculateDistanceMiles(currentCoordinate, nearestSavedPin),
    nearestSavedPinName: nearestSavedPin?.label ?? null,
    hazardBearingDegrees: calculateBearingDegrees(currentCoordinate, nearestHazard),
    hazardLabel: nearestHazard?.label ?? null,
    safeCorridorBearingDegrees: calculateBearingDegrees(currentCoordinate, nearestRoutePoint ?? activeRouteNext ?? routeStart),
    routeDriftLevel,
    commsConfidence,
    recoveryDifficulty,
    recommendedAction,
    confidenceLabel: resolveConfidenceLabel(state, missingInputs),
    missingInputs,
    isOffline,
    isUsingCachedData,
    lastUpdatedAt: latestDate(snapshot.sourceUpdatedAt, snapshot.activeRoute?.updatedAt),
    state,
    dataState: state,
  };
}

export function getBearingToRecoveryTarget(data: RecoveryHazardCompassData): number | null {
  if (!data.currentLocation || !data.recoveryTarget) return null;
  if (!isValidCoordinate(data.currentLocation) || !isValidCoordinate(data.recoveryTarget)) return null;
  return calculateBearingDegrees(data.currentLocation, data.recoveryTarget);
}

export function getDistanceToRecoveryTargetMiles(data: RecoveryHazardCompassData): number | null {
  if (!data.currentLocation || !data.recoveryTarget) return null;
  return calculateDistanceMiles(data.currentLocation, data.recoveryTarget);
}
