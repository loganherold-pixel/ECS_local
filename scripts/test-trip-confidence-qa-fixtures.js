const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function labels(summary) {
  return summary.reasons.map((reason) => reason.label);
}

function section(summary, key) {
  return summary.sections.find((item) => item.key === key);
}

const harnessPath = path.join(root, 'lib', 'tripBuilder', 'tripConfidenceQaFixtures.ts');
const {
  TRIP_CONFIDENCE_QA_FIXTURE_SCENARIO_IDS,
  getTripConfidenceQaFixture,
  getTripConfidenceQaFixtures,
  isTripConfidenceQaHarnessEnabled,
} = require(harnessPath);

const expectedScenarioIds = [
  'missing_active_vehicle',
  'incomplete_vehicle_range',
  'demo_route_geometry',
  'preview_route_geometry',
  'trailhead_only_missing_geometry',
  'provider_unavailable',
  'unknown_environment',
  'stale_telemetry_ignored',
  'mock_telemetry_ignored',
];

assert.deepStrictEqual(
  TRIP_CONFIDENCE_QA_FIXTURE_SCENARIO_IDS,
  expectedScenarioIds,
  'Trip Confidence QA fixtures must cover every requested native edge scenario.',
);

assert.strictEqual(
  isTripConfidenceQaHarnessEnabled({ dev: false, nodeEnv: 'production' }),
  false,
  'Trip Confidence QA harness must be disabled in production.',
);
assert.strictEqual(
  isTripConfidenceQaHarnessEnabled({ dev: true, nodeEnv: 'production' }),
  true,
  'Trip Confidence QA harness should be available to native dev builds.',
);
assert.strictEqual(
  isTripConfidenceQaHarnessEnabled({ dev: false, nodeEnv: 'test' }),
  true,
  'Trip Confidence QA harness should be available to tests.',
);
assert.deepStrictEqual(
  getTripConfidenceQaFixtures({ dev: false, nodeEnv: 'production' }),
  [],
  'Production guard must return no fixture summaries.',
);

const fixtures = getTripConfidenceQaFixtures({ dev: false, nodeEnv: 'test' });
assert.deepStrictEqual(
  fixtures.map((fixture) => fixture.id),
  expectedScenarioIds,
  'Test guard should expose deterministic fixture summaries in a stable order.',
);

function fixture(id) {
  const value = getTripConfidenceQaFixture(id, { dev: false, nodeEnv: 'test' });
  assert.ok(value, `Fixture ${id} should be available in test mode.`);
  assert.strictEqual(value.id, id);
  assert.ok(value.summary, `Fixture ${id} should include a rendered Trip Confidence summary.`);
  assert.ok(value.validationRows.length >= 4, `Fixture ${id} should expose QA validation rows.`);
  assert.ok(/fixture|qa|non-live/i.test(value.disclosure), `Fixture ${id} should disclose non-live data.`);
  return value;
}

const missingVehicle = fixture('missing_active_vehicle').summary;
assert.strictEqual(missingVehicle.category, 'low_confidence');
assert.ok(labels(missingVehicle).includes('Vehicle profile missing'));
assert.strictEqual(missingVehicle.recommendedAction.id, 'complete_vehicle_profile');

const incompleteVehicle = fixture('incomplete_vehicle_range').summary;
assert.ok(labels(incompleteVehicle).includes('Vehicle profile incomplete'));
assert.ok(labels(incompleteVehicle).includes('Vehicle range unknown'));
assert.strictEqual(section(incompleteVehicle, 'vehicle').status, 'caution');

const trailheadOnly = fixture('trailhead_only_missing_geometry').summary;
assert.strictEqual(trailheadOnly.category, 'insufficient_data');
assert.strictEqual(trailheadOnly.route.status, 'trailhead_guidance');
assert.ok(labels(trailheadOnly).includes('Trailhead-only route'));
assert.ok(labels(trailheadOnly).includes('Route geometry missing'));
assert.strictEqual(trailheadOnly.recommendedAction.id, 'confirm_route_geometry');

const demo = fixture('demo_route_geometry').summary;
assert.strictEqual(demo.route.status, 'demo_fixture');
assert.ok(labels(demo).includes('Demo route, not verified'));
assert.ok(!labels(demo).includes('ECS Validated route'), 'Demo fixture must never render as verified.');

const preview = fixture('preview_route_geometry').summary;
assert.strictEqual(preview.route.status, 'preview_geometry');
assert.ok(labels(preview).includes('Route geometry preview-only'));
assert.ok(!labels(preview).includes('ECS Validated route'), 'Preview geometry must never render as verified.');

const providerUnavailable = fixture('provider_unavailable').summary;
assert.strictEqual(providerUnavailable.metadata.providerUnavailable, true);
assert.ok(labels(providerUnavailable).includes('POI provider unavailable'));
assert.ok(providerUnavailable.keyWarnings.some((warning) => /provider unavailable/i.test(warning)));

const unknownEnvironment = fixture('unknown_environment').summary;
assert.ok(labels(unknownEnvironment).includes('Weather unavailable'));
assert.ok(labels(unknownEnvironment).includes('Daylight unknown'));
assert.ok(labels(unknownEnvironment).includes('Remoteness unknown'));
assert.ok(
  !labels(unknownEnvironment).some((label) => /fair|safe/i.test(label)),
  'Unknown environment fixture must not read as fair or safe.',
);
assert.strictEqual(section(unknownEnvironment, 'environment').status, 'unknown');

const staleTelemetry = fixture('stale_telemetry_ignored').summary;
assert.ok(labels(staleTelemetry).includes('Stale telemetry ignored'));
assert.notStrictEqual(section(staleTelemetry, 'data').status, 'live');

const mockTelemetry = fixture('mock_telemetry_ignored').summary;
assert.ok(labels(mockTelemetry).includes('Mock telemetry not used for confidence'));
assert.ok(mockTelemetry.keyWarnings.includes('Mock telemetry not used for confidence'));
assert.notStrictEqual(section(mockTelemetry, 'data').status, 'live');

const harnessSource = read('lib/tripBuilder/tripConfidenceQaFixtures.ts');
const routeSource = read('app/dev/trip-confidence-qa.tsx');
const screenSource = read('components/tripBuilder/TripConfidenceFixtureQaScreen.tsx');
const sourceBundle = `${harnessSource}\n${routeSource}\n${screenSource}`;

assert.ok(
  harnessSource.includes('typeof __DEV__') && harnessSource.includes("nodeEnv === 'test'"),
  'Fixture harness must use the existing __DEV__/test guard pattern.',
);
assert.ok(
  routeSource.includes('Redirect') && routeSource.includes('isTripConfidenceQaHarnessEnabled'),
  'QA route must redirect when the harness is disabled.',
);
assert.ok(
  screenSource.includes('DEV ONLY') && screenSource.includes('NON-LIVE QA FIXTURE'),
  'QA screen must visibly disclose dev-only non-live fixture data.',
);

for (const forbidden of [
  'vehicleStore',
  'vehicleSpecStore',
  'AsyncStorage',
  'localStorage',
  'sessionStorage',
  'saveItinerary',
  'setActiveVehicle',
  'preTrailResupplyResolver',
  'weatherStore',
  'Blu',
  'Mopeka',
]) {
  assert.ok(
    !sourceBundle.includes(forbidden),
    `Trip Confidence QA fixtures must not import or mutate persisted/provider state: ${forbidden}`,
  );
}

console.log('Trip Confidence QA fixture harness checks passed.');
