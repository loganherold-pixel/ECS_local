import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessCategory,
  ExpeditionReadinessCategoryId,
  ExpeditionReadinessIssue as StoreReadinessIssue,
  ExpeditionReadinessSourceFreshness,
} from '../readiness/expeditionReadinessTypes';

export type ExpeditionReadinessDataState =
  | 'live'
  | 'estimated'
  | 'partial'
  | 'offline'
  | 'setupNeeded';

export type ExpeditionReadinessOverallStatus =
  | 'ready'
  | 'watch'
  | 'caution'
  | 'notReady'
  | 'unknown';

export type ExpeditionReadinessSystemStatus =
  | 'ready'
  | 'watch'
  | 'caution'
  | 'critical'
  | 'unknown';

export type ExpeditionReadinessSystemId =
  | 'vehicle'
  | 'route'
  | 'weather'
  | 'daylight'
  | 'power'
  | 'communications'
  | 'recovery'
  | 'camp'
  | 'incident'
  | 'offlineCache';

export interface ReadinessSystem {
  id: ExpeditionReadinessSystemId;
  label: string;
  value: string;
  status: ExpeditionReadinessSystemStatus;
  confidenceLabel: string;
  sourceLabel: string;
  isEstimated: boolean;
}

export interface ReadinessIssue {
  id: string;
  label: string;
  detail: string;
  systemId?: ExpeditionReadinessSystemId;
  severity: 'warning' | 'blocker';
  sourceLabel: string;
}

export interface ExpeditionReadinessCommandData {
  dataState: ExpeditionReadinessDataState;
  overallStatus: ExpeditionReadinessOverallStatus;
  overallScorePercent: number;
  primaryRecommendation: string;
  primaryReason: string;
  lastUpdatedAt: Date | null;
  systems: ReadinessSystem[];
  blockers: ReadinessIssue[];
  warnings: ReadinessIssue[];
  missingInputs: string[];
  confidenceLabel: string;
  isOffline: boolean;
  isUsingCachedData: boolean;
}

export interface ExpeditionReadinessCommandSnapshot {
  assessment?: ExpeditionReadinessAssessment | null;
  isOffline?: boolean | null;
  isUsingCachedData?: boolean | null;
  activeIncidentCount?: number | null;
  highestIncidentSeverity?: 'info' | 'watch' | 'warning' | 'critical' | null;
  sourceUpdatedAt?: string | number | Date | null;
}

const CATEGORY_TO_SYSTEM: Partial<Record<ExpeditionReadinessCategoryId, ExpeditionReadinessSystemId>> = {
  vehicle_fit: 'vehicle',
  fuel_range_margin: 'vehicle',
  route_risk: 'route',
  weather_window: 'weather',
  daylight_margin: 'daylight',
  power_runtime: 'power',
  communications_signal_confidence: 'communications',
  recovery_bailout_access: 'recovery',
  camp_legality_confidence: 'camp',
  offline_preparedness: 'offlineCache',
};

const SYSTEM_CATEGORY_PRIORITY: ReadonlyArray<{
  id: ExpeditionReadinessSystemId;
  label: string;
  categories: ExpeditionReadinessCategoryId[];
}> = [
  { id: 'vehicle', label: 'Vehicle', categories: ['vehicle_fit', 'fuel_range_margin'] },
  { id: 'route', label: 'Route', categories: ['route_risk'] },
  { id: 'weather', label: 'Weather', categories: ['weather_window'] },
  { id: 'daylight', label: 'Daylight', categories: ['daylight_margin'] },
  { id: 'power', label: 'Power', categories: ['power_runtime'] },
  { id: 'communications', label: 'Communications', categories: ['communications_signal_confidence'] },
  { id: 'recovery', label: 'Recovery Margin', categories: ['recovery_bailout_access'] },
  { id: 'camp', label: 'Camp / Overnight', categories: ['camp_legality_confidence'] },
  { id: 'incident', label: 'Incident / Dispatch', categories: [] },
  { id: 'offlineCache', label: 'Offline Cache', categories: ['offline_preparedness'] },
];

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function categoryStatusToSystemStatus(
  category: ExpeditionReadinessCategory | null,
): ExpeditionReadinessSystemStatus {
  if (!category) return 'unknown';
  if (category.status === 'hold') return 'critical';
  if (category.status === 'caution') return category.score < 45 ? 'critical' : 'caution';
  if (category.missingInputs.length > 0 || category.score < 72) return 'watch';
  return 'ready';
}

