import { createDispatchEntityId } from './dispatchIntegrity';
import {
  appendMissionCommandEvent,
  createMissionCommandEvent,
  deriveMissionCommandAcknowledgmentState,
  mergeMissionCommandBatch,
  mergeMissionCommandEventBatch,
  recordMissionCommandAcknowledgment,
  sanitizeMissionCommandLinkedContext,
} from './dispatchMissionCommandDomain';
import {
  MISSION_COMMAND_SCHEMA_VERSION,
  type MissionCommand,
  type MissionCommandAcknowledgmentPolicy,
  type MissionCommandAssignment,
  type MissionCommandDeliveryState,
  type MissionCommandEvent,
  type MissionCommandEventType,
  type MissionCommandOperationalState,
  type MissionCommandTarget,
  type MissionCommandType,
} from './dispatchMissionCommandTypes';
import type { SourceTruthRef } from './sourceTruth';
import type { DispatchEvent } from './dispatchLiveEvents';
import type {
  DispatchAcknowledgment,
  DispatchAssignment,
  DispatchDeliveryState,
  DispatchLinkedContext,
  DispatchPing,
  DispatchPingOperationalState,
  DispatchQueueItem,
  DispatchQueueItemStatus,
  DispatchTimelineEvent,
} from './dispatchTypes';

export interface MissionCommandLegacySnapshot {
  pings: DispatchPing[];
  queueItems: DispatchQueueItem[];
  assignments: DispatchAssignment[];
  acknowledgments: DispatchAcknowledgment[];
  timelineEvents: DispatchTimelineEvent[];
  missionCommands?: MissionCommand[];
  missionCommandEvents?: MissionCommandEvent[];
  cadEvents?: DispatchEvent[];
}

export interface MissionCommandSnapshotProjection {
  commands: MissionCommand[];
  events: MissionCommandEvent[];
}

export interface MissionCommandLegacyAdapterOptions {
  expeditionId: string;
  creatorLabel?: string;
  soloMode?: boolean;
}

