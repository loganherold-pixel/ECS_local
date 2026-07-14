import { createDispatchIdempotencyKey } from './dispatchIntegrity';
import {
  normalizePersistedMissionCommand,
  normalizePersistedMissionCommandEvent,
} from './dispatchMissionCommandDomain';
import {
  normalizePersistedOperationalPlaybookInstance,
} from './dispatchOperationalPlaybookDomain';
import type {
  MissionCommand,
  MissionCommandAcknowledgment,
  MissionCommandEvent,
  MissionCommandTarget,
} from './dispatchMissionCommandTypes';
import type {
  OperationalPlaybookDeadline,
  OperationalPlaybookEvent,
  OperationalPlaybookInstance,
} from './dispatchOperationalPlaybookTypes';
import type { DispatchLinkedContext } from './dispatchTypes';

export type DispatchMissionCanonicalEntityType =
  | 'mission_command'
  | 'mission_command_event'
  | 'mission_playbook_instance';

export type DispatchMissionCanonicalEntity =
  | { type: 'mission_command'; value: MissionCommand }
  | { type: 'mission_command_event'; value: MissionCommandEvent }
  | { type: 'mission_playbook_instance'; value: OperationalPlaybookInstance };

export type DispatchMissionCanonicalTable =
  | 'dispatch_mission_commands'
  | 'dispatch_mission_command_targets'
  | 'dispatch_mission_command_acknowledgments'
  | 'dispatch_mission_command_events'
  | 'dispatch_mission_playbook_instances'
  | 'dispatch_mission_playbook_steps'
  | 'dispatch_mission_playbook_events'
  | 'dispatch_mission_deadlines'
  | 'dispatch_mission_incident_links';

export interface MissionCanonicalMember {
  id: string;
  userId: string;
  callsign: string;
  role: 'lead' | 'sweep' | 'member' | 'support';
  missionCommandAccess?: 'inherit' | 'command' | 'member' | 'viewer';
  revokedAt?: string | null;
}

export interface MissionCanonicalWrite {
  table: DispatchMissionCanonicalTable;
  row: Record<string, unknown>;
  immutable: boolean;
}

export interface MissionCanonicalRestrictedLocation {
  sourceKind: 'mission_command';
  sourceClientId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  observedAt: string;
  authorizedMemberIds: string[];
}

export interface MissionCanonicalWritePlan {
  parent: MissionCanonicalWrite;
  children(parentId: string): MissionCanonicalWrite[];
  restrictedLocation(parentId: string): MissionCanonicalRestrictedLocation | null;
  canWriteParent: boolean;
  ownAcknowledgmentCount: number;
}

export interface MissionCanonicalParsedSnapshot {
  missionCommands: MissionCommand[];
  missionCommandEvents: MissionCommandEvent[];
  operationalPlaybooks: OperationalPlaybookInstance[];
  tombstones: {
    mission_command: string[];
    mission_playbook_instance: string[];
  };
}

export type MissionCanonicalAdapterResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: 'identity_unresolved' | 'validation_error'; error: string };

type Sanitizer = (value: unknown) => unknown;

const COMMAND_ROLE = new Set<MissionCanonicalMember['role']>(['lead', 'sweep', 'support']);

export function resolveMissionCanonicalMemberAccess(
  member: MissionCanonicalMember,
): 'command' | 'member' | 'viewer' {
  if (member.missionCommandAccess && member.missionCommandAccess !== 'inherit') {
    return member.missionCommandAccess;
  }
  return COMMAND_ROLE.has(member.role) ? 'command' : 'member';
}

export function canMissionCanonicalMemberParticipate(member: MissionCanonicalMember): boolean {
  return resolveMissionCanonicalMemberAccess(member) !== 'viewer';
}

