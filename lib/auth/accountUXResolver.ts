import type { OperatorInfo } from '../auth';
import {
  formatDateTimeLabel,
  getAccessEndDate,
  getPurchasePlatformLabel,
} from '../subscriptionAccess';
import { AUTH_COPY } from './authCopy';
import { resolveEcsAccessState } from './accessResolver';
import type {
  ECSAccountActionDefinition,
  ECSAccountUxKind,
  ECSAccountUxResolution,
  ECSBillingFlowState,
} from './accountStateTypes';
import type { ECSAccessResolution } from './entitlementTypes';

function resolveBillingFlowLabel(flowState: ECSBillingFlowState): string | null {
  switch (flowState) {
    case 'loading_product':
      return 'Loading access details.';
    case 'purchasing':
      return 'Activating ECS access.';
    case 'confirming_access':
      return AUTH_COPY.session.verifyingAccess;
    case 'restore_in_progress':
      return 'Restoring purchases.';
    case 'restore_success':
      return 'Access restored.';
    case 'restore_failed':
      return 'Unable to restore access right now.';
    case 'idle':
    default:
      return null;
  }
}

function resolveKind(access: ECSAccessResolution): ECSAccountUxKind {
  if (!access.authenticated) return 'signed_out';
  if (access.role === 'admin' || access.role === 'friends_and_family') {
    return 'access_granted';
  }
  if (access.accessState === 'active') return 'active_subscription';
  if (access.accessState === 'pending_sync') return 'verification_pending';
  if (access.accessState === 'expired') return 'expired';
  if (access.accessState === 'unknown') return 'reconnecting';
  return 'standard';
}

function resolveAvailableActions(params: {
  kind: ECSAccountUxKind;
  access: ECSAccessResolution;
}): ECSAccountActionDefinition[] {
  const { kind, access } = params;

  if (!access.authenticated) {
    return [{ id: 'sign_in', label: AUTH_COPY.account.signIn, emphasis: 'primary' }];
  }

  switch (kind) {
    case 'active_subscription':
      return [
        { id: 'manage_subscription', label: AUTH_COPY.account.manageAccess, emphasis: 'secondary' },
        { id: 'restore_purchases', label: AUTH_COPY.account.restorePurchases, emphasis: 'secondary' },
      ];
    case 'verification_pending':
      return [
        { id: 'refresh_access', label: AUTH_COPY.account.refreshAccess, emphasis: 'primary' },
        { id: 'restore_purchases', label: AUTH_COPY.account.restorePurchases, emphasis: 'secondary' },
        { id: 'manage_subscription', label: AUTH_COPY.account.manageAccess, emphasis: 'secondary' },
      ];
    case 'expired':
      return [
        { id: 'start_subscription', label: AUTH_COPY.account.manageAccess, emphasis: 'primary' },
        { id: 'restore_purchases', label: AUTH_COPY.account.restorePurchases, emphasis: 'secondary' },
        { id: 'manage_subscription', label: AUTH_COPY.account.manageAccess, emphasis: 'secondary' },
      ];
    case 'reconnecting':
      return [
        { id: 'refresh_access', label: AUTH_COPY.account.refreshAccess, emphasis: 'primary' },
        { id: 'restore_purchases', label: AUTH_COPY.account.restorePurchases, emphasis: 'secondary' },
      ];
    case 'standard':
      return [
        { id: 'start_subscription', label: AUTH_COPY.account.manageAccess, emphasis: 'primary' },
        { id: 'restore_purchases', label: AUTH_COPY.account.restorePurchases, emphasis: 'secondary' },
      ];
    case 'access_granted':
    case 'signed_out':
    default:
      return [];
  }
}

