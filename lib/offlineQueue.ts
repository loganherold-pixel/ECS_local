/**
 * Offline Operation Queue
 *
 * Queues operations that require online access (map tiles, waypoint syncs,
 * geocoding requests) and processes them when connectivity is restored.
 *
 * Features:
 * - Persistent queue (survives app restart via IndexedDB + localStorage fallback)
 * - Priority levels (critical > normal > low)
 * - Automatic processing on reconnect
 * - Retry with backoff on failure
 * - Queue size limits to prevent memory issues
 * - FIFO processing with priority ordering
 * - Badge count exposed for UI indicators
 *
 * Persistence:
 * - Primary: IndexedDB ('offline_ops' store) for durable, structured storage
 * - Fallback: localStorage for environments without IndexedDB
 * - Automatic migration from localStorage → IndexedDB on first use
 */
import { Platform } from 'react-native';
import { connectivity } from './connectivity';
import { idbQueue } from './idbQueue';

export type QueuePriority = 'critical' | 'normal' | 'low';
export type QueueOperationType = 

  | 'waypoint_create'
  | 'waypoint_sync'
  | 'map_cache'
  | 'geocode'
  | 'sync_push'
  | 'sync_pull'
  | 'edge_function'
  | 'dashboard_change'
  | 'preset_save'
  | 'preset_delete'
  | 'expedition_update'
  | 'expedition_create'
  | 'expedition_delete'
  | 'loadout_change'
  | 'vehicle_config_change'
  | 'settings_change'
  | 'route_change';


export interface QueuedOperation {
  id: string;
  type: QueueOperationType;
  priority: QueuePriority;
  payload: any;
  createdAt: string;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
}

type QueueProcessor = (operation: QueuedOperation) => Promise<boolean>;
type QueueChangeListener = (queue: QueuedOperation[]) => void;

const MAX_QUEUE_SIZE = 500;
const MAX_RETRIES_DEFAULT = 3;

class OfflineQueue {
  private _queue: QueuedOperation[] = [];
  private _processors: Map<QueueOperationType, QueueProcessor> = new Map();
  private _listeners: Set<QueueChangeListener> = new Set();
  private _processing = false;
  private _connectivityUnsub: (() => void) | null = null;
  private _idbReady = false;

  constructor() {
    this._initPersistence();
  }

  /** Initialize persistence — load from IDB (async) with sync localStorage bootstrap */
  private async _initPersistence(): Promise<void> {
    // Synchronous bootstrap from localStorage for immediate availability
    this._loadQueueSync();

    // Then async upgrade to IndexedDB
    try {
      await idbQueue.ready;
      this._idbReady = true;
      const idbItems = await idbQueue.loadAll<QueuedOperation>('offline_ops');
      if (idbItems.length > 0) {
        // IDB has data — use it as source of truth
        this._queue = idbItems;
      } else if (this._queue.length > 0) {
        // localStorage had data but IDB didn't — migrate
        await idbQueue.saveAll('offline_ops', this._queue);
      }
    } catch (e) {
      console.warn('[OfflineQueue] IDB init failed, using localStorage:', e);
    }
  }

  /** Get current queue */
  get queue(): QueuedOperation[] {
    return [...this._queue];
  }

  /** Get queue size */
  get size(): number {
    return this._queue.length;
  }

  /** Whether the queue is currently processing */
  get isProcessing(): boolean {
    return this._processing;
  }

  /** Get count by type */
  countByType(type: QueueOperationType): number {
    return this._queue.filter(op => op.type === type).length;
  }

  /** Get count of pending waypoint operations */
  get pendingWaypoints(): number {
    return this._queue.filter(op => 
      op.type === 'waypoint_create' || op.type === 'waypoint_sync'
    ).length;
  }

  /** Get count of pending map operations */
  get pendingMapOps(): number {
    return this._queue.filter(op => 
      op.type === 'map_cache' || op.type === 'geocode'
    ).length;
  }

