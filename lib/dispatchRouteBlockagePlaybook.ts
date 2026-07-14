import type {
  ReportIncidentInput,
  ReportIncidentResourceState,
  ReportIncidentSafetyState,
} from './incidentRecoveryWorkflowStore';
import { sanitizeMissionCommandLinkedContext } from './dispatchMissionCommandDomain';
import type { MissionCommand, MissionCommandActor } from './dispatchMissionCommandTypes';
import type { NavigateRouteSessionSnapshot } from './navigateRouteSessionStore';
import type { NavigationHandoffPayload } from './navigationHandoffStore';
import { shouldProtectActiveGuidanceFromHandoff } from './navigationActiveGuidanceGuard';
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

export const ROUTE_BLOCKAGE_PLAYBOOK_ID = 'route_blockage';
export const ROUTE_BLOCKAGE_PLAYBOOK_VERSION = 1;
export const ROUTE_BLOCKAGE_DEFAULT_REVIEW_MINUTES = 30;
export const ROUTE_BLOCKAGE_PUBLIC_PUBLISHING_ENABLED = false as const;

export const ROUTE_BLOCKAGE_STEP_IDS = {
  reviewReport: 'review-blockage-report',
  openLocation: 'open-blockage-location',
  reviewRouteImpact: 'review-active-route-impact',
  proposeHazard: 'propose-route-blockage-command',
  reviewComparison: 'review-route-comparison',
  selectAlternate: 'select-alternate-route',
  reviewBailout: 'review-bailout-or-turnaround',
  reviewCampImpact: 'review-campops-impact',
  reviewOfflineReadiness: 'review-offline-map-readiness',
  recordOutcome: 'record-route-blockage-outcome',
  startReviewDeadline: 'start-route-blockage-review-deadline',
  requestAcknowledgments: 'track-route-blockage-acknowledgments',
  confirmOutcome: 'confirm-route-blockage-outcome',
  resolve: 'resolve-route-blockage-playbook',
} as const;

const AFFECTED_MEMBER_INPUT_KEYS = [
  'affected_member_1',
  'affected_member_2',
  'affected_member_3',
  'affected_member_4',
  'affected_member_5',
  'affected_member_6',
] as const;

export const ROUTE_BLOCKAGE_INPUT_KEYS = {
  reportContext: 'blockage_report_context',
  reportSourceKind: 'blockage_report_source_kind',
  reportedCondition: 'reported_blockage_condition',
  reporterId: 'blockage_reporter_id',
  observationTime: 'blockage_observation_time',
  confidence: 'blockage_report_confidence',
  locationContext: 'blockage_location_context',
  activeRouteContext: 'active_route_context',
  activeRouteSegmentContext: 'active_route_segment_context',
  routeImpactContext: 'active_route_impact_context',
  routeImpactState: 'active_route_impact_state',
  legalAccessEvidence: 'legal_access_evidence',
  legalAccessEvidenceKind: 'legal_access_evidence_kind',
  currentConditionEvidence: 'current_condition_evidence',
  currentConditionEvidenceKind: 'current_condition_evidence_kind',
  weatherFireEvidence: 'weather_fire_context',
  routeComparisonContext: 'route_comparison_context',
  alternateCandidates: 'alternate_route_candidates',
  selectedAlternateRouteId: 'selected_alternate_route_id',
  bailoutContext: 'bailout_or_turnaround_context',
  campImpactContext: 'campops_reassessment_context',
  campReassessmentState: 'campops_reassessment_state',
  offlineReadinessContext: 'offline_map_readiness_context',
  offlineReadinessState: 'offline_map_readiness_state',
  currentTime: 'current_time',
  reviewDeadline: 'route_blockage_review_deadline',
  soloMode: 'solo_mode',
  affectedMemberIds: AFFECTED_MEMBER_INPUT_KEYS,
} as const;

export type RouteBlockageReportSourceKind =
  | 'member_report'
  | 'operator_report'
  | 'community_report'
  | 'unknown';

export type RouteBlockageReportedCondition =
  | 'blocked'
  | 'restricted'
  | 'unsafe_to_continue'
  | 'cannot_verify';

export type RouteBlockageEvidenceKind =
  | 'official_closure'
  | 'official_access_advisory'
  | 'current_condition_advisory'
  | 'community_report'
  | 'weather_fire_context'
  | 'unknown';

export type RouteBlockageRouteImpactState =
  | 'affects_active_route'
  | 'near_active_route'
  | 'outside_active_route'
  | 'unknown';

export type RouteBlockageCampReassessmentState =
  | 'recommended'
  | 'not_material'
  | 'unknown';

export type RouteBlockageOfflineReadinessState =
  | 'ready'
  | 'caution'
  | 'blocked'
  | 'missing'
  | 'unknown';

export type RouteBlockageOutcome =
  | 'obstacle_cleared'
  | 'proceed_with_caution'
  | 'turnaround'
  | 'alternate_route_selected'
  | 'camp_plan_changed'
  | 'route_abandoned'
  | 'incident_created';

export interface RouteBlockageMemberRef {
  id: string;
  label: string;
  roleId?: string | null;
}

export interface RouteBlockageEvidenceInput {
  label: string;
  state: OperationalPlaybookInputState;
  kind: RouteBlockageEvidenceKind;
  observedAt?: string | null;
  sourceTruth?: SourceTruthRef[];
}

export interface RouteBlockageAlternateCandidate {
  id: string;
  label: string;
  context?: DispatchLinkedContext | null;
  comparisonOutcome: 'improves' | 'mixed' | 'worsens' | 'unknown';
  comparisonSummary: string;
  materialCategories: string[];
  requiredUnknownCategories: string[];
  sourceTruth?: SourceTruthRef[];
}

export interface RouteBlockageCreateInput {
  expeditionId: string;
  actor: MissionCommandActor;
  soloMode: boolean;
  online: boolean;
  reportSourceKind: RouteBlockageReportSourceKind;
  reportedCondition: RouteBlockageReportedCondition;
  reporter: RouteBlockageMemberRef;
  affectedMembers: RouteBlockageMemberRef[];
  observationTime: string;
  confidence: SourceTruthRef['confidence'];
  reportSourceTruth?: SourceTruthRef[];
  locationContext?: DispatchLinkedContext | null;
  locationPermitted: boolean;
  activeRouteContext?: DispatchLinkedContext | null;
  activeRouteSegmentContext?: DispatchLinkedContext | null;
  routeImpactState: RouteBlockageRouteImpactState;
  routeImpactLabel: string;
  legalAccessEvidence?: RouteBlockageEvidenceInput | null;
  currentConditionEvidence?: RouteBlockageEvidenceInput | null;
  weatherFireEvidence?: RouteBlockageEvidenceInput | null;
  alternateCandidates?: RouteBlockageAlternateCandidate[];
  bailoutContext?: DispatchLinkedContext | null;
  campReassessmentState: RouteBlockageCampReassessmentState;
  campImpactLabel: string;
  offlineReadinessState: RouteBlockageOfflineReadinessState;
  offlineReadinessLabel: string;
  reviewMinutes?: number;
  now?: string | number | Date;
  idempotencyKey?: string;
}

