const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const gate = await import(pathToFileURL(path.join(__dirname, 'check-fleet-production-readiness.mjs')).href);
  const result = gate.buildFleetProductionReadinessResult({ rootDir: path.join(__dirname, '..') });

  assert.strictEqual(result.system, 'fleet_vehicle_readiness_payload');
  assert.strictEqual(result.passed, false, 'Fleet production gate should remain blocked until Android/profile evidence is recorded.');
  assert.strictEqual(result.status, 'blocked');

  [
    'fleet_confidence_tiers_and_weight_sources_are_explicit',
    'fleet_operating_weight_payload_and_zone_risk_math_are_centralized',
    'fleet_profile_and_build_loadout_keep_guided_no_photo_contract',
    'fleet_active_vehicle_state_feeds_ecs_surfaces',
    'fleet_screen_keeps_tab_label_and_tactical_shell_without_photo_surface',
    'fleet_docs_and_release_contract_are_present',
  ].forEach((id) => {
    const item = result.checks.find((check) => check.id === id);
    assert.ok(item, `${id} should be present`);
    assert.strictEqual(item.passed, true, `${id} should pass before evidence blockers remain`);
  });

  [
    'android_fleet_profile_visual_evidence_present',
    'multi_vehicle_active_selection_evidence_present',
    'scale_ticket_profile_evidence_present',
    'offline_persistence_migration_evidence_present',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    const item = result.checks.find((check) => check.id === id);
    assert.ok(item, `${id} should be present`);
    assert.strictEqual(item.passed, false, `${id} should block production until evidence is recorded`);
    assert.ok(result.blockers.includes(id), `${id} should appear in active blockers`);
  });

  assert.ok(
    result.notes.some((note) => note.includes('no-photo')),
    'Gate notes should keep the Fleet no-photo production rule explicit.',
  );

  console.log('Fleet production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
