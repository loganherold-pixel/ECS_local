export type SourceTruthFreshness =
  | 'live'
  | 'recent'
  | 'stale'
  | 'expired'
  | 'unavailable';

export type SourceTruthOrigin =
  | 'live'
  | 'cached'
  | 'manual'
  | 'estimated'
  | 'inferred'
  | 'simulated'
  | 'unavailable';

export type SourceTruthAvailability = 'usable' | 'degraded' | 'unavailable';
export type SourceTruthConfidence = 'high' | 'medium' | 'low' | 'unknown';
export type SourceTruthCoverage = 'complete' | 'partial' | 'unknown';

export type SourceTruthAuthorityKind =
  | 'official'
  | 'verified_document'
  | 'provider'
  | 'device'
  | 'user'
  | 'community'
  | 'ecs'
  | 'mixed'
  | 'unknown';

export type SourceTruthConflictState = 'none' | 'present' | 'resolved' | 'unknown';
export type SourceTruthRole = 'primary' | 'supporting' | 'last_good';

export type SourceTruthPolicyKey =
  | 'default'
  | 'convoy_member_location'
  | 'weather_observation'
  | 'weather_forecast'
  | 'vehicle_profile'
  | 'vehicle_telemetry'
  | 'route_legal_access_evidence'
  | 'condition_closure_advisory'
  | 'offline_map_route_package'
  | 'camp_provider_availability'
  | 'manual_user_state';

export interface SourceTruthRef {
  id: string;
  origin: SourceTruthOrigin;
  role?: SourceTruthRole;
  policyKey?: SourceTruthPolicyKey | null;
  authority?: string | null;
  authorityKind?: SourceTruthAuthorityKind;
  provider?: string | null;
  observedAt?: string | null;
  fetchedAt?: string | null;
  expiresAt?: string | null;
  confidence: SourceTruthConfidence;
  coverage?: SourceTruthCoverage;
  availability?: SourceTruthAvailability;
  conflictState?: SourceTruthConflictState;
  /** Backward-compatible mirror for legacy consumers. */
  conflict?: boolean;
  warningCodes: string[];
}

export interface FreshnessPolicy {
  key: SourceTruthPolicyKey;
  label: string;
  liveMs: number;
  recentMs: number;
  staleMs: number;
  expiredMs?: number;
  missingTimestampFreshness: SourceTruthFreshness;
  invalidTimestampFreshness: SourceTruthFreshness;
  futureTimestampFreshness: SourceTruthFreshness;
  futureToleranceMs: number;
  useExpiresAt: boolean;
  expiresAtGraceMs: number;
  expiredAvailability: SourceTruthAvailability;
}

export type FreshnessPolicyOverride = Partial<Omit<FreshnessPolicy, 'key' | 'label'>> & {
  label?: string;
};

export interface SourceTruthPolicyOptions {
  policyKey?: SourceTruthPolicyKey | null;
  policyOverride?: FreshnessPolicyOverride | null;
  now?: number | Date | string | null;
}

export interface SourceTruthEvaluation {
  ref: SourceTruthRef;
  policy: FreshnessPolicy;
  freshness: SourceTruthFreshness;
  availability: SourceTruthAvailability;
  confidence: SourceTruthConfidence;
  coverage: SourceTruthCoverage;
  authorityKind: SourceTruthAuthorityKind;
  conflictState: SourceTruthConflictState;
  conflict: boolean;
  warningCodes: string[];
  observedAtMs: number | null;
  fetchedAtMs: number | null;
  expiresAtMs: number | null;
  ageMs: number | null;
}

export interface SourceTruthFacts {
  expiredLiveSource: boolean;
  unavailableLiveSource: boolean;
  usableLastGoodCache: boolean;
  usingLastGoodCache: boolean;
}

