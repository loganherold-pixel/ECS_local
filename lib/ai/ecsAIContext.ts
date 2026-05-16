import type { ECSAIContext } from '../aiContextBuilder';
import type { ECSAIAdvisoryContext, ECSAIAdvisorySurface, ECSAIInput, ECSAISourceTruth } from './ecsAITypes';
import { makeECSAIInput, normalizeECSAISourceTruth } from './ecsAITruth';

function confidenceFromBand(value: unknown): number {
  const text = String(value ?? '').toLowerCase();
  if (text === 'high' || text === 'verified') return 90;
  if (text === 'medium' || text === 'catalog_estimate') return 72;
  if (text === 'low' || text === 'incomplete') return 45;
  if (text === 'unknown') return 20;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 50;
}

function weatherTruth(context: ECSAIContext | null): ECSAISourceTruth {
  const weather = context?.environment.weather;
  if (!weather || !weather.current) return 'unavailable';
  if (weather.source === 'live' && (weather.staleness === 'fresh' || weather.staleness === 'aging')) return 'live';
  if (weather.source === 'cache' || weather.staleness === 'stale' || weather.staleness === 'very_stale') return 'cached';
  return 'estimated';
}

function vehicleWeightTruth(context: ECSAIContext | null): ECSAISourceTruth {
  const weight = context?.resources.vehicleIntelligence?.weightSnapshot;
  return normalizeECSAISourceTruth(weight?.confidenceLevel ?? weight?.confidenceLabel);
}

function powerTruth(context: ECSAIContext | null): ECSAISourceTruth {
  const authority = context?.resources.powerAuthority;
  const intelligence = context?.resources.powerIntelligence;
  const freshness = String(
    authority?.freshness
      ?? intelligence?.dataFreshness
      ?? intelligence?.freshnessText
      ?? '',
  ).toLowerCase();
  if (!authority?.available && !context?.resources.powerIntelligence?.available) return 'unavailable';
  if (freshness.includes('manual')) return 'manual';
  if (freshness.includes('stale') || freshness.includes('known') || freshness.includes('cached')) return 'cached';
  if (freshness.includes('demo') || freshness.includes('sim')) return 'simulated';
  if (freshness.includes('live')) return 'live';
  return authority?.available ? 'estimated' : 'unavailable';
}

function telemetryTruth(context: ECSAIContext | null): ECSAISourceTruth {
  const telemetry = context?.resources.telemetryReadout;
  if (!telemetry) return 'unavailable';
  const text = JSON.stringify(telemetry).toLowerCase();
  if (text.includes('simulated') || text.includes('simulation')) return 'simulated';
  if (text.includes('manual')) return 'manual';
  if (text.includes('cached') || text.includes('stale')) return 'cached';
  if (text.includes('live') || text.includes('obd') || text.includes('ble')) return 'live';
  return 'estimated';
}

function routeTruth(context: ECSAIContext | null): ECSAISourceTruth {
  if (!context?.route.activeRoute && !context?.route.activeRun) return 'unavailable';
  if (
    context.route.routeStatus === 'in_progress' ||
    context.route.routeStatus === 'near_completion' ||
    context.route.routeStatus === 'off_route' ||
    context.meta.hasActiveRun
  ) return 'live';
  return 'estimated';
}

function input<T>(
  value: T | null | undefined,
  truth: ECSAISourceTruth,
  confidence?: number,
  sourceName?: string | null,
  updatedAt?: string | number | null,
): ECSAIInput<T> {
  return makeECSAIInput(value, truth, { confidence, sourceName, updatedAt });
}

export function buildECSAIAdvisoryContext(
  context: ECSAIContext | null,
  surface: ECSAIAdvisorySurface | 'unknown' = 'unknown',
): ECSAIAdvisoryContext {
  const vehicle = context?.resources.vehicleIntelligence ?? null;
  const weight = vehicle?.weightSnapshot ?? null;
  const weather = context?.environment.weather ?? null;
  const route = context?.route ?? null;
  const gps = context?.environment.gps ?? null;

  return {
    currentRoute: input(
      route?.activeRoute ?? route?.activeRun ?? null,
      routeTruth(context),
      context?.route.routeIntelligence ? 78 : 52,
      route?.activeRoute?.source_app ?? (route?.activeRun ? 'Navigate route' : null),
      context?.meta.builtAt,
    ),
    navigation: input(
      route?.routeStatus ?? null,
      routeTruth(context),
      context?.meta.hasActiveRoute || context?.meta.hasActiveRun ? 80 : 0,
      'Navigate',
      context?.meta.builtAt,
    ),
    location: input(
      gps ?? null,
      gps ? 'live' : 'unavailable',
      confidenceFromBand((gps as any)?.fixQuality ?? (gps as any)?.status),
      'GPS',
      context?.meta.builtAt,
    ),
    weather: input(
      weather?.current ?? weather?.response ?? null,
      weatherTruth(context),
      weather?.source === 'live' ? 82 : weather?.source === 'cache' ? 56 : 0,
      weather?.summaryLabel ?? 'Weather',
      context?.meta.builtAt,
    ),
    vehicleProfile: input(
      vehicle,
      vehicle?.available ? 'estimated' : 'unavailable',
      confidenceFromBand(vehicle?.confidence?.score ?? vehicle?.classConfidence),
      vehicle?.identityLabel ?? 'Fleet',
      context?.meta.builtAt,
    ),
    vehicleWeight: input(
      typeof weight?.estimatedOperatingWeightLbs === 'number'
        ? weight.estimatedOperatingWeightLbs
        : typeof (weight as any)?.estimatedOperatingWeightLbs === 'number'
          ? (weight as any).estimatedOperatingWeightLbs
          : null,
      vehicleWeightTruth(context),
      confidenceFromBand((weight as any)?.confidence?.level ?? (weight as any)?.confidenceLevel),
      'Fleet weight',
      context?.meta.builtAt,
    ),
    loadout: input(
      vehicle?.loadoutSnapshot ?? null,
      vehicle?.loadoutSnapshot ? 'estimated' : 'unavailable',
      confidenceFromBand(vehicle?.confidence?.score),
      'Fleet loadout',
      context?.meta.builtAt,
    ),
    campCandidates: input(
      route?.campIntel ?? route?.campDecision ?? null,
      route?.campIntel || route?.campDecision ? 'estimated' : 'unavailable',
      route?.campIntel || route?.campDecision ? 62 : 0,
      'CampOps',
      context?.meta.builtAt,
    ),
    telemetry: input(
      context?.resources.telemetryReadout ?? null,
      telemetryTruth(context),
      context?.resources.telemetryReadout ? 60 : 0,
      'Telemetry',
      context?.meta.builtAt,
    ),
    power: input(
      context?.resources.powerAuthority ?? context?.resources.powerIntelligence ?? null,
      powerTruth(context),
      context?.resources.powerAuthority?.available ? 76 : 42,
      context?.resources.powerAuthority?.providerLabel
        ?? context?.resources.powerIntelligence?.providerLabel
        ?? 'Power',
      context?.resources.powerAuthority?.lastUpdatedAt ?? context?.meta.builtAt,
    ),
    offlineCache: input(
      context?.storage ?? null,
      context?.storage ? 'cached' : 'unavailable',
      context?.storage ? 66 : 0,
      'Offline cache',
      context?.meta.builtAt,
    ),
    appSurface: surface,
  };
}
