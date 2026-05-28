import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../lib/androidScreensBootstrap';
import { Stack, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import {
  View,
  ActivityIndicator,
  Text,
  StyleSheet,
  TouchableOpacity,
  AppState,
  useWindowDimensions,
  type AppStateStatus,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeIcon as Ionicons } from '../components/SafeIcon';
import AdaptiveBackground from '../components/login/AdaptiveBackground';
import AuthBrandLockup from '../components/login/AuthBrandLockup';
import ShellBodyBackground from '../components/ShellBodyBackground';
import LoadingTransitionVideo from '../components/LoadingTransitionVideo';

import { AppProvider, useApp } from '../context/AppContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { WizardStateProvider } from '../context/WizardStateContext';
import { ViewerSettingsProvider } from '../context/ViewerSettingsContext';

import CommandDock from '../components/CommandDock';
import OfflineSyncStatusChip from '../components/navigate/OfflineSyncStatusChip';

import { MOTION } from '../lib/motion';
import { ECS } from '../lib/theme';
import { ecsLog } from '../lib/ecsLogger';
import {
  flushDashboardWrites,
  isDashboardHydrated,
  waitForDashboardHydration,
} from '../lib/dashboardStore';
import { sessionStore } from '../lib/sessionStore';
import { setupStore } from '../lib/setupStore';
import { vehicleStore } from '../lib/vehicleStore';
import { vehicleSetupStore } from '../lib/vehicleSetupStore';
import { resolveConfiguredVehiclePresence } from '../lib/vehiclePresence';
import { timelineIntelligenceEngine } from '../lib/timelineIntelligenceEngine';
import { ecsSyncCoordinator } from '../lib/ecsSyncCoordinator';
import { ecsOfflineInterlock } from '../lib/ecsOfflineInterlock';
import { offlineTileSyncCoordinator } from '../lib/offlineTileSyncCoordinator';
import { androidAutoBridge } from '../lib/androidAutoBridge';
import {
  flushQueuedIssueEvents,
  initializeEcsIssueIntelligence,
  reportFatalIssue,
  reportNonFatalIssue,
} from '../lib/ecsIssueIntelligence';
import {
  setIssueRuntimeActor,
  setIssueRuntimeConnectivity,
  setIssueRuntimePath,
} from '../lib/ecsIssueRuntime';
import { createPersistedKeyValueCache } from '../lib/keyValuePersistence';
import { restoreUnifiedDeviceSessions } from '../lib/ecsLiveSystemBootstrap';
import { resolveAccountUx } from '../lib/auth/accountUXResolver';
import { AUTH_COPY } from '../lib/auth/authCopy';
import { resolveAuthLayoutMetrics } from '../lib/auth/authResponsive';
import { AUTH_SURFACE } from '../lib/auth/authSurface';
import { AUTH_VISUAL_SPEC } from '../lib/auth/authVisualSpec';
import { resolveDistributionEntryState } from '../lib/auth/distributionEntryResolver';
import {
  consumeAuthTiming,
  markAuthTimingStart,
  recordAuthDiagnostic,
} from '../lib/auth/authDiagnostics';
import { redactAuthUserId } from '../lib/auth/authLogRedaction';
import { runtimeSmokeStore } from '../lib/ai/runtimeSmokeStore';
import { openManageSubscription } from '../lib/subscriptionAccess';
import {
  getCommandDockHeight,
} from '../lib/shellLayout';
import { useAdaptiveLayout } from '../lib/useAdaptiveLayout';
import { stageNavigationFlow } from '../lib/ecsNavigationFlow';
import { sanitizeLegacyVehicleFrameworkState } from '../lib/fleet/legacyVehicleFrameworkStateMigration';
import {
  getStartupDiagnosticsSnapshot,
  logStartupStall,
  markStartupPhase,
} from '../lib/startupDiagnostics';

if (typeof globalThis.fetch === 'undefined') {
  // @ts-ignore
  globalThis.fetch = fetch;
}

// ── Auth screens that don't require authentication ───────────
const AUTH_SCREENS = ['login', 'initialize', 'create-access-key', 'auth-info', 'pro', 'join-expedition'];
const AUTH_ROUTE_PREFIXES = ['/expedition-channel/join/'];

// ── Screens that STRICTLY require authentication (cloud-only features) ──
const PROTECTED_SCREENS = [
  'expedition-detail',
  'expedition-command',
  'expedition-checklist',
  'expedition-log',
  'expedition-route-mgr',
  'expedition-livelog',
  'expedition-dispatch',
];

function normalizeRoutePath(path: string | null | undefined): string {
  if (!path || path === '/') {
    return '/';
  }

  const withoutGroups = path.replace(/\/\([^/]+\)/g, '');
  const normalized = withoutGroups.replace(/\/index$/, '') || '/';
  return normalized === '' ? '/' : normalized;
}

function firstRouteParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function isAuthRoutePath(path: string | null | undefined): boolean {
  const normalized = normalizeRoutePath(path);
  if (normalized === '/') return true;
  return AUTH_SCREENS.some((screen) => normalized === `/${screen}`) ||
    AUTH_ROUTE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

const SHELL_ROUTE_KEY = 'last_shell_route_v1';
const shellRouteCache = createPersistedKeyValueCache('ecs_shell_state');
const OFFLINE_MODE_KEY = 'ecs_offline_mode';
const offlineModeCache = createPersistedKeyValueCache('ecs_runtime_flags');
const SETUP_COMPLETE_KEY = 'ecs_setup_complete';
const setupStateCache = createPersistedKeyValueCache('ecs_setup_state');
const RESTORABLE_SHELL_ROUTES = new Set([
  '/fleet',
  '/navigate',
  '/dashboard',
  '/discover',
  '/explore',
  '/alert',
]);

const STARTUP_VISUAL_PALETTE = {
  bg: ECS.bgPrimary,
  bgElevated: ECS.bgElev,
  border: ECS.stroke,
  text: ECS.text,
  textMuted: ECS.muted,
  amber: ECS.accent,
  card: ECS.bgPanel,
} as const;
const INITIAL_URL_RESOLUTION_TIMEOUT_MS = 1500;
const MIN_LOADING_MS = 3000;
const POST_AUTH_HANDOFF_ROUTE_TIMEOUT_MS = 6500;
const STARTUP_ROUTE_READINESS_TIMEOUT_MS = 8000;
const DASHBOARD_SHELL_READINESS_TIMEOUT_MS = 5000;
const STARTUP_LOADING_STALL_DIAGNOSTIC_MS = 12000;

function waitForShellStartupRequirement(
  label: string,
  promise: Promise<unknown>,
  timeoutMs: number,
): Promise<{ timedOut: boolean }> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<{ timedOut: boolean }>((resolve) => {
    timeout = setTimeout(() => {
      ecsLog.warnOnce(
        'CONFIG',
        `startup:${label}:timeout`,
        '[AuthGate] Startup requirement timed out; continuing with fallback route readiness',
        { requirement: label, timeoutMs },
      );
      resolve({ timedOut: true });
    }, timeoutMs);
  });

  return Promise.race([
    promise
      .then(() => ({ timedOut: false }))
      .catch((error) => {
        ecsLog.warnOnce(
          'CONFIG',
          `startup:${label}:failed`,
          '[AuthGate] Startup requirement failed; continuing with fallback route readiness',
          { requirement: label, error: error instanceof Error ? error.message : String(error) },
        );
        return { timedOut: false };
      }),
    timeoutPromise,
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function normalizeStoredShellRoute(path: string | null | undefined): string | null {
  if (!path) return null;

  switch (path) {
    case '/(tabs)/fleet':
      return '/fleet';
    case '/(tabs)/navigate':
      return '/navigate';
    case '/(tabs)/dashboard':
      return '/dashboard';
    case '/(tabs)/discover':
    case '/(tabs)/explore':
    case '/explore':
      return '/discover';
    case '/(tabs)/alert':
      return '/alert';
    default:
      return RESTORABLE_SHELL_ROUTES.has(path)
        ? path === '/explore'
          ? '/discover'
          : path
        : null;
  }
}

function toRestorableShellRoute(path: string | null | undefined): string | null {
  const normalized = normalizeRoutePath(path);

  if (normalized === '/fleet' || normalized === '/vehicle-config') {
    return '/fleet';
  }

  if (
    normalized === '/navigate' ||
    normalized === '/route' ||
    normalized === '/navigate-run' ||
    normalized === '/navigate-offline' ||
    normalized === '/navigate-bailouts'
  ) {
    return '/navigate';
  }

  if (normalized === '/dashboard') {
    return '/dashboard';
  }

  if (
    normalized === '/discover' ||
    normalized === '/explore' ||
    normalized === '/explore-trip-builder' ||
    normalized === '/explore-offline-prep-pack'
  ) {
    return '/discover';
  }

  if (
    normalized === '/alert' ||
    normalized === '/safety' ||
    normalized === '/intel' ||
    normalized === '/more'
  ) {
    return '/alert';
  }

  return null;
}

function getStoredShellRoute(): string | null {
  const stored = normalizeStoredShellRoute(shellRouteCache.get(SHELL_ROUTE_KEY));
  if (!stored) return null;

  const cached = shellRouteCache.get(SHELL_ROUTE_KEY);
  if (cached !== stored) {
    shellRouteCache.set(SHELL_ROUTE_KEY, stored);
    void shellRouteCache.flush();
  }

  return stored;
}

function getPreferredShellRoute(): string {
  if (!setupStore.isComplete() || !resolveConfiguredVehiclePresence().hasConfiguredVehicle) {
    return '/fleet';
  }
  return getStoredShellRoute() ?? '/dashboard';
}

function toExpoRouterShellTarget(path: string): string {
  switch (normalizeRoutePath(path)) {
    case '/fleet':
      return '/fleet';
    case '/navigate':
      return '/navigate';
    case '/dashboard':
      return '/dashboard';
    case '/discover':
    case '/explore':
      return '/discover';
    case '/alert':
      return '/alert';
    default:
      return path;
  }
}

function getPersistedSetupComplete(): boolean {
  return setupStateCache.get(SETUP_COMPLETE_KEY) === 'true';
}

function looksLikeNetworkHost(host: string | null | undefined): boolean {
  if (!host) return false;

  const normalized = host.trim().toLowerCase();
  if (!normalized) return false;

  if (normalized === 'localhost' || normalized === '127.0.0.1') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) return true;

  return false;
}

function normalizeRequestedEntryRouteFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = Linking.parse(url);
    const fallback = new URL(url);
    const scheme = (parsed.scheme ?? fallback.protocol.replace(':', '')).toLowerCase();
    const hostname = (parsed.hostname ?? fallback.hostname ?? '').trim();
    const pathname = (fallback.pathname ?? '').trim();
    const explicitPath = (parsed.path ?? '').trim();
    const usesDevTransportScheme =
      scheme === 'exp' ||
      scheme === 'exps' ||
      scheme === 'http' ||
      scheme === 'https';

    const candidates: (string | null | undefined)[] = [
      explicitPath,
      pathname.startsWith('/--/') ? pathname.slice(3) : pathname,
      pathname,
    ];

    if (!usesDevTransportScheme && hostname && !looksLikeNetworkHost(hostname)) {
      candidates.unshift(`${hostname}${pathname || ''}`);
    }

    for (const candidate of candidates) {
      if (!candidate) continue;
      const normalized = normalizeRoutePath(candidate.startsWith('/') ? candidate : `/${candidate}`);
      if (normalized && normalized !== '/' && !looksLikeNetworkHost(normalized.slice(1))) {
        return normalized;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * AuthGate — centralized auth guard
 */
function AuthGate() {
  const { width, height } = useWindowDimensions();
  const {
    user,
    authLoading,
    authPhase,
    startupSessionRestored,
    loading,
    operatorInfo,
    accessState,
    offlineMode,
    bootstrapError,
    retryBootstrap,
    signOut,
    showToast,
    billingFlowState,
    billingError,
    ecsProProduct,
    purchaseEcsProMonthly,
    restoreEcsProAccess,
    refreshAccessState,
  } = useApp();

  const { palette, colors, isLight, themeReady } = useTheme();
  const insets = useSafeAreaInsets();
  const adaptive = useAdaptiveLayout();
  const authLayout = useMemo(() => resolveAuthLayoutMetrics(width, height), [width, height]);
  const pathname = usePathname();
  const routeParams = useGlobalSearchParams<{ mode?: string; vehicleId?: string }>();
  const router = useRouter();
  const [startupRouteHydrated, setStartupRouteHydrated] = useState(false);
  const [dashboardShellHydrated, setDashboardShellHydrated] = useState(() => isDashboardHydrated());
  const [minimumLoadingElapsed, setMinimumLoadingElapsed] = useState(false);
  const [requestedEntryRoute, setRequestedEntryRoute] = useState<string | null>(null);
  const [initialEntryRouteResolved, setInitialEntryRouteResolved] = useState(false);
  const [startupRecoveryVisible, setStartupRecoveryVisible] = useState(false);
  const [accessActionBusy, setAccessActionBusy] = useState<
    'refresh_access' | 'restore_purchases' | 'manage_subscription' | 'start_subscription' | 'sign_out' | null
  >(null);
  const accessVerificationLoggedRef = useRef(false);
  const accessVerificationOutcomeRef = useRef<'success' | 'failure' | null>(null);
  const firstAuthenticatedFrameLoggedRef = useRef(false);
  const routeGuardFallbackRef = useRef<string | null>(null);
  const destinationResolutionRef = useRef<string | null>(null);
  const postAuthLoadingNavigationRef = useRef<string | null>(null);
  const legacyFleetSetupRedirectRef = useRef<string | null>(null);
  const degradedMessageRef = useRef<string | null>(null);

  const startupGatePending =
    authPhase === 'restoring' ||
    authPhase === 'signing_in' ||
    !startupRouteHydrated ||
    !initialEntryRouteResolved;
  const statusBarStyle = !themeReady ? 'light' : isLight ? 'dark' : 'light';
  const visualPalette = useMemo(
    () => ({
      bg: themeReady ? palette.bg : STARTUP_VISUAL_PALETTE.bg,
      bgElevated: themeReady ? colors.bgElevated : STARTUP_VISUAL_PALETTE.bgElevated,
      border: themeReady ? colors.border : STARTUP_VISUAL_PALETTE.border,
      text: themeReady ? palette.text : STARTUP_VISUAL_PALETTE.text,
      textMuted: themeReady ? palette.textMuted : STARTUP_VISUAL_PALETTE.textMuted,
      amber: themeReady ? palette.amber : STARTUP_VISUAL_PALETTE.amber,
      card: themeReady ? colors.bgCard : STARTUP_VISUAL_PALETTE.card,
    }),
    [colors.bgCard, colors.bgElevated, colors.border, palette.amber, palette.bg, palette.text, palette.textMuted, themeReady],
  );
  const normalizedPathname = useMemo(() => normalizeRoutePath(pathname), [pathname]);
  const persistedOfflineMode = startupRouteHydrated
    ? offlineModeCache.get(OFFLINE_MODE_KEY) === 'true'
    : false;
  const persistedSetupComplete = startupRouteHydrated
    ? getPersistedSetupComplete()
    : false;
  const configuredVehiclePresence = startupRouteHydrated
    ? resolveConfiguredVehiclePresence()
    : null;
  const hasConfiguredVehicle = configuredVehiclePresence?.hasConfiguredVehicle ?? false;
  const setupCompletionFlag = persistedSetupComplete || setupStore.isComplete();
  const setupNeedsVehicleRecovery = setupCompletionFlag && !hasConfiguredVehicle;
  const setupComplete = setupCompletionFlag && !setupNeedsVehicleRecovery;
  const hasAuthenticatedUser = !!user;
  const effectiveOfflineMode = offlineMode || persistedOfflineMode;
  const rememberedOfflineAccess =
    effectiveOfflineMode &&
    !hasAuthenticatedUser &&
    sessionStore.hasOfflineSession() &&
    sessionStore.checkSessionValidity() === 'valid';
  const guestOfflineAccess = effectiveOfflineMode && !hasAuthenticatedUser && !rememberedOfflineAccess;
  const shellOfflineMode = effectiveOfflineMode;
  const setupRouteMode = firstRouteParam(routeParams.mode);
  const setupRouteVehicleId = firstRouteParam(routeParams.vehicleId);
  const legacyFleetSetupRoute =
    normalizedPathname === '/setup' &&
    (setupRouteMode === 'fleet-add' || setupRouteMode === 'fleet-edit');
  const preserveSetupRoute =
    normalizedPathname === '/setup' &&
    setupRouteMode === 'guest-entry';
  const authNetworkState = effectiveOfflineMode
    ? 'offline'
    : bootstrapError
      ? 'reconnecting'
      : 'online';
  const credentialRecoveryMode =
    setupRouteMode === 'reset'
      ? 'reset'
      : setupRouteMode === 'activate'
        ? 'activate'
        : 'unknown';
  const isResetCompletionScreen =
    normalizedPathname === '/create-access-key' && setupRouteMode !== 'signup';
  const inSetup = normalizedPathname === '/setup';
  const accountUx = useMemo(
    () =>
      resolveAccountUx({
        operatorInfo,
        accessState,
        authenticated: hasAuthenticatedUser,
        isOnline: !effectiveOfflineMode,
        billingFlowState,
        productPriceLabel: ecsProProduct?.priceLabel ?? null,
      }),
    [
      accessState,
      billingFlowState,
      ecsProProduct?.priceLabel,
      effectiveOfflineMode,
      hasAuthenticatedUser,
      operatorInfo,
    ],
  );
  const entitlementResolving =
    hasAuthenticatedUser &&
    !shellOfflineMode &&
    !isResetCompletionScreen &&
    accessState?.accessState === 'unknown' &&
    !bootstrapError;
  const postAuthBootstrapPending =
    !startupGatePending &&
    !inSetup &&
    (
      authPhase === 'signed_in_bootstrapping' ||
      ((hasAuthenticatedUser || guestOfflineAccess || rememberedOfflineAccess) && loading)
    );
  const isLoading = startupGatePending || postAuthBootstrapPending;
  const unresolvedStartupRequiredFlags = useMemo(
    () => [
      authPhase === 'restoring' ? 'authReady' : null,
      authPhase === 'signing_in' ? 'signInComplete' : null,
      !startupRouteHydrated ? 'startupRouteHydrated' : null,
      !initialEntryRouteResolved ? 'initialRouteReady' : null,
      postAuthBootstrapPending ? 'postAuthBootstrapReady' : null,
    ].filter((flag): flag is string => !!flag),
    [
      authPhase,
      initialEntryRouteResolved,
      postAuthBootstrapPending,
      startupRouteHydrated,
    ],
  );
  const optionalStartupServicesPending = useMemo(
    () => [
      !dashboardShellHydrated ? 'dashboardShellHydration' : null,
      bootstrapError ? 'postAuthBootstrap' : null,
      accessState?.accessState === 'unknown' ? 'accessVerification' : null,
      'weather',
      'realtime',
      'dispatch',
      'teamSync',
      'cacheReadiness',
    ].filter((flag): flag is string => !!flag),
    [accessState?.accessState, bootstrapError, dashboardShellHydrated],
  );
  const primaryAccessAction = accountUx.availableActions.find((action) => action.emphasis === 'primary') ?? null;
  const utilityAccessActions = accountUx.availableActions.filter((action) => action.emphasis !== 'primary');
  const billingBusy =
    billingFlowState === 'purchasing' ||
    billingFlowState === 'confirming_access' ||
    billingFlowState === 'restore_in_progress';
  const isPendingApprovalGate =
    hasAuthenticatedUser &&
    typeof operatorInfo?.status === 'string' &&
    ['pending', 'approval_pending'].includes(operatorInfo.status);
  const isVerificationFailureGate = accountUx.kind === 'reconnecting';
  const verificationFailureLine =
    authNetworkState === 'offline'
      ? AUTH_COPY.accessGate.verificationFailureOfflineLine
      : AUTH_COPY.accessGate.verificationFailureLine;
  const gateTitle =
    isPendingApprovalGate
      ? AUTH_COPY.requestAccess.pendingTitle
      : isVerificationFailureGate
        ? AUTH_COPY.accessGate.verificationFailureTitle
        : AUTH_COPY.accessGate.title;
  const gateSupporting =
    isPendingApprovalGate
      ? AUTH_COPY.requestAccess.pendingLine
      : isVerificationFailureGate
        ? verificationFailureLine
        : AUTH_COPY.accessGate.supporting;
  const gateContextLine = isPendingApprovalGate
    ? 'We’ll contact you when access is available.'
    : isVerificationFailureGate
      ? null
      : 'Active ECS access is required to enter expedition systems.';
  const boundaryPrimaryAccessAction = isPendingApprovalGate
    ? { id: 'sign_out' as const, label: AUTH_COPY.accessGate.secondary }
    : isVerificationFailureGate
      ? { id: 'refresh_access' as const, label: AUTH_COPY.accessGate.retry }
      : primaryAccessAction
        ? {
            ...primaryAccessAction,
            label:
              primaryAccessAction.id === 'start_subscription' ||
              primaryAccessAction.id === 'manage_subscription'
                ? AUTH_COPY.accessGate.primary
                : primaryAccessAction.label,
          }
        : null;
  const normalizedGateContextLine = isPendingApprovalGate
    ? AUTH_COPY.requestAccess.pendingSupport
    : isVerificationFailureGate
      ? null
      : AUTH_COPY.accessGate.detail;
  const boundaryUtilityAccessActions = isPendingApprovalGate || isVerificationFailureGate
    ? []
    : utilityAccessActions;
  const gateBadgeLabel = isPendingApprovalGate
    ? 'ACCESS PENDING'
    : isVerificationFailureGate
      ? 'ACCESS CHECK'
      : 'ACCESS REQUIRED';
  const gateCardTitle = isPendingApprovalGate
    ? 'ECS Access'
    : isVerificationFailureGate
      ? 'ECS Account'
      : accountUx.title;
  const gateCardStatus = isPendingApprovalGate
    ? 'Approval in progress'
    : isVerificationFailureGate
      ? AUTH_COPY.account.unknown
      : accountUx.stateLabel;
  const gateCardDetail = isPendingApprovalGate
    ? 'This account is signed in, but expedition-system access is still awaiting approval.'
    : isVerificationFailureGate
      ? authNetworkState === 'offline'
        ? 'Your account is signed in, but ECS needs connectivity to confirm current access before opening network-backed systems.'
        : 'Your account is signed in, but ECS still needs to finish access verification before opening expedition systems.'
      : accountUx.kind === 'expired'
        ? 'Active ECS access has expired or become inactive for this account.'
        : 'This account is signed in, but active ECS access has not been enabled for expedition-system entry.';
  const degradedShellMessage =
    effectiveOfflineMode
      ? AUTH_COPY.degraded.liveServicesUnavailable
      : bootstrapError || authNetworkState === 'reconnecting'
        ? AUTH_COPY.degraded.limitedConnectivity
        : null;
  useEffect(() => {
    if (startupRouteHydrated) return;
    let cancelled = false;

    void waitForShellStartupRequirement(
      'route state hydration',
      Promise.all([
        shellRouteCache.waitForHydration(),
        offlineModeCache.waitForHydration(),
        setupStateCache.waitForHydration(),
        setupStore.waitForHydration(),
        vehicleStore.waitForHydration(),
        vehicleSetupStore.waitForHydration(),
      ]).then(() => sanitizeLegacyVehicleFrameworkState()),
      STARTUP_ROUTE_READINESS_TIMEOUT_MS,
    ).then(() => {
      if (!cancelled) {
        setStartupRouteHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [startupRouteHydrated]);

  useEffect(() => {
    if (dashboardShellHydrated || isDashboardHydrated()) {
      setDashboardShellHydrated(true);
      return;
    }

    let cancelled = false;
    void waitForShellStartupRequirement(
      'dashboard shell hydration',
      waitForDashboardHydration(),
      DASHBOARD_SHELL_READINESS_TIMEOUT_MS,
    )
      .then(() => {
        if (!cancelled) {
          setDashboardShellHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dashboardShellHydrated]);

  useEffect(() => {
    let cancelled = false;
    const resolutionTimeout = setTimeout(() => {
      if (!cancelled) {
        setInitialEntryRouteResolved(true);
      }
    }, INITIAL_URL_RESOLUTION_TIMEOUT_MS);

    void Linking.getInitialURL()
      .then((url) => {
        if (cancelled) return;
        setRequestedEntryRoute(normalizeRequestedEntryRouteFromUrl(url));
      })
      .finally(() => {
        if (!cancelled) {
          clearTimeout(resolutionTimeout);
          setInitialEntryRouteResolved(true);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(resolutionTimeout);
    };
  }, []);

  useEffect(() => {
    if (!startupRouteHydrated || !__DEV__) return;
    ecsLog.debug('SHELL', '[AuthGate] startup route hydration ready', {
      pathname: normalizedPathname,
      persistedOfflineMode,
      persistedSetupComplete,
      setupCompletionFlag,
      hasConfiguredVehicle,
      setupNeedsVehicleRecovery,
      storedShellRoute: getStoredShellRoute(),
      setupStoreComplete: setupStore.isComplete(),
      setupVehicleId: setupStore.getSetupVehicleId(),
      activeVehicleId: configuredVehiclePresence?.activeVehicleId ?? null,
      localVehicleCount: configuredVehiclePresence?.localVehicleCount ?? 0,
      userPresent: !!user,
      offlineMode,
    });
  }, [
    normalizedPathname,
    offlineMode,
    persistedOfflineMode,
    persistedSetupComplete,
    setupCompletionFlag,
    hasConfiguredVehicle,
    configuredVehiclePresence?.activeVehicleId,
    configuredVehiclePresence?.localVehicleCount,
    setupNeedsVehicleRecovery,
    startupRouteHydrated,
    user,
  ]);

  useEffect(() => {
    if (!startupRouteHydrated) return;
    if (!setupCompletionFlag) return;
    if (!!vehicleSetupStore.getActiveVehicleId()) return;

    const localVehicles = vehicleStore.getLocalSnapshot();
    if (localVehicles.length === 0) return;

    const preferredVehicleId = setupStore.getSetupVehicleId();
    const recoveredVehicle =
      localVehicles.find((vehicle) => vehicle.id === preferredVehicleId) ?? localVehicles[0];

    if (!recoveredVehicle) return;
    vehicleSetupStore.setActiveVehicleId(recoveredVehicle.id);
  }, [setupCompletionFlag, startupRouteHydrated]);

  useEffect(() => {
    if (!startupRouteHydrated) return;
    const restorableRoute = toRestorableShellRoute(pathname);
    if (!restorableRoute) return;
    if (shellRouteCache.get(SHELL_ROUTE_KEY) === restorableRoute) return;

    shellRouteCache.set(SHELL_ROUTE_KEY, restorableRoute);
    void shellRouteCache.flush();
  }, [pathname, startupRouteHydrated]);

  useEffect(() => {
    if (!startupRouteHydrated) return;
    if (hasAuthenticatedUser || guestOfflineAccess || rememberedOfflineAccess) return;
    if (!shellRouteCache.get(SHELL_ROUTE_KEY)) return;

    shellRouteCache.delete(SHELL_ROUTE_KEY);
    void shellRouteCache.flush();
  }, [
    guestOfflineAccess,
    hasAuthenticatedUser,
    rememberedOfflineAccess,
    startupRouteHydrated,
  ]);

  useEffect(() => {
    setIssueRuntimePath(normalizedPathname);
  }, [normalizedPathname]);

  useEffect(() => {
    setIssueRuntimeActor({
      userId: redactAuthUserId(user?.id ?? null),
      isAdmin: operatorInfo?.is_admin === true,
    });
  }, [operatorInfo?.is_admin, user?.id]);

  useEffect(() => {
    setIssueRuntimeConnectivity({
      isOnline: typeof effectiveOfflineMode === 'boolean' ? !effectiveOfflineMode : null,
      syncStatus: bootstrapError ? 'degraded' : null,
    });
  }, [bootstrapError, effectiveOfflineMode]);

  useEffect(() => {
    if (effectiveOfflineMode) return;
    void flushQueuedIssueEvents();
  }, [effectiveOfflineMode]);

  const inAuthScreen = useMemo(
    () =>
      !isResetCompletionScreen &&
      isAuthRoutePath(normalizedPathname),
    [isResetCompletionScreen, normalizedPathname],
  );
  const inLogin = normalizedPathname === '/login';
  const inProtectedScreen = useMemo(
    () => PROTECTED_SCREENS.some((screen) => normalizedPathname === `/${screen}`),
    [normalizedPathname],
  );
  const accessCheckPending = entitlementResolving && inAuthScreen;
  const shouldShowAccessGate = false;
  const suppressRedirect = false;
  const restorableShellRoute = getStoredShellRoute();
  const entryResolution = useMemo(
    () =>
      resolveDistributionEntryState({
        currentPath: normalizedPathname,
        isLoading,
        authenticated: hasAuthenticatedUser,
        guestOfflineAccess,
        rememberedOfflineAccess,
        accessState,
        offlineMode: shellOfflineMode,
        setupComplete,
        setupRecoveryRequired: setupNeedsVehicleRecovery,
        startupSessionRestored,
        restorableShellRoute,
        requestedEntryRoute,
        isAuthScreen: inAuthScreen,
        isRecoveryScreen: isResetCompletionScreen,
        recoveryMode: credentialRecoveryMode,
        isLoginScreen: inLogin,
        isSetupScreen: inSetup,
        preserveSetupRoute,
        isProtectedScreen: inProtectedScreen,
        bootstrapError,
      }),
    [
      accessState,
      bootstrapError,
      credentialRecoveryMode,
      guestOfflineAccess,
      rememberedOfflineAccess,
      hasAuthenticatedUser,
      inAuthScreen,
      inLogin,
      inProtectedScreen,
      isResetCompletionScreen,
      inSetup,
      isLoading,
      normalizedPathname,
      preserveSetupRoute,
      requestedEntryRoute,
      shellOfflineMode,
      startupSessionRestored,
      restorableShellRoute,
      setupComplete,
      setupNeedsVehicleRecovery,
    ],
  );
  const redirectTarget = entryResolution.redirectTarget;
  const normalizedRedirectTarget = redirectTarget ? normalizeRoutePath(redirectTarget) : null;
  const redirectTargetIsAuthRoute = isAuthRoutePath(normalizedRedirectTarget);
  const hasShellIdentity = hasAuthenticatedUser || guestOfflineAccess || rememberedOfflineAccess;
  const postAuthLoadingTarget =
    hasShellIdentity &&
    entryResolution.shellAccessReady &&
    normalizedRedirectTarget &&
    !redirectTargetIsAuthRoute
      ? normalizedRedirectTarget
      : null;
  const postAuthLoadingGateActive = !!postAuthLoadingTarget && normalizedPathname === '/';
  const postAuthRedirectHoldingScreenActive =
    !!postAuthLoadingTarget &&
    (normalizedPathname === '/' || inAuthScreen) &&
    normalizedPathname !== postAuthLoadingTarget;
  const postAuthLoadingGateKey = postAuthLoadingGateActive
    ? [
        user?.id ?? (rememberedOfflineAccess ? 'remembered_offline' : guestOfflineAccess ? 'guest_offline' : 'shell'),
        postAuthLoadingTarget,
        entryResolution.kind,
      ].join(':')
    : null;

  useEffect(() => {
    if (startupGatePending) return;
    markStartupPhase('initial_route_chosen', {
      currentPath: normalizedPathname,
      redirectTarget: redirectTarget ?? null,
      entryKind: entryResolution.kind,
      setupComplete,
      authenticated: hasAuthenticatedUser,
      rememberedOfflineAccess,
      guestOfflineAccess,
    });
  }, [
    entryResolution.kind,
    guestOfflineAccess,
    hasAuthenticatedUser,
    normalizedPathname,
    redirectTarget,
    rememberedOfflineAccess,
    setupComplete,
    startupGatePending,
  ]);

  useEffect(() => {
    if (isLoading) return;
    if (postAuthRedirectHoldingScreenActive) return;
    if (inSetup || !setupComplete) {
      markStartupPhase('app_rendered_setup', {
        currentPath: normalizedPathname,
        setupComplete,
      });
      return;
    }
    if (inAuthScreen || (!hasAuthenticatedUser && !guestOfflineAccess && !rememberedOfflineAccess)) {
      markStartupPhase('app_rendered_sign_in', {
        currentPath: normalizedPathname,
        hasAuthenticatedUser,
      });
      return;
    }
    markStartupPhase('app_rendered_main', {
      currentPath: normalizedPathname,
      redirectTarget: redirectTarget ?? null,
      entryKind: entryResolution.kind,
    });
  }, [
    entryResolution.kind,
    guestOfflineAccess,
    hasAuthenticatedUser,
    inAuthScreen,
    inSetup,
    isLoading,
    normalizedPathname,
    postAuthRedirectHoldingScreenActive,
    redirectTarget,
    rememberedOfflineAccess,
    setupComplete,
  ]);

  useEffect(() => {
    if (!isLoading) {
      setStartupRecoveryVisible(false);
      return undefined;
    }

    const timeout = setTimeout(() => {
      const currentPhase = getStartupDiagnosticsSnapshot().currentPhase;
      const fallback =
        authPhase === 'restoring' || authPhase === 'signing_in'
          ? 'auth_recovery_surface'
          : setupComplete
            ? 'route_to_shell'
            : 'route_to_setup';

      logStartupStall({
        currentPhase,
        unresolvedRequiredFlags: unresolvedStartupRequiredFlags,
        optionalServicesPending: optionalStartupServicesPending,
        fallback,
        details: {
          authPhase,
          currentPath: normalizedPathname,
          setupComplete,
          authenticated: hasAuthenticatedUser,
          rememberedOfflineAccess,
          guestOfflineAccess,
        },
      });

      if (unresolvedStartupRequiredFlags.length > 0) {
        markStartupPhase('startup_recovery_fallback', {
          fallback,
          unresolvedRequiredFlags: unresolvedStartupRequiredFlags,
        });
        setStartupRecoveryVisible(true);
      }
    }, STARTUP_LOADING_STALL_DIAGNOSTIC_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    authPhase,
    guestOfflineAccess,
    hasAuthenticatedUser,
    isLoading,
    normalizedPathname,
    optionalStartupServicesPending,
    rememberedOfflineAccess,
    setupComplete,
    unresolvedStartupRequiredFlags,
  ]);
  const dashboardReady =
    !startupGatePending &&
    !postAuthBootstrapPending &&
    !accessCheckPending &&
    (postAuthLoadingTarget === '/dashboard' ? dashboardShellHydrated : true);
  const pendingRedirect = useMemo(() => {
    if (!redirectTarget) return false;
    return normalizedPathname !== normalizedRedirectTarget;
  }, [normalizedPathname, normalizedRedirectTarget, redirectTarget]);
  const effectivePendingRedirect = pendingRedirect && !suppressRedirect;
  const dashboardRoutePending =
    normalizedPathname === '/dashboard' && !dashboardShellHydrated;
  const shouldHideCommandDock =
    isLoading ||
    effectivePendingRedirect ||
    dashboardRoutePending ||
    isResetCompletionScreen ||
    inAuthScreen ||
    normalizedPathname === '/pro' ||
    !entryResolution.shellAccessReady;
  const inPreAuthTree =
    normalizedPathname === '/' ||
    (inAuthScreen && !entryResolution.shellAccessReady) ||
    isResetCompletionScreen ||
    (inSetup && !entryResolution.shellAccessReady);
  const showCommandDock = !inPreAuthTree && !shouldHideCommandDock;
  const showSharedShellBodyBackground =
    !inPreAuthTree &&
    (
      showCommandDock ||
      normalizedPathname === '/fleet' ||
      normalizedPathname === '/navigate' ||
      normalizedPathname === '/dashboard' ||
      normalizedPathname === '/discover' ||
      normalizedPathname === '/explore' ||
      normalizedPathname === '/explore-trip-builder' ||
      normalizedPathname === '/explore-offline-prep-pack' ||
      normalizedPathname === '/alert' ||
      normalizedPathname === '/vehicle-config' ||
      normalizedPathname === '/route' ||
      normalizedPathname === '/safety' ||
      normalizedPathname === '/intel' ||
      normalizedPathname === '/more'
    );
  const shellBodyTopInset = 0;
  const shellBodyBottomInset = useMemo(
    () => (showCommandDock ? getCommandDockHeight(insets.bottom) : 0),
    [insets.bottom, showCommandDock],
  );
  const stackScreenOptions = useMemo(
    () => ({
      headerShown: false,
      animation: 'fade' as const,
      animationDuration: MOTION.screenTransition,
      contentStyle: { backgroundColor: inPreAuthTree ? visualPalette.bg : 'transparent' },
    }),
    [inPreAuthTree, visualPalette.bg],
  );

  useEffect(() => {
    if (!__DEV__) return;
    ecsLog.debug('SHELL', '[AuthGate] final route decision', {
      pathname: normalizedPathname,
      redirectTarget,
      pendingRedirect: effectivePendingRedirect,
      entryKind: entryResolution.kind,
      destinationSource: entryResolution.destinationSource,
      shellAccessReady: entryResolution.shellAccessReady,
      shellRestoreEligible: entryResolution.shellRestoreEligible,
      routeRestoreEligible: entryResolution.routeRestoreEligible,
      routeRestoreRejected: entryResolution.routeRestoreRejected,
      authenticated: hasAuthenticatedUser,
      guestOfflineAccess,
      rememberedOfflineAccess,
      offlineMode: shellOfflineMode,
      setupComplete,
    });
  }, [
    effectivePendingRedirect,
    entryResolution.destinationSource,
    entryResolution.kind,
    entryResolution.routeRestoreEligible,
    entryResolution.routeRestoreRejected,
    entryResolution.shellAccessReady,
    entryResolution.shellRestoreEligible,
    hasAuthenticatedUser,
    guestOfflineAccess,
    rememberedOfflineAccess,
    normalizedPathname,
    redirectTarget,
    setupComplete,
    shellOfflineMode,
  ]);
  const showEntryBootstrapBanner =
    normalizedPathname === '/' || inAuthScreen || isResetCompletionScreen;
  const showBootstrapBanner =
    hasAuthenticatedUser &&
    showEntryBootstrapBanner &&
    !!(bootstrapError || degradedShellMessage);
  const authEntryMode =
    isResetCompletionScreen
      ? 'manual_login'
      : inAuthScreen
        ? 'manual_login'
        : entryResolution.kind === 'authenticated_restore'
          ? 'remembered_session'
          : 'cold_launch';
  const authScreenLoadingHandoffActive =
    !isResetCompletionScreen &&
    inAuthScreen &&
    (
      authPhase === 'signing_in' ||
      postAuthBootstrapPending ||
      postAuthRedirectHoldingScreenActive
    );
  useEffect(() => {
    postAuthLoadingNavigationRef.current = null;
    setMinimumLoadingElapsed(false);

    if (!postAuthLoadingGateKey && !postAuthRedirectHoldingScreenActive) return;

    const minimumLoadingTimer = setTimeout(() => {
      setMinimumLoadingElapsed(true);
    }, MIN_LOADING_MS);

    return () => {
      clearTimeout(minimumLoadingTimer);
    };
  }, [postAuthLoadingGateKey, postAuthRedirectHoldingScreenActive]);

  useEffect(() => {
    if (!postAuthRedirectHoldingScreenActive || !postAuthLoadingTarget) return undefined;

    const fallbackTimer = setTimeout(() => {
      if (!postAuthRedirectHoldingScreenActive || !postAuthLoadingTarget) return;

      markStartupPhase('post_auth_handoff_fallback_route', {
        currentPath: normalizedPathname,
        target: postAuthLoadingTarget,
        dashboardReady,
        minimumLoadingElapsed,
      });
      router.replace(toExpoRouterShellTarget(postAuthLoadingTarget) as any);
    }, POST_AUTH_HANDOFF_ROUTE_TIMEOUT_MS);

    return () => {
      clearTimeout(fallbackTimer);
    };
  }, [
    dashboardReady,
    minimumLoadingElapsed,
    normalizedPathname,
    postAuthLoadingTarget,
    postAuthRedirectHoldingScreenActive,
    router,
  ]);

  const handleAccessAction = useCallback(
    async (
      actionId:
        | 'sign_in'
        | 'refresh_access'
        | 'restore_purchases'
        | 'manage_subscription'
        | 'start_subscription'
        | 'sign_out',
    ) => {
      if (accessActionBusy || billingBusy) return;

      if (actionId === 'sign_in') {
        router.replace('/login');
        return;
      }

      if (actionId === 'manage_subscription') {
        const ok = await openManageSubscription();
        if (!ok) {
          showToast('Unable to open subscription management on this device.');
        }
        return;
      }

      setAccessActionBusy(actionId);

      try {
        switch (actionId) {
          case 'start_subscription': {
            const result = await purchaseEcsProMonthly();
            if (result.success) {
              showToast('ECS access confirmed');
            } else if (result.cancelled) {
              showToast('Purchase cancelled');
            } else if (result.pending) {
              showToast(result.error || 'Purchase pending confirmation');
            } else if (result.error) {
              showToast(result.error);
            }
            break;
          }
          case 'restore_purchases': {
            const result = await restoreEcsProAccess();
            showToast(result.success ? 'Purchases restored' : (result.error || 'Restore failed'));
            break;
          }
          case 'refresh_access': {
            await refreshAccessState();
            showToast('ECS access refreshed');
            break;
          }
          case 'sign_out': {
            await signOut();
            break;
          }
        }
      } catch (error: any) {
        showToast(
          actionId === 'refresh_access'
            ? verificationFailureLine
            : error?.message || verificationFailureLine,
        );
      } finally {
        setAccessActionBusy(null);
      }
    },
    [
      accessActionBusy,
      billingBusy,
      purchaseEcsProMonthly,
      refreshAccessState,
      restoreEcsProAccess,
      router,
      showToast,
      signOut,
      verificationFailureLine,
    ],
  );

  useEffect(() => {
    runtimeSmokeStore.updateShell({
      enabled: !!accessState?.canAccessAdminSurfaces || __DEV__,
      currentPath: normalizedPathname,
      redirectTarget,
      entryKind: entryResolution.kind,
      authenticated: hasAuthenticatedUser,
      setupComplete,
      offlineMode: shellOfflineMode,
      bootstrapError,
      isProtectedScreen: inProtectedScreen,
      restorableShellRoute,
      shellAccessReady: entryResolution.shellAccessReady,
      shellRestoreEligible: entryResolution.shellRestoreEligible,
      routeRestoreEligible: entryResolution.routeRestoreEligible,
      accessState: accessState
        ? {
            role: accessState.role,
            entitlementSource: accessState.entitlementSource,
            accessState: accessState.accessState,
            verificationMode: accessState.verificationMode,
            authenticated: accessState.authenticated,
            suspended: accessState.suspended,
            hasFullAccess: accessState.hasFullAccess,
            isPrivilegedGrant: accessState.isPrivilegedGrant,
            canAccessAdminSurfaces: accessState.canAccessAdminSurfaces,
            accountLabel: accessState.accountLabel,
            statusLabel: accessState.statusLabel,
            sourceLabel: accessState.sourceLabel,
            badgeLabel: accessState.badgeLabel,
          }
        : null,
    });
  }, [
    accessState,
    bootstrapError,
    entryResolution.kind,
    entryResolution.destinationSource,
    entryResolution.routeRestoreEligible,
    entryResolution.routeRestoreRejected,
    entryResolution.shellAccessReady,
    entryResolution.shellRestoreEligible,
    inProtectedScreen,
    normalizedPathname,
    redirectTarget,
    restorableShellRoute,
    shellOfflineMode,
    setupComplete,
    hasAuthenticatedUser,
  ]);

  useEffect(() => {
    if (!hasAuthenticatedUser) {
      accessVerificationLoggedRef.current = false;
      accessVerificationOutcomeRef.current = null;
      firstAuthenticatedFrameLoggedRef.current = false;
      destinationResolutionRef.current = null;
      degradedMessageRef.current = null;
      return;
    }
  }, [hasAuthenticatedUser, user?.id]);

  useEffect(() => {
    if (
      !hasAuthenticatedUser ||
      !degradedShellMessage ||
      isLoading ||
      inAuthScreen ||
      shouldShowAccessGate ||
      accessCheckPending
    ) {
      degradedMessageRef.current = null;
      return;
    }

    const degradedKey = `${normalizedPathname}:${degradedShellMessage}:${authNetworkState}:${effectiveOfflineMode ? 'offline_mode' : 'online_mode'}`;
    if (degradedMessageRef.current === degradedKey) return;
    degradedMessageRef.current = degradedKey;

    recordAuthDiagnostic('auth_degraded_state_presented', {
      route: normalizedPathname,
      entry_mode: authEntryMode,
      result: 'success',
      network_state: authNetworkState,
      access_state: accessState?.accessState ?? (hasAuthenticatedUser ? 'authenticated' : 'signed_out'),
      metadata: {
        message: degradedShellMessage,
        bootstrapError: bootstrapError ?? null,
        offlineMode: effectiveOfflineMode,
      },
    });
  }, [
    accessCheckPending,
    accessState?.accessState,
    authEntryMode,
    authNetworkState,
    bootstrapError,
    degradedShellMessage,
    effectiveOfflineMode,
    inAuthScreen,
    isLoading,
    normalizedPathname,
    shouldShowAccessGate,
    hasAuthenticatedUser,
  ]);

  useEffect(() => {
    if (!hasAuthenticatedUser || !entitlementResolving || accessVerificationLoggedRef.current) return;
    accessVerificationLoggedRef.current = true;
    accessVerificationOutcomeRef.current = null;
    markAuthTimingStart('auth_access_verification');
    recordAuthDiagnostic('auth_access_verification_started', {
      route: normalizedPathname,
      entry_mode: authEntryMode,
      result: 'started',
      network_state: authNetworkState,
      access_state: accessState?.accessState ?? 'unknown',
      metadata: {
        entryKind: entryResolution.kind,
        verificationMode: accessState?.verificationMode ?? 'unknown',
      },
    });
  }, [
    accessCheckPending,
    accessState?.accessState,
    accessState?.verificationMode,
    authEntryMode,
    authNetworkState,
    entitlementResolving,
    entryResolution.kind,
    normalizedPathname,
    hasAuthenticatedUser,
  ]);

  useEffect(() => {
    if (
      !hasAuthenticatedUser ||
      !accessVerificationLoggedRef.current ||
      accessVerificationOutcomeRef.current ||
      entitlementResolving
    ) {
      return;
    }

    const durationMs = consumeAuthTiming('auth_access_verification');
    if (bootstrapError) {
      accessVerificationOutcomeRef.current = 'failure';
      recordAuthDiagnostic('auth_access_verification_failed', {
        route: normalizedPathname,
        entry_mode: authEntryMode,
        result: 'failure',
        failure_category: 'entitlement_verification_failed',
        duration_ms: durationMs,
        network_state: authNetworkState,
        access_state: accessState?.accessState ?? 'unknown',
        metadata: {
          entryKind: entryResolution.kind,
          verificationMode: accessState?.verificationMode ?? 'unknown',
          bootstrapError: bootstrapError ?? null,
        },
      });
      return;
    }

    accessVerificationOutcomeRef.current = 'success';
    recordAuthDiagnostic('auth_access_verification_succeeded', {
      route: normalizedPathname,
      entry_mode: authEntryMode,
      result: 'success',
      duration_ms: durationMs,
      network_state: authNetworkState,
      access_state: accessState?.accessState ?? 'unknown',
      metadata: {
        entryKind: entryResolution.kind,
        verificationMode: accessState?.verificationMode ?? 'unknown',
        shellScope: accessState?.scope ?? 'limited',
        hasFullAccess: accessState?.hasFullAccess ?? false,
      },
    });
  }, [
    accessState?.accessState,
    accessState?.hasFullAccess,
    accessState?.scope,
    accessState?.verificationMode,
    authEntryMode,
    authNetworkState,
    bootstrapError,
    entitlementResolving,
    entryResolution.kind,
    normalizedPathname,
    hasAuthenticatedUser,
  ]);

  useEffect(() => {
    if (isLoading || suppressRedirect || !hasAuthenticatedUser || !entryResolution.shellAccessReady) {
      destinationResolutionRef.current = null;
      return;
    }

    const target = redirectTarget ?? normalizedPathname;
    const resolutionKey = [
      normalizedPathname,
      target,
      entryResolution.destinationSource,
      entryResolution.routeRestoreRejected ? 'restore_rejected' : 'restore_accepted',
      authEntryMode,
    ].join(':');

    if (destinationResolutionRef.current === resolutionKey) return;
    destinationResolutionRef.current = resolutionKey;

    recordAuthDiagnostic(
      entryResolution.routeRestoreRejected
        ? 'auth_authenticated_destination_fallback'
        : 'auth_authenticated_destination_resolved',
      {
        route: normalizedPathname,
        entry_mode: authEntryMode,
        result: entryResolution.routeRestoreRejected ? 'fallback' : 'success',
        network_state: authNetworkState,
        access_state: accessState?.accessState ?? 'active',
        metadata: {
          entryKind: entryResolution.kind,
          destinationSource: entryResolution.destinationSource,
          destinationTarget: target,
          requestedRestorableRoute: entryResolution.requestedRestorableRoute,
        },
      },
    );
  }, [
    accessState?.accessState,
    authEntryMode,
    authNetworkState,
    entryResolution.destinationSource,
    entryResolution.kind,
    entryResolution.requestedRestorableRoute,
    entryResolution.routeRestoreRejected,
    entryResolution.shellAccessReady,
    isLoading,
    normalizedPathname,
    redirectTarget,
    suppressRedirect,
    hasAuthenticatedUser,
  ]);

  useEffect(() => {
    if (!redirectTarget || !effectivePendingRedirect || inAuthScreen) {
      routeGuardFallbackRef.current = null;
      return;
    }

    const fallbackKey = `${normalizedPathname}->${redirectTarget}:${entryResolution.kind}:${hasAuthenticatedUser ? 'auth' : 'guest'}`;
    if (routeGuardFallbackRef.current === fallbackKey) return;
    routeGuardFallbackRef.current = fallbackKey;
    recordAuthDiagnostic('auth_route_guard_fallback', {
      route: normalizedPathname,
      entry_mode: authEntryMode,
      result: 'fallback',
      failure_category: 'route_guard_mismatch',
      network_state: authNetworkState,
      access_state: accessState?.accessState ?? (hasAuthenticatedUser ? 'authenticated' : 'signed_out'),
      metadata: {
        entryKind: entryResolution.kind,
        redirectTarget,
        destinationSource: entryResolution.destinationSource,
      },
    });
  }, [
    accessState?.accessState,
    authEntryMode,
    authNetworkState,
    entryResolution.destinationSource,
    effectivePendingRedirect,
    entryResolution.kind,
    inAuthScreen,
    normalizedPathname,
    redirectTarget,
    hasAuthenticatedUser,
  ]);

  useEffect(() => {
    const firstFrameReady =
      hasAuthenticatedUser &&
      !isLoading &&
      !effectivePendingRedirect &&
      !isResetCompletionScreen &&
      !inAuthScreen;
    if (!firstFrameReady || firstAuthenticatedFrameLoggedRef.current) return;
    firstAuthenticatedFrameLoggedRef.current = true;
    recordAuthDiagnostic('auth_first_authenticated_frame_visible', {
      route: normalizedPathname,
      entry_mode: authEntryMode,
      result: 'success',
      duration_ms: consumeAuthTiming('auth_success_to_first_frame'),
      network_state: authNetworkState,
      access_state: accessState?.accessState ?? 'active',
      metadata: {
        entryKind: entryResolution.kind,
        destinationSource: entryResolution.destinationSource,
      },
    });
  }, [
    accessState?.accessState,
    authEntryMode,
    authNetworkState,
    entryResolution.destinationSource,
    effectivePendingRedirect,
    hasAuthenticatedUser,
    entryResolution.kind,
    isResetCompletionScreen,
    inAuthScreen,
    isLoading,
    normalizedPathname,
  ]);

  useEffect(() => {
    if (isLoading || suppressRedirect) return;

    const replaceWithRedirectTarget = () => {
      const target = redirectTarget;
      if (!target) return;

      const run = async () => {
        if (legacyFleetSetupRoute && target === '/fleet') {
          const legacyRedirectKey = `${setupRouteMode}:${setupRouteVehicleId ?? 'new'}`;
          if (legacyFleetSetupRedirectRef.current !== legacyRedirectKey) {
            legacyFleetSetupRedirectRef.current = legacyRedirectKey;
            try {
              await stageNavigationFlow({
                source: 'fleet',
                target: 'fleet',
                intent: setupRouteMode === 'fleet-edit' ? 'fleet_edit_vehicle' : 'fleet_add_vehicle',
                label: setupRouteMode === 'fleet-edit' ? 'Edit Vehicle' : 'Add Vehicle',
                message: null,
                context: { vehicleId: setupRouteVehicleId },
              });
            } catch (error) {
              ecsLog.debug('SHELL', '[AuthGate] legacy Fleet setup redirect staging failed', {
                mode: setupRouteMode,
                vehicleId: setupRouteVehicleId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
        router.replace(toExpoRouterShellTarget(target) as any);
      };
      void run();
    };

    if (redirectTarget) {
      if (postAuthLoadingGateActive || postAuthRedirectHoldingScreenActive) {
        if (!minimumLoadingElapsed || !dashboardReady) {
          return;
        }

        const navigationKey = `${postAuthLoadingGateKey ?? 'post_auth_loading'}:${redirectTarget}`;
        if (postAuthLoadingNavigationRef.current === navigationKey) return;
        postAuthLoadingNavigationRef.current = navigationKey;

        if (effectivePendingRedirect) {
          replaceWithRedirectTarget();
        }
        return;
      }

      if (effectivePendingRedirect) {
        replaceWithRedirectTarget();
      }
      return;
    }
  }, [
    effectivePendingRedirect,
    redirectTarget,
    router,
    isLoading,
    dashboardReady,
    suppressRedirect,
    postAuthLoadingTarget,
    inAuthScreen,
    normalizedPathname,
    postAuthLoadingGateActive,
    postAuthRedirectHoldingScreenActive,
    minimumLoadingElapsed,
    postAuthLoadingGateKey,
    legacyFleetSetupRoute,
    setupRouteMode,
    setupRouteVehicleId,
  ]);

  if (startupRecoveryVisible && isLoading) {
    return (
      <AdaptiveBackground>
        <View
          style={[
            styles.accessGateScreen,
            {
              paddingHorizontal: authLayout.horizontalPadding,
              paddingTop: authLayout.topPadding,
              paddingBottom: authLayout.bottomPadding,
              justifyContent: authLayout.centerContent ? 'center' : 'flex-start',
            },
          ]}
        >
          <StatusBar style={statusBarStyle} />
          <View
            style={[
              styles.accessGateCard,
              {
                maxWidth: authLayout.accessGateMaxWidth,
                backgroundColor: visualPalette.card,
                borderColor: `${visualPalette.amber}26`,
                shadowColor: '#000',
              },
            ]}
          >
            <AuthBrandLockup
              title="ECS Startup"
              supporting="Startup is taking longer than expected."
              variant="state"
              containerStyle={styles.accessGateBrandBlock}
              accentColor={visualPalette.amber}
              textColor={visualPalette.text}
              mutedColor={visualPalette.textMuted}
            />
            <Text style={[styles.accessGateContext, { color: visualPalette.textMuted }]}>
              ECS is continuing with a safe startup path. Live services can reconnect after the app opens.
            </Text>
            {__DEV__ ? (
              <View
                style={[
                  styles.accessStatusCard,
                  {
                    backgroundColor: `${visualPalette.bgElevated}E6`,
                    borderColor: `${visualPalette.border}80`,
                  },
                ]}
              >
                <Text style={[styles.accessStatusEyebrow, { color: visualPalette.amber }]}>
                  STARTUP DIAGNOSTICS
                </Text>
                <Text style={[styles.accessStatusLine, { color: visualPalette.textMuted }]}>
                  Required: {unresolvedStartupRequiredFlags.join(', ') || 'none'}
                </Text>
                <Text style={[styles.accessStatusLine, { color: visualPalette.textMuted }]}>
                  Optional: {optionalStartupServicesPending.join(', ') || 'none'}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={[styles.accessPrimaryButton, { backgroundColor: visualPalette.amber }]}
              activeOpacity={0.82}
              onPress={() => {
                setStartupRecoveryVisible(false);
                router.replace((setupComplete ? getPreferredShellRoute() : '/setup') as any);
              }}
            >
              <Text style={[styles.accessPrimaryButtonText, { color: visualPalette.bg }]}>
                Continue
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </AdaptiveBackground>
    );
  }

  if (
    (postAuthRedirectHoldingScreenActive && normalizedPathname === '/') ||
    authScreenLoadingHandoffActive
  ) {
    return <LoadingTransitionVideo />;
  }

  if (shouldShowAccessGate) {
    return (
      <AdaptiveBackground>
        <View
          style={[
            styles.accessGateScreen,
            {
              paddingHorizontal: authLayout.horizontalPadding,
              paddingTop: authLayout.topPadding,
              paddingBottom: authLayout.bottomPadding,
              justifyContent: authLayout.centerContent ? 'center' : 'flex-start',
            },
          ]}
        >
          <StatusBar style={statusBarStyle} />
          <View
            style={[
              styles.accessGateCard,
              {
                maxWidth: authLayout.accessGateMaxWidth,
                backgroundColor: visualPalette.card,
                borderColor: `${visualPalette.amber}26`,
                shadowColor: '#000',
              },
            ]}
          >
            <AuthBrandLockup
              title={gateTitle}
              supporting={gateSupporting}
              variant="state"
              containerStyle={styles.accessGateBrandBlock}
              accentColor={visualPalette.amber}
              textColor={visualPalette.text}
              mutedColor={visualPalette.textMuted}
            />
            {(normalizedGateContextLine ?? gateContextLine) ? (
              <Text style={[styles.accessGateContext, { color: visualPalette.textMuted }]}>
                {normalizedGateContextLine ?? gateContextLine}
              </Text>
            ) : null}

            <View
              style={[
                styles.accessStatusCard,
                {
                  backgroundColor: `${visualPalette.bgElevated}E6`,
                  borderColor: `${visualPalette.border}80`,
                },
              ]}
            >
              <Text style={[styles.accessStatusEyebrow, { color: visualPalette.amber }]}>
                {gateBadgeLabel}
              </Text>
              <Text style={[styles.accessStatusTitle, { color: visualPalette.text }]}>
                {gateCardTitle}
              </Text>
              <Text style={[styles.accessStatusLine, { color: visualPalette.textMuted }]}>
                {gateCardStatus}
              </Text>
              <Text style={[styles.accessStatusDetail, { color: visualPalette.textMuted }]}>
                {gateCardDetail}
              </Text>
            </View>

            {!!billingError && (
              <Text style={[styles.accessGateMessage, { color: '#D97B72' }]}>{billingError}</Text>
            )}
            {!!accountUx.billingFlowLabel && (
              <View style={styles.accessGateStatusRow}>
                {(billingBusy || accessActionBusy === 'refresh_access') && (
                  <ActivityIndicator size="small" color={visualPalette.amber} />
                )}
                <Text style={[styles.accessGateStatusText, { color: visualPalette.textMuted }]}>
                  {accountUx.billingFlowLabel}
                </Text>
              </View>
            )}

            {boundaryPrimaryAccessAction && (
              <TouchableOpacity
                style={[
                  styles.accessPrimaryButton,
                  {
                    backgroundColor: visualPalette.amber,
                  },
                  (billingBusy || !!accessActionBusy) && styles.accessPrimaryButtonDisabled,
                ]}
                activeOpacity={0.82}
                disabled={billingBusy || !!accessActionBusy}
                onPress={() => void handleAccessAction(boundaryPrimaryAccessAction.id)}
              >
                <Text style={[styles.accessPrimaryButtonText, { color: visualPalette.bg }]}>
                  {accessActionBusy === boundaryPrimaryAccessAction.id
                    ? boundaryPrimaryAccessAction.id === 'refresh_access'
                      ? boundaryPrimaryAccessAction.label === AUTH_COPY.accessGate.retry
                        ? 'Trying again...'
                        : 'Verifying access...'
                      : boundaryPrimaryAccessAction.id === 'sign_out'
                        ? AUTH_COPY.logout.primaryLoading
                      : boundaryPrimaryAccessAction.id === 'start_subscription'
                        ? boundaryPrimaryAccessAction.label === AUTH_COPY.accessGate.primary
                          ? 'Opening access...'
                          : ecsProProduct?.priceLabel
                            ? `Starting Pro - ${ecsProProduct.priceLabel}`
                            : 'Starting Pro...'
                      : boundaryPrimaryAccessAction.id === 'manage_subscription'
                        ? boundaryPrimaryAccessAction.label === AUTH_COPY.accessGate.primary
                          ? 'Opening access...'
                          : `${boundaryPrimaryAccessAction.label}...`
                        : `${boundaryPrimaryAccessAction.label}...`
                    : boundaryPrimaryAccessAction.label}
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.accessGateUtilityRow}>
              {boundaryUtilityAccessActions.map((action) => (
                <TouchableOpacity
                  key={action.id}
                  style={[
                    styles.accessUtilityButton,
                    {
                      borderColor: `${visualPalette.border}A6`,
                      backgroundColor: `${visualPalette.bgElevated}CC`,
                    },
                  ]}
                  activeOpacity={0.76}
                  disabled={billingBusy || !!accessActionBusy}
                  onPress={() => void handleAccessAction(action.id)}
                >
                  <Text style={[styles.accessUtilityButtonText, { color: visualPalette.text }]}>
                    {accessActionBusy === action.id ? 'Working...' : action.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.accessUtilityButton,
                  {
                    borderColor: `${visualPalette.border}A6`,
                    backgroundColor: `${visualPalette.bgElevated}CC`,
                  },
                ]}
                activeOpacity={0.76}
                disabled={billingBusy || !!accessActionBusy}
                onPress={() => void handleAccessAction('sign_out')}
              >
                <Text style={[styles.accessUtilityButtonText, { color: visualPalette.textMuted }]}>
                  {accessActionBusy === 'sign_out' ? AUTH_COPY.logout.primaryLoading : AUTH_COPY.logout.primary}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.accessGateFootnote, { color: visualPalette.textMuted }]}>
              {isPendingApprovalGate
                ? 'Sign out if you need to switch accounts while approval is still pending.'
                : accountUx.kind === 'reconnecting'
                ? 'If access should already be active, refresh this account or restore purchases before trying again.'
                : 'Access is verified after sign in and tied to the ECS account currently active on this device.'}
            </Text>
          </View>
        </View>
      </AdaptiveBackground>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: visualPalette.bg }}>
      <StatusBar style={statusBarStyle} />
      {showSharedShellBodyBackground ? (
        <ShellBodyBackground
          topInset={shellBodyTopInset}
          bottomInset={shellBodyBottomInset}
        />
      ) : null}

      {showBootstrapBanner && (
        <View
          style={[
            styles.bootstrapBanner,
            {
              backgroundColor: visualPalette.amber + '15',
              borderBottomColor: visualPalette.amber + '30',
            },
          ]}
        >
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={visualPalette.amber}
          />
          <Text style={[styles.bootstrapText, { color: visualPalette.amber }]}>
            {degradedShellMessage ?? entryResolution.bootstrapLabel ?? `Signed in. ${bootstrapError}`}
          </Text>
          <TouchableOpacity
            onPress={retryBootstrap}
            style={[
              styles.retryBtn,
            {
              backgroundColor: visualPalette.amber + '25',
              borderColor: visualPalette.amber + '40',
            },
          ]}
          activeOpacity={0.7}
        >
            <Text style={[styles.retryText, { color: visualPalette.amber }]}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {inPreAuthTree ? (
        <Stack screenOptions={stackScreenOptions}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="initialize" />
          <Stack.Screen name="create-access-key" />
          <Stack.Screen name="auth-info" />
          <Stack.Screen name="pro" />
          <Stack.Screen name="join-expedition" />
          <Stack.Screen name="expedition-channel/join/[code]" />
          <Stack.Screen
            name="setup"
            options={{
              animation: 'fade',
              animationDuration: MOTION.screenTransition,
            }}
          />
        </Stack>
      ) : (
        <ViewerSettingsProvider>
          <WizardStateProvider>
            <Stack screenOptions={stackScreenOptions}>
              <Stack.Screen name="index" />
              <Stack.Screen
                name="setup"
                options={{
                  animation: 'fade',
                  animationDuration: MOTION.screenTransition,
                }}
              />
              <Stack.Screen
                name="expedition-detail"
                options={{
                  animation: 'fade_from_bottom',
                  animationDuration: MOTION.modalSlide,
                }}
              />
              <Stack.Screen
                name="expedition-wizard"
                options={{
                  animation: 'fade_from_bottom',
                  animationDuration: MOTION.modalSlide,
                }}
              />
              <Stack.Screen
                name="expedition-command"
                options={{
                  animation: 'fade',
                  animationDuration: MOTION.screenTransition,
                }}
              />
              <Stack.Screen
                name="expedition-checklist"
                options={{
                  animation: 'fade_from_bottom',
                  animationDuration: MOTION.modalSlide,
                }}
              />
              <Stack.Screen
                name="expedition-log"
                options={{
                  animation: 'fade_from_bottom',
                  animationDuration: MOTION.modalSlide,
                }}
              />
              <Stack.Screen
                name="expedition-route-mgr"
                options={{
                  animation: 'fade_from_bottom',
                  animationDuration: MOTION.modalSlide,
                }}
              />
              <Stack.Screen
                name="navigate-run"
                options={{
                  animation: 'fade_from_bottom',
                  animationDuration: MOTION.modalSlide,
                }}
              />
              <Stack.Screen
                name="navigate-offline"
                options={{
                  animation: 'fade_from_bottom',
                  animationDuration: MOTION.modalSlide,
                }}
              />
              <Stack.Screen
                name="navigate-bailouts"
                options={{
                  animation: 'fade_from_bottom',
                  animationDuration: MOTION.modalSlide,
                }}
              />
              <Stack.Screen
                name="weight-dashboard"
                options={{
                  animation: 'fade_from_bottom',
                  animationDuration: MOTION.modalSlide,
                }}
              />
              <Stack.Screen
                name="expedition-livelog"
                options={{
                  animation: 'fade_from_bottom',
                  animationDuration: MOTION.modalSlide,
                }}
              />
              <Stack.Screen
                name="expedition-dispatch"
                options={{
                  animation: 'fade_from_bottom',
                  animationDuration: MOTION.modalSlide,
                }}
              />
              <Stack.Screen
                name="convoy-command"
                options={{
                  animation: 'fade_from_bottom',
                  animationDuration: MOTION.modalSlide,
                }}
              />
              <Stack.Screen
                name="expedition-archive"
                options={{
                  animation: 'fade_from_bottom',
                  animationDuration: MOTION.modalSlide,
                }}
              />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="power"
                options={{
                  animation: 'fade_from_bottom',
                  animationDuration: MOTION.modalSlide,
                }}
              />
              <Stack.Screen
                name="vehicle-display"
                options={{
                  animation: 'fade',
                  animationDuration: MOTION.screenTransition,
                }}
              />
            </Stack>

            {showCommandDock ? (
              <OfflineSyncStatusChip bottomOffset={shellBodyBottomInset + 10} />
            ) : null}
            {showCommandDock ? <CommandDock /> : null}
          </WizardStateProvider>
        </ViewerSettingsProvider>
      )}
    </View>
  );
}

/**
 * RootLayout — entry point for the entire app
 */
export default function RootLayout() {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    void initializeEcsIssueIntelligence();

    const globalErrorUtils = (globalThis as any)?.ErrorUtils;
    const previousHandler =
      typeof globalErrorUtils?.getGlobalHandler === 'function'
        ? globalErrorUtils.getGlobalHandler()
        : null;

    if (typeof globalErrorUtils?.setGlobalHandler === 'function') {
      globalErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        const reporter = isFatal ? reportFatalIssue : reportNonFatalIssue;
        reporter({
          severity: isFatal ? 'critical' : 'high',
          issueTitle: isFatal ? 'Unhandled runtime exception' : 'Unhandled runtime error',
          ecsArea: 'app_shell',
          error,
          message: error?.message ?? 'Unhandled runtime error',
          signature: `global:${isFatal ? 'fatal' : 'error'}:${error?.name ?? 'Error'}:${error?.message ?? ''}`,
          metadata: {
            source: 'global_error_handler',
          },
        });

        try {
          previousHandler?.(error, isFatal);
        } catch {}
      });
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportNonFatalIssue({
        severity: 'high',
        issueTitle: 'Unhandled promise rejection',
        ecsArea: 'app_shell',
        error: event?.reason,
        message:
          event?.reason instanceof Error
            ? event.reason.message
            : typeof event?.reason === 'string'
              ? event.reason
              : 'Unhandled promise rejection',
        signature: `global:promise_rejection:${String(event?.reason ?? 'unknown')}`,
        metadata: {
          source: 'window.unhandledrejection',
        },
      });
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('unhandledrejection', handleUnhandledRejection);
    }

    return () => {
      if (typeof globalErrorUtils?.setGlobalHandler === 'function' && previousHandler) {
        globalErrorUtils.setGlobalHandler(previousHandler);
      }
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      }
    };
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;

      if (
        prevState === 'active' &&
        (nextState === 'background' || nextState === 'inactive')
      ) {
        ecsLog.debug(
          'SHELL',
          `[RootLayout] App state ${prevState} -> ${nextState} — flushing dashboard writes`,
        );
        flushDashboardWrites().catch((err) => {
          ecsLog.warn('SHELL', '[RootLayout] Dashboard flush on background failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
        void flushQueuedIssueEvents();

        ecsSyncCoordinator.suspend();
      }

      if (
        (prevState === 'background' || prevState === 'inactive') &&
        nextState === 'active'
      ) {
        ecsSyncCoordinator.resume();
        offlineTileSyncCoordinator.resumePendingJobs({ syncType: 'route' });
        void flushQueuedIssueEvents();
      }

      appStateRef.current = nextState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    offlineTileSyncCoordinator.resumePendingJobs({ syncType: 'route' });
  }, []);

  useEffect(() => {
    const cleanup = timelineIntelligenceEngine.initAutoMonitor();
    ecsLog.debug('SHELL', '[RootLayout] Timeline Intelligence Engine auto-monitor initialized');
    return cleanup;
  }, []);

  useEffect(() => {
    void restoreUnifiedDeviceSessions();
  }, []);

  useEffect(() => {
    androidAutoBridge.start();
    ecsLog.debug('SHELL', '[RootLayout] Android Auto bridge initialized');
    return () => {
      androidAutoBridge.stop();
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      ecsSyncCoordinator.start();
      ecsLog.debug('SHELL', '[RootLayout] ECS Sync Coordinator started');
    }, 3000);

    return () => {
      clearTimeout(timer);
      ecsSyncCoordinator.stop();
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      ecsOfflineInterlock.initialize();
      ecsLog.debug('SHELL', '[RootLayout] ECS Offline Interlock initialized');
    }, 4000);

    return () => {
      clearTimeout(timer);
      ecsOfflineInterlock.stopMonitoring();
    };
  }, []);

  return (
    <View style={styles.rootStartupFrame}>
      <AppProvider>
        <ThemeProvider>
          <AuthGate />
        </ThemeProvider>
      </AppProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  rootStartupFrame: {
    flex: 1,
    backgroundColor: ECS.bgPrimary,
  },
  bootstrapBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 50,
    zIndex: 10,
  },
  bootstrapText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  retryText: {
    fontSize: 11,
    fontWeight: '700',
  },
  accessGateScreen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: AUTH_VISUAL_SPEC.spacing.accessScreenPaddingX,
    paddingVertical: AUTH_VISUAL_SPEC.spacing.accessScreenPaddingY,
  },
  accessGateCard: {
    width: '100%',
    maxWidth: AUTH_VISUAL_SPEC.widths.accessGatePhoneMax,
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: AUTH_VISUAL_SPEC.state.accessGateCardRadius,
    paddingHorizontal: AUTH_VISUAL_SPEC.spacing.panelPaddingX,
    paddingTop: 24,
    paddingBottom: AUTH_VISUAL_SPEC.spacing.panelPaddingBottom,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 32,
    elevation: 10,
  },
  accessGateBrandBlock: {
    marginBottom: AUTH_VISUAL_SPEC.spacing.headerBrandLabelGap.hero,
  },
  accessGateContext: {
    marginTop: AUTH_VISUAL_SPEC.spacing.accessContextMarginTop,
    maxWidth: AUTH_VISUAL_SPEC.state.accessContextMaxWidth,
    fontSize: AUTH_VISUAL_SPEC.typography.footerHelper.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.loadingDetail.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.footerHelper.fontWeight,
    textAlign: 'center',
    opacity: 0.92,
  },
  accessStatusCard: {
    width: '100%',
    marginTop: AUTH_VISUAL_SPEC.spacing.accessStateCardMarginTop,
    borderRadius: AUTH_VISUAL_SPEC.state.accessStatusRadius,
    borderWidth: 1,
    paddingHorizontal: AUTH_VISUAL_SPEC.spacing.accessStateCardPaddingX,
    paddingVertical: AUTH_VISUAL_SPEC.spacing.accessStateCardPaddingY,
  },
  accessStatusEyebrow: {
    fontSize: AUTH_VISUAL_SPEC.typography.accessEyebrow.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.accessEyebrow.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.accessEyebrow.fontWeight,
    letterSpacing: AUTH_VISUAL_SPEC.typography.accessEyebrow.letterSpacing,
    textTransform: 'uppercase',
  },
  accessStatusTitle: {
    marginTop: AUTH_VISUAL_SPEC.spacing.accessContextMarginTop,
    fontSize: AUTH_VISUAL_SPEC.typography.accessTitle.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.accessTitle.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.accessTitle.fontWeight,
  },
  accessStatusLine: {
    marginTop: AUTH_VISUAL_SPEC.spacing.accessStatusLineGap,
    fontSize: AUTH_VISUAL_SPEC.typography.accessLine.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.accessLine.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.accessLine.fontWeight,
  },
  accessStatusDetail: {
    marginTop: AUTH_VISUAL_SPEC.spacing.accessContextMarginTop,
    fontSize: AUTH_VISUAL_SPEC.typography.accessDetail.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.accessDetail.lineHeight,
  },
  accessGateMessage: {
    width: '100%',
    marginTop: AUTH_VISUAL_SPEC.spacing.accessMessageMarginTop,
    fontSize: AUTH_VISUAL_SPEC.typography.accessMessage.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.accessMessage.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.accessMessage.fontWeight,
    textAlign: 'left',
  },
  accessGateStatusRow: {
    width: '100%',
    marginTop: AUTH_VISUAL_SPEC.spacing.accessStatusMarginTop,
    flexDirection: 'row',
    alignItems: 'center',
    gap: AUTH_VISUAL_SPEC.spacing.accessStatusRowGap,
  },
  accessGateStatusText: {
    flex: 1,
    fontSize: AUTH_VISUAL_SPEC.typography.accessLine.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.accessLine.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.accessLine.fontWeight,
  },
  accessPrimaryButton: {
    width: '100%',
    minHeight: AUTH_VISUAL_SPEC.state.accessPrimaryMinHeight,
    marginTop: AUTH_VISUAL_SPEC.spacing.accessPrimaryMarginTop,
    borderRadius: AUTH_SURFACE.utilityHitRadius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AUTH_VISUAL_SPEC.spacing.accessPrimaryPaddingX,
  },
  accessPrimaryButtonDisabled: {
    opacity: 0.7,
  },
  accessPrimaryButtonText: {
    fontSize: AUTH_VISUAL_SPEC.typography.accessPrimaryButton.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.accessPrimaryButton.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.accessPrimaryButton.fontWeight,
    letterSpacing: AUTH_VISUAL_SPEC.typography.accessPrimaryButton.letterSpacing,
    textAlign: 'center',
  },
  accessGateUtilityRow: {
    width: '100%',
    marginTop: AUTH_VISUAL_SPEC.spacing.accessUtilityMarginTop,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: AUTH_VISUAL_SPEC.spacing.accessUtilityGap,
  },
  accessUtilityButton: {
    minHeight: AUTH_VISUAL_SPEC.state.accessUtilityMinHeight,
    minWidth: AUTH_VISUAL_SPEC.state.accessUtilityMinWidth,
    paddingHorizontal: AUTH_VISUAL_SPEC.spacing.accessUtilityPaddingX,
    borderRadius: AUTH_VISUAL_SPEC.state.accessUtilityRadius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accessUtilityButtonText: {
    fontSize: AUTH_VISUAL_SPEC.typography.accessUtilityButton.fontSize,
    fontWeight: AUTH_VISUAL_SPEC.typography.accessUtilityButton.fontWeight,
    lineHeight: AUTH_VISUAL_SPEC.typography.accessUtilityButton.lineHeight,
    textAlign: 'center',
  },
  accessGateFootnote: {
    marginTop: AUTH_VISUAL_SPEC.spacing.accessFootnoteMarginTop,
    maxWidth: AUTH_VISUAL_SPEC.state.accessFootnoteMaxWidth,
    fontSize: AUTH_VISUAL_SPEC.typography.accessFootnote.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.accessFootnote.lineHeight,
    textAlign: 'center',
  },
});
