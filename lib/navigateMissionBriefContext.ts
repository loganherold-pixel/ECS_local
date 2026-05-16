import type { ECSAIMissionBlock, ECSAILiveStateBridge } from './aiContextBuilder';
import type { MissionBrief, MissionBriefLine, MissionBriefSection } from './missionBriefEngine';

type BuildNavigateMissionBriefLiveStateArgs = {
  activeRun?: any;
  routeIntelligence?: any;
  terrainIntelligence?: any;
  campIntelSummary?: any;
  campDecision?: any;
  gps?: any;
  weather?: any;
  resourceForecast?: any;
  vehicle?: {
    id?: string | null;
    name?: string | null;
    nickname?: string | null;
    year?: string | number | null;
    make?: string | null;
    model?: string | null;
  } | null;
  navigation?: {
    cameraMode?: string | null;
    followUser?: boolean | null;
    mapStyleMode?: string | null;
    replayActive?: boolean | null;
    pinDropMode?: boolean | null;
  };
};

type NavigateMissionBriefLiveStateResult = {
  liveState: ECSAILiveStateBridge;
  signature: string;
};

const MAX_WAYPOINTS = 12;
const MAX_ROUTE_POINTS = 8;
const MAX_SEGMENTS = 10;
const MAX_ALERTS = 6;
const MAX_FORECAST = 8;

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function cleanString(value: unknown, maxLength = 180): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function compactCoordinate(point: any): any {
  const latitude = finiteNumber(point?.latitude ?? point?.lat);
  const longitude = finiteNumber(point?.longitude ?? point?.lng ?? point?.lon);
  if (latitude == null || longitude == null) return null;
  return {
    latitude,
    longitude,
    elevation:
      finiteNumber(point?.elevation)
      ?? finiteNumber(point?.elevationFt)
      ?? finiteNumber(point?.ele)
      ?? finiteNumber(point?.ele_m),
    name: cleanString(point?.name ?? point?.label, 80),
    time: cleanString(point?.time ?? point?.timestamp, 80),
  };
}

function compactArray<T>(items: unknown, mapItem: (item: any, index: number) => T | null, limit: number): T[] {
  if (!Array.isArray(items)) return [];
  const output: T[] = [];
  for (let index = 0; index < items.length && output.length < limit; index += 1) {
    const mapped = mapItem(items[index], index);
    if (mapped != null) output.push(mapped);
  }
  return output;
}

function sanitizeActiveRun(run: any): any {
  if (!run) return null;
  const stats = run.stats ?? {};
  return {
    id: cleanString(run.id, 100),
    title: cleanString(run.title ?? run.name, 120),
    name: cleanString(run.name ?? run.title, 120),
    source: cleanString(run.source, 80),
    created_at: cleanString(run.created_at, 80),
    updated_at: cleanString(run.updated_at, 80),
    distanceMiles:
      finiteNumber(run.distanceMiles)
      ?? finiteNumber(run.distance_miles)
      ?? finiteNumber(stats.distance_miles),
    distance:
      finiteNumber(run.distance)
      ?? finiteNumber(stats.distance_m)
      ?? finiteNumber(stats.distance_miles),
    stats: {
      distance_m: finiteNumber(stats.distance_m),
      distance_miles: finiteNumber(stats.distance_miles),
      distance_km: finiteNumber(stats.distance_km),
      point_count: finiteNumber(stats.point_count),
      start_lat: finiteNumber(stats.start_lat),
      start_lng: finiteNumber(stats.start_lng),
      end_lat: finiteNumber(stats.end_lat),
      end_lng: finiteNumber(stats.end_lng),
      elevation_gain_ft: finiteNumber(stats.elevation_gain_ft),
      elevation_loss_ft: finiteNumber(stats.elevation_loss_ft),
      min_ele_ft: finiteNumber(stats.min_ele_ft),
      max_ele_ft: finiteNumber(stats.max_ele_ft),
    },
    waypoints: compactArray(run.waypoints, compactCoordinate, MAX_WAYPOINTS),
    points: compactRoutePointSample(run.points),
    is_active: boolOrNull(run.is_active),
  };
}

