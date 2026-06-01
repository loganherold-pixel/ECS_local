const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const gate = await import(pathToFileURL(path.join(__dirname, 'check-dashboard-production-readiness.mjs')).href);
  const result = gate.buildDashboardProductionReadinessResult({ rootDir: path.join(__dirname, '..') });

  assert.strictEqual(result.system, 'dashboard_command_center_widgets');
  assert.strictEqual(result.passed, false, 'Dashboard production gate should remain blocked until Android/source-state evidence is recorded.');
  assert.strictEqual(result.status, 'blocked');

  [
    'dashboard_widget_registry_and_grid_are_responsive_and_guarded',
    'dashboard_widgets_are_source_labeled_and_do_not_fake_live_state',
    'dashboard_command_center_is_available_without_convoy_widget_menu',
    'dashboard_header_brief_and_detail_surfaces_use_shared_shells',
  ].forEach((id) => {
    const item = result.checks.find((check) => check.id === id);
    assert.ok(item, `${id} should be present`);
    assert.strictEqual(item.passed, true, `${id} should pass before Android/source-state evidence blockers remain`);
  });

  [
    'android_dashboard_widget_visual_evidence_present',
    'command_center_switching_device_evidence_present',
    'live_stale_unavailable_source_label_evidence_present',
    'phone_landscape_rotation_layout_evidence_present',
    'production_owner_decision_accepted',
  ].forEach((id) => {
    const item = result.checks.find((check) => check.id === id);
    assert.ok(item, `${id} should be present`);
    assert.strictEqual(item.passed, false, `${id} should block production until evidence is recorded`);
    assert.ok(result.blockers.includes(id), `${id} should appear in active blockers`);
  });

  assert.ok(
    result.notes.some((note) => note.includes('fake live data')),
    'Gate notes should keep Dashboard live-state truthfulness explicit.',
  );

  console.log('Dashboard production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
