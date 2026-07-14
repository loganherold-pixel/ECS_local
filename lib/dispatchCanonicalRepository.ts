import type { SupabaseClient } from '@supabase/supabase-js';

import { createDispatchIdempotencyKey } from './dispatchIntegrity';
import { deriveDispatchPingOperationalState } from './dispatchLifecycle';
import { isSupabaseConfigured, supabase } from './supabase';
import {
  buildMissionCommandCanonicalPlan,
  buildMissionCommandEventCanonicalWrite,
  buildMissionPlaybookCanonicalPlan,
  isDispatchMissionCanonicalEntity,
  parseMissionCanonicalSnapshot,
  canMissionCanonicalMemberParticipate,
  type DispatchMissionCanonicalEntity,
  type DispatchMissionCanonicalEntityType,
  type DispatchMissionCanonicalTable,
  type MissionCanonicalMember,
  type MissionCanonicalWrite,
  type MissionCanonicalWritePlan,
} from './dispatchMissionCommandCanonicalAdapter';
import type {
  DispatchAcknowledgment,
  DispatchAssignment,
  DispatchAssistRequest,
  DispatchLinkedContext,
  DispatchPing,
  DispatchQueueItem,
  DispatchTimelineEvent,
} from './dispatchTypes';

type DispatchLegacyCanonicalEntityType =
  | 'ping'
  | 'queue_item'
  | 'assignment'
  | 'assist_request'
  | 'acknowledgment'
  | 'timeline_event';

export type DispatchCanonicalEntityType =
  | DispatchLegacyCanonicalEntityType
  | DispatchMissionCanonicalEntityType;

type DispatchLegacyCanonicalEntity =
  | { type: 'ping'; value: DispatchPing }
  | { type: 'queue_item'; value: DispatchQueueItem }
  | { type: 'assignment'; value: DispatchAssignment }
  | { type: 'assist_request'; value: DispatchAssistRequest }
  | { type: 'acknowledgment'; value: DispatchAcknowledgment }
  | { type: 'timeline_event'; value: DispatchTimelineEvent };

export type DispatchCanonicalEntity = DispatchLegacyCanonicalEntity | DispatchMissionCanonicalEntity;

type DispatchLegacyCanonicalTable =
  | 'dispatch_pings'
  | 'dispatch_queue_items'
  | 'dispatch_assignments'
  | 'dispatch_assist_requests'
  | 'dispatch_acknowledgments'
  | 'dispatch_timeline_events'
  | 'dispatch_restricted_locations';

export type DispatchCanonicalTable = DispatchLegacyCanonicalTable | DispatchMissionCanonicalTable;

export type DispatchCanonicalErrorCode =
  | 'backend_unavailable'
  | 'identity_unresolved'
  | 'permission_denied'
  | 'scope_mismatch'
  | 'stale_version'
  | 'conflict'
  | 'partial_write'
  | 'validation_error'
  | 'backend_error';

export interface DispatchCanonicalContext {
  expeditionId: string;
  convoyId: string;
  actorUserId?: string | null;
}

export interface DispatchCanonicalMember {
  id: string;
  userId: string;
  callsign: string;
  role: 'lead' | 'sweep' | 'member' | 'support';
  missionCommandAccess?: 'inherit' | 'command' | 'member' | 'viewer';
  revokedAt?: string | null;
}

export interface DispatchCanonicalRowResult {
  id: string;
  serverRevision: number | null;
}

export type DispatchCanonicalResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: DispatchCanonicalErrorCode;
      error: string;
      serverRecordWritten?: boolean;
    };

export interface DispatchCanonicalRemoteSnapshot {
  expeditionId: string;
  convoyId: string;
  pings: DispatchPing[];
  queueItems: DispatchQueueItem[];
  assignments: DispatchAssignment[];
  assistRequests: DispatchAssistRequest[];
  acknowledgments: DispatchAcknowledgment[];
  timelineEvents: DispatchTimelineEvent[];
  missionCommands: import('./dispatchMissionCommandTypes').MissionCommand[];
  missionCommandEvents: import('./dispatchMissionCommandTypes').MissionCommandEvent[];
  operationalPlaybooks: import('./dispatchOperationalPlaybookTypes').OperationalPlaybookInstance[];
  tombstones: Partial<Record<DispatchCanonicalEntityType, string[]>>;
  truncatedTables: DispatchCanonicalTable[];
  coverage: 'full' | 'partial';
  sourceState: 'server_reconciled';
  observedAt: string | null;
  serverRevision: number;
}

export interface DispatchCanonicalSubscription {
  unsubscribe(): void;
}

