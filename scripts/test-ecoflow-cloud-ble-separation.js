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
const selectionStore = read('lib/ecoFlowSelectionStore.ts');
const ecoflowLive = read('lib/useEcoFlowLive.ts');
const providerRegistry = read('lib/EcsProviderRegistry.ts');

assert(
  routing.includes('function hasCloudTelemetrySource') &&
    routing.includes('if (hasCloudTelemetrySource(device)) return true;') &&
    routing.includes('if (hasLocalBluetoothSource(device)) return false;'),
  'EcoFlow hybrid/API+BLE records must prefer the cloud telemetry target when a cloud source is available, while pure BLE remains local/parser-pending.',
);
assert(
  unified.includes('const hasLocalBluetoothSource =') &&
    unified.includes("record.sources.includes('ble') || record.sources.includes('classic_bluetooth')") &&
    unified.includes('findEcoFlowCloudMatchForLocalDiscovery') &&
    unified.includes('const apiDeviceId = sourceIds?.api ?? ecoFlowCloudMatch?.sourceIds?.api ?? ecoFlowCloudMatch?.id') &&
    unified.includes('const preferEcoFlowCloudTelemetry =') &&
    unified.includes('const resolvedId = preferEcoFlowCloudTelemetry') &&
    unified.includes("const resolvedConnectionType = preferEcoFlowCloudTelemetry") &&
    unified.includes('localSourceRecord ??') &&
    unified.includes('preferEcoFlowCloudTelemetry\n        ? false'),
  'Merged EcoFlow API+BLE records must preserve local evidence while using the API id/connection lane for telemetry connection.',
);
assert(
  unified.includes("providerId === 'ecoflow'") &&
    unified.includes('genericBluetoothAccessoryManager.connect') &&
    unified.includes("native_connect_skipped_for_cloud_device"),
  'EcoFlow pure BLE connect path must remain native/generic BLE while cloud-capable records skip native Bluetooth.',
);
assert(
  unified.includes("await powerDeviceStore.addSelected('EcoFlow', device.rawId)") &&
    !unified.includes("await powerDeviceStore.setSelected('EcoFlow', [device.rawId])") &&
    unified.includes("await powerDeviceStore.removeSelected('EcoFlow', device.rawId)") &&
    unified.includes('nearbyDevices.length + connectedDevices.length + attentionDevices.length'),
  'EcoFlow Cloud connects must append to the multi-device selection, disconnects must remove one device, and scan results must count visible connected Cloud/API devices.',
);
assert(
  selectionStore.includes("powerDeviceStore.addSelected('EcoFlow', deviceId)") &&
    !selectionStore.includes("powerDeviceStore.setSelected('EcoFlow', [deviceId])"),
  'Legacy EcoFlow selection persistence must not collapse the Bluestack multi-device cloud selection.',
);
assert(
  ecoflowLive.includes("!selectedFromStore.includes(persistedId)") &&
    ecoflowLive.includes("await powerDeviceStore.addSelected('EcoFlow', persistedId)") &&
    ecoflowLive.includes('!activeDeviceIds.includes(persistedId)') &&
    !ecoflowLive.includes('selectedFromStore.length !== 1'),
  'EcoFlow live hook must keep its legacy selected device included without forcing cloud polling back to one device.',
);
assert(
  providerRegistry.includes("source === 'ble_live' || source === 'provider_cloud'") &&
    providerRegistry.includes('!reading.telemetryUnsupported') &&
    providerRegistry.includes('!reading.isStale'),
  'Provider registry must treat decoded EcoFlow provider-cloud readings as live telemetry.',
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
  powerScreen.includes('const byId = new Map<string, ECSDeviceConnectionModel>()') &&
    powerScreen.includes('...connections.nearbyDevices') &&
    powerScreen.includes('...connections.attentionDevices') &&
    powerScreen.includes('EcoFlow cloud authorization problems do not create Bluetooth failure rows') &&
    !powerScreen.includes('connections.attentionDevices.map'),
  'Power-device Bluetooth UI must show nearby BLE advertisements and visible cloud/API attention rows without treating them as Bluetooth failures.',
);

console.log('EcoFlow cloud/BLE separation checks passed.');
