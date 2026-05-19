const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const gate = await import(pathToFileURL(path.join(__dirname, 'check-explore-trail-packs-production-readiness.mjs')).href);
  const result = gate.buildExploreTrailPacksProductionReadinessResult({ rootDir: path.join(__dirname, '..') });

  assert.strictEqual(result.system, 'explore_trail_packs_route_discovery');
  assert.strictEqual(result.passed, false, 'Explore Trail Packs production gate should remain blocked until Android/content/privacy evidence is recorded.');
  assert.strictEqual(result.status, 'blocked');

  [
    'approved_only_discovery_with_radius_and_review_state',
    'confidence_engine_blocks_bad_geometry_closures_stale_and_low_evidence',
    'moderation_and_feedback_suppress_public_visibility',
    'submissions_require_permission_certification_and_pending_review',
    'preview_and_navigate_handoff_are_guarded_and_source_labeled',
    'explore_ui_keeps_truthful_empty_review_and_owner_states',
  ].forEach((id) => {
    const item = result.checks.find((check) => check.id === id);
    assert.ok(item, `${id} should be present`);
    assert.strictEqual(item.passed, true, `${id} should pass before evidence blockers remain`);
  });

  [
    'android_explore_trail_packs_visual_evidence_present',
    'content_review_and_moderation_evidence_present',
    'explore_to_navigate_device_handoff_evidence_present',
    'privacy_submission_evidence_present',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    const item = result.checks.find((check) => check.id === id);
    assert.ok(item, `${id} should be present`);
    assert.strictEqual(item.passed, false, `${id} should block production until evidence is recorded`);
    assert.ok(result.blockers.includes(id), `${id} should appear in active blockers`);
  });

  assert.ok(
    result.notes.some((note) => note.includes('must not publish pending')),
    'Gate notes should keep public visibility guardrails explicit.',
  );

  console.log('Explore Trail Packs production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
