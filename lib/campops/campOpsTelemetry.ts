import { ecsLog } from '../ecsLogger';
import type {
  CampCandidateEnrichment,
  CampOperationalRole,
  CampOpsCacheFreshnessStatus,
  CampOpsConfidence,
  CampOpsOfflineMode,
  CampRecommendationSet,
  CampSearchContext,
} from './campOpsTypes';
import type { CampOpsAiAssistMode } from './campOpsAiAssist';
import type { CampOpsDebriefRecord } from './campOpsDebrief';

export const CAMP_OPS_TELEMETRY_EVENTS = [
  'campops_recommendation_generated',
  'campops_endpoint_recommendation_generated',
  'campops_recommendation_accepted',
  'campops_recommendation_dismissed',
  'campops_planned_camp_downgraded',
  'campops_ai_summary_generated',
  'campops_provider_stale_data_detected',
  'campops_source_conflict_detected',
  'campops_debrief_created',
] as const;

export type CampOpsTelemetryEventName = (typeof CAMP_OPS_TELEMETRY_EVENTS)[number];

export type CampOpsTelemetryFreshnessBand =
  | CampOpsCacheFreshnessStatus
  | 'missing';

export type CampOpsTelemetryDelayBand =
  | 'none'
  | 'short'
  | 'moderate'
  | 'long'
  | 'custom'
  | 'unknown';

export type CampOpsTelemetryRecommendationStatus =
  | 'recommended'
  | 'no_recommendation'
  | 'disabled'
  | 'unknown';

export type CampOpsTelemetryPayload = {
  featureEnabled?: boolean;
  offlineMode?: CampOpsOfflineMode;
  candidateCount?: number;
  rejectedCount?: number;
  warningCount?: number;
  assumptionCount?: number;
  confidenceBand?: CampOpsConfidence;
  confidenceBands?: Partial<Record<CampOpsConfidence, number>>;
  roleCounts?: Partial<Record<CampOperationalRole, number>>;
  recommendationStatus?: CampOpsTelemetryRecommendationStatus;
  plannedCampDowngraded?: boolean;
  riskCategoryBands?: Record<string, Record<string, number>>;
  sourceFreshnessBands?: Partial<Record<CampOpsTelemetryFreshnessBand, number>>;
  sourceConflictCount?: number;
  staleSourceCount?: number;
  missingDataCount?: number;
  aiMode?: CampOpsAiAssistMode;
  decisionPointPresent?: boolean;
  delayBand?: CampOpsTelemetryDelayBand;
  endpointStatus?: string;
  acceptedRole?: CampOperationalRole | 'unknown';
  dismissedRole?: CampOperationalRole | 'unknown';
  debriefVisibility?: string;
  debriefHasCommunityConsent?: boolean;
  debriefHasPhotos?: boolean;
  debriefHazardCount?: number;
};

export type CampOpsTelemetryEvent = {
  name: CampOpsTelemetryEventName;
  timestampIso: string;
  payload: CampOpsTelemetryPayload;
};

export type CampOpsTelemetrySink = (event: CampOpsTelemetryEvent) => void;

export type CampOpsTelemetryConfig = {
  /** Legacy local feature gate; prefer campopsTelemetryEnabled for new callers. */
  enabled: boolean;
  campopsTelemetryEnabled: boolean;
  consoleDebug: boolean;
  sink: CampOpsTelemetrySink | null;
  sinkApproved: boolean;
  campopsTelemetrySinkApproved: boolean;
};

const DEFAULT_CONFIG: CampOpsTelemetryConfig = {
  enabled: false,
  campopsTelemetryEnabled: false,
  consoleDebug: false,
  sink: null,
  sinkApproved: false,
  campopsTelemetrySinkApproved: false,
};

const MAX_TEST_EVENTS = 100;
const telemetryEvents: CampOpsTelemetryEvent[] = [];
let telemetryConfig: CampOpsTelemetryConfig = { ...DEFAULT_CONFIG };

