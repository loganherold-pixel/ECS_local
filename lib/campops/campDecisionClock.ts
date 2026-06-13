import type {
  CampCandidate,
  CampOpsConfidence,
  CampOpsDataSource,
  CampRecommendationSet,
} from './campOpsTypes';

export type CampDecisionClockState = 'continue' | 'divert_now' | 'emergency_only' | 'unavailable';
export type CampDecisionClockReadiness = 'feature_flagged';
export type CampDecisionClockRouteDifficulty = 'easy' | 'moderate' | 'hard' | 'unknown';
export type CampDecisionClockWeatherRisk = 'clear' | 'adverse' | 'severe' | 'unknown';
export type CampDecisionClockLegalAccessConfidence = 'validated' | 'uncertain' | 'unavailable';
export type CampDecisionClockDataFreshness = 'fresh' | 'stale' | 'unavailable';
export type CampDecisionClockMarginStatus = 'comfortable' | 'tight' | 'critical' | 'unknown';
export type CampDecisionClockTraceSeverity = 'info' | 'warning' | 'critical';
export type CampDecisionClockTraceConfidence = 'validated' | 'uncertain' | 'unavailable';
export type CampDecisionClockDecisionTraceFactor =
  | 'planned_camp_arrival'
  | 'backup_endpoint_viability'
  | 'emergency_endpoint_viability'
  | 'usable_light'
  | 'setup_buffer'
  | 'delay_scenario'
  | 'route_difficulty'
  | 'weather_risk'
  | 'fuel_margin'
  | 'water_margin'
  | 'power_margin'
  | 'camp_confidence'
  | 'legal_access_confidence'
  | 'data_freshness'
  | 'provider_validation'
  | 'input_validation';

export type CampDecisionClockDecisionTraceItem = {
  factor: CampDecisionClockDecisionTraceFactor;
  severity: CampDecisionClockTraceSeverity;
  confidence: CampDecisionClockTraceConfidence;
  reason: string;
  deadline?: string;
  sourceUpdatedAt?: string;
};

export type CampDecisionClockWinningConstraint = {
  factor: CampDecisionClockDecisionTraceFactor;
  severity: CampDecisionClockTraceSeverity;
  confidence: CampDecisionClockTraceConfidence;
  reason: string;
  deadline?: string;
};

export type CampDecisionClockFeatureFlags = {
  campDecisionClock?: boolean | null;
  campDecisionClockFeatureEnabled?: boolean | null;
  ecsCampDecisionClock?: boolean | null;
};

export type RouteProgress = {
  driveTimeRemainingMinutes?: number | null;
  distanceRemainingMiles?: number | null;
  routeMileMarker?: number | null;
  source?: CampOpsDataSource | 'live' | 'cached' | 'manual' | 'mock' | 'unknown' | string | null;
  confidence?: CampOpsConfidence | 'unknown' | null;
  updatedAt?: string | null;
  isStale?: boolean | null;
};

export type EtaEstimate = {
  plannedArrivalAt?: string | null;
  latestSafeArrivalAt?: string | null;
  travelTimeRemainingMinutes?: number | null;
  source?: CampOpsDataSource | 'live' | 'cached' | 'manual' | 'mock' | 'unknown' | string | null;
  confidence?: CampOpsConfidence | 'unknown' | null;
  updatedAt?: string | null;
  isStale?: boolean | null;
};

export type DelayScenario =
  | 'no_delay'
  | 'delay_30m'
  | 'delay_1h'
  | 'delay_2h'
  | {
      kind: 'custom';
      minutes: number;
      label?: string | null;
    };

export type Margin = {
  status: CampDecisionClockMarginStatus;
  value?: number | null;
  unit?: 'miles' | 'gallons' | 'percent' | 'hours' | 'unknown' | string | null;
  confidence?: CampOpsConfidence | 'unknown' | null;
  source?: CampOpsDataSource | 'live' | 'cached' | 'manual' | 'mock' | 'unknown' | string | null;
  updatedAt?: string | null;
  isStale?: boolean | null;
  continueWindowMinutes?: number | null;
  notes?: string | null;
};

export type CampDecisionClockEndpointSource = {
  kind?: CampOpsDataSource | 'provider' | 'validated_provider' | 'safe_endpoint' | 'manual' | 'cached' | string | null;
  providerId?: string | null;
  validated?: boolean | null;
  updatedAt?: string | null;
  isStale?: boolean | null;
};

export type SafeEndpoint = {
  id: string;
  name?: string | null;
  latestDivertAt?: string | null;
  viableUntil?: string | null;
  latestArrivalAt?: string | null;
  travelTimeMinutes?: number | null;
  status?: 'viable' | 'limited' | 'unavailable' | 'closed' | 'unknown' | string | null;
  source?: CampDecisionClockEndpointSource | null;
  dataFreshness?: CampDecisionClockDataFreshness | null;
  legalAccessConfidence?: CampDecisionClockLegalAccessConfidence | null;
  confidence?: CampOpsConfidence | 'unknown' | null;
  warnings?: string[] | null;
};

export type CampDecisionClockCampCandidate = CampCandidate & {
  latestSafeArrivalAt?: string | null;
  dataFreshness?: CampDecisionClockDataFreshness | null;
  updatedAt?: string | null;
  isStale?: boolean | null;
};

export type CampDecisionClockInput = {
  currentTime?: string | null;
  routeProgress: RouteProgress;
  eta: EtaEstimate;
  delayScenario: DelayScenario;
  daylightWindow: { sunsetAt: string; usableLightEndsAt: string };
  plannedCamp: CampDecisionClockCampCandidate;
  backupEndpoint?: SafeEndpoint | null;
  emergencyEndpoint?: SafeEndpoint | null;
  margins: { fuel: Margin; water: Margin; power: Margin };
  routeDifficulty: CampDecisionClockRouteDifficulty;
  weatherRisk: CampDecisionClockWeatherRisk;
  legalAccessConfidence: CampDecisionClockLegalAccessConfidence;
  dataFreshness: CampDecisionClockDataFreshness;
  setupBufferMinutes?: number | null;
};

