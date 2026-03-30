/**
 * Auth Helper Module
 *
 * Handles operator management, suspension checks, audit logging,
 * and edge function calls for the Expedition Command System.
 *
 * Error messages use calm, confident language — no tactical jargon.
 */

import { supabase, isSupabaseConfigured } from './supabase';

// ── Clean error message mapping ──────────────────────────────
const ERROR_MAP: Record<string, string> = {
  'Invalid login credentials': "Couldn't sign in. Check your email and password.",
  'Email not confirmed': "Your email hasn't been verified yet. Check your inbox.",
  'User already registered': 'An account with this email already exists.',
  'Password should be at least 6 characters': 'Password must be at least 6 characters.',
  'Signup requires a valid password': 'Please enter a valid password.',
  'User not found': 'No account found with that email.',
  'Email rate limit exceeded': 'Too many attempts. Please wait a moment and try again.',
  'For security purposes, you can only request this once every 60 seconds':
    'Please wait 60 seconds before trying again.',
};

const AUTH_HANDLER_NAME = 'auth-handler';

type EdgeCallResult = {
  data: any;
  error: string | null;
  status?: number | null;
};

type EdgeInvokeFallback = {
  data: null;
  error: { message: string; name?: string };
  status?: number | null;
};

/**
 * Sanitize Supabase error messages into clean, user-friendly copy
 */
