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

const geometry = require(path.join(root, 'lib', 'routeContext', 'routeContextGeometry.ts'));

const {
  boundingBoxFromCoordinates,
  combineRouteSegmentsIntoGeometry,
  createRouteCorridor,
  decodeEncodedPolyline,
  estimateDistanceFromRouteMeters,
  expandBoundingBoxByKilometers,
  expandBoundingBoxByMeters,
  haversineDistanceMeters,
  isPointInRouteCorridor,
  nearestPointOnRoute,
  normalizeRouteGeometryCoordinates,
  sampleRouteAtIntervalMeters,
  totalRouteDistanceMeters,
} = geometry;

function approx(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

const origin = { lat: 38, lng: -110 };
const oneDegreeNorth = { lat: 39, lng: -110 };
const northDistance = haversineDistanceMeters(origin, oneDegreeNorth);
approx(northDistance, 111195, 350, 'one degree latitude should be about 111.2 km');
assert.strictEqual(haversineDistanceMeters({ lat: 91, lng: -110 }, origin), null);

const route = [
  { lat: 38, lng: -110 },
  { lat: 38, lng: -109.99 },
  { lat: 38.01, lng: -109.99 },
];
const totalDistance = totalRouteDistanceMeters(route);
assert.ok(totalDistance > 1900 && totalDistance < 2100, 'total route distance should sum segment distances');
assert.strictEqual(totalRouteDistanceMeters([{ lat: 999, lng: -110 }]), 0);

const bbox = boundingBoxFromCoordinates(route);
assert.deepStrictEqual(bbox, {
  west: -110,
  south: 38,
  east: -109.99,
  north: 38.01,
});
assert.strictEqual(boundingBoxFromCoordinates([]), null);
assert.strictEqual(boundingBoxFromCoordinates([{ lat: 200, lng: 200 }]), null);

const expandedMeters = expandBoundingBoxByMeters(bbox, 1000);
assert.ok(expandedMeters.west < bbox.west);
assert.ok(expandedMeters.south < bbox.south);
assert.ok(expandedMeters.east > bbox.east);
assert.ok(expandedMeters.north > bbox.north);
const expandedKm = expandBoundingBoxByKilometers(bbox, 1);
approx(expandedKm.north, expandedMeters.north, 0.0001, 'km and meter expansion should agree');
assert.strictEqual(expandBoundingBoxByMeters(null, 1000), null);

const sampled = sampleRouteAtIntervalMeters([
  { lat: 0, lng: 0 },
  { lat: 0, lng: 0.03 },
], 1000);
assert.ok(sampled.length >= 4, 'sampling should include interval points and final point');
assert.deepStrictEqual(sampled[0], { lat: 0, lng: 0 });
approx(sampled[sampled.length - 1].lng, 0.03, 0.000001, 'sampling should preserve final point');
assert.deepStrictEqual(sampleRouteAtIntervalMeters([], 1000), []);
assert.deepStrictEqual(sampleRouteAtIntervalMeters([{ lat: 0, lng: 0 }], 1000), [{ lat: 0, lng: 0 }]);

const nearest = nearestPointOnRoute(
  { lat: 0.01, lng: 0.015 },
  [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.03 },
  ],
);
assert.ok(nearest, 'nearest point should resolve for valid route');
approx(nearest.point.lat, 0, 0.000001, 'nearest point should project onto route latitude');
approx(nearest.point.lng, 0.015, 0.0002, 'nearest point should project onto route longitude');
assert.strictEqual(nearest.segmentIndex, 0);
assert.ok(nearest.distanceMeters > 1000 && nearest.distanceMeters < 1200);
assert.strictEqual(nearestPointOnRoute({ lat: 0, lng: 0 }, []), null);
assert.strictEqual(estimateDistanceFromRouteMeters({ lat: 0, lng: 0 }, []), null);

const corridorRoute = [
  { lat: 38, lng: -110 },
  { lat: 38, lng: -109.98 },
];
const corridor = createRouteCorridor(corridorRoute, 500, 250);
assert.ok(corridor);
assert.strictEqual(corridor.bufferMeters, 500);
assert.ok(corridor.widthMeters === 1000);
assert.ok(corridor.centerline.length > corridorRoute.length);
assert.strictEqual(isPointInRouteCorridor({ lat: 38.001, lng: -109.99 }, corridorRoute, 500), true);
assert.strictEqual(isPointInRouteCorridor({ lat: 38.02, lng: -109.99 }, corridorRoute, 500), false);
assert.strictEqual(createRouteCorridor([], 500), null);

const combined = combineRouteSegmentsIntoGeometry(
  [
    {
      id: 'a',
      coordinates: [
        { lat: 38, lng: -110 },
        { lat: 38, lng: -109.99 },
      ],
      durationSeconds: 120,
    },
    {
      id: 'b',
      start: { lat: 38, lng: -109.99 },
      end: { lat: 38.01, lng: -109.99 },
      durationSeconds: 180,
    },
  ],
  {
    origin: { lat: 37.99, lng: -110.01 },
    corridorBufferMeters: 500,
    providerMetadata: { source: 'fixture' },
  },
);
assert.ok(combined);
assert.strictEqual(combined.coordinates.length, 3);
assert.strictEqual(combined.segments.length, 2);
assert.strictEqual(combined.durationSeconds, 300);
assert.ok(combined.distanceMeters > 1900 && combined.distanceMeters < 2100);
assert.ok(combined.corridor);
assert.strictEqual(combineRouteSegmentsIntoGeometry([]), null);

const decoded = decodeEncodedPolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
assert.strictEqual(decoded.length, 3);
approx(decoded[0].lat, 38.5, 0.00001, 'decoded first latitude');
approx(decoded[0].lng, -120.2, 0.00001, 'decoded first longitude');
approx(decoded[2].lat, 43.252, 0.00001, 'decoded last latitude');
approx(decoded[2].lng, -126.453, 0.00001, 'decoded last longitude');
assert.deepStrictEqual(decodeEncodedPolyline('not a valid polyline'), []);

const normalizedGeoJson = normalizeRouteGeometryCoordinates({
  type: 'LineString',
  coordinates: [
    [-110, 38],
    ['bad', 40],
    [-109.9, 38.1],
  ],
});
assert.deepStrictEqual(normalizedGeoJson, [
  { lat: 38, lng: -110 },
  { lat: 38.1, lng: -109.9 },
]);

console.log('Route Context geometry utility checks passed.');
