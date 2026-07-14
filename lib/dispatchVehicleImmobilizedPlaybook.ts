import type {
  ReportIncidentInput,
  ReportIncidentResourceState,
  ReportIncidentSafetyState,
} from './incidentRecoveryWorkflowStore';
import { sanitizeMissionCommandLinkedContext } from './dispatchMissionCommandDomain';
import type { MissionCommand, MissionCommandActor } from './dispatchMissionCommandTypes';
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

export const VEHICLE_IMMOBILIZED_PLAYBOOK_ID = 'vehicle_immobilized';
export const VEHICLE_IMMOBILIZED_PLAYBOOK_VERSION = 1;
export const VEHICLE_IMMOBILIZED_DEFAULT_REVIEW_MINUTES = 30;

export const VEHICLE_IMMOBILIZED_STEP_IDS = {
  reviewInitialStatus: 'review-initial-vehicle-status',
  confirmInitialStatus: 'confirm-initial-vehicle-status',
  proposeConvoyStop: 'propose-convoy-stop-regroup',
  assignRecoveryLead: 'assign-recovery-lead',
  assignSpotter: 'assign-spotter',
  openVehicle: 'open-fleet-recovery-readiness',
  reviewApprovedProtocols: 'review-approved-recovery-protocols',
  openLocation: 'open-vehicle-location',
  openRouteSegment: 'open-active-route-segment',
  reviewBailoutCamp: 'review-bailout-or-camp',
  recordOutcome: 'record-vehicle-immobilized-outcome',
  startStatusDeadline: 'start-vehicle-status-deadline',
  requestAcknowledgments: 'track-coordination-acknowledgments',
  confirmOutcome: 'confirm-vehicle-immobilized-outcome',
  resolve: 'resolve-vehicle-immobilized-playbook',
} as const;

export const VEHICLE_IMMOBILIZED_INPUT_KEYS = {
  affectedVehicleId: 'affected_vehicle_id',
  affectedVehicleContext: 'affected_vehicle_context',
  occupants: 'affected_vehicle_occupants',
  initialStatusContext: 'initial_vehicle_status_context',
  vehicleStopped: 'vehicle_stopped_status',
  peopleAccounted: 'people_accounted_status',
  immediateHazard: 'immediate_hazard_status',
  communicationStatus: 'communication_status',
  routeObstruction: 'route_obstruction_status',
  locationContext: 'vehicle_location_context',
  routeContext: 'active_route_context',
  routeSegmentContext: 'active_route_segment_context',
  terrain: 'terrain_context',
  attitude: 'attitude_context',
  weather: 'weather_context',
  daylight: 'daylight_context',
  convoy: 'convoy_context',
  recoveryEquipment: 'recovery_equipment_readiness',
  vehicleReadiness: 'vehicle_loadout_readiness',
  recoveryCapableVehicles: 'recovery_capable_vehicles',
  recoveryLeadCandidates: 'recovery_lead_candidates',
  spotterCandidates: 'spotter_candidates',
  leadMemberId: 'convoy_lead_member_id',
  sweepMemberId: 'convoy_sweep_member_id',
  bailoutOrCampContext: 'bailout_or_camp_context',
  approvedProtocolsContext: 'approved_recovery_protocols_context',
  approvedProtocols: 'approved_recovery_protocols',
  communicationState: 'dispatch_communication_state',
  currentTime: 'current_time',
  statusDeadline: 'vehicle_status_review_deadline',
  soloMode: 'solo_mode',
} as const;

export type VehicleImmobilizedVehicleStopped =
  | 'confirmed_stopped'
  | 'not_confirmed'
  | 'unknown';
export type VehicleImmobilizedPeopleAccounted =
  | 'accounted_for'
  | 'not_accounted_for'
  | 'unknown';
export type VehicleImmobilizedImmediateHazard =
  | 'none_confirmed'
  | 'present'
  | 'unknown';
export type VehicleImmobilizedCommunication =
  | 'available'
  | 'degraded'
  | 'unavailable'
  | 'unknown';
export type VehicleImmobilizedRouteObstruction =
  | 'clear'
  | 'partial'
  | 'blocked'
  | 'unknown';

export type VehicleImmobilizedOutcome =
  | 'self_recovered'
  | 'team_recovery_in_progress'
  | 'vehicle_remains_immobilized'
  | 'route_blocked'
  | 'external_assistance_planning'
  | 'camp_overnight_decision_required'
  | 'incident_resolved';

export interface VehicleImmobilizedMemberRef {
  id: string;
  label: string;
  roleId?: string | null;
}

export interface VehicleImmobilizedEvidenceInput {
  label: string;
  state: OperationalPlaybookInputState;
  observedAt?: string | null;
  sourceTruth?: SourceTruthRef[];
}

export interface VehicleImmobilizedCreateInput {
  expeditionId: string;
  actor: MissionCommandActor;
  soloMode: boolean;
  online: boolean;
  affectedVehicle: {
    id: string;
    label: string;
    ownerMemberId?: string | null;
    sourceTruth?: SourceTruthRef[];
    context: DispatchLinkedContext;
  };
  occupants: VehicleImmobilizedMemberRef[];
  initialStatus: {
    vehicleStopped: VehicleImmobilizedVehicleStopped;
    peopleAccounted: VehicleImmobilizedPeopleAccounted;
    immediateHazard: VehicleImmobilizedImmediateHazard;
    communication: VehicleImmobilizedCommunication;
    routeObstruction: VehicleImmobilizedRouteObstruction;
  };
  locationContext?: DispatchLinkedContext | null;
  routeContext?: DispatchLinkedContext | null;
  routeSegmentContext?: DispatchLinkedContext | null;
  terrain?: VehicleImmobilizedEvidenceInput | null;
  attitude?: VehicleImmobilizedEvidenceInput | null;
  weather?: VehicleImmobilizedEvidenceInput | null;
  daylight?: VehicleImmobilizedEvidenceInput | null;
  convoy?: VehicleImmobilizedEvidenceInput | null;
  recoveryEquipment?: VehicleImmobilizedEvidenceInput | null;
  vehicleReadiness?: VehicleImmobilizedEvidenceInput | null;
  communicationState?: VehicleImmobilizedEvidenceInput | null;
  recoveryCapableVehicles?: Array<{
    id: string;
    label: string;
    memberIds?: string[];
    sourceTruth?: SourceTruthRef[];
  }>;
  recoveryLeadCandidates?: VehicleImmobilizedMemberRef[];
  spotterCandidates?: VehicleImmobilizedMemberRef[];
  leadMemberId?: string | null;
  sweepMemberId?: string | null;
  bailoutOrCampContext?: DispatchLinkedContext | null;
  approvedRecoveryProtocols?: Array<{ id: string; title: string }>;
  statusReviewMinutes?: number;
  now?: string | number | Date;
  idempotencyKey?: string;
}

export type CreateVehicleImmobilizedResult =
  | { ok: true; instance: OperationalPlaybookInstance }
  | { ok: false; safeCode: string; reason: string };

