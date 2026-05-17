import type {
  CampAccessRestrictionStatus,
  CampFireRestrictionStatus,
  CampFireUseDecision,
  CampImpactLevel,
  CampLegalStatus,
  CampOpsConfidence,
  CampOpsDataSource,
  CampOpsRiskLevel,
  CampOpsServiceAvailability,
  CampOpsSourceResolutionSummary,
  CampOpsWeatherExposureLevel,
  CampPublicAccessStatus,
} from './campOpsTypes';
import type {
  CampOpsExternalSourceSignal,
  CampOpsSourceFreshness,
  CampOpsSourceProviderResult,
} from './campOpsSourceAdapters';

export const CAMP_OPS_SOURCE_WEIGHT_TIERS = [
  'official_source',
  'verified_partner_source',
  'app_owned_data',
  'recent_user_debrief_data',
  'older_user_debrief_data',
  'unknown_source',
] as const;
export type CampOpsSourceWeightTier = (typeof CAMP_OPS_SOURCE_WEIGHT_TIERS)[number];

export type CampOpsSourceResolutionConfig = {
  tierWeights: Record<CampOpsSourceWeightTier, number>;
  providerTierById: Record<string, CampOpsSourceWeightTier>;
  sourceTierByDataSource: Partial<Record<CampOpsDataSource, CampOpsSourceWeightTier>>;
  recentUserSourceMaxAgeDays: number;
  stalePenalty: number;
  missingPenalty: number;
  confidenceWeight: number;
  freshnessWeight: number;
  conflictConfidencePenalty: number;
};

export type CampOpsResolvedField<T = unknown> = CampOpsSourceResolutionSummary & {
  resolvedValue: T | null;
};

export type CampOpsCandidateSourceResolution = {
  candidateId: string;
  resolvedSignal: CampOpsExternalSourceSignal | null;
  resolutions: CampOpsResolvedField[];
  warnings: string[];
};

export type CampOpsSourceResolutionResult = {
  resolvedSignalsByCandidateId: Record<string, CampOpsExternalSourceSignal[]>;
  resolutionsByCandidateId: Record<string, CampOpsResolvedField[]>;
  warnings: string[];
};

type SourceEntry = {
  result: CampOpsSourceProviderResult;
  signal: CampOpsExternalSourceSignal;
  stale: boolean;
  score: number;
  sourceSummary: string;
};

type FieldPolicy<T extends string> = {
  field: keyof CampOpsExternalSourceSignal;
  label: string;
  restrictiveValues?: Set<T>;
  riskRank?: Record<T, number>;
  unknownValue: T;
};

const DEFAULT_TIER_WEIGHTS: Record<CampOpsSourceWeightTier, number> = {
  official_source: 100,
  verified_partner_source: 85,
  app_owned_data: 72,
  recent_user_debrief_data: 62,
  older_user_debrief_data: 42,
  unknown_source: 25,
};

const CONFIDENCE_RANK: Record<CampOpsConfidence, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const SOURCE_DEFAULT_TIERS: Partial<Record<CampOpsDataSource, CampOpsSourceWeightTier>> = {
  offline_dataset: 'app_owned_data',
  inferred: 'app_owned_data',
  route_candidate: 'app_owned_data',
  draw_area_candidate: 'app_owned_data',
  community: 'recent_user_debrief_data',
  group: 'recent_user_debrief_data',
  user_saved: 'recent_user_debrief_data',
  gpx: 'recent_user_debrief_data',
  manual: 'recent_user_debrief_data',
  unknown: 'unknown_source',
};

const LEGAL_POLICY: FieldPolicy<CampLegalStatus> = {
  field: 'legalStatus',
  label: 'legal/access status',
  restrictiveValues: new Set(['prohibited', 'restricted']),
  riskRank: { unknown: 0, allowed: 1, likely_allowed: 2, restricted: 3, prohibited: 4 },
  unknownValue: 'unknown',
};

