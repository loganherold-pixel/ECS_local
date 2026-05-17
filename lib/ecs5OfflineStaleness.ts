import type { SourceObservation, SourceObservationSubjectType } from './ecs5ObservationPipeline';
import type { RouteIntelligenceSummary } from './ecs5RouteIntelligence';

export type ECS5CacheableRecordKind =
  | 'SourceObservation'
  | 'LegalAccessRecord'
  | 'ClosureRecord'
  | 'RestrictionRecord'
  | 'FireIncidentRecord'
  | 'FirePerimeterRecord'
  | 'WeatherAlertRecord'
  | 'SmokeAqiObservation'
  | 'BailoutDecision'
  | 'RouteIntelligenceSummary'
  | 'ProviderHealthSnapshot';

export interface ECS5OfflineCacheMetadata {
  cachedAt: string;
  lastVerifiedAt: string;
  validUntil: string;
  staleAt: string;
  offlineCacheEligible: boolean;
  offlineWarning: string | null;
  staleReason: string | null;
}

export interface ECS5StalenessAssessment extends ECS5OfflineCacheMetadata {
  isStale: boolean;
  isExpired: boolean;
  confidenceMultiplier: number;
  recommendation: 'current' | 'verify' | 'manual_review_required' | 'historical_context_only';
}

