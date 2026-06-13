export type WeakPointScoreVersion = 'weak-point-beta-v1' | string;

export type WeakPointMaturityLabel = 'Internal beta / restricted field-test';

export type WeakPointCategory =
  | 'route_confidence'
  | 'fuel_margin'
  | 'water_margin'
  | 'power_margin'
  | 'payload_gvwr'
  | 'camp_endpoint_confidence'
  | 'offline_readiness'
  | 'weather_freshness'
  | 'daylight'
  | 'recovery_bailout_access'
  | 'convoy_state';

export type WeakPointConfidence = 'high' | 'medium' | 'low' | 'unknown' | string;
export type WeakPointFreshness = 'fresh' | 'stale' | 'missing' | 'unknown' | string;
export type WeakPointConditionState = 'normal' | 'known_risky' | 'unknown' | string;

export type WeakPointSnapshotDomain = WeakPointCategory;

export type WeakPointSnapshotCoverageStatus =
  | 'complete'
  | 'partial'
  | 'missing'
  | 'stale'
  | 'unavailable';

export type WeakPointAssessmentCompleteness =
  | 'complete'
  | 'source_limited'
  | 'partial'
  | 'insufficient';

export type WeakPointSourceSystem =
  | 'route_confidence'
  | 'logistics'
  | 'fleet'
  | 'weather'
  | 'offline_honesty'
  | 'campops'
  | 'recovery_bailout'
  | 'daylight'
  | 'convoy'
  | 'readiness_snapshot'
  | 'command_brief_adapter'
  | 'unknown';

export type WeakPointSourceFreshness = 'fresh' | 'stale' | 'expired' | 'unavailable';
export type WeakPointSourceConfidence = 'validated' | 'inferred' | 'unvalidated' | 'unknown';

export type WeakPointSourceFact = {
  id?: string;
  factId?: string;
  sourceSystem?: WeakPointSourceSystem;
  fieldPath?: string;
  label?: string;
  value?: string | number | boolean | null;
  unit?: string;
  source?: string | null;
  observedAt?: string;
  generatedAt?: string;
  expiresAt?: string;
  updatedAt?: string | null;
  freshness?: WeakPointSourceFreshness | WeakPointFreshness | null;
  confidence?: WeakPointSourceConfidence;
  sourceId?: string;
  sourceName?: string;
  schemaVersion?: string;
};

export type WeakPointMissingFact = {
  factId: string;
  domain: WeakPointSnapshotDomain;
  fieldPath: string;
  label: string;
  reason: 'missing' | 'stale' | 'expired' | 'unavailable' | 'not_comparable' | 'unsupported';
  requiredFor: 'likelihood' | 'consequence' | 'uncertainty' | 'data_gap' | 'fix' | 'monitor_signal';
};

export type WeakPointSnapshotDomainCoverage = {
  domain: WeakPointSnapshotDomain;
  status: WeakPointSnapshotCoverageStatus;
  requiredFactIds: string[];
  availableFactIds: string[];
  missingFactIds: string[];
  staleFactIds: string[];
  unavailableFactIds: string[];
  observedAt?: string;
  generatedAt?: string;
  freshness?: WeakPointSourceFreshness;
  reason?: string;
};

export type ExpeditionReadinessSnapshotCoverage = {
  domains: WeakPointSnapshotDomainCoverage[];
  assessmentCompleteness: WeakPointAssessmentCompleteness;
  generatedAt: string;
};

type WeakPointSnapshotSection = {
  sourceFactIds?: readonly string[] | null;
  updatedAt?: string | null;
};

export type ExpeditionReadinessSnapshot = {
  readonly snapshotId: string;
  readonly capturedAt: string;
  readonly routeConfidence?: (WeakPointSnapshotSection & {
    confidence?: WeakPointConfidence | number | null;
    conditionState?: WeakPointConditionState | null;
    knownClosure?: boolean | null;
    passabilityConfidence?: WeakPointConfidence | null;
  }) | null;
  readonly fuelMargin?: (WeakPointSnapshotSection & {
    reserveMiles?: number | null;
    rangeRemainingMiles?: number | null;
    routeDistanceRemainingMiles?: number | null;
    fuelPercent?: number | null;
  }) | null;
  readonly waterMargin?: (WeakPointSnapshotSection & {
    daysRemaining?: number | null;
    requiredDays?: number | null;
    gallonsRemaining?: number | null;
    requiredGallons?: number | null;
  }) | null;
  readonly powerMargin?: (WeakPointSnapshotSection & {
    runtimeHoursRemaining?: number | null;
    requiredRuntimeHours?: number | null;
    batteryPercent?: number | null;
    dataFreshness?: WeakPointFreshness | null;
  }) | null;
  readonly payloadGvwr?: (WeakPointSnapshotSection & {
    gvwrUsagePct?: number | null;
    payloadRemainingLbs?: number | null;
    confidence?: WeakPointConfidence | null;
  }) | null;
  readonly campEndpointConfidence?: (WeakPointSnapshotSection & {
    endpointId?: string | null;
    legalAccessConfidence?: WeakPointConfidence | 'unavailable' | null;
    accessConfidence?: WeakPointConfidence | 'unavailable' | null;
    etaCreatesLateArrivalRisk?: boolean | null;
    confidence?: WeakPointConfidence | null;
  }) | null;
  readonly offlineReadiness?: (WeakPointSnapshotSection & {
    packageStatus?: 'ready' | 'partial' | 'missing' | 'unknown' | string | null;
    routeMatched?: boolean | null;
    coverage?: 'complete' | 'partial' | 'missing' | 'unknown' | string | null;
    freshness?: WeakPointFreshness | null;
  }) | null;
  readonly weatherFreshness?: (WeakPointSnapshotSection & {
    riskLevel?: 'low' | 'moderate' | 'high' | 'critical' | 'unknown' | string | null;
    freshness?: WeakPointFreshness | null;
    severeAlertActive?: boolean | null;
  }) | null;
  readonly daylight?: (WeakPointSnapshotSection & {
    minutesRemainingAtArrival?: number | null;
    arrivalAfterDark?: boolean | null;
  }) | null;
  readonly recoveryBailoutAccess?: (WeakPointSnapshotSection & {
    bailoutRoutesAvailable?: boolean | null;
    routeBailoutOptionCount?: number | null;
    nearestExitMiles?: number | null;
    recoveryAccessConfidence?: WeakPointConfidence | null;
  }) | null;
  readonly convoyState?: (WeakPointSnapshotSection & {
    rosterReady?: boolean | null;
    communicationsReady?: boolean | null;
    membersAccountedFor?: boolean | null;
  }) | null;
  readonly sourceFacts?: readonly WeakPointSourceFact[] | null;
};

export type WeakPointScoreComponents = {
  likelihood: number;
  consequence: number;
  uncertainty: number;
  dataGap: number;
};

export type WeakPointScoreComponentTrace = {
  score: number;
  reason: string;
  sourceFactIds: string[];
  missingFactIds: string[];
};

export type WeakPointTieBreakTrace = {
  likelihood: number;
  consequence: number;
  dataGap: number;
  categoryOrder: number;
};

export type WeakPointScoreTrace = {
  category: WeakPointCategory;
  candidateId: string;
  likelihood: WeakPointScoreComponentTrace;
  consequence: WeakPointScoreComponentTrace;
  uncertainty: WeakPointScoreComponentTrace;
  dataGap: WeakPointScoreComponentTrace;
  weightedScore: number;
  tieBreak: WeakPointTieBreakTrace;
  scoreVersion: string;
};

