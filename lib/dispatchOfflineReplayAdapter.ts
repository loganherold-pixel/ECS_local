import {
  dispatchPersistenceAdapter,
  type DispatchPersistenceDefaults,
  type DispatchPersistenceSnapshot,
} from './dispatchPersistenceAdapter';
import {
  mergeDispatchAcknowledgment,
  mergeDispatchAssignment,
  mergeDispatchAssistRequest,
  mergeDispatchOfflineAction,
  mergeDispatchPing,
  mergeDispatchQueueItem,
  mergeDispatchTimelineEvent,
} from './dispatchIntegrity';
import { transitionDispatchOfflineActionStatus } from './dispatchLifecycle';
import type { DispatchRealtimeEventDraft } from './dispatchRealtimeAdapter';
import type { DispatchCanonicalEntity } from './dispatchCanonicalRepository';
import type {
  DispatchAcknowledgment,
  DispatchAssignment,
  DispatchAssistRequest,
  DispatchPing,
  DispatchQueueItem,
  DispatchQueuedOfflineAction,
  DispatchTimelineEvent,
} from './dispatchTypes';
import {
  markDispatchPingDeliveryResult,
  markDispatchQueueItemDeliveryResult,
  markDispatchTimelineEventDeliveryResult,
} from './dispatchSyncAdapter';
import type { DispatchEvent } from './dispatchLiveEvents';
import { mergeMissionCommand } from './dispatchMissionCommandDomain';
import type { MissionCommand, MissionCommandEvent } from './dispatchMissionCommandTypes';
import type { OperationalPlaybookInstance } from './dispatchOperationalPlaybookTypes';

export type DispatchReplayPublishResult = boolean | {
  ok: boolean;
  retryable?: boolean;
  safeCode?: string;
};

export interface DispatchReplayResult {
  snapshot: DispatchPersistenceSnapshot;
  attempted: number;
  replayed: number;
  failed: number;
  cancelled: number;
  deferred: number;
}

export interface DispatchReplayInput {
  expeditionId: string;
  defaults: DispatchPersistenceDefaults;
  publish: (event: DispatchRealtimeEventDraft) => Promise<DispatchReplayPublishResult>;
  persistCadEvent?: (event: DispatchEvent) => Promise<boolean>;
  persistCanonicalEntity?: (
    entity: DispatchCanonicalEntity,
    action: DispatchQueuedOfflineAction,
  ) => Promise<boolean>;
  signal?: AbortSignal;
  maxActions?: number;
  now?: () => number;
  entityTypes?: DispatchQueuedOfflineAction['entityType'][];
}

type PreparedReplayEntity =
  | { type: 'ping'; value: DispatchPing; draft: DispatchRealtimeEventDraft }
  | { type: 'queue_item'; value: DispatchQueueItem; draft: DispatchRealtimeEventDraft }
  | { type: 'assignment'; value: DispatchAssignment; draft: DispatchRealtimeEventDraft }
  | { type: 'assist_request'; value: DispatchAssistRequest; draft: DispatchRealtimeEventDraft }
  | { type: 'acknowledgment'; value: DispatchAcknowledgment; draft: DispatchRealtimeEventDraft }
  | { type: 'timeline_event'; value: DispatchTimelineEvent; draft: DispatchRealtimeEventDraft }
  | { type: 'mission_command'; value: MissionCommand; draft: DispatchRealtimeEventDraft }
  | { type: 'mission_command_event'; value: MissionCommandEvent; draft: DispatchRealtimeEventDraft }
  | { type: 'mission_playbook_instance'; value: OperationalPlaybookInstance; draft: DispatchRealtimeEventDraft };

function toCanonicalEntity(prepared: PreparedReplayEntity): DispatchCanonicalEntity | null {
  switch (prepared.type) {
    case 'ping':
      return { type: prepared.type, value: prepared.value };
    case 'queue_item':
      return { type: prepared.type, value: prepared.value };
    case 'assignment':
      return { type: prepared.type, value: prepared.value };
    case 'assist_request':
      return { type: prepared.type, value: prepared.value };
    case 'acknowledgment':
      return { type: prepared.type, value: prepared.value };
    case 'timeline_event':
      return { type: prepared.type, value: prepared.value };
    case 'mission_command':
      return { type: prepared.type, value: prepared.value };
    case 'mission_command_event':
      return { type: prepared.type, value: prepared.value };
    case 'mission_playbook_instance':
      return { type: prepared.type, value: prepared.value };
  }
}

