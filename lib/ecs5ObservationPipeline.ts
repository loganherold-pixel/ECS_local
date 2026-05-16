import {
  createECS5ProviderRegistry,
  getProviderConfig,
  listProviderHealth,
  type ECS5ProviderId,
  type ECS5ProviderRegistry,
  type ECS5ProviderStatus,
  type ProviderDefinition,
} from './ecs5ProviderRegistry';
import {
  applyECS5SourceObservationStaleness,
  buildECS5OfflineCacheMetadata,
} from './ecs5OfflineStaleness';

export type SourceObservationSourceType =
  | 'federal_agency'
  | 'state_agency'
  | 'local_agency'
  | 'tribal_agency'
  | 'official_api'
  | 'official_webpage'
  | 'official_gis'
  | 'commercial_weather'
  | 'community_report'
  | 'partner_feed'
  | 'sensor'
  | 'satellite'
  | 'cached'
  | 'manual_admin'
  | 'unknown';

export type SourceObservationSubjectType =
  | 'weather_forecast'
  | 'weather_alert'
  | 'smoke_aqi'
  | 'active_fire'
  | 'fire_perimeter'
  | 'fire_incident'
  | 'legal_access'
  | 'closure'
  | 'restriction'
  | 'road_condition'
  | 'route_segment'
  | 'bailout_route'
  | 'agency_notice'
  | 'community_condition'
  | 'unknown';

export type SourceObservationCacheStatus =
  | 'miss'
  | 'hit_fresh'
  | 'hit_stale'
  | 'disabled'
  | 'missing_config'
  | 'unavailable';

export interface ObservationGeometry {
  type: 'Point' | 'LineString' | 'Polygon' | 'MultiPolygon' | 'GeometryCollection';
  coordinates: unknown;
}

export interface ObservationBBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export interface SourceObservationConfidenceBreakdown {
  providerDefault: number;
  freshness: number;
  sourceAuthority: number;
  completeness: number;
  stalePenalty: number;
  underlyingAgencySignal?: {
    detected: boolean;
    senderName?: string | null;
    confidenceBoost: number;
    note: string;
  };
}

export interface SourceObservation {
  id: string;
  providerId: ECS5ProviderId | string;
  sourceName: string;
  sourceType: SourceObservationSourceType;
  subjectType: SourceObservationSubjectType;
  subjectId: string | null;
  geometry: ObservationGeometry | null;
  bbox: ObservationBBox | null;
  observedAt: string | null;
  publishedAt: string | null;
  ingestedAt: string;
  expiresAt: string | null;
  rawPayloadRef: string | null;
  normalizedPayload: unknown;
  evidenceUrl: string | null;
  contentHash: string;
  confidenceScore: number;
  confidenceBreakdown: SourceObservationConfidenceBreakdown;
  knownLimitations: string[];
  supersedesObservationId: string | null;
  offlineCacheEligible: boolean;
  cachedAt?: string | null;
  lastVerifiedAt?: string | null;
  validUntil?: string | null;
  staleAt?: string | null;
  offlineWarning?: string | null;
  staleReason?: string | null;
}

export interface ProviderAdapterContext {
  provider?: ProviderDefinition | null;
  registry?: ECS5ProviderRegistry;
  fixtureMode?: boolean;
  liveMode?: boolean;
  now?: Date;
  sourceUrl?: string | null;
  rawPayloadRef?: string | null;
  serverFetch?: (request: {
    url: string;
    timeoutMs: number;
    headers?: Record<string, string>;
  }) => Promise<unknown>;
}

export interface ProviderAdapterRunContext extends ProviderAdapterContext {
  forceRefresh?: boolean;
}

export interface ProviderAdapter {
  providerId: ECS5ProviderId | string;
  fetch(input: unknown, context: ProviderAdapterContext): Promise<unknown> | unknown;
  normalize(rawPayload: unknown, context: ProviderAdapterContext): SourceObservation[] | Promise<SourceObservation[]>;
  getHealth(): ProviderDefinition | null;
  getKnownLimitations(): string[];
  getDefaultConfidence(): number;
  getCacheTtl(): number;
  supportsFixtureMode: boolean;
  supportsLiveMode: boolean;
}

