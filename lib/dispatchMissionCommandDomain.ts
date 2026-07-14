import { createDispatchEntityId, createDispatchIdempotencyKey } from './dispatchIntegrity';
import { sanitizeSourceTruthRef } from './sourceTruth';
import { reconcileMissionCommandRecords } from './dispatchMissionCommandReconciliation';
import type { DispatchCoordinates, DispatchLinkedContext, DispatchPriority } from './dispatchTypes';
import {
  MISSION_COMMAND_SCHEMA_VERSION,
  type MissionCommand,
  type MissionCommandAcknowledgment,
  type MissionCommandAcknowledgmentState,
  type MissionCommandActor,
  type MissionCommandBoard,
  type MissionCommandBoardBucket,
  type MissionCommandDeliveryState,
  type MissionCommandEvent,
  type MissionCommandEventMetadata,
  type MissionCommandEventType,
  type MissionCommandMutationResult,
  type MissionCommandOperationalState,
  type MissionCommandTarget,
} from './dispatchMissionCommandTypes';

export const MISSION_COMMAND_RETENTION_LIMITS = {
  commands: 250,
  events: 750,
} as const;

export const MISSION_COMMAND_OPERATIONAL_TRANSITIONS: Record<
  MissionCommandOperationalState,
  ReadonlySet<MissionCommandOperationalState>
> = {
  proposed: states('ready', 'cancelled', 'expired'),
  ready: states('active', 'cancelled', 'expired'),
  active: states('in_progress', 'blocked', 'resolved', 'cancelled', 'expired'),
  in_progress: states('blocked', 'resolved', 'cancelled', 'expired'),
  blocked: states('active', 'in_progress', 'resolved', 'cancelled', 'expired'),
  resolved: states(),
  cancelled: states(),
  expired: states(),
};

export const MISSION_COMMAND_DELIVERY_TRANSITIONS: Record<
  MissionCommandDeliveryState,
  ReadonlySet<MissionCommandDeliveryState>
> = {
  local: states('queued', 'sending', 'cancelled'),
  queued: states('sending', 'retrying', 'failed', 'cancelled'),
  sending: states('queued', 'sent', 'delivered', 'failed', 'retrying', 'cancelled'),
  sent: states('delivered', 'failed', 'retrying', 'cancelled'),
  delivered: states(),
  failed: states('queued', 'retrying', 'cancelled'),
  retrying: states('queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled'),
  cancelled: states(),
};

export function transitionMissionCommandOperationalState(
  command: MissionCommand,
  next: MissionCommandOperationalState,
  input: {
    actor: MissionCommandActor;
    occurredAt?: string;
    reasonCode?: string;
    resolutionSummary?: string;
  },
): MissionCommandMutationResult {
  if (command.operationalState === next) {
    return { ok: true, changed: false, command, event: null };
  }
  if (!MISSION_COMMAND_OPERATIONAL_TRANSITIONS[command.operationalState]?.has(next)) {
    return {
      ok: false,
      changed: false,
      command,
      event: null,
      reason: `Invalid Mission Command operational transition: ${command.operationalState} -> ${next}.`,
    };
  }

  const occurredAt = normalizeIso(input.occurredAt) ?? new Date().toISOString();
  const terminal = isTerminalOperationalState(next);
  const nextCommand: MissionCommand = {
    ...command,
    version: command.version + 1,
    operationalState: next,
    updatedAt: occurredAt,
    resolution: terminal
      ? {
          kind: next,
          summary: boundedText(input.resolutionSummary) || defaultResolutionSummary(next),
          occurredAt,
          actorId: input.actor.id,
          reasonCode: normalizeSafeCode(input.reasonCode),
        }
      : undefined,
  };
  const event = createMissionCommandEvent({
    command: nextCommand,
    type: operationalEventType(next),
    actor: input.actor,
    occurredAt,
    summary: terminal ? nextCommand.resolution?.summary : defaultEventSummary(nextCommand, operationalEventType(next)),
    metadata: input.reasonCode ? { reasonCode: normalizeSafeCode(input.reasonCode) } : undefined,
  });
  return { ok: true, changed: true, command: nextCommand, event };
}

export function transitionMissionCommandDeliveryState(
  command: MissionCommand,
  next: MissionCommandDeliveryState,
  input: {
    actor: MissionCommandActor;
    occurredAt?: string;
    reasonCode?: string;
    attemptCount?: number;
  },
): MissionCommandMutationResult {
  if (command.deliveryState === next) {
    return { ok: true, changed: false, command, event: null };
  }
  if (!MISSION_COMMAND_DELIVERY_TRANSITIONS[command.deliveryState]?.has(next)) {
    return {
      ok: false,
      changed: false,
      command,
      event: null,
      reason: `Invalid Mission Command delivery transition: ${command.deliveryState} -> ${next}.`,
    };
  }

  const occurredAt = normalizeIso(input.occurredAt) ?? new Date().toISOString();
  const nextCommand: MissionCommand = {
    ...command,
    version: command.version + 1,
    deliveryState: next,
    updatedAt: occurredAt,
  };
  const type = deliveryEventType(next);
  const metadata: MissionCommandEventMetadata = {};
  const reasonCode = normalizeSafeCode(input.reasonCode);
  if (reasonCode) metadata.reasonCode = reasonCode;
  if (Number.isFinite(input.attemptCount)) {
    metadata.attemptCount = Math.max(0, Math.floor(input.attemptCount ?? 0));
  }
  return {
    ok: true,
    changed: true,
    command: nextCommand,
    event: createMissionCommandEvent({
      command: nextCommand,
      type,
      actor: input.actor,
      occurredAt,
      summary: defaultEventSummary(nextCommand, type),
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    }),
  };
}

