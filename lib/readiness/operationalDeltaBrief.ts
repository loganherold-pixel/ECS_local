import {
  evaluateSourceTruthRef,
  sanitizeSourceTruthRef,
  type SourceTruthEvaluation,
  type SourceTruthPolicyKey,
  type SourceTruthRef,
} from '../sourceTruth';

export const OPERATIONAL_DELTA_SCHEMA_VERSION = 'operational-delta-v1';

export type OperationalDeltaBaselineKind =
  | 'departure'
  | 'last_stop'
  | 'last_acknowledgment';

export type OperationalDeltaDomain =
  | 'assessment'
  | 'route'
  | 'camp'
  | 'fuel'
  | 'water'
  | 'power'
  | 'loadout'
  | 'vehicle'
  | 'weather'
  | 'connectivity'
  | 'offline'
  | 'remoteness'
  | 'bailout'
  | 'convoy'
  | 'source';

export type OperationalDeltaCategory =
  | 'new_blocker'
  | 'worsened_condition'
  | 'improved_condition'
  | 'newly_stale'
  | 'restored_source'
  | 'material_value_change'
  | 'operationally_neutral'
  | 'unknown';

export type OperationalDeltaSeverity =
  | 'critical'
  | 'caution'
  | 'watch'
  | 'info'
  | 'unknown';

export type OperationalSnapshotFactKind =
  | 'blocker'
  | 'metric'
  | 'status'
  | 'flag'
  | 'identity'
  | 'set';

export type OperationalDeltaDirection =
  | 'higher_is_better'
  | 'lower_is_better'
  | 'neutral';

export type OperationalSnapshotValue = string | number | boolean | string[] | null;

export type OperationalDeltaThresholdKey =
  | 'assessment_score_points'
  | 'route_progress_percent'
  | 'route_distance_miles'
  | 'camp_eta_minutes'
  | 'camp_daylight_margin_minutes'
  | 'fuel_margin_miles'
  | 'fuel_percent'
  | 'water_gallons'
  | 'water_liters'
  | 'power_percent'
  | 'power_runtime_hours'
  | 'vehicle_weight_lbs'
  | 'gvwr_usage_percent'
  | 'weather_wind_mph'
  | 'weather_precipitation_percent'
  | 'offline_coverage_percent'
  | 'remoteness_score'
  | 'convoy_count'
  | 'loadout_readiness_percent';

export type OperationalDeltaNoiseThreshold = {
  absolute: number;
  unit: string;
  rationale: string;
};

/**
 * Central materiality thresholds. Exact boundaries are material; values below
 * them are treated as sensor or timestamp noise.
 */
export const OPERATIONAL_DELTA_NOISE_THRESHOLDS: Record<
  OperationalDeltaThresholdKey,
  OperationalDeltaNoiseThreshold
> = {
  assessment_score_points: {
    absolute: 5,
    unit: 'points',
    rationale: 'Suppress small readiness-score recalculation drift.',
  },
  route_progress_percent: {
    absolute: 2,
    unit: 'percentage points',
    rationale: 'Suppress normal GPS progress jitter.',
  },
  route_distance_miles: {
    absolute: 1,
    unit: 'miles',
    rationale: 'Suppress sub-mile route matching and GPS drift.',
  },
  camp_eta_minutes: {
    absolute: 10,
    unit: 'minutes',
    rationale: 'Surface arrival changes that affect operating decisions.',
  },
  camp_daylight_margin_minutes: {
    absolute: 10,
    unit: 'minutes',
    rationale: 'Match the camp ETA materiality window.',
  },
  fuel_margin_miles: {
    absolute: 5,
    unit: 'miles',
    rationale: 'Suppress small range-estimation movement.',
  },
  fuel_percent: {
    absolute: 5,
    unit: 'percentage points',
    rationale: 'Match existing ECS fuel delta behavior.',
  },
  water_gallons: {
    absolute: 1,
    unit: 'gallons',
    rationale: 'Suppress container and estimation rounding.',
  },
  water_liters: {
    absolute: 4,
    unit: 'liters',
    rationale: 'Approximately one gallon of material water change.',
  },
  power_percent: {
    absolute: 5,
    unit: 'percentage points',
    rationale: 'Match existing ECS power delta behavior.',
  },
  power_runtime_hours: {
    absolute: 0.5,
    unit: 'hours',
    rationale: 'Surface at least thirty minutes of runtime movement.',
  },
  vehicle_weight_lbs: {
    absolute: 25,
    unit: 'pounds',
    rationale: 'Suppress accessory and scale rounding noise.',
  },
  gvwr_usage_percent: {
    absolute: 1,
    unit: 'percentage point',
    rationale: 'Surface meaningful movement toward or away from GVWR.',
  },
  weather_wind_mph: {
    absolute: 5,
    unit: 'mph',
    rationale: 'Suppress small forecast and station variation.',
  },
  weather_precipitation_percent: {
    absolute: 10,
    unit: 'percentage points',
    rationale: 'Surface a material forecast probability shift.',
  },
  offline_coverage_percent: {
    absolute: 5,
    unit: 'percentage points',
    rationale: 'Suppress package accounting drift while exposing gaps.',
  },
  remoteness_score: {
    absolute: 10,
    unit: 'points',
    rationale: 'Surface a meaningful remoteness posture change.',
  },
  convoy_count: {
    absolute: 1,
    unit: 'member',
    rationale: 'Any member-state change is operationally material.',
  },
  loadout_readiness_percent: {
    absolute: 5,
    unit: 'percentage points',
    rationale: 'Suppress small checklist recalculation drift.',
  },
};

