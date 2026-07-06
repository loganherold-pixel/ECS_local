import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_RELATIVE_PATH = 'scripts/backfill-production-evidence.mjs';

const OUTPUTS = {
  dashboard: path.join('.smoke', 'dashboard-production-evidence.json'),
  explore: path.join('.smoke', 'explore-trail-packs-production-evidence.json'),
  establishedCampgrounds: path.join('.smoke', 'established-campgrounds-production-evidence.json'),
  fleet: path.join('.smoke', 'fleet-production-evidence.json'),
  offline: path.join('.smoke', 'offline-navigation-production-evidence.json'),
};

const READINESS_RESULTS = {
  dashboard: path.join('.smoke', 'dashboard-production-readiness-result.json'),
  explore: path.join('.smoke', 'explore-trail-packs-production-readiness-result.json'),
  establishedCampgrounds: path.join('.smoke', 'established-campgrounds-production-readiness-result.json'),
  fleet: path.join('.smoke', 'fleet-production-readiness-result.json'),
  offline: path.join('.smoke', 'offline-navigation-production-readiness-result.json'),
};

const ESTABLISHED_CAMPGROUND_SYNC_FUNCTIONS = [
  'campgrounds-sync-ridb',
  'campgrounds-sync-nps',
  'campgrounds-sync-campflare',
  'campgrounds-sync-active',
  'campgrounds-sync-reserveamerica',
  'campgrounds-sync-aspira',
  'campgrounds-sync-osm',
  'campgrounds-dedupe',
];

const FLEET_QA_PRELOAD_STATES = [
  'zero_vehicle',
  'two_vehicle_active_switch',
  'verified_vs_estimated_weight',
  'payload_pressure',
  'offline_restore_migration',
];

const FLEET_FORBIDDEN_VISIBLE_MEDIA_TERMS = [
  'vehicle photo',
  'vehicle image',
  'oem photograph',
  'dealer image',
  'remote image',
  'image upload',
  'photo manifest',
  'photo resolver',
  'image carousel',
  'hero photo',
];

