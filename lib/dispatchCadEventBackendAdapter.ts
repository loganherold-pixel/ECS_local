import { isSupabaseConfigured, supabase } from './supabase';
import {
  normalizeDispatchEvent,
  type DispatchEvent,
} from './dispatchLiveEvents';

const DISPATCH_CAD_EVENTS_TABLE = 'dispatch_cad_events';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DispatchCadEventBackendContext {
  teamId: string;
  sessionId: string;
  channelId?: string;
  authorizedUserIds?: string[];
}

export interface DispatchCadEventBackendResult {
  ok: boolean;
  unavailable?: boolean;
  error?: string;
  event?: DispatchEvent;
}

export interface DispatchCadEventFetchResult {
  ok: boolean;
  unavailable?: boolean;
  error?: string;
  events: DispatchEvent[];
}

type DispatchCadEventRow = {
  id: string;
  team_id: string;
  session_id: string;
  channel_id?: string | null;
  category?: string | null;
  hazard_type?: string | null;
  severity: string;
  status?: string | null;
  title: string;
  message: string;
  creator_user_id?: string | null;
  creator_identity: Record<string, unknown>;
  authorized_user_ids: string[];
  location: Record<string, unknown>;
  payload: Record<string, unknown>;
  dedupe_key?: string | null;
  sync_state?: string | null;
  created_at: string;
  updated_at: string;
};

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function getDispatchCadAuthorizedUserIds(
  event: DispatchEvent,
  extraUserIds: string[] = [],
): string[] {
  return Array.from(new Set([
    event.createdBy?.userId,
    ...extraUserIds,
  ].filter(isUuid)));
}

function isValidEventLocation(event: DispatchEvent): event is DispatchEvent & {
  location: NonNullable<DispatchEvent['location']>;
} {
  return (
    !!event.location &&
    Number.isFinite(event.location.latitude) &&
    Number.isFinite(event.location.longitude)
  );
}

function createDispatchCadEventRow(
  event: DispatchEvent,
  context: DispatchCadEventBackendContext,
): DispatchCadEventRow {
  const authorizedUserIds = getDispatchCadAuthorizedUserIds(event, context.authorizedUserIds ?? []);
  return {
    id: event.id,
    team_id: event.teamId ?? context.teamId,
    session_id: event.sessionId ?? context.sessionId,
    channel_id: event.channelId ?? context.channelId ?? null,
    category: event.category ?? null,
    hazard_type: event.hazardType ?? null,
    severity: event.severity,
    status: event.status ?? null,
    title: event.title,
    message: event.message,
    creator_user_id: isUuid(event.createdBy?.userId) ? event.createdBy.userId : null,
    creator_identity: event.createdBy ? { ...event.createdBy } : {},
    authorized_user_ids: authorizedUserIds,
    location: event.location ? { ...event.location } : {},
    payload: {
      ...event,
      teamId: event.teamId ?? context.teamId,
      sessionId: event.sessionId ?? context.sessionId,
      channelId: event.channelId ?? context.channelId,
    },
    dedupe_key: event.dedupeKey ?? null,
    sync_state: event.syncState ?? null,
    created_at: event.createdAt,
    updated_at: event.updatedAt ?? new Date().toISOString(),
  };
}

function normalizeDispatchCadEventRow(row: DispatchCadEventRow): DispatchEvent | null {
  return normalizeDispatchEvent({
    ...row.payload,
    id: row.id,
    teamId: row.team_id,
    sessionId: row.session_id,
    channelId: row.channel_id ?? undefined,
    category: row.category ?? undefined,
    hazardType: row.hazard_type ?? undefined,
    severity: row.severity,
    status: row.status ?? undefined,
    title: row.title,
    message: row.message,
    createdBy: row.creator_identity,
    location: row.location,
    dedupeKey: row.dedupe_key ?? undefined,
    syncState: 'received',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function upsertDispatchCadEventToBackend(
  event: DispatchEvent,
  context: DispatchCadEventBackendContext,
): Promise<DispatchCadEventBackendResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, unavailable: true, error: 'Supabase is not configured for durable CAD storage.' };
  }

  if (!context.teamId || !context.sessionId) {
    return { ok: false, error: 'Missing team/session context for CAD event storage.' };
  }

  if (!isValidEventLocation(event)) {
    return { ok: false, error: 'CAD event is missing a valid GPS location.' };
  }

  const { error } = await supabase
    .from(DISPATCH_CAD_EVENTS_TABLE)
    .upsert(createDispatchCadEventRow(event, context), { onConflict: 'id' });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, event };
}

export async function fetchDispatchCadEventsFromBackend(
  context: DispatchCadEventBackendContext,
): Promise<DispatchCadEventFetchResult> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      unavailable: true,
      error: 'Supabase is not configured for durable CAD storage.',
      events: [],
    };
  }

  if (!context.teamId || !context.sessionId) {
    return { ok: false, error: 'Missing team/session context for CAD event fetch.', events: [] };
  }

  const { data, error } = await supabase
    .from(DISPATCH_CAD_EVENTS_TABLE)
    .select('*')
    .eq('team_id', context.teamId)
    .eq('session_id', context.sessionId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return { ok: false, error: error.message, events: [] };
  }

  const events = Array.isArray(data)
    ? data
      .map((row) => normalizeDispatchCadEventRow(row as DispatchCadEventRow))
      .filter((event): event is DispatchEvent => !!event)
    : [];

  return { ok: true, events };
}
