export const ADMIN_ACCOUNT_EMAIL = 'admin@expeditioncommand.com';
export const SHARED_INTERNAL_ACCOUNT_EMAIL = 'ecs@friendsandfamily.com';

export type AccountRole = 'user' | 'super_admin';
export type AccountAccessLevel = 'standard' | 'full_app_access' | 'super_admin';
export type AccountKind = 'standard' | 'shared_internal' | 'admin_internal';
export type InternalAccountType = 'friends_family' | 'admin_internal' | null;
export type EntitlementStatus = 'free' | 'pro_active' | 'grace' | 'expired' | 'revoked';

// Backward-compatible aliases while the rest of the app transitions to the
// generalized access model.
export type SharedAccountAccessLevel = AccountAccessLevel;
export type SharedAccountKind = AccountKind;

export interface SharedAccountAccessState {
  role: AccountRole;
  access_level: AccountAccessLevel;
  account_kind: AccountKind;
  entitlement_status: EntitlementStatus;
  is_shared_internal: boolean;
  is_shared_account: boolean;
  internal_account_type: InternalAccountType;
  is_admin: boolean;
  has_full_app_access: boolean;
  can_rotate_shared_password: boolean;
  can_revoke_shared_sessions: boolean;
}

export function normalizeSharedAccountEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function isSharedInternalAccountEmail(email: string | null | undefined): boolean {
  return normalizeSharedAccountEmail(email) === SHARED_INTERNAL_ACCOUNT_EMAIL;
}

export function isAdminAccountEmail(email: string | null | undefined): boolean {
  return normalizeSharedAccountEmail(email) === ADMIN_ACCOUNT_EMAIL;
}

export function entitlementGrantsFullAppAccess(status: EntitlementStatus | null | undefined): boolean {
  return status === 'pro_active' || status === 'grace';
}

export function buildSharedAccountAccessState(params: {
  email?: string | null;
  role?: string | null;
  status?: string | null;
  entitlementStatus?: EntitlementStatus | null;
  revokeSupported?: boolean;
}): SharedAccountAccessState {
  const normalizedEmail = normalizeSharedAccountEmail(params.email);
  const isAdmin = isAdminAccountEmail(normalizedEmail);
  const isSharedInternal = isSharedInternalAccountEmail(normalizedEmail);
  const normalizedStatus = (params.status || 'active').trim().toLowerCase();
  const isActive = normalizedStatus !== 'suspended';
  const entitlementStatus = params.entitlementStatus || 'free';
  const revokeSupported = params.revokeSupported !== false;

  let role: AccountRole = params.role === 'super_admin' || isAdmin ? 'super_admin' : 'user';
  let accessLevel: AccountAccessLevel = 'standard';
  let accountKind: AccountKind = 'standard';
  let internalAccountType: InternalAccountType = null;
  let isSharedAccount = false;

  if (isAdmin) {
    role = 'super_admin';
    accessLevel = 'super_admin';
    accountKind = 'admin_internal';
    internalAccountType = 'admin_internal';
  } else if (isSharedInternal) {
    role = 'user';
    accessLevel = 'full_app_access';
    accountKind = 'shared_internal';
    internalAccountType = 'friends_family';
    isSharedAccount = true;
  }

  const hasFullAppAccess =
    accessLevel === 'super_admin' ||
    accessLevel === 'full_app_access' ||
    entitlementGrantsFullAppAccess(entitlementStatus);

  return {
    role,
    access_level: accessLevel,
    account_kind: accountKind,
    entitlement_status: entitlementStatus,
    is_shared_internal: isSharedInternal,
    is_shared_account: isSharedAccount,
    internal_account_type: internalAccountType,
    is_admin: role === 'super_admin',
    has_full_app_access: hasFullAppAccess,
    can_rotate_shared_password: isSharedInternal && isActive,
    can_revoke_shared_sessions: isSharedInternal && isActive && revokeSupported,
  };
}
