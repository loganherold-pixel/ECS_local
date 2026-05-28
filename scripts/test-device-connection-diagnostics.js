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

const readiness = read('src/power/ble/BleScanReadiness.ts');
assert(
  readiness.includes('export interface BleRuntimeDiagnostics') &&
    readiness.includes('nativeBridgeStatus') &&
    readiness.includes('permissionStatus') &&
    readiness.includes('getBleRuntimeDiagnostics'),
  'BLE readiness must expose platform/native bridge/permission diagnostics',
);
assert(
  !readiness.includes("message.includes('null')"),
  'native BLE unsupported detection must not classify every null error as runtime unsupported',
);

const adapter = read('src/vehicle-telemetry/OBD2Adapter.ts');
assert(
  adapter.includes('export interface OBD2ScanDiagnostics') &&
    adapter.includes('rawDevicesSeenCount') &&
    adapter.includes('rawDeviceCallbacksCount') &&
    adapter.includes('acceptedDevicesCount') &&
    adapter.includes('likelyObdDevicesCount'),
  'OBD2 adapter must expose raw callback and accepted-device scan diagnostics',
);
assert(
  adapter.includes('this.rawDeviceCallbacksCount += 1') &&
    adapter.includes('this.rawScanDeviceIds.add(deviceId)') &&
    adapter.includes('this.unidentifiedRawDeviceCallbacksCount += 1'),
  'raw BLE callbacks must be counted separately from accepted/visible rows',
);
assert(
  adapter.includes("ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] scan_stop'") &&
    !adapter.includes('console.log(`[DEVICE_CONNECTIONS] scan_stop reason=${reason}`);'),
  'scanner stop diagnostics must use ecsLog instead of console spam',
);

