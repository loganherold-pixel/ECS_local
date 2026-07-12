import type { ECSStatusTone } from './ecsStatusTokens';
import {
  evaluateSourceTruthRef,
  sanitizeSourceTruthDisplayText,
  type FreshnessPolicy,
  type FreshnessPolicyOverride,
  type SourceTruthAvailability,
  type SourceTruthConfidence,
  type SourceTruthCoverage,
  type SourceTruthFreshness,
  type SourceTruthOrigin,
  type SourceTruthPolicyKey,
  type SourceTruthRef,
} from './sourceTruth';

export type SourceTruthInspectorRow = {
  id: string;
  label: string;
  value: string;
};

export type SourceTruthInspectorWarning = {
  code: string | null;
  message: string;
  severity: 'info' | 'warning' | 'critical';
};

export type SourceTruthInspectorModel = {
  sourceName: string;
  summary: string;
  freshnessLabel: string;
  originLabel: string;
  availabilityLabel: string;
  coverageLabel: string;
  confidenceLabel: string;
  ageLabel: string;
  triggerLabel: string;
  triggerTone: ECSStatusTone;
  triggerIcon:
    | 'radio-outline'
    | 'time-outline'
    | 'archive-outline'
    | 'create-outline'
    | 'analytics-outline'
    | 'flask-outline'
    | 'cloud-offline-outline'
    | 'warning-outline';
  sourceRows: SourceTruthInspectorRow[];
  timingRows: SourceTruthInspectorRow[];
  qualityRows: SourceTruthInspectorRow[];
  dependencies: string[];
  warnings: SourceTruthInspectorWarning[];
  conflict: boolean;
  accessibilityLabel: string;
};

export type BuildSourceTruthInspectorModelInput = {
  source?: SourceTruthRef | null;
  policyKey?: SourceTruthPolicyKey | null;
  policyOverride?: FreshnessPolicyOverride | null;
  dependencies?: readonly string[] | null;
  now?: number | Date | string | null;
};

const FRESHNESS_LABELS: Record<SourceTruthFreshness, string> = {
  live: 'Current',
  recent: 'Recent',
  stale: 'Stale',
  expired: 'Expired',
  unavailable: 'Unavailable',
};

const ORIGIN_LABELS: Record<SourceTruthOrigin, string> = {
  live: 'Live',
  cached: 'Cached',
  manual: 'Manual',
  estimated: 'Estimated',
  inferred: 'Inferred',
  simulated: 'Simulated / mock',
  unavailable: 'Unavailable',
};

const AVAILABILITY_LABELS: Record<SourceTruthAvailability, string> = {
  usable: 'Usable',
  degraded: 'Degraded / partial',
  unavailable: 'Unavailable',
};

const COVERAGE_LABELS: Record<SourceTruthCoverage, string> = {
  complete: 'Complete',
  partial: 'Partial',
  unknown: 'Unknown',
};

const CONFIDENCE_LABELS: Record<SourceTruthConfidence, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unknown: 'Unknown',
};