export interface SourceTruthAssessment {
  sources: SourceTruthEvaluation[];
  policy: FreshnessPolicy;
  freshness: SourceTruthFreshness;
  availability: SourceTruthAvailability;
  confidence: SourceTruthConfidence;
  coverage: SourceTruthCoverage;
  authorityKind: SourceTruthAuthorityKind;
  conflictState: SourceTruthConflictState;
  conflict: boolean;
  effectiveSource: SourceTruthEvaluation | null;
  facts: SourceTruthFacts;
  warningCodes: string[];
}

type TimestampParse = {
  ms: number | null;
  invalid: boolean;
  present: boolean;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SOURCE_TRUTH_FRESHNESS_POLICIES: Record<SourceTruthPolicyKey, FreshnessPolicy> = {
  default: {
    key: 'default',
    label: 'Legacy ECS summary default',
    liveMs: 10_000,
    recentMs: 60_000,
    staleMs: 120_000,
    missingTimestampFreshness: 'unavailable',
    invalidTimestampFreshness: 'unavailable',
    futureTimestampFreshness: 'unavailable',
    futureToleranceMs: 5_000,
    useExpiresAt: true,
    expiresAtGraceMs: 0,
    expiredAvailability: 'unavailable',
  },
  convoy_member_location: {
    key: 'convoy_member_location',
    label: 'Convoy member location',
    liveMs: 5 * MINUTE,
    recentMs: 10 * MINUTE,
    staleMs: 15 * MINUTE,
    expiredMs: 30 * MINUTE,
    missingTimestampFreshness: 'unavailable',
    invalidTimestampFreshness: 'unavailable',
    futureTimestampFreshness: 'unavailable',
    futureToleranceMs: 5_000,
    useExpiresAt: false,
    expiresAtGraceMs: 0,
    expiredAvailability: 'degraded',
  },
  weather_observation: {
    key: 'weather_observation',
    label: 'Weather observation',
    liveMs: 10 * MINUTE,
    recentMs: 30 * MINUTE,
    staleMs: 2 * HOUR,
    expiredMs: 24 * HOUR,
    missingTimestampFreshness: 'unavailable',
    invalidTimestampFreshness: 'unavailable',
    futureTimestampFreshness: 'unavailable',
    futureToleranceMs: 5 * MINUTE,
    useExpiresAt: true,
    expiresAtGraceMs: 0,
    expiredAvailability: 'degraded',
  },
  weather_forecast: {
    key: 'weather_forecast',
    label: 'Weather forecast',
    liveMs: 2 * HOUR,
    recentMs: 6 * HOUR,
    staleMs: 24 * HOUR,
    expiredMs: 48 * HOUR,
    missingTimestampFreshness: 'unavailable',
    invalidTimestampFreshness: 'unavailable',
    futureTimestampFreshness: 'unavailable',
    futureToleranceMs: 5 * MINUTE,
    useExpiresAt: true,
    expiresAtGraceMs: 0,
    expiredAvailability: 'degraded',
  },
  vehicle_profile: {
    key: 'vehicle_profile',
    label: 'Vehicle profile and manual configuration',
    liveMs: 30 * DAY,
    recentMs: 365 * DAY,
    staleMs: 3 * 365 * DAY,
    missingTimestampFreshness: 'stale',
    invalidTimestampFreshness: 'stale',
    futureTimestampFreshness: 'stale',
    futureToleranceMs: 1 * HOUR,
    useExpiresAt: false,
    expiresAtGraceMs: 0,
    expiredAvailability: 'degraded',
  },
  vehicle_telemetry: {
    key: 'vehicle_telemetry',
    label: 'Live vehicle telemetry',
    liveMs: 30_000,
    recentMs: 60_000,
    staleMs: 120_000,
    expiredMs: 300_000,
    missingTimestampFreshness: 'unavailable',
    invalidTimestampFreshness: 'unavailable',
    futureTimestampFreshness: 'unavailable',
    futureToleranceMs: 5_000,
    useExpiresAt: false,
    expiresAtGraceMs: 0,
    expiredAvailability: 'degraded',
  },
  route_legal_access_evidence: {
    key: 'route_legal_access_evidence',
    label: 'Route legal access evidence',
    liveMs: 7 * DAY,
    recentMs: 30 * DAY,
    staleMs: 180 * DAY,
    expiredMs: 365 * DAY,
    missingTimestampFreshness: 'stale',
    invalidTimestampFreshness: 'unavailable',
    futureTimestampFreshness: 'unavailable',
    futureToleranceMs: 1 * HOUR,
    useExpiresAt: true,
    expiresAtGraceMs: 0,
    expiredAvailability: 'degraded',
  },
  condition_closure_advisory: {
    key: 'condition_closure_advisory',
    label: 'Current condition or closure advisory',
    liveMs: 1 * HOUR,
    recentMs: 6 * HOUR,
    staleMs: 24 * HOUR,
    expiredMs: 72 * HOUR,
    missingTimestampFreshness: 'unavailable',
    invalidTimestampFreshness: 'unavailable',
    futureTimestampFreshness: 'unavailable',
    futureToleranceMs: 5 * MINUTE,
    useExpiresAt: true,
    expiresAtGraceMs: 0,
    expiredAvailability: 'degraded',
  },
  offline_map_route_package: {
    key: 'offline_map_route_package',
    label: 'Offline map or route package',
    liveMs: 7 * DAY,
    recentMs: 30 * DAY,
    staleMs: 90 * DAY,
    expiredMs: 180 * DAY,
    missingTimestampFreshness: 'stale',
    invalidTimestampFreshness: 'unavailable',
    futureTimestampFreshness: 'unavailable',
    futureToleranceMs: 1 * HOUR,
    useExpiresAt: true,
    expiresAtGraceMs: 0,
    expiredAvailability: 'degraded',
  },
  camp_provider_availability: {
    key: 'camp_provider_availability',
    label: 'Camp provider availability',
    liveMs: 15 * MINUTE,
    recentMs: 1 * HOUR,
    staleMs: 6 * HOUR,
    expiredMs: 24 * HOUR,
    missingTimestampFreshness: 'unavailable',
    invalidTimestampFreshness: 'unavailable',
    futureTimestampFreshness: 'unavailable',
    futureToleranceMs: 5 * MINUTE,
    useExpiresAt: true,
    expiresAtGraceMs: 0,
    expiredAvailability: 'degraded',
  },
  manual_user_state: {
    key: 'manual_user_state',
    label: 'User-entered manual state',
    liveMs: 1 * DAY,
    recentMs: 30 * DAY,
    staleMs: 180 * DAY,
    expiredMs: 365 * DAY,
    missingTimestampFreshness: 'stale',
    invalidTimestampFreshness: 'stale',
    futureTimestampFreshness: 'stale',
    futureToleranceMs: 1 * HOUR,
    useExpiresAt: false,
    expiresAtGraceMs: 0,
    expiredAvailability: 'degraded',
  },
};

const FRESHNESS_RANK: Record<SourceTruthFreshness, number> = {
  unavailable: 0,
  expired: 1,
  stale: 2,
  recent: 3,
  live: 4,
};

const CONFIDENCE_RANK: Record<SourceTruthConfidence, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const SECRET_PATTERN =
  /(api[_-]?key|secret|token|password|authorization|bearer|service[_-]?role|sk-[a-z0-9_-]{8,}|eyj[a-z0-9_-]{12,})/i;

export function resolveFreshnessPolicy(
  policyKey: SourceTruthPolicyKey | null | undefined = 'default',
  override?: FreshnessPolicyOverride | null,
): FreshnessPolicy {
  const base = SOURCE_TRUTH_FRESHNESS_POLICIES[policyKey ?? 'default'] ?? SOURCE_TRUTH_FRESHNESS_POLICIES.default;
  if (!override) return base;
  return {
    ...base,
    ...override,
    key: base.key,
    label: override.label ?? base.label,
  };
}

export function listFreshnessPolicies(): FreshnessPolicy[] {
  return Object.values(SOURCE_TRUTH_FRESHNESS_POLICIES);
}

export function normalizeSourceTruthOrigin(value: unknown): SourceTruthOrigin {
  const text = String(value ?? '').trim().toLowerCase();
  if (
    text === 'live' ||
    text === 'current' ||
    text === 'live_provider' ||
    text === 'live_ble' ||
    text === 'obd_live' ||
    text === 'ble_live' ||
    text === 'device_sensor'
  ) {
    return 'live';
  }
  if (text === 'cache' || text === 'cached' || text === 'last_known' || text === 'synced') return 'cached';
  if (text === 'manual' || text === 'manual_profile' || text === 'user_entered') return 'manual';
  if (text === 'estimated' || text === 'estimate' || text === 'ecs_estimate') return 'estimated';
  if (text === 'inferred' || text === 'ecs_inferred' || text === 'derived') return 'inferred';
  if (text === 'simulated' || text === 'simulation' || text === 'mock' || text === 'demo' || text === 'mock_dev') {
    return 'simulated';
  }
  return 'unavailable';
}

export function normalizeSourceTruthConfidence(value: unknown): SourceTruthConfidence {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'high') return 'high';
  if (text === 'medium' || text === 'moderate') return 'medium';
  if (text === 'low' || text === 'limited') return 'low';
  return 'unknown';
}

