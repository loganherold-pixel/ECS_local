import {
  evaluateSourceTruthRef,
  sanitizeSourceTruthDisplayText,
  sanitizeSourceTruthRef,
  type SourceTruthRef,
} from '../sourceTruth';
import type {
  CalibrationAdjustmentKind,
  CalibrationAnalysis,
  CalibrationConfidence,
  CalibrationProposal,
  ForecastActualRecord,
  PostTripInspectionCategory,
  PostTripInspectionPrompt,
  QualifiedTripSample,
  TripExposureObservation,
  TripLearningMetric,
  TripLearningValueUnit,
  TripSampleQualificationResult,
  TripSampleRejectionCode,
} from './tripLearningTypes';

export const TRIP_LEARNING_MIN_SAMPLE_COUNT = 3;

export const TRIP_LEARNING_MATERIAL_THRESHOLDS: Record<TripLearningMetric, number> = {
  drive_time: 0.08,
  fuel_consumption: 0.1,
  power_runtime: 0.1,
  camp_arrival: 10,
};

export const TRIP_LEARNING_MAX_VARIANCE_STANDARD_DEVIATION: Record<TripLearningMetric, number> = {
  drive_time: 0.2,
  fuel_consumption: 0.25,
  power_runtime: 0.25,
  camp_arrival: 30,
};

const EXPECTED_UNITS: Record<TripLearningMetric, TripLearningValueUnit> = {
  drive_time: 'seconds',
  fuel_consumption: 'gallons',
  power_runtime: 'hours',
  camp_arrival: 'epoch_minutes',
};

const ACTUAL_CAPTURE_LAG_MS: Record<TripLearningMetric, number> = {
  drive_time: 30 * 60_000,
  fuel_consumption: 2 * 60 * 60_000,
  power_runtime: 2 * 60 * 60_000,
  camp_arrival: 30 * 60_000,
};

const REJECTED_WARNING_CODES = new Set([
  'stale_source',
  'expired_source',
  'source_unavailable',
  'materially_stale',
  'corrupted_sample',
  'mocked_sample',
  'simulated_sample',
]);

type QualificationOptions = {
  existingFingerprints?: Iterable<string>;
};

type CalibrationOptions = {
  now?: string | null;
};

