import { supabase, isSupabaseConfigured } from './supabase';
import type {
  DispatchAcknowledgment,
  DispatchAssignment,
  DispatchAssistRequest,
  DispatchPing,
  DispatchQueueItem,
  DispatchTeamMember,
  DispatchTimelineEvent,
} from './dispatchTypes';
import type { DispatchEvent } from './dispatchLiveEvents';
import type { MissionCommand, MissionCommandEvent } from './dispatchMissionCommandTypes';
import type { OperationalPlaybookInstance } from './dispatchOperationalPlaybookTypes';

export type DispatchRealtimeEventType =
  | 'ping_upsert'
  | 'queue_item_upsert'
  | 'assignment_upsert'
  | 'assist_request_upsert'
  | 'acknowledgment_upsert'
  | 'team_member_upsert'
  | 'timeline_event_added'
  | 'cad_event_upsert'
  | 'mission_command_upsert'
  | 'mission_command_event_added'
  | 'mission_playbook_upsert';

export type DispatchRealtimeStatus = 'disabled' | 'connecting' | 'connected' | 'error' | 'closed';

export type DispatchRealtimeEventDraft =
  | { type: 'ping_upsert'; ping: DispatchPing }
  | { type: 'queue_item_upsert'; queueItem: DispatchQueueItem }
  | { type: 'assignment_upsert'; assignment: DispatchAssignment }
  | { type: 'assist_request_upsert'; assistRequest: DispatchAssistRequest }
  | { type: 'acknowledgment_upsert'; acknowledgment: DispatchAcknowledgment }
  | { type: 'team_member_upsert'; teamMember: DispatchTeamMember }
  | { type: 'timeline_event_added'; timelineEvent: DispatchTimelineEvent }
  | { type: 'cad_event_upsert'; cadEvent: DispatchEvent }
  | { type: 'mission_command_upsert'; missionCommand: MissionCommand }
  | { type: 'mission_command_event_added'; missionCommandEvent: MissionCommandEvent }
  | { type: 'mission_playbook_upsert'; missionPlaybook: OperationalPlaybookInstance };

export type DispatchRealtimeEnvelope = DispatchRealtimeEventDraft & {
  id: string;
  expeditionId: string;
  originClientId: string;
  occurredAt: string;
};

export interface DispatchRealtimeSession {
  publish(event: DispatchRealtimeEventDraft): Promise<boolean>;
  close(): void;
}

export interface DispatchRealtimeSessionOptions {
  expeditionId: string;
  clientId: string;
  onEvent: (event: DispatchRealtimeEnvelope) => void;
  onStatusChange?: (status: DispatchRealtimeStatus) => void;
}

function createRealtimeEnvelopeId(event: DispatchRealtimeEventDraft): string {
  return `dispatch-rt-${event.type}-${getRealtimeRecordKey(event)}`;
}

function isDispatchRealtimeEnvelope(value: unknown): value is DispatchRealtimeEnvelope {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<DispatchRealtimeEnvelope>;
  return (
    typeof event.id === 'string' &&
    typeof event.expeditionId === 'string' &&
    typeof event.originClientId === 'string' &&
    typeof event.occurredAt === 'string' &&
    typeof event.type === 'string' &&
    DISPATCH_REALTIME_EVENT_TYPES.has(event.type as DispatchRealtimeEventType)
  );
}

export function createDispatchRealtimeSession({
  expeditionId,
  clientId,
  onEvent,
  onStatusChange,
}: DispatchRealtimeSessionOptions): DispatchRealtimeSession {
  if (!isSupabaseConfigured || !expeditionId) {
    onStatusChange?.('disabled');
    return {
      async publish() {
        return false;
      },
      close() {},
    };
  }

  const seenEventIds = new Set<string>();
  let closed = false;
  const channel = supabase.channel(`ecs-dispatch:${expeditionId}`, {
    config: {
      broadcast: { self: false, ack: true },
    },
  });

  const rememberEvent = (eventId: string): boolean => {
    if (seenEventIds.has(eventId)) return false;
    seenEventIds.add(eventId);
    if (seenEventIds.size > 200) {
      const [oldest] = seenEventIds;
      if (oldest) seenEventIds.delete(oldest);
    }
    return true;
  };

  channel.on(
    'broadcast' as any,
    { event: 'dispatch_event' },
    ({ payload }: { payload: unknown }) => {
      if (closed) return;
      if (!isDispatchRealtimeEnvelope(payload)) return;
      if (payload.expeditionId !== expeditionId) return;
      if (payload.originClientId === clientId) return;
      if (!rememberEvent(payload.id)) return;
      onEvent(payload);
    },
  );

  channel.subscribe((status: string) => {
    if (closed) return;
    if (status === 'SUBSCRIBED') {
      onStatusChange?.('connected');
      return;
    }
    if (status === 'CLOSED') {
      onStatusChange?.('closed');
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      onStatusChange?.('error');
      return;
    }
    onStatusChange?.('connecting');
  });

  onStatusChange?.('connecting');

  return {
    async publish(event: DispatchRealtimeEventDraft): Promise<boolean> {
      if (closed) return false;
      const envelope: DispatchRealtimeEnvelope = {
        ...event,
        id: createRealtimeEnvelopeId(event),
        expeditionId,
        originClientId: clientId,
        occurredAt: new Date().toISOString(),
      };
      rememberEvent(envelope.id);

      try {
        const result = await channel.send({
          type: 'broadcast',
          event: 'dispatch_event',
          payload: envelope,
        });
        return result === 'ok';
      } catch {
        return false;
      }
    },

    close(): void {
      if (closed) return;
      closed = true;
      seenEventIds.clear();
      try {
        void supabase.removeChannel(channel);
      } catch {}
      onStatusChange?.('closed');
    },
  };
}

