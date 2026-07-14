import {
  DISPATCH_PERSISTENCE_SCHEMA_VERSION,
  dispatchPersistenceAdapter,
  type DispatchPersistenceDefaults,
  type DispatchPersistenceLoadResult,
  type DispatchPersistenceSnapshot,
} from './dispatchPersistenceAdapter';
import {
  cancelDispatchOfflineOperation,
  replayQueuedDispatchActions,
  retryDispatchOfflineOperation,
  type DispatchReplayInput,
  type DispatchReplayPublishResult,
  type DispatchReplayResult,
} from './dispatchOfflineReplayAdapter';
import {
  isMissionCommandRealtimeEnvelope,
  type DispatchRealtimeEnvelope,
  type DispatchRealtimeEventDraft,
  type DispatchRealtimeStatus,
} from './dispatchRealtimeAdapter';
import {
  appendMissionCommandEvent,
  mergeMissionCommand,
  normalizePersistedMissionCommand,
  normalizePersistedMissionCommandEvent,
} from './dispatchMissionCommandDomain';
import {
  mergeOperationalPlaybookInstance,
  normalizePersistedOperationalPlaybookInstance,
} from './dispatchOperationalPlaybookDomain';
import type { DispatchQueuedOfflineAction } from './dispatchTypes';
import {
  measureECSPerformanceSync,
  startECSPerformanceSpan,
} from './performance/ecsPerformanceDiagnostics';

export const MISSION_COMMAND_RUNTIME_SCHEMA_VERSION = DISPATCH_PERSISTENCE_SCHEMA_VERSION;

export interface MissionCommandRuntimeContext {
  accountId: string | null;
  expeditionId: string;
  defaults: DispatchPersistenceDefaults;
  clientId?: string;
  authorizedActorIds?: string[];
}

export interface MissionCommandRuntimeDiagnostics {
  schemaVersion: typeof MISSION_COMMAND_RUNTIME_SCHEMA_VERSION;
  hydrationStatus: 'idle' | 'hydrating' | 'ready' | 'recovered' | 'failed';
  persistenceSafeCode: string | null;
  outboxCount: number;
  queuedOperationCount: number;
  failedOperationCount: number;
  lastReplayAt: string | null;
  lastReplaySafeCode: string | null;
  realtimeStatus: DispatchRealtimeStatus;
  subscriptionCount: number;
  lastSuccessfulMergeAt: string | null;
}

export type MissionCommandIncomingResult = {
  applied: boolean;
  safeCode:
    | 'mission_runtime_applied'
    | 'mission_runtime_duplicate_or_stale'
    | 'mission_runtime_inactive'
    | 'mission_runtime_expedition_mismatch'
    | 'mission_runtime_own_echo'
    | 'mission_runtime_permission_denied'
    | 'mission_runtime_invalid_payload'
    | 'mission_runtime_unsupported_event';
};

type RuntimePublish = (
  event: DispatchRealtimeEventDraft,
) => Promise<DispatchReplayPublishResult>;

export interface DispatchMissionCommandRuntimeCoordinator {
  activate(context: MissionCommandRuntimeContext): void;
  deactivate(): void;
  hydrate(): Promise<DispatchPersistenceLoadResult | null>;
  replay(
    publish: RuntimePublish,
    persistCanonicalEntity?: DispatchReplayInput['persistCanonicalEntity'],
  ): Promise<DispatchReplayResult | null>;
  applyIncoming(event: DispatchRealtimeEnvelope): MissionCommandIncomingResult;
  retryOperation(operationId: string): DispatchQueuedOfflineAction;
  cancelOperation(operationId: string): DispatchQueuedOfflineAction;
  flush(): Promise<void>;
  setRealtimeStatus(status: DispatchRealtimeStatus, subscriptionCount?: number): void;
  refreshDiagnostics(): MissionCommandRuntimeDiagnostics;
  getDiagnostics(): MissionCommandRuntimeDiagnostics;
  subscribe(listener: () => void): () => void;
}