function compactId(value: unknown, fallback: string): string {
  const safe = sanitizeSourceTruthDisplayText(value, 96);
  if (!safe || safe === '[redacted]') return fallback;
  return safe.replace(/[^a-zA-Z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function compactLabel(value: unknown, fallback: string): string {
  const safe = sanitizeSourceTruthDisplayText(value, 180);
  return !safe || safe === '[redacted]' ? fallback : safe;
}

function validDate(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, places = 6): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function sampleFingerprint(record: ForecastActualRecord): string {
  return `trip-sample:${hashText([
    record.tripId,
    record.metric,
    record.forecast.value.toFixed(6),
    record.actual.value.toFixed(6),
    record.forecast.observedAt,
    record.actual.observedAt,
  ].join('|'))}`;
}

function reject(
  recordId: string,
  code: TripSampleRejectionCode,
  reason: string,
): TripSampleQualificationResult['rejected'][number] {
  return { recordId, code, reason };
}

function hasRejectedQualityFlag(record: ForecastActualRecord): TripSampleRejectionResult | null {
  if (record.qualityFlags.includes('incomplete')) {
    return { code: 'incomplete', reason: 'Required forecast or actual data is incomplete.' };
  }
  if (record.qualityFlags.includes('mocked') || record.qualityFlags.includes('simulated')) {
    return { code: 'mocked_or_simulated', reason: 'Mocked and simulated outcomes cannot qualify as trip-learning actuals.' };
  }
  if (record.qualityFlags.includes('corrupted')) {
    return { code: 'corrupted', reason: 'The recorded outcome is marked corrupted.' };
  }
  if (record.qualityFlags.includes('materially_stale')) {
    return { code: 'actual_timestamp_stale_at_capture', reason: 'The actual was materially stale when captured.' };
  }
  if (record.qualityFlags.includes('manual_unverified')) {
    return { code: 'manual_actual_unverified', reason: 'A manual actual requires explicit verification.' };
  }
  return null;
}

type TripSampleRejectionResult = {
  code: TripSampleRejectionCode;
  reason: string;
};

function validateActualSource(record: ForecastActualRecord): TripSampleRejectionResult | null {
  const actual = sanitizeSourceTruthRef(record.actual.sourceTruth);
  if (actual.origin === 'simulated') {
    return { code: 'mocked_or_simulated', reason: 'Simulated source truth cannot qualify as an actual outcome.' };
  }
  if (actual.origin === 'unavailable' || actual.availability === 'unavailable') {
    return { code: 'actual_unavailable', reason: 'The actual outcome source is unavailable.' };
  }
  if (actual.availability !== 'usable') {
    return { code: 'actual_unavailable', reason: 'The actual outcome source is degraded or only partially usable.' };
  }
  if (actual.confidence !== 'high') {
    return { code: 'actual_confidence_not_high', reason: 'Only high-confidence actual outcomes qualify.' };
  }
  if (actual.coverage !== 'complete') {
    return { code: 'actual_coverage_incomplete', reason: 'Actual outcome coverage must be complete.' };
  }
  if (actual.conflict === true) {
    return { code: 'actual_conflict', reason: 'Conflicting actual outcomes cannot qualify.' };
  }
  if (actual.origin === 'manual' && !actual.warningCodes.includes('verified_manual_actual')) {
    return { code: 'manual_actual_unverified', reason: 'Manual actuals qualify only after explicit verification.' };
  }
  if (actual.warningCodes.some((code) => REJECTED_WARNING_CODES.has(code))) {
    return { code: 'actual_timestamp_stale_at_capture', reason: 'The actual source was stale, expired, unavailable, or invalid at capture.' };
  }

  const observedAt = validDate(record.actual.observedAt) ?? validDate(actual.observedAt);
  const tripStartedAt = validDate(record.tripStartedAt);
  const tripEndedAt = validDate(record.tripEndedAt);
  const createdAt = validDate(record.createdAt);
  if (!observedAt || !tripStartedAt || !tripEndedAt || !createdAt) {
    return { code: 'actual_timestamp_invalid', reason: 'Actual, completion, and record timestamps must be valid.' };
  }

  const observedMs = Date.parse(observedAt);
  const tripStartedMs = Date.parse(tripStartedAt);
  const tripEndedMs = Date.parse(tripEndedAt);
  const createdMs = Date.parse(createdAt);
  if (tripEndedMs < tripStartedMs) {
    return { code: 'actual_timestamp_invalid', reason: 'Trip completion cannot precede trip departure.' };
  }
  if (observedMs > createdMs + 5 * 60_000) {
    return { code: 'actual_timestamp_invalid', reason: 'The actual timestamp is implausibly in the future.' };
  }
  if (Math.abs(tripEndedMs - observedMs) > ACTUAL_CAPTURE_LAG_MS[record.metric]) {
    return { code: 'actual_timestamp_stale_at_capture', reason: 'The actual observation is too far from trip completion for this metric.' };
  }

  const evaluation = evaluateSourceTruthRef(actual, {
    policyKey: record.actual.freshnessPolicyKey,
    now: tripEndedAt,
  });
  if (evaluation.freshness === 'stale' || evaluation.freshness === 'expired' || evaluation.freshness === 'unavailable') {
    return { code: 'actual_timestamp_stale_at_capture', reason: 'The actual source was not fresh enough at trip completion.' };
  }
  return null;
}

function validateForecastSource(record: ForecastActualRecord): TripSampleRejectionResult | null {
  const forecast = sanitizeSourceTruthRef(record.forecast.sourceTruth);
  if (
    forecast.origin === 'simulated' ||
    forecast.origin === 'unavailable' ||
    forecast.availability !== 'usable' ||
    (forecast.confidence !== 'high' && forecast.confidence !== 'medium') ||
    forecast.coverage === 'unknown' ||
    forecast.conflict === true ||
    forecast.warningCodes.includes('forecast_uses_defaults') ||
    forecast.warningCodes.some((code) => REJECTED_WARNING_CODES.has(code))
  ) {
    return { code: 'incomplete', reason: 'The forecast is not qualified source-backed planning evidence.' };
  }

  const forecastObservedAt = validDate(record.forecast.observedAt) ?? validDate(forecast.observedAt);
  const tripStartedAt = validDate(record.tripStartedAt);
  if (!forecastObservedAt || !tripStartedAt) {
    return { code: 'incomplete', reason: 'The forecast and trip-start timestamps must be valid.' };
  }
  if (Date.parse(forecastObservedAt) > Date.parse(tripStartedAt) + 5 * 60_000) {
    return { code: 'incomplete', reason: 'A forecast recorded after departure cannot qualify as the trip baseline.' };
  }
  const evaluation = evaluateSourceTruthRef(forecast, {
    policyKey: record.forecast.freshnessPolicyKey,
    now: tripStartedAt,
  });
  if (evaluation.freshness === 'stale' || evaluation.freshness === 'expired' || evaluation.freshness === 'unavailable') {
    return { code: 'incomplete', reason: 'The forecast was not fresh enough at departure.' };
  }
  return null;
}

function qualifyOne(record: ForecastActualRecord): QualifiedTripSample | TripSampleRejectionResult {
  const qualityFailure = hasRejectedQualityFlag(record);
  if (qualityFailure) return qualityFailure;

  const forecastValue = finite(record.forecast.value);
  const actualValue = finite(record.actual.value);
  const expectedUnit = EXPECTED_UNITS[record.metric];
  if (forecastValue == null || actualValue == null || forecastValue <= 0 || actualValue <= 0) {
    return { code: 'invalid_value', reason: 'Forecast and actual values must be finite positive numbers.' };
  }
  if (record.forecast.unit !== expectedUnit || record.actual.unit !== expectedUnit) {
    return { code: 'unit_mismatch', reason: `The ${record.metric} comparison must use ${expectedUnit}.` };
  }
  const forecastFailure = validateForecastSource(record);
  if (forecastFailure) return forecastFailure;

  const sourceFailure = validateActualSource(record);
  if (sourceFailure) return sourceFailure;

  const fingerprint = sampleFingerprint(record);
  const error = actualValue - forecastValue;
  return {
    schemaVersion: 'ecs.trip-learning.qualified-sample.v1',
    id: fingerprint,
    fingerprint,
    recordId: compactId(record.id, fingerprint),
    tripId: compactId(record.tripId, 'trip'),
    expeditionId: record.expeditionId ? compactId(record.expeditionId, 'expedition') : null,
    vehicleId: record.vehicleId ? compactId(record.vehicleId, 'vehicle') : null,
    routeClass: record.routeClass ? compactLabel(record.routeClass, 'unknown') : null,
    terrainClass: record.terrainClass ? compactLabel(record.terrainClass, 'unknown') : null,
    metric: record.metric,
    unit: expectedUnit,
    forecastValue: round(forecastValue),
    actualValue: round(actualValue),
    error: round(error),
    absoluteError: round(Math.abs(error)),
    relativeError: record.metric === 'camp_arrival' ? null : round(error / forecastValue),
    occurredAt: validDate(record.tripEndedAt) as string,
    confidence: 'high',
    forecastSourceTruth: sanitizeSourceTruthRef(record.forecast.sourceTruth),
    actualSourceTruth: sanitizeSourceTruthRef(record.actual.sourceTruth),
    forecastFreshnessPolicyKey: record.forecast.freshnessPolicyKey,
    actualFreshnessPolicyKey: record.actual.freshnessPolicyKey,
  };
}

export function qualifyForecastActualRecords(
  records: readonly ForecastActualRecord[],
  options: QualificationOptions = {},
): TripSampleQualificationResult {
  const accepted: QualifiedTripSample[] = [];
  const rejected: TripSampleQualificationResult['rejected'] = [];
  const fingerprints = new Set(options.existingFingerprints ?? []);

  records.forEach((record, index) => {
    const recordId = compactId(record?.id, `record-${index}`);
    if (!record || record.schemaVersion !== 'ecs.trip-learning.forecast-actual.v1') {
      rejected.push(reject(recordId, 'invalid_record', 'The forecast-versus-actual record is invalid.'));
      return;
    }
    const result = qualifyOne(record);
    if ('code' in result) {
      rejected.push(reject(recordId, result.code, result.reason));
      return;
    }
    if (fingerprints.has(result.fingerprint)) {
      rejected.push(reject(recordId, 'duplicate', 'This qualified sample is already present.'));
      return;
    }
    fingerprints.add(result.fingerprint);
    accepted.push(result);
  });

  return { accepted, rejected };
}

export function getCalibrationScopeKey(
  metric: TripLearningMetric,
  vehicleId: string | null | undefined,
  terrainClass: string | null | undefined,
): string {
  return [
    metric,
    vehicleId ? compactId(vehicleId, 'vehicle') : 'all-vehicles',
    terrainClass ? compactId(terrainClass, 'terrain') : 'all-terrain',
  ].join(':');
}

function adjustmentKind(metric: TripLearningMetric): CalibrationAdjustmentKind {
  if (metric === 'drive_time') return 'drive_time_multiplier';
  if (metric === 'fuel_consumption') return 'fuel_consumption_multiplier';
  if (metric === 'power_runtime') return 'power_runtime_multiplier';
  return 'camp_arrival_offset_minutes';
}

function calibrationConfidence(
  sampleCount: number,
  standardDeviation: number,
  maximum: number,
): CalibrationConfidence {
  if (sampleCount >= 6 && standardDeviation <= maximum * 0.5) return 'high';
  if (sampleCount >= TRIP_LEARNING_MIN_SAMPLE_COUNT && standardDeviation <= maximum) return 'medium';
  return 'low';
}

function capConfidenceBySources(
  confidence: CalibrationConfidence,
  samples: readonly QualifiedTripSample[],
): CalibrationConfidence {
  const rank: Record<CalibrationConfidence, number> = {
    unknown: 0,
    low: 1,
    medium: 2,
    high: 3,
  };
  const sourceConfidence = samples.reduce<CalibrationConfidence>((minimum, sample) => {
    const next = rank[sample.forecastSourceTruth.confidence] < rank[sample.actualSourceTruth.confidence]
      ? sample.forecastSourceTruth.confidence
      : sample.actualSourceTruth.confidence;
    return rank[next] < rank[minimum] ? next : minimum;
  }, 'high');
  return rank[sourceConfidence] < rank[confidence] ? sourceConfidence : confidence;
}

function proposedCalibrationValue(metric: TripLearningMetric, samples: readonly QualifiedTripSample[]): number {
  if (metric === 'camp_arrival') {
    return round(clamp(mean(samples.map((sample) => sample.error)), -120, 120), 3);
  }
  return round(clamp(mean(samples.map((sample) => sample.actualValue / sample.forecastValue)), 0.5, 1.75), 4);
}

function proposalSourceTruth(
  metric: TripLearningMetric,
  scopeKey: string,
  samples: readonly QualifiedTripSample[],
  confidence: CalibrationConfidence,
  warnings: string[],
  observedAt: string,
): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id: `trip-learning:${hashText(scopeKey)}`,
    origin: 'inferred',
    authority: 'ECS deterministic trip learning',
    provider: 'Local qualified trip samples',
    observedAt,
    fetchedAt: null,
    expiresAt: null,
    confidence,
    coverage: samples.every((sample) =>
      sample.forecastSourceTruth.coverage === 'complete' &&
      sample.actualSourceTruth.coverage === 'complete')
      ? 'complete'
      : 'partial',
    availability: confidence === 'low' ? 'degraded' : 'usable',
    conflict: false,
    warningCodes: unique([
      'local_only',
      'requires_explicit_confirmation',
      ...warnings,
      ...(metric === 'camp_arrival' ? ['arrival_offset_not_route_authority'] : []),
    ]),
  });
}

