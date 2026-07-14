import type { ProviderDefinition } from './ecs5ProviderRegistry';
import type {
  ObservationBBox,
  ProviderAdapter,
  ProviderAdapterContext,
  SourceObservation,
  SourceObservationConfidenceBreakdown,
} from './ecs5ObservationPipeline';
import { stableContentHash } from './ecs5ObservationPipeline';

export interface AirNowAdapterInput {
  lat: number;
  lon: number;
  distanceMiles?: number;
  fixturePayload?: unknown;
}

export interface AirNowFetchPolicy {
  timeoutMs: number;
  retries: number;
  retryBackoffMs: number;
}

export interface AirNowConfig {
  apiKey: string;
  baseUrl: string;
}

export type AirNowEnv = Record<string, string | undefined>;

export const DEFAULT_AIRNOW_API_BASE_URL = 'https://www.airnowapi.org/aq';

export const AIRNOW_KNOWN_LIMITATIONS = [
  'preliminary_air_quality_data',
  'not_regulatory_data',
  'not_legal_authority',
  'not_closure_authority',
  'may_have_delayed_updates',
] as const;

export const DEFAULT_AIRNOW_FETCH_POLICY: AirNowFetchPolicy = {
  timeoutMs: 9000,
  retries: 1,
  retryBackoffMs: 750,
};

export function createAirNowAdapter(
  provider: ProviderDefinition,
  policy: AirNowFetchPolicy = DEFAULT_AIRNOW_FETCH_POLICY,
): ProviderAdapter {
  return {
    providerId: 'airnow',
    supportsFixtureMode: true,
    supportsLiveMode: true,
    async fetch(input: AirNowAdapterInput, context: ProviderAdapterContext): Promise<unknown> {
      if (context.fixtureMode && input.fixturePayload != null) return input.fixturePayload;
      if (input.fixturePayload != null) return input.fixturePayload;
      if (!context.serverFetch) {
        throw new Error('AirNow live fetch requires serverFetch. Do not call this adapter directly from the client.');
      }

      const config = buildAirNowConfig();
      const urls = [
        buildAirNowCurrentLatLonUrl(input, config),
        buildAirNowForecastLatLonUrl(input, config),
      ];
      const [current, forecast] = await Promise.all(urls.map((url) => fetchWithRetry(context, url, policy)));
      return { current, forecast };
    },
    normalize(rawPayload: unknown, context: ProviderAdapterContext): SourceObservation[] {
      return normalizeAirNowPayload(rawPayload, provider, context);
    },
    getHealth(): ProviderDefinition | null {
      return provider;
    },
    getKnownLimitations(): string[] {
      return [...AIRNOW_KNOWN_LIMITATIONS];
    },
    getDefaultConfidence(): number {
      return 88;
    },
    getCacheTtl(): number {
      return provider.cacheTtlSeconds;
    },
  };
}

export function buildAirNowConfig(env: AirNowEnv = getProcessEnv()): AirNowConfig {
  const apiKey = normalizeRequiredAirNowApiKey(env.AIRNOW_API_KEY);
  return {
    apiKey,
    baseUrl: normalizeAirNowBaseUrl(env.AIRNOW_API_BASE_URL) ?? DEFAULT_AIRNOW_API_BASE_URL,
  };
}

export function normalizeAirNowPayload(
  rawPayload: unknown,
  provider: ProviderDefinition,
  context: ProviderAdapterContext = {},
): SourceObservation[] {
  const ingestedAt = (context.now ?? new Date()).toISOString();
  const rawHash = stableContentHash(rawPayload);
  const records = extractAirNowRecords(rawPayload);

  return records.map((record, index) => {
    const normalized = normalizeAirNowRecord(record);
    const lat = normalized.latitude;
    const lon = normalized.longitude;
    const observedAt = normalizeAirNowTimestamp(record);
    return {
      id: String(record.id ?? record.RecordID ?? `airnow:${rawHash}:${index}`),
      providerId: 'airnow',
      sourceName: 'AirNow',
      sourceType: 'official_api',
      subjectType: 'smoke_aqi',
      subjectId: normalized.reportingArea ?? normalized.pollutant ?? null,
      geometry: lat != null && lon != null ? { type: 'Point', coordinates: [lon, lat] } : null,
      bbox: lat != null && lon != null ? bboxAroundPoint(lat, lon) : null,
      observedAt,
      publishedAt: observedAt,
      ingestedAt,
      expiresAt: new Date(Date.parse(ingestedAt) + provider.staleAfterSeconds * 1000).toISOString(),
      rawPayloadRef: context.rawPayloadRef ?? `hash:${rawHash}`,
      normalizedPayload: {
        ...normalized,
        legalClosureSignal: false,
      },
      evidenceUrl: context.sourceUrl ?? 'https://www.airnow.gov/',
      contentHash: stableContentHash({ providerId: 'airnow', record }),
      confidenceScore: 88,
      confidenceBreakdown: confidenceBreakdown(88),
      knownLimitations: [...AIRNOW_KNOWN_LIMITATIONS],
      supersedesObservationId: null,
      offlineCacheEligible: true,
    };
  });
}

