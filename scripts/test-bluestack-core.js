const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
};

const {
  classifyBluestackDevice,
  isBluestackReleaseVisibleCategory,
} = loadTypeScriptModule('lib/bluestack/bluestackClassifier.ts');
const {
  createBluestackScannerSummary,
  getBluestackVisibleDeviceListLabel,
  isBluestackReleaseDeviceModel,
} = loadTypeScriptModule('lib/bluestack/bluestackScannerAdapter.ts');
const {
  getBluestackConnectionPolicy,
} = loadTypeScriptModule('lib/bluestack/bluestackConnectionPolicy.ts');
const {
  getBluestackProviderReadiness,
} = loadTypeScriptModule('lib/bluestack/bluestackProviderReadiness.ts');
const {
  canPromoteBluestackTelemetry,
  getBluestackParserDecision,
  getBluestackTelemetryParserProfile,
} = loadTypeScriptModule('lib/bluestack/bluestackTelemetryParserRegistry.ts');
const {
  identifyBluestackUtilitySensorProfile,
} = loadTypeScriptModule('lib/bluestack/bluestackUtilitySensorProfiles.ts');
const {
  decodeUtilitySensorLiveTelemetry,
} = loadTypeScriptModule('lib/utilitySensorBleTelemetry.ts');
const {
  getBluestackAdvertisementEvidence,
} = loadTypeScriptModule('lib/bluestack/bluestackAdvertisementEvidence.ts');
const {
  bluetoothAccessoryToEcsTelemetryEvents,
} = loadTypeScriptModule('src/telemetry/telemetryAdapters.ts');
const {
  getBluetoothDiagnosticsSnapshot,
  recordBluetoothDiagnosticEvent,
  resetBluetoothDiagnosticsForTests,
} = loadTypeScriptModule('lib/bluetoothDiagnostics.ts');
const {
  getUtilitySensorCurrentFromCapacity,
  selectUtilitySensorResourceStates,
} = loadTypeScriptModule('src/telemetry/utilitySensorTelemetrySelectors.ts');

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

const ecoflow = classifyBluestackDevice({
  providerId: 'ecoflow',
  providerLabel: 'EcoFlow',
  categoryLabel: 'Portable power station',
  kind: 'power',
});
assert.strictEqual(ecoflow.system, 'bluestack');
assert.strictEqual(ecoflow.category, 'power_device');
assert.strictEqual(ecoflow.domain, 'power');
assert.strictEqual(ecoflow.isReleaseVisible, true);
assert(ecoflow.capabilities.includes('power'));

const obd = classifyBluestackDevice({
  providerId: 'obd2',
  name: 'OBDLink MX+',
  kind: 'telemetry',
});
assert.strictEqual(obd.category, 'obd2');
assert.strictEqual(obd.domain, 'vehicle');
assert.strictEqual(obd.provider, 'generic_obd2');
assert(obd.capabilities.includes('telemetry'));

const propane = classifyBluestackDevice({
  providerId: 'unknown',
  name: 'Mopeka Pro Check Propane',
  kind: 'sensor',
});
assert.strictEqual(propane.category, 'propane_monitor');
assert.strictEqual(propane.domain, 'propane');
assert.strictEqual(propane.isReleaseVisible, true);
assert(propane.capabilities.includes('fluid_level'));

const water = classifyBluestackDevice({
  name: 'SeeLevel Fresh Water Tank Sensor',
  kind: 'sensor',
});
assert.strictEqual(water.category, 'water_tank_monitor');
assert.strictEqual(water.domain, 'water');
assert.strictEqual(water.isReleaseVisible, true);
assert(water.capabilities.includes('fluid_level'));

const headset = classifyBluestackDevice({
  name: 'Logan Headphones',
  kind: 'generic',
});
assert.strictEqual(headset.category, 'unknown_supported');
assert.strictEqual(headset.isReleaseVisible, false);

const dakota = classifyBluestackDevice({
  providerId: 'dakotalithium',
  name: 'Dakota Lithium Battery Monitor',
  kind: 'power',
});
assert.strictEqual(dakota.provider, 'dakota_lithium');
assert.strictEqual(dakota.category, 'power_device');

assert.strictEqual(isBluestackReleaseVisibleCategory('power_device'), true);
assert.strictEqual(isBluestackReleaseVisibleCategory('obd2'), true);
assert.strictEqual(isBluestackReleaseVisibleCategory('propane_monitor'), true);
assert.strictEqual(isBluestackReleaseVisibleCategory('water_tank_monitor'), true);
assert.strictEqual(isBluestackReleaseVisibleCategory('utility_sensor'), false);