const PUBLIC_ACCESS_POLICY: FieldPolicy<CampPublicAccessStatus> = {
  field: 'publicAccessStatus',
  label: 'public access status',
  restrictiveValues: new Set(['private', 'permission_required']),
  riskRank: { unknown: 0, public: 1, permission_required: 3, private: 4 },
  unknownValue: 'unknown',
};

const CLOSURE_POLICY: FieldPolicy<CampAccessRestrictionStatus> = {
  field: 'closureStatus',
  label: 'closure status',
  restrictiveValues: new Set(['closed', 'restricted', 'seasonal']),
  riskRank: { unknown: 0, open: 1, permit_required: 2, seasonal: 3, restricted: 4, closed: 5 },
  unknownValue: 'unknown',
};

const FIRE_POLICY: FieldPolicy<CampFireRestrictionStatus> = {
  field: 'fireRestrictionStatus',
  label: 'fire restriction status',
  restrictiveValues: new Set(['fire_ban', 'restricted']),
  riskRank: { unknown: 0, none_known: 1, restrictions_possible: 2, restricted: 3, fire_ban: 4 },
  unknownValue: 'unknown',
};

const FIRE_USE_POLICY = (field: 'campfireAllowed' | 'stoveAllowed', label: string): FieldPolicy<CampFireUseDecision> => ({
  field,
  label,
  restrictiveValues: new Set(['no', 'restricted']),
  riskRank: { unknown: 0, yes: 1, restricted: 3, no: 4 },
  unknownValue: 'unknown',
});

const WEATHER_EXPOSURE_POLICY: FieldPolicy<CampOpsWeatherExposureLevel> = {
  field: 'weatherExposureLevel',
  label: 'weather exposure',
  riskRank: { unknown: 0, low: 1, medium: 2, high: 3 },
  unknownValue: 'unknown',
};

const WEATHER_IMPACT_POLICY: FieldPolicy<CampImpactLevel> = {
  field: 'weatherExposure',
  label: 'weather impact',
  riskRank: { unknown: 0, positive: 1, neutral: 2, watch: 3, caution: 4, critical: 5 },
  unknownValue: 'unknown',
};

const LATE_ARRIVAL_IMPACT_POLICY: FieldPolicy<CampImpactLevel> = {
  field: 'lateArrivalRisk',
  label: 'late-arrival risk',
  riskRank: { unknown: 0, positive: 1, neutral: 2, watch: 3, caution: 4, critical: 5 },
  unknownValue: 'unknown',
};

const RISK_POLICY = (field: 'redFlagRisk' | 'stormRisk' | 'heatRisk' | 'coldRisk' | 'smokeOrAirQualityRisk', label: string): FieldPolicy<CampOpsRiskLevel> => ({
  field,
  label,
  riskRank: { unknown: 0, low: 1, medium: 2, high: 3 },
  unknownValue: 'unknown',
});

export const DEFAULT_CAMP_OPS_SOURCE_RESOLUTION_CONFIG: CampOpsSourceResolutionConfig = {
  tierWeights: DEFAULT_TIER_WEIGHTS,
  providerTierById: {},
  sourceTierByDataSource: SOURCE_DEFAULT_TIERS,
  recentUserSourceMaxAgeDays: 45,
  stalePenalty: 35,
  missingPenalty: 60,
  confidenceWeight: 10,
  freshnessWeight: 12,
  conflictConfidencePenalty: 1,
};

export function resolveCampOpsSourceResolutionConfig(
  overrides: Partial<CampOpsSourceResolutionConfig> = {},
): CampOpsSourceResolutionConfig {
  return {
    ...DEFAULT_CAMP_OPS_SOURCE_RESOLUTION_CONFIG,
    ...overrides,
    tierWeights: {
      ...DEFAULT_CAMP_OPS_SOURCE_RESOLUTION_CONFIG.tierWeights,
      ...(overrides.tierWeights ?? {}),
    },
    providerTierById: {
      ...DEFAULT_CAMP_OPS_SOURCE_RESOLUTION_CONFIG.providerTierById,
      ...(overrides.providerTierById ?? {}),
    },
    sourceTierByDataSource: {
      ...DEFAULT_CAMP_OPS_SOURCE_RESOLUTION_CONFIG.sourceTierByDataSource,
      ...(overrides.sourceTierByDataSource ?? {}),
    },
  };
}