export function analyzeCalibrationSamples(
  inputSamples: readonly QualifiedTripSample[],
  options: CalibrationOptions = {},
): CalibrationAnalysis {
  const samples = [...inputSamples].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const first = samples[0];
  const metric = first?.metric ?? 'drive_time';
  const scopeKey = getCalibrationScopeKey(metric, first?.vehicleId, first?.terrainClass);
  if (samples.length < TRIP_LEARNING_MIN_SAMPLE_COUNT) {
    return {
      status: 'insufficient_samples',
      metric,
      scopeKey,
      sampleCount: samples.length,
      requiredSampleCount: TRIP_LEARNING_MIN_SAMPLE_COUNT,
      proposal: null,
      reason: `At least ${TRIP_LEARNING_MIN_SAMPLE_COUNT} qualified samples are required.`,
    };
  }

  const inconsistent = samples.some((sample) =>
    sample.metric !== metric ||
    getCalibrationScopeKey(sample.metric, sample.vehicleId, sample.terrainClass) !== scopeKey,
  );
  if (inconsistent) {
    return {
      status: 'insufficient_samples',
      metric,
      scopeKey,
      sampleCount: 0,
      requiredSampleCount: TRIP_LEARNING_MIN_SAMPLE_COUNT,
      proposal: null,
      reason: 'Calibration samples must share a metric, vehicle, and terrain scope.',
    };
  }

  const meanError = mean(samples.map((sample) => sample.error));
  const relativeErrors = samples
    .map((sample) => sample.relativeError)
    .filter((value): value is number => value != null);
  const comparisonValues = metric === 'camp_arrival'
    ? samples.map((sample) => sample.error)
    : relativeErrors;
  const meanRelativeError = metric === 'camp_arrival' ? null : mean(relativeErrors);
  const sampleVariance = variance(comparisonValues);
  const standardDeviation = Math.sqrt(sampleVariance);
  const materialValue = metric === 'camp_arrival'
    ? Math.abs(meanError)
    : Math.abs(meanRelativeError ?? 0);
  if (materialValue < TRIP_LEARNING_MATERIAL_THRESHOLDS[metric]) {
    return {
      status: 'no_material_change',
      metric,
      scopeKey,
      sampleCount: samples.length,
      requiredSampleCount: TRIP_LEARNING_MIN_SAMPLE_COUNT,
      proposal: null,
      reason: 'The observed error remains below the deterministic material-change threshold.',
    };
  }

  const maximumDeviation = TRIP_LEARNING_MAX_VARIANCE_STANDARD_DEVIATION[metric];
  const highVariance = standardDeviation > maximumDeviation;
  const confidence = capConfidenceBySources(
    calibrationConfidence(samples.length, standardDeviation, maximumDeviation),
    samples,
  );
  const sourceLimited = samples.some((sample) =>
    sample.forecastSourceTruth.confidence !== 'high' ||
    sample.forecastSourceTruth.coverage !== 'complete');
  const warningCodes = [
    ...(highVariance ? ['high_variance', 'review_only'] : []),
    ...(sourceLimited ? ['source_limited'] : []),
  ];
  const createdAt = validDate(options.now) ?? samples[samples.length - 1].occurredAt;
  const proposal: CalibrationProposal = {
    schemaVersion: 'ecs.trip-learning.calibration-proposal.v1',
    id: `calibration:${hashText(scopeKey)}`,
    metric,
    scopeKey,
    vehicleId: first.vehicleId,
    terrainClass: first.terrainClass,
    adjustmentKind: adjustmentKind(metric),
    currentValue: metric === 'camp_arrival' ? 0 : 1,
    proposedValue: proposedCalibrationValue(metric, samples),
    sampleCount: samples.length,
    meanError: round(meanError),
    meanRelativeError: meanRelativeError == null ? null : round(meanRelativeError),
    variance: round(sampleVariance),
    standardDeviation: round(standardDeviation),
    confidence,
    dataPeriodStart: samples[0].occurredAt,
    dataPeriodEnd: samples[samples.length - 1].occurredAt,
    sourceTripIds: unique(samples.map((sample) => sample.tripId)),
    sourceTruth: proposalSourceTruth(
      metric,
      scopeKey,
      samples,
      confidence,
      warningCodes,
      samples[samples.length - 1].occurredAt,
    ),
    warnings: warningCodes,
    canApply: !highVariance && (confidence === 'high' || confidence === 'medium'),
    requiresExplicitConfirmation: true,
    reversible: true,
    status: 'pending',
    createdAt,
    updatedAt: createdAt,
    appliedAt: null,
    dismissedAt: null,
    revertedAt: null,
  };

  return {
    status: highVariance ? 'high_variance' : 'ready',
    metric,
    scopeKey,
    sampleCount: samples.length,
    requiredSampleCount: TRIP_LEARNING_MIN_SAMPLE_COUNT,
    proposal,
    reason: highVariance
      ? 'The result is visible for review, but variance is too high to apply.'
      : 'Qualified samples support a reversible calibration proposal.',
  };
}

