import type {
  ECS5ProviderAdapterRegistry,
  SourceObservation,
} from './ecs5ObservationPipeline';

export type RouteWeatherRiskLevel = 'low' | 'moderate' | 'high' | 'severe' | 'unknown';
export type FireWeatherContext = 'low' | 'elevated' | 'critical' | 'unknown';

export interface RouteWeatherCoordinate {
  lat: number;
  lon: number;
}

export interface RouteWeatherSamplePoint extends RouteWeatherCoordinate {
  distanceMiles: number;
  index: number;
}

export interface RouteWeatherSamplerInput {
  routeId: string;
  geometry: RouteWeatherCoordinate[];
  tripStartTime: string;
  estimatedRouteDurationMinutes?: number | null;
  sampleIntervalMiles?: number;
  maxSamplePoints?: number;
  providerPriorityList?: string[];
  units?: 'imperial' | 'metric' | 'standard';
  fixturePayloadBySample?: (point: RouteWeatherSamplePoint, index: number, providerId: string) => unknown;
  now?: Date;
}

export interface RouteSegmentWeatherRisk {
  segmentId: string;
  samplePoint: RouteWeatherCoordinate;
  estimatedArrivalAt: string | null;
  weatherRiskLabel: RouteWeatherRiskLevel;
  riskReasons: string[];
  precipRisk: RouteWeatherRiskLevel;
  snowRisk: RouteWeatherRiskLevel;
  windRisk: RouteWeatherRiskLevel;
  temperatureRisk: RouteWeatherRiskLevel;
  thunderstormRisk: RouteWeatherRiskLevel;
  floodRisk: RouteWeatherRiskLevel;
  winterWeatherRisk: RouteWeatherRiskLevel;
  fireWeatherContextFromForecast: FireWeatherContext;
  smokeAqiRisk?: RouteWeatherRiskLevel;
  crewHealthRisk?: RouteWeatherRiskLevel;
  aqi?: number | null;
  blackIceInferred?: boolean;
  confidenceScore: number;
  evidenceObservationIds: string[];
}

export interface RouteWeatherSamplerResult {
  routeId: string;
  generatedAt: string;
  samplePoints: RouteWeatherSamplePoint[];
  segmentRisks: RouteSegmentWeatherRisk[];
  providerWarnings: string[];
}

const EARTH_RADIUS_MI = 3958.8;

export async function sampleRouteWeatherRisk(
  input: RouteWeatherSamplerInput,
  adapterRegistry: ECS5ProviderAdapterRegistry,
): Promise<RouteWeatherSamplerResult> {
  const now = input.now ?? new Date();
  const samplePoints = sampleRouteGeometry(input.geometry, {
    intervalMiles: input.sampleIntervalMiles ?? 10,
    maxSamplePoints: input.maxSamplePoints ?? 12,
  });
  const providerWarnings: string[] = [];
  const providerPriority = input.providerPriorityList?.length
    ? input.providerPriorityList
    : ['nws', 'openweather_onecall', 'airnow'];

  const segmentRisks: RouteSegmentWeatherRisk[] = [];
  for (let index = 0; index < samplePoints.length; index += 1) {
    const point = samplePoints[index];
    const estimatedArrivalAt = estimateArrivalAt(
      input.tripStartTime,
      point.distanceMiles,
      samplePoints[samplePoints.length - 1]?.distanceMiles ?? 0,
      input.estimatedRouteDurationMinutes ?? null,
    );
    let observations: SourceObservation[] = [];
    for (const providerId of providerPriority) {
      const fixturePayload = input.fixturePayloadBySample?.(point, index, providerId);
      try {
        const result = await adapterRegistry.runAdapter(providerId, {
          lat: point.lat,
          lon: point.lon,
          units: input.units ?? 'imperial',
          fixturePayload,
          timeWindow: estimatedArrivalAt ?? input.tripStartTime,
        }, {
          fixtureMode: fixturePayload != null,
          now,
        });
        if (result.warnings.length) providerWarnings.push(...result.warnings);
        if (result.observations.length > 0) {
          observations = observations.concat(result.observations);
        }
      } catch (error: any) {
        providerWarnings.push(`${providerId}: ${error?.message ?? 'provider failed'}`);
      }
    }
    segmentRisks.push(buildSegmentWeatherRisk({
      routeId: input.routeId,
      point,
      estimatedArrivalAt,
      observations,
    }));
  }

  return {
    routeId: input.routeId,
    generatedAt: now.toISOString(),
    samplePoints,
    segmentRisks,
    providerWarnings: dedupe(providerWarnings),
  };
}

