import {
  canSubmitAssistRequest,
  canSubmitDispatchPing,
  type DispatchPermissionSnapshot,
} from './dispatchPermissionAdapter';
import { createDispatchEntityId, createDispatchIdempotencyKey } from './dispatchIntegrity';
import {
  createMissionCommandEvent,
  normalizePersistedMissionCommand,
  sanitizeMissionCommandLinkedContext,
} from './dispatchMissionCommandDomain';
import {
  MISSION_COMMAND_SCHEMA_VERSION,
  type MissionCommand,
  type MissionCommandAcknowledgmentPolicy,
  type MissionCommandActor,
  type MissionCommandEvent,
  type MissionCommandTarget,
  type MissionCommandType,
} from './dispatchMissionCommandTypes';
import type { OperationalPlaybookCommandProposal } from './dispatchOperationalPlaybookTypes';
import type { DispatchLinkedContext, DispatchPriority } from './dispatchTypes';
import { sanitizeSourceTruthRef, type SourceTruthRef } from './sourceTruth';

export const MISSION_COMMAND_COMPOSER_TYPES = [
  'check_in',
  'rally',
  'assist',
  'hazard',
  'resource',
  'route',
  'recovery',
  'general',
] as const;

export type MissionCommandComposerType = typeof MISSION_COMMAND_COMPOSER_TYPES[number];
export type MissionCommandComposerMode = 'create' | 'reassign' | 'follow_up';
export type MissionCommandComposerTargetKind =
  | 'member'
  | 'role'
  | 'selected_members'
  | 'expedition'
  | 'vehicle'
  | 'self';
export type MissionCommandComposerAssignmentKind = 'unassigned' | 'member' | 'role' | 'vehicle' | 'team_unit';
export type MissionCommandComposerAcknowledgmentMode = 'none' | 'any' | 'all' | 'role' | 'count';
export type MissionCommandComposerDeadlineMode = 'none' | 'absolute' | 'relative' | 'mission_clock' | 'milestone';

export interface MissionCommandComposerMemberOption {
  id: string;
  label: string;
  roleId?: string;
  vehicleIds?: string[];
}

export interface MissionCommandComposerRoleOption {
  id: string;
  label: string;
  memberIds: string[];
}

export interface MissionCommandComposerVehicleOption {
  id: string;
  label: string;
  memberIds?: string[];
}

export interface MissionCommandComposerTeamUnitOption {
  id: string;
  label: string;
  memberIds: string[];
}

export interface MissionCommandComposerContextOption {
  id: string;
  label: string;
  context: DispatchLinkedContext;
}

export interface MissionCommandComposerMilestoneOption {
  id: string;
  label: string;
  deadlineAt: string;
}

export interface MissionCommandComposerCatalog {
  members: MissionCommandComposerMemberOption[];
  roles: MissionCommandComposerRoleOption[];
  vehicles: MissionCommandComposerVehicleOption[];
  teamUnits: MissionCommandComposerTeamUnitOption[];
  linkedContexts: MissionCommandComposerContextOption[];
  milestones: MissionCommandComposerMilestoneOption[];
}

export interface MissionCommandComposerForm {
  draftId: string;
  type: MissionCommandComposerType;
  priority: DispatchPriority;
  title: string;
  instructions: string;
  targetKind: MissionCommandComposerTargetKind;
  targetMemberId: string;
  selectedMemberIds: string[];
  targetRoleId: string;
  targetVehicleId: string;
  assignmentKind: MissionCommandComposerAssignmentKind;
  assignmentMemberId: string;
  assignmentRoleId: string;
  assignmentVehicleId: string;
  assignmentTeamUnitId: string;
  acknowledgmentMode: MissionCommandComposerAcknowledgmentMode;
  acknowledgmentRoleId: string;
  acknowledgmentCount: string;
  deadlineMode: MissionCommandComposerDeadlineMode;
  absoluteDeadlineAt: string;
  relativeDeadlineMinutes: string;
  missionClockMinutes: string;
  milestoneId: string;
  linkedContextId: string;
  manualContextLabel: string;
}

