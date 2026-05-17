import type { DispatchRealtimeEnvelope } from './dispatchRealtimeAdapter';
import type {
  DispatchAssignment,
  DispatchAssistRequest,
  DispatchCheckInResponse,
  DispatchConflictState,
  DispatchDeliveryState,
  DispatchEscalationState,
  DispatchPing,
  DispatchQueueItem,
  DispatchTimelineEvent,
} from './dispatchTypes';

export type DispatchIntegrityEntityType =
  | 'ping'
  | 'queue_item'
  | 'assignment'
  | 'assist_request'
  | 'acknowledgment'
  | 'timeline_event'
  | 'offline_action'
  | 'notification';

export interface DispatchIdempotencyInput {
  expeditionId: string;
  entityType: DispatchIntegrityEntityType;
  actionType: string;
  actorMemberId?: string | null;
  targetMemberIds?: string[];
  linkedContextId?: string | null;
  sourceEntityId?: string | null;
  message?: string | null;
  priority?: string | null;
  timeBucket?: string | null;
  metadata?: Record<string, unknown>;
}

export interface DispatchEventState {
  pings?: DispatchPing[];
  queueItems?: DispatchQueueItem[];
  assignments?: DispatchAssignment[];
  timelineEvents?: DispatchTimelineEvent[];
}

const DUPLICATE_ACTION_WINDOW_MS = 2500;
const DISPATCH_CONFLICT_NOTICE = 'Dispatch item updated during sync.';

const ENTITY_PREFIX: Record<DispatchIntegrityEntityType, string> = {
  ping: 'local-ping',
  queue_item: 'local-queue',
  assignment: 'local-assignment',
  assist_request: 'local-assist',
  acknowledgment: 'local-ack',
  timeline_event: 'local-timeline',
  offline_action: 'local-offline-action',
  notification: 'local-notification',
};

export function createDispatchIdempotencyKey(input: DispatchIdempotencyInput): string {
  const payload = {
    actionType: normalizeKeyPart(input.actionType),
    actorMemberId: normalizeKeyPart(input.actorMemberId),
    entityType: input.entityType,
    expeditionId: normalizeKeyPart(input.expeditionId),
    linkedContextId: normalizeKeyPart(input.linkedContextId),
    message: normalizeMessage(input.message),
    metadata: normalizeMetadata(input.metadata),
    priority: normalizeKeyPart(input.priority),
    sourceEntityId: normalizeKeyPart(input.sourceEntityId),
    targetMemberIds: [...new Set(input.targetMemberIds ?? [])].sort(),
    timeBucket: normalizeKeyPart(input.timeBucket),
  };

  return `dispatch:${input.entityType}:${hashStableValue(payload)}`;
}

export function createDispatchEntityId(
  entityType: DispatchIntegrityEntityType,
  idempotencyKey: string,
): string {
  return `${ENTITY_PREFIX[entityType]}-${hashStableValue(idempotencyKey)}`;
}

export function mergeDispatchPing(pings: DispatchPing[], nextPing: DispatchPing): DispatchPing[] {
  return mergeDispatchRecords(pings, nextPing, mergePingRecord);
}

export function mergeDispatchQueueItem(
  items: DispatchQueueItem[],
  nextItem: DispatchQueueItem,
): DispatchQueueItem[] {
  return mergeDispatchRecords(items, nextItem, mergeQueueItemRecord);
}

export function mergeDispatchTimelineEvent(
  events: DispatchTimelineEvent[],
  nextEvent: DispatchTimelineEvent,
): DispatchTimelineEvent[] {
  return mergeDispatchRecords(events, nextEvent, mergeTimelineEventRecord);
}

export function mergeDispatchAssignment(
  assignments: DispatchAssignment[],
  nextAssignment: DispatchAssignment,
): DispatchAssignment[] {
  return mergeDispatchRecords(assignments, nextAssignment, mergeAssignmentRecord);
}