export interface ObservationCacheRecord {
  key: string;
  providerId: string;
  observations: SourceObservation[];
  cachedAt: string;
  expiresAt: string;
  lastVerifiedAt: string;
  validUntil: string;
  staleAt: string;
  offlineCacheEligible: boolean;
  offlineWarning: string | null;
  staleReason: string | null;
  contentHash: string;
}

export interface AdapterRunResult {
  providerId: string;
  observations: SourceObservation[];
  cacheStatus: SourceObservationCacheStatus;
  stale: boolean;
  warnings: string[];
  contentHash: string | null;
}

export interface ProviderAdapterRegistryOptions {
  providerRegistry?: ECS5ProviderRegistry;
  cache?: ECS5ObservationCache;
}

export class ECS5ObservationCache {
  private records = new Map<string, ObservationCacheRecord>();

  get(key: string, now = new Date()): { record: ObservationCacheRecord; stale: boolean } | null {
    const record = this.records.get(key);
    if (!record) return null;
    return {
      record,
      stale: Date.parse(record.staleAt ?? record.expiresAt) <= now.getTime(),
    };
  }

  set(key: string, providerId: string, observations: SourceObservation[], ttlSeconds: number, now = new Date()): ObservationCacheRecord {
    const contentHash = stableContentHash(observations.map((observation) => observation.contentHash).sort());
    const metadata = buildECS5OfflineCacheMetadata({
      providerId,
      observedAt: observations[0]?.observedAt,
      publishedAt: observations[0]?.publishedAt,
      ingestedAt: observations[0]?.ingestedAt,
      expiresAt: observations[0]?.expiresAt,
      offlineCacheEligible: observations.some((observation) => observation.offlineCacheEligible),
    }, now);
    const adapterExpiresAt = new Date(now.getTime() + Math.max(0, ttlSeconds) * 1000).toISOString();
    const staleAt = earlierIso(metadata.staleAt, adapterExpiresAt);
    const validUntil = earlierIso(metadata.validUntil, adapterExpiresAt);
    const record: ObservationCacheRecord = {
      key,
      providerId,
      observations: observations.map((observation) => ({
        ...observation,
        cachedAt: metadata.cachedAt,
        lastVerifiedAt: metadata.lastVerifiedAt,
        validUntil,
        staleAt,
        offlineWarning: metadata.offlineWarning,
        staleReason: metadata.staleReason,
      })),
      cachedAt: metadata.cachedAt,
      expiresAt: adapterExpiresAt,
      lastVerifiedAt: metadata.lastVerifiedAt,
      validUntil,
      staleAt,
      offlineCacheEligible: metadata.offlineCacheEligible,
      offlineWarning: metadata.offlineWarning,
      staleReason: metadata.staleReason,
      contentHash,
    };
    this.records.set(key, record);
    return record;
  }

  clear(): void {
    this.records.clear();
  }
}

export class ECS5ProviderAdapterRegistry {
  private adapters = new Map<string, ProviderAdapter>();
  private providerRegistry: ECS5ProviderRegistry;
  private cache: ECS5ObservationCache;

  constructor(options: ProviderAdapterRegistryOptions = {}) {
    this.providerRegistry = options.providerRegistry ?? createECS5ProviderRegistry();
    this.cache = options.cache ?? new ECS5ObservationCache();
  }

  registerAdapter(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
  }

  getAdapter(providerId: string): ProviderAdapter | null {
    return this.adapters.get(providerId) ?? null;
  }

  listAdapters(): ProviderAdapter[] {
    return [...this.adapters.values()];
  }

