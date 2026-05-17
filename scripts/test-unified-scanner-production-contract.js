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

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, results);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

const contract = read('lib/unifiedScannerContract.ts');
const unifiedExport = read('lib/unifiedScanner.ts');
const hook = read('lib/useUnifiedDeviceConnections.ts');
const aggregator = read('lib/unifiedDeviceDiscoveryAggregator.ts');
const deviceConnectionsScreen = read('app/power/blu.tsx');
const quickActions = read('components/QuickActionsSheet.tsx');
const connectionStep = read('components/power-setup/ConnectionStep.tsx');
const powerSetupScreen = read('app/power/setup.tsx');
const ecoFlowCloudDevicesScreen = read('app/power/devices.tsx');
const powerDiscovery = read('src/features/power/services/powerDiscoveryService.ts');
const powerScanner = read('src/features/power/components/PowerDeviceScanner.tsx');
const appConfig = JSON.parse(read('app.json'));
const androidManifest = read('android/app/src/main/AndroidManifest.xml');
const blePermissions = read('src/power/ble/BlePermissions.ts');
const bleReadiness = read('src/power/ble/BleScanReadiness.ts');
const realDeviceDoc = read('docs/bluetooth-real-device-testing.md');

for (const state of [
  'idle',
  'permission_required',
  'bluetooth_off',
  'scanning',
  'discovered',
  'connecting',
  'connected',
  'streaming',
  'disconnecting',
  'disconnected',
  'error',
]) {
  assert(contract.includes(`| '${state}'`), `scanner contract must include ${state} state`);
}

for (const category of ['power_device', 'obd2', 'unknown_supported', 'unsupported']) {
  assert(contract.includes(`| '${category}'`), `scanner contract must include ${category} category`);
}

for (const provider of ['ecoflow', 'bluetti', 'jackery', 'anker', 'goalzero', 'generic_obd2', 'unknown']) {
  assert(contract.includes(`| '${provider}'`), `scanner contract must include ${provider} provider`);
}

for (const transport of ['ble', 'classic_bluetooth', 'cloud', 'unknown']) {
  assert(contract.includes(`| '${transport}'`), `scanner contract must include ${transport} transport`);
}

for (const source of ['native_ble', 'cloud_auth', 'cloud_access', 'cloud_config', 'cloud_device_status', 'parser', 'permission', 'transport', 'app_state']) {
  assert(contract.includes(`| '${source}'`), `scanner contract must include ${source} error source`);
}

