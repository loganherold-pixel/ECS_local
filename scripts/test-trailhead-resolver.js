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
  getTrailRouteCoordinates,
  isValidRouteContextCoordinate,
  normalizeRouteContextCoordinate,
  resolveTrailheadAnchor,
} = require(path.join(root, 'lib', 'routeContext', 'trailheadResolver.ts'));

function assertCoordinate(anchor, lat, lng) {
  assert.strictEqual(Number(anchor.lat.toFixed(6)), lat);
  assert.strictEqual(Number(anchor.lng.toFixed(6)), lng);
}

const userSelectedTrailhead = resolveTrailheadAnchor({
  id: 'user-selected-trailhead',
  userSelectedTrailhead: {
    latitude: 38.46,
    longitude: -109.83,
    name: 'Chosen north access',
    source: 'trip_builder',
    id: 'access-1',
  },
  trailheadCoordinate: {
    latitude: 38.4587,
    longitude: -109.8209,
    source: 'fixture',
    id: 'trailhead-1',
  },
});
assert.strictEqual(userSelectedTrailhead.source, 'user_selected_trailhead');
assertCoordinate(userSelectedTrailhead, 38.46, -109.83);
assert.ok(userSelectedTrailhead.confidence.value > 0.95);
assert.strictEqual(userSelectedTrailhead.providerMetadata.selectedByUser, true);
assert.strictEqual(userSelectedTrailhead.providerMetadata.source, 'trip_builder');
assert.strictEqual(userSelectedTrailhead.providerMetadata.sourceId, 'access-1');

const explicitTrailhead = resolveTrailheadAnchor({
  id: 'explicit-trailhead',
  trailheadCoordinate: {
    latitude: 38.4587,
    longitude: -109.8209,
    source: 'fixture',
    id: 'trailhead-1',
  },
  startLat: 0,
  startLng: 0,
});
assert.strictEqual(explicitTrailhead.source, 'explicit_trailhead');
assertCoordinate(explicitTrailhead, 38.4587, -109.8209);
assert.ok(explicitTrailhead.confidence.value >= 0.9);
assert.strictEqual(explicitTrailhead.providerMetadata.source, 'fixture');
assert.strictEqual(explicitTrailhead.providerMetadata.sourceId, 'trailhead-1');

const explicitStart = resolveTrailheadAnchor({
  id: 'explicit-start',
  startLat: '35.1415',
  startLng: '-115.5107',
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-110, 38],
      [-109, 39],
    ],
  },
});
assert.strictEqual(explicitStart.source, 'explicit_start_coordinate');
assertCoordinate(explicitStart, 35.1415, -115.5107);
assert.ok(explicitStart.confidence.value >= 0.85);

const geometryFirstPoint = resolveTrailheadAnchor({
  id: 'geometry-first-point',
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-110.2, 38.1],
      [-110.0, 38.2],
    ],
  },
});
assert.strictEqual(geometryFirstPoint.source, 'geometry_first_point');
assertCoordinate(geometryFirstPoint, 38.1, -110.2);
assert.ok(geometryFirstPoint.confidence.value > 0.7 && geometryFirstPoint.confidence.value < 0.85);
assert.ok(geometryFirstPoint.warnings.some((item) => item.code === 'fallback_trailhead_used'));

const ambiguousEndpoint = resolveTrailheadAnchor({
  id: 'ambiguous-endpoint',
  geometryEndpoints: [
    {
      lat: 38.7,
      lng: -109.6,
      name: 'Finish overlook',
      routeMileMarker: 42,
    },
    {
      lat: 38.45,
      lng: -109.82,
      name: 'Trailhead parking and staging',
      routeMileMarker: 0,
    },
  ],
});
assert.strictEqual(ambiguousEndpoint.source, 'geometry_endpoint');
assertCoordinate(ambiguousEndpoint, 38.45, -109.82);
assert.ok(ambiguousEndpoint.confidence.value >= 0.55 && ambiguousEndpoint.confidence.value < 0.75);
assert.ok(ambiguousEndpoint.warnings.some((item) => item.code === 'fallback_trailhead_used'));

const poiCoordinate = resolveTrailheadAnchor({
  id: 'poi-coordinate',
  coordinate: { lat: 36.5054, lng: -117.0794, name: 'Hidden gem pin' },
});
assert.strictEqual(poiCoordinate.source, 'poi_coordinate');
assertCoordinate(poiCoordinate, 36.5054, -117.0794);
assert.ok(poiCoordinate.confidence.value >= 0.4 && poiCoordinate.confidence.value < 0.6);

