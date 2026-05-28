const assert = require('assert/strict');

async function main() {
  const {
    buildBluetoothPowerObd2ProductionReadinessResult,
  } = await import('./check-bluetooth-power-obd2-production-readiness.mjs');

  const result = buildBluetoothPowerObd2ProductionReadinessResult({ rootDir: process.cwd() });
  const checks = new Map(result.checks.map((check) => [check.id, check]));

  assert.equal(result.system, 'bluetooth_power_obd2');
  assert.equal(result.passed, false);
  assert.equal(result.status, 'blocked');

  [
    'native_ble_build_configuration_present',
    'unified_device_connections_is_canonical_ui',
    'scanner_truth_contract_blocks_mocks_and_cloud_ble_confusion',
    'release_scanner_filters_consumer_bluetooth_noise',
    'obd2_streaming_requires_native_handshake_and_pid_data',
    'legacy_vendor_driver_resolution_gated_by_bluestack_parser_registry',
    'power_brand_adapters_follow_bluestack_parser_registry',
    'real_device_plan_documents_required_matrix',
    'bluestack_provider_readiness_matrix_documented',
    'production_evidence_contract_documented',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, true, `${id} should pass before real-hardware evidence blockers remain`);
  });

  [
    'android_native_ble_discovery_evidence_present',
    'power_station_connect_stream_disconnect_evidence_present',
    'ecoflow_cloud_ble_separation_real_device_evidence_present',
    'obd2_no_data_and_live_data_evidence_present',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, false, `${id} should remain blocked until real-hardware evidence exists`);
    assert.ok(result.blockers.includes(id), `${id} should be reported as an active blocker`);
  });

  const placeholderEvidenceRoot = {
    androidNativeBleDiscoveryPassed: true,
    powerStationConnectStreamDisconnectPassed: true,
    ecoflowCloudBleSeparationRealDevicePassed: true,
    obd2NoDataPassed: true,
    obd2LiveDataPassed: true,
    obd2DisconnectClearsTelemetryPassed: true,
    productionDecision: 'accepted',
    deviceMatrix: [
      'TODO: Android native development build device',
      'TODO: BLE power station',
      'TODO: EcoFlow device',
      'TODO: OBD2 adapter',
    ],
    evidenceReferences: [
      'TODO: screenshot',
      'TODO: log',
      'TODO: cloud evidence',
      'TODO: obd evidence',
    ],
    reviewerSignoff: {
      product: null,
      engineering: null,
      privacy: null,
      fieldOps: null,
      acceptedAt: null,
    },
    notes: 'TODO: replace this note',
  };
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-bt-evidence-'));
  fs.mkdirSync(path.join(tempRoot, '.smoke'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'docs', 'release'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'lib', 'bluestack'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'src', 'power', 'drivers'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'src', 'vehicle-telemetry'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'app', 'power'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'android', 'app', 'src', 'main'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true });
  for (const relativePath of [
    'package.json',
    'app.json',
    'android/app/src/main/AndroidManifest.xml',
    'app/power/blu.tsx',
    'lib/useUnifiedDeviceConnections.ts',
    'lib/unifiedScannerContract.ts',
    'lib/bluestack/bluestackScannerAdapter.ts',
    'lib/bluestack/bluestackTelemetryParserRegistry.ts',
    'lib/scannerDeviceListState.ts',
    'src/power/drivers/DriverRegistry.ts',
    'lib/ecsLiveSystemBootstrap.ts',
    'lib/EcsProviderRegistry.ts',
    'lib/powerBrandConnectionAdapters.ts',
    'lib/bluetoothDeviceRouting.ts',
    'scripts/test-bluetooth-device-classification.js',
    'src/vehicle-telemetry/OBD2Adapter.ts',
    'src/vehicle-telemetry/OBD2PIDPoller.ts',
    'src/vehicle-telemetry/VehicleTelemetryStore.ts',
    'lib/ecoflowUnifiedScannerDiscovery.ts',
    'docs/bluetooth-obd2-real-device-e2e.md',
    'docs/bluetooth-unified-scanner-audit.md',
    'docs/bluestack-provider-readiness.md',
    'docs/release/bluetooth-power-obd2-production-evidence.md',
  ]) {
    const source = path.join(process.cwd(), relativePath);
    const target = path.join(tempRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  fs.writeFileSync(
    path.join(tempRoot, '.smoke', 'bluetooth-power-obd2-production-evidence.json'),
    `${JSON.stringify(placeholderEvidenceRoot, null, 2)}\n`,
  );
  const placeholderResult = buildBluetoothPowerObd2ProductionReadinessResult({ rootDir: tempRoot });
  assert.equal(
    placeholderResult.checks.find((check) => check.id === 'android_native_ble_discovery_evidence_present')?.passed,
    false,
    'placeholder evidence strings must not satisfy Android native BLE evidence',
  );
  assert.equal(
    placeholderResult.checks.find((check) => check.id === 'production_owner_decision_accepted')?.passed,
    false,
    'accepted decision must remain blocked without reviewer signoff and non-placeholder references',
  );

  console.log('bluetooth power obd2 production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
