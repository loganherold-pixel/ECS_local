import { evaluateECSConfidence } from './ai/confidenceEngine';
import type {
  ECSConfidenceFreshness,
  ECSConfidenceResult,
  ECSConfidenceSourceInput,
} from './ai/confidenceTypes';
import {
  createECS5ProviderRegistry,
  ECS5_INTENTIONALLY_DISABLED_PROVIDER_IDS,
  listProviderHealth as listRegistryProviderHealth,
  type ECS5ProviderRegistry,
  type ECS5ProviderId,
  type ProviderDefinition,
} from './ecs5ProviderRegistry';
import type {
  BailoutDecision,
  BailoutEvidenceRef,
  BailoutTrigger,
  RankedBailoutRoute,
} from './ecs5BailoutRouteManagement';
import { applyECS5RouteIntelligenceStaleness } from './ecs5OfflineStaleness';
import {
  calculateECS5SourceConfidence,
  type SourceConfidenceScore,
} from './ecs5SourceConfidence';

export type ECS5SourceConfidence = 'high' | 'moderate' | 'low' | 'unknown';
export type ECS5LegalStatus = 'legal_open' | 'restricted' | 'closed' | 'unknown' | 'conflicting';
export type ECS5ClosureStatus = 'open' | 'active_closure' | 'partial_closure' | 'unknown';
export type ECS5PassabilityStatus = 'passable' | 'impaired' | 'impassable' | 'unknown';
export type ECS5SafetyRisk = 'low' | 'watch' | 'caution' | 'critical' | 'unknown';
export type ECS5ProviderStatus =
  | 'healthy'
  | 'degraded'
  | 'stale'
  | 'disabled'
  | 'intentionally_disabled'
  | 'missing_config'
  | 'unknown';

export type ECS5AgencyProviderId =
  | ECS5ProviderId
  | 'openweather_existing';

export type ECS5AgencySignalKind =
  | 'legal_access'
  | 'closure'
  | 'passability'
  | 'weather'
  | 'fire'
  | 'smoke'
  | 'community_report'
  | 'bailout'
  | 'manual';

export interface ECS5DataSource {
  id: string;
  providerId: ECS5AgencyProviderId | string;
  label: string;
  kind: ECS5AgencySignalKind;
  origin: 'official' | 'agency' | 'weather_provider' | 'community' | 'manual' | 'derived';
  available?: boolean;
  enabled?: boolean;
  required?: boolean;
  intentionallyDisabled?: boolean;
  configured?: boolean;
  observedAt?: string | null;
  freshness?: ECSConfidenceFreshness;
  reliability?: ECS5SourceConfidence;
  agrees?: boolean | null;
  detail?: string | null;
}

export interface ECS5AgencySignal {
  id: string;
  providerId: ECS5AgencyProviderId | string;
  kind: ECS5AgencySignalKind;
  label: string;
  status?: string | null;
  severity?: ECS5SafetyRisk | 'warning' | 'severe' | 'info' | null;
  official?: boolean;
  observedAt?: string | null;
  expiresAt?: string | null;
  confidence?: ECS5SourceConfidence;
  detail?: string | null;
}

export interface ECS5ProviderHealthInput {
  providerId: ECS5AgencyProviderId | string;
  label?: string;
  enabled?: boolean;
  intentionallyDisabled?: boolean;
  configured?: boolean;
  lastSuccessAt?: string | null;
  lastErrorAt?: string | null;
  lastError?: string | null;
  staleAfterMinutes?: number;
}

export interface ECS5ProviderHealth {
  providerId: ECS5AgencyProviderId | string;
  label: string;
  status: ECS5ProviderStatus;
  requiresAttention: boolean;
  message: string;
  stale: boolean;
  missingConfig: boolean;
}

export interface ECS5BailoutRoute {
  id: string;
  label: string;
  distanceMiles?: number | null;
  etaMinutes?: number | null;
  status?: 'available' | 'watch' | 'blocked' | 'unknown';
  source?: 'official' | 'manual' | 'route' | 'community' | 'unknown';
  sourceConfidence?: ECS5SourceConfidence;
  observedAt?: string | null;
  notes?: string | null;
}

export interface ECS5RouteIntelligenceInput {
  routeId?: string | null;
  routeName?: string | null;
  legalAccess?: ECS5AgencySignal[];
  closures?: ECS5AgencySignal[];
  passability?: ECS5AgencySignal[];
  weatherFireSmoke?: ECS5AgencySignal[];
  communityReports?: ECS5AgencySignal[];
  dataSources?: ECS5DataSource[];
  providerHealth?: ECS5ProviderHealthInput[];
  bailoutRoutes?: ECS5BailoutRoute[];
  offline?: boolean;
  generatedAt?: string;
}

export interface ECS5RouteIntelligenceOutput {
  routeId?: string | null;
  routeName?: string | null;
  generatedAt: string;
  legalStatus: ECS5LegalStatus;
  closureStatus: ECS5ClosureStatus;
  passabilityStatus: ECS5PassabilityStatus;
  safetyRisk: ECS5SafetyRisk;
  sourceConfidence: ECSConfidenceResult;
  decisionConfidence: {
    legal: SourceConfidenceScore;
    closure: SourceConfidenceScore;
    passability: SourceConfidenceScore;
    safety: SourceConfidenceScore;
  };
  dataQuality: {
    missing: string[];
    stale: string[];
    conflicting: string[];
    unknowns: string[];
  };
  conflicts: string[];
  providerHealth: ECS5ProviderHealth[];
  intentionallyDisabledProviders: ECS5ProviderHealth[];
  bailoutRoutes: ECS5BailoutRoute[];
  topConcerns: string[];
  recommendedActions: string[];
  legalAdvisory: string;
  notes: string[];
}

export type RouteOverallRecommendation =
  | 'proceed'
  | 'proceed_with_caution'
  | 'verify'
  | 'reroute'
  | 'use_bailout'
  | 'delay'
  | 'do_not_travel'
  | 'manual_review_required'
  | 'unknown';

export type RouteOverallRiskLabel = 'low' | 'moderate' | 'high' | 'severe' | 'unknown';

export interface RouteIntelligenceEvidence {
  id: string;
  providerId?: string | null;
  label: string;
  kind?: string | null;
  status?: string | null;
  observedAt?: string | null;
  expiresAt?: string | null;
  evidenceUrl?: string | null;
  confidenceLabel?: string | null;
}

export interface RouteIntelligenceIssue {
  id: string;
  severity: 'info' | 'warning' | 'critical' | 'blocker';
  title: string;
  message: string;
  evidenceIds: string[];
  recommendedAction: RouteOverallRecommendation;
}

export interface LegalStatusSummary {
  status: ECS5LegalStatus;
  confidence: SourceConfidenceScore;
  evidence: RouteIntelligenceEvidence[];
  verifyWithAgencyRequired: boolean;
}

export interface ClosureSummary {
  activeClosures: RouteIntelligenceEvidence[];
  expiredClosures: RouteIntelligenceEvidence[];
  staleClosures: RouteIntelligenceEvidence[];
  confidence: SourceConfidenceScore;
}

export interface PassabilitySummary {
  status: ECS5PassabilityStatus;
  communityReports: RouteIntelligenceEvidence[];
  weatherImpacts: RouteIntelligenceEvidence[];
  fireImpacts: RouteIntelligenceEvidence[];
  confidence: SourceConfidenceScore;
}

