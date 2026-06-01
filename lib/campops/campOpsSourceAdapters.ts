import type {
  CampAccessDifficulty,
  CampAccessRestrictionStatus,
  CampCandidateEnrichment,
  CampFireRestrictionStatus,
  CampFireUseDecision,
  CampFitStatus,
  CampImpactLevel,
  CampLegalStatus,
  CampLikelihoodLevel,
  CampOpsConfidence,
  CampOpsDataSource,
  CampOpsEstimate,
  CampOpsForecastTimeWindow,
  CampOpsImpact,
  CampOpsRestrictionWindow,
  CampOpsRiskLevel,
  CampOpsSourceCacheMetadata,
  CampOpsServiceAvailability,
  CampOpsWeatherExposureLevel,
  CampPublicAccessStatus,
  CampCandidate,
  CampSearchContext,
  CampOpsSourceResolutionSummary,
} from './campOpsTypes';
import {
  resolveCampOpsSourceConflicts,
  type CampOpsSourceResolutionConfig,
} from './campOpsSourceResolution';

export type CampOpsExternalSourceSignal = CampOpsSourceCacheMetadata & {
  source: CampOpsDataSource;
  confidence: CampOpsConfidence;
  observedAtIso?: string | null;
  staleAfterMinutes?: number | null;
  legalStatus?: CampLegalStatus | null;
  legalConfidence?: CampOpsConfidence | null;
  closureStatus?: CampAccessRestrictionStatus | null;
  closureReason?: string | null;
  restrictionWindow?: CampOpsRestrictionWindow | null;
  closureAppliesToCamping?: boolean | null;
  closureAppliesToVehicleAccess?: boolean | null;
  closureAppliesToFires?: boolean | null;
  publicAccessStatus?: CampPublicAccessStatus | null;
  accessDifficulty?: CampAccessDifficulty | null;
  vehicleFit?: CampFitStatus | null;
  trailerSuitability?: CampFitStatus | null;
  turnaroundSuitability?: CampFitStatus | null;
  groupCapacityEstimate?: number | null;
  fuelImpact?: CampOpsImpact | null;
  waterImpact?: CampOpsImpact | null;
  reliableWaterRefillAvailable?: boolean | null;
  terrainSlopeEstimate?: CampOpsEstimate | null;
  weatherExposure?: CampImpactLevel | null;
  weatherExposureLevel?: CampOpsWeatherExposureLevel | null;
  forecastTimeWindow?: CampOpsForecastTimeWindow | null;
  windSpeedMph?: number | null;
  windGustMph?: number | null;
  windDirection?: string | null;
  precipitationRisk?: CampOpsRiskLevel | null;
  stormRisk?: CampOpsRiskLevel | null;
  temperatureLowF?: number | null;
  temperatureHighF?: number | null;
  heatRisk?: CampOpsRiskLevel | null;
  coldRisk?: CampOpsRiskLevel | null;
  lateArrivalRisk?: CampImpactLevel | null;
  fireRestrictionStatus?: CampFireRestrictionStatus | null;
  campfireAllowed?: CampFireUseDecision | null;
  stoveAllowed?: CampFireUseDecision | null;
  fireRestrictionLevel?: string | null;
  redFlagRisk?: CampOpsRiskLevel | null;
  smokeOrAirQualityRisk?: CampOpsRiskLevel | null;
  fireRestrictionConflict?: boolean | null;
  emergencyRestrictionConflict?: boolean | null;
  recoveryFriendly?: boolean | null;
  exitDistanceMiles?: number | null;
  serviceDistanceMiles?: number | null;
  nearestFuel?: CampOpsServiceAvailability | null;
  nearestWater?: CampOpsServiceAvailability | null;
  nearestPropane?: CampOpsServiceAvailability | null;
  nearestDump?: CampOpsServiceAvailability | null;
  nearestRepair?: CampOpsServiceAvailability | null;
  nearestTownOrExit?: CampOpsServiceAvailability | null;
  privacyLikelihood?: CampLikelihoodLevel | null;
  occupancyLikelihood?: CampLikelihoodLevel | null;
  sourceResolutions?: CampOpsSourceResolutionSummary[];
  dataLimitations?: string[];
};

export const CAMP_OPS_SOURCE_CATEGORIES = [
  'legal',
  'closure',
  'access',
  'fire',
  'weather',
  'service',
  'freshness',
  'resource',
  'terrain',
  'occupancy',
  'privacy',
  'unknown',
] as const;
export type CampOpsSourceCategory = (typeof CAMP_OPS_SOURCE_CATEGORIES)[number];

export const CAMP_OPS_SOURCE_FRESHNESS_STATES = ['fresh', 'stale', 'expired', 'missing', 'unknown'] as const;
export type CampOpsSourceFreshness = (typeof CAMP_OPS_SOURCE_FRESHNESS_STATES)[number];

export type CampOpsProviderRawStatus =
  | string
  | number
  | boolean
  | null
  | Record<string, string | number | boolean | null>;

export type CampOpsSourceProviderConfig = {
  providersEnabled: boolean;
  enabledProviderIds?: string[] | null;
  disabledProviderIds?: string[] | null;
  defaultStaleAfterMinutes: number;
  resolutionConfig?: Partial<CampOpsSourceResolutionConfig> | null;
};

