// ============================================================
// ECS DISPATCH FEED — TYPE DEFINITIONS
// ============================================================

export type DispatchEventType =
  | 'status_update'
  | 'location_checkin'
  | 'issue_report'
  | 'safety_notice'
  | 'resource_update'
  | 'task_completed';

export type DispatchPriority = 'low' | 'normal' | 'high' | 'critical';

export type DispatchCadEventType =
  | 'check_in'
  | 'ping'
  | 'assist'
  | 'rally'
  | 'resource'
  | 'hazard'
  | 'weather'
  | 'route'
  | 'terrain'
  | 'vehicle'
  | 'system'
  | 'ai_advisory';

export type DispatchCadPriority = 'normal' | 'high' | 'critical';

export type DispatchCadStatus =
  | 'new'
  | 'active'
  | 'acknowledged'
  | 'resolved'
  | 'queued'
  | 'failed'
  | 'dismissed';

export type DispatchCadSource =
  | 'manual'
  | 'team_ping'
  | 'check_in'
  | 'assist_request'
  | 'ai'
  | 'system'
  | 'offline_sync';

export type DispatchTeamMemberStatus =
  | 'connected'
  | 'offline'
  | 'on_route'
  | 'at_waypoint'
  | 'at_camp'
  | 'needs_check_in'
  | 'no_response'
  | 'unavailable'
  | 'emergency';

export type DispatchPingType =
  | 'check_in'
  | 'rally'
  | 'assist'
  | 'route'
  | 'resource'
  | 'hazard'
  | 'emergency'
  | 'general';

export type DispatchCheckInType =
  | 'manual'
  | 'scheduled'
  | 'waypoint'
  | 'offline_recovery'
  | 'safety_stale';

export type DispatchCheckInResponseStatus =
  | 'ok'
  | 'delayed'
  | 'need_assistance'
  | 'at_waypoint'
  | 'returning'
  | 'unavailable'
  | 'emergency';

export type DispatchCheckInSchedule =
  | 'off'
  | 'every_30'
  | 'every_60'
  | 'every_120'
  | 'waypoints_only';

export type DispatchDeliveryState =
  | 'draft'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'seen'
  | 'acknowledged'
  | 'accepted'
  | 'declined'
  | 'no_response'
  | 'escalated'
  | 'recovered'
  | 'failed'
  | 'retrying'
  | 'cancelled';

export type DispatchReliabilityState =
  | 'live'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'stale'
  | 'offline_risk'
  | 'recovered'
  | 'failed'
  | 'retrying'
  | 'cancelled'
  | 'unknown';

export type DispatchPingDeliveryStatus = DispatchDeliveryState;

export type DispatchQueueItemStatus =
  | 'new'
  | 'pending_response'
  | 'assigned'
  | 'in_progress'
  | 'blocked'
  | 'escalated'
  | 'needs_review'
  | 'resolved'
  | 'cancelled';

export type DispatchLinkedContextType =
  | 'expedition'
  | 'pin'
  | 'waypoint'
  | 'route_segment'
  | 'resource'
  | 'vehicle'
  | 'power'
  | 'manual';

export type DispatchCadLinkedContextType =
  | 'expedition'
  | 'current_location'
  | 'pin'
  | 'waypoint'
  | 'route_segment'
  | 'weather'
  | 'terrain'
  | 'vehicle'
  | 'resource'
  | 'manual';

export type DispatchEscalationState =
  | 'none'
  | 'monitor'
  | 'follow_up'
  | 'escalate_to_lead'
  | 'broadcast_to_team'
  | 'recommended'
  | 'escalated'
  | 'emergency_unresolved'
  | 'resolved'
  | 'recovered';

export type DispatchAssistRequestType =
  | 'vehicle'
  | 'medical'
  | 'navigation'
  | 'fuel'
  | 'water'
  | 'mechanical'
  | 'comms'
  | 'recovery'
  | 'general_support';

export type DispatchAssignmentStatus =
  | 'unassigned'
  | 'offered'
  | 'accepted'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'declined';

export type DispatchTimelineEventType =
  | 'ping'
  | 'ping_created'
  | 'ping_acknowledged'
  | 'ping_declined'
  | 'queue'
  | 'queue_escalated'
  | 'queue_resolved'
  | 'assignment'
  | 'assignment_created'
  | 'assignment_accepted'
  | 'status'
  | 'member_stale'
  | 'sync'
  | 'log'
  | 'resource_check_requested'
  | 'hazard_broadcast_sent'
  | 'assist_request_created'
  | 'sync_conflict';