export interface RouteSegmentRiskSummary {
  segmentId?: string | null;
  riskLabel?: string | null;
  reasons?: string[];
  evidenceObservationIds?: string[];
}

export interface WeatherSummary {
  providerSignals: RouteIntelligenceEvidence[];
  alerts: RouteIntelligenceEvidence[];
  segmentRisks: RouteSegmentRiskSummary[];
  confidence: SourceConfidenceScore;
  staleWarning?: string | null;
}

export interface FireSummary {
  activeFireProximity?: string | null;
  perimeterIntersection: boolean;
  incidents: RouteIntelligenceEvidence[];
  fireWeatherContext: 'low' | 'elevated' | 'critical' | 'unknown';
  confidence: SourceConfidenceScore;
  evidence: RouteIntelligenceEvidence[];
}

export interface SmokeAqiSummary {
  worstAqi?: number | null;
  worstCategory?: string | null;
  affectedSegments: string[];
  crewHealthWarning?: string | null;
  limitationNote?: string | null;
  confidence: SourceConfidenceScore;
}

export interface BailoutSummary {
  recommendation: BailoutDecision['recommendation'] | 'unknown';
  rankedBailouts: RankedBailoutRoute[];
  noVerifiedBailoutReason?: string | null;
  triggers: BailoutTrigger[];
  confidence: SourceConfidenceScore;
}

export interface ProviderHealthSummary {
  configuredProviders: string[];
  missingConfigProviders: string[];
  degradedProviders: string[];
  intentionallyDisabledProviders: string[];
  staleProviders: string[];
}

export interface OfflineReadinessSummary {
  cacheAvailable: boolean;
  offlineAvailable: boolean;
  evaluatedAt: string;
  validUntil: string;
  isStale: boolean;
  staleWarning?: string | null;
}

export interface RouteIntelligenceSummary {
  routeId: string;
  expeditionId?: string | null;
  evaluatedAt: string;
  validUntil: string;
  overallRecommendation: RouteOverallRecommendation;
  overallRiskScore: number;
  overallRiskLabel: RouteOverallRiskLabel;
  legalStatusSummary: LegalStatusSummary;
  closureSummary: ClosureSummary;
  passabilitySummary: PassabilitySummary;
  weatherSummary: WeatherSummary;
  fireSummary: FireSummary;
  smokeAqiSummary: SmokeAqiSummary;
  bailoutSummary: BailoutSummary;
  sourceConfidenceSummary: SourceConfidenceScore;
  conflictSummary: string[];
  blockingIssues: RouteIntelligenceIssue[];
  warnings: RouteIntelligenceIssue[];
  unknowns: RouteIntelligenceIssue[];
  recommendedActions: string[];
  sourceFreshnessNotes: string[];
  evidence: RouteIntelligenceEvidence[];
  offlineReadiness: OfflineReadinessSummary;
  providerHealthSummary: ProviderHealthSummary;
}

export interface RouteIntelligenceEvaluationContext extends ECS5RouteIntelligenceInput {
  expeditionId?: string | null;
  validUntil?: string | null;
  bailoutDecision?: BailoutDecision | null;
  weatherSegmentRisks?: RouteSegmentRiskSummary[];
  providerRegistry?: ECS5ProviderRegistry;
  cachedSummary?: RouteIntelligenceSummary | null;
}

const OFFICIAL_ORIGINS = new Set(['official', 'agency']);
const routeIntelligenceSummaryCache = new Map<string, RouteIntelligenceSummary>();
const ROUTE_COPY_UNSAFE_PATTERNS = [
  /\bAI-Inferred\b/gi,
  /\bguaranteed\s+(?:safe|open|accessible|passable)\b/gi,
  /\bsafe route\b/gi,
  /\bverified as legal, open, passable, and suitable\b/gi,
];

export const ECS5_INTENTIONALLY_DISABLED_OPENWEATHER_PROVIDERS: ECS5ProviderHealthInput[] = [
  ...ECS5_INTENTIONALLY_DISABLED_PROVIDER_IDS.map((providerId) => ({
    providerId,
    label: intentionallyDisabledProviderLabel(providerId),
    enabled: false,
    intentionallyDisabled: true,
    configured: false,
  })),
];

export function buildECS5ProviderHealth(
  input: ECS5ProviderHealthInput[],
  now = new Date(),
): ECS5ProviderHealth[] {
  return [...input, ...missingDisabledProviderInputs(input)].map((provider) => {
    const label = provider.label ?? provider.providerId;
    if (provider.intentionallyDisabled) {
      return {
        providerId: provider.providerId,
        label,
        status: 'intentionally_disabled',
        requiresAttention: false,
        message: 'Provider intentionally disabled for current ECS 5.0 scope.',
        stale: false,
        missingConfig: false,
      };
    }
    if (provider.enabled === false) {
      return {
        providerId: provider.providerId,
        label,
        status: 'disabled',
        requiresAttention: false,
        message: 'Provider disabled.',
        stale: false,
        missingConfig: false,
      };
    }
    if (provider.configured === false) {
      return {
        providerId: provider.providerId,
        label,
        status: 'missing_config',
        requiresAttention: true,
        message: 'Provider enabled but missing required configuration.',
        stale: false,
        missingConfig: true,
      };
    }

    const stale = isStale(provider.lastSuccessAt, provider.staleAfterMinutes ?? 180, now);
    if (stale) {
      return {
        providerId: provider.providerId,
        label,
        status: 'stale',
        requiresAttention: true,
        message: 'Provider data is stale.',
        stale: true,
        missingConfig: false,
      };
    }
    if (provider.lastErrorAt && !provider.lastSuccessAt) {
      return {
        providerId: provider.providerId,
        label,
        status: 'degraded',
        requiresAttention: true,
        message: provider.lastError ?? 'Provider has recent errors.',
        stale: false,
        missingConfig: false,
      };
    }
    return {
      providerId: provider.providerId,
      label,
      status: provider.lastSuccessAt ? 'healthy' : 'unknown',
      requiresAttention: false,
      message: provider.lastSuccessAt ? 'Provider healthy.' : 'Provider status unknown.',
      stale: false,
      missingConfig: false,
    };
  });
}