export function buildCalibrationAnalyses(
  samples: readonly QualifiedTripSample[],
  options: CalibrationOptions = {},
): CalibrationAnalysis[] {
  const groups = new Map<string, QualifiedTripSample[]>();
  samples.forEach((sample) => {
    const key = getCalibrationScopeKey(sample.metric, sample.vehicleId, sample.terrainClass);
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  });
  return Array.from(groups.values()).map((group) => analyzeCalibrationSamples(group, options));
}

function observationHasStrongEvidence(observation: TripExposureObservation): boolean {
  if (!observation.verified) return false;
  if (observation.qualityFlags.some((flag) =>
    flag === 'incomplete' ||
    flag === 'mocked' ||
    flag === 'simulated' ||
    flag === 'corrupted' ||
    flag === 'materially_stale' ||
    flag === 'manual_unverified')) return false;

  const source = sanitizeSourceTruthRef(observation.sourceTruth);
  if (
    source.origin === 'simulated' ||
    source.origin === 'unavailable' ||
    source.availability !== 'usable' ||
    source.confidence !== 'high' ||
    source.coverage !== 'complete' ||
    source.conflict === true
  ) return false;
  if (source.origin === 'manual' && !source.warningCodes.includes('verified_manual_actual')) return false;
  if (source.warningCodes.some((code) => REJECTED_WARNING_CODES.has(code))) return false;

  const observedAt = validDate(observation.observedAt);
  if (!observedAt) return false;
  const evaluation = evaluateSourceTruthRef(source, {
    policyKey: observation.freshnessPolicyKey,
    now: observedAt,
  });
  return evaluation.freshness === 'live' || evaluation.freshness === 'recent';
}