export function resolveAccountUx(params: {
  operatorInfo?: Partial<OperatorInfo> | null;
  accessState?: ECSAccessResolution | null;
  authenticated: boolean;
  isOnline: boolean;
  billingFlowState?: ECSBillingFlowState;
  productPriceLabel?: string | null;
}): ECSAccountUxResolution {
  const {
    operatorInfo,
    accessState,
    authenticated,
    isOnline,
    billingFlowState = 'idle',
    productPriceLabel,
  } = params;

  const access =
    accessState ??
    resolveEcsAccessState({
      operatorInfo,
      authenticated,
      isOnline,
    });

  const kind = resolveKind(access);
  const accessEndValue = formatDateTimeLabel(getAccessEndDate(operatorInfo));
  const lastVerifiedValue = formatDateTimeLabel(operatorInfo?.last_verified_at || null);
  const purchasePlatform = getPurchasePlatformLabel(operatorInfo);
  const billingFlowLabel = resolveBillingFlowLabel(billingFlowState);
  const isFreeMemberAccount =
    access.authenticated &&
    access.role === 'standard' &&
    access.rawEntitlementStatus === 'free';

  switch (kind) {
    case 'signed_out':
      return {
        access,
        kind,
        tone: 'neutral',
        title: AUTH_COPY.account.header,
        stateLabel: AUTH_COPY.account.signIn,
        subtitle: AUTH_COPY.utility.publicAccessLine,
        detail: 'Sign in to verify ECS access and restore account activity on this device.',
        badgeLabel: 'SIGN IN',
        renewalLabel: 'Access',
        renewalValue: 'Sign in to verify',
        billingLabel: 'Access source',
        billingValue: 'Unavailable until signed in',
        lastVerifiedLabel: lastVerifiedValue,
        footnote: 'Account verification and purchase restore are tied to the signed-in ECS account.',
        billingFlowLabel,
        availableActions: resolveAvailableActions({ kind, access }),
      };
    case 'access_granted':
      return {
        access,
        kind,
        tone: 'positive',
        title: access.accountLabel,
        stateLabel: AUTH_COPY.account.active,
        subtitle: 'Active ECS access is authorized for this account.',
        detail: access.profileDetail,
        badgeLabel: 'ACTIVE ACCESS',
        renewalLabel: 'Access',
        renewalValue: 'Active',
        billingLabel: 'Access source',
        billingValue: 'Authorized account',
        lastVerifiedLabel: lastVerifiedValue,
        footnote: 'Authorized ECS access restores through account verification and does not require store billing.',
        billingFlowLabel,
        availableActions: resolveAvailableActions({ kind, access }),
      };
    case 'active_subscription':
      return {
        access,
        kind,
        tone: 'positive',
        title: access.accountLabel,
        stateLabel: AUTH_COPY.account.active,
        subtitle: productPriceLabel
          ? `${productPriceLabel} access is active for this account.`
          : 'Active ECS access is verified for this account.',
        detail: access.profileDetail,
        badgeLabel: 'ACTIVE ACCESS',
        renewalLabel: access.rawEntitlementStatus === 'grace' ? 'Grace ends' : 'Access end',
        renewalValue: accessEndValue,
        billingLabel: 'Access source',
        billingValue: purchasePlatform,
        lastVerifiedLabel: lastVerifiedValue,
        footnote: 'ECS keeps account access active after billing verification succeeds.',
        billingFlowLabel,
        availableActions: resolveAvailableActions({ kind, access }),
      };
    case 'verification_pending':
      return {
        access,
        kind,
        tone: 'warning',
        title: access.accountLabel,
        stateLabel: AUTH_COPY.account.unknown,
        subtitle: 'Active ECS access remains available while ECS refreshes account verification.',
        detail: access.profileDetail,
        badgeLabel: 'ACCESS CHECK',
        renewalLabel: 'Cached access',
        renewalValue: accessEndValue,
        billingLabel: 'Access source',
        billingValue: purchasePlatform,
        lastVerifiedLabel: lastVerifiedValue,
        footnote: 'Cached access remains usable while ECS reconnects and refreshes access verification.',
        billingFlowLabel,
        availableActions: resolveAvailableActions({ kind, access }),
      };
    case 'expired':
      return {
        access,
        kind,
        tone: 'danger',
        title: access.accountLabel,
        stateLabel: AUTH_COPY.account.blocked,
        subtitle: AUTH_COPY.accessGate.supporting,
        detail: access.profileDetail,
        badgeLabel: 'ACCESS REQUIRED',
        renewalLabel: access.rawEntitlementStatus === 'grace' ? 'Grace ends' : 'Access end',
        renewalValue: accessEndValue,
        billingLabel: 'Access source',
        billingValue: purchasePlatform,
        lastVerifiedLabel: lastVerifiedValue,
        footnote: 'If access should still be active, restore purchases or refresh this account before relying on premium features.',
        billingFlowLabel,
        availableActions: resolveAvailableActions({ kind, access }),
      };
    case 'reconnecting':
      return {
        access,
        kind,
        tone: 'warning',
        title: access.accountLabel,
        stateLabel: AUTH_COPY.account.unknown,
        subtitle: AUTH_COPY.accessGate.verificationFailureLine,
        detail: 'Previously valid access may remain usable while ECS reconnects and verifies this account.',
        badgeLabel: 'ACCESS CHECK',
        renewalLabel: 'Access',
        renewalValue: accessEndValue,
        billingLabel: 'Access source',
        billingValue: access.isBillingManaged ? purchasePlatform : 'Pending account check',
        lastVerifiedLabel: lastVerifiedValue,
        footnote: 'Temporary verification delays should not force unnecessary lockouts when cached access is still available.',
        billingFlowLabel,
        availableActions: resolveAvailableActions({ kind, access }),
      };
    case 'standard':
    default:
      return {
        access,
        kind,
        tone: 'neutral',
        title: isFreeMemberAccount ? 'ECS member account' : AUTH_COPY.account.header,
        stateLabel: isFreeMemberAccount ? 'Free member' : AUTH_COPY.account.blocked,
        subtitle: isFreeMemberAccount
          ? 'Signed in with member access on this device.'
          : AUTH_COPY.accessGate.supporting,
        detail: isFreeMemberAccount
          ? 'This account can enter ECS with member-level access while premium expedition systems remain tied to paid subscriber access.'
          : AUTH_COPY.accessGate.detail,
        badgeLabel: isFreeMemberAccount ? 'FREE MEMBER' : 'ACCESS REQUIRED',
        renewalLabel: 'Access',
        renewalValue: isFreeMemberAccount ? 'Member access' : accessEndValue,
        billingLabel: 'Access source',
        billingValue: isFreeMemberAccount
          ? 'Free member account'
          : access.isBillingManaged
            ? purchasePlatform
            : 'Account access',
        lastVerifiedLabel: lastVerifiedValue,
        footnote: isFreeMemberAccount
          ? 'Upgrade or restore purchases later from this same account if full subscriber access should be available.'
          : 'Manage access to activate full expedition-system entry for this account.',
        billingFlowLabel,
        availableActions: resolveAvailableActions({ kind, access }),
      };
  }
}