const scannerDevices = [
  {
    id: 'ecoflow',
    kind: 'power',
    providerId: 'ecoflow',
    provider: 'EcoFlow',
    category: 'Portable power station',
    deviceCategory: 'power',
    section: 'nearby',
    isDiscoverable: true,
    isSelected: true,
    sourceBadges: ['BLE'],
    connectionType: 'ble',
  },
  {
    id: 'obd',
    kind: 'telemetry',
    providerId: 'obd2',
    section: 'nearby',
    isDiscoverable: true,
    isLive: true,
    sourceBadges: ['BLE'],
    connectionType: 'ble',
  },
  {
    id: 'propane',
    kind: 'sensor',
    name: 'Mopeka Propane',
    section: 'nearby',
    isDiscoverable: true,
    sourceBadges: ['BLE'],
    connectionType: 'ble',
  },
  {
    id: 'water',
    kind: 'sensor',
    name: 'Fresh Water Level Monitor',
    section: 'nearby',
    isDiscoverable: true,
    sourceBadges: ['BLE'],
    connectionType: 'ble',
  },
  {
    id: 'headset',
    kind: 'generic',
    name: 'Logan Headphones',
    section: 'nearby',
    isDiscoverable: true,
    sourceBadges: ['BLE'],
    connectionType: 'ble',
  },
];

assert.strictEqual(isBluestackReleaseDeviceModel(scannerDevices[0]), true);
assert.strictEqual(isBluestackReleaseDeviceModel(scannerDevices[4]), false);
assert.strictEqual(
  isBluestackReleaseDeviceModel({
    id: 'remembered-power',
    kind: 'power',
    providerId: 'ecoflow',
    provider: 'EcoFlow',
    category: 'Portable power station',
    deviceCategory: 'power',
    isRemembered: true,
    isDiscoverable: false,
    sourceBadges: ['Cached'],
  }),
  true,
  'remembered Bluestack devices must stay visible so offline/retry/autoreconnect state is not hidden',
);
assert(
  getBluestackVisibleDeviceListLabel(scannerDevices).includes('power, OBD2, propane, and water'),
  'Bluestack list copy should describe all release-visible domains',
);
const summary = createBluestackScannerSummary(scannerDevices);
assert.strictEqual(summary.availableCount, 4);
assert.strictEqual(summary.powerCount, 1);
assert.strictEqual(summary.obd2Count, 1);
assert.strictEqual(summary.propaneCount, 1);
assert.strictEqual(summary.waterCount, 1);
assert.strictEqual(summary.liveReadyCount, 3);
assert.strictEqual(summary.cloudApiCount, 1);
assert.strictEqual(summary.parserPendingCount, 0);
assert.strictEqual(summary.nativeBuildRequiredCount, 3);
assert.strictEqual(summary.liveCount, 1);
assert.strictEqual(summary.selectedCount, 1);
assert.strictEqual(summary.hiddenOrUnsupportedCount, 1);

resetBluetoothDiagnosticsForTests();
recordBluetoothDiagnosticEvent({
  type: 'scanner_snapshot',
  source: 'native_ble',
  message: 'Bluestack summary captured.',
  details: {
    scannerState: 'discovered',
    nearbyDeviceCount: summary.availableCount,
    bluestackCloudApiCount: summary.cloudApiCount,
    bluestackParserPendingCount: summary.parserPendingCount,
    bluestackNativeBuildRequiredCount: summary.nativeBuildRequiredCount,
    bluestackLiveReadyCount: summary.liveReadyCount,
  },
});
const diagnosticsSnapshot = getBluetoothDiagnosticsSnapshot();
assert.strictEqual(diagnosticsSnapshot.bluestackReadinessSummary.cloudApiCount, 1);
assert.strictEqual(diagnosticsSnapshot.bluestackReadinessSummary.parserPendingCount, 0);
assert.strictEqual(diagnosticsSnapshot.bluestackReadinessSummary.nativeBuildRequiredCount, 3);

const cloudPolicy = getBluestackConnectionPolicy({
  kind: 'power',
  providerId: 'ecoflow',
  provider: 'EcoFlow',
  category: 'Power station',
  connectionType: 'api',
  connectableViaCloud: true,
  requiresNativeBluetooth: false,
});
assert.strictEqual(cloudPolicy.lane, 'cloud_authorized');
assert.strictEqual(cloudPolicy.primaryActionLabel, 'Connect');
assert(cloudPolicy.statusDetail.includes('provider cloud/API path'));

