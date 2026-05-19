import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildAndroidQaEvidenceResult } from './check-android-qa-evidence.mjs';
import { buildProviderReadinessResult } from './check-provider-readiness.mjs';
import { buildPrivacyStorageApprovalResult } from './check-privacy-storage-approval.mjs';
import { buildClosedFieldTestRiskAcceptanceResult } from './check-closed-field-test-risk-acceptance.mjs';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'campops-live-readiness-result.json');

const SAFETY_COPY_FILES = [
  path.join('components', 'navigate', 'CampScoutIntelCard.tsx'),
  path.join('lib', 'campops', 'campOpsCampIntelViewModel.ts'),
  path.join('lib', 'campops', 'campOpsMapPins.ts'),
];

const FORBIDDEN_COPY_PATTERNS = [
  /\bAI-Inferred\b/i,
  /\bLegal campsite\b/i,
  /\bGuaranteed accessible\b/i,
  /\bSafe campsite\b/i,
  /\bApproved campsite\b/i,
];

const REQUIRED_ANDROID_NAVIGATE_FLOWS = [
  'Navigate Mapbox route rendering',
  'CampOps camp pin rendering',
  'CampOps pin tap opens Camp Intel popup',
  'Camp Intel popup scroll',
  'Camp Intel popup dismiss',
  'Save Camp action',
  'Navigate Here action',
  'Report Unusable action',
];

