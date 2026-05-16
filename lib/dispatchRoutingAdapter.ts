import type {
  DispatchPingType,
  DispatchPriority,
  DispatchTeamMember,
} from './dispatchTypes';

export type DispatchRecipientMode = 'all' | 'member' | 'role';

export type DispatchRoutingRole =
  | 'commander_owner'
  | 'lead_admin'
  | 'navigator'
  | 'driver'
  | 'scout'
  | 'mechanic'
  | 'medic'
  | 'comms'
  | 'recovery'
  | 'camp_lead'
  | 'supply_lead'
  | 'member'
  | 'viewer'
  | 'custom';

export interface DispatchRoutingSelection {
  recipientMode: DispatchRecipientMode;
  recipientId?: string;
  role?: DispatchRoutingRole;
  customGroupId?: string;
}

export interface DispatchRoutingOption {
  id: DispatchRoutingRole;
  label: string;
  count: number;
}

export interface DispatchRecipientResolution {
  recipients: DispatchTeamMember[];
  recipientIds: string[];
  warning?: string;
}

const UNAVAILABLE_RECIPIENT_STATUSES = new Set<DispatchTeamMember['status']>([
  'unavailable',
  'emergency',
]);

const ROUTING_ROLE_LABELS: Record<DispatchRoutingRole, string> = {
  commander_owner: 'Commander / Owner',
  lead_admin: 'Lead / Admin',
  navigator: 'Navigator',
  driver: 'Driver',
  scout: 'Scout',
  mechanic: 'Mechanic',
  medic: 'Medic',
  comms: 'Comms',
  recovery: 'Recovery',
  camp_lead: 'Camp Lead',
  supply_lead: 'Supply Lead',
  member: 'Members',
  viewer: 'Observers',
  custom: 'Custom Group',
};

const ROUTING_KEYWORDS: Record<Exclude<DispatchRoutingRole, 'member' | 'viewer' | 'custom' | 'commander_owner' | 'lead_admin'>, string[]> = {
  navigator: ['navigator', 'nav', 'route', 'waypoint'],
  driver: ['driver', 'vehicle', 'rig', 'tail', 'lead vehicle'],
  scout: ['scout', 'route scout', 'recon'],
  mechanic: ['mechanic', 'mechanical', 'repair', 'obd'],
  medic: ['medic', 'medical', 'first aid'],
  comms: ['comms', 'communications', 'radio', 'relay'],
  recovery: ['recovery', 'tow', 'winch', 'assist'],
  camp_lead: ['camp lead', 'camp', 'staged'],
  supply_lead: ['supply', 'quartermaster', 'resource', 'fuel', 'water'],
};

export function resolveDispatchRecipients(input: {
  selection: DispatchRoutingSelection;
  members: DispatchTeamMember[];
  senderMemberId?: string | null;
  excludeSender?: boolean;
  includeUnavailable?: boolean;
  priority?: DispatchPriority;
  pingType?: DispatchPingType;
}): DispatchRecipientResolution {
  const includeUnavailable =
    input.includeUnavailable ??
    (input.priority === 'critical' || input.pingType === 'emergency');
  let recipients: DispatchTeamMember[] = [];

  if (input.selection.recipientMode === 'member' && input.selection.recipientId) {
    recipients = input.members.filter((member) => member.id === input.selection.recipientId);
  } else if (input.selection.recipientMode === 'role' && input.selection.role) {
    recipients = filterRecipientsByRole(input.members, input.selection.role, input.selection.customGroupId);
  } else if (input.selection.recipientMode === 'all') {
    recipients = input.members;
  }

  if (input.excludeSender && input.senderMemberId) {
    recipients = excludeSender(recipients, input.senderMemberId);
  }

  recipients = filterRecipientsByAvailability(recipients, { includeUnavailable });
  const recipientIds = uniqueStrings(recipients.map((member) => member.id));
  const validation = validateDispatchTarget({
    selection: input.selection,
    recipientIds,
  });

  return {
    recipients,
    recipientIds,
    warning: validation.valid ? undefined : validation.reason,
  };
}

export function filterRecipientsByRole(
  members: DispatchTeamMember[],
  role: DispatchRoutingRole,
  customGroupId?: string,
): DispatchTeamMember[] {
  switch (role) {
    case 'commander_owner':
      return members.filter((member) => member.role === 'owner' || matchesMemberKeywords(member, ['commander', 'command', 'owner']));
    case 'lead_admin':
      return members.filter((member) => member.role === 'owner' || matchesMemberKeywords(member, ['lead', 'admin', 'command']));
    case 'member':
      return members.filter((member) => member.role === 'member');
    case 'viewer':
      return members.filter((member) => member.role === 'viewer');
    case 'custom':
      return customGroupId ? members.filter((member) => getMemberCustomGroups(member).includes(customGroupId)) : [];
    default:
      return members.filter((member) => matchesMemberKeywords(member, ROUTING_KEYWORDS[role]));
  }
}

export function filterRecipientsByAvailability(
  members: DispatchTeamMember[],
  options: { includeUnavailable?: boolean } = {},
): DispatchTeamMember[] {
  if (options.includeUnavailable) return members;
  return members.filter((member) => !UNAVAILABLE_RECIPIENT_STATUSES.has(member.status));
}

export function excludeSender(
  members: DispatchTeamMember[],
  senderMemberId: string,
): DispatchTeamMember[] {
  return members.filter((member) => member.id !== senderMemberId);
}

export function validateDispatchTarget(input: {
  selection: DispatchRoutingSelection;
  recipientIds: string[];
}): { valid: boolean; reason?: string } {
  if (input.selection.recipientMode === 'member' && !input.selection.recipientId) {
    return { valid: false, reason: 'Select a team member.' };
  }

  if (input.selection.recipientMode === 'role' && !input.selection.role) {
    return { valid: false, reason: 'Select a role group.' };
  }

  if (input.recipientIds.length === 0) {
    return { valid: false, reason: 'No available recipients match this Dispatch target.' };
  }

  return { valid: true };
}

export function getDispatchRoutingOptions(members: DispatchTeamMember[]): DispatchRoutingOption[] {
  const roles: DispatchRoutingRole[] = [
    'commander_owner',
    'lead_admin',
    'navigator',
    'driver',
    'scout',
    'mechanic',
    'medic',
    'comms',
    'recovery',
    'camp_lead',
    'supply_lead',
    'member',
    'viewer',
  ];

  return roles.map((role) => ({
    id: role,
    label: getDispatchRoutingRoleLabel(role),
    count: filterRecipientsByRole(members, role).length,
  }));
}

export function getDispatchRoutingRoleLabel(role: DispatchRoutingRole): string {
  return ROUTING_ROLE_LABELS[role] ?? 'Role Group';
}

function matchesMemberKeywords(member: DispatchTeamMember, keywords: string[]): boolean {
  const haystack = [
    member.displayName,
    member.callSign,
    member.notes,
    member.currentContext?.title,
    member.currentContext?.subtitle,
  ].filter(Boolean).join(' ').toLowerCase();

  return keywords.some((keyword) => haystack.includes(keyword));
}

function getMemberCustomGroups(member: DispatchTeamMember): string[] {
  const candidate = member as DispatchTeamMember & {
    groupIds?: string[];
    groups?: string[];
    metadata?: { groupIds?: string[]; groups?: string[] };
  };

  return [
    ...(candidate.groupIds ?? []),
    ...(candidate.groups ?? []),
    ...(candidate.metadata?.groupIds ?? []),
    ...(candidate.metadata?.groups ?? []),
  ];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort();
}