export interface DispatchCanonicalBackend {
  isAvailable(): boolean;
  getCurrentUserId(): Promise<DispatchCanonicalResult<string>>;
  getOwnMember(context: DispatchCanonicalContext): Promise<DispatchCanonicalResult<DispatchCanonicalMember>>;
  listMembers(convoyId: string): Promise<DispatchCanonicalResult<DispatchCanonicalMember[]>>;
  upsertRow(
    table: DispatchCanonicalTable,
    row: Record<string, unknown>,
    options: { conflictColumns: string; immutable: boolean },
  ): Promise<DispatchCanonicalResult<DispatchCanonicalRowResult>>;
  fetchRows(
    table: DispatchCanonicalTable,
    context: DispatchCanonicalContext,
    limit: number,
  ): Promise<DispatchCanonicalResult<Record<string, unknown>[]>>;
  findRowByClientId(
    table: DispatchCanonicalTable,
    context: DispatchCanonicalContext,
    clientId: string,
  ): Promise<DispatchCanonicalResult<Record<string, unknown> | null>>;
  subscribe(
    context: DispatchCanonicalContext,
    handlers: {
      onChange(): void;
      onStatus(status: 'connecting' | 'connected' | 'degraded' | 'disconnected', error?: string): void;
    },
  ): DispatchCanonicalSubscription;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_OPERATION_ID_PATTERN = /^[A-Za-z0-9:_-]{1,240}$/;
const CANONICAL_PULL_LIMIT = 500;
const REALTIME_TABLES: DispatchCanonicalTable[] = [
  'dispatch_pings',
  'dispatch_queue_items',
  'dispatch_assignments',
  'dispatch_assist_requests',
  'dispatch_acknowledgments',
  'dispatch_timeline_events',
  'dispatch_mission_commands',
  'dispatch_mission_command_targets',
  'dispatch_mission_command_acknowledgments',
  'dispatch_mission_command_events',
  'dispatch_mission_playbook_instances',
  'dispatch_mission_playbook_steps',
  'dispatch_mission_playbook_events',
  'dispatch_mission_deadlines',
  'dispatch_mission_incident_links',
];
const TABLE_BY_ENTITY: Record<DispatchLegacyCanonicalEntityType, DispatchLegacyCanonicalTable> = {
  ping: 'dispatch_pings',
  queue_item: 'dispatch_queue_items',
  assignment: 'dispatch_assignments',
  assist_request: 'dispatch_assist_requests',
  acknowledgment: 'dispatch_acknowledgments',
  timeline_event: 'dispatch_timeline_events',
};
const RESTRICTED_PAYLOAD_KEYS = new Set([
  'lat',
  'latitude',
  'lng',
  'lon',
  'longitude',
  'coordinate',
  'coordinates',
  'gps',
  'gps_position',
  'location',
  'position',
  'raw_payload',
  'service_role',
  'service_role_key',
]);
const SENSITIVE_PAYLOAD_KEY = /(^|_)(token|secret|password|authorization)($|_)/;
const QUALIFIED_SECRET_KEY = /(^|_)(api|service_role|provider|access|refresh|client)_(key|token|secret)($|_)/;

type CanonicalWrite = {
  table: DispatchLegacyCanonicalTable;
  row: Record<string, unknown>;
  immutable: boolean;
  location: {
    sourceKind: 'ping' | 'assist_request';
    latitude: number;
    longitude: number;
    observedAt: string;
    authorizedMemberIds: string[];
  } | null;
};

function fail<T>(code: DispatchCanonicalErrorCode, error: string, serverRecordWritten = false): DispatchCanonicalResult<T> {
  return {
    ok: false,
    code,
    error: sanitizeDiagnosticText(error),
    ...(serverRecordWritten ? { serverRecordWritten: true } : null),
  };
}

function sanitizeDiagnosticText(value: unknown): string {
  return String(value ?? 'Dispatch canonical backend request failed.')
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[a-z0-9._-]+/gi, '[redacted-token]')
    .replace(/(?:service[_-]?role|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*\S+/gi, '[redacted-secret]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

function classifyBackendError(error: unknown): DispatchCanonicalErrorCode {
  const text = sanitizeDiagnosticText(
    typeof error === 'string'
      ? error
      : (error as { message?: unknown; code?: unknown; details?: unknown } | null)?.message ?? error,
  ).toLowerCase();
  if (text.includes('not configured') || text.includes('pgrst205') || text.includes('does not exist')) {
    return 'backend_unavailable';
  }
  if (text.includes('row-level security') || text.includes('permission') || text.includes('42501')) {
    return 'permission_denied';
  }
  if (text.includes('scope_mismatch') || text.includes('membership_mismatch')) {
    return 'scope_mismatch';
  }
  if (text.includes('stale_state_version')) return 'stale_version';
  if (text.includes('state_version_conflict') || text.includes('40001')) return 'conflict';
  if (text.includes('invalid') || text.includes('23514') || text.includes('23503')) return 'validation_error';
  return 'backend_error';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function redactDispatchCanonicalPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactDispatchCanonicalPayload);
  }
  if (!value || typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[-\s]+/g, '_')
      .toLowerCase();
    if (
      RESTRICTED_PAYLOAD_KEYS.has(normalizedKey)
      || SENSITIVE_PAYLOAD_KEY.test(normalizedKey)
      || QUALIFIED_SECRET_KEY.test(normalizedKey)
    ) continue;
    result[key] = redactDispatchCanonicalPayload(nested);
  }
  return result;
}