const DEFAULT_MAX_REPLAY_ACTIONS = 100;
const MAX_REPLAY_BACKOFF_MS = 5 * 60_000;
const replayFlights = new Map<string, Promise<DispatchReplayResult>>();
const missionShadowFlights = new Map<string, Promise<void>>();

function enqueueMissionShadowWrite(
  expeditionId: string,
  persist: NonNullable<DispatchReplayInput['persistCanonicalEntity']>,
  entity: DispatchCanonicalEntity,
  action: DispatchQueuedOfflineAction,
): void {
  const previous = missionShadowFlights.get(expeditionId) ?? Promise.resolve();
  const flight = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        await persist(entity, action);
      } catch {
        // Shadow persistence is diagnostic-only and cannot affect delivery.
      }
    });
  missionShadowFlights.set(expeditionId, flight);
  void flight.finally(() => {
    if (missionShadowFlights.get(expeditionId) === flight) {
      missionShadowFlights.delete(expeditionId);
    }
  });
}

function shouldReplayCadEvent(event: DispatchEvent): boolean {
  return event.syncState === 'queued' || event.syncState === 'failed' || event.syncState === 'sending';
}

function shouldReplayAction(action: DispatchQueuedOfflineAction, nowMs: number): boolean {
  if (action.status !== 'queued' && action.status !== 'failed') return false;
  if (action.retryability === 'non_retryable') return false;
  if ((action.attemptCount ?? 0) >= (action.maxAttempts ?? 5)) return false;
  const nextAttemptMs = Date.parse(action.nextAttemptAt ?? '');
  return !Number.isFinite(nextAttemptMs) || nextAttemptMs <= nowMs;
}

async function publishCadEvent(
  cadEvent: DispatchEvent,
  publish: DispatchReplayInput['publish'],
  persistCadEvent?: DispatchReplayInput['persistCadEvent'],
): Promise<boolean> {
  if (persistCadEvent) {
    const durable = await persistCadEvent(cadEvent);
    if (!durable) return false;
    await publish({
      type: 'cad_event_upsert',
      cadEvent: { ...cadEvent, syncState: 'received' },
    }).then(normalizePublishResult).catch(() => ({ ok: false }));
    return true;
  }

  return publish({
    type: 'cad_event_upsert',
    cadEvent: { ...cadEvent, syncState: 'received' },
  }).then((result) => normalizePublishResult(result).ok);
}

export function replayQueuedDispatchActions(input: DispatchReplayInput): Promise<DispatchReplayResult> {
  const existing = replayFlights.get(input.expeditionId);
  if (existing) return existing;

  const flight = runReplay(input).finally(() => {
    if (replayFlights.get(input.expeditionId) === flight) {
      replayFlights.delete(input.expeditionId);
    }
  });
  replayFlights.set(input.expeditionId, flight);
  return flight;
}

