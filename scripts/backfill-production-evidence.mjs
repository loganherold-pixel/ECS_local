import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_RELATIVE_PATH = 'scripts/backfill-production-evidence.mjs';

const OUTPUTS = {
  dashboard: path.join('.smoke', 'dashboard-production-evidence.json'),
  explore: path.join('.smoke', 'explore-trail-packs-production-evidence.json'),
  fleet: path.join('.smoke', 'fleet-production-evidence.json'),
};

const READINESS_RESULTS = {
  dashboard: path.join('.smoke', 'dashboard-production-readiness-result.json'),
  explore: path.join('.smoke', 'explore-trail-packs-production-readiness-result.json'),
  fleet: path.join('.smoke', 'fleet-production-readiness-result.json'),
};

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
  const partialRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'explore-deep', '01-explore-entry'),
    path.join('.smoke', 'explore-deep', '04-display-on-map-result'),
    path.join('.smoke', 'explore-deep', '07-trip-builder-tab'),
    path.join('.smoke', 'explore-deep', '09-trip-builder-opened'),
    path.join('.smoke', 'explore-deep', '13-trip-builder-plan-result'),
    path.join('.smoke', 'explore-deep', '14-offline-prep-tab'),
    path.join('.smoke', 'explore-deep', '18-offline-prep-prepare-result'),
  ]);

  const fullTrailPackVisual = hasAll(allText, ['trail packs', 'ecs confidence', 'preview', 'start']) &&
    hasAny(allText, ['report issue', 'submit to ecs trail packs']) &&
    hasAny(allText, ['pending review', 'owner pending', 'low-confidence']);
  const moderation = hasAll(allText, ['report issue']) &&
    hasAny(allText, ['private land', 'closure', 'sensitive']) &&
    hasAny(allText, ['rejected', 'needs more data', 'suppressed']);
  const handoff = hasAll(allText, ['trail pack', 'navigate']) &&
    hasAny(allText, ['start guidance', 'staged', 'route geometry is unavailable']);
  const privacySubmission = hasAll(allText, ['certification', 'permission', 'pending review']) &&
    hasAny(allText, ['privacy warning', 'sanitize', 'right to share']);

  const pending = ['owner_signoff'];
  if (!fullTrailPackVisual) pending.push('full_trail_pack_card_preview_feedback_submission_visual_sweep');
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
    androidExploreTrailPacksVisualQaPassed: fullTrailPackVisual,
    contentReviewModerationEvidencePassed: moderation,
    exploreToNavigateDeviceHandoffEvidencePassed: handoff,
    privacySubmissionEvidencePassed: privacySubmission,
    productionDecision: 'pending_owner_signoff',
    evidenceReferences: [],
    partialEvidenceReferences: partialRefs,
    evidenceDetails: {
      legacyExploreRouteTripAndOfflinePrep: {
        status: partialRefs.length > 0 ? 'captured_as_partial_context_only' : 'missing',
        references: partialRefs,
      },
      trailPackProductionVisual: {
        status: fullTrailPackVisual ? 'captured' : 'pending',
        references: partialRefs.filter((item) => /trail|explore-entry/i.test(item)),
      },
      contentModeration: {
        status: moderation ? 'captured' : 'pending',
        references: [],
      },
      handoff: {
        status: handoff ? 'captured' : 'pending',
        references: partialRefs.filter((item) => /display-on-map|trip-builder/i.test(item)),
      },
      privacySubmission: {
        status: privacySubmission ? 'captured' : 'pending',
        references: [],
      },
    },
    reviewerSignoff: pendingOwnerSignoff(['product', 'engineering', 'contentModeration', 'qa', 'privacy', 'support']),
    pending,
    notes: 'Existing Explore deep artifacts are useful context for route/trip/offline-prep behavior, but they do not prove the current Trail Pack production moderation, submission, or handoff contract.',
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
    fleet: buildFleetEvidence({ rootDir, generatedAt }),
  };
}

export function writeProductionEvidenceBackfill(results, options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  return {
    dashboard: writeJson(rootDir, OUTPUTS.dashboard, results.dashboard),
    explore: writeJson(rootDir, OUTPUTS.explore, results.explore),
    fleet: writeJson(rootDir, OUTPUTS.fleet, results.fleet),
  };
}

function formatWriteSummary(rootDir, written) {
  return [
    'Production evidence backfill wrote:',
    `- ${posixRel(rootDir, written.dashboard)}`,
    `- ${posixRel(rootDir, written.explore)}`,
    `- ${posixRel(rootDir, written.fleet)}`,
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