function minutesSince(observedAtIso: string | null | undefined, currentTimeIso: string): number | null {
  if (!observedAtIso) return null;
  const observedMs = Date.parse(observedAtIso);
  const currentMs = Date.parse(currentTimeIso);
  if (!Number.isFinite(observedMs) || !Number.isFinite(currentMs)) return null;
  return Math.max(0, Math.round((currentMs - observedMs) / 60_000));
}

function isStale(signal: CampOpsExternalSourceSignal, currentTimeIso: string): boolean {
  if (signal.freshnessStatus === 'stale' || signal.freshnessStatus === 'expired') return true;
  if (signal.expiresAt) {
    const expiresMs = Date.parse(signal.expiresAt);
    const currentMs = Date.parse(currentTimeIso);
    if (Number.isFinite(expiresMs) && Number.isFinite(currentMs) && expiresMs <= currentMs) return true;
  }
  if (signal.staleAfterMinutes == null) return false;
  const ageMinutes = minutesSince(signal.sourceGeneratedAt ?? signal.observedAtIso ?? signal.cachedAt ?? signal.retrievedAt, currentTimeIso);
  return ageMinutes != null && ageMinutes > signal.staleAfterMinutes;
}

function sourceAgeDays(signal: CampOpsExternalSourceSignal, currentTimeIso: string): number | null {
  const ageMinutes = minutesSince(signal.sourceGeneratedAt ?? signal.observedAtIso ?? signal.cachedAt ?? signal.retrievedAt, currentTimeIso);
  return ageMinutes == null ? null : ageMinutes / 1440;
}

function inferTier(entry: CampOpsSourceProviderResult, signal: CampOpsExternalSourceSignal, config: CampOpsSourceResolutionConfig, currentTimeIso: string): CampOpsSourceWeightTier {
  const configured = config.providerTierById[entry.providerId];
  if (configured) return configured;
  const fromSource = config.sourceTierByDataSource[signal.source];
  if (fromSource === 'recent_user_debrief_data') {
    const ageDays = sourceAgeDays(signal, currentTimeIso);
    return ageDays != null && ageDays > config.recentUserSourceMaxAgeDays ? 'older_user_debrief_data' : fromSource;
  }
  return fromSource ?? 'unknown_source';
}

function freshnessScore(freshness: CampOpsSourceFreshness, stale: boolean, config: CampOpsSourceResolutionConfig): number {
  if (freshness === 'expired') return -config.stalePenalty * 2;
  if (stale || freshness === 'stale') return -config.stalePenalty;
  if (freshness === 'missing') return -config.missingPenalty;
  if (freshness === 'fresh') return config.freshnessWeight;
  return 0;
}

function entryScore(entry: CampOpsSourceProviderResult, signal: CampOpsExternalSourceSignal, currentTimeIso: string, config: CampOpsSourceResolutionConfig): number {
  const tier = inferTier(entry, signal, config, currentTimeIso);
  const stale = isStale(signal, currentTimeIso) || entry.sourceFreshness === 'stale' || entry.sourceFreshness === 'expired';
  return (
    config.tierWeights[tier] +
    CONFIDENCE_RANK[signal.confidence] * config.confidenceWeight +
    freshnessScore(entry.sourceFreshness, stale, config)
  );
}