async function runReplay({
  expeditionId,
  defaults,
  publish,
  persistCadEvent,
  persistCanonicalEntity,
  signal,
  maxActions = DEFAULT_MAX_REPLAY_ACTIONS,
  now = Date.now,
  entityTypes,
}: DispatchReplayInput): Promise<DispatchReplayResult> {
  let snapshot = dispatchPersistenceAdapter.load(expeditionId, defaults);
  let attempted = 0;
  let replayed = 0;
  let failed = 0;
  let cancelled = 0;
  let deferred = 0;
  const allowedEntityTypes = entityTypes ? new Set(entityTypes) : null;
  const replayLimit = Math.max(1, Math.min(DEFAULT_MAX_REPLAY_ACTIONS, maxActions));
  const candidates = snapshot.offlineActions
    .filter((action) => (!allowedEntityTypes || allowedEntityTypes.has(action.entityType)))
    .filter((action) => shouldReplayAction(action, now()))
    .sort(compareReplayOrder)
    .slice(0, replayLimit);

  for (const candidate of candidates) {
    if (signal?.aborted) {
      cancelled += 1;
      break;
    }

    snapshot = dispatchPersistenceAdapter.load(expeditionId, defaults);
    const action = snapshot.offlineActions.find((item) => item.id === candidate.id);
    if (!action || !shouldReplayAction(action, now())) continue;

    const dependencyState = getDependencyState(snapshot.offlineActions, action);
    if (dependencyState === 'waiting') {
      deferred += 1;
      continue;
    }
    if (dependencyState === 'blocked') {
      attempted += 1;
      failed += 1;
      snapshot = updateOfflineAction(snapshot, transitionOfflineAction(action, 'failed', {
        retryability: 'non_retryable',
        lastErrorCode: 'dispatch_replay_dependency_failed',
        lastError: 'A required Dispatch operation did not complete.',
        nextAttemptAt: undefined,
        updatedAt: new Date(now()).toISOString(),
      }));
      snapshot = dispatchPersistenceAdapter.save(snapshot);
      continue;
    }

    const replaying = transitionOfflineAction(action, 'replaying', {
      updatedAt: new Date(now()).toISOString(),
      lastError: undefined,
    });
    snapshot = updateOfflineAction(snapshot, replaying);
    snapshot = dispatchPersistenceAdapter.save(snapshot);

    const prepared = prepareReplayEntity(snapshot, action, new Date(now()).toISOString());
    if (!prepared) {
      attempted += 1;
      failed += 1;
      snapshot = updateOfflineAction(snapshot, markOfflineActionResult(
        replaying,
        { ok: false, retryable: false, safeCode: 'dispatch_replay_source_unavailable' },
        now(),
        'Dispatch replay source is unavailable.',
      ));
      snapshot = dispatchPersistenceAdapter.save(snapshot);
      continue;
    }

    attempted += 1;
    let publishResult: Required<Pick<Exclude<DispatchReplayPublishResult, boolean>, 'ok'>> & {
      retryable?: boolean;
      safeCode?: string;
    } = { ok: false, retryable: true, safeCode: 'dispatch_delivery_failed' };
    try {
      const canonicalEntity = toCanonicalEntity(prepared);
      const missionShadowWrite = canonicalEntity && (
        canonicalEntity.type === 'mission_command'
        || canonicalEntity.type === 'mission_command_event'
        || canonicalEntity.type === 'mission_playbook_instance'
      );
      if (missionShadowWrite) {
        // Mission canonical persistence is shadow-only. A backend mismatch or
        // outage must never change local/realtime operational delivery.
        publishResult = normalizePublishResult(await publish(prepared.draft));
        if (persistCanonicalEntity) {
          enqueueMissionShadowWrite(
            expeditionId,
            persistCanonicalEntity,
            canonicalEntity,
            action,
          );
        }
      } else {
        const canonicalStored = persistCanonicalEntity && canonicalEntity
          ? await persistCanonicalEntity(canonicalEntity, action)
          : true;
        publishResult = canonicalStored
          ? normalizePublishResult(await publish(prepared.draft))
          : { ok: false, retryable: true, safeCode: 'dispatch_canonical_write_failed' };
      }
    } catch (error) {
      publishResult = classifyReplayError(error);
    }

    if (publishResult.ok) replayed += 1;
    else failed += 1;
    // A command may change while transport is awaiting a provider. Reconcile
    // against the latest local snapshot so replay never overwrites that edit.
    snapshot = dispatchPersistenceAdapter.load(expeditionId, defaults);
    snapshot = applyReplayResult(snapshot, prepared, publishResult.ok, new Date(now()).toISOString());
    snapshot = updateOfflineAction(
      snapshot,
      markOfflineActionResult(
        replaying,
        publishResult,
        now(),
        publishResult.ok ? undefined : 'Dispatch delivery failed.',
      ),
    );
    snapshot = dispatchPersistenceAdapter.save(snapshot);
  }

  const remainingBudget = Math.max(0, replayLimit - attempted);
  if (!allowedEntityTypes && !signal?.aborted && remainingBudget > 0) {
    const nextCadEvents: DispatchEvent[] = [];
    let cadBudget = remainingBudget;
    for (let eventIndex = 0; eventIndex < snapshot.cadEvents.length; eventIndex += 1) {
      const event = snapshot.cadEvents[eventIndex];
      if (!shouldReplayCadEvent(event) || cadBudget <= 0) {
        nextCadEvents.push(event);
        continue;
      }
      if (signal?.aborted) {
        cancelled += snapshot.cadEvents.length - eventIndex;
        nextCadEvents.push(...snapshot.cadEvents.slice(eventIndex));
        break;
      }

      cadBudget -= 1;
      attempted += 1;
      const sendingEvent: DispatchEvent = { ...event, syncState: 'sending' };
      const ok = await publishCadEvent(sendingEvent, publish, persistCadEvent).catch(() => false);
      if (ok) replayed += 1;
      else failed += 1;
      nextCadEvents.push({ ...sendingEvent, syncState: ok ? 'sent' : 'failed' });
    }
    snapshot = dispatchPersistenceAdapter.save({
      ...snapshot,
      cadEvents: nextCadEvents,
    });
  }

  return { snapshot, attempted, replayed, failed, cancelled, deferred };
}