export type CampDecisionClockDecision = {
  state: CampDecisionClockState;
  continueUntil?: string;
  backupEndpointId?: string;
  emergencyViableUntil?: string;
  mainRisk: string;
  warnings: string[];
  readiness: CampDecisionClockReadiness;
  decisionTrace: CampDecisionClockDecisionTraceItem[];
  winningConstraint?: CampDecisionClockWinningConstraint;
};

type MarginKey = 'fuel' | 'water' | 'power';

type DeadlineCandidate = {
  at: string;
  reason: string;
  factor: CampDecisionClockDecisionTraceFactor;
  severity?: CampDecisionClockTraceSeverity;
  confidence?: CampDecisionClockTraceConfidence;
};

type EndpointValidation = {
  endpoint: SafeEndpoint | null;
  expired: boolean;
  rejected: boolean;
};

type InputValidationResult = {
  nowIso: string;
  nowMs: number | null;
  hasCriticalTimingError: boolean;
  reason: string;
};

const DELAY_PRESETS: Record<Exclude<DelayScenario, { kind: 'custom'; minutes: number; label?: string | null }>, number> = {
  no_delay: 0,
  delay_30m: 30,
  delay_1h: 60,
  delay_2h: 120,
};

const DEFAULT_SETUP_BUFFER_MINUTES = 30;

const TRACE_FACTORS: CampDecisionClockDecisionTraceFactor[] = [
  'planned_camp_arrival',
  'backup_endpoint_viability',
  'emergency_endpoint_viability',
  'usable_light',
  'setup_buffer',
  'delay_scenario',
  'route_difficulty',
  'weather_risk',
  'fuel_margin',
  'water_margin',
  'power_margin',
  'camp_confidence',
  'legal_access_confidence',
  'data_freshness',
  'provider_validation',
  'input_validation',
];

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoFromMs(value: number): string {
  return new Date(value).toISOString();
}

function subtractMinutes(iso: string | null | undefined, minutes: number): string | null {
  const parsed = parseIso(iso);
  if (parsed == null) return null;
  return isoFromMs(parsed - Math.max(0, minutes) * 60_000);
}

function minutesBetween(startIso: string | null | undefined, endIso: string | null | undefined): number | null {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (start == null || end == null) return null;
  return Math.max(0, Math.round((end - start) / 60_000));
}

function envFlagEnabled(key: string): boolean {
  const value = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  return value === '1' || value === 'true' || value === 'TRUE';
}

function flagEnabled(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === '1' || value === 'true' || value === 'TRUE' || value === 'enabled' || value === 'on') return true;
  if (value === '0' || value === 'false' || value === 'FALSE' || value === 'disabled' || value === 'off') return false;
  return null;
}

export function isCampDecisionClockFeatureEnabled(flags?: CampDecisionClockFeatureFlags | null): boolean {
  const explicit =
    flagEnabled(flags?.campDecisionClock) ??
    flagEnabled(flags?.campDecisionClockFeatureEnabled) ??
    flagEnabled(flags?.ecsCampDecisionClock);
  if (explicit != null) return explicit;
  const globalFlag = (globalThis as { __ECS_CAMP_DECISION_CLOCK__?: unknown }).__ECS_CAMP_DECISION_CLOCK__;
  const globalEnabled = flagEnabled(globalFlag);
  if (globalEnabled != null) return globalEnabled;
  return envFlagEnabled('EXPO_PUBLIC_ECS_CAMP_DECISION_CLOCK') || envFlagEnabled('ECS_CAMP_DECISION_CLOCK');
}

function earlierDeadline(a: DeadlineCandidate | null, b: DeadlineCandidate): DeadlineCandidate {
  if (!a) return b;
  const aMs = parseIso(a.at);
  const bMs = parseIso(b.at);
  if (aMs == null) return b;
  if (bMs == null) return a;
  return bMs < aMs ? b : a;
}

function delayMinutes(scenario: DelayScenario): number {
  if (typeof scenario === 'string') return DELAY_PRESETS[scenario] ?? 20;
  return Math.max(0, Math.round(finiteNumber(scenario.minutes) ?? 0));
}

function endpointSourceIsUnvalidatedProvider(endpoint: SafeEndpoint): boolean {
  const kind = String(endpoint.source?.kind ?? '').toLowerCase();
  if (kind === 'validated_provider') return false;
  if (kind !== 'provider' && !kind.includes('provider')) return false;
  return endpoint.source?.validated !== true;
}

function endpointIsUnavailable(endpoint: SafeEndpoint): boolean {
  const status = String(endpoint.status ?? 'viable').toLowerCase();
  return status === 'unavailable' || status === 'closed' || status === 'blocked';
}

function pushUnique(target: string[], message: string | null | undefined): void {
  const text = message?.trim();
  if (text && !target.includes(text)) target.push(text);
}

function traceItem(
  factor: CampDecisionClockDecisionTraceFactor,
  reason: string,
  options: Partial<Omit<CampDecisionClockDecisionTraceItem, 'factor' | 'reason'>> = {},
): CampDecisionClockDecisionTraceItem {
  return {
    factor,
    severity: options.severity ?? 'info',
    confidence: options.confidence ?? 'validated',
    reason,
    ...(options.deadline ? { deadline: options.deadline } : {}),
    ...(options.sourceUpdatedAt ? { sourceUpdatedAt: options.sourceUpdatedAt } : {}),
  };
}

function addTrace(
  trace: CampDecisionClockDecisionTraceItem[],
  factor: CampDecisionClockDecisionTraceFactor,
  reason: string,
  options: Partial<Omit<CampDecisionClockDecisionTraceItem, 'factor' | 'reason'>> = {},
): void {
  trace.push(traceItem(factor, reason, options));
}

