const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'lib', 'routeCatalogViewport.ts');

function compileTypescript(module, filename) {
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
}

require.extensions['.ts'] = compileTypescript;

assert(fs.existsSync(modulePath), 'Shared route catalog viewport service should exist.');

const {
  ROUTE_CATALOG_VIEWPORT_DEFAULT_LIMIT,
  RouteCatalogViewportCache,
  buildRouteCatalogViewportQuery,
  queryRouteCatalogViewportRecords,
  routeCatalogViewportFeaturesToRouteGeometrySegments,
} = require(modulePath);

const nowIso = new Date().toISOString();
const tahoeViewport = {
  minLng: -120.72,
  minLat: 39.18,
  maxLng: -120.28,
  maxLat: 39.42,
};

function officialSource(label = 'USFS MVUM') {
  return {
    provider_id: 'usfs_mvum',
    label,
    source_type: 'federal_agency',
    authority: 'USFS MVUM official agency source',
    last_verified_at: nowIso,
    attribution: 'USDA Forest Service',
    license: 'public domain',
  };
}

function catalogRoute(overrides = {}) {
  return {
    id: 'route-a',
    public_id: 'route-a',
    name: 'Tahoe Connector',
    route_type: 'point_to_point',
    center_latitude: 39.3,
    center_longitude: -120.5,
    distance_miles: 12.4,
    official_access_coverage_pct: 100,
    unknown_access_coverage_pct: 0,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: 0,
    vehicle_mismatch: false,
    geometry_quality: 'full',
    verification_status: 'official_verified',
    recommendation_status: 'recommendable',
    review_status: 'approved',
    confidence_score: 92,
    tags: ['Tahoe National Forest', 'tahoe_nf', 'overland'],
    source_records: [officialSource()],
    route_geometry_mode: 'full',
    route_geometry: {
      type: 'LineString',
      coordinates: [
        [-120.66, 39.23],
        [-120.52, 39.31],
        [-120.34, 39.38],
      ],
    },
    updated_at: nowIso,
    created_at: nowIso,
    ...overrides,
  };
}

const records = [
  catalogRoute(),
  catalogRoute({
    id: 'route-outside-center-inside-line',
    public_id: 'route-outside-center-inside-line',
    name: 'Eldorado Edge Connector',
    center_latitude: 38.98,
    center_longitude: -120.86,
    tags: ['Eldorado National Forest', 'eldorado_nf'],
    route_geometry: {
      type: 'LineString',
      coordinates: [
        [-120.92, 38.95],
        [-120.56, 39.2],
        [-120.44, 39.24],
      ],
    },
  }),
  catalogRoute({
    id: 'trailhead-only',
    public_id: 'trailhead-only',
    name: 'Plumas Trailhead Only',
    center_latitude: 39.34,
    center_longitude: -120.45,
    distance_miles: 0,
    tags: ['Plumas National Forest', 'plumas_nf'],
    route_geometry_mode: 'omitted',
    route_geometry: null,
  }),
  catalogRoute({
    id: 'preview-only',
    public_id: 'preview-only',
    name: 'Mendocino Preview Geometry',
    center_latitude: 39.26,
    center_longitude: -120.41,
    tags: ['Mendocino National Forest', 'mendocino_nf'],
    route_geometry_mode: 'preview_simplified',
    route_geometry: {
      type: 'LineString',
      coordinates: [
        [-120.44, 39.26],
        [-120.4, 39.27],
      ],
    },
  }),
  catalogRoute({
    id: 'outside',
    public_id: 'outside',
    name: 'Outside View',
    center_latitude: 40.4,
    center_longitude: -121.6,
    tags: ['Lassen National Forest', 'lassen_nf'],
    route_geometry: {
      type: 'LineString',
      coordinates: [
        [-121.7, 40.2],
        [-121.6, 40.4],
      ],
    },
  }),
];

const query = buildRouteCatalogViewportQuery({
  bbox: tahoeViewport,
  zoom: 11.2,
  regionTags: ['tahoe_nf', 'eldorado_nf', 'plumas_nf', 'mendocino_nf'],
});

