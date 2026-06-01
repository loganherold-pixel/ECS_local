/* eslint-disable import/no-unresolved */
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
  | 'get_current_access_state'
  | 'send_setup_link'
  | 'log_event'
  | 'update_password_audit'
  | 'logout_audit'
  | 'rotate_shared_account_password'
  | 'verify_apple_purchase'
  | 'verify_google_purchase'
  | 'restore_apple_purchase'
  | 'restore_google_purchase'
  | 'ingest_billing_event';

type EntitlementStatus = 'free' | 'pro_active' | 'grace' | 'expired' | 'revoked';
type AccountRole = 'user' | 'super_admin';
type AccountAccessLevel = 'standard' | 'full_app_access' | 'super_admin';
type InternalAccountType = 'friends_family' | 'admin_internal' | null;

type RequestBody = {
  action?: AuthAction | string;
  user_id?: string | null;
  email?: string | null;
  redirect_to?: string | null;
  event?: string | null;
  metadata?: Record<string, Json> | null;
  new_password?: string | null;
  revoke_sessions?: boolean | null;
  receipt_data?: string | null;
  package_name?: string | null;
  purchase_token?: string | null;
  product_id?: string | null;
  subscription_id?: string | null;
  external_event_id?: string | null;
  platform?: string | null;
  payload?: Record<string, Json> | null;
};

type AccessBootstrap = {
  role: AccountRole;
  status: 'active';
  access_level: AccountAccessLevel;
  has_full_app_access: boolean;
  is_shared_account: boolean;
  internal_account_type: InternalAccountType;
  allow_password_rotation: boolean;
  internal_tag: string | null;
  account_note: string | null;
  is_admin: boolean;
};

type AccessSummary = {
  role: AccountRole;
  status: string;
  access_level: AccountAccessLevel;
  account_kind: 'standard' | 'shared_internal' | 'admin_internal';
  entitlement_status: EntitlementStatus;
  is_admin: boolean;
  has_full_app_access: boolean;
  is_shared_account: boolean;
  is_shared_internal: boolean;
  internal_account_type: InternalAccountType;
  allow_password_rotation: boolean;
  can_rotate_shared_password: boolean;
  can_revoke_shared_sessions: boolean;
  revoke_sessions_supported: boolean;
  account_note: string | null;
  internal_tag: string | null;
  display_name: string | null;
  email: string | null;
  last_login_at: string | null;
  last_seen_at: string | null;
  last_seen_platform: string | null;
  last_seen_device: string | null;
  subscription_provider: string | null;
  subscription_product_id: string | null;
  subscription_environment: string | null;
  current_period_end_at: string | null;
  current_period_start_at: string | null;
  grace_expires_at: string | null;
  revoked_at: string | null;
  last_verified_at: string | null;
};

type EntitlementRecord = {
  user_id: string;
  entitlement_status: EntitlementStatus;
  provider: string;
  product_id: string | null;
  environment: string | null;
  store_original_transaction_id: string | null;
  store_purchase_token: string | null;
  current_period_start_at: string | null;
  current_period_end_at: string | null;
  grace_expires_at: string | null;
  revoked_at: string | null;
  last_verified_at: string | null;
  last_error: string | null;
  raw_payload: Json;
};

type VerifiedPurchase = {
  entitlement_status: EntitlementStatus;
  provider: string;
  environment: string | null;
  product_id: string | null;
  store_original_transaction_id: string | null;
  store_purchase_token: string | null;
  current_period_start_at: string | null;
  current_period_end_at: string | null;
  grace_expires_at: string | null;
  revoked_at: string | null;
  raw_payload: Json;
};

const ADMIN_ACCOUNT_EMAIL = 'admin@expeditioncommand.com';
const SHARED_INTERNAL_ACCOUNT_EMAIL = 'ecs@friendsandfamily.com';

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

function getOptionalEnv(name: string): string | null {
  const value = Deno.env.get(name);
  return value && value.trim().length > 0 ? value : null;
}

const admin = createClient(getEnv('ECS_SUPABASE_URL'), getEnv('ECS_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function isMissingTableError(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('relation') ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table')
  );
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isSharedInternalAccount(email: string | null | undefined): boolean {
  return normalizeEmail(email) === SHARED_INTERNAL_ACCOUNT_EMAIL;
}

