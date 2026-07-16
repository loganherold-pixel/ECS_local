import { loadRoadNavigationSession } from './roadNavigationStore';
import { loadTrailNavigationSession } from './trailNavigationStore';
import { createMigratingNonSecureStorage } from './nonSecureStorage';
import {
  logRouteGeometryLifecycle,
  routeGeometryLineStringToLatLng,
  validateRouteGeometry,
} from './routeGeometryLifecycle';
import { trackExpeditionTripFromGuidanceSnapshot } from './expedition/expeditionTripRecordStore';
import { buildGeometryFingerprint } from './lifecycle/routeTripExpeditionLifecycle';

export type NavigateRouteLifecycle = 'inactive' | 'preview' | 'active' | 'arrived';
export type NavigateRouteSessionSource = 'none' | 'road' | 'trail' | 'hybrid' | 'run';
export type NavigateRouteGuidanceStatus = 'nominal' | 'rerouting' | 'off_route' | 'arrived' | null;
export type NavigateRouteSessionStateOrigin = 'live' | 'restored';
export type NavigateRouteSessionFreshness = 'live' | 'cached' | 'stale';
export type NavigateRouteSessionHydrationStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface NavigateRouteMapPoint {
  lat: number;
  lng: number;
  ele?: number | null;
  ele_m?: number | null;
  elevationFeet?: number | null;
}

export interface NavigateRouteCurrentLocation {
  latitude: number;
  longitude: number;
  altitudeFt?: number | null;
  elevationFt?: number | null;
  speedMph?: number | null;
  headingDeg?: number | null;
  accuracyM?: number | null;
  timestamp?: number | null;
}

export interface NavigateRouteSessionSnapshot {
  sessionId: string | null;
  lifecycle: NavigateRouteLifecycle;
  source: NavigateRouteSessionSource;
  routeId: string | null;
  routeTitle: string | null;
  routeSubtitle: string | null;
  statusLabel: string;
  instruction: string | null;
  routePoints: NavigateRouteMapPoint[];
  progressPoints: NavigateRouteMapPoint[];
  currentLocation: NavigateRouteCurrentLocation | null;
  gpsSample?: NavigateRouteCurrentLocation | null;
  headingDeg: number | null;
  remainingDistanceM: number | null;
  remainingDurationS: number | null;
  etaIso: string | null;
  progressPercent: number | null;
  nextInstructionDistanceM: number | null;
  isRerouting: boolean;
  isOffRoute: boolean;
  offRouteDistanceM: number | null;
  routeStatusKind: NavigateRouteGuidanceStatus;
  updatedAt: string | null;
  /** Presentation metadata; restored state is never represented as live. */
  stateOrigin?: NavigateRouteSessionStateOrigin;
  freshness?: NavigateRouteSessionFreshness;
}

export interface NavigateRouteSessionHydrationState {
  status: NavigateRouteSessionHydrationStatus;
  generation: number;
  startedAt: string | null;
  completedAt: string | null;
  source: 'none' | NavigateRouteSessionStateOrigin;
  safeErrorCode: string | null;
}

export interface NavigateRouteSessionDiagnostics {
  hydration: NavigateRouteSessionHydrationState;
  subscriberCount: number;
  mutationRevision: number;
  latestProducerEvent: {
    source: 'live' | 'restored' | 'clear' | 'none';
    revision: number;
    lifecycle: NavigateRouteLifecycle;
    hasRoute: boolean;
    acceptedAt: string | null;
  };
}

type NavigateRouteSessionListener = (snapshot: NavigateRouteSessionSnapshot) => void;

const PREVIEW_RESTORE_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const ACTIVE_RESTORE_MAX_AGE_MS = 18 * 60 * 60 * 1000;
const RECENT_RESTORE_MAX_AGE_MS = 20 * 60 * 1000;
const NAVIGATE_ROUTE_SESSION_KEY = 'ecs_navigate_route_session_v1';
const NAVIGATE_ROUTE_SESSION_VERSION = 1;
const MAX_PERSISTED_ROUTE_POINTS = 1200;
const navigateRouteSessionStorage = createMigratingNonSecureStorage('ecs_navigate_route_session', {
  logTag: 'NavigateRouteSessionStore',
});

type PersistedNavigateRouteSessionSnapshot = NavigateRouteSessionSnapshot & {
  version: number;
};

