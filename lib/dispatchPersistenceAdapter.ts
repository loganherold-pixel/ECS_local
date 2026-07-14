import { createPersistedKeyValueCache } from './keyValuePersistence';
import {
  createDispatchOfflineAction,
  mergeDispatchAcknowledgment,
  mergeDispatchAcknowledgmentBatch,
  mergeDispatchAssignment,
  mergeDispatchAssignmentBatch,
  mergeDispatchAssistRequest,
  mergeDispatchAssistRequestBatch,
  mergeDispatchOfflineAction,
  mergeDispatchOfflineActionBatch,
  mergeDispatchPing,
  mergeDispatchPingBatch,
  mergeDispatchQueueItem,
  mergeDispatchQueueItemBatch,
  mergeDispatchTimelineEvent,
  mergeDispatchTimelineEventBatch,
} from './dispatchIntegrity';
import { deriveDispatchPingOperationalState } from './dispatchLifecycle';
import {
  appendMissionCommandEvent as appendMissionCommandEventRecord,
  mergeMissionCommandBatch,
  mergeMissionCommandEventBatch,
  mergeMissionCommand,
} from './dispatchMissionCommandDomain';
import {
  mergeGuardianCheckInPlan,
  mergeGuardianCheckInPlanBatch,
} from './dispatchGuardianCheckInDomain';
import {
  mergeOperationalPlaybookInstance,
  mergeOperationalPlaybookInstanceBatch,
} from './dispatchOperationalPlaybookDomain';
import {
  normalizeDispatchEvent,
  sortDispatchEvents,
  type DispatchEvent,
} from './dispatchLiveEvents';
import type { MissionCommand, MissionCommandEvent } from './dispatchMissionCommandTypes';
import type { GuardianCheckInPlan } from './dispatchGuardianCheckInTypes';
import type { OperationalPlaybookInstance } from './dispatchOperationalPlaybookTypes';
import type {
  DispatchAcknowledgment,
  DispatchAssignment,
  DispatchAssistRequest,
  DispatchPing,
  DispatchQueueItem,
  DispatchQueuedOfflineAction,
  DispatchTimelineEvent,
} from './dispatchTypes';

const STORAGE_FILE = 'ecs_dispatch_persistence';
export const DISPATCH_PERSISTENCE_SCHEMA_VERSION = 7 as const;
const STORAGE_VERSION = DISPATCH_PERSISTENCE_SCHEMA_VERSION;
const DISPATCH_CAD_EVENT_PERSISTENCE_LIMIT = 300;
const persistence = createPersistedKeyValueCache(STORAGE_FILE);
const persistenceListeners = new Set<(expeditionId: string) => void>();
const persistenceRevisions = new Map<string, number>();

// This remains the authoritative local store. The guarded canonical backend
// coordinator mirrors its durable outbox only when the default-off rollout is
// explicitly placed in shadow or dual-read mode.

export interface DispatchPersistenceSnapshot {
  version: number;
  expeditionId: string;
  pings: DispatchPing[];
  queueItems: DispatchQueueItem[];
  assignments: DispatchAssignment[];
  assistRequests: DispatchAssistRequest[];
  acknowledgments: DispatchAcknowledgment[];
  timelineEvents: DispatchTimelineEvent[];
  offlineActions: DispatchQueuedOfflineAction[];
  cadEvents: DispatchEvent[];
  missionCommands: MissionCommand[];
  missionCommandEvents: MissionCommandEvent[];
  guardianCheckIns: GuardianCheckInPlan[];
  operationalPlaybooks: OperationalPlaybookInstance[];
  updatedAt: string;
}

export interface DispatchPersistenceDefaults {
  pings: DispatchPing[];
  queueItems: DispatchQueueItem[];
  assignments: DispatchAssignment[];
  assistRequests?: DispatchAssistRequest[];
  acknowledgments?: DispatchAcknowledgment[];
  timelineEvents: DispatchTimelineEvent[];
  offlineActions?: DispatchQueuedOfflineAction[];
  cadEvents?: DispatchEvent[];
  missionCommands?: MissionCommand[];
  missionCommandEvents?: MissionCommandEvent[];
  guardianCheckIns?: GuardianCheckInPlan[];
  operationalPlaybooks?: OperationalPlaybookInstance[];
}

export interface DispatchPersistenceLoadResult {
  snapshot: DispatchPersistenceSnapshot;
  status: 'ready' | 'recovered';
  safeCode: 'dispatch_persistence_ready' | 'dispatch_persistence_corrupt' | 'dispatch_persistence_partial';
}

