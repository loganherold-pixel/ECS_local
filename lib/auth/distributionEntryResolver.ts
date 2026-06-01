import type {
  ECSAuthenticatedDestinationSource,
  ECSDistributionEntryParams,
  ECSDistributionEntryResolution,
} from './entryStateTypes';
import { AUTH_COPY } from './authCopy';

function resolveAuthenticatedShellTarget(params: {
  setupComplete: boolean;
  setupRecoveryRequired?: boolean;
  restorableShellRoute: string | null;
  requestedEntryRoute?: string | null;
  allowRequestedEntryRoute?: boolean;
  allowRouteRestore: boolean;
}): {
  target: string;
  destinationSource: ECSAuthenticatedDestinationSource;
  routeRestoreRejected: boolean;
} {
  const {
    setupComplete,
    setupRecoveryRequired = false,
    restorableShellRoute,
    requestedEntryRoute = null,
    allowRequestedEntryRoute = false,
    allowRouteRestore,
  } = params;

  if (!setupComplete) {
    return {
      target: setupRecoveryRequired ? '/fleet' : '/setup',
      destinationSource: setupRecoveryRequired ? 'vehicle_recovery' : 'setup',
      routeRestoreRejected: false,
    };
  }

  if (allowRequestedEntryRoute && requestedEntryRoute) {
    return {
      target: requestedEntryRoute,
      destinationSource: 'requested_entry_route',
      routeRestoreRejected: false,
    };
  }

  if (allowRouteRestore && restorableShellRoute) {
    return {
      target: restorableShellRoute,
      destinationSource: 'restored_shell_route',
      routeRestoreRejected: false,
    };
  }

  return {
    target: '/dashboard',
    destinationSource: 'default_dashboard',
    routeRestoreRejected: !!restorableShellRoute && !allowRouteRestore,
  };
}