function hasMissionCanonicalCommandAccess(member: MissionCanonicalMember): boolean {
  return resolveMissionCanonicalMemberAccess(member) === 'command';
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function childIdentity(input: {
  expeditionId: string;
  entityType: 'mission_command' | 'mission_command_event' | 'operational_playbook' | 'operational_playbook_event';
  actionType: string;
  sourceEntityId: string;
  targetMemberIds?: string[];
}): { clientId: string; idempotencyKey: string } {
  const idempotencyKey = createDispatchIdempotencyKey(input);
  return {
    clientId: `${input.actionType}:${idempotencyKey.split(':').slice(-1)[0] ?? 'record'}`,
    idempotencyKey,
  };
}

function aliasesFor(members: MissionCanonicalMember[]): Map<string, string> {
  const aliases = new Map<string, string>();
  members.forEach((member) => {
    if (member.revokedAt) return;
    aliases.set(member.id, member.id);
    aliases.set(member.userId, member.id);
    aliases.set(member.callsign.toLowerCase(), member.id);
  });
  return aliases;
}

function resolveMembers(
  aliases: Map<string, string>,
  values: string[],
): MissionCanonicalAdapterResult<string[]> {
  const resolved: string[] = [];
  const unresolved: string[] = [];
  unique(values).forEach((value) => {
    const normalized = value.trim();
    const memberId = aliases.get(normalized) ?? aliases.get(normalized.toLowerCase());
    if (memberId) resolved.push(memberId);
    else unresolved.push(normalized);
  });
  if (unresolved.length > 0) {
    return {
      ok: false,
      code: 'identity_unresolved',
      error: `${unresolved.length} Mission Command member reference${unresolved.length === 1 ? '' : 's'} could not be resolved in the active convoy.`,
    };
  }
  return { ok: true, data: unique(resolved) };
}

function targetMemberReferences(target: MissionCommandTarget): string[] {
  switch (target.kind) {
    case 'member':
    case 'solo':
      return [target.memberId];
    case 'team':
      return target.memberIds;
    case 'role':
    case 'vehicle':
      return [];
  }
}

function targetKey(target: MissionCommandTarget): string {
  switch (target.kind) {
    case 'member':
    case 'solo': return target.memberId;
    case 'role': return target.roleId;
    case 'vehicle': return target.vehicleId;
    case 'team': return 'expedition_team';
  }
}

function safeContext(context: DispatchLinkedContext | undefined, sanitize: Sanitizer): Record<string, unknown> {
  return asRecord(sanitize(context));
}

function safeJson(value: unknown, sanitize: Sanitizer): Record<string, unknown> {
  return asRecord(sanitize(value));
}

function safeJsonArray(value: unknown, sanitize: Sanitizer): unknown[] {
  return asArray(sanitize(value));
}

function baseRow(input: {
  expeditionId: string;
  convoyId: string;
  clientId: string;
  idempotencyKey: string;
  actorUserId: string;
  actorMemberId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}): Record<string, unknown> {
  return {
    expedition_id: input.expeditionId,
    convoy_id: input.convoyId,
    client_id: input.clientId,
    idempotency_key: input.idempotencyKey,
    client_operation_id: input.idempotencyKey,
    actor_user_id: input.actorUserId,
    actor_member_id: input.actorMemberId,
    source_state: 'local_first',
    state_version: Math.max(1, Math.trunc(input.version)),
    client_created_at: input.createdAt,
    client_updated_at: input.updatedAt,
    observed_at: input.updatedAt,
  };
}

export function isDispatchMissionCanonicalEntity(
  entity: { type: string },
): entity is DispatchMissionCanonicalEntity {
  return entity.type === 'mission_command'
    || entity.type === 'mission_command_event'
    || entity.type === 'mission_playbook_instance';
}

export function buildMissionCommandCanonicalPlan(input: {
  expeditionId: string;
  convoyId: string;
  actorUserId: string;
  actorMember: MissionCanonicalMember;
  members: MissionCanonicalMember[];
  command: MissionCommand;
  sanitize: Sanitizer;
}): MissionCanonicalAdapterResult<MissionCanonicalWritePlan> {
  const { command, actorMember, actorUserId, members, sanitize } = input;
  if (
    command.expeditionId !== input.expeditionId
    || !validIso(command.createdAt)
    || !validIso(command.updatedAt)
    || Date.parse(command.updatedAt) < Date.parse(command.createdAt)
  ) {
    return { ok: false, code: 'validation_error', error: 'Mission Command scope or timestamps are invalid.' };
  }

  const aliases = aliasesFor(members);
  const resolvedTargets = resolveMembers(aliases, [
    ...targetMemberReferences(command.target),
    ...command.acknowledgmentPolicy.targetMemberIds,
  ]);
  if (!resolvedTargets.ok) return resolvedTargets;

  const assignmentReferences = command.assignment
    ? targetMemberReferences(command.assignment.target)
    : [];
  const resolvedAssignment = resolveMembers(aliases, [
    ...assignmentReferences,
    ...(command.assignment?.assigneeMemberId ? [command.assignment.assigneeMemberId] : []),
  ]);
  if (!resolvedAssignment.ok) return resolvedAssignment;

  const actorAliases = unique([actorMember.id, actorMember.userId, actorMember.callsign.toLowerCase()]);
  const ownAcknowledgments = canMissionCanonicalMemberParticipate(actorMember)
    ? command.acknowledgments.filter((acknowledgment) => (
        actorAliases.includes(acknowledgment.memberId)
      ))
    : [];
  const actorIsCreator = command.creator.id === actorMember.id
      || command.creator.id === actorMember.userId
      || command.creator.id.toLowerCase() === actorMember.callsign.toLowerCase();
  const canWriteParent = actorIsCreator && (
    hasMissionCanonicalCommandAccess(actorMember)
    || (
      canMissionCanonicalMemberParticipate(actorMember)
      && !command.assignment
      && (command.type === 'check_in' || command.type === 'assist')
    )
  );

  const assignmentMemberId = command.assignment?.assigneeMemberId
    ? resolvedAssignment.data.find((memberId) => (
        aliases.get(command.assignment?.assigneeMemberId ?? '') === memberId
        || aliases.get((command.assignment?.assigneeMemberId ?? '').toLowerCase()) === memberId
      )) ?? null
    : command.assignment?.target.kind === 'member'
      ? resolvedAssignment.data[0] ?? null
      : null;
  const parent: MissionCanonicalWrite = {
    table: 'dispatch_mission_commands',
    immutable: false,
    row: {
      ...baseRow({
        expeditionId: input.expeditionId,
        convoyId: input.convoyId,
        clientId: command.id,
        idempotencyKey: command.idempotencyKey,
        actorUserId,
        actorMemberId: actorMember.id,
        createdAt: command.createdAt,
        updatedAt: command.updatedAt,
        version: command.version,
      }),
      recipient_member_ids: resolvedTargets.data,
      creator_label: command.creator.label,
      command_type: command.type,
      priority: command.priority,
      title: command.title,
      instructions: command.instructions,
      target_kind: command.target.kind,
      target_key: targetKey(command.target),
      target_label: command.target.label ?? null,
      assignment_kind: command.assignment?.target.kind ?? null,
      assignment_key: command.assignment ? targetKey(command.assignment.target) : null,
      assignment_member_id: assignmentMemberId,
      assignment_status: command.assignment?.status ?? null,
      acknowledgment_mode: command.acknowledgmentPolicy.mode,
      acknowledgment_required_count: command.acknowledgmentPolicy.mode === 'count'
        ? command.acknowledgmentPolicy.requiredCount ?? null
        : null,
      acknowledgment_role_id: command.acknowledgmentPolicy.roleId ?? null,
      deadline_at: command.deadlineAt ?? null,
      linked_context: safeContext(command.linkedContext, sanitize),
      source_truth: safeJsonArray(command.sourceTruth, sanitize),
      operational_state: command.operationalState,
      delivery_state: command.deliveryState,
      acknowledgment_state: command.acknowledgmentState,
      resolution: safeJson(command.resolution, sanitize),
      payload: safeJson({ audit: command.audit }, sanitize),
      deleted_at: null,
      tombstone_reason: null,
    },
  };

  const children = (parentId: string): MissionCanonicalWrite[] => {
    const rows: MissionCanonicalWrite[] = [];
    const targetRows: Array<{ kind: MissionCommandTarget['kind']; key: string; memberId: string | null; label?: string }> = [];
    if (command.target.kind === 'team') {
      resolvedTargets.data.forEach((memberId) => targetRows.push({
        kind: 'team',
        key: memberId,
        memberId,
        label: command.target.label,
      }));
    } else if (command.target.kind === 'member' || command.target.kind === 'solo') {
      targetRows.push({
        kind: command.target.kind,
        key: resolvedTargets.data[0],
        memberId: resolvedTargets.data[0],
        label: command.target.label,
      });
    } else {
      targetRows.push({
        kind: command.target.kind,
        key: targetKey(command.target),
        memberId: null,
        label: command.target.label,
      });
    }

    targetRows.forEach((target, index) => {
      const identity = childIdentity({
        expeditionId: input.expeditionId,
        entityType: 'mission_command',
        actionType: 'canonical_target',
        sourceEntityId: `${command.id}:${target.kind}:${target.key}:${index}`,
        targetMemberIds: target.memberId ? [target.memberId] : [],
      });
      rows.push({
        table: 'dispatch_mission_command_targets',
        immutable: true,
        row: {
          ...baseRow({
            expeditionId: input.expeditionId,
            convoyId: input.convoyId,
            clientId: identity.clientId,
            idempotencyKey: identity.idempotencyKey,
            actorUserId,
            actorMemberId: actorMember.id,
            createdAt: command.createdAt,
            updatedAt: command.updatedAt,
            version: 1,
          }),
          command_id: parentId,
          command_client_id: command.id,
          target_kind: target.kind,
          target_key: target.key,
          member_id: target.memberId,
          target_label: target.label ?? null,
        },
      });
    });

    ownAcknowledgments.forEach((acknowledgment) => rows.push(
      buildAcknowledgmentWrite({
        expeditionId: input.expeditionId,
        convoyId: input.convoyId,
        commandId: parentId,
        commandClientId: command.id,
        actorUserId,
        actorMemberId: actorMember.id,
        acknowledgment,
        sanitize,
      }),
    ));

    if (command.deadlineAt) {
      const identity = childIdentity({
        expeditionId: input.expeditionId,
        entityType: 'mission_command',
        actionType: 'canonical_deadline',
        sourceEntityId: command.id,
      });
      rows.push({
        table: 'dispatch_mission_deadlines',
        immutable: false,
        row: {
          ...baseRow({
            expeditionId: input.expeditionId,
            convoyId: input.convoyId,
            clientId: identity.clientId,
            idempotencyKey: identity.idempotencyKey,
            actorUserId,
            actorMemberId: actorMember.id,
            createdAt: command.createdAt,
            updatedAt: command.updatedAt,
            version: command.version,
          }),
          command_id: parentId,
          command_client_id: command.id,
          playbook_instance_id: null,
          playbook_client_id: null,
          step_id: null,
          deadline_source: 'command_deadline',
          title: command.title,
          reason: 'Mission Command deadline.',
          due_at: command.deadlineAt,
          warning_window_ms: 30 * 60_000,
          critical_window_ms: 5 * 60_000,
          priority: command.priority,
          completion_state: command.resolution?.kind === 'cancelled'
            ? 'cancelled'
            : command.resolution
              ? 'completed'
              : 'active',
          linked_context: safeContext(command.linkedContext, sanitize),
          source_truth: safeJsonArray(command.sourceTruth, sanitize),
          completed_at: command.resolution?.kind === 'resolved' ? command.resolution.occurredAt : null,
          cancelled_at: command.resolution?.kind === 'cancelled' ? command.resolution.occurredAt : null,
        },
      });
    }

    if (command.linkedContext?.type === 'incident') {
      rows.push(buildIncidentLinkWrite({
        expeditionId: input.expeditionId,
        convoyId: input.convoyId,
        parentType: 'command',
        parentId,
        parentClientId: command.id,
        incidentId: command.linkedContext.id,
        actorUserId,
        actorMemberId: actorMember.id,
        sourceTruth: command.sourceTruth,
        createdAt: command.createdAt,
        updatedAt: command.updatedAt,
        sanitize,
      }));
    }
    return rows;
  };

  return {
    ok: true,
    data: {
      parent,
      children,
      canWriteParent,
      ownAcknowledgmentCount: ownAcknowledgments.length,
      restrictedLocation: () => {
        const coordinates = command.linkedContext?.coordinates;
        if (!coordinates || !Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) {
          return null;
        }
        return {
          sourceKind: 'mission_command',
          sourceClientId: command.id,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          accuracyMeters: Number.isFinite(command.linkedContext?.accuracyMeters)
            ? Number(command.linkedContext?.accuracyMeters)
            : null,
          observedAt: command.linkedContext?.observedAt && validIso(command.linkedContext.observedAt)
            ? command.linkedContext.observedAt
            : command.updatedAt,
          authorizedMemberIds: unique([actorMember.id, ...resolvedTargets.data]),
        };
      },
    },
  };
}

function buildAcknowledgmentWrite(input: {
  expeditionId: string;
  convoyId: string;
  commandId: string;
  commandClientId: string;
  actorUserId: string;
  actorMemberId: string;
  acknowledgment: MissionCommandAcknowledgment;
  sanitize: Sanitizer;
}): MissionCanonicalWrite {
  return {
    table: 'dispatch_mission_command_acknowledgments',
    immutable: true,
    row: {
      ...baseRow({
        expeditionId: input.expeditionId,
        convoyId: input.convoyId,
        clientId: input.acknowledgment.id,
        idempotencyKey: input.acknowledgment.idempotencyKey,
        actorUserId: input.actorUserId,
        actorMemberId: input.actorMemberId,
        createdAt: input.acknowledgment.respondedAt,
        updatedAt: input.acknowledgment.respondedAt,
        version: 1,
      }),
      command_id: input.commandId,
      command_client_id: input.commandClientId,
      member_id: input.actorMemberId,
      response: input.acknowledgment.response,
      message: input.acknowledgment.message ?? null,
      responded_at: input.acknowledgment.respondedAt,
      payload: safeJson({ sourceAcknowledgmentId: input.acknowledgment.sourceAcknowledgmentId }, input.sanitize),
    },
  };
}

export function buildMissionCommandEventCanonicalWrite(input: {
  expeditionId: string;
  convoyId: string;
  commandId: string;
  actorUserId: string;
  actorMemberId: string;
  event: MissionCommandEvent;
  sanitize: Sanitizer;
}): MissionCanonicalAdapterResult<MissionCanonicalWrite> {
  if (input.event.expeditionId !== input.expeditionId || !validIso(input.event.occurredAt)) {
    return { ok: false, code: 'validation_error', error: 'Mission Command event scope or timestamp is invalid.' };
  }
  return {
    ok: true,
    data: {
      table: 'dispatch_mission_command_events',
      immutable: true,
      row: {
        ...baseRow({
          expeditionId: input.expeditionId,
          convoyId: input.convoyId,
          clientId: input.event.id,
          idempotencyKey: input.event.idempotencyKey,
          actorUserId: input.actorUserId,
          actorMemberId: input.actorMemberId,
          createdAt: input.event.occurredAt,
          updatedAt: input.event.occurredAt,
          version: 1,
        }),
        command_id: input.commandId,
        command_client_id: input.event.commandId,
        actor_label: input.event.actor.label,
        event_type: input.event.type,
        operational_state: input.event.operationalState,
        delivery_state: input.event.deliveryState,
        acknowledgment_state: input.event.acknowledgmentState,
        summary: input.event.summary,
        metadata: safeJson(input.event.metadata, input.sanitize),
        occurred_at: input.event.occurredAt,
      },
    },
  };
}

export function buildMissionPlaybookCanonicalPlan(input: {
  expeditionId: string;
  convoyId: string;
  actorUserId: string;
  actorMember: MissionCanonicalMember;
  instance: OperationalPlaybookInstance;
  sanitize: Sanitizer;
}): MissionCanonicalAdapterResult<MissionCanonicalWritePlan> {
  const { instance, actorMember, actorUserId, sanitize } = input;
  if (
    instance.expeditionId !== input.expeditionId
    || !validIso(instance.createdAt)
    || !validIso(instance.updatedAt)
  ) {
    return { ok: false, code: 'validation_error', error: 'Operational Playbook scope or timestamps are invalid.' };
  }
  const parent: MissionCanonicalWrite = {
    table: 'dispatch_mission_playbook_instances',
    immutable: false,
    row: {
      ...baseRow({
        expeditionId: input.expeditionId,
        convoyId: input.convoyId,
        clientId: instance.id,
        idempotencyKey: instance.idempotencyKey,
        actorUserId,
        actorMemberId: actorMember.id,
        createdAt: instance.createdAt,
        updatedAt: instance.updatedAt,
        version: instance.version,
      }),
      actor_label: instance.actor.label,
      definition_id: instance.definitionId,
      definition_version: instance.definitionVersion,
      related_command_client_id: instance.relatedCommandId ?? null,
      related_incident_id: instance.relatedIncidentId ?? null,
      playbook_state: instance.state,
      current_step_id: instance.currentStepId,
      completed_step_ids: instance.completedStepIds,
      source_truth: safeJsonArray(instance.sourceTruth, sanitize),
      input_snapshot: safeJson(instance.inputSnapshot, sanitize),
      payload: safeJson(instance, sanitize),
      last_known_connectivity: instance.lastKnownConnectivity,
      deleted_at: null,
      tombstone_reason: null,
    },
  };

  return {
    ok: true,
    data: {
      parent,
      canWriteParent: hasMissionCanonicalCommandAccess(actorMember) && (
        instance.actor.id === actorMember.id
        || instance.actor.id === actorMember.userId
        || instance.actor.id.toLowerCase() === actorMember.callsign.toLowerCase()
      ),
      ownAcknowledgmentCount: 0,
      restrictedLocation: () => null,
      children(parentId) {
        const children: MissionCanonicalWrite[] = [];
        instance.stepResults.forEach((result) => {
          const identity = childIdentity({
            expeditionId: input.expeditionId,
            entityType: 'operational_playbook',
            actionType: 'canonical_step',
            sourceEntityId: `${instance.id}:${result.stepId}`,
          });
          children.push({
            table: 'dispatch_mission_playbook_steps',
            immutable: false,
            row: {
              ...baseRow({
                expeditionId: input.expeditionId,
                convoyId: input.convoyId,
                clientId: identity.clientId,
                idempotencyKey: identity.idempotencyKey,
                actorUserId,
                actorMemberId: actorMember.id,
                createdAt: instance.createdAt,
                updatedAt: instance.updatedAt,
                version: instance.version,
              }),
              playbook_instance_id: parentId,
              playbook_client_id: instance.id,
              step_id: result.stepId,
              step_type: result.stepType,
              step_state: 'completed',
              result: safeJson(result, sanitize),
              reason_code: null,
            },
          });
        });
        instance.eventHistory.forEach((event) => children.push(
          buildPlaybookEventWrite({
            expeditionId: input.expeditionId,
            convoyId: input.convoyId,
            parentId,
            actorUserId,
            actorMemberId: actorMember.id,
            event,
            sanitize,
          }),
        ));
        instance.deadlines.forEach((deadline) => children.push(
          buildPlaybookDeadlineWrite({
            expeditionId: input.expeditionId,
            convoyId: input.convoyId,
            parentId,
            parentClientId: instance.id,
            actorUserId,
            actorMemberId: actorMember.id,
            deadline,
            instanceVersion: instance.version,
            sanitize,
          }),
        ));
        if (instance.relatedIncidentId) {
          children.push(buildIncidentLinkWrite({
            expeditionId: input.expeditionId,
            convoyId: input.convoyId,
            parentType: 'playbook',
            parentId,
            parentClientId: instance.id,
            incidentId: instance.relatedIncidentId,
            actorUserId,
            actorMemberId: actorMember.id,
            sourceTruth: instance.sourceTruth,
            createdAt: instance.createdAt,
            updatedAt: instance.updatedAt,
            sanitize,
          }));
        }
        return children;
      },
    },
  };
}

function buildPlaybookEventWrite(input: {
  expeditionId: string;
  convoyId: string;
  parentId: string;
  actorUserId: string;
  actorMemberId: string;
  event: OperationalPlaybookEvent;
  sanitize: Sanitizer;
}): MissionCanonicalWrite {
  return {
    table: 'dispatch_mission_playbook_events',
    immutable: true,
    row: {
      ...baseRow({
        expeditionId: input.expeditionId,
        convoyId: input.convoyId,
        clientId: input.event.id,
        idempotencyKey: input.event.idempotencyKey,
        actorUserId: input.actorUserId,
        actorMemberId: input.actorMemberId,
        createdAt: input.event.occurredAt,
        updatedAt: input.event.occurredAt,
        version: 1,
      }),
      playbook_instance_id: input.parentId,
      playbook_client_id: input.event.instanceId,
      actor_label: input.event.actor.label,
      event_type: input.event.type,
      playbook_state: input.event.state,
      step_id: input.event.stepId ?? null,
      summary: input.event.summary,
      metadata: safeJson(input.event.metadata, input.sanitize),
      occurred_at: input.event.occurredAt,
    },
  };
}

function buildPlaybookDeadlineWrite(input: {
  expeditionId: string;
  convoyId: string;
  parentId: string;
  parentClientId: string;
  actorUserId: string;
  actorMemberId: string;
  deadline: OperationalPlaybookDeadline;
  instanceVersion: number;
  sanitize: Sanitizer;
}): MissionCanonicalWrite {
  return {
    table: 'dispatch_mission_deadlines',
    immutable: false,
    row: {
      ...baseRow({
        expeditionId: input.expeditionId,
        convoyId: input.convoyId,
        clientId: input.deadline.id,
        idempotencyKey: createDispatchIdempotencyKey({
          expeditionId: input.expeditionId,
          entityType: 'operational_playbook',
          actionType: 'canonical_deadline',
          sourceEntityId: input.deadline.id,
        }),
        actorUserId: input.actorUserId,
        actorMemberId: input.actorMemberId,
        createdAt: input.deadline.createdAt,
        updatedAt: input.deadline.completedAt ?? input.deadline.cancelledAt ?? input.deadline.createdAt,
        version: input.instanceVersion,
      }),
      command_id: null,
      command_client_id: null,
      playbook_instance_id: input.parentId,
      playbook_client_id: input.parentClientId,
      step_id: input.deadline.stepId,
      deadline_source: input.deadline.source,
      title: input.deadline.title,
      reason: input.deadline.reason,
      due_at: input.deadline.dueAt,
      warning_window_ms: input.deadline.warningWindowMs,
      critical_window_ms: input.deadline.criticalWindowMs,
      priority: input.deadline.priority,
      completion_state: input.deadline.completionState,
      linked_context: {},
      source_truth: safeJsonArray(input.deadline.sourceTruth, input.sanitize),
      completed_at: input.deadline.completedAt ?? null,
      cancelled_at: input.deadline.cancelledAt ?? null,
    },
  };
}

function buildIncidentLinkWrite(input: {
  expeditionId: string;
  convoyId: string;
  parentType: 'command' | 'playbook';
  parentId: string;
  parentClientId: string;
  incidentId: string;
  actorUserId: string;
  actorMemberId: string;
  sourceTruth: unknown[];
  createdAt: string;
  updatedAt: string;
  sanitize: Sanitizer;
}): MissionCanonicalWrite {
  const identity = childIdentity({
    expeditionId: input.expeditionId,
    entityType: input.parentType === 'command' ? 'mission_command' : 'operational_playbook',
    actionType: 'canonical_incident_link',
    sourceEntityId: `${input.parentClientId}:${input.incidentId}`,
  });
  return {
    table: 'dispatch_mission_incident_links',
    immutable: true,
    row: {
      ...baseRow({
        expeditionId: input.expeditionId,
        convoyId: input.convoyId,
        clientId: identity.clientId,
        idempotencyKey: identity.idempotencyKey,
        actorUserId: input.actorUserId,
        actorMemberId: input.actorMemberId,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        version: 1,
      }),
      command_id: input.parentType === 'command' ? input.parentId : null,
      command_client_id: input.parentType === 'command' ? input.parentClientId : null,
      playbook_instance_id: input.parentType === 'playbook' ? input.parentId : null,
      playbook_client_id: input.parentType === 'playbook' ? input.parentClientId : null,
      incident_id: input.incidentId,
      link_kind: input.parentType,
      source_truth: safeJsonArray(input.sourceTruth, input.sanitize),
    },
  };
}

function locationKey(row: Record<string, unknown>): string {
  return `${String(row.source_kind)}:${String(row.source_client_id)}`;
}

function withRestrictedLocation(
  rawContext: unknown,
  location: Record<string, unknown> | undefined,
): DispatchLinkedContext | undefined {
  const context = asRecord(rawContext);
  if (Object.keys(context).length === 0) return undefined;
  if (!location) return context as unknown as DispatchLinkedContext;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return context as unknown as DispatchLinkedContext;
  }
  return {
    ...context,
    coordinates: { latitude, longitude },
    accuracyMeters: Number.isFinite(Number(location.accuracy_meters))
      ? Number(location.accuracy_meters)
      : null,
    restricted: true,
  } as unknown as DispatchLinkedContext;
}

