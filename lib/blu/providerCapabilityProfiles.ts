import type { BluProviderId } from '../BluTypes';
import { getProviderMeta } from '../BluProviderRegistry';
import type { ECSProviderCapabilityProfile } from './providerNormalizationTypes';

const DEFAULT_METRIC_COVERAGE = {
  stateOfCharge: true,
  inputPower: true,
  outputPower: true,
  runtime: true,
  capacity: true,
} as const;

const PROVIDER_CAPABILITY_OVERRIDES: Partial<Record<BluProviderId, Partial<ECSProviderCapabilityProfile>>> = {
  ecoflow: {
    supportType: 'cloud',
    liveUpdateCapable: false,
    cloudFallbackEligible: true,
  },
  bluetti: {
    supportType: 'ble',
    liveUpdateCapable: true,
    cloudFallbackEligible: false,
  },
  anker_solix: {
    supportType: 'ble',
    liveUpdateCapable: true,
    cloudFallbackEligible: false,
  },
  jackery: {
    supportType: 'ble',
    liveUpdateCapable: true,
    cloudFallbackEligible: false,
  },
  goal_zero: {
    supportType: 'ble',
    liveUpdateCapable: true,
    cloudFallbackEligible: false,
  },
  renogy: {
    supportType: 'hybrid',
    liveUpdateCapable: true,
    cloudFallbackEligible: false,
  },
  redarc: {
    supportType: 'ble',
    liveUpdateCapable: true,
    cloudFallbackEligible: false,
    metricCoverage: {
      ...DEFAULT_METRIC_COVERAGE,
      runtime: false,
    },
  },
  dakota_lithium: {
    supportType: 'ble',
    liveUpdateCapable: true,
    cloudFallbackEligible: false,
    metricCoverage: {
      ...DEFAULT_METRIC_COVERAGE,
      inputPower: false,
      outputPower: false,
      runtime: false,
    },
  },
  victron: {
    supportType: 'hybrid',
    liveUpdateCapable: true,
    cloudFallbackEligible: false,
  },
};

export function getProviderCapabilityProfile(
  providerId: BluProviderId | null | undefined,
): ECSProviderCapabilityProfile | null {
  if (!providerId) return null;

  const meta = getProviderMeta(providerId);
  const override = PROVIDER_CAPABILITY_OVERRIDES[providerId] ?? {};

  return {
    providerId,
    providerLabel: meta?.displayName ?? providerId,
    supportType: override.supportType ?? 'unknown',
    liveUpdateCapable: override.liveUpdateCapable ?? true,
    cloudFallbackEligible: override.cloudFallbackEligible ?? false,
    metricCoverage: override.metricCoverage ?? DEFAULT_METRIC_COVERAGE,
    providerVerificationStatus: meta?.status ?? 'unknown',
  };
}

