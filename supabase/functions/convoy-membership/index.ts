/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

type ConvoyRole = 'lead' | 'sweep' | 'member' | 'support';

type AuthenticatedUser = {
  id: string;
};

type ActionBody = {
  action?: string;
  convoyId?: string;
  memberId?: string;
  role?: ConvoyRole;
  maxUses?: number;
  expiresAt?: string;
  rawCode?: string;
  callsign?: string;
  vehicleId?: string | null;
};

type ConvoyInviteRow = {
  id: string;
  convoy_id: string;
  role: ConvoyRole;
  max_uses: number;
  used_count: number;
  expires_at: string;
  revoked_at: string | null;
  created_by: string;
  created_at?: string;
};

type ClaimedInviteRow = {
  id: string;
  used_count: number;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VALID_ROLES = new Set<ConvoyRole>(['lead', 'sweep', 'member', 'support']);

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function ok(data: Record<string, unknown>, status = 200): Response {
  return jsonResponse({ ok: true, data }, status);
}

function fail(code: string, error: string, status = 400, details?: string[]): Response {
  return jsonResponse({ ok: false, code, error, details }, status);
}

function backendErrorText(error: unknown): string {
  const maybe = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown } | null;
  return [maybe?.message, maybe?.details, maybe?.hint, maybe?.code]
    .filter((part) => part != null)
    .map(String)
    .join(' ');
}

function backendReadinessFailure(error: unknown): Response | null {
  const text = backendErrorText(error).toLowerCase();
  if (!text) return null;

  if (
    (text.includes('schema cache') || text.includes('pgrst202') || text.includes('pgrst205')) &&
    (text.includes('convoy') || text.includes('claim_convoy_invite'))
  ) {
    return fail(
      'backend_unavailable',
      'Convoy tracking tables or helpers are not visible through the Supabase API yet.',
      503,
      [
        'Apply supabase/migrations/022_convoy_team_tracking.sql.',
        'Apply supabase/migrations/023_convoy_location_retention_cleanup.sql.',
        "Reload the PostgREST schema cache with NOTIFY pgrst, 'reload schema'; or restart the Supabase API.",
      ],
    );
  }

  if (
    ((text.includes('relation') && text.includes('does not exist')) ||
      text.includes('undefined_table') ||
      text.includes('42p01')) &&
    text.includes('convoy')
  ) {
    return fail(
      'backend_unavailable',
      'Convoy tracking schema is not deployed on this Supabase database yet.',
      503,
      [
        'Apply supabase/migrations/022_convoy_team_tracking.sql.',
        'Apply supabase/migrations/023_convoy_location_retention_cleanup.sql.',
        "Reload the PostgREST schema cache with NOTIFY pgrst, 'reload schema'; or restart the Supabase API.",
      ],
    );
  }

  if (
    ((text.includes('function') && text.includes('does not exist')) ||
      text.includes('undefined_function') ||
      text.includes('42883')) &&
    text.includes('claim_convoy_invite')
  ) {
    return fail(
      'backend_unavailable',
      'Convoy invite claim helper is not deployed on this Supabase database yet.',
      503,
      [
        'Apply supabase/migrations/022_convoy_team_tracking.sql.',
        "Reload the PostgREST schema cache with NOTIFY pgrst, 'reload schema'; or restart the Supabase API.",
      ],
    );
  }

  return null;
}

function failBackend(error: unknown, fallback: string): Response {
  return backendReadinessFailure(error) ?? fail('backend_error', fallback, 500);
}

function getEnv(name: string, fallbackName?: string): string {
  const value = Deno.env.get(name) ?? (fallbackName ? Deno.env.get(fallbackName) : undefined);
  if (!value?.trim()) throw new Error(`Missing environment variable: ${name}`);
  return value.trim();
}

function hasEnv(name: string): boolean {
  return Boolean(Deno.env.get(name)?.trim());
}

function createAdminClient() {
  return createClient(getEnv('ECS_SUPABASE_URL', 'SUPABASE_URL'), getEnv('ECS_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sanitizeText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeInviteCode(value: unknown): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

function dateIsFuture(value: unknown): value is string {
  const date = new Date(String(value ?? ''));
  return Number.isFinite(date.getTime()) && date.getTime() > Date.now();
}

function publicInvite(invite: ConvoyInviteRow) {
  return {
    id: invite.id,
    convoy_id: invite.convoy_id,
    role: invite.role,
    max_uses: invite.max_uses,
    used_count: invite.used_count,
    expires_at: invite.expires_at,
    revoked_at: invite.revoked_at,
    created_by: invite.created_by,
    created_at: invite.created_at,
  };
}

function generateInviteCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let suffix = '';
  for (const byte of bytes) {
    suffix += INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length];
  }
  return `ECS-${suffix.slice(0, 4)}-${suffix.slice(4)}`;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hashInviteCode(rawCode: string): Promise<string> {
  const pepper = getEnv('CONVOY_INVITE_HASH_PEPPER');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(normalizeInviteCode(rawCode)));
  return toHex(signature);
}

async function requireUser(admin: ReturnType<typeof createAdminClient>, req: Request): Promise<
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: Response }
> {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { ok: false, response: fail('auth_required', 'Sign in to manage convoy membership.', 401) };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.id) {
    return { ok: false, response: fail('auth_required', 'Unable to validate session.', 401) };
  }

  return { ok: true, user: { id: data.user.id } };
}