export function buildUnifiedECS5RouteIntelligence(
  input: ECS5RouteIntelligenceInput,
  now = new Date(),
): ECS5RouteIntelligenceOutput {
  const generatedAt = input.generatedAt ?? now.toISOString();
  const providerHealth = buildECS5ProviderHealth(input.providerHealth ?? [], now);
  const legalStatus = resolveLegalStatus(input);
  const closureStatus = resolveClosureStatus(input);
  const passabilityStatus = resolvePassabilityStatus(input);
  const safetyRisk = resolveSafetyRisk(input, closureStatus, passabilityStatus);
  const sourceConfidence = assessECS5SourceConfidence(input);
  const decisionConfidence = buildDecisionConfidence(input, now);
  const dataQuality = collectDataQuality(input, providerHealth);
  const conflicts = collectConflicts(input, legalStatus, closureStatus);
  const bailoutRoutes = normalizeBailoutRoutes(input.bailoutRoutes ?? []);
  const topConcerns = collectTopConcerns({
    legalStatus,
    closureStatus,
    passabilityStatus,
    safetyRisk,
    dataQuality,
    conflicts,
    bailoutRoutes,
  });

  const recommendedActions = collectRecommendedActions({
    legalStatus,
    closureStatus,
    passabilityStatus,
    safetyRisk,
    dataQuality,
    conflicts,
    bailoutRoutes,
  });
  const notes = dedupe([
    'Legal/open status is evaluated separately from passability and safety risk.',
    'Official closure signals override static legal access data.',
    'Community reports may raise operational risk but cannot legally reopen a closed route.',
    ...buildSourceFreshnessNotes(input, dataQuality, providerHealth, now),
  ]).map(guardRouteIntelligenceCopy);

  return {
    routeId: input.routeId ?? null,
    routeName: input.routeName ?? null,
    generatedAt,
    legalStatus,
    closureStatus,
    passabilityStatus,
    safetyRisk,
    sourceConfidence,
    decisionConfidence,
    dataQuality,
    conflicts,
    providerHealth,
    intentionallyDisabledProviders: providerHealth.filter((provider) => provider.status === 'intentionally_disabled'),
    bailoutRoutes,
    topConcerns: topConcerns.map(guardRouteIntelligenceCopy),
    recommendedActions: recommendedActions.map(guardRouteIntelligenceCopy),
    legalAdvisory: 'ECS route access output is operational guidance, not legal advice. Verify with current official agency sources before travel.',
    notes,
  };
}

export function evaluateRouteIntelligence(
  routeId: string,
  context: RouteIntelligenceEvaluationContext = {},
  now = new Date(),
): RouteIntelligenceSummary {
  const evaluatedAt = context.generatedAt ?? now.toISOString();
  const validUntil = context.validUntil ?? new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const legacy = buildUnifiedECS5RouteIntelligence({
    ...context,
    routeId,
    generatedAt: evaluatedAt,
  }, now);
  const providerHealthSummary = getProviderHealthSummary(context.providerRegistry, context.providerHealth, now);
  const evidence = buildRouteEvidence(context, legacy);
  const blockingIssues = guardRouteIssues(buildBlockingIssues(context, legacy, evidence));
  const warnings = guardRouteIssues(buildWarningIssues(context, legacy, evidence));
  const unknowns = guardRouteIssues(buildUnknownIssues(context, legacy, evidence));
  const bailoutSummary = buildBailoutSummary(context.bailoutDecision, legacy.decisionConfidence.safety);
  const sourceConfidenceSummary = calculateECS5SourceConfidence({
    decisionType: 'manual_review',
    sources: evidence.map(routeEvidenceToConfidenceSource),
    now,
  });
  const overallRiskScore = calculateOverallRiskScore(legacy, context, bailoutSummary, validUntil, now);
  const overallRiskLabel = routeRiskLabel(overallRiskScore, legacy);
  const overallRecommendation = resolveOverallRecommendation({
    legacy,
    context,
    bailoutSummary,
    blockingIssues,
    warnings,
    unknowns,
    overallRiskScore,
  });
  const offlineReadiness = buildOfflineReadiness(context, evaluatedAt, validUntil, now);

  const summary: RouteIntelligenceSummary = {
    routeId,
    expeditionId: context.expeditionId ?? null,
    evaluatedAt,
    validUntil,
    overallRecommendation,
    overallRiskScore,
    overallRiskLabel,
    legalStatusSummary: {
      status: legacy.legalStatus,
      confidence: legacy.decisionConfidence.legal,
      evidence: evidence.filter((item) => item.kind === 'legal_access'),
      verifyWithAgencyRequired: legacy.legalStatus === 'unknown' ||
        legacy.legalStatus === 'conflicting' ||
        legacy.closureStatus === 'active_closure' ||
        legacy.decisionConfidence.legal.label !== 'high',
    },
    closureSummary: buildClosureSummary(context, legacy),
    passabilitySummary: buildPassabilitySummary(context, legacy),
    weatherSummary: buildWeatherSummary(context, legacy),
    fireSummary: buildFireSummary(context, legacy),
    smokeAqiSummary: buildSmokeAqiSummary(context, legacy),
    bailoutSummary,
    sourceConfidenceSummary,
    conflictSummary: legacy.conflicts,
    blockingIssues,
    warnings,
    unknowns,
    recommendedActions: dedupe([
      ...legacy.recommendedActions,
      ...blockingIssues.map((item) => item.message),
      overallRecommendation === 'use_bailout' ? 'Use the selected bailout route only after verifying current access, passability, and crew readiness.' : null,
      offlineReadiness.isStale ? 'Refresh route intelligence before relying on cached/offline output.' : null,
    ]).map(guardRouteIntelligenceCopy),
    sourceFreshnessNotes: legacy.notes,
    evidence,
    offlineReadiness,
    providerHealthSummary,
  };

  routeIntelligenceSummaryCache.set(routeId, summary);
  return summary;
}

export function evaluateExpeditionRouteIntelligence(
  expeditionId: string,
  routes: Array<{ routeId: string; context?: RouteIntelligenceEvaluationContext }>,
  now = new Date(),
): RouteIntelligenceSummary[] {
  return routes.map((route) => evaluateRouteIntelligence(route.routeId, {
    ...(route.context ?? {}),
    expeditionId,
  }, now));
}

export function getRouteIntelligenceSummary(
  routeId: string,
  now = new Date(),
): RouteIntelligenceSummary | null {
  const summary = routeIntelligenceSummaryCache.get(routeId);
  if (!summary) return null;
  if (Date.parse(summary.validUntil) > now.getTime()) return summary;
  const staleSummary = applyECS5RouteIntelligenceStaleness(summary, now);
  routeIntelligenceSummaryCache.set(routeId, staleSummary);
  return staleSummary;
}

export function refreshRouteIntelligence(
  routeId: string,
  context: RouteIntelligenceEvaluationContext = {},
  now = new Date(),
): RouteIntelligenceSummary {
  return evaluateRouteIntelligence(routeId, context, now);
}

export function getProviderHealthSummary(
  registry: ECS5ProviderRegistry = createECS5ProviderRegistry(),
  legacyHealth: ECS5ProviderHealthInput[] = [],
  now = new Date(),
): ProviderHealthSummary {
  const registryProviders = listRegistryProviderHealth(registry);
  const legacyProviders = buildECS5ProviderHealth(legacyHealth, now);
  const configured = new Set<string>();
  const missing = new Set<string>();
  const degraded = new Set<string>();
  const intentionallyDisabled = new Set<string>();
  const stale = new Set<string>();

  for (const provider of registryProviders) {
    classifyProviderDefinition(provider, configured, missing, degraded, intentionallyDisabled, stale);
  }
  for (const provider of legacyProviders) {
    if (provider.status === 'healthy') configured.add(String(provider.providerId));
    if (provider.status === 'missing_config') missing.add(String(provider.providerId));
    if (provider.status === 'degraded' || provider.status === 'unknown') degraded.add(String(provider.providerId));
    if (provider.status === 'intentionally_disabled') intentionallyDisabled.add(String(provider.providerId));
    if (provider.status === 'stale') stale.add(String(provider.providerId));
  }

  return {
    configuredProviders: [...configured].sort(),
    missingConfigProviders: [...missing].sort(),
    degradedProviders: [...degraded].sort(),
    intentionallyDisabledProviders: [...intentionallyDisabled].sort(),
    staleProviders: [...stale].sort(),
  };
}