export interface MissionCommandPlaybookComposerRequest {
  instanceId: string;
  proposalId: string;
  form: MissionCommandComposerForm;
  extraContext: MissionCommandComposerContextOption | null;
  sourceTruth: SourceTruthRef[];
}

export interface MissionCommandComposerIssue {
  field: keyof MissionCommandComposerForm | 'permission' | 'command';
  message: string;
}

export type MissionCommandComposerBuildResult =
  | { ok: true; command: MissionCommand; event: MissionCommandEvent }
  | { ok: false; issues: MissionCommandComposerIssue[] };

export interface MissionCommandComposerBuildInput {
  form: MissionCommandComposerForm;
  expeditionId: string;
  actor: MissionCommandActor;
  soloMode: boolean;
  catalog: MissionCommandComposerCatalog;
  permissions: DispatchPermissionSnapshot;
  queueDelivery: boolean;
  sourceTruth?: SourceTruthRef[];
  now?: string;
}

export type MissionCommandComposerPlaybookDraftResult =
  | {
      ok: true;
      form: MissionCommandComposerForm;
      extraContext: MissionCommandComposerContextOption | null;
      sourceTruth: SourceTruthRef[];
    }
  | { ok: false; reason: string };

export type LegacyDispatchComposerEntry = 'check_in' | 'ping' | 'assist' | 'rally' | 'hazard' | 'resource';

const TYPE_TITLES: Record<MissionCommandComposerType, string> = {
  check_in: 'Check-In Request',
  rally: 'Rally Instruction',
  assist: 'Assist Request',
  hazard: 'Hazard Advisory',
  resource: 'Resource Action',
  route: 'Route Action',
  recovery: 'Recovery Coordination',
  general: 'Mission Command',
};

let draftSequence = 0;

export function createMissionCommandComposerDraftId(actorId: string, now = Date.now()): string {
  draftSequence += 1;
  return `mission-command-draft:${cleanToken(actorId) || 'operator'}:${now.toString(36)}:${draftSequence.toString(36)}`;
}

export function createMissionCommandComposerForm(input: {
  actorId: string;
  soloMode: boolean;
  members?: MissionCommandComposerMemberOption[];
  seedType?: MissionCommandComposerType;
  draftId?: string;
  now?: number;
}): MissionCommandComposerForm {
  const type = input.seedType ?? 'general';
  const members = input.members ?? [];
  const actorIsMember = members.some((member) => member.id === input.actorId);
  const defaultMemberId = actorIsMember ? input.actorId : members[0]?.id ?? '';
  return {
    draftId: input.draftId ?? createMissionCommandComposerDraftId(input.actorId, input.now),
    type,
    priority: 'normal',
    title: TYPE_TITLES[type],
    instructions: '',
    targetKind: input.soloMode ? 'self' : 'member',
    targetMemberId: defaultMemberId,
    selectedMemberIds: defaultMemberId ? [defaultMemberId] : [],
    targetRoleId: '',
    targetVehicleId: '',
    assignmentKind: 'unassigned',
    assignmentMemberId: '',
    assignmentRoleId: '',
    assignmentVehicleId: '',
    assignmentTeamUnitId: '',
    acknowledgmentMode: 'none',
    acknowledgmentRoleId: '',
    acknowledgmentCount: '1',
    deadlineMode: 'none',
    absoluteDeadlineAt: '',
    relativeDeadlineMinutes: '30',
    missionClockMinutes: '30',
    milestoneId: '',
    linkedContextId: '',
    manualContextLabel: '',
  };
}

