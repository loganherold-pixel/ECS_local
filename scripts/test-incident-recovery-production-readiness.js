const assert = require('assert/strict');

async function main() {
  const {
    buildIncidentRecoveryProductionReadinessResult,
  } = await import('./check-incident-recovery-production-readiness.mjs');

  const result = buildIncidentRecoveryProductionReadinessResult({ rootDir: process.cwd() });
  const checks = new Map(result.checks.map((check) => [check.id, check]));

  assert.equal(result.system, 'incident_recovery_emergency_workflows');
  assert.equal(result.passed, false);
  assert.equal(result.status, 'blocked');

  [
    'incident_workflow_tracks_missing_data_and_timeline',
    'safety_agent_blocks_unsafe_tactical_recovery',
    'incident_reporting_and_debrief_do_not_publish_automatically',
    'dispatch_recovery_cad_is_local_and_gps_tolerant',
    'recovery_compass_labels_live_cached_offline_and_hazard_state',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, true, `${id} should pass before Android/field evidence blockers remain`);
  });

  [
    'android_incident_recovery_visual_evidence_present',
    'real_coordinate_packet_evidence_present',
    'dispatch_recovery_cad_device_evidence_present',
    'offline_cached_recovery_compass_evidence_present',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, false, `${id} should remain blocked until real Incident & Recovery evidence exists`);
    assert.ok(result.blockers.includes(id), `${id} should be reported as an active blocker`);
  });

  console.log('Incident & Recovery production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