function sanitizeLinkedContext(context: DispatchLinkedContext | undefined): Record<string, unknown> {
  return asRecord(redactDispatchCanonicalPayload(context));
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildMemberAliases(members: DispatchCanonicalMember[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const member of members) {
    if (member.revokedAt) continue;
    aliases.set(member.id, member.id);
    aliases.set(member.userId, member.id);
    aliases.set(member.callsign.toLowerCase(), member.id);
  }
  return aliases;
}

function resolveMemberIds(
  aliases: Map<string, string>,
  values: string[],
): DispatchCanonicalResult<string[]> {
  const resolved: string[] = [];
  const unresolved: string[] = [];
  for (const value of unique(values)) {
    const normalized = value.trim();
    const memberId = aliases.get(normalized) ?? aliases.get(normalized.toLowerCase());
    if (memberId) resolved.push(memberId);
    else unresolved.push(normalized);
  }
  if (unresolved.length > 0) {
    return fail('identity_unresolved', `${unresolved.length} Dispatch recipient identit${unresolved.length === 1 ? 'y is' : 'ies are'} not mapped to the active convoy.`);
  }
  return { ok: true, data: unique(resolved) };
}

function entityIdempotencyKey(
  context: DispatchCanonicalContext,
  entity: DispatchLegacyCanonicalEntity,
): string {
  return entity.value.idempotencyKey ?? createDispatchIdempotencyKey({
    expeditionId: context.expeditionId,
    entityType: entity.type,
    actionType: 'canonical_upsert',
    sourceEntityId: entity.value.id,
  });
}

function getEntityTimes(entity: DispatchLegacyCanonicalEntity): DispatchCanonicalResult<{
  createdAt: string;
  updatedAt: string;
  observedAt: string;
}> {
  const value = entity.value;
  const createdAt = 'createdAt' in value
    ? value.createdAt
    : 'assignedAt' in value
      ? value.assignedAt
      : 'acknowledgedAt' in value
        ? value.acknowledgedAt
        : value.occurredAt;
  const updatedAt = 'updatedAt' in value && value.updatedAt
    ? value.updatedAt
    : createdAt;
  if (!validIso(createdAt) || !validIso(updatedAt)) {
    return fail('validation_error', 'Dispatch canonical records require valid created and updated timestamps.');
  }
  return { ok: true, data: { createdAt, updatedAt, observedAt: updatedAt } };
}

function getEntityTargets(entity: DispatchLegacyCanonicalEntity): string[] {
  switch (entity.type) {
    case 'ping': return entity.value.targetMemberIds;
    case 'queue_item': return entity.value.assignedMemberIds;
    case 'assignment': return [entity.value.assigneeMemberId];
    case 'assist_request': return entity.value.targetMemberIds;
    case 'acknowledgment': return [entity.value.memberId];
    case 'timeline_event': return entity.value.memberIds;
  }
}

function getEntityContext(entity: DispatchLegacyCanonicalEntity): DispatchLinkedContext | undefined {
  return 'linkedContext' in entity.value ? entity.value.linkedContext : undefined;
}

function buildCanonicalWrite(input: {
  context: DispatchCanonicalContext;
  entity: DispatchLegacyCanonicalEntity;
  actorUserId: string;
  actorMemberId: string;
  members: DispatchCanonicalMember[];
}): DispatchCanonicalResult<CanonicalWrite> {
  const { context, entity, actorUserId, actorMemberId, members } = input;
  const times = getEntityTimes(entity);
  if (!times.ok) return times;

  const aliases = buildMemberAliases(members);
  const targets = resolveMemberIds(aliases, getEntityTargets(entity));
  if (!targets.ok) return targets;

  const idempotencyKey = entityIdempotencyKey(context, entity);
  const version = Math.max(1, Math.trunc(entity.value.version ?? 1));
  const payload = asRecord(redactDispatchCanonicalPayload(entity.value));
  const linkedContext = getEntityContext(entity);
  const base = {
    expedition_id: context.expeditionId,
    convoy_id: context.convoyId,
    client_id: entity.value.id,
    idempotency_key: idempotencyKey,
    actor_user_id: actorUserId,
    actor_member_id: actorMemberId,
    observed_at: times.data.observedAt,
    payload,
  };
  const mutableBase = {
    ...base,
    source_state: 'local_first',
    state_version: version,
    client_created_at: times.data.createdAt,
    client_updated_at: times.data.updatedAt,
  };

  let row: Record<string, unknown>;
  switch (entity.type) {
    case 'ping': {
      const value = entity.value;
      row = {
        ...mutableBase,
        recipient_member_ids: targets.data,
        ping_type: value.type,
        priority: value.priority,
        operational_state: value.operationalState ?? deriveDispatchPingOperationalState({
          deliveryState: value.status,
          requiresAcknowledgment: value.requiresAcknowledgment,
          acknowledgedCount: value.acknowledgedByMemberIds?.length ?? 0,
          targetCount: value.targetMemberIds.length,
        }),
        delivery_state: value.status,
        message: value.message,
        requires_acknowledgment: value.requiresAcknowledgment ?? false,
        response_due_at: value.responseDueAt ?? null,
        linked_context: sanitizeLinkedContext(value.linkedContext),
      };
      break;
    }
    case 'queue_item': {
      const value = entity.value;
      row = {
        ...mutableBase,
        recipient_member_ids: targets.data,
        title: value.title,
        detail: value.detail,
        status: value.status,
        priority: value.priority,
        delivery_state: value.deliveryState,
        linked_context: sanitizeLinkedContext(value.linkedContext),
        due_at: value.dueAt ?? null,
        source_ping_client_id: value.sourcePingId ?? null,
      };
      break;
    }
    case 'assignment': {
      const value = entity.value;
      row = {
        ...mutableBase,
        queue_item_client_id: value.queueItemId,
        assignee_member_id: targets.data[0],
        status: value.status,
        delivery_state: value.deliveryState ?? 'local',
        assigned_at: value.assignedAt,
        accepted_at: value.acceptedAt ?? null,
        completed_at: value.completedAt ?? null,
        notes: value.notes ?? null,
      };
      break;
    }
    case 'assist_request': {
      const value = entity.value;
      row = {
        ...mutableBase,
        recipient_member_ids: targets.data,
        assist_type: value.assistType,
        priority: value.priority,
        status: value.status,
        delivery_state: value.deliveryState ?? 'local',
        message: value.message,
        require_acknowledgment: value.requireAcknowledgment,
        linked_context: sanitizeLinkedContext(value.linkedContext),
        source_ping_client_id: value.sourcePingId ?? null,
        queue_item_client_id: value.queueItemId ?? null,
      };
      break;
    }
    case 'acknowledgment': {
      const value = entity.value;
      row = {
        ...base,
        ping_client_id: value.pingId,
        queue_item_client_id: value.queueItemId ?? null,
        member_id: actorMemberId,
        status: value.status,
        message: value.message ?? null,
        acknowledged_at: value.acknowledgedAt,
        client_updated_at: times.data.updatedAt,
      };
      break;
    }
    case 'timeline_event': {
      const value = entity.value;
      row = {
        ...base,
        member_ids: targets.data,
        event_type: value.type,
        title: value.title,
        detail: value.detail,
        priority: value.priority,
        actor_label: value.actor ?? null,
        target_label: value.target ?? null,
        linked_context: sanitizeLinkedContext(value.linkedContext),
        queue_item_client_id: value.queueItemId ?? null,
        ping_client_id: value.pingId ?? null,
        occurred_at: value.occurredAt,
      };
      break;
    }
  }

  const coordinates = linkedContext?.coordinates;
  const canStoreLocation = entity.type === 'ping' || entity.type === 'assist_request';
  const validCoordinates = coordinates && Number.isFinite(coordinates.latitude) && Number.isFinite(coordinates.longitude);
  const authorizedMemberIds = targets.data.length > 0
    ? unique([actorMemberId, ...targets.data])
    : unique([actorMemberId, ...members.filter((member) => !member.revokedAt).map((member) => member.id)]);

  return {
    ok: true,
    data: {
      table: TABLE_BY_ENTITY[entity.type],
      row,
      immutable: entity.type === 'acknowledgment' || entity.type === 'timeline_event',
      location: canStoreLocation && validCoordinates
        ? {
            sourceKind: entity.type,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            observedAt: times.data.observedAt,
            authorizedMemberIds,
          }
        : null,
    },
  };
}

function locationKey(row: Record<string, unknown>): string {
  return `${String(row.source_kind)}:${String(row.source_client_id)}`;
}

function attachLocation(
  context: unknown,
  location: Record<string, unknown> | undefined,
): DispatchLinkedContext | undefined {
  const normalized = asRecord(context);
  if (Object.keys(normalized).length === 0) return undefined;
  if (!location) return normalized as unknown as DispatchLinkedContext;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return normalized as unknown as DispatchLinkedContext;
  }
  return {
    ...normalized,
    coordinates: { latitude, longitude },
    restricted: true,
  } as unknown as DispatchLinkedContext;
}