export function normalizeSourceTruthCoverage(value: unknown): SourceTruthCoverage {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'complete' || text === 'full') return 'complete';
  if (text === 'partial' || text === 'source_limited') return 'partial';
  return 'unknown';
}

export function normalizeSourceTruthAvailability(value: unknown): SourceTruthAvailability | undefined {
  if (value === true) return 'usable';
  if (value === false) return 'unavailable';
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'usable' || text === 'available') return 'usable';
  if (text === 'degraded' || text === 'partial' || text === 'limited') return 'degraded';
  if (text === 'unavailable' || text === 'offline' || text === 'missing') return 'unavailable';
  return undefined;
}

export function normalizeSourceTruthAuthorityKind(
  value: unknown,
  context: Pick<SourceTruthRef, 'authority' | 'provider' | 'origin'> = {
    authority: null,
    provider: null,
    origin: 'unavailable',
  },
): SourceTruthAuthorityKind {
  const explicit = String(value ?? '').trim().toLowerCase();
  if (
    explicit === 'official' ||
    explicit === 'verified_document' ||
    explicit === 'provider' ||
    explicit === 'device' ||
    explicit === 'user' ||
    explicit === 'community' ||
    explicit === 'ecs' ||
    explicit === 'mixed' ||
    explicit === 'unknown'
  ) {
    return explicit;
  }

  const authority = String(context.authority ?? '').trim().toLowerCase();
  const provider = String(context.provider ?? '').trim().toLowerCase();
  if (/official|agency|government|manufacturer|oem/.test(authority)) return 'official';
  if (/verified|scale ticket|inspection|document/.test(authority)) return 'verified_document';
  if (/device|sensor|obd|bluetooth|gps/.test(`${authority} ${provider}`)) return 'device';
  if (/community|contributor/.test(authority)) return 'community';
  if (/user|owner|manual/.test(authority) || context.origin === 'manual') return 'user';
  if (/\becs\b/.test(authority) || context.origin === 'estimated' || context.origin === 'inferred') return 'ecs';
  if (provider) return 'provider';
  return 'unknown';
}

