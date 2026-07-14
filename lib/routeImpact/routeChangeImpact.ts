import {
  aggregateSourceTruthEvaluations,
  evaluateSourceTruthRef,
  type SourceTruthAssessment,
  type SourceTruthEvaluation,
  type SourceTruthPolicyKey,
  type SourceTruthRef,
} from '../sourceTruth';

export type RouteImpactOutcome = 'improves' | 'mixed' | 'worsens' | 'unknown';
export type RouteImpactDirection = 'improves' | 'unchanged' | 'worsens' | 'unknown';
export type RouteImpactMateriality = 'material' | 'not_material' | 'unknown';
export type RouteImpactPreference = 'higher_is_better' | 'lower_is_better';

export type RouteImpactCategory =
  | 'distance'
  | 'drive_time'
  | 'arrival_time'
  | 'daylight_margin'
  | 'fuel_margin'
  | 'water_margin'
  | 'power_runtime'
  | 'camp_viability'
  | 'vehicle_fit'
  | 'trailer_fit'
  | 'terrain_exposure'
  | 'legal_access'
  | 'current_conditions'
  | 'weather_exposure'
  | 'offline_coverage'
  | 'bailout_access'
  | 'resupply_opportunities'
  | 'convoy_eta_spread'
  | 'source_quality';

export type RouteImpactPlanKind =
  | 'active'
  | 'baseline'
  | 'alternate'
  | 'detour'
  | 'bailout'
  | 'closure_workaround'
  | 'route_builder';

export interface RouteImpactThreshold {
  absolute: number;
  label: string;
}

export interface RouteImpactMeasure {
  value: number | null;
  displayValue: string | null;
  unit?: string | null;
  preference: RouteImpactPreference;
  sourceTruth: SourceTruthRef;
  freshnessPolicyKey: SourceTruthPolicyKey;
  missingInputs: string[];
  requiredForSafety?: boolean;
  detail?: string | null;
}

export interface RouteImpactPlan {
  id: string;
  label: string;
  kind: RouteImpactPlanKind;
  geometryFingerprint?: string | null;
  measures: Partial<Record<RouteImpactCategory, RouteImpactMeasure>>;
  warnings?: string[];
}

export interface CompareRoutePlansInput {
  baseline: RouteImpactPlan;
  candidate: RouteImpactPlan;
  now?: string | number | Date | null;
}

export interface RouteImpactSourceComparison {
  baseline: SourceTruthEvaluation | null;
  candidate: SourceTruthEvaluation | null;
}

export interface RouteImpactCategoryResult {
  category: RouteImpactCategory;
  label: string;
  baselineValue: number | null;
  baselineDisplay: string;
  candidateValue: number | null;
  candidateDisplay: string;
  direction: RouteImpactDirection;
  materiality: RouteImpactMateriality;
  reason: string;
  threshold: RouteImpactThreshold | null;
  sourceTruth: RouteImpactSourceComparison;
  missingInputs: string[];
  requiredForSafety: boolean;
}

export interface RouteImpactResult {
  schemaVersion: 1;
  fingerprint: string;
  generatedAt: string;
  baselineId: string;
  baselineLabel: string;
  candidateId: string;
  candidateLabel: string;
  outcome: RouteImpactOutcome;
  headline: string;
  summary: string;
  categories: RouteImpactCategoryResult[];
  materialCategories: RouteImpactCategoryResult[];
  unknownCategories: RouteImpactCategoryResult[];
  requiredUnknownCategories: RouteImpactCategory[];
  sourceSummary: {
    baseline: SourceTruthAssessment;
    candidate: SourceTruthAssessment;
  };
  warnings: string[];
  mutationAllowed: false;
}

type CategoryConfig = {
  label: string;
  threshold: RouteImpactThreshold;
};

export const ROUTE_IMPACT_THRESHOLDS: Record<Exclude<RouteImpactCategory, 'source_quality'>, RouteImpactThreshold> = {
  distance: { absolute: 1609.344, label: '1 mi' },
  drive_time: { absolute: 300, label: '5 min' },
  arrival_time: { absolute: 300, label: '5 min' },
  daylight_margin: { absolute: 10, label: '10 min' },
  fuel_margin: { absolute: 5, label: '5 mi' },
  water_margin: { absolute: 1, label: '1 gal' },
  power_runtime: { absolute: 0.5, label: '30 min' },
  camp_viability: { absolute: 1, label: 'one viability level' },
  vehicle_fit: { absolute: 1, label: 'one fit level' },
  trailer_fit: { absolute: 1, label: 'one fit level' },
  terrain_exposure: { absolute: 1, label: 'one exposure level' },
  legal_access: { absolute: 1, label: 'one confidence level' },
  current_conditions: { absolute: 1, label: 'one condition level' },
  weather_exposure: { absolute: 1, label: 'one exposure level' },
  offline_coverage: { absolute: 5, label: '5 percentage points' },
  bailout_access: { absolute: 1, label: 'one access level' },
  resupply_opportunities: { absolute: 1, label: 'one opportunity' },
  convoy_eta_spread: { absolute: 300, label: '5 min' },
};

