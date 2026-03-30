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
  useRef,
  ReactNode,
} from "react";

import { Platform } from "react-native";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
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
} from "../lib/auth";
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




// ── Offline mode persistence key ─────────────────────────────
const OFFLINE_MODE_KEY = 'ecs_offline_mode';

function getPersistedOfflineMode(): boolean {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(OFFLINE_MODE_KEY) === 'true';
    }
  } catch {}
  return false;
}

function setPersistedOfflineMode(value: boolean): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      if (value) {
        localStorage.setItem(OFFLINE_MODE_KEY, 'true');
      } else {
        localStorage.removeItem(OFFLINE_MODE_KEY);
      }
    }
  } catch {}
}

async function ensureSlotsSeeded(tripId: string, userId: string | null) {
  await loadMapSlotStore.seedForTrip(tripId, userId || undefined);
}

interface SessionInfo {
  keepSignedIn: boolean;
  expiryLabel: string | null;
  sessionCreatedAt: string | null;
}

interface AppState {
  // Auth
  user: any | null;
  authLoading: boolean;
  operatorInfo: OperatorInfo | null;
  sessionInfo: SessionInfo;

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
  toastMsg: string | null;

  // Actions
  refreshTrips: () => Promise<void>;
  refreshActiveTrip: () => Promise<void>;
  setActiveTripId: (id: string) => Promise<void>;
  triggerSync: () => Promise<void>;
  signIn: (email: string, password: string, keepSignedIn?: boolean) => Promise<{ error?: string; suspended?: boolean }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ error?: string }>;
  sendCredentialSetupLink: (email: string) => Promise<{ error?: string }>;
  updatePassword: (password: string) => Promise<{ error?: string }>;
  enterOfflineMode: () => void;
  exitOfflineMode: () => void;
  showToast: (msg: string) => void;
}

const AppContext = createContext<AppState>({} as AppState);
export const useApp = () => useContext(AppContext);