function prepareReplayEntity(
  snapshot: DispatchPersistenceSnapshot,
  action: DispatchQueuedOfflineAction,
  updatedAt: string,
): PreparedReplayEntity | null {
  const find = <T extends { id: string }>(items: T[]) => items.find((item) => item.id === action.sourceEntityId);
  switch (action.entityType) {
    case 'ping': {
      const source = find(snapshot.pings);
      if (!source) return null;
      const value: DispatchPing = {
        ...source,
        status: 'sent',
        reliabilityState: 'sent',
        updatedAt,
        version: (source.version ?? 1) + 1,
      };
      return { type: 'ping', value, draft: { type: 'ping_upsert', ping: value } };
    }
    case 'queue_item': {
      const source = find(snapshot.queueItems);
      if (!source) return null;
      const value: DispatchQueueItem = {
        ...source,
        deliveryState: 'sent',
        reliabilityState: 'sent',
        updatedAt,
        version: (source.version ?? 1) + 1,
      };
      return { type: 'queue_item', value, draft: { type: 'queue_item_upsert', queueItem: value } };
    }
    case 'assignment': {
      const source = find(snapshot.assignments);
      if (!source) return null;
      const value: DispatchAssignment = {
        ...source,
        deliveryState: 'sent',
        updatedAt,
        version: (source.version ?? 1) + 1,
      };
      return { type: 'assignment', value, draft: { type: 'assignment_upsert', assignment: value } };
    }
    case 'assist_request': {
      const source = find(snapshot.assistRequests);
      if (!source) return null;
      const value: DispatchAssistRequest = {
        ...source,
        deliveryState: 'sent',
        updatedAt,
        version: (source.version ?? 1) + 1,
      };
      return { type: 'assist_request', value, draft: { type: 'assist_request_upsert', assistRequest: value } };
    }
    case 'acknowledgment': {
      const source = find(snapshot.acknowledgments);
      if (!source) return null;
      const value: DispatchAcknowledgment = {
        ...source,
        deliveryState: 'sent',
        updatedAt,
        version: (source.version ?? 1) + 1,
      };
      return { type: 'acknowledgment', value, draft: { type: 'acknowledgment_upsert', acknowledgment: value } };
    }
    case 'timeline_event': {
      const source = find(snapshot.timelineEvents);
      if (!source) return null;
      const value: DispatchTimelineEvent = {
        ...source,
        deliveryState: 'sent',
        version: (source.version ?? 1) + 1,
      };
      return { type: 'timeline_event', value, draft: { type: 'timeline_event_added', timelineEvent: value } };
    }
    case 'mission_command': {
      const source = find(snapshot.missionCommands);
      if (!source || source.target.kind === 'solo') return null;
      const value: MissionCommand = source.deliveryState === 'delivered'
        ? source
        : {
            ...source,
            deliveryState: 'sent',
            updatedAt,
            version: source.version + 1,
          };
      return {
        type: 'mission_command',
        value,
        draft: { type: 'mission_command_upsert', missionCommand: value },
      };
    }
    case 'mission_command_event': {
      const source = find(snapshot.missionCommandEvents);
      if (!source) return null;
      const command = snapshot.missionCommands.find((item) => item.id === source.commandId);
      if (!command || command.target.kind === 'solo') return null;
      return {
        type: 'mission_command_event',
        value: source,
        draft: { type: 'mission_command_event_added', missionCommandEvent: source },
      };
    }
    case 'mission_playbook_instance': {
      const source = find(snapshot.operationalPlaybooks);
      if (!source) return null;
      return {
        type: 'mission_playbook_instance',
        value: source,
        draft: { type: 'mission_playbook_upsert', missionPlaybook: source },
      };
    }
    default:
      return null;
  }
}

