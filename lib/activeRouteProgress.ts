import { useEffect, useMemo, useState } from 'react';

import { routeStore, type ImportedRoute } from './routeStore';
import { waypointProgressStore } from './waypointProgressStore';
import {
  navigateRouteSessionStore,
  type NavigateRouteMapPoint,
  type NavigateRouteSessionSnapshot,
} from './navigateRouteSessionStore';
import {
  getActiveRoadNavigationSession,
  subscribeActiveRoadNavigationSession,
  type RoadNavigationSessionState,
} from './useRoadNavigation';
import {
  getActiveTrailNavigationSession,
  subscribeActiveTrailNavigationSession,
  type TrailNavigationSessionState,
} from './useTrailNavigation';
import { vehicleDisplayStore } from './vehicleDisplayStore';
import type { VehicleNavigationData } from './vehicleDisplayTypes';

const DEFAULT_AVG_MPH = 20;

export type ActiveRouteProgressStatus =
  | 'idle'
  | 'building'
  | 'preview'
  | 'ready'
  | 'navigating'
  | 'paused'
  | 'completed'
  | 'failed';

export type RouteProgressSourceKind = 'none' | 'road-guidance' | 'trail-guidance' | 'imported-route';
export type RouteProgressTone = 'neutral' | 'good' | 'attention' | 'critical' | 'live' | 'unavailable';

export type ActiveRouteProgress = {
  activeRouteId: string | null;
  status: ActiveRouteProgressStatus;
  percentComplete: number;
  milesCompleted: number | null;
  milesRemaining: number | null;
  estimatedArrival: string | null;
  totalDistance: number | null;
  updatedAt: string | null;
};

export type ActiveRouteProgressSnapshot = ActiveRouteProgress & {
  source: RouteProgressSourceKind;
  hasRoute: boolean;
  isActive: boolean;
  isComplete: boolean;
  routeLabel: string;
  destinationLabel: string | null;
  totalMilesText: string;
  remainingMiles: number | null;
  remainingMilesText: string;
  etaText: string;
  completedMiles: number | null;
  completedMilesText: string;
  progressPercent: number;
  remainingDurationText: string;
  etaLabel: string;
  currentLegLabel: string;
  nextInstruction: string | null;
  nextInstructionDistanceM: number | null;
  nextInstructionDistanceText: string;
  lastUpdated: string | null;
  navigationStatus: string;
  warningLine: string;
  confidenceLine: string;
  calculationState: string;
  geometryStatus: string;
  stateLabel: string;
  stateTone: RouteProgressTone;
  footerText: string;
  sourceDetail: string;
  routePoints?: NavigateRouteMapPoint[];
  progressPoints?: NavigateRouteMapPoint[];
  currentLocation?: { latitude: number; longitude: number } | null;
  originLocation?: { latitude: number; longitude: number } | null;
  destinationLocation?: { latitude: number; longitude: number } | null;
};

export type ActiveRouteProgressOptions = {
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  gpsSpeedMph?: number | null;
  gpsHasFix?: boolean | null;
};

function clampProgressPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function haversineMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatMinutesToRuntime(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return '--';
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours <= 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatArrivalClock(hours: number): string {
  const arrival = new Date(Date.now() + Math.max(0, hours) * 60 * 60 * 1000);
  const rawHours = arrival.getHours();
  const minutes = String(arrival.getMinutes()).padStart(2, '0');
  const meridiem = rawHours >= 12 ? 'PM' : 'AM';
  const displayHour = rawHours % 12 || 12;
  return `${displayHour}:${minutes} ${meridiem}`;
}

export function formatRouteProgressMiles(distanceMiles: number | null): string {
  if (distanceMiles == null || !Number.isFinite(distanceMiles)) return '--';
  const normalized = Math.max(0, distanceMiles);
  if (normalized < 10) return `${normalized.toFixed(1)} mi`;
  return `${Math.round(normalized)} mi`;
}

export function formatRouteProgressTurnDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return '--';
  const normalized = Math.max(0, meters);
  const feet = normalized * 3.28084;
  if (feet < 1000) return `${Math.max(0, Math.round(feet / 25) * 25)} ft`;
  const miles = normalized / 1609.344;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

export function formatRouteProgressDuration(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return '--';
  return formatMinutesToRuntime(hours * 60);
}

function calcNavigatePointPathMiles(points: NavigateRouteMapPoint[]): number | null {
  if (!Array.isArray(points) || points.length < 2) return null;
  let totalMiles = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    if (
      !Number.isFinite(current?.lat) ||
      !Number.isFinite(current?.lng) ||
      !Number.isFinite(next?.lat) ||
      !Number.isFinite(next?.lng)
    ) {
      continue;
    }
    totalMiles += haversineMi(current.lat, current.lng, next.lat, next.lng);
  }
  return totalMiles > 0 ? totalMiles : null;
}

