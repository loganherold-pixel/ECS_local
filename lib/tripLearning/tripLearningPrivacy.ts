import {
  sanitizeSourceTruthDisplayText,
  sanitizeSourceTruthRef,
  type SourceTruthPolicyKey,
} from '../sourceTruth';
import type {
  CalibrationApplication,
  CalibrationProposal,
  ForecastActualQualityFlag,
  ForecastActualRecord,
  PostTripInspectionPrompt,
  QualifiedTripSample,
  TripCalibrationOverlay,
  TripLearningForecastBaseline,
  TripLearningMetric,
  TripLearningValueUnit,
} from './tripLearningTypes';

const METRICS = new Set<TripLearningMetric>([
  'drive_time',
  'fuel_consumption',
  'power_runtime',
  'camp_arrival',
]);

const UNITS = new Set<TripLearningValueUnit>([
  'seconds',
  'gallons',
  'hours',
  'epoch_minutes',
]);

const POLICY_KEYS = new Set<SourceTruthPolicyKey>([
  'default',
  'convoy_member_location',
  'weather_observation',
  'weather_forecast',
  'vehicle_profile',
  'vehicle_telemetry',
  'route_legal_access_evidence',
  'condition_closure_advisory',
  'offline_map_route_package',
  'camp_provider_availability',
  'manual_user_state',
]);

const QUALITY_FLAGS = new Set<ForecastActualQualityFlag>([
  'incomplete',
  'mocked',
  'simulated',
  'corrupted',
  'materially_stale',
  'manual_unverified',
]);

const FORBIDDEN_KEY = /(^|_)(lat|lng|latitude|longitude|coordinate|coordinates|geometry|route_points?|route_trace|trip_trace|raw|raw_payload|provider_payload|api_key|token|secret|password|authorization|auth_data|stack_trace|precise_location|notes?)($|_)/i;
const PRECISE_COORDINATE_TEXT = /-?\d{1,2}\.\d{4,}\s*[,/]\s*-?\d{1,3}\.\d{4,}/;

export function sanitizeTripLearningSourceTruth(
  input: Parameters<typeof sanitizeSourceTruthRef>[0],
): ReturnType<typeof sanitizeSourceTruthRef> {
  const source = sanitizeSourceTruthRef(input);
  const coordinateRedacted = [source.id, source.authority, source.provider]
    .some((value) => typeof value === 'string' && PRECISE_COORDINATE_TEXT.test(value));
  if (!coordinateRedacted) return source;
  return {
    ...source,
    id: PRECISE_COORDINATE_TEXT.test(source.id) ? 'source' : source.id,
    authority: source.authority && PRECISE_COORDINATE_TEXT.test(source.authority) ? null : source.authority,
    provider: source.provider && PRECISE_COORDINATE_TEXT.test(source.provider) ? null : source.provider,
    warningCodes: Array.from(new Set([...source.warningCodes, 'precise_location_redacted'])),
  };
}