export type DispatchAuditEventType =
  | 'team_ping_created'
  | 'team_ping_acknowledged'
  | 'team_ping_declined'
  | 'team_ping_escalated'
  | 'queue_item_created'
  | 'queue_item_assigned'
  | 'queue_item_reassigned'
  | 'queue_item_escalated'
  | 'queue_item_resolved'
  | 'assist_request_created'
  | 'emergency_assist_request_created'
  | 'offline_action_replayed'
  | 'failed_delivery'
  | 'permission_denied_attempt'
  | 'linked_context_changed'
  | 'member_status_stale';

export type DispatchConflictState =
  | 'none'
  | 'updated_during_sync'
  | 'needs_review';

export interface DispatchCoordinates {
  latitude: number;
  longitude: number;
}

export interface DispatchLinkedContext {
  id: string;
  type: DispatchLinkedContextType;
  title: string;
  subtitle?: string;
  coordinates?: DispatchCoordinates;
  routeSegmentId?: string;
  metadata?: Record<string, unknown>;
}

export interface DispatchCadLinkedContext {
  id: string;
  type: DispatchCadLinkedContextType;
  title: string;
  subtitle?: string;
  coordinates?: DispatchCoordinates;
  routeSegmentId?: string;
  metadata?: Record<string, unknown>;
}

export interface DispatchCadEvent {
  id: string;
  expeditionId: string;
  timestamp: string;
  type: DispatchCadEventType;
  priority: DispatchCadPriority;
  title: string;
  summary: string;
  details: string;
  status: DispatchCadStatus;
  source: DispatchCadSource;
  createdBy: string;
  linkedContext: DispatchCadLinkedContext | null;
  metadata: Record<string, unknown>;
}

export interface DispatchAuditActor {
  memberId: string;
  label: string;
  role?: ExpeditionMemberRole;
}

export interface DispatchAuditRelatedEntity {
  type: 'ping' | 'queue_item' | 'assignment' | 'assist_request' | 'timeline_event' | 'member' | 'context';
  label: string;
  reference: string;
}

export interface DispatchAuditEvent {
  id: string;
  idempotencyKey: string;
  expeditionId: string;
  eventType: DispatchAuditEventType;
  occurredAt: string;
  actor: DispatchAuditActor;
  title: string;
  description: string;
  relatedEntity?: DispatchAuditRelatedEntity;
  linkedContext?: {
    type: DispatchLinkedContextType;
    label: string;
    reference: string;
  };
  priority?: DispatchPriority;
  deliveryState?: DispatchDeliveryState;
  safetyScope: 'ecs_team_coordination_only';
}

export interface DispatchTeamMember {
  id: string;
  displayName: string;
  callSign: string;
  role: ExpeditionMemberRole;
  status: DispatchTeamMemberStatus;
  lastSeenAt: string;
  currentContext?: DispatchLinkedContext;
  coordinates?: DispatchCoordinates;
  batteryPercent?: number;
  syncState: DispatchDeliveryState;
  notes?: string;
}

export interface DispatchPing {
  id: string;
  idempotencyKey?: string;
  version?: number;
  type: DispatchPingType;
  priority: DispatchPriority;
  status: DispatchPingDeliveryStatus;
  message: string;
  createdAt: string;
  updatedAt?: string;
  createdByMemberId: string;
  targetMemberIds: string[];
  linkedContext?: DispatchLinkedContext;
  escalationState: DispatchEscalationState;
  responseDueAt?: string;
  acknowledgedByMemberIds?: string[];
  requiresAcknowledgment?: boolean;
  checkInType?: DispatchCheckInType;
  checkInSchedule?: DispatchCheckInSchedule;
  checkInResponses?: DispatchCheckInResponse[];
  reliabilityState?: DispatchReliabilityState;
  conflictState?: DispatchConflictState;
  conflictReason?: string;
  lastConflictAt?: string;
}

export interface DispatchCheckInResponse {
  memberId: string;
  status: DispatchCheckInResponseStatus;
  respondedAt: string;
  message?: string;
}