export function mergeDispatchAssistRequest(
  requests: DispatchAssistRequest[],
  nextRequest: DispatchAssistRequest,
): DispatchAssistRequest[] {
  return mergeDispatchRecords(requests, nextRequest, mergeAssistRequestRecord);
}

export function getIncomingDispatchConflictNotice(
  event: DispatchRealtimeEnvelope,
  current: DispatchEventState,
): string | null {
  switch (event.type) {
    case 'ping_upsert': {
      const existing = findSameDispatchRecord(current.pings ?? [], event.ping);
      return existing && hasPingConflict(existing, event.ping) ? DISPATCH_CONFLICT_NOTICE : null;
    }
    case 'queue_item_upsert': {
      const existing = findSameDispatchRecord(current.queueItems ?? [], event.queueItem);
      return existing && hasQueueConflict(existing, event.queueItem) ? DISPATCH_CONFLICT_NOTICE : null;
    }
    case 'assignment_upsert': {
      const existing = findSameDispatchRecord(current.assignments ?? [], event.assignment);
      return existing && hasAssignmentConflict(existing, event.assignment) ? DISPATCH_CONFLICT_NOTICE : null;
    }
    default:
      return null;
  }
}

export function shouldApplyIncomingDispatchEvent(
  event: DispatchRealtimeEnvelope,
  current: DispatchEventState,
): boolean {
  switch (event.type) {
    case 'ping_upsert':
      return shouldApplyRecordWithMerge(
        event.ping,
        current.pings ?? [],
        getRecordTimestamp,
        mergePingRecord,
      );
    case 'queue_item_upsert':
      return shouldApplyRecordWithMerge(
        event.queueItem,
        current.queueItems ?? [],
        getRecordTimestamp,
        mergeQueueItemRecord,
      );
    case 'assignment_upsert':
      return shouldApplyRecordWithMerge(
        event.assignment,
        current.assignments ?? [],
        getRecordTimestamp,
        mergeAssignmentRecord,
      );
    case 'timeline_event_added':
      return shouldApplyRecordWithMerge(
        event.timelineEvent,
        current.timelineEvents ?? [],
        getRecordTimestamp,
        mergeTimelineEventRecord,
      );
    case 'team_member_upsert':
    default:
      return true;
  }
}

export function isDuplicateDispatchAction(input: {
  idempotencyKey: string;
  recentActions: ReadonlyMap<string, number>;
  now?: number;
  windowMs?: number;
}): boolean {
  const now = input.now ?? Date.now();
  const windowMs = input.windowMs ?? DUPLICATE_ACTION_WINDOW_MS;
  const previous = input.recentActions.get(input.idempotencyKey);
  return typeof previous === 'number' && now - previous < windowMs;
}

export function rememberDispatchAction(input: {
  idempotencyKey: string;
  recentActions: Map<string, number>;
  now?: number;
  windowMs?: number;
}): boolean {
  const now = input.now ?? Date.now();
  const windowMs = input.windowMs ?? DUPLICATE_ACTION_WINDOW_MS;
  pruneRecentActions(input.recentActions, now, windowMs);
  if (isDuplicateDispatchAction({ ...input, now, windowMs })) {
    return false;
  }
  input.recentActions.set(input.idempotencyKey, now);
  return true;
}

function mergeDispatchRecords<T extends {
  id: string;
  idempotencyKey?: string;
  version?: number;
}>(
  items: T[],
  nextItem: T,
  mergeRecord: (current: T, next: T) => T,
): T[] {
  const index = items.findIndex((item) => isSameDispatchRecord(item, nextItem));
  if (index < 0) return [nextItem, ...items];

  return items.map((item, itemIndex) =>
    itemIndex === index ? mergeRecord(item, nextItem) : item,
  );
}