export type WeakPointAllowedActionType =
  | 'verify'
  | 'refresh_data'
  | 'add_resource_buffer'
  | 'reduce_load'
  | 'confirm_endpoint'
  | 'review_roster'
  | 'monitor'
  | 'inspect_vehicle'
  | 'review_route';

export type WeakPointAllowedAction = {
  actionId: string;
  category: WeakPointCategory;
  actionType: WeakPointAllowedActionType;
  label: string;
  sourceFactIds: string[];
  missingFactIds: string[];
};

export type WeakPointMonitorSignal = {
  signalId: string;
  category: WeakPointCategory;
  label: string;
  sourceFactIds: string[];
  missingFactIds: string[];
  signalType:
    | 'watch_threshold'
    | 'refresh_source'
    | 'confirm_access'
    | 'track_margin'
    | 'watch_weather'
    | 'watch_daylight'
    | 'watch_convoy'
    | 'watch_recovery_access';
};

export type WeakPointCandidate = {
  candidateId: string;
  category: WeakPointCategory;
  label: string;
  rank: number;
  riskScore: number;
  scoreComponents: WeakPointScoreComponents;
  consequenceStatement: string;
  easiestPreDepartureFix: string;
  travelMonitorSignal: string;
  actionId: string;
  monitorSignalId: string;
  sourceFactIds: string[];
  missingFacts: string[];
  missingFactIds: string[];
};

export type WeakPointCandidateInput = {
  category: WeakPointCategory;
  label: string;
  scoreComponents: WeakPointScoreComponents;
  consequenceStatement?: string | null;
  easiestPreDepartureFix?: string | null;
  travelMonitorSignal?: string | null;
  sourceFactIds?: readonly string[] | null;
  missingFacts?: readonly string[] | null;
};

export type WeakPointExplanation = {
  source: 'deterministic_template' | 'validated_ai';
  text: string;
  usedSourceFactIds: string[];
  validationWarnings: string[];
};

export type WeakPointAiDraft = {
  text?: string | null;
  rankedCategoryOrder?: readonly (WeakPointCategory | string)[] | null;
  sourceFactIds?: readonly string[] | null;
  recommendations?: readonly string[] | null;
  referencedCategories?: readonly (WeakPointCategory | string)[] | null;
};

export type WeakPointAssessment = {
  maturityLabel: WeakPointMaturityLabel;
  rankedWeakPoints: WeakPointCandidate[];
  mostFragileAssumption: WeakPointCandidate | null;
  mostSevereConsequence: WeakPointCandidate | null;
  easiestFixBeforeDeparture: WeakPointCandidate | null;
  monitorDuringTravel: WeakPointCandidate | null;
  missingData: string[];
  scoreVersion: WeakPointScoreVersion;
  sourceSnapshotId: string;
  assessmentCompleteness: WeakPointAssessmentCompleteness;
  snapshotCoverage: ExpeditionReadinessSnapshotCoverage;
  sourceFacts: WeakPointSourceFact[];
  missingFacts: WeakPointMissingFact[];
  scoringTrace: WeakPointScoreTrace[];
  allowedActions: WeakPointAllowedAction[];
  monitorSignals: WeakPointMonitorSignal[];
  explanation: WeakPointExplanation;
};

export type WeakPointFeatureFlags = {
  weakPointAnalyzer?: boolean | null;
  expeditionWeakPointAnalyzer?: boolean | null;
};

const DEFAULT_SCORE_VERSION = 'weak-point-beta-v1';
const MATURITY_LABEL: WeakPointMaturityLabel = 'Internal beta / restricted field-test';

const CATEGORY_ORDER: WeakPointCategory[] = [
  'route_confidence',
  'fuel_margin',
  'water_margin',
  'power_margin',
  'payload_gvwr',
  'camp_endpoint_confidence',
  'offline_readiness',
  'weather_freshness',
  'daylight',
  'recovery_bailout_access',
  'convoy_state',
];

const CATEGORY_LABELS: Record<WeakPointCategory, string> = {
  route_confidence: 'route confidence',
  fuel_margin: 'fuel margin',
  water_margin: 'water margin',
  power_margin: 'power margin',
  payload_gvwr: 'payload/GVWR',
  camp_endpoint_confidence: 'camp endpoint confidence',
  offline_readiness: 'offline readiness',
  weather_freshness: 'weather freshness',
  daylight: 'daylight',
  recovery_bailout_access: 'recovery/bailout access',
  convoy_state: 'convoy state',
};

const DEFAULT_FIXES: Record<WeakPointCategory, string> = {
  route_confidence: 'Review the route source, closure layer, and passability notes before committing.',
  fuel_margin: 'Add fuel or reduce route distance until reserve margin is comfortable.',
  water_margin: 'Add water or shorten the plan until onboard water covers the expected duration.',
  power_margin: 'Charge the power system, reduce load, or confirm a charging source before departure.',
  payload_gvwr: 'Remove load or redistribute cargo until payload and GVWR margin improve.',
  camp_endpoint_confidence: 'Confirm camp access confidence or select a validated backup endpoint before departure.',
  offline_readiness: 'Download or refresh the route offline package before leaving coverage.',
  weather_freshness: 'Refresh weather and verify any alert source before departure.',
  daylight: 'Move departure earlier, shorten the route, or pick a closer endpoint with setup daylight.',
  recovery_bailout_access: 'Confirm bailout options and recovery access before entering the exposed section.',
  convoy_state: 'Confirm roster, communications, and check-in accountability before departure.',
};

const DEFAULT_MONITORS: Record<WeakPointCategory, string> = {
  route_confidence: 'Watch route confidence, closure/current-condition updates, and passability changes.',
  fuel_margin: 'Watch fuel percentage, remaining range, and miles to the next reliable fuel point.',
  water_margin: 'Watch water remaining versus party size and expected time out.',
  power_margin: 'Watch battery percentage, runtime estimate, and load changes.',
  payload_gvwr: 'Watch handling, suspension behavior, and any load-shift indicators.',
  camp_endpoint_confidence: 'Watch ETA, daylight, camp access confidence, and backup endpoint viability.',
  offline_readiness: 'Watch offline coverage, route package freshness, and cache availability.',
  weather_freshness: 'Watch weather timestamp, alert status, wind, precipitation, and exposure.',
  daylight: 'Watch ETA versus usable light remaining.',
  recovery_bailout_access: 'Watch distance to bailout points, turnaround options, and recovery access confidence.',
  convoy_state: 'Watch roster accountability, radio checks, and separation intervals.',
};

const CATEGORY_SOURCE_SYSTEMS: Record<WeakPointCategory, WeakPointSourceSystem> = {
  route_confidence: 'route_confidence',
  fuel_margin: 'logistics',
  water_margin: 'logistics',
  power_margin: 'logistics',
  payload_gvwr: 'fleet',
  camp_endpoint_confidence: 'campops',
  offline_readiness: 'offline_honesty',
  weather_freshness: 'weather',
  daylight: 'daylight',
  recovery_bailout_access: 'recovery_bailout',
  convoy_state: 'convoy',
};

const DEFAULT_REQUIRED_FACT_IDS: Record<WeakPointCategory, string[]> = {
  route_confidence: ['route-confidence'],
  fuel_margin: ['fuel-margin'],
  water_margin: ['water-margin'],
  power_margin: ['power-margin'],
  payload_gvwr: ['payload-margin'],
  camp_endpoint_confidence: ['camp-access'],
  offline_readiness: ['offline-package'],
  weather_freshness: ['weather'],
  daylight: ['daylight'],
  recovery_bailout_access: ['recovery'],
  convoy_state: ['convoy'],
};

