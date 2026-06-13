const assert = require('assert/strict');

async function main() {
  const {
    buildLoadoutConsequencePreviewProductionReadinessResult,
  } = await import('./check-loadout-consequence-preview-production-readiness.mjs');

  const result = buildLoadoutConsequencePreviewProductionReadinessResult({ rootDir: process.cwd() });
  const checks = new Map(result.checks.map((check) => [check.id, check]));

  assert.equal(result.system, 'loadout_consequence_preview');
  assert.equal(result.passed, false);
  assert.equal(result.status, 'blocked');

  [
    'loadout_consequence_service_contract_present',
    'loadout_consequence_ui_and_command_brief_mirror_present',
    'loadout_consequence_evidence_events_registered',
    'loadout_consequence_test_script_registered',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, true, `${id} should pass before production evidence blockers remain`);
  });

  [
    'android_no_network_device_evidence',
    'profile_variance_evidence',
    'multi_vehicle_evidence',
    'scale_ticket_evidence',
    'loaded_scale_delta_evidence',
    'offline_cache_evidence',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, false, `${id} should remain blocked until field evidence exists`);
    assert.ok(result.blockers.includes(id), `${id} should be an active production blocker`);
  });

  assert.deepEqual(
    result.evidenceContract.requiredFields,
    [
      'androidNoNetworkDeviceEvidencePassed',
      'profileVarianceEvidencePassed',
      'multiVehicleEvidencePassed',
      'scaleTicketEvidencePassed',
      'loadedScaleDeltaEvidencePassed',
      'offlineCacheEvidencePassed',
      'productionDecision',
    ],
  );

  console.log('Loadout consequence preview production readiness checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