export function sampleRouteGeometry(
  geometry: RouteWeatherCoordinate[],
  options: { intervalMiles: number; maxSamplePoints: number },
): RouteWeatherSamplePoint[] {
  const valid = geometry.filter(isValidPoint);
  if (valid.length === 0) return [];
  if (valid.length === 1) return [{ ...valid[0], distanceMiles: 0, index: 0 }];

  const cumulative = [0];
  for (let index = 1; index < valid.length; index += 1) {
    cumulative[index] = cumulative[index - 1] + distanceMiles(valid[index - 1], valid[index]);
  }
  const total = cumulative[cumulative.length - 1];
  const interval = Math.max(0.1, options.intervalMiles);
  const targetDistances: number[] = [0];
  for (let distance = interval; distance < total; distance += interval) {
    targetDistances.push(distance);
    if (targetDistances.length >= Math.max(1, options.maxSamplePoints) - 1) break;
  }
  if (targetDistances[targetDistances.length - 1] !== total && targetDistances.length < options.maxSamplePoints) {
    targetDistances.push(total);
  }

  return targetDistances.slice(0, options.maxSamplePoints).map((target, index) => ({
    ...interpolatePointAtDistance(valid, cumulative, target),
    distanceMiles: Number(target.toFixed(2)),
    index,
  }));
}

