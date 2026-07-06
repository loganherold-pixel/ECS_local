import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  clearRoadNavigationSession,
  loadRoadNavigationSession,
  saveRoadNavigationSession,
  type PersistedRoadNavigationSession,
} from './roadNavigationStore';
import {
  buildRoadRouteFromCachedGeometry,
  createRoadSearchSessionToken,
  fetchRoadRouteAlternatives,
  resolveRoadDestination,
  searchRoadDestinations,
  type RoadNavCoordinate,
  type RoadNavDestination,
  type RoadNavRoute,
  type RoadNavSearchSuggestion,
  type RoadNavSourceType,
  type RoadNavStatus,
} from './mapboxRoadNavigation';
import {
  resolveEcsActiveGuidanceProgress,
  type EcsActiveGuidanceOffRouteStatus,
  type EcsActiveGuidanceProgress,
} from './navigation/ecsActiveGuidanceController';
import {
  applyActiveGuidanceStateToRoadRoute,
  buildActiveGuidanceStateFromRoadRoute,
  normalizeActiveGuidanceRefreshReason,
  withActiveGuidanceProgressSnapshot,
  type ActiveGuidanceRefreshReason,
  type ActiveGuidanceState,
} from './navigation/activeGuidanceState';
import {
  ensureRoadNavRouteVersion,
  getRoadNavRouteVersion,
} from './navigation/routeVersion';
import {
  cacheRouteGeometry,
  getCachedRouteGeometry,
  getRouteGeometryCacheKey,
  logRouteGeometryLifecycle,
  routeGeometryLineStringToLatLng,
  validateRouteGeometry,
} from './routeGeometryLifecycle';
import {
  buildRoadNavigationProgressPersistenceSnapshot,
  shouldPersistRoadNavigationProgressUpdate,
  type RoadNavigationProgressPersistenceSnapshot,
} from './roadNavigationProgressPersistence';
import { resolveRoadNavigationProgress } from './roadNavigationProgress';

const SEARCH_DEBOUNCE_MS = 320;
const ARRIVAL_DISTANCE_M = 200;
const APPROACH_DISTANCE_M = 180;
const LOW_CONFIDENCE_DISTANCE_M = 26;
const TEMP_DEVIATION_DISTANCE_M = 58;
const MATERIAL_OFF_ROUTE_DISTANCE_M = 105;
const REJOIN_DISTANCE_M = 30;
const LOW_CONFIDENCE_CONFIRMATION_COUNT = 2;
const TEMP_DEVIATION_CONFIRMATION_COUNT = 2;
const OFF_ROUTE_CONFIRMATION_COUNT = 3;
const REJOIN_CONFIRMATION_COUNT = 2;
const ARRIVAL_CONFIRMATION_COUNT = 2;
const REROUTE_COOLDOWN_MS = 6000;
const ROAD_NAV_PREVIEW_RESTORE_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const ROAD_NAV_ACTIVE_RESTORE_MAX_AGE_MS = 18 * 60 * 60 * 1000;
const ROUTE_REQUEST_TIMEOUT_MS = 20000;
const ROUTE_TIMEOUT_ERROR_MESSAGE = 'Route generation timed out. Check connection and retry.';

function logGuidanceDebug(message: string, payload?: Record<string, unknown>): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.debug(message, payload);
  }
}

export type RoadNavigationConfidenceState =
  | 'on_route'
  | 'off_route_candidate'
  | 'off_route_confirmed'
  | 'low_confidence'
  | 'temporary_deviation'
  | 'off_route'
  | 'rerouting'
  | 'reroute_failed'
  | 'reroute_applied'
  | 'rejoined'
  | 'approaching'
  | 'arrived';

export type RoadNavigationCompletionReason = 'auto_arrival' | null;

export interface RoadNavigationSessionState {
  sessionId: string | null;
  status: RoadNavStatus;
  destination: RoadNavDestination | null;
  route: RoadNavRoute | null;
  currentStepIndex: number;
  nextInstruction: string | null;
  nextInstructionDistanceM: number | null;
  remainingDistanceM: number | null;
  remainingDurationS: number | null;
  etaIso: string | null;
  routeStatusLabel: string | null;
  routeAlternatives: RoadNavRoute[];
  routeConfidenceState: RoadNavigationConfidenceState;
  offRouteDistanceM: number | null;
  distanceToDestinationM: number | null;
  activeGuidanceProgress: EcsActiveGuidanceProgress | null;
  activeGuidance: ActiveGuidanceState | null;
  offRouteUpdateCount: number;
  gpsAccuracyMeters: number | null;
  rerouteStatus: EcsActiveGuidanceOffRouteStatus;
  lastRerouteError: string | null;
  completionReason: RoadNavigationCompletionReason;
  error: string | null;
  isOffRoute: boolean;
  rerouteCount: number;
  progressGeometry: RoadNavCoordinate[];
  updatedAt: string | null;
  createdFrom: RoadNavSourceType;
}

export interface UseRoadNavigationOutput {
  query: string;
  setQuery: (value: string) => void;
  suggestions: RoadNavSearchSuggestion[];
  searchLoading: boolean;
  searchError: string | null;
  session: RoadNavigationSessionState;
  previewLoading: boolean;
  stepListExpanded: boolean;
  setStepListExpanded: (value: boolean) => void;
  uiMode: 'idle' | 'search' | 'preview' | 'active' | 'arrived' | 'error';
  hasSearchResults: boolean;
  selectSuggestion: (suggestion: RoadNavSearchSuggestion) => Promise<void>;
  previewDestination: (
    destination: RoadNavDestination,
    createdFrom?: RoadNavSourceType,
  ) => Promise<void>;
  previewRoute: (
    route: RoadNavRoute,
    createdFrom?: RoadNavSourceType,
  ) => Promise<void>;
  selectRouteAlternative: (routeId: string) => void;
  startNavigation: () => void;
  endNavigation: () => Promise<void>;
  clearDestination: () => Promise<void>;
  reroute: (reason?: string) => Promise<void>;
  rehydrateActiveGuidance: (reason?: ActiveGuidanceRefreshReason) => Promise<void>;
}

type RoadNavigationLocation = RoadNavCoordinate & {
  accuracyM?: number | null;
  speedMph?: number | null;
  headingDeg?: number | null;
};

function isRecentIsoTimestamp(value: string | null | undefined, maxAgeMs: number): boolean {
  if (!value) return false;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed <= maxAgeMs;
}

function isRestorableRoadSession(
  restored: PersistedRoadNavigationSession | null,
): restored is PersistedRoadNavigationSession {
  if (!restored?.destination?.coordinate || !restored.sessionId) return false;

  switch (restored.status) {
    case 'destination_selected':
    case 'route_preview':
      return isRecentIsoTimestamp(restored.updatedAt, ROAD_NAV_PREVIEW_RESTORE_MAX_AGE_MS);
    case 'navigation_active':
    case 'rerouting':
      return isRecentIsoTimestamp(restored.updatedAt, ROAD_NAV_ACTIVE_RESTORE_MAX_AGE_MS);
    case 'arrived':
    default:
      return false;
  }
}

function getRouteErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function withRouteRequestTimeout<T>(
  request: Promise<T>,
  timeoutMs = ROUTE_REQUEST_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(ROUTE_TIMEOUT_ERROR_MESSAGE));
    }, timeoutMs);
  });

  return Promise.race([request, timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  });
}