export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [operatorInfo, setOperatorInfo] = useState<OperatorInfo | null>(null);

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
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef = useRef<any | null>(null);
  const syncProcessorsInitRef = useRef(false);

  // Keep userRef in sync
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 3000);
  }, []);

  // ── Offline mode actions ────────────────────────────────────
  const enterOfflineMode = useCallback(() => {
    setOfflineMode(true);
    setPersistedOfflineMode(true);
  }, []);

  const exitOfflineMode = useCallback(() => {
    setOfflineMode(false);
    setPersistedOfflineMode(false);
  }, []);

  // ── Initialize IndexedDB + migrate from localStorage + hydrate dashboard ────
  useEffect(() => {
    (async () => {
      const ready = await isDBReady();
      setDbReady(ready);

      if (ready) {
        const didMigrate = await migrateLocalStorageToIndexedDB();
        if (didMigrate) console.log("[ECS] Migrated localStorage data to IndexedDB");
      }

      // ── Hydrate dashboard state from persistent storage ──
      // This reads from expo-file-system (native) or localStorage (web)
      // and populates the in-memory cache so the dashboard renders
      // with the user's saved widget arrangement, grid layout, and settings.
      // Must run before setLoading(false) so the dashboard has data on first render.
      try {
        await Promise.all([
          hydrateDashboardState(),
          hydrateCustomPresets(),
        ]);
        console.log('[ECS] Dashboard state hydrated from persistent storage');
      } catch (e) {
        console.warn('[ECS] Dashboard hydration failed (non-fatal):', e);
        // Non-fatal — dashboard will use defaults until first mutation persists
      }

      if (!isSupabaseConfigured) {
        setSyncStatus("offline");
      }

      setLoading(false);
    })();
  }, []);


  // ── Connectivity monitoring ─────────────────────────────────
  useEffect(() => {
    connectivity.startMonitoring();

    const unsub = connectivity.onStatusChange((status, wasOffline) => {
      setConnectivityStatus(status);
      setIsOnline(status === 'online');

      if (status === 'online' && wasOffline) {
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
        setSyncStatus("offline");
        showToast("Offline — working locally");
      }
    });

    offlineQueue.startAutoProcess();

    // Start dispatch queue auto-flush monitoring
    dispatchQueue.startAutoFlush();

    const queueUnsub = offlineQueue.onChange((queue) => {
      setQueueSize(queue.length);
    });

    setIsOnline(connectivity.isOnline());
    setConnectivityStatus(connectivity.status);

    return () => {
      unsub();
      queueUnsub();
      connectivity.stopMonitoring();
      offlineQueue.stopAutoProcess();
      dispatchQueue.stopAutoFlush();
    };
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
      connectivityIntelService.initialize();
      console.log('[ECS] Connectivity Intelligence service initialized');
    } catch (err) {
      console.warn('[ECS] Connectivity Intelligence initialization failed (non-fatal):', err);
    }

    return () => {
      connectivityIntelService.stopMonitoring();
    };
  }, []);


  // ── Initialize Sync Action Processors ───────────────────────
  // Registers all category processors (expedition, loadout, route, checklist,
  // field_log, waypoint, dashboard) and starts the auto-process connectivity
  // listener. Called ONCE after both the database client (IndexedDB) and the
  // connectivity monitor are initialized.
  //
  // Timing: This runs after:
  //   1. IndexedDB is ready (dbReady = true)
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
    if (!isSupabaseConfigured) {
      setUser(null);
      setAuthLoading(false);
      return;
    }

    // Step 0: Check session store validity BEFORE Supabase session check
    const sessionValidity = sessionStore.checkSessionValidity();
    console.log('[Auth] Session store validity:', sessionValidity);

    if (sessionValidity === 'expired') {
      // 30-day expiry has passed — force re-login
      console.log('[Auth] 30-day session expired — clearing session');
      sessionStore.clearSession();
      supabase.auth.signOut().catch(() => {});
      setUser(null);
      setAuthLoading(false);
      return;
    }

    // Step 1: Check existing Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user || null;

      if (currentUser) {
        // Valid Supabase session found — extend expiry if "keep signed in"
        sessionStore.extendExpiry();
        setUser(currentUser);
        setAuthLoading(false);

        // Step 2: Check operator status in background (non-blocking)
        checkOperatorStatus(currentUser.id).then((info) => {
          if (info.status === 'suspended') {
            supabase.auth.signOut();
            sessionStore.clearSession();
            setUser(null);
            setOperatorInfo(null);
          } else {
            setOperatorInfo(info);
          }
        }).catch((err) => {
          // NEVER treat this as auth failure
          console.warn('[Auth] Operator status check failed (non-blocking):', err);
          setOperatorInfo({ role: 'operator', status: 'active', display_name: null, email: currentUser.email || null, exists: false });
        });
      } else {
        // No Supabase session — check if we have a stored offline session
        if (!connectivity.isOnline() && sessionStore.hasOfflineSession()) {
          // Offline with stored session — enter offline mode automatically
          console.log('[Auth] Offline with stored session — entering offline mode');
          setOfflineMode(true);
          setPersistedOfflineMode(true);
          setUser(null);
          setAuthLoading(false);
        } else {
          setUser(null);
          setAuthLoading(false);
        }
      }
    }).catch((err) => {
      // Session check itself failed — check offline fallback
      console.warn('[Auth] Session check failed:', err);

      if (!connectivity.isOnline() && sessionStore.hasOfflineSession()) {
        // Network error but we have a stored session — allow offline access
        console.log('[Auth] Session check failed but offline session exists — entering offline mode');
        setOfflineMode(true);
        setPersistedOfflineMode(true);
      }

      setUser(null);
      setAuthLoading(false);
    });

    // Step 3: Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user || null;
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        // Extend session on any auth state change (token refresh, etc.)
        sessionStore.extendExpiry();

        // Background operator check — non-blocking
        checkOperatorStatus(currentUser.id).then((info) => {
          setOperatorInfo(info);
        }).catch(() => {
          // Silently fail — never redirect
          setOperatorInfo({ role: 'operator', status: 'active', display_name: null, email: currentUser.email || null, exists: false });
        });
      } else {
        setOperatorInfo(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);


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
      // Clear offline mode when user logs in
      if (offlineMode) {
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
  }, [user, runBootstrap, refreshTrips, refreshActiveTrip, refreshDirtyCount]);


  // ============================================================
  // AUTH ACTIONS
  // ============================================================

  /**
   * Sign in with email + password.
   * 
   * CRITICAL FLOW:
   * 1. Call supabase.auth.signInWithPassword
   * 2. If auth succeeds → return success IMMEDIATELY
   * 3. Post-login bootstrap runs in background (non-blocking)
   * 4. NEVER treat bootstrap failure as auth failure
   */
  const signIn = useCallback(async (email: string, password: string, keepSignedIn: boolean = true): Promise<{ error?: string; suspended?: boolean }> => {
    // Check connectivity
    if (!connectivity.isOnline()) {
      return { error: "You're offline. Check your connection and try again." };
    }

    try {
      // Step 1: Authenticate with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (error.message === 'Supabase not configured') {
          return { error: "Cloud services are initializing. Try again in a moment." };
        }
        // Fire-and-forget audit log
        logLoginFailed(email).catch(() => {});
        return { error: sanitizeAuthError(error.message) };
      }

      if (!data.user) {
        return { error: "Couldn't sign in. Please try again." };
      }

      // Step 2: Save session preferences to session store
      sessionStore.saveLoginPreferences(keepSignedIn, data.user.id, email);
      console.log('[Auth] Session preferences saved:', { keepSignedIn, userId: data.user.id });

      // Step 3: Post-login check (with timeout — NEVER blocks)
      try {
        const postResult = await postLogin(data.user.id, email);

        if (postResult.suspended) {
          await supabase.auth.signOut();
          sessionStore.clearSession();
          setUser(null);
          setOperatorInfo(null);
          return {
            error: "Your account has been suspended. Contact your administrator.",
            suspended: true,
          };
        }

        setOperatorInfo({
          role: postResult.role,
          status: postResult.status,
          display_name: null,
          email,
          exists: true,
        });
      } catch (postErr) {
        // Post-login failed — that's OK, login still succeeds
        console.warn('[Auth] Post-login check failed (non-blocking):', postErr);
        setOperatorInfo({
          role: 'operator',
          status: 'active',
          display_name: null,
          email,
          exists: false,
        });
      }

      // Step 4: Clear offline mode
      setOfflineMode(false);
      setPersistedOfflineMode(false);

      // Step 5: Return success — navigation happens in the calling component
      return {};
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) {
        return { error: "Network error. Check your connection and try again." };
      }
      return { error: sanitizeAuthError(msg) };
    }
  }, []);



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

    // Clear session store (30-day expiry, keep-signed-in preference, etc.)
    sessionStore.clearSession();

    cancelAutoSync();

    // Stop realtime sync on logout
    realtimeSync.destroy();

    // Stop sync action queue auto-processing on logout
    // (keeps queued actions persisted for next login, but stops processing)
    syncActionQueue.stopAutoProcess();

    // Stop loadout reconciliation sync queue on logout
    loadoutSyncQueue.stopAutoProcess();


    if (isSupabaseConfigured) await supabase.auth.signOut();
    setUser(null);
    setOperatorInfo(null);
    setSyncStatus("offline");
    setLastSyncResult(null);
    setBootstrapError(null);

    // Clear offline mode on logout
    setOfflineMode(false);
    setPersistedOfflineMode(false);
  }, [user]);





  const sendPasswordReset = useCallback(async (email: string): Promise<{ error?: string }> => {
    if (!isSupabaseConfigured) return { error: "Cloud services are not configured." };

    if (!connectivity.isOnline()) {
      return { error: "You're offline. An internet connection is required." };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/create-access-key` : undefined,
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

    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/create-access-key`
      : undefined;

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
  // ── Compute session info for UI ──────────────────────────────
  const sessionInfo: SessionInfo = React.useMemo(() => {
    const prefs = sessionStore.getPreferences();
    return {
      keepSignedIn: prefs.keepSignedIn,
      expiryLabel: sessionStore.getRemainingTimeLabel(),
      sessionCreatedAt: prefs.sessionCreatedAt,
    };
  }, [user]); // Recompute when user changes (login/logout)

  return (
    <AppContext.Provider
      value={{
        user,
        authLoading,
        operatorInfo,
        sessionInfo,
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
        toastMsg,
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
        enterOfflineMode,
        exitOfflineMode,
        showToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}






