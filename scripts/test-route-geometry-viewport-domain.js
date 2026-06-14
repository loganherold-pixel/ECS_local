const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'lib', 'routeGeometryViewport.ts');

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

assert(fs.existsSync(modulePath), 'Route geometry viewport domain module should exist.');

const {
  ROUTE_GEOMETRY_VIEWPORT_MIN_ZOOM,
  ROUTE_GEOMETRY_VIEWPORT_WARNING,
  buildRouteGeometryViewportCacheKey,
  isRouteGeometryViewportZoomEligible,
  normalizeRouteGeometryViewportBbox,
  normalizeRouteGeometryViewportResponse,
  routeGeometryViewportSegmentToOverlaySegment,
} = require(modulePath);

assert.strictEqual(ROUTE_GEOMETRY_VIEWPORT_MIN_ZOOM, 10, 'Viewport route geometry should load at zoom 10+.');
assert.strictEqual(isRouteGeometryViewportZoomEligible(9.99), false, 'Zoom below 10 should defer catalog segments.');
assert.strictEqual(isRouteGeometryViewportZoomEligible(10), true, 'Zoom 10 should allow catalog segments.');

const normalizedBbox = normalizeRouteGeometryViewportBbox({
  minLng: -111.1234,
  minLat: 38.1234,
  maxLng: -111.0456,
  maxLat: 38.1987,
});
assert.deepStrictEqual(
  normalizedBbox,
  { minLng: -111.13, minLat: 38.12, maxLng: -111.04, maxLat: 38.2 },
  'Viewport bbox should bucket outward to stable hundredth-degree cache cells.',
);
assert.strictEqual(
  buildRouteGeometryViewportCacheKey(normalizedBbox, 10.4, { includeReferenceGeometry: true, vehicleClass: 'full_size_4x4' }),
  'route_geometry_segments:z10:ref:full_size_4x4:-111.13:38.12:-111.04:38.20',
  'Cache key should include zoom bucket, reference policy, vehicle class, and bbox.',
);

const normalized = normalizeRouteGeometryViewportResponse({
  ok: true,
  segments: [
    {
      id: 'catalog-open',
      name: 'Open Catalog Segment',
      sourceKind: 'route_catalog',
      sourceId: 'catalog-open',
      sourceLabel: 'USFS MVUM',
      dataState: 'live',
      confidence: 'high',
      legalityStatus: 'legal_verified',
      publicAccessStatus: 'open',
      warnings: ['Seasonal status requires trip-date review.'],
      attribution: 'USDA Forest Service',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-111.001, 38.001],
          [-111.002, 38.002],
        ],
      },
    },
    {
      id: 'reference-segment',
      name: 'Reference Geometry Segment',
      sourceKind: 'route_catalog',
      sourceId: 'reference-segment',
      sourceLabel: 'USGS Digital Trails',
      dataState: 'cached',
      confidence: 'low',
      legalityStatus: 'geometry_only',
      publicAccessStatus: 'unknown',
      warnings: [],
      geometry: {
        type: 'LineString',
        coordinates: [
          [-112.001, 39.001],
          [-112.002, 39.002],
        ],
      },
    },
    {
      id: 'closed-segment',
      name: 'Closed Segment',
      sourceKind: 'route_catalog',
      sourceId: 'closed-segment',
      sourceLabel: 'Closed source',
      dataState: 'live',
      confidence: 'high',
      legalityStatus: 'closed_or_prohibited',
      publicAccessStatus: 'closed',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-113.001, 40.001],
          [-113.002, 40.002],
        ],
      },
    },
    {
      id: 'too-short',
      geometry: {
        type: 'LineString',
        coordinates: [[-114.001, 41.001]],
      },
    },
  ],
  meta: {
    candidateCount: 4,
    cappedCount: 0,
    skippedMissingGeometryCount: 0,
    bboxFilterApplied: true,
  },
});

assert.strictEqual(normalized.segments.length, 2, 'Closed and invalid catalog geometry should be filtered out.');
assert.strictEqual(normalized.skippedClosedCount, 1, 'Closed/prohibited segments should be counted as skipped.');
assert.strictEqual(normalized.skippedMissingGeometryCount, 1, 'Invalid short geometry should be counted as skipped.');
assert.strictEqual(normalized.segments[1].dataState, 'cached', 'Cached/reference data state should remain visible.');
assert.strictEqual(normalized.segments[1].confidence, 'low', 'Reference geometry confidence should remain visible.');

const overlaySegment = routeGeometryViewportSegmentToOverlaySegment(
  normalized.segments[0],
  new Set(['catalog-open']),
);
assert.strictEqual(overlaySegment.id, 'route-geometry:route_catalog:catalog-open');
assert.strictEqual(overlaySegment.kind, 'route_geometry_segment');
assert.strictEqual(overlaySegment.sourceKind, 'route_catalog');
assert.strictEqual(overlaySegment.sourceLabel, 'USFS MVUM');
assert.strictEqual(overlaySegment.routeGeometrySelected, true);
assert.strictEqual(overlaySegment.coordinates.length, 2);
assert(overlaySegment.routeGeometryWarningsJson.includes(ROUTE_GEOMETRY_VIEWPORT_WARNING));
assert(overlaySegment.routeGeometryWarningsJson.includes('Seasonal status requires trip-date review.'));
assert.strictEqual(overlaySegment.sourceMetadata.kind, 'ecs_route_geometry');
assert.strictEqual(overlaySegment.sourceMetadata.dataState, 'live');

console.log('Route geometry viewport domain checks passed.');
