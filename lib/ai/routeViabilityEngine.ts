import type { DynamicRiskResult } from '../terrainRiskEngine';
import type { ResourceForecast } from '../resourceForecastEngine';
import type { ECSLiveStatusResult } from '../status/liveStatusTypes';
import { assessRouteViabilityConfidence } from './confidenceEngine';
import type { ECSConfidenceFreshness } from './confidenceTypes';
import type { ECSOperationalState } from './degradedOperationsTypes';
import type { ECSExpeditionPhase } from './expeditionPhaseTypes';
import { assessRouteViabilityPriority } from './priorityEngine';
import { explainRecommendation } from './recommendationExplanationEngine';
import type { ECSRouteViabilityResult } from './routeViabilityTypes';

type RouteContextSnapshot = {
  progressPercent?: number | null;
  bailoutAvailable?: boolean | null;
  estimatedTimeToBailoutMin?: number | null;
};

type ResourceSnapshot = {
  fuelPercent?: number | null;
  fuelRangeMiles?: number | null;
  waterPercent?: number | null;
  powerPercent?: number | null;
  powerRuntimeHours?: number | null;
  inputWatts?: number | null;
  outputWatts?: number | null;
};

export type RouteViabilityInput = {
  forecast?: ResourceForecast | null;
  routeContext?: RouteContextSnapshot | null;
  resources?: ResourceSnapshot | null;
  terrainRisk?: DynamicRiskResult | null;
  remotenessScore?: number | null;
  remainingDistanceMiles?: number | null;
  status?: ECSLiveStatusResult | null;
  phase?: ECSExpeditionPhase | null;
  routeActive?: boolean;
  degradedState?: ECSOperationalState | null;
  offline?: boolean;
};

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pushUnique(target: string[], value: string | null | undefined): void {
  const normalized = String(value ?? '').trim();
  if (!normalized || target.includes(normalized)) return;
  target.push(normalized);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function liveFreshnessToConfidenceFreshness(
  status?: ECSLiveStatusResult | null,
): ECSConfidenceFreshness {
  switch (status?.freshness) {
    case 'current':
      return 'fresh';
    case 'recent':
      return 'aging';
    case 'stale':
      return 'stale';
    default:
      return 'unknown';
  }
}

function fuelRangePressure(estimatedRangeMiles: number | null, remainingDistanceMiles: number | null): number {
  if (estimatedRangeMiles == null || remainingDistanceMiles == null || remainingDistanceMiles <= 0) {
    return 0;
  }

  const ratio = estimatedRangeMiles / remainingDistanceMiles;
  if (ratio < 0.8) return 34;
  if (ratio < 1.0) return 24;
  if (ratio < 1.2) return 14;
  if (ratio < 1.5) return 6;
  return 0;
}

function waterPhaseWeight(phase: ECSExpeditionPhase | null | undefined): number {
  switch (phase) {
    case 'camp_stationary':
      return 1.3;
    case 'active_expedition':
    case 'recovery_exit':
      return 1.1;
    case 'trail_entry':
      return 1;
    case 'transit':
      return 0.55;
    default:
      return 0.75;
  }
}

function powerPhaseWeight(phase: ECSExpeditionPhase | null | undefined): number {
  switch (phase) {
    case 'camp_stationary':
      return 1.35;
    case 'active_expedition':
      return 1;
    case 'recovery_exit':
      return 0.95;
    case 'transit':
      return 0.45;
    default:
      return 0.7;
  }
}

function deriveLabel(level: ECSRouteViabilityResult['level']): string {
  switch (level) {
    case 'viable':
      return 'Continue';
    case 'watch_closely':
      return 'Caution';
    case 'limited_margin':
      return 'Limited Margin';
    case 'exit_recommended':
      return 'Exit Recommended';
    default:
      return 'Unknown Margin';
  }
}

function deriveBailoutSummary(input: RouteViabilityInput, level: ECSRouteViabilityResult['level']): string | undefined {
  const routeContext = input.routeContext;
  if (!routeContext) return undefined;

  if (routeContext.bailoutAvailable === false) {
    return level === 'exit_recommended'
      ? 'No bailout corridor is confirmed.'
      : 'Bailout options are limited.';
  }

  const minutes = safeNumber(routeContext.estimatedTimeToBailoutMin);
  if (minutes != null) {
    if (minutes >= 120) return 'Nearest recovery access is over two hours away.';
    if (minutes >= 60) return 'Nearest recovery access is increasing.';
    if (minutes > 0) return 'Nearby bailout access remains available.';
  }

  return routeContext.bailoutAvailable ? 'Bailout access remains available.' : undefined;
}

export function computeRouteViability(
  input: RouteViabilityInput,
): ECSRouteViabilityResult | null {
  const forecast = input.forecast ?? null;
  const routeContext = input.routeContext ?? null;
  const resources = input.resources ?? null;
  const remotenessScore = safeNumber(input.remotenessScore) ?? 0;
  const remainingDistanceMiles =
    safeNumber(input.remainingDistanceMiles) ??
    safeNumber(forecast?.routeMiles) ??
    null;
  const routeProgress = safeNumber(routeContext?.progressPercent) ?? null;
  const fuelPercent = safeNumber(resources?.fuelPercent);
  const waterPercent = safeNumber(resources?.waterPercent);
  const powerPercent =
    safeNumber(resources?.powerPercent) ??
    safeNumber((forecast as any)?.powerReservePercent);
  const powerRuntimeHours = safeNumber(resources?.powerRuntimeHours);

  const estimatedRangeMiles =
    safeNumber(resources?.fuelRangeMiles) ??
    (forecast && forecast.fuel?.availableGallons != null && forecast.fuel?.adjustedMpg != null
      ? forecast.fuel.availableGallons * forecast.fuel.adjustedMpg
      : null);

  const hasMeaningfulResourceData =
    !!forecast ||
    fuelPercent != null ||
    waterPercent != null ||
    powerPercent != null ||
    powerRuntimeHours != null ||
    estimatedRangeMiles != null;

  const hasContext =
    !!routeContext ||
    !!input.routeActive ||
    remainingDistanceMiles != null ||
    remotenessScore > 0;

  if (!hasMeaningfulResourceData && !hasContext) {
    return null;
  }

  const drivers: string[] = [];
  let pressure = 0;
  let bailoutRelevant = false;
  let hardExitSignal = false;

  if (forecast) {
    switch (forecast.sufficiencyLevel) {
      case 'Resources Insufficient':
        pressure += 42;
        hardExitSignal = true;
        pushUnique(drivers, 'resource forecast is insufficient');
        break;
      case 'Resources Limited':
        pressure += 28;
        pushUnique(drivers, 'resource margin is shrinking');
        break;
      case 'Watch Consumption':
        pressure += 16;
        pushUnique(drivers, 'resource trend needs watch');
        break;
      default:
        pressure += 4;
        break;
    }

    if (forecast.fuel.status === 'LOW') {
      pressure += 18;
      bailoutRelevant = true;
      pushUnique(
        drivers,
        forecast.fuel.marginGallons < 0 ? 'fuel range below route demand' : 'falling fuel range',
      );
    } else if (forecast.fuel.status === 'CAUTION') {
      pressure += 10;
      pushUnique(drivers, 'fuel margin tightening');
    }

    if (forecast.water.status === 'LOW') {
      pressure += Math.round(14 * waterPhaseWeight(input.phase));
      pushUnique(drivers, 'water reserve is tightening');
    } else if (forecast.water.status === 'CAUTION') {
      pressure += Math.round(7 * waterPhaseWeight(input.phase));
      pushUnique(drivers, 'water margin tightening');
    }

    if (forecast.power.status === 'LOW') {
      pressure += Math.round(12 * powerPhaseWeight(input.phase));
      pushUnique(drivers, 'power endurance is tightening');
    } else if (forecast.power.status === 'CAUTION') {
      pressure += Math.round(6 * powerPhaseWeight(input.phase));
      pushUnique(drivers, 'power margin tightening');
    }
  }

  const rangePressure = fuelRangePressure(estimatedRangeMiles, remainingDistanceMiles);
  if (rangePressure > 0) {
    pressure += rangePressure;
    bailoutRelevant = true;
    pushUnique(
      drivers,
      rangePressure >= 24 ? 'falling fuel range' : 'range margin tightening',
    );
    if (rangePressure >= 24) {
      hardExitSignal = hardExitSignal || (input.routeActive === true && remotenessScore >= 70);
    }
  }

  if (!forecast && fuelPercent != null) {
    if (fuelPercent <= 8) {
      pressure += 24;
      bailoutRelevant = true;
      hardExitSignal = hardExitSignal || remotenessScore >= 70;
      pushUnique(drivers, 'fuel reserve is very low');
    } else if (fuelPercent <= 18) {
      pressure += 14;
      bailoutRelevant = true;
      pushUnique(drivers, 'fuel reserve is tightening');
    } else if (fuelPercent <= 35) {
      pressure += 6;
      pushUnique(drivers, 'fuel reserve deserves watch');
    }
  }

  if (!forecast && waterPercent != null) {
    if (waterPercent <= 10) {
      pressure += Math.round(14 * waterPhaseWeight(input.phase));
      pushUnique(drivers, 'water reserve is very low');
    } else if (waterPercent <= 25) {
      pressure += Math.round(8 * waterPhaseWeight(input.phase));
      pushUnique(drivers, 'water reserve deserves watch');
    }
  }

  if (!forecast && powerPercent != null) {
    if (powerPercent <= 10) {
      pressure += Math.round(12 * powerPhaseWeight(input.phase));
      pushUnique(drivers, 'power reserve is very low');
    } else if (powerPercent <= 25) {
      pressure += Math.round(7 * powerPhaseWeight(input.phase));
      pushUnique(drivers, 'power reserve deserves watch');
    }
  }

  if (powerRuntimeHours != null && powerRuntimeHours <= 6 && powerPhaseWeight(input.phase) >= 1) {
    pressure += 8;
    pushUnique(drivers, 'power endurance is short');
  }

  if (remotenessScore >= 85) {
    pressure += 18;
    bailoutRelevant = true;
    pushUnique(drivers, 'rising remoteness');
  } else if (remotenessScore >= 70) {
    pressure += 12;
    bailoutRelevant = true;
    pushUnique(drivers, 'increasing remoteness');
  } else if (remotenessScore >= 55) {
    pressure += 6;
    pushUnique(drivers, 'moderate remoteness');
  }

  if ((input.terrainRisk?.riskLevel ?? 'low') === 'critical') {
    pressure += 12;
    bailoutRelevant = true;
    pushUnique(drivers, input.terrainRisk?.drivers?.[0] ?? 'route conditions remain severe');
  } else if ((input.terrainRisk?.riskLevel ?? 'low') === 'high') {
    pressure += 8;
    pushUnique(drivers, input.terrainRisk?.drivers?.[0] ?? 'route conditions remain demanding');
  }

  if (routeContext) {
    if (routeContext.bailoutAvailable === false) {
      bailoutRelevant = true;
      pressure += 12;
      pushUnique(drivers, 'fewer bailout options');
    }

    const bailoutMinutes = safeNumber(routeContext.estimatedTimeToBailoutMin);
    if (bailoutMinutes != null) {
      if (bailoutMinutes >= 120) {
        bailoutRelevant = true;
        pressure += 8;
        pushUnique(drivers, 'nearest recovery access is increasing');
      } else if (bailoutMinutes >= 60) {
        pressure += 4;
        pushUnique(drivers, 'recovery access is stretching');
      } else if (routeContext.bailoutAvailable === true) {
        pressure -= 10;
      }
    } else if (routeContext.bailoutAvailable === true) {
      pressure -= 8;
    }

    if (routeProgress != null && routeProgress >= 75 && routeContext.bailoutAvailable === false) {
      pressure += 10;
      bailoutRelevant = true;
      pushUnique(drivers, 'route commitment is high');
    } else if (routeProgress != null && routeProgress >= 45 && routeContext.bailoutAvailable === false) {
      pressure += 5;
      pushUnique(drivers, 'route commitment is rising');
    }
  }

  if (input.phase === 'recovery_exit') {
    pressure += 8;
    bailoutRelevant = true;
    pushUnique(drivers, 'exit posture is already active');
  }

  if (input.phase === 'camp_stationary' && powerPhaseWeight(input.phase) > 1 && powerPercent != null && powerPercent <= 30) {
    pushUnique(drivers, 'overnight power margin');
  }

  pressure = clamp(Math.round(pressure), 0, 100);

  const confidence = assessRouteViabilityConfidence({
    hasForecast: !!forecast,
    hasLiveResourceTelemetry: input.status?.status === 'live',
    hasManualBaseline:
      !!forecast?.hasRealData ||
      fuelPercent != null ||
      waterPercent != null ||
      powerPercent != null ||
      powerRuntimeHours != null,
    hasRouteContext: !!routeContext || !!input.routeActive,
    hasRemainingDistance: remainingDistanceMiles != null,
    hasBailoutContext: routeContext?.bailoutAvailable != null,
    resourceFreshness: liveFreshnessToConfidenceFreshness(input.status),
    offline: !!input.offline,
    degraded:
      input.degradedState === 'degraded' ||
      input.degradedState === 'limited' ||
      input.degradedState === 'unavailable',
  });

  let level: ECSRouteViabilityResult['level'];
  if (!hasMeaningfulResourceData) {
    level = 'unknown';
  } else if (hardExitSignal || pressure >= 74) {
    level = 'exit_recommended';
  } else if (pressure >= 54) {
    level = 'limited_margin';
  } else if (pressure >= 28) {
    level = 'watch_closely';
  } else {
    level = 'viable';
  }

  if ((confidence.level === 'low' || confidence.level === 'unknown') && level === 'viable') {
    level = hasMeaningfulResourceData ? 'watch_closely' : 'unknown';
  }

  if (
    (confidence.level === 'low' || confidence.level === 'unknown') &&
    level === 'exit_recommended' &&
    !hardExitSignal
  ) {
    level = 'limited_margin';
  }

  if ((confidence.level === 'low' || confidence.level === 'unknown') && !routeContext && !forecast) {
    level = 'unknown';
  }

  const score =
    level === 'unknown'
      ? 34
      : clamp(
          level === 'exit_recommended'
            ? 18
            : level === 'limited_margin'
              ? 42
              : level === 'watch_closely'
                ? 64
                : 84,
          0,
          100,
        );

  const label = deriveLabel(level);
  const priority = assessRouteViabilityPriority({
    viabilityLevel: level,
    routeActive: input.routeActive,
    bailoutRelevant,
    phase: input.phase,
    confidence,
  });

  const explanation = explainRecommendation({
    type: 'route_viability',
    drivers: drivers.slice(0, 3),
    confidenceLevel: confidence.level,
    priorityLevel: priority.level,
    degradedState: input.degradedState ?? undefined,
  });

  const explanationOverride =
    confidence.reasons.includes('manual_only') || confidence.reasons.includes('estimated_partial')
      ? {
          text:
            explanation?.text != null
              ? `${explanation.text.replace(/\.$/, '')}; assessment is based on stored baseline data.`
              : 'Assessment softened because resource status is based on stored baseline data.',
          shortText: explanation?.shortText ?? 'Baseline-backed assessment.',
        }
      : explanation;

  const orderedDrivers = drivers.slice(0, 4);
  if (!orderedDrivers.length) {
    orderedDrivers.push(level === 'viable' ? 'resource reserve remains acceptable' : 'resource margin is uncertain');
  }

  return {
    level,
    score,
    label,
    confidence,
    status: input.status ?? null,
    priority,
    drivers: orderedDrivers,
    bailoutRelevant,
    bailoutSummary: deriveBailoutSummary(input, level),
    explanation: explanationOverride,
    groupKey: 'route_viability',
  };
}