function pathsFor(root) {
  return {
    smokeDir: path.join(root, '.smoke'),
    resultPath: path.join(root, RESULT_RELATIVE_PATH),
    source: {
      navigateScreen: path.join(root, 'app', '(tabs)', 'navigate.tsx'),
      mapRenderer: path.join(root, 'components', 'navigate', 'MapRenderer.tsx'),
      popup: path.join(root, 'components', 'navigate', 'CampScoutIntelCard.tsx'),
      pinBuilder: path.join(root, 'lib', 'campops', 'campOpsMapPins.ts'),
      recommendations: path.join(root, 'lib', 'campops', 'campOpsRecommendations.ts'),
      config: path.join(root, 'lib', 'campops', 'campOpsRecommendationConfig.ts'),
      viewModel: path.join(root, 'lib', 'campops', 'campOpsCampIntelViewModel.ts'),
    },
    tests: {
      mapPinParity: path.join(root, 'scripts', 'test-campops-map-pin-parity.js'),
      popup: path.join(root, 'scripts', 'test-campops-camp-intel-popup.js'),
      filtering: path.join(root, 'scripts', 'test-campops-candidate-filtering.js'),
      lifecycle: path.join(root, 'scripts', 'test-campops-lifecycle.js'),
    },
    docs: {
      liveReadiness: path.join(root, 'docs', 'campops', 'live_readiness_gates.md'),
      closedField: path.join(root, 'docs', 'campops', 'closed_field_test_readiness.md'),
      privacy: path.join(root, 'docs', 'campops', 'privacy_storage_review.md'),
      provider: path.join(root, 'docs', 'campops', 'provider_readiness.md'),
      mobileQa: path.join(root, 'docs', 'campops', 'mobile_qa_evidence.md'),
    },
  };
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function hasAll(text, patterns) {
  return patterns.every((pattern) => pattern.test(text));
}

function hasNo(text, patterns) {
  return patterns.every((pattern) => !pattern.test(text));
}

function boolCheck(id, label, passed, evidence = []) {
  return {
    id,
    label,
    passed: Boolean(passed),
    evidence,
  };
}

function gateResult(id, label, checks, blockerId, notes = []) {
  const failedChecks = checks.filter((check) => !check.passed);
  return {
    id,
    label,
    passed: failedChecks.length === 0,
    blockerId,
    failedChecks: failedChecks.map((check) => check.id),
    checks,
    notes,
  };
}

function checkRenderingGate(root, paths) {
  const navigate = readIfExists(paths.source.navigateScreen);
  const renderer = readIfExists(paths.source.mapRenderer);
  const pinBuilder = readIfExists(paths.source.pinBuilder);
  const popup = readIfExists(paths.source.popup);

  const checks = [
    boolCheck(
      'navigate_mapbox_receives_campops_pins',
      'Navigate passes CampOps pins into the shared Camp Scout marker prop.',
      hasAll(navigate, [/buildCampOpsCampScoutMapPins/, /campScoutMarkers=\{sharedCampPinMapMarkers\}/]),
      [rel(root, paths.source.navigateScreen)],
    ),
    boolCheck(
      'shared_camp_pin_style_reused',
      'MapRenderer uses the existing camp-scout marker CSS, tent icon, and rank label for CampOps pins.',
      hasAll(renderer, [/camp-scout-marker camp-scout-grade-/, /camp-scout-tent/, /camp-scout-rank/, /pinFamily:\s*marker\.pinFamily === 'campops'/]),
      [rel(root, paths.source.mapRenderer)],
    ),
    boolCheck(
      'no_separate_campops_marker_style',
      'No separate CampOps marker class is used instead of the ECS camp pin style.',
      !/campops-marker|camp-ops-marker/i.test(renderer),
      [rel(root, paths.source.mapRenderer)],
    ),
    boolCheck(
      'pin_ids_deduped_before_render',
      'CampOps map pin builder dedupes ids and caps route candidates before render.',
      hasAll(pinBuilder, [/const seen = new Set<string>\(\)/, /seen\.has\(camp\.id\)/, /CAMP_OPS_ROUTE_PIN_LIMIT\s*=\s*5/]),
      [rel(root, paths.source.pinBuilder)],
    ),
    boolCheck(
      'popup_open_dismiss_path_present',
      'CampOps pin payload can open and dismiss the Camp Intel popup.',
      hasAll(navigate, [
        /onCampScoutTap=\{handleCampScoutTap\}/,
        /isCampOpsMapPinPayload/,
        /setSelectedCampOps(?:Intel|EndpointId)/,
        /selectedCampOpsIntel/,
        /CampScoutIntelCard/,
      ]) &&
        hasAll(popup, [/onDismiss/, /Dismiss Camp Intel popup/]),
      [rel(root, paths.source.navigateScreen), rel(root, paths.source.popup)],
    ),
    boolCheck(
      'rendering_regression_tests_present',
      'Rendering/popup/parity regression tests are present.',
      fs.existsSync(paths.tests.mapPinParity) && fs.existsSync(paths.tests.popup) && fs.existsSync(paths.tests.lifecycle),
      [rel(root, paths.tests.mapPinParity), rel(root, paths.tests.popup), rel(root, paths.tests.lifecycle)],
    ),
  ];

  return gateResult('rendering', 'CampOps rendering gate', checks, 'campops_rendering_gate_failed');
}

function checkScoringGate(root, paths) {
  const config = readIfExists(paths.source.config);
  const recommendations = readIfExists(paths.source.recommendations);
  const pinBuilder = readIfExists(paths.source.pinBuilder);

  const checks = [
    boolCheck(
      'thresholds_are_conservative',
      'Scoring defaults enforce 70/100 minimums for overall, terrain, access, legal/source, and camp suitability.',
      hasAll(config, [
        /minimumOverallScore:\s*70\b/,
        /minimumTerrainScore:\s*70\b/,
        /minimumAccessScore:\s*70\b/,
        /minimumLegalSourceScore:\s*70\b/,
        /minimumCampSuitabilityScore:\s*70\b/,
      ]),
      [rel(root, paths.source.config)],
    ),
    boolCheck(
      'top_five_and_nearby_dedupe',
      'Route candidates are limited to top 5 and deduped by nearby practical location.',
      hasAll(config, [/routeCandidateLimit:\s*5\b/, /duplicateCandidateRadiusMiles:\s*0\.\d+/]) &&
        hasAll(recommendations, [/topDedupedRouteCandidates/, /milesBetween/, /kept\.length >= config\.routeCandidateLimit/]),
      [rel(root, paths.source.config), rel(root, paths.source.recommendations)],
    ),
    boolCheck(
      'rank_source_confidence_order',
      'Ranking uses overall score, distance efficiency, and source confidence.',
      hasAll(recommendations, [/sortQualifiedRouteCandidates/, /routeDistanceMiles/, /sourceConfidenceScore/]),
      [rel(root, paths.source.recommendations)],
    ),
    boolCheck(
      'demo_data_blocked_from_route_candidates',
      'Demo data is rejected from production route candidates instead of creating fallback camps.',
      hasAll(recommendations, [/Demo data is not eligible for production CampOps route candidates/, /thresholdRejectionReasons/]) &&
        !/fake fallback|demo fallback/i.test(pinBuilder),
      [rel(root, paths.source.recommendations), rel(root, paths.source.pinBuilder)],
    ),
    boolCheck(
      'scoring_regression_tests_present',
      'Candidate filtering regression test exists.',
      fs.existsSync(paths.tests.filtering),
      [rel(root, paths.tests.filtering)],
    ),
  ];

  return gateResult('scoring', 'CampOps scoring gate', checks, 'campops_scoring_gate_failed');
}

function checkSafetyCopyGate(root, paths) {
  const safetyCopy = SAFETY_COPY_FILES.map((relativePath) => readIfExists(path.join(root, relativePath))).join('\n');
  const checks = [
    boolCheck(
      'ecs_inferred_copy_used',
      'CampOps popup uses ECS-Inferred copy where appropriate.',
      /\bECS-Inferred Camp Candidate\b/.test(safetyCopy),
      SAFETY_COPY_FILES,
    ),
    boolCheck(
      'verification_language_present',
      'Popup copy clearly labels unverified source/access/legal status.',
      hasAll(safetyCopy, [/Needs verification/, /Access not fully verified/, /Source confidence/, /Legal\/source confidence/]),
      SAFETY_COPY_FILES,
    ),
    boolCheck(
      'overconfident_copy_absent',
      'Overconfident legal/safety copy is absent from CampOps UI sources.',
      hasNo(safetyCopy, FORBIDDEN_COPY_PATTERNS),
      SAFETY_COPY_FILES,
    ),
  ];

  return gateResult('safety_copy', 'CampOps safety/copy gate', checks, 'campops_safety_copy_gate_failed');
}

function checkPrivacyStorageGate(root, paths, privacyApproval) {
  const privacy = readIfExists(paths.docs.privacy);
  const navigate = readIfExists(paths.source.navigateScreen);
  const checkDocs = [
    /Saved camps storage/i,
    /Report unusable data handling/i,
    /Private coordinates in shared evidence:\s*no/i,
    /Raw provider payloads stored:\s*no/i,
    /CAMP_OPS_DEBRIEF_STORAGE_KEY/,
    /deleteStoredCampOpsDebrief/,
  ];
  const rawCoordinateLog =
    /console\.(?:log|warn|error)\s*\([^)]*(?:selectedCampOpsIntel|campOpsDetail|latitude|longitude)[^)]*\)/is;
  const checks = [
    boolCheck(
      'privacy_storage_documented',
      'Saved camps, report unusable, retention, deletion, and sensitive coordinate evidence posture are documented.',
      hasAll(privacy, checkDocs),
      [rel(root, paths.docs.privacy)],
    ),
    boolCheck(
      'coordinates_not_logged_unnecessarily',
      'Navigate CampOps paths do not log selected camp coordinates through console output.',
      !rawCoordinateLog.test(navigate),
      [rel(root, paths.source.navigateScreen)],
    ),
    boolCheck(
      'privacy_storage_owner_approved',
      'Closed-field-test privacy/storage owner approval is complete or risk-accepted.',
      privacyApproval.passed,
      [rel(root, paths.docs.privacy)],
    ),
  ];

  return gateResult(
    'privacy_storage',
    'CampOps privacy/storage gate',
    checks,
    'campops_privacy_storage_gate_failed',
    privacyApproval.blockers ?? [],
  );
}

