/**
 * Offline-First Loadout Store
 *
 * All loadout data is stored locally first.
 * Cloud sync is optional and enhances the experience.
 * No login required for core functionality.
 *
 * Local data model includes:
 *   id, user_id (nullable), device_id, updated_at, created_at, sync_status
 *
 * sync_status: 'local' | 'pending' | 'synced' | 'error'
 *
 * FIXES:
 * - Added timeout wrapper for all Supabase calls (prevents hanging)
 * - Better error handling in getAll/getItemStats
 * - Defensive null checks throughout
 * - Guard sync action queueing: only queue when userId is a valid UUID (not null/'local')
 *   to prevent "invalid input syntax for type uuid: 'local'" errors in sync processors
 * - Cloud sync failures in update() now enqueue to loadoutSyncQueue for automatic retry
 *
 * PHASE 3 STABILIZATION:
 * - Auto-notifies loadoutWeightCache after item create/update/delete
 * - Ensures weight bridge receives immediate updates for real-time sync
 */
import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import { queueLoadoutAction } from './syncActionQueue';
import { loadoutSyncQueue } from './loadoutSyncQueue';
import { loadoutWeightCache } from './loadoutWeightCache';
import type {
  Loadout,
  LoadoutItem,
  LoadoutMode,
  LoadoutViewMode,
  LoadoutItemCategory,
  OperatingProfile,
  WeightSource,
} from './types';



// ── Helper: check if userId is valid for cloud sync ─────
// Returns true only if userId is a non-empty string that isn't the local sentinel.
// This prevents queueing sync actions with "local" as a UUID.
function isSyncableUserId(userId?: string | null): userId is string {
  return !!userId && userId !== 'local' && userId.length > 8;
}


// ── Timeout wrapper for Supabase calls ──────────────────
const SUPABASE_TIMEOUT_MS = 8000; // 8 seconds max for any cloud call

function withTimeout<T>(promise: Promise<T>, ms: number = SUPABASE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[LoadoutStore] Operation timed out after ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ── Storage helpers ─────────────────────────────────────
const memoryStore: Record<string, string> = {};

function lsGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch (e) {
    console.warn('[LoadoutStore] localStorage read error:', e);
  }
  return memoryStore[key] || null;
}

function lsSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch (e) {
    console.warn('[LoadoutStore] localStorage write error:', e);
  }
  memoryStore[key] = value;
}

