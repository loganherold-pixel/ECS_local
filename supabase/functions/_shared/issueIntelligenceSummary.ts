export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type IssueEvent = {
  id?: string;
  occurredAt?: string | null;
  eventType?: string | null;
  severity?: string | null;
  issueTitle?: string | null;
  issueSignature?: string | null;
  normalizedSignature?: string | null;
  ecsArea?: string | null;
  message?: string | null;
  sourceKind?: string | null;
  hashedUserId?: string | null;
  hashedSessionId?: string | null;
  runtimeContext?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  issueFamily?: string | null;
  rootConditionKey?: string | null;
  groupingSignature?: string | null;
  issueClass?: string | null;
  affectedSurfaces?: string[] | null;
  providerFamily?: string | null;
  confidenceHint?: number | null;
};

export type IssueEventRow = {
  received_at?: string | null;
  occurred_at?: string | null;
  event_type?: string | null;
  severity?: string | null;
  issue_title?: string | null;
  issue_signature?: string | null;
  normalized_signature?: string | null;
  ecs_area?: string | null;
  message?: string | null;
  source_kind?: string | null;
  hashed_user_id?: string | null;
  hashed_session_id?: string | null;
  app_version?: string | null;
  build_version?: string | null;
  platform?: string | null;
  environment?: string | null;
  runtime_context?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
type IssueTrendDirection = 'up' | 'down' | 'flat' | 'new' | 'quieted';
type ConfidenceLabel = 'high' | 'moderate' | 'limited' | 'low';

type IssueGroupSummary = {
  signature: string;
  title: string;
  issueType: string;
  severity: IssueSeverity;
  ecsArea: string;
  issueFamily: string;
  issueClass: string;
  confidenceLabel: ConfidenceLabel;
  confidenceScore: number;
  appVersionsAffected: string[];
  buildVersionsAffected: string[];
  usersImpactedCount: number;
  sessionsImpactedCount: number;
  eventCount: number;
  recurrenceCount: number;
  firstSeen: string;
  lastSeen: string;
  trendDirection: IssueTrendDirection;
  releaseRegression: boolean;
  topContextTags: Record<string, string | null>;
  affectedSurfaces: string[];
  providerFamilies: string[];
  degradedOrOfflineRate: number;
  offlineCorrelation: 'high' | 'moderate' | 'low';
};

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function toJson(value: unknown): Json {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => toJson(item));
  if (typeof value === 'object') {
    const record: Record<string, Json> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested !== undefined) record[key] = toJson(nested);
    }
    return record;
  }
  return String(value);
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map((part) => Number(part));
  const bParts = b.split('.').map((part) => Number(part));
  const length = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < length; index += 1) {
    const left = Number.isFinite(aParts[index]) ? aParts[index] : 0;
    const right = Number.isFinite(bParts[index]) ? bParts[index] : 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}

function uniqueStrings(values: Array<unknown>): string[] {
  return Array.from(
    new Set(values.map((value) => safeString(value, '')).filter(Boolean)),
  );
}

function metadataOf(row: IssueEventRow): Record<string, unknown> {
  return row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata
    : {};
}

function runtimeOf(row: IssueEventRow): Record<string, unknown> {
  return row.runtime_context && typeof row.runtime_context === 'object' && !Array.isArray(row.runtime_context)
    ? row.runtime_context
    : {};
}

function metadataString(row: IssueEventRow, key: string): string {
  return safeString(metadataOf(row)[key], '');
}

function asProviderFamily(metadata: Record<string, unknown>): string | null {
  const candidates = [
    metadata.providerFamily,
    metadata.provider,
    metadata.activeProvider,
    metadata.deviceProvider,
  ];

  for (const candidate of candidates) {
    const value = cleanText(candidate);
    if (value) return value.replace(/\s+/g, '_');
  }

  return null;
}

