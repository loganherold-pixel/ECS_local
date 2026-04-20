/**
 * Auth Helper Module
 *
 * Handles operator management, suspension checks, audit logging,
 * and edge function calls for the Expedition Command System.
 *
 * Error messages use calm, confident language — no tactical jargon.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { AUTH_COPY } from './auth/authCopy';
import {
  buildSharedAccountAccessState,
  type AccountRole,
  type EntitlementStatus,
  type InternalAccountType,
  type SharedAccountAccessLevel,
  type SharedAccountKind,
} from './sharedAccountPolicy';

// ── Clean error message mapping ──────────────────────────────
const ERROR_MAP: Record<string, string> = {
  'Invalid login credentials': AUTH_COPY.login.invalidCredentials,
  'Email not confirmed': AUTH_COPY.session.reauth,
  'User already registered': 'An account with this email already exists.',
  'Password should be at least 6 characters': 'Password must be at least 6 characters.',
  'Signup requires a valid password': 'Please enter a valid password.',
  'User not found': AUTH_COPY.login.invalidCredentials,
  'Email rate limit exceeded': AUTH_COPY.login.rateLimited,
  'For security purposes, you can only request this once every 60 seconds':
    AUTH_COPY.login.rateLimited,
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
    return AUTH_COPY.login.genericFailure;
  }
  if (rawError.toLowerCase().includes('email')) {
    return AUTH_COPY.login.genericFailure;
  }
  if (rawError.toLowerCase().includes('rate') || rawError.toLowerCase().includes('limit')) {
    return AUTH_COPY.login.rateLimited;
  }
  if (rawError.toLowerCase().includes('network') || rawError.toLowerCase().includes('fetch')) {
    return AUTH_COPY.login.offline;
  }
  if (rawError.toLowerCase().includes('not authorized') || rawError.toLowerCase().includes('forbidden')) {
    return 'This account is not authorized to manage shared access.';
  }

  return AUTH_COPY.login.genericFailure;
}

export interface OperatorInfo {
  role: AccountRole;
  status: string;
  display_name: string | null;
  email: string | null;
  exists: boolean;
  access_level: SharedAccountAccessLevel;
  account_kind: SharedAccountKind;
  entitlement_status: EntitlementStatus;
  is_shared_internal: boolean;
  is_shared_account: boolean;
  internal_account_type: InternalAccountType;
  is_admin: boolean;
  has_full_app_access: boolean;
  allow_password_rotation: boolean;
  account_note?: string | null;
  internal_tag?: string | null;
  can_rotate_shared_password: boolean;
  can_revoke_shared_sessions: boolean;
  revoke_sessions_supported: boolean;
  last_login_at?: string | null;
  last_seen_at?: string | null;
  last_seen_platform?: string | null;
  last_seen_device?: string | null;
  subscription_provider?: string | null;
  subscription_product_id?: string | null;
  subscription_environment?: string | null;
  current_period_end_at?: string | null;
  current_period_start_at?: string | null;
  grace_expires_at?: string | null;
  revoked_at?: string | null;
  last_verified_at?: string | null;
}

export interface PostLoginResult {
  success: boolean;
  suspended: boolean;
  role: AccountRole;
  status: string;
  access_level: SharedAccountAccessLevel;
  account_kind: SharedAccountKind;
  entitlement_status: EntitlementStatus;
  is_shared_internal: boolean;
  is_shared_account: boolean;
  internal_account_type: InternalAccountType;
  is_admin: boolean;
  has_full_app_access: boolean;
  allow_password_rotation: boolean;
  account_note?: string | null;
  internal_tag?: string | null;
  can_rotate_shared_password: boolean;
  can_revoke_shared_sessions: boolean;
  revoke_sessions_supported: boolean;
  last_login_at?: string | null;
  last_seen_at?: string | null;
  last_seen_platform?: string | null;
  last_seen_device?: string | null;
  subscription_provider?: string | null;
  subscription_product_id?: string | null;
  subscription_environment?: string | null;
  current_period_end_at?: string | null;
  current_period_start_at?: string | null;
  grace_expires_at?: string | null;
  revoked_at?: string | null;
  last_verified_at?: string | null;
  error?: string;
}

export interface SharedAccountPasswordRotationResult {
  success: boolean;
  sessions_revoked: boolean;
  revoke_supported: boolean;
  error?: string;
}

type SafeFallbackAccessState = Pick<
  OperatorInfo,
  | 'role'
  | 'status'
  | 'access_level'
  | 'account_kind'
  | 'entitlement_status'
  | 'is_shared_internal'
  | 'is_shared_account'
  | 'internal_account_type'
  | 'is_admin'
  | 'has_full_app_access'
  | 'allow_password_rotation'
  | 'can_rotate_shared_password'
  | 'can_revoke_shared_sessions'
  | 'revoke_sessions_supported'
  | 'subscription_provider'
  | 'subscription_product_id'
  | 'subscription_environment'
  | 'current_period_end_at'
  | 'current_period_start_at'
  | 'grace_expires_at'
  | 'revoked_at'
  | 'last_verified_at'
>;

function buildSafeFallbackAccessState(): SafeFallbackAccessState {
  return {
    role: 'user',
    status: 'active',
    access_level: 'standard',
    account_kind: 'standard',
    entitlement_status: 'free',
    is_shared_internal: false,
    is_shared_account: false,
    internal_account_type: null,
    is_admin: false,
    has_full_app_access: false,
    allow_password_rotation: false,
    can_rotate_shared_password: false,
    can_revoke_shared_sessions: false,
    revoke_sessions_supported: false,
    subscription_provider: null,
    subscription_product_id: null,
    subscription_environment: null,
    current_period_end_at: null,
    current_period_start_at: null,
    grace_expires_at: null,
    revoked_at: null,
    last_verified_at: null,
  };
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
    const access = buildSafeFallbackAccessState();
    return {
      success: true,
      suspended: false,
      role: access.role,
      status: 'active',
      access_level: access.access_level,
      account_kind: access.account_kind,
      entitlement_status: access.entitlement_status,
      is_shared_internal: access.is_shared_internal,
      is_shared_account: access.is_shared_account,
      internal_account_type: access.internal_account_type,
      is_admin: access.is_admin,
      has_full_app_access: access.has_full_app_access,
      allow_password_rotation: false,
      can_rotate_shared_password: access.can_rotate_shared_password,
      can_revoke_shared_sessions: access.can_revoke_shared_sessions,
      revoke_sessions_supported: access.can_revoke_shared_sessions,
      subscription_provider: null,
      subscription_product_id: null,
      subscription_environment: null,
      current_period_end_at: null,
      current_period_start_at: null,
      grace_expires_at: null,
      revoked_at: null,
      last_verified_at: null,
    };
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
    const access = buildSafeFallbackAccessState();
    if (!error || isAuthHandlerOptionalFailure(error)) {
      console.warn('[Auth] Post-login handler unavailable (non-blocking):', error || 'No data');
    } else {
      console.warn('[Auth] Post-login handler failed (non-blocking):', error);
    }

    return {
      success: true,
      suspended: false,
      role: access.role,
      status: 'active',
      access_level: access.access_level,
      account_kind: access.account_kind,
      entitlement_status: access.entitlement_status,
      is_shared_internal: access.is_shared_internal,
      is_shared_account: access.is_shared_account,
      internal_account_type: access.internal_account_type,
      is_admin: access.is_admin,
      has_full_app_access: access.has_full_app_access,
      allow_password_rotation: false,
      can_rotate_shared_password: access.can_rotate_shared_password,
      can_revoke_shared_sessions: access.can_revoke_shared_sessions,
      revoke_sessions_supported: false,
      subscription_provider: null,
      subscription_product_id: null,
      subscription_environment: null,
      current_period_end_at: null,
      current_period_start_at: null,
      grace_expires_at: null,
      revoked_at: null,
      last_verified_at: null,
    };
  }

  const access = buildSharedAccountAccessState({
    email: data.email || email,
    role: data.role || 'user',
    status: data.status || 'active',
    entitlementStatus: data.entitlement_status || 'free',
    revokeSupported: data.revoke_sessions_supported !== false,
  });

  return {
    success: data.success !== false,
    suspended: data.suspended === true,
    role: data.role || access.role,
    status: data.status || 'active',
    access_level: access.access_level,
    account_kind: access.account_kind,
    entitlement_status: data.entitlement_status || access.entitlement_status,
    is_shared_internal: access.is_shared_internal,
    is_shared_account: data.is_shared_account === true || access.is_shared_account,
    internal_account_type: data.internal_account_type || access.internal_account_type,
    is_admin: access.is_admin,
    has_full_app_access: data.has_full_app_access === true || access.has_full_app_access,
    allow_password_rotation: data.allow_password_rotation === true,
    account_note: data.account_note || null,
    internal_tag: data.internal_tag || null,
    can_rotate_shared_password: access.can_rotate_shared_password,
    can_revoke_shared_sessions: access.can_revoke_shared_sessions,
    revoke_sessions_supported: data.revoke_sessions_supported !== false,
    last_login_at: data.last_login_at || null,
    last_seen_at: data.last_seen_at || null,
    last_seen_platform: data.last_seen_platform || null,
    last_seen_device: data.last_seen_device || null,
    subscription_provider: data.subscription_provider || null,
    subscription_product_id: data.subscription_product_id || null,
    subscription_environment: data.subscription_environment || null,
    current_period_end_at: data.current_period_end_at || null,
    current_period_start_at: data.current_period_start_at || null,
    grace_expires_at: data.grace_expires_at || null,
    revoked_at: data.revoked_at || null,
    last_verified_at: data.last_verified_at || null,
  };
}

/**
 * Check operator status (non-blocking, with timeout)
 */