function isAdminAccount(email: string | null | undefined): boolean {
  return normalizeEmail(email) === ADMIN_ACCOUNT_EMAIL;
}

function entitlementGrantsFullAppAccess(status: EntitlementStatus): boolean {
  return status === 'pro_active' || status === 'grace';
}

function bootstrapAccessState(email: string | null | undefined): AccessBootstrap {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail === ADMIN_ACCOUNT_EMAIL) {
    return {
      role: 'super_admin',
      status: 'active',
      access_level: 'super_admin',
      has_full_app_access: true,
      is_shared_account: false,
      internal_account_type: 'admin_internal',
      allow_password_rotation: false,
      internal_tag: 'admin_internal',
      account_note: 'Internal super admin account',
      is_admin: true,
    };
  }

  if (normalizedEmail === SHARED_INTERNAL_ACCOUNT_EMAIL) {
    return {
      role: 'user',
      status: 'active',
      access_level: 'full_app_access',
      has_full_app_access: true,
      is_shared_account: true,
      internal_account_type: 'friends_family',
      allow_password_rotation: true,
      internal_tag: 'friends_family',
      account_note: 'Friends/family shared full-access account',
      is_admin: false,
    };
  }

  return {
    role: 'user',
    status: 'active',
    access_level: 'standard',
    has_full_app_access: false,
    is_shared_account: false,
    internal_account_type: null,
    allow_password_rotation: false,
    internal_tag: null,
    account_note: null,
    is_admin: false,
  };
}

function resolveEntitlementStatus(record: Partial<EntitlementRecord> | null | undefined): EntitlementStatus {
  const status = String(record?.entitlement_status ?? 'free').trim().toLowerCase();
  if (status === 'pro_active' || status === 'grace' || status === 'expired' || status === 'revoked') {
    return status;
  }
  return 'free';
}

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  return null;
}

function parseDateMs(value: unknown): string | null {
  if (value == null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Date(numeric).toISOString();
}

function safeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toJson(value: unknown): Json {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => toJson(item));
  if (typeof value === 'object') {
    const record: Record<string, Json> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      record[key] = toJson(nested);
    }
    return record;
  }
  return String(value);
}

function detectClientPlatform(req: Request): string | null {
  const clientInfo = req.headers.get('x-client-info') ?? req.headers.get('X-Client-Info');
  if (clientInfo) {
    const lowered = clientInfo.toLowerCase();
    if (lowered.includes('expo')) return 'expo';
    if (lowered.includes('react-native')) return 'react_native';
    if (lowered.includes('web')) return 'web';
    return clientInfo.slice(0, 80);
  }
  const userAgent = req.headers.get('user-agent');
  if (!userAgent) return null;
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ios/i.test(userAgent)) return 'ios';
  if (/windows/i.test(userAgent)) return 'windows';
  if (/macintosh|mac os/i.test(userAgent)) return 'mac';
  return userAgent.slice(0, 80);
}

function detectClientDevice(req: Request): string | null {
  const userAgent = req.headers.get('user-agent');
  return userAgent ? userAgent.slice(0, 180) : null;
}

function encodeBase64Url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function getGoogleAccessToken(): Promise<string> {
  const clientEmail = getOptionalEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL');
  const privateKeyRaw = getOptionalEnv('GOOGLE_PLAY_PRIVATE_KEY');
  if (!clientEmail || !privateKeyRaw) {
    throw new Error('Google Play verification is not configured.');
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = encodeBase64Url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const unsignedToken = `${header}.${claim}`;

  const keyData = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const binary = Uint8Array.from(atob(keyData), (char) => char.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binary.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  );

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsignedToken}.${encodeBase64Url(new Uint8Array(signature))}`,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Google Play OAuth failed: ${await tokenResponse.text()}`);
  }

  const tokenJson = await tokenResponse.json();
  if (!tokenJson?.access_token) {
    throw new Error('Google Play OAuth did not return an access token.');
  }
  return String(tokenJson.access_token);
}