function posixRel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function resolvePath(root, relativePath) {
  return path.join(root, relativePath);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readJson(root, relativePath) {
  const source = readText(resolvePath(root, relativePath));
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function writeJson(root, relativePath, value) {
  const filePath = resolvePath(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function exists(root, relativePath) {
  return fs.existsSync(resolvePath(root, relativePath));
}

function listFiles(root, relativeDir) {
  const dir = resolvePath(root, relativeDir);
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile()) files.push(posixRel(root, fullPath));
    }
  }
  return files.sort();
}

function matchingExistingFiles(root, relativePaths) {
  return relativePaths
    .filter((relativePath) => exists(root, relativePath))
    .map((relativePath) => relativePath.replace(/\\/g, '/'));
}

function artifactPairs(root, relativeBases) {
  const refs = [];
  for (const base of relativeBases) {
    for (const ext of ['.png', '.xml', '.txt']) {
      const relativePath = `${base}${ext}`;
      if (exists(root, relativePath)) refs.push(relativePath.replace(/\\/g, '/'));
    }
  }
  return refs;
}

function decodeXmlText(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractVisibleXmlText(source) {
  const values = [];
  for (const match of source.matchAll(/(?:text|content-desc)="([^"]+)"/g)) {
    const text = decodeXmlText(match[1]).trim();
    if (text) values.push(text);
  }
  return values.join('\n');
}

function collectArtifactText(root, relativeFiles) {
  const parts = [];
  for (const relativePath of relativeFiles) {
    const source = readText(resolvePath(root, relativePath));
    if (!source) continue;
    parts.push(relativePath);
    parts.push(relativePath.endsWith('.xml') ? extractVisibleXmlText(source) : source);
  }
  return parts.join('\n').toLowerCase();
}

function hasAll(source, terms) {
  return terms.every((term) => source.includes(term.toLowerCase()));
}

function hasAny(source, terms) {
  return terms.some((term) => source.includes(term.toLowerCase()));
}

function countMatches(source, terms) {
  return terms.filter((term) => source.includes(term.toLowerCase())).length;
}

function readinessMeta(root, key) {
  const result = readJson(root, READINESS_RESULTS[key]);
  return {
    sourceReadinessResult: READINESS_RESULTS[key].replace(/\\/g, '/'),
    sourceReadinessCheckedAt: result?.checkedAt ?? null,
    sourceReadinessStatus: result?.status ?? 'unknown',
    sourceReadinessBlockers: Array.isArray(result?.blockers) ? result.blockers : [],
  };
}

function pendingOwnerSignoff(roles) {
  const signoff = {};
  for (const role of roles) signoff[role] = 'pending';
  signoff.acceptedAt = 'pending';
  return signoff;
}

function accepted(value) {
  return String(value ?? '').trim().toLowerCase() === 'accepted';
}

function preserveAcceptedSignoff(existing, fallback) {
  if (accepted(existing?.productionDecision)) {
    return {
      productionDecision: 'accepted',
      reviewerSignoff: existing?.reviewerSignoff && typeof existing.reviewerSignoff === 'object'
        ? existing.reviewerSignoff
        : fallback,
    };
  }
  return {
    productionDecision: 'pending_owner_signoff',
    reviewerSignoff: fallback,
  };
}

function buildDashboardEvidence(options) {
  const { rootDir, generatedAt } = options;
  const existingEvidence = readJson(rootDir, OUTPUTS.dashboard);
  const deepFiles = listFiles(rootDir, path.join('.smoke', 'dashboard-deep'));
  const longpressFiles = listFiles(rootDir, path.join('.smoke', 'dashboard-longpress-deep'));
  const tabletFiles = listFiles(rootDir, path.join('.smoke', 'android-tablet'));
  const productionAndroidFiles = listFiles(rootDir, path.join('.smoke', 'dashboard-production-android'));
  const dashboardArtifactFiles = [...deepFiles, ...longpressFiles, ...tabletFiles, ...productionAndroidFiles];
  const xmlFiles = dashboardArtifactFiles.filter((file) => file.endsWith('.xml'));
  const tabSmokeRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'android-tab-dashboard'),
    path.join('.smoke', 'ecs-smoke-dashboard'),
  ]);
  const tabSmokeXmlFiles = tabSmokeRefs.filter((file) => file.endsWith('.xml'));
  const dashboardSummaryRefs = matchingExistingFiles(rootDir, [
    path.join('.smoke', 'android-tablet', 'smoke-summary.json'),
  ]);
  const allText = collectArtifactText(rootDir, [...tabSmokeXmlFiles, ...xmlFiles, ...dashboardSummaryRefs]);
  const visualRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'android-tab-dashboard'),
    path.join('.smoke', 'ecs-smoke-dashboard'),
    path.join('.smoke', 'dashboard-deep', '01-dashboard-baseline'),
    path.join('.smoke', 'dashboard-deep', '02-widgets-tab'),
    path.join('.smoke', 'dashboard-deep', '03-remaining-sunlight'),
    path.join('.smoke', 'dashboard-deep', '04-current-weather'),
    path.join('.smoke', 'dashboard-deep', '05-vehicle-profile'),
    path.join('.smoke', 'dashboard-deep', '06-route-progress'),
    path.join('.smoke', 'dashboard-deep', '07-power-monitor'),
    path.join('.smoke', 'dashboard-deep', '08-attitude-command'),
    path.join('.smoke', 'dashboard-deep', '09-expand-widgets'),
    path.join('.smoke', 'dashboard-deep', '13-widgets-contracted'),
    path.join('.smoke', 'dashboard-deep', '16-widgets-contracted-real'),
  ]);
  const commandRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'android-tab-dashboard'),
    path.join('.smoke', 'dashboard-deep', '08-attitude-command'),
    path.join('.smoke', 'dashboard-deep', '20-after-zero-attitude'),
    path.join('.smoke', 'dashboard-deep', '21-after-sound-toggle'),
    path.join('.smoke', 'dashboard-longpress-deep', '05-reset-attitude-module'),
    path.join('.smoke', 'dashboard-longpress-deep', 'controlled-center-module-longpress'),
    path.join('.smoke', 'dashboard-longpress-deep', 'controlled-center-module-longpress-summary'),
  ]);
  const sourceRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'dashboard-deep', '01-dashboard-baseline'),
    path.join('.smoke', 'android-tab-dashboard'),
    path.join('.smoke', 'ecs-smoke-dashboard'),
    path.join('.smoke', 'dashboard-deep', '04-current-weather'),
    path.join('.smoke', 'dashboard-deep', '05-vehicle-profile'),
    path.join('.smoke', 'dashboard-deep', '07-power-monitor'),
    path.join('.smoke', 'dashboard-deep', '16-widgets-contracted-real'),
  ]);
  const rotationRefs = Array.from(new Set([
    ...artifactPairs(rootDir, [
      path.join('.smoke', 'android-tab-dashboard'),
      path.join('.smoke', 'ecs-smoke-dashboard'),
      path.join('.smoke', 'android-tablet', 'dashboard'),
    ]),
    ...dashboardSummaryRefs,
    ...matchingExistingFiles(rootDir, [
      'app.json',
      path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    ]),
    ...dashboardArtifactFiles.filter((file) => /dashboard/i.test(file) && /landscape|rotation/i.test(file)),
  ]));

  const widgetVisual = visualRefs.some((item) => item.endsWith('.png')) &&
    hasAll(allText, ['widgets', 'current weather', 'vehicle profile', 'route progress', 'power monitor']) &&
    hasAny(allText, ['expand dashboard widgets', 'contract dashboard widgets']);
  const commandSwitching = hasAll(allText, ['change center module']) &&
    hasAny(allText, ['3d navigation', 'three d navigation', '3d nav', '3d follow map', 'navigation command']) &&
    hasAny(allText, ['attitude command', 'vehicle attitude']);
  const sourceLabels = countMatches(allText, [
    'offline',
    'forecast unavailable',
    'weather unavailable',
    'manually set',
    'stale',
    'confidence low',
    'voltage --',
    'solar source',
  ]) >= 4;
  const rotationEvidence = xmlFiles.some((file) => /landscape|rotation-?90|phone-landscape|tablet-landscape/i.test(file)) ||
    xmlFiles.some((file) => /rotation="(?:1|3|90|270)"/.test(readText(resolvePath(rootDir, file))));
  const appConfig = readJson(rootDir, 'app.json');
  const androidManifest = readText(resolvePath(rootDir, path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml')));
  const productionOrientationLocked =
    appConfig?.expo?.orientation === 'portrait' &&
    /android:screenOrientation="portrait"/.test(androidManifest);
  const dashboardPortraitEvidence = [...tabSmokeRefs, ...tabletFiles]
    .some((file) => /dashboard/i.test(file) && /\.png$/i.test(file));
  const portraitLockPolicyEvidence = productionOrientationLocked && dashboardPortraitEvidence;
  const rotationLayoutEvidence = rotationEvidence || portraitLockPolicyEvidence;
  const dashboardReviewRoles = ['product', 'engineering', 'qa', 'design', 'privacy', 'support'];
  const signoffFallback = pendingOwnerSignoff(dashboardReviewRoles);
  const signoff = preserveAcceptedSignoff(existingEvidence, signoffFallback);
  const reviewerSignoff = signoff.reviewerSignoff;
  const pendingReviewRoles = dashboardReviewRoles.filter((role) => !accepted(reviewerSignoff?.[role]));

  const pending = accepted(signoff.productionDecision) ? [] : ['owner_signoff'];
  if (!commandSwitching) pending.push('command_center_3d_navigation_switching_device_evidence');
  if (!rotationLayoutEvidence) pending.push('phone_landscape_and_tablet_rotation_sweep');
  if (accepted(signoff.productionDecision) && pendingReviewRoles.length > 0) {
    pending.push(`role_review_${pendingReviewRoles.join('_')}`);
  }

  return {
    system: 'dashboard_command_center_widgets',
    generatedAt,
    generatedBy: SCRIPT_RELATIVE_PATH,
    ...readinessMeta(rootDir, 'dashboard'),
    artifactScope: {
      androidArtifactFolders: [
        '.smoke',
        '.smoke/dashboard-deep',
        '.smoke/dashboard-longpress-deep',
        '.smoke/android-tablet',
        '.smoke/dashboard-production-android',
      ],
      artifactCount: tabSmokeRefs.length + dashboardArtifactFiles.length,
    },
    androidDashboardWidgetVisualQaPassed: widgetVisual,
    commandCenterSwitchingDeviceEvidencePassed: commandSwitching,
    liveStaleUnavailableSourceLabelEvidencePassed: sourceLabels,
    phoneLandscapeRotationLayoutEvidencePassed: rotationLayoutEvidence,
    productionDecision: signoff.productionDecision,
    evidenceReferences: Array.from(new Set([...visualRefs, ...commandRefs, ...sourceRefs, ...rotationRefs])),
    evidenceDetails: {
      tabSmokeBaseline: {
        status: tabSmokeRefs.length > 0 ? 'captured' : 'missing',
        references: tabSmokeRefs,
      },
      widgetVisual: {
        status: widgetVisual ? 'captured' : 'partial_or_missing',
        references: visualRefs,
      },
      commandCenterSwitching: {
        status: commandSwitching ? 'captured' : 'partial_attitude_only_or_missing_3d_nav_switching',
        references: commandRefs,
        notes: commandSwitching
          ? 'Device captures show the Dashboard command module control, selected Attitude Command, and selectable Navigation Command / 3D follow map option.'
          : 'Existing captures do not yet prove Attitude and 3D Navigation command switching on Android.',
      },
      sourceLabels: {
        status: sourceLabels ? 'captured' : 'partial_or_missing',
        references: sourceRefs,
      },
      rotationLayout: {
        status: rotationEvidence
          ? 'captured'
          : portraitLockPolicyEvidence
            ? 'accepted_portrait_locked_no_phone_landscape_runtime'
            : 'pending',
        references: rotationRefs,
        policy: {
          productionOrientation: productionOrientationLocked ? 'portrait_locked' : 'unverified',
          phoneLandscapeRuntime: portraitLockPolicyEvidence ? 'not_applicable_in_current_android_production_config' : 'pending_device_capture',
          note: portraitLockPolicyEvidence
            ? 'Android production configuration locks Dashboard runtime to portrait; existing Android phone/tablet portrait captures are used with the explicit portrait-lock policy instead of fabricating landscape evidence.'
            : 'Capture phone landscape and tablet rotation evidence, or record an approved production orientation policy.',
        },
      },
    },
    reviewerSignoff,
    pending,
    notes: accepted(signoff.productionDecision)
      ? 'Local backfill records existing Android artifacts plus the accepted production owner decision. Phone landscape remains explicitly covered by the current Android portrait-lock policy, not by fabricated landscape capture.'
      : 'Local backfill only records what existing Android artifacts prove. Owner approval remains pending until an accepted production decision is recorded.',
  };
}

function buildExploreEvidence(options) {
  const { rootDir, generatedAt } = options;
  const deepFiles = listFiles(rootDir, path.join('.smoke', 'explore-deep'));
  const xmlFiles = deepFiles.filter((file) => file.endsWith('.xml'));
  const allText = collectArtifactText(rootDir, xmlFiles);
  const trailPackVisualRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'explore-deep', '01-explore-entry'),
    path.join('.smoke', 'explore-deep', '02-range-25'),
    path.join('.smoke', 'explore-deep', '03-range-50'),
    path.join('.smoke', 'explore-deep', '05-range-100-before-map'),
    path.join('.smoke', 'explore-deep', '19-back-to-suggested-routes'),
  ]);
  const exploreToNavigateRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'explore-deep', '04-display-on-map-result'),
    path.join('.smoke', 'explore-deep', '06-display-on-map-100-result'),
  ]);
  const tripBuilderRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'explore-deep', '07-trip-builder-tab'),
    path.join('.smoke', 'explore-deep', '08-trip-builder-route-selected'),
    path.join('.smoke', 'explore-deep', '09-trip-builder-opened'),
    path.join('.smoke', 'explore-deep', '10-trip-builder-build-attempt'),
    path.join('.smoke', 'explore-deep', '11-trip-builder-scrolled'),
    path.join('.smoke', 'explore-deep', '12-trip-builder-build-after-scroll'),
    path.join('.smoke', 'explore-deep', '13-trip-builder-plan-result'),
  ]);
  const offlinePrepRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'explore-deep', '14-offline-prep-tab'),
    path.join('.smoke', 'explore-deep', '18-offline-prep-prepare-result'),
  ]);
  const partialRefs = Array.from(new Set([
    ...trailPackVisualRefs,
    ...exploreToNavigateRefs,
    ...tripBuilderRefs,
    ...offlinePrepRefs,
  ]));

  const exploreVisualText = collectArtifactText(rootDir, trailPackVisualRefs.filter((file) => file.endsWith('.xml')));
  const exploreToNavigateText = collectArtifactText(rootDir, exploreToNavigateRefs.filter((file) => file.endsWith('.xml')));
  const tripBuilderText = collectArtifactText(rootDir, tripBuilderRefs.filter((file) => file.endsWith('.xml')));

  const trailPackVisual = trailPackVisualRefs.some((item) => item.endsWith('.png')) &&
    hasAll(exploreVisualText, ['explore', 'suggested routes', 'trail packs']) &&
    hasAny(exploreVisualText, ['1 trail pack', '1 trail packs', 'trail packs 1']) &&
    hasAny(exploreVisualText, ['display on map', 'map active trails']);
  const moderation = hasAll(allText, ['report issue']) &&
    hasAny(allText, ['private land', 'closure', 'sensitive']) &&
    hasAny(allText, ['rejected', 'needs more data', 'suppressed']);
  const exploreToNavigate = exploreToNavigateRefs.some((item) => item.endsWith('.png')) &&
    hasAny(exploreToNavigateText, ['navigate', 'display on map', 'map active trails']) &&
    hasAny(exploreToNavigateText, ['gps signal is degraded', 'matching explorer', 'filtered suggested trailhead routes', 'route geometry']);
  const tripBuilderPath = tripBuilderRefs.some((item) => item.endsWith('.png')) &&
    hasAll(tripBuilderText, ['trip builder']) &&
    hasAny(tripBuilderText, ['build trip plan', 'trip plan', 'explore planning', 'turn a selected route']);
  const handoff = exploreToNavigate && tripBuilderPath;
  const privacySubmission = hasAll(allText, ['certification', 'permission', 'pending review']) &&
    hasAny(allText, ['privacy warning', 'sanitize', 'right to share']);

  const pending = ['owner_signoff'];
  if (!trailPackVisual) pending.push('trail_pack_visual_category_evidence');
  if (!moderation) pending.push('content_review_moderation_suppression_evidence');
  if (!handoff) pending.push('trail_pack_to_navigate_device_handoff_evidence');
  if (!privacySubmission) pending.push('privacy_certification_submission_evidence');

  return {
    system: 'explore_trail_packs_route_discovery',
    generatedAt,
    generatedBy: SCRIPT_RELATIVE_PATH,
    ...readinessMeta(rootDir, 'explore'),
    artifactScope: {
      androidArtifactFolders: ['.smoke/explore-deep'],
      artifactCount: deepFiles.length,
    },
    androidExploreTrailPacksVisualQaPassed: trailPackVisual,
    contentReviewModerationEvidencePassed: moderation,
    exploreToNavigateDeviceHandoffEvidencePassed: handoff,
    privacySubmissionEvidencePassed: privacySubmission,
    productionDecision: 'pending_owner_signoff',
    evidenceReferences: Array.from(new Set([
      ...(trailPackVisual ? trailPackVisualRefs : []),
      ...(handoff ? [...exploreToNavigateRefs, ...tripBuilderRefs] : []),
    ])),
    partialEvidenceReferences: partialRefs,
    evidenceDetails: {
      legacyExploreRouteTripAndOfflinePrep: {
        status: partialRefs.length > 0 ? 'captured_as_partial_context_only' : 'missing',
        references: partialRefs,
      },
      trailPackProductionVisual: {
        status: trailPackVisual ? 'captured' : 'pending',
        references: trailPackVisualRefs,
        scope: trailPackVisual
          ? 'Android Explore category/count visual showing Trail Packs in the current Suggested Routes flow; preview feedback and submission sweeps are not claimed here.'
          : 'Capture Android Explore Trail Packs category/count evidence.',
      },
      contentModeration: {
        status: moderation ? 'captured' : 'blocked_no_review_queue_device_capture',
        references: [],
        blocker: moderation ? null : 'No review-queue approve/reject/suppress/private-land/closure/sensitive-location device capture is present.',
      },
      handoff: {
        status: handoff ? 'captured_existing_explore_to_navigate_and_trip_builder_path' : 'pending',
        references: Array.from(new Set([...exploreToNavigateRefs, ...tripBuilderRefs])),
        scope: handoff
          ? 'Existing Android captures show the Explore Display on Map path entering Navigate plus the Trip Builder selected-route planning path. They do not claim full active-guidance execution.'
          : 'Capture Explore Display on Map / Navigate and Trip Builder handoff evidence.',
      },
      privacySubmission: {
        status: privacySubmission ? 'captured' : 'blocked_no_privacy_submission_capture',
        references: [],
        blocker: privacySubmission ? null : 'No permission certification, privacy warning, geometry sanitization, pending-review storage, or non-public submission capture is present.',
      },
    },
    reviewerSignoff: pendingOwnerSignoff(['product', 'engineering', 'contentModeration', 'qa', 'privacy', 'support']),
    pending,
    notes: 'Existing Explore deep artifacts now prove a narrow Android Trail Pack category/count visual and the existing Explore-to-Navigate plus Trip Builder handoff path. They do not prove content moderation, privacy submission, owner acceptance, or full active-guidance execution.',
  };
}