export interface OperationalSnapshotFact {
  id: string;
  domain: OperationalDeltaDomain;
  label: string;
  kind: OperationalSnapshotFactKind;
  value: OperationalSnapshotValue;
  displayValue?: string | null;
  unit?: string | null;
  thresholdKey?: OperationalDeltaThresholdKey | null;
  direction?: OperationalDeltaDirection;
  rank?: number | null;
  required?: boolean;
  severityOnWorsen?: OperationalDeltaSeverity;
  severityOnMissing?: OperationalDeltaSeverity;
  blockerSeverity?: OperationalDeltaSeverity;
  recommendedAction?: string | null;
  sourceTruth: SourceTruthRef;
  freshnessPolicyKey: SourceTruthPolicyKey;
  dependencies?: string[];
}

export interface OperationalSnapshot {
  id: string;
  schemaVersion: typeof OPERATIONAL_DELTA_SCHEMA_VERSION;
  expeditionId: string | null;
  routeId: string | null;
  capturedAt: string;
  baselineKind?: OperationalDeltaBaselineKind | null;
  label?: string | null;
  facts: OperationalSnapshotFact[];
}

export interface OperationalDeltaEvidenceValue {
  value: OperationalSnapshotValue;
  displayValue: string;
  observedAt: string | null;
  capturedAt: string;
  freshness: SourceTruthEvaluation['freshness'];
  origin: SourceTruthRef['origin'];
  availability: SourceTruthEvaluation['availability'];
  confidence: SourceTruthEvaluation['confidence'];
  coverage: SourceTruthEvaluation['coverage'];
  conflict: boolean;
  warningCodes: string[];
  sourceTruth: SourceTruthRef;
}

export interface OperationalDeltaEvidence {
  factId: string;
  policyKey: SourceTruthPolicyKey;
  previous: OperationalDeltaEvidenceValue;
  current: OperationalDeltaEvidenceValue;
}

export interface OperationalDelta {
  id: string;
  fingerprint: string;
  factId: string;
  domain: OperationalDeltaDomain;
  category: OperationalDeltaCategory;
  severity: OperationalDeltaSeverity;
  title: string;
  summary: string;
  recommendedAction: string | null;
  evidence: OperationalDeltaEvidence;
  sourceTruth: SourceTruthRef;
  freshnessPolicyKey: SourceTruthPolicyKey;
  dependencies: string[];
}

export type OperationalDeltaResultStatus =
  | 'ready'
  | 'no_baseline'
  | 'baseline_mismatch'
  | 'invalid_baseline'
  | 'invalid_current';

export interface OperationalDeltaResult {
  status: OperationalDeltaResultStatus;
  baselineKind: OperationalDeltaBaselineKind;
  baseline: OperationalSnapshot | null;
  current: OperationalSnapshot;
  deltas: OperationalDelta[];
  allDeltas: OperationalDelta[];
  suppressedCount: number;
  counts: Record<OperationalDeltaCategory, number>;
  highestSeverity: OperationalDeltaSeverity | null;
  summary: string;
  warnings: string[];
}

export interface BuildOperationalDeltaInput {
  baseline?: OperationalSnapshot | null;
  current: OperationalSnapshot;
  baselineKind: OperationalDeltaBaselineKind;
  suppressedFingerprints?: readonly string[] | null;
}

export interface OperationalDeltaAiSummaryCandidate {
  summary: string;
  orderedFingerprints: string[];
}

export interface OperationalDeltaAiSummaryGuardResult {
  accepted: boolean;
  summary: string;
  reason: string | null;
}

