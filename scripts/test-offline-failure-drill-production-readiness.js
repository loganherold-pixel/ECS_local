const assert = require('assert/strict');

async function main() {
  const {
    buildOfflineFailureDrillProductionReadinessResult,
  } = await import('./check-offline-failure-drill-production-readiness.mjs');

  const result = buildOfflineFailureDrillProductionReadinessResult({ rootDir: process.cwd() });
  const checks = new Map(result.checks.map((check) => [check.id, check]));

  assert.equal(result.system, 'offline_failure_drill');
  assert.equal(result.passed, false);
  assert.equal(result.status, 'blocked');

  [
    'offline_drill_service_contract_present',
    'offline_drill_user_facing_panel_present',
    'offline_drill_test_script_registered',
    'offline_drill_local_only_safety_copy_present',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, true, `${id} should pass before Android evidence blockers remain`);
  });

  [
    'android_no_network_drill_evidence_present',
    'android_drill_artifacts_complete',
    'android_no_remote_update_or_live_sync_confirmed',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, false, `${id} should remain blocked until Android no-network drill evidence exists`);
    assert.ok(result.blockers.includes(id), `${id} should be an active production blocker`);
  });

  console.log('offline failure drill production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
