import {
  createGuardianCheckInDeadline,
  deriveGuardianResponseState,
  formatGuardianTarget,
  getGuardianCheckInDeadlineStatus,
  guardianTriggerRequiresOperatorConfirmation,
} from './dispatchGuardianCheckInDomain';
import type {
  CreateGuardianCheckInPlanInput,
  GuardianCheckInPlan,
  GuardianCheckInPresentation,
  GuardianCheckInTriggerType,
} from './dispatchGuardianCheckInTypes';
import {
  createMissionCommandComposerForm,
  type MissionCommandComposerContextOption,
  type MissionCommandComposerForm,
  type MissionCommandComposerMemberOption,
} from './dispatchMissionCommandComposer';
import type { MissionCommand, MissionCommandActor, MissionCommandTarget } from './dispatchMissionCommandTypes';
import type { ReportIncidentInput } from './incidentRecoveryWorkflowStore';
import type { DispatchPing } from './dispatchTypes';
import type { SourceTruthRef } from './sourceTruth';

const MINUTE_MS = 60_000;

export interface GuardianCheckInComposerRequest {
  planId: string;
  cycle: number;
  form: MissionCommandComposerForm;
  extraContext: MissionCommandComposerContextOption | null;
  sourceTruth: SourceTruthRef[];
}

export type GuardianCheckInComposerRequestResult =
  | { ok: true; request: GuardianCheckInComposerRequest }
  | { ok: false; safeCode: string; reason: string };

export type GuardianCheckInIncidentHandoffResult =
  | { ok: true; prefill: ReportIncidentInput }
  | { ok: false; safeCode: string; reason: string };

export function buildGuardianCheckInComposerRequest(input: {
  plan: GuardianCheckInPlan;
  actor: MissionCommandActor;
  members: MissionCommandComposerMemberOption[];
  now?: string | number | Date;
}): GuardianCheckInComposerRequestResult {
  const { plan } = input;
  if (plan.lifecycleState !== 'active') {
    return failure('guardian_plan_not_active', 'Resume the Guardian Check-In before requesting a response.');
  }
  if (plan.currentCommandId && !['resolved', 'cancelled'].includes(plan.responseState)) {
    return failure('guardian_request_already_active', 'This Guardian Check-In cycle already has an active request.');
  }
  if (guardianTriggerRequiresOperatorConfirmation(plan.trigger.type) && !plan.trigger.lastTriggeredAt) {
    return failure('guardian_trigger_not_confirmed', 'Confirm the route, rally, camp, segment, or incident trigger before requesting the check-in.');
  }
  const targetPatch = targetFormPatch(plan.target, plan.soloMode);
  if (!targetPatch) return failure('guardian_target_unavailable', 'Guardian Check-In target cannot be represented in Command Composer.');
  const now = normalizeIso(input.now) ?? new Date().toISOString();
  const deadlineAt = new Date(Date.parse(now) + plan.gracePeriodMinutes * MINUTE_MS).toISOString();
  const extraContext = plan.trigger.linkedContext
    ? {
        id: `guardian-context:${plan.id}`,
        label: plan.trigger.linkedContext.title,
        context: plan.trigger.linkedContext,
      }
    : null;
  const base = createMissionCommandComposerForm({
    actorId: input.actor.id,
    soloMode: plan.soloMode,
    members: input.members,
    seedType: 'check_in',
    draftId: `guardian-check-in:${plan.id}:cycle:${plan.cycle}`,
  });
  return {
    ok: true,
    request: {
      planId: plan.id,
      cycle: plan.cycle,
      form: {
        ...base,
        ...targetPatch,
        priority: 'normal',
        title: plan.title,
        instructions: plan.soloMode
          ? 'Complete a local self check-in and review the personal communications plan. No recipient delivery is claimed.'
          : `Confirm status for ${formatGuardianTarget(plan.target)}. ECS team coordination only; no external services are contacted.`,
        acknowledgmentMode: plan.soloMode ? 'none' : plan.acknowledgmentRequirement.mode,
        acknowledgmentCount: plan.acknowledgmentRequirement.requiredCount == null
          ? ''
          : String(plan.acknowledgmentRequirement.requiredCount),
        deadlineMode: 'absolute',
        absoluteDeadlineAt: deadlineAt,
        linkedContextId: extraContext?.id ?? '',
      },
      extraContext,
      sourceTruth: [...plan.sourceTruth],
    },
  };
}

