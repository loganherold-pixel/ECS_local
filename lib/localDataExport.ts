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
import { loadoutItemStore, loadoutStore } from './loadoutStore';
import { setupStore } from './setupStore';
import { vehicleSetupStore } from './vehicleSetupStore';
import { vehicleStore } from './vehicleStore';
import { vehicleSpecStore } from './vehicleSpecStore';
import { expeditionStateStore } from './expeditionStateStore';
import { getDocumentDirectory, fsReadFileFromPickerUri, fsWriteString } from './fsCompat';


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
  setup_state?: {
    active_vehicle_id: string | null;
    setup_vehicle_id: string | null;
    setup_complete: boolean;
    onboarding_complete: boolean;
  } | null;
}

export interface LocalDataImportResult {
  success: boolean;
  canceled?: boolean;
  totalItems: number;
  importedCounts: Record<string, number>;
  skippedCounts: Record<string, number>;
  error?: string;
}

// ── Gather all local data ────────────────────────────────────
export async function gatherLocalData(): Promise<LocalDataExport> {
  await Promise.all([
    vehicleStore.waitForHydration().catch(() => {}),
    loadoutStore.waitForHydration().catch(() => {}),
    vehicleSpecStore.waitForHydration().catch(() => {}),
    vehicleSetupStore.waitForHydration().catch(() => {}),
    setupStore.waitForHydration().catch(() => {}),
  ]);

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
    vehicles = vehicleStore.getLocalSnapshot();
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
    loadouts = loadoutStore.getLocalSnapshot();
  } catch {}
  try {
    loadoutItems = loadoutItemStore.getLocalSnapshot();
  } catch {}

  // Expedition log
  let expeditionLog: any[] = [];
  try {
    expeditionLog = expeditionStateStore.getLog();
  } catch {}

  let setupState: LocalDataExport['setup_state'] = null;
  try {
    setupState = {
      active_vehicle_id: vehicleSetupStore.getActiveVehicleId(),
      setup_vehicle_id: setupStore.getSetupVehicleId(),
      setup_complete: setupStore.isComplete(),
      onboarding_complete: vehicleSetupStore.hasCompletedOnboarding(),
    };
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
    setup_state: setupState,
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

function readJsonFileFromWebPicker(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Unable to read the selected JSON file.'));
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.readAsText(file);
    };

    document.body.appendChild(input);
    input.click();
    setTimeout(() => {
      try {
        document.body.removeChild(input);
      } catch {}
    }, 5000);
  });
}

async function pickLocalDataImportJson(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return readJsonFileFromWebPicker();
  }

  const DocumentPicker = await import('expo-document-picker' as any);
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  return fsReadFileFromPickerUri(result.assets[0].uri);
}

function parseLocalDataImport(rawJson: string): Partial<LocalDataExport> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Selected file is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Selected JSON is not an ECS local data export.');
  }

  const data = parsed as Partial<LocalDataExport>;
  const hasKnownExportShape =
    !!data._meta ||
    Array.isArray(data.vehicles) ||
    !!data.vehicle_specs ||
    Array.isArray(data.trips) ||
    Array.isArray(data.loadouts);

  if (!hasKnownExportShape) {
    throw new Error('Selected JSON does not contain ECS local data.');
  }

  return data;
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function addCount(target: Record<string, number>, key: string, value: number): void {
  target[key] = (target[key] || 0) + Math.max(0, value);
}

