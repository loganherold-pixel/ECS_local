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
  fetchRoadRoute,
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
  cacheRouteGeometry,
  getCachedRouteGeometry,
  getRouteGeometryCacheKey,
  logRouteGeometryLifecycle,
  routeGeometryLineStringToLatLng,
  validateRouteGeometry,
} from './routeGeometryLifecycle';

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

export type RoadNavigationConfidenceState =
  | 'on_route'
  | 'low_confidence'
  | 'temporary_deviation'
  | 'off_route'
  | 'rerouting'
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
  routeConfidenceState: RoadNavigationConfidenceState;
  offRouteDistanceM: number | null;
  distanceToDestinationM: number | null;
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
  startNavigation: () => void;
  endNavigation: () => Promise<void>;
  clearDestination: () => Promise<void>;
  reroute: (reason?: string) => Promise<void>;
}

type GeometryProgress = {
  nearestIndex: number;
  progressCoords: RoadNavCoordinate[];
  traveledDistanceM: number;
  remainingDistanceM: number;
  offRouteDistanceM: number;
  distanceToDestinationM: number;
};

type RoadNavigationLocation = RoadNavCoordinate & {
  accuracyM?: number | null;
  speedMph?: number | null;
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

function toMetersDeltaLat(latDelta: number): number {
  return latDelta * 111320;
}

function toMetersDeltaLng(lngDelta: number, latitude: number): number {
  return lngDelta * 111320 * Math.cos((latitude * Math.PI) / 180);
}

function distanceMeters(a: RoadNavCoordinate, b: RoadNavCoordinate): number {
  const dLat = toMetersDeltaLat(b.lat - a.lat);
  const dLng = toMetersDeltaLng(b.lng - a.lng, (a.lat + b.lat) / 2);
  return Math.sqrt(dLat ** 2 + dLng ** 2);
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
    case 'low_confidence':
      return 'GPS settling';
    case 'temporary_deviation':
      return 'Route adjusting';
    case 'off_route':
      return liveServicesEnabled ? 'Off route' : 'Rejoin route';
    case 'rerouting':
      return liveServicesEnabled ? 'Updating route' : 'Rejoin route';
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

  return ensureRoadRouteGeometry(route, {
    phase: 'restore',
    source: 'road',
    status: restored.status,
    fallbackCacheKey: cacheKey,
  });
}

function buildCumulativeDistances(points: RoadNavCoordinate[]): number[] {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative[i] = cumulative[i - 1] + distanceMeters(points[i - 1], points[i]);
  }
  return cumulative;
}

function isArrivalLikeInstruction(instruction: string | null | undefined): boolean {
  const normalized = String(instruction ?? '').trim().toLowerCase();
  return normalized.includes('arrive') || normalized.includes('destination');
}

function selectGuidanceStep(
  steps: RoadNavRoute['steps'],
  currentStepIndex: number,
): { stepIndex: number; step: RoadNavRoute['steps'][number] | null } {
  if (steps.length === 0) {
    return { stepIndex: 0, step: null };
  }

  const resolvedCurrentIndex = clamp(currentStepIndex, 0, steps.length - 1);
  const currentStep = steps[resolvedCurrentIndex] ?? null;
  if (!currentStep) {
    return { stepIndex: resolvedCurrentIndex, step: null };
  }

  const lastIndex = steps.length - 1;
  if (
    resolvedCurrentIndex >= lastIndex ||
    currentStep.maneuverType === 'arrive' ||
    isArrivalLikeInstruction(currentStep.instruction)
  ) {
    return { stepIndex: resolvedCurrentIndex, step: currentStep };
  }

  return {
    stepIndex: resolvedCurrentIndex + 1,
    step: steps[resolvedCurrentIndex + 1] ?? currentStep,
  };
}