export type CampOpsSourceProviderRequest = {
  context: CampSearchContext;
  candidates: CampCandidate[];
  currentTimeIso: string;
};

export type CampOpsSourceProviderResult = {
  candidateId: string | null;
  providerId: string;
  providerDisplayName: string;
  sourceCategory: CampOpsSourceCategory;
  sourceConfidence: CampOpsConfidence;
  sourceFreshness: CampOpsSourceFreshness;
  sourceTimestampIso: string | null;
  rawProviderStatus?: CampOpsProviderRawStatus;
  signal: CampOpsExternalSourceSignal | null;
  warnings: string[];
  errors: string[];
  missingDataReason: string | null;
};

export interface CampOpsSourceProvider {
  id: string;
  displayName: string;
  sourceCategory: CampOpsSourceCategory;
  sourceConfidence: CampOpsConfidence;
  staleAfterMinutes?: number | null;
  collectSignals(
    request: CampOpsSourceProviderRequest,
  ): CampOpsSourceProviderResult[] | Promise<CampOpsSourceProviderResult[]>;
}

export type CampOpsSourceProviderBundle = {
  providerResults: CampOpsSourceProviderResult[];
  signalsByCandidateId: Record<string, CampOpsExternalSourceSignal[]>;
  resolutionsByCandidateId: Record<string, CampOpsSourceResolutionSummary[]>;
  warnings: string[];
  errors: string[];
};

export type CampOpsSourceProviderCollectionInput = {
  providers?: CampOpsSourceProvider[] | null;
  context: CampSearchContext;
  candidates: CampCandidate[];
  config?: Partial<CampOpsSourceProviderConfig> | null;
};

export const DEFAULT_CAMP_OPS_SOURCE_PROVIDER_CONFIG: CampOpsSourceProviderConfig = {
  providersEnabled: true,
  enabledProviderIds: null,
  disabledProviderIds: null,
  defaultStaleAfterMinutes: 24 * 60,
  resolutionConfig: null,
};
export const CAMP_OPS_SOURCE_SIGNAL_CACHE_RETENTION_DAYS = 14;

export type CampOpsSourceSignalMergeInput = {
  enrichment: CampCandidateEnrichment;
  signals?: CampOpsExternalSourceSignal[] | null;
  currentTimeIso: string;
};

const CONFIDENCE_RANK: Record<CampOpsConfidence, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const RESTRICTIVE_LEGAL_STATUSES = new Set<CampLegalStatus>(['restricted', 'prohibited']);
const RESTRICTIVE_CLOSURE_STATUSES = new Set<CampAccessRestrictionStatus>(['seasonal', 'restricted', 'closed']);
const RESTRICTIVE_PUBLIC_ACCESS_STATUSES = new Set<CampPublicAccessStatus>([
  'private',
  'permission_required',
]);
const RESTRICTIVE_FIRE_STATUSES = new Set<CampFireRestrictionStatus>(['restricted', 'fire_ban']);
const RESTRICTIVE_FIRE_USE_DECISIONS = new Set<CampFireUseDecision>(['no', 'restricted']);

const RISK_RANK: Record<CampOpsRiskLevel, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const IMPACT_RANK: Record<CampImpactLevel, number> = {
  unknown: 0,
  positive: 1,
  neutral: 2,
  watch: 3,
  caution: 4,
  critical: 5,
};

function minutesSince(observedAtIso: string | null | undefined, currentTimeIso: string): number | null {
  if (!observedAtIso) return null;
  const observedMs = Date.parse(observedAtIso);
  const currentMs = Date.parse(currentTimeIso);
  if (!Number.isFinite(observedMs) || !Number.isFinite(currentMs)) return null;
  return Math.max(0, Math.round((currentMs - observedMs) / 60_000));
}

function isPast(timestampIso: string | null | undefined, currentTimeIso: string): boolean {
  if (!timestampIso) return false;
  const timestampMs = Date.parse(timestampIso);
  const currentMs = Date.parse(currentTimeIso);
  return Number.isFinite(timestampMs) && Number.isFinite(currentMs) && timestampMs <= currentMs;
}

function sourceTimestampForCache(signal: Pick<CampOpsExternalSourceSignal, 'observedAtIso' | 'sourceGeneratedAt' | 'cachedAt' | 'retrievedAt'>): string | null {
  return signal.sourceGeneratedAt ?? signal.observedAtIso ?? signal.cachedAt ?? signal.retrievedAt ?? null;
}

export function resolveCampOpsSourceCacheMetadata(
  signal: Pick<CampOpsExternalSourceSignal, 'observedAtIso' | 'staleAfterMinutes' | 'cachedAt' | 'expiresAt' | 'sourceGeneratedAt' | 'retrievedAt' | 'freshnessStatus' | 'offlineAvailable'>,
  currentTimeIso: string,
): Required<Pick<CampOpsSourceCacheMetadata, 'freshnessStatus'>> & CampOpsSourceCacheMetadata {
  const timestamp = sourceTimestampForCache(signal);
  let freshnessStatus = signal.freshnessStatus ?? 'unknown';
  if (isPast(signal.expiresAt, currentTimeIso)) {
    freshnessStatus = 'expired';
  } else if (signal.staleAfterMinutes != null) {
    const ageMinutes = minutesSince(timestamp, currentTimeIso);
    if (ageMinutes != null) {
      freshnessStatus = ageMinutes > signal.staleAfterMinutes ? 'stale' : 'fresh';
    }
  } else if (!signal.freshnessStatus && timestamp) {
    freshnessStatus = 'fresh';
  }

  return {
    cachedAt: signal.cachedAt ?? null,
    expiresAt: signal.expiresAt ?? null,
    sourceGeneratedAt: signal.sourceGeneratedAt ?? signal.observedAtIso ?? null,
    retrievedAt: signal.retrievedAt ?? signal.cachedAt ?? null,
    freshnessStatus,
    offlineAvailable: signal.offlineAvailable ?? (signal.cachedAt || signal.retrievedAt ? true : null),
  };
}