const FORBIDDEN_TELEMETRY_KEYS = new Set([
  'aiprompt',
  'campId',
  'campIds',
  'campName',
  'candidateId',
  'candidateIds',
  'cachedSourceData',
  'coordinates',
  'currentLocation',
  'debriefNotes',
  'latitude',
  'location',
  'longitude',
  'name',
  'notes',
  'photo',
  'photoRefs',
  'photos',
  'prompt',
  'promptText',
  'rawAiPrompt',
  'rawPrompt',
  'rawProviderStatus',
  'providerResult',
  'providerResults',
  'routeId',
  'sourceSignal',
  'sourceSignals',
  'sourceSummaries',
  'sourceSummary',
  'tripId',
  'userId',
  'userIds',
  'vehicleId',
  'vehicleIds',
  'vehicleIdentifier',
  'vehicleProfileId',
  'vehicleVin',
]);
const NORMALIZED_FORBIDDEN_TELEMETRY_KEYS = new Set(
  Array.from(FORBIDDEN_TELEMETRY_KEYS, (key) => key.toLowerCase()),
);

function finiteCount(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.round(numberValue) : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function confidence(value: unknown): CampOpsConfidence | undefined {
  return value === 'high' || value === 'medium' || value === 'low' || value === 'unknown'
    ? value
    : undefined;
}

function offlineMode(value: unknown): CampOpsOfflineMode | undefined {
  return value === 'online' || value === 'degraded' || value === 'offline' || value === 'unknown'
    ? value
    : undefined;
}

function operationalRole(value: unknown): CampOperationalRole | 'unknown' | undefined {
  return value === 'primary' ||
    value === 'backup' ||
    value === 'emergency' ||
    value === 'weather_fallback' ||
    value === 'resupply' ||
    value === 'recovery' ||
    value === 'trailer_safe' ||
    value === 'family_safe' ||
    value === 'unknown'
    ? value
    : undefined;
}

function endpointStatus(value: unknown): string | undefined {
  return value === 'disabled' ||
    value === 'recommended' ||
    value === 'no_safe_endpoint' ||
    value === 'unknown'
    ? value
    : undefined;
}

function debriefVisibility(value: unknown): string | undefined {
  return value === 'private' ||
    value === 'shared_with_convoy' ||
    value === 'community_anonymized' ||
    value === 'public_verified'
    ? value
    : undefined;
}

function delayBand(minutes: number | null | undefined): CampOpsTelemetryDelayBand {
  if (minutes == null || !Number.isFinite(minutes)) return 'unknown';
  if (minutes <= 0) return 'none';
  if (minutes <= 30) return 'short';
  if (minutes <= 90) return 'moderate';
  if (minutes <= 180) return 'long';
  return 'custom';
}

function increment<T extends string>(counts: Partial<Record<T, number>>, key: T | null | undefined): void {
  if (!key) return;
  counts[key] = (counts[key] ?? 0) + 1;
}

function incrementNested(counts: Record<string, Record<string, number>>, category: string, value: unknown): void {
  const key = String(value ?? 'unknown');
  if (!counts[category]) counts[category] = {};
  counts[category][key] = (counts[category][key] ?? 0) + 1;
}

function normalizeResourceDebtStatus(value: unknown): string {
  return value === 'safe' ? 'comfortable' : String(value ?? 'unknown');
}

function enrichments(set: CampRecommendationSet): CampCandidateEnrichment[] {
  return Object.values(set.enrichmentsByCandidateId ?? {}).filter((item): item is CampCandidateEnrichment => Boolean(item));
}

function buildRoleCounts(set: CampRecommendationSet): Partial<Record<CampOperationalRole, number>> {
  const counts: Partial<Record<CampOperationalRole, number>> = {};
  for (const roles of Object.values(set.rolesByCandidateId ?? {})) {
    for (const role of roles ?? []) increment(counts, role);
  }
  return counts;
}

function buildConfidenceBands(set: CampRecommendationSet): Partial<Record<CampOpsConfidence, number>> {
  const counts: Partial<Record<CampOpsConfidence, number>> = {};
  increment(counts, set.confidenceSummary.level);
  for (const enrichment of enrichments(set)) {
    increment(counts, enrichment.dataConfidence);
    increment(counts, enrichment.legalConfidence);
    for (const signal of enrichment.sourceSignals ?? []) increment(counts, signal.confidence);
    for (const resolution of enrichment.sourceResolutions ?? []) increment(counts, resolution.resolvedConfidence);
  }
  return counts;
}

function buildRiskCategoryBands(set: CampRecommendationSet): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = {};
  for (const enrichment of enrichments(set)) {
    incrementNested(counts, 'lateArrival', enrichment.lateArrivalRisk);
    incrementNested(counts, 'weatherExposure', enrichment.weatherExposureLevel ?? enrichment.weatherExposure);
    incrementNested(counts, 'fuelDebt', normalizeResourceDebtStatus(enrichment.resourceDebt?.fuel.status));
    incrementNested(counts, 'waterDebt', normalizeResourceDebtStatus(enrichment.resourceDebt?.water.status));
    incrementNested(counts, 'daylightDebt', normalizeResourceDebtStatus(enrichment.resourceDebt?.daylight.status));
    incrementNested(counts, 'campUncertaintyDebt', normalizeResourceDebtStatus(enrichment.resourceDebt?.campUncertainty.status));
  }
  return counts;
}