const ACTION_TYPES: Record<WeakPointCategory, WeakPointAllowedActionType> = {
  route_confidence: 'review_route',
  fuel_margin: 'add_resource_buffer',
  water_margin: 'add_resource_buffer',
  power_margin: 'refresh_data',
  payload_gvwr: 'reduce_load',
  camp_endpoint_confidence: 'confirm_endpoint',
  offline_readiness: 'refresh_data',
  weather_freshness: 'refresh_data',
  daylight: 'verify',
  recovery_bailout_access: 'verify',
  convoy_state: 'review_roster',
};

const MONITOR_SIGNAL_TYPES: Record<WeakPointCategory, WeakPointMonitorSignal['signalType']> = {
  route_confidence: 'watch_threshold',
  fuel_margin: 'track_margin',
  water_margin: 'track_margin',
  power_margin: 'track_margin',
  payload_gvwr: 'watch_threshold',
  camp_endpoint_confidence: 'confirm_access',
  offline_readiness: 'refresh_source',
  weather_freshness: 'watch_weather',
  daylight: 'watch_daylight',
  recovery_bailout_access: 'watch_recovery_access',
  convoy_state: 'watch_convoy',
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value)));
}

function riskScore(components: WeakPointScoreComponents): number {
  const score =
    clampScore(components.likelihood) * 0.40 +
    clampScore(components.consequence) * 0.35 +
    clampScore(components.uncertainty) * 0.15 +
    clampScore(components.dataGap) * 0.10;
  return Number(score.toFixed(2));
}

function uniqueStrings(values: readonly (string | null | undefined)[] | null | undefined): string[] {
  const output: string[] = [];
  values?.forEach((value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed && !output.includes(trimmed)) output.push(trimmed);
  });
  return output;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function missingFactId(category: WeakPointCategory, label: string): string {
  return `${category}:missing:${slug(label)}`;
}

function sectionForCategory(
  snapshot: ExpeditionReadinessSnapshot,
  category: WeakPointCategory,
): WeakPointSnapshotSection | null | undefined {
  switch (category) {
    case 'route_confidence':
      return snapshot.routeConfidence;
    case 'fuel_margin':
      return snapshot.fuelMargin;
    case 'water_margin':
      return snapshot.waterMargin;
    case 'power_margin':
      return snapshot.powerMargin;
    case 'payload_gvwr':
      return snapshot.payloadGvwr;
    case 'camp_endpoint_confidence':
      return snapshot.campEndpointConfidence;
    case 'offline_readiness':
      return snapshot.offlineReadiness;
    case 'weather_freshness':
      return snapshot.weatherFreshness;
    case 'daylight':
      return snapshot.daylight;
    case 'recovery_bailout_access':
      return snapshot.recoveryBailoutAccess;
    case 'convoy_state':
      return snapshot.convoyState;
    default:
      return null;
  }
}

function categoryForSourceFactId(factId: string): WeakPointCategory | null {
  return CATEGORY_ORDER.find((category) => DEFAULT_REQUIRED_FACT_IDS[category].includes(factId)) ?? null;
}

function normalizeFreshness(
  freshness: WeakPointSourceFact['freshness'] | undefined,
  hasTimestamp: boolean,
): WeakPointSourceFreshness {
  const normalized = String(freshness ?? '').toLowerCase();
  if (normalized === 'fresh') return 'fresh';
  if (normalized === 'stale') return 'stale';
  if (normalized === 'expired') return 'expired';
  if (normalized === 'missing' || normalized === 'unknown' || normalized === 'unavailable') return 'unavailable';
  return hasTimestamp ? 'fresh' : 'unavailable';
}

function normalizeSourceFact(
  fact: WeakPointSourceFact,
  fallbackCategory?: WeakPointCategory | null,
  fallbackUpdatedAt?: string | null,
): WeakPointSourceFact | null {
  const factId = (fact.factId ?? fact.id ?? '').trim();
  if (!factId) return null;
  const category = fallbackCategory ?? categoryForSourceFactId(factId);
  const timestamp = fact.observedAt ?? fact.generatedAt ?? fact.updatedAt ?? fallbackUpdatedAt ?? undefined;
  const freshness = normalizeFreshness(fact.freshness, Boolean(timestamp));
  const sourceSystem = fact.sourceSystem ?? (category ? CATEGORY_SOURCE_SYSTEMS[category] : 'unknown');
  return {
    ...fact,
    id: fact.id ?? factId,
    factId,
    sourceSystem,
    fieldPath: fact.fieldPath ?? `${category ?? sourceSystem}.${slug(fact.label ?? factId)}`,
    label: fact.label ?? factId,
    observedAt: fact.observedAt ?? fact.updatedAt ?? undefined,
    generatedAt: fact.generatedAt ?? fallbackUpdatedAt ?? undefined,
    updatedAt: fact.updatedAt ?? fallbackUpdatedAt ?? null,
    freshness,
    confidence: fact.confidence ?? 'inferred',
    sourceName: fact.sourceName ?? fact.source ?? sourceSystem,
    schemaVersion: fact.schemaVersion ?? 'weak-point-source-fact-v1',
  };
}

function normalizeSnapshotSourceFacts(snapshot: ExpeditionReadinessSnapshot): WeakPointSourceFact[] {
  const factsById = new Map<string, WeakPointSourceFact>();
  snapshot.sourceFacts?.forEach((fact) => {
    const normalized = normalizeSourceFact(fact, categoryForSourceFactId(fact.factId ?? fact.id ?? ''));
    if (normalized?.factId) factsById.set(normalized.factId, normalized);
  });

  CATEGORY_ORDER.forEach((category) => {
    const section = sectionForCategory(snapshot, category);
    sectionFactIds(section).forEach((factId) => {
      if (factsById.has(factId)) return;
      const generated = normalizeSourceFact(
        {
          id: factId,
          factId,
          label: CATEGORY_LABELS[category],
          value: null,
          updatedAt: section?.updatedAt ?? snapshot.capturedAt,
          sourceSystem: CATEGORY_SOURCE_SYSTEMS[category],
          fieldPath: `${category}.${slug(factId)}`,
          confidence: 'inferred',
        },
        category,
        section?.updatedAt ?? snapshot.capturedAt,
      );
      if (generated?.factId) factsById.set(generated.factId, generated);
    });
  });

  const ordered: WeakPointSourceFact[] = [];
  CATEGORY_ORDER.forEach((category) => {
    sectionFactIds(sectionForCategory(snapshot, category)).forEach((factId) => {
      const fact = factsById.get(factId);
      if (fact && !ordered.some((existing) => existing.factId === fact.factId)) ordered.push(fact);
    });
  });
  factsById.forEach((fact) => {
    if (!ordered.some((existing) => existing.factId === fact.factId)) ordered.push(fact);
  });
  return ordered;
}

function scoreFromConfidence(value: WeakPointConfidence | number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 80) return 1;
    if (value >= 60) return 2;
    if (value >= 40) return 3;
    if (value > 0) return 4;
    return 5;
  }
  const normalized = String(value ?? 'unknown').toLowerCase();
  if (normalized === 'high') return 1;
  if (normalized === 'medium' || normalized === 'moderate') return 2;
  if (normalized === 'low') return 4;
  return 3;
}