export function createMissionCommandComposerFormFromPlaybookProposal(input: {
  proposal: OperationalPlaybookCommandProposal;
  actorId: string;
  soloMode: boolean;
  members?: MissionCommandComposerMemberOption[];
}): MissionCommandComposerPlaybookDraftResult {
  const { proposal } = input;
  if (proposal.status !== 'confirmed') {
    return { ok: false, reason: 'Only an explicitly confirmed playbook proposal can open Command Composer.' };
  }
  if (!MISSION_COMMAND_COMPOSER_TYPES.includes(proposal.type as MissionCommandComposerType)) {
    return { ok: false, reason: 'This proposal type is unavailable in Command Composer.' };
  }
  if (!proposal.target) return { ok: false, reason: 'The playbook proposal target is unavailable.' };
  const base = createMissionCommandComposerForm({
    actorId: input.actorId,
    soloMode: input.soloMode,
    members: input.members,
    seedType: proposal.type as MissionCommandComposerType,
    draftId: `mission-command-proposal:${proposal.id}`,
  });
  const targetPatch = composerTargetPatch(proposal.target, input.soloMode);
  if (!targetPatch) return { ok: false, reason: 'The playbook proposal target is incompatible with this Dispatch context.' };
  const acknowledgment = proposal.acknowledgmentPolicy ?? { mode: 'none' as const, targetMemberIds: [] };
  const extraContext = proposal.linkedContext
    ? {
        id: `playbook-context:${proposal.id}`,
        label: proposal.linkedContext.title,
        context: proposal.linkedContext,
      }
    : null;
  return {
    ok: true,
    form: {
      ...base,
      ...targetPatch,
      priority: proposal.priority,
      title: proposal.title,
      instructions: proposal.instructions,
      acknowledgmentMode: acknowledgment.mode,
      acknowledgmentCount: acknowledgment.requiredCount == null ? '' : String(acknowledgment.requiredCount),
      deadlineMode: proposal.deadlineAt ? 'absolute' : 'none',
      absoluteDeadlineAt: proposal.deadlineAt ?? '',
      linkedContextId: extraContext?.id ?? '',
    },
    extraContext,
    sourceTruth: proposal.sourceTruth.map(sanitizeSourceTruthRef),
  };
}

export function updateMissionCommandComposerType(
  form: MissionCommandComposerForm,
  type: MissionCommandComposerType,
): MissionCommandComposerForm {
  const currentDefault = TYPE_TITLES[form.type];
  return {
    ...form,
    type,
    title: !form.title.trim() || form.title === currentDefault ? TYPE_TITLES[type] : form.title,
  };
}

export function seedMissionCommandComposerAssignment(
  form: MissionCommandComposerForm,
  command: MissionCommand,
  catalog: MissionCommandComposerCatalog,
): MissionCommandComposerForm {
  const target = command.assignment?.target;
  if (!target) return { ...form, assignmentKind: 'unassigned' };
  if (target.kind === 'member' || target.kind === 'solo') {
    return { ...form, assignmentKind: 'member', assignmentMemberId: target.memberId };
  }
  if (target.kind === 'role') {
    return { ...form, assignmentKind: 'role', assignmentRoleId: target.roleId };
  }
  if (target.kind === 'vehicle') {
    return { ...form, assignmentKind: 'vehicle', assignmentVehicleId: target.vehicleId };
  }
  const unit = catalog.teamUnits.find((candidate) => (
    sameStringSet(candidate.memberIds, target.memberIds)
  ));
  return unit
    ? { ...form, assignmentKind: 'team_unit', assignmentTeamUnitId: unit.id }
    : { ...form, assignmentKind: 'unassigned' };
}

export function legacyDispatchComposerEntryToMissionCommandType(
  entry: LegacyDispatchComposerEntry,
): MissionCommandComposerType {
  if (entry === 'ping') return 'general';
  return entry;
}

