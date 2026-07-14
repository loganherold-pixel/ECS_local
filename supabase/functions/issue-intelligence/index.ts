/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  buildIssueGroupSummary,
  normalizeIssueEventForInsert,
  type IssueEvent,
} from '../_shared/issueIntelligenceSummary.ts';

type IssueAction = 'ingest_issue_event' | 'get_issue_summary';

type RequestBody = {
  action?: IssueAction | string;
  events?: IssueEvent[];
};

const MAX_INGEST_BATCH_SIZE = 20;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const admin = createClient(getEnv('ECS_SUPABASE_URL'), getEnv('ECS_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function requireAdmin(req: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Admin authorization required' }, 401) };
  }

  const { data: authUser, error: authError } = await admin.auth.getUser(token);
  if (authError || !authUser?.user?.id) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Unable to validate admin session' }, 401) };
  }

  const normalizedEmail = String(authUser.user.email ?? '').trim().toLowerCase();
  if (normalizedEmail === 'admin@expeditioncommand.com') {
    return { ok: true };
  }

  const { data: operator } = await admin
    .from('operators')
    .select('role, access_level, internal_account_type')
    .eq('user_id', authUser.user.id)
    .maybeSingle();

  const isAdmin =
    operator?.role === 'super_admin' ||
    operator?.access_level === 'super_admin' ||
    operator?.internal_account_type === 'admin_internal';

  if (!isAdmin) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Admin access required' }, 403) };
  }

  return { ok: true };
}

async function requireAuthenticatedUser(req: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, code: 'ISSUE_AUTH_REQUIRED', error: 'Authentication required' }, 401),
    };
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.id) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, code: 'ISSUE_AUTH_INVALID', error: 'Unable to validate session' }, 401),
    };
  }
  return { ok: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const action = String(body.action ?? '');

    if (action === 'ingest_issue_event') {
      const access = await requireAuthenticatedUser(req);
      if (!access.ok) return access.response;
      const events = Array.isArray(body.events) ? body.events : [];
      if (!events.length) {
        return jsonResponse({ ok: true, inserted: 0 });
      }
      if (events.length > MAX_INGEST_BATCH_SIZE) {
        return jsonResponse({
          ok: false,
          code: 'ISSUE_BATCH_LIMIT_EXCEEDED',
          error: 'Issue event batch exceeds the supported limit',
        }, 413);
      }

      const normalizedEvents = events.map(normalizeIssueEventForInsert);
      const { error } = await admin.from('ecs_issue_events').insert(normalizedEvents);
      if (error) {
        return jsonResponse({
          ok: false,
          code: 'ISSUE_EVENT_INSERT_FAILED',
          error: 'Issue event insert failed',
        }, 500);
      }
      return jsonResponse({ ok: true, inserted: normalizedEvents.length });
    }

    if (action === 'get_issue_summary') {
      const access = await requireAdmin(req);
      if (!access.ok) return access.response;

      const { data, error } = await admin
        .from('ecs_issue_events')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(4000);

      if (error) {
        return jsonResponse({
          ok: false,
          code: 'ISSUE_SUMMARY_READ_FAILED',
          error: 'Issue summary read failed',
        }, 500);
      }

      return jsonResponse({
        ok: true,
        summary: buildIssueGroupSummary(Array.isArray(data) ? data : []),
      });
    }

    return jsonResponse({ ok: false, error: 'Unsupported issue intelligence action' }, 400);
  } catch {
    return jsonResponse({
      ok: false,
      code: 'ISSUE_INTELLIGENCE_UNEXPECTED',
      error: 'Unexpected issue intelligence failure',
    }, 500);
  }
});
