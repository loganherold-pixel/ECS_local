/**
 * Local Vehicle Store
 * 
 * Offline-first vehicle storage using localStorage (web) / memory (native).
 * Vehicles are stored locally and synced to Supabase when:
 *   1. User is authenticated (with a real UUID, not the 'local' sentinel)
 *   2. Device is online
 * 
 * This allows vehicle configuration to work without authentication.
 * When the user logs in, local vehicles are pushed to the cloud.
 *
 * SAFETY: All cloud-facing calls are guarded by isSyncableUserId() to prevent
 * sending owner_user_id='local' to Supabase, which would cause
 * "invalid input syntax for type uuid" errors.
 *
 * CHANGE NOTIFICATION:
 * vehicleStore.subscribe() allows consumers (e.g. Fleet tab) to react
 * immediately when vehicle data changes (create, update, finalize, delete).
 * This eliminates stale-state bugs where Fleet renders before the latest
 * saved vehicle/container state is available.
 */
import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import { vehicleSpecStore } from './vehicleSpecStore';
import type { Vehicle } from './types';

const TAG = '[VehicleStore]';
const LS_KEY = 'ecs_local_vehicles';
const SYNC_FLAG_KEY = 'ecs_vehicles_synced';

// ── Helper: check if userId is valid for cloud sync ─────
// Returns true only if userId is a non-empty string that isn't the local sentinel.
// This prevents sending owner_user_id='local' to Supabase as a UUID.
function isSyncableUserId(userId?: string | null): userId is string {
  return !!userId && userId !== 'local' && userId.length > 8;
}

// ── Known cache key prefixes for related data cleanup ────
const ZONE_CACHE_PREFIX = 'ecs_vehicle_zones_';         // fetchVehicleZones.ts cache
const EXP_ZONE_CACHE_PREFIX = 'ecs_exp_vehicle_zones_'; // expeditionCache.ts zone cache
const PENDING_CONFIGS_KEY = 'ecs_pending_vehicle_configs';
const BUILDER_STATE_KEY = 'ecs_exp_builder_state';

// ── localStorage helpers ─────────────────────────────────

const memoryStore: Record<string, string> = {};

function lsGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return memoryStore[key] || null;
}

function lsSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
  }
  memoryStore[key] = value;
}

