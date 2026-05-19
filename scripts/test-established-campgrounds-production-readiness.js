const assert = require('assert/strict');

async function main() {
  const {
    buildEstablishedCampgroundsProductionReadinessResult,
  } = await import('./check-established-campgrounds-production-readiness.mjs');

  const result = buildEstablishedCampgroundsProductionReadinessResult({ rootDir: process.cwd() });
  const checks = new Map(result.checks.map((check) => [check.id, check]));

  assert.equal(result.system, 'established_campgrounds');
  assert.equal(result.passed, false);
  assert.equal(result.status, 'blocked');

  [
    'mobile_uses_ecs_owned_cached_endpoints',
    'provider_secrets_not_in_mobile_or_search',
    'attribution_and_freshness_preserved',
    'runbook_documents_provider_operations',
    'mobile_pin_popup_actions_and_zoom_guardrails',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, true, `${id} should pass before deployment evidence blockers remain`);
  });

  [
    'production_scheduler_configured',
    'provider_health_checked',
    'sync_runs_validated',
    'canonical_records_validated',
    'availability_freshness_validated',
    'android_visible_pin_popup_action_evidence_recorded',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, false, `${id} should remain blocked until real deployment evidence exists`);
    assert.ok(result.blockers.includes(id), `${id} should be reported as an active blocker`);
  });

  console.log('established campgrounds production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