async function requireLeader(admin: ReturnType<typeof createAdminClient>, convoyId: string, userId: string) {
  const { data, error } = await admin
    .from('convoys')
    .select('*')
    .eq('id', convoyId)
    .eq('leader_user_id', userId)
    .in('status', ['planned', 'active', 'paused'])
    .maybeSingle();

  if (error) return { ok: false as const, response: failBackend(error, 'Unable to validate convoy leader.') };
  if (!data) return { ok: false as const, response: fail('permission_denied', 'Convoy leader access required.', 403) };
  return { ok: true as const, convoy: data };
}

async function createInvite(admin: ReturnType<typeof createAdminClient>, body: ActionBody, user: AuthenticatedUser) {
  const convoyId = sanitizeText(body.convoyId, 80);
  const role = VALID_ROLES.has(body.role as ConvoyRole) ? (body.role as ConvoyRole) : 'member';
  const requestedMaxUses = Number(body.maxUses ?? 1);
  const maxUses = Number.isFinite(requestedMaxUses) ? Math.max(1, Math.min(requestedMaxUses, 50)) : 1;
  if (!convoyId) return fail('validation_error', 'convoyId is required.');
  if (!dateIsFuture(body.expiresAt)) return fail('validation_error', 'Invite expiry must be in the future.');

  const leader = await requireLeader(admin, convoyId, user.id);
  if (!leader.ok) return leader.response;

  const rawCode = generateInviteCode();
  const codeHash = await hashInviteCode(rawCode);
  const { data, error } = await admin
    .from('convoy_invites')
    .insert({
      convoy_id: convoyId,
      code_hash: codeHash,
      role,
      max_uses: maxUses,
      expires_at: body.expiresAt,
      created_by: user.id,
    })
    .select('id, convoy_id, role, max_uses, used_count, expires_at, revoked_at, created_by, created_at')
    .single();

  if (error || !data) return failBackend(error, 'Unable to create convoy invite.');
  return ok({ invite: publicInvite(data as ConvoyInviteRow), rawCode });
}

