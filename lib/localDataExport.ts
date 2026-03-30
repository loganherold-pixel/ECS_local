/**
 * Local Data Export Engine
 *
 * Gathers all offline-only data from IndexedDB / localStorage stores,
 * bundles it into a structured JSON object with metadata, and triggers
 * a file download (web) or share sheet (native).
 *
 * Ensures users who accumulated data in local-only mode don't lose it
 * before signing in or switching devices.
 *
 * Exported data includes:
 *   - Trips (expeditions)
 *   - Load items (gear/equipment)
 *   - Load map slots (vehicle zone assignments)
 *   - Waypoints (GPS tracks)
 *   - Fuel/water logs
 *   - Routes (imported GPX/KML)
 *   - Loadouts (gear loadout profiles)
 *   - Loadout items
 *   - Vehicles (local vehicle profiles)
 *   - Vehicle specs (GVWR, weight, fuel)
 *   - Expedition log (completed expedition records)
 *   - User settings
 */
import { Platform } from 'react-native';
import {
  tripStore,
  loadItemStore,
  loadMapSlotStore,
  waypointStore,
  fuelWaterLogStore,
  userSettingsStore,
} from './storage';
import { routeStore } from './routeStore';
import { vehicleSpecStore } from './vehicleSpecStore';
import { expeditionStateStore } from './expeditionStateStore';
import { getDocumentDirectory, fsWriteString } from './fsCompat';


// ── Types ────────────────────────────────────────────────────
export interface LocalDataExport {
  _meta: {
    export_version: string;
    export_date: string;
    device_platform: string;
    device_user_agent: string | null;
    item_counts: Record<string, number>;
    total_items: number;
  };
  trips: any[];
  load_items: any[];
  load_map_slots: any[];
  waypoints: any[];
  fuel_water_logs: any[];
  routes: any[];
  loadouts: any[];
  loadout_items: any[];
  vehicles: any[];
  vehicle_specs: Record<string, any>;
  expedition_log: any[];
  user_settings: any | null;
}

