import { createConvoyRegroupDispatchContext } from './convoy/convoyRegroupPlannerAdapter';
import type { ConvoyRegroupPlannerResult } from './convoy/convoyRegroupPlanner';
import type {
  ReportIncidentInput,
  ReportIncidentResourceState,
  ReportIncidentSafetyState,
} from './incidentRecoveryWorkflowStore';
import { buildConvoyLocationSourceTruthBinding } from './sourceTruthAdapters';
import {
  evaluateMissionClockDeadline,
  type MissionClockDeadlineStatus,
} from './dispatchMissionClock';
import { sanitizeMissionCommandLinkedContext } from './dispatchMissionCommandDomain';
import type {
  MissionCommand,
  MissionCommandActor,
  MissionCommandEvent,
} from './dispatchMissionCommandTypes';
import {
  createOperationalPlaybookInstance,
  type CreateOperationalPlaybookInstanceInput,
} from './dispatchOperationalPlaybookDomain';
import {
  OPERATIONAL_PLAYBOOK_SCHEMA_VERSION,
  type OperationalPlaybookDefinition,
  type OperationalPlaybookInputState,
  type OperationalPlaybookInputValue,
  type OperationalPlaybookInstance,
} from './dispatchOperationalPlaybookTypes';
import type { DispatchLinkedContext } from './dispatchTypes';
import {
  evaluateSourceTruthRef,
  sanitizeSourceTruthDisplayText,
  sanitizeSourceTruthRef,
  type SourceTruthFreshness,
  type SourceTruthRef,
} from './sourceTruth';

export const LOST_COMMUNICATIONS_PLAYBOOK_ID = 'lost_communications';
export const LOST_COMMUNICATIONS_PLAYBOOK_VERSION = 1;
export const LOST_COMMUNICATIONS_DEFAULT_REVIEW_MINUTES = 15;

export const LOST_COMMUNICATIONS_STEP_IDS = {
  reviewContext: 'review-last-verified-context',
  verifyFreshness: 'verify-location-freshness',
  directCheckIn: 'propose-direct-check-in',
  notifyLeadSweep: 'propose-lead-sweep-notification',
  reviewRally: 'review-rally-or-bailout',
  startDeadline: 'start-no-response-deadline',
  recordAttempts: 'record-communication-attempts',
  recordOutcome: 'record-resolution-outcome',
  confirmOutcome: 'confirm-resolution-outcome',
  resolve: 'resolve-lost-communications',
} as const;

export const LOST_COMMUNICATIONS_INPUT_KEYS = {
  memberIdentity: 'member_identity',
  memberRole: 'member_role',
  memberStatusContext: 'member_status_context',
  lastVerifiedPosition: 'last_verified_position',
  positionAgeMs: 'position_age_ms',
  positionAccuracyM: 'position_accuracy_m',
  lastCheckInAt: 'last_check_in_at',
  lastAcknowledgmentAt: 'last_acknowledgment_at',
  lastCommandReceiptAt: 'last_command_receipt_at',
  routeContext: 'route_context',
  leadMemberId: 'lead_member_id',
  sweepMemberId: 'sweep_member_id',
  rallyOrBailoutContext: 'rally_or_bailout_context',
  connectivityState: 'connectivity_state',
  currentTime: 'current_time',
  commsPlan: 'expedition_comms_plan',
  noResponseDeadline: 'no_response_deadline',
  communicationAttempts: 'communication_attempts',
} as const;

export type LostCommunicationsResolutionOutcome =
  | 'member_responded'
  | 'delayed_but_safe'
  | 'regroup_requested'
  | 'assistance_requested'
  | 'command_cancelled'
  | 'escalate_for_operator_review';

export type LostCommunicationsPositionState =
  | SourceTruthFreshness
  | 'restricted'
  | 'missing';

export interface LostCommunicationsMemberInput {
  id: string;
  label: string;
  roleId?: string | null;
  observedAt?: string | null;
  sourceTruth?: SourceTruthRef[];
}

export interface LostCommunicationsPositionInput {
  latitude: number;
  longitude: number;
  capturedAt: string;
  accuracyMeters?: number | null;
  sourceLabel?: string | null;
  offline?: boolean;
}

export interface LostCommunicationsCreateInput {
  expeditionId: string;
  actor: MissionCommandActor;
  member: LostCommunicationsMemberInput;
  soloMode: boolean;
  online: boolean;
  locationPermissionAllowed: boolean;
  positionSharingEnabled: boolean;
  position?: LostCommunicationsPositionInput | null;
  lastCheckInAt?: string | null;
  lastAcknowledgmentAt?: string | null;
  lastCommandReceiptAt?: string | null;
  routeContext?: DispatchLinkedContext | null;
  leadMemberId?: string | null;
  sweepMemberId?: string | null;
  rallyOrBailoutContext?: DispatchLinkedContext | null;
  expeditionCommsPlan?: string | null;
  reviewMinutes?: number;
  now?: string | number | Date;
  idempotencyKey?: string;
}

export type CreateLostCommunicationsResult =
  | { ok: true; instance: OperationalPlaybookInstance }
  | { ok: false; safeCode: string; reason: string };

export interface LostCommunicationsCommandStatus {
  commandId: string | null;
  deliveryState: MissionCommand['deliveryState'] | 'not_created';
  acknowledgmentState: MissionCommand['acknowledgmentState'] | 'not_requested';
  acknowledged: boolean;
  queuedOffline: boolean;
}

export interface LostCommunicationsMemberHistory {
  lastCheckInAt: string | null;
  lastAcknowledgmentAt: string | null;
  lastCommandReceiptAt: string | null;
}

export interface LostCommunicationsContextReview {
  memberId: string | null;
  memberLabel: string;
  roleLabel: string;
  lastVerifiedStatus: string;
  positionState: LostCommunicationsPositionState;
  positionText: string;
  positionAgeMs: number | null;
  accuracyMeters: number | null;
  lastCheckInAt: string | null;
  lastAcknowledgmentAt: string | null;
  lastCommandReceiptAt: string | null;
  routeLabel: string;
  rallyOrBailoutLabel: string;
  leadAvailable: boolean;
  sweepAvailable: boolean;
  connectivityLabel: string;
  commsPlan: string | null;
  missingFields: string[];
  movementStatement: 'Movement is not inferred from the last verified position.';
  directCheckIn: LostCommunicationsCommandStatus;
}