export interface VehicleImmobilizedContextReview {
  vehicleId: string | null;
  vehicleLabel: string;
  occupants: VehicleImmobilizedMemberRef[];
  initialStatus: VehicleImmobilizedCreateInput['initialStatus'];
  locationState: SourceTruthFreshness | 'restricted' | 'missing';
  locationLabel: string;
  routeLabel: string;
  routeSegmentLabel: string;
  bailoutOrCampLabel: string;
  terrain: VehicleImmobilizedEvidenceInput;
  attitude: VehicleImmobilizedEvidenceInput;
  weather: VehicleImmobilizedEvidenceInput;
  daylight: VehicleImmobilizedEvidenceInput;
  convoy: VehicleImmobilizedEvidenceInput;
  recoveryEquipment: VehicleImmobilizedEvidenceInput;
  vehicleReadiness: VehicleImmobilizedEvidenceInput;
  communicationState: VehicleImmobilizedEvidenceInput;
  convoyAvailable: boolean;
  recoveryCapableVehicles: Array<{ id: string; label: string; memberIds: string[] }>;
  recoveryLeadCandidates: VehicleImmobilizedMemberRef[];
  spotterCandidates: VehicleImmobilizedMemberRef[];
  spotterSupported: boolean;
  recoveryLead: VehicleImmobilizedMemberRef | null;
  spotter: VehicleImmobilizedMemberRef | null;
  approvedRecoveryProtocols: Array<{ id: string; title: string }>;
  coordinationCommand: {
    commandId: string | null;
    deliveryState: MissionCommand['deliveryState'] | 'not_created';
    acknowledgmentState: MissionCommand['acknowledgmentState'] | 'not_requested';
  };
  missingFields: string[];
  safetyStatement: 'This playbook coordinates the ECS team and does not begin a recovery, diagnose a failure, reroute, or contact external assistance.';
}

export type VehicleImmobilizedIncidentHandoffResult =
  | { ok: true; prefill: ReportIncidentInput }
  | { ok: false; safeCode: string; reason: string };

const VEHICLE_STOPPED_VALUES = new Set<VehicleImmobilizedVehicleStopped>([
  'confirmed_stopped', 'not_confirmed', 'unknown',
]);
const PEOPLE_ACCOUNTED_VALUES = new Set<VehicleImmobilizedPeopleAccounted>([
  'accounted_for', 'not_accounted_for', 'unknown',
]);
const IMMEDIATE_HAZARD_VALUES = new Set<VehicleImmobilizedImmediateHazard>([
  'none_confirmed', 'present', 'unknown',
]);
const COMMUNICATION_VALUES = new Set<VehicleImmobilizedCommunication>([
  'available', 'degraded', 'unavailable', 'unknown',
]);
const ROUTE_OBSTRUCTION_VALUES = new Set<VehicleImmobilizedRouteObstruction>([
  'clear', 'partial', 'blocked', 'unknown',
]);
const OUTCOME_VALUES = new Set<VehicleImmobilizedOutcome>([
  'self_recovered',
  'team_recovery_in_progress',
  'vehicle_remains_immobilized',
  'route_blocked',
  'external_assistance_planning',
  'camp_overnight_decision_required',
  'incident_resolved',
]);

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