function payloadOf<T>(row: Record<string, unknown>): T {
  return asRecord(row.payload) as T;
}

function maxServerRevision(rows: Record<string, unknown>[][]): number {
  let max = 0;
  rows.forEach((group) => group.forEach((row) => {
    const revision = Number(row.server_revision);
    if (Number.isFinite(revision)) max = Math.max(max, revision);
  }));
  return max;
}

function maxObservedAt(rows: Record<string, unknown>[][]): string | null {
  let latest: string | null = null;
  rows.forEach((group) => group.forEach((row) => {
    const value = typeof row.server_observed_at === 'string' ? row.server_observed_at : null;
    if (!value || !validIso(value)) return;
    if (!latest || Date.parse(value) > Date.parse(latest)) latest = value;
  }));
  return latest;
}

export class DispatchCanonicalRepository {
  constructor(private readonly backend: DispatchCanonicalBackend = createSupabaseDispatchCanonicalBackend()) {}

  async upsertEntity(
    context: DispatchCanonicalContext,
    entity: DispatchCanonicalEntity,
    clientOperationId?: string,
  ): Promise<DispatchCanonicalResult<DispatchCanonicalRowResult>> {
    if (!context.expeditionId.trim() || !UUID_PATTERN.test(context.convoyId)) {
      return fail('validation_error', 'Canonical Dispatch sync requires an expedition ID and cloud convoy UUID.');
    }
    if (!this.backend.isAvailable()) {
      return fail('backend_unavailable', 'Canonical Dispatch backend is unavailable. Local Dispatch remains active.');
    }

    const actorUser = context.actorUserId
      ? { ok: true as const, data: context.actorUserId }
      : await this.backend.getCurrentUserId();
    if (!actorUser.ok) return actorUser;

    if (isDispatchMissionCanonicalEntity(entity)) {
      const members = await this.backend.listMembers(context.convoyId);
      if (!members.ok) return members;
      const actorMember = members.data.find((member) => (
        !member.revokedAt && member.userId === actorUser.data
      ));
      if (!actorMember) {
        return fail('permission_denied', 'The signed-in user is not an active member of this convoy.');
      }
      return this.upsertMissionEntity({
        context,
        entity,
        actorUserId: actorUser.data,
        actorMember,
        members: members.data,
        clientOperationId,
      });
    }

    const members = entity.type === 'acknowledgment'
      ? await this.backend.getOwnMember(context).then((result) => (
          result.ok ? { ok: true as const, data: [result.data] } : result
        ))
      : await this.backend.listMembers(context.convoyId);
    if (!members.ok) return members;
    const actorMember = members.data.find((member) => (
      !member.revokedAt && member.userId === actorUser.data
    ));
    if (!actorMember) {
      return fail('permission_denied', 'The signed-in user is not an active member of this convoy.');
    }

    const write = buildCanonicalWrite({
      context,
      entity,
      actorUserId: actorUser.data,
      actorMemberId: actorMember.id,
      members: members.data,
    });
    if (!write.ok) return write;

    const stored = await this.backend.upsertRow(write.data.table, write.data.row, {
      conflictColumns: 'expedition_id,idempotency_key',
      immutable: write.data.immutable,
    });
    if (!stored.ok) return stored;

    if (write.data.location) {
      const location = await this.backend.upsertRow('dispatch_restricted_locations', {
        expedition_id: context.expeditionId,
        convoy_id: context.convoyId,
        source_kind: write.data.location.sourceKind,
        source_client_id: entity.value.id,
        source_record_id: stored.data.id,
        actor_user_id: actorUser.data,
        actor_member_id: actorMember.id,
        authorized_member_ids: write.data.location.authorizedMemberIds,
        latitude: write.data.location.latitude,
        longitude: write.data.location.longitude,
        accuracy_meters: null,
        observed_at: write.data.location.observedAt,
      }, {
        conflictColumns: 'expedition_id,source_kind,source_client_id',
        immutable: true,
      });
      if (!location.ok) {
        return fail('partial_write', 'Dispatch content was stored, but its restricted location was not. The local outbox will retry.', true);
      }
    }

    return stored;
  }

