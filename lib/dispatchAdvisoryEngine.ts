import {
  createCadEventFromAiAdvisory,
  type DispatchCadEvent,
  type DispatchCadLinkedContext,
  type DispatchCadPriority,
} from './dispatchTypes';

export type DispatchAdvisoryKind =
  | 'severe_weather'
  | 'high_wind'
  | 'low_water_refill'
  | 'fuel_remote_segment'
  | 'vehicle_telemetry'
  | 'hazard_terrain'
  | 'recovery_traction'
  | 'route_exposure';

export type DispatchAdvisorySuggestedAction =
  | 'accept_suggestion'
  | 'dismiss'
  | 'create_ping'
  | 'create_hazard'
  | 'create_resource_update'
  | 'create_assist_request';

export type DispatchWeatherAlertInput = {
  id: string;
  title: string;
  severity: DispatchCadPriority;
  summary?: string;
};

export type DispatchResourceStateInput = {
  waterPercent?: number | null;
  fuelPercent?: number | null;
  foodStatus?: 'ok' | 'caution' | 'low' | 'critical' | null;
  medicalStatus?: 'ok' | 'caution' | 'low' | 'critical' | null;
  recoveryGearStatus?: 'ok' | 'caution' | 'low' | 'critical' | null;
};

export type DispatchVehicleTelemetryInput = {
  engineTempF?: number | null;
  tirePressureLow?: boolean | null;
  batteryChargingIssue?: boolean | null;
  engineAlert?: boolean | null;
  genericAlert?: string | null;
};

export type DispatchRouteContextInput = {
  activeSegmentName?: string | null;
  remoteSegmentAhead?: boolean | null;
  exposure?: 'low' | 'moderate' | 'high' | 'critical' | null;
};

export type DispatchTerrainContextInput = {
  difficulty?: 'low' | 'moderate' | 'high' | 'critical' | null;
  surface?: string | null;
};

export type DispatchAdvisoryContext = {
  expeditionId: string;
  now: string;
  weatherAlerts?: DispatchWeatherAlertInput[];
  windMph?: number | null;
  stormRisk?: 'none' | 'watch' | 'warning' | 'severe' | null;
  heatIndexF?: number | null;
  temperatureF?: number | null;
  precipitationChance?: number | null;
  terrain?: DispatchTerrainContextInput;
  route?: DispatchRouteContextInput;
  resources?: DispatchResourceStateInput;
  vehicleTelemetry?: DispatchVehicleTelemetryInput;
  recentCadEvents?: DispatchCadEvent[];
  mapContexts?: DispatchCadLinkedContext[];
};

export type DispatchAdvisory = {
  id: string;
  kind: DispatchAdvisoryKind;
  priority: DispatchCadPriority;
  title: string;
  summary: string;
  details: string;
  sources: string[];
  linkedContext: DispatchCadLinkedContext | null;
  suggestedActions: DispatchAdvisorySuggestedAction[];
  metadata: Record<string, unknown>;
};

const PRIORITY_SCORE: Record<DispatchCadPriority, number> = {
  normal: 100,
  high: 200,
  critical: 300,
};

