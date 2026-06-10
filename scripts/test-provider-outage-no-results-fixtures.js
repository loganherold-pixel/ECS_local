const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

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

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

const {
  PROVIDER_OUTAGE_QA_SCENARIO_IDS,
  buildProviderOutageQaFixture,
  getProviderOutageQaFixtures,
  isProviderOutageQaHarnessEnabled,
} = require(path.join(root, 'lib', 'qa', 'providerOutageNoResultsFixtures.ts'));

assert.strictEqual(
  isProviderOutageQaHarnessEnabled({ dev: false, nodeEnv: 'production' }),
  false,
  'Provider outage fixture harness must be disabled in production runtime.',
);
assert.strictEqual(
  isProviderOutageQaHarnessEnabled({ dev: true, nodeEnv: 'production' }),
  true,
  'Provider outage fixture harness should be available in dev runtime.',
);
assert.strictEqual(
  isProviderOutageQaHarnessEnabled({ dev: false, nodeEnv: 'test' }),
  true,
  'Provider outage fixture harness should be available in test runtime.',
);

assert.deepStrictEqual(
  getProviderOutageQaFixtures({ dev: false, nodeEnv: 'production' }),
  [],
  'Production fixture list must be empty.',
);

const fixtures = getProviderOutageQaFixtures({ dev: false, nodeEnv: 'test' });
assert.strictEqual(fixtures.length, PROVIDER_OUTAGE_QA_SCENARIO_IDS.length);

const byId = Object.fromEntries(fixtures.map((fixture) => [fixture.id, fixture]));

[
  'pretrail_provider_unavailable',
  'pretrail_provider_timeout',
  'pretrail_provider_error',
  'pretrail_no_results',
  'pretrail_not_requested',
  'pretrail_stale_cache',
  'bailout_no_results',
  'weather_provider_unavailable',
  'weather_stale_cache',
  'route_provider_unavailable',
  'route_geometry_malformed',
].forEach((id) => {
  assert.ok(byId[id], `Missing provider outage QA fixture: ${id}`);
  assert.match(byId[id].disclosure, /NON-PRODUCTION QA FIXTURE/);
  assert.strictEqual(byId[id].provider.providerCalled, false, `${id} must not call real providers.`);
  assert.strictEqual(byId[id].productIsolation.every((row) => row.value === 'Untouched' || row.value === 'Not called'), true);
});

assert.strictEqual(byId.pretrail_provider_unavailable.preTrailState, 'provider_unavailable');
assert.match(byId.pretrail_provider_unavailable.tripBuilderCopy, /provider unavailable/i);
assert.ok(
  byId.pretrail_provider_unavailable.routeConfidence.reasons.some((reason) => reason.id === 'poi_provider_unavailable'),
  'Provider unavailable should remain visible in Trip Confidence.',
);

assert.strictEqual(byId.pretrail_provider_timeout.preTrailState, 'provider_unavailable');
assert.match(byId.pretrail_provider_timeout.provider.copy, /timeout/i);
assert.ok(
  byId.pretrail_provider_timeout.routeConfidence.reasons.some((reason) => reason.id === 'poi_provider_unavailable'),
  'Provider timeout should degrade through provider unavailable semantics.',
);

assert.strictEqual(byId.pretrail_provider_error.preTrailState, 'provider_unavailable');
assert.match(byId.pretrail_provider_error.provider.copy, /error/i);
assert.ok(
  byId.pretrail_provider_error.routeConfidence.reasons.some((reason) => reason.id === 'poi_provider_unavailable'),
  'Provider error should degrade through provider unavailable semantics.',
);

assert.strictEqual(byId.pretrail_no_results.preTrailState, 'no_results');
assert.match(byId.pretrail_no_results.tripBuilderCopy, /no nearby|no .*candidates/i);
assert.ok(
  byId.pretrail_no_results.routeConfidence.reasons.some((reason) => reason.id === 'poi_provider_empty'),
  'No-results POI state should not collapse into provider unavailable.',
);
assert.ok(
  !byId.pretrail_no_results.routeConfidence.reasons.some((reason) => reason.id === 'poi_provider_unavailable'),
  'No-results POI state must remain distinct from provider unavailable.',
);

assert.strictEqual(byId.pretrail_not_requested.preTrailState, 'not_requested');
assert.match(byId.pretrail_not_requested.tripBuilderCopy, /not requested/i);
assert.ok(
  !byId.pretrail_not_requested.routeConfidence.reasons.some((reason) => reason.id === 'poi_provider_unavailable'),
  'Not-requested POI planning must not look like a provider failure.',
);