function dataGapForSource(section: WeakPointSnapshotSection | null | undefined, expectedFields: readonly string[]): number {
  if (!section) return 5;
  let missing = 0;
  expectedFields.forEach((field) => {
    if (!(field in section) || (section as Record<string, unknown>)[field] == null) missing += 1;
  });
  if (!section.sourceFactIds || section.sourceFactIds.length === 0) missing += 1;
  if (!section.updatedAt) missing += 1;
  if (missing === 0) return 0;
  if (missing === 1) return 1;
  if (missing === 2) return 3;
  return 4;
}

function missingCandidate(category: WeakPointCategory, missingFacts: string[], consequence = 3): WeakPointCandidateInput {
  const label = CATEGORY_LABELS[category];
  return {
    category,
    label,
    scoreComponents: {
      likelihood: 2,
      consequence,
      uncertainty: 5,
      dataGap: 5,
    },
    consequenceStatement: `${label} is unknown because required readiness inputs are missing; ECS is not inferring that this hazard exists.`,
    easiestPreDepartureFix: `Provide ${label} inputs before relying on this weak-point ranking.`,
    travelMonitorSignal: `Monitor ${label} manually until ECS has comparable source data.`,
    sourceFactIds: [],
    missingFacts,
  };
}

function sectionFactIds(section: WeakPointSnapshotSection | null | undefined): string[] {
  return uniqueStrings(section?.sourceFactIds ?? []);
}

function routeCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const route = snapshot.routeConfidence;
  if (!route) return missingCandidate('route_confidence', ['route confidence input', 'route source timestamp'], 4);
  const confidenceRisk = Math.max(
    scoreFromConfidence(route.confidence),
    scoreFromConfidence(route.passabilityConfidence),
  );
  const knownRisk = route.knownClosure === true || route.conditionState === 'known_risky';
  return {
    category: 'route_confidence',
    label: CATEGORY_LABELS.route_confidence,
    scoreComponents: {
      likelihood: knownRisk ? 5 : confidenceRisk,
      consequence: knownRisk ? 5 : confidenceRisk >= 4 ? 4 : 3,
      uncertainty: knownRisk ? 1 : Math.max(1, confidenceRisk),
      dataGap: dataGapForSource(route, ['confidence']),
    },
    consequenceStatement: knownRisk
      ? 'A source-backed route risk can force a reroute or stop travel on the planned line.'
      : 'Route confidence weakness can turn planned travel time, passability, or access assumptions into unknowns.',
    easiestPreDepartureFix: DEFAULT_FIXES.route_confidence,
    travelMonitorSignal: DEFAULT_MONITORS.route_confidence,
    sourceFactIds: sectionFactIds(route),
    missingFacts: dataGapForSource(route, ['confidence']) >= 3 ? ['route source fact or timestamp'] : [],
  };
}

function numeric(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fuelCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const fuel = snapshot.fuelMargin;
  if (!fuel) return missingCandidate('fuel_margin', ['fuel margin input', 'remaining route distance'], 5);
  const explicitReserve = numeric(fuel.reserveMiles);
  const derivedReserve = numeric(fuel.rangeRemainingMiles) != null && numeric(fuel.routeDistanceRemainingMiles) != null
    ? Number(fuel.rangeRemainingMiles) - Number(fuel.routeDistanceRemainingMiles)
    : null;
  const reserve = explicitReserve ?? derivedReserve;
  const fuelPercent = numeric(fuel.fuelPercent);
  let likelihood = 1;
  if (reserve == null && fuelPercent == null) likelihood = 3;
  else if ((reserve != null && reserve < 10) || (fuelPercent != null && fuelPercent < 15)) likelihood = 5;
  else if ((reserve != null && reserve < 25) || (fuelPercent != null && fuelPercent < 30)) likelihood = 4;
  else if ((reserve != null && reserve < 50) || (fuelPercent != null && fuelPercent < 45)) likelihood = 3;
  return {
    category: 'fuel_margin',
    label: CATEGORY_LABELS.fuel_margin,
    scoreComponents: {
      likelihood,
      consequence: likelihood >= 5 ? 5 : likelihood >= 4 ? 4 : 3,
      uncertainty: reserve == null ? 4 : 1,
      dataGap: dataGapForSource(fuel, ['reserveMiles']),
    },
    consequenceStatement: 'Fuel margin weakness can make the planned route dependent on reaching the next reliable fuel point.',
    easiestPreDepartureFix: DEFAULT_FIXES.fuel_margin,
    travelMonitorSignal: DEFAULT_MONITORS.fuel_margin,
    sourceFactIds: sectionFactIds(fuel),
    missingFacts: reserve == null ? ['fuel reserve miles'] : [],
  };
}

function waterCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const water = snapshot.waterMargin;
  if (!water) return missingCandidate('water_margin', ['water margin input', 'party duration requirement'], 5);
  const daysRemaining = numeric(water.daysRemaining);
  const requiredDays = numeric(water.requiredDays) ?? 1;
  const gallonsRemaining = numeric(water.gallonsRemaining);
  const requiredGallons = numeric(water.requiredGallons);
  const ratio = daysRemaining != null
    ? daysRemaining / Math.max(requiredDays, 0.25)
    : gallonsRemaining != null && requiredGallons != null
      ? gallonsRemaining / Math.max(requiredGallons, 0.25)
      : null;
  let likelihood = 1;
  if (ratio == null) likelihood = 3;
  else if (ratio < 0.75) likelihood = 5;
  else if (ratio < 1) likelihood = 4;
  else if (ratio < 1.5) likelihood = 3;
  return {
    category: 'water_margin',
    label: CATEGORY_LABELS.water_margin,
    scoreComponents: {
      likelihood,
      consequence: likelihood >= 5 ? 5 : likelihood >= 4 ? 4 : 3,
      uncertainty: ratio == null ? 4 : 1,
      dataGap: dataGapForSource(water, ['daysRemaining']),
    },
    consequenceStatement: 'Water margin weakness can make delay, heat, or a longer recovery stop harder to absorb.',
    easiestPreDepartureFix: DEFAULT_FIXES.water_margin,
    travelMonitorSignal: DEFAULT_MONITORS.water_margin,
    sourceFactIds: sectionFactIds(water),
    missingFacts: ratio == null ? ['water remaining versus required water'] : [],
  };
}

function powerCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const power = snapshot.powerMargin;
  if (!power) return missingCandidate('power_margin', ['power margin input', 'required runtime'], 4);
  const runtime = numeric(power.runtimeHoursRemaining);
  const required = numeric(power.requiredRuntimeHours) ?? 1;
  const battery = numeric(power.batteryPercent);
  const ratio = runtime != null ? runtime / Math.max(required, 0.25) : null;
  let likelihood = 1;
  if (ratio == null && battery == null) likelihood = 3;
  else if ((ratio != null && ratio < 0.75) || (battery != null && battery < 20)) likelihood = 5;
  else if ((ratio != null && ratio < 1) || (battery != null && battery < 35)) likelihood = 4;
  else if ((ratio != null && ratio < 1.5) || (battery != null && battery < 50)) likelihood = 3;
  const stale = power.dataFreshness === 'stale' || power.dataFreshness === 'missing';
  return {
    category: 'power_margin',
    label: CATEGORY_LABELS.power_margin,
    scoreComponents: {
      likelihood,
      consequence: likelihood >= 5 ? 4 : 3,
      uncertainty: ratio == null || stale ? 4 : 1,
      dataGap: Math.max(dataGapForSource(power, ['runtimeHoursRemaining']), stale ? 2 : 0),
    },
    consequenceStatement: 'Power margin weakness can degrade navigation, communications, refrigeration, or device charging assumptions.',
    easiestPreDepartureFix: DEFAULT_FIXES.power_margin,
    travelMonitorSignal: DEFAULT_MONITORS.power_margin,
    sourceFactIds: sectionFactIds(power),
    missingFacts: ratio == null ? ['runtime hours remaining'] : [],
  };
}

function payloadCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const payload = snapshot.payloadGvwr;
  if (!payload) return missingCandidate('payload_gvwr', ['payload/GVWR input', 'active loadout weight'], 4);
  const usage = numeric(payload.gvwrUsagePct);
  const remaining = numeric(payload.payloadRemainingLbs);
  let likelihood = 1;
  if (usage == null && remaining == null) likelihood = 3;
  else if ((usage != null && usage >= 98) || (remaining != null && remaining < 50)) likelihood = 5;
  else if ((usage != null && usage >= 90) || (remaining != null && remaining < 200)) likelihood = 4;
  else if ((usage != null && usage >= 85) || (remaining != null && remaining < 400)) likelihood = 3;
  return {
    category: 'payload_gvwr',
    label: CATEGORY_LABELS.payload_gvwr,
    scoreComponents: {
      likelihood,
      consequence: likelihood >= 5 ? 5 : likelihood >= 4 ? 4 : 3,
      uncertainty: Math.max(1, scoreFromConfidence(payload.confidence) - 1),
      dataGap: dataGapForSource(payload, ['gvwrUsagePct']),
    },
    consequenceStatement: 'Payload/GVWR weakness can reduce handling margin and increase load-related vehicle risk.',
    easiestPreDepartureFix: DEFAULT_FIXES.payload_gvwr,
    travelMonitorSignal: DEFAULT_MONITORS.payload_gvwr,
    sourceFactIds: sectionFactIds(payload),
    missingFacts: usage == null && remaining == null ? ['GVWR usage or payload remaining'] : [],
  };
}

function campCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const camp = snapshot.campEndpointConfidence;
  if (!camp) return missingCandidate('camp_endpoint_confidence', ['camp endpoint confidence input', 'camp access source'], 5);
  const legalRisk = scoreFromConfidence(camp.legalAccessConfidence);
  const accessRisk = scoreFromConfidence(camp.accessConfidence ?? camp.confidence);
  const confidenceRisk = Math.max(legalRisk, accessRisk);
  const lateRisk = camp.etaCreatesLateArrivalRisk === true;
  const likelihood = lateRisk && confidenceRisk >= 4 ? 4 : confidenceRisk;
  return {
    category: 'camp_endpoint_confidence',
    label: CATEGORY_LABELS.camp_endpoint_confidence,
    scoreComponents: {
      likelihood,
      consequence: lateRisk ? 4 : confidenceRisk >= 4 ? 3 : 2,
      uncertainty: confidenceRisk >= 4 ? 4 : confidenceRisk,
      dataGap: Math.max(1, dataGapForSource(camp, ['legalAccessConfidence'])),
    },
    consequenceStatement: lateRisk
      ? 'Camp endpoint confidence weakness can create late arrival pressure if the planned endpoint cannot be used.'
      : 'Camp endpoint confidence weakness can make the end-of-day plan depend on unvalidated access assumptions.',
    easiestPreDepartureFix: DEFAULT_FIXES.camp_endpoint_confidence,
    travelMonitorSignal: DEFAULT_MONITORS.camp_endpoint_confidence,
    sourceFactIds: sectionFactIds(camp),
    missingFacts: confidenceRisk >= 3 && camp.legalAccessConfidence == null ? ['camp legal/access confidence'] : [],
  };
}

function offlineCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const offline = snapshot.offlineReadiness;
  if (!offline) return missingCandidate('offline_readiness', ['offline package status', 'route cache coverage'], 4);
  const packageStatus = String(offline.packageStatus ?? 'unknown').toLowerCase();
  const coverage = String(offline.coverage ?? 'unknown').toLowerCase();
  const freshness = String(offline.freshness ?? 'unknown').toLowerCase();
  let likelihood = 1;
  if (packageStatus === 'missing' || coverage === 'missing') likelihood = 5;
  else if (packageStatus === 'partial' || coverage === 'partial' || offline.routeMatched === false) likelihood = 4;
  else if (packageStatus === 'unknown' || coverage === 'unknown') likelihood = 3;
  const dataGap = Math.max(
    dataGapForSource(offline, ['packageStatus', 'coverage']),
    offline.routeMatched === false ? 3 : 0,
    freshness === 'stale' ? 2 : 0,
    freshness === 'missing' || freshness === 'unknown' ? 3 : 0,
  );
  return {
    category: 'offline_readiness',
    label: CATEGORY_LABELS.offline_readiness,
    scoreComponents: {
      likelihood,
      consequence: likelihood >= 5 ? 5 : likelihood >= 4 ? 4 : 3,
      uncertainty: dataGap >= 3 ? 4 : 1,
      dataGap,
    },
    consequenceStatement: 'Offline readiness weakness can leave route, camp, bailout, or weather context unavailable outside coverage.',
    easiestPreDepartureFix: DEFAULT_FIXES.offline_readiness,
    travelMonitorSignal: DEFAULT_MONITORS.offline_readiness,
    sourceFactIds: sectionFactIds(offline),
    missingFacts: dataGap >= 3 ? ['complete route-matched offline package metadata'] : [],
  };
}

function weatherCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const weather = snapshot.weatherFreshness;
  if (!weather) return missingCandidate('weather_freshness', ['weather freshness input', 'weather source timestamp'], 4);
  const risk = String(weather.riskLevel ?? 'unknown').toLowerCase();
  const freshness = String(weather.freshness ?? 'unknown').toLowerCase();
  let likelihood = 1;
  if (weather.severeAlertActive || risk === 'critical') likelihood = 5;
  else if (risk === 'high') likelihood = 4;
  else if (risk === 'moderate') likelihood = 3;
  else if (risk === 'unknown') likelihood = 2;
  return {
    category: 'weather_freshness',
    label: CATEGORY_LABELS.weather_freshness,
    scoreComponents: {
      likelihood,
      consequence: weather.severeAlertActive || risk === 'critical' ? 5 : likelihood >= 4 ? 4 : 3,
      uncertainty: freshness === 'fresh' ? 1 : freshness === 'stale' ? 4 : 5,
      dataGap: Math.max(dataGapForSource(weather, ['riskLevel', 'freshness']), freshness === 'fresh' ? 0 : 3),
    },
    consequenceStatement: 'Weather freshness weakness can make exposure, wind, precipitation, or alert assumptions unreliable.',
    easiestPreDepartureFix: DEFAULT_FIXES.weather_freshness,
    travelMonitorSignal: DEFAULT_MONITORS.weather_freshness,
    sourceFactIds: sectionFactIds(weather),
    missingFacts: freshness !== 'fresh' ? ['fresh weather source'] : [],
  };
}

function daylightCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const daylight = snapshot.daylight;
  if (!daylight) return missingCandidate('daylight', ['daylight arrival margin', 'usable light window'], 4);
  const minutes = numeric(daylight.minutesRemainingAtArrival);
  let likelihood = 1;
  if (daylight.arrivalAfterDark === true || (minutes != null && minutes < 0)) likelihood = 5;
  else if (minutes != null && minutes < 30) likelihood = 4;
  else if (minutes != null && minutes < 60) likelihood = 3;
  else if (minutes == null) likelihood = 2;
  return {
    category: 'daylight',
    label: CATEGORY_LABELS.daylight,
    scoreComponents: {
      likelihood,
      consequence: likelihood >= 5 ? 5 : likelihood >= 4 ? 4 : 3,
      uncertainty: minutes == null ? 4 : 1,
      dataGap: dataGapForSource(daylight, ['minutesRemainingAtArrival']),
    },
    consequenceStatement: 'Daylight weakness can turn setup, camp validation, or recovery actions into low-light work.',
    easiestPreDepartureFix: DEFAULT_FIXES.daylight,
    travelMonitorSignal: DEFAULT_MONITORS.daylight,
    sourceFactIds: sectionFactIds(daylight),
    missingFacts: minutes == null ? ['arrival daylight margin'] : [],
  };
}

function recoveryCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const recovery = snapshot.recoveryBailoutAccess;
  if (!recovery) return missingCandidate('recovery_bailout_access', ['bailout access input', 'recovery confidence'], 5);
  const options = numeric(recovery.routeBailoutOptionCount);
  const nearestExit = numeric(recovery.nearestExitMiles);
  let likelihood = 1;
  if (recovery.bailoutRoutesAvailable === false || options === 0 || (nearestExit != null && nearestExit > 20)) likelihood = 5;
  else if ((options != null && options < 2) || (nearestExit != null && nearestExit > 12)) likelihood = 4;
  else if ((options != null && options < 3) || (nearestExit != null && nearestExit > 8)) likelihood = 3;
  return {
    category: 'recovery_bailout_access',
    label: CATEGORY_LABELS.recovery_bailout_access,
    scoreComponents: {
      likelihood,
      consequence: likelihood >= 5 ? 5 : likelihood >= 4 ? 4 : 3,
      uncertainty: Math.max(1, scoreFromConfidence(recovery.recoveryAccessConfidence) - 1),
      dataGap: dataGapForSource(recovery, ['bailoutRoutesAvailable', 'routeBailoutOptionCount']),
    },
    consequenceStatement: 'Recovery/bailout weakness can make a disabled vehicle or route interruption harder to exit cleanly.',
    easiestPreDepartureFix: DEFAULT_FIXES.recovery_bailout_access,
    travelMonitorSignal: DEFAULT_MONITORS.recovery_bailout_access,
    sourceFactIds: sectionFactIds(recovery),
    missingFacts: recovery.bailoutRoutesAvailable == null ? ['bailout route availability'] : [],
  };
}

function convoyCandidate(snapshot: ExpeditionReadinessSnapshot): WeakPointCandidateInput {
  const convoy = snapshot.convoyState;
  if (!convoy) return missingCandidate('convoy_state', ['convoy roster state', 'convoy communications state'], 3);
  const notReady = [convoy.rosterReady, convoy.communicationsReady, convoy.membersAccountedFor]
    .filter((value) => value === false).length;
  const unknown = [convoy.rosterReady, convoy.communicationsReady, convoy.membersAccountedFor]
    .filter((value) => value == null).length;
  return {
    category: 'convoy_state',
    label: CATEGORY_LABELS.convoy_state,
    scoreComponents: {
      likelihood: notReady >= 2 ? 4 : notReady === 1 ? 3 : 1,
      consequence: notReady > 0 ? 4 : 2,
      uncertainty: notReady >= 2 || unknown > 0 ? 4 : 1,
      dataGap: Math.max(dataGapForSource(convoy, ['rosterReady', 'communicationsReady']), unknown >= 2 ? 4 : unknown > 0 ? 2 : 0),
    },
    consequenceStatement: 'Convoy-state weakness can turn separation, check-ins, or accountability into the first operational failure.',
    easiestPreDepartureFix: DEFAULT_FIXES.convoy_state,
    travelMonitorSignal: DEFAULT_MONITORS.convoy_state,
    sourceFactIds: sectionFactIds(convoy),
    missingFacts: unknown > 0 ? ['complete convoy roster and communications state'] : [],
  };
}

function normalizeCandidate(input: WeakPointCandidateInput): WeakPointCandidate {
  const components = {
    likelihood: clampScore(input.scoreComponents.likelihood),
    consequence: clampScore(input.scoreComponents.consequence),
    uncertainty: clampScore(input.scoreComponents.uncertainty),
    dataGap: clampScore(input.scoreComponents.dataGap),
  };
  const missingFacts = uniqueStrings(input.missingFacts ?? []);
  return {
    candidateId: `weak-point:${input.category}`,
    category: input.category,
    label: input.label || CATEGORY_LABELS[input.category],
    rank: 0,
    riskScore: riskScore(components),
    scoreComponents: components,
    consequenceStatement: input.consequenceStatement || `${CATEGORY_LABELS[input.category]} is the weak-point candidate.`,
    easiestPreDepartureFix: input.easiestPreDepartureFix || DEFAULT_FIXES[input.category],
    travelMonitorSignal: input.travelMonitorSignal || DEFAULT_MONITORS[input.category],
    actionId: `weak-point-action:${input.category}`,
    monitorSignalId: `weak-point-monitor:${input.category}`,
    sourceFactIds: uniqueStrings(input.sourceFactIds ?? []),
    missingFacts,
    missingFactIds: missingFacts.map((fact) => missingFactId(input.category, fact)),
  };
}

export function rankWeakPointCandidates(candidates: readonly WeakPointCandidateInput[]): WeakPointCandidate[] {
  return candidates
    .map(normalizeCandidate)
    .sort((left, right) => (
      right.riskScore - left.riskScore ||
      right.scoreComponents.likelihood - left.scoreComponents.likelihood ||
      right.scoreComponents.consequence - left.scoreComponents.consequence ||
      right.scoreComponents.dataGap - left.scoreComponents.dataGap ||
      CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category) ||
      left.label.localeCompare(right.label)
    ))
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));
}

function easiestFix(candidates: readonly WeakPointCandidate[]): WeakPointCandidate | null {
  const actionable = candidates.filter((candidate) => candidate.scoreComponents.dataGap < 5);
  return actionable[0] ?? candidates[0] ?? null;
}

function severeConsequence(candidates: readonly WeakPointCandidate[]): WeakPointCandidate | null {
  return candidates
    .slice()
    .sort((left, right) => (
      right.scoreComponents.consequence - left.scoreComponents.consequence ||
      right.riskScore - left.riskScore ||
      CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category)
    ))[0] ?? null;
}

function buildMissingFacts(candidates: readonly WeakPointCandidate[]): WeakPointMissingFact[] {
  const facts = new Map<string, WeakPointMissingFact>();
  candidates.forEach((candidate) => {
    candidate.missingFacts.forEach((label) => {
      const factId = missingFactId(candidate.category, label);
      if (facts.has(factId)) return;
      facts.set(factId, {
        factId,
        domain: candidate.category,
        fieldPath: `${candidate.category}.${slug(label)}`,
        label,
        reason: 'missing',
        requiredFor: 'data_gap',
      });
    });
  });
  return Array.from(facts.values());
}

