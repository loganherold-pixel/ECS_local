import {
  evaluateSourceTruthRef,
  type SourceTruthAvailability,
  type SourceTruthConfidence,
  type SourceTruthFreshness,
  type SourceTruthOrigin,
  type SourceTruthPolicyKey,
} from '../sourceTruth';
import type {
  VehicleAutomotiveSafeProjection,
  VehicleDataSource,
  VehicleDisplayState,
  VehicleExitPlanData,
  VehicleHazardState,
} from '../vehicleDisplayTypes';
import type {
  ECSAutomotiveActionableStatus,
  ECSAutomotiveSafeSource,
  ECSAutomotiveSafeValue,
} from './automotiveSafeTypes';

type ProjectionInput = Pick<
  VehicleDisplayState,
  'navigationData' | 'attitudeData' | 'resourceData' | 'weatherHazardData' | 'exitPlanData'
>;

type SafeValueInput<T> = {
  value: T | null;
  source: ECSAutomotiveSafeSource;
  sourceLabel: string;
  origin: SourceTruthOrigin;
  policyKey: SourceTruthPolicyKey;
  lastUpdatedAt?: string | number | null;
  fetchedAt?: string | number | null;
  expiresAt?: string | number | null;
  confidence: SourceTruthConfidence;
  availability?: SourceTruthAvailability;
  actionableStatus: ECSAutomotiveActionableStatus;
};

