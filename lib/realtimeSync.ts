/**
 * Real-Time Sync Engine
 *
 * Uses Supabase Realtime subscriptions to receive live database changes.
 * When a remote change is detected:
 *   1. Check if the local row is dirty (modified locally)
 *   2. If dirty → run conflict detection (same as batch sync)
 *   3. If clean → merge directly into local store
 *
 * Features:
 *   - Subscribe/unsubscribe to 6 tables
 *   - Conflict detection integration
 *   - Notification system for UI banners
 *   - Live Sync toggle with persistence
 *   - Event history for diagnostics
 *   - Auto-reconnect on subscription errors
 */

import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import { connectivity, type ConnectivityStatus } from './connectivity';
import { ecsLog } from './ecsLogger';
import {
  tripStore,
  riskScoreStore,
  loadItemStore,
  loadMapSlotStore,
  fuelWaterLogStore,
  waypointStore,
} from './storage';
import {
  detectConflictsForTable,
  savePendingConflicts,
  notifyConflictListeners,
} from './conflictStore';

// ── Types ─────────────────────────────────────────────────────

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RealtimeEvent {
  id: string;
  table: string;
  type: RealtimeEventType;
  recordId: string;
  recordName: string;
  timestamp: string;
  conflictDetected: boolean;
}

export type RealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'subscribed'
  | 'timed_out'
  | 'retrying'
  | 'degraded'
  | 'offline_available';

export type RealtimeChangeListener = (event: RealtimeEvent) => void;
export type RealtimeStatusListener = (status: RealtimeStatus) => void;

type RealtimeFailureReason =
  | 'auth_missing'
  | 'auth_session_error'
  | 'auth_session_invalid'
  | 'network_offline'
  | 'channel_closed'
  | 'channel_error'
  | 'subscription_timeout'
  | 'server_rejected'
  | 'start_failed'
  | 'supabase_unconfigured';

// ── Constants ─────────────────────────────────────────────────

const SUBSCRIBED_TABLES = [
  'trips',
  'load_items',
  'risk_scores',
  'waypoints',
  'load_map_slots',
  'fuel_water_logs',
] as const;

const TABLE_LABELS: Record<string, string> = {
  trips: 'Expedition',
  load_items: 'Loadout Item',
  risk_scores: 'Risk Score',
  waypoints: 'Waypoint',
  load_map_slots: 'Load Map Slot',
  fuel_water_logs: 'Fuel/Water Log',
};

const LIVE_SYNC_KEY = 'ecs_live_sync_enabled';
const MAX_EVENT_HISTORY = 50;
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 60000;
const RECONNECT_MAX_WINDOW_MS = 5 * 60 * 1000;
const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_JITTER_RATIO = 0.25;
const SUBSCRIPTION_TIMEOUT_MS = 15000;
const REALTIME_WARNING_THROTTLE_MS = 30000;

function debugRealtime(message: string, details?: Record<string, unknown>): void {
  ecsLog.debug('SYSTEM', message, details);
}

function summarizeRealtimeError(error: unknown): Record<string, unknown> | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (typeof error === 'object') {
    const source = error as Record<string, unknown>;
    return {
      name: source.name,
      message: source.message,
      code: source.code,
      status: source.status,
      details: source.details,
    };
  }

  return { message: String(error) };
}

function isSessionExpired(expiresAt?: number | null): boolean {
  if (!expiresAt) return false;
  const expiresAtMs = expiresAt * 1000;
  return expiresAtMs <= Date.now() + 30_000;
}

// ── Store mapping ─────────────────────────────────────────────

function getStoreForTable(table: string) {
  switch (table) {
    case 'trips':
      return tripStore;
    case 'load_items':
      return loadItemStore;
    case 'risk_scores':
      return riskScoreStore;
    case 'waypoints':
      return waypointStore;
    case 'load_map_slots':
      return loadMapSlotStore;
    case 'fuel_water_logs':
      return fuelWaterLogStore;
    default:
      return null;
  }
}

