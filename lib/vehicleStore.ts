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
import { supabase, isDeployedEdgeFunction, isSupabaseConfigured } from './supabase';
import { consumablesStore } from './consumablesStore';
import { createPersistedKeyValueCache } from './keyValuePersistence';
import { tiresLiftStore } from './tiresLiftStore';
import { vehicleSetupStore } from './vehicleSetupStore';
import { vehicleSpecStore } from './vehicleSpecStore';
import { ecsLog } from './ecsLogger';
import type { Vehicle } from './types';

const TAG = '[VehicleStore]';
const LS_KEY = 'ecs_local_vehicles';
const SYNC_FLAG_KEY = 'ecs_vehicles_synced';

function logVehicleStoreDebug(message: string, details?: Record<string, unknown>): void {
  ecsLog.dev('CONFIG', message, details, {
    tag: TAG,
    debugFlag: 'ECS_DEBUG_VEHICLE_STORE',
    fingerprint: `${message}:${JSON.stringify(details ?? {})}`,
    throttleMs: 2500,
    aggregateWindowMs: 30_000,
  });
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    };
  }
  return { errorMessage: String(error) };
}

function logVehicleStoreWarn(message: string, details?: Record<string, unknown>): void {
  ecsLog.warn('CONFIG', `${TAG} ${message}`, details);
}

function logVehicleStoreError(message: string, error: unknown, details?: Record<string, unknown>): void {
  ecsLog.error('CONFIG', `${TAG} ${message}`, error, details);
}

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

const localVehicleCache = createPersistedKeyValueCache('ecs_vehicle_store');

function lsGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return localVehicleCache.get(key);
}

function lsSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
  }
  localVehicleCache.set(key, value);
}

function lsRemove(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {}
  localVehicleCache.delete(key);
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

function hasMeaningfulVehicleValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return true;
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
  logVehicleStoreDebug('Change event', { type, vehicleId, revision: changeRevision });
  changeListeners.forEach(fn => {
    try { fn(event); } catch (e) {
      logVehicleStoreWarn('Change listener error', errorDetails(e));
    }
  });
}

// ── Local Vehicle CRUD ───────────────────────────────────

function getLocalVehicles(): Vehicle[] {
  const raw = lsGet(LS_KEY);
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as Vehicle[]).map(normalizeVehicleRecord);
  } catch {
    return [];
  }
}

function saveLocalVehicles(vehicles: Vehicle[]): void {
  lsSet(LS_KEY, JSON.stringify(vehicles.map(normalizeVehicleRecord)));
}

async function ensureVehicleStorageHydrated(): Promise<void> {
  await localVehicleCache.waitForHydration();
}

async function flushVehicleStorage(): Promise<void> {
  await localVehicleCache.flush();
}

/**
 * Remove all cached data related to a specific vehicle.
 * Called internally by vehicleStore.delete.
 */
function cleanupRelatedData(vehicleId: string): void {
  // 1. Remove vehicle specs (weight, GVWR, fuel specs)
  try {
    vehicleSpecStore.remove(vehicleId);
    logVehicleStoreDebug('Removed specs for vehicle', { vehicleId });
  } catch (e) {
    logVehicleStoreWarn('Failed to remove vehicle specs', { vehicleId, ...errorDetails(e) });
  }

  try {
    consumablesStore.remove(vehicleId);
    logVehicleStoreDebug('Removed consumables for vehicle', { vehicleId });
  } catch (e) {
    logVehicleStoreWarn('Failed to remove vehicle consumables', { vehicleId, ...errorDetails(e) });
  }

  try {
    tiresLiftStore.remove(vehicleId);
    logVehicleStoreDebug('Removed tires/lift config for vehicle', { vehicleId });
  } catch (e) {
    logVehicleStoreWarn('Failed to remove tires/lift config', { vehicleId, ...errorDetails(e) });
  }

  // 2. Remove fetchVehicleZones.ts zone cache
  try {
    lsRemove(ZONE_CACHE_PREFIX + vehicleId);
    logVehicleStoreDebug('Removed zone cache for vehicle', { vehicleId });
  } catch {}

  // 3. Remove expeditionCache.ts zone cache
  try {
    lsRemove(EXP_ZONE_CACHE_PREFIX + vehicleId);
    logVehicleStoreDebug('Removed expedition zone cache for vehicle', { vehicleId });
  } catch {}

  // 4. Clean up pending vehicle configs that reference this vehicle
  try {
    const pendingRaw = lsGet(PENDING_CONFIGS_KEY);
    if (pendingRaw) {
      const pending: any[] = JSON.parse(pendingRaw);
      const filtered = pending.filter((c: any) => c.vehicle_id !== vehicleId);
      if (filtered.length !== pending.length) {
        lsSet(PENDING_CONFIGS_KEY, JSON.stringify(filtered));
        logVehicleStoreDebug('Removed pending vehicle config entries', {
          vehicleId,
          removedCount: pending.length - filtered.length,
        });
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
        logVehicleStoreDebug('Reset builder state for deleted vehicle', { vehicleId });
      }
    }
  } catch {}
}