function checkProviderSourceGate(root, paths, providerReadiness) {
  const provider = readIfExists(paths.docs.provider);
  const recommendations = readIfExists(paths.source.recommendations);
  const checks = [
    boolCheck(
      'source_confidence_represented',
      'Source confidence is represented in docs and ranking logic.',
      /source confidence distribution/i.test(provider) && /sourceConfidenceScore/.test(recommendations),
      [rel(root, paths.docs.provider), rel(root, paths.source.recommendations)],
    ),
    boolCheck(
      'provider_limitations_documented',
      'Provider limitations and influence limits are documented.',
      /provider limitations|provider influence|Keep `campopsProviderAdaptersEnabled` off/i.test(provider),
      [rel(root, paths.docs.provider)],
    ),
    boolCheck(
      'region_category_readiness_explicit',
      'Region/category readiness is explicit through provider readiness reports.',
      providerReadiness.missingFiles?.length === 0 && providerReadiness.missingRegion !== true,
      ['docs/campops/provider_readiness_*.md'],
    ),
    boolCheck(
      'provider_source_approved',
      'Provider/source readiness is approved for closed field-test influence or risk-accepted as shadow-only.',
      providerReadiness.passed,
      ['docs/campops/provider_readiness_*.md'],
    ),
  ];

  return gateResult(
    'provider_source',
    'CampOps provider/source gate',
    checks,
    'campops_provider_source_gate_failed',
    providerReadiness.blockers ?? [],
  );
}

