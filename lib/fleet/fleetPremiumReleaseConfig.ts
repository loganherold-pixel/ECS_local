export type FleetPremiumReleaseFeature =
  | 'premiumFleetEnabled'
  | 'profileSetupEnabled'
  | 'buildLoadoutEnabled'
  | 'checklistEnabled'
  | 'fabricSyncEnabled'
  | 'developerDiagnostics';

export type FleetPremiumReleaseConfig = Record<FleetPremiumReleaseFeature, boolean>;

export const DEFAULT_FLEET_PREMIUM_RELEASE_CONFIG: FleetPremiumReleaseConfig = {
  premiumFleetEnabled: true,
  profileSetupEnabled: true,
  buildLoadoutEnabled: true,
  checklistEnabled: true,
  fabricSyncEnabled: true,
  developerDiagnostics: true,
};

const FLEET_PREMIUM_DISABLED_COPY: Record<FleetPremiumReleaseFeature, string> = {
  premiumFleetEnabled: 'Fleet premium is paused for this rollout.',
  profileSetupEnabled: 'Fleet profile setup is paused for this rollout.',
  buildLoadoutEnabled: 'Build & Loadout is paused for this rollout.',
  checklistEnabled: 'What Did I Forget? is paused for this rollout.',
  fabricSyncEnabled: 'Fleet fabric sync is paused for this rollout.',
  developerDiagnostics: 'Fleet developer diagnostics are disabled for this rollout.',
};

export function resolveFleetPremiumReleaseConfig(
  overrides: Partial<FleetPremiumReleaseConfig> = {},
): FleetPremiumReleaseConfig {
  return {
    ...DEFAULT_FLEET_PREMIUM_RELEASE_CONFIG,
    ...overrides,
  };
}

export function isFleetPremiumFeatureEnabled(
  config: FleetPremiumReleaseConfig,
  feature: FleetPremiumReleaseFeature,
): boolean {
  return config[feature] === true;
}

export function getFleetPremiumRolloutDisabledCopy(feature: FleetPremiumReleaseFeature): string {
  return FLEET_PREMIUM_DISABLED_COPY[feature];
}
