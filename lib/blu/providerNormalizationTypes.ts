import type { BluProviderId } from '../BluTypes';

export type ECSProviderSupportType =
  | 'ble'
  | 'cloud'
  | 'hybrid'
  | 'wifi'
  | 'manual_only'
  | 'unknown';

export type ECSProviderSourcePrecedence =
  | 'live_provider'
  | 'cloud_sync'
  | 'stored_provider_state'
  | 'manual_baseline'
  | 'inferred_estimate'
  | 'unavailable';

export type ECSNormalizedProviderState =
  | 'live_provider_connected'
  | 'waiting_for_provider'
  | 'temporarily_disconnected'
  | 'stale_but_usable'
  | 'cloud_backed'
  | 'manual_baseline'
  | 'unsupported'
  | 'unavailable';

export type ECSNormalizedProviderFreshness =
  | 'current'
  | 'recent'
  | 'stale'
  | 'unknown';

export type ECSProviderMetricCoverage = {
  stateOfCharge: boolean;
  inputPower: boolean;
  outputPower: boolean;
  runtime: boolean;
  capacity: boolean;
};

export type ECSProviderCapabilityProfile = {
  providerId: BluProviderId;
  providerLabel: string;
  supportType: ECSProviderSupportType;
  liveUpdateCapable: boolean;
  cloudFallbackEligible: boolean;
  metricCoverage: ECSProviderMetricCoverage;
  providerVerificationStatus: 'verified' | 'implemented' | 'limited' | 'planned' | 'unknown';
};

export type ECSNormalizedProviderResult = {
  available: boolean;
  usable: boolean;
  state: ECSNormalizedProviderState;
  label: string;
  summary: string;
  explanation: string | null;
  source: ECSProviderSourcePrecedence;
  sourceLabel: string;
  freshness: ECSNormalizedProviderFreshness;
  supportType: ECSProviderSupportType;
  providerId: BluProviderId | null;
  providerLabel: string | null;
  providerVerificationStatus: ECSProviderCapabilityProfile['providerVerificationStatus'];
  deviceLabel: string | null;
  lastUpdatedAt: number | null;
  manualBaselineAvailable: boolean;
  waiting: boolean;
  degraded: boolean;
  repeatedDisconnects: boolean;
  metricCoverage: ECSProviderMetricCoverage;
  legacyTelemetryState: 'LIVE' | 'PARTIAL' | 'ATTENTION';
};