export interface DispatchAssignment {
  id: string;
  idempotencyKey?: string;
  version?: number;
  queueItemId: string;
  assigneeMemberId: string;
  status: DispatchAssignmentStatus;
  assignedAt: string;
  updatedAt?: string;
  acceptedAt?: string;
  completedAt?: string;
  notes?: string;
  conflictState?: DispatchConflictState;
  conflictReason?: string;
  lastConflictAt?: string;
}

export interface DispatchQueueItem {
  id: string;
  idempotencyKey?: string;
  version?: number;
  title: string;
  detail: string;
  status: DispatchQueueItemStatus;
  priority: DispatchPriority;
  createdAt: string;
  updatedAt: string;
  createdByMemberId: string;
  assignedMemberIds: string[];
  linkedContext: DispatchLinkedContext;
  escalationState: DispatchEscalationState;
  deliveryState: DispatchDeliveryState;
  dueAt?: string;
  tags?: string[];
  sourcePingId?: string;
  reliabilityState?: DispatchReliabilityState;
  conflictState?: DispatchConflictState;
  conflictReason?: string;
  lastConflictAt?: string;
}

export interface DispatchTimelineEvent {
  id: string;
  idempotencyKey?: string;
  version?: number;
  type: DispatchTimelineEventType;
  title: string;
  detail: string;
  occurredAt: string;
  priority: DispatchPriority;
  memberIds: string[];
  actor?: string;
  target?: string;
  linkedContext?: DispatchLinkedContext;
  queueItemId?: string;
  pingId?: string;
  deliveryState?: DispatchDeliveryState;
  escalationState?: DispatchEscalationState;
  conflictState?: DispatchConflictState;
  conflictReason?: string;
  lastConflictAt?: string;
  auditEvent?: DispatchAuditEvent;
}

export interface DispatchAssistRequest {
  id: string;
  idempotencyKey?: string;
  version?: number;
  assistType: DispatchAssistRequestType;
  priority: DispatchPriority;
  status: DispatchQueueItemStatus;
  createdAt: string;
  updatedAt?: string;
  createdByMemberId: string;
  targetMemberIds: string[];
  linkedContext?: DispatchLinkedContext;
  message: string;
  requireAcknowledgment: boolean;
  escalationState: DispatchEscalationState;
  sourcePingId?: string;
  queueItemId?: string;
  conflictState?: DispatchConflictState;
  conflictReason?: string;
  lastConflictAt?: string;
}

export interface DispatchAcknowledgment {
  id: string;
  idempotencyKey?: string;
  version?: number;
  pingId: string;
  queueItemId?: string;
  memberId: string;
  status: Extract<DispatchPingDeliveryStatus, 'acknowledged' | 'accepted' | 'declined'>;
  acknowledgedAt: string;
  message?: string;
}

export interface DispatchQueuedOfflineAction {
  id: string;
  idempotencyKey: string;
  entityType: 'ping' | 'queue_item' | 'assignment' | 'assist_request' | 'acknowledgment' | 'timeline_event';
  actionType: string;
  createdAt: string;
  replayedAt?: string;
  status: 'queued' | 'replayed' | 'failed';
  sourceEntityId?: string;
}

export type ExpeditionMemberRole = 'owner' | 'member' | 'viewer';

export type DispatchExpeditionStatus = 'draft' | 'active' | 'archived';

export interface DispatchEvent {
  id: string;
  expedition_id: string;
  created_by_user_id: string;
  event_type: DispatchEventType;
  priority: DispatchPriority;
  headline: string;
  detail: string | null;
  location_enabled: boolean;
  location_label: string | null;
  latitude: number | null;
  longitude: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
  // Enriched fields from edge function
  created_by_email?: string | null;
  created_by_display_name?: string | null;
}

export interface ExpeditionMember {
  id: string;
  expedition_id: string;
  user_id: string;
  role: ExpeditionMemberRole;
  joined_at: string;
  left_at: string | null;
}

/** Enriched member with display info from auth */
export interface ExpeditionMemberEnriched extends ExpeditionMember {
  email: string | null;
  display_name: string | null;
}

export interface ExpeditionInvite {
  id: string;
  expedition_id: string;
  invite_code: string;
  created_by_user_id: string;
  expires_at: string;
  max_uses: number | null;
  used_count: number;
  created_at: string;
  // Annotated fields from edge function
  is_expired?: boolean;
  is_maxed?: boolean;
  is_active?: boolean;
  remaining_uses?: number | null;
  expedition_title?: string | null;
}