export function selectGuardianCheckInPresentation(input: {
  plan: GuardianCheckInPlan;
  commands: MissionCommand[];
  now?: string | number | Date;
}): GuardianCheckInPresentation {
  const currentCommand = input.plan.currentCommandId
    ? input.commands.find((command) => command.id === input.plan.currentCommandId) ?? null
    : null;
  const responseState = deriveGuardianResponseState(input.plan, currentCommand);
  const deadlineStatus = getGuardianCheckInDeadlineStatus(input.plan, input.now);
  const noResponseDecisionRequired = input.plan.lifecycleState === 'active' &&
    deadlineStatus === 'overdue' &&
    currentCommand != null &&
    !['acknowledged', 'declined', 'no_response', 'resolved', 'cancelled'].includes(responseState) &&
    !input.plan.noResponseDecisionCommandId;
  const context = input.plan.trigger.linkedContext;
  const source = input.plan.sourceTruth[0];
  const observedAt = context?.observedAt ?? source?.observedAt;
  return {
    planId: input.plan.id,
    title: input.plan.title,
    targetLabel: formatGuardianTarget(input.plan.target),
    triggerLabel: formatGuardianTrigger(input.plan.trigger.type),
    triggerSupport: input.plan.trigger.support,
    lifecycleState: input.plan.lifecycleState,
    responseState,
    deadlineStatus,
    nextReviewAt: input.plan.nextReviewAt,
    gracePeriodMinutes: input.plan.gracePeriodMinutes,
    noResponseDecisionRequired,
    sourceLabel: source
      ? `${humanize(source.origin)} / ${source.authority || 'Unknown authority'}`
      : 'Source unavailable',
    sourceAgeLabel: formatObservationAge(observedAt, input.now),
    accuracyLabel: context?.accuracyMeters != null && Number.isFinite(context.accuracyMeters)
      ? `${Math.round(context.accuracyMeters)} m`
      : 'Unavailable',
    locationLabel: !context
      ? 'No linked location'
      : context.restricted
        ? 'Linked context restricted'
        : context.coordinates && input.plan.trigger.includeExactLocation
          ? `${context.title} / exact location included by operator`
          : `${context.title} / exact location omitted`,
    currentCommand,
    soloStatement: input.plan.soloMode
      ? 'Local self check-in. ECS does not claim another person received this reminder.'
      : null,
  };
}

function formatObservationAge(
  observedAt: string | null | undefined,
  now: string | number | Date | undefined,
): string {
  if (!observedAt) return 'Observation time unavailable';
  const observedMs = Date.parse(observedAt);
  const nowMs = now instanceof Date
    ? now.getTime()
    : typeof now === 'string'
      ? Date.parse(now)
      : typeof now === 'number'
        ? now
        : Date.now();
  if (!Number.isFinite(observedMs) || !Number.isFinite(nowMs)) return 'Observation time invalid';
  const ageMs = nowMs - observedMs;
  if (ageMs < -60_000) return 'Observation time is in the future';
  const minutes = Math.max(0, Math.floor(ageMs / MINUTE_MS));
  if (minutes < 1) return 'Observed less than 1 minute ago';
  if (minutes < 60) return `Observed ${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Observed ${hours} hours ago`;
  return `Observed ${Math.floor(hours / 24)} days ago`;
}

export function buildGuardianCheckInIncidentHandoff(input: {
  plan: GuardianCheckInPlan;
  explicitOperatorChoice: boolean;
}): GuardianCheckInIncidentHandoffResult {
  const { plan } = input;
  if (!input.explicitOperatorChoice) {
    return failure('guardian_incident_confirmation_required', 'Opening a local incident record requires explicit operator action.');
  }
  if (!plan.soloMode) {
    return failure('guardian_incident_solo_only', 'This Guardian action creates a local solo incident record only.');
  }
  if (!['no_response', 'delayed', 'declined'].includes(plan.responseState)) {
    return failure('guardian_incident_state_invalid', 'Record a delayed, declined, or no-response outcome before opening a local incident record.');
  }
  const context = plan.trigger.linkedContext;
  const coordinates = context &&
    plan.trigger.includeExactLocation &&
    !context.restricted &&
    validCoordinates(context.coordinates)
    ? context.coordinates
    : null;
  return {
    ok: true,
    prefill: {
      expeditionId: plan.expeditionId,
      routeId: context?.type === 'route' ? context.id : null,
      routeLabel: context?.type === 'route' ? context.title : 'Unknown route',
      routeSegmentLabel: context?.routeSegmentId ?? null,
      type: 'communication_failure',
      manualLocationDescription: context?.title ?? 'Guardian Check-In local incident record',
      location: coordinates
        ? {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            source: 'dispatch',
            capturedAt: context?.observedAt,
          }
        : null,
      communicationStatus: 'unknown',
      safety: {
        anyoneInjured: null,
        anyoneMissing: null,
        anyoneTrapped: null,
        activeHazard: null,
        vehicleStable: null,
        groupSafe: null,
      },
      resources: {
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
      },
      notes: 'Operator explicitly opened a local incident record from a solo Guardian Check-In. No emergency is declared and no external communication occurs automatically.',
      reportedBy: plan.creator.id,
    },
  };
}

