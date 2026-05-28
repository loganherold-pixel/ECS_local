import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'bluetooth-power-obd2-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'bluetooth-power-obd2-production-evidence.json');
const REAL_DEVICE_PLAN_RELATIVE_PATH = path.join('docs', 'bluetooth-obd2-real-device-e2e.md');
const SCANNER_AUDIT_RELATIVE_PATH = path.join('docs', 'bluetooth-unified-scanner-audit.md');
const BLUESTACK_PROVIDER_READINESS_RELATIVE_PATH = path.join('docs', 'bluestack-provider-readiness.md');
const PRODUCTION_EVIDENCE_DOC_RELATIVE_PATH = path.join('docs', 'release', 'bluetooth-power-obd2-production-evidence.md');

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

function isFilledEvidenceString(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 && !/^todo\b/i.test(text) && !text.includes('<');
}

function hasCompleteFieldEvidencePacket(evidence) {
  return (
    Array.isArray(evidence?.deviceMatrix) &&
    evidence.deviceMatrix.length >= 4 &&
    evidence.deviceMatrix.every(isFilledEvidenceString) &&
    Array.isArray(evidence?.evidenceReferences) &&
    evidence.evidenceReferences.length >= 4 &&
    evidence.evidenceReferences.every(isFilledEvidenceString) &&
    isFilledEvidenceString(evidence?.notes)
  );
}

function hasReviewerSignoff(evidence) {
  const signoff = evidence?.reviewerSignoff;
  return (
    signoff &&
    isFilledEvidenceString(signoff.product) &&
    isFilledEvidenceString(signoff.engineering) &&
    isFilledEvidenceString(signoff.privacy) &&
    isFilledEvidenceString(signoff.fieldOps) &&
    isFilledEvidenceString(signoff.acceptedAt)
  );
}

function evidenceAccepted(evidence, key) {
  return evidenceTrue(evidence, key) && hasCompleteFieldEvidencePacket(evidence);
}

