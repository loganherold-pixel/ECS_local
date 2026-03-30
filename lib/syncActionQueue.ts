/**
 * Sync Action Queue — Offline-First Data Sync System
 *
 * Queues ALL user actions (dashboard changes, preset saves, expedition updates,
 * widget changes, settings) when offline and automatically syncs them to the
 * database when connectivity is restored.
 *
 * Architecture:
 * - Each user action is wrapped as a typed SyncAction
 * - Actions are persisted to IndexedDB immediately (survives app restart)
 *   with localStorage as synchronous fallback
 * - When online: actions execute immediately via registered processors
 * - When offline: actions queue up and auto-process on reconnect
 * - Priority system: critical > normal > low
 * - Intelligent retry with error-classified backoff strategies
 * - Listener system for real-time UI updates (SyncQueueIndicator)
 * - Conflict detection: detects same-entity mutations before replay
 *
 * Retry Classification (retryClassifier.ts):
 * - network_timeout → immediate retry (500ms, 5 attempts, 1.5x backoff)
 * - server_error    → standard backoff (2s, 3 attempts, 2x backoff + jitter)
 * - auth_expired    → refresh token then retry (1s, 2 attempts)
 * - rate_limited    → long backoff (10s, 3 attempts, 3x backoff + jitter)
 * - client_error    → permanent skip (4xx errors, payload is wrong)
 * - unrecoverable   → permanent skip (UUID errors, RLS violations)
 * - unknown         → conservative backoff (1.5s, 3 attempts, 2x + jitter)
 *
 * Persistence:
 * - Primary: IndexedDB ('sync_actions' + 'sync_history' stores)
 * - Fallback: localStorage for environments without IndexedDB
 * - Automatic migration from localStorage → IndexedDB on first use
 * - Dual-write: both stores updated on every mutation for resilience
 *
 * Error Recovery (invalid userId):
 * - enqueue() rejects actions with 'local' sentinel in user ID fields
 * - processQueue() auto-skips actions that fail with UUID parse errors
 * - purgeLocalSentinelActions() cleans up any poisoned actions on startup
 * - _loadQueue() runs purge automatically when restoring from storage
 * - All skips/purges are reported to syncSkipAlertStore for user notification
 *
 * Conflict Resolution:
 * - processQueue() runs conflict detection before replaying actions
 * - If conflicts are found, they are registered with conflictResolver
 * - Conflicting actions are held until the user resolves them
 * - Non-conflicting actions continue to process normally
 *
 * Integrates with:
 * - connectivity.ts for online/offline detection
 * - idbQueue.ts for IndexedDB persistence
 * - retryClassifier.ts for intelligent error categorization & retry strategies
 * - conflictResolver.ts for same-entity conflict detection
 * - offlineQueue.ts for lower-level queue operations
 * - dashboardStore.ts for dashboard action interception
 * - AppContext.tsx for initialization and state exposure
 * - syncSkipAlertStore.ts for user-facing skip notifications
 */
import { Platform } from 'react-native';
import { connectivity } from './connectivity';
import { idbQueue } from './idbQueue';
import { conflictResolver } from './conflictResolver';
import {
  classifyError,
  attemptAuthRefresh,
  extractRetryAfter,
  type ErrorCategory,
  ERROR_CATEGORY_LABELS,
} from './retryClassifier';




export type SyncActionType =
  | 'dashboard_layout_change'
  | 'dashboard_widget_assign'
  | 'dashboard_widget_remove'
  | 'dashboard_widget_resize'
  | 'dashboard_widget_swap'
  | 'dashboard_preset_save'
  | 'dashboard_preset_delete'
  | 'dashboard_preset_apply'
  | 'dashboard_settings_change'
  | 'expedition_create'
  | 'expedition_update'
  | 'expedition_delete'
  | 'expedition_activate'
  | 'expedition_complete'
  | 'expedition_archive'
  | 'expedition_readiness_update'
  | 'checklist_add'
  | 'checklist_toggle'
  | 'checklist_remove'
  | 'checklist_generate'
  | 'field_log_create'
  | 'field_log_remove'
  | 'waypoint_create'
  | 'waypoint_delete'
  | 'waypoint_change'
  | 'route_command_create'
  | 'route_command_update'
  | 'loadout_create'
  | 'loadout_update'
  | 'loadout_delete'
  | 'loadout_duplicate'
  | 'loadout_item_create'
  | 'loadout_item_update'
  | 'loadout_item_delete'
  | 'loadout_sync'
  | 'loadout_change'
  | 'route_import'
  | 'route_set_active'
  | 'route_deactivate_all'
  | 'route_delete'
  | 'route_update'
  | 'route_waypoint_rename'
  | 'route_waypoint_type'
  | 'route_waypoint_bulk_type'
  | 'route_waypoint_delete'
  | 'route_waypoint_reorder'
  | 'route_waypoint_add'
  | 'route_change'
  | 'vehicle_config_change'
  | 'user_settings_change'
  | 'generic_sync';

export type SyncActionPriority = 'critical' | 'normal' | 'low';

export type SyncActionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';

