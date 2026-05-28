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
  cacheRouteGeometry,
  clearRouteGeometryCache,
  createRouteGeometryFingerprint,
  getCachedRouteGeometry,
  getRouteGeometryCacheKey,
  normalizeRouteGeometryLineString,
  routeGeometryLineStringToLatLng,
  validateRouteGeometry,
} = require(path.join(root, 'lib/routeGeometryLifecycle.ts'));

clearRouteGeometryCache();

const roadShape = {
  id: 'road-route-test',
  geometry: [
    { lat: 38.1, lng: -121.2 },
    { lat: 38.2, lng: -121.3 },
    { lat: 38.3, lng: -121.4 },
  ],
};
const roadLine = normalizeRouteGeometryLineString(roadShape);
assert.deepStrictEqual(
  roadLine,
  {
    type: 'LineString',
    coordinates: [
      [-121.2, 38.1],
      [-121.3, 38.2],
      [-121.4, 38.3],
    ],
  },
  'Road route geometry should normalize to GeoJSON LineString [lng, lat] coordinates.',
);

const geoJsonLine = normalizeRouteGeometryLineString({
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [
      [-120.1, 39.1],
      [-120.2, 39.2],
    ],
  },
});
assert.strictEqual(geoJsonLine.coordinates[0][0], -120.1, 'GeoJSON longitude should be preserved.');
assert.strictEqual(geoJsonLine.coordinates[0][1], 39.1, 'GeoJSON latitude should be preserved.');

const segmentedLine = normalizeRouteGeometryLineString({
  segments: [
    {
      points: [
        { latitude: 36.1, longitude: -119.1 },
        { latitude: 36.2, longitude: -119.2 },
      ],
    },
    {
      points: [
        { lat: 36.3, lon: -119.3 },
        { lat: 36.4, lon: -119.4 },
      ],
    },
  ],
});
assert.strictEqual(segmentedLine.coordinates.length, 4, 'Segmented route geometry should be flattened.');
assert.deepStrictEqual(
  routeGeometryLineStringToLatLng(segmentedLine)[3],
  { lat: 36.4, lng: -119.4 },
  'LineString conversion should return app lat/lng points without swapping axes.',
);

const malformed = validateRouteGeometry({ geometry: [{ lat: 35, lng: -118 }] });
assert.strictEqual(malformed.valid, false, 'One-point geometry should not validate as a route.');
assert.strictEqual(malformed.reason, 'geometry_malformed', 'Malformed geometry should have a specific reason.');

const missing = validateRouteGeometry({ id: 'metadata-only-route', title: 'Metadata only' });
assert.strictEqual(missing.reason, 'route_selected_geometry_missing', 'Metadata-only routes should be distinguished from malformed geometry.');

const fingerprint = createRouteGeometryFingerprint(roadLine);
assert.ok(fingerprint.startsWith('line:3:'), 'Route fingerprints should include point count and stable line identity.');

const cacheKey = getRouteGeometryCacheKey(roadShape);
assert.strictEqual(cacheKey, 'route:road-route-test', 'Stable route IDs should be used for route geometry cache keys.');
cacheRouteGeometry(cacheKey, roadShape);
assert.deepStrictEqual(
  getCachedRouteGeometry(cacheKey),
  roadLine,
  'Route geometry cache should round-trip normalized LineString geometry.',
);

const helperSource = read('lib/routeGeometryLifecycle.ts');
assert.ok(
  helperSource.includes('normalizeRouteGeometryLineString'),
  'Route geometry lifecycle should expose the single shared LineString normalizer.',
);
assert.ok(
  helperSource.includes('geometry_cache_miss') &&
    helperSource.includes('geometry_malformed') &&
    helperSource.includes('route_selected_geometry_missing') &&
    helperSource.includes('no_route_selected') &&
    helperSource.includes('geometry_successfully_loaded'),
  'Route geometry lifecycle logging should distinguish every requested geometry state.',
);

const roadNavigation = read('lib/useRoadNavigation.ts');
assert.ok(
  roadNavigation.includes('ensureRoadRouteGeometry(route') &&
    roadNavigation.includes('buildCachedRoadRouteFromRestoredSession') &&
    roadNavigation.includes('routeGeometryLineStringToLatLng'),
  'Road navigation should validate and cache geometry before preview or active guidance.',
);
assert.ok(
  roadNavigation.includes("status: 'destination_selected'") &&
    roadNavigation.includes('throw new Error(\'Route geometry unavailable\')'),
  'Road navigation should not enter preview/active states with missing geometry.',
);

const roadStore = read('lib/roadNavigationStore.ts');
assert.ok(
  roadStore.includes('routeGeometry?: RoadNavCoordinate[]') &&
    roadStore.includes('routeGeometryCacheKey?: string | null'),
  'Persisted road navigation sessions should retain route geometry and cache metadata.',
);

const sessionStore = read('lib/navigateRouteSessionStore.ts');
assert.ok(
  sessionStore.includes('validateRouteGeometry(road.routeGeometry)') &&
    sessionStore.includes('routeGeometryLineStringToLatLng(routeGeometryValidation.lineString)'),
  'Cross-tab route session restore should reject metadata-only road routes.',
);

const routeLifecycle = read('lib/routeLifecycleState.ts');
assert.ok(
  routeLifecycle.includes('roadHasValidGeometry?: boolean') &&
    routeLifecycle.includes('Route geometry unavailable'),
  'Route lifecycle state should gate preview/ready/navigating phases on valid geometry.',
);

console.log('Route geometry lifecycle checks passed.');
