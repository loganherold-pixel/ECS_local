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

const {
  buildActiveGuidanceProgressPath,
  resolveActiveGuidanceDisplayLocation,
  resolveNavigateMapUserLocation,
} = require(path.join(root, 'lib', 'activeGuidanceProgressPath.ts'));

function coord(lat, lng) {
  return { lat, lng };
}

function assertCoord(actual, expected, message) {
  assert(actual, `${message}: missing coordinate`);
  assert.strictEqual(Number(actual.lat.toFixed(6)), Number(expected.lat.toFixed(6)), `${message}: latitude`);
  assert.strictEqual(Number(actual.lng.toFixed(6)), Number(expected.lng.toFixed(6)), `${message}: longitude`);
}

const routeStart = coord(38.78069, -121.20755);
const routeMid = coord(38.786, -121.214);
const routeEnd = coord(38.792, -121.22);
const straightRoadStart = coord(38.78, -121.2);
const straightRoadMid = coord(38.786, -121.2);
const straightRoadEnd = coord(38.792, -121.2);

const liveGpsOffRoute = coord(38.78211, -121.20988);
const sparseProgress = buildActiveGuidanceProgressPath({
  active: true,
  routePoints: [routeStart, routeMid, routeEnd],
  progressPoints: [routeStart],
  currentLocation: liveGpsOffRoute,
});

assert.strictEqual(sparseProgress.length, 1, 'Sparse progress must not fabricate a straight line from route start to live GPS.');
assertCoord(sparseProgress[0], routeStart, 'Sparse progress should begin at the route start');

const snappedProgressPoint = coord(38.784, -121.211);
const liveGpsPastSnap = coord(38.78455, -121.21033);
const snappedProgress = buildActiveGuidanceProgressPath({
  active: true,
  routePoints: [routeStart, routeMid, routeEnd],
  progressPoints: [routeStart, snappedProgressPoint],
  currentLocation: liveGpsPastSnap,
});

assert.strictEqual(snappedProgress.length, 2, 'Active progress should preserve snapped geometry without drawing an off-route connector.');
assertCoord(snappedProgress[1], snappedProgressPoint, 'Snapped progress point should remain in the displayed path');

const liveGpsOnSnap = coord(38.7840004, -121.2110004);
const nearSnappedProgress = buildActiveGuidanceProgressPath({
  active: true,
  routePoints: [routeStart, routeMid, routeEnd],
  progressPoints: [routeStart, snappedProgressPoint],
  currentLocation: liveGpsOnSnap,
});

assert.strictEqual(nearSnappedProgress.length, 2, 'Near-identical live GPS should not duplicate the snapped progress endpoint.');
assertCoord(nearSnappedProgress[nearSnappedProgress.length - 1], snappedProgressPoint, 'Snapped endpoint should remain stable for tiny GPS jitter');

const inactiveProgress = buildActiveGuidanceProgressPath({
  active: false,
  routePoints: [routeStart, routeMid, routeEnd],
  progressPoints: [routeStart, snappedProgressPoint],
  currentLocation: liveGpsPastSnap,
});

assert.strictEqual(inactiveProgress.length, 2, 'Inactive previews should not append live GPS to progress.');
assertCoord(inactiveProgress[inactiveProgress.length - 1], snappedProgressPoint, 'Inactive progress should keep the original endpoint');

const sameTerminalProgress = buildActiveGuidanceProgressPath({
  active: true,
  routePoints: [routeStart, routeMid, routeEnd],
  progressPoints: [routeStart, liveGpsPastSnap],
  currentLocation: { latitude: liveGpsPastSnap.lat, longitude: liveGpsPastSnap.lng },
});

assert.strictEqual(sameTerminalProgress.length, 2, 'Existing live-GPS terminal points should not duplicate.');
assertCoord(sameTerminalProgress[sameTerminalProgress.length - 1], liveGpsPastSnap, 'Existing terminal should remain live GPS');