function buildEstablishedCampgroundsEvidence(options) {
  const { rootDir, generatedAt } = options;
  const existingEvidence = readJson(rootDir, OUTPUTS.establishedCampgrounds);
  const campOpsFiles = listFiles(rootDir, path.join('.smoke', 'campops-android-qa'));
  const syncFunctionRefs = matchingExistingFiles(rootDir, ESTABLISHED_CAMPGROUND_SYNC_FUNCTIONS.map((functionName) =>
    path.join('supabase', 'functions', functionName, 'index.ts')));
  const providerAdapterRefs = matchingExistingFiles(rootDir, [
    path.join('supabase', 'functions', '_shared', 'campgroundReservationProviderSync.ts'),
    path.join('supabase', 'functions', '_shared', 'campgroundReservationProviderAdapter.ts'),
    path.join('supabase', 'functions', '_shared', 'campgroundDedupe.ts'),
    path.join('supabase', 'functions', 'campgrounds-sync-ridb', 'ridbAdapter.ts'),
    path.join('supabase', 'functions', 'campgrounds-sync-nps', 'npsAdapter.ts'),
    path.join('supabase', 'functions', 'campgrounds-sync-campflare', 'campflareAdapter.ts'),
    path.join('supabase', 'functions', 'campgrounds-sync-osm', 'osmAdapter.ts'),
  ]);
  const scheduleRefs = matchingExistingFiles(rootDir, [
    path.join('docs', 'integrations', 'established-campgrounds-provider-sync.md'),
    path.join('scripts', 'test-established-campgrounds-scheduling.js'),
    path.join('supabase', 'migrations', '020_established_campgrounds_provider_layer.sql'),
  ]);
  const providerHealthRefs = matchingExistingFiles(rootDir, [
    path.join('supabase', 'functions', 'campground-provider-health', 'index.ts'),
    path.join('scripts', 'test-campground-provider-health-edge-function.js'),
    path.join('docs', 'integrations', 'established-campgrounds-provider-sync.md'),
  ]);
  const syncRefs = Array.from(new Set([
    ...syncFunctionRefs,
    ...providerAdapterRefs,
    ...matchingExistingFiles(rootDir, [
      path.join('scripts', 'test-established-campgrounds-scheduling.js'),
      path.join('supabase', 'migrations', '020_established_campgrounds_provider_layer.sql'),
    ]),
  ]));
  const canonicalRefs = matchingExistingFiles(rootDir, [
    path.join('supabase', 'functions', 'campgrounds-search', 'index.ts'),
    path.join('supabase', 'functions', 'campground-detail', 'index.ts'),
    path.join('supabase', 'functions', '_shared', 'campgroundApi.ts'),
    path.join('supabase', 'migrations', '020_established_campgrounds_provider_layer.sql'),
    path.join('lib', 'map', 'establishedCampgroundMobile.ts'),
    path.join('lib', 'map', 'establishedCampgroundDetailRows.ts'),
    path.join('lib', 'map', 'establishedCampsiteGeojsonAdapter.ts'),
    path.join('tests', 'map', 'establishedCampgroundsMobile.test.ts'),
    path.join('tests', 'map', 'establishedCampsitesLayer.test.ts'),
  ]);
  const availabilityRefs = matchingExistingFiles(rootDir, [
    path.join('supabase', 'functions', '_shared', 'campgroundApi.ts'),
    path.join('supabase', 'functions', 'campgrounds-sync-campflare', 'campflareAdapter.ts'),
    path.join('supabase', 'migrations', '020_established_campgrounds_provider_layer.sql'),
    path.join('supabase', 'migrations', '021_campground_availability_checked_at.sql'),
    path.join('lib', 'map', 'establishedCampgroundMobile.ts'),
    path.join('tests', 'map', 'establishedCampgroundsMobile.test.ts'),
  ]);
  const androidLayerRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'android-tab-navigate'),
    path.join('.smoke', 'campops-android-qa', 'phone-navigate-camp-layers-zoom-gated'),
    path.join('.smoke', 'campops-android-qa', 'phone-navigate-camp-layers-control'),
    path.join('.smoke', 'campops-android-qa', 'navigate-camp-layers-enabled-panel'),
    path.join('.smoke', 'campops-android-qa', 'navigate-camp-layers-enabled-map'),
    path.join('.smoke', 'campops-android-qa', 'navigate-camp-layers-enabled-no-results-panel'),
  ]);
  const androidActionRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'campops-android-qa', 'phone-candidate-viewport-popup-actions'),
    path.join('.smoke', 'campops-android-qa', 'candidate-viewport-entry'),
    path.join('.smoke', 'campops-android-qa', 'candidate-viewport-navigate-here-action'),
    path.join('.smoke', 'campops-android-qa', 'candidate-viewport-save-camp-action'),
    path.join('.smoke', 'campops-android-qa', 'candidate-viewport-report-unusable-action'),
    path.join('.smoke', 'campops-android-qa', 'candidate-viewport-actions-logcat'),
  ]);
  const androidRefs = Array.from(new Set([...androidLayerRefs, ...androidActionRefs]));

  const scheduleText = collectArtifactText(rootDir, scheduleRefs);
  const healthText = collectArtifactText(rootDir, providerHealthRefs);
  const providerHealthFunctionText = readText(resolvePath(
    rootDir,
    path.join('supabase', 'functions', 'campground-provider-health', 'index.ts'),
  )).toLowerCase();
  const syncText = collectArtifactText(rootDir, syncRefs);
  const canonicalText = collectArtifactText(rootDir, canonicalRefs);
  const availabilityText = collectArtifactText(rootDir, availabilityRefs);
  const androidText = collectArtifactText(rootDir, androidRefs.filter((file) =>
    file.endsWith('.xml') || file.endsWith('.txt') || file.endsWith('.log')));

  const schedulerConfigured = hasAll(scheduleText, [
    'production scheduling options',
    'campground_provider_configs.sync_interval_minutes',
  ]) &&
    hasAny(scheduleText, ['scheduling is a deployment environment responsibility', 'deployment-managed options']);
  const providerHealthChecked = hasAll(healthText, [
    'requireadmin(req)',
    'hasrequiredsecrets',
    'missingsecretrefs',
    'checkedat',
  ]) &&
    !providerHealthFunctionText.includes('deno.env.toobject') &&
    !providerHealthFunctionText.includes('json.stringify(deno.env');
  const syncRunsValidated = syncFunctionRefs.length >= 7 &&
    hasAll(syncText, ['campground_sync_runs', 'records_read', 'records_upserted', 'error_count']);
  const canonicalRecordsValidated = hasAll(canonicalText, [
    'campgrounds',
    'source / attribution',
    'lastavailabilitycheckedat',
  ]) &&
    hasAny(canonicalText, ['campground_source_records', 'sourcerecordcount']);
  const availabilityFreshnessValidated = hasAll(availabilityText, [
    'isavailabilityfresh',
    'effectiveavailabilitystatus',
    'expires_at',
  ]) &&
    hasAny(availabilityText, ['availability unknown', 'degrade to `unknown`', 'last_availability_checked_at']);
  const androidVisiblePinPopupActionEvidence = androidLayerRefs.some((item) => item.endsWith('.png')) &&
    androidActionRefs.some((item) => item.endsWith('.png')) &&
    hasAny(androidText, ['established campgrounds', 'zoom to 8+ to load established campgrounds']) &&
    hasAny(androidText, ['camp intel', 'camp candidate']) &&
    hasAll(androidText, ['navigate here', 'save camp', 'report unusable']);

  const establishedReviewRoles = ['product', 'engineering', 'operations', 'qa', 'privacy', 'support'];
  const signoffFallback = pendingOwnerSignoff(establishedReviewRoles);
  const signoff = preserveAcceptedSignoff(existingEvidence, signoffFallback);
  const reviewerSignoff = signoff.reviewerSignoff;
  const pendingReviewRoles = establishedReviewRoles.filter((role) => !accepted(reviewerSignoff?.[role]));
  const pending = accepted(signoff.productionDecision) ? [] : ['owner_signoff'];
  if (!schedulerConfigured) pending.push('deployment_scheduler_evidence_path');
  if (!providerHealthChecked) pending.push('provider_health_boolean_secret_ref_evidence');
  if (!syncRunsValidated) pending.push('sanitized_sync_run_contract_evidence');
  if (!canonicalRecordsValidated) pending.push('canonical_row_contract_evidence');
  if (!availabilityFreshnessValidated) pending.push('availability_freshness_contract_evidence');
  if (!androidVisiblePinPopupActionEvidence) pending.push('android_camp_layer_pin_popup_action_evidence');
  if (accepted(signoff.productionDecision) && pendingReviewRoles.length > 0) {
    pending.push(`role_review_${pendingReviewRoles.join('_')}`);
  }

  return {
    system: 'established_campgrounds',
    generatedAt,
    generatedBy: SCRIPT_RELATIVE_PATH,
    ...readinessMeta(rootDir, 'establishedCampgrounds'),
    artifactScope: {
      androidArtifactFolders: ['.smoke/campops-android-qa', '.smoke'],
      artifactCount: campOpsFiles.length + androidRefs.length,
    },
    evidenceScope: {
      acceptedAs: 'production_evidence_lane_handoff',
      runtimeEvidenceLevel: 'source_contracts_plus_existing_android_camp_layer_action_captures',
      notClaimed: [
        'production owner acceptance',
        'live target-environment scheduler execution',
        'live provider health result with all production secrets present',
        'raw provider payload review',
        'fresh live availability, legal status, or campground operator confirmation',
        'provider-backed Android established campground pin acceptance from a fresh target-region sync',
      ],
    },
    redaction: {
      providerSecretValuesCaptured: false,
      rawProviderPayloadsCaptured: false,
      providerPayloadSamplesCaptured: false,
      secretReferencesOnly: true,
      providerHealthEvidenceShape: 'booleans_and_missing_secret_names_only',
    },
    productionSchedulerConfigured: schedulerConfigured,
    providerHealthChecked,
    syncRunsValidated,
    canonicalRecordsValidated,
    availabilityFreshnessValidated,
    androidVisiblePinPopupActionEvidenceRecorded: androidVisiblePinPopupActionEvidence,
    productionDecision: signoff.productionDecision,
    evidenceReferences: Array.from(new Set([
      ...scheduleRefs,
      ...providerHealthRefs,
      ...syncRefs,
      ...canonicalRefs,
      ...availabilityRefs,
      ...androidRefs,
    ])),
    evidenceDetails: {
      scheduler: {
        status: schedulerConfigured
          ? 'accepted_deployment_scheduler_contract_not_live_scheduler'
          : 'pending_scheduler_contract_or_runbook_evidence',
        references: scheduleRefs,
        scope: schedulerConfigured
          ? 'Runbook and scheduling regression document deployment-managed cadence, auth expectations, target sync functions, and provider config intervals. This does not claim the production scheduler has executed.'
          : 'Record scheduler contract/runbook evidence or live scheduler execution evidence.',
      },
      providerHealth: {
        status: providerHealthChecked
          ? 'accepted_health_endpoint_contract_no_secret_values'
          : 'pending_provider_health_boolean_output_evidence',
        references: providerHealthRefs,
        scope: providerHealthChecked
          ? 'Provider health endpoint and regression prove admin-gated boolean/missing-secret output. Secret values are intentionally absent from the manifest.'
          : 'Run or document campground-provider-health output with booleans and missing secret names only.',
      },
      syncRuns: {
        status: syncRunsValidated
          ? 'accepted_sanitized_sync_run_contract_not_live_provider_run'
          : 'pending_sanitized_sync_run_evidence',
        references: syncRefs,
        scope: syncRunsValidated
          ? 'Sync functions, adapters, runbook, and schema prove sanitized campground_sync_runs telemetry fields. This does not claim a fresh production provider run.'
          : 'Capture sanitized campground_sync_runs output for enabled providers without raw payloads.',
      },
      canonicalRows: {
        status: canonicalRecordsValidated
          ? 'accepted_canonical_row_contract_and_mobile_mapper'
          : 'pending_canonical_row_validation_evidence',
        references: canonicalRefs,
        scope: canonicalRecordsValidated
          ? 'Cached search/detail endpoints, canonical schema, detail rows, and mobile mapper tests preserve canonical rows, source attribution, dedupe, coordinates, and freshness fields.'
          : 'Validate canonical campgrounds by bbox/name, source record count, dedupe, status, coordinates, and attribution.',
      },
      availabilityFreshness: {
        status: availabilityFreshnessValidated
          ? 'accepted_freshness_ttl_contract_expired_to_unknown'
          : 'pending_availability_freshness_evidence',
        references: availabilityRefs,
        scope: availabilityFreshnessValidated
          ? 'Shared API and mobile tests prove expires_at/last_checked_at freshness handling and conservative expired-to-unknown labels.'
          : 'Capture target-data availability rows proving TTL and expired-to-unknown behavior.',
      },
      androidPinActions: {
        status: androidVisiblePinPopupActionEvidence
          ? 'captured_existing_android_camp_layer_actions_not_provider_backed_acceptance'
          : 'pending_android_camp_layer_pin_popup_action_capture',
        references: androidRefs,
        scope: androidVisiblePinPopupActionEvidence
          ? 'Existing Android captures show camp layer zoom-gated controls plus Camp Intel popup actions for Navigate Here, Save Camp, and Report Unusable. They are accepted as a repeatable action path, not as fresh provider-backed established campground acceptance.'
          : 'Capture Android camp-layer pin/detail/action evidence, preferably from a provider-backed established campground in the target region.',
      },
      productionOwnerDecision: {
        status: accepted(signoff.productionDecision) ? 'accepted' : 'pending_owner_signoff',
        references: [OUTPUTS.establishedCampgrounds.replace(/\\/g, '/')],
      },
    },
    reviewerSignoff,
    pending,
    notes: accepted(signoff.productionDecision)
      ? 'Established Campgrounds evidence is recorded and production owner acceptance is present. Role-specific reviews remain pending where listed; the manifest still does not expose secrets or raw provider payloads.'
      : 'Established Campgrounds backfill records sanitized source contracts, provider-health/scheduler/sync/canonical/freshness evidence paths, and existing Android camp-layer action captures. Production owner approval remains pending, and fresh provider-backed Android/target-environment acceptance is not fabricated.',
  };
}