// ── Gather all local data ────────────────────────────────────
export async function gatherLocalData(): Promise<LocalDataExport> {
  // Gather from IndexedDB / localStorage stores
  const [
    trips,
    loadItems,
    loadMapSlots,
    waypoints,
    fuelWaterLogs,
    userSettings,
  ] = await Promise.all([
    tripStore.getAll().catch(() => []),
    loadItemStore.getAllIncludeDeleted().catch(() => []),
    loadMapSlotStore.getAllIncludeDeleted().catch(() => []),
    waypointStore.getAllIncludeDeleted().catch(() => []),
    fuelWaterLogStore.getAllIncludeDeleted().catch(() => []),
    userSettingsStore.get().catch(() => null),
  ]);

  // Routes (localStorage-based, synchronous)
  let routes: any[] = [];
  try {
    routes = routeStore.getAll();
  } catch {}

  // Vehicles (localStorage-based)
  let vehicles: any[] = [];
  try {
    const raw = Platform.OS === 'web' && typeof localStorage !== 'undefined'
      ? localStorage.getItem('ecs_local_vehicles')
      : null;
    if (raw) vehicles = JSON.parse(raw);
  } catch {}

  // Vehicle specs
  let vehicleSpecs: Record<string, any> = {};
  try {
    vehicleSpecs = vehicleSpecStore.getAll();
  } catch {}

  // Loadouts (localStorage-based)
  let loadouts: any[] = [];
  let loadoutItems: any[] = [];
  try {
    const loadoutsRaw = Platform.OS === 'web' && typeof localStorage !== 'undefined'
      ? localStorage.getItem('ecs_local_loadouts')
      : null;
    if (loadoutsRaw) loadouts = JSON.parse(loadoutsRaw);
  } catch {}
  try {
    const loadoutItemsRaw = Platform.OS === 'web' && typeof localStorage !== 'undefined'
      ? localStorage.getItem('ecs_local_loadout_items')
      : null;
    if (loadoutItemsRaw) loadoutItems = JSON.parse(loadoutItemsRaw);
  } catch {}

  // Expedition log
  let expeditionLog: any[] = [];
  try {
    expeditionLog = expeditionStateStore.getLog();
  } catch {}

  // Filter out soft-deleted items for the "active" counts
  const activeTrips = trips.filter((t: any) => !t.deleted_at);
  const activeLoadItems = loadItems.filter((i: any) => !i.deleted_at);
  const activeWaypoints = waypoints.filter((w: any) => !w.deleted_at);
  const activeFuelWaterLogs = fuelWaterLogs.filter((l: any) => !l.deleted_at);

  const itemCounts: Record<string, number> = {
    trips: activeTrips.length,
    load_items: activeLoadItems.length,
    load_map_slots: loadMapSlots.filter((s: any) => !s.deleted_at && s.load_item_id).length,
    waypoints: activeWaypoints.length,
    fuel_water_logs: activeFuelWaterLogs.length,
    routes: routes.length,
    loadouts: loadouts.length,
    loadout_items: loadoutItems.length,
    vehicles: vehicles.length,
    vehicle_specs: Object.keys(vehicleSpecs).length,
    expedition_log_entries: expeditionLog.length,
  };

  const totalItems = Object.values(itemCounts).reduce((a, b) => a + b, 0);

  // Build user agent string
  let userAgent: string | null = null;
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      userAgent = navigator.userAgent;
    }
  } catch {}

  return {
    _meta: {
      export_version: '1.0.0',
      export_date: new Date().toISOString(),
      device_platform: Platform.OS,
      device_user_agent: userAgent,
      item_counts: itemCounts,
      total_items: totalItems,
    },
    trips,
    load_items: loadItems,
    load_map_slots: loadMapSlots,
    waypoints,
    fuel_water_logs: fuelWaterLogs,
    routes,
    loadouts,
    loadout_items: loadoutItems,
    vehicles,
    vehicle_specs: vehicleSpecs,
    expedition_log: expeditionLog,
    user_settings: userSettings,
  };
}

// ── Trigger file download (web) ──────────────────────────────
function downloadJsonFile(data: LocalDataExport, filename: string): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
}

// ── Trigger share sheet (native) ─────────────────────────────
async function shareJsonFile(data: LocalDataExport, filename: string): Promise<void> {
  try {
    // Try expo-sharing if available
    const Sharing = await import('expo-sharing').catch(() => null);

    const docDir = await getDocumentDirectory();
    if (Sharing && docDir) {
      const jsonStr = JSON.stringify(data, null, 2);
      const fileUri = docDir + filename;
      await fsWriteString(fileUri, jsonStr);

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Export Local Data',
          UTI: 'public.json',
        });
        return;
      }
    }

  } catch (e) {
    console.warn('[LocalDataExport] Native share failed:', e);
  }

  // Fallback: log to console
  console.log('[LocalDataExport] Data exported (console fallback):', JSON.stringify(data).length, 'bytes');
}

// ── Main export function ─────────────────────────────────────
export async function exportLocalData(): Promise<{
  success: boolean;
  totalItems: number;
  error?: string;
}> {
  try {
    const data = await gatherLocalData();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `ecs-local-data-${timestamp}.json`;

    if (Platform.OS === 'web') {
      downloadJsonFile(data, filename);
    } else {
      await shareJsonFile(data, filename);
    }

    return {
      success: true,
      totalItems: data._meta.total_items,
    };
  } catch (e: any) {
    console.error('[LocalDataExport] Export failed:', e);
    return {
      success: false,
      totalItems: 0,
      error: e?.message || 'Export failed',
    };
  }
}

// ── Quick count (for UI badge / preview) ─────────────────────
export async function getLocalDataCounts(): Promise<{
  total: number;
  counts: Record<string, number>;
}> {
  try {
    const data = await gatherLocalData();
    return {
      total: data._meta.total_items,
      counts: data._meta.item_counts,
    };
  } catch {
    return { total: 0, counts: {} };
  }
}