type PromptTemplate = {
  category: PostTripInspectionCategory;
  title: string;
  instruction: string;
  rationale: string;
};

function promptTemplate(observation: TripExposureObservation): PromptTemplate | null {
  const value = observation.value;
  switch (observation.kind) {
    case 'technical_terrain':
      if (observation.severity !== 'high') return null;
      return {
        category: 'tires_and_wheels',
        title: 'Tire and wheel inspection',
        instruction: 'Inspect tires, wheels, and visible underbody areas before the next trip.',
        rationale: 'A high-severity terrain exposure was recorded with strong source evidence.',
      };
    case 'high_coolant_temperature':
      if (value == null || value < 230) return null;
      return {
        category: 'fluids_and_cooling',
        title: 'Cooling-system verification',
        instruction: 'Inspect fluid levels and verify visible cooling-system condition after the trip.',
        rationale: 'High-confidence telemetry recorded coolant temperature at or above 230 F.',
      };
    case 'low_battery_voltage':
      if (value == null || value > 11.8) return null;
      return {
        category: 'battery_and_power',
        title: 'Battery and connection check',
        instruction: 'Verify battery connections and consider checking resting voltage before departure.',
        rationale: 'High-confidence telemetry recorded voltage at or below 11.8 V.',
      };
    case 'high_attitude':
      if (value == null || Math.abs(value) < 20) return null;
      return {
        category: 'load_security',
        title: 'Load-security inspection',
        instruction: 'Inspect tie-downs and verify roof, bed, and high-load security.',
        rationale: 'A high-confidence vehicle-attitude exposure reached the deterministic review threshold.',
      };
    case 'recovery_use':
      return {
        category: 'recovery_equipment',
        title: 'Recovery equipment inspection',
        instruction: 'Inspect recovery equipment and verify attachment points before reuse.',
        rationale: 'A verified recovery-use event was recorded during the trip.',
      };
    case 'load_shift':
      return {
        category: 'load_security',
        title: 'Load-security inspection',
        instruction: 'Inspect tie-downs and verify the recorded load zones before the next trip.',
        rationale: 'A verified load-shift event was recorded.',
      };
    case 'incident_exposure':
      if (observation.severity !== 'high') return null;
      return {
        category: 'vehicle_and_equipment',
        title: 'Post-incident inspection',
        instruction: 'Inspect the vehicle and affected equipment using the recorded incident evidence.',
        rationale: 'A high-severity incident exposure was recorded; this prompt does not diagnose damage.',
      };
    case 'tire_pressure_excursion':
      if (value == null || observation.comparisonBaseline == null || observation.severity !== 'high') return null;
      return {
        category: 'tires_and_wheels',
        title: 'Tire-pressure verification',
        instruction: 'Inspect the affected tire and verify pressure against the known baseline.',
        rationale: 'A high-confidence pressure excursion was recorded against a known baseline.',
      };
    default:
      return null;
  }
}