function buildDecisionConfidence(input: ECS5RouteIntelligenceInput, now: Date): ECS5RouteIntelligenceOutput['decisionConfidence'] {
  return {
    legal: calculateECS5SourceConfidence({
      decisionType: 'legal_access',
      sources: (input.legalAccess ?? []).map(signalToConfidenceEvidence),
      now,
    }),
    closure: calculateECS5SourceConfidence({
      decisionType: 'closure',
      sources: (input.closures ?? []).map(signalToConfidenceEvidence),
      now,
    }),
    passability: calculateECS5SourceConfidence({
      decisionType: 'passability',
      sources: [
        ...(input.passability ?? []).map(signalToConfidenceEvidence),
        ...(input.communityReports ?? []).map(signalToConfidenceEvidence),
      ],
      now,
    }),
    safety: calculateECS5SourceConfidence({
      decisionType: 'weather',
      sources: [
        ...(input.weatherFireSmoke ?? []).map(signalToConfidenceEvidence),
        ...(input.passability ?? []).map(signalToConfidenceEvidence),
        ...(input.communityReports ?? []).map(signalToConfidenceEvidence),
      ],
      now,
    }),
  };
}

function signalToConfidenceEvidence(signal: ECS5AgencySignal) {
  return {
    id: signal.id,
    providerId: signal.providerId,
    sourceName: signal.label,
    recordType: signal.kind,
    status: signal.status ?? null,
    detail: signal.detail ?? null,
    observedAt: signal.observedAt ?? null,
    expiresAt: signal.expiresAt ?? null,
    official: signal.official === true,
    agrees: null,
    evidenceUrl: null,
    knownLimitations: [],
  };
}

export function assessECS5SourceConfidence(input: ECS5RouteIntelligenceInput): ECSConfidenceResult {
  const sources: ECSConfidenceSourceInput[] = [
    ...dataSourcesToConfidenceSources(input.dataSources ?? []),
    ...signalsToConfidenceSources('legal_access', input.legalAccess ?? [], true),
    ...signalsToConfidenceSources('closure_status', input.closures ?? [], true),
    ...signalsToConfidenceSources('passability', input.passability ?? [], false),
    ...signalsToConfidenceSources('weather_fire_smoke', input.weatherFireSmoke ?? [], false),
    ...signalsToConfidenceSources('community_reports', input.communityReports ?? [], false),
  ];

  if (sources.length === 0) {
    sources.push(
      { id: 'legal_access', origin: 'inferred', available: false, required: true, freshness: 'unknown', priority: 'critical' },
      { id: 'closure_status', origin: 'inferred', available: false, required: true, freshness: 'unknown', priority: 'critical' },
    );
  }

  return evaluateECSConfidence({
    domain: 'route_intelligence',
    offline: input.offline === true,
    cloudDependent: true,
    sources,
  });
}

function resolveLegalStatus(input: ECS5RouteIntelligenceInput): ECS5LegalStatus {
  const legal = input.legalAccess ?? [];
  const closures = input.closures ?? [];
  if (hasOfficialClosure(closures)) return 'closed';
  if (closures.some((signal) => normalized(signal.status).includes('partial'))) return 'restricted';
  if (legal.some((signal) => normalized(signal.status).includes('closed'))) return 'closed';
  if (legal.some((signal) => normalized(signal.status).includes('restricted') || normalized(signal.status).includes('permit'))) {
    return 'restricted';
  }
  if (legal.some((signal) => normalized(signal.status).includes('open') || normalized(signal.status).includes('legal'))) {
    return 'legal_open';
  }
  if (legal.length > 1 && hasConflictingSignals(legal)) return 'conflicting';
  return 'unknown';
}

function resolveClosureStatus(input: ECS5RouteIntelligenceInput): ECS5ClosureStatus {
  const closures = input.closures ?? [];
  if (hasOfficialClosure(closures)) return 'active_closure';
  if (closures.some((signal) => normalized(signal.status).includes('partial'))) return 'partial_closure';
  if (closures.some((signal) => normalized(signal.status).includes('open') || normalized(signal.status).includes('none'))) {
    return 'open';
  }
  return 'unknown';
}

function resolvePassabilityStatus(input: ECS5RouteIntelligenceInput): ECS5PassabilityStatus {
  const passability = input.passability ?? [];
  if (passability.some((signal) => /impassable|blocked|washed out|closed by condition/i.test(signal.status ?? signal.detail ?? ''))) {
    return 'impassable';
  }
  if (passability.some((signal) => /rough|snow|mud|washout|limited|high clearance|chains|impaired/i.test(signal.status ?? signal.detail ?? ''))) {
    return 'impaired';
  }
  if (passability.some((signal) => /passable|clear|open/i.test(signal.status ?? signal.detail ?? ''))) {
    return 'passable';
  }
  return 'unknown';
}

function resolveSafetyRisk(
  input: ECS5RouteIntelligenceInput,
  closureStatus: ECS5ClosureStatus,
  passabilityStatus: ECS5PassabilityStatus,
): ECS5SafetyRisk {
  if (closureStatus === 'active_closure') return 'critical';
  if (passabilityStatus === 'impassable') return 'critical';

  const allRiskSignals = [
    ...(input.weatherFireSmoke ?? []),
    ...(input.communityReports ?? []),
    ...(input.passability ?? []),
  ];
  if (allRiskSignals.some((signal) => signal.severity === 'critical' || signal.severity === 'severe')) return 'critical';
  if (allRiskSignals.some((signal) => signal.severity === 'caution' || signal.severity === 'warning')) return 'caution';
  if (allRiskSignals.some((signal) => signal.severity === 'watch' || signal.severity === 'info')) return 'watch';
  if (passabilityStatus === 'passable') return 'low';
  return 'unknown';
}

function hasOfficialClosure(closures: ECS5AgencySignal[]): boolean {
  return closures.some((signal) => {
    const status = normalized(signal.status);
    const detail = normalized(signal.detail);
    return signal.official === true &&
      (status.includes('closed') || status.includes('closure') || detail.includes('closed') || detail.includes('closure'));
  });
}

function hasConflictingSignals(signals: ECS5AgencySignal[]): boolean {
  const statuses = new Set(signals.map((signal) => normalized(signal.status)).filter(Boolean));
  return statuses.has('open') && (statuses.has('closed') || statuses.has('restricted'));
}

function collectConflicts(
  input: ECS5RouteIntelligenceInput,
  legalStatus: ECS5LegalStatus,
  closureStatus: ECS5ClosureStatus,
): string[] {
  const conflicts: string[] = [];
  if (legalStatus === 'closed' && closureStatus === 'active_closure') {
    conflicts.push('Official closure overrides static legal access status.');
  }
  if ((input.communityReports ?? []).some((signal) => /open|passable/i.test(signal.status ?? signal.detail ?? '')) &&
    closureStatus === 'active_closure') {
    conflicts.push('Community reports cannot reopen an active official closure.');
  }
  if (hasConflictingSignals(input.legalAccess ?? [])) {
    conflicts.push('Legal access sources conflict and require official verification.');
  }
  return dedupe(conflicts);
}