export function generateDispatchAdvisories(context: DispatchAdvisoryContext): DispatchAdvisory[] {
  const advisories: DispatchAdvisory[] = [];
  const weatherContext = findMapContext(context.mapContexts, ['weather', 'storm', 'wind']);
  const routeContext = findMapContext(context.mapContexts, ['route', 'segment', 'exposure']) ?? context.recentCadEvents?.find((event) => event.type === 'route')?.linkedContext ?? null;
  const terrainContext = findMapContext(context.mapContexts, ['terrain', 'wash', 'shelf']) ?? context.recentCadEvents?.find((event) => event.type === 'hazard' || event.type === 'terrain')?.linkedContext ?? null;
  const resourceContext = findMapContext(context.mapContexts, ['water', 'fuel', 'source', 'stream', 'resource']);
  const vehicleContext = findMapContext(context.mapContexts, ['vehicle']) ?? context.recentCadEvents?.find((event) => event.type === 'vehicle' || event.type === 'assist')?.linkedContext ?? null;

  const severeWeatherAlert = context.weatherAlerts?.find((alert) => alert.severity === 'critical') ??
    context.weatherAlerts?.find((alert) => /severe|warning|storm/i.test(`${alert.title} ${alert.summary ?? ''}`));
  if (severeWeatherAlert || context.stormRisk === 'severe') {
    advisories.push({
      id: 'advisory-severe-weather',
      kind: 'severe_weather',
      priority: severeWeatherAlert?.severity === 'high' ? 'high' : 'critical',
      title: 'Severe weather warning',
      summary: severeWeatherAlert?.summary ?? 'Severe weather is active near the expedition area.',
      details: explainDispatchAdvisory('severe_weather', {
        alertTitle: severeWeatherAlert?.title,
        stormRisk: context.stormRisk,
      }),
      sources: ['weather alerts', 'storm risk'],
      linkedContext: weatherContext,
      suggestedActions: getAdvisorySuggestedActions('severe_weather'),
      metadata: { alertId: severeWeatherAlert?.id, stormRisk: context.stormRisk },
    });
  }

  if (typeof context.windMph === 'number' && context.windMph >= 35) {
    advisories.push({
      id: 'advisory-high-wind',
      kind: 'high_wind',
      priority: context.windMph >= 50 ? 'critical' : 'high',
      title: 'High wind warning',
      summary: `Wind is ${Math.round(context.windMph)} mph near exposed route terrain.`,
      details: explainDispatchAdvisory('high_wind', { windMph: context.windMph }),
      sources: ['wind', 'route exposure'],
      linkedContext: weatherContext ?? routeContext,
      suggestedActions: getAdvisorySuggestedActions('high_wind'),
      metadata: { windMph: context.windMph },
    });
  }

  if (typeof context.resources?.waterPercent === 'number' && context.resources.waterPercent <= 30) {
    const refillContext = findMapContext(context.mapContexts, ['stream', 'water source', 'water']);
    advisories.push({
      id: 'advisory-low-water-refill',
      kind: 'low_water_refill',
      priority: context.resources.waterPercent <= 15 ? 'critical' : 'high',
      title: 'Low water with refill opportunity',
      summary: refillContext
        ? `Water is ${Math.round(context.resources.waterPercent)}%; possible refill near ${refillContext.title}.`
        : `Water is ${Math.round(context.resources.waterPercent)}%; confirm reserve before continuing.`,
      details: explainDispatchAdvisory('low_water_refill', {
        waterPercent: context.resources.waterPercent,
        refillTitle: refillContext?.title,
      }),
      sources: ['resource state', 'known map context'],
      linkedContext: refillContext ?? resourceContext,
      suggestedActions: getAdvisorySuggestedActions('low_water_refill'),
      metadata: { waterPercent: context.resources.waterPercent, refillContextId: refillContext?.id },
    });
  }

  if (
    typeof context.resources?.fuelPercent === 'number' &&
    context.resources.fuelPercent <= 40 &&
    (context.route?.remoteSegmentAhead || context.route?.exposure === 'high' || context.route?.exposure === 'critical')
  ) {
    advisories.push({
      id: 'advisory-fuel-remote-segment',
      kind: 'fuel_remote_segment',
      priority: context.resources.fuelPercent <= 20 ? 'critical' : 'high',
      title: 'Fuel caution before remote segment',
      summary: `Fuel is ${Math.round(context.resources.fuelPercent)}% before ${context.route?.activeSegmentName ?? 'a remote route segment'}.`,
      details: explainDispatchAdvisory('fuel_remote_segment', {
        fuelPercent: context.resources.fuelPercent,
        segmentName: context.route?.activeSegmentName,
      }),
      sources: ['fuel state', 'route exposure'],
      linkedContext: routeContext,
      suggestedActions: getAdvisorySuggestedActions('fuel_remote_segment'),
      metadata: { fuelPercent: context.resources.fuelPercent, remoteSegmentAhead: context.route?.remoteSegmentAhead },
    });
  }

  const vehicle = context.vehicleTelemetry;
  const hasVehicleAlert = Boolean(vehicle?.engineAlert || vehicle?.genericAlert || vehicle?.tirePressureLow || vehicle?.batteryChargingIssue) ||
    (typeof vehicle?.engineTempF === 'number' && vehicle.engineTempF >= 220);
  if (vehicle && hasVehicleAlert) {
    const isCritical = Boolean(vehicle.engineAlert) || (typeof vehicle.engineTempF === 'number' && vehicle.engineTempF >= 240);
    advisories.push({
      id: 'advisory-vehicle-telemetry',
      kind: 'vehicle_telemetry',
      priority: isCritical ? 'critical' : 'high',
      title: 'Vehicle telemetry alert',
      summary: vehicle.genericAlert ?? (typeof vehicle.engineTempF === 'number'
        ? `Vehicle temperature is ${Math.round(vehicle.engineTempF)}F.`
        : 'Vehicle telemetry needs review before continuing.'),
      details: explainDispatchAdvisory('vehicle_telemetry', vehicle),
      sources: ['vehicle telemetry'],
      linkedContext: vehicleContext,
      suggestedActions: getAdvisorySuggestedActions('vehicle_telemetry'),
      metadata: { ...vehicle },
    });
  }

  const recentHazard = context.recentCadEvents?.find((event) => event.type === 'hazard' && isActiveCadEvent(event));
  const terrainRiskHigh = context.terrain?.difficulty === 'high' || context.terrain?.difficulty === 'critical';
  if (recentHazard && terrainRiskHigh) {
    advisories.push({
      id: 'advisory-hazard-terrain',
      kind: 'hazard_terrain',
      priority: context.terrain?.difficulty === 'critical' || recentHazard.priority === 'critical' ? 'critical' : 'high',
      title: 'Recent hazard plus terrain risk',
      summary: `${recentHazard.title} overlaps ${context.terrain?.difficulty} terrain conditions.`,
      details: explainDispatchAdvisory('hazard_terrain', {
        hazardTitle: recentHazard.title,
        terrainDifficulty: context.terrain?.difficulty,
        surface: context.terrain?.surface,
      }),
      sources: ['recent CAD events', 'terrain difficulty'],
      linkedContext: recentHazard.linkedContext ?? terrainContext,
      suggestedActions: getAdvisorySuggestedActions('hazard_terrain'),
      metadata: { hazardEventId: recentHazard.id, terrainDifficulty: context.terrain?.difficulty },
    });
  }

  const recoveryPattern = context.recentCadEvents?.filter((event) => (
    isActiveCadEvent(event) &&
    (event.type === 'assist' || event.type === 'hazard') &&
    /recovery|traction|stuck|wash|mud|sand|shelf/i.test(`${event.title} ${event.summary} ${event.details}`)
  )) ?? [];
  if (recoveryPattern.length > 0) {
    advisories.push({
      id: 'advisory-recovery-traction',
      kind: 'recovery_traction',
      priority: recoveryPattern.some((event) => event.priority === 'critical') ? 'critical' : 'high',
      title: 'Recovery assist pattern',
      summary: 'Recent CAD activity suggests traction caution before committing vehicles.',
      details: explainDispatchAdvisory('recovery_traction', {
        count: recoveryPattern.length,
      }),
      sources: ['recent CAD events', 'terrain context'],
      linkedContext: recoveryPattern[0].linkedContext ?? terrainContext,
      suggestedActions: getAdvisorySuggestedActions('recovery_traction'),
      metadata: { contributingEventIds: recoveryPattern.map((event) => event.id) },
    });
  }

  if (context.route?.exposure === 'high' || context.route?.exposure === 'critical') {
    advisories.push({
      id: 'advisory-route-exposure',
      kind: 'route_exposure',
      priority: context.route.exposure === 'critical' ? 'critical' : 'high',
      title: 'Route exposure warning',
      summary: `${context.route.activeSegmentName ?? 'Upcoming route segment'} has ${context.route.exposure} exposure.`,
      details: explainDispatchAdvisory('route_exposure', {
        exposure: context.route.exposure,
        segmentName: context.route.activeSegmentName,
      }),
      sources: ['route exposure', 'known map context'],
      linkedContext: routeContext,
      suggestedActions: getAdvisorySuggestedActions('route_exposure'),
      metadata: { routeExposure: context.route.exposure, segmentName: context.route.activeSegmentName },
    });
  }

  return advisories
    .map((advisory) => ({
      ...advisory,
      metadata: {
        ...advisory.metadata,
        expeditionId: context.expeditionId,
      },
    }))
    .sort((a, b) => scoreDispatchAdvisory(b) - scoreDispatchAdvisory(a));
}