  async runAdapter(providerId: string, input: unknown = {}, context: ProviderAdapterRunContext = {}): Promise<AdapterRunResult> {
    const adapter = this.getAdapter(providerId);
    const provider = getProviderConfig(providerId as ECS5ProviderId, this.providerRegistry);
    if (!adapter || !provider) {
      return blockedResult(providerId, 'unavailable', 'Provider adapter is not registered.');
    }

    const blocked = blockedProviderResult(provider);
    if (blocked) return blocked;

    const now = context.now ?? new Date();
    const cacheKey = buildProviderCacheKey(providerId, input);
    const cached = this.cache.get(cacheKey, now);
    if (cached && !context.forceRefresh) {
      return {
        providerId,
        observations: cached.stale
          ? decayStaleObservations(cached.record.observations, now)
          : cached.record.observations,
        cacheStatus: cached.stale ? 'hit_stale' : 'hit_fresh',
        stale: cached.stale,
        warnings: cached.stale ? ['Cached provider observations are stale and confidence was reduced.'] : [],
        contentHash: cached.record.contentHash,
      };
    }

    const adapterContext = { ...context, provider, registry: this.providerRegistry, now };
    const rawPayload = await adapter.fetch(input, adapterContext);
    const rawContentHash = stableContentHash(rawPayload);
    const rawPayloadRef = context.rawPayloadRef ?? `hash:${rawContentHash}`;
    const observations = await adapter.normalize(rawPayload, {
      ...adapterContext,
      rawPayloadRef,
    });
    const normalized = observations.map((observation) =>
      finalizeObservation(observation, adapter, provider, rawContentHash, adapterContext));
    const record = this.cache.set(cacheKey, providerId, normalized, adapter.getCacheTtl(), now);

    return {
      providerId,
      observations: normalized,
      cacheStatus: 'miss',
      stale: false,
      warnings: [],
      contentHash: record.contentHash,
    };
  }

  async normalizeProviderPayload(
    providerId: string,
    rawPayload: unknown,
    context: ProviderAdapterContext = {},
  ): Promise<SourceObservation[]> {
    const adapter = this.getAdapter(providerId);
    const provider = getProviderConfig(providerId as ECS5ProviderId, this.providerRegistry);
    if (!adapter || !provider) return [];
    const rawContentHash = stableContentHash(rawPayload);
    const adapterContext = {
      ...context,
      provider,
      registry: this.providerRegistry,
      rawPayloadRef: context.rawPayloadRef ?? `hash:${rawContentHash}`,
      now: context.now ?? new Date(),
    };
    const observations = await adapter.normalize(rawPayload, adapterContext);
    return observations.map((observation) =>
      finalizeObservation(observation, adapter, provider, rawContentHash, adapterContext));
  }
}

export function createDefaultECS5ProviderAdapterRegistry(
  options: ProviderAdapterRegistryOptions = {},
): ECS5ProviderAdapterRegistry {
  const registry = new ECS5ProviderAdapterRegistry(options);
  for (const provider of listProviderHealth(options.providerRegistry ?? createECS5ProviderRegistry())) {
    registry.registerAdapter(createGenericFixtureProviderAdapter(provider));
  }
  return registry;
}

export function createGenericFixtureProviderAdapter(provider: ProviderDefinition): ProviderAdapter {
  return {
    providerId: provider.id,
    supportsFixtureMode: true,
    supportsLiveMode: false,
    fetch(input: any, context: ProviderAdapterContext): unknown {
      if (context.fixtureMode && input && typeof input === 'object' && 'fixturePayload' in input) {
        return input.fixturePayload;
      }
      if (input && typeof input === 'object' && 'rawPayload' in input) {
        return input.rawPayload;
      }
      return {
        id: `${provider.id}:empty`,
        sourceName: provider.displayName,
        subjectType: defaultSubjectType(provider),
        message: 'No live provider fetch is wired for this adapter.',
      };
    },
    normalize(rawPayload: unknown, context: ProviderAdapterContext): SourceObservation[] {
      return normalizeGenericProviderPayload(rawPayload, provider, context);
    },
    getHealth(): ProviderDefinition | null {
      return provider;
    },
    getKnownLimitations(): string[] {
      return provider.knownLimitations;
    },
    getDefaultConfidence(): number {
      return defaultProviderConfidence(provider);
    },
    getCacheTtl(): number {
      return provider.cacheTtlSeconds;
    },
  };
}