function getStorageKey(expeditionId: string): string {
  return `dispatch_state_${expeditionId}`;
}

function createSnapshot(
  expeditionId: string,
  defaults: DispatchPersistenceDefaults,
): DispatchPersistenceSnapshot {
  return {
    version: STORAGE_VERSION,
    expeditionId,
    pings: [...defaults.pings],
    queueItems: [...defaults.queueItems],
    assignments: [...defaults.assignments],
    assistRequests: [...(defaults.assistRequests ?? [])],
    acknowledgments: [...(defaults.acknowledgments ?? [])],
    timelineEvents: [...defaults.timelineEvents],
    offlineActions: [...(defaults.offlineActions ?? [])],
    cadEvents: [...(defaults.cadEvents ?? [])],
    missionCommands: [...(defaults.missionCommands ?? [])],
    missionCommandEvents: [...(defaults.missionCommandEvents ?? [])],
    guardianCheckIns: [...(defaults.guardianCheckIns ?? [])],
    operationalPlaybooks: [...(defaults.operationalPlaybooks ?? [])],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSnapshot(
  expeditionId: string,
  raw: unknown,
  defaults: DispatchPersistenceDefaults,
): DispatchPersistenceSnapshot {
  if (!raw || typeof raw !== 'object') {
    return createSnapshot(expeditionId, defaults);
  }

  const candidate = raw as Partial<DispatchPersistenceSnapshot>;
  const missionCommands = Array.isArray(candidate.missionCommands)
    ? migrateMissionCommands(candidate.version, candidate.missionCommands)
    : [...(defaults.missionCommands ?? [])];
  const missionCommandEvents = Array.isArray(candidate.missionCommandEvents)
    ? candidate.missionCommandEvents
    : [...(defaults.missionCommandEvents ?? [])];
  const operationalPlaybooks = Array.isArray(candidate.operationalPlaybooks)
    ? candidate.operationalPlaybooks
    : [...(defaults.operationalPlaybooks ?? [])];
  const persistedOfflineActions = Array.isArray(candidate.offlineActions)
    ? candidate.offlineActions.map(normalizeOfflineAction).filter(isPresent)
    : [...(defaults.offlineActions ?? [])];
  const offlineActionsNeedRecovery = !Array.isArray(candidate.offlineActions)
    || persistedOfflineActions.length !== candidate.offlineActions.length;
  const migratedMissionActions = (
    typeof candidate.version !== 'number'
    || candidate.version < STORAGE_VERSION
    || offlineActionsNeedRecovery
  )
    ? deriveMigratedMissionOfflineActions(
        expeditionId,
        missionCommands,
        missionCommandEvents,
        operationalPlaybooks,
      )
    : [];
  return dedupeSnapshot({
    version: STORAGE_VERSION,
    expeditionId,
    pings: Array.isArray(candidate.pings) ? candidate.pings : [...defaults.pings],
    queueItems: Array.isArray(candidate.queueItems) ? candidate.queueItems : [...defaults.queueItems],
    assignments: Array.isArray(candidate.assignments) ? candidate.assignments : [...defaults.assignments],
    assistRequests: Array.isArray(candidate.assistRequests)
      ? candidate.assistRequests
      : [...(defaults.assistRequests ?? [])],
    acknowledgments: Array.isArray(candidate.acknowledgments)
      ? candidate.acknowledgments
      : [...(defaults.acknowledgments ?? [])],
    timelineEvents: Array.isArray(candidate.timelineEvents)
      ? candidate.timelineEvents
      : [...defaults.timelineEvents],
    offlineActions: [...persistedOfflineActions, ...migratedMissionActions],
    cadEvents: Array.isArray(candidate.cadEvents)
      ? candidate.cadEvents
      : [...(defaults.cadEvents ?? [])],
    missionCommands,
    missionCommandEvents,
    guardianCheckIns: Array.isArray(candidate.guardianCheckIns)
      ? candidate.guardianCheckIns
      : [...(defaults.guardianCheckIns ?? [])],
    operationalPlaybooks,
    updatedAt: typeof candidate.updatedAt === 'string'
      ? candidate.updatedAt
      : new Date().toISOString(),
  });
}

function loadSnapshotResult(
  expeditionId: string,
  defaults: DispatchPersistenceDefaults,
): DispatchPersistenceLoadResult {
  try {
    const raw = persistence.get(getStorageKey(expeditionId));
    if (!raw) {
      return {
        snapshot: createSnapshot(expeditionId, defaults),
        status: 'ready',
        safeCode: 'dispatch_persistence_ready',
      };
    }
    const parsed = JSON.parse(raw);
    const snapshot = normalizeSnapshot(expeditionId, parsed, defaults);
    const candidate = parsed && typeof parsed === 'object'
      ? parsed as Partial<DispatchPersistenceSnapshot>
      : null;
    const invalidMissionCommandCount = Array.isArray(candidate?.missionCommands)
      ? Math.max(0, candidate.missionCommands.length - snapshot.missionCommands.length)
      : 0;
    const invalidMissionEventCount = Array.isArray(candidate?.missionCommandEvents)
      ? Math.max(0, candidate.missionCommandEvents.length - snapshot.missionCommandEvents.length)
      : 0;
    const invalidGuardianCheckInCount = Array.isArray(candidate?.guardianCheckIns)
      ? Math.max(0, candidate.guardianCheckIns.length - snapshot.guardianCheckIns.length)
      : 0;
    const invalidOfflineActionCount = Array.isArray(candidate?.offlineActions)
      ? Math.max(0, candidate.offlineActions.length - snapshot.offlineActions.filter((action) => (
          candidate.offlineActions?.some((raw) => (
            raw && typeof raw === 'object' && (raw as Partial<DispatchQueuedOfflineAction>).id === action.id
          ))
        )).length)
      : 0;
    const invalidPlaybookCount = Array.isArray(candidate?.operationalPlaybooks)
      ? Math.max(0, candidate.operationalPlaybooks.length - snapshot.operationalPlaybooks.length)
      : 0;
    const futureSchema = typeof candidate?.version === 'number' && candidate.version > STORAGE_VERSION;
    const recovered = futureSchema || invalidMissionCommandCount > 0 || invalidMissionEventCount > 0 ||
      invalidGuardianCheckInCount > 0 ||
      invalidPlaybookCount > 0 ||
      invalidOfflineActionCount > 0;
    return {
      snapshot,
      status: recovered ? 'recovered' : 'ready',
      safeCode: recovered ? 'dispatch_persistence_partial' : 'dispatch_persistence_ready',
    };
  } catch {
    return {
      snapshot: createSnapshot(expeditionId, defaults),
      status: 'recovered',
      safeCode: 'dispatch_persistence_corrupt',
    };
  }
}

function loadSnapshot(
  expeditionId: string,
  defaults: DispatchPersistenceDefaults,
): DispatchPersistenceSnapshot {
  return loadSnapshotResult(expeditionId, defaults).snapshot;
}

function saveSnapshot(snapshot: DispatchPersistenceSnapshot): DispatchPersistenceSnapshot {
  const next: DispatchPersistenceSnapshot = dedupeSnapshot({
    ...snapshot,
    version: STORAGE_VERSION,
    missionCommands: Array.isArray(snapshot.missionCommands) ? snapshot.missionCommands : [],
    missionCommandEvents: Array.isArray(snapshot.missionCommandEvents) ? snapshot.missionCommandEvents : [],
    guardianCheckIns: Array.isArray(snapshot.guardianCheckIns) ? snapshot.guardianCheckIns : [],
    operationalPlaybooks: Array.isArray(snapshot.operationalPlaybooks) ? snapshot.operationalPlaybooks : [],
    updatedAt: new Date().toISOString(),
  });
  persistence.set(getStorageKey(next.expeditionId), JSON.stringify(next));
  persistenceRevisions.set(next.expeditionId, (persistenceRevisions.get(next.expeditionId) ?? 0) + 1);
  persistenceListeners.forEach((listener) => listener(next.expeditionId));
  return next;
}

function updateSnapshot(
  expeditionId: string,
  defaults: DispatchPersistenceDefaults,
  updater: (snapshot: DispatchPersistenceSnapshot) => DispatchPersistenceSnapshot,
): DispatchPersistenceSnapshot {
  return saveSnapshot(updater(loadSnapshot(expeditionId, defaults)));
}

function dedupeSnapshot(snapshot: DispatchPersistenceSnapshot): DispatchPersistenceSnapshot {
  const normalized = {
    ...snapshot,
    pings: mergeDispatchPingBatch(snapshot.pings.map(normalizePersistedPing)),
    queueItems: mergeDispatchQueueItemBatch(snapshot.queueItems),
    assignments: mergeDispatchAssignmentBatch(snapshot.assignments),
    assistRequests: mergeDispatchAssistRequestBatch(snapshot.assistRequests),
    acknowledgments: mergeDispatchAcknowledgmentBatch(snapshot.acknowledgments),
    timelineEvents: mergeDispatchTimelineEventBatch(snapshot.timelineEvents),
    cadEvents: mergeDispatchCadEvents(snapshot.cadEvents),
    missionCommands: mergeMissionCommandBatch(snapshot.missionCommands ?? []),
    missionCommandEvents: mergeMissionCommandEventBatch(snapshot.missionCommandEvents ?? []),
    guardianCheckIns: mergeGuardianCheckInPlanBatch(snapshot.guardianCheckIns ?? []),
    operationalPlaybooks: mergeOperationalPlaybookInstanceBatch(snapshot.operationalPlaybooks ?? []),
  };
  const mergedOfflineActions = mergeDispatchOfflineActionBatch([
    ...snapshot.offlineActions.map(normalizeOfflineAction).filter(isPresent),
    ...deriveOfflineActions(normalized),
  ]);
  return {
    ...normalized,
    offlineActions: reconcileOfflineActions(normalized, mergedOfflineActions),
  };
}

function normalizePersistedPing(ping: DispatchPing): DispatchPing {
  return {
    ...ping,
    operationalState: ping.operationalState ?? deriveDispatchPingOperationalState({
      deliveryState: ping.status,
      requiresAcknowledgment: ping.requiresAcknowledgment,
      acknowledgedCount: ping.acknowledgedByMemberIds?.length ?? 0,
      targetCount: ping.targetMemberIds.length,
    }),
  };
}

function normalizeOfflineAction(action: unknown): DispatchQueuedOfflineAction | null {
  if (!action || typeof action !== 'object') return null;
  const candidate = action as Partial<DispatchQueuedOfflineAction>;
  if (
    typeof candidate.id !== 'string' || !candidate.id.trim() ||
    typeof candidate.idempotencyKey !== 'string' || !candidate.idempotencyKey.trim() ||
    typeof candidate.actionType !== 'string' || !candidate.actionType.trim() ||
    typeof candidate.createdAt !== 'string' || !Number.isFinite(Date.parse(candidate.createdAt)) ||
    !isOfflineActionEntityType(candidate.entityType) ||
    !isOfflineActionStatus(candidate.status)
  ) {
    return null;
  }
  const status = candidate.status === 'replaying' ? 'queued' : candidate.status;
  const attempts = Number.isFinite(candidate.attemptCount)
    ? Math.max(0, Math.floor(candidate.attemptCount as number))
    : 0;
  const maxAttempts = Number.isFinite(candidate.maxAttempts)
    ? Math.max(1, Math.min(10, Math.floor(candidate.maxAttempts as number)))
    : 5;
  const version = Number.isFinite(candidate.version)
    ? Math.max(1, Math.floor(candidate.version as number))
    : 1;
  const dependencyIds = Array.isArray(candidate.dependsOnOperationIds)
    ? candidate.dependsOnOperationIds
    : [];
  return {
    id: candidate.id,
    idempotencyKey: candidate.idempotencyKey,
    entityType: candidate.entityType,
    actionType: candidate.actionType,
    createdAt: candidate.createdAt,
    sourceEntityId: typeof candidate.sourceEntityId === 'string' ? candidate.sourceEntityId : undefined,
    version,
    status,
    updatedAt: normalizeIso(candidate.updatedAt) ?? candidate.createdAt,
    attemptCount: attempts,
    maxAttempts,
    retryability: candidate.retryability === 'non_retryable' || attempts >= maxAttempts
      ? 'non_retryable'
      : 'retryable',
    dependsOnOperationIds: [...new Set(dependencyIds)]
      .filter((operationId) => typeof operationId === 'string' && operationId.length > 0 && operationId !== candidate.id)
      .sort(),
    nextAttemptAt: normalizeIso(candidate.nextAttemptAt),
    replayedAt: normalizeIso(candidate.replayedAt),
    lastErrorCode: normalizeSafeCode(candidate.lastErrorCode),
    lastError: normalizeSafeDiagnostic(candidate.lastError),
    cancelledAt: normalizeIso(candidate.cancelledAt),
  };
}

function migrateMissionCommands(version: number | undefined, commands: MissionCommand[]): MissionCommand[] {
  if (typeof version === 'number' && version >= 6) return commands;
  return commands.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const command = raw as Partial<MissionCommand>;
    if (command.deliveryState !== 'local' || command.target?.kind === 'solo') return raw;
    return {
      ...command,
      version: Math.max(1, Number(command.version) || 1) + 1,
      deliveryState: 'queued',
    } as MissionCommand;
  });
}