export function beginMissionCommandReplay(
  command: MissionCommand,
  input: {
    actor: MissionCommandActor;
    occurredAt?: string;
    attemptCount?: number;
  },
): MissionCommandMutationResult {
  if (!['queued', 'failed', 'retrying'].includes(command.deliveryState)) {
    return invalidMutation(command, 'Only queued or failed Mission Commands can begin replay.');
  }
  const occurredAt = normalizeIso(input.occurredAt) ?? new Date().toISOString();
  const nextCommand: MissionCommand = {
    ...command,
    version: command.version + 1,
    deliveryState: 'sending',
    updatedAt: occurredAt,
  };
  return {
    ok: true,
    changed: true,
    command: nextCommand,
    event: createMissionCommandEvent({
      command: nextCommand,
      type: 'replayed',
      actor: input.actor,
      occurredAt,
      summary: 'Mission Command replay started; delivery is not yet confirmed.',
      metadata: {
        reasonCode: 'offline_replay_started',
        attemptCount: Math.max(1, Math.floor(input.attemptCount ?? 1)),
      },
    }),
  };
}

export function reassignMissionCommand(
  command: MissionCommand,
  target: MissionCommandTarget | null,
  input: {
    actor: MissionCommandActor;
    occurredAt?: string;
    reasonCode?: string;
  },
): MissionCommandMutationResult {
  if (isTerminalOperationalState(command.operationalState)) {
    return invalidMutation(command, 'Resolved, cancelled, or expired Mission Commands cannot be reassigned.');
  }
  if (sameMissionCommandTarget(command.assignment?.target ?? null, target)) {
    return { ok: true, changed: false, command, event: null };
  }

  const occurredAt = normalizeIso(input.occurredAt) ?? new Date().toISOString();
  const assignment = target
    ? {
        id: createDispatchEntityId('assignment', createDispatchIdempotencyKey({
          expeditionId: command.expeditionId,
          entityType: 'assignment',
          actionType: 'mission_command_reassign',
          actorMemberId: input.actor.id,
          sourceEntityId: command.id,
          targetMemberIds: targetMemberIds(target),
          metadata: { targetKind: target.kind, targetId: missionCommandTargetIdentity(target) },
          timeBucket: occurredAt,
        })),
        target: normalizeTarget(target),
        assigneeMemberId: target.kind === 'member' || target.kind === 'solo' ? target.memberId : undefined,
        status: 'offered' as const,
        assignedAt: occurredAt,
        updatedAt: occurredAt,
      }
    : undefined;
  const nextCommand: MissionCommand = {
    ...command,
    version: command.version + 1,
    assignment,
    updatedAt: occurredAt,
  };
  const summary = target
    ? `Mission Command reassigned to ${target.label?.trim() || missionCommandTargetIdentity(target)}.`
    : 'Mission Command assignment cleared.';
  return {
    ok: true,
    changed: true,
    command: nextCommand,
    event: createMissionCommandEvent({
      command: nextCommand,
      type: 'assigned',
      actor: input.actor,
      occurredAt,
      summary,
      metadata: { reasonCode: normalizeSafeCode(input.reasonCode) ?? 'manual_command_reassignment' },
    }),
  };
}

export function requestMissionCommandFollowUp(
  command: MissionCommand,
  input: {
    actor: MissionCommandActor;
    message: string;
    occurredAt?: string;
    requestId?: string;
  },
): MissionCommandMutationResult {
  const personalAction = command.target.kind === 'solo';
  if (isTerminalOperationalState(command.operationalState)) {
    return invalidMutation(command, personalAction
      ? 'Completed or cancelled personal actions cannot accept status notes.'
      : 'Resolved, cancelled, or expired Mission Commands cannot request follow-up.');
  }
  const message = boundedText(input.message, 500);
  if (!message) return invalidMutation(command, personalAction
    ? 'A manual status note is required.'
    : 'Follow-up instructions are required.');

  const occurredAt = normalizeIso(input.occurredAt) ?? new Date().toISOString();
  if (command.updatedAt === occurredAt) {
    return { ok: true, changed: false, command, event: null };
  }
  const nextCommand: MissionCommand = {
    ...command,
    version: command.version + 1,
    updatedAt: occurredAt,
  };
  const idempotencyKey = createDispatchIdempotencyKey({
    expeditionId: command.expeditionId,
    entityType: 'mission_command_event',
    actionType: 'follow_up_requested',
    actorMemberId: input.actor.id,
    sourceEntityId: input.requestId ?? command.id,
    message,
    timeBucket: occurredAt,
  });
  return {
    ok: true,
    changed: true,
    command: nextCommand,
    event: createMissionCommandEvent({
      command: nextCommand,
      type: 'follow_up_requested',
      actor: input.actor,
      occurredAt,
      summary: personalAction ? `Manual status note: ${message}` : `Follow-up requested: ${message}`,
      idempotencyKey,
      metadata: { reasonCode: personalAction ? 'manual_status_note' : 'manual_follow_up_request' },
    }),
  };
}