function compactRoutePointSample(points: unknown): any[] {
  if (!Array.isArray(points) || points.length === 0) return [];
  if (points.length <= MAX_ROUTE_POINTS) {
    return compactArray(points, compactCoordinate, MAX_ROUTE_POINTS);
  }

  const sampled: any[] = [];
  const maxIndex = points.length - 1;
  for (let index = 0; index < MAX_ROUTE_POINTS; index += 1) {
    const sourceIndex = Math.round((index / (MAX_ROUTE_POINTS - 1)) * maxIndex);
    const point = compactCoordinate(points[sourceIndex]);
    if (point) sampled.push({ ...point, sourceIndex });
  }
  return sampled;
}

function sanitizeRouteIntelligence(route: any): any {
  if (!route) return null;
  return {
    id: cleanString(route.id, 100),
    sourceId: cleanString(route.sourceId, 100),
    routeName: cleanString(route.routeName ?? route.name, 140),
    totalDistanceMiles: finiteNumber(route.totalDistanceMiles ?? route.distanceMiles),
    estimatedDriveTimeHours: finiteNumber(route.estimatedDriveTimeHours),
    elevationGainFeet: finiteNumber(route.elevationGainFeet ?? route.elevationGainFt),
    elevationLossFeet: finiteNumber(route.elevationLossFeet ?? route.elevationLossFt),
    highestElevationFeet: finiteNumber(route.highestElevationFeet),
    lowestElevationFeet: finiteNumber(route.lowestElevationFeet),
    totalPoints: finiteNumber(route.totalPoints),
    segmentCount: finiteNumber(route.segmentCount ?? route.segments?.length),
    overallDifficulty: cleanString(route.overallDifficulty, 40),
    bounds: route.bounds
      ? {
          minLat: finiteNumber(route.bounds.minLat),
          maxLat: finiteNumber(route.bounds.maxLat),
          minLng: finiteNumber(route.bounds.minLng),
          maxLng: finiteNumber(route.bounds.maxLng),
        }
      : null,
    segments: compactArray(
      route.segments,
      (segment) => ({
        segmentIndex: finiteNumber(segment?.segmentIndex),
        distanceStart: finiteNumber(segment?.distanceStart),
        distanceEnd: finiteNumber(segment?.distanceEnd),
        difficulty: cleanString(segment?.difficulty, 40),
        avgElevation: finiteNumber(segment?.avgElevation),
        elevationGain: finiteNumber(segment?.elevationGain),
        maxGradePercent: finiteNumber(segment?.maxGradePercent),
        coordinates: Array.isArray(segment?.coordinates)
          ? [
              finiteNumber(segment.coordinates[0]),
              finiteNumber(segment.coordinates[1]),
            ]
          : null,
      }),
      MAX_SEGMENTS,
    ),
  };
}

function sanitizeTerrainIntelligence(terrain: any): any {
  if (!terrain) return null;
  return {
    id: cleanString(terrain.id, 100),
    routeIntelligenceId: cleanString(terrain.routeIntelligenceId, 100),
    routeName: cleanString(terrain.routeName, 140),
    steepSegments: finiteNumber(terrain.steepSegments),
    highElevationSegments: finiteNumber(terrain.highElevationSegments),
    mountainPassDetected: boolOrNull(terrain.mountainPassDetected),
    mountainPassCount: finiteNumber(terrain.mountainPassCount),
    highestElevationFeet: finiteNumber(terrain.highestElevationFeet),
    lowestElevationFeet: finiteNumber(terrain.lowestElevationFeet),
    warnings: compactArray(
      terrain.warnings,
      (warning) => ({
        warningType: cleanString(warning?.warningType, 80),
        message: cleanString(warning?.message, 180),
        segmentRange: cleanString(warning?.segmentRange, 80),
        metricValue: finiteNumber(warning?.metricValue),
        metricUnit: cleanString(warning?.metricUnit, 40),
      }),
      MAX_SEGMENTS,
    ),
  };
}