function collectDataQuality(input: ECS5RouteIntelligenceInput, providerHealth: ECS5ProviderHealth[]) {
  const missing: string[] = [];
  const stale: string[] = [];
  const conflicting: string[] = [];
  const unknowns: string[] = [];

  if (!input.legalAccess?.length) missing.push('legal status');
  if (!input.closures?.length) missing.push('closure status');
  if (!input.passability?.length) unknowns.push('passability / current conditions');
  for (const source of input.dataSources ?? []) {
    if (source.available === false && source.required) missing.push(source.label);
    if (source.freshness === 'stale') stale.push(source.label);
    if (source.agrees === false) conflicting.push(source.label);
  }
  for (const provider of providerHealth) {
    if (provider.status === 'stale') stale.push(provider.label);
    if (provider.status === 'missing_config') missing.push(provider.label);
  }
  return {
    missing: dedupe(missing),
    stale: dedupe(stale),
    conflicting: dedupe(conflicting),
    unknowns: dedupe(unknowns),
  };
}

function collectTopConcerns(input: {
  legalStatus: ECS5LegalStatus;
  closureStatus: ECS5ClosureStatus;
  passabilityStatus: ECS5PassabilityStatus;
  safetyRisk: ECS5SafetyRisk;
  dataQuality: ECS5RouteIntelligenceOutput['dataQuality'];
  conflicts: string[];
  bailoutRoutes: ECS5BailoutRoute[];
}): string[] {
  return dedupe([
    input.closureStatus === 'active_closure' ? 'Active official closure' : null,
    input.legalStatus === 'unknown' || input.legalStatus === 'conflicting' ? 'Legal access uncertainty' : null,
    input.passabilityStatus === 'impassable' ? 'Route may be impassable' : null,
    input.safetyRisk === 'critical' ? 'Critical route safety risk' : null,
    input.bailoutRoutes.length === 0 ? 'No bailout routes recorded' : null,
    ...input.conflicts,
    ...input.dataQuality.stale.map((item) => `${item} stale`),
  ]);
}

function collectRecommendedActions(input: {
  legalStatus: ECS5LegalStatus;
  closureStatus: ECS5ClosureStatus;
  passabilityStatus: ECS5PassabilityStatus;
  safetyRisk: ECS5SafetyRisk;
  dataQuality: ECS5RouteIntelligenceOutput['dataQuality'];
  conflicts: string[];
  bailoutRoutes: ECS5BailoutRoute[];
}): string[] {
  const actions: string[] = [];
  if (input.closureStatus === 'active_closure') {
    actions.push('Do not rely on static access data; verify the active closure with the managing agency before travel.');
  }
  if (input.legalStatus === 'unknown' || input.legalStatus === 'conflicting') {
    actions.push('Verify legal access with current official agency sources.');
  }
  if (input.passabilityStatus === 'impassable' || input.safetyRisk === 'critical') {
    actions.push('Delay, reroute, or select a lower-risk route until conditions are verified.');
  }
  if (input.bailoutRoutes.length === 0) {
    actions.push('Add at least one bailout or exit option before committing to the route.');
  }
  if (input.dataQuality.stale.length > 0) {
    actions.push('Refresh stale provider data before using this route intelligence operationally.');
  }
  if (input.dataQuality.missing.length > 0 || input.dataQuality.unknowns.length > 0) {
    actions.push('Treat unavailable route data as needs field verification before relying on this analysis.');
  }
  return dedupe(actions.length ? actions : ['Continue monitoring official sources, route conditions, and ECS confidence before departure.']);
}

function buildSourceFreshnessNotes(
  input: ECS5RouteIntelligenceInput,
  dataQuality: ECS5RouteIntelligenceOutput['dataQuality'],
  providerHealth: ECS5ProviderHealth[],
  now: Date,
): string[] {
  const notes: string[] = [];
  if (dataQuality.missing.length > 0) {
    notes.push(`Unavailable route source data: ${dataQuality.missing.join(', ')}. Needs field verification.`);
  }
  if (dataQuality.unknowns.length > 0) {
    notes.push(`Unresolved route inputs: ${dataQuality.unknowns.join(', ')}. ECS is not assuming favorable conditions.`);
  }
  if (dataQuality.stale.length > 0) {
    notes.push(`Stale route source data: ${dataQuality.stale.join(', ')}. Refresh before operational use.`);
  }

  const signalFreshness = [
    ...(input.legalAccess ?? []),
    ...(input.closures ?? []),
    ...(input.passability ?? []),
    ...(input.weatherFireSmoke ?? []),
    ...(input.communityReports ?? []),
  ].map((signal) => freshnessFromObservedAt(signal.observedAt));
  const freshCount = signalFreshness.filter((item) => item === 'fresh').length;
  const agingCount = signalFreshness.filter((item) => item === 'aging').length;
  const staleCount = signalFreshness.filter((item) => item === 'stale').length;
  if (freshCount + agingCount + staleCount > 0) {
    const parts = [
      freshCount > 0 ? `${freshCount} fresh` : null,
      agingCount > 0 ? `${agingCount} aging` : null,
      staleCount > 0 ? `${staleCount} stale` : null,
    ].filter(Boolean);
    notes.push(`Source freshness: ${parts.join(', ')} route signal${freshCount + agingCount + staleCount === 1 ? '' : 's'}.`);
  }

  const staleProviders = providerHealth.filter((provider) => provider.status === 'stale').map((provider) => provider.label);
  if (staleProviders.length > 0) {
    notes.push(`Provider freshness limited: ${dedupe(staleProviders).join(', ')} stale.`);
  }
  if (input.offline === true) {
    notes.push('Offline route intelligence uses cached or local data and may not reflect current closures or conditions.');
  }

  return dedupe(notes).map(guardRouteIntelligenceCopy);
}

function normalizeBailoutRoutes(routes: ECS5BailoutRoute[]): ECS5BailoutRoute[] {
  return routes.map((route) => ({
    ...route,
    status: route.status ?? 'unknown',
    source: route.source ?? 'unknown',
    sourceConfidence: route.sourceConfidence ?? 'unknown',
  }));
}

function buildRouteEvidence(
  context: RouteIntelligenceEvaluationContext,
  legacy: ECS5RouteIntelligenceOutput,
): RouteIntelligenceEvidence[] {
  return dedupeEvidence([
    ...(context.legalAccess ?? []).map(signalToRouteEvidence),
    ...(context.closures ?? []).map(signalToRouteEvidence),
    ...(context.passability ?? []).map(signalToRouteEvidence),
    ...(context.weatherFireSmoke ?? []).map(signalToRouteEvidence),
    ...(context.communityReports ?? []).map(signalToRouteEvidence),
    ...(context.bailoutDecision?.evidence ?? []).map(bailoutEvidenceToRouteEvidence),
    ...legacy.bailoutRoutes.map((route) => ({
      id: route.id,
      providerId: route.source ?? 'bailout',
      label: route.label,
      kind: 'bailout',
      status: route.status ?? 'unknown',
      observedAt: route.observedAt ?? null,
      evidenceUrl: null,
      confidenceLabel: route.sourceConfidence ?? 'unknown',
    })),
  ]);
}

function buildClosureSummary(
  context: RouteIntelligenceEvaluationContext,
  legacy: ECS5RouteIntelligenceOutput,
): ClosureSummary {
  const closures = context.closures ?? [];
  return {
    activeClosures: closures.filter((signal) => isActiveClosureSignal(signal)).map(signalToRouteEvidence),
    expiredClosures: closures.filter((signal) => /expired/i.test(signal.status ?? signal.detail ?? '')).map(signalToRouteEvidence),
    staleClosures: closures.filter((signal) => signal.expiresAt != null && Date.parse(signal.expiresAt) <= Date.parse(legacy.generatedAt)).map(signalToRouteEvidence),
    confidence: legacy.decisionConfidence.closure,
  };
}