const WARNING_COPY: Record<string, string> = {
  missing_source_truth: 'No canonical source details are available for this result.',
  missing_timestamp: 'The source did not provide a usable observation or retrieval time.',
  invalid_timestamp: 'The source timestamp is invalid and was treated conservatively.',
  invalid_observed_at: 'The reported observation time is invalid.',
  invalid_fetched_at: 'The reported retrieval time is invalid.',
  invalid_expires_at: 'The reported expiration time is invalid.',
  future_timestamp: 'The source timestamp is unexpectedly in the future.',
  origin_cached: 'This is saved data, not a live reading.',
  origin_manual: 'This value was entered or confirmed manually.',
  origin_simulated: 'This is simulated or mock data.',
  source_unavailable: 'The source is currently unavailable.',
  stale_source: 'The source is outside its current or recent freshness window.',
  expired_source: 'The source has passed its expiration window.',
  conflict_detected: 'This source conflicts with other available evidence.',
  readiness_assessment_inferred: 'The readiness result is a deterministic ECS inference from its listed inputs.',
  readiness_sources_missing: 'One or more readiness inputs are missing.',
  readiness_sources_stale: 'One or more readiness inputs are stale.',
  readiness_sources_mock: 'One or more readiness inputs use mock data.',
  readiness_sources_demo: 'One or more readiness inputs use demo data.',
  readiness_sources_inferred: 'One or more readiness inputs were inferred by ECS.',
  readiness_unmarked_synthetic_data: 'Readiness detected synthetic data without an expected source marker.',
  weather_provider_limited: 'Weather provider service is limited or unavailable.',
  weather_location_stale: 'Weather location context is stale.',
  weather_data_unavailable: 'No usable weather conditions or forecast are available.',
  route_catalog_summary_only: 'This is route summary provenance; detailed evidence may contain additional sources.',
  route_catalog_preview_unverified: 'Preview route metadata is not verified route geometry or legal-access evidence.',
  route_catalog_community_source: 'Community route metadata requires independent field verification.',
  route_catalog_imported_source: 'Imported route metadata retains the source file context but may not identify its authority.',
  route_legal_status_unverified: 'This source label does not by itself establish current legal access or closure status.',
  redacted_sensitive_warning: 'A sensitive source detail was omitted.',
};

const EMPTY_SOURCE: SourceTruthRef = {
  id: 'source-unavailable',
  origin: 'unavailable',
  authority: null,
  provider: null,
  observedAt: null,
  fetchedAt: null,
  expiresAt: null,
  confidence: 'unknown',
  coverage: 'unknown',
  availability: 'unavailable',
  conflict: false,
  warningCodes: ['missing_source_truth'],
};

export function buildSourceTruthInspectorModel(
  input: BuildSourceTruthInspectorModelInput,
): SourceTruthInspectorModel {
  const evaluation = evaluateSourceTruthRef(input.source ?? EMPTY_SOURCE, {
    policyKey: input.policyKey,
    policyOverride: input.policyOverride,
    now: input.now,
  });
  const sourceName = displayIdentity(evaluation.ref.authority)
    ?? displayIdentity(evaluation.ref.provider)
    ?? 'Unknown source';
  const providerName = displayIdentity(evaluation.ref.provider);
  const freshnessLabel = FRESHNESS_LABELS[evaluation.freshness];
  const originLabel = ORIGIN_LABELS[evaluation.ref.origin];
  const availabilityLabel = AVAILABILITY_LABELS[evaluation.availability];
  const coverageLabel = COVERAGE_LABELS[evaluation.coverage];
  const confidenceLabel = CONFIDENCE_LABELS[evaluation.confidence];
  const ageLabel = formatSourceTruthAge(evaluation.ageMs);
  const dependencies = sanitizeDependencies(input.dependencies);
  const warningCodes = input.source
    ? evaluation.warningCodes
    : uniqueStrings([...evaluation.warningCodes, 'missing_source_truth']);
  const warnings = warningCodes.map(buildWarning);
  const triggerTone = resolveTriggerTone(
    evaluation.freshness,
    evaluation.availability,
    evaluation.conflict,
  );
  const triggerIcon = resolveTriggerIcon(
    evaluation.ref.origin,
    evaluation.freshness,
    evaluation.conflict,
  );
  const triggerLabel = buildTriggerLabel(
    evaluation.ref.origin,
    evaluation.freshness,
  );

  const sourceRows: SourceTruthInspectorRow[] = [
    { id: 'source', label: 'Source / authority', value: sourceName },
    ...(providerName && providerName !== sourceName
      ? [{ id: 'provider', label: 'Provider', value: providerName }]
      : []),
    { id: 'origin', label: 'Origin', value: originLabel },
  ];

  const timingRows: SourceTruthInspectorRow[] = [
    {
      id: 'observed',
      label: 'Observed',
      value: evaluation.observedAtMs == null
        ? 'Unknown'
        : formatSourceTruthTimestamp(evaluation.observedAtMs),
    },
    ...(evaluation.fetchedAtMs == null
      ? []
      : [{
          id: 'retrieved',
          label: 'Retrieved',
          value: formatSourceTruthTimestamp(evaluation.fetchedAtMs),
        }]),
    ...(evaluation.expiresAtMs == null
      ? []
      : [{
          id: 'expires',
          label: 'Expires',
          value: formatSourceTruthTimestamp(evaluation.expiresAtMs),
        }]),
    {
      id: 'policy',
      label: 'Freshness policy',
      value: formatFreshnessPolicy(evaluation.policy),
    },
  ];

  const qualityRows: SourceTruthInspectorRow[] = [
    { id: 'freshness', label: 'Freshness', value: freshnessLabel },
    { id: 'age', label: 'Age', value: ageLabel },
    { id: 'availability', label: 'Availability', value: availabilityLabel },
    { id: 'coverage', label: 'Coverage', value: coverageLabel },
    { id: 'confidence', label: 'Confidence', value: confidenceLabel },
    ...(evaluation.conflict
      ? [{ id: 'conflict', label: 'Conflict', value: 'Conflicting evidence present' }]
      : []),
  ];

  const summary = buildSummary({
    policyLabel: evaluation.policy.label,
    origin: evaluation.ref.origin,
    freshness: evaluation.freshness,
    availability: evaluation.availability,
    conflict: evaluation.conflict,
  });

  return {
    sourceName,
    summary,
    freshnessLabel,
    originLabel,
    availabilityLabel,
    coverageLabel,
    confidenceLabel,
    ageLabel,
    triggerLabel,
    triggerTone,
    triggerIcon,
    sourceRows,
    timingRows,
    qualityRows,
    dependencies: dependencies.length > 0
      ? dependencies
      : ['Decision dependency is unknown.'],
    warnings,
    conflict: evaluation.conflict,
    accessibilityLabel: [
      `Source details for ${sourceName}.`,
      `Origin ${originLabel}.`,
      `Freshness ${freshnessLabel}.`,
      `Availability ${availabilityLabel}.`,
      `Confidence ${confidenceLabel}.`,
      evaluation.conflict ? 'Conflicting evidence is present.' : null,
    ].filter(Boolean).join(' '),
  };
}