assert(
  unifiedExport.includes("from './useUnifiedDeviceConnections'") &&
    unifiedExport.includes("from './useUnifiedOBD2Scanner'") &&
    unifiedExport.includes("from './unifiedScannerContract'"),
  'lib/unifiedScanner.ts must be the canonical exported scanner API',
);
assert(
  hook.includes('scannerDevices: UnifiedScannerDevice[]') &&
    hook.includes('scannerSnapshot: UnifiedScannerSnapshot') &&
    hook.includes('createUnifiedScannerSnapshot'),
  'unified hook must expose normalized scanner devices and snapshot',
);
assert(
  hook.indexOf("if (manualScanStatus !== 'idle' && isPermissionIssue(obdError))") <
    hook.indexOf('if (visibleScanResultCount > 0)') &&
    hook.indexOf("if (manualScanStatus !== 'idle' && hasRuntimeUnsupportedSource)") <
      hook.indexOf('if (visibleScanResultCount > 0)') &&
    hook.indexOf("if (manualScanStatus !== 'idle' && isBluetoothUnavailable(obdError))") <
      hook.indexOf('if (visibleScanResultCount > 0)'),
  'native BLE permission/runtime/powered-off states must take priority over cloud/API result rows',
);
assert(
  contract.includes("transport === 'cloud'") &&
    contract.includes("return 'streaming'") &&
    !contract.includes("if (transport === 'cloud') {\n    if (device.isLive) return 'streaming';\n    if (device.isConnecting) return 'connecting';\n    if (device.isConnected) return 'connected';"),
  'cloud devices must not be normalized as native Bluetooth connected before telemetry/handshake truth is known',
);
assert(
  appConfig.expo.plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === 'react-native-ble-plx'),
  'app.json must be parseable while scanner config is inspected',
);
assert(
  JSON.stringify(appConfig).includes('react-native-ble-plx') &&
    JSON.stringify(appConfig.expo.android.permissions).includes('android.permission.BLUETOOTH_SCAN') &&
    JSON.stringify(appConfig.expo.android.permissions).includes('android.permission.BLUETOOTH_CONNECT') &&
    JSON.stringify(appConfig.expo.android.permissions).includes('android.permission.ACCESS_FINE_LOCATION'),
  'Expo config must declare the native BLE plugin and Android scan/connect/location permissions',
);
assert(
  appConfig.expo.ios.infoPlist.NSBluetoothAlwaysUsageDescription &&
    appConfig.expo.ios.infoPlist.NSBluetoothPeripheralUsageDescription,
  'iOS config must include Bluetooth usage descriptions',
);
assert(
  androidManifest.includes('android.permission.BLUETOOTH_SCAN') &&
    androidManifest.includes('android.permission.BLUETOOTH_CONNECT') &&
    androidManifest.includes('android.permission.ACCESS_FINE_LOCATION'),
  'Android native manifest must contain Bluetooth scan/connect and fine-location permissions',
);
assert(
  blePermissions.includes('BLUETOOTH_SCAN') &&
    blePermissions.includes('BLUETOOTH_CONNECT') &&
    blePermissions.includes('ACCESS_FINE_LOCATION') &&
    blePermissions.includes('PermissionsAndroid.requestMultiple'),
  'BLE permissions must be requested through the central permission helper',
);
assert(
  bleReadiness.includes('getExpoGoRuntimeState') &&
    bleReadiness.includes('isBleRuntimeUnsupported') &&
    bleReadiness.includes('ensureBleScanReadiness') &&
    bleReadiness.includes('waitForBlePoweredOn') &&
    bleReadiness.includes("'bluetooth_off'") &&
    bleReadiness.includes("'permission_denied'"),
  'BLE readiness must distinguish Expo Go/web, permissions, and powered-off Bluetooth before scanning',
);
assert(
  realDeviceDoc.includes('Expo Go') &&
    realDeviceDoc.includes('development build') &&
    realDeviceDoc.includes('BLUETOOTH_SCAN') &&
    realDeviceDoc.includes('Bluetooth-off') &&
    realDeviceDoc.includes('permission-required'),
  'real-device Bluetooth testing doc must explain native build requirements and failure states',
);
assert(
  hook.includes("connection_state: 'connecting'") &&
    hook.includes("result.connected ? 'connected' : 'error'") &&
    hook.includes("result.connected ? 'connected' : 'unavailable'"),
  'EcoFlow cloud authorization failures must not pre-register devices as Bluetooth-connected',
);

for (const [label, source] of [
  ['unified hook', hook],
  ['aggregator', aggregator],
]) {
  assert(!source.includes('discoverMockDevicesForUnifiedScanner'), `${label} must not expose mock discovery`);
  assert(!source.includes("[BT_SCAN:MOCK]"), `${label} must not log a production mock scan source`);
  assert(!source.includes("makeDiscoverySourceSummary('mock'"), `${label} must not create a mock source summary`);
}
assert(!aggregator.includes("| 'mock'"), 'UnifiedDiscoverySource must not include a production mock lane');