function randomSessionId(): string {
  const cryptoRef = typeof crypto !== 'undefined' ? crypto : null;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getAccuracyPadMeters(location: RoadNavigationLocation | null): number {
  if (!location?.accuracyM || !Number.isFinite(location.accuracyM)) return 0;
  return clamp(location.accuracyM, 0, 35);
}

function getSpeedMph(location: RoadNavigationLocation | null): number {
  if (!location?.speedMph || !Number.isFinite(location.speedMph)) return 0;
  return Math.max(location.speedMph, 0);
}

function getConfidenceLabel(
  confidenceState: RoadNavigationConfidenceState,
  liveServicesEnabled: boolean,
): string {
  switch (confidenceState) {
    case 'off_route_candidate':
      return 'Checking route';
    case 'off_route_confirmed':
      return liveServicesEnabled ? 'Off route' : 'Rejoin route';
    case 'low_confidence':
      return 'GPS settling';
    case 'temporary_deviation':
      return 'Route adjusting';
    case 'off_route':
      return liveServicesEnabled ? 'Off route' : 'Rejoin route';
    case 'rerouting':
      return liveServicesEnabled ? 'Updating route' : 'Rejoin route';
    case 'reroute_failed':
      return 'Unable to recalculate route';
    case 'reroute_applied':
      return 'Route updated';
    case 'rejoined':
      return 'Route rejoined';
    case 'approaching':
      return 'Final approach';
    case 'arrived':
      return 'Arrived';
    case 'on_route':
    default:
      return 'Route active';
  }
}

function getRouteStateLabel(
  status: Extract<RoadNavStatus, 'route_preview' | 'navigation_active' | 'rerouting' | 'arrived'>,
  confidenceState: RoadNavigationConfidenceState,
  liveServicesEnabled: boolean,
): string {
  if (status === 'route_preview') return 'Route staged';
  return getConfidenceLabel(confidenceState, liveServicesEnabled);
}

function sameNullableNumber(
  a: number | null,
  b: number | null,
  tolerance = 0,
): boolean {
  if (a == null || b == null) return a === b;
  return Math.abs(a - b) <= tolerance;
}

function sameGeometry(
  a: RoadNavCoordinate[],
  b: RoadNavCoordinate[],
  precision = 5,
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    if (a[i].lat.toFixed(precision) !== b[i].lat.toFixed(precision)) return false;
    if (a[i].lng.toFixed(precision) !== b[i].lng.toFixed(precision)) return false;
  }

  return true;
}

function getRoadRouteGeometryCacheKey(
  route: RoadNavRoute,
  fallbackKey?: string | null,
): string | null {
  return getRouteGeometryCacheKey(route, fallbackKey ?? (route.id ? `road:${route.id}` : null));
}

function ensureRoadRouteGeometry(
  route: RoadNavRoute | null,
  context: {
    phase: string;
    status?: string | null;
    source?: string | null;
    fallbackCacheKey?: string | null;
  },
): RoadNavRoute | null {
  if (!route) {
    logRouteGeometryLifecycle('no_route_selected', {
      phase: context.phase,
      source: context.source,
      status: context.status,
      message: 'Road navigation route was not available.',
    });
    return null;
  }

  const cacheKey = getRoadRouteGeometryCacheKey(route, context.fallbackCacheKey);
  const validation = validateRouteGeometry(route);
  if (!validation.valid || !validation.lineString) {
    logRouteGeometryLifecycle(validation.reason, {
      routeId: route.id,
      cacheKey,
      phase: context.phase,
      source: context.source,
      status: context.status,
      message: 'Road navigation route did not include valid drawable geometry.',
    });
    return null;
  }

  cacheRouteGeometry(cacheKey, validation.lineString);
  logRouteGeometryLifecycle('geometry_successfully_loaded', {
    routeId: route.id,
    cacheKey,
    phase: context.phase,
    source: context.source,
    status: context.status,
    pointCount: validation.pointCount,
    fingerprint: validation.fingerprint,
  });

  const normalizedGeometry = routeGeometryLineStringToLatLng(validation.lineString);
  if (sameGeometry(route.geometry, normalizedGeometry)) return route;
  return {
    ...route,
    geometry: normalizedGeometry,
  };
}

function buildCachedRoadRouteFromRestoredSession(
  restored: PersistedRoadNavigationSession,
  currentLocation: RoadNavigationLocation | null,
): RoadNavRoute | null {
  const routeId = restored.routeId ?? `restored-road-route-${restored.sessionId}`;
  const cacheKey =
    restored.routeGeometryCacheKey ??
    (restored.routeId ? `road:${restored.routeId}` : `road-session:${restored.sessionId}`);
  const persistedValidation = validateRouteGeometry(restored.routeGeometry);
  const cachedLineString =
    persistedValidation.valid && persistedValidation.lineString
      ? persistedValidation.lineString
      : getCachedRouteGeometry(cacheKey);

  if (!cachedLineString) {
    logRouteGeometryLifecycle(
      persistedValidation.reason === 'no_route_selected'
        ? 'geometry_cache_miss'
        : persistedValidation.reason,
      {
        routeId,
        cacheKey,
        phase: 'restore',
        source: 'road',
        status: restored.status,
        message: 'Restored road route did not include cached geometry.',
      },
    );
    return null;
  }

  const restoredGeometry = routeGeometryLineStringToLatLng(cachedLineString);
  const route = buildRoadRouteFromCachedGeometry({
    id: routeId,
    origin: currentLocation ?? restoredGeometry[0] ?? restored.destination.coordinate,
    destination: restored.destination,
    geometry: restoredGeometry,
    distanceM: restored.routeDistanceM,
    durationS: restored.routeDurationS,
    createdAt: restored.routeCreatedAt ?? restored.updatedAt,
  });
  const routeWithRestoredGuidance = restored.activeGuidance
    ? applyActiveGuidanceStateToRoadRoute(route, restored.activeGuidance)
    : route;

  return ensureRoadRouteGeometry(routeWithRestoredGuidance, {
    phase: 'restore',
    source: 'road',
    status: restored.status,
    fallbackCacheKey: cacheKey,
  });
}

function computeSessionFromRoute(
  route: RoadNavRoute,
  location: RoadNavigationLocation | null,
  previous: RoadNavigationSessionState,
): Pick<
  RoadNavigationSessionState,
  | 'currentStepIndex'
  | 'nextInstruction'
  | 'nextInstructionDistanceM'
  | 'remainingDistanceM'
  | 'remainingDurationS'
  | 'etaIso'
  | 'offRouteDistanceM'
  | 'distanceToDestinationM'
  | 'activeGuidanceProgress'
  | 'offRouteUpdateCount'
  | 'gpsAccuracyMeters'
  | 'progressGeometry'
  | 'updatedAt'