const CATEGORY_ORDER: Record<OperationalDeltaCategory, number> = {
  new_blocker: 8,
  worsened_condition: 7,
  newly_stale: 6,
  unknown: 5,
  improved_condition: 4,
  restored_source: 3,
  material_value_change: 2,
  operationally_neutral: 1,
};

const SEVERITY_ORDER: Record<OperationalDeltaSeverity, number> = {
  critical: 5,
  caution: 4,
  watch: 3,
  unknown: 2,
  info: 1,
};

const FRESHNESS_ORDER: Record<SourceTruthEvaluation['freshness'], number> = {
  live: 5,
  recent: 4,
  stale: 3,
  expired: 2,
  unavailable: 1,
};

const AVAILABILITY_ORDER: Record<SourceTruthEvaluation['availability'], number> = {
  usable: 3,
  degraded: 2,
  unavailable: 1,
};

const EMPTY_COUNTS: Record<OperationalDeltaCategory, number> = {
  new_blocker: 0,
  worsened_condition: 0,
  improved_condition: 0,
  newly_stale: 0,
  restored_source: 0,
  material_value_change: 0,
  operationally_neutral: 0,
  unknown: 0,
};

function validIso(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function canonicalValue(value: OperationalSnapshotValue): OperationalSnapshotValue {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean))).sort();
  }
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
  if (typeof value === 'string') return value.trim();
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, next) => {
    if (next && typeof next === 'object' && !Array.isArray(next)) {
      const record = next as Record<string, unknown>;
      return Object.keys(record).sort().reduce<Record<string, unknown>>((output, key) => {
        output[key] = record[key];
        return output;
      }, {});
    }
    return next;
  });
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function displayValue(fact: OperationalSnapshotFact, value: OperationalSnapshotValue): string {
  if (fact.displayValue && value === fact.value) return fact.displayValue;
  if (value == null || value === '') return 'Unknown';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    const rounded = Math.abs(value) >= 100 ? Math.round(value) : Number(value.toFixed(1));
    return fact.unit ? `${rounded} ${fact.unit}` : String(rounded);
  }
  return fact.unit ? `${value} ${fact.unit}` : String(value);
}

function sourceEvaluation(fact: OperationalSnapshotFact, capturedAt: string): SourceTruthEvaluation {
  return evaluateSourceTruthRef(fact.sourceTruth, {
    policyKey: fact.freshnessPolicyKey,
    now: capturedAt,
  });
}

function evidenceValue(
  fact: OperationalSnapshotFact,
  capturedAt: string,
  evaluation: SourceTruthEvaluation,
): OperationalDeltaEvidenceValue {
  return {
    value: canonicalValue(fact.value),
    displayValue: displayValue(fact, fact.value),
    observedAt: evaluation.ref.observedAt ?? evaluation.ref.fetchedAt ?? null,
    capturedAt,
    freshness: evaluation.freshness,
    origin: evaluation.ref.origin,
    availability: evaluation.availability,
    confidence: evaluation.confidence,
    coverage: evaluation.coverage,
    conflict: evaluation.conflict,
    warningCodes: evaluation.warningCodes.slice(),
    sourceTruth: evaluation.ref,
  };
}

function cloneFactWithValue(
  template: OperationalSnapshotFact,
  value: OperationalSnapshotValue,
  sourceTruth: SourceTruthRef,
): OperationalSnapshotFact {
  return {
    ...template,
    value,
    displayValue: null,
    sourceTruth,
  };
}

function unavailableSource(id: string, capturedAt: string): SourceTruthRef {
  return {
    id: `${id}:unavailable`,
    origin: 'unavailable',
    authority: null,
    provider: null,
    observedAt: capturedAt,
    fetchedAt: null,
    expiresAt: null,
    confidence: 'unknown',
    coverage: 'unknown',
    availability: 'unavailable',
    conflict: false,
    warningCodes: ['operational_delta_value_missing'],
  };
}

function absentBlockerSource(template: OperationalSnapshotFact, capturedAt: string): SourceTruthRef {
  return sanitizeSourceTruthRef({
    ...template.sourceTruth,
    observedAt: capturedAt,
    fetchedAt: null,
    expiresAt: null,
    availability: 'usable',
    warningCodes: Array.from(new Set([
      ...(template.sourceTruth.warningCodes ?? []),
      'operational_delta_absent_blocker_state',
    ])),
  });
}

