export type ExpeditionInviteStatus = 'active' | 'disabled' | 'expired';

export type ExpeditionJoinRequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

export type ExpeditionChannelDefaultRole = 'member' | 'viewer' | 'guest';

export type ExpeditionChannelMemberLiteStatus = 'active' | 'inactive' | 'removed';

export interface ExpeditionChannelInvite {
  id: string;
  expeditionId: string;
  createdByUserId: string;
  joinCode: string;
  inviteLink: string;
  status: ExpeditionInviteStatus;
  approvalRequired: boolean;
  defaultRole: ExpeditionChannelDefaultRole;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpeditionJoinRequest {
  id: string;
  expeditionId: string;
  inviteId: string;
  userId: string;
  displayName: string;
  callsign: string | null;
  requestedRole: ExpeditionChannelDefaultRole;
  status: ExpeditionJoinRequestStatus;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
}

export interface ExpeditionChannelMemberLite {
  id: string;
  expeditionId: string;
  userId: string;
  displayName: string;
  callsign: string | null;
  role: ExpeditionChannelDefaultRole;
  joinedAt: string;
  status: ExpeditionChannelMemberLiteStatus;
}

export interface ExpeditionInviteSettings {
  expeditionId: string;
  approvalRequired: boolean;
  defaultRole: ExpeditionChannelDefaultRole;
  expiresInHours: number;
  inviteLinkBaseUrl: string;
  qrDisplayEnabled: boolean;
  updatedAt: string;
  updatedByUserId: string | null;
}

export interface GenerateJoinCodeInput {
  expeditionId: string;
  createdByUserId: string;
  createdAt: string;
  sequence?: number;
}

export interface CreateJoinRequestInput {
  invite: ExpeditionChannelInvite;
  userId: string;
  displayName: string;
  callsign?: string | null;
  requestedRole?: ExpeditionChannelDefaultRole;
  requestedAt: string;
}

export interface ApprovedJoinRequestResult {
  joinRequest: ExpeditionJoinRequest;
  member: ExpeditionChannelMemberLite;
}

const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_JOIN_CODE_LENGTH = 8;
const JOIN_CODE_MIN_LENGTH = 6;
const JOIN_CODE_MAX_LENGTH = 12;

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clampJoinCodeLength(length: number): number {
  if (!Number.isFinite(length)) return DEFAULT_JOIN_CODE_LENGTH;
  return Math.min(JOIN_CODE_MAX_LENGTH, Math.max(JOIN_CODE_MIN_LENGTH, Math.floor(length)));
}

function normalizeSeed(seed: string | GenerateJoinCodeInput): string {
  if (typeof seed === 'string') {
    return seed.trim();
  }

  return [
    seed.expeditionId,
    seed.createdByUserId,
    seed.createdAt,
    String(seed.sequence ?? 0),
  ].join(':');
}

function stripJoinCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[IO01]/g, '');
}

function stableId(prefix: string, parts: string[]): string {
  const readable = parts
    .map((part) => part.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('-');

  return `${prefix}-${readable || stableHash(parts.join(':')).toString(36)}`;
}

export function generateJoinCode(
  seed: string | GenerateJoinCodeInput,
  length: number = DEFAULT_JOIN_CODE_LENGTH,
): string {
  const normalizedLength = clampJoinCodeLength(length);
  const normalizedSeed = normalizeSeed(seed);
  let hash = stableHash(normalizedSeed || 'ecs-expedition-channel');
  let code = '';

  for (let index = 0; index < normalizedLength; index += 1) {
    hash = Math.imul(hash ^ (index + 1), 1103515245) + 12345;
    const alphabetIndex = (hash >>> 0) % JOIN_CODE_ALPHABET.length;
    code += JOIN_CODE_ALPHABET[alphabetIndex];
  }

  return code;
}

export function formatJoinCode(value: string, groupSize: number = 4): string {
  const stripped = stripJoinCode(value);
  const safeGroupSize = Math.max(2, Math.floor(groupSize));
  const groups: string[] = [];

  for (let index = 0; index < stripped.length; index += safeGroupSize) {
    groups.push(stripped.slice(index, index + safeGroupSize));
  }

  return groups.join('-');
}

export function validateJoinCode(value: string): boolean {
  const stripped = stripJoinCode(value);
  return stripped.length >= JOIN_CODE_MIN_LENGTH && stripped.length <= JOIN_CODE_MAX_LENGTH;
}

export function createInviteLink(baseUrl: string, joinCode: string): string {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, '');
  const normalizedCode = stripJoinCode(joinCode);
  return `${normalizedBase}/expedition-channel/join/${encodeURIComponent(normalizedCode)}`;
}

export function isInviteExpired(
  invite: Pick<ExpeditionChannelInvite, 'expiresAt'>,
  now: string | number | Date = Date.now(),
): boolean {
  const expiresAtMs = Date.parse(invite.expiresAt);
  const nowMs = now instanceof Date ? now.getTime() : typeof now === 'string' ? Date.parse(now) : now;

  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(nowMs)) {
    return true;
  }

  return expiresAtMs <= nowMs;
}

export function canUseInvite(
  invite: Pick<ExpeditionChannelInvite, 'status' | 'expiresAt'>,
  now: string | number | Date = Date.now(),
): boolean {
  return invite.status === 'active' && !isInviteExpired(invite, now);
}