export interface SyncAction {
  /** Unique action ID */
  id: string;
  /** Action type for routing to processors */
  type: SyncActionType;
  /** Priority level */
  priority: SyncActionPriority;
  /** Action payload (serializable) */
  payload: Record<string, any>;
  /** Human-readable description for UI */
  description: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** Current status */
  status: SyncActionStatus;
  /** Number of retry attempts */
  retryCount: number;
  /** Maximum retries before giving up */
  maxRetries: number;
  /** Last error message if failed */
  lastError?: string;
  /** Whether this action was applied locally already */
  appliedLocally: boolean;
  /** Classified error category from the retry classifier (set on failure) */
  errorCategory?: ErrorCategory;
  /** HTTP status code from the last error (set on failure) */
  lastHttpStatus?: number;
}


// ── Category labels for UI grouping ───────────────────────────

export const ACTION_CATEGORY_MAP: Record<SyncActionType, string> = {
  dashboard_layout_change: 'Dashboard',
  dashboard_widget_assign: 'Dashboard',
  dashboard_widget_remove: 'Dashboard',
  dashboard_widget_resize: 'Dashboard',
  dashboard_widget_swap: 'Dashboard',
  dashboard_preset_save: 'Presets',
  dashboard_preset_delete: 'Presets',
  dashboard_preset_apply: 'Dashboard',
  dashboard_settings_change: 'Settings',
  expedition_create: 'Expeditions',
  expedition_update: 'Expeditions',
  expedition_delete: 'Expeditions',
  expedition_activate: 'Expeditions',
  expedition_complete: 'Expeditions',
  expedition_archive: 'Expeditions',
  expedition_readiness_update: 'Expeditions',
  checklist_add: 'Checklists',
  checklist_toggle: 'Checklists',
  checklist_remove: 'Checklists',
  checklist_generate: 'Checklists',
  field_log_create: 'Field Logs',
  field_log_remove: 'Field Logs',
  waypoint_create: 'Waypoints',
  waypoint_delete: 'Waypoints',
  waypoint_change: 'Waypoints',
  route_command_create: 'Routes',
  route_command_update: 'Routes',
  loadout_create: 'Loadouts',
  loadout_update: 'Loadouts',
  loadout_delete: 'Loadouts',
  loadout_duplicate: 'Loadouts',
  loadout_item_create: 'Loadouts',
  loadout_item_update: 'Loadouts',
  loadout_item_delete: 'Loadouts',
  loadout_sync: 'Loadouts',
  loadout_change: 'Loadouts',
  route_import: 'Routes',
  route_set_active: 'Routes',
  route_deactivate_all: 'Routes',
  route_delete: 'Routes',
  route_update: 'Routes',
  route_waypoint_rename: 'Routes',
  route_waypoint_type: 'Routes',
  route_waypoint_bulk_type: 'Routes',
  route_waypoint_delete: 'Routes',
  route_waypoint_reorder: 'Routes',
  route_waypoint_add: 'Routes',
  route_change: 'Routes',
  vehicle_config_change: 'Vehicle',
  user_settings_change: 'Settings',
  generic_sync: 'General',
};

export const ACTION_ICON_MAP: Record<SyncActionType, string> = {
  dashboard_layout_change: 'grid-outline',
  dashboard_widget_assign: 'add-circle-outline',
  dashboard_widget_remove: 'remove-circle-outline',
  dashboard_widget_resize: 'resize-outline',
  dashboard_widget_swap: 'swap-horizontal-outline',
  dashboard_preset_save: 'bookmark-outline',
  dashboard_preset_delete: 'trash-outline',
  dashboard_preset_apply: 'copy-outline',
  dashboard_settings_change: 'settings-outline',
  expedition_create: 'compass-outline',
  expedition_update: 'create-outline',
  expedition_delete: 'trash-outline',
  expedition_activate: 'play-outline',
  expedition_complete: 'checkmark-done-outline',
  expedition_archive: 'archive-outline',
  expedition_readiness_update: 'shield-checkmark-outline',
  checklist_add: 'checkbox-outline',
  checklist_toggle: 'checkmark-circle-outline',
  checklist_remove: 'close-circle-outline',
  checklist_generate: 'list-outline',
  field_log_create: 'journal-outline',
  field_log_remove: 'trash-outline',
  waypoint_create: 'pin-outline',
  waypoint_delete: 'trash-outline',
  waypoint_change: 'location-outline',
  route_command_create: 'navigate-outline',
  route_command_update: 'create-outline',
  loadout_create: 'cube-outline',
  loadout_update: 'create-outline',
  loadout_delete: 'trash-outline',
  loadout_duplicate: 'copy-outline',
  loadout_item_create: 'add-outline',
  loadout_item_update: 'create-outline',
  loadout_item_delete: 'remove-outline',
  loadout_sync: 'cloud-upload-outline',
  loadout_change: 'cube-outline',
  route_import: 'download-outline',
  route_set_active: 'radio-button-on-outline',
  route_deactivate_all: 'radio-button-off-outline',
  route_delete: 'trash-outline',
  route_update: 'create-outline',
  route_waypoint_rename: 'text-outline',
  route_waypoint_type: 'pricetag-outline',
  route_waypoint_bulk_type: 'pricetags-outline',
  route_waypoint_delete: 'remove-circle-outline',
  route_waypoint_reorder: 'reorder-four-outline',
  route_waypoint_add: 'add-circle-outline',
  route_change: 'map-outline',
  vehicle_config_change: 'car-outline',
  user_settings_change: 'person-outline',
  generic_sync: 'sync-outline',
};