function formatRouteEtaIso(etaIso: string | null | undefined): string | null {
  if (!etaIso) return null;
  const eta = new Date(etaIso);
  const timestamp = eta.getTime();
  if (!Number.isFinite(timestamp)) return null;
  const rawHours = eta.getHours();
  const minutes = String(eta.getMinutes()).padStart(2, '0');
  const meridiem = rawHours >= 12 ? 'PM' : 'AM';
  const displayHour = rawHours % 12 || 12;
  return `${displayHour}:${minutes} ${meridiem}`;
}

function getNavigateRouteProgressSource(
  snapshot: NavigateRouteSessionSnapshot,
): RouteProgressSourceKind {
  if (snapshot.source === 'trail' || snapshot.source === 'hybrid') return 'trail-guidance';
  if (snapshot.source === 'road' || snapshot.source === 'run') return 'road-guidance';
  return 'none';
}

export function getNavigateSessionProgressSnapshot(
  navigateSession: NavigateRouteSessionSnapshot,
  gpsSpeedMph?: number | null,
): ActiveRouteProgressSnapshot | null {
  const hasRoute =
    navigateSession.lifecycle !== 'inactive' &&
    (Boolean(navigateSession.routeId) ||
      navigateSession.routePoints.length > 1 ||
      navigateSession.remainingDistanceM != null ||
      navigateSession.progressPercent != null);
  if (!hasRoute) return null;

  const isComplete = navigateSession.lifecycle === 'arrived';
  const isActive = isComplete || navigateSession.lifecycle === 'active';
  const routePathMiles = calcNavigatePointPathMiles(navigateSession.routePoints);
  const progressPathMiles = calcNavigatePointPathMiles(navigateSession.progressPoints);
  const remainingMiles = isComplete
    ? 0
    : navigateSession.remainingDistanceM != null && Number.isFinite(navigateSession.remainingDistanceM)
      ? Math.max(navigateSession.remainingDistanceM / 1609.344, 0)
      : null;
  const rawProgressPercent =
    navigateSession.progressPercent != null && Number.isFinite(navigateSession.progressPercent)
      ? clampProgressPercent(navigateSession.progressPercent)
      : null;
  const inferredTotalMiles =
    rawProgressPercent != null &&
    rawProgressPercent > 0 &&
    rawProgressPercent < 100 &&
    remainingMiles != null
      ? remainingMiles / (1 - rawProgressPercent / 100)
      : null;
  const totalMiles =
    routePathMiles ??
    inferredTotalMiles ??
    (isComplete && progressPathMiles != null ? progressPathMiles : null);
  const progressFromRemaining =
    totalMiles != null && totalMiles > 0 && remainingMiles != null
      ? clampProgressPercent((1 - remainingMiles / totalMiles) * 100)
      : null;
  const progressFromGeometry =
    totalMiles != null && totalMiles > 0 && progressPathMiles != null
      ? clampProgressPercent((progressPathMiles / totalMiles) * 100)
      : null;
  const resolvedProgressPercent =
    isComplete
      ? 100
      : rawProgressPercent != null && rawProgressPercent > 0
        ? rawProgressPercent
        : progressFromRemaining != null && progressFromRemaining > 0
          ? progressFromRemaining
          : progressFromGeometry != null && progressFromGeometry > 0
            ? progressFromGeometry
            : rawProgressPercent ?? progressFromRemaining ?? progressFromGeometry ?? 0;
  const completedMiles =
    totalMiles != null && remainingMiles != null
      ? Math.max(totalMiles - remainingMiles, 0)
      : progressPathMiles != null && resolvedProgressPercent > 0
        ? progressPathMiles
        : totalMiles != null && resolvedProgressPercent > 0
          ? Math.max((totalMiles * resolvedProgressPercent) / 100, 0)
          : isComplete
            ? totalMiles ?? progressPathMiles ?? 0
            : null;
  const cruisingSpeed = gpsSpeedMph != null && gpsSpeedMph > 3 ? gpsSpeedMph : DEFAULT_AVG_MPH;
  const remainingHours = isComplete
    ? 0
    : navigateSession.remainingDurationS != null && Number.isFinite(navigateSession.remainingDurationS)
      ? Math.max(navigateSession.remainingDurationS / 3600, 0)
      : remainingMiles != null && remainingMiles > 0
        ? remainingMiles / cruisingSpeed
        : null;
  const etaLabel =
    isComplete
      ? 'Arrived'
      : formatRouteEtaIso(navigateSession.etaIso) ??
        (remainingHours != null ? formatArrivalClock(remainingHours) : '--');
  const statusLabel =
    navigateSession.statusLabel?.trim() ||
    (isComplete ? 'Arrived' : isActive ? 'Route active' : 'Route staged');
  const currentLegLabel =
    navigateSession.instruction?.trim() ||
    navigateSession.routeSubtitle?.trim() ||
    (isActive ? 'Active route leg' : 'Route leg unavailable');
  const geometryStatus =
    navigateSession.routePoints.length > 1
      ? `${navigateSession.routePoints.length} Navigate map route points${
          navigateSession.progressPoints.length > 1
            ? ` | ${navigateSession.progressPoints.length} progress points`
            : ''
        }`
      : 'Route geometry unavailable';
  const routeOrigin = navigateSession.routePoints[0] ?? null;
  const routeDestination = navigateSession.routePoints[navigateSession.routePoints.length - 1] ?? null;

  return withContractFields({
    source: getNavigateRouteProgressSource(navigateSession),
    routeId: navigateSession.routeId ?? navigateSession.sessionId ?? null,
    hasRoute: true,
    isActive,
    isComplete,
    status: isComplete ? 'completed' : isActive ? 'navigating' : 'ready',
    routeLabel: navigateSession.routeTitle?.trim() || 'Active route',
    destinationLabel: navigateSession.routeTitle?.trim() || null,
    totalDistance: totalMiles,
    totalMilesText: formatRouteProgressMiles(totalMiles),
    remainingMiles,
    remainingMilesText: formatRouteProgressMiles(remainingMiles),
    etaText: etaLabel,
    completedMiles,
    completedMilesText: formatRouteProgressMiles(completedMiles),
    progressPercent: resolvedProgressPercent,
    remainingDurationText: isComplete ? 'Arrived' : formatRouteProgressDuration(remainingHours),
    etaLabel,
    currentLegLabel,
    nextInstruction: isComplete ? null : navigateSession.instruction?.trim() || null,
    nextInstructionDistanceM: isComplete ? null : navigateSession.nextInstructionDistanceM,
    nextInstructionDistanceText: isComplete
      ? '--'
      : formatRouteProgressTurnDistance(navigateSession.nextInstructionDistanceM),
    lastUpdated: navigateSession.updatedAt,
    navigationStatus: statusLabel,
    warningLine:
      navigateSession.isOffRoute
        ? `Off route${
            navigateSession.offRouteDistanceM != null
              ? ` by ${Math.round(navigateSession.offRouteDistanceM * 3.28084)} ft`
              : ''
          }`
        : navigateSession.isRerouting
          ? 'Rerouting active'
          : 'No route warning from Navigate',
    confidenceLine: `Route status: ${navigateSession.routeStatusKind ?? 'nominal'}`,
    calculationState:
      rawProgressPercent != null && rawProgressPercent > 0
        ? 'Progress calculated from Navigate map route session'
        : progressFromRemaining != null
          ? 'Progress calculated from Navigate map route distance'
          : progressFromGeometry != null
            ? 'Progress calculated from Navigate map progress geometry'
          : 'Progress unavailable: Navigate map progress is limited',
    geometryStatus,
    stateLabel: isComplete ? 'ARRIVED' : isActive ? 'ACTIVE' : 'STAGED',
    stateTone: isComplete ? 'good' : isActive ? 'live' : 'attention',
    footerText: statusLabel,
    sourceDetail: 'Navigate map route session',
    routePoints: navigateSession.routePoints,
    progressPoints: navigateSession.progressPoints,
    currentLocation: navigateSession.currentLocation,
    originLocation: toRouteLocation(routeOrigin),
    destinationLocation: toRouteLocation(routeDestination),
  });
}