/** Response from get_invite_info action */
export interface InviteInfo {
  invite_code: string;
  expedition_id: string;
  expedition_title: string | null;
  expedition_status: string | null;
  expires_at: string;
  remaining_uses: number | null;
  is_expired: boolean;
  is_maxed: boolean;
  is_valid: boolean;
  already_member: boolean;
}

/** Response shape from list_members with caller context */
export interface ListMembersResponse {
  members: ExpeditionMemberEnriched[];
  member_count: number;
  expedition_title: string | null;
  your_role: ExpeditionMemberRole | null;
}


// ── UI Display Mapping ──────────────────────────────────────

export const EVENT_TYPE_META: Record<DispatchEventType, { label: string; icon: string; color: string }> = {
  status_update:   { label: 'Status',    icon: 'radio-outline',          color: '#42A5F5' },
  location_checkin: { label: 'Check-In', icon: 'location-outline',      color: '#66BB6A' },
  issue_report:    { label: 'Issue',     icon: 'alert-circle-outline',  color: '#EF5350' },
  safety_notice:   { label: 'Safety',    icon: 'shield-checkmark-outline', color: '#FF7043' },
  resource_update: { label: 'Resource',  icon: 'cube-outline',          color: '#AB47BC' },
  task_completed:  { label: 'Task',      icon: 'checkmark-circle-outline', color: '#26A69A' },
};

export const ALL_EVENT_TYPES: DispatchEventType[] = [
  'status_update',
  'location_checkin',
  'issue_report',
  'safety_notice',
  'resource_update',
  'task_completed',
];

export const DISPATCH_PRIORITY_WEIGHT: Record<DispatchPriority, number> = {
  low: 1,
  normal: 2,
  high: 3,
  critical: 4,
};

export function getPriorityWeight(priority: DispatchPriority): number {
  return DISPATCH_PRIORITY_WEIGHT[priority] ?? DISPATCH_PRIORITY_WEIGHT.normal;
}

const CAD_PRIORITY_WEIGHT: Record<DispatchCadPriority, number> = {
  normal: 1,
  high: 2,
  critical: 3,
};

const CAD_TERMINAL_STATUSES: DispatchCadStatus[] = ['resolved', 'dismissed'];

export function sortCadEvents<T extends Pick<DispatchCadEvent, 'timestamp' | 'priority' | 'status'>>(
  events: T[],
): T[] {
  return [...events].sort((a, b) => {
    const aTerminal = CAD_TERMINAL_STATUSES.includes(a.status);
    const bTerminal = CAD_TERMINAL_STATUSES.includes(b.status);

    if (aTerminal !== bTerminal) {
      return aTerminal ? 1 : -1;
    }

    const priorityDiff = CAD_PRIORITY_WEIGHT[b.priority] - CAD_PRIORITY_WEIGHT[a.priority];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return Date.parse(b.timestamp) - Date.parse(a.timestamp);
  });
}

export function getCadEventTypeLabel(type: DispatchCadEventType): string {
  switch (type) {
    case 'check_in':
      return 'Check-In';
    case 'ping':
      return 'Ping';
    case 'assist':
      return 'Assist';
    case 'rally':
      return 'Rally';
    case 'resource':
      return 'Resource';
    case 'hazard':
      return 'Hazard';
    case 'weather':
      return 'Weather';
    case 'route':
      return 'Route';
    case 'terrain':
      return 'Terrain';
    case 'vehicle':
      return 'Vehicle';
    case 'system':
      return 'System';
    case 'ai_advisory':
      return 'ECS Advisory';
    default:
      return 'CAD Event';
  }
}

export function getCadPriorityLabel(priority: DispatchCadPriority): string {
  switch (priority) {
    case 'critical':
      return 'Critical';
    case 'high':
      return 'High';
    case 'normal':
      return 'Normal';
    default:
      return 'Normal';
  }
}

export function getCadStatusLabel(status: DispatchCadStatus): string {
  switch (status) {
    case 'new':
      return 'New';
    case 'active':
      return 'Active';
    case 'acknowledged':
      return 'Acknowledged';
    case 'resolved':
      return 'Resolved';
    case 'queued':
      return 'Queued';
    case 'failed':
      return 'Failed';
    case 'dismissed':
      return 'Dismissed';
    default:
      return 'Unknown';
  }
}