const CATEGORY_CONFIG: Record<Exclude<RouteImpactCategory, 'source_quality'>, CategoryConfig> = {
  distance: { label: 'Distance', threshold: ROUTE_IMPACT_THRESHOLDS.distance },
  drive_time: { label: 'Estimated Drive Time', threshold: ROUTE_IMPACT_THRESHOLDS.drive_time },
  arrival_time: { label: 'Arrival Time', threshold: ROUTE_IMPACT_THRESHOLDS.arrival_time },
  daylight_margin: { label: 'Daylight Margin', threshold: ROUTE_IMPACT_THRESHOLDS.daylight_margin },
  fuel_margin: { label: 'Fuel Margin', threshold: ROUTE_IMPACT_THRESHOLDS.fuel_margin },
  water_margin: { label: 'Water Margin', threshold: ROUTE_IMPACT_THRESHOLDS.water_margin },
  power_runtime: { label: 'Power Runtime', threshold: ROUTE_IMPACT_THRESHOLDS.power_runtime },
  camp_viability: { label: 'Camp Endpoint Viability', threshold: ROUTE_IMPACT_THRESHOLDS.camp_viability },
  vehicle_fit: { label: 'Vehicle Fit', threshold: ROUTE_IMPACT_THRESHOLDS.vehicle_fit },
  trailer_fit: { label: 'Trailer Fit', threshold: ROUTE_IMPACT_THRESHOLDS.trailer_fit },
  terrain_exposure: { label: 'Terrain Exposure', threshold: ROUTE_IMPACT_THRESHOLDS.terrain_exposure },
  legal_access: { label: 'Legal / Access Evidence', threshold: ROUTE_IMPACT_THRESHOLDS.legal_access },
  current_conditions: { label: 'Current Conditions / Closures', threshold: ROUTE_IMPACT_THRESHOLDS.current_conditions },
  weather_exposure: { label: 'Weather Exposure', threshold: ROUTE_IMPACT_THRESHOLDS.weather_exposure },
  offline_coverage: { label: 'Offline Route Coverage', threshold: ROUTE_IMPACT_THRESHOLDS.offline_coverage },
  bailout_access: { label: 'Bailout / Recovery Access', threshold: ROUTE_IMPACT_THRESHOLDS.bailout_access },
  resupply_opportunities: { label: 'Resupply Opportunities', threshold: ROUTE_IMPACT_THRESHOLDS.resupply_opportunities },
  convoy_eta_spread: { label: 'Convoy ETA Spread', threshold: ROUTE_IMPACT_THRESHOLDS.convoy_eta_spread },
};

export const ROUTE_IMPACT_CATEGORY_ORDER: readonly RouteImpactCategory[] = [
  'distance',
  'drive_time',
  'arrival_time',
  'daylight_margin',
  'fuel_margin',
  'water_margin',
  'power_runtime',
  'camp_viability',
  'vehicle_fit',
  'trailer_fit',
  'terrain_exposure',
  'legal_access',
  'current_conditions',
  'weather_exposure',
  'offline_coverage',
  'bailout_access',
  'resupply_opportunities',
  'convoy_eta_spread',
  'source_quality',
] as const;

const CACHE_LIMIT = 32;
const comparisonCache = new Map<string, RouteImpactResult>();

function parseNow(value: CompareRoutePlansInput['now']): number {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : Date.now();
  if (typeof value === 'number') return Number.isFinite(value) ? value : Date.now();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }
  return Date.now();
}