function calcRemainingDistance(
  waypoints: { lat: number; lon: number }[],
  wpIndex: number,
  gpsLat: number,
  gpsLon: number,
): number {
  if (waypoints.length === 0 || wpIndex >= waypoints.length) return 0;

  let remaining = haversineMi(gpsLat, gpsLon, waypoints[wpIndex].lat, waypoints[wpIndex].lon);
  for (let i = wpIndex; i < waypoints.length - 1; i += 1) {
    remaining += haversineMi(
      waypoints[i].lat,
      waypoints[i].lon,
      waypoints[i + 1].lat,
      waypoints[i + 1].lon,
    );
  }

  return remaining;
}

function calcRemainingWaypointPathMiles(
  waypoints: { lat: number; lon: number }[],
  wpIndex: number,
): number {
  if (waypoints.length < 2 || wpIndex >= waypoints.length) return 0;
  let remaining = 0;
  for (let i = Math.max(0, wpIndex); i < waypoints.length - 1; i += 1) {
    remaining += haversineMi(
      waypoints[i].lat,
      waypoints[i].lon,
      waypoints[i + 1].lat,
      waypoints[i + 1].lon,
    );
  }
  return remaining;
}

function getRouteSignature(route: ImportedRoute | null): string {
  if (!route) return 'none';
  return `${route.id}:${route.updated_at}:${route.is_active}`;
}

function sameRoute(a: ImportedRoute | null, b: ImportedRoute | null): boolean {
  return getRouteSignature(a) === getRouteSignature(b);
}

function sameNavigationData(a: VehicleNavigationData, b: VehicleNavigationData): boolean {
  return (
    a.routePhase === b.routePhase &&
    a.nextManeuver === b.nextManeuver &&
    a.statusLabel === b.statusLabel &&
    a.distanceRemainingMiles === b.distanceRemainingMiles &&
    a.etaMinutes === b.etaMinutes &&
    a.etaLabel === b.etaLabel &&
    a.progressPct === b.progressPct &&
    a.routeName === b.routeName &&
    a.destinationName === b.destinationName &&
    a.headingDeg === b.headingDeg &&
    a.currentLat === b.currentLat &&
    a.currentLon === b.currentLon
  );
}