function winningConstraint(
  factor: CampDecisionClockDecisionTraceFactor,
  reason: string,
  options: Partial<Omit<CampDecisionClockWinningConstraint, 'factor' | 'reason'>> = {},
): CampDecisionClockWinningConstraint {
  return {
    factor,
    severity: options.severity ?? 'info',
    confidence: options.confidence ?? 'validated',
    reason,
    ...(options.deadline ? { deadline: options.deadline } : {}),
  };
}

function winningFromDeadline(candidate: DeadlineCandidate): CampDecisionClockWinningConstraint {
  return winningConstraint(candidate.factor, candidate.reason, {
    deadline: candidate.at,
    severity: candidate.severity ?? 'warning',
    confidence: candidate.confidence ?? 'validated',
  });
}

function fallbackTraceReason(factor: CampDecisionClockDecisionTraceFactor): string {
  switch (factor) {
    case 'planned_camp_arrival':
      return 'Planned camp arrival timing did not set the earliest cutoff.';
    case 'backup_endpoint_viability':
      return 'Backup endpoint viability did not set the earliest cutoff.';
    case 'emergency_endpoint_viability':
      return 'Emergency endpoint viability is not extending normal continue guidance.';
    case 'usable_light':
      return 'Usable light did not set the earliest cutoff.';
    case 'setup_buffer':
      return 'Setup buffer did not set the earliest cutoff.';
    case 'delay_scenario':
      return 'Delay scenario did not shorten the continue window.';
    case 'route_difficulty':
      return 'Route difficulty did not shorten the continue window.';
    case 'weather_risk':
      return 'Weather risk did not shorten the continue window.';
    case 'fuel_margin':
      return 'Fuel margin did not shorten the continue window.';
    case 'water_margin':
      return 'Water margin did not shorten the continue window.';
    case 'power_margin':
      return 'Power margin did not shorten the continue window.';
    case 'camp_confidence':
      return 'Camp confidence did not shorten the continue window.';
    case 'legal_access_confidence':
      return 'Legal/access confidence did not shorten the continue window.';
    case 'data_freshness':
      return 'Data freshness did not shorten the continue window.';
    case 'provider_validation':
      return 'Provider data did not improve endpoint viability unless validated.';
    case 'input_validation':
      return 'Input validation did not block Camp Decision Clock calculation.';
    default:
      return 'Constraint was evaluated.';
  }
}

function finalizeTrace(
  trace: CampDecisionClockDecisionTraceItem[],
  includeAllFactors: boolean,
): CampDecisionClockDecisionTraceItem[] {
  const normalized = [...trace];
  if (includeAllFactors) {
    const present = new Set(normalized.map((item) => item.factor));
    TRACE_FACTORS.forEach((factor) => {
      if (!present.has(factor)) {
        normalized.push(traceItem(factor, fallbackTraceReason(factor)));
      }
    });
  }
  return normalized;
}

function marginFallback(): Margin {
  return {
    status: 'unknown',
    confidence: 'unknown',
    source: 'unknown',
  };
}

function normalizeMargins(margins: CampDecisionClockInput['margins'] | null | undefined): Record<MarginKey, Margin> {
  return {
    fuel: margins?.fuel ?? marginFallback(),
    water: margins?.water ?? marginFallback(),
    power: margins?.power ?? marginFallback(),
  };
}

function campConfidencePenalty(confidence: CampOpsConfidence | 'unknown' | null | undefined): number {
  if (confidence === 'low') return 30;
  if (confidence === 'medium') return 10;
  if (confidence === 'unknown' || !confidence) return 20;
  return 0;
}

function campConfidenceTraceConfidence(confidence: CampOpsConfidence | 'unknown' | null | undefined): CampDecisionClockTraceConfidence {
  if (confidence === 'high') return 'validated';
  if (confidence === 'unknown' || !confidence) return 'unavailable';
  return 'uncertain';
}

function legalAccessTraceConfidence(value: CampDecisionClockLegalAccessConfidence): CampDecisionClockTraceConfidence {
  if (value === 'validated') return 'validated';
  if (value === 'uncertain') return 'uncertain';
  return 'unavailable';
}

function dataFreshnessTraceConfidence(value: CampDecisionClockDataFreshness): CampDecisionClockTraceConfidence {
  if (value === 'fresh') return 'validated';
  if (value === 'stale') return 'uncertain';
  return 'unavailable';
}

function marginTraceConfidence(margin: Margin): CampDecisionClockTraceConfidence {
  if (margin.status === 'comfortable' && !margin.isStale) return 'validated';
  if (margin.status === 'unknown') return 'unavailable';
  return 'uncertain';
}

function marginTraceSeverity(margin: Margin): CampDecisionClockTraceSeverity {
  if (margin.status === 'critical') return 'critical';
  if (margin.status === 'tight' || margin.status === 'unknown' || margin.isStale) return 'warning';
  return 'info';
}

function routeDifficultyPenalty(value: CampDecisionClockRouteDifficulty): number {
  if (value === 'hard') return 30;
  if (value === 'moderate') return 15;
  if (value === 'easy') return 0;
  return 20;
}

function weatherPenalty(value: CampDecisionClockWeatherRisk): number {
  if (value === 'severe') return 60;
  if (value === 'adverse') return 30;
  if (value === 'clear') return 0;
  return 20;
}

function legalAccessPenalty(value: CampDecisionClockLegalAccessConfidence): number {
  if (value === 'unavailable') return 60;
  if (value === 'uncertain') return 45;
  return 0;
}

function freshnessPenalty(value: CampDecisionClockDataFreshness): number {
  if (value === 'unavailable') return 60;
  if (value === 'stale') return 45;
  return 0;
}

function marginPenalty(margin: Margin): number {
  if (margin.continueWindowMinutes != null && Number.isFinite(Number(margin.continueWindowMinutes))) {
    return Math.max(0, Math.round(Number(margin.continueWindowMinutes)));
  }
  if (margin.status === 'critical') return 45;
  if (margin.status === 'tight') return 20;
  if (margin.status === 'unknown') return 15;
  if (margin.isStale) return 15;
  return 0;
}