// ── Updatable vehicle fields (excludes id, owner_user_id, created_at) ──
type VehicleLocalExtensions = {
  wizard_config?: Record<string, any>;
  zones?: any[];
  accessoryFramework?: any;
  containerZones?: any[];
};

export type VehicleUpdateData =
  Partial<Omit<Vehicle, 'id' | 'owner_user_id' | 'created_at' | 'updated_at'>>
  & VehicleLocalExtensions;

const LOCAL_ONLY_UPDATE_KEYS = new Set([
  'battery_usable_wh',
  'fuel_type',
  'base_weight_lb',
  'curb_weight_lb',
  'empty_weight_lb',
  'gvwr_lb',
  'front_base_weight_lb',
  'rear_base_weight_lb',
  'front_gawr_lb',
  'rear_gawr_lb',
  'wheelbase_in',
  'tire_size_inches',
  'tire_width_inches',
  'wheel_diameter_inches',
  'tire_model',
  'suspension_lift_inches',
  'is_leveled',
  'front_level_inches',
  'ground_clearance_inches',
  'overall_length_in',
  'overall_width_in',
  'overall_height_in',
  'track_width_front_in',
  'track_width_rear_in',
  'approach_angle_deg',
  'breakover_angle_deg',
  'departure_angle_deg',
  'turning_diameter_ft',
  'wizard_config',
  'zones',
  'accessoryFramework',
  'containerZones',
]);

const LOCAL_ONLY_VEHICLE_FIELDS: (keyof Vehicle)[] = [
  'battery_usable_wh',
  'fuel_type',
  'base_weight_lb',
  'curb_weight_lb',
  'empty_weight_lb',
  'gvwr_lb',
  'front_base_weight_lb',
  'rear_base_weight_lb',
  'front_gawr_lb',
  'rear_gawr_lb',
  'wheelbase_in',
  'tire_size_inches',
  'tire_width_inches',
  'wheel_diameter_inches',
  'tire_model',
  'suspension_lift_inches',
  'is_leveled',
  'front_level_inches',
  'ground_clearance_inches',
  'overall_length_in',
  'overall_width_in',
  'overall_height_in',
  'track_width_front_in',
  'track_width_rear_in',
  'approach_angle_deg',
  'breakover_angle_deg',
  'departure_angle_deg',
  'turning_diameter_ft',
];

