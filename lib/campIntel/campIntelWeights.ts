import type {
  CampIntelDarknessAdjustmentState,
  CampIntelMissionContext,
  CampIntelMissionMode,
  CampIntelWeightProfile,
  CampIntelWeights,
} from './campIntelTypes';

const BASE_WEIGHTS: Record<CampIntelMissionMode, CampIntelWeights> = {
  fast_transit_overnight: {
    access: 0.26,
    campability: 0.16,
    vehicleFit: 0.17,
    safety: 0.20,
    compliance: 0.12,
    desirability: 0.09,
  },
  basecamp: {
    access: 0.16,
    campability: 0.22,
    vehicleFit: 0.16,
    safety: 0.18,
    compliance: 0.12,
    desirability: 0.16,
  },
  scenic_stay: {
    access: 0.13,
    campability: 0.17,
    vehicleFit: 0.13,
    safety: 0.17,
    compliance: 0.10,
    desirability: 0.30,
  },
  weather_shelter: {
    access: 0.18,
    campability: 0.19,
    vehicleFit: 0.13,
    safety: 0.28,
    compliance: 0.12,
    desirability: 0.10,
  },
  remote_solitude: {
    access: 0.14,
    campability: 0.16,
    vehicleFit: 0.16,
    safety: 0.18,
    compliance: 0.10,
    desirability: 0.26,
  },
  family_friendly_stop: {
    access: 0.22,
    campability: 0.18,
    vehicleFit: 0.16,
    safety: 0.24,
    compliance: 0.12,
    desirability: 0.08,
  },
  emergency_stop_before_dark: {
    access: 0.32,
    campability: 0.12,
    vehicleFit: 0.18,
    safety: 0.25,
    compliance: 0.08,
    desirability: 0.05,
  },
};

function normalize(weights: CampIntelWeights): CampIntelWeights {
  const total =
    weights.access +
    weights.campability +
    weights.vehicleFit +
    weights.safety +
    weights.compliance +
    weights.desirability;
  if (total <= 0) return { ...BASE_WEIGHTS.fast_transit_overnight };
  return {
    access: weights.access / total,
    campability: weights.campability / total,
    vehicleFit: weights.vehicleFit / total,
    safety: weights.safety / total,
    compliance: weights.compliance / total,
    desirability: weights.desirability / total,
  };
}

function adjust(weights: CampIntelWeights, key: keyof CampIntelWeights, delta: number): void {
  weights[key] = Math.max(0.03, weights[key] + delta);
}

export function getCampIntelWeightProfile(
  missionMode: CampIntelMissionMode,
  context: Pick<
    CampIntelMissionContext,
    'isAfterSunset' | 'nearSunset' | 'degradedWeather' | 'constrainedResources' | 'lastLightFactor' | 'darknessAdjustmentState'
  >,
): CampIntelWeightProfile {
  const base = BASE_WEIGHTS[missionMode];
  const applied: CampIntelWeights = { ...base };
  const scenarioFlags: CampIntelWeightProfile['scenarioFlags'] = [];
  const darknessAdjustmentFactor = Math.max(0, Math.min(1, context.lastLightFactor ?? 0));
  const darknessAdjustmentState: CampIntelDarknessAdjustmentState =
    context.darknessAdjustmentState ?? (context.isAfterSunset ? 'after_dark' : context.nearSunset ? 'last_light_caution' : 'daylight_normal');

  if (darknessAdjustmentFactor > 0) {
    adjust(applied, 'access', 0.05 + darknessAdjustmentFactor * 0.04);
    adjust(applied, 'vehicleFit', 0.03 + darknessAdjustmentFactor * 0.03);
    adjust(applied, 'safety', 0.05 + darknessAdjustmentFactor * 0.04);
    adjust(applied, 'campability', 0.01 + darknessAdjustmentFactor * 0.02);
    adjust(applied, 'desirability', -(0.04 + darknessAdjustmentFactor * 0.06));
    scenarioFlags.push('night_arrival');
  }

  if (context.degradedWeather) {
    adjust(applied, 'campability', 0.03);
    adjust(applied, 'safety', 0.08);
    adjust(applied, 'desirability', -0.05);
    scenarioFlags.push('bad_weather');
  }

  if (context.constrainedResources) {
    adjust(applied, 'access', 0.05);
    adjust(applied, 'safety', 0.02);
    adjust(applied, 'desirability', -0.03);
    scenarioFlags.push('resource_constrained');
  }

  return {
    base,
    applied: normalize(applied),
    scenarioFlags,
    darknessAdjustmentState,
    darknessAdjustmentFactor,
  };
}

export function getDefaultCampIntelMissionMode(): CampIntelMissionMode {
  return 'fast_transit_overnight';
}