function withContractFields(
  snapshot: Omit<
    ActiveRouteProgressSnapshot,
    | 'activeRouteId'
    | 'status'
    | 'percentComplete'
    | 'milesCompleted'
    | 'milesRemaining'
    | 'estimatedArrival'
    | 'totalDistance'
    | 'updatedAt'
  > & {
    routeId: string | null;
    status: ActiveRouteProgressStatus;
    totalDistance: number | null;
  },
): ActiveRouteProgressSnapshot {
  return {
    ...snapshot,
    activeRouteId: snapshot.routeId,
    percentComplete: snapshot.progressPercent,
    milesCompleted: snapshot.completedMiles,
    milesRemaining: snapshot.remainingMiles,
    estimatedArrival: snapshot.etaLabel === '--' ? null : snapshot.etaLabel,
    totalDistance: snapshot.totalDistance,
    updatedAt: snapshot.lastUpdated,
  };
}

function toNavigateMapPoint(point: { lat: number; lng?: number; lon?: number } | null | undefined): NavigateRouteMapPoint | null {
  const lng = point?.lng ?? point?.lon;
  if (typeof point?.lat !== 'number' || !Number.isFinite(point.lat)) return null;
  if (typeof lng !== 'number' || !Number.isFinite(lng)) return null;
  return { lat: point.lat, lng };
}

function toRouteLocation(point: NavigateRouteMapPoint | null | undefined): { latitude: number; longitude: number } | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  return { latitude: point.lat, longitude: point.lng };
}

export function getRoadProgressSnapshot(
  session: RoadNavigationSessionState,
  gpsSpeedMph?: number | null,
): ActiveRouteProgressSnapshot | null {
  const hasRoute = Boolean(session.destination || session.route);
  if (!hasRoute || session.status === 'idle' || session.status === 'error') return null;

  const isComplete = session.status === 'arrived';
  const isActive = isComplete || session.status === 'navigation_active' || session.status === 'rerouting';
  const totalMiles =
    session.route?.distanceM != null && Number.isFinite(session.route.distanceM)
      ? session.route.distanceM / 1609.344
      : null;
  const remainingMiles = isComplete
    ? 0
    : session.remainingDistanceM != null && Number.isFinite(session.remainingDistanceM)
      ? Math.max(session.remainingDistanceM / 1609.344, 0)
      : totalMiles;
  const cruisingSpeed = gpsSpeedMph != null && gpsSpeedMph > 3 ? gpsSpeedMph : DEFAULT_AVG_MPH;
  const remainingHours = isComplete
    ? 0
    : session.remainingDurationS != null && Number.isFinite(session.remainingDurationS)
      ? Math.max(session.remainingDurationS / 3600, 0)
      : remainingMiles != null && remainingMiles > 0
        ? remainingMiles / cruisingSpeed
        : null;
  const completedMiles =
    totalMiles != null && remainingMiles != null
      ? Math.max(totalMiles - remainingMiles, 0)
      : isComplete
        ? totalMiles ?? 0
        : null;
  const progressPercent =
    isComplete
      ? 100
      : totalMiles != null && totalMiles > 0 && remainingMiles != null
        ? clampProgressPercent((1 - remainingMiles / totalMiles) * 100)
        : 0;
  const currentStep = session.route?.steps?.[session.currentStepIndex] ?? null;
  const stepCount = session.route?.steps?.length ?? 0;
  const currentLegLabel = currentStep
    ? `Step ${Math.min(session.currentStepIndex + 1, stepCount)} of ${stepCount}${currentStep.roadName ? ` | ${currentStep.roadName}` : ''}`
    : stepCount > 0
      ? `Step ${Math.min(session.currentStepIndex + 1, stepCount)} of ${stepCount}`
      : 'Current leg unavailable';
  const statusLabel =
    session.routeStatusLabel?.trim() ||
    (isComplete ? 'Arrived' : isActive ? 'Route active' : 'Route staged');
  const routePoints = (session.route?.geometry ?? [])
    .map(toNavigateMapPoint)
    .filter((point): point is NavigateRouteMapPoint => !!point);
  const progressPoints = (session.progressGeometry ?? [])
    .map(toNavigateMapPoint)
    .filter((point): point is NavigateRouteMapPoint => !!point);
  const originPoint = routePoints[0] ?? null;
  const destinationPoint = routePoints[routePoints.length - 1] ?? null;

  return withContractFields({
    source: 'road-guidance',
    routeId: session.sessionId ?? session.destination?.id ?? null,
    hasRoute: true,
    isActive,
    isComplete,
    status: isComplete ? 'completed' : isActive ? 'navigating' : 'ready',
    routeLabel: session.destination?.title?.trim() || 'Road Route',
    destinationLabel: session.destination?.title?.trim() || null,
    totalDistance: totalMiles,
    totalMilesText: formatRouteProgressMiles(totalMiles),
    remainingMiles,
    remainingMilesText: formatRouteProgressMiles(remainingMiles),
    etaText: isComplete ? 'Arrived' : remainingHours != null ? formatArrivalClock(remainingHours) : '--',
    completedMiles,
    completedMilesText: formatRouteProgressMiles(completedMiles),
    progressPercent,
    remainingDurationText: isComplete ? 'Arrived' : formatRouteProgressDuration(remainingHours),
    etaLabel: isComplete ? 'Arrived' : remainingHours != null ? formatArrivalClock(remainingHours) : '--',
    currentLegLabel,
    nextInstruction: isComplete ? null : session.nextInstruction?.trim() || null,
    nextInstructionDistanceM: isComplete ? null : session.nextInstructionDistanceM,
    nextInstructionDistanceText: isComplete ? '--' : formatRouteProgressTurnDistance(session.nextInstructionDistanceM),
    lastUpdated: session.updatedAt,
    navigationStatus: statusLabel,
    warningLine:
      session.error?.trim() ||
      (session.isOffRoute
        ? `Off route${session.offRouteDistanceM != null ? ` by ${Math.round(session.offRouteDistanceM * 3.28084)} ft` : ''}`
        : session.status === 'rerouting'
          ? 'Rerouting active'
          : 'No route warning from Navigate'),
    confidenceLine: `Route confidence: ${session.routeConfidenceState.replace(/_/g, ' ')}`,
    calculationState:
      session.status === 'searching' || session.status === 'destination_selected'
        ? 'Route geometry loading'
        : session.route && remainingMiles == null
          ? 'Progress unavailable: remaining distance not calculated'
          : session.route
            ? 'Progress calculated from Navigate road guidance'
            : 'Progress unavailable: route geometry unavailable',
    geometryStatus: session.route?.geometry?.length
      ? `${session.route.geometry.length} road geometry points`
      : 'Route geometry unavailable',
    stateLabel: isComplete ? 'ARRIVED' : isActive ? 'ACTIVE' : 'STAGED',
    stateTone: isComplete ? 'good' : isActive ? 'live' : 'attention',
    footerText: statusLabel,
    sourceDetail: 'Navigate road guidance',
    routePoints,
    progressPoints,
    currentLocation: progressPoints.length > 0 ? toRouteLocation(progressPoints[progressPoints.length - 1]) : null,
    originLocation: toRouteLocation(originPoint),
    destinationLocation: toRouteLocation(destinationPoint),
  });
}