function getRealtimeRecordKey(event: DispatchRealtimeEventDraft): string {
  switch (event.type) {
    case 'ping_upsert':
      return [
        event.ping.idempotencyKey ?? event.ping.id,
        event.ping.version ?? 0,
        event.ping.updatedAt ?? event.ping.createdAt,
        event.ping.status,
      ].join(':');
    case 'queue_item_upsert':
      return [
        event.queueItem.idempotencyKey ?? event.queueItem.id,
        event.queueItem.version ?? 0,
        event.queueItem.updatedAt,
        event.queueItem.status,
      ].join(':');
    case 'assignment_upsert':
      return [
        event.assignment.idempotencyKey ?? event.assignment.id,
        event.assignment.version ?? 0,
        event.assignment.updatedAt ?? event.assignment.assignedAt,
        event.assignment.status,
      ].join(':');
    case 'assist_request_upsert':
      return [
        event.assistRequest.idempotencyKey ?? event.assistRequest.id,
        event.assistRequest.version ?? 0,
        event.assistRequest.updatedAt ?? event.assistRequest.createdAt,
        event.assistRequest.status,
      ].join(':');
    case 'acknowledgment_upsert':
      return [
        event.acknowledgment.idempotencyKey ?? event.acknowledgment.id,
        event.acknowledgment.version ?? 0,
        event.acknowledgment.updatedAt ?? event.acknowledgment.acknowledgedAt,
        event.acknowledgment.status,
      ].join(':');
    case 'team_member_upsert':
      return [event.teamMember.id, event.teamMember.lastSeenAt, event.teamMember.status].join(':');
    case 'timeline_event_added':
      return [
        event.timelineEvent.idempotencyKey ?? event.timelineEvent.id,
        event.timelineEvent.version ?? 0,
        event.timelineEvent.occurredAt,
        event.timelineEvent.type,
      ].join(':');
    case 'cad_event_upsert':
      return [
        event.cadEvent.dedupeKey ?? event.cadEvent.id,
        event.cadEvent.updatedAt ?? event.cadEvent.createdAt,
        event.cadEvent.status ?? 'active',
      ].join(':');
    case 'mission_command_upsert':
      return [
        event.missionCommand.idempotencyKey,
        event.missionCommand.version,
        event.missionCommand.updatedAt,
        event.missionCommand.operationalState,
        event.missionCommand.deliveryState,
      ].join(':');
    case 'mission_command_event_added':
      return [
        event.missionCommandEvent.idempotencyKey,
        event.missionCommandEvent.occurredAt,
        event.missionCommandEvent.type,
      ].join(':');
    case 'mission_playbook_upsert':
      return [
        event.missionPlaybook.idempotencyKey,
        event.missionPlaybook.version,
        event.missionPlaybook.updatedAt,
        event.missionPlaybook.state,
      ].join(':');
  }
}

export function isMissionCommandRealtimeEnvelope(
  event: DispatchRealtimeEnvelope,
): event is Extract<
  DispatchRealtimeEnvelope,
  { type: 'mission_command_upsert' | 'mission_command_event_added' | 'mission_playbook_upsert' }
> {
  return event.type === 'mission_command_upsert'
    || event.type === 'mission_command_event_added'
    || event.type === 'mission_playbook_upsert';
}

const DISPATCH_REALTIME_EVENT_TYPES = new Set<DispatchRealtimeEventType>([
  'ping_upsert',
  'queue_item_upsert',
  'assignment_upsert',
  'assist_request_upsert',
  'acknowledgment_upsert',
  'team_member_upsert',
  'timeline_event_added',
  'cad_event_upsert',
  'mission_command_upsert',
  'mission_command_event_added',
  'mission_playbook_upsert',
]);