function deriveMigratedMissionOfflineActions(
  expeditionId: string,
  missionCommands: MissionCommand[],
  missionCommandEvents: MissionCommandEvent[],
  operationalPlaybooks: OperationalPlaybookInstance[],
): DispatchQueuedOfflineAction[] {
  const actions: DispatchQueuedOfflineAction[] = [];
  const normalizedCommands = mergeMissionCommandBatch(missionCommands);
  const normalizedEvents = mergeMissionCommandEventBatch(missionCommandEvents);
  const replayable = (state: string | null | undefined) => (
    state === 'queued' || state === 'failed' || state === 'retrying'
  );
  normalizedCommands
    .filter((command) => command.target.kind !== 'solo' && replayable(command.deliveryState))
    .forEach((command) => {
      const event = normalizedEvents.find((candidate) => (
        candidate.commandId === command.id && replayable(candidate.deliveryState)
      )) ?? null;
      addMissionCommandActions(actions, expeditionId, command, event);
    });
  normalizedEvents
    .filter((event) => replayable(event.deliveryState))
    .forEach((event) => {
      const command = normalizedCommands.find((candidate) => candidate.id === event.commandId);
      if (!command || command.target.kind === 'solo') return;
      const existing = actions.some((action) => (
        action.entityType === 'mission_command_event' && action.sourceEntityId === event.id
      ));
      if (existing) return;
      const commandAction = actions.find((action) => (
        action.entityType === 'mission_command' && action.sourceEntityId === command.id
      ));
      addMissionCommandEventAction(
        actions,
        expeditionId,
        command,
        event,
        commandAction ? [commandAction.id] : [],
      );
    });
  mergeOperationalPlaybookInstanceBatch(operationalPlaybooks).forEach((instance) => {
    addOperationalPlaybookAction(actions, expeditionId, instance);
  });
  return actions;
}

