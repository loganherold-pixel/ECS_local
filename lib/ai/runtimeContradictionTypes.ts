import type { ECSAccessResolution } from '../auth/entitlementTypes';
import type { ECSDistributionEntryKind } from '../auth/entryStateTypes';
import type { ECSCommandStateDiagnostics, ECSReleaseReadinessDiagnostics } from './orchestratorTypes';
import type { ECSLiveStatusMap, ECSLiveStatusResult } from '../status/liveStatusTypes';

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
  | 'stale_command_lingering';

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
};
