const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' }, StyleSheet: { create: (value) => value } };
  }
  return originalLoad(request, parent, isMain);
};

function compileTypescript(module, filename) {
  const source = require('fs').readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;
require.extensions['.tsx'] = compileTypescript;

const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');

const {
  buildFullRouteGuidanceModel,
} = require(path.join(root, 'lib', 'fullRouteGuidance.ts'));
const {
  buildExploreNavigationPayload,
} = require(path.join(root, 'lib', 'navigationHandoffStore.ts'));

function coord(lat, lng) {
  return { lat, lng };
}

function assertCoord(actual, expected, message) {
  assert(actual, `${message}: missing coordinate`);
  assert.strictEqual(Number(actual.lat.toFixed(6)), Number(expected.lat.toFixed(6)), `${message}: lat`);
  assert.strictEqual(Number(actual.lng.toFixed(6)), Number(expected.lng.toFixed(6)), `${message}: lng`);
}

const gps = coord(39.0, -120.0);
const roadMid = coord(39.001, -120.001);
const trailhead = coord(39.002, -120.002);
const trailMid = coord(39.003, -120.003);
const trailEnd = coord(39.004, -120.004);

const composed = buildFullRouteGuidanceModel({
  phase: 'approach',
  currentLocation: gps,
  roadRoutePoints: [gps, roadMid, trailhead],
  roadProgressPoints: [gps],
  roadDistanceM: 1200,
  roadRemainingDistanceM: 1000,
  trailGeometry: [trailhead, trailMid, trailEnd],
  trailDistanceM: 2000,
  trailRemainingDistanceM: 2000,
});

assert.strictEqual(composed.status, 'ready');
assert.strictEqual(composed.phase, 'approach');
assert.strictEqual(composed.startSource, 'road_approach');
assert.strictEqual(composed.routePoints.length, 5, 'Road-to-trail composition should dedupe the shared trailhead point.');
assertCoord(composed.routePoints[0], gps, 'Full route should start at live GPS during approach');
assertCoord(composed.routePoints[2], trailhead, 'Full route should include the trailhead transition point');
assertCoord(composed.routePoints[composed.routePoints.length - 1], trailEnd, 'Full route should end at the final trail point');
assert.strictEqual(composed.transitionRouteIndex, 2);
assert.strictEqual(composed.remainingDistanceM, 3000);
assert.strictEqual(Math.round(composed.progressPercent), 6);

const separatedRoadEnd = coord(39.5, -120.5);
const blocked = buildFullRouteGuidanceModel({
  phase: 'approach',
  currentLocation: gps,
  roadRoutePoints: [gps, separatedRoadEnd],
  roadProgressPoints: [gps],
  roadDistanceM: 1000,
  roadRemainingDistanceM: 900,
  trailGeometry: [trailhead, trailMid, trailEnd],
  trailDistanceM: 2000,
  trailRemainingDistanceM: 2000,
});

assert.strictEqual(blocked.status, 'blocked_gap');
assert(
  blocked.blockedReason && /approach route does not meet the trail start/i.test(blocked.blockedReason),
  'Blocked full-route guidance should explain the road/trail gap.',
);
assert.deepStrictEqual(
  blocked.routePoints,
  [gps, separatedRoadEnd],
  'Blocked guidance must not draw a fabricated connector to the trail end.',
);

const onTrailGps = coord(39.00305, -120.00305);
const onTrail = buildFullRouteGuidanceModel({
  phase: 'approach',
  currentLocation: onTrailGps,
  roadRoutePoints: [gps, roadMid, trailhead],
  roadProgressPoints: [gps],
  roadDistanceM: 1200,
  roadRemainingDistanceM: 800,
  trailGeometry: [trailhead, trailMid, trailEnd],
  trailDistanceM: 2000,
  trailRemainingDistanceM: 900,
});

assert.strictEqual(onTrail.status, 'ready');
assert.strictEqual(onTrail.phase, 'trail');
assert.strictEqual(onTrail.startSource, 'gps_on_trail');
assert(onTrail.trailStartIndex > 0, 'Already-on-trail starts should advance to the nearest forward trail index.');
assertCoord(onTrail.routePoints[0], onTrailGps, 'Already-on-trail route should start at live GPS');
assertCoord(onTrail.routePoints[onTrail.routePoints.length - 1], trailEnd, 'Already-on-trail route should still end at the trail end');
assert.strictEqual(onTrail.remainingDistanceM, 900);

const earlySegmentGps = coord(39.0022, -120.0022);
const earlySegmentStart = buildFullRouteGuidanceModel({
  phase: 'approach',
  currentLocation: earlySegmentGps,
  roadRoutePoints: [gps, roadMid, trailhead],
  roadProgressPoints: [gps],
  roadDistanceM: 1200,
  roadRemainingDistanceM: 800,
  trailGeometry: [trailhead, trailMid, trailEnd],
  trailDistanceM: 2000,
  trailRemainingDistanceM: 1600,
});

assert.strictEqual(earlySegmentStart.status, 'ready');
assert.strictEqual(earlySegmentStart.startSource, 'gps_on_trail');
assertCoord(earlySegmentStart.routePoints[0], earlySegmentGps, 'Early on-trail start should begin at live GPS');
assertCoord(
  earlySegmentStart.routePoints[1],
  trailMid,
  'Early on-trail start should continue to the next forward trail point, not backtrack to the trailhead',
);
assert.notDeepStrictEqual(
  earlySegmentStart.routePoints[1],
  trailhead,
  'Already-on-trail guidance must not force the user back to the trailhead.',
);

const explorePayload = buildExploreNavigationPayload({
  id: 'suggested-full-route',
  name: 'Suggested Full Route',
  region: 'Test Range',
  terrainType: 'Forest road',
  distanceMiles: 2,
  startLat: trailhead.lat,
  startLng: trailhead.lng,
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [trailhead.lng, trailhead.lat],
      [trailMid.lng, trailMid.lat],
      [trailEnd.lng, trailEnd.lat],
    ],
  },
  routeMetadata: { source: 'trail_pack' },
});

