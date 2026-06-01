import type { ProviderDefinition } from './ecs5ProviderRegistry';
import type {
  ObservationBBox,
  ObservationGeometry,
  ProviderAdapter,
  ProviderAdapterContext,
  SourceObservation,
  SourceObservationConfidenceBreakdown,
} from './ecs5ObservationPipeline';
import { stableContentHash } from './ecs5ObservationPipeline';

export interface NwsWeatherAdapterInput {
  lat: number;
  lon: number;
  fixturePayload?: unknown;
}

export interface NwsWeatherFetchPolicy {
  timeoutMs: number;
  retries: number;
  retryBackoffMs: number;
}

export const NWS_WEATHER_KNOWN_LIMITATIONS = [
  'us_only_or_us_territories',
  'weather_only',
  'not_legal_access_authority',
  'not_closure_authority',
] as const;

export const DEFAULT_NWS_WEATHER_FETCH_POLICY: NwsWeatherFetchPolicy = {
  timeoutMs: 9000,
  retries: 1,
  retryBackoffMs: 750,
};

export function createNwsWeatherAdapter(
  provider: ProviderDefinition,
  policy: NwsWeatherFetchPolicy = DEFAULT_NWS_WEATHER_FETCH_POLICY,
): ProviderAdapter {
  return {
    providerId: 'nws',
    supportsFixtureMode: true,
    supportsLiveMode: true,
    async fetch(input: NwsWeatherAdapterInput, context: ProviderAdapterContext): Promise<unknown> {
      if (context.fixtureMode && input.fixturePayload != null) return input.fixturePayload;
      if (input.fixturePayload != null) return input.fixturePayload;
      if (!context.serverFetch) {
        throw new Error('NWS live fetch requires serverFetch. Do not call this adapter directly from the client.');
      }

      const headers = buildNwsHeaders();
      const pointsUrl = buildNwsPointsUrl(input.lat, input.lon);
      const points = await fetchWithRetry(context, pointsUrl, headers, policy);
      const endpoints = extractNwsEndpointRefs(points, input.lat, input.lon);
      const [forecast, forecastHourly, alerts] = await Promise.all([
        endpoints.forecast ? fetchWithRetry(context, endpoints.forecast, headers, policy) : Promise.resolve(null),
        endpoints.forecastHourly ? fetchWithRetry(context, endpoints.forecastHourly, headers, policy) : Promise.resolve(null),
        fetchWithRetry(context, endpoints.alerts, headers, policy),
      ]);
      return { points, forecast, forecastHourly, alerts };
    },
    normalize(rawPayload: unknown, context: ProviderAdapterContext): SourceObservation[] {
      return normalizeNwsWeatherPayload(rawPayload, provider, context);
    },
    getHealth(): ProviderDefinition | null {
      return provider;
    },
    getKnownLimitations(): string[] {
      return [...NWS_WEATHER_KNOWN_LIMITATIONS];
    },
    getDefaultConfidence(): number {
      return 92;
    },
    getCacheTtl(): number {
      return provider.cacheTtlSeconds;
    },
  };
}