  private async upsertMissionEntity(input: {
    context: DispatchCanonicalContext;
    entity: DispatchMissionCanonicalEntity;
    actorUserId: string;
    actorMember: DispatchCanonicalMember;
    members: DispatchCanonicalMember[];
    clientOperationId?: string;
  }): Promise<DispatchCanonicalResult<DispatchCanonicalRowResult>> {
    const { context, entity, actorUserId, actorMember, members, clientOperationId } = input;
    if (entity.value.expeditionId !== context.expeditionId) {
      return fail('scope_mismatch', 'Mission Command record does not match the active expedition.');
    }

    if (entity.type === 'mission_command_event') {
      if (!canMissionCanonicalMemberParticipate(actorMember as MissionCanonicalMember)) {
        return fail('permission_denied', 'Mission Command viewers are read-only.');
      }
      const eventActorId = entity.value.actor.id.toLowerCase();
      if (![
        actorMember.id.toLowerCase(),
        actorMember.userId.toLowerCase(),
        actorMember.callsign.toLowerCase(),
      ].includes(eventActorId)) {
        return fail('permission_denied', 'Mission Command events may only be persisted by their recorded actor.');
      }
      const commandRow = await this.backend.findRowByClientId(
        'dispatch_mission_commands',
        context,
        entity.value.commandId,
      );
      if (!commandRow.ok) return commandRow;
      if (!commandRow.data?.id) {
        return fail('validation_error', 'Mission Command event references a command that is not canonical yet.');
      }
      const write = buildMissionCommandEventCanonicalWrite({
        expeditionId: context.expeditionId,
        convoyId: context.convoyId,
        commandId: String(commandRow.data.id),
        actorUserId,
        actorMemberId: actorMember.id,
        event: entity.value,
        sanitize: redactDispatchCanonicalPayload,
      });
      if (!write.ok) return fail(write.code, write.error);
      return this.storeMissionWrite(write.data, clientOperationId);
    }

    const planResult = entity.type === 'mission_command'
      ? buildMissionCommandCanonicalPlan({
          expeditionId: context.expeditionId,
          convoyId: context.convoyId,
          actorUserId,
          actorMember: actorMember as MissionCanonicalMember,
          members: members as MissionCanonicalMember[],
          command: entity.value,
          sanitize: redactDispatchCanonicalPayload,
        })
      : buildMissionPlaybookCanonicalPlan({
          expeditionId: context.expeditionId,
          convoyId: context.convoyId,
          actorUserId,
          actorMember: actorMember as MissionCanonicalMember,
          instance: entity.value,
          sanitize: redactDispatchCanonicalPayload,
        });
    if (!planResult.ok) return fail(planResult.code, planResult.error);
    return this.storeMissionPlan(context, planResult.data, clientOperationId);
  }