export type LostCommunicationsIncidentHandoffResult =
  | { ok: true; prefill: ReportIncidentInput }
  | { ok: false; safeCode: string; reason: string };

const stepBase = (
  id: string,
  type: OperationalPlaybookDefinition['steps'][number]['type'],
  input: {
    title: string;
    instructions: string;
    requiredInputKeys?: string[];
    requiredPermissions?: OperationalPlaybookDefinition['requiredPermissions'];
    dependsOnStepIds?: string[];
    skippable?: boolean;
  },
) => ({
  id,
  type,
  title: input.title,
  instructions: input.instructions,
  requiredInputKeys: input.requiredInputKeys ?? [],
  requiredPermissions: input.requiredPermissions ?? ['view_dispatch'],
  dependsOnStepIds: input.dependsOnStepIds ?? [],
  skippable: input.skippable ?? false,
});

export const LOST_COMMUNICATIONS_PLAYBOOK_DEFINITION: OperationalPlaybookDefinition = {
  schemaVersion: OPERATIONAL_PLAYBOOK_SCHEMA_VERSION,
  id: LOST_COMMUNICATIONS_PLAYBOOK_ID,
  version: LOST_COMMUNICATIONS_PLAYBOOK_VERSION,
  title: 'Lost Communications',
  description: 'Coordinate an ECS team response when a member or vehicle has not checked in or is unreachable.',
  supportedScenario: 'lost_communications',
  requiredCapabilities: [
    'mission_command',
    'mission_clock',
    'linked_context',
    'acknowledgment',
    'offline_operation',
  ],
  requiredPermissions: ['view_dispatch'],
  requiredInputs: [
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.memberIdentity, 'Member', 'Member or vehicle operator being reviewed.', 'member_id'),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.memberStatusContext, 'Last verified status', 'Safe member status context without inferred movement.', 'linked_context', { allowStale: true }),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.connectivityState, 'Connectivity', 'Current known Dispatch delivery connectivity.', 'text'),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.currentTime, 'Current time', 'Absolute ECS time used for deadline calculations.', 'timestamp'),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.noResponseDeadline, 'No-response review', 'Absolute time for the next operator decision.', 'timestamp', { allowStale: true }),
  ],
  optionalInputs: [
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.memberRole, 'Role', 'Known expedition or convoy role.', 'role_id', { allowStale: true }),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.lastVerifiedPosition, 'Last verified position', 'Permitted member position with source age and accuracy.', 'linked_context', { policyKey: 'convoy_member_location', allowStale: true }),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.positionAgeMs, 'Position age', 'Age of the last verified position in milliseconds.', 'number', { policyKey: 'convoy_member_location', allowStale: true }),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.positionAccuracyM, 'Position accuracy', 'Reported GPS accuracy in meters.', 'number', { policyKey: 'convoy_member_location', allowStale: true }),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.lastCheckInAt, 'Last check-in', 'Last known check-in time.', 'timestamp', { allowStale: true }),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.lastAcknowledgmentAt, 'Last acknowledgment', 'Last known command acknowledgment time.', 'timestamp', { allowStale: true }),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.lastCommandReceiptAt, 'Last command receipt', 'Last known command delivery or receipt time.', 'timestamp', { allowStale: true }),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.routeContext, 'Route context', 'Active route or segment associated with the member.', 'linked_context', { allowStale: true }),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.leadMemberId, 'Convoy lead', 'Available convoy lead member.', 'member_id', { allowStale: true }),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.sweepMemberId, 'Convoy sweep', 'Available convoy sweep member.', 'member_id', { allowStale: true }),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.rallyOrBailoutContext, 'Rally or bailout', 'Next known operator-reviewed rally, bailout, or camp context.', 'linked_context', { allowStale: true }),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.commsPlan, 'Communications plan', 'Manual expedition communications and external emergency guidance.', 'text', { allowManual: true, allowStale: true }),
    inputRequirement(LOST_COMMUNICATIONS_INPUT_KEYS.communicationAttempts, 'Communication attempts', 'Operator-recorded contact attempts and results.', 'text', { allowManual: true, allowStale: true }),
  ],
  steps: [
    {
      ...stepBase(LOST_COMMUNICATIONS_STEP_IDS.reviewContext, 'review_context', {
        title: 'Review Last Verified Context',
        instructions: 'Review source state, age, accuracy, route context, delivery state, and every missing field. Do not infer movement.',
        requiredInputKeys: [LOST_COMMUNICATIONS_INPUT_KEYS.memberStatusContext],
      }),
      type: 'review_context',
      contextInputKey: LOST_COMMUNICATIONS_INPUT_KEYS.memberStatusContext,
    },
    {
      ...stepBase(LOST_COMMUNICATIONS_STEP_IDS.verifyFreshness, 'confirm_action', {
        title: 'Verify Stale Versus Current',
        instructions: 'Confirm the displayed freshness state. A stale or expired position remains last verified, never live.',
        dependsOnStepIds: [LOST_COMMUNICATIONS_STEP_IDS.reviewContext],
      }),
      type: 'confirm_action',
      confirmationLabel: 'Freshness reviewed without inferring movement',
    },
    {
      ...stepBase(LOST_COMMUNICATIONS_STEP_IDS.directCheckIn, 'create_command_proposal', {
        title: 'Propose Direct Check-In',
        instructions: 'Prepare a direct check-in command for operator review. Preparing or confirming this proposal does not send it.',
        requiredInputKeys: [LOST_COMMUNICATIONS_INPUT_KEYS.memberIdentity],
        requiredPermissions: ['send_individual_ping'],
        dependsOnStepIds: [LOST_COMMUNICATIONS_STEP_IDS.verifyFreshness],
      }),
      type: 'create_command_proposal',
      proposal: {
        type: 'check_in',
        priority: 'high',
        title: 'Direct Check-In Requested',
        instructions: 'Confirm status and current safe context when able. ECS team coordination only.',
        targetFromInputs: {
          kind: 'member',
          inputKeys: [LOST_COMMUNICATIONS_INPUT_KEYS.memberIdentity],
          label: 'Unreachable member',
        },
        acknowledgmentFromTarget: { mode: 'all' },
        linkedContextInputKey: LOST_COMMUNICATIONS_INPUT_KEYS.memberStatusContext,
        deadlineInputKey: LOST_COMMUNICATIONS_INPUT_KEYS.noResponseDeadline,
      },
    },
    {
      ...stepBase(LOST_COMMUNICATIONS_STEP_IDS.notifyLeadSweep, 'create_command_proposal', {
        title: 'Propose Lead And Sweep Notification',
        instructions: 'Prepare a coordination notice for the available lead and sweep. Skip with a reason when neither role is available.',
        requiredPermissions: ['send_individual_ping'],
        dependsOnStepIds: [LOST_COMMUNICATIONS_STEP_IDS.directCheckIn],
        skippable: true,
      }),
      type: 'create_command_proposal',
      proposal: {
        type: 'general',
        priority: 'high',
        title: 'Lost Communications Review',
        instructions: 'Review the member status and coordinate only through the current ECS communications plan. No external transmission is automatic.',
        targetFromInputs: {
          kind: 'team',
          inputKeys: [
            LOST_COMMUNICATIONS_INPUT_KEYS.leadMemberId,
            LOST_COMMUNICATIONS_INPUT_KEYS.sweepMemberId,
          ],
          label: 'Convoy lead and sweep',
          minimumTargets: 1,
        },
        acknowledgmentFromTarget: { mode: 'any' },
        linkedContextInputKey: LOST_COMMUNICATIONS_INPUT_KEYS.memberStatusContext,
      },
    },
    {
      ...stepBase(LOST_COMMUNICATIONS_STEP_IDS.reviewRally, 'open_context', {
        title: 'Review Rally Or Bailout',
        instructions: 'Open the next known rally, bailout, or camp context. Reviewing it does not select it or change guidance.',
        requiredInputKeys: [LOST_COMMUNICATIONS_INPUT_KEYS.rallyOrBailoutContext],
        dependsOnStepIds: [LOST_COMMUNICATIONS_STEP_IDS.notifyLeadSweep],
        skippable: true,
      }),
      type: 'open_context',
      contextInputKey: LOST_COMMUNICATIONS_INPUT_KEYS.rallyOrBailoutContext,
    },
    {
      ...stepBase(LOST_COMMUNICATIONS_STEP_IDS.startDeadline, 'start_deadline', {
        title: 'Start No-Response Review Deadline',
        instructions: 'Start the persisted absolute review deadline. Expiry requests an operator decision and sends nothing automatically.',
        requiredInputKeys: [LOST_COMMUNICATIONS_INPUT_KEYS.noResponseDeadline],
        dependsOnStepIds: [LOST_COMMUNICATIONS_STEP_IDS.reviewRally],
      }),
      type: 'start_deadline',
      deadlineSource: 'no_response_review',
      warningWindowMs: 10 * 60_000,
      criticalWindowMs: 2 * 60_000,
    },
    {
      ...stepBase(LOST_COMMUNICATIONS_STEP_IDS.recordAttempts, 'request_input', {
        title: 'Record Communication Attempts',
        instructions: 'Record attempted channels, times, and known results. Unknown results remain unknown.',
        dependsOnStepIds: [LOST_COMMUNICATIONS_STEP_IDS.startDeadline],
      }),
      type: 'request_input',
      inputKey: LOST_COMMUNICATIONS_INPUT_KEYS.communicationAttempts,
    },
    {
      ...stepBase(LOST_COMMUNICATIONS_STEP_IDS.recordOutcome, 'record_decision', {
        title: 'Record Operator Outcome',
        instructions: 'Choose one supported resolution outcome. Incident review and regroup remain explicit operator choices.',
        dependsOnStepIds: [LOST_COMMUNICATIONS_STEP_IDS.recordAttempts],
      }),
      type: 'record_decision',
      decisionKey: 'lost_communications_resolution',
    },
    {
      ...stepBase(LOST_COMMUNICATIONS_STEP_IDS.confirmOutcome, 'confirm_action', {
        title: 'Confirm Resolution',
        instructions: 'Confirm the recorded outcome before completing this playbook.',
        dependsOnStepIds: [LOST_COMMUNICATIONS_STEP_IDS.recordOutcome],
      }),
      type: 'confirm_action',
      confirmationLabel: 'Confirm the operator-selected Lost Communications outcome',
    },
    {
      ...stepBase(LOST_COMMUNICATIONS_STEP_IDS.resolve, 'resolve', {
        title: 'Resolve Playbook',
        instructions: 'Close this coordination workflow and retain the deterministic timeline.',
        dependsOnStepIds: [LOST_COMMUNICATIONS_STEP_IDS.confirmOutcome],
      }),
      type: 'resolve',
    },
  ],
  completionRules: {
    mode: 'explicit_resolve',
    resolveStepId: LOST_COMMUNICATIONS_STEP_IDS.resolve,
    prerequisiteStepIds: [LOST_COMMUNICATIONS_STEP_IDS.recordOutcome, LOST_COMMUNICATIONS_STEP_IDS.confirmOutcome],
  },
  cancellationRules: {
    allowedStates: ['draft', 'ready', 'active', 'paused', 'blocked'],
    requireReason: true,
  },
  safetyScope: 'ecs_team_coordination_only',
};