function buildSourceFreshnessBands(set: CampRecommendationSet): Partial<Record<CampOpsTelemetryFreshnessBand, number>> {
  const counts: Partial<Record<CampOpsTelemetryFreshnessBand, number>> = {};
  for (const enrichment of enrichments(set)) {
    for (const signal of enrichment.sourceSignals ?? []) {
      increment(counts, signal.freshnessStatus ?? (signal.isStale ? 'stale' : 'unknown'));
    }
    for (const resolution of enrichment.sourceResolutions ?? []) {
      for (const staleSource of resolution.staleSources) {
        if (staleSource) increment(counts, 'stale');
      }
      for (const missingSource of resolution.missingSources) {
        if (missingSource) increment(counts, 'missing');
      }
    }
  }
  return counts;
}

function sourceConflictCount(set: CampRecommendationSet): number {
  return enrichments(set).reduce(
    (count, enrichment) =>
      count + (enrichment.sourceResolutions ?? []).filter((resolution) => resolution.conflictDetected).length,
    0,
  );
}

function staleSourceCount(set: CampRecommendationSet): number {
  return enrichments(set).reduce((count, enrichment) => {
    const staleSignals = (enrichment.sourceSignals ?? []).filter(
      (signal) => signal.isStale || signal.freshnessStatus === 'stale' || signal.freshnessStatus === 'expired',
    ).length;
    const staleResolutions = (enrichment.sourceResolutions ?? []).reduce(
      (sum, resolution) => sum + resolution.staleSources.length,
      0,
    );
    return count + staleSignals + staleResolutions;
  }, 0);
}

function missingDataCount(set: CampRecommendationSet): number {
  const confidenceMissing = set.confidenceSummary.missingDataFields.length;
  const rejectedMissing = set.rejectedCandidates.reduce(
    (count, item) => count + item.gates.reduce((sum, gate) => sum + gate.missingDataFields.length, 0),
    0,
  );
  const sourceMissing = enrichments(set).reduce(
    (count, enrichment) =>
      count + (enrichment.sourceResolutions ?? []).reduce((sum, resolution) => sum + resolution.missingSources.length, 0),
    0,
  );
  return confidenceMissing + rejectedMissing + sourceMissing;
}