const ecoflowReadiness = getBluestackProviderReadiness('ecoflow');
assert.strictEqual(ecoflowReadiness.connectionPath, 'hybrid');
assert(ecoflowReadiness.requiredSecretNames.includes('ECOFLOW_ACCESS_KEY'));
assert(ecoflowReadiness.requiredSecretNames.includes('ECOFLOW_SECRET_KEY'));
assert.strictEqual(ecoflowReadiness.parserId, 'ecoflow_cloud_api');
assert.strictEqual(ecoflowReadiness.parserDecisionAction, 'use_ecoflow_cloud');

const ecoflowParser = getBluestackTelemetryParserProfile('ecoflow');
assert.strictEqual(ecoflowParser.decisionAction, 'use_ecoflow_cloud');
assert.strictEqual(ecoflowParser.canDecodeLiveTelemetry, true);
assert.strictEqual(ecoflowParser.transport, 'cloud');
assert.strictEqual(canPromoteBluestackTelemetry('ecoflow'), true);

const obdParserDecision = getBluestackParserDecision('generic_obd2');
assert.strictEqual(obdParserDecision.action, 'use_obd2_vehicle_adapter');
assert.strictEqual(obdParserDecision.canDecodeLiveTelemetry, true);
assert(obdParserDecision.requiredEvidence.some((item) => /PID/.test(item)));

const bluettiLiveReadyPolicy = getBluestackConnectionPolicy({
  kind: 'power',
  providerId: 'bluetti',
  provider: 'Bluetti',
  category: 'Portable power station',
  supportLevel: 'implemented_unverified',
  isSupported: true,
  isDiscoverable: true,
  sourceBadges: ['BLE'],
  connectionType: 'ble',
});
assert.strictEqual(bluettiLiveReadyPolicy.lane, 'pending_protocol');
assert.strictEqual(bluettiLiveReadyPolicy.statusLabel, 'BLUETTI native BLE');
assert.strictEqual(bluettiLiveReadyPolicy.primaryActionLabel, 'Connect');
assert.strictEqual(bluettiLiveReadyPolicy.canAttemptConnection, true);
const bluettiReadiness = getBluestackProviderReadiness('bluetti');
assert.strictEqual(bluettiReadiness.parserDecisionAction, 'use_native_power_adapter');
assert.strictEqual(bluettiReadiness.parserId, 'bluetti_native_ble_live');

const bluettiParserDecision = getBluestackParserDecision('bluetti');
assert.strictEqual(bluettiParserDecision.action, 'use_native_power_adapter');
assert.strictEqual(bluettiParserDecision.status, 'native_live');
assert.strictEqual(bluettiParserDecision.canDecodeLiveTelemetry, true);
assert.strictEqual(bluettiParserDecision.canAttemptLiveConnection, true);
assert(bluettiParserDecision.requiredEvidence.includes('native BLE readable power telemetry fields'));
assert.strictEqual(canPromoteBluestackTelemetry('bluetti'), true);

const propaneLinkablePolicy = getBluestackConnectionPolicy({
  kind: 'sensor',
  name: 'Mopeka Propane',
  providerId: 'propane_monitor',
  provider: 'Propane Monitor',
  deviceCategory: 'propane_monitor',
  isDiscoverable: true,
  sourceBadges: ['BLE'],
  connectionType: 'ble',
});
assert.strictEqual(propaneLinkablePolicy.primaryActionLabel, 'Link');
assert.strictEqual(propaneLinkablePolicy.canAttemptConnection, true);

const propaneParserDecision = getBluestackParserDecision('mopeka');
assert.strictEqual(propaneParserDecision.action, 'link_utility_profile');
assert.strictEqual(propaneParserDecision.status, 'native_live');
assert.strictEqual(propaneParserDecision.canDecodeLiveTelemetry, true);
assert.strictEqual(propaneParserDecision.canAttemptLiveConnection, true);
assert(propaneParserDecision.requiredEvidence.some((item) => /level units verified/i.test(item)));

const cloudAuthPolicy = getBluestackConnectionPolicy({
  kind: 'power',
  providerId: 'ecoflow',
  provider: 'EcoFlow',
  category: 'Power station',
  connectionType: 'api',
  connectableViaCloud: true,
  requiresNativeBluetooth: false,
  lastError: 'EcoFlow cloud access is not authorized for this device.',
});
assert.strictEqual(cloudAuthPolicy.lane, 'cloud_authorization_needed');
assert.strictEqual(cloudAuthPolicy.telemetryTruthLabel, 'Cloud auth required');

