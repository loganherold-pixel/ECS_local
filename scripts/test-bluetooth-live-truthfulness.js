const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sourceContract = read('lib/bluetoothLiveTelemetry.ts');
assert(sourceContract.includes("'ble_live'"), 'source contract must include ble_live');
assert(sourceContract.includes("'provider_cloud'"), 'source contract must include provider_cloud');
assert(sourceContract.includes("'cache'"), 'source contract must include cache');
assert(sourceContract.includes("'unavailable'"), 'source contract must include unavailable');
assert(sourceContract.includes("'mock_dev'"), 'source contract must include mock_dev');
assert(sourceContract.includes('EXPO_PUBLIC_ECS_ENABLE_MOCK_BLUETOOTH'), 'mock source must be gated by an explicit env flag');
assert(sourceContract.includes('return false'), 'mock flag default must be disabled');

const bluStore = read('lib/BluStateStore.ts');
assert(bluStore.includes('shouldAcceptBluetoothTelemetry(source)'), 'BLU store must reject disabled mock telemetry');
assert(bluStore.includes('[BT_LIVE] mock_disabled'), 'BLU store must log disabled mock attempts');
assert(bluStore.includes('[BT_LIVE] telemetry_decoded'), 'BLU store must log decoded telemetry');
assert(bluStore.includes('[BT_LIVE] telemetry_unsupported'), 'BLU store must log unsupported telemetry');

const nativeAdapter = read('lib/createNativeBleBluAdapter.ts');
for (const marker of [
  '[BT_LIVE] device_connected',
  '[BT_LIVE] services_discovered',
  '[BT_LIVE] characteristic_update',
  '[BT_LIVE] telemetry_decoded',
  '[BT_LIVE] telemetry_unsupported',
]) {
  assert(nativeAdapter.includes(marker), `native BLE adapter must log ${marker}`);
}
assert(!nativeAdapter.includes('inputWatts = 1'), 'native BLE adapter must not fake input watts from battery state');
assert(!nativeAdapter.includes('outputWatts = 1'), 'native BLE adapter must not fake output watts from battery state');

const simulatedFiles = [
  'lib/createSimulatedBluAdapter.ts',
  'lib/BluettiBluAdapter.ts',
  'lib/AnkerSolixBluAdapter.ts',
  'lib/JackeryBluAdapter.ts',
  'lib/GoalZeroBluAdapter.ts',
  'lib/RenogyBluAdapter.ts',
];
for (const file of simulatedFiles) {
  const content = read(file);
  assert(content.includes('isDevMockTelemetryAllowed'), `${file} must gate simulated Bluetooth behavior`);
  assert(content.includes('[BT_LIVE] mock_disabled'), `${file} must log disabled mock behavior`);
}

const unified = read('lib/useUnifiedDeviceConnections.ts');
assert(unified.includes('telemetrySourceLabel'), 'unified device model must expose telemetry source labels');
assert(unified.includes('[BT_LIVE] control_page_source'), 'control pages must log selected telemetry source');
assert(unified.includes('Connected over Bluetooth; telemetry is not decoded'), 'unsupported live devices must be truthful');

const ui = read('app/power/blu.tsx');
assert(ui.includes('Provider Cloud'), 'device control UI must label provider cloud telemetry');
assert(ui.includes('Source:'), 'device control UI footer must expose telemetry source');

console.log('Bluetooth live truthfulness checks passed.');