export function normalizeGenericProviderPayload(
  rawPayload: unknown,
  provider: ProviderDefinition,
  context: ProviderAdapterContext = {},
): SourceObservation[] {
  const items: unknown[] = Array.isArray(rawPayload)
    ? rawPayload
    : Array.isArray((rawPayload as any)?.items)
      ? (rawPayload as any).items
      : Array.isArray((rawPayload as any)?.features)
        ? (rawPayload as any).features
        : [rawPayload];
  const ingestedAt = (context.now ?? new Date()).toISOString();
  const rawHash = stableContentHash(rawPayload);

  return items.map((item, index) => {
    const record = isRecord(item) ? item : {};
    const properties = isRecord(record.properties) ? record.properties : record;
    const observedAt = normalizeTimestamp(
      properties.observedAt ?? properties.observed_at ?? properties.updated ?? properties.updatedAt ?? properties.eventDate,
    );
    const publishedAt = normalizeTimestamp(properties.publishedAt ?? properties.published_at ?? properties.created ?? properties.createdAt);
    const subjectType = normalizeSubjectType(properties.subjectType ?? properties.type, provider);
    const sourceType = normalizeSourceType(properties.sourceType, provider);
    const contentHash = stableContentHash({ providerId: provider.id, index, item });
    return {
      id: String(properties.id ?? properties.objectId ?? `${provider.id}:${contentHash.slice(0, 12)}`),
      providerId: provider.id,
      sourceName: String(properties.sourceName ?? provider.displayName),
      sourceType,
      subjectType,
      subjectId: normalizeNullableString(properties.subjectId ?? properties.routeId ?? properties.segmentId),
      geometry: normalizeGeometry(record.geometry ?? properties.geometry),
      bbox: normalizeBbox(record.bbox ?? properties.bbox),
      observedAt,
      publishedAt,
      ingestedAt,
      expiresAt: new Date(Date.parse(ingestedAt) + provider.staleAfterSeconds * 1000).toISOString(),
      rawPayloadRef: context.rawPayloadRef ?? `hash:${rawHash}`,
      normalizedPayload: sanitizeNormalizedPayload(properties),
      evidenceUrl: normalizeNullableString(properties.evidenceUrl ?? properties.url ?? context.sourceUrl),
      contentHash,
      confidenceScore: defaultProviderConfidence(provider),
      confidenceBreakdown: buildConfidenceBreakdown(defaultProviderConfidence(provider), false),
      knownLimitations: [...provider.knownLimitations],
      supersedesObservationId: normalizeNullableString(properties.supersedesObservationId),
      offlineCacheEligible: provider.cacheTtlSeconds > 0,
    };
  });
}

export function buildProviderCacheKey(providerId: string, input: unknown): string {
  const query = isRecord(input) ? input : {};
  const parts = [
    providerId,
    normalizeCachePart(query.query ?? query.q),
    normalizeCoordinate(query.lat),
    normalizeCoordinate(query.lon ?? query.lng),
    normalizeBboxPart(query.bbox),
    normalizeCachePart(query.timeWindow ?? query.window ?? query.date),
    stableContentHash(query.params ?? {}),
  ];
  return parts.join('::');
}

export function stableContentHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `obs_${(hash >>> 0).toString(36)}`;
}

