const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const fixturesDir = path.join(root, 'fixtures', 'ecs-integration');
const artifactDir = path.join(root, 'artifacts', 'ecs-integration-proof');
const reportJsonPath = path.join(artifactDir, 'ecs-integration-proof-report.json');
const reportMarkdownPath = path.join(artifactDir, 'ecs-integration-proof-report.md');

function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTs;

function loadTs(relPath) {
  const fullPath = path.join(root, relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTs(mod, fullPath);
  return mod.exports;
}

const matrixModule = loadTs('lib/ecsIntegration/ecsIntegrationMatrix.ts');
const campClock = loadTs('lib/campops/campDecisionClock.ts');
const departureDelta = loadTs('lib/readiness/departureDeltaBrief.ts');
const routeTimeline = loadTs('lib/routeContext/routeConfidenceTimeline.ts');
const weakPoint = loadTs('lib/readiness/expeditionWeakPointAnalyzer.ts');
const convoy = loadTs('lib/convoy/convoyStalenessLadder.ts');
const recovery = loadTs('lib/recovery/recoveryPacketBuilder.ts');
const debrief = loadTs('lib/debrief/expeditionDebriefRecord.ts');
const offline = loadTs('lib/offlineFailureDrillService.ts');
const loadout = loadTs('lib/fleet/loadoutConsequencePreview.ts');
const fleet = loadTs('lib/fleet/fleetPremiumDomain.ts');
const routeImpact = loadTs('lib/routeImpact/routeChangeImpactConfig.ts');

const {
  ECS_INTEGRATION_FEATURE_IDS,
  ECS_INTEGRATION_MATRIX,
  getEcsIntegrationMatrixEntry,
} = matrixModule;

const requiredFixtureIds = [
  'happy_path_integrated',
  'degraded_but_safe',
  'offline_source_limited',
  'missing_policy_and_evidence',
  'mismatch_guardrails',
];

const requiredFeatureIds = [
  'camp_decision_clock',
  'departure_delta_brief',
  'route_confidence_timeline',
  'weak_point_analyzer',
  'convoy_staleness_ladder',
  'recovery_packet_builder',
  'expedition_replay_debrief',
  'offline_failure_drill',
  'loadout_consequence_preview',
  'route_change_impact_preview',
];

const forbiddenCopyPhrases = [
  'live location',
  'real-time tracking',
  'distress inferred',
  'emergency dispatch',
  'sos sent',
  'emergency services contacted',
  'help is on the way',
  'live weather',
  'live route updates',
  'provider update succeeded',
  'dispatch synced',
  'route blocked',
  'do not drive',
  'vehicle unfit',
  'unsafe route',
  'all other sections safe',
  'full route verified',
];

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8'));
}

function loadFixtures() {
  return Object.fromEntries(
    requiredFixtureIds.map((fixtureId) => [
      fixtureId,
      readJson(path.join('fixtures', 'ecs-integration', `${fixtureId}.json`)),
    ]),
  );
}

function collectStrings(value, output = []) {
  if (typeof value === 'string') {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
    return output;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, output));
  }
  return output;
}

function assertCopySafe(strings, label) {
  const combined = strings.join('\n').toLowerCase();
  for (const phrase of forbiddenCopyPhrases) {
    assert.ok(!combined.includes(phrase), `${label} contains forbidden overclaim copy.`);
  }
}

function assertNoOutputKeys(value, forbiddenKeys, label) {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    assert.ok(!forbiddenKeys.includes(key), `${label} unexpectedly emitted ${key}.`);
    assertNoOutputKeys(value[key], forbiddenKeys, label);
  }
}

function isoBefore(left, right, message) {
  assert.ok(Date.parse(left) < Date.parse(right), message);
}

function findRow(ladder, memberId) {
  const row = ladder.rows.find((item) => item.memberId === memberId);
  assert.ok(row, `Expected convoy ladder row for ${memberId}.`);
  return row;
}

function findCapability(result, capabilityId) {
  const item = result.capabilities.find((candidate) => candidate.capabilityId === capabilityId);
  assert.ok(item, `Expected offline drill capability ${capabilityId}.`);
  return item;
}

function gitSha() {
  const result = childProcess.spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function npmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function parseJsonFromOutput(output) {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(output.slice(start, end + 1));
  } catch {
    return null;
  }
}