function buildRecommendationPayload(
  context: CampSearchContext,
  set: CampRecommendationSet,
  featureEnabled: boolean,
): CampOpsTelemetryPayload {
  return sanitizeCampOpsTelemetryPayload({
    featureEnabled,
    offlineMode: context.offlineMode,
    candidateCount: Object.keys(set.enrichmentsByCandidateId ?? {}).length +
      set.rejectedCandidates.filter((item) => !(set.enrichmentsByCandidateId ?? {})[item.candidate.id]).length,
    rejectedCount: set.rejectedCandidates.length,
    warningCount: set.warnings.length,
    assumptionCount: set.assumptions.length,
    confidenceBand: set.confidenceSummary.level,
    confidenceBands: buildConfidenceBands(set),
    roleCounts: buildRoleCounts(set),
    recommendationStatus: featureEnabled
      ? set.recommendedCamp ? 'recommended' : 'no_recommendation'
      : 'disabled',
    plannedCampDowngraded: Boolean(set.explanations?.plannedCampDowngrade),
    riskCategoryBands: buildRiskCategoryBands(set),
    sourceFreshnessBands: buildSourceFreshnessBands(set),
    sourceConflictCount: sourceConflictCount(set),
    staleSourceCount: staleSourceCount(set),
    missingDataCount: missingDataCount(set),
    decisionPointPresent: Boolean(set.decisionPoint),
    delayBand: delayBand(context.delayEstimateMinutes),
  });
}

function allowedCounts<T extends string>(value: unknown, allowed: readonly T[]): Partial<Record<T, number>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const output: Partial<Record<T, number>> = {};
  for (const key of allowed) {
    const count = finiteCount((value as Record<string, unknown>)[key]);
    if (count != null) output[key] = count;
  }
  return Object.keys(output).length ? output : undefined;
}

function safeRiskCategoryBands(value: unknown): Record<string, Record<string, number>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const output: Record<string, Record<string, number>> = {};
  for (const [category, bands] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-zA-Z0-9_]+$/.test(category) || !bands || typeof bands !== 'object' || Array.isArray(bands)) continue;
    for (const [band, count] of Object.entries(bands as Record<string, unknown>)) {
      if (!/^[a-zA-Z0-9_]+$/.test(band)) continue;
      const safeCount = finiteCount(count);
      if (safeCount == null) continue;
      if (!output[category]) output[category] = {};
      output[category][band] = safeCount;
    }
  }
  return Object.keys(output).length ? output : undefined;
}

function removeUndefined(payload: CampOpsTelemetryPayload): CampOpsTelemetryPayload {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)) as CampOpsTelemetryPayload;
}

export function sanitizeCampOpsTelemetryPayload(raw: Record<string, unknown>): CampOpsTelemetryPayload {
  const payload: CampOpsTelemetryPayload = {
    featureEnabled: bool(raw.featureEnabled),
    offlineMode: offlineMode(raw.offlineMode),
    candidateCount: finiteCount(raw.candidateCount),
    rejectedCount: finiteCount(raw.rejectedCount),
    warningCount: finiteCount(raw.warningCount),
    assumptionCount: finiteCount(raw.assumptionCount),
    confidenceBand: confidence(raw.confidenceBand),
    confidenceBands: allowedCounts(raw.confidenceBands, ['high', 'medium', 'low', 'unknown'] as const),
    roleCounts: allowedCounts(raw.roleCounts, [
      'primary',
      'backup',
      'emergency',
      'weather_fallback',
      'resupply',
      'recovery',
      'trailer_safe',
      'family_safe',
      'unknown',
    ] as const),
    recommendationStatus: raw.recommendationStatus === 'recommended' ||
      raw.recommendationStatus === 'no_recommendation' ||
      raw.recommendationStatus === 'disabled' ||
      raw.recommendationStatus === 'unknown'
      ? raw.recommendationStatus
      : undefined,
    plannedCampDowngraded: bool(raw.plannedCampDowngraded),
    riskCategoryBands: safeRiskCategoryBands(raw.riskCategoryBands),
    sourceFreshnessBands: allowedCounts(raw.sourceFreshnessBands, ['fresh', 'stale', 'expired', 'unknown', 'missing'] as const),
    sourceConflictCount: finiteCount(raw.sourceConflictCount),
    staleSourceCount: finiteCount(raw.staleSourceCount),
    missingDataCount: finiteCount(raw.missingDataCount),
    aiMode: raw.aiMode === 'field' || raw.aiMode === 'planning' ? raw.aiMode : undefined,
    decisionPointPresent: bool(raw.decisionPointPresent),
    delayBand: raw.delayBand === 'none' ||
      raw.delayBand === 'short' ||
      raw.delayBand === 'moderate' ||
      raw.delayBand === 'long' ||
      raw.delayBand === 'custom' ||
      raw.delayBand === 'unknown'
      ? raw.delayBand
      : undefined,
    endpointStatus: endpointStatus(raw.endpointStatus),
    acceptedRole: operationalRole(raw.acceptedRole),
    dismissedRole: operationalRole(raw.dismissedRole),
    debriefVisibility: debriefVisibility(raw.debriefVisibility),
    debriefHasCommunityConsent: bool(raw.debriefHasCommunityConsent),
    debriefHasPhotos: bool(raw.debriefHasPhotos),
    debriefHazardCount: finiteCount(raw.debriefHazardCount),
  };
  return removeUndefined(payload);
}

