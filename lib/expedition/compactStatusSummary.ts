import type {
  AssessmentCategory,
  AssessmentConfidence,
  AssessmentStatus,
  ExpeditionAssessment,
  ExpeditionAssessmentDataUsed,
  ExpeditionContextSnapshot,
} from './operationalAssessmentTypes';

export type ExpeditionCompactStatusTone =
  | 'good'
  | 'attention'
  | 'critical'
  | 'neutral'
  | 'stale'
  | 'unavailable';

export type ExpeditionCompactStatusSummaryInput = {
  contextSnapshot?: ExpeditionContextSnapshot | null;
  assessments?: Partial<Record<AssessmentCategory, ExpeditionAssessment>>;
  usingMockData?: boolean;
  offline?: boolean;
  stale?: boolean;
};

export type ExpeditionCompactStatusSummary = {
  available: boolean;
  status: AssessmentStatus;
  statusLabel: string;
  headline: string;
  topConcern: string;
  topReason: string | null;
  nextRecommendedAction: string;
  nextCheckpointOrCampEta: string;
  convoyAccounted: string;
  limitingResource: string;
  limitingVehicle: string;
  confidence: AssessmentConfidence;
  confidenceLabel: string;
  dataQualityLabel: string;
  dataQualityTone: ExpeditionCompactStatusTone;
  statusTone: ExpeditionCompactStatusTone;
  lastUpdated: string | null;
};

const STATUS_LABELS: Record<AssessmentStatus, string> = {
  normal: 'Stable',
  watch: 'Watch',
  caution: 'Caution',
  critical: 'Critical',
  unknown: 'Unknown',
};

const STATUS_TONES: Record<AssessmentStatus, ExpeditionCompactStatusTone> = {
  normal: 'good',
  watch: 'attention',
  caution: 'attention',
  critical: 'critical',
  unknown: 'unavailable',
};

function dataValue(
  assessment: ExpeditionAssessment | undefined,
  id: string,
): ExpeditionAssessmentDataUsed | undefined {
  return assessment?.dataUsed.find((item) => item.id === id);
}

function displayValue(value: ExpeditionAssessmentDataUsed | undefined): string | null {
  if (!value || value.value === null || value.value === undefined || value.value === '') return null;
  if (Array.isArray(value.value)) return value.value.length > 0 ? value.value.join(', ') : null;
  if (typeof value.value === 'boolean') return value.value ? 'Yes' : 'No';
  return String(value.value);
}

function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildNextCheckpointOrCampEta(
  overview: ExpeditionAssessment | undefined,
  camp: ExpeditionAssessment | undefined,
): string {
  const checkpoint = displayValue(dataValue(overview, 'next-checkpoint'));
  const eta = formatDateTime(displayValue(dataValue(overview, 'current-eta')));
  const campEta = formatDateTime(displayValue(dataValue(camp, 'camp-eta')));

  if (checkpoint && eta) return `${checkpoint} / ETA ${eta}`;
  if (checkpoint) return checkpoint;
  if (eta) return `ETA ${eta}`;
  if (campEta) return `Camp ETA ${campEta}`;
  return 'Next checkpoint unknown';
}

function buildConvoyAccounted(overview: ExpeditionAssessment | undefined): string {
  const accounted = displayValue(dataValue(overview, 'convoy-accountability'));
  const teamSize = displayValue(dataValue(overview, 'convoy-team-size'));
  if (accounted && teamSize) return `${accounted}/${teamSize} accounted`;
  if (accounted) return `${accounted} accounted`;
  return 'Convoy unknown';
}

function countWarnings(assessments: ExpeditionAssessment[]): {
  missing: number;
  stale: number;
} {
  return assessments.reduce(
    (counts, assessment) => ({
      missing: counts.missing + assessment.missingDataWarnings.length,
      stale: counts.stale + assessment.staleDataWarnings.length,
    }),
    { missing: 0, stale: 0 },
  );
}

