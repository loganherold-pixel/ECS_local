import type { MissionClockDeadlineStatus } from './dispatchMissionClock';
import type {
  MissionCommand,
  MissionCommandAcknowledgmentPolicy,
  MissionCommandActor,
  MissionCommandEvent,
  MissionCommandTarget,
} from './dispatchMissionCommandTypes';
import type { DispatchLinkedContext } from './dispatchTypes';
import type { SourceTruthRef } from './sourceTruth';

export const GUARDIAN_CHECK_IN_SCHEMA_VERSION = 1 as const;

export type GuardianCheckInTriggerType =
  | 'fixed_time'
  | 'recurring_interval'
  | 'route_checkpoint'
  | 'rally_arrival'
  | 'camp_arrival'
  | 'remote_segment_entry'
  | 'operator_requested'
  | 'post_incident_follow_up'
  | 'manual_one_time';

export type GuardianCheckInTriggerSupport =
  | 'mission_clock'
  | 'operator_confirmation'
  | 'operator_request';

export type GuardianCheckInLifecycleState =
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type GuardianCheckInResponseState =
  | 'scheduled'
  | 'requested'
  | 'queued'
  | 'delivered'
  | 'acknowledged'
  | 'delayed'
  | 'declined'
  | 'no_response'
  | 'resolved'
  | 'cancelled';

export interface GuardianCheckInTrigger {
  type: GuardianCheckInTriggerType;
  support: GuardianCheckInTriggerSupport;
  dueAt?: string;
  intervalMinutes?: number;
  linkedContext?: DispatchLinkedContext;
  includeExactLocation: boolean;
  lastTriggeredAt?: string;
}

export type GuardianCheckInEventType =
  | 'created'
  | 'trigger_confirmed'
  | 'request_linked'
  | 'delivery_updated'
  | 'response_recorded'
  | 'no_response_recorded'
  | 'decision_created'
  | 'paused'
  | 'resumed'
  | 'cycle_resolved'
  | 'cancelled';

export interface GuardianCheckInEvent {
  schemaVersion: 1;
  id: string;
  idempotencyKey: string;
  planId: string;
  expeditionId: string;
  type: GuardianCheckInEventType;
  actor: MissionCommandActor;
  occurredAt: string;
  summary: string;
  responseState: GuardianCheckInResponseState;
  commandId?: string;
  safeCode?: string;
}

export interface GuardianCheckInPlan {
  schemaVersion: 1;
  version: number;
  id: string;
  expeditionId: string;
  title: string;
  creator: MissionCommandActor;
  target: MissionCommandTarget;
  trigger: GuardianCheckInTrigger;
  acknowledgmentRequirement: MissionCommandAcknowledgmentPolicy;
  gracePeriodMinutes: number;
  nextReviewAt: string | null;
  sourceTruth: SourceTruthRef[];
  lifecycleState: GuardianCheckInLifecycleState;
  responseState: GuardianCheckInResponseState;
  soloMode: boolean;
  cycle: number;
  currentCommandId?: string;
  noResponseDecisionCommandId?: string;
  pausedAt?: string;
  pauseRemainingMs?: number;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
  events: GuardianCheckInEvent[];
}

export interface CreateGuardianCheckInPlanInput {
  expeditionId: string;
  actor: MissionCommandActor;
  title?: string;
  target: MissionCommandTarget;
  triggerType: GuardianCheckInTriggerType;
  dueAt?: string | null;
  intervalMinutes?: number | null;
  linkedContext?: DispatchLinkedContext | null;
  includeExactLocation: boolean;
  locationPermissionAllowed: boolean;
  acknowledgmentRequirement: MissionCommandAcknowledgmentPolicy;
  gracePeriodMinutes: number;
  sourceTruth?: SourceTruthRef[];
  soloMode: boolean;
  now?: string | number | Date;
  idempotencyKey?: string;
}

export type GuardianCheckInMutationResult =
  | {
      ok: true;
      changed: boolean;
      plan: GuardianCheckInPlan;
      event: GuardianCheckInEvent | null;
    }
  | {
      ok: false;
      changed: false;
      plan: GuardianCheckInPlan;
      event: null;
      safeCode: string;
      reason: string;
    };

export type CreateGuardianCheckInPlanResult =
  | { ok: true; plan: GuardianCheckInPlan }
  | { ok: false; safeCode: string; reason: string };

export type GuardianCheckInNoResponseResult =
  | {
      ok: true;
      changed: boolean;
      plan: GuardianCheckInPlan;
      planEvent: GuardianCheckInEvent | null;
      decisionCommand: MissionCommand | null;
      decisionEvent: MissionCommandEvent | null;
    }
  | {
      ok: false;
      changed: false;
      plan: GuardianCheckInPlan;
      planEvent: null;
      decisionCommand: null;
      decisionEvent: null;
      safeCode: string;
      reason: string;
    };

export interface GuardianCheckInPresentation {
  planId: string;
  title: string;
  targetLabel: string;
  triggerLabel: string;
  triggerSupport: GuardianCheckInTriggerSupport;
  lifecycleState: GuardianCheckInLifecycleState;
  responseState: GuardianCheckInResponseState;
  deadlineStatus: MissionClockDeadlineStatus | 'not_scheduled';
  nextReviewAt: string | null;
  gracePeriodMinutes: number;
  noResponseDecisionRequired: boolean;
  sourceLabel: string;
  sourceAgeLabel: string;
  accuracyLabel: string;
  locationLabel: string;
  currentCommand: MissionCommand | null;
  soloStatement: string | null;
}
