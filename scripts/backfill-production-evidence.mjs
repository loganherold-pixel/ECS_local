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
  return relativePaths.filter((relativePath) => exists(root, relativePath));
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

function buildDashboardEvidence(options) {
  const { rootDir, generatedAt } = options;
  const deepFiles = listFiles(rootDir, path.join('.smoke', 'dashboard-deep'));
  const xmlFiles = deepFiles.filter((file) => file.endsWith('.xml'));
  const tabSmokeRefs = artifactPairs(rootDir, [
    path.join('.smoke', 'android-tab-dashboard'),
    path.join('.smoke', 'ecs-smoke-dashboard'),
  ]);
  const tabSmokeXmlFiles = tabSmokeRefs.filter((file) => file.endsWith('.xml'));
  const allText = collectArtifactText(rootDir, [...tabSmokeXmlFiles, ...xmlFiles]);
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
    path.join('.smoke', 'dashboard-deep', '08-attitude-command'),
    path.join('.smoke', 'dashboard-deep', '20-after-zero-attitude'),
    path.join('.smoke', 'dashboard-deep', '21-after-sound-toggle'),
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

  const widgetVisual = visualRefs.some((item) => item.endsWith('.png')) &&
    hasAll(allText, ['widgets', 'current weather', 'vehicle profile', 'route progress', 'power monitor']) &&
    hasAny(allText, ['expand dashboard widgets', 'contract dashboard widgets']);
  const commandSwitching = hasAll(allText, ['change center module']) &&
    hasAny(allText, ['3d navigation', 'three d navigation', '3d nav']) &&
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

  const pending = ['owner_signoff'];
  if (!commandSwitching) pending.push('command_center_3d_navigation_switching_device_evidence');
  if (!rotationEvidence) pending.push('phone_landscape_and_tablet_rotation_sweep');

  return {
    system: 'dashboard_command_center_widgets',
    generatedAt,
    generatedBy: SCRIPT_RELATIVE_PATH,
    ...readinessMeta(rootDir, 'dashboard'),
    artifactScope: {
      androidArtifactFolders: ['.smoke', '.smoke/dashboard-deep'],
      artifactCount: tabSmokeRefs.length + deepFiles.length,
    },
    androidDashboardWidgetVisualQaPassed: widgetVisual,
    commandCenterSwitchingDeviceEvidencePassed: commandSwitching,
    liveStaleUnavailableSourceLabelEvidencePassed: sourceLabels,
    phoneLandscapeRotationLayoutEvidencePassed: rotationEvidence,
    productionDecision: 'pending_owner_signoff',
    evidenceReferences: Array.from(new Set([...visualRefs, ...commandRefs, ...sourceRefs])),
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
      },
      sourceLabels: {
        status: sourceLabels ? 'captured' : 'partial_or_missing',
        references: sourceRefs,
      },
      rotationLayout: {
        status: rotationEvidence ? 'captured' : 'pending',
        references: deepFiles.filter((file) => /landscape|rotation/i.test(file)),
      },
    },
    reviewerSignoff: pendingOwnerSignoff(['product', 'engineering', 'qa', 'design', 'privacy', 'support']),
    pending,
    notes: 'Local backfill only records what existing Android artifacts prove. Owner approval and missing rotation/command switching evidence remain pending.',
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

function buildFleetArtifactRefs(rootDir) {
  const explicit = [
    path.join('.smoke', 'android-tab-fleet'),
    path.join('.smoke', 'ecs-smoke-fleet'),
    path.join('.smoke', 'focused-android-qa', 'restart-fleet'),
    path.join('.smoke', 'trip-confidence-native-qa', 'tab-fleet'),
    path.join('.smoke', 'android-bughunt-20260604-154755', 'ui-fleet'),
    path.join('.smoke', 'android-bughunt-20260604-154755', 'screen-fleet'),
    path.join('.smoke', 'android-bughunt-20260604-154755', 'logcat-one-tab-fleet'),
    path.join('.smoke', 'android-fieldtest-20260604-153314', '02-fleet'),
    path.join('.smoke', 'android-fieldtest-20260604-153314', '09-fleet-idle-after-15s'),
    path.join('.smoke', 'trip-builder-poi-bailout-native-qa', 'tab-fleet'),
    path.join('.smoke', 'route-confidence-engine-native-regression', 'tab-fleet'),
  ];
  return artifactPairs(rootDir, explicit);
}

