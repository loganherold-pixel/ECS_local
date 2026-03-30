// ============================================================
// TEMPLATE SYNC ENGINE — Cloud Synchronization for Templates
// ============================================================
// Provides:
//   1. Per-template sync status tracking (synced/pending/conflict/local_only)
//   2. Offline queue for pending template changes
//   3. Bidirectional sync via manage-templates edge function
//   4. Conflict detection and resolution
//   5. Auto-sync on connectivity restore
// ============================================================

import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import { connectivity } from './connectivity';
import type { ExpeditionTemplate } from './templateStore';

const TAG = '[TEMPLATE_SYNC]';
const SYNC_META_KEY = 'ecs_template_sync_meta';
const SYNC_QUEUE_KEY = 'ecs_template_sync_queue';
const TIMEOUT_MS = 12000;

// ── Types ────────────────────────────────────────────────────

export type TemplateSyncStatus = 'synced' | 'pending' | 'conflict' | 'local_only' | 'syncing';

export interface TemplateSyncMeta {
  lastSyncedAt: string | null;
  templateStatuses: Record<string, TemplateSyncStatus>;
  conflicts: TemplateConflict[];
}

export interface TemplateConflict {
  templateId: string;
  localVersion: ExpeditionTemplate;
  cloudVersion: ExpeditionTemplate;
  localUpdatedAt: string;
  cloudUpdatedAt: string;
  detectedAt: string;
}

export type ConflictResolution = 'keep_local' | 'keep_cloud' | 'keep_both';

export interface SyncQueueItem {
  id: string;
  templateId: string;
  action: 'create' | 'update' | 'delete';
  template?: ExpeditionTemplate;
  queuedAt: string;
  retryCount: number;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
  syncedAt: string | null;
}

type SyncListener = (meta: TemplateSyncMeta) => void;
type SyncingListener = (syncing: boolean) => void;

// ── Storage helpers ──────────────────────────────────────────

const memoryStore: Record<string, string> = {};

function storageGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

function storageSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
  memoryStore[key] = value;
}

