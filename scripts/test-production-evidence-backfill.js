const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function writeArtifactPair(root, relativeBase, visibleText) {
  writeText(path.join(root, `${relativeBase}.png`), 'png');
  writeText(
    path.join(root, `${relativeBase}.xml`),
    `<?xml version="1.0"?><hierarchy rotation="0"><node text="${visibleText}" content-desc="${visibleText}" bounds="[0,0][1200,1920]" /></hierarchy>`,
  );
}

function seedReadiness(root) {
  writeJson(path.join(root, '.smoke', 'dashboard-production-readiness-result.json'), {
    system: 'dashboard_command_center_widgets',
    status: 'blocked',
    checkedAt: '2026-06-01T00:00:00.000Z',
    blockers: [
      'android_dashboard_widget_visual_evidence_present',
      'command_center_switching_device_evidence_present',
      'phone_landscape_rotation_layout_evidence_present',
      'production_owner_decision_accepted',
    ],
  });
  writeJson(path.join(root, '.smoke', 'explore-trail-packs-production-readiness-result.json'), {
    system: 'explore_trail_packs_route_discovery',
    status: 'blocked',
    checkedAt: '2026-06-01T00:00:00.000Z',
    blockers: [
      'android_explore_trail_packs_visual_evidence_present',
      'content_review_and_moderation_evidence_present',
      'explore_to_navigate_device_handoff_evidence_present',
      'privacy_submission_evidence_present',
      'production_owner_decision_accepted',
    ],
  });
  writeJson(path.join(root, '.smoke', 'fleet-production-readiness-result.json'), {
    system: 'fleet_vehicle_readiness_payload',
    status: 'blocked',
    checkedAt: '2026-06-01T00:00:00.000Z',
    blockers: [
      'fleet_production_evidence_contract_complete',
      'android_fleet_profile_visual_evidence_present',
      'multi_vehicle_active_selection_evidence_present',
      'scale_ticket_profile_evidence_present',
      'source_confidence_offline_android_qa_evidence_present',
      'offline_persistence_migration_evidence_present',
      'production_owner_decision_accepted',
    ],
  });
}

function seedArtifacts(root) {
  writeArtifactPair(
    root,
    path.join('.smoke', 'android-tab-dashboard'),
    'DASHBOARD WIDGETS CURRENT WEATHER VEHICLE PROFILE ROUTE PROGRESS POWER MONITOR OFFLINE',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'ecs-smoke-dashboard'),
    'DASHBOARD WIDGETS Forecast unavailable Weather unavailable Select an active vehicle',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'dashboard-deep', '01-dashboard-baseline'),
    'WIDGETS ECS BRIEF EXPEDITION Remaining Sunlight CURRENT WEATHER VEHICLE PROFILE ROUTE PROGRESS POWER MONITOR OFFLINE',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'dashboard-deep', '09-expand-widgets'),
    'Contract Dashboard widgets Forecast unavailable Weather unavailable FUEL 32 GAL (MANUALLY SET)',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'dashboard-deep', '20-after-zero-attitude'),
    'Zero pitch and roll Disable attitude monitor sound',
  );

  writeArtifactPair(
    root,
    path.join('.smoke', 'explore-deep', '01-explore-entry'),
    'EXPLORE SUGGESTED ROUTES Trail Packs 1 TRAIL PACK GPS RANGE DISPLAY ON MAP',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'explore-deep', '18-offline-prep-prepare-result'),
    'OFFLINE PREP Waypoints Unavailable Vehicle Readiness Ready Route geometry is missing',
  );

  writeArtifactPair(
    root,
    path.join('.smoke', 'android-tab-fleet'),
    'FLEET VEHICLE COMMAND CENTER Vehicle Profile Build & Loadout Weight Summary ESTIMATED CONFIDENCE Source Missing or estimated values keep Fleet in verification',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'ecs-smoke-fleet'),
    'OFFLINE FLEET Operating Weight Payload Left user_estimate Verify base weight',
  );
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-evidence-backfill-'));
  seedReadiness(root);
  seedArtifacts(root);

  const script = await import(pathToFileURL(path.join(__dirname, 'backfill-production-evidence.mjs')).href);
  const results = script.buildProductionEvidenceBackfill({ rootDir: root, generatedAt: '2026-06-02T00:00:00.000Z' });

  assert.strictEqual(results.dashboard.androidDashboardWidgetVisualQaPassed, true);
  assert.strictEqual(results.dashboard.commandCenterSwitchingDeviceEvidencePassed, false);
  assert.strictEqual(results.dashboard.phoneLandscapeRotationLayoutEvidencePassed, false);
  assert.strictEqual(results.dashboard.productionDecision, 'pending_owner_signoff');
  assert.ok(results.dashboard.pending.includes('owner_signoff'));
  assert.ok(results.dashboard.evidenceReferences.some((item) => item.includes('.smoke/android-tab-dashboard.png')));
  assert.ok(results.dashboard.evidenceReferences.some((item) => item.includes('.smoke/ecs-smoke-dashboard.xml')));
  assert.ok(results.dashboard.evidenceReferences.some((item) => item.includes('.smoke/dashboard-deep/01-dashboard-baseline.png')));

  assert.strictEqual(results.explore.androidExploreTrailPacksVisualQaPassed, false);
  assert.strictEqual(results.explore.contentReviewModerationEvidencePassed, false);
  assert.strictEqual(results.explore.exploreToNavigateDeviceHandoffEvidencePassed, false);
  assert.strictEqual(results.explore.privacySubmissionEvidencePassed, false);
  assert.ok(results.explore.partialEvidenceReferences.some((item) => item.includes('.smoke/explore-deep/01-explore-entry.png')));
  assert.strictEqual(results.explore.productionDecision, 'pending_owner_signoff');

  assert.strictEqual(results.fleet.sourceConfidenceOfflineStatesVisible, true);
  assert.strictEqual(results.fleet.androidFleetProfileVisualQaPassed, false);
  assert.strictEqual(results.fleet.scaleTicketProfileEvidencePassed, false);
  assert.strictEqual(results.fleet.offlinePersistenceMigrationEvidencePassed, false);
  assert.strictEqual(results.fleet.productionDecision, 'pending_owner_signoff');
  assert.strictEqual(results.fleet.androidQaStateMatrix.noPhotoContractVisible, true);
  assert.ok(results.fleet.evidenceReferences.some((item) => item.includes('fleetQaPreload:verified_vs_estimated_weight')));
  assert.ok(results.fleet.pending.includes('real_scale_ticket_or_axle_weight_device_evidence'));

  script.writeProductionEvidenceBackfill(results, { rootDir: root });
  for (const relativePath of [
    '.smoke/dashboard-production-evidence.json',
    '.smoke/explore-trail-packs-production-evidence.json',
    '.smoke/fleet-production-evidence.json',
  ]) {
    assert.ok(fs.existsSync(path.join(root, relativePath)), `${relativePath} should be written`);
  }

  console.log('Production evidence backfill checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
