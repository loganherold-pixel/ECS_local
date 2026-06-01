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

console.log('Startup warning hygiene checks passed.');
