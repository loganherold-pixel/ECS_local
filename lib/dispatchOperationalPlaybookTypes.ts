import type { DispatchPermissionAction } from './dispatchPermissionAdapter';
import type {
  MissionCommandAcknowledgmentPolicy,
  MissionCommandActor,
  MissionCommandTarget,
  MissionCommandType,
} from './dispatchMissionCommandTypes';
import type { MissionClockDeadlineSource } from './dispatchMissionClock';
import type { DispatchLinkedContext, DispatchPriority } from './dispatchTypes';
import type { SourceTruthPolicyKey, SourceTruthRef } from './sourceTruth';

export const OPERATIONAL_PLAYBOOK_SCHEMA_VERSION = 1 as const;

export type OperationalPlaybookState =
  | 'draft'
  | 'ready'
  | 'active'
  | 'paused'
  | 'blocked'
  | 'completed'
  | 'cancelled';

export type OperationalPlaybookCapability =
  | 'mission_command'
  | 'mission_clock'
  | 'linked_context'
  | 'assignment'
  | 'acknowledgment'
  | 'offline_operation';

export type OperationalPlaybookInputKind =
  | 'text'
  | 'number'
  | 'boolean'
  | 'timestamp'
  | 'member_id'
  | 'role_id'
  | 'vehicle_id'
  | 'linked_context';

export type OperationalPlaybookInputState =
  | 'available'
  | 'stale'
  | 'missing'
  | 'restricted'
  | 'unavailable'
  | 'conflicting';

export interface OperationalPlaybookInputRequirement {
  key: string;
  label: string;
  description: string;
  kind: OperationalPlaybookInputKind;
  sourceTruthPolicyKey?: SourceTruthPolicyKey;
  allowManual: boolean;
  allowStale: boolean;
  sensitive: boolean;
}

export interface OperationalPlaybookInputValue {
  schemaVersion: 1;
  key: string;
  kind: OperationalPlaybookInputKind;
  state: OperationalPlaybookInputState;
  scalarValue?: string | number | boolean;
  linkedContext?: DispatchLinkedContext;
  sourceTruth: SourceTruthRef[];
  observedAt?: string;
  capturedAt: string;
  capturedBy: MissionCommandActor;
  manual: boolean;
}

export type OperationalPlaybookStepType =
  | 'review_context'
  | 'request_input'
  | 'create_command_proposal'
  | 'assign_role'
  | 'request_acknowledgment'
  | 'open_context'
  | 'start_deadline'
  | 'record_decision'
  | 'confirm_action'
  | 'resolve';

export interface OperationalPlaybookCommandProposalTemplate {
  type: MissionCommandType;
  priority: DispatchPriority;
  title: string;
  instructions: string;
  target?: MissionCommandTarget;
  targetFromInputs?: {
    kind: 'member' | 'team';
    inputKeys: string[];
    label?: string;
    minimumTargets?: number;
  };
  acknowledgmentPolicy?: MissionCommandAcknowledgmentPolicy;
  acknowledgmentFromTarget?: {
    mode: MissionCommandAcknowledgmentPolicy['mode'];
    requiredCount?: number;
  };
  linkedContextInputKey?: string;
  deadlineInputKey?: string;
}

interface OperationalPlaybookStepBase {
  id: string;
  type: OperationalPlaybookStepType;
  title: string;
  instructions: string;
  requiredInputKeys: string[];
  requiredPermissions: DispatchPermissionAction[];
  dependsOnStepIds: string[];
  skippable: boolean;
}

export interface OperationalPlaybookReviewContextStep extends OperationalPlaybookStepBase {
  type: 'review_context';
  contextInputKey: string;
}

export interface OperationalPlaybookRequestInputStep extends OperationalPlaybookStepBase {
  type: 'request_input';
  inputKey: string;
}

export interface OperationalPlaybookCreateCommandProposalStep extends OperationalPlaybookStepBase {
  type: 'create_command_proposal';
  proposal: OperationalPlaybookCommandProposalTemplate;
}

export interface OperationalPlaybookAssignRoleStep extends OperationalPlaybookStepBase {
  type: 'assign_role';
  allowedRoleIds: string[];
}

export interface OperationalPlaybookRequestAcknowledgmentStep extends OperationalPlaybookStepBase {
  type: 'request_acknowledgment';
  mode: Exclude<MissionCommandAcknowledgmentPolicy['mode'], 'none'>;
}

export interface OperationalPlaybookOpenContextStep extends OperationalPlaybookStepBase {
  type: 'open_context';
  contextInputKey: string;
}

export interface OperationalPlaybookStartDeadlineStep extends OperationalPlaybookStepBase {
  type: 'start_deadline';
  deadlineSource: MissionClockDeadlineSource;
  warningWindowMs?: number;
  criticalWindowMs?: number;
}

