/**
 * App Context Provider
 *
 * Central state management that reads ALL data from IndexedDB (via storage layer).
 * Provides sync actions, auth, and data refresh functions.
 *
 * Auth Integration (FIXED):
 * - Authentication is DECOUPLED from post-login data bootstrap
 * - signIn succeeds as soon as Supabase auth completes
 * - Bootstrap data loads happen in background, never block login
 * - Failed data fetches show non-blocking toast, never redirect to login
 * - bootstrapError state available for UI to show retry banner
 *
 * Session Persistence:
 * - "Keep me signed in for 30 days" option
 * - Session expiry enforcement on app launch
 * - Offline access with stored session (no re-login required)
 * - Session store cleared on explicit logout
 *
 * Connectivity Integration:
 * - Real-time online/offline status monitoring
 * - Offline mode flag (user explicitly chose offline access)
 * - Auto-sync when connectivity is restored
 * - Offline queue for map/waypoint operations
 * - Sync action queue for expedition/loadout/route offline operations
 *
 * Real-Time Sync Integration:
 * - Supabase Realtime subscriptions for live database changes
 * - Auto-start on login, auto-stop on logout
 * - Conflict detection for dirty local rows
 * - Refresh callback to update UI when remote changes arrive
 *
 * Sync Action Queue Integration:
 * - Processors registered at startup for all action categories
 * - Auto-processes queued actions when connectivity is restored
 * - Covers expedition CRUD, loadout changes, route updates, checklists, etc.
 * - Initialized once after DB and connectivity are ready
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";

import { AppState, Platform, type AppStateStatus } from "react-native";
import * as Linking from "expo-linking";
import {
  supabase,
  isSupabaseConfigured,
  clearPersistedSupabaseAuthState,
} from "../lib/supabase";
import { AUTH_COPY } from "../lib/auth/authCopy";
import type {
  Trip,
  SyncStatus,
  LoadItem,
  RiskScore,
  FuelWaterLog,
  LoadMapSlot,
  UserSettings,
  Waypoint,
} from "../lib/types";
import {
  tripStore,
  activeTripStore,
  loadItemStore,
  riskScoreStore,
  fuelWaterLogStore,
  loadMapSlotStore,
  waypointStore,
  userSettingsStore,
  getDirtyCount,
  migrateLocalStorageToIndexedDB,
} from "../lib/storage";
import {
  performSync,
  ensureUserSettings,
  scheduleAutoSync,
  cancelAutoSync,
  resetAutoSyncAttempts,
} from "../lib/sync";
import type { SyncResult } from "../lib/sync";
import { isDBReady } from "../lib/db";
import {
  sanitizeAuthError,
  postLogin,
  checkOperatorStatus,
  sendSetupLink,
  logAuditEvent,
  logPasswordUpdate,
  logLogout,
  logLoginFailed,
  OperatorInfo,
  rotateSharedAccountPassword as rotateSharedAccountPasswordRequest,
  type SharedAccountPasswordRotationResult,
} from "../lib/auth";
import {
  getCurrentAccessState,
  restoreApplePurchase,
  restoreGooglePurchase,
  verifyApplePurchase,
  verifyGooglePurchase,
} from "../lib/entitlements";
import {
  finishEcsProNativePurchase,
  loadEcsProStoreProduct,
  restoreEcsProPurchase,
  startEcsProMonthlyPurchase,
  type EcsProStoreProduct,
  type NativePurchaseProof,
} from "../lib/ecsProPurchase";
import { resolveEcsAccessState } from '../lib/auth/accessResolver';
import {
  consumeAuthTiming,
  getAppLaunchDurationMs,
  markAuthTimingStart,
  recordAuthDiagnostic,
} from '../lib/auth/authDiagnostics';
import {
  hashAuthIdentifier,
  maskAuthEmail,
  redactAuthUserId,
  sanitizeAuthLogPayload,
} from '../lib/auth/authLogRedaction';
import {
  canReuseOperatorInfoSnapshot,
  resolveCachedOperatorAccessSnapshot,
} from '../lib/auth/offlineAccessPolicy';
import type { ECSAccessResolution } from '../lib/auth/entitlementTypes';
import { connectivity, type ConnectivityStatus } from "../lib/connectivity";
import { offlineQueue } from "../lib/offlineQueue";
import { dispatchQueue } from "../lib/dispatchQueueStore";
import { sessionStore } from "../lib/sessionStore";
import { realtimeSync } from "../lib/realtimeSync";
import { syncActionQueue } from '../lib/syncActionQueue';
import { initializeSyncProcessors } from '../lib/syncProcessors';
import { loadoutSyncQueue } from '../lib/loadoutSyncQueue';
import { hydrateDashboardState, hydrateCustomPresets, flushDashboardWrites } from '../lib/dashboardStore';
import { connectivityIntelService } from '../lib/connectivityIntelService';
import { waitForExpeditionStateHydration } from '../lib/expeditionStateStore';
import { createPersistedKeyValueCache } from '../lib/keyValuePersistence';
import { setupStore } from '../lib/setupStore';
import { vehicleStore } from '../lib/vehicleStore';
import { vehicleSetupStore } from '../lib/vehicleSetupStore';
import { loadoutStore } from '../lib/loadoutStore';
import { vehicleSpecStore } from '../lib/vehicleSpecStore';
import { tiresLiftStore } from '../lib/tiresLiftStore';
import { consumablesStore } from '../lib/consumablesStore';
import { powerSetupStore } from '../lib/powerSetupStore';
import {
  getStartupDiagnosticsSnapshot,
  logStartupStall,
  markStartupPhase,
} from '../lib/startupDiagnostics';
import { ecsLog } from '../lib/ecsLogger';




// ── Offline mode persistence key ─────────────────────────────
const OFFLINE_MODE_KEY = 'ecs_offline_mode';
const SHELL_ROUTE_KEY = 'last_shell_route_v1';
const offlineModeCache = createPersistedKeyValueCache('ecs_runtime_flags');
const shellRouteCache = createPersistedKeyValueCache('ecs_shell_state');
const STARTUP_REQUIRED_READINESS_TIMEOUT_MS = 8000;
const STARTUP_OPTIONAL_READINESS_TIMEOUT_MS = 6000;
const STARTUP_AUTH_RESTORE_TIMEOUT_MS = 10000;
const SIGN_IN_REQUEST_TIMEOUT_MS = 10000;

interface StartupHydrationResult {
  persistedOfflineMode: boolean;
  storageReady: boolean;
  indexedDbReady: boolean;
  storageBackend: 'indexeddb' | 'local_fallback';
  timedOutRequirements: string[];
}

let startupHydrationPromise: Promise<StartupHydrationResult> | null = null;
let startupHydrationResult: StartupHydrationResult | null = null;
let startupStoresLogEmitted = false;
let startupDashboardLogEmitted = false;
let startupRequiredReadinessLogEmitted = false;
let connectivityIntelInitializedForAppSession = false;

function logStartupDebug(message: string, details?: Record<string, unknown>): void {
  ecsLog.dev('SYSTEM', message, details, {
    tag: '[ECS]',
    debugFlag: 'ECS_DEBUG_STARTUP',
    fingerprint: `${message}:${JSON.stringify(details ?? {})}`,
    throttleMs: 2500,
    aggregateWindowMs: 30_000,
  });
}

function getPersistedOfflineMode(): boolean {
  return offlineModeCache.get(OFFLINE_MODE_KEY) === 'true';
}

function setPersistedOfflineMode(value: boolean): void {
  if (value) {
    offlineModeCache.set(OFFLINE_MODE_KEY, 'true');
  } else {
    offlineModeCache.delete(OFFLINE_MODE_KEY);
  }
}

function getStartupStorageBackend(indexedDbReady: boolean): StartupHydrationResult['storageBackend'] {
  return indexedDbReady ? 'indexeddb' : 'local_fallback';
}

async function ensureSlotsSeeded(tripId: string, userId: string | null) {
  await loadMapSlotStore.seedForTrip(tripId, userId || undefined);
}

function withStartupTimeout<T>(
  label: string,
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<{ value: T; timedOut: boolean }> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<{ value: T; timedOut: boolean }>((resolve) => {
    timeout = setTimeout(() => {
      console.warn(`[ECS] Startup requirement timed out; continuing with fallback`, {
        requirement: label,
        timeoutMs,
      });
      resolve({ value: fallback, timedOut: true });
    }, timeoutMs);
  });

  return Promise.race([
    promise
      .then((value) => ({ value, timedOut: false }))
      .catch((error) => {
        console.warn(`[ECS] Startup requirement failed; continuing with fallback`, {
          requirement: label,
          error: error instanceof Error ? error.message : String(error),
        });
        return { value: fallback, timedOut: false };
      }),
    timeoutPromise,
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function withAuthRequestTimeout<T>(
  label: string,
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

interface SessionInfo {
  keepSignedIn: boolean;
  expiryLabel: string | null;
  sessionCreatedAt: string | null;
}

type AuthLoginSource = 'cta_press' | 'password_submit' | 'accessibility_activate' | 'unknown';
type SignInResult = { error?: string; suspended?: boolean };

type BillingFlowState =
  | 'idle'
  | 'loading_product'
  | 'purchasing'
  | 'confirming_access'
  | 'restore_in_progress'
  | 'restore_success'
  | 'restore_failed';

type AuthPhase =
  | 'restoring'
  | 'signed_out'
  | 'signing_in'
  | 'signed_in_bootstrapping'
  | 'ready';

function buildDefaultOperatorInfo(email: string | null): OperatorInfo {
  return {
    role: 'user',
    status: 'active',
    display_name: null,
    email,
    exists: false,
    access_level: 'standard',
    account_kind: 'standard',
    entitlement_status: 'free',
    is_shared_internal: false,
    is_shared_account: false,
    internal_account_type: null,
    is_admin: false,
    has_full_app_access: false,
    allow_password_rotation: false,
    account_note: null,
    internal_tag: null,
    can_rotate_shared_password: false,
    can_revoke_shared_sessions: false,
    revoke_sessions_supported: false,
    last_login_at: null,
    last_seen_at: null,
    last_seen_platform: null,
    last_seen_device: null,
    subscription_provider: null,
    subscription_product_id: null,
    subscription_environment: null,
    current_period_end_at: null,
    current_period_start_at: null,
    grace_expires_at: null,
    revoked_at: null,
    last_verified_at: null,
  };
}

function mapOperatorInfoFromBackend(data: Partial<OperatorInfo>, fallbackEmail: string | null): OperatorInfo {
  const base = buildDefaultOperatorInfo(fallbackEmail);
  return {
    ...base,
    role: data.role ?? base.role,
    status: data.status ?? base.status,
    display_name: data.display_name ?? base.display_name,
    email: data.email ?? fallbackEmail ?? base.email,
    exists: data.exists ?? true,
    access_level: data.access_level ?? base.access_level,
    account_kind: data.account_kind ?? base.account_kind,
    entitlement_status: data.entitlement_status ?? base.entitlement_status,
    is_shared_internal: data.is_shared_internal ?? base.is_shared_internal,
    is_shared_account: data.is_shared_account ?? base.is_shared_account,
    internal_account_type: data.internal_account_type ?? base.internal_account_type,
    is_admin: data.is_admin ?? base.is_admin,
    has_full_app_access: data.has_full_app_access ?? base.has_full_app_access,
    allow_password_rotation: data.allow_password_rotation ?? base.allow_password_rotation,
    account_note: data.account_note ?? base.account_note,
    internal_tag: data.internal_tag ?? base.internal_tag,
    can_rotate_shared_password: data.can_rotate_shared_password ?? base.can_rotate_shared_password,
    can_revoke_shared_sessions: data.can_revoke_shared_sessions ?? base.can_revoke_shared_sessions,
    revoke_sessions_supported: data.revoke_sessions_supported ?? base.revoke_sessions_supported,
    last_login_at: data.last_login_at ?? base.last_login_at,
    last_seen_at: data.last_seen_at ?? base.last_seen_at,
    last_seen_platform: data.last_seen_platform ?? base.last_seen_platform,
    last_seen_device: data.last_seen_device ?? base.last_seen_device,
    subscription_provider: data.subscription_provider ?? base.subscription_provider,
    subscription_product_id: data.subscription_product_id ?? base.subscription_product_id,
    subscription_environment: data.subscription_environment ?? base.subscription_environment,
    current_period_end_at: data.current_period_end_at ?? base.current_period_end_at,
    current_period_start_at: data.current_period_start_at ?? base.current_period_start_at,
    grace_expires_at: data.grace_expires_at ?? base.grace_expires_at,
    revoked_at: data.revoked_at ?? base.revoked_at,
    last_verified_at: data.last_verified_at ?? base.last_verified_at,
  };
}

function isMissingRefreshTokenError(error: unknown): boolean {
  const message = String((error as { message?: string } | null | undefined)?.message ?? error ?? '')
    .trim()
    .toLowerCase();

  return message.includes('invalid refresh token') || message.includes('refresh token not found');
}

interface AppContextValue {
  // Auth
  user: any | null;
  authLoading: boolean;
  authPhase: AuthPhase;
  startupSessionRestored: boolean;
  operatorInfo: OperatorInfo | null;
  accessState: ECSAccessResolution | null;
  sessionInfo: SessionInfo;
  billingFlowState: BillingFlowState;
  billingError: string | null;
  ecsProProduct: EcsProStoreProduct | null;
  authNotice: string | null;

  // Bootstrap
  bootstrapError: string | null;
  retryBootstrap: () => void;

  // Connectivity
  isOnline: boolean;
  connectivityStatus: ConnectivityStatus;
  offlineMode: boolean;
  queueSize: number;

  // Sync
  syncStatus: SyncStatus;
  dirtyCount: number;
  lastSyncAt: string | null;
  lastSyncResult: SyncResult | null;

  // Data
  activeTrip: Trip | null;
  trips: Trip[];
  loadItems: LoadItem[];
  riskScore: RiskScore | null;
  fuelWaterLogs: FuelWaterLog[];
  loadMapSlots: LoadMapSlot[];
  waypoints: Waypoint[];
  userSettings: UserSettings | null;

  // UI
  loading: boolean;
  dbReady: boolean;

  // Actions
  refreshTrips: () => Promise<void>;
  refreshActiveTrip: () => Promise<void>;
  setActiveTripId: (id: string) => Promise<void>;
  triggerSync: () => Promise<void>;
  signIn: (email: string, password: string, keepSignedIn?: boolean, source?: AuthLoginSource) => Promise<SignInResult>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ error?: string }>;
  sendCredentialSetupLink: (email: string) => Promise<{ error?: string }>;
  updatePassword: (password: string) => Promise<{ error?: string }>;
  rotateSharedAccountPassword: (password: string, revokeSessions: boolean) => Promise<SharedAccountPasswordRotationResult>;
  refreshAccessState: () => Promise<OperatorInfo | null>;
  loadEcsProProduct: () => Promise<EcsProStoreProduct | null>;
  purchaseEcsProMonthly: () => Promise<{ success: boolean; cancelled?: boolean; pending?: boolean; error?: string }>;
  restoreEcsProAccess: () => Promise<{ success: boolean; error?: string }>;
  enterOfflineMode: () => void;
  exitOfflineMode: () => void;
  showToast: (msg: string) => void;
  consumeAuthNotice: () => string | null;
}

const AppContext = createContext<AppContextValue>({} as AppContextValue);
const ToastContext = createContext<string | null>(null);
export const useApp = () => useContext(AppContext);
export const useToastState = () => useContext(ToastContext);

function isRoutineRefreshToast(msg: string): boolean {
  const normalized = msg
    .trim()
    .toLowerCase()
    .replace(/[\s.]+$/g, '')
    .replace(/\u2026$/g, '');

  return normalized === 'refreshing';
}

async function ensureStartupHydration(): Promise<StartupHydrationResult> {
  if (startupHydrationResult) {
    return startupHydrationResult;
  }

  if (!startupHydrationPromise) {
    startupHydrationPromise = (async () => {
      markStartupPhase('stores_hydration_start');
      const requiredHydrations: Array<[string, Promise<unknown>]> = [
        ['setupStore', setupStore.waitForHydration()],
        ['vehicleSetupStore', vehicleSetupStore.waitForHydration()],
        ['sessionStore', sessionStore.waitForHydration()],
        ['offlineModeCache', offlineModeCache.waitForHydration()],
        ['vehicleStore', vehicleStore.waitForHydration()],
        ['loadoutStore', loadoutStore.waitForHydration()],
        ['vehicleSpecStore', vehicleSpecStore.waitForHydration()],
        ['tiresLiftStore', tiresLiftStore.waitForHydration()],
        ['consumablesStore', consumablesStore.waitForHydration()],
        ['powerSetupStore', powerSetupStore.waitForHydration()],
      ];
      const timedOutRequirements: string[] = [];

      await Promise.all(
        requiredHydrations.map(async ([label, promise]) => {
          const result = await withStartupTimeout(
            label,
            promise,
            STARTUP_REQUIRED_READINESS_TIMEOUT_MS,
            null,
          );
          if (result.timedOut) timedOutRequirements.push(label);
        }),
      );

      if (!startupStoresLogEmitted) {
        startupStoresLogEmitted = true;
        logStartupDebug('startup stores hydrated', {
          persistedOfflineMode: getPersistedOfflineMode(),
          setupComplete: setupStore.isComplete(),
          sessionValidity: sessionStore.checkSessionValidity(),
          timedOutRequirements,
        });
      }
      markStartupPhase('stores_hydration_done', {
        timedOutRequirements,
      });
      markStartupPhase('setup_status_known', {
        setupComplete: setupStore.isComplete(),
        sessionValidity: sessionStore.checkSessionValidity(),
      });

      const indexedDbReadyResult = await withStartupTimeout(
        'indexedDB availability',
        isDBReady(),
        STARTUP_REQUIRED_READINESS_TIMEOUT_MS,
        false,
      );
      const indexedDbReady = indexedDbReadyResult.value;

      if (indexedDbReady) {
        void migrateLocalStorageToIndexedDB()
          .then((didMigrate) => {
            if (didMigrate) logStartupDebug('Migrated localStorage data to IndexedDB');
          })
          .catch((e) => {
            console.warn('[ECS] Startup storage migration failed (non-fatal):', e);
          });
      }

      void withStartupTimeout(
        'optional dashboard/expedition hydration',
        Promise.all([
          hydrateDashboardState(),
          hydrateCustomPresets(),
          waitForExpeditionStateHydration(),
        ]),
        STARTUP_OPTIONAL_READINESS_TIMEOUT_MS,
        null,
      ).then((result) => {
        if (result.timedOut) return;
        if (!startupDashboardLogEmitted) {
          startupDashboardLogEmitted = true;
          logStartupDebug('Dashboard state hydrated from persistent storage');
        }
      });
      markStartupPhase('optional_services_started', {
        services: ['dashboard_hydration', 'expedition_state_hydration', 'storage_migration'],
      });

      startupHydrationResult = {
        persistedOfflineMode: getPersistedOfflineMode(),
        storageReady: true,
        indexedDbReady,
        storageBackend: getStartupStorageBackend(indexedDbReady),
        timedOutRequirements,
      };

      if (!startupRequiredReadinessLogEmitted) {
        startupRequiredReadinessLogEmitted = true;
        logStartupDebug('startup shell readiness resolved', {
          persistedOfflineMode: startupHydrationResult.persistedOfflineMode,
          storageReady: startupHydrationResult.storageReady,
          indexedDbReady: startupHydrationResult.indexedDbReady,
          storageBackend: startupHydrationResult.storageBackend,
          localPersistenceFallbackActive: !startupHydrationResult.indexedDbReady,
          setupComplete: setupStore.isComplete(),
          sessionValidity: sessionStore.checkSessionValidity(),
          timedOutRequirements,
        });
      }

      return startupHydrationResult;
    })().finally(() => {
      startupHydrationPromise = null;
    });
  }

  return startupHydrationPromise;
}


export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signInPending, setSignInPending] = useState(false);
  const signInAttemptRef = useRef<Promise<SignInResult> | null>(null);
  const [startupSessionRestored, setStartupSessionRestored] = useState(false);
  const [operatorInfo, setOperatorInfo] = useState<OperatorInfo | null>(null);
  const [billingFlowState, setBillingFlowState] = useState<BillingFlowState>('idle');
  const [billingError, setBillingError] = useState<string | null>(null);
  const [ecsProProduct, setEcsProProduct] = useState<EcsProStoreProduct | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // Bootstrap error state — non-blocking
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // Connectivity state
  const [isOnline, setIsOnline] = useState(false);
  const [connectivityStatus, setConnectivityStatus] = useState<ConnectivityStatus>('offline');
  const [offlineMode, setOfflineMode] = useState(getPersistedOfflineMode());
  const [queueSize, setQueueSize] = useState(offlineQueue.size);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>("offline");
  const [dirtyCount, setDirtyCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadItems, setLoadItems] = useState<LoadItem[]>([]);
  const [riskScore, setRiskScore] = useState<RiskScore | null>(null);
  const [fuelWaterLogs, setFuelWaterLogs] = useState<FuelWaterLog[]>([]);
  const [loadMapSlots, setLoadMapSlots] = useState<LoadMapSlot[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);

  const [loading, setLoading] = useState(true);
  const [dbReady, setDbReady] = useState(false);
  const [startupStateHydrated, setStartupStateHydrated] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef = useRef<any | null>(null);
  const operatorInfoRef = useRef<OperatorInfo | null>(null);
  const accessRefreshAtRef = useRef(0);
  const syncProcessorsInitRef = useRef(false);
  const signOutIntentRef = useRef(false);
  const sessionRestoreInFlightRef = useRef(false);
  const startupAuthInitializationStartedRef = useRef(false);
  const authLoadingRef = useRef(authLoading);
  const authRestoreDoneLoggedRef = useRef(false);

  // Keep userRef in sync
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    authLoadingRef.current = authLoading;
  }, [authLoading]);

  useEffect(() => {
    if (!startupStateHydrated || !authLoading) return undefined;

    const timeout = setTimeout(() => {
      if (!authLoadingRef.current) return;

      const sessionValidity = sessionStore.checkSessionValidity();
      const hasValidStoredSession = sessionValidity === 'valid';
      const unresolvedRequiredFlags = [
        !startupStateHydrated ? 'storesHydrated' : null,
        authLoadingRef.current ? 'authReady' : null,
      ].filter((flag): flag is string => !!flag);

      logStartupStall({
        currentPhase: getStartupDiagnosticsSnapshot().currentPhase,
        unresolvedRequiredFlags,
        optionalServicesPending: [
          'weather',
          'realtime',
          'dispatch',
          'team_sync',
          'cache_readiness',
        ],
        fallback: hasValidStoredSession ? 'remembered_offline_shell' : 'signed_out_shell',
        details: {
          sessionValidity,
          setupComplete: setupStore.isComplete(),
          connectivityOnline: connectivity.isOnline(),
        },
      });
      markStartupPhase('startup_recovery_fallback', {
        reason: 'auth_restore_timeout',
        fallback: hasValidStoredSession ? 'remembered_offline_shell' : 'signed_out_shell',
      });

      sessionRestoreInFlightRef.current = false;
      setSignInPending(false);
      setStartupSessionRestored(false);

      if (hasValidStoredSession) {
        setOfflineMode(true);
        setPersistedOfflineMode(true);
      } else {
        setUser(null);
      }

      setAuthLoading(false);
    }, STARTUP_AUTH_RESTORE_TIMEOUT_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [authLoading, startupStateHydrated]);

  useEffect(() => {
    if (authLoading) return;
    if (authRestoreDoneLoggedRef.current) return;
    authRestoreDoneLoggedRef.current = true;
    markStartupPhase('auth_restore_done', {
      authenticated: !!user,
      offlineMode,
      sessionValidity: sessionStore.checkSessionValidity(),
    });
  }, [authLoading, offlineMode, user]);

  useEffect(() => {
    operatorInfoRef.current = operatorInfo;
  }, [operatorInfo]);

  const consumeAuthNotice = useCallback(() => {
    const next = authNotice;
    setAuthNotice(null);
    return next;
  }, [authNotice]);

  const accessState = useMemo(
    () =>
      user || operatorInfo
        ? resolveEcsAccessState({
            operatorInfo,
            authenticated: !!user,
            isOnline,
          })
        : null,
    [isOnline, operatorInfo, user],
  );

  const authPhase = useMemo<AuthPhase>(() => {
    if (authLoading || !startupStateHydrated) {
      return 'restoring';
    }

    if (signInPending) {
      return 'signing_in';
    }

    if (user && loading) {
      return 'signed_in_bootstrapping';
    }

    if (user || offlineMode) {
      return 'ready';
    }

    return 'signed_out';
  }, [accessState?.accessState, authLoading, loading, offlineMode, signInPending, startupStateHydrated, user]);

  const showToast = useCallback((msg: string) => {
    if (isRoutineRefreshToast(msg)) return;
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  const clearAuthenticatedRuntimeState = useCallback((options?: {
    clearSession?: boolean;
    clearOfflineMode?: boolean;
  }) => {
    accessRefreshAtRef.current = 0;
    sessionRestoreInFlightRef.current = false;
    setSignInPending(false);

    if (options?.clearSession !== false) {
      sessionStore.clearSession();
    }

    shellRouteCache.delete(SHELL_ROUTE_KEY);
    void shellRouteCache.flush();

    cancelAutoSync();
    realtimeSync.destroy();
    syncActionQueue.stopAutoProcess();
    loadoutSyncQueue.stopAutoProcess();
    void import('../lib/convoy/convoyLocationPublisher')
      .then(({ stopConvoyLocationSharing }) =>
        stopConvoyLocationSharing('Auth session ended. Live sharing stopped.'),
      )
      .catch(() => {});

    setUser(null);
    setOperatorInfo(null);
    setSyncStatus("offline");
    setLastSyncAt(null);
    setLastSyncResult(null);
    setBootstrapError(null);
    setBillingFlowState('idle');
    setBillingError(null);
    setEcsProProduct(null);
    setActiveTrip(null);
    setTrips([]);
    setLoadItems([]);
    setRiskScore(null);
    setFuelWaterLogs([]);
    setLoadMapSlots([]);
    setWaypoints([]);
    setUserSettings(null);
    setDirtyCount(0);

    if (options?.clearOfflineMode !== false) {
      setOfflineMode(false);
      setPersistedOfflineMode(false);
    }
  }, []);

  // ── Offline mode actions ────────────────────────────────────
  const enterOfflineMode = useCallback(() => {
    if (offlineMode) return;
    setOfflineMode(true);
    setPersistedOfflineMode(true);
  }, [offlineMode]);

  const exitOfflineMode = useCallback(() => {
    if (!offlineMode) return;
    setOfflineMode(false);
    setPersistedOfflineMode(false);
  }, [offlineMode]);

  // ── Initialize IndexedDB + migrate from localStorage + hydrate dashboard ────
  useEffect(() => {
    let cancelled = false;

    void ensureStartupHydration().then((result) => {
      if (cancelled) return;

      setOfflineMode(prev => (prev === result.persistedOfflineMode ? prev : result.persistedOfflineMode));
      setDbReady(prev => (prev === result.storageReady ? prev : result.storageReady));
      setStartupStateHydrated(true);

      if (!isSupabaseConfigured) {
        setSyncStatus(prev => (prev === "offline" ? prev : "offline"));
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);


  // ── Connectivity monitoring ─────────────────────────────────
  useEffect(() => {
    connectivity.startMonitoring();

    const unsub = connectivity.onStatusChange((status, wasOffline) => {
      setConnectivityStatus(prev => (prev === status ? prev : status));
      setIsOnline(prev => (prev === (status === 'online') ? prev : status === 'online'));

      if (status === 'online' && wasOffline) {
        if (!getPersistedOfflineMode()) {
          setOfflineMode(prev => (prev === false ? prev : false));
        }

        const currentUser = userRef.current;

        if (currentUser && isSupabaseConfigured) {
          showToast("Back online — syncing data...");

          resetAutoSyncAttempts();
          scheduleAutoSync(setSyncStatus, currentUser.id, async (result) => {
            setLastSyncResult(result);
            if (result.errors.length === 0) setLastSyncAt(new Date().toISOString());
            await refreshTrips();
            await refreshActiveTrip();
            await refreshDirtyCount();

            if (result.errors.length === 0) {
              showToast(`Synced ${result.pushed + result.pulled} items`);
            }
          });

          offlineQueue.processQueue().then(({ processed }) => {
            if (processed > 0) {
              showToast(`Processed ${processed} queued operations`);
            }
          });

          // Process sync action queue (expedition/loadout/route/checklist offline actions)
          // The auto-process listener also triggers this, but we explicitly call here
          // for immediate feedback alongside the other queue processors.
          if (syncActionQueue.pendingCount > 0) {
            syncActionQueue.processQueue().then(({ processed, failed }) => {
              if (processed > 0) {
                showToast(`Synced ${processed} offline action${processed !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}`);
              }
            }).catch(() => {});
          }

          // Flush dispatch event queue after reconnect
          // (dispatchQueue has its own auto-flush via startAutoFlush,
          //  but we also trigger here for immediate feedback)
          if (dispatchQueue.size > 0) {
            dispatchQueue.flush().then((result) => {
              if (result.sent > 0) {
                showToast(`Sent ${result.sent} queued dispatch event${result.sent !== 1 ? 's' : ''}`);
              }
            }).catch(() => {});
          }

        } else if (!currentUser) {
          showToast("Online — sign in to sync");
        }
      } else if (status === 'offline') {
        setSyncStatus(prev => (prev === "offline" ? prev : "offline"));
        showToast("Offline — working locally");
      }
    });

    offlineQueue.startAutoProcess();

    // Start dispatch queue auto-flush monitoring
    dispatchQueue.startAutoFlush();

    const queueUnsub = offlineQueue.onChange((queue) => {
      setQueueSize(queue.length);
    });

    const initialOnline = connectivity.isOnline();
    const initialStatus = connectivity.status;
    setIsOnline(prev => (prev === initialOnline ? prev : initialOnline));
    setConnectivityStatus(prev => (prev === initialStatus ? prev : initialStatus));

    return () => {
      unsub();
      queueUnsub();
      connectivity.stopMonitoring();
      offlineQueue.stopAutoProcess();
      dispatchQueue.stopAutoFlush();
    };
  // This monitor is intended to initialize once for the provider lifetime.
  // It reads stable refs for mutable auth state and should not be re-bound.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Initialize Connectivity Intelligence Service ────────────
  // Phase 3A: Starts the unified connectivity-state layer for ECS.
  // Runs after connectivity monitoring is active. Restores previous
  // session state and begins device_network provider polling.
  // Does not interfere with Android Auto or CarPlay rendering.
  const ciInitRef = useRef(false);
  useEffect(() => {
    if (ciInitRef.current) return;
    ciInitRef.current = true;

    try {
      if (!connectivityIntelInitializedForAppSession) {
        connectivityIntelService.initialize();
        connectivityIntelInitializedForAppSession = true;
        logStartupDebug('Connectivity Intelligence service initialized');
      } else {
        connectivityIntelService.startMonitoring();
      }
    } catch (err) {
      console.warn('[ECS] Connectivity Intelligence initialization failed (non-fatal):', err);
    }

    return undefined;
  }, []);


  // ── Initialize Sync Action Processors ───────────────────────
  // Registers all category processors (expedition, loadout, route, checklist,
  // field_log, waypoint, dashboard) and starts the auto-process connectivity
  // listener. Called ONCE after the required storage layer has hydrated and the
  // connectivity monitor is initialized. On native, IndexedDB is unavailable by
  // design, so the queue/store layers continue through their local fallback.
  //
  // Timing: This runs after:
  //   1. Required storage is ready (dbReady = true)
  //   2. Connectivity monitoring has started (useEffect above)
  //   3. Queue data has been loaded from localStorage (SyncActionQueue constructor)
  //
  // The ref guard ensures this only fires once even if dbReady toggles or
  // React strict-mode double-invokes the effect.
  useEffect(() => {
    if (!dbReady) return;
    if (syncProcessorsInitRef.current) return;

    syncProcessorsInitRef.current = true;

    try {
      initializeSyncProcessors();
      console.log('[ECS] Sync action processors initialized');

      // ── Startup purge: clean up any poisoned actions in the queue ──
      const sentinelPurged = syncActionQueue.purgeLocalSentinelActions();
      const failedPurged = syncActionQueue.purgeFailedUserIdErrors();
      if (sentinelPurged > 0 || failedPurged > 0) {
        console.log(
          `[ECS] Sync queue cleanup: purged ${sentinelPurged} sentinel + ${failedPurged} failed UUID actions`
        );
      }

      // If there are already queued actions and we're online, trigger processing
      if (syncActionQueue.pendingCount > 0 && connectivity.isOnline()) {
        console.log(`[ECS] Found ${syncActionQueue.pendingCount} pending sync actions — processing...`);
        syncActionQueue.processQueue().then(({ processed, failed, remaining }) => {
          if (processed > 0) {
            console.log(`[ECS] Processed ${processed} queued sync actions (${failed} failed, ${remaining} remaining)`);
          }
        }).catch((err) => {
          console.warn('[ECS] Initial sync action queue processing failed:', err);
        });
      }

      // ── Start loadout reconciliation sync queue auto-processing ──
      // This queue handles retrying failed cloud syncs for loadout weight/count
      // updates. It runs independently of the main sync action queue.
      loadoutSyncQueue.startAutoProcess();
      console.log('[ECS] Loadout reconciliation sync queue auto-process started');

      // If there are pending loadout sync entries, process them now
      if (loadoutSyncQueue.pendingCount > 0 && connectivity.isOnline()) {
        console.log(`[ECS] Found ${loadoutSyncQueue.pendingCount} pending loadout sync entries — processing...`);
        loadoutSyncQueue.processQueue().catch((err) => {
          console.warn('[ECS] Initial loadout sync queue processing failed:', err);
        });
      }

    } catch (err) {
      console.error('[ECS] Failed to initialize sync action processors:', err);
    }

    return () => {
      syncActionQueue.stopAutoProcess();
      loadoutSyncQueue.stopAutoProcess();
    };
  }, [dbReady]);




  // ── Refresh helpers ─────────────────────────────────────────
  const refreshDirtyCount = useCallback(async () => {
    try {
      const count = await getDirtyCount();
      setDirtyCount(count);
    } catch (e) {
      console.warn('[ECS] refreshDirtyCount failed:', e);
    }
  }, []);

  const refreshTrips = useCallback(async () => {
    try {
      const t = await tripStore.getAll();
      setTrips(t || []);
    } catch (e) {
      console.warn('[ECS] refreshTrips failed:', e);
      // Don't clear trips on error — keep stale data
    }
    await refreshDirtyCount();
  }, [refreshDirtyCount]);

  const refreshActiveTrip = useCallback(async () => {
    try {
      const id = await activeTripStore.get();

      if (id) {
        const trip = await tripStore.getById(id);
        setActiveTrip(trip);

        if (trip) {
          try {
            await ensureSlotsSeeded(trip.id, user?.id ?? null);
          } catch (e) {
            console.warn("[ECS] Slot seeding failed:", e);
          }

          try {
            const [items, rs, logs, slots, wps] = await Promise.all([
              loadItemStore.getByTripId(trip.id).catch(() => []),
              riskScoreStore.getByTripId(trip.id).catch(() => null),
              fuelWaterLogStore.getByTripId(trip.id).catch(() => []),
              loadMapSlotStore.getByTripId(trip.id).catch(() => []),
              waypointStore.getByTripId(trip.id).catch(() => []),
            ]);

            setLoadItems(items || []);
            setRiskScore(rs || null);
            setFuelWaterLogs(logs || []);
            setLoadMapSlots(slots || []);
            setWaypoints(wps || []);
          } catch (e) {
            console.warn("[ECS] Failed to load trip data:", e);
            // Set empty defaults so UI doesn't crash
            setLoadItems([]);
            setRiskScore(null);
            setFuelWaterLogs([]);
            setLoadMapSlots([]);
            setWaypoints([]);
          }
        } else {
          setActiveTrip(null);
          setLoadItems([]);
          setRiskScore(null);
          setFuelWaterLogs([]);
          setLoadMapSlots([]);
          setWaypoints([]);
        }
      } else {
        setActiveTrip(null);
        setLoadItems([]);
        setRiskScore(null);
        setFuelWaterLogs([]);
        setLoadMapSlots([]);
        setWaypoints([]);
      }
    } catch (e) {
      console.error("[ECS] refreshActiveTrip failed:", e);
      // Ensure state is never left undefined
      setActiveTrip(null);
      setLoadItems([]);
      setRiskScore(null);
      setFuelWaterLogs([]);
      setLoadMapSlots([]);
      setWaypoints([]);
    }

    try {
      const settings = await userSettingsStore.get();
      setUserSettings(settings);
    } catch (e) {
      console.warn("[ECS] Failed to load user settings:", e);
    }

    await refreshDirtyCount();
  }, [refreshDirtyCount, user?.id]);


  // ── Auth initialization ─────────────────────────────────────
  // CRITICAL: Only check session. Never redirect based on data fetch failures.
  // NEW: Enforce 30-day session expiry and handle offline with stored session.
  useEffect(() => {
    if (!startupStateHydrated) return;

    if (!isSupabaseConfigured) {
      recordAuthDiagnostic('auth_session_restore_failed', {
        entry_mode: 'cold_launch',
        result: 'failure',
        failure_category: 'provider_unavailable',
        duration_ms: getAppLaunchDurationMs(),
        network_state: connectivity.isOnline() ? 'online' : 'offline',
        metadata: { phase: 'startup_auth_init', reason: 'supabase_not_configured' },
      });
      setUser(null);
      setSignInPending(false);
      setAuthLoading(false);
      return;
    }

    const shouldRunStartupSessionRestore = !startupAuthInitializationStartedRef.current;
    if (shouldRunStartupSessionRestore) {
      startupAuthInitializationStartedRef.current = true;
      sessionRestoreInFlightRef.current = true;
      markAuthTimingStart('auth_session_restore');
      markStartupPhase('auth_restore_start', {
        isOnline: connectivity.isOnline(),
        sessionValidity: sessionStore.checkSessionValidity(),
      });
      recordAuthDiagnostic('auth_session_restore_started', {
        entry_mode: 'cold_launch',
        result: 'started',
        network_state: connectivity.isOnline() ? 'online' : 'offline',
        metadata: {
          hasOfflineSession: sessionStore.checkSessionValidity() === 'valid',
          keepSignedIn: sessionStore.getPreferences().keepSignedIn,
        },
      });
    } else if (__DEV__) {
      console.log('[Auth] Skipping duplicate startup session restore on provider remount');
    }

    if (shouldRunStartupSessionRestore) {
      // Step 0: Check session store validity BEFORE Supabase session check
      const sessionValidity = sessionStore.checkSessionValidity();
      const hasPersistentSession = sessionValidity === 'valid';
      const hasTransientRuntimeSession =
        sessionValidity === 'no_preference' && sessionStore.hasTransientRuntimeSession();
      const shouldSkipProviderSessionRestore = !hasPersistentSession && !hasTransientRuntimeSession;
      console.log('[Auth] Session store validity:', sessionValidity);
      if (__DEV__) {
        console.log('[Auth] startup auth init snapshot', {
          isOnline: connectivity.isOnline(),
          persistedOfflineMode: getPersistedOfflineMode(),
          setupComplete: setupStore.isComplete(),
          lastUserId: redactAuthUserId(sessionStore.getPreferences().lastUserId),
        });
      }

      if (sessionValidity === 'expired') {
        // 30-day expiry has passed — force re-login
        console.log('[Auth] 30-day session expired — clearing session');
        sessionRestoreInFlightRef.current = false;
        recordAuthDiagnostic('auth_session_restore_failed', {
          entry_mode: 'remembered_session',
          result: 'failure',
          failure_category: 'session_expired',
          duration_ms: consumeAuthTiming('auth_session_restore') ?? getAppLaunchDurationMs(),
          network_state: connectivity.isOnline() ? 'online' : 'offline',
          metadata: { phase: 'startup_auth_init', sessionValidity },
        });
        recordAuthDiagnostic('auth_reauthentication_required', {
          entry_mode: 'remembered_session',
          result: 'failure',
          failure_category: 'session_expired',
          network_state: connectivity.isOnline() ? 'online' : 'offline',
        });
        setAuthNotice(
          connectivity.isOnline() ? AUTH_COPY.session.expired : AUTH_COPY.session.reconnect
        );
        setStartupSessionRestored(false);
        clearAuthenticatedRuntimeState();
        supabase.auth.signOut().catch(() => {});
        setAuthLoading(false);
        return;
      }

      if (shouldSkipProviderSessionRestore) {
        console.log('[Auth] Clearing non-persistent provider state before startup restore', {
          sessionValidity,
        });
        sessionRestoreInFlightRef.current = false;
        recordAuthDiagnostic('auth_session_restore_succeeded', {
          entry_mode: 'cold_launch',
          result: 'success',
          duration_ms: consumeAuthTiming('auth_session_restore') ?? getAppLaunchDurationMs(),
          network_state: connectivity.isOnline() ? 'online' : 'offline',
          access_state: 'signed_out',
          metadata: {
            restoredUser: false,
            clearedNonPersistentProviderSession: true,
            sessionValidity,
            preflightCleanup: true,
          },
        });
        setStartupSessionRestored(false);
        clearAuthenticatedRuntimeState();
        void clearPersistedSupabaseAuthState();
        setAuthLoading(false);
      } else {
      // Step 1: Check existing Supabase session
      supabase.auth.getSession().then(({ data: { session } }) => {
        const currentUser = session?.user || null;

      if (currentUser) {


        // Valid Supabase session found — extend expiry if "keep signed in".
        // We also honor a fresh non-persistent runtime session that was just
        // created by a live sign-in so route remounts do not bounce back to login.
        sessionRestoreInFlightRef.current = false;
        markAuthTimingStart('auth_success_to_first_frame');
        recordAuthDiagnostic('auth_session_restore_succeeded', {
          entry_mode: hasPersistentSession ? 'remembered_session' : 'cold_launch',
          result: 'success',
          duration_ms: consumeAuthTiming('auth_session_restore') ?? getAppLaunchDurationMs(),
          network_state: connectivity.isOnline() ? 'online' : 'offline',
          access_state: 'authenticated',
          metadata: {
            restoredUser: true,
            sessionValidity,
            transientRuntimeSession: hasTransientRuntimeSession,
          },
        });
        sessionStore.extendExpiry();
        setSignInPending(false);
        setStartupSessionRestored(true);
        setUser(currentUser);
        setAuthLoading(false);

        // Step 2: Check operator status in background (non-blocking)
        getCurrentAccessState().then((info) => {
          if ('error' in info) {
            return checkOperatorStatus(currentUser.id);
          }
          return info;
        }).then((info) => {
          const mapped = mapOperatorInfoFromBackend(info as Partial<OperatorInfo>, currentUser.email || null);
          if (mapped.status === 'suspended') {
            supabase.auth.signOut();
            clearAuthenticatedRuntimeState();
          } else {
            setOperatorInfo(mapped);
          }
        }).catch((err) => {
          // NEVER treat this as auth failure
          console.warn('[Auth] Operator status check failed (non-blocking):', sanitizeAuthLogPayload(err));
          const cached = resolveCachedOperatorAccessSnapshot({
            snapshot: operatorInfoRef.current,
            currentUserEmail: currentUser.email || null,
            isOnline: connectivity.isOnline(),
          });
          setOperatorInfo(
            cached ?? (connectivity.isOnline() ? buildDefaultOperatorInfo(currentUser.email || null) : null)
          );
        });
      } else {
        // No Supabase session — check if we have a stored offline session
        if (!connectivity.isOnline() && hasPersistentSession) {
          // Offline with stored session — enter offline mode automatically
          console.log('[Auth] Offline with stored session — entering offline mode');
          sessionRestoreInFlightRef.current = false;
          recordAuthDiagnostic('auth_session_restore_succeeded', {
            entry_mode: 'remembered_session',
            result: 'success',
            duration_ms: consumeAuthTiming('auth_session_restore') ?? getAppLaunchDurationMs(),
            network_state: 'offline',
            access_state: 'offline_mode',
            metadata: { restoredOfflineSession: true },
          });
          setStartupSessionRestored(false);
          setSignInPending(false);
          setOfflineMode(true);
          setUser(null);
          setAuthLoading(false);
        } else {
          sessionRestoreInFlightRef.current = false;
          recordAuthDiagnostic('auth_session_restore_succeeded', {
            entry_mode: 'cold_launch',
            result: 'success',
            duration_ms: consumeAuthTiming('auth_session_restore') ?? getAppLaunchDurationMs(),
            network_state: connectivity.isOnline() ? 'online' : 'offline',
            access_state: 'signed_out',
            metadata: { restoredUser: false },
          });
          setStartupSessionRestored(false);
          setSignInPending(false);
          setUser(null);
          setAuthLoading(false);
        }
      }
      }).catch((err) => {
        // Session check itself failed — check offline fallback
        console.warn('[Auth] Session check failed:', sanitizeAuthLogPayload(err));

      if (isMissingRefreshTokenError(err)) {
        console.log('[Auth] Treating missing refresh token as signed-out startup state');
        sessionRestoreInFlightRef.current = false;
        recordAuthDiagnostic('auth_session_restore_succeeded', {
          entry_mode: 'cold_launch',
          result: 'success',
          duration_ms: consumeAuthTiming('auth_session_restore') ?? getAppLaunchDurationMs(),
          network_state: connectivity.isOnline() ? 'online' : 'offline',
          access_state: 'signed_out',
          metadata: {
            restoredUser: false,
            recoveredFromMissingRefreshToken: true,
          },
        });
        setStartupSessionRestored(false);
        clearAuthenticatedRuntimeState();
        void clearPersistedSupabaseAuthState();
        setAuthLoading(false);
        return;
      }

      if (!connectivity.isOnline() && hasPersistentSession) {
        // Network error but we have a stored session — allow offline access
        console.log('[Auth] Session check failed but offline session exists — entering offline mode');
        setOfflineMode(true);
        recordAuthDiagnostic('auth_session_restore_succeeded', {
          entry_mode: 'remembered_session',
          result: 'success',
          duration_ms: consumeAuthTiming('auth_session_restore') ?? getAppLaunchDurationMs(),
          network_state: 'offline',
          access_state: 'offline_mode',
          metadata: { restoredOfflineSession: true, recoveredFromRestoreFailure: true },
        });
        setStartupSessionRestored(false);
      } else if (connectivity.isOnline()) {
        recordAuthDiagnostic('auth_session_restore_failed', {
          entry_mode: 'cold_launch',
          result: 'failure',
          failure_category: 'session_restore_failed',
          duration_ms: consumeAuthTiming('auth_session_restore') ?? getAppLaunchDurationMs(),
          network_state: 'online',
          metadata: {
            phase: 'session_check',
            error: sanitizeAuthLogPayload(err instanceof Error ? err.message : String(err ?? 'unknown')),
          },
        });
        setAuthNotice('Unable to verify your session right now. Please try again.');
      } else {
        setAuthNotice(AUTH_COPY.session.reconnect);
      }

      sessionRestoreInFlightRef.current = false;
      setStartupSessionRestored(false);
      clearAuthenticatedRuntimeState({
        clearSession: !(!connectivity.isOnline() && hasPersistentSession),
        clearOfflineMode: connectivity.isOnline(),
      });
      setAuthLoading(false);
    });
      }
    }

    // Step 3: Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user || null;
      const runtimeSessionValidity = sessionStore.checkSessionValidity();
      const hasTransientRuntimeSession =
        runtimeSessionValidity === 'no_preference' && sessionStore.hasTransientRuntimeSession();

      if (
        event === 'INITIAL_SESSION' &&
        currentUser &&
        runtimeSessionValidity !== 'valid' &&
        !hasTransientRuntimeSession
      ) {
        console.log('[Auth] Ignoring non-persistent initial provider session', {
          sessionValidity: runtimeSessionValidity,
        });
        setStartupSessionRestored(false);
        clearAuthenticatedRuntimeState();
        void clearPersistedSupabaseAuthState();
        setAuthLoading(false);
        return;
      }

      if (event === 'INITIAL_SESSION') {
        setStartupSessionRestored(!!currentUser);
      } else if (event === 'SIGNED_IN') {
        setStartupSessionRestored(false);
      } else if (event === 'SIGNED_OUT') {
        setStartupSessionRestored(false);
      }
      setSignInPending(false);
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        signOutIntentRef.current = false;
        setAuthNotice(null);
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          markAuthTimingStart('auth_success_to_first_frame');
        }
        // Extend session on any auth state change (token refresh, etc.)
        sessionStore.extendExpiry();

        // Background operator check — non-blocking
        getCurrentAccessState().then((info) => {
          if ('error' in info) {
            return checkOperatorStatus(currentUser.id);
          }
          return info;
        }).then((info) => {
          setOperatorInfo(mapOperatorInfoFromBackend(info as Partial<OperatorInfo>, currentUser.email || null));
        }).catch(() => {
          // Silently fail — never redirect
          const cached = resolveCachedOperatorAccessSnapshot({
            snapshot: operatorInfoRef.current,
            currentUserEmail: currentUser.email || null,
            isOnline: connectivity.isOnline(),
          });
          setOperatorInfo(
            cached ?? (connectivity.isOnline() ? buildDefaultOperatorInfo(currentUser.email || null) : null)
          );
        });
      } else {
        if (event === 'SIGNED_OUT') {
          if (signOutIntentRef.current) {
            signOutIntentRef.current = false;
          } else {
            recordAuthDiagnostic('auth_reauthentication_required', {
              entry_mode: 'app_resume',
              result: 'failure',
              failure_category: 'session_expired',
              network_state: connectivity.isOnline() ? 'online' : 'offline',
              metadata: { sourceEvent: event },
            });
            setAuthNotice(
              connectivity.isOnline() ? AUTH_COPY.session.reauth : AUTH_COPY.session.reconnect
            );
          }
        }
        clearAuthenticatedRuntimeState({
          clearSession: event === 'SIGNED_OUT',
          clearOfflineMode: true,
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [clearAuthenticatedRuntimeState, startupStateHydrated]);


  // ── Set active trip ─────────────────────────────────────────
  const setActiveTripId = useCallback(
    async (id: string) => {
      await activeTripStore.set(id);
      await refreshActiveTrip();
    },
    [refreshActiveTrip]
  );

  // ── Load data on mount ──────────────────────────────────────
  useEffect(() => {
    if (!loading) {
      refreshTrips();
      refreshActiveTrip();
    }
  }, [loading, refreshTrips, refreshActiveTrip]);

  // ── Bootstrap data after login (non-blocking) ───────────────
  const runBootstrap = useCallback(async (userId: string) => {
    setBootstrapError(null);
    try {
      // These are background operations — they must NEVER cause logout
      await ensureUserSettings(userId).catch((e) => {
        console.warn('[Bootstrap] ensureUserSettings failed:', e);
      });

      // Sync vehicle data
      try {
        const { vehicleStore: vs } = await import('../lib/vehicleStore');
        const result = await vs.syncToCloud(userId);
        if (result.synced > 0) {
          showToast(`Synced ${result.synced} vehicle(s)`);
        }
        await vs.syncPendingConfigs(userId).catch(() => {});
      } catch (e) {
        console.warn('[Bootstrap] Vehicle sync failed:', e);
      }

      // Sync trips/data
      if (connectivity.isOnline()) {
        resetAutoSyncAttempts();
        scheduleAutoSync(setSyncStatus, userId, async (result) => {
          setLastSyncResult(result);
          if (result.errors.length === 0) setLastSyncAt(new Date().toISOString());
          await refreshTrips();
          await refreshActiveTrip();
          await refreshDirtyCount();
        });
      }
    } catch (e: any) {
      console.warn('[Bootstrap] Background bootstrap error:', e);
      setBootstrapError('Some data is still loading.');
    }
  }, [showToast, refreshTrips, refreshActiveTrip, refreshDirtyCount]);

  const retryBootstrap = useCallback(() => {
    if (user) {
      runBootstrap(user.id);
    }
  }, [user, runBootstrap]);

  // ── Manual sync ─────────────────────────────────────────────
  const triggerSync = useCallback(async () => {
    if (!isSupabaseConfigured) {
      showToast("Cloud sync not configured");
      return;
    }
    if (!user) {
      showToast("Sign in to sync data");
      return;
    }
    if (!connectivity.isOnline()) {
      showToast("Offline — sync queued for reconnect");
      return;
    }

    resetAutoSyncAttempts();

    const result = await performSync(setSyncStatus, user.id);
    setLastSyncResult(result);

    if (result.errors.length === 0) {
      setLastSyncAt(new Date().toISOString());
    }

    await refreshTrips();
    await refreshActiveTrip();
    await refreshDirtyCount();

    const queueResult = await offlineQueue.processQueue();

    // Also process sync action queue (expedition/loadout/route/checklist actions)
    const syncActionResult = await syncActionQueue.processQueue().catch(() => ({
      processed: 0, failed: 0, remaining: 0,
    }));

    if (result.errors.length === 0) {
      const queueMsg = queueResult.processed > 0 ? ` + ${queueResult.processed} queued ops` : '';
      const syncActionMsg = syncActionResult.processed > 0 ? ` + ${syncActionResult.processed} sync actions` : '';
      const conflictMsg = result.conflicts > 0 ? ` | ${result.conflicts} conflict(s)` : '';
      showToast(`Sync complete: ${result.pushed} pushed, ${result.pulled} pulled${queueMsg}${syncActionMsg}${conflictMsg}`);
    } else {
      showToast(`Sync issues: ${result.errors.length} error(s)`);
    }

  }, [user, refreshTrips, refreshActiveTrip, refreshDirtyCount, showToast]);


  // ── Auto-bootstrap + Realtime Sync on login ──────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) {
      cancelAutoSync();
      realtimeSync.destroy();
      setSyncStatus("offline");
      return;
    }

    if (user) {
      // Clear offline mode once authenticated connectivity has returned.
      if (offlineMode && connectivity.isOnline()) {
        setOfflineMode(false);
        setPersistedOfflineMode(false);
      }

      // Run bootstrap in background — NEVER blocks UI
      runBootstrap(user.id);

      // ── Start Realtime Sync ──
      // Set refresh callback so UI updates when remote changes arrive
      realtimeSync.setRefreshCallback(() => {
        refreshTrips();
        refreshActiveTrip();
        refreshDirtyCount();
      });

      // Start realtime subscriptions (respects the Live Sync toggle)
      realtimeSync.start(user.id);

      // ── Restart Sync Action Queue auto-processing on login ──
      syncActionQueue.startAutoProcess();

      // ── Restart Loadout Reconciliation Sync Queue on login ──
      loadoutSyncQueue.startAutoProcess();

      // If there are pending sync actions and we're online, process them now
      if (syncActionQueue.pendingCount > 0 && connectivity.isOnline()) {
        syncActionQueue.processQueue().catch((err) => {
          console.warn('[Bootstrap] Sync action queue processing failed:', err);
        });
      }
      // Also process pending loadout reconciliation syncs
      if (loadoutSyncQueue.pendingCount > 0 && connectivity.isOnline()) {
        loadoutSyncQueue.processQueue().catch((err) => {
          console.warn('[Bootstrap] Loadout sync queue processing failed:', err);
        });
      }
    } else {
      cancelAutoSync();
      // Stop realtime sync on logout
      realtimeSync.destroy();
      // Stop sync action queue on logout (also handled in signOut, but defensive)
      syncActionQueue.stopAutoProcess();
      // Stop loadout reconciliation sync queue on logout
      loadoutSyncQueue.stopAutoProcess();
      setSyncStatus("offline");
    }



    return () => {
      cancelAutoSync();
    };
  }, [offlineMode, refreshActiveTrip, refreshDirtyCount, refreshTrips, runBootstrap, user]);


  // ============================================================
  // AUTH ACTIONS
  // ============================================================

  const refreshAccessState = useCallback(async (): Promise<OperatorInfo | null> => {
    const currentUser = user;
    if (!currentUser) {
      setOperatorInfo(null);
      return null;
    }

    try {
      const accessState = await getCurrentAccessState();
      if (!('error' in accessState)) {
        const mapped = mapOperatorInfoFromBackend(accessState, currentUser.email || null);
        setOperatorInfo(mapped);
        return mapped;
      }

      const fallback = await checkOperatorStatus(currentUser.id);
      if (fallback.exists === true) {
        const mappedFallback = mapOperatorInfoFromBackend(fallback, currentUser.email || null);
        setOperatorInfo(mappedFallback);
        return mappedFallback;
      }

      if (canReuseOperatorInfoSnapshot({
        snapshot: operatorInfoRef.current,
        currentUserEmail: currentUser.email || null,
        isOnline: connectivity.isOnline(),
      })) {
        const cached = resolveCachedOperatorAccessSnapshot({
          snapshot: operatorInfoRef.current,
          currentUserEmail: currentUser.email || null,
          isOnline: connectivity.isOnline(),
        });
        if (cached) {
          setOperatorInfo(cached);
          return cached;
        }
      }

      const safeDefault = buildDefaultOperatorInfo(currentUser.email || null);
      setOperatorInfo(safeDefault);
      return safeDefault;
    } catch (err) {
      console.warn('[Auth] Access state refresh failed (non-blocking):', sanitizeAuthLogPayload(err));
      if (canReuseOperatorInfoSnapshot({
        snapshot: operatorInfoRef.current,
        currentUserEmail: currentUser.email || null,
        isOnline: connectivity.isOnline(),
      })) {
        const cached = resolveCachedOperatorAccessSnapshot({
          snapshot: operatorInfoRef.current,
          currentUserEmail: currentUser.email || null,
          isOnline: connectivity.isOnline(),
        });
        if (cached) {
          setOperatorInfo(cached);
          return cached;
        }
      }

      const safeDefault = buildDefaultOperatorInfo(currentUser.email || null);
      setOperatorInfo(safeDefault);
      return safeDefault;
    }
  }, [user]);

  const refreshAccessStateIfNeeded = useCallback(async (force = false): Promise<OperatorInfo | null> => {
    const currentUser = userRef.current;
    if (!currentUser || !connectivity.isOnline()) {
      return operatorInfoRef.current;
    }

    const now = Date.now();
    if (!force && now - accessRefreshAtRef.current < 15000) {
      return operatorInfoRef.current;
    }

    accessRefreshAtRef.current = now;
    return refreshAccessState();
  }, [refreshAccessState]);

  useEffect(() => {
    if (!user || !isOnline) return;
    refreshAccessStateIfNeeded().catch(() => {});
  }, [isOnline, refreshAccessStateIfNeeded, user]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      refreshAccessStateIfNeeded(true).catch(() => {});
    });

    return () => subscription.remove();
  }, [refreshAccessStateIfNeeded]);

  const verifyPurchaseProofWithBackend = useCallback(async (proof: NativePurchaseProof, restore: boolean) => {
    if (proof.platform === 'ios') {
      if (!proof.receiptData) {
        return { error: 'Purchase receipt is unavailable for verification.' } as const;
      }
      return restore
        ? await restoreApplePurchase(proof.receiptData)
        : await verifyApplePurchase(proof.receiptData);
    }

    if (!proof.purchaseToken) {
      return { error: 'Purchase token is unavailable for verification.' } as const;
    }

    return restore
      ? await restoreGooglePurchase({
          purchaseToken: proof.purchaseToken,
          packageName: proof.packageName ?? undefined,
          productId: proof.productId,
          subscriptionId: proof.subscriptionId ?? undefined,
        })
      : await verifyGooglePurchase({
          purchaseToken: proof.purchaseToken,
          packageName: proof.packageName ?? undefined,
          productId: proof.productId,
          subscriptionId: proof.subscriptionId ?? undefined,
        });
  }, []);

  /**
   * Sign in with email + password.
   * 
   * CRITICAL FLOW:
   * 1. Call supabase.auth.signInWithPassword
   * 2. If auth succeeds → return success IMMEDIATELY
   * 3. Post-login bootstrap runs in background (non-blocking)
   * 4. NEVER treat bootstrap failure as auth failure
   */
  const signIn = useCallback((
    email: string,
    password: string,
    keepSignedIn: boolean = true,
    source: AuthLoginSource = 'unknown',
  ): Promise<SignInResult> => {
    if (signInAttemptRef.current) {
      return signInAttemptRef.current;
    }

    const loginEmail = email.trim().toLowerCase();
    const loginLogIdentity = {
      email: maskAuthEmail(loginEmail),
      emailHash: hashAuthIdentifier(loginEmail),
    };
    const attemptSource = source;

    const attempt = (async (): Promise<SignInResult> => {
      // Check connectivity
      if (!connectivity.isOnline()) {
        console.log('[Auth] Login attempt failure', {
          source: attemptSource,
          ...loginLogIdentity,
          keepSignedIn,
          reason: 'offline',
        });
        return { error: "You're offline. Check your connection and try again." };
      }

      try {
        setSignInPending(true);
        console.log('[Auth] Login attempt start', {
          source: attemptSource,
          ...loginLogIdentity,
          keepSignedIn,
        });
        // Step 1: Authenticate with Supabase
        const { data, error } = await withAuthRequestTimeout(
          'sign_in_request',
          supabase.auth.signInWithPassword({ email, password }),
          SIGN_IN_REQUEST_TIMEOUT_MS,
        );

        console.log('[Auth] Auth request response', {
          source: attemptSource,
          ...loginLogIdentity,
          ok: !error && !!data?.user,
          error: error?.message ?? null,
          hasUser: !!data?.user,
        });

        if (error) {
          if (error.message === 'Supabase not configured') {
            setSignInPending(false);
            console.log('[Auth] Login attempt failure', {
              source: attemptSource,
              ...loginLogIdentity,
              keepSignedIn,
              reason: 'supabase_not_configured',
            });
            return { error: "Cloud services are initializing. Try again in a moment." };
          }
          // Fire-and-forget audit log
          logLoginFailed(email).catch(() => {});
          setSignInPending(false);
          console.log('[Auth] Login attempt failure', {
            source: attemptSource,
            ...loginLogIdentity,
            keepSignedIn,
            reason: sanitizeAuthError(error.message),
          });
          return { error: sanitizeAuthError(error.message) };
        }

        if (!data?.user) {
          setSignInPending(false);
          console.log('[Auth] Login attempt failure', {
            source: attemptSource,
            ...loginLogIdentity,
            keepSignedIn,
            reason: 'missing_user',
          });
          return { error: "Couldn't sign in. Please try again." };
        }

        // Step 2: Save session preferences to session store
        setStartupSessionRestored(false);
        sessionStore.saveLoginPreferences(keepSignedIn, data.user.id, email);
        sessionStore.extendExpiry();
        setAuthNotice(null);
        console.log('[Auth] Session preferences saved:', {
          keepSignedIn,
          userId: redactAuthUserId(data.user.id),
        });

        // Step 3: Post-login check (with timeout — NEVER blocks)
        try {
          const postResult = await postLogin(data.user.id, email);

          if (postResult.suspended) {
            await supabase.auth.signOut();
            clearAuthenticatedRuntimeState();
            setSignInPending(false);
            console.log('[Auth] Login attempt failure', {
              source: attemptSource,
              ...loginLogIdentity,
              keepSignedIn,
              reason: 'suspended',
            });
            return {
              error: "Your account has been suspended. Contact your administrator.",
              suspended: true,
            };
          }

          setOperatorInfo(mapOperatorInfoFromBackend({ ...postResult, exists: true }, email));
        } catch (postErr) {
          // Post-login failed — that's OK, login still succeeds
          console.warn('[Auth] Post-login check failed (non-blocking):', sanitizeAuthLogPayload(postErr));
          setOperatorInfo({
            ...buildDefaultOperatorInfo(email),
          });
        }

        // Step 4: Promote the authenticated session immediately so routing does not
        // wait on a later provider callback before leaving the login surface.
        setSignInPending(false);
        setUser(data.user);
        setAuthLoading(false);

        // Step 5: Clear offline mode
        setOfflineMode(false);
        setPersistedOfflineMode(false);

        // Step 6: Return success — root auth navigation will take over.
        console.log('[Auth] Login attempt success', {
          source: attemptSource,
          ...loginLogIdentity,
          keepSignedIn,
          userId: redactAuthUserId(data.user.id),
        });
        return {};
      } catch (err: any) {
        const msg = err?.message || 'Unknown error';
        setSignInPending(false);
        if (msg.includes('sign_in_request timed out')) {
          console.log('[Auth] Login attempt failure', {
            source: attemptSource,
            ...loginLogIdentity,
            keepSignedIn,
            reason: 'auth_request_timeout',
          });
          return { error: "Sign in timed out. Check your connection and try again." };
        }
        if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) {
          console.log('[Auth] Login attempt failure', {
            source: attemptSource,
            ...loginLogIdentity,
            keepSignedIn,
            reason: 'network_error',
          });
          return { error: "Network error. Check your connection and try again." };
        }
        console.log('[Auth] Login attempt failure', {
          source: attemptSource,
          ...loginLogIdentity,
          keepSignedIn,
          reason: sanitizeAuthError(msg),
        });
        return { error: sanitizeAuthError(msg) };
      }
    })().finally(() => {
      signInAttemptRef.current = null;
    });

    signInAttemptRef.current = attempt;
    return attempt;
  }, [clearAuthenticatedRuntimeState]);



  const signUp = useCallback(async (email: string, password: string): Promise<{ error?: string }> => {
    if (!isSupabaseConfigured) return { error: "Cloud services are not configured." };

    if (!connectivity.isOnline()) {
      return { error: "You're offline. An internet connection is required to create an account." };
    }

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      return { error: sanitizeAuthError(error.message) };
    }

    if (data.user) {
      logAuditEvent(data.user.id, 'signup_success', { email }).catch(() => {});
    }

    return {};
  }, []);

  const signOut = useCallback(async () => {
    const userId = user?.id;
    const redactedUserId = redactAuthUserId(userId ?? null);
    signOutIntentRef.current = true;
    setSignInPending(false);
    setStartupSessionRestored(false);
    setAuthNotice(null);
    console.log('[Auth] Sign-out start', {
      userId: redactedUserId,
      isOnline: connectivity.isOnline(),
    });
    recordAuthDiagnostic('auth_logout_started', {
      entry_mode: 'logout_return',
      result: 'started',
      network_state: connectivity.isOnline() ? 'online' : 'offline',
      access_state: accessState?.accessState ?? (userId ? 'authenticated' : 'signed_out'),
    });

    if (userId) {
      await logLogout(userId).catch(() => {});
    }

    // ── Flush pending dashboard writes before clearing state ──
    // Ensures any debounced widget layout changes are persisted to disk
    // before the session is torn down. This guarantees a clean state on
    // sign-out: the next login (or offline access) will see the user's
    // last dashboard arrangement.
    try {
      await flushDashboardWrites();
      console.log('[SignOut] Dashboard writes flushed to disk');
    } catch (e) {
      console.warn('[SignOut] Dashboard flush failed (non-fatal):', e);
      // Non-fatal — we still proceed with sign-out even if flush fails.
      // The debounced write may have already completed, or the data will
      // be lost (acceptable since the user is explicitly signing out).
    }

    if (isSupabaseConfigured) await supabase.auth.signOut();
    await clearPersistedSupabaseAuthState();
    clearAuthenticatedRuntimeState();
    console.log('[Auth] Sign-out success', {
      userId: redactedUserId,
      isOnline: connectivity.isOnline(),
    });
    recordAuthDiagnostic('auth_logout_completed', {
      entry_mode: 'logout_return',
      result: 'completed',
      network_state: connectivity.isOnline() ? 'online' : 'offline',
      access_state: 'signed_out',
    });
  }, [accessState?.accessState, clearAuthenticatedRuntimeState, user]);





  const sendPasswordReset = useCallback(async (email: string): Promise<{ error?: string }> => {
    if (!isSupabaseConfigured) return { error: "Cloud services are not configured." };

    if (!connectivity.isOnline()) {
      return { error: "You're offline. An internet connection is required." };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('/create-access-key', {
        queryParams: { mode: 'reset' },
      }),
    });

    if (error) return { error: sanitizeAuthError(error.message) };

    logAuditEvent(null, 'password_reset_requested', { email }).catch(() => {});

    return {};
  }, []);

  const sendCredentialSetupLink = useCallback(async (email: string): Promise<{ error?: string }> => {
    if (!isSupabaseConfigured) return { error: "Cloud services are not configured." };

    if (!connectivity.isOnline()) {
      return { error: "You're offline. An internet connection is required." };
    }

    const redirectTo = Linking.createURL('/create-access-key', {
      queryParams: { mode: 'activate' },
    });

    const result = await sendSetupLink(email, redirectTo);
    return result;
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<{ error?: string }> => {
    if (!isSupabaseConfigured) return { error: "Cloud services are not configured." };

    const { error } = await supabase.auth.updateUser({ password });

    if (error) return { error: sanitizeAuthError(error.message) };

    const userId = user?.id;
    if (userId) {
      logPasswordUpdate(userId).catch(() => {});
    }

    return {};
  }, [user]);

  const rotateSharedAccountPassword = useCallback(async (
    password: string,
    revokeSessions: boolean,
  ): Promise<SharedAccountPasswordRotationResult> => {
    if (!isSupabaseConfigured) {
      return {
        success: false,
        sessions_revoked: false,
        revoke_supported: false,
        error: 'Cloud services are not configured.',
      };
    }

    if (!user) {
      return {
        success: false,
        sessions_revoked: false,
        revoke_supported: false,
        error: 'Sign in to manage this account.',
      };
    }

    const result = await rotateSharedAccountPasswordRequest(password, revokeSessions);
    if (result.success && user.id) {
      logPasswordUpdate(user.id).catch(() => {});
    }
    return result;
  }, [user]);

  const loadProduct = loadEcsProStoreProduct;

  const loadEcsProProductForUser = useCallback(async (): Promise<EcsProStoreProduct | null> => {
    setBillingError(null);
    setBillingFlowState('loading_product');
    try {
      const product = await loadProduct();
      setEcsProProduct(product);
      setBillingFlowState('idle');
      return product;
    } catch (err: any) {
      const message = err?.message || 'ECS Pro product details are unavailable right now.';
      setBillingError(message);
      setBillingFlowState('idle');
      return null;
    }
  }, [loadProduct]);

  const purchaseEcsProMonthly = useCallback(async (): Promise<{ success: boolean; cancelled?: boolean; pending?: boolean; error?: string }> => {
    if (!user) {
      return { success: false, error: 'Sign in to your ECS account before purchasing ECS Pro.' };
    }

    setBillingError(null);
    setBillingFlowState('purchasing');

    try {
      const result = await startEcsProMonthlyPurchase();

      if (result.state === 'cancelled') {
        setBillingFlowState('idle');
        return {
          success: false,
          cancelled: true,
          error: result.message || 'Purchase cancelled.',
        };
      }

      if (result.state === 'pending' || !result.proof) {
        setBillingFlowState('idle');
        return {
          success: false,
          pending: true,
          error: result.message || 'Purchase is pending confirmation.',
        };
      }

      setBillingFlowState('confirming_access');
      const verification = await verifyPurchaseProofWithBackend(result.proof, false);
      if ('error' in verification) {
        const message = verification.error || 'Purchase verification failed.';
        await refreshAccessState().catch(() => {});
        setBillingError(message);
        setBillingFlowState('idle');
        return { success: false, error: message };
      }

      await finishEcsProNativePurchase(result.proof).catch(() => {});
      await refreshAccessState();
      setBillingFlowState('idle');
      return { success: true };
    } catch (err: any) {
      const message = err?.message || 'Unable to start the ECS Pro purchase right now.';
      setBillingError(message);
      setBillingFlowState('idle');
      return { success: false, error: message };
    }
  }, [refreshAccessState, user, verifyPurchaseProofWithBackend]);

  const restoreEcsProAccess = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!user) {
      return { success: false, error: 'Sign in to the ECS account that should receive restored access before restoring purchases.' };
    }

    setBillingError(null);
    setBillingFlowState('restore_in_progress');

    try {
      const restored = await restoreEcsProPurchase();
      if (restored.state !== 'purchased' || !restored.proof) {
        const message = restored.message || 'No ECS Pro purchase was available to restore.';
        setBillingError(message);
        setBillingFlowState('restore_failed');
        return { success: false, error: message };
      }

      const verification = await verifyPurchaseProofWithBackend(restored.proof, true);
      if ('error' in verification) {
        const message = verification.error || 'Restore verification failed.';
        await refreshAccessState().catch(() => {});
        setBillingError(message);
        setBillingFlowState('restore_failed');
        return { success: false, error: message };
      }

      await refreshAccessState();
      setBillingFlowState('restore_success');
      return { success: true };
    } catch (err: any) {
      const message = err?.message || 'Unable to restore ECS Pro access right now.';
      setBillingError(message);
      setBillingFlowState('restore_failed');
      return { success: false, error: message };
    }
  }, [refreshAccessState, user, verifyPurchaseProofWithBackend]);
  // ── Compute session info for UI ──────────────────────────────
  const sessionInfo = useMemo<SessionInfo>(() => {
    const sessionPrefs = sessionStore.getPreferences();
    return {
      keepSignedIn: sessionPrefs.keepSignedIn,
      expiryLabel: sessionStore.getRemainingTimeLabel(),
      sessionCreatedAt: sessionPrefs.sessionCreatedAt,
    };
  }, [authPhase, startupSessionRestored, user]);

  const appContextValue = useMemo<AppContextValue>(() => ({
    user,
    authLoading,
    authPhase,
    startupSessionRestored,
    operatorInfo,
    accessState,
    sessionInfo,
    billingFlowState,
    billingError,
    ecsProProduct,
    authNotice,
    bootstrapError,
    retryBootstrap,
    isOnline,
    connectivityStatus,
    offlineMode,
    queueSize,
    syncStatus,
    dirtyCount,
    lastSyncAt,
    lastSyncResult,
    activeTrip,
    trips,
    loadItems,
    riskScore,
    fuelWaterLogs,
    loadMapSlots,
    waypoints,
    userSettings,
    loading,
    dbReady,
    refreshTrips,
    refreshActiveTrip,
    setActiveTripId,
    triggerSync,
    signIn,
    signUp,
    signOut,
    sendPasswordReset,
    sendCredentialSetupLink,
    updatePassword,
    rotateSharedAccountPassword,
    refreshAccessState,
    loadEcsProProduct: loadEcsProProductForUser,
    purchaseEcsProMonthly,
    restoreEcsProAccess,
    enterOfflineMode,
    exitOfflineMode,
    showToast,
    consumeAuthNotice,
  }), [
    accessState,
    activeTrip,
    authLoading,
    authNotice,
    authPhase,
    billingError,
    billingFlowState,
    bootstrapError,
    connectivityStatus,
    consumeAuthNotice,
    dbReady,
    dirtyCount,
    ecsProProduct,
    enterOfflineMode,
    exitOfflineMode,
    fuelWaterLogs,
    isOnline,
    lastSyncAt,
    lastSyncResult,
    loadEcsProProductForUser,
    loadItems,
    loadMapSlots,
    loading,
    offlineMode,
    operatorInfo,
    purchaseEcsProMonthly,
    queueSize,
    refreshAccessState,
    refreshActiveTrip,
    refreshTrips,
    restoreEcsProAccess,
    retryBootstrap,
    riskScore,
    rotateSharedAccountPassword,
    sendCredentialSetupLink,
    sendPasswordReset,
    sessionInfo,
    setActiveTripId,
    showToast,
    signIn,
    signOut,
    signUp,
    startupSessionRestored,
    syncStatus,
    triggerSync,
    trips,
    updatePassword,
    user,
    userSettings,
    waypoints,
  ]);

  return (
    <ToastContext.Provider value={toastMsg}>
      <AppContext.Provider value={appContextValue}>
        {children}
      </AppContext.Provider>
    </ToastContext.Provider>
  );
}