export function getTrailProgressSnapshot(
  session: TrailNavigationSessionState,
  gpsSpeedMph?: number | null,
): ActiveRouteProgressSnapshot | null {
  const hasRoute = Boolean(session.payload);
  if (!hasRoute || session.status === 'idle' || session.status === 'cancelled' || session.status === 'error') return null;

  const isComplete =
    session.status === 'arrived_trail_destination' || session.status === 'arrived_final_destination';
  const isActive =
    isComplete ||
    session.status === 'navigation_active_trail' ||
    session.status === 'off_trail' ||
    session.status === 'rejoining_trail' ||
    session.status === 'transition_to_trail';
  const remainingMiles = isComplete
    ? 0
    : session.remainingDistanceM != null && Number.isFinite(session.remainingDistanceM)
      ? Math.max(session.remainingDistanceM / 1609.344, 0)
      : null;
  const cruisingSpeed = gpsSpeedMph != null && gpsSpeedMph > 3 ? gpsSpeedMph : DEFAULT_AVG_MPH;
  const remainingHours =
    isComplete
      ? 0
      : remainingMiles != null && remainingMiles > 0
        ? remainingMiles / cruisingSpeed
        : null;
  const progressPercent = clampProgressPercent(isComplete ? 100 : session.progressPercent ?? 0);
  const destinationLabel =
    session.payload?.trailWaypoints?.[session.payload.trailWaypoints.length - 1]?.name?.trim() || null;
  const statusLabel =
    session.routeStatusLabel?.trim() ||
    session.promptTitle?.trim() ||
    (isComplete ? 'Arrived' : isActive ? 'Trail guidance active' : 'Trail staged');
  const totalTrailWaypoints = session.payload?.trailWaypoints?.length ?? 0;
  const currentLegLabel =
    session.nextDecisionPoint?.landmarkName?.trim() ||
    session.nextDecisionPoint?.instructionText?.trim() ||
    session.nextWaypoint?.name?.trim() ||
    (totalTrailWaypoints > 0
      ? `Trail waypoint ${Math.min(session.currentRouteIndex + 1, totalTrailWaypoints)} of ${totalTrailWaypoints}`
      : 'Current trail leg unavailable');
  const progressPoints = (session.progressGeometry ?? [])
    .map(toNavigateMapPoint)
    .filter((point): point is NavigateRouteMapPoint => !!point);
  const originPoint = progressPoints[0] ?? null;
  const destinationPoint = progressPoints[progressPoints.length - 1] ?? null;

  return withContractFields({
    source: 'trail-guidance',
    routeId: session.sessionId ?? session.payload?.id ?? null,
    hasRoute: true,
    isActive,
    isComplete,
    status: isComplete ? 'completed' : isActive ? 'navigating' : 'ready',
    routeLabel: destinationLabel || 'Trail Guidance',
    destinationLabel,
    totalDistance: null,
    totalMilesText: 'Trail total unavailable',
    remainingMiles,
    remainingMilesText: formatRouteProgressMiles(remainingMiles),
    etaText: isComplete ? 'Arrived' : remainingHours != null ? formatArrivalClock(remainingHours) : '--',
    completedMiles: null,
    completedMilesText: '--',
    progressPercent,
    remainingDurationText: isComplete ? 'Arrived' : formatRouteProgressDuration(remainingHours),
    etaLabel: isComplete ? 'Arrived' : remainingHours != null ? formatArrivalClock(remainingHours) : '--',
    currentLegLabel,
    nextInstruction:
      isComplete
        ? null
        : session.promptDetail?.trim() ||
          session.nextWaypoint?.name?.trim() ||
          session.routeStatusLabel?.trim() ||
          null,
    nextInstructionDistanceM: isComplete ? null : session.nextInstructionDistanceM,
    nextInstructionDistanceText: isComplete ? '--' : formatRouteProgressTurnDistance(session.nextInstructionDistanceM),
    lastUpdated: session.updatedAt,
    navigationStatus: statusLabel,
    warningLine:
      session.error?.trim() ||
      (session.status === 'off_trail'
        ? 'Off trail'
        : session.status === 'rejoining_trail'
          ? 'Rejoining trail'
          : 'No route warning from Navigate'),
    confidenceLine: `Trail state: ${session.promptBadge ?? session.status}`,
    calculationState:
      remainingMiles == null
        ? 'Progress unavailable: trail geometry or current position is limited'
        : 'Progress calculated from Navigate trail guidance',
    geometryStatus: session.progressGeometry.length > 0
      ? `${session.progressGeometry.length} trail progress points`
      : 'Trail geometry unavailable',
    stateLabel: isComplete ? 'ARRIVED' : isActive ? 'ACTIVE' : 'STAGED',
    stateTone: isComplete ? 'good' : isActive ? 'live' : 'attention',
    footerText: statusLabel,
    sourceDetail: 'Navigate trail guidance',
    routePoints: progressPoints,
    progressPoints,
    currentLocation: progressPoints.length > 0 ? toRouteLocation(progressPoints[progressPoints.length - 1]) : null,
    originLocation: toRouteLocation(originPoint),
    destinationLocation: toRouteLocation(destinationPoint),
  });
}