export function resolveDistributionEntryState(
  params: ECSDistributionEntryParams,
): ECSDistributionEntryResolution {
  const {
    currentPath,
    isLoading,
    authenticated,
    guestOfflineAccess = false,
    rememberedOfflineAccess = false,
    accessState,
    offlineMode,
    setupComplete,
    setupRecoveryRequired = false,
    restorableShellRoute,
    requestedEntryRoute = null,
    isAuthScreen,
    isRecoveryScreen,
    recoveryMode = 'unknown',
    isLoginScreen,
    isSetupScreen,
    preserveSetupRoute = false,
    isProtectedScreen,
    bootstrapError,
  } = params;

  const suspended = accessState?.suspended === true;
  const shellAccessReady = (authenticated || guestOfflineAccess || rememberedOfflineAccess) && !suspended;
  const authEntryAccessReady = (authenticated || rememberedOfflineAccess) && !suspended;
  const shellRestoreEligible = shellAccessReady && setupComplete;
  const routeRestoreEligible = shellRestoreEligible && !!restorableShellRoute;
  const allowPreSetupAccountRoute =
    shellAccessReady && !setupComplete && (currentPath === '/more' || currentPath === '/intel');
  const allowVehicleRecoveryRoute =
    shellAccessReady &&
    !setupComplete &&
    setupRecoveryRequired &&
    (currentPath === '/fleet' || currentPath === '/vehicle-config');
  const allowPreSetupShellRoute =
    shellAccessReady &&
    !setupComplete &&
    !isProtectedScreen &&
    (currentPath === '/fleet' ||
      currentPath === '/vehicle-config' ||
      currentPath === '/more' ||
      currentPath === '/intel');
  const rememberedShellTarget = resolveAuthenticatedShellTarget({
    setupComplete,
    setupRecoveryRequired,
    restorableShellRoute,
    requestedEntryRoute,
    allowRequestedEntryRoute: true,
    allowRouteRestore: true,
  });
  const freshAuthShellTarget = resolveAuthenticatedShellTarget({
    setupComplete,
    setupRecoveryRequired,
    restorableShellRoute,
    allowRouteRestore: false,
  });

  const recoveryLoadingLabel =
    recoveryMode === 'reset' ? AUTH_COPY.resetPassword.verifying : AUTH_COPY.activation.verifying;
  const recoveryLoadingDetail =
    recoveryMode === 'reset'
      ? 'Checking password recovery state and preparing a secure return to ECS.'
      : 'Checking authorized access and preparing first-time ECS setup.';

  const loadingLabel = isRecoveryScreen
    ? recoveryLoadingLabel
    : authenticated
      ? shellRestoreEligible
        ? AUTH_COPY.session.loadingSystems
        : AUTH_COPY.session.preparing
      : offlineMode
        ? AUTH_COPY.session.loadingSystems
        : AUTH_COPY.session.checking;
  const loadingDetail = isRecoveryScreen
    ? recoveryLoadingDetail
    : authenticated
      ? shellRestoreEligible
        ? 'Restoring your command surface and authenticated shell.'
        : 'Bringing the ECS shell online for this account.'
      : offlineMode
        ? 'Using locally available ECS data while network access is limited.'
        : 'Checking sign-in, access, and restore state.';
  const bootstrapLabel = bootstrapError
    ? 'Signed in. Core shell is ready while account data finishes refreshing.'
    : null;

  if (isLoading) {
    return {
      kind: shellRestoreEligible
        ? authenticated
          ? 'authenticated_restore'
          : 'offline_restore'
        : authenticated
          ? 'steady'
          : 'public_entry',
      redirectTarget: null,
      loadingLabel,
      loadingDetail,
      bootstrapLabel,
      shellAccessReady,
      shellRestoreEligible,
      routeRestoreEligible,
      destinationSource: 'none',
      routeRestoreRejected: false,
      requestedRestorableRoute: restorableShellRoute,
    };
  }

  if (suspended) {
    return {
      kind: 'suspended',
      redirectTarget: currentPath === '/login' ? null : '/login',
      loadingLabel,
      loadingDetail,
      bootstrapLabel,
      shellAccessReady: false,
      shellRestoreEligible: false,
      routeRestoreEligible: false,
      destinationSource: currentPath === '/login' ? 'current_route' : 'login',
      routeRestoreRejected: false,
      requestedRestorableRoute: restorableShellRoute,
    };
  }

  if (currentPath === '/') {
    return {
      kind:
        authEntryAccessReady
          ? 'authenticated_restore'
          : 'auth_required',
      redirectTarget:
        authEntryAccessReady
          ? rememberedShellTarget.target
          : '/login',
      loadingLabel,
      loadingDetail,
      bootstrapLabel,
      shellAccessReady,
      shellRestoreEligible,
      routeRestoreEligible,
      destinationSource:
        authEntryAccessReady
          ? rememberedShellTarget.destinationSource
          : 'login',
      routeRestoreRejected:
        authEntryAccessReady
          ? rememberedShellTarget.routeRestoreRejected
          : false,
      requestedRestorableRoute: restorableShellRoute,
    };
  }

  if (isSetupScreen) {
    if (preserveSetupRoute) {
      return {
        kind: guestOfflineAccess ? 'offline_restore' : shellAccessReady ? 'authenticated_restore' : 'setup_required',
        redirectTarget: null,
        loadingLabel,
        loadingDetail,
        bootstrapLabel,
        shellAccessReady,
        shellRestoreEligible,
        routeRestoreEligible,
        destinationSource: 'current_route',
        routeRestoreRejected: false,
        requestedRestorableRoute: restorableShellRoute,
      };
    }

    if (setupRecoveryRequired && !authenticated) {
      return {
        kind: 'auth_required',
        redirectTarget: '/login',
        loadingLabel,
        loadingDetail,
        bootstrapLabel,
        shellAccessReady,
        shellRestoreEligible,
        routeRestoreEligible,
        destinationSource: 'login',
        routeRestoreRejected: false,
        requestedRestorableRoute: restorableShellRoute,
      };
    }

    if (setupRecoveryRequired && authenticated) {
      return {
        kind: 'setup_required',
        redirectTarget: '/fleet',
        loadingLabel,
        loadingDetail,
        bootstrapLabel,
        shellAccessReady,
        shellRestoreEligible,
        routeRestoreEligible,
        destinationSource: 'vehicle_recovery',
        routeRestoreRejected: false,
        requestedRestorableRoute: restorableShellRoute,
      };
    }

    if (!setupComplete && shellAccessReady) {
      return {
        kind: 'setup_required',
        redirectTarget: '/fleet',
        loadingLabel,
        loadingDetail,
        bootstrapLabel,
        shellAccessReady,
        shellRestoreEligible,
        routeRestoreEligible,
        destinationSource: 'vehicle_recovery',
        routeRestoreRejected: false,
        requestedRestorableRoute: restorableShellRoute,
      };
    }

    return {
      kind: setupComplete && shellAccessReady ? 'authenticated_restore' : 'setup_required',
      redirectTarget: setupComplete && shellAccessReady ? freshAuthShellTarget.target : null,
      loadingLabel,
      loadingDetail,
      bootstrapLabel,
      shellAccessReady,
      shellRestoreEligible,
      routeRestoreEligible,
      destinationSource:
        setupComplete && shellAccessReady ? freshAuthShellTarget.destinationSource : 'current_route',
      routeRestoreRejected:
        setupComplete && shellAccessReady ? freshAuthShellTarget.routeRestoreRejected : false,
      requestedRestorableRoute: restorableShellRoute,
    };
  }

  if (isRecoveryScreen) {
    return {
      kind: authenticated ? 'steady' : 'public_entry',
      redirectTarget: null,
      loadingLabel,
      loadingDetail,
      bootstrapLabel,
      shellAccessReady,
      shellRestoreEligible,
      routeRestoreEligible,
      destinationSource: 'current_route',
      routeRestoreRejected: false,
      requestedRestorableRoute: restorableShellRoute,
    };
  }

  if (isAuthScreen) {
    return {
      kind:
        authEntryAccessReady
          ? 'authenticated_restore'
          : 'public_entry',
      redirectTarget:
        authEntryAccessReady
          ? freshAuthShellTarget.target
          : null,
      loadingLabel,
      loadingDetail,
      bootstrapLabel,
      shellAccessReady,
      shellRestoreEligible,
      routeRestoreEligible,
      destinationSource:
        authEntryAccessReady
          ? freshAuthShellTarget.destinationSource
          : 'current_route',
      routeRestoreRejected:
        authEntryAccessReady
          ? freshAuthShellTarget.routeRestoreRejected
          : false,
      requestedRestorableRoute: restorableShellRoute,
    };
  }

  if (allowPreSetupAccountRoute) {
    return {
      kind: 'steady',
      redirectTarget: null,
      loadingLabel,
      loadingDetail,
      bootstrapLabel,
      shellAccessReady,
      shellRestoreEligible: false,
      routeRestoreEligible: false,
      destinationSource: 'current_route',
      routeRestoreRejected: false,
      requestedRestorableRoute: restorableShellRoute,
    };
  }

  if (shellAccessReady && !setupComplete && currentPath !== '/pro') {
    if (setupRecoveryRequired && !allowVehicleRecoveryRoute) {
      return {
        kind: 'setup_required',
        redirectTarget: '/fleet',
        loadingLabel,
        loadingDetail,
        bootstrapLabel,
        shellAccessReady,
        shellRestoreEligible: false,
        routeRestoreEligible: false,
        destinationSource: 'vehicle_recovery',
        routeRestoreRejected: false,
        requestedRestorableRoute: restorableShellRoute,
      };
    }

    if (allowPreSetupShellRoute) {
      return {
        kind: 'steady',
        redirectTarget: null,
        loadingLabel,
        loadingDetail,
        bootstrapLabel,
        shellAccessReady,
        shellRestoreEligible: false,
        routeRestoreEligible: false,
        destinationSource: 'current_route',
        routeRestoreRejected: false,
        requestedRestorableRoute: restorableShellRoute,
      };
    }

    return {
      kind: 'setup_required',
      redirectTarget: '/setup',
      loadingLabel,
      loadingDetail,
      bootstrapLabel,
      shellAccessReady,
      shellRestoreEligible: false,
      routeRestoreEligible: false,
      destinationSource: 'setup',
      routeRestoreRejected: false,
      requestedRestorableRoute: restorableShellRoute,
    };
  }

  if (!shellAccessReady && currentPath !== '/pro' && (isProtectedScreen || !isAuthScreen)) {
    return {
      kind: 'auth_required',
      redirectTarget: '/login',
      loadingLabel,
      loadingDetail,
      bootstrapLabel,
      shellAccessReady,
      shellRestoreEligible: false,
      routeRestoreEligible: false,
      destinationSource: 'login',
      routeRestoreRejected: false,
      requestedRestorableRoute: restorableShellRoute,
    };
  }

  return {
    kind: 'steady',
    redirectTarget: null,
    loadingLabel,
    loadingDetail,
    bootstrapLabel,
    shellAccessReady,
    shellRestoreEligible,
    routeRestoreEligible,
    destinationSource: 'current_route',
    routeRestoreRejected: false,
    requestedRestorableRoute: restorableShellRoute,
  };
}
