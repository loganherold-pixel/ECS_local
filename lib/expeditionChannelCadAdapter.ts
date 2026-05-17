import { dispatchEventStore } from './dispatchEventStore';
import type {
  DispatchActorIdentity,
  DispatchEvent,
} from './dispatchLiveEvents';
import type {
  ExpeditionChannelInvite,
  ExpeditionChannelMemberLite,
  ExpeditionJoinRequest,
} from './dispatchInviteDomain';

export type ExpeditionChannelCadActor = {
  userId?: string | null;
  displayName?: string | null;
  callsign?: string | null;
};

type ExpeditionChannelCadInput = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  actor?: ExpeditionChannelCadActor | null;
};

function toIsoTimestamp(value: string | null | undefined): string {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function cleanDisplayName(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || 'Unknown team member';
}

function normalizeActor(actor: ExpeditionChannelCadActor | null | undefined): DispatchActorIdentity | undefined {
  const displayName = cleanDisplayName(actor?.displayName ?? null);
  const userId = actor?.userId?.trim() || undefined;
  const callsign = actor?.callsign?.trim() || undefined;
  if (!userId && displayName === 'Unknown team member' && !callsign) {
    return undefined;
  }

  return {
    userId,
    displayName,
    callsign,
  };
}

function appendExpeditionChannelCadEvent(input: ExpeditionChannelCadInput): DispatchEvent | null {
  return dispatchEventStore.appendEvent({
    id: input.id,
    type: 'system',
    severity: 'info',
    title: input.title,
    message: input.message,
    source: 'team_member',
    createdAt: toIsoTimestamp(input.createdAt),
    createdBy: normalizeActor(input.actor),
  });
}

export function recordExpeditionChannelInviteActive(
  invite: ExpeditionChannelInvite,
  actor?: ExpeditionChannelCadActor | null,
): DispatchEvent | null {
  return appendExpeditionChannelCadEvent({
    id: `expedition-channel-invite-active-${invite.id}`,
    title: 'Expedition Channel Invite',
    message: 'Expedition Channel invite active',
    createdAt: invite.createdAt,
    actor,
  });
}

export function recordExpeditionChannelJoinRequestSubmitted(
  request: ExpeditionJoinRequest,
  _actor?: ExpeditionChannelCadActor | null,
): DispatchEvent | null {
  const displayName = cleanDisplayName(request.displayName);
  return appendExpeditionChannelCadEvent({
    id: `expedition-channel-join-request-${request.id}`,
    title: 'Expedition Channel Request',
    message: `${displayName} requested to join Expedition Channel`,
    createdAt: request.requestedAt,
    actor: {
      userId: request.userId,
      displayName,
      callsign: request.callsign,
    },
  });
}

export function recordExpeditionChannelMemberJoined(
  member: ExpeditionChannelMemberLite,
  _actor?: ExpeditionChannelCadActor | null,
): DispatchEvent | null {
  const displayName = cleanDisplayName(member.displayName);
  return appendExpeditionChannelCadEvent({
    id: `expedition-channel-member-joined-${member.id}`,
    title: 'Expedition Channel Join',
    message: `${displayName} joined Expedition Channel`,
    createdAt: member.joinedAt,
    actor: {
      userId: member.userId,
      displayName,
      callsign: member.callsign,
    },
  });
}

export function recordExpeditionChannelJoinRequestDenied(
  request: ExpeditionJoinRequest,
  actor?: ExpeditionChannelCadActor | null,
): DispatchEvent | null {
  const displayName = cleanDisplayName(request.displayName);
  return appendExpeditionChannelCadEvent({
    id: `expedition-channel-join-request-denied-${request.id}`,
    title: 'Expedition Channel Request',
    message: `${displayName} join request denied`,
    createdAt: request.reviewedAt ?? request.requestedAt,
    actor,
  });
}

export function recordExpeditionChannelInviteDisabled(
  invite: ExpeditionChannelInvite,
  actor?: ExpeditionChannelCadActor | null,
): DispatchEvent | null {
  return appendExpeditionChannelCadEvent({
    id: `expedition-channel-invite-disabled-${invite.id}`,
    title: 'Expedition Channel Invite',
    message: 'Expedition Channel invite disabled',
    createdAt: invite.updatedAt,
    actor,
  });
}

export function recordExpeditionChannelInviteExpired(
  invite: ExpeditionChannelInvite,
  actor?: ExpeditionChannelCadActor | null,
): DispatchEvent | null {
  return appendExpeditionChannelCadEvent({
    id: `expedition-channel-invite-expired-${invite.id}`,
    title: 'Expedition Channel Invite',
    message: 'Expedition Channel invite expired',
    createdAt: invite.expiresAt,
    actor,
  });
}

export function recordExpeditionChannelApprovalRequiredChanged(
  invite: ExpeditionChannelInvite,
  actor?: ExpeditionChannelCadActor | null,
): DispatchEvent | null {
  return appendExpeditionChannelCadEvent({
    id: `expedition-channel-approval-required-${invite.id}-${invite.approvalRequired ? 'on' : 'off'}-${Date.parse(invite.updatedAt)}`,
    title: 'Expedition Channel Approval',
    message: `Approval Required ${invite.approvalRequired ? 'enabled' : 'disabled'}`,
    createdAt: invite.updatedAt,
    actor,
  });
}