function getRecordName(row: any, table: string): string {
  if (row?.name) return row.name;
  if (table === 'risk_scores') return `Risk: ${(row?.trip_id || '').slice(0, 8)}`;
  if (table === 'load_map_slots') return `Slot: ${row?.slot_key || (row?.id || '').slice(0, 8)}`;
  if (table === 'fuel_water_logs') return `Log: ${row?.log_date || (row?.id || '').slice(0, 8)}`;
  if (table === 'waypoints') {
    const lat =
      typeof row?.latitude === 'number' ? row.latitude.toFixed(4) : typeof row?.lat === 'number' ? row.lat.toFixed(4) : '?';
    const lon =
      typeof row?.longitude === 'number'
        ? row.longitude.toFixed(4)
        : typeof row?.lng === 'number'
          ? row.lng.toFixed(4)
          : '?';
    return `WP: ${lat}, ${lon}`;
  }
  return `${TABLE_LABELS[table] || 'Record'} ${(row?.id || 'Unknown').slice(0, 12)}`;
}

// ── Persistence helpers ───────────────────────────────────────

function getPersistedLiveSyncEnabled(): boolean {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(LIVE_SYNC_KEY) !== 'false';
    }
  } catch {}
  return true;
}

function setPersistedLiveSyncEnabled(enabled: boolean): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(LIVE_SYNC_KEY, enabled ? 'true' : 'false');
    }
  } catch {}
}