function deriveIssueFamily(row: IssueEventRow): string {
  const stored = metadataString(row, 'issueFamily');
  if (stored) return stored;

  const metadata = metadataOf(row);
  const combined = [
    row.issue_title,
    row.message,
    row.issue_signature,
    row.normalized_signature,
    metadata.category,
    metadata.signature,
    metadata.status,
    metadata.finalSource,
    metadata.contradictionCode,
    metadata.error && typeof metadata.error === 'object'
      ? JSON.stringify(metadata.error)
      : metadata.error,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(' ');

  if (includesAny(combined, ['runtime_smoke', 'readiness_', 'expedition readiness', 'command-state contradiction', 'command state contradiction', 'lead expression drift', 'severity drift'])) {
    return 'command_state_contradiction';
  }
  if (includesAny(combined, ['route restore', 'restore route', 'cached route', 'restore mismatch'])) {
    return 'route_restore_failure';
  }
  if (includesAny(combined, ['cold launch', 'launch restore', 'shell restore', 'login restore'])) {
    return 'cold_launch_restore_mismatch';
  }
  if (includesAny(combined, ['stale-state drift', 'stale state drift', 'stale command', 'ghost summary'])) {
    return 'stale_command_state_drift';
  }
  if (includesAny(combined, ['gps', 'guidance', 'tracking', 'location services', 'gps lost', 'gps weak'])) {
    return 'gps_guidance_degradation';
  }
  if (includesAny(combined, ['explore', 'hidden gem', 'hidden_gems', 'popular trail', 'route ideas', 'orchestration fallback', 'no refinement'])) {
    return 'explore_orchestration_fallback';
  }
  if (includesAny(combined, ['ble', 'bluetooth', 'telemetry unavailable', 'provider disconnected', 'reconnect'])) {
    return 'provider_connectivity_issue';
  }
  if (includesAny(combined, ['sync', 'reconnect', 'offline', 'network', 'rate limit', 'connectivity'])) {
    return row.ecs_area === 'offline'
      ? 'offline_degraded_fallback'
      : 'sync_connectivity_degradation';
  }
  if (includesAny(combined, ['tile', 'cache', 'region', 'offline map', 'map coverage'])) {
    return 'map_cache_issue';
  }
  if (includesAny(combined, ['widget', 'render failure', 'render error', 'unavailable state'])) {
    return 'widget_render_instability';
  }
  if (includesAny(combined, ['alert surface', 'alert screen', 'severity orchestration'])) {
    return 'alert_surface_failure';
  }
  if (includesAny(combined, ['weather', 'forecast', 'openweather', 'edge function returned'])) {
    return 'weather_support_degradation';
  }
  if (includesAny(combined, ['overflow', 'layout', 'clip', 'container', 'dimension change'])) {
    return 'ui_render_overflow';
  }
  if (includesAny(combined, ['edge function', 'supabase', 'cloud dependency', 'issue-intelligence', 'invoke failed'])) {
    return 'edge_function_failure';
  }
  if (includesAny(combined, ['route state', 'route mismatch', 'reroute', 'navigation state'])) {
    return 'route_state_mismatch';
  }
  if (includesAny(combined, ['access restore', 'auth restore', 'entitlement', 'billing restore', 'access-state contradiction', 'valid access gated'])) {
    return 'shell_access_restore';
  }

  if (row.ecs_area === 'gps') return 'gps_guidance_degradation';
  if (row.ecs_area === 'bluetooth_telemetry') return 'provider_connectivity_issue';
  if (row.ecs_area === 'explore') return 'explore_orchestration_fallback';
  if (row.ecs_area === 'widgets') return 'widget_render_instability';
  if (row.ecs_area === 'weather') return 'weather_support_degradation';
  if (row.ecs_area === 'offline') return 'offline_degraded_fallback';

  return 'general_runtime_failure';
}

function deriveAffectedSurfaces(row: IssueEventRow): string[] {
  const stored = metadataOf(row).affectedSurfaces;
  if (Array.isArray(stored)) {
    return uniqueStrings(stored);
  }

  const metadata = metadataOf(row);
  const runtime = runtimeOf(row);
  return uniqueStrings([
    row.ecs_area === 'unknown' ? null : row.ecs_area,
    runtime.activeTab,
    metadata.surface,
    metadata.tab,
    metadata.system,
    metadata.activeTab,
  ]);
}

function deriveIssueClass(row: IssueEventRow, issueFamily: string): string {
  const stored = metadataString(row, 'issueClass');
  if (stored) return stored;

  if (row.severity === 'critical' || row.event_type === 'fatal') {
    return 'critical_operational_failure';
  }
  if (
    issueFamily === 'gps_guidance_degradation'
    || issueFamily === 'route_restore_failure'
    || issueFamily === 'provider_connectivity_issue'
    || issueFamily === 'alert_surface_failure'
    || issueFamily === 'command_state_contradiction'
  ) {
    return row.severity === 'high'
      ? 'user_impacting_functional_failure'
      : 'feature_reliability_concern';
  }
  if (issueFamily === 'stale_command_state_drift') {
    return 'release_polish_regression_candidate';
  }
  if (row.event_type === 'degraded_state') {
    return 'recurring_degraded_pattern';
  }
  if (row.event_type === 'layout_failure' || row.event_type === 'data_integrity_failure') {
    return 'release_polish_regression_candidate';
  }
  return 'informational_diagnostic_event';
}

function rootConditionKey(row: IssueEventRow, issueFamily: string, providerFamily: string | null): string {
  const stored = metadataString(row, 'rootConditionKey');
  if (stored) return stored;
  return providerFamily ? `${issueFamily}:${providerFamily}` : issueFamily;
}

function groupingSignature(row: IssueEventRow): string {
  const stored = metadataString(row, 'groupingSignature');
  if (stored) return stored;

  const issueFamily = deriveIssueFamily(row);
  const providerFamily = asProviderFamily(metadataOf(row));
  const rootKey = rootConditionKey(row, issueFamily, providerFamily);
  const area = safeString(row.ecs_area, 'unknown');
  const routeState = safeString(runtimeOf(row).routeState, '');

  return [
    rootKey,
    area === 'unknown' ? null : area,
    routeState === 'active' ? 'active_route' : null,
  ]
    .filter(Boolean)
    .join(':') || safeString(row.normalized_signature, 'unknown');
}

function severityRank(severity: string | null | undefined): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
}