async function verifyAppleReceipt(receiptData: string): Promise<VerifiedPurchase> {
  const sharedSecret = getOptionalEnv('APPLE_SHARED_SECRET') || getOptionalEnv('APPLE_APP_SHARED_SECRET');
  if (!sharedSecret) {
    throw new Error('Apple verification is not configured.');
  }

  const requestBody = {
    'receipt-data': receiptData,
    password: sharedSecret,
    'exclude-old-transactions': true,
  };
  let response = await fetch('https://buy.itunes.apple.com/verifyReceipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  let payload = await response.json();

  if (payload?.status === 21007) {
    response = await fetch('https://sandbox.itunes.apple.com/verifyReceipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    payload = await response.json();
  }

  if (!response.ok || payload?.status !== 0) {
    throw new Error(`Apple verification failed with status ${String(payload?.status ?? response.status)}.`);
  }

  const receiptInfoRaw = Array.isArray(payload?.latest_receipt_info)
    ? payload.latest_receipt_info
    : Array.isArray(payload?.receipt?.in_app)
      ? payload.receipt.in_app
      : [];
  const latestReceipt = [...receiptInfoRaw].sort((a: any, b: any) => Number(a?.expires_date_ms || 0) - Number(b?.expires_date_ms || 0)).pop();
  const pendingRenewal = Array.isArray(payload?.pending_renewal_info) ? payload.pending_renewal_info[0] : null;
  const expiresAt = parseDateMs(latestReceipt?.expires_date_ms);
  const graceExpiresAt = parseDateMs(pendingRenewal?.grace_period_expires_date_ms);
  const revokedAt = parseDateMs(latestReceipt?.cancellation_date_ms) || isoOrNull(latestReceipt?.cancellation_date);
  const now = Date.now();

  let entitlementStatus: EntitlementStatus = 'free';
  if (revokedAt) {
    entitlementStatus = 'revoked';
  } else if (graceExpiresAt && new Date(graceExpiresAt).getTime() > now) {
    entitlementStatus = 'grace';
  } else if (expiresAt && new Date(expiresAt).getTime() > now) {
    entitlementStatus = 'pro_active';
  } else if (expiresAt) {
    entitlementStatus = 'expired';
  }

  return {
    entitlement_status: entitlementStatus,
    provider: 'apple_app_store',
    environment: safeString(payload?.environment) || 'production',
    product_id: safeString(latestReceipt?.product_id),
    store_original_transaction_id: safeString(latestReceipt?.original_transaction_id),
    store_purchase_token: null,
    current_period_start_at: parseDateMs(latestReceipt?.purchase_date_ms),
    current_period_end_at: expiresAt,
    grace_expires_at: graceExpiresAt,
    revoked_at: revokedAt,
    raw_payload: toJson(payload),
  };
}

async function verifyGooglePurchase(params: {
  packageName: string;
  purchaseToken: string;
  productId?: string | null;
  subscriptionId?: string | null;
}): Promise<VerifiedPurchase> {
  const accessToken = await getGoogleAccessToken();
  const encodedPackage = encodeURIComponent(params.packageName);
  const encodedToken = encodeURIComponent(params.purchaseToken);
  let response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodedPackage}/purchases/subscriptionsv2/tokens/${encodedToken}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  let payload: any = null;
  if (response.ok) {
    payload = await response.json();
    const firstLineItem = Array.isArray(payload?.lineItems) ? payload.lineItems[0] : null;
    const expiry = isoOrNull(firstLineItem?.expiryTime);
    const now = Date.now();
    const subscriptionState = safeString(payload?.subscriptionState) || 'SUBSCRIPTION_STATE_UNSPECIFIED';
    let entitlementStatus: EntitlementStatus = 'free';

    if (subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD') {
      entitlementStatus = 'grace';
    } else if (subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE' || subscriptionState === 'SUBSCRIPTION_STATE_PENDING') {
      entitlementStatus = 'pro_active';
    } else if (subscriptionState === 'SUBSCRIPTION_STATE_ON_HOLD') {
      entitlementStatus = expiry && new Date(expiry).getTime() > now ? 'grace' : 'expired';
    } else if (subscriptionState === 'SUBSCRIPTION_STATE_EXPIRED') {
      entitlementStatus = 'expired';
    } else if (subscriptionState === 'SUBSCRIPTION_STATE_CANCELED') {
      entitlementStatus = expiry && new Date(expiry).getTime() > now ? 'pro_active' : 'expired';
    } else if (expiry && new Date(expiry).getTime() > now) {
      entitlementStatus = 'pro_active';
    } else if (expiry) {
      entitlementStatus = 'expired';
    }

    return {
      entitlement_status: entitlementStatus,
      provider: 'google_play',
      environment: 'production',
      product_id: safeString(firstLineItem?.productId) || params.subscriptionId || params.productId || null,
      store_original_transaction_id: safeString(payload?.latestOrderId),
      store_purchase_token: params.purchaseToken,
      current_period_start_at: isoOrNull(firstLineItem?.startTime),
      current_period_end_at: expiry,
      grace_expires_at: subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' ? expiry : null,
      revoked_at: null,
      raw_payload: toJson(payload),
    };
  }

  if (!params.productId) {
    throw new Error(`Google Play verification failed: ${await response.text()}`);
  }

  response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodedPackage}/purchases/products/${encodeURIComponent(params.productId)}/tokens/${encodedToken}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new Error(`Google Play verification failed: ${await response.text()}`);
  }

  payload = await response.json();
  const purchaseState = Number(payload?.purchaseState ?? 1);
  const acknowledged = Number(payload?.acknowledgementState ?? 0) === 1;

  return {
    entitlement_status: purchaseState === 0 && acknowledged ? 'pro_active' : 'expired',
    provider: 'google_play',
    environment: 'production',
    product_id: params.productId,
    store_original_transaction_id: safeString(payload?.orderId),
    store_purchase_token: params.purchaseToken,
    current_period_start_at: null,
    current_period_end_at: null,
    grace_expires_at: null,
    revoked_at: null,
    raw_payload: toJson(payload),
  };
}