function checkAndroidDeviceQaGate(root, paths, androidQa) {
  const mobileQa = readIfExists(paths.docs.mobileQa);
  const checks = [
    boolCheck(
      'android_evidence_doc_present',
      'Android/device QA evidence document exists.',
      Boolean(mobileQa),
      [rel(root, paths.docs.mobileQa)],
    ),
    boolCheck(
      'navigate_mapbox_flows_listed',
      'Android QA packet lists Mapbox render, pin tap, popup scroll/dismiss, save, navigate, and report flows.',
      REQUIRED_ANDROID_NAVIGATE_FLOWS.every((label) => new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(mobileQa)),
      [rel(root, paths.docs.mobileQa)],
    ),
    boolCheck(
      'android_device_evidence_complete',
      'Android/device QA evidence is complete or risk-accepted.',
      androidQa.passed,
      [rel(root, paths.docs.mobileQa)],
    ),
  ];

  return gateResult(
    'android_device_qa',
    'CampOps Android/device QA gate',
    checks,
    'campops_android_device_qa_gate_failed',
    androidQa.blockers ?? [],
  );
}

function campOpsStatusFor({ coreImplementationReady, closedFieldTestReady, riskAccepted }) {
  if (closedFieldTestReady) return 'closed_field_test_ready';
  if (coreImplementationReady) return 'internal_beta_ready';
  return riskAccepted ? 'blocked_pending_risk_acceptance' : 'blocked_pending_risk_acceptance';
}

function statusLabelFor(status, riskAccepted) {
  if (status === 'closed_field_test_ready') return 'Closed field test ready';
  if (status === 'internal_beta_ready') {
    return riskAccepted
      ? 'Internal beta ready; missing closed-field gates risk-accepted for restricted test'
      : 'Internal beta ready; closed field test blocked pending risk acceptance';
  }
  return 'Blocked pending risk acceptance';
}

