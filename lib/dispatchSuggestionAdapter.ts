import type {
  DispatchEscalationState,
  DispatchLinkedContext,
  DispatchPing,
  DispatchQueueItem,
  DispatchTeamMember,
  DispatchTeamMemberStatus,
} from './dispatchTypes';
import {
  filterRecipientsByRole,
  type DispatchRoutingRole,
} from './dispatchRoutingAdapter';

export type DispatchSuggestionType =
  | 'best_member'
  | 'backup_member'
  | 'escalation_contact'
  | 'ping_type'
  | 'next_action'
  | 'resource_check'
  | 'route_check'
  | 'stale_follow_up';

export interface DispatchCandidateScore {
  member: DispatchTeamMember;
  score: number;
  reasons: string[];
  assignmentLoadScore: number;
  responseReliabilityScore: number;
}

export interface DispatchSuggestion {
  type: DispatchSuggestionType;
  label: string;
  reason: string;
  memberId?: string;
}

export interface DispatchSuggestionInput {
  queueItem: DispatchQueueItem;
  members: DispatchTeamMember[];
  pings: DispatchPing[];
  canViewLocation?: boolean;
  canViewContact?: boolean;
}

const AVAILABLE_STATUS_WEIGHT: Record<DispatchTeamMemberStatus, number> = {
  connected: 25,
  on_route: 18,
  at_waypoint: 18,
  at_camp: 16,
  needs_check_in: 4,
  offline: -18,
  no_response: -20,
  unavailable: -35,
  emergency: -50,
};

export function scoreDispatchCandidate(input: {
  member: DispatchTeamMember;
  queueItem: DispatchQueueItem;
  pings: DispatchPing[];
  canViewLocation?: boolean;
}): DispatchCandidateScore {
  const assignmentLoadScore = getAssignmentLoadScore(input.member, input.queueItem);
  const responseReliabilityScore = getResponseReliabilityScore(input.member, input.pings);
  const roleScore = getRoleMatchScore(input.member, input.queueItem);
  const recencyScore = getLastSeenScore(input.member.lastSeenAt);
  const statusScore = AVAILABLE_STATUS_WEIGHT[input.member.status] ?? 0;
  const contextScore = getContextMatchScore(input.member, input.queueItem.linkedContext, input.canViewLocation);
  const score = statusScore + roleScore + assignmentLoadScore + responseReliabilityScore + recencyScore + contextScore;

  return {
    member: input.member,
    score,
    assignmentLoadScore,
    responseReliabilityScore,
    reasons: getSuggestionReason({
      member: input.member,
      queueItem: input.queueItem,
      roleScore,
      assignmentLoadScore,
      responseReliabilityScore,
      recencyScore,
      contextScore,
      canViewLocation: input.canViewLocation,
    }),
  };
}

