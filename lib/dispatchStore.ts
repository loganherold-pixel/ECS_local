// ============================================================
// ECS DISPATCH FEED — DATA STORE
// ============================================================
// Handles all dispatch feed API calls via the dispatch-feed edge function.
// Provides methods for listing events, creating events, managing members,
// and handling invites.

import { supabase } from './supabase';
import * as rateLimitStore from './rateLimitStore';
import type {
  DispatchEvent,
  ExpeditionMember,
  ExpeditionMemberEnriched,
  ExpeditionInvite,
  InviteInfo,
  ListMembersResponse,
  ComposeEventForm,
} from './dispatchTypes';

interface ListEventsResult {
  events: DispatchEvent[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

interface ListInvitesResult {
  invites: ExpeditionInvite[];
}

const FUNC_NAME = 'dispatch-feed';

async function invokeDispatch<T = any>(body: Record<string, any>): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke(FUNC_NAME, { body });

    // Capture rate limit info from response body
    if (data?._rateLimit) {
      rateLimitStore.updateFromBody(FUNC_NAME, data);
    }

    if (error) {
      // Check if this is a 429 rate limit error
      const status = (error as any)?.context?.status || (error as any)?.status;
      if (status === 429) {
        const retryAfter = data?._rateLimit?.retryAfter || 60;
        rateLimitStore.markLimited(FUNC_NAME, retryAfter);
      }
      return { data: null, error: error.message || 'Request failed' };
    }

    if (data?.error) {
      if (data?.code === 'RATE_LIMITED') {
        const retryAfter = data?._rateLimit?.retryAfter || 60;
        rateLimitStore.markLimited(FUNC_NAME, retryAfter);
      }
      return { data: null, error: data.error };
    }

    return { data: data as T, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error' };
  }
}


export const dispatchStore = {
  // ── List Members (enriched with caller context) ────────────
  async listMembers(
    expeditionId: string
  ): Promise<{ data: ListMembersResponse | null; error: string | null }> {
    return invokeDispatch<ListMembersResponse>({
      action: 'list_members',
      expedition_id: expeditionId,
    });
  },

  // ── List Events (paginated) ────────────────────────────────
  async listEvents(
    expeditionId: string,
    page: number = 0,
    sort: 'newest' | 'oldest' = 'newest'
  ): Promise<{ data: ListEventsResult | null; error: string | null }> {
    return invokeDispatch<ListEventsResult>({
      action: 'list_events',
      expedition_id: expeditionId,
      page,
      sort,
    });
  },

  // ── Create Event ───────────────────────────────────────────
  async createEvent(
    expeditionId: string,
    form: ComposeEventForm
  ): Promise<{ data: DispatchEvent | null; error: string | null }> {
    const result = await invokeDispatch<{ event: DispatchEvent }>({
      action: 'create_event',
      expedition_id: expeditionId,
      event_type: form.event_type,
      priority: form.priority,
      headline: form.headline.trim(),
      detail: form.detail.trim() || null,
      location_enabled: form.location_enabled,
      location_label: form.location_label.trim() || null,
      latitude: form.location_enabled ? parseFloat(form.latitude) : null,
      longitude: form.location_enabled ? parseFloat(form.longitude) : null,
      metadata: form.metadata,
    });

    if (result.error) return { data: null, error: result.error };
    return { data: result.data?.event ?? null, error: null };
  },

  // ── Ensure Membership ──────────────────────────────────────
  async ensureMember(
    expeditionId: string,
    role: string = 'owner'
  ): Promise<{ data: ExpeditionMember | null; error: string | null }> {
    const result = await invokeDispatch<{ member: ExpeditionMember }>({
      action: 'ensure_member',
      expedition_id: expeditionId,
      role,
    });

    if (result.error) return { data: null, error: result.error };
    return { data: result.data?.member ?? null, error: null };
  },

  // ── Get Member ─────────────────────────────────────────────
  async getMember(
    expeditionId: string
  ): Promise<{ data: ExpeditionMember | null; error: string | null }> {
    const result = await invokeDispatch<{ member: ExpeditionMember | null }>({
      action: 'get_member',
      expedition_id: expeditionId,
    });

    if (result.error) return { data: null, error: result.error };
    return { data: result.data?.member ?? null, error: null };
  },

  // ── Create Invite ──────────────────────────────────────────
  async createInvite(
    expeditionId: string,
    maxUses: number = 20,
    expiresInHours: number = 24
  ): Promise<{ data: ExpeditionInvite | null; error: string | null }> {
    const result = await invokeDispatch<{ invite: ExpeditionInvite }>({
      action: 'create_invite',
      expedition_id: expeditionId,
      max_uses: maxUses,
      expires_in_hours: expiresInHours,
    });

    if (result.error) return { data: null, error: result.error };
    return { data: result.data?.invite ?? null, error: null };
  },

  // ── List Invites (owner only) ──────────────────────────────
  async listInvites(
    expeditionId: string,
    includeExpired: boolean = false
  ): Promise<{ data: ExpeditionInvite[] | null; error: string | null }> {
    const result = await invokeDispatch<ListInvitesResult>({
      action: 'list_invites',
      expedition_id: expeditionId,
      include_expired: includeExpired,
    });

    if (result.error) return { data: null, error: result.error };
    return { data: result.data?.invites ?? [], error: null };
  },

  // ── Get Invite Info (public pre-join check) ────────────────
  async getInviteInfo(
    inviteCode: string
  ): Promise<{ data: InviteInfo | null; error: string | null }> {
    return invokeDispatch<InviteInfo>({
      action: 'get_invite_info',
      invite_code: inviteCode,
    });
  },

  // ── Join via Invite ────────────────────────────────────────
  async joinInvite(
    inviteCode: string
  ): Promise<{
    data: {
      member: ExpeditionMember;
      expedition_id: string;
      expedition_title?: string | null;
      already_member?: boolean;
      message?: string;
      invite_remaining_uses?: number | null;
      invite_expires_at?: string;
    } | null;
    error: string | null;
  }> {
    return invokeDispatch<{
      member: ExpeditionMember;
      expedition_id: string;
      expedition_title?: string | null;
      already_member?: boolean;
      message?: string;
      invite_remaining_uses?: number | null;
      invite_expires_at?: string;
    }>({
      action: 'join_invite',
      invite_code: inviteCode,
    });
  },

  // ── Revoke Invite (owner only) ─────────────────────────────
  async revokeInvite(
    expeditionId: string,
    inviteId: string
  ): Promise<{ data: { invite: ExpeditionInvite; revoked: boolean } | null; error: string | null }> {
    return invokeDispatch<{ invite: ExpeditionInvite; revoked: boolean }>({
      action: 'revoke_invite',
      expedition_id: expeditionId,
      invite_id: inviteId,
    });
  },

  // ── Leave Expedition ───────────────────────────────────────
  async leaveExpedition(
    expeditionId: string
  ): Promise<{ data: { member: ExpeditionMember; left: boolean } | null; error: string | null }> {
    return invokeDispatch<{ member: ExpeditionMember; left: boolean }>({
      action: 'leave_expedition',
      expedition_id: expeditionId,
    });
  },

  // ── Update Member Role (owner only) ────────────────────────
  async updateMemberRole(
    expeditionId: string,
    targetUserId: string,
    newRole: 'member' | 'viewer' | 'owner'
  ): Promise<{ data: ExpeditionMemberEnriched | null; error: string | null }> {
    const result = await invokeDispatch<{ member: ExpeditionMemberEnriched }>({
      action: 'update_member_role',
      expedition_id: expeditionId,
      target_user_id: targetUserId,
      new_role: newRole,
    });

    if (result.error) return { data: null, error: result.error };
    return { data: result.data?.member ?? null, error: null };
  },
};

