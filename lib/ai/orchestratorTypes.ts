import type { ECSConfidenceResult } from './confidenceTypes';
import type { ECSDegradedOperationsResult } from './degradedOperationsTypes';
import type { ECSExpeditionPhase } from './expeditionPhaseTypes';
import type { ECSPriorityResult } from './priorityTypes';
import type { ECSExplanationResult } from './recommendationExplanationTypes';
import type { ECSTrustMetadata } from './trustTypes';
import type {
  ECSReleaseChecklistSection,
  ECSReleaseRiskSummary,
} from './releasePolishAuditTypes';

export type ECSOrchestratorSource =
  | 'mission_scenario'
  | 'route_risk'
  | 'route_viability'
  | 'offline_readiness'
  | 'weather'
  | 'remoteness'
  | 'vehicle_assessment'
  | 'resource_status'
  | 'attitude'
  | 'telemetry'
  | 'explore'
  | 'bailout'
  | 'sync'
  | 'safety'
  | 'brief';

export type ECSOrchestratorUITarget =
  | 'dashboard'
  | 'navigate'
  | 'explore'
  | 'alert'
  | 'fleet'
  | 'brief';

export type ECSRootConditionFamily =
  | 'mission_planning_readiness'
  | 'weather_route_exposure'
  | 'gps_guidance_degradation'
  | 'telemetry_disconnect'
  | 'resource_margin_decline'
  | 'route_fit_limitation'
  | 'stale_weather_support'
  | 'offline_capable_operation'
  | 'degraded_operations'
  | 'bailout_relevance'
  | 'route_risk_elevation'
  | 'vehicle_readiness_gap'
  | 'planning_recommendation'
  | 'operational_alert';

export type ECSRootConditionScope =
  | 'route'
  | 'system'
  | 'planning'
  | 'readiness'
  | 'resource'
  | 'safety';

export type ECSRootConditionIdentity = {
  key: string;
  family: ECSRootConditionFamily;
  sourceFamily?: string | null;
  affectedDomain?: string | null;
  scope?: ECSRootConditionScope | null;
  suppressionCompatibility?: string[];
};

export type ECSOrchestratorTargetRole = 'lead' | 'support' | 'suppressed';

export type ECSOrchestratorTargetPresentation = {
  title?: string | null;
  summary?: string | null;
  explanation?: ECSExplanationResult | null;
};

export type ECSCommandStateInvariantSeverity = 'info' | 'warning' | 'error';

export type ECSCommandStateInvariantCode =
  | 'route_issue_missing_from_navigate'
  | 'fleet_route_urgency_lead'
  | 'explore_route_noise'
  | 'planning_issue_owning_navigate'
  | 'telemetry_status_conflict'
  | 'weather_status_conflict'
  | 'offline_capable_status_conflict'
  | 'duplicate_cross_tab_rationale'
  | 'dashboard_alert_priority_drift';

export type ECSCommandStateInvariant = {
  code: ECSCommandStateInvariantCode;
  severity: ECSCommandStateInvariantSeverity;
  message: string;
  rootKey?: string | null;
  targets?: ECSOrchestratorUITarget[];
};

export type ECSCommandStateRootSnapshot = {
  key: string;
  family: ECSRootConditionFamily;
  title: string;
  priorityLevel?: ECSPriorityResult['level'] | null;
  leadTarget?: ECSOrchestratorUITarget | null;
  supportTargets: ECSOrchestratorUITarget[];
  suppressedTargets: ECSOrchestratorUITarget[];
};

export type ECSCommandStateDiagnostics = {
  generatedAt: number;
  activePhase?: ECSExpeditionPhase | null;
  operatorTrustMode?: string | null;
  leadByTarget: Partial<Record<ECSOrchestratorUITarget, string | null>>;
  rootSnapshots: ECSCommandStateRootSnapshot[];
  invariantViolations: ECSCommandStateInvariant[];
  staleSignals: string[];
};

export type ECSReleaseReadinessSeverity = 'info' | 'warning' | 'error';

export type ECSReleaseReadinessIssueCode =
  | 'cross_tab_blockers'
  | 'cross_tab_warning_cluster'
  | 'stale_signal_churn'
  | 'route_lead_gap'
  | 'offline_capable_conflict'
  | 'minimal_mode_noise'
  | 'planning_phase_ownership_gap'
  | 'missing_lead_target';

export type ECSReleaseReadinessIssue = {
  code: ECSReleaseReadinessIssueCode;
  severity: ECSReleaseReadinessSeverity;
  message: string;
  targets?: ECSOrchestratorUITarget[];
  rootKey?: string | null;
};

export type ECSReleaseScenarioHighlight = {
  id: string;
  label: string;
  phase: ECSExpeditionPhase | 'none';
};

export type ECSReleaseReadinessDiagnostics = {
  generatedAt: number;
  overallStatus: 'healthy' | 'watch' | 'blocker';
  activePhase?: ECSExpeditionPhase | null;
  operatorTrustMode?: string | null;
  issueCounts: Record<ECSReleaseReadinessSeverity, number>;
  issues: ECSReleaseReadinessIssue[];
  activeRootCount: number;
  staleSignalCount: number;
  leadByTarget: Partial<Record<ECSOrchestratorUITarget, string | null>>;
  scenarioCoverage: {
    totalScenarios: number;
    highlighted: ECSReleaseScenarioHighlight[];
    trustModes: string[];
  };
  masterChecklist: ECSReleaseChecklistSection[];
  unresolvedRiskSummary: ECSReleaseRiskSummary;
};

export type ECSOrchestratorCandidate = {
  id: string;
  source: ECSOrchestratorSource;
  title: string;
  summary: string;
  confidence?: ECSConfidenceResult | null;
  priority?: ECSPriorityResult | null;
  degraded?: ECSDegradedOperationsResult | null;
  phase?: ECSExpeditionPhase | null;
  explanation?: ECSExplanationResult | null;
  uiTargets?: ECSOrchestratorUITarget[];
  dismissible?: boolean;
  timestamp: number;
  groupKey?: string | null;
  rootCondition?: ECSRootConditionIdentity | null;
  targetRoles?: Partial<Record<ECSOrchestratorUITarget, ECSOrchestratorTargetRole>>;
  targetPresentation?: Partial<Record<ECSOrchestratorUITarget, ECSOrchestratorTargetPresentation>>;
  trust?: ECSTrustMetadata | null;
};

export type ECSOrchestratorOutput = {
  primary?: ECSOrchestratorCandidate | null;
  secondary: ECSOrchestratorCandidate[];
  passive: ECSOrchestratorCandidate[];
  suppressed: ECSOrchestratorCandidate[];
  activePhase?: ECSExpeditionPhase | null;
  operationalState?: ECSDegradedOperationsResult | null;
  qaDiagnostics?: ECSCommandStateDiagnostics | null;
  releaseDiagnostics?: ECSReleaseReadinessDiagnostics | null;
};