export function rankDispatchCandidates(input: DispatchSuggestionInput): DispatchCandidateScore[] {
  return input.members
    .map((member) => scoreDispatchCandidate({
      member,
      queueItem: input.queueItem,
      pings: input.pings,
      canViewLocation: input.canViewLocation,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.member.callSign.localeCompare(b.member.callSign);
    });
}

export function getSuggestedDispatchAction(input: DispatchSuggestionInput): DispatchSuggestion[] {
  const ranked = rankDispatchCandidates(input);
  const best = ranked[0];
  const backup = ranked.find((candidate) => candidate.member.id !== best?.member.id);
  const suggestions: DispatchSuggestion[] = [];

  if (best) {
    suggestions.push({
      type: 'best_member',
      label: `Suggested: ${best.member.callSign}`,
      reason: best.reasons.join(', '),
      memberId: best.member.id,
    });
  }

  if (backup) {
    suggestions.push({
      type: 'backup_member',
      label: `Backup: ${backup.member.callSign}`,
      reason: backup.reasons.slice(0, 3).join(', '),
      memberId: backup.member.id,
    });
  }

  suggestions.push({
    type: 'next_action',
    label: getNextActionLabel(input.queueItem),
    reason: getNextActionReason(input.queueItem),
  });

  const pingSuggestion = getSuggestedPingType(input.queueItem);
  suggestions.push(pingSuggestion);

  const escalationContact = getSuggestedEscalationTarget(input);
  if (escalationContact) {
    suggestions.push(escalationContact);
  }

  const contextSuggestion = getContextSuggestion(input.queueItem.linkedContext);
  if (contextSuggestion) {
    suggestions.push(contextSuggestion);
  }

  const staleMember = input.members.find((member) => ['offline', 'needs_check_in', 'no_response'].includes(member.status));
  if (staleMember) {
    suggestions.push({
      type: 'stale_follow_up',
      label: `Follow up: ${staleMember.callSign}`,
      reason: `${staleMember.callSign} is stale or awaiting check-in.`,
      memberId: staleMember.id,
    });
  }

  return suggestions;
}

export function getSuggestedEscalationTarget(input: DispatchSuggestionInput): DispatchSuggestion | null {
  if (!isEscalationRelevant(input.queueItem.escalationState) && input.queueItem.priority !== 'critical') {
    return null;
  }

  const lead = filterRecipientsByRole(input.members, 'commander_owner')[0] ??
    filterRecipientsByRole(input.members, 'lead_admin')[0];
  if (!lead) return null;

  return {
    type: 'escalation_contact',
    label: `Escalate to: ${lead.callSign}`,
    reason: 'Commander/lead role matches escalation handling.',
    memberId: lead.id,
  };
}

export function getSuggestionReason(input: {
  member: DispatchTeamMember;
  queueItem: DispatchQueueItem;
  roleScore: number;
  assignmentLoadScore: number;
  responseReliabilityScore: number;
  recencyScore: number;
  contextScore: number;
  canViewLocation?: boolean;
}): string[] {
  const reasons: string[] = [];
  if (input.member.status === 'connected' || input.member.status === 'on_route') {
    reasons.push('available');
  }
  if (input.roleScore > 0) {
    reasons.push(`matching ${getExpectedRoleLabel(input.queueItem)} role`);
  }
  if (input.assignmentLoadScore > 0) {
    reasons.push('no active assignment');
  } else if (input.assignmentLoadScore < 0) {
    reasons.push('already carrying assignment load');
  }
  if (input.responseReliabilityScore > 0) {
    reasons.push('recently responsive');
  } else if (input.responseReliabilityScore < 0) {
    reasons.push('response risk present');
  }
  if (input.recencyScore > 0) {
    reasons.push('recent check-in');
  }
  if (input.canViewLocation && input.contextScore > 0) {
    reasons.push('matching field context');
  }
  if (reasons.length === 0) {
    reasons.push('best deterministic fit from current Dispatch data');
  }
  return reasons;
}

export function getAssignmentLoadScore(member: DispatchTeamMember, queueItem: DispatchQueueItem): number {
  if (queueItem.assignedMemberIds.includes(member.id)) return -12;
  if (member.status === 'connected' || member.status === 'at_camp') return 14;
  return 4;
}

export function getResponseReliabilityScore(member: DispatchTeamMember, pings: DispatchPing[]): number {
  const targeted = pings.filter((ping) => ping.targetMemberIds.includes(member.id));
  if (targeted.length === 0) return 4;
  const acknowledged = targeted.filter((ping) => ping.acknowledgedByMemberIds?.includes(member.id)).length;
  const failed = targeted.filter((ping) => ping.status === 'no_response' || ping.status === 'failed' || ping.status === 'escalated').length;
  return acknowledged * 8 - failed * 10;
}

function getSuggestedPingType(queueItem: DispatchQueueItem): DispatchSuggestion {
  if (queueItem.tags?.includes('resource') || queueItem.linkedContext.type === 'resource' || queueItem.linkedContext.type === 'power') {
    return {
      type: 'resource_check',
      label: 'Ping type: Resource',
      reason: 'Linked context is resource or power related.',
    };
  }
  if (queueItem.tags?.includes('route') || queueItem.linkedContext.type === 'route_segment' || queueItem.linkedContext.type === 'waypoint') {
    return {
      type: 'route_check',
      label: 'Ping type: Route',
      reason: 'Linked context is route or waypoint related.',
    };
  }
  if (queueItem.tags?.includes('assist')) {
    return {
      type: 'ping_type',
      label: 'Ping type: Assist',
      reason: 'Queue item is tagged for assist coordination.',
    };
  }
  return {
    type: 'ping_type',
    label: 'Ping type: General',
    reason: 'No specialized linked context is required.',
  };
}

function getContextSuggestion(context: DispatchLinkedContext): DispatchSuggestion | null {
  if (context.type === 'resource' || context.type === 'power') {
    return {
      type: 'resource_check',
      label: 'Suggest resource check',
      reason: `${context.title} is resource-linked.`,
    };
  }
  if (context.type === 'route_segment' || context.type === 'waypoint') {
    return {
      type: 'route_check',
      label: 'Suggest route check',
      reason: `${context.title} is route-linked.`,
    };
  }
  return null;
}

function getNextActionLabel(queueItem: DispatchQueueItem): string {
  if (queueItem.status === 'blocked') return 'Next action: Escalate or assign support';
  if (queueItem.status === 'pending_response') return 'Next action: Request acknowledgment';
  if (queueItem.priority === 'critical') return 'Next action: Escalate to lead';
  if (queueItem.status === 'new') return 'Next action: Assign member';
  return 'Next action: Monitor queue item';
}

function getNextActionReason(queueItem: DispatchQueueItem): string {
  if (queueItem.status === 'blocked') return 'Blocked queue items need a human decision before progress resumes.';
  if (queueItem.status === 'pending_response') return 'The item is waiting on team acknowledgment.';
  if (queueItem.priority === 'critical') return 'Critical priority requires command oversight.';
  if (queueItem.status === 'new') return 'No field owner has accepted this work yet.';
  return 'Current queue state does not require automatic action.';
}

function getRoleMatchScore(member: DispatchTeamMember, queueItem: DispatchQueueItem): number {
  const expectedRole = getExpectedRoutingRole(queueItem);
  if (!expectedRole) return member.role === 'owner' ? 4 : 0;
  return filterRecipientsByRole([member], expectedRole).length > 0 ? 24 : 0;
}

function getExpectedRoutingRole(queueItem: DispatchQueueItem): DispatchRoutingRole | null {
  const text = `${queueItem.title} ${queueItem.detail} ${queueItem.tags?.join(' ') ?? ''} ${queueItem.linkedContext.type}`.toLowerCase();
  if (text.includes('medical') || text.includes('medic')) return 'medic';
  if (text.includes('mechanic') || text.includes('mechanical') || text.includes('vehicle')) return 'mechanic';
  if (text.includes('comms') || text.includes('relay')) return 'comms';
  if (text.includes('recovery') || text.includes('assist')) return 'recovery';
  if (text.includes('fuel') || text.includes('water') || text.includes('resource') || text.includes('power')) return 'supply_lead';
  if (text.includes('route') || text.includes('waypoint') || text.includes('hazard') || text.includes('scout')) return 'scout';
  if (text.includes('camp')) return 'camp_lead';
  return null;
}

function getExpectedRoleLabel(queueItem: DispatchQueueItem): string {
  return getExpectedRoutingRole(queueItem)?.replace('_', ' ') ?? 'team';
}

function getLastSeenScore(lastSeenAt: string): number {
  const ageMs = Date.now() - Date.parse(lastSeenAt);
  if (!Number.isFinite(ageMs)) return 0;
  const ageMinutes = ageMs / 60_000;
  if (ageMinutes < 30) return 10;
  if (ageMinutes < 120) return 4;
  return -8;
}

function getContextMatchScore(
  member: DispatchTeamMember,
  context: DispatchLinkedContext,
  canViewLocation?: boolean,
): number {
  if (!canViewLocation) return 0;
  if (!member.currentContext) return 0;
  if (member.currentContext.id === context.id) return 12;
  if (member.currentContext.type === context.type) return 6;
  return 0;
}

function isEscalationRelevant(state: DispatchEscalationState): boolean {
  return state !== 'none' && state !== 'monitor' && state !== 'recovered' && state !== 'resolved';
}