const inactiveSnapshot: NavigateRouteSessionSnapshot = {
  sessionId: null,
  lifecycle: 'inactive',
  source: 'none',
  routeId: null,
  routeTitle: null,
  routeSubtitle: null,
  statusLabel: 'No active route',
  instruction: null,
  routePoints: [],
  progressPoints: [],
  currentLocation: null,
  headingDeg: null,
  remainingDistanceM: null,
  remainingDurationS: null,
  etaIso: null,
  progressPercent: null,
  nextInstructionDistanceM: null,
  isRerouting: false,
  isOffRoute: false,
  offRouteDistanceM: null,
  routeStatusKind: null,
  updatedAt: null,
};

let currentSnapshot = inactiveSnapshot;
let hydratePromise: Promise<NavigateRouteSessionSnapshot> | null = null;
let hydrationCompleted = false;
let mutationRevision = 0;
let hydrationState: NavigateRouteSessionHydrationState = {
  status: 'idle',
  generation: 0,
  startedAt: null,
  completedAt: null,
  source: 'none',
  safeErrorCode: null,
};
let latestProducerEvent: NavigateRouteSessionDiagnostics['latestProducerEvent'] = {
  source: 'none',
  revision: 0,
  lifecycle: 'inactive',
  hasRoute: false,
  acceptedAt: null,
};
const listeners = new Set<NavigateRouteSessionListener>();

function downsamplePoints(points: NavigateRouteMapPoint[], maxPoints = MAX_PERSISTED_ROUTE_POINTS): NavigateRouteMapPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const sampled = points.filter((_, index) => index === 0 || index === points.length - 1 || index % step === 0);
  return sampled[sampled.length - 1] === points[points.length - 1]
    ? sampled
    : [...sampled, points[points.length - 1]];
}

function normalizePoint(point: unknown): NavigateRouteMapPoint | null {
  const input = point as Partial<NavigateRouteMapPoint> | null | undefined;
  const lat = Number(input?.lat);
  const lng = Number(input?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const ele = Number(input?.ele ?? input?.ele_m);
  const elevationFeet = Number(input?.elevationFeet);
  return {
    lat,
    lng,
    ...(Number.isFinite(ele) ? { ele, ele_m: ele } : null),
    ...(Number.isFinite(elevationFeet) ? { elevationFeet } : null),
  };
}

function normalizePointList(points: unknown): NavigateRouteMapPoint[] {
  if (!Array.isArray(points)) return [];
  return downsamplePoints(points.map(normalizePoint).filter((point): point is NavigateRouteMapPoint => !!point));
}

function getRestoreMaxAge(lifecycle: NavigateRouteLifecycle): number {
  return lifecycle === 'active' || lifecycle === 'arrived'
    ? ACTIVE_RESTORE_MAX_AGE_MS
    : PREVIEW_RESTORE_MAX_AGE_MS;
}

async function loadPersistedNavigateRouteSession(): Promise<NavigateRouteSessionSnapshot | null> {
  const raw = await navigateRouteSessionStorage.read(NAVIGATE_ROUTE_SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PersistedNavigateRouteSessionSnapshot;
    if (
      parsed?.version !== NAVIGATE_ROUTE_SESSION_VERSION ||
      parsed.lifecycle === 'inactive' ||
      !isRecentIsoTimestamp(parsed.updatedAt, getRestoreMaxAge(parsed.lifecycle))
    ) {
      return null;
    }

    const { version: _version, ...snapshot } = parsed;
    const restored = normalizeSnapshot({
      ...snapshot,
      routePoints: normalizePointList(parsed.routePoints),
      progressPoints: normalizePointList(parsed.progressPoints),
    });

    return restored.lifecycle === 'inactive' ? null : restored;
  } catch {
    return null;
  }
}

function persistNavigateRouteSession(snapshot: NavigateRouteSessionSnapshot): void {
  if (snapshot.lifecycle === 'inactive') {
    void navigateRouteSessionStorage.remove(NAVIGATE_ROUTE_SESSION_KEY);
    return;
  }

  const payload: PersistedNavigateRouteSessionSnapshot = {
    ...snapshot,
    routePoints: downsamplePoints(snapshot.routePoints),
    progressPoints: downsamplePoints(snapshot.progressPoints),
    version: NAVIGATE_ROUTE_SESSION_VERSION,
  };

  void navigateRouteSessionStorage.write(NAVIGATE_ROUTE_SESSION_KEY, JSON.stringify(payload));
}

function isRecentIsoTimestamp(value: string | null | undefined, maxAgeMs: number): boolean {
  if (!value) return false;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed <= maxAgeMs;
}

function pointSignature(points: NavigateRouteMapPoint[]): string {
  if (points.length === 0) return 'none';
  const geometryFingerprint = buildGeometryFingerprint(points, 'navigate-route-session');
  if (geometryFingerprint) return geometryFingerprint;

  const point = points[0];
  const elevationMeters = Number(point.ele ?? point.ele_m);
  const elevationFeet = point.elevationFeet == null ? NaN : Number(point.elevationFeet);
  return [
    'navigate-route-session:1',
    point.lat.toFixed(6),
    point.lng.toFixed(6),
    Number.isFinite(elevationMeters) ? elevationMeters.toFixed(1) : '-',
    Number.isFinite(elevationFeet) ? elevationFeet.toFixed(1) : '-',
  ].join(':');
}

function snapshotSignature(snapshot: NavigateRouteSessionSnapshot): string {
  const location = snapshot.currentLocation
    ? `${snapshot.currentLocation.latitude.toFixed(5)},${snapshot.currentLocation.longitude.toFixed(5)}`
    : 'none';
  return [
    snapshot.sessionId ?? 'none',
    snapshot.lifecycle,
    snapshot.source,
    snapshot.routeId ?? 'none',
    snapshot.routeTitle ?? 'none',
    snapshot.statusLabel,
    snapshot.instruction ?? 'none',
    snapshot.remainingDistanceM == null ? 'none' : Math.round(snapshot.remainingDistanceM),
    snapshot.remainingDurationS == null ? 'none' : Math.round(snapshot.remainingDurationS),
    snapshot.progressPercent == null ? 'none' : Math.round(snapshot.progressPercent),
    snapshot.nextInstructionDistanceM == null ? 'none' : Math.round(snapshot.nextInstructionDistanceM),
    snapshot.isRerouting ? 'rerouting' : 'not-rerouting',
    snapshot.isOffRoute ? 'off-route' : 'on-route',
    snapshot.offRouteDistanceM == null ? 'none' : Math.round(snapshot.offRouteDistanceM),
    snapshot.routeStatusKind ?? 'none',
    snapshot.stateOrigin ?? 'live',
    snapshot.freshness ?? 'live',
    location,
    snapshot.headingDeg == null ? 'none' : Math.round(snapshot.headingDeg),
    snapshot.currentLocation?.altitudeFt == null ? 'none' : Math.round(snapshot.currentLocation.altitudeFt),
    snapshot.currentLocation?.accuracyM == null ? 'none' : Math.round(snapshot.currentLocation.accuracyM),
    snapshot.currentLocation?.timestamp == null ? 'none' : Math.round(snapshot.currentLocation.timestamp),
    pointSignature(snapshot.routePoints),
    pointSignature(snapshot.progressPoints),
  ].join('|');
}

function notify(snapshot: NavigateRouteSessionSnapshot) {
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {}
  });
}