export function createJoinRequest(input: CreateJoinRequestInput): ExpeditionJoinRequest {
  const displayName = input.displayName.trim();
  return {
    id: stableId('join-request', [input.invite.id, input.userId]),
    expeditionId: input.invite.expeditionId,
    inviteId: input.invite.id,
    userId: input.userId,
    displayName: displayName || 'Unknown team member',
    callsign: input.callsign?.trim() || null,
    requestedRole: input.requestedRole ?? input.invite.defaultRole,
    status: 'pending',
    requestedAt: new Date(Date.parse(input.requestedAt)).toISOString(),
    reviewedAt: null,
    reviewedByUserId: null,
  };
}

export function approveJoinRequest(
  request: ExpeditionJoinRequest,
  reviewedByUserId: string,
  reviewedAt: string,
): ApprovedJoinRequestResult {
  const reviewedAtIso = new Date(Date.parse(reviewedAt)).toISOString();
  const joinRequest: ExpeditionJoinRequest = {
    ...request,
    status: 'approved',
    reviewedAt: reviewedAtIso,
    reviewedByUserId,
  };

  return {
    joinRequest,
    member: {
      id: stableId('channel-member', [request.expeditionId, request.userId]),
      expeditionId: request.expeditionId,
      userId: request.userId,
      displayName: request.displayName,
      callsign: request.callsign,
      role: request.requestedRole,
      joinedAt: reviewedAtIso,
      status: 'active',
    },
  };
}

export function denyJoinRequest(
  request: ExpeditionJoinRequest,
  reviewedByUserId: string,
  reviewedAt: string,
): ExpeditionJoinRequest {
  return {
    ...request,
    status: 'denied',
    reviewedAt: new Date(Date.parse(reviewedAt)).toISOString(),
    reviewedByUserId,
  };
}

export const DEMO_EXPEDITION_INVITE_SETTINGS: ExpeditionInviteSettings = {
  expeditionId: 'demo-expedition-ruby-ridge',
  approvalRequired: true,
  defaultRole: 'member',
  expiresInHours: 24,
  inviteLinkBaseUrl: 'https://ecs.local',
  qrDisplayEnabled: false,
  updatedAt: '2026-04-24T19:00:00.000Z',
  updatedByUserId: 'demo-user-command',
};

const DEMO_JOIN_CODE = generateJoinCode({
  expeditionId: DEMO_EXPEDITION_INVITE_SETTINGS.expeditionId,
  createdByUserId: 'demo-user-command',
  createdAt: '2026-04-24T19:00:00.000Z',
});

export const DEMO_EXPEDITION_CHANNEL_INVITE: ExpeditionChannelInvite = {
  id: 'demo-invite-ruby-ridge-active',
  expeditionId: DEMO_EXPEDITION_INVITE_SETTINGS.expeditionId,
  createdByUserId: 'demo-user-command',
  joinCode: formatJoinCode(DEMO_JOIN_CODE),
  inviteLink: createInviteLink(DEMO_EXPEDITION_INVITE_SETTINGS.inviteLinkBaseUrl, DEMO_JOIN_CODE),
  status: 'active',
  approvalRequired: DEMO_EXPEDITION_INVITE_SETTINGS.approvalRequired,
  defaultRole: DEMO_EXPEDITION_INVITE_SETTINGS.defaultRole,
  expiresAt: '2026-04-25T19:00:00.000Z',
  createdAt: '2026-04-24T19:00:00.000Z',
  updatedAt: '2026-04-24T19:00:00.000Z',
};

export const DEMO_PENDING_JOIN_REQUEST: ExpeditionJoinRequest = createJoinRequest({
  invite: DEMO_EXPEDITION_CHANNEL_INVITE,
  userId: 'demo-user-nia',
  displayName: 'Nia Torres',
  callsign: 'Scout',
  requestedRole: 'member',
  requestedAt: '2026-04-24T19:08:00.000Z',
});

const demoApprovedRequest = createJoinRequest({
  invite: DEMO_EXPEDITION_CHANNEL_INVITE,
  userId: 'demo-user-alex',
  displayName: 'Alex Morgan',
  callsign: 'Lead',
  requestedRole: 'member',
  requestedAt: '2026-04-24T19:02:00.000Z',
});

export const DEMO_APPROVED_MEMBER: ExpeditionChannelMemberLite = approveJoinRequest(
  demoApprovedRequest,
  'demo-user-command',
  '2026-04-24T19:03:00.000Z',
).member;

export const DEMO_DENIED_JOIN_REQUEST: ExpeditionJoinRequest = denyJoinRequest(
  createJoinRequest({
    invite: DEMO_EXPEDITION_CHANNEL_INVITE,
    userId: 'demo-user-casey',
    displayName: 'Casey Lee',
    callsign: 'Guest 2',
    requestedRole: 'guest',
    requestedAt: '2026-04-24T19:11:00.000Z',
  }),
  'demo-user-command',
  '2026-04-24T19:12:00.000Z',
);

export const DEMO_EXPEDITION_INVITE_FIXTURES = {
  settings: DEMO_EXPEDITION_INVITE_SETTINGS,
  activeInvite: DEMO_EXPEDITION_CHANNEL_INVITE,
  joinRequests: [
    DEMO_PENDING_JOIN_REQUEST,
    DEMO_DENIED_JOIN_REQUEST,
  ],
  members: [
    DEMO_APPROVED_MEMBER,
  ],
} satisfies {
  settings: ExpeditionInviteSettings;
  activeInvite: ExpeditionChannelInvite;
  joinRequests: ExpeditionJoinRequest[];
  members: ExpeditionChannelMemberLite[];
};