export function projectDispatchSnapshotToMissionCommandState(
  snapshot: MissionCommandLegacySnapshot,
  options: MissionCommandLegacyAdapterOptions,
): MissionCommandSnapshotProjection {
  const canonicalCommands = mergeMissionCommandBatch(snapshot.missionCommands ?? []);
  const canonicalSourceKeys = new Set(canonicalCommands.flatMap((command) => (
    command.audit.sourceRecordId
      ? [`${command.audit.sourceKind}:${command.audit.sourceRecordId}`]
      : []
  )));
  const pingsById = new Map(snapshot.pings.map((ping) => [ping.id, ping]));
  const queueSourcePingIds = new Set(
    snapshot.queueItems
      .map((item) => item.sourcePingId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
  const legacyCommands: MissionCommand[] = [];

  snapshot.queueItems.forEach((item) => {
    if (
      item.sourcePingId &&
      canonicalSourceKeys.has(`legacy_ping:${item.sourcePingId}`) &&
      !canonicalSourceKeys.has(`legacy_queue_item:${item.id}`)
    ) {
      return;
    }
    let command = adaptDispatchQueueItemToMissionCommand(item, options);
    snapshot.assignments
      .filter((assignment) => assignment.queueItemId === item.id)
      .forEach((assignment) => {
        command = applyDispatchAssignmentToMissionCommand(command, assignment);
      });
    const sourcePing = item.sourcePingId ? pingsById.get(item.sourcePingId) : null;
    if (sourcePing) {
      command = mergeLinkedPingIntoQueueCommand(command, sourcePing, snapshot.acknowledgments, options);
    }
    legacyCommands.push(command);
  });

  snapshot.pings.forEach((ping) => {
    if (queueSourcePingIds.has(ping.id)) return;
    let command = adaptDispatchPingToMissionCommand(ping, options);
    snapshot.acknowledgments
      .filter((acknowledgment) => acknowledgment.pingId === ping.id)
      .forEach((acknowledgment) => {
        command = applyDispatchAcknowledgmentToMissionCommand(command, acknowledgment);
      });
    legacyCommands.push(command);
  });

  (snapshot.cadEvents ?? []).forEach((event) => {
    let command = adaptDispatchCadEventToMissionCommand(event, options);
    snapshot.acknowledgments
      .filter((acknowledgment) => acknowledgment.pingId === event.id)
      .forEach((acknowledgment) => {
        command = applyDispatchAcknowledgmentToCadMissionCommand(command, acknowledgment);
      });
    legacyCommands.push(command);
  });

  const commands = mergeMissionCommandBatch([...legacyCommands, ...canonicalCommands]);
  let events = mergeMissionCommandEventBatch(snapshot.missionCommandEvents ?? []);
  snapshot.timelineEvents.forEach((timelineEvent) => {
    const command = findCommandForTimelineEvent(commands, timelineEvent);
    if (!command) return;
    const event = adaptDispatchTimelineEventToMissionCommandEvent(timelineEvent, command);
    if (event) events = appendMissionCommandEvent(events, event);
  });

  return { commands, events };
}

export function adaptDispatchCadEventToMissionCommand(
  event: DispatchEvent,
  options: MissionCommandLegacyAdapterOptions,
): MissionCommand {
  const updatedAt = event.updatedAt ?? event.createdAt;
  const operationalState = cadEventOperationalState(event.status);
  const target: MissionCommandTarget = options.soloMode
    ? {
        kind: 'solo',
        memberId: event.createdBy?.userId ?? 'local-dispatch-operator',
        label: 'Current user',
      }
    : { kind: 'team', memberIds: [], label: 'Expedition team' };
  const acknowledgmentPolicy: MissionCommandAcknowledgmentPolicy = event.requiresAcknowledgment
    ? { mode: 'any', targetMemberIds: [] }
    : { mode: 'none', targetMemberIds: [] };
  const idempotencyKey = event.dedupeKey || `dispatch:legacy_cad_event:${event.id}`;
  const sourceTruth = legacySourceTruth('cad_event', event.id, updatedAt);
  const command: MissionCommand = {
    schemaVersion: MISSION_COMMAND_SCHEMA_VERSION,
    version: 1,
    id: createDispatchEntityId('mission_command', idempotencyKey),
    expeditionId: options.expeditionId,
    creator: {
      id: event.createdBy?.userId ?? 'local-dispatch-operator',
      label: event.createdBy?.callsign ?? event.createdBy?.displayName ?? options.creatorLabel ?? 'ECS Operator',
    },
    type: cadEventCommandType(event),
    priority: cadEventPriority(event.severity),
    title: event.title,
    instructions: event.message,
    target,
    acknowledgmentPolicy,
    linkedContext: cadEventLinkedContext(event, sourceTruth[0]),
    sourceTruth,
    operationalState,
    deliveryState: cadEventDeliveryState(event.syncState),
    acknowledgmentState: event.requiresAcknowledgment ? 'pending' : 'not_required',
    acknowledgments: [],
    idempotencyKey,
    createdAt: event.createdAt,
    updatedAt,
    resolution: terminalResolution(
      operationalState,
      updatedAt,
      event.createdBy?.userId ?? 'local-dispatch-operator',
    ),
    audit: {
      schemaVersion: 1,
      sourceKind: 'legacy_cad_event',
      sourceRecordId: event.id,
      safetyScope: 'ecs_team_coordination_only',
    },
  };
  return {
    ...command,
    acknowledgmentState: deriveMissionCommandAcknowledgmentState(command),
  };
}

export function adaptDispatchPingToMissionCommand(
  ping: DispatchPing,
  options: MissionCommandLegacyAdapterOptions,
): MissionCommand {
  const target = targetFromMemberIds(ping.targetMemberIds, ping.createdByMemberId, options.soloMode);
  const policy = acknowledgmentPolicy(pingRequiresAcknowledgment(ping), ping.targetMemberIds, target);
  const acknowledgments = uniqueStrings(ping.acknowledgedByMemberIds ?? []).map((memberId) => ({
    id: `legacy-ping-ack:${ping.id}:${memberId}`,
    idempotencyKey: `legacy-ping-ack:${ping.id}:${memberId}`,
    memberId,
    response: 'acknowledged' as const,
    respondedAt: ping.updatedAt ?? ping.createdAt,
  }));
  const operationalState = adaptPingOperationalState(ping.operationalState, ping.status);
  const deliveryState = adaptDispatchDeliveryState(ping.status);
  const commandIdempotencyKey = ping.idempotencyKey || `dispatch:legacy_ping:${ping.id}`;
  const command: MissionCommand = {
    schemaVersion: MISSION_COMMAND_SCHEMA_VERSION,
    version: Math.max(1, ping.version ?? 1),
    id: createDispatchEntityId('mission_command', commandIdempotencyKey),
    expeditionId: options.expeditionId,
    creator: {
      id: ping.createdByMemberId,
      label: options.creatorLabel?.trim() || ping.createdByMemberId,
    },
    type: ping.type,
    priority: ping.priority,
    title: pingTitle(ping.type),
    instructions: ping.message,
    target,
    acknowledgmentPolicy: policy,
    deadlineAt: ping.responseDueAt,
    linkedContext: sanitizeMissionCommandLinkedContext(ping.linkedContext),
    sourceTruth: legacySourceTruth('ping', ping.id, ping.updatedAt ?? ping.createdAt, ping.conflictState),
    operationalState,
    deliveryState,
    acknowledgmentState: 'pending',
    acknowledgments,
    idempotencyKey: commandIdempotencyKey,
    createdAt: ping.createdAt,
    updatedAt: ping.updatedAt ?? ping.createdAt,
    resolution: terminalResolution(operationalState, ping.updatedAt ?? ping.createdAt, ping.createdByMemberId),
    audit: {
      schemaVersion: 1,
      sourceKind: 'legacy_ping',
      sourceRecordId: ping.id,
      safetyScope: 'ecs_team_coordination_only',
    },
  };
  return {
    ...command,
    acknowledgmentState: deriveMissionCommandAcknowledgmentState(command),
  };
}

export function adaptDispatchQueueItemToMissionCommand(
  item: DispatchQueueItem,
  options: MissionCommandLegacyAdapterOptions,
): MissionCommand {
  const target = targetFromMemberIds(item.assignedMemberIds, item.createdByMemberId, options.soloMode);
  const requiresAcknowledgment = item.status === 'pending_response';
  const policy = acknowledgmentPolicy(requiresAcknowledgment, item.assignedMemberIds, target);
  const operationalState = adaptQueueOperationalState(item.status);
  const idempotencyKey = item.idempotencyKey || `dispatch:legacy_queue_item:${item.id}`;
  const assignment = assignmentFromQueueItem(item, target);
  return {
    schemaVersion: MISSION_COMMAND_SCHEMA_VERSION,
    version: Math.max(1, item.version ?? 1),
    id: createDispatchEntityId('mission_command', idempotencyKey),
    expeditionId: options.expeditionId,
    creator: {
      id: item.createdByMemberId,
      label: options.creatorLabel?.trim() || item.createdByMemberId,
    },
    type: inferQueueCommandType(item),
    priority: item.priority,
    title: item.title,
    instructions: item.detail,
    target,
    assignment,
    acknowledgmentPolicy: policy,
    deadlineAt: item.dueAt,
    linkedContext: sanitizeMissionCommandLinkedContext(item.linkedContext),
    sourceTruth: legacySourceTruth('queue_item', item.id, item.updatedAt, item.conflictState),
    operationalState,
    deliveryState: adaptDispatchDeliveryState(item.deliveryState),
    acknowledgmentState: requiresAcknowledgment ? 'pending' : 'not_required',
    acknowledgments: [],
    idempotencyKey,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    resolution: terminalResolution(operationalState, item.updatedAt, item.createdByMemberId),
    audit: {
      schemaVersion: 1,
      sourceKind: 'legacy_queue_item',
      sourceRecordId: item.id,
      safetyScope: 'ecs_team_coordination_only',
    },
  };
}

export function applyDispatchAssignmentToMissionCommand(
  command: MissionCommand,
  assignment: DispatchAssignment,
): MissionCommand {
  const sourceQueueId = command.audit.sourceKind === 'legacy_queue_item'
    ? command.audit.sourceRecordId
    : undefined;
  if (!sourceQueueId || assignment.queueItemId !== sourceQueueId) return command;

  const target: MissionCommandTarget = {
    kind: 'member',
    memberId: assignment.assigneeMemberId,
    label: assignment.assigneeMemberId,
  };
  const nextOperationalState = assignmentOperationalState(assignment.status, command.operationalState);
  const updatedAt = assignment.updatedAt ?? assignment.assignedAt;
  return {
    ...command,
    version: Math.max(command.version + 1, assignment.version ?? 1),
    target,
    assignment: {
      id: assignment.id,
      target,
      assigneeMemberId: assignment.assigneeMemberId,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      updatedAt,
      sourceAssignmentId: assignment.id,
    },
    operationalState: nextOperationalState,
    deliveryState: assignment.deliveryState
      ? adaptDispatchDeliveryState(assignment.deliveryState)
      : command.deliveryState,
    updatedAt,
    resolution: terminalResolution(nextOperationalState, updatedAt, assignment.assigneeMemberId),
  };
}

export function applyDispatchAcknowledgmentToMissionCommand(
  command: MissionCommand,
  acknowledgment: DispatchAcknowledgment,
): MissionCommand {
  const sourcePingId = command.audit.sourceKind === 'legacy_ping' ? command.audit.sourceRecordId : undefined;
  if (!sourcePingId || acknowledgment.pingId !== sourcePingId) return command;
  const result = recordMissionCommandAcknowledgment(command, {
    id: acknowledgment.id,
    idempotencyKey: acknowledgment.idempotencyKey || `dispatch:legacy_acknowledgment:${acknowledgment.id}`,
    memberId: acknowledgment.memberId,
    response: acknowledgment.status === 'declined' ? 'declined' : 'acknowledged',
    respondedAt: acknowledgment.updatedAt ?? acknowledgment.acknowledgedAt,
    message: acknowledgment.message,
    sourceAcknowledgmentId: acknowledgment.id,
  });
  return result.ok ? result.command : command;
}

export function adaptDispatchTimelineEventToMissionCommandEvent(
  event: DispatchTimelineEvent,
  command: MissionCommand,
): MissionCommandEvent | null {
  const sourceRecordId = command.audit.sourceRecordId;
  const hasLinkedEntity = Boolean(event.pingId || event.queueItemId);
  const matchesPing = Boolean(
    event.pingId && command.audit.sourceKind === 'legacy_ping' && event.pingId === sourceRecordId,
  );
  const matchesQueue = Boolean(
    event.queueItemId && command.audit.sourceKind === 'legacy_queue_item' && event.queueItemId === sourceRecordId,
  );
  const matchesCadEvent = Boolean(
    event.pingId && command.audit.sourceKind === 'legacy_cad_event' && event.pingId === sourceRecordId,
  );
  if (hasLinkedEntity && !matchesPing && !matchesQueue && !matchesCadEvent) return null;
  const type = timelineEventType(event);
  const actorId = event.auditEvent?.actor.memberId || event.actor || event.memberIds[0] || 'ecs';
  return createMissionCommandEvent({
    command,
    type,
    actor: {
      id: actorId,
      label: event.auditEvent?.actor.label || event.actor || actorId,
      role: event.auditEvent?.actor.role,
    },
    occurredAt: event.occurredAt,
    summary: event.title,
    idempotencyKey: event.idempotencyKey || `dispatch:legacy_timeline_event:${event.id}`,
    metadata: {
      sourceKind: 'legacy_timeline_event',
      sourceRecordId: event.id,
    },
  });
}

function applyDispatchAcknowledgmentToCadMissionCommand(
  command: MissionCommand,
  acknowledgment: DispatchAcknowledgment,
): MissionCommand {
  if (
    command.audit.sourceKind !== 'legacy_cad_event' ||
    command.audit.sourceRecordId !== acknowledgment.pingId
  ) {
    return command;
  }
  const result = recordMissionCommandAcknowledgment(command, {
    id: acknowledgment.id,
    idempotencyKey: acknowledgment.idempotencyKey || `dispatch:legacy_acknowledgment:${acknowledgment.id}`,
    memberId: acknowledgment.memberId,
    response: acknowledgment.status === 'declined' ? 'declined' : 'acknowledged',
    respondedAt: acknowledgment.updatedAt ?? acknowledgment.acknowledgedAt,
    message: acknowledgment.message,
    sourceAcknowledgmentId: acknowledgment.id,
  });
  return result.ok ? result.command : command;
}

function cadEventOperationalState(status: string | undefined): MissionCommandOperationalState {
  switch (status?.trim().toLowerCase()) {
    case 'resolved': return 'resolved';
    case 'cancelled':
    case 'dismissed': return 'cancelled';
    case 'blocked': return 'blocked';
    case 'in_progress': return 'in_progress';
    case 'proposed': return 'proposed';
    case 'ready': return 'ready';
    default: return 'active';
  }
}

function cadEventDeliveryState(
  state: DispatchEvent['syncState'],
): MissionCommandDeliveryState {
  switch (state) {
    case 'queued': return 'queued';
    case 'sending': return 'sending';
    case 'sent':
    case 'received': return 'delivered';
    case 'failed': return 'failed';
    case 'local':
    default: return 'local';
  }
}

function cadEventPriority(severity: DispatchEvent['severity']): DispatchPing['priority'] {
  switch (severity) {
    case 'critical': return 'critical';
    case 'warning': return 'high';
    case 'watch': return 'normal';
    case 'info': return 'low';
  }
}

function cadEventCommandType(event: DispatchEvent): MissionCommandType {
  const title = event.title.trim().toLowerCase();
  if (event.coordinationType === 'rally' || title.includes('rally')) return 'rally';
  if (title.includes('check in') || title.includes('check-in')) return 'check_in';
  if (event.type === 'assistance' || title.includes('assist')) return 'assist';
  if (event.type === 'recovery' || event.category === 'recovery_assist') return 'recovery';
  if (event.type === 'route') return 'route';
  if (event.type === 'resources') return 'resource';
  if (
    event.category === 'hazard_recovery' ||
    event.type === 'weather' ||
    event.type === 'terrain' ||
    event.hazardType
  ) {
    return 'hazard';
  }
  return 'general';
}

function cadEventLinkedContext(
  event: DispatchEvent,
  sourceTruth: SourceTruthRef,
): DispatchLinkedContext | undefined {
  if (!event.location && !event.routeSegmentId && !event.category && event.coordinationType !== 'rally') {
    return undefined;
  }
  const type: DispatchLinkedContext['type'] = event.coordinationType === 'rally'
    ? 'rally'
    : event.routeSegmentId
      ? 'route_segment'
      : 'incident';
  const restrictedMemberLocation = event.source === 'team_member' && Boolean(event.location);
  return sanitizeMissionCommandLinkedContext({
    id: `cad-event-context:${event.id}`,
    type,
    title: event.title,
    subtitle: restrictedMemberLocation
      ? 'Restricted member location'
      : event.location
        ? 'Dispatch event location'
        : event.routeSegmentId
          ? 'Linked route segment'
          : undefined,
    coordinates: event.location && !restrictedMemberLocation
      ? { latitude: event.location.latitude, longitude: event.location.longitude }
      : undefined,
    routeSegmentId: event.routeSegmentId,
    sourceTruth,
    sourceTruthPolicyKey: 'manual_user_state',
    observedAt: event.location?.timestamp ?? event.updatedAt ?? event.createdAt,
    stale: event.source === 'cache',
    restricted: restrictedMemberLocation,
  });
}

function mergeLinkedPingIntoQueueCommand(
  queueCommand: MissionCommand,
  ping: DispatchPing,
  acknowledgments: DispatchAcknowledgment[],
  options: MissionCommandLegacyAdapterOptions,
): MissionCommand {
  let pingCommand = adaptDispatchPingToMissionCommand(ping, options);
  acknowledgments
    .filter((acknowledgment) => acknowledgment.pingId === ping.id)
    .forEach((acknowledgment) => {
      pingCommand = applyDispatchAcknowledgmentToMissionCommand(pingCommand, acknowledgment);
    });
  const mergedSourceTruth = [...queueCommand.sourceTruth, ...pingCommand.sourceTruth]
    .filter((source, index, all) => all.findIndex((candidate) => candidate.id === source.id) === index);
  const next: MissionCommand = {
    ...queueCommand,
    version: Math.max(queueCommand.version, pingCommand.version),
    type: pingCommand.type,
    acknowledgmentPolicy: pingCommand.acknowledgmentPolicy,
    acknowledgments: pingCommand.acknowledgments,
    sourceTruth: mergedSourceTruth,
    updatedAt: laterIso(queueCommand.updatedAt, pingCommand.updatedAt),
  };
  return {
    ...next,
    acknowledgmentState: deriveMissionCommandAcknowledgmentState(next),
  };
}

function findCommandForTimelineEvent(
  commands: MissionCommand[],
  event: DispatchTimelineEvent,
): MissionCommand | null {
  if (event.queueItemId) {
    const queueCommand = commands.find((command) => (
      command.audit.sourceKind === 'legacy_queue_item' &&
      command.audit.sourceRecordId === event.queueItemId
    ));
    if (queueCommand) return queueCommand;
  }
  if (event.pingId) {
    return commands.find((command) => (
      command.audit.sourceKind === 'legacy_ping' &&
      command.audit.sourceRecordId === event.pingId
    )) ?? commands.find((command) => (
      command.audit.sourceKind === 'legacy_cad_event' &&
      command.audit.sourceRecordId === event.pingId
    )) ?? null;
  }
  return null;
}

function laterIso(left: string, right: string): string {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (!Number.isFinite(leftMs)) return right;
  if (!Number.isFinite(rightMs)) return left;
  return rightMs > leftMs ? right : left;
}

function adaptDispatchDeliveryState(state: DispatchDeliveryState): MissionCommandDeliveryState {
  switch (state) {
    case 'draft':
    case 'local':
      return 'local';
    case 'queued':
      return 'queued';
    case 'sending':
      return 'sending';
    case 'sent':
      return 'sent';
    case 'failed':
      return 'failed';
    case 'retrying':
      return 'retrying';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'delivered';
  }
}

function adaptPingOperationalState(
  state: DispatchPingOperationalState | undefined,
  delivery: DispatchDeliveryState,
): MissionCommandOperationalState {
  switch (state) {
    case 'draft': return 'proposed';
    case 'declined':
    case 'escalated': return 'blocked';
    case 'resolved': return 'resolved';
    case 'cancelled': return 'cancelled';
    case 'acknowledged': return 'active';
    case 'open':
    case 'awaiting_acknowledgment': return 'active';
    default:
      if (delivery === 'draft' || delivery === 'local') return 'proposed';
      if (delivery === 'cancelled') return 'cancelled';
      if (delivery === 'failed' || delivery === 'no_response' || delivery === 'escalated') return 'blocked';
      if (delivery === 'recovered') return 'resolved';
      return 'active';
  }
}

function adaptQueueOperationalState(state: DispatchQueueItemStatus): MissionCommandOperationalState {
  switch (state) {
    case 'new': return 'proposed';
    case 'assigned': return 'ready';
    case 'pending_response': return 'active';
    case 'in_progress': return 'in_progress';
    case 'blocked':
    case 'escalated':
    case 'needs_review': return 'blocked';
    case 'resolved': return 'resolved';
    case 'cancelled': return 'cancelled';
  }
}

function assignmentOperationalState(
  state: DispatchAssignment['status'],
  fallback: MissionCommandOperationalState,
): MissionCommandOperationalState {
  switch (state) {
    case 'unassigned': return fallback;
    case 'offered': return 'ready';
    case 'accepted': return 'active';
    case 'in_progress': return 'in_progress';
    case 'blocked':
    case 'declined': return 'blocked';
    case 'completed': return 'resolved';
  }
}

function assignmentFromQueueItem(
  item: DispatchQueueItem,
  target: MissionCommandTarget,
): MissionCommandAssignment | undefined {
  if (item.assignedMemberIds.length === 0) return undefined;
  const assigneeMemberId = item.assignedMemberIds.length === 1 ? item.assignedMemberIds[0] : undefined;
  return {
    id: `legacy-queue-assignment:${item.id}`,
    target,
    assigneeMemberId,
    status: item.status === 'in_progress'
      ? 'in_progress'
      : item.status === 'blocked'
        ? 'blocked'
        : item.status === 'resolved'
          ? 'completed'
          : 'offered',
    assignedAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function acknowledgmentPolicy(
  required: boolean,
  memberIds: string[],
  target: MissionCommandTarget,
): MissionCommandAcknowledgmentPolicy {
  if (!required) return { mode: 'none', targetMemberIds: [] };
  const ids = uniqueStrings(memberIds);
  return {
    mode: ids.length > 0 || target.kind === 'solo' ? 'all' : 'any',
    targetMemberIds: target.kind === 'solo' ? [target.memberId] : ids,
  };
}

function pingRequiresAcknowledgment(ping: DispatchPing): boolean {
  return ping.requiresAcknowledgment === true ||
    ping.operationalState === 'awaiting_acknowledgment' ||
    ping.operationalState === 'acknowledged' ||
    ping.operationalState === 'declined' ||
    ['acknowledged', 'accepted', 'declined', 'no_response'].includes(ping.status) ||
    (ping.acknowledgedByMemberIds?.length ?? 0) > 0;
}

function targetFromMemberIds(
  memberIds: string[],
  creatorId: string,
  soloMode = false,
): MissionCommandTarget {
  const ids = uniqueStrings(memberIds);
  if (soloMode && ids.length === 0) {
    return { kind: 'solo', memberId: creatorId, label: 'Current user' };
  }
  if (ids.length === 1) {
    return { kind: 'member', memberId: ids[0], label: ids[0] };
  }
  return { kind: 'team', memberIds: ids, label: 'Expedition team' };
}

function inferQueueCommandType(item: DispatchQueueItem): MissionCommandType {
  const tokens = new Set((item.tags ?? []).map((tag) => tag.trim().toLowerCase()));
  const supported: MissionCommandType[] = ['check_in', 'rally', 'assist', 'hazard', 'resource', 'route', 'recovery', 'general'];
  const tagMatch = supported.find((type) => tokens.has(type));
  if (tagMatch) return tagMatch;
  if (item.linkedContext.type === 'route' || item.linkedContext.type === 'route_segment' || item.linkedContext.type === 'bailout') {
    return 'route';
  }
  if (item.linkedContext.type === 'resource' || item.linkedContext.type === 'power') return 'resource';
  if (item.linkedContext.type === 'incident') return 'recovery';
  if (item.linkedContext.type === 'rally') return 'rally';
  return 'general';
}

function pingTitle(type: DispatchPing['type']): string {
  switch (type) {
    case 'check_in': return 'Check In';
    case 'rally': return 'Rally';
    case 'assist': return 'Assist Request';
    case 'route': return 'Route Command';
    case 'resource': return 'Resource Command';
    case 'hazard': return 'Hazard Notice';
    case 'emergency': return 'Emergency Team Ping';
    case 'general': return 'Team Command';
  }
}

function timelineEventType(event: DispatchTimelineEvent): MissionCommandEventType {
  switch (event.type) {
    case 'ping_created':
    case 'ping':
    case 'assist_request_created': return 'created';
    case 'ping_acknowledged': return 'acknowledged';
    case 'ping_declined': return 'declined';
    case 'assignment_created':
    case 'assignment': return 'assigned';
    case 'assignment_accepted': return 'started';
    case 'queue_escalated':
    case 'member_stale': return 'blocked';
    case 'queue_resolved': return 'resolved';
    case 'sync': return 'replayed';
    case 'sync_conflict': return 'failed';
    case 'hazard_broadcast_sent':
    case 'resource_check_requested': return 'sent';
    default: return 'staged';
  }
}

function legacySourceTruth(
  kind: 'ping' | 'queue_item' | 'cad_event',
  id: string,
  observedAt: string,
  conflictState?: 'none' | 'updated_during_sync' | 'needs_review',
): SourceTruthRef[] {
  return [{
    id: `dispatch-local:${kind}:${id}`,
    origin: 'manual',
    role: 'primary',
    policyKey: 'manual_user_state',
    authority: 'ECS local Dispatch record',
    authorityKind: 'ecs',
    observedAt,
    confidence: conflictState && conflictState !== 'none' ? 'medium' : 'high',
    coverage: 'complete',
    availability: 'usable',
    conflictState: conflictState && conflictState !== 'none' ? 'present' : 'none',
    warningCodes: ['legacy_dispatch_adapter'],
  }];
}

function terminalResolution(
  state: MissionCommandOperationalState,
  occurredAt: string,
  actorId: string,
): MissionCommand['resolution'] {
  if (state !== 'resolved' && state !== 'cancelled' && state !== 'expired') return undefined;
  return {
    kind: state,
    summary: state === 'resolved'
      ? 'Legacy Dispatch record was resolved.'
      : state === 'cancelled'
        ? 'Legacy Dispatch record was cancelled.'
        : 'Legacy Dispatch record expired.',
    occurredAt,
    actorId,
    reasonCode: `legacy_${state}`,
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}