function mergePingRecord(current: DispatchPing, next: DispatchPing): DispatchPing {
  const acknowledgedByMemberIds = uniqueStrings([
    ...(current.acknowledgedByMemberIds ?? []),
    ...(next.acknowledgedByMemberIds ?? []),
  ]);
  const checkInResponses = mergeCheckInResponses(
    current.checkInResponses ?? [],
    next.checkInResponses ?? [],
  );
  const conflict = hasPingConflict(current, next);
  const base = pickNewestRecord(current, next);
  const escalatedPing = chooseEscalatedPingState(current, next, base);

  return {
    ...escalatedPing,
    acknowledgedByMemberIds,
    checkInResponses,
    ...(conflict ? createConflictPatch(getPingConflictState(current, next), getPingConflictReason(current, next)) : null),
  };
}

function mergeQueueItemRecord(current: DispatchQueueItem, next: DispatchQueueItem): DispatchQueueItem {
  const conflict = hasQueueConflict(current, next);
  const base = pickNewestRecord(current, next);
  const currentTime = getRecordTime(current);
  const nextTime = getRecordTime(next);
  const incomingNewerOrSame = nextTime >= currentTime;
  const currentEscalated = isActiveEscalationState(current.escalationState) || current.status === 'escalated';
  const nextEscalated = isActiveEscalationState(next.escalationState) || next.status === 'escalated';
  const currentResolved = current.status === 'resolved';
  const nextResolved = next.status === 'resolved';
  const currentCancelled = current.status === 'cancelled';
  const nextCancelled = next.status === 'cancelled';

  let merged = base;

  if (currentCancelled && !nextCancelled) {
    merged = {
      ...current,
      version: Math.max(current.version ?? 0, next.version ?? 0),
      updatedAt: maxIso(current.updatedAt, next.updatedAt),
    };
  } else if (currentEscalated && !nextEscalated && !nextResolved) {
    merged = {
      ...base,
      status: current.status,
      escalationState: current.escalationState,
      priority: strongerPriority(current.priority, next.priority),
      deliveryState: strongerDeliveryState(current.deliveryState, next.deliveryState),
    };
  } else if (nextEscalated && (!currentResolved || nextTime > currentTime)) {
    merged = {
      ...base,
      status: 'escalated',
      escalationState: next.escalationState,
      priority: strongerPriority(current.priority, next.priority),
      deliveryState: strongerDeliveryState(current.deliveryState, next.deliveryState),
    };
  } else if (currentResolved && !nextEscalated) {
    merged = {
      ...base,
      status: 'resolved',
      escalationState: base.escalationState === 'none' ? 'recovered' : base.escalationState,
      priority: strongerPriority(current.priority, next.priority),
    };
  } else if (nextResolved && !currentEscalated) {
    merged = {
      ...base,
      status: 'resolved',
      escalationState: next.escalationState === 'none' ? 'recovered' : next.escalationState,
      priority: strongerPriority(current.priority, next.priority),
    };
  } else if (current.status !== next.status && !incomingNewerOrSame) {
    merged = {
      ...base,
      status: current.status,
      priority: strongerPriority(current.priority, next.priority),
    };
  } else if (current.priority !== next.priority || current.status !== next.status) {
    merged = {
      ...base,
      priority: strongerPriority(current.priority, next.priority),
    };
  }

  if (current.assignedMemberIds.join('|') !== next.assignedMemberIds.join('|')) {
    merged = {
      ...merged,
      assignedMemberIds: incomingNewerOrSame ? next.assignedMemberIds : current.assignedMemberIds,
    };
  }

  if (conflict) {
    return {
      ...merged,
      ...createConflictPatch(getQueueConflictState(current, next), getQueueConflictReason(current, next)),
    };
  }

  return merged;
}

function mergeAssignmentRecord(current: DispatchAssignment, next: DispatchAssignment): DispatchAssignment {
  const base = pickNewestRecord(current, next);
  if (!hasAssignmentConflict(current, next)) {
    return base;
  }

  return {
    ...base,
    ...createConflictPatch('updated_during_sync', 'Assignment changed during Dispatch sync.'),
  };
}

function mergeTimelineEventRecord(
  current: DispatchTimelineEvent,
  next: DispatchTimelineEvent,
): DispatchTimelineEvent {
  return pickNewestRecord(current, next);
}