export interface OperationalPlaybookRecordDecisionStep extends OperationalPlaybookStepBase {
  type: 'record_decision';
  decisionKey: string;
}

export interface OperationalPlaybookConfirmActionStep extends OperationalPlaybookStepBase {
  type: 'confirm_action';
  confirmationLabel: string;
}

export interface OperationalPlaybookResolveStep extends OperationalPlaybookStepBase {
  type: 'resolve';
}

export type OperationalPlaybookStepDefinition =
  | OperationalPlaybookReviewContextStep
  | OperationalPlaybookRequestInputStep
  | OperationalPlaybookCreateCommandProposalStep
  | OperationalPlaybookAssignRoleStep
  | OperationalPlaybookRequestAcknowledgmentStep
  | OperationalPlaybookOpenContextStep
  | OperationalPlaybookStartDeadlineStep
  | OperationalPlaybookRecordDecisionStep
  | OperationalPlaybookConfirmActionStep
  | OperationalPlaybookResolveStep;

export type OperationalPlaybookCompletionRules =
  | { mode: 'all_required_steps'; requiredStepIds: string[] }
  | { mode: 'explicit_resolve'; resolveStepId: string; prerequisiteStepIds: string[] };

export interface OperationalPlaybookCancellationRules {
  allowedStates: OperationalPlaybookState[];
  requireReason: boolean;
}

export interface OperationalPlaybookDefinition {
  schemaVersion: 1;
  id: string;
  version: number;
  title: string;
  description: string;
  supportedScenario: string;
  requiredCapabilities: OperationalPlaybookCapability[];
  requiredPermissions: DispatchPermissionAction[];
  requiredInputs: OperationalPlaybookInputRequirement[];
  optionalInputs: OperationalPlaybookInputRequirement[];
  steps: OperationalPlaybookStepDefinition[];
  completionRules: OperationalPlaybookCompletionRules;
  cancellationRules: OperationalPlaybookCancellationRules;
  safetyScope: 'ecs_team_coordination_only';
}

export interface OperationalPlaybookSkippedStep {
  stepId: string;
  reason: string;
  actorId: string;
  skippedAt: string;
}

export interface OperationalPlaybookBlockedStep {
  stepId: string;
  reason: string;
  reasonCode: string;
  blockedAt: string;
}

export type OperationalPlaybookStepResultData =
  | { kind: 'context_reviewed'; contextId: string; stale: boolean }
  | { kind: 'input_recorded'; inputKey: string; inputState: OperationalPlaybookInputState }
  | { kind: 'command_proposal'; proposalId: string; status: 'proposed' | 'confirmed' }
  | { kind: 'role_assigned'; roleId: string; assigneeId?: string; label?: string }
  | { kind: 'acknowledgment_requested'; targetIds: string[]; requiredCount: number }
  | { kind: 'context_opened'; contextId: string }
  | { kind: 'deadline_started'; deadlineId: string; dueAt: string }
  | { kind: 'decision_recorded'; decisionKey: string; decision: string }
  | { kind: 'action_confirmed'; summary: string }
  | { kind: 'resolved'; summary: string };

export interface OperationalPlaybookStepResult {
  stepId: string;
  stepType: OperationalPlaybookStepType;
  completedAt: string;
  actorId: string;
  summary: string;
  data: OperationalPlaybookStepResultData;
}

export type OperationalPlaybookCommandProposalStatus =
  | 'proposed'
  | 'confirmed'
  | 'cancelled'
  | 'command_created';

export interface OperationalPlaybookCommandProposal {
  schemaVersion: 1;
  id: string;
  stepId: string;
  type: MissionCommandType;
  priority: DispatchPriority;
  title: string;
  instructions: string;
  target?: MissionCommandTarget;
  acknowledgmentPolicy?: MissionCommandAcknowledgmentPolicy;
  deadlineAt?: string;
  linkedContext?: DispatchLinkedContext;
  sourceTruth: SourceTruthRef[];
  status: OperationalPlaybookCommandProposalStatus;
  proposedAt: string;
  proposedBy: MissionCommandActor;
  confirmedAt?: string;
  confirmedBy?: MissionCommandActor;
  commandId?: string;
}

export interface OperationalPlaybookDeadline {
  schemaVersion: 1;
  id: string;
  stepId: string;
  expeditionId: string;
  source: MissionClockDeadlineSource;
  title: string;
  reason: string;
  dueAt: string;
  warningWindowMs: number;
  criticalWindowMs: number;
  priority: DispatchPriority;
  sourceTruth: SourceTruthRef[];
  completionState: 'active' | 'completed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
  cancelledAt?: string;
}

