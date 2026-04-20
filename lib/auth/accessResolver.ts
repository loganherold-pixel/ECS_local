import type { OperatorInfo } from '../auth';
import { AUTH_COPY } from './authCopy';
import type {
  ECSAccessEntitlementSource,
  ECSAccessResolution,
  ECSAccessRole,
  ECSAccessState,
  ECSAccessVerificationMode,
} from './entitlementTypes';

const ENTITLEMENT_VERIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function isEntitlementVerificationFresh(
  access: Partial<OperatorInfo> | null | undefined,
  now = Date.now(),
): boolean {
  const lastVerifiedAt = parseTimestamp(access?.last_verified_at);
  if (lastVerifiedAt == null) return false;
  return now - lastVerifiedAt <= ENTITLEMENT_VERIFICATION_MAX_AGE_MS;
}

function resolveRole(access: Partial<OperatorInfo> | null | undefined): ECSAccessRole {
  if (
    access?.is_admin === true ||
    access?.access_level === 'super_admin' ||
    access?.internal_account_type === 'admin_internal'
  ) {
    return 'admin';
  }

  if (
    access?.is_shared_account === true ||
    access?.is_shared_internal === true ||
    access?.internal_account_type === 'friends_family'
  ) {
    return 'friends_and_family';
  }

  return 'standard';
}

function resolveEntitlementSource(
  access: Partial<OperatorInfo> | null | undefined,
  role: ECSAccessRole,
): ECSAccessEntitlementSource {
  if (role === 'admin') return 'admin_grant';
  if (role === 'friends_and_family') return 'friends_and_family_grant';

  if (
    access?.subscription_provider ||
    access?.subscription_product_id ||
    access?.entitlement_status === 'pro_active' ||
    access?.entitlement_status === 'grace' ||
    access?.entitlement_status === 'expired' ||
    access?.entitlement_status === 'revoked'
  ) {
    return 'paid_subscription';
  }

  return access ? 'none' : 'unknown';
}

function resolveAccessState(params: {
  access: Partial<OperatorInfo> | null | undefined;
  role: ECSAccessRole;
  authenticated: boolean;
  isOnline: boolean;
}): ECSAccessState {
  const { access, role, authenticated, isOnline } = params;
  if (!authenticated && !access) return 'unknown';
  if (access?.status === 'suspended') return 'inactive';

  if (role === 'admin' || role === 'friends_and_family') {
    return 'active';
  }

  switch (access?.entitlement_status) {
    case 'pro_active':
    case 'grace':
      return isEntitlementVerificationFresh(access)
        ? 'active'
        : isOnline
          ? 'pending_sync'
          : 'pending_sync';
    case 'expired':
      return 'expired';
    case 'revoked':
      return 'inactive';
    case 'free':
      return authenticated ? 'inactive' : 'unknown';
    default:
      return authenticated ? 'unknown' : 'inactive';
  }
}

function resolveVerificationMode(params: {
  access: Partial<OperatorInfo> | null | undefined;
  role: ECSAccessRole;
  accessState: ECSAccessState;
}): ECSAccessVerificationMode {
  const { access, role, accessState } = params;
  if (role === 'admin' || role === 'friends_and_family') return 'grant';
  if (isEntitlementVerificationFresh(access)) return 'verified';
  if (accessState === 'pending_sync') return 'stale_cached';
  if (access?.last_verified_at) return 'cached';
  return 'unknown';
}

function resolveStatusLabel(params: {
  role: ECSAccessRole;
  accessState: ECSAccessState;
  rawEntitlementStatus?: OperatorInfo['entitlement_status'] | 'unknown';
}): string {
  const { role, accessState, rawEntitlementStatus } = params;

  if (role === 'admin' || role === 'friends_and_family') return AUTH_COPY.account.active;
  if (rawEntitlementStatus === 'free') return 'Free member';

  switch (accessState) {
    case 'active':
      return AUTH_COPY.account.active;
    case 'pending_sync':
      return AUTH_COPY.account.unknown;
    case 'expired':
      return AUTH_COPY.account.blocked;
    case 'inactive':
      return AUTH_COPY.account.blocked;
    case 'unknown':
    default:
      return AUTH_COPY.account.unknown;
  }
}