export function createLostCommunicationsPlaybook(
  input: LostCommunicationsCreateInput,
): CreateLostCommunicationsResult {
  if (input.soloMode) {
    return { ok: false, safeCode: 'lost_comms_solo_not_applicable', reason: 'Lost Communications requires another expedition member or vehicle.' };
  }
  if (!safeId(input.expeditionId) || !safeId(input.member.id) || !safeId(input.actor.id)) {
    return { ok: false, safeCode: 'lost_comms_context_invalid', reason: 'Expedition, actor, or member identity is invalid.' };
  }
  if (input.member.id === input.actor.id) {
    return { ok: false, safeCode: 'lost_comms_self_not_applicable', reason: 'Lost Communications cannot target the current operator.' };
  }
  const now = normalizeIso(input.now) ?? new Date().toISOString();
  const memberLabel = safeText(input.member.label, 160) || 'Expedition member';
  const memberSources = normalizeSources(input.member.sourceTruth?.length
    ? input.member.sourceTruth
    : [rosterSource(input.member, now)]);
  const positionValue = createPositionInputValue(input, now);
  const statusContext = createMemberStatusContext(input, memberLabel, memberSources, positionValue, now);
  const noResponseDueAt = createLostCommunicationsNoResponseDueAt(now, input.reviewMinutes);
  const clockSource = sanitizeSourceTruthRef({
    ...ecsSource('lost-comms-clock', now, 'ECS Mission Clock', 'inferred'),
    policyKey: 'manual_user_state',
    warningCodes: ['absolute_time_snapshot'],
  });
  const inputs: OperationalPlaybookInputValue[] = [
    scalarInput(LOST_COMMUNICATIONS_INPUT_KEYS.memberIdentity, 'member_id', input.member.id, memberSources, input.actor, now),
    linkedInput(LOST_COMMUNICATIONS_INPUT_KEYS.memberStatusContext, statusContext, 'available', memberSources, input.actor, now),
    scalarInput(LOST_COMMUNICATIONS_INPUT_KEYS.connectivityState, 'text', input.online ? 'online' : 'offline', [ecsSource('lost-comms-connectivity', now, 'ECS connectivity state', 'inferred')], input.actor, now),
    scalarInput(LOST_COMMUNICATIONS_INPUT_KEYS.currentTime, 'timestamp', now, [clockSource], input.actor, now),
    scalarInput(LOST_COMMUNICATIONS_INPUT_KEYS.noResponseDeadline, 'timestamp', noResponseDueAt, [clockSource], input.actor, now),
  ];
  if (input.member.roleId && safeId(input.member.roleId)) {
    inputs.push(scalarInput(LOST_COMMUNICATIONS_INPUT_KEYS.memberRole, 'role_id', input.member.roleId, memberSources, input.actor, now));
  }
  inputs.push(positionValue);
  const positionAge = positionAgeFromValue(positionValue, now);
  if (positionAge != null) {
    inputs.push(scalarInput(LOST_COMMUNICATIONS_INPUT_KEYS.positionAgeMs, 'number', positionAge, positionValue.sourceTruth, input.actor, now, positionValue.state));
  }
  const accuracy = input.position?.accuracyMeters;
  if (typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 && positionValue.state !== 'restricted') {
    inputs.push(scalarInput(LOST_COMMUNICATIONS_INPUT_KEYS.positionAccuracyM, 'number', accuracy, positionValue.sourceTruth, input.actor, now, positionValue.state));
  }
  appendTimestampInput(inputs, LOST_COMMUNICATIONS_INPUT_KEYS.lastCheckInAt, input.lastCheckInAt, memberSources, input.actor, now);
  appendTimestampInput(inputs, LOST_COMMUNICATIONS_INPUT_KEYS.lastAcknowledgmentAt, input.lastAcknowledgmentAt, memberSources, input.actor, now);
  appendTimestampInput(inputs, LOST_COMMUNICATIONS_INPUT_KEYS.lastCommandReceiptAt, input.lastCommandReceiptAt, memberSources, input.actor, now);
  appendContextInput(inputs, LOST_COMMUNICATIONS_INPUT_KEYS.routeContext, input.routeContext, input.actor, now);
  appendMemberInput(inputs, LOST_COMMUNICATIONS_INPUT_KEYS.leadMemberId, input.leadMemberId, input.actor, now, memberSources);
  appendMemberInput(inputs, LOST_COMMUNICATIONS_INPUT_KEYS.sweepMemberId, input.sweepMemberId, input.actor, now, memberSources);
  appendContextInput(inputs, LOST_COMMUNICATIONS_INPUT_KEYS.rallyOrBailoutContext, input.rallyOrBailoutContext, input.actor, now);
  if (safeText(input.expeditionCommsPlan, 1_000)) {
    inputs.push(scalarInput(
      LOST_COMMUNICATIONS_INPUT_KEYS.commsPlan,
      'text',
      safeText(input.expeditionCommsPlan, 1_000),
      [ecsSource('lost-comms-plan', now, 'Expedition communications plan', 'manual')],
      input.actor,
      now,
      'available',
      true,
    ));
  }
  const createInput: CreateOperationalPlaybookInstanceInput = {
    expeditionId: input.expeditionId,
    actor: input.actor,
    inputs,
    sourceTruth: normalizeSources([...memberSources, ...positionValue.sourceTruth, clockSource]),
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    online: input.online,
  };
  try {
    return { ok: true, instance: createOperationalPlaybookInstance(LOST_COMMUNICATIONS_PLAYBOOK_DEFINITION, createInput) };
  } catch {
    return { ok: false, safeCode: 'lost_comms_instance_invalid', reason: 'Lost Communications context could not be validated.' };
  }
}