export function recordMissionCommandAcknowledgment(
  command: MissionCommand,
  acknowledgment: MissionCommandAcknowledgment,
): MissionCommandMutationResult {
  if (command.acknowledgmentPolicy.mode === 'none') {
    return invalidMutation(command, 'This Mission Command does not require acknowledgment.');
  }
  if (!isValidAcknowledgment(acknowledgment)) {
    return invalidMutation(command, 'Mission Command acknowledgment is invalid.');
  }
  const targets = new Set(command.acknowledgmentPolicy.targetMemberIds);
  if (targets.size > 0 && !targets.has(acknowledgment.memberId)) {
    return invalidMutation(command, 'The member is not an acknowledgment target for this Mission Command.');
  }
  if (command.acknowledgments.some((item) => item.idempotencyKey === acknowledgment.idempotencyKey)) {
    return { ok: true, changed: false, command, event: null };
  }

  const currentForMember = command.acknowledgments.find((item) => item.memberId === acknowledgment.memberId);
  if (currentForMember && compareIso(currentForMember.respondedAt, acknowledgment.respondedAt) >= 0) {
    return { ok: true, changed: false, command, event: null };
  }
  const acknowledgments = [
    ...command.acknowledgments.filter((item) => item.memberId !== acknowledgment.memberId),
    normalizeAcknowledgment(acknowledgment),
  ].sort((left, right) => compareIso(left.respondedAt, right.respondedAt));
  const nextCommand: MissionCommand = {
    ...command,
    version: command.version + 1,
    acknowledgments,
    acknowledgmentState: deriveMissionCommandAcknowledgmentState({ ...command, acknowledgments }),
    updatedAt: acknowledgment.respondedAt,
  };
  const type: MissionCommandEventType = acknowledgment.response === 'declined' ? 'declined' : 'acknowledged';
  return {
    ok: true,
    changed: true,
    command: nextCommand,
    event: createMissionCommandEvent({
      command: nextCommand,
      type,
      actor: { id: acknowledgment.memberId, label: acknowledgment.memberId },
      occurredAt: acknowledgment.respondedAt,
      summary: type === 'declined' ? 'Mission Command declined.' : 'Mission Command acknowledged.',
      metadata: {
        sourceKind: acknowledgment.sourceAcknowledgmentId ? 'legacy_acknowledgment' : 'native',
        sourceRecordId: acknowledgment.sourceAcknowledgmentId,
      },
    }),
  };
}

export function deriveMissionCommandAcknowledgmentState(
  command: Pick<MissionCommand, 'acknowledgmentPolicy' | 'acknowledgments' | 'deadlineAt'>,
  now?: string,
): MissionCommandAcknowledgmentState {
  const policy = command.acknowledgmentPolicy;
  if (policy.mode === 'none') return 'not_required';
  if (now && command.deadlineAt && compareIso(now, command.deadlineAt) >= 0) return 'expired';

  const targetIds = [...new Set(policy.targetMemberIds.filter(Boolean))];
  const targetSet = new Set(targetIds);
  const responses = latestAcknowledgmentsByMember(command.acknowledgments)
    .filter((item) => targetSet.size === 0 || targetSet.has(item.memberId));
  const accepted = responses.filter((item) => item.response === 'acknowledged').length;
  const declined = responses.filter((item) => item.response === 'declined').length;
  const requiredCount = requiredAcknowledgmentCount(policy.mode, targetIds.length, policy.requiredCount);

  if (accepted >= requiredCount) return 'complete';
  if (targetIds.length > 0) {
    const remaining = Math.max(0, targetIds.length - accepted - declined);
    if (accepted + remaining < requiredCount) return 'declined';
  } else if (declined > 0 && accepted === 0) {
    return 'declined';
  }
  return responses.length > 0 ? 'partial' : 'pending';
}

export function expireMissionCommand(
  command: MissionCommand,
  input: { actor: MissionCommandActor; now?: string },
): MissionCommandMutationResult {
  const now = normalizeIso(input.now) ?? new Date().toISOString();
  if (!command.deadlineAt || compareIso(now, command.deadlineAt) < 0) {
    return invalidMutation(command, 'Mission Command deadline has not expired.');
  }
  const result = transitionMissionCommandOperationalState(command, 'expired', {
    actor: input.actor,
    occurredAt: now,
    reasonCode: 'deadline_expired',
    resolutionSummary: 'Mission Command deadline expired.',
  });
  if (!result.ok || !result.changed) return result;
  return {
    ...result,
    command: {
      ...result.command,
      acknowledgmentState: result.command.acknowledgmentState === 'not_required'
        ? 'not_required'
        : 'expired',
    },
    event: result.event
      ? {
          ...result.event,
          acknowledgmentState: result.command.acknowledgmentState === 'not_required'
            ? 'not_required'
            : 'expired',
        }
      : null,
  };
}

export function deriveMissionCommandBoardBucket(command: MissionCommand): MissionCommandBoardBucket {
  if (isTerminalOperationalState(command.operationalState)) return 'resolved';
  if (
    command.operationalState === 'proposed' ||
    command.operationalState === 'ready' ||
    command.operationalState === 'blocked' ||
    command.deliveryState === 'failed' ||
    command.acknowledgmentState === 'declined' ||
    command.acknowledgmentState === 'expired'
  ) {
    return 'needs_decision';
  }
  if (command.acknowledgmentState === 'pending' || command.acknowledgmentState === 'partial') {
    return 'awaiting_acknowledgment';
  }
  return 'in_progress';
}