function collectInputValidation(
  input: CampDecisionClockInput,
  nowIso: string,
  warnings: string[],
  trace: CampDecisionClockDecisionTraceItem[],
): InputValidationResult {
  const problems: string[] = [];
  const warningProblems: string[] = [];
  const nowMs = parseIso(nowIso);
  if (input.currentTime && nowMs == null) problems.push('current time is invalid');

  const sunsetMs = parseIso(input.daylightWindow?.sunsetAt);
  const usableLightMs = parseIso(input.daylightWindow?.usableLightEndsAt);
  if (!input.daylightWindow?.sunsetAt || sunsetMs == null) warningProblems.push('sunset timestamp is missing or invalid');
  if (!input.daylightWindow?.usableLightEndsAt || usableLightMs == null) warningProblems.push('usable light timestamp is missing or invalid');
  if (sunsetMs != null && usableLightMs != null && usableLightMs > sunsetMs) {
    warningProblems.push('Usable light window extends after sunset; sunset is used as the safer limit');
  }

  if (input.eta?.plannedArrivalAt && parseIso(input.eta.plannedArrivalAt) == null) {
    warningProblems.push('planned ETA timestamp is invalid');
  }
  if (input.eta?.latestSafeArrivalAt && parseIso(input.eta.latestSafeArrivalAt) == null) {
    warningProblems.push('latest safe arrival timestamp is invalid');
  }
  if (input.plannedCamp?.latestSafeArrivalAt && parseIso(input.plannedCamp.latestSafeArrivalAt) == null) {
    warningProblems.push('planned camp latest safe arrival timestamp is invalid');
  }
  if (typeof input.delayScenario === 'object' && finiteNumber(input.delayScenario.minutes) == null) {
    warningProblems.push('custom delay scenario is invalid and will not improve the continue window');
  }
  const margins = input.margins;
  if (!margins?.fuel || !margins?.water || !margins?.power) {
    warningProblems.push('one or more resource margins are missing and treated as unknown');
  }

  [...problems, ...warningProblems].forEach((problem) => pushUnique(warnings, `Camp Decision Clock input validation: ${problem}.`));
  const reason = problems.length > 0
    ? `Critical Camp Decision Clock input validation failed: ${problems.join(', ')}.`
    : warningProblems.length > 0
      ? `Camp Decision Clock input validation warnings: ${warningProblems.join(', ')}.`
      : 'Input timestamps and required Camp Decision Clock fields are usable.';
  addTrace(trace, 'input_validation', reason, {
    severity: problems.length > 0 ? 'critical' : warningProblems.length > 0 ? 'warning' : 'info',
    confidence: problems.length > 0 ? 'unavailable' : warningProblems.length > 0 ? 'uncertain' : 'validated',
  });

  return {
    nowIso,
    nowMs,
    hasCriticalTimingError: problems.length > 0,
    reason,
  };
}

function collectInputWarnings(input: CampDecisionClockInput, warnings: string[]): void {
  if (input.dataFreshness === 'stale') {
    pushUnique(warnings, 'Camp Decision Clock is using stale camp data; continue window is shortened.');
  }
  if (input.dataFreshness === 'unavailable') {
    pushUnique(warnings, 'Camp Decision Clock source data is unavailable; ECS will not imply a confident continue window.');
  }
  if (input.legalAccessConfidence === 'uncertain') {
    pushUnique(warnings, 'Legal/access confidence is uncertain; ECS will not describe the planned camp as legally validated.');
  }
  if (input.legalAccessConfidence === 'unavailable') {
    pushUnique(warnings, 'Legal/access confidence is unavailable; verify official access before committing.');
  }
  if (input.plannedCamp.isStale || input.plannedCamp.dataFreshness === 'stale') {
    pushUnique(warnings, 'Planned camp source data is stale; earlier cutoff applied.');
  }
  if (input.eta.isStale) {
    pushUnique(warnings, 'ETA source is stale; earlier cutoff applied.');
  }
  if (input.routeProgress.isStale) {
    pushUnique(warnings, 'Route progress source is stale; earlier cutoff applied.');
  }
}

function endpointViabilityTimestamp(endpoint: SafeEndpoint | null | undefined): string | undefined {
  const value = endpoint?.viableUntil ?? endpoint?.latestArrivalAt ?? undefined;
  return parseIso(value) == null ? undefined : value;
}

function emergencyViableUntil(endpoint: SafeEndpoint | null, nowMs?: number | null): string | undefined {
  const value = endpointViabilityTimestamp(endpoint);
  const parsed = parseIso(value);
  if (parsed == null) return undefined;
  if (nowMs != null && nowMs >= parsed) return undefined;
  return value;
}