function isForbiddenTelemetryKey(key: string): boolean {
  return FORBIDDEN_TELEMETRY_KEYS.has(key) || NORMALIZED_FORBIDDEN_TELEMETRY_KEYS.has(key.toLowerCase());
}

function collectForbiddenKeys(value: unknown, path = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => collectForbiddenKeys(item, `${path}[${index}]`));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
    const currentPath = path ? `${path}.${key}` : key;
    return [
      isForbiddenTelemetryKey(key) ? currentPath : null,
      ...collectForbiddenKeys(nested, currentPath),
    ].filter((item): item is string => Boolean(item));
  });
}

export function validateCampOpsTelemetryPayload(payload: CampOpsTelemetryPayload): { ok: boolean; issues: string[] } {
  const issues = collectForbiddenKeys(payload).map((key) => `Forbidden telemetry key: ${key}`);
  return {
    ok: issues.length === 0,
    issues,
  };
}

export function validateCampOpsTelemetryRawPayload(rawPayload: Record<string, unknown>): { ok: boolean; issues: string[] } {
  const issues = collectForbiddenKeys(rawPayload).map((key) => `Forbidden raw telemetry key: ${key}`);
  return {
    ok: issues.length === 0,
    issues,
  };
}

export function configureCampOpsTelemetry(config: Partial<CampOpsTelemetryConfig>): void {
  const telemetryEnabled = config.campopsTelemetryEnabled ?? config.enabled;
  const sinkApproved = config.campopsTelemetrySinkApproved ?? config.sinkApproved;
  telemetryConfig = {
    ...telemetryConfig,
    ...config,
    ...(telemetryEnabled == null ? {} : {
      enabled: telemetryEnabled,
      campopsTelemetryEnabled: telemetryEnabled,
    }),
    ...(sinkApproved == null ? {} : {
      sinkApproved,
      campopsTelemetrySinkApproved: sinkApproved,
    }),
    sink: config.sink === undefined ? telemetryConfig.sink : config.sink,
  };
}

export function resetCampOpsTelemetryForTest(): void {
  telemetryConfig = { ...DEFAULT_CONFIG };
  telemetryEvents.length = 0;
}

export function getCampOpsTelemetryEventsForTest(): CampOpsTelemetryEvent[] {
  return telemetryEvents.slice();
}

