import { createDispatchEntityId, createDispatchIdempotencyKey } from './dispatchIntegrity';
import type {
  DispatchAuditActor,
  DispatchAuditEvent,
  DispatchAuditEventType,
  DispatchAuditRelatedEntity,
  DispatchLinkedContext,
  DispatchPriority,
  DispatchTimelineEvent,
  ExpeditionMemberRole,
} from './dispatchTypes';

export interface DispatchAuditActorInput {
  memberId: string;
  displayName?: string | null;
  role?: ExpeditionMemberRole;
}

export interface DispatchAuditBuildInput {
  expeditionId: string;
  actor: DispatchAuditActorInput;
  timelineEvent: DispatchTimelineEvent;
}

const AUDIT_DESCRIPTION_MAX_LENGTH = 180;

export function buildDispatchAuditEvent(input: DispatchAuditBuildInput): DispatchAuditEvent {
  const eventType = getAuditEventType(input.timelineEvent);
  const relatedEntity = getRelatedEntity(input.timelineEvent);
  const idempotencyKey = input.timelineEvent.idempotencyKey ?? createDispatchIdempotencyKey({
    expeditionId: input.expeditionId,
    entityType: 'timeline_event',
    actionType: `audit:${eventType}`,
    actorMemberId: input.actor.memberId,
    linkedContextId: input.timelineEvent.linkedContext?.id,
    sourceEntityId: input.timelineEvent.queueItemId ?? input.timelineEvent.pingId ?? input.timelineEvent.id,
    message: `${input.timelineEvent.title}:${input.timelineEvent.detail}`,
    priority: input.timelineEvent.priority,
  });

  return {
    id: createDispatchEntityId('timeline_event', `audit:${idempotencyKey}`),
    idempotencyKey: `audit:${idempotencyKey}`,
    expeditionId: input.expeditionId,
    eventType,
    occurredAt: input.timelineEvent.occurredAt,
    actor: getAuditActor(input.actor),
    title: sanitizeText(input.timelineEvent.title, 96),
    description: getAuditDescription(input.timelineEvent),
    relatedEntity,
    linkedContext: getAuditLinkedContext(input.timelineEvent.linkedContext),
    priority: input.timelineEvent.priority,
    deliveryState: input.timelineEvent.deliveryState,
    safetyScope: 'ecs_team_coordination_only',
  };
}

export function createDispatchAuditLogPayload(auditEvent: DispatchAuditEvent): Record<string, unknown> {
  return {
    source: 'dispatch',
    auditId: auditEvent.id,
    idempotencyKey: auditEvent.idempotencyKey,
    expeditionId: auditEvent.expeditionId,
    eventType: auditEvent.eventType,
    actor: {
      label: auditEvent.actor.label,
      role: auditEvent.actor.role ?? null,
      memberRef: auditEvent.actor.memberId,
    },
    relatedEntity: auditEvent.relatedEntity ?? null,
    linkedContext: auditEvent.linkedContext ?? null,
    priority: auditEvent.priority ?? null,
    deliveryState: auditEvent.deliveryState ?? null,
    description: auditEvent.description,
    safetyScope: auditEvent.safetyScope,
  };
}

function getAuditActor(input: DispatchAuditActorInput): DispatchAuditActor {
  return {
    memberId: safeReference(input.memberId),
    label: sanitizeText(input.displayName || 'Dispatch Operator', 64),
    role: input.role,
  };
}

function getAuditEventType(event: DispatchTimelineEvent): DispatchAuditEventType {
  if (event.title.toLowerCase().includes('permission denied')) return 'permission_denied_attempt';
  if (event.type === 'ping_acknowledged') return 'team_ping_acknowledged';
  if (event.type === 'ping_declined') return 'team_ping_declined';
  if (event.type === 'queue_escalated') return event.pingId ? 'team_ping_escalated' : 'queue_item_escalated';
  if (event.type === 'queue_resolved') return 'queue_item_resolved';
  if (event.type === 'assignment_created') return 'queue_item_assigned';
  if (event.type === 'assist_request_created') {
    return event.priority === 'critical' ? 'emergency_assist_request_created' : 'assist_request_created';
  }
  if (event.type === 'sync') {
    return event.deliveryState === 'failed' ? 'failed_delivery' : 'offline_action_replayed';
  }
  if (event.type === 'sync_conflict') return 'linked_context_changed';
  if (event.type === 'member_stale' || event.type === 'status') return 'member_status_stale';
  if (event.queueItemId && event.type === 'queue') return 'queue_item_created';
  return 'team_ping_created';
}

function getAuditDescription(event: DispatchTimelineEvent): string {
  const base = sanitizeText(event.detail || event.title, AUDIT_DESCRIPTION_MAX_LENGTH);
  if (event.type === 'assist_request_created' || event.priority === 'critical') {
    return `${base} ECS team coordination only.`;
  }
  if (event.deliveryState === 'failed') {
    return 'Delivery failed. Retry remains available through Dispatch.';
  }
  return base;
}

function getRelatedEntity(event: DispatchTimelineEvent): DispatchAuditRelatedEntity | undefined {
  if (event.queueItemId) {
    return {
      type: 'queue_item',
      label: sanitizeText(event.title, 72),
      reference: safeReference(event.queueItemId),
    };
  }
  if (event.pingId) {
    return {
      type: 'ping',
      label: sanitizeText(event.title, 72),
      reference: safeReference(event.pingId),
    };
  }
  return {
    type: 'timeline_event',
    label: sanitizeText(event.title, 72),
    reference: safeReference(event.id),
  };
}

function getAuditLinkedContext(context: DispatchLinkedContext | undefined): DispatchAuditEvent['linkedContext'] {
  if (!context) return undefined;

  return {
    type: context.type,
    label: sanitizeText(context.title, 72),
    reference: safeReference(`${context.type}:${context.id}`),
  };
}

function sanitizeText(value: string, maxLength: number): string {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/-?\d+\.\d{4,}/g, '[coordinate]')
    .trim();

  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function safeReference(value: string): string {
  return `ref_${hashString(value)}`;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