function validateEndpoint(
  endpoint: SafeEndpoint | null | undefined,
  role: 'Backup' | 'Emergency',
  warnings: string[],
  trace: CampDecisionClockDecisionTraceItem[],
  nowMs: number | null,
): EndpointValidation {
  const factor: CampDecisionClockDecisionTraceFactor =
    role === 'Backup' ? 'backup_endpoint_viability' : 'emergency_endpoint_viability';
  if (!endpoint) {
    pushUnique(
      warnings,
      `${role} endpoint data is missing; ECS will not show a confident continue-until recommendation.`,
    );
    addTrace(trace, factor, `${role} endpoint source-truth is missing.`, {
      severity: 'warning',
      confidence: 'unavailable',
    });
    return { endpoint: null, expired: false, rejected: true };
  }

  if (endpointSourceIsUnvalidatedProvider(endpoint)) {
    pushUnique(
      warnings,
      `${role} endpoint has unvalidated provider source; provider data cannot improve endpoint viability until validated.`,
    );
    addTrace(trace, 'provider_validation', `${role} endpoint provider source is unvalidated and was not allowed to improve viability.`, {
      severity: 'critical',
      confidence: 'unavailable',
      sourceUpdatedAt: endpoint.source?.updatedAt ?? undefined,
    });
    addTrace(trace, factor, `${role} endpoint rejected because provider source is unvalidated.`, {
      severity: 'critical',
      confidence: 'unavailable',
      sourceUpdatedAt: endpoint.source?.updatedAt ?? undefined,
    });
    return { endpoint: null, expired: false, rejected: true };
  }

  addTrace(trace, 'provider_validation', `${role} endpoint provider data did not improve viability unless validated.`, {
    severity: 'info',
    confidence: 'validated',
    sourceUpdatedAt: endpoint.source?.updatedAt ?? undefined,
  });

  if (endpointIsUnavailable(endpoint)) {
    pushUnique(warnings, `${role} endpoint is marked unavailable or closed.`);
    addTrace(trace, factor, `${role} endpoint is unavailable or closed.`, {
      severity: 'critical',
      confidence: 'unavailable',
      sourceUpdatedAt: endpoint.source?.updatedAt ?? undefined,
    });
    return { endpoint: null, expired: false, rejected: true };
  }
  if (endpoint.dataFreshness === 'stale' || endpoint.source?.isStale) {
    pushUnique(warnings, `${role} endpoint data is stale; keep the decision window conservative.`);
  }
  if (endpoint.dataFreshness === 'unavailable') {
    pushUnique(warnings, `${role} endpoint source data is unavailable.`);
    addTrace(trace, factor, `${role} endpoint source data is unavailable.`, {
      severity: 'critical',
      confidence: 'unavailable',
      sourceUpdatedAt: endpoint.source?.updatedAt ?? undefined,
    });
    return { endpoint: null, expired: false, rejected: true };
  }
  if (endpoint.legalAccessConfidence && endpoint.legalAccessConfidence !== 'validated') {
    pushUnique(
      warnings,
      `${role} endpoint legal/access confidence is ${endpoint.legalAccessConfidence}; verify before committing.`,
    );
  }
  if (endpoint.source?.updatedAt) {
    pushUnique(warnings, `${role} endpoint source last updated ${endpoint.source.updatedAt}.`);
  }
  (endpoint.warnings ?? []).forEach((warning) => pushUnique(warnings, warning));

  const viability = endpointViabilityTimestamp(endpoint);
  const viabilityMs = parseIso(viability);
  if (role === 'Emergency' && viabilityMs != null && nowMs != null && nowMs >= viabilityMs) {
    pushUnique(warnings, 'Emergency endpoint viability has expired; no active emergency endpoint remains available.');
    addTrace(trace, factor, 'Emergency endpoint viability has expired at or before the current decision time.', {
      severity: 'critical',
      confidence: 'unavailable',
      deadline: viability,
      sourceUpdatedAt: endpoint.source?.updatedAt ?? undefined,
    });
    return { endpoint: null, expired: true, rejected: true };
  }

  addTrace(trace, factor, `${role} endpoint passed source-truth viability checks.`, {
    severity: endpoint.dataFreshness === 'stale' || endpoint.source?.isStale ? 'warning' : 'info',
    confidence: endpoint.dataFreshness === 'stale' || endpoint.source?.isStale ? 'uncertain' : 'validated',
    deadline: role === 'Emergency' ? viability : endpoint.latestDivertAt ?? viability,
    sourceUpdatedAt: endpoint.source?.updatedAt ?? undefined,
  });

  return { endpoint, expired: false, rejected: false };
}

function travelMinutes(input: CampDecisionClockInput): number | null {
  const explicit =
    finiteNumber(input.eta?.travelTimeRemainingMinutes) ??
    finiteNumber(input.routeProgress?.driveTimeRemainingMinutes);
  if (explicit != null) return Math.max(0, Math.round(explicit));
  return minutesBetween(input.currentTime, input.eta?.plannedArrivalAt);
}

function backupDeadline(endpoint: SafeEndpoint, driveMinutes: number | null): DeadlineCandidate | null {
  if (endpoint.latestDivertAt && parseIso(endpoint.latestDivertAt) != null) {
    return {
      at: endpoint.latestDivertAt,
      reason: 'backup endpoint latest-divert viability',
      factor: 'backup_endpoint_viability',
      severity: 'warning',
      confidence: 'validated',
    };
  }
  const fallbackTravel = finiteNumber(endpoint.travelTimeMinutes) ?? driveMinutes;
  const viableUntil = endpoint.viableUntil ?? endpoint.latestArrivalAt ?? null;
  if (!viableUntil || fallbackTravel == null) return null;
  const at = subtractMinutes(viableUntil, fallbackTravel);
  return at
    ? {
        at,
        reason: 'backup endpoint viable-until window',
        factor: 'backup_endpoint_viability',
        severity: 'warning',
        confidence: 'validated',
      }
    : null;
}

function conservativeUsableLightEndsAt(input: CampDecisionClockInput): string | null {
  const sunsetMs = parseIso(input.daylightWindow?.sunsetAt);
  const usableMs = parseIso(input.daylightWindow?.usableLightEndsAt);
  if (usableMs == null && sunsetMs == null) return null;
  if (usableMs == null) return input.daylightWindow.sunsetAt;
  if (sunsetMs != null && usableMs > sunsetMs) return input.daylightWindow.sunsetAt;
  return input.daylightWindow.usableLightEndsAt;
}