function buildPassabilitySummary(
  context: RouteIntelligenceEvaluationContext,
  legacy: ECS5RouteIntelligenceOutput,
): PassabilitySummary {
  return {
    status: legacy.passabilityStatus,
    communityReports: (context.communityReports ?? []).map(signalToRouteEvidence),
    weatherImpacts: (context.weatherFireSmoke ?? [])
      .filter((signal) => signal.kind === 'weather')
      .map(signalToRouteEvidence),
    fireImpacts: (context.weatherFireSmoke ?? [])
      .filter((signal) => signal.kind === 'fire' || signal.kind === 'smoke')
      .map(signalToRouteEvidence),
    confidence: legacy.decisionConfidence.passability,
  };
}

function buildWeatherSummary(
  context: RouteIntelligenceEvaluationContext,
  legacy: ECS5RouteIntelligenceOutput,
): WeatherSummary {
  const weatherSignals = (context.weatherFireSmoke ?? []).filter((signal) => signal.kind === 'weather');
  return {
    providerSignals: weatherSignals.map(signalToRouteEvidence),
    alerts: weatherSignals.filter((signal) => /alert|watch|warning|advisory/i.test(signal.status ?? signal.detail ?? signal.label)).map(signalToRouteEvidence),
    segmentRisks: context.weatherSegmentRisks ?? [],
    confidence: legacy.decisionConfidence.safety,
    staleWarning: legacy.decisionConfidence.safety.staleWarning,
  };
}

function buildFireSummary(
  context: RouteIntelligenceEvaluationContext,
  legacy: ECS5RouteIntelligenceOutput,
): FireSummary {
  const fireSignals = (context.weatherFireSmoke ?? []).filter((signal) => signal.kind === 'fire');
  const perimeterIntersection = fireSignals.some((signal) => /perimeter|intersect/i.test(signal.status ?? signal.detail ?? signal.label));
  const redFlag = (context.weatherFireSmoke ?? []).some((signal) => /red flag|fire weather/i.test(signal.status ?? signal.detail ?? signal.label));
  return {
    activeFireProximity: fireSignals.find((signal) => /nearby|proximity|active fire/i.test(signal.status ?? signal.detail ?? ''))?.detail ?? null,
    perimeterIntersection,
    incidents: fireSignals.map(signalToRouteEvidence),
    fireWeatherContext: perimeterIntersection ? 'critical' : redFlag ? 'elevated' : fireSignals.length > 0 ? 'elevated' : 'unknown',
    confidence: legacy.decisionConfidence.safety,
    evidence: fireSignals.map(signalToRouteEvidence),
  };
}

function buildSmokeAqiSummary(
  context: RouteIntelligenceEvaluationContext,
  legacy: ECS5RouteIntelligenceOutput,
): SmokeAqiSummary {
  const smokeSignals = (context.weatherFireSmoke ?? []).filter((signal) => signal.kind === 'smoke');
  const worstAqi = smokeSignals.reduce<number | null>((worst, signal) => {
    const match = String(signal.status ?? signal.detail ?? '').match(/\bAQI\s*[:=]?\s*(\d{1,3})\b/i) ??
      String(signal.detail ?? signal.status ?? '').match(/\b(\d{2,3})\b/);
    const value = match ? Number(match[1]) : null;
    if (!Number.isFinite(value)) return worst;
    return worst == null ? value : Math.max(worst, value as number);
  }, null);
  const worstCategory = smokeSignals.find((signal) => /hazardous|very unhealthy|unhealthy|moderate|good/i.test(signal.status ?? signal.detail ?? ''))?.status ?? null;
  return {
    worstAqi,
    worstCategory,
    affectedSegments: dedupe(smokeSignals.map((signal) => signal.id)),
    crewHealthWarning: smokeSignals.some((signal) => signal.severity === 'critical' || signal.severity === 'severe' || /hazardous|unhealthy/i.test(signal.status ?? signal.detail ?? ''))
      ? 'Smoke/AQI may affect crew health; consider delay, reroute, or shorter exposure.'
      : null,
    limitationNote: smokeSignals.length > 0 ? 'AQI/smoke affects health risk and does not imply legal closure.' : null,
    confidence: legacy.decisionConfidence.safety,
  };
}

function buildBailoutSummary(
  bailoutDecision: BailoutDecision | null | undefined,
  fallbackConfidence: SourceConfidenceScore,
): BailoutSummary {
  return {
    recommendation: bailoutDecision?.recommendation ?? 'unknown',
    rankedBailouts: bailoutDecision?.rankedCandidates ?? [],
    noVerifiedBailoutReason: bailoutDecision && bailoutDecision.recommendation === 'no_verified_bailout'
      ? 'No bailout candidate is currently verified as legal, open, passable, and suitable.'
      : null,
    triggers: bailoutDecision?.rankedCandidates.flatMap((candidate) => candidate.triggers) ?? [],
    confidence: bailoutDecision?.confidenceSummary ?? fallbackConfidence,
  };
}

function buildBlockingIssues(
  context: RouteIntelligenceEvaluationContext,
  legacy: ECS5RouteIntelligenceOutput,
  evidence: RouteIntelligenceEvidence[],
): RouteIntelligenceIssue[] {
  const issues: RouteIntelligenceIssue[] = [];
  const closureEvidence = evidence.filter((item) => item.kind === 'closure').map((item) => item.id);
  if (legacy.closureStatus === 'active_closure' || legacy.legalStatus === 'closed') {
    issues.push(issue('official_closure', 'blocker', 'Official closure controls route decision', 'Active official closure/order data blocks this route until verified resolved.', closureEvidence, 'do_not_travel'));
  }
  const fireEvidence = evidence.filter((item) => item.kind === 'fire').map((item) => item.id);
  if ((context.weatherFireSmoke ?? []).some((signal) => signal.kind === 'fire' && /perimeter|intersect/i.test(signal.status ?? signal.detail ?? signal.label))) {
    issues.push(issue('fire_perimeter', 'blocker', 'Fire perimeter intersects route', 'Fire perimeter intersection is a safety-critical blocker unless confirmed inactive or historical.', fireEvidence, 'reroute'));
  }
  if (legacy.passabilityStatus === 'impassable') {
    issues.push(issue('impassable', 'critical', 'Route may be impassable', 'Condition or community signals indicate the route may be impassable.', evidence.filter((item) => item.kind === 'passability' || item.kind === 'community_report').map((item) => item.id), 'reroute'));
  }
  return dedupeIssues(issues);
}