function targetFromRow(row: Record<string, unknown>): MissionCommandTarget {
  const kind = row.target_kind as MissionCommandTarget['kind'];
  const key = String(row.target_key);
  const label = typeof row.target_label === 'string' ? row.target_label : undefined;
  if (kind === 'member') return { kind, memberId: key, label };
  if (kind === 'solo') return { kind, memberId: key, label };
  if (kind === 'role') return { kind, roleId: key, label };
  if (kind === 'vehicle') return { kind, vehicleId: key, label };
  return {
    kind: 'team',
    memberIds: asArray(row.recipient_member_ids).map(String),
    label,
  };
}

function actorRole(member: MissionCanonicalMember | undefined): 'owner' | 'member' | 'viewer' {
  if (!member) return 'member';
  const access = resolveMissionCanonicalMemberAccess(member);
  if (access === 'viewer') return 'viewer';
  return access === 'command' ? 'owner' : 'member';
}

export function parseMissionCanonicalSnapshot(input: {
  rows: Partial<Record<DispatchMissionCanonicalTable | 'dispatch_restricted_locations', Record<string, unknown>[]>>;
  members: MissionCanonicalMember[];
}): MissionCanonicalParsedSnapshot {
  const commandRows = input.rows.dispatch_mission_commands ?? [];
  const acknowledgmentRows = input.rows.dispatch_mission_command_acknowledgments ?? [];
  const eventRows = input.rows.dispatch_mission_command_events ?? [];
  const playbookRows = input.rows.dispatch_mission_playbook_instances ?? [];
  const playbookEventRows = input.rows.dispatch_mission_playbook_events ?? [];
  const deadlineRows = input.rows.dispatch_mission_deadlines ?? [];
  const locationRows = input.rows.dispatch_restricted_locations ?? [];
  const memberById = new Map(input.members.map((member) => [member.id, member]));
  const locationBySource = new Map(locationRows.map((row) => [locationKey(row), row]));

  const missionCommands = commandRows
    .filter((row) => !row.deleted_at)
    .map((row) => {
      const member = memberById.get(String(row.actor_member_id));
      const acknowledgments: MissionCommandAcknowledgment[] = acknowledgmentRows
        .filter((acknowledgment) => acknowledgment.command_id === row.id)
        .map((acknowledgment) => ({
          id: String(acknowledgment.client_id),
          idempotencyKey: String(acknowledgment.idempotency_key),
          memberId: String(acknowledgment.member_id),
          response: acknowledgment.response as MissionCommandAcknowledgment['response'],
          respondedAt: String(acknowledgment.responded_at),
          message: typeof acknowledgment.message === 'string' ? acknowledgment.message : undefined,
          sourceAcknowledgmentId: typeof asRecord(acknowledgment.payload).sourceAcknowledgmentId === 'string'
            ? String(asRecord(acknowledgment.payload).sourceAcknowledgmentId)
            : undefined,
        }));
      const payload = asRecord(row.payload);
      const assignmentKind = row.assignment_kind as MissionCommandTarget['kind'] | null;
      const assignmentTarget = assignmentKind
        ? targetFromRow({
            target_kind: assignmentKind,
            target_key: row.assignment_key,
            target_label: null,
            recipient_member_ids: row.assignment_member_id ? [row.assignment_member_id] : [],
          })
        : null;
      return normalizePersistedMissionCommand({
        schemaVersion: 1,
        version: Number(row.state_version) || 1,
        id: String(row.client_id),
        expeditionId: String(row.expedition_id),
        creator: {
          id: String(row.actor_member_id),
          label: String(row.creator_label ?? member?.callsign ?? 'Member'),
          role: actorRole(member),
        },
        type: row.command_type,
        priority: row.priority,
        title: row.title,
        instructions: row.instructions,
        target: targetFromRow(row),
        assignment: assignmentTarget ? {
          id: `${String(row.client_id)}:assignment`,
          target: assignmentTarget,
          assigneeMemberId: row.assignment_member_id ? String(row.assignment_member_id) : undefined,
          status: row.assignment_status,
          assignedAt: String(row.client_created_at),
          updatedAt: String(row.client_updated_at),
        } : undefined,
        acknowledgmentPolicy: {
          mode: row.acknowledgment_mode,
          targetMemberIds: asArray(row.recipient_member_ids).map(String),
          requiredCount: row.acknowledgment_required_count == null
            ? undefined
            : Number(row.acknowledgment_required_count),
          roleId: typeof row.acknowledgment_role_id === 'string' ? row.acknowledgment_role_id : undefined,
        },
        deadlineAt: typeof row.deadline_at === 'string' ? row.deadline_at : undefined,
        linkedContext: withRestrictedLocation(
          row.linked_context,
          locationBySource.get(`mission_command:${String(row.client_id)}`),
        ),
        sourceTruth: asArray(row.source_truth),
        operationalState: row.operational_state,
        deliveryState: row.delivery_state,
        acknowledgmentState: row.acknowledgment_state,
        acknowledgments,
        idempotencyKey: String(row.idempotency_key),
        createdAt: String(row.client_created_at),
        updatedAt: String(row.client_updated_at),
        resolution: Object.keys(asRecord(row.resolution)).length > 0 ? row.resolution : undefined,
        audit: asRecord(payload.audit),
      });
    })
    .filter((command): command is MissionCommand => command != null);

  const missionCommandEvents = eventRows
    .map((row) => {
      const member = memberById.get(String(row.actor_member_id));
      return normalizePersistedMissionCommandEvent({
        schemaVersion: 1,
        id: String(row.client_id),
        idempotencyKey: String(row.idempotency_key),
        commandId: String(row.command_client_id),
        expeditionId: String(row.expedition_id),
        type: row.event_type,
        actor: {
          id: String(row.actor_member_id),
          label: String(row.actor_label ?? member?.callsign ?? 'Member'),
          role: actorRole(member),
        },
        occurredAt: String(row.occurred_at),
        summary: String(row.summary),
        operationalState: row.operational_state,
        deliveryState: row.delivery_state,
        acknowledgmentState: row.acknowledgment_state,
        metadata: row.metadata,
      });
    })
    .filter((event): event is MissionCommandEvent => event != null);

  const operationalPlaybooks = playbookRows
    .filter((row) => !row.deleted_at)
    .map((row) => {
      const payload = asRecord(row.payload);
      const eventHistory = playbookEventRows
        .filter((event) => event.playbook_instance_id === row.id)
        .map((event): OperationalPlaybookEvent => ({
          schemaVersion: 1,
          id: String(event.client_id),
          idempotencyKey: String(event.idempotency_key),
          instanceId: String(event.playbook_client_id),
          expeditionId: String(event.expedition_id),
          type: event.event_type as OperationalPlaybookEvent['type'],
          state: event.playbook_state as OperationalPlaybookEvent['state'],
          stepId: typeof event.step_id === 'string' ? event.step_id : undefined,
          actor: {
            id: String(event.actor_member_id),
            label: String(event.actor_label),
            role: actorRole(memberById.get(String(event.actor_member_id))),
          },
          occurredAt: String(event.occurred_at),
          summary: String(event.summary),
          metadata: Object.keys(asRecord(event.metadata)).length > 0
            ? asRecord(event.metadata) as OperationalPlaybookEvent['metadata']
            : undefined,
        }));
      const deadlines = deadlineRows
        .filter((deadline) => deadline.playbook_instance_id === row.id)
        .map((deadline): OperationalPlaybookDeadline => ({
          schemaVersion: 1,
          id: String(deadline.client_id),
          stepId: typeof deadline.step_id === 'string' ? deadline.step_id : 'canonical_deadline',
          expeditionId: String(deadline.expedition_id),
          source: deadline.deadline_source as OperationalPlaybookDeadline['source'],
          title: String(deadline.title),
          reason: String(deadline.reason),
          dueAt: String(deadline.due_at),
          warningWindowMs: Number(deadline.warning_window_ms),
          criticalWindowMs: Number(deadline.critical_window_ms),
          priority: deadline.priority as OperationalPlaybookDeadline['priority'],
          sourceTruth: asArray(deadline.source_truth) as OperationalPlaybookDeadline['sourceTruth'],
          completionState: deadline.completion_state as OperationalPlaybookDeadline['completionState'],
          createdAt: String(deadline.client_created_at),
          completedAt: typeof deadline.completed_at === 'string' ? deadline.completed_at : undefined,
          cancelledAt: typeof deadline.cancelled_at === 'string' ? deadline.cancelled_at : undefined,
        }));
      return normalizePersistedOperationalPlaybookInstance({
        ...payload,
        schemaVersion: 1,
        version: Number(row.state_version) || 1,
        id: String(row.client_id),
        idempotencyKey: String(row.idempotency_key),
        definitionId: String(row.definition_id),
        definitionVersion: Number(row.definition_version),
        expeditionId: String(row.expedition_id),
        relatedCommandId: typeof row.related_command_client_id === 'string' ? row.related_command_client_id : undefined,
        relatedIncidentId: typeof row.related_incident_id === 'string' ? row.related_incident_id : undefined,
        state: row.playbook_state,
        currentStepId: row.current_step_id ?? null,
        completedStepIds: asArray(row.completed_step_ids).map(String),
        sourceTruth: asArray(row.source_truth),
        inputSnapshot: asRecord(row.input_snapshot),
        eventHistory,
        deadlines,
        lastKnownConnectivity: row.last_known_connectivity,
        createdAt: String(row.client_created_at),
        updatedAt: String(row.client_updated_at),
      });
    })
    .filter((instance): instance is OperationalPlaybookInstance => instance != null);

  return {
    missionCommands,
    missionCommandEvents,
    operationalPlaybooks,
    tombstones: {
      mission_command: commandRows.filter((row) => row.deleted_at).map((row) => String(row.client_id)),
      mission_playbook_instance: playbookRows.filter((row) => row.deleted_at).map((row) => String(row.client_id)),
    },
  };
}