export function selectMissionCommandBoard(commands: MissionCommand[]): MissionCommandBoard {
  const board: MissionCommandBoard = {
    needsDecision: [],
    awaitingAcknowledgment: [],
    inProgress: [],
    resolved: [],
  };
  for (const command of sortCommands(commands)) {
    switch (deriveMissionCommandBoardBucket(command)) {
      case 'needs_decision':
        board.needsDecision.push(command);
        break;
      case 'awaiting_acknowledgment':
        board.awaitingAcknowledgment.push(command);
        break;
      case 'in_progress':
        board.inProgress.push(command);
        break;
      case 'resolved':
        board.resolved.push(command);
        break;
    }
  }
  return board;
}

export function mergeMissionCommand(commands: MissionCommand[], incoming: MissionCommand): MissionCommand[] {
  const normalized = normalizePersistedMissionCommand(incoming);
  if (!normalized) return mergeMissionCommandBatch(commands);
  const index = commands.findIndex((item) => (
    item.id === normalized.id || item.idempotencyKey === normalized.idempotencyKey
  ));
  if (index < 0) return boundCommands([...commands, normalized]);

  const current = commands[index];
  const merged = reconcileMissionCommandRecords(current, normalized).command;
  return boundCommands(commands.map((item, itemIndex) => (itemIndex === index ? merged : item)));
}

export function mergeMissionCommandBatch(commands: unknown[]): MissionCommand[] {
  return commands.reduce<MissionCommand[]>((acc, raw) => {
    const command = normalizePersistedMissionCommand(raw);
    return command ? mergeMissionCommand(acc, command) : acc;
  }, []);
}

export function appendMissionCommandEvent(
  events: MissionCommandEvent[],
  event: MissionCommandEvent,
): MissionCommandEvent[] {
  const normalized = normalizePersistedMissionCommandEvent(event);
  if (!normalized) return mergeMissionCommandEventBatch(events);
  if (events.some((item) => item.id === normalized.id || item.idempotencyKey === normalized.idempotencyKey)) {
    return mergeMissionCommandEventBatch(events);
  }
  return boundEvents([...events, normalized]);
}

export function mergeMissionCommandEventBatch(events: unknown[]): MissionCommandEvent[] {
  const result: MissionCommandEvent[] = [];
  const ids = new Set<string>();
  const idempotencyKeys = new Set<string>();
  for (const raw of events) {
    const event = normalizePersistedMissionCommandEvent(raw);
    if (!event || ids.has(event.id) || idempotencyKeys.has(event.idempotencyKey)) continue;
    ids.add(event.id);
    idempotencyKeys.add(event.idempotencyKey);
    result.push(event);
  }
  return boundEvents(result);
}

export function createMissionCommandEvent(input: {
  command: MissionCommand;
  type: MissionCommandEventType;
  actor: MissionCommandActor;
  occurredAt: string;
  summary: string | undefined;
  metadata?: MissionCommandEventMetadata;
  idempotencyKey?: string;
}): MissionCommandEvent {
  const idempotencyKey = input.idempotencyKey ?? createDispatchIdempotencyKey({
    expeditionId: input.command.expeditionId,
    entityType: 'mission_command_event',
    actionType: input.type,
    actorMemberId: input.actor.id,
    sourceEntityId: input.command.id,
    timeBucket: input.occurredAt,
  });
  return {
    schemaVersion: MISSION_COMMAND_SCHEMA_VERSION,
    id: createDispatchEntityId('mission_command_event', idempotencyKey),
    idempotencyKey,
    commandId: input.command.id,
    expeditionId: input.command.expeditionId,
    type: input.type,
    actor: normalizeActor(input.actor),
    occurredAt: normalizeIso(input.occurredAt) ?? input.command.updatedAt,
    summary: boundedText(input.summary) || defaultEventSummary(input.command, input.type),
    operationalState: input.command.operationalState,
    deliveryState: input.command.deliveryState,
    acknowledgmentState: input.command.acknowledgmentState,
    metadata: normalizeEventMetadata(input.metadata),
  };
}

export function sanitizeMissionCommandLinkedContext(
  context: DispatchLinkedContext | undefined,
): DispatchLinkedContext | undefined {
  if (!context) return undefined;
  const restricted = isRestrictedMissionCommandContext(context);
  const base: DispatchLinkedContext = {
    id: boundedText(context.id, 160),
    type: context.type,
    title: boundedText(context.title, 180),
    subtitle: boundedOptionalText(context.subtitle, 240),
    routeSegmentId: boundedOptionalText(context.routeSegmentId, 160),
    accuracyMeters: Number.isFinite(context.accuracyMeters) && Number(context.accuracyMeters) >= 0
      ? Number(context.accuracyMeters)
      : undefined,
    sourceTruth: context.sourceTruth ? sanitizeSourceTruthRef(context.sourceTruth) : undefined,
    sourceTruthPolicyKey: context.sourceTruthPolicyKey,
    observedAt: normalizeIso(context.observedAt),
    stale: context.stale === true,
    restricted,
  };
  if (restricted) {
    return base;
  }
  return {
    ...base,
    coordinates: isFiniteCoordinates(context.coordinates) ? { ...context.coordinates } : undefined,
    metadata: sanitizeMissionCommandContextMetadata(context.metadata),
  };
}

