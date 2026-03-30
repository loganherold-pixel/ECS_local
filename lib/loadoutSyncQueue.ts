/**
 * Loadout Reconciliation Sync Queue
 *
 * A dedicated retry queue for loadout record updates (weight/count reconciliation)
 * that failed their initial cloud sync attempt.
 *
 * When loadoutStore.update() persists weight/count locally but the cloud push
 * fails (network error, timeout, etc.), the failed update is enqueued here.
 * The queue retries with exponential backoff and auto-processes when
 * connectivity is restored.
 *
 * Features:
 * - Persistent queue (survives app restart via localStorage)
 * - Exponential backoff retry (1s, 2s, 4s, 8s, 16s)
 * - Auto-process on connectivity restore
 * - Per-loadout sync status tracking for UI indicators
 * - Coalescing: if a newer update arrives for the same loadout, the older
 *   entry is replaced (only the latest weight/count matters)
 * - Listener system for real-time UI updates (VehicleLoadoutSummary)
 *
 * Integrates with:
 * - loadoutStore.ts — enqueues failed reconciliation updates
 * - connectivity.ts — auto-retries when back online
 * - VehicleLoadoutSummary.tsx — displays sync status indicator
 */
import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import { connectivity } from './connectivity';

// ── Types ───────────────────────────────────────────────────

export type LoadoutSyncStatus = 'synced' | 'pending' | 'retrying' | 'failed';

export interface LoadoutSyncEntry {
  /** Loadout record ID */
  loadoutId: string;
  /** The changes that need to be pushed to cloud */
  changes: {
    total_weight_lbs: number | null;
    item_count: number;
    [key: string]: any;
  };
  /** User ID for the cloud update */
  userId: string;
  /** ISO timestamp of when the entry was created/last updated */
  createdAt: string;
  /** ISO timestamp of last retry attempt */
  lastAttemptAt: string | null;
  /** Number of retry attempts */
  retryCount: number;
  /** Maximum retries before marking as failed */
  maxRetries: number;
  /** Current status */
  status: LoadoutSyncStatus;
  /** Last error message */
  lastError: string | null;
}

type SyncStatusListener = (statuses: Map<string, LoadoutSyncStatus>) => void;

// ── Constants ───────────────────────────────────────────────

const STORAGE_KEY = 'ecs_loadout_sync_queue';
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const SUPABASE_TIMEOUT_MS = 8000;