export function scoreDispatchAdvisory(advisory: DispatchAdvisory): number {
  const sourceScore = advisory.sources.length * 5;
  const actionScore = advisory.suggestedActions.includes('create_hazard') ? 10 : 0;
  return PRIORITY_SCORE[advisory.priority] + sourceScore + actionScore;
}

export function getTopDispatchAdvisory(advisories: DispatchAdvisory[]): DispatchAdvisory | null {
  return [...advisories].sort((a, b) => scoreDispatchAdvisory(b) - scoreDispatchAdvisory(a))[0] ?? null;
}

export function createCadEventFromAdvisory(advisory: DispatchAdvisory, timestamp: string): DispatchCadEvent {
  return createCadEventFromAiAdvisory({
    id: `cad-${advisory.id}`,
    expeditionId: String(advisory.metadata.expeditionId ?? 'expedition-ruby-ridge'),
    timestamp,
    title: advisory.title,
    summary: advisory.summary,
    details: advisory.details,
    priority: advisory.priority,
    status: 'active',
    linkedContext: advisory.linkedContext,
    metadata: {
      ...advisory.metadata,
      advisoryId: advisory.id,
      advisoryKind: advisory.kind,
      sources: advisory.sources,
      suggestedActions: advisory.suggestedActions,
    },
  });
}