export async function checkOperatorStatus(userId: string): Promise<OperatorInfo> {
  if (!userId) {
    const access = buildSafeFallbackAccessState();
    return {
      role: access.role,
      status: 'active',
      display_name: null,
      email: null,
      exists: false,
      access_level: access.access_level,
      account_kind: access.account_kind,
      entitlement_status: access.entitlement_status,
      is_shared_internal: access.is_shared_internal,
      is_shared_account: access.is_shared_account,
      internal_account_type: access.internal_account_type,
      is_admin: access.is_admin,
      has_full_app_access: access.has_full_app_access,
      allow_password_rotation: false,
      can_rotate_shared_password: access.can_rotate_shared_password,
      can_revoke_shared_sessions: access.can_revoke_shared_sessions,
      revoke_sessions_supported: false,
      subscription_provider: null,
      subscription_product_id: null,
      subscription_environment: null,
      current_period_end_at: null,
      current_period_start_at: null,
      grace_expires_at: null,
      revoked_at: null,
      last_verified_at: null,
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
    const access = buildSafeFallbackAccessState();
    return {
      role: access.role,
      status: 'active',
      display_name: null,
      email: null,
      exists: false,
      access_level: access.access_level,
      account_kind: access.account_kind,
      entitlement_status: access.entitlement_status,
      is_shared_internal: access.is_shared_internal,
      is_shared_account: access.is_shared_account,
      internal_account_type: access.internal_account_type,
      is_admin: access.is_admin,
      has_full_app_access: access.has_full_app_access,
      allow_password_rotation: false,
      can_rotate_shared_password: access.can_rotate_shared_password,
      can_revoke_shared_sessions: access.can_revoke_shared_sessions,
      revoke_sessions_supported: false,
      subscription_provider: null,
      subscription_product_id: null,
      subscription_environment: null,
      current_period_end_at: null,
      current_period_start_at: null,
      grace_expires_at: null,
      revoked_at: null,
      last_verified_at: null,
    };
  }

  const access = buildSharedAccountAccessState({
    email: data.email || null,
    role: data.role || 'user',
    status: data.status || 'active',
    entitlementStatus: data.entitlement_status || 'free',
    revokeSupported: data.revoke_sessions_supported !== false,
  });

  return {
    role: data.role || access.role,
    status: data.status || 'active',
    display_name: data.display_name || null,
    email: data.email || null,
    exists: data.exists !== false,
    access_level: access.access_level,
    account_kind: access.account_kind,
    entitlement_status: data.entitlement_status || access.entitlement_status,
    is_shared_internal: access.is_shared_internal,
    is_shared_account: data.is_shared_account === true || access.is_shared_account,
    internal_account_type: data.internal_account_type || access.internal_account_type,
    is_admin: access.is_admin,
    has_full_app_access: data.has_full_app_access === true || access.has_full_app_access,
    allow_password_rotation: data.allow_password_rotation === true,
    account_note: data.account_note || null,
    internal_tag: data.internal_tag || null,
    can_rotate_shared_password: access.can_rotate_shared_password,
    can_revoke_shared_sessions: access.can_revoke_shared_sessions,
    revoke_sessions_supported: data.revoke_sessions_supported !== false,
    last_login_at: data.last_login_at || null,
    last_seen_at: data.last_seen_at || null,
    last_seen_platform: data.last_seen_platform || null,
    last_seen_device: data.last_seen_device || null,
    subscription_provider: data.subscription_provider || null,
    subscription_product_id: data.subscription_product_id || null,
    subscription_environment: data.subscription_environment || null,
    current_period_end_at: data.current_period_end_at || null,
    current_period_start_at: data.current_period_start_at || null,
    grace_expires_at: data.grace_expires_at || null,
    revoked_at: data.revoked_at || null,
    last_verified_at: data.last_verified_at || null,
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

export async function rotateSharedAccountPassword(
  newPassword: string,
  revokeSessions: boolean,
): Promise<SharedAccountPasswordRotationResult> {
  const password = newPassword.trim();
  if (password.length < 8) {
    return {
      success: false,
      sessions_revoked: false,
      revoke_supported: false,
      error: 'Use at least 8 characters for the shared password.',
    };
  }

  const { data, error } = await callAuthHandler({
    action: 'rotate_shared_account_password',
    new_password: password,
    revoke_sessions: revokeSessions,
  });

  if (error) {
    return {
      success: false,
      sessions_revoked: false,
      revoke_supported: false,
      error: sanitizeAuthError(error),
    };
  }

  if (data?.error) {
    return {
      success: false,
      sessions_revoked: false,
      revoke_supported: data.revoke_supported !== false,
      error: sanitizeAuthError(String(data.error)),
    };
  }

  return {
    success: data?.success !== false,
    sessions_revoked: data?.sessions_revoked === true,
    revoke_supported: data?.revoke_supported !== false,
  };
}