export interface RouteBlockageContextReview {
  reportSourceKind: RouteBlockageReportSourceKind;
  reportedCondition: RouteBlockageReportedCondition;
  reporter: RouteBlockageMemberRef;
  observationTime: string | null;
  confidence: SourceTruthRef['confidence'];
  reportFreshness: SourceTruthFreshness;
  locationState: OperationalPlaybookInputState;
  locationLabel: string;
  routeLabel: string;
  routeSegmentLabel: string;
  routeImpactState: RouteBlockageRouteImpactState;
  routeImpactLabel: string;
  legalAccessEvidence: RouteBlockageEvidenceInput;
  currentConditionEvidence: RouteBlockageEvidenceInput;
  weatherFireEvidence: RouteBlockageEvidenceInput;
  officialClosureState: 'current' | 'stale' | 'conflicting' | 'not_established';
  alternateCandidates: RouteBlockageAlternateCandidate[];
  selectedAlternateRouteId: string | null;
  bailoutLabel: string;
  campReassessmentState: RouteBlockageCampReassessmentState;
  campImpactLabel: string;
  offlineReadinessState: RouteBlockageOfflineReadinessState;
  offlineReadinessLabel: string;
  affectedMembers: RouteBlockageMemberRef[];
  coordinationCommand: {
    commandId: string | null;
    deliveryState: MissionCommand['deliveryState'] | 'not_created';
    acknowledgmentState: MissionCommand['acknowledgmentState'] | 'not_requested';
  };
  publicPublishingAllowed: false;
  missingFields: string[];
  safetyStatement: 'A member report is not an official closure. Missing closure evidence does not prove passability. This playbook does not reroute, publish publicly, replace guidance, declare an incident, or contact external services automatically.';
}

export type CreateRouteBlockageResult =
  | { ok: true; instance: OperationalPlaybookInstance }
  | { ok: false; safeCode: string; reason: string };

export type RouteBlockageIncidentHandoffResult =
  | { ok: true; prefill: ReportIncidentInput }
  | { ok: false; safeCode: string; reason: string };