export const VEHICLE_IMMOBILIZED_PLAYBOOK_DEFINITION: OperationalPlaybookDefinition = {
  schemaVersion: OPERATIONAL_PLAYBOOK_SCHEMA_VERSION,
  id: VEHICLE_IMMOBILIZED_PLAYBOOK_ID,
  version: VEHICLE_IMMOBILIZED_PLAYBOOK_VERSION,
  title: 'Vehicle Immobilized',
  description: 'Coordinate the ECS team response to a vehicle that cannot continue without diagnosing the failure or beginning a recovery.',
  supportedScenario: 'vehicle_immobilized',
  requiredCapabilities: [
    'mission_command',
    'mission_clock',
    'linked_context',
    'assignment',
    'acknowledgment',
    'offline_operation',
  ],
  requiredPermissions: ['view_dispatch'],
  requiredInputs: [
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.affectedVehicleId, 'Affected vehicle', 'Fleet identity for the vehicle that cannot continue.', 'vehicle_id', { policyKey: 'vehicle_profile', allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.affectedVehicleContext, 'Vehicle context', 'Fleet recovery-readiness context for the affected vehicle.', 'linked_context', { policyKey: 'vehicle_profile', allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.initialStatusContext, 'Initial status', 'Operator-confirmed stopped, occupant, hazard, communications, and obstruction state.', 'linked_context', { allowManual: true, allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.vehicleStopped, 'Vehicle stopped', 'Operator confirmation that the vehicle is stopped.', 'text', { allowManual: true, allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.peopleAccounted, 'People accounted for', 'Operator confirmation of occupant accountability.', 'text', { allowManual: true, allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.immediateHazard, 'Immediate hazard', 'Operator-confirmed immediate hazard state.', 'text', { allowManual: true, allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.communicationStatus, 'Communication', 'Operator-confirmed communication availability.', 'text', { allowManual: true, allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.routeObstruction, 'Route obstruction', 'Operator-confirmed route obstruction state.', 'text', { allowManual: true, allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.currentTime, 'Current time', 'Absolute ECS time used to establish the review deadline.', 'timestamp', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.statusDeadline, 'Next status review', 'Absolute time for the next operator status decision.', 'timestamp', { allowStale: true }),
  ],
  optionalInputs: [
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.occupants, 'Occupants', 'Known occupants associated with the affected vehicle.', 'text', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.locationContext, 'Last verified location', 'Permitted last verified vehicle location.', 'linked_context', { policyKey: 'convoy_member_location', allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.routeContext, 'Active route', 'Current active or saved route context.', 'linked_context', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.routeSegmentContext, 'Route segment', 'Current route-segment planning context.', 'linked_context', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.terrain, 'Terrain', 'Available route-bound terrain planning evidence.', 'text', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.attitude, 'Attitude', 'Available vehicle attitude evidence.', 'text', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.weather, 'Weather', 'Available normalized weather evidence.', 'text', { policyKey: 'weather_observation', allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.daylight, 'Daylight', 'Available daylight estimate and source.', 'text', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.convoy, 'Convoy', 'Available convoy context and source state.', 'text', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.recoveryEquipment, 'Recovery equipment', 'Fleet recovery-equipment readiness without inferred availability.', 'text', { policyKey: 'vehicle_profile', allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.vehicleReadiness, 'Vehicle readiness', 'Fleet and loadout readiness source state.', 'text', { policyKey: 'vehicle_profile', allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.recoveryCapableVehicles, 'Recovery-capable vehicles', 'Known candidate vehicles; suitability is not inferred.', 'text', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.recoveryLeadCandidates, 'Recovery lead candidates', 'Known members eligible for operator assignment.', 'text', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.spotterCandidates, 'Spotter candidates', 'Known members eligible for operator assignment.', 'text', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.leadMemberId, 'Convoy lead', 'Available convoy lead target.', 'member_id', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.sweepMemberId, 'Convoy sweep', 'Available convoy sweep target.', 'member_id', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.bailoutOrCampContext, 'Bailout or camp', 'Operator-reviewable bailout or camp context.', 'linked_context', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.approvedProtocolsContext, 'Approved recovery protocols', 'References to approved existing recovery protocols, without novel instructions.', 'linked_context', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.approvedProtocols, 'Approved recovery protocol references', 'Bounded protocol IDs and titles.', 'text', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.communicationState, 'Dispatch connectivity', 'Available Dispatch or field communication source state.', 'text', { allowStale: true }),
    inputRequirement(VEHICLE_IMMOBILIZED_INPUT_KEYS.soloMode, 'Solo mode', 'Whether the playbook is operating for the current user only.', 'boolean', { allowStale: true }),
  ],
  steps: [
    {
      ...stepBase(VEHICLE_IMMOBILIZED_STEP_IDS.reviewInitialStatus, 'review_context', {
        title: 'Review Initial Status',
        instructions: 'Review the operator-entered stopped, occupant, hazard, communication, and route-obstruction states. Unknown fields remain unknown.',
        requiredInputKeys: [VEHICLE_IMMOBILIZED_INPUT_KEYS.initialStatusContext],
      }),
      type: 'review_context',
      contextInputKey: VEHICLE_IMMOBILIZED_INPUT_KEYS.initialStatusContext,
    },
    {
      ...stepBase(VEHICLE_IMMOBILIZED_STEP_IDS.confirmInitialStatus, 'confirm_action', {
        title: 'Confirm Initial Status',
        instructions: 'Confirm only the displayed operator observations. This step does not diagnose a mechanical failure.',
        dependsOnStepIds: [VEHICLE_IMMOBILIZED_STEP_IDS.reviewInitialStatus],
      }),
      type: 'confirm_action',
      confirmationLabel: 'Initial Vehicle Immobilized status reviewed',
    },
    {
      ...stepBase(VEHICLE_IMMOBILIZED_STEP_IDS.proposeConvoyStop, 'create_command_proposal', {
        title: 'Propose Convoy Stop Or Regroup',
        instructions: 'Prepare a lead-and-sweep coordination proposal. Confirmation does not send it, begin recovery, or change guidance.',
        requiredPermissions: ['plan_convoy_regroup'],
        dependsOnStepIds: [VEHICLE_IMMOBILIZED_STEP_IDS.confirmInitialStatus],
        skippable: true,
      }),
      type: 'create_command_proposal',
      proposal: {
        type: 'rally',
        priority: 'high',
        title: 'Vehicle Immobilized: Stop / Regroup Review',
        instructions: 'Acknowledge the affected vehicle context and await explicit operator coordination. Do not begin recovery or change route without explicit direction.',
        targetFromInputs: {
          kind: 'team',
          inputKeys: [
            VEHICLE_IMMOBILIZED_INPUT_KEYS.leadMemberId,
            VEHICLE_IMMOBILIZED_INPUT_KEYS.sweepMemberId,
          ],
          label: 'Convoy lead and sweep',
          minimumTargets: 1,
        },
        acknowledgmentFromTarget: { mode: 'all' },
        linkedContextInputKey: VEHICLE_IMMOBILIZED_INPUT_KEYS.affectedVehicleContext,
        deadlineInputKey: VEHICLE_IMMOBILIZED_INPUT_KEYS.statusDeadline,
      },
    },
    {
      ...stepBase(VEHICLE_IMMOBILIZED_STEP_IDS.assignRecoveryLead, 'assign_role', {
        title: 'Assign Recovery Lead',
        instructions: 'Assign a recovery lead for coordination. Assignment does not authorize physical recovery activity.',
        requiredPermissions: ['assign_member'],
        dependsOnStepIds: [VEHICLE_IMMOBILIZED_STEP_IDS.proposeConvoyStop],
        skippable: true,
      }),
      type: 'assign_role',
      allowedRoleIds: ['recovery_lead'],
    },
    {
      ...stepBase(VEHICLE_IMMOBILIZED_STEP_IDS.assignSpotter, 'assign_role', {
        title: 'Assign Spotter',
        instructions: 'Assign a spotter only when the team structure supports it. Assignment does not certify terrain or recovery safety.',
        requiredPermissions: ['assign_member'],
        dependsOnStepIds: [VEHICLE_IMMOBILIZED_STEP_IDS.assignRecoveryLead],
        skippable: true,
      }),
      type: 'assign_role',
      allowedRoleIds: ['spotter'],
    },
    {
      ...stepBase(VEHICLE_IMMOBILIZED_STEP_IDS.openVehicle, 'open_context', {
        title: 'Open Fleet Recovery Readiness',
        instructions: 'Open the affected vehicle and Fleet recovery-readiness snapshot. Missing equipment data remains unknown.',
        requiredInputKeys: [VEHICLE_IMMOBILIZED_INPUT_KEYS.affectedVehicleContext],
        dependsOnStepIds: [VEHICLE_IMMOBILIZED_STEP_IDS.assignSpotter],
      }),
      type: 'open_context',
      contextInputKey: VEHICLE_IMMOBILIZED_INPUT_KEYS.affectedVehicleContext,
    },
    {
      ...stepBase(VEHICLE_IMMOBILIZED_STEP_IDS.reviewApprovedProtocols, 'review_context', {
        title: 'Review Approved Recovery Protocols',
        instructions: 'Review references to approved ECS recovery and safety protocols. This playbook supplies no novel physical recovery instructions.',
        requiredInputKeys: [VEHICLE_IMMOBILIZED_INPUT_KEYS.approvedProtocolsContext],
        dependsOnStepIds: [VEHICLE_IMMOBILIZED_STEP_IDS.openVehicle],
        skippable: true,
      }),
      type: 'review_context',
      contextInputKey: VEHICLE_IMMOBILIZED_INPUT_KEYS.approvedProtocolsContext,
    },
    {
      ...stepBase(VEHICLE_IMMOBILIZED_STEP_IDS.openLocation, 'open_context', {
        title: 'Open Last Verified Location',
        instructions: 'Open the permitted last verified location. Stale context remains last verified and restricted context cannot be opened.',
        requiredInputKeys: [VEHICLE_IMMOBILIZED_INPUT_KEYS.locationContext],
        dependsOnStepIds: [VEHICLE_IMMOBILIZED_STEP_IDS.reviewApprovedProtocols],
        skippable: true,
      }),
      type: 'open_context',
      contextInputKey: VEHICLE_IMMOBILIZED_INPUT_KEYS.locationContext,
    },
    {
      ...stepBase(VEHICLE_IMMOBILIZED_STEP_IDS.openRouteSegment, 'open_context', {
        title: 'Open Route Segment',
        instructions: 'Open the current route-segment context for review. This does not reroute or replace active guidance.',
        requiredInputKeys: [VEHICLE_IMMOBILIZED_INPUT_KEYS.routeSegmentContext],
        dependsOnStepIds: [VEHICLE_IMMOBILIZED_STEP_IDS.openLocation],
        skippable: true,
      }),
      type: 'open_context',
      contextInputKey: VEHICLE_IMMOBILIZED_INPUT_KEYS.routeSegmentContext,
    },
    {
      ...stepBase(VEHICLE_IMMOBILIZED_STEP_IDS.reviewBailoutCamp, 'open_context', {
        title: 'Review Bailout Or Camp',
        instructions: 'Open an existing bailout or CampOps context for review. The playbook does not select or change the endpoint.',
        requiredInputKeys: [VEHICLE_IMMOBILIZED_INPUT_KEYS.bailoutOrCampContext],
        dependsOnStepIds: [VEHICLE_IMMOBILIZED_STEP_IDS.openRouteSegment],
        skippable: true,
      }),
      type: 'open_context',
      contextInputKey: VEHICLE_IMMOBILIZED_INPUT_KEYS.bailoutOrCampContext,
    },
    {
      ...stepBase(VEHICLE_IMMOBILIZED_STEP_IDS.recordOutcome, 'record_decision', {
        title: 'Record Recovery Or Assistance Decision',
        instructions: 'Record one supported operator-selected outcome. No recovery, reroute, incident, or external contact occurs automatically.',
        dependsOnStepIds: [VEHICLE_IMMOBILIZED_STEP_IDS.reviewBailoutCamp],
      }),
      type: 'record_decision',
      decisionKey: 'vehicle_immobilized_outcome',
    },
    {
      ...stepBase(VEHICLE_IMMOBILIZED_STEP_IDS.startStatusDeadline, 'start_deadline', {
        title: 'Start Next Status Review',
        instructions: 'Start the persisted absolute review deadline. Expiry requests operator review and sends nothing automatically.',
        requiredInputKeys: [VEHICLE_IMMOBILIZED_INPUT_KEYS.statusDeadline],
        dependsOnStepIds: [VEHICLE_IMMOBILIZED_STEP_IDS.recordOutcome],
      }),
      type: 'start_deadline',
      deadlineSource: 'vehicle_status_review',
      warningWindowMs: 15 * 60_000,
      criticalWindowMs: 5 * 60_000,
    },
    {
      ...stepBase(VEHICLE_IMMOBILIZED_STEP_IDS.requestAcknowledgments, 'request_acknowledgment', {
        title: 'Track Coordination Acknowledgments',
        instructions: 'Record the operator-selected acknowledgment targets. This does not transmit a new command.',
        dependsOnStepIds: [VEHICLE_IMMOBILIZED_STEP_IDS.startStatusDeadline],
        skippable: true,
      }),
      type: 'request_acknowledgment',
      mode: 'all',
    },
    {
      ...stepBase(VEHICLE_IMMOBILIZED_STEP_IDS.confirmOutcome, 'confirm_action', {
        title: 'Confirm Outcome',
        instructions: 'Confirm the recorded operator outcome before completing this playbook.',
        dependsOnStepIds: [VEHICLE_IMMOBILIZED_STEP_IDS.requestAcknowledgments],
      }),
      type: 'confirm_action',
      confirmationLabel: 'Confirm the operator-selected Vehicle Immobilized outcome',
    },
    {
      ...stepBase(VEHICLE_IMMOBILIZED_STEP_IDS.resolve, 'resolve', {
        title: 'Resolve Playbook',
        instructions: 'Close this coordination workflow and retain its deterministic event history.',
        dependsOnStepIds: [VEHICLE_IMMOBILIZED_STEP_IDS.confirmOutcome],
      }),
      type: 'resolve',
    },
  ],
  completionRules: {
    mode: 'explicit_resolve',
    resolveStepId: VEHICLE_IMMOBILIZED_STEP_IDS.resolve,
    prerequisiteStepIds: [
      VEHICLE_IMMOBILIZED_STEP_IDS.recordOutcome,
      VEHICLE_IMMOBILIZED_STEP_IDS.confirmOutcome,
    ],
  },
  cancellationRules: {
    allowedStates: ['draft', 'ready', 'active', 'paused', 'blocked'],
    requireReason: true,
  },
  safetyScope: 'ecs_team_coordination_only',
};

export function createVehicleImmobilizedPlaybook(
  input: VehicleImmobilizedCreateInput,
): CreateVehicleImmobilizedResult {
  const vehicleId = safeId(input.affectedVehicle?.id);
  const expeditionId = safeId(input.expeditionId);
  const actorId = safeId(input.actor?.id);
  const vehicleContext = sanitizeMissionCommandLinkedContext(input.affectedVehicle?.context);
  if (!expeditionId || !actorId || !vehicleId || !vehicleContext || vehicleContext.type !== 'vehicle') {
    return { ok: false, safeCode: 'vehicle_immobilized_context_invalid', reason: 'Expedition, actor, or affected vehicle context is invalid.' };
  }
  if (!isInitialStatus(input.initialStatus)) {
    return { ok: false, safeCode: 'vehicle_immobilized_status_invalid', reason: 'Initial vehicle status is invalid.' };
  }
  const now = normalizeIso(input.now) ?? new Date().toISOString();
  const vehicleLabel = safeText(input.affectedVehicle.label, 160) || 'Affected vehicle';
  const vehicleSources = normalizeSources(input.affectedVehicle.sourceTruth?.length
    ? input.affectedVehicle.sourceTruth
    : vehicleContext.sourceTruth
      ? [vehicleContext.sourceTruth]
      : [ecsSource(`vehicle-immobilized-fleet:${vehicleId}`, now, 'ECS Fleet profile', 'cached', 'vehicle_profile')]);
  const manualStatusSource = ecsSource(
    `vehicle-immobilized-status:${vehicleId}:${now}`,
    now,
    'ECS operator',
    'manual',
    'manual_user_state',
  );
  const clockSource = ecsSource(
    `vehicle-immobilized-clock:${vehicleId}:${now}`,
    now,
    'ECS Mission Clock',
    'inferred',
    'manual_user_state',
  );
  const statusDeadline = createVehicleImmobilizedStatusDueAt(now, input.statusReviewMinutes);
  const initialStatusContext = sanitizeMissionCommandLinkedContext({
    id: `vehicle-immobilized-status:${vehicleId}`,
    type: 'manual',
    title: `${vehicleLabel} initial status`,
    subtitle: initialStatusSummary(input.initialStatus),
    observedAt: now,
    stale: false,
    restricted: false,
    sourceTruthPolicyKey: 'manual_user_state',
    sourceTruth: manualStatusSource,
  });
  if (!initialStatusContext) {
    return { ok: false, safeCode: 'vehicle_immobilized_status_context_invalid', reason: 'Initial status context could not be created.' };
  }

  const inputs: OperationalPlaybookInputValue[] = [
    scalarInput(VEHICLE_IMMOBILIZED_INPUT_KEYS.affectedVehicleId, 'vehicle_id', vehicleId, vehicleSources, input.actor, now),
    linkedInput(VEHICLE_IMMOBILIZED_INPUT_KEYS.affectedVehicleContext, vehicleContext, contextState(vehicleContext, now), vehicleSources, input.actor, now),
    linkedInput(VEHICLE_IMMOBILIZED_INPUT_KEYS.initialStatusContext, initialStatusContext, 'available', [manualStatusSource], input.actor, now, now, true),
    scalarInput(VEHICLE_IMMOBILIZED_INPUT_KEYS.vehicleStopped, 'text', input.initialStatus.vehicleStopped, [manualStatusSource], input.actor, now, 'available', true),
    scalarInput(VEHICLE_IMMOBILIZED_INPUT_KEYS.peopleAccounted, 'text', input.initialStatus.peopleAccounted, [manualStatusSource], input.actor, now, 'available', true),
    scalarInput(VEHICLE_IMMOBILIZED_INPUT_KEYS.immediateHazard, 'text', input.initialStatus.immediateHazard, [manualStatusSource], input.actor, now, 'available', true),
    scalarInput(VEHICLE_IMMOBILIZED_INPUT_KEYS.communicationStatus, 'text', input.initialStatus.communication, [manualStatusSource], input.actor, now, 'available', true),
    scalarInput(VEHICLE_IMMOBILIZED_INPUT_KEYS.routeObstruction, 'text', input.initialStatus.routeObstruction, [manualStatusSource], input.actor, now, 'available', true),
    scalarInput(VEHICLE_IMMOBILIZED_INPUT_KEYS.currentTime, 'timestamp', now, [clockSource], input.actor, now),
    scalarInput(VEHICLE_IMMOBILIZED_INPUT_KEYS.statusDeadline, 'timestamp', statusDeadline, [clockSource], input.actor, now),
    scalarInput(VEHICLE_IMMOBILIZED_INPUT_KEYS.soloMode, 'boolean', input.soloMode, [manualStatusSource], input.actor, now),
  ];

  appendEncodedInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.occupants, normalizeMemberRefs(input.occupants), vehicleSources, input.actor, now);
  appendContextInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.locationContext, input.locationContext, input.actor, now, 'convoy_member_location');
  appendContextInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.routeContext, input.routeContext, input.actor, now);
  appendContextInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.routeSegmentContext, input.routeSegmentContext, input.actor, now);
  appendEvidenceInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.terrain, input.terrain, input.actor, now);
  appendEvidenceInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.attitude, input.attitude, input.actor, now);
  appendEvidenceInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.weather, input.weather, input.actor, now, 'weather_observation');
  appendEvidenceInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.daylight, input.daylight, input.actor, now);
  appendEvidenceInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.convoy, input.convoy, input.actor, now);
  appendEvidenceInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.recoveryEquipment, input.recoveryEquipment, input.actor, now, 'vehicle_profile');
  appendEvidenceInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.vehicleReadiness, input.vehicleReadiness, input.actor, now, 'vehicle_profile');
  appendEvidenceInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.communicationState, input.communicationState, input.actor, now);

  const recoveryVehicles = normalizeRecoveryVehicles(input.recoveryCapableVehicles ?? []);
  appendEncodedInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.recoveryCapableVehicles, recoveryVehicles, vehicleSources, input.actor, now);
  appendEncodedInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.recoveryLeadCandidates, normalizeMemberRefs(input.recoveryLeadCandidates ?? []), vehicleSources, input.actor, now);
  appendEncodedInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.spotterCandidates, normalizeMemberRefs(input.spotterCandidates ?? []), vehicleSources, input.actor, now);
  appendMemberInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.leadMemberId, input.leadMemberId, vehicleSources, input.actor, now);
  appendMemberInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.sweepMemberId, input.sweepMemberId, vehicleSources, input.actor, now);
  appendContextInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.bailoutOrCampContext, input.bailoutOrCampContext, input.actor, now);

  const protocols = normalizeProtocolRefs(input.approvedRecoveryProtocols ?? []);
  appendEncodedInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.approvedProtocols, protocols, [manualStatusSource], input.actor, now);
  const protocolContext = protocols.length > 0 ? sanitizeMissionCommandLinkedContext({
    id: `vehicle-immobilized-protocols:${vehicleId}`,
    type: 'manual',
    title: 'Approved ECS recovery protocols',
    subtitle: protocols.map((protocol) => protocol.title).join(', '),
    observedAt: now,
    stale: false,
    restricted: false,
    sourceTruthPolicyKey: 'manual_user_state',
    sourceTruth: manualStatusSource,
  }) : undefined;
  appendContextInput(inputs, VEHICLE_IMMOBILIZED_INPUT_KEYS.approvedProtocolsContext, protocolContext, input.actor, now);

  const createInput: CreateOperationalPlaybookInstanceInput = {
    expeditionId,
    actor: input.actor,
    inputs,
    sourceTruth: normalizeSources([
      ...vehicleSources,
      manualStatusSource,
      clockSource,
      ...inputs.flatMap((value) => value.sourceTruth),
    ]),
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    online: input.online,
  };
  try {
    return { ok: true, instance: createOperationalPlaybookInstance(VEHICLE_IMMOBILIZED_PLAYBOOK_DEFINITION, createInput) };
  } catch {
    return { ok: false, safeCode: 'vehicle_immobilized_instance_invalid', reason: 'Vehicle Immobilized context could not be validated.' };
  }
}