function buildEntries(
  results: CampOpsSourceProviderResult[],
  currentTimeIso: string,
  config: CampOpsSourceResolutionConfig,
): SourceEntry[] {
  return results
    .filter((result): result is CampOpsSourceProviderResult & { signal: CampOpsExternalSourceSignal } => Boolean(result.signal))
    .map((result) => {
      const signal = result.signal;
      const stale = isStale(signal, currentTimeIso) || result.sourceFreshness === 'stale' || result.sourceFreshness === 'expired';
      return {
        result,
        signal,
        stale,
        score: entryScore(result, signal, currentTimeIso, config),
        sourceSummary: `${result.providerDisplayName} (${signal.source}, ${signal.confidence}, ${result.sourceFreshness})`,
      };
    });
}

function lowerConfidence(confidence: CampOpsConfidence, steps = 1): CampOpsConfidence {
  const levels: CampOpsConfidence[] = ['unknown', 'low', 'medium', 'high'];
  const index = levels.indexOf(confidence);
  return levels[Math.max(0, index - steps)];
}

function confidenceFromEntries(entries: SourceEntry[], conflict: boolean, config: CampOpsSourceResolutionConfig): CampOpsConfidence {
  if (entries.length === 0) return 'unknown';
  const best = [...entries].sort((left, right) => right.score - left.score)[0];
  let confidence = best.signal.confidence;
  if (best.stale) confidence = lowerConfidence(confidence);
  if (conflict) confidence = lowerConfidence(confidence, config.conflictConfidencePenalty);
  return confidence;
}

function conflictSummary(label: string, values: string[], resolvedValue: unknown): string | null {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)));
  if (uniqueValues.length <= 1) return null;
  return `Conflicting ${label} source signals (${uniqueValues.join(', ')}); resolved conservatively to ${String(resolvedValue ?? 'unknown')}.`;
}

function resolveStringField<T extends string>(
  entries: SourceEntry[],
  policy: FieldPolicy<T>,
  config: CampOpsSourceResolutionConfig,
): CampOpsResolvedField<T> | null {
  const fieldEntries = entries.filter((entry) => typeof entry.signal[policy.field] === 'string');
  if (fieldEntries.length === 0) return null;
  const valueFor = (entry: SourceEntry) => entry.signal[policy.field] as T;
  const values = fieldEntries.map(valueFor);
  const usableEntries = fieldEntries.filter((entry) =>
    !entry.stale ||
    entry.signal.offlineAvailable === true ||
    (policy.restrictiveValues?.has(valueFor(entry)) && entry.signal.confidence === 'high')
  );
  if (usableEntries.length === 0) {
    const conflict = new Set(values).size > 1;
    return {
      field: String(policy.field),
      resolvedValue: policy.unknownValue,
      resolvedConfidence: 'unknown',
      conflictDetected: conflict,
      conflictSummary: conflictSummary(policy.label, values, policy.unknownValue),
      sourceSummaries: fieldEntries.map((entry) => `${entry.sourceSummary}: ${String(valueFor(entry))}`),
      staleSources: fieldEntries.filter((entry) => entry.stale).map((entry) => entry.result.providerDisplayName),
      missingSources: [],
    };
  }
  const candidates = usableEntries.length > 0 ? usableEntries : fieldEntries;
  const restrictiveCandidates = policy.restrictiveValues
    ? candidates.filter((entry) => policy.restrictiveValues?.has(valueFor(entry)))
    : [];
  const nonRestrictiveCandidates = policy.restrictiveValues
    ? candidates.filter((entry) => !policy.restrictiveValues?.has(valueFor(entry)))
    : candidates;
  const bestNonRestrictiveScore = Math.max(...nonRestrictiveCandidates.map((entry) => entry.score), Number.NEGATIVE_INFINITY);
  const restrictive = restrictiveCandidates.filter((entry) =>
    entry.signal.confidence !== 'low' || entry.score >= bestNonRestrictiveScore
  );
  const pool = restrictive.length > 0
    ? restrictive
    : nonRestrictiveCandidates.length > 0
      ? nonRestrictiveCandidates
      : candidates;
  const sorted = [...pool].sort((left, right) => {
    const rankDelta = (policy.riskRank?.[valueFor(right)] ?? 0) - (policy.riskRank?.[valueFor(left)] ?? 0);
    return rankDelta !== 0 ? rankDelta : right.score - left.score;
  });
  const winner = sorted[0];
  const resolvedValue = winner ? valueFor(winner) : policy.unknownValue;
  const conflict = new Set(values).size > 1;
  const summary = conflictSummary(policy.label, values, resolvedValue);
  return {
    field: String(policy.field),
    resolvedValue,
    resolvedConfidence: confidenceFromEntries(fieldEntries, conflict, config),
    conflictDetected: conflict,
    conflictSummary: summary,
    sourceSummaries: fieldEntries.map((entry) => `${entry.sourceSummary}: ${String(valueFor(entry))}`),
    staleSources: fieldEntries.filter((entry) => entry.stale).map((entry) => entry.result.providerDisplayName),
    missingSources: [],
  };
}

