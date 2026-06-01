import {
  assessVehicleAssessmentConfidence,
  evaluateECSConfidence,
} from './confidenceEngine';
import type { ECSConfidenceFreshness } from './confidenceTypes';
import type { ECSOperationalState } from './degradedOperationsTypes';
import { explainRecommendation } from './recommendationExplanationEngine';
import type { ECSExpeditionPhase } from './expeditionPhaseTypes';
import type { ECSLiveStatusFreshness, ECSLiveStatusResult } from '../status/liveStatusTypes';
import {
  calculateRigCompatibility,
  type CompatibilityExpedition,
  type CompatibilityResult,
  type VehicleProfile,
} from '../rigCompatibilityEngine';
import type { ECSVehicleFitLevel, ECSVehicleFitResult } from './vehicleFitTypes';

type EvaluateVehicleFitOptions = {
  compatibility?: CompatibilityResult | null;
  status?: ECSLiveStatusResult | null;
  operationalState?: ECSOperationalState | null;
  phase?: ECSExpeditionPhase | null;
  offline?: boolean;
  hasLiveTelemetry?: boolean;
  weatherFreshness?: ECSLiveStatusFreshness | null;
};

function mapStatusFreshnessToConfidence(
  freshness?: ECSLiveStatusFreshness | null,
): ECSConfidenceFreshness {
  switch (freshness) {
    case 'current':
      return 'fresh';
    case 'recent':
      return 'aging';
    case 'stale':
      return 'stale';
    case 'unknown':
    default:
      return 'unknown';
  }
}

function createFallbackStatus(
  profile: VehicleProfile | null,
  options: EvaluateVehicleFitOptions,
): ECSLiveStatusResult {
  if (options.status) {
    return options.status;
  }

  if (options.hasLiveTelemetry && profile) {
    return {
      status: 'live',
      label: 'Live',
      shortReason: 'Live telemetry is supporting the current vehicle baseline.',
      sourceType: 'live',
      freshness: 'current',
      usable: true,
    };
  }

  if (profile) {
    return {
      status:
        options.operationalState === 'degraded' || options.operationalState === 'limited'
          ? 'degraded'
          : options.offline
            ? 'offline_capable'
            : 'estimated',
      label:
        options.operationalState === 'degraded' || options.operationalState === 'limited'
          ? 'Degraded'
          : options.offline
            ? 'Offline capable'
            : 'Estimated',
      shortReason:
        options.operationalState === 'degraded' || options.operationalState === 'limited'
          ? 'Vehicle fit is using a reduced-confidence stored baseline.'
          : options.offline
            ? 'Vehicle fit remains available from the stored vehicle baseline.'
            : 'Using stored vehicle baseline.',
      sourceType: 'manual',
      freshness: 'unknown',
      usable: true,
    };
  }

  return {
    status: 'unavailable',
    label: 'Unavailable',
    shortReason: 'Vehicle fit requires a configured vehicle baseline.',
    sourceType: 'none',
    freshness: 'unknown',
    usable: false,
  };
}

function deriveFitLevel(score: number, hasUsableProfile: boolean): ECSVehicleFitLevel {
  if (!hasUsableProfile) return 'unknown_fit';
  if (score >= 85) return 'strong_fit';
  if (score >= 70) return 'good_fit';
  if (score >= 45) return 'limited_fit';
  if (score > 0) return 'poor_fit';
  return 'unknown_fit';
}

function labelForFitLevel(level: ECSVehicleFitLevel): string {
  switch (level) {
    case 'strong_fit':
      return 'Strong fit';
    case 'good_fit':
      return 'Good fit';
    case 'limited_fit':
      return 'Limited fit';
    case 'poor_fit':
      return 'Poor fit';
    case 'unknown_fit':
    default:
      return 'Fit unknown';
  }
}

function uniqueTexts(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  values.forEach((value) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return;

    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    results.push(text);
  });

  return results;
}

function pushIf<T>(list: T[], value: T | null | undefined): void {
  if (value != null) {
    list.push(value);
  }
}

