const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'lib', 'navigateRouteGeometryOverlay.ts');

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

assert(fs.existsSync(modulePath), 'Route geometry overlay domain module should exist.');

const {
  buildRouteGeometryOverlaySegments,
  routeGeometrySegmentToRouteBuilderSegment,
  ROUTE_GEOMETRY_OVERLAY_PLANNING_WARNING,
} = require(modulePath);

const trailPack = {
  id: 'trail-pack-alpha',
  name: 'Trail Pack Alpha',
  source: 'ecs_validated',
  dataState: 'live',
  reviewStatus: 'approved',
  confidenceScore: 92,
  routeGeometry: {
    type: 'MultiLineString',
    coordinates: [
      [
        [-110.001, 38.001],
        [-110.002, 38.002],
      ],
      [
        [-110.003, 38.003],
        [-110.004, 38.004],
      ],
    ],
  },
  catalogVerification: {
    sourceLabel: 'ECS validated Trail Pack',
    confidenceScore: 92,
    dataUsed: [{ freshness: 'fresh' }],
  },
};

const routeCatalogRecord = {
  id: 'catalog-beta',
  name: 'Catalog Beta',
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-111.001, 39.001],
      [-111.002, 39.002],
    ],
  },
  sourceRecords: [{ label: 'USFS MVUM', lastVerifiedAt: '2026-01-05' }],
  verificationStatus: 'official_verified',
  reviewStatus: 'approved',
  geometryQuality: 'good',
};

const customRoute = {
  id: 'custom-gamma',
  name: 'Custom Gamma',
  source_format: 'custom',
  source_app: 'ecs_route_builder',
  route_category: 'custom',
  segments: [
    {
      points: [
        { lat: 40.001, lon: -112.001, ele: null },
        { lat: 40.002, lon: -112.002, ele: null },
      ],
      source_metadata: { kind: 'snapped_trace', sourceLabel: 'rendered_trail', confidence: 'unknown' },
    },
  ],
  updated_at: '2026-06-01T00:00:00.000Z',
};

const invalidRoute = {
  id: 'invalid-short',
  name: 'Invalid Short',
  source_format: 'gpx',
  segments: [{ points: [{ lat: 41, lon: -113, ele: null }] }],
};

const recordedRun = {
  id: 'recorded-delta',
  title: 'Recorded Delta',
  source: 'recorded',
  points: [
    { lat: 42.001, lng: -114.001, ele_m: null },
    { lat: 42.002, lng: -114.002, ele_m: null },
  ],
  updated_at: '2026-06-02T00:00:00.000Z',
};

const favoriteAsset = {
  id: 'favorite:epsilon',
  title: 'Favorite Epsilon',
  sourceLabel: 'SAVED TRAIL',
  badgeLabel: 'SAVED',
  kind: 'bookmarked',
  routeId: null,
  runId: null,
  navigationPayload: {
    id: 'favorite-epsilon',
    title: 'Favorite Epsilon',
    source: 'explore',
    trailGeometry: [
      { lat: 43.001, lng: -115.001 },
      { lat: 43.002, lng: -115.002 },
    ],
    trailGeometrySegments: [],
    routeMetadata: { dataState: 'cached' },
  },
  updatedAt: '2026-06-03T00:00:00.000Z',
};

const exploreSegment = {
  id: 'explore-route:zeta',
  name: 'Explore Zeta',
  kind: 'explore_route',
  category: 'trail_pack',
  categoryLabel: 'Trail Pack',
  color: '#65D4FF',
  coordinates: [
    { latitude: 44.001, longitude: -116.001 },
    { latitude: 44.002, longitude: -116.002 },
  ],
};

const result = buildRouteGeometryOverlaySegments({
  trailPacks: [trailPack],
  routeCatalogRecords: [routeCatalogRecord],
  routes: [customRoute, invalidRoute, customRoute],
  runs: [recordedRun],
  savedRouteAssets: [favoriteAsset],
  exploreSegments: [exploreSegment],
  maxSegments: 7,
});

assert.strictEqual(result.segments.length, 7, 'Builder should include valid ECS-owned route geometry up to the cap.');
assert.strictEqual(result.skippedMissingGeometryCount, 1, 'Invalid short route geometry should be counted as skipped.');
assert(result.dedupedCount >= 1, 'Duplicate route geometry should be deduped.');
assert.strictEqual(result.cappedCount, 0, 'Fixture should not exceed the configured cap.');

const sourceKinds = new Set(result.segments.map((segment) => segment.sourceKind));
assert(sourceKinds.has('trail_pack'), 'Trail Pack geometry should be represented.');
assert(sourceKinds.has('route_catalog'), 'Route Catalog geometry should be represented.');
assert(sourceKinds.has('custom_route'), 'Custom route geometry should be represented.');
assert(sourceKinds.has('recorded_run'), 'Recorded run geometry should be represented.');
assert(sourceKinds.has('favorite_trail'), 'Favorite trail geometry should be represented.');
assert(sourceKinds.has('explore_route'), 'Explore route geometry should be represented.');
assert(!sourceKinds.has('mapbox_base'), 'V1 must not include raw Mapbox base-map geometry.');
assert(!sourceKinds.has('rendered_feature'), 'V1 must not expose raw rendered map features as source geometry.');

const trailPackSegments = result.segments.filter((segment) => segment.sourceKind === 'trail_pack');
assert.strictEqual(trailPackSegments.length, 2, 'Trail Pack MultiLineString should normalize into separate selectable segments.');
assert(trailPackSegments.every((segment) => segment.dataState === 'live'), 'Trail Pack data state should stay visible.');
assert(trailPackSegments.every((segment) => segment.confidence === 'high'), 'High-confidence Trail Pack geometry should keep high confidence.');

const favorite = result.segments.find((segment) => segment.sourceKind === 'favorite_trail');
assert(favorite, 'Favorite trail payload should be normalized.');
assert.strictEqual(favorite.dataState, 'cached', 'Favorite trail cache/manual state should stay visible.');

const routeBuilderSegment = routeGeometrySegmentToRouteBuilderSegment(result.segments[0]);
assert.strictEqual(routeBuilderSegment.sourceSegmentId, result.segments[0].id);
assert.strictEqual(routeBuilderSegment.snapProvider, 'ecs_route_geometry');
assert.strictEqual(routeBuilderSegment.snapStatus, 'snapped');
assert.strictEqual(routeBuilderSegment.buildSource.kind, 'ecs_route_geometry');
assert.strictEqual(routeBuilderSegment.buildSource.sourceLabel, result.segments[0].sourceLabel);
assert(routeBuilderSegment.snapMessage.includes('planning/reference geometry'), 'Route-builder warning should stay visible.');
assert.strictEqual(typeof ROUTE_GEOMETRY_OVERLAY_PLANNING_WARNING, 'string');

const capped = buildRouteGeometryOverlaySegments({
  trailPacks: [trailPack],
  routeCatalogRecords: [routeCatalogRecord],
  routes: [customRoute],
  runs: [recordedRun],
  savedRouteAssets: [favoriteAsset],
  exploreSegments: [exploreSegment],
  maxSegments: 2,
});
assert.strictEqual(capped.segments.length, 2, 'Builder should respect maxSegments.');
assert(capped.cappedCount > 0, 'Builder should report capped ECS geometry.');

console.log('Navigate route geometry overlay domain checks passed.');