function buildDataQualityLabel(params: {
  confidence: AssessmentConfidence;
  missing: number;
  stale: number;
  offline?: boolean;
}): { label: string; tone: ExpeditionCompactStatusTone } {
  if (params.missing > 0) {
    return {
      label: `${params.confidence.toUpperCase()} confidence / ${params.missing} missing`,
      tone: 'unavailable',
    };
  }
  if (params.stale > 0) {
    return {
      label: `${params.confidence.toUpperCase()} confidence / stale data`,
      tone: 'stale',
    };
  }
  if (params.offline) {
    return {
      label: `${params.confidence.toUpperCase()} confidence / offline capable`,
      tone: 'neutral',
    };
  }
  return {
    label: `${params.confidence.toUpperCase()} confidence / data current`,
    tone: 'good',
  };
}

function hasActiveExpedition(input: ExpeditionCompactStatusSummaryInput): boolean {
  const routeState = input.contextSnapshot?.route?.lifecycleState?.value;
  return Boolean(
    input.contextSnapshot?.expeditionId &&
      input.usingMockData !== true &&
      routeState === 'active',
  );
}

export function buildExpeditionCompactStatusSummary(
  input: ExpeditionCompactStatusSummaryInput,
): ExpeditionCompactStatusSummary {
  const overview = input.assessments?.overview;
  const assessmentList = Object.values(input.assessments ?? {}).filter(Boolean) as ExpeditionAssessment[];

  if (!hasActiveExpedition(input) || !overview) {
    return {
      available: false,
      status: 'unknown',
      statusLabel: 'No active expedition',
      headline: 'No active expedition',
      topConcern: 'Start navigation to load live expedition status.',
      topReason: null,
      nextRecommendedAction: 'Start navigation or enter manual expedition data.',
      nextCheckpointOrCampEta: 'Next checkpoint unavailable',
      convoyAccounted: 'Convoy unavailable',
      limitingResource: 'Resource status unavailable',
      limitingVehicle: 'Vehicle status unavailable',
      confidence: 'low',
      confidenceLabel: 'LOW confidence',
      dataQualityLabel: input.usingMockData ? 'Demo data hidden from compact status' : 'No active route context',
      dataQualityTone: 'unavailable',
      statusTone: 'unavailable',
      lastUpdated: input.contextSnapshot?.capturedAt ?? null,
    };
  }

  const logistics = input.assessments?.logistics;
  const vehicles = input.assessments?.vehicles;
  const camp = input.assessments?.camp;
  const statusLabel = STATUS_LABELS[overview.status];
  const warnings = countWarnings(assessmentList);
  const dataQuality = buildDataQualityLabel({
    confidence: overview.confidence,
    missing: warnings.missing,
    stale: warnings.stale,
    offline: input.offline,
  });
  const limitingResource = displayValue(dataValue(logistics, 'limiting-resource'));
  const limitingVehicle = displayValue(dataValue(vehicles, 'limiting-vehicle'));
  const topReason = overview.status === 'normal'
    ? null
    : overview.why[0] ?? overview.summary;

  return {
    available: true,
    status: overview.status,
    statusLabel,
    headline: `ECS Expedition Status: ${statusLabel}.`,
    topConcern:
      overview.status === 'normal'
        ? 'No leading concern.'
        : topReason ?? overview.summary,
    topReason,
    nextRecommendedAction: overview.recommendedAction,
    nextCheckpointOrCampEta: buildNextCheckpointOrCampEta(overview, camp),
    convoyAccounted: buildConvoyAccounted(overview),
    limitingResource: limitingResource && limitingResource !== 'none' ? limitingResource : 'No limiting resource',
    limitingVehicle: limitingVehicle ?? 'No limiting vehicle',
    confidence: overview.confidence,
    confidenceLabel: `${overview.confidence.toUpperCase()} confidence`,
    dataQualityLabel: dataQuality.label,
    dataQualityTone: dataQuality.tone,
    statusTone: STATUS_TONES[overview.status],
    lastUpdated: overview.lastUpdated,
  };
}
