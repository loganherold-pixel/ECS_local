const assert = require('assert/strict');

async function main() {
  const {
    buildOfflineNavigationProductionReadinessResult,
  } = await import('./check-offline-navigation-production-readiness.mjs');

  const result = buildOfflineNavigationProductionReadinessResult({ rootDir: process.cwd() });
  const checks = new Map(result.checks.map((check) => [check.id, check]));

  assert.equal(result.system, 'offline_navigation');
  assert.equal(result.passed, false);
  assert.equal(result.status, 'blocked');

  [
    'offline_readiness_derives_route_style_layer_and_stale_states',
    'prepare_offline_persists_route_intent_and_starts_route_sync',
    'downloaded_sync_open_restores_offline_route_preview',
    'departure_audit_and_prepare_offline_cta_visible',
    'camp_layers_use_cached_or_labeled_offline_reference',
    'offline_mode_copy_blocks_live_search_reroute_overclaims',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, true, `${id} should pass before Android no-network evidence blockers remain`);
  });

  [
    'android_no_network_route_e2e_evidence_present',
    'offline_map_tiles_and_route_cache_verified',
    'offline_camp_pins_or_unavailable_label_verified',
    'offline_departure_audit_device_verified',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, false, `${id} should remain blocked until Android offline evidence exists`);
    assert.ok(result.blockers.includes(id), `${id} should be reported as an active blocker`);
  });

  console.log('offline navigation production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