function sanitizeCampIntel(summary: any): any {
  if (!summary) return null;
  return {
    status: cleanString(summary.status, 80),
    confidence: finiteNumber(summary.confidence ?? summary.confidenceScore),
    headline: cleanString(summary.headline ?? summary.title, 160),
    summary: cleanString(summary.summary ?? summary.message, 240),
    candidateCount: finiteNumber(summary.candidateCount ?? summary.candidates?.length),
  };
}

function sanitizeCampDecision(decision: any): any {
  if (!decision) return null;
  return {
    available: boolOrNull(decision.available),
    campRecommendationType: cleanString(decision.campRecommendationType, 100),
    confidence: finiteNumber(decision.confidence ?? decision.confidenceScore),
    title: cleanString(decision.title, 160),
    message: cleanString(decision.message ?? decision.summary, 240),
  };
}

function sanitizeGps(gps: any): any {
  const position = gps?.position ?? null;
  return {
    isAvailable: boolOrNull(gps?.isAvailable),
    hasFix: boolOrNull(gps?.hasFix),
    isWatching: boolOrNull(gps?.isWatching),
    fixQuality: cleanString(gps?.fixQuality, 60),
    gpsStatus: cleanString(gps?.gpsStatus, 60),
    error: cleanString(gps?.error, 160),
    retryCount: finiteNumber(gps?.retryCount),
    permissionDenied: boolOrNull(gps?.permissionDenied),
    lastEmitTs: finiteNumber(gps?.lastEmitTs),
    position: position
      ? {
          latitude: finiteNumber(position.latitude),
          longitude: finiteNumber(position.longitude),
          speedMph: finiteNumber(position.speedMph ?? position.speed),
          accuracyM: finiteNumber(position.accuracyM ?? position.accuracy),
          altitudeFt: finiteNumber(position.altitudeFt ?? position.altitude),
          timestamp: finiteNumber(position.timestamp),
        }
      : null,
  };
}

function sanitizeWeatherPoint(weather: any): any {
  if (!weather) return null;
  const current = weather.current ?? weather;
  return {
    lat: finiteNumber(weather.lat),
    lng: finiteNumber(weather.lng),
    label: cleanString(weather.label ?? current?.location_name, 120),
    current: {
      temp: finiteNumber(current?.temp),
      weather_main: cleanString(current?.weather_main, 80),
      weather_description: cleanString(current?.weather_description, 120),
      wind_speed: finiteNumber(current?.wind_speed),
      wind_gust: finiteNumber(current?.wind_gust),
      wind_deg: finiteNumber(current?.wind_deg),
      visibility: finiteNumber(current?.visibility),
      dt: finiteNumber(current?.dt),
      sunrise: finiteNumber(current?.sunrise),
      sunset: finiteNumber(current?.sunset),
    },
    alerts: compactArray(weather.alerts, sanitizeWeatherAlert, MAX_ALERTS),
    forecast: compactArray(weather.forecast, sanitizeForecastPoint, MAX_FORECAST),
  };
}

function sanitizeWeatherAlert(alert: any): any {
  return {
    severity: cleanString(alert?.severity, 40),
    type: cleanString(alert?.type, 80),
    title: cleanString(alert?.title ?? alert?.event, 160),
    effective: cleanString(alert?.effective ?? alert?.start, 80),
    expires: cleanString(alert?.expires ?? alert?.end, 80),
  };
}

function sanitizeForecastPoint(point: any): any {
  return {
    dt: finiteNumber(point?.dt),
    temp: finiteNumber(point?.temp),
    pop: finiteNumber(point?.pop),
    wind_speed: finiteNumber(point?.wind_speed),
    weather_main: cleanString(point?.weather_main, 80),
    sunrise: finiteNumber(point?.sunrise),
    sunset: finiteNumber(point?.sunset),
  };
}