// ── Timeout wrapper ─────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number = SUPABASE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Loadout sync timed out after ${ms}ms`));
    }, ms);
    promise
      .then((result) => { clearTimeout(timer); resolve(result); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

// ── Queue Manager ───────────────────────────────────────────

class LoadoutSyncQueue {
  private _entries: LoadoutSyncEntry[] = [];
  private _listeners = new Set<SyncStatusListener>();
  private _processing = false;
  private _processTimer: ReturnType<typeof setTimeout> | null = null;
  private _connectivityUnsub: (() => void) | null = null;

  constructor() {
    this._loadQueue();
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Enqueue a failed loadout reconciliation update for retry.
   * If an entry for the same loadoutId already exists, it is replaced
   * (coalesced) with the newer changes — only the latest weight/count matters.
   */
  enqueue(
    loadoutId: string,
    changes: { total_weight_lbs: number | null; item_count: number; [key: string]: any },
    userId: string,
  ): void {
    const now = new Date().toISOString();

    // Coalesce: replace existing entry for the same loadout
    const existingIdx = this._entries.findIndex(e => e.loadoutId === loadoutId);
    if (existingIdx !== -1) {
      this._entries[existingIdx] = {
        ...this._entries[existingIdx],
        changes,
        userId,
        createdAt: now,
        lastAttemptAt: null,
        retryCount: 0,
        status: 'pending',
        lastError: null,
      };
      console.log(`[LoadoutSyncQueue] Coalesced update for loadout ${loadoutId}`);
    } else {
      this._entries.push({
        loadoutId,
        changes,
        userId,
        createdAt: now,
        lastAttemptAt: null,
        retryCount: 0,
        maxRetries: MAX_RETRIES,
        status: 'pending',
        lastError: null,
      });
      console.log(`[LoadoutSyncQueue] Enqueued sync for loadout ${loadoutId}`);
    }

    this._saveQueue();
    this._notifyListeners();

    // Try to process immediately if online
    if (connectivity.isOnline() && !this._processing) {
      this._scheduleProcess(500);
    }
  }

  /**
   * Get the sync status for a specific loadout.
   * Returns 'synced' if the loadout has no pending entries in the queue.
   */
  getStatus(loadoutId: string): LoadoutSyncStatus {
    const entry = this._entries.find(e => e.loadoutId === loadoutId);
    if (!entry) return 'synced';
    return entry.status;
  }

  /**
   * Get all sync statuses as a Map (loadoutId → status).
   * Only includes loadouts that are NOT synced (i.e., have queue entries).
   */
  getAllStatuses(): Map<string, LoadoutSyncStatus> {
    const map = new Map<string, LoadoutSyncStatus>();
    for (const entry of this._entries) {
      map.set(entry.loadoutId, entry.status);
    }
    return map;
  }

  /** Number of pending/retrying entries */
  get pendingCount(): number {
    return this._entries.filter(e => e.status === 'pending' || e.status === 'retrying').length;
  }

  /** Number of failed entries */
  get failedCount(): number {
    return this._entries.filter(e => e.status === 'failed').length;
  }

  /** Whether the queue is currently processing */
  get isProcessing(): boolean {
    return this._processing;
  }

  /** Get all entries (read-only copy) */
  get entries(): LoadoutSyncEntry[] {
    return [...this._entries];
  }

  /**
   * Subscribe to sync status changes.
   * Listener receives a Map of loadoutId → LoadoutSyncStatus for all
   * non-synced entries whenever the queue changes.
   */
  onChange(listener: SyncStatusListener): () => void {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }

  /**
   * Remove a specific entry (e.g., after manual resolution).
   */
  remove(loadoutId: string): void {
    this._entries = this._entries.filter(e => e.loadoutId !== loadoutId);
    this._saveQueue();
    this._notifyListeners();
  }

  /**
   * Retry all failed entries.
   */
  retryFailed(): void {
    let changed = false;
    for (const entry of this._entries) {
      if (entry.status === 'failed') {
        entry.status = 'pending';
        entry.retryCount = 0;
        entry.lastError = null;
        changed = true;
      }
    }
    if (changed) {
      this._saveQueue();
      this._notifyListeners();
      if (connectivity.isOnline() && !this._processing) {
        this._scheduleProcess(200);
      }
    }
  }

  /**
   * Clear all entries.
   */
  clearAll(): void {
    this._entries = [];
    this._saveQueue();
    this._notifyListeners();
  }

  // ── Auto-Process on Connectivity ────────────────────────────

  /**
   * Start monitoring connectivity for auto-processing.
   * When the device comes back online, pending entries are retried.
   */
  startAutoProcess(): void {
    if (this._connectivityUnsub) return;

    this._connectivityUnsub = connectivity.onStatusChange((status, wasOffline) => {
      if (status === 'online' && wasOffline && this.pendingCount > 0) {
        console.log('[LoadoutSyncQueue] Back online — retrying pending loadout syncs...');
        this._scheduleProcess(800);
      }
    });

    // Process any pending items if already online
    if (connectivity.isOnline() && this.pendingCount > 0) {
      this._scheduleProcess(1500);
    }
  }

  /**
   * Stop auto-processing.
   */
  stopAutoProcess(): void {
    if (this._connectivityUnsub) {
      this._connectivityUnsub();
      this._connectivityUnsub = null;
    }
    if (this._processTimer) {
      clearTimeout(this._processTimer);
      this._processTimer = null;
    }
  }

  // ── Process Queue ───────────────────────────────────────────

  /**
   * Process all pending/retrying entries.
   * Each entry attempts a cloud update via Supabase.
   * On success, the entry is removed. On failure, it's retried with backoff.
   */
  async processQueue(): Promise<{ processed: number; failed: number; remaining: number }> {
    if (this._processing) {
      return { processed: 0, failed: 0, remaining: this.pendingCount };
    }

    if (!connectivity.isOnline()) {
      return { processed: 0, failed: 0, remaining: this.pendingCount };
    }

    if (!isSupabaseConfigured) {
      return { processed: 0, failed: 0, remaining: this.pendingCount };
    }

    this._processing = true;
    this._notifyListeners();

    let processed = 0;
    let failed = 0;

    const toProcess = this._entries.filter(
      e => e.status === 'pending' || e.status === 'retrying'
    );

    for (const entry of toProcess) {
      if (!connectivity.isOnline()) break;

      entry.status = 'retrying';
      entry.lastAttemptAt = new Date().toISOString();
      this._notifyListeners();

      try {
        const { error } = await withTimeout(
          supabase
            .from('loadouts')
            .update(entry.changes)
            .eq('id', entry.loadoutId)
        );

        if (error) {
          throw new Error(error.message || 'Supabase update error');
        }

        // Success — remove from queue and update local sync_status
        console.log(`[LoadoutSyncQueue] Successfully synced loadout ${entry.loadoutId}`);
        this._entries = this._entries.filter(e => e.loadoutId !== entry.loadoutId);

        // Also update the local loadout record's sync_status to 'synced'
        this._markLocalAsSynced(entry.loadoutId);

        processed++;
      } catch (err: any) {
        const errorMsg = err?.message || 'Unknown sync error';
        entry.lastError = errorMsg;
        entry.retryCount++;

        console.warn(
          `[LoadoutSyncQueue] Sync failed for loadout ${entry.loadoutId} ` +
          `(attempt ${entry.retryCount}/${entry.maxRetries}): ${errorMsg}`
        );

        if (entry.retryCount >= entry.maxRetries) {
          entry.status = 'failed';
          failed++;
        } else {
          entry.status = 'pending';
          // Schedule retry with exponential backoff
          const delay = Math.min(
            BASE_DELAY_MS * Math.pow(2, entry.retryCount),
            MAX_DELAY_MS,
          );
          this._scheduleProcess(delay);
        }
      }
    }

    this._processing = false;
    this._saveQueue();
    this._notifyListeners();

    // If there are more pending items, schedule another pass
    const remaining = this.pendingCount;
    if (remaining > 0 && connectivity.isOnline()) {
      const nextDelay = Math.min(
        BASE_DELAY_MS * Math.pow(2, Math.min(...toProcess.map(e => e.retryCount))),
        MAX_DELAY_MS,
      );
      this._scheduleProcess(nextDelay);
    }

    return { processed, failed, remaining };
  }

  // ── Private Methods ─────────────────────────────────────────

  /**
   * Update the local loadout record's sync_status to 'synced' after
   * a successful cloud push. This keeps the local store consistent
   * so VehicleLoadoutSummary shows the correct indicator.
   */
  private _markLocalAsSynced(loadoutId: string): void {
    try {
      const LS_LOADOUTS = 'ecs_local_loadouts';
      let raw: string | null = null;
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        raw = localStorage.getItem(LS_LOADOUTS);
      }
      if (!raw) return;

      const loadouts = JSON.parse(raw);
      if (!Array.isArray(loadouts)) return;

      const idx = loadouts.findIndex((l: any) => l.id === loadoutId);
      if (idx !== -1 && loadouts[idx].sync_status !== 'synced') {
        loadouts[idx].sync_status = 'synced';
        loadouts[idx].updated_at = new Date().toISOString();
        if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
          localStorage.setItem(LS_LOADOUTS, JSON.stringify(loadouts));
        }
      }
    } catch (e) {
      console.warn('[LoadoutSyncQueue] Failed to mark local as synced:', e);
    }
  }

  private _scheduleProcess(delayMs: number): void {
    if (this._processTimer) {
      clearTimeout(this._processTimer);
    }
    this._processTimer = setTimeout(() => {
      this._processTimer = null;
      this.processQueue();
    }, delayMs);
  }

  private _notifyListeners(): void {
    const statuses = this.getAllStatuses();
    this._listeners.forEach(listener => {
      try {
        listener(statuses);
      } catch (e) {
        console.warn('[LoadoutSyncQueue] Listener error:', e);
      }
    });
  }

  // ── Persistence ─────────────────────────────────────────────

  private _loadQueue(): void {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // Reset any 'retrying' status to 'pending' (app may have restarted mid-process)
            this._entries = parsed.map((e: LoadoutSyncEntry) => ({
              ...e,
              status: e.status === 'retrying' ? 'pending' : e.status,
            }));
          }
        }
      }
    } catch (e) {
      console.warn('[LoadoutSyncQueue] Failed to load queue:', e);
      this._entries = [];
    }
  }

  private _saveQueue(): void {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._entries));
      }
    } catch (e) {
      console.warn('[LoadoutSyncQueue] Failed to save queue:', e);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────

export const loadoutSyncQueue = new LoadoutSyncQueue();