export function normalizeNwsWeatherPayload(
  rawPayload: unknown,
  provider: ProviderDefinition,
  context: ProviderAdapterContext = {},
): SourceObservation[] {
  const payload = isRecord(rawPayload) ? rawPayload : {};
  const ingestedAt = (context.now ?? new Date()).toISOString();
  const rawHash = stableContentHash(rawPayload);
  const observations: SourceObservation[] = [];
  const points = isRecord(payload.points) ? payload.points : {};
  const pointProperties = isRecord(points.properties) ? points.properties : {};
  const forecastPayload = isRecord(payload.forecast) ? payload.forecast : {};
  const hourlyPayload = isRecord(payload.forecastHourly) ? payload.forecastHourly : {};
  const forecastPeriods = extractNwsPeriods(forecastPayload);
  const hourlyPeriods = extractNwsPeriods(hourlyPayload);
  const pointGeometry = normalizeGeometry(points.geometry);
  const pointBbox = normalizeBbox(points.bbox);
  const forecastGeneratedAt = normalizeTimestamp(
    nestedProperty(forecastPayload, ['properties', 'generatedAt']) ??
    nestedProperty(hourlyPayload, ['properties', 'generatedAt']),
  );

  if (forecastPeriods.length > 0 || hourlyPeriods.length > 0 || Object.keys(pointProperties).length > 0) {
    observations.push({
      id: `nws-forecast:${rawHash}`,
      providerId: 'nws',
      sourceName: 'National Weather Service',
      sourceType: 'federal_agency',
      subjectType: 'weather_forecast',
      subjectId: nullableString(pointProperties.forecastZone ?? pointProperties.gridId),
      geometry: pointGeometry,
      bbox: pointBbox,
      observedAt: forecastGeneratedAt,
      publishedAt: forecastGeneratedAt,
      ingestedAt,
      expiresAt: chooseExpiry([
        nestedProperty(forecastPayload, ['properties', 'expires']),
        nestedProperty(hourlyPayload, ['properties', 'expires']),
      ], ingestedAt, provider),
      rawPayloadRef: context.rawPayloadRef ?? `hash:${rawHash}`,
      normalizedPayload: {
        point: {
          gridId: pointProperties.gridId ?? null,
          gridX: pointProperties.gridX ?? null,
          gridY: pointProperties.gridY ?? null,
          forecastZone: pointProperties.forecastZone ?? null,
          county: pointProperties.county ?? null,
          fireWeatherZone: pointProperties.fireWeatherZone ?? null,
        },
        forecast: forecastPeriods,
        hourly: hourlyPeriods,
        sourceEndpoints: {
          forecast: pointProperties.forecast ?? null,
          forecastHourly: pointProperties.forecastHourly ?? null,
          forecastZone: pointProperties.forecastZone ?? null,
          county: pointProperties.county ?? null,
          fireWeatherZone: pointProperties.fireWeatherZone ?? null,
        },
      },
      evidenceUrl: nullableString(pointProperties.forecast) ?? context.sourceUrl ?? null,
      contentHash: stableContentHash({ providerId: 'nws', kind: 'forecast', forecastPayload, hourlyPayload }),
      confidenceScore: 90,
      confidenceBreakdown: confidenceBreakdown(90),
      knownLimitations: [...NWS_WEATHER_KNOWN_LIMITATIONS],
      supersedesObservationId: null,
      offlineCacheEligible: true,
    });
  }

  const alertFeatures = extractNwsAlertFeatures(payload.alerts ?? payload);
  alertFeatures.forEach((feature, index) => {
    const properties = isRecord(feature.properties) ? feature.properties : {};
    const geometry = normalizeGeometry(feature.geometry);
    const bbox = normalizeBbox(feature.bbox);
    const event = nullableString(properties.event);
    observations.push({
      id: String(properties.id ?? properties['@id'] ?? `nws-alert:${rawHash}:${index}`),
      providerId: 'nws',
      sourceName: 'National Weather Service',
      sourceType: 'federal_agency',
      subjectType: 'weather_alert',
      subjectId: event,
      geometry,
      bbox,
      observedAt: normalizeTimestamp(properties.onset ?? properties.effective ?? properties.sent),
      publishedAt: normalizeTimestamp(properties.sent ?? properties.effective),
      ingestedAt,
      expiresAt: normalizeTimestamp(properties.expires ?? properties.ends) ??
        new Date(Date.parse(ingestedAt) + provider.staleAfterSeconds * 1000).toISOString(),
      rawPayloadRef: context.rawPayloadRef ?? `hash:${rawHash}`,
      normalizedPayload: {
        event,
        headline: properties.headline ?? null,
        severity: properties.severity ?? null,
        certainty: properties.certainty ?? null,
        urgency: properties.urgency ?? null,
        onset: normalizeTimestamp(properties.onset),
        effective: normalizeTimestamp(properties.effective),
        expires: normalizeTimestamp(properties.expires),
        ends: normalizeTimestamp(properties.ends),
        instruction: properties.instruction ?? null,
        description: properties.description ?? null,
        areaDesc: properties.areaDesc ?? null,
        status: properties.status ?? null,
        messageType: properties.messageType ?? null,
        category: properties.category ?? null,
        response: properties.response ?? null,
        legalClosureSignal: false,
        activeFireSignal: false,
      },
      evidenceUrl: nullableString(properties['@id']) ?? context.sourceUrl ?? null,
      contentHash: stableContentHash({ providerId: 'nws', kind: 'alert', feature }),
      confidenceScore: 96,
      confidenceBreakdown: confidenceBreakdown(96),
      knownLimitations: [...NWS_WEATHER_KNOWN_LIMITATIONS],
      supersedesObservationId: null,
      offlineCacheEligible: true,
    });
  });

  return observations;
}

export function buildNwsPointsUrl(lat: number, lon: number): string {
  const cleanLat = assertCoordinate(lat, 'lat');
  const cleanLon = assertCoordinate(lon, 'lon');
  return `https://api.weather.gov/points/${cleanLat},${cleanLon}`;
}

export function buildNwsPointAlertsUrl(lat: number, lon: number): string {
  const cleanLat = assertCoordinate(lat, 'lat');
  const cleanLon = assertCoordinate(lon, 'lon');
  return `https://api.weather.gov/alerts/active?point=${cleanLat},${cleanLon}`;
}