assert(
  deviceConnectionsScreen.includes('useUnifiedDeviceConnections') &&
    deviceConnectionsScreen.includes('isRealNearbyPowerDevice') &&
    deviceConnectionsScreen.includes('connections.nearbyDevices.filter(isRealNearbyPowerDevice)') &&
    deviceConnectionsScreen.includes('Real nearby Bluetooth advertisements only') &&
    !deviceConnectionsScreen.includes('Saved / Known') &&
    !deviceConnectionsScreen.includes('Saved and known devices') &&
    !deviceConnectionsScreen.includes('Failed / Needs Attention') &&
    !deviceConnectionsScreen.includes('Failed and needs attention') &&
    !deviceConnectionsScreen.includes('connections.attentionDevices.map') &&
    !deviceConnectionsScreen.includes('connections.connectedDevices.map') &&
    !deviceConnectionsScreen.includes('connections.knownDevices') &&
    !deviceConnectionsScreen.includes('SectionFilterButton') &&
    !deviceConnectionsScreen.includes('label="Known"'),
  'Device Connections screen must use the unified scanner nearby power list without saved/known/failed production containers',
);
assert(
  quickActions.includes('useUnifiedDeviceConnections') &&
    !quickActions.includes('label="Known"') &&
    !quickActions.includes("case 'known'") &&
    !quickActions.includes('BluetoothFilterButton') &&
    !quickActions.includes('label="Attention"') &&
    !quickActions.includes('connections.attentionDevices.length') &&
    quickActions.includes('const visibleDevices = connections.nearbyDevices') &&
    quickActions.includes('Saved, known, failed, and cloud-only records stay out of this actionable scan list.'),
  'Field Utilities Bluetooth panel must use unified scanner nearby state and omit known/attention/failed filters',
);
assert(
  connectionStep.includes('useUnifiedDeviceConnections') &&
    !connectionStep.includes('useBluConnection') &&
    connectionStep.includes('production unified scanner'),
  'power setup connection step must be backed by the unified scanner and not the legacy BLU hook',
);
assert(
  powerSetupScreen.includes("router.replace('/power/blu')") &&
    !powerSetupScreen.includes('ProviderSelectionStep') &&
    !powerSetupScreen.includes('ConnectionStep'),
  'legacy power setup route must redirect to the canonical Device Connections scanner',
);
assert(
  ecoFlowCloudDevicesScreen.includes('This is a cloud catalog selector, not a Bluetooth scanner.') &&
    !ecoFlowCloudDevicesScreen.includes('BLE Active'),
  'EcoFlow cloud catalog must not claim native BLE support for provider rows',
);
assert(
  powerScanner.includes('UnifiedScannerDevice') &&
    !powerScanner.includes('PowerDiscoveredDevice'),
  'legacy power scanner component must consume the canonical scanner device contract',
);
assert(
  powerDiscovery.includes('return [];') &&
    !powerDiscovery.includes('adapter.discover'),
  'parallel feature power discovery service must not scan independently of the unified engine',
);

const productionFiles = walk(root).filter((file) => {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  return (
    !rel.startsWith('scripts/') &&
    !rel.startsWith('docs/') &&
    !rel.includes('__tests__/') &&
    !rel.includes('/test/') &&
    rel !== 'lib/useBluConnection.ts' &&
    rel !== 'lib/createSimulatedBluAdapter.ts' &&
    rel !== 'src/vehicle-telemetry/useOBD2Scanner.ts' &&
    rel !== 'src/power/connectors/MockPowerConnector.ts'
  );
});

for (const file of productionFiles) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const source = fs.readFileSync(file, 'utf8');
  assert(!/from ['"].*useBluConnection['"]/.test(source), `${rel} must not import legacy useBluConnection`);
  assert(!/useBluConnection\(/.test(source), `${rel} must not call legacy useBluConnection`);
  if (rel !== 'lib/useUnifiedDeviceConnections.ts' && rel !== 'lib/useUnifiedOBD2Scanner.ts') {
    assert(!/from ['"].*useOBD2Scanner['"]/.test(source), `${rel} must not import raw OBD scanner hook`);
    assert(!/useOBD2Scanner\(/.test(source), `${rel} must not call raw OBD scanner hook`);
  }
  assert(!/discoverMockDevicesForUnifiedScanner/.test(source), `${rel} must not import mock scanner discovery`);
  assert(!/from ['"].*createSimulatedBluAdapter['"]/.test(source), `${rel} must not import simulated BLU adapters`);
  assert(!/from ['"].*MockPowerConnector['"]/.test(source), `${rel} must not import mock power connector`);
}

console.log('Unified scanner production contract checks passed.');
