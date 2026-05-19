const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const routing = read('lib/deviceConnectionSourceRouting.ts');
const unified = read('lib/useUnifiedDeviceConnections.ts');
const scannerContract = read('lib/unifiedScannerContract.ts');
const ecoflowDiscovery = read('lib/ecoflowUnifiedScannerDiscovery.ts');
const powerScreen = read('app/power/blu.tsx');

assert(
  routing.includes('hasLocalBluetoothSource(device)') &&
    routing.includes('if (hasLocalBluetoothSource(device)) return false'),
  'EcoFlow hybrid/API+BLE records must not be treated as cloud-only connection targets.',
);
assert(
  unified.includes('const hasLocalBluetoothSource =') &&
    unified.includes("record.sources.includes('ble') || record.sources.includes('classic_bluetooth')") &&
    unified.includes('localSourceRecord ??') &&
    unified.includes('const resolvedId = hasLocalBluetoothSource && localSourceId ? localSourceId : record.id') &&
    unified.includes('hasLocalBluetoothSource\n        ? true'),
  'Merged EcoFlow API+BLE records must preserve the local BLE id and native Bluetooth requirement.',
);
assert(
  unified.includes("providerId === 'ecoflow'") &&
    unified.includes('genericBluetoothAccessoryManager.connect') &&
    unified.includes("native_connect_skipped_for_cloud_device"),
  'EcoFlow BLE connect path must remain native/generic BLE while cloud-only records skip native Bluetooth.',
);
assert(
  unified.includes("failedReason: errorSource") &&
    unified.includes('BLE discovery continues'),
  'EcoFlow cloud auth failures must be source diagnostics so BLE discovery can continue independently.',
);
assert(
  ecoflowDiscovery.includes('classifyEcoFlowCloudErrorSource') &&
    ecoflowDiscovery.includes("'cloud_auth'") &&
    ecoflowDiscovery.includes("'cloud_config'") &&
    ecoflowDiscovery.includes("'cloud_device_status'") &&
    ecoflowDiscovery.includes('throw new EcoFlowCloudDiscoveryError'),
  'EcoFlow cloud errors must be classified separately from native BLE errors.',
);
assert(
  scannerContract.includes("'cloud_auth'") &&
    scannerContract.includes("'cloud_access'") &&
    scannerContract.includes("'cloud_config'") &&
    scannerContract.includes("'cloud_device_status'") &&
    scannerContract.includes("return 'native_ble'"),
  'Unified scanner error source contract must distinguish cloud and native BLE failures.',
);
assert(
  powerScreen.includes('connections.nearbyDevices.filter(isRealNearbyReleaseDevice)') &&
    powerScreen.includes('EcoFlow cloud authorization problems do not create Bluetooth failure rows') &&
    !powerScreen.includes('connections.attentionDevices.map'),
  'Power-device Bluetooth UI must show nearby BLE advertisements without failed/needs-attention cloud rows.',
);

console.log('EcoFlow cloud/BLE separation checks passed.');