export function buildMissionCommandFromComposer(
  input: MissionCommandComposerBuildInput,
): MissionCommandComposerBuildResult {
  const now = validIso(input.now) ?? new Date().toISOString();
  const issues: MissionCommandComposerIssue[] = [];
  const title = bounded(input.form.title, 180);
  const instructions = bounded(input.form.instructions, 2_000);
  if (!title) issues.push({ field: 'title', message: 'Command title is required.' });
  if (!instructions) issues.push({ field: 'instructions', message: 'Instructions are required.' });
  if (!bounded(input.expeditionId, 180)) issues.push({ field: 'command', message: 'Mission Command context is unavailable.' });

  const targetResult = resolveMissionCommandComposerTarget(input.form, input.catalog, input.actor, input.soloMode);
  if (!targetResult.ok) issues.push(targetResult.issue);
  const selfTarget = targetResult.ok && targetResult.target.kind === 'solo';
  const assignmentResult = selfTarget
    ? { ok: true as const, target: null }
    : resolveMissionCommandComposerAssignment(input.form, input.catalog);
  if (!assignmentResult.ok) issues.push(assignmentResult.issue);
  const contextResult = resolveMissionCommandComposerContext(input.form, input.catalog);
  if (!contextResult.ok) issues.push(contextResult.issue);
  const deadlineResult = resolveMissionCommandComposerDeadline(input.form, input.catalog, now);
  if (!deadlineResult.ok) issues.push(deadlineResult.issue);

  if (targetResult.ok) {
    const permission = resolveComposerPermission(input.form, targetResult.target, input.permissions);
    if (!permission.allowed) {
      issues.push({ field: 'permission', message: permission.reason ?? input.permissions.disabledReason });
    }
  }
  if (!selfTarget && assignmentResult.ok && assignmentResult.target) {
    const permission = input.permissions.can('assign_member');
    if (!permission.allowed) {
      issues.push({ field: 'permission', message: permission.reason ?? input.permissions.disabledReason });
    }
  }

  if (!targetResult.ok || !assignmentResult.ok || !contextResult.ok || !deadlineResult.ok) {
    return { ok: false, issues: uniqueIssues(issues) };
  }
  const acknowledgmentResult = selfTarget
    ? { ok: true as const, policy: { mode: 'none' as const, targetMemberIds: [] } }
    : resolveAcknowledgmentPolicy(
        input.form,
        targetResult.targetMemberIds,
        input.catalog,
      );
  if (!acknowledgmentResult.ok) issues.push(acknowledgmentResult.issue);
  if (issues.length > 0 || !acknowledgmentResult.ok) {
    return { ok: false, issues: uniqueIssues(issues) };
  }

  const idempotencyKey = createDispatchIdempotencyKey({
    expeditionId: input.expeditionId,
    entityType: 'mission_command',
    actionType: 'create',
    actorMemberId: input.actor.id,
    targetMemberIds: targetResult.targetMemberIds,
    linkedContextId: contextResult.context?.id,
    sourceEntityId: input.form.draftId,
    message: `${title}\n${instructions}`,
    priority: input.form.priority,
    metadata: { commandType: input.form.type, targetKind: input.form.targetKind },
  });
  const commandId = createDispatchEntityId('mission_command', idempotencyKey);
  const assignment = assignmentResult.target
    ? {
        id: createDispatchEntityId('assignment', createDispatchIdempotencyKey({
          expeditionId: input.expeditionId,
          entityType: 'assignment',
          actionType: 'mission_command_initial_assignment',
          actorMemberId: input.actor.id,
          sourceEntityId: commandId,
          targetMemberIds: memberIdsForTarget(assignmentResult.target, input.catalog),
          metadata: { targetKind: assignmentResult.target.kind },
        })),
        target: assignmentResult.target,
        assigneeMemberId: assignmentResult.target.kind === 'member' || assignmentResult.target.kind === 'solo'
          ? assignmentResult.target.memberId
          : undefined,
        status: 'offered' as const,
        assignedAt: now,
        updatedAt: now,
      }
    : undefined;
  const shouldQueueDelivery = input.queueDelivery && !selfTarget;
  const deliveryState = shouldQueueDelivery ? 'queued' as const : 'local' as const;
  const commandCandidate: MissionCommand = {
    schemaVersion: MISSION_COMMAND_SCHEMA_VERSION,
    version: 1,
    id: commandId,
    expeditionId: bounded(input.expeditionId, 180),
    creator: {
      id: bounded(input.actor.id, 180),
      label: bounded(input.actor.label, 160),
      role: input.actor.role,
    },
    type: input.form.type as MissionCommandType,
    priority: input.form.priority,
    title,
    instructions,
    target: targetResult.target,
    assignment,
    acknowledgmentPolicy: acknowledgmentResult.policy,
    deadlineAt: deadlineResult.deadlineAt,
    linkedContext: contextResult.context,
    sourceTruth: dedupeSourceTruth([
      ...(input.sourceTruth ?? []),
      manualCommandSource(commandId, now),
    ]),
    operationalState: 'active',
    deliveryState,
    acknowledgmentState: acknowledgmentResult.policy.mode === 'none' ? 'not_required' : 'pending',
    acknowledgments: [],
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
    audit: {
      schemaVersion: 1,
      sourceKind: 'native',
      correlationId: bounded(input.form.draftId, 180),
      safetyScope: 'ecs_team_coordination_only',
    },
  };
  const command = normalizePersistedMissionCommand(commandCandidate);
  if (!command) {
    return { ok: false, issues: [{ field: 'command', message: 'Mission Command failed canonical validation.' }] };
  }
  const event = createMissionCommandEvent({
    command,
    type: shouldQueueDelivery ? 'queued' : 'created',
    actor: command.creator,
    occurredAt: now,
    summary: shouldQueueDelivery
      ? `${command.title} queued for delivery.`
      : `${command.title} created locally.`,
    idempotencyKey: createDispatchIdempotencyKey({
      expeditionId: command.expeditionId,
      entityType: 'mission_command_event',
      actionType: shouldQueueDelivery ? 'initial_queue' : 'create',
      actorMemberId: command.creator.id,
      sourceEntityId: command.id,
    }),
  });
  return { ok: true, command, event };
}