function normalizeSnapshot(snapshot: NavigateRouteSessionSnapshot): NavigateRouteSessionSnapshot {
  if (snapshot.lifecycle === 'inactive') {
    return { ...inactiveSnapshot, updatedAt: snapshot.updatedAt ?? null };
  }

  return {
    ...inactiveSnapshot,
    ...snapshot,
    routePoints: Array.isArray(snapshot.routePoints) ? snapshot.routePoints : [],
    progressPoints: Array.isArray(snapshot.progressPoints) ? snapshot.progressPoints : [],
    updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
  };
}

function commitSnapshot(
  next: NavigateRouteSessionSnapshot,
  options: {
    producer: 'live' | 'restored' | 'clear';
    persist: boolean;
    track: boolean;
  },
): NavigateRouteSessionSnapshot {
  const normalized = normalizeSnapshot({
    ...next,
    stateOrigin: options.producer === 'restored' ? 'restored' : 'live',
    freshness: options.producer === 'restored'
      ? isRecentIsoTimestamp(next.updatedAt, RECENT_RESTORE_MAX_AGE_MS) ? 'cached' : 'stale'
      : 'live',
  });
  if (snapshotSignature(currentSnapshot) === snapshotSignature(normalized)) {
    return currentSnapshot;
  }
  currentSnapshot = normalized;
  if (options.producer !== 'restored') mutationRevision += 1;
  latestProducerEvent = {
    source: options.producer,
    revision: mutationRevision,
    lifecycle: currentSnapshot.lifecycle,
    hasRoute: currentSnapshot.lifecycle !== 'inactive' && currentSnapshot.routePoints.length > 1,
    acceptedAt: new Date().toISOString(),
  };
  if (options.persist) persistNavigateRouteSession(currentSnapshot);
  if (options.track) void trackExpeditionTripFromGuidanceSnapshot(currentSnapshot);
  notify(currentSnapshot);
  return currentSnapshot;
}