function normalizeFacts(snapshot: OperationalSnapshot): Map<string, OperationalSnapshotFact> {
  const facts = new Map<string, OperationalSnapshotFact>();
  snapshot.facts.forEach((fact) => {
    const id = String(fact?.id ?? '').trim();
    if (!id || facts.has(id)) return;
    facts.set(id, {
      ...fact,
      id,
      label: String(fact.label ?? id).trim() || id,
      value: canonicalValue(fact.value),
      sourceTruth: sanitizeSourceTruthRef({
        ...fact.sourceTruth,
        id: fact.sourceTruth?.id || `${id}:source`,
      }),
      dependencies: (fact.dependencies ?? []).map((item) => String(item).trim()).filter(Boolean),
    });
  });
  return facts;
}

function counterpartFacts(
  factId: string,
  previous: OperationalSnapshotFact | undefined,
  current: OperationalSnapshotFact | undefined,
  previousCapturedAt: string,
  currentCapturedAt: string,
): { previous: OperationalSnapshotFact; current: OperationalSnapshotFact } | null {
  if (!previous && !current) return null;
  if (!previous && current) {
    if (current.kind === 'blocker') {
      return {
        previous: cloneFactWithValue(current, false, absentBlockerSource(current, previousCapturedAt)),
        current,
      };
    }
    if (!current.required) return null;
    return {
      previous: cloneFactWithValue(current, null, unavailableSource(factId, previousCapturedAt)),
      current,
    };
  }
  if (previous && !current) {
    if (previous.kind === 'blocker') {
      return {
        previous,
        current: cloneFactWithValue(previous, false, absentBlockerSource(previous, currentCapturedAt)),
      };
    }
    if (!previous.required) return null;
    return {
      previous,
      current: cloneFactWithValue(previous, null, unavailableSource(factId, currentCapturedAt)),
    };
  }
  return { previous: previous!, current: current! };
}

function severityForWorsen(fact: OperationalSnapshotFact): OperationalDeltaSeverity {
  return fact.severityOnWorsen ?? (fact.required ? 'caution' : 'watch');
}

function sourceQualitySeverity(fact: OperationalSnapshotFact): OperationalDeltaSeverity {
  if (fact.domain === 'convoy' || fact.domain === 'weather' || fact.domain === 'route' || fact.domain === 'camp') {
    return fact.required ? 'caution' : 'watch';
  }
  return fact.required ? 'watch' : 'info';
}

function buildFingerprint(args: {
  fact: OperationalSnapshotFact;
  category: OperationalDeltaCategory;
  comparisonKind: 'quality' | 'value';
  previous: OperationalDeltaEvidenceValue;
  current: OperationalDeltaEvidenceValue;
}): string {
  const payload = stableStringify({
    schema: OPERATIONAL_DELTA_SCHEMA_VERSION,
    factId: args.fact.id,
    domain: args.fact.domain,
    category: args.category,
    comparisonKind: args.comparisonKind,
    previous: {
      value: args.previous.value,
      freshness: args.previous.freshness,
      origin: args.previous.origin,
      availability: args.previous.availability,
      conflict: args.previous.conflict,
      warningCodes: args.previous.warningCodes,
      sourceId: args.previous.sourceTruth.id,
    },
    current: {
      value: args.current.value,
      freshness: args.current.freshness,
      origin: args.current.origin,
      availability: args.current.availability,
      conflict: args.current.conflict,
      warningCodes: args.current.warningCodes,
      sourceId: args.current.sourceTruth.id,
    },
  });
  return `opdelta:${fnv1a(payload)}`;
}

function createDelta(args: {
  fact: OperationalSnapshotFact;
  category: OperationalDeltaCategory;
  severity: OperationalDeltaSeverity;
  summary: string;
  comparisonKind: 'quality' | 'value';
  previousFact: OperationalSnapshotFact;
  currentFact: OperationalSnapshotFact;
  previousSnapshot: OperationalSnapshot;
  currentSnapshot: OperationalSnapshot;
}): OperationalDelta {
  const previousEvaluation = sourceEvaluation(args.previousFact, args.previousSnapshot.capturedAt);
  const currentEvaluation = sourceEvaluation(args.currentFact, args.currentSnapshot.capturedAt);
  const previous = evidenceValue(args.previousFact, args.previousSnapshot.capturedAt, previousEvaluation);
  const current = evidenceValue(args.currentFact, args.currentSnapshot.capturedAt, currentEvaluation);
  const fingerprint = buildFingerprint({
    fact: args.fact,
    category: args.category,
    comparisonKind: args.comparisonKind,
    previous,
    current,
  });

  return {
    id: `${args.fact.id}:${args.comparisonKind}:${fingerprint}`,
    fingerprint,
    factId: args.fact.id,
    domain: args.fact.domain,
    category: args.category,
    severity: args.severity,
    title: args.fact.label,
    summary: args.summary,
    recommendedAction: args.fact.recommendedAction ?? null,
    evidence: {
      factId: args.fact.id,
      policyKey: args.fact.freshnessPolicyKey,
      previous,
      current,
    },
    sourceTruth: current.sourceTruth,
    freshnessPolicyKey: args.fact.freshnessPolicyKey,
    dependencies: (args.fact.dependencies ?? []).slice(),
  };
}