function safeId(value: unknown, fallback: string): string {
  const text = sanitizeSourceTruthDisplayText(value, 96);
  if (!text || text === '[redacted]' || PRECISE_COORDINATE_TEXT.test(text)) return fallback;
  return text.replace(/[^a-zA-Z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function safeLabel(value: unknown, fallback: string, maxLength = 160): string {
  const text = sanitizeSourceTruthDisplayText(value, maxLength);
  return !text || text === '[redacted]' || PRECISE_COORDINATE_TEXT.test(text) ? fallback : text;
}

function nullableId(value: unknown, fallback: string): string | null {
  return value == null || String(value).trim() === '' ? null : safeId(value, fallback);
}

function nullableLabel(value: unknown): string | null {
  if (value == null || String(value).trim() === '') return null;
  return safeLabel(value, 'unknown', 80);
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function date(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim();
  return text && Number.isFinite(Date.parse(text)) ? text : fallback;
}

function metric(value: unknown): TripLearningMetric | null {
  return METRICS.has(value as TripLearningMetric) ? value as TripLearningMetric : null;
}

function unit(value: unknown): TripLearningValueUnit | null {
  return UNITS.has(value as TripLearningValueUnit) ? value as TripLearningValueUnit : null;
}

function policyKey(value: unknown): SourceTruthPolicyKey {
  return POLICY_KEYS.has(value as SourceTruthPolicyKey) ? value as SourceTruthPolicyKey : 'default';
}

function stringArray(value: unknown, max = 40): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((item) => sanitizeSourceTruthDisplayText(item, 80))
    .filter((item): item is string => !!item && item !== '[redacted]')))
    .slice(0, max);
}

export function sanitizeForecastActualRecord(
  input: ForecastActualRecord,
): ForecastActualRecord | null {
  const normalizedMetric = metric(input?.metric);
  const forecastUnit = unit(input?.forecast?.unit);
  const actualUnit = unit(input?.actual?.unit);
  const forecastValue = finite(input?.forecast?.value);
  const actualValue = finite(input?.actual?.value);
  if (!normalizedMetric || !forecastUnit || !actualUnit || forecastValue == null || actualValue == null) return null;

  const fallbackTime = new Date(0).toISOString();
  return {
    schemaVersion: 'ecs.trip-learning.forecast-actual.v1',
    id: safeId(input.id, 'forecast-actual'),
    tripId: safeId(input.tripId, 'trip'),
    expeditionId: nullableId(input.expeditionId, 'expedition'),
    vehicleId: nullableId(input.vehicleId, 'vehicle'),
    routeClass: nullableLabel(input.routeClass),
    terrainClass: nullableLabel(input.terrainClass),
    metric: normalizedMetric,
    forecast: {
      value: forecastValue,
      unit: forecastUnit,
      observedAt: date(input.forecast.observedAt, fallbackTime),
      sourceTruth: sanitizeTripLearningSourceTruth(input.forecast.sourceTruth),
      freshnessPolicyKey: policyKey(input.forecast.freshnessPolicyKey),
    },
    actual: {
      value: actualValue,
      unit: actualUnit,
      observedAt: date(input.actual.observedAt, fallbackTime),
      sourceTruth: sanitizeTripLearningSourceTruth(input.actual.sourceTruth),
      freshnessPolicyKey: policyKey(input.actual.freshnessPolicyKey),
    },
    tripStartedAt: date(input.tripStartedAt, fallbackTime),
    tripEndedAt: date(input.tripEndedAt, fallbackTime),
    createdAt: date(input.createdAt, fallbackTime),
    qualityFlags: Array.isArray(input.qualityFlags)
      ? Array.from(new Set(input.qualityFlags.filter((flag) => QUALITY_FLAGS.has(flag)))).slice(0, 12)
      : [],
  };
}

export function sanitizeTripLearningForecastBaseline(
  input: TripLearningForecastBaseline,
): TripLearningForecastBaseline | null {
  if (!input || !Array.isArray(input.entries)) return null;
  const fallbackTime = new Date(0).toISOString();
  const entries = input.entries.flatMap((entry) => {
    const normalizedMetric = metric(entry.metric);
    const normalizedUnit = unit(entry.unit);
    const value = finite(entry.value);
    if (!normalizedMetric || !normalizedUnit || value == null || value <= 0) return [];
    return [{
      metric: normalizedMetric,
      value,
      unit: normalizedUnit,
      sourceTruth: sanitizeTripLearningSourceTruth(entry.sourceTruth),
      freshnessPolicyKey: policyKey(entry.freshnessPolicyKey),
    }];
  }).slice(0, 4);
  if (entries.length === 0) return null;
  return {
    schemaVersion: 'ecs.trip-learning.forecast-baseline.v1',
    id: safeId(input.id, 'forecast-baseline'),
    tripId: safeId(input.tripId, 'trip'),
    expeditionId: nullableId(input.expeditionId, 'expedition'),
    vehicleId: nullableId(input.vehicleId, 'vehicle'),
    routeClass: nullableLabel(input.routeClass),
    terrainClass: nullableLabel(input.terrainClass),
    routeIntelligenceId: nullableId(input.routeIntelligenceId, 'route-intelligence'),
    forecastRouteMiles: input.forecastRouteMiles == null ? null : finite(input.forecastRouteMiles),
    capturedAt: date(input.capturedAt, fallbackTime),
    entries,
  };
}

export function sanitizeQualifiedTripSample(input: QualifiedTripSample): QualifiedTripSample | null {
  const normalizedMetric = metric(input?.metric);
  const normalizedUnit = unit(input?.unit);
  const forecastValue = finite(input?.forecastValue);
  const actualValue = finite(input?.actualValue);
  const error = finite(input?.error);
  const absoluteError = finite(input?.absoluteError);
  const relativeError = input?.relativeError == null ? null : finite(input.relativeError);
  if (!normalizedMetric || !normalizedUnit || forecastValue == null || actualValue == null || error == null || absoluteError == null) return null;
  return {
    schemaVersion: 'ecs.trip-learning.qualified-sample.v1',
    id: safeId(input.id, 'sample'),
    fingerprint: safeId(input.fingerprint, 'sample-fingerprint'),
    recordId: safeId(input.recordId, 'record'),
    tripId: safeId(input.tripId, 'trip'),
    expeditionId: nullableId(input.expeditionId, 'expedition'),
    vehicleId: nullableId(input.vehicleId, 'vehicle'),
    routeClass: nullableLabel(input.routeClass),
    terrainClass: nullableLabel(input.terrainClass),
    metric: normalizedMetric,
    unit: normalizedUnit,
    forecastValue,
    actualValue,
    error,
    absoluteError,
    relativeError,
    occurredAt: date(input.occurredAt, new Date(0).toISOString()),
    confidence: 'high',
    forecastSourceTruth: sanitizeTripLearningSourceTruth(input.forecastSourceTruth),
    actualSourceTruth: sanitizeTripLearningSourceTruth(input.actualSourceTruth),
    forecastFreshnessPolicyKey: policyKey(input.forecastFreshnessPolicyKey),
    actualFreshnessPolicyKey: policyKey(input.actualFreshnessPolicyKey),
  };
}

export function sanitizeCalibrationProposal(input: CalibrationProposal): CalibrationProposal | null {
  const normalizedMetric = metric(input?.metric);
  if (!normalizedMetric) return null;
  const numberFields = [
    input.currentValue,
    input.proposedValue,
    input.sampleCount,
    input.meanError,
    input.variance,
    input.standardDeviation,
  ];
  if (numberFields.some((value) => finite(value) == null)) return null;
  const fallbackTime = new Date(0).toISOString();
  const confidence = input.confidence === 'high' || input.confidence === 'medium' || input.confidence === 'low'
    ? input.confidence
    : 'unknown';
  return {
    ...input,
    schemaVersion: 'ecs.trip-learning.calibration-proposal.v1',
    id: safeId(input.id, 'calibration'),
    metric: normalizedMetric,
    scopeKey: safeId(input.scopeKey, 'scope'),
    vehicleId: nullableId(input.vehicleId, 'vehicle'),
    terrainClass: nullableLabel(input.terrainClass),
    currentValue: Number(input.currentValue),
    proposedValue: Number(input.proposedValue),
    sampleCount: Math.max(0, Math.floor(Number(input.sampleCount))),
    meanError: Number(input.meanError),
    meanRelativeError: input.meanRelativeError == null ? null : finite(input.meanRelativeError),
    variance: Math.max(0, Number(input.variance)),
    standardDeviation: Math.max(0, Number(input.standardDeviation)),
    confidence,
    dataPeriodStart: date(input.dataPeriodStart, fallbackTime),
    dataPeriodEnd: date(input.dataPeriodEnd, fallbackTime),
    sourceTripIds: stringArray(input.sourceTripIds),
    sourceTruth: sanitizeTripLearningSourceTruth(input.sourceTruth),
    warnings: stringArray(input.warnings),
    canApply: input.canApply === true,
    requiresExplicitConfirmation: true,
    reversible: true,
    status: input.status === 'applied' || input.status === 'dismissed' || input.status === 'reverted'
      ? input.status
      : 'pending',
    createdAt: date(input.createdAt, fallbackTime),
    updatedAt: date(input.updatedAt, fallbackTime),
    appliedAt: input.appliedAt ? date(input.appliedAt, fallbackTime) : null,
    dismissedAt: input.dismissedAt ? date(input.dismissedAt, fallbackTime) : null,
    revertedAt: input.revertedAt ? date(input.revertedAt, fallbackTime) : null,
  };
}

export function sanitizePostTripInspectionPrompt(
  input: PostTripInspectionPrompt,
): PostTripInspectionPrompt | null {
  if (!input || !Array.isArray(input.evidence) || input.evidence.length === 0) return null;
  const fallbackTime = new Date(0).toISOString();
  const sourceTruth = sanitizeTripLearningSourceTruth(input.sourceTruth);
  const evidence = input.evidence.slice(0, 6).map((item) => ({
    observationId: safeId(item.observationId, 'observation'),
    observedAt: date(item.observedAt, fallbackTime),
    label: safeLabel(item.label, 'Recorded trip exposure'),
    value: finite(item.value),
    unit: item.unit ? safeLabel(item.unit, 'unknown', 30) : null,
    sourceTruth: sanitizeTripLearningSourceTruth(item.sourceTruth),
    freshnessPolicyKey: policyKey(item.freshnessPolicyKey),
  }));
  return {
    schemaVersion: 'ecs.trip-learning.inspection-prompt.v1',
    id: safeId(input.id, 'inspection'),
    tripId: safeId(input.tripId, 'trip'),
    expeditionId: nullableId(input.expeditionId, 'expedition'),
    category: input.category,
    title: safeLabel(input.title, 'Post-trip inspection'),
    instruction: safeLabel(input.instruction, 'Inspect the recorded item before the next trip.'),
    rationale: safeLabel(input.rationale, 'A qualified trip exposure supports this inspection prompt.'),
    confidence: input.confidence === 'high' || input.confidence === 'medium' || input.confidence === 'low'
      ? input.confidence
      : 'unknown',
    sourceTruth,
    evidence,
    status: input.status === 'dismissed' || input.status === 'completed' ? input.status : 'open',
    createdAt: date(input.createdAt, fallbackTime),
    updatedAt: date(input.updatedAt, fallbackTime),
  };
}

export function sanitizeCalibrationOverlay(input: TripCalibrationOverlay): TripCalibrationOverlay | null {
  const normalizedMetric = metric(input?.metric);
  const value = finite(input?.value);
  const previousValue = finite(input?.previousValue);
  if (!normalizedMetric || value == null || previousValue == null) return null;
  return {
    ...input,
    key: safeId(input.key, 'overlay'),
    proposalId: safeId(input.proposalId, 'calibration'),
    metric: normalizedMetric,
    scopeKey: safeId(input.scopeKey, 'scope'),
    value,
    previousValue,
    appliedAt: date(input.appliedAt, new Date(0).toISOString()),
  };
}

export function sanitizeCalibrationApplication(input: CalibrationApplication): CalibrationApplication | null {
  const previousValue = finite(input?.previousValue);
  const appliedValue = finite(input?.appliedValue);
  if (previousValue == null || appliedValue == null) return null;
  const fallbackTime = new Date(0).toISOString();
  return {
    id: safeId(input.id, 'application'),
    proposalId: safeId(input.proposalId, 'calibration'),
    overlayKey: safeId(input.overlayKey, 'overlay'),
    previousValue,
    appliedValue,
    appliedAt: date(input.appliedAt, fallbackTime),
    revertedAt: input.revertedAt ? date(input.revertedAt, fallbackTime) : null,
    status: input.status === 'reverted' ? 'reverted' : 'active',
  };
}

export function findForbiddenTripLearningKeys(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (input: unknown, path: string, depth: number) => {
    if (depth > 12 || input == null) return;
    if (typeof input === 'string') {
      if (PRECISE_COORDINATE_TEXT.test(input)) found.add(`${path}:precise_location_value`);
      return;
    }
    if (typeof input !== 'object') return;
    if (Array.isArray(input)) {
      input.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      return;
    }
    Object.entries(input as Record<string, unknown>).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      const normalizedKey = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
      if (FORBIDDEN_KEY.test(normalizedKey)) found.add(nextPath);
      visit(item, nextPath, depth + 1);
    });
  };
  visit(value, '', 0);
  return Array.from(found).sort();
}

export function isTripLearningPayloadPrivacySafe(value: unknown): boolean {
  return findForbiddenTripLearningKeys(value).length === 0;
}