export type OperationalPlaybookEventType =
  | 'created'
  | 'ready'
  | 'started'
  | 'paused'
  | 'resumed'
  | 'blocked'
  | 'input_recorded'
  | 'context_reviewed'
  | 'command_proposed'
  | 'command_confirmed'
  | 'command_created'
  | 'role_assigned'
  | 'acknowledgment_requested'
  | 'context_opened'
  | 'deadline_started'
  | 'decision_recorded'
  | 'action_confirmed'
  | 'step_completed'
  | 'step_skipped'
  | 'completed'
  | 'cancelled'
  | 'migrated';

export interface OperationalPlaybookEventMetadata {
  reasonCode?: string;
  inputKey?: string;
  proposalId?: string;
  commandId?: string;
  deadlineId?: string;
  fromDefinitionVersion?: number;
  toDefinitionVersion?: number;
  offline?: boolean;
}

export interface OperationalPlaybookEvent {
  schemaVersion: 1;
  id: string;
  idempotencyKey: string;
  instanceId: string;
  expeditionId: string;
  type: OperationalPlaybookEventType;
  state: OperationalPlaybookState;
  stepId?: string;
  actor: MissionCommandActor;
  occurredAt: string;
  summary: string;
  metadata?: OperationalPlaybookEventMetadata;
}

export interface OperationalPlaybookInstance {
  schemaVersion: 1;
  version: number;
  id: string;
  idempotencyKey: string;
  definitionId: string;
  definitionVersion: number;
  expeditionId: string;
  relatedCommandId?: string;
  relatedIncidentId?: string;
  state: OperationalPlaybookState;
  currentStepId: string | null;
  completedStepIds: string[];
  skippedSteps: OperationalPlaybookSkippedStep[];
  blockedStep?: OperationalPlaybookBlockedStep;
  inputSnapshot: Record<string, OperationalPlaybookInputValue>;
  sourceTruth: SourceTruthRef[];
  actor: MissionCommandActor;
  stepResults: OperationalPlaybookStepResult[];
  commandProposals: OperationalPlaybookCommandProposal[];
  deadlines: OperationalPlaybookDeadline[];
  eventHistory: OperationalPlaybookEvent[];
  lastKnownConnectivity: 'online' | 'offline' | 'unknown';
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
}

export interface OperationalPlaybookRuntimeContext {
  permissions: {
    can: (action: DispatchPermissionAction) => { allowed: boolean; reason?: string };
  };
  availableCapabilities: ReadonlySet<OperationalPlaybookCapability>;
  online: boolean;
}

export interface OperationalPlaybookReadiness {
  ready: boolean;
  missingInputKeys: string[];
  staleInputKeys: string[];
  restrictedInputKeys: string[];
  unavailableInputKeys: string[];
  missingCapabilities: OperationalPlaybookCapability[];
  deniedPermissions: DispatchPermissionAction[];
  issueCodes: string[];
}

export type OperationalPlaybookStepAction =
  | { kind: 'complete_review' }
  | { kind: 'provide_input'; input: OperationalPlaybookInputValue }
  | { kind: 'prepare_command_proposal' }
  | { kind: 'confirm_command_proposal'; proposalId: string; confirmed: true }
  | { kind: 'assign_role'; roleId: string; assigneeId?: string; label?: string }
  | { kind: 'request_acknowledgment'; targetIds: string[]; requiredCount?: number }
  | { kind: 'open_context' }
  | { kind: 'start_deadline'; dueAt: string; title?: string; reason?: string }
  | { kind: 'record_decision'; decision: string; reasonCode?: string }
  | { kind: 'confirm_action'; confirmed: true; summary: string }
  | { kind: 'resolve'; summary: string }
  | { kind: 'skip'; reason: string }
  | { kind: 'block'; reason: string; reasonCode?: string };

export interface ExecuteOperationalPlaybookStepInput {
  actor: MissionCommandActor;
  action: OperationalPlaybookStepAction;
  idempotencyKey: string;
  occurredAt?: string;
}

export type OperationalPlaybookEffect =
  | { kind: 'open_context'; context: DispatchLinkedContext }
  | { kind: 'command_proposal_confirmed'; proposal: OperationalPlaybookCommandProposal }
  | { kind: 'deadline_started'; deadline: OperationalPlaybookDeadline };

export type OperationalPlaybookMutationResult =
  | {
      ok: true;
      changed: boolean;
      instance: OperationalPlaybookInstance;
      event: OperationalPlaybookEvent | null;
      effect: OperationalPlaybookEffect | null;
    }
  | {
      ok: false;
      changed: false;
      instance: OperationalPlaybookInstance;
      event: null;
      effect: null;
      reason: string;
      safeCode: string;
    };

export interface OperationalPlaybookMigration {
  definitionId: string;
  fromVersion: number;
  toVersion: number;
  stepIdMap?: Record<string, string>;
  inputKeyMap?: Record<string, string>;
}
