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
  ROUTE_CATALOG_VIEWPORT_MIN_ZOOM,
  RouteCatalogViewportCache,
  buildRouteCatalogViewportGuidancePlan,
  buildRouteCatalogViewportPersistencePlan,
  buildRouteCatalogViewportQuery,
  isRouteCatalogViewportZoomEligible,
  queryRouteCatalogViewportRecords,
  resolveRouteCatalogViewportSelection,
  routeCatalogViewportFeaturesToRouteGeometrySegments,
} = require(modulePath);
const {
  ROUTE_GEOMETRY_VIEWPORT_MIN_ZOOM,
} = require(path.join(root, 'lib', 'routeGeometryViewport.ts'));

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
const widerRadiusQuery = buildRouteCatalogViewportQuery({
  bbox: tahoeViewport,
  zoom: 11.2,
  radiusMiles: query.radiusMiles + 25,
  regionTags: ['tahoe_nf', 'eldorado_nf', 'plumas_nf', 'mendocino_nf'],
});

assert.strictEqual(query.limit, ROUTE_CATALOG_VIEWPORT_DEFAULT_LIMIT);
assert.strictEqual(ROUTE_CATALOG_VIEWPORT_DEFAULT_LIMIT, 20);
assert.notStrictEqual(
  query.cacheKey,
  widerRadiusQuery.cacheKey,
  'Viewport cache identity must change when the search radius changes.',
);
assert(
  widerRadiusQuery.cacheKey.includes(`r${widerRadiusQuery.radiusMiles.toFixed(2)}`),
  'Viewport cache identity should encode the normalized search radius.',
);
assert.strictEqual(
  buildRouteCatalogViewportQuery({ bbox: tahoeViewport, zoom: 11.2, limit: 51 }).limit,
  20,
  'Viewport limits above 20 must clamp to 20.',
);
assert.strictEqual(
  buildRouteCatalogViewportQuery({ bbox: tahoeViewport, zoom: 11.2, limit: -4 }).limit,
  20,
  'Negative viewport limits must use the documented safe default.',
);
assert(query.radiusMiles >= 15, 'Viewport query should derive a usable radius from the map bounds.');
assert.strictEqual(ROUTE_CATALOG_VIEWPORT_MIN_ZOOM, 8);
assert(
  ROUTE_CATALOG_VIEWPORT_MIN_ZOOM < ROUTE_GEOMETRY_VIEWPORT_MIN_ZOOM,
  'Suggested ECS routes should become eligible farther out than close-detail MVUM segments.',
);
assert.strictEqual(isRouteCatalogViewportZoomEligible(7.99), false);
assert.strictEqual(isRouteCatalogViewportZoomEligible(8), true);
assert.strictEqual(isRouteCatalogViewportZoomEligible(Number.NaN), false);

const result = queryRouteCatalogViewportRecords(records, query);
assert.strictEqual(result.candidateCount, 5);
assert.strictEqual(result.featureCollection.type, 'FeatureCollection');
assert.strictEqual(result.featureCollection.features.length, 4, 'Viewport should include geometry intersections and centroid fallback markers.');

const rankedViewportRecords = [
  { not: 'a valid route' },
  catalogRoute({
    id: 'blocked-high-rank',
    public_id: 'blocked-high-rank',
    name: 'Blocked high-rank route',
    featured_route_score: 1_000,
    restricted_access_coverage_pct: 100,
  }),
  ...Array.from({ length: 51 }, (_, index) => catalogRoute({
    id: `ranked-${String(index).padStart(2, '0')}`,
    public_id: `ranked-${String(index).padStart(2, '0')}`,
    name: `Ranked viewport route ${index}`,
    center_latitude: 39.25 + (index % 5) * 0.005,
    center_longitude: -120.55 + (index % 5) * 0.005,
    confidence_score: 82 + (index % 10),
    featured_route_score: index === 50 ? 100 : 0,
  })),
  catalogRoute({
    id: 'ranked-00',
    public_id: 'ranked-00',
    name: 'Duplicate ranked viewport route',
  }),
];
const cappedViewportResult = queryRouteCatalogViewportRecords(rankedViewportRecords, query);
assert.strictEqual(cappedViewportResult.returnedCount, 20, 'A 51-route viewport response must return exactly 20 unique routes.');
assert.strictEqual(
  new Set(cappedViewportResult.featureCollection.features.map((feature) => feature.properties.routeId)).size,
  20,
  'Duplicate viewport routes must not consume result positions.',
);
assert.strictEqual(
  cappedViewportResult.featureCollection.features[0].properties.routeId,
  'ranked-50',
  'Route-quality/relevance ranking must run before the final 20-result slice.',
);
assert(
  !cappedViewportResult.featureCollection.features.some((feature) => feature.properties.routeId === 'blocked-high-rank'),
  'Access filtering must run before the final viewport cap even when a blocked route has a high score.',
);

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