  private async storeMissionPlan(
    context: DispatchCanonicalContext,
    plan: MissionCanonicalWritePlan,
    clientOperationId?: string,
  ): Promise<DispatchCanonicalResult<DispatchCanonicalRowResult>> {
    let parent: DispatchCanonicalResult<DispatchCanonicalRowResult>;
    if (plan.canWriteParent) {
      parent = await this.storeMissionWrite(plan.parent, clientOperationId);
      if (!parent.ok) return parent;
    } else {
      if (plan.ownAcknowledgmentCount === 0) {
        return fail('permission_denied', 'This Mission Command record is read-only for the signed-in member.');
      }
      const existing = await this.backend.findRowByClientId(
        plan.parent.table,
        context,
        String(plan.parent.row.client_id),
      );
      if (!existing.ok) return existing;
      if (!existing.data?.id) {
        return fail('validation_error', 'The acknowledged Mission Command is not canonical yet.');
      }
      parent = {
        ok: true,
        data: {
          id: String(existing.data.id),
          serverRevision: Number.isFinite(Number(existing.data.server_revision))
            ? Number(existing.data.server_revision)
            : null,
        },
      };
    }

    const childWrites = plan.children(parent.data.id).filter((write) => (
      plan.canWriteParent || write.table === 'dispatch_mission_command_acknowledgments'
    ));
    let lastResult = parent.data;
    for (const write of childWrites) {
      const stored = await this.storeMissionWrite(write, clientOperationId);
      if (!stored.ok) {
        return fail(
          stored.code,
          `Mission Command parent was stored, but a related record failed: ${stored.error}`,
          true,
        );
      }
      lastResult = stored.data;
    }

    if (plan.canWriteParent) {
      const location = plan.restrictedLocation(parent.data.id);
      if (location) {
        const storedLocation = await this.backend.upsertRow('dispatch_restricted_locations', {
          expedition_id: context.expeditionId,
          convoy_id: context.convoyId,
          source_kind: location.sourceKind,
          source_client_id: location.sourceClientId,
          source_record_id: parent.data.id,
          actor_user_id: plan.parent.row.actor_user_id,
          actor_member_id: plan.parent.row.actor_member_id,
          authorized_member_ids: location.authorizedMemberIds,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy_meters: location.accuracyMeters,
          observed_at: location.observedAt,
        }, {
          conflictColumns: 'expedition_id,source_kind,source_client_id',
          immutable: true,
        });
        if (!storedLocation.ok) {
          return fail(
            'partial_write',
            'Mission Command content was stored, but its restricted location was not. The local outbox will retry.',
            true,
          );
        }
      }
    }

    return { ok: true, data: lastResult };
  }

  private storeMissionWrite(
    write: MissionCanonicalWrite,
    clientOperationId?: string,
  ): Promise<DispatchCanonicalResult<DispatchCanonicalRowResult>> {
    const fallbackOperationId = String(
      write.row.client_operation_id
      ?? write.row.idempotency_key
      ?? write.row.client_id,
    );
    const safeClientOperationId = clientOperationId
      && CLIENT_OPERATION_ID_PATTERN.test(clientOperationId)
      ? clientOperationId
      : fallbackOperationId;
    return this.backend.upsertRow(write.table, {
      ...write.row,
      client_operation_id: safeClientOperationId,
    }, {
      conflictColumns: 'expedition_id,idempotency_key',
      immutable: write.immutable,
    });
  }