assert.strictEqual(query.limit, ROUTE_CATALOG_VIEWPORT_DEFAULT_LIMIT);
assert(query.radiusMiles >= 15, 'Viewport query should derive a usable radius from the map bounds.');

const result = queryRouteCatalogViewportRecords(records, query);
assert.strictEqual(result.candidateCount, 5);
assert.strictEqual(result.featureCollection.type, 'FeatureCollection');
assert.strictEqual(result.featureCollection.features.length, 4, 'Viewport should include geometry intersections and centroid fallback markers.');

const tahoe = result.featureCollection.features.find((feature) => feature.properties.routeId === 'route-a');
assert(tahoe, 'Tahoe route should be returned.');
assert.strictEqual(tahoe.geometry.type, 'LineString');
assert.strictEqual(tahoe.properties.title, 'Tahoe Connector');
assert.strictEqual(tahoe.properties.forest, 'Tahoe National Forest');
assert.strictEqual(tahoe.properties.distanceMiles, 12.4);
assert.strictEqual(tahoe.properties.tripType, 'point_to_point');
assert.strictEqual(tahoe.properties.geometryStatus, 'guidance_ready');
assert.strictEqual(tahoe.properties.guidanceReady, true);
assert.strictEqual(tahoe.properties.source, 'route_catalog');
assert.deepStrictEqual(tahoe.properties.segmentIds, ['route-a']);

const crossing = result.featureCollection.features.find((feature) => feature.properties.routeId === 'route-outside-center-inside-line');
assert(crossing, 'A route whose center is outside but geometry intersects the viewport should be returned.');
assert.strictEqual(crossing.geometry.type, 'LineString');
assert.strictEqual(crossing.properties.forest, 'Eldorado National Forest');

const trailheadOnly = result.featureCollection.features.find((feature) => feature.properties.routeId === 'trailhead-only');
assert(trailheadOnly, 'Routes without geometry should appear as honest centroid/trailhead markers.');
assert.strictEqual(trailheadOnly.geometry.type, 'Point');
assert.strictEqual(trailheadOnly.properties.geometryStatus, 'trailhead_only');
assert.strictEqual(trailheadOnly.properties.guidanceReady, false);

const preview = result.featureCollection.features.find((feature) => feature.properties.routeId === 'preview-only');
assert(preview, 'Preview geometry should still be visible.');
assert.strictEqual(preview.geometry.type, 'LineString');
assert.strictEqual(preview.properties.geometryStatus, 'preview_geometry');
assert.strictEqual(preview.properties.guidanceReady, false);

assert(
  !result.featureCollection.features.some((feature) => feature.properties.routeId === 'outside'),
  'Routes outside the viewport and tag query should not be rendered.',
);

const overlaySegments = routeCatalogViewportFeaturesToRouteGeometrySegments(result.featureCollection, ['route-catalog:route-a']);
assert.strictEqual(overlaySegments.length, 3, 'Only line features should become selectable route geometry segments.');
assert.strictEqual(overlaySegments[0].kind, 'route_geometry_segment');
assert.strictEqual(overlaySegments[0].sourceKind, 'route_catalog');
assert.strictEqual(overlaySegments[0].sourceId, 'route-a');
assert.strictEqual(overlaySegments[0].routeGeometrySelected, true);
assert.strictEqual(overlaySegments[0].sourceMetadata.routeGeometrySourceKind, 'route_catalog');
assert.strictEqual(overlaySegments[0].sourceMetadata.routeCatalogRouteId, 'route-a');
assert.strictEqual(overlaySegments[0].sourceMetadata.geometryStatus, 'guidance_ready');

let loaderCalls = 0;
const cache = new RouteCatalogViewportCache({ maxEntries: 2 });
const firstCached = cache.getOrSet(query, () => {
  loaderCalls += 1;
  return result;
});
const secondCached = cache.getOrSet(query, () => {
  loaderCalls += 1;
  return queryRouteCatalogViewportRecords([], query);
});
assert.strictEqual(loaderCalls, 1, 'Repeated pan/zoom queries with the same bucket should use cache.');
assert.strictEqual(firstCached, secondCached, 'Cached viewport result should be reused.');

console.log('Route catalog viewport service checks passed.');