export function createCadEventFromPing(
  ping: DispatchPing,
  options: {
    expeditionId: string;
    createdBy?: string;
    timestamp?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  },
): DispatchCadEvent {
  const type = mapPingTypeToCadEventType(ping.type);

  return {
    id: `cad-${ping.id}`,
    expeditionId: options.expeditionId,
    timestamp: options.timestamp ?? ping.updatedAt ?? ping.createdAt,
    type,
    priority: normalizeCadPriority(ping.priority),
    title: options.title ?? getCadEventTypeLabel(type),
    summary: ping.message,
    details: ping.message,
    status: mapDeliveryStateToCadStatus(ping.status),
    source: 'team_ping',
    createdBy: options.createdBy ?? ping.createdByMemberId,
    linkedContext: normalizeCadLinkedContext(ping.linkedContext),
    metadata: {
      sourcePingId: ping.id,
      targetMemberIds: [...ping.targetMemberIds],
      acknowledgedByMemberIds: [...(ping.acknowledgedByMemberIds ?? [])],
      responseDueAt: ping.responseDueAt,
      escalationState: ping.escalationState,
      ...options.metadata,
    },
  };
}

export function createCadEventFromCheckIn(
  input: {
    ping: DispatchPing;
    response?: DispatchCheckInResponse;
    expeditionId: string;
    createdBy?: string;
    timestamp?: string;
    metadata?: Record<string, unknown>;
  },
): DispatchCadEvent {
  const responseLabel = input.response ? getCheckInResponseLabel(input.response.status) : null;
  const summary = responseLabel
    ? `Check-in response: ${responseLabel}`
    : input.ping.message;

  return {
    id: input.response
      ? `cad-check-in-${input.ping.id}-${input.response.memberId}`
      : `cad-check-in-${input.ping.id}`,
    expeditionId: input.expeditionId,
    timestamp: input.timestamp ?? input.response?.respondedAt ?? input.ping.updatedAt ?? input.ping.createdAt,
    type: 'check_in',
    priority: normalizeCadPriority(input.response?.status === 'emergency' ? 'critical' : input.ping.priority),
    title: 'Check-In',
    summary,
    details: input.response?.message ?? input.ping.message,
    status: input.response ? 'acknowledged' : mapDeliveryStateToCadStatus(input.ping.status),
    source: 'check_in',
    createdBy: input.createdBy ?? input.response?.memberId ?? input.ping.createdByMemberId,
    linkedContext: normalizeCadLinkedContext(input.ping.linkedContext),
    metadata: {
      sourcePingId: input.ping.id,
      checkInType: input.ping.checkInType,
      checkInSchedule: input.ping.checkInSchedule,
      responseStatus: input.response?.status,
      responseMemberId: input.response?.memberId,
      ...input.metadata,
    },
  };
}

export function createCadEventFromAssist(
  assist: DispatchAssistRequest,
  options: {
    expeditionId: string;
    createdBy?: string;
    timestamp?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  },
): DispatchCadEvent {
  return {
    id: `cad-${assist.id}`,
    expeditionId: options.expeditionId,
    timestamp: options.timestamp ?? assist.updatedAt ?? assist.createdAt,
    type: 'assist',
    priority: normalizeCadPriority(assist.priority),
    title: options.title ?? 'Assist Request',
    summary: assist.message,
    details: assist.message,
    status: mapQueueStatusToCadStatus(assist.status),
    source: 'assist_request',
    createdBy: options.createdBy ?? assist.createdByMemberId,
    linkedContext: normalizeCadLinkedContext(assist.linkedContext),
    metadata: {
      assistRequestId: assist.id,
      assistType: assist.assistType,
      targetMemberIds: [...assist.targetMemberIds],
      requireAcknowledgment: assist.requireAcknowledgment,
      escalationState: assist.escalationState,
      sourcePingId: assist.sourcePingId,
      queueItemId: assist.queueItemId,
      ...options.metadata,
    },
  };
}