export function normalizeSourceTruthConflictState(
  value: unknown,
  legacyConflict?: boolean,
): SourceTruthConflictState {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'present' || text === 'conflicted' || text === 'conflict') return 'present';
  if (text === 'resolved') return 'resolved';
  if (text === 'unknown') return 'unknown';
  if (text === 'none' || text === 'clear') return 'none';
  return legacyConflict === true ? 'present' : 'none';
}

export function sanitizeSourceTruthRef(ref: SourceTruthRef): SourceTruthRef {
  const origin = normalizeSourceTruthOrigin(ref.origin);
  const authority = sanitizeIdentity(ref.authority);
  const provider = sanitizeIdentity(ref.provider);
  const conflictState = normalizeSourceTruthConflictState(ref.conflictState, ref.conflict);
  return {
    id: sanitizeIdentity(ref.id) ?? 'source',
    origin,
    role: normalizeSourceTruthRole(ref.role),
    policyKey: normalizeSourceTruthPolicyKey(ref.policyKey),
    authority,
    authorityKind: normalizeSourceTruthAuthorityKind(ref.authorityKind, {
      authority,
      provider,
      origin,
    }),
    provider,
    observedAt: sanitizeTimestamp(ref.observedAt),
    fetchedAt: sanitizeTimestamp(ref.fetchedAt),
    expiresAt: sanitizeTimestamp(ref.expiresAt),
    confidence: normalizeSourceTruthConfidence(ref.confidence),
    coverage: normalizeSourceTruthCoverage(ref.coverage),
    availability: normalizeSourceTruthAvailability(ref.availability),
    conflictState,
    conflict: conflictState === 'present',
    warningCodes: uniqueStrings((ref.warningCodes ?? []).map(sanitizeWarningCode)),
  };
}