function sourceQualityDelta(
  previousFact: OperationalSnapshotFact,
  currentFact: OperationalSnapshotFact,
  previousSnapshot: OperationalSnapshot,
  currentSnapshot: OperationalSnapshot,
): OperationalDelta | null {
  const previous = sourceEvaluation(previousFact, previousSnapshot.capturedAt);
  const current = sourceEvaluation(currentFact, currentSnapshot.capturedAt);
  const fact = currentFact;
  const common = { fact, previousFact, currentFact, previousSnapshot, currentSnapshot };

  if (!previous.conflict && current.conflict) {
    return createDelta({
      ...common,
      category: 'worsened_condition',
      severity: severityForWorsen(fact),
      comparisonKind: 'quality',
      summary: `${fact.label} now has conflicting source evidence. ECS is not treating either claim as settled.`,
    });
  }
  if (previous.conflict && !current.conflict) {
    return createDelta({
      ...common,
      category: 'restored_source',
      severity: 'info',
      comparisonKind: 'quality',
      summary: `${fact.label} source conflict has resolved. Current ${current.ref.origin} evidence remains visible.`,
    });
  }

  const previousFreshness = FRESHNESS_ORDER[previous.freshness];
  const currentFreshness = FRESHNESS_ORDER[current.freshness];
  const becameStale =
    previousFreshness >= FRESHNESS_ORDER.recent &&
    currentFreshness <= FRESHNESS_ORDER.stale;
  const restoredFreshness =
    previousFreshness <= FRESHNESS_ORDER.stale &&
    currentFreshness >= FRESHNESS_ORDER.recent;

  if (becameStale) {
    return createDelta({
      ...common,
      category: 'newly_stale',
      severity: sourceQualitySeverity(fact),
      comparisonKind: 'quality',
      summary: `${fact.label} became ${current.freshness}. The ${current.ref.origin} origin is unchanged and remains ${current.availability}.`,
    });
  }
  if (restoredFreshness) {
    return createDelta({
      ...common,
      category: 'restored_source',
      severity: 'info',
      comparisonKind: 'quality',
      summary: `${fact.label} freshness recovered from ${previous.freshness} to ${current.freshness}.`,
    });
  }

  const previousAvailability = AVAILABILITY_ORDER[previous.availability];
  const currentAvailability = AVAILABILITY_ORDER[current.availability];
  if (currentAvailability < previousAvailability) {
    return createDelta({
      ...common,
      category: current.availability === 'unavailable' ? 'unknown' : 'worsened_condition',
      severity: current.availability === 'unavailable'
        ? fact.severityOnMissing ?? severityForWorsen(fact)
        : severityForWorsen(fact),
      comparisonKind: 'quality',
      summary: `${fact.label} availability changed from ${previous.availability} to ${current.availability}. Freshness remains ${current.freshness}.`,
    });
  }
  if (currentAvailability > previousAvailability) {
    return createDelta({
      ...common,
      category: 'restored_source',
      severity: 'info',
      comparisonKind: 'quality',
      summary: `${fact.label} availability recovered from ${previous.availability} to ${current.availability}.`,
    });
  }

  const previousWarnings = Array.from(new Set(previous.warningCodes)).sort();
  const currentWarnings = Array.from(new Set(current.warningCodes)).sort();
  if (stableStringify(previousWarnings) !== stableStringify(currentWarnings)) {
    const addedWarnings = currentWarnings.filter((code) => !previousWarnings.includes(code));
    const removedWarnings = previousWarnings.filter((code) => !currentWarnings.includes(code));
    return createDelta({
      ...common,
      category: addedWarnings.length > 0
        ? 'worsened_condition'
        : removedWarnings.length > 0
          ? 'restored_source'
          : 'operationally_neutral',
      severity: addedWarnings.length > 0 ? sourceQualitySeverity(fact) : 'info',
      comparisonKind: 'quality',
      summary: addedWarnings.length > 0
        ? `${fact.label} has new source warnings. Review source details before relying on it.`
        : `${fact.label} source warnings have cleared. Current source state remains visible.`,
    });
  }

  if (previous.ref.origin !== current.ref.origin) {
    const restoredLive = previous.ref.origin !== 'live' && current.ref.origin === 'live';
    const lostLive = previous.ref.origin === 'live' && current.ref.origin !== 'live';
    return createDelta({
      ...common,
      category: restoredLive
        ? 'restored_source'
        : lostLive
          ? 'worsened_condition'
          : 'operationally_neutral',
      severity: lostLive ? 'watch' : 'info',
      comparisonKind: 'quality',
      summary: `${fact.label} origin changed from ${previous.ref.origin} to ${current.ref.origin}; current freshness is ${current.freshness}.`,
    });
  }

  return null;
}