export function createDispatchMissionCommandRuntimeCoordinator(input?: {
  now?: () => number;
}): DispatchMissionCommandRuntimeCoordinator {
  const now = input?.now ?? Date.now;
  const listeners = new Set<() => void>();
  let context: MissionCommandRuntimeContext | null = null;
  let generation = 0;
  let hydrationFlight: Promise<DispatchPersistenceLoadResult | null> | null = null;
  let replayAbortController: AbortController | null = null;
  let diagnostics: MissionCommandRuntimeDiagnostics = createInitialDiagnostics();

  const emit = () => listeners.forEach((listener) => listener());
  const setDiagnostics = (patch: Partial<MissionCommandRuntimeDiagnostics>) => {
    const next = { ...diagnostics, ...patch };
    if (JSON.stringify(next) === JSON.stringify(diagnostics)) return;
    diagnostics = next;
    emit();
  };
  const refreshDiagnosticsFromSnapshot = (
    snapshot: DispatchPersistenceSnapshot,
  ): MissionCommandRuntimeDiagnostics => {
    const missionActions = snapshot.offlineActions.filter(isMissionCommandOperation);
    setDiagnostics({
      outboxCount: missionActions.filter((action) => (
        action.status === 'queued' || action.status === 'replaying' || action.status === 'failed'
      )).length,
      queuedOperationCount: missionActions.filter((action) => (
        action.status === 'queued' || action.status === 'replaying'
      )).length,
      failedOperationCount: missionActions.filter((action) => action.status === 'failed').length,
    });
    return diagnostics;
  };
  const refreshDiagnostics = (): MissionCommandRuntimeDiagnostics => {
    if (!context) return diagnostics;
    return refreshDiagnosticsFromSnapshot(
      dispatchPersistenceAdapter.load(context.expeditionId, context.defaults),
    );
  };

  return {
    activate(nextContext) {
      const nextKey = runtimeContextKey(nextContext);
      if (context && runtimeContextKey(context) === nextKey) {
        Object.assign(context, normalizeRuntimeContext(nextContext));
        refreshDiagnostics();
        return;
      }
      replayAbortController?.abort();
      replayAbortController = null;
      generation += 1;
      hydrationFlight = null;
      context = normalizeRuntimeContext(nextContext);
      diagnostics = createInitialDiagnostics();
      refreshDiagnostics();
      emit();
    },

    deactivate() {
      replayAbortController?.abort();
      replayAbortController = null;
      generation += 1;
      hydrationFlight = null;
      context = null;
      diagnostics = {
        ...createInitialDiagnostics(),
        realtimeStatus: 'closed',
      };
      emit();
    },

    hydrate() {
      if (!context) return Promise.resolve(null);
      if (hydrationFlight) return hydrationFlight;
      const activeGeneration = generation;
      const activeContext = context;
      setDiagnostics({ hydrationStatus: 'hydrating' });
      hydrationFlight = dispatchPersistenceAdapter.waitForHydration()
        .then(() => {
          if (generation !== activeGeneration || context !== activeContext) return null;
          const result = dispatchPersistenceAdapter.loadResult(
            activeContext.expeditionId,
            activeContext.defaults,
          );
          setDiagnostics({
            hydrationStatus: result.status,
            persistenceSafeCode: result.safeCode,
          });
          refreshDiagnostics();
          return result;
        })
        .catch(() => {
          if (generation === activeGeneration) {
            setDiagnostics({
              hydrationStatus: 'failed',
              persistenceSafeCode: 'dispatch_persistence_hydration_failed',
            });
          }
          return null;
        })
        .finally(() => {
          if (generation === activeGeneration) hydrationFlight = null;
        });
      return hydrationFlight;
    },

    async replay(publish, persistCanonicalEntity) {
      if (!context) return null;
      const replaySpan = startECSPerformanceSpan(
        'dispatch_ready',
        'mission_command_offline_replay',
        { trackOutstanding: true },
      );
      replayAbortController?.abort();
      const controller = new AbortController();
      replayAbortController = controller;
      const activeGeneration = generation;
      const activeContext = context;
      try {
        const result = await replayQueuedDispatchActions({
          expeditionId: activeContext.expeditionId,
          defaults: activeContext.defaults,
          publish,
          persistCanonicalEntity,
          signal: controller.signal,
          entityTypes: ['mission_command', 'mission_command_event', 'mission_playbook_instance'],
          now,
        });
        if (generation !== activeGeneration || context !== activeContext || controller.signal.aborted) {
          replaySpan.cancel({ reason: 'runtime_replaced' });
          return null;
        }
        setDiagnostics({
          lastReplayAt: new Date(now()).toISOString(),
          lastReplaySafeCode: result.failed > 0
            ? 'mission_runtime_replay_partial'
            : result.deferred > 0
              ? 'mission_runtime_replay_deferred'
              : 'mission_runtime_replay_complete',
        });
        refreshDiagnostics();
        replaySpan.end('completed', {
          attempted: result.attempted,
          replayed: result.replayed,
          failed: result.failed,
          deferred: result.deferred,
        });
        return result;
      } catch {
        if (controller.signal.aborted || generation !== activeGeneration) {
          replaySpan.cancel({ reason: 'runtime_replaced' });
        } else {
          replaySpan.end('failed', { safeCode: 'mission_runtime_replay_failed' });
        }
        if (generation === activeGeneration && !controller.signal.aborted) {
          setDiagnostics({
            lastReplayAt: new Date(now()).toISOString(),
            lastReplaySafeCode: 'mission_runtime_replay_failed',
          });
        }
        return null;
      } finally {
        if (replayAbortController === controller) replayAbortController = null;
      }
    },

    applyIncoming(event) {
      return measureECSPerformanceSync(
        'dispatch_ready',
        'mission_command_realtime_merge',
        () => {
      let persistedSnapshot: DispatchPersistenceSnapshot | null = null;
      if (!context) return { applied: false, safeCode: 'mission_runtime_inactive' };
      if (!isMissionCommandRealtimeEnvelope(event)) {
        return { applied: false, safeCode: 'mission_runtime_unsupported_event' };
      }
      if (event.expeditionId !== context.expeditionId) {
        return { applied: false, safeCode: 'mission_runtime_expedition_mismatch' };
      }
      if (context.clientId && event.originClientId === context.clientId) {
        return { applied: false, safeCode: 'mission_runtime_own_echo' };
      }

      if (event.type === 'mission_command_upsert') {
        const incoming = normalizePersistedMissionCommand(event.missionCommand);
        if (!incoming || incoming.expeditionId !== context.expeditionId) {
          return { applied: false, safeCode: 'mission_runtime_invalid_payload' };
        }
        if (!isAuthorizedActor(context, incoming.creator.id)) {
          return { applied: false, safeCode: 'mission_runtime_permission_denied' };
        }
        const snapshot = dispatchPersistenceAdapter.load(context.expeditionId, context.defaults);
        const current = snapshot.missionCommands.find((item) => (
          item.id === incoming.id || item.idempotencyKey === incoming.idempotencyKey
        ));
        const delivered = incoming.deliveryState === 'cancelled'
          ? incoming
          : { ...incoming, deliveryState: 'delivered' as const };
        const missionCommands = mergeMissionCommand(snapshot.missionCommands, delivered);
        const changed = !current || serializeMissionRecord(
          missionCommands.find((item) => item.id === (current?.id ?? incoming.id)),
        ) !== serializeMissionRecord(current);
        if (!changed) return { applied: false, safeCode: 'mission_runtime_duplicate_or_stale' };
        persistedSnapshot = dispatchPersistenceAdapter.save({ ...snapshot, missionCommands });
      } else if (event.type === 'mission_command_event_added') {
        const incoming = normalizePersistedMissionCommandEvent(event.missionCommandEvent);
        if (!incoming || incoming.expeditionId !== context.expeditionId) {
          return { applied: false, safeCode: 'mission_runtime_invalid_payload' };
        }
        if (!isAuthorizedActor(context, incoming.actor.id)) {
          return { applied: false, safeCode: 'mission_runtime_permission_denied' };
        }
        const snapshot = dispatchPersistenceAdapter.load(context.expeditionId, context.defaults);
        if (snapshot.missionCommandEvents.some((item) => (
          item.id === incoming.id || item.idempotencyKey === incoming.idempotencyKey
        ))) {
          return { applied: false, safeCode: 'mission_runtime_duplicate_or_stale' };
        }
        const missionCommandEvents = appendMissionCommandEvent(snapshot.missionCommandEvents, incoming);
        persistedSnapshot = dispatchPersistenceAdapter.save({ ...snapshot, missionCommandEvents });
      } else {
        const incoming = normalizePersistedOperationalPlaybookInstance(event.missionPlaybook);
        if (!incoming || incoming.expeditionId !== context.expeditionId) {
          return { applied: false, safeCode: 'mission_runtime_invalid_payload' };
        }
        if (!isAuthorizedActor(context, incoming.actor.id)) {
          return { applied: false, safeCode: 'mission_runtime_permission_denied' };
        }
        const snapshot = dispatchPersistenceAdapter.load(context.expeditionId, context.defaults);
        const current = snapshot.operationalPlaybooks.find((item) => (
          item.id === incoming.id || item.idempotencyKey === incoming.idempotencyKey
        ));
        const operationalPlaybooks = mergeOperationalPlaybookInstance(
          snapshot.operationalPlaybooks,
          incoming,
        );
        const merged = operationalPlaybooks.find((item) => item.id === (current?.id ?? incoming.id));
        if (current && serializeMissionRecord(merged) === serializeMissionRecord(current)) {
          return { applied: false, safeCode: 'mission_runtime_duplicate_or_stale' };
        }
        persistedSnapshot = dispatchPersistenceAdapter.save({ ...snapshot, operationalPlaybooks });
      }

      setDiagnostics({ lastSuccessfulMergeAt: new Date(now()).toISOString() });
      if (persistedSnapshot) refreshDiagnosticsFromSnapshot(persistedSnapshot);
      return { applied: true, safeCode: 'mission_runtime_applied' };
        },
        { eventType: event.type },
      );
    },

    retryOperation(operationId) {
      if (!context) throw new Error('Mission Command runtime is inactive.');
      const result = retryDispatchOfflineOperation(
        context.expeditionId,
        context.defaults,
        operationId,
        now,
      );
      refreshDiagnostics();
      return result;
    },

    cancelOperation(operationId) {
      if (!context) throw new Error('Mission Command runtime is inactive.');
      const result = cancelDispatchOfflineOperation(
        context.expeditionId,
        context.defaults,
        operationId,
        now,
      );
      refreshDiagnostics();
      return result;
    },

    flush() {
      return dispatchPersistenceAdapter.flush();
    },

    setRealtimeStatus(status, subscriptionCount = status === 'connected' ? 1 : 0) {
      setDiagnostics({
        realtimeStatus: status,
        subscriptionCount: Math.max(0, Math.floor(subscriptionCount)),
      });
    },

    refreshDiagnostics,

    getDiagnostics() {
      return { ...diagnostics };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function createInitialDiagnostics(): MissionCommandRuntimeDiagnostics {
  return {
    schemaVersion: MISSION_COMMAND_RUNTIME_SCHEMA_VERSION,
    hydrationStatus: 'idle',
    persistenceSafeCode: null,
    outboxCount: 0,
    queuedOperationCount: 0,
    failedOperationCount: 0,
    lastReplayAt: null,
    lastReplaySafeCode: null,
    realtimeStatus: 'disabled',
    subscriptionCount: 0,
    lastSuccessfulMergeAt: null,
  };
}

function normalizeRuntimeContext(context: MissionCommandRuntimeContext): MissionCommandRuntimeContext {
  return {
    ...context,
    authorizedActorIds: [...new Set(context.authorizedActorIds ?? [])].sort(),
  };
}

function runtimeContextKey(context: MissionCommandRuntimeContext): string {
  return [context.accountId ?? 'anonymous', context.expeditionId].join(':');
}

function isAuthorizedActor(context: MissionCommandRuntimeContext, actorId: string): boolean {
  const allowlist = context.authorizedActorIds ?? [];
  return actorId.length > 0 && allowlist.includes(actorId);
}

function isMissionCommandOperation(action: DispatchQueuedOfflineAction): boolean {
  return action.entityType === 'mission_command'
    || action.entityType === 'mission_command_event'
    || action.entityType === 'mission_playbook_instance';
}

function serializeMissionRecord(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export const dispatchMissionCommandRuntime = createDispatchMissionCommandRuntimeCoordinator();