export function createLostCommunicationsNoResponseDueAt(
  now: string | number | Date,
  reviewMinutes = LOST_COMMUNICATIONS_DEFAULT_REVIEW_MINUTES,
): string {
  const nowIso = normalizeIso(now) ?? new Date().toISOString();
  const boundedMinutes = Number.isFinite(reviewMinutes)
    ? Math.max(1, Math.min(24 * 60, Math.round(reviewMinutes)))
    : LOST_COMMUNICATIONS_DEFAULT_REVIEW_MINUTES;
  return new Date(Date.parse(nowIso) + boundedMinutes * 60_000).toISOString();
}

export function createLostCommunicationsCommunicationAttemptInput(input: {
  summary: string;
  actor: MissionCommandActor;
  occurredAt?: string | number | Date;
}): OperationalPlaybookInputValue | null {
  const summary = safeText(input.summary, 1_000);
  if (!summary) return null;
  const occurredAt = normalizeIso(input.occurredAt) ?? new Date().toISOString();
  return scalarInput(
    LOST_COMMUNICATIONS_INPUT_KEYS.communicationAttempts,
    'text',
    summary,
    [ecsSource(`lost-comms-attempt:${occurredAt}`, occurredAt, 'ECS operator', 'manual')],
    input.actor,
    occurredAt,
    'available',
    true,
  );
}