export function formatSourceTruthAge(ageMs: number | null): string {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return 'Unknown';
  if (ageMs < 60_000) return 'Less than 1 minute old';

  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} old`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} old`;

  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} old`;
}

export function formatSourceTruthTimestamp(timestampMs: number | null): string {
  if (timestampMs == null || !Number.isFinite(timestampMs)) return 'Unknown';
  const date = new Date(timestampMs);
  if (!Number.isFinite(date.getTime())) return 'Unknown';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatFreshnessPolicy(policy: FreshnessPolicy): string {
  const bands = [
    `current through ${formatDuration(policy.liveMs)}`,
    `recent through ${formatDuration(policy.recentMs)}`,
    `stale through ${formatDuration(policy.staleMs)}`,
  ];
  if (policy.expiredMs != null) {
    bands.push(`expired through ${formatDuration(policy.expiredMs)}`);
  }
  return `${policy.label}: ${bands.join(', ')}.`;
}

function displayIdentity(value: string | null | undefined): string | null {
  const safe = sanitizeSourceTruthDisplayText(value, 120);
  if (!safe) return null;
  return safe === '[redacted]' ? 'Restricted source' : safe;
}

function sanitizeDependencies(values: readonly string[] | null | undefined): string[] {
  return uniqueStrings((values ?? []).map((value) => {
    const safe = sanitizeSourceTruthDisplayText(value, 180);
    if (!safe) return null;
    return safe === '[redacted]' ? 'Restricted dependency detail omitted.' : safe;
  }));
}

function buildWarning(code: string): SourceTruthInspectorWarning {
  const safeCode = sanitizeSourceTruthDisplayText(code, 80);
  const redacted = !safeCode || safeCode === '[redacted]' || code === 'redacted_sensitive_warning';
  const message = WARNING_COPY[code] ?? humanizeWarningCode(code);
  return {
    code: redacted ? null : safeCode,
    message,
    severity: code === 'conflict_detected' || code === 'source_unavailable'
      ? 'critical'
      : code.startsWith('origin_') || code.endsWith('_limited')
        ? 'info'
        : 'warning',
  };
}

function humanizeWarningCode(code: string): string {
  const text = String(code ?? '')
    .replace(/[_.:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 'Additional source limitation reported.';
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function buildSummary(input: {
  policyLabel: string;
  origin: SourceTruthOrigin;
  freshness: SourceTruthFreshness;
  availability: SourceTruthAvailability;
  conflict: boolean;
}): string {
  const freshness = input.freshness === 'live'
    ? `This source is current under the ${input.policyLabel} policy.`
    : input.freshness === 'recent'
      ? `This source is recent under the ${input.policyLabel} policy.`
      : input.freshness === 'stale'
        ? `This source is stale under the ${input.policyLabel} policy.`
        : input.freshness === 'expired'
          ? `This source has expired under the ${input.policyLabel} policy.`
          : `Freshness cannot be established under the ${input.policyLabel} policy.`;
  const origin = input.origin === 'cached'
    ? 'It comes from saved data and is not live.'
    : input.origin === 'manual'
      ? 'It comes from manual input and is not a live sensor reading.'
      : input.origin === 'estimated'
        ? 'It is an estimate, not a direct observation.'
        : input.origin === 'inferred'
          ? 'It was inferred from available ECS context.'
          : input.origin === 'simulated'
            ? 'It is simulated or mock data.'
            : input.origin === 'unavailable'
              ? 'No usable source origin is available.'
              : 'It comes from a live source.';
  const availability = input.availability === 'usable'
    ? 'The source is usable for the stated dependency.'
    : input.availability === 'degraded'
      ? 'The source is only partially usable and should be verified.'
      : 'The source is unavailable and should not support a current conclusion.';
  const conflict = input.conflict
    ? 'Conflicting evidence is present and remains visible.'
    : '';
  return [freshness, origin, availability, conflict].filter(Boolean).join(' ');
}

function buildTriggerLabel(
  origin: SourceTruthOrigin,
  freshness: SourceTruthFreshness,
): string {
  if (origin === 'unavailable' || freshness === 'unavailable') return 'Unavailable';
  const freshnessLabel = FRESHNESS_LABELS[freshness];
  if (origin === 'live') return freshness === 'live' ? 'Live' : freshnessLabel;
  return `${ORIGIN_LABELS[origin]} / ${freshnessLabel}`;
}

function resolveTriggerTone(
  freshness: SourceTruthFreshness,
  availability: SourceTruthAvailability,
  conflict: boolean,
): ECSStatusTone {
  if (conflict || availability === 'unavailable' || freshness === 'unavailable') return 'unavailable';
  if (availability === 'degraded' || freshness === 'stale' || freshness === 'expired') return 'warning';
  if (freshness === 'live') return 'live';
  if (freshness === 'recent') return 'ready';
  return 'info';
}

function resolveTriggerIcon(
  origin: SourceTruthOrigin,
  freshness: SourceTruthFreshness,
  conflict: boolean,
): SourceTruthInspectorModel['triggerIcon'] {
  if (conflict) return 'warning-outline';
  if (freshness === 'stale' || freshness === 'expired') return 'time-outline';
  if (origin === 'cached') return 'archive-outline';
  if (origin === 'manual') return 'create-outline';
  if (origin === 'estimated' || origin === 'inferred') return 'analytics-outline';
  if (origin === 'simulated') return 'flask-outline';
  if (origin === 'unavailable' || freshness === 'unavailable') return 'cloud-offline-outline';
  return 'radio-outline';
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'an unknown interval';
  if (ms < 60_000) {
    const seconds = Math.max(1, Math.round(ms / 1000));
    return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  }
  if (ms < 3_600_000) {
    const minutes = Math.round(ms / 60_000);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  if (ms < 86_400_000) {
    const hours = Math.round(ms / 3_600_000);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  const days = Math.round(ms / 86_400_000);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = String(value ?? '').trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    output.push(clean);
  }
  return output;
}