const REPORT_SOURCE_KINDS = new Set<RouteBlockageReportSourceKind>([
  'member_report', 'operator_report', 'community_report', 'unknown',
]);
const REPORTED_CONDITIONS = new Set<RouteBlockageReportedCondition>([
  'blocked', 'restricted', 'unsafe_to_continue', 'cannot_verify',
]);
const EVIDENCE_KINDS = new Set<RouteBlockageEvidenceKind>([
  'official_closure', 'official_access_advisory', 'current_condition_advisory',
  'community_report', 'weather_fire_context', 'unknown',
]);
const ROUTE_IMPACT_STATES = new Set<RouteBlockageRouteImpactState>([
  'affects_active_route', 'near_active_route', 'outside_active_route', 'unknown',
]);
const CAMP_REASSESSMENT_STATES = new Set<RouteBlockageCampReassessmentState>([
  'recommended', 'not_material', 'unknown',
]);
const OFFLINE_READINESS_STATES = new Set<RouteBlockageOfflineReadinessState>([
  'ready', 'caution', 'blocked', 'missing', 'unknown',
]);
const OUTCOMES = new Set<RouteBlockageOutcome>([
  'obstacle_cleared', 'proceed_with_caution', 'turnaround', 'alternate_route_selected',
  'camp_plan_changed', 'route_abandoned', 'incident_created',
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

export const ROUTE_BLOCKAGE_PLAYBOOK_DEFINITION: OperationalPlaybookDefinition = {
  schemaVersion: OPERATIONAL_PLAYBOOK_SCHEMA_VERSION,
  id: ROUTE_BLOCKAGE_PLAYBOOK_ID,
  version: ROUTE_BLOCKAGE_PLAYBOOK_VERSION,
  title: 'Route Blockage',
  description: 'Coordinate an ECS team response to a blocked, restricted, unsafe, or unverifiable route without automatically changing guidance or public hazard state.',
  supportedScenario: ROUTE_BLOCKAGE_PLAYBOOK_ID,
  requiredCapabilities: ['mission_command', 'mission_clock', 'linked_context', 'acknowledgment', 'offline_operation'],
  requiredPermissions: ['view_dispatch'],
  requiredInputs: [
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.reportContext, 'Blockage report', 'Point-in-time operator or member report, kept separate from official evidence.', 'linked_context', { policyKey: 'condition_closure_advisory', allowManual: true, allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.reportSourceKind, 'Report source', 'Declared origin of the user report.', 'text', { policyKey: 'condition_closure_advisory', allowManual: true, allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.reportedCondition, 'Reported condition', 'Blocked, restricted, unsafe, or unverifiable as reported.', 'text', { policyKey: 'condition_closure_advisory', allowManual: true, allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.reporterId, 'Reporter', 'Member or operator who recorded the observation.', 'member_id', { policyKey: 'condition_closure_advisory', allowManual: true, allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.observationTime, 'Observation time', 'Absolute timestamp supplied for the observation.', 'timestamp', { policyKey: 'condition_closure_advisory', allowManual: true, allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.confidence, 'Report confidence', 'Declared confidence for the user report.', 'text', { policyKey: 'condition_closure_advisory', allowManual: true, allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.routeImpactContext, 'Active route impact', 'Deterministic proximity assessment against current route geometry.', 'linked_context', { allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.routeImpactState, 'Route impact state', 'Whether the report affects, is near, is outside, or cannot be compared to the active route.', 'text', { allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.currentTime, 'Current time', 'Absolute ECS time used to establish the review deadline.', 'timestamp', { allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.reviewDeadline, 'Next operator review', 'Absolute time for the next operator decision.', 'timestamp', { allowStale: true }),
  ],
  optionalInputs: [
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.locationContext, 'Blockage location', 'Exact location only when permission and a real coordinate are available.', 'linked_context', { allowManual: true, allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.activeRouteContext, 'Active route', 'Current active or saved route context.', 'linked_context', { allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.activeRouteSegmentContext, 'Active route segment', 'Nearest current route-segment context when geometry supports it.', 'linked_context', { allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.legalAccessEvidence, 'Legal / access evidence', 'Official legal or access evidence, independent from current-condition reports.', 'text', { policyKey: 'route_legal_access_evidence', allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.legalAccessEvidenceKind, 'Legal evidence type', 'Classification of the legal/access evidence.', 'text', { policyKey: 'route_legal_access_evidence', allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.currentConditionEvidence, 'Current-condition evidence', 'Current passability or field-condition evidence, independent from legal status.', 'text', { policyKey: 'condition_closure_advisory', allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.currentConditionEvidenceKind, 'Condition evidence type', 'Classification of current-condition evidence.', 'text', { policyKey: 'condition_closure_advisory', allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.weatherFireEvidence, 'Weather / fire context', 'Environmental context that does not itself establish closure.', 'text', { policyKey: 'weather_observation', allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.routeComparisonContext, 'Route comparison', 'Deterministic alternate-route comparison with unknown inputs preserved.', 'linked_context', { allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.alternateCandidates, 'Alternate routes', 'Bounded route candidates and deterministic comparison summaries.', 'text', { allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.selectedAlternateRouteId, 'Selected alternate route', 'Operator-selected route identity. Selection does not activate guidance.', 'text', { allowManual: true, allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.bailoutContext, 'Bailout / turnaround', 'Existing locally available bailout or turnaround context.', 'linked_context', { allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.campImpactContext, 'CampOps reassessment', 'Deterministic reason to review camp arrival or endpoint impact.', 'linked_context', { allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.campReassessmentState, 'CampOps review state', 'Whether route comparison materially warrants CampOps reassessment.', 'text', { allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.offlineReadinessContext, 'Offline readiness', 'Local route and map package readiness.', 'linked_context', { policyKey: 'offline_map_route_package', allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.offlineReadinessState, 'Offline readiness state', 'Ready, caution, blocked, missing, or unknown.', 'text', { policyKey: 'offline_map_route_package', allowStale: true }),
    inputRequirement(ROUTE_BLOCKAGE_INPUT_KEYS.soloMode, 'Solo mode', 'Whether the playbook targets only the current operator.', 'boolean', { allowStale: true }),
    ...AFFECTED_MEMBER_INPUT_KEYS.map((key, index) => inputRequirement(key, `Affected member ${index + 1}`, 'Member requested to acknowledge the coordination command.', 'member_id', { allowStale: true })),
  ],
  steps: [
    {
      ...stepBase(ROUTE_BLOCKAGE_STEP_IDS.reviewReport, 'review_context', {
        title: 'Review Blockage Evidence',
        instructions: 'Review the user report, official legal/access evidence, current-condition evidence, freshness, confidence, and unknown fields separately.',
        requiredInputKeys: [ROUTE_BLOCKAGE_INPUT_KEYS.reportContext],
      }),
      type: 'review_context',
      contextInputKey: ROUTE_BLOCKAGE_INPUT_KEYS.reportContext,
    },
    {
      ...stepBase(ROUTE_BLOCKAGE_STEP_IDS.openLocation, 'open_context', {
        title: 'Open Blockage In Navigate',
        instructions: 'Open the permitted recorded location for inspection. This does not create another pin, reroute, or replace active guidance.',
        requiredInputKeys: [ROUTE_BLOCKAGE_INPUT_KEYS.locationContext],
        dependsOnStepIds: [ROUTE_BLOCKAGE_STEP_IDS.reviewReport],
        skippable: true,
      }),
      type: 'open_context',
      contextInputKey: ROUTE_BLOCKAGE_INPUT_KEYS.locationContext,
    },
    {
      ...stepBase(ROUTE_BLOCKAGE_STEP_IDS.reviewRouteImpact, 'review_context', {
        title: 'Review Active Route Impact',
        instructions: 'Review deterministic geometry proximity. Unknown geometry remains unknown and does not imply the route is passable.',
        requiredInputKeys: [ROUTE_BLOCKAGE_INPUT_KEYS.routeImpactContext],
        dependsOnStepIds: [ROUTE_BLOCKAGE_STEP_IDS.openLocation],
      }),
      type: 'review_context',
      contextInputKey: ROUTE_BLOCKAGE_INPUT_KEYS.routeImpactContext,
    },
    {
      ...stepBase(ROUTE_BLOCKAGE_STEP_IDS.proposeHazard, 'create_command_proposal', {
        title: 'Propose Hazard Coordination Command',
        instructions: 'Prepare an affected-member acknowledgment proposal. Confirmation still requires separate Command Composer submission and does not publish publicly.',
        requiredPermissions: ['broadcast_hazard'],
        dependsOnStepIds: [ROUTE_BLOCKAGE_STEP_IDS.reviewRouteImpact],
        skippable: true,
      }),
      type: 'create_command_proposal',
      proposal: {
        type: 'hazard',
        priority: 'high',
        title: 'Route Blockage: Acknowledge And Hold',
        instructions: 'Acknowledge the reported route blockage context and await explicit operator direction. Do not proceed, reroute, or publish externally based only on this message.',
        targetFromInputs: {
          kind: 'team',
          inputKeys: [...AFFECTED_MEMBER_INPUT_KEYS],
          label: 'Affected expedition members',
          minimumTargets: 1,
        },
        acknowledgmentFromTarget: { mode: 'all' },
        linkedContextInputKey: ROUTE_BLOCKAGE_INPUT_KEYS.locationContext,
        deadlineInputKey: ROUTE_BLOCKAGE_INPUT_KEYS.reviewDeadline,
      },
    },
    {
      ...stepBase(ROUTE_BLOCKAGE_STEP_IDS.reviewComparison, 'review_context', {
        title: 'Review Route Comparison',
        instructions: 'Review deterministic comparison output. The comparison is advisory and cannot select or activate a route.',
        requiredInputKeys: [ROUTE_BLOCKAGE_INPUT_KEYS.routeComparisonContext],
        dependsOnStepIds: [ROUTE_BLOCKAGE_STEP_IDS.proposeHazard],
        skippable: true,
      }),
      type: 'review_context',
      contextInputKey: ROUTE_BLOCKAGE_INPUT_KEYS.routeComparisonContext,
    },
    {
      ...stepBase(ROUTE_BLOCKAGE_STEP_IDS.selectAlternate, 'request_input', {
        title: 'Record Alternate Candidate',
        instructions: 'Optionally record an operator-selected alternate identity. This does not replace active guidance.',
        requiredInputKeys: [ROUTE_BLOCKAGE_INPUT_KEYS.selectedAlternateRouteId],
        dependsOnStepIds: [ROUTE_BLOCKAGE_STEP_IDS.reviewComparison],
        skippable: true,
      }),
      type: 'request_input',
      inputKey: ROUTE_BLOCKAGE_INPUT_KEYS.selectedAlternateRouteId,
    },
    {
      ...stepBase(ROUTE_BLOCKAGE_STEP_IDS.reviewBailout, 'open_context', {
        title: 'Review Bailout Or Turnaround',
        instructions: 'Open an existing bailout or turnaround context. The playbook does not select it or change the plan.',
        requiredInputKeys: [ROUTE_BLOCKAGE_INPUT_KEYS.bailoutContext],
        dependsOnStepIds: [ROUTE_BLOCKAGE_STEP_IDS.selectAlternate],
        skippable: true,
      }),
      type: 'open_context',
      contextInputKey: ROUTE_BLOCKAGE_INPUT_KEYS.bailoutContext,
    },
    {
      ...stepBase(ROUTE_BLOCKAGE_STEP_IDS.reviewCampImpact, 'review_context', {
        title: 'Review CampOps Reassessment',
        instructions: 'Review whether measured route impact materially changes arrival or endpoint assumptions. CampOps remains the decision authority.',
        requiredInputKeys: [ROUTE_BLOCKAGE_INPUT_KEYS.campImpactContext],
        dependsOnStepIds: [ROUTE_BLOCKAGE_STEP_IDS.reviewBailout],
        skippable: true,
      }),
      type: 'review_context',
      contextInputKey: ROUTE_BLOCKAGE_INPUT_KEYS.campImpactContext,
    },
    {
      ...stepBase(ROUTE_BLOCKAGE_STEP_IDS.reviewOfflineReadiness, 'review_context', {
        title: 'Review Offline Route Readiness',
        instructions: 'Review local map and route package readiness before relying on an alternate while disconnected.',
        requiredInputKeys: [ROUTE_BLOCKAGE_INPUT_KEYS.offlineReadinessContext],
        dependsOnStepIds: [ROUTE_BLOCKAGE_STEP_IDS.reviewCampImpact],
        skippable: true,
      }),
      type: 'review_context',
      contextInputKey: ROUTE_BLOCKAGE_INPUT_KEYS.offlineReadinessContext,
    },
    {
      ...stepBase(ROUTE_BLOCKAGE_STEP_IDS.recordOutcome, 'record_decision', {
        title: 'Record Operator Response',
        instructions: 'Record one supported response. Nothing reroutes, publishes, changes camp, or creates an incident automatically.',
        dependsOnStepIds: [ROUTE_BLOCKAGE_STEP_IDS.reviewOfflineReadiness],
      }),
      type: 'record_decision',
      decisionKey: 'route_blockage_outcome',
    },
    {
      ...stepBase(ROUTE_BLOCKAGE_STEP_IDS.startReviewDeadline, 'start_deadline', {
        title: 'Start Next Review Deadline',
        instructions: 'Start an absolute Mission Clock review deadline. Expiry requests an operator decision and sends nothing.',
        requiredInputKeys: [ROUTE_BLOCKAGE_INPUT_KEYS.reviewDeadline],
        dependsOnStepIds: [ROUTE_BLOCKAGE_STEP_IDS.recordOutcome],
      }),
      type: 'start_deadline',
      deadlineSource: 'custom',
      warningWindowMs: 10 * 60_000,
      criticalWindowMs: 3 * 60_000,
    },
    {
      ...stepBase(ROUTE_BLOCKAGE_STEP_IDS.requestAcknowledgments, 'request_acknowledgment', {
        title: 'Track Acknowledgments',
        instructions: 'Track affected-member acknowledgments. This step does not transmit another command.',
        dependsOnStepIds: [ROUTE_BLOCKAGE_STEP_IDS.startReviewDeadline],
        skippable: true,
      }),
      type: 'request_acknowledgment',
      mode: 'all',
    },
    {
      ...stepBase(ROUTE_BLOCKAGE_STEP_IDS.confirmOutcome, 'confirm_action', {
        title: 'Confirm Operator Response',
        instructions: 'Confirm the recorded response while preserving unresolved, stale, and conflicting evidence.',
        dependsOnStepIds: [ROUTE_BLOCKAGE_STEP_IDS.requestAcknowledgments],
      }),
      type: 'confirm_action',
      confirmationLabel: 'Confirm the operator-selected Route Blockage response',
    },
    {
      ...stepBase(ROUTE_BLOCKAGE_STEP_IDS.resolve, 'resolve', {
        title: 'Resolve Playbook',
        instructions: 'Close the coordination workflow and retain its deterministic audit history.',
        dependsOnStepIds: [ROUTE_BLOCKAGE_STEP_IDS.confirmOutcome],
      }),
      type: 'resolve',
    },
  ],
  completionRules: {
    mode: 'explicit_resolve',
    resolveStepId: ROUTE_BLOCKAGE_STEP_IDS.resolve,
    prerequisiteStepIds: [ROUTE_BLOCKAGE_STEP_IDS.recordOutcome, ROUTE_BLOCKAGE_STEP_IDS.confirmOutcome],
  },
  cancellationRules: {
    allowedStates: ['draft', 'ready', 'active', 'paused', 'blocked'],
    requireReason: true,
  },
  safetyScope: 'ecs_team_coordination_only',
};

export function createRouteBlockagePlaybook(input: RouteBlockageCreateInput): CreateRouteBlockageResult {
  const expeditionId = safeId(input.expeditionId);
  const actorId = safeId(input.actor?.id);
  const reporter = normalizeMember(input.reporter);
  const observationTime = normalizeIso(input.observationTime);
  if (!expeditionId || !actorId || !reporter || !observationTime) {
    return { ok: false, safeCode: 'route_blockage_context_invalid', reason: 'Expedition, actor, reporter, and observation time are required.' };
  }
  if (!REPORT_SOURCE_KINDS.has(input.reportSourceKind) || !REPORTED_CONDITIONS.has(input.reportedCondition)) {
    return { ok: false, safeCode: 'route_blockage_report_invalid', reason: 'Route blockage report source or condition is invalid.' };
  }
  if (!ROUTE_IMPACT_STATES.has(input.routeImpactState) ||
      !CAMP_REASSESSMENT_STATES.has(input.campReassessmentState) ||
      !OFFLINE_READINESS_STATES.has(input.offlineReadinessState)) {
    return { ok: false, safeCode: 'route_blockage_assessment_invalid', reason: 'Route, camp, or offline assessment state is invalid.' };
  }

  const now = normalizeIso(input.now) ?? new Date().toISOString();
  const reportSources = normalizeSources(input.reportSourceTruth?.length
    ? input.reportSourceTruth
    : [manualSource(`route-blockage-report:${reporter.id}:${observationTime}`, observationTime, reporter.label, input.confidence)]);
  const affectedMembers = normalizeMembers(input.affectedMembers);
  if (input.soloMode && !affectedMembers.some((member) => member.id === actorId)) {
    affectedMembers.unshift({ id: actorId, label: safeText(input.actor.label, 120) || actorId, roleId: input.actor.role });
  }
  const reportContext = sanitizeMissionCommandLinkedContext({
    id: `route-blockage-report:${reporter.id}:${observationTime}`,
    type: 'manual',
    title: 'Route Blockage Report',
    subtitle: `${humanize(input.reportedCondition)} / ${humanize(input.reportSourceKind)}`,
    observedAt: observationTime,
    sourceTruthPolicyKey: 'condition_closure_advisory',
    sourceTruth: reportSources[0],
    metadata: {
      reportSourceKind: input.reportSourceKind,
      reportedCondition: input.reportedCondition,
      reporterId: reporter.id,
      confidence: input.confidence,
      officialClosureClaimed: false,
    },
  });
  if (!reportContext) {
    return { ok: false, safeCode: 'route_blockage_report_context_invalid', reason: 'Route blockage report context is invalid.' };
  }

  const inputs: OperationalPlaybookInputValue[] = [];
  inputs.push(linkedInput(ROUTE_BLOCKAGE_INPUT_KEYS.reportContext, reportContext, 'available', reportSources, input.actor, now, observationTime, true));
  inputs.push(scalarInput(ROUTE_BLOCKAGE_INPUT_KEYS.reportSourceKind, 'text', input.reportSourceKind, reportSources, input.actor, now, 'available', true, observationTime));
  inputs.push(scalarInput(ROUTE_BLOCKAGE_INPUT_KEYS.reportedCondition, 'text', input.reportedCondition, reportSources, input.actor, now, 'available', true, observationTime));
  inputs.push(scalarInput(ROUTE_BLOCKAGE_INPUT_KEYS.reporterId, 'member_id', reporter.id, reportSources, input.actor, now, 'available', true, observationTime));
  inputs.push(scalarInput(ROUTE_BLOCKAGE_INPUT_KEYS.observationTime, 'timestamp', observationTime, reportSources, input.actor, now, 'available', true, observationTime));
  inputs.push(scalarInput(ROUTE_BLOCKAGE_INPUT_KEYS.confidence, 'text', normalizeConfidence(input.confidence), reportSources, input.actor, now, 'available', true, observationTime));

  const location = input.locationPermitted
    ? sanitizeMissionCommandLinkedContext(input.locationContext ?? undefined)
    : sanitizeMissionCommandLinkedContext(input.locationContext
        ? { ...input.locationContext, coordinates: undefined, restricted: true }
        : undefined);
  appendContextInput(inputs, ROUTE_BLOCKAGE_INPUT_KEYS.locationContext, location, input.actor, now, 'manual_user_state', input.locationPermitted ? undefined : 'restricted');
  appendContextInput(inputs, ROUTE_BLOCKAGE_INPUT_KEYS.activeRouteContext, input.activeRouteContext, input.actor, now);
  appendContextInput(inputs, ROUTE_BLOCKAGE_INPUT_KEYS.activeRouteSegmentContext, input.activeRouteSegmentContext, input.actor, now);

  const routeImpactSources = normalizeSources([
    ...reportSources,
    ...(input.activeRouteContext?.sourceTruth ? [input.activeRouteContext.sourceTruth] : []),
  ]);
  const routeImpactContext = manualReviewContext({
    id: `route-blockage-impact:${input.activeRouteContext?.id ?? 'unknown'}:${observationTime}`,
    title: 'Active Route Impact',
    subtitle: safeText(input.routeImpactLabel, 300) || humanize(input.routeImpactState),
    observedAt: observationTime,
    sources: routeImpactSources,
    metadata: { routeImpactState: input.routeImpactState },
  });
  inputs.push(linkedInput(ROUTE_BLOCKAGE_INPUT_KEYS.routeImpactContext, routeImpactContext, routeImpactContext ? 'available' : 'missing', routeImpactSources, input.actor, now, observationTime));
  inputs.push(scalarInput(ROUTE_BLOCKAGE_INPUT_KEYS.routeImpactState, 'text', input.routeImpactState, routeImpactSources, input.actor, now, 'available', false, observationTime));

  appendEvidenceInput(inputs, ROUTE_BLOCKAGE_INPUT_KEYS.legalAccessEvidence, input.legalAccessEvidence, input.actor, now, 'route_legal_access_evidence');
  appendEvidenceKind(inputs, ROUTE_BLOCKAGE_INPUT_KEYS.legalAccessEvidenceKind, input.legalAccessEvidence, input.actor, now, 'route_legal_access_evidence');
  appendEvidenceInput(inputs, ROUTE_BLOCKAGE_INPUT_KEYS.currentConditionEvidence, input.currentConditionEvidence, input.actor, now, 'condition_closure_advisory');
  appendEvidenceKind(inputs, ROUTE_BLOCKAGE_INPUT_KEYS.currentConditionEvidenceKind, input.currentConditionEvidence, input.actor, now, 'condition_closure_advisory');
  appendEvidenceInput(inputs, ROUTE_BLOCKAGE_INPUT_KEYS.weatherFireEvidence, input.weatherFireEvidence, input.actor, now, 'weather_observation');

  const alternates = normalizeAlternates(input.alternateCandidates ?? []);
  const comparisonSources = normalizeSources(alternates.flatMap((candidate) => candidate.sourceTruth ?? []));
  const comparisonContext = manualReviewContext({
    id: `route-blockage-comparison:${input.activeRouteContext?.id ?? 'unknown'}:${observationTime}`,
    title: 'Route Comparison',
    subtitle: alternates.length > 0
      ? `${alternates.length} deterministic candidate comparison${alternates.length === 1 ? '' : 's'}`
      : 'No alternate route comparison is available',
    observedAt: observationTime,
    sources: comparisonSources.length > 0 ? comparisonSources : routeImpactSources,
    unavailable: alternates.length === 0,
  });
  inputs.push(linkedInput(
    ROUTE_BLOCKAGE_INPUT_KEYS.routeComparisonContext,
    comparisonContext,
    alternates.length > 0 ? 'available' : 'unavailable',
    comparisonSources.length > 0 ? comparisonSources : routeImpactSources,
    input.actor,
    now,
    observationTime,
  ));
  inputs.push(scalarInput(
    ROUTE_BLOCKAGE_INPUT_KEYS.alternateCandidates,
    'text',
    JSON.stringify(alternates.map(({ context: _context, sourceTruth: _sources, ...candidate }) => candidate)).slice(0, 6_000),
    comparisonSources.length > 0 ? comparisonSources : routeImpactSources,
    input.actor,
    now,
    alternates.length > 0 ? 'available' : 'missing',
  ));

  appendContextInput(inputs, ROUTE_BLOCKAGE_INPUT_KEYS.bailoutContext, input.bailoutContext, input.actor, now);
  const campSources = routeImpactSources;
  const campContext = manualReviewContext({
    id: `route-blockage-campops:${input.activeRouteContext?.id ?? 'unknown'}:${observationTime}`,
    title: 'CampOps Reassessment',
    subtitle: safeText(input.campImpactLabel, 300) || humanize(input.campReassessmentState),
    observedAt: observationTime,
    sources: campSources,
    unavailable: input.campReassessmentState === 'unknown',
  });
  inputs.push(linkedInput(ROUTE_BLOCKAGE_INPUT_KEYS.campImpactContext, campContext, input.campReassessmentState === 'unknown' ? 'unavailable' : 'available', campSources, input.actor, now, observationTime));
  inputs.push(scalarInput(ROUTE_BLOCKAGE_INPUT_KEYS.campReassessmentState, 'text', input.campReassessmentState, campSources, input.actor, now, input.campReassessmentState === 'unknown' ? 'unavailable' : 'available'));

  const offlineSource = unavailableOrCachedSource(
    `route-blockage-offline:${input.activeRouteContext?.id ?? 'unknown'}`,
    now,
    'Offline readiness manifest',
    'offline_map_route_package',
    input.offlineReadinessState === 'missing' || input.offlineReadinessState === 'unknown',
  );
  const offlineContext = manualReviewContext({
    id: `route-blockage-offline:${input.activeRouteContext?.id ?? 'unknown'}`,
    title: 'Offline Route Readiness',
    subtitle: safeText(input.offlineReadinessLabel, 300) || humanize(input.offlineReadinessState),
    observedAt: now,
    sources: [offlineSource],
    unavailable: input.offlineReadinessState === 'missing' || input.offlineReadinessState === 'unknown',
    policyKey: 'offline_map_route_package',
  });
  inputs.push(linkedInput(ROUTE_BLOCKAGE_INPUT_KEYS.offlineReadinessContext, offlineContext, input.offlineReadinessState === 'missing' ? 'missing' : input.offlineReadinessState === 'unknown' ? 'unavailable' : 'available', [offlineSource], input.actor, now, now));
  inputs.push(scalarInput(ROUTE_BLOCKAGE_INPUT_KEYS.offlineReadinessState, 'text', input.offlineReadinessState, [offlineSource], input.actor, now, input.offlineReadinessState === 'missing' ? 'missing' : input.offlineReadinessState === 'unknown' ? 'unavailable' : 'available'));

  affectedMembers.slice(0, AFFECTED_MEMBER_INPUT_KEYS.length).forEach((member, index) => {
    inputs.push(scalarInput(AFFECTED_MEMBER_INPUT_KEYS[index], 'member_id', member.id, reportSources, input.actor, now, 'available', true, observationTime));
  });
  inputs.push(scalarInput(ROUTE_BLOCKAGE_INPUT_KEYS.soloMode, 'boolean', input.soloMode, reportSources, input.actor, now));
  inputs.push(scalarInput(ROUTE_BLOCKAGE_INPUT_KEYS.currentTime, 'timestamp', now, [absoluteTimeSource(now)], input.actor, now));
  const reviewMinutes = clampMinutes(input.reviewMinutes, ROUTE_BLOCKAGE_DEFAULT_REVIEW_MINUTES);
  const reviewDeadline = new Date(Date.parse(now) + reviewMinutes * 60_000).toISOString();
  inputs.push(scalarInput(ROUTE_BLOCKAGE_INPUT_KEYS.reviewDeadline, 'timestamp', reviewDeadline, [absoluteTimeSource(now)], input.actor, now));

  try {
    const createInput: CreateOperationalPlaybookInstanceInput = {
      expeditionId,
      actor: input.actor,
      inputs,
      sourceTruth: normalizeSources([
        ...reportSources,
        ...(input.legalAccessEvidence?.sourceTruth ?? []),
        ...(input.currentConditionEvidence?.sourceTruth ?? []),
        ...(input.weatherFireEvidence?.sourceTruth ?? []),
        ...comparisonSources,
        offlineSource,
      ]),
      idempotencyKey: safeKey(input.idempotencyKey) ?? `route-blockage:create:${expeditionId}:${reporter.id}:${observationTime}`,
      createdAt: now,
      online: input.online,
    };
    return { ok: true, instance: createOperationalPlaybookInstance(ROUTE_BLOCKAGE_PLAYBOOK_DEFINITION, createInput) };
  } catch (error) {
    return {
      ok: false,
      safeCode: 'route_blockage_create_failed',
      reason: error instanceof Error ? safeText(error.message, 240) || 'Route Blockage playbook could not be created.' : 'Route Blockage playbook could not be created.',
    };
  }
}

export function selectRouteBlockageContextReview(input: {
  instance: OperationalPlaybookInstance;
  commands?: MissionCommand[];
  members?: RouteBlockageMemberRef[];
  now?: string | number | Date;
}): RouteBlockageContextReview {
  const { instance } = input;
  const now = normalizeIso(input.now) ?? new Date().toISOString();
  const sourceKind = readEnum(instance, ROUTE_BLOCKAGE_INPUT_KEYS.reportSourceKind, REPORT_SOURCE_KINDS, 'unknown');
  const condition = readEnum(instance, ROUTE_BLOCKAGE_INPUT_KEYS.reportedCondition, REPORTED_CONDITIONS, 'cannot_verify');
  const reporterId = scalarString(instance, ROUTE_BLOCKAGE_INPUT_KEYS.reporterId) ?? instance.actor.id;
  const members = normalizeMembers(input.members ?? []);
  const reporter = members.find((member) => member.id === reporterId) ?? {
    id: reporterId,
    label: reporterId === instance.actor.id ? instance.actor.label : reporterId,
  };
  const observationTime = normalizeIso(instance.inputSnapshot[ROUTE_BLOCKAGE_INPUT_KEYS.observationTime]?.scalarValue) ?? null;
  const reportSources = instance.inputSnapshot[ROUTE_BLOCKAGE_INPUT_KEYS.reportContext]?.sourceTruth ?? [];
  const reportFreshness = reportSources[0]
    ? evaluateSourceTruthRef(reportSources[0], { policyKey: 'condition_closure_advisory', now }).freshness
    : 'unavailable';
  const location = linkedContext(instance, ROUTE_BLOCKAGE_INPUT_KEYS.locationContext);
  const legalEvidence = readEvidence(instance, ROUTE_BLOCKAGE_INPUT_KEYS.legalAccessEvidence, ROUTE_BLOCKAGE_INPUT_KEYS.legalAccessEvidenceKind, 'Legal/access evidence unavailable');
  const currentEvidence = readEvidence(instance, ROUTE_BLOCKAGE_INPUT_KEYS.currentConditionEvidence, ROUTE_BLOCKAGE_INPUT_KEYS.currentConditionEvidenceKind, 'Current-condition evidence unavailable');
  const weatherFire = readEvidence(instance, ROUTE_BLOCKAGE_INPUT_KEYS.weatherFireEvidence, null, 'Weather/fire context unavailable');
  const routeImpactState = readEnum(instance, ROUTE_BLOCKAGE_INPUT_KEYS.routeImpactState, ROUTE_IMPACT_STATES, 'unknown');
  const campState = readEnum(instance, ROUTE_BLOCKAGE_INPUT_KEYS.campReassessmentState, CAMP_REASSESSMENT_STATES, 'unknown');
  const offlineState = readEnum(instance, ROUTE_BLOCKAGE_INPUT_KEYS.offlineReadinessState, OFFLINE_READINESS_STATES, 'unknown');
  const affectedIds = AFFECTED_MEMBER_INPUT_KEYS.map((key) => scalarString(instance, key)).filter(isString);
  const affectedMembers = affectedIds.map((id) => members.find((member) => member.id === id) ?? { id, label: id });
  const proposals = instance.commandProposals.filter((proposal) => proposal.stepId === ROUTE_BLOCKAGE_STEP_IDS.proposeHazard);
  const linkedCommandId = [...proposals].reverse().find((proposal) => proposal.commandId)?.commandId ?? null;
  const command = linkedCommandId ? (input.commands ?? []).find((candidate) => candidate.id === linkedCommandId) ?? null : null;
  return {
    reportSourceKind: sourceKind,
    reportedCondition: condition,
    reporter,
    observationTime,
    confidence: normalizeConfidence(scalarString(instance, ROUTE_BLOCKAGE_INPUT_KEYS.confidence)),
    reportFreshness: reportFreshness === 'live' ? 'recent' : reportFreshness,
    locationState: instance.inputSnapshot[ROUTE_BLOCKAGE_INPUT_KEYS.locationContext]?.state ?? 'missing',
    locationLabel: location?.restricted
      ? 'Location restricted'
      : location?.title ?? 'No permitted blockage location',
    routeLabel: linkedContext(instance, ROUTE_BLOCKAGE_INPUT_KEYS.activeRouteContext)?.title ?? 'No active route context',
    routeSegmentLabel: linkedContext(instance, ROUTE_BLOCKAGE_INPUT_KEYS.activeRouteSegmentContext)?.title ?? 'No active segment context',
    routeImpactState,
    routeImpactLabel: linkedContext(instance, ROUTE_BLOCKAGE_INPUT_KEYS.routeImpactContext)?.subtitle ?? humanize(routeImpactState),
    legalAccessEvidence: legalEvidence,
    currentConditionEvidence: currentEvidence,
    weatherFireEvidence: weatherFire,
    officialClosureState: officialClosureState(legalEvidence, now),
    alternateCandidates: readAlternates(instance),
    selectedAlternateRouteId: scalarString(instance, ROUTE_BLOCKAGE_INPUT_KEYS.selectedAlternateRouteId),
    bailoutLabel: linkedContext(instance, ROUTE_BLOCKAGE_INPUT_KEYS.bailoutContext)?.title ?? 'No bailout or turnaround context',
    campReassessmentState: campState,
    campImpactLabel: linkedContext(instance, ROUTE_BLOCKAGE_INPUT_KEYS.campImpactContext)?.subtitle ?? humanize(campState),
    offlineReadinessState: offlineState,
    offlineReadinessLabel: linkedContext(instance, ROUTE_BLOCKAGE_INPUT_KEYS.offlineReadinessContext)?.subtitle ?? humanize(offlineState),
    affectedMembers,
    coordinationCommand: {
      commandId: command?.id ?? linkedCommandId,
      deliveryState: command?.deliveryState ?? 'not_created',
      acknowledgmentState: command?.acknowledgmentState ?? 'not_requested',
    },
    publicPublishingAllowed: ROUTE_BLOCKAGE_PUBLIC_PUBLISHING_ENABLED,
    missingFields: [
      !location || location.restricted ? 'permitted exact location' : null,
      routeImpactState === 'unknown' ? 'active route impact' : null,
      legalEvidence.state === 'missing' || legalEvidence.state === 'unavailable' ? 'legal/access evidence' : null,
      currentEvidence.state === 'missing' || currentEvidence.state === 'unavailable' ? 'current-condition evidence' : null,
      affectedMembers.length === 0 ? 'affected members' : null,
      offlineState === 'missing' || offlineState === 'unknown' ? 'offline route readiness' : null,
    ].filter(isString),
    safetyStatement: 'A member report is not an official closure. Missing closure evidence does not prove passability. This playbook does not reroute, publish publicly, replace guidance, declare an incident, or contact external services automatically.',
  };
}

export function validateRouteBlockageOutcome(input: {
  instance: OperationalPlaybookInstance;
  outcome: RouteBlockageOutcome;
  explicitOperatorChoice: boolean;
}): { allowed: boolean; safeCode: string; reason: string } {
  if (!input.explicitOperatorChoice) {
    return { allowed: false, safeCode: 'route_blockage_operator_confirmation_required', reason: 'An explicit operator choice is required.' };
  }
  if (!OUTCOMES.has(input.outcome)) {
    return { allowed: false, safeCode: 'route_blockage_outcome_invalid', reason: 'Route Blockage outcome is invalid.' };
  }
  const review = selectRouteBlockageContextReview({ instance: input.instance });
  if (input.outcome === 'alternate_route_selected') {
    const selectedId = review.selectedAlternateRouteId;
    if (!selectedId || !review.alternateCandidates.some((candidate) => candidate.id === selectedId)) {
      return { allowed: false, safeCode: 'route_blockage_alternate_required', reason: 'Select an available alternate candidate before recording this outcome.' };
    }
  }
  if (input.outcome === 'camp_plan_changed' && review.campReassessmentState === 'unknown') {
    return { allowed: false, safeCode: 'route_blockage_camp_impact_unknown', reason: 'Camp impact is unknown. Run or review CampOps before recording a changed camp plan.' };
  }
  return { allowed: true, safeCode: 'route_blockage_outcome_allowed', reason: 'Operator-selected outcome is valid.' };
}

export function selectRouteBlockageRecordedOutcome(instance: OperationalPlaybookInstance): RouteBlockageOutcome | null {
  const result = [...instance.stepResults].reverse().find((candidate) => (
    candidate.stepId === ROUTE_BLOCKAGE_STEP_IDS.recordOutcome && candidate.data.kind === 'decision_recorded'
  ));
  if (!result || result.data.kind !== 'decision_recorded') return null;
  return isRouteBlockageOutcome(result.data.decision) ? result.data.decision : null;
}

export function evaluateRouteBlockageGuidanceHandoff(input: {
  payload: NavigationHandoffPayload;
  activeGuidance: NavigateRouteSessionSnapshot | null | undefined;
  explicitOperatorChoice: boolean;
}): { allowed: boolean; requiresConfirmation: boolean; mutationAllowed: false; reason: string } {
  const requiresConfirmation = shouldProtectActiveGuidanceFromHandoff(input.payload, input.activeGuidance);
  if (!input.explicitOperatorChoice) {
    return { allowed: false, requiresConfirmation, mutationAllowed: false, reason: 'Explicit operator selection is required before staging an alternate route.' };
  }
  if (requiresConfirmation) {
    return { allowed: false, requiresConfirmation: true, mutationAllowed: false, reason: 'Active guidance replacement requires the existing confirmation guard.' };
  }
  return { allowed: true, requiresConfirmation: false, mutationAllowed: false, reason: 'The route may be opened for review; this playbook still performs no guidance mutation.' };
}

export function buildRouteBlockageIncidentHandoff(input: {
  instance: OperationalPlaybookInstance;
  explicitOperatorChoice: boolean;
  now?: string | number | Date;
}): RouteBlockageIncidentHandoffResult {
  if (!input.explicitOperatorChoice) {
    return { ok: false, safeCode: 'route_blockage_incident_confirmation_required', reason: 'Incident review requires explicit operator action.' };
  }
  if (selectRouteBlockageRecordedOutcome(input.instance) !== 'incident_created') {
    return { ok: false, safeCode: 'route_blockage_incident_outcome_not_recorded', reason: 'Record Incident Created before opening the Incident review form.' };
  }
  const review = selectRouteBlockageContextReview({ instance: input.instance, now: input.now });
  const location = linkedContext(input.instance, ROUTE_BLOCKAGE_INPUT_KEYS.locationContext);
  const route = linkedContext(input.instance, ROUTE_BLOCKAGE_INPUT_KEYS.activeRouteContext);
  const segment = linkedContext(input.instance, ROUTE_BLOCKAGE_INPUT_KEYS.activeRouteSegmentContext);
  const coordinates = location && !location.restricted && validCoordinates(location.coordinates)
    ? location.coordinates
    : undefined;
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
    weather: evidenceText(review.weatherFireEvidence),
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
      routeId: route?.id ?? null,
      routeLabel: route?.title ?? 'Unknown route',
      routeSegmentLabel: segment?.title ?? segment?.routeSegmentId ?? null,
      type: 'route_blocked',
      manualLocationDescription: `${review.locationLabel}. ${review.routeImpactLabel}.`,
      location: coordinates ? {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        source: 'dispatch',
        capturedAt: normalizeIso(location?.observedAt),
      } : null,
      communicationStatus: 'unknown',
      safety,
      resources,
      notes: `Operator explicitly opened Incident review from Route Blockage. User report: ${humanize(review.reportSourceKind)} / ${humanize(review.reportedCondition)}. Legal/access: ${review.legalAccessEvidence.label}. Current conditions: ${review.currentConditionEvidence.label}. A user report is not treated as an official closure, and missing closure evidence does not establish passability. No reroute, public hazard publication, external contact, or guidance replacement occurred automatically.`,
      reportedBy: input.instance.actor.id,
    },
  };
}

export function isRouteBlockageOutcome(value: unknown): value is RouteBlockageOutcome {
  return OUTCOMES.has(value as RouteBlockageOutcome);
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

function appendContextInput(
  target: OperationalPlaybookInputValue[],
  key: string,
  value: DispatchLinkedContext | null | undefined,
  actor: MissionCommandActor,
  now: string,
  policyKey: NonNullable<SourceTruthRef['policyKey']> = 'manual_user_state',
  forcedState?: OperationalPlaybookInputState,
) {
  const context = sanitizeMissionCommandLinkedContext(value ?? undefined);
  const source = context?.sourceTruth ?? unavailableOrCachedSource(`${key}:${context?.id ?? 'missing'}`, now, context?.title ?? 'Context unavailable', policyKey, !context);
  target.push(linkedInput(
    key,
    context,
    forcedState ?? (context ? contextState(context, now) : 'missing'),
    [source],
    actor,
    now,
    context?.observedAt,
  ));
}

function appendEvidenceInput(
  target: OperationalPlaybookInputValue[],
  key: string,
  evidence: RouteBlockageEvidenceInput | null | undefined,
  actor: MissionCommandActor,
  now: string,
  policyKey: NonNullable<SourceTruthRef['policyKey']>,
) {
  const label = safeText(evidence?.label, 500) || `${humanize(key)} unavailable`;
  const sources = normalizeSources(evidence?.sourceTruth?.length
    ? evidence.sourceTruth
    : [unavailableOrCachedSource(`${key}:${now}`, now, label, policyKey, !evidence)]);
  target.push(scalarInput(
    key,
    'text',
    label,
    sources,
    actor,
    now,
    evidence?.state ?? 'missing',
    sources.some((source) => source.origin === 'manual'),
    evidence?.observedAt,
  ));
}

function appendEvidenceKind(
  target: OperationalPlaybookInputValue[],
  key: string,
  evidence: RouteBlockageEvidenceInput | null | undefined,
  actor: MissionCommandActor,
  now: string,
  policyKey: NonNullable<SourceTruthRef['policyKey']>,
) {
  const kind = evidence && EVIDENCE_KINDS.has(evidence.kind) ? evidence.kind : 'unknown';
  const sources = normalizeSources(evidence?.sourceTruth?.length
    ? evidence.sourceTruth
    : [unavailableOrCachedSource(`${key}:${now}`, now, humanize(kind), policyKey, !evidence)]);
  target.push(scalarInput(key, 'text', kind, sources, actor, now, evidence?.state ?? 'missing', false, evidence?.observedAt));
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

function manualReviewContext(input: {
  id: string;
  title: string;
  subtitle: string;
  observedAt: string;
  sources: SourceTruthRef[];
  metadata?: Record<string, unknown>;
  unavailable?: boolean;
  policyKey?: SourceTruthRef['policyKey'];
}): DispatchLinkedContext | undefined {
  const sources = normalizeSources(input.sources);
  return sanitizeMissionCommandLinkedContext({
    id: input.id,
    type: 'manual',
    title: input.title,
    subtitle: input.subtitle,
    observedAt: input.observedAt,
    sourceTruthPolicyKey: input.policyKey ?? sources[0]?.policyKey ?? 'manual_user_state',
    sourceTruth: sources[0] ?? unavailableOrCachedSource(`${input.id}:unavailable`, input.observedAt, input.title, input.policyKey ?? 'manual_user_state', true),
    metadata: {
      ...(input.metadata ?? {}),
      unavailable: input.unavailable === true,
    },
  });
}

function contextState(context: DispatchLinkedContext, now: string): OperationalPlaybookInputState {
  if (context.restricted) return 'restricted';
  if (context.stale) return 'stale';
  if (!context.sourceTruth) return 'available';
  const evaluation = evaluateSourceTruthRef(context.sourceTruth, { policyKey: context.sourceTruth.policyKey, now });
  if (evaluation.conflict) return 'conflicting';
  if (evaluation.freshness === 'stale' || evaluation.freshness === 'expired') return 'stale';
  if (evaluation.freshness === 'unavailable') return 'unavailable';
  return 'available';
}

function readEvidence(
  instance: OperationalPlaybookInstance,
  labelKey: string,
  kindKey: string | null,
  fallback: string,
): RouteBlockageEvidenceInput {
  const value = instance.inputSnapshot[labelKey];
  const rawKind = kindKey ? scalarString(instance, kindKey) : null;
  const kind = rawKind && EVIDENCE_KINDS.has(rawKind as RouteBlockageEvidenceKind)
    ? rawKind as RouteBlockageEvidenceKind
    : labelKey === ROUTE_BLOCKAGE_INPUT_KEYS.weatherFireEvidence
      ? 'weather_fire_context'
      : 'unknown';
  return {
    label: typeof value?.scalarValue === 'string' && value.scalarValue.trim() ? value.scalarValue : fallback,
    state: value?.state ?? 'missing',
    kind,
    observedAt: value?.observedAt,
    sourceTruth: value?.sourceTruth ?? [],
  };
}

function officialClosureState(
  evidence: RouteBlockageEvidenceInput,
  now: string,
): RouteBlockageContextReview['officialClosureState'] {
  if (evidence.kind !== 'official_closure') return 'not_established';
  if (evidence.state === 'conflicting' || evidence.sourceTruth?.some((source) => source.conflictState === 'present' || source.conflict)) return 'conflicting';
  const official = evidence.sourceTruth?.find((source) => source.authorityKind === 'official');
  if (!official) return 'not_established';
  const freshness = evaluateSourceTruthRef(official, { policyKey: 'route_legal_access_evidence', now }).freshness;
  return freshness === 'stale' || freshness === 'expired' || evidence.state === 'stale' ? 'stale' : 'current';
}

function normalizeAlternates(values: readonly RouteBlockageAlternateCandidate[]): RouteBlockageAlternateCandidate[] {
  const byId = new Map<string, RouteBlockageAlternateCandidate>();
  values.slice(0, 8).forEach((value) => {
    const id = safeId(value?.id);
    if (!id) return;
    const outcome = ['improves', 'mixed', 'worsens', 'unknown'].includes(value.comparisonOutcome)
      ? value.comparisonOutcome
      : 'unknown';
    byId.set(id, {
      id,
      label: safeText(value.label, 160) || id,
      context: sanitizeMissionCommandLinkedContext(value.context ?? undefined) ?? null,
      comparisonOutcome: outcome as RouteBlockageAlternateCandidate['comparisonOutcome'],
      comparisonSummary: safeText(value.comparisonSummary, 500) || 'Comparison unavailable.',
      materialCategories: uniqueSafeStrings(value.materialCategories, 12),
      requiredUnknownCategories: uniqueSafeStrings(value.requiredUnknownCategories, 12),
      sourceTruth: normalizeSources(value.sourceTruth ?? []),
    });
  });
  return [...byId.values()];
}

function readAlternates(instance: OperationalPlaybookInstance): RouteBlockageAlternateCandidate[] {
  const encoded = scalarString(instance, ROUTE_BLOCKAGE_INPUT_KEYS.alternateCandidates);
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(encoded);
    return Array.isArray(parsed) ? normalizeAlternates(parsed as RouteBlockageAlternateCandidate[]) : [];
  } catch {
    return [];
  }
}

function normalizeMember(value: RouteBlockageMemberRef | null | undefined): RouteBlockageMemberRef | null {
  const id = safeId(value?.id);
  if (!id) return null;
  return { id, label: safeText(value?.label, 120) || id, roleId: safeId(value?.roleId) ?? undefined };
}

function normalizeMembers(values: readonly RouteBlockageMemberRef[]): RouteBlockageMemberRef[] {
  const byId = new Map<string, RouteBlockageMemberRef>();
  values.slice(0, 24).forEach((value) => {
    const member = normalizeMember(value);
    if (member) byId.set(member.id, member);
  });
  return [...byId.values()];
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

function linkedContext(instance: OperationalPlaybookInstance, key: string): DispatchLinkedContext | null {
  return instance.inputSnapshot[key]?.linkedContext ?? null;
}

function scalarString(instance: OperationalPlaybookInstance, key: string): string | null {
  const value = instance.inputSnapshot[key]?.scalarValue;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function manualSource(
  id: string,
  observedAt: string,
  authority: string,
  confidence: SourceTruthRef['confidence'],
): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id,
    origin: 'manual',
    role: 'primary',
    policyKey: 'condition_closure_advisory',
    authority,
    authorityKind: 'user',
    observedAt,
    confidence: normalizeConfidence(confidence),
    coverage: 'partial',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: ['manual_source', 'not_official_closure_evidence'],
  });
}

function absoluteTimeSource(now: string): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id: `route-blockage-clock:${now}`,
    origin: 'inferred',
    role: 'supporting',
    policyKey: 'manual_user_state',
    authority: 'ECS absolute clock',
    authorityKind: 'ecs',
    observedAt: now,
    confidence: 'high',
    coverage: 'complete',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: ['absolute_time_snapshot'],
  });
}

function unavailableOrCachedSource(
  id: string,
  observedAt: string,
  authority: string,
  policyKey: NonNullable<SourceTruthRef['policyKey']>,
  unavailable: boolean,
): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id,
    origin: unavailable ? 'unavailable' : 'cached',
    role: 'primary',
    policyKey,
    authority,
    authorityKind: unavailable ? 'unknown' : 'ecs',
    observedAt: unavailable ? null : observedAt,
    confidence: unavailable ? 'unknown' : 'medium',
    coverage: unavailable ? 'unknown' : 'partial',
    availability: unavailable ? 'unavailable' : 'usable',
    conflictState: 'none',
    warningCodes: unavailable ? ['source_unavailable'] : ['cached_source'],
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

function normalizeConfidence(value: unknown): SourceTruthRef['confidence'] {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'unknown';
}

function uniqueSafeStrings(values: unknown, limit: number): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => safeText(value, 100)).filter(Boolean))].slice(0, limit);
}

function evidenceText(evidence: RouteBlockageEvidenceInput): string {
  if (evidence.state === 'missing' || evidence.state === 'unavailable') return '';
  return `${evidence.label} (${evidence.state})`;
}

function clampMinutes(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(5, Math.min(24 * 60, Math.round(parsed))) : fallback;
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeText(value: unknown, max: number): string {
  return sanitizeSourceTruthDisplayText(value, max) ?? '';
}

function safeId(value: unknown): string | null {
  const normalized = String(value ?? '').trim().slice(0, 180);
  return normalized && /^[A-Za-z0-9._:-]+$/.test(normalized) ? normalized : null;
}

function safeKey(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim().slice(0, 220);
  return normalized && /^[A-Za-z0-9._:-]+$/.test(normalized) ? normalized : undefined;
}

function normalizeIso(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === 'number') return Number.isFinite(value) ? new Date(value).toISOString() : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function validCoordinates(value: DispatchLinkedContext['coordinates']): value is { latitude: number; longitude: number } {
  return Boolean(value && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180);
}

function isString(value: string | null): value is string {
  return typeof value === 'string';
}
