const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const gate = await import(pathToFileURL(path.join(__dirname, 'check-field-utilities-production-readiness.mjs')).href);
  const result = gate.buildFieldUtilitiesProductionReadinessResult({ rootDir: path.join(__dirname, '..') });

  assert.strictEqual(result.system, 'field_utilities_protocols_weather_tools');
  assert.strictEqual(result.passed, false, 'Field Utilities production gate should remain blocked until Android/degraded evidence is recorded.');
  assert.strictEqual(result.status, 'blocked');

  [
    'field_utilities_entrypoint_and_navigation_are_single_source',
    'field_protocols_use_local_assets_and_compact_safe_guidance',
    'field_weather_uses_shared_operational_weather_path',
    'field_utilities_bluetooth_uses_canonical_device_connections',
    'field_utilities_copy_avoids_external_dispatch_or_fake_live_claims',
  ].forEach((id) => {
    const item = result.checks.find((check) => check.id === id);
    assert.ok(item, `${id} should be present`);
    assert.strictEqual(item.passed, true, `${id} should pass before Android/degraded evidence blockers remain`);
  });

  [
    'android_field_utilities_visual_evidence_present',
    'emergency_and_recovery_protocol_device_evidence_present',
    'weather_parity_device_evidence_present',
    'offline_degraded_field_utilities_evidence_present',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    const item = result.checks.find((check) => check.id === id);
    assert.ok(item, `${id} should be present`);
    assert.strictEqual(item.passed, false, `${id} should block production until evidence is recorded`);
    assert.ok(result.blockers.includes(id), `${id} should appear in active blockers`);
  });

  assert.ok(
    result.notes.some((note) => note.includes('no fake live claims')),
    'Gate notes should keep Field Utilities truthfulness explicit.',
  );

  console.log('Field Utilities production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