export function selectLostCommunicationsContextReview(input: {
  instance: OperationalPlaybookInstance;
  commands?: MissionCommand[];
  now?: string | number | Date;
}): LostCommunicationsContextReview {
  const { instance } = input;
  const now = normalizeIso(input.now) ?? new Date().toISOString();
  const memberId = scalarString(instance, LOST_COMMUNICATIONS_INPUT_KEYS.memberIdentity);
  const memberContext = linkedContext(instance, LOST_COMMUNICATIONS_INPUT_KEYS.memberStatusContext);
  const positionValue = instance.inputSnapshot[LOST_COMMUNICATIONS_INPUT_KEYS.lastVerifiedPosition];
  const position = positionValue?.linkedContext;
  const positionState = resolvePositionState(positionValue, now);
  const coordinates = positionState !== 'restricted' ? position?.coordinates : undefined;
  const positionText = coordinates
    ? `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`
    : positionState === 'restricted'
      ? safeText(position?.subtitle, 180) || 'Restricted member location'
      : 'No verified position available';
  const positionAgeMs = scalarNumber(instance, LOST_COMMUNICATIONS_INPUT_KEYS.positionAgeMs)
    ?? positionAgeFromValue(positionValue, now);
  const accuracyMeters = scalarNumber(instance, LOST_COMMUNICATIONS_INPUT_KEYS.positionAccuracyM);
  const lastCheckInAt = scalarTimestamp(instance, LOST_COMMUNICATIONS_INPUT_KEYS.lastCheckInAt);
  const lastAcknowledgmentAt = scalarTimestamp(instance, LOST_COMMUNICATIONS_INPUT_KEYS.lastAcknowledgmentAt);
  const lastCommandReceiptAt = scalarTimestamp(instance, LOST_COMMUNICATIONS_INPUT_KEYS.lastCommandReceiptAt);
  const route = linkedContext(instance, LOST_COMMUNICATIONS_INPUT_KEYS.routeContext);
  const rally = linkedContext(instance, LOST_COMMUNICATIONS_INPUT_KEYS.rallyOrBailoutContext);
  const leadAvailable = Boolean(scalarString(instance, LOST_COMMUNICATIONS_INPUT_KEYS.leadMemberId));
  const sweepAvailable = Boolean(scalarString(instance, LOST_COMMUNICATIONS_INPUT_KEYS.sweepMemberId));
  const missingFields: string[] = [];
  if (positionState === 'missing' || positionState === 'unavailable') missingFields.push('last verified position');
  if (!lastCheckInAt) missingFields.push('last check-in');
  if (!lastAcknowledgmentAt) missingFields.push('last acknowledgment');
  if (!lastCommandReceiptAt) missingFields.push('last command receipt');
  if (!route) missingFields.push('route or segment');
  if (!leadAvailable) missingFields.push('convoy lead');
  if (!sweepAvailable) missingFields.push('convoy sweep');
  if (!rally) missingFields.push('rally, bailout, or camp');
  return {
    memberId,
    memberLabel: memberContext?.title ?? 'Expedition member',
    roleLabel: scalarString(instance, LOST_COMMUNICATIONS_INPUT_KEYS.memberRole) ?? 'Unknown role',
    lastVerifiedStatus: positionStateLabel(positionState),
    positionState,
    positionText,
    positionAgeMs,
    accuracyMeters,
    lastCheckInAt,
    lastAcknowledgmentAt,
    lastCommandReceiptAt,
    routeLabel: route?.title ?? 'Unknown route or segment',
    rallyOrBailoutLabel: rally?.title ?? 'No verified rally, bailout, or camp context',
    leadAvailable,
    sweepAvailable,
    connectivityLabel: scalarString(instance, LOST_COMMUNICATIONS_INPUT_KEYS.connectivityState) ?? 'unknown',
    commsPlan: scalarString(instance, LOST_COMMUNICATIONS_INPUT_KEYS.commsPlan),
    missingFields,
    movementStatement: 'Movement is not inferred from the last verified position.',
    directCheckIn: selectLostCommunicationsDirectCheckIn(instance, input.commands ?? []),
  };
}

export function selectLostCommunicationsDirectCheckIn(
  instance: OperationalPlaybookInstance,
  commands: MissionCommand[],
): LostCommunicationsCommandStatus {
  const proposal = instance.commandProposals.find((candidate) => candidate.stepId === LOST_COMMUNICATIONS_STEP_IDS.directCheckIn);
  const correlationId = proposal ? `mission-command-proposal:${proposal.id}` : null;
  const command = proposal
    ? commands.find((candidate) => candidate.id === proposal.commandId || candidate.audit.correlationId === correlationId)
    : undefined;
  return {
    commandId: command?.id ?? null,
    deliveryState: command?.deliveryState ?? 'not_created',
    acknowledgmentState: command?.acknowledgmentState ?? 'not_requested',
    acknowledged: command?.acknowledgmentState === 'complete' || command?.acknowledgmentState === 'partial',
    queuedOffline: command?.deliveryState === 'queued',
  };
}

export function selectLostCommunicationsMemberHistory(input: {
  memberId: string;
  commands: MissionCommand[];
  events: MissionCommandEvent[];
}): LostCommunicationsMemberHistory {
  const memberCommands = input.commands.filter((command) => missionCommandTargetsMember(command, input.memberId));
  const commandIds = new Set(memberCommands.map((command) => command.id));
  const acknowledgments = memberCommands.flatMap((command) => command.acknowledgments)
    .filter((acknowledgment) => acknowledgment.memberId === input.memberId);
  const checkIns = memberCommands.filter((command) => command.type === 'check_in')
    .flatMap((command) => command.acknowledgments)
    .filter((acknowledgment) => acknowledgment.memberId === input.memberId);
  const receiptEvents = input.events.filter((event) => (
    commandIds.has(event.commandId) && event.type === 'delivered'
  ));
  return {
    lastCheckInAt: latestIso(checkIns.map((item) => item.respondedAt)),
    lastAcknowledgmentAt: latestIso(acknowledgments.map((item) => item.respondedAt)),
    lastCommandReceiptAt: latestIso(receiptEvents.map((event) => event.occurredAt)),
  };
}

export function selectLostCommunicationsSuggestedOutcome(
  instance: OperationalPlaybookInstance,
  commands: MissionCommand[],
): LostCommunicationsResolutionOutcome | null {
  return selectLostCommunicationsDirectCheckIn(instance, commands).acknowledged
    ? 'member_responded'
    : null;
}