export function buildAirNowCurrentLatLonUrl(
  input: AirNowAdapterInput,
  config: AirNowConfig = buildAirNowConfig(),
): string {
  const lat = assertCoordinate(input.lat, 'lat');
  const lon = assertCoordinate(input.lon, 'lon');
  const distance = Math.max(5, Math.min(250, Number(input.distanceMiles ?? 25)));
  const params = new URLSearchParams({
    format: 'application/json',
    latitude: String(lat),
    longitude: String(lon),
    distance: String(distance),
    API_KEY: config.apiKey,
  });
  return `${normalizeAirNowBaseUrl(config.baseUrl) ?? DEFAULT_AIRNOW_API_BASE_URL}/observation/latLong/current/?${params.toString()}`;
}

export function buildAirNowForecastLatLonUrl(
  input: AirNowAdapterInput,
  config: AirNowConfig = buildAirNowConfig(),
): string {
  const lat = assertCoordinate(input.lat, 'lat');
  const lon = assertCoordinate(input.lon, 'lon');
  const distance = Math.max(5, Math.min(250, Number(input.distanceMiles ?? 25)));
  const params = new URLSearchParams({
    format: 'application/json',
    latitude: String(lat),
    longitude: String(lon),
    distance: String(distance),
    API_KEY: config.apiKey,
  });
  return `${normalizeAirNowBaseUrl(config.baseUrl) ?? DEFAULT_AIRNOW_API_BASE_URL}/forecast/latLong/?${params.toString()}`;
}

export function mapAirNowAqiRisk(aqi: number | null, categoryName?: string | null): {
  risk: 'low' | 'moderate' | 'high' | 'severe' | 'unknown';
  label: string;
} {
  const category = String(categoryName ?? '').toLowerCase();
  if (category.includes('hazardous')) return { risk: 'severe', label: 'Hazardous' };
  if (category.includes('very unhealthy')) return { risk: 'severe', label: 'Very Unhealthy' };
  if (category === 'unhealthy' || category.includes('unhealthy for everyone')) return { risk: 'high', label: 'Unhealthy' };
  if (category.includes('sensitive')) return { risk: 'moderate', label: 'Unhealthy for Sensitive Groups' };
  if (category.includes('moderate')) return { risk: 'moderate', label: 'Moderate' };
  if (category.includes('good')) return { risk: 'low', label: 'Good' };
  if (aqi == null) return { risk: 'unknown', label: 'Unknown' };
  if (aqi >= 301) return { risk: 'severe', label: 'Hazardous' };
  if (aqi >= 201) return { risk: 'severe', label: 'Very Unhealthy' };
  if (aqi >= 151) return { risk: 'high', label: 'Unhealthy' };
  if (aqi >= 101) return { risk: 'moderate', label: 'Unhealthy for Sensitive Groups' };
  if (aqi >= 51) return { risk: 'moderate', label: 'Moderate' };
  return { risk: 'low', label: 'Good' };
}

function extractAirNowRecords(rawPayload: unknown): Array<Record<string, any>> {
  if (Array.isArray(rawPayload)) return rawPayload.filter(isRecord);
  if (!isRecord(rawPayload)) return [];
  const records: Array<Record<string, any>> = [];
  if (Array.isArray(rawPayload.current)) records.push(...rawPayload.current.filter(isRecord));
  if (Array.isArray(rawPayload.forecast)) records.push(...rawPayload.forecast.filter(isRecord));
  if (Array.isArray(rawPayload.observations)) records.push(...rawPayload.observations.filter(isRecord));
  if (Array.isArray(rawPayload.items)) records.push(...rawPayload.items.filter(isRecord));
  if (records.length === 0 && ('AQI' in rawPayload || 'aqi' in rawPayload)) records.push(rawPayload);
  return records;
}