export function normalizeVehicleRecord(vehicle: Vehicle): Vehicle {
  return {
    ...vehicle,
    notes: vehicle.notes ?? null,
    fuel_tank_capacity_gal: vehicle.fuel_tank_capacity_gal ?? null,
    avg_mpg: vehicle.avg_mpg ?? null,
    current_fuel_percent: vehicle.current_fuel_percent ?? 100,
    water_capacity_gal: vehicle.water_capacity_gal ?? null,
    current_water_gal: vehicle.current_water_gal ?? 0,
    water_updated_at: vehicle.water_updated_at ?? null,
    battery_usable_wh: vehicle.battery_usable_wh ?? null,
    fuel_type: vehicle.fuel_type ?? null,
    base_weight_lb: vehicle.base_weight_lb ?? null,
    curb_weight_lb: vehicle.curb_weight_lb ?? null,
    empty_weight_lb: vehicle.empty_weight_lb ?? null,
    gvwr_lb: vehicle.gvwr_lb ?? null,
    front_base_weight_lb: vehicle.front_base_weight_lb ?? null,
    rear_base_weight_lb: vehicle.rear_base_weight_lb ?? null,
    front_gawr_lb: vehicle.front_gawr_lb ?? null,
    rear_gawr_lb: vehicle.rear_gawr_lb ?? null,
    wheelbase_in: vehicle.wheelbase_in ?? null,
    tire_size_inches: vehicle.tire_size_inches ?? null,
    tire_width_inches: vehicle.tire_width_inches ?? null,
    wheel_diameter_inches: vehicle.wheel_diameter_inches ?? null,
    tire_model: vehicle.tire_model ?? null,
    suspension_lift_inches: Math.max(0, Number(vehicle.suspension_lift_inches) || 0),
    is_leveled: Boolean(vehicle.is_leveled ?? false),
    front_level_inches: vehicle.front_level_inches ?? null,
    ground_clearance_inches: vehicle.ground_clearance_inches ?? null,
    overall_length_in: vehicle.overall_length_in ?? null,
    overall_width_in: vehicle.overall_width_in ?? null,
    overall_height_in: vehicle.overall_height_in ?? null,
    track_width_front_in: vehicle.track_width_front_in ?? null,
    track_width_rear_in: vehicle.track_width_rear_in ?? null,
    approach_angle_deg: vehicle.approach_angle_deg ?? null,
    breakover_angle_deg: vehicle.breakover_angle_deg ?? null,
    departure_angle_deg: vehicle.departure_angle_deg ?? null,
    turning_diameter_ft: vehicle.turning_diameter_ft ?? null,
  };
}

function mergeLocalOnlyVehicleFields<T extends Vehicle>(target: T, localVersion: Vehicle | null | undefined): T {
  if (!localVersion) return target;
  const merged = { ...target } as any;
  for (const field of LOCAL_ONLY_VEHICLE_FIELDS) {
    if (
      hasMeaningfulVehicleValue((localVersion as any)[field]) &&
      !hasMeaningfulVehicleValue(merged[field])
    ) {
      merged[field] = (localVersion as any)[field];
    }
  }
  return normalizeVehicleRecord(merged as Vehicle) as T;
}

function buildCloudPayload(data: VehicleUpdateData, now: string): Record<string, any> {
  const payload: Record<string, any> = { updated_at: now };
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && !LOCAL_ONLY_UPDATE_KEYS.has(key)) {
      payload[key] = value;
    }
  }
  return payload;
}

function mergeWizardConfig(existing: any, incoming: any): any {
  if (!incoming || typeof incoming !== 'object') {
    return existing;
  }
  if (!existing || typeof existing !== 'object') {
    return incoming;
  }
  return {
    ...existing,
    ...incoming,
    _resources: incoming._resources ?? existing._resources,
  };
}