function composerTargetPatch(
  target: MissionCommandTarget,
  soloMode: boolean,
): Partial<MissionCommandComposerForm> | null {
  if (soloMode && target.kind !== 'solo') return null;
  if (target.kind === 'member') return { targetKind: 'member', targetMemberId: target.memberId };
  if (target.kind === 'team') return { targetKind: 'selected_members', selectedMemberIds: [...target.memberIds] };
  if (target.kind === 'role') return { targetKind: 'role', targetRoleId: target.roleId };
  if (target.kind === 'vehicle') return { targetKind: 'vehicle', targetVehicleId: target.vehicleId };
  if (target.kind === 'solo' && soloMode) return { targetKind: 'self' };
  return null;
}

function dedupeSourceTruth(refs: SourceTruthRef[]): SourceTruthRef[] {
  const byId = new Map<string, SourceTruthRef>();
  refs.forEach((ref) => {
    if (!ref?.id) return;
    const sanitized = sanitizeSourceTruthRef(ref);
    byId.set(sanitized.id, sanitized);
  });
  return [...byId.values()].slice(0, 30);
}

export function resolveMissionCommandComposerAssignment(
  form: MissionCommandComposerForm,
  catalog: MissionCommandComposerCatalog,
): { ok: true; target: MissionCommandTarget | null } | { ok: false; issue: MissionCommandComposerIssue } {
  switch (form.assignmentKind) {
    case 'unassigned':
      return { ok: true, target: null };
    case 'member': {
      const member = catalog.members.find((item) => item.id === form.assignmentMemberId);
      return member
        ? { ok: true, target: { kind: 'member', memberId: member.id, label: member.label } }
        : invalid('assignmentMemberId', 'Select a valid member assignment.');
    }
    case 'role': {
      const role = catalog.roles.find((item) => item.id === form.assignmentRoleId);
      return role
        ? { ok: true, target: { kind: 'role', roleId: role.id, label: role.label } }
        : invalid('assignmentRoleId', 'Select a valid role assignment.');
    }
    case 'vehicle': {
      const vehicle = catalog.vehicles.find((item) => item.id === form.assignmentVehicleId);
      return vehicle
        ? { ok: true, target: { kind: 'vehicle', vehicleId: vehicle.id, label: vehicle.label } }
        : invalid('assignmentVehicleId', 'Select a valid vehicle assignment.');
    }
    case 'team_unit': {
      const unit = catalog.teamUnits.find((item) => item.id === form.assignmentTeamUnitId);
      return unit
        ? { ok: true, target: { kind: 'team', memberIds: unique(unit.memberIds), label: unit.label } }
        : invalid('assignmentTeamUnitId', 'Select a valid team unit assignment.');
    }
  }
}