export function validateLostCommunicationsResolutionOutcome(input: {
  instance: OperationalPlaybookInstance;
  outcome: LostCommunicationsResolutionOutcome;
  explicitOperatorChoice: boolean;
  now?: string | number | Date;
}): { allowed: boolean; safeCode: string; reason: string } {
  if (input.instance.definitionId !== LOST_COMMUNICATIONS_PLAYBOOK_ID) {
    return { allowed: false, safeCode: 'lost_comms_instance_mismatch', reason: 'This is not a Lost Communications playbook.' };
  }
  if (!isLostCommunicationsResolutionOutcome(input.outcome)) {
    return { allowed: false, safeCode: 'lost_comms_outcome_invalid', reason: 'Resolution outcome is unsupported.' };
  }
  if (!input.explicitOperatorChoice) {
    return { allowed: false, safeCode: 'lost_comms_operator_confirmation_required', reason: 'An explicit operator choice is required.' };
  }
  if (input.outcome === 'escalate_for_operator_review') {
    const status = selectNoResponseDeadlineStatus(input.instance, input.now);
    if (status !== 'due' && status !== 'overdue') {
      return { allowed: false, safeCode: 'lost_comms_review_deadline_pending', reason: 'Operator escalation is available when the no-response review is due.' };
    }
  }
  return { allowed: true, safeCode: 'lost_comms_outcome_allowed', reason: 'Operator-selected outcome is valid.' };
}

export function selectLostCommunicationsRecordedOutcome(
  instance: OperationalPlaybookInstance,
): LostCommunicationsResolutionOutcome | null {
  const result = [...instance.stepResults].reverse().find((candidate) => (
    candidate.stepId === LOST_COMMUNICATIONS_STEP_IDS.recordOutcome &&
    candidate.data.kind === 'decision_recorded'
  ));
  if (!result || result.data.kind !== 'decision_recorded') return null;
  return isLostCommunicationsResolutionOutcome(result.data.decision)
    ? result.data.decision
    : null;
}

export function selectNoResponseDeadlineStatus(
  instance: OperationalPlaybookInstance,
  now?: string | number | Date,
): MissionClockDeadlineStatus | 'not_started' {
  const deadline = instance.deadlines.find((candidate) => (
    candidate.source === 'no_response_review' && candidate.completionState === 'active'
  ));
  return deadline ? evaluateMissionClockDeadline(deadline, now ?? Date.now()).status : 'not_started';
}

export function selectLostCommunicationsSmartRallyContext(
  result: ConvoyRegroupPlannerResult | null | undefined,
): { status: 'available'; context: DispatchLinkedContext } | { status: 'unavailable'; reason: string } {
  if (!result || result.status !== 'proposal' || !result.proposal) {
    return { status: 'unavailable', reason: 'No operator-reviewable Smart Rally candidate is available.' };
  }
  return { status: 'available', context: createConvoyRegroupDispatchContext(result.proposal) };
}

export function buildLostCommunicationsIncidentHandoff(input: {
  instance: OperationalPlaybookInstance;
  outcome: LostCommunicationsResolutionOutcome;
  explicitOperatorChoice: boolean;
  now?: string | number | Date;
}): LostCommunicationsIncidentHandoffResult {
  const validation = validateLostCommunicationsResolutionOutcome(input);
  if (!validation.allowed || input.outcome !== 'escalate_for_operator_review') {
    return {
      ok: false,
      safeCode: validation.allowed ? 'lost_comms_incident_outcome_required' : validation.safeCode,
      reason: validation.allowed ? 'Select operator review before opening an incident.' : validation.reason,
    };
  }
  if (selectLostCommunicationsRecordedOutcome(input.instance) !== input.outcome) {
    return {
      ok: false,
      safeCode: 'lost_comms_outcome_not_recorded',
      reason: 'Record the operator-selected outcome before opening incident review.',
    };
  }
  const review = selectLostCommunicationsContextReview({ instance: input.instance, now: input.now });
  const position = linkedContext(input.instance, LOST_COMMUNICATIONS_INPUT_KEYS.lastVerifiedPosition);
  const permittedPosition = position && !position.restricted ? position.coordinates : undefined;
  const safety: ReportIncidentSafetyState = {
    anyoneInjured: null,
    anyoneMissing: null,
    anyoneTrapped: null,
    activeHazard: null,
    vehicleStable: null,
    groupSafe: null,
  };
  const resources: ReportIncidentResourceState = {
    vehicleDisabled: null,
    terrain: '',
    weather: '',
    daylight: '',
    fuelConcern: null,
    waterConcern: null,
    foodConcern: null,
    shelterConcern: null,
    warmthConcern: null,
    medicalKitAvailable: null,
  };
  return {
    ok: true,
    prefill: {
      expeditionId: input.instance.expeditionId,
      routeId: linkedContext(input.instance, LOST_COMMUNICATIONS_INPUT_KEYS.routeContext)?.id ?? null,
      routeLabel: review.routeLabel,
      routeSegmentLabel: linkedContext(input.instance, LOST_COMMUNICATIONS_INPUT_KEYS.routeContext)?.routeSegmentId ?? null,
      type: 'communication_failure',
      manualLocationDescription: `${review.memberLabel}: ${review.lastVerifiedStatus}. ${review.movementStatement}`,
      location: permittedPosition
        ? {
            latitude: permittedPosition.latitude,
            longitude: permittedPosition.longitude,
            accuracyMeters: review.accuracyMeters,
            source: 'dispatch',
          }
        : null,
      communicationStatus: review.connectivityLabel === 'offline' ? 'offline' : 'degraded',
      safety,
      resources,
      notes: 'Operator explicitly opened incident review after the no-response deadline. This prefill does not declare an emergency, contact external services, or infer member movement.',
      reportedBy: input.instance.actor.id,
    },
  };
}

export function isLostCommunicationsResolutionOutcome(value: unknown): value is LostCommunicationsResolutionOutcome {
  return [
    'member_responded',
    'delayed_but_safe',
    'regroup_requested',
    'assistance_requested',
    'command_cancelled',
    'escalate_for_operator_review',
  ].includes(String(value));
}