/**
 * Redact and bound user-facing source metadata before presentation. This is
 * intentionally payload-agnostic: callers should pass labels, never provider
 * responses or authentication material.
 */
export function sanitizeSourceTruthDisplayText(
  value: unknown,
  maxLength = 160,
): string | null {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  if (SECRET_PATTERN.test(text)) return '[redacted]';

  const safeMaxLength = Number.isFinite(maxLength)
    ? Math.max(16, Math.min(500, Math.floor(maxLength)))
    : 160;
  return text.length > safeMaxLength
    ? `${text.slice(0, Math.max(1, safeMaxLength - 3)).trimEnd()}...`
    : text;
}

export function evaluateSourceTruthRef(
  input: SourceTruthRef,
  options: SourceTruthPolicyOptions = {},
): SourceTruthEvaluation {
  const ref = sanitizeSourceTruthRef(input);
  const policy = resolveFreshnessPolicy(ref.policyKey ?? options.policyKey, options.policyOverride);
  const nowMs = normalizeNow(options.now);
  const observed = parseTimestamp(ref.observedAt);
  const fetched = parseTimestamp(ref.fetchedAt);
  const expires = parseTimestamp(ref.expiresAt);
  const timestamp = chooseTimestamp(observed, fetched);
  const warnings = new Set(ref.warningCodes);

  if (observed.invalid) warnings.add('invalid_observed_at');
  if (fetched.invalid) warnings.add('invalid_fetched_at');
  if (expires.invalid) warnings.add('invalid_expires_at');
  if (ref.origin === 'cached') warnings.add('origin_cached');
  if (ref.origin === 'manual') warnings.add('origin_manual');
  if (ref.origin === 'simulated') warnings.add('origin_simulated');
  if (ref.origin === 'unavailable') warnings.add('source_unavailable');
  if (ref.conflictState === 'present') warnings.add('conflict_detected');
  if (ref.conflictState === 'resolved') warnings.add('conflict_resolved');
  if (ref.conflictState === 'unknown') warnings.add('conflict_state_unknown');

  let freshness: SourceTruthFreshness;
  let ageMs: number | null = null;

  if (ref.origin === 'unavailable' || ref.availability === 'unavailable') {
    freshness = 'unavailable';
  } else if (policy.useExpiresAt && expires.ms != null && nowMs >= expires.ms + policy.expiresAtGraceMs) {
    freshness = 'expired';
  } else if (!timestamp.present) {
    freshness = policy.missingTimestampFreshness;
    warnings.add('missing_timestamp');
  } else if (timestamp.ms == null) {
    freshness = policy.invalidTimestampFreshness;
    warnings.add('invalid_timestamp');
  } else if (timestamp.ms - nowMs > policy.futureToleranceMs) {
    freshness = policy.futureTimestampFreshness;
    warnings.add('future_timestamp');
  } else {
    ageMs = Math.max(0, nowMs - timestamp.ms);
    freshness = freshnessFromAge(ageMs, policy);
  }

  if (freshness === 'stale') warnings.add('stale_source');
  if (freshness === 'expired') warnings.add('expired_source');
  if (freshness === 'unavailable') warnings.add('source_unavailable');

  const availability = deriveAvailability(ref.availability, ref.origin, freshness, policy);
  const coverage = ref.coverage ?? 'unknown';

  return {
    ref,
    policy,
    freshness,
    availability,
    confidence: ref.confidence,
    coverage,
    authorityKind: ref.authorityKind ?? 'unknown',
    conflictState: ref.conflictState ?? 'none',
    conflict: ref.conflictState === 'present',
    warningCodes: uniqueStrings(Array.from(warnings).map(sanitizeWarningCode)),
    observedAtMs: observed.ms,
    fetchedAtMs: fetched.ms,
    expiresAtMs: expires.ms,
    ageMs,
  };
}

