const assert = require('assert/strict');

async function main() {
  const {
    buildWeatherProductionReadinessResult,
  } = await import('./check-weather-production-readiness.mjs');

  const result = buildWeatherProductionReadinessResult({ rootDir: process.cwd() });
  const checks = new Map(result.checks.map((check) => [check.id, check]));

  assert.equal(result.system, 'weather_route_hazard_intelligence');
  assert.equal(result.passed, false);
  assert.equal(result.status, 'blocked');

  [
    'coordinate_first_shared_weather_source_of_truth',
    'freshness_stale_cache_and_permission_states_are_explicit',
    'operational_weather_dedupes_requests_and_retains_last_good_state',
    'dispatch_and_command_brief_weather_updates_are_deduped_and_freshness_labeled',
    'route_weather_hazard_toasts_require_current_or_fresh_source',
    'dev_diagnostics_redact_provider_endpoints_and_secrets',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, true, `${id} should pass before provider/device evidence blockers remain`);
  });

  [
    'real_provider_source_freshness_evidence_present',
    'android_route_weather_visual_evidence_present',
    'weather_alert_dispatch_brief_e2e_evidence_present',
    'offline_stale_weather_device_evidence_present',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, false, `${id} should remain blocked until real weather evidence exists`);
    assert.ok(result.blockers.includes(id), `${id} should be reported as an active blocker`);
  });

  console.log('weather production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
