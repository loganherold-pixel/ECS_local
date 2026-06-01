import { isDeployedEdgeFunction, supabase, unpackZonesRpcResult } from './supabase';
import { createPersistedKeyValueCache } from './keyValuePersistence';
import { ecsLog } from './ecsLogger';
import { resolveVehicleContainerZones } from './accessoryFramework';
import { readFleetBuildLoadoutState } from './fleet/fleetBuildLoadout';

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

function loadZoneToZoneType(loadZone: string | null | undefined): string {
  const normalized = String(loadZone ?? '').toLowerCase();
  if (normalized.includes('roof') || normalized.includes('rack')) return 'rack';
  if (normalized.includes('hitch') || normalized.includes('trailer')) return 'hitch';
  if (normalized.includes('drawer')) return 'drawer';
  return 'area';
}

function mapDerivedZone(vehicle: any, zone: any, index: number): any {
  const zoneName = zone.name ?? zone.label ?? zone.zone_name ?? 'Load zone';
  const zoneType = zone.zone_type ?? zone.zoneType ?? loadZoneToZoneType(zone.loadZone ?? zone.id);
  return normalizeFlatZone({
    id: zone.id || `derived_zone_${index}`,
    vehicle_id: vehicle.id,
    parent_zone_id: null,
    owner_user_id: vehicle.owner_user_id || 'local',
    name: zoneName,
    zone_name: zoneName,
    zone_type: zoneType,
    slot_count: typeof zone.slot_count === 'number'
      ? zone.slot_count
      : typeof zone.slotCount === 'number'
        ? zone.slotCount
        : 0,
    color: zone.color || null,
    icon: zone.icon || null,
    sort_order: typeof zone.sort_order === 'number'
      ? zone.sort_order
      : typeof zone.sortOrder === 'number'
        ? zone.sortOrder
        : index,
    notes: zone.notes ?? (zone.status ? `Derived from ${zone.status} build data` : null),
    default_position_x: zone.default_position_x || null,
    default_position_y: zone.default_position_y || null,
    default_position_z: zone.default_position_z || null,
    zone_weight_total: zone.zone_weight_total || null,
    created_at: vehicle.created_at || new Date().toISOString(),
    updated_at: vehicle.updated_at || new Date().toISOString(),
  });
}

function zonesResultFromFlat(flat: any[]): { tree: any[]; flat: any[] } | null {
  if (flat.length === 0) return null;
  return { tree: flat.map((z: any) => ({ ...z, children: [] })), flat };
}

// ── Local zone storage for offline access ───────────────
const ZONE_CACHE_PREFIX = 'ecs_vehicle_zones_';
const zoneCache = createPersistedKeyValueCache('ecs_vehicle_zones');
const localVehicleCache = createPersistedKeyValueCache('ecs_vehicle_store');

async function ensureZonePersistenceHydrated(): Promise<void> {
  await Promise.all([
    zoneCache.waitForHydration(),
    localVehicleCache.waitForHydration(),
  ]);
}


function getCachedZones(vehicleId: string): { tree: any[]; flat: any[] } | null {
  const raw = zoneCache.get(ZONE_CACHE_PREFIX + vehicleId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function cacheZones(vehicleId: string, data: { tree: any[]; flat: any[] }): Promise<void> {
  zoneCache.set(ZONE_CACHE_PREFIX + vehicleId, JSON.stringify(data));
  await zoneCache.flush();
}

/**
 * Also check local vehicle store for wizard-generated zones
 */
function getLocalVehicleZones(vehicleId: string): { tree: any[]; flat: any[] } | null {
  const raw = localVehicleCache.get('ecs_local_vehicles');
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

    const derivedContainerZones = resolveVehicleContainerZones(vehicle);
    const derivedFlat = derivedContainerZones.map((zone: any, index: number) =>
      mapDerivedZone(vehicle, zone, index)
    );
    const derivedResult = zonesResultFromFlat(derivedFlat);
    if (derivedResult) {
      ecsLog.debug('MAP', '[VehicleZones] Derived zones from local accessory/build data', {
        vehicleId,
        zoneCount: derivedResult.flat.length,
      });
      return derivedResult;
    }

    const fleetBuildState = readFleetBuildLoadoutState(vehicle);
    const activeCompartments = fleetBuildState.compartments.filter((compartment: any) =>
      compartment.status !== 'removed'
    );
    const fleetBuildFlat = activeCompartments.map((compartment: any, index: number) =>
      mapDerivedZone(vehicle, {
        ...compartment,
        zone_type: loadZoneToZoneType(compartment.loadZone),
        sortOrder: index,
      }, index)
    );
    const fleetBuildResult = zonesResultFromFlat(fleetBuildFlat);
    if (fleetBuildResult) {
      ecsLog.debug('MAP', '[VehicleZones] Derived zones from Fleet Build & Loadout compartments', {
        vehicleId,
        zoneCount: fleetBuildResult.flat.length,
      });
      return fleetBuildResult;
    }

    return null;
  } catch {
    return null;
  }
}

export async function fetchVehicleZones(vehicleId: string) {
  await ensureZonePersistenceHydrated();

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

          await cacheZones(vehicleId, { tree, flat });

          return { tree, flat };
        }
      }
    } catch (err) {
      ecsLog.warn('MAP', '[VehicleZones] Cloud fetch failed; checking cached/local zones', {
        vehicleId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    ecsLog.debug('MAP', '[VehicleZones] Cloud zone fetch unavailable; using cached/local zones', {
      vehicleId,
    });
  }

  // Try cached zones
  const cached = getCachedZones(vehicleId);
  if (cached) {
    ecsLog.debug('MAP', '[VehicleZones] Using cached zones', { vehicleId });
    return cached;
  }

  // Try local vehicle store zones (from wizard)
  const localZones = getLocalVehicleZones(vehicleId);
  if (localZones) {
    ecsLog.debug('MAP', '[VehicleZones] Using local wizard zones', { vehicleId });
    return localZones;
  }

  ecsLog.debug('MAP', '[VehicleZones] No cached or local zone data; returning empty load-zone result', {
    vehicleId,
  });
  return { tree: [], flat: [] };
}

/**
 * Clear the local zone cache for a specific vehicle.
 * Called during vehicle deletion to remove stale cached data.
 */
export function clearZoneCache(vehicleId: string): void {
  try {
    zoneCache.delete(ZONE_CACHE_PREFIX + vehicleId);
    void zoneCache.flush();
    ecsLog.debug('MAP', '[VehicleZones] Cleared zone cache', { vehicleId });
  } catch (e) {
    ecsLog.warn('MAP', '[VehicleZones] Failed to clear zone cache', {
      vehicleId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