export function assessSourceTruth(
  refs: readonly SourceTruthRef[],
  options: SourceTruthPolicyOptions = {},
): SourceTruthAssessment {
  const sources = refs.map((ref) => evaluateSourceTruthRef(ref, options));
  return aggregateSourceTruthEvaluations(sources, {
    policyKey: options.policyKey ?? refs[0]?.policyKey,
    policyOverride: options.policyOverride,
  });
}

export function aggregateSourceTruthEvaluations(
  sources: readonly SourceTruthEvaluation[],
  options: Pick<SourceTruthPolicyOptions, 'policyKey' | 'policyOverride'> = {},
): SourceTruthAssessment {
  const stableSources = Array.from(sources);
  const policy = resolveFreshnessPolicy(
    options.policyKey ?? stableSources[0]?.policy.key,
    options.policyOverride,
  );
  if (stableSources.length === 0) {
    return {
      sources: stableSources,
      policy,
      freshness: 'unavailable',
      availability: 'unavailable',
      confidence: 'unknown',
      coverage: 'unknown',
      authorityKind: 'unknown',
      conflictState: 'none',
      conflict: false,
      effectiveSource: null,
      facts: emptySourceTruthFacts(),
      warningCodes: ['missing_source_truth'],
    };
  }

  const availability = aggregateAvailability(stableSources);
  const confidence = minimumByRank(stableSources.map((source) => source.confidence), CONFIDENCE_RANK, 'unknown');
  const freshness = minimumByRank(stableSources.map((source) => source.freshness), FRESHNESS_RANK, 'unavailable');
  const coverage = aggregateCoverage(stableSources.map((source) => source.coverage));
  const authorityKind = aggregateAuthorityKind(stableSources.map((source) => source.authorityKind));
  const conflictState = aggregateConflictState(stableSources.map((source) => source.conflictState));
  const conflict = conflictState === 'present';
  const facts = buildSourceTruthFacts(stableSources);
  const effectiveSource = facts.usingLastGoodCache
    ? stableSources.find((source) => isUsableLastGoodCache(source)) ?? null
    : stableSources.find((source) => source.availability !== 'unavailable') ?? stableSources[0] ?? null;
  const warningCodes = uniqueStrings([
    ...stableSources.flatMap((source) => source.warningCodes),
    facts.expiredLiveSource ? 'expired_live_source' : null,
    facts.unavailableLiveSource ? 'live_source_unavailable' : null,
    facts.usingLastGoodCache ? 'using_last_good_cache' : null,
  ]);

  return {
    sources: stableSources,
    policy,
    freshness,
    availability,
    confidence,
    coverage,
    authorityKind,
    conflictState,
    conflict,
    effectiveSource,
    facts,
    warningCodes,
  };
}