async function getOperatorByUserId(userId: string) {
  const { data, error } = await admin.from('operators').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function getOperatorByEmail(email: string) {
  const { data, error } = await admin.from('operators').select('*').ilike('email', email).maybeSingle();
  if (error) throw error;
  return data;
}

async function getEntitlementByUserId(userId: string) {
  const { data, error } = await admin.from('entitlements').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function writeAuditLog(userId: string | null, event: string, metadata?: Record<string, Json> | null) {
  const { error } = await admin.from('audit_logs').insert({
    user_id: userId,
    event,
    metadata: metadata ?? {},
    created_at: new Date().toISOString(),
  });
  if (error) {
    if (isMissingTableError(String(error?.message || ''))) return { skipped: true };
    throw error;
  }
  return { skipped: false };
}

async function writeBillingEvent(params: {
  userId: string | null;
  platform: string;
  eventType: string;
  externalEventId?: string | null;
  entitlementStatus?: EntitlementStatus | null;
  payload?: Json;
}) {
  const { error } = await admin.from('billing_events').insert({
    user_id: params.userId,
    platform: params.platform,
    event_type: params.eventType,
    external_event_id: params.externalEventId ?? null,
    entitlement_status: params.entitlementStatus ?? null,
    payload: params.payload ?? {},
    processed_at: new Date().toISOString(),
    received_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
  if (error) {
    if (isMissingTableError(String(error?.message || ''))) return { skipped: true };
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

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Not authorized');
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) throw new Error('Not authorized');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new Error('Not authorized');
  return data.user;
}

async function revokeAllSessionsIfSupported(userId: string) {
  const signOut = (admin.auth.admin as any).signOut;
  if (typeof signOut !== 'function') {
    return { revoke_supported: false, sessions_revoked: false };
  }
  await signOut.call(admin.auth.admin, userId, 'global');
  return { revoke_supported: true, sessions_revoked: true };
}

async function ensureProfile(userId: string, email: string | null, displayName: string | null = null) {
  const payload = { user_id: userId, email, display_name: displayName, updated_at: new Date().toISOString() };
  const { data, error } = await admin
    .from('profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) {
    if (isMissingTableError(String(error?.message || ''))) return { ...payload, tableMissing: true };
    throw error;
  }
  return { ...data, tableMissing: false };
}

async function ensureOperator(userId: string, email: string | null, req?: Request) {
  let existing = null;
  try {
    existing = await getOperatorByUserId(userId);
  } catch (err: any) {
    if (!isMissingTableError(String(err?.message || ''))) throw err;
  }

  const bootstrap = bootstrapAccessState(email);
  const now = new Date().toISOString();
  const payload = {
    user_id: userId,
    email,
    role: bootstrap.role,
    status: 'active',
    access_level: bootstrap.access_level,
    has_full_app_access: bootstrap.has_full_app_access,
    is_shared_account: bootstrap.is_shared_account,
    internal_account_type: bootstrap.internal_account_type,
    allow_password_rotation: bootstrap.allow_password_rotation,
    internal_tag: bootstrap.internal_tag,
    account_note: bootstrap.account_note,
    display_name: existing?.display_name ?? null,
    last_login_at: now,
    last_seen_at: now,
    last_seen_platform: req ? detectClientPlatform(req) : null,
    last_seen_device: req ? detectClientDevice(req) : null,
    updated_at: now,
  };

  const { data, error } = await admin
    .from('operators')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) {
    if (isMissingTableError(String(error?.message || ''))) return { ...payload, tableMissing: true };
    throw error;
  }
  return { ...data, tableMissing: false };
}

async function ensureEntitlement(userId: string) {
  let existing = null;
  try {
    existing = await getEntitlementByUserId(userId);
  } catch (err: any) {
    if (!isMissingTableError(String(err?.message || ''))) throw err;
  }
  if (existing) return { ...existing, tableMissing: false };

  const payload = {
    user_id: userId,
    entitlement_status: 'free',
    provider: 'system_default',
    environment: 'bootstrap',
    last_verified_at: new Date().toISOString(),
    raw_payload: { bootstrap: true },
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin.from('entitlements').upsert(payload, { onConflict: 'user_id' }).select('*').single();
  if (error) {
    if (isMissingTableError(String(error?.message || ''))) return { ...payload, tableMissing: true };
    throw error;
  }
  return { ...data, tableMissing: false };
}

async function persistVerifiedEntitlement(userId: string, verified: VerifiedPurchase, eventType: string) {
  const now = new Date().toISOString();
  const { data, error } = await admin.from('entitlements').upsert({
    user_id: userId,
    entitlement_status: verified.entitlement_status,
    provider: verified.provider,
    product_id: verified.product_id,
    environment: verified.environment,
    store_original_transaction_id: verified.store_original_transaction_id,
    store_purchase_token: verified.store_purchase_token,
    current_period_start_at: verified.current_period_start_at,
    current_period_end_at: verified.current_period_end_at,
    grace_expires_at: verified.grace_expires_at,
    revoked_at: verified.revoked_at,
    last_verified_at: now,
    last_error: null,
    raw_payload: verified.raw_payload,
    updated_at: now,
  }, { onConflict: 'user_id' }).select('*').single();
  if (error) throw error;

  await writeBillingEvent({
    userId,
    platform: verified.provider === 'apple_app_store' ? 'apple' : 'google',
    eventType,
    externalEventId: verified.store_original_transaction_id ?? verified.store_purchase_token ?? null,
    entitlementStatus: verified.entitlement_status,
    payload: verified.raw_payload,
  });
  return data as EntitlementRecord;
}

function buildAccessSummary(params: { email: string | null; operator: any; entitlement: Partial<EntitlementRecord> | null; }): AccessSummary {
  const entitlementStatus = resolveEntitlementStatus(params.entitlement);
  const bootstrap = bootstrapAccessState(params.email);
  const role = params.operator?.role === 'super_admin' || bootstrap.role === 'super_admin' ? 'super_admin' : 'user';
  const status = String(params.operator?.status ?? bootstrap.status ?? 'active');
  const accessLevel = params.operator?.access_level === 'super_admin' || params.operator?.access_level === 'full_app_access' || params.operator?.access_level === 'standard'
    ? params.operator.access_level
    : bootstrap.access_level;
  const revokeSupported = typeof (admin.auth.admin as any).signOut === 'function';
  const isSharedInternal = isSharedInternalAccount(params.email);
  const isSharedAccount = Boolean(params.operator?.is_shared_account ?? bootstrap.is_shared_account);
  const internalAccountType = (safeString(params.operator?.internal_account_type) as InternalAccountType) ?? bootstrap.internal_account_type;
  const hasFullAppAccess =
    accessLevel === 'super_admin' ||
    accessLevel === 'full_app_access' ||
    entitlementGrantsFullAppAccess(entitlementStatus);

  return {
    role,
    status,
    access_level: accessLevel,
    account_kind:
      accessLevel === 'super_admin'
        ? 'admin_internal'
        : isSharedInternal
          ? 'shared_internal'
          : 'standard',
    entitlement_status: entitlementStatus,
    is_admin: role === 'super_admin',
    has_full_app_access: hasFullAppAccess,
    is_shared_account: isSharedAccount,
    is_shared_internal: isSharedInternal,
    internal_account_type: internalAccountType,
    allow_password_rotation: Boolean(params.operator?.allow_password_rotation ?? bootstrap.allow_password_rotation),
    can_rotate_shared_password: isSharedInternal && status !== 'suspended',
    can_revoke_shared_sessions: isSharedInternal && status !== 'suspended' && revokeSupported,
    revoke_sessions_supported: revokeSupported,
    account_note: safeString(params.operator?.account_note) ?? bootstrap.account_note,
    internal_tag: safeString(params.operator?.internal_tag) ?? bootstrap.internal_tag,
    display_name: safeString(params.operator?.display_name),
    email: params.email,
    last_login_at: isoOrNull(params.operator?.last_login_at),
    last_seen_at: isoOrNull(params.operator?.last_seen_at),
    last_seen_platform: safeString(params.operator?.last_seen_platform),
    last_seen_device: safeString(params.operator?.last_seen_device),
    subscription_provider: safeString(params.entitlement?.provider),
    subscription_product_id: safeString(params.entitlement?.product_id),
    subscription_environment: safeString(params.entitlement?.environment),
    current_period_end_at: isoOrNull(params.entitlement?.current_period_end_at),
    current_period_start_at: isoOrNull(params.entitlement?.current_period_start_at),
    grace_expires_at: isoOrNull(params.entitlement?.grace_expires_at),
    revoked_at: isoOrNull(params.entitlement?.revoked_at),
    last_verified_at: isoOrNull(params.entitlement?.last_verified_at),
  };
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
    const action = body.action;
    if (!action) {
      return jsonResponse({ error: 'Missing action' }, 400);
    }

    switch (action) {
      case 'post_login': {
        const userId = body.user_id?.trim();
        const email = normalizeEmail(body.email ?? null);
        if (!userId) return jsonResponse({ error: 'Missing user_id' }, 400);

        const operator = await ensureOperator(userId, email, req);
        await ensureProfile(userId, email, safeString(operator?.display_name));
        const entitlement = await ensureEntitlement(userId);
        const access = buildAccessSummary({ email: email ?? normalizeEmail(operator?.email), operator, entitlement });

        await writeAuditLog(userId, 'post_login', {
          email,
          role: access.role,
          access_level: access.access_level,
          entitlement_status: access.entitlement_status,
          shared_account: access.is_shared_account,
        });

        return jsonResponse({
          success: true,
          suspended: access.status === 'suspended',
          exists: true,
          ...access,
        });
      }

      case 'check_operator_status': {
        const userId = body.user_id?.trim();
        if (!userId) return jsonResponse({ error: 'Missing user_id' }, 400);

        let operator = null;
        let entitlement: Partial<EntitlementRecord> | null = null;
        try {
          operator = await getOperatorByUserId(userId);
          entitlement = await getEntitlementByUserId(userId);
        } catch (err: any) {
          if (!isMissingTableError(String(err?.message || ''))) throw err;
        }

        const access = buildAccessSummary({
          email: normalizeEmail(operator?.email),
          operator,
          entitlement,
        });

        return jsonResponse({
          exists: operator != null,
          ...access,
        });
      }

        case 'get_current_access_state': {
          const currentUser = await getAuthenticatedUser(req);
          const email = normalizeEmail(currentUser.email ?? null);
          const operator = await ensureOperator(currentUser.id, email, req);
          await ensureProfile(currentUser.id, email, safeString(operator?.display_name));
          const entitlement = await ensureEntitlement(currentUser.id);
          const access = buildAccessSummary({ email, operator, entitlement });
          return jsonResponse({
            success: true,
            action: 'get_current_access_state',
            user_id: currentUser.id,
            ...access,
          });
        }

      case 'send_setup_link': {
        const email = body.email?.trim();
        if (!email) return jsonResponse({ error: 'Missing email' }, 400);

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

      case 'rotate_shared_account_password': {
        const currentUser = await getAuthenticatedUser(req);
        const email = normalizeEmail(currentUser.email ?? null);
        if (!isSharedInternalAccount(email)) {
          return jsonResponse({ error: 'Not authorized' }, 403);
        }

        const newPassword = body.new_password?.trim() ?? '';
        if (newPassword.length < 8) {
          return jsonResponse({ error: 'Password must be at least 8 characters.' }, 400);
        }

        const { error: updatePasswordError } = await admin.auth.admin.updateUserById(currentUser.id, {
          password: newPassword,
        });
        if (updatePasswordError) throw updatePasswordError;

        let revoke = { revoke_supported: typeof (admin.auth.admin as any).signOut === 'function', sessions_revoked: false };
        if (body.revoke_sessions === true) {
          try {
            revoke = await revokeAllSessionsIfSupported(currentUser.id);
          } catch (revokeErr) {
            console.warn('[auth-handler] session revoke failed after password rotation', revokeErr);
          }
        }

        await writeAuditLog(currentUser.id, 'shared_account_password_rotated', {
          email,
          revoke_sessions_requested: body.revoke_sessions === true,
          sessions_revoked: revoke.sessions_revoked,
        });

        return jsonResponse({
          success: true,
          sessions_revoked: revoke.sessions_revoked,
          revoke_supported: revoke.revoke_supported,
          access_level: 'full_app_access',
          is_admin: false,
          is_shared_account: true,
          internal_account_type: 'friends_family',
        });
      }

      case 'verify_apple_purchase':
      case 'restore_apple_purchase': {
        const currentUser = await getAuthenticatedUser(req);
        const receiptData = body.receipt_data?.trim() ?? '';
        if (!receiptData) return jsonResponse({ error: 'Missing receipt_data' }, 400);

        const verified = await verifyAppleReceipt(receiptData);
        const entitlement = await persistVerifiedEntitlement(
          currentUser.id,
          verified,
          action === 'restore_apple_purchase' ? 'apple_restore' : 'apple_verify',
        );
        const operator = await ensureOperator(currentUser.id, normalizeEmail(currentUser.email ?? null), req);
        const access = buildAccessSummary({
          email: normalizeEmail(currentUser.email ?? null),
          operator,
          entitlement,
        });

        return jsonResponse({
          success: true,
          platform: 'apple',
          entitlement_status: entitlement.entitlement_status,
          access,
        });
      }

      case 'verify_google_purchase':
      case 'restore_google_purchase': {
        const currentUser = await getAuthenticatedUser(req);
        const purchaseToken = body.purchase_token?.trim() ?? '';
        const packageName = body.package_name?.trim() || getOptionalEnv('GOOGLE_PLAY_PACKAGE_NAME') || '';
        if (!purchaseToken || !packageName) {
          return jsonResponse({ error: 'Missing purchase_token or package_name' }, 400);
        }

        const verified = await verifyGooglePurchase({
          packageName,
          purchaseToken,
          productId: body.product_id?.trim() ?? null,
          subscriptionId: body.subscription_id?.trim() ?? null,
        });
        const entitlement = await persistVerifiedEntitlement(
          currentUser.id,
          verified,
          action === 'restore_google_purchase' ? 'google_restore' : 'google_verify',
        );
        const operator = await ensureOperator(currentUser.id, normalizeEmail(currentUser.email ?? null), req);
        const access = buildAccessSummary({
          email: normalizeEmail(currentUser.email ?? null),
          operator,
          entitlement,
        });

        return jsonResponse({
          success: true,
          platform: 'google',
          entitlement_status: entitlement.entitlement_status,
          access,
        });
      }

      case 'ingest_billing_event': {
        const currentUser = await getAuthenticatedUser(req);
        const operator = await ensureOperator(currentUser.id, normalizeEmail(currentUser.email ?? null), req);
        const access = buildAccessSummary({
          email: normalizeEmail(currentUser.email ?? null),
          operator,
          entitlement: await ensureEntitlement(currentUser.id),
        });
        if (!access.is_admin) {
          return jsonResponse({ error: 'Not authorized' }, 403);
        }

        await writeBillingEvent({
          userId: body.user_id ?? null,
          platform: safeString(body.platform) ?? 'system',
          eventType: safeString(body.event) ?? 'unknown',
          externalEventId: safeString(body.external_event_id),
          entitlementStatus: safeString(body.metadata?.entitlement_status) as EntitlementStatus | null,
          payload: toJson(body.payload ?? body.metadata ?? {}),
        });

        return jsonResponse({ success: true });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${String(action)}` }, 400);
    }
  } catch (err: any) {
    console.error('[auth-handler] fatal error', err);
    return jsonResponse({ error: err?.message || 'Unhandled auth-handler error' }, 500);
  }
});