export function createVehicleImmobilizedStatusDueAt(
  now: string | number | Date,
  reviewMinutes = VEHICLE_IMMOBILIZED_DEFAULT_REVIEW_MINUTES,
): string {
  const nowIso = normalizeIso(now) ?? new Date().toISOString();
  const minutes = Number.isFinite(reviewMinutes)
    ? Math.max(1, Math.min(24 * 60, Math.round(reviewMinutes)))
    : VEHICLE_IMMOBILIZED_DEFAULT_REVIEW_MINUTES;
  return new Date(Date.parse(nowIso) + minutes * 60_000).toISOString();
}

export function selectVehicleImmobilizedContextReview(input: {
  instance: OperationalPlaybookInstance;
  commands?: MissionCommand[];
  now?: string | number | Date;
}): VehicleImmobilizedContextReview {
  const { instance } = input;
  const now = normalizeIso(input.now) ?? new Date().toISOString();
  const vehicleContext = linkedContext(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.affectedVehicleContext);
  const locationValue = instance.inputSnapshot[VEHICLE_IMMOBILIZED_INPUT_KEYS.locationContext];
  const location = locationValue?.linkedContext;
  const locationState = resolveLocationState(locationValue, now);
  const route = linkedContext(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.routeContext);
  const routeSegment = linkedContext(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.routeSegmentContext);
  const bailoutOrCamp = linkedContext(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.bailoutOrCampContext);
  const recoveryLeadCandidates = readEncodedMemberRefs(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.recoveryLeadCandidates);
  const spotterCandidates = readEncodedMemberRefs(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.spotterCandidates);
  const convoy = readEvidence(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.convoy, 'Convoy state unavailable');
  const proposal = instance.commandProposals.find((candidate) => candidate.stepId === VEHICLE_IMMOBILIZED_STEP_IDS.proposeConvoyStop);
  const correlationId = proposal ? `mission-command-proposal:${proposal.id}` : null;
  const command = proposal
    ? (input.commands ?? []).find((candidate) => candidate.id === proposal.commandId || candidate.audit.correlationId === correlationId)
    : undefined;
  const missingFields: string[] = [];
  if (locationState === 'missing' || locationState === 'unavailable') missingFields.push('last verified location');
  if (!routeSegment) missingFields.push('active route segment');
  const recoveryEquipment = readEvidence(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.recoveryEquipment, 'Recovery equipment readiness unavailable');
  if (recoveryEquipment.state === 'missing' || recoveryEquipment.state === 'unavailable') missingFields.push('recovery equipment readiness');
  const attitude = readEvidence(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.attitude, 'Vehicle attitude unavailable');
  if (attitude.state === 'missing' || attitude.state === 'unavailable') missingFields.push('vehicle attitude');
  if (recoveryLeadCandidates.length === 0) missingFields.push('recovery lead candidate');

  return {
    vehicleId: scalarString(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.affectedVehicleId),
    vehicleLabel: vehicleContext?.title ?? 'Affected vehicle',
    occupants: readEncodedMemberRefs(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.occupants),
    initialStatus: readInitialStatus(instance),
    locationState,
    locationLabel: locationState === 'restricted'
      ? 'Restricted vehicle location'
      : locationState === 'stale' || locationState === 'expired'
        ? `Last verified: ${location?.title ?? 'vehicle location'} (${locationState})`
        : locationState === 'recent'
          ? `Recent last verified: ${location?.title ?? 'vehicle location'}`
          : 'No verified vehicle location available',
    routeLabel: route?.title ?? 'No active or saved route context',
    routeSegmentLabel: routeSegment?.title ?? 'No active route segment context',
    bailoutOrCampLabel: bailoutOrCamp?.title ?? 'No bailout or camp context',
    terrain: readEvidence(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.terrain, 'Terrain context unavailable'),
    attitude,
    weather: readEvidence(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.weather, 'Weather unavailable'),
    daylight: readEvidence(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.daylight, 'Daylight unavailable'),
    convoy,
    recoveryEquipment,
    vehicleReadiness: readEvidence(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.vehicleReadiness, 'Vehicle readiness unavailable'),
    communicationState: readEvidence(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.communicationState, 'Communication state unavailable'),
    convoyAvailable: convoy.state === 'available' || convoy.state === 'stale',
    recoveryCapableVehicles: readEncodedRecoveryVehicles(instance),
    recoveryLeadCandidates,
    spotterCandidates,
    spotterSupported: spotterCandidates.length > 0,
    recoveryLead: selectAssignedMember(instance, 'recovery_lead'),
    spotter: selectAssignedMember(instance, 'spotter'),
    approvedRecoveryProtocols: readEncodedProtocols(instance),
    coordinationCommand: {
      commandId: command?.id ?? null,
      deliveryState: command?.deliveryState ?? 'not_created',
      acknowledgmentState: command?.acknowledgmentState ?? 'not_requested',
    },
    missingFields,
    safetyStatement: 'This playbook coordinates the ECS team and does not begin a recovery, diagnose a failure, reroute, or contact external assistance.',
  };
}