export function normalizePersistedMissionCommand(raw: unknown): MissionCommand | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<MissionCommand>;
  if (
    candidate.schemaVersion !== MISSION_COMMAND_SCHEMA_VERSION ||
    !isNonEmptyString(candidate.id) ||
    !isNonEmptyString(candidate.expeditionId) ||
    !isNonEmptyString(candidate.idempotencyKey) ||
    !Number.isFinite(candidate.version) ||
    Number(candidate.version) < 1 ||
    !isMissionCommandActor(candidate.creator) ||
    !isMissionCommandType(candidate.type) ||
    !isPriority(candidate.priority) ||
    !isNonEmptyString(candidate.title) ||
    !isNonEmptyString(candidate.instructions) ||
    !isMissionCommandTarget(candidate.target) ||
    !isAcknowledgmentPolicy(candidate.acknowledgmentPolicy) ||
    !isOperationalState(candidate.operationalState) ||
    !isDeliveryState(candidate.deliveryState) ||
    !isAcknowledgmentState(candidate.acknowledgmentState) ||
    !Array.isArray(candidate.acknowledgments) ||
    !Array.isArray(candidate.sourceTruth) ||
    candidate.sourceTruth.length === 0 ||
    !candidate.sourceTruth.every(isSourceTruthRef) ||
    !isValidIso(candidate.createdAt) ||
    !isValidIso(candidate.updatedAt) ||
    (candidate.deadlineAt != null && !isValidIso(candidate.deadlineAt)) ||
    !isAuditMetadata(candidate.audit)
  ) {
    return null;
  }
  const acknowledgments = candidate.acknowledgments
    .filter(isValidAcknowledgment)
    .map(normalizeAcknowledgment);
  if (acknowledgments.length !== candidate.acknowledgments.length) return null;
  const assignment = normalizeAssignment(candidate.assignment);
  if (candidate.assignment && !assignment) return null;
  const resolution = normalizeResolution(candidate.resolution);
  if (candidate.resolution && !resolution) return null;
  if (isTerminalOperationalState(candidate.operationalState) !== Boolean(resolution)) return null;
  if (candidate.linkedContext && !isDispatchLinkedContext(candidate.linkedContext)) return null;
  const acknowledgmentPolicy = {
    mode: candidate.acknowledgmentPolicy.mode,
    targetMemberIds: uniqueStrings(candidate.acknowledgmentPolicy.targetMemberIds),
    requiredCount: normalizeRequiredCount(candidate.acknowledgmentPolicy.requiredCount),
    roleId: boundedOptionalText(candidate.acknowledgmentPolicy.roleId, 120),
  };
  const acknowledgmentState = candidate.operationalState === 'expired' && acknowledgmentPolicy.mode !== 'none'
    ? 'expired'
    : deriveMissionCommandAcknowledgmentState({
        acknowledgmentPolicy,
        acknowledgments,
        deadlineAt: candidate.deadlineAt,
      });

  return {
    schemaVersion: MISSION_COMMAND_SCHEMA_VERSION,
    version: Math.floor(Number(candidate.version)),
    id: boundedText(candidate.id, 180),
    expeditionId: boundedText(candidate.expeditionId, 180),
    idempotencyKey: boundedText(candidate.idempotencyKey, 240),
    creator: normalizeActor(candidate.creator),
    type: candidate.type,
    priority: candidate.priority,
    title: boundedText(candidate.title, 180),
    instructions: boundedText(candidate.instructions, 2_000),
    target: normalizeTarget(candidate.target),
    assignment,
    acknowledgmentPolicy,
    deadlineAt: normalizeIso(candidate.deadlineAt),
    linkedContext: sanitizeMissionCommandLinkedContext(candidate.linkedContext),
    sourceTruth: candidate.sourceTruth.map((ref) => sanitizeSourceTruthRef(ref)),
    operationalState: candidate.operationalState,
    deliveryState: candidate.deliveryState,
    acknowledgmentState,
    acknowledgments,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    resolution,
    audit: {
      schemaVersion: 1,
      sourceKind: candidate.audit.sourceKind,
      sourceRecordId: boundedOptionalText(candidate.audit.sourceRecordId, 180),
      correlationId: boundedOptionalText(candidate.audit.correlationId, 180),
      safetyScope: 'ecs_team_coordination_only',
    },
  };
}

export function normalizePersistedMissionCommandEvent(raw: unknown): MissionCommandEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<MissionCommandEvent>;
  if (
    candidate.schemaVersion !== MISSION_COMMAND_SCHEMA_VERSION ||
    !isNonEmptyString(candidate.id) ||
    !isNonEmptyString(candidate.idempotencyKey) ||
    !isNonEmptyString(candidate.commandId) ||
    !isNonEmptyString(candidate.expeditionId) ||
    !isMissionCommandEventType(candidate.type) ||
    !isMissionCommandActor(candidate.actor) ||
    !isValidIso(candidate.occurredAt) ||
    !isNonEmptyString(candidate.summary) ||
    !isOperationalState(candidate.operationalState) ||
    !isDeliveryState(candidate.deliveryState) ||
    !isAcknowledgmentState(candidate.acknowledgmentState)
  ) {
    return null;
  }
  return {
    schemaVersion: MISSION_COMMAND_SCHEMA_VERSION,
    id: boundedText(candidate.id, 180),
    idempotencyKey: boundedText(candidate.idempotencyKey, 240),
    commandId: boundedText(candidate.commandId, 180),
    expeditionId: boundedText(candidate.expeditionId, 180),
    type: candidate.type,
    actor: normalizeActor(candidate.actor),
    occurredAt: candidate.occurredAt,
    summary: boundedText(candidate.summary, 280),
    operationalState: candidate.operationalState,
    deliveryState: candidate.deliveryState,
    acknowledgmentState: candidate.acknowledgmentState,
    metadata: normalizeEventMetadata(candidate.metadata),
  };
}

