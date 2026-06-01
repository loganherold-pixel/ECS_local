import type { ECSAccessResolution } from './entitlementTypes';

export type ECSBillingFlowState =
  | 'idle'
  | 'loading_product'
  | 'purchasing'
  | 'confirming_access'
  | 'restore_in_progress'
  | 'restore_success'
  | 'restore_failed';

export type ECSAccountUxKind =
  | 'signed_out'
  | 'active_subscription'
  | 'access_granted'
  | 'verification_pending'
  | 'expired'
  | 'standard'
  | 'reconnecting';

export type ECSAccountUxTone = 'positive' | 'warning' | 'danger' | 'neutral';

export type ECSAccountActionId =
  | 'sign_in'
  | 'start_subscription'
  | 'restore_purchases'
  | 'manage_subscription'
  | 'refresh_access';

export interface ECSAccountActionDefinition {
  id: ECSAccountActionId;
  label: string;
  emphasis: 'primary' | 'secondary';
}

export interface ECSAccountUxResolution {
  access: ECSAccessResolution;
  kind: ECSAccountUxKind;
  tone: ECSAccountUxTone;
  title: string;
  stateLabel: string;
  subtitle: string;
  detail: string;
  badgeLabel: string;
  renewalLabel: string;
  renewalValue: string;
  billingLabel: string;
  billingValue: string;
  lastVerifiedLabel: string;
  footnote: string;
  billingFlowLabel: string | null;
  availableActions: ECSAccountActionDefinition[];
}
