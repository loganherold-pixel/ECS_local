import {
  buildActiveGuidanceDirectionList,
  type ActiveGuidanceDirectionList,
} from '../activeGuidanceDirections';
import type {
  RoadNavCoordinate,
  RoadNavLeg,
  RoadNavRoute,
  RoadNavStep,
} from '../mapboxRoadNavigation';
import type { EcsActiveGuidanceProgress } from './ecsActiveGuidanceController';
import type {
  EcsGuidanceCoordinate,
  EcsGuidanceLeg,
  EcsGuidanceMode,
  EcsGuidanceRoute,
  EcsGuidanceSourceLabel,
  EcsGuidanceStep,
} from './ecsGuidanceModel';
import {
  getRoadNavRouteVersion,
  getRouteIndex,
  tagRouteGeometry,
} from './routeVersion';

export const ACTIVE_GUIDANCE_REFRESHED_STEPS_UNAVAILABLE_MESSAGE =
  'Guidance refreshed, but turn-by-turn steps are unavailable for this segment.';

export type ActiveGuidanceRefreshReason =
  | 'initial'
  | 'reroute'
  | 'manual_refresh'
  | 'screen_focus'
  | 'app_foreground'
  | 'restored_session';

export interface ActiveGuidanceState {
  routeId: string;
  routeVersion: string;
  routeUuid: string | null;
  rerouteGeneration: number;
  generatedAt: string;
  refreshedAt: string;
  origin: RoadNavCoordinate;
  destination: RoadNavCoordinate;
  selectedRouteIndex: number;
  geometry: RoadNavCoordinate[];
  legs: EcsGuidanceLeg[];
  steps: EcsGuidanceStep[];
  maneuvers: EcsGuidanceStep[];
  roadSteps: RoadNavStep[];
  roadLegs: RoadNavLeg[];
  etaIso: string | null;
  distanceMeters: number;
  durationSeconds: number;
  refreshReason: ActiveGuidanceRefreshReason;
  guidanceMode: EcsGuidanceMode;
  guidanceSourceLabel?: EcsGuidanceSourceLabel;
  guidanceLimitationLabel?: string;
  providerMetadata?: Record<string, unknown>;
  currentStepIndex: number | null;
}

export type VersionedActiveGuidanceDirectionList = ActiveGuidanceDirectionList & {
  routeVersion: string | null;
  stalePrevented: boolean;
};

export interface BuildActiveGuidanceStateInput {
  route: RoadNavRoute;
  refreshReason: ActiveGuidanceRefreshReason;
  refreshedAt?: string | null;
  currentStepIndex?: number | null;
}