function maxSeverity(rows: IssueEventRow[]): IssueSeverity {
  const severity = [...rows].sort((left, right) => severityRank(right.severity) - severityRank(left.severity))[0]?.severity;
  return severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'low'
    ? severity
    : 'low';
}

function strongestIssueClass(rows: IssueEventRow[]): string {
  const classes = rows.map((row) => deriveIssueClass(row, deriveIssueFamily(row)));
  const order = [
    'critical_operational_failure',
    'release_polish_regression_candidate',
    'user_impacting_functional_failure',
    'feature_reliability_concern',
    'recurring_degraded_pattern',
    'informational_diagnostic_event',
  ];

  return order.find((issueClass) => classes.includes(issueClass))
    ?? 'informational_diagnostic_event';
}

function confidenceHint(row: IssueEventRow): number {
  const stored = metadataOf(row).confidenceHint;
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored;
  if (row.source_kind === 'field_report') return 0.45;
  if (row.event_type === 'fatal') return 0.75;
  if (row.event_type === 'degraded_state') return 0.55;
  return 0.4;
}

function groupConfidence(rows: IssueEventRow[]): { score: number; label: ConfidenceLabel } {
  const eventCount = rows.length;
  const uniqueSessions = new Set(rows.map((row) => row.hashed_session_id).filter(Boolean)).size;
  const uniqueUsers = new Set(rows.map((row) => row.hashed_user_id).filter(Boolean)).size;
  const contextRichCount = rows.filter((row) => {
    const runtime = runtimeOf(row);
    return runtime.activeTab || runtime.expeditionPhase || runtime.syncStatus;
  }).length;
  const averageHint = rows.reduce((sum, row) => sum + confidenceHint(row), 0) / Math.max(1, eventCount);

  const score = Math.max(
    0.12,
    Math.min(
      0.96,
      averageHint
        + Math.min(0.28, eventCount * 0.05)
        + Math.min(0.18, uniqueSessions * 0.06)
        + Math.min(0.12, uniqueUsers * 0.06)
        + Math.min(0.12, contextRichCount * 0.03),
    ),
  );

  const label =
    score >= 0.78
      ? 'high'
      : score >= 0.58
        ? 'moderate'
        : score >= 0.36
          ? 'limited'
          : 'low';

  return { score, label };
}

