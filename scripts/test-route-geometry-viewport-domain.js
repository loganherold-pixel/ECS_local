/* global __dirname */
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
  ROUTE_GEOMETRY_VIEWPORT_DEFAULT_LIMIT,
  ROUTE_GEOMETRY_VIEWPORT_MAX_LIMIT,
  ROUTE_GEOMETRY_VIEWPORT_MIN_ZOOM,
  ROUTE_GEOMETRY_VIEWPORT_UNAVAILABLE_MESSAGE,
  ROUTE_GEOMETRY_VIEWPORT_WARNING,
  buildRouteGeometryViewportCacheKey,
  filterRouteGeometryViewportResultBySourceProviderPrefix,
  isRouteGeometryViewportZoomEligible,
  normalizeRouteGeometryViewportBbox,
  normalizeRouteGeometryViewportResponse,
  routeGeometryViewportSegmentToOverlaySegment,
} = require(modulePath);

assert.strictEqual(ROUTE_GEOMETRY_VIEWPORT_DEFAULT_LIMIT, 20);
assert.strictEqual(ROUTE_GEOMETRY_VIEWPORT_MAX_LIMIT, 20);
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
assert.strictEqual(
  buildRouteGeometryViewportCacheKey(normalizedBbox, 10.4, {
    includeReferenceGeometry: true,
    vehicleClass: 'full_size_4x4',
    sourceProviderPrefix: 'USFS MVUM',
  }),
  'route_geometry_segments:z10:ref:full_size_4x4:source_usfs_mvum:-111.13:38.12:-111.04:38.20',
  'Source-specific overlays must not share the all-catalog viewport cache identity.',
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
      source_records: [{ providerId: 'usfs_mvum_colorado' }],
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
      source_records: [{ provider_id: 'usgs_trails' }],
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
assert.strictEqual(normalized.invalidFeatureCount, 1, 'Invalid geometry should be counted independently.');
assert.deepStrictEqual(normalized.segments[0].sourceProviderIds, ['usfs_mvum_colorado']);
assert.deepStrictEqual(normalized.segments[1].sourceProviderIds, ['usgs_trails']);
assert.strictEqual(normalized.segments[1].dataState, 'cached', 'Cached/reference data state should remain visible.');
assert.strictEqual(normalized.segments[1].confidence, 'low', 'Reference geometry confidence should remain visible.');
assert.strictEqual(normalized.degraded, false, 'Normal viewport payloads should not be marked degraded.');

function viewportSegment(id, providerId = 'usfs_mvum_colorado', overrides = {}) {
  return {
    id,
    sourceId: id,
    name: overrides.name ?? id,
    confidenceScore: overrides.confidenceScore ?? 50,
    lastVerifiedAt: overrides.lastVerifiedAt ?? '2026-07-19T00:00:00.000Z',
    source_records: [{ providerId }],
    geometry: {
      type: 'LineString',
      coordinates: [[-111, 38], [-110.99, 38.01]],
    },
  };
}

const oversized = normalizeRouteGeometryViewportResponse({
  segments: [
    ...Array.from({ length: 51 }, (_, index) => viewportSegment(`ranked-${index}`)),
    viewportSegment('ranked-0'),
  ],
  meta: { candidateCount: 52 },
});
assert.strictEqual(oversized.segments.length, 20, 'Client normalization must never expose a 21st route.');
assert.strictEqual(new Set(oversized.segments.map((segment) => segment.sourceId)).size, 20);
assert.strictEqual(oversized.qualifyingUniqueCount, 51);
assert.strictEqual(oversized.deduplicatedCount, 1);
assert.strictEqual(oversized.cappedCount, 31);
assert.strictEqual(oversized.additionalMatchesAvailable, true);

const defensiveRankingInput = [
  ...Array.from({ length: 20 }, (_, index) => viewportSegment(
    `low-${String(index).padStart(2, '0')}`,
    'usfs_mvum_colorado',
    { confidenceScore: 10 },
  )),
  viewportSegment('high-quality-tail', 'usfs_mvum_colorado', { confidenceScore: 99 }),
];
const defensivelyRanked = normalizeRouteGeometryViewportResponse({ segments: defensiveRankingInput });
const reversedDefensivelyRanked = normalizeRouteGeometryViewportResponse({
  segments: [...defensiveRankingInput].reverse(),
});
assert.strictEqual(defensivelyRanked.segments[0].id, 'high-quality-tail');
assert.deepStrictEqual(
  reversedDefensivelyRanked.segments.map((segment) => segment.id),
  defensivelyRanked.segments.map((segment) => segment.id),
  'Defensive client ranking must retain a high-quality tail route and ignore provider order.',
);

const providerFilteredBeforeCap = normalizeRouteGeometryViewportResponse({
  segments: [
    ...Array.from({ length: 25 }, (_, index) => viewportSegment(`usgs-${index}`, 'usgs_trails')),
    ...Array.from({ length: 25 }, (_, index) => viewportSegment(`mvum-${index}`)),
  ],
  meta: { candidateCount: 50, resultLimit: 20 },
}, 'usfs_mvum');
assert.strictEqual(providerFilteredBeforeCap.segments.length, 20);
assert(
  providerFilteredBeforeCap.segments.every((segment) => segment.sourceId.startsWith('mvum-')),
  'The provider compatibility filter must run before the defensive top-20 slice.',
);
assert.strictEqual(providerFilteredBeforeCap.qualifyingUniqueCount, 25);
assert.strictEqual(providerFilteredBeforeCap.additionalMatchesAvailable, true);

const mvumOnly = filterRouteGeometryViewportResultBySourceProviderPrefix(normalized, 'usfs_mvum');
assert.deepStrictEqual(
  mvumOnly.segments.map((segment) => segment.id),
  ['catalog-open'],
  'Client-side source filtering must protect MVUM while an older Edge Function ignores the filter request.',
);
assert.strictEqual(mvumOnly.sourceProviderPrefix, 'usfs_mvum');
assert.strictEqual(mvumOnly.sourceFilterApplied, true);
assert.strictEqual(mvumOnly.sourceFilteredCount, 1);
assert.strictEqual(mvumOnly.unfilteredCandidateCount, 4);

const degraded = normalizeRouteGeometryViewportResponse({
  ok: true,
  segments: [],
  meta: {
    degraded: true,
    unavailableReason: 'backend_unavailable',
    userMessage: ROUTE_GEOMETRY_VIEWPORT_UNAVAILABLE_MESSAGE,
    candidateCount: 0,
    cappedCount: 0,
    skippedMissingGeometryCount: 0,
    skippedClosedCount: 0,
    bboxFilterApplied: true,
  },
});
assert.strictEqual(degraded.degraded, true, 'Backend fallback payloads should remain explicitly degraded.');
assert.strictEqual(degraded.segments.length, 0, 'Degraded viewport payloads should not fabricate route geometry.');
assert.strictEqual(degraded.unavailableReason, 'backend_unavailable');
assert.strictEqual(degraded.userMessage, ROUTE_GEOMETRY_VIEWPORT_UNAVAILABLE_MESSAGE);

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