export function buildCampOpsLiveReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const now = options.now instanceof Date ? options.now : new Date();
  const paths = pathsFor(root);
  const androidQa = buildAndroidQaEvidenceResult({ rootDir: root, now });
  const providerReadiness = buildProviderReadinessResult({ rootDir: root, now });
  const privacyApproval = buildPrivacyStorageApprovalResult({ rootDir: root, now });
  const riskAcceptance = buildClosedFieldTestRiskAcceptanceResult({ rootDir: root, now });

  const gates = [
    checkRenderingGate(root, paths),
    checkScoringGate(root, paths),
    checkSafetyCopyGate(root, paths),
    checkPrivacyStorageGate(root, paths, privacyApproval),
    checkProviderSourceGate(root, paths, providerReadiness),
    checkAndroidDeviceQaGate(root, paths, androidQa),
  ];

  const failedGates = gates.filter((gate) => !gate.passed);
  const coreImplementationReady = gates
    .filter((gate) => ['rendering', 'scoring', 'safety_copy'].includes(gate.id))
    .every((gate) => gate.passed);
  const closedFieldTestReady = failedGates.length === 0;
  const riskAccepted = riskAcceptance.passed === true;
  const blockers = Array.from(new Set(failedGates.map((gate) => gate.blockerId)));
  const activeBlockers = riskAccepted ? [] : blockers;
  const status = campOpsStatusFor({ coreImplementationReady, closedFieldTestReady, riskAccepted });
  const passed = closedFieldTestReady || (riskAccepted && coreImplementationReady);
  const evidenceGateLabels = {
    campops_android_device_qa_gate_failed: 'Android/device QA',
    campops_provider_source_gate_failed: 'provider/source approval',
    campops_privacy_storage_gate_failed: 'privacy/storage approval',
  };
  const unresolvedEvidenceGates = blockers
    .filter((blocker) => evidenceGateLabels[blocker])
    .map((blocker) => evidenceGateLabels[blocker]);
  const riskAcceptanceEvidenceNote = unresolvedEvidenceGates.length > 0
    ? `Risk acceptance permits only a restricted closed field test; it does not approve unresolved gates: ${unresolvedEvidenceGates.join(', ')}.`
    : 'Risk acceptance permits only a restricted closed field test; provider influence, AI assist, telemetry, and community publishing still require separate approval.';

  return {
    passed,
    status,
    statusLabel: statusLabelFor(status, riskAccepted),
    closedFieldTestReady,
    internalBetaReady: coreImplementationReady,
    riskAccepted,
    checkedAt: now.toISOString(),
    gates,
    blockers: activeBlockers,
    riskAcceptedBlockers: riskAccepted ? blockers : [],
    evidence: {
      androidQa: {
        passed: androidQa.passed,
        status: androidQa.status,
        blockers: androidQa.blockers,
      },
      providerReadiness: {
        passed: providerReadiness.passed,
        status: providerReadiness.status,
        blockers: providerReadiness.blockers,
      },
      privacyStorage: {
        passed: privacyApproval.passed,
        status: privacyApproval.status,
        blockers: privacyApproval.blockers,
      },
      riskAcceptance: {
        passed: riskAcceptance.passed,
        status: riskAcceptance.status,
        blockers: riskAcceptance.blockers,
      },
    },
    notes: [
      'Closed-field-test readiness requires every CampOps live gate to pass unless the missing gates are explicitly risk-accepted.',
      riskAcceptanceEvidenceNote,
      'Internal beta readiness here means rendering, scoring, and safety/copy implementation gates pass; it is not closed-field-test approval.',
    ],
  };
}

export function writeCampOpsLiveReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const { smokeDir, resultPath } = pathsFor(root);
  fs.mkdirSync(smokeDir, { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatCampOpsLiveReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `CampOps live-readiness: ${result.statusLabel}`,
    `Result file: ${path.relative(root, pathsFor(root).resultPath)}`,
    `Checked at: ${result.checkedAt}`,
    `Internal beta ready: ${result.internalBetaReady ? 'yes' : 'no'}`,
    `Closed field test ready: ${result.closedFieldTestReady ? 'yes' : 'no'}`,
    `Risk acceptance active: ${result.riskAccepted ? 'yes' : 'no'}`,
    '',
    'Live gates:',
  ];
  for (const gate of result.gates) {
    lines.push(`- ${gate.label}: ${gate.passed ? 'pass' : 'blocked'}`);
    for (const check of gate.checks.filter((item) => !item.passed)) {
      lines.push(`  - ${check.id}: ${check.label}`);
    }
  }
  if (result.blockers.length > 0) {
    lines.push('', 'Active blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.riskAcceptedBlockers.length > 0) {
    lines.push('', 'Risk-accepted blockers:');
    for (const blocker of result.riskAcceptedBlockers) lines.push(`- ${blocker}`);
  }
  lines.push('', 'Notes:');
  for (const note of result.notes) lines.push(`- ${note}`);
  return `${lines.join('\n')}\n`;
}

export function runCampOpsLiveReadinessCli(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const args = options.args ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const jsonOnly = args.includes('--json');
  const result = buildCampOpsLiveReadinessResult({ rootDir: root });
  writeCampOpsLiveReadinessResult(result, { rootDir: root });
  if (jsonOnly) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else stdout.write(formatCampOpsLiveReadinessResult(result, { rootDir: root }));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runCampOpsLiveReadinessCli();
}
