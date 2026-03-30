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

export type RealtimeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type RealtimeChangeListener = (event: RealtimeEvent) => void;
export type RealtimeStatusListener = (status: RealtimeStatus) => void;

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
const RECONNECT_DELAY_MS = 5000;

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
  private _status: RealtimeStatus = 'disconnected';
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
    this._enabled = enabled;
    setPersistedLiveSyncEnabled(enabled);

    if (enabled && this._userId && this._status === 'disconnected') {
      this.start(this._userId);
      return;
    }

    if (!enabled && this._status !== 'disconnected') {
      this.stop();
    }
  }

  // ── Start / Stop ────────────────────────────────────────────

  start(userId: string): void {
    if (!isSupabaseConfigured) {
      console.warn('[RealtimeSync] Supabase not configured — skipping');
      return;
    }

    if (!this._enabled) {
      console.log('[RealtimeSync] Live Sync disabled — skipping');
      return;
    }

    if (!userId) {
      console.warn('[RealtimeSync] No userId provided — skipping');
      return;
    }

    if (this._status === 'connected' || this._status === 'connecting') {
      console.log('[RealtimeSync] Already connected/connecting');
      return;
    }

    this._clearReconnectTimer();
    this._userId = userId;
    this._setStatus('connecting');

    try {
      const channel = supabase.channel(`ecs-realtime-sync:${userId}`, {
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

      channel.subscribe((status: string) => {
        console.log(`[RealtimeSync] Channel status: ${status}`);

        if (status === 'SUBSCRIBED') {
          this._setStatus('connected');
          this._connectedAt = new Date().toISOString();
          console.log(
            '[RealtimeSync] Connected — listening to',
            SUBSCRIBED_TABLES.length,
            'tables'
          );
          return;
        }

        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          this._setStatus('error');
          console.warn('[RealtimeSync] Channel error/closed');
          this._scheduleReconnect();
          return;
        }

        if (status === 'TIMED_OUT') {
          this._setStatus('error');
          console.warn('[RealtimeSync] Subscription timed out');
          this._scheduleReconnect();
        }
      });

      this._channel = channel;
    } catch (err) {
      console.error('[RealtimeSync] Failed to start:', err);
      this._setStatus('error');
      this._scheduleReconnect();
    }
  }

  stop(): void {
    this._clearReconnectTimer();

    if (this._channel) {
      try {
        void supabase.removeChannel(this._channel);
      } catch (err) {
        console.warn('[RealtimeSync] Error removing channel:', err);
      }
      this._channel = null;
    }

    this._setStatus('disconnected');
    this._connectedAt = null;
    console.log('[RealtimeSync] Stopped');
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

    console.log(`[RealtimeSync] ${eventType} on ${table}: ${recordName} (${recordId})`);

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
          await store.bulkUpsert(safeRemoteRows);
          this._totalRowsMerged++;
        }
        return;
      }

      await store.bulkUpsert([remoteRow]);
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

  private _scheduleReconnect(): void {
    if (!this._enabled || !this._userId) return;
    if (this._reconnectTimer) return;

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;

      if (!this._enabled || !this._userId || this._status === 'connected') return;

      console.log('[RealtimeSync] Auto-reconnecting...');
      this.stop();
      this.start(this._userId);
    }, RECONNECT_DELAY_MS);
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