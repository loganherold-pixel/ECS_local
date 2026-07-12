const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const androidAutoBridgeSource = read('lib/androidAutoBridge.ts');
const loadMapSource = read('app/(tabs)/loadmap.tsx');
const fetchVehicleZonesSource = read('lib/fetchVehicleZones.ts');
const appContextSource = read('context/AppContext.tsx');
const syncProcessorsSource = read('lib/syncProcessors.ts');
const syncActionQueueSource = read('lib/syncActionQueue.ts');
const loadoutSyncQueueSource = read('lib/loadoutSyncQueue.ts');
const dashboardHeaderSource = read('components/dashboard/DashboardHeader.tsx');
const profileSettingsPanelSource = read('components/ProfileSettingsPanel.tsx');

assert(
  androidAutoBridgeSource.includes("ecsLog.debug(\n    'SYSTEM',\n    reason === 'not_android'") ||
    androidAutoBridgeSource.includes("ecsLog.debug(\r\n    'SYSTEM',\r\n    reason === 'not_android'"),
  'AndroidAutoBridge optional inactive states should use debug logging.'
);

assert(
  androidAutoBridgeSource.includes("ecsLog.warn('SYSTEM', '[AndroidAutoBridge] Native module unavailable; bridge inactive'"),
  'AndroidAutoBridge should keep a production/native warning when the Android native module is expected but missing.'
);

assert(
  androidAutoBridgeSource.includes('let _lastInactiveLogKey') &&
    androidAutoBridgeSource.includes('if (_lastInactiveLogKey === reason) return;'),
  'AndroidAutoBridge inactive startup logs should be deduped.'
);

assert(
  !loadMapSource.includes('[LoadMap] No cached or local zone data available; showing empty vehicle load map'),
  'LoadMap should not warn for expected empty load-zone states.'
);

assert(
  fetchVehicleZonesSource.includes("return { tree: [], flat: [] };") &&
    !fetchVehicleZonesSource.includes("throw new Error('No zone data available"),
  'fetchVehicleZones should return an empty zone result instead of throwing for expected no-zone vehicles.'
);

assert(
  loadMapSource.includes('NO LOAD ZONES CONFIGURED') &&
    loadMapSource.includes('Add build/loadout data to populate the load map.'),
  'LoadMap should show a clear empty state and next step when zones are unavailable.'
);

assert(
  fetchVehicleZonesSource.includes('resolveVehicleContainerZones') &&
    fetchVehicleZonesSource.includes('readFleetBuildLoadoutState'),
  'fetchVehicleZones should derive zone data from existing accessory/build-loadout state before falling back empty.'
);

assert(
  syncProcessorsSource.includes('let syncProcessorsInitialized = false') &&
    syncProcessorsSource.includes('if (syncProcessorsInitialized) return false;') &&
    syncProcessorsSource.includes('syncProcessorsInitialized = true;') &&
    syncProcessorsSource.includes('return true;'),
  'Sync processor registration should be idempotent across repeated native startup/provider mounts.'
);

assert(
  syncActionQueueSource.includes('startAutoProcess(): boolean') &&
    syncActionQueueSource.includes('if (this._connectivityUnsub) return false;') &&
    syncActionQueueSource.includes('return true;'),
  'Sync action queue auto-process startup should report whether it actually installed a listener.'
);

assert(
  loadoutSyncQueueSource.includes('startAutoProcess(): boolean') &&
    loadoutSyncQueueSource.includes('if (this._connectivityUnsub) return false;') &&
    loadoutSyncQueueSource.includes('return true;'),
  'Loadout sync queue auto-process startup should report whether it actually installed a listener.'
);

assert(
  appContextSource.includes('const syncProcessorsStarted = initializeSyncProcessors();') &&
    appContextSource.includes('if (syncProcessorsStarted) {') &&
    appContextSource.includes('Sync queue processors are process-level listeners') &&
    !appContextSource.includes('return () => {\n      shutdownSyncProcessors();') &&
    !appContextSource.includes('return () => {\r\n      shutdownSyncProcessors();') &&
    appContextSource.includes('if (!startupStateHydrated || authLoading)') &&
    appContextSource.includes('const loadoutAutoProcessStarted = loadoutSyncQueue.startAutoProcess();') &&
    appContextSource.includes('if (loadoutAutoProcessStarted) {'),
  'App startup should avoid duplicate sync/loadout auto-process logs when queues were already active.'
);

assert(
  dashboardHeaderSource.includes('function platformTextShadow') &&
    dashboardHeaderSource.includes("...platformTextShadow('rgba(0,0,0,0.82)', 4)"),
  'Dashboard banner shadows should use the platform text-shadow adapter to avoid React Native Web deprecation noise.'
);

assert(
  profileSettingsPanelSource.includes('const PROFILE_PANEL_SHADOW') &&
    profileSettingsPanelSource.includes("boxShadow: '0px 10px 24px rgba(0,0,0,0.28)'") &&
    profileSettingsPanelSource.includes('...PROFILE_PANEL_SHADOW'),
  'Profile panel shadows should use web boxShadow while preserving platform-native shadows.'
);

console.log('Startup warning hygiene checks passed.');