function createRealtimeEventId(): string {
  return `rt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Realtime Sync Manager ─────────────────────────────────────

class RealtimeSyncManager {
  private _status: RealtimeStatus = 'idle';
  private _enabled: boolean = getPersistedLiveSyncEnabled();
  private _userId: string | null = null;
  private _channel: any = null;
  private _eventHistory: RealtimeEvent[] = [];
  private _changeListeners = new Set<RealtimeChangeListener>();
  private _statusListeners = new Set<RealtimeStatusListener>();
  private _mergeInProgress = false;
  private _mergeQueue: Array<{
    table: string;
    payload: any;
    eventType: RealtimeEventType;
    eventId: string;
  }> = [];
  private _connectedAt: string | null = null;
  private _totalEventsReceived = 0;
  private _totalConflictsDetected = 0;
  private _totalRowsMerged = 0;
  private _lastEventAt: string | null = null;
  private _refreshCallback: (() => void) | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _channelKey: string | null = null;
  private _subscribeInFlight = false;
  private _retryAttempt = 0;
  private _retryWindowStartedAt: number | null = null;
  private _lastFailureReason: RealtimeFailureReason | null = null;
  private _warningLogState = new Map<string, { lastAt: number; suppressed: number }>();
  private _connectivityUnsubscribe: (() => void) | null = null;
  private _channelGeneration = 0;
  private _lastOfflinePauseKey: string | null = null;
  private _subscriptionTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Public getters ──────────────────────────────────────────

  get status(): RealtimeStatus {
    return this._status;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  get eventHistory(): RealtimeEvent[] {
    return [...this._eventHistory];
  }

  get connectedAt(): string | null {
    return this._connectedAt;
  }

  get stats() {
    return {
      totalEventsReceived: this._totalEventsReceived,
      totalConflictsDetected: this._totalConflictsDetected,
      totalRowsMerged: this._totalRowsMerged,
      lastEventAt: this._lastEventAt,
      connectedAt: this._connectedAt,
      subscribedTables: SUBSCRIBED_TABLES.length,
      status: this._status,
      lastFailureReason: this._lastFailureReason,
      retryAttempt: this._retryAttempt,
    };
  }

  // ── Listener management ─────────────────────────────────────

  onChange(listener: RealtimeChangeListener): () => void {
    this._changeListeners.add(listener);
    return () => this._changeListeners.delete(listener);
  }

  onStatusChange(listener: RealtimeStatusListener): () => void {
    this._statusListeners.add(listener);
    return () => this._statusListeners.delete(listener);
  }

  setRefreshCallback(cb: (() => void) | null): void {
    this._refreshCallback = cb;
  }

  // ── Enable / Disable ───────────────────────────────────────

  setEnabled(enabled: boolean): void {
    if (this._enabled === enabled) return;

    this._enabled = enabled;
    setPersistedLiveSyncEnabled(enabled);

    if (enabled && this._userId && this._status !== 'subscribed' && this._status !== 'connecting') {
      this.start(this._userId);
      return;
    }

    if (!enabled && this._status !== 'idle') {
      this.stop();
    }
  }

  // ── Start / Stop ────────────────────────────────────────────

  start(userId: string): void {
    if (!isSupabaseConfigured) {
      this._handleStartBlocked('supabase_unconfigured', 'Supabase not configured; realtime sync skipped');
      return;
    }

    if (!this._enabled) {
      debugRealtime('Realtime sync disabled; skipping start');
      return;
    }

    if (!userId) {
      this._handleStartBlocked('auth_missing', 'No userId provided; realtime sync skipped');
      return;
    }

    this._userId = userId;
    this._ensureConnectivityListener();

    if (this._shouldPauseForOffline()) {
      this._lastFailureReason = 'network_offline';
      this._setStatus('offline_available');
      this._debugOfflinePauseOnce('start');
      return;
    }

    const channelKey = `ecs-realtime-sync:${userId}`;
    if (this._channelKey === channelKey && this._reconnectTimer) {
      debugRealtime('realtime_retry_skipped_duplicate', {
        channelKey,
        reason: 'reconnect_already_scheduled',
        status: this._status,
      });
      return;
    }

    if (
      this._channelKey === channelKey &&
      (this._status === 'subscribed' || this._status === 'connecting' || this._subscribeInFlight)
    ) {
      debugRealtime('realtime_retry_skipped_duplicate', {
        channelKey,
        reason: 'subscription_already_active',
        status: this._status,
      });
      return;
    }

    if (this._channel) {
      this._removeChannelSafely(this._channel, this._channelKey, 'start_replace');
      if (this._channelKey) {
        debugRealtime('realtime_cleanup', {
          channelKey: this._channelKey,
          reason: this._channelKey === channelKey ? 'resubscribe' : 'channel_changed',
        });
      }
      this._channel = null;
    }

    this._clearReconnectTimer();
    const channelGeneration = ++this._channelGeneration;
    this._subscribeInFlight = true;
    this._channelKey = channelKey;
    this._setStatus('connecting');
    debugRealtime('realtime_subscribe_started', {
      channelKey,
      subscribedTables: SUBSCRIBED_TABLES.length,
    });

    void this._validateSessionAndSubscribe(userId, channelKey, channelGeneration);
  }

  private async _validateSessionAndSubscribe(
    userId: string,
    channelKey: string,
    channelGeneration: number,
  ): Promise<void> {
    try {
      debugRealtime('realtime_auth_check_started', { channelKey });
      const { data, error } = await supabase.auth.getSession();

      if (channelGeneration !== this._channelGeneration || channelKey !== this._channelKey) {
        debugRealtime('realtime_stale_auth_check_ignored', {
          channelKey,
          currentChannelKey: this._channelKey,
        });
        return;
      }

      if (error) {
        this._handleAuthSessionFailure('auth_session_error', channelKey, error);
        return;
      }

      const session = data?.session ?? null;
      const sessionUserId = session?.user?.id ?? null;
      if (!session || sessionUserId !== userId || isSessionExpired(session.expires_at)) {
        this._handleAuthSessionFailure('auth_session_invalid', channelKey, {
          hasSession: !!session,
          sessionUserMatches: sessionUserId === userId,
          expiresAt: session?.expires_at ?? null,
        });
        return;
      }

      this._subscribeToChannel(userId, channelKey, channelGeneration);
    } catch (err) {
      if (channelGeneration !== this._channelGeneration || channelKey !== this._channelKey) {
        debugRealtime('realtime_stale_auth_check_ignored', {
          channelKey,
          currentChannelKey: this._channelKey,
        });
        return;
      }
      this._handleAuthSessionFailure('auth_session_error', channelKey, err);
    }
  }

  private _subscribeToChannel(userId: string, channelKey: string, channelGeneration: number): void {
    this._armSubscriptionTimeout(channelKey, channelGeneration);

    try {
      const channel = supabase.channel(channelKey, {
        config: {
          broadcast: { self: false },
        },
      });

      for (const table of SUBSCRIBED_TABLES) {
        channel.on(
          'postgres_changes' as any,
          {
            event: '*',
            schema: 'public',
            table,
            filter: `user_id=eq.${userId}`,
          },
          (payload: any) => {
            void this._handleChange(table, payload);
          }
        );
      }

      this._channel = channel;

      channel.subscribe((status: string, error?: unknown) => {
        if (channelGeneration !== this._channelGeneration || channel !== this._channel) {
          debugRealtime('realtime_stale_channel_status_ignored', {
            channelKey,
            status,
          });
          return;
        }

        debugRealtime('Realtime channel status changed', {
          status,
          error: summarizeRealtimeError(error),
        });
        this._clearSubscriptionTimeout();

        if (status === 'SUBSCRIBED') {
          const recoveredFrom = this._lastFailureReason;
          const recoveredAttempt = this._retryAttempt;
          this._subscribeInFlight = false;
          this._retryAttempt = 0;
          this._retryWindowStartedAt = null;
          this._lastFailureReason = null;
          this._setStatus('subscribed');
          this._connectedAt = new Date().toISOString();
          debugRealtime('realtime_subscribed', {
            channelKey,
            subscribedTables: SUBSCRIBED_TABLES.length,
          });
          if (recoveredFrom || recoveredAttempt > 0) {
            debugRealtime('realtime_reconnect_success', {
              attempt: recoveredAttempt,
              channelKey,
              recoveredFrom,
            });
          }
          return;
        }

        if (status === 'CLOSED') {
          this._handleChannelFailure('channel_closed', status, channelKey, channelGeneration, error);
          return;
        }

        if (status === 'CHANNEL_ERROR') {
          this._handleChannelFailure('channel_error', status, channelKey, channelGeneration, error);
          return;
        }

        if (status === 'TIMED_OUT') {
          this._handleChannelFailure('subscription_timeout', status, channelKey, channelGeneration, error);
        }
      });

    } catch (err) {
      this._subscribeInFlight = false;
      this._clearSubscriptionTimeout();
      this._setStatus('degraded');
      this._warnThrottled('start_failed', 'Failed to start realtime sync', { error: String(err) });
      this._scheduleReconnect('start_failed');
    }
  }

  stop(): void {
    this._clearReconnectTimer();
    this._clearSubscriptionTimeout();
    this._subscribeInFlight = false;
    this._retryAttempt = 0;
    this._retryWindowStartedAt = null;
    this._channelGeneration++;
    this._lastOfflinePauseKey = null;

    if (this._channel) {
      this._removeChannelSafely(this._channel, this._channelKey, 'stop');
      this._channel = null;
    }

    if (this._channelKey) {
      debugRealtime('realtime_cleanup', {
        channelKey: this._channelKey,
        reason: 'stop',
      });
      this._channelKey = null;
    }

    this._setStatus('idle');
    this._connectedAt = null;
    debugRealtime('Realtime sync stopped');
  }

  destroy(): void {
    this.stop();
    this._userId = null;
    this._eventHistory = [];
    this._mergeQueue = [];
    this._mergeInProgress = false;
    this._totalEventsReceived = 0;
    this._totalConflictsDetected = 0;
    this._totalRowsMerged = 0;
    this._lastEventAt = null;
    this._refreshCallback = null;
    this._lastFailureReason = null;
    this._lastOfflinePauseKey = null;
    this._warningLogState.clear();
    if (this._connectivityUnsubscribe) {
      this._connectivityUnsubscribe();
      this._connectivityUnsubscribe = null;
    }
  }

  // ── Internal: Handle incoming change ────────────────────────

  private async _handleChange(table: string, payload: any): Promise<void> {
    const eventType = (payload?.eventType || payload?.type || 'UPDATE') as RealtimeEventType;
    const newRow = payload?.new || payload?.record || null;
    const oldRow = payload?.old || null;

    if (!newRow && eventType !== 'DELETE') {
      console.warn('[RealtimeSync] No new row in payload for', table);
      return;
    }

    // Important:
    // Do NOT skip by user_id. Realtime is intentionally scoped to the current
    // user's rows, so skipping by user_id would incorrectly discard valid
    // updates from the same user on another device/session.

    this._totalEventsReceived++;
    this._lastEventAt = new Date().toISOString();

    const rowForLabel = newRow || oldRow;
    const recordId = rowForLabel?.id || 'unknown';
    const recordName = getRecordName(rowForLabel, table);

    debugRealtime('Realtime row event received', {
      eventType,
      recordId,
      recordName,
      table,
    });

    const event: RealtimeEvent = {
      id: createRealtimeEventId(),
      table,
      type: eventType,
      recordId,
      recordName,
      timestamp: new Date().toISOString(),
      conflictDetected: false,
    };

    this._addEvent(event);

    this._mergeQueue.push({
      table,
      payload: rowForLabel,
      eventType,
      eventId: event.id,
    });

    if (!this._mergeInProgress) {
      await this._processMergeQueue();
    }
  }

  private async _processMergeQueue(): Promise<void> {
    this._mergeInProgress = true;

    try {
      while (this._mergeQueue.length > 0) {
        const item = this._mergeQueue.shift();
        if (!item) continue;

        try {
          await this._mergeRemoteRow(item.table, item.payload, item.eventType, item.eventId);
        } catch (err) {
          console.error(`[RealtimeSync] Merge error for ${item.table}:`, err);
        }
      }
    } finally {
      this._mergeInProgress = false;

      if (this._refreshCallback) {
        try {
          this._refreshCallback();
        } catch {}
      }
    }
  }

  private async _mergeRemoteRow(
    table: string,
    remoteRow: any,
    eventType: RealtimeEventType,
    eventId: string
  ): Promise<void> {
    const store = getStoreForTable(table);
    if (!store || !remoteRow) return;

    if (eventType === 'DELETE') {
      if (remoteRow.id) {
        await store.bulkUpsert([
          {
            ...remoteRow,
            deleted_at: remoteRow.deleted_at || new Date().toISOString(),
          },
        ]);
        this._totalRowsMerged++;
      }
      return;
    }

    try {
      const dirtyRows = await store.getDirty();
      const localDirty = Array.isArray(dirtyRows)
        ? dirtyRows.find((r: any) => r.id === remoteRow.id)
        : null;

      if (localDirty) {
        const { conflicts, safeRemoteRows } = detectConflictsForTable(
          table,
          [localDirty],
          [remoteRow],
          null
        );

        if (conflicts.length > 0) {
          savePendingConflicts(conflicts);
          notifyConflictListeners();
          this._totalConflictsDetected += conflicts.length;
          this._markEventConflict(eventId);

          console.warn(
            `[RealtimeSync] Conflict detected in ${table} for record ${remoteRow.id}`
          );
          return;
        }

        if (safeRemoteRows.length > 0) {
          await store.bulkUpsert(safeRemoteRows as any);
          this._totalRowsMerged++;
        }
        return;
      }

      await store.bulkUpsert([remoteRow] as any);
      this._totalRowsMerged++;
    } catch (err) {
      console.error(`[RealtimeSync] Error checking/merging ${table}:`, err);

      try {
        await store.bulkUpsert([remoteRow]);
        this._totalRowsMerged++;
      } catch (fallbackErr) {
        console.error(`[RealtimeSync] Fallback merge failed for ${table}:`, fallbackErr);
      }
    }
  }

  // ── Internal: Event history ─────────────────────────────────

  private _addEvent(event: RealtimeEvent): void {
    this._eventHistory.unshift(event);

    if (this._eventHistory.length > MAX_EVENT_HISTORY) {
      this._eventHistory.length = MAX_EVENT_HISTORY;
    }

    this._changeListeners.forEach((listener) => {
      try {
        listener(event);
      } catch {}
    });
  }

  private _markEventConflict(eventId: string): void {
    const match = this._eventHistory.find((e) => e.id === eventId);
    if (match) {
      match.conflictDetected = true;
    }
  }

  // ── Internal: Status / reconnect management ─────────────────

  private _setStatus(status: RealtimeStatus): void {
    if (this._status === status) return;
    this._status = status;

    this._statusListeners.forEach((listener) => {
      try {
        listener(status);
      } catch {}
    });
  }

  private _handleStartBlocked(reason: RealtimeFailureReason, message: string): void {
    this._lastFailureReason = reason;
    this._setStatus(
      reason === 'auth_missing' || reason === 'auth_session_invalid'
        ? 'idle'
        : reason === 'network_offline'
          ? 'offline_available'
          : 'degraded',
    );
    this._warnThrottled(reason, message, { reason });
  }

  private _handleAuthSessionFailure(
    reason: 'auth_session_error' | 'auth_session_invalid',
    channelKey: string,
    error: unknown,
  ): void {
    this._subscribeInFlight = false;
    this._clearSubscriptionTimeout();
    this._connectedAt = null;
    this._lastFailureReason = reason;
    this._setStatus('degraded');

    const errorDetails = summarizeRealtimeError(error);
    debugRealtime('realtime_auth_session_failure', {
      channelKey,
      permanent: reason === 'auth_session_invalid',
      reason,
      error: errorDetails,
    });
    if (reason === 'auth_session_invalid') {
      debugRealtime('realtime_permanent_auth_failure', {
        channelKey,
        reason,
      });
    }

    this._warnThrottled(reason, 'Realtime sync unavailable until session is refreshed', {
      channelKey,
      reason,
      error: errorDetails,
    });

    if (reason === 'auth_session_error') {
      this._scheduleReconnect(reason);
    }
  }

  private _handleChannelFailure(
    reason: RealtimeFailureReason,
    status: string,
    channelKey = this._channelKey,
    channelGeneration = this._channelGeneration,
    error?: unknown,
  ): void {
    if (channelGeneration !== this._channelGeneration || channelKey !== this._channelKey) {
      debugRealtime('realtime_stale_channel_failure_ignored', {
        channelKey,
        currentChannelKey: this._channelKey,
        reason,
        status,
      });
      return;
    }

    this._subscribeInFlight = false;
    this._clearSubscriptionTimeout();
    this._lastFailureReason = this._shouldPauseForOffline() ? 'network_offline' : reason;
    const hadConnected = !!this._connectedAt;
    this._connectedAt = null;

    const errorDetails = summarizeRealtimeError(error);
    const wasInitialSubscribe = !hadConnected && this._retryAttempt === 0;

    if (wasInitialSubscribe) {
      debugRealtime('realtime_initial_subscribe_failed', {
        channelKey,
        reason,
        status,
        error: errorDetails,
      });
    } else {
      debugRealtime('realtime_channel_failure', {
        attempt: this._retryAttempt,
        channelKey,
        reason,
        status,
        error: errorDetails,
      });
    }

    this._cleanupStaleChannel(reason, channelKey);

    if (this._lastFailureReason === 'network_offline') {
      this._setStatus('offline_available');
      this._debugOfflinePauseOnce(`channel:${status}`);
      return;
    }

    this._setStatus(reason === 'subscription_timeout' ? 'timed_out' : 'degraded');

    if (reason === 'subscription_timeout') {
      debugRealtime('realtime_subscribe_timeout', {
        channelKey,
        reason,
        status,
      });
    }

    this._warnThrottled(reason, `Realtime channel ${reason.replace(/_/g, ' ')}`, {
      channelKey,
      reason,
      status,
      error: errorDetails,
    });
    this._scheduleReconnect(reason);
  }

  private _scheduleReconnect(reason: RealtimeFailureReason): void {
    if (!this._enabled || !this._userId) return;

    if (this._shouldPauseForOffline()) {
      this._lastFailureReason = 'network_offline';
      this._clearReconnectTimer();
      this._setStatus('offline_available');
      this._debugOfflinePauseOnce(`schedule:${reason}`);
      return;
    }

    if (this._reconnectTimer) {
      debugRealtime('realtime_retry_skipped_duplicate', {
        channelKey: this._channelKey,
        reason,
      });
      return;
    }

    const now = Date.now();
    if (!this._retryWindowStartedAt || now - this._retryWindowStartedAt > RECONNECT_MAX_WINDOW_MS) {
      this._retryWindowStartedAt = now;
      this._retryAttempt = 0;
    }

    const attempt = this._retryAttempt + 1;
    if (attempt > RECONNECT_MAX_ATTEMPTS) {
      this._retryAttempt = attempt;
      this._setStatus('degraded');
      debugRealtime('realtime_degraded', {
        attempt,
        channelKey: this._channelKey,
        maxAttempts: RECONNECT_MAX_ATTEMPTS,
        reason,
      });
      this._warnThrottled(reason, 'Realtime sync degraded after repeated subscription failures', {
        channelKey: this._channelKey,
        maxAttempts: RECONNECT_MAX_ATTEMPTS,
        reason,
      });
      return;
    }

    const baseDelayMs = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this._retryAttempt),
      RECONNECT_MAX_DELAY_MS,
    );
    const jitterMs = Math.round(baseDelayMs * RECONNECT_JITTER_RATIO * Math.random());
    const delayMs = Math.min(RECONNECT_MAX_DELAY_MS, baseDelayMs + jitterMs);
    this._retryAttempt = attempt;
    this._setStatus('retrying');

    debugRealtime('realtime_retry_scheduled', {
      attempt,
      channelKey: this._channelKey,
      delayMs,
      reason,
    });

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;

      if (!this._enabled || !this._userId || this._status === 'subscribed') return;

      if (this._shouldPauseForOffline()) {
        this._lastFailureReason = 'network_offline';
        this._setStatus('offline_available');
        this._debugOfflinePauseOnce(`timer:${reason}`);
        return;
      }

      const userId = this._userId;
      debugRealtime('realtime_retry_started', {
        attempt,
        channelKey: this._channelKey,
        reason,
      });
      this.start(userId);
    }, delayMs);
  }

  private _ensureConnectivityListener(): void {
    if (this._connectivityUnsubscribe) return;

    this._connectivityUnsubscribe = connectivity.onStatusChange((status: ConnectivityStatus) => {
      if (status !== 'online') {
        this._lastFailureReason = 'network_offline';
        this._clearReconnectTimer();
        if (this._status !== 'idle') {
          this._setStatus('offline_available');
        }
        this._debugOfflinePauseOnce(`connectivity:${status}`);
        return;
      }

      if (
        this._enabled &&
        this._userId &&
        this._lastFailureReason === 'network_offline' &&
        this._status !== 'subscribed' &&
        this._status !== 'connecting'
      ) {
        this._scheduleReconnect('network_offline');
      }
    });
  }

  private _shouldPauseForOffline(): boolean {
    try {
      return connectivity.status !== 'online' && connectivity.getLevel() !== 'unknown';
    } catch {
      return false;
    }
  }

  private _debugOfflinePauseOnce(source: string): void {
    const key = `${this._channelKey || 'no-channel'}:${connectivity.status}:${source}`;
    if (this._lastOfflinePauseKey === key) return;
    this._lastOfflinePauseKey = key;
    debugRealtime('realtime_paused_offline', {
      channelKey: this._channelKey,
      connectivityStatus: connectivity.status,
      reason: 'network_offline',
      source,
    });
  }

  private _armSubscriptionTimeout(channelKey: string, channelGeneration: number): void {
    this._clearSubscriptionTimeout();
    this._subscriptionTimeoutTimer = setTimeout(() => {
      this._subscriptionTimeoutTimer = null;
      this._handleChannelFailure('subscription_timeout', 'TIMED_OUT', channelKey, channelGeneration);
    }, SUBSCRIPTION_TIMEOUT_MS);
  }

  private _clearSubscriptionTimeout(): void {
    if (this._subscriptionTimeoutTimer) {
      clearTimeout(this._subscriptionTimeoutTimer);
      this._subscriptionTimeoutTimer = null;
    }
  }

  private _cleanupStaleChannel(reason: RealtimeFailureReason, channelKey = this._channelKey): void {
    if (!this._channel) return;
    const currentChannel = this._channel;
    this._channel = null;
    this._subscribeInFlight = false;
    this._channelGeneration++;
    this._removeChannelSafely(currentChannel, channelKey, reason);
    debugRealtime('realtime_cleanup', {
      channelKey,
      reason,
    });
  }

  private _removeChannelSafely(channel: any, channelKey: string | null, reason: string): void {
    try {
      const removal = supabase.removeChannel(channel);
      if (removal && typeof (removal as Promise<unknown>).catch === 'function') {
        void (removal as Promise<unknown>).catch((err) => {
          this._warnThrottled('channel_closed', 'Error removing realtime channel', {
            channelKey,
            reason,
            error: summarizeRealtimeError(err),
          });
        });
      }
    } catch (err) {
      this._warnThrottled('channel_closed', 'Error removing realtime channel', {
        channelKey,
        reason,
        error: summarizeRealtimeError(err),
      });
    }
  }

  private _warnThrottled(
    reason: RealtimeFailureReason,
    message: string,
    details?: Record<string, unknown>,
  ): void {
    const now = Date.now();
    const state = this._warningLogState.get(reason);

    if (state && now - state.lastAt < REALTIME_WARNING_THROTTLE_MS) {
      state.suppressed += 1;
      return;
    }

    const suppressed = state?.suppressed ?? 0;
    this._warningLogState.set(reason, { lastAt: now, suppressed: 0 });
    console.warn('[RealtimeSync]', message, {
      ...details,
      ...(suppressed > 0 ? { suppressedRepeats: suppressed } : {}),
    });
  }

  private _clearReconnectTimer(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  // ── Diagnostics ─────────────────────────────────────────────

  clearEventHistory(): void {
    this._eventHistory = [];
  }
}

// ── Singleton ─────────────────────────────────────────────────

export const realtimeSync = new RealtimeSyncManager();