const hook = read('lib/useUnifiedDeviceConnections.ts');
const bluestackEvidence = read('lib/bluestack/bluestackAdvertisementEvidence.ts');
assert(
  bluestackEvidence.includes('manufacturerDataFingerprint') &&
    bluestackEvidence.includes('manufacturerDataLength') &&
    bluestackEvidence.includes('serviceUuidCount') &&
    !bluestackEvidence.includes('manufacturerDataRaw'),
  'Bluestack utility sensor evidence must expose parser-safe fingerprints and counts instead of raw manufacturer payloads',
);
assert(
  hook.includes('getBluestackAdvertisementEvidence') &&
    hook.includes('identifyBluestackUtilitySensorProfile') &&
    hook.includes('Bluestack utility sensor advertisement profile captured.') &&
    hook.includes('advertisementEvidence: getBluestackAdvertisementEvidence(entry.device)'),
  'unified scanner must capture safe utility sensor advertisement evidence for future parser work',
);
assert(
  hook.includes('bluetoothDiagnostics: OBD2ScanDiagnostics') &&
    hook.includes('const bleRawDevicesSeenCount = Math.max') &&
    hook.includes('obdScanDiagnostics.rawDevicesSeenCount') &&
    hook.includes('rawCount: bleRawDevicesSeenCount') &&
    hook.includes('bluetoothDiagnostics,'),
  'Device Connections summary must surface real native BLE diagnostics and raw seen counts',
);
assert(
  hook.includes("ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] scan_idle'") &&
    hook.includes("ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] manual_scan_requested'") &&
    hook.includes("ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] scan_result'") &&
    !hook.includes("console.log('[DEVICE_CONNECTIONS]"),
  'Device Connections scan lifecycle must use ECS logging and avoid console spam',
);
const aggregator = read('lib/unifiedDeviceDiscoveryAggregator.ts');
assert(
  !hook.includes('discoverMockDevicesForUnifiedScanner') &&
    !hook.includes("makeDiscoverySourceSummary('mock'") &&
    !aggregator.includes('mock_discovery_requires_explicit_enablement'),
  'production unified scanner must not expose a mock discovery lane',
);
const bluetoothDiagnostics = read('lib/bluetoothDiagnostics.ts');
assert(
  bluetoothDiagnostics.includes("export type BluetoothDiagnosticSource") &&
    bluetoothDiagnostics.includes("'native_ble'") &&
    bluetoothDiagnostics.includes("'permission'") &&
    bluetoothDiagnostics.includes("'unsupported_runtime'") &&
    bluetoothDiagnostics.includes("'provider_handshake'") &&
    bluetoothDiagnostics.includes("'ecoflow_cloud_auth'") &&
    bluetoothDiagnostics.includes("'obd2_parser'") &&
    bluetoothDiagnostics.includes("'obd2_pid'") &&
    bluetoothDiagnostics.includes("'widget_telemetry'"),
  'Bluetooth diagnostics must classify native BLE, permissions, runtime, provider, cloud, OBD2, and widget telemetry errors separately',
);
assert(
  bluetoothDiagnostics.includes('recordBluetoothDiagnosticEvent') &&
    bluetoothDiagnostics.includes('serializeBluetoothDiagnostics') &&
    bluetoothDiagnostics.includes('serializeBluetoothProductionEvidenceDraft') &&
    bluetoothDiagnostics.includes('subscribeBluetoothDiagnostics') &&
    bluetoothDiagnostics.includes('resetBluetoothDiagnosticsForTests') &&
    bluetoothDiagnostics.includes('bluestackReadinessSummary') &&
    bluetoothDiagnostics.includes("debugFlag: DEBUG_FLAG"),
  'Bluetooth diagnostics must expose event recording, subscription, copy serialization, test reset, and debug-gated logging',
);
assert(
  bluetoothDiagnostics.includes('androidNativeBleDiscoveryPassed: false') &&
    bluetoothDiagnostics.includes('powerStationConnectStreamDisconnectPassed: false') &&
    bluetoothDiagnostics.includes('ecoflowCloudBleSeparationRealDevicePassed: false') &&
    bluetoothDiagnostics.includes("productionDecision: 'pending'") &&
    bluetoothDiagnostics.includes('buildAndDevice') &&
    bluetoothDiagnostics.includes('reviewerSignoff') &&
    bluetoothDiagnostics.includes('requiredEvidenceChecklist') &&
    bluetoothDiagnostics.includes('observedDiagnostics') &&
    bluetoothDiagnostics.includes('manualReviewRequired: true') &&
    bluetoothDiagnostics.includes('activeConnectionPresent') &&
    bluetoothDiagnostics.includes('latestTelemetryDeviceCount'),
  'Bluetooth evidence draft must provide a non-passing, redacted field evidence skeleton with checklist and signoff placeholders',
);
assert(
  hook.includes("type: 'scanner_start'") &&
    hook.includes("type: 'device_discovered'") &&
    hook.includes("type: 'device_classified'") &&
    hook.includes("type: 'connect_start'") &&
    hook.includes("type: 'disconnect_success'") &&
    hook.includes("type: 'ecoflow_cloud_auth_failure'") &&
    hook.includes("type: 'provider_handshake_failure'"),
  'unified scanner hook must record scanner lifecycle, discovery/classification, connect/disconnect, cloud auth, and provider handshake diagnostics',
);

const telemetryStore = read('src/telemetry/EcsTelemetryStore.ts');
assert(
  telemetryStore.includes('recordBluetoothDiagnosticEvent') &&
    telemetryStore.includes("type: 'widget_telemetry_update'") &&
    telemetryStore.includes("type: 'telemetry_stale'"),
  'ECS telemetry store must record widget telemetry updates and stale transitions',
);

const powerAdapters = read('lib/powerBrandConnectionAdapters.ts');
assert(
  powerAdapters.includes('recordBluetoothDiagnosticEvent') &&
    powerAdapters.includes("type: 'service_discovery_success'") &&
    powerAdapters.includes("type: 'provider_handshake_success'") &&
    powerAdapters.includes("type: 'provider_handshake_failure'") &&
    powerAdapters.includes("type: 'telemetry_first_packet'") &&
    powerAdapters.includes("type: 'telemetry_subscription_stop'"),
  'power provider adapters must record service discovery, handshake, telemetry, and cleanup diagnostics',
);

