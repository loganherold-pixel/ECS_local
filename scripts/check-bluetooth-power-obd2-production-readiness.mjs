import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'bluetooth-power-obd2-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'bluetooth-power-obd2-production-evidence.json');
const REAL_DEVICE_PLAN_RELATIVE_PATH = path.join('docs', 'bluetooth-obd2-real-device-e2e.md');
const SCANNER_AUDIT_RELATIVE_PATH = path.join('docs', 'bluetooth-unified-scanner-audit.md');

function relPath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(readIfExists(filePath));
  } catch {
    return null;
  }
}

function check(id, label, passed, evidence = [], remediation = []) {
  return {
    id,
    label,
    passed: Boolean(passed),
    evidence,
    remediation,
  };
}

function evidenceTrue(evidence, key) {
  return evidence?.[key] === true;
}

function accepted(value) {
  return String(value ?? '').trim().toLowerCase() === 'accepted';
}

export function buildBluetoothPowerObd2ProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    realDevicePlan: path.join(root, REAL_DEVICE_PLAN_RELATIVE_PATH),
    scannerAudit: path.join(root, SCANNER_AUDIT_RELATIVE_PATH),
    packageJson: path.join(root, 'package.json'),
    appJson: path.join(root, 'app.json'),
    androidManifest: path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    deviceConnections: path.join(root, 'app', 'power', 'blu.tsx'),
    unifiedHook: path.join(root, 'lib', 'useUnifiedDeviceConnections.ts'),
    scannerContract: path.join(root, 'lib', 'unifiedScannerContract.ts'),
    scannerListState: path.join(root, 'lib', 'scannerDeviceListState.ts'),
    deviceRouting: path.join(root, 'lib', 'bluetoothDeviceRouting.ts'),
    classificationTest: path.join(root, 'scripts', 'test-bluetooth-device-classification.js'),
    obd2Adapter: path.join(root, 'src', 'vehicle-telemetry', 'OBD2Adapter.ts'),
    pidPoller: path.join(root, 'src', 'vehicle-telemetry', 'OBD2PIDPoller.ts'),
    telemetryStore: path.join(root, 'src', 'vehicle-telemetry', 'VehicleTelemetryStore.ts'),
    ecoflowDiscovery: path.join(root, 'lib', 'ecoflowUnifiedScannerDiscovery.ts'),
  };

  const evidence = readJsonIfExists(paths.evidence);
  const realDevicePlan = readIfExists(paths.realDevicePlan);
  const scannerAudit = readIfExists(paths.scannerAudit);
  const packageJson = readIfExists(paths.packageJson);
  const appJsonText = readIfExists(paths.appJson);
  const androidManifest = readIfExists(paths.androidManifest);
  const deviceConnections = readIfExists(paths.deviceConnections);
  const unifiedHook = readIfExists(paths.unifiedHook);
  const scannerContract = readIfExists(paths.scannerContract);
  const scannerListState = readIfExists(paths.scannerListState);
  const deviceRouting = readIfExists(paths.deviceRouting);
  const classificationTest = readIfExists(paths.classificationTest);
  const obd2Adapter = readIfExists(paths.obd2Adapter);
  const pidPoller = readIfExists(paths.pidPoller);
  const telemetryStore = readIfExists(paths.telemetryStore);
  const ecoflowDiscovery = readIfExists(paths.ecoflowDiscovery);

  let appConfig = {};
  try {
    appConfig = JSON.parse(appJsonText);
  } catch {
    appConfig = {};
  }
  const androidPermissions = JSON.stringify(appConfig?.expo?.android?.permissions ?? []);
  const iosInfo = appConfig?.expo?.ios?.infoPlist ?? {};
  const plugins = JSON.stringify(appConfig?.expo?.plugins ?? []);

  const checks = [
    check(
      'native_ble_build_configuration_present',
      'Native BLE dependency, plugin, Android permissions, and iOS usage strings are configured.',
      packageJson.includes('"react-native-ble-plx"') &&
        plugins.includes('react-native-ble-plx') &&
        androidPermissions.includes('android.permission.BLUETOOTH_SCAN') &&
        androidPermissions.includes('android.permission.BLUETOOTH_CONNECT') &&
        androidPermissions.includes('android.permission.ACCESS_FINE_LOCATION') &&
        androidManifest.includes('android.permission.BLUETOOTH_SCAN') &&
        androidManifest.includes('android.permission.BLUETOOTH_CONNECT') &&
        androidManifest.includes('android.permission.ACCESS_FINE_LOCATION') &&
        Boolean(iosInfo.NSBluetoothAlwaysUsageDescription) &&
        Boolean(iosInfo.NSBluetoothPeripheralUsageDescription),
      [relPath(root, paths.packageJson), relPath(root, paths.appJson), relPath(root, paths.androidManifest)],
      ['Keep native BLE module and platform permissions configured before real-device testing.'],
    ),
    check(
      'unified_device_connections_is_canonical_ui',
      'Device Connections is the canonical user-facing scanner with one nearby power/OBD2 list.',
      deviceConnections.includes('useUnifiedDeviceConnections') &&
        deviceConnections.includes('connections.nearbyDevices.filter(isRealNearbyReleaseDevice)') &&
        deviceConnections.includes('Found nearby power and OBD2 devices') &&
        !deviceConnections.includes('Saved / Known') &&
        !deviceConnections.includes('Failed / Needs Attention'),
      [relPath(root, paths.deviceConnections), relPath(root, paths.unifiedHook)],
      ['Keep saved/known/failed records out of the connectable nearby scanner UI.'],
    ),
    check(
      'scanner_truth_contract_blocks_mocks_and_cloud_ble_confusion',
      'Scanner contract blocks mock production rows and separates cloud/API from native BLE.',
      unifiedHook.includes("'unsupported_runtime'") &&
        scannerContract.includes("'native_ble'") &&
        scannerContract.includes("'cloud_auth'") &&
        scannerContract.includes("transport === 'cloud'") &&
        !unifiedHook.includes('discoverMockDevicesForUnifiedScanner') &&
        ecoflowDiscovery.includes('classifyEcoFlowCloudErrorSource'),
      [relPath(root, paths.scannerContract), relPath(root, paths.unifiedHook), relPath(root, paths.ecoflowDiscovery)],
      ['Keep cloud authorization state separate from native BLE discovery/connection state.'],
    ),
    check(
      'release_scanner_filters_consumer_bluetooth_noise',
      'Release scanner suppresses generic Bluetooth noise and only lists likely power or OBD2 nearby devices.',
      deviceConnections.includes('isRealNearbyReleaseDevice') &&
        deviceConnections.includes('connections.nearbyDevices.filter(isRealNearbyReleaseDevice)') &&
        deviceConnections.includes('TVs, headsets, and unrelated Bluetooth devices stay out of this action list') &&
        deviceRouting.includes('isReleaseScannerBluetoothRoute') &&
        scannerListState.includes('requireBrandAllowlistMatch') &&
        scannerListState.includes('unknown_ble_hidden') &&
        unifiedHook.includes('routedBluetoothDiscoveries.filter((entry) => isReleaseScannerBluetoothRoute(entry.routing)') &&
        unifiedHook.includes('unsupported_bluetooth_noise_hidden') &&
        classificationTest.includes('consumer-headset') &&
        classificationTest.includes('living-room-tv') &&
        classificationTest.includes('isReleaseScannerBluetoothRoute(headsetRoute), false') &&
        classificationTest.includes('isReleaseScannerBluetoothRoute(tvRoute), false'),
      [
        relPath(root, paths.deviceConnections),
        relPath(root, paths.deviceRouting),
        relPath(root, paths.scannerListState),
        relPath(root, paths.unifiedHook),
        relPath(root, paths.classificationTest),
      ],
      ['Keep TVs, headsets, generic accessories, ambiguous matches, and unclassified BLE rows out of the production connectable list.'],
    ),
    check(
      'obd2_streaming_requires_native_handshake_and_pid_data',
      'OBD2 live status is gated by native transport plus ELM327/OBD initialization and PID telemetry.',
      obd2Adapter.includes('connectToDevice') &&
        obd2Adapter.includes('discoverAllServicesAndCharacteristics') &&
        obd2Adapter.includes('startPidTelemetry') &&
        pidPoller.includes("source: 'bluetooth_obd_live'") &&
        pidPoller.includes('obd2_values') &&
        telemetryStore.includes('mock_dev') &&
        telemetryStore.includes('bluetooth_obd_live'),
      [relPath(root, paths.obd2Adapter), relPath(root, paths.pidPoller), relPath(root, paths.telemetryStore)],
      ['Do not show OBD2 streaming until native connection, initialization, and PID telemetry have succeeded.'],
    ),
    check(
      'real_device_plan_documents_required_matrix',
      'Real-device E2E plan documents native build, power, EcoFlow, OBD2, disconnect, and diagnostics matrix.',
      realDevicePlan.includes('Expo Go is expected to fail native BLE access cleanly') &&
        realDevicePlan.includes('Scenario 6: Connect Power Station') &&
        realDevicePlan.includes('Scenario 7: EcoFlow Cloud Unauthorized, BLE Nearby') &&
        realDevicePlan.includes('Scenario 11: OBD2 Adapter With Vehicle Running / Live Data') &&
        realDevicePlan.includes('Diagnostics To Capture') &&
        scannerAudit.includes('Canonical Scanner Files') &&
        scannerAudit.includes('Legacy, Mock, Or UI-Only Scanner Files'),
      [relPath(root, paths.realDevicePlan), relPath(root, paths.scannerAudit)],
      ['Keep the real-hardware E2E matrix and scanner audit current.'],
    ),
    check(
      'android_native_ble_discovery_evidence_present',
      'Android native BLE discovery evidence is recorded from a development/native build.',
      evidenceTrue(evidence, 'androidNativeBleDiscoveryPassed'),
      [relPath(root, paths.evidence)],
      ['Run scenarios 2-5 on Android native/dev build and capture diagnostics/screenshots.'],
    ),
    check(
      'power_station_connect_stream_disconnect_evidence_present',
      'Power station scan, connect, stream, disconnect, and reconnect evidence is recorded.',
      evidenceTrue(evidence, 'powerStationConnectStreamDisconnectPassed'),
      [relPath(root, paths.evidence)],
      ['Run scenarios 6, 8, and 9 with a supported or likely-supported BLE power station.'],
    ),
    check(
      'ecoflow_cloud_ble_separation_real_device_evidence_present',
      'EcoFlow cloud unauthorized plus nearby BLE evidence is recorded with real hardware.',
      evidenceTrue(evidence, 'ecoflowCloudBleSeparationRealDevicePassed'),
      [relPath(root, paths.evidence)],
      ['Run scenario 7 with an advertising EcoFlow unit and unauthorized/unavailable cloud access.'],
    ),
    check(
      'obd2_no_data_and_live_data_evidence_present',
      'OBD2 no-data, live PID data, and disconnect clearing evidence is recorded.',
      evidenceTrue(evidence, 'obd2NoDataPassed') &&
        evidenceTrue(evidence, 'obd2LiveDataPassed') &&
        evidenceTrue(evidence, 'obd2DisconnectClearsTelemetryPassed'),
      [relPath(root, paths.evidence)],
      ['Run scenarios 10-12 with a BLE ELM327-compatible adapter and vehicle.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for Bluetooth, power devices, EcoFlow, and OBD2.',
      accepted(evidence?.productionDecision),
      [relPath(root, paths.evidence)],
      ['Record product, privacy, engineering, and field-ops acceptance after real-device evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  return {
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'bluetooth_power_obd2',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: failed.flatMap((item) => item.remediation),
    notes: [
      'This gate separates scanner/telemetry contract readiness from real-hardware production evidence.',
      'Expo Go/web unsupported behavior is allowed only when it fails cleanly without fake devices.',
      'Do not mark connected or streaming until native/provider/OBD handshakes and live telemetry succeed.',
    ],
  };
}

export function writeBluetoothPowerObd2ProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatBluetoothPowerObd2ProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Bluetooth/Power/OBD2 production readiness: ${result.statusLabel}`,
    `Result file: ${relPath(root, path.join(root, RESULT_RELATIVE_PATH))}`,
    `Checked at: ${result.checkedAt}`,
    `Production ready: ${result.passed ? 'yes' : 'no'}`,
    '',
    'Checks:',
  ];
  for (const item of result.checks) lines.push(`- ${item.label}: ${item.passed ? 'pass' : 'blocked'}`);
  if (result.blockers.length > 0) {
    lines.push('', 'Active blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.remediation.length > 0) {
    lines.push('', 'Next actions:');
    for (const item of Array.from(new Set(result.remediation))) lines.push(`- ${item}`);
  }
  lines.push('', 'Notes:');
  for (const note of result.notes) lines.push(`- ${note}`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const jsonOnly = process.argv.includes('--json');
  const result = buildBluetoothPowerObd2ProductionReadinessResult();
  writeBluetoothPowerObd2ProductionReadinessResult(result);
  if (jsonOnly) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(formatBluetoothPowerObd2ProductionReadinessResult(result));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