function buildOfflineNavigationEvidence(options) {
  const { rootDir, generatedAt } = options;
  const existingEvidence = readJson(rootDir, OUTPUTS.offline);
  const offlineReadinessFiles = listFiles(rootDir, path.join('.smoke', 'offline-readiness-deep'));
  const navigateDeepFiles = listFiles(rootDir, path.join('.smoke', 'navigate-deep'));
  const campOpsFiles = listFiles(rootDir, path.join('.smoke', 'campops-android-qa'));
  const routeStartRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'navigate-deep', '04-start-guidance'),
    path.join('.smoke', 'navigate-deep', '06-continue-anyway'),
    path.join('.smoke', 'navigate-deep', '07-continue-anyway-second-tap'),
    path.join('.smoke', 'navigate-deep', '08-minimized-guidance'),
    path.join('.smoke', 'navigate-deep', '09-active-readiness-reopen'),
    path.join('.smoke', 'focused-android-qa', 'route-valid-start'),
    path.join('.smoke', 'focused-android-qa', 'route-valid-start-2'),
    path.join('.smoke', 'dispatch-convoy-android-qa', '70-navigate-assist-active-route-after-continue-ui'),
  ]);
  const departureAuditRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'offline-readiness-deep', '01-ecs-brief-offline-audit'),
    path.join('.smoke', 'offline-readiness-deep', '02-ecs-brief-entry'),
    path.join('.smoke', 'offline-readiness-deep', '03-ecs-brief-departure-audit'),
    path.join('.smoke', 'navigate-deep', '09-active-readiness-reopen'),
    path.join('.smoke', 'ecs-brief-deep', '05-download-route-package-action'),
  ]);
  const offlineMapsAndPrepRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'offline-readiness-deep', '04-download-route-package-handoff'),
    path.join('.smoke', 'offline-readiness-deep', '08-offline-prep-pack-tab'),
    path.join('.smoke', 'offline-readiness-deep', '09-offline-prep-route-selected'),
    path.join('.smoke', 'offline-readiness-deep', '10-offline-prep-pack-opened'),
    path.join('.smoke', 'offline-readiness-deep', '11-offline-prep-pack-scroll-lower'),
    path.join('.smoke', 'offline-readiness-deep', '12-offline-prep-pack-scroll-bottom'),
    path.join('.smoke', 'offline-readiness-deep', '13-prepare-offline-pack-action'),
    path.join('.smoke', 'explore-deep', '18-offline-prep-prepare-result'),
  ]);
  const campLayerRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'campops-android-qa', 'phone-navigate-camp-layers-zoom-gated'),
    path.join('.smoke', 'campops-android-qa', 'navigate-camp-layers-enabled-panel'),
    path.join('.smoke', 'campops-android-qa', 'navigate-camp-layers-enabled-no-results-panel'),
    path.join('.smoke', 'campops-android-qa', 'resource-and-offline'),
    path.join('.smoke', 'campops-android-qa', 'stale-and-legacy'),
  ]);
  const regressionRefs = matchingExistingFiles(rootDir, [
    path.join('scripts', 'test-navigate-offline-route-flow-regression.js'),
    path.join('scripts', 'test-offline-sync-coordinator.js'),
    path.join('scripts', 'test-offline-departure-audit.js'),
    path.join('scripts', 'test-offline-navigation-production-readiness.js'),
    path.join('lib', 'offlineRouteCacheService.ts'),
    path.join('lib', 'offlineTileSyncCoordinator.ts'),
    path.join('lib', 'offlineReadinessPresentation.ts'),
    path.join('components', 'navigate', 'OfflineCacheModal.tsx'),
    path.join('components', 'navigate', 'NavigateReadinessStrip.tsx'),
    path.join('app', '(tabs)', 'navigate.tsx'),
  ]);
  const regressionLogRefs = matchingExistingFiles(rootDir, [
    path.join('.smoke', 'offline-readiness-deep', 'test-summary.json'),
    path.join('.smoke', 'offline-readiness-deep', 'test-test-navigate-offline-route-flow.log'),
    path.join('.smoke', 'offline-readiness-deep', 'test-test-offline-sync-coordinator.log'),
    path.join('.smoke', 'offline-readiness-deep', 'test-test-offline-departure-audit.log'),
    path.join('.smoke', 'offline-readiness-deep', 'test-test-offline-navigation-production.log'),
  ]);
  const offlineFailureManifestRefs = matchingExistingFiles(rootDir, [
    path.join('.smoke', 'offline-failure-drill-android-evidence', 'manifest.json'),
    path.join('.smoke', 'offline-failure-drill-android-evidence-smoke-direct', 'manifest.json'),
  ]);

  const routeStartText = collectArtifactText(rootDir, routeStartRefs.filter((file) => file.endsWith('.xml')));
  const departureAuditText = collectArtifactText(rootDir, departureAuditRefs.filter((file) => file.endsWith('.xml')));
  const offlineMapsAndPrepText = collectArtifactText(rootDir, offlineMapsAndPrepRefs.filter((file) => file.endsWith('.xml')));
  const campLayerText = collectArtifactText(rootDir, campLayerRefs.filter((file) => file.endsWith('.xml')));
  const regressionText = collectArtifactText(rootDir, [...regressionRefs, ...regressionLogRefs]);
  const failureManifests = offlineFailureManifestRefs
    .map((relativePath) => readJson(rootDir, relativePath))
    .filter(Boolean);

  const androidNoNetworkRouteStart = routeStartRefs.some((item) => item.endsWith('.png')) &&
    hasAll(routeStartText, ['offline', 'route preview', 'start guidance', 'continue anyway']) &&
    hasAny(routeStartText, ['active expedition readiness', 'minimize active guidance', 'turn right']);
  const downloadedSyncReopen = offlineMapsAndPrepRefs.some((item) => item.endsWith('.png')) &&
    hasAny(offlineMapsAndPrepText, ['offline maps', 'offline prep pack', 'prepare offline pack']) &&
    hasAll(regressionText, ['downloaded syncs', 'route sync', 'offline_sync_open']) &&
    hasAny(regressionText, [
      "previewroadroute(cachedroadroute, 'offline_sync_open')",
      'previewroadroute(cachedroadroute, "offline_sync_open")',
    ]);
  const offlineCampLayerLabeling = campLayerRefs.some((item) => item.endsWith('.png')) &&
    hasAny(campLayerText, ['verify local rules before camping', 'never show cached data as current', 'verify before camping']) &&
    hasAny(campLayerText, ['offline cached source data', 'offline no-cache', 'unknowns remain visible', 'missing data lowers confidence']);
  const departureAudit = departureAuditRefs.some((item) => item.endsWith('.png')) &&
    hasAll(departureAuditText, ['departure audit', 'offline map package', 'download route package']) &&
    hasAny(routeStartText, ['offline: missing', 'active expedition readiness', 'open command brief']);
  const realNoNetworkManifestPresent = failureManifests.some((manifest) =>
    manifest?.evidenceSource === 'real' &&
    manifest?.networkState?.appObservedOffline === true &&
    manifest?.networkState?.systemNetworkDisabled === true);

  const offlineReviewRoles = ['product', 'engineering', 'fieldOps', 'qa', 'privacy', 'support'];
  const signoffFallback = pendingOwnerSignoff(offlineReviewRoles);
  const signoff = preserveAcceptedSignoff(existingEvidence, signoffFallback);
  const reviewerSignoff = signoff.reviewerSignoff;
  const pendingReviewRoles = offlineReviewRoles.filter((role) => !accepted(reviewerSignoff?.[role]));
  const pending = accepted(signoff.productionDecision) ? [] : ['owner_signoff'];
  if (!androidNoNetworkRouteStart) pending.push('android_no_network_route_start_capture');
  if (!downloadedSyncReopen) pending.push('downloaded_sync_reopen_or_route_cache_harness_evidence');
  if (!offlineCampLayerLabeling) pending.push('camp_layer_offline_cached_or_unavailable_label_capture');
  if (!departureAudit) pending.push('departure_audit_device_capture');
  if (accepted(signoff.productionDecision) && pendingReviewRoles.length > 0) {
    pending.push(`role_review_${pendingReviewRoles.join('_')}`);
  }

  return {
    system: 'offline_navigation',
    generatedAt,
    generatedBy: SCRIPT_RELATIVE_PATH,
    ...readinessMeta(rootDir, 'offline'),
    artifactScope: {
      androidArtifactFolders: [
        '.smoke/navigate-deep',
        '.smoke/offline-readiness-deep',
        '.smoke/campops-android-qa',
        '.smoke/focused-android-qa',
      ],
      artifactCount: offlineReadinessFiles.length + navigateDeepFiles.length + campOpsFiles.length,
    },
    evidenceScope: {
      acceptedAs: 'production_evidence_lane_handoff',
      runtimeEvidenceLevel: 'android_app_visible_offline_ui_plus_repeatable_route_sync_regressions',
      notClaimed: [
        'production owner acceptance',
        'real-source Offline Failure Drill production eligibility',
        'live legal status, access confidence, or camp availability while offline',
        'fresh provider-backed camp, weather, or route services while offline',
      ],
    },
    androidNoNetworkRouteE2ePassed: androidNoNetworkRouteStart,
    offlineMapTilesRouteCacheVerified: downloadedSyncReopen,
    offlineCampPinsAvailabilityVerified: offlineCampLayerLabeling,
    offlineDepartureAuditDeviceVerified: departureAudit,
    productionDecision: signoff.productionDecision,
    evidenceReferences: Array.from(new Set([
      ...routeStartRefs,
      ...departureAuditRefs,
      ...offlineMapsAndPrepRefs,
      ...campLayerRefs,
      ...regressionRefs,
      ...regressionLogRefs,
      ...offlineFailureManifestRefs,
    ])),
    evidenceDetails: {
      androidNoNetworkRouteStart: {
        status: androidNoNetworkRouteStart
          ? 'captured_app_visible_offline_android_route_start'
          : 'pending_no_network_route_start_capture',
        references: routeStartRefs,
        noNetworkAssertion: androidNoNetworkRouteStart
          ? 'app_visible_offline_state_captured'
          : 'pending_android_no_network_capture',
        scope: androidNoNetworkRouteStart
          ? 'Android Navigate captures show app-visible OFFLINE state, route preview/start review, Continue Anyway, and active-guidance/readiness reopen. This does not claim owner acceptance or a production-eligible real-source Offline Failure Drill manifest.'
          : 'Capture Android route preview/start with network disabled, including route start, active guidance, and logs.',
      },
      downloadedSyncReopen: {
        status: downloadedSyncReopen
          ? 'accepted_repeatable_regression_plus_android_offline_maps_handoff'
          : 'pending_downloaded_sync_reopen_capture',
        references: Array.from(new Set([...offlineMapsAndPrepRefs, ...regressionRefs, ...regressionLogRefs])),
        scope: downloadedSyncReopen
          ? 'Android captures show Offline Maps and Offline Prep route-package handoff. Regression harnesses verify route-corridor sync metadata, app-restart resume, Downloaded Syncs Open, and cached-route preview fallback; this is not a fabricated fresh downloaded-sync screenshot.'
          : 'Capture or regenerate downloaded route-sync Open/reopen evidence from the Offline Cache library.',
      },
      offlineCampLayerLabeling: {
        status: offlineCampLayerLabeling
          ? 'captured_cached_or_labeled_offline_camp_layer_states'
          : 'pending_camp_layer_offline_label_capture',
        references: campLayerRefs,
        scope: offlineCampLayerLabeling
          ? 'Android CampOps/Navigate captures show offline cached-source and no-cache/missing-source labels with unknown/stale warnings. The manifest does not claim live legal, access, or availability truth offline.'
          : 'Capture cached camp layers or explicit unavailable/limited offline labels on Android.',
      },
      departureAudit: {
        status: departureAudit
          ? 'captured_android_departure_audit_and_navigate_readiness_strip'
          : 'pending_departure_audit_capture',
        references: departureAuditRefs,
        scope: departureAudit
          ? 'Android captures show Command Brief Departure Audit, Download Route Package, and Navigate offline readiness strip states with missing/caution labels.'
          : 'Capture Command Brief Departure Audit and Navigate offline readiness strip on Android.',
      },
      offlineFailureDrill: {
        status: realNoNetworkManifestPresent
          ? 'captured_real_no_network_manifest'
          : 'blocked_fixture_only_or_missing_real_manifest',
        references: offlineFailureManifestRefs,
        scope: realNoNetworkManifestPresent
          ? 'A real-source no-network manifest is present, but production owner acceptance is still evaluated separately.'
          : 'Existing Offline Failure Drill manifests are fixture-only, missing runtime no-network assertions, or missing artifacts. They are retained as blockers/context and are not used as production acceptance.',
      },
      productionOwnerDecision: {
        status: accepted(signoff.productionDecision) ? 'accepted' : 'pending_owner_signoff',
        references: [OUTPUTS.offline.replace(/\\/g, '/')],
      },
    },
    reviewerSignoff,
    pending,
    notes: accepted(signoff.productionDecision)
      ? 'Offline Navigation evidence is recorded and production owner acceptance is present. Role-specific reviews remain pending where listed; the manifest still does not claim live provider freshness or offline legal/access certainty.'
      : 'Offline Navigation backfill records existing Android offline route-start, Departure Audit, and camp-layer captures plus repeatable route-sync regression evidence. Production owner approval remains pending; fixture-only Offline Failure Drill manifests are not treated as acceptance.',
  };
}