function sanitizeWeather(weather: any): any {
  const current = sanitizeWeatherPoint(weather?.current);
  const responseResults = compactArray(
    weather?.response?.results,
    sanitizeWeatherPoint,
    MAX_FORECAST,
  );
  return {
    current,
    response: responseResults.length > 0
      ? {
          results: responseResults,
          fetched_at: cleanString(weather?.response?.fetched_at, 80),
          units: cleanString(weather?.response?.units, 20),
        }
      : null,
    source: weather?.source === 'live' || weather?.source === 'cache' ? weather.source : 'none',
    staleness: cleanString(weather?.staleness, 40) ?? 'unknown',
    ageLabel: cleanString(weather?.ageLabel, 80),
    severity: cleanString(weather?.severity, 40) ?? 'none',
    summaryLabel: cleanString(weather?.summaryLabel, 180),
  };
}

function sanitizeResourceForecast(forecast: any): any {
  if (!forecast) return null;
  return {
    routeIntelligenceId: cleanString(forecast.routeIntelligenceId, 100),
    sufficiencyLevel: cleanString(forecast.sufficiencyLevel, 80),
    summary: cleanString(forecast.summary, 220),
    fuel: forecast.fuel
      ? {
          status: cleanString(forecast.fuel.status, 60),
          remainingPercent: finiteNumber(forecast.fuel.remainingPercent),
          rangeMiles: finiteNumber(forecast.fuel.rangeMiles),
        }
      : null,
    water: forecast.water
      ? {
          status: cleanString(forecast.water.status, 60),
          remainingPercent: finiteNumber(forecast.water.remainingPercent),
        }
      : null,
    power: forecast.power
      ? {
          status: cleanString(forecast.power.status, 60),
          remainingPercent: finiteNumber(forecast.power.remainingPercent),
          runtimeHours: finiteNumber(forecast.power.runtimeHours),
        }
      : null,
    advisories: compactArray(forecast.advisories, (item) => cleanString(item, 180), 6),
  };
}

function sanitizeVehicleLabel(vehicle: BuildNavigateMissionBriefLiveStateArgs['vehicle']): string | null {
  if (!vehicle) return null;
  const directName = cleanString(vehicle.name ?? vehicle.nickname, 120);
  if (directName) return directName;

  const year = cleanString(vehicle.year, 12);
  const make = cleanString(vehicle.make, 60);
  const model = cleanString(vehicle.model, 60);
  return [year, make, model].filter(Boolean).join(' ') || cleanString(vehicle.id, 80);
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, nested) => {
    if (typeof nested === 'object' && nested !== null) {
      if (seen.has(nested)) return '[Circular]';
      seen.add(nested);
      if (Array.isArray(nested)) return nested;
      return Object.keys(nested)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (nested as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    if (typeof nested === 'function') return '[Function]';
    return nested;
  });
}

export function buildNavigateMissionBriefLiveState(
  args: BuildNavigateMissionBriefLiveStateArgs,
): NavigateMissionBriefLiveStateResult {
  const liveState: ECSAILiveStateBridge = {
    route: {
      activeRun: sanitizeActiveRun(args.activeRun) as any,
      routeIntelligence: sanitizeRouteIntelligence(args.routeIntelligence) as any,
      terrainIntelligence: sanitizeTerrainIntelligence(args.terrainIntelligence) as any,
      campIntel: sanitizeCampIntel(args.campIntelSummary) as any,
      campDecision: sanitizeCampDecision(args.campDecision) as any,
    },
    environment: {
      gps: sanitizeGps(args.gps) as any,
      weather: sanitizeWeather(args.weather) as any,
    },
    resources: {
      forecast: sanitizeResourceForecast(args.resourceForecast) as any,
    },
    navigation: {
      cameraMode: args.navigation?.cameraMode ?? null,
      followUser: args.navigation?.followUser ?? null,
      mapExpanded: null,
      mapStyleMode: args.navigation?.mapStyleMode ?? null,
      replayActive: args.navigation?.replayActive ?? null,
      pinDropMode: args.navigation?.pinDropMode ?? null,
    },
    flags: {
      skipWeatherFetch: true,
    },
    summary: {
      vehicleName: sanitizeVehicleLabel(args.vehicle),
    },
  };

  return {
    liveState,
    signature: stableStringify(liveState),
  };
}

