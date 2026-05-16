import type { DispatchTimelineEvent } from './dispatchTypes';
import { createDispatchAuditLogPayload } from './dispatchAuditAdapter';
import { expeditionStateStore } from './expeditionStateStore';

export interface DispatchTimelineLogAdapterResult {
  persisted: boolean;
  reason: string;
}

const stagedAuditIds = new Set<string>();

export function stageDispatchTimelineForExpeditionLog(
  event: DispatchTimelineEvent,
): DispatchTimelineLogAdapterResult {
  if (!event.auditEvent) {
    return {
      persisted: false,
      reason: 'Dispatch timeline event has no audit payload.',
    };
  }

  if (stagedAuditIds.has(event.auditEvent.idempotencyKey)) {
    return {
      persisted: false,
      reason: 'Dispatch audit event already staged.',
    };
  }

  const existing = expeditionStateStore
    .getTimeline(event.auditEvent.expeditionId)
    .some((timelineEvent) => timelineEvent.eventData?.idempotencyKey === event.auditEvent?.idempotencyKey);
  if (existing) {
    stagedAuditIds.add(event.auditEvent.idempotencyKey);
    return {
      persisted: false,
      reason: 'Dispatch audit event already exists in expedition timeline.',
    };
  }

  stagedAuditIds.add(event.auditEvent.idempotencyKey);
  const result = expeditionStateStore.logTimelineEvent(
    'manual_note',
    createDispatchAuditLogPayload(event.auditEvent),
  );

  return {
    persisted: Boolean(result),
    reason: result
      ? 'Dispatch audit event staged to expedition timeline.'
      : 'Dispatch audit event kept local; expedition timeline unavailable.',
  };
}