export function assessEcsSummarySourceTruth(
  summary: LegacySummaryLike | null | undefined,
  options: SourceTruthPolicyOptions & { id?: string | null } = {},
): SourceTruthAssessment {
  if (!summary) return assessSourceTruth([], options);

  const sourceTruth = normalizeSummarySources(summary, options.id);
  const policyKey = options.policyKey ?? summary.sourceTruthPolicyKey ?? 'default';
  const assessment = assessSourceTruth(sourceTruth, { ...options, policyKey });

  if (summary.available === false && assessment.availability !== 'unavailable') {
    return {
      ...assessment,
      availability: 'unavailable',
      warningCodes: uniqueStrings([...assessment.warningCodes, 'legacy_summary_unavailable']),
    };
  }

  return assessment;
}

export function mapSourceTruthFreshnessToEcsFreshness(freshness: SourceTruthFreshness): 'live' | 'recent' | 'stale' | 'unavailable' {
  if (freshness === 'live') return 'live';
  if (freshness === 'recent') return 'recent';
  if (freshness === 'stale') return 'stale';
  return 'unavailable';
}

type LegacySummaryLike = {
  updated_at?: string | null;
  freshness?: string | null;
  available?: boolean | null;
  sourceTruth?: SourceTruthRef[] | SourceTruthRef | null;
  sourceTruthPolicyKey?: SourceTruthPolicyKey | null;
  sourceTruthWarningCodes?: string[] | null;
};

function normalizeSummarySources(summary: LegacySummaryLike, id?: string | null): SourceTruthRef[] {
  const declared = Array.isArray(summary.sourceTruth)
    ? summary.sourceTruth
    : summary.sourceTruth
      ? [summary.sourceTruth]
      : [];

  if (declared.length > 0) {
    return declared.map(sanitizeSourceTruthRef);
  }

  return [{
    id: id?.trim() || 'legacy_summary',
    origin: summary.available === false ? 'unavailable' : 'inferred',
    role: 'primary',
    observedAt: summary.updated_at ?? null,
    fetchedAt: null,
    expiresAt: null,
    confidence: 'unknown',
    coverage: 'unknown',
    availability: summary.available === false ? 'unavailable' : 'usable',
    conflictState: 'none',
    conflict: false,
    warningCodes: uniqueStrings([
      ...(summary.sourceTruthWarningCodes ?? []),
      summary.freshness ? `legacy_freshness_${summary.freshness}` : 'legacy_freshness_unknown',
    ]),
  }];
}

function freshnessFromAge(ageMs: number, policy: FreshnessPolicy): SourceTruthFreshness {
  if (ageMs <= policy.liveMs) return 'live';
  if (ageMs <= policy.recentMs) return 'recent';
  if (ageMs <= policy.staleMs) return 'stale';
  if (policy.expiredMs != null && ageMs <= policy.expiredMs) return 'expired';
  return 'unavailable';
}

function deriveAvailability(
  explicit: SourceTruthAvailability | undefined,
  origin: SourceTruthOrigin,
  freshness: SourceTruthFreshness,
  policy: FreshnessPolicy,
): SourceTruthAvailability {
  if (explicit === 'unavailable' || origin === 'unavailable' || freshness === 'unavailable') return 'unavailable';
  if (explicit === 'degraded') return 'degraded';
  if (freshness === 'expired') return policy.expiredAvailability;
  if (freshness === 'stale') return 'degraded';
  return explicit ?? 'usable';
}

function aggregateAvailability(sources: SourceTruthEvaluation[]): SourceTruthAvailability {
  const usable = sources.filter((source) => source.availability === 'usable').length;
  const degraded = sources.filter((source) => source.availability === 'degraded').length;
  const unavailable = sources.filter((source) => source.availability === 'unavailable').length;
  if (unavailable === sources.length) return 'unavailable';
  if (degraded > 0 || unavailable > 0) return 'degraded';
  return usable > 0 ? 'usable' : 'unavailable';
}

