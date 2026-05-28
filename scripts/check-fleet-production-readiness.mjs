import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'fleet-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'fleet-production-evidence.json');

function relPath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(readIfExists(filePath));
  } catch {
    return null;
  }
}

function normalize(source) {
  return source.replace(/\r\n/g, '\n');
}

function check(id, label, passed, evidence = [], remediation = []) {
  return { id, label, passed: Boolean(passed), evidence, remediation };
}

function evidenceTrue(evidence, key) {
  return evidence?.[key] === true;
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function nonPlaceholderString(value) {
  const text = String(value ?? '').trim();
  return Boolean(text) && !/^(tbd|todo|pending|placeholder|n\/a|none)$/i.test(text);
}

function hasMinNonPlaceholderEntries(value, min) {
  return Array.isArray(value) && value.filter(nonPlaceholderString).length >= min;
}

function accepted(value) {
  return String(value ?? '').trim().toLowerCase() === 'accepted';
}

function excludesAll(source, fragments) {
  return fragments.every((fragment) => !source.includes(fragment));
}

function hasBuildAndDeviceEvidence(evidence) {
  const build = evidence?.buildAndDevice;
  return isObject(build) &&
    nonPlaceholderString(build.appBuildType) &&
    nonPlaceholderString(build.appVersion) &&
    nonPlaceholderString(build.androidDeviceModel) &&
    nonPlaceholderString(build.androidOsVersion) &&
    build.nativeBuild === true &&
    build.expoGoRuntime === false;
}

function hasAndroidQaStateMatrix(evidence) {
  const matrix = evidence?.androidQaStateMatrix;
  return isObject(matrix) &&
    matrix.sourceLabelsVisible === true &&
    matrix.confidenceLabelsVisible === true &&
    matrix.estimatedStateVisible === true &&
    matrix.missingDataStateVisible === true &&
    matrix.offlineStateVisible === true &&
    matrix.noPhotoContractVisible === true;
}

function hasReviewerSignoff(evidence) {
  const signoff = evidence?.reviewerSignoff;
  return isObject(signoff) &&
    ['product', 'engineering', 'qa', 'privacy'].every((field) => nonPlaceholderString(signoff[field])) &&
    nonPlaceholderString(signoff.acceptedAt);
}

function hasEvidenceContract(evidence) {
  return isObject(evidence) &&
    hasBuildAndDeviceEvidence(evidence) &&
    hasAndroidQaStateMatrix(evidence) &&
    hasMinNonPlaceholderEntries(evidence.deviceMatrix, 2) &&
    hasMinNonPlaceholderEntries(evidence.evidenceReferences, 4) &&
    nonPlaceholderString(evidence.notes);
}

export function buildFleetProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    fleetScreen: path.join(root, 'app', '(tabs)', 'fleet.tsx'),
    commandDock: path.join(root, 'components', 'CommandDock.tsx'),
    premiumDomain: path.join(root, 'lib', 'fleet', 'fleetPremiumDomain.ts'),
    operatingWeight: path.join(root, 'lib', 'fleet', 'fleetOperatingWeight.ts'),
    weightSummary: path.join(root, 'lib', 'fleet', 'fleetWeightSummary.ts'),
    vehicleStateSelectors: path.join(root, 'lib', 'fleet', 'fleetVehicleStateSelectors.ts'),
    activeVehicleState: path.join(root, 'lib', 'fleet', 'activeVehicleState.ts'),
    vehicleEcsIntegration: path.join(root, 'lib', 'vehicleEcsIntegration.ts'),
    routeConfidence: path.join(root, 'lib', 'routeConfidencePresentation.ts'),
    exploreAdapter: path.join(root, 'lib', 'explore', 'exploreOrchestratorAdapter.ts'),
    campOpsScoring: path.join(root, 'lib', 'campops', 'campOpsScoring.ts'),
    expeditionAiContext: path.join(root, 'lib', 'ai', 'expeditionIntelligenceContextBuilder.ts'),
    widgetReadiness: path.join(root, 'components', 'dashboard', 'widgetReadiness.ts'),
    profileModal: path.join(root, 'components', 'fleet', 'FleetVehicleProfileModal.tsx'),
    buildLoadoutModal: path.join(root, 'components', 'fleet', 'FleetBuildLoadoutModal.tsx'),
    loadoutModal: path.join(root, 'components', 'fleet', 'FleetLoadoutModal.tsx'),
    refactorMapDoc: path.join(root, 'docs', 'fleet-premium-refactor-map.md'),
    uiContractDoc: path.join(root, 'docs', 'fleet-tactical-ui-contract.md'),
    releaseDoc: path.join(root, 'docs', 'fleet-premium-release.md'),
  };

  const evidence = readJsonIfExists(paths.evidence);
  const fleetScreen = normalize(readIfExists(paths.fleetScreen));
  const commandDock = normalize(readIfExists(paths.commandDock));
  const premiumDomain = normalize(readIfExists(paths.premiumDomain));
  const operatingWeight = normalize(readIfExists(paths.operatingWeight));
  const weightSummary = normalize(readIfExists(paths.weightSummary));
  const vehicleStateSelectors = normalize(readIfExists(paths.vehicleStateSelectors));
  const activeVehicleState = normalize(readIfExists(paths.activeVehicleState));
  const vehicleEcsIntegration = normalize(readIfExists(paths.vehicleEcsIntegration));
  const routeConfidence = normalize(readIfExists(paths.routeConfidence));
  const exploreAdapter = normalize(readIfExists(paths.exploreAdapter));
  const campOpsScoring = normalize(readIfExists(paths.campOpsScoring));
  const expeditionAiContext = normalize(readIfExists(paths.expeditionAiContext));
  const widgetReadiness = normalize(readIfExists(paths.widgetReadiness));
  const profileModal = normalize(readIfExists(paths.profileModal));
  const buildLoadoutModal = normalize(readIfExists(paths.buildLoadoutModal));
  const loadoutModal = normalize(readIfExists(paths.loadoutModal));
  const refactorMapDoc = normalize(readIfExists(paths.refactorMapDoc));
  const uiContractDoc = normalize(readIfExists(paths.uiContractDoc));
  const releaseDoc = normalize(readIfExists(paths.releaseDoc));

  const forbiddenMediaHooks = [
    'iconAsset=',
    '<Image',
    'ImageBackground',
    'imageUrl',
    'VehiclePhotoAsset',
    'photoManifest',
    'photoResolver',
    'remoteImage',
    'vehicle image upload',
    'upload',
  ];

  const checks = [
    check(
      'fleet_confidence_tiers_and_weight_sources_are_explicit',
      'Fleet confidence tiers, source labels, and verified-weight paths are explicit and separated from estimates.',
      premiumDomain.includes('export const FLEET_CONFIDENCE_TIERS') &&
        premiumDomain.includes("scale_ticket: { min: 98, max: 98, default: 98 }") &&
        premiumDomain.includes("vin_oem_match: { min: 90, max: 95, default: 93 }") &&
        premiumDomain.includes("manufacturer_spec: { min: 88, max: 95, default: 91 }") &&
        premiumDomain.includes("exact_build_match: { min: 80, max: 88, default: 84 }") &&
        premiumDomain.includes("vehicle_type_default: { min: 60, max: 72, default: 66 }") &&
        premiumDomain.includes("user_estimate: { min: 55, max: 70, default: 62 }") &&
        premiumDomain.includes('export type FleetWeightSource') &&
        premiumDomain.includes('sourceLabel') &&
        premiumDomain.includes('verifiedAt') &&
        premiumDomain.includes('mapLegacyWeightSource') &&
        profileModal.includes('Use ECS Estimate') &&
        profileModal.includes('PAYLOAD REMAINING') &&
        buildLoadoutModal.includes('ECS estimated this at'),
      [relPath(root, paths.premiumDomain), relPath(root, paths.profileModal), relPath(root, paths.buildLoadoutModal)],
      ['Record real profile/spec and scale-ticket evidence before allowing Fleet readiness to be treated as production accepted.'],
    ),
    check(
      'fleet_operating_weight_payload_and_zone_risk_math_are_centralized',
      'Fleet operating weight, payload remaining, GVWR usage, and load-zone risk math are centralized in domain helpers.',
      premiumDomain.includes('operatingWeight') &&
        premiumDomain.includes('payloadRemaining') &&
        premiumDomain.includes('gvwrUsagePct') &&
        premiumDomain.includes('topHeavyRisk') &&
        premiumDomain.includes('frontAxleRisk') &&
        premiumDomain.includes('rearAxleRisk') &&
        premiumDomain.includes('FLEET_LOAD_ZONES') &&
        premiumDomain.includes("'frontLow'") &&
        premiumDomain.includes("'rearLow'") &&
        premiumDomain.includes("'bedHigh'") &&
        premiumDomain.includes("'roof'") &&
        premiumDomain.includes("'hitch'") &&
        premiumDomain.includes("'trailer'") &&
        premiumDomain.includes('toFleetLoadZone') &&
        operatingWeight.includes('calculateVehicleOperatingWeight') &&
        operatingWeight.includes('partialDataReasons') &&
        weightSummary.includes('buildFleetWeightSummary') &&
        weightSummary.includes('applyFleetWeightVerification') &&
        vehicleStateSelectors.includes('calculateVehicleOperatingWeight') &&
        vehicleStateSelectors.includes('buildFleetWeightSummary'),
      [
        relPath(root, paths.premiumDomain),
        relPath(root, paths.operatingWeight),
        relPath(root, paths.weightSummary),
        relPath(root, paths.vehicleStateSelectors),
      ],
      ['Validate Fleet weight math against real vehicle setup, accessory, loadout, and scale-ticket examples.'],
    ),
    check(
      'fleet_profile_and_build_loadout_keep_guided_no_photo_contract',
      'Fleet profile and build/loadout flows stay guided, compact, source-labeled, and free of vehicle-photo dependencies.',
      profileModal.includes("title={vehicle ? 'Vehicle Profile' : 'Add Vehicle Profile'}") &&
        profileModal.includes('Confirm Specs') &&
        profileModal.includes('Advanced Specs') &&
        profileModal.includes('calculateConfirmedPayloadRemaining') &&
        profileModal.includes('vehicleSpecStore.update') &&
        profileModal.includes('gvwr_lb') &&
        profileModal.includes('base_weight_lb') &&
        buildLoadoutModal.includes('title="Build & Loadout"') &&
        buildLoadoutModal.includes('Compartment Loadout') &&
        buildLoadoutModal.includes('FLEET_LOAD_ZONES.map') &&
        buildLoadoutModal.includes('Add Loadout Item') &&
        loadoutModal.includes("import ECSModalShell from '../ECSModalShell'") &&
        excludesAll(profileModal + buildLoadoutModal, forbiddenMediaHooks),
      [relPath(root, paths.profileModal), relPath(root, paths.buildLoadoutModal), relPath(root, paths.loadoutModal)],
      ['Capture Android Fleet setup, edit, build/loadout, advanced specs, and no-vehicle-photo visual evidence.'],
    ),
    check(
      'fleet_active_vehicle_state_feeds_ecs_surfaces',
      'Active Fleet vehicle state feeds ECS readiness, route confidence, Explore, CampOps, AI context, and dashboard widgets with source labels.',
      activeVehicleState.includes('export function getActiveVehicleState') &&
        activeVehicleState.includes('export function subscribeActiveVehicleState') &&
        activeVehicleState.includes('sourceLabels') &&
        activeVehicleState.includes('partialDataReasons') &&
        activeVehicleState.includes('resourceProfile') &&
        activeVehicleState.includes('payloadUsedPct') &&
        activeVehicleState.includes('topHeavyRisk') &&
        vehicleEcsIntegration.includes('scoreVehicleSuitabilityForEcs') &&
        vehicleEcsIntegration.includes('publishVehicleSystemAdvisories') &&
        routeConfidence.includes('scoreVehicleSuitabilityForEcs') &&
        exploreAdapter.includes('scoreVehicleSuitabilityForEcs') &&
        campOpsScoring.includes('scoreVehicleSuitabilityForEcs') &&
        expeditionAiContext.includes('getOptionalActiveVehicleSnapshotForEcs') &&
        widgetReadiness.includes('getActiveVehicleContext') &&
        widgetReadiness.includes('activeVehicle.resourceProfile'),
      [
        relPath(root, paths.activeVehicleState),
        relPath(root, paths.vehicleEcsIntegration),
        relPath(root, paths.routeConfidence),
        relPath(root, paths.exploreAdapter),
        relPath(root, paths.campOpsScoring),
        relPath(root, paths.expeditionAiContext),
        relPath(root, paths.widgetReadiness),
      ],
      ['Exercise multi-vehicle active selection and confirm downstream ECS surfaces update without stale vehicle context.'],
    ),
    check(
      'fleet_screen_keeps_tab_label_and_tactical_shell_without_photo_surface',
      'Fleet keeps the tab label, shared tactical shell, compact metrics, payload wording, and no-photo visual contract.',
      commandDock.includes("label: 'FLEET'") &&
        commandDock.includes("route: '/fleet'") &&
        fleetScreen.includes('<Header title="Fleet Center"') &&
        fleetScreen.includes('VEHICLE COMMAND CENTER') &&
        fleetScreen.includes('Vehicle Profile') &&
        fleetScreen.includes('Build & Loadout') &&
        fleetScreen.includes('Weight Summary') &&
        fleetScreen.includes('Readiness/ECS Score') &&
        fleetScreen.includes('Operating weight = base net/empty + permanent accessory weight + current loadout.') &&
        fleetScreen.includes('Payload remaining = GVWR - operating weight.') &&
        fleetScreen.includes('Measured accessory, loadout, or axle weights can refine front/rear estimates') &&
        fleetScreen.includes('generatePremiumFleetFabricPayload') &&
        excludesAll(fleetScreen, forbiddenMediaHooks),
      [relPath(root, paths.commandDock), relPath(root, paths.fleetScreen)],
      ['Run Android Fleet small-screen and tablet visual QA to confirm card density, scrolling, modals, and no media placeholders.'],
    ),
    check(
      'fleet_docs_and_release_contract_are_present',
      'Fleet premium release docs preserve no-photo rules, tactical UI contract, and rollout requirements.',
      refactorMapDoc.includes('Fleet') &&
        uiContractDoc.includes('No-Media Rule') &&
        uiContractDoc.includes('OEM vehicle photographs') &&
        uiContractDoc.includes('Fleet must not render another bottom dock') &&
        releaseDoc.includes('Fleet') &&
        releaseDoc.includes('premium') &&
        releaseDoc.includes('release') &&
        releaseDoc.includes('.smoke/fleet-production-evidence.json') &&
        releaseDoc.includes('sourceConfidenceOfflineStatesVisible') &&
        releaseDoc.includes('androidQaStateMatrix'),
      [relPath(root, paths.refactorMapDoc), relPath(root, paths.uiContractDoc), relPath(root, paths.releaseDoc)],
      ['Keep Fleet docs updated as production evidence is recorded or release scope changes.'],
    ),
    check(
      'fleet_production_evidence_contract_complete',
      'Fleet production evidence contract includes Android build/device metadata, artifact references, QA state matrix, and notes.',
      hasEvidenceContract(evidence),
      [relPath(root, paths.evidence)],
      ['Populate .smoke/fleet-production-evidence.json with build/device metadata, Android QA state matrix, device matrix, evidence references, and non-placeholder notes.'],
    ),
    check(
      'android_fleet_profile_visual_evidence_present',
      'Android Fleet profile/setup visual evidence is recorded.',
      evidenceTrue(evidence, 'androidFleetProfileVisualQaPassed'),
      [relPath(root, paths.evidence)],
      ['Capture Android phone/tablet Fleet profile, add/edit, build/loadout, advanced specs, weight summary, and zero-vehicle states.'],
    ),
    check(
      'multi_vehicle_active_selection_evidence_present',
      'Multi-vehicle active selection and downstream ECS surface evidence is recorded.',
      evidenceTrue(evidence, 'multiVehicleActiveSelectionEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Record active vehicle switching evidence across Dashboard, Navigate, Explore, CampOps, AI context, and Fleet surfaces.'],
    ),
    check(
      'scale_ticket_profile_evidence_present',
      'Scale-ticket/profile source-confidence evidence is recorded.',
      evidenceTrue(evidence, 'scaleTicketProfileEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Record at least one verified scale-ticket or axle-weight profile path and confirm estimate/source labels update correctly.'],
    ),
    check(
      'source_confidence_offline_android_qa_evidence_present',
      'Android QA evidence proves source, confidence, estimated, missing-data, offline, and no-photo states are visible.',
      evidenceTrue(evidence, 'sourceConfidenceOfflineStatesVisible') && hasAndroidQaStateMatrix(evidence),
      [relPath(root, paths.evidence), relPath(root, paths.fleetScreen)],
      ['Capture Android Fleet screenshots/log notes showing source labels, confidence labels, estimated/missing states, offline/local mode, and no vehicle-photo surfaces.'],
    ),
    check(
      'offline_persistence_migration_evidence_present',
      'Offline persistence and legacy migration evidence is recorded.',
      evidenceTrue(evidence, 'offlinePersistenceMigrationEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Validate Fleet add/edit/loadout persistence offline, app restart restore, and legacy vehicle migration on Android.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for Fleet.',
      accepted(evidence?.productionDecision) && hasReviewerSignoff(evidence),
      [relPath(root, paths.evidence)],
      ['Record product, engineering, QA, privacy/security, and support acceptance after Android/profile evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  return {
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'fleet_vehicle_readiness_payload',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: failed.flatMap((item) => item.remediation),
    evidenceContract: {
      path: RESULT_RELATIVE_PATH.replace('readiness-result', 'evidence'),
      requiredFields: [
        'androidFleetProfileVisualQaPassed',
        'multiVehicleActiveSelectionEvidencePassed',
        'scaleTicketProfileEvidencePassed',
        'sourceConfidenceOfflineStatesVisible',
        'offlinePersistenceMigrationEvidencePassed',
        'productionDecision',
        'buildAndDevice',
        'androidQaStateMatrix',
        'deviceMatrix',
        'evidenceReferences',
        'reviewerSignoff',
        'notes',
      ],
    },
    notes: [
      'This gate separates Fleet implementation readiness from Android, multi-vehicle, verified-weight, offline persistence, and owner-decision evidence.',
      'Fleet must remain tactical and no-photo: vehicle readiness should come from specs, weight math, source confidence, load zones, and explicit stale/missing data labels.',
      'Downstream ECS recommendations must treat unknown or estimated Fleet values as lower-confidence context, not verified live truth.',
    ],
  };
}

export function writeFleetProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatFleetProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Fleet production readiness: ${result.statusLabel}`,
    `Result file: ${relPath(root, path.join(root, RESULT_RELATIVE_PATH))}`,
    `Checked at: ${result.checkedAt}`,
    `Production ready: ${result.passed ? 'yes' : 'no'}`,
    '',
    'Checks:',
  ];
  for (const item of result.checks) lines.push(`- ${item.label}: ${item.passed ? 'pass' : 'blocked'}`);
  if (result.blockers.length > 0) {
    lines.push('', 'Active blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.remediation.length > 0) {
    lines.push('', 'Next actions:');
    for (const item of Array.from(new Set(result.remediation))) lines.push(`- ${item}`);
  }
  lines.push('', 'Notes:');
  for (const note of result.notes) lines.push(`- ${note}`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const jsonOnly = process.argv.includes('--json');
  const result = buildFleetProductionReadinessResult();
  writeFleetProductionReadinessResult(result);
  if (jsonOnly) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(formatFleetProductionReadinessResult(result));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