function baseDeadlines(
  input: CampDecisionClockInput,
  backup: SafeEndpoint,
  driveMinutes: number | null,
  trace: CampDecisionClockDecisionTraceItem[],
): DeadlineCandidate[] {
  const deadlines: DeadlineCandidate[] = [];
  const plannedSafeArrival =
    input.eta?.latestSafeArrivalAt ??
    input.plannedCamp?.latestSafeArrivalAt ??
    null;
  if (plannedSafeArrival && driveMinutes != null) {
    const at = subtractMinutes(plannedSafeArrival, driveMinutes);
    if (at) {
      const candidate = {
        at,
        reason: 'planned camp latest safe arrival',
        factor: 'planned_camp_arrival' as const,
        severity: 'warning' as const,
        confidence: 'validated' as const,
      };
      deadlines.push(candidate);
      addTrace(trace, candidate.factor, candidate.reason, {
        deadline: at,
        severity: candidate.severity,
        confidence: candidate.confidence,
        sourceUpdatedAt: input.eta?.updatedAt ?? input.plannedCamp?.updatedAt ?? undefined,
      });
    }
  }
  const setupBuffer = Math.max(0, Math.round(finiteNumber(input.setupBufferMinutes) ?? DEFAULT_SETUP_BUFFER_MINUTES));
  const usableLightEndsAt = conservativeUsableLightEndsAt(input);
  if (driveMinutes != null && usableLightEndsAt) {
    const daylightLimit = subtractMinutes(usableLightEndsAt, setupBuffer + driveMinutes);
    if (daylightLimit) {
      const candidate = {
        at: daylightLimit,
        reason: 'daylight and setup buffer',
        factor: 'usable_light' as const,
        severity: 'warning' as const,
        confidence: 'validated' as const,
      };
      deadlines.push(candidate);
      addTrace(trace, 'usable_light', candidate.reason, {
        deadline: daylightLimit,
        severity: 'warning',
        confidence: 'validated',
      });
      addTrace(trace, 'setup_buffer', `${setupBuffer} minute camp setup buffer included in daylight cutoff.`, {
        deadline: daylightLimit,
        severity: 'warning',
        confidence: 'validated',
      });
    }
  }
  const backupLimit = backupDeadline(backup, driveMinutes);
  if (backupLimit) {
    deadlines.push(backupLimit);
    addTrace(trace, backupLimit.factor, backupLimit.reason, {
      deadline: backupLimit.at,
      severity: backupLimit.severity,
      confidence: backupLimit.confidence,
      sourceUpdatedAt: backup.source?.updatedAt ?? undefined,
    });
  }
  return deadlines;
}

function penaltyDeadlines(input: CampDecisionClockInput, baseline: DeadlineCandidate): DeadlineCandidate[] {
  const margins = normalizeMargins(input.margins);
  const penalties: Array<{
    minutes: number;
    reason: string;
    factor: CampDecisionClockDecisionTraceFactor;
    severity?: CampDecisionClockTraceSeverity;
    confidence?: CampDecisionClockTraceConfidence;
  }> = [
    { minutes: delayMinutes(input.delayScenario), reason: 'delay scenario', factor: 'delay_scenario' },
    { minutes: routeDifficultyPenalty(input.routeDifficulty), reason: `${input.routeDifficulty} route difficulty`, factor: 'route_difficulty' },
    { minutes: weatherPenalty(input.weatherRisk), reason: `${input.weatherRisk} weather risk`, factor: 'weather_risk' },
    { minutes: marginPenalty(margins.fuel), reason: `${margins.fuel.status} fuel margin`, factor: 'fuel_margin', severity: marginTraceSeverity(margins.fuel), confidence: marginTraceConfidence(margins.fuel) },
    { minutes: marginPenalty(margins.water), reason: `${margins.water.status} water margin`, factor: 'water_margin', severity: marginTraceSeverity(margins.water), confidence: marginTraceConfidence(margins.water) },
    { minutes: marginPenalty(margins.power), reason: `${margins.power.status} power margin`, factor: 'power_margin', severity: marginTraceSeverity(margins.power), confidence: marginTraceConfidence(margins.power) },
    { minutes: campConfidencePenalty(input.plannedCamp?.sourceConfidence), reason: `${input.plannedCamp?.sourceConfidence ?? 'unknown'} camp confidence`, factor: 'camp_confidence', confidence: campConfidenceTraceConfidence(input.plannedCamp?.sourceConfidence) },
    { minutes: legalAccessPenalty(input.legalAccessConfidence), reason: 'limited legal/access confidence', factor: 'legal_access_confidence', confidence: legalAccessTraceConfidence(input.legalAccessConfidence) },
    { minutes: freshnessPenalty(input.dataFreshness), reason: `${input.dataFreshness} camp data`, factor: 'data_freshness', confidence: dataFreshnessTraceConfidence(input.dataFreshness) },
  ];
  return penalties
    .filter((penalty) => penalty.minutes > 0)
    .map((penalty) => ({
      at: subtractMinutes(baseline.at, penalty.minutes) ?? baseline.at,
      reason: penalty.reason,
      factor: penalty.factor,
      severity: penalty.severity ?? (penalty.minutes >= 45 ? 'critical' : 'warning'),
      confidence: penalty.confidence ?? 'uncertain',
    }));
}

function addRiskTraces(
  input: CampDecisionClockInput,
  baseline: DeadlineCandidate,
  trace: CampDecisionClockDecisionTraceItem[],
): DeadlineCandidate[] {
  const margins = normalizeMargins(input.margins);
  const riskDeadlines = penaltyDeadlines(input, baseline);
  const riskByFactor = new Map(riskDeadlines.map((candidate) => [candidate.factor, candidate]));

  ([
    ['delay_scenario', 'delay scenario'] as const,
    ['route_difficulty', `${input.routeDifficulty} route difficulty`] as const,
    ['weather_risk', `${input.weatherRisk} weather risk`] as const,
    ['camp_confidence', `${input.plannedCamp?.sourceConfidence ?? 'unknown'} camp confidence`] as const,
    ['legal_access_confidence', `${input.legalAccessConfidence} legal/access confidence`] as const,
    ['data_freshness', `${input.dataFreshness} camp data freshness`] as const,
  ]).forEach(([factor, reason]) => {
    const candidate = riskByFactor.get(factor);
    if (candidate) {
      addTrace(trace, factor, candidate.reason, {
        deadline: candidate.at,
        severity: candidate.severity,
        confidence: candidate.confidence,
        sourceUpdatedAt: factor === 'data_freshness' ? input.plannedCamp?.updatedAt ?? input.eta?.updatedAt ?? undefined : undefined,
      });
    } else {
      addTrace(trace, factor, `${reason} did not shorten the baseline continue window.`, {
        severity: 'info',
        confidence: factor === 'camp_confidence'
          ? campConfidenceTraceConfidence(input.plannedCamp?.sourceConfidence)
          : factor === 'legal_access_confidence'
            ? legalAccessTraceConfidence(input.legalAccessConfidence)
            : factor === 'data_freshness'
              ? dataFreshnessTraceConfidence(input.dataFreshness)
              : 'validated',
      });
    }
  });

  (['fuel', 'water', 'power'] as const).forEach((key) => {
    const factor = `${key}_margin` as CampDecisionClockDecisionTraceFactor;
    const candidate = riskByFactor.get(factor);
    const margin = margins[key];
    if (candidate) {
      addTrace(trace, factor, candidate.reason, {
        deadline: candidate.at,
        severity: candidate.severity,
        confidence: candidate.confidence,
        sourceUpdatedAt: margin.updatedAt ?? undefined,
      });
    } else {
      addTrace(trace, factor, `${margin.status} ${key} margin did not shorten the baseline continue window.`, {
        severity: marginTraceSeverity(margin),
        confidence: marginTraceConfidence(margin),
        sourceUpdatedAt: margin.updatedAt ?? undefined,
      });
    }
  });

  return riskDeadlines;
}