async function redeemInvite(admin: ReturnType<typeof createAdminClient>, body: ActionBody, user: AuthenticatedUser) {
  const rawCode = sanitizeText(body.rawCode, 80);
  const callsign = sanitizeText(body.callsign, 40);
  const vehicleId = sanitizeText(body.vehicleId, 120) || null;
  if (!rawCode) return fail('validation_error', 'Invite code is required.');
  if (!callsign) return fail('validation_error', 'Callsign is required.');

  const codeHash = await hashInviteCode(rawCode);
  const { data: invite, error: inviteError } = await admin
    .from('convoy_invites')
    .select('id, convoy_id, role, max_uses, used_count, expires_at, revoked_at, created_by, created_at')
    .eq('code_hash', codeHash)
    .maybeSingle();

  if (inviteError) return failBackend(inviteError, 'Unable to validate invite.');
  if (!invite) return fail('invalid_invite', 'Invite code is not valid.', 404);
  if (invite.revoked_at) return fail('invite_revoked', 'Invite has been revoked.', 403);
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return fail('invite_expired', 'Invite has expired.', 410);
  }
  if (invite.used_count >= invite.max_uses) return fail('invite_maxed', 'Invite has already been used.', 409);

  const { data: convoy, error: convoyError } = await admin
    .from('convoys')
    .select('*')
    .eq('id', invite.convoy_id)
    .in('status', ['planned', 'active', 'paused'])
    .maybeSingle();
  if (convoyError) return failBackend(convoyError, 'Unable to load convoy.');
  if (!convoy) return fail('not_found', 'Convoy is not active.', 404);

  const { data: existing } = await admin
    .from('convoy_members')
    .select('*')
    .eq('convoy_id', invite.convoy_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing?.revoked_at === null) {
    return ok({ convoy, member: existing });
  }

  const { data: claimedInvite, error: claimError } = await admin
    .rpc('claim_convoy_invite', { target_invite_id: invite.id })
    .maybeSingle<ClaimedInviteRow>();

  if (claimError) return failBackend(claimError, 'Unable to claim invite.');
  if (!claimedInvite) return fail('invite_maxed', 'Invite is no longer available.', 409);

  if (existing) {
    const { data: member, error: updateError } = await admin
      .from('convoy_members')
      .update({
        callsign,
        vehicle_id: vehicleId,
        role: invite.role,
        revoked_at: null,
        joined_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (updateError || !member) return failBackend(updateError, 'Unable to reactivate convoy membership.');
    return ok({ convoy, member });
  }

  const { data: member, error: memberError } = await admin
    .from('convoy_members')
    .insert({
      convoy_id: invite.convoy_id,
      user_id: user.id,
      callsign,
      vehicle_id: vehicleId,
      role: invite.role,
    })
    .select('*')
    .single();

  if (memberError || !member) return failBackend(memberError, 'Unable to join convoy.');
  return ok({ convoy, member });
}

async function revokeMember(admin: ReturnType<typeof createAdminClient>, body: ActionBody, user: AuthenticatedUser) {
  const convoyId = sanitizeText(body.convoyId, 80);
  const memberId = sanitizeText(body.memberId, 80);
  if (!convoyId || !memberId) return fail('validation_error', 'convoyId and memberId are required.');

  const leader = await requireLeader(admin, convoyId, user.id);
  if (!leader.ok) return leader.response;

  const { data, error } = await admin
    .from('convoy_members')
    .update({ revoked_at: new Date().toISOString() })
    .eq('convoy_id', convoyId)
    .eq('id', memberId)
    .neq('user_id', user.id)
    .select('*')
    .maybeSingle();

  if (error) return failBackend(error, 'Unable to revoke convoy member.');
  if (!data) return fail('not_found', 'Convoy member was not found or cannot be revoked.', 404);
  return ok(data);
}

async function leaveConvoy(admin: ReturnType<typeof createAdminClient>, body: ActionBody, user: AuthenticatedUser) {
  const convoyId = sanitizeText(body.convoyId, 80);
  if (!convoyId) return fail('validation_error', 'convoyId is required.');

  const { data, error } = await admin
    .from('convoy_members')
    .update({ revoked_at: new Date().toISOString() })
    .eq('convoy_id', convoyId)
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .select('*')
    .maybeSingle();

  if (error) return failBackend(error, 'Unable to leave convoy.');
  if (!data) return fail('not_found', 'Active convoy membership was not found.', 404);

  const { error: locationError } = await admin
    .from('convoy_member_locations')
    .delete()
    .eq('convoy_id', convoyId)
    .eq('member_id', data.id);

  if (locationError) return failBackend(locationError, 'You left the convoy, but location cleanup failed.');

  return ok(data);
}

async function endConvoy(admin: ReturnType<typeof createAdminClient>, body: ActionBody, user: AuthenticatedUser) {
  const convoyId = sanitizeText(body.convoyId, 80);
  if (!convoyId) return fail('validation_error', 'convoyId is required.');

  const leader = await requireLeader(admin, convoyId, user.id);
  if (!leader.ok) return leader.response;

  const endedAt = new Date().toISOString();
  const { data: convoy, error: convoyError } = await admin
    .from('convoys')
    .update({ status: 'completed' })
    .eq('id', convoyId)
    .eq('leader_user_id', user.id)
    .in('status', ['planned', 'active', 'paused'])
    .select('*')
    .maybeSingle();

  if (convoyError) return failBackend(convoyError, 'Unable to end convoy.');
  if (!convoy) return fail('not_found', 'Active convoy was not found.', 404);

  const { error: memberError } = await admin
    .from('convoy_members')
    .update({ revoked_at: endedAt })
    .eq('convoy_id', convoyId)
    .is('revoked_at', null);

  if (memberError) return failBackend(memberError, 'Convoy ended, but member cleanup failed.');

  const { error: inviteError } = await admin
    .from('convoy_invites')
    .update({ revoked_at: endedAt })
    .eq('convoy_id', convoyId)
    .is('revoked_at', null);

  if (inviteError) return failBackend(inviteError, 'Convoy ended, but invite cleanup failed.');

  const { error: locationError } = await admin
    .from('convoy_member_locations')
    .delete()
    .eq('convoy_id', convoyId);

  if (locationError) return failBackend(locationError, 'Convoy ended, but location cleanup failed.');

  return ok(convoy);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return fail('method_not_allowed', 'Method not allowed.', 405);
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return fail('backend_unavailable', 'Convoy membership backend is not configured.', 500);
  }

  const auth = await requireUser(admin, req);
  if (!auth.ok) return auth.response;

  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return fail('validation_error', 'Request body must be valid JSON.', 400);
  }

  try {
    if ((body.action === 'create_invite' || body.action === 'join_with_invite') && !hasEnv('CONVOY_INVITE_HASH_PEPPER')) {
      return fail('backend_unavailable', 'Convoy invite hashing secret is not configured.', 500);
    }

    switch (body.action) {
      case 'create_invite':
        return await createInvite(admin, body, auth.user);
      case 'join_with_invite':
        return await redeemInvite(admin, body, auth.user);
      case 'revoke_member':
        return await revokeMember(admin, body, auth.user);
      case 'leave_convoy':
        return await leaveConvoy(admin, body, auth.user);
      case 'end_convoy':
        return await endConvoy(admin, body, auth.user);
      default:
        return fail('validation_error', 'Unknown convoy membership action.', 400);
    }
  } catch {
    return fail('backend_error', 'Convoy membership request failed.', 500);
  }
});