function dedupe(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = typeof value === 'string' ? value.trim() : '';
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function display(measure: RouteImpactMeasure | undefined): string {
  if (!measure) return 'Unknown';
  if (measure.displayValue?.trim()) return measure.displayValue.trim();
  if (!finite(measure.value)) return 'Unknown';
  return `${Number(measure.value.toFixed(1))}${measure.unit ? ` ${measure.unit}` : ''}`;
}

function sourceIsUnusableForComparison(
  evaluation: SourceTruthEvaluation,
  requiredForSafety: boolean,
): boolean {
  if (evaluation.conflict || evaluation.availability === 'unavailable') return true;
  if (!requiredForSafety) return false;
  return evaluation.freshness === 'stale' ||
    evaluation.freshness === 'expired' ||
    evaluation.freshness === 'unavailable';
}

function unavailableReason(
  label: string,
  baseline: RouteImpactMeasure | undefined,
  candidate: RouteImpactMeasure | undefined,
  baselineSource: SourceTruthEvaluation | null,
  candidateSource: SourceTruthEvaluation | null,
  missingInputs: string[],
  requiredForSafety: boolean,
): string {
  if (missingInputs.length > 0) {
    return `${label} is unknown because ${missingInputs.join('; ')}.`;
  }
  if (!baseline || !candidate || !finite(baseline.value) || !finite(candidate.value)) {
    return `${label} is unknown because comparable baseline and candidate values are not both available.`;
  }
  if (baselineSource?.conflict || candidateSource?.conflict) {
    return `${label} is unknown because its source evidence is conflicting.`;
  }
  const unusable = [baselineSource, candidateSource].find(
    (source): source is SourceTruthEvaluation =>
      !!source && sourceIsUnusableForComparison(source, requiredForSafety),
  );
  if (unusable) {
    return `${label} is unknown because ${unusable.ref.id} is ${unusable.freshness} or unavailable under the ${unusable.policy.label} policy.`;
  }
  return `${label} cannot be compared from the available evidence.`;
}

function compareCategory(
  category: Exclude<RouteImpactCategory, 'source_quality'>,
  baseline: RouteImpactMeasure | undefined,
  candidate: RouteImpactMeasure | undefined,
  nowMs: number,
): RouteImpactCategoryResult {
  const config = CATEGORY_CONFIG[category];
  const baselineSource = baseline
    ? evaluateSourceTruthRef(baseline.sourceTruth, {
        policyKey: baseline.freshnessPolicyKey,
        now: nowMs,
      })
    : null;
  const candidateSource = candidate
    ? evaluateSourceTruthRef(candidate.sourceTruth, {
        policyKey: candidate.freshnessPolicyKey,
        now: nowMs,
      })
    : null;
  const requiredForSafety = baseline?.requiredForSafety === true || candidate?.requiredForSafety === true;
  const missingInputs = dedupe([
    ...(baseline?.missingInputs ?? []),
    ...(candidate?.missingInputs ?? []),
  ]);
  const comparable =
    !!baseline &&
    !!candidate &&
    finite(baseline.value) &&
    finite(candidate.value) &&
    missingInputs.length === 0 &&
    !!baselineSource &&
    !!candidateSource &&
    !sourceIsUnusableForComparison(baselineSource, requiredForSafety) &&
    !sourceIsUnusableForComparison(candidateSource, requiredForSafety);

  if (!comparable) {
    return {
      category,
      label: config.label,
      baselineValue: baseline?.value ?? null,
      baselineDisplay: display(baseline),
      candidateValue: candidate?.value ?? null,
      candidateDisplay: display(candidate),
      direction: 'unknown',
      materiality: 'unknown',
      reason: unavailableReason(
        config.label,
        baseline,
        candidate,
        baselineSource,
        candidateSource,
        missingInputs,
        requiredForSafety,
      ),
      threshold: config.threshold,
      sourceTruth: { baseline: baselineSource, candidate: candidateSource },
      missingInputs,
      requiredForSafety,
    };
  }

  const baselineValue = baseline.value as number;
  const candidateValue = candidate.value as number;
  const delta = candidateValue - baselineValue;
  const magnitude = Math.abs(delta);
  const material = magnitude >= config.threshold.absolute;
  const rawImproves = candidate.preference === 'higher_is_better' ? delta > 0 : delta < 0;
  const direction: RouteImpactDirection = !material || delta === 0
    ? 'unchanged'
    : rawImproves
      ? 'improves'
      : 'worsens';
  const baselineDisplay = display(baseline);
  const candidateDisplay = display(candidate);
  const reason = direction === 'unchanged'
    ? `${config.label} changes from ${baselineDisplay} to ${candidateDisplay}, below the ${config.threshold.label} materiality threshold.`
    : `${config.label} changes from ${baselineDisplay} to ${candidateDisplay}, which ${direction} the route posture.`;

  return {
    category,
    label: config.label,
    baselineValue,
    baselineDisplay,
    candidateValue,
    candidateDisplay,
    direction,
    materiality: material ? 'material' : 'not_material',
    reason,
    threshold: config.threshold,
    sourceTruth: { baseline: baselineSource, candidate: candidateSource },
    missingInputs,
    requiredForSafety,
  };
}

function sourceScore(assessment: SourceTruthAssessment): number | null {
  if (assessment.sources.length === 0) return null;
  const freshness = { unavailable: 0, expired: 1, stale: 2, recent: 3, live: 4 }[assessment.freshness];
  const confidence = { unknown: 0, low: 1, medium: 2, high: 3 }[assessment.confidence];
  const availability = { unavailable: 0, degraded: 1, usable: 2 }[assessment.availability];
  const coverage = { unknown: 0, partial: 1, complete: 2 }[assessment.coverage];
  return freshness + confidence + availability + coverage - (assessment.conflict ? 4 : 0);
}

function aggregateSourceEvaluations(
  sourcesInput: Array<SourceTruthEvaluation | null>,
): SourceTruthAssessment {
  const seen = new Set<string>();
  const sources = sourcesInput.filter((source): source is SourceTruthEvaluation => {
    if (!source) return false;
    const key = `${source.ref.id}:${source.policy.key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return aggregateSourceTruthEvaluations(sources);
}

function sourceQualityCategory(
  baseline: SourceTruthAssessment,
  candidate: SourceTruthAssessment,
): RouteImpactCategoryResult {
  const baselineScore = sourceScore(baseline);
  const candidateScore = sourceScore(candidate);
  const comparable = baselineScore != null && candidateScore != null;
  const delta = comparable ? candidateScore - baselineScore : null;
  const direction: RouteImpactDirection = delta == null
    ? 'unknown'
    : delta > 0
      ? 'improves'
      : delta < 0
        ? 'worsens'
        : 'unchanged';
  const materiality: RouteImpactMateriality = delta == null
    ? 'unknown'
    : delta === 0
      ? 'not_material'
      : 'material';
  const describe = (assessment: SourceTruthAssessment) =>
    assessment.sources.length === 0
      ? 'Unknown'
      : `${assessment.freshness}, ${assessment.confidence} confidence${assessment.conflict ? ', conflict' : ''}`;

  return {
    category: 'source_quality',
    label: 'Source Quality',
    baselineValue: baselineScore,
    baselineDisplay: describe(baseline),
    candidateValue: candidateScore,
    candidateDisplay: describe(candidate),
    direction,
    materiality,
    reason: direction === 'unknown'
      ? 'Source quality is unknown because one route has no evaluable source evidence.'
      : direction === 'unchanged'
        ? 'Source freshness, availability, coverage, confidence, and conflict posture are equivalent.'
        : `Candidate source quality ${direction} after freshness, availability, coverage, confidence, and conflicts are evaluated separately.`,
    threshold: null,
    sourceTruth: {
      baseline: baseline.sources[0] ?? null,
      candidate: candidate.sources[0] ?? null,
    },
    missingInputs: [],
    requiredForSafety: false,
  };
}

function resultOutcome(categories: RouteImpactCategoryResult[]): RouteImpactOutcome {
  const operational = categories.filter((item) => item.category !== 'source_quality');
  const material = operational.filter((item) => item.materiality === 'material');
  const hasImprovement = material.some((item) => item.direction === 'improves');
  const hasWorsening = material.some((item) => item.direction === 'worsens');
  const requiredUnknown = operational.some(
    (item) => item.requiredForSafety && item.direction === 'unknown',
  );

  if (hasImprovement && hasWorsening) return 'mixed';
  if (hasWorsening) return 'worsens';
  if (hasImprovement) return requiredUnknown ? 'unknown' : 'improves';
  if (requiredUnknown || operational.some((item) => item.direction === 'unknown')) return 'unknown';
  return 'mixed';
}

function outcomeCopy(outcome: RouteImpactOutcome, categories: RouteImpactCategoryResult[]) {
  const improves = categories.filter((item) => item.materiality === 'material' && item.direction === 'improves');
  const worsens = categories.filter((item) => item.materiality === 'material' && item.direction === 'worsens');
  const requiredUnknown = categories.filter(
    (item) => item.requiredForSafety && item.direction === 'unknown',
  );
  if (outcome === 'improves') {
    return {
      headline: 'Operational posture improves',
      summary: `${improves.length} material categor${improves.length === 1 ? 'y improves' : 'ies improve'} with no known material regression or required safety gap.`,
    };
  }
  if (outcome === 'worsens') {
    return {
      headline: 'Operational posture worsens',
      summary: `${worsens.length} material categor${worsens.length === 1 ? 'y worsens' : 'ies worsen'}. Review the deterministic impacts before saving or staging this route.`,
    };
  }
  if (outcome === 'mixed') {
    const hasMaterial = improves.length + worsens.length > 0;
    return {
      headline: hasMaterial ? 'Operational tradeoffs are mixed' : 'No material operational change',
      summary: hasMaterial
        ? `${improves.length} categor${improves.length === 1 ? 'y improves' : 'ies improve'} and ${worsens.length} categor${worsens.length === 1 ? 'y worsens' : 'ies worsen'}.`
        : 'Available comparable values remain inside the centralized materiality thresholds.',
    };
  }
  return {
    headline: 'Operational impact remains unknown',
    summary: requiredUnknown.length > 0
      ? `${requiredUnknown.length} required safety categor${requiredUnknown.length === 1 ? 'y lacks' : 'ies lack'} comparable current evidence. ECS will not call this route safer.`
      : 'The baseline and candidate do not contain enough comparable evidence for an operational conclusion.',
  };
}

function hash(value: string): string {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return (output >>> 0).toString(36);
}

function buildFingerprint(
  input: CompareRoutePlansInput,
  categories: RouteImpactCategoryResult[],
): string {
  const semantic = categories.map((item) => [
    item.category,
    item.baselineValue,
    item.candidateValue,
    item.direction,
    item.materiality,
    item.requiredForSafety,
    item.sourceTruth.baseline?.freshness ?? 'none',
    item.sourceTruth.candidate?.freshness ?? 'none',
    item.sourceTruth.baseline?.conflict ?? false,
    item.sourceTruth.candidate?.conflict ?? false,
    item.missingInputs.slice().sort(),
  ]);
  return `route-impact:${hash(JSON.stringify([
    input.baseline.id,
    input.baseline.geometryFingerprint ?? null,
    input.candidate.id,
    input.candidate.geometryFingerprint ?? null,
    semantic,
  ]))}`;
}

function cacheResult(result: RouteImpactResult): RouteImpactResult {
  const existing = comparisonCache.get(result.fingerprint);
  if (existing) return existing;
  comparisonCache.set(result.fingerprint, result);
  while (comparisonCache.size > CACHE_LIMIT) {
    const oldest = comparisonCache.keys().next().value as string | undefined;
    if (!oldest) break;
    comparisonCache.delete(oldest);
  }
  return result;
}

export function clearRouteImpactComparisonCache(): void {
  comparisonCache.clear();
}

export function compareRoutePlans(input: CompareRoutePlansInput): RouteImpactResult {
  const nowMs = parseNow(input.now);
  const supportedCategories = ROUTE_IMPACT_CATEGORY_ORDER.filter(
    (category): category is Exclude<RouteImpactCategory, 'source_quality'> =>
      category !== 'source_quality' &&
      (!!input.baseline.measures[category] || !!input.candidate.measures[category]),
  );
  const categories = supportedCategories.map((category) =>
    compareCategory(
      category,
      input.baseline.measures[category],
      input.candidate.measures[category],
      nowMs,
    ),
  );
  const baselineSourceSummary = aggregateSourceEvaluations(
    categories.map((category) => category.sourceTruth.baseline),
  );
  const candidateSourceSummary = aggregateSourceEvaluations(
    categories.map((category) => category.sourceTruth.candidate),
  );
  categories.push(sourceQualityCategory(baselineSourceSummary, candidateSourceSummary));

  const outcome = resultOutcome(categories);
  const copy = outcomeCopy(outcome, categories);
  const fingerprint = buildFingerprint(input, categories);
  const warnings = dedupe([
    ...(input.baseline.warnings ?? []),
    ...(input.candidate.warnings ?? []),
    ...categories.flatMap((item) => item.missingInputs),
    ...baselineSourceSummary.warningCodes,
    ...candidateSourceSummary.warningCodes,
  ]);

  return cacheResult({
    schemaVersion: 1,
    fingerprint,
    generatedAt: new Date(nowMs).toISOString(),
    baselineId: input.baseline.id,
    baselineLabel: input.baseline.label,
    candidateId: input.candidate.id,
    candidateLabel: input.candidate.label,
    outcome,
    headline: copy.headline,
    summary: copy.summary,
    categories,
    materialCategories: categories.filter((item) => item.materiality === 'material'),
    unknownCategories: categories.filter((item) => item.direction === 'unknown'),
    requiredUnknownCategories: categories
      .filter((item) => item.requiredForSafety && item.direction === 'unknown')
      .map((item) => item.category),
    sourceSummary: {
      baseline: baselineSourceSummary,
      candidate: candidateSourceSummary,
    },
    warnings,
    mutationAllowed: false,
  });
}
