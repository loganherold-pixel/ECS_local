const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const harness = require(path.join(root, 'fixtures', 'campops', 'mobileQaHarness.js'));
const docsPath = path.join(root, 'docs', 'campops', 'mobile_qa.md');
const devRoutePath = path.join(root, 'app', 'dev', 'campops-visual-qa.tsx');
const visualQaScreenPath = path.join(root, 'components', 'campops', 'CampOpsVisualQaScreen.tsx');

const requiredScenarioIds = [
  'feature_flag_off_legacy_results',
  'feature_flag_on_cards',
  'recommended_backup_emergency_cards',
  'stale_source_warning',
  'two_hour_delay_endpoint',
  'trailer_convoy',
  'low_fuel',
  'ai_stale_data',
  'debrief_privacy_defaults',
  'offline_cached_warning',
];
const requiredVisualStateIds = [
  'feature_flag_off',
  'feature_flag_on',
  'recommended_endpoint',
  'backup_endpoint',
  'emergency_fallback',
  'planned_camp_downgraded',
  'stale_source_warning',
  'source_conflict_warning',
  'legal_confidence_unknown',
  'closure_status_unknown',
  'fire_restriction_unknown',
  'weather_stale',
  'low_fuel',
  'low_water',
  'trailer_caution',
  'large_group_caution',
  'offline_cached_data',
  'offline_no_cached_data',
  'ai_summary_expanded_collapsed',
  'why_expanded_collapsed',
  'long_camp_names',
  'long_warning_lists',
  'cramped_small_screen',
];

assert.strictEqual(
  harness.CAMP_OPS_MOBILE_QA_TEST_DATA.featureFlagName,
  'campopsRecommendationsEnabled',
  'Mobile QA harness should name the CampOps feature flag.',
);
assert.strictEqual(
  harness.CAMP_OPS_MOBILE_QA_TEST_DATA.noApiKeysRequired,
  true,
  'Mobile QA harness must not require real API keys.',
);
assert.ok(
  harness.CAMP_OPS_ANDROID_QA_COMMANDS.listDevices.includes('adb devices'),
  'Mobile QA harness should document Android device discovery.',
);
assert.strictEqual(
  harness.CAMP_OPS_MOBILE_QA_DEV_ENTRY_POINT.requiresLiveProviders,
  false,
  'Mobile QA visual states must not require live providers.',
);
assert.strictEqual(
  harness.CAMP_OPS_MOBILE_QA_DEV_ENTRY_POINT.route,
  '/dev/campops-visual-qa',
  'Mobile QA harness should expose the dev-only visual QA route.',
);
assert.strictEqual(
  harness.CAMP_OPS_MOBILE_QA_DEV_ENTRY_POINT.requiresAiOutput,
  false,
  'Mobile QA visual states must not require AI output.',
);
assert.ok(
  harness.CAMP_OPS_MOBILE_QA_VIEWPORTS.some((viewport) => viewport.id === 'android_small_portrait'),
  'Mobile QA harness should include small Android viewport coverage.',
);

const scenarioIds = harness.campOpsMobileQaScenarios.map((scenario) => scenario.id);
for (const id of requiredScenarioIds) {
  assert.ok(scenarioIds.includes(id), `Missing mobile QA scenario: ${id}`);
}
for (const scenario of harness.campOpsMobileQaScenarios) {
  assert.ok(Array.isArray(scenario.setup) && scenario.setup.length > 0, `${scenario.id} should include setup steps.`);
  assert.ok(Array.isArray(scenario.expected) && scenario.expected.length > 0, `${scenario.id} should include expected results.`);
  assert.ok(Array.isArray(scenario.fixtureRefs) && scenario.fixtureRefs.length > 0, `${scenario.id} should include fixture/test refs.`);
}
const visualStateIds = harness.CAMP_OPS_MOBILE_QA_VISUAL_STATE_MATRIX.map((state) => state.id);
for (const id of requiredVisualStateIds) {
  assert.ok(visualStateIds.includes(id), `Missing mobile QA visual state: ${id}`);
}
for (const state of harness.CAMP_OPS_MOBILE_QA_VISUAL_STATE_MATRIX) {
  assert.ok(Array.isArray(state.setup) && state.setup.length > 0, `${state.id} should include setup steps.`);
  assert.ok(Array.isArray(state.expected) && state.expected.length > 0, `${state.id} should include expected visual assertions.`);
  assert.ok(Array.isArray(state.fixtureRefs) && state.fixtureRefs.length > 0, `${state.id} should include fixture/test refs.`);
}

assert.ok(fs.existsSync(docsPath), 'CampOps mobile QA docs must exist.');
assert.ok(fs.existsSync(devRoutePath), 'CampOps dev-only visual QA route must exist.');
assert.ok(fs.existsSync(visualQaScreenPath), 'CampOps visual QA screen must exist.');

const devRoute = fs.readFileSync(devRoutePath, 'utf8');
assert.ok(devRoute.includes('__DEV__'), 'Visual QA route must be gated by __DEV__.');
assert.ok(devRoute.includes('<Redirect href="/" />'), 'Visual QA route should redirect away outside development builds.');
assert.ok(devRoute.includes('CampOpsVisualQaScreen'), 'Visual QA route should render the CampOps visual QA screen.');

const visualQaScreen = fs.readFileSync(visualQaScreenPath, 'utf8');
for (const text of [
  'DEV ONLY - CAMPOPS VISUAL QA',
  'No real users, routes, providers',
  'AI assist',
  'Disabled',
  'Telemetry',
  'Community publishing',
  'Provider influence',
  'Shadow/unknown',
  'Manual feedback reminder',
  'On-time normal route',
  'Two-hour delay after sunset',
  'Trailer/full-size turnaround',
  'Low fuel margin',
  'Low water next-day concern',
  'Offline cached source data',
  'Offline no-cache / missing sources',
  'Stale closure/weather/fire/service',
  'Legacy result differs from CampOps endpoint',
  'Private debrief without community publishing',
]) {
  assert.ok(visualQaScreen.includes(text), `Visual QA screen should include: ${text}`);
}
for (const forbidden of [
  'rawAiPrompt',
  'private-user',
  'vehicle-123',
  '38.',
  '-121.',
  'definitely legal',
  'guaranteed open',
]) {
  assert.ok(!visualQaScreen.includes(forbidden), `Visual QA screen must avoid private/overconfident fixture text: ${forbidden}`);
}

const docs = fs.readFileSync(docsPath, 'utf8');
for (const text of [
  'Android',
  'adb devices -l',
  '/dev/campops-visual-qa',
  'gated by `__DEV__`',
  'campopsRecommendationsEnabled',
  'Feature flag off',
  'Feature flag on',
  'Recommended Camp',
  'Backup Camp',
  'Emergency Camp',
  'two-hour delay',
  'trailer convoy',
  'low fuel',
  'stale source',
  'Debrief privacy defaults',
  'offline/cached',
  'Visual State Matrix',
  'small screen',
  'large screen',
  'landscape',
  'long camp names',
  'long warning lists',
  'missing data fields',
  'action buttons',
]) {
  assert.ok(docs.includes(text), `CampOps mobile QA docs should include: ${text}`);
}

const visualMatrixDocs = fs.readFileSync(path.join(root, 'docs', 'campops', 'mobile_visual_state_matrix.md'), 'utf8');
for (const id of requiredVisualStateIds) {
  assert.ok(visualMatrixDocs.includes(id), `Visual state matrix docs should include: ${id}`);
}

console.log('CampOps mobile QA harness checks passed.');
