import type { ProviderDefinition } from './ecs5ProviderRegistry';
import type {
  ObservationBBox,
  ProviderAdapter,
  ProviderAdapterContext,
  SourceObservation,
  SourceObservationConfidenceBreakdown,
} from './ecs5ObservationPipeline';
import { stableContentHash } from './ecs5ObservationPipeline';

export type OpenWeatherOneCallUnits = 'standard' | 'metric' | 'imperial';

export interface OpenWeatherOneCallAdapterInput {
  lat: number;
  lon: number;
  units?: OpenWeatherOneCallUnits;
  exclude?: string[];
  lang?: string;
  apiKeyAvailable?: boolean;
  fixturePayload?: unknown;
}

export interface OpenWeatherOneCallFetchPolicy {
  timeoutMs: number;
  retries: number;
  retryBackoffMs: number;
}

export const OPENWEATHER_ONECALL_KNOWN_LIMITATIONS = [
  'commercial_weather_provider',
  'not_legal_authority',
  'not_closure_authority',
  'not_fire_perimeter_authority',
] as const;

export const DEFAULT_OPENWEATHER_ONECALL_FETCH_POLICY: OpenWeatherOneCallFetchPolicy = {
  timeoutMs: 9000,
  retries: 1,
  retryBackoffMs: 750,
};

export function createOpenWeatherOneCallAdapter(
  provider: ProviderDefinition,
  policy: OpenWeatherOneCallFetchPolicy = DEFAULT_OPENWEATHER_ONECALL_FETCH_POLICY,
): ProviderAdapter {
  return {
    providerId: 'openweather_onecall',
    supportsFixtureMode: true,
    supportsLiveMode: true,
    async fetch(input: OpenWeatherOneCallAdapterInput, context: ProviderAdapterContext): Promise<unknown> {
      if (context.fixtureMode && input.fixturePayload != null) return input.fixturePayload;
      if (input.fixturePayload != null) return input.fixturePayload;
      if (!input.apiKeyAvailable) {
        throw new Error('OpenWeather One Call server API key is not available.');
      }
      if (!context.serverFetch) {
        throw new Error('OpenWeather One Call live fetch requires serverFetch. Do not call this adapter directly from the client.');
      }

      const url = buildOpenWeatherOneCallServerUrl(input);
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= policy.retries; attempt += 1) {
        try {
          return await context.serverFetch({
            url,
            timeoutMs: policy.timeoutMs,
            headers: { Accept: 'application/json' },
          });
        } catch (error: any) {
          lastError = error;
          if (!isRetryableOpenWeatherError(error) || attempt >= policy.retries) break;
          await delay(policy.retryBackoffMs * (attempt + 1));
        }
      }
      throw lastError instanceof Error ? lastError : new Error('OpenWeather One Call fetch failed.');
    },
    normalize(rawPayload: unknown, context: ProviderAdapterContext): SourceObservation[] {
      return normalizeOpenWeatherOneCallPayload(rawPayload, provider, context);
    },
    getHealth(): ProviderDefinition | null {
      return provider;
    },
    getKnownLimitations(): string[] {
      return [...OPENWEATHER_ONECALL_KNOWN_LIMITATIONS];
    },
    getDefaultConfidence(): number {
      return 78;
    },
    getCacheTtl(): number {
      return provider.cacheTtlSeconds;
    },
  };
}