function trendDirection(rows: IssueEventRow[]): IssueTrendDirection {
  if (rows.length === 0) return 'quieted';

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const recentStart = now - sevenDaysMs;
  const priorStart = now - sevenDaysMs * 2;

  const recentCount = rows.filter((row) => {
    const time = Date.parse(safeString(row.received_at ?? row.occurred_at, ''));
    return Number.isFinite(time) && time >= recentStart;
  }).length;

  const priorCount = rows.filter((row) => {
    const time = Date.parse(safeString(row.received_at ?? row.occurred_at, ''));
    return Number.isFinite(time) && time >= priorStart && time < recentStart;
  }).length;

  const newest = [...rows].sort((left, right) => (
    Date.parse(safeString(right.received_at ?? right.occurred_at, ''))
      - Date.parse(safeString(left.received_at ?? left.occurred_at, ''))
  ))[0];
  const newestTime = newest ? Date.parse(safeString(newest.received_at ?? newest.occurred_at, '')) : 0;

  if (recentCount > 0 && priorCount === 0) {
    return now - newestTime <= 48 * 60 * 60 * 1000 ? 'new' : 'up';
  }
  if (recentCount === 0) return 'quieted';
  if (recentCount > priorCount * 1.25) return 'up';
  if (priorCount > recentCount * 1.25) return 'down';
  return 'flat';
}

function offlineCorrelation(rows: IssueEventRow[]): { rate: number; label: 'high' | 'moderate' | 'low' } {
  if (rows.length === 0) return { rate: 0, label: 'low' };

  const correlatedCount = rows.filter((row) => {
    const connectivity = runtimeOf(row).connectivityState;
    return connectivity === 'offline' || connectivity === 'offline_capable' || connectivity === 'degraded';
  }).length;

  const rate = correlatedCount / rows.length;
  return {
    rate,
    label: rate >= 0.66 ? 'high' : rate >= 0.34 ? 'moderate' : 'low',
  };
}

function topContextTags(rows: IssueEventRow[]): Record<string, string | null> {
  const pickMostCommon = (values: unknown[]): string | null => {
    const counts = new Map<string, number>();
    values.forEach((value) => {
      const normalized = safeString(value, '');
      if (!normalized) return;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    });

    let top: string | null = null;
    let topCount = 0;
    counts.forEach((count, value) => {
      if (count > topCount) {
        top = value;
        topCount = count;
      }
    });
    return top;
  };

  return {
    activeTab: pickMostCommon(rows.map((row) => runtimeOf(row).activeTab)),
    routeState: pickMostCommon(rows.map((row) => runtimeOf(row).routeState)),
    gpsState: pickMostCommon(rows.map((row) => runtimeOf(row).gpsState)),
    connectivityState: pickMostCommon(rows.map((row) => runtimeOf(row).connectivityState)),
    expeditionPhase: pickMostCommon(rows.map((row) => runtimeOf(row).expeditionPhase)),
    degradedState: pickMostCommon(rows.map((row) => runtimeOf(row).degradedState)),
    providerFamily: pickMostCommon(rows.map((row) => asProviderFamily(metadataOf(row)))),
  };
}