> {
  const nowIso = new Date().toISOString();
  if (!Array.isArray(route.geometry) || route.geometry.length < 2) {
    logRouteGeometryLifecycle('geometry_malformed', {
      routeId: route.id,
      phase: 'progress',
      source: 'road',
      status: previous.status,
      message: 'Progress update skipped because road route geometry is unavailable.',
    });
    return {
      currentStepIndex: previous.currentStepIndex,
      nextInstruction: previous.nextInstruction,
      nextInstructionDistanceM: null,
      remainingDistanceM: route.distanceM,
      remainingDurationS: route.durationS,
      etaIso: route.durationS > 0 ? new Date(Date.now() + route.durationS * 1000).toISOString() : null,
      offRouteDistanceM: null,
      distanceToDestinationM: null,
      activeGuidanceProgress: null,
      offRouteUpdateCount: previous.offRouteUpdateCount,
      gpsAccuracyMeters: null,
      progressGeometry: [],
      updatedAt: nowIso,
    };
  }

  if (!location) {
    return {
      currentStepIndex: previous.currentStepIndex,
      nextInstruction: route.steps[previous.currentStepIndex]?.instruction ?? null,
      nextInstructionDistanceM: null,
      remainingDistanceM: route.distanceM,
      remainingDurationS: route.durationS,
      etaIso:
        route.durationS > 0
          ? new Date(Date.now() + route.durationS * 1000).toISOString()
          : null,
      offRouteDistanceM: null,
      distanceToDestinationM: null,
      activeGuidanceProgress: null,
      offRouteUpdateCount: previous.offRouteUpdateCount,
      gpsAccuracyMeters: null,
      progressGeometry: [],
      updatedAt: nowIso,
    };
  }

  const routeVersion = getRoadNavRouteVersion(route);
  const previousProgress =
    previous.activeGuidanceProgress?.routeId === route.guidance.id &&
    previous.activeGuidanceProgress.rerouteGeneration === route.guidance.rerouteGeneration &&
    previous.activeGuidanceProgress.routeVersion === routeVersion
      ? previous.activeGuidanceProgress
      : null;
  const activeGuidanceRoute =
    route.guidance.routeVersion === routeVersion
      ? route.guidance
      : {
          ...route.guidance,
          routeVersion,
          routeIndex: route.routeIndex ?? route.selectedRouteIndex ?? 0,
          providerMetadata: route.guidance.providerMetadata ?? route.providerMetadata,
        };
  const activeGuidanceProgress = resolveEcsActiveGuidanceProgress({
    currentCoordinate: location,
    currentSpeedMetersPerSecond:
      typeof location.speedMph === 'number' && Number.isFinite(location.speedMph)
        ? location.speedMph * 0.44704
        : null,
    currentHeadingDegrees: location.headingDeg,
    currentGpsAccuracyMeters: location.accuracyM,
    activeRoute: activeGuidanceRoute,
    previousProgress,
    rerouteStatus:
      previous.status === 'rerouting'
        ? 'rerouting'
        : previous.rerouteStatus === 'reroute_failed'
          ? 'reroute_failed'
          : null,
    updatedAt: nowIso,
  });
  const progress = resolveRoadNavigationProgress(route, {
    location,
    previousStepIndex: previous.currentStepIndex,
    previousRemainingDistanceM: previous.remainingDistanceM,
    lockForwardProgress:
      previous.status === 'navigation_active' ||
      previous.status === 'rerouting' ||
      previous.status === 'arrived',
  });
  const remainingDistanceM = activeGuidanceProgress.distanceRemainingMeters;
  const remainingDurationS =
    activeGuidanceProgress.durationRemainingSeconds ??
    (route.distanceM > 0
      ? Math.max((route.durationS * remainingDistanceM) / route.distanceM, 0)
      : 0);
  const etaIso =
    remainingDurationS > 0
      ? new Date(Date.now() + remainingDurationS * 1000).toISOString()
      : null;

  return {
    currentStepIndex: activeGuidanceProgress.currentStepIndex,
    nextInstruction:
      activeGuidanceProgress.nextInstruction ??
      activeGuidanceProgress.currentInstruction ??
      progress.nextInstruction,
    nextInstructionDistanceM: activeGuidanceProgress.distanceToNextManeuverMeters,
    remainingDistanceM,
    remainingDurationS,
    etaIso,
    offRouteDistanceM: activeGuidanceProgress.distanceFromRouteMeters,
    distanceToDestinationM: progress.distanceToDestinationM,
    activeGuidanceProgress,
    offRouteUpdateCount: activeGuidanceProgress.offRouteUpdateCount,
    gpsAccuracyMeters: activeGuidanceProgress.gpsAccuracyMeters,
    progressGeometry: progress.progressGeometry,
    updatedAt: nowIso,
  };
}

function createEmptySession(): RoadNavigationSessionState {
  return {
    sessionId: null,
    status: 'idle',
    destination: null,
    route: null,
    routeAlternatives: [],
    currentStepIndex: 0,
    nextInstruction: null,
    nextInstructionDistanceM: null,
    remainingDistanceM: null,
    remainingDurationS: null,
    etaIso: null,
    routeStatusLabel: null,
    routeConfidenceState: 'on_route',
    offRouteDistanceM: null,
    distanceToDestinationM: null,
    activeGuidanceProgress: null,
    activeGuidance: null,
    offRouteUpdateCount: 0,
    gpsAccuracyMeters: null,
    rerouteStatus: 'on_route',
    lastRerouteError: null,
    completionReason: null,
    error: null,
    isOffRoute: false,
    rerouteCount: 0,
    progressGeometry: [],
    updatedAt: null,
    createdFrom: 'manual_selection',
  };
}

let activeRoadNavigationSession: RoadNavigationSessionState = createEmptySession();
const activeRoadNavigationSessionListeners = new Set<() => void>();

function publishActiveRoadNavigationSession(session: RoadNavigationSessionState): void {
  if (activeRoadNavigationSession === session) return;
  activeRoadNavigationSession = session;
  activeRoadNavigationSessionListeners.forEach((listener) => listener());
}

export function getActiveRoadNavigationSession(): RoadNavigationSessionState {
  return activeRoadNavigationSession;
}

export function subscribeActiveRoadNavigationSession(listener: () => void): () => void {
  activeRoadNavigationSessionListeners.add(listener);
  return () => {
    activeRoadNavigationSessionListeners.delete(listener);
  };
}