export function validateVehicleImmobilizedOutcome(input: {
  instance: OperationalPlaybookInstance;
  outcome: VehicleImmobilizedOutcome;
  explicitOperatorChoice: boolean;
}): { allowed: boolean; safeCode: string; reason: string } {
  if (input.instance.definitionId !== VEHICLE_IMMOBILIZED_PLAYBOOK_ID) {
    return { allowed: false, safeCode: 'vehicle_immobilized_instance_mismatch', reason: 'This is not a Vehicle Immobilized playbook.' };
  }
  if (!isVehicleImmobilizedOutcome(input.outcome)) {
    return { allowed: false, safeCode: 'vehicle_immobilized_outcome_invalid', reason: 'Vehicle Immobilized outcome is unsupported.' };
  }
  if (!input.explicitOperatorChoice) {
    return { allowed: false, safeCode: 'vehicle_immobilized_operator_confirmation_required', reason: 'An explicit operator choice is required.' };
  }
  const status = readInitialStatus(input.instance);
  if (input.outcome === 'route_blocked' && status.routeObstruction !== 'blocked') {
    return { allowed: false, safeCode: 'vehicle_immobilized_route_blockage_unconfirmed', reason: 'Route blocked requires an explicit operator-confirmed blocked route.' };
  }
  if (input.outcome === 'team_recovery_in_progress' && !selectAssignedMember(input.instance, 'recovery_lead')) {
    return { allowed: false, safeCode: 'vehicle_immobilized_recovery_lead_required', reason: 'Assign a recovery lead before recording team recovery in progress.' };
  }
  if (input.outcome === 'incident_resolved' && (
    status.peopleAccounted !== 'accounted_for' ||
    status.immediateHazard !== 'none_confirmed' ||
    status.routeObstruction !== 'clear'
  )) {
    return { allowed: false, safeCode: 'vehicle_immobilized_resolution_status_incomplete', reason: 'Incident resolved requires explicit accounted-for, no-immediate-hazard, and route-clear confirmations.' };
  }
  return { allowed: true, safeCode: 'vehicle_immobilized_outcome_allowed', reason: 'Operator-selected outcome is valid.' };
}