const sensorPolicy = getBluestackConnectionPolicy({
  kind: 'sensor',
  name: 'Mopeka Propane',
  section: 'nearby',
  isDiscoverable: true,
  sourceBadges: ['BLE'],
  connectionType: 'ble',
});
assert.strictEqual(sensorPolicy.lane, 'native_ble_required');
assert.strictEqual(sensorPolicy.primaryActionLabel, 'Link');
assert.strictEqual(sensorPolicy.statusLabel, 'Live sensor ready');
assert(sensorPolicy.statusDetail.includes('Mopeka propane profile identified'));

const linkedSensorPolicy = getBluestackConnectionPolicy({
  kind: 'sensor',
  name: 'Mopeka Propane',
  isConnected: true,
  sourceBadges: ['BLE'],
  connectionType: 'ble',
});
assert.strictEqual(linkedSensorPolicy.lane, 'sensor_linked');
assert.strictEqual(linkedSensorPolicy.telemetryTruthLabel, 'Linked, awaiting level');

const livePolicy = getBluestackConnectionPolicy({
  kind: 'telemetry',
  providerId: 'obd2',
  isLive: true,
  sourceBadges: ['BLE'],
  connectionType: 'ble',
});
assert.strictEqual(livePolicy.lane, 'live_telemetry');
assert.strictEqual(livePolicy.statusLabel, 'Live telemetry');

const accessoryEvents = bluetoothAccessoryToEcsTelemetryEvents({
  deviceId: 'mopeka-1',
  displayName: 'Mopeka Propane',
  providerLabel: 'Propane Monitor',
  providerId: 'propane_monitor',
  categoryHint: 'propane_monitor',
  owner: 'sensor',
  connectionState: 'connected',
  supportLabel: 'Live Sensor',
  supportNote: null,
  signalStrength: -62,
  utilitySensorTelemetry: {
    levelPercent: null,
    parserStatus: 'awaiting_level',
    decodedAt: null,
    source: null,
  },
  lastSeenAt: new Date(1_700_000_000_000).toISOString(),
  connectedAt: new Date(1_700_000_000_000).toISOString(),
  lastError: null,
});
assert(accessoryEvents.some((event) => event.sourceType === 'utility_sensor'));
assert(accessoryEvents.some((event) => event.metricKey === 'profile_id' && event.value === 'mopeka_propane_monitor'));
assert(accessoryEvents.some((event) => event.metricKey === 'parser_status' && event.value === 'awaiting_level'));
assert(accessoryEvents.every((event) => event.quality === 'stale'));

const liveAccessoryEvents = bluetoothAccessoryToEcsTelemetryEvents({
  deviceId: 'mopeka-live',
  displayName: 'Mopeka Propane',
  providerLabel: 'Propane Monitor',
  providerId: 'propane_monitor',
  categoryHint: 'propane_monitor',
  owner: 'sensor',
  connectionState: 'connected',
  supportLabel: 'Live Sensor',
  supportNote: null,
  signalStrength: -62,
  utilitySensorTelemetry: {
    levelPercent: 63,
    parserStatus: 'live',
    decodedAt: 1_700_000_000_500,
    source: 'explicit_level_field',
  },
  lastSeenAt: new Date(1_700_000_000_000).toISOString(),
  connectedAt: new Date(1_700_000_000_000).toISOString(),
  lastError: null,
});
assert(liveAccessoryEvents.some((event) => event.metricKey === 'level_percent' && event.value === 63));
assert(liveAccessoryEvents.some((event) => event.metricKey === 'parser_status' && event.value === 'live'));
assert(liveAccessoryEvents.every((event) => event.quality === 'live'));

const sensorResourceStates = selectUtilitySensorResourceStates([
  {
    deviceId: 'water-1',
    deviceName: 'SeeLevel Fresh Water Tank Sensor',
    provider: 'water_monitor',
    providerLabel: 'Water Monitor',
    transport: 'ble',
    quality: 'live',
    lastUpdated: 1_700_000_000_001,
    category: 'water_tank_monitor',
    profileId: 'seelevel_water_monitor',
    linkState: 'connected',
    levelPercent: 50,
    signalStrength: -58,
    parserStatus: null,
    isLive: true,
    isStale: false,
  },
  {
    deviceId: 'propane-1',
    deviceName: 'Mopeka Propane',
    provider: 'propane_monitor',
    providerLabel: 'Propane Monitor',
    transport: 'ble',
    quality: 'unavailable',
    lastUpdated: 1_700_000_000_000,
    category: 'propane_monitor',
    profileId: 'mopeka_propane_monitor',
    linkState: 'connected',
    levelPercent: null,
    signalStrength: -62,
    parserStatus: 'awaiting_level',
    isLive: false,
    isStale: false,
  },
]);
assert.strictEqual(sensorResourceStates.water?.status, 'live');
assert.strictEqual(getUtilitySensorCurrentFromCapacity(sensorResourceStates.water, 20), 10);
assert.strictEqual(sensorResourceStates.propane?.status, 'linked');
assert.strictEqual(getUtilitySensorCurrentFromCapacity(sensorResourceStates.propane, 30), null);