export const vehicleStore = {
  waitForHydration: async (): Promise<void> => {
    await ensureVehicleStorageHydrated();
  },

  flush: async (): Promise<void> => {
    await flushVehicleStorage();
  },

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
   * Get the current local vehicle snapshot synchronously.
   * Useful for first-run and local-only UI flows that need to reason
   * about vehicle count without starting an async fetch.
   */
  getLocalSnapshot: (): Vehicle[] => getLocalVehicles(),

  importLocalSnapshot: async (incomingVehicles: Vehicle[]): Promise<{ imported: number; skipped: number }> => {
    await ensureVehicleStorageHydrated();
    const localVehicles = getLocalVehicles();
    const byId = new Map(localVehicles.map((vehicle) => [vehicle.id, vehicle]));
    let imported = 0;
    let skipped = 0;

    for (const incoming of incomingVehicles) {
      if (!incoming?.id) {
        skipped++;
        continue;
      }

      const normalized = normalizeVehicleRecord(incoming);
      const existing = byId.get(normalized.id);
      if (
        existing?.updated_at &&
        normalized.updated_at &&
        new Date(existing.updated_at).getTime() > new Date(normalized.updated_at).getTime()
      ) {
        skipped++;
        continue;
      }

      byId.set(normalized.id, normalized);
      imported++;
    }

    if (imported > 0) {
      saveLocalVehicles(Array.from(byId.values()));
      await flushVehicleStorage();
      notifyChange('sync', null);
    }

    return { imported, skipped };
  },



  /**
   * Get all vehicles. If authenticated + online, fetches from Supabase.
   * Otherwise returns local vehicles.
   */
  getAll: async (userId?: string | null): Promise<{ vehicles: Vehicle[]; source: 'cloud' | 'local' | 'merged' }> => {
    await ensureVehicleStorageHydrated();
    const localVehicles = getLocalVehicles();

    // If we have a valid (non-'local') user and Supabase is configured, try cloud fetch
    if (isSyncableUserId(userId) && isSupabaseConfigured && isDeployedEdgeFunction('setup-vehicle-zones')) {

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
              const fallbackFields: (keyof Vehicle)[] = [
                'name',
                'type',
                'make',
                'model',
                'year',
                'avg_mpg',
                'fuel_tank_capacity_gal',
                'water_capacity_gal',
                'battery_usable_wh',
              ];
              for (const field of fallbackFields) {
                if (!hasMeaningfulVehicleValue((merged as any)[field]) && hasMeaningfulVehicleValue((localVersion as any)[field])) {
                  (merged as any)[field] = (localVersion as any)[field];
                }
              }
              Object.assign(merged, mergeLocalOnlyVehicleFields(merged as Vehicle, localVersion));
              if ((localVersion as any).accessoryFramework) {
                merged.accessoryFramework = (localVersion as any).accessoryFramework;
              }
              if ((localVersion as any).containerZones) {
                merged.containerZones = (localVersion as any).containerZones;
              }
              if ((localVersion as any).wizard_config) {
                const localWizardConfig = (localVersion as any).wizard_config;
                merged.wizard_config = {
                  ...((cloudVehicle as any).wizard_config || {}),
                  ...localWizardConfig,
                  _resources: localWizardConfig?._resources ?? (cloudVehicle as any)?.wizard_config?._resources,
                };
              }
              if ((localVersion as any).zones) {
                merged.zones = (localVersion as any).zones;
              }
              if ((localVersion as any).battery_usable_wh !== undefined) {
                merged.battery_usable_wh = (localVersion as any).battery_usable_wh;
              }
              return normalizeVehicleRecord(merged as Vehicle);
            }
            return normalizeVehicleRecord(cloudVehicle);
          });

          // Also include any locally persisted vehicles not yet present in cloud.
          // This covers both true local/offline vehicles and signed-in fallback
          // writes that were durably saved before cloud creation/sync completed.
          const cloudIds = new Set(data.map((v: Vehicle) => v.id));
          const localOnly = localVehicles.filter((v) => {
            if (cloudIds.has(v.id)) return false;
            return v.owner_user_id === 'local' || v.owner_user_id === userId;
          });

          if (localOnly.length > 0) {
            return { vehicles: [...mergedCloudVehicles, ...localOnly.map(normalizeVehicleRecord)], source: 'merged' };
          }
          return { vehicles: mergedCloudVehicles.map(normalizeVehicleRecord), source: 'cloud' };
        }
      } catch (err) {
        logVehicleStoreWarn('Cloud fetch failed, using local', errorDetails(err));
      }
    }

    // Fallback to local
    return { vehicles: localVehicles.map(normalizeVehicleRecord), source: 'local' };
  },


  /**
   * Create a vehicle locally. If authenticated + online, also push to Supabase.
   */
  create: async (
    data: { name: string; make?: string; model?: string; year?: number | null },
    userId?: string | null
  ): Promise<{ vehicle: Vehicle | null; error?: string; source: 'cloud' | 'local' }> => {
    await ensureVehicleStorageHydrated();
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
              locals.push(normalizeVehicleRecord(cloudData as Vehicle));
              saveLocalVehicles(locals);
              await flushVehicleStorage();
            logVehicleStoreDebug('Cloud-created vehicle also saved locally', {
              vehicleId: cloudData.id,
            });
            }
          } catch (e) {
          }
          // Notify listeners that a vehicle was created (cloud path)
          notifyChange('create', cloudData.id);
          return { vehicle: cloudData, source: 'cloud' };
        }

        // Cloud failed — fall through to local
        logVehicleStoreWarn('Cloud create failed', {
          errorMessage: error?.message ?? String(error),
        });
      } catch (err) {
        logVehicleStoreWarn('Cloud create error', errorDetails(err));
      }
    }



    // Create locally
    const vehicle: Vehicle = {
      id: localId,
      // Local fallback records should remain explicitly local until they are
      // confirmed in cloud so restart/recovery never depends on optimistic
      // ownership assumptions.
      owner_user_id: 'local',
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
      battery_usable_wh: null,
      fuel_type: null,
      base_weight_lb: null,
      curb_weight_lb: null,
      empty_weight_lb: null,
      gvwr_lb: null,
      front_base_weight_lb: null,
      rear_base_weight_lb: null,
      front_gawr_lb: null,
      rear_gawr_lb: null,
      wheelbase_in: null,
      tire_size_inches: null,
      tire_width_inches: null,
      wheel_diameter_inches: null,
      tire_model: null,
      suspension_lift_inches: 0,
      is_leveled: false,
      front_level_inches: null,
      ground_clearance_inches: null,
      overall_length_in: null,
      overall_width_in: null,
      overall_height_in: null,
      track_width_front_in: null,
      track_width_rear_in: null,
      approach_angle_deg: null,
      breakover_angle_deg: null,
      departure_angle_deg: null,
      turning_diameter_ft: null,
      created_at: now,
      updated_at: now,
    };

    const locals = getLocalVehicles();
    locals.push(vehicle);
    saveLocalVehicles(locals);
    await flushVehicleStorage();

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
    await ensureVehicleStorageHydrated();
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
    const cloudPayload = buildCloudPayload(data, now);

    // ── 1. Cloud update (if authenticated with real UUID + Supabase configured) ──
    if (isSyncableUserId(userId) && isSupabaseConfigured) {

      try {
        if (Object.keys(cloudPayload).length > 1) {
          const { data: cloudData, error } = await supabase
            .from('vehicles')
            .update(cloudPayload)
            .eq('id', vehicleId)
            .eq('owner_user_id', userId)
            .select('*')
            .single();

          if (!error && cloudData) {
            updatedCloud = true;
            updatedVehicle = cloudData as Vehicle;
            logVehicleStoreDebug('Updated vehicle in cloud', { vehicleId });
          } else {
            logVehicleStoreWarn('Cloud update failed', {
              vehicleId,
              errorMessage: error?.message ?? String(error),
            });
            // Fall through to local update
          }
        }
      } catch (err: any) {
        logVehicleStoreWarn('Cloud update error', { vehicleId, ...errorDetails(err) });
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
        if ((existing as any).wizard_config || (payload as any).wizard_config) {
          (merged as any).wizard_config = mergeWizardConfig(
            (existing as any).wizard_config,
            (payload as any).wizard_config,
          );
        }
        if ((existing as any).zones && !(payload as any).zones) {
          (merged as any).zones = (existing as any).zones;
        }
        if ((existing as any).accessoryFramework && !(payload as any).accessoryFramework) {
          (merged as any).accessoryFramework = (existing as any).accessoryFramework;
        }
        if ((existing as any).containerZones && !(payload as any).containerZones) {
          (merged as any).containerZones = (existing as any).containerZones;
        }

        localVehicles[idx] = merged;
        saveLocalVehicles(localVehicles);
        await flushVehicleStorage();
        updatedLocal = true;
        // Use cloud version if available (it has server-generated fields),
        // otherwise use the locally merged version
        if (!updatedVehicle) {
          updatedVehicle = merged;
        }
        logVehicleStoreDebug('Updated vehicle in local storage', { vehicleId });
      } else if (updatedCloud && updatedVehicle) {
        // Vehicle exists in cloud but not locally — add it to local cache
        localVehicles.push(updatedVehicle);
        saveLocalVehicles(localVehicles);
        await flushVehicleStorage();
        updatedLocal = true;
        logVehicleStoreDebug('Added cloud vehicle version to local storage', { vehicleId });
      } else {
        logVehicleStoreWarn('Vehicle not found in local storage', { vehicleId });
      }
    } catch (err: any) {
      logVehicleStoreError('Local update error', err, { vehicleId });
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
    logVehicleStoreDebug('Vehicle updated', { vehicleId, updatedIn });
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
    await ensureVehicleStorageHydrated();
    let deletedCloud = false;
    let deletedLocal = false;

    // ── 1. Cloud deletion (if authenticated with real UUID + Supabase configured) ──
    if (isSyncableUserId(userId) && isSupabaseConfigured) {

      try {
        // Delete the vehicle row
        const { error } = await supabase
          .from('vehicles')
          .delete()
          .eq('id', vehicleId)
          .eq('owner_user_id', userId);

        if (!error) {
          deletedCloud = true;
          logVehicleStoreDebug('Deleted vehicle from cloud', { vehicleId });
        } else {
          logVehicleStoreWarn('Cloud delete failed', {
            vehicleId,
            errorMessage: error.message,
          });
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
        logVehicleStoreWarn('Cloud delete error', { vehicleId, ...errorDetails(err) });
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
        await flushVehicleStorage();
        deletedLocal = true;
        logVehicleStoreDebug('Removed vehicle from local storage', {
          vehicleId,
          originalCount,
          remainingCount: filtered.length,
        });
      } else {
        // Vehicle wasn't in local storage (might be cloud-only)
        deletedLocal = deletedCloud; // Consider it "deleted" if cloud succeeded
        logVehicleStoreDebug('Vehicle not found in local storage', { vehicleId });
      }
    } catch (err: any) {
      logVehicleStoreError('Local delete error', err, { vehicleId });
      if (!deletedCloud) {
        return { success: false, deletedFrom: 'local', error: err?.message || 'Failed to remove from local storage' };
      }
    }

    // ── 3. Clean up all related data ────────────────────────────
    cleanupRelatedData(vehicleId);

    if (vehicleSetupStore.getActiveVehicleId() === vehicleId) {
      vehicleSetupStore.clearActiveVehicleId();
      logVehicleStoreDebug('Cleared active vehicle context for deleted vehicle', { vehicleId });
    }

    // ── Result ──────────────────────────────────────────────────
    const success = deletedCloud || deletedLocal;
    const deletedFrom: 'cloud' | 'local' | 'both' =
      deletedCloud && deletedLocal ? 'both'
        : deletedCloud ? 'cloud'
          : 'local';

    if (success) {
      logVehicleStoreDebug('Vehicle fully deleted', { vehicleId, deletedFrom });
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
    await ensureVehicleStorageHydrated();

    if (!isSupabaseConfigured) return { synced: 0, errors: 0 };
    // Guard: userId must be a real UUID, not the 'local' sentinel
    if (!isSyncableUserId(userId)) {
      logVehicleStoreWarn('syncToCloud called with non-syncable userId', {
        userIdPrefix: String(userId).slice(0, 12),
      });
      return { synced: 0, errors: 0 };
    }


    const localVehicles = getLocalVehicles();
    let cloudIds = new Set<string>();
    try {
      const { data } = await supabase
        .from('vehicles')
        .select('id')
        .eq('owner_user_id', userId);
      if (Array.isArray(data)) {
        cloudIds = new Set(
          data
            .map((row: any) => (typeof row?.id === 'string' ? row.id : null))
            .filter((id: string | null): id is string => !!id),
        );
      }
    } catch (error) {
      logVehicleStoreWarn('Unable to fetch cloud vehicle ids before sync; falling back to local ownership check', errorDetails(error));
    }

    const unsynced = localVehicles.filter((v) => {
      if (cloudIds.has(v.id)) return false;
      return v.owner_user_id === 'local' || v.owner_user_id === userId;
    });

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
            fuel_tank_capacity_gal: vehicle.fuel_tank_capacity_gal,
            avg_mpg: vehicle.avg_mpg,
            current_fuel_percent: vehicle.current_fuel_percent,
            water_capacity_gal: vehicle.water_capacity_gal,
            current_water_gal: vehicle.current_water_gal,
            water_updated_at: vehicle.water_updated_at,
            created_at: vehicle.created_at,
            updated_at: new Date().toISOString(),
          })
          .select('*')
          .single();

        if (!error && data) {
          // Replace local vehicle with cloud version
          const idx = localVehicles.findIndex(v => v.id === vehicle.id);
          if (idx !== -1) {
            localVehicles[idx] = mergeLocalOnlyVehicleFields(
              normalizeVehicleRecord(data as Vehicle),
              vehicle,
            );
            if ((vehicle as any).wizard_config) {
              (localVehicles[idx] as any).wizard_config = (vehicle as any).wizard_config;
            }
            if ((vehicle as any).zones) {
              (localVehicles[idx] as any).zones = (vehicle as any).zones;
            }
            if ((vehicle as any).accessoryFramework) {
              (localVehicles[idx] as any).accessoryFramework = (vehicle as any).accessoryFramework;
            }
            if ((vehicle as any).containerZones) {
              (localVehicles[idx] as any).containerZones = (vehicle as any).containerZones;
            }
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
    await flushVehicleStorage();
    return { synced, errors };
  },

  /**
   * Invoke setup-vehicle-zones. Works with both cloud and local vehicle IDs.
   */
  finalizeConfig: async (
    vehicleId: string,
    zones: any[],
    selections: Record<string, any>,
    userId?: string | null,
    accessoryData?: { accessoryFramework?: any; containerZones?: any[] }
  ): Promise<{ success: boolean; totalSlots?: number; error?: string }> => {
    await ensureVehicleStorageHydrated();
    const existingVehicle = getLocalVehicles().find(v => v.id === vehicleId) as (Vehicle & { wizard_config?: Record<string, any> }) | undefined;
    const mergedSelections = {
      ...((existingVehicle as any)?.wizard_config || {}),
      ...selections,
      _resources: selections._resources ?? (existingVehicle as any)?.wizard_config?._resources,
    };

    // If authenticated with real UUID, try cloud edge function only when
    // this backend exposes it. Otherwise we go straight to the local path.
    if (isSyncableUserId(userId) && isSupabaseConfigured && isDeployedEdgeFunction('setup-vehicle-zones')) {

      try {
        const { data, error } = await supabase.functions.invoke('setup-vehicle-zones', {
          body: {
            vehicle_id: vehicleId,
            zones,
            wizard_config: mergedSelections,
            vehicle_type: mergedSelections.vehicle_type || 'vehicle',
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
              (localVehicles[idx] as any).wizard_config = mergedSelections;
              (localVehicles[idx] as any).zones = zones;
              localVehicles[idx].updated_at = new Date().toISOString();
              saveLocalVehicles(localVehicles);
              await flushVehicleStorage();
            }
          } catch (e) {
            logVehicleStoreWarn('Failed to cache accessory data locally after cloud save', {
              vehicleId,
              ...errorDetails(e),
            });
          }
          // Notify listeners that vehicle config was finalized (cloud path)
          notifyChange('finalize', vehicleId);
          return { success: true, totalSlots: data.total_slots || 20 };
        }

        logVehicleStoreWarn('setup-vehicle-zones cloud finalize failed; using local fallback', {
          vehicleId,
          errorName: (error as any)?.name ?? null,
          errorMessage: (error as any)?.message ?? String(error),
          status: (error as any)?.context?.status ?? (error as any)?.status ?? null,
          statusText: (error as any)?.context?.statusText ?? null,
        });
      } catch (err) {
        logVehicleStoreWarn('setup-vehicle-zones cloud finalize threw; using local fallback', {
          vehicleId,
          errorName: (err as any)?.name ?? null,
          errorMessage: (err as any)?.message ?? String(err),
          status: (err as any)?.context?.status ?? (err as any)?.status ?? null,
          statusText: (err as any)?.context?.statusText ?? null,
        });
      }
    }


    // Offline: store config locally
    try {
      const localVehicles = getLocalVehicles();
      const idx = localVehicles.findIndex(v => v.id === vehicleId);
      if (idx !== -1) {
        (localVehicles[idx] as any).wizard_config = mergedSelections;
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
        await flushVehicleStorage();
      }

      // Also store in a separate key for pending sync
      const pendingRaw = lsGet(PENDING_CONFIGS_KEY);
      const pending = pendingRaw ? JSON.parse(pendingRaw) : [];
      pending.push({
        vehicle_id: vehicleId,
        zones,
        wizard_config: mergedSelections,
        vehicle_type: mergedSelections.vehicle_type || 'vehicle',
        accessory_framework: accessoryData?.accessoryFramework || null,
        container_zones: accessoryData?.containerZones || null,
        created_at: new Date().toISOString(),
      });
      lsSet(PENDING_CONFIGS_KEY, JSON.stringify(pending));
      await flushVehicleStorage();
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
    await ensureVehicleStorageHydrated();
    if (!isSupabaseConfigured || !isDeployedEdgeFunction('setup-vehicle-zones')) return 0;

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
    await flushVehicleStorage();
    return synced;
  },
};