function isCacheFreshnessStale(freshnessStatus: CampOpsSourceCacheMetadata['freshnessStatus']): boolean {
  return freshnessStatus === 'stale' || freshnessStatus === 'expired';
}

export function isCampOpsSourceSignalStale(
  signal: Pick<CampOpsExternalSourceSignal, 'observedAtIso' | 'staleAfterMinutes' | 'cachedAt' | 'expiresAt' | 'sourceGeneratedAt' | 'retrievedAt' | 'freshnessStatus' | 'offlineAvailable'>,
  currentTimeIso: string,
): boolean {
  const cache = resolveCampOpsSourceCacheMetadata(signal, currentTimeIso);
  if (isCacheFreshnessStale(cache.freshnessStatus)) return true;
  if (signal.staleAfterMinutes == null) return false;
  const ageMinutes = minutesSince(sourceTimestampForCache(signal), currentTimeIso);
  return ageMinutes != null && ageMinutes > signal.staleAfterMinutes;
}

function confidenceAtLeast(a: CampOpsConfidence, b: CampOpsConfidence): boolean {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b];
}

function shouldOverrideConfidence(current: CampOpsConfidence, incoming: CampOpsConfidence, stale: boolean): boolean {
  if (stale && incoming !== 'high') return false;
  return confidenceAtLeast(incoming, current);
}

function lowerConfidence(confidence: CampOpsConfidence): CampOpsConfidence {
  if (confidence === 'high') return 'medium';
  if (confidence === 'medium') return 'low';
  return 'unknown';
}