export function normalizeOpenWeatherOneCallPayload(
  rawPayload: unknown,
  provider: ProviderDefinition,
  context: ProviderAdapterContext = {},
): SourceObservation[] {
  const payload = isRecord(rawPayload) ? rawPayload : {};
  const ingestedAt = (context.now ?? new Date()).toISOString();
  const rawHash = stableContentHash(rawPayload);
  const lat = toNumber(payload.lat);
  const lon = toNumber(payload.lon);
  const bbox = lat != null && lon != null ? bboxAroundPoint(lat, lon) : null;
  const observations: SourceObservation[] = [];
  const currentDt = unixToIso(payload.current && isRecord(payload.current) ? payload.current.dt : null);

  observations.push({
    id: String(payload.id ?? `openweather-onecall-forecast:${rawHash}`),
    providerId: 'openweather_onecall',
    sourceName: provider.displayName,
    sourceType: 'commercial_weather',
    subjectType: 'weather_forecast',
    subjectId: null,
    geometry: lat != null && lon != null ? { type: 'Point', coordinates: [lon, lat] } : null,
    bbox,
    observedAt: currentDt,
    publishedAt: currentDt,
    ingestedAt,
    expiresAt: new Date(Date.parse(ingestedAt) + provider.staleAfterSeconds * 1000).toISOString(),
    rawPayloadRef: context.rawPayloadRef ?? `hash:${rawHash}`,
    normalizedPayload: {
      timezone: payload.timezone ?? null,
      timezone_offset: payload.timezone_offset ?? null,
      lat,
      lon,
      current: sanitizeWeatherBlock(payload.current),
      minutely: Array.isArray(payload.minutely) ? payload.minutely.map(sanitizeWeatherBlock) : [],
      hourly: Array.isArray(payload.hourly) ? payload.hourly.map(sanitizeWeatherBlock) : [],
      daily: Array.isArray(payload.daily) ? payload.daily.map(sanitizeWeatherBlock) : [],
    },
    evidenceUrl: context.sourceUrl ?? null,
    contentHash: stableContentHash({ providerId: 'openweather_onecall', kind: 'forecast', payload }),
    confidenceScore: 78,
    confidenceBreakdown: confidenceBreakdown(78, false, null),
    knownLimitations: [...OPENWEATHER_ONECALL_KNOWN_LIMITATIONS],
    supersedesObservationId: null,
    offlineCacheEligible: true,
  });

  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  alerts.forEach((alert: unknown, index: number) => {
    const record = isRecord(alert) ? alert : {};
    const senderName = nullableString(record.sender_name);
    const underlyingAgencySignal = detectOfficialWeatherSender(senderName);
    const agencyDetected = underlyingAgencySignal?.detected === true;
    observations.push({
      id: String(record.id ?? `openweather-onecall-alert:${rawHash}:${index}`),
      providerId: 'openweather_onecall',
      sourceName: provider.displayName,
      sourceType: 'commercial_weather',
      subjectType: 'weather_alert',
      subjectId: nullableString(record.event),
      geometry: lat != null && lon != null ? { type: 'Point', coordinates: [lon, lat] } : null,
      bbox,
      observedAt: unixToIso(record.start),
      publishedAt: unixToIso(record.start),
      ingestedAt,
      expiresAt: unixToIso(record.end) ?? new Date(Date.parse(ingestedAt) + provider.staleAfterSeconds * 1000).toISOString(),
      rawPayloadRef: context.rawPayloadRef ?? `hash:${rawHash}`,
      normalizedPayload: {
        sender_name: senderName,
        event: record.event ?? null,
        start: unixToIso(record.start),
        end: unixToIso(record.end),
        description: record.description ?? null,
        tags: Array.isArray(record.tags) ? record.tags : [],
        legalClosureSignal: false,
      },
      evidenceUrl: context.sourceUrl ?? null,
      contentHash: stableContentHash({ providerId: 'openweather_onecall', kind: 'alert', alert: record }),
      confidenceScore: agencyDetected ? 84 : 76,
      confidenceBreakdown: confidenceBreakdown(76, false, underlyingAgencySignal),
      knownLimitations: [...OPENWEATHER_ONECALL_KNOWN_LIMITATIONS],
      supersedesObservationId: null,
      offlineCacheEligible: true,
    });
  });

  return observations;
}

export function buildOpenWeatherOneCallServerUrl(input: OpenWeatherOneCallAdapterInput): string {
  const lat = assertCoordinate(input.lat, 'lat');
  const lon = assertCoordinate(input.lon, 'lon');
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    units: input.units ?? 'imperial',
  });
  if (input.lang) params.set('lang', input.lang);
  if (input.exclude?.length) params.set('exclude', input.exclude.join(','));
  return `https://api.openweathermap.org/data/3.0/onecall?${params.toString()}&appid={{OPENWEATHER_API_KEY}}`;
}

export function detectOfficialWeatherSender(senderName: string | null | undefined): SourceObservationConfidenceBreakdown['underlyingAgencySignal'] {
  const name = String(senderName ?? '').trim();
  const detected = /national weather service|nws|environment canada|met office|noaa|government|weather service/i.test(name);
  return {
    detected,
    senderName: name || null,
    confidenceBoost: detected ? 8 : 0,
    note: detected
      ? 'OpenWeather alert cites an apparent official weather sender; ECS still treats OpenWeather as the commercial transport source.'
      : 'No official weather sender attribution detected in OpenWeather alert.',
  };
}

function confidenceBreakdown(
  providerDefault: number,
  stale: boolean,
  underlyingAgencySignal: SourceObservationConfidenceBreakdown['underlyingAgencySignal'] | null,
): SourceObservationConfidenceBreakdown {
  return {
    providerDefault,
    freshness: stale ? 35 : 86,
    sourceAuthority: providerDefault + (underlyingAgencySignal?.confidenceBoost ?? 0),
    completeness: 76,
    stalePenalty: stale ? 35 : 0,
    ...(underlyingAgencySignal ? { underlyingAgencySignal } : {}),
  };
}

function sanitizeWeatherBlock(value: unknown): unknown {
  if (!isRecord(value)) return value ?? null;
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/appid|api[_-]?key|token|secret/i.test(key)) continue;
    copy[key] = entry;
  }
  return copy;
}

function isRetryableOpenWeatherError(error: unknown): boolean {
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
    throw new Error(`Invalid OpenWeather ${label}.`);
  }
  return Number(number.toFixed(5));
}

function bboxAroundPoint(lat: number, lon: number): ObservationBBox {
  return {
    minLat: Number((lat - 0.05).toFixed(5)),
    minLon: Number((lon - 0.05).toFixed(5)),
    maxLat: Number((lat + 0.05).toFixed(5)),
    maxLon: Number((lon + 0.05).toFixed(5)),
  };
}

function unixToIso(value: unknown): string | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return new Date(number * 1000).toISOString();
}

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
