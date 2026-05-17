import type { CampOpsScoreKey } from './campOpsTypes';

export type CampOpsScoringMode = 'planning' | 'field';

export type CampOpsScoringRolloutFeature = 'campOpsSuitabilityScoringEnabled';

export type CampOpsScoringRolloutConfig = Record<CampOpsScoringRolloutFeature, boolean>;

export const DEFAULT_CAMP_OPS_SCORING_ROLLOUT_CONFIG: CampOpsScoringRolloutConfig = {
  campOpsSuitabilityScoringEnabled: false,
};

export function resolveCampOpsScoringRolloutConfig(
  overrides: Partial<CampOpsScoringRolloutConfig> = {},
): CampOpsScoringRolloutConfig {
  return {
    ...DEFAULT_CAMP_OPS_SCORING_ROLLOUT_CONFIG,
    ...overrides,
  };
}

export function isCampOpsScoringFeatureEnabled(
  config: CampOpsScoringRolloutConfig,
  feature: CampOpsScoringRolloutFeature,
): boolean {
  return config[feature] === true;
}

export type CampOpsCategoryWeights = Record<Exclude<CampOpsScoreKey, 'overall'>, number>;

export type CampOpsScoringConfig = {
  mode: CampOpsScoringMode;
  weights: CampOpsCategoryWeights;
  fieldModeLateArrivalWeightMultiplier: number;
  trailerPresentWeightMultiplier: number;
  groupKnownWeightMultiplier: number;
  largeGroupKnownWeightMultiplier: number;
  largeGroupPeopleThreshold: number;
  convoyResourceDebtWeightMultiplier: number;
  mechanicalIssueRecoveryWeightMultiplier: number;
  emergencyComfortWeightMultiplier: number;
  emergencySafetyWeightMultiplier: number;
  cautionGatePenalty: number;
  unknownGatePenalty: number;
  missingDataPenalty: number;
  dataLimitationPenalty: number;
  minimumFuelComfortMarginMiles: number;
  minimumWaterComfortMarginGallons: number;
  minimumWaterComfortMarginPercent: number;
};

export type CampOpsScoringConfigOverrides = Omit<Partial<CampOpsScoringConfig>, 'weights'> & {
  weights?: Partial<CampOpsCategoryWeights>;
};

export const DEFAULT_CAMP_OPS_CATEGORY_WEIGHTS: CampOpsCategoryWeights = {
  legal: 2.4,
  access: 1.4,
  time: 1,
  resources: 1.2,
  terrain: 0.8,
  weather: 1,
  groupFit: 0.7,
  trailerFit: 0.6,
  lateArrival: 0.9,
  privacy: 0.4,
  dataConfidence: 1.1,
};

export const DEFAULT_CAMP_OPS_SCORING_CONFIG: CampOpsScoringConfig = {
  mode: 'planning',
  weights: DEFAULT_CAMP_OPS_CATEGORY_WEIGHTS,
  fieldModeLateArrivalWeightMultiplier: 1.8,
  trailerPresentWeightMultiplier: 2.5,
  groupKnownWeightMultiplier: 2,
  largeGroupKnownWeightMultiplier: 2.8,
  largeGroupPeopleThreshold: 6,
  convoyResourceDebtWeightMultiplier: 1.8,
  mechanicalIssueRecoveryWeightMultiplier: 1.6,
  emergencyComfortWeightMultiplier: 0.35,
  emergencySafetyWeightMultiplier: 1.25,
  cautionGatePenalty: 12,
  unknownGatePenalty: 8,
  missingDataPenalty: 7,
  dataLimitationPenalty: 4,
  minimumFuelComfortMarginMiles: 50,
  minimumWaterComfortMarginGallons: 5,
  minimumWaterComfortMarginPercent: 30,
};

export function resolveCampOpsScoringConfig(
  overrides: CampOpsScoringConfigOverrides = {},
): CampOpsScoringConfig {
  return {
    ...DEFAULT_CAMP_OPS_SCORING_CONFIG,
    ...overrides,
    weights: {
      ...DEFAULT_CAMP_OPS_CATEGORY_WEIGHTS,
      ...(overrides.weights ?? {}),
    },
  };
}
