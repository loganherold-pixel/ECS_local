import {
  dispatchCanonicalRepository,
  type DispatchCanonicalContext,
  type DispatchCanonicalEntity,
  type DispatchCanonicalEntityType,
  type DispatchCanonicalRemoteSnapshot,
  type DispatchCanonicalRepository,
  type DispatchCanonicalResult,
  type DispatchCanonicalSubscription,
} from './dispatchCanonicalRepository';
import {
  mergeDispatchAcknowledgmentBatch,
  mergeDispatchAssignmentBatch,
  mergeDispatchAssistRequestBatch,
  mergeDispatchPingBatch,
  mergeDispatchQueueItemBatch,
  mergeDispatchTimelineEventBatch,
} from './dispatchIntegrity';
import type { DispatchPersistenceSnapshot } from './dispatchPersistenceAdapter';
import type { DispatchCanonicalBackendMode } from './dispatchRolloutConfig';

export interface DispatchCanonicalMigrationDiagnostics {
  schemaVersion: 1;
  mode: DispatchCanonicalBackendMode;
  sourceAuthority: 'local_first';
  outstandingJobs: number;
  writesAttempted: number;
  writesApplied: number;
  writesFailed: number;
  pullsAttempted: number;
  pullsApplied: number;
  pullsFailed: number;
  shadowDifferences: number;
  partialPulls: number;
  lastTruncatedTables: string[];
  realtimeNotifications: number;
  coalescedRealtimeNotifications: number;
  lastServerRevision: number | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  lastError: string | null;
}

export interface DispatchCanonicalHydrationResult {
  snapshot: DispatchPersistenceSnapshot;
  applied: boolean;
  shadowDifferenceCount: number;
  serverRevision: number | null;
}

