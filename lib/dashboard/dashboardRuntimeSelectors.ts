type DashboardWidgetData = Record<string, any> | null | undefined;

export type DashboardWidgetRenderSnapshot = {
  dashboardMode?: string | null;
  compact?: boolean;
  rollDeg?: number | null;
  pitchDeg?: number | null;
  sensorStatus?: string | null;
  sampleTimestampMs?: number | null;
  isCalibrated?: boolean;
  advancedMode?: boolean;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  gpsHeadingDeg?: number | null;
  gpsSpeedMph?: number | null;
  gpsHasFix?: boolean;
  gpsAccuracyM?: number | null;
  gpsAltitudeFt?: number | null;
  gpsTimestampMs?: number | null;
  expeditionHasActiveRoute?: boolean;
  expeditionRouteCompleted?: boolean;
  expeditionRouteLifecycleState?: string | null;
  expeditionId?: string | null;
  expeditionRouteLabel?: string | null;
  expeditionTeamMemberCount?: number | null;
  expeditionCampCount?: number | null;
  completedExpeditionRecord?: unknown;
  expeditionEcsOnline?: boolean;
};

type DashboardWidgetSlotLike = {
  widgetType?: string | null;
};

type ExpeditionStateLike = 'standby' | 'active' | 'paused' | 'complete' | string;

type ExpeditionRecordLike = {
  id?: string | null;
  state?: string | null;
  endTime?: string | null;
} | null;

type DashboardAssessmentContextLike = {
  expeditionId?: string | null;
  offlineMode?: boolean;
  route?: Record<string, any> | null;
  convoy?: Record<string, any> | null;
  camp?: Record<string, any> | null;
  logistics?: Record<string, any> | null;
  vehicles?: Array<Record<string, any>> | null;
};

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bucket(value: unknown, step: number): string {
  const number = finite(value);
  if (number == null) return '';
  return String(Math.round(number / step) * step);
}

function pointValue(value: any): any {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return value.value;
  }
  return value;
}

function arraySignature(values: unknown, limit = 8): string {
  if (!Array.isArray(values) || values.length === 0) return '0';
  const selected = values.slice(0, limit).map((value: any) => {
    if (value == null || typeof value !== 'object') return String(value ?? '');
    return [
      value.id ?? value.key ?? value.name ?? '',
      value.updatedAt ?? value.updated_at ?? value.timestamp ?? '',
      value.packed ?? '',
      value.weight_lbs ?? value.weightLbs ?? '',
      value.latitude == null ? '' : bucket(value.latitude, 0.0001),
      value.longitude == null ? '' : bucket(value.longitude, 0.0001),
    ].join(':');
  });
  return `${values.length}:${selected.join(',')}`;
}

function completedExpeditionSignature(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  return [
    record.id ?? '',
    record.state ?? '',
    record.endTime ?? '',
    record.distance ?? record.totalDistanceMiles ?? record.completedMiles ?? '',
    record.duration ?? record.totalDurationSeconds ?? record.durationSeconds ?? '',
  ].join(':');
}

export function selectDashboardGpsRenderKey(
  options?: DashboardWidgetRenderSnapshot,
  config: { includeHeading?: boolean; coordinateDecimals?: number } = {},
): string {
  const hasFix = options?.gpsHasFix === true;
  const latitude = finite(options?.gpsLatitude);
  const longitude = finite(options?.gpsLongitude);
  if (!hasFix || latitude == null || longitude == null) {
    return hasFix ? 'fix:pending' : 'no-fix';
  }

  const decimals = config.coordinateDecimals ?? 4;
  const heading = finite(options?.gpsHeadingDeg);
  return [
    latitude.toFixed(decimals),
    longitude.toFixed(decimals),
    bucket(options?.gpsSpeedMph, 2),
    bucket(options?.gpsAccuracyM, 5),
    config.includeHeading && heading != null
      ? String((Math.round((((heading % 360) + 360) % 360) / 15) * 15) % 360)
      : '',
  ].join(':');
}

function routeSignature(data: DashboardWidgetData, options?: DashboardWidgetRenderSnapshot): string {
  const route = data?.activeTrip;
  return [
    route?.id ?? '',
    route?.updated_at ?? route?.updatedAt ?? '',
    route?.active_mode ?? '',
    route?.route_distance_miles ?? '',
    options?.expeditionHasActiveRoute ?? '',
    options?.expeditionRouteCompleted ?? '',
    options?.expeditionRouteLifecycleState ?? '',
    options?.expeditionId ?? '',
    options?.expeditionRouteLabel ?? '',
    completedExpeditionSignature(options?.completedExpeditionRecord),
    arraySignature(data?.waypoints, 12),
  ].join('|');
}

function vehicleSignature(data: DashboardWidgetData): string {
  const context = data?.activeVehicleContext;
  return [
    context?.activeVehicleId ?? '',
    context?.profileSignature ?? '',
    context?.vehicle?.updated_at ?? context?.vehicle?.updatedAt ?? '',
    arraySignature(data?.loadItems, 16),
  ].join('|');
}

