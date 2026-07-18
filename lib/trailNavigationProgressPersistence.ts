export const TRAIL_NAVIGATION_PROGRESS_PERSIST_INTERVAL_MS = 30000;

export type TrailNavigationPersistenceBoundaryState = {
  sessionId?: string | null;
  status?: string | null;
  reachedWaypointIds?: readonly string[] | null;
  nextWaypoint?: { id?: string | null } | null;
  nextDecisionPoint?: { id?: string | null } | null;
  error?: string | null;
};

export type TrailNavigationPersistenceSchedulerDependencies<T> = {
  persist: (value: T) => Promise<void> | void;
  now?: () => number;
  scheduleTimeout?: (callback: () => void, delayMs: number) => unknown;
  cancelTimeout?: (handle: unknown) => void;
  checkpointIntervalMs?: number;
};

export type TrailNavigationPersistenceScheduler<T> = {
  persistImmediate: (value: T) => Promise<void>;
  scheduleCheckpoint: (value: T) => void;
  flushPending: () => Promise<void>;
  dispose: () => Promise<void>;
  waitForIdle: () => Promise<void>;
};

function sameStringArray(
  left: readonly string[] | null | undefined,
  right: readonly string[] | null | undefined,
): boolean {
  const leftValues = left ?? [];
  const rightValues = right ?? [];
  if (leftValues === rightValues) return true;
  if (leftValues.length !== rightValues.length) return false;
  for (let index = 0; index < leftValues.length; index += 1) {
    if (leftValues[index] !== rightValues[index]) return false;
  }
  return true;
}

/**
 * Identifies recoverability boundaries that must not wait for the routine GPS
 * checkpoint cadence.
 */
export function isTrailNavigationImmediatePersistenceBoundary(
  previous: TrailNavigationPersistenceBoundaryState,
  next: TrailNavigationPersistenceBoundaryState,
): boolean {
  return (
    previous.sessionId !== next.sessionId ||
    previous.status !== next.status ||
    previous.error !== next.error ||
    previous.nextWaypoint?.id !== next.nextWaypoint?.id ||
    previous.nextDecisionPoint?.id !== next.nextDecisionPoint?.id ||
    !sameStringArray(previous.reachedWaypointIds, next.reachedWaypointIds)
  );
}

/**
 * Coalesces high-frequency progress snapshots while preserving write order.
 * The latest pending value is flushed on the cadence boundary or disposal.
 */
export function createTrailNavigationPersistenceScheduler<T>(
  dependencies: TrailNavigationPersistenceSchedulerDependencies<T>,
): TrailNavigationPersistenceScheduler<T> {
  const now = dependencies.now ?? Date.now;
  const scheduleTimeout = dependencies.scheduleTimeout ??
    ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
  const cancelTimeout = dependencies.cancelTimeout ??
    ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const checkpointIntervalMs = Math.max(
    0,
    dependencies.checkpointIntervalMs ?? TRAIL_NAVIGATION_PROGRESS_PERSIST_INTERVAL_MS,
  );

  let lastWriteStartedAtMs: number | null = null;
  let pendingValue: T | null = null;
  let timeoutHandle: unknown = null;
  let disposed = false;
  let writeQueue = Promise.resolve();

  const clearScheduledTimeout = () => {
    if (timeoutHandle == null) return;
    cancelTimeout(timeoutHandle);
    timeoutHandle = null;
  };

  const enqueueWrite = (value: T): Promise<void> => {
    lastWriteStartedAtMs = now();
    const run = async () => {
      await dependencies.persist(value);
    };
    writeQueue = writeQueue.then(run, run);
    return writeQueue;
  };

  const flushPending = (): Promise<void> => {
    clearScheduledTimeout();
    if (pendingValue == null) return writeQueue;
    const latestValue = pendingValue;
    pendingValue = null;
    return enqueueWrite(latestValue);
  };

  const schedulePendingTimeout = () => {
    if (timeoutHandle != null || pendingValue == null || disposed) return;
    const elapsedMs = lastWriteStartedAtMs == null
      ? checkpointIntervalMs
      : Math.max(0, now() - lastWriteStartedAtMs);
    const remainingMs = Math.max(0, checkpointIntervalMs - elapsedMs);
    timeoutHandle = scheduleTimeout(() => {
      timeoutHandle = null;
      void flushPending().catch(() => undefined);
    }, remainingMs);
  };

  return {
    persistImmediate(value) {
      if (disposed) return writeQueue;
      pendingValue = null;
      clearScheduledTimeout();
      return enqueueWrite(value);
    },
    scheduleCheckpoint(value) {
      if (disposed) return;
      pendingValue = value;
      if (
        lastWriteStartedAtMs == null ||
        now() - lastWriteStartedAtMs >= checkpointIntervalMs
      ) {
        void flushPending().catch(() => undefined);
        return;
      }
      schedulePendingTimeout();
    },
    flushPending,
    async dispose() {
      if (disposed) {
        await writeQueue;
        return;
      }
      clearScheduledTimeout();
      const latestValue = pendingValue;
      pendingValue = null;
      disposed = true;
      if (latestValue != null) {
        await enqueueWrite(latestValue);
        return;
      }
      await writeQueue;
    },
    waitForIdle() {
      return writeQueue;
    },
  };
}