function buildSnapshotCoverage(
  snapshot: ExpeditionReadinessSnapshot,
  sourceFacts: readonly WeakPointSourceFact[],
  candidates: readonly WeakPointCandidate[],
): ExpeditionReadinessSnapshotCoverage {
  const factsById = new Map<string, WeakPointSourceFact>();
  sourceFacts.forEach((fact) => {
    const factId = fact.factId ?? fact.id;
    if (factId) factsById.set(factId, fact);
  });
  const missingIdsByCategory = new Map<WeakPointCategory, string[]>();
  candidates.forEach((candidate) => {
    missingIdsByCategory.set(candidate.category, candidate.missingFactIds);
  });

  const domains = CATEGORY_ORDER.map((category): WeakPointSnapshotDomainCoverage => {
    const section = sectionForCategory(snapshot, category);
    const requiredFactIds = sectionFactIds(section).length > 0
      ? sectionFactIds(section)
      : DEFAULT_REQUIRED_FACT_IDS[category];
    const availableFactIds: string[] = [];
    const staleFactIds: string[] = [];
    const unavailableFactIds: string[] = [];
    requiredFactIds.forEach((factId) => {
      const fact = factsById.get(factId);
      const freshness = fact?.freshness;
      if (!fact || freshness === 'unavailable') unavailableFactIds.push(factId);
      else if (freshness === 'stale' || freshness === 'expired') staleFactIds.push(factId);
      else availableFactIds.push(factId);
    });
    const missingFactIds = section
      ? uniqueStrings([...(missingIdsByCategory.get(category) ?? [])])
      : uniqueStrings([
        ...(missingIdsByCategory.get(category) ?? []),
        ...requiredFactIds.map((factId) => missingFactId(category, factId)),
      ]);
    let status: WeakPointSnapshotCoverageStatus = 'complete';
    if (!section) status = 'missing';
    else if (unavailableFactIds.length === requiredFactIds.length) status = 'unavailable';
    else if (unavailableFactIds.length > 0 || missingFactIds.length > 0) status = 'partial';
    else if (staleFactIds.length > 0) status = 'stale';

    const firstFact = requiredFactIds.map((factId) => factsById.get(factId)).find(Boolean);
    const firstFreshness = firstFact?.freshness;
    const coverageFreshness: WeakPointSourceFreshness | undefined =
      firstFreshness === 'fresh' || firstFreshness === 'stale' || firstFreshness === 'expired' || firstFreshness === 'unavailable'
        ? firstFreshness
        : undefined;
    return {
      domain: category,
      status,
      requiredFactIds,
      availableFactIds,
      missingFactIds,
      staleFactIds,
      unavailableFactIds,
      observedAt: firstFact?.observedAt ?? section?.updatedAt ?? undefined,
      generatedAt: firstFact?.generatedAt ?? section?.updatedAt ?? snapshot.capturedAt,
      freshness: coverageFreshness,
      reason: status === 'complete'
        ? undefined
        : `${CATEGORY_LABELS[category]} source coverage is ${status}.`,
    };
  });

  const incompleteCount = domains.filter((domain) => domain.status !== 'complete').length;
  const missingOrUnavailableCount = domains.filter((domain) => (
    domain.status === 'missing' || domain.status === 'unavailable'
  )).length;
  const assessmentCompleteness: WeakPointAssessmentCompleteness =
    incompleteCount === 0
      ? 'complete'
      : missingOrUnavailableCount >= 6
        ? 'insufficient'
        : domains.some((domain) => domain.status === 'partial' || domain.status === 'missing' || domain.status === 'unavailable')
          ? 'partial'
          : 'source_limited';

  return {
    domains,
    assessmentCompleteness,
    generatedAt: snapshot.capturedAt,
  };
}

function scoreComponentTrace(
  candidate: WeakPointCandidate,
  component: keyof WeakPointScoreComponents,
): WeakPointScoreComponentTrace {
  const score = candidate.scoreComponents[component];
  const sourceFactIds = component === 'dataGap'
    ? candidate.sourceFactIds
    : candidate.sourceFactIds;
  const missingFactIds = component === 'dataGap' || score >= 4
    ? candidate.missingFactIds
    : [];
  return {
    score,
    reason: `${candidate.label} ${component} scored ${score} by deterministic ${DEFAULT_SCORE_VERSION} thresholds.`,
    sourceFactIds,
    missingFactIds,
  };
}

function buildScoringTrace(
  candidates: readonly WeakPointCandidate[],
  scoreVersion: WeakPointScoreVersion,
): WeakPointScoreTrace[] {
  return candidates.map((candidate) => ({
    category: candidate.category,
    candidateId: candidate.candidateId,
    likelihood: scoreComponentTrace(candidate, 'likelihood'),
    consequence: scoreComponentTrace(candidate, 'consequence'),
    uncertainty: scoreComponentTrace(candidate, 'uncertainty'),
    dataGap: scoreComponentTrace(candidate, 'dataGap'),
    weightedScore: riskScore(candidate.scoreComponents),
    tieBreak: {
      likelihood: candidate.scoreComponents.likelihood,
      consequence: candidate.scoreComponents.consequence,
      dataGap: candidate.scoreComponents.dataGap,
      categoryOrder: CATEGORY_ORDER.indexOf(candidate.category),
    },
    scoreVersion,
  }));
}

function buildAllowedActions(candidates: readonly WeakPointCandidate[]): WeakPointAllowedAction[] {
  return candidates.map((candidate) => ({
    actionId: candidate.actionId,
    category: candidate.category,
    actionType: ACTION_TYPES[candidate.category],
    label: candidate.easiestPreDepartureFix,
    sourceFactIds: candidate.sourceFactIds,
    missingFactIds: candidate.missingFactIds,
  }));
}

function buildMonitorSignals(candidates: readonly WeakPointCandidate[]): WeakPointMonitorSignal[] {
  return candidates.map((candidate) => ({
    signalId: candidate.monitorSignalId,
    category: candidate.category,
    label: candidate.travelMonitorSignal,
    sourceFactIds: candidate.sourceFactIds,
    missingFactIds: candidate.missingFactIds,
    signalType: MONITOR_SIGNAL_TYPES[candidate.category],
  }));
}

type WeakPointExplanationAssessment = Pick<WeakPointAssessment, 'rankedWeakPoints' | 'missingData'> &
  Partial<Pick<
    WeakPointAssessment,
    'sourceFacts' | 'missingFacts' | 'scoringTrace' | 'allowedActions' | 'monitorSignals'
  >>;

function deterministicExplanation(assessment: WeakPointExplanationAssessment): WeakPointExplanation {
  const primary = assessment.rankedWeakPoints[0];
  if (!primary) {
    return {
      source: 'deterministic_template',
      text: 'Primary weak point: unavailable. ECS does not have enough snapshot data to rank assumptions.',
      usedSourceFactIds: [],
      validationWarnings: [],
    };
  }
  const missing = assessment.missingData.length
    ? ` Missing data: ${assessment.missingData.slice(0, 3).join(', ')}.`
    : '';
  return {
    source: 'deterministic_template',
    text: `Primary weak point: ${primary.label}. ${primary.consequenceStatement} Easiest fix before departure: ${primary.easiestPreDepartureFix}${missing}`,
    usedSourceFactIds: primary.sourceFactIds,
    validationWarnings: [],
  };
}