// ── Queue State ───────────────────────────────────────────────

export type QueueSyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'partial';

export interface QueueStats {
  /** Current queue status */
  status: QueueSyncStatus;
  /** Number of pending actions */
  pendingCount: number;
  /** Number of failed actions */
  failedCount: number;
  /** Number of actions currently processing */
  processingCount: number;
  /** Total actions processed since app start */
  totalProcessed: number;
  /** Total actions failed since app start */
  totalFailed: number;
  /** Last successful sync timestamp */
  lastSyncAt: string | null;
  /** Last error message */
  lastError: string | null;
  /** Whether the device is online */
  isOnline: boolean;
  /** Breakdown of pending actions by category */
  pendingByCategory: Record<string, number>;
  /** Recent action history (last 20) */
  recentActions: SyncAction[];
  /** Whether IndexedDB is being used for persistence */
  persistenceBackend: 'indexeddb' | 'localstorage';
}

// ── Listener Types ────────────────────────────────────────────

type QueueChangeListener = (stats: QueueStats) => void;
type ActionProcessor = (action: SyncAction) => Promise<boolean>;

// ── Constants ─────────────────────────────────────────────────

const MAX_QUEUE_SIZE = 200;
const MAX_HISTORY_SIZE = 50;
const MAX_RETRIES_DEFAULT = 3;
const RETRY_BASE_DELAY_MS = 1500;
const PROCESS_BATCH_SIZE = 10;

// ── Sentinel / Error Detection Utilities ──────────────────────
// These run at the queue level as a safety net. The primary guards
// live in individual stores (isSyncableUserId) and in syncProcessors.ts
// (hasLocalUserSentinel). These catch anything that slips through.

/** Common field names that hold user IDs across all store payloads */
const USER_ID_FIELDS = ['userId', 'user_id', 'owner_user_id', 'ownerUserId'];

/**
 * Check if a sync action payload contains the 'local' sentinel as a user ID.
 * Actions with 'local' user IDs cannot be synced to the database because
 * 'local' is not a valid UUID and will cause a Postgres parse error.
 */
function actionHasLocalSentinel(action: SyncAction): boolean {
  const p = action.payload;
  if (!p) return false;

  for (const field of USER_ID_FIELDS) {
    const val = p[field];
    if (val === 'local' || val === 'anonymous' || val === 'offline') return true;
  }

  // Check nested objects (e.g., payload.changes.owner_user_id, payload.data.userId)
  for (const key of ['changes', 'data', 'record', 'item']) {
    const nested = p[key];
    if (nested && typeof nested === 'object') {
      for (const field of USER_ID_FIELDS) {
        if ((nested as any)[field] === 'local') return true;
      }
    }
  }

  return false;
}

/**
 * Detect errors that indicate an invalid user ID was sent to the database.
 * These errors are NOT retryable — the payload itself is malformed, so
 * retrying will always produce the same error.
 *
 * Known patterns from Postgres/Supabase:
 * - "invalid input syntax for type uuid: 'local'"
 * - "invalid input syntax for type uuid: 'anonymous'"
 * - "violates foreign key constraint" (when 'local' doesn't exist in auth.users)
 * - "new row violates row-level security policy" (RLS rejects non-UUID owner)
 */
const UNRECOVERABLE_ERROR_PATTERNS = [
  'invalid input syntax for type uuid',
  'invalid input syntax for uuid',
  'not a valid uuid',
  'violates foreign key constraint',
  'violates row-level security policy',
  'owner_user_id',  // Specific field name in error context
];

function isUnrecoverableUserIdError(errorMsg: string): boolean {
  if (!errorMsg) return false;
  const lower = errorMsg.toLowerCase();
  return UNRECOVERABLE_ERROR_PATTERNS.some(pattern => lower.includes(pattern));
}

// ── Generate unique ID ────────────────────────────────────────