const rawGpsOrigin = { lat: 39.31005, lng: -120.52 };
const rawGpsSnapshot = { ...rawGpsOrigin };
const guidancePlan = buildRouteCatalogViewportGuidancePlan(tahoe, {
  origin: rawGpsOrigin,
  accuracyM: 8,
});
assert.strictEqual(guidancePlan.status, 'ready');
assert.strictEqual(guidancePlan.reason, null);
assert.strictEqual(guidancePlan.requiresApproach, false, 'GPS inside the bounded trail tolerance should use stored canonical geometry directly.');
assert(guidancePlan.entryDistanceFromOriginM <= guidancePlan.snapToleranceM);
assert.strictEqual(guidancePlan.canonicalGeometry.length, 3);
assert(
  guidancePlan.entryDistanceFromRouteStartM > 1_000,
  'A GPS origin beside the middle of a route should enter near the middle rather than at the first coordinate.',
);
assert(
  guidancePlan.remainingGeometry.length >= 2 &&
    guidancePlan.remainingGeometry.length < guidancePlan.canonicalGeometry.length + 1,
  'Guidance should retain only the canonical route at and after the projected entry point.',
);
assert.deepStrictEqual(
  guidancePlan.remainingGeometry[0],
  guidancePlan.entryCoordinate,
  'The remaining route should begin at the projected canonical coordinate.',
);
assert.notDeepStrictEqual(
  guidancePlan.entryCoordinate,
  rawGpsOrigin,
  'The guidance entry may be projected, but raw GPS must not be used as route-line geometry.',
);
assert.deepStrictEqual(rawGpsOrigin, rawGpsSnapshot, 'Projection must not mutate the raw GPS input.');
assert.deepStrictEqual(
  guidancePlan.destinationCoordinate,
  guidancePlan.canonicalGeometry[guidancePlan.canonicalGeometry.length - 1],
  'Projected guidance must preserve the canonical route destination.',
);

const offRouteGuidancePlan = buildRouteCatalogViewportGuidancePlan(tahoe, {
  origin: { lat: 38.9, lng: -121.2 },
  accuracyM: 10,
});
assert.strictEqual(offRouteGuidancePlan.status, 'ready');
assert.strictEqual(offRouteGuidancePlan.requiresApproach, true, 'GPS outside the bounded tolerance must require an approach route.');
assert(offRouteGuidancePlan.entryDistanceFromOriginM > offRouteGuidancePlan.snapToleranceM);

const persistencePlan = buildRouteCatalogViewportPersistencePlan(tahoe);
const repeatedPersistencePlan = buildRouteCatalogViewportPersistencePlan(tahoe);
assert.strictEqual(persistencePlan.status, 'ready');
assert.strictEqual(persistencePlan.persistenceKey, repeatedPersistencePlan.persistenceKey);
assert.strictEqual(persistencePlan.geometryFingerprint, repeatedPersistencePlan.geometryFingerprint);
assert.deepStrictEqual(
  persistencePlan.coordinates,
  [
    [-120.66, 39.23],
    [-120.52, 39.31],
    [-120.34, 39.38],
  ],
  'Persistence coordinates must retain canonical longitude/latitude order.',
);
assert.strictEqual(persistencePlan.sourceMetadata.routeCatalogRouteId, 'route-a');
assert.strictEqual(persistencePlan.sourceMetadata.routeGeometrySourceKind, 'route_catalog');
assert.strictEqual(persistencePlan.sourceMetadata.guidanceReady, true);

const previewGuidancePlan = buildRouteCatalogViewportGuidancePlan(preview, {
  origin: rawGpsOrigin,
  accuracyM: 8,
});
assert.strictEqual(previewGuidancePlan.status, 'unavailable');
assert.match(previewGuidancePlan.reason, /preview geometry/i);
assert.deepStrictEqual(previewGuidancePlan.remainingGeometry, []);
const previewPersistencePlan = buildRouteCatalogViewportPersistencePlan(preview);
assert.strictEqual(previewPersistencePlan.status, 'unavailable');
assert.strictEqual(previewPersistencePlan.persistenceKey, null);
assert.deepStrictEqual(previewPersistencePlan.coordinates, []);

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