function lsRemove(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {}
  delete memoryStore[key];
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

// ── Change Notification System ───────────────────────────
// Allows consumers (Fleet tab, Dashboard, etc.) to subscribe to
// vehicle data changes and react immediately without relying on
// focus/navigation events.
export type VehicleChangeEvent = {
  type: 'create' | 'update' | 'delete' | 'finalize' | 'sync';
  vehicleId: string | null;
  /** Monotonically increasing revision counter */
  revision: number;
};

type VehicleChangeListener = (event: VehicleChangeEvent) => void;
const changeListeners: Set<VehicleChangeListener> = new Set();
let changeRevision = 0;

function notifyChange(type: VehicleChangeEvent['type'], vehicleId: string | null = null) {
  changeRevision++;
  const event: VehicleChangeEvent = { type, vehicleId, revision: changeRevision };
  console.log(TAG, `Change event: ${type} vehicleId=${vehicleId} rev=${changeRevision}`);
  changeListeners.forEach(fn => {
    try { fn(event); } catch (e) {
      console.warn(TAG, 'Change listener error:', e);
    }
  });
}

// ── Local Vehicle CRUD ───────────────────────────────────

function getLocalVehicles(): Vehicle[] {
  const raw = lsGet(LS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Vehicle[];
  } catch {
    return [];
  }
}

function saveLocalVehicles(vehicles: Vehicle[]): void {
  lsSet(LS_KEY, JSON.stringify(vehicles));
}

/**
 * Remove all cached data related to a specific vehicle.
 * Called internally by vehicleStore.delete.
 */
function cleanupRelatedData(vehicleId: string): void {
  // 1. Remove vehicle specs (weight, GVWR, fuel specs)
  try {
    vehicleSpecStore.remove(vehicleId);
    console.log(TAG, `Removed specs for vehicle ${vehicleId}`);
  } catch (e) {
    console.warn(TAG, 'Failed to remove vehicle specs:', e);
  }

  // 2. Remove fetchVehicleZones.ts zone cache
  try {
    lsRemove(ZONE_CACHE_PREFIX + vehicleId);
    console.log(TAG, `Removed zone cache for vehicle ${vehicleId}`);
  } catch {}

  // 3. Remove expeditionCache.ts zone cache
  try {
    lsRemove(EXP_ZONE_CACHE_PREFIX + vehicleId);
    console.log(TAG, `Removed expedition zone cache for vehicle ${vehicleId}`);
  } catch {}

  // 4. Clean up pending vehicle configs that reference this vehicle
  try {
    const pendingRaw = lsGet(PENDING_CONFIGS_KEY);
    if (pendingRaw) {
      const pending: any[] = JSON.parse(pendingRaw);
      const filtered = pending.filter((c: any) => c.vehicle_id !== vehicleId);
      if (filtered.length !== pending.length) {
        lsSet(PENDING_CONFIGS_KEY, JSON.stringify(filtered));
        console.log(TAG, `Removed ${pending.length - filtered.length} pending config(s) for vehicle ${vehicleId}`);
      }
    }
  } catch {}

  // 5. Reset builder state if it references this vehicle
  try {
    const bsRaw = lsGet(BUILDER_STATE_KEY);
    if (bsRaw) {
      const bs = JSON.parse(bsRaw);
      if (bs.vehicleId === vehicleId) {
        bs.vehicleSelected = false;
        bs.vehicleId = null;
        bs.vehicleName = null;
        bs.frameworkConfigured = false;
        bs.frameworkType = null;
        bs.zonesConfigured = false;
        bs.zoneCount = 0;
        bs.lastUpdated = new Date().toISOString();
        lsSet(BUILDER_STATE_KEY, JSON.stringify(bs));
        console.log(TAG, `Reset builder state (was referencing deleted vehicle ${vehicleId})`);
      }
    }
  } catch {}
}

// ── Updatable vehicle fields (excludes id, owner_user_id, created_at) ──
export type VehicleUpdateData = Partial<Omit<Vehicle, 'id' | 'owner_user_id' | 'created_at' | 'updated_at'>>;

export const vehicleStore = {

  // ── Change Subscription ───────────────────────────────
  /**
   * Subscribe to vehicle data change events.
   * Returns an unsubscribe function.
   *
   * Events fire on: create, update, delete, finalize, sync.
   * Listeners receive { type, vehicleId, revision }.
   */
  subscribe: (fn: VehicleChangeListener): (() => void) => {
    changeListeners.add(fn);
    return () => { changeListeners.delete(fn); };
  },

  /**
   * Get the current change revision counter.
   * Useful for comparing whether data has changed since last fetch.
   */
  getRevision: (): number => changeRevision,

  /**
   * Get a single vehicle by ID from local storage.
   * Includes all local-only extension properties (wizard_config, accessoryFramework, etc.).
   */
  getById: (vehicleId: string): Vehicle | null => {
    const locals = getLocalVehicles();
    return locals.find(v => v.id === vehicleId) || null;
  },



  /**
   * Get all vehicles. If authenticated + online, fetches from Supabase.
   * Otherwise returns local vehicles.
   */
  getAll: async (userId?: string | null): Promise<{ vehicles: Vehicle[]; source: 'cloud' | 'local' | 'merged' }> => {
    const localVehicles = getLocalVehicles();

    // If we have a valid (non-'local') user and Supabase is configured, try cloud fetch
    if (isSyncableUserId(userId) && isSupabaseConfigured) {

      try {
        const { data, error } = await supabase
          .from('vehicles')
          .select('*')
          .eq('owner_user_id', userId)
          .order('name');

        if (!error && data) {
          // CRITICAL FIX: Merge local-only properties (accessoryFramework,
          // containerZones, wizard_config, zones) onto cloud vehicles.
          // These properties are only stored in localStorage and are lost
          // when we return raw cloud data.
          const localById = new Map<string, Vehicle>();
          for (const lv of localVehicles) {
            localById.set(lv.id, lv);
          }

          const mergedCloudVehicles = data.map((cloudVehicle: Vehicle) => {
            const localVersion = localById.get(cloudVehicle.id);
            if (localVersion) {
              // Merge local-only extension properties onto the cloud vehicle
              const merged = { ...cloudVehicle } as any;
              if ((localVersion as any).accessoryFramework) {
                merged.accessoryFramework = (localVersion as any).accessoryFramework;
              }
              if ((localVersion as any).containerZones) {
                merged.containerZones = (localVersion as any).containerZones;
              }
              if ((localVersion as any).wizard_config) {
                merged.wizard_config = (localVersion as any).wizard_config;
              }
              if ((localVersion as any).zones) {
                merged.zones = (localVersion as any).zones;
              }
              return merged as Vehicle;
            }
            return cloudVehicle;
          });

          // Also include any local-only vehicles not yet synced
          const cloudIds = new Set(data.map((v: Vehicle) => v.id));
          const localOnly = localVehicles.filter(v => !cloudIds.has(v.id) && v.owner_user_id === 'local');

          if (localOnly.length > 0) {
            return { vehicles: [...mergedCloudVehicles, ...localOnly], source: 'merged' };
          }
          return { vehicles: mergedCloudVehicles, source: 'cloud' };
        }
      } catch (err) {
        console.warn(TAG, 'Cloud fetch failed, using local:', err);
      }
    }

    // Fallback to local
    return { vehicles: localVehicles, source: 'local' };
  },


  /**
   * Create a vehicle locally. If authenticated + online, also push to Supabase.
   */
  create: async (
    data: { name: string; make?: string; model?: string; year?: number | null },
    userId?: string | null
  ): Promise<{ vehicle: Vehicle | null; error?: string; source: 'cloud' | 'local' }> => {
    const now = new Date().toISOString();
    const localId = generateId();

    // If authenticated with a real UUID, try cloud first
    if (isSyncableUserId(userId) && isSupabaseConfigured) {
      try {
        const { data: cloudData, error } = await supabase
          .from('vehicles')
          .insert({
            owner_user_id: userId,
            name: data.name,
            type: 'vehicle',
            make: data.make || null,
            model: data.model || null,
            year: data.year || null,
            current_fuel_percent: 100,
            current_water_gal: 0,
            created_at: now,
            updated_at: now,
          })
          .select('*')
          .single();

        if (!error && cloudData) {
          // CRITICAL FIX: Also save cloud-created vehicle to local storage.
          // Without this, finalizeConfig() can't find the vehicle locally
          // and accessory framework / container zones are never persisted.
          try {
            const locals = getLocalVehicles();
            const alreadyLocal = locals.some(v => v.id === cloudData.id);
            if (!alreadyLocal) {
              locals.push(cloudData);
              saveLocalVehicles(locals);
              console.log(TAG, 'Cloud-created vehicle also saved to local storage:', cloudData.id);
            }
          } catch (e) {
          }
          // Notify listeners that a vehicle was created (cloud path)
          notifyChange('create', cloudData.id);
          return { vehicle: cloudData, source: 'cloud' };
        }

        // Cloud failed — fall through to local
        console.warn(TAG, 'Cloud create failed:', error?.message);
      } catch (err) {
        console.warn(TAG, 'Cloud create error:', err);
      }
    }



    // Create locally
    const vehicle: Vehicle = {
      id: localId,
      owner_user_id: userId || 'local',
      name: data.name,
      type: 'vehicle',
      make: data.make || null,
      model: data.model || null,
      year: data.year || null,
      notes: null,
      fuel_tank_capacity_gal: null,
      avg_mpg: null,
      current_fuel_percent: 100,
      water_capacity_gal: null,
      current_water_gal: 0,
      water_updated_at: null,
      created_at: now,
      updated_at: now,
    };

    const locals = getLocalVehicles();
    locals.push(vehicle);
    saveLocalVehicles(locals);

    // Notify listeners that a vehicle was created (local path)
    notifyChange('create', vehicle.id);
    return { vehicle, source: 'local' };


  },

  /**
   * Update an existing vehicle's fields in local storage and (if authenticated) in the cloud.
   *
   * Merges the provided partial data onto the existing vehicle record,
   * sets `updated_at` to the current timestamp, and persists both locally
   * and (when possible) to the Supabase `vehicles` table.
   *
   * @param vehicleId  The ID of the vehicle to update
   * @param data       Partial vehicle fields to merge (name, make, model, year, capacities, etc.)
   * @param userId     The authenticated user ID (optional; enables cloud update)
   * @returns          { vehicle, updatedIn, error? }
   */
  update: async (
    vehicleId: string,
    data: VehicleUpdateData,
    userId?: string | null
  ): Promise<{ vehicle: Vehicle | null; updatedIn: 'cloud' | 'local' | 'both'; error?: string }> => {
    const now = new Date().toISOString();
    let updatedCloud = false;
    let updatedLocal = false;
    let updatedVehicle: Vehicle | null = null;

    // Build the update payload — strip undefined values
    const payload: Record<string, any> = { updated_at: now };
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        payload[key] = value;
      }
    }

    // ── 1. Cloud update (if authenticated with real UUID + Supabase configured) ──
    if (isSyncableUserId(userId) && isSupabaseConfigured) {

      try {
        const { data: cloudData, error } = await supabase
          .from('vehicles')
          .update(payload)
          .eq('id', vehicleId)
          .select('*')
          .single();

        if (!error && cloudData) {
          updatedCloud = true;
          updatedVehicle = cloudData as Vehicle;
          console.log(TAG, `Updated vehicle ${vehicleId} in cloud`);
        } else {
          console.warn(TAG, `Cloud update failed for ${vehicleId}:`, error?.message);
          // Fall through to local update
        }
      } catch (err: any) {
        console.warn(TAG, `Cloud update error for ${vehicleId}:`, err);
        // Fall through to local update
      }
    }

    // ── 2. Local storage update ─────────────────────────────────
    try {
      const localVehicles = getLocalVehicles();
      const idx = localVehicles.findIndex(v => v.id === vehicleId);

      if (idx !== -1) {
        // Merge payload onto existing local vehicle
        const existing = localVehicles[idx];
        const merged: Vehicle = { ...existing, ...payload, updated_at: now };

        // Preserve wizard_config and zones if they exist on the local record
        // (these are non-typed extensions stored locally)
        if ((existing as any).wizard_config && !(payload as any).wizard_config) {
          (merged as any).wizard_config = (existing as any).wizard_config;
        }
        if ((existing as any).zones && !(payload as any).zones) {
          (merged as any).zones = (existing as any).zones;
        }

        localVehicles[idx] = merged;
        saveLocalVehicles(localVehicles);
        updatedLocal = true;
        // Use cloud version if available (it has server-generated fields),
        // otherwise use the locally merged version
        if (!updatedVehicle) {
          updatedVehicle = merged;
        }
        console.log(TAG, `Updated vehicle ${vehicleId} in local storage`);
      } else if (updatedCloud && updatedVehicle) {
        // Vehicle exists in cloud but not locally — add it to local cache
        localVehicles.push(updatedVehicle);
        saveLocalVehicles(localVehicles);
        updatedLocal = true;
        console.log(TAG, `Vehicle ${vehicleId} not in local storage — added cloud version locally`);
      } else {
        console.warn(TAG, `Vehicle ${vehicleId} not found in local storage`);
      }
    } catch (err: any) {
      console.error(TAG, `Local update error for ${vehicleId}:`, err);
      if (!updatedCloud) {
        return {
          vehicle: null,
          updatedIn: 'local',
          error: err?.message || 'Failed to update in local storage',
        };
      }
    }

    // ── Result ──────────────────────────────────────────────────
    const success = updatedCloud || updatedLocal;
    const updatedIn: 'cloud' | 'local' | 'both' =
      updatedCloud && updatedLocal ? 'both'
        : updatedCloud ? 'cloud'
          : 'local';

    if (!success) {
      return {
        vehicle: null,
        updatedIn: 'local',
        error: `Vehicle ${vehicleId} not found`,
      };
    }
    console.log(TAG, `Vehicle ${vehicleId} updated (in: ${updatedIn})`);
    // Notify listeners of the update
    notifyChange('update', vehicleId);
    return { vehicle: updatedVehicle, updatedIn };
  },



  /**
   * Delete a vehicle from local storage and (if authenticated) from the cloud.
   * Also cleans up all related data:
   *   - vehicleSpecStore (weight/GVWR/fuel specs)
   *   - Zone caches (fetchVehicleZones + expeditionCache)
   *   - Pending vehicle configs
   *   - Builder state (if it references this vehicle)
   *
   * @param vehicleId  The ID of the vehicle to delete
   * @param userId     The authenticated user ID (optional; enables cloud deletion)
   * @returns          { success, deletedFrom, error? }
   */
  delete: async (
    vehicleId: string,
    userId?: string | null
  ): Promise<{ success: boolean; deletedFrom: 'cloud' | 'local' | 'both'; error?: string }> => {
    let deletedCloud = false;
    let deletedLocal = false;

    // ── 1. Cloud deletion (if authenticated with real UUID + Supabase configured) ──
    if (isSyncableUserId(userId) && isSupabaseConfigured) {

      try {
        // Delete the vehicle row
        const { error } = await supabase
          .from('vehicles')
          .delete()
          .eq('id', vehicleId);

        if (!error) {
          deletedCloud = true;
          console.log(TAG, `Deleted vehicle ${vehicleId} from cloud`);
        } else {
          console.warn(TAG, `Cloud delete failed for ${vehicleId}:`, error.message);
        }

        // Also attempt to delete related cloud data (zones, etc.)
        // The zones table has a foreign key on vehicle_id, so they may
        // cascade-delete depending on DB schema. Attempt explicit cleanup
        // in case cascade is not configured:
        try {
          await supabase
            .from('vehicle_zones')
            .delete()
            .eq('vehicle_id', vehicleId);
        } catch {
          // Non-critical: zones may have already been cascade-deleted
        }
      } catch (err: any) {
        console.warn(TAG, `Cloud delete error for ${vehicleId}:`, err);
        // Continue with local deletion even if cloud fails
      }
    }

    // ── 2. Local storage deletion ───────────────────────────────
    try {
      const localVehicles = getLocalVehicles();
      const originalCount = localVehicles.length;
      const filtered = localVehicles.filter(v => v.id !== vehicleId);

      if (filtered.length < originalCount) {
        saveLocalVehicles(filtered);
        deletedLocal = true;
        console.log(TAG, `Removed vehicle ${vehicleId} from local storage (${originalCount} → ${filtered.length})`);
      } else {
        // Vehicle wasn't in local storage (might be cloud-only)
        deletedLocal = deletedCloud; // Consider it "deleted" if cloud succeeded
        console.log(TAG, `Vehicle ${vehicleId} not found in local storage`);
      }
    } catch (err: any) {
      console.error(TAG, `Local delete error for ${vehicleId}:`, err);
      if (!deletedCloud) {
        return { success: false, deletedFrom: 'local', error: err?.message || 'Failed to remove from local storage' };
      }
    }

    // ── 3. Clean up all related data ────────────────────────────
    cleanupRelatedData(vehicleId);

    // ── Result ──────────────────────────────────────────────────
    const success = deletedCloud || deletedLocal;
    const deletedFrom: 'cloud' | 'local' | 'both' =
      deletedCloud && deletedLocal ? 'both'
        : deletedCloud ? 'cloud'
          : 'local';

    if (success) {
      console.log(TAG, `Vehicle ${vehicleId} fully deleted (from: ${deletedFrom})`);
      // Notify listeners of the deletion
      notifyChange('delete', vehicleId);
    }

    return { success, deletedFrom };
  },


  /**
   * Sync local vehicles to cloud when user authenticates.
   * Guard: userId must be a real UUID, not the 'local' sentinel.
   */
  syncToCloud: async (userId: string): Promise<{ synced: number; errors: number }> => {

    if (!isSupabaseConfigured) return { synced: 0, errors: 0 };
    // Guard: userId must be a real UUID, not the 'local' sentinel
    if (!isSyncableUserId(userId)) {
      console.warn(TAG, 'syncToCloud called with non-syncable userId:', userId?.slice(0, 12));
      return { synced: 0, errors: 0 };
    }


    const localVehicles = getLocalVehicles();
    const unsynced = localVehicles.filter(v => v.owner_user_id === 'local');

    if (unsynced.length === 0) return { synced: 0, errors: 0 };

    let synced = 0;
    let errors = 0;

    for (const vehicle of unsynced) {
      try {
        const { data, error } = await supabase
          .from('vehicles')
          .insert({
            owner_user_id: userId,
            name: vehicle.name,
            type: vehicle.type,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            current_fuel_percent: vehicle.current_fuel_percent,
            current_water_gal: vehicle.current_water_gal,
            created_at: vehicle.created_at,
            updated_at: new Date().toISOString(),
          })
          .select('*')
          .single();

        if (!error && data) {
          // Replace local vehicle with cloud version
          const idx = localVehicles.findIndex(v => v.id === vehicle.id);
          if (idx !== -1) {
            localVehicles[idx] = data;
          }
          synced++;
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }

    saveLocalVehicles(localVehicles);
    return { synced, errors };
  },

  /**
   * Invoke setup-vehicle-zones. Works with both cloud and local vehicle IDs.
   */
  finalizeConfig: async (
    vehicleId: string,
    zones: any[],
    selections: Record<string, string>,
    userId?: string | null,
    accessoryData?: { accessoryFramework?: any; containerZones?: any[] }
  ): Promise<{ success: boolean; totalSlots?: number; error?: string }> => {
    // If authenticated with real UUID, try cloud edge function
    if (isSyncableUserId(userId) && isSupabaseConfigured) {

      try {
        const { data, error } = await supabase.functions.invoke('setup-vehicle-zones', {
          body: {
            vehicle_id: vehicleId,
            zones,
            wizard_config: selections,
            vehicle_type: selections.vehicle_type || 'vehicle',
            accessory_framework: accessoryData?.accessoryFramework || null,
            container_zones: accessoryData?.containerZones || null,
          },
        });

        if (!error && data) {
          // Also persist accessory data locally for offline access
          try {
            const localVehicles = getLocalVehicles();
            const idx = localVehicles.findIndex(v => v.id === vehicleId);
            if (idx !== -1) {
              if (accessoryData?.accessoryFramework) {
                (localVehicles[idx] as any).accessoryFramework = accessoryData.accessoryFramework;
              }
              if (accessoryData?.containerZones) {
                (localVehicles[idx] as any).containerZones = accessoryData.containerZones;
              }
              (localVehicles[idx] as any).wizard_config = selections;
              (localVehicles[idx] as any).zones = zones;
              localVehicles[idx].updated_at = new Date().toISOString();
              saveLocalVehicles(localVehicles);
            }
          } catch (e) {
            console.warn(TAG, 'Failed to cache accessory data locally after cloud save:', e);
          }
          // Notify listeners that vehicle config was finalized (cloud path)
          notifyChange('finalize', vehicleId);
          return { success: true, totalSlots: data.total_slots || 20 };
        }

        console.warn(TAG, 'Edge function failed:', error);
      } catch (err) {
        console.warn(TAG, 'Edge function error:', err);
      }
    }


    // Offline: store config locally
    try {
      const localVehicles = getLocalVehicles();
      const idx = localVehicles.findIndex(v => v.id === vehicleId);
      if (idx !== -1) {
        (localVehicles[idx] as any).wizard_config = selections;
        (localVehicles[idx] as any).zones = zones;
        // PHASE 2: Persist accessoryFramework + containerZones
        if (accessoryData?.accessoryFramework) {
          (localVehicles[idx] as any).accessoryFramework = accessoryData.accessoryFramework;
        }
        if (accessoryData?.containerZones) {
          (localVehicles[idx] as any).containerZones = accessoryData.containerZones;
        }
        localVehicles[idx].updated_at = new Date().toISOString();
        saveLocalVehicles(localVehicles);
      }

      // Also store in a separate key for pending sync
      const pendingRaw = lsGet(PENDING_CONFIGS_KEY);
      const pending = pendingRaw ? JSON.parse(pendingRaw) : [];
      pending.push({
        vehicle_id: vehicleId,
        zones,
        wizard_config: selections,
        vehicle_type: selections.vehicle_type || 'vehicle',
        accessory_framework: accessoryData?.accessoryFramework || null,
        container_zones: accessoryData?.containerZones || null,
        created_at: new Date().toISOString(),
      });
      lsSet(PENDING_CONFIGS_KEY, JSON.stringify(pending));
      const totalSlots = zones.reduce((sum: number, z: any) => sum + (z.slotCount || 0), 0);
      // Notify listeners that vehicle config was finalized (local/offline path)
      notifyChange('finalize', vehicleId);
      return { success: true, totalSlots };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to save locally' };
    }

  },


  /**
   * Sync pending vehicle configurations to cloud
   */
  syncPendingConfigs: async (userId: string): Promise<number> => {
    if (!isSupabaseConfigured) return 0;

    const pendingRaw = lsGet(PENDING_CONFIGS_KEY);
    if (!pendingRaw) return 0;

    let pending: any[];
    try {
      pending = JSON.parse(pendingRaw);
    } catch {
      return 0;
    }

    if (pending.length === 0) return 0;

    let synced = 0;
    const remaining: any[] = [];

    for (const config of pending) {
      try {
        const { error } = await supabase.functions.invoke('setup-vehicle-zones', {
          body: config,
        });

        if (!error) {
          synced++;
        } else {
          remaining.push(config);
        }
      } catch {
        remaining.push(config);
      }
    }

    lsSet(PENDING_CONFIGS_KEY, JSON.stringify(remaining));
    return synced;
  },
};