  async pullExpedition(
    context: DispatchCanonicalContext,
  ): Promise<DispatchCanonicalResult<DispatchCanonicalRemoteSnapshot>> {
    if (!this.backend.isAvailable()) {
      return fail('backend_unavailable', 'Canonical Dispatch backend is unavailable.');
    }

    const tables: DispatchCanonicalTable[] = [
      'dispatch_pings',
      'dispatch_queue_items',
      'dispatch_assignments',
      'dispatch_assist_requests',
      'dispatch_acknowledgments',
      'dispatch_timeline_events',
      'dispatch_restricted_locations',
      'dispatch_mission_commands',
      'dispatch_mission_command_targets',
      'dispatch_mission_command_acknowledgments',
      'dispatch_mission_command_events',
      'dispatch_mission_playbook_instances',
      'dispatch_mission_playbook_steps',
      'dispatch_mission_playbook_events',
      'dispatch_mission_deadlines',
      'dispatch_mission_incident_links',
    ];
    const memberResult = await this.backend.listMembers(context.convoyId);
    if (!memberResult.ok) return memberResult;
    const results = await Promise.all(tables.map((table) => (
      this.backend.fetchRows(table, context, CANONICAL_PULL_LIMIT)
    )));
    const failure = results.find((result) => !result.ok);
    if (failure && !failure.ok) return failure;

    const groups = results.map((result) => result.ok ? result.data : []);
    const [
      allPingRows,
      allQueueRows,
      allAssignmentRows,
      allAssistRows,
      ackRows,
      timelineRows,
      locationRows,
      missionCommandRows,
      missionTargetRows,
      missionAcknowledgmentRows,
      missionEventRows,
      missionPlaybookRows,
      missionStepRows,
      missionPlaybookEventRows,
      missionDeadlineRows,
      missionIncidentLinkRows,
    ] = groups;
    const activeRows = (rows: Record<string, unknown>[]) => rows.filter((row) => !row.deleted_at);
    const pingRows = activeRows(allPingRows);
    const queueRows = activeRows(allQueueRows);
    const assignmentRows = activeRows(allAssignmentRows);
    const assistRows = activeRows(allAssistRows);
    const locationBySource = new Map(locationRows.map((row) => [locationKey(row), row]));

    const pings = pingRows.map((row): DispatchPing => ({
      ...payloadOf<DispatchPing>(row),
      id: String(row.client_id),
      idempotencyKey: String(row.idempotency_key),
      version: Number(row.state_version) || 1,
      type: row.ping_type as DispatchPing['type'],
      priority: row.priority as DispatchPing['priority'],
      status: row.delivery_state as DispatchPing['status'],
      operationalState: row.operational_state as DispatchPing['operationalState'],
      message: String(row.message),
      createdAt: String(row.client_created_at),
      updatedAt: String(row.client_updated_at),
      linkedContext: attachLocation(
        row.linked_context,
        locationBySource.get(`ping:${String(row.client_id)}`),
      ),
    }));
    const queueItems = queueRows.map((row): DispatchQueueItem => ({
      ...payloadOf<DispatchQueueItem>(row),
      id: String(row.client_id),
      idempotencyKey: String(row.idempotency_key),
      version: Number(row.state_version) || 1,
      status: row.status as DispatchQueueItem['status'],
      priority: row.priority as DispatchQueueItem['priority'],
      deliveryState: row.delivery_state as DispatchQueueItem['deliveryState'],
      createdAt: String(row.client_created_at),
      updatedAt: String(row.client_updated_at),
      linkedContext: attachLocation(row.linked_context, undefined) ?? payloadOf<DispatchQueueItem>(row).linkedContext,
    }));
    const assignments = assignmentRows.map((row): DispatchAssignment => ({
      ...payloadOf<DispatchAssignment>(row),
      id: String(row.client_id),
      idempotencyKey: String(row.idempotency_key),
      version: Number(row.state_version) || 1,
      status: row.status as DispatchAssignment['status'],
      deliveryState: row.delivery_state as DispatchAssignment['deliveryState'],
      assignedAt: String(row.assigned_at),
      updatedAt: String(row.client_updated_at),
    }));
    const assistRequests = assistRows.map((row): DispatchAssistRequest => ({
      ...payloadOf<DispatchAssistRequest>(row),
      id: String(row.client_id),
      idempotencyKey: String(row.idempotency_key),
      version: Number(row.state_version) || 1,
      assistType: row.assist_type as DispatchAssistRequest['assistType'],
      priority: row.priority as DispatchAssistRequest['priority'],
      status: row.status as DispatchAssistRequest['status'],
      deliveryState: row.delivery_state as DispatchAssistRequest['deliveryState'],
      createdAt: String(row.client_created_at),
      updatedAt: String(row.client_updated_at),
      linkedContext: attachLocation(
        row.linked_context,
        locationBySource.get(`assist_request:${String(row.client_id)}`),
      ),
    }));
    const acknowledgments = ackRows.map((row): DispatchAcknowledgment => ({
      ...payloadOf<DispatchAcknowledgment>(row),
      id: String(row.client_id),
      idempotencyKey: String(row.idempotency_key),
      version: 1,
      pingId: String(row.ping_client_id),
      queueItemId: row.queue_item_client_id ? String(row.queue_item_client_id) : undefined,
      status: row.status as DispatchAcknowledgment['status'],
      acknowledgedAt: String(row.acknowledged_at),
      updatedAt: String(row.client_updated_at),
    }));
    const timelineEvents = timelineRows.map((row): DispatchTimelineEvent => ({
      ...payloadOf<DispatchTimelineEvent>(row),
      id: String(row.client_id),
      idempotencyKey: String(row.idempotency_key),
      version: 1,
      type: row.event_type as DispatchTimelineEvent['type'],
      title: String(row.title),
      detail: String(row.detail),
      priority: row.priority as DispatchTimelineEvent['priority'],
      occurredAt: String(row.occurred_at),
      linkedContext: attachLocation(row.linked_context, undefined),
    }));

    const mission = parseMissionCanonicalSnapshot({
      members: memberResult.data,
      rows: {
        dispatch_mission_commands: missionCommandRows,
        dispatch_mission_command_targets: missionTargetRows,
        dispatch_mission_command_acknowledgments: missionAcknowledgmentRows,
        dispatch_mission_command_events: missionEventRows,
        dispatch_mission_playbook_instances: missionPlaybookRows,
        dispatch_mission_playbook_steps: missionStepRows,
        dispatch_mission_playbook_events: missionPlaybookEventRows,
        dispatch_mission_deadlines: missionDeadlineRows,
        dispatch_mission_incident_links: missionIncidentLinkRows,
        dispatch_restricted_locations: locationRows,
      },
    });

    const truncatedTables = tables.filter((_, index) => groups[index].length >= CANONICAL_PULL_LIMIT);
    return {
      ok: true,
      data: {
        expeditionId: context.expeditionId,
        convoyId: context.convoyId,
        pings,
        queueItems,
        assignments,
        assistRequests,
        acknowledgments,
        timelineEvents,
        missionCommands: mission.missionCommands,
        missionCommandEvents: mission.missionCommandEvents,
        operationalPlaybooks: mission.operationalPlaybooks,
        tombstones: {
          ping: allPingRows.filter((row) => row.deleted_at).map((row) => String(row.client_id)),
          queue_item: allQueueRows.filter((row) => row.deleted_at).map((row) => String(row.client_id)),
          assignment: allAssignmentRows.filter((row) => row.deleted_at).map((row) => String(row.client_id)),
          assist_request: allAssistRows.filter((row) => row.deleted_at).map((row) => String(row.client_id)),
          mission_command: mission.tombstones.mission_command,
          mission_playbook_instance: mission.tombstones.mission_playbook_instance,
        },
        truncatedTables,
        coverage: truncatedTables.length > 0 ? 'partial' : 'full',
        sourceState: 'server_reconciled',
        observedAt: maxObservedAt(groups),
        serverRevision: maxServerRevision(groups),
      },
    };
  }

  subscribe(
    context: DispatchCanonicalContext,
    handlers: Parameters<DispatchCanonicalBackend['subscribe']>[1],
  ): DispatchCanonicalSubscription {
    if (!this.backend.isAvailable() || !UUID_PATTERN.test(context.convoyId)) {
      handlers.onStatus('disconnected');
      return { unsubscribe() {} };
    }
    return this.backend.subscribe(context, handlers);
  }
}

