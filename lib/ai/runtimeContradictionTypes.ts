import type { ECSAccessResolution } from '../auth/entitlementTypes';
import type { ECSDistributionEntryKind } from '../auth/entryStateTypes';
import type { ECSCommandStateDiagnostics, ECSReleaseReadinessDiagnostics } from './orchestratorTypes';
import type { ECSLiveStatusMap, ECSLiveStatusResult } from '../status/liveStatusTypes';
import type { ExpeditionReadinessAssessment } from '../readiness/expeditionReadinessTypes';
import type { ExpeditionReadinessAlert } from '../readiness/expeditionReadinessAlerts';
import type { ECSReadinessExplanationPayload } from './readinessExplanationGuardrails';
import type {
  DispersedCampingConfidence,
  DispersedCampingLandManager,
} from '../map/dispersedCampingTypes';

export type ECSRuntimeContradictionSeverity = 'info' | 'warning' | 'error';

export type ECSRuntimeContradictionCode =
  | 'valid_access_gated'
  | 'shell_restore_mismatch'
  | 'route_restore_mismatch'
  | 'setup_gate_mismatch'
  | 'offline_capable_mislabeled'
  | 'navigate_route_lead_gap'
  | 'severity_drift'
  | 'provider_state_mismatch'
  | 'explore_noise_leak'
  | 'fleet_urgency_leak'
  | 'stale_command_lingering'
  | 'readiness_ready_without_route'
  | 'readiness_ready_without_vehicle'
  | 'readiness_ready_with_stale_weather'
  | 'readiness_ready_without_offline_package'
  | 'readiness_ready_low_camp_legality_confidence'
  | 'readiness_ready_without_recovery_context'
  | 'readiness_ready_without_emergency_coordinate_packet'
  | 'readiness_hold_missing_explanation'
  | 'readiness_unmarked_synthetic_data'
  | 'readiness_score_out_of_range'
  | 'readiness_status_score_mismatch'
  | 'readiness_unsafe_wording'
  | 'readiness_vehicle_fit_without_vehicle'
  | 'readiness_offline_ready_without_evidence'
  | 'readiness_category_score_out_of_range'
  | 'readiness_missing_category'
  | 'readiness_alert_copy_unsafe'
  | 'readiness_alert_status_contradiction'
  | 'readiness_ai_summary_safe_while_not_ready'
  | 'readiness_ai_legal_campsite_claim'
  | 'readiness_ai_references_missing_source'
  | 'readiness_ai_offline_complete_contradiction'
  | 'readiness_ai_vehicle_fit_without_vehicle'
  | 'readiness_ai_status_contradiction'
  | 'dispersed_camping_layer_missing_source'
  | 'dispersed_camping_layer_partial'
  | 'dispersed_camping_beta_flag_bypass'
  | 'dispersed_camping_selected_region_stale'
  | 'dispersed_camping_route_summary_without_route'
  | 'dispersed_camping_candidate_auto_generated'
  | 'dispersed_camping_candidate_limit_exceeded'
  | 'dispersed_camping_candidate_restricted_land'
  | 'dispersed_camping_candidate_missing_warning'
  | 'dispersed_camping_stale_data_unlabeled'
  | 'dispersed_camping_offline_claim_without_data';

export interface ECSRuntimeContradiction {
  code: ECSRuntimeContradictionCode;
  severity: ECSRuntimeContradictionSeverity;
  message: string;
  rootKey?: string | null;
  detail?: string | null;
}

export interface ECSRuntimeSmokeShellSnapshot {
  capturedAt: number;
  enabled: boolean;
  currentPath: string;
  redirectTarget: string | null;
  entryKind: ECSDistributionEntryKind | null;
  authenticated: boolean;
  setupComplete: boolean;
  offlineMode: boolean;
  bootstrapError: string | null;
  isProtectedScreen: boolean;
  restorableShellRoute: string | null;
  shellAccessReady: boolean;
  shellRestoreEligible: boolean;
  routeRestoreEligible: boolean;
  accessState: Pick<
    ECSAccessResolution,
    | 'role'
    | 'entitlementSource'
    | 'accessState'
    | 'verificationMode'
    | 'authenticated'
    | 'suspended'
    | 'hasFullAccess'
    | 'isPrivilegedGrant'
    | 'canAccessAdminSurfaces'
    | 'accountLabel'
    | 'statusLabel'
    | 'sourceLabel'
    | 'badgeLabel'
  > | null;
}