function withTimeout<T>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Sync timeout')), ms);
    promise
      .then(r => { clearTimeout(timer); resolve(r); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
}

// ── Sync Engine ──────────────────────────────────────────────

class TemplateSyncEngine {
  private _meta: TemplateSyncMeta;
  private _queue: SyncQueueItem[];
  private _listeners: Set<SyncListener> = new Set();
  private _syncingListeners: Set<SyncingListener> = new Set();
  private _syncing = false;
  private _connectivityUnsub: (() => void) | null = null;
  private _autoSyncTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this._meta = this._loadMeta();
    this._queue = this._loadQueue();
  }

  // ── Public API ───────────────────────────────────────────

  /** Get current sync metadata */
  get meta(): TemplateSyncMeta {
    return { ...this._meta };
  }

  /** Whether a sync is currently in progress */
  get isSyncing(): boolean {
    return this._syncing;
  }

  /** Get sync status for a specific template */
  getStatus(templateId: string): TemplateSyncStatus {
    return this._meta.templateStatuses[templateId] || 'local_only';
  }

  /** Get all active conflicts */
  get conflicts(): TemplateConflict[] {
    return [...this._meta.conflicts];
  }

  /** Get pending sync queue size */
  get pendingCount(): number {
    return this._queue.length;
  }

  /** Get the sync queue */
  get queue(): SyncQueueItem[] {
    return [...this._queue];
  }

  /** Register a metadata change listener */
  onMetaChange(listener: SyncListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Register a syncing state listener */
  onSyncingChange(listener: SyncingListener): () => void {
    this._syncingListeners.add(listener);
    return () => this._syncingListeners.delete(listener);
  }

  // ── Queue Management ─────────────────────────────────────

  /** Queue a template for sync (called when saving/updating locally) */
  queueForSync(templateId: string, action: 'create' | 'update' | 'delete', template?: ExpeditionTemplate): void {
    // Remove any existing queue items for this template
    this._queue = this._queue.filter(q => q.templateId !== templateId);

    const item: SyncQueueItem = {
      id: `sq_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      templateId,
      action,
      template: action !== 'delete' ? template : undefined,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
    };

    this._queue.push(item);
    this._saveQueue();

    // Mark template as pending
    this._meta.templateStatuses[templateId] = 'pending';
    this._saveMeta();
    this._notifyListeners();

    console.log(TAG, `Queued ${action} for template ${templateId}`);

    // Try immediate sync if online
    if (connectivity.isOnline() && !this._syncing) {
      this._scheduleSync(500);
    }
  }

  /** Mark a template as synced */
  markSynced(templateId: string): void {
    this._meta.templateStatuses[templateId] = 'synced';
    this._saveMeta();
    this._notifyListeners();
  }

  /** Mark multiple templates as synced */
  markAllSynced(templateIds: string[]): void {
    for (const id of templateIds) {
      this._meta.templateStatuses[id] = 'synced';
    }
    this._saveMeta();
    this._notifyListeners();
  }

  /** Remove a template from sync tracking */
  removeTracking(templateId: string): void {
    delete this._meta.templateStatuses[templateId];
    this._meta.conflicts = this._meta.conflicts.filter(c => c.templateId !== templateId);
    this._queue = this._queue.filter(q => q.templateId !== templateId);
    this._saveMeta();
    this._saveQueue();
    this._notifyListeners();
  }

  // ── Full Sync ────────────────────────────────────────────

  /**
   * Perform a full bidirectional sync.
   * Returns local templates that should be updated (pulled from cloud).
   */
  async performSync(
    localTemplates: ExpeditionTemplate[],
    userId: string | null,
  ): Promise<SyncResult> {
    const result: SyncResult = {
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      errors: [],
      syncedAt: null,
    };

    if (!userId || !isSupabaseConfigured || !connectivity.isOnline()) {
      result.errors.push('Cannot sync: offline or not authenticated');
      return result;
    }

    if (this._syncing) {
      result.errors.push('Sync already in progress');
      return result;
    }

    this._syncing = true;
    this._notifySyncingListeners();

    // Mark all pending templates as syncing
    for (const [id, status] of Object.entries(this._meta.templateStatuses)) {
      if (status === 'pending') {
        this._meta.templateStatuses[id] = 'syncing';
      }
    }
    this._notifyListeners();

    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('manage-templates', {
          body: {
            action: 'sync',
            local_templates: localTemplates,
            last_synced_at: this._meta.lastSyncedAt,
          },
        })
      );

      if (error) {
        throw new Error(error.message || 'Sync request failed');
      }

      if (!data) {
        throw new Error('No data returned from sync');
      }

      // Process pushed templates
      const pushedIds: string[] = data.pushed || [];
      result.pushed = pushedIds.length;
      for (const id of pushedIds) {
        this._meta.templateStatuses[id] = 'synced';
      }

      // Process pulled templates (new or updated from cloud)
      const pulled: ExpeditionTemplate[] = data.pulled || [];
      result.pulled = pulled.length;
      for (const t of pulled) {
        this._meta.templateStatuses[t.id] = 'synced';
      }

      // Process conflicts
      const conflicts: any[] = data.conflicts || [];
      result.conflicts = conflicts.length;
      for (const c of conflicts) {
        const existing = this._meta.conflicts.find(x => x.templateId === c.template_id);
        if (!existing) {
          this._meta.conflicts.push({
            templateId: c.template_id,
            localVersion: c.local_version,
            cloudVersion: c.cloud_version,
            localUpdatedAt: c.local_updated_at,
            cloudUpdatedAt: c.cloud_updated_at,
            detectedAt: new Date().toISOString(),
          });
        } else {
          // Update existing conflict
          existing.localVersion = c.local_version;
          existing.cloudVersion = c.cloud_version;
          existing.localUpdatedAt = c.local_updated_at;
          existing.cloudUpdatedAt = c.cloud_updated_at;
          existing.detectedAt = new Date().toISOString();
        }
        this._meta.templateStatuses[c.template_id] = 'conflict';
      }

      // Update sync timestamp
      this._meta.lastSyncedAt = data.synced_at || new Date().toISOString();
      result.syncedAt = this._meta.lastSyncedAt;

      // Clear processed queue items
      const processedIds = new Set([...pushedIds, ...pulled.map(p => p.id)]);
      this._queue = this._queue.filter(q => !processedIds.has(q.templateId));

      // Revert any 'syncing' status back to 'synced' if not in conflict
      for (const [id, status] of Object.entries(this._meta.templateStatuses)) {
        if (status === 'syncing') {
          this._meta.templateStatuses[id] = 'synced';
        }
      }

      this._saveMeta();
      this._saveQueue();

      console.log(TAG, `Sync complete: pushed=${result.pushed}, pulled=${result.pulled}, conflicts=${result.conflicts}`);

      // Store pulled templates for the caller to merge
      (result as any)._pulledTemplates = pulled;

    } catch (e: any) {
      console.error(TAG, 'Sync error:', e);
      result.errors.push(e?.message || 'Unknown sync error');

      // Revert syncing status back to pending
      for (const [id, status] of Object.entries(this._meta.templateStatuses)) {
        if (status === 'syncing') {
          this._meta.templateStatuses[id] = 'pending';
        }
      }
      this._saveMeta();
    }

    this._syncing = false;
    this._notifyListeners();
    this._notifySyncingListeners();

    return result;
  }

  /** Get pulled templates from last sync result */
  getPulledTemplates(result: SyncResult): ExpeditionTemplate[] {
    return (result as any)._pulledTemplates || [];
  }

  // ── Conflict Resolution ──────────────────────────────────

  /** Resolve a conflict */
  async resolveConflict(
    templateId: string,
    resolution: ConflictResolution,
    userId: string | null,
  ): Promise<{ resolved: boolean; template?: ExpeditionTemplate; copy?: ExpeditionTemplate; error?: string }> {
    if (!userId || !isSupabaseConfigured) {
      return { resolved: false, error: 'Not authenticated' };
    }

    const conflict = this._meta.conflicts.find(c => c.templateId === templateId);
    if (!conflict) {
      return { resolved: false, error: 'Conflict not found' };
    }

    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('manage-templates', {
          body: {
            action: 'resolve-conflict',
            template_id: templateId,
            resolution,
            chosen_version: resolution === 'keep_local' || resolution === 'keep_both'
              ? conflict.localVersion
              : undefined,
          },
        })
      );

      if (error) throw new Error(error.message || 'Resolution failed');

      // Remove conflict
      this._meta.conflicts = this._meta.conflicts.filter(c => c.templateId !== templateId);
      this._meta.templateStatuses[templateId] = 'synced';

      if (data?.copy) {
        // keep_both: also mark the copy as synced
        this._meta.templateStatuses[data.copy.id] = 'synced';
      }

      this._saveMeta();
      this._notifyListeners();

      return {
        resolved: true,
        template: data?.template,
        copy: data?.copy,
      };
    } catch (e: any) {
      console.error(TAG, 'Conflict resolution error:', e);
      return { resolved: false, error: e?.message || 'Resolution failed' };
    }
  }

  // ── Auto-Sync ────────────────────────────────────────────

  /** Start auto-sync on connectivity changes */
  startAutoSync(): void {
    if (this._connectivityUnsub) return;

    this._connectivityUnsub = connectivity.onStatusChange((status, wasOffline) => {
      if (status === 'online' && wasOffline && this._queue.length > 0) {
        console.log(TAG, 'Back online, scheduling template sync...');
        this._scheduleSync(2000);
      }
    });
  }

  /** Stop auto-sync */
  stopAutoSync(): void {
    if (this._connectivityUnsub) {
      this._connectivityUnsub();
      this._connectivityUnsub = null;
    }
    if (this._autoSyncTimer) {
      clearTimeout(this._autoSyncTimer);
      this._autoSyncTimer = null;
    }
  }

  /** Reset all sync state */
  reset(): void {
    this._meta = {
      lastSyncedAt: null,
      templateStatuses: {},
      conflicts: [],
    };
    this._queue = [];
    this._saveMeta();
    this._saveQueue();
    this._notifyListeners();
  }

  // ── Internal ─────────────────────────────────────────────

  private _scheduleSync(delayMs: number): void {
    if (this._autoSyncTimer) clearTimeout(this._autoSyncTimer);
    this._autoSyncTimer = setTimeout(() => {
      this._autoSyncTimer = null;
      // The caller (TemplateManager) will invoke performSync
      // We just notify listeners that sync is needed
      this._notifyListeners();
    }, delayMs);
  }

  private _loadMeta(): TemplateSyncMeta {
    try {
      const raw = storageGet(SYNC_META_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          lastSyncedAt: parsed.lastSyncedAt || null,
          templateStatuses: parsed.templateStatuses || {},
          conflicts: parsed.conflicts || [],
        };
      }
    } catch {}
    return { lastSyncedAt: null, templateStatuses: {}, conflicts: [] };
  }

  private _saveMeta(): void {
    storageSet(SYNC_META_KEY, JSON.stringify(this._meta));
  }

  private _loadQueue(): SyncQueueItem[] {
    try {
      const raw = storageGet(SYNC_QUEUE_KEY);
      if (raw) return JSON.parse(raw) || [];
    } catch {}
    return [];
  }

  private _saveQueue(): void {
    storageSet(SYNC_QUEUE_KEY, JSON.stringify(this._queue));
  }

  private _notifyListeners(): void {
    const meta = this.meta;
    this._listeners.forEach(l => {
      try { l(meta); } catch {}
    });
  }

  private _notifySyncingListeners(): void {
    const syncing = this._syncing;
    this._syncingListeners.forEach(l => {
      try { l(syncing); } catch {}
    });
  }
}

// Singleton
export const templateSyncEngine = new TemplateSyncEngine();