function normalizeAirNowRecord(record: Record<string, any>) {
  const pollutant = nullableString(record.ParameterName ?? record.Pollutant ?? record.pollutant);
  const aqi = toNumber(record.AQI ?? record.aqi);
  const category = normalizeCategory(record.Category ?? record.category);
  const latitude = toNumber(record.Latitude ?? record.latitude);
  const longitude = toNumber(record.Longitude ?? record.longitude);
  return {
    aqi,
    category,
    pollutant,
    pm25: /pm\s*2\.?5/i.test(String(pollutant ?? '')) ? aqi : toNumber(record.pm25 ?? record.PM25),
    pm10: /pm\s*10/i.test(String(pollutant ?? '')) ? aqi : toNumber(record.pm10 ?? record.PM10),
    ozone: /ozone|o3/i.test(String(pollutant ?? '')) ? aqi : toNumber(record.ozone ?? record.OZONE ?? record.O3),
    reportingArea: nullableString(record.ReportingArea ?? record.reportingArea),
    stateCode: nullableString(record.StateCode ?? record.stateCode),
    latitude,
    longitude,
    risk: mapAirNowAqiRisk(aqi, category).risk,
  };
}

function normalizeCategory(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (isRecord(value)) return nullableString(value.Name ?? value.name);
  return null;
}

function normalizeAirNowTimestamp(record: Record<string, any>): string | null {
  const candidates = [
    record.DateObserved && record.HourObserved != null
      ? `${record.DateObserved}T${String(record.HourObserved).padStart(2, '0')}:00:00${timezoneOffset(record.LocalTimeZone)}`
      : null,
    record.DateForecast,
    record.ObservedAt,
    record.observedAt,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function timezoneOffset(value: unknown): string {
  const zone = String(value ?? '').toUpperCase();
  if (zone === 'PST') return '-08:00';
  if (zone === 'PDT') return '-07:00';
  if (zone === 'MST') return '-07:00';
  if (zone === 'MDT') return '-06:00';
  if (zone === 'CST') return '-06:00';
  if (zone === 'CDT') return '-05:00';
  if (zone === 'EST') return '-05:00';
  if (zone === 'EDT') return '-04:00';
  return 'Z';
}

function confidenceBreakdown(providerDefault: number): SourceObservationConfidenceBreakdown {
  return {
    providerDefault,
    freshness: 84,
    sourceAuthority: providerDefault,
    completeness: 78,
    stalePenalty: 0,
  };
}

async function fetchWithRetry(
  context: ProviderAdapterContext,
  url: string,
  policy: AirNowFetchPolicy,
): Promise<unknown> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= policy.retries; attempt += 1) {
    if (context.signal?.aborted) throw new Error('AirNow request cancelled.');
    try {
      return await context.serverFetch!({
        url,
        timeoutMs: policy.timeoutMs,
        headers: { Accept: 'application/json' },
        signal: context.signal,
      });
    } catch (error: any) {
      lastError = error;
      if (context.signal?.aborted || !isRetryableAirNowError(error) || attempt >= policy.retries) break;
      await delay(policy.retryBackoffMs * (attempt + 1), context.signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AirNow fetch failed.');
}

function isRetryableAirNowError(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  return message.includes('timeout') ||
    message.includes('429') ||
    message.includes('rate') ||
    message.includes('503') ||
    message.includes('502');
}

function assertCoordinate(value: unknown, label: 'lat' | 'lon'): number {
  const number = Number(value);
  const min = label === 'lat' ? -90 : -180;
  const max = label === 'lat' ? 90 : 180;
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`Invalid AirNow ${label}.`);
  }
  return Number(number.toFixed(4));
}

function bboxAroundPoint(lat: number, lon: number): ObservationBBox {
  return {
    minLat: Number((lat - 0.05).toFixed(5)),
    minLon: Number((lon - 0.05).toFixed(5)),
    maxLat: Number((lat + 0.05).toFixed(5)),
    maxLon: Number((lon + 0.05).toFixed(5)),
  };
}

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeRequiredAirNowApiKey(value: unknown): string {
  const apiKey = normalizeAirNowEnvValue(value);
  if (!apiKey || apiKey.includes('{{') || apiKey.includes('}}')) {
    throw new Error('AIRNOW_API_KEY missing or not configured.');
  }
  return apiKey;
}

function normalizeAirNowBaseUrl(value: unknown): string | null {
  const normalized = normalizeAirNowEnvValue(value);
  if (!normalized) return null;
  return normalized.replace(/\/+$/, '');
}

function normalizeAirNowEnvValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== '""' ? trimmed : null;
}

function delay(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) return Promise.reject(new Error('AirNow request cancelled.'));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('AirNow request cancelled.'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function getProcessEnv(): AirNowEnv {
  return typeof process !== 'undefined' ? process.env as AirNowEnv : {};
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