function setSnapshot(next: NavigateRouteSessionSnapshot): NavigateRouteSessionSnapshot {
  return commitSnapshot(next, { producer: 'live', persist: true, track: true });
}

function getTrailLifecycle(status: string): NavigateRouteLifecycle {
  if (status === 'route_preview_trail' || status === 'route_preview_hybrid') return 'preview';
  if (status === 'arrived_trail_destination' || status === 'arrived_final_destination') return 'arrived';
  if (
    status === 'navigation_active_trail' ||
    status === 'off_trail' ||
    status === 'rejoining_trail' ||
    status === 'transition_to_trail'
  ) {
    return 'active';
  }
  return 'inactive';
}

function getRoadLifecycle(status: string): NavigateRouteLifecycle {
  if (status === 'destination_selected' || status === 'route_preview') return 'preview';
  if (status === 'arrived') return 'arrived';
  if (status === 'navigation_active' || status === 'rerouting') return 'active';
  return 'inactive';
}

async function buildSnapshotFromPersistence(): Promise<NavigateRouteSessionSnapshot> {
  if (
    currentSnapshot.lifecycle !== 'inactive' &&
    isRecentIsoTimestamp(currentSnapshot.updatedAt, getRestoreMaxAge(currentSnapshot.lifecycle))
  ) {
    return currentSnapshot;
  }

  const persistedNavigateSession = await loadPersistedNavigateRouteSession();
  if (persistedNavigateSession) {
    return persistedNavigateSession;
  }

  const trail = await loadTrailNavigationSession();
  const trailLifecycle = trail ? getTrailLifecycle(trail.status) : 'inactive';
  const trailMaxAge = trailLifecycle === 'active' ? ACTIVE_RESTORE_MAX_AGE_MS : PREVIEW_RESTORE_MAX_AGE_MS;
  if (
    trail &&
    trailLifecycle !== 'inactive' &&
    isRecentIsoTimestamp(trail.updatedAt, trailMaxAge)
  ) {
    return normalizeSnapshot({
      sessionId: trail.sessionId,
      lifecycle: trailLifecycle,
      source: trail.payload.tripMode === 'hybrid' ? 'hybrid' : 'trail',
      routeId: trail.payload.id,
      routeTitle: trail.payload.title,
      routeSubtitle: trail.payload.subtitle ?? null,
      statusLabel: trailLifecycle === 'active' ? 'Trail guidance active' : 'Trail route staged',
      instruction: trailLifecycle === 'active' ? 'Stay on highlighted route' : 'Open Navigate to start guidance',
      routePoints: trail.payload.trailGeometry,
      progressPoints: [],
      currentLocation: null,
      headingDeg: null,
      remainingDistanceM: null,
      remainingDurationS: null,
      etaIso: null,
      progressPercent: null,
      nextInstructionDistanceM: null,
      isRerouting: false,
      isOffRoute: trail.status === 'off_trail',
      offRouteDistanceM: null,
      routeStatusKind: trail.status === 'off_trail' ? 'off_route' : trailLifecycle === 'arrived' ? 'arrived' : 'nominal',
      updatedAt: trail.updatedAt,
    });
  }

  const road = await loadRoadNavigationSession();
  const roadLifecycle = road ? getRoadLifecycle(road.status) : 'inactive';
  const roadMaxAge = roadLifecycle === 'active' ? ACTIVE_RESTORE_MAX_AGE_MS : PREVIEW_RESTORE_MAX_AGE_MS;
  if (
    road &&
    roadLifecycle !== 'inactive' &&
    isRecentIsoTimestamp(road.updatedAt, roadMaxAge)
  ) {
    const routeGeometryValidation = validateRouteGeometry(road.routeGeometry);
    if (!routeGeometryValidation.valid || !routeGeometryValidation.lineString) {
      logRouteGeometryLifecycle(routeGeometryValidation.reason, {
        routeId: road.routeId ?? road.destination.id,
        cacheKey: road.routeGeometryCacheKey ?? null,
        phase: 'session_store_restore',
        source: 'road',
        status: road.status,
        message: 'Road navigation snapshot restore skipped because route geometry is unavailable.',
      });
      return inactiveSnapshot;
    }

    const routePoints = routeGeometryLineStringToLatLng(routeGeometryValidation.lineString);
    logRouteGeometryLifecycle('geometry_successfully_loaded', {
      routeId: road.routeId ?? road.destination.id,
      cacheKey: road.routeGeometryCacheKey ?? null,
      phase: 'session_store_restore',
      source: 'road',
      status: road.status,
      pointCount: routeGeometryValidation.pointCount,
      fingerprint: routeGeometryValidation.fingerprint,
    });

    const isRoadRerouting = road.status === 'rerouting';

    return normalizeSnapshot({
      sessionId: road.sessionId,
      lifecycle: roadLifecycle,
      source: 'road',
      routeId: road.destination.id,
      routeTitle: road.destination.title,
      routeSubtitle: road.destination.subtitle ?? null,
      statusLabel: isRoadRerouting
        ? 'Road guidance rerouting'
        : roadLifecycle === 'active'
          ? 'Road guidance active'
          : 'Road route staged',
      instruction: isRoadRerouting
        ? 'Rerouting to best remaining route'
        : roadLifecycle === 'active'
          ? 'Continue on active route'
          : 'Open Navigate to start guidance',
      routePoints,
      progressPoints: [],
      currentLocation: null,
      headingDeg: null,
      remainingDistanceM: null,
      remainingDurationS: null,
      etaIso: null,
      progressPercent: null,
      nextInstructionDistanceM: null,
      isRerouting: isRoadRerouting,
      isOffRoute: false,
      offRouteDistanceM: null,
      routeStatusKind: isRoadRerouting ? 'rerouting' : roadLifecycle === 'arrived' ? 'arrived' : 'nominal',
      updatedAt: road.updatedAt,
    });
  }

  return inactiveSnapshot;
}

