const assert = require('assert/strict');
const fs = require('fs');

async function main() {
  const {
    buildDispatchConvoyProductionReadinessResult,
  } = await import('./check-dispatch-convoy-production-readiness.mjs');

  const result = buildDispatchConvoyProductionReadinessResult({ rootDir: process.cwd() });
  const checks = new Map(result.checks.map((check) => [check.id, check]));

  assert.equal(result.system, 'dispatch_convoy_command');
  assert.equal(result.passed, false);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blockers, [
    'position_sharing_privacy_approval_recorded',
    'production_decision_recorded',
  ]);

  [
    'dispatch_internal_beta_gate_green',
    'convoy_panel_map_surface_present',
    'convoy_live_sharing_controls_present',
    'dashboard_convoy_widget_removed',
    'emergency_ping_truthful_and_local',
    'sensitive_dispatch_integrations_default_off',
    'android_dispatch_convoy_visual_evidence_present',
    'emergency_coordinate_ping_e2e_evidence_present',
  ].forEach((id) => {
    assert.equal(checks.get(id)?.passed, true, `${id} should pass before approval blockers remain`);
  });

  assert.equal(checks.get('position_sharing_privacy_approval_recorded')?.passed, false);
  assert.equal(checks.get('production_decision_recorded')?.passed, false);

  assert.equal(fs.existsSync('components/dashboard/command-center/widgets/ConvoyCommandWidget.tsx'), false);
  assert.equal(fs.existsSync('components/rive/ECSConvoyCommandRive.tsx'), false);
  assert.equal(fs.existsSync('assets/rive/ConvoyCommand.riv'), false);
  assert.equal(fs.existsSync('components/rive/ECSConvoyCommandPanelRive.tsx'), false);
  assert.equal(fs.existsSync('components/rive/ECSConvoyCommandPanelRive.native.tsx'), false);
  assert.equal(fs.existsSync('assets/rive/ConvoyCommand_Panel.riv'), false);
  assert.equal(fs.existsSync('public/rive/ConvoyCommand_Panel.riv'), false);

  console.log('dispatch convoy production readiness checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
