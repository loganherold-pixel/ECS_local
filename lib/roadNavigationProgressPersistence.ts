export const ROAD_NAVIGATION_PROGRESS_PERSIST_MIN_INTERVAL_MS = 30000;

type ProgressPersistenceRoute = {
  id?: string | null;
  routeVersion?: string | null;
  guidance?: {
    id?: string | null;
    routeVersion?: string | null;
    rerouteGeneration?: number | null;
  } | null;
} | null;

type ProgressPersistenceActiveGuidance = {
  routeId?: string | null;
  routeVersion?: string | null;
  rerouteGeneration?: number | null;
  currentStepIndex?: number | null;
} | null;

export type RoadNavigationProgressPersistenceSession = {
  sessionId?: string | null;
  status?: string | null;
  destination?: {
    id?: string | null;
  } | null;
  route?: ProgressPersistenceRoute;
  activeGuidance?: ProgressPersistenceActiveGuidance;
  currentStepIndex?: number | null;
  routeConfidenceState?: string | null;
  rerouteStatus?: string | null;
  completionReason?: string | null;
};

export type RoadNavigationProgressPersistenceSnapshot = {
  sessionId: string | null;
  status: string | null;
  destinationId: string | null;
  routeId: string | null;
  routeVersion: string | null;
  rerouteGeneration: number | null;
  currentStepIndex: number | null;
  routeConfidenceState: string | null;
  rerouteStatus: string | null;
  completionReason: string | null;
};

export type ShouldPersistRoadNavigationProgressUpdateInput = {
  previous: RoadNavigationProgressPersistenceSnapshot | null | undefined;
  next: RoadNavigationProgressPersistenceSnapshot;
  nowMs: number;
  lastPersistedAtMs: number | null | undefined;
  minIntervalMs?: number;
};

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function finiteInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.floor(value)
    : null;
}

function snapshotValueChanged(
  previous: RoadNavigationProgressPersistenceSnapshot,
  next: RoadNavigationProgressPersistenceSnapshot,
): boolean {
  return (Object.keys(next) as Array<keyof RoadNavigationProgressPersistenceSnapshot>).some(
    (key) => previous[key] !== next[key],
  );
}

export function buildRoadNavigationProgressPersistenceSnapshot(
  session: RoadNavigationProgressPersistenceSession,
): RoadNavigationProgressPersistenceSnapshot {
  const route = session.route ?? null;
  const guidance = route?.guidance ?? null;
  const activeGuidance = session.activeGuidance ?? null;

  return {
    sessionId: cleanString(session.sessionId),
    status: cleanString(session.status),
    destinationId: cleanString(session.destination?.id),
    routeId:
      cleanString(activeGuidance?.routeId) ??
      cleanString(guidance?.id) ??
      cleanString(route?.id),
    routeVersion:
      cleanString(activeGuidance?.routeVersion) ??
      cleanString(guidance?.routeVersion) ??
      cleanString(route?.routeVersion),
    rerouteGeneration:
      finiteInteger(activeGuidance?.rerouteGeneration) ??
      finiteInteger(guidance?.rerouteGeneration),
    currentStepIndex:
      finiteInteger(activeGuidance?.currentStepIndex) ??
      finiteInteger(session.currentStepIndex),
    routeConfidenceState: cleanString(session.routeConfidenceState),
    rerouteStatus: cleanString(session.rerouteStatus),
    completionReason: cleanString(session.completionReason),
  };
}

export function shouldPersistRoadNavigationProgressUpdate(
  input: ShouldPersistRoadNavigationProgressUpdateInput,
): boolean {
  if (!input.previous) return true;
  if (snapshotValueChanged(input.previous, input.next)) return true;

  const lastPersistedAtMs = finiteInteger(input.lastPersistedAtMs);
  if (lastPersistedAtMs == null) return true;

  const nowMs = finiteInteger(input.nowMs);
  if (nowMs == null) return false;

  const minIntervalMs =
    finiteInteger(input.minIntervalMs) ?? ROAD_NAVIGATION_PROGRESS_PERSIST_MIN_INTERVAL_MS;
  return nowMs - lastPersistedAtMs >= Math.max(0, minIntervalMs);
}
