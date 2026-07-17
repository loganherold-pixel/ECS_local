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
  normalizeCanonicalRouteGeometry,
  normalizeRouteGeometryLineString,
} = require(path.join(root, 'lib', 'routeGeometryLifecycle.ts'));
const {
  normalizeRouteCoordinates,
} = require(path.join(root, 'lib', 'map', 'routeGeometryUtils.ts'));

const lineString = {
  type: 'LineString',
  coordinates: [
    [-120.1, 39.1],
    [-120.2, 39.2],
  ],
};

const canonicalLine = normalizeCanonicalRouteGeometry(lineString);
assert.strictEqual(canonicalLine.valid, true, 'Canonical normalizer should accept GeoJSON LineString geometry.');
assert.strictEqual(canonicalLine.status, 'valid');
assert.strictEqual(canonicalLine.sourceType, 'geojson_linestring');
assert.strictEqual(canonicalLine.geometryType, 'LineString');
assert.strictEqual(canonicalLine.authority, 'unknown');
assert.deepStrictEqual(canonicalLine.coordinates, lineString.coordinates);
assert.deepStrictEqual(canonicalLine.latitudeLongitude[0], { latitude: 39.1, longitude: -120.1 });
assert.deepStrictEqual(canonicalLine.latLng[1], { lat: 39.2, lng: -120.2 });
assert.ok(canonicalLine.fingerprint.startsWith('line:2:'), 'Valid geometry should carry a stable fingerprint.');

const feature = normalizeCanonicalRouteGeometry({
  type: 'Feature',
  properties: { source: 'operator' },
  geometry: lineString,
});
assert.strictEqual(feature.valid, true, 'Canonical normalizer should accept GeoJSON Feature geometry.');
assert.strictEqual(feature.sourceType, 'geojson_feature');
assert.strictEqual(feature.geometryType, 'LineString');

const featureCollection = normalizeCanonicalRouteGeometry({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: lineString },
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-120.3, 39.3],
          [-120.4, 39.4],
        ],
      },
    },
  ],
});
assert.strictEqual(featureCollection.valid, true, 'FeatureCollection geometry should flatten safely.');
assert.strictEqual(featureCollection.sourceType, 'geojson_feature_collection');
assert.strictEqual(featureCollection.pointCount, 4);

const rawArray = normalizeCanonicalRouteGeometry([
  { lat: 38.1, lng: -121.1 },
  { latitude: 38.2, longitude: -121.2 },
]);
assert.strictEqual(rawArray.valid, true, 'Raw coordinate arrays should still normalize.');
assert.strictEqual(rawArray.sourceType, 'raw_coordinate_array');
assert.deepStrictEqual(rawArray.coordinates, [
  [-121.1, 38.1],
  [-121.2, 38.2],
]);

const encoded = normalizeCanonicalRouteGeometry({
  encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
  routeMetadata: {
    geometryRole: 'approach',
    source: 'mapbox',
  },
});
assert.strictEqual(encoded.valid, true, 'Encoded polyline geometry should decode through the canonical normalizer.');
assert.strictEqual(encoded.sourceType, 'encoded_polyline');
assert.strictEqual(encoded.authority, 'approach');
assert.strictEqual(encoded.isApproachOnly, true);
assert.strictEqual(encoded.pointCount, 3);
assert.deepStrictEqual(encoded.latitudeLongitude[0], { latitude: 38.5, longitude: -120.2 });

const explicitTrail = normalizeCanonicalRouteGeometry({
  trailGeometry: lineString,
  routeMetadata: {
    source: 'trip_builder_import',
    isTrailGeometry: true,
  },
});
assert.strictEqual(explicitTrail.valid, true);
assert.strictEqual(explicitTrail.authority, 'trail');
assert.strictEqual(explicitTrail.isTrailGeometry, true);
assert.strictEqual(explicitTrail.isPreviewOrDemo, false);

const routeWithSemanticGeometryFields = normalizeCanonicalRouteGeometry({
  routeGeometry: lineString,
  trailGeometry: lineString,
  approachGeometry: {
    type: 'LineString',
    coordinates: [
      [-120.3, 39],
      [-120.1, 39.1],
    ],
  },
  routeMetadata: {
    source: 'trip_builder_import',
    isTrailGeometry: true,
  },
});
assert.deepStrictEqual(
  routeWithSemanticGeometryFields.coordinates,
  lineString.coordinates,
  'A plain route object should select one authoritative trail geometry instead of concatenating duplicate and approach fields.',
);
assert.strictEqual(routeWithSemanticGeometryFields.pointCount, 2);

const preview = normalizeCanonicalRouteGeometry({
  routeGeometry: lineString,
  routeMetadata: {
    previewMetadataStatus: 'geometry',
    source: 'discover_preview',
  },
});
assert.strictEqual(preview.valid, true, 'Preview geometry is valid for rendering.');
assert.strictEqual(preview.authority, 'preview', 'Preview geometry must remain marked as preview.');
assert.strictEqual(preview.isTrailGeometry, false, 'Preview geometry must not be promoted to trail authority.');
assert.strictEqual(preview.isPreviewOrDemo, true);

const demo = normalizeCanonicalRouteGeometry({
  routeGeometry: lineString,
  routeMetadata: {
    geometrySource: 'ecs_demo_full_route_fixture',
    routeScope: 'full_trail_route',
  },
});
assert.strictEqual(demo.valid, true, 'Demo fixture geometry is renderable.');
assert.strictEqual(demo.authority, 'demo', 'Demo fixture geometry must remain labeled as demo.');
assert.strictEqual(demo.isTrailGeometry, false, 'Demo fixture geometry must not be promoted as verified trail geometry.');

const missing = normalizeCanonicalRouteGeometry(null);
assert.strictEqual(missing.valid, false);
assert.strictEqual(missing.status, 'missing');
assert.strictEqual(missing.reason, 'no_route_selected');

const malformed = normalizeCanonicalRouteGeometry({ geometry: [{ lat: 38, lng: -120 }] });
assert.strictEqual(malformed.valid, false);
assert.strictEqual(malformed.status, 'malformed');
assert.strictEqual(malformed.reason, 'geometry_malformed');

assert.deepStrictEqual(
  normalizeRouteGeometryLineString(lineString),
  lineString,
  'Legacy LineString export should stay compatible with canonical normalization.',
);
assert.deepStrictEqual(
  normalizeRouteCoordinates({
    type: 'LineString',
    coordinates: [
      [-110, 38],
      [-109.9, 38.1],
    ],
  }),
  [
    { latitude: 38, longitude: -110 },
    { latitude: 38.1, longitude: -109.9 },
  ],
  'Map route coordinate helper should be a thin consumer of canonical geometry normalization.',
);

const tripBuilderSource = read('app/explore-trip-builder.tsx');
assert.ok(
  tripBuilderSource.includes('normalizeCanonicalRouteGeometry'),
  'Trip Builder route import and preview checks should use the canonical geometry normalizer.',
);
assert.ok(
  tripBuilderSource.includes("tripBuilderTrailGeometrySource: 'operator_supplied_route_file'"),
  'Trip Builder should label only operator-supplied route files as trail geometry when building live itinerary previews.',
);
assert.ok(
  !tripBuilderSource.includes("previewStatus === 'geometry'") &&
    !tripBuilderSource.includes('record.routeGeometry != null') &&
    !tripBuilderSource.includes("tripBuilderTrailGeometrySource: 'selected_route_preview'"),
  'Trip Builder should not promote preview/demo route geometry to true trail geometry.',
);

console.log('Canonical route geometry normalizer checks passed.');