export function extractNwsEndpointRefs(pointsPayload: unknown, lat: number, lon: number): {
  forecast: string | null;
  forecastHourly: string | null;
  alerts: string;
} {
  const properties = isRecord((pointsPayload as any)?.properties) ? (pointsPayload as any).properties : {};
  return {
    forecast: nullableString(properties.forecast),
    forecastHourly: nullableString(properties.forecastHourly),
    alerts: buildNwsPointAlertsUrl(lat, lon),
  };
}

async function fetchWithRetry(
  context: ProviderAdapterContext,
  url: string,
  headers: Record<string, string>,
  policy: NwsWeatherFetchPolicy,
): Promise<unknown> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= policy.retries; attempt += 1) {
    try {
      return await context.serverFetch!({ url, timeoutMs: policy.timeoutMs, headers });
    } catch (error: any) {
      lastError = error;
      if (!isRetryableNwsError(error) || attempt >= policy.retries) break;
      await delay(policy.retryBackoffMs * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('NWS fetch failed.');
}

function buildNwsHeaders(): Record<string, string> {
  return {
    Accept: 'application/geo+json, application/json',
    'User-Agent': '{{NWS_USER_AGENT}}',
  };
}

function extractNwsPeriods(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const periods = nestedProperty(payload, ['properties', 'periods']);
  if (!Array.isArray(periods)) return [];
  return periods.filter(isRecord).map((period) => ({
    date: normalizeTimestamp(period.startTime),
    startTime: normalizeTimestamp(period.startTime),
    endTime: normalizeTimestamp(period.endTime),
    temp: normalizeTemperatureF(period.temperature, period.temperatureUnit),
    temp_unit: 'F',
    wind_speed: parseWindMph(period.windSpeed),
    windDirection: period.windDirection ?? null,
    pop: normalizeProbability(nestedProperty(period, ['probabilityOfPrecipitation', 'value'])),
    weather_main: period.shortForecast ?? null,
    weather_description: period.detailedForecast ?? period.shortForecast ?? null,
    summary: period.shortForecast ?? null,
    rawName: period.name ?? null,
  }));
}

function extractNwsAlertFeatures(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray((value as any)?.features)) return (value as any).features.filter(isRecord);
  if (isRecord(value) && isRecord(value.properties) && value.properties.event) return [value];
  if (Array.isArray(value)) return value.filter(isRecord);
  return [];
}

function confidenceBreakdown(providerDefault: number): SourceObservationConfidenceBreakdown {
  return {
    providerDefault,
    freshness: 90,
    sourceAuthority: providerDefault,
    completeness: 82,
    stalePenalty: 0,
  };
}

function chooseExpiry(values: unknown[], ingestedAt: string, provider: ProviderDefinition): string {
  for (const value of values) {
    const parsed = normalizeTimestamp(value);
    if (parsed) return parsed;
  }
  return new Date(Date.parse(ingestedAt) + provider.cacheTtlSeconds * 1000).toISOString();
}

function normalizeGeometry(value: unknown): ObservationGeometry | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  if (type !== 'Point' && type !== 'LineString' && type !== 'Polygon' && type !== 'MultiPolygon' && type !== 'GeometryCollection') {
    return null;
  }
  return { type, coordinates: value.coordinates ?? null };
}

function normalizeBbox(value: unknown): ObservationBBox | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const [minLon, minLat, maxLon, maxLat] = value.map((entry) => Number(entry));
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return null;
  return { minLat, minLon, maxLat, maxLon };
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeTemperatureF(value: unknown, unit: unknown): number | null {
  const number = toNumber(value);
  if (number == null) return null;
  return String(unit ?? '').toUpperCase() === 'C'
    ? Number((number * 9 / 5 + 32).toFixed(1))
    : number;
}

function normalizeProbability(value: unknown): number | null {
  const number = toNumber(value);
  if (number == null) return null;
  return Math.max(0, Math.min(1, number / 100));
}

function parseWindMph(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const matches = [...value.matchAll(/(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  if (matches.length === 0) return null;
  return Math.max(...matches);
}

function assertCoordinate(value: unknown, label: 'lat' | 'lon'): number {
  const number = Number(value);
  const min = label === 'lat' ? -90 : -180;
  const max = label === 'lat' ? 90 : 180;
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`Invalid NWS ${label}.`);
  }
  return Number(number.toFixed(4));
}

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nestedProperty(value: unknown, path: string[]): unknown {
  return path.reduce((current: unknown, key) => isRecord(current) ? current[key] : undefined, value);
}

function isRetryableNwsError(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  return message.includes('timeout') ||
    message.includes('429') ||
    message.includes('rate') ||
    message.includes('503') ||
    message.includes('502');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