function aggregateCoverage(values: SourceTruthCoverage[]): SourceTruthCoverage {
  if (values.length === 0) return 'unknown';
  if (values.every((value) => value === 'complete')) return 'complete';
  if (values.every((value) => value === 'unknown')) return 'unknown';
  return 'partial';
}

function aggregateAuthorityKind(values: SourceTruthAuthorityKind[]): SourceTruthAuthorityKind {
  const known = uniqueStrings(values.filter((value) => value !== 'unknown')) as SourceTruthAuthorityKind[];
  if (known.length === 0) return 'unknown';
  if (known.length === 1) return known[0] ?? 'unknown';
  return 'mixed';
}

function aggregateConflictState(values: SourceTruthConflictState[]): SourceTruthConflictState {
  if (values.includes('present')) return 'present';
  if (values.includes('unknown')) return 'unknown';
  if (values.includes('resolved')) return 'resolved';
  return 'none';
}

function buildSourceTruthFacts(sources: SourceTruthEvaluation[]): SourceTruthFacts {
  const expiredLiveSource = sources.some((source) => (
    source.ref.origin === 'live' && source.freshness === 'expired'
  ));
  const unavailableLiveSource = sources.some((source) => (
    source.ref.origin === 'live' && source.availability === 'unavailable'
  ));
  const usableLastGoodCache = sources.some(isUsableLastGoodCache);
  return {
    expiredLiveSource,
    unavailableLiveSource,
    usableLastGoodCache,
    usingLastGoodCache: usableLastGoodCache && (expiredLiveSource || unavailableLiveSource),
  };
}

function emptySourceTruthFacts(): SourceTruthFacts {
  return {
    expiredLiveSource: false,
    unavailableLiveSource: false,
    usableLastGoodCache: false,
    usingLastGoodCache: false,
  };
}

function isUsableLastGoodCache(source: SourceTruthEvaluation): boolean {
  return source.ref.origin === 'cached' &&
    source.ref.role === 'last_good' &&
    source.availability !== 'unavailable';
}

function minimumByRank<T extends string>(
  values: T[],
  rank: Record<T, number>,
  fallback: T,
): T {
  if (values.length === 0) return fallback;
  return values.reduce((worst, value) => (rank[value] < rank[worst] ? value : worst), values[0] ?? fallback);
}

function chooseTimestamp(...timestamps: TimestampParse[]): TimestampParse {
  const present = timestamps.some((timestamp) => timestamp.present);
  const valid = timestamps.find((timestamp) => timestamp.ms != null);
  if (valid) return { ms: valid.ms, invalid: false, present };
  return { ms: null, invalid: timestamps.some((timestamp) => timestamp.invalid), present };
}

function parseTimestamp(value: string | null | undefined): TimestampParse {
  const text = String(value ?? '').trim();
  if (!text) return { ms: null, invalid: false, present: false };
  const parsed = Date.parse(text);
  return Number.isFinite(parsed)
    ? { ms: parsed, invalid: false, present: true }
    : { ms: null, invalid: true, present: true };
}

function normalizeNow(value: number | Date | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    const parsed = value.getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function sanitizeTimestamp(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function sanitizeIdentity(value: string | null | undefined): string | null {
  return sanitizeSourceTruthDisplayText(value, 120);
}

function sanitizeWarningCode(value: string | null | undefined): string | null {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!text) return null;
  if (SECRET_PATTERN.test(text)) return 'redacted_sensitive_warning';
  return text.length > 80 ? text.slice(0, 80) : text;
}

function normalizeSourceTruthRole(value: unknown): SourceTruthRole | undefined {
  if (value === 'primary' || value === 'supporting' || value === 'last_good') return value;
  return undefined;
}

function normalizeSourceTruthPolicyKey(value: unknown): SourceTruthPolicyKey | null {
  const key = String(value ?? '').trim() as SourceTruthPolicyKey;
  return Object.prototype.hasOwnProperty.call(SOURCE_TRUTH_FRESHNESS_POLICIES, key)
    ? key
    : null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = String(value ?? '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    output.push(clean);
  }
  return output;
}