function generateActionId(): string {
  return `sa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}


// ── Sync Action Queue Manager ─────────────────────────────────

class SyncActionQueue {
  private _queue: SyncAction[] = [];
  private _history: SyncAction[] = [];
  private _processors = new Map<SyncActionType, ActionProcessor>();
  private _listeners = new Set<QueueChangeListener>();
  private _processing = false;
  private _connectivityUnsub: (() => void) | null = null;
  private _totalProcessed = 0;
  private _totalFailed = 0;
  private _lastSyncAt: string | null = null;
  private _lastError: string | null = null;
  private _processTimer: ReturnType<typeof setTimeout> | null = null;
  private _idbReady = false;
  /** Prevents concurrent auth refresh attempts across multiple failing actions */
  private _authRefreshInProgress = false;
  /** Whether an auth refresh has already been attempted in this processing cycle */
  private _authRefreshedThisCycle = false;

  constructor() {
    // Synchronous bootstrap from localStorage for immediate availability
    this._loadQueueSync();
    this._loadHistorySync();

    // Async upgrade to IndexedDB
    this._initIDB();
  }

  /** Initialize IndexedDB persistence (async) */
  private async _initIDB(): Promise<void> {
    try {
      await idbQueue.ready;
      this._idbReady = true;

      // Load from IDB — if it has data, use it as source of truth
      const idbActions = await idbQueue.loadAll<SyncAction>('sync_actions');
      if (idbActions.length > 0) {
        this._queue = idbActions.map((a: SyncAction) => ({
          ...a,
          status: a.status === 'processing' ? 'pending' : a.status,
        }));
      } else if (this._queue.length > 0) {
        // localStorage had data but IDB didn't — migrate
        await idbQueue.saveAll('sync_actions', this._queue);
      }

      const idbHistory = await idbQueue.loadAll<SyncAction>('sync_history');
      if (idbHistory.length > 0) {
        this._history = idbHistory.slice(-MAX_HISTORY_SIZE);
      } else if (this._history.length > 0) {
        await idbQueue.saveAll('sync_history', this._history);
      }

      // Run startup purge after IDB load
      if (this._queue.length > 0) {
        const sentinelPurged = this.purgeLocalSentinelActions();
        const failedPurged = this.purgeFailedUserIdErrors();
        if (sentinelPurged > 0 || failedPurged > 0) {
          console.log(
            `[SyncActionQueue] Startup cleanup: ${sentinelPurged} sentinel + ${failedPurged} failed UUID actions removed`
          );
        }
      }

      this._notifyListeners();
    } catch (e) {
      console.warn('[SyncActionQueue] IDB init failed, using localStorage:', e);
    }
  }

  // ── Public Getters ──────────────────────────────────────────

  /** Current pending queue */
  get queue(): SyncAction[] {
    return [...this._queue];
  }

  /** Number of pending actions */
  get pendingCount(): number {
    return this._queue.filter(a => a.status === 'pending' || a.status === 'retrying').length;
  }

  /** Number of failed actions */
  get failedCount(): number {
    return this._queue.filter(a => a.status === 'failed').length;
  }

  /** Whether the queue is currently processing */
  get isProcessing(): boolean {
    return this._processing;
  }

  /** Get full queue statistics */
  get stats(): QueueStats {
    const pending = this._queue.filter(a => a.status === 'pending' || a.status === 'retrying');
    const failed = this._queue.filter(a => a.status === 'failed');
    const processing = this._queue.filter(a => a.status === 'processing');

    // Build category breakdown
    const pendingByCategory: Record<string, number> = {};
    for (const action of pending) {
      const cat = ACTION_CATEGORY_MAP[action.type] || 'General';
      pendingByCategory[cat] = (pendingByCategory[cat] || 0) + 1;
    }

    return {
      status: this._getStatus(),
      pendingCount: pending.length,
      failedCount: failed.length,
      processingCount: processing.length,
      totalProcessed: this._totalProcessed,
      totalFailed: this._totalFailed,
      lastSyncAt: this._lastSyncAt,
      lastError: this._lastError,
      isOnline: connectivity.isOnline(),
      pendingByCategory,
      recentActions: [...this._history].reverse().slice(0, 20),
      persistenceBackend: this._idbReady && idbQueue.isUsingIDB ? 'indexeddb' : 'localstorage',
    };
  }

  // ── Enqueue Action ──────────────────────────────────────────

  /**
   * Queue a user action for sync.
   * If online, processes immediately. If offline, queues for later.
   *
   * @param type - Action type
   * @param payload - Serializable action data
   * @param description - Human-readable description
   * @param priority - Priority level (default: 'normal')
   * @returns The created action ID
   */
  enqueue(
    type: SyncActionType,
    payload: Record<string, any>,
    description: string,
    priority: SyncActionPriority = 'normal',
  ): string {
    // ── Pre-flight guard: reject actions with 'local' sentinel ──
    // This is the first line of defense. If a store accidentally queues
    // an action with owner_user_id='local', we catch it here before it
    // ever enters the persistent queue. The action's local side-effect
    // has already been applied, so we just skip the cloud sync.
    const tempAction = { payload } as SyncAction;
    if (actionHasLocalSentinel(tempAction)) {
      const skippedId = generateActionId();
      console.warn(
        `[SyncActionQueue] BLOCKED enqueue of ${type} (${skippedId}) — ` +
        `payload contains 'local' sentinel user ID. ` +
        `Local changes preserved; cloud sync skipped.`
      );
      return skippedId; // Return a valid-looking ID so callers don't break
    }

    // Enforce queue size limit
    if (this._queue.length >= MAX_QUEUE_SIZE) {

      // Remove oldest low-priority completed/failed items
      const removeIdx = this._queue.findIndex(a => a.priority === 'low' && a.status === 'failed');
      if (removeIdx !== -1) {
        this._queue.splice(removeIdx, 1);
      } else {
        // Remove oldest pending low-priority
        const lowIdx = this._queue.findIndex(a => a.priority === 'low');
        if (lowIdx !== -1) this._queue.splice(lowIdx, 1);
      }
    }

    const action: SyncAction = {
      id: generateActionId(),
      type,
      priority,
      payload,
      description,
      createdAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
      maxRetries: MAX_RETRIES_DEFAULT,
      appliedLocally: true, // Local state already updated by the caller
    };

    // Insert by priority
    const priorityOrder: Record<SyncActionPriority, number> = { critical: 0, normal: 1, low: 2 };
    const insertIdx = this._queue.findIndex(
      a => priorityOrder[a.priority] > priorityOrder[priority]
    );

    if (insertIdx === -1) {
      this._queue.push(action);
    } else {
      this._queue.splice(insertIdx, 0, action);
    }

    this._saveQueue();
    this._notifyListeners();

    // Try to process immediately if online
    if (connectivity.isOnline() && !this._processing) {
      this._scheduleProcess(100); // Small delay to batch rapid actions
    }

    return action.id;
  }

  // ── Remove Action ───────────────────────────────────────────

  /** Remove a specific action from the queue */
  remove(actionId: string): void {
    this._queue = this._queue.filter(a => a.id !== actionId);
    this._saveQueue();
    this._notifyListeners();
  }

  /** Clear all failed actions */
  clearFailed(): void {
    this._queue = this._queue.filter(a => a.status !== 'failed');
    this._saveQueue();
    this._notifyListeners();
  }

  /** Clear entire queue */
  clearAll(): void {
    this._queue = [];
    this._saveQueue();
    this._notifyListeners();
  }

  /** Retry all failed actions */
  retryFailed(): void {
    for (const action of this._queue) {
      if (action.status === 'failed') {
        action.status = 'retrying';
        action.retryCount = 0;
        action.lastError = undefined;
      }
    }
    this._saveQueue();
    this._notifyListeners();

    if (connectivity.isOnline() && !this._processing) {
      this._scheduleProcess(100);
    }
  }

  // ── Register Processor ──────────────────────────────────────

  /**
   * Register a processor function for a specific action type.
   * The processor receives the action and returns true on success.
   */
  registerProcessor(type: SyncActionType, processor: ActionProcessor): void {
    this._processors.set(type, processor);
  }

  // ── Listener Management ─────────────────────────────────────

  /** Subscribe to queue changes */
  onChange(listener: QueueChangeListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  // ── Auto-Process on Connectivity ────────────────────────────

  /** Start monitoring connectivity for auto-processing */
  startAutoProcess(): void {
    if (this._connectivityUnsub) return;

    this._connectivityUnsub = connectivity.onStatusChange((status, wasOffline) => {
      if (status === 'online' && wasOffline && this.pendingCount > 0) {
        console.log('[SyncActionQueue] Back online — processing queued actions...');
        this._scheduleProcess(500); // Small delay to let connection stabilize
      }
    });

    // Process any pending items if we're already online
    if (connectivity.isOnline() && this.pendingCount > 0) {
      this._scheduleProcess(1000);
    }
  }

  /** Stop auto-processing */
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

  /** Process all pending actions in the queue */
  async processQueue(): Promise<{ processed: number; failed: number; remaining: number }> {
    if (this._processing) {
      return { processed: 0, failed: 0, remaining: this.pendingCount };
    }

    if (!connectivity.isOnline()) {
      this._notifyListeners();
      return { processed: 0, failed: 0, remaining: this.pendingCount };
    }

    this._processing = true;
    this._authRefreshedThisCycle = false; // Reset per-cycle auth refresh tracking
    this._notifyListeners();

    // Conflicting actions are held back until the user resolves them.
    let conflictingActionIds = new Set<string>();
    try {
      const newConflicts = conflictResolver.detectConflicts(this._queue);
      if (newConflicts.length > 0) {
        console.warn(
          `[SyncActionQueue] Detected ${newConflicts.length} queue conflict(s) — ` +
          `holding conflicting actions for user resolution`
        );
        // Collect IDs of all actions involved in pending conflicts
        for (const conflict of conflictResolver.pendingConflicts) {
          conflictingActionIds.add(conflict.actionA.id);
          conflictingActionIds.add(conflict.actionB.id);
        }
      }
    } catch (e) {
      console.warn('[SyncActionQueue] Conflict detection error (non-fatal):', e);
    }

    let processed = 0;
    let failed = 0;

    // Process in batches — exclude actions involved in unresolved conflicts
    const toProcess = this._queue.filter(
      a => (a.status === 'pending' || a.status === 'retrying') &&
           !conflictingActionIds.has(a.id)
    ).slice(0, PROCESS_BATCH_SIZE);

    for (const action of toProcess) {
      if (!connectivity.isOnline()) break;

      const processor = this._processors.get(action.type);

      if (!processor) {
        // No processor registered — mark as completed (local-only action)
        action.status = 'completed';
        this._addToHistory(action);
        this._queue = this._queue.filter(a => a.id !== action.id);
        processed++;
        this._totalProcessed++;
        continue;
      }

      action.status = 'processing';
      this._notifyListeners();

      try {
        const success = await processor(action);

        if (success) {
          action.status = 'completed';
          action.errorCategory = undefined;
          action.lastHttpStatus = undefined;
          this._addToHistory(action);
          this._queue = this._queue.filter(a => a.id !== action.id);
          processed++;
          this._totalProcessed++;
        } else {
          // Processor returned false (soft failure) — classify as unknown
          // and use the standard retry strategy for unknown errors
          const classification = classifyError(
            { message: action.lastError || 'Processor returned false' },
            action.retryCount
          );
          action.errorCategory = classification.category;
          action.retryCount++;

          // Use category-specific maxRetries (override the default)
          const effectiveMaxRetries = Math.max(
            action.maxRetries,
            classification.strategy.maxRetries
          );

          if (action.retryCount >= effectiveMaxRetries) {
            action.status = 'failed';
            action.lastError = action.lastError || 'Max retries exceeded';
            failed++;
            this._totalFailed++;
          } else {
            action.status = 'retrying';
            this._scheduleProcess(classification.suggestedDelayMs || RETRY_BASE_DELAY_MS);
          }
        }
      } catch (err: any) {
        const errorMsg = err?.message || 'Unknown error';
        action.lastError = errorMsg;
        this._lastError = errorMsg;

        // ── Classify the error using the retry classifier ──
        const classification = classifyError(err, action.retryCount);
        action.errorCategory = classification.category;
        action.lastHttpStatus = classification.httpStatus;

        const catLabel = ERROR_CATEGORY_LABELS[classification.category] || classification.category;

        console.warn(
          `[SyncActionQueue] Error on ${action.id} (${action.type}): ` +
          `[${catLabel}] ${errorMsg}` +
          (classification.httpStatus ? ` (HTTP ${classification.httpStatus})` : '') +
          ` — ${classification.strategy.description}`
        );

        // ── Legacy guard: detect local sentinel payloads ──
        // This runs before the classifier's decision as a safety net.
        if (actionHasLocalSentinel(action)) {
          console.error(
            `[SyncActionQueue] Payload contains 'local' sentinel — auto-skipping ${action.id}`
          );
          action.status = 'completed';
          action.lastError = `Auto-skipped: local sentinel in payload`;
          action.errorCategory = 'unrecoverable';
          this._addToHistory(action);
          this._queue = this._queue.filter(a => a.id !== action.id);
          processed++;
          this._totalProcessed++;
          continue;
        }

        // ── Handle by error category ──

        if (classification.isPermanent) {
          // ── PERMANENT: client_error (4xx) or unrecoverable ──
          // These errors will never succeed on retry. Skip permanently.
          console.error(
            `[SyncActionQueue] PERMANENT SKIP on ${action.id} (${catLabel}): ${errorMsg}. ` +
            `Local changes preserved; cloud sync abandoned.`
          );
          action.status = 'completed';
          action.lastError = `Skipped [${catLabel}]: ${errorMsg}`;
          this._addToHistory(action);
          this._queue = this._queue.filter(a => a.id !== action.id);
          processed++;
          this._totalProcessed++;
          continue;
        }

        if (classification.category === 'auth_expired') {
          // ── AUTH EXPIRED: refresh token, then retry ──
          // Only attempt one auth refresh per processing cycle to avoid
          // hammering the auth endpoint when multiple actions fail.
          if (!this._authRefreshedThisCycle && !this._authRefreshInProgress) {
            this._authRefreshInProgress = true;
            const refreshed = await attemptAuthRefresh();
            this._authRefreshInProgress = false;
            this._authRefreshedThisCycle = true;

            if (refreshed) {
              // Token refreshed — retry this action immediately
              console.log(
                `[SyncActionQueue] Auth refreshed — retrying ${action.id} immediately`
              );
              action.status = 'retrying';
              action.retryCount++; // Count the attempt
              // Don't schedule a delay — the next iteration of the for-loop
              // won't pick it up (it's already in toProcess), so schedule
              // a quick re-process after this batch completes
              this._scheduleProcess(100);
              continue;
            } else {
              // Refresh failed — mark as failed, user must re-login
              console.warn(
                `[SyncActionQueue] Auth refresh failed — failing ${action.id}. User must re-login.`
              );
              action.status = 'failed';
              action.lastError = `Auth expired — session refresh failed. Please sign in again.`;
              failed++;
              this._totalFailed++;
              // Stop processing remaining actions — they'll all fail with 401 too
              break;
            }
          } else {
            // Already tried refreshing this cycle — just retry with delay
            action.retryCount++;
            if (action.retryCount >= classification.strategy.maxRetries) {
              action.status = 'failed';
              action.lastError = `Auth expired — max retries reached. Please sign in again.`;
              failed++;
              this._totalFailed++;
            } else {
              action.status = 'retrying';
              this._scheduleProcess(classification.suggestedDelayMs);
            }
          }
          continue;
        }

        if (classification.category === 'rate_limited') {
          // ── RATE LIMITED: use Retry-After header if available ──
          const retryAfterMs = extractRetryAfter(err);
          const delay = retryAfterMs || classification.suggestedDelayMs;

          action.retryCount++;
          if (action.retryCount >= classification.strategy.maxRetries) {
            action.status = 'failed';
            action.lastError = `Rate limited — max retries reached`;
            failed++;
            this._totalFailed++;
          } else {
            action.status = 'retrying';
            console.log(
              `[SyncActionQueue] Rate limited on ${action.id} — backing off ${Math.round(delay / 1000)}s`
            );
            this._scheduleProcess(delay);
            // Stop processing this batch — all subsequent requests will likely
            // also be rate limited. Let the backoff timer handle the next batch.
            break;
          }
          continue;
        }

        // ── RETRYABLE: network_timeout, server_error, unknown ──
        // Use category-specific backoff strategy
        action.retryCount++;
        const effectiveMaxRetries = classification.strategy.maxRetries;

        if (action.retryCount >= effectiveMaxRetries) {
          action.status = 'failed';
          action.lastError = `[${catLabel}] ${errorMsg} (after ${action.retryCount} retries)`;
          failed++;
          this._totalFailed++;
        } else {
          action.status = 'retrying';
          const delay = classification.suggestedDelayMs;
          console.log(
            `[SyncActionQueue] Retrying ${action.id} in ${Math.round(delay / 1000)}s ` +
            `(${catLabel}, attempt ${action.retryCount}/${effectiveMaxRetries})`
          );
          this._scheduleProcess(delay);
        }
      }


    }

    if (processed > 0) {
      this._lastSyncAt = new Date().toISOString();
      this._lastError = null;
    }

    this._processing = false;
    this._saveQueue();
    this._saveHistory();

    // ── Post-process: prune stale conflicts ──────────────────
    // Remove conflicts whose actions are no longer in the queue
    try {
      const currentIds = new Set(this._queue.map(a => a.id));
      conflictResolver.pruneStaleConflicts(currentIds);
    } catch (e) {
      console.warn('[SyncActionQueue] Conflict pruning error (non-fatal):', e);
    }

    this._notifyListeners();

    // If there are more pending non-conflicting items, schedule another batch
    const remaining = this.pendingCount;
    const nonConflictingRemaining = this._queue.filter(
      a => (a.status === 'pending' || a.status === 'retrying') &&
           !conflictingActionIds.has(a.id)
    ).length;
    if (nonConflictingRemaining > 0 && connectivity.isOnline()) {
      this._scheduleProcess(200);
    }

    return { processed, failed, remaining };
  }


  // ── Cleanup ─────────────────────────────────────────────────

  /** Full cleanup (logout) */
  destroy(): void {
    this.stopAutoProcess();
    this._processing = false;
    this._totalProcessed = 0;
    this._totalFailed = 0;
    this._lastSyncAt = null;
    this._lastError = null;
    this._notifyListeners();
  }

  // ── Startup Purge ───────────────────────────────────────────

  /**
   * Scan the queue and remove any actions that contain the 'local' sentinel
   * as a user ID. These actions can never sync successfully and would cause
   * "invalid input syntax for type uuid: 'local'" errors on every retry.
   *
   * Called automatically:
   * - On app startup (from _initIDB after restoring from storage)
   * - On sync processor initialization (from AppContext)
   *
   * Also callable manually for on-demand cleanup.
   *
   * @returns Number of actions purged
   */
  purgeLocalSentinelActions(): number {
    const before = this._queue.length;
    const poisoned: SyncAction[] = [];

    this._queue = this._queue.filter(action => {
      if (actionHasLocalSentinel(action)) {
        poisoned.push(action);
        return false;
      }
      return true;
    });

    const purged = before - this._queue.length;

    if (purged > 0) {
      // Log each purged action for debugging
      for (const action of poisoned) {
        console.warn(
          `[SyncActionQueue] PURGED poisoned action ${action.id} ` +
          `(type: ${action.type}, status: ${action.status}, ` +
          `created: ${action.createdAt}) — payload contained 'local' sentinel user ID`
        );
      }

      console.warn(
        `[SyncActionQueue] Startup purge complete: removed ${purged} action(s) ` +
        `with invalid 'local' user IDs from sync queue`
      );

      this._saveQueue();
      this._notifyListeners();
    }

    return purged;
  }

  /**
   * Scan the queue for actions that previously failed with UUID-related errors
   * and are stuck in 'failed' status. These will never succeed on retry, so
   * remove them to clean up the queue.
   *
   * @returns Number of actions purged
   */
  purgeFailedUserIdErrors(): number {
    const before = this._queue.length;

    this._queue = this._queue.filter(action => {
      if (action.status === 'failed' && action.lastError && isUnrecoverableUserIdError(action.lastError)) {
        console.warn(
          `[SyncActionQueue] PURGED failed action ${action.id} ` +
          `(type: ${action.type}): ${action.lastError}`
        );
        return false;
      }
      return true;
    });

    const purged = before - this._queue.length;

    if (purged > 0) {
      console.warn(`[SyncActionQueue] Purged ${purged} failed action(s) with unrecoverable UUID errors`);
      this._saveQueue();
      this._notifyListeners();
    }

    return purged;
  }


  // ── Private Methods ─────────────────────────────────────────

  private _getStatus(): QueueSyncStatus {
    if (this._processing) return 'syncing';
    if (!connectivity.isOnline() && this.pendingCount > 0) return 'offline';
    if (this.failedCount > 0 && this.pendingCount === 0) return 'error';
    if (this.failedCount > 0 && this.pendingCount > 0) return 'partial';
    return 'idle';
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

  private _addToHistory(action: SyncAction): void {
    this._history.push({ ...action });
    if (this._history.length > MAX_HISTORY_SIZE) {
      this._history = this._history.slice(-MAX_HISTORY_SIZE);
    }
  }

  private _notifyListeners(): void {
    const stats = this.stats;
    this._listeners.forEach(listener => {
      try {
        listener(stats);
      } catch (e) {
        console.warn('[SyncActionQueue] Listener error:', e);
      }
    });
  }

  // ── Persistence ─────────────────────────────────────────────

  /** Synchronous load from localStorage (bootstrap) */
  private _loadQueueSync(): void {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('ecs_sync_action_queue');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // Reset any 'processing' status to 'pending' (app may have crashed)
            this._queue = parsed.map((a: SyncAction) => ({
              ...a,
              status: a.status === 'processing' ? 'pending' : a.status,
            }));
          }
        }
      }
    } catch (e) {
      console.warn('[SyncActionQueue] Failed to load queue:', e);
      this._queue = [];
    }

    // ── Startup purge: remove any poisoned actions from previous sessions ──
    if (this._queue.length > 0) {
      const sentinelPurged = this.purgeLocalSentinelActions();
      const failedPurged = this.purgeFailedUserIdErrors();
      if (sentinelPurged > 0 || failedPurged > 0) {
        console.log(
          `[SyncActionQueue] Startup cleanup (localStorage): ${sentinelPurged} sentinel + ${failedPurged} failed UUID actions removed`
        );
      }
    }
  }

  /** Synchronous load history from localStorage (bootstrap) */
  private _loadHistorySync(): void {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('ecs_sync_action_history');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this._history = parsed.slice(-MAX_HISTORY_SIZE);
          }
        }
      }
    } catch (e) {
      this._history = [];
    }
  }

  /** Save queue to both IndexedDB and localStorage */
  private _saveQueue(): void {
    // Always save to localStorage (sync, immediate)
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem('ecs_sync_action_queue', JSON.stringify(this._queue));
      }
    } catch (e) {
      console.warn('[SyncActionQueue] Failed to save queue to localStorage:', e);
    }

    // Also save to IndexedDB (async, durable)
    if (this._idbReady) {
      idbQueue.saveAll('sync_actions', this._queue).catch((e) => {
        console.warn('[SyncActionQueue] Failed to save queue to IDB:', e);
      });
    }
  }

  /** Save history to both IndexedDB and localStorage */
  private _saveHistory(): void {
    // Always save to localStorage (sync, immediate)
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem('ecs_sync_action_history', JSON.stringify(this._history));
      }
    } catch (e) {
      console.warn('[SyncActionQueue] Failed to save history to localStorage:', e);
    }

    // Also save to IndexedDB (async, durable)
    if (this._idbReady) {
      idbQueue.saveAll('sync_history', this._history).catch((e) => {
        console.warn('[SyncActionQueue] Failed to save history to IDB:', e);
      });
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────

export const syncActionQueue = new SyncActionQueue();

// ── Convenience helper for dashboard actions ──────────────────

/**
 * Queue a dashboard action for sync.
 * This is the primary integration point for dashboardStore mutations.
 */
export function queueDashboardAction(
  type: SyncActionType,
  payload: Record<string, any>,
  description: string,
): string {
  return syncActionQueue.enqueue(type, payload, description, 'normal');
}

/**
 * Queue an expedition action for sync.
 * Supports all expedition lifecycle actions with full payload data.
 */
export function queueExpeditionAction(
  type: SyncActionType,
  payload: Record<string, any>,
  description: string,
  priority: SyncActionPriority = 'normal',
): string {
  return syncActionQueue.enqueue(type, payload, description, priority);
}

/**
 * Queue a loadout action for sync.
 * Covers loadout CRUD and item-level operations.
 */
export function queueLoadoutAction(
  type: SyncActionType,
  payload: Record<string, any>,
  description: string,
): string {
  return syncActionQueue.enqueue(type, payload, description, 'normal');
}

/**
 * Queue a route action for sync.
 * Covers route imports, updates, waypoint changes, and activation.
 */
export function queueRouteAction(
  type: SyncActionType,
  payload: Record<string, any>,
  description: string,
): string {
  return syncActionQueue.enqueue(type, payload, description, 'normal');
}

/**
 * Queue a checklist action for sync.
 */
export function queueChecklistAction(
  type: 'checklist_add' | 'checklist_toggle' | 'checklist_remove' | 'checklist_generate',
  payload: Record<string, any>,
  description: string,
): string {
  return syncActionQueue.enqueue(type, payload, description, 'normal');
}

/**
 * Queue a field log action for sync.
 */
export function queueFieldLogAction(
  type: 'field_log_create' | 'field_log_remove',
  payload: Record<string, any>,
  description: string,
): string {
  return syncActionQueue.enqueue(type, payload, description, 'normal');
}

/**
 * Queue a waypoint action for sync.
 */
export function queueWaypointAction(
  type: 'waypoint_create' | 'waypoint_delete' | 'waypoint_change',
  payload: Record<string, any>,
  description: string,
): string {
  return syncActionQueue.enqueue(type, payload, description, 'normal');
}

/**
 * Queue a critical action (e.g., safety-related changes).
 */
export function queueCriticalAction(
  type: SyncActionType,
  payload: Record<string, any>,
  description: string,
): string {
  return syncActionQueue.enqueue(type, payload, description, 'critical');
}