function applyReplayResult(
  snapshot: DispatchPersistenceSnapshot,
  prepared: PreparedReplayEntity,
  ok: boolean,
  updatedAt: string,
): DispatchPersistenceSnapshot {
  switch (prepared.type) {
    case 'ping':
      return { ...snapshot, pings: mergeDispatchPing(snapshot.pings, markDispatchPingDeliveryResult(prepared.value, ok, updatedAt)) };
    case 'queue_item':
      return { ...snapshot, queueItems: mergeDispatchQueueItem(snapshot.queueItems, markDispatchQueueItemDeliveryResult(prepared.value, ok, updatedAt)) };
    case 'assignment':
      return {
        ...snapshot,
        assignments: mergeDispatchAssignment(snapshot.assignments, {
          ...prepared.value,
          deliveryState: ok ? 'sent' : 'failed',
          updatedAt,
          version: (prepared.value.version ?? 1) + 1,
        }),
      };
    case 'assist_request':
      return {
        ...snapshot,
        assistRequests: mergeDispatchAssistRequest(snapshot.assistRequests, {
          ...prepared.value,
          deliveryState: ok ? 'sent' : 'failed',
          updatedAt,
          version: (prepared.value.version ?? 1) + 1,
        }),
      };
    case 'acknowledgment':
      return {
        ...snapshot,
        acknowledgments: mergeDispatchAcknowledgment(snapshot.acknowledgments, {
          ...prepared.value,
          deliveryState: ok ? 'sent' : 'failed',
          updatedAt,
          version: (prepared.value.version ?? 1) + 1,
        }),
      };
    case 'timeline_event':
      return {
        ...snapshot,
        timelineEvents: mergeDispatchTimelineEvent(
          snapshot.timelineEvents,
          markDispatchTimelineEventDeliveryResult(prepared.value, ok),
        ),
      };
    case 'mission_command':
      return {
        ...snapshot,
        missionCommands: mergeMissionCommand(snapshot.missionCommands, ok
          ? prepared.value
          : {
              ...prepared.value,
              deliveryState: prepared.value.deliveryState === 'delivered' ? 'delivered' : 'failed',
              updatedAt,
              version: prepared.value.version + 1,
            }),
      };
    case 'mission_command_event':
    case 'mission_playbook_instance':
      return snapshot;
  }
}

function transitionOfflineAction(
  action: DispatchQueuedOfflineAction,
  status: DispatchQueuedOfflineAction['status'],
  patch: Partial<DispatchQueuedOfflineAction> = {},
): DispatchQueuedOfflineAction {
  const transition = transitionDispatchOfflineActionStatus(action.status, status);
  if (!transition.ok) return action;
  return {
    ...action,
    ...patch,
    status: transition.state,
    version: (action.version ?? 1) + 1,
  };
}

function markOfflineActionResult(
  action: DispatchQueuedOfflineAction,
  result: { ok: boolean; retryable?: boolean; safeCode?: string },
  nowMs: number,
  error?: string,
): DispatchQueuedOfflineAction {
  const attemptCount = (action.attemptCount ?? 0) + 1;
  const exhausted = attemptCount >= (action.maxAttempts ?? 5);
  const retryable = !result.ok && result.retryable !== false && !exhausted;
  const nextAttemptAt = result.ok || !retryable
    ? undefined
    : new Date(nowMs + Math.min(MAX_REPLAY_BACKOFF_MS, 3_000 * (2 ** Math.max(0, attemptCount - 1)))).toISOString();
  return transitionOfflineAction(action, result.ok ? 'replayed' : 'failed', {
    attemptCount,
    lastError: error,
    lastErrorCode: result.ok ? undefined : normalizeSafeCode(result.safeCode) ?? 'dispatch_delivery_failed',
    retryability: result.ok || retryable ? 'retryable' : 'non_retryable',
    nextAttemptAt,
    replayedAt: result.ok ? new Date(nowMs).toISOString() : undefined,
    updatedAt: new Date(nowMs).toISOString(),
  });
}