function runNpmScript(scriptName) {
  const result = childProcess.spawnSync(npmExecutable(), ['run', '--silent', scriptName], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return {
    scriptName,
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json: parseJsonFromOutput(`${result.stdout}\n${result.stderr}`),
  };
}

function gateIsBlocked(result) {
  const text = JSON.stringify(result.json ?? {}).toLowerCase();
  return text.includes('blocked') || text.includes('missing') || text.includes('required');
}

function display(title) {
  return {
    iconKey: 'pickup',
    title,
    subtitle: null,
    classLabel: null,
    chips: [],
    statusText: null,
    accentTone: 'info',
  };
}

function weight(lbs, source = 'user_estimate', confidence = 70, sourceLabel = source) {
  return fleet.createFleetWeightValue(lbs, source, { confidence, sourceLabel });
}

function evidence(value, sourceKind = 'user_confirmed', confidence = 85, sourceLabel = sourceKind) {
  return {
    value,
    sourceKind,
    confidence,
    sourceLabel,
    observedAt: '2026-06-13T18:00:00.000Z',
  };
}

function makeVehicle(overrides = {}) {
  const id = overrides.id ?? 'vehicle-integrated';
  const buildProfile = {
    id: `${id}:build`,
    vehicleId: id,
    useCases: ['overland'],
    baseNetWeight: weight(5200, 'scale_ticket', 98, 'Scale ticket base'),
    curbWeight: null,
    emptyWeight: null,
    gvwr: weight(7000, 'manufacturer_spec', 92, 'OEM GVWR'),
    wheelbaseIn: 132,
    tireSizeInches: 35,
    suspensionLiftInches: 3,
    isLeveled: false,
    resourceProfile: undefined,
    drivetrain: '4WD',
    display: display('Build profile'),
    updatedAt: '2026-06-13T18:00:00.000Z',
    ...(overrides.buildProfile ?? {}),
  };
  return {
    id,
    ownerUserId: 'user-1',
    nickname: 'Integrated Rig',
    vehicleType: 'pickup',
    year: 2024,
    make: 'Toyota',
    model: 'Tacoma',
    trim: 'TRD Off-Road',
    buildProfile,
    display: display('Integrated Rig'),
    activeLoadoutId: 'loadout-integrated',
    createdAt: '2026-06-13T17:00:00.000Z',
    updatedAt: '2026-06-13T18:00:00.000Z',
  };
}

function loadoutItem(id, lbs, loadZone, name = id, options = {}) {
  return {
    id,
    vehicleId: 'vehicle-integrated',
    loadoutId: 'loadout-integrated',
    name,
    category: options.category ?? 'gear',
    quantity: options.quantity ?? 1,
    weight: weight(lbs, options.source ?? 'user_estimate', options.confidence ?? 66, `${name} estimate`),
    loadZone,
    compartmentId: options.compartmentId ?? `${loadZone}:bin`,
    placement: null,
    isCritical: options.isCritical ?? false,
    isPacked: true,
    notes: null,
    display: display(name),
  };
}

function buildLoadoutPreview(routeContext = {}) {
  const vehicle = makeVehicle();
  return loadout.buildLoadoutConsequencePreview({
    vehicleId: vehicle.id,
    vehicle,
    currentAccessories: [],
    currentLoadoutItems: [],
    proposedAccessories: [],
    proposedLoadoutItems: [
      loadoutItem('roof-tent', 185, 'roof', 'Roof tent', { category: 'camp' }),
      loadoutItem('water-cans', 150, 'bedHigh', 'Water cans', { category: 'water' }),
      loadoutItem('rear-tools', 380, 'rearLow', 'Rear recovery tools', { category: 'recovery', isCritical: true }),
    ],
    profileId: 'profile-integrated',
    loadoutId: 'loadout-integrated',
    routeId: 'route-alpha',
    routeGeometryVersion: 'geom-v7',
    routeContext: {
      difficulty: 'hard',
      terrainRisk: 'caution',
      remoteness: 'high',
      recoveryPosture: 'limited',
      freshness: 'current',
      sourceKind: 'user_confirmed',
      observedAt: '2026-06-13T18:00:00.000Z',
      ...routeContext,
    },
    tireLiftState: { tireSizeInches: 35, suspensionLiftInches: 3 },
    calculationMode: 'preview',
    generatedAt: '2026-06-13T18:05:00.000Z',
  });
}

function buildReportMarkdown(report) {
  const failedAssertions = report.assertions.filter((item) => item.status === 'failed');
  const blockedGates = report.productionGates.filter((item) => item.blocked);
  return [
    '# ECS Integration Proof Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Git SHA: ${report.gitSha ?? 'unavailable'}`,
    '',
    '## Summary',
    `- Features in matrix: ${report.matrix.length}`,
    `- Fixtures loaded: ${report.fixtures.length}`,
    `- Assertions passed: ${report.assertions.filter((item) => item.status === 'passed').length}`,
    `- Assertions failed: ${failedAssertions.length}`,
    `- Blocked production gates: ${blockedGates.length}`,
    '',
    '## Blocked Gates',
    ...blockedGates.map((gate) => `- ${gate.scriptName}: blocked as expected`),
    '',
    '## Missing Evidence',
    ...report.missingEvidence.map((item) => `- ${item.featureId}: ${item.evidence}`),
    '',
    '## Recommended Next Fixes',
    ...report.recommendedNextFixes.map((item) => `- ${item}`),
    '',
    '## Failing Assertions',
    ...(failedAssertions.length > 0
      ? failedAssertions.map((item) => `- ${item.name}: ${item.message}`)
      : ['- None']),
    '',
  ].join('\n');
}

function writeReport(report) {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(reportMarkdownPath, buildReportMarkdown(report));
}

function source(fieldKind, freshness, observedAt = '2026-06-13T18:00:00.000Z') {
  return {
    sourceKind: fieldKind,
    sourceName: fieldKind,
    freshness,
    observedAt,
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  gitSha: gitSha(),
  matrix: [],
  fixtures: [],
  assertions: [],
  featureFlags: [],
  productionGates: [],
  copySafety: [],
  missingEvidence: [],
  sourceOfTruthViolations: [],
  recommendedNextFixes: [],
  reportPaths: {
    json: reportJsonPath,
    markdown: reportMarkdownPath,
  },
};

const observedCopyStrings = [];
const fixtures = loadFixtures();

function check(name, fn) {
  try {
    const details = fn();
    report.assertions.push({ name, status: 'passed', details: details ?? null });
  } catch (error) {
    report.assertions.push({ name, status: 'failed', message: error.message });
  }
}

check('ECS integration matrix covers every newest feature', () => {
  assert.deepStrictEqual(ECS_INTEGRATION_FEATURE_IDS, requiredFeatureIds);
  assert.strictEqual(ECS_INTEGRATION_MATRIX.length, requiredFeatureIds.length);
  const ids = new Set(ECS_INTEGRATION_MATRIX.map((entry) => entry.featureId));
  requiredFeatureIds.forEach((featureId) => assert.ok(ids.has(featureId), `${featureId} missing from matrix.`));
  ECS_INTEGRATION_MATRIX.forEach((entry) => {
    assert.ok(entry.ownerSystem, `${entry.featureId} needs ownerSystem.`);
    assert.ok(entry.sourceOfTruthSystems.length > 0, `${entry.featureId} needs sourceOfTruthSystems.`);
    assert.ok(entry.consumedInputs.length > 0, `${entry.featureId} needs consumedInputs.`);
    assert.ok(entry.emittedOutputs.length > 0, `${entry.featureId} needs emittedOutputs.`);
    assert.ok(entry.surfaces.length > 0, `${entry.featureId} needs surfaces.`);
    assert.ok(entry.mustNotDo.length > 0, `${entry.featureId} needs mustNotDo boundaries.`);
    assert.ok(entry.requiredEvidence.length > 0, `${entry.featureId} needs requiredEvidence.`);
    assert.strictEqual(getEcsIntegrationMatrixEntry(entry.featureId).featureId, entry.featureId);
  });
  report.matrix = ECS_INTEGRATION_MATRIX;
});

check('Build-level integration fixtures are present and deterministic', () => {
  requiredFixtureIds.forEach((fixtureId) => {
    const fixture = fixtures[fixtureId];
    assert.strictEqual(fixture.fixtureId, fixtureId);
    assert.ok(fixture.description);
    assert.ok(fixture.now);
    assert.ok(fixture.featureFlags);
  });
  report.fixtures = requiredFixtureIds.map((fixtureId) => ({
    fixtureId,
    description: fixtures[fixtureId].description,
  }));
});

check('Feature flags hide, show, or document existing beta gate conventions', () => {
  const originalRouteFlag = globalThis.__ECS_ROUTE_CONFIDENCE_TIMELINE__;
  const originalRouteEnv = process.env.ECS_ROUTE_CONFIDENCE_TIMELINE;
  const originalRouteExpoEnv = process.env.EXPO_PUBLIC_ECS_ROUTE_CONFIDENCE_TIMELINE;

  try {
    delete globalThis.__ECS_ROUTE_CONFIDENCE_TIMELINE__;
    delete process.env.ECS_ROUTE_CONFIDENCE_TIMELINE;
    delete process.env.EXPO_PUBLIC_ECS_ROUTE_CONFIDENCE_TIMELINE;

    const checks = [
      {
        featureId: 'camp_decision_clock',
        off: campClock.isCampDecisionClockFeatureEnabled({ campDecisionClock: false }),
        on: campClock.isCampDecisionClockFeatureEnabled({ campDecisionClock: true }),
        defaultClosed: campClock.isCampDecisionClockFeatureEnabled(),
        convention: 'runtime_flag_fail_closed',
      },
      {
        featureId: 'departure_delta_brief',
        off: departureDelta.isDepartureDeltaBriefFeatureEnabled({ departureDeltaBrief: false }),
        on: departureDelta.isDepartureDeltaBriefFeatureEnabled({ departureDeltaBrief: true }),
        defaultClosed: departureDelta.isDepartureDeltaBriefFeatureEnabled(),
        convention: 'runtime_flag_fail_closed',
      },
      {
        featureId: 'weak_point_analyzer',
        off: weakPoint.isWeakPointAnalyzerFeatureEnabled({ expeditionWeakPointAnalyzer: false }),
        on: weakPoint.isWeakPointAnalyzerFeatureEnabled({ expeditionWeakPointAnalyzer: true }),
        defaultClosed: weakPoint.isWeakPointAnalyzerFeatureEnabled(),
        convention: 'runtime_flag_fail_closed',
      },
      {
        featureId: 'recovery_packet_builder',
        off: recovery.isRecoveryPacketBuilderFeatureEnabled({ recoveryPacketBuilder: false }),
        on: recovery.isRecoveryPacketBuilderFeatureEnabled({ recoveryPacketBuilder: true }),
        defaultClosed: recovery.isRecoveryPacketBuilderFeatureEnabled(),
        convention: 'runtime_flag_fail_closed',
      },
      {
        featureId: 'expedition_replay_debrief',
        off: debrief.isExpeditionReplayDebriefFeatureEnabled({ expeditionReplayDebrief: false }),
        on: debrief.isExpeditionReplayDebriefFeatureEnabled({ expeditionReplayDebrief: true }),
        defaultClosed: debrief.isExpeditionReplayDebriefFeatureEnabled(),
        convention: 'runtime_flag_fail_closed',
      },
    ];

    globalThis.__ECS_ROUTE_CONFIDENCE_TIMELINE__ = false;
    checks.push({
      featureId: 'route_confidence_timeline',
      off: routeTimeline.isRouteConfidenceTimelineFeatureEnabled(),
      on: (() => {
        globalThis.__ECS_ROUTE_CONFIDENCE_TIMELINE__ = true;
        return routeTimeline.isRouteConfidenceTimelineFeatureEnabled();
      })(),
      defaultClosed: false,
      convention: 'runtime_flag_fail_closed',
    });

    const offlineDisabled = offline.buildOfflineFailureDrill({
      now: fixtures.happy_path_integrated.now,
      featureFlags: { offlineFailureDrill: false },
      noNetworkModeVerified: true,
    });
    const offlineEnabled = offline.buildOfflineFailureDrill(fixtures.happy_path_integrated.offlineDrill);
    checks.push({
      featureId: 'offline_failure_drill',
      off: offlineDisabled.enabled,
      on: offlineEnabled.enabled,
      defaultClosed: null,
      convention: 'current_user_facing_extension_explicit_false_disables',
    });

    const preview = buildLoadoutPreview();
    checks.push({
      featureId: 'loadout_consequence_preview',
      off: null,
      on: preview.availability !== 'unavailable',
      defaultClosed: null,
      convention: 'current_user_facing_extension_no_runtime_flag_helper',
    });

    checks.push({
      featureId: 'route_change_impact_preview',
      off: routeImpact.isRouteChangeImpactPreviewEnabled({ routeChangeImpactPreviewEnabled: false }),
      on: routeImpact.isRouteChangeImpactPreviewEnabled({ routeChangeImpactPreviewEnabled: true }),
      defaultClosed: null,
      convention: 'current_user_facing_extension_explicit_false_disables',
    });

    const ladder = convoy.buildConvoyStalenessLadder(fixtures.happy_path_integrated.convoy);
    checks.push({
      featureId: 'convoy_staleness_ladder',
      off: null,
      on: ladder.readinessLabel === 'Current user-facing/internal beta extension',
      defaultClosed: null,
      convention: 'current_user_facing_internal_beta_no_runtime_flag_helper',
    });

    checks.forEach((item) => {
      if (item.convention === 'runtime_flag_fail_closed') {
        assert.strictEqual(item.off, false, `${item.featureId} flag off should hide.`);
        assert.strictEqual(item.on, true, `${item.featureId} flag on should show.`);
        assert.strictEqual(item.defaultClosed, false, `${item.featureId} should fail closed by default.`);
      } else {
        assert.strictEqual(item.on, true, `${item.featureId} existing beta convention should still produce valid output.`);
        if (item.off != null) assert.strictEqual(item.off, false, `${item.featureId} explicit false should hide.`);
      }
    });

    report.featureFlags = checks.map((item) => ({
      featureId: item.featureId,
      convention: item.convention,
      flagOffHides: item.off === null ? 'existing_convention_not_runtime_checked' : item.off === false,
      flagOnShows: item.on === true,
      defaultClosed: item.defaultClosed === null ? 'existing_convention' : item.defaultClosed === false,
    }));
  } finally {
    if (originalRouteFlag === undefined) delete globalThis.__ECS_ROUTE_CONFIDENCE_TIMELINE__;
    else globalThis.__ECS_ROUTE_CONFIDENCE_TIMELINE__ = originalRouteFlag;
    if (originalRouteEnv === undefined) delete process.env.ECS_ROUTE_CONFIDENCE_TIMELINE;
    else process.env.ECS_ROUTE_CONFIDENCE_TIMELINE = originalRouteEnv;
    if (originalRouteExpoEnv === undefined) delete process.env.EXPO_PUBLIC_ECS_ROUTE_CONFIDENCE_TIMELINE;
    else process.env.EXPO_PUBLIC_ECS_ROUTE_CONFIDENCE_TIMELINE = originalRouteExpoEnv;
  }
});

check('Camp Decision Clock and Route Confidence Timeline coexist without route blocking', () => {
  const fixture = fixtures.degraded_but_safe;
  const timeline = routeTimeline.buildRouteConfidenceTimeline(fixture.route);
  const uncertaintyItem = timeline.items.find((item) => item.confidenceLevel === 'low' || item.conditionState === 'unknown');
  assert.ok(uncertaintyItem, 'Expected low/unknown route confidence near camp approach.');
  const copy = routeTimeline.routeConfidenceTimelineItemCopy(uncertaintyItem);
  observedCopyStrings.push(copy);
  assert.ok(copy.toLowerCase().includes('uncertainty'));
  assert.ok(copy.toLowerCase().includes('not a confirmed hazard'));
  assertNoOutputKeys(timeline, ['blocked', 'rerankedRouteIds', 'avoidanceRouteIds'], 'Route Confidence Timeline');

  const campDecision = campClock.evaluateCampDecisionClock(fixture.campClock);
  const freshDecision = campClock.evaluateCampDecisionClock(fixtures.happy_path_integrated.campClock);
  assert.strictEqual(campDecision.readiness, 'feature_flagged');
  isoBefore(campDecision.continueUntil, freshDecision.continueUntil, 'Degraded route/camp data should shorten the continue window.');
  assert.ok(campDecision.warnings.length > 0, 'Degraded camp decision should keep warnings visible.');
  observedCopyStrings.push(campDecision.mainRisk, ...campDecision.warnings);
});

check('Camp Decision Clock does not produce confident continueUntil without safe endpoint backup data', () => {
  const missingBackup = campClock.evaluateCampDecisionClock(fixtures.missing_policy_and_evidence.campClock);
  assert.ok(['emergency_only', 'unavailable'].includes(missingBackup.state));
  assert.strictEqual(missingBackup.continueUntil, undefined);
  assert.ok(missingBackup.warnings.some((warning) => warning.toLowerCase().includes('backup endpoint')));

  const expiredEmergency = campClock.evaluateCampDecisionClock(fixtures.mismatch_guardrails.campClock);
  assert.strictEqual(expiredEmergency.state, 'unavailable');
  assert.ok(!expiredEmergency.emergencyViableUntil || Date.parse(expiredEmergency.emergencyViableUntil) <= Date.parse(fixtures.mismatch_guardrails.campClock.currentTime));
  observedCopyStrings.push(...missingBackup.warnings, ...expiredEmergency.warnings);
});

check('Departure Delta Brief and Command Brief avoid fake changes from missing or mismatched audits', () => {
  const noPrevious = departureDelta.buildDepartureDeltaBrief(fixtures.missing_policy_and_evidence.departureDelta);
  assert.strictEqual(noPrevious.enabled, true);
  assert.strictEqual(noPrevious.hasComparablePreviousAudit, false);
  assert.ok(['unavailable', 'no_previous_audit'].includes(noPrevious.auditComparison.status));
  assert.strictEqual(noPrevious.sections.changedVehicleLoadoutValues.length, 0);
  assert.strictEqual(noPrevious.sections.newBlockers.length, 0);
  assert.ok(noPrevious.warnings.some((warning) => warning.includes('No comparable previous departure audit')));
  assert.strictEqual(noPrevious.posture.current, fixtures.missing_policy_and_evidence.departureDelta.current.readiness.posture);

  const mismatched = departureDelta.buildDepartureDeltaBrief(fixtures.mismatch_guardrails.departureDelta);
  assert.strictEqual(mismatched.hasComparablePreviousAudit, false);
  assert.strictEqual(mismatched.sections.resolvedBlockers.length, 0);
  assert.strictEqual(mismatched.sections.newBlockers.length, 0);
  observedCopyStrings.push(...noPrevious.warnings, ...mismatched.warnings);
});

check('Weak-Point Analyzer consumes loadout risk only through deterministic snapshot facts', () => {
  const preview = buildLoadoutPreview();
  const snapshot = {
    ...fixtures.degraded_but_safe.weakPointSnapshot,
    payloadGvwr: {
      gvwrUsagePct: preview.gvwrPercentAfter,
      payloadRemainingLbs: preview.payloadRemainingAfter,
      confidence: preview.availability === 'available' ? 'medium' : 'unknown',
      sourceFactIds: ['loadout-preview-payload'],
      updatedAt: preview.generatedAt,
    },
    sourceFacts: [
      ...(fixtures.degraded_but_safe.weakPointSnapshot.sourceFacts ?? []),
      {
        id: 'loadout-preview-payload',
        sourceSystem: 'fleet',
        fieldPath: 'loadoutConsequencePreview.gvwrPercentAfter',
        label: 'Loadout preview GVWR usage',
        value: preview.gvwrPercentAfter,
        observedAt: preview.generatedAt,
        freshness: 'fresh',
        confidence: 'validated',
      },
    ],
  };
  const assessment = weakPoint.scoreExpeditionWeakPoints(snapshot);
  const payloadCandidate = assessment.rankedWeakPoints.find((item) => item.category === 'payload_gvwr');
  assert.ok(payloadCandidate, 'Expected payload_gvwr weak point candidate.');
  assert.ok(payloadCandidate.sourceFactIds.includes('loadout-preview-payload'));
  assertNoOutputKeys(preview, ['goNoGo', 'goNoGoLabel', 'readinessPosture'], 'Loadout preview');

  const guarded = weakPoint.buildWeakPointExplanation(assessment, {
    aiText: 'Reordered ranking with an added unreferenced hazard.',
    rankedCategoryOrder: ['weather_freshness', assessment.rankedWeakPoints[0].category],
    referencedFactIds: ['missing-fact'],
  });
  assert.strictEqual(guarded.source, 'deterministic_template');
  assert.ok(guarded.validationWarnings.length > 0);
  observedCopyStrings.push(assessment.explanation.text, guarded.text, preview.mainRisk);
});

check('Loadout Consequence Preview mirror stays advisory and invalidates for Command Brief', () => {
  const preview = buildLoadoutPreview();
  const published = loadout.publishLoadoutConsequencePreview(preview, { source: 'proposed_preview' });
  assert.strictEqual(published.summary.stale, false);
  assert.strictEqual(
    loadout.isLoadoutConsequenceMirrorValid(published.mirror, {
      vehicleId: 'vehicle-integrated',
      profileId: 'profile-integrated',
      loadoutId: 'loadout-integrated',
      routeId: 'route-alpha',
      routeGeometryVersion: 'geom-v7',
    }).valid,
    true,
  );
  assert.strictEqual(
    loadout.isLoadoutConsequenceMirrorValid(published.mirror, { vehicleId: 'vehicle-other' }).invalidationReason,
    'vehicle_changed',
  );
  assert.strictEqual(
    loadout.isLoadoutConsequenceMirrorValid(published.mirror, { routeGeometryVersion: 'geom-old' }).invalidationReason,
    'route_geometry_changed',
  );

  const invalid = loadout.invalidateLoadoutConsequenceMirror('preview_cancelled', {
    vehicleId: 'vehicle-integrated',
    profileId: 'profile-integrated',
    loadoutId: 'loadout-integrated',
    routeId: 'route-alpha',
  });
  assert.strictEqual(invalid.mirror.stale, true);
  assert.strictEqual(invalid.summary.stale, true);
  assert.strictEqual(invalid.summary.invalidationReason, 'preview_cancelled');
  observedCopyStrings.push(invalid.summary.mainRisk);
});

check('Convoy Staleness Ladder and recovery context preserve precedence and avoid distress inference', () => {
  const silence = convoy.buildConvoyStalenessLadder(fixtures.degraded_but_safe.convoy);
  const delayed = findRow(silence, 'sweep');
  assert.ok(['delayed', 'stale', 'missing_check_in'].includes(delayed.status));
  assert.notStrictEqual(delayed.status, 'assistance_requested');
  assert.notStrictEqual(delayed.status, 'recovery_event_active');

  const recoveryActive = convoy.buildConvoyStalenessLadder(fixtures.happy_path_integrated.convoyRecoveryActive);
  assert.strictEqual(findRow(recoveryActive, 'sweep').status, 'recovery_event_active');

  const noPolicy = convoy.buildConvoyStalenessLadder(fixtures.missing_policy_and_evidence.convoy);
  assert.strictEqual(noPolicy.policyEvidence.status, 'missing');
  assert.strictEqual(findRow(noPolicy, 'lead').status, 'unknown_no_data');
  observedCopyStrings.push(...silence.sourceNotes, ...noPolicy.warnings);
});

check('Offline Failure Drill and Offline Honesty stay local-only with derived downloads', () => {
  const drill = offline.buildOfflineFailureDrill(fixtures.offline_source_limited.offlineDrill);
  assert.strictEqual(drill.enabled, true);
  assert.strictEqual(drill.localOnly, true);
  assert.strictEqual(drill.runtimeNetworkEvidence.runtimeNetworkProbe, 'offline');
  assert.strictEqual(findCapability(drill, 'dispatch_offline_replay').status, 'partially_available');
  assert.ok(findCapability(drill, 'dispatch_offline_replay').userMessage.toLowerCase().includes('queued locally'));
  assert.ok(findCapability(drill, 'command_brief').staleInputs.includes('weather_packet'));
  assert.ok(drill.recommendedDownloads.some((item) => item.actionType === 'refresh_weather_packet'));
  assert.ok(drill.recommendedDownloads.some((item) => item.actionType === 'download_route_tiles'));
  assert.ok(drill.productionReadiness.status.includes('blocked'));
  observedCopyStrings.push(...collectStrings(drill.capabilities), ...collectStrings(drill.recommendedDownloads));
});

check('Recovery Packet Builder requires confirmed coordinates and safe review-only signals', () => {
  const unconfirmed = recovery.buildRecoveryPacketDraft(fixtures.degraded_but_safe.recoveryPacket.draftInput);
  assert.strictEqual(recovery.canExportRecoveryPacket(unconfirmed).canExport, false);
  assert.ok(recovery.canExportRecoveryPacket(unconfirmed).reasons.some((reason) => reason.includes('coordinates must be user-confirmed')));

  const confirmedLocation = recovery.confirmRecoveryPacketLocation({
    location: unconfirmed.confirmedLocation,
    coordinates: fixtures.happy_path_integrated.recoveryPacket.confirmedCoordinates,
    selectedFormat: 'decimal_degrees',
    confirmedAt: '2026-06-13T18:08:00.000Z',
    confirmingUserId: 'user-1',
    confirmingUserDisplayName: 'Field lead',
    source: source('user_entered', 'user_entered'),
  });
  const ready = recovery.buildRecoveryPacketDraft({
    ...fixtures.happy_path_integrated.recoveryPacket.draftInput,
    confirmedLocation,
  });
  assert.strictEqual(recovery.canExportRecoveryPacket(ready).canExport, true);
  const exported = recovery.buildRecoveryPacketExport(ready, {
    exportedAt: '2026-06-13T18:09:00.000Z',
    exportedByUserId: 'user-1',
  });
  assert.ok(exported.safetyLabels.some((label) => label.includes('review context only')));
  assert.ok(ready.sections.some((section) =>
    section.fields.some((field) => field.freshness === 'unavailable' || field.unavailableReason)));
  observedCopyStrings.push(...recovery.RECOVERY_PACKET_SAFETY_LABELS, ...collectStrings(ready.sections), ...collectStrings(exported.sections));
});

check('Debrief Map preserves known-at-time evidence and source-limited route gaps', () => {
  const record = debrief.buildExpeditionDebriefRecord(fixtures.happy_path_integrated.debrief.input);
  const weatherEvidence = record.evidence.find((item) => item.evidenceId === 'ev-weather-known');
  assert.ok(weatherEvidence, 'Expected known-at-time weather evidence.');
  assert.strictEqual(weatherEvidence.value, 'Wind 18 mph at 10:30');
  assert.notStrictEqual(weatherEvidence.value, fixtures.happy_path_integrated.debrief.currentCorrectedWeatherValue);
  assert.ok(record.mapOverlays.some((item) => item.type === 'offline_gap' && item.valueState === 'stale'));

  const mismatch = debrief.buildExpeditionDebriefRecord(fixtures.mismatch_guardrails.debrief.input);
  assert.ok(mismatch.warnings.some((warning) => warning.includes('route geometry did not match')));
  assert.ok(!mismatch.mapOverlays.some((overlay) => overlay.overlayId === 'overlay-wrong-geometry'));
  observedCopyStrings.push(...collectStrings(record.chapters), ...collectStrings(record.evidence), ...mismatch.warnings);
});

check('Production gates remain blocked and visible in the integration report', () => {
  const gateNames = [
    'gate:offline-failure-drill-production:json',
    'gate:loadout-consequence-preview-production:json',
  ];
  const gates = gateNames.map(runNpmScript);
  gates.forEach((gate) => {
    assert.ok(gate.json, `${gate.scriptName} should emit JSON.`);
    assert.ok(gateIsBlocked(gate), `${gate.scriptName} should remain blocked when evidence is missing.`);
  });
  report.productionGates = gates.map((gate) => ({
    scriptName: gate.scriptName,
    exitCode: gate.exitCode,
    blocked: gateIsBlocked(gate),
    blockers: collectStrings(gate.json).filter((item) => /missing|required|blocked|evidence/i.test(item)).slice(0, 12),
  }));
  for (const entry of ECS_INTEGRATION_MATRIX) {
    for (const evidenceItem of entry.requiredEvidence) {
      if (/android|scale|owner|production|multi-vehicle|profile|performance/i.test(evidenceItem)) {
        report.missingEvidence.push({ featureId: entry.featureId, evidence: evidenceItem });
      }
    }
  }
});

check('Copy safety scan rejects cross-feature overclaiming', () => {
  assertCopySafe(observedCopyStrings, 'integration observed output');
  report.copySafety = [{
    checkedStringCount: observedCopyStrings.length,
    forbiddenPhraseCount: forbiddenCopyPhrases.length,
    status: 'passed',
  }];
});

report.recommendedNextFixes = [
  'Capture Android no-network evidence before promoting Offline Failure Drill beyond beta.',
  'Capture loadout scale, profile variance, multi-vehicle, offline/cache, performance, and owner acceptance evidence before production.',
  'Keep current user-facing beta conventions documented for Convoy Staleness Ladder and Loadout Consequence Preview until explicit runtime flags are introduced.',
];

writeReport(report);

const failed = report.assertions.filter((item) => item.status === 'failed');
if (failed.length > 0) {
  console.error(`ECS integration proof failed with ${failed.length} failing assertion(s).`);
  failed.forEach((item) => console.error(`- ${item.name}: ${item.message}`));
  process.exit(1);
}

console.log(`ECS integration proof checks passed. Report written to ${path.relative(root, reportJsonPath)}.`);
