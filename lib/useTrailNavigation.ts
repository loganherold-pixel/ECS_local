import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getNavigationHandoffActiveGuidanceUnavailableReason,
  type NavigationHandoffPayload,
  type NavigationTrailDecisionPoint,
  type NavigationTrailWaypoint,
} from './navigationHandoffStore';
import {
  buildTrailCumulativeDistances,
  buildTrailGuidanceSnapshot,
  type TrailGuidanceLocation,
  type TrailNavigationStatus,
} from './trailGuidanceEngine';
import {
  clearTrailNavigationSession,
  loadTrailNavigationSession,
  saveTrailNavigationSession,
  type TrailNavigationSessionSnapshot,
} from './trailNavigationStore';
import type { RoadNavCoordinate } from './mapboxRoadNavigation';
import {
  createTrailNavigationPersistenceScheduler,
  isTrailNavigationImmediatePersistenceBoundary,
  type TrailNavigationPersistenceScheduler,
} from './trailNavigationProgressPersistence';

function headingDeltaDegrees(a: number, b: number): number {
  const left = ((a % 360) + 360) % 360;
  const right = ((b % 360) + 360) % 360;
  const delta = Math.abs(left - right);
  return delta > 180 ? 360 - delta : delta;
}

function randomSessionId(): string {
  const cryptoRef = typeof crypto !== 'undefined' ? crypto : null;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sameNullableNumber(a: number | null, b: number | null, tolerance = 0): boolean {
  if (a == null || b == null) return a === b;
  return Math.abs(a - b) <= tolerance;
}

function sameCoordinate(
  a: RoadNavCoordinate | null | undefined,
  b: RoadNavCoordinate | null | undefined,
  precision = 5,
): boolean {
  if (!a || !b) return a === b;
  return (
    a.lat.toFixed(precision) === b.lat.toFixed(precision) &&
    a.lng.toFixed(precision) === b.lng.toFixed(precision)
  );
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

function sameStringArray(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const BACKWARD_PROGRESS_THRESHOLD_M = 35;
const TRAIL_NAVIGATION_ARRIVAL_DISTANCE_M = 200;
const OFF_TRAIL_CONFIRMATION_COUNT = 2;
const REJOIN_CONFIRMATION_COUNT = 2;
const TRAIL_PREVIEW_RESTORE_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const TRAIL_ACTIVE_RESTORE_MAX_AGE_MS = 18 * 60 * 60 * 1000;

function isRecentIsoTimestamp(value: string | null | undefined, maxAgeMs: number): boolean {
  if (!value) return false;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed <= maxAgeMs;
}

function isRestorableTrailSession(
  restored: TrailNavigationSessionSnapshot | null,
): restored is TrailNavigationSessionSnapshot {
  if (!restored?.payload || !restored.sessionId) return false;

  switch (restored.status) {
    case 'route_preview_trail':
    case 'route_preview_hybrid':
      return isRecentIsoTimestamp(restored.updatedAt, TRAIL_PREVIEW_RESTORE_MAX_AGE_MS);
    case 'transition_to_trail':
    case 'navigation_active_trail':
    case 'off_trail':
    case 'rejoining_trail':
      return isRecentIsoTimestamp(restored.updatedAt, TRAIL_ACTIVE_RESTORE_MAX_AGE_MS);
    case 'arrived_trail_destination':
    case 'arrived_final_destination':
    case 'cancelled':
    case 'error':
    case 'idle':
    default:
      return false;
  }
}

export interface TrailNavigationSessionState {
  sessionId: string | null;
  status: TrailNavigationStatus;
  payload: NavigationHandoffPayload | null;
  promptTitle: string | null;
  promptDetail: string | null;
  promptBadge:
    | 'trail'
    | 'hybrid'
    | 'off_trail'
    | 'waypoint'
    | 'decision'
    | 'transition'
    | 'arrived'
    | null;
  nextInstructionDistanceM: number | null;
  remainingDistanceM: number | null;
  progressPercent: number | null;
  routeStatusLabel: string | null;
  currentRouteIndex: number;
  progressGeometry: RoadNavCoordinate[];
  rejoinPoint: RoadNavCoordinate | null;
  rejoinDistanceM: number | null;
  nextWaypoint: NavigationTrailWaypoint | null;
  nextDecisionPoint: NavigationTrailDecisionPoint | null;
  reachedWaypointIds: string[];
  error: string | null;
  updatedAt: string | null;
}

function createEmptySession(): TrailNavigationSessionState {
  return {
    sessionId: null,
    status: 'idle',
    payload: null,
    promptTitle: null,
    promptDetail: null,
    promptBadge: null,
    nextInstructionDistanceM: null,
    remainingDistanceM: null,
    progressPercent: null,
    routeStatusLabel: null,
    currentRouteIndex: 0,
    progressGeometry: [],
    rejoinPoint: null,
    rejoinDistanceM: null,
    nextWaypoint: null,
    nextDecisionPoint: null,
    reachedWaypointIds: [],
    error: null,
    updatedAt: null,
  };
}

let activeTrailNavigationSession: TrailNavigationSessionState = createEmptySession();
const activeTrailNavigationSessionListeners = new Set<() => void>();

function publishActiveTrailNavigationSession(session: TrailNavigationSessionState): void {
  if (activeTrailNavigationSession === session) return;
  activeTrailNavigationSession = session;
  activeTrailNavigationSessionListeners.forEach((listener) => listener());
}

export function getActiveTrailNavigationSession(): TrailNavigationSessionState {
  return activeTrailNavigationSession;
}

export function subscribeActiveTrailNavigationSession(listener: () => void): () => void {
  activeTrailNavigationSessionListeners.add(listener);
  return () => {
    activeTrailNavigationSessionListeners.delete(listener);
  };
}

export interface UseTrailNavigationOutput {
  session: TrailNavigationSessionState;
  restoreStatus: 'loading' | 'ready' | 'error';
  uiMode: 'idle' | 'preview' | 'active' | 'arrived' | 'error';
  loadPayload: (
    payload: NavigationHandoffPayload,
    status: Extract<TrailNavigationStatus, 'route_preview_trail' | 'route_preview_hybrid'>,
  ) => Promise<void>;
  startNavigation: () => Promise<void>;
  transitionFromRoad: () => Promise<void>;
  endNavigation: () => Promise<void>;
}

export function useTrailNavigation(params: {
  location: TrailGuidanceLocation | null;
  enabled?: boolean;
}): UseTrailNavigationOutput {
  const { location, enabled = true } = params;
  const [session, setSession] = useState<TrailNavigationSessionState>(
    () => activeTrailNavigationSession,
  );
  const [restoreStatus, setRestoreStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    !enabled || activeTrailNavigationSession.status !== 'idle' ? 'ready' : 'loading',
  );
  const restoreAttemptedRef = useRef(false);

  useEffect(() => {
    publishActiveTrailNavigationSession(session);
  }, [session]);
  const offTrailHitCountRef = useRef(0);
  const rejoinHitCountRef = useRef(0);
  const reverseProgressCountRef = useRef(0);

  const persistenceSchedulerRef = useRef<
    TrailNavigationPersistenceScheduler<TrailNavigationSessionState> | null
  >(null);
  if (!persistenceSchedulerRef.current) {
    persistenceSchedulerRef.current = createTrailNavigationPersistenceScheduler({
      persist: async (next) => {
        if (!next.payload || next.status === 'idle' || next.status === 'cancelled') {
          await clearTrailNavigationSession();
          return;
        }

        await saveTrailNavigationSession({
          sessionId: next.sessionId ?? randomSessionId(),
          payload: next.payload,
          status: next.status,
          reachedWaypointIds: next.reachedWaypointIds,
          lastKnownRouteIndex: next.currentRouteIndex,
          updatedAt: new Date().toISOString(),
        });
      },
    });
  }
  const persistenceScheduler = persistenceSchedulerRef.current;

  const persistImmediate = useCallback(
    async (next: TrailNavigationSessionState) => {
      await persistenceScheduler.persistImmediate(next);
    },
    [persistenceScheduler],
  );

  const persistProgressCheckpoint = useCallback(
    (next: TrailNavigationSessionState) => {
      persistenceScheduler.scheduleCheckpoint(next);
    },
    [persistenceScheduler],
  );

  useEffect(
    () => () => {
      void persistenceScheduler.dispose();
    },
    [persistenceScheduler],
  );

  useEffect(() => {
    if (!enabled) {
      setRestoreStatus('ready');
      return;
    }
    if (restoreAttemptedRef.current) return;
    let cancelled = false;
    // Mark the restore as claimed before awaiting storage so a remount/toggle or
    // late result cannot overwrite a route staged during the read.
    restoreAttemptedRef.current = true;
    let restoreFailed = false;

    void (async () => {
      try {
        const restored = await loadTrailNavigationSession();
        if (cancelled || !restored) return;
        if (!isRestorableTrailSession(restored)) {
          await clearTrailNavigationSession();
          return;
        }
        setSession((prev) => {
          const liveSessionStarted =
            prev.sessionId != null ||
            prev.payload != null ||
            prev.status !== 'idle';
          if (liveSessionStarted) return prev;
          return {
            ...prev,
            sessionId: restored.sessionId,
            payload: restored.payload,
            status: restored.status,
            reachedWaypointIds: restored.reachedWaypointIds ?? [],
            currentRouteIndex: restored.lastKnownRouteIndex ?? 0,
          };
        });
      } catch {
        restoreFailed = true;
        if (!cancelled) setRestoreStatus('error');
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('[ECS Navigation] trail session restore failed', {
            safeCode: 'TRAIL_SESSION_RESTORE_FAILED',
          });
        }
      } finally {
        if (!cancelled && !restoreFailed) setRestoreStatus('ready');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const loadPayload = useCallback(
    async (
      payload: NavigationHandoffPayload,
      status: Extract<TrailNavigationStatus, 'route_preview_trail' | 'route_preview_hybrid'>,
    ) => {
      const next: TrailNavigationSessionState = {
        ...createEmptySession(),
        sessionId: randomSessionId(),
        payload,
        status,
        routeStatusLabel:
          status === 'route_preview_hybrid' ? 'Hybrid guidance staged' : 'Trail guidance staged',
        promptTitle:
          status === 'route_preview_hybrid'
            ? 'Hybrid guidance staged'
            : 'Trail guidance staged',
        promptDetail:
          status === 'route_preview_hybrid'
            ? 'Trail guidance starts after the road segment.'
            : 'Start when ready.',
        promptBadge: status === 'route_preview_hybrid' ? 'hybrid' : 'trail',
        updatedAt: new Date().toISOString(),
      };
      setSession(next);
      await persistImmediate(next);
    },
    [persistImmediate],
  );

  const startNavigation = useCallback(async () => {
    setSession((prev) => {
      if (!prev.payload) return prev;
      const unavailableReason = getNavigationHandoffActiveGuidanceUnavailableReason(prev.payload);
      if (unavailableReason) {
        const next: TrailNavigationSessionState = {
          ...prev,
          status: 'error',
          routeStatusLabel: 'Trail route unavailable',
          promptTitle: 'Trail route unavailable',
          promptDetail: unavailableReason,
          promptBadge: null,
          error: unavailableReason,
          updatedAt: new Date().toISOString(),
        };
        void persistImmediate(next);
        return next;
      }
      const next: TrailNavigationSessionState = {
        ...prev,
        status: 'navigation_active_trail',
        routeStatusLabel:
          prev.payload.tripMode === 'hybrid' ? 'Hybrid guidance active' : 'Trail guidance active',
        promptTitle: 'Trail guidance active',
        promptDetail: 'Stay on highlighted route',
        promptBadge: 'transition',
        updatedAt: new Date().toISOString(),
      };
      void persistImmediate(next);
      return next;
    });
  }, [persistImmediate]);

  const transitionFromRoad = useCallback(async () => {
    setSession((prev) => {
      if (!prev.payload) return prev;
      const next: TrailNavigationSessionState = {
        ...prev,
        status: 'transition_to_trail',
        routeStatusLabel: 'Trail guidance transition',
        promptTitle: 'Entering trail guidance',
        promptDetail: 'Road segment complete',
        promptBadge: 'transition',
        updatedAt: new Date().toISOString(),
      };
      void persistImmediate(next);
      return next;
    });
  }, [persistImmediate]);

  useEffect(() => {
    if (session.status !== 'transition_to_trail') return;
    const timer = setTimeout(() => {
      void startNavigation();
    }, 1400);
    return () => clearTimeout(timer);
  }, [session.status, startNavigation]);

  useEffect(() => {
    if (!location || !session.payload) return;
    if (
      ![
        'navigation_active_trail',
        'off_trail',
        'rejoining_trail',
        'transition_to_trail',
      ].includes(session.status)
    ) {
      return;
    }

    const geometry = session.payload.trailGeometry;
    if (!geometry || geometry.length < 2) {
      setSession((prev) => {
        if (
          prev.status === 'error' &&
          prev.error === 'Trail route unavailable' &&
          prev.routeStatusLabel === 'Trail route unavailable'
        ) {
          return prev;
        }
        const next = {
          ...prev,
          status: 'error' as const,
          error: 'Trail route unavailable',
          routeStatusLabel: 'Trail route unavailable',
        };
        void persistImmediate(next);
        return next;
      });
      return;
    }

    setSession((prev) => {
      if (!prev.payload) return prev;
      const payload = prev.payload;

      const routeDistances = buildTrailCumulativeDistances(payload.trailGeometry);
      const routeLengthM = routeDistances[routeDistances.length - 1] ?? 0;
      const previousTraveledDistanceM =
        prev.remainingDistanceM != null && Number.isFinite(prev.remainingDistanceM)
          ? Math.max(0, routeLengthM - prev.remainingDistanceM)
          : null;
      const elapsedMs =
        prev.updatedAt && Number.isFinite(Date.parse(prev.updatedAt))
          ? Math.max(0, Date.now() - Date.parse(prev.updatedAt))
          : null;
      const buildSnapshot = (allowBacktracking: boolean) => buildTrailGuidanceSnapshot({
        geometry: payload.trailGeometry,
        location,
        waypoints: payload.trailWaypoints ?? [],
        decisionPoints: payload.trailDecisionPoints ?? [],
        reachedWaypointIds: prev.reachedWaypointIds,
        mode: payload.tripMode === 'hybrid' ? 'hybrid' : 'trail',
        previousTraveledDistanceM,
        allowBacktracking,
        elapsedMs,
      });
      let snapshot = buildSnapshot(false);

      let nextStatus: TrailNavigationStatus = prev.status;
      const previousIndex = prev.currentRouteIndex;
      let nextRouteIndex = snapshot.progress.nearestIndex;
      let confirmedBacktracking = false;
      const rawCandidateDistanceM = snapshot.progress.nearestCandidateDistanceM ?? snapshot.progress.traveledDistanceM;
      const routeBearingDeg = snapshot.progress.nearestSegmentBearingDeg;
      const headingDeg = location.headingDeg;
      const reversingHeading =
        typeof headingDeg === 'number' &&
        Number.isFinite(headingDeg) &&
        typeof routeBearingDeg === 'number' &&
        Number.isFinite(routeBearingDeg) &&
        headingDeltaDegrees(headingDeg, routeBearingDeg) >= 120;
      const moving =
        typeof location.speedMph !== 'number' ||
        !Number.isFinite(location.speedMph) ||
        location.speedMph >= 2;
      const backwardCandidate =
        previousTraveledDistanceM != null &&
        rawCandidateDistanceM < previousTraveledDistanceM - 18;

      if (backwardCandidate && reversingHeading && moving) {
        reverseProgressCountRef.current += 1;
        if (reverseProgressCountRef.current >= 3) {
          snapshot = buildSnapshot(true);
          nextRouteIndex = snapshot.progress.nearestIndex;
          confirmedBacktracking = true;
        } else {
          nextRouteIndex = previousIndex;
        }
      } else {
        reverseProgressCountRef.current = 0;
      }

      if (snapshot.isOffTrail) {
        offTrailHitCountRef.current += 1;
        rejoinHitCountRef.current = 0;
        if (offTrailHitCountRef.current >= OFF_TRAIL_CONFIRMATION_COUNT) {
          nextStatus = 'off_trail';
        }
      } else if (prev.status === 'off_trail' || prev.status === 'rejoining_trail') {
        rejoinHitCountRef.current += 1;
        offTrailHitCountRef.current = 0;
        if (rejoinHitCountRef.current >= REJOIN_CONFIRMATION_COUNT) {
          nextStatus = 'navigation_active_trail';
        } else {
          nextStatus = 'rejoining_trail';
        }
      } else {
        offTrailHitCountRef.current = 0;
        rejoinHitCountRef.current = 0;
      }

      if (
        snapshot.progress.remainingDistanceM <= TRAIL_NAVIGATION_ARRIVAL_DISTANCE_M &&
        !snapshot.isOffTrail
      ) {
        nextStatus =
          prev.payload?.tripMode === 'hybrid'
            ? 'arrived_final_destination'
            : 'arrived_trail_destination';
      }

      const routeStatusLabel =
        nextStatus === 'off_trail'
          ? 'Off trail'
          : nextStatus === 'rejoining_trail'
            ? 'Rejoining trail'
            : nextStatus === 'arrived_final_destination' || nextStatus === 'arrived_trail_destination'
              ? 'Arrived'
              : snapshot.statusLabel;

      const nextPromptTitle =
        nextStatus === 'rejoining_trail'
          ? 'Rejoining trail'
          : snapshot.prompt.title;
      const nextPromptDetail =
        nextStatus === 'rejoining_trail'
          ? 'Return to the highlighted route.'
          : snapshot.prompt.detail;
      const nextPromptBadge =
        nextStatus === 'rejoining_trail'
          ? 'transition'
          : snapshot.prompt.badge;

      const next: TrailNavigationSessionState = {
        ...prev,
        status: nextStatus,
        promptTitle: nextPromptTitle,
        promptDetail: nextPromptDetail,
        promptBadge: nextPromptBadge,
        nextInstructionDistanceM:
          nextStatus === 'off_trail' ? snapshot.rejoinDistanceM : snapshot.prompt.distanceM,
        remainingDistanceM: snapshot.progress.remainingDistanceM,
        progressPercent: snapshot.progressPercent,
        routeStatusLabel,
        currentRouteIndex: confirmedBacktracking
          ? nextRouteIndex
          : Math.max(prev.currentRouteIndex, nextRouteIndex),
        progressGeometry: snapshot.progress.progressCoords,
        rejoinPoint: snapshot.rejoinPoint,
        rejoinDistanceM: snapshot.rejoinDistanceM,
        nextWaypoint: snapshot.nextWaypoint,
        nextDecisionPoint: snapshot.nextDecisionPoint,
        reachedWaypointIds: snapshot.reachedWaypointIds,
        error: null,
        updatedAt: new Date().toISOString(),
      };

      const noMeaningfulChange =
        prev.status === next.status &&
        prev.promptTitle === next.promptTitle &&
        prev.promptDetail === next.promptDetail &&
        prev.promptBadge === next.promptBadge &&
        sameNullableNumber(prev.nextInstructionDistanceM, next.nextInstructionDistanceM, 1) &&
        sameNullableNumber(prev.remainingDistanceM, next.remainingDistanceM, 1) &&
        sameNullableNumber(prev.progressPercent, next.progressPercent, 0.5) &&
        prev.routeStatusLabel === next.routeStatusLabel &&
        prev.currentRouteIndex === next.currentRouteIndex &&
        sameGeometry(prev.progressGeometry, next.progressGeometry) &&
        sameCoordinate(prev.rejoinPoint, next.rejoinPoint) &&
        sameNullableNumber(prev.rejoinDistanceM, next.rejoinDistanceM, 1) &&
        prev.nextWaypoint?.id === next.nextWaypoint?.id &&
        prev.nextDecisionPoint?.id === next.nextDecisionPoint?.id &&
        sameStringArray(prev.reachedWaypointIds, next.reachedWaypointIds) &&
        prev.error === next.error;

      if (noMeaningfulChange) {
        return prev;
      }

      if (isTrailNavigationImmediatePersistenceBoundary(prev, next)) {
        void persistImmediate(next);
      } else {
        persistProgressCheckpoint(next);
      }
      return next;
    });
  }, [
    location,
    persistImmediate,
    persistProgressCheckpoint,
    session.payload,
    session.status,
  ]);

  const endNavigation = useCallback(async () => {
    setSession(createEmptySession());
    offTrailHitCountRef.current = 0;
    rejoinHitCountRef.current = 0;
    reverseProgressCountRef.current = 0;
    await persistImmediate(createEmptySession());
  }, [persistImmediate]);

  const uiMode = useMemo(() => {
    if (session.status === 'error') return 'error';
    if (
      session.status === 'navigation_active_trail' ||
      session.status === 'off_trail' ||
      session.status === 'rejoining_trail' ||
      session.status === 'transition_to_trail'
    ) {
      return 'active';
    }
    if (
      session.status === 'arrived_trail_destination' ||
      session.status === 'arrived_final_destination'
    ) {
      return 'arrived';
    }
    if (
      session.status === 'route_preview_trail' ||
      session.status === 'route_preview_hybrid'
    ) {
      return 'preview';
    }
    return 'idle';
  }, [session.status]);

  return {
    session,
    restoreStatus,
    uiMode,
    loadPayload,
    startNavigation,
    transitionFromRoad,
    endNavigation,
  };
}