export function getImportedRouteProgressSnapshot(params: {
  activeRoute: ImportedRoute | null;
  routeWaypoints: { lat: number; lon: number; name: string | null }[];
  safeWpIndex: number;
  hasGps: boolean;
  gpsLat?: number;
  gpsLon?: number;
  gpsSpeed?: number | null;
  isComplete: boolean;
  totalMi: number;
}): ActiveRouteProgressSnapshot | null {
  const { activeRoute, routeWaypoints, safeWpIndex, hasGps, gpsLat, gpsLon, gpsSpeed, isComplete, totalMi } = params;
  if (!activeRoute) return null;

  const routeLabel = activeRoute.name?.trim() || activeRoute.description?.trim() || 'Active Route';
  const destinationLabel =
    routeWaypoints.length > 0
      ? routeWaypoints[routeWaypoints.length - 1]?.name || `WP ${routeWaypoints.length}`
      : null;
  let remainingMiles: number | null = null;
  if (routeWaypoints.length > 0) {
    remainingMiles = hasGps && gpsLat != null && gpsLon != null
      ? calcRemainingDistance(routeWaypoints, safeWpIndex, gpsLat, gpsLon)
      : calcRemainingWaypointPathMiles(routeWaypoints, safeWpIndex);
  } else if (totalMi > 0) {
    remainingMiles = totalMi;
  }
  if (isComplete) remainingMiles = 0;

  const etaDistance = remainingMiles ?? (totalMi > 0 ? totalMi : null);
  let remainingHours: number | null = null;
  let arrivalText = '--';
  if (isComplete) {
    remainingHours = 0;
    arrivalText = 'Arrived';
  } else if (etaDistance != null && etaDistance > 0) {
    const speed = gpsSpeed != null && gpsSpeed > 3 ? gpsSpeed : DEFAULT_AVG_MPH;
    remainingHours = etaDistance / speed;
    arrivalText = formatArrivalClock(remainingHours);
  }
  const completedMiles =
    remainingMiles != null && totalMi > 0
      ? Math.max(0, totalMi - remainingMiles)
      : isComplete
        ? Math.max(totalMi, 0)
        : null;
  const progressPercent =
    isComplete
      ? 100
      : totalMi > 0 && remainingMiles != null
        ? clampProgressPercent((1 - remainingMiles / totalMi) * 100)
        : routeWaypoints.length > 1
          ? clampProgressPercent((safeWpIndex / (routeWaypoints.length - 1)) * 100)
          : 0;
  const currentWaypoint = routeWaypoints[safeWpIndex] ?? null;
  const hazardCount = activeRoute.waypoints.filter((waypoint) => waypoint.waypointType === 'hazard').length;
  const currentLegLabel =
    currentWaypoint?.name ||
    (routeWaypoints.length > 0
      ? `Waypoint ${Math.min(safeWpIndex + 1, routeWaypoints.length)} of ${routeWaypoints.length}`
      : activeRoute.segment_count > 0
        ? `${activeRoute.segment_count} route segment${activeRoute.segment_count === 1 ? '' : 's'}`
        : 'Current leg unavailable');
  const elevationLine =
    activeRoute.elevation_gain_ft != null
      ? `${Math.round(activeRoute.elevation_gain_ft).toLocaleString()} ft gain`
      : 'Elevation/difficulty unavailable';
  const footerText = isComplete
    ? 'Route complete'
    : completedMiles != null && completedMiles > 0
      ? `${formatRouteProgressMiles(completedMiles)} covered so far`
      : hasGps
        ? 'Tracking live route progress'
        : 'Awaiting GPS to begin live progress';
  const segmentRoutePoints = activeRoute.segments
    .flatMap((segment) => segment.points)
    .map(toNavigateMapPoint)
    .filter((point): point is NavigateRouteMapPoint => !!point);
  const waypointRoutePoints = routeWaypoints
    .map(toNavigateMapPoint)
    .filter((point): point is NavigateRouteMapPoint => !!point);
  const routePoints = segmentRoutePoints.length > 1 ? segmentRoutePoints : waypointRoutePoints;
  const currentLocation = hasGps && gpsLat != null && gpsLon != null
    ? { latitude: gpsLat, longitude: gpsLon }
    : null;
  const originPoint = routePoints[0] ?? null;
  const destinationPoint = routePoints[routePoints.length - 1] ?? null;

  return withContractFields({
    source: 'imported-route',
    routeId: activeRoute.id,
    hasRoute: true,
    isActive: !isComplete,
    isComplete,
    status: isComplete ? 'completed' : hasGps ? 'navigating' : 'ready',
    routeLabel,
    destinationLabel,
    totalDistance: activeRoute.total_distance_miles > 0 ? activeRoute.total_distance_miles : null,
    totalMilesText: activeRoute.total_distance_miles > 0
      ? formatRouteProgressMiles(activeRoute.total_distance_miles)
      : 'Route distance unavailable',
    remainingMiles,
    remainingMilesText: formatRouteProgressMiles(remainingMiles),
    etaText: arrivalText,
    completedMiles,
    completedMilesText: formatRouteProgressMiles(completedMiles),
    progressPercent,
    remainingDurationText: isComplete ? 'Arrived' : formatRouteProgressDuration(remainingHours),
    etaLabel: arrivalText,
    currentLegLabel,
    nextInstruction: isComplete ? null : destinationLabel ? `Proceed to ${destinationLabel}` : null,
    nextInstructionDistanceM: null,
    nextInstructionDistanceText: '--',
    lastUpdated: activeRoute.updated_at ?? null,
    navigationStatus: isComplete ? 'Route complete' : hasGps ? 'Imported route active' : 'Imported route staged',
    warningLine: hazardCount > 0 ? `${hazardCount} route hazard waypoint${hazardCount === 1 ? '' : 's'}` : elevationLine,
    confidenceLine: hasGps ? 'Live GPS route tracking' : 'Route plan context only',
    calculationState:
      remainingMiles == null
        ? routeWaypoints.length > 0
          ? 'Progress calculated from waypoint index; GPS unavailable'
          : 'Progress unavailable: route geometry unavailable'
        : hasGps
          ? 'Progress calculated from current GPS and imported route'
          : 'Progress calculated from saved waypoint progress',
    geometryStatus:
      activeRoute.segments.length > 0
        ? `${activeRoute.segment_count} segment${activeRoute.segment_count === 1 ? '' : 's'} | ${activeRoute.waypoint_count} waypoint${activeRoute.waypoint_count === 1 ? '' : 's'}`
        : activeRoute.waypoint_count > 0
          ? `${activeRoute.waypoint_count} waypoint${activeRoute.waypoint_count === 1 ? '' : 's'}`
          : 'Route geometry unavailable',
    stateLabel: isComplete ? 'ARRIVED' : hasGps ? 'ACTIVE' : 'STAGED',
    stateTone: isComplete ? 'good' : hasGps ? 'live' : 'attention',
    footerText,
    sourceDetail: hasGps ? 'Imported route progress' : 'Route plan context',
    routePoints,
    progressPoints: currentLocation ? [...routePoints.slice(0, safeWpIndex + 1), { lat: currentLocation.latitude, lng: currentLocation.longitude }] : [],
    currentLocation,
    originLocation: toRouteLocation(originPoint),
    destinationLocation: toRouteLocation(destinationPoint),
  });
}

