const assert = require('assert/strict');

async function main() {
  const {
    buildAuthProductionReadinessResult,
  } = await import('./check-auth-production-readiness.mjs');

  const result = buildAuthProductionReadinessResult({ rootDir: process.cwd() });
  const checks = new Map(result.checks.map((check) => [check.id, check]));

  assert.equal(result.system, 'auth_session_subscription_access');
  assert.equal(result.passed, false);
  assert.equal(result.status, 'blocked');

  [
    'startup_loading_is_bounded_and_diagnostic',
    'login_requests_are_single_flight_and_redacted',
    'auth_logs_and_audits_are_sanitized',
    'distribution_entry_and_offline_restore_are_explicit',
    'subscription_and_access_fallbacks_are_non_privileged',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, true, `${id} should pass before provider/device evidence blockers remain`);
  });

  [
    'real_provider_signup_signin_signout_evidence_present',
    'android_cold_warm_offline_startup_evidence_present',
    'password_reset_activation_evidence_present',
    'subscription_entitlement_provider_evidence_present',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, false, `${id} should remain blocked until real auth evidence exists`);
    assert.ok(result.blockers.includes(id), `${id} should be reported as an active blocker`);
  });

  console.log('auth production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
