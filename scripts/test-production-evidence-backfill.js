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

function assertSmokeEvidenceGitignorePolicy() {
  const gitignorePath = path.join(__dirname, '..', '.gitignore');
  const source = fs.readFileSync(gitignorePath, 'utf8').replace(/\r\n/g, '\n');
  const lines = source.split('\n').map((line) => line.trim());

  assert.ok(
    !lines.includes('.smoke/'),
    '.gitignore should not ignore the whole .smoke directory when curated evidence manifests are tracked.',
  );
  assert.ok(
    lines.includes('.smoke/*'),
    '.gitignore should ignore raw .smoke contents with .smoke/* so narrow manifest exceptions can work.',
  );
  assert.ok(
    lines.includes('!.smoke/'),
    '.gitignore should keep the .smoke directory visible for tracked curated manifests.',
  );
  assert.ok(
    lines.includes('!.smoke/dashboard-production-evidence.json'),
    'Dashboard production evidence manifest should be explicitly trackable.',
  );
  assert.ok(
    lines.includes('!.smoke/explore-trail-packs-production-evidence.json'),
    'Explore Trail Packs production evidence manifest should be explicitly trackable.',
  );
  assert.ok(
    lines.includes('!.smoke/established-campgrounds-production-evidence.json'),
    'Established Campgrounds production evidence manifest should be explicitly trackable.',
  );
  assert.ok(
    lines.includes('!.smoke/fleet-production-evidence.json'),
    'Fleet production evidence manifest should be explicitly trackable.',
  );
  assert.ok(
    lines.includes('!.smoke/offline-navigation-production-evidence.json'),
    'Offline Navigation production evidence manifest should be explicitly trackable.',
  );
  assert.ok(
    !lines.includes('!.smoke/*.json'),
    '.gitignore should not track every generated smoke JSON file.',
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
  writeJson(path.join(root, '.smoke', 'established-campgrounds-production-readiness-result.json'), {
    system: 'established_campgrounds',
    status: 'blocked',
    checkedAt: '2026-06-01T00:00:00.000Z',
    blockers: [
      'production_scheduler_configured',
      'provider_health_checked',
      'sync_runs_validated',
      'canonical_records_validated',
      'availability_freshness_validated',
      'android_visible_pin_popup_action_evidence_recorded',
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
  writeJson(path.join(root, '.smoke', 'offline-navigation-production-readiness-result.json'), {
    system: 'offline_navigation',
    status: 'blocked',
    checkedAt: '2026-06-01T00:00:00.000Z',
    blockers: [
      'android_no_network_route_e2e_evidence_present',
      'offline_map_tiles_and_route_cache_verified',
      'offline_camp_pins_or_unavailable_label_verified',
      'offline_departure_audit_device_verified',
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
    'EXPLORE SUGGESTED ROUTES Trail Packs 1 TRAIL PACK GPS RANGE DISPLAY ON MAP Showing 5 Explore picks and 6 drivable trails inside 100 mi',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'explore-deep', '04-display-on-map-result'),
    'NAVIGATE Filtered Suggested Trailhead routes are displayed on the Navigate map DISPLAY ON MAP 1 map-ready trail line',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'explore-deep', '07-trip-builder-tab'),
    'EXPLORE TRIP BUILDER LIVE selected route handoff',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'explore-deep', '09-trip-builder-opened'),
    'EXPLORE PLANNING Trip Builder Turn a selected route into a day trip overnight route or expedition-style plan BUILD TRIP PLAN',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'explore-deep', '13-trip-builder-plan-result'),
    'TRIP BUILDER Trip Plan result route handoff itinerary camps unavailable exit points unavailable',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'explore-deep', '18-offline-prep-prepare-result'),
    'OFFLINE PREP Waypoints Unavailable Vehicle Readiness Ready Route geometry is missing',
  );

  writeText(
    path.join(root, 'docs', 'integrations', 'established-campgrounds-provider-sync.md'),
    [
      'Production Scheduling Options',
      'Scheduling is a deployment environment responsibility',
      'campground_provider_configs.sync_interval_minutes',
      'campground_sync_runs records_read records_upserted records_failed error_count',
      'campground_availability.expires_at last_availability_checked_at degrade to `unknown`',
    ].join('\n'),
  );
  writeText(
    path.join(root, 'scripts', 'test-established-campgrounds-scheduling.js'),
    'Production Scheduling Options campground_provider_configs.sync_interval_minutes campground_sync_runs records_read records_upserted error_count',
  );
  writeText(
    path.join(root, 'scripts', 'test-campground-provider-health-edge-function.js'),
    'requireAdmin(req) hasRequiredSecrets missingSecretRefs checkedAt providerId enabled attributionConfigured',
  );
  writeText(
    path.join(root, 'supabase', 'functions', 'campground-provider-health', 'index.ts'),
    'serve async requireAdmin(req) hasRequiredSecrets missingSecretRefs checkedAt providerId enabled attributionConfigured',
  );
  writeText(
    path.join(root, 'supabase', 'migrations', '020_established_campgrounds_provider_layer.sql'),
    'campground_provider_configs.sync_interval_minutes campground_sync_runs records_read records_upserted records_failed error_count campground_source_records search_established_campgrounds_bbox campgrounds source_confidence secret_ref campground_availability expires_at',
  );
  writeText(
    path.join(root, 'supabase', 'migrations', '021_campground_availability_checked_at.sql'),
    'last_availability_checked_at expires_at campgrounds',
  );
  writeText(
    path.join(root, 'supabase', 'functions', '_shared', 'campgroundApi.ts'),
    'isAvailabilityFresh effectiveAvailabilityStatus rawJson: null expires_at last_availability_checked_at lastAvailabilityCheckedAt campground_source_records sourceRecordCount',
  );
  writeText(
    path.join(root, 'supabase', 'functions', 'campgrounds-search', 'index.ts'),
    "from('campgrounds') campground_source_records lastAvailabilityCheckedAt source / attribution",
  );
  writeText(
    path.join(root, 'supabase', 'functions', 'campground-detail', 'index.ts'),
    "from('campgrounds') campground_source_records buildCampgroundDetailResponse lastAvailabilityCheckedAt",
  );
  for (const functionName of [
    'campgrounds-sync-ridb',
    'campgrounds-sync-nps',
    'campgrounds-sync-campflare',
    'campgrounds-sync-active',
    'campgrounds-sync-reserveamerica',
    'campgrounds-sync-aspira',
    'campgrounds-sync-osm',
    'campgrounds-dedupe',
  ]) {
    writeText(
      path.join(root, 'supabase', 'functions', functionName, 'index.ts'),
      'campground_sync_runs records_read records_upserted records_failed error_count',
    );
  }
  writeText(
    path.join(root, 'supabase', 'functions', 'campgrounds-sync-campflare', 'campflareAdapter.ts'),
    'expires_at last_checked_at',
  );
  writeText(
    path.join(root, 'lib', 'map', 'establishedCampgroundMobile.ts'),
    'formatCampgroundAvailabilityLabel Availability unknown lastAvailabilityCheckedAt',
  );
  writeText(
    path.join(root, 'lib', 'map', 'establishedCampgroundDetailRows.ts'),
    'Source / attribution lastAvailabilityCheckedAt',
  );
  writeText(
    path.join(root, 'lib', 'map', 'establishedCampsiteGeojsonAdapter.ts'),
    'dedupe source confidence coordinates established campground',
  );
  writeText(
    path.join(root, 'tests', 'map', 'establishedCampgroundsMobile.test.ts'),
    'Source / attribution Availability unknown lastAvailabilityCheckedAt',
  );
  writeText(
    path.join(root, 'tests', 'map', 'establishedCampsitesLayer.test.ts'),
    'Established Campgrounds Source / attribution lastAvailabilityCheckedAt',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'campops-android-qa', 'phone-navigate-camp-layers-zoom-gated'),
    'NAVIGATE CAMP LAYERS Established Campgrounds Zoom to 8+ to load established campgrounds Verify local rules before camping',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'campops-android-qa', 'phone-candidate-viewport-popup-actions'),
    'CAMP INTEL QA Ridge Bench non-live fixture data NAVIGATE HERE SAVE CAMP REPORT UNUSABLE Medium source confidence',
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

  writeArtifactPair(
    root,
    path.join('.smoke', 'navigate-deep', '04-start-guidance'),
    'OFFLINE NAVIGATE ROUTE PREVIEW STAGED Start Guidance ECS Readiness Hold Continue Anyway Route geometry is not cached',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'navigate-deep', '09-active-readiness-reopen'),
    'OFFLINE NAVIGATE ACTIVE EXPEDITION READINESS Offline: Missing Open Command Brief Minimize active guidance',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'offline-readiness-deep', '03-ecs-brief-departure-audit'),
    'OFFLINE Departure Audit Offline map package MISSING DOWNLOAD ROUTE PACKAGE Camp candidates CAUTION Weather snapshot COMPLETE',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'offline-readiness-deep', '04-download-route-package-handoff'),
    'OFFLINE MAPS OFFLINE READINESS NO CACHED REGIONS Saved regions stay available offline across app restarts',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'offline-readiness-deep', '10-offline-prep-pack-opened'),
    'OFFLINE PREP Offline Prep Pack Offline Map Unavailable Route Line Unavailable Campsites Unavailable',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'offline-readiness-deep', '13-prepare-offline-pack-action'),
    'OFFLINE PREP Prepare Offline Pack PREPARE OFFLINE PACK Unavailable Items Route geometry is missing Campsites Unavailable',
  );
  writeJson(path.join(root, '.smoke', 'offline-readiness-deep', 'test-summary.json'), [
    { script: 'test:navigate-offline-route-flow', exitCode: 0 },
    { script: 'test:offline-sync-coordinator', exitCode: 0 },
    { script: 'test:offline-departure-audit', exitCode: 0 },
    { script: 'test:offline-navigation-production', exitCode: 0 },
    { script: 'gate:offline-navigation-production', exitCode: 1 },
  ]);
  writeText(
    path.join(root, '.smoke', 'offline-readiness-deep', 'test-test-navigate-offline-route-flow.log'),
    'navigate offline route flow regression passed',
  );
  writeText(
    path.join(root, '.smoke', 'offline-readiness-deep', 'test-test-offline-sync-coordinator.log'),
    'Offline sync coordinator checks passed.',
  );
  writeText(
    path.join(root, '.smoke', 'offline-readiness-deep', 'test-test-offline-departure-audit.log'),
    'Offline preparedness and departure audit checks passed.',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'campops-android-qa', 'phone-navigate-camp-layers-zoom-gated'),
    'NAVIGATE OFFLINE CAMP LAYERS Established Campgrounds Dispersed Camping Eligibility Verify local rules before camping Zoom to 8+ to load established campgrounds',
  );
  writeArtifactPair(
    root,
    path.join('.smoke', 'campops-android-qa', 'stale-and-legacy'),
    'Offline cached source data Cached data is usable with lower confidence Unknowns remain visible Never show cached data as current Offline no-cache Missing data lowers confidence Unknown fields stay unknown',
  );
  writeJson(path.join(root, '.smoke', 'offline-failure-drill-android-evidence', 'manifest.json'), {
    evidenceSource: 'fixture',
    networkState: { appObservedOffline: false, systemNetworkDisabled: false, runtimeNetworkProbe: 'unknown' },
    ownerAcceptance: { accepted: false },
    validationNotes: ['Do not fake Android evidence.'],
  });
  writeText(
    path.join(root, 'scripts', 'test-navigate-offline-route-flow-regression.js'),
    "Downloaded Syncs\nROUTE SYNC\npreviewRoadRoute(cachedRoadRoute, 'offline_sync_open')\n",
  );
  writeText(
    path.join(root, 'scripts', 'test-offline-sync-coordinator.js'),
    "Downloaded Syncs\nofflineTileSyncCoordinator.resumePendingJobs({ syncType: 'route' });\n",
  );
  writeText(
    path.join(root, 'scripts', 'test-offline-departure-audit.js'),
    'Departure Audit Download Route Package Offline: {offlineStatus}',
  );
}

