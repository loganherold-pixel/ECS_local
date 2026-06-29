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

function seedProductionOrientationPolicy(root) {
  writeJson(path.join(root, 'app.json'), {
    expo: {
      orientation: 'portrait',
    },
  });
  writeText(
    path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    '<manifest><application><activity android:name=".MainActivity" android:screenOrientation="portrait" /></application></manifest>',
  );
}

function seedArtifacts(root) {
  writeJson(path.join(root, 'package.json'), {
    version: '1.0.0',
  });

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
    path.join('.smoke', 'dashboard-longpress-deep', 'controlled-center-module-longpress'),
    'ECS COMMAND MODULE Change Center Module ATTITUDE COMMAND Selected NAVIGATION COMMAND Centralized 3D follow map SELECT',
  );
  writeJson(path.join(root, '.smoke', 'android-tablet', 'smoke-summary.json'), {
    device: 'SM-X230',
    android: '16',
    package: 'com.expeditioncommand.planningofflinesync',
    installedVersion: 'versionCode=32 minSdk=24 targetSdk=36; versionName=1.0.0',
    routes: [
      {
        route: 'dashboard',
        rotation: '0',
        screenshot: path.join(root, '.smoke', 'android-tablet', 'dashboard.png'),
      },
      {
        route: 'dispatch-landscape',
        rotation: '1',
        screenshot: path.join(root, '.smoke', 'android-tablet', 'dispatch-landscape.png'),
      },
    ],
  });
  writeText(path.join(root, '.smoke', 'android-tablet', 'dashboard.png'), 'png');

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
  writeArtifactPair(
    root,
    path.join('.smoke', 'focused-android-qa', 'restart-fleet'),
    'OFFLINE FLEET Vehicle Profile Source CONFIDENCE estimated restart restore preserved local profile',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'dashboard-production-android', '00-profile-open'),
    'FLEET PROFILE Add Vehicle Profile Confirm Specs',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'dashboard-production-android', '00-fleet-setup-filled-top'),
    'OFFLINE FLEET VEHICLE COMMAND CENTER Fleet Add Vehicle No vehicles configured ECS FLEET NO VEHICLES STAGED',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'dashboard-production-android', '00-fleet-setup-bottom'),
    'FLEET PROFILE Add Vehicle Profile Confirm specs ECS estimated this from vehicle configuration PAYLOAD REMAINING Use ECS Estimate Confirm Specs',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'dispatch-convoy-android-qa', '05-fleet-loaded-ui'),
    'FLEET VEHICLE COMMAND CENTER Active Vehicles 1 Operating Weight Payload Left Confidence ecs_default Vehicle Profile Build & Loadout Weight Summary',
  );
  writeJson(path.join(root, '.smoke', 'fleet-production-evidence.json'), {
    productionDecision: 'accepted',
    reviewerSignoff: {
      productionOwner: 'accepted',
      product: 'pending',
      engineering: 'pending',
      qa: 'pending',
      privacy: 'pending',
      support: 'pending',
      acceptedAt: '2026-06-29T00:00:00.000Z',
    },
  });
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-evidence-backfill-'));
  seedReadiness(root);
  seedProductionOrientationPolicy(root);
  seedArtifacts(root);

  const script = await import(pathToFileURL(path.join(__dirname, 'backfill-production-evidence.mjs')).href);
  const results = script.buildProductionEvidenceBackfill({ rootDir: root, generatedAt: '2026-06-02T00:00:00.000Z' });

  assert.strictEqual(results.dashboard.androidDashboardWidgetVisualQaPassed, true);
  assert.strictEqual(results.dashboard.commandCenterSwitchingDeviceEvidencePassed, true);
  assert.strictEqual(results.dashboard.phoneLandscapeRotationLayoutEvidencePassed, true);
  assert.strictEqual(results.dashboard.productionDecision, 'pending_owner_signoff');
  assert.ok(results.dashboard.pending.includes('owner_signoff'));
  assert.strictEqual(
    results.dashboard.evidenceDetails.rotationLayout.status,
    'accepted_portrait_locked_no_phone_landscape_runtime',
  );
  assert.ok(results.dashboard.evidenceReferences.some((item) => item.includes('.smoke/android-tab-dashboard.png')));
  assert.ok(results.dashboard.evidenceReferences.some((item) => item.includes('.smoke/ecs-smoke-dashboard.xml')));
  assert.ok(results.dashboard.evidenceReferences.some((item) => item.includes('.smoke/dashboard-deep/01-dashboard-baseline.png')));
  assert.ok(results.dashboard.evidenceReferences.some((item) => item.includes('.smoke/dashboard-longpress-deep/controlled-center-module-longpress.xml')));

  assert.strictEqual(results.explore.androidExploreTrailPacksVisualQaPassed, false);
  assert.strictEqual(results.explore.contentReviewModerationEvidencePassed, false);
  assert.strictEqual(results.explore.exploreToNavigateDeviceHandoffEvidencePassed, false);
  assert.strictEqual(results.explore.privacySubmissionEvidencePassed, false);
  assert.ok(results.explore.partialEvidenceReferences.some((item) => item.includes('.smoke/explore-deep/01-explore-entry.png')));
  assert.strictEqual(results.explore.productionDecision, 'pending_owner_signoff');

  assert.strictEqual(results.fleet.sourceConfidenceOfflineStatesVisible, true);
  assert.strictEqual(results.fleet.androidFleetProfileVisualQaPassed, true);
  assert.strictEqual(results.fleet.multiVehicleActiveSelectionEvidencePassed, true);
  assert.strictEqual(results.fleet.scaleTicketProfileEvidencePassed, true);
  assert.strictEqual(results.fleet.offlinePersistenceMigrationEvidencePassed, true);
  assert.strictEqual(results.fleet.productionDecision, 'accepted');
  assert.strictEqual(results.fleet.reviewerSignoff.productionOwner, 'accepted');
  assert.strictEqual(results.fleet.reviewerSignoff.qa, 'pending');
  assert.strictEqual(results.fleet.buildAndDevice.appBuildType, 'fieldtest_eas_apk');
  assert.strictEqual(results.fleet.buildAndDevice.androidDeviceModel, 'SM-X230');
  assert.strictEqual(results.fleet.buildAndDevice.androidOsVersion, '16');
  assert.strictEqual(results.fleet.androidQaStateMatrix.noPhotoContractVisible, true);
  assert.ok(results.fleet.evidenceReferences.some((item) => item.includes('fleetQaPreload:verified_vs_estimated_weight')));
  assert.ok(!results.fleet.pending.includes('owner_signoff'));
  assert.ok(results.fleet.pending.includes('role_review_product_engineering_qa_privacy_support'));
  assert.strictEqual(
    results.fleet.evidenceDetails.scaleTicket.status,
    'accepted_fixture_scale_ticket_confidence_path_not_real_ticket',
  );

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