export function validateMissionCommandFollowUp(message: string): string | null {
  return bounded(message, 500) ? null : 'Follow-up instructions are required.';
}

function resolveMissionCommandComposerTarget(
  form: MissionCommandComposerForm,
  catalog: MissionCommandComposerCatalog,
  actor: MissionCommandActor,
  soloMode: boolean,
): { ok: true; target: MissionCommandTarget; targetMemberIds: string[] } | { ok: false; issue: MissionCommandComposerIssue } {
  if (soloMode && form.targetKind !== 'self') {
    return invalid('targetKind', 'Solo Mission Command supports only self-targeted local actions.');
  }
  switch (form.targetKind) {
    case 'self':
      return soloMode
        ? { ok: true, target: { kind: 'solo', memberId: actor.id, label: actor.label }, targetMemberIds: [actor.id] }
        : invalid('targetKind', 'Self targeting is available only in solo mode.');
    case 'member': {
      const member = catalog.members.find((item) => item.id === form.targetMemberId);
      return member
        ? {
            ok: true,
            target: { kind: 'member', memberId: member.id, label: member.label },
            targetMemberIds: [member.id],
          }
        : invalid('targetMemberId', 'Select a valid command target.');
    }
    case 'selected_members': {
      const selected = unique(form.selectedMemberIds)
        .map((id) => catalog.members.find((item) => item.id === id))
        .filter((item): item is MissionCommandComposerMemberOption => Boolean(item));
      if (selected.length === 0) return invalid('selectedMemberIds', 'Select at least one expedition member.');
      return {
        ok: true,
        target: { kind: 'team', memberIds: selected.map((item) => item.id), label: 'Selected members' },
        targetMemberIds: selected.map((item) => item.id),
      };
    }
    case 'expedition': {
      const memberIds = unique(catalog.members.map((item) => item.id));
      if (memberIds.length === 0) return invalid('targetKind', 'Whole-expedition targeting requires an active team roster.');
      return {
        ok: true,
        target: { kind: 'team', memberIds, label: 'Whole expedition' },
        targetMemberIds: memberIds,
      };
    }
    case 'role': {
      const role = catalog.roles.find((item) => item.id === form.targetRoleId);
      return role
        ? {
            ok: true,
            target: { kind: 'role', roleId: role.id, label: role.label },
            targetMemberIds: unique(role.memberIds),
          }
        : invalid('targetRoleId', 'Select a valid expedition role.');
    }
    case 'vehicle': {
      const vehicle = catalog.vehicles.find((item) => item.id === form.targetVehicleId);
      return vehicle
        ? {
            ok: true,
            target: { kind: 'vehicle', vehicleId: vehicle.id, label: vehicle.label },
            targetMemberIds: unique(vehicle.memberIds ?? []),
          }
        : invalid('targetVehicleId', 'Select a valid vehicle target.');
    }
  }
}