export function createCadEventFromAiAdvisory(input: {
  id: string;
  expeditionId: string;
  timestamp: string;
  title: string;
  summary: string;
  details?: string;
  priority?: DispatchCadPriority;
  status?: DispatchCadStatus;
  createdBy?: string;
  linkedContext?: DispatchCadLinkedContext | DispatchLinkedContext | null;
  metadata?: Record<string, unknown>;
}): DispatchCadEvent {
  return {
    id: input.id.startsWith('cad-') ? input.id : `cad-${input.id}`,
    expeditionId: input.expeditionId,
    timestamp: input.timestamp,
    type: 'ai_advisory',
    priority: input.priority ?? 'normal',
    title: input.title,
    summary: input.summary,
    details: input.details ?? input.summary,
    status: input.status ?? 'active',
    source: 'ai',
    createdBy: input.createdBy ?? 'ECS',
    linkedContext: normalizeCadLinkedContext(input.linkedContext),
    metadata: input.metadata ?? {},
  };
}

function normalizeCadPriority(priority: DispatchPriority | DispatchCadPriority): DispatchCadPriority {
  return priority === 'critical' || priority === 'high' ? priority : 'normal';
}

function mapPingTypeToCadEventType(type: DispatchPingType): DispatchCadEventType {
  switch (type) {
    case 'check_in':
      return 'check_in';
    case 'rally':
      return 'rally';
    case 'assist':
    case 'emergency':
      return 'assist';
    case 'route':
      return 'route';
    case 'resource':
      return 'resource';
    case 'hazard':
      return 'hazard';
    case 'general':
    default:
      return 'ping';
  }
}

function mapDeliveryStateToCadStatus(state: DispatchDeliveryState): DispatchCadStatus {
  switch (state) {
    case 'draft':
    case 'queued':
    case 'sending':
    case 'retrying':
      return 'queued';
    case 'sent':
    case 'delivered':
    case 'seen':
    case 'accepted':
      return 'active';
    case 'acknowledged':
    case 'recovered':
      return 'acknowledged';
    case 'failed':
    case 'no_response':
    case 'escalated':
      return 'failed';
    case 'declined':
    case 'cancelled':
      return 'dismissed';
    default:
      return 'new';
  }
}

function mapQueueStatusToCadStatus(status: DispatchQueueItemStatus): DispatchCadStatus {
  switch (status) {
    case 'new':
      return 'new';
    case 'pending_response':
    case 'assigned':
    case 'in_progress':
    case 'blocked':
    case 'escalated':
    case 'needs_review':
      return 'active';
    case 'resolved':
      return 'resolved';
    case 'cancelled':
      return 'dismissed';
    default:
      return 'new';
  }
}

function normalizeCadLinkedContext(
  context: DispatchCadLinkedContext | DispatchLinkedContext | null | undefined,
): DispatchCadLinkedContext | null {
  if (!context || !isCadLinkedContextType(context.type)) {
    return null;
  }

  return {
    id: context.id,
    type: context.type,
    title: context.title,
    subtitle: context.subtitle,
    coordinates: context.coordinates,
    routeSegmentId: context.routeSegmentId,
    metadata: context.metadata,
  };
}

function isCadLinkedContextType(type: DispatchCadLinkedContextType | DispatchLinkedContextType): type is DispatchCadLinkedContextType {
  return (
    type === 'expedition' ||
    type === 'current_location' ||
    type === 'pin' ||
    type === 'waypoint' ||
    type === 'route_segment' ||
    type === 'weather' ||
    type === 'terrain' ||
    type === 'vehicle' ||
    type === 'resource' ||
    type === 'manual'
  );
}

export function getQueueStatusLabel(status: DispatchQueueItemStatus): string {
  switch (status) {
    case 'new':
      return 'New';
    case 'pending_response':
      return 'Pending Response';
    case 'assigned':
      return 'Assigned';
    case 'in_progress':
      return 'In Progress';
    case 'blocked':
      return 'Blocked';
    case 'escalated':
      return 'Escalated';
    case 'needs_review':
      return 'Needs Review';
    case 'resolved':
      return 'Resolved';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Unknown';
  }
}

