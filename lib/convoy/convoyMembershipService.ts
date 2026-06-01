import type { SupabaseClient } from '@supabase/supabase-js';
import { createPersistedKeyValueCache } from '../keyValuePersistence';
import { isEdgeFunctionUnavailableError, isSupabaseConfigured, supabase } from '../supabase';
import {
  formatConvoyBackendOperatorDetails,
  formatConvoyBackendUserMessage,
  getConvoyBackendReadinessGuidance,
} from './convoyBackendReadiness';
import { stopConvoyLocationSharing } from './convoyLocationPublisher';

const CONVOYS_TABLE = 'convoys';
const CONVOY_MEMBERS_TABLE = 'convoy_members';
const CONVOY_INVITES_TABLE = 'convoy_invites';
const CONVOY_MEMBER_LOCATIONS_TABLE = 'convoy_member_locations';
const CONVOY_MEMBERSHIP_FUNCTION = 'convoy-membership';
const ACTIVE_CONVOY_CACHE_KEY = 'active';
const MAX_CONVOY_NAME_LENGTH = 80;
const MAX_CALLSIGN_LENGTH = 40;

export type ConvoyRole = 'lead' | 'sweep' | 'member' | 'support';
export type ConvoyStatus = 'planned' | 'active' | 'paused' | 'completed' | 'cancelled';

export type ConvoyMembershipServiceErrorCode =
  | 'auth_required'
  | 'validation_error'
  | 'permission_denied'
  | 'not_found'
  | 'invite_expired'
  | 'invite_revoked'
  | 'invite_maxed'
  | 'invalid_invite'
  | 'backend_unavailable'
  | 'backend_error';

export type ConvoyMembershipServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ConvoyMembershipServiceErrorCode; error: string; details?: string[] };

export interface AuthenticatedConvoyUser {
  id: string;
}

