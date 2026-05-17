import type { CampImpactLevel, CampOpsConfidence } from './campOpsTypes';

export type CampOpsHardGateRolloutFeature = 'campOpsHardGateFilteringEnabled';

export type CampOpsHardGateRolloutConfig = Record<CampOpsHardGateRolloutFeature, boolean>;

export const DEFAULT_CAMP_OPS_HARD_GATE_ROLLOUT_CONFIG: CampOpsHardGateRolloutConfig = {
  campOpsHardGateFilteringEnabled: false,
};

export function resolveCampOpsHardGateRolloutConfig(
  overrides: Partial<CampOpsHardGateRolloutConfig> = {},
): CampOpsHardGateRolloutConfig {
  return {
    ...DEFAULT_CAMP_OPS_HARD_GATE_ROLLOUT_CONFIG,
    ...overrides,
  };
}

export function isCampOpsHardGateFeatureEnabled(
  config: CampOpsHardGateRolloutConfig,
  feature: CampOpsHardGateRolloutFeature,
): boolean {
  return config[feature] === true;
}

export type CampOpsHardGateConfig = {
  minimumPublicAccessConfidence: CampOpsConfidence;
  minimumFuelExitMarginMiles: number;
  minimumWaterMarginGallons: number;
  minimumWaterMarginPercent: number;
  groupCapacityRejectExcessPeople: number;
  highRiskDelayMinutes: number;
  highRiskOfflineModes: Array<'offline' | 'degraded'>;
  highRiskLateArrivalLevels: CampImpactLevel[];
  lateArrivalRejectRiskLevels: CampImpactLevel[];
  lateArrivalCautionRiskLevels: CampImpactLevel[];
  highRiskRequiredDataFields: string[];
  rejectInsufficientHighRiskData: boolean;
};

export const DEFAULT_CAMP_OPS_HARD_GATE_CONFIG: CampOpsHardGateConfig = {
  minimumPublicAccessConfidence: 'medium',
  minimumFuelExitMarginMiles: 25,
  minimumWaterMarginGallons: 2,
  minimumWaterMarginPercent: 15,
  groupCapacityRejectExcessPeople: 2,
  highRiskDelayMinutes: 120,
  highRiskOfflineModes: ['offline'],
  highRiskLateArrivalLevels: ['caution', 'critical'],
  lateArrivalRejectRiskLevels: ['critical'],
  lateArrivalCautionRiskLevels: ['watch', 'caution'],
  highRiskRequiredDataFields: [
    'legalStatus',
    'legalConfidence',
    'publicAccessStatus',
    'accessDifficulty',
    'vehicleFit',
    'dataConfidence',
  ],
  rejectInsufficientHighRiskData: true,
};

export function resolveCampOpsHardGateConfig(
  overrides: Partial<CampOpsHardGateConfig> = {},
): CampOpsHardGateConfig {
  return {
    ...DEFAULT_CAMP_OPS_HARD_GATE_CONFIG,
    ...overrides,
    highRiskOfflineModes:
      overrides.highRiskOfflineModes ?? DEFAULT_CAMP_OPS_HARD_GATE_CONFIG.highRiskOfflineModes,
    highRiskLateArrivalLevels:
      overrides.highRiskLateArrivalLevels ?? DEFAULT_CAMP_OPS_HARD_GATE_CONFIG.highRiskLateArrivalLevels,
    lateArrivalRejectRiskLevels:
      overrides.lateArrivalRejectRiskLevels ?? DEFAULT_CAMP_OPS_HARD_GATE_CONFIG.lateArrivalRejectRiskLevels,
    lateArrivalCautionRiskLevels:
      overrides.lateArrivalCautionRiskLevels ?? DEFAULT_CAMP_OPS_HARD_GATE_CONFIG.lateArrivalCautionRiskLevels,
    highRiskRequiredDataFields:
      overrides.highRiskRequiredDataFields ?? DEFAULT_CAMP_OPS_HARD_GATE_CONFIG.highRiskRequiredDataFields,
  };
}