function deriveOfflineActions(snapshot: Omit<DispatchPersistenceSnapshot, 'offlineActions'>): DispatchQueuedOfflineAction[] {
  const actions: DispatchQueuedOfflineAction[] = [];
  const add = (
    entityType: DispatchQueuedOfflineAction['entityType'],
    entity: { id: string; idempotencyKey?: string; createdAt?: string; updatedAt?: string; occurredAt?: string; assignedAt?: string; acknowledgedAt?: string },
  ) => {
    actions.push(createDispatchOfflineAction({
      expeditionId: snapshot.expeditionId,
      entityType,
      sourceEntityId: entity.id,
      sourceIdempotencyKey: entity.idempotencyKey,
      createdAt: entity.createdAt ?? entity.occurredAt ?? entity.assignedAt ?? entity.acknowledgedAt ?? entity.updatedAt,
    }));
  };
  const replayable = (state: string | null | undefined) => (
    state === 'queued' || state === 'failed' || state === 'retrying'
  );

  snapshot.pings.filter((item) => replayable(item.status) || replayable(item.reliabilityState)).forEach((item) => add('ping', item));
  snapshot.queueItems.filter((item) => replayable(item.deliveryState) || replayable(item.reliabilityState)).forEach((item) => add('queue_item', item));
  snapshot.assignments.filter((item) => replayable(item.deliveryState)).forEach((item) => add('assignment', item));
  snapshot.assistRequests.filter((item) => replayable(item.deliveryState)).forEach((item) => add('assist_request', item));
  snapshot.acknowledgments.filter((item) => replayable(item.deliveryState)).forEach((item) => add('acknowledgment', item));
  snapshot.timelineEvents.filter((item) => replayable(item.deliveryState)).forEach((item) => add('timeline_event', item));
  return actions;
}

