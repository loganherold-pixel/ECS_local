import { Linking, Platform } from 'react-native';
import type { OperatorInfo } from './auth';
import { resolveEcsAccessState } from './auth/accessResolver';

export type EntitlementUiStatus =
  | 'Free'
  | 'Pro Active'
  | 'Billing Issue'
  | 'Verifying Access'
  | 'Expired'
  | 'Revoked'
  | 'Friends & Family Access'
  | 'Admin Full Access';

const ENTITLEMENT_VERIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PREMIUM_WIDGET_IDS = new Set<string>(['ecs-power', 'vehicle-telemetry']);

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function isEntitlementVerificationFresh(
  access: Partial<OperatorInfo> | null | undefined,
  now = Date.now(),
): boolean {
  const resolved = resolveEcsAccessState({
    operatorInfo: access,
    authenticated: !!access,
    isOnline: true,
  });

  if (resolved.verificationMode === 'grant') {
    return true;
  }

  const lastVerifiedAt = parseTimestamp(access?.last_verified_at);
  if (lastVerifiedAt == null) {
    return false;
  }

  return now - lastVerifiedAt <= ENTITLEMENT_VERIFICATION_MAX_AGE_MS;
}

export function hasPremiumEntitlement(access: Partial<OperatorInfo> | null | undefined): boolean {
  return resolveEcsAccessState({
    operatorInfo: access,
    authenticated: !!access,
    isOnline: false,
  }).hasFullAccess;
}

export function isAdminFullAccess(access: Partial<OperatorInfo> | null | undefined): boolean {
  return resolveEcsAccessState({
    operatorInfo: access,
    authenticated: !!access,
    isOnline: false,
  }).role === 'admin';
}

export function isSharedInternalFullAccess(access: Partial<OperatorInfo> | null | undefined): boolean {
  return resolveEcsAccessState({
    operatorInfo: access,
    authenticated: !!access,
    isOnline: false,
  }).role === 'friends_and_family';
}

export function getEntitlementUiStatus(access: Partial<OperatorInfo> | null | undefined): EntitlementUiStatus {
  const resolved = resolveEcsAccessState({
    operatorInfo: access,
    authenticated: !!access,
    isOnline: false,
  });

  if (resolved.role === 'admin') return 'Admin Full Access';
  if (resolved.role === 'friends_and_family') return 'Friends & Family Access';
  if (resolved.accessState === 'pending_sync') return 'Verifying Access';

  switch (resolved.rawEntitlementStatus) {
    case 'pro_active':
      return 'Pro Active';
    case 'grace':
      return 'Billing Issue';
    case 'expired':
      return 'Expired';
    case 'revoked':
      return 'Revoked';
    default:
      return 'Free';
  }
}

export function getPlanLabel(access: Partial<OperatorInfo> | null | undefined): string {
  return resolveEcsAccessState({
    operatorInfo: access,
    authenticated: !!access,
    isOnline: false,
  }).accountLabel;
}

export function getPurchasePlatformLabel(access: Partial<OperatorInfo> | null | undefined): string {
  const resolved = resolveEcsAccessState({
    operatorInfo: access,
    authenticated: !!access,
    isOnline: false,
  });

  if (resolved.entitlementSource === 'admin_grant') return 'Admin Grant';
  if (resolved.entitlementSource === 'friends_and_family_grant') return 'Friends & Family Grant';

  switch (access?.subscription_provider) {
    case 'apple_app_store':
      return 'Apple App Store';
    case 'google_play':
      return 'Google Play';
    case 'system_default':
      return 'System Default';
    case 'internal_access':
      return 'Internal Access';
    default:
      if (!access?.subscription_provider) return '—';
      return access.subscription_provider.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}

export function getAccessEndDate(access: Partial<OperatorInfo> | null | undefined): string | null {
  if (!access) return null;
  if (isAdminFullAccess(access) || isSharedInternalFullAccess(access)) return null;
  if (access.entitlement_status === 'grace') return access.grace_expires_at ?? access.current_period_end_at ?? null;
  if (access.entitlement_status === 'revoked') return access.revoked_at ?? null;
  return access.current_period_end_at ?? null;
}

export function formatDateTimeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function isPremiumWidget(widgetId: string): boolean {
  return PREMIUM_WIDGET_IDS.has(widgetId);
}

export async function openManageSubscription(): Promise<boolean> {
  let url = 'https://www.apple.com/';
  if (Platform.OS === 'ios') {
    url = 'https://apps.apple.com/account/subscriptions';
  } else if (Platform.OS === 'android') {
    url = 'https://play.google.com/store/account/subscriptions';
  }

  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
