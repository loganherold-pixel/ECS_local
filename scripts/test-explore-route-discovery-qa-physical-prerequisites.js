const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const runtime = require(path.join(root, 'lib/explore/routeDiscoveryQaRuntime.ts'));
const transport = require(path.join(root, 'lib/explore/routeDiscoveryQaTransport.ts'));
const discoverSource = fs.readFileSync(path.join(root, 'app/(tabs)/discover.tsx'), 'utf8').replace(/\r\n/g, '\n');
const tripBuilderSource = fs.readFileSync(path.join(root, 'app/explore-trip-builder.tsx'), 'utf8');
const identitySource = fs.readFileSync(path.join(root, 'components/explore/RouteDiscoveryQaIdentity.tsx'), 'utf8');
const disabledIdentitySource = fs.readFileSync(path.join(root, 'components/explore/RouteDiscoveryQaIdentity.disabled.tsx'), 'utf8');
const metroSource = fs.readFileSync(path.join(root, 'metro.config.js'), 'utf8');

const qa = runtime.getRouteDiscoveryQaRuntime();
assert.strictEqual(qa.enabled, true);
assert.strictEqual(qa.region.regionId, 'qa_fixture_region');
assert.strictEqual(qa.region.latitude, 0);
assert.strictEqual(qa.region.longitude, -140);
assert.strictEqual(Object.isFrozen(qa.region), true);

async function search(overrides = {}) {
  return transport.invokeRouteDiscoveryQaTransport({}, {
    latitude: qa.region.latitude,
    longitude: qa.region.longitude,
    radiusMiles: qa.region.defaultRadiusMiles,
    locationSource: qa.region.source,
    qaMode: qa.mode,
    qaRegionId: qa.region.regionId,
    accessPartition: qa.accessPartition,
    ...overrides,
  });
}

(async () => {
  const first = await search();
  const second = await search({ latitude: 47.5, longitude: -122.3 });
  const denied = await search({ locationSource: 'permission_denied' });
  const foreground = await search({ locationSource: 'foreground_refresh' });
  for (const result of [first, second, denied, foreground]) {
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.data.records.length, 20);
    assert.strictEqual(new Set(result.data.records.map((record) => record.public_id)).size, 20);
    assert.strictEqual(result.data.meta.nextPage, null);
    assert.strictEqual(result.data.meta.nextCursor, null);
    assert.strictEqual(result.data.meta.additionalMatchesExist, true);
    assert.ok(result.data.meta.fixtureDiagnostics.source > 20);
    assert.strictEqual(result.data.meta.fixtureDiagnostics.final, 20);
  }
  assert.deepStrictEqual(
    first.data.records.map((record) => record.public_id),
    second.data.records.map((record) => record.public_id),
    'Physical GPS must not alter the QA result partition.',
  );
  assert.strictEqual(first.data.records.some((record) => record.review_status !== 'approved'), false);
  assert.strictEqual(first.data.records.some((record) => record.recommendation_status !== 'recommendable'), false);
  assert.strictEqual(first.data.records.some((record) => record.route_geometry == null), false);

  const tightRadius = await search({ radiusMiles: 0.2 });
  assert.ok(tightRadius.data.records.length < 20, 'Ordinary radius filtering must remain active inside the QA region.');
  const loops = await search({ routeType: 'loop' });
  assert.ok(loops.data.records.every((record) => record.route_type === 'loop'), 'Refinement filtering must remain active.');
  const unpartitioned = await transport.invokeRouteDiscoveryQaTransport({}, { latitude: 0, longitude: -140, radiusMiles: 100 });
  assert.match(unpartitioned.error.message, /Synthetic QA search region is required/);

  assert.ok(discoverSource.includes('if (routeDiscoveryQaRuntime.enabled) return routeDiscoveryQaRuntime.region;'));
  assert.ok(discoverSource.includes('accessPartition: routeDiscoveryQaRuntime.accessPartition'));
  assert.ok(discoverSource.includes('<RouteDiscoveryQaIdentity />'));
  assert.ok(tripBuilderSource.includes('<RouteDiscoveryQaIdentity />'));
  for (const copy of ['ROUTE DISCOVERY QA', 'LOCAL FIXTURES', 'SUPABASE DISABLED']) assert.ok(identitySource.includes(copy));
  assert.ok(identitySource.includes('accessibilityLabel='));
  assert.ok(disabledIdentitySource.includes('return null'));
  assert.ok(metroSource.includes("moduleName.endsWith('RouteDiscoveryQaIdentity')"));
  assert.ok(metroSource.includes('RouteDiscoveryQaIdentity.disabled.tsx'));
  assert.ok(metroSource.includes('routeDiscoveryQaRuntime.disabled.ts'));

  console.log('Explore route-discovery QA physical prerequisite checks passed (20 requirements).');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