assert.strictEqual(byId.pretrail_stale_cache.provider.state, 'stale_cache');
assert.match(byId.pretrail_stale_cache.tripBuilderCopy, /stale|cache/i);
assert.ok(
  byId.pretrail_stale_cache.routeConfidence.reasons.some((reason) => reason.id === 'weather_stale'),
  'Stale-cache fixture should keep stale data visible to confidence consumers.',
);

assert.strictEqual(byId.bailout_no_results.bailout.usableCandidateCount, 0);
assert.ok(byId.bailout_no_results.bailout.rejectedProviderCount >= 1);
assert.strictEqual(byId.bailout_no_results.bailout.usedRouteFallback, false);
assert.match(byId.bailout_no_results.bailout.copy, /no valid bailout|unavailable|no results/i);

assert.strictEqual(byId.weather_provider_unavailable.weather.status, 'unavailable');
assert.ok(
  byId.weather_provider_unavailable.routeConfidence.reasons.some((reason) => reason.id === 'weather_unavailable'),
  'Weather provider outage should show Weather unavailable.',
);
assert.ok(!/fair|safe/i.test(byId.weather_provider_unavailable.weather.copy));

assert.strictEqual(byId.weather_stale_cache.weather.status, 'stale');
assert.ok(
  byId.weather_stale_cache.routeConfidence.reasons.some((reason) => reason.id === 'weather_stale'),
  'Stale weather cache should remain stale, not live.',
);
assert.match(byId.weather_stale_cache.weather.copy, /stale/i);
assert.match(byId.weather_stale_cache.weather.copy, /not live|not verified/i);

assert.strictEqual(byId.route_provider_unavailable.routeGeometry.valid, false);
assert.strictEqual(byId.route_provider_unavailable.expectedRouteOverlay, 'controlled_fallback');
assert.match(byId.route_provider_unavailable.routeAuthorityCopy, /geometry unavailable|provider unavailable|unknown/i);

assert.strictEqual(byId.route_geometry_malformed.routeGeometry.valid, false);
assert.strictEqual(byId.route_geometry_malformed.routeGeometry.status, 'malformed');
assert.strictEqual(byId.route_geometry_malformed.expectedRouteOverlay, 'controlled_fallback');
assert.match(byId.route_geometry_malformed.routeAuthorityCopy, /malformed|invalid/i);

fixtures.forEach((fixture) => {
  assert.ok(fixture.validationRows.some((row) => row.label === 'Production access' && row.value === 'Redirected'));
  assert.ok(fixture.validationRows.some((row) => row.label === 'Provider calls' && row.value === 'Not called'));
  assert.ok(fixture.validationRows.some((row) => row.label === 'Product mutation' && row.value === 'None'));
});

const fixtureSource = read('lib/qa/providerOutageNoResultsFixtures.ts');
const screenSource = read('components/qa/ProviderOutageFixtureQaScreen.tsx');
const routeSource = read('app/dev/provider-outage-qa.tsx');
const packageSource = read('package.json');

[
  'AsyncStorage',
  'vehicleStore',
  'activeTripMode',
  'offlineIncidentPacket',
  'expeditionBadgeStore',
  'convoy',
  'supabase',
  'Mopeka',
  'Blu',
  'EcoFlow',
  'OBD2',
].forEach((forbiddenText) => {
  assert.strictEqual(
    fixtureSource.includes(forbiddenText) || screenSource.includes(forbiddenText),
    false,
    `Provider outage fixtures must not import or mention mutable/hardware systems: ${forbiddenText}`,
  );
});

assert.strictEqual(/\bfetch\s*\(/.test(fixtureSource), false, 'Fixture module must not call fetch.');
assert.ok(routeSource.includes('<Redirect href="/" />'), 'Dev route must redirect when the harness is disabled.');
assert.ok(routeSource.includes('isProviderOutageQaHarnessEnabled'), 'Dev route must use the production guard.');
assert.ok(screenSource.includes('NON-PRODUCTION QA FIXTURE'), 'QA screen must be visibly labeled non-production.');
assert.ok(screenSource.includes('Providers'), 'QA screen should expose provider state for manual Android QA.');
assert.ok(packageSource.includes('test:provider-outage-no-results-fixtures'));

buildProviderOutageQaFixture('pretrail_provider_unavailable');

console.log('Provider outage/no-results fixture checks passed.');