assertCoord(
  explorePayload.coordinate,
  trailEnd,
  'Explore handoff should expose the final trail endpoint as the destination coordinate',
);
assertCoord(
  explorePayload.trailheadCoordinate,
  trailhead,
  'Explore handoff should expose the trailhead start coordinate',
);
assertCoord(
  explorePayload.roadDestinationCoordinate,
  trailhead,
  'Explore handoff should expose the trailhead as the road approach destination',
);
assert.strictEqual(explorePayload.tripMode, 'hybrid');

const nearestEndpointPayload = buildExploreNavigationPayload(
  {
    id: 'point-to-point-nearest-endpoint',
    name: 'FR23 North 18 Coldwater',
    region: 'Test Forest',
    terrainType: 'Forest road',
    distanceMiles: 3,
    startLat: 46.01,
    startLng: -122.01,
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-122.0, 46.0],
        [-122.01, 46.01],
        [-122.02, 46.02],
      ],
    },
    routeMetadata: { source: 'trail_pack' },
  },
  {
    approachOriginCoordinate: coord(46.021, -122.021),
  },
);
const nearestTrailhead = coord(46.02, -122.02);
const oppositeEndpoint = coord(46.0, -122.0);
assertCoord(
  nearestEndpointPayload.trailheadCoordinate,
  nearestTrailhead,
  'Explore handoff should snap a stale mid-route start coordinate to the nearest real trail endpoint',
);
assertCoord(
  nearestEndpointPayload.roadDestinationCoordinate,
  nearestTrailhead,
  'Road approach should stop at the selected trail endpoint instead of continuing through the trail',
);
assertCoord(
  nearestEndpointPayload.trailGeometry[0],
  nearestTrailhead,
  'Trail guidance geometry should begin at the selected point-A endpoint',
);
assertCoord(
  nearestEndpointPayload.coordinate,
  oppositeEndpoint,
  'Trail destination should become the opposite endpoint after orienting the point-to-point route',
);

assert(
  navigateSource.includes("type: 'hybrid_route'") &&
    !navigateSource.includes("type: isCustomRoute ? 'hybrid_route' : 'trail'"),
  'Run-backed routes should always stage usable geometry as hybrid_route so Start Route can approach from GPS before trail guidance.',
);
assert(
  navigateSource.includes('roadDestinationCoordinate: trailheadCoordinate') &&
    !navigateSource.includes('roadDestinationCoordinate: isCustomRoute ? trailheadCoordinate : null'),
  'Run-backed routes should expose the route start as the road approach destination for imports, saved routes, stitched routes, and builder routes.',
);
assert(
  navigateSource.includes("tripMode: 'hybrid'") &&
    !navigateSource.includes("tripMode: isCustomRoute ? 'hybrid' : 'trail'"),
  'Run-backed routes should stage hybrid guidance whenever route geometry exists.',
);
assert(
  navigateSource.includes('buildFullRouteGuidanceModel'),
  'Navigate should use the shared full-route guidance composer for hybrid display and session state.',
);
assert(
  navigateSource.includes('fullRouteGuidanceModel.routePoints'),
  'Navigate displayed route points should come from the full-route model when hybrid guidance is staged or active.',
);
assert(
  navigateSource.includes('remainingDistanceM: fullRouteGuidanceModel.remainingDistanceM'),
  'Navigate session snapshots should publish full hybrid remaining distance instead of approach-only remaining distance.',
);
assert(
  navigateSource.includes("primaryActionLabel: activeGuidanceReady ? 'Start Hybrid' : 'Preview Only'") &&
    navigateSource.includes("fullRouteGuidanceModel.status !== 'ready'") &&
    !navigateSource.includes('(!hybridStartCanUseTrail && !route)'),
  'Hybrid preview Start should be selectable for a ready road approach and should not require GPS to already be on the trail.',
);

console.log('Full route guidance checks passed');