function generateId(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getDeviceId(): string {
  const key = 'ecs_device_id';
  let id = lsGet(key);
  if (!id) {
    id = generateId();
    lsSet(key, id);
  }
  return id;
}

const nowISO = () => new Date().toISOString();

// ── Storage keys ────────────────────────────────────────
const LS_LOADOUTS = 'ecs_local_loadouts';
const LS_LOADOUT_ITEMS = 'ecs_local_loadout_items';

// ── Sync status type ────────────────────────────────────
export type LocalSyncStatus = 'local' | 'pending' | 'synced' | 'error';

export interface LocalLoadout extends Loadout {
  device_id: string;
  sync_status: LocalSyncStatus;
}

export interface LocalLoadoutItem extends LoadoutItem {
  device_id: string;
  sync_status: LocalSyncStatus;
}

// ── Local loadout CRUD ──────────────────────────────────

function getLocalLoadouts(): LocalLoadout[] {
  const raw = lsGet(LS_LOADOUTS);
  if (!raw) return [];
  try { return JSON.parse(raw) || []; } catch { return []; }
}

function saveLocalLoadouts(items: LocalLoadout[]): void {
  lsSet(LS_LOADOUTS, JSON.stringify(items || []));
}

function getLocalLoadoutItems(): LocalLoadoutItem[] {
  const raw = lsGet(LS_LOADOUT_ITEMS);
  if (!raw) return [];
  try { return JSON.parse(raw) || []; } catch { return []; }
}

function saveLocalLoadoutItems(items: LocalLoadoutItem[]): void {
  lsSet(LS_LOADOUT_ITEMS, JSON.stringify(items || []));
}

// ── Loadout Store ───────────────────────────────────────

export const loadoutStore = {
  /**
   * Get all loadouts. Merges cloud + local when authenticated.
   * FIXED: Added timeout to prevent hanging on slow/failed Supabase calls.
   */
  getAll: async (
    userId?: string | null,
    mode?: LoadoutMode
  ): Promise<{ loadouts: LocalLoadout[]; source: 'cloud' | 'local' | 'merged' }> => {
    let local: LocalLoadout[] = [];
    try {
      local = getLocalLoadouts().filter(l => !mode || l.mode === mode);
    } catch (e) {
      console.warn('[LoadoutStore] Failed to read local loadouts:', e);
      local = [];
    }

    if (isSyncableUserId(userId) && isSupabaseConfigured) {

      try {
        let query = supabase
          .from('loadouts')
          .select('*')
          .eq('owner_user_id', userId)
          .order('updated_at', { ascending: false });

        if (mode) query = query.eq('mode', mode);

        // Wrap in timeout to prevent hanging
        const { data, error } = await withTimeout(query);

        if (!error && data && Array.isArray(data)) {
          const cloudIds = new Set(data.map((l: any) => l.id));
          const localOnly = local.filter(l => !cloudIds.has(l.id));
          const deviceId = getDeviceId();

          const cloudAsLocal: LocalLoadout[] = data.map((l: any) => ({
            ...l,
            device_id: deviceId,
            sync_status: 'synced' as LocalSyncStatus,
          }));

          if (localOnly.length > 0) {
            return {
              loadouts: [...cloudAsLocal, ...localOnly]
                .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
              source: 'merged',
            };
          }
          return { loadouts: cloudAsLocal, source: 'cloud' };
        }
        // If error, fall through to local
        if (error) {
          console.warn('[LoadoutStore] Cloud fetch error, using local:', error.message);
        }
      } catch (err) {
        console.warn('[LoadoutStore] Cloud fetch failed (timeout or network), using local:', err);
      }
    }

    return {
      loadouts: local.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
      source: 'local',
    };
  },

  /**
   * Get loadout by ID (local first, then cloud)
   */
  getById: async (id: string, userId?: string | null): Promise<LocalLoadout | null> => {
    try {
      const local = getLocalLoadouts().find(l => l.id === id);
      if (local) return local;
    } catch (e) {
      console.warn('[LoadoutStore] Local getById error:', e);
    }

    if (userId && isSupabaseConfigured) {
      try {
        const { data } = await withTimeout(
          supabase.from('loadouts').select('*').eq('id', id).single()
        );
        if (data) {
          return { ...data, device_id: getDeviceId(), sync_status: 'synced' as LocalSyncStatus };
        }
      } catch {}
    }
    return null;
  },

  /**
   * Create a loadout locally. Optionally push to cloud.
   */
  create: async (
    data: {
      name: string;
      mode: LoadoutMode;
      operating_profile?: OperatingProfile | null;
      people_count?: number;
      trip_length_days?: number;
      description?: string | null;
      loadout_view_mode?: LoadoutViewMode;
      vehicle_id?: string | null;
    },
    userId?: string | null
  ): Promise<{ loadout: LocalLoadout; source: 'cloud' | 'local' }> => {
    const now = nowISO();
    const deviceId = getDeviceId();
    const id = generateId();

    const loadout: LocalLoadout = {
      id,
      owner_user_id: userId || 'local',
      vehicle_id: data.vehicle_id || null,
      name: data.name,
      description: data.description || null,
      mode: data.mode,
      operating_profile: data.operating_profile || null,
      people_count: data.people_count || 1,
      trip_length_days: data.trip_length_days || null,
      total_weight_lbs: null,
      item_count: 0,
      loadout_view_mode: data.loadout_view_mode || 'basic',
      created_at: now,
      updated_at: now,
      device_id: deviceId,
      sync_status: 'local',
      _item_count: 0,
      _critical_count: 0,
      _packed_count: 0,
      _readiness_pct: 0,
    };

    // Try cloud first if authenticated
    if (userId && userId !== 'local' && isSupabaseConfigured) {
      try {
        const { data: cloudData, error } = await withTimeout(
          supabase
            .from('loadouts')
            .insert({
              owner_user_id: userId,
              vehicle_id: data.vehicle_id || null,
              name: data.name,
              mode: data.mode,
              operating_profile: data.operating_profile || null,
              people_count: data.people_count || 1,
              trip_length_days: data.trip_length_days || null,
              description: data.description || null,
              loadout_view_mode: data.loadout_view_mode || 'basic',
            })
            .select('*')
            .single()
        );


        if (!error && cloudData) {
          const cloudLoadout: LocalLoadout = {
            ...cloudData,
            device_id: deviceId,
            sync_status: 'synced',
            _item_count: 0,
            _critical_count: 0,
            _packed_count: 0,
            _readiness_pct: 0,
          };
          // Also save locally for offline access
          try {
            const locals = getLocalLoadouts();
            locals.push(cloudLoadout);
            saveLocalLoadouts(locals);
          } catch (e) {
            console.warn('[LoadoutStore] Failed to cache cloud loadout locally:', e);
          }
          return { loadout: cloudLoadout, source: 'cloud' };
        }
      } catch (err) {
        console.warn('[LoadoutStore] Cloud create failed:', err);
      }
    }

    // Save locally
    try {
      const locals = getLocalLoadouts();
      locals.push(loadout);
      saveLocalLoadouts(locals);
    } catch (e) {
      console.warn('[LoadoutStore] Failed to save loadout locally:', e);
    }

    // Only queue sync action if user has a valid (non-'local') ID.
    // Without this guard, the sync processor would try to send owner_user_id='local'
    // to the edge function, causing "invalid input syntax for type uuid" errors.
    if (isSyncableUserId(userId)) {
      queueLoadoutAction('loadout_create', {
        loadoutId: loadout.id,
        name: data.name,
        mode: data.mode,
        userId,
        source: 'local',
      }, `Create loadout: ${data.name}`);
    }

    return { loadout, source: 'local' };

  },



  /**
   * Update a loadout.
   *
   * Local update is always applied immediately (offline-first).
   * Cloud sync is attempted if the user is authenticated.
   * If cloud sync fails, the update is enqueued to loadoutSyncQueue
   * for automatic retry with exponential backoff, ensuring the
   * reconciled weight/count values eventually reach other devices.
   */
  update: async (id: string, changes: Partial<Loadout>, userId?: string | null): Promise<LocalLoadout | null> => {
    let cloudSyncSucceeded = false;

    try {
      const locals = getLocalLoadouts();
      const idx = locals.findIndex(l => l.id === id);

      if (idx !== -1) {
        locals[idx] = {
          ...locals[idx],
          ...changes,
          updated_at: nowISO(),
          sync_status: locals[idx].sync_status === 'synced' ? 'pending' : locals[idx].sync_status,
        };
        saveLocalLoadouts(locals);

        // Try cloud update
        if (isSyncableUserId(userId) && isSupabaseConfigured) {
          try {
            const { error } = await withTimeout(supabase.from('loadouts').update(changes).eq('id', id));
            if (error) {
              throw new Error(error.message || 'Supabase update returned error');
            }
            locals[idx].sync_status = 'synced';
            saveLocalLoadouts(locals);
            cloudSyncSucceeded = true;

            // If this loadout was previously in the retry queue, it's now synced
            // (the queue's processQueue would have handled it, but clear just in case)
            loadoutSyncQueue.remove(id);
          } catch (cloudErr: any) {
            console.warn('[LoadoutStore] Cloud update failed, enqueuing for retry:', cloudErr?.message);
            // Local update succeeded but cloud failed — enqueue for retry.
            // Only enqueue reconciliation-relevant fields (weight/count) to avoid
            // re-pushing stale non-reconciliation changes on retry.
            const reconciliationChanges: Record<string, any> = {};
            if ('total_weight_lbs' in changes) reconciliationChanges.total_weight_lbs = changes.total_weight_lbs;
            if ('item_count' in changes) reconciliationChanges.item_count = changes.item_count;

            // If the changes include weight/count fields, enqueue to the dedicated retry queue
            if (Object.keys(reconciliationChanges).length > 0) {
              loadoutSyncQueue.enqueue(id, reconciliationChanges as any, userId);
            } else {
              // For non-reconciliation changes, use the general sync action queue
              queueLoadoutAction('loadout_update', { loadoutId: id, changes, userId }, `Update loadout ${id}`);
            }
          }
        }

        return locals[idx];
      }

    } catch (e) {
      console.warn('[LoadoutStore] Local update error:', e);
    }

    // Try cloud-only update (record not found locally)
    if (isSyncableUserId(userId) && isSupabaseConfigured) {
      try {
        const { data, error } = await withTimeout(
          supabase
            .from('loadouts')
            .update(changes)
            .eq('id', id)
            .select('*')
            .single()
        );
        if (!error && data) {
          return { ...data, device_id: getDeviceId(), sync_status: 'synced' as LocalSyncStatus };
        }
      } catch {}
    }

    // Queue for later sync if cloud update was not attempted or failed
    if (!cloudSyncSucceeded && isSyncableUserId(userId)) {
      // Check if these are reconciliation changes
      const hasReconciliation = 'total_weight_lbs' in changes || 'item_count' in changes;
      if (hasReconciliation) {
        const reconciliationChanges: Record<string, any> = {};
        if ('total_weight_lbs' in changes) reconciliationChanges.total_weight_lbs = changes.total_weight_lbs;
        if ('item_count' in changes) reconciliationChanges.item_count = changes.item_count;
        loadoutSyncQueue.enqueue(id, reconciliationChanges as any, userId);
      } else {
        queueLoadoutAction('loadout_update', { loadoutId: id, changes, userId }, `Update loadout ${id}`);
      }
    }
    return null;

  },



  /**
   * Delete a loadout
   */
  delete: async (id: string, userId?: string | null): Promise<boolean> => {
    try {
      const locals = getLocalLoadouts();
      const filtered = locals.filter(l => l.id !== id);
      saveLocalLoadouts(filtered);

      // Also delete items
      const items = getLocalLoadoutItems();
      saveLocalLoadoutItems(items.filter(i => i.loadout_id !== id));
    } catch (e) {
      console.warn('[LoadoutStore] Local delete error:', e);
    }

    // Try cloud delete
    if (userId && isSupabaseConfigured) {
      try {
        await withTimeout(supabase.from('loadout_items').delete().eq('loadout_id', id));
        await withTimeout(supabase.from('loadouts').delete().eq('id', id));
      } catch {}
    }

    return true;
  },

  /**
   * Duplicate a loadout
   */
  duplicate: async (loadoutId: string, userId?: string | null): Promise<LocalLoadout | null> => {
    try {
      const source = await loadoutStore.getById(loadoutId, userId);
      if (!source) return null;

      const { loadout: newLoadout } = await loadoutStore.create({
        name: `${source.name} (Copy)`,
        mode: source.mode,
        operating_profile: source.operating_profile,
        people_count: source.people_count || 1,
        trip_length_days: source.trip_length_days || undefined,
        description: source.description,
        loadout_view_mode: source.loadout_view_mode,
      }, userId);

      // Copy items
      const items = await loadoutItemStore.getByLoadoutId(loadoutId, userId);
      for (const item of items) {
        await loadoutItemStore.create({
          loadout_id: newLoadout.id,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          is_critical: item.is_critical,
          storage_location: item.storage_location,
          notes: item.notes,
          weight_lbs: item.weight_lbs,
          weight_source: item.weight_source || 'estimate',
          sort_order: item.sort_order,
        }, userId);

      }

      return newLoadout;
    } catch (e) {
      console.warn('[LoadoutStore] Duplicate failed:', e);
      return null;
    }
  },

  /**
   * Get item stats for loadouts
   * FIXED: Wrapped in try/catch with timeout, defensive null checks
   */
  getItemStats: async (
    loadoutIds: string[],
    userId?: string | null
  ): Promise<Record<string, { total: number; critical: number; packed: number }>> => {
    const stats: Record<string, { total: number; critical: number; packed: number }> = {};

    if (!loadoutIds || loadoutIds.length === 0) return stats;

    // Check local items
    try {
      const localItems = getLocalLoadoutItems();
      for (const item of localItems) {
        if (!item || !loadoutIds.includes(item.loadout_id)) continue;
        if (!stats[item.loadout_id]) stats[item.loadout_id] = { total: 0, critical: 0, packed: 0 };
        stats[item.loadout_id].total++;
        if (item.is_critical) stats[item.loadout_id].critical++;
        if (item.is_packed) stats[item.loadout_id].packed++;
      }
    } catch (e) {
      console.warn('[LoadoutStore] Local item stats error:', e);
    }

    // Also check cloud items
    if (userId && isSupabaseConfigured) {
      try {
        const { data: items } = await withTimeout(
          supabase
            .from('loadout_items')
            .select('loadout_id, is_critical, is_packed')
            .in('loadout_id', loadoutIds)
        );

        if (items && Array.isArray(items)) {
          for (const item of items) {
            if (!item || !item.loadout_id) continue;
            if (!stats[item.loadout_id]) stats[item.loadout_id] = { total: 0, critical: 0, packed: 0 };
            // Only count if not already counted from local
            let localItems: LocalLoadoutItem[] = [];
            try { localItems = getLocalLoadoutItems(); } catch {}
            const localCount = localItems.filter(l => l.loadout_id === item.loadout_id).length;
            if (localCount === 0) {
              stats[item.loadout_id].total++;
              if (item.is_critical) stats[item.loadout_id].critical++;
              if (item.is_packed) stats[item.loadout_id].packed++;
            }
          }
        }
      } catch (e) {
        console.warn('[LoadoutStore] Cloud item stats failed:', e);
        // Don't throw — return whatever local stats we have
      }
    }

    return stats;
  },

  /**
   * Sync all local loadouts to cloud
   */
  syncToCloud: async (userId: string): Promise<{ synced: number; errors: number }> => {
    if (!isSupabaseConfigured) return { synced: 0, errors: 0 };

    let locals: LocalLoadout[] = [];
    try {
      locals = getLocalLoadouts();
    } catch {
      return { synced: 0, errors: 0 };
    }

    const unsynced = locals.filter(l =>
      l.sync_status === 'local' || l.sync_status === 'pending'
    );

    if (unsynced.length === 0) return { synced: 0, errors: 0 };

    let synced = 0;
    let errors = 0;

    for (const loadout of unsynced) {
      try {
        const { device_id, sync_status, _item_count, _critical_count, _packed_count, _readiness_pct, ...cloudData } = loadout;
        cloudData.owner_user_id = userId;

        const { error } = await withTimeout(
          supabase
            .from('loadouts')
            .upsert(cloudData, { onConflict: 'id' })
        );

        if (!error) {
          const idx = locals.findIndex(l => l.id === loadout.id);
          if (idx !== -1) {
            locals[idx].sync_status = 'synced';
            locals[idx].owner_user_id = userId;
          }
          synced++;

          // Also sync items
          const items = getLocalLoadoutItems().filter(i => i.loadout_id === loadout.id);
          if (items.length > 0) {
            const cleanItems = items.map(({ device_id: d, sync_status: s, ...rest }) => ({
              ...rest,
              owner_user_id: userId,
            }));
            await withTimeout(
              supabase.from('loadout_items').upsert(cleanItems, { onConflict: 'id' })
            );
          }
        } else {
          const idx = locals.findIndex(l => l.id === loadout.id);
          if (idx !== -1) locals[idx].sync_status = 'error';
          errors++;
        }
      } catch {
        errors++;
      }
    }

    saveLocalLoadouts(locals);
    return { synced, errors };
  },

  /**
   * Get sync status summary
   */
  getSyncSummary: (): { local: number; pending: number; synced: number; error: number } => {
    try {
      const locals = getLocalLoadouts();
      return {
        local: locals.filter(l => l.sync_status === 'local').length,
        pending: locals.filter(l => l.sync_status === 'pending').length,
        synced: locals.filter(l => l.sync_status === 'synced').length,
        error: locals.filter(l => l.sync_status === 'error').length,
      };
    } catch {
      return { local: 0, pending: 0, synced: 0, error: 0 };
    }
  },


  /**
   * Get loadouts linked to a specific vehicle ID.
   * Checks local store first, then cloud if authenticated.
   * Returns loadouts sorted by updated_at descending.
   */
  getByVehicleId: async (
    vehicleId: string,
    userId?: string | null
  ): Promise<{ loadouts: LocalLoadout[]; source: 'cloud' | 'local' | 'merged' }> => {
    if (!vehicleId) return { loadouts: [], source: 'local' };

    let local: LocalLoadout[] = [];
    try {
      local = getLocalLoadouts().filter(l => l.vehicle_id === vehicleId);
    } catch (e) {
      console.warn('[LoadoutStore] Failed to read local loadouts for vehicle:', e);
      local = [];
    }

    if (isSyncableUserId(userId) && isSupabaseConfigured) {
      try {
        const { data, error } = await withTimeout(
          supabase
            .from('loadouts')
            .select('*')
            .eq('vehicle_id', vehicleId)
            .eq('owner_user_id', userId)
            .order('updated_at', { ascending: false })
        );

        if (!error && data && Array.isArray(data)) {
          const cloudIds = new Set(data.map((l: any) => l.id));
          const localOnly = local.filter(l => !cloudIds.has(l.id));
          const deviceId = getDeviceId();

          const cloudAsLocal: LocalLoadout[] = data.map((l: any) => ({
            ...l,
            device_id: deviceId,
            sync_status: 'synced' as LocalSyncStatus,
          }));

          if (localOnly.length > 0) {
            return {
              loadouts: [...cloudAsLocal, ...localOnly]
                .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
              source: 'merged',
            };
          }
          return { loadouts: cloudAsLocal, source: 'cloud' };
        }
        if (error) {
          console.warn('[LoadoutStore] Cloud vehicle loadout fetch error:', error.message);
        }
      } catch (err) {
        console.warn('[LoadoutStore] Cloud vehicle loadout fetch failed:', err);
      }
    }

    return {
      loadouts: local.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
      source: 'local',
    };
  },
};


// ── Phase 3 Stabilization: Auto-notify weight cache ─────
// After any item mutation, update the loadoutWeightCache so the
// weight bridge, Dashboard, Vehicle Twin, and Attitude Monitor
// receive immediate updates without manual refresh.
function autoUpdateWeightCache(loadoutId: string): void {
  try {
    const allItems = getLocalLoadoutItems().filter(i => i.loadout_id === loadoutId);
    loadoutWeightCache.updateFromItems(loadoutId, allItems);
  } catch (e) {
    console.warn('[LoadoutStore] Auto weight cache update failed:', e);
  }
}

// ── Loadout Item Store ──────────────────────────────────

export const loadoutItemStore = {

  getByLoadoutId: async (loadoutId: string, userId?: string | null): Promise<LocalLoadoutItem[]> => {
    try {
      const local = getLocalLoadoutItems().filter(i => i.loadout_id === loadoutId);
      if (local.length > 0) return local.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    } catch (e) {
      console.warn('[LoadoutStore] Local getByLoadoutId error:', e);
    }

    // Try cloud
    if (userId && isSupabaseConfigured) {
      try {
        const { data } = await withTimeout(
          supabase
            .from('loadout_items')
            .select('*')
            .eq('loadout_id', loadoutId)
            .order('sort_order')
        );

        if (data && Array.isArray(data) && data.length > 0) {
          const deviceId = getDeviceId();
          return data.map((i: any) => ({
            ...i,
            device_id: deviceId,
            sync_status: 'synced' as LocalSyncStatus,
          }));
        }
      } catch {}
    }

    return [];
  },

  create: async (
    data: {
      loadout_id: string;
      name: string;
      category?: LoadoutItemCategory;
      quantity?: number;
      is_critical?: boolean;
      storage_location?: string | null;
      notes?: string | null;
      weight_lbs?: number | null;
      weight_source?: WeightSource;
      sort_order?: number;
    },
    userId?: string | null
  ): Promise<LocalLoadoutItem> => {
    const now = nowISO();
    const deviceId = getDeviceId();
    const id = generateId();

    const item: LocalLoadoutItem = {
      id,
      loadout_id: data.loadout_id,
      owner_user_id: userId || 'local',
      name: data.name,
      category: data.category || 'general',
      quantity: Math.max(1, data.quantity || 1),
      is_critical: data.is_critical || false,
      is_packed: false,
      storage_location: data.storage_location || null,
      notes: data.notes || null,
      weight_lbs: data.weight_lbs != null && data.weight_lbs >= 0 ? data.weight_lbs : null,
      weight_source: data.weight_source || 'estimate',
      sort_order: data.sort_order || 0,
      created_at: now,
      updated_at: now,
      device_id: deviceId,
      sync_status: 'local',
    };


    try {
      const locals = getLocalLoadoutItems();
      locals.push(item);
      saveLocalLoadoutItems(locals);
    } catch (e) {
      console.warn('[LoadoutStore] Failed to save item locally:', e);
    }

    // Try cloud
    if (userId && userId !== 'local' && isSupabaseConfigured) {
      try {
        const { device_id, sync_status, ...cloudData } = item;
        await withTimeout(supabase.from('loadout_items').insert(cloudData));
        item.sync_status = 'synced';
        try {
          const locals = getLocalLoadoutItems();
          const idx = locals.findIndex(i => i.id === id);
          if (idx !== -1) locals[idx].sync_status = 'synced';
          saveLocalLoadoutItems(locals);
        } catch {}
      } catch {}
    }

    // Phase 3 Stabilization: Auto-notify weight cache after item create
    autoUpdateWeightCache(data.loadout_id);

    return item;
  },


  update: async (id: string, changes: Partial<LoadoutItem>, userId?: string | null): Promise<LocalLoadoutItem | null> => {
    try {
      const locals = getLocalLoadoutItems();
      const idx = locals.findIndex(i => i.id === id);
      if (idx === -1) return null;

      locals[idx] = {
        ...locals[idx],
        ...changes,
        updated_at: nowISO(),
        sync_status: locals[idx].sync_status === 'synced' ? 'pending' : locals[idx].sync_status,
      };
      saveLocalLoadoutItems(locals);

      if (userId && isSupabaseConfigured) {
        try {
          await withTimeout(supabase.from('loadout_items').update(changes).eq('id', id));
          locals[idx].sync_status = 'synced';
          saveLocalLoadoutItems(locals);
        } catch {}
      }

      // Phase 3 Stabilization: Auto-notify weight cache after item update
      autoUpdateWeightCache(locals[idx].loadout_id);

      return locals[idx];
    } catch (e) {
      console.warn('[LoadoutStore] Item update error:', e);
      return null;
    }
  },

  delete: async (id: string, userId?: string | null): Promise<boolean> => {
    let loadoutId: string | null = null;
    try {
      const locals = getLocalLoadoutItems();
      const item = locals.find(i => i.id === id);
      if (item) loadoutId = item.loadout_id;
      saveLocalLoadoutItems(locals.filter(i => i.id !== id));
    } catch (e) {
      console.warn('[LoadoutStore] Item delete error:', e);
    }

    if (isSyncableUserId(userId) && isSupabaseConfigured) {
      try { await withTimeout(supabase.from('loadout_items').delete().eq('id', id)); } catch {}
    }

    // Phase 3 Stabilization: Auto-notify weight cache after item delete
    if (loadoutId) autoUpdateWeightCache(loadoutId);

    return true;
  },
};


// ── Readiness Helpers (synchronous, for Build Readiness checks) ──
// These functions read from local storage synchronously so the
// Safety → Build Readiness panel can evaluate loadout state without
// awaiting async calls.

/**
 * Check whether the active build has at least one saved loadout item.
 *
 * Evaluation order:
 *   1. If a loadoutId is provided, count items for that specific loadout.
 *   2. If only a vehicleId is provided, find all loadouts for that vehicle
 *      and count items across all of them.
 *   3. If neither is provided, return 0 (no items).
 *
 * Returns the total number of saved loadout items found.
 */
export function getLocalLoadoutItemCountForBuild(
  vehicleId?: string | null,
  loadoutId?: string | null,
): number {
  try {
    const allItems = getLocalLoadoutItems();

    // Path 1: Check by specific loadout ID
    if (loadoutId) {
      return allItems.filter(i => i.loadout_id === loadoutId).length;
    }

    // Path 2: Check by vehicle ID — find all loadouts for this vehicle,
    // then count items across all of them
    if (vehicleId) {
      const vehicleLoadouts = getLocalLoadouts().filter(l => l.vehicle_id === vehicleId);
      if (vehicleLoadouts.length === 0) {
        // No loadouts linked to this vehicle — also check all items
        // in case loadouts exist without vehicle_id linkage
        return 0;
      }
      const vehicleLoadoutIds = new Set(vehicleLoadouts.map(l => l.id));
      return allItems.filter(i => vehicleLoadoutIds.has(i.loadout_id)).length;
    }

    // Path 3: No identifiers — check total local items as fallback
    // This covers cases where the builder state doesn't have IDs yet
    // but the user has created loadout items in the general store
    return allItems.length;
  } catch (e) {
    console.warn('[LoadoutStore] getLocalLoadoutItemCountForBuild error:', e);
    return 0;
  }
}

/**
 * Quick boolean check: does the active build have at least 1 saved loadout item?
 * Used by the Build Readiness panel in the Safety/Alert tab.
 */
export function isLoadoutReadyForBuild(
  vehicleId?: string | null,
  loadoutId?: string | null,
): boolean {
  return getLocalLoadoutItemCountForBuild(vehicleId, loadoutId) > 0;
}