export function getActiveRouteProgressSnapshot(params: {
  activeRoute: ImportedRoute | null;
  navigationData: VehicleNavigationData;
  navigateSession: NavigateRouteSessionSnapshot;
  roadSession: RoadNavigationSessionState;
  trailSession: TrailNavigationSessionState;
  options?: ActiveRouteProgressOptions;
}): ActiveRouteProgressSnapshot | null {
  const routeWaypoints = params.activeRoute?.waypoints ?? [];
  const routeId = params.activeRoute?.id ?? '';
  const gpsLat = params.options?.gpsLatitude;
  const gpsLon = params.options?.gpsLongitude;
  const gpsSpeed = params.options?.gpsSpeedMph;
  const fallbackGpsLat = params.navigationData.currentLat ?? null;
  const fallbackGpsLon = params.navigationData.currentLon ?? null;
  const resolvedGpsLat = gpsLat ?? fallbackGpsLat ?? undefined;
  const resolvedGpsLon = gpsLon ?? fallbackGpsLon ?? undefined;
  const hasGps =
    resolvedGpsLat != null &&
    resolvedGpsLon != null &&
    ((params.options?.gpsHasFix ?? false) || fallbackGpsLat != null);
  const safeWpIndex = routeId ? waypointProgressStore.getIndex(routeId) : 0;
  const isComplete = params.activeRoute && routeId
    ? waypointProgressStore.isRouteComplete(routeId, routeWaypoints.length)
    : false;
  const importedProgressSummary = getImportedRouteProgressSnapshot({
    activeRoute: params.activeRoute,
    routeWaypoints,
    safeWpIndex,
    hasGps,
    gpsLat: resolvedGpsLat,
    gpsLon: resolvedGpsLon,
    gpsSpeed,
    isComplete,
    totalMi: params.activeRoute?.total_distance_miles ?? 0,
  });
  const navigateProgressSummary = getNavigateSessionProgressSnapshot(params.navigateSession, gpsSpeed);
  const roadProgressSummary = getRoadProgressSnapshot(params.roadSession, gpsSpeed);
  const trailProgressSummary = getTrailProgressSnapshot(params.trailSession, gpsSpeed);

  return (
    (navigateProgressSummary?.isActive || navigateProgressSummary?.isComplete ? navigateProgressSummary : null) ??
    (trailProgressSummary?.isActive || trailProgressSummary?.isComplete ? trailProgressSummary : null) ??
    (roadProgressSummary?.isActive || roadProgressSummary?.isComplete ? roadProgressSummary : null) ??
    importedProgressSummary ??
    navigateProgressSummary ??
    trailProgressSummary ??
    roadProgressSummary ??
    null
  );
}