export interface ECS5CachePolicyInput {
  recordKind?: ECS5CacheableRecordKind;
  providerId?: string | null;
  subjectType?: SourceObservationSubjectType | string | null;
  recordType?: string | null;
  observedAt?: string | null;
  publishedAt?: string | null;
  ingestedAt?: string | null;
  expiresAt?: string | null;
  effectiveEndAt?: string | null;
  offlineCacheEligible?: boolean | null;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const ECS5_DEFAULT_STALE_AFTER_SECONDS: Record<ECS5CacheableRecordKind, number> = {
  SourceObservation: 2 * HOUR,
  LegalAccessRecord: 30 * DAY,
  ClosureRecord: 6 * HOUR,
  RestrictionRecord: 12 * HOUR,
  FireIncidentRecord: 6 * HOUR,
  FirePerimeterRecord: 12 * HOUR,
  WeatherAlertRecord: 90 * MINUTE,
  SmokeAqiObservation: 90 * MINUTE,
  BailoutDecision: 2 * HOUR,
  RouteIntelligenceSummary: 2 * HOUR,
  ProviderHealthSnapshot: 30 * MINUTE,
};

export const ECS5_PROVIDER_STALE_AFTER_SECONDS: Record<string, number> = {
  openweather_onecall: 90 * MINUTE,
  nws: 90 * MINUTE,
  airnow: 90 * MINUTE,
  nasa_firms: 2 * HOUR,
  nifc_wfigs: 12 * HOUR,
  inciweb: 12 * HOUR,
  usfs_mvum: 30 * DAY,
  blm_plad: 30 * DAY,
  nps: 6 * HOUR,
  state_dot_511: 90 * MINUTE,
  state_fire_agency: 3 * HOUR,
  county_emergency: 90 * MINUTE,
  manual_agency_ingestion: 7 * DAY,
};

export function buildECS5OfflineCacheMetadata(
  input: ECS5CachePolicyInput,
  now = new Date(),
): ECS5OfflineCacheMetadata {
  const cachedAt = now.toISOString();
  const lastVerifiedAt = normalizeTimestamp(input.observedAt ?? input.publishedAt ?? input.ingestedAt) ?? cachedAt;
  const staleAt = resolveStaleAt(input, lastVerifiedAt);
  const validUntil = resolveValidUntil(input, staleAt);
  const offlineCacheEligible = input.offlineCacheEligible !== false;
  return {
    cachedAt,
    lastVerifiedAt,
    validUntil,
    staleAt,
    offlineCacheEligible,
    offlineWarning: offlineCacheEligible ? null : 'This record is not marked eligible for offline cache.',
    staleReason: null,
  };
}

export function assessECS5OfflineStaleness(
  metadata: ECS5OfflineCacheMetadata,
  input: ECS5CachePolicyInput = {},
  now = new Date(),
): ECS5StalenessAssessment {
  const stale = Date.parse(metadata.staleAt) <= now.getTime();
  const expired = Date.parse(metadata.validUntil) <= now.getTime();
  const historicalClosure = isClosureLike(input) && expired;
  const staleReason = historicalClosure
    ? 'Closure/restriction record has expired and is historical context only.'
    : expired
      ? staleReasonFor(input)
      : stale
        ? staleReasonFor(input)
        : null;
  return {
    ...metadata,
    offlineWarning: stale || expired
      ? warningFor(input, historicalClosure)
      : metadata.offlineWarning,
    staleReason,
    isStale: stale || expired,
    isExpired: expired,
    confidenceMultiplier: confidenceMultiplierFor(input, stale, expired),
    recommendation: historicalClosure
      ? 'historical_context_only'
      : expired
        ? 'manual_review_required'
        : stale
          ? 'verify'
          : 'current',
  };
}

export function applyECS5SourceObservationStaleness(
  observation: SourceObservation,
  now = new Date(),
): SourceObservation {
  const metadata = observation.cachedAt && observation.lastVerifiedAt && observation.validUntil && observation.staleAt
    ? {
        cachedAt: observation.cachedAt,
        lastVerifiedAt: observation.lastVerifiedAt,
        validUntil: observation.validUntil,
        staleAt: observation.staleAt,
        offlineCacheEligible: observation.offlineCacheEligible,
        offlineWarning: observation.offlineWarning ?? null,
        staleReason: observation.staleReason ?? null,
      }
    : buildECS5OfflineCacheMetadata({
        providerId: observation.providerId,
        subjectType: observation.subjectType,
        observedAt: observation.observedAt,
        publishedAt: observation.publishedAt,
        ingestedAt: observation.ingestedAt,
        expiresAt: observation.expiresAt,
        offlineCacheEligible: observation.offlineCacheEligible,
      }, now);
  const assessed = assessECS5OfflineStaleness(metadata, {
    providerId: observation.providerId,
    subjectType: observation.subjectType,
    expiresAt: observation.expiresAt,
  }, now);
  return {
    ...observation,
    cachedAt: assessed.cachedAt,
    lastVerifiedAt: assessed.lastVerifiedAt,
    validUntil: assessed.validUntil,
    staleAt: assessed.staleAt,
    offlineWarning: assessed.offlineWarning,
    staleReason: assessed.staleReason,
    confidenceScore: Math.max(0, Math.round(observation.confidenceScore * assessed.confidenceMultiplier)),
    confidenceBreakdown: {
      ...observation.confidenceBreakdown,
      freshness: assessed.isStale ? 25 : observation.confidenceBreakdown.freshness,
      stalePenalty: assessed.isStale ? Math.max(observation.confidenceBreakdown.stalePenalty, 35) : observation.confidenceBreakdown.stalePenalty,
    },
    knownLimitations: withLimitation(observation.knownLimitations, limitationForObservation(observation, assessed)),
  };
}

export function applyECS5RouteIntelligenceStaleness(
  summary: RouteIntelligenceSummary,
  now = new Date(),
): RouteIntelligenceSummary {
  const metadata = buildECS5OfflineCacheMetadata({
    recordKind: 'RouteIntelligenceSummary',
    observedAt: summary.evaluatedAt,
    expiresAt: summary.validUntil,
    offlineCacheEligible: true,
  }, new Date(summary.evaluatedAt));
  const assessed = assessECS5OfflineStaleness(metadata, {
    recordKind: 'RouteIntelligenceSummary',
    expiresAt: summary.validUntil,
  }, now);
  if (!assessed.isStale) return summary;
  const staleRouteUnknown: RouteIntelligenceSummary['unknowns'][number] = {
    id: 'offline_stale_route_intelligence',
    severity: 'warning',
    title: 'Cached / Offline route intelligence',
    message: assessed.offlineWarning ?? 'Cached / Offline route intelligence is stale and requires verification.',
    evidenceIds: summary.evidence.map((item) => item.id),
    recommendedAction: 'verify',
  };
  const unknowns = summary.unknowns.some((item) => item.id === staleRouteUnknown.id)
    ? summary.unknowns
    : [...summary.unknowns, staleRouteUnknown];
  return {
    ...summary,
    overallRecommendation: summary.overallRecommendation === 'proceed' ? 'verify' : summary.overallRecommendation,
    overallRiskScore: Math.min(100, summary.overallRiskScore + 8),
    sourceConfidenceSummary: {
      ...summary.sourceConfidenceSummary,
      score: Math.max(0, Math.round(summary.sourceConfidenceSummary.score * assessed.confidenceMultiplier)),
      label: summary.sourceConfidenceSummary.score * assessed.confidenceMultiplier >= 80
        ? 'high'
        : summary.sourceConfidenceSummary.score * assessed.confidenceMultiplier >= 50
          ? 'medium'
          : summary.sourceConfidenceSummary.score * assessed.confidenceMultiplier > 0
            ? 'low'
            : 'unknown',
      staleDataPenalty: Math.max(summary.sourceConfidenceSummary.staleDataPenalty, 35),
      staleWarning: assessed.offlineWarning,
      topReasons: withLimitation(summary.sourceConfidenceSummary.topReasons, assessed.staleReason ?? 'Cached / Offline data requires verification.'),
    },
    offlineReadiness: {
      ...summary.offlineReadiness,
      cacheAvailable: true,
      offlineAvailable: true,
      isStale: true,
      staleWarning: assessed.offlineWarning,
    },
    unknowns,
  };
}

export function staleReasonFor(input: ECS5CachePolicyInput): string {
  const providerId = String(input.providerId ?? '').toLowerCase();
  const subjectType = String(input.subjectType ?? input.recordType ?? input.recordKind ?? '').toLowerCase();
  if (providerId === 'airnow' || subjectType === 'smoke_aqi') return 'AirNow AQI is preliminary data and stale quickly.';
  if (providerId === 'nasa_firms' || subjectType === 'active_fire') return 'FIRMS active fire is a satellite detection and stale quickly.';
  if (subjectType === 'weather_alert' || subjectType === 'weather_forecast' || providerId === 'nws' || providerId === 'openweather_onecall') {
    return 'Weather data is time-sensitive and stale.';
  }
  if (subjectType === 'fire_perimeter' || providerId === 'nifc_wfigs') return 'Fire perimeter data requires freshness before route decisions.';
  if (providerId === 'usfs_mvum') return 'MVUM is legal baseline only and does not imply current passability.';
  if (providerId === 'blm_plad') return 'BLM PLAD is access baseline only and does not imply current passability.';
  return 'Cached / Offline data is stale.';
}

function resolveStaleAt(input: ECS5CachePolicyInput, lastVerifiedAt: string): string {
  const ttlSeconds = resolveStaleAfterSeconds(input);
  return new Date(Date.parse(lastVerifiedAt) + ttlSeconds * 1000).toISOString();
}

function resolveValidUntil(input: ECS5CachePolicyInput, staleAt: string): string {
  const explicitEnd = normalizeTimestamp(input.effectiveEndAt ?? input.expiresAt);
  if (explicitEnd && isClosureLike(input)) return explicitEnd;
  return explicitEnd ?? staleAt;
}

function resolveStaleAfterSeconds(input: ECS5CachePolicyInput): number {
  const providerId = String(input.providerId ?? '').toLowerCase();
  if (providerId && ECS5_PROVIDER_STALE_AFTER_SECONDS[providerId]) return ECS5_PROVIDER_STALE_AFTER_SECONDS[providerId];
  if (input.subjectType === 'weather_alert' || input.subjectType === 'weather_forecast') return ECS5_DEFAULT_STALE_AFTER_SECONDS.WeatherAlertRecord;
  if (input.subjectType === 'smoke_aqi') return ECS5_DEFAULT_STALE_AFTER_SECONDS.SmokeAqiObservation;
  if (input.subjectType === 'active_fire') return ECS5_DEFAULT_STALE_AFTER_SECONDS.FireIncidentRecord;
  if (input.subjectType === 'fire_perimeter') return ECS5_DEFAULT_STALE_AFTER_SECONDS.FirePerimeterRecord;
  if (input.recordKind) return ECS5_DEFAULT_STALE_AFTER_SECONDS[input.recordKind];
  return ECS5_DEFAULT_STALE_AFTER_SECONDS.SourceObservation;
}

function confidenceMultiplierFor(input: ECS5CachePolicyInput, stale: boolean, expired: boolean): number {
  if (!stale && !expired) return 1;
  if (isClosureLike(input) && expired) return 0.25;
  const providerId = String(input.providerId ?? '').toLowerCase();
  const subjectType = String(input.subjectType ?? '').toLowerCase();
  if (providerId === 'airnow' || subjectType === 'smoke_aqi') return 0.55;
  if (providerId === 'nasa_firms' || subjectType === 'active_fire') return 0.5;
  if (subjectType === 'weather_alert' || subjectType === 'weather_forecast') return 0.6;
  if (providerId === 'usfs_mvum' || providerId === 'blm_plad') return 0.82;
  return 0.65;
}

function warningFor(input: ECS5CachePolicyInput, historicalClosure: boolean): string {
  if (historicalClosure) return 'Expired closure retained as historical context; it is not an active blocker without another current source.';
  const reason = staleReasonFor(input);
  return `Cached / Offline: ${reason} Verify with managing agency or current provider before relying on it.`;
}

function limitationForObservation(observation: SourceObservation, assessed: ECS5StalenessAssessment): string {
  if (!assessed.isStale) return '';
  if (observation.providerId === 'airnow') return 'Preliminary data; stale AirNow AQI lowers confidence.';
  if (observation.providerId === 'nasa_firms') return 'Satellite detection; stale FIRMS active fire lowers confidence.';
  if (observation.providerId === 'usfs_mvum') return 'MVUM remains legal baseline only; current passability is unknown.';
  if (observation.providerId === 'blm_plad') return 'BLM PLAD remains access baseline only; current passability is unknown.';
  return assessed.offlineWarning ?? 'Cached / Offline data is stale.';
}

function isClosureLike(input: ECS5CachePolicyInput): boolean {
  return input.recordKind === 'ClosureRecord' ||
    input.recordType === 'closure' ||
    input.subjectType === 'closure' ||
    input.subjectType === 'restriction';
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function withLimitation(values: string[], value: string): string[] {
  if (!value) return values;
  return values.includes(value) ? values : [...values, value];
}
