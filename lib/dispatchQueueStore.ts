// ============================================================
// ECS DISPATCH — OFFLINE EVENT QUEUE STORE
// ============================================================
// Stores pending dispatch events in localStorage when the user
// is offline. Provides methods to enqueue, dequeue, list, clear,
// and flush (send to the edge function) queued items.
//
// Integrates with the connectivity monitor for auto-flush on
// reconnect, and provides a listener pattern for UI updates.
//
// Queue items are persisted across app restarts.

import { Platform } from 'react-native';
import { connectivity } from './connectivity';
import { dispatchStore } from './dispatchStore';
import type { ComposeEventForm, DispatchEvent, DispatchEventType, DispatchPriority } from './dispatchTypes';

// ── Types ────────────────────────────────────────────────────

export type QueueItemStatus = 'pending' | 'sending' | 'failed';

export interface QueuedDispatchEvent {
  /** Unique queue item ID */
  id: string;
  /** Target expedition */
  expedition_id: string;
  /** The compose form data */
  form: ComposeEventForm;
  /** When the event was queued */
  queued_at: string;
  /** Current status */
  status: QueueItemStatus;
  /** Number of send attempts */
  retry_count: number;
  /** Maximum retries before marking as permanently failed */
  max_retries: number;
  /** Last error message (if any) */
  last_error: string | null;
  /** Last attempt timestamp */
  last_attempt_at: string | null;
}

export interface FlushResult {
  /** Number of events successfully sent */
  sent: number;
  /** Number of events that failed */
  failed: number;
  /** Number of events still pending */
  remaining: number;
  /** Errors encountered */
  errors: Array<{ id: string; error: string }>;
  /** Successfully created events (for UI insertion) */
  created: DispatchEvent[];
}

type QueueChangeListener = (queue: QueuedDispatchEvent[]) => void;
type FlushListener = (result: FlushResult) => void;

// ── Constants ────────────────────────────────────────────────

const STORAGE_KEY = 'ecs_dispatch_offline_queue';
const MAX_QUEUE_SIZE = 100;
const DEFAULT_MAX_RETRIES = 5;
const FLUSH_DELAY_MS = 2000; // Wait 2s after reconnect before flushing
const RETRY_BACKOFF_BASE_MS = 3000; // 3s base for exponential backoff

// ── Queue Manager Class ──────────────────────────────────────

class DispatchQueueManager {
  private _queue: QueuedDispatchEvent[] = [];
  private _listeners: Set<QueueChangeListener> = new Set();
  private _flushListeners: Set<FlushListener> = new Set();
  private _flushing = false;
  private _connectivityUnsub: (() => void) | null = null;
  private _flushTimer: ReturnType<typeof setTimeout> | null = null;
  private _initialized = false;

  constructor() {
    this._loadQueue();
  }

  // ── Public Getters ─────────────────────────────────────────

  /** Current queue (shallow copy) */
  get queue(): QueuedDispatchEvent[] {
    return [...this._queue];
  }

  /** Total queue size */
  get size(): number {
    return this._queue.length;
  }

  /** Number of pending items (not yet failed permanently) */
  get pendingCount(): number {
    return this._queue.filter(i => i.status !== 'failed' || i.retry_count < i.max_retries).length;
  }

  /** Number of failed items */
  get failedCount(): number {
    return this._queue.filter(i => i.status === 'failed' && i.retry_count >= i.max_retries).length;
  }

  /** Whether the queue is currently flushing */
  get isFlushing(): boolean {
    return this._flushing;
  }

  /** Get items for a specific expedition */
  getByExpedition(expeditionId: string): QueuedDispatchEvent[] {
    return this._queue.filter(i => i.expedition_id === expeditionId);
  }

  /** Count items for a specific expedition */
  countByExpedition(expeditionId: string): number {
    return this._queue.filter(i => i.expedition_id === expeditionId).length;
  }

  // ── Queue Operations ───────────────────────────────────────