const seeLevelProfile = identifyBluestackUtilitySensorProfile({
  name: 'SeeLevel Fresh Water Tank Sensor',
  kind: 'sensor',
});
assert.strictEqual(seeLevelProfile.id, 'seelevel_water_monitor');
assert.strictEqual(seeLevelProfile.category, 'water_tank_monitor');
assert.strictEqual(seeLevelProfile.parserStatus, 'live_ready');

const decodedUtilitySensor = decodeUtilitySensorLiveTelemetry({
  providerId: 'propane_monitor',
  displayName: 'Mopeka Propane',
  levelPercent: 41.2,
});
assert.strictEqual(decodedUtilitySensor.parserStatus, 'live');
assert.strictEqual(decodedUtilitySensor.levelPercent, 41.2);

const advertisementEvidence = getBluestackAdvertisementEvidence({
  serviceUUIDs: [' 180F ', '180f', 'FEAA'],
  manufacturerData: 'raw-manufacturer-payload-that-should-not-be-echoed',
  rssi: -61,
});
assert.strictEqual(advertisementEvidence.serviceUuidCount, 2);
assert.deepStrictEqual(advertisementEvidence.serviceUuids, ['180f', 'feaa']);
assert.strictEqual(advertisementEvidence.manufacturerDataPresent, true);
assert.strictEqual(advertisementEvidence.manufacturerDataLength, 'raw-manufacturer-payload-that-should-not-be-echoed'.length);
assert.strictEqual(typeof advertisementEvidence.manufacturerDataFingerprint, 'string');
assert(!JSON.stringify(advertisementEvidence).includes('raw-manufacturer-payload'));

const bluScreenSource = readSource('app/power/blu.tsx');
assert(
  bluScreenSource.includes('Remembered Devices ({rememberedReleaseDevices.length})') &&
    bluScreenSource.includes('title="Remembered devices"') &&
    bluScreenSource.includes('connections.knownDevices'),
  'Bluestack scanner should expose a Remembered Devices button backed by known scanner devices.',
);
assert(
  bluScreenSource.includes('Verified Connection Set') &&
    bluScreenSource.includes('Tested live telemetry') &&
    bluScreenSource.includes('EcoFlow cloud/API') &&
    bluScreenSource.includes('Native BLE power systems') &&
    bluScreenSource.includes('OBD2 ELM327 telemetry') &&
    bluScreenSource.includes('Utility tank sensors') &&
    bluScreenSource.includes('Veepeak/V Peak BLE reference path') &&
    bluScreenSource.includes('BLUETTI/Blue Eddy, Anker SOLIX') &&
    bluScreenSource.includes('Live ready') &&
    bluScreenSource.includes('systems={VERIFIED_BLUESTACK_SYSTEMS}'),
  'Bluestack scanner should publish a truthful compatibility set with utility tank sensors in the live-ready set.',
);

const unifiedConnectionsSource = readSource('lib/useUnifiedDeviceConnections.ts');
assert(
  !unifiedConnectionsSource.includes("if (device.connection_state === 'disconnected') continue;") &&
    !unifiedConnectionsSource.includes("if (device.connectionState === 'disconnected') continue;"),
  'Remembered telemetry and accessory devices should remain visible after user disconnects.',
);

const bluDeviceRegistrySource = readSource('lib/BluDeviceRegistry.ts');
const vehicleTelemetryRegistrySource = readSource('src/vehicle-telemetry/VehicleTelemetryDeviceRegistry.ts');
const obd2AdapterSource = readSource('src/vehicle-telemetry/OBD2Adapter.ts');
assert(
  bluDeviceRegistrySource.includes("createPersistedKeyValueCache('ecs_blu_devices')") &&
    vehicleTelemetryRegistrySource.includes("createPersistedKeyValueCache('ecs_vehicle_telemetry_devices')") &&
    obd2AdapterSource.includes("createPersistedKeyValueCache('ecs_obd2_adapter')"),
  'Bluestack remembered power and OBD2 devices should persist across native app restarts.',
);

console.log('Bluestack core classification checks passed.');