  /** Add an operation to the queue */
  enqueue(
    type: QueueOperationType,
    payload: any,
    priority: QueuePriority = 'normal',
    maxRetries: number = MAX_RETRIES_DEFAULT,
  ): string {
    // Check queue size limit
    if (this._queue.length >= MAX_QUEUE_SIZE) {
      // Remove oldest low-priority items
      const lowIdx = this._queue.findIndex(op => op.priority === 'low');
      if (lowIdx !== -1) {
        this._queue.splice(lowIdx, 1);
      } else {
        // Queue is full of normal/critical items
        console.warn('[OfflineQueue] Queue full, dropping oldest normal item');
        const normalIdx = this._queue.findIndex(op => op.priority === 'normal');
        if (normalIdx !== -1) this._queue.splice(normalIdx, 1);
      }
    }

    const id = `oq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const operation: QueuedOperation = {
      id,
      type,
      priority,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries,
    };

    // Insert by priority (critical first)
    const priorityOrder: Record<QueuePriority, number> = { critical: 0, normal: 1, low: 2 };
    const insertIdx = this._queue.findIndex(
      op => priorityOrder[op.priority] > priorityOrder[priority]
    );

    if (insertIdx === -1) {
      this._queue.push(operation);
    } else {
      this._queue.splice(insertIdx, 0, operation);
    }

    this._saveQueue();
    this._notifyListeners();

    // Try to process immediately if online
    if (connectivity.isOnline() && !this._processing) {
      this.processQueue();
    }

    return id;
  }

  /** Remove an operation from the queue */
  dequeue(id: string): void {
    this._queue = this._queue.filter(op => op.id !== id);
    this._saveQueue();
    this._notifyListeners();
  }

  /** Clear all operations of a specific type */
  clearType(type: QueueOperationType): void {
    this._queue = this._queue.filter(op => op.type !== type);
    this._saveQueue();
    this._notifyListeners();
  }

  /** Clear the entire queue */
  clearAll(): void {
    this._queue = [];
    this._saveQueue();
    this._notifyListeners();
  }

  /** Register a processor for a specific operation type */
  registerProcessor(type: QueueOperationType, processor: QueueProcessor): void {
    this._processors.set(type, processor);
  }

  /** Register a queue change listener */
  onChange(listener: QueueChangeListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Start auto-processing on connectivity changes */
  startAutoProcess(): void {
    if (this._connectivityUnsub) return;

    this._connectivityUnsub = connectivity.onStatusChange((status, wasOffline) => {
      if (status === 'online' && wasOffline && this._queue.length > 0) {
        console.log('[OfflineQueue] Back online, processing queued operations...');
        this.processQueue();
      }
    });
  }

  /** Stop auto-processing */
  stopAutoProcess(): void {
    if (this._connectivityUnsub) {
      this._connectivityUnsub();
      this._connectivityUnsub = null;
    }
  }

  /** Process all queued operations */
  async processQueue(): Promise<{ processed: number; failed: number; remaining: number }> {
    if (this._processing) return { processed: 0, failed: 0, remaining: this._queue.length };
    if (!connectivity.isOnline()) return { processed: 0, failed: 0, remaining: this._queue.length };

    this._processing = true;
    let processed = 0;
    let failed = 0;

    // Process in order (already sorted by priority)
    const toProcess = [...this._queue];

    for (const operation of toProcess) {
      if (!connectivity.isOnline()) break; // Stop if we go offline mid-processing

      const processor = this._processors.get(operation.type);
      if (!processor) {
        console.warn(`[OfflineQueue] No processor for type: ${operation.type}`);
        continue;
      }

      try {
        const success = await processor(operation);
        if (success) {
          this._queue = this._queue.filter(op => op.id !== operation.id);
          processed++;
        } else {
          operation.retryCount++;
          if (operation.retryCount >= operation.maxRetries) {
            operation.lastError = 'Max retries exceeded';
            this._queue = this._queue.filter(op => op.id !== operation.id);
            failed++;
          }
        }
      } catch (e: any) {
        operation.retryCount++;
        operation.lastError = e?.message || 'Unknown error';
        if (operation.retryCount >= operation.maxRetries) {
          this._queue = this._queue.filter(op => op.id !== operation.id);
          failed++;
        }
      }
    }

    this._processing = false;
    this._saveQueue();
    this._notifyListeners();

    return { processed, failed, remaining: this._queue.length };
  }

  // ── Persistence ──────────────────────────────────────

  /** Synchronous load from localStorage (bootstrap) */
  private _loadQueueSync(): void {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('ecs_offline_queue');
        if (raw) {
          this._queue = JSON.parse(raw);
        }
      }
    } catch (e) {
      console.warn('[OfflineQueue] Failed to load queue:', e);
      this._queue = [];
    }
  }

  /** Save queue to both IndexedDB and localStorage */
  private _saveQueue(): void {
    // Always save to localStorage (sync, immediate)
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem('ecs_offline_queue', JSON.stringify(this._queue));
      }
    } catch (e) {
      console.warn('[OfflineQueue] Failed to save queue to localStorage:', e);
    }

    // Also save to IndexedDB (async, durable)
    if (this._idbReady) {
      idbQueue.saveAll('offline_ops', this._queue).catch((e) => {
        console.warn('[OfflineQueue] Failed to save queue to IDB:', e);
      });
    }
  }

  private _notifyListeners(): void {
    this._listeners.forEach(listener => {
      try {
        listener(this._queue);
      } catch (e) {
        console.warn('[OfflineQueue] Listener error:', e);
      }
    });
  }
}

// Singleton instance
export const offlineQueue = new OfflineQueue();