function resolveProfileDetail(params: {
  role: ECSAccessRole;
  accessState: ECSAccessState;
  verificationMode: ECSAccessVerificationMode;
  sourceLabel: string;
  authenticated: boolean;
  rawEntitlementStatus?: OperatorInfo['entitlement_status'] | 'unknown';
}): string {
  const { role, accessState, verificationMode, sourceLabel, authenticated, rawEntitlementStatus } = params;

  if (!authenticated) {
    return AUTH_COPY.utility.publicAccessLine;
  }

  if (role === 'admin') {
    return 'Active ECS access is authorized for this account.';
  }

  if (role === 'friends_and_family') {
    return 'Active ECS access is authorized for this account.';
  }

  if (accessState === 'pending_sync') {
    return 'Active ECS access remains available while ECS refreshes account verification.';
  }

  if (accessState === 'active') {
    return verificationMode === 'verified'
      ? `Active ECS access is verified through ${sourceLabel}.`
      : 'Active ECS access is active for this account.';
  }

  if (rawEntitlementStatus === 'free') {
    return 'This account is signed in with free member access. Premium expedition systems can unlock after a paid access refresh, but member access should remain usable.';
  }

  if (accessState === 'expired') {
    return AUTH_COPY.accessGate.supporting;
  }

  if (accessState === 'inactive') {
    return AUTH_COPY.accessGate.supporting;
  }

  return 'ECS is still resolving account access for this account.';
}

function resolveSourceLabel(
  source: ECSAccessEntitlementSource,
  access: Partial<OperatorInfo> | null | undefined,
): string {
  switch (source) {
    case 'admin_grant':
      return 'Authorized account';
    case 'friends_and_family_grant':
      return 'Authorized account';
    case 'paid_subscription':
      switch (access?.subscription_provider) {
        case 'apple_app_store':
          return 'Apple App Store';
        case 'google_play':
          return 'Google Play';
        case 'system_default':
          return 'System Default';
        default:
          return 'Paid access';
      }
    case 'trial':
      return 'Authorized account';
    case 'none':
      return 'Account access';
    case 'unknown':
    default:
      return AUTH_COPY.requestAccess.pendingTitle;
  }
}

function resolveAccountLabel(role: ECSAccessRole, source: ECSAccessEntitlementSource): string {
  if (role === 'admin' || role === 'friends_and_family' || source === 'paid_subscription') {
    return 'Authorized ECS account';
  }
  return 'ECS account';
}

export function resolveEcsAccessState(params: {
  operatorInfo: Partial<OperatorInfo> | null | undefined;
  authenticated: boolean;
  isOnline: boolean;
}): ECSAccessResolution {
  const { operatorInfo, authenticated, isOnline } = params;
  const role = resolveRole(operatorInfo);
  const entitlementSource = resolveEntitlementSource(operatorInfo, role);
  const accessState = resolveAccessState({
    access: operatorInfo,
    role,
    authenticated,
    isOnline,
  });
  const verificationMode = resolveVerificationMode({
    access: operatorInfo,
    role,
    accessState,
  });
  const rawEntitlementStatus =
    operatorInfo?.entitlement_status ?? (authenticated ? 'free' : 'unknown');
  const hasFullAccess =
    role === 'admin' ||
    role === 'friends_and_family' ||
    accessState === 'active' ||
    accessState === 'pending_sync';
  const sourceLabel = resolveSourceLabel(entitlementSource, operatorInfo);
  const accountLabel = resolveAccountLabel(role, entitlementSource);
  const statusLabel = resolveStatusLabel({
    role,
    accessState,
    rawEntitlementStatus,
  });
  const isStandardBillingEligible = authenticated && role === 'standard';
  const isFreeMember = authenticated && role === 'standard' && rawEntitlementStatus === 'free';

  return {
    role,
    entitlementSource,
    accessState,
    scope: hasFullAccess ? 'full_ecs' : 'limited',
    verificationMode,
    rawEntitlementStatus,
    authenticated,
    suspended: operatorInfo?.status === 'suspended',
    hasFullAccess,
    isPrivilegedGrant: role === 'admin' || role === 'friends_and_family',
    isBillingManaged: role === 'standard',
    canUseBillingFlows: isStandardBillingEligible,
    canRestorePurchases: isStandardBillingEligible,
    canManageSubscription: isStandardBillingEligible,
    canAccessAdminSurfaces: role === 'admin',
    canManageFriendsAndFamilyAccess: operatorInfo?.can_rotate_shared_password === true,
    accountLabel: isFreeMember ? 'ECS member account' : accountLabel,
    statusLabel,
    sourceLabel,
    badgeLabel:
      isFreeMember
        ? 'FREE MEMBER'
        : role === 'admin' || role === 'friends_and_family' || accessState === 'active'
        ? 'ACTIVE ACCESS'
        : accessState === 'pending_sync' || accessState === 'unknown'
          ? 'ACCESS CHECK'
          : 'ACCESS REQUIRED',
    profileDetail: resolveProfileDetail({
      role,
      accessState,
      verificationMode,
      sourceLabel,
      authenticated,
      rawEntitlementStatus,
    }),
  };
}
