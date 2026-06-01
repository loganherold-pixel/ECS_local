const assert = require('assert/strict');

async function main() {
  const {
    buildGarminInreachProductionReadinessResult,
  } = await import('./check-garmin-inreach-production-readiness.mjs');

  const result = buildGarminInreachProductionReadinessResult({ rootDir: process.cwd() });
  const checks = new Map(result.checks.map((check) => [check.id, check]));

  assert.equal(result.system, 'garmin_inreach_satellite_communications');
  assert.equal(result.passed, false);
  assert.equal(result.status, 'blocked');

  [
    'default_off_and_secrets_safe',
    'webhook_requires_token_and_dedupes',
    'mapshare_readonly_stale_and_safe',
    'mapshare_missing_timestamp_is_not_fresh',
    'ui_visibility_operator_confirmation_and_sos_review',
    'expedition_intelligence_never_auto_commands',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, true, `${id} should pass before device/provider evidence blockers remain`);
  });

  [
    'real_mapshare_feed_device_evidence_present',
    'ipc_webhook_staging_evidence_present',
    'operator_confirmed_command_evidence_present',
    'sos_review_only_field_evidence_present',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, false, `${id} should remain blocked until real Garmin/inReach evidence exists`);
    assert.ok(result.blockers.includes(id), `${id} should be reported as an active blocker`);
  });

  console.log('Garmin/inReach production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
