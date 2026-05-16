import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  NavigationHandoffPayload,
  NavigationTrailDecisionPoint,
  NavigationTrailWaypoint,
} from './navigationHandoffStore';
import {
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
  const [session, setSession] = useState<TrailNavigationSessionState>(createEmptySession);
  const restoreAttemptedRef = useRef(false);

  useEffect(() => {
    publishActiveTrailNavigationSession(session);
  }, [session]);
  const offTrailHitCountRef = useRef(0);
  const rejoinHitCountRef = useRef(0);
  const reverseProgressCountRef = useRef(0);

  const persist = useCallback(async (next: TrailNavigationSessionState) => {
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
  }, []);

  useEffect(() => {
    if (!enabled || restoreAttemptedRef.current) return;
    let cancelled = false;

    void (async () => {
      const restored = await loadTrailNavigationSession();
      if (cancelled || !restored) return;
      if (!isRestorableTrailSession(restored)) {
        restoreAttemptedRef.current = true;
        await clearTrailNavigationSession();
        return;
      }
      restoreAttemptedRef.current = true;
      setSession((prev) => ({
        ...prev,
        sessionId: restored.sessionId,
        payload: restored.payload,
        status: restored.status,
        reachedWaypointIds: restored.reachedWaypointIds ?? [],
        currentRouteIndex: restored.lastKnownRouteIndex ?? 0,
      }));
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
      await persist(next);
    },
    [persist],
  );

  const startNavigation = useCallback(async () => {
    setSession((prev) => {
      if (!prev.payload) return prev;
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
      void persist(next);
      return next;
    });
  }, [persist]);

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
      void persist(next);
      return next;
    });
  }, [persist]);

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
        void persist(next);
        return next;
      });
      return;
    }

    setSession((prev) => {
      if (!prev.payload) return prev;

      const snapshot = buildTrailGuidanceSnapshot({
        geometry: prev.payload.trailGeometry,
        location,
        waypoints: prev.payload.trailWaypoints ?? [],
        decisionPoints: prev.payload.trailDecisionPoints ?? [],
        reachedWaypointIds: prev.reachedWaypointIds,
        mode: prev.payload.tripMode === 'hybrid' ? 'hybrid' : 'trail',
      });

      let nextStatus: TrailNavigationStatus = prev.status;
      const previousIndex = prev.currentRouteIndex;
      let nextRouteIndex = snapshot.progress.nearestIndex;

      if (nextRouteIndex + 1 < previousIndex) {
        reverseProgressCountRef.current += 1;
        if (reverseProgressCountRef.current < 3) {
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

      if (snapshot.progress.remainingDistanceM <= 35 && !snapshot.isOffTrail) {
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
        currentRouteIndex: Math.max(prev.currentRouteIndex, nextRouteIndex),
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

      void persist(next);
      return next;
    });
  }, [location, persist, session.payload, session.status]);

  const endNavigation = useCallback(async () => {
    setSession(createEmptySession());
    offTrailHitCountRef.current = 0;
    rejoinHitCountRef.current = 0;
    reverseProgressCountRef.current = 0;
    await clearTrailNavigationSession();
  }, []);

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
    uiMode,
    loadPayload,
    startNavigation,
    transitionFromRoad,
    endNavigation,
  };
}
