import { expeditionStateStore, type ExpeditionRecord } from './expeditionStateStore';
import { createPersistedKeyValueCache } from './keyValuePersistence';
import {
  DEMO_EXPEDITION_CHANNEL_INVITE,
  DEMO_EXPEDITION_INVITE_FIXTURES,
  approveJoinRequest,
  canUseInvite,
  createJoinRequest,
  denyJoinRequest,
  formatJoinCode,
  generateJoinCode,
  validateJoinCode,
  type ExpeditionChannelDefaultRole,
  type ExpeditionChannelInvite,
  type ExpeditionChannelMemberLite,
  type ExpeditionJoinRequest,
} from './dispatchInviteDomain';

type InviteStoreSnapshot = {
  invites: ExpeditionChannelInvite[];
  joinRequests: ExpeditionJoinRequest[];
  members: ExpeditionChannelMemberLite[];
};

export type ExpeditionInviteResolution =
  | {
      ok: true;
      invite: ExpeditionChannelInvite;
      expeditionName: string;
      hostDisplayName: string | null;
      alreadyJoined: boolean;
      existingPendingRequest: ExpeditionJoinRequest | null;
    }
  | { ok: false; reason: string };

export type ExpeditionJoinResult =
  | {
      ok: true;
      state: 'pending_approval';
      invite: ExpeditionChannelInvite;
      expeditionName: string;
      joinRequest: ExpeditionJoinRequest;
    }
  | {
      ok: true;
      state: 'joined';
      invite: ExpeditionChannelInvite;
      expeditionName: string;
      member: ExpeditionChannelMemberLite;
    }
  | {
      ok: true;
      state: 'already_joined';
      invite: ExpeditionChannelInvite;
      expeditionName: string;
      member: ExpeditionChannelMemberLite;
    }
  | { ok: false; reason: string };

export type ExpeditionJoinReviewResult =
  | {
      ok: true;
      state: 'approved';
      joinRequest: ExpeditionJoinRequest;
      member: ExpeditionChannelMemberLite;
    }
  | {
      ok: true;
      state: 'denied';
      joinRequest: ExpeditionJoinRequest;
    }
  | { ok: false; reason: string };

const STORAGE_KEY = 'snapshot';
const JOIN_LINK_BASE_URL = 'planning-offline-sync://join-expedition';
const cache = createPersistedKeyValueCache('ecs_expedition_invite_local');

function normalizeJoinCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IO01]/g, '');
}

