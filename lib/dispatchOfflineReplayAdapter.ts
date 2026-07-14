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

export interface DispatchReplayResult {
  snapshot: DispatchPersistenceSnapshot;
  attempted: number;
  replayed: number;
  failed: number;
  cancelled: number;
}

export interface DispatchReplayInput {
  expeditionId: string;
  defaults: DispatchPersistenceDefaults;
  publish: (event: DispatchRealtimeEventDraft) => Promise<boolean>;
  persistCadEvent?: (event: DispatchEvent) => Promise<boolean>;
  persistCanonicalEntity?: (
    entity: DispatchCanonicalEntity,
    action: DispatchQueuedOfflineAction,
  ) => Promise<boolean>;
  signal?: AbortSignal;
  maxActions?: number;
  now?: () => number;
}

type PreparedReplayEntity =
  | { type: 'ping'; value: DispatchPing; draft: DispatchRealtimeEventDraft }
  | { type: 'queue_item'; value: DispatchQueueItem; draft: DispatchRealtimeEventDraft }
  | { type: 'assignment'; value: DispatchAssignment; draft: DispatchRealtimeEventDraft }
  | { type: 'assist_request'; value: DispatchAssistRequest; draft: DispatchRealtimeEventDraft }
  | { type: 'acknowledgment'; value: DispatchAcknowledgment; draft: DispatchRealtimeEventDraft }
  | { type: 'timeline_event'; value: DispatchTimelineEvent; draft: DispatchRealtimeEventDraft };

function toCanonicalEntity(prepared: PreparedReplayEntity): DispatchCanonicalEntity {
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
  }
}

const DEFAULT_MAX_REPLAY_ACTIONS = 100;
const MAX_REPLAY_BACKOFF_MS = 5 * 60_000;
const replayFlights = new Map<string, Promise<DispatchReplayResult>>();

function shouldReplayCadEvent(event: DispatchEvent): boolean {
  return event.syncState === 'queued' || event.syncState === 'failed' || event.syncState === 'sending';
}

function shouldReplayAction(action: DispatchQueuedOfflineAction, nowMs: number): boolean {
  if (action.status !== 'queued' && action.status !== 'failed') return false;
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
    }).catch(() => false);
    return true;
  }

  return publish({
    type: 'cad_event_upsert',
    cadEvent: { ...cadEvent, syncState: 'received' },
  });
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
}: DispatchReplayInput): Promise<DispatchReplayResult> {
  let snapshot = dispatchPersistenceAdapter.load(expeditionId, defaults);
  let attempted = 0;
  let replayed = 0;
  let failed = 0;
  let cancelled = 0;
  const replayLimit = Math.max(1, Math.min(DEFAULT_MAX_REPLAY_ACTIONS, maxActions));
  const candidates = snapshot.offlineActions
    .filter((action) => shouldReplayAction(action, now()))
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .slice(0, replayLimit);

  for (const action of candidates) {
    if (signal?.aborted) {
      cancelled += 1;
      break;
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
      snapshot = updateOfflineAction(snapshot, markOfflineActionResult(replaying, false, now(), 'Dispatch replay source is unavailable.'));
      snapshot = dispatchPersistenceAdapter.save(snapshot);
      continue;
    }

    attempted += 1;
    let ok = false;
    try {
      const canonicalStored = persistCanonicalEntity
        ? await persistCanonicalEntity(toCanonicalEntity(prepared), action)
        : true;
      ok = canonicalStored && await publish(prepared.draft);
    } catch {
      ok = false;
    }

    if (ok) replayed += 1;
    else failed += 1;
    snapshot = applyReplayResult(snapshot, prepared, ok, new Date(now()).toISOString());
    snapshot = updateOfflineAction(
      snapshot,
      markOfflineActionResult(replaying, ok, now(), ok ? undefined : 'Dispatch delivery failed.'),
    );
    snapshot = dispatchPersistenceAdapter.save(snapshot);
  }

  const remainingBudget = Math.max(0, replayLimit - attempted);
  if (!signal?.aborted && remainingBudget > 0) {
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

  return { snapshot, attempted, replayed, failed, cancelled };
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
  ok: boolean,
  nowMs: number,
  error?: string,
): DispatchQueuedOfflineAction {
  const attemptCount = (action.attemptCount ?? 0) + 1;
  const nextAttemptAt = ok
    ? undefined
    : new Date(nowMs + Math.min(MAX_REPLAY_BACKOFF_MS, 3_000 * (2 ** Math.max(0, attemptCount - 1)))).toISOString();
  return transitionOfflineAction(action, ok ? 'replayed' : 'failed', {
    attemptCount,
    lastError: error,
    nextAttemptAt,
    replayedAt: ok ? new Date(nowMs).toISOString() : undefined,
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