function updateOfflineAction(
  snapshot: DispatchPersistenceSnapshot,
  action: DispatchQueuedOfflineAction,
): DispatchPersistenceSnapshot {
  return {
    ...snapshot,
    offlineActions: mergeDispatchOfflineAction(snapshot.offlineActions, action),
  };
}

export function retryDispatchOfflineOperation(
  expeditionId: string,
  defaults: DispatchPersistenceDefaults,
  operationId: string,
  now = Date.now,
): DispatchQueuedOfflineAction {
  const snapshot = dispatchPersistenceAdapter.load(expeditionId, defaults);
  const current = snapshot.offlineActions.find((action) => action.id === operationId);
  if (!current || current.status !== 'failed') {
    throw new Error('Dispatch operation is not available for retry.');
  }
  const next = transitionOfflineAction(current, 'queued', {
    attemptCount: 0,
    retryability: 'retryable',
    nextAttemptAt: undefined,
    lastError: undefined,
    lastErrorCode: undefined,
    updatedAt: new Date(now()).toISOString(),
  });
  dispatchPersistenceAdapter.save(updateOfflineAction(snapshot, next));
  return next;
}

export function cancelDispatchOfflineOperation(
  expeditionId: string,
  defaults: DispatchPersistenceDefaults,
  operationId: string,
  now = Date.now,
): DispatchQueuedOfflineAction {
  const snapshot = dispatchPersistenceAdapter.load(expeditionId, defaults);
  const current = snapshot.offlineActions.find((action) => action.id === operationId);
  if (!current || (current.status !== 'queued' && current.status !== 'failed')) {
    throw new Error('Dispatch operation is not available for cancellation.');
  }
  const cancelledAt = new Date(now()).toISOString();
  const next = transitionOfflineAction(current, 'cancelled', {
    cancelledAt,
    updatedAt: cancelledAt,
    nextAttemptAt: undefined,
  });
  dispatchPersistenceAdapter.save(updateOfflineAction(snapshot, next));
  return next;
}

function getDependencyState(
  actions: DispatchQueuedOfflineAction[],
  action: DispatchQueuedOfflineAction,
): 'ready' | 'waiting' | 'blocked' {
  if (!action.dependsOnOperationIds?.length) return 'ready';
  let waiting = false;
  for (const operationId of action.dependsOnOperationIds) {
    const dependency = actions.find((candidate) => candidate.id === operationId);
    if (!dependency) return 'blocked';
    if (dependency.status === 'replayed') continue;
    if (
      dependency.status === 'cancelled' ||
      dependency.retryability === 'non_retryable' ||
      (dependency.attemptCount ?? 0) >= (dependency.maxAttempts ?? 5)
    ) {
      return 'blocked';
    }
    waiting = true;
  }
  return waiting ? 'waiting' : 'ready';
}

function compareReplayOrder(
  left: DispatchQueuedOfflineAction,
  right: DispatchQueuedOfflineAction,
): number {
  if (right.dependsOnOperationIds?.includes(left.id)) return -1;
  if (left.dependsOnOperationIds?.includes(right.id)) return 1;
  return Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id);
}

function normalizePublishResult(result: DispatchReplayPublishResult): {
  ok: boolean;
  retryable?: boolean;
  safeCode?: string;
} {
  if (typeof result === 'boolean') {
    return result
      ? { ok: true }
      : { ok: false, retryable: true, safeCode: 'dispatch_delivery_failed' };
  }
  return {
    ok: result.ok === true,
    retryable: result.ok ? undefined : result.retryable !== false,
    safeCode: normalizeSafeCode(result.safeCode),
  };
}

function classifyReplayError(error: unknown): {
  ok: false;
  retryable: boolean;
  safeCode: string;
} {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const rawCode = normalizeSafeCode(record.code) ?? normalizeSafeCode(record.name);
  const nonRetryableCodes = new Set([
    'permission_denied',
    'validation_error',
    'scope_mismatch',
    'unsupported',
    'not_authorized',
  ]);
  return {
    ok: false,
    retryable: !rawCode || !nonRetryableCodes.has(rawCode),
    safeCode: rawCode ? `dispatch_replay_${rawCode}` : 'dispatch_replay_unexpected',
  };
}

function normalizeSafeCode(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(normalized) ? normalized : undefined;
}