function fallbackLine(id: string, text: string, priority = 10): MissionBriefLine {
  return { id, text, mode: 'advisory', priority };
}

function fallbackSection(title: string, summary: string, line: string): MissionBriefSection {
  return {
    title,
    summary,
    status: 'yellow',
    lines: [fallbackLine(`${title.toLowerCase().replace(/\s+/g, '-')}-fallback`, line)],
  };
}

export function buildNavigateMissionBriefFallback(reason: string): MissionBrief {
  const generatedAt = new Date().toISOString();
  const safeReason = cleanString(reason, 160) ?? 'Mission brief context unavailable';
  const routeSection = fallbackSection(
    'Route',
    'Route briefing is limited.',
    'Build or select a route to refresh route-specific guidance.',
  );
  const environmentSection = fallbackSection(
    'Environment',
    'Environment briefing is limited.',
    'Confirm weather, GPS, and offline data before departure.',
  );
  const resourcesSection = fallbackSection(
    'Resources',
    'Resource briefing is limited.',
    'Confirm fuel, water, power, and loadout status manually.',
  );
  const systemsSection = fallbackSection(
    'Systems',
    'System briefing is limited.',
    'ECS is using a limited brief because context generation failed.',
  );
  const missionSection = fallbackSection('Mission', 'Brief limited.', safeReason);
  const operatorTasks = [
    {
      id: 'navigate-brief-fallback-task',
      title: 'Verify route context manually',
      detail: safeReason,
      urgency: 'next',
      category: 'mission',
    },
  ] as MissionBrief['operatorTasks'];

  return {
    generatedAt,
    status: 'yellow',
    confidence: {
      level: 'low',
      score: 20,
      label: 'Low confidence',
      shortReason: 'Limited brief',
      reasons: ['missing_required_inputs'],
      sourceSummary: { live: 0, manual: 0, inferred: 1, stale: 0, missing: 1 },
    } as any,
    trust: null,
    priority: null,
    operations: null,
    phase: null,
    explanation: null,
    missionScenario: null,
    headline: 'Mission brief limited',
    summary: 'ECS could not build the full Navigate mission brief. Core navigation remains available.',
    commandIntent: 'Verify route and conditions manually before committing.',
    operatorNote: safeReason,
    keyRisks: [safeReason],
    recommendations: ['Refresh route, weather, and GPS context before departure.'],
    advisories: ['Mission brief limited.'],
    missionSection,
    routeSection,
    environmentSection,
    resourcesSection,
    systemsSection,
    dashboardBarMessages: [fallbackLine('navigate-brief-limited', 'Mission brief limited.')],
    compactLabel: 'Brief limited',
    priorityMessage: 'Verify route context manually.',
    compactTone: 'watch',
    changeSummary: null,
    powerMeta: null,
    operatorTasks,
    operatorTaskLanes: [
      {
        id: 'mission',
        label: 'Mission',
        highestUrgency: 'next',
        tasks: operatorTasks,
        count: operatorTasks.length,
      },
    ],
    primaryTask: operatorTasks[0],
    primaryLane: null,
    taskDelta: null,
    laneDelta: null,
    surfaceRouting: null,
    autonomousAssist: {
      enabled: false,
      summary: 'Human review required.',
      mode: 'suggest_only',
      primaryRule: null,
      rules: [],
      suggestedSurface: 'none',
      requiresConfirmation: true,
      eventKey: 'navigate-brief-fallback',
    },
  };
}