export interface BuildVersionedActiveGuidanceDirectionListInput {
  activeGuidance: ActiveGuidanceState | null | undefined;
  progress: EcsActiveGuidanceProgress | null | undefined;
  status?: string | null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cloneCoordinate<T extends RoadNavCoordinate | EcsGuidanceCoordinate>(coordinate: T): T {
  return { ...coordinate };
}

function cloneRoadStep(step: RoadNavStep): RoadNavStep {
  return {
    ...step,
    location: cloneCoordinate(step.location),
    geometry: step.geometry.map(cloneCoordinate),
    bannerInstructions: step.bannerInstructions.map((instruction) => ({ ...instruction })),
    voiceInstructions: step.voiceInstructions.map((instruction) => ({ ...instruction })),
  };
}

function cloneRoadLeg(leg: RoadNavLeg): RoadNavLeg {
  return { ...leg };
}

function cloneGuidanceStep(step: EcsGuidanceStep): EcsGuidanceStep {
  return {
    ...step,
    maneuverLocation: step.maneuverLocation ? [...step.maneuverLocation] : undefined,
    geometry: step.geometry?.map(cloneCoordinate),
    bannerInstructions: step.bannerInstructions?.map((instruction) => ({ ...instruction })),
    voiceInstructions: step.voiceInstructions?.map((instruction) => ({ ...instruction })),
  };
}

function cloneGuidanceLeg(leg: EcsGuidanceLeg): EcsGuidanceLeg {
  const steps = leg.steps.map(cloneGuidanceStep);
  return {
    ...leg,
    steps,
  };
}

function getSelectedRouteIndex(route: RoadNavRoute): number {
  return getRouteIndex(route);
}

function getRouteUuid(route: RoadNavRoute): string | null {
  return route.mapboxRouteUuid ?? route.guidance.routeUuid ?? null;
}

function getGuidanceMode(route: RoadNavRoute): EcsGuidanceMode {
  if (route.guidance.guidanceMode) return route.guidance.guidanceMode;
  return route.guidanceMode === 'turn_by_turn' ? 'turn_by_turn' : 'summary_only';
}

function computeBounds(geometry: RoadNavCoordinate[]): RoadNavRoute['bounds'] {
  if (geometry.length < 2) return null;
  return geometry.reduce(
    (bounds, point) => ({
      north: Math.max(bounds.north, point.lat),
      south: Math.min(bounds.south, point.lat),
      east: Math.max(bounds.east, point.lng),
      west: Math.min(bounds.west, point.lng),
    }),
    {
      north: geometry[0].lat,
      south: geometry[0].lat,
      east: geometry[0].lng,
      west: geometry[0].lng,
    },
  );
}

function buildProgressFromActiveGuidance(
  activeGuidance: ActiveGuidanceState,
): EcsActiveGuidanceProgress {
  const currentStepIndex = Math.max(
    0,
    Math.min(
      activeGuidance.steps.length - 1,
      Math.floor(activeGuidance.currentStepIndex ?? 0),
    ),
  );
  const currentStep = activeGuidance.steps[currentStepIndex] ?? null;
  const nextStep = activeGuidance.steps[currentStepIndex + 1] ?? null;
  const followingStep = activeGuidance.steps[currentStepIndex + 2] ?? null;
  const remainingSteps = activeGuidance.steps.slice(currentStepIndex);

  return {
    routeId: activeGuidance.routeId,
    routeVersion: activeGuidance.routeVersion,
    rerouteGeneration: activeGuidance.rerouteGeneration,
    currentLegIndex: currentStep?.legIndex ?? 0,
    currentStepIndex,
    distanceToNextManeuverMeters: currentStep?.distanceMeters ?? null,
    distanceRemainingMeters: remainingSteps.reduce(
      (sum, step) => sum + (finiteNumber(step.distanceMeters) ?? 0),
      0,
    ),
    durationRemainingSeconds: remainingSteps.reduce(
      (sum, step) => sum + (finiteNumber(step.durationSeconds) ?? 0),
      0,
    ),
    currentInstruction: currentStep?.instruction ?? 'Continue on highlighted route',
    currentRoadName: currentStep?.displayRoadName ?? currentStep?.roadName ?? 'Route',
    nextInstruction: nextStep?.instruction,
    offRouteCandidate: false,
    offRouteStatus: 'on_route',
    offRouteUpdateCount: 0,
    offRouteThresholdMeters: 0,
    gpsAccuracyMeters: null,
    headingDivergenceDegrees: null,
    confidence: 'medium',
    updatedAt: activeGuidance.refreshedAt,
    distanceFromRouteMeters: 0,
    distanceRemainingOnCurrentStepMeters: currentStep?.distanceMeters ?? null,
    nearestRoutePoint: null,
    nearestStepPoint: null,
    currentStep: currentStep ?? undefined,
    nextStep: nextStep ?? undefined,
    followingStep: followingStep ?? undefined,
    upcomingSteps: remainingSteps,
  };
}

function progressMatchesActiveGuidance(
  activeGuidance: ActiveGuidanceState,
  progress: EcsActiveGuidanceProgress | null | undefined,
): boolean {
  if (!progress) return false;
  const progressRouteVersion = (progress as EcsActiveGuidanceProgress & {
    routeVersion?: unknown;
  }).routeVersion;
  if (progressRouteVersion !== activeGuidance.routeVersion) {
    return false;
  }
  return (
    progress.routeId === activeGuidance.routeId &&
    progress.rerouteGeneration === activeGuidance.rerouteGeneration
  );
}

export function normalizeActiveGuidanceRefreshReason(
  reason: string | null | undefined,
): ActiveGuidanceRefreshReason {
  switch (reason) {
    case 'initial':
    case 'reroute':
    case 'manual_refresh':
    case 'screen_focus':
    case 'app_foreground':
    case 'restored_session':
      return reason;
    case 'manual':
      return 'manual_refresh';
    case 'off_route':
    default:
      return 'reroute';
  }
}

export function buildActiveGuidanceStateFromRoadRoute(
  input: BuildActiveGuidanceStateInput,
): ActiveGuidanceState {
  const route = input.route;
  const routeId = route.guidance.id ?? route.id;
  const routeUuid = getRouteUuid(route);
  const rerouteGeneration = route.guidance.rerouteGeneration ?? 0;
  const generatedAt = route.guidance.createdAt ?? route.createdAt;
  const refreshedAt = input.refreshedAt ?? new Date().toISOString();
  const selectedRouteIndex = getSelectedRouteIndex(route);
  const routeVersion = getRoadNavRouteVersion(route);
  const geometry = tagRouteGeometry(
    (route.guidance.geometry?.length ? route.guidance.geometry : route.geometry)
      .map(cloneCoordinate),
    routeVersion,
  );
  const steps = route.guidance.steps.map(cloneGuidanceStep);
  const guidanceMode = getGuidanceMode(route);

  return {
    routeId,
    routeVersion,
    routeUuid,
    rerouteGeneration,
    generatedAt,
    refreshedAt,
    origin: cloneCoordinate(route.origin),
    destination: cloneCoordinate(route.destination.coordinate),
    selectedRouteIndex,
    geometry,
    legs: route.guidance.legs.map(cloneGuidanceLeg),
    steps,
    maneuvers: steps.map(cloneGuidanceStep),
    roadSteps: route.steps.map(cloneRoadStep),
    roadLegs: route.legs.map(cloneRoadLeg),
    etaIso:
      route.guidance.etaIso ??
      (route.durationS > 0 ? new Date(Date.now() + route.durationS * 1000).toISOString() : null),
    distanceMeters: route.guidance.distanceMeters ?? route.distanceM,
    durationSeconds: route.guidance.durationSeconds ?? route.durationS,
    refreshReason: input.refreshReason,
    guidanceMode,
    guidanceSourceLabel: route.guidance.guidanceSourceLabel,
    guidanceLimitationLabel:
      route.guidance.guidanceLimitationLabel ??
      (guidanceMode === 'turn_by_turn' && steps.length > 0
        ? undefined
        : ACTIVE_GUIDANCE_REFRESHED_STEPS_UNAVAILABLE_MESSAGE),
    providerMetadata:
      route.guidance.providerMetadata ?? route.providerMetadata,
    currentStepIndex: input.currentStepIndex ?? null,
  };
}

export function buildActiveGuidanceRouteFromState(
  activeGuidance: ActiveGuidanceState,
): EcsGuidanceRoute {
  return {
    id: activeGuidance.routeId,
    routeVersion: activeGuidance.routeVersion,
    routeIndex: activeGuidance.selectedRouteIndex,
    source: 'mapbox_directions',
    routeUuid: activeGuidance.routeUuid ?? undefined,
    geometry: tagRouteGeometry(activeGuidance.geometry.map(cloneCoordinate), activeGuidance.routeVersion),
    distanceMeters: activeGuidance.distanceMeters,
    durationSeconds: activeGuidance.durationSeconds,
    etaIso: activeGuidance.etaIso ?? undefined,
    legs: activeGuidance.legs.map(cloneGuidanceLeg),
    steps: activeGuidance.steps.map(cloneGuidanceStep),
    createdAt: activeGuidance.generatedAt,
    rerouteGeneration: activeGuidance.rerouteGeneration,
    guidanceMode: activeGuidance.guidanceMode,
    guidanceSourceLabel: activeGuidance.guidanceSourceLabel,
    guidanceLimitationLabel: activeGuidance.guidanceLimitationLabel,
    providerMetadata: activeGuidance.providerMetadata,
  };
}

export function applyActiveGuidanceStateToRoadRoute(
  route: RoadNavRoute,
  activeGuidance: ActiveGuidanceState,
): RoadNavRoute {
  const geometry = activeGuidance.geometry.map(cloneCoordinate);
  return {
    ...route,
    id: activeGuidance.routeId,
    routeVersion: activeGuidance.routeVersion,
    routeIndex: activeGuidance.selectedRouteIndex,
    mapboxRouteUuid: activeGuidance.routeUuid,
    guidance: buildActiveGuidanceRouteFromState(activeGuidance),
    origin: cloneCoordinate(activeGuidance.origin),
    destination: {
      ...route.destination,
      coordinate: cloneCoordinate(activeGuidance.destination),
    },
    geometry,
    distanceM: activeGuidance.distanceMeters,
    durationS: activeGuidance.durationSeconds,
    steps: activeGuidance.roadSteps.map(cloneRoadStep),
    legs: activeGuidance.roadLegs.map(cloneRoadLeg),
    guidanceMode: activeGuidance.guidanceMode === 'turn_by_turn' ? 'turn_by_turn' : 'summary_only',
    bounds: computeBounds(geometry),
    createdAt: activeGuidance.generatedAt,
    providerMetadata: activeGuidance.providerMetadata,
    selectedRouteIndex: activeGuidance.selectedRouteIndex,
  } as RoadNavRoute & { selectedRouteIndex: number };
}

export function withActiveGuidanceProgressSnapshot(
  activeGuidance: ActiveGuidanceState | null | undefined,
  progress: EcsActiveGuidanceProgress | null | undefined,
): ActiveGuidanceState | null {
  if (!activeGuidance) return null;
  if (!progressMatchesActiveGuidance(activeGuidance, progress)) return activeGuidance;
  const currentStepIndex = finiteNumber(progress?.currentStepIndex);
  if (currentStepIndex == null || currentStepIndex === activeGuidance.currentStepIndex) {
    return activeGuidance;
  }
  return {
    ...activeGuidance,
    currentStepIndex: Math.max(0, Math.floor(currentStepIndex)),
  };
}

export function buildVersionedActiveGuidanceDirectionList(
  input: BuildVersionedActiveGuidanceDirectionListInput,
): VersionedActiveGuidanceDirectionList {
  const activeGuidance = input.activeGuidance ?? null;
  if (!activeGuidance) {
    return {
      state: 'pending',
      items: [],
      emptyMessage: 'Directions will appear when route calculation completes',
      routeId: null,
      rerouteGeneration: null,
      currentStepIndex: null,
      guidanceMode: null,
      sourceLabel: null,
      routeVersion: null,
      stalePrevented: false,
    };
  }

  if (activeGuidance.guidanceMode !== 'turn_by_turn' || activeGuidance.steps.length === 0) {
    return {
      state: 'unavailable',
      items: [],
      emptyMessage:
        activeGuidance.guidanceLimitationLabel ??
        ACTIVE_GUIDANCE_REFRESHED_STEPS_UNAVAILABLE_MESSAGE,
      routeId: activeGuidance.routeId,
      rerouteGeneration: activeGuidance.rerouteGeneration,
      currentStepIndex: activeGuidance.currentStepIndex,
      guidanceMode: activeGuidance.guidanceMode,
      sourceLabel: activeGuidance.guidanceSourceLabel ?? null,
      routeVersion: activeGuidance.routeVersion,
      stalePrevented: false,
    };
  }

  const progressMatches = progressMatchesActiveGuidance(activeGuidance, input.progress);
  const progress = progressMatches
    ? input.progress
    : buildProgressFromActiveGuidance(activeGuidance);
  const list = buildActiveGuidanceDirectionList({
    route: buildActiveGuidanceRouteFromState(activeGuidance),
    progress,
    status: input.status,
  });

  return {
    ...list,
    routeVersion: activeGuidance.routeVersion,
    stalePrevented: !!input.progress && !progressMatches,
  };
}
