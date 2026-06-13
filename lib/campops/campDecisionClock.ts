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
};

type DeadlineCandidate = {
  at: string;
  reason: string;
};

const DELAY_PRESETS: Record<Exclude<DelayScenario, { kind: 'custom'; minutes: number; label?: string | null }>, number> = {
  no_delay: 0,
  delay_30m: 30,
  delay_1h: 60,
  delay_2h: 120,
};

const DEFAULT_SETUP_BUFFER_MINUTES = 30;

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

function earlierDeadline(a: DeadlineCandidate | null, b: DeadlineCandidate): DeadlineCandidate {
  if (!a) return b;
  const aMs = parseIso(a.at);
  const bMs = parseIso(b.at);
  if (aMs == null) return b;
  if (bMs == null) return a;
  return bMs < aMs ? b : a;
}

function delayMinutes(scenario: DelayScenario): number {
  if (typeof scenario === 'string') return DELAY_PRESETS[scenario] ?? 0;
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

function endpointWarnings(
  endpoint: SafeEndpoint | null | undefined,
  role: 'Backup' | 'Emergency',
  warnings: string[],
): SafeEndpoint | null {
  if (!endpoint) {
    pushUnique(
      warnings,
      `${role} endpoint data is missing; ECS will not show a confident continue-until recommendation.`,
    );
    return null;
  }
  if (endpointSourceIsUnvalidatedProvider(endpoint)) {
    pushUnique(
      warnings,
      `${role} endpoint has unvalidated provider source; provider data cannot improve endpoint viability until validated.`,
    );
    return null;
  }
  if (endpointIsUnavailable(endpoint)) {
    pushUnique(warnings, `${role} endpoint is marked unavailable or closed.`);
    return null;
  }
  if (endpoint.dataFreshness === 'stale' || endpoint.source?.isStale) {
    pushUnique(warnings, `${role} endpoint data is stale; keep the decision window conservative.`);
  }
  if (endpoint.dataFreshness === 'unavailable') {
    pushUnique(warnings, `${role} endpoint source data is unavailable.`);
    return null;
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
  return endpoint;
}

function travelMinutes(input: CampDecisionClockInput): number | null {
  const explicit =
    finiteNumber(input.eta.travelTimeRemainingMinutes) ??
    finiteNumber(input.routeProgress.driveTimeRemainingMinutes);
  if (explicit != null) return Math.max(0, Math.round(explicit));
  return minutesBetween(input.currentTime, input.eta.plannedArrivalAt);
}

function backupDeadline(endpoint: SafeEndpoint, nowIso: string, driveMinutes: number | null): DeadlineCandidate | null {
  if (endpoint.latestDivertAt && parseIso(endpoint.latestDivertAt) != null) {
    return {
      at: endpoint.latestDivertAt,
      reason: 'backup endpoint latest-divert viability',
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
      }
    : null;
}

function emergencyViableUntil(endpoint: SafeEndpoint | null): string | undefined {
  const value = endpoint?.viableUntil ?? endpoint?.latestArrivalAt ?? undefined;
  return parseIso(value) == null ? undefined : value;
}

function baseDeadlines(input: CampDecisionClockInput, backup: SafeEndpoint, driveMinutes: number | null): DeadlineCandidate[] {
  const deadlines: DeadlineCandidate[] = [];
  const plannedSafeArrival =
    input.eta.latestSafeArrivalAt ??
    input.plannedCamp.latestSafeArrivalAt ??
    null;
  if (plannedSafeArrival && driveMinutes != null) {
    const at = subtractMinutes(plannedSafeArrival, driveMinutes);
    if (at) deadlines.push({ at, reason: 'planned camp latest safe arrival' });
  }
  const setupBuffer = Math.max(0, Math.round(finiteNumber(input.setupBufferMinutes) ?? DEFAULT_SETUP_BUFFER_MINUTES));
  if (driveMinutes != null) {
    const daylightLimit = subtractMinutes(input.daylightWindow.usableLightEndsAt, setupBuffer + driveMinutes);
    if (daylightLimit) deadlines.push({ at: daylightLimit, reason: 'daylight and setup buffer' });
  }
  const backupLimit = backupDeadline(backup, input.currentTime ?? new Date().toISOString(), driveMinutes);
  if (backupLimit) deadlines.push(backupLimit);
  return deadlines;
}

function routeDifficultyPenalty(value: CampDecisionClockRouteDifficulty): number {
  if (value === 'hard') return 30;
  if (value === 'moderate') return 15;
  if (value === 'unknown') return 20;
  return 0;
}

function weatherPenalty(value: CampDecisionClockWeatherRisk): number {
  if (value === 'severe') return 60;
  if (value === 'adverse') return 30;
  if (value === 'unknown') return 20;
  return 0;
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

function marginPenalty(key: keyof CampDecisionClockInput['margins'], margin: Margin): number {
  if (margin.continueWindowMinutes != null && Number.isFinite(Number(margin.continueWindowMinutes))) {
    return Math.max(0, Math.round(Number(margin.continueWindowMinutes)));
  }
  if (margin.status === 'critical') return 45;
  if (margin.status === 'tight') return 20;
  if (margin.status === 'unknown') return 15;
  if (margin.isStale) return 15;
  return key === 'power' && margin.status === 'comfortable' ? 0 : 0;
}

function penaltyDeadlines(input: CampDecisionClockInput, baseline: DeadlineCandidate): DeadlineCandidate[] {
  const penalties: Array<{ minutes: number; reason: string }> = [
    { minutes: delayMinutes(input.delayScenario), reason: 'delay scenario' },
    { minutes: routeDifficultyPenalty(input.routeDifficulty), reason: `${input.routeDifficulty} route difficulty` },
    { minutes: weatherPenalty(input.weatherRisk), reason: `${input.weatherRisk} weather risk` },
    { minutes: legalAccessPenalty(input.legalAccessConfidence), reason: 'limited legal/access confidence' },
    { minutes: freshnessPenalty(input.dataFreshness), reason: `${input.dataFreshness} camp data` },
    ...Object.entries(input.margins).map(([key, margin]) => ({
      minutes: marginPenalty(key as keyof CampDecisionClockInput['margins'], margin),
      reason: `${margin.status} ${key} margin`,
    })),
  ];
  return penalties
    .filter((penalty) => penalty.minutes > 0)
    .map((penalty) => ({
      at: subtractMinutes(baseline.at, penalty.minutes) ?? baseline.at,
      reason: penalty.reason,
    }));
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

function stateFromDeadline(nowIso: string, deadline: DeadlineCandidate): CampDecisionClockState {
  const nowMs = parseIso(nowIso);
  const deadlineMs = parseIso(deadline.at);
  if (nowMs != null && deadlineMs != null && nowMs > deadlineMs) return 'divert_now';
  return 'continue';
}

function emergencyOrUnavailable(emergency: SafeEndpoint | null, warnings: string[], mainRisk: string): CampDecisionClockDecision {
  const emergencyUntil = emergencyViableUntil(emergency);
  return {
    state: emergencyUntil ? 'emergency_only' : 'unavailable',
    emergencyViableUntil: emergencyUntil,
    mainRisk,
    warnings,
    readiness: 'feature_flagged',
  };
}

export function campDecisionClockUnavailableDecision(reason: string): CampDecisionClockDecision {
  return {
    state: 'unavailable',
    mainRisk: reason,
    warnings: [reason],
    readiness: 'feature_flagged',
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

function recommendationSetEmergencyViableUntil(set: CampRecommendationSet): string | undefined {
  const emergencyId = set.emergencyCamp?.id;
  if (!emergencyId) return undefined;
  const enrichment = set.enrichmentsByCandidateId?.[emergencyId];
  const eta = enrichment?.etaIso ?? undefined;
  return parseIso(eta) == null ? undefined : eta;
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
    return {
      state: recommendationSet.emergencyCamp ? 'emergency_only' : 'unavailable',
      backupEndpointId,
      emergencyViableUntil: recommendationSetEmergencyViableUntil(recommendationSet),
      mainRisk: decisionPoint.riskIfContinues || decisionPoint.reason || 'CampOps decision point deadline is unavailable.',
      warnings: Array.from(new Set([
        ...warnings,
        'CampOps decision point deadline is unavailable; ECS will not show a continue-until time.',
      ])),
      readiness: 'feature_flagged',
    };
  }

  const state = stateFromDeadline(currentTimeIso, {
    at: deadline,
    reason: decisionPoint.riskIfContinues || decisionPoint.reason,
  });
  return {
    state,
    continueUntil: deadline,
    backupEndpointId,
    emergencyViableUntil: recommendationSetEmergencyViableUntil(recommendationSet),
    mainRisk: decisionPoint.riskIfContinues || decisionPoint.reason || 'CampOps decision point requires review.',
    warnings,
    readiness: 'feature_flagged',
  };
}

export function evaluateCampDecisionClock(input: CampDecisionClockInput): CampDecisionClockDecision {
  const nowIso = input.currentTime ?? new Date().toISOString();
  const warnings: string[] = [];
  collectInputWarnings(input, warnings);

  const emergency = endpointWarnings(input.emergencyEndpoint, 'Emergency', warnings);
  const backup = endpointWarnings(input.backupEndpoint, 'Backup', warnings);
  if (input.dataFreshness === 'unavailable') {
    return emergencyOrUnavailable(
      emergency,
      warnings,
      'Camp Decision Clock source data is unavailable; use emergency endpoint only if it remains viable.',
    );
  }
  if (!backup) {
    return emergencyOrUnavailable(
      emergency,
      warnings,
      'Backup endpoint source-truth is unavailable, so ECS cannot compute a confident continue window.',
    );
  }

  const driveMinutes = travelMinutes(input);
  const deadlines = baseDeadlines(input, backup, driveMinutes);
  if (deadlines.length === 0) {
    pushUnique(warnings, 'Camp Decision Clock lacks ETA, daylight, or endpoint timing needed for a continue window.');
    return emergencyOrUnavailable(
      emergency,
      warnings,
      'Camp Decision Clock lacks enough timing data for a continue window.',
    );
  }

  const baseline = deadlines.reduce<DeadlineCandidate | null>((selected, candidate) => earlierDeadline(selected, candidate), null);
  const riskDeadlines = baseline ? penaltyDeadlines(input, baseline) : [];
  const selected = [...deadlines, ...riskDeadlines].reduce<DeadlineCandidate | null>(
    (current, candidate) => earlierDeadline(current, candidate),
    null,
  );
  if (!selected) {
    return emergencyOrUnavailable(emergency, warnings, 'No conservative decision deadline is available.');
  }

  return {
    state: stateFromDeadline(nowIso, selected),
    continueUntil: selected.at,
    backupEndpointId: backup.id,
    emergencyViableUntil: emergencyViableUntil(emergency),
    mainRisk: selected.reason,
    warnings,
    readiness: 'feature_flagged',
  };
}