function toIso(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function buildSafeValue<T>(input: SafeValueInput<T>, nowMs: number): ECSAutomotiveSafeValue<T> {
  const hasValue = input.value != null;
  const origin = hasValue ? input.origin : 'unavailable';
  const availability = hasValue ? input.availability ?? 'usable' : 'unavailable';
  const observedAt = toIso(input.lastUpdatedAt);
  const evaluation = evaluateSourceTruthRef({
    id: input.source,
    origin,
    policyKey: input.policyKey,
    authority: input.sourceLabel,
    authorityKind:
      input.source === 'ecs_guidance' || input.source === 'inferred' || input.source === 'mixed'
        ? 'ecs'
        : input.source === 'manual'
          ? 'user'
          : input.source === 'cached' || input.source === 'weather_provider'
            ? 'provider'
            : 'device',
    observedAt,
    fetchedAt: toIso(input.fetchedAt),
    expiresAt: toIso(input.expiresAt),
    confidence: input.confidence,
    coverage: hasValue ? 'complete' : 'unknown',
    availability,
    conflictState: 'none',
    warningCodes: [],
  }, { now: nowMs });
  const freshness = origin === 'live' || evaluation.freshness !== 'live'
    ? evaluation.freshness
    : 'recent';

  const freshnessAdjustedStatus: ECSAutomotiveActionableStatus =
    evaluation.availability === 'unavailable'
      ? 'unavailable'
      : freshness === 'stale' || freshness === 'expired'
        ? input.actionableStatus === 'critical' || input.actionableStatus === 'warning'
          ? input.actionableStatus
          : 'watch'
        : input.actionableStatus;

  return {
    value: hasValue ? input.value : null,
    source: hasValue ? input.source : 'unavailable',
    sourceLabel: hasValue ? input.sourceLabel : 'Unavailable',
    origin,
    freshness,
    confidence: evaluation.confidence,
    availability: evaluation.availability,
    actionableStatus: freshnessAdjustedStatus,
    lastUpdatedAt: observedAt ?? toIso(input.fetchedAt),
  };
}

function sourceDescriptor(source: VehicleDataSource): {
  source: ECSAutomotiveSafeSource;
  label: string;
  origin: SourceTruthOrigin;
  policyKey: SourceTruthPolicyKey;
  confidence: SourceTruthConfidence;
} {
  switch (source) {
    case 'live_telemetry':
      return { source: 'vehicle_telemetry', label: 'Vehicle telemetry', origin: 'live', policyKey: 'vehicle_telemetry', confidence: 'high' };
    case 'bluetooth':
      return { source: 'bluetooth', label: 'Connected device', origin: 'live', policyKey: 'vehicle_telemetry', confidence: 'high' };
    case 'gps_live':
      return { source: 'gps', label: 'Device GPS', origin: 'live', policyKey: 'vehicle_telemetry', confidence: 'high' };
    case 'weather_provider':
      return { source: 'weather_provider', label: 'Operational weather provider', origin: 'live', policyKey: 'weather_observation', confidence: 'high' };
    case 'manual':
      return { source: 'manual', label: 'Manual entry', origin: 'manual', policyKey: 'vehicle_profile', confidence: 'medium' };
    case 'cached':
      return { source: 'cached', label: 'Last-good cache', origin: 'cached', policyKey: 'vehicle_telemetry', confidence: 'medium' };
    case 'ai_navigation':
      return { source: 'inferred', label: 'ECS support summary', origin: 'inferred', policyKey: 'default', confidence: 'low' };
    default:
      return { source: 'unavailable', label: 'Unavailable', origin: 'unavailable', policyKey: 'default', confidence: 'unknown' };
  }
}

function hazardStatus(hazard: VehicleHazardState): ECSAutomotiveActionableStatus {
  if (hazard === 'critical') return 'critical';
  if (hazard === 'warning') return 'warning';
  if (hazard === 'caution') return 'watch';
  return 'nominal';
}

function exitStatus(data: VehicleExitPlanData): ECSAutomotiveActionableStatus {
  if (data.status === 'unavailable') return 'unavailable';
  if (data.fuelSupportLabel?.toLowerCase().includes('tightening')) return 'warning';
  if (data.offlineConfidence === 'low' || data.offlineConfidence === 'unknown') return 'watch';
  return 'nominal';
}

function leastFresh(
  left: SourceTruthFreshness,
  right: SourceTruthFreshness,
): SourceTruthFreshness {
  const order: SourceTruthFreshness[] = ['live', 'recent', 'stale', 'expired', 'unavailable'];
  return order.indexOf(left) >= order.indexOf(right) ? left : right;
}

export function buildVehicleAutomotiveSafeProjection(
  input: ProjectionInput,
  nowMs = Date.now(),
): VehicleAutomotiveSafeProjection {
  const navigationSource = input.navigationData.routePhase === 'inactive'
    ? input.navigationData.currentLat != null && input.navigationData.currentLon != null
      ? { source: 'gps' as const, sourceLabel: 'Device GPS', origin: 'live' as const, policyKey: 'vehicle_telemetry' as const, confidence: 'high' as const }
      : { source: 'unavailable' as const, sourceLabel: 'No route or GPS', origin: 'unavailable' as const, policyKey: 'default' as const, confidence: 'unknown' as const }
    : { source: 'ecs_guidance' as const, sourceLabel: 'ECS active guidance', origin: 'live' as const, policyKey: 'default' as const, confidence: 'high' as const };
  const hasPosition = input.navigationData.currentLat != null && input.navigationData.currentLon != null;
  const position = buildSafeValue({
    value: hasPosition
      ? {
          lat: input.navigationData.currentLat as number,
          lon: input.navigationData.currentLon as number,
          headingDeg: input.navigationData.headingDeg,
          speedMph: input.navigationData.speedMph,
        }
      : null,
    source: 'gps',
    sourceLabel: 'Device GPS',
    origin: 'live',
    policyKey: 'vehicle_telemetry',
    lastUpdatedAt: input.navigationData.positionUpdatedAt,
    confidence: 'high',
    actionableStatus: hasPosition ? 'nominal' : 'unavailable',
  }, nowMs);
  const navigationBase = buildSafeValue({
    value: input.navigationData,
    ...navigationSource,
    lastUpdatedAt: input.navigationData.guidanceUpdatedAt ?? input.navigationData.positionUpdatedAt,
    availability: input.navigationData.unavailableReason && input.navigationData.routePhase === 'inactive' ? 'degraded' : 'usable',
    actionableStatus:
      input.navigationData.routePhase === 'alerting_or_degraded'
        ? 'warning'
        : hazardStatus(input.navigationData.hazardState),
  }, nowMs);
  const positionRequired =
    input.navigationData.routePhase === 'route_active' ||
    input.navigationData.routePhase === 'alerting_or_degraded';
  const positionDegraded =
    position.freshness === 'stale' ||
    position.freshness === 'expired' ||
    position.freshness === 'unavailable';
  const navigation = {
    ...navigationBase,
    sourceLabel: positionRequired && positionDegraded
      ? `${navigationBase.sourceLabel}; GPS ${position.freshness}`
      : navigationBase.sourceLabel,
    freshness: positionRequired
      ? leastFresh(navigationBase.freshness, position.freshness)
      : navigationBase.freshness,
    availability: positionRequired && position.availability !== 'usable'
      ? 'degraded' as const
      : navigationBase.availability,
    actionableStatus: positionRequired && positionDegraded
      ? navigationBase.actionableStatus === 'critical'
        ? 'critical' as const
        : 'warning' as const
      : navigationBase.actionableStatus,
    position,
  };

  const attitudeDescriptor = sourceDescriptor(input.attitudeData.source);
  const attitude = buildSafeValue({
    value: input.attitudeData.status === 'unavailable' ? null : input.attitudeData,
    ...attitudeDescriptor,
    sourceLabel: attitudeDescriptor.label,
    lastUpdatedAt: input.attitudeData.updatedAt,
    actionableStatus:
      input.attitudeData.sideSlopeState === 'critical' || input.attitudeData.tiltState === 'critical'
        ? 'critical'
        : input.attitudeData.sideSlopeState === 'caution' || input.attitudeData.tiltState === 'caution'
          ? 'warning'
          : input.attitudeData.status === 'unavailable'
            ? 'unavailable'
            : 'nominal',
  }, nowMs);

  const resourceSources = [
    input.resourceData.fuelSource,
    input.resourceData.powerSource,
    input.resourceData.waterSource,
    input.resourceData.alternateFluidSource,
  ];
  const availableResourceSources = Array.from(new Set(
    resourceSources.filter((source) => source !== 'none'),
  ));
  const resourceDescriptor = availableResourceSources.length > 1
    ? {
        source: 'mixed' as const,
        label: 'Mixed resource sources',
        origin: 'inferred' as const,
        policyKey: 'default' as const,
        confidence: 'medium' as const,
      }
    : sourceDescriptor(availableResourceSources[0] ?? 'none');
  const resourceUpdatedAt = input.resourceData.sourceUpdatedAt;
  const latestResourceTimestamp = [
    resourceUpdatedAt?.fuel,
    resourceUpdatedAt?.power,
    resourceUpdatedAt?.water,
    resourceUpdatedAt?.alternateFluid,
  ].filter((value): value is string => !!value).sort().at(-1) ?? null;
  const resourcesBase = buildSafeValue({
    value: input.resourceData.status === 'unavailable' ? null : input.resourceData,
    ...resourceDescriptor,
    sourceLabel: resourceDescriptor.label,
    lastUpdatedAt: latestResourceTimestamp,
    availability:
      input.resourceData.fuelPercent == null ||
      input.resourceData.waterRemaining == null ||
      input.resourceData.batteryPercent == null
        ? 'degraded'
        : 'usable',
    actionableStatus: input.resourceData.status === 'unavailable' ? 'unavailable' : 'nominal',
  }, nowMs);

  const buildResourceValue = (
    value: number | null,
    source: VehicleDataSource,
    updatedAt: string | null | undefined,
  ) => {
    const descriptor = sourceDescriptor(source);
    return buildSafeValue({
      value,
      ...descriptor,
      sourceLabel: descriptor.label,
      lastUpdatedAt: updatedAt,
      actionableStatus: value == null ? 'unavailable' : 'nominal',
    }, nowMs);
  };
  const resources = {
    ...resourcesBase,
    values: {
      fuel: buildResourceValue(input.resourceData.fuelPercent, input.resourceData.fuelSource, resourceUpdatedAt?.fuel),
      water: buildResourceValue(input.resourceData.waterRemaining, input.resourceData.waterSource, resourceUpdatedAt?.water),
      power: buildResourceValue(input.resourceData.batteryPercent, input.resourceData.powerSource, resourceUpdatedAt?.power),
      alternateFluid: buildResourceValue(input.resourceData.alternateFluidValue, input.resourceData.alternateFluidSource, resourceUpdatedAt?.alternateFluid),
    },
  };

  const weatherDescriptor = sourceDescriptor(input.weatherHazardData.source);
  const weatherHazard = buildSafeValue({
    value: input.weatherHazardData.status === 'unavailable' ? null : input.weatherHazardData,
    ...weatherDescriptor,
    sourceLabel: input.weatherHazardData.providerLabel ?? weatherDescriptor.label,
    policyKey: 'weather_observation',
    lastUpdatedAt: input.weatherHazardData.observedAt,
    fetchedAt: input.weatherHazardData.fetchedAt,
    expiresAt: input.weatherHazardData.expiresAt,
    actionableStatus:
      input.weatherHazardData.status === 'unavailable'
        ? 'unavailable'
        : hazardStatus(input.weatherHazardData.hazardState),
  }, nowMs);

  const exitDescriptor = sourceDescriptor(input.exitPlanData.source);
  const exitPlan = buildSafeValue({
    value: input.exitPlanData.status === 'unavailable' ? null : input.exitPlanData,
    ...exitDescriptor,
    source: input.exitPlanData.source === 'none' ? 'unavailable' : 'inferred',
    sourceLabel: input.exitPlanData.source === 'none' ? 'Unavailable' : 'ECS exit-plan estimate',
    origin: input.exitPlanData.source === 'none' ? 'unavailable' : 'inferred',
    policyKey: 'default',
    lastUpdatedAt: input.exitPlanData.updatedAt,
    confidence: input.exitPlanData.offlineConfidence,
    actionableStatus: exitStatus(input.exitPlanData),
  }, nowMs);

  return {
    schemaVersion: 'ecs.automotive-safe.v1',
    generatedAt: new Date(nowMs).toISOString(),
    navigation,
    attitude,
    resources,
    weatherHazard,
    exitPlan,
  };
}

export function selectActiveAutomotiveSafeSurface(
  projection: VehicleAutomotiveSafeProjection,
  screen: VehicleDisplayState['activeScreen'],
) {
  if (screen === 'weather_hazard') return projection.weatherHazard;
  if (screen === 'exit_plan') return projection.exitPlan;
  return projection[screen];
}