export function useRoadNavigation(params: {
  accessToken: string | null;
  currentLocation: RoadNavigationLocation | null;
  enabled?: boolean;
  liveServicesEnabled?: boolean;
}): UseRoadNavigationOutput {
  const {
    accessToken,
    currentLocation,
    enabled = true,
    liveServicesEnabled = true,
  } = params;
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<RoadNavSearchSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [stepListExpanded, setStepListExpanded] = useState(false);
  const [session, setSession] = useState<RoadNavigationSessionState>(createEmptySession);
  const sessionRef = useRef(session);

  useEffect(() => {
    sessionRef.current = session;
    publishActiveRoadNavigationSession(session);
  }, [session]);

  const searchRequestIdRef = useRef(0);
  const sessionTokenRef = useRef(createRoadSearchSessionToken());
  const rerouteCooldownRef = useRef(0);
  const lowConfidenceHitCountRef = useRef(0);
  const tempDeviationHitCountRef = useRef(0);
  const offRouteHitCountRef = useRef(0);
  const rejoinHitCountRef = useRef(0);
  const arrivalHitCountRef = useRef(0);
  const restoreAttemptedRef = useRef(false);
  const inFlightRouteKeyRef = useRef<string | null>(null);
  const routeRequestSeqRef = useRef(0);
  const progressPersistenceRef = useRef<{
    snapshot: RoadNavigationProgressPersistenceSnapshot | null;
    lastPersistedAtMs: number | null;
  }>({
    snapshot: null,
    lastPersistedAtMs: null,
  });

  const clearSearchUi = useCallback(() => {
    searchRequestIdRef.current += 1;
    setQuery('');
    setSuggestions([]);
    setSearchLoading(false);
    setSearchError(null);
  }, []);

  const persistSession = useCallback(async (nextSession: RoadNavigationSessionState) => {
    if (
      nextSession.destination &&
      [
        'destination_selected',
        'route_preview',
        'navigation_active',
        'rerouting',
        'arrived',
      ].includes(nextSession.status)
    ) {
      const routeRequiresGeometry = nextSession.status !== 'destination_selected';
      const routeCacheKey = nextSession.route
        ? getRoadRouteGeometryCacheKey(nextSession.route)
        : null;
      const routeValidation = nextSession.route
        ? validateRouteGeometry(nextSession.route)
        : null;
      const routeGeometry =
        routeValidation?.valid && routeValidation.lineString
          ? routeGeometryLineStringToLatLng(routeValidation.lineString)
          : undefined;

      if (routeRequiresGeometry) {
        if (routeValidation?.valid && routeValidation.lineString) {
          cacheRouteGeometry(routeCacheKey, routeValidation.lineString);
          logRouteGeometryLifecycle('geometry_successfully_loaded', {
            routeId: nextSession.route?.id ?? null,
            cacheKey: routeCacheKey,
            phase: 'persist',
            source: 'road',
            status: nextSession.status,
            pointCount: routeValidation.pointCount,
            fingerprint: routeValidation.fingerprint,
          });
        } else {
          logRouteGeometryLifecycle(routeValidation?.reason ?? 'route_selected_geometry_missing', {
            routeId: nextSession.route?.id ?? null,
            cacheKey: routeCacheKey,
            phase: 'persist',
            source: 'road',
            status: nextSession.status,
            message: 'Road route state requires geometry before it can be persisted.',
          });
        }
      }

      await saveRoadNavigationSession({
        sessionId: nextSession.sessionId ?? randomSessionId(),
        destination: nextSession.destination,
        status: nextSession.status as
          | 'destination_selected'
          | 'route_preview'
          | 'navigation_active'
          | 'rerouting'
          | 'arrived',
        createdFrom: nextSession.createdFrom,
        updatedAt: new Date().toISOString(),
        routeId: nextSession.route?.id ?? null,
        routeGeometry,
        routeDistanceM: nextSession.route?.distanceM ?? null,
        routeDurationS: nextSession.route?.durationS ?? null,
        routeCreatedAt: nextSession.route?.createdAt ?? null,
        routeGeometryCacheKey: routeCacheKey,
        routeGeometryFingerprint: routeValidation?.fingerprint ?? null,
        activeGuidance: nextSession.activeGuidance,
      });
      return;
    }

    await clearRoadNavigationSession();
  }, []);

  const applyRoute = useCallback(
    (
      route: RoadNavRoute,
      nextStatus: Extract<RoadNavStatus, 'route_preview' | 'navigation_active' | 'rerouting' | 'arrived'>,
      destination: RoadNavDestination,
      createdFrom: RoadNavSourceType,
      rerouteCount?: number,
      routeAlternatives?: RoadNavRoute[],
      refreshReason?: ActiveGuidanceRefreshReason,
    ) => {
      const validGeometryRoute = ensureRoadRouteGeometry(route, {
        phase: 'apply',
        source: 'road',
        status: nextStatus,
      });
      const validRoute = validGeometryRoute ? ensureRoadNavRouteVersion(validGeometryRoute) : null;
      if (!validRoute) {
        setSession((prev) => ({
          ...prev,
          status: 'error',
          route: null,
          activeGuidance: null,
          routeAlternatives: [],
          error: 'Route geometry unavailable',
          routeStatusLabel: 'Route unavailable',
          routeConfidenceState: 'on_route',
          isOffRoute: false,
        }));
        return;
      }
      const validRoutes = (routeAlternatives?.length ? routeAlternatives : [validRoute])
        .map((candidate) => {
          const candidateWithGeometry = ensureRoadRouteGeometry(candidate, {
            phase: 'apply',
            source: 'road',
            status: nextStatus,
          });
          return candidateWithGeometry ? ensureRoadNavRouteVersion(candidateWithGeometry) : null;
        })
        .filter((candidate): candidate is RoadNavRoute => !!candidate)
        .slice(0, 3);
      const nextRouteAlternatives = validRoutes.some((candidate) => candidate.id === validRoute.id)
        ? validRoutes
        : [validRoute, ...validRoutes].slice(0, 3);

      setSession((prev) => {
        const computed = computeSessionFromRoute(validRoute, currentLocation, prev);
        const nextRerouteCount = rerouteCount ?? prev.rerouteCount;
        const routeAppliedFromReroute =
          nextStatus === 'navigation_active' &&
          (prev.status === 'rerouting' || nextRerouteCount > prev.rerouteCount);
        const activeGuidance =
          nextStatus === 'navigation_active' || nextStatus === 'arrived'
            ? buildActiveGuidanceStateFromRoadRoute({
                route: validRoute,
                refreshReason:
                  refreshReason ?? (routeAppliedFromReroute ? 'reroute' : 'initial'),
                refreshedAt: computed.updatedAt,
                currentStepIndex: computed.currentStepIndex,
              })
            : null;
        if (
          activeGuidance &&
          activeGuidance.routeVersion !== prev.activeGuidance?.routeVersion
        ) {
          logGuidanceDebug('[ECS Guidance] routeVersion updated', {
            routeId: activeGuidance.routeId,
            routeVersion: activeGuidance.routeVersion,
            refreshReason: activeGuidance.refreshReason,
          });
          logGuidanceDebug('[ECS Guidance] maneuvers replaced', {
            routeId: activeGuidance.routeId,
            routeVersion: activeGuidance.routeVersion,
            maneuverCount: activeGuidance.steps.length,
          });
        }
        const nextConfidenceState: RoadNavigationConfidenceState =
          nextStatus === 'arrived'
            ? 'arrived'
            : nextStatus === 'rerouting'
              ? 'rerouting'
              : routeAppliedFromReroute
                ? 'reroute_applied'
                : 'on_route';
        const nextSession: RoadNavigationSessionState = {
          ...prev,
          sessionId: prev.sessionId ?? randomSessionId(),
          status: nextStatus,
          destination,
          route: validRoute,
          activeGuidance,
          routeAlternatives: nextRouteAlternatives,
          rerouteCount: nextRerouteCount,
          error: null,
          createdFrom,
          routeConfidenceState: nextConfidenceState,
          routeStatusLabel: routeAppliedFromReroute
            ? 'Route updated'
            : getRouteStateLabel(nextStatus, nextConfidenceState, liveServicesEnabled),
          rerouteStatus: routeAppliedFromReroute
            ? 'reroute_applied'
            : nextStatus === 'rerouting'
              ? 'rerouting'
              : computed.activeGuidanceProgress?.offRouteStatus ?? 'on_route',
          lastRerouteError: null,
          completionReason: nextStatus === 'arrived' ? 'auto_arrival' : null,
          ...computed,
        };
        void persistSession(nextSession);
        return nextSession;
      });
    },
    [currentLocation, liveServicesEnabled, persistSession],
  );

  const requestRouteForDestination = useCallback(
    async (
      destination: RoadNavDestination,
      requestedStatus: Extract<RoadNavStatus, 'route_preview' | 'navigation_active' | 'rerouting'>,
      createdFrom: RoadNavSourceType,
      rerouteCount?: number,
      refreshReason?: ActiveGuidanceRefreshReason,
    ) => {
      if (!liveServicesEnabled) {
        throw new Error('Offline — route data unavailable');
      }
      if (!accessToken) {
        throw new Error('Mapbox token unavailable');
      }
      if (!currentLocation) {
        setSession((prev) => {
          const nextSession = {
            ...prev,
            sessionId: prev.sessionId ?? randomSessionId(),
            destination,
            status: 'destination_selected' as const,
            error: 'GPS required',
            routeConfidenceState: 'on_route' as const,
            routeStatusLabel: 'GPS required',
            completionReason: null,
            createdFrom,
          };
          void persistSession(nextSession);
          return nextSession;
        });
        return;
      }

      const routeKey = [
        destination.id,
        currentLocation.lat.toFixed(5),
        currentLocation.lng.toFixed(5),
        destination.coordinate.lat.toFixed(5),
        destination.coordinate.lng.toFixed(5),
        requestedStatus,
        rerouteCount ?? 0,
      ].join(':');

      if (inFlightRouteKeyRef.current === routeKey) {
        return;
      }

      inFlightRouteKeyRef.current = routeKey;
      const requestSeq = routeRequestSeqRef.current + 1;
      routeRequestSeqRef.current = requestSeq;
      setPreviewLoading(true);
      try {
        const routes = await withRouteRequestTimeout(
          fetchRoadRouteAlternatives({
            accessToken,
            origin: currentLocation,
            destination,
            rerouteGeneration: rerouteCount ?? 0,
          }),
        );

        if (
          routeRequestSeqRef.current !== requestSeq ||
          inFlightRouteKeyRef.current !== routeKey
        ) {
          logGuidanceDebug('[ECS Guidance] stale route response ignored', {
            requestSeq,
            activeRequestSeq: routeRequestSeqRef.current,
            routeKey,
            inFlightRouteKey: inFlightRouteKeyRef.current,
          });
          return;
        }

        const validRoutes = routes
          .map((candidate) =>
            ensureRoadRouteGeometry(candidate, {
              phase: 'fetch',
              source: 'road',
              status: requestedStatus,
            }),
          )
          .filter((candidate): candidate is RoadNavRoute => !!candidate)
          .slice(0, 3);
        const validRoute = validRoutes[0] ?? null;
        if (!validRoute) {
          throw new Error('Route geometry unavailable');
        }

        applyRoute(
          validRoute,
          requestedStatus,
          destination,
          createdFrom,
          rerouteCount,
          validRoutes,
          refreshReason,
        );
      } catch (error) {
        if (
          routeRequestSeqRef.current !== requestSeq ||
          inFlightRouteKeyRef.current !== routeKey
        ) {
          logGuidanceDebug('[ECS Guidance] stale route response ignored', {
            requestSeq,
            activeRequestSeq: routeRequestSeqRef.current,
            routeKey,
            inFlightRouteKey: inFlightRouteKeyRef.current,
            error: getRouteErrorMessage(error, 'Route request superseded'),
          });
          return;
        }
        throw error;
      } finally {
        if (inFlightRouteKeyRef.current === routeKey) {
          inFlightRouteKeyRef.current = null;
          setPreviewLoading(false);
        }
      }
    },
    [accessToken, applyRoute, currentLocation, liveServicesEnabled, persistSession],
  );

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    (async () => {
      const restored = await loadRoadNavigationSession();
      if (cancelled || restoreAttemptedRef.current || !restored) return;

      if (!isRestorableRoadSession(restored)) {
        restoreAttemptedRef.current = true;
        await clearRoadNavigationSession();
        return;
      }

      restoreAttemptedRef.current = true;
      const restoredRoute = buildCachedRoadRouteFromRestoredSession(restored, currentLocation);
      setSession((prev) => {
        const restoredStatus = restoredRoute ? restored.status : 'destination_selected';
        const computed = restoredRoute
          ? computeSessionFromRoute(restoredRoute, currentLocation, prev)
          : {
              currentStepIndex: 0,
              nextInstruction: null,
              nextInstructionDistanceM: null,
              remainingDistanceM: null,
              remainingDurationS: null,
              etaIso: null,
              offRouteDistanceM: null,
              distanceToDestinationM: null,
              activeGuidanceProgress: null,
              offRouteUpdateCount: 0,
              gpsAccuracyMeters: null,
              progressGeometry: [],
              updatedAt: restored.updatedAt,
            };

        return {
          ...prev,
          sessionId: restored.sessionId,
          destination: restored.destination,
          route: restoredRoute,
          activeGuidance: restored.activeGuidance
            ? withActiveGuidanceProgressSnapshot(
                {
                  ...restored.activeGuidance,
                  refreshReason: 'restored_session',
                },
                computed.activeGuidanceProgress,
              )
            : restoredRoute && restoredStatus === 'navigation_active'
              ? buildActiveGuidanceStateFromRoadRoute({
                  route: restoredRoute,
                  refreshReason: 'restored_session',
                  refreshedAt: restored.updatedAt,
                  currentStepIndex: computed.currentStepIndex,
                })
              : null,
          routeAlternatives: restoredRoute ? [restoredRoute] : [],
          status: restoredStatus,
          error: restoredRoute || currentLocation ? null : 'GPS required',
          createdFrom: 'restored_session',
          routeStatusLabel: restoredRoute
            ? restored.status === 'navigation_active'
              ? 'Restoring guidance'
              : restored.status === 'route_preview'
                ? 'Restoring route'
                : null
            : currentLocation
              ? 'Restoring route'
              : 'GPS required',
          ...computed,
        };
      });
      clearSearchUi();
    })();

    return () => {
      cancelled = true;
    };
  }, [clearSearchUi, currentLocation, enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!session.destination) return;
    if (!accessToken || !currentLocation || !liveServicesEnabled) return;
    if (session.route) return;
    if (!['destination_selected', 'route_preview', 'navigation_active', 'rerouting'].includes(session.status)) {
      return;
    }

    void requestRouteForDestination(
      session.destination,
      session.status === 'navigation_active' ? 'navigation_active' : 'route_preview',
      session.createdFrom === 'restored_session' ? 'restored_session' : session.createdFrom,
      session.rerouteCount,
      session.status === 'navigation_active' ? 'restored_session' : undefined,
    ).catch((error: unknown) => {
      setSession((prev) => {
        if (!prev.destination || prev.route) return prev;
        return {
          ...prev,
          status: 'error',
          error: getRouteErrorMessage(error, 'Route restore unavailable'),
          routeStatusLabel: 'Route unavailable',
        };
      });
    });
  }, [
    accessToken,
    currentLocation,
    enabled,
    requestRouteForDestination,
    session.createdFrom,
    session.destination,
    session.route,
    session.rerouteCount,
    session.status,
    liveServicesEnabled,
  ]);

  useEffect(() => {
    if (!enabled) return;

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchLoading(false);
      setSearchError(null);
      setSuggestions([]);
      return;
    }

    if (!accessToken || !liveServicesEnabled) {
      setSearchLoading(false);
      setSuggestions([]);
      setSearchError(
        liveServicesEnabled ? 'Search unavailable' : 'Search unavailable offline',
      );
      return;
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    setSearchLoading(true);
    setSearchError(null);

    const timer = setTimeout(() => {
      void searchRoadDestinations({
        accessToken,
        query: trimmed,
        sessionToken: sessionTokenRef.current,
        proximity: currentLocation,
      })
        .then((results) => {
          if (searchRequestIdRef.current !== requestId) return;
          setSuggestions(results);
          if (results.length === 0) {
            setSearchError('No results found');
          }
        })
        .catch((error: unknown) => {
          if (searchRequestIdRef.current !== requestId) return;
          setSuggestions([]);
          setSearchError(
            error instanceof Error ? error.message : 'Search unavailable',
          );
        })
        .finally(() => {
          if (searchRequestIdRef.current === requestId) {
            setSearchLoading(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [accessToken, currentLocation, enabled, liveServicesEnabled, query]);

  const selectSuggestion = useCallback(
    async (suggestion: RoadNavSearchSuggestion) => {
      if (!accessToken || !liveServicesEnabled) {
        setSearchError(
          liveServicesEnabled ? 'Search unavailable' : 'Search unavailable offline',
        );
        return;
      }

      setSearchLoading(true);
      setSearchError(null);

      try {
        const destination = await resolveRoadDestination({
          accessToken,
          sessionToken: sessionTokenRef.current,
          suggestion,
        });

        clearSearchUi();
        setSession((prev) => ({
          ...prev,
          sessionId: randomSessionId(),
          destination,
          route: null,
          activeGuidance: null,
          routeAlternatives: [],
          status: 'destination_selected',
          error: currentLocation ? null : 'GPS required',
          currentStepIndex: 0,
          nextInstruction: null,
          nextInstructionDistanceM: null,
          remainingDistanceM: null,
          remainingDurationS: null,
          etaIso: null,
          routeStatusLabel: currentLocation ? 'Preparing route' : 'GPS required',
          routeConfidenceState: 'on_route',
          offRouteDistanceM: null,
          distanceToDestinationM: null,
          activeGuidanceProgress: null,
          offRouteUpdateCount: 0,
          gpsAccuracyMeters: null,
          rerouteStatus: 'on_route',
          lastRerouteError: null,
          completionReason: null,
          progressGeometry: [],
          rerouteCount: 0,
          createdFrom: suggestion.sourceType,
        }));

        await requestRouteForDestination(
          destination,
          'route_preview',
          suggestion.sourceType,
          0,
        );
      } catch (error) {
        setSession((prev) => ({
          ...prev,
          status: 'error',
          error: getRouteErrorMessage(error, 'Destination could not be resolved'),
        }));
      } finally {
        setSearchLoading(false);
      }
    },
    [accessToken, clearSearchUi, currentLocation, liveServicesEnabled, requestRouteForDestination],
  );

  const previewDestination = useCallback(
    async (
      destination: RoadNavDestination,
      createdFrom: RoadNavSourceType = 'manual_selection',
    ) => {
      clearSearchUi();
      setStepListExpanded(false);

      setSession((prev) => ({
        ...prev,
        sessionId: randomSessionId(),
        destination,
        route: null,
        activeGuidance: null,
        routeAlternatives: [],
        status: 'destination_selected',
        error: currentLocation ? null : 'GPS required',
        currentStepIndex: 0,
        nextInstruction: null,
        nextInstructionDistanceM: null,
        remainingDistanceM: null,
        remainingDurationS: null,
        etaIso: null,
        routeStatusLabel: currentLocation ? 'Preparing route' : 'GPS required',
        routeConfidenceState: 'on_route',
        offRouteDistanceM: null,
        distanceToDestinationM: null,
        activeGuidanceProgress: null,
        offRouteUpdateCount: 0,
        gpsAccuracyMeters: null,
        rerouteStatus: 'on_route',
        lastRerouteError: null,
        completionReason: null,
        progressGeometry: [],
        rerouteCount: 0,
        createdFrom,
      }));

      try {
        await requestRouteForDestination(destination, 'route_preview', createdFrom, 0);
      } catch (error) {
        setSession((prev) => ({
          ...prev,
          status: 'error',
          error: getRouteErrorMessage(error, 'Route preview unavailable'),
        }));
      }
    },
    [clearSearchUi, currentLocation, requestRouteForDestination],
  );

  const previewRoute = useCallback(
    async (
      route: RoadNavRoute,
      createdFrom: RoadNavSourceType = 'manual_selection',
    ) => {
      clearSearchUi();
      setStepListExpanded(false);
      applyRoute(route, 'route_preview', route.destination, createdFrom, 0);
    },
    [applyRoute, clearSearchUi],
  );

  const selectRouteAlternative = useCallback(
    (routeId: string) => {
      const activeSession = sessionRef.current;
      if (activeSession.status !== 'route_preview' || !activeSession.destination) return;
      const selectedRoute = activeSession.routeAlternatives.find((route) => route.id === routeId);
      if (!selectedRoute || selectedRoute.id === activeSession.route?.id) return;
      applyRoute(
        selectedRoute,
        'route_preview',
        activeSession.destination,
        activeSession.createdFrom,
        activeSession.rerouteCount,
        activeSession.routeAlternatives,
      );
    },
    [applyRoute],
  );

  const reroute = useCallback(
    async (_reason = 'off_route') => {
      const activeSession = sessionRef.current;
      if (!activeSession.destination) return;
      if (!currentLocation) return;
      if (!accessToken || !liveServicesEnabled) {
        const failureMessage = 'Unable to recalculate route';
        setSession((prev) => ({
          ...prev,
          status: 'navigation_active',
          error: failureMessage,
          routeConfidenceState: 'reroute_failed',
          routeStatusLabel: failureMessage,
          nextInstruction: 'Return to the highlighted route when safe',
          isOffRoute: true,
          rerouteStatus: 'reroute_failed',
          lastRerouteError: failureMessage,
        }));
        return;
      }

      const nextRerouteCount = activeSession.rerouteCount + 1;
      rerouteCooldownRef.current = Date.now();
      setSession((prev) => ({
        ...prev,
        status: 'rerouting',
        error: null,
        routeConfidenceState: 'rerouting',
        routeStatusLabel: 'Recalculating route...',
        rerouteCount: nextRerouteCount,
        rerouteStatus: 'rerouting',
        lastRerouteError: null,
        completionReason: null,
      }));

      try {
        await requestRouteForDestination(
          activeSession.destination,
          'navigation_active',
          activeSession.createdFrom,
          nextRerouteCount,
          normalizeActiveGuidanceRefreshReason(_reason),
        );
      } catch (error) {
        const failureMessage = getRouteErrorMessage(error, 'Unable to recalculate route');
        setSession((prev) => ({
          ...prev,
          status: 'navigation_active',
          error: failureMessage,
          routeConfidenceState: 'reroute_failed',
          routeStatusLabel: 'Unable to recalculate route',
          nextInstruction: 'Return to the highlighted route when safe',
          isOffRoute: true,
          rerouteStatus: 'reroute_failed',
          lastRerouteError: failureMessage,
        }));
      }
    },
    [
      accessToken,
      currentLocation,
      liveServicesEnabled,
      requestRouteForDestination,
    ],
  );

  useEffect(() => {
    const activeSession = sessionRef.current;
    if (!currentLocation || !activeSession.route) return;
    if (!['route_preview', 'navigation_active', 'rerouting', 'arrived'].includes(activeSession.status)) {
      return;
    }

    const computed = computeSessionFromRoute(activeSession.route, currentLocation, activeSession);
    const accuracyPad = getAccuracyPadMeters(currentLocation);
    const speedMph = getSpeedMph(currentLocation);
    const lowSpeed = speedMph > 0 && speedMph < 4;
    const lowConfidenceThreshold = LOW_CONFIDENCE_DISTANCE_M + accuracyPad * 0.45;
    const tempDeviationThreshold = TEMP_DEVIATION_DISTANCE_M + accuracyPad * 0.75;
    const offRouteThreshold = MATERIAL_OFF_ROUTE_DISTANCE_M + accuracyPad;
    const rejoinThreshold = REJOIN_DISTANCE_M + accuracyPad * 0.35;
    const approachThreshold = APPROACH_DISTANCE_M + Math.min(accuracyPad, 20);
    const arrivalThreshold = Math.max(ARRIVAL_DISTANCE_M, 30 + accuracyPad * 0.35);

    const offRouteDistance = computed.offRouteDistanceM ?? Infinity;
    const guidanceOffRouteStatus =
      computed.activeGuidanceProgress?.offRouteStatus ?? 'on_route';
    const remainingDistance = computed.remainingDistanceM ?? Infinity;
    const distanceToDestination = computed.distanceToDestinationM ?? Infinity;
    const arrivedCandidate =
      remainingDistance <= arrivalThreshold || distanceToDestination <= arrivalThreshold;
    const approachingCandidate =
      !arrivedCandidate &&
      (remainingDistance <= approachThreshold || distanceToDestination <= approachThreshold);
    const recoveringStates: RoadNavigationConfidenceState[] = [
      'low_confidence',
      'temporary_deviation',
      'off_route',
      'off_route_candidate',
      'off_route_confirmed',
      'rerouting',
      'reroute_failed',
      'reroute_applied',
      'rejoined',
    ];
    const wasRecovering = recoveringStates.includes(activeSession.routeConfidenceState);

    let nextConfidenceState: RoadNavigationConfidenceState = activeSession.routeConfidenceState;

    if (activeSession.status === 'rerouting') {
      nextConfidenceState = 'rerouting';
      lowConfidenceHitCountRef.current = 0;
      tempDeviationHitCountRef.current = 0;
      rejoinHitCountRef.current = 0;
      arrivalHitCountRef.current = 0;
    } else if (arrivedCandidate) {
      arrivalHitCountRef.current += 1;
      lowConfidenceHitCountRef.current = 0;
      tempDeviationHitCountRef.current = 0;
      offRouteHitCountRef.current = 0;
      rejoinHitCountRef.current = 0;
      nextConfidenceState =
        arrivalHitCountRef.current >= ARRIVAL_CONFIRMATION_COUNT ? 'arrived' : 'approaching';
    } else if (approachingCandidate) {
      arrivalHitCountRef.current = 0;
      lowConfidenceHitCountRef.current = 0;
      tempDeviationHitCountRef.current = 0;
      offRouteHitCountRef.current = 0;
      rejoinHitCountRef.current = 0;
      nextConfidenceState = 'approaching';
    } else if (guidanceOffRouteStatus === 'off_route_confirmed') {
      arrivalHitCountRef.current = 0;
      lowConfidenceHitCountRef.current = 0;
      tempDeviationHitCountRef.current = 0;
      rejoinHitCountRef.current = 0;
      offRouteHitCountRef.current = computed.activeGuidanceProgress?.offRouteUpdateCount ?? 0;
      nextConfidenceState = 'off_route_confirmed';
    } else if (guidanceOffRouteStatus === 'off_route_candidate') {
      arrivalHitCountRef.current = 0;
      lowConfidenceHitCountRef.current = 0;
      tempDeviationHitCountRef.current = 0;
      rejoinHitCountRef.current = 0;
      offRouteHitCountRef.current = computed.activeGuidanceProgress?.offRouteUpdateCount ?? 1;
      nextConfidenceState = 'off_route_candidate';
    } else if (offRouteDistance <= rejoinThreshold && wasRecovering) {
      arrivalHitCountRef.current = 0;
      lowConfidenceHitCountRef.current = 0;
      tempDeviationHitCountRef.current = 0;
      offRouteHitCountRef.current = 0;
      rejoinHitCountRef.current += 1;
      nextConfidenceState =
        rejoinHitCountRef.current >= REJOIN_CONFIRMATION_COUNT ? 'rejoined' : 'low_confidence';
    } else if (offRouteDistance <= lowConfidenceThreshold) {
      arrivalHitCountRef.current = 0;
      lowConfidenceHitCountRef.current = 0;
      tempDeviationHitCountRef.current = 0;
      offRouteHitCountRef.current = 0;
      rejoinHitCountRef.current = 0;
      nextConfidenceState =
        activeSession.routeConfidenceState === 'rejoined' ? 'on_route' : 'on_route';
    } else if (offRouteDistance <= tempDeviationThreshold) {
      arrivalHitCountRef.current = 0;
      offRouteHitCountRef.current = 0;
      rejoinHitCountRef.current = 0;
      tempDeviationHitCountRef.current = 0;
      lowConfidenceHitCountRef.current += 1;
      nextConfidenceState =
        lowConfidenceHitCountRef.current >= LOW_CONFIDENCE_CONFIRMATION_COUNT
          ? 'low_confidence'
          : activeSession.routeConfidenceState === 'temporary_deviation'
            ? 'temporary_deviation'
            : 'on_route';
    } else if (offRouteDistance <= offRouteThreshold || lowSpeed) {
      arrivalHitCountRef.current = 0;
      lowConfidenceHitCountRef.current = 0;
      offRouteHitCountRef.current = 0;
      rejoinHitCountRef.current = 0;
      tempDeviationHitCountRef.current += 1;
      nextConfidenceState =
        tempDeviationHitCountRef.current >= TEMP_DEVIATION_CONFIRMATION_COUNT
          ? 'temporary_deviation'
          : activeSession.routeConfidenceState === 'off_route'
            ? 'off_route'
            : 'low_confidence';
    } else {
      arrivalHitCountRef.current = 0;
      lowConfidenceHitCountRef.current = 0;
      tempDeviationHitCountRef.current = 0;
      rejoinHitCountRef.current = 0;
      offRouteHitCountRef.current += 1;
      nextConfidenceState =
        offRouteHitCountRef.current >= OFF_ROUTE_CONFIRMATION_COUNT
          ? 'off_route'
          : 'temporary_deviation';
    }

    const nextRouteStatusLabel = getRouteStateLabel(
      activeSession.status === 'rerouting' ? 'rerouting' : activeSession.status === 'arrived' ? 'arrived' : activeSession.status === 'route_preview' ? 'route_preview' : 'navigation_active',
      nextConfidenceState,
      liveServicesEnabled,
    );
    const nextCompletionReason: RoadNavigationCompletionReason =
      activeSession.status === 'navigation_active' && nextConfidenceState === 'arrived'
        ? 'auto_arrival'
        : null;
    const nextIsOffRoute =
      nextConfidenceState === 'temporary_deviation' ||
      nextConfidenceState === 'off_route' ||
      nextConfidenceState === 'off_route_candidate' ||
      nextConfidenceState === 'off_route_confirmed' ||
      nextConfidenceState === 'rerouting';
    const nextRerouteStatus: EcsActiveGuidanceOffRouteStatus =
      nextConfidenceState === 'rerouting'
        ? 'rerouting'
        : computed.activeGuidanceProgress?.offRouteStatus ?? 'on_route';

    const progressPersistNowMs = Date.now();

    setSession((prev) => {
      const nextStatus =
        prev.status === 'navigation_active' && nextConfidenceState === 'arrived'
          ? 'arrived'
          : prev.status;
      const nextActiveGuidance = withActiveGuidanceProgressSnapshot(
        prev.activeGuidance,
        computed.activeGuidanceProgress,
      );
      const noMeaningfulChange =
        prev.currentStepIndex === computed.currentStepIndex &&
        prev.nextInstruction === computed.nextInstruction &&
        sameNullableNumber(prev.nextInstructionDistanceM, computed.nextInstructionDistanceM, 1) &&
        sameNullableNumber(prev.remainingDistanceM, computed.remainingDistanceM, 1) &&
        sameNullableNumber(prev.remainingDurationS, computed.remainingDurationS, 1) &&
        prev.routeStatusLabel === nextRouteStatusLabel &&
        prev.routeConfidenceState === nextConfidenceState &&
        sameNullableNumber(prev.offRouteDistanceM, computed.offRouteDistanceM, 1) &&
        sameNullableNumber(prev.distanceToDestinationM, computed.distanceToDestinationM, 1) &&
        prev.offRouteUpdateCount === computed.offRouteUpdateCount &&
        sameNullableNumber(prev.gpsAccuracyMeters, computed.gpsAccuracyMeters, 1) &&
        prev.rerouteStatus === nextRerouteStatus &&
        prev.isOffRoute === nextIsOffRoute &&
        prev.completionReason === nextCompletionReason &&
        prev.status === nextStatus &&
        prev.activeGuidance === nextActiveGuidance &&
        sameGeometry(prev.progressGeometry, computed.progressGeometry);

      if (noMeaningfulChange) {
        return prev;
      }

      const nextSession = {
        ...prev,
        ...computed,
        activeGuidance: nextActiveGuidance,
        status: nextStatus,
        routeConfidenceState: nextConfidenceState,
        routeStatusLabel: nextRouteStatusLabel,
        isOffRoute: nextIsOffRoute,
        rerouteStatus: nextRerouteStatus,
        completionReason: nextCompletionReason,
      };
      const nextProgressPersistenceSnapshot =
        buildRoadNavigationProgressPersistenceSnapshot(nextSession);
      const shouldPersistProgress = shouldPersistRoadNavigationProgressUpdate({
        previous: progressPersistenceRef.current.snapshot,
        next: nextProgressPersistenceSnapshot,
        nowMs: progressPersistNowMs,
        lastPersistedAtMs: progressPersistenceRef.current.lastPersistedAtMs,
      });
      if (shouldPersistProgress) {
        progressPersistenceRef.current = {
          snapshot: nextProgressPersistenceSnapshot,
          lastPersistedAtMs: progressPersistNowMs,
        };
        void persistSession(nextSession);
      }
      return nextSession;
    });

    if (activeSession.status === 'navigation_active') {
      if (
        nextConfidenceState === 'off_route_confirmed' &&
        progressPersistNowMs - rerouteCooldownRef.current >= REROUTE_COOLDOWN_MS
      ) {
        offRouteHitCountRef.current = 0;
        if (liveServicesEnabled) {
          void reroute('off_route');
        }
      }
    }
  }, [
    currentLocation,
    liveServicesEnabled,
    persistSession,
    reroute,
    session.route,
    session.routeConfidenceState,
    session.status,
  ]);

  const startNavigation = useCallback(() => {
    if (!session.route || !session.destination) return;
    const validGeometryRoute = ensureRoadRouteGeometry(session.route, {
      phase: 'start',
      source: 'road',
      status: 'navigation_active',
    });
    const validRoute = validGeometryRoute ? ensureRoadNavRouteVersion(validGeometryRoute) : null;
    if (!validRoute) {
      setSession((prev) => ({
        ...prev,
        status: 'error',
        route: null,
        activeGuidance: null,
        routeAlternatives: [],
        error: 'Route geometry unavailable',
        routeStatusLabel: 'Route unavailable',
      }));
      return;
    }

    lowConfidenceHitCountRef.current = 0;
    tempDeviationHitCountRef.current = 0;
    offRouteHitCountRef.current = 0;
    rejoinHitCountRef.current = 0;
    arrivalHitCountRef.current = 0;
    progressPersistenceRef.current = {
      snapshot: null,
      lastPersistedAtMs: null,
    };
    setStepListExpanded(false);
    setSession((prev) => {
      const activeGuidance = buildActiveGuidanceStateFromRoadRoute({
        route: validRoute,
        refreshReason: 'initial',
        refreshedAt: new Date().toISOString(),
        currentStepIndex: prev.currentStepIndex,
      });
      if (activeGuidance.routeVersion !== prev.activeGuidance?.routeVersion) {
        logGuidanceDebug('[ECS Guidance] routeVersion updated', {
          routeId: activeGuidance.routeId,
          routeVersion: activeGuidance.routeVersion,
          refreshReason: activeGuidance.refreshReason,
        });
        logGuidanceDebug('[ECS Guidance] maneuvers replaced', {
          routeId: activeGuidance.routeId,
          routeVersion: activeGuidance.routeVersion,
          maneuverCount: activeGuidance.steps.length,
        });
      }
      const nextSession = {
        ...prev,
        status: 'navigation_active' as const,
        route: validRoute,
        activeGuidance,
        routeAlternatives: prev.routeAlternatives.length ? prev.routeAlternatives : [validRoute],
        routeStatusLabel: 'Route active',
        routeConfidenceState: 'on_route' as const,
        offRouteUpdateCount: 0,
        gpsAccuracyMeters: currentLocation?.accuracyM ?? null,
        rerouteStatus: 'on_route' as const,
        lastRerouteError: null,
        completionReason: null,
        error: null,
      };
      void persistSession(nextSession);
      return nextSession;
    });
  }, [currentLocation, persistSession, session.destination, session.route]);

  const clearDestination = useCallback(async () => {
    routeRequestSeqRef.current += 1;
    inFlightRouteKeyRef.current = null;
    sessionTokenRef.current = createRoadSearchSessionToken();
    lowConfidenceHitCountRef.current = 0;
    tempDeviationHitCountRef.current = 0;
    offRouteHitCountRef.current = 0;
    rejoinHitCountRef.current = 0;
    arrivalHitCountRef.current = 0;
    setStepListExpanded(false);
    setPreviewLoading(false);
    clearSearchUi();
    setSession(createEmptySession());
    await clearRoadNavigationSession();
  }, [clearSearchUi]);

  const endNavigation = useCallback(async () => {
    await clearDestination();
  }, [clearDestination]);

  const rehydrateActiveGuidance = useCallback(
    async (reason: ActiveGuidanceRefreshReason = 'screen_focus') => {
      const restored = await loadRoadNavigationSession();
      if (!restored?.activeGuidance || !isRestorableRoadSession(restored)) return;

      setSession((prev) => {
        if (!prev.destination || !['navigation_active', 'rerouting', 'arrived'].includes(prev.status)) {
          return prev;
        }

        const activeGuidance: ActiveGuidanceState = {
          ...restored.activeGuidance!,
          refreshReason: reason,
          refreshedAt: new Date().toISOString(),
        };
        const restoredRefreshMs = Date.parse(restored.activeGuidance!.refreshedAt);
        const currentRefreshMs = Date.parse(prev.activeGuidance?.refreshedAt ?? '');
        if (
          prev.activeGuidance &&
          prev.activeGuidance.routeVersion !== activeGuidance.routeVersion &&
          Number.isFinite(currentRefreshMs) &&
          (!Number.isFinite(restoredRefreshMs) || restoredRefreshMs <= currentRefreshMs)
        ) {
          logGuidanceDebug('[ECS Guidance] stale guidance prevented', {
            currentRouteVersion: prev.activeGuidance.routeVersion,
            restoredRouteVersion: activeGuidance.routeVersion,
            currentRefreshedAt: prev.activeGuidance.refreshedAt,
            restoredRefreshedAt: restored.activeGuidance!.refreshedAt,
          });
          return prev;
        }
        const routeAlreadyHydrated =
          prev.activeGuidance?.routeVersion === activeGuidance.routeVersion &&
          prev.activeGuidance?.refreshReason === activeGuidance.refreshReason &&
          prev.route?.guidance?.id === activeGuidance.routeId &&
          prev.route.guidance.steps.length === activeGuidance.steps.length &&
          sameGeometry(prev.route.geometry, activeGuidance.geometry);

        if (routeAlreadyHydrated) {
          return prev;
        }

        const baseRoute =
          prev.route ??
          buildCachedRoadRouteFromRestoredSession(
            {
              ...restored,
              activeGuidance,
            },
            currentLocation,
          );
        if (!baseRoute) return prev;

        const nextRoute = ensureRoadRouteGeometry(
          applyActiveGuidanceStateToRoadRoute(baseRoute, activeGuidance),
          {
            phase: 'focus_rehydrate',
            source: 'road',
            status: prev.status,
          },
        );
        if (!nextRoute) return prev;

        const computed = computeSessionFromRoute(nextRoute, currentLocation, prev);
        const nextActiveGuidance = withActiveGuidanceProgressSnapshot(
          activeGuidance,
          computed.activeGuidanceProgress,
        );
        const nextRouteAlternatives = prev.routeAlternatives.some((route) => route.id === nextRoute.id)
          ? prev.routeAlternatives.map((route) =>
              route.id === nextRoute.id
                ? nextRoute
                : route,
            )
          : [nextRoute, ...prev.routeAlternatives].slice(0, 3);
        const nextSession = {
          ...prev,
          route: nextRoute,
          routeAlternatives: nextRouteAlternatives,
          activeGuidance: nextActiveGuidance,
          ...computed,
        };

        logGuidanceDebug('[ECS Guidance] focus rehydrate', {
          routeId: nextActiveGuidance?.routeId ?? activeGuidance.routeId,
          routeVersion: nextActiveGuidance?.routeVersion ?? activeGuidance.routeVersion,
          refreshReason: reason,
        });
        void persistSession(nextSession);
        return nextSession;
      });
    },
    [currentLocation, persistSession],
  );

  const uiMode = useMemo(() => {
    if (session.status === 'navigation_active' || session.status === 'rerouting') {
      return 'active';
    }
    if (session.status === 'arrived') {
      return 'arrived';
    }
    if (session.status === 'error') {
      return 'error';
    }
    if (session.route || session.destination) {
      return 'preview';
    }
    if (query.trim().length > 0 || searchLoading || suggestions.length > 0) {
      return 'search';
    }
    return 'idle';
  }, [query, searchLoading, session.destination, session.route, session.status, suggestions.length]);

  return {
    query,
    setQuery,
    suggestions,
    searchLoading,
    searchError,
    session,
    previewLoading,
    stepListExpanded,
    setStepListExpanded,
    uiMode,
    hasSearchResults: suggestions.length > 0,
    selectSuggestion,
    previewDestination,
    previewRoute,
    selectRouteAlternative,
    startNavigation,
    endNavigation,
    clearDestination,
    reroute,
    rehydrateActiveGuidance,
  };
}
