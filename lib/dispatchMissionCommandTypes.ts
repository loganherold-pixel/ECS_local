import type { SourceTruthRef } from './sourceTruth';
import type {
  DispatchAssignmentStatus,
  DispatchLinkedContext,
  DispatchPingType,
  DispatchPriority,
  ExpeditionMemberRole,
} from './dispatchTypes';

export const MISSION_COMMAND_SCHEMA_VERSION = 1 as const;

export type MissionCommandType = DispatchPingType | 'recovery';

export type MissionCommandOperationalState =
  | 'proposed'
  | 'ready'
  | 'active'
  | 'in_progress'
  | 'blocked'
  | 'resolved'
  | 'cancelled'
  | 'expired';

export type MissionCommandDeliveryState =
  | 'local'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'retrying'
  | 'cancelled';

export type MissionCommandAcknowledgmentState =
  | 'not_required'
  | 'pending'
  | 'partial'
  | 'complete'
  | 'declined'
  | 'expired';

export type MissionCommandTarget =
  | { kind: 'member'; memberId: string; label?: string }
  | { kind: 'role'; roleId: string; label?: string }
  | { kind: 'vehicle'; vehicleId: string; label?: string }
  | { kind: 'team'; memberIds: string[]; label?: string }
  | { kind: 'solo'; memberId: string; label?: string };

export interface MissionCommandActor {
  id: string;
  label: string;
  role?: ExpeditionMemberRole | 'system';
}

export interface MissionCommandAssignment {
  id: string;
  target: MissionCommandTarget;
  assigneeMemberId?: string;
  status: DispatchAssignmentStatus;
  assignedAt: string;
  updatedAt: string;
  sourceAssignmentId?: string;
}

export type MissionCommandAcknowledgmentMode = 'none' | 'any' | 'all' | 'count';

export interface MissionCommandAcknowledgmentPolicy {
  mode: MissionCommandAcknowledgmentMode;
  targetMemberIds: string[];
  requiredCount?: number;
  /** Preserves a role-scoped acknowledgment requirement after member resolution. */
  roleId?: string;
}

export interface MissionCommandAcknowledgment {
  id: string;
  idempotencyKey: string;
  memberId: string;
  response: 'acknowledged' | 'declined';
  respondedAt: string;
  message?: string;
  sourceAcknowledgmentId?: string;
}

export interface MissionCommandResolution {
  kind: 'resolved' | 'cancelled' | 'expired';
  summary: string;
  occurredAt: string;
  actorId: string;
  reasonCode?: string;
}

export interface MissionCommandAuditMetadata {
  schemaVersion: 1;
  sourceKind:
    | 'native'
    | 'legacy_ping'
    | 'legacy_queue_item'
    | 'legacy_assignment'
    | 'legacy_acknowledgment'
    | 'legacy_cad_event'
    | 'migration';
  sourceRecordId?: string;
  correlationId?: string;
  safetyScope: 'ecs_team_coordination_only';
}

export interface MissionCommand {
  schemaVersion: 1;
  version: number;
  id: string;
  expeditionId: string;
  creator: MissionCommandActor;
  type: MissionCommandType;
  priority: DispatchPriority;
  title: string;
  instructions: string;
  target: MissionCommandTarget;
  assignment?: MissionCommandAssignment;
  acknowledgmentPolicy: MissionCommandAcknowledgmentPolicy;
  deadlineAt?: string;
  linkedContext?: DispatchLinkedContext;
  sourceTruth: SourceTruthRef[];
  operationalState: MissionCommandOperationalState;
  deliveryState: MissionCommandDeliveryState;
  acknowledgmentState: MissionCommandAcknowledgmentState;
  acknowledgments: MissionCommandAcknowledgment[];
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  resolution?: MissionCommandResolution;
  audit: MissionCommandAuditMetadata;
}

export type MissionCommandEventType =
  | 'created'
  | 'staged'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'acknowledged'
  | 'declined'
  | 'assigned'
  | 'follow_up_requested'
  | 'started'
  | 'blocked'
  | 'resolved'
  | 'cancelled'
  | 'expired'
  | 'replayed'
  | 'retrying'
  | 'failed';

export interface MissionCommandEventMetadata {
  reasonCode?: string;
  sourceKind?: MissionCommandAuditMetadata['sourceKind'] | 'legacy_timeline_event';
  sourceRecordId?: string;
  attemptCount?: number;
}

export interface MissionCommandEvent {
  schemaVersion: 1;
  id: string;
  idempotencyKey: string;
  commandId: string;
  expeditionId: string;
  type: MissionCommandEventType;
  actor: MissionCommandActor;
  occurredAt: string;
  summary: string;
  operationalState: MissionCommandOperationalState;
  deliveryState: MissionCommandDeliveryState;
  acknowledgmentState: MissionCommandAcknowledgmentState;
  metadata?: MissionCommandEventMetadata;
}

export type MissionCommandBoardBucket =
  | 'needs_decision'
  | 'awaiting_acknowledgment'
  | 'in_progress'
  | 'resolved';

export interface MissionCommandBoard {
  needsDecision: MissionCommand[];
  awaitingAcknowledgment: MissionCommand[];
  inProgress: MissionCommand[];
  resolved: MissionCommand[];
}

export type MissionCommandMutationResult =
  | {
      ok: true;
      changed: boolean;
      command: MissionCommand;
      event: MissionCommandEvent | null;
    }
  | {
      ok: false;
      changed: false;
      command: MissionCommand;
      event: null;
      reason: string;
    };