function projectProgressOnRoute(
  location: RoadNavCoordinate,
  points: RoadNavCoordinate[],
  cumulativeDistances: number[],
): GeometryProgress {
  if (points.length === 0) {
    return {
      nearestIndex: 0,
      progressCoords: [],
      traveledDistanceM: 0,
      remainingDistanceM: 0,
      offRouteDistanceM: Infinity,
      distanceToDestinationM: Infinity,
    };
  }

  if (points.length === 1) {
    const distanceToDestinationM = distanceMeters(location, points[0]);
    return {
      nearestIndex: 0,
      progressCoords: [points[0]],
      traveledDistanceM: 0,
      remainingDistanceM: 0,
      offRouteDistanceM: distanceToDestinationM,
      distanceToDestinationM,
    };
  }

  let bestDistanceM = Infinity;
  let bestNearestIndex = 0;
  let bestAlongDistanceM = 0;
  let bestProjection = points[0];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const referenceLat = (start.lat + end.lat + location.lat) / 3;

    const bx = toMetersDeltaLng(end.lng - start.lng, referenceLat);
    const by = toMetersDeltaLat(end.lat - start.lat);
    const px = toMetersDeltaLng(location.lng - start.lng, referenceLat);
    const py = toMetersDeltaLat(location.lat - start.lat);
    const segmentLengthSquared = bx * bx + by * by;
    const tRaw =
      segmentLengthSquared > 0 ? (px * bx + py * by) / segmentLengthSquared : 0;
    const t = clamp(tRaw, 0, 1);
    const projectionX = bx * t;
    const projectionY = by * t;
    const distanceFromSegmentM = Math.sqrt(
      (px - projectionX) ** 2 + (py - projectionY) ** 2,
    );

    if (distanceFromSegmentM < bestDistanceM) {
      bestDistanceM = distanceFromSegmentM;
      bestNearestIndex = i + (t >= 0.5 ? 1 : 0);
      bestAlongDistanceM =
        cumulativeDistances[i] + Math.sqrt(projectionX ** 2 + projectionY ** 2);
      bestProjection = {
        lat: start.lat + (end.lat - start.lat) * t,
        lng: start.lng + (end.lng - start.lng) * t,
      };
    }
  }

  const progressCoords = points.slice(0, Math.max(bestNearestIndex, 1));
  progressCoords.push(bestProjection);

  const totalDistanceM = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;
  const remainingDistanceM = Math.max(totalDistanceM - bestAlongDistanceM, 0);

  return {
    nearestIndex: bestNearestIndex,
    progressCoords,
    traveledDistanceM: bestAlongDistanceM,
    remainingDistanceM,
    offRouteDistanceM: bestDistanceM,
    distanceToDestinationM: distanceMeters(location, points[points.length - 1]),
  };
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
      progressGeometry: [],
      updatedAt: nowIso,
    };
  }

  const cumulativeDistances = buildCumulativeDistances(route.geometry);
  const progress = projectProgressOnRoute(location, route.geometry, cumulativeDistances);
  const currentStepIndex = route.steps.findIndex(
    (step) => progress.traveledDistanceM < step.endDistanceM,
  );
  const resolvedStepIndex =
    currentStepIndex >= 0 ? currentStepIndex : Math.max(route.steps.length - 1, 0);
  const currentStep = route.steps[resolvedStepIndex] ?? null;
  const guidanceStepSelection = selectGuidanceStep(route.steps, resolvedStepIndex);
  const distanceToNextM =
    currentStep != null
      ? Math.max(currentStep.endDistanceM - progress.traveledDistanceM, 0)
      : guidanceStepSelection.step != null
        ? Math.max(
            guidanceStepSelection.step.endDistanceM - progress.traveledDistanceM,
            0,
          )
        : null;
  const remainingDistanceM = progress.remainingDistanceM;
  const remainingDurationS =
    route.distanceM > 0
      ? Math.max((route.durationS * remainingDistanceM) / route.distanceM, 0)
      : 0;
  const etaIso =
    remainingDurationS > 0
      ? new Date(Date.now() + remainingDurationS * 1000).toISOString()
      : null;

  return {
    currentStepIndex: resolvedStepIndex,
    nextInstruction: guidanceStepSelection.step?.instruction ?? currentStep?.instruction ?? null,
    nextInstructionDistanceM: distanceToNextM,
    remainingDistanceM,
    remainingDurationS,
    etaIso,
    offRouteDistanceM: progress.offRouteDistanceM,
    distanceToDestinationM: progress.distanceToDestinationM,
    progressGeometry: progress.progressCoords,
    updatedAt: nowIso,
  };
}

