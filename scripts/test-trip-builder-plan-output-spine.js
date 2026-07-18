const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
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
  buildTripBuilderPlanOutputSpine,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderPlanOutputSpine.ts'));

const origin = { latitude: 39, longitude: -121.5 };
const fuel = { latitude: 39.08, longitude: -121.46 };
const trailhead = { latitude: 39.2, longitude: -121.4 };
const trailEnd = { latitude: 39.32, longitude: -121.31 };
const route = {
  id: 'route-1',
  name: 'Prepared route',
  routeType: 'point_to_point',
  trailheadStart: trailhead,
  trailEnd,
  routeGeometry: {
    type: 'LineString',
    coordinates: [trailEnd, { latitude: 39.26, longitude: -121.35 }, trailhead]
      .map((point) => [point.longitude, point.latitude]),
  },
  trailGeometry: {
    type: 'LineString',
    coordinates: [trailEnd, { latitude: 39.26, longitude: -121.35 }, trailhead]
      .map((point) => [point.longitude, point.latitude]),
  },
  routeMetadata: { isTrailGeometry: true, geometryRole: 'trail' },
};
const preparedRoadRoute = {
  geometry: [origin, fuel, trailhead].map((point) => ({
    lat: point.latitude,
    lng: point.longitude,
  })),
};

const input = {
  route,
  origin,
  trailhead,
  trailEnd,
  preparedRoadRoute,
  fallbackApproachGeometry: [origin, trailhead],
};
const offline = buildTripBuilderPlanOutputSpine(input);
const saved = buildTripBuilderPlanOutputSpine(input);
const navigate = buildTripBuilderPlanOutputSpine(input);

assert.strictEqual(offline.status, 'ready');
assert.strictEqual(offline.source, 'prepared_road_route');
assert.strictEqual(offline.sourceLineCount, 1);
assert.strictEqual(offline.lineString.type, 'LineString');
assert.deepStrictEqual(offline.lineString, saved.lineString);
assert.deepStrictEqual(saved.lineString, navigate.lineString);
assert.strictEqual(offline.fingerprint, saved.fingerprint);
assert.strictEqual(saved.fingerprint, navigate.fingerprint);
assert.deepStrictEqual(offline.coordinates[0], origin);
assert.ok(
  offline.coordinates.some((point) =>
    Math.abs(point.latitude - fuel.latitude) < 0.000001 &&
    Math.abs(point.longitude - fuel.longitude) < 0.000001),
  'The shared output spine should preserve the selected resupply waypoint.',
);
assert.strictEqual(
  offline.coordinates.filter((point) =>
    Math.abs(point.latitude - trailhead.latitude) < 0.000001 &&
    Math.abs(point.longitude - trailhead.longitude) < 0.000001).length,
  1,
  'Road and trail geometry should join once at the trailhead.',
);
assert.deepStrictEqual(offline.coordinates[offline.coordinates.length - 1], trailEnd);

const disconnected = buildTripBuilderPlanOutputSpine({
  ...input,
  preparedRoadRoute: {
    geometry: [origin, { lat: 40, lng: -120 }],
  },
});
assert.strictEqual(disconnected.source, 'canonical_trail');
assert.strictEqual(disconnected.status, 'trail_only');
assert.strictEqual(disconnected.approachSafeCode, 'TRIP_BUILDER_SPINE_APPROACH_TRAILHEAD_DISJOINT');
assert.deepStrictEqual(disconnected.coordinates[0], trailhead);
assert.deepStrictEqual(disconnected.coordinates[disconnected.coordinates.length - 1], trailEnd);

console.log('Trip Builder shared plan-output spine behavioral checks passed.');