const screen = read('app/power/blu.tsx');
assert(
  !screen.includes('Native BLE Diagnostics') &&
    !screen.includes('Pipeline Diagnostics') &&
    !screen.includes('summary.bluetoothDiagnostics') &&
    !screen.includes('debugExpanded') &&
    bluetoothDiagnostics.includes('bluestackReadinessSummary') &&
    readiness.includes('nativeBridgeStatus') &&
    adapter.includes('rawDeviceCallbacksCount'),
  'Device Connections screen should keep diagnostics out of the normal scanner UI while preserving the diagnostics data model',
);
assert(
  !screen.includes('Utility Sensor Evidence') &&
    hook.includes('advertisementEvidence') &&
    hook.includes('getBluestackAdvertisementEvidence') &&
    !screen.includes('manufacturerDataRaw'),
  'Device Connections diagnostics should retain safe Bluestack utility sensor evidence without rendering debug panels in the scanner UI',
);
assert(
  screen.includes("ecsLog.debug('TELEMETRY', '[BT_SOURCE] active_device_connections_route'") &&
    !screen.includes("console.log('[BT_SOURCE]"),
  'Device Connections screen route diagnostics must use ecsLog instead of console spam',
);
assert(
    !screen.includes('__DEV__ && debugExpanded') &&
    !screen.includes('Scan Visibility') &&
    !screen.includes('Scan notes') &&
    screen.includes('title="Connected devices"') &&
    screen.includes('connectedReleaseDevices') &&
    screen.includes('title="Available devices"') &&
    screen.includes('for (const device of connections.devices)') &&
    !screen.includes('actionLabel="Scan for Device Connections"') &&
    !screen.includes('actionLabel="Scan for Devices"') &&
    !screen.includes('Saved and known devices') &&
    !screen.includes('Failed and needs attention') &&
    !screen.includes('Not Nearby') &&
    !screen.includes('Previously seen by ECS'),
  'Device Connections screen must keep the production scanner focused on connected rows plus the available-device list without duplicate scan controls or saved/known/failed containers',
);
assert(
  !hook.includes('Known devices available') &&
    !hook.includes('Attention needed') &&
    hook.includes('const visibleScanResultCount = nearbyDevices.length + connectedDevices.length + attentionDevices.length;'),
  'unified scanner status messaging must be keyed to the single actionable scanner list, not restored saved/known containers',
);
assert(
  hook.includes('REMEMBERED_DEVICE_AUTO_RECONNECT_COOLDOWN_MS') &&
    hook.includes('userDisconnectedDeviceIdsRef') &&
    hook.includes("connectDevice(candidate.id, 'saved_auto_reconnect')") &&
    !hook.includes("if (device.connection_state === 'disconnected') continue;\\n      keys.add(`power:${device.provider}:${device.device_id}`);"),
  'remembered power devices must remain in the scanner model and auto-reconnect when rediscovered unless the user explicitly disconnected them',
);

assert(
  adapter.includes('recordBluetoothDiagnosticEvent') &&
    adapter.includes("type: 'scanner_start'") &&
    adapter.includes("type: 'service_discovery_success'") &&
    adapter.includes("type: 'obd2_handshake'") &&
    adapter.includes("type: 'obd2_pid'") &&
    adapter.includes("type: 'obd2_parser'") &&
    adapter.includes("type: 'telemetry_subscription_stop'"),
  'OBD2 adapter must record scan, service discovery, handshake, PID/parser, and telemetry cleanup diagnostics',
);

const e2ePlan = read('docs/bluetooth-obd2-real-device-e2e.md');
assert(
  e2ePlan.includes('Unsupported Native BLE Environment') &&
    e2ePlan.includes('Development Build / Native Build') &&
    e2ePlan.includes('Bluetooth Off') &&
    e2ePlan.includes('Permissions Denied') &&
    e2ePlan.includes('Scan Nearby Power Station') &&
    e2ePlan.includes('EcoFlow Cloud Unauthorized, BLE Nearby') &&
    e2ePlan.includes('OBD2 Adapter With Vehicle Running / Live Data') &&
    e2ePlan.includes('OBD2 Disconnect Clears Widget Telemetry'),
  'real-device E2E plan must cover unsupported runtime, native build, Bluetooth off, permissions, power scan/connect, EcoFlow cloud/BLE separation, and OBD2 live/disconnect flows',
);

console.log('Device connection diagnostics checks passed.');