export function adaptLegacyCheckInPingToGuardianPlanInput(input: {
  ping: DispatchPing;
  expeditionId: string;
  actor: MissionCommandActor;
  soloMode: boolean;
  now?: string | number | Date;
}): CreateGuardianCheckInPlanInput | null {
  const { ping } = input;
  if (ping.type !== 'check_in' || ping.targetMemberIds.length === 0) return null;
  const target: MissionCommandTarget = input.soloMode
    ? { kind: 'solo', memberId: input.actor.id, label: input.actor.label }
    : ping.targetMemberIds.length === 1
      ? { kind: 'member', memberId: ping.targetMemberIds[0] }
      : { kind: 'team', memberIds: [...ping.targetMemberIds], label: 'Legacy check-in targets' };
  const triggerType = legacyTriggerType(ping);
  const intervalMinutes = legacyScheduleMinutes(ping.checkInSchedule);
  return {
    expeditionId: input.expeditionId,
    actor: input.actor,
    title: ping.message || 'Legacy Guardian Check-In',
    target,
    triggerType,
    dueAt: ping.responseDueAt ?? (triggerType === 'fixed_time' ? ping.createdAt : null),
    intervalMinutes,
    linkedContext: ping.linkedContext ?? null,
    includeExactLocation: false,
    locationPermissionAllowed: false,
    acknowledgmentRequirement: ping.requiresAcknowledgment
      ? { mode: 'all', targetMemberIds: [...ping.targetMemberIds] }
      : { mode: 'none', targetMemberIds: [] },
    gracePeriodMinutes: 15,
    sourceTruth: ping.linkedContext?.sourceTruth ? [ping.linkedContext.sourceTruth] : [],
    soloMode: input.soloMode,
    now: input.now ?? ping.createdAt,
    idempotencyKey: `guardian-legacy:${ping.idempotencyKey ?? ping.id}`,
  };
}

export function collectGuardianCheckInDeadlines(plans: GuardianCheckInPlan[]) {
  return plans.map(createGuardianCheckInDeadline).filter((deadline): deadline is NonNullable<typeof deadline> => deadline != null);
}

export function formatGuardianTrigger(type: GuardianCheckInTriggerType): string {
  switch (type) {
    case 'fixed_time': return 'Fixed Time';
    case 'recurring_interval': return 'Recurring Interval';
    case 'route_checkpoint': return 'Route Checkpoint';
    case 'rally_arrival': return 'Rally Arrival';
    case 'camp_arrival': return 'Camp Arrival';
    case 'remote_segment_entry': return 'Remote Segment Entry';
    case 'operator_requested': return 'Operator Requested';
    case 'post_incident_follow_up': return 'Post-Incident Follow-Up';
    case 'manual_one_time': return 'Manual One-Time';
  }
}

function targetFormPatch(
  target: MissionCommandTarget,
  soloMode: boolean,
): Partial<MissionCommandComposerForm> | null {
  if (soloMode || target.kind === 'solo') {
    return {
      targetKind: 'self',
      targetMemberId: target.kind === 'solo' ? target.memberId : '',
      selectedMemberIds: target.kind === 'solo' ? [target.memberId] : [],
    };
  }
  if (target.kind === 'member') {
    return { targetKind: 'member', targetMemberId: target.memberId, selectedMemberIds: [target.memberId] };
  }
  if (target.kind === 'team') {
    return { targetKind: 'selected_members', selectedMemberIds: [...target.memberIds], targetMemberId: target.memberIds[0] ?? '' };
  }
  if (target.kind === 'role') return { targetKind: 'role', targetRoleId: target.roleId };
  if (target.kind === 'vehicle') return { targetKind: 'vehicle', targetVehicleId: target.vehicleId };
  return null;
}

function legacyTriggerType(ping: DispatchPing): GuardianCheckInTriggerType {
  if (ping.checkInType === 'waypoint') return 'route_checkpoint';
  if (legacyScheduleMinutes(ping.checkInSchedule)) return 'recurring_interval';
  if (ping.responseDueAt) return 'fixed_time';
  return 'manual_one_time';
}

function legacyScheduleMinutes(schedule: DispatchPing['checkInSchedule']): number | null {
  if (schedule === 'every_30') return 30;
  if (schedule === 'every_60') return 60;
  if (schedule === 'every_120') return 120;
  return null;
}

function validCoordinates(value: unknown): value is { latitude: number; longitude: number } {
  if (!value || typeof value !== 'object') return false;
  const coordinates = value as { latitude?: unknown; longitude?: unknown };
  return typeof coordinates.latitude === 'number' && Number.isFinite(coordinates.latitude) &&
    coordinates.latitude >= -90 && coordinates.latitude <= 90 &&
    typeof coordinates.longitude === 'number' && Number.isFinite(coordinates.longitude) &&
    coordinates.longitude >= -180 && coordinates.longitude <= 180;
}

function normalizeIso(value: unknown): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function failure(safeCode: string, reason: string): { ok: false; safeCode: string; reason: string } {
  return { ok: false, safeCode, reason };
}