function addMissionCommandActions(
  actions: DispatchQueuedOfflineAction[],
  expeditionId: string,
  command: MissionCommand,
  event: MissionCommandEvent | null,
): DispatchQueuedOfflineAction[] {
  if (command.target.kind === 'solo' || command.expeditionId !== expeditionId) return actions;
  const commandAction = createDispatchOfflineAction({
    expeditionId,
    entityType: 'mission_command',
    actionType: `upsert:mission_command:v${command.version}`,
    sourceEntityId: command.id,
    sourceIdempotencyKey: command.idempotencyKey,
    createdAt: command.updatedAt,
  });
  const supersededOperationIds = new Set(actions
    .filter((action) => (
      action.entityType === 'mission_command' &&
      action.sourceEntityId === command.id &&
      action.id !== commandAction.id &&
      (action.status === 'queued' || action.status === 'replaying' || action.status === 'failed')
    ))
    .map((action) => action.id));
  if (supersededOperationIds.size > 0) {
    for (let index = actions.length - 1; index >= 0; index -= 1) {
      if (supersededOperationIds.has(actions[index].id)) actions.splice(index, 1);
    }
    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      if (
        action.entityType !== 'mission_command_event' ||
        action.status === 'replayed' ||
        action.status === 'cancelled' ||
        !action.dependsOnOperationIds?.some((operationId) => supersededOperationIds.has(operationId))
      ) {
        continue;
      }
      actions[index] = {
        ...action,
        version: (action.version ?? 1) + 1,
        updatedAt: command.updatedAt,
        dependsOnOperationIds: [...new Set([
          ...action.dependsOnOperationIds.filter((operationId) => !supersededOperationIds.has(operationId)),
          commandAction.id,
        ])].sort(),
      };
    }
  }
  actions.push(commandAction);
  if (event && event.expeditionId === expeditionId && event.commandId === command.id) {
    addMissionCommandEventAction(actions, expeditionId, command, event, [commandAction.id]);
  }
  return actions;
}