function derivePositiveDrivers(
  opportunity: CompatibilityExpedition,
  profile: VehicleProfile,
  compatibility: CompatibilityResult,
): string[] {
  const drivers: (string | null)[] = [];
  const factors = compatibility.factors;

  if (factors.terrainMatch >= 78) pushIf(drivers, 'terrain demands align with the current vehicle profile');
  if (factors.fuelRangeCoverage >= 78) pushIf(drivers, 'fuel range margin supports the route distance');
  if (factors.vehicleCapability >= 75) pushIf(drivers, 'vehicle capability margin remains solid');
  if (factors.tireSizeMatch >= 78) pushIf(drivers, 'current tire size supports the trail surface');
  if (factors.suspensionLiftMatch >= 75) {
    pushIf(
      drivers,
      profile.suspensionLiftInches > 0 || profile.isLeveled
        ? 'current clearance supports the terrain profile'
        : 'stock clearance remains workable for this route',
    );
  }
  if ((opportunity.remotenessScore ?? 0) <= 5) pushIf(drivers, 'lower remoteness keeps recovery options closer');
  if ((opportunity.estimatedFuelRequired ?? 0) > 0 && profile.fuel_tank_capacity_gal > 0) {
    const fuelRatio = opportunity.estimatedFuelRequired / profile.fuel_tank_capacity_gal;
    if (fuelRatio <= 0.45) pushIf(drivers, 'fuel demand stays well inside the configured baseline');
  }

  return uniqueTexts(drivers);
}

function deriveLimitingFactors(
  opportunity: CompatibilityExpedition,
  profile: VehicleProfile | null,
  compatibility: CompatibilityResult | null,
  status: ECSLiveStatusResult,
  options: EvaluateVehicleFitOptions,
): string[] {
  const limitations: (string | null)[] = [];
  const factors = compatibility?.factors;

  if (!profile) {
    pushIf(limitations, 'vehicle baseline is not configured');
  } else {
    if (!profile.fuel_tank_capacity_gal || !profile.avg_mpg) pushIf(limitations, 'fuel profile is incomplete');
    if (!profile.tireSizeInches) pushIf(limitations, 'tire size is still estimated');
    if (!profile.suspensionLiftInches && !profile.isLeveled) pushIf(limitations, 'clearance is assumed stock');
  }

  if (factors) {
    if (factors.terrainMatch < 60) pushIf(limitations, 'terrain demands may exceed the current setup margin');
    if (factors.fuelRangeCoverage < 60) pushIf(limitations, 'fuel margin may limit route flexibility');
    if (factors.vehicleCapability < 60) pushIf(limitations, 'vehicle capability margin is narrow');
    if (factors.tireSizeMatch < 60) pushIf(limitations, 'current tire size may limit trail margin');
    if (factors.suspensionLiftMatch < 60) pushIf(limitations, 'current clearance may be limited');
  }

  if ((opportunity.remotenessScore ?? 0) >= 8) pushIf(limitations, 'high remoteness reduces recovery margin');
  if ((opportunity.estimatedFuelRequired ?? 0) >= 20) pushIf(limitations, 'fuel demand is operationally relevant');
  if (options.weatherFreshness === 'stale') pushIf(limitations, 'weather support is stale');
  if (status.status === 'degraded') pushIf(limitations, status.shortReason ?? 'vehicle-fit support is degraded');
  if (status.status === 'estimated') pushIf(limitations, status.shortReason ?? 'vehicle-fit is using stored baseline data');

  return uniqueTexts(limitations);
}

