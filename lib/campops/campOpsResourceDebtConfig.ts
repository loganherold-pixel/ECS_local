export type CampOpsResourceDebtRolloutFeature = 'campOpsResourceDebtEnabled';

export type CampOpsResourceDebtRolloutConfig = Record<CampOpsResourceDebtRolloutFeature, boolean>;

export const DEFAULT_CAMP_OPS_RESOURCE_DEBT_ROLLOUT_CONFIG: CampOpsResourceDebtRolloutConfig = {
  campOpsResourceDebtEnabled: false,
};

export function resolveCampOpsResourceDebtRolloutConfig(
  overrides: Partial<CampOpsResourceDebtRolloutConfig> = {},
): CampOpsResourceDebtRolloutConfig {
  return {
    ...DEFAULT_CAMP_OPS_RESOURCE_DEBT_ROLLOUT_CONFIG,
    ...overrides,
  };
}

export function isCampOpsResourceDebtFeatureEnabled(
  config: CampOpsResourceDebtRolloutConfig,
  feature: CampOpsResourceDebtRolloutFeature,
): boolean {
  return config[feature] === true;
}

export type CampOpsResourceDebtConfig = {
  safeFuelExitMarginMiles: number;
  tightFuelExitMarginMiles: number;
  safeDaylightMarginMinutes: number;
  tightDaylightMarginMinutes: number;
  gallonsPerPersonNextDay: number;
  gallonsPerPetNextDay: number;
  gallonsPerPersonTravelDay: number;
  gallonsPerPetTravelDay: number;
  mediumHeatWaterMultiplier: number;
  highHeatWaterMultiplier: number;
  waterSafetyBufferGallons: number;
  campUncertaintySafeScore: number;
  campUncertaintyTightScore: number;
  freshnessSafeDays: number;
  freshnessTightDays: number;
};

export const DEFAULT_CAMP_OPS_RESOURCE_DEBT_CONFIG: CampOpsResourceDebtConfig = {
  safeFuelExitMarginMiles: 50,
  tightFuelExitMarginMiles: 25,
  safeDaylightMarginMinutes: 60,
  tightDaylightMarginMinutes: 0,
  gallonsPerPersonNextDay: 1,
  gallonsPerPetNextDay: 0.25,
  gallonsPerPersonTravelDay: 0.5,
  gallonsPerPetTravelDay: 0.1,
  mediumHeatWaterMultiplier: 1.25,
  highHeatWaterMultiplier: 1.5,
  waterSafetyBufferGallons: 1,
  campUncertaintySafeScore: 80,
  campUncertaintyTightScore: 55,
  freshnessSafeDays: 45,
  freshnessTightDays: 180,
};

export function resolveCampOpsResourceDebtConfig(
  overrides: Partial<CampOpsResourceDebtConfig> = {},
): CampOpsResourceDebtConfig {
  return {
    ...DEFAULT_CAMP_OPS_RESOURCE_DEBT_CONFIG,
    ...overrides,
  };
}