function operationalEventType(state: MissionCommandOperationalState): MissionCommandEventType {
  switch (state) {
    case 'ready': return 'staged';
    case 'active': return 'started';
    case 'in_progress': return 'started';
    case 'blocked': return 'blocked';
    case 'resolved': return 'resolved';
    case 'cancelled': return 'cancelled';
    case 'expired': return 'expired';
    default: return 'created';
  }
}

function deliveryEventType(state: MissionCommandDeliveryState): MissionCommandEventType {
  switch (state) {
    case 'queued': return 'queued';
    case 'sending': return 'sending';
    case 'sent': return 'sent';
    case 'delivered': return 'delivered';
    case 'failed': return 'failed';
    case 'retrying': return 'retrying';
    case 'cancelled': return 'cancelled';
    default: return 'created';
  }
}

function isTerminalOperationalState(state: MissionCommandOperationalState): state is 'resolved' | 'cancelled' | 'expired' {
  return state === 'resolved' || state === 'cancelled' || state === 'expired';
}

function defaultResolutionSummary(state: 'resolved' | 'cancelled' | 'expired'): string {
  if (state === 'resolved') return 'Mission Command resolved.';
  if (state === 'cancelled') return 'Mission Command cancelled by explicit user action.';
  return 'Mission Command deadline expired.';
}

function defaultEventSummary(command: MissionCommand, type: MissionCommandEventType): string {
  const labels: Record<MissionCommandEventType, string> = {
    created: 'created',
    staged: 'staged',
    queued: 'queued',
    sending: 'sending',
    sent: 'sent',
    delivered: 'delivered',
    acknowledged: 'acknowledged',
    declined: 'declined',
    assigned: 'assigned',
    follow_up_requested: 'requested follow-up',
    started: 'started',
    blocked: 'blocked',
    resolved: 'resolved',
    cancelled: 'cancelled',
    expired: 'expired',
    replayed: 'replayed',
    retrying: 'retrying',
    failed: 'failed',
  };
  return `${command.title} ${labels[type]}.`;
}

function invalidMutation(command: MissionCommand, reason: string): MissionCommandMutationResult {
  return { ok: false, changed: false, command, event: null, reason };
}

function requiredAcknowledgmentCount(
  mode: MissionCommand['acknowledgmentPolicy']['mode'],
  targetCount: number,
  configured: number | undefined,
): number {
  if (mode === 'none') return 0;
  if (mode === 'any') return 1;
  if (mode === 'all') return Math.max(1, targetCount);
  return Math.max(1, Math.min(Math.max(1, targetCount), Math.floor(configured ?? 1)));
}

function latestAcknowledgmentsByMember(items: MissionCommandAcknowledgment[]): MissionCommandAcknowledgment[] {
  const byMember = new Map<string, MissionCommandAcknowledgment>();
  for (const item of items) {
    const current = byMember.get(item.memberId);
    if (!current || compareIso(item.respondedAt, current.respondedAt) > 0) byMember.set(item.memberId, item);
  }
  return [...byMember.values()];
}

function normalizeAcknowledgment(item: MissionCommandAcknowledgment): MissionCommandAcknowledgment {
  return {
    id: boundedText(item.id, 180),
    idempotencyKey: boundedText(item.idempotencyKey, 240),
    memberId: boundedText(item.memberId, 180),
    response: item.response,
    respondedAt: item.respondedAt,
    message: boundedOptionalText(item.message, 500),
    sourceAcknowledgmentId: boundedOptionalText(item.sourceAcknowledgmentId, 180),
  };
}

function boundCommands(commands: MissionCommand[]): MissionCommand[] {
  if (commands.length <= MISSION_COMMAND_RETENTION_LIMITS.commands) return sortCommands(commands);
  const active = sortCommands(commands.filter((command) => !isTerminalOperationalState(command.operationalState)));
  const terminal = sortCommands(commands.filter((command) => isTerminalOperationalState(command.operationalState)));
  return [...active, ...terminal].slice(0, MISSION_COMMAND_RETENTION_LIMITS.commands);
}

function boundEvents(events: MissionCommandEvent[]): MissionCommandEvent[] {
  return [...events]
    .sort((left, right) => compareIso(right.occurredAt, left.occurredAt))
    .slice(0, MISSION_COMMAND_RETENTION_LIMITS.events);
}

function sortCommands(commands: MissionCommand[]): MissionCommand[] {
  const priority: Record<DispatchPriority, number> = { low: 1, normal: 2, high: 3, critical: 4 };
  return [...commands].sort((left, right) => {
    const priorityDifference = priority[right.priority] - priority[left.priority];
    if (priorityDifference !== 0) return priorityDifference;
    const leftDeadline = parseIso(left.deadlineAt) ?? Number.POSITIVE_INFINITY;
    const rightDeadline = parseIso(right.deadlineAt) ?? Number.POSITIVE_INFINITY;
    if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;
    return compareIso(right.updatedAt, left.updatedAt);
  });
}

function normalizeAssignment(value: MissionCommand['assignment']): MissionCommand['assignment'] {
  if (!value || !isNonEmptyString(value.id) || !isMissionCommandTarget(value.target)) return undefined;
  if (!['unassigned', 'offered', 'accepted', 'in_progress', 'blocked', 'completed', 'declined'].includes(value.status)) {
    return undefined;
  }
  if (!isValidIso(value.assignedAt) || !isValidIso(value.updatedAt)) return undefined;
  return {
    id: boundedText(value.id, 180),
    target: normalizeTarget(value.target),
    assigneeMemberId: boundedOptionalText(value.assigneeMemberId, 180),
    status: value.status,
    assignedAt: value.assignedAt,
    updatedAt: value.updatedAt,
    sourceAssignmentId: boundedOptionalText(value.sourceAssignmentId, 180),
  };
}