function groupTitle(rows: IssueEventRow[]): string {
  const explicitFieldReport = rows.find((row) => row.event_type === 'field_report' && row.issue_title);
  if (explicitFieldReport) return safeString(explicitFieldReport.issue_title, 'Grouped ECS field issue');

  const mostRecent = [...rows].sort((left, right) => (
    Date.parse(safeString(right.received_at ?? right.occurred_at, ''))
      - Date.parse(safeString(left.received_at ?? left.occurred_at, ''))
  ))[0];
  return safeString(mostRecent?.issue_title, 'Grouped ECS field issue');
}

function compareSeverity(left: IssueGroupSummary, right: IssueGroupSummary): number {
  const order = { critical: 4, high: 3, medium: 2, low: 1 };
  if (order[right.severity] !== order[left.severity]) {
    return order[right.severity] - order[left.severity];
  }
  if (right.confidenceScore !== left.confidenceScore) {
    return right.confidenceScore - left.confidenceScore;
  }
  if (right.eventCount !== left.eventCount) {
    return right.eventCount - left.eventCount;
  }
  return Date.parse(right.lastSeen) - Date.parse(left.lastSeen);
}

function compareFreshness(left: IssueGroupSummary, right: IssueGroupSummary): number {
  return Date.parse(right.lastSeen) - Date.parse(left.lastSeen);
}

function summarizeGroupedRows(groupedRows: Map<string, IssueEventRow[]>, latestVersion: string | null): IssueGroupSummary[] {
  const groups: IssueGroupSummary[] = [];

  groupedRows.forEach((rows, signature) => {
    const ordered = [...rows].sort((left, right) => (
      Date.parse(safeString(left.received_at ?? left.occurred_at, ''))
        - Date.parse(safeString(right.received_at ?? right.occurred_at, ''))
    ));
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (!first || !last) return;

    const confidence = groupConfidence(rows);
    const offline = offlineCorrelation(rows);
    const appVersionsAffected = uniqueStrings(rows.map((row) => row.app_version)).sort(compareVersions);
    const buildVersionsAffected = uniqueStrings(rows.map((row) => row.build_version ?? runtimeOf(row).buildVersion));
    const providerFamilies = uniqueStrings(rows.map((row) => asProviderFamily(metadataOf(row))));
    const affectedSurfaces = uniqueStrings(rows.flatMap(deriveAffectedSurfaces));
    const issueFamily = deriveIssueFamily(first);
    const trend = trendDirection(rows);

    groups.push({
      signature,
      title: groupTitle(rows),
      issueType: safeString(last.event_type, 'non_fatal'),
      severity: maxSeverity(rows),
      ecsArea: safeString(first.ecs_area, 'unknown'),
      issueFamily,
      issueClass: strongestIssueClass(rows),
      confidenceLabel: confidence.label,
      confidenceScore: Number(confidence.score.toFixed(2)),
      appVersionsAffected,
      buildVersionsAffected,
      usersImpactedCount: new Set(rows.map((row) => row.hashed_user_id).filter(Boolean)).size,
      sessionsImpactedCount: new Set(rows.map((row) => row.hashed_session_id).filter(Boolean)).size,
      eventCount: rows.length,
      recurrenceCount: rows.length,
      firstSeen: safeString(first.received_at ?? first.occurred_at, new Date().toISOString()),
      lastSeen: safeString(last.received_at ?? last.occurred_at, new Date().toISOString()),
      trendDirection: trend,
      releaseRegression: Boolean(latestVersion && appVersionsAffected.includes(latestVersion) && (trend === 'up' || trend === 'new')),
      topContextTags: topContextTags(rows),
      affectedSurfaces,
      providerFamilies,
      degradedOrOfflineRate: Number(offline.rate.toFixed(2)),
      offlineCorrelation: offline.label,
    });
  });

  return groups.sort(compareSeverity);
}