export function getAdvisorySuggestedActions(kind: DispatchAdvisoryKind): DispatchAdvisorySuggestedAction[] {
  switch (kind) {
    case 'low_water_refill':
    case 'fuel_remote_segment':
      return ['accept_suggestion', 'dismiss', 'create_ping', 'create_resource_update'];
    case 'vehicle_telemetry':
    case 'recovery_traction':
      return ['accept_suggestion', 'dismiss', 'create_ping', 'create_assist_request'];
    case 'severe_weather':
    case 'high_wind':
    case 'hazard_terrain':
    case 'route_exposure':
    default:
      return ['accept_suggestion', 'dismiss', 'create_ping', 'create_hazard'];
  }
}

export function explainDispatchAdvisory(kind: DispatchAdvisoryKind, data: Record<string, unknown>): string {
  switch (kind) {
    case 'severe_weather':
      return `Severe weather signal detected${data.alertTitle ? ` from ${data.alertTitle}` : ''}. Consider delaying exposed movement and keep updates inside Dispatch.`;
    case 'high_wind':
      return `Wind is elevated at ${Math.round(Number(data.windMph ?? 0))} mph. Exposed route, camp, and recovery operations may need additional caution.`;
    case 'low_water_refill':
      return `Water reserve is ${Math.round(Number(data.waterPercent ?? 0))}%${data.refillTitle ? ` with ${data.refillTitle} nearby` : ''}. Confirm refill plan before pushing farther from known water.`;
    case 'fuel_remote_segment':
      return `Fuel reserve is ${Math.round(Number(data.fuelPercent ?? 0))}% before ${data.segmentName ?? 'a remote route segment'}. Confirm turnback range and reserve margin.`;
    case 'vehicle_telemetry':
      return 'Vehicle telemetry is outside the normal operating envelope. Review engine, tire, charging, or generic vehicle alert before committing to harder terrain.';
    case 'hazard_terrain':
      return `Recent hazard activity overlaps ${data.terrainDifficulty ?? 'elevated'} terrain risk${data.surface ? ` on ${data.surface}` : ''}. Treat the next route choice as a deliberate go/no-go decision.`;
    case 'recovery_traction':
      return `Recent recovery or traction-related CAD activity (${data.count ?? 1} signal) suggests reducing pace and avoiding unnecessary vehicle commitment.`;
    case 'route_exposure':
      return `${data.segmentName ?? 'Upcoming route'} has ${data.exposure ?? 'elevated'} exposure. Confirm weather, traction, and bailout options before proceeding.`;
    default:
      return 'Dispatch advisory generated from expedition context.';
  }
}

function findMapContext(
  contexts: DispatchCadLinkedContext[] | undefined,
  keywords: string[],
): DispatchCadLinkedContext | null {
  return contexts?.find((context) => {
    const haystack = `${context.type} ${context.title} ${context.subtitle ?? ''}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
  }) ?? null;
}

function isActiveCadEvent(event: DispatchCadEvent): boolean {
  return event.status === 'new' || event.status === 'active' || event.status === 'queued' || event.status === 'failed';
}