function finalizeObservation(
  observation: SourceObservation,
  adapter: ProviderAdapter,
  provider: ProviderDefinition,
  rawContentHash: string,
  context: ProviderAdapterContext,
): SourceObservation {
  const ingestedAt = observation.ingestedAt || (context.now ?? new Date()).toISOString();
  const contentHash = observation.contentHash || stableContentHash(observation.normalizedPayload);
  const sourceType = observation.sourceType ?? defaultSourceType(provider);
  const subjectType = observation.subjectType ?? defaultSubjectType(provider);
  const metadata = buildECS5OfflineCacheMetadata({
    providerId: provider.id,
    subjectType,
    observedAt: observation.observedAt,
    publishedAt: observation.publishedAt,
    ingestedAt,
    expiresAt: observation.expiresAt,
    offlineCacheEligible: observation.offlineCacheEligible ?? provider.cacheTtlSeconds > 0,
  }, context.now ?? new Date());
  return {
    ...observation,
    providerId: provider.id,
    sourceName: observation.sourceName || provider.displayName,
    sourceType,
    subjectType,
    ingestedAt,
    rawPayloadRef: observation.rawPayloadRef ?? context.rawPayloadRef ?? `hash:${rawContentHash}`,
    contentHash,
    confidenceScore: clampConfidence(observation.confidenceScore ?? adapter.getDefaultConfidence()),
    confidenceBreakdown: observation.confidenceBreakdown ?? buildConfidenceBreakdown(adapter.getDefaultConfidence(), false),
    knownLimitations: observation.knownLimitations?.length ? observation.knownLimitations : adapter.getKnownLimitations(),
    offlineCacheEligible: observation.offlineCacheEligible ?? provider.cacheTtlSeconds > 0,
    cachedAt: observation.cachedAt ?? metadata.cachedAt,
    lastVerifiedAt: observation.lastVerifiedAt ?? metadata.lastVerifiedAt,
    validUntil: observation.validUntil ?? metadata.validUntil,
    staleAt: observation.staleAt ?? metadata.staleAt,
    offlineWarning: observation.offlineWarning ?? metadata.offlineWarning,
    staleReason: observation.staleReason ?? metadata.staleReason,
  };
}

function blockedProviderResult(provider: ProviderDefinition): AdapterRunResult | null {
  if (provider.status === 'intentionally_disabled' || provider.enabled === false) {
    return blockedResult(provider.id, 'disabled', `${provider.displayName} is intentionally disabled.`);
  }
  if (provider.status === 'missing_config') {
    return blockedResult(provider.id, 'missing_config', `${provider.displayName} is missing required configuration.`);
  }
  if (provider.status === 'unavailable') {
    return blockedResult(provider.id, 'unavailable', `${provider.displayName} is unavailable.`);
  }
  return null;
}

function blockedResult(
  providerId: string,
  cacheStatus: SourceObservationCacheStatus,
  warning: string,
): AdapterRunResult {
  return {
    providerId,
    observations: [],
    cacheStatus,
    stale: false,
    warnings: [warning],
    contentHash: null,
  };
}

function decayStaleObservations(observations: SourceObservation[], now: Date): SourceObservation[] {
  return observations.map((observation) => {
    const stale = applyECS5SourceObservationStaleness(observation, now);
    return {
      ...stale,
      sourceType: stale.sourceType === 'unknown' ? 'cached' : stale.sourceType,
      knownLimitations: [
        ...stale.knownLimitations,
        `Returned from stale cache at ${now.toISOString()}.`,
      ],
    };
  });
}

function buildConfidenceBreakdown(providerDefault: number, stale: boolean): SourceObservationConfidenceBreakdown {
  return {
    providerDefault,
    freshness: stale ? 35 : 85,
    sourceAuthority: providerDefault,
    completeness: 70,
    stalePenalty: stale ? 35 : 0,
  };
}

function defaultProviderConfidence(provider: ProviderDefinition): number {
  if (provider.sourceAuthorityDefaults.official && provider.sourceAuthorityDefaults.legallyAuthoritative) return 86;
  if (provider.sourceAuthorityDefaults.official) return 78;
  if (provider.category === 'weather' || provider.category === 'smoke_aqi' || provider.category === 'fire') return 74;
  if (provider.category === 'manual') return 62;
  return 55;
}