export function selectVehicleImmobilizedRecordedOutcome(
  instance: OperationalPlaybookInstance,
): VehicleImmobilizedOutcome | null {
  const result = [...instance.stepResults].reverse().find((candidate) => (
    candidate.stepId === VEHICLE_IMMOBILIZED_STEP_IDS.recordOutcome &&
    candidate.data.kind === 'decision_recorded'
  ));
  if (!result || result.data.kind !== 'decision_recorded') return null;
  return isVehicleImmobilizedOutcome(result.data.decision) ? result.data.decision : null;
}

export function buildVehicleImmobilizedIncidentHandoff(input: {
  instance: OperationalPlaybookInstance;
  outcome: VehicleImmobilizedOutcome;
  explicitOperatorChoice: boolean;
  now?: string | number | Date;
}): VehicleImmobilizedIncidentHandoffResult {
  const validation = validateVehicleImmobilizedOutcome(input);
  if (!validation.allowed) return { ok: false, safeCode: validation.safeCode, reason: validation.reason };
  if (input.outcome === 'self_recovered' || input.outcome === 'incident_resolved') {
    return { ok: false, safeCode: 'vehicle_immobilized_incident_outcome_not_applicable', reason: 'This resolved outcome does not require incident creation.' };
  }
  if (selectVehicleImmobilizedRecordedOutcome(input.instance) !== input.outcome) {
    return {
      ok: false,
      safeCode: 'vehicle_immobilized_outcome_not_recorded',
      reason: 'Record the operator-selected outcome before opening incident review.',
    };
  }
  const review = selectVehicleImmobilizedContextReview({ instance: input.instance, now: input.now });
  const status = review.initialStatus;
  const location = linkedContext(input.instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.locationContext);
  const route = linkedContext(input.instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.routeContext);
  const routeSegment = linkedContext(input.instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.routeSegmentContext);
  const coordinates = location && !location.restricted && validCoordinates(location.coordinates)
    ? location.coordinates
    : undefined;
  const safety: ReportIncidentSafetyState = {
    anyoneInjured: null,
    anyoneMissing: status.peopleAccounted === 'accounted_for'
      ? false
      : status.peopleAccounted === 'not_accounted_for'
        ? true
        : null,
    anyoneTrapped: null,
    activeHazard: status.immediateHazard === 'present'
      ? true
      : status.immediateHazard === 'none_confirmed'
        ? false
        : null,
    vehicleStable: null,
    groupSafe: null,
  };
  const resources: ReportIncidentResourceState = {
    vehicleDisabled: true,
    terrain: evidenceText(review.terrain),
    weather: evidenceText(review.weather),
    daylight: evidenceText(review.daylight),
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
      routeId: route?.id ?? null,
      routeLabel: route?.title ?? 'Unknown route',
      routeSegmentLabel: routeSegment?.title ?? routeSegment?.routeSegmentId ?? null,
      type: input.outcome === 'route_blocked' ? 'route_blocked' : 'vehicle_stuck',
      manualLocationDescription: `${review.vehicleLabel}: ${review.locationLabel}.`,
      location: coordinates
        ? {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            source: 'dispatch',
            capturedAt: normalizeIso(location?.observedAt),
          }
        : null,
      communicationStatus: incidentCommunicationStatus(status.communication),
      safety,
      resources,
      notes: 'Operator explicitly opened incident review from Vehicle Immobilized. This workflow does not diagnose mechanical failure, does not begin recovery or reroute, and does not contact external assistance. Approved ECS recovery protocols remain separate operator-reviewed guidance.',
      reportedBy: input.instance.actor.id,
    },
  };
}