export function getPingStatusLabel(status: DispatchPingDeliveryStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'queued':
      return 'Queued for delivery';
    case 'sending':
      return 'Sending';
    case 'sent':
      return 'Sent';
    case 'delivered':
      return 'Delivered';
    case 'seen':
      return 'Seen';
    case 'acknowledged':
      return 'Acknowledged';
    case 'accepted':
      return 'Accepted';
    case 'declined':
      return 'Declined';
    case 'no_response':
      return 'No Response';
    case 'escalated':
      return 'Escalated';
    case 'recovered':
      return 'Recovered after reconnect';
    case 'failed':
      return 'Delivery failed';
    case 'retrying':
      return 'Retrying';
    case 'cancelled':
      return 'Cancelled before delivery';
    default:
      return 'Unknown';
  }
}

export function getTeamMemberStatusLabel(status: DispatchTeamMemberStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'offline':
      return 'Offline';
    case 'on_route':
      return 'On Route';
    case 'at_waypoint':
      return 'At Waypoint';
    case 'at_camp':
      return 'At Camp';
    case 'needs_check_in':
      return 'Needs Check-In';
    case 'no_response':
      return 'No Response';
    case 'unavailable':
      return 'Unavailable';
    case 'emergency':
      return 'Emergency';
    default:
      return 'Unknown';
  }
}

export function getCheckInTypeLabel(type: DispatchCheckInType): string {
  switch (type) {
    case 'manual':
      return 'Manual Check-In';
    case 'scheduled':
      return 'Scheduled Check-In';
    case 'waypoint':
      return 'Waypoint Check-In';
    case 'offline_recovery':
      return 'Offline Recovery Check-In';
    case 'safety_stale':
      return 'Safety Check-In';
    default:
      return 'Check-In';
  }
}

export function getCheckInResponseLabel(status: DispatchCheckInResponseStatus): string {
  switch (status) {
    case 'ok':
      return 'OK';
    case 'delayed':
      return 'Delayed';
    case 'need_assistance':
      return 'Need Assistance';
    case 'at_waypoint':
      return 'At Waypoint';
    case 'returning':
      return 'Returning';
    case 'unavailable':
      return 'Unavailable';
    case 'emergency':
      return 'Emergency';
    default:
      return 'Response';
  }
}

export function getCheckInScheduleLabel(schedule: DispatchCheckInSchedule): string {
  switch (schedule) {
    case 'off':
      return 'Off';
    case 'every_30':
      return 'Every 30 min';
    case 'every_60':
      return 'Every 60 min';
    case 'every_120':
      return 'Every 120 min';
    case 'waypoints_only':
      return 'At waypoints only';
    default:
      return 'Off';
  }
}

export function getDeliveryStateLabel(state: DispatchDeliveryState): string {
  return getPingStatusLabel(state);
}

export function getDispatchReliabilityLabel(state: DispatchReliabilityState): string {
  switch (state) {
    case 'live':
      return 'Live';
    case 'queued':
      return 'Queued for delivery';
    case 'sending':
      return 'Sending';
    case 'sent':
      return 'Sent';
    case 'delivered':
      return 'Delivered';
    case 'stale':
      return 'Stale';
    case 'offline_risk':
      return 'Offline Risk';
    case 'recovered':
      return 'Recovered after reconnect';
    case 'failed':
      return 'Delivery failed';
    case 'retrying':
      return 'Retrying';
    case 'cancelled':
      return 'Cancelled before delivery';
    default:
      return 'Unknown';
  }
}

export function getEscalationRecommendation(input: {
  priority: DispatchPriority;
  status?: DispatchQueueItemStatus | DispatchPingDeliveryStatus;
  escalationState?: DispatchEscalationState;
}): string {
  if (
    input.escalationState === 'emergency_unresolved' ||
    input.escalationState === 'broadcast_to_team'
  ) {
    return 'Emergency coordination unresolved. Broadcast team status and keep command oversight active.';
  }

  if (input.escalationState === 'escalate_to_lead') {
    return 'Escalate to expedition lead and request immediate acknowledgement.';
  }

  if (input.escalationState === 'follow_up') {
    return 'Follow-up required. Re-ping assigned members and watch the acknowledgement timer.';
  }

  if (input.escalationState === 'escalated' || input.status === 'escalated') {
    return 'Escalation active. Maintain command oversight until recovery is confirmed.';
  }

  if (input.escalationState === 'resolved') {
    return 'Escalation resolved. Keep the timeline available for expedition review.';
  }

  if (input.status === 'needs_review') {
    return 'Dispatch item updated during sync. Review before taking the next action.';
  }

  if (input.priority === 'critical') {
    return 'Escalate now and request immediate acknowledgement.';
  }

  if (input.status === 'no_response' || input.status === 'blocked') {
    return 'Escalation recommended if the next check-in window is missed.';
  }

  if (input.priority === 'high' || input.escalationState === 'recommended') {
    return 'Monitor closely and prepare an escalation path.';
  }

  return 'No escalation recommended.';
}