export function createSupabaseDispatchCanonicalBackend(
  client: SupabaseClient = supabase,
): DispatchCanonicalBackend {
  const unsafeClient = client as any;
  return {
    isAvailable() {
      return isSupabaseConfigured;
    },

    async getCurrentUserId() {
      const getUser = unsafeClient.auth?.getUser?.bind(unsafeClient.auth);
      if (getUser) {
        const { data, error } = await getUser();
        if (error || !data?.user?.id) {
          return fail(classifyBackendError(error), error?.message ?? 'No authenticated Dispatch user is available.');
        }
        return { ok: true, data: String(data.user.id) };
      }
      const { data, error } = await unsafeClient.auth.getSession();
      if (error || !data?.session?.user?.id) {
        return fail('permission_denied', 'No authenticated Dispatch user is available.');
      }
      return { ok: true, data: String(data.session.user.id) };
    },

    async listMembers(convoyId) {
      let { data, error } = await unsafeClient
        .from('convoy_members')
        .select('id, user_id, callsign, role, mission_command_access, revoked_at')
        .eq('convoy_id', convoyId);
      if (error && String(error.message ?? '').includes('mission_command_access')) {
        const fallback = await unsafeClient
          .from('convoy_members')
          .select('id, user_id, callsign, role, revoked_at')
          .eq('convoy_id', convoyId);
        data = fallback.data;
        error = fallback.error;
      }
      if (error) return fail(classifyBackendError(error), error.message);
      return {
        ok: true,
        data: (Array.isArray(data) ? data : []).map((row: any) => ({
          id: String(row.id),
          userId: String(row.user_id),
          callsign: String(row.callsign ?? ''),
          role: row.role,
          missionCommandAccess: row.mission_command_access ?? 'inherit',
          revokedAt: row.revoked_at ?? null,
        })),
      };
    },

    async getOwnMember(context) {
      const { data, error } = await unsafeClient
        .rpc('resolve_dispatch_actor_membership', {
          target_expedition_id: context.expeditionId,
          target_convoy_id: context.convoyId,
        })
        .maybeSingle();
      if (error || !data) {
        return fail(
          classifyBackendError(error),
          error?.message ?? 'The signed-in Dispatch membership could not be resolved.',
        );
      }
      return {
        ok: true,
        data: {
          id: String(data.id),
          userId: String(data.user_id),
          callsign: String(data.callsign ?? ''),
          role: data.role,
          missionCommandAccess: data.mission_command_access ?? 'inherit',
          revokedAt: data.revoked_at ?? null,
        },
      };
    },

    async upsertRow(table, row, options) {
      const { data, error } = await unsafeClient
        .from(table)
        .upsert(row, {
          onConflict: options.conflictColumns,
          ignoreDuplicates: options.immutable,
        })
        .select('id, server_revision')
        .maybeSingle();
      if (error) return fail(classifyBackendError(error), error.message);
      if (data?.id) {
        return {
          ok: true,
          data: {
            id: String(data.id),
            serverRevision: Number.isFinite(Number(data.server_revision)) ? Number(data.server_revision) : null,
          },
        };
      }

      let lookup = unsafeClient.from(table).select('id, server_revision').eq('expedition_id', row.expedition_id);
      if (table === 'dispatch_restricted_locations') {
        lookup = lookup
          .eq('source_kind', row.source_kind)
          .eq('source_client_id', row.source_client_id);
      } else {
        lookup = lookup.eq('idempotency_key', row.idempotency_key);
      }
      const existing = await lookup.maybeSingle();
      if (existing.error || !existing.data?.id) {
        return fail(classifyBackendError(existing.error), existing.error?.message ?? 'Canonical Dispatch idempotency receipt is unavailable.');
      }
      return {
        ok: true,
        data: {
          id: String(existing.data.id),
          serverRevision: Number.isFinite(Number(existing.data.server_revision))
            ? Number(existing.data.server_revision)
            : null,
        },
      };
    },

    async fetchRows(table, context, limit) {
      let query = unsafeClient
        .from(table)
        .select('*')
        .eq('expedition_id', context.expeditionId)
        .eq('convoy_id', context.convoyId)
        .order('server_revision', { ascending: true })
        .limit(Math.max(1, Math.min(CANONICAL_PULL_LIMIT, limit)));
      const { data, error } = await query;
      if (error) return fail(classifyBackendError(error), error.message);
      return { ok: true, data: Array.isArray(data) ? data : [] };
    },

    async findRowByClientId(table, context, clientId) {
      const { data, error } = await unsafeClient
        .from(table)
        .select('*')
        .eq('expedition_id', context.expeditionId)
        .eq('convoy_id', context.convoyId)
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) return fail(classifyBackendError(error), error.message);
      return { ok: true, data: data ? asRecord(data) : null };
    },

    subscribe(context, handlers) {
      const channel = unsafeClient.channel(`ecs-dispatch-canonical:${context.convoyId}`);
      REALTIME_TABLES.forEach((table) => {
        channel.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table,
          filter: `convoy_id=eq.${context.convoyId}`,
        }, () => handlers.onChange());
      });
      channel.subscribe((status: string, error?: unknown) => {
        if (status === 'SUBSCRIBED') handlers.onStatus('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          handlers.onStatus('degraded', sanitizeDiagnosticText((error as any)?.message ?? 'Canonical Dispatch realtime is degraded.'));
        } else if (status === 'CLOSED') handlers.onStatus('disconnected');
        else handlers.onStatus('connecting');
      });
      handlers.onStatus('connecting');
      return {
        unsubscribe() {
          try {
            void unsafeClient.removeChannel(channel);
          } catch {}
          handlers.onStatus('disconnected');
        },
      };
    },
  };
}

export const dispatchCanonicalRepository = new DispatchCanonicalRepository();