function distanceForService(service: CampOpsServiceAvailability): number {
  return service.routeAwareDistanceMiles ?? service.distanceFromCampMiles ?? service.distanceFromRouteMiles ?? Number.POSITIVE_INFINITY;
}

function serviceStatusRank(status: CampOpsServiceAvailability['status']): number {
  if (status === 'open') return 2;
  if (status === 'unknown') return 1;
  return 0;
}

function resolveServiceField(
  entries: SourceEntry[],
  field: keyof Pick<CampOpsExternalSourceSignal, 'nearestFuel' | 'nearestWater' | 'nearestPropane' | 'nearestDump' | 'nearestRepair' | 'nearestTownOrExit'>,
  label: string,
  config: CampOpsSourceResolutionConfig,
): CampOpsResolvedField<CampOpsServiceAvailability> | null {
  const fieldEntries = entries.filter((entry) => entry.signal[field]) as Array<SourceEntry & { signal: CampOpsExternalSourceSignal & Record<typeof field, CampOpsServiceAvailability> }>;
  if (fieldEntries.length === 0) return null;
  const usable = fieldEntries.filter((entry) => !entry.stale && entry.signal[field].status !== 'closed');
  const pool = usable.length > 0 ? usable : fieldEntries;
  const statusValues = fieldEntries.map((entry) => entry.signal[field].status ?? 'unknown');
  const conflict = new Set(statusValues).size > 1;
  const sorted = [...pool].sort((left, right) => {
    const rightStatus = serviceStatusRank(right.signal[field].status);
    const leftStatus = serviceStatusRank(left.signal[field].status);
    const statusDelta = rightStatus - leftStatus;
    if (statusDelta !== 0) return statusDelta;
    const scoreDelta = right.score - left.score;
    if (Math.abs(scoreDelta) >= 15) return scoreDelta;
    return distanceForService(left.signal[field]) - distanceForService(right.signal[field]);
  });
  let resolvedValue = sorted[0]?.signal[field] ?? null;
  if (conflict && resolvedValue?.status === 'open') {
    const unknownCompetitor = fieldEntries.find((entry) => entry.signal[field].status === 'unknown' && entry.score >= (sorted[0]?.score ?? 0) - 10);
    if (unknownCompetitor) {
      resolvedValue = { ...resolvedValue, status: 'unknown', confidence: lowerConfidence(resolvedValue.confidence) };
    }
  }
  const summary = conflictSummary(label, statusValues, resolvedValue?.status ?? 'unknown');
  return {
    field: String(field),
    resolvedValue,
    resolvedConfidence: resolvedValue ? confidenceFromEntries(fieldEntries, conflict, config) : 'unknown',
    conflictDetected: conflict,
    conflictSummary: summary,
    sourceSummaries: fieldEntries.map((entry) => `${entry.sourceSummary}: ${entry.signal[field].name} ${entry.signal[field].status ?? 'unknown'}`),
    staleSources: fieldEntries.filter((entry) => entry.stale).map((entry) => entry.result.providerDisplayName),
    missingSources: [],
  };
}