export function sortDispatchQueue<T extends Pick<DispatchQueueItem, 'priority' | 'createdAt' | 'status'> & {
  escalationState?: DispatchEscalationState;
  deliveryState?: DispatchDeliveryState;
  updatedAt?: string;
}>(
  items: T[],
): T[] {
  const terminalStatuses: DispatchQueueItemStatus[] = ['resolved', 'cancelled'];

  return [...items].sort((a, b) => {
    const aTerminal = terminalStatuses.includes(a.status);
    const bTerminal = terminalStatuses.includes(b.status);

    if (aTerminal !== bTerminal) {
      return aTerminal ? 1 : -1;
    }

    const comparisons = [
      Number(b.priority === 'critical') - Number(a.priority === 'critical'),
      Number(isEscalatedQueueState(b)) - Number(isEscalatedQueueState(a)),
      Number(isAwaitingQueueResponse(b)) - Number(isAwaitingQueueResponse(a)),
      Number(b.priority === 'high') - Number(a.priority === 'high'),
    ];

    const decisive = comparisons.find((value) => value !== 0);
    if (decisive) {
      return decisive;
    }

    const priorityDiff = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return Date.parse(b.updatedAt ?? b.createdAt) - Date.parse(a.updatedAt ?? a.createdAt);
  });
}

function isEscalatedQueueState(item: {
  status: DispatchQueueItemStatus;
  escalationState?: DispatchEscalationState;
}): boolean {
  return (
    item.status === 'escalated' ||
    item.escalationState === 'follow_up' ||
    item.escalationState === 'escalate_to_lead' ||
    item.escalationState === 'broadcast_to_team' ||
    item.escalationState === 'escalated' ||
    item.escalationState === 'emergency_unresolved'
  );
}

function isAwaitingQueueResponse(item: {
  status: DispatchQueueItemStatus;
  deliveryState?: DispatchDeliveryState;
}): boolean {
  return (
    item.status === 'pending_response' ||
    item.status === 'blocked' ||
    item.status === 'needs_review' ||
    item.deliveryState === 'queued' ||
    item.deliveryState === 'sent' ||
    item.deliveryState === 'no_response'
  );
}

export function filterAvailableTeamMembers<T extends Pick<DispatchTeamMember, 'status'>>(members: T[]): T[] {
  const unavailableStatuses: DispatchTeamMemberStatus[] = [
    'offline',
    'no_response',
    'unavailable',
    'emergency',
  ];

  return members.filter((member) => !unavailableStatuses.includes(member.status));
}

// ── Compose form state ──────────────────────────────────────

export interface ComposeEventForm {
  event_type: DispatchEventType;
  priority: DispatchPriority;
  headline: string;
  detail: string;
  location_enabled: boolean;
  location_label: string;
  latitude: string;
  longitude: string;
  metadata: Record<string, any> | null;
}

export const EMPTY_COMPOSE_FORM: ComposeEventForm = {
  event_type: 'status_update',
  priority: 'normal',
  headline: '',
  detail: '',
  location_enabled: false,
  location_label: '',
  latitude: '',
  longitude: '',
  metadata: null,
};

// ── Validation ──────────────────────────────────────────────

export interface ValidationErrors {
  headline?: string;
  latitude?: string;
  longitude?: string;
  detail?: string;
}

export function validateComposeForm(form: ComposeEventForm): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!form.headline.trim()) {
    errors.headline = 'Headline is required';
  } else if (form.headline.trim().length > 80) {
    errors.headline = 'Headline must be 80 characters or less';
  }

  if (form.detail && form.detail.length > 400) {
    errors.detail = 'Detail must be 400 characters or less';
  }

  if (form.location_enabled) {
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.latitude = 'Valid latitude required (-90 to 90)';
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.longitude = 'Valid longitude required (-180 to 180)';
    }
  }

  return errors;
}

export function hasValidationErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