export function isVehicleImmobilizedOutcome(value: unknown): value is VehicleImmobilizedOutcome {
  return OUTCOME_VALUES.has(value as VehicleImmobilizedOutcome);
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

function isInitialStatus(value: VehicleImmobilizedCreateInput['initialStatus'] | null | undefined): value is VehicleImmobilizedCreateInput['initialStatus'] {
  return Boolean(value &&
    VEHICLE_STOPPED_VALUES.has(value.vehicleStopped) &&
    PEOPLE_ACCOUNTED_VALUES.has(value.peopleAccounted) &&
    IMMEDIATE_HAZARD_VALUES.has(value.immediateHazard) &&
    COMMUNICATION_VALUES.has(value.communication) &&
    ROUTE_OBSTRUCTION_VALUES.has(value.routeObstruction));
}

function initialStatusSummary(status: VehicleImmobilizedCreateInput['initialStatus']): string {
  return [
    `Vehicle: ${status.vehicleStopped}`,
    `People: ${status.peopleAccounted}`,
    `Hazard: ${status.immediateHazard}`,
    `Communications: ${status.communication}`,
    `Route: ${status.routeObstruction}`,
  ].join('. ');
}

function readInitialStatus(instance: OperationalPlaybookInstance): VehicleImmobilizedCreateInput['initialStatus'] {
  return {
    vehicleStopped: readEnum(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.vehicleStopped, VEHICLE_STOPPED_VALUES, 'unknown'),
    peopleAccounted: readEnum(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.peopleAccounted, PEOPLE_ACCOUNTED_VALUES, 'unknown'),
    immediateHazard: readEnum(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.immediateHazard, IMMEDIATE_HAZARD_VALUES, 'unknown'),
    communication: readEnum(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.communicationStatus, COMMUNICATION_VALUES, 'unknown'),
    routeObstruction: readEnum(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.routeObstruction, ROUTE_OBSTRUCTION_VALUES, 'unknown'),
  };
}

function readEnum<T extends string>(
  instance: OperationalPlaybookInstance,
  key: string,
  values: ReadonlySet<T>,
  fallback: T,
): T {
  const value = scalarString(instance, key) as T | null;
  return value && values.has(value) ? value : fallback;
}

function appendContextInput(
  target: OperationalPlaybookInputValue[],
  key: string,
  value: DispatchLinkedContext | null | undefined,
  actor: MissionCommandActor,
  now: string,
  defaultPolicy: SourceTruthRef['policyKey'] = 'manual_user_state',
) {
  const context = sanitizeMissionCommandLinkedContext(value ?? undefined);
  const sources = context?.sourceTruth
    ? [context.sourceTruth]
    : [ecsSource(`${key}:${context?.id ?? 'missing'}`, now, 'ECS linked context', 'unavailable', defaultPolicy)];
  target.push(linkedInput(
    key,
    context,
    context ? contextState(context, now) : 'missing',
    sources,
    actor,
    now,
    context?.observedAt,
  ));
}

function appendEvidenceInput(
  target: OperationalPlaybookInputValue[],
  key: string,
  evidence: VehicleImmobilizedEvidenceInput | null | undefined,
  actor: MissionCommandActor,
  now: string,
  defaultPolicy: SourceTruthRef['policyKey'] = 'manual_user_state',
) {
  const label = safeText(evidence?.label, 500) || `${key.replace(/_/g, ' ')} unavailable`;
  const sources = normalizeSources(evidence?.sourceTruth?.length
    ? evidence.sourceTruth
    : [ecsSource(`${key}:${now}`, now, label, evidence ? 'manual' : 'unavailable', defaultPolicy)]);
  const state = evidence?.state ?? 'missing';
  target.push(scalarInput(
    key,
    'text',
    label,
    sources,
    actor,
    now,
    state,
    sources.some((source) => source.origin === 'manual'),
    evidence?.observedAt,
  ));
}

function appendEncodedInput(
  target: OperationalPlaybookInputValue[],
  key: string,
  value: unknown[],
  sources: SourceTruthRef[],
  actor: MissionCommandActor,
  now: string,
) {
  const encoded = JSON.stringify(value).slice(0, 1_000);
  target.push(scalarInput(key, 'text', encoded, sources, actor, now, value.length > 0 ? 'available' : 'missing'));
}

function appendMemberInput(
  target: OperationalPlaybookInputValue[],
  key: string,
  memberId: string | null | undefined,
  sources: SourceTruthRef[],
  actor: MissionCommandActor,
  now: string,
) {
  const normalized = safeId(memberId);
  if (normalized) target.push(scalarInput(key, 'member_id', normalized, sources, actor, now));
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
  observedAt?: string | null,
): OperationalPlaybookInputValue {
  return {
    schemaVersion: OPERATIONAL_PLAYBOOK_SCHEMA_VERSION,
    key,
    kind,
    state,
    scalarValue,
    sourceTruth: normalizeSources(sourceTruth),
    observedAt: normalizeIso(observedAt) ?? (kind === 'timestamp' && typeof scalarValue === 'string' ? scalarValue : capturedAt),
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
  manual = false,
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
    manual,
  };
}

function contextState(
  context: DispatchLinkedContext,
  now: string,
): OperationalPlaybookInputState {
  if (context.restricted) return 'restricted';
  if (context.stale) return 'stale';
  const source = context.sourceTruth;
  if (!source) return 'available';
  const freshness = evaluateSourceTruthRef(source, { policyKey: source.policyKey, now }).freshness;
  if (freshness === 'stale' || freshness === 'expired') return 'stale';
  if (freshness === 'unavailable') return 'unavailable';
  return 'available';
}

function resolveLocationState(
  value: OperationalPlaybookInputValue | undefined,
  now: string,
): SourceTruthFreshness | 'restricted' | 'missing' {
  if (!value || value.state === 'missing') return 'missing';
  if (value.state === 'restricted' || value.linkedContext?.restricted) return 'restricted';
  const source = value.sourceTruth[0] ?? value.linkedContext?.sourceTruth;
  if (!source) return 'unavailable';
  const freshness = evaluateSourceTruthRef(source, { policyKey: 'convoy_member_location', now }).freshness;
  if (value.state === 'stale' || value.linkedContext?.stale) {
    return freshness === 'expired' ? 'expired' : 'stale';
  }
  // A playbook stores a point-in-time snapshot, so even a source that was live at capture is shown as recent.
  return freshness === 'live' ? 'recent' : freshness;
}

function readEvidence(
  instance: OperationalPlaybookInstance,
  key: string,
  fallback: string,
): VehicleImmobilizedEvidenceInput {
  const value = instance.inputSnapshot[key];
  return {
    label: typeof value?.scalarValue === 'string' && value.scalarValue.trim() ? value.scalarValue : fallback,
    state: value?.state ?? 'missing',
    observedAt: value?.observedAt,
    sourceTruth: value?.sourceTruth ?? [],
  };
}

function linkedContext(instance: OperationalPlaybookInstance, key: string): DispatchLinkedContext | null {
  return instance.inputSnapshot[key]?.linkedContext ?? null;
}

function scalarString(instance: OperationalPlaybookInstance, key: string): string | null {
  const value = instance.inputSnapshot[key]?.scalarValue;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function selectAssignedMember(
  instance: OperationalPlaybookInstance,
  roleId: 'recovery_lead' | 'spotter',
): VehicleImmobilizedMemberRef | null {
  const result = [...instance.stepResults].reverse().find((candidate) => (
    candidate.data.kind === 'role_assigned' && candidate.data.roleId === roleId
  ));
  if (!result || result.data.kind !== 'role_assigned' || !result.data.assigneeId) return null;
  return {
    id: result.data.assigneeId,
    label: result.data.label ?? result.data.assigneeId,
    roleId,
  };
}

function normalizeMemberRefs(values: readonly VehicleImmobilizedMemberRef[]): VehicleImmobilizedMemberRef[] {
  const byId = new Map<string, VehicleImmobilizedMemberRef>();
  values.slice(0, 12).forEach((value) => {
    const id = safeId(value?.id);
    if (!id) return;
    byId.set(id, {
      id,
      label: safeText(value.label, 120) || id,
      roleId: safeId(value.roleId) ?? undefined,
    });
  });
  return [...byId.values()];
}

function normalizeRecoveryVehicles(values: VehicleImmobilizedCreateInput['recoveryCapableVehicles']): Array<{
  id: string;
  label: string;
  memberIds: string[];
}> {
  const byId = new Map<string, { id: string; label: string; memberIds: string[] }>();
  (values ?? []).slice(0, 8).forEach((value) => {
    const id = safeId(value?.id);
    if (!id) return;
    byId.set(id, {
      id,
      label: safeText(value.label, 120) || id,
      memberIds: [...new Set((value.memberIds ?? []).map(safeId).filter(isString))].slice(0, 8),
    });
  });
  return [...byId.values()];
}

function normalizeProtocolRefs(values: Array<{ id: string; title: string }>): Array<{ id: string; title: string }> {
  const byId = new Map<string, { id: string; title: string }>();
  values.slice(0, 12).forEach((value) => {
    const id = safeId(value?.id);
    const title = safeText(value?.title, 120);
    if (id && title) byId.set(id, { id, title });
  });
  return [...byId.values()];
}

function readEncodedMemberRefs(instance: OperationalPlaybookInstance, key: string): VehicleImmobilizedMemberRef[] {
  return normalizeMemberRefs(parseArray(instance, key) as VehicleImmobilizedMemberRef[]);
}

function readEncodedRecoveryVehicles(instance: OperationalPlaybookInstance): Array<{
  id: string;
  label: string;
  memberIds: string[];
}> {
  return normalizeRecoveryVehicles(parseArray(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.recoveryCapableVehicles) as VehicleImmobilizedCreateInput['recoveryCapableVehicles']);
}

function readEncodedProtocols(instance: OperationalPlaybookInstance): Array<{ id: string; title: string }> {
  return normalizeProtocolRefs(parseArray(instance, VEHICLE_IMMOBILIZED_INPUT_KEYS.approvedProtocols) as Array<{ id: string; title: string }>);
}

function parseArray(instance: OperationalPlaybookInstance, key: string): unknown[] {
  const encoded = scalarString(instance, key);
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(encoded);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function incidentCommunicationStatus(
  status: VehicleImmobilizedCommunication,
): ReportIncidentInput['communicationStatus'] {
  if (status === 'available') return 'available';
  if (status === 'degraded') return 'degraded';
  if (status === 'unavailable') return 'offline';
  return 'unknown';
}

function evidenceText(evidence: VehicleImmobilizedEvidenceInput): string {
  if (evidence.state === 'missing' || evidence.state === 'unavailable') return '';
  return `${evidence.label} (${evidence.state})`;
}

function ecsSource(
  id: string,
  observedAt: string,
  authority: string,
  origin: SourceTruthRef['origin'],
  policyKey: SourceTruthRef['policyKey'],
): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id,
    origin,
    role: 'primary',
    policyKey,
    authority,
    authorityKind: origin === 'manual' ? 'user' : origin === 'unavailable' ? 'unknown' : 'ecs',
    observedAt: origin === 'unavailable' ? null : observedAt,
    confidence: origin === 'unavailable' ? 'unknown' : origin === 'inferred' ? 'medium' : 'high',
    coverage: origin === 'unavailable' ? 'unknown' : 'complete',
    availability: origin === 'unavailable' ? 'unavailable' : 'usable',
    conflictState: 'none',
    warningCodes: origin === 'manual'
      ? ['manual_source']
      : origin === 'inferred'
        ? ['absolute_time_snapshot']
        : origin === 'unavailable'
          ? ['source_unavailable']
          : [],
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

function validCoordinates(value: DispatchLinkedContext['coordinates']): value is { latitude: number; longitude: number } {
  return Boolean(value &&
    Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90 &&
    Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180);
}

function isString(value: string | null): value is string {
  return typeof value === 'string';
}