function valuesEqual(previous: OperationalSnapshotValue, current: OperationalSnapshotValue): boolean {
  return stableStringify(canonicalValue(previous)) === stableStringify(canonicalValue(current));
}

function numericDeltaIsMaterial(fact: OperationalSnapshotFact, previous: number, current: number): boolean {
  const threshold = fact.thresholdKey
    ? OPERATIONAL_DELTA_NOISE_THRESHOLDS[fact.thresholdKey]?.absolute
    : 0;
  return Math.abs(current - previous) >= (threshold ?? 0);
}

function changeCategory(
  fact: OperationalSnapshotFact,
  previousRankOrValue: number,
  currentRankOrValue: number,
): OperationalDeltaCategory {
  if (fact.direction === 'neutral' || fact.direction == null) return 'material_value_change';
  const increased = currentRankOrValue > previousRankOrValue;
  const improved = fact.direction === 'higher_is_better' ? increased : !increased;
  return improved ? 'improved_condition' : 'worsened_condition';
}

function valueDelta(
  previousFact: OperationalSnapshotFact,
  currentFact: OperationalSnapshotFact,
  previousSnapshot: OperationalSnapshot,
  currentSnapshot: OperationalSnapshot,
): OperationalDelta | null {
  const fact = currentFact;
  const previousValue = canonicalValue(previousFact.value);
  const currentValue = canonicalValue(currentFact.value);
  const common = { fact, previousFact, currentFact, previousSnapshot, currentSnapshot };

  if (fact.kind === 'blocker') {
    const wasBlocked = previousValue === true;
    const isBlocked = currentValue === true;
    if (wasBlocked === isBlocked) return null;
    if (isBlocked) {
      return createDelta({
        ...common,
        category: 'new_blocker',
        severity: fact.blockerSeverity ?? 'critical',
        comparisonKind: 'value',
        summary: `${fact.label} is now blocking the operating posture.`,
      });
    }
    return createDelta({
      ...common,
      category: 'improved_condition',
      severity: 'info',
      comparisonKind: 'value',
      summary: `${fact.label} is no longer blocking the operating posture.`,
    });
  }

  if (previousValue == null && currentValue == null) return null;
  if (previousValue != null && currentValue == null) {
    return createDelta({
      ...common,
      category: 'unknown',
      severity: fact.severityOnMissing ?? (fact.required ? 'caution' : 'unknown'),
      comparisonKind: 'value',
      summary: `${fact.label} is now unknown because the current value is missing.`,
    });
  }
  if (previousValue == null && currentValue != null) {
    return createDelta({
      ...common,
      category: 'restored_source',
      severity: 'info',
      comparisonKind: 'value',
      summary: `${fact.label} is available again at ${displayValue(currentFact, currentValue)}.`,
    });
  }
  if (valuesEqual(previousValue, currentValue)) return null;

  if (fact.kind === 'metric') {
    if (typeof previousValue !== 'number' || typeof currentValue !== 'number') {
      return createDelta({
        ...common,
        category: 'unknown',
        severity: 'unknown',
        comparisonKind: 'value',
        summary: `${fact.label} could not be compared because a numeric value was invalid.`,
      });
    }
    if (!numericDeltaIsMaterial(fact, previousValue, currentValue)) return null;
    const category = changeCategory(fact, previousValue, currentValue);
    return createDelta({
      ...common,
      category,
      severity: category === 'worsened_condition' ? severityForWorsen(fact) : 'info',
      comparisonKind: 'value',
      summary: `${fact.label} changed from ${displayValue(previousFact, previousValue)} to ${displayValue(currentFact, currentValue)}.`,
    });
  }

  if (fact.kind === 'status' && previousFact.rank != null && currentFact.rank != null) {
    if (previousFact.rank === currentFact.rank) return null;
    const category = changeCategory(fact, previousFact.rank, currentFact.rank);
    return createDelta({
      ...common,
      category,
      severity: category === 'worsened_condition' ? severityForWorsen(fact) : 'info',
      comparisonKind: 'value',
      summary: `${fact.label} changed from ${displayValue(previousFact, previousValue)} to ${displayValue(currentFact, currentValue)}.`,
    });
  }

  if (fact.kind === 'flag' && typeof previousValue === 'boolean' && typeof currentValue === 'boolean') {
    const previousNumeric = previousValue ? 1 : 0;
    const currentNumeric = currentValue ? 1 : 0;
    const category = changeCategory(fact, previousNumeric, currentNumeric);
    return createDelta({
      ...common,
      category,
      severity: category === 'worsened_condition' ? severityForWorsen(fact) : 'info',
      comparisonKind: 'value',
      summary: `${fact.label} changed from ${displayValue(previousFact, previousValue)} to ${displayValue(currentFact, currentValue)}.`,
    });
  }

  return createDelta({
    ...common,
    category: fact.kind === 'identity' ? 'operationally_neutral' : 'material_value_change',
    severity: 'info',
    comparisonKind: 'value',
    summary: `${fact.label} changed from ${displayValue(previousFact, previousValue)} to ${displayValue(currentFact, currentValue)}.`,
  });
}