function sameOrder(left: readonly (string | null | undefined)[] | null | undefined, right: readonly string[]): boolean {
  if (!left || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function buildWeakPointAiExplanationPayload(assessment: WeakPointExplanationAssessment) {
  const sourceFacts = assessment.sourceFacts ?? [];
  const allowedActions = assessment.allowedActions ?? buildAllowedActions(assessment.rankedWeakPoints);
  const monitorSignals = assessment.monitorSignals ?? buildMonitorSignals(assessment.rankedWeakPoints);
  return {
    rankedCandidates: assessment.rankedWeakPoints.map((candidate) => ({
      candidateId: candidate.candidateId,
      rank: candidate.rank,
      category: candidate.category,
      label: candidate.label,
      riskScore: candidate.riskScore,
      scoreComponents: candidate.scoreComponents,
      consequenceStatement: candidate.consequenceStatement,
      missingFacts: candidate.missingFacts,
      missingFactIds: candidate.missingFactIds,
      sourceFactIds: candidate.sourceFactIds,
      actionId: candidate.actionId,
      monitorSignalId: candidate.monitorSignalId,
    })),
    allowedActions,
    sourceFactIds: uniqueStrings([
      ...assessment.rankedWeakPoints.flatMap((candidate) => candidate.sourceFactIds),
      ...sourceFacts.map((fact) => fact.factId ?? fact.id),
    ]),
    sourceFacts,
    missingFacts: assessment.missingFacts ?? buildMissingFacts(assessment.rankedWeakPoints),
    scoringTrace: assessment.scoringTrace ?? buildScoringTrace(assessment.rankedWeakPoints, DEFAULT_SCORE_VERSION),
    monitorSignals,
  };
}

export function buildWeakPointExplanation(
  assessment: WeakPointExplanationAssessment,
  aiDraft?: WeakPointAiDraft | null,
): WeakPointExplanation {
  if (!aiDraft) return deterministicExplanation(assessment);
  const payload = buildWeakPointAiExplanationPayload(assessment);
  const expectedOrder = assessment.rankedWeakPoints.map((candidate) => candidate.category);
  const allowedCategories = new Set(expectedOrder);
  const allowedSources = new Set(payload.sourceFactIds);
  const allowedActions = new Set([
    ...payload.allowedActions.map((action) => action.actionId),
    ...payload.allowedActions.map((action) => action.label),
    ...assessment.rankedWeakPoints.map((candidate) => candidate.easiestPreDepartureFix),
  ]);
  const warnings: string[] = [];
  const draftText = aiDraft.text?.trim() ?? '';

  if (!draftText) warnings.push('AI explanation text is empty.');
  if (!sameOrder(aiDraft.rankedCategoryOrder, expectedOrder)) warnings.push('AI explanation attempted to change the deterministic ranking order.');
  uniqueStrings(aiDraft.sourceFactIds ?? []).forEach((sourceFactId) => {
    if (!allowedSources.has(sourceFactId)) warnings.push(`AI explanation referenced unsupported source fact ${sourceFactId}.`);
  });
  uniqueStrings(aiDraft.recommendations ?? []).forEach((recommendation) => {
    if (!allowedActions.has(recommendation)) warnings.push(`AI explanation recommended unsupported action: ${recommendation}`);
  });
  uniqueStrings((aiDraft.referencedCategories ?? []) as readonly string[]).forEach((category) => {
    if (!allowedCategories.has(category as WeakPointCategory)) warnings.push(`AI explanation referenced unsupported category ${category}.`);
  });
  if (/\b(go\/no-go|no-go|departure blocked|do not depart|trip is unsafe|route rejected)\b/i.test(draftText)) {
    warnings.push('AI explanation attempted to create a go/no-go or blocking readiness posture.');
  }
  if (/\bno missing data\b|\bmissing data remains\b|\bno missing inputs\b/i.test(draftText)) {
    warnings.push('AI explanation attempted to hide or override missing-data status.');
  }
  if (
    payload.missingFacts.length > 0 &&
    uniqueStrings(aiDraft.sourceFactIds ?? []).length === 0 &&
    /\b(low|empty|failed|unsafe|blocked|closed|confirmed hazard|hazard confirmed)\b/i.test(draftText)
  ) {
    warnings.push('AI explanation inferred a confirmed hazard from missing data.');
  }

  if (warnings.length > 0) {
    const fallback = deterministicExplanation(assessment);
    return {
      ...fallback,
      validationWarnings: warnings,
    };
  }

  return {
    source: 'validated_ai',
    text: draftText,
    usedSourceFactIds: uniqueStrings(aiDraft.sourceFactIds ?? []),
    validationWarnings: [],
  };
}

export function scoreExpeditionWeakPoints(
  snapshot: ExpeditionReadinessSnapshot,
  scoringPolicyVersion: WeakPointScoreVersion = DEFAULT_SCORE_VERSION,
): WeakPointAssessment {
  const rankedWeakPoints = rankWeakPointCandidates([
    routeCandidate(snapshot),
    fuelCandidate(snapshot),
    waterCandidate(snapshot),
    powerCandidate(snapshot),
    payloadCandidate(snapshot),
    campCandidate(snapshot),
    offlineCandidate(snapshot),
    weatherCandidate(snapshot),
    daylightCandidate(snapshot),
    recoveryCandidate(snapshot),
    convoyCandidate(snapshot),
  ]);
  const missingData = uniqueStrings(rankedWeakPoints.flatMap((candidate) => candidate.missingFacts));
  const sourceFacts = normalizeSnapshotSourceFacts(snapshot);
  const missingFacts = buildMissingFacts(rankedWeakPoints);
  const snapshotCoverage = buildSnapshotCoverage(snapshot, sourceFacts, rankedWeakPoints);
  const scoringTrace = buildScoringTrace(rankedWeakPoints, scoringPolicyVersion);
  const allowedActions = buildAllowedActions(rankedWeakPoints);
  const monitorSignals = buildMonitorSignals(rankedWeakPoints);
  const partialAssessment: Omit<WeakPointAssessment, 'explanation'> = {
    maturityLabel: MATURITY_LABEL,
    rankedWeakPoints,
    mostFragileAssumption: rankedWeakPoints[0] ?? null,
    mostSevereConsequence: severeConsequence(rankedWeakPoints),
    easiestFixBeforeDeparture: easiestFix(rankedWeakPoints),
    monitorDuringTravel: rankedWeakPoints[0] ?? null,
    missingData,
    scoreVersion: scoringPolicyVersion,
    sourceSnapshotId: snapshot.snapshotId,
    assessmentCompleteness: snapshotCoverage.assessmentCompleteness,
    snapshotCoverage,
    sourceFacts,
    missingFacts,
    scoringTrace,
    allowedActions,
    monitorSignals,
  };
  return {
    ...partialAssessment,
    explanation: buildWeakPointExplanation(partialAssessment),
  };
}

function envFlagEnabled(key: string): boolean {
  const value = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  return value === '1' || value === 'true' || value === 'TRUE';
}

export function isWeakPointAnalyzerFeatureEnabled(flags?: WeakPointFeatureFlags | null): boolean {
  if (typeof flags?.weakPointAnalyzer === 'boolean') return flags.weakPointAnalyzer;
  if (typeof flags?.expeditionWeakPointAnalyzer === 'boolean') return flags.expeditionWeakPointAnalyzer;
  const globalFlag = (globalThis as { __ECS_WEAK_POINT_ANALYZER__?: unknown }).__ECS_WEAK_POINT_ANALYZER__;
  if (globalFlag != null) return globalFlag === true || globalFlag === '1' || globalFlag === 'true';
  return envFlagEnabled('EXPO_PUBLIC_ECS_WEAK_POINT_ANALYZER') || envFlagEnabled('ECS_WEAK_POINT_ANALYZER');
}