export function useActiveRouteProgressSnapshot(
  options?: ActiveRouteProgressOptions,
): ActiveRouteProgressSnapshot | null {
  const [activeRoute, setActiveRoute] = useState<ImportedRoute | null>(() => routeStore.getActive());
  const [navigationData, setNavigationData] = useState<VehicleNavigationData>(() =>
    vehicleDisplayStore.getNavigationData(),
  );
  const [navigateSession, setNavigateSession] = useState<NavigateRouteSessionSnapshot>(() =>
    navigateRouteSessionStore.getSnapshot(),
  );
  const [roadSession, setRoadSession] = useState<RoadNavigationSessionState>(() =>
    getActiveRoadNavigationSession(),
  );
  const [trailSession, setTrailSession] = useState<TrailNavigationSessionState>(() =>
    getActiveTrailNavigationSession(),
  );

  useEffect(() => {
    const syncRoute = () => {
      const nextRoute = routeStore.getActive();
      setActiveRoute((current) => (sameRoute(current, nextRoute) ? current : nextRoute));
    };
    syncRoute();
    return routeStore.subscribe(syncRoute);
  }, []);

  useEffect(() => {
    return vehicleDisplayStore.subscribe(() => {
      const next = vehicleDisplayStore.getNavigationData();
      setNavigationData((current) => (sameNavigationData(current, next) ? current : next));
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    const syncNavigateSession = (next: NavigateRouteSessionSnapshot) => {
      setNavigateSession((current) => (current === next ? current : next));
    };
    const unsubscribe = navigateRouteSessionStore.subscribe(syncNavigateSession);
    void navigateRouteSessionStore.hydrateFromPersistence().then((snapshot) => {
      if (mounted) syncNavigateSession(snapshot);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return subscribeActiveRoadNavigationSession(() => {
      const next = getActiveRoadNavigationSession();
      setRoadSession((current) => (current === next ? current : next));
    });
  }, []);

  useEffect(() => {
    return subscribeActiveTrailNavigationSession(() => {
      const next = getActiveTrailNavigationSession();
      setTrailSession((current) => (current === next ? current : next));
    });
  }, []);

  const gpsLatitude = options?.gpsLatitude ?? null;
  const gpsLongitude = options?.gpsLongitude ?? null;
  const gpsSpeedMph = options?.gpsSpeedMph ?? null;
  const gpsHasFix = options?.gpsHasFix ?? false;

  return useMemo(
    () =>
      getActiveRouteProgressSnapshot({
        activeRoute,
        navigationData,
        navigateSession,
        roadSession,
        trailSession,
        options: {
          gpsLatitude,
          gpsLongitude,
          gpsSpeedMph,
          gpsHasFix,
        },
      }),
    [
      activeRoute,
      gpsHasFix,
      gpsLatitude,
      gpsLongitude,
      gpsSpeedMph,
      navigateSession,
      navigationData,
      roadSession,
      trailSession,
    ],
  );
}