function resolveAcknowledgmentPolicy(
  form: MissionCommandComposerForm,
  targetMemberIds: string[],
  catalog: MissionCommandComposerCatalog,
): { ok: true; policy: MissionCommandAcknowledgmentPolicy } | { ok: false; issue: MissionCommandComposerIssue } {
  if (form.acknowledgmentMode === 'none') {
    return { ok: true, policy: { mode: 'none', targetMemberIds: [] } };
  }
  let eligibleIds = unique(targetMemberIds);
  let roleId: string | undefined;
  if (form.acknowledgmentMode === 'role') {
    const role = catalog.roles.find((item) => item.id === form.acknowledgmentRoleId);
    if (!role) return invalid('acknowledgmentRoleId', 'Select a valid acknowledgment role.');
    roleId = role.id;
    const roleSet = new Set(role.memberIds);
    eligibleIds = eligibleIds.filter((id) => roleSet.has(id));
  }
  if (eligibleIds.length === 0) {
    return invalid('acknowledgmentMode', 'Acknowledgment requires at least one known target member.');
  }
  if (form.acknowledgmentMode === 'count') {
    const count = Number.parseInt(form.acknowledgmentCount, 10);
    if (!Number.isFinite(count) || count < 1 || count > eligibleIds.length) {
      return invalid('acknowledgmentCount', `Acknowledgment count must be between 1 and ${eligibleIds.length}.`);
    }
    return { ok: true, policy: { mode: 'count', targetMemberIds: eligibleIds, requiredCount: count } };
  }
  return {
    ok: true,
    policy: {
      mode: form.acknowledgmentMode === 'any' ? 'any' : 'all',
      targetMemberIds: eligibleIds,
      roleId,
    },
  };
}

function resolveMissionCommandComposerDeadline(
  form: MissionCommandComposerForm,
  catalog: MissionCommandComposerCatalog,
  now: string,
): { ok: true; deadlineAt?: string } | { ok: false; issue: MissionCommandComposerIssue } {
  if (form.deadlineMode === 'none') return { ok: true };
  const nowMs = Date.parse(now);
  let deadlineMs = Number.NaN;
  if (form.deadlineMode === 'absolute') {
    deadlineMs = Date.parse(form.absoluteDeadlineAt);
  } else if (form.deadlineMode === 'relative' || form.deadlineMode === 'mission_clock') {
    const rawMinutes = form.deadlineMode === 'relative'
      ? form.relativeDeadlineMinutes
      : form.missionClockMinutes;
    const minutes = Number.parseInt(rawMinutes, 10);
    if (Number.isFinite(minutes) && minutes > 0 && minutes <= 43_200) {
      deadlineMs = nowMs + minutes * 60_000;
    }
  } else {
    const milestone = catalog.milestones.find((item) => item.id === form.milestoneId);
    deadlineMs = milestone ? Date.parse(milestone.deadlineAt) : Number.NaN;
  }
  if (!Number.isFinite(deadlineMs) || deadlineMs <= nowMs) {
    return invalid(
      form.deadlineMode === 'absolute' ? 'absoluteDeadlineAt' : 'deadlineMode',
      'Select a valid future deadline.',
    );
  }
  return { ok: true, deadlineAt: new Date(deadlineMs).toISOString() };
}

