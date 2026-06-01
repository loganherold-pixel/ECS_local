const assert = require('assert/strict');

async function main() {
  const {
    buildEcsBriefProductionReadinessResult,
  } = await import('./check-ecs-brief-production-readiness.mjs');

  const result = buildEcsBriefProductionReadinessResult({ rootDir: process.cwd() });
  const checks = new Map(result.checks.map((check) => [check.id, check]));

  assert.equal(result.system, 'ecs_brief_advisory_pipeline');
  assert.equal(result.passed, false);
  assert.equal(result.status, 'blocked');

  [
    'central_dedupe_and_top_banner_pipeline_present',
    'telemetry_briefs_are_source_labeled_and_truthful',
    'remote_weather_and_route_hazards_are_deduped',
    'command_brief_surface_is_readiness_grounded',
    'brief_activity_uses_source_state_wording',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, true, `${id} should pass before device/producer evidence blockers remain`);
  });

  [
    'android_top_banner_visual_evidence_present',
    'real_live_producer_dedupe_evidence_present',
    'offline_stale_and_unavailable_brief_evidence_present',
    'brief_export_share_redaction_evidence_present',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, false, `${id} should remain blocked until real ECS Brief evidence exists`);
    assert.ok(result.blockers.includes(id), `${id} should be reported as an active blocker`);
  });

  console.log('ECS Brief production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