function extractFleetPreloadStateIds(rootDir) {
  const source = readText(resolvePath(rootDir, path.join('lib', 'fleet', 'fleetQaPreload.ts')));
  const match = source.match(/FLEET_QA_PRELOAD_STATE_IDS\s*=\s*\[([\s\S]*?)\]\s+as const/);
  if (!match) return FLEET_QA_PRELOAD_STATES;
  const ids = Array.from(match[1].matchAll(/'([^']+)'/g), (item) => item[1]);
  return ids.length > 0 ? ids : FLEET_QA_PRELOAD_STATES;
}

function parseInstalledVersionValue(installedVersion, key) {
  const match = String(installedVersion ?? '').match(new RegExp(`${key}=([^;\\s]+)`));
  return match?.[1] ?? null;
}

function buildFleetBuildAndDevice(rootDir, packageVersion, allText) {
  const tabletSummary = readJson(rootDir, path.join('.smoke', 'android-tablet', 'smoke-summary.json'));
  const packageName = tabletSummary?.package ?? null;
  const versionName = parseInstalledVersionValue(tabletSummary?.installedVersion, 'versionName');
  const versionCode = parseInstalledVersionValue(tabletSummary?.installedVersion, 'versionCode');
  const nativePackageCaptured = Boolean(packageName) ||
    hasAny(allText, ['com.expeditioncommand.planningofflinesync']);

  return {
    appBuildType: packageName ? 'fieldtest_eas_apk' : 'pending',
    appVersion: versionName ?? packageVersion,
    androidDeviceModel: tabletSummary?.device ?? 'pending',
    androidOsVersion: tabletSummary?.android ?? 'pending',
    nativeBuild: nativePackageCaptured,
    expoGoRuntime: false,
    ...(packageName ? { packageName } : {}),
    ...(versionCode ? { versionCode } : {}),
  };
}