function buildFleetEvidence(options) {
  const { rootDir, generatedAt } = options;
  const artifactRefs = buildFleetArtifactRefs(rootDir);
  const xmlRefs = artifactRefs.filter((file) => file.endsWith('.xml'));
  const allText = collectArtifactText(rootDir, xmlRefs);
  const packageVersion = readJson(rootDir, 'package.json')?.version ?? 'pending';
  const preloadStateIds = extractFleetPreloadStateIds(rootDir);
  const preloadRefs = preloadStateIds.map((stateId) => `fleetQaPreload:${stateId}`);

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

  const profileVisual = hasAll(allText, ['fleet', 'vehicle command center', 'vehicle profile', 'build & loadout', 'weight summary']) &&
    hasAny(allText, ['confirm specs', 'advanced specs', 'add vehicle profile']);
  const multiVehicle = hasAny(allText, ['2 vehicles', 'two vehicle', 'qa lead ram', 'qa scout bronco']) &&
    hasAny(allText, ['active switch', 'active vehicle']);
  const scaleTicket = hasAny(allText, ['scale_ticket', 'scale ticket verified', 'verified weight']) &&
    !hasAny(allText, ['raise confidence from estimate to verified']);
  const offlineMigration = hasAny(allText, ['offline restore', 'migration', 'legacy_keep_me']) &&
    hasAny(artifactRefs.join('\n').toLowerCase(), ['restart-fleet', 'offline-restart']);

  const pending = ['owner_signoff'];
  if (!profileVisual) pending.push('vehicle_profile_modal_add_edit_android_evidence');
  if (!multiVehicle) pending.push('multi_vehicle_active_selection_device_evidence');
  if (!scaleTicket) pending.push('real_scale_ticket_or_axle_weight_device_evidence');
  if (!offlineMigration) pending.push('offline_persistence_and_legacy_migration_restart_evidence');
  pending.push('android_build_device_metadata');

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
      ],
      artifactCount: artifactRefs.length,
    },
    androidFleetProfileVisualQaPassed: profileVisual,
    multiVehicleActiveSelectionEvidencePassed: multiVehicle,
    scaleTicketProfileEvidencePassed: scaleTicket,
    sourceConfidenceOfflineStatesVisible,
    offlinePersistenceMigrationEvidencePassed: offlineMigration,
    productionDecision: 'pending_owner_signoff',
    buildAndDevice: {
      appBuildType: 'pending',
      appVersion: packageVersion,
      androidDeviceModel: 'pending',
      androidOsVersion: 'pending',
      nativeBuild: hasAny(allText, ['com.expeditioncommand.planningofflinesync', 'fleet']),
      expoGoRuntime: false,
    },
    androidQaStateMatrix,
    deviceMatrix: [
      {
        label: 'large screen portrait Android artifacts',
        status: artifactRefs.length > 0 ? 'captured_partial' : 'missing',
        evidence: artifactRefs.filter((item) => item.includes('android-tab-fleet') || item.includes('ecs-smoke-fleet')),
      },
      {
        label: 'phone, landscape, and profile-modal device sweep',
        status: 'pending',
        evidence: [],
      },
    ],
    evidenceReferences: Array.from(new Set([...artifactRefs, ...preloadRefs])),
    evidenceDetails: {
      sourceConfidenceOfflineStates: {
        status: sourceConfidenceOfflineStatesVisible ? 'captured' : 'partial_or_missing',
        references: artifactRefs,
      },
      qaPreloadHarness: {
        status: preloadStateIds.length > 0 ? 'available_for_repeatable_device_sweeps' : 'missing',
        stateIds: preloadStateIds,
        note: 'Preload states are setup aids only; they do not satisfy production evidence without Android screenshots, XML/logs, and reviewer signoff.',
      },
      profileVisual: {
        status: profileVisual ? 'captured' : 'pending_profile_modal_and_add_edit_capture',
        references: artifactRefs.filter((item) => /fleet/i.test(item)),
      },
      multiVehicle: {
        status: multiVehicle ? 'captured' : 'pending',
        references: preloadRefs.filter((item) => item.includes('two_vehicle_active_switch')),
      },
      scaleTicket: {
        status: scaleTicket ? 'captured' : 'pending_real_scale_ticket_or_axle_weight_device_capture',
        references: preloadRefs.filter((item) => item.includes('verified_vs_estimated_weight')),
      },
      offlineMigration: {
        status: offlineMigration ? 'captured' : 'pending_offline_restart_and_legacy_migration_capture',
        references: artifactRefs.filter((item) => /restart|offline/i.test(item)).concat(
          preloadRefs.filter((item) => item.includes('offline_restore_migration')),
        ),
      },
      noPhotoContract: {
        status: noPhotoContractVisible ? 'no_forbidden_visible_vehicle_media_terms_found' : 'blocked_for_visible_vehicle_media_terms',
        forbiddenTermsChecked: FLEET_FORBIDDEN_VISIBLE_MEDIA_TERMS,
      },
    },
    reviewerSignoff: pendingOwnerSignoff(['product', 'engineering', 'qa', 'privacy', 'support']),
    pending,
    notes: 'Fleet backfill preserves the no-photo contract and references QA preload states only as repeatable setup aids. Production approval, real scale-ticket evidence, profile-modal device capture, multi-vehicle downstream capture, and offline migration restart evidence remain pending.',
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