export function buildSegmentWeatherRisk(input: {
  routeId: string;
  point: RouteWeatherSamplePoint;
  estimatedArrivalAt: string | null;
  observations: SourceObservation[];
}): RouteSegmentWeatherRisk {
  if (input.observations.length === 0) {
    return unknownRisk(input, 'Provider weather data unavailable for this sample point.');
  }

  const evidenceObservationIds = input.observations.map((observation) => observation.id);
  const records = extractWeatherRecords(input.observations, input.estimatedArrivalAt);
  const alerts = summarizeWeatherAlerts(input.observations);
  const smokeAqi = summarizeSmokeAqi(input.observations);
  if (records.length === 0) {
    if (smokeAqi.risk !== 'unknown') {
      return smokeOnlyRisk(input, smokeAqi, evidenceObservationIds);
    }
    if (alerts.weatherRisk !== 'low' || alerts.fireWeatherContext !== 'low') {
      return alertOnlyRisk(input, alerts, evidenceObservationIds);
    }
    return unknownRisk(input, 'No usable forecast records for estimated arrival time.');
  }

  const metrics = summarizeWeatherMetrics(records);
  const precipRisk = maxRisk([riskFromPrecip(metrics.rainMm, metrics.weatherText), alerts.precipRisk]);
  const snowRisk = riskFromSnow(metrics.snowMm, metrics.weatherText);
  const windRisk = maxRisk([riskFromWind(metrics.windMph), alerts.windRisk]);
  const temperatureRisk = riskFromTemp(metrics.tempF);
  const thunderstormRisk = maxRisk([/thunderstorm|lightning/i.test(metrics.weatherText) ? 'high' : 'low', alerts.thunderstormRisk]);
  const floodRisk = maxRisk([precipRisk === 'severe' ? 'severe' : precipRisk === 'high' ? 'high' : 'low', alerts.floodRisk]);
  const blackIceInferred = metrics.tempF != null &&
    metrics.tempF <= 32 &&
    (metrics.rainMm > 0 || metrics.snowMm > 0 || /freezing|sleet|ice/i.test(metrics.weatherText));
  const winterWeatherRisk = maxRisk([
    snowRisk,
    blackIceInferred ? 'moderate' : 'low',
    /freezing|ice|sleet/i.test(metrics.weatherText) ? 'high' : 'low',
    alerts.winterWeatherRisk,
  ]);
  const fireWeatherContextFromForecast = maxFireWeatherContext([
    inferFireWeatherContext(metrics),
    alerts.fireWeatherContext,
  ]);
  const weatherRiskLabel = maxRisk([
    precipRisk,
    snowRisk,
    windRisk,
    temperatureRisk,
    thunderstormRisk,
    floodRisk,
    winterWeatherRisk,
    fireWeatherContextFromForecast === 'critical' ? 'high' : fireWeatherContextFromForecast === 'elevated' ? 'moderate' : 'low',
    alerts.weatherRisk,
    smokeAqi.risk,
  ]);
  const riskReasons = buildRiskReasons({
    metrics,
    precipRisk,
    snowRisk,
    windRisk,
    temperatureRisk,
    thunderstormRisk,
    floodRisk,
    winterWeatherRisk,
    fireWeatherContextFromForecast,
    blackIceInferred,
    alertReasons: alerts.reasons,
    smokeReasons: smokeAqi.reasons,
  });
  const confidenceScore = Math.round(
    input.observations.reduce((sum, observation) => sum + observation.confidenceScore, 0) / input.observations.length,
  );

  return {
    segmentId: `${input.routeId}:weather:${input.point.index}`,
    samplePoint: { lat: input.point.lat, lon: input.point.lon },
    estimatedArrivalAt: input.estimatedArrivalAt,
    weatherRiskLabel,
    riskReasons,
    precipRisk,
    snowRisk,
    windRisk,
    temperatureRisk,
    thunderstormRisk,
    floodRisk,
    winterWeatherRisk,
    fireWeatherContextFromForecast,
    smokeAqiRisk: smokeAqi.risk,
    crewHealthRisk: maxRisk([temperatureRisk, smokeAqi.risk]),
    aqi: smokeAqi.aqi,
    ...(blackIceInferred ? { blackIceInferred: true } : {}),
    confidenceScore,
    evidenceObservationIds,
  };
}

function smokeOnlyRisk(
  input: {
    routeId: string;
    point: RouteWeatherSamplePoint;
    estimatedArrivalAt: string | null;
  },
  smokeAqi: ReturnType<typeof summarizeSmokeAqi>,
  evidenceObservationIds: string[],
): RouteSegmentWeatherRisk {
  return {
    segmentId: `${input.routeId}:weather:${input.point.index}`,
    samplePoint: { lat: input.point.lat, lon: input.point.lon },
    estimatedArrivalAt: input.estimatedArrivalAt,
    weatherRiskLabel: smokeAqi.risk,
    riskReasons: smokeAqi.reasons.length ? smokeAqi.reasons : ['Smoke/AQI observation affects crew health risk.'],
    precipRisk: 'unknown',
    snowRisk: 'unknown',
    windRisk: 'unknown',
    temperatureRisk: 'unknown',
    thunderstormRisk: 'unknown',
    floodRisk: 'unknown',
    winterWeatherRisk: 'unknown',
    fireWeatherContextFromForecast: 'unknown',
    smokeAqiRisk: smokeAqi.risk,
    crewHealthRisk: smokeAqi.risk,
    aqi: smokeAqi.aqi,
    confidenceScore: 82,
    evidenceObservationIds,
  };
}