function resolveMissionCommandComposerContext(
  form: MissionCommandComposerForm,
  catalog: MissionCommandComposerCatalog,
): { ok: true; context?: DispatchLinkedContext } | { ok: false; issue: MissionCommandComposerIssue } {
  if (!form.linkedContextId) return { ok: true };
  if (form.linkedContextId === 'manual') {
    const label = bounded(form.manualContextLabel, 180);
    if (!label) return invalid('manualContextLabel', 'Manual context label is required.');
    return {
      ok: true,
      context: {
        id: `manual:${cleanToken(form.draftId)}`,
        type: 'manual',
        title: label,
        sourceTruthPolicyKey: 'manual_user_state',
      },
    };
  }
  const option = catalog.linkedContexts.find((item) => item.id === form.linkedContextId);
  if (!option) return invalid('linkedContextId', 'Selected linked context is unavailable.');
  if (option.context.restricted) {
    return invalid('linkedContextId', 'Restricted location context cannot be attached to this command.');
  }
  const context = sanitizeMissionCommandLinkedContext({
    id: option.context.id,
    type: option.context.type,
    title: option.context.title,
    subtitle: option.context.subtitle,
    coordinates: option.context.coordinates,
    routeSegmentId: option.context.routeSegmentId,
    sourceTruth: option.context.sourceTruth,
    sourceTruthPolicyKey: option.context.sourceTruthPolicyKey,
    observedAt: option.context.observedAt,
    stale: option.context.stale,
    restricted: false,
  });
  if (context?.restricted) {
    return invalid('linkedContextId', 'Restricted location context cannot be attached to this command.');
  }
  return context ? { ok: true, context } : invalid('linkedContextId', 'Linked context failed validation.');
}

function resolveComposerPermission(
  form: MissionCommandComposerForm,
  target: MissionCommandTarget,
  permissions: DispatchPermissionSnapshot,
) {
  const recipientMode = target.kind === 'role'
    ? 'role' as const
    : target.kind === 'team' && form.targetKind === 'expedition'
      ? 'all' as const
      : 'member' as const;
  if (form.targetKind === 'selected_members' && form.selectedMemberIds.length > 1) {
    const groupPermission = permissions.can('send_team_ping');
    if (!groupPermission.allowed) return groupPermission;
  }
  if (form.targetKind === 'vehicle') {
    const vehiclePermission = permissions.can('send_team_ping');
    if (!vehiclePermission.allowed) return vehiclePermission;
  }
  if (form.type === 'assist' || form.type === 'recovery') {
    return canSubmitAssistRequest({
      assistType: form.type === 'recovery' ? 'recovery' : 'general_support',
      recipientMode,
      priority: form.priority,
    }, permissions);
  }
  return canSubmitDispatchPing({
    recipientMode,
    pingType: form.type,
    priority: form.priority,
  }, permissions);
}

function memberIdsForTarget(target: MissionCommandTarget, catalog: MissionCommandComposerCatalog): string[] {
  if (target.kind === 'member' || target.kind === 'solo') return [target.memberId];
  if (target.kind === 'team') return unique(target.memberIds);
  if (target.kind === 'role') return unique(catalog.roles.find((role) => role.id === target.roleId)?.memberIds ?? []);
  return unique(catalog.vehicles.find((vehicle) => vehicle.id === target.vehicleId)?.memberIds ?? []);
}

function manualCommandSource(commandId: string, observedAt: string): MissionCommand['sourceTruth'][number] {
  return {
    id: `mission-command-input:${commandId}`,
    origin: 'manual',
    role: 'primary',
    policyKey: 'manual_user_state',
    authority: 'ECS Mission Command operator input',
    authorityKind: 'user',
    observedAt,
    confidence: 'high',
    coverage: 'complete',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: ['manual_operator_command'],
  };
}

function invalid<Field extends MissionCommandComposerIssue['field']>(
  field: Field,
  message: string,
): { ok: false; issue: MissionCommandComposerIssue } {
  return { ok: false, issue: { field, message } };
}

function uniqueIssues(issues: MissionCommandComposerIssue[]): MissionCommandComposerIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.field}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => bounded(value, 180)).filter(Boolean))];
}

function sameStringSet(left: string[], right: string[]): boolean {
  const leftValues = unique(left).sort();
  const rightValues = unique(right).sort();
  return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
}

function bounded(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function cleanToken(value: unknown): string {
  return bounded(value, 120).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