function addMissionCommandEventAction(
  actions: DispatchQueuedOfflineAction[],
  expeditionId: string,
  command: MissionCommand,
  event: MissionCommandEvent,
  dependsOnOperationIds: string[],
): void {
  if (command.target.kind === 'solo' || event.commandId !== command.id) return;
  actions.push(createDispatchOfflineAction({
    expeditionId,
    entityType: 'mission_command_event',
    actionType: `append:mission_command_event:${event.id}`,
    sourceEntityId: event.id,
    sourceIdempotencyKey: event.idempotencyKey,
    createdAt: event.occurredAt,
    dependsOnOperationIds,
  }));
}

function addOperationalPlaybookAction(
  actions: DispatchQueuedOfflineAction[],
  expeditionId: string,
  instance: OperationalPlaybookInstance,
): void {
  if (instance.expeditionId !== expeditionId) return;
  const next = createDispatchOfflineAction({
    expeditionId,
    entityType: 'mission_playbook_instance',
    actionType: `upsert:mission_playbook_instance:v${instance.version}`,
    sourceEntityId: instance.id,
    sourceIdempotencyKey: instance.idempotencyKey,
    createdAt: instance.updatedAt,
  });
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const current = actions[index];
    if (
      current.entityType === 'mission_playbook_instance'
      && current.sourceEntityId === instance.id
      && current.id !== next.id
      && current.status !== 'replayed'
      && current.status !== 'cancelled'
    ) actions.splice(index, 1);
  }
  actions.push(next);
}

function reconcileOfflineActions(
  snapshot: Omit<DispatchPersistenceSnapshot, 'offlineActions'>,
  actions: DispatchQueuedOfflineAction[],
): DispatchQueuedOfflineAction[] {
  return actions.map((action) => {
    if (action.status === 'replayed' || action.status === 'cancelled') return action;
    if (
      action.entityType === 'mission_command'
      || action.entityType === 'mission_command_event'
      || action.entityType === 'mission_playbook_instance'
    ) {
      return action;
    }
    const source = getOfflineActionSource(snapshot, action);
    if (!source) return action;
    if (
      source.deliveryState === 'cancelled' ||
      source.deliveryState === 'local' ||
      source.deliveryState === 'draft'
    ) {
      return {
        ...action,
        status: 'cancelled',
        version: (action.version ?? 1) + 1,
        updatedAt: source.updatedAt,
        nextAttemptAt: undefined,
      };
    }
    if (!isReplayableDeliveryState(source.deliveryState)) {
      return {
        ...action,
        status: 'replayed',
        version: (action.version ?? 1) + 1,
        updatedAt: source.updatedAt,
        replayedAt: source.updatedAt,
        nextAttemptAt: undefined,
        lastError: undefined,
      };
    }
    return action;
  });
}

function getOfflineActionSource(
  snapshot: Omit<DispatchPersistenceSnapshot, 'offlineActions'>,
  action: DispatchQueuedOfflineAction,
): { deliveryState: string; updatedAt: string } | null {
  const find = <T extends { id: string }>(items: T[]) => items.find((item) => item.id === action.sourceEntityId);
  switch (action.entityType) {
    case 'ping': {
      const source = find(snapshot.pings);
      return source ? { deliveryState: source.status, updatedAt: source.updatedAt ?? source.createdAt } : null;
    }
    case 'queue_item': {
      const source = find(snapshot.queueItems);
      return source ? { deliveryState: source.deliveryState, updatedAt: source.updatedAt } : null;
    }
    case 'assignment': {
      const source = find(snapshot.assignments);
      return source ? { deliveryState: source.deliveryState ?? 'local', updatedAt: source.updatedAt ?? source.assignedAt } : null;
    }
    case 'assist_request': {
      const source = find(snapshot.assistRequests);
      return source ? { deliveryState: source.deliveryState ?? 'local', updatedAt: source.updatedAt ?? source.createdAt } : null;
    }
    case 'acknowledgment': {
      const source = find(snapshot.acknowledgments);
      return source ? { deliveryState: source.deliveryState ?? 'local', updatedAt: source.updatedAt ?? source.acknowledgedAt } : null;
    }
    case 'timeline_event': {
      const source = find(snapshot.timelineEvents);
      return source ? { deliveryState: source.deliveryState ?? 'local', updatedAt: source.occurredAt } : null;
    }
    case 'mission_command':
    case 'mission_command_event':
    case 'mission_playbook_instance':
      return null;
    default:
      return null;
  }
}

