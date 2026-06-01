const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function routeBlock(source, routeId) {
  const start = source.indexOf(`id: '${routeId}'`);
  assert.ok(start >= 0, `Missing route ${routeId}`);
  const next = source.indexOf('},', start);
  assert.ok(next > start, `Route ${routeId} should have a complete object block.`);
  return source.slice(start, next);
}

const discoverSource = read('lib/discoverEngine.ts');
const handoffSource = read('lib/navigationHandoffStore.ts');
const overlaySource = read('lib/navigateExploreRoutesOverlay.ts');

assertIncludes(
  discoverSource,
  'EXPLORE_ROUTE_GEOMETRY_FIXTURES',
  'Suggested Trailheads should have a shared fixture geometry registry instead of trailhead-only cards.',
);
assertIncludes(
  discoverSource,
  'withDemoFullRouteGeometry',
  'Suggested route records should attach route geometry and explicit metadata consistently.',
);
assertIncludes(
  discoverSource,
  "geometrySource: 'ecs_demo_full_route_fixture'",
  'Demo full-route geometry should be labeled as ECS fixture geometry, not legal-authority data.',
);
assertIncludes(
  discoverSource,
  "routeScope: 'full_trail_route'",
  'Suggested routes with actual trail geometry should advertise full_trail_route scope.',
);
assertIncludes(
  discoverSource,
  'Mapbox is not the legal trail authority',
  'Route metadata should preserve the authority boundary warning.',
);

[
  'lassen-backcountry',
  'high-lakes-ohv',
  'fort-sage-ohv',
  'oregon-bdr-south',
  'nevada-bdr',
].forEach((routeId) => {
  assertIncludes(
    discoverSource,
    `'${routeId}': {`,
    `Suggested route ${routeId} should have a full-route geometry fixture.`,
  );
  const block = routeBlock(discoverSource, routeId);
  assertIncludes(
    block,
    `...withDemoFullRouteGeometry('${routeId}')`,
    `Suggested route ${routeId} should attach its full route geometry record.`,
  );
});

assertIncludes(
  handoffSource,
  'extractTrailGeometry(route)',
  'Navigation handoff should continue to use route geometry as the trail line source.',
);
assertIncludes(
  handoffSource,
  "type === 'hybrid_route' || type === 'place'",
  'Routes with trail geometry should not be treated as trailhead-only road destinations.',
);
assertIncludes(
  overlaySource,
  'getExploreRoutePreviewRoutePoints(payload)',
  'Highlighted Explore trails in view should reuse the canonical suggested-route preview geometry.',
);

console.log('Suggested Trailheads full-route geometry contract passed.');
