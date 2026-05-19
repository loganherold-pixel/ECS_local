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
    'real_device_plan_documents_required_matrix',
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

  console.log('bluetooth power obd2 production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
