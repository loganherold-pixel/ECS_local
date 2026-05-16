import type {
  DispatchAssistRequestType,
  DispatchLinkedContext,
  DispatchPingType,
  DispatchPriority,
  DispatchQueueItem,
  DispatchTeamMember,
  ExpeditionMemberRole,
} from './dispatchTypes';

export const DISPATCH_PERMISSION_DENIED_COPY =
  'You do not have permission for this dispatch action.';

export const DISPATCH_LOCATION_RESTRICTED_COPY = 'Member location is restricted.';
export const DISPATCH_CONTACT_RESTRICTED_COPY = 'Contact details are restricted.';
export const DISPATCH_ASSIST_SAFETY_COPY = 'ECS team coordination only.';
export const DISPATCH_EMERGENCY_SAFETY_COPY =
  'Emergency Ping is ECS team coordination only.';

export type DispatchPermissionAction =
  | 'view_dispatch'
  | 'view_team_roster'
  | 'view_audit_history'
  | 'send_individual_ping'
  | 'send_team_ping'
  | 'send_team_wide_ping'
  | 'send_role_group_ping'
  | 'send_emergency_ping'
  | 'respond_check_in'
  | 'create_assist_request'
  | 'assign_member'
  | 'reassign_queue_item'
  | 'resolve_queue_item'
  | 'escalate_queue_item'
  | 'cancel_queue_item'
  | 'view_member_location'
  | 'view_member_contact'
  | 'broadcast_hazard'
  | 'modify_timeline'
  | 'manage_role_group_targeting';

export interface DispatchOperatorPermissionInfo {
  role?: string | null;
  is_admin?: boolean | null;
  has_full_app_access?: boolean | null;
}

export interface DispatchPermissionContext {
  activeExpeditionStatus?: string | null;
  currentMember?: DispatchTeamMember | null;
  operatorInfo?: DispatchOperatorPermissionInfo | null;
  soloMode?: boolean;
}

export interface DispatchPermissionResult {
  allowed: boolean;
  reason?: string;
  safetyCopy?: string;
}

export interface DispatchPermissionSnapshot {
  roleLabel: string;
  disabledReason: string;
  can: (action: DispatchPermissionAction) => DispatchPermissionResult;
}

export interface DispatchQueuePermissionSet {
  canPing: boolean;
  canAssign: boolean;
  canResolve: boolean;
  canEscalate: boolean;
  canCancel: boolean;
  canViewContext: boolean;
  disabledReason: string;
  locationRestrictedReason: string;
}

export interface DispatchRosterPermissionSet {
  canPingMembers: boolean;
  canViewMemberLocation: boolean;
  canViewMemberContact: boolean;
  canAssignMembers: boolean;
  disabledReason: string;
  locationRestrictedReason: string;
  contactRestrictedReason: string;
}

export interface DispatchActionPermissionSet {
  canViewDispatch: boolean;
  canOpenTeamPing: boolean;
  canRequestCheckIn: boolean;
  canCreateAssignment: boolean;
  canCreateAssistRequest: boolean;
  disabledReason: string;
}

export interface DispatchComposerPermissionSet {
  canSendIndividual: boolean;
  canSendTeamWide: boolean;
  canSendEmergency: boolean;
  canTargetRoles: boolean;
  disabledReason: string;
  emergencySafetyCopy: string;
}

export interface DispatchTimelinePermissionSet {
  canViewAuditHistory: boolean;
  canModifyTimeline: boolean;
  disabledReason: string;
}

export function resolveCurrentDispatchMember(
  members: DispatchTeamMember[],
  currentUserId?: string | null,
): DispatchTeamMember | null {
  if (!members.length) return null;

  return (
    members.find((member) => member.id === currentUserId) ??
    members.find((member) => member.role === 'owner') ??
    members[0] ??
    null
  );
}

export function resolveDispatchPermissions(
  context: DispatchPermissionContext,
): DispatchPermissionSnapshot {
  return {
    roleLabel: getDispatchPermissionRoleLabel(context),
    disabledReason: DISPATCH_PERMISSION_DENIED_COPY,
    can: (action) => canPerformDispatchAction(action, context),
  };
}

export function getQueuePermissionSet(
  snapshot: DispatchPermissionSnapshot,
): DispatchQueuePermissionSet {
  return {
    canPing: snapshot.can('send_individual_ping').allowed,
    canAssign: snapshot.can('assign_member').allowed,
    canResolve: snapshot.can('resolve_queue_item').allowed,
    canEscalate: snapshot.can('escalate_queue_item').allowed,
    canCancel: snapshot.can('cancel_queue_item').allowed,
    canViewContext: snapshot.can('view_member_location').allowed,
    disabledReason: snapshot.disabledReason,
    locationRestrictedReason: DISPATCH_LOCATION_RESTRICTED_COPY,
  };
}