export function buildBluetoothPowerObd2ProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    realDevicePlan: path.join(root, REAL_DEVICE_PLAN_RELATIVE_PATH),
    scannerAudit: path.join(root, SCANNER_AUDIT_RELATIVE_PATH),
    bluestackProviderReadiness: path.join(root, BLUESTACK_PROVIDER_READINESS_RELATIVE_PATH),
    productionEvidenceDoc: path.join(root, PRODUCTION_EVIDENCE_DOC_RELATIVE_PATH),
    packageJson: path.join(root, 'package.json'),
    appJson: path.join(root, 'app.json'),
    androidManifest: path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    deviceConnections: path.join(root, 'app', 'power', 'blu.tsx'),
    unifiedHook: path.join(root, 'lib', 'useUnifiedDeviceConnections.ts'),
    scannerContract: path.join(root, 'lib', 'unifiedScannerContract.ts'),
    bluestackAdapter: path.join(root, 'lib', 'bluestack', 'bluestackScannerAdapter.ts'),
    bluestackParserRegistry: path.join(root, 'lib', 'bluestack', 'bluestackTelemetryParserRegistry.ts'),
    scannerListState: path.join(root, 'lib', 'scannerDeviceListState.ts'),
    legacyDriverRegistry: path.join(root, 'src', 'power', 'drivers', 'DriverRegistry.ts'),
    ecsLiveSystemBootstrap: path.join(root, 'lib', 'ecsLiveSystemBootstrap.ts'),
    ecsProviderRegistry: path.join(root, 'lib', 'EcsProviderRegistry.ts'),
    powerBrandAdapters: path.join(root, 'lib', 'powerBrandConnectionAdapters.ts'),
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
  const bluestackProviderReadiness = readIfExists(paths.bluestackProviderReadiness);
  const productionEvidenceDoc = readIfExists(paths.productionEvidenceDoc);
  const packageJson = readIfExists(paths.packageJson);
  const appJsonText = readIfExists(paths.appJson);
  const androidManifest = readIfExists(paths.androidManifest);
  const deviceConnections = readIfExists(paths.deviceConnections);
  const unifiedHook = readIfExists(paths.unifiedHook);
  const scannerContract = readIfExists(paths.scannerContract);
  const bluestackAdapter = readIfExists(paths.bluestackAdapter);
  const bluestackParserRegistry = readIfExists(paths.bluestackParserRegistry);
  const scannerListState = readIfExists(paths.scannerListState);
  const legacyDriverRegistry = readIfExists(paths.legacyDriverRegistry);
  const ecsLiveSystemBootstrap = readIfExists(paths.ecsLiveSystemBootstrap);
  const ecsProviderRegistry = readIfExists(paths.ecsProviderRegistry);
  const powerBrandAdapters = readIfExists(paths.powerBrandAdapters);
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
      'Bluestack is the canonical user-facing scanner with connected rows plus one supported-device list.',
        deviceConnections.includes('useUnifiedDeviceConnections') &&
        deviceConnections.includes('connectedReleaseDevices') &&
        deviceConnections.includes('visibleReleaseDevices') &&
        deviceConnections.includes('isVisibleReleaseDevice') &&
        deviceConnections.includes('title="Connected devices"') &&
        deviceConnections.includes('title="Available devices"') &&
        !deviceConnections.includes('Saved / Known') &&
        !deviceConnections.includes('Failed / Needs Attention'),
      [relPath(root, paths.deviceConnections), relPath(root, paths.unifiedHook)],
      ['Keep saved/known/failed containers out of the scanner UI while preserving visible connected rows and available scanner rows.'],
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
      'Release scanner suppresses generic Bluetooth noise and only lists likely Bluestack-compatible nearby devices.',
      deviceConnections.includes('isVisibleReleaseDevice') &&
        deviceConnections.includes('visibleReleaseDevices') &&
        bluestackAdapter.includes('TVs, headsets, and unrelated Bluetooth devices stay out of this action list') &&
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
        relPath(root, paths.bluestackAdapter),
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
      'legacy_vendor_driver_resolution_gated_by_bluestack_parser_registry',
      'Legacy power vendor drivers and provider modules cannot resolve live telemetry unless Bluestack parser registry permits promotion.',
      legacyDriverRegistry.includes('getBluestackParserDecision(driver.vendor)') &&
        legacyDriverRegistry.includes('!parserDecision.canDecodeLiveTelemetry') &&
        legacyDriverRegistry.includes('continue;') &&
        bluestackParserRegistry.includes('canPromoteBluestackTelemetry') &&
        ecsLiveSystemBootstrap.includes('getBluestackParserDecision(entry.providerId)') &&
        ecsLiveSystemBootstrap.includes('!parserDecision.canDecodeLiveTelemetry') &&
        ecsLiveSystemBootstrap.includes('loadPowerProvider(entry.label, entry.exportName, entry.loadModule)') &&
        ecsProviderRegistry.includes('getBluestackParserDecision(id)') &&
        ecsProviderRegistry.includes('getBluestackParserDecision(reading.provider)') &&
        ecsProviderRegistry.includes('return null;'),
      [
        relPath(root, paths.legacyDriverRegistry),
        relPath(root, paths.bluestackParserRegistry),
        relPath(root, paths.ecsLiveSystemBootstrap),
        relPath(root, paths.ecsProviderRegistry),
      ],
      ['Keep legacy vendor driver resolution, provider module loading, and provider telemetry ingestion behind Bluestack parser promotion decisions.'],
    ),
    check(
      'power_brand_adapters_follow_bluestack_parser_registry',
      'Power brand adapters block parser-pending live connections and expose parser decisions in diagnostics.',
      powerBrandAdapters.includes('getBluestackParserDecision') &&
        powerBrandAdapters.includes("errorCode: 'PARSER_PENDING'") &&
        powerBrandAdapters.includes('parserAction: parserDecision.action') &&
        powerBrandAdapters.includes('supportsLiveTelemetry: parserDecision.canDecodeLiveTelemetry') &&
        powerBrandAdapters.includes('if (!parserDecision.canDecodeLiveTelemetry) return null;') &&
        powerBrandAdapters.includes("parserDecision.action !== 'use_ecoflow_cloud'") &&
        powerBrandAdapters.includes('parserId: parserDecision.parserId') &&
        powerBrandAdapters.includes('parserStatus: parserDecision.status'),
      [relPath(root, paths.powerBrandAdapters)],
      ['Keep power brand connection adapters aligned with Bluestack parser promotion decisions.'],
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
      'bluestack_provider_readiness_matrix_documented',
      'Bluestack provider readiness matrix documents live, cloud/API, parser-pending, OBD2, propane, and water states.',
      bluestackProviderReadiness.includes('EcoFlow') &&
        bluestackProviderReadiness.includes('Generic OBD2') &&
        bluestackProviderReadiness.includes('BLUETTI') &&
        bluestackProviderReadiness.includes('Anker SOLIX') &&
        bluestackProviderReadiness.includes('Jackery') &&
        bluestackProviderReadiness.includes('Goal Zero') &&
        bluestackProviderReadiness.includes('Renogy') &&
        bluestackProviderReadiness.includes('REDARC') &&
        bluestackProviderReadiness.includes('Dakota Lithium') &&
        bluestackProviderReadiness.includes('Propane monitors') &&
        bluestackProviderReadiness.includes('Water/fluid monitors') &&
        bluestackProviderReadiness.includes('ECOFLOW_ACCESS_KEY') &&
        bluestackProviderReadiness.includes('ECOFLOW_SECRET_KEY') &&
        bluestackProviderReadiness.includes('Parser-pending rows should be visible as recognized hardware') &&
        bluestackProviderReadiness.includes('lib/bluestack/bluestackTelemetryParserRegistry.ts') &&
        bluestackParserRegistry.includes('block_pending_parser') &&
        bluestackParserRegistry.includes("decisionAction: 'use_ecoflow_cloud'") &&
        bluestackParserRegistry.includes("decisionAction: 'use_obd2_vehicle_adapter'") &&
        bluestackParserRegistry.includes("decisionAction: 'link_utility_profile'"),
      [relPath(root, paths.bluestackProviderReadiness), relPath(root, paths.bluestackParserRegistry)],
      ['Keep provider readiness docs aligned with Bluestack connection policy and field-test evidence.'],
    ),
    check(
      'production_evidence_contract_documented',
      'Bluetooth production evidence contract documents required real-hardware fields and owner sign-off.',
      productionEvidenceDoc.includes('.smoke/bluetooth-power-obd2-production-evidence.json') &&
        productionEvidenceDoc.includes('"androidNativeBleDiscoveryPassed": true') &&
        productionEvidenceDoc.includes('"powerStationConnectStreamDisconnectPassed": true') &&
        productionEvidenceDoc.includes('"ecoflowCloudBleSeparationRealDevicePassed": true') &&
        productionEvidenceDoc.includes('"obd2NoDataPassed": true') &&
        productionEvidenceDoc.includes('"obd2LiveDataPassed": true') &&
        productionEvidenceDoc.includes('"obd2DisconnectClearsTelemetryPassed": true') &&
        productionEvidenceDoc.includes('"productionDecision": "accepted"') &&
        productionEvidenceDoc.includes('"buildAndDevice"') &&
        productionEvidenceDoc.includes('"reviewerSignoff"') &&
        productionEvidenceDoc.includes('"acceptedAt"') &&
        productionEvidenceDoc.includes('four non-placeholder evidence references') &&
        productionEvidenceDoc.includes('Do not set `productionDecision` to `accepted` until real-hardware evidence is reviewed'),
      [relPath(root, paths.productionEvidenceDoc)],
      ['Keep the Bluetooth production evidence contract aligned with the gate evidence file.'],
    ),
    check(
      'android_native_ble_discovery_evidence_present',
      'Android native BLE discovery evidence is recorded from a development/native build.',
      evidenceAccepted(evidence, 'androidNativeBleDiscoveryPassed'),
      [relPath(root, paths.evidence)],
      ['Run scenarios 2-5 on Android native/dev build and capture diagnostics/screenshots, device matrix, and evidence references.'],
    ),
    check(
      'power_station_connect_stream_disconnect_evidence_present',
      'Power station scan, connect, stream, disconnect, and reconnect evidence is recorded.',
      evidenceAccepted(evidence, 'powerStationConnectStreamDisconnectPassed'),
      [relPath(root, paths.evidence)],
      ['Run scenarios 6, 8, and 9 with a supported or likely-supported BLE power station and attach evidence references.'],
    ),
    check(
      'ecoflow_cloud_ble_separation_real_device_evidence_present',
      'EcoFlow cloud unauthorized plus nearby BLE evidence is recorded with real hardware.',
      evidenceAccepted(evidence, 'ecoflowCloudBleSeparationRealDevicePassed'),
      [relPath(root, paths.evidence)],
      ['Run scenario 7 with an advertising EcoFlow unit and unauthorized/unavailable cloud access, then attach evidence references.'],
    ),
    check(
      'obd2_no_data_and_live_data_evidence_present',
      'OBD2 no-data, live PID data, and disconnect clearing evidence is recorded.',
      evidenceAccepted(evidence, 'obd2NoDataPassed') &&
        evidenceAccepted(evidence, 'obd2LiveDataPassed') &&
        evidenceAccepted(evidence, 'obd2DisconnectClearsTelemetryPassed'),
      [relPath(root, paths.evidence)],
      ['Run scenarios 10-12 with a BLE ELM327-compatible adapter and vehicle, then attach no-data/live/disconnect evidence references.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for Bluetooth, power devices, EcoFlow, and OBD2.',
      accepted(evidence?.productionDecision) &&
        hasCompleteFieldEvidencePacket(evidence) &&
        hasReviewerSignoff(evidence),
      [relPath(root, paths.evidence)],
      ['Record product, privacy, engineering, and field-ops acceptance plus acceptedAt after real-device evidence is complete.'],
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