const centroidFallback = resolveTrailheadAnchor({
  id: 'centroid-fallback',
  bounds: {
    minLat: 37,
    minLng: -110,
    maxLat: 39,
    maxLng: -108,
  },
});
assert.strictEqual(centroidFallback.source, 'centroid_fallback');
assertCoordinate(centroidFallback, 38, -109);
assert.ok(centroidFallback.confidence.value > 0 && centroidFallback.confidence.value < 0.4);
assert.ok(centroidFallback.warnings.some((item) => item.code === 'fallback_trailhead_used'));

const invalidCoordinates = resolveTrailheadAnchor({
  id: 'invalid-coordinates',
  trailheadCoordinate: { lat: 120, lng: -109 },
  startCoordinate: { latitude: 38.0228, longitude: -107.6714 },
});
assert.strictEqual(invalidCoordinates.source, 'explicit_start_coordinate');
assertCoordinate(invalidCoordinates, 38.0228, -107.6714);
assert.ok(invalidCoordinates.warnings.some((item) => item.code === 'invalid_coordinate'));
assert.strictEqual(isValidRouteContextCoordinate(91, -109), false);
assert.strictEqual(isValidRouteContextCoordinate(38, -181), false);
assert.strictEqual(isValidRouteContextCoordinate(38, -109), true);

const invalidUserSelectedTrailhead = resolveTrailheadAnchor({
  id: 'invalid-user-selected-trailhead',
  userSelectedTrailhead: { lat: 120, lng: -109, name: 'Bad selected access' },
  trailheadCoordinate: { latitude: 38.0228, longitude: -107.6714 },
});
assert.strictEqual(invalidUserSelectedTrailhead.source, 'explicit_trailhead');
assertCoordinate(invalidUserSelectedTrailhead, 38.0228, -107.6714);
assert.ok(invalidUserSelectedTrailhead.warnings.some((item) => item.code === 'invalid_user_selected_trailhead'));

const missingUserSelectedTrailheadCoordinates = resolveTrailheadAnchor({
  id: 'missing-user-selected-trailhead-coordinates',
  selectedAccessPoint: { name: 'North access gate' },
  startCoordinate: { latitude: 37.7501, longitude: -105.5101 },
});
assert.strictEqual(missingUserSelectedTrailheadCoordinates.source, 'explicit_start_coordinate');
assertCoordinate(missingUserSelectedTrailheadCoordinates, 37.7501, -105.5101);
assert.ok(
  missingUserSelectedTrailheadCoordinates.warnings.some(
    (item) => item.code === 'user_selected_trailhead_missing_coordinates',
  ),
);

const missingCoordinates = resolveTrailheadAnchor({
  id: 'missing-coordinates',
  name: 'No Coordinate Route',
});
assert.strictEqual(missingCoordinates.source, 'unknown');
assert.strictEqual(missingCoordinates.confidence.value, 0);
assert.ok(missingCoordinates.warnings.some((item) => item.code === 'fallback_trailhead_used'));

const stableA = resolveTrailheadAnchor({
  id: 'stable-route',
  routeMetadata: {
    trailheadCoordinate: { lat: 30.45, lng: -98.15 },
  },
});
const stableB = resolveTrailheadAnchor({
  id: 'stable-route',
  routeMetadata: {
    trailheadCoordinate: { lat: 30.45, lng: -98.15 },
  },
});
assert.deepStrictEqual(stableA, stableB);

const normalized = normalizeRouteContextCoordinate([-109.82, 38.45], 'fixture.coordinates');
assert.deepStrictEqual(
  { lat: normalized.lat, lng: normalized.lng, sourcePath: normalized.sourcePath },
  { lat: 38.45, lng: -109.82, sourcePath: 'fixture.coordinates' },
);

const routeCoordinates = getTrailRouteCoordinates({
  id: 'route-coordinates',
  trailGeometry: [
    { latitude: 38.1, longitude: -110.2 },
    { latitude: 38.2, longitude: -110.1 },
  ],
});
assert.deepStrictEqual(routeCoordinates, [
  { lat: 38.1, lng: -110.2, label: null },
  { lat: 38.2, lng: -110.1, label: null },
]);

console.log('Trailhead Resolver checks passed.');
