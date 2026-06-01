import type {
  ECSVehiclePresentationModel,
  ECSVehicleSessionState,
  VehicleAttitudeData,
  VehicleDataSource,
  VehicleDisplayScreen,
  VehicleExitPlanData,
  VehicleNavigationData,
  VehicleResourceData,
  VehicleRouteSessionState,
  VehicleSurfaceAvailability,
  VehicleSurfacePresentationSummary,
  VehicleWeatherHazardData,
} from './vehicleDisplayTypes';

const VEHICLE_SOURCE_PRIORITY: Record<VehicleDataSource, number> = {
  live_telemetry: 5,
  bluetooth: 4,
  gps_live: 3,
  ai_navigation: 2,
  cached: 1,
  manual: 0,
  none: -1,
};

function getVehicleSurfaceAvailability(params: {
  status: 'live' | 'fallback' | 'unavailable';
  source: VehicleDataSource;
  stale?: boolean;
}): VehicleSurfaceAvailability {
  if (params.stale) return 'stale';
  if (params.status === 'unavailable' || params.source === 'none') return 'unavailable';
  if (
    params.status === 'fallback' ||
    params.source === 'manual' ||
    params.source === 'cached'
  ) {
    return 'available_fallback';
  }
  return 'available_live';
}

function strongestSource(sources: VehicleDataSource[]): VehicleDataSource {
  return [...sources].sort(
    (a, b) => VEHICLE_SOURCE_PRIORITY[b] - VEHICLE_SOURCE_PRIORITY[a],
  )[0] ?? 'none';
}

export function mapRoutePhaseToVehicleSessionState(params: {
  routePhase: VehicleRouteSessionState;
  offRouteDetected?: boolean;
  navigationUnavailableReason?: string | null;
}): ECSVehicleSessionState {
  const { routePhase, offRouteDetected, navigationUnavailableReason } = params;
  if (routePhase === 'completed') return 'completed';
  if (routePhase === 'route_selected') return 'route_preview';
  if (routePhase === 'route_active') return 'guidance_active';
  if (routePhase === 'alerting_or_degraded') {
    return offRouteDetected ? 'rerouting' : 'degraded';
  }
  if (navigationUnavailableReason === 'Guidance paused') return 'paused';
  return 'idle';
}

function buildSummary(params: {
  status: 'live' | 'fallback' | 'unavailable';
  source: VehicleDataSource;
  title: string | null;
  detail: string | null;
  stale?: boolean;
}): VehicleSurfacePresentationSummary {
  const stale = Boolean(params.stale);
  const availability = getVehicleSurfaceAvailability({
    status: params.status,
    source: params.source,
    stale,
  });

  return {
    availability,
    source: params.source,
    title: params.title,
    detail: params.detail,
    stale,
    fallbackUsed: availability === 'available_fallback',
  };
}

export function buildVehiclePresentationModel(params: {
  activeScreen: VehicleDisplayScreen;
  routePhase: VehicleRouteSessionState;
  navigationData: VehicleNavigationData;
  attitudeData: VehicleAttitudeData;
  resourceData: VehicleResourceData;
  weatherHazardData: VehicleWeatherHazardData;
  exitPlanData: VehicleExitPlanData;
}): ECSVehiclePresentationModel {
  const {
    activeScreen,
    routePhase,
    navigationData,
    attitudeData,
    resourceData,
    weatherHazardData,
    exitPlanData,
  } = params;

  const navigationSource: VehicleDataSource =
    navigationData.routeLine || navigationData.nextManeuver || navigationData.routeName
      ? 'ai_navigation'
      : 'none';
  const navigationSummary = buildSummary({
    status: navigationSource === 'none' ? 'unavailable' : 'live',
    source: navigationSource,
    title: navigationData.routeName ?? navigationData.statusLabel ?? null,
    detail: navigationData.nextManeuver ?? navigationData.unavailableReason,
  });

  const attitudeSummary = buildSummary({
    status: attitudeData.status,
    source: attitudeData.source,
    title:
      attitudeData.rollDeg != null && attitudeData.pitchDeg != null
        ? `Roll ${Math.round(attitudeData.rollDeg)}° • Pitch ${Math.round(attitudeData.pitchDeg)}°`
        : null,
    detail: attitudeData.supportLabel || attitudeData.unavailableReason,
  });

  const resourceSource = strongestSource([
    resourceData.fuelSource,
    resourceData.waterSource,
    resourceData.powerSource,
    resourceData.alternateFluidSource,
  ]);
  const resourceSummary = buildSummary({
    status: resourceData.status,
    source: resourceSource,
    title:
      resourceData.fuelPercent != null
        ? `Fuel ${resourceData.fuelPercent}%`
        : resourceData.waterRemaining != null
          ? `Water ${resourceData.waterRemaining} ${resourceData.waterUnit}`
          : null,
    detail: resourceData.supportLabel || resourceData.unavailableReason,
  });

  const weatherIsStale =
    weatherHazardData.source === 'cached' ||
    weatherHazardData.status === 'fallback';
  const weatherSummary = buildSummary({
    status: weatherHazardData.status,
    source: weatherHazardData.source,
    title: weatherHazardData.weatherSummary ?? weatherHazardData.condition,
    detail:
      weatherHazardData.alertSummary ??
      weatherHazardData.routeHazard ??
      weatherHazardData.unavailableReason,
    stale: weatherIsStale,
  });

  const exitSummary = buildSummary({
    status: exitPlanData.status,
    source: exitPlanData.source,
    title: exitPlanData.nearestBailoutLabel ?? exitPlanData.remotenessTier,
    detail: exitPlanData.supportLabel || exitPlanData.unavailableReason,
  });

  const sessionState = mapRoutePhaseToVehicleSessionState({
    routePhase,
    offRouteDetected: navigationData.offRouteDetected,
    navigationUnavailableReason: navigationData.unavailableReason,
  });

  const degradedReasons = [
    navigationSummary.availability === 'unavailable' ? navigationSummary.detail : null,
    attitudeSummary.availability === 'unavailable' ? attitudeSummary.detail : null,
    weatherSummary.availability === 'unavailable' || weatherSummary.stale
      ? weatherSummary.detail
      : null,
    exitSummary.availability === 'unavailable' ? exitSummary.detail : null,
    resourceSummary.availability === 'available_fallback' ? resourceSummary.detail : null,
  ].filter((reason): reason is string => Boolean(reason));

  const fallbackUsed = [
    navigationSummary,
    attitudeSummary,
    resourceSummary,
    weatherSummary,
    exitSummary,
  ].some((summary) => summary.fallbackUsed);

  return {
    generatedAt: new Date().toISOString(),
    sessionState,
    routePhase,
    activeScreen,
    fallbackUsed,
    degradedReasons,
    navigation: navigationSummary,
    attitude: attitudeSummary,
    resources: resourceSummary,
    weatherHazard: weatherSummary,
    exitPlan: exitSummary,
  };
}