function normalizeResolution(value: MissionCommand['resolution']): MissionCommand['resolution'] {
  if (!value || !['resolved', 'cancelled', 'expired'].includes(value.kind) || !isValidIso(value.occurredAt)) {
    return undefined;
  }
  return {
    kind: value.kind,
    summary: boundedText(value.summary, 500),
    occurredAt: value.occurredAt,
    actorId: boundedText(value.actorId, 180),
    reasonCode: normalizeSafeCode(value.reasonCode),
  };
}

function normalizeEventMetadata(value: MissionCommandEventMetadata | undefined): MissionCommandEventMetadata | undefined {
  if (!value) return undefined;
  const metadata: MissionCommandEventMetadata = {};
  const reasonCode = normalizeSafeCode(value.reasonCode);
  if (reasonCode) metadata.reasonCode = reasonCode;
  const sourceKinds = [
    'native', 'legacy_ping', 'legacy_queue_item', 'legacy_assignment',
    'legacy_acknowledgment', 'legacy_cad_event', 'migration', 'legacy_timeline_event',
  ];
  if (value.sourceKind && sourceKinds.includes(value.sourceKind)) metadata.sourceKind = value.sourceKind;
  const sourceRecordId = boundedOptionalText(value.sourceRecordId, 180);
  if (sourceRecordId) metadata.sourceRecordId = sourceRecordId;
  if (Number.isFinite(value.attemptCount)) metadata.attemptCount = Math.max(0, Math.floor(value.attemptCount ?? 0));
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function normalizeTarget(target: MissionCommandTarget): MissionCommandTarget {
  const label = boundedOptionalText(target.label, 160);
  switch (target.kind) {
    case 'member': return { kind: 'member', memberId: boundedText(target.memberId, 180), label };
    case 'role': return { kind: 'role', roleId: boundedText(target.roleId, 120), label };
    case 'vehicle': return { kind: 'vehicle', vehicleId: boundedText(target.vehicleId, 180), label };
    case 'solo': return { kind: 'solo', memberId: boundedText(target.memberId, 180), label };
    case 'team': return { kind: 'team', memberIds: uniqueStrings(target.memberIds), label };
  }
}

function sameMissionCommandTarget(
  left: MissionCommandTarget | null,
  right: MissionCommandTarget | null,
): boolean {
  if (!left || !right) return left === right;
  return missionCommandTargetIdentity(left) === missionCommandTargetIdentity(right);
}

function missionCommandTargetIdentity(target: MissionCommandTarget): string {
  switch (target.kind) {
    case 'member': return `member:${target.memberId}`;
    case 'role': return `role:${target.roleId}`;
    case 'vehicle': return `vehicle:${target.vehicleId}`;
    case 'solo': return `solo:${target.memberId}`;
    case 'team': return `team:${uniqueStrings(target.memberIds).sort().join(',')}`;
  }
}

function targetMemberIds(target: MissionCommandTarget): string[] {
  if (target.kind === 'member' || target.kind === 'solo') return [target.memberId];
  if (target.kind === 'team') return uniqueStrings(target.memberIds);
  return [];
}

function normalizeActor(actor: MissionCommandActor): MissionCommandActor {
  return {
    id: boundedText(actor.id, 180),
    label: boundedText(actor.label, 160),
    role: actor.role,
  };
}

function isMissionCommandActor(value: unknown): value is MissionCommandActor {
  if (!value || typeof value !== 'object') return false;
  const actor = value as Partial<MissionCommandActor>;
  return isNonEmptyString(actor.id) && isNonEmptyString(actor.label) && (
    actor.role == null || ['owner', 'member', 'viewer', 'system'].includes(actor.role)
  );
}

function isMissionCommandTarget(value: unknown): value is MissionCommandTarget {
  if (!value || typeof value !== 'object') return false;
  const target = value as Partial<MissionCommandTarget> & Record<string, unknown>;
  if (target.kind === 'member' || target.kind === 'solo') return isNonEmptyString(target.memberId);
  if (target.kind === 'role') return isNonEmptyString(target.roleId);
  if (target.kind === 'vehicle') return isNonEmptyString(target.vehicleId);
  return target.kind === 'team' && Array.isArray(target.memberIds) && target.memberIds.every(isNonEmptyString);
}

function isAcknowledgmentPolicy(value: unknown): value is MissionCommand['acknowledgmentPolicy'] {
  if (!value || typeof value !== 'object') return false;
  const policy = value as Partial<MissionCommand['acknowledgmentPolicy']>;
  return ['none', 'any', 'all', 'count'].includes(String(policy.mode)) &&
    Array.isArray(policy.targetMemberIds) && policy.targetMemberIds.every(isNonEmptyString) &&
    (policy.requiredCount == null || (Number.isFinite(policy.requiredCount) && Number(policy.requiredCount) > 0)) &&
    (policy.roleId == null || isNonEmptyString(policy.roleId));
}

function isValidAcknowledgment(value: unknown): value is MissionCommandAcknowledgment {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<MissionCommandAcknowledgment>;
  return isNonEmptyString(item.id) && isNonEmptyString(item.idempotencyKey) &&
    isNonEmptyString(item.memberId) && (item.response === 'acknowledged' || item.response === 'declined') &&
    isValidIso(item.respondedAt);
}

function isAuditMetadata(value: unknown): value is MissionCommand['audit'] {
  if (!value || typeof value !== 'object') return false;
  const audit = value as Partial<MissionCommand['audit']>;
  return audit.schemaVersion === 1 &&
    ['native', 'legacy_ping', 'legacy_queue_item', 'legacy_assignment', 'legacy_acknowledgment', 'legacy_cad_event', 'migration']
      .includes(String(audit.sourceKind)) &&
    audit.safetyScope === 'ecs_team_coordination_only';
}

function isSourceTruthRef(value: unknown): value is MissionCommand['sourceTruth'][number] {
  if (!value || typeof value !== 'object') return false;
  const ref = value as Partial<MissionCommand['sourceTruth'][number]>;
  return isNonEmptyString(ref.id) && isNonEmptyString(ref.origin) &&
    isNonEmptyString(ref.confidence) && Array.isArray(ref.warningCodes);
}

function isDispatchLinkedContext(value: unknown): value is DispatchLinkedContext {
  if (!value || typeof value !== 'object') return false;
  const context = value as Partial<DispatchLinkedContext>;
  const types = [
    'expedition', 'pin', 'waypoint', 'route_segment', 'route', 'camp', 'rally', 'bailout',
    'incident', 'resource', 'vehicle', 'member', 'power', 'manual',
  ];
  return isNonEmptyString(context.id) && isNonEmptyString(context.title) && types.includes(String(context.type));
}

function isMissionCommandType(value: unknown): value is MissionCommand['type'] {
  return ['check_in', 'rally', 'assist', 'hazard', 'resource', 'route', 'recovery', 'general', 'emergency']
    .includes(String(value));
}

function isMissionCommandEventType(value: unknown): value is MissionCommandEventType {
  return ['created', 'staged', 'queued', 'sending', 'sent', 'delivered', 'acknowledged', 'declined',
    'assigned', 'follow_up_requested', 'started', 'blocked', 'resolved', 'cancelled', 'expired', 'replayed', 'retrying', 'failed']
    .includes(String(value));
}

function isPriority(value: unknown): value is DispatchPriority {
  return ['low', 'normal', 'high', 'critical'].includes(String(value));
}

function isOperationalState(value: unknown): value is MissionCommandOperationalState {
  return ['proposed', 'ready', 'active', 'in_progress', 'blocked', 'resolved', 'cancelled', 'expired']
    .includes(String(value));
}

function isDeliveryState(value: unknown): value is MissionCommandDeliveryState {
  return ['local', 'queued', 'sending', 'sent', 'delivered', 'failed', 'retrying', 'cancelled']
    .includes(String(value));
}

function isAcknowledgmentState(value: unknown): value is MissionCommandAcknowledgmentState {
  return ['not_required', 'pending', 'partial', 'complete', 'declined', 'expired'].includes(String(value));
}

function isFiniteCoordinates(value: DispatchLinkedContext['coordinates']): value is DispatchCoordinates {
  return Boolean(value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude));
}