export function buildPostTripInspectionPrompts(
  observations: readonly TripExposureObservation[],
  now?: string | null,
): PostTripInspectionPrompt[] {
  const byCategory = new Map<PostTripInspectionCategory, PostTripInspectionPrompt>();
  observations.forEach((observation) => {
    if (!observationHasStrongEvidence(observation)) return;
    const template = promptTemplate(observation);
    if (!template) return;

    const sourceTruth = sanitizeSourceTruthRef(observation.sourceTruth);
    const createdAt = validDate(now) ?? validDate(observation.observedAt) as string;
    const prompt: PostTripInspectionPrompt = {
      schemaVersion: 'ecs.trip-learning.inspection-prompt.v1',
      id: `inspection:${hashText(`${observation.tripId}|${template.category}|${observation.id}`)}`,
      tripId: compactId(observation.tripId, 'trip'),
      expeditionId: observation.expeditionId
        ? compactId(observation.expeditionId, 'expedition')
        : null,
      category: template.category,
      title: template.title,
      instruction: template.instruction,
      rationale: template.rationale,
      confidence: 'high',
      sourceTruth,
      evidence: [{
        observationId: compactId(observation.id, 'observation'),
        observedAt: validDate(observation.observedAt) as string,
        label: compactLabel(observation.evidenceLabel, 'Recorded trip exposure'),
        value: finite(observation.value),
        unit: observation.unit ? compactLabel(observation.unit, 'unknown') : null,
        sourceTruth,
        freshnessPolicyKey: observation.freshnessPolicyKey,
      }],
      status: 'open',
      createdAt,
      updatedAt: createdAt,
    };

    const existing = byCategory.get(template.category);
    if (!existing || observation.severity === 'high') {
      byCategory.set(template.category, prompt);
    }
  });

  return Array.from(byCategory.values()).sort((left, right) => left.id.localeCompare(right.id));
}