export interface DispatchCanonicalRealtimeLease {
  unsubscribe(): void;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REALTIME_PULL_COALESCE_MS = 300;

function sanitizeMigrationError(error: unknown): string {
  return String(error instanceof Error ? error.message : error ?? 'Canonical Dispatch request failed.')
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[a-z0-9._-]+/gi, '[redacted-token]')
    .replace(/(?:service[_-]?role|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*\S+/gi, '[redacted-secret]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

function countIdentityDifferences(
  local: DispatchPersistenceSnapshot,
  remote: {
    pings: { id: string }[];
    queueItems: { id: string }[];
    assignments: { id: string }[];
    assistRequests: { id: string }[];
    acknowledgments: { id: string }[];
    timelineEvents: { id: string }[];
    tombstones: Partial<Record<DispatchCanonicalEntityType, string[]>>;
  },
): number {
  const difference = (left: { id: string }[], right: { id: string }[]) => {
    const leftIds = new Set(left.map((item) => item.id));
    const rightIds = new Set(right.map((item) => item.id));
    let count = 0;
    leftIds.forEach((id) => { if (!rightIds.has(id)) count += 1; });
    rightIds.forEach((id) => { if (!leftIds.has(id)) count += 1; });
    return count;
  };

  return (
    difference(local.pings, remote.pings) +
    difference(local.queueItems, remote.queueItems) +
    difference(local.assignments, remote.assignments) +
    difference(local.assistRequests, remote.assistRequests) +
    difference(local.acknowledgments, remote.acknowledgments) +
    difference(local.timelineEvents, remote.timelineEvents) +
    Object.values(remote.tombstones).reduce((total, ids) => total + (ids?.length ?? 0), 0)
  );
}

function withoutTombstones<T extends { id: string }>(items: T[], ids: string[] | undefined): T[] {
  if (!ids?.length) return items;
  const tombstones = new Set(ids);
  return items.filter((item) => !tombstones.has(item.id));
}

export function reconcileCanonicalDispatchSnapshot(
  local: DispatchPersistenceSnapshot,
  remote: DispatchCanonicalRemoteSnapshot,
): DispatchPersistenceSnapshot {
  return {
    ...local,
    pings: mergeDispatchPingBatch([
      ...withoutTombstones(local.pings, remote.tombstones.ping),
      ...remote.pings,
    ]),
    queueItems: mergeDispatchQueueItemBatch([
      ...withoutTombstones(local.queueItems, remote.tombstones.queue_item),
      ...remote.queueItems,
    ]),
    assignments: mergeDispatchAssignmentBatch([
      ...withoutTombstones(local.assignments, remote.tombstones.assignment),
      ...remote.assignments,
    ]),
    assistRequests: mergeDispatchAssistRequestBatch([
      ...withoutTombstones(local.assistRequests, remote.tombstones.assist_request),
      ...remote.assistRequests,
    ]),
    acknowledgments: mergeDispatchAcknowledgmentBatch([
      ...local.acknowledgments,
      ...remote.acknowledgments,
    ]),
    timelineEvents: mergeDispatchTimelineEventBatch([
      ...local.timelineEvents,
      ...remote.timelineEvents,
    ]),
    updatedAt: new Date().toISOString(),
  };
}

export function resolveDispatchCanonicalContext(input: {
  expeditionId: string | null | undefined;
  convoyId: string | null | undefined;
  actorUserId?: string | null;
}): DispatchCanonicalContext | null {
  const expeditionId = input.expeditionId?.trim();
  if (!expeditionId) return null;
  const convoyId = input.convoyId?.trim();
  if (!convoyId || !UUID_PATTERN.test(convoyId)) return null;
  return {
    expeditionId,
    convoyId,
    actorUserId: input.actorUserId ?? null,
  };
}

export class DispatchCanonicalMigrationCoordinator {
  private diagnostics: DispatchCanonicalMigrationDiagnostics;
  private readonly pullFlights = new Map<string, Promise<DispatchCanonicalHydrationResult>>();

  constructor(
    private readonly mode: DispatchCanonicalBackendMode,
    private readonly repository: DispatchCanonicalRepository = dispatchCanonicalRepository,
  ) {
    this.diagnostics = {
      schemaVersion: 1,
      mode,
      sourceAuthority: 'local_first',
      outstandingJobs: 0,
      writesAttempted: 0,
      writesApplied: 0,
      writesFailed: 0,
      pullsAttempted: 0,
      pullsApplied: 0,
      pullsFailed: 0,
      shadowDifferences: 0,
      partialPulls: 0,
      lastTruncatedTables: [],
      realtimeNotifications: 0,
      coalescedRealtimeNotifications: 0,
      lastServerRevision: null,
      lastSuccessAt: null,
      lastErrorCode: null,
      lastError: null,
    };
  }

  getDiagnostics(): DispatchCanonicalMigrationDiagnostics {
    return { ...this.diagnostics };
  }

  async persistEntity(
    context: DispatchCanonicalContext,
    entity: DispatchCanonicalEntity,
  ): Promise<DispatchCanonicalResult<{ id: string; serverRevision: number | null }>> {
    if (this.mode === 'disabled') {
      return {
        ok: false,
        code: 'backend_unavailable',
        error: 'Canonical Dispatch persistence is disabled. Local Dispatch remains authoritative.',
      };
    }

    this.diagnostics.writesAttempted += 1;
    this.diagnostics.outstandingJobs += 1;
    try {
      const result = await this.repository.upsertEntity(context, entity);
      if (result.ok) {
        this.diagnostics.writesApplied += 1;
        this.diagnostics.lastServerRevision = result.data.serverRevision;
        this.markSuccess();
      } else {
        this.diagnostics.writesFailed += 1;
        this.markFailure(result.code, result.error);
      }
      return result;
    } catch (error) {
      this.diagnostics.writesFailed += 1;
      const message = sanitizeMigrationError(error);
      this.markFailure('backend_error', message);
      return { ok: false, code: 'backend_error', error: message };
    } finally {
      this.diagnostics.outstandingJobs = Math.max(0, this.diagnostics.outstandingJobs - 1);
    }
  }

  hydrate(
    context: DispatchCanonicalContext,
    local: DispatchPersistenceSnapshot,
  ): Promise<DispatchCanonicalHydrationResult> {
    if (this.mode === 'disabled') {
      return Promise.resolve({
        snapshot: local,
        applied: false,
        shadowDifferenceCount: 0,
        serverRevision: null,
      });
    }

    const key = `${context.expeditionId}:${context.convoyId}`;
    const existing = this.pullFlights.get(key);
    if (existing) return existing;

    const flight = this.runHydration(context, local).finally(() => {
      if (this.pullFlights.get(key) === flight) this.pullFlights.delete(key);
    });
    this.pullFlights.set(key, flight);
    return flight;
  }

  subscribe(input: {
    context: DispatchCanonicalContext;
    getLocalSnapshot(): DispatchPersistenceSnapshot;
    onHydrated(result: DispatchCanonicalHydrationResult): void;
  }): DispatchCanonicalRealtimeLease {
    if (this.mode === 'disabled') return { unsubscribe() {} };

    let closed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pullRunning = false;
    let pullPending = false;
    let subscription: DispatchCanonicalSubscription | null = null;

    const armPull = () => {
      timer = setTimeout(() => {
        timer = null;
        if (closed) return;
        pullRunning = true;
        pullPending = false;
        void this.hydrate(input.context, input.getLocalSnapshot()).then((result) => {
          if (!closed) input.onHydrated(result);
        }).finally(() => {
          pullRunning = false;
          if (closed || !pullPending) return;
          pullPending = false;
          armPull();
        });
      }, REALTIME_PULL_COALESCE_MS);
    };

    const schedulePull = () => {
      this.diagnostics.realtimeNotifications += 1;
      if (timer) {
        this.diagnostics.coalescedRealtimeNotifications += 1;
        return;
      }
      if (pullRunning) {
        this.diagnostics.coalescedRealtimeNotifications += 1;
        pullPending = true;
        return;
      }
      armPull();
    };

    subscription = this.repository.subscribe(input.context, {
      onChange: schedulePull,
      onStatus: (_status, error) => {
        if (error) this.markFailure('realtime_degraded', error);
      },
    });

    return {
      unsubscribe() {
        closed = true;
        if (timer) clearTimeout(timer);
        timer = null;
        subscription?.unsubscribe();
        subscription = null;
      },
    };
  }

  private async runHydration(
    context: DispatchCanonicalContext,
    local: DispatchPersistenceSnapshot,
  ): Promise<DispatchCanonicalHydrationResult> {
    this.diagnostics.pullsAttempted += 1;
    this.diagnostics.outstandingJobs += 1;
    try {
      const remote = await this.repository.pullExpedition(context);
      if (!remote.ok) {
        this.diagnostics.pullsFailed += 1;
        this.markFailure(remote.code, remote.error);
        return {
          snapshot: local,
          applied: false,
          shadowDifferenceCount: 0,
          serverRevision: null,
        };
      }

      const differences = countIdentityDifferences(local, remote.data);
      this.diagnostics.shadowDifferences += differences;
      this.diagnostics.lastTruncatedTables = [...remote.data.truncatedTables];
      if (remote.data.truncatedTables.length > 0) this.diagnostics.partialPulls += 1;
      this.diagnostics.lastServerRevision = remote.data.serverRevision;
      this.diagnostics.pullsApplied += 1;
      this.markSuccess();
      if (this.mode === 'shadow') {
        return {
          snapshot: local,
          applied: false,
          shadowDifferenceCount: differences,
          serverRevision: remote.data.serverRevision,
        };
      }

      return {
        snapshot: reconcileCanonicalDispatchSnapshot(local, remote.data),
        applied: true,
        shadowDifferenceCount: differences,
        serverRevision: remote.data.serverRevision,
      };
    } catch (error) {
      this.diagnostics.pullsFailed += 1;
      this.markFailure('backend_error', sanitizeMigrationError(error));
      return {
        snapshot: local,
        applied: false,
        shadowDifferenceCount: 0,
        serverRevision: null,
      };
    } finally {
      this.diagnostics.outstandingJobs = Math.max(0, this.diagnostics.outstandingJobs - 1);
    }
  }

  private markSuccess() {
    this.diagnostics.lastSuccessAt = new Date().toISOString();
    this.diagnostics.lastErrorCode = null;
    this.diagnostics.lastError = null;
  }

  private markFailure(code: string, error: string) {
    this.diagnostics.lastErrorCode = code;
    this.diagnostics.lastError = sanitizeMigrationError(error);
  }
}