export const navigateRouteSessionStore = {
  getSnapshot(): NavigateRouteSessionSnapshot {
    return currentSnapshot;
  },

  setSnapshot(next: NavigateRouteSessionSnapshot): NavigateRouteSessionSnapshot {
    return setSnapshot(next);
  },

  clear(): NavigateRouteSessionSnapshot {
    return commitSnapshot(
      { ...inactiveSnapshot, updatedAt: new Date().toISOString() },
      { producer: 'clear', persist: true, track: true },
    );
  },

  subscribe(listener: NavigateRouteSessionListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getHydrationState(): NavigateRouteSessionHydrationState {
    return { ...hydrationState };
  },

  getDiagnostics(): NavigateRouteSessionDiagnostics {
    return {
      hydration: { ...hydrationState },
      subscriberCount: listeners.size,
      mutationRevision,
      latestProducerEvent: { ...latestProducerEvent },
    };
  },

  hydrateFromPersistence(): Promise<NavigateRouteSessionSnapshot> {
    if (hydrationCompleted) return Promise.resolve(currentSnapshot);
    if (!hydratePromise) {
      const generation = hydrationState.generation + 1;
      const revisionAtStart = mutationRevision;
      hydrationState = {
        status: 'loading',
        generation,
        startedAt: new Date().toISOString(),
        completedAt: null,
        source: hydrationState.source,
        safeErrorCode: null,
      };
      hydratePromise = buildSnapshotFromPersistence()
        .then((snapshot) => {
          if (generation !== hydrationState.generation || mutationRevision !== revisionAtStart) {
            hydrationCompleted = true;
            hydrationState = {
              ...hydrationState,
              status: 'ready',
              completedAt: new Date().toISOString(),
              source: currentSnapshot.lifecycle === 'inactive' ? 'none' : 'live',
              safeErrorCode: null,
            };
            return currentSnapshot;
          }
          const restored = snapshot.lifecycle === 'inactive'
            ? currentSnapshot
            : commitSnapshot(snapshot, { producer: 'restored', persist: false, track: true });
          hydrationCompleted = true;
          hydrationState = {
            ...hydrationState,
            status: 'ready',
            completedAt: new Date().toISOString(),
            source: restored.lifecycle === 'inactive' ? 'none' : restored.stateOrigin ?? 'restored',
            safeErrorCode: null,
          };
          return restored;
        })
        .catch((error) => {
          hydrationState = {
            ...hydrationState,
            status: 'error',
            completedAt: new Date().toISOString(),
            safeErrorCode: 'NAVIGATE_ROUTE_SESSION_HYDRATION_FAILED',
          };
          throw error;
        })
        .finally(() => {
          hydratePromise = null;
        });
    }
    return hydratePromise;
  },
};