function readSnapshot(): InviteStoreSnapshot {
  const fallback: InviteStoreSnapshot = {
    invites: [],
    joinRequests: [],
    members: [],
  };

  try {
    const raw = cache.get(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<InviteStoreSnapshot>;
    return {
      invites: Array.isArray(parsed.invites) ? parsed.invites : [],
      joinRequests: Array.isArray(parsed.joinRequests) ? parsed.joinRequests : [],
      members: Array.isArray(parsed.members) ? parsed.members : [],
    };
  } catch {
    return fallback;
  }
}

function writeSnapshot(snapshot: InviteStoreSnapshot): void {
  cache.set(STORAGE_KEY, JSON.stringify(snapshot));
  void cache.flush();
}

function getActiveExpedition(): ExpeditionRecord | null {
  const record = expeditionStateStore.getCurrentExpedition();
  return record && (record.state === 'active' || record.state === 'paused') ? record : null;
}

function getExpeditionName(expeditionId: string): string {
  const active = getActiveExpedition();
  if (active?.id === expeditionId) {
    return active.vehicleName ? `${active.vehicleName} Expedition` : 'Active Expedition';
  }

  if (expeditionId === DEMO_EXPEDITION_CHANNEL_INVITE.expeditionId) {
    return 'Demo Ruby Ridge Field Loop';
  }

  return 'Expedition Channel';
}

function getHostDisplayName(invite: ExpeditionChannelInvite): string | null {
  if (invite.createdByUserId === 'demo-user-command') {
    return 'Demo Command';
  }

  return invite.createdByUserId ? 'Expedition Lead' : null;
}

function stableMemberId(expeditionId: string, userId: string): string {
  return `channel-member-${expeditionId}-${userId}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function createInviteForExpedition(input: {
  expedition: ExpeditionRecord;
  createdByUserId: string;
  approvalRequired: boolean;
}): ExpeditionChannelInvite {
  const rawCode = generateJoinCode({
    expeditionId: input.expedition.id,
    createdByUserId: input.createdByUserId,
    createdAt: input.expedition.startTime,
  }, 6);

  return {
    id: `local-invite-${input.expedition.id}`,
    expeditionId: input.expedition.id,
    createdByUserId: input.createdByUserId,
    joinCode: formatJoinCode(rawCode, 3),
    inviteLink: `${JOIN_LINK_BASE_URL}?code=${encodeURIComponent(rawCode)}`,
    status: 'active',
    approvalRequired: input.approvalRequired,
    defaultRole: 'member',
    expiresAt: input.expedition.endTime ?? '9999-12-31T23:59:59.999Z',
    createdAt: input.expedition.startTime,
    updatedAt: new Date().toISOString(),
  };
}

function findInviteByCode(snapshot: InviteStoreSnapshot, joinCode: string): ExpeditionChannelInvite | null {
  const normalized = normalizeJoinCode(joinCode);
  const local = snapshot.invites.find((invite) => normalizeJoinCode(invite.joinCode) === normalized);
  if (local) return local;

  if (normalizeJoinCode(DEMO_EXPEDITION_CHANNEL_INVITE.joinCode) === normalized) {
    return DEMO_EXPEDITION_CHANNEL_INVITE;
  }

  return null;
}

export const expeditionInviteLocalAdapter = {
  getOrCreateActiveInvite(input: {
    expedition: ExpeditionRecord;
    createdByUserId: string;
    approvalRequired?: boolean;
  }): ExpeditionChannelInvite {
    const snapshot = readSnapshot();
    const existing = snapshot.invites.find((invite) => invite.expeditionId === input.expedition.id);
    const approvalRequired = input.approvalRequired ?? existing?.approvalRequired ?? true;
    const nextInvite = existing
      ? {
          ...existing,
          status: input.expedition.state === 'active' || input.expedition.state === 'paused' ? 'active' as const : 'expired' as const,
          approvalRequired,
          updatedAt: new Date().toISOString(),
        }
      : createInviteForExpedition({
          expedition: input.expedition,
          createdByUserId: input.createdByUserId,
          approvalRequired,
        });

    writeSnapshot({
      ...snapshot,
      invites: [
        nextInvite,
        ...snapshot.invites.filter((invite) => invite.id !== nextInvite.id),
      ],
    });
    return nextInvite;
  },

  updateApprovalRequired(inviteId: string, approvalRequired: boolean): ExpeditionChannelInvite | null {
    const snapshot = readSnapshot();
    const invite = snapshot.invites.find((candidate) => candidate.id === inviteId);
    if (!invite) return null;

    const nextInvite = {
      ...invite,
      approvalRequired,
      updatedAt: new Date().toISOString(),
    };

    writeSnapshot({
      ...snapshot,
      invites: snapshot.invites.map((candidate) => candidate.id === inviteId ? nextInvite : candidate),
    });
    return nextInvite;
  },

  resolveInvite(joinCode: string, userId?: string | null): ExpeditionInviteResolution {
    if (!validateJoinCode(joinCode)) {
      return { ok: false, reason: 'Enter a valid Expedition Channel join code.' };
    }

    const snapshot = readSnapshot();
    const invite = findInviteByCode(snapshot, joinCode);
    if (!invite) {
      return { ok: false, reason: 'Invite code not recognized.' };
    }

    if (invite.status === 'disabled') {
      return { ok: false, reason: 'This Expedition Channel invite is disabled.' };
    }

    if (!canUseInvite(invite)) {
      return { ok: false, reason: 'This Expedition Channel invite has expired.' };
    }

    const normalizedUserId = userId ?? null;
    const demoMembers = invite.id === DEMO_EXPEDITION_CHANNEL_INVITE.id
      ? DEMO_EXPEDITION_INVITE_FIXTURES.members
      : [];
    const demoRequests = invite.id === DEMO_EXPEDITION_CHANNEL_INVITE.id
      ? DEMO_EXPEDITION_INVITE_FIXTURES.joinRequests
      : [];
    const member = normalizedUserId
      ? [...snapshot.members, ...demoMembers].find((candidate) =>
          candidate.expeditionId === invite.expeditionId && candidate.userId === normalizedUserId,
        )
      : null;
    const pending = normalizedUserId
      ? [...snapshot.joinRequests, ...demoRequests].find((request) =>
          request.expeditionId === invite.expeditionId &&
          request.userId === normalizedUserId &&
          request.status === 'pending',
        ) ?? null
      : null;

    return {
      ok: true,
      invite,
      expeditionName: getExpeditionName(invite.expeditionId),
      hostDisplayName: getHostDisplayName(invite),
      alreadyJoined: !!member,
      existingPendingRequest: pending,
    };
  },

  submitJoin(input: {
    joinCode: string;
    userId: string;
    displayName: string;
    callsign: string | null;
    requestedRole: ExpeditionChannelDefaultRole;
  }): ExpeditionJoinResult {
    const resolution = this.resolveInvite(input.joinCode, input.userId);
    if (!resolution.ok) return resolution;

    const snapshot = readSnapshot();
    const existingMember = snapshot.members.find((member) =>
      member.expeditionId === resolution.invite.expeditionId && member.userId === input.userId,
    );
    if (existingMember) {
      return {
        ok: true,
        state: 'already_joined',
        invite: resolution.invite,
        expeditionName: resolution.expeditionName,
        member: existingMember,
      };
    }

    if (resolution.existingPendingRequest) {
      return {
        ok: true,
        state: 'pending_approval',
        invite: resolution.invite,
        expeditionName: resolution.expeditionName,
        joinRequest: resolution.existingPendingRequest,
      };
    }

    const joinRequest = createJoinRequest({
      invite: resolution.invite,
      userId: input.userId,
      displayName: input.displayName,
      callsign: input.callsign,
      requestedRole: input.requestedRole,
      requestedAt: new Date().toISOString(),
    });

    if (resolution.invite.approvalRequired) {
      writeSnapshot({
        ...snapshot,
        joinRequests: [
          joinRequest,
          ...snapshot.joinRequests.filter((request) => request.id !== joinRequest.id),
        ],
      });
      return {
        ok: true,
        state: 'pending_approval',
        invite: resolution.invite,
        expeditionName: resolution.expeditionName,
        joinRequest,
      };
    }

    const approved = approveJoinRequest(joinRequest, resolution.invite.createdByUserId, new Date().toISOString());
    const member = {
      ...approved.member,
      id: stableMemberId(resolution.invite.expeditionId, input.userId),
    };

    writeSnapshot({
      ...snapshot,
      joinRequests: [
        approved.joinRequest,
        ...snapshot.joinRequests.filter((request) => request.id !== approved.joinRequest.id),
      ],
      members: [
        member,
        ...snapshot.members.filter((candidate) => candidate.id !== member.id),
      ],
    });

    return {
      ok: true,
      state: 'joined',
      invite: resolution.invite,
      expeditionName: resolution.expeditionName,
      member,
    };
  },

  getPendingRequests(inviteId: string): ExpeditionJoinRequest[] {
    const snapshot = readSnapshot();
    return snapshot.joinRequests.filter((request) => request.inviteId === inviteId && request.status === 'pending');
  },

  approveJoinRequest(requestId: string, reviewedByUserId: string): ExpeditionJoinReviewResult {
    const snapshot = readSnapshot();
    const request = snapshot.joinRequests.find((candidate) => candidate.id === requestId);
    if (!request) {
      return { ok: false, reason: 'Join request not found.' };
    }

    if (request.status !== 'pending') {
      return { ok: false, reason: 'Join request has already been reviewed.' };
    }

    const reviewed = approveJoinRequest(request, reviewedByUserId, new Date().toISOString());
    const member = {
      ...reviewed.member,
      id: stableMemberId(request.expeditionId, request.userId),
    };

    writeSnapshot({
      ...snapshot,
      joinRequests: snapshot.joinRequests.map((candidate) =>
        candidate.id === requestId ? reviewed.joinRequest : candidate,
      ),
      members: [
        member,
        ...snapshot.members.filter((candidate) => candidate.id !== member.id),
      ],
    });

    return {
      ok: true,
      state: 'approved',
      joinRequest: reviewed.joinRequest,
      member,
    };
  },

  denyJoinRequest(requestId: string, reviewedByUserId: string): ExpeditionJoinReviewResult {
    const snapshot = readSnapshot();
    const request = snapshot.joinRequests.find((candidate) => candidate.id === requestId);
    if (!request) {
      return { ok: false, reason: 'Join request not found.' };
    }

    if (request.status !== 'pending') {
      return { ok: false, reason: 'Join request has already been reviewed.' };
    }

    const reviewed = denyJoinRequest(request, reviewedByUserId, new Date().toISOString());
    writeSnapshot({
      ...snapshot,
      joinRequests: snapshot.joinRequests.map((candidate) =>
        candidate.id === requestId ? reviewed : candidate,
      ),
    });

    return {
      ok: true,
      state: 'denied',
      joinRequest: reviewed,
    };
  },
};