const nearRoadDisplayLocation = resolveActiveGuidanceDisplayLocation({
  active: true,
  routePoints: [straightRoadStart, straightRoadMid, straightRoadEnd],
  currentLocation: { lat: 38.786, lng: -121.2002 },
  maxSnapDistanceM: 45,
});

assertCoord(
  nearRoadDisplayLocation,
  straightRoadMid,
  'Near-route GPS should display snapped to the route spine during active guidance',
);

const progressLineDisplayLocation = resolveActiveGuidanceDisplayLocation({
  active: true,
  routePoints: [
    coord(38.78, -121.2),
    coord(38.79, -121.2),
    coord(38.79, -121.2001),
    coord(38.78, -121.2001),
  ],
  progressPoints: [coord(38.78, -121.2), coord(38.7858, -121.2)],
  currentLocation: { lat: 38.7858, lng: -121.20007 },
  maxSnapDistanceM: 45,
});

assertCoord(
  progressLineDisplayLocation,
  { lat: 38.7858, lng: -121.2 },
  'On-route GPS should display centered on the visible yellow guidance/progress line when that line is available',
);

const offRouteDisplayLocation = resolveActiveGuidanceDisplayLocation({
  active: true,
  routePoints: [routeStart, routeMid, routeEnd],
  currentLocation: { lat: 38.81, lng: -121.18 },
  maxSnapDistanceM: 20,
});

assertCoord(
  offRouteDisplayLocation,
  { lat: 38.81, lng: -121.18 },
  'Materially off-route GPS should display at the raw GPS coordinate',
);

const authoritativeProjection = resolveActiveGuidanceDisplayLocation({
  active: true,
  routePoints: [routeStart, routeMid, routeEnd],
  progressPoints: [routeStart, routeMid],
  currentLocation: { lat: 38.7862, lng: -121.2137 },
  snappedLocation: routeMid,
  isOffRoute: false,
});
assertCoord(
  authoritativeProjection,
  routeMid,
  'Mounted display should use the controller-accepted canonical progress point.',
);
const rawMapMarker = resolveNavigateMapUserLocation({
  rawLocation: { lat: 38.7862, lng: -121.2137 },
  locationAccessGranted: true,
  mapFrozen: false,
});
assertCoord(
  rawMapMarker,
  { lat: 38.7862, lng: -121.2137 },
  'The user-location marker and follow camera must retain raw GPS while canonical progress remains projected.',
);
assert.notDeepStrictEqual(
  rawMapMarker,
  authoritativeProjection,
  'Projecting guidance progress must not overwrite the raw GPS marker.',
);
assert.strictEqual(
  resolveNavigateMapUserLocation({
    rawLocation: { lat: 38.7862, lng: -121.2137 },
    locationAccessGranted: false,
  }),
  null,
  'Location permission still controls whether the raw user marker is shown.',
);

const authoritativeOffRoute = resolveActiveGuidanceDisplayLocation({
  active: true,
  routePoints: [routeStart, routeMid, routeEnd],
  progressPoints: [routeStart, routeMid],
  currentLocation: { lat: 38.81, lng: -121.18 },
  snappedLocation: routeMid,
  isOffRoute: true,
});
assertCoord(
  authoritativeOffRoute,
  { lat: 38.81, lng: -121.18 },
  'Confirmed off-route display should preserve raw GPS instead of forcing a snap.',
);

const inactiveDisplayLocation = resolveActiveGuidanceDisplayLocation({
  active: false,
  routePoints: [straightRoadStart, straightRoadMid, straightRoadEnd],
  currentLocation: { lat: 38.786, lng: -121.2002 },
  maxSnapDistanceM: 45,
});

assertCoord(
  inactiveDisplayLocation,
  { lat: 38.786, lng: -121.2002 },
  'Inactive map displays should not snap the user dot to route geometry',
);

const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
assert(
  navigateSource.includes('resolveNavigateMapUserLocation({'),
  'The mounted Navigate map must use the tested raw-location presentation selector.',
);

console.log('[active-guidance-live-gps-progress] passed');
