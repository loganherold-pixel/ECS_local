import { supabase, isSupabaseConfigured } from './supabase';
import { sanitizeAuthError, type OperatorInfo } from './auth';

type EntitlementAction =
  | 'get_current_access_state'
  | 'verify_apple_purchase'
  | 'verify_google_purchase'
  | 'restore_apple_purchase'
  | 'restore_google_purchase'
  | 'ingest_billing_event';

type HandlerResult<T> = T & { error?: string };

async function invokeEntitlementAction<T>(action: EntitlementAction, body: Record<string, unknown>): Promise<HandlerResult<T>> {
  if (!isSupabaseConfigured) {
    return { error: 'Supabase not configured' } as HandlerResult<T>;
  }

  const { data, error } = await supabase.functions.invoke('auth-handler', {
    body: {
      action,
      ...body,
    },
  });

  if (error) {
    return { error: sanitizeAuthError(error.message || String(error)) } as HandlerResult<T>;
  }

  if (data?.error) {
    return { error: sanitizeAuthError(String(data.error)) } as HandlerResult<T>;
  }

  return (data || {}) as HandlerResult<T>;
}

export interface CurrentAccessStateResult extends OperatorInfo {
  success: boolean;
  user_id: string;
}

export async function getCurrentAccessState(): Promise<CurrentAccessStateResult | { error: string }> {
  return invokeEntitlementAction<CurrentAccessStateResult>('get_current_access_state', {});
}

export async function verifyApplePurchase(receiptData: string) {
  return invokeEntitlementAction<{
    success: boolean;
    platform: 'apple';
    entitlement_status: string;
    access: OperatorInfo;
  }>('verify_apple_purchase', {
    receipt_data: receiptData,
  });
}

export async function restoreApplePurchase(receiptData: string) {
  return invokeEntitlementAction<{
    success: boolean;
    platform: 'apple';
    entitlement_status: string;
    access: OperatorInfo;
  }>('restore_apple_purchase', {
    receipt_data: receiptData,
  });
}

export async function verifyGooglePurchase(params: {
  purchaseToken: string;
  packageName?: string;
  productId?: string;
  subscriptionId?: string;
}) {
  return invokeEntitlementAction<{
    success: boolean;
    platform: 'google';
    entitlement_status: string;
    access: OperatorInfo;
  }>('verify_google_purchase', {
    purchase_token: params.purchaseToken,
    package_name: params.packageName,
    product_id: params.productId,
    subscription_id: params.subscriptionId,
  });
}

export async function restoreGooglePurchase(params: {
  purchaseToken: string;
  packageName?: string;
  productId?: string;
  subscriptionId?: string;
}) {
  return invokeEntitlementAction<{
    success: boolean;
    platform: 'google';
    entitlement_status: string;
    access: OperatorInfo;
  }>('restore_google_purchase', {
    purchase_token: params.purchaseToken,
    package_name: params.packageName,
    product_id: params.productId,
    subscription_id: params.subscriptionId,
  });
}

export async function ingestBillingLifecycleEvent(params: {
  platform: string;
  eventType: string;
  externalEventId?: string;
  userId?: string;
  payload?: Record<string, unknown>;
  entitlementStatus?: string;
}) {
  return invokeEntitlementAction<{ success: boolean }>('ingest_billing_event', {
    platform: params.platform,
    event: params.eventType,
    external_event_id: params.externalEventId,
    user_id: params.userId,
    metadata: params.entitlementStatus ? { entitlement_status: params.entitlementStatus } : undefined,
    payload: params.payload,
  });
}
