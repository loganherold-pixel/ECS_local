import type { MissionCommandComposerForm, MissionCommandComposerType } from './dispatchMissionCommandComposer';
import {
  createMissionCommandEvent,
  normalizePersistedMissionCommand,
} from './dispatchMissionCommandDomain';
import { createDispatchIdempotencyKey } from './dispatchIntegrity';
import type {
  MissionCommand,
  MissionCommandActor,
  MissionCommandMutationResult,
} from './dispatchMissionCommandTypes';
import type { DispatchPriority } from './dispatchTypes';

export type SoloMissionCommandTemplateId =
  | 'personal_action'
  | 'camp_diversion'
  | 'resource_review'
  | 'weather_recheck'
  | 'route_decision'
  | 'comms_plan_review';

export interface SoloMissionCommandTemplate {
  id: SoloMissionCommandTemplateId;
  label: string;
  type: MissionCommandComposerType;
  priority: DispatchPriority;
  title: string;
  instructions: string;
  deadlineMinutes: number | null;
}

export const SOLO_MISSION_COMMAND_TEMPLATES: readonly SoloMissionCommandTemplate[] = [
  {
    id: 'personal_action',
    label: 'Personal Action',
    type: 'general',
    priority: 'normal',
    title: 'Personal Field Action',
    instructions: 'Record the field action, complete it locally, and add a manual status note when finished.',
    deadlineMinutes: null,
  },
  {
    id: 'camp_diversion',
    label: 'Camp Diversion',
    type: 'route',
    priority: 'high',
    title: 'Review Camp Diversion',
    instructions: 'Review the current CampOps endpoint, arrival margin, and available alternatives. Record a decision; do not change camp automatically.',
    deadlineMinutes: 60,
  },
  {
    id: 'resource_review',
    label: 'Fuel / Water / Power',
    type: 'resource',
    priority: 'normal',
    title: 'Review Fuel, Water, And Power',
    instructions: 'Review current fuel, water, and power source states. Record missing or manual values before deciding whether the plan needs attention.',
    deadlineMinutes: 45,
  },
  {
    id: 'weather_recheck',
    label: 'Weather Recheck',
    type: 'hazard',
    priority: 'normal',
    title: 'Recheck Weather Conditions',
    instructions: 'Review the latest available weather source, its freshness, and any current advisories. Do not treat cached data as live.',
    deadlineMinutes: 60,
  },
  {
    id: 'route_decision',
    label: 'Route Decision',
    type: 'route',
    priority: 'high',
    title: 'Review Route Decision',
    instructions: 'Review active guidance, route evidence, access state, and current conditions. Record the decision; do not replace guidance automatically.',
    deadlineMinutes: 30,
  },
  {
    id: 'comms_plan_review',
    label: 'Comms Plan',
    type: 'check_in',
    priority: 'normal',
    title: 'Review Manual Comms Plan',
    instructions: 'Review the saved communication procedures and contact plan. ECS will not call, message, or contact anyone automatically.',
    deadlineMinutes: 30,
  },
];

export function applySoloMissionCommandTemplate(
  form: MissionCommandComposerForm,
  templateId: SoloMissionCommandTemplateId,
): MissionCommandComposerForm {
  const template = SOLO_MISSION_COMMAND_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return form;
  const deadlineMinutes = template.deadlineMinutes == null ? '30' : String(template.deadlineMinutes);
  return {
    ...form,
    type: template.type,
    priority: template.priority,
    title: template.title,
    instructions: template.instructions,
    targetKind: 'self',
    targetMemberId: '',
    selectedMemberIds: [],
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
    deadlineMode: template.deadlineMinutes == null ? 'none' : 'relative',
    relativeDeadlineMinutes: deadlineMinutes,
    missionClockMinutes: deadlineMinutes,
    milestoneId: '',
  };
}

/**
 * Converts one persisted personal action into a reviewable team draft in place.
 * The command ID is preserved and delivery remains local until a separate send action occurs.
 */
export function prepareSoloMissionCommandForTeam(input: {
  command: MissionCommand;
  actor: MissionCommandActor;
  teamMemberIds: readonly string[];
  occurredAt?: string;
}): MissionCommandMutationResult {
  const { command } = input;
  if (command.target.kind !== 'solo') {
    return { ok: true, changed: false, command, event: null };
  }
  const soloMemberId = command.target.memberId;
  if (isTerminal(command.operationalState)) {
    return invalid(command, 'Completed or cancelled personal actions cannot be prepared as team commands.');
  }
  const otherMemberIds = uniqueIds(input.teamMemberIds).filter((id) => id !== soloMemberId);
  if (otherMemberIds.length === 0) {
    return invalid(command, 'At least one other expedition member is required to prepare a team command.');
  }
  const targetMemberIds = uniqueIds([soloMemberId, ...otherMemberIds]);
  const occurredAt = validIso(input.occurredAt) ?? new Date().toISOString();
  const candidate: MissionCommand = {
    ...command,
    version: command.version + 1,
    target: {
      kind: 'team',
      memberIds: targetMemberIds,
      label: 'Expedition team',
    },
    assignment: undefined,
    acknowledgmentPolicy: {
      mode: 'all',
      targetMemberIds: otherMemberIds,
    },
    operationalState: teamDraftOperationalState(command.operationalState),
    deliveryState: 'local',
    acknowledgmentState: 'pending',
    acknowledgments: [],
    updatedAt: occurredAt,
  };
  const nextCommand = normalizePersistedMissionCommand(candidate);
  if (!nextCommand) return invalid(command, 'The team command draft failed canonical validation.');
  const idempotencyKey = createDispatchIdempotencyKey({
    expeditionId: command.expeditionId,
    entityType: 'mission_command_event',
    actionType: 'prepare_team_draft',
    actorMemberId: input.actor.id,
    sourceEntityId: command.id,
    targetMemberIds: otherMemberIds,
  });
  return {
    ok: true,
    changed: true,
    command: nextCommand,
    event: createMissionCommandEvent({
      command: nextCommand,
      type: 'staged',
      actor: input.actor,
      occurredAt,
      summary: 'Personal action prepared as a local team command draft. No delivery has been claimed.',
      idempotencyKey,
      metadata: { reasonCode: 'solo_command_team_draft' },
    }),
  };
}

function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function validIso(value: string | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function isTerminal(state: MissionCommand['operationalState']): boolean {
  return state === 'resolved' || state === 'cancelled' || state === 'expired';
}

function teamDraftOperationalState(
  state: MissionCommand['operationalState'],
): MissionCommand['operationalState'] {
  if (state === 'proposed' || state === 'ready' || state === 'blocked') return state;
  return 'blocked';
}

function invalid(command: MissionCommand, reason: string): MissionCommandMutationResult {
  return { ok: false, changed: false, command, event: null, reason };
}