function shouldOverrideRestrictive<T extends string>(
  current: T | null | undefined,
  incoming: T | null | undefined,
  restrictiveValues: Set<T>,
  incomingConfidence: CampOpsConfidence,
  stale: boolean,
  allowStalePositive = false,
): boolean {
  if (!incoming) return false;
  if (current && restrictiveValues.has(current) && !restrictiveValues.has(incoming)) return false;
  if (restrictiveValues.has(incoming)) {
    if (current && current !== 'unknown' && !restrictiveValues.has(current) && incomingConfidence === 'low') return false;
    return true;
  }
  if (stale && !(allowStalePositive && (!current || current === 'unknown'))) return false;
  if (!current || current === 'unknown') return true;
  return confidenceAtLeast(incomingConfidence, 'medium');
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function appendUnique(base: string[] | undefined, additions: string[]): string[] {
  return Array.from(new Set([...(base ?? []), ...additions].filter(Boolean)));
}

function shouldOverrideFireUseDecision(
  current: CampFireUseDecision | null | undefined,
  incoming: CampFireUseDecision | null | undefined,
  incomingConfidence: CampOpsConfidence,
  stale: boolean,
): boolean {
  if (!incoming) return false;
  if (incoming === 'unknown' && !current) return true;
  if (RESTRICTIVE_FIRE_USE_DECISIONS.has(incoming)) return !stale || incomingConfidence === 'high';
  if (stale) return false;
  if (!current || current === 'unknown') return true;
  if (RESTRICTIVE_FIRE_USE_DECISIONS.has(current)) return false;
  return confidenceAtLeast(incomingConfidence, 'medium');
}

function shouldOverrideRiskLevel(
  current: CampOpsRiskLevel | null | undefined,
  incoming: CampOpsRiskLevel | null | undefined,
  stale: boolean,
): boolean {
  if (!incoming) return false;
  if (incoming === 'unknown' && !current) return true;
  if (stale && incoming !== 'high') return false;
  if (!current) return true;
  return RISK_RANK[incoming] >= RISK_RANK[current];
}

function shouldOverrideImpactLevel(
  current: CampImpactLevel | null | undefined,
  incoming: CampImpactLevel | null | undefined,
  stale: boolean,
): boolean {
  if (!incoming) return false;
  if (incoming === 'unknown' && !current) return true;
  if (stale && incoming !== 'critical') return false;
  if (!current) return true;
  return IMPACT_RANK[incoming] >= IMPACT_RANK[current];
}

function resolveCampOpsSourceProviderConfig(
  config?: Partial<CampOpsSourceProviderConfig> | null,
): CampOpsSourceProviderConfig {
  return {
    ...DEFAULT_CAMP_OPS_SOURCE_PROVIDER_CONFIG,
    ...(config ?? {}),
  };
}

function providerEnabled(provider: CampOpsSourceProvider, config: CampOpsSourceProviderConfig): boolean {
  if (!config.providersEnabled) return false;
  if (config.enabledProviderIds?.length && !config.enabledProviderIds.includes(provider.id)) return false;
  if (config.disabledProviderIds?.includes(provider.id)) return false;
  return true;
}

function sourceFreshness(
  observedAtIso: string | null | undefined,
  staleAfterMinutes: number | null | undefined,
  currentTimeIso: string,
  cacheMetadata?: CampOpsSourceCacheMetadata | null,
): CampOpsSourceFreshness {
  const metadata = resolveCampOpsSourceCacheMetadata({
    observedAtIso,
    staleAfterMinutes,
    cachedAt: cacheMetadata?.cachedAt,
    expiresAt: cacheMetadata?.expiresAt,
    sourceGeneratedAt: cacheMetadata?.sourceGeneratedAt,
    retrievedAt: cacheMetadata?.retrievedAt,
    freshnessStatus: cacheMetadata?.freshnessStatus,
    offlineAvailable: cacheMetadata?.offlineAvailable,
  }, currentTimeIso);
  if (metadata.freshnessStatus === 'expired') return 'expired';
  if (metadata.freshnessStatus === 'stale') return 'stale';
  if (metadata.freshnessStatus === 'fresh') return 'fresh';
  if (!observedAtIso && !cacheMetadata?.cachedAt && !cacheMetadata?.retrievedAt && !cacheMetadata?.sourceGeneratedAt) return 'unknown';
  if (staleAfterMinutes == null) return 'fresh';
  return isCampOpsSourceSignalStale({ observedAtIso, staleAfterMinutes }, currentTimeIso) ? 'stale' : 'fresh';
}

function sourceCategoryLabel(category: CampOpsSourceCategory): string {
  if (category === 'legal' || category === 'access') return 'Legal/access';
  if (category === 'closure') return 'Closure';
  if (category === 'fire') return 'Fire restriction';
  if (category === 'weather') return 'Weather';
  if (category === 'service') return 'Service';
  return `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

function freshnessWarning(category: CampOpsSourceCategory, freshness: CampOpsSourceFreshness): string | null {
  if (freshness === 'stale') return `${sourceCategoryLabel(category)} source data is stale.`;
  if (freshness === 'expired') return `${sourceCategoryLabel(category)} source data is expired.`;
  if (freshness === 'missing') return `${sourceCategoryLabel(category)} source data is missing.`;
  return null;
}

function normalizeRawProviderStatus(value: unknown): CampOpsProviderRawStatus | undefined {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value === 'string' ? redactCampOpsSourceSummaryForOfflineCache(value) : value as CampOpsProviderRawStatus;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (/secret|token|password|api[_-]?key|credential/i.test(key)) continue;
    if (entry == null || typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      safe[key] = typeof entry === 'string'
        ? redactCampOpsSourceSummaryForOfflineCache(entry)
        : entry as string | number | boolean | null;
    }
  }
  return safe;
}

export function redactCampOpsSourceSummaryForOfflineCache(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const sanitized = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  if (!sanitized) return null;
  return sanitized
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted email]')
    .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, '[redacted phone]')
    .replace(/\b(?:user|vehicle|vin|plate|license|trip|convoy)\s*[:#-]\s*[A-Z0-9_-]{3,}\b/gi, '[redacted identifier]')
    .replace(/\b(?:file|content):\/\/\S+/gi, '[redacted local ref]')
    .replace(/\b-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/g, '[redacted precise coordinates]');
}

export function redactCampOpsSourceSignalForOfflineCache(
  signal: CampOpsExternalSourceSignal,
): CampOpsExternalSourceSignal {
  return {
    ...signal,
    dataLimitations: signal.dataLimitations
      ?.map((limitation) => redactCampOpsSourceSummaryForOfflineCache(limitation))
      .filter((limitation): limitation is string => Boolean(limitation)),
    sourceResolutions: signal.sourceResolutions?.map((resolution) => ({
      ...resolution,
      conflictSummary: redactCampOpsSourceSummaryForOfflineCache(resolution.conflictSummary) ?? null,
      sourceSummaries: resolution.sourceSummaries
        .map((summary) => redactCampOpsSourceSummaryForOfflineCache(summary))
        .filter((summary): summary is string => Boolean(summary)),
      staleSources: resolution.staleSources
        .map((summary) => redactCampOpsSourceSummaryForOfflineCache(summary))
        .filter((summary): summary is string => Boolean(summary)),
      missingSources: resolution.missingSources
        .map((summary) => redactCampOpsSourceSummaryForOfflineCache(summary))
        .filter((summary): summary is string => Boolean(summary)),
    })),
  };
}

export function redactCampOpsProviderResultForOfflineCache(
  result: CampOpsSourceProviderResult,
): CampOpsSourceProviderResult {
  return {
    ...result,
    rawProviderStatus: normalizeRawProviderStatus(result.rawProviderStatus),
    signal: result.signal ? redactCampOpsSourceSignalForOfflineCache(result.signal) : null,
    warnings: result.warnings
      .map((warning) => redactCampOpsSourceSummaryForOfflineCache(warning))
      .filter((warning): warning is string => Boolean(warning)),
    errors: result.errors
      .map((error) => redactCampOpsSourceSummaryForOfflineCache(error))
      .filter((error): error is string => Boolean(error)),
    missingDataReason: redactCampOpsSourceSummaryForOfflineCache(result.missingDataReason),
  };
}

function normalizeProviderResult(
  provider: CampOpsSourceProvider,
  result: Partial<CampOpsSourceProviderResult>,
  currentTimeIso: string,
  defaultStaleAfterMinutes: number,
  context: CampSearchContext,
): CampOpsSourceProviderResult {
  const signal = result.signal ?? null;
  const cacheMetadata = signal ? resolveCampOpsSourceCacheMetadata(signal, currentTimeIso) : null;
  const timestamp = result.sourceTimestampIso ?? signal?.sourceGeneratedAt ?? signal?.observedAtIso ?? signal?.retrievedAt ?? signal?.cachedAt ?? null;
  const staleAfterMinutes = signal?.staleAfterMinutes ?? provider.staleAfterMinutes ?? defaultStaleAfterMinutes;
  const missingDataReason = result.missingDataReason ?? (!signal ? 'Provider returned no CampOps source signal.' : null);
  const warnings = [...(result.warnings ?? [])];
  const offlineMode = context.offlineMode === 'offline' || context.offlineMode === 'degraded';
  const unavailableOffline = offlineMode && signal?.offlineAvailable === false;
  const freshness = unavailableOffline
    ? 'missing'
    : result.sourceFreshness ?? (missingDataReason ? 'missing' : sourceFreshness(timestamp, staleAfterMinutes, currentTimeIso, cacheMetadata));
  const categoryWarning = freshnessWarning(result.sourceCategory ?? provider.sourceCategory, freshness);
  if (freshness === 'stale') warnings.push(`${provider.displayName} data is stale.`);
  if (freshness === 'expired') warnings.push(`${provider.displayName} data is expired.`);
  if (categoryWarning) warnings.push(categoryWarning);
  if (unavailableOffline) warnings.push(`${provider.displayName} is unavailable offline and no cached CampOps source signal is available.`);
  const redactedSignal = signal ? redactCampOpsSourceSignalForOfflineCache(signal) : null;
  const redactedMissingDataReason = redactCampOpsSourceSummaryForOfflineCache(missingDataReason);
  const redactedWarnings = warnings
    .map((warning) => redactCampOpsSourceSummaryForOfflineCache(warning))
    .filter((warning): warning is string => Boolean(warning));
  const redactedErrors = (result.errors ?? [])
    .map((error) => redactCampOpsSourceSummaryForOfflineCache(error))
    .filter((error): error is string => Boolean(error));

  return {
    candidateId: result.candidateId ?? null,
    providerId: result.providerId ?? provider.id,
    providerDisplayName: result.providerDisplayName ?? provider.displayName,
    sourceCategory: result.sourceCategory ?? provider.sourceCategory,
    sourceConfidence: result.sourceConfidence ?? signal?.confidence ?? provider.sourceConfidence,
    sourceFreshness: freshness,
    sourceTimestampIso: timestamp,
    rawProviderStatus: normalizeRawProviderStatus(result.rawProviderStatus),
    signal: redactedSignal && !unavailableOffline
      ? {
          ...redactedSignal,
          ...(cacheMetadata ?? {}),
          staleAfterMinutes,
          dataLimitations: appendUnique(redactedSignal.dataLimitations, [
            ...(freshness === 'stale' ? [`${provider.displayName} data is stale.`] : []),
            ...(freshness === 'expired' ? [`${provider.displayName} data is expired.`] : []),
            ...(categoryWarning ? [categoryWarning] : []),
            ...(redactedMissingDataReason ? [redactedMissingDataReason] : []),
          ]),
        }
      : null,
    warnings: appendUnique([], redactedWarnings),
    errors: appendUnique([], redactedErrors),
    missingDataReason: unavailableOffline ? 'No offline CampOps source cache is available for this provider.' : redactedMissingDataReason,
  };
}

function failureResult(
  provider: CampOpsSourceProvider,
  error: unknown,
): CampOpsSourceProviderResult {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown provider failure');
  return {
    candidateId: null,
    providerId: provider.id,
    providerDisplayName: provider.displayName,
    sourceCategory: provider.sourceCategory,
    sourceConfidence: provider.sourceConfidence,
    sourceFreshness: 'unknown',
    sourceTimestampIso: null,
    rawProviderStatus: null,
    signal: null,
    warnings: [],
    errors: [redactCampOpsSourceSummaryForOfflineCache(`${provider.displayName} failed: ${message}`) ?? `${provider.displayName} failed.`],
    missingDataReason: 'Provider failed before returning source data.',
  };
}

function conflictWarnings(results: CampOpsSourceProviderResult[]): string[] {
  const warnings: string[] = [];
  const byCandidate: Record<string, CampOpsSourceProviderResult[]> = {};
  for (const result of results) {
    if (!result.candidateId || !result.signal) continue;
    byCandidate[result.candidateId] = [...(byCandidate[result.candidateId] ?? []), result];
  }
  const fields: Array<keyof CampOpsExternalSourceSignal> = [
    'legalStatus',
    'closureStatus',
    'publicAccessStatus',
    'fireRestrictionStatus',
    'campfireAllowed',
    'stoveAllowed',
    'redFlagRisk',
    'smokeOrAirQualityRisk',
    'weatherExposure',
    'weatherExposureLevel',
    'stormRisk',
    'heatRisk',
    'coldRisk',
  ];
  for (const [candidateId, candidateResults] of Object.entries(byCandidate)) {
    for (const field of fields) {
      const values = new Set(
        candidateResults
          .map((result) => result.signal?.[field])
          .filter((value): value is string => typeof value === 'string' && value.length > 0),
      );
      if (values.size > 1) {
        warnings.push(`Conflicting ${String(field)} source signals for ${candidateId}.`);
      }
    }
  }
  return warnings;
}

export async function collectCampOpsSourceProviderBundle({
  providers,
  context,
  candidates,
  config: configOverrides,
}: CampOpsSourceProviderCollectionInput): Promise<CampOpsSourceProviderBundle> {
  const config = resolveCampOpsSourceProviderConfig(configOverrides);
  const currentTimeIso = context.currentTimeIso;
  const activeProviders = (providers ?? []).filter((provider) => providerEnabled(provider, config));
  const providerResults: CampOpsSourceProviderResult[] = [];

  for (const provider of activeProviders) {
    try {
      const results = await provider.collectSignals({ context, candidates, currentTimeIso });
      for (const result of results ?? []) {
        providerResults.push(normalizeProviderResult(provider, result, currentTimeIso, config.defaultStaleAfterMinutes, context));
      }
    } catch (error) {
      providerResults.push(failureResult(provider, error));
    }
  }

  const resolution = resolveCampOpsSourceConflicts({
    providerResults,
    currentTimeIso,
    config: config.resolutionConfig ?? {},
  });
  const signalsByCandidateId = resolution.resolvedSignalsByCandidateId;
  const resolutionsByCandidateId = resolution.resolutionsByCandidateId;

  const warnings = appendUnique(
    providerResults.flatMap((result) => result.warnings),
    [
      ...providerResults.flatMap((result) => result.missingDataReason ? [`${result.providerDisplayName}: ${result.missingDataReason}`] : []),
      ...conflictWarnings(providerResults),
      ...resolution.warnings,
    ],
  );
  const errors = appendUnique([], providerResults.flatMap((result) => result.errors));
  return { providerResults, signalsByCandidateId, resolutionsByCandidateId, warnings, errors };
}

export class CampOpsSourceProviderRegistry {
  private readonly providers = new Map<string, CampOpsSourceProvider>();

  constructor(providers: CampOpsSourceProvider[] = []) {
    providers.forEach((provider) => this.register(provider));
  }

  register(provider: CampOpsSourceProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  list(): CampOpsSourceProvider[] {
    return Array.from(this.providers.values());
  }

  async collect(input: Omit<CampOpsSourceProviderCollectionInput, 'providers'>): Promise<CampOpsSourceProviderBundle> {
    return collectCampOpsSourceProviderBundle({
      ...input,
      providers: this.list(),
    });
  }
}

export function applyCampOpsSourceSignalsToEnrichment({
  enrichment,
  signals,
  currentTimeIso,
}: CampOpsSourceSignalMergeInput): CampCandidateEnrichment {
  if (!signals?.length) return enrichment;

  let next: CampCandidateEnrichment = {
    ...enrichment,
    dataLimitations: [...(enrichment.dataLimitations ?? [])],
    sourceSignals: [...(enrichment.sourceSignals ?? [])],
    sourceResolutions: [...(enrichment.sourceResolutions ?? [])],
  };

  for (const signal of signals) {
    const stale = isCampOpsSourceSignalStale(signal, currentTimeIso);
    const cacheMetadata = resolveCampOpsSourceCacheMetadata(signal, currentTimeIso);
    const fields: string[] = [];
    const limitations = [...(signal.dataLimitations ?? [])];
    if (cacheMetadata.freshnessStatus === 'expired') {
      limitations.push(`${signal.source} data is expired.`);
    } else if (stale) {
      limitations.push(`${signal.source} data is stale.`);
    }

    const allowCachedStalePositive = cacheMetadata.offlineAvailable === true;

    if (shouldOverrideRestrictive(next.legalStatus, signal.legalStatus, RESTRICTIVE_LEGAL_STATUSES, signal.confidence, stale, allowCachedStalePositive)) {
      next.legalStatus = signal.legalStatus!;
      fields.push('legalStatus');
    }
    if (signal.legalConfidence && shouldOverrideConfidence(next.legalConfidence, signal.legalConfidence, stale)) {
      next.legalConfidence = signal.legalConfidence;
      fields.push('legalConfidence');
    }
    if (shouldOverrideRestrictive(next.closureStatus, signal.closureStatus, RESTRICTIVE_CLOSURE_STATUSES, signal.confidence, stale, allowCachedStalePositive)) {
      next.closureStatus = signal.closureStatus!;
      fields.push('closureStatus');
    }
    if (signal.closureReason && (!stale || signal.confidence === 'high')) {
      next.closureReason = signal.closureReason;
      fields.push('closureReason');
    }
    if (signal.restrictionWindow && (!stale || signal.confidence === 'high')) {
      next.restrictionWindow = signal.restrictionWindow;
      fields.push('restrictionWindow');
    }
    if (typeof signal.closureAppliesToCamping === 'boolean' && (!stale || signal.closureAppliesToCamping)) {
      next.closureAppliesToCamping = signal.closureAppliesToCamping;
      fields.push('closureAppliesToCamping');
    }
    if (typeof signal.closureAppliesToVehicleAccess === 'boolean' && (!stale || signal.closureAppliesToVehicleAccess)) {
      next.closureAppliesToVehicleAccess = signal.closureAppliesToVehicleAccess;
      fields.push('closureAppliesToVehicleAccess');
    }
    if (typeof signal.closureAppliesToFires === 'boolean' && (!stale || signal.closureAppliesToFires)) {
      next.closureAppliesToFires = signal.closureAppliesToFires;
      fields.push('closureAppliesToFires');
    }
    if (shouldOverrideRestrictive(next.publicAccessStatus, signal.publicAccessStatus, RESTRICTIVE_PUBLIC_ACCESS_STATUSES, signal.confidence, stale, allowCachedStalePositive)) {
      next.publicAccessStatus = signal.publicAccessStatus!;
      fields.push('publicAccessStatus');
    }
    if (signal.accessDifficulty && (!stale || signal.confidence === 'high')) {
      next.accessDifficulty = signal.accessDifficulty;
      fields.push('accessDifficulty');
    }
    if (signal.vehicleFit && (!stale || signal.vehicleFit === 'not_fit')) {
      next.vehicleFit = signal.vehicleFit;
      fields.push('vehicleFit');
    }
    if (signal.trailerSuitability && (!stale || signal.trailerSuitability === 'not_fit')) {
      next.trailerSuitability = signal.trailerSuitability;
      fields.push('trailerSuitability');
    }
    if (signal.turnaroundSuitability && (!stale || signal.turnaroundSuitability === 'not_fit')) {
      next.turnaroundSuitability = signal.turnaroundSuitability;
      fields.push('turnaroundSuitability');
    }
    if (finiteNumber(signal.groupCapacityEstimate) != null && !stale) {
      next.groupCapacityEstimate = signal.groupCapacityEstimate!;
      fields.push('groupCapacityEstimate');
    }
    if (signal.fuelImpact && !stale) {
      next.fuelImpact = signal.fuelImpact;
      fields.push('fuelImpact');
    }
    if (signal.waterImpact && !stale) {
      next.waterImpact = signal.waterImpact;
      fields.push('waterImpact');
    }
    if (typeof signal.reliableWaterRefillAvailable === 'boolean' && !stale) {
      next.reliableWaterRefillAvailable = signal.reliableWaterRefillAvailable;
      fields.push('reliableWaterRefillAvailable');
    }
    if (signal.terrainSlopeEstimate && !stale) {
      next.terrainSlopeEstimate = signal.terrainSlopeEstimate;
      fields.push('terrainSlopeEstimate');
    }
    if (
      signal.weatherExposure &&
      (
        !stale ||
        signal.weatherExposure === 'critical' ||
        ((next.weatherExposure == null || next.weatherExposure === 'neutral') && signal.weatherExposure === 'unknown')
      )
    ) {
      next.weatherExposure = signal.weatherExposure;
      fields.push('weatherExposure');
    }
    if (
      signal.weatherExposureLevel &&
      (
        !stale ||
        signal.weatherExposureLevel === 'high' ||
        (!next.weatherExposureLevel && signal.weatherExposureLevel === 'unknown')
      )
    ) {
      next.weatherExposureLevel = signal.weatherExposureLevel;
      fields.push('weatherExposureLevel');
    }
    if (signal.forecastTimeWindow && !stale) {
      next.forecastTimeWindow = signal.forecastTimeWindow;
      fields.push('forecastTimeWindow');
    }
    if (finiteNumber(signal.windSpeedMph) != null && !stale) {
      next.windSpeedMph = signal.windSpeedMph!;
      fields.push('windSpeedMph');
    }
    if (finiteNumber(signal.windGustMph) != null && !stale) {
      next.windGustMph = signal.windGustMph!;
      fields.push('windGustMph');
    }
    if (signal.windDirection && !stale) {
      next.windDirection = signal.windDirection;
      fields.push('windDirection');
    }
    if (shouldOverrideRiskLevel(next.precipitationRisk, signal.precipitationRisk, stale)) {
      next.precipitationRisk = signal.precipitationRisk!;
      fields.push('precipitationRisk');
    }
    if (shouldOverrideRiskLevel(next.stormRisk, signal.stormRisk, stale)) {
      next.stormRisk = signal.stormRisk!;
      fields.push('stormRisk');
    }
    if (finiteNumber(signal.temperatureLowF) != null && !stale) {
      next.temperatureLowF = signal.temperatureLowF!;
      fields.push('temperatureLowF');
    }
    if (finiteNumber(signal.temperatureHighF) != null && !stale) {
      next.temperatureHighF = signal.temperatureHighF!;
      fields.push('temperatureHighF');
    }
    if (shouldOverrideRiskLevel(next.heatRisk, signal.heatRisk, stale)) {
      next.heatRisk = signal.heatRisk!;
      fields.push('heatRisk');
    }
    if (shouldOverrideRiskLevel(next.coldRisk, signal.coldRisk, stale)) {
      next.coldRisk = signal.coldRisk!;
      fields.push('coldRisk');
    }
    if (shouldOverrideImpactLevel(next.lateArrivalRisk, signal.lateArrivalRisk, stale)) {
      next.lateArrivalRisk = signal.lateArrivalRisk!;
      fields.push('lateArrivalRisk');
    }
    if (shouldOverrideRestrictive(next.fireRestrictionStatus, signal.fireRestrictionStatus, RESTRICTIVE_FIRE_STATUSES, signal.confidence, stale, allowCachedStalePositive)) {
      next.fireRestrictionStatus = signal.fireRestrictionStatus!;
      fields.push('fireRestrictionStatus');
    }
    if (shouldOverrideFireUseDecision(next.campfireAllowed, signal.campfireAllowed, signal.confidence, stale)) {
      next.campfireAllowed = signal.campfireAllowed!;
      fields.push('campfireAllowed');
    }
    if (shouldOverrideFireUseDecision(next.stoveAllowed, signal.stoveAllowed, signal.confidence, stale)) {
      next.stoveAllowed = signal.stoveAllowed!;
      fields.push('stoveAllowed');
    }
    if (signal.fireRestrictionLevel && (!stale || signal.confidence === 'high')) {
      next.fireRestrictionLevel = signal.fireRestrictionLevel;
      fields.push('fireRestrictionLevel');
    }
    if (shouldOverrideRiskLevel(next.redFlagRisk, signal.redFlagRisk, stale)) {
      next.redFlagRisk = signal.redFlagRisk!;
      fields.push('redFlagRisk');
    }
    if (shouldOverrideRiskLevel(next.smokeOrAirQualityRisk, signal.smokeOrAirQualityRisk, stale)) {
      next.smokeOrAirQualityRisk = signal.smokeOrAirQualityRisk!;
      fields.push('smokeOrAirQualityRisk');
    }
    if (typeof signal.fireRestrictionConflict === 'boolean') {
      next.fireRestrictionConflict = signal.fireRestrictionConflict;
      fields.push('fireRestrictionConflict');
    }
    if (typeof signal.emergencyRestrictionConflict === 'boolean') {
      next.emergencyRestrictionConflict = signal.emergencyRestrictionConflict;
      fields.push('emergencyRestrictionConflict');
    }
    if (typeof signal.recoveryFriendly === 'boolean' && !stale) {
      next.recoveryFriendly = signal.recoveryFriendly;
      fields.push('recoveryFriendly');
    }
    if (finiteNumber(signal.exitDistanceMiles) != null && !stale) {
      next.exitDistanceMiles = signal.exitDistanceMiles!;
      fields.push('exitDistanceMiles');
    }
    if (finiteNumber(signal.serviceDistanceMiles) != null && !stale) {
      next.serviceDistanceMiles = signal.serviceDistanceMiles!;
      fields.push('serviceDistanceMiles');
    }
    if (signal.nearestFuel && !stale) {
      next.nearestFuel = signal.nearestFuel;
      fields.push('nearestFuel');
    }
    if (signal.nearestWater && !stale) {
      next.nearestWater = signal.nearestWater;
      fields.push('nearestWater');
    }
    if (signal.nearestPropane && !stale) {
      next.nearestPropane = signal.nearestPropane;
      fields.push('nearestPropane');
    }
    if (signal.nearestDump && !stale) {
      next.nearestDump = signal.nearestDump;
      fields.push('nearestDump');
    }
    if (signal.nearestRepair && !stale) {
      next.nearestRepair = signal.nearestRepair;
      fields.push('nearestRepair');
    }
    if (signal.nearestTownOrExit && !stale) {
      next.nearestTownOrExit = signal.nearestTownOrExit;
      fields.push('nearestTownOrExit');
    }
    if (signal.privacyLikelihood && !stale) {
      next.privacyLikelihood = signal.privacyLikelihood;
      fields.push('privacyLikelihood');
    }
    if (signal.occupancyLikelihood && !stale) {
      next.occupancyLikelihood = signal.occupancyLikelihood;
      fields.push('occupancyLikelihood');
    }

    next.dataLimitations = appendUnique(next.dataLimitations, limitations);
    next.sourceSignals = [
      ...(next.sourceSignals ?? []),
      {
        source: signal.source,
        confidence: signal.confidence,
        observedAtIso: signal.observedAtIso ?? null,
        cachedAt: cacheMetadata.cachedAt,
        expiresAt: cacheMetadata.expiresAt,
        sourceGeneratedAt: cacheMetadata.sourceGeneratedAt,
        retrievedAt: cacheMetadata.retrievedAt,
        freshnessStatus: cacheMetadata.freshnessStatus,
        offlineAvailable: cacheMetadata.offlineAvailable,
        isStale: stale,
        fields,
        limitation: limitations[0] ?? null,
      },
    ];
    next.sourceResolutions = appendUnique(
      (next.sourceResolutions ?? []).map((resolution) => JSON.stringify(resolution)),
      (signal.sourceResolutions ?? []).map((resolution) => JSON.stringify(resolution)),
    ).map((value) => JSON.parse(value) as CampOpsSourceResolutionSummary);

    if (stale) {
      next.dataConfidence = lowerConfidence(next.dataConfidence);
    } else if (fields.length > 0 && shouldOverrideConfidence(next.dataConfidence, signal.confidence, stale)) {
      next.dataConfidence = signal.confidence;
    }
  }

  return next;
}