async function main() {
  assertSmokeEvidenceGitignorePolicy();

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

  assert.strictEqual(results.explore.androidExploreTrailPacksVisualQaPassed, true);
  assert.strictEqual(results.explore.contentReviewModerationEvidencePassed, false);
  assert.strictEqual(results.explore.exploreToNavigateDeviceHandoffEvidencePassed, true);
  assert.strictEqual(results.explore.privacySubmissionEvidencePassed, false);
  assert.ok(results.explore.evidenceReferences.some((item) => item.includes('.smoke/explore-deep/01-explore-entry.png')));
  assert.ok(results.explore.evidenceReferences.some((item) => item.includes('.smoke/explore-deep/04-display-on-map-result.xml')));
  assert.ok(results.explore.evidenceReferences.some((item) => item.includes('.smoke/explore-deep/09-trip-builder-opened.png')));
  assert.ok(results.explore.partialEvidenceReferences.some((item) => item.includes('.smoke/explore-deep/01-explore-entry.png')));
  assert.strictEqual(results.explore.evidenceDetails.trailPackProductionVisual.status, 'captured');
  assert.strictEqual(results.explore.evidenceDetails.handoff.status, 'captured_existing_explore_to_navigate_and_trip_builder_path');
  assert.strictEqual(results.explore.evidenceDetails.contentModeration.status, 'blocked_no_review_queue_device_capture');
  assert.strictEqual(results.explore.evidenceDetails.privacySubmission.status, 'blocked_no_privacy_submission_capture');
  assert.ok(results.explore.pending.includes('content_review_moderation_suppression_evidence'));
  assert.ok(results.explore.pending.includes('privacy_certification_submission_evidence'));
  assert.ok(!results.explore.pending.includes('full_trail_pack_card_preview_feedback_submission_visual_sweep'));
  assert.ok(!results.explore.pending.includes('trail_pack_to_navigate_device_handoff_evidence'));
  assert.strictEqual(results.explore.productionDecision, 'pending_owner_signoff');

  assert.strictEqual(results.establishedCampgrounds.productionSchedulerConfigured, true);
  assert.strictEqual(results.establishedCampgrounds.providerHealthChecked, true);
  assert.strictEqual(results.establishedCampgrounds.syncRunsValidated, true);
  assert.strictEqual(results.establishedCampgrounds.canonicalRecordsValidated, true);
  assert.strictEqual(results.establishedCampgrounds.availabilityFreshnessValidated, true);
  assert.strictEqual(results.establishedCampgrounds.androidVisiblePinPopupActionEvidenceRecorded, true);
  assert.strictEqual(results.establishedCampgrounds.productionDecision, 'pending_owner_signoff');
  assert.ok(results.establishedCampgrounds.pending.includes('owner_signoff'));
  assert.strictEqual(
    results.establishedCampgrounds.evidenceDetails.scheduler.status,
    'accepted_deployment_scheduler_contract_not_live_scheduler',
  );
  assert.strictEqual(
    results.establishedCampgrounds.evidenceDetails.androidPinActions.status,
    'captured_existing_android_camp_layer_actions_not_provider_backed_acceptance',
  );
  assert.strictEqual(results.establishedCampgrounds.redaction.providerSecretValuesCaptured, false);
  assert.strictEqual(results.establishedCampgrounds.redaction.rawProviderPayloadsCaptured, false);
  assert.ok(
    results.establishedCampgrounds.evidenceScope.notClaimed.includes('production owner acceptance'),
    'Established Campgrounds manifest should keep owner acceptance out of the evidence backfill.',
  );
  assert.ok(
    results.establishedCampgrounds.evidenceScope.notClaimed.includes('raw provider payload review'),
    'Established Campgrounds manifest should not claim raw provider payload review.',
  );

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

  assert.strictEqual(results.offline.androidNoNetworkRouteE2ePassed, true);
  assert.strictEqual(results.offline.offlineMapTilesRouteCacheVerified, true);
  assert.strictEqual(results.offline.offlineCampPinsAvailabilityVerified, true);
  assert.strictEqual(results.offline.offlineDepartureAuditDeviceVerified, true);
  assert.strictEqual(results.offline.productionDecision, 'pending_owner_signoff');
  assert.ok(results.offline.pending.includes('owner_signoff'));
  assert.ok(results.offline.evidenceReferences.some((item) => item.includes('.smoke/navigate-deep/04-start-guidance.png')));
  assert.ok(results.offline.evidenceReferences.some((item) => item.includes('.smoke/offline-readiness-deep/03-ecs-brief-departure-audit.xml')));
  assert.ok(results.offline.evidenceReferences.some((item) => item.includes('.smoke/campops-android-qa/stale-and-legacy.xml')));
  assert.strictEqual(
    results.offline.evidenceDetails.androidNoNetworkRouteStart.status,
    'captured_app_visible_offline_android_route_start',
  );
  assert.strictEqual(
    results.offline.evidenceDetails.downloadedSyncReopen.status,
    'accepted_repeatable_regression_plus_android_offline_maps_handoff',
  );
  assert.strictEqual(
    results.offline.evidenceDetails.offlineFailureDrill.status,
    'blocked_fixture_only_or_missing_real_manifest',
  );
  assert.ok(
    results.offline.evidenceScope.notClaimed.includes('production owner acceptance'),
    'Offline manifest should keep production acceptance out of the evidence backfill.',
  );

  script.writeProductionEvidenceBackfill(results, { rootDir: root });
  for (const relativePath of [
    '.smoke/dashboard-production-evidence.json',
    '.smoke/explore-trail-packs-production-evidence.json',
    '.smoke/established-campgrounds-production-evidence.json',
    '.smoke/fleet-production-evidence.json',
    '.smoke/offline-navigation-production-evidence.json',
  ]) {
    assert.ok(fs.existsSync(path.join(root, relativePath)), `${relativePath} should be written`);
  }

  console.log('Production evidence backfill checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