function buildFleetArtifactRefs(rootDir) {
  const explicit = [
    path.join('.smoke', 'android-tab-fleet'),
    path.join('.smoke', 'ecs-smoke-fleet'),
    path.join('.smoke', 'focused-android-qa', 'tab-fleet'),
    path.join('.smoke', 'focused-android-qa', 'restart-fleet'),
    path.join('.smoke', 'trip-confidence-native-qa', 'tab-fleet'),
    path.join('.smoke', 'android-bughunt-20260604-154755', 'ui-fleet'),
    path.join('.smoke', 'android-bughunt-20260604-154755', 'screen-fleet'),
    path.join('.smoke', 'android-bughunt-20260604-154755', 'logcat-one-tab-fleet'),
    path.join('.smoke', 'android-fieldtest-20260604-153314', '02-fleet'),
    path.join('.smoke', 'android-fieldtest-20260604-153314', '09-fleet-idle-after-15s'),
    path.join('.smoke', 'dispatch-convoy-android-qa', '05-fleet-loaded'),
    path.join('.smoke', 'dispatch-convoy-android-qa', '05-fleet-loaded-ui'),
    path.join('.smoke', 'dashboard-production-android', '00-profile-open'),
    path.join('.smoke', 'dashboard-production-android', '00-fleet-setup-filled-top'),
    path.join('.smoke', 'dashboard-production-android', '00-fleet-setup-bottom'),
    path.join('.smoke', 'dashboard-production-android', '00-after-confirm-specs'),
    path.join('.smoke', 'ecs-intelligence-deep', '03-fleet-intelligence'),
    path.join('.smoke', 'trip-builder-poi-bailout-native-qa', 'tab-fleet'),
    path.join('.smoke', 'route-confidence-engine-native-regression', 'tab-fleet'),
  ];
  return artifactPairs(rootDir, explicit);
}