const multipartRoute = catalogRoute({
  id: 'multipart-route',
  public_id: 'multipart-route',
  name: 'Two Part Suggested Route',
  route_geometry: {
    type: 'MultiLineString',
    coordinates: [
      [
        [-120.62, 39.24],
        [-120.55, 39.29],
      ],
      [
        [-120.55, 39.29],
        [-120.47, 39.34],
      ],
    ],
  },
});
const anotherRoute = catalogRoute({
  id: 'another-route',
  public_id: 'another-route',
  name: 'Another Suggested Route',
});
const disconnectedRoute = catalogRoute({
  id: 'disconnected-route',
  public_id: 'disconnected-route',
  name: 'Disconnected Source Parts',
  route_geometry: {
    type: 'MultiLineString',
    coordinates: [
      [
        [-120.64, 39.23],
        [-120.58, 39.27],
      ],
      [
        [-120.42, 39.35],
        [-120.34, 39.39],
      ],
    ],
  },
});
const selectionResult = queryRouteCatalogViewportRecords([multipartRoute, anotherRoute, disconnectedRoute], query);
const disconnectedFeature = selectionResult.featureCollection.features.find(
  (feature) => feature.properties.routeId === 'disconnected-route',
);
assert(disconnectedFeature, 'Disconnected source-backed route parts should remain visible for truthful preview.');
assert.strictEqual(disconnectedFeature.properties.guidanceReady, false);
assert.strictEqual(disconnectedFeature.properties.geometryStatus, 'insufficient_geometry');
assert.strictEqual(buildRouteCatalogViewportGuidancePlan(disconnectedFeature).status, 'unavailable');
const unselectedRouteSegments = routeCatalogViewportFeaturesToRouteGeometrySegments(
  selectionResult.featureCollection,
);
const multipartParts = unselectedRouteSegments.filter((segment) => segment.sourceId === 'multipart-route');
assert.strictEqual(multipartParts.length, 2, 'Multipart catalog routes should retain all drawable route parts.');

const multipartSelection = resolveRouteCatalogViewportSelection(
  selectionResult.featureCollection,
  multipartParts[1].id,
);
assert(multipartSelection, 'Selecting any route part should resolve the stable whole-route identity.');
assert.strictEqual(multipartSelection.routeId, 'multipart-route');
assert.deepStrictEqual(
  multipartSelection.overlaySegmentIds,
  multipartParts.map((segment) => segment.id),
  'A tap on one part must select every drawable part of the same suggested route.',
);
const selectedMultipartSegments = routeCatalogViewportFeaturesToRouteGeometrySegments(
  selectionResult.featureCollection,
  multipartSelection.overlaySegmentIds,
);
assert(
  selectedMultipartSegments
    .filter((segment) => segment.sourceId === 'multipart-route')
    .every((segment) => segment.routeGeometrySelected),
  'Every part of the selected route should receive selected presentation state.',
);

const replacementSelection = resolveRouteCatalogViewportSelection(
  selectionResult.featureCollection,
  'another-route',
);
assert(replacementSelection, 'A second route should resolve to a replacement selection.');
assert.strictEqual(replacementSelection.routeId, 'another-route');
assert(
  replacementSelection.overlaySegmentIds.every((id) => !multipartSelection.overlaySegmentIds.includes(id)),
  'Selecting another route should replace, rather than accumulate, the prior route selection.',
);

const refreshedFeatureCollection = {
  ...selectionResult.featureCollection,
  features: selectionResult.featureCollection.features.map((feature) =>
    feature.properties.routeId === 'multipart-route'
      ? { ...feature, id: 'provider-refresh-feature-id' }
      : feature,
  ),
};
const retainedSelection = resolveRouteCatalogViewportSelection(
  refreshedFeatureCollection,
  multipartSelection.routeId,
);
assert(retainedSelection, 'Selection should survive viewport refresh by stable route identity.');
assert.strictEqual(retainedSelection.routeId, multipartSelection.routeId);
assert.strictEqual(
  resolveRouteCatalogViewportSelection(
    {
      ...selectionResult.featureCollection,
      features: selectionResult.featureCollection.features.filter(
        (feature) => feature.properties.routeId !== multipartSelection.routeId,
      ),
    },
    multipartSelection.routeId,
  ),
  null,
  'Selection should clear when its stable route identity is no longer in the viewport result.',
);

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
const widerRadiusCached = cache.getOrSet(widerRadiusQuery, () => {
  loaderCalls += 1;
  return queryRouteCatalogViewportRecords(records, widerRadiusQuery);
});
assert.strictEqual(loaderCalls, 2, 'A changed radius must not reuse the previous viewport cache entry.');
assert.notStrictEqual(widerRadiusCached, firstCached);

const oversizedCachedFeatures = [
  ...cappedViewportResult.featureCollection.features,
  ...cappedViewportResult.featureCollection.features.slice(0, 5).map((feature, index) => ({
    ...feature,
    id: `legacy-cache-${index}`,
    properties: {
      ...feature.properties,
      routeId: `legacy-cache-${index}`,
    },
  })),
];
const legacyCacheQuery = { cacheKey: `${query.cacheKey}:legacy-oversized` };
const sanitizedCachedResult = cache.set(legacyCacheQuery, {
  ...cappedViewportResult,
  featureCollection: {
    ...cappedViewportResult.featureCollection,
    features: oversizedCachedFeatures,
  },
  returnedCount: oversizedCachedFeatures.length,
});
assert.strictEqual(sanitizedCachedResult.returnedCount, 20, 'Oversized cached viewport results must clamp on write.');
assert.strictEqual(cache.get(legacyCacheQuery).featureCollection.features.length, 20, 'Cached viewport reads cannot restore a 21st route.');

console.log('Route catalog viewport service checks passed.');
