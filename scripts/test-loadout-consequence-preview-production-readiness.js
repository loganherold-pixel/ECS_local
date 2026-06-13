const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function main() {
  const {
    buildLoadoutConsequencePreviewProductionReadinessResult,
    validateLoadoutConsequencePreviewProductionEvidenceManifest,
  } = await import('./check-loadout-consequence-preview-production-readiness.mjs');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-loadout-production-'));

  function artifact(name) {
    const filePath = path.join(tempRoot, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{}\n', 'utf8');
    return filePath;
  }

  function manifest(overrides = {}) {
    return {
      evidenceId: 'loadout-production-fixture',
      evidenceSource: 'synthetic',
      generatedAt: '2026-06-13T20:00:00.000Z',
      appBuildId: 'test-build',
      gitSha: 'test-sha',
      androidNoNetwork: { evidencePath: artifact('android.json'), passed: true, deviceOrEmulator: 'emulator', ownerAccepted: true },
      profileVariance: { evidencePath: artifact('profile.json'), passed: true, profilesTested: 4 },
      multiVehicle: { evidencePath: artifact('multi.json'), passed: true, vehiclesTested: 3 },
      scaleTicket: { evidencePath: artifact('scale.json'), passed: true, acceptedEvidenceIds: ['scale-1'] },
      loadedScaleDelta: { evidencePath: artifact('delta.json'), passed: true, maxAcceptedDeltaPercent: 5, observedDeltaPercent: 2.4 },
      offlineCache: { evidencePath: artifact('offline.json'), passed: true },
      largeLoadoutPerformance: { evidencePath: artifact('perf.json'), passed: true, itemCount: 260, maxPreviewMs: 750 },
      ownerAcceptance: { accepted: true, acceptedBy: 'QA Owner', acceptedAt: '2026-06-13T20:30:00.000Z', notes: ['accepted'] },
      ...overrides,
    };
  }

  const result = buildLoadoutConsequencePreviewProductionReadinessResult({ rootDir: process.cwd() });
  const checks = new Map(result.checks.map((check) => [check.id, check]));

  assert.equal(result.system, 'loadout_consequence_preview');
  assert.equal(result.passed, false);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.includes('production_evidence_manifest_missing'));

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
    'large_loadout_performance_evidence',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, false, `${id} should remain blocked until field evidence exists`);
    assert.ok(result.blockers.includes(id), `${id} should be an active production blocker`);
  });

  assert.deepEqual(
    result.evidenceContract.requiredFields,
    [
      'evidenceId',
      'evidenceSource',
      'generatedAt',
      'androidNoNetwork',
      'profileVariance',
      'multiVehicle',
      'scaleTicket',
      'loadedScaleDelta',
      'offlineCache',
      'largeLoadoutPerformance',
      'ownerAcceptance',
    ],
  );

  const malformed = validateLoadoutConsequencePreviewProductionEvidenceManifest(null, { rootDir: tempRoot });
  assert.equal(malformed.valid, false);
  assert.ok(malformed.blockers.includes('production_evidence_manifest_malformed'));

  const synthetic = validateLoadoutConsequencePreviewProductionEvidenceManifest(manifest(), { rootDir: tempRoot });
  assert.equal(synthetic.structurallyValid, true);
  assert.equal(synthetic.productionEligible, false);
  assert.ok(synthetic.blockers.includes('production_evidence_source_not_real'));

  const missingScale = validateLoadoutConsequencePreviewProductionEvidenceManifest(manifest({
    evidenceSource: 'real',
    scaleTicket: { evidencePath: artifact('scale-missing.json'), passed: false, acceptedEvidenceIds: [] },
  }), { rootDir: tempRoot });
  assert.equal(missingScale.productionEligible, false);
  assert.ok(missingScale.blockers.includes('scale_ticket_evidence'));

  const highDelta = validateLoadoutConsequencePreviewProductionEvidenceManifest(manifest({
    evidenceSource: 'real',
    loadedScaleDelta: { evidencePath: artifact('delta-high.json'), passed: true, maxAcceptedDeltaPercent: 5, observedDeltaPercent: 9 },
  }), { rootDir: tempRoot });
  assert.equal(highDelta.productionEligible, false);
  assert.ok(highDelta.blockers.includes('loaded_scale_delta_exceeds_policy'));

  const real = validateLoadoutConsequencePreviewProductionEvidenceManifest(manifest({ evidenceSource: 'real' }), { rootDir: tempRoot });
  assert.equal(real.structurallyValid, true);
  assert.equal(real.productionEligible, true);

  console.log('Loadout consequence preview production readiness checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