function telemetrySignature(data: DashboardWidgetData): string {
  const telemetry = data?.telemetry;
  const scanner = data?.telemetryScanner;
  return [
    telemetry?.hasData ?? '',
    telemetry?.freshnessLabel ?? '',
    telemetry?.isWithinGraceWindow ?? '',
    telemetry?.engineStatus ?? '',
    telemetry?.lastUpdatedText ?? '',
    scanner?.isConnected ?? '',
    scanner?.isConnecting ?? '',
    scanner?.isReconnecting ?? '',
    scanner?.error ?? '',
  ].join('|');
}

function powerSignature(data: DashboardWidgetData): string {
  const power = data?.powerAuthority ?? data?.bluPowerState;
  return [
    data?.powerFreshness ?? power?.freshness ?? '',
    data?.powerProviderLabel ?? power?.providerLabel ?? '',
    data?.powerDeviceLabel ?? power?.deviceLabel ?? '',
    bucket(power?.batteryPercent, 1),
    bucket(power?.estimatedRuntimeMinutes, 5),
    bucket(power?.outputWatts, 10),
    bucket(power?.inputWatts, 10),
    bucket(power?.solarInputWatts, 10),
    power?.updatedAt ?? power?.lastUpdatedAt ?? '',
  ].join('|');
}

function weatherSignature(data: DashboardWidgetData): string {
  const weather = data?.weatherSnapshot;
  const hourly = Array.isArray(weather?.hourly) ? weather.hourly : [];
  const daily = Array.isArray(weather?.daily) ? weather.daily : [];
  const forecastSignature = (values: any[]) => values.slice(0, 3).map((value) => [
    value?.date ?? value?.time ?? value?.dt ?? '',
    bucket(value?.temp ?? value?.temperature ?? value?.temp_day ?? value?.temp_max, 1),
    value?.weather_main ?? value?.condition ?? value?.weather_description ?? '',
  ].join(':')).join(',');
  return [
    weather?.status?.kind ?? '',
    weather?.status?.timestampMs ?? weather?.status?.cachedAt ?? weather?.fetchedAt ?? weather?.updatedAt ?? '',
    weather?.status?.source ?? weather?.provider?.source ?? '',
    weather?.provider?.id ?? weather?.provider?.name ?? '',
    bucket(weather?.current?.temp ?? weather?.current?.temperatureF, 1),
    bucket(weather?.current?.windSpeedMph, 2),
    arraySignature(weather?.alerts, 4),
    `${hourly.length}:${forecastSignature(hourly)}`,
    `${daily.length}:${forecastSignature(daily)}`,
  ].join('|');
}

function commandSignature(data: DashboardWidgetData): string {
  return [
    data?.aiState?.readiness ?? '',
    data?.aiState?.topSignal?.title ?? '',
    data?.aiState?.telemetryConfidence ?? '',
    data?.aiState?.weatherConfidence ?? '',
    data?.aiState?.routeConfidence ?? '',
    data?.dashboardCommandState?.primary?.id ?? '',
    data?.dashboardCommandState?.banner?.title ?? '',
    data?.dashboardCommandState?.compactSummary ?? '',
    data?.aiCompactLine ?? '',
    data?.aiTopSignalTitle ?? '',
    data?.syncStatus ?? '',
  ].join('|');
}

export function selectDashboardWidgetRenderKey(
  widgetType: string | null | undefined,
  widgetData: DashboardWidgetData,
  options?: DashboardWidgetRenderSnapshot,
): string {
  const type = widgetType ?? 'unassigned';
  const route = routeSignature(widgetData, options);
  const vehicle = vehicleSignature(widgetData);
  const telemetry = telemetrySignature(widgetData);
  const power = powerSignature(widgetData);
  const weather = weatherSignature(widgetData);
  const command = commandSignature(widgetData);
  const gps = selectDashboardGpsRenderKey(options, {
    includeHeading: type === 'navigate-surface',
  });

  switch (type) {
    case 'attitude-monitor':
      return [
        type,
        bucket(options?.rollDeg, 0.25),
        bucket(options?.pitchDeg, 0.25),
        options?.sensorStatus ?? '',
        options?.sampleTimestampMs ?? '',
        options?.isCalibrated ?? '',
        vehicle,
      ].join('|');
    case 'attitude-command':
      return [
        type,
        bucket(options?.rollDeg, 0.25),
        bucket(options?.pitchDeg, 0.25),
        options?.sensorStatus ?? '',
        options?.sampleTimestampMs ?? '',
        options?.isCalibrated ?? '',
        route,
        vehicle,
        telemetry,
        power,
        gps,
        weather,
      ].join('|');
    case 'vehicle-systems':
    case 'vehicle-health':
    case 'vehicle-telemetry':
      return [type, vehicle, telemetry, power].join('|');
    case 'ecs-power':
      return [type, power, vehicle].join('|');
    case 'hwy-forward-weather':
    case 'hwy-wind-monitor':
    case 'hwy-road-hazards':
    case 'hwy-sun-glare':
    case 'hwy-daylight-remaining':
    case 'hwy-elevation-profile':
      return [type, route, gps, weather, bucket(options?.gpsAltitudeFt, 10)].join('|');
    case 'navigate-surface':
      return [type, route, gps, command].join('|');
    case 'expedition-readiness':
    case 'expedition-status-summary':
    case 'status-overview':
    case 'operational-readiness':
    case 'mission-sustainment':
    case 'expedition-risk':
      return [
        type,
        route,
        vehicle,
        telemetry,
        power,
        weather,
        command,
        options?.expeditionTeamMemberCount ?? '',
        options?.expeditionCampCount ?? '',
        options?.expeditionEcsOnline ?? '',
      ].join('|');
    case 'route-progress':
    case 'progress':
      return [type, route, gps].join('|');
    case 'sustainability':
    case 'resource-forecast':
    case 'fuel-range':
    case 'water-projection':
    case 'loadout-readiness':
      return [type, route, vehicle, power, command].join('|');
    case 'remoteness':
    case 'route-confidence':
      return [type, route, gps, command].join('|');
    default:
      return [type, route, vehicle, telemetry, power, weather, command, gps].join('|');
  }
}