function mergeSystemStatus(
  current: ExpeditionReadinessSystemStatus,
  next: ExpeditionReadinessSystemStatus,
): ExpeditionReadinessSystemStatus {
  if (current === 'unknown') return next;
  if (next === 'unknown') return current;
  const rank: Record<ExpeditionReadinessSystemStatus, number> = {
    ready: 0,
    watch: 1,
    unknown: 2,
    caution: 3,
    critical: 4,
  };
  return rank[next] > rank[current] ? next : current;
}

function statusFromIncident(
  count: number,
  severity: ExpeditionReadinessCommandSnapshot['highestIncidentSeverity'],
): ExpeditionReadinessSystemStatus {
  if (count <= 0) return 'ready';
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'caution';
  return 'watch';
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function summarizeCategoryValue(category: ExpeditionReadinessCategory | null): string {
  if (!category) return 'Unavailable';
  if (category.summary.trim()) return category.summary;
  return `${Math.round(category.score)}%`;
}

function summarizeSystemValue(
  id: ExpeditionReadinessSystemId,
  categories: ExpeditionReadinessCategory[],
  incidentCount: number,
): string {
  if (id === 'incident') {
    if (incidentCount <= 0) return 'No active incidents';
    return `${incidentCount} active ${incidentCount === 1 ? 'incident' : 'incidents'}`;
  }
  if (categories.length === 0) return 'Unavailable';
  if (categories.length === 1) return summarizeCategoryValue(categories[0]);
  const worst = categories
    .slice()
    .sort((a, b) => systemStatusRank(categoryStatusToSystemStatus(b)) - systemStatusRank(categoryStatusToSystemStatus(a)))[0];
  return summarizeCategoryValue(worst);
}

function systemStatusRank(status: ExpeditionReadinessSystemStatus): number {
  switch (status) {
    case 'critical':
      return 4;
    case 'caution':
      return 3;
    case 'unknown':
      return 2;
    case 'watch':
      return 1;
    case 'ready':
    default:
      return 0;
  }
}

function confidenceLabel(categories: ExpeditionReadinessCategory[]): string {
  if (categories.length === 0) return 'Unknown confidence';
  const confidences = categories.map((category) => category.confidence);
  if (confidences.includes('low')) return 'Low confidence';
  if (confidences.includes('medium')) return 'Medium confidence';
  return 'High confidence';
}

function sourceLabel(categories: ExpeditionReadinessCategory[]): string {
  if (categories.length === 0) return 'Source unavailable';
  const sourceKinds = new Set(
    categories.flatMap((category) => category.factors.map((factor) => factor.source)),
  );
  if (sourceKinds.has('live')) return 'Live ECS source';
  if (sourceKinds.has('manual')) return 'Manual profile source';
  if (sourceKinds.has('cached')) return 'Cached ECS source';
  if (sourceKinds.has('inferred')) return 'ECS-Inferred source';
  if (sourceKinds.has('missing')) return 'Source missing';
  return titleCase([...sourceKinds][0] ?? 'unknown');
}

function isEstimatedSystem(categories: ExpeditionReadinessCategory[]): boolean {
  if (categories.length === 0) return true;
  return categories.some((category) =>
    category.confidence !== 'high' ||
    category.missingInputs.length > 0 ||
    category.factors.some((factor) => factor.isInferred || factor.isStale || factor.source !== 'live'),
  );
}

function normalizeIssue(
  issue: StoreReadinessIssue,
  severity: 'warning' | 'blocker',
): ReadinessIssue {
  return {
    id: issue.id,
    label: issue.label,
    detail: issue.detail,
    systemId: CATEGORY_TO_SYSTEM[issue.categoryId],
    severity,
    sourceLabel: titleCase(issue.categoryId),
  };
}

function freshnessRecords(freshness: ExpeditionReadinessSourceFreshness | null | undefined) {
  return freshness ? Object.values(freshness) : [];
}

function sourceMix(snapshot: ExpeditionReadinessCommandSnapshot): {
  isUsingCachedData: boolean;
  hasStaleData: boolean;
  hasMissingData: boolean;
  hasInferredData: boolean;
} {
  const assessment = snapshot.assessment ?? null;
  const records = freshnessRecords(assessment?.sourceFreshness);
  const hasStaleData = records.some((record) => record.isStale || record.state === 'stale');
  const hasMissingData = records.some((record) => record.isMissing || record.state === 'missing');
  const hasInferredData = Boolean(assessment?.dataIntegrity.usesInferredData) ||
    records.some((record) => record.isInferred || record.state === 'inferred');
  const isUsingCachedData = Boolean(snapshot.isUsingCachedData) ||
    records.some((record) => record.source === 'cached' || record.state === 'stale');
  return { isUsingCachedData, hasStaleData, hasMissingData, hasInferredData };
}

function resolveOverallStatus(
  assessment: ExpeditionReadinessAssessment | null,
  systems: ReadinessSystem[],
): ExpeditionReadinessOverallStatus {
  if (!assessment) return 'unknown';
  if (assessment.status === 'hold') return 'notReady';
  if (systems.some((system) => system.status === 'critical')) return 'notReady';
  const cautionCount = systems.filter((system) => system.status === 'caution').length;
  const watchCount = systems.filter((system) => system.status === 'watch' || system.status === 'unknown').length;
  if (assessment.status === 'caution' || cautionCount >= 2) return 'caution';
  if (assessment.warnings.length > 0 || cautionCount === 1 || watchCount >= 2) return 'watch';
  return 'ready';
}

function resolveDataState(
  assessment: ExpeditionReadinessAssessment | null,
  params: {
    isOffline: boolean;
    missingInputs: string[];
    hasStaleData: boolean;
    hasMissingData: boolean;
    hasInferredData: boolean;
  },
): ExpeditionReadinessDataState {
  if (!assessment) return 'setupNeeded';
  if (params.isOffline) return 'offline';
  const missingText = params.missingInputs.join(' ').toLowerCase();
  const missingLocation =
    missingText.includes('currentlocation') ||
    missingText.includes('current location') ||
    missingText.includes('location') ||
    missingText.includes('gps');
  const missingVehicle =
    missingText.includes('fleet') ||
    missingText.includes('vehicle profile') ||
    missingText.includes('active vehicle') ||
    missingText.includes('vehicle');
  if (missingLocation || missingVehicle) {
    return params.missingInputs.length >= 4 ? 'setupNeeded' : 'partial';
  }
  if (params.missingInputs.length >= 4 || params.hasMissingData) return 'partial';
  if (params.hasStaleData || params.hasInferredData || assessment.confidence !== 'high') return 'estimated';
  return 'live';
}

function normalizeMissingInputs(assessment: ExpeditionReadinessAssessment | null): string[] {
  if (!assessment) return ['Readiness assessment'];
  return [
    ...new Set(
      assessment.categories.flatMap((category) =>
        category.missingInputs.map((input) => input.trim()).filter(Boolean),
      ),
    ),
  ];
}

function resolvePrimaryCopy(data: {
  overallStatus: ExpeditionReadinessOverallStatus;
  assessment: ExpeditionReadinessAssessment | null;
  systems: ReadinessSystem[];
  dataState: ExpeditionReadinessDataState;
}): { primaryRecommendation: string; primaryReason: string } {
  if (!data.assessment) {
    return {
      primaryRecommendation: 'READINESS ASSESSMENT LIMITED',
      primaryReason: 'ECS needs current expedition inputs before continuation readiness can be scored.',
    };
  }
  if (data.dataState === 'offline') {
    return {
      primaryRecommendation: 'OFFLINE - VERIFY ROUTE CACHE',
      primaryReason: 'Offline or cached inputs limit live continuation confidence.',
    };
  }
  const critical = data.systems.find((system) => system.status === 'critical');
  if (critical) {
    if (critical.id === 'incident') {
      return {
        primaryRecommendation: 'HOLD POSITION - INCIDENT ACTIVE',
        primaryReason: critical.value,
      };
    }
    return {
      primaryRecommendation: `RESOLVE ${critical.label.toUpperCase()} WARNING`,
      primaryReason: critical.value,
    };
  }
  const caution = data.systems.find((system) => system.status === 'caution');
  if (data.overallStatus === 'caution' || caution) {
    return {
      primaryRecommendation: data.assessment.recommendations[0]?.toUpperCase() ?? 'CONTINUE WITH CAUTION',
      primaryReason: caution?.value ?? data.assessment.explanation,
    };
  }
  if (data.overallStatus === 'watch') {
    return {
      primaryRecommendation: 'READY WITH WATCH ITEMS',
      primaryReason: data.assessment.warnings[0]?.detail ?? data.assessment.explanation,
    };
  }
  return {
    primaryRecommendation: 'READY TO CONTINUE',
    primaryReason: data.assessment.explanation || 'Major ECS readiness systems are within current confidence margins.',
  };
}

export function normalizeExpeditionReadinessCommandData(
  snapshot: ExpeditionReadinessCommandSnapshot = {},
): ExpeditionReadinessCommandData {
  const assessment = snapshot.assessment ?? null;
  const incidentCount = Math.max(0, Math.round(finite(snapshot.activeIncidentCount) ?? 0));
  const categoryById = new Map<ExpeditionReadinessCategoryId, ExpeditionReadinessCategory>(
    (assessment?.categories ?? []).map((category) => [category.id, category]),
  );

  const systems = SYSTEM_CATEGORY_PRIORITY.map<ReadinessSystem>((definition) => {
    const categories = definition.categories
      .map((id) => categoryById.get(id))
      .filter((category): category is ExpeditionReadinessCategory => Boolean(category));
    let status: ExpeditionReadinessSystemStatus =
      definition.id === 'incident'
        ? statusFromIncident(incidentCount, snapshot.highestIncidentSeverity ?? null)
        : 'unknown';
    for (const category of categories) {
      status = mergeSystemStatus(status, categoryStatusToSystemStatus(category));
    }

    return {
      id: definition.id,
      label: definition.label,
      value: summarizeSystemValue(definition.id, categories, incidentCount),
      status,
      confidenceLabel: definition.id === 'incident' ? 'Dispatch signal' : confidenceLabel(categories),
      sourceLabel: definition.id === 'incident' ? 'Dispatch / CAD' : sourceLabel(categories),
      isEstimated:
        definition.id === 'incident'
          ? false
          : isEstimatedSystem(categories),
    };
  });

  const missingInputs = normalizeMissingInputs(assessment);
  const mix = sourceMix(snapshot);
  const isOffline = Boolean(snapshot.isOffline);
  const dataState = resolveDataState(assessment, {
    isOffline,
    missingInputs,
    hasStaleData: mix.hasStaleData,
    hasMissingData: mix.hasMissingData,
    hasInferredData: mix.hasInferredData,
  });
  const overallStatus = resolveOverallStatus(assessment, systems);
  const score =
    assessment == null
      ? 0
      : clamp(Math.round(assessment.overallScore), 0, 100);
  const copy = resolvePrimaryCopy({ overallStatus, assessment, systems, dataState });

  return {
    dataState,
    overallStatus,
    overallScorePercent: score,
    ...copy,
    lastUpdatedAt: normalizeDate(snapshot.sourceUpdatedAt) ?? normalizeDate(assessment?.updatedAt),
    systems,
    blockers: (assessment?.blockers ?? []).map((issue) => normalizeIssue(issue, 'blocker')),
    warnings: (assessment?.warnings ?? []).map((issue) => normalizeIssue(issue, 'warning')),
    missingInputs,
    confidenceLabel: assessment
      ? `${titleCase(assessment.confidence)} confidence`
      : 'Setup needed',
    isOffline,
    isUsingCachedData: mix.isUsingCachedData,
  };
}