export function sanitizeAuthError(rawError: string): string {
  if (ERROR_MAP[rawError]) return ERROR_MAP[rawError];

  for (const [key, val] of Object.entries(ERROR_MAP)) {
    if (rawError.toLowerCase().includes(key.toLowerCase())) return val;
  }

  if (rawError.toLowerCase().includes('password')) {
    return 'There was a problem with your password. Please try again.';
  }
  if (rawError.toLowerCase().includes('email')) {
    return 'There was a problem with your email. Please check and try again.';
  }
  if (rawError.toLowerCase().includes('rate') || rawError.toLowerCase().includes('limit')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (rawError.toLowerCase().includes('network') || rawError.toLowerCase().includes('fetch')) {
    return 'Network error. Check your connection and try again.';
  }

  return "Couldn't sign in. Please try again or contact support.";
}

export interface OperatorInfo {
  role: string;
  status: string;
  display_name: string | null;
  email: string | null;
  exists: boolean;
}

export interface PostLoginResult {
  success: boolean;
  suspended: boolean;
  role: string;
  status: string;
  error?: string;
}

/**
 * Timeout wrapper — prevents edge function calls from hanging forever
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function getErrorMessage(err: any): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (typeof err?.message === 'string' && err.message.trim()) return err.message;
  if (typeof err?.name === 'string' && err.name.trim()) return err.name;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

function shouldSilenceAuthHandlerWarning(message: string): boolean {
  const msg = message.toLowerCase();

  return (
    msg.includes('failed to fetch') ||
    msg.includes('network request failed') ||
    msg.includes('request timed out') ||
    msg.includes('edge function returned a non-2xx status code') ||
    msg.includes('functionshttperror')
  );
}

function isAuthHandlerOptionalFailure(message: string): boolean {
  const msg = message.toLowerCase();

  return (
    msg.includes('non-2xx') ||
    msg.includes('functionshttperror') ||
    msg.includes('request timed out') ||
    msg.includes('failed to fetch') ||
    msg.includes('network request failed')
  );
}

/**
 * Call the auth-handler edge function with timeout protection
 */
async function callAuthHandler(
  body: Record<string, any>,
  timeoutMs = 8000
): Promise<EdgeCallResult> {
  if (!isSupabaseConfigured) {
    return { data: null, error: 'Supabase not configured', status: null };
  }

  const fallback: EdgeInvokeFallback = {
    data: null,
    error: { message: 'Request timed out', name: 'TimeoutError' },
    status: null,
  };

  try {
    const result = await withTimeout(
      supabase.functions.invoke(AUTH_HANDLER_NAME, { body }),
      timeoutMs,
      fallback as any
    );

    const data = (result as any)?.data ?? null;
    const errorObj = (result as any)?.error ?? null;
    const status = (result as any)?.status ?? null;

    if (errorObj) {
      const message = getErrorMessage(errorObj);

      if (shouldSilenceAuthHandlerWarning(message)) {
        console.warn('[Auth] auth-handler unavailable or returned non-success:', {
          action: body?.action ?? 'unknown',
          message,
          status,
        });
      } else {
        console.warn('[Auth] Edge function error detail:', {
          functionName: AUTH_HANDLER_NAME,
          action: body?.action ?? 'unknown',
          status,
          message,
          error: errorObj,
        });
      }

      return { data: null, error: message, status };
    }

    return { data, error: null, status };
  } catch (e: any) {
    const message = getErrorMessage(e);

    if (shouldSilenceAuthHandlerWarning(message)) {
      console.warn('[Auth] auth-handler call failed:', {
        action: body?.action ?? 'unknown',
        message,
      });
    } else {
      console.warn('[Auth] Edge function call failed:', {
        functionName: AUTH_HANDLER_NAME,
        action: body?.action ?? 'unknown',
        message,
        error: e,
      });
    }

    return { data: null, error: message, status: null };
  }
}

/**
 * Post-login: upsert operator, check suspension, log audit
 * CRITICAL: This must NEVER block login. If it fails, login still succeeds.
 */
export async function postLogin(userId: string, email: string): Promise<PostLoginResult> {
  if (!userId || !email) {
    return { success: true, suspended: false, role: 'operator', status: 'active' };
  }

  const { data, error } = await callAuthHandler(
    {
      action: 'post_login',
      user_id: userId,
      email,
    },
    6000
  );

  if (error || !data) {
    if (!error || isAuthHandlerOptionalFailure(error)) {
      console.warn('[Auth] Post-login handler unavailable (non-blocking):', error || 'No data');
    } else {
      console.warn('[Auth] Post-login handler failed (non-blocking):', error);
    }

    return { success: true, suspended: false, role: 'operator', status: 'active' };
  }

  return {
    success: data.success !== false,
    suspended: data.suspended === true,
    role: data.role || 'operator',
    status: data.status || 'active',
  };
}

/**
 * Check operator status (non-blocking, with timeout)
 */
export async function checkOperatorStatus(userId: string): Promise<OperatorInfo> {
  if (!userId) {
    return {
      role: 'operator',
      status: 'active',
      display_name: null,
      email: null,
      exists: false,
    };
  }

  const { data, error } = await callAuthHandler(
    {
      action: 'check_operator_status',
      user_id: userId,
    },
    5000
  );

  if (error || !data) {
    return {
      role: 'operator',
      status: 'active',
      display_name: null,
      email: null,
      exists: false,
    };
  }

  return {
    role: data.role || 'operator',
    status: data.status || 'active',
    display_name: data.display_name || null,
    email: data.email || null,
    exists: data.exists !== false,
  };
}

/**
 * Send setup/recovery link for first-time credential deployment
 */
export async function sendSetupLink(
  email: string,
  redirectTo?: string
): Promise<{ error?: string }> {
  const { data, error } = await callAuthHandler({
    action: 'send_setup_link',
    email,
    redirect_to: redirectTo,
  });

  if (error) {
    return { error: sanitizeAuthError(error) };
  }

  if (data?.error) {
    return { error: sanitizeAuthError(String(data.error)) };
  }

  return {};
}

/**
 * Log a generic audit event (fire-and-forget, never blocks UI)
 */
export async function logAuditEvent(
  userId: string | null,
  event: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await callAuthHandler(
      {
        action: 'log_event',
        user_id: userId || 'anonymous',
        event,
        metadata: metadata || {},
      },
      3000
    );
  } catch (e) {
    console.warn('[Auth] Audit log failed:', e);
  }
}

/**
 * Log password update audit event
 */
export async function logPasswordUpdate(userId: string | null): Promise<void> {
  try {
    await callAuthHandler(
      {
        action: 'update_password_audit',
        user_id: userId,
      },
      3000
    );
  } catch (e) {
    console.warn('[Auth] Password update audit failed:', e);
  }
}

/**
 * Log logout audit event
 */
export async function logLogout(userId: string | null): Promise<void> {
  try {
    await callAuthHandler(
      {
        action: 'logout_audit',
        user_id: userId,
      },
      3000
    );
  } catch (e) {
    console.warn('[Auth] Logout audit failed:', e);
  }
}

/**
 * Log failed login attempt (fire-and-forget)
 */
export async function logLoginFailed(email: string): Promise<void> {
  try {
    await callAuthHandler(
      {
        action: 'log_event',
        user_id: 'anonymous',
        event: 'login_failed',
        metadata: { email },
      },
      3000
    );
  } catch (e) {
    console.warn('[Auth] Login failed audit failed:', e);
  }
}