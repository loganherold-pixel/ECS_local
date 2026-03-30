// supabase/functions/auth-handler/index.ts
//
// Production-grade auth handler for ECS
//
// Handles:
// - post_login
// - check_operator_status
// - send_setup_link
// - log_event
// - update_password_audit
// - logout_audit
//
// Expected env vars in Supabase:
// - ECS_SUPABASE_URL
// - ECS_SERVICE_ROLE_KEY
//
// Recommended tables:
// - public.operators
// - public.audit_logs
//
// If those tables do not exist yet, this function still fails gracefully
// and returns safe defaults for auth flows.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type AuthAction =
  | 'post_login'
  | 'check_operator_status'
  | 'send_setup_link'
  | 'log_event'
  | 'update_password_audit'
  | 'logout_audit';

type RequestBody = {
  action?: AuthAction | string;
  user_id?: string | null;
  email?: string | null;
  redirect_to?: string | null;
  event?: string | null;
  metadata?: Record<string, Json> | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const supabaseUrl = getEnv('ECS_SUPABASE_URL');
const serviceRoleKey = getEnv('ECS_SERVICE_ROLE_KEY');

console.log('[auth-handler] env check', {
  hasUrl: !!supabaseUrl,
  hasServiceRoleKey: !!serviceRoleKey,
  urlPrefix: supabaseUrl.slice(0, 24),
});

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function isMissingTableError(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes("relation") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find the table")
  );
}

async function getOperatorByUserId(userId: string) {
  const { data, error } = await admin
    .from('operators')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getOperatorByEmail(email: string) {
  const { data, error } = await admin
    .from('operators')
    .select('*')
    .ilike('email', email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function ensureOperator(userId: string, email: string | null) {
  let existing = null;

  try {
    existing = await getOperatorByUserId(userId);
  } catch (err: any) {
    if (isMissingTableError(String(err?.message || ''))) {
      return {
        user_id: userId,
        email,
        role: 'operator',
        status: 'active',
        display_name: null,
        exists: false,
        tableMissing: true,
      };
    }
    throw err;
  }

  if (existing) {
    if (email && existing.email !== email) {
      const { data: updated, error: updateError } = await admin
        .from('operators')
        .update({
          email,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .select('*')
        .single();

      if (updateError) throw updateError;
      return { ...updated, exists: true, tableMissing: false };
    }

    return { ...existing, exists: true, tableMissing: false };
  }

  const insertPayload = {
    user_id: userId,
    email,
    role: 'operator',
    status: 'active',
    display_name: null,
  };

  const { data: inserted, error: insertError } = await admin
    .from('operators')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertError) {
    if (isMissingTableError(String(insertError?.message || ''))) {
      return {
        ...insertPayload,
        exists: false,
        tableMissing: true,
      };
    }
    throw insertError;
  }

  return { ...inserted, exists: true, tableMissing: false };
}

async function writeAuditLog(
  userId: string | null,
  event: string,
  metadata?: Record<string, Json> | null
) {
  const payload = {
    user_id: userId,
    event,
    metadata: metadata ?? {},
    created_at: new Date().toISOString(),
  };

  const { error } = await admin.from('audit_logs').insert(payload);

  if (error) {
    if (isMissingTableError(String(error?.message || ''))) {
      return { skipped: true, reason: 'audit_logs table missing' };
    }
    throw error;
  }

  return { skipped: false };
}

async function sendSetupLink(email: string, redirectTo?: string | null) {
  const { error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: redirectTo ? { redirectTo } : undefined,
  });

  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = (await req.json()) as RequestBody;

    
    console.log('[auth-handler] action received', {
      action: body?.action ?? null,
      user_id: body?.user_id ?? null,
      hasEmail: !!body?.email,
    });

    const action = body.action;

    if (!action) {
      return jsonResponse({ error: 'Missing action' }, 400);
    }

    switch (action) {
      case 'post_login': {
        const userId = body.user_id?.trim();
        const email = body.email?.trim() || null;

        if (!userId) {
          return jsonResponse({ error: 'Missing user_id' }, 400);
        }

        const operator = await ensureOperator(userId, email);

        try {
          await writeAuditLog(userId, 'post_login', {
            email,
            role: operator.role ?? 'operator',
            status: operator.status ?? 'active',
          });
        } catch (auditErr) {
          console.warn('[auth-handler] audit log failed during post_login', auditErr);
        }

        return jsonResponse({
          success: true,
          suspended: operator.status === 'suspended',
          role: operator.role ?? 'operator',
          status: operator.status ?? 'active',
          display_name: operator.display_name ?? null,
          email: operator.email ?? email,
          exists: operator.exists !== false,
          table_missing: operator.tableMissing === true,
        });
      }

      case 'check_operator_status': {
        const userId = body.user_id?.trim();
        if (!userId) {
          return jsonResponse({ error: 'Missing user_id' }, 400);
        }

        try {
          const operator = await getOperatorByUserId(userId);

          if (!operator) {
            return jsonResponse({
              exists: false,
              role: 'operator',
              status: 'active',
              display_name: null,
              email: null,
            });
          }

          return jsonResponse({
            exists: true,
            role: operator.role ?? 'operator',
            status: operator.status ?? 'active',
            display_name: operator.display_name ?? null,
            email: operator.email ?? null,
          });
        } catch (err: any) {
          if (isMissingTableError(String(err?.message || ''))) {
            return jsonResponse({
              exists: false,
              role: 'operator',
              status: 'active',
              display_name: null,
              email: null,
              table_missing: true,
            });
          }
          throw err;
        }
      }

      case 'send_setup_link': {
        const email = body.email?.trim();
        if (!email) {
          return jsonResponse({ error: 'Missing email' }, 400);
        }

        await sendSetupLink(email, body.redirect_to ?? null);

        try {
          const operator = await getOperatorByEmail(email);
          await writeAuditLog(operator?.user_id ?? null, 'send_setup_link', {
            email,
            redirect_to: body.redirect_to ?? null,
          });
        } catch (auditErr) {
          console.warn('[auth-handler] audit log failed during send_setup_link', auditErr);
        }

        return jsonResponse({ success: true });
      }

      case 'log_event': {
        await writeAuditLog(body.user_id ?? null, body.event ?? 'unknown_event', body.metadata ?? {});
        return jsonResponse({ success: true });
      }

      case 'update_password_audit': {
        await writeAuditLog(body.user_id ?? null, 'update_password', {});
        return jsonResponse({ success: true });
      }

      case 'logout_audit': {
        await writeAuditLog(body.user_id ?? null, 'logout', {});
        return jsonResponse({ success: true });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${String(action)}` }, 400);
    }
  } catch (err: any) {
    console.error('[auth-handler] fatal error', err);
    return jsonResponse(
      {
        error: err?.message || 'Unhandled auth-handler error',
      },
      500
    );
  }
});