function deriveFitConfidence(
  profile: VehicleProfile | null,
  opportunity: CompatibilityExpedition,
  compatibility: CompatibilityResult | null,
  status: ECSLiveStatusResult,
  options: EvaluateVehicleFitOptions,
) {
  if (!profile) {
    return assessVehicleAssessmentConfidence({
      hasVehicleProfile: false,
      hasCoreSpecs: false,
      hasFuelSpecs: false,
      hasTireConfig: false,
      hasSuspensionConfig: false,
      hasFullScore: false,
    });
  }

  const hasDistance = typeof opportunity.distanceMiles === 'number' && opportunity.distanceMiles > 0;
  const hasTerrain = !!String(opportunity.terrainType ?? '').trim() || typeof opportunity.terrainDifficulty === 'number';
  const hasRemoteness = typeof opportunity.remotenessScore === 'number' && Number.isFinite(opportunity.remotenessScore);
  const hasFuelDemand =
    typeof opportunity.estimatedFuelRequired === 'number' && Number.isFinite(opportunity.estimatedFuelRequired);

  const baseConfidence =
    compatibility?.confidence
    ?? assessVehicleAssessmentConfidence({
      hasVehicleProfile: true,
      hasCoreSpecs: !!(profile.gvwr_lb && profile.base_weight_lb),
      hasFuelSpecs: !!(profile.fuel_tank_capacity_gal && profile.avg_mpg),
      hasTireConfig: !!profile.tireSizeInches,
      hasSuspensionConfig: !!(profile.suspensionLiftInches || profile.isLeveled),
      hasFullScore: !!compatibility?.isFullScore,
    });

  const capLevel =
    compatibility?.isFullScore &&
    hasDistance &&
    hasTerrain &&
    hasRemoteness &&
    hasFuelDemand
      ? undefined
      : 'moderate';

  return evaluateECSConfidence({
    domain: 'vehicle_assessment',
    offline: !!options.offline,
    degraded:
      options.operationalState === 'degraded'
      || options.operationalState === 'limited'
      || status.status === 'degraded',
    cloudDependent: options.weatherFreshness != null,
    capLevel,
    sources: [
      {
        id: 'vehicle_profile',
        origin: status.sourceType === 'live' ? 'live' : 'manual',
        available: true,
        required: true,
        freshness: status.sourceType === 'live' ? 'fresh' : 'unknown',
        priority: 'critical',
      },
      {
        id: 'core_specs',
        origin: 'manual',
        available: !!(profile.gvwr_lb && profile.base_weight_lb),
        required: true,
        freshness: 'fresh',
        priority: 'critical',
      },
      {
        id: 'fuel_specs',
        origin: 'manual',
        available: !!(profile.fuel_tank_capacity_gal && profile.avg_mpg),
        required: true,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'tire_config',
        origin: 'manual',
        available: !!profile.tireSizeInches,
        required: false,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'suspension_config',
        origin: 'manual',
        available: !!(profile.suspensionLiftInches || profile.isLeveled),
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
      {
        id: 'route_distance',
        origin: 'inferred',
        available: hasDistance,
        required: true,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'terrain_profile',
        origin: 'inferred',
        available: hasTerrain,
        required: true,
        freshness: 'fresh',
        priority: 'critical',
      },
      {
        id: 'remoteness',
        origin: 'inferred',
        available: hasRemoteness,
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
      {
        id: 'fuel_demand',
        origin: 'inferred',
        available: hasFuelDemand,
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
      {
        id: 'telemetry_support',
        origin: 'live',
        available: options.hasLiveTelemetry || status.sourceType === 'live',
        required: false,
        freshness: status.sourceType === 'live' ? 'fresh' : 'unknown',
        priority: 'normal',
      },
      {
        id: 'weather_support',
        origin: options.weatherFreshness ? 'live' : 'inferred',
        available: options.weatherFreshness != null,
        required: false,
        freshness: mapStatusFreshnessToConfidence(options.weatherFreshness),
        priority: 'low',
      },
      {
        id: 'compatibility_score',
        origin: compatibility?.isFullScore ? 'manual' : 'inferred',
        available: !!compatibility,
        required: true,
        freshness:
          baseConfidence.level === 'high' || baseConfidence.level === 'moderate'
            ? 'fresh'
            : 'aging',
        priority: 'critical',
      },
    ],
  });
}

export function evaluateVehicleFit(
  opportunity: CompatibilityExpedition,
  profile: VehicleProfile | null,
  options: EvaluateVehicleFitOptions = {},
): ECSVehicleFitResult {
  const compatibility =
    options.compatibility
    ?? (profile ? calculateRigCompatibility(profile, opportunity) : null);
  const status = createFallbackStatus(profile, options);
  const score = compatibility?.score ?? 0;
  const level = deriveFitLevel(score, !!profile);
  const confidence = deriveFitConfidence(profile, opportunity, compatibility, status, options);
  const drivers = profile && compatibility
    ? derivePositiveDrivers(opportunity, profile, compatibility)
    : [];
  const limitingFactors = deriveLimitingFactors(opportunity, profile, compatibility, status, options);
  const explanationDrivers =
    level === 'strong_fit' || level === 'good_fit'
      ? [...drivers.slice(0, 2), ...limitingFactors.slice(0, 1)]
      : [...limitingFactors.slice(0, 2), ...drivers.slice(0, 1)];
  const explanation = explainRecommendation({
    type: 'vehicle_assessment',
    drivers:
      explanationDrivers.length > 0
        ? explanationDrivers
        : [status.shortReason ?? 'vehicle-fit support is waiting on stronger baseline data'],
    confidenceLevel: confidence.level,
    degradedState:
      options.operationalState
      ?? (status.status === 'degraded'
        ? 'degraded'
        : status.status === 'offline_capable'
          ? 'offline_capable'
          : undefined),
  });

  return {
    level,
    score,
    label: labelForFitLevel(level),
    confidence,
    status,
    drivers,
    limitingFactors,
    explanation,
  };
}