function stateFromDeadline(nowIso: string, deadline: DeadlineCandidate): CampDecisionClockState {
  const nowMs = parseIso(nowIso);
  const deadlineMs = parseIso(deadline.at);
  if (nowMs == null || deadlineMs == null) return 'unavailable';
  if (nowMs >= deadlineMs) return 'divert_now';
  return 'continue';
}

function emergencyOrUnavailable(
  emergency: SafeEndpoint | null,
  warnings: string[],
  mainRisk: string,
  trace: CampDecisionClockDecisionTraceItem[],
  winning: CampDecisionClockWinningConstraint,
  nowMs: number | null,
  includeAllTraceFactors = true,
): CampDecisionClockDecision {
  const emergencyUntil = emergencyViableUntil(emergency, nowMs);
  return {
    state: emergencyUntil ? 'emergency_only' : 'unavailable',
    emergencyViableUntil: emergencyUntil,
    mainRisk,
    warnings,
    readiness: 'feature_flagged',
    decisionTrace: finalizeTrace(trace, includeAllTraceFactors),
    winningConstraint: winning,
  };
}

export function campDecisionClockUnavailableDecision(reason: string): CampDecisionClockDecision {
  const trace = [
    traceItem('input_validation', reason, {
      severity: 'critical',
      confidence: 'unavailable',
    }),
  ];
  return {
    state: 'unavailable',
    mainRisk: reason,
    warnings: [reason],
    readiness: 'feature_flagged',
    decisionTrace: trace,
    winningConstraint: winningConstraint('input_validation', reason, {
      severity: 'critical',
      confidence: 'unavailable',
    }),
  };
}

function recommendationSetCampIds(set: CampRecommendationSet): Set<string> {
  return new Set([
    set.recommendedCamp?.id,
    set.backupCamp?.id,
    set.emergencyCamp?.id,
    set.weatherFallbackCamp?.id,
    set.resupplyCamp?.id,
    set.trailerSafeCamp?.id,
    ...(set.rankedCandidates ?? []).map((candidate) => candidate.id),
  ].filter((id): id is string => Boolean(id)));
}

function recommendationSetEmergencyViableUntil(set: CampRecommendationSet, currentTimeIso?: string): string | undefined {
  const emergencyId = set.emergencyCamp?.id;
  if (!emergencyId) return undefined;
  const enrichment = set.enrichmentsByCandidateId?.[emergencyId];
  const eta = enrichment?.etaIso ?? undefined;
  const parsed = parseIso(eta);
  const nowMs = parseIso(currentTimeIso);
  if (parsed == null) return undefined;
  if (nowMs != null && nowMs >= parsed) return undefined;
  return eta;
}

export function buildCampDecisionClockDecisionFromRecommendationSet(
  recommendationSet: CampRecommendationSet | null | undefined,
  currentTimeIso: string = new Date().toISOString(),
): CampDecisionClockDecision | null {
  const decisionPoint = recommendationSet?.decisionPoint;
  if (!recommendationSet || !decisionPoint) return null;
  const deadline = decisionPoint.decisionDeadlineIso ?? undefined;
  const backupEndpointId =
    decisionPoint.divertOption?.campId ??
    recommendationSet.backupCamp?.id ??
    recommendationSet.recommendedCamp?.id ??
    undefined;
  const ids = recommendationSetCampIds(recommendationSet);
  const emergencyUntil = recommendationSetEmergencyViableUntil(recommendationSet, currentTimeIso);
  const trace: CampDecisionClockDecisionTraceItem[] = [
    traceItem('backup_endpoint_viability', decisionPoint.riskIfContinues || decisionPoint.reason || 'CampOps decision point selected backup endpoint viability.', {
      deadline,
      severity: 'warning',
      confidence: decisionPoint.confidence === 'high' || decisionPoint.confidence === 'medium' ? 'validated' : 'uncertain',
    }),
    traceItem('emergency_endpoint_viability', emergencyUntil ? 'CampOps emergency endpoint remains viable through the attached enrichment ETA.' : 'CampOps emergency endpoint viability is unavailable or expired.', {
      deadline: emergencyUntil,
      severity: emergencyUntil ? 'info' : 'warning',
      confidence: emergencyUntil ? 'validated' : 'unavailable',
    }),
  ];
  const warnings = Array.from(new Set([
    ...(recommendationSet.warnings ?? []),
    ...(recommendationSet.confidenceSummary.missingDataFields ?? []).map((field) => `${field} is missing or unresolved.`),
    decisionPoint.confidence === 'unknown' || decisionPoint.confidence === 'low'
      ? 'Camp Decision Clock is using a limited-confidence CampOps decision point.'
      : null,
    backupEndpointId && !ids.has(backupEndpointId)
      ? 'CampOps decision point references a divert endpoint that is not attached to the visible recommendation set.'
      : null,
  ].filter((warning): warning is string => Boolean(warning))));

  if (!deadline || parseIso(deadline) == null) {
    pushUnique(warnings, 'CampOps decision point deadline is unavailable; ECS will not show a continue-until time.');
    addTrace(trace, 'input_validation', 'CampOps decision point deadline is missing or invalid.', {
      severity: 'critical',
      confidence: 'unavailable',
    });
    return {
      state: recommendationSet.emergencyCamp && emergencyUntil ? 'emergency_only' : 'unavailable',
      backupEndpointId,
      emergencyViableUntil: emergencyUntil,
      mainRisk: decisionPoint.riskIfContinues || decisionPoint.reason || 'CampOps decision point deadline is unavailable.',
      warnings,
      readiness: 'feature_flagged',
      decisionTrace: trace,
      winningConstraint: winningConstraint('input_validation', 'CampOps decision point deadline is missing or invalid.', {
        severity: 'critical',
        confidence: 'unavailable',
      }),
    };
  }

  const candidate: DeadlineCandidate = {
    at: deadline,
    reason: decisionPoint.riskIfContinues || decisionPoint.reason || 'CampOps decision point requires review.',
    factor: 'backup_endpoint_viability',
    severity: 'warning',
    confidence: decisionPoint.confidence === 'high' || decisionPoint.confidence === 'medium' ? 'validated' : 'uncertain',
  };
  const state = stateFromDeadline(currentTimeIso, candidate);
  if (state === 'unavailable') {
    addTrace(trace, 'input_validation', 'Current time is invalid, so CampOps decision point state cannot be trusted.', {
      severity: 'critical',
      confidence: 'unavailable',
    });
  }
  return {
    state,
    continueUntil: deadline,
    backupEndpointId,
    emergencyViableUntil: emergencyUntil,
    mainRisk: candidate.reason,
    warnings,
    readiness: 'feature_flagged',
    decisionTrace: trace,
    winningConstraint: winningFromDeadline(candidate),
  };
}

