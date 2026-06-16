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
  ROUTE_OVERLAY_QA_SCENARIO_IDS,
  buildRouteOverlayQaFixture,
  getRouteOverlayQaFixtures,
  isRouteOverlayQaHarnessEnabled,
} = require(path.join(root, 'lib', 'map', 'routeOverlayQaFixtures.ts'));
const {
  classifyExploreRouteAuthority,
} = require(path.join(root, 'lib', 'exploreRouteAuthority.ts'));

assert.strictEqual(
  isRouteOverlayQaHarnessEnabled({ dev: false, nodeEnv: 'production' }),
  false,
  'Route overlay QA harness must be disabled in production runtime.',
);
assert.strictEqual(
  isRouteOverlayQaHarnessEnabled({ dev: true, nodeEnv: 'production' }),
  true,
  'Route overlay QA harness should be available in dev runtime.',
);
assert.strictEqual(
  isRouteOverlayQaHarnessEnabled({ dev: false, nodeEnv: 'test' }),
  true,
  'Route overlay QA harness should be available in test runtime.',
);

const productionFixtures = getRouteOverlayQaFixtures({ dev: false, nodeEnv: 'production' });
assert.deepStrictEqual(productionFixtures, [], 'Production fixture list must be empty.');

const fixtures = getRouteOverlayQaFixtures({ dev: false, nodeEnv: 'test' });
assert.strictEqual(fixtures.length, ROUTE_OVERLAY_QA_SCENARIO_IDS.length);

const byId = Object.fromEntries(fixtures.map((fixture) => [fixture.id, fixture]));

assert.strictEqual(byId.valid_geometry.normalized.valid, true);
assert.strictEqual(byId.valid_geometry.expectedOverlayState, 'route_line');
assert.strictEqual(byId.valid_geometry.authority.status, 'trail_route');
assert.strictEqual(byId.valid_geometry.expectedMapLine, true);

assert.strictEqual(byId.malformed_geometry.normalized.valid, false);
assert.strictEqual(byId.malformed_geometry.normalized.status, 'malformed');
assert.strictEqual(byId.malformed_geometry.expectedOverlayState, 'controlled_fallback');
assert.match(byId.malformed_geometry.authorityNotice, /Malformed geometry/);

assert.strictEqual(byId.missing_geometry.normalized.valid, false);
assert.strictEqual(byId.missing_geometry.normalized.status, 'missing');
assert.strictEqual(byId.missing_geometry.expectedOverlayState, 'controlled_fallback');
assert.match(byId.missing_geometry.authorityNotice, /Missing geometry/);

assert.strictEqual(byId.trailhead_only.authority.status, 'trailhead_guidance');
assert.strictEqual(byId.trailhead_only.expectedOverlayState, 'trailhead_marker_only');
assert.strictEqual(byId.trailhead_only.expectedMarker, true);
assert.strictEqual(byId.trailhead_only.expectedMapLine, false);

assert.strictEqual(byId.approach_only.normalized.valid, true);
assert.strictEqual(byId.approach_only.normalized.authority, 'approach');
assert.strictEqual(byId.approach_only.expectedOverlayState, 'approach_route_line');
assert.strictEqual(byId.approach_only.authority.hasTrueTrailGeometry, false);
assert.strictEqual(byId.approach_only.authority.canUseForTrailItinerary, false);
assert.match(byId.approach_only.authorityNotice, /Approach route only/);

assert.strictEqual(byId.demo_route_geometry.normalized.authority, 'demo');
assert.strictEqual(byId.demo_route_geometry.authority.status, 'demo_fixture');
assert.strictEqual(byId.demo_route_geometry.authority.isPreviewOrDemo, true);
assert.match(byId.demo_route_geometry.authorityNotice, /not verified trail authority/);

assert.strictEqual(byId.preview_route_geometry.normalized.authority, 'preview');
assert.strictEqual(byId.preview_route_geometry.authority.status, 'preview_geometry');
assert.strictEqual(byId.preview_route_geometry.authority.hasTrueTrailGeometry, false);
assert.match(byId.preview_route_geometry.authorityNotice, /not verified trail geometry/);

assert.strictEqual(byId.imported_route_geometry.authority.status, 'imported_geometry');
assert.strictEqual(byId.imported_route_geometry.normalized.authority, 'trail');
assert.strictEqual(byId.imported_route_geometry.authority.hasTrueTrailGeometry, true);
assert.match(byId.imported_route_geometry.authorityNotice, /Verify legal access/);

assert.strictEqual(byId.source_backed_trail_geometry.authority.status, 'live_verified_geometry');
assert.strictEqual(byId.source_backed_trail_geometry.authority.hasTrueTrailGeometry, true);
assert.match(byId.source_backed_trail_geometry.authorityNotice, /Source-backed/);

const sourceBackedWithoutRequiredMetadata = {
  ...byId.source_backed_trail_geometry.route,
  routeMetadata: {
    source: 'trail_pack',
    dataState: 'fixture',
    sourceLabel: 'Untrusted source-backed fixture',
  },
};
assert.notStrictEqual(
  classifyExploreRouteAuthority(sourceBackedWithoutRequiredMetadata).status,
  'live_verified_geometry',
  'Source-backed label must require explicit live/approved metadata.',
);

fixtures.forEach((fixture) => {
  assert.match(fixture.disclosure, /NON-PRODUCTION QA FIXTURE/);
  assert.strictEqual(fixture.validationRows.some((row) => row.label === 'Product mutation' && row.value === 'None'), true);
});

const fixtureSource = read('lib/map/routeOverlayQaFixtures.ts');
const screenSource = read('components/navigate/RouteOverlayFixtureQaScreen.tsx');
const routeSource = read('app/dev/route-overlay-qa.tsx');

[
  'activeTripMode',
  'offlineIncidentPacket',
  'expeditionBadgeStore',
  'vehicleStore',
  'convoyRealtime',
  'supabase',
  'navigationHandoffStore',
  'tripBuilderRouteHandoffStore',
  'waypointProgressStore',
].forEach((forbiddenImport) => {
  const importPattern = new RegExp(`from ['\"][^'\"]*${forbiddenImport}`);
  assert.strictEqual(
    importPattern.test(fixtureSource) || importPattern.test(screenSource),
    false,
    `Route overlay QA fixture must not import mutable product state: ${forbiddenImport}`,
  );
});

assert.ok(
  routeSource.includes('<Redirect href="/dashboard" />'),
  'Disabled route overlay QA route must redirect to the stable Dashboard tab.',
);
assert.ok(
  !routeSource.includes('<Redirect href="/" />'),
  'Disabled route overlay QA route must not redirect to the root loading route.',
);
assert.ok(routeSource.includes('isRouteOverlayQaHarnessEnabled'), 'Dev route must use the production guard.');
assert.ok(screenSource.includes('getMapboxTokenSync'), 'QA screen may read already configured token synchronously.');
assert.ok(!screenSource.includes('getMapboxToken('), 'QA screen must not call async token/provider resolution.');
assert.ok(screenSource.includes('<MapRenderer'), 'QA screen should render through the shared MapRenderer path.');
assert.ok(screenSource.includes('NON-PRODUCTION QA FIXTURE'), 'QA screen must be visibly labeled non-production.');

buildRouteOverlayQaFixture('valid_geometry');

console.log('Android Mapbox route overlay QA fixture checks passed.');