export interface ECSRuntimeSmokeCommandSnapshot {
  capturedAt: number;
  activePhase: string | null;
  primaryTitle: string | null;
  primarySummary: string | null;
  primaryRootKey: string | null;
  secondaryTitles: string[];
  suppressedTitles: string[];
  leadByTarget: ECSCommandStateDiagnostics['leadByTarget'];
  rootCount: number;
  staleSignals: string[];
  invariantViolations: ECSCommandStateDiagnostics['invariantViolations'];
  releaseDiagnostics: Pick<
    ECSReleaseReadinessDiagnostics,
    'overallStatus' | 'issues' | 'issueCounts'
  > | null;
  liveStatus: Partial<Record<'overall' | 'route' | 'weather' | 'telemetry' | 'resources' | 'readiness', ECSLiveStatusResult | null>>;
  expeditionReadiness: ExpeditionReadinessAssessment | null;
  activeReadinessAlert: ExpeditionReadinessAlert | null;
  readinessExplanation: ECSReadinessExplanationPayload | null;
  aiSummary: string | null;
  dispersedCamping: ECSDispersedCampingRuntimeSmokeSnapshot | null;
}

export type ECSDispersedCampingCandidateGenerationTrigger =
  | 'explicit_user_action'
  | 'route_auto_stage'
  | 'map_pan'
  | 'filter_toggle'
  | 'route_change'
  | 'automatic'
  | 'unknown';

export type ECSDispersedCampingRuntimeCandidatePin = {
  id?: string | null;
  regionId?: string | null;
  landManager?: DispersedCampingLandManager | string | null;
  confidence?: DispersedCampingConfidence | string | null;
  sourceType?: string | null;
  isRestricted?: boolean;
  verificationWarning?: string | null;
};

export interface ECSDispersedCampingRuntimeSmokeSnapshot {
  featureAvailable: boolean;
  betaFlagEnabled: boolean;
  toggleVisible: boolean;
  layerEnabled: boolean;
  sourceLoaded: boolean;
  fillLayerPresent: boolean;
  outlineLayerPresent: boolean;
  unavailableStateVisible: boolean;
  selectedRegionSheetVisible: boolean;
  selectedRegionId?: string | null;
  routeExists: boolean;
  routeAwareSummaryVisible: boolean;
  candidatePinCount: number;
  candidatePins: ECSDispersedCampingRuntimeCandidatePin[];
  candidateGenerationTrigger?: ECSDispersedCampingCandidateGenerationTrigger | null;
  dataFreshnessState?: 'current' | 'stale' | 'cached' | 'unavailable' | 'unknown' | null;
  dataFreshnessLabel?: string | null;
  offlineMode?: boolean;
  createdEligibilityClaimsWithoutData?: boolean;
}

export interface ECSRuntimeSmokeSnapshot {
  capturedAt: number;
  enabled: boolean;
  shell: ECSRuntimeSmokeShellSnapshot | null;
  command: ECSRuntimeSmokeCommandSnapshot | null;
  markers: string[];
  contradictions: ECSRuntimeContradiction[];
}

export interface ECSRuntimeSmokeState extends ECSRuntimeSmokeSnapshot {
  lastLoggedKeys: string[];
}

export type ECSRuntimeSmokeShellInput = Omit<ECSRuntimeSmokeShellSnapshot, 'capturedAt'>;

export type ECSRuntimeSmokeCommandInput = {
  activePhase: string | null | undefined;
  primaryTitle: string | null | undefined;
  primarySummary: string | null | undefined;
  primaryRootKey: string | null | undefined;
  secondaryTitles: string[];
  suppressedTitles: string[];
  commandDiagnostics: ECSCommandStateDiagnostics | null | undefined;
  releaseDiagnostics: ECSReleaseReadinessDiagnostics | null | undefined;
  liveStatus: ECSLiveStatusMap | null | undefined;
  expeditionReadiness?: ExpeditionReadinessAssessment | null | undefined;
  activeReadinessAlert?: ExpeditionReadinessAlert | null | undefined;
  readinessExplanation?: ECSReadinessExplanationPayload | null | undefined;
  aiSummary?: string | null | undefined;
  dispersedCamping?: ECSDispersedCampingRuntimeSmokeSnapshot | null | undefined;
};