export function selectDashboardWidgetCollectionRenderKey(
  slots: readonly DashboardWidgetSlotLike[],
  widgetData: DashboardWidgetData,
  options?: DashboardWidgetRenderSnapshot,
): string {
  return slots
    .map((slot) => selectDashboardWidgetRenderKey(slot.widgetType, widgetData, options))
    .join('||');
}

export function selectDashboardExpeditionHubRenderKey(
  options: DashboardWidgetRenderSnapshot,
): string {
  return [
    options.expeditionHasActiveRoute ?? '',
    options.expeditionRouteCompleted ?? '',
    options.expeditionRouteLifecycleState ?? '',
    options.expeditionId ?? '',
    options.expeditionRouteLabel ?? '',
    options.expeditionTeamMemberCount ?? '',
    options.expeditionCampCount ?? '',
    options.expeditionEcsOnline ?? '',
    completedExpeditionSignature(options.completedExpeditionRecord),
  ].join('|');
}

export function selectDashboardGeofenceEnabled(
  activeVehicleId: string | null | undefined,
  expeditionState: ExpeditionStateLike,
): boolean {
  return Boolean(activeVehicleId) && (expeditionState === 'standby' || expeditionState === 'active');
}

export function selectDashboardExpeditionPresentation(input: {
  expeditionState: ExpeditionStateLike;
  currentRecord: ExpeditionRecordLike;
  retainedCompletedRecord: ExpeditionRecordLike;
  latestCompletedLog: unknown;
  completedGuidanceSummary: unknown;
  routeProgressCompleted: boolean;
}): { completedSummaryRecord: unknown; routeCompleted: boolean } {
  const active = input.expeditionState === 'active' || input.expeditionState === 'paused';
  const currentComplete = input.currentRecord?.state === 'complete';
  if (active) {
    return {
      completedSummaryRecord: null,
      routeCompleted: false,
    };
  }

  return {
    completedSummaryRecord:
      input.retainedCompletedRecord ??
      (currentComplete ? input.currentRecord : null) ??
      (input.expeditionState === 'standby'
        ? input.latestCompletedLog ?? input.completedGuidanceSummary
        : input.completedGuidanceSummary),
    routeCompleted:
      currentComplete ||
      Boolean(input.retainedCompletedRecord) ||
      input.routeProgressCompleted ||
      (input.expeditionState === 'standby' && Boolean(input.latestCompletedLog)),
  };
}

export function buildDashboardAssessmentRefreshKey(
  context: DashboardAssessmentContextLike,
): string {
  const route = context.route ?? {};
  const convoy = context.convoy ?? {};
  const camp = context.camp ?? {};
  const logistics = context.logistics ?? {};
  const vehicle = context.vehicles?.[0] ?? {};
  const currentLocation = pointValue(route.currentLocation) ?? {};

  return [
    context.expeditionId ?? '',
    context.offlineMode ?? '',
    pointValue(route.lifecycleState) ?? '',
    route.routeId ?? '',
    bucket(pointValue(route.progressPercent), 1),
    bucket(pointValue(route.distanceRemainingMiles), 0.1),
    bucket(pointValue(route.offRoute), 0.1),
    bucket(currentLocation?.latitude, 0.0001),
    bucket(currentLocation?.longitude, 0.0001),
    pointValue(convoy.communicationsStatus) ?? '',
    pointValue(convoy.teamMemberCount) ?? '',
    pointValue(convoy.activeMemberCount) ?? '',
    pointValue(camp.hasRouteCamps) ?? pointValue(camp.campCount) ?? '',
    pointValue(logistics.fuelLevelPercent) ?? '',
    bucket(pointValue(logistics.fuelRangeMiles), 1),
    bucket(pointValue(logistics.waterRemainingLiters), 1),
    bucket(pointValue(logistics.powerHoursRemaining), 0.25),
    vehicle.vehicleId ?? '',
    pointValue(vehicle.readinessStatus) ?? '',
    pointValue(vehicle.engineStatus) ?? '',
    pointValue(vehicle.disabled) ?? '',
    bucket(pointValue(vehicle.fuelLevelPercent), 1),
  ].join('|');
}