export interface ConvoyRecord {
  id: string;
  name: string;
  leader_user_id: string;
  status: ConvoyStatus;
  starts_at: string | null;
  expires_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ConvoyMemberRecord {
  id: string;
  convoy_id: string;
  user_id: string;
  vehicle_id: string | null;
  callsign: string;
  role: ConvoyRole;
  joined_at?: string;
  revoked_at: string | null;
}

export interface ConvoyInviteRecord {
  id: string;
  convoy_id: string;
  role: ConvoyRole;
  max_uses: number;
  used_count: number;
  expires_at: string;
  revoked_at: string | null;
  created_by: string;
  created_at?: string;
}

export interface ActiveConvoyContext {
  convoyId: string;
  memberId: string;
  role: ConvoyRole;
  callsign: string;
  storedAt: string;
}

export interface ConvoyListItem {
  convoy: ConvoyRecord;
  membership: ConvoyMemberRecord;
}

export interface ConvoyLocationSummaryRecord {
  member_id: string;
  movement_status: string | null;
  captured_at: string | null;
  updated_at: string | null;
}

export interface ConvoyRoster {
  members: ConvoyMemberRecord[];
  locationSummaries: ConvoyLocationSummaryRecord[];
}

export interface CreateConvoyInput {
  name: string;
  startsAt?: string | Date | null;
  expiresAt?: string | Date | null;
  leaderCallsign?: string | null;
  leaderVehicleId?: string | null;
}

export interface CreateConvoyInviteInput {
  convoyId: string;
  role?: ConvoyRole;
  maxUses?: number;
  expiresAt: string | Date;
}

export interface CreateConvoyInviteResult {
  invite: ConvoyInviteRecord;
  rawCode: string;
}

export interface JoinConvoyWithInviteInput {
  rawCode: string;
  callsign: string;
  vehicleId?: string | null;
}

export interface JoinConvoyWithInviteResult {
  convoy: ConvoyRecord;
  member: ConvoyMemberRecord;
}

export interface RevokeConvoyMemberInput {
  convoyId: string;
  memberId: string;
}

export interface RevokeConvoyInviteInput {
  convoyId: string;
  inviteId: string;
}

export interface LeaveConvoyInput {
  convoyId: string;
}

export interface EndConvoyInput {
  convoyId: string;
}

type ConvoyMembershipFunctionAction =
  | 'create_invite'
  | 'join_with_invite'
  | 'revoke_member'
  | 'leave_convoy'
  | 'end_convoy';

export interface ConvoyMembershipBackend {
  isAvailable(): boolean;
  getCurrentUser(): Promise<AuthenticatedConvoyUser | null>;
  insertConvoy(row: {
    name: string;
    leader_user_id: string;
    status: ConvoyStatus;
    starts_at: string | null;
    expires_at: string | null;
  }): Promise<ConvoyMembershipServiceResult<ConvoyRecord>>;
  insertLeaderMember(row: {
    convoy_id: string;
    user_id: string;
    vehicle_id: string | null;
    callsign: string;
    role: ConvoyRole;
  }): Promise<ConvoyMembershipServiceResult<ConvoyMemberRecord>>;
  listActiveMemberships(userId: string): Promise<ConvoyMembershipServiceResult<ConvoyListItem[]>>;
  listConvoyMembers(convoyId: string): Promise<ConvoyMembershipServiceResult<ConvoyMemberRecord[]>>;
  listConvoyInvites(convoyId: string): Promise<ConvoyMembershipServiceResult<ConvoyInviteRecord[]>>;
  listConvoyLocationSummaries(convoyId: string): Promise<ConvoyMembershipServiceResult<ConvoyLocationSummaryRecord[]>>;
  revokeConvoyInvite(input: RevokeConvoyInviteInput): Promise<ConvoyMembershipServiceResult<ConvoyInviteRecord>>;
  invokeMembershipFunction<T>(
    action: ConvoyMembershipFunctionAction,
    body: Record<string, unknown>,
  ): Promise<ConvoyMembershipServiceResult<T>>;
  saveActiveContext(context: ActiveConvoyContext): Promise<void>;
  readActiveContext(): Promise<ActiveConvoyContext | null>;
  clearActiveContext(convoyId?: string): Promise<void>;
}

const activeConvoyCache = createPersistedKeyValueCache('ecs_convoy_membership_state');

function toError(
  code: ConvoyMembershipServiceErrorCode,
  error: string,
  details?: string[],
): ConvoyMembershipServiceResult<never> {
  return { ok: false, code, error, details };
}

function normalizeText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeOptionalDate(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeRequiredDate(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeRole(role: ConvoyRole | undefined): ConvoyRole {
  return role ?? 'member';
}

function mapBackendError(error: unknown, fallback: string): ConvoyMembershipServiceResult<never> {
  const maybe = error as { message?: string; code?: ConvoyMembershipServiceErrorCode } | null;
  const userMessage = formatConvoyBackendUserMessage(error);
  if (userMessage) return toError('backend_unavailable', userMessage, formatConvoyBackendOperatorDetails(error) ?? undefined);
  return toError(maybe?.code ?? 'backend_error', maybe?.message ?? fallback);
}

async function requireUser(
  backend: ConvoyMembershipBackend,
): Promise<ConvoyMembershipServiceResult<AuthenticatedConvoyUser>> {
  if (!backend.isAvailable()) {
    const guidance = getConvoyBackendReadinessGuidance('supabase_unconfigured');
    return toError('backend_unavailable', guidance.userMessage, guidance.operatorSteps);
  }

  const user = await backend.getCurrentUser();
  if (!user?.id) {
    return toError('auth_required', 'Sign in to manage convoy membership.');
  }

  return { ok: true, data: user };
}

function mapFunctionError(data: unknown, error: unknown): ConvoyMembershipServiceResult<never> {
  const body = data as { code?: ConvoyMembershipServiceErrorCode; error?: string; details?: string[] } | null;
  const supabaseError = error as { message?: string } | null;

  if (isEdgeFunctionUnavailableError(error)) {
    const guidance = getConvoyBackendReadinessGuidance('edge_function_missing');
    return toError('backend_unavailable', guidance.userMessage, guidance.operatorSteps);
  }

  const readinessMessage = formatConvoyBackendUserMessage(body?.error ?? data ?? error);
  if (readinessMessage) {
    return toError(
      'backend_unavailable',
      readinessMessage,
      formatConvoyBackendOperatorDetails(body?.error ?? data ?? error) ?? body?.details,
    );
  }

  return toError(
    body?.code ?? 'backend_error',
    body?.error ?? supabaseError?.message ?? 'Convoy membership request failed.',
    body?.details,
  );
}

async function readFunctionErrorBody(error: unknown, response?: unknown): Promise<unknown> {
  const explicitResponse = response as Response | undefined;
  const errorContext = (error as { context?: Response } | null)?.context;
  const source = explicitResponse ?? errorContext;
  if (!source || typeof source !== 'object' || typeof (source as Response).clone !== 'function') {
    return null;
  }

  try {
    return await (source as Response).clone().json();
  } catch {
    try {
      const text = await (source as Response).clone().text();
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }
}

export class ConvoyMembershipService {
  constructor(private readonly backend: ConvoyMembershipBackend) {}

  async createConvoy(input: CreateConvoyInput): Promise<ConvoyMembershipServiceResult<ConvoyListItem>> {
    const user = await requireUser(this.backend);
    if (!user.ok) return user;

    const name = normalizeText(input.name, MAX_CONVOY_NAME_LENGTH);
    if (!name) return toError('validation_error', 'Convoy name is required.');

    const startsAt = normalizeOptionalDate(input.startsAt);
    const expiresAt = normalizeOptionalDate(input.expiresAt);
    const callsign = normalizeText(input.leaderCallsign || 'Lead', MAX_CALLSIGN_LENGTH) || 'Lead';
    const vehicleId = normalizeText(input.leaderVehicleId, 120) || null;

    const convoy = await this.backend.insertConvoy({
      name,
      leader_user_id: user.data.id,
      status: 'active',
      starts_at: startsAt,
      expires_at: expiresAt,
    });
    if (!convoy.ok) return convoy;

    const membership = await this.backend.insertLeaderMember({
      convoy_id: convoy.data.id,
      user_id: user.data.id,
      vehicle_id: vehicleId,
      callsign,
      role: 'lead',
    });
    if (!membership.ok) return membership;

    await this.backend.saveActiveContext({
      convoyId: convoy.data.id,
      memberId: membership.data.id,
      role: membership.data.role,
      callsign: membership.data.callsign,
      storedAt: new Date().toISOString(),
    });

    return { ok: true, data: { convoy: convoy.data, membership: membership.data } };
  }

  async createConvoyInvite(
    input: CreateConvoyInviteInput,
  ): Promise<ConvoyMembershipServiceResult<CreateConvoyInviteResult>> {
    const user = await requireUser(this.backend);
    if (!user.ok) return user;

    const convoyId = normalizeText(input.convoyId, 80);
    const expiresAt = normalizeRequiredDate(input.expiresAt);
    const requestedMaxUses = Number(input.maxUses ?? 1);
    const maxUses = Number.isFinite(requestedMaxUses) ? Math.max(1, Math.min(requestedMaxUses, 50)) : 1;
    if (!convoyId) return toError('validation_error', 'convoyId is required.');
    if (!expiresAt) return toError('validation_error', 'Invite expiry is required.');

    return this.backend.invokeMembershipFunction<CreateConvoyInviteResult>('create_invite', {
      convoyId,
      role: normalizeRole(input.role),
      maxUses,
      expiresAt,
    });
  }

  async joinConvoyWithInvite(
    input: JoinConvoyWithInviteInput,
  ): Promise<ConvoyMembershipServiceResult<JoinConvoyWithInviteResult>> {
    const user = await requireUser(this.backend);
    if (!user.ok) return user;

    const rawCode = normalizeText(input.rawCode, 80);
    const callsign = normalizeText(input.callsign, MAX_CALLSIGN_LENGTH);
    const vehicleId = normalizeText(input.vehicleId, 120) || null;
    if (!rawCode) return toError('validation_error', 'Invite code is required.');
    if (!callsign) return toError('validation_error', 'Callsign is required.');

    const joined = await this.backend.invokeMembershipFunction<JoinConvoyWithInviteResult>('join_with_invite', {
      rawCode,
      callsign,
      vehicleId,
    });
    if (!joined.ok) return joined;

    await this.backend.saveActiveContext({
      convoyId: joined.data.convoy.id,
      memberId: joined.data.member.id,
      role: joined.data.member.role,
      callsign: joined.data.member.callsign,
      storedAt: new Date().toISOString(),
    });

    return joined;
  }

  async revokeConvoyMember(input: RevokeConvoyMemberInput): Promise<ConvoyMembershipServiceResult<ConvoyMemberRecord>> {
    const user = await requireUser(this.backend);
    if (!user.ok) return user;

    const convoyId = normalizeText(input.convoyId, 80);
    const memberId = normalizeText(input.memberId, 80);
    if (!convoyId || !memberId) return toError('validation_error', 'convoyId and memberId are required.');

    return this.backend.invokeMembershipFunction<ConvoyMemberRecord>('revoke_member', { convoyId, memberId });
  }

  async revokeConvoyInvite(input: RevokeConvoyInviteInput): Promise<ConvoyMembershipServiceResult<ConvoyInviteRecord>> {
    const user = await requireUser(this.backend);
    if (!user.ok) return user;

    const convoyId = normalizeText(input.convoyId, 80);
    const inviteId = normalizeText(input.inviteId, 80);
    if (!convoyId || !inviteId) return toError('validation_error', 'convoyId and inviteId are required.');

    return this.backend.revokeConvoyInvite({ convoyId, inviteId });
  }

  async leaveConvoy(input: LeaveConvoyInput): Promise<ConvoyMembershipServiceResult<ConvoyMemberRecord>> {
    const user = await requireUser(this.backend);
    if (!user.ok) return user;

    const convoyId = normalizeText(input.convoyId, 80);
    if (!convoyId) return toError('validation_error', 'convoyId is required.');

    const result = await this.backend.invokeMembershipFunction<ConvoyMemberRecord>('leave_convoy', { convoyId });
    if (result.ok) {
      await this.backend.clearActiveContext(convoyId);
      await stopConvoyLocationSharing('You left the convoy. Live sharing stopped.');
    }
    return result;
  }

  async endConvoy(input: EndConvoyInput): Promise<ConvoyMembershipServiceResult<ConvoyRecord>> {
    const user = await requireUser(this.backend);
    if (!user.ok) return user;

    const convoyId = normalizeText(input.convoyId, 80);
    if (!convoyId) return toError('validation_error', 'convoyId is required.');

    const result = await this.backend.invokeMembershipFunction<ConvoyRecord>('end_convoy', { convoyId });
    if (result.ok) {
      await this.backend.clearActiveContext(convoyId);
      await stopConvoyLocationSharing('Convoy ended. Live sharing stopped.');
    }
    return result;
  }

  async listMyActiveConvoys(): Promise<ConvoyMembershipServiceResult<ConvoyListItem[]>> {
    const user = await requireUser(this.backend);
    if (!user.ok) return user;
    return this.backend.listActiveMemberships(user.data.id);
  }

  async listConvoyRoster(convoyId: string): Promise<ConvoyMembershipServiceResult<ConvoyRoster>> {
    const user = await requireUser(this.backend);
    if (!user.ok) return user;

    const normalizedConvoyId = normalizeText(convoyId, 80);
    if (!normalizedConvoyId) return toError('validation_error', 'convoyId is required.');

    const [members, locationSummaries] = await Promise.all([
      this.backend.listConvoyMembers(normalizedConvoyId),
      this.backend.listConvoyLocationSummaries(normalizedConvoyId),
    ]);

    if (!members.ok) return members;
    if (!locationSummaries.ok) return locationSummaries;
    return {
      ok: true,
      data: {
        members: members.data,
        locationSummaries: locationSummaries.data,
      },
    };
  }

  async listConvoyInvites(convoyId: string): Promise<ConvoyMembershipServiceResult<ConvoyInviteRecord[]>> {
    const user = await requireUser(this.backend);
    if (!user.ok) return user;

    const normalizedConvoyId = normalizeText(convoyId, 80);
    if (!normalizedConvoyId) return toError('validation_error', 'convoyId is required.');
    return this.backend.listConvoyInvites(normalizedConvoyId);
  }

  async getActiveConvoyContext(): Promise<ActiveConvoyContext | null> {
    return this.backend.readActiveContext();
  }
}

function createSupabaseConvoyMembershipBackend(client: SupabaseClient = supabase): ConvoyMembershipBackend {
  return {
    isAvailable() {
      return isSupabaseConfigured;
    },

    async getCurrentUser() {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session?.user?.id) return null;
      return { id: data.session.user.id };
    },

    async insertConvoy(row) {
      const { data, error } = await client.from(CONVOYS_TABLE).insert(row).select('*').single();
      if (error || !data) return mapBackendError(error, 'Unable to create convoy.');
      return { ok: true, data: data as ConvoyRecord };
    },

    async insertLeaderMember(row) {
      const { data, error } = await client.from(CONVOY_MEMBERS_TABLE).insert(row).select('*').single();
      if (error || !data) return mapBackendError(error, 'Unable to create convoy leader membership.');
      return { ok: true, data: data as ConvoyMemberRecord };
    },

    async listActiveMemberships(userId) {
      const { data: memberships, error: membershipError } = await client
        .from(CONVOY_MEMBERS_TABLE)
        .select('id, convoy_id, user_id, vehicle_id, callsign, role, joined_at, revoked_at')
        .eq('user_id', userId)
        .is('revoked_at', null)
        .order('joined_at', { ascending: false });

      if (membershipError || !memberships) return mapBackendError(membershipError, 'Unable to load active convoy memberships.');
      if (memberships.length === 0) return { ok: true, data: [] };

      const convoyIds = Array.from(new Set(memberships.map((row) => row.convoy_id).filter(Boolean)));
      const { data: convoys, error: convoyError } = await client
        .from(CONVOYS_TABLE)
        .select('*')
        .in('id', convoyIds)
        .in('status', ['planned', 'active', 'paused'])
        .order('created_at', { ascending: false });

      if (convoyError || !convoys) return mapBackendError(convoyError, 'Unable to load active convoys.');

      const convoyById = new Map((convoys as ConvoyRecord[]).map((convoy) => [convoy.id, convoy]));
      const items = (memberships as ConvoyMemberRecord[]).flatMap((membership) => {
        const convoy = convoyById.get(membership.convoy_id);
        return convoy ? [{ convoy, membership }] : [];
      });

      return { ok: true, data: items };
    },

    async listConvoyMembers(convoyId) {
      const { data, error } = await client
        .from(CONVOY_MEMBERS_TABLE)
        .select('id, convoy_id, user_id, vehicle_id, callsign, role, joined_at, revoked_at')
        .eq('convoy_id', convoyId)
        .is('revoked_at', null)
        .order('joined_at', { ascending: true });

      if (error || !data) return mapBackendError(error, 'Unable to load convoy roster.');
      return { ok: true, data: data as ConvoyMemberRecord[] };
    },

    async listConvoyInvites(convoyId) {
      const { data, error } = await client
        .from(CONVOY_INVITES_TABLE)
        .select('id, convoy_id, role, max_uses, used_count, expires_at, revoked_at, created_by, created_at')
        .eq('convoy_id', convoyId)
        .order('created_at', { ascending: false });

      if (error || !data) return mapBackendError(error, 'Unable to load convoy invites.');
      return { ok: true, data: data as ConvoyInviteRecord[] };
    },

    async listConvoyLocationSummaries(convoyId) {
      const { data, error } = await client
        .from(CONVOY_MEMBER_LOCATIONS_TABLE)
        .select('member_id, movement_status, captured_at, updated_at')
        .eq('convoy_id', convoyId);

      if (error || !data) return mapBackendError(error, 'Unable to load convoy location summaries.');
      return { ok: true, data: data as ConvoyLocationSummaryRecord[] };
    },

    async revokeConvoyInvite(input) {
      const { data, error } = await client
        .from(CONVOY_INVITES_TABLE)
        .update({ revoked_at: new Date().toISOString() })
        .eq('convoy_id', input.convoyId)
        .eq('id', input.inviteId)
        .select('id, convoy_id, role, max_uses, used_count, expires_at, revoked_at, created_by, created_at')
        .single();

      if (error || !data) return mapBackendError(error, 'Unable to revoke convoy invite.');
      return { ok: true, data: data as ConvoyInviteRecord };
    },

    async invokeMembershipFunction(action, body) {
      const { data, error, response } = await client.functions.invoke(CONVOY_MEMBERSHIP_FUNCTION, {
        body: { action, ...body },
      }) as { data: unknown; error: unknown; response?: Response };
      const envelope = data as { ok?: boolean; data?: unknown } | null;

      if (error || !envelope || envelope.ok === false) {
        const errorBody = data ?? await readFunctionErrorBody(error, response);
        return mapFunctionError(errorBody, error);
      }

      return { ok: true, data: envelope.data as any };
    },

    async saveActiveContext(context) {
      await activeConvoyCache.waitForHydration();
      activeConvoyCache.set(ACTIVE_CONVOY_CACHE_KEY, JSON.stringify(context));
      await activeConvoyCache.flush();
    },

    async readActiveContext() {
      await activeConvoyCache.waitForHydration();
      const raw = activeConvoyCache.get(ACTIVE_CONVOY_CACHE_KEY);
      if (!raw) return null;

      try {
        const parsed = JSON.parse(raw) as ActiveConvoyContext;
        return parsed?.convoyId && parsed?.memberId ? parsed : null;
      } catch {
        return null;
      }
    },

    async clearActiveContext(convoyId) {
      await activeConvoyCache.waitForHydration();
      const raw = activeConvoyCache.get(ACTIVE_CONVOY_CACHE_KEY);
      if (convoyId && raw) {
        try {
          const parsed = JSON.parse(raw) as ActiveConvoyContext;
          if (parsed.convoyId !== convoyId) return;
        } catch {}
      }
      activeConvoyCache.delete(ACTIVE_CONVOY_CACHE_KEY);
      await activeConvoyCache.flush();
    },
  };
}

export const convoyMembershipService = new ConvoyMembershipService(createSupabaseConvoyMembershipBackend());
