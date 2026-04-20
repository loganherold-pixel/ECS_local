export type EcsIssueEventType =
  | 'fatal'
  | 'non_fatal'
  | 'degraded_state'
  | 'recoverable_failure'
  | 'layout_failure'
  | 'data_integrity_failure'
  | 'field_report';

export type EcsIssueSeverity = 'critical' | 'high' | 'medium' | 'low';

export type EcsIssueArea =
  | 'app_shell'
  | 'fleet'
  | 'navigate'
  | 'dashboard'
  | 'explore'
  | 'alert'
  | 'weather'
  | 'gps'
  | 'bluetooth_telemetry'
  | 'widgets'
  | 'vehicle_display'
  | 'offline'
  | 'admin'
  | 'unknown';

export type EcsIssueTrendDirection = 'up' | 'down' | 'flat' | 'new' | 'quieted';

export type EcsFieldFeedbackIssueFamily =
  | 'route_restore_failure'
  | 'gps_guidance_degradation'
  | 'provider_connectivity_issue'
  | 'sync_connectivity_degradation'
  | 'command_state_contradiction'
  | 'stale_command_state_drift'
  | 'map_cache_issue'
  | 'widget_render_instability'
  | 'explore_orchestration_fallback'
  | 'alert_surface_failure'
  | 'cold_launch_restore_mismatch'
  | 'weather_support_degradation'
  | 'offline_degraded_fallback'
  | 'route_state_mismatch'
  | 'shell_access_restore'
  | 'ui_render_overflow'
  | 'edge_function_failure'
  | 'general_runtime_failure';

export type EcsFieldFeedbackIssueClass =
  | 'informational_diagnostic_event'
  | 'recurring_degraded_pattern'
  | 'user_impacting_functional_failure'
  | 'feature_reliability_concern'
  | 'release_polish_regression_candidate'
  | 'critical_operational_failure';

export type EcsFieldFeedbackConfidenceLabel =
  | 'high'
  | 'moderate'
  | 'limited'
  | 'low';

export interface EcsIssueContext {
  appVersion: string;
  buildVersion: string | null;
  platform: string;
  environment: string;
  activeTab: string | null;
  routeState: 'none' | 'preview' | 'active' | 'paused' | 'completed';
  gpsState: 'live' | 'degraded' | 'unavailable';
  bluetoothTelemetryState: 'connected' | 'disconnected' | 'unavailable';
  connectivityState: 'online' | 'offline_capable' | 'degraded' | 'offline' | 'reconnecting';
  syncStatus: string | null;
  expeditionPhase: string | null;
  degradedState: string | null;
  offlineReadiness: 'ready' | 'partial' | 'stale' | 'missing';
  weatherStatus: 'live' | 'stale' | 'unavailable';
  remotenessAvailable: boolean;
  carSessionActive: boolean;
  layoutClass: 'compact' | 'medium' | 'expanded';
  fallbackUsed: boolean;
  activeGuidanceExpected: boolean;
  coldLaunchRestore: boolean;
}

export interface EcsFieldFeedbackEvent {
  id: string;
  occurredAt: string;
  eventType: EcsIssueEventType;
  severity: EcsIssueSeverity;
  issueTitle: string;
  issueSignature: string;
  normalizedSignature: string;
  ecsArea: EcsIssueArea;
  message: string | null;
  runtimeContext: EcsIssueContext;
  metadata: Record<string, unknown>;
  sourceKind: 'runtime' | 'field_report';
  hashedUserId: string | null;
  hashedSessionId: string;
  issueFamily: EcsFieldFeedbackIssueFamily;
  rootConditionKey: string;
  groupingSignature: string;
  issueClass: EcsFieldFeedbackIssueClass;
  affectedSurfaces: string[];
  providerFamily: string | null;
  confidenceHint: number;
}

export interface EcsIssueGroupSummary {
  signature: string;
  title: string;
  issueType: EcsIssueEventType;
  severity: EcsIssueSeverity;
  ecsArea: EcsIssueArea;
  issueFamily: EcsFieldFeedbackIssueFamily;
  issueClass: EcsFieldFeedbackIssueClass;
  confidenceLabel: EcsFieldFeedbackConfidenceLabel;
  confidenceScore: number;
  appVersionsAffected: string[];
  buildVersionsAffected: string[];
  usersImpactedCount: number;
  sessionsImpactedCount: number;
  eventCount: number;
  recurrenceCount: number;
  firstSeen: string;
  lastSeen: string;
  trendDirection: EcsIssueTrendDirection;
  releaseRegression: boolean;
  topContextTags: Record<string, string | null>;
  affectedSurfaces: string[];
  providerFamilies: string[];
  degradedOrOfflineRate: number;
  offlineCorrelation: 'high' | 'moderate' | 'low';
}

export interface EcsIssueAdminSummary {
  latestVersion: string | null;
  groups: EcsIssueGroupSummary[];
  frequentIssues: EcsIssueGroupSummary[];
  newSinceLatestRelease: EcsIssueGroupSummary[];
  regressions: EcsIssueGroupSummary[];
  trendingUp: EcsIssueGroupSummary[];
  trendingDown: EcsIssueGroupSummary[];
  resolvedOrQuieted: EcsIssueGroupSummary[];
  severeActive: EcsIssueGroupSummary[];
}
