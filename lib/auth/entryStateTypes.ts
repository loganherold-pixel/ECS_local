import type { ECSAccessResolution } from './entitlementTypes';

export type ECSDistributionEntryKind =
  | 'auth_required'
  | 'authenticated_restore'
  | 'offline_restore'
  | 'setup_required'
  | 'suspended'
  | 'public_entry'
  | 'steady';

export type ECSAuthenticatedDestinationSource =
  | 'default_dashboard'
  | 'restored_shell_route'
  | 'requested_entry_route'
  | 'setup'
  | 'vehicle_recovery'
  | 'login'
  | 'current_route'
  | 'none';

export interface ECSDistributionEntryResolution {
  kind: ECSDistributionEntryKind;
  redirectTarget: string | null;
  loadingLabel: string;
  loadingDetail: string;
  bootstrapLabel: string | null;
  shellAccessReady: boolean;
  shellRestoreEligible: boolean;
  routeRestoreEligible: boolean;
  destinationSource: ECSAuthenticatedDestinationSource;
  routeRestoreRejected: boolean;
  requestedRestorableRoute: string | null;
}

export interface ECSDistributionEntryParams {
  currentPath: string;
  isLoading: boolean;
  authenticated: boolean;
  guestOfflineAccess?: boolean;
  rememberedOfflineAccess?: boolean;
  accessState: ECSAccessResolution | null;
  offlineMode: boolean;
  setupComplete: boolean;
  setupRecoveryRequired?: boolean;
  startupSessionRestored?: boolean;
  restorableShellRoute: string | null;
  requestedEntryRoute?: string | null;
  isAuthScreen: boolean;
  isRecoveryScreen: boolean;
  recoveryMode?: 'reset' | 'activate' | 'unknown';
  isLoginScreen: boolean;
  isSetupScreen: boolean;
  preserveSetupRoute?: boolean;
  isProtectedScreen: boolean;
  bootstrapError?: string | null;
}