function inputRequirement(
  key: string,
  label: string,
  description: string,
  kind: OperationalPlaybookDefinition['requiredInputs'][number]['kind'],
  options: {
    policyKey?: OperationalPlaybookDefinition['requiredInputs'][number]['sourceTruthPolicyKey'];
    allowManual?: boolean;
    allowStale?: boolean;
  } = {},
): OperationalPlaybookDefinition['requiredInputs'][number] {
  return {
    key,
    label,
    description,
    kind,
    sourceTruthPolicyKey: options.policyKey,
    allowManual: options.allowManual ?? false,
    allowStale: options.allowStale ?? false,
    sensitive: kind === 'linked_context',
  };
}

function createPositionInputValue(
  input: LostCommunicationsCreateInput,
  now: string,
): OperationalPlaybookInputValue {
  const key = LOST_COMMUNICATIONS_INPUT_KEYS.lastVerifiedPosition;
  if (!input.locationPermissionAllowed || !input.positionSharingEnabled) {
    const restrictedByPermission = !input.locationPermissionAllowed;
    const restrictionLabel = restrictedByPermission
      ? 'Restricted by member-location permission'
      : 'Restricted because member GPS sharing is unavailable';
    const restrictedSource = sanitizeSourceTruthRef({
      id: `lost-comms-location-restricted:${input.member.id}`,
      origin: 'unavailable',
      role: 'primary',
      policyKey: 'convoy_member_location',
      authority: restrictedByPermission ? 'Member location permission' : 'Member GPS sharing state',
      authorityKind: 'ecs',
      observedAt: null,
      confidence: 'unknown',
      coverage: 'unknown',
      availability: 'unavailable',
      conflictState: 'none',
      warningCodes: [restrictedByPermission ? 'restricted_member_location' : 'member_location_sharing_unavailable'],
    });
    return linkedInput(key, {
      id: `lost-comms-position:${input.member.id}`,
      type: 'pin',
      title: 'Last verified position',
      subtitle: restrictionLabel,
      restricted: true,
      sourceTruthPolicyKey: 'convoy_member_location',
      sourceTruth: restrictedSource,
    }, 'restricted', [restrictedSource], input.actor, now);
  }
  const position = input.position;
  if (!position) return linkedInput(key, undefined, 'missing', [ecsSource(`lost-comms-location-missing:${input.member.id}`, now, 'Member GPS', 'unavailable')], input.actor, now);
  const capturedAt = normalizeIso(position.capturedAt);
  if (!validCoordinate(position.latitude, position.longitude) || !capturedAt) {
    return linkedInput(key, undefined, 'unavailable', [ecsSource(`lost-comms-location-invalid:${input.member.id}`, now, 'Member GPS', 'unavailable')], input.actor, now);
  }
  const binding = buildConvoyLocationSourceTruthBinding({
    memberId: input.member.id,
    observedAt: capturedAt,
    accuracyMeters: position.accuracyMeters,
    sourceLabel: position.sourceLabel ?? 'ECS Convoy Location',
    stale: false,
    offline: position.offline ?? !input.online,
  });
  const evaluation = evaluateSourceTruthRef(binding.ref, { policyKey: 'convoy_member_location', now });
  const state: OperationalPlaybookInputState = evaluation.freshness === 'live' || evaluation.freshness === 'recent'
    ? 'available'
    : evaluation.freshness === 'stale' || evaluation.freshness === 'expired'
      ? 'stale'
      : 'unavailable';
  const context = sanitizeMissionCommandLinkedContext({
    id: `lost-comms-position:${input.member.id}:${capturedAt}`,
    type: 'pin',
    title: 'Last verified position',
    subtitle: `${positionStateLabel(evaluation.freshness)}. Movement is not inferred.`,
    coordinates: { latitude: position.latitude, longitude: position.longitude },
    observedAt: capturedAt,
    stale: state === 'stale',
    restricted: false,
    sourceTruthPolicyKey: 'convoy_member_location',
    sourceTruth: binding.ref,
    metadata: {
      accuracyMeters: Number.isFinite(position.accuracyMeters) ? position.accuracyMeters : null,
      freshness: evaluation.freshness,
    },
  });
  return linkedInput(key, context, state, binding.sources, input.actor, now, capturedAt);
}

function createMemberStatusContext(
  input: LostCommunicationsCreateInput,
  memberLabel: string,
  sources: SourceTruthRef[],
  positionValue: OperationalPlaybookInputValue,
  now: string,
): DispatchLinkedContext {
  const state = resolvePositionState(positionValue, now);
  return sanitizeMissionCommandLinkedContext({
    id: `lost-comms-member:${input.member.id}`,
    type: 'manual',
    title: memberLabel,
    subtitle: `${positionStateLabel(state)}. Movement is not inferred from the last verified position.`,
    observedAt: normalizeIso(input.member.observedAt) ?? positionValue.observedAt ?? now,
    stale: state === 'stale' || state === 'expired',
    restricted: false,
    sourceTruthPolicyKey: sources[0]?.policyKey ?? 'manual_user_state',
    sourceTruth: sources[0],
    metadata: { positionState: state, coordinatesIncluded: false },
  })!;
}

function appendTimestampInput(
  target: OperationalPlaybookInputValue[],
  key: string,
  value: string | null | undefined,
  sources: SourceTruthRef[],
  actor: MissionCommandActor,
  now: string,
) {
  const timestamp = normalizeIso(value);
  if (timestamp) target.push(scalarInput(key, 'timestamp', timestamp, sources, actor, now));
}

function appendContextInput(
  target: OperationalPlaybookInputValue[],
  key: string,
  value: DispatchLinkedContext | null | undefined,
  actor: MissionCommandActor,
  now: string,
) {
  const context = sanitizeMissionCommandLinkedContext(value ?? undefined);
  if (!context) return;
  target.push(linkedInput(
    key,
    context,
    context.restricted ? 'restricted' : context.stale ? 'stale' : 'available',
    context.sourceTruth ? [context.sourceTruth] : [ecsSource(`${key}:${context.id}`, now, 'ECS linked context', 'cached')],
    actor,
    now,
    context.observedAt,
  ));
}

function appendMemberInput(
  target: OperationalPlaybookInputValue[],
  key: string,
  value: string | null | undefined,
  actor: MissionCommandActor,
  now: string,
  sources: SourceTruthRef[],
) {
  const memberId = safeId(value);
  if (memberId) target.push(scalarInput(key, 'member_id', memberId, sources, actor, now));
}