export function normalizeIssueEventForInsert(event: IssueEvent) {
  const metadata = {
    ...(event.metadata ?? {}),
    ...(safeString(event.issueFamily, '') ? { issueFamily: safeString(event.issueFamily, '') } : {}),
    ...(safeString(event.rootConditionKey, '') ? { rootConditionKey: safeString(event.rootConditionKey, '') } : {}),
    ...(safeString(event.groupingSignature, '') ? { groupingSignature: safeString(event.groupingSignature, '') } : {}),
    ...(safeString(event.issueClass, '') ? { issueClass: safeString(event.issueClass, '') } : {}),
    ...(Array.isArray(event.affectedSurfaces) ? { affectedSurfaces: event.affectedSurfaces } : {}),
    ...(safeString(event.providerFamily, '') ? { providerFamily: safeString(event.providerFamily, '') } : {}),
    ...(typeof event.confidenceHint === 'number' && Number.isFinite(event.confidenceHint) ? { confidenceHint: event.confidenceHint } : {}),
  };

  return {
    occurred_at: safeString(event.occurredAt, new Date().toISOString()),
    event_type: safeString(event.eventType, 'non_fatal'),
    severity: safeString(event.severity, 'medium'),
    issue_title: safeString(event.issueTitle, 'Unnamed ECS issue'),
    issue_signature: safeString(event.issueSignature, 'unknown'),
    normalized_signature: safeString(event.normalizedSignature, 'unknown'),
    ecs_area: safeString(event.ecsArea, 'unknown'),
    message: safeString(event.message, ''),
    source_kind: safeString(event.sourceKind, 'runtime'),
    hashed_user_id: safeString(event.hashedUserId, '') || null,
    hashed_session_id: safeString(event.hashedSessionId, '') || null,
    app_version: safeString((event.runtimeContext as Record<string, unknown> | null)?.appVersion, '') || null,
    platform: safeString((event.runtimeContext as Record<string, unknown> | null)?.platform, '') || null,
    environment: safeString((event.runtimeContext as Record<string, unknown> | null)?.environment, '') || null,
    runtime_context: toJson(event.runtimeContext ?? {}) as Record<string, Json>,
    metadata: toJson(metadata) as Record<string, Json>,
  };
}

export function buildIssueGroupSummary(rows: IssueEventRow[]) {
  const grouped = new Map<string, IssueEventRow[]>();
  rows.forEach((row) => {
    const key = groupingSignature(row);
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  });

  const versions = uniqueStrings(rows.map((row) => row.app_version)).sort(compareVersions);
  const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null;
  const groups = summarizeGroupedRows(grouped, latestVersion);
  const activeGroups = groups.filter((group) => group.trendDirection !== 'quieted');
  const frequentIssues = [...groups].sort((left, right) => right.eventCount - left.eventCount || compareSeverity(left, right)).slice(0, 8);
  const newSinceLatestRelease = groups.filter((group) => group.trendDirection === 'new' || group.releaseRegression).sort(compareFreshness).slice(0, 8);
  const regressions = groups.filter((group) => group.releaseRegression).sort(compareSeverity).slice(0, 8);
  const trendingUp = groups.filter((group) => group.trendDirection === 'up' || group.trendDirection === 'new').sort(compareSeverity).slice(0, 8);
  const trendingDown = groups.filter((group) => group.trendDirection === 'down').sort(compareFreshness).slice(0, 8);
  const resolvedOrQuieted = groups.filter((group) => group.trendDirection === 'quieted' || group.trendDirection === 'down').sort(compareFreshness).slice(0, 8);
  const severeActive = groups.filter((group) => group.severity === 'critical' || group.severity === 'high').sort(compareSeverity).slice(0, 8);

  return {
    latestVersion,
    groups,
    activeGroups,
    frequentIssues,
    newSinceLatestRelease,
    regressions,
    trendingUp,
    trendingDown,
    resolvedOrQuieted,
    severeActive,
  };
}