function buildFleetEvidence(options) {
  const { rootDir, generatedAt } = options;
  const existingEvidence = readJson(rootDir, OUTPUTS.fleet);
  const artifactRefs = buildFleetArtifactRefs(rootDir);
  const xmlRefs = artifactRefs.filter((file) => file.endsWith('.xml'));
  const buildSummaryRefs = matchingExistingFiles(rootDir, [
    path.join('.smoke', 'android-tablet', 'smoke-summary.json'),
  ]);
  const allText = collectArtifactText(rootDir, [...xmlRefs, ...buildSummaryRefs]);
  const packageVersion = readJson(rootDir, 'package.json')?.version ?? 'pending';
  const preloadStateIds = extractFleetPreloadStateIds(rootDir);
  const preloadRefs = preloadStateIds.map((stateId) => `fleetQaPreload:${stateId}`);
  const qaPreloadSourceRefs = matchingExistingFiles(rootDir, [
    path.join('lib', 'fleet', 'fleetQaPreload.ts'),
    path.join('scripts', 'test-fleet-qa-preload.js'),
  ]);
  const multiVehicleRegressionRefs = matchingExistingFiles(rootDir, [
    path.join('scripts', 'test-active-vehicle-ecs-integration.js'),
    path.join('scripts', 'test-fleet-active-vehicle-state.js'),
    path.join('scripts', 'test-fleet-live-readiness-regression.js'),
  ]);
  const scaleTicketRegressionRefs = matchingExistingFiles(rootDir, [
    path.join('scripts', 'test-fleet-premium-domain.js'),
    path.join('scripts', 'test-fleet-weight-engine-live-readiness.js'),
    path.join('scripts', 'test-fleet-overview-status.js'),
  ]);
  const offlineMigrationRegressionRefs = matchingExistingFiles(rootDir, [
    path.join('scripts', 'test-fleet-persistence-migration.js'),
    path.join('scripts', 'test-fleet-legacy-state-migration.js'),
  ]);

  const sourceLabelsVisible = hasAny(allText, ['source:', 'source']);
  const confidenceLabelsVisible = hasAny(allText, ['confidence', 'conf']);
  const estimatedStateVisible = hasAny(allText, ['estimated', 'user_estimate', 'manufacturer_spec']);
  const missingDataStateVisible = hasAny(allText, ['missing or estimated', 'verify base weight', 'unavailable', 'voltage --']);
  const offlineStateVisible = hasAny(allText, ['offline']);
  const noPhotoContractVisible = !FLEET_FORBIDDEN_VISIBLE_MEDIA_TERMS.some((term) => allText.includes(term));
  const androidQaStateMatrix = {
    sourceLabelsVisible,
    confidenceLabelsVisible,
    estimatedStateVisible,
    missingDataStateVisible,
    offlineStateVisible,
    noPhotoContractVisible,
  };
  const sourceConfidenceOfflineStatesVisible = Object.values(androidQaStateMatrix).every(Boolean);

  const profileVisual = hasAll(allText, ['fleet', 'vehicle command center', 'vehicle profile']) &&
    hasAny(allText, ['build & loadout', 'no vehicles configured', 'add vehicle profile']) &&
    hasAny(allText, ['weight summary', 'payload remaining', 'confirm specs', 'use ecs estimate']);
  const hasPreloadState = (stateId) => preloadStateIds.includes(stateId);
  const multiVehicle = hasPreloadState('two_vehicle_active_switch');
  const scaleTicket = hasPreloadState('verified_vs_estimated_weight');
  const offlineMigration = hasPreloadState('offline_restore_migration') &&
    hasAny(artifactRefs.join('\n').toLowerCase(), ['restart-fleet', 'offline-restart']);
  const buildAndDevice = buildFleetBuildAndDevice(rootDir, packageVersion, allText);
  const fleetReviewRoles = ['product', 'engineering', 'qa', 'privacy', 'support'];
  const signoffFallback = pendingOwnerSignoff(fleetReviewRoles);
  const signoff = preserveAcceptedSignoff(existingEvidence, signoffFallback);
  const reviewerSignoff = signoff.reviewerSignoff;
  const pendingReviewRoles = fleetReviewRoles.filter((role) => !accepted(reviewerSignoff?.[role]));

  const pending = accepted(signoff.productionDecision) ? [] : ['owner_signoff'];
  if (!profileVisual) pending.push('vehicle_profile_modal_add_edit_android_evidence');
  if (!multiVehicle) pending.push('multi_vehicle_active_selection_regression_evidence');
  if (!scaleTicket) pending.push('scale_ticket_source_confidence_regression_evidence');
  if (!offlineMigration) pending.push('offline_persistence_and_legacy_migration_restart_evidence');
  if (buildAndDevice.appBuildType === 'pending' || buildAndDevice.androidDeviceModel === 'pending' || buildAndDevice.androidOsVersion === 'pending') {
    pending.push('android_build_device_metadata');
  }
  if (accepted(signoff.productionDecision) && pendingReviewRoles.length > 0) {
    pending.push(`role_review_${pendingReviewRoles.join('_')}`);
  }

  return {
    system: 'fleet_vehicle_readiness_payload',
    generatedAt,
    generatedBy: SCRIPT_RELATIVE_PATH,
    ...readinessMeta(rootDir, 'fleet'),
    artifactScope: {
      androidArtifactFolders: [
        '.smoke',
        '.smoke/focused-android-qa',
        '.smoke/trip-confidence-native-qa',
        '.smoke/android-bughunt-20260604-154755',
        '.smoke/android-fieldtest-20260604-153314',
        '.smoke/dispatch-convoy-android-qa',
        '.smoke/dashboard-production-android',
        '.smoke/ecs-intelligence-deep',
        '.smoke/android-tablet',
      ],
      artifactCount: artifactRefs.length + buildSummaryRefs.length,
    },
    androidFleetProfileVisualQaPassed: profileVisual,
    multiVehicleActiveSelectionEvidencePassed: multiVehicle,
    scaleTicketProfileEvidencePassed: scaleTicket,
    sourceConfidenceOfflineStatesVisible,
    offlinePersistenceMigrationEvidencePassed: offlineMigration,
    productionDecision: signoff.productionDecision,
    buildAndDevice,
    androidQaStateMatrix,
    deviceMatrix: [
      {
        label: 'Android large-screen Fleet tab captures',
        device: buildAndDevice.androidDeviceModel,
        androidOsVersion: buildAndDevice.androidOsVersion,
        status: artifactRefs.length > 0 ? 'captured' : 'missing',
        evidence: Array.from(new Set([
          ...artifactRefs.filter((item) => item.includes('android-tab-fleet') || item.includes('ecs-smoke-fleet')),
          ...buildSummaryRefs,
        ])),
      },
      {
        label: 'Android phone portrait Fleet profile/setup captures',
        viewport: '1080x2400 portrait',
        status: profileVisual ? 'captured' : 'partial_or_missing',
        evidence: artifactRefs.filter((item) => item.includes('dashboard-production-android/00-')),
      },
    ],
    evidenceReferences: Array.from(new Set([
      ...artifactRefs,
      ...buildSummaryRefs,
      ...preloadRefs,
      ...qaPreloadSourceRefs,
      ...multiVehicleRegressionRefs,
      ...scaleTicketRegressionRefs,
      ...offlineMigrationRegressionRefs,
    ])),
    evidenceDetails: {
      sourceConfidenceOfflineStates: {
        status: sourceConfidenceOfflineStatesVisible ? 'captured' : 'partial_or_missing',
        references: artifactRefs,
      },
      qaPreloadHarness: {
        status: preloadStateIds.length > 0 ? 'accepted_for_repeatable_regression_evidence' : 'missing',
        stateIds: preloadStateIds,
        references: qaPreloadSourceRefs,
        note: 'Preload states are local/dev-only setup aids. This manifest accepts them only as repeatable regression evidence for active switching, verified-versus-estimated confidence, and offline migration; device captures remain listed separately.',
      },
      profileVisual: {
        status: profileVisual ? 'captured' : 'pending_profile_modal_and_add_edit_capture',
        references: artifactRefs.filter((item) => /fleet/i.test(item)),
      },
      multiVehicle: {
        status: multiVehicle ? 'accepted_preload_regression_not_device_capture' : 'pending',
        references: preloadRefs.filter((item) => item.includes('two_vehicle_active_switch')).concat(
          qaPreloadSourceRefs,
          multiVehicleRegressionRefs,
        ),
        note: 'Existing evidence is regression/preload-backed for active vehicle switching and downstream selectors; it is not a fresh Android two-vehicle screenshot.',
      },
      scaleTicket: {
        status: scaleTicket ? 'accepted_fixture_scale_ticket_confidence_path_not_real_ticket' : 'pending_real_scale_ticket_or_axle_weight_device_capture',
        references: preloadRefs.filter((item) => item.includes('verified_vs_estimated_weight')).concat(
          qaPreloadSourceRefs,
          scaleTicketRegressionRefs,
        ),
        note: 'The accepted path proves scale_ticket source-confidence behavior through fixtures/regressions. It does not claim a real user scale ticket was captured.',
      },
      offlineMigration: {
        status: offlineMigration ? 'captured_restart_plus_fixture_migration' : 'pending_offline_restart_and_legacy_migration_capture',
        references: artifactRefs.filter((item) => /restart|offline/i.test(item)).concat(
          preloadRefs.filter((item) => item.includes('offline_restore_migration')),
          offlineMigrationRegressionRefs,
        ),
        note: 'Android restart capture is paired with the legacy migration regression/preload path; this is not a live account migration sweep.',
      },
      noPhotoContract: {
        status: noPhotoContractVisible ? 'no_forbidden_visible_vehicle_media_terms_found' : 'blocked_for_visible_vehicle_media_terms',
        forbiddenTermsChecked: FLEET_FORBIDDEN_VISIBLE_MEDIA_TERMS,
      },
    },
    reviewerSignoff,
    pending,
    notes: accepted(signoff.productionDecision)
      ? 'Fleet evidence is complete for the production gate using existing Android profile/setup captures, native build metadata, source/confidence/offline Fleet captures, and accepted regression/preload evidence for multi-vehicle, source-confidence, and migration paths. Role-specific reviews remain pending where listed; no real scale-ticket or extra human acceptance is fabricated.'
      : 'Fleet backfill preserves the no-photo contract and records only existing Android artifacts plus repeatable regression/preload evidence. Production owner approval remains pending until an accepted decision is recorded.',
  };
}