function normalizeSourceType(value: unknown, provider: ProviderDefinition): SourceObservationSourceType {
  const raw = String(value ?? '').trim();
  if (isSourceType(raw)) return raw;
  if (provider.id === 'nasa_firms') return 'satellite';
  if (provider.id === 'usfs_mvum' || provider.id === 'blm_plad') return 'official_gis';
  if (provider.category === 'weather') return 'commercial_weather';
  if (provider.category === 'smoke_aqi') return 'official_api';
  if (provider.category === 'manual') return 'manual_admin';
  if (provider.sourceAuthorityDefaults.official) return 'official_api';
  return 'unknown';
}

function normalizeSubjectType(value: unknown, provider: ProviderDefinition): SourceObservationSubjectType {
  const raw = String(value ?? '').trim();
  if (isSubjectType(raw)) return raw;
  return defaultSubjectType(provider);
}

function defaultSourceType(provider: ProviderDefinition): SourceObservationSourceType {
  return normalizeSourceType(null, provider);
}

function defaultSubjectType(provider: ProviderDefinition): SourceObservationSubjectType {
  if (provider.category === 'weather') return 'weather_forecast';
  if (provider.category === 'smoke_aqi') return 'smoke_aqi';
  if (provider.id === 'nasa_firms') return 'active_fire';
  if (provider.category === 'fire') return 'fire_incident';
  if (provider.category === 'legal_access') return 'legal_access';
  if (provider.category === 'closure') return 'closure';
  if (provider.category === 'emergency') return 'agency_notice';
  return 'unknown';
}

function sanitizeNormalizedPayload(value: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/api[_-]?key|token|secret|password/i.test(key)) continue;
    redacted[key] = entry;
  }
  return redacted;
}

function normalizeGeometry(value: unknown): ObservationGeometry | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  if (
    type === 'Point' ||
    type === 'LineString' ||
    type === 'Polygon' ||
    type === 'MultiPolygon' ||
    type === 'GeometryCollection'
  ) {
    return { type, coordinates: value.coordinates ?? null };
  }
  return null;
}

function normalizeBbox(value: unknown): ObservationBBox | null {
  if (Array.isArray(value) && value.length >= 4) {
    const [minLon, minLat, maxLon, maxLat] = value.map(Number);
    if ([minLat, minLon, maxLat, maxLon].every(Number.isFinite)) return { minLat, minLon, maxLat, maxLon };
  }
  if (isRecord(value)) {
    const minLat = Number(value.minLat);
    const minLon = Number(value.minLon);
    const maxLat = Number(value.maxLat);
    const maxLon = Number(value.maxLon);
    if ([minLat, minLon, maxLat, maxLon].every(Number.isFinite)) return { minLat, minLon, maxLat, maxLon };
  }
  return null;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeCachePart(value: unknown): string {
  return String(value ?? 'none').trim().toLowerCase() || 'none';
}

function normalizeCoordinate(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(4) : 'na';
}

function normalizeBboxPart(value: unknown): string {
  const bbox = normalizeBbox(value);
  if (!bbox) return 'no_bbox';
  return [bbox.minLat, bbox.minLon, bbox.maxLat, bbox.maxLon].map((coord) => coord.toFixed(4)).join(',');
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function earlierIso(a: string, b: string): string {
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSourceType(value: string): value is SourceObservationSourceType {
  return [
    'federal_agency',
    'state_agency',
    'local_agency',
    'tribal_agency',
    'official_api',
    'official_webpage',
    'official_gis',
    'commercial_weather',
    'community_report',
    'partner_feed',
    'sensor',
    'satellite',
    'cached',
    'manual_admin',
    'unknown',
  ].includes(value);
}

function isSubjectType(value: string): value is SourceObservationSubjectType {
  return [
    'weather_forecast',
    'weather_alert',
    'smoke_aqi',
    'active_fire',
    'fire_perimeter',
    'fire_incident',
    'legal_access',
    'closure',
    'restriction',
    'road_condition',
    'route_segment',
    'bailout_route',
    'agency_notice',
    'community_condition',
    'unknown',
  ].includes(value);
}