function buildWarningIssues(
  context: RouteIntelligenceEvaluationContext,
  legacy: ECS5RouteIntelligenceOutput,
  evidence: RouteIntelligenceEvidence[],
): RouteIntelligenceIssue[] {
  const issues: RouteIntelligenceIssue[] = [];
  if (legacy.legalStatus === 'restricted' || legacy.legalStatus === 'conflicting') {
    issues.push(issue('legal_restricted_or_conflicting', 'warning', 'Legal access needs verification', 'Legal access is restricted or conflicting; verify with current official sources.', evidence.filter((item) => item.kind === 'legal_access').map((item) => item.id), 'verify'));
  }
  const smokeSignals = (context.weatherFireSmoke ?? []).filter((signal) => signal.kind === 'smoke');
  if (smokeSignals.some((signal) => signal.severity === 'critical' || signal.severity === 'severe' || /hazardous|unhealthy/i.test(signal.status ?? signal.detail ?? ''))) {
    issues.push(issue('smoke_aqi', 'warning', 'High AQI or smoke affects crew health', 'Smoke/AQI can recommend delay or reroute but does not create legal closure.', smokeSignals.map((signal) => signal.id), 'delay'));
  }
  const weatherSignals = (context.weatherFireSmoke ?? []).filter((signal) => signal.kind === 'weather');
  if (weatherSignals.some((signal) => signal.severity === 'critical' || signal.severity === 'severe' || /warning|severe|storm|flood|winter|wind/i.test(signal.status ?? signal.detail ?? ''))) {
    issues.push(issue('severe_weather', 'warning', 'Severe weather affects route', 'Severe weather can justify delay, reroute, or bailout reevaluation.', weatherSignals.map((signal) => signal.id), 'delay'));
  }
  if (context.bailoutDecision?.recommendation === 'no_verified_bailout') {
    issues.push(issue('no_verified_bailout', 'warning', 'No verified bailout route', 'No bailout candidate is currently verified as legal, open, passable, and suitable.', context.bailoutDecision.evidence.map((item) => item.id), 'manual_review_required'));
  }
  return dedupeIssues(issues);
}

function buildUnknownIssues(
  context: RouteIntelligenceEvaluationContext,
  legacy: ECS5RouteIntelligenceOutput,
  evidence: RouteIntelligenceEvidence[],
): RouteIntelligenceIssue[] {
  const issues: RouteIntelligenceIssue[] = [];
  if (legacy.legalStatus === 'unknown') {
    issues.push(issue('unknown_legal_access', 'warning', 'Legal access unknown', 'Unknown legal access requires agency verification before operational use.', evidence.filter((item) => item.kind === 'legal_access').map((item) => item.id), 'verify'));
  }
  if (legacy.closureStatus === 'unknown') {
    issues.push(issue('unknown_closure_status', 'info', 'Closure status unknown', 'Closure status is unknown; confidence is reduced.', evidence.filter((item) => item.kind === 'closure').map((item) => item.id), 'manual_review_required'));
  }
  if (legacy.passabilityStatus === 'unknown') {
    issues.push(issue('unknown_passability', 'info', 'Current passability unavailable', 'Current passability or route-condition data is unavailable; needs field verification.', evidence.filter((item) => item.kind === 'passability' || item.kind === 'community_report').map((item) => item.id), 'manual_review_required'));
  }
  if (legacy.dataQuality.missing.length > 0) {
    issues.push(issue('missing_route_source_data', 'info', 'Route source data unavailable', `Unavailable source data: ${legacy.dataQuality.missing.join(', ')}. ECS is not assuming favorable conditions.`, [], 'manual_review_required'));
  }
  const requiredWeatherMissing = (context.dataSources ?? []).some((source) =>
    source.required === true &&
    source.kind === 'weather' &&
    source.available === false
  );
  if (requiredWeatherMissing || (legacy.dataQuality.missing.some((item) => /weather/i.test(item)))) {
    issues.push(issue('route_weather_unavailable', 'info', 'Route weather unavailable', 'Weather context is unavailable for this route; monitor conditions and verify before launch.', [], 'manual_review_required'));
  }
  return dedupeIssues(issues);
}

function calculateOverallRiskScore(
  legacy: ECS5RouteIntelligenceOutput,
  context: RouteIntelligenceEvaluationContext,
  bailoutSummary: BailoutSummary,
  validUntil: string,
  now: Date,
): number {
  let score = 12;
  if (legacy.closureStatus === 'active_closure' || legacy.legalStatus === 'closed') score = Math.max(score, 95);
  if (legacy.legalStatus === 'restricted' || legacy.legalStatus === 'conflicting') score = Math.max(score, 64);
  if (legacy.legalStatus === 'unknown') score = Math.max(score, 58);
  if (legacy.passabilityStatus === 'impassable') score = Math.max(score, 84);
  if (legacy.passabilityStatus === 'impaired') score = Math.max(score, 54);
  if (legacy.safetyRisk === 'critical') score = Math.max(score, 88);
  if (legacy.safetyRisk === 'caution') score = Math.max(score, 62);
  if (legacy.safetyRisk === 'watch') score = Math.max(score, 38);
  if ((context.weatherFireSmoke ?? []).some((signal) => signal.kind === 'fire' && /perimeter|intersect/i.test(signal.status ?? signal.detail ?? signal.label))) score = Math.max(score, 92);
  if ((context.weatherFireSmoke ?? []).some((signal) => signal.kind === 'smoke' && /hazardous/i.test(signal.status ?? signal.detail ?? ''))) score = Math.max(score, 70);
  if ((context.weatherFireSmoke ?? []).some((signal) => signal.kind === 'weather' && /severe|warning|flood|winter|wind/i.test(signal.status ?? signal.detail ?? ''))) score = Math.max(score, 68);
  if (bailoutSummary.recommendation === 'no_verified_bailout') score += 8;
  if (legacy.dataQuality.missing.length > 0) score += 6;
  if (legacy.dataQuality.stale.length > 0 || Date.parse(validUntil) <= now.getTime()) score += 8;
  return Math.min(100, Math.round(score));
}

function routeRiskLabel(score: number, legacy: ECS5RouteIntelligenceOutput): RouteOverallRiskLabel {
  if (legacy.legalStatus === 'unknown' && score < 35) return 'unknown';
  if (score >= 85) return 'severe';
  if (score >= 65) return 'high';
  if (score >= 35) return 'moderate';
  if (score > 0) return 'low';
  return 'unknown';
}

function resolveOverallRecommendation(input: {
  legacy: ECS5RouteIntelligenceOutput;
  context: RouteIntelligenceEvaluationContext;
  bailoutSummary: BailoutSummary;
  blockingIssues: RouteIntelligenceIssue[];
  warnings: RouteIntelligenceIssue[];
  unknowns: RouteIntelligenceIssue[];
  overallRiskScore: number;
}): RouteOverallRecommendation {
  if (input.legacy.closureStatus === 'active_closure' || input.legacy.legalStatus === 'closed') return 'do_not_travel';
  if (input.blockingIssues.some((item) => item.id === 'fire_perimeter')) return 'reroute';
  if (input.legacy.legalStatus === 'unknown') return 'verify';
  if (input.legacy.legalStatus === 'conflicting') return 'manual_review_required';
  if (input.bailoutSummary.recommendation === 'use_bailout') return 'use_bailout';
  if (input.bailoutSummary.recommendation === 'no_verified_bailout' && input.overallRiskScore >= 65) return 'manual_review_required';
  if (input.warnings.some((item) => item.id === 'smoke_aqi' || item.id === 'severe_weather')) return 'delay';
  if (input.legacy.passabilityStatus === 'impassable' || input.overallRiskScore >= 75) return 'reroute';
  if (input.overallRiskScore >= 35 || input.warnings.length > 0 || input.unknowns.length > 0) return 'proceed_with_caution';
  if (input.legacy.legalStatus === 'legal_open' && input.legacy.closureStatus === 'open') return 'proceed';
  return 'unknown';
}

