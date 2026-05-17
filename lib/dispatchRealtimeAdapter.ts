import { supabase, isSupabaseConfigured } from './supabase';
import type {
  DispatchAssignment,
  DispatchPing,
  DispatchQueueItem,
  DispatchTeamMember,
  DispatchTimelineEvent,
} from './dispatchTypes';
import type { DispatchEvent } from './dispatchLiveEvents';

export type DispatchRealtimeEventType =
  | 'ping_upsert'
  | 'queue_item_upsert'
  | 'assignment_upsert'
  | 'team_member_upsert'
  | 'timeline_event_added'
  | 'cad_event_upsert';

export type DispatchRealtimeStatus = 'disabled' | 'connecting' | 'connected' | 'error' | 'closed';

export type DispatchRealtimeEventDraft =
  | { type: 'ping_upsert'; ping: DispatchPing }
  | { type: 'queue_item_upsert'; queueItem: DispatchQueueItem }
  | { type: 'assignment_upsert'; assignment: DispatchAssignment }
  | { type: 'team_member_upsert'; teamMember: DispatchTeamMember }
  | { type: 'timeline_event_added'; timelineEvent: DispatchTimelineEvent }
  | { type: 'cad_event_upsert'; cadEvent: DispatchEvent };

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
    typeof event.type === 'string'
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
  const channel = supabase.channel(`ecs-dispatch:${expeditionId}`, {
    config: {
      broadcast: { self: false },
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
      if (!isDispatchRealtimeEnvelope(payload)) return;
      if (payload.expeditionId !== expeditionId) return;
      if (payload.originClientId === clientId) return;
      if (!rememberEvent(payload.id)) return;
      onEvent(payload);
    },
  );

  channel.subscribe((status: string) => {
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
    default:
      return `${Date.now()}`;
  }
}