function createEmptySession(): RoadNavigationSessionState {
  return {
    sessionId: null,
    status: 'idle',
    destination: null,
    route: null,
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
    ) => {
      const validRoute = ensureRoadRouteGeometry(route, {
        phase: 'apply',
        source: 'road',
        status: nextStatus,
      });
      if (!validRoute) {
        setSession((prev) => ({
          ...prev,
          status: 'error',
          route: null,
          error: 'Route geometry unavailable',
          routeStatusLabel: 'Route unavailable',
          routeConfidenceState: 'on_route',
          isOffRoute: false,
        }));
        return;
      }

      setSession((prev) => {
        const computed = computeSessionFromRoute(validRoute, currentLocation, prev);
        const nextSession: RoadNavigationSessionState = {
          ...prev,
          sessionId: prev.sessionId ?? randomSessionId(),
          status: nextStatus,
          destination,
          route: validRoute,
          rerouteCount: rerouteCount ?? prev.rerouteCount,
          error: null,
          createdFrom,
          routeConfidenceState:
            nextStatus === 'arrived'
              ? 'arrived'
              : nextStatus === 'rerouting'
                ? 'rerouting'
                : 'on_route',
          routeStatusLabel: getRouteStateLabel(
            nextStatus,
            nextStatus === 'arrived'
              ? 'arrived'
              : nextStatus === 'rerouting'
                ? 'rerouting'
                : 'on_route',
            liveServicesEnabled,
          ),
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
        destination.coordinate.lat.toFixed(5),
        destination.coordinate.lng.toFixed(5),
        requestedStatus,
      ].join(':');

      if (inFlightRouteKeyRef.current === routeKey) {
        return;
      }

      inFlightRouteKeyRef.current = routeKey;
      const requestSeq = routeRequestSeqRef.current + 1;
      routeRequestSeqRef.current = requestSeq;
      setPreviewLoading(true);
      try {
        const route = await withRouteRequestTimeout(
          fetchRoadRoute({
            accessToken,
            origin: currentLocation,
            destination,
          }),
        );

        if (
          routeRequestSeqRef.current !== requestSeq ||
          inFlightRouteKeyRef.current !== routeKey
        ) {
          return;
        }

        const validRoute = ensureRoadRouteGeometry(route, {
          phase: 'fetch',
          source: 'road',
          status: requestedStatus,
        });
        if (!validRoute) {
          throw new Error('Route geometry unavailable');
        }

        applyRoute(validRoute, requestedStatus, destination, createdFrom, rerouteCount);
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
              progressGeometry: [],
              updatedAt: restored.updatedAt,
            };

        return {
          ...prev,
          sessionId: restored.sessionId,
          destination: restored.destination,
          route: restoredRoute,
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

  const reroute = useCallback(
    async (_reason = 'off_route') => {
      const activeSession = sessionRef.current;
      if (!activeSession.destination) return;
      if (!currentLocation) return;
      if (!accessToken || !liveServicesEnabled) {
        setSession((prev) => ({
          ...prev,
          status: 'navigation_active',
          error: null,
          routeConfidenceState: 'off_route',
          routeStatusLabel: 'Rejoin route',
          isOffRoute: true,
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
        routeStatusLabel: 'Updating route',
        rerouteCount: nextRerouteCount,
        completionReason: null,
      }));

      try {
        await requestRouteForDestination(
          activeSession.destination,
          'navigation_active',
          activeSession.createdFrom,
          nextRerouteCount,
        );
      } catch (error) {
        setSession((prev) => ({
          ...prev,
          status: 'navigation_active',
          error: getRouteErrorMessage(error, 'Route update unavailable'),
          routeStatusLabel: 'Route update unavailable',
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
      'rerouting',
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
      nextConfidenceState === 'rerouting';

    setSession((prev) => {
      const nextStatus =
        prev.status === 'navigation_active' && nextConfidenceState === 'arrived'
          ? 'arrived'
          : prev.status;
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
        prev.isOffRoute === nextIsOffRoute &&
        prev.completionReason === nextCompletionReason &&
        prev.status === nextStatus &&
        sameGeometry(prev.progressGeometry, computed.progressGeometry);

      if (noMeaningfulChange) {
        return prev;
      }

      const nextSession = {
        ...prev,
        ...computed,
        status: nextStatus,
        routeConfidenceState: nextConfidenceState,
        routeStatusLabel: nextRouteStatusLabel,
        isOffRoute: nextIsOffRoute,
        completionReason: nextCompletionReason,
      };
      void persistSession(nextSession);
      return nextSession;
    });

    if (activeSession.status === 'navigation_active') {
      if (
        nextConfidenceState === 'off_route' &&
        Date.now() - rerouteCooldownRef.current >= REROUTE_COOLDOWN_MS
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
    const validRoute = ensureRoadRouteGeometry(session.route, {
      phase: 'start',
      source: 'road',
      status: 'navigation_active',
    });
    if (!validRoute) {
      setSession((prev) => ({
        ...prev,
        status: 'error',
        route: null,
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
    setStepListExpanded(false);
    setSession((prev) => {
      const nextSession = {
        ...prev,
        status: 'navigation_active' as const,
        route: validRoute,
        routeStatusLabel: 'Route active',
        routeConfidenceState: 'on_route' as const,
        completionReason: null,
        error: null,
      };
      void persistSession(nextSession);
      return nextSession;
    });
  }, [persistSession, session.destination, session.route]);

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
    startNavigation,
    endNavigation,
    clearDestination,
    reroute,
  };
}
