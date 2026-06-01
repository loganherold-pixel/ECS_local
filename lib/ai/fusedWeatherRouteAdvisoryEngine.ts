import type { DynamicRiskResult } from '../terrainRiskEngine';
import { evaluateECSConfidence } from './confidenceEngine';
import type { ECSConfidenceFreshness } from './confidenceTypes';
import type { ECSOperationalState } from './degradedOperationsTypes';
import type { ECSExpeditionPhase } from './expeditionPhaseTypes';
import { assessWeatherPriority, createPriorityResult, selectPrimaryPriority } from './priorityEngine';
import type { ECSPriorityLevel, ECSPriorityReason } from './priorityTypes';
import { explainRecommendation } from './recommendationExplanationEngine';
import type { ECSFusedWeatherRouteAdvisoryResult } from './fusedWeatherRouteTypes';
import type { ECSExplanationResult } from './recommendationExplanationTypes';

type FusedWeatherSeverity = 'none' | 'advisory' | 'warning' | 'extreme';
type FusedWeatherStaleness = 'fresh' | 'aging' | 'stale' | 'very_stale' | 'unknown';

type FusedWeatherSnapshot = {
  current?: unknown;
  response?: unknown;
  source: 'live' | 'cache' | 'none';
  staleness: FusedWeatherStaleness;
  severity?: FusedWeatherSeverity;
  summaryLabel?: string | null;
  ageLabel?: string | null;
};

export type FusedWeatherRouteAdvisoryInput = {
  weather: FusedWeatherSnapshot;
  terrainRisk?: DynamicRiskResult | null;
  routeActive?: boolean;
  phase?: ECSExpeditionPhase | null;
  remotenessScore?: number | null;
  bailoutAvailable?: boolean | null;
  estimatedTimeToBailoutMin?: number | null;
  degradedState?: ECSOperationalState | null;
  offline?: boolean;
};

const PRIORITY_ORDER: ECSPriorityLevel[] = [
  'informational',
  'advisory',
  'caution',
  'warning',
  'critical',
];

function shiftPriorityLevel(level: ECSPriorityLevel, steps: number): ECSPriorityLevel {
  const currentIndex = PRIORITY_ORDER.indexOf(level);
  const nextIndex = Math.max(0, Math.min(PRIORITY_ORDER.length - 1, currentIndex + steps));
  return PRIORITY_ORDER[nextIndex] ?? level;
}