function isRestrictedMissionCommandContext(context: DispatchLinkedContext): boolean {
  const metadata = readMissionCommandContextMetadata(context.metadata);
  return (
    context.restricted === true ||
    context.type === 'member' ||
    readMetadataBoolean(metadata?.restricted) ||
    readMetadataBoolean(metadata?.locationRestricted) ||
    readMetadataBoolean(metadata?.requiresMemberLocationPermission)
  );
}

function sanitizeMissionCommandContextMetadata(
  value: DispatchLinkedContext['metadata'],
): Record<string, unknown> | undefined {
  const source = readMissionCommandContextMetadata(value);
  if (!source) return undefined;
  const metadata: Record<string, unknown> = {};
  for (const key of ['pinId', 'bailoutId', 'routeId', 'vehicleId', 'dispatchEventId'] as const) {
    const normalized = boundedOptionalText(source[key], 160);
    if (normalized) metadata[key] = normalized;
  }
  for (const key of ['waypointIndex', 'segmentIndex'] as const) {
    const candidate = source[key];
    if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 0) {
      metadata[key] = candidate;
    }
  }
  if (source.activeRoute === true) metadata.activeRoute = true;
  if (source.source === 'pinStore' || source.source === 'routeStore' || source.source === 'vehicleStore') {
    metadata.source = source.source;
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function readMissionCommandContextMetadata(
  value: DispatchLinkedContext['metadata'],
): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readMetadataBoolean(value: unknown): boolean {
  return value === true || value === 1 || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}

function states<T extends string>(...values: T[]): ReadonlySet<T> {
  return new Set(values);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => boundedText(value, 180)).filter(Boolean))].sort();
}

function normalizeRequiredCount(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value ?? 1)) : undefined;
}

function boundedText(value: unknown, limit = 280): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function boundedOptionalText(value: unknown, limit = 280): string | undefined {
  const normalized = boundedText(value, limit);
  return normalized || undefined;
}

function normalizeSafeCode(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(normalized) ? normalized : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseIso(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIso(value: unknown): string | undefined {
  return parseIso(value) == null ? undefined : String(value);
}

function isValidIso(value: unknown): value is string {
  return parseIso(value) != null;
}

function compareIso(left: string, right: string): number {
  return (parseIso(left) ?? 0) - (parseIso(right) ?? 0);
}