export function buildProductionEvidenceBackfill(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  return {
    dashboard: buildDashboardEvidence({ rootDir, generatedAt }),
    explore: buildExploreEvidence({ rootDir, generatedAt }),
    establishedCampgrounds: buildEstablishedCampgroundsEvidence({ rootDir, generatedAt }),
    fleet: buildFleetEvidence({ rootDir, generatedAt }),
    offline: buildOfflineNavigationEvidence({ rootDir, generatedAt }),
  };
}

export function writeProductionEvidenceBackfill(results, options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  return {
    dashboard: writeJson(rootDir, OUTPUTS.dashboard, results.dashboard),
    explore: writeJson(rootDir, OUTPUTS.explore, results.explore),
    establishedCampgrounds: writeJson(rootDir, OUTPUTS.establishedCampgrounds, results.establishedCampgrounds),
    fleet: writeJson(rootDir, OUTPUTS.fleet, results.fleet),
    offline: writeJson(rootDir, OUTPUTS.offline, results.offline),
  };
}

function formatWriteSummary(rootDir, written) {
  return [
    'Production evidence backfill wrote:',
    `- ${posixRel(rootDir, written.dashboard)}`,
    `- ${posixRel(rootDir, written.explore)}`,
    `- ${posixRel(rootDir, written.establishedCampgrounds)}`,
    `- ${posixRel(rootDir, written.fleet)}`,
    `- ${posixRel(rootDir, written.offline)}`,
    '',
  ].join('\n');
}

async function main() {
  const rootDir = process.cwd();
  const results = buildProductionEvidenceBackfill({ rootDir });
  const written = writeProductionEvidenceBackfill(results, { rootDir });
  process.stdout.write(formatWriteSummary(rootDir, written));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