function buildOfflineReadiness(
  context: RouteIntelligenceEvaluationContext,
  evaluatedAt: string,
  validUntil: string,
  now: Date,
): OfflineReadinessSummary {
  const isStale = Date.parse(validUntil) <= now.getTime();
  return {
    cacheAvailable: context.cachedSummary != null || context.offline === true,
    offlineAvailable: context.offline === true || context.cachedSummary != null,
    evaluatedAt,
    validUntil,
    isStale,
    staleWarning: isStale ? 'Cached/offline route intelligence is stale; refresh before operational use.' : null,
  };
}

function classifyProviderDefinition(
  provider: ProviderDefinition,
  configured: Set<string>,
  missing: Set<string>,
  degraded: Set<string>,
  intentionallyDisabled: Set<string>,
  stale: Set<string>,
): void {
  if (provider.status === 'configured') configured.add(provider.id);
  if (provider.status === 'missing_config') missing.add(provider.id);
  if (provider.status === 'unavailable' || provider.status === 'degraded' || provider.status === 'unknown') degraded.add(provider.id);
  if (provider.status === 'intentionally_disabled') intentionallyDisabled.add(provider.id);
  if (provider.status === 'stale') stale.add(provider.id);
}

function signalToRouteEvidence(signal: ECS5AgencySignal): RouteIntelligenceEvidence {
  return {
    id: signal.id,
    providerId: signal.providerId,
    label: signal.label,
    kind: signal.kind,
    status: signal.status ?? signal.detail ?? null,
    observedAt: signal.observedAt ?? null,
    expiresAt: signal.expiresAt ?? null,
    evidenceUrl: null,
    confidenceLabel: signal.confidence ?? null,
  };
}

function bailoutEvidenceToRouteEvidence(evidence: BailoutEvidenceRef): RouteIntelligenceEvidence {
  return {
    id: evidence.id,
    providerId: evidence.providerId ?? null,
    label: evidence.sourceName ?? evidence.id,
    kind: evidence.recordType ?? evidence.subjectType ?? 'bailout',
    status: evidence.status ?? evidence.detail ?? null,
    observedAt: evidence.observedAt ?? evidence.publishedAt ?? evidence.ingestedAt ?? null,
    expiresAt: evidence.expiresAt ?? null,
    evidenceUrl: evidence.evidenceUrl ?? null,
    confidenceLabel: null,
  };
}

function routeEvidenceToConfidenceSource(evidence: RouteIntelligenceEvidence) {
  return {
    id: evidence.id,
    providerId: evidence.providerId,
    sourceName: evidence.label,
    recordType: evidence.kind ?? undefined,
    status: evidence.status ?? undefined,
    observedAt: evidence.observedAt,
    expiresAt: evidence.expiresAt,
    evidenceUrl: evidence.evidenceUrl,
    knownLimitations: [],
  };
}

function issue(
  id: string,
  severity: RouteIntelligenceIssue['severity'],
  title: string,
  message: string,
  evidenceIds: string[],
  recommendedAction: RouteOverallRecommendation,
): RouteIntelligenceIssue {
  return {
    id,
    severity,
    title,
    message,
    evidenceIds: dedupe(evidenceIds),
    recommendedAction,
  };
}

export function guardRouteIntelligenceCopy(value: string): string {
  let next = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!next) return next;

  next = next.replace(ROUTE_COPY_UNSAFE_PATTERNS[0], 'ECS-Inferred');
  next = next.replace(ROUTE_COPY_UNSAFE_PATTERNS[1], 'needs field verification');
  next = next.replace(ROUTE_COPY_UNSAFE_PATTERNS[2], 'route with available support');
  next = next.replace(
    ROUTE_COPY_UNSAFE_PATTERNS[3],
    'supported by available legal, closure, passability, and suitability evidence',
  );

  return next;
}

function guardRouteIssues(issues: RouteIntelligenceIssue[]): RouteIntelligenceIssue[] {
  return issues.map((item) => ({
    ...item,
    title: guardRouteIntelligenceCopy(item.title),
    message: guardRouteIntelligenceCopy(item.message),
  }));
}

function isActiveClosureSignal(signal: ECS5AgencySignal): boolean {
  return signal.official === true && /closed|closure|order/i.test(signal.status ?? signal.detail ?? '');
}

function dedupeEvidence(values: RouteIntelligenceEvidence[]): RouteIntelligenceEvidence[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value.id || seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

function dedupeIssues(values: RouteIntelligenceIssue[]): RouteIntelligenceIssue[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

function dataSourcesToConfidenceSources(sources: ECS5DataSource[]): ECSConfidenceSourceInput[] {
  return sources
    .filter((source) => source.intentionallyDisabled !== true)
    .map((source) => ({
      id: source.id,
      origin: source.origin === 'official' || source.origin === 'agency' || source.origin === 'weather_provider'
        ? 'live'
        : source.origin === 'manual'
          ? 'manual'
          : 'inferred',
      available: source.enabled === false ? false : source.available !== false,
      required: source.required,
      freshness: source.freshness ?? 'unknown',
      priority: source.kind === 'closure' || source.kind === 'legal_access' ? 'critical' : 'normal',
      agrees: source.agrees,
    }));
}

function signalsToConfidenceSources(
  prefix: string,
  signals: ECS5AgencySignal[],
  required: boolean,
): ECSConfidenceSourceInput[] {
  if (signals.length === 0 && required) {
    return [{
      id: prefix,
      origin: 'inferred',
      available: false,
      required: true,
      freshness: 'unknown',
      priority: 'critical',
    }];
  }
  return signals.map((signal) => ({
    id: `${prefix}:${signal.id}`,
    origin: signal.official || OFFICIAL_ORIGINS.has(signal.providerId) ? 'live' : 'manual',
    available: true,
    required,
    freshness: freshnessFromObservedAt(signal.observedAt),
    priority: signal.kind === 'closure' || signal.kind === 'legal_access' ? 'critical' : 'normal',
    agrees: null,
  }));
}

function missingDisabledProviderInputs(existing: ECS5ProviderHealthInput[]): ECS5ProviderHealthInput[] {
  const seen = new Set(existing.map((provider) => provider.providerId));
  return ECS5_INTENTIONALLY_DISABLED_OPENWEATHER_PROVIDERS.filter((provider) => !seen.has(provider.providerId));
}

function intentionallyDisabledProviderLabel(providerId: ECS5ProviderId): string {
  switch (providerId) {
    case 'openweather_road_risk':
      return 'OpenWeather Road Risk API';
    case 'openweather_air_pollution':
      return 'OpenWeather Air Pollution API';
    case 'openweather_fire_index':
      return 'OpenWeather Fire Weather Index API';
    default:
      return providerId;
  }
}

function freshnessFromObservedAt(value?: string | null): ECSConfidenceFreshness {
  if (!value) return 'unknown';
  const ageMs = Date.now() - Date.parse(value);
  if (!Number.isFinite(ageMs)) return 'unknown';
  if (ageMs <= 2 * 60 * 60 * 1000) return 'fresh';
  if (ageMs <= 24 * 60 * 60 * 1000) return 'aging';
  return 'stale';
}

function isStale(value: string | null | undefined, staleAfterMinutes: number, now: Date): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return true;
  return now.getTime() - parsed > staleAfterMinutes * 60 * 1000;
}

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
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
