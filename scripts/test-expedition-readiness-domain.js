const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  if (request === 'expo-file-system' || request === 'expo-file-system/legacy') {
    return {};
  }
  if (request === 'expo-secure-store') {
    return {
      getItemAsync: async () => null,
      setItemAsync: async () => undefined,
      deleteItemAsync: async () => undefined,
    };
  }
  if (request === 'expo-constants') {
    return { default: { expoConfig: {}, manifest: null } };
  }
  if (request === 'expo-modules-core') {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const readiness = require(path.join(root, 'lib', 'readiness'));
const smokeChecks = require(path.join(root, 'lib', 'ai', 'runtimeSmokeChecks.ts'));
const aiGuardrails = require(path.join(root, 'lib', 'ai', 'readinessExplanationGuardrails.ts'));

const expectedCategories = [
  'vehicle_fit',
  'route_risk',
  'camp_legality_confidence',
  'weather_window',
  'daylight_margin',
  'offline_preparedness',
  'fuel_range_margin',
  'power_runtime',
  'recovery_bailout_access',
  'communications_signal_confidence',
];

function assertAssessmentShape(assessment) {
  assert.ok(['unknown', 'dayTrip', 'overnightCamp', 'weekendExpedition', 'remoteExpedition', 'recoveryUtilityRoute'].includes(assessment.tripIntent));
  assert.ok(['selected', 'ecs_inferred', 'unknown'].includes(assessment.tripIntentSource));
  assert.ok(['dayTrip', 'overnight', 'weekendExpedition', 'remoteExpedition', 'recoveryUtilityRoute', 'unknown'].includes(assessment.readinessProfile));
  assert.ok(assessment.calibration);
  assert.strictEqual(assessment.calibration.profile, assessment.readinessProfile);
  assert.ok(Number.isFinite(assessment.calibration.thresholds.ready));
  assert.ok(Number.isFinite(assessment.calibration.thresholds.caution));
  assert.ok(Number.isFinite(assessment.overallScore));
  assert.ok(assessment.overallScore >= 0 && assessment.overallScore <= 100);
  assert.ok(['ready', 'caution', 'hold'].includes(assessment.status));
  assert.ok(['high', 'medium', 'low'].includes(assessment.confidence));
  assert.ok(assessment.updatedAt);
  assert.strictEqual(assessment.categories.length, 10);
  assert.deepStrictEqual(assessment.categories.map((category) => category.id), expectedCategories);
  assert.ok(Array.isArray(assessment.blockers));
  assert.ok(Array.isArray(assessment.warnings));
  assert.ok(Array.isArray(assessment.recommendations));
  assert.ok(assessment.recoveryBrief, 'Assessment should include a recovery brief payload.');
  assert.ok(typeof assessment.recoveryBrief.nearestBailoutSummary === 'string');
  assert.ok(['complete', 'caution', 'missing', 'unavailable'].includes(assessment.recoveryBrief.emergencyCoordinatePacketStatus));
  assert.ok(assessment.powerBrief, 'Assessment should include a power brief payload.');
  assert.ok(['Ready', 'Caution', 'Unknown'].includes(assessment.powerBrief.statusLabel));
  assert.ok(assessment.explanation.length > 0);
  for (const category of assessment.categories) {
    assert.ok(category.score >= 0 && category.score <= 100, `${category.id} score should be 0-100.`);
    assert.ok(['ready', 'caution', 'hold'].includes(category.status));
    assert.ok(Array.isArray(category.factors));
    assert.ok(Array.isArray(category.missingInputs));
    assert.ok(category.lastUpdatedAt);
  }
}

const ready = readiness.buildExpeditionReadiness(readiness.completeReadyReadinessFixture);
assertAssessmentShape(ready);
assert.strictEqual(ready.status, 'ready');
assert.strictEqual(ready.blockers.length, 0);
assert.ok(ready.recoveryBrief.nearestBailoutSummary.includes('Mineral Bottom Road'));
assert.ok(!/official emergency contact:|call ranger/i.test(ready.recoveryBrief.officialContactSummary), 'Recovery brief must not fabricate official contact instructions.');
assert.strictEqual(ready.powerBrief.statusLabel, 'Ready');
assert.ok(ready.powerBrief.runtimeSummary.includes('28 h'));
assert.ok(ready.powerBrief.stateOfChargeSummary.includes('86%'));
assert.ok(ready.powerBrief.flowSummary.includes('Input 210W / Output 84W / Net +286W'));
assert.ok(ready.powerBrief.solarSummary.includes('160W solar input'));
assert.strictEqual(readiness.getReadinessDecisionLabel(ready.status), 'Ready');
assert.strictEqual(readiness.getReadinessColorToken(ready.status), 'status.ready');
assert.ok(readiness.getReadinessShortCopy(ready).includes('ECS Intelligence'));

const partial = readiness.buildExpeditionReadiness(readiness.partialReadinessFixture);
assertAssessmentShape(partial);
assert.notStrictEqual(partial.status, 'ready');
assert.ok(partial.confidence === 'low');
assert.ok(readiness.selectReadinessMissingInputs(partial).includes('Route plan'));
assert.ok(partial.dataIntegrity.usesDemoData, 'Demo fixture should be marked as demo data.');
assert.ok(!partial.explanation.includes('legal campsite'), 'Readiness copy must not guarantee legal campsite status.');

const hold = readiness.buildExpeditionReadiness(readiness.holdReadinessFixture);
assertAssessmentShape(hold);
assert.strictEqual(hold.status, 'hold');
assert.ok(hold.blockers.length > 0);
assert.ok(hold.explanation.startsWith('Hold.'));

const holdExplanationPayload = aiGuardrails.buildReadinessExplanationPayload(hold);
assert.strictEqual(holdExplanationPayload.status, 'hold');
assert.strictEqual(holdExplanationPayload.score, hold.overallScore);
assert.ok(holdExplanationPayload.assessmentId.includes('readiness:'));
assert.ok(holdExplanationPayload.topFactors.length > 0);
assert.ok(holdExplanationPayload.blockers.length > 0);
assert.ok(Array.isArray(holdExplanationPayload.allowedClaims));
assert.ok(Array.isArray(holdExplanationPayload.prohibitedClaims));
assert.ok(
  holdExplanationPayload.prohibitedClaims.some((claim) => /legal/i.test(claim)),
  'Readiness AI guardrails should prohibit unsupported camp legality claims.',
);
assert.ok(
  holdExplanationPayload.groundedSummary.includes('ECS Intelligence'),
  'Readiness explanation payload should provide grounded ECS Intelligence copy.',
);
assert.ok(
  aiGuardrails.validateReadinessExplanationOutput(
    holdExplanationPayload,
    'This route is safe and this is a legal campsite. Good to go.',
  ).some((issue) => issue.code === 'ai_summary_legal_campsite_claim'),
  'Readiness AI guardrails should flag legal campsite guarantees.',
);

const empty = readiness.buildExpeditionReadiness({});
assertAssessmentShape(empty);
assert.strictEqual(empty.categories.length, 10);
assert.ok(empty.categories.every((category) => category.missingInputs.length > 0 || category.factors.length > 0));

const localNoPower = readiness.buildExpeditionReadiness({
  readinessProfile: 'dayTrip',
  capturedAt: '2026-05-13T18:00:00.000Z',
  route: {
    routeId: 'local-scout',
    name: 'Local Scout',
    distanceMiles: 8,
    difficulty: 'easy',
    riskLevel: 'low',
    routeConfidence: 'medium',
    source: 'manual',
    updatedAt: '2026-05-13T18:00:00.000Z',
  },
  power: {
    connectedSourceAvailable: false,
    connectionState: 'unavailable',
    dataFreshness: 'unknown',
    runtimeSource: 'unavailable',
    powerRelevantForTrip: false,
    powerNeedReason: 'Short/local trip context does not require connected power telemetry.',
    source: 'unknown',
    updatedAt: '2026-05-13T18:00:00.000Z',
  },
});
assert.notStrictEqual(
  localNoPower.categories.find((category) => category.id === 'power_runtime').status,
  'hold',
  'Missing connected power should not force HOLD for short/local trips.',
);
assert.strictEqual(localNoPower.powerBrief.statusLabel, 'Unknown');

const localDayTrip = readiness.buildExpeditionReadiness(readiness.localDayTripNoCampFixture);
assertAssessmentShape(localDayTrip);
assert.strictEqual(localDayTrip.tripIntent, 'dayTrip');
assert.strictEqual(localDayTrip.readinessProfile, 'dayTrip');
const localDayTripAsOvernight = readiness.buildExpeditionReadiness({
  ...readiness.localDayTripNoCampFixture,
  tripIntent: 'overnightCamp',
  tripIntentSource: 'selected',
  readinessProfile: null,
});
assert.ok(
  localDayTrip.overallScore > localDayTripAsOvernight.overallScore,
  'Day trip calibration should reduce unfair camp/power penalties when no camp or power plan applies.',
);
assert.ok(
  localDayTrip.categories.find((category) => category.id === 'camp_legality_confidence').score >= 82,
  'Day trips without a camp plan should not be penalized as if camp legality data were missing.',
);
assert.ok(
  localDayTrip.categories.find((category) => category.id === 'power_runtime').score >= 82,
  'Day trips without connected power should not be penalized as power-critical.',
);

const overnight = readiness.buildExpeditionReadiness(readiness.overnightDispersedCampingFixture);
const overnightAsDayTrip = readiness.buildExpeditionReadiness({
  ...readiness.overnightDispersedCampingFixture,
  tripIntent: 'dayTrip',
  tripIntentSource: 'selected',
  readinessProfile: 'dayTrip',
});
assertAssessmentShape(overnight);
assert.strictEqual(overnight.tripIntent, 'overnightCamp');
assert.strictEqual(overnight.readinessProfile, 'overnight');
assert.ok(
  overnight.calibration.weights.camp_legality_confidence > overnightAsDayTrip.calibration.weights.camp_legality_confidence,
  'Overnight calibration should weight camp confidence more heavily than day trip calibration.',
);
assert.ok(
  overnight.calibration.weights.power_runtime > overnightAsDayTrip.calibration.weights.power_runtime,
  'Overnight calibration should weight power more heavily than day trip calibration.',
);

const remoteMultiDay = readiness.buildExpeditionReadiness(readiness.remoteMultiDayRouteFixture);
assertAssessmentShape(remoteMultiDay);
assert.strictEqual(remoteMultiDay.tripIntent, 'remoteExpedition');
assert.strictEqual(remoteMultiDay.readinessProfile, 'remoteExpedition');
assert.ok(remoteMultiDay.calibration.thresholds.ready > ready.calibration.thresholds.ready);
assert.ok(
  remoteMultiDay.calibration.weights.offline_preparedness > ready.calibration.weights.offline_preparedness &&
  remoteMultiDay.calibration.weights.recovery_bailout_access > ready.calibration.weights.recovery_bailout_access &&
  remoteMultiDay.calibration.weights.communications_signal_confidence > ready.calibration.weights.communications_signal_confidence,
  'Remote expedition calibration should elevate offline, recovery, and communications weight.',
);

[
  readiness.noActiveVehicleReadinessFixture,
  readiness.staleWeatherReadinessFixture,
  readiness.missingOfflinePackageReadinessFixture,
  readiness.lowCampLegalAccessConfidenceFixture,
].forEach((fixture, index) => {
  const assessment = readiness.buildExpeditionReadiness(fixture);
  assertAssessmentShape(assessment);
  assert.notStrictEqual(assessment.status, 'ready', `Calibration regression fixture ${index + 1} should not be Ready.`);
});

const remoteNoPower = readiness.buildExpeditionReadiness({
  ...readiness.completeReadyReadinessFixture,
  power: {
    connectedSourceAvailable: false,
    connectionState: 'unavailable',
    dataFreshness: 'unknown',
    runtimeSource: 'unavailable',
    powerRelevantForTrip: true,
    powerNeedReason: 'Remote/overnight context makes powered loads relevant.',
    source: 'unknown',
    updatedAt: '2026-05-13T18:00:00.000Z',
  },
});
const remotePowerCategory = remoteNoPower.categories.find((category) => category.id === 'power_runtime');
assert.strictEqual(remotePowerCategory.status, 'caution', 'Remote/overnight missing power should be caution, not false-ready.');
assert.ok(remotePowerCategory.missingInputs.includes('Power runtime remaining') || remotePowerCategory.warnings?.length !== 0);

readiness.expeditionReadinessStore.clearReadiness();
const storeAssessment = readiness.expeditionReadinessStore.setReadinessInputPatch(readiness.completeReadyReadinessFixture);
assertAssessmentShape(storeAssessment);
assert.strictEqual(readiness.selectCurrentExpeditionReadiness().updatedAt, storeAssessment.updatedAt);
assert.ok(['Ready', 'Caution', 'Hold'].includes(readiness.selectReadinessDecision().label));
assert.strictEqual(typeof readiness.selectCanStartExpedition().canStart, 'boolean');
assert.ok(readiness.selectReadinessBriefPayload().concerns.length > 0);
const dispatchContext = readiness.selectDispatchReadinessContext();
assert.strictEqual(dispatchContext.hasActiveAssessment, true);
assert.strictEqual(dispatchContext.statusLabel, readiness.getReadinessDecisionLabel(storeAssessment.status));
assert.ok(dispatchContext.recoverySummary.includes('Mineral Bottom Road'));
assert.ok(dispatchContext.currentCoordinates);
assert.strictEqual(readiness.expeditionReadinessStore.getSnapshot().activeRouteId, 'route-white-rim-loop');

const selectedWeekend = readiness.expeditionReadinessStore.setTripIntent('weekendExpedition');
assertAssessmentShape(selectedWeekend);
assert.strictEqual(selectedWeekend.tripIntent, 'weekendExpedition');
assert.strictEqual(selectedWeekend.tripIntentSource, 'selected');
assert.strictEqual(readiness.selectTripIntent(selectedWeekend).label, 'Weekend Expedition');
assert.strictEqual(readiness.expeditionReadinessStore.getSnapshot().tripIntent, 'weekendExpedition');

const recoveryUtility = readiness.buildExpeditionReadiness({
  ...readiness.localDayTripNoCampFixture,
  tripIntent: 'recoveryUtilityRoute',
  tripIntentSource: 'selected',
});
assertAssessmentShape(recoveryUtility);
assert.strictEqual(recoveryUtility.tripIntent, 'recoveryUtilityRoute');
assert.strictEqual(recoveryUtility.readinessProfile, 'recoveryUtilityRoute');
assert.ok(
  recoveryUtility.calibration.weights.recovery_bailout_access > localDayTrip.calibration.weights.power_runtime,
  'Recovery / Utility intent should shift emphasis toward recovery and bailout access.',
);

const staleWeatherAssessment = readiness.expeditionReadinessStore.markReadinessSourceFreshness('weather', {
  state: 'stale',
  isStale: true,
  detail: 'Weather marked stale by test harness.',
});
assert.strictEqual(staleWeatherAssessment.sourceFreshness.weather.isStale, true);
assert.strictEqual(readiness.expeditionReadinessStore.getSnapshot().inputFreshness.weather.isStale, true);

const contradictoryReady = {
  ...ready,
  status: 'ready',
  sourceFreshness: {
    ...ready.sourceFreshness,
    route: { ...ready.sourceFreshness.route, state: 'missing', source: 'missing', isMissing: true },
    fleet: { ...ready.sourceFreshness.fleet, state: 'missing', source: 'missing', isMissing: true },
    weather: { ...ready.sourceFreshness.weather, state: 'stale', isStale: true },
    offline: { ...ready.sourceFreshness.offline, state: 'missing', source: 'missing', isMissing: true },
    recovery: { ...ready.sourceFreshness.recovery, state: 'missing', source: 'missing', isMissing: true },
  },
  recoveryBrief: {
    ...ready.recoveryBrief,
    emergencyCoordinatePacketStatus: 'missing',
  },
  categories: ready.categories.map((category) =>
    category.id === 'camp_legality_confidence' ? { ...category, confidence: 'low' } : category,
  ),
};

const contradictions = smokeChecks.detectRuntimeContradictions({
  shell: null,
  command: {
    capturedAt: Date.now(),
    activePhase: 'planning',
    primaryTitle: null,
    primarySummary: null,
    primaryRootKey: null,
    secondaryTitles: [],
    suppressedTitles: [],
    leadByTarget: {},
    rootCount: 0,
    staleSignals: [],
    invariantViolations: [],
    releaseDiagnostics: null,
    liveStatus: {},
    expeditionReadiness: {
      ...contradictoryReady,
      categories: contradictoryReady.categories.filter((category) => category.id !== 'power_runtime').concat({
        ...contradictoryReady.categories[0],
        id: 'power_runtime',
        score: 120,
      }),
    },
  },
});

const contradictionCodes = new Set(contradictions.map((item) => item.code));
[
  'readiness_ready_without_route',
  'readiness_ready_without_vehicle',
  'readiness_ready_with_stale_weather',
  'readiness_ready_without_offline_package',
  'readiness_ready_low_camp_legality_confidence',
  'readiness_ready_without_recovery_context',
  'readiness_ready_without_emergency_coordinate_packet',
  'readiness_category_score_out_of_range',
].forEach((code) => assert.ok(contradictionCodes.has(code), `Expected ${code}.`));

const missingCategoryContradictions = smokeChecks.detectRuntimeContradictions({
  shell: null,
  command: {
    capturedAt: Date.now(),
    activePhase: 'planning',
    primaryTitle: null,
    primarySummary: null,
    primaryRootKey: null,
    secondaryTitles: [],
    suppressedTitles: [],
    leadByTarget: {},
    rootCount: 0,
    staleSignals: [],
    invariantViolations: [],
    releaseDiagnostics: null,
    liveStatus: {},
    expeditionReadiness: {
      ...ready,
      categories: ready.categories.filter((category) => category.id !== 'power_runtime'),
    },
  },
});
assert.ok(
  missingCategoryContradictions.some((item) => item.code === 'readiness_missing_category'),
  'Runtime smoke checks should flag a missing readiness category.',
);

const holdNoExplanation = smokeChecks.detectRuntimeContradictions({
  shell: null,
  command: {
    capturedAt: Date.now(),
    activePhase: 'planning',
    primaryTitle: null,
    primarySummary: null,
    primaryRootKey: null,
    secondaryTitles: [],
    suppressedTitles: [],
    leadByTarget: {},
    rootCount: 0,
    staleSignals: [],
    invariantViolations: [],
    releaseDiagnostics: null,
    liveStatus: {},
    expeditionReadiness: { ...hold, explanation: '' },
  },
});
assert.ok(
  holdNoExplanation.some((item) => item.code === 'readiness_hold_missing_explanation'),
  'Runtime smoke checks should flag HOLD without explanation.',
);

const unmarkedSynthetic = smokeChecks.detectRuntimeContradictions({
  shell: null,
  command: {
    capturedAt: Date.now(),
    activePhase: 'planning',
    primaryTitle: null,
    primarySummary: null,
    primaryRootKey: null,
    secondaryTitles: [],
    suppressedTitles: [],
    leadByTarget: {},
    rootCount: 0,
    staleSignals: [],
    invariantViolations: [],
    releaseDiagnostics: null,
    liveStatus: {},
    expeditionReadiness: {
      ...ready,
      sourceFreshness: {
        ...ready.sourceFreshness,
        camp: { ...ready.sourceFreshness.camp, state: 'demo', source: 'demo', isDemo: false },
      },
      dataIntegrity: { usesMockData: false, usesDemoData: false, usesInferredData: false, unmarkedSyntheticData: [] },
    },
  },
});
assert.ok(
  unmarkedSynthetic.some((item) => item.code === 'readiness_unmarked_synthetic_data'),
  'Runtime smoke checks should flag unmarked mock/demo readiness data.',
);

const partialExplanationPayload = aiGuardrails.buildReadinessExplanationPayload(partial);
const aiSummaryContradictions = smokeChecks.detectRuntimeContradictions({
  shell: null,
  command: {
    capturedAt: Date.now(),
    activePhase: 'planning',
    primaryTitle: null,
    primarySummary: null,
    primaryRootKey: null,
    secondaryTitles: [],
    suppressedTitles: [],
    leadByTarget: {},
    rootCount: 0,
    staleSignals: [],
    invariantViolations: [],
    releaseDiagnostics: null,
    liveStatus: {},
    expeditionReadiness: partial,
    readinessExplanation: partialExplanationPayload,
    aiSummary: 'Ready to depart. This route is safe, the legal campsite is confirmed, weather looks clear, the offline route package is complete, and vehicle fit is strong.',
  },
});
const aiSummaryCodes = new Set(aiSummaryContradictions.map((item) => item.code));
[
  'readiness_ai_summary_safe_while_not_ready',
  'readiness_ai_legal_campsite_claim',
  'readiness_ai_references_missing_source',
  'readiness_ai_offline_complete_contradiction',
  'readiness_ai_vehicle_fit_without_vehicle',
  'readiness_ai_status_contradiction',
].forEach((code) => assert.ok(aiSummaryCodes.has(code), `Expected ${code}.`));

const previousActiveReady = ready;
const weatherDropped = {
  ...ready,
  status: 'caution',
  overallScore: Math.max(60, ready.overallScore - 18),
  warnings: [
    ...ready.warnings,
    {
      id: 'test-weather-drop',
      categoryId: 'weather_window',
      label: 'Weather risk increased',
      detail: 'Weather confidence changed during active expedition.',
      severity: 'warning',
    },
  ],
  categories: ready.categories.map((category) => (
    category.id === 'weather_window'
      ? { ...category, score: Math.max(0, category.score - 20), status: 'caution', summary: 'Weather confidence changed during active expedition.' }
      : category
  )),
};
const readinessAlerts = readiness.buildExpeditionReadinessAlerts(previousActiveReady, weatherDropped, {
  isActiveExpedition: true,
  previousActiveRouteId: 'route-a',
  activeRouteId: 'route-a',
  now: '2026-05-13T20:00:00.000Z',
});
assert.ok(readinessAlerts.length > 0, 'Active expedition readiness changes should produce an alert.');
assert.ok(readinessAlerts.some((alert) => alert.triggerKey.includes('status') || alert.categoryId === 'weather_window'));
assert.ok(readinessAlerts[0].actionLabel === 'Open Command Brief');

const cooledDownAlerts = readiness.buildExpeditionReadinessAlerts(previousActiveReady, weatherDropped, {
  isActiveExpedition: true,
  previousActiveRouteId: 'route-a',
  activeRouteId: 'route-a',
  now: '2026-05-13T20:01:00.000Z',
  lastAlertAtByTrigger: {
    [readinessAlerts[0].triggerKey]: '2026-05-13T20:00:00.000Z',
  },
  globalLastAlertAt: '2026-05-13T20:00:45.000Z',
});
assert.strictEqual(cooledDownAlerts.length, 0, 'Readiness alert cooldown should prevent repeated GPS-tick alerts.');

const readinessAlertContradictions = smokeChecks.detectRuntimeContradictions({
  shell: null,
  command: {
    capturedAt: Date.now(),
    activePhase: 'active',
    primaryTitle: null,
    primarySummary: null,
    primaryRootKey: null,
    secondaryTitles: [],
    suppressedTitles: [],
    leadByTarget: {},
    rootCount: 0,
    staleSignals: [],
    invariantViolations: [],
    releaseDiagnostics: null,
    liveStatus: {},
    expeditionReadiness: ready,
    activeReadinessAlert: {
      ...readinessAlerts[0],
      severity: 'hold',
      title: 'AI says legal campsite',
      message: 'This is guaranteed safe.',
    },
    readinessExplanation: null,
    aiSummary: null,
  },
});
const readinessAlertCodes = new Set(readinessAlertContradictions.map((item) => item.code));
assert.ok(readinessAlertCodes.has('readiness_alert_copy_unsafe'), 'Runtime smoke checks should flag unsafe alert copy.');
assert.ok(readinessAlertCodes.has('readiness_alert_status_contradiction'), 'Runtime smoke checks should flag alert/status contradictions.');

console.log('Expedition readiness domain checks passed.');