function isReplayableDeliveryState(state: string): boolean {
  return state === 'queued' || state === 'sending' || state === 'failed' || state === 'retrying';
}

function mergeDispatchCadEvents(events: unknown[]): DispatchEvent[] {
  const byId = new Map<string, DispatchEvent>();
  const byDedupeKey = new Map<string, string>();

  for (const rawEvent of events) {
    const event = normalizeDispatchEvent(rawEvent);
    if (!event) continue;

    const existingIdForDedupe = event.dedupeKey ? byDedupeKey.get(event.dedupeKey) : undefined;
    if (existingIdForDedupe && existingIdForDedupe !== event.id) {
      byId.delete(existingIdForDedupe);
    }

    byId.set(event.id, event);
    if (event.dedupeKey) {
      byDedupeKey.set(event.dedupeKey, event.id);
    }
  }

  return sortDispatchEvents([...byId.values()]).slice(0, DISPATCH_CAD_EVENT_PERSISTENCE_LIMIT);
}

export const dispatchPersistenceAdapter = {
  waitForHydration(): Promise<void> {
    return persistence.waitForHydration();
  },

  flush(): Promise<void> {
    return persistence.flush();
  },

  load(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
  ): DispatchPersistenceSnapshot {
    return loadSnapshot(expeditionId, defaults);
  },

  loadResult(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
  ): DispatchPersistenceLoadResult {
    return loadSnapshotResult(expeditionId, defaults);
  },

  subscribe(listener: (expeditionId: string) => void): () => void {
    persistenceListeners.add(listener);
    return () => persistenceListeners.delete(listener);
  },

  getRevision(expeditionId: string): number {
    return persistenceRevisions.get(expeditionId) ?? 0;
  },

  save(snapshot: DispatchPersistenceSnapshot): DispatchPersistenceSnapshot {
    return saveSnapshot(snapshot);
  },

  upsertPing(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    ping: DispatchPing,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      pings: mergeDispatchPing(snapshot.pings, ping),
    }));
  },

  upsertQueueItem(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    item: DispatchQueueItem,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      queueItems: mergeDispatchQueueItem(snapshot.queueItems, item),
    }));
  },

  upsertAssignment(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    assignment: DispatchAssignment,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      assignments: mergeDispatchAssignment(snapshot.assignments, assignment),
    }));
  },

  upsertAssistRequest(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    request: DispatchAssistRequest,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      assistRequests: mergeDispatchAssistRequest(snapshot.assistRequests, request),
    }));
  },

  upsertAcknowledgment(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    acknowledgment: DispatchAcknowledgment,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      acknowledgments: mergeDispatchAcknowledgment(snapshot.acknowledgments, acknowledgment),
    }));
  },

  upsertOfflineAction(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    action: DispatchQueuedOfflineAction,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      offlineActions: mergeDispatchOfflineAction(snapshot.offlineActions, action),
    }));
  },

  appendTimelineEvent(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    event: DispatchTimelineEvent,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      timelineEvents: mergeDispatchTimelineEvent(snapshot.timelineEvents, event),
    }));
  },

  upsertMissionCommand(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    command: MissionCommand,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      missionCommands: command.expeditionId === expeditionId
        ? mergeMissionCommand(snapshot.missionCommands, command)
        : snapshot.missionCommands,
    }));
  },

  appendMissionCommandEvent(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    event: MissionCommandEvent,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      missionCommandEvents: event.expeditionId === expeditionId
        ? appendMissionCommandEventRecord(snapshot.missionCommandEvents, event)
        : snapshot.missionCommandEvents,
    }));
  },

  applyMissionCommandMutation(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    command: MissionCommand,
    event: MissionCommandEvent | null,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => {
      if (command.expeditionId !== expeditionId) return snapshot;
      const offlineActions = [...snapshot.offlineActions];
      addMissionCommandActions(offlineActions, expeditionId, command, event);
      return {
        ...snapshot,
        missionCommands: mergeMissionCommand(snapshot.missionCommands, command),
        missionCommandEvents: event && event.expeditionId === expeditionId
          ? appendMissionCommandEventRecord(snapshot.missionCommandEvents, event)
          : snapshot.missionCommandEvents,
        offlineActions: mergeDispatchOfflineActionBatch(offlineActions),
      };
    });
  },

  upsertGuardianCheckIn(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    plan: GuardianCheckInPlan,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      guardianCheckIns: plan.expeditionId === expeditionId
        ? mergeGuardianCheckInPlan(snapshot.guardianCheckIns, plan)
        : snapshot.guardianCheckIns,
    }));
  },

  applyGuardianCheckInDecision(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    plan: GuardianCheckInPlan,
    command: MissionCommand,
    event: MissionCommandEvent,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => {
      const offlineActions = [...snapshot.offlineActions];
      if (command.expeditionId === expeditionId) {
        addMissionCommandActions(offlineActions, expeditionId, command, event);
      }
      return {
        ...snapshot,
        guardianCheckIns: plan.expeditionId === expeditionId
          ? mergeGuardianCheckInPlan(snapshot.guardianCheckIns, plan)
          : snapshot.guardianCheckIns,
        missionCommands: command.expeditionId === expeditionId
          ? mergeMissionCommand(snapshot.missionCommands, command)
          : snapshot.missionCommands,
        missionCommandEvents: event.expeditionId === expeditionId
          ? appendMissionCommandEventRecord(snapshot.missionCommandEvents, event)
          : snapshot.missionCommandEvents,
        offlineActions: mergeDispatchOfflineActionBatch(offlineActions),
      };
    });
  },

  upsertOperationalPlaybook(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    instance: OperationalPlaybookInstance,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => {
      const offlineActions = [...snapshot.offlineActions];
      addOperationalPlaybookAction(offlineActions, expeditionId, instance);
      return {
        ...snapshot,
        operationalPlaybooks: instance.expeditionId === expeditionId
          ? mergeOperationalPlaybookInstance(snapshot.operationalPlaybooks, instance)
          : snapshot.operationalPlaybooks,
        offlineActions: mergeDispatchOfflineActionBatch(offlineActions),
      };
    });
  },

  applyOperationalPlaybookMutation(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    instance: OperationalPlaybookInstance,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => {
      const offlineActions = [...snapshot.offlineActions];
      addOperationalPlaybookAction(offlineActions, expeditionId, instance);
      return {
        ...snapshot,
        operationalPlaybooks: instance.expeditionId === expeditionId
          ? mergeOperationalPlaybookInstance(snapshot.operationalPlaybooks, instance)
          : snapshot.operationalPlaybooks,
        offlineActions: mergeDispatchOfflineActionBatch(offlineActions),
      };
    });
  },

  upsertCadEvent(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    event: DispatchEvent,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      cadEvents: mergeDispatchCadEvents([...snapshot.cadEvents, event]),
    }));
  },

  updateCadEvent(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    eventId: string,
    updater: (event: DispatchEvent) => DispatchEvent,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      cadEvents: mergeDispatchCadEvents(snapshot.cadEvents.map((event) => (
        event.id === eventId ? updater(event) : event
      ))),
    }));
  },

  updateQueueItem(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    itemId: string,
    updater: (item: DispatchQueueItem) => DispatchQueueItem,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      queueItems: snapshot.queueItems.map((item) => (item.id === itemId ? updater(item) : item)),
    }));
  },

  updatePing(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    pingId: string,
    updater: (ping: DispatchPing) => DispatchPing,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      pings: snapshot.pings.map((ping) => (ping.id === pingId ? updater(ping) : ping)),
    }));
  },
};

function normalizeSafeCode(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(normalized) ? normalized : undefined;
}

function normalizeSafeDiagnostic(value: unknown): string | undefined {
  const normalized = String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 160);
  return normalized || undefined;
}

function normalizeIso(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

function isOfflineActionEntityType(
  value: unknown,
): value is DispatchQueuedOfflineAction['entityType'] {
  return [
    'ping',
    'queue_item',
    'assignment',
    'assist_request',
    'acknowledgment',
    'timeline_event',
    'mission_command',
    'mission_command_event',
    'mission_playbook_instance',
  ].includes(String(value));
}

function isOfflineActionStatus(
  value: unknown,
): value is DispatchQueuedOfflineAction['status'] {
  return ['queued', 'replaying', 'replayed', 'failed', 'cancelled'].includes(String(value));
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}