function scalarInput(
  key: string,
  kind: Exclude<OperationalPlaybookInputValue['kind'], 'linked_context'>,
  scalarValue: string | number | boolean,
  sourceTruth: SourceTruthRef[],
  capturedBy: MissionCommandActor,
  capturedAt: string,
  state: OperationalPlaybookInputState = 'available',
  manual = false,
): OperationalPlaybookInputValue {
  return {
    schemaVersion: OPERATIONAL_PLAYBOOK_SCHEMA_VERSION,
    key,
    kind,
    state,
    scalarValue,
    sourceTruth: normalizeSources(sourceTruth),
    observedAt: kind === 'timestamp' && typeof scalarValue === 'string' ? scalarValue : capturedAt,
    capturedAt,
    capturedBy,
    manual,
  };
}

function linkedInput(
  key: string,
  linkedContext: DispatchLinkedContext | undefined,
  state: OperationalPlaybookInputState,
  sourceTruth: SourceTruthRef[],
  capturedBy: MissionCommandActor,
  capturedAt: string,
  observedAt?: string | null,
): OperationalPlaybookInputValue {
  return {
    schemaVersion: OPERATIONAL_PLAYBOOK_SCHEMA_VERSION,
    key,
    kind: 'linked_context',
    state,
    linkedContext,
    sourceTruth: normalizeSources(sourceTruth),
    observedAt: normalizeIso(observedAt),
    capturedAt,
    capturedBy,
    manual: false,
  };
}

function positionAgeFromValue(
  value: OperationalPlaybookInputValue | undefined,
  now: string | number | Date,
): number | null {
  const observedAt = normalizeIso(value?.observedAt ?? value?.linkedContext?.observedAt);
  const nowIso = normalizeIso(now);
  if (!observedAt || !nowIso) return null;
  return Math.max(0, Date.parse(nowIso) - Date.parse(observedAt));
}

function resolvePositionState(
  value: OperationalPlaybookInputValue | undefined,
  now: string | number | Date,
): LostCommunicationsPositionState {
  if (!value || value.state === 'missing') return 'missing';
  if (value.state === 'restricted' || value.linkedContext?.restricted) return 'restricted';
  const source = value.sourceTruth[0];
  if (!source) return 'unavailable';
  return evaluateSourceTruthRef(source, { policyKey: 'convoy_member_location', now }).freshness;
}

function positionStateLabel(state: LostCommunicationsPositionState): string {
  const labels: Record<LostCommunicationsPositionState, string> = {
    live: 'Live position',
    recent: 'Recent position',
    stale: 'Stale last verified position',
    expired: 'Expired last verified position',
    unavailable: 'Position unavailable',
    restricted: 'Position restricted',
    missing: 'Position missing',
  };
  return labels[state];
}

function linkedContext(instance: OperationalPlaybookInstance, key: string): DispatchLinkedContext | null {
  return instance.inputSnapshot[key]?.linkedContext ?? null;
}

function missionCommandTargetsMember(command: MissionCommand, memberId: string): boolean {
  if (command.target.kind === 'member' || command.target.kind === 'solo') {
    return command.target.memberId === memberId;
  }
  if (command.target.kind === 'team') return command.target.memberIds.includes(memberId);
  return command.acknowledgmentPolicy.targetMemberIds.includes(memberId);
}

function latestIso(values: Array<string | null | undefined>): string | null {
  return values.reduce<string | null>((latest, value) => {
    const normalized = normalizeIso(value);
    if (!normalized) return latest;
    return !latest || Date.parse(normalized) > Date.parse(latest) ? normalized : latest;
  }, null);
}

function scalarString(instance: OperationalPlaybookInstance, key: string): string | null {
  const value = instance.inputSnapshot[key]?.scalarValue;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function scalarNumber(instance: OperationalPlaybookInstance, key: string): number | null {
  const value = instance.inputSnapshot[key]?.scalarValue;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function scalarTimestamp(instance: OperationalPlaybookInstance, key: string): string | null {
  return normalizeIso(instance.inputSnapshot[key]?.scalarValue) ?? null;
}

function rosterSource(member: LostCommunicationsMemberInput, now: string): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id: `lost-comms-roster:${member.id}`,
    origin: 'cached',
    role: 'primary',
    policyKey: 'manual_user_state',
    authority: 'ECS expedition roster',
    authorityKind: 'ecs',
    observedAt: normalizeIso(member.observedAt) ?? now,
    confidence: 'medium',
    coverage: 'partial',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: ['roster_state_local'],
  });
}

function ecsSource(
  id: string,
  observedAt: string,
  authority: string,
  origin: SourceTruthRef['origin'],
): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id,
    origin,
    role: 'primary',
    policyKey: origin === 'manual' ? 'manual_user_state' : 'default',
    authority,
    authorityKind: origin === 'manual' ? 'user' : origin === 'unavailable' ? 'unknown' : 'ecs',
    observedAt: origin === 'unavailable' ? null : observedAt,
    confidence: origin === 'unavailable' ? 'unknown' : 'high',
    coverage: origin === 'unavailable' ? 'unknown' : 'complete',
    availability: origin === 'unavailable' ? 'unavailable' : 'usable',
    conflictState: 'none',
    warningCodes: origin === 'manual' ? ['manual_source'] : origin === 'unavailable' ? ['source_unavailable'] : [],
  });
}

function normalizeSources(refs: readonly SourceTruthRef[]): SourceTruthRef[] {
  const byId = new Map<string, SourceTruthRef>();
  refs.forEach((ref) => {
    if (!ref?.id) return;
    const sanitized = sanitizeSourceTruthRef(ref);
    byId.set(sanitized.id, sanitized);
  });
  return [...byId.values()].slice(0, 30);
}

function safeText(value: unknown, max: number): string {
  return sanitizeSourceTruthDisplayText(value, max) ?? '';
}

function safeId(value: unknown): string | null {
  const normalized = String(value ?? '').trim().slice(0, 180);
  return normalized && /^[A-Za-z0-9._:-]+$/.test(normalized) ? normalized : null;
}

function normalizeIso(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === 'number') return Number.isFinite(value) ? new Date(value).toISOString() : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function validCoordinate(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}
