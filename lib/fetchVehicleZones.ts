import { Platform } from 'react-native';
import { isDeployedEdgeFunction, supabase, unpackZonesRpcResult } from './supabase';

/**
 * Normalizes the server payload (zone_name, etc.) into the UI-friendly shape
 * expected by VehicleZonesCard (name, children[], etc.).
 */

function normalizeTreeNode(node: any): any {
  const children = Array.isArray(node?.children) ? node.children : [];

  return {
    ...node,

    // UI expects `name`
    name: node?.name ?? node?.zone_name ?? node?.zone_key ?? 'Unnamed Zone',

    // keep canonical fields too (optional, but helpful)
    zone_name: node?.zone_name ?? node?.name ?? node?.zone_key ?? 'Unnamed Zone',

    zone_type: node?.zone_type ?? 'area',
    parent_zone_id: node?.parent_zone_id ?? null,
    sort_order: node?.sort_order ?? 0,
    notes: node?.notes ?? null,

    // UI references these — default them if backend doesn't provide
    slot_count: typeof node?.slot_count === 'number' ? node.slot_count : 0,
    color: node?.color ?? null,
    icon: node?.icon ?? null,

    // recurse
    children: children.map(normalizeTreeNode),
  };
}

function normalizeFlatZone(z: any): any {
  return {
    ...z,

    // UI expects `name`
    name: z?.name ?? z?.zone_name ?? z?.zone_key ?? 'Unnamed Zone',

    // keep canonical fields too
    zone_name: z?.zone_name ?? z?.name ?? z?.zone_key ?? 'Unnamed Zone',

    zone_type: z?.zone_type ?? 'area',
    parent_zone_id: z?.parent_zone_id ?? null,
    sort_order: z?.sort_order ?? 0,
    notes: z?.notes ?? null,

    // UI references these — default them if backend doesn't provide
    slot_count: typeof z?.slot_count === 'number' ? z.slot_count : 0,
    color: z?.color ?? null,
    icon: z?.icon ?? null,
  };
}

// ── Local zone storage for offline access ───────────────
const ZONE_CACHE_PREFIX = 'ecs_vehicle_zones_';
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


function getCachedZones(vehicleId: string): { tree: any[]; flat: any[] } | null {
  const raw = lsGet(ZONE_CACHE_PREFIX + vehicleId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function cacheZones(vehicleId: string, data: { tree: any[]; flat: any[] }): void {
  lsSet(ZONE_CACHE_PREFIX + vehicleId, JSON.stringify(data));
}

/**
 * Also check local vehicle store for wizard-generated zones
 */
function getLocalVehicleZones(vehicleId: string): { tree: any[]; flat: any[] } | null {
  const raw = lsGet('ecs_local_vehicles');
  if (!raw) return null;
  try {
    const vehicles = JSON.parse(raw);
    const vehicle = vehicles.find((v: any) => v.id === vehicleId);
    if (!vehicle) return null;

    // Check for locally-stored zones from wizard
    if (vehicle.zones && Array.isArray(vehicle.zones) && vehicle.zones.length > 0) {
      const flat = vehicle.zones.map((z: any, i: number) => normalizeFlatZone({
        id: z.id || `local_zone_${i}`,
        vehicle_id: vehicleId,
        parent_zone_id: null,
        owner_user_id: vehicle.owner_user_id || 'local',
        name: z.name || z.zone_name || 'Zone',
        zone_type: z.zone_type || z.zoneType || 'area',
        slot_count: z.slot_count || z.slotCount || 0,
        color: z.color || null,
        icon: z.icon || null,
        sort_order: z.sort_order || i,
        notes: z.notes || null,
        default_position_x: z.default_position_x || null,
        default_position_y: z.default_position_y || null,
        default_position_z: z.default_position_z || null,
        zone_weight_total: z.zone_weight_total || null,
        created_at: vehicle.created_at || new Date().toISOString(),
        updated_at: vehicle.updated_at || new Date().toISOString(),
      }));

      return { tree: flat.map((z: any) => ({ ...z, children: [] })), flat };
    }

    return null;
  } catch {
    return null;
  }
}

export async function fetchVehicleZones(vehicleId: string) {
  // Try cloud first
  if (isDeployedEdgeFunction('get-vehicle-zones')) {
    try {
      const { data, error } = await supabase.functions.invoke('get-vehicle-zones', {
        body: { vehicle_id: vehicleId },
      });

      if (!error && data) {
        const result = unpackZonesRpcResult(data);
        if (result) {
          const rawTree = Array.isArray(result.tree_json) ? result.tree_json : [];
          const rawFlat = Array.isArray(result.zones_flat) ? result.zones_flat : [];

          const tree = rawTree.map(normalizeTreeNode);
          const flat = rawFlat.map(normalizeFlatZone);

          cacheZones(vehicleId, { tree, flat });

          return { tree, flat };
        }
      }
    } catch (err) {
      console.warn('[VehicleZones] Cloud fetch failed, checking local cache:', err);
    }
  } else {
    console.warn('[VehicleZones] Cloud zone fetch unavailable in current ECS backend; using cached/local data');
  }

  // Try cached zones
  const cached = getCachedZones(vehicleId);
  if (cached) {
    console.log('[VehicleZones] Using cached zones for', vehicleId);
    return cached;
  }

  // Try local vehicle store zones (from wizard)
  const localZones = getLocalVehicleZones(vehicleId);
  if (localZones) {
    console.log('[VehicleZones] Using local vehicle zones for', vehicleId);
    return localZones;
  }

  throw new Error('No zone data available (offline and no cache)');
}

/**
 * Clear the local zone cache for a specific vehicle.
 * Called during vehicle deletion to remove stale cached data.
 */
export function clearZoneCache(vehicleId: string): void {
  try {
    lsRemove(ZONE_CACHE_PREFIX + vehicleId);
    console.log('[VehicleZones] Cleared zone cache for', vehicleId);
  } catch (e) {
    console.warn('[VehicleZones] clearZoneCache error:', e);
  }
}

