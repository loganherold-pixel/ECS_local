import type { OperatorInfo } from '../auth';

export type ECSAccessRole = 'standard' | 'admin' | 'friends_and_family';
export type ECSAccessEntitlementSource =
  | 'paid_subscription'
  | 'admin_grant'
  | 'friends_and_family_grant'
  | 'trial'
  | 'none'
  | 'unknown';
export type ECSAccessState = 'active' | 'inactive' | 'expired' | 'pending_sync' | 'unknown';
export type ECSAccessScope = 'full_ecs' | 'limited';
export type ECSAccessVerificationMode =
  | 'grant'
  | 'verified'
  | 'cached'
  | 'stale_cached'
  | 'unknown';

export interface ECSAccessResolution {
  role: ECSAccessRole;
  entitlementSource: ECSAccessEntitlementSource;
  accessState: ECSAccessState;
  scope: ECSAccessScope;
  verificationMode: ECSAccessVerificationMode;
  rawEntitlementStatus: OperatorInfo['entitlement_status'] | 'unknown';
  authenticated: boolean;
  suspended: boolean;
  hasFullAccess: boolean;
  isPrivilegedGrant: boolean;
  isBillingManaged: boolean;
  canUseBillingFlows: boolean;
  canRestorePurchases: boolean;
  canManageSubscription: boolean;
  canAccessAdminSurfaces: boolean;
  canManageFriendsAndFamilyAccess: boolean;
  accountLabel: string;
  statusLabel: string;
  sourceLabel: string;
  badgeLabel: string;
  profileDetail: string;
}