function mergeAssistRequestRecord(
  current: DispatchAssistRequest,
  next: DispatchAssistRequest,
): DispatchAssistRequest {
  const base = pickNewestRecord(current, next);
  if (!hasAssistConflict(current, next)) {
    return base;
  }

  return {
    ...base,
    ...createConflictPatch('needs_review', 'Assist request changed during Dispatch sync and needs review.'),
    status: base.status === 'cancelled' ? base.status : 'needs_review',
  };
}

function shouldApplyRecord<T extends {
  id: string;
  idempotencyKey?: string;
  version?: number;
}>(
  nextItem: T,
  items: T[],
  getTimestamp: (item: T) => string | undefined,
): boolean {
  const existing = items.find((item) => isSameDispatchRecord(item, nextItem));
  if (!existing) return true;

  const existingVersion = existing.version ?? 0;
  const nextVersion = nextItem.version ?? 0;
  if (nextVersion > existingVersion) return true;
  if (nextVersion < existingVersion) return false;

  const existingTime = Date.parse(getTimestamp(existing) ?? '');
  const nextTime = Date.parse(getTimestamp(nextItem) ?? '');
  if (Number.isFinite(existingTime) && Number.isFinite(nextTime)) {
    return nextTime > existingTime;
  }

  return false;
}

function shouldApplyRecordWithMerge<T extends {
  id: string;
  idempotencyKey?: string;
  version?: number;
  lastConflictAt?: string;
}>(
  nextItem: T,
  items: T[],
  getTimestamp: (item: T) => string | undefined,
  mergeRecord: (current: T, next: T) => T,
): boolean {
  const existing = items.find((item) => isSameDispatchRecord(item, nextItem));
  if (!existing) return true;
  if (shouldApplyRecord(nextItem, items, getTimestamp)) return true;

  const merged = mergeRecord(existing, nextItem);
  return stableStringify(stripTransientConflictFields(merged)) !== stableStringify(stripTransientConflictFields(existing));
}

function pickNewestRecord<T extends {
  id: string;
  idempotencyKey?: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  occurredAt?: string;
  assignedAt?: string;
}>(current: T, next: T): T {
  return shouldApplyRecord(next, [current], getRecordTimestamp) ? next : current;
}

function isSameDispatchRecord<T extends { id: string; idempotencyKey?: string }>(
  current: T,
  next: T,
): boolean {
  if (current.id === next.id) return true;
  return Boolean(current.idempotencyKey && current.idempotencyKey === next.idempotencyKey);
}

function findSameDispatchRecord<T extends { id: string; idempotencyKey?: string }>(
  items: T[],
  next: T,
): T | undefined {
  return items.find((item) => isSameDispatchRecord(item, next));
}

function getRecordTimestamp(item: {
  createdAt?: string;
  updatedAt?: string;
  occurredAt?: string;
  assignedAt?: string;
}): string | undefined {
  return item.updatedAt ?? item.occurredAt ?? item.assignedAt ?? item.createdAt;
}