export function evaluateCampDecisionClock(input: CampDecisionClockInput): CampDecisionClockDecision {
  const nowIso = input.currentTime ?? new Date().toISOString();
  const warnings: string[] = [];
  const trace: CampDecisionClockDecisionTraceItem[] = [];
  const validation = collectInputValidation(input, nowIso, warnings, trace);
  collectInputWarnings(input, warnings);

  const emergency = validateEndpoint(input.emergencyEndpoint, 'Emergency', warnings, trace, validation.nowMs);
  const backup = validateEndpoint(input.backupEndpoint, 'Backup', warnings, trace, validation.nowMs);

  if (validation.hasCriticalTimingError) {
    return emergencyOrUnavailable(
      emergency.endpoint,
      warnings,
      validation.reason,
      trace,
      winningConstraint('input_validation', validation.reason, {
        severity: 'critical',
        confidence: 'unavailable',
      }),
      validation.nowMs,
    );
  }

  if (emergency.expired) {
    return emergencyOrUnavailable(
      null,
      warnings,
      'Emergency endpoint viability has expired; Camp Decision Clock cannot present active camp guidance.',
      trace,
      winningConstraint('emergency_endpoint_viability', 'Emergency endpoint viability has expired at or before the current decision time.', {
        severity: 'critical',
        confidence: 'unavailable',
      }),
      validation.nowMs,
    );
  }

  if (input.dataFreshness === 'unavailable') {
    return emergencyOrUnavailable(
      emergency.endpoint,
      warnings,
      'Camp Decision Clock source data is unavailable; use emergency endpoint only if it remains viable.',
      trace,
      winningConstraint('data_freshness', 'Camp Decision Clock source data is unavailable.', {
        severity: 'critical',
        confidence: 'unavailable',
      }),
      validation.nowMs,
    );
  }

  if (!backup.endpoint) {
    return emergencyOrUnavailable(
      emergency.endpoint,
      warnings,
      'Backup endpoint source-truth is unavailable, so ECS cannot compute a confident continue window.',
      trace,
      winningConstraint('backup_endpoint_viability', 'Backup endpoint source-truth is unavailable.', {
        severity: 'critical',
        confidence: 'unavailable',
      }),
      validation.nowMs,
    );
  }

  const driveMinutes = travelMinutes(input);
  const deadlines = baseDeadlines(input, backup.endpoint, driveMinutes, trace);
  if (deadlines.length === 0) {
    pushUnique(warnings, 'Camp Decision Clock lacks ETA, daylight, or endpoint timing needed for a continue window.');
    return emergencyOrUnavailable(
      emergency.endpoint,
      warnings,
      'Camp Decision Clock lacks enough timing data for a continue window.',
      trace,
      winningConstraint('input_validation', 'Camp Decision Clock lacks ETA, daylight, or endpoint timing needed for a continue window.', {
        severity: 'critical',
        confidence: 'unavailable',
      }),
      validation.nowMs,
    );
  }

  const baseline = deadlines.reduce<DeadlineCandidate | null>((selected, candidate) => earlierDeadline(selected, candidate), null);
  const riskDeadlines = baseline ? addRiskTraces(input, baseline, trace) : [];
  const selected = [...deadlines, ...riskDeadlines].reduce<DeadlineCandidate | null>(
    (current, candidate) => earlierDeadline(current, candidate),
    null,
  );
  if (!selected) {
    return emergencyOrUnavailable(
      emergency.endpoint,
      warnings,
      'No conservative decision deadline is available.',
      trace,
      winningConstraint('input_validation', 'No conservative decision deadline is available.', {
        severity: 'critical',
        confidence: 'unavailable',
      }),
      validation.nowMs,
    );
  }

  return {
    state: stateFromDeadline(validation.nowIso, selected),
    continueUntil: selected.at,
    backupEndpointId: backup.endpoint.id,
    emergencyViableUntil: emergencyViableUntil(emergency.endpoint, validation.nowMs),
    mainRisk: selected.reason,
    warnings,
    readiness: 'feature_flagged',
    decisionTrace: finalizeTrace(trace, true),
    winningConstraint: winningFromDeadline(selected),
  };
}