function sortDeltas(deltas: OperationalDelta[]): OperationalDelta[] {
  return deltas.slice().sort((left, right) => {
    const severity = SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity];
    if (severity !== 0) return severity;
    const category = CATEGORY_ORDER[right.category] - CATEGORY_ORDER[left.category];
    if (category !== 0) return category;
    const domain = left.domain.localeCompare(right.domain);
    if (domain !== 0) return domain;
    const fact = left.factId.localeCompare(right.factId);
    if (fact !== 0) return fact;
    return left.fingerprint.localeCompare(right.fingerprint);
  });
}

function resultCounts(deltas: OperationalDelta[]): Record<OperationalDeltaCategory, number> {
  const counts = { ...EMPTY_COUNTS };
  deltas.forEach((delta) => {
    counts[delta.category] += 1;
  });
  return counts;
}

function resultSummary(
  status: OperationalDeltaResultStatus,
  baselineKind: OperationalDeltaBaselineKind,
  deltas: OperationalDelta[],
  suppressedCount: number,
): string {
  const baselineLabel = baselineKind.replace(/_/g, ' ');
  if (status === 'no_baseline') return `No ${baselineLabel} baseline is available yet.`;
  if (status === 'baseline_mismatch') return `The ${baselineLabel} baseline belongs to a different route or expedition.`;
  if (status === 'invalid_baseline') return `The ${baselineLabel} baseline has an invalid timestamp or schema.`;
  if (status === 'invalid_current') return 'The current operational snapshot is invalid.';
  if (deltas.length === 0) {
    return suppressedCount > 0
      ? `No unacknowledged material changes since ${baselineLabel}.`
      : `No material operational changes since ${baselineLabel}.`;
  }

  const critical = deltas.filter((delta) => delta.severity === 'critical').length;
  const worsened = deltas.filter((delta) =>
    delta.category === 'new_blocker' ||
    delta.category === 'worsened_condition' ||
    delta.category === 'newly_stale' ||
    delta.category === 'unknown'
  ).length;
  const improved = deltas.filter((delta) =>
    delta.category === 'improved_condition' || delta.category === 'restored_source'
  ).length;
  const parts = [
    `${deltas.length} material change${deltas.length === 1 ? '' : 's'} since ${baselineLabel}`,
    critical > 0 ? `${critical} critical` : null,
    worsened > 0 ? `${worsened} need attention` : null,
    improved > 0 ? `${improved} improved` : null,
  ].filter((part): part is string => Boolean(part));
  return `${parts.join('; ')}. ${deltas[0].summary}`;
}

function invalidSnapshot(snapshot: OperationalSnapshot | null | undefined): boolean {
  return !snapshot ||
    snapshot.schemaVersion !== OPERATIONAL_DELTA_SCHEMA_VERSION ||
    !validIso(snapshot.capturedAt) ||
    !Array.isArray(snapshot.facts);
}

function snapshotsMismatch(previous: OperationalSnapshot, current: OperationalSnapshot): boolean {
  if (previous.expeditionId && current.expeditionId && previous.expeditionId !== current.expeditionId) return true;
  if (previous.routeId && current.routeId && previous.routeId !== current.routeId) return true;
  return false;
}

function emptyResult(
  input: BuildOperationalDeltaInput,
  status: OperationalDeltaResultStatus,
  warning: string,
): OperationalDeltaResult {
  return {
    status,
    baselineKind: input.baselineKind,
    baseline: input.baseline ?? null,
    current: input.current,
    deltas: [],
    allDeltas: [],
    suppressedCount: 0,
    counts: { ...EMPTY_COUNTS },
    highestSeverity: null,
    summary: resultSummary(status, input.baselineKind, [], 0),
    warnings: [warning],
  };
}