export function emitCampOpsTelemetryEvent(
  name: CampOpsTelemetryEventName,
  rawPayload: Record<string, unknown>,
): CampOpsTelemetryEvent | null {
  const telemetryEnabled = telemetryConfig.campopsTelemetryEnabled || telemetryConfig.enabled;
  const sinkApproved = telemetryConfig.campopsTelemetrySinkApproved || telemetryConfig.sinkApproved;
  if (!telemetryEnabled || !telemetryConfig.sink || !sinkApproved) return null;
  const rawValidation = validateCampOpsTelemetryRawPayload(rawPayload);
  if (!rawValidation.ok) {
    ecsLog.warn('CAMPOPS', 'CampOps telemetry raw payload rejected', {
      eventName: name,
      issueCount: rawValidation.issues.length,
    });
    return null;
  }
  const payload = sanitizeCampOpsTelemetryPayload(rawPayload);
  const validation = validateCampOpsTelemetryPayload(payload);
  if (!validation.ok) {
    ecsLog.warn('CAMPOPS', 'CampOps telemetry payload rejected', {
      eventName: name,
      issueCount: validation.issues.length,
    });
    return null;
  }
  const event: CampOpsTelemetryEvent = {
    name,
    timestampIso: new Date().toISOString(),
    payload,
  };
  telemetryEvents.push(event);
  if (telemetryEvents.length > MAX_TEST_EVENTS) telemetryEvents.shift();
  telemetryConfig.sink?.(event);
  if (telemetryConfig.consoleDebug) {
    ecsLog.debug('CAMPOPS', name, payload);
  }
  return event;
}

export function emitCampOpsRecommendationGenerated(
  context: CampSearchContext,
  set: CampRecommendationSet,
  featureEnabled = true,
): void {
  const payload = buildRecommendationPayload(context, set, featureEnabled);
  emitCampOpsTelemetryEvent('campops_recommendation_generated', payload);
  if (payload.plannedCampDowngraded) {
    emitCampOpsTelemetryEvent('campops_planned_camp_downgraded', payload);
  }
  if ((payload.staleSourceCount ?? 0) > 0) {
    emitCampOpsTelemetryEvent('campops_provider_stale_data_detected', payload);
  }
  if ((payload.sourceConflictCount ?? 0) > 0) {
    emitCampOpsTelemetryEvent('campops_source_conflict_detected', payload);
  }
}

export function emitCampOpsEndpointRecommendationGenerated(
  context: CampSearchContext,
  set: CampRecommendationSet,
  options: { featureEnabled?: boolean; endpointStatus?: string | null } = {},
): void {
  emitCampOpsTelemetryEvent('campops_endpoint_recommendation_generated', {
    ...buildRecommendationPayload(context, set, options.featureEnabled ?? true),
    endpointStatus: options.endpointStatus ?? undefined,
  });
}

export function emitCampOpsAiSummaryGenerated(
  context: CampSearchContext,
  set: CampRecommendationSet,
  mode: CampOpsAiAssistMode,
): void {
  emitCampOpsTelemetryEvent('campops_ai_summary_generated', {
    ...buildRecommendationPayload(context, set, true),
    aiMode: mode,
  });
}

export function emitCampOpsRecommendationAccepted(
  role: CampOperationalRole | 'unknown',
  context?: CampSearchContext,
  set?: CampRecommendationSet,
): void {
  emitCampOpsTelemetryEvent('campops_recommendation_accepted', {
    ...(context && set ? buildRecommendationPayload(context, set, true) : {}),
    acceptedRole: role,
  });
}

export function emitCampOpsRecommendationDismissed(
  role: CampOperationalRole | 'unknown',
  context?: CampSearchContext,
  set?: CampRecommendationSet,
): void {
  emitCampOpsTelemetryEvent('campops_recommendation_dismissed', {
    ...(context && set ? buildRecommendationPayload(context, set, true) : {}),
    dismissedRole: role,
  });
}

export function emitCampOpsDebriefCreated(record: CampOpsDebriefRecord): void {
  emitCampOpsTelemetryEvent('campops_debrief_created', {
    debriefVisibility: record.visibility,
    debriefHasCommunityConsent: Boolean(record.privacy.publishingConsent),
    debriefHasPhotos: record.photos.length > 0,
    debriefHazardCount: record.structured.hazards.length,
  });
}