function latestObservedAt(entries: SourceEntry[]): string | null {
  return entries
    .map((entry) => entry.signal.sourceGeneratedAt ?? entry.signal.observedAtIso ?? entry.signal.cachedAt ?? entry.signal.retrievedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function latestSignalTimestamp(entries: SourceEntry[], field: 'cachedAt' | 'sourceGeneratedAt' | 'retrievedAt'): string | null {
  return entries
    .map((entry) => entry.signal[field])
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function earliestSignalTimestamp(entries: SourceEntry[], field: 'expiresAt'): string | null {
  return entries
    .map((entry) => entry.signal[field])
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
}

function resolvedFreshnessStatus(entries: SourceEntry[]): CampOpsExternalSourceSignal['freshnessStatus'] {
  if (entries.every((entry) => entry.result.sourceFreshness === 'expired' || entry.signal.freshnessStatus === 'expired')) return 'expired';
  if (entries.every((entry) => entry.stale || entry.result.sourceFreshness === 'stale' || entry.signal.freshnessStatus === 'stale')) return 'stale';
  if (entries.some((entry) => entry.result.sourceFreshness === 'fresh' || entry.signal.freshnessStatus === 'fresh')) return 'fresh';
  return 'unknown';
}

function buildResolvedSignal(entries: SourceEntry[], resolutions: CampOpsResolvedField[], config: CampOpsSourceResolutionConfig): CampOpsExternalSourceSignal | null {
  if (entries.length === 0) return null;
  const signal: CampOpsExternalSourceSignal = {
    source: 'inferred',
    confidence: confidenceFromEntries(entries, resolutions.some((resolution) => resolution.conflictDetected), config),
    observedAtIso: latestObservedAt(entries),
    cachedAt: latestSignalTimestamp(entries, 'cachedAt'),
    expiresAt: earliestSignalTimestamp(entries, 'expiresAt'),
    sourceGeneratedAt: latestSignalTimestamp(entries, 'sourceGeneratedAt') ?? latestObservedAt(entries),
    retrievedAt: latestSignalTimestamp(entries, 'retrievedAt'),
    freshnessStatus: resolvedFreshnessStatus(entries),
    offlineAvailable: entries.some((entry) => entry.signal.offlineAvailable === true) ? true : entries.every((entry) => entry.signal.offlineAvailable === false) ? false : null,
    sourceResolutions: resolutions,
    dataLimitations: Array.from(new Set([
      ...entries.flatMap((entry) => entry.signal.dataLimitations ?? []),
      ...resolutions.flatMap((resolution) => [
        resolution.conflictSummary,
        ...resolution.staleSources.map((source) => `${source} source data is stale.`),
      ]),
    ].filter((value): value is string => Boolean(value)))),
  };
  for (const resolution of resolutions) {
    if (resolution.resolvedValue == null) continue;
    (signal as Record<string, unknown>)[resolution.field] = resolution.resolvedValue;
  }
  const ancillaryFields: Array<keyof CampOpsExternalSourceSignal> = [
    'closureReason',
    'restrictionWindow',
    'closureAppliesToCamping',
    'closureAppliesToVehicleAccess',
    'closureAppliesToFires',
    'forecastTimeWindow',
    'windSpeedMph',
    'windGustMph',
    'windDirection',
    'precipitationRisk',
    'temperatureLowF',
    'temperatureHighF',
    'fireRestrictionLevel',
    'fuelImpact',
    'waterImpact',
    'reliableWaterRefillAvailable',
    'serviceDistanceMiles',
    'exitDistanceMiles',
    'recoveryFriendly',
  ];
  const rankedEntries = [...entries].sort((left, right) => right.score - left.score);
  for (const field of ancillaryFields) {
    if ((signal as Record<string, unknown>)[field] != null) continue;
    const entry = rankedEntries.find((candidate) => !candidate.stale && candidate.signal[field] != null);
    if (entry) (signal as Record<string, unknown>)[field] = entry.signal[field];
  }
  const legalConfidenceResolution = resolutions.find((resolution) => resolution.field === 'legalStatus');
  if (legalConfidenceResolution) signal.legalConfidence = legalConfidenceResolution.resolvedConfidence;
  return signal;
}

export function resolveCampOpsSourceConflicts({
  providerResults,
  currentTimeIso,
  config: configOverrides = {},
}: {
  providerResults: CampOpsSourceProviderResult[];
  currentTimeIso: string;
  config?: Partial<CampOpsSourceResolutionConfig>;
}): CampOpsSourceResolutionResult {
  const config = resolveCampOpsSourceResolutionConfig(configOverrides);
  const byCandidate: Record<string, CampOpsSourceProviderResult[]> = {};
  for (const result of providerResults) {
    if (!result.candidateId) continue;
    byCandidate[result.candidateId] = [...(byCandidate[result.candidateId] ?? []), result];
  }
  const resolvedSignalsByCandidateId: Record<string, CampOpsExternalSourceSignal[]> = {};
  const resolutionsByCandidateId: Record<string, CampOpsResolvedField[]> = {};
  const warnings: string[] = [];

  for (const [candidateId, results] of Object.entries(byCandidate)) {
    const entries = buildEntries(results, currentTimeIso, config);
    const missingSources = results
      .filter((result) => !result.signal || result.sourceFreshness === 'missing')
      .map((result) => result.providerDisplayName);
    const possibleResolutions: Array<CampOpsResolvedField | null> = [
      resolveStringField(entries, LEGAL_POLICY, config),
      resolveStringField(entries, PUBLIC_ACCESS_POLICY, config),
      resolveStringField(entries, CLOSURE_POLICY, config),
      resolveStringField(entries, FIRE_POLICY, config),
      resolveStringField(entries, FIRE_USE_POLICY('campfireAllowed', 'campfire status'), config),
      resolveStringField(entries, FIRE_USE_POLICY('stoveAllowed', 'stove status'), config),
      resolveStringField(entries, RISK_POLICY('redFlagRisk', 'red-flag risk'), config),
      resolveStringField(entries, WEATHER_EXPOSURE_POLICY, config),
      resolveStringField(entries, WEATHER_IMPACT_POLICY, config),
      resolveStringField(entries, LATE_ARRIVAL_IMPACT_POLICY, config),
      resolveStringField(entries, RISK_POLICY('stormRisk', 'storm risk'), config),
      resolveStringField(entries, RISK_POLICY('heatRisk', 'heat risk'), config),
      resolveStringField(entries, RISK_POLICY('coldRisk', 'cold risk'), config),
      resolveStringField(entries, RISK_POLICY('smokeOrAirQualityRisk', 'smoke or air-quality risk'), config),
      resolveServiceField(entries, 'nearestFuel', 'nearest fuel availability', config),
      resolveServiceField(entries, 'nearestWater', 'nearest water availability', config),
      resolveServiceField(entries, 'nearestPropane', 'nearest propane availability', config),
      resolveServiceField(entries, 'nearestDump', 'nearest dump availability', config),
      resolveServiceField(entries, 'nearestRepair', 'nearest repair availability', config),
      resolveServiceField(entries, 'nearestTownOrExit', 'nearest town or exit availability', config),
    ];
    const fieldResolutions = possibleResolutions.filter((resolution): resolution is CampOpsResolvedField => resolution != null);

    for (const resolution of fieldResolutions) {
      resolution.missingSources = [...resolution.missingSources, ...missingSources];
      if (resolution.conflictSummary) warnings.push(`${candidateId}: ${resolution.conflictSummary}`);
    }
    const signal = buildResolvedSignal(entries, fieldResolutions, config);
    if (signal) resolvedSignalsByCandidateId[candidateId] = [signal];
    resolutionsByCandidateId[candidateId] = fieldResolutions;
  }

  return {
    resolvedSignalsByCandidateId,
    resolutionsByCandidateId,
    warnings: Array.from(new Set(warnings)),
  };
}