export function buildOperationalDeltaResult(input: BuildOperationalDeltaInput): OperationalDeltaResult {
  if (invalidSnapshot(input.current)) {
    return emptyResult(input, 'invalid_current', 'Current operational snapshot is invalid; no delta claims were produced.');
  }
  if (!input.baseline) {
    return emptyResult(input, 'no_baseline', `No ${input.baselineKind.replace(/_/g, ' ')} baseline exists.`);
  }
  if (invalidSnapshot(input.baseline)) {
    return emptyResult(input, 'invalid_baseline', 'The selected baseline is invalid; no delta claims were produced.');
  }
  if (snapshotsMismatch(input.baseline, input.current)) {
    return emptyResult(input, 'baseline_mismatch', 'The selected baseline does not match the current route or expedition.');
  }

  const previousFacts = normalizeFacts(input.baseline);
  const currentFacts = normalizeFacts(input.current);
  const factIds = Array.from(new Set([...previousFacts.keys(), ...currentFacts.keys()])).sort();
  const candidates: OperationalDelta[] = [];
  const seenSourceQualityTransitions = new Set<string>();

  factIds.forEach((factId) => {
    const pair = counterpartFacts(
      factId,
      previousFacts.get(factId),
      currentFacts.get(factId),
      input.baseline!.capturedAt,
      input.current.capturedAt,
    );
    if (!pair) return;
    if (previousFacts.has(factId) && currentFacts.has(factId)) {
      const quality = sourceQualityDelta(pair.previous, pair.current, input.baseline!, input.current);
      if (quality) {
        const qualityKey = stableStringify({
          sourceId: quality.sourceTruth.id,
          policyKey: quality.freshnessPolicyKey,
          category: quality.category,
          previousFreshness: quality.evidence.previous.freshness,
          currentFreshness: quality.evidence.current.freshness,
          previousAvailability: quality.evidence.previous.availability,
          currentAvailability: quality.evidence.current.availability,
          previousConflict: quality.evidence.previous.conflict,
          currentConflict: quality.evidence.current.conflict,
          previousWarnings: quality.evidence.previous.warningCodes,
          currentWarnings: quality.evidence.current.warningCodes,
        });
        if (!seenSourceQualityTransitions.has(qualityKey)) {
          seenSourceQualityTransitions.add(qualityKey);
          candidates.push(quality);
        }
      }
    }
    const value = valueDelta(pair.previous, pair.current, input.baseline!, input.current);
    if (value) candidates.push(value);
  });

  const allDeltas = sortDeltas(candidates);
  const suppressed = new Set(input.suppressedFingerprints ?? []);
  const deltas = allDeltas.filter((delta) => !suppressed.has(delta.fingerprint));
  const suppressedCount = allDeltas.length - deltas.length;
  const counts = resultCounts(deltas);

  return {
    status: 'ready',
    baselineKind: input.baselineKind,
    baseline: input.baseline,
    current: input.current,
    deltas,
    allDeltas,
    suppressedCount,
    counts,
    highestSeverity: deltas[0]?.severity ?? null,
    summary: resultSummary('ready', input.baselineKind, deltas, suppressedCount),
    warnings: [],
  };
}

/**
 * AI copy is never used for safety-critical results. Informational candidates
 * must retain every delta in exact priority order and reproduce deterministic
 * ECS copy; free-form claims fail closed.
 */
export function guardOperationalDeltaAiSummary(
  result: OperationalDeltaResult,
  candidate: OperationalDeltaAiSummaryCandidate | null | undefined,
): OperationalDeltaAiSummaryGuardResult {
  if (!candidate) {
    return { accepted: false, summary: result.summary, reason: 'No AI summary candidate was supplied.' };
  }
  if (result.deltas.some((delta) => delta.severity === 'critical' || delta.severity === 'caution')) {
    return {
      accepted: false,
      summary: result.summary,
      reason: 'Safety-critical operational deltas must use deterministic ECS copy.',
    };
  }
  const expected = result.deltas.map((delta) => delta.fingerprint);
  if (stableStringify(expected) !== stableStringify(candidate.orderedFingerprints)) {
    return {
      accepted: false,
      summary: result.summary,
      reason: 'AI candidate added, removed, or reordered deterministic deltas.',
    };
  }
  const summary = String(candidate.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!summary) {
    return { accepted: false, summary: result.summary, reason: 'AI summary candidate was empty.' };
  }
  if (summary !== result.summary.replace(/\s+/g, ' ').trim()) {
    return {
      accepted: false,
      summary: result.summary,
      reason: 'AI candidate changed deterministic Operational Delta meaning or copy.',
    };
  }
  return { accepted: true, summary, reason: null };
}