function alertOnlyRisk(
  input: {
    routeId: string;
    point: RouteWeatherSamplePoint;
    estimatedArrivalAt: string | null;
  },
  alerts: ReturnType<typeof summarizeWeatherAlerts>,
  evidenceObservationIds: string[],
): RouteSegmentWeatherRisk {
  return {
    segmentId: `${input.routeId}:weather:${input.point.index}`,
    samplePoint: { lat: input.point.lat, lon: input.point.lon },
    estimatedArrivalAt: input.estimatedArrivalAt,
    weatherRiskLabel: alerts.weatherRisk,
    riskReasons: alerts.reasons.length ? alerts.reasons : ['Weather alert intersects this route sample.'],
    precipRisk: alerts.precipRisk,
    snowRisk: 'unknown',
    windRisk: alerts.windRisk,
    temperatureRisk: 'unknown',
    thunderstormRisk: alerts.thunderstormRisk,
    floodRisk: alerts.floodRisk,
    winterWeatherRisk: alerts.winterWeatherRisk,
    fireWeatherContextFromForecast: alerts.fireWeatherContext,
    confidenceScore: 88,
    evidenceObservationIds,
  };
}

function extractWeatherRecords(observations: SourceObservation[], estimatedArrivalAt: string | null): Record<string, any>[] {
  const targetMs = estimatedArrivalAt ? Date.parse(estimatedArrivalAt) : NaN;
  const records: Record<string, any>[] = [];
  for (const observation of observations.filter((item) => item.subjectType === 'weather_forecast')) {
    const payload = observation.normalizedPayload as any;
    if (payload?.current) records.push(payload.current);
    for (const hourly of payload?.hourly ?? []) records.push(hourly);
    for (const daily of payload?.daily ?? []) records.push(daily);
  }
  if (!Number.isFinite(targetMs)) return records.slice(0, 8);
  return records
    .map((record) => ({ record, distance: Math.abs((record.dt ? record.dt * 1000 : Date.parse(record.date ?? '')) - targetMs) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4)
    .map((item) => item.record);
}

function summarizeWeatherAlerts(observations: SourceObservation[]) {
  let weatherRisk: RouteWeatherRiskLevel = 'low';
  let precipRisk: RouteWeatherRiskLevel = 'low';
  let floodRisk: RouteWeatherRiskLevel = 'low';
  let winterWeatherRisk: RouteWeatherRiskLevel = 'low';
  let thunderstormRisk: RouteWeatherRiskLevel = 'low';
  let windRisk: RouteWeatherRiskLevel = 'low';
  let fireWeatherContext: FireWeatherContext = 'low';
  const reasons: string[] = [];

  for (const observation of observations.filter((item) => item.subjectType === 'weather_alert')) {
    const payload = observation.normalizedPayload as any;
    const text = [
      payload?.event,
      payload?.headline,
      payload?.severity,
      payload?.certainty,
      payload?.urgency,
      payload?.description,
      payload?.instruction,
    ].filter(Boolean).join(' ');
    const official = observation.providerId === 'nws' || observation.sourceType === 'federal_agency' || observation.sourceType === 'official_api';
    const severity = String(payload?.severity ?? '').toLowerCase();
    const baseAlertRisk: RouteWeatherRiskLevel = /extreme/i.test(severity) ? 'severe' : /severe/i.test(severity) ? 'high' : /moderate/i.test(severity) ? 'moderate' : official ? 'moderate' : 'low';

    if (/red flag|fire weather/i.test(text)) {
      fireWeatherContext = maxFireWeatherContext([fireWeatherContext, /extreme|severe|warning/i.test(text) ? 'critical' : 'elevated']);
      weatherRisk = maxRisk([weatherRisk, baseAlertRisk, 'high']);
      reasons.push(`${official ? 'Official NWS' : 'Weather'} fire-weather alert raises fire-weather context; this is not an active fire status.`);
    }
    if (/flood|flash flood|areal flood|hydrologic/i.test(text)) {
      floodRisk = maxRisk([floodRisk, baseAlertRisk, 'high']);
      precipRisk = maxRisk([precipRisk, 'moderate']);
      weatherRisk = maxRisk([weatherRisk, baseAlertRisk, 'high']);
      reasons.push('Flood-related weather alert may require bailout route reevaluation.');
    }
    if (/winter storm|blizzard|ice storm|snow squall|freezing rain|winter weather/i.test(text)) {
      winterWeatherRisk = maxRisk([winterWeatherRisk, baseAlertRisk, 'high']);
      weatherRisk = maxRisk([weatherRisk, baseAlertRisk, 'high']);
      reasons.push('Winter weather alert may require route and bailout reevaluation.');
    }
    if (/high wind|wind advisory|dust storm/i.test(text)) {
      windRisk = maxRisk([windRisk, baseAlertRisk, 'high']);
      weatherRisk = maxRisk([weatherRisk, baseAlertRisk, 'high']);
      reasons.push('High wind alert may affect exposed travel, towing, and recovery options.');
    }
    if (/severe thunderstorm|tornado|lightning/i.test(text)) {
      thunderstormRisk = maxRisk([thunderstormRisk, baseAlertRisk, 'high']);
      weatherRisk = maxRisk([weatherRisk, baseAlertRisk, 'high']);
      reasons.push('Severe convective weather alert intersects this route sample.');
    }
  }

  return {
    weatherRisk,
    precipRisk,
    floodRisk,
    winterWeatherRisk,
    thunderstormRisk,
    windRisk,
    fireWeatherContext,
    reasons: dedupe(reasons),
  };
}

function summarizeSmokeAqi(observations: SourceObservation[]) {
  let risk: RouteWeatherRiskLevel = 'unknown';
  let aqi: number | null = null;
  let category: string | null = null;
  const reasons: string[] = [];

  for (const observation of observations.filter((item) => item.subjectType === 'smoke_aqi')) {
    const payload = observation.normalizedPayload as any;
    const candidateAqi = toNumber(payload?.aqi);
    const candidateCategory = typeof payload?.category === 'string' ? payload.category : null;
    const candidateRisk = riskFromAqi(candidateAqi, candidateCategory);
    risk = maxRisk([risk, candidateRisk]);
    if (candidateAqi != null && (aqi == null || candidateAqi > aqi)) aqi = candidateAqi;
    if (candidateCategory) category = candidateCategory;
  }

  if (risk === 'high' || risk === 'severe') {
    reasons.push(`${category ?? 'Elevated'} AQI/smoke affects crew health risk and may warrant delay, alternate routing, or bailout reevaluation.`);
  } else if (risk === 'moderate') {
    reasons.push('Moderate AQI/smoke may affect sensitive crew members; verify exposure before committing to remote segments.');
  }
  if (risk !== 'unknown') {
    reasons.push('AQI/smoke does not imply legal closure.');
  }

  return { risk, aqi, category, reasons: dedupe(reasons) };
}

function summarizeWeatherMetrics(records: Record<string, any>[]) {
  const text = records.map((record) => {
    const weather = Array.isArray(record.weather) ? record.weather : [];
    return [
      record.weather_main,
      record.weather_description,
      ...weather.map((item: any) => `${item?.main ?? ''} ${item?.description ?? ''}`),
      record.summary,
    ].filter(Boolean).join(' ');
  }).join(' ');
  const rainMm = Math.max(...records.map((record) => toNumber(record.rain?.['1h'] ?? record.rain ?? record.rain_total) ?? 0), 0);
  const snowMm = Math.max(...records.map((record) => toNumber(record.snow?.['1h'] ?? record.snow ?? record.snow_total) ?? 0), 0);
  const windMph = Math.max(...records.map((record) => toNumber(record.wind_speed ?? record.wind_gust ?? record.wind_max) ?? 0), 0);
  const tempF = firstNumber(records.map((record) => record.temp ?? record.temp_day ?? record.temp_max));
  const humidity = firstNumber(records.map((record) => record.humidity));
  const pop = Math.max(...records.map((record) => toNumber(record.pop) ?? 0), 0);
  return { rainMm, snowMm, windMph, tempF, humidity, pop, weatherText: text };
}

function riskFromPrecip(rainMm: number, text = ''): RouteWeatherRiskLevel {
  if (rainMm >= 25) return 'severe';
  if (rainMm >= 10) return 'high';
  if (rainMm >= 3) return 'moderate';
  if (/heavy rain|excessive rainfall|flash flood|flood watch|flood warning/i.test(text)) return 'high';
  if (/rain|showers/i.test(text)) return 'moderate';
  return 'low';
}

function riskFromSnow(snowMm: number, text: string): RouteWeatherRiskLevel {
  if (snowMm >= 75) return 'severe';
  if (snowMm >= 20 || /heavy snow|blizzard/i.test(text)) return 'high';
  if (snowMm > 0 || /snow|sleet|freezing/i.test(text)) return 'moderate';
  return 'low';
}

function riskFromWind(windMph: number): RouteWeatherRiskLevel {
  if (windMph >= 55) return 'severe';
  if (windMph >= 35) return 'high';
  if (windMph >= 20) return 'moderate';
  return 'low';
}

function riskFromTemp(tempF: number | null): RouteWeatherRiskLevel {
  if (tempF == null) return 'unknown';
  if (tempF >= 110 || tempF <= 5) return 'severe';
  if (tempF >= 100 || tempF <= 15) return 'high';
  if (tempF >= 90 || tempF <= 32) return 'moderate';
  return 'low';
}

function riskFromAqi(aqi: number | null, categoryName?: string | null): RouteWeatherRiskLevel {
  const category = String(categoryName ?? '').toLowerCase();
  if (category.includes('hazardous')) return 'severe';
  if (category.includes('very unhealthy')) return 'severe';
  if (category === 'unhealthy' || category.includes('unhealthy for everyone')) return 'high';
  if (category.includes('sensitive')) return 'moderate';
  if (category.includes('moderate')) return 'moderate';
  if (category.includes('good')) return 'low';
  if (aqi == null) return 'unknown';
  if (aqi >= 201) return 'severe';
  if (aqi >= 151) return 'high';
  if (aqi >= 51) return 'moderate';
  return 'low';
}

function inferFireWeatherContext(metrics: ReturnType<typeof summarizeWeatherMetrics>): FireWeatherContext {
  if (metrics.tempF == null || metrics.humidity == null) return 'unknown';
  if (metrics.tempF >= 100 && metrics.windMph >= 30 && metrics.humidity <= 15 && metrics.rainMm < 1) return 'critical';
  if (metrics.tempF >= 90 && metrics.windMph >= 20 && metrics.humidity <= 25 && metrics.rainMm < 2) return 'elevated';
  return 'low';
}

function buildRiskReasons(input: {
  metrics: ReturnType<typeof summarizeWeatherMetrics>;
  precipRisk: RouteWeatherRiskLevel;
  snowRisk: RouteWeatherRiskLevel;
  windRisk: RouteWeatherRiskLevel;
  temperatureRisk: RouteWeatherRiskLevel;
  thunderstormRisk: RouteWeatherRiskLevel;
  floodRisk: RouteWeatherRiskLevel;
  winterWeatherRisk: RouteWeatherRiskLevel;
  fireWeatherContextFromForecast: FireWeatherContext;
  blackIceInferred: boolean;
  alertReasons?: string[];
  smokeReasons?: string[];
}): string[] {
  return dedupe([
    input.snowRisk !== 'low' ? 'Snow or freezing precipitation increases winter route risk.' : null,
    input.precipRisk === 'high' || input.precipRisk === 'severe' ? 'Heavy rain may increase flood, washout, or traction risk.' : null,
    input.windRisk === 'high' || input.windRisk === 'severe' ? 'High wind may increase exposure, towing, and recovery risk.' : null,
    input.temperatureRisk === 'high' || input.temperatureRisk === 'severe' ? 'Extreme temperature may increase crew and equipment risk.' : null,
    input.thunderstormRisk === 'high' ? 'Thunderstorm signal may reduce route margin.' : null,
    input.blackIceInferred ? 'Black ice inferred from temperature and precipitation; ECS does not assert black ice certainty.' : null,
    input.fireWeatherContextFromForecast === 'critical' || input.fireWeatherContextFromForecast === 'elevated'
      ? 'Forecast heat, wind, humidity, and low precipitation raise fire-weather context; this is not a formal FWI.'
      : null,
    ...(input.alertReasons ?? []),
    ...(input.smokeReasons ?? []),
  ]);
}

function unknownRisk(input: {
  routeId: string;
  point: RouteWeatherSamplePoint;
  estimatedArrivalAt: string | null;
}, reason: string): RouteSegmentWeatherRisk {
  return {
    segmentId: `${input.routeId}:weather:${input.point.index}`,
    samplePoint: { lat: input.point.lat, lon: input.point.lon },
    estimatedArrivalAt: input.estimatedArrivalAt,
    weatherRiskLabel: 'unknown',
    riskReasons: [reason],
    precipRisk: 'unknown',
    snowRisk: 'unknown',
    windRisk: 'unknown',
    temperatureRisk: 'unknown',
    thunderstormRisk: 'unknown',
    floodRisk: 'unknown',
    winterWeatherRisk: 'unknown',
    fireWeatherContextFromForecast: 'unknown',
    confidenceScore: 0,
    evidenceObservationIds: [],
  };
}

function estimateArrivalAt(start: string, distance: number, total: number, durationMinutes: number | null): string | null {
  const startMs = Date.parse(start);
  if (!Number.isFinite(startMs)) return null;
  if (!durationMinutes || total <= 0) return new Date(startMs).toISOString();
  const ratio = Math.max(0, Math.min(1, distance / total));
  return new Date(startMs + durationMinutes * 60_000 * ratio).toISOString();
}

function interpolatePointAtDistance(points: RouteWeatherCoordinate[], cumulative: number[], target: number): RouteWeatherCoordinate {
  for (let index = 1; index < points.length; index += 1) {
    if (cumulative[index] >= target) {
      const previousDistance = cumulative[index - 1];
      const segmentDistance = cumulative[index] - previousDistance;
      const ratio = segmentDistance > 0 ? (target - previousDistance) / segmentDistance : 0;
      return {
        lat: Number((points[index - 1].lat + (points[index].lat - points[index - 1].lat) * ratio).toFixed(5)),
        lon: Number((points[index - 1].lon + (points[index].lon - points[index - 1].lon) * ratio).toFixed(5)),
      };
    }
  }
  return points[points.length - 1];
}

function maxRisk(values: RouteWeatherRiskLevel[]): RouteWeatherRiskLevel {
  const order: RouteWeatherRiskLevel[] = ['unknown', 'low', 'moderate', 'high', 'severe'];
  return values.reduce((max, value) => order.indexOf(value) > order.indexOf(max) ? value : max, 'unknown');
}

function maxFireWeatherContext(values: FireWeatherContext[]): FireWeatherContext {
  const order: FireWeatherContext[] = ['unknown', 'low', 'elevated', 'critical'];
  return values.reduce((max, value) => order.indexOf(value) > order.indexOf(max) ? value : max, 'unknown');
}

function distanceMiles(a: RouteWeatherCoordinate, b: RouteWeatherCoordinate): number {
  const dLat = degToRad(b.lat - a.lat);
  const dLon = degToRad(b.lon - a.lon);
  const lat1 = degToRad(a.lat);
  const lat2 = degToRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function degToRad(value: number): number {
  return value * Math.PI / 180;
}

function isValidPoint(point: RouteWeatherCoordinate): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon) &&
    point.lat >= -90 && point.lat <= 90 && point.lon >= -180 && point.lon <= 180;
}

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(values: unknown[]): number | null {
  for (const value of values) {
    const number = toNumber(value);
    if (number != null) return number;
  }
  return null;
}

function dedupe(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = String(value ?? '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}