function toConfidenceFreshness(
  staleness: FusedWeatherStaleness,
): ECSConfidenceFreshness {
  switch (staleness) {
    case 'fresh':
      return 'fresh';
    case 'aging':
      return 'aging';
    case 'stale':
    case 'very_stale':
      return 'stale';
    default:
      return 'unknown';
  }
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeLower(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function pushUnique(target: string[], value: string | null | undefined): void {
  const normalized = String(value ?? '').trim();
  if (!normalized || target.includes(normalized)) return;
  target.push(normalized);
}

function selectWeatherRecord(weather: FusedWeatherSnapshot): Record<string, unknown> | null {
  const current = weather.current as Record<string, unknown> | null | undefined;
  if (current && typeof current === 'object') {
    return (current.current as Record<string, unknown> | undefined) ?? current;
  }

  const firstResult = ((weather.response as any)?.results?.[0] ?? null) as Record<string, unknown> | null;
  if (firstResult && typeof firstResult === 'object') {
    return (firstResult.current as Record<string, unknown> | undefined) ?? firstResult;
  }

  return null;
}

function collectWeatherAlerts(weather: FusedWeatherSnapshot): Record<string, unknown>[] {
  const alerts: Record<string, unknown>[] = [];
  const currentAlerts = Array.isArray((weather.current as any)?.alerts) ? (weather.current as any).alerts : [];
  const responseAlerts = Array.isArray((weather.response as any)?.alerts) ? (weather.response as any).alerts : [];
  const resultAlerts = Array.isArray((weather.response as any)?.results)
    ? (weather.response as any).results.flatMap((result: any) => (Array.isArray(result?.alerts) ? result.alerts : []))
    : [];

  [...currentAlerts, ...responseAlerts, ...resultAlerts].forEach((alert) => {
    if (alert && typeof alert === 'object') {
      alerts.push(alert as Record<string, unknown>);
    }
  });

  return alerts;
}

function weatherSeverityWeight(severity: FusedWeatherSeverity): number {
  switch (severity) {
    case 'extreme':
      return 34;
    case 'warning':
      return 24;
    case 'advisory':
      return 12;
    default:
      return 0;
  }
}

function phaseWeatherBoost(
  phase: ECSExpeditionPhase | null | undefined,
  routeActive: boolean,
): number {
  if (routeActive) return 12;

  switch (phase) {
    case 'vehicle_setup':
    case 'staging':
      return 9;
    case 'transit':
      return 10;
    case 'trail_entry':
      return 12;
    case 'active_expedition':
      return 14;
    case 'camp_stationary':
      return 8;
    case 'recovery_exit':
      return 12;
    default:
      return 0;
  }
}

function routeRiskWeight(terrainRisk?: DynamicRiskResult | null): number {
  switch (terrainRisk?.riskLevel) {
    case 'critical':
      return 22;
    case 'high':
      return 16;
    case 'moderate':
      return 10;
    case 'low':
      return 4;
    default:
      return 0;
  }
}

function freshnessPenalty(staleness: FusedWeatherStaleness): number {
  switch (staleness) {
    case 'aging':
      return 4;
    case 'stale':
      return 12;
    case 'very_stale':
      return 18;
    case 'unknown':
      return 8;
    default:
      return 0;
  }
}

function selectRouteDriver(terrainRisk?: DynamicRiskResult | null): string | null {
  const drivers = Array.isArray(terrainRisk?.drivers) ? terrainRisk!.drivers : [];
  return (
    drivers.find((driver) => /grade|slope|terrain|traction|water|committed|bailout|remote/i.test(String(driver))) ??
    drivers[0] ??
    null
  );
}

function buildWeatherDrivers(
  input: FusedWeatherRouteAdvisoryInput,
): { drivers: string[]; weatherImpact: number } {
  const drivers: string[] = [];
  let weatherImpact = 0;

  const weather = input.weather;
  const current = selectWeatherRecord(weather);
  const alerts = collectWeatherAlerts(weather);
  const main = safeLower(current?.weather_main ?? current?.weather_description);
  const wind =
    safeNumber(current?.wind_gust) ??
    safeNumber(current?.wind_speed);
  const visibility = safeNumber(current?.visibility);
  const rain =
    safeNumber(current?.rain_1h) ??
    safeNumber(current?.rain_3h) ??
    0;
  const snow =
    safeNumber(current?.snow_1h) ??
    safeNumber(current?.snow_3h) ??
    0;
  const temp =
    safeNumber(current?.temp) ??
    safeNumber(current?.feels_like);

  if (wind != null && wind >= 35) {
    pushUnique(drivers, 'incoming wind');
    weatherImpact += 16;
  } else if (wind != null && wind >= 18) {
    pushUnique(drivers, 'wind exposure');
    weatherImpact += 8;
  }

  if (rain > 0 || main.includes('rain') || main.includes('thunderstorm') || main.includes('drizzle')) {
    pushUnique(drivers, main.includes('thunderstorm') ? 'storm timing' : 'wet terrain risk');
    weatherImpact += main.includes('thunderstorm') ? 14 : 10;
  }

  if (snow > 0 || main.includes('snow') || main.includes('ice')) {
    pushUnique(drivers, 'snow or ice exposure');
    weatherImpact += 14;
  }

  if (visibility != null && visibility > 0 && visibility <= 1600) {
    pushUnique(drivers, 'visibility reduction');
    weatherImpact += visibility <= 500 ? 14 : 9;
  }

  if (temp != null && (temp >= 95 || temp <= 20)) {
    pushUnique(drivers, temp >= 95 ? 'heat exposure' : 'cold exposure');
    weatherImpact += 8;
  }

  const severeAlert = alerts.find((alert) => {
    const severity = safeLower(alert.severity);
    return severity === 'extreme' || severity === 'warning';
  });
  if (severeAlert) {
    pushUnique(
      drivers,
      safeLower(severeAlert.type).includes('storm')
        ? 'storm timing'
        : 'active weather alerts',
    );
    weatherImpact += 12;
  }

  if (input.phase === 'camp_stationary' && weather.severity && weather.severity !== 'none') {
    pushUnique(drivers, 'overnight exposure');
    weatherImpact += 6;
  }

  return { drivers, weatherImpact };
}

function buildFusedSummary(args: {
  phase?: ECSExpeditionPhase | null;
  softenedByFreshness: boolean;
  weatherStaleness: FusedWeatherStaleness;
  baseExplanation: ECSExplanationResult | null;
}): ECSExplanationResult | null {
  if (args.phase === 'camp_stationary') {
    return {
      text: 'Overnight weather may affect camp conditions and next-day route confidence.',
      shortText: 'Overnight weather watch.',
    };
  }

  if (args.softenedByFreshness) {
    return {
      text: `Route weather concern softened because forecast support is ${args.weatherStaleness === 'very_stale' ? 'very stale' : 'stale'}.`,
      shortText: 'Weather support is stale.',
    };
  }

  return args.baseExplanation;
}

function buildTitle(level: ECSPriorityLevel, phase?: ECSExpeditionPhase | null): string {
  if (phase === 'camp_stationary') {
    switch (level) {
      case 'critical':
      case 'warning':
        return 'Overnight weather warning';
      case 'caution':
        return 'Overnight weather caution';
      default:
        return 'Overnight weather note';
    }
  }

  switch (level) {
    case 'critical':
    case 'warning':
      return 'Route weather warning';
    case 'caution':
      return 'Route weather caution';
    case 'advisory':
      return 'Route weather advisory';
    default:
      return 'Route weather note';
  }
}

export function buildFusedWeatherRouteAdvisory(
  input: FusedWeatherRouteAdvisoryInput,
): ECSFusedWeatherRouteAdvisoryResult | null {
  const weather = input.weather;
  const severity = weather.severity ?? 'none';
  const weatherAvailable =
    weather.source !== 'none' ||
    severity !== 'none' ||
    !!weather.current ||
    !!weather.response;

  if (!weatherAvailable) {
    return null;
  }

  const { drivers: weatherDrivers, weatherImpact } = buildWeatherDrivers(input);
  const routeDriver = selectRouteDriver(input.terrainRisk);
  const drivers: string[] = [];

  pushUnique(drivers, routeDriver);
  weatherDrivers.forEach((driver) => pushUnique(drivers, driver));

  if ((input.remotenessScore ?? 0) >= 85) {
    pushUnique(drivers, 'increasing remoteness');
  } else if ((input.remotenessScore ?? 0) >= 70) {
    pushUnique(drivers, 'rising exposure');
  }

  if (input.bailoutAvailable === false) {
    pushUnique(drivers, 'limited nearby bailout access');
  } else if ((input.estimatedTimeToBailoutMin ?? 0) >= 120) {
    pushUnique(drivers, 'bailout access is distant');
  }

  const routeContextBoost =
    phaseWeatherBoost(input.phase, !!input.routeActive) +
    routeRiskWeight(input.terrainRisk) +
    ((input.remotenessScore ?? 0) >= 70 ? 8 : 0) +
    (input.bailoutAvailable === false ? 10 : 0) +
    ((input.estimatedTimeToBailoutMin ?? 0) >= 120 ? 4 : 0);
  const impactScore = Math.max(
    0,
    Math.min(
      100,
      weatherSeverityWeight(severity) +
        weatherImpact +
        routeContextBoost -
        freshnessPenalty(weather.staleness),
    ),
  );

  const relevance =
    impactScore >= 54
      ? 'route_critical'
      : impactScore >= 26
        ? 'route_relevant'
        : 'general_weather';

  if (relevance === 'general_weather' || drivers.length === 0) {
    return null;
  }

  const confidence = evaluateECSConfidence({
    domain: 'trail_risk',
    offline: !!input.offline,
    degraded:
      input.degradedState === 'degraded' ||
      input.degradedState === 'limited' ||
      input.degradedState === 'unavailable',
    cloudDependent: true,
    capLevel: weather.staleness === 'very_stale' ? 'limited' : undefined,
    sources: [
      {
        id: 'route_risk',
        origin: 'inferred',
        available: !!input.terrainRisk,
        required: true,
        freshness: 'fresh',
        priority: 'critical',
      },
      {
        id: 'weather_support',
        origin: weather.source === 'live' ? 'live' : 'inferred',
        available: weatherAvailable,
        required: true,
        freshness: toConfidenceFreshness(weather.staleness),
        priority: 'critical',
      },
      {
        id: 'weather_alerts',
        origin: weather.source === 'live' ? 'live' : 'inferred',
        available: collectWeatherAlerts(weather).length > 0,
        required: false,
        freshness: toConfidenceFreshness(weather.staleness),
        priority: 'high',
      },
      {
        id: 'route_context',
        origin: 'inferred',
        available: !!input.routeActive || !!input.phase,
        required: false,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'exit_context',
        origin: 'inferred',
        available: input.bailoutAvailable != null,
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
    ],
  });

  const weatherPriority = assessWeatherPriority({
    severity,
    routeActive: input.routeActive,
    alertCount: collectWeatherAlerts(weather).length,
    stale: weather.staleness === 'stale' || weather.staleness === 'very_stale',
    offline: !!input.offline,
    confidence,
  });

  const basePriority = selectPrimaryPriority([
    input.terrainRisk?.priority ?? null,
    weatherPriority,
  ]);

  let priorityLevel = basePriority?.level ?? 'advisory';

  if (
    relevance === 'route_critical' &&
    (severity === 'warning' || severity === 'extreme' || (input.terrainRisk?.riskLevel ?? 'low') !== 'low')
  ) {
    priorityLevel = shiftPriorityLevel(priorityLevel, 1);
  }

  if (
    input.routeActive &&
    input.bailoutAvailable === false &&
    (input.remotenessScore ?? 0) >= 70 &&
    severity !== 'none'
  ) {
    priorityLevel = shiftPriorityLevel(priorityLevel, 1);
  }

  if (weather.staleness === 'stale') {
    priorityLevel = shiftPriorityLevel(priorityLevel, -1);
  } else if (weather.staleness === 'very_stale') {
    priorityLevel = shiftPriorityLevel(priorityLevel, -2);
  }

  if (!input.routeActive && priorityLevel === 'critical') {
    priorityLevel = 'warning';
  }

  if (input.phase === 'staging' && priorityLevel === 'warning' && severity !== 'extreme') {
    priorityLevel = 'caution';
  }

  if (input.phase === 'camp_stationary' && priorityLevel === 'critical') {
    priorityLevel = 'warning';
  }

  const title = buildTitle(priorityLevel, input.phase);
  const softenedByFreshness =
    weather.staleness === 'stale' || weather.staleness === 'very_stale';

  const baseExplanation = explainRecommendation({
    type: input.phase === 'camp_stationary' ? 'weather' : 'route_risk',
    drivers,
    confidenceLevel: confidence.level,
    priorityLevel,
    degradedState: input.degradedState ?? undefined,
  });
  const explanation =
    buildFusedSummary({
      phase: input.phase,
      softenedByFreshness,
      weatherStaleness: weather.staleness,
      baseExplanation,
    }) ?? baseExplanation;

  const summary =
    explanation?.text ??
    weather.summaryLabel ??
    weather.ageLabel ??
    'Weather is shaping current route execution.';

  const reasons: ECSPriorityReason[] = [
    'weather_exposure',
    'route_risk',
    ...(softenedByFreshness || input.offline ? (['offline_degraded'] as const) : []),
  ];

  const priority = createPriorityResult({
    level: priorityLevel,
    domain: 'weather',
    title,
    shortReason:
      softenedByFreshness
        ? 'Weather support is stale for route-critical interpretation'
        : input.phase === 'camp_stationary'
          ? 'Overnight weather may affect camp posture and next-day confidence'
          : input.bailoutAvailable === false && (input.remotenessScore ?? 0) >= 70
            ? 'Weather is tightening route margin in remote terrain'
            : 'Weather is materially affecting route exposure',
    reasons,
    sourceKey: 'route_weather_fused',
    confidence,
  });

  return {
    relevant: true,
    relevance,
    title,
    summary,
    drivers,
    confidence,
    priority,
    explanation,
    weatherImpactScore: impactScore,
    softenedByFreshness,
    phase: input.phase ?? null,
    degradedState: input.degradedState ?? null,
    groupKey: 'route_weather',
  };
}