export async function importLocalData(): Promise<LocalDataImportResult> {
  const importedCounts: Record<string, number> = {};
  const skippedCounts: Record<string, number> = {};

  try {
    const rawJson = await pickLocalDataImportJson();
    if (!rawJson) {
      return {
        success: false,
        canceled: true,
        totalItems: 0,
        importedCounts,
        skippedCounts,
      };
    }

    const data = parseLocalDataImport(rawJson);

    const trips = asArray(data.trips);
    if (trips.length) {
      await tripStore.bulkUpsert(trips);
      addCount(importedCounts, 'trips', trips.length);
    }

    const loadItems = asArray(data.load_items);
    if (loadItems.length) {
      await loadItemStore.bulkUpsert(loadItems);
      addCount(importedCounts, 'load_items', loadItems.length);
    }

    const loadMapSlots = asArray(data.load_map_slots);
    if (loadMapSlots.length) {
      await loadMapSlotStore.bulkUpsert(loadMapSlots);
      addCount(importedCounts, 'load_map_slots', loadMapSlots.length);
    }

    const waypoints = asArray(data.waypoints);
    if (waypoints.length) {
      await waypointStore.bulkUpsert(waypoints);
      addCount(importedCounts, 'waypoints', waypoints.length);
    }

    const fuelWaterLogs = asArray(data.fuel_water_logs);
    if (fuelWaterLogs.length) {
      await fuelWaterLogStore.bulkUpsert(fuelWaterLogs);
      addCount(importedCounts, 'fuel_water_logs', fuelWaterLogs.length);
    }

    const routeResult = routeStore.bulkUpsert(asArray(data.routes));
    addCount(importedCounts, 'routes', routeResult.imported);
    addCount(skippedCounts, 'routes', routeResult.skipped);

    const vehicleResult = await vehicleStore.importLocalSnapshot(asArray(data.vehicles));
    addCount(importedCounts, 'vehicles', vehicleResult.imported);
    addCount(skippedCounts, 'vehicles', vehicleResult.skipped);

    const specs = data.vehicle_specs && typeof data.vehicle_specs === 'object' && !Array.isArray(data.vehicle_specs)
      ? data.vehicle_specs
      : {};
    for (const [vehicleId, spec] of Object.entries(specs)) {
      if (!vehicleId || !spec || typeof spec !== 'object') {
        addCount(skippedCounts, 'vehicle_specs', 1);
        continue;
      }
      vehicleSpecStore.set(vehicleId, spec as any);
      addCount(importedCounts, 'vehicle_specs', 1);
    }

    const loadoutResult = await loadoutStore.importLocalSnapshot(asArray(data.loadouts));
    addCount(importedCounts, 'loadouts', loadoutResult.imported);
    addCount(skippedCounts, 'loadouts', loadoutResult.skipped);

    const loadoutItemResult = await loadoutItemStore.importLocalSnapshot(asArray(data.loadout_items));
    addCount(importedCounts, 'loadout_items', loadoutItemResult.imported);
    addCount(skippedCounts, 'loadout_items', loadoutItemResult.skipped);

    const logResult = expeditionStateStore.importLog(asArray(data.expedition_log));
    addCount(importedCounts, 'expedition_log_entries', logResult.imported);
    addCount(skippedCounts, 'expedition_log_entries', logResult.skipped);

    if (data.user_settings && typeof data.user_settings === 'object') {
      await userSettingsStore.save(data.user_settings as any);
      addCount(importedCounts, 'user_settings', 1);
    }

    const importedVehicles = asArray(data.vehicles);
    const restoredVehicleId =
      data.setup_state?.active_vehicle_id ||
      data.setup_state?.setup_vehicle_id ||
      importedVehicles.find((vehicle) => vehicle?.id)?.id ||
      null;
    if (restoredVehicleId) {
      vehicleSetupStore.setActiveVehicleId(restoredVehicleId);
      setupStore.setSetupVehicleId(restoredVehicleId);
      setupStore.markComplete(restoredVehicleId);
      vehicleSetupStore.markOnboardingComplete();
      addCount(importedCounts, 'setup_state', 1);
    }

    await Promise.all([
      vehicleStore.flush().catch(() => {}),
      loadoutStore.waitForHydration().catch(() => {}),
      vehicleSpecStore.flush().catch(() => {}),
      vehicleSetupStore.flush().catch(() => {}),
      setupStore.flush().catch(() => {}),
    ]);

    const totalItems = Object.values(importedCounts).reduce((sum, count) => sum + count, 0);
    return {
      success: true,
      totalItems,
      importedCounts,
      skippedCounts,
    };
  } catch (e: any) {
    console.error('[LocalDataExport] Import failed:', e);
    return {
      success: false,
      totalItems: 0,
      importedCounts,
      skippedCounts,
      error: e?.message || 'Import failed',
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