export function getRosterPermissionSet(
  snapshot: DispatchPermissionSnapshot,
): DispatchRosterPermissionSet {
  return {
    canPingMembers: snapshot.can('send_individual_ping').allowed,
    canViewMemberLocation: snapshot.can('view_member_location').allowed,
    canViewMemberContact: snapshot.can('view_member_contact').allowed,
    canAssignMembers: snapshot.can('assign_member').allowed,
    disabledReason: snapshot.disabledReason,
    locationRestrictedReason: DISPATCH_LOCATION_RESTRICTED_COPY,
    contactRestrictedReason: DISPATCH_CONTACT_RESTRICTED_COPY,
  };
}

export function getActionPermissionSet(
  snapshot: DispatchPermissionSnapshot,
): DispatchActionPermissionSet {
  return {
    canViewDispatch: snapshot.can('view_dispatch').allowed,
    canOpenTeamPing: snapshot.can('send_team_wide_ping').allowed,
    canRequestCheckIn: snapshot.can('send_team_wide_ping').allowed,
    canCreateAssignment: snapshot.can('assign_member').allowed,
    canCreateAssistRequest: snapshot.can('create_assist_request').allowed,
    disabledReason: snapshot.disabledReason,
  };
}

export function getComposerPermissionSet(
  snapshot: DispatchPermissionSnapshot,
): DispatchComposerPermissionSet {
  return {
    canSendIndividual: snapshot.can('send_individual_ping').allowed,
    canSendTeamWide: snapshot.can('send_team_wide_ping').allowed,
    canSendEmergency: snapshot.can('send_emergency_ping').allowed,
    canTargetRoles:
      snapshot.can('send_role_group_ping').allowed &&
      snapshot.can('manage_role_group_targeting').allowed,
    disabledReason: snapshot.disabledReason,
    emergencySafetyCopy: DISPATCH_EMERGENCY_SAFETY_COPY,
  };
}

export function getTimelinePermissionSet(
  snapshot: DispatchPermissionSnapshot,
): DispatchTimelinePermissionSet {
  return {
    canViewAuditHistory: snapshot.can('view_audit_history').allowed,
    canModifyTimeline: snapshot.can('modify_timeline').allowed,
    disabledReason: snapshot.disabledReason,
  };
}

export function canSubmitDispatchPing(
  payload: {
    recipientMode: 'all' | 'member' | 'role';
    pingType: DispatchPingType;
    priority: DispatchPriority;
    linkedContext?: DispatchLinkedContext;
  },
  snapshot: DispatchPermissionSnapshot,
): DispatchPermissionResult {
  const basePing = snapshot.can('send_individual_ping');
  if (!basePing.allowed) return basePing;

  if (payload.recipientMode === 'all') {
    const result = snapshot.can('send_team_wide_ping');
    if (!result.allowed) return result;
  }

  if (payload.recipientMode === 'role') {
    const result = snapshot.can('send_role_group_ping');
    if (!result.allowed) return result;
    const manageResult = snapshot.can('manage_role_group_targeting');
    if (!manageResult.allowed) return manageResult;
  }

  if (payload.recipientMode === 'member') {
    const result = snapshot.can('send_individual_ping');
    if (!result.allowed) return result;
  }

  if (payload.pingType === 'emergency' || payload.priority === 'critical') {
    const result = snapshot.can('send_emergency_ping');
    if (!result.allowed) return result;
  }

  if (payload.pingType === 'hazard' && payload.recipientMode === 'all') {
    const result = snapshot.can('broadcast_hazard');
    if (!result.allowed) return result;
  }

  return basePing;
}

export function canSubmitAssistRequest(
  payload: {
    assistType: DispatchAssistRequestType;
    recipientMode: 'all' | 'member' | 'role';
    priority: DispatchPriority;
  },
  snapshot: DispatchPermissionSnapshot,
): DispatchPermissionResult {
  const baseAssist = snapshot.can('create_assist_request');
  if (!baseAssist.allowed) return baseAssist;

  if (payload.recipientMode === 'all') {
    const result = snapshot.can('send_team_wide_ping');
    if (!result.allowed) return result;
  }

  if (payload.recipientMode === 'role') {
    const result = snapshot.can('send_role_group_ping');
    if (!result.allowed) return result;
    const manageResult = snapshot.can('manage_role_group_targeting');
    if (!manageResult.allowed) return manageResult;
  }

  if (payload.recipientMode === 'member') {
    const result = snapshot.can('send_individual_ping');
    if (!result.allowed) return result;
  }

  if (payload.priority === 'critical') {
    const result = snapshot.can('send_emergency_ping');
    if (!result.allowed) return result;
  }

  return {
    ...baseAssist,
    safetyCopy: DISPATCH_ASSIST_SAFETY_COPY,
  };
}