  /**
   * Add a dispatch event to the offline queue.
   * Returns the queue item ID.
   */
  enqueue(
    expeditionId: string,
    form: ComposeEventForm,
    maxRetries: number = DEFAULT_MAX_RETRIES
  ): string {
    // Enforce queue size limit
    if (this._queue.length >= MAX_QUEUE_SIZE) {
      // Remove oldest failed items first
      const failedIdx = this._queue.findIndex(
        i => i.status === 'failed' && i.retry_count >= i.max_retries
      );
      if (failedIdx !== -1) {
        this._queue.splice(failedIdx, 1);
      } else {
        // Remove oldest pending item
        this._queue.shift();
      }
    }

    const id = `dq_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const item: QueuedDispatchEvent = {
      id,
      expedition_id: expeditionId,
      form: { ...form },
      queued_at: new Date().toISOString(),
      status: 'pending',
      retry_count: 0,
      max_retries: maxRetries,
      last_error: null,
      last_attempt_at: null,
    };

    this._queue.push(item);
    this._persist();
    this._notifyListeners();

    // If we're online, try to flush immediately
    if (connectivity.isOnline() && !this._flushing) {
      this._scheduleFlush(500);
    }

    return id;
  }

  /**
   * Remove a specific item from the queue.
   */
  dequeue(id: string): boolean {
    const before = this._queue.length;
    this._queue = this._queue.filter(i => i.id !== id);
    if (this._queue.length !== before) {
      this._persist();
      this._notifyListeners();
      return true;
    }
    return false;
  }

  /**
   * Remove all items for a specific expedition.
   */
  clearExpedition(expeditionId: string): number {
    const before = this._queue.length;
    this._queue = this._queue.filter(i => i.expedition_id !== expeditionId);
    const removed = before - this._queue.length;
    if (removed > 0) {
      this._persist();
      this._notifyListeners();
    }
    return removed;
  }

  /**
   * Remove all failed items.
   */
  clearFailed(): number {
    const before = this._queue.length;
    this._queue = this._queue.filter(
      i => !(i.status === 'failed' && i.retry_count >= i.max_retries)
    );
    const removed = before - this._queue.length;
    if (removed > 0) {
      this._persist();
      this._notifyListeners();
    }
    return removed;
  }

  /**
   * Clear the entire queue.
   */
  clearAll(): void {
    this._queue = [];
    this._persist();
    this._notifyListeners();
  }

  /**
   * Retry a specific failed item (reset status to pending).
   */
  retryItem(id: string): boolean {
    const item = this._queue.find(i => i.id === id);
    if (!item) return false;
    item.status = 'pending';
    item.retry_count = 0;
    item.last_error = null;
    item.last_attempt_at = null;
    this._persist();
    this._notifyListeners();

    // Try to flush if online
    if (connectivity.isOnline() && !this._flushing) {
      this._scheduleFlush(500);
    }

    return true;
  }

  /**
   * Retry all failed items.
   */
  retryAllFailed(): number {
    let count = 0;
    for (const item of this._queue) {
      if (item.status === 'failed') {
        item.status = 'pending';
        item.retry_count = 0;
        item.last_error = null;
        item.last_attempt_at = null;
        count++;
      }
    }
    if (count > 0) {
      this._persist();
      this._notifyListeners();
      if (connectivity.isOnline() && !this._flushing) {
        this._scheduleFlush(500);
      }
    }
    return count;
  }

  // ── Flush (Send to Server) ─────────────────────────────────

  /**
   * Flush all pending items by calling the dispatch-feed edge function.
   * Returns a FlushResult with details of what happened.
   */
  async flush(): Promise<FlushResult> {
    if (this._flushing) {
      return { sent: 0, failed: 0, remaining: this._queue.length, errors: [], created: [] };
    }
    if (!connectivity.isOnline()) {
      return { sent: 0, failed: 0, remaining: this._queue.length, errors: [], created: [] };
    }

    this._flushing = true;
    this._notifyListeners();

    const result: FlushResult = {
      sent: 0,
      failed: 0,
      remaining: 0,
      errors: [],
      created: [],
    };

    // Process items in order (FIFO)
    const toProcess = this._queue.filter(
      i => i.status === 'pending' || (i.status === 'failed' && i.retry_count < i.max_retries)
    );

    for (const item of toProcess) {
      if (!connectivity.isOnline()) break; // Stop if we go offline mid-flush

      // Mark as sending
      item.status = 'sending';
      item.last_attempt_at = new Date().toISOString();
      this._notifyListeners();

      try {
        const { data, error } = await dispatchStore.createEvent(
          item.expedition_id,
          item.form
        );

        if (error) {
          item.status = 'failed';
          item.retry_count++;
          item.last_error = error;
          result.errors.push({ id: item.id, error });

          if (item.retry_count >= item.max_retries) {
            result.failed++;
          }
        } else {
          // Success — remove from queue
          if (data) {
            result.created.push(data);
          }
          this._queue = this._queue.filter(i => i.id !== item.id);
          result.sent++;
        }
      } catch (err: any) {
        item.status = 'failed';
        item.retry_count++;
        item.last_error = err.message || 'Unknown error';
        result.errors.push({ id: item.id, error: item.last_error! });

        if (item.retry_count >= item.max_retries) {
          result.failed++;
        }
      }
    }

    result.remaining = this._queue.length;
    this._flushing = false;
    this._persist();
    this._notifyListeners();
    this._notifyFlushListeners(result);

    return result;
  }

  /**
   * Flush items for a specific expedition only.
   */
  async flushExpedition(expeditionId: string): Promise<FlushResult> {
    if (this._flushing || !connectivity.isOnline()) {
      return { sent: 0, failed: 0, remaining: this.countByExpedition(expeditionId), errors: [], created: [] };
    }

    this._flushing = true;
    this._notifyListeners();

    const result: FlushResult = {
      sent: 0,
      failed: 0,
      remaining: 0,
      errors: [],
      created: [],
    };

    const toProcess = this._queue.filter(
      i =>
        i.expedition_id === expeditionId &&
        (i.status === 'pending' || (i.status === 'failed' && i.retry_count < i.max_retries))
    );

    for (const item of toProcess) {
      if (!connectivity.isOnline()) break;

      item.status = 'sending';
      item.last_attempt_at = new Date().toISOString();
      this._notifyListeners();

      try {
        const { data, error } = await dispatchStore.createEvent(
          item.expedition_id,
          item.form
        );

        if (error) {
          item.status = 'failed';
          item.retry_count++;
          item.last_error = error;
          result.errors.push({ id: item.id, error });
          if (item.retry_count >= item.max_retries) result.failed++;
        } else {
          if (data) result.created.push(data);
          this._queue = this._queue.filter(i => i.id !== item.id);
          result.sent++;
        }
      } catch (err: any) {
        item.status = 'failed';
        item.retry_count++;
        item.last_error = err.message || 'Unknown error';
        result.errors.push({ id: item.id, error: item.last_error! });
        if (item.retry_count >= item.max_retries) result.failed++;
      }
    }

    result.remaining = this.countByExpedition(expeditionId);
    this._flushing = false;
    this._persist();
    this._notifyListeners();
    this._notifyFlushListeners(result);

    return result;
  }

  // ── Listeners ──────────────────────────────────────────────

  /** Register a queue change listener */
  onChange(listener: QueueChangeListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Register a flush result listener */
  onFlush(listener: FlushListener): () => void {
    this._flushListeners.add(listener);
    return () => this._flushListeners.delete(listener);
  }

  // ── Auto-Flush on Connectivity Restore ─────────────────────

  /** Start monitoring connectivity for auto-flush */
  startAutoFlush(): void {
    if (this._connectivityUnsub) return;

    this._connectivityUnsub = connectivity.onStatusChange((status, wasOffline) => {
      if (status === 'online' && wasOffline && this._queue.length > 0) {
        console.log('[DispatchQueue] Back online — scheduling auto-flush...');
        this._scheduleFlush(FLUSH_DELAY_MS);
      }
    });
  }

  /** Stop monitoring connectivity */
  stopAutoFlush(): void {
    if (this._connectivityUnsub) {
      this._connectivityUnsub();
      this._connectivityUnsub = null;
    }
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
  }

  // ── Private Methods ────────────────────────────────────────

  private _scheduleFlush(delayMs: number): void {
    if (this._flushTimer) clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this.flush().then((result) => {
        if (result.sent > 0) {
          console.log(`[DispatchQueue] Auto-flushed ${result.sent} events`);
        }
        if (result.errors.length > 0) {
          console.warn(`[DispatchQueue] ${result.errors.length} flush errors`);
        }
      }).catch((err) => {
        console.warn('[DispatchQueue] Auto-flush error:', err);
      });
    }, delayMs);
  }

  private _loadQueue(): void {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // Reset any items stuck in 'sending' state (from interrupted flush)
            this._queue = parsed.map((item: QueuedDispatchEvent) => ({
              ...item,
              status: item.status === 'sending' ? 'pending' : item.status,
            }));
          }
        }
      }
    } catch (e) {
      console.warn('[DispatchQueue] Failed to load queue:', e);
      this._queue = [];
    }
  }

  private _persist(): void {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._queue));
      }
    } catch (e) {
      console.warn('[DispatchQueue] Failed to persist queue:', e);
    }
  }

  private _notifyListeners(): void {
    const snapshot = [...this._queue];
    this._listeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch (e) {
        console.warn('[DispatchQueue] Listener error:', e);
      }
    });
  }

  private _notifyFlushListeners(result: FlushResult): void {
    this._flushListeners.forEach(listener => {
      try {
        listener(result);
      } catch (e) {
        console.warn('[DispatchQueue] Flush listener error:', e);
      }
    });
  }
}

// ── Singleton Export ──────────────────────────────────────────

export const dispatchQueue = new DispatchQueueManager();