function pruneRecentActions(
  recentActions: Map<string, number>,
  now: number,
  windowMs: number,
): void {
  for (const [key, timestamp] of recentActions) {
    if (now - timestamp > windowMs) {
      recentActions.delete(key);
    }
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function mergeCheckInResponses(
  current: DispatchCheckInResponse[],
  next: DispatchCheckInResponse[],
): DispatchCheckInResponse[] | undefined {
  if (current.length === 0 && next.length === 0) return undefined;

  const byMemberId = new Map<string, DispatchCheckInResponse>();
  for (const response of [...current, ...next]) {
    const existing = byMemberId.get(response.memberId);
    if (!existing || Date.parse(response.respondedAt) >= Date.parse(existing.respondedAt)) {
      byMemberId.set(response.memberId, response);
    }
  }

  return Array.from(byMemberId.values()).sort((a, b) => a.memberId.localeCompare(b.memberId));
}

function hasPingConflict(current: DispatchPing, next: DispatchPing): boolean {
  if (current.status !== next.status && (isEscalatedPing(current) || isEscalatedPing(next))) return true;
  if (current.escalationState !== next.escalationState && (isEscalatedPing(current) || isEscalatedPing(next))) return true;
  if (current.priority !== next.priority && (current.priority === 'critical' || next.priority === 'critical')) return true;
  return hasNewAcknowledgment(current, next) && (isEscalatedPing(current) || isEscalatedPing(next));
}

function hasQueueConflict(current: DispatchQueueItem, next: DispatchQueueItem): boolean {
  if (current.status === 'cancelled' && next.status !== 'cancelled') return true;
  if (current.status !== next.status) {
    if (current.status === 'resolved' || next.status === 'resolved') return true;
    if (current.status === 'escalated' || next.status === 'escalated') return true;
    if (current.status === 'needs_review' || next.status === 'needs_review') return true;
  }
  if (current.escalationState !== next.escalationState) {
    return isActiveEscalationState(current.escalationState) || isActiveEscalationState(next.escalationState);
  }
  if (current.priority !== next.priority) {
    return current.priority === 'critical' || next.priority === 'critical';
  }
  if (current.assignedMemberIds.join('|') !== next.assignedMemberIds.join('|')) {
    return true;
  }
  return false;
}

function hasAssignmentConflict(current: DispatchAssignment, next: DispatchAssignment): boolean {
  return (
    current.queueItemId === next.queueItemId &&
    (current.assigneeMemberId !== next.assigneeMemberId || current.status !== next.status)
  );
}

function hasAssistConflict(current: DispatchAssistRequest, next: DispatchAssistRequest): boolean {
  if (current.status === 'cancelled' && next.status !== 'cancelled') return true;
  if (current.priority !== next.priority && (current.priority === 'critical' || next.priority === 'critical')) {
    return true;
  }
  if (current.escalationState !== next.escalationState) {
    return isActiveEscalationState(current.escalationState) || isActiveEscalationState(next.escalationState);
  }
  return current.linkedContext?.id !== next.linkedContext?.id;
}

function getPingConflictState(current: DispatchPing, next: DispatchPing): DispatchConflictState {
  if (isEscalatedPing(current) && next.status === 'acknowledged') return 'updated_during_sync';
  if (current.priority === 'critical' || next.priority === 'critical') return 'needs_review';
  return 'updated_during_sync';
}

function getPingConflictReason(current: DispatchPing, next: DispatchPing): string {
  if (isEscalatedPing(current) && hasNewAcknowledgment(current, next)) {
    return 'Acknowledgment arrived after the ping escalated.';
  }
  if (isEscalatedPing(current) || isEscalatedPing(next)) {
    return 'Ping escalation changed during Dispatch sync.';
  }
  return DISPATCH_CONFLICT_NOTICE;
}

function getQueueConflictState(current: DispatchQueueItem, next: DispatchQueueItem): DispatchConflictState {
  if (current.status === 'cancelled' && next.status !== 'cancelled') return 'needs_review';
  if (current.status === 'resolved' && isActiveEscalationState(next.escalationState)) return 'needs_review';
  if (next.status === 'resolved' && isActiveEscalationState(current.escalationState)) return 'needs_review';
  if (current.assignedMemberIds.join('|') !== next.assignedMemberIds.join('|')) return 'updated_during_sync';
  if (current.priority === 'critical' || next.priority === 'critical') return 'needs_review';
  return 'updated_during_sync';
}

function getQueueConflictReason(current: DispatchQueueItem, next: DispatchQueueItem): string {
  if (current.status === 'cancelled' && next.status !== 'cancelled') {
    return 'Cancelled Dispatch item rejected a later non-admin update.';
  }
  if (current.status === 'resolved' && isActiveEscalationState(next.escalationState)) {
    return 'Resolved Dispatch item received a newer escalation during sync.';
  }
  if (next.status === 'resolved' && isActiveEscalationState(current.escalationState)) {
    return 'Resolution arrived while escalation was active.';
  }
  if (current.assignedMemberIds.join('|') !== next.assignedMemberIds.join('|')) {
    return 'Assignment target changed during Dispatch sync.';
  }
  return DISPATCH_CONFLICT_NOTICE;
}

function chooseEscalatedPingState(
  current: DispatchPing,
  next: DispatchPing,
  base: DispatchPing,
): DispatchPing {
  const currentEscalated = isEscalatedPing(current);
  const nextEscalated = isEscalatedPing(next);
  if (currentEscalated && !nextEscalated) {
    return {
      ...base,
      status: current.status,
      escalationState: current.escalationState,
      priority: strongerPriority(current.priority, next.priority),
    };
  }
  if (nextEscalated) {
    return {
      ...base,
      status: next.status,
      escalationState: next.escalationState,
      priority: strongerPriority(current.priority, next.priority),
    };
  }
  return {
    ...base,
    priority: strongerPriority(current.priority, next.priority),
  };
}

function isEscalatedPing(ping: DispatchPing): boolean {
  return ping.status === 'escalated' || isActiveEscalationState(ping.escalationState);
}

function isActiveEscalationState(state: DispatchEscalationState): boolean {
  return (
    state === 'follow_up' ||
    state === 'escalate_to_lead' ||
    state === 'broadcast_to_team' ||
    state === 'recommended' ||
    state === 'escalated' ||
    state === 'emergency_unresolved'
  );
}

function hasNewAcknowledgment(current: DispatchPing, next: DispatchPing): boolean {
  const currentAck = new Set(current.acknowledgedByMemberIds ?? []);
  return (next.acknowledgedByMemberIds ?? []).some((memberId) => !currentAck.has(memberId));
}

function strongerPriority(
  current: DispatchPing['priority'] | DispatchQueueItem['priority'],
  next: DispatchPing['priority'] | DispatchQueueItem['priority'],
): DispatchPing['priority'] {
  const order: Record<DispatchPing['priority'], number> = {
    low: 1,
    normal: 2,
    high: 3,
    critical: 4,
  };
  return order[next] > order[current] ? next : current;
}

function strongerDeliveryState(
  current: DispatchDeliveryState,
  next: DispatchDeliveryState,
): DispatchDeliveryState {
  if (current === 'escalated' || next === 'escalated') return 'escalated';
  if (current === 'queued' || next === 'queued') return 'queued';
  return next;
}

function createConflictPatch(
  state: DispatchConflictState,
  reason: string,
): {
  conflictState: DispatchConflictState;
  conflictReason: string;
  lastConflictAt: string;
} {
  return {
    conflictState: state,
    conflictReason: reason,
    lastConflictAt: new Date().toISOString(),
  };
}

function getRecordTime(item: {
  createdAt?: string;
  updatedAt?: string;
  occurredAt?: string;
  assignedAt?: string;
}): number {
  const parsed = Date.parse(getRecordTimestamp(item) ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function maxIso(left: string | undefined, right: string | undefined): string {
  const leftTime = Date.parse(left ?? '');
  const rightTime = Date.parse(right ?? '');
  if (!Number.isFinite(leftTime)) return right ?? new Date().toISOString();
  if (!Number.isFinite(rightTime)) return left ?? new Date().toISOString();
  return leftTime >= rightTime ? left! : right!;
}

function stripTransientConflictFields<T extends {
  lastConflictAt?: string;
}>(item: T): Omit<T, 'lastConflictAt'> {
  const { lastConflictAt: _lastConflictAt, ...rest } = item;
  return rest;
}

function normalizeKeyPart(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeMessage(value: string | null | undefined): string {
  return normalizeKeyPart(value).replace(/\s+/g, ' ');
}

function normalizeMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {};
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = value[key];
      return acc;
    }, {});
}

function hashStableValue(value: unknown): string {
  const serialized = stableStringify(value);
  let hash = 5381;
  for (let i = 0; i < serialized.length; i += 1) {
    hash = (hash * 33) ^ serialized.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
    .join(',')}}`;
}