export function canMutateDispatchQueueItem(
  item: DispatchQueueItem,
  action: Extract<
    DispatchPermissionAction,
    'assign_member' | 'reassign_queue_item' | 'resolve_queue_item' | 'escalate_queue_item' | 'cancel_queue_item'
  >,
  snapshot: DispatchPermissionSnapshot,
): DispatchPermissionResult {
  if (item.status === 'resolved' || item.status === 'cancelled') {
    return {
      allowed: false,
      reason: 'This dispatch queue item is already closed.',
    };
  }

  return snapshot.can(action);
}

function canPerformDispatchAction(
  action: DispatchPermissionAction,
  context: DispatchPermissionContext,
): DispatchPermissionResult {
  if (
    context.activeExpeditionStatus === 'archived' ||
    context.activeExpeditionStatus === 'complete'
  ) {
    if (action === 'view_dispatch' || action === 'view_team_roster' || action === 'view_audit_history') {
      return allowedWithSafety(action);
    }
    return denied('Closed expedition channels are read-only.');
  }

  if (context.soloMode) {
    return allowedWithSafety(action);
  }

  if (isOperatorAdmin(context.operatorInfo)) {
    return allowedWithSafety(action);
  }

  const role = context.currentMember?.role ?? 'viewer';

  if (role === 'owner') {
    return allowedWithSafety(action);
  }

  if (role === 'member') {
    return canMemberPerformAction(action);
  }

  return canViewerPerformAction(action);
}

function canMemberPerformAction(action: DispatchPermissionAction): DispatchPermissionResult {
  switch (action) {
    case 'view_dispatch':
    case 'view_team_roster':
    case 'send_individual_ping':
    case 'send_team_ping':
    case 'respond_check_in':
    case 'create_assist_request':
      return allowedWithSafety(action);
    case 'view_audit_history':
      return denied('You do not have permission to view Dispatch audit history.');
    case 'view_member_location':
      return denied(DISPATCH_LOCATION_RESTRICTED_COPY);
    case 'view_member_contact':
      return denied(DISPATCH_CONTACT_RESTRICTED_COPY);
    case 'send_team_wide_ping':
    case 'send_role_group_ping':
    case 'send_emergency_ping':
    case 'assign_member':
    case 'reassign_queue_item':
    case 'resolve_queue_item':
    case 'escalate_queue_item':
    case 'cancel_queue_item':
    case 'broadcast_hazard':
    case 'modify_timeline':
    case 'manage_role_group_targeting':
    default:
      return denied();
  }
}

function canViewerPerformAction(action: DispatchPermissionAction): DispatchPermissionResult {
  switch (action) {
    case 'view_dispatch':
    case 'view_team_roster':
      return allowedWithSafety(action);
    case 'view_member_location':
      return denied(DISPATCH_LOCATION_RESTRICTED_COPY);
    case 'view_member_contact':
      return denied(DISPATCH_CONTACT_RESTRICTED_COPY);
    case 'view_audit_history':
      return denied('You do not have permission to view Dispatch audit history.');
    default:
      return denied();
  }
}

function allowedWithSafety(action: DispatchPermissionAction): DispatchPermissionResult {
  if (action === 'create_assist_request') {
    return { allowed: true, safetyCopy: DISPATCH_ASSIST_SAFETY_COPY };
  }

  if (action === 'send_emergency_ping' || action === 'broadcast_hazard') {
    return { allowed: true, safetyCopy: DISPATCH_EMERGENCY_SAFETY_COPY };
  }

  return { allowed: true };
}

function denied(reason = DISPATCH_PERMISSION_DENIED_COPY): DispatchPermissionResult {
  return { allowed: false, reason };
}

function isOperatorAdmin(operatorInfo?: DispatchOperatorPermissionInfo | null): boolean {
  const role = operatorInfo?.role?.toLowerCase();
  return Boolean(
    operatorInfo?.is_admin ||
    operatorInfo?.has_full_app_access ||
    role === 'admin' ||
    role === 'owner' ||
    role === 'commander' ||
    role === 'lead',
  );
}

function getDispatchPermissionRoleLabel(context: DispatchPermissionContext): string {
  if (context.soloMode) return 'Solo Dispatch';
  if (isOperatorAdmin(context.operatorInfo)) return 'Admin';

  return getRoleLabel(context.currentMember?.role ?? 'viewer');
}

function getRoleLabel(role: ExpeditionMemberRole): string {
  switch (role) {
    case 'owner':
      return 'Expedition Lead';
    case 'member':
      return 'Member';
    case 'viewer':
    default:
      return 'Viewer';
  }
}
