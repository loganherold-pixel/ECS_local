const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('/discoverEngine') || request.endsWith('\\discoverEngine') || request === '../discoverEngine') {
    return {};
  }
  return originalLoad(request, parent, isMain);
};

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;
require.extensions['.tsx'] = compileTypescript;

const diagnosticsModulePath = path.join(root, 'lib', 'routeCatalogVisibilityDiagnostics.ts');
assert(fs.existsSync(diagnosticsModulePath), 'Route catalog visibility diagnostics utility should exist.');

const {
  ECS_ROUTE_CATALOG_DEBUG_FLAG,
  NORCAL_ROUTE_CATALOG_VISIBILITY_AREAS,
  buildExploreRouteCatalogQueryDiagnostic,
  buildNavigateRouteCatalogQueryDiagnostic,
  buildRouteCatalogAuditReport,
  findClosestViableRouteCatalogGeometryTarget,
  isRouteCatalogDebugEnabled,
  logRouteCatalogVisibilityDiagnostic,
} = require(diagnosticsModulePath);
const {
  buildRouteCatalogViewportQuery,
  queryRouteCatalogViewportRecords,
  routeCatalogViewportFeaturesToRouteGeometrySegments,
} = require(path.join(root, 'lib', 'routeCatalogViewport.ts'));
const {
  queryRouteCatalogDiscoveryRecords,
} = require(path.join(root, 'lib', 'explore', 'routeCatalogDiscovery.ts'));
const {
  classifyRouteCatalogTripType,
} = require(path.join(root, 'lib', 'explore', 'routeCatalogDiscovery.ts'));

const nowIso = '2026-06-22T12:00:00.000Z';
const userNearTahoe = { latitude: 38.92, longitude: -120.78 };

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

function route(overrides = {}) {
  return {
    id: 'tahoe-guidance',
    public_id: 'tahoe-guidance',
    name: 'Tahoe Guidance Route',
    route_type: 'point_to_point',
    center_latitude: 39.3,
    center_longitude: -120.5,
    distance_miles: 12.4,
    estimated_duration_minutes: 240,
    official_access_coverage_pct: 100,
    unknown_access_coverage_pct: 0,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: 0,
    vehicle_mismatch: false,
    geometry_quality: 'good',
    verification_status: 'official_verified',
    recommendation_status: 'recommendable',
    review_status: 'approved',
    confidence_score: 92,
    tags: ['Tahoe National Forest', 'tahoe_nf', 'day trip'],
    source_records: [officialSource()],
    route_geometry_mode: 'full',
    route_intelligence: {
      tripType: 'day_trip',
    },
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

const stitched = route({
  id: 'eldorado-stitched',
  public_id: 'eldorado-stitched',
  name: 'Eldorado Stitched Connector',
  center_latitude: 39.16,
  center_longitude: -120.45,
  tags: ['Eldorado National Forest', 'eldorado_nf', 'stitched'],
  route_intelligence: {
    tripType: 'day_trip',
    segmentIds: ['seg-a', 'seg-b', 'seg-c'],
    stitchGroupId: 'eldorado-stitch-group',
  },
  route_geometry: {
    type: 'MultiLineString',
    coordinates: [
      [
        [-120.62, 39.18],
        [-120.52, 39.24],
      ],
      [
        [-120.52, 39.24],
        [-120.42, 39.29],
      ],
      [
        [-120.42, 39.29],
        [-120.34, 39.35],
      ],
    ],
  },
});

const trailheadOnly = route({
  id: 'plumas-trailhead-only',
  public_id: 'plumas-trailhead-only',
  name: 'Plumas Trailhead Only',
  center_latitude: 39.34,
  center_longitude: -120.45,
  tags: ['Plumas National Forest', 'plumas_nf'],
  route_geometry_mode: 'omitted',
  route_geometry: null,
});

const missingRegion = route({
  id: 'missing-region',
  public_id: 'missing-region',
  name: 'Missing Region Tags',
  tags: ['day trip'],
});

const missingDistanceDuration = route({
  id: 'missing-distance-duration',
  public_id: 'missing-distance-duration',
  name: 'Missing Distance Duration',
  distance_miles: null,
  estimated_duration_minutes: null,
  tags: ['Mendocino National Forest', 'mendocino_nf'],
});

const rubiconTrail = route({
  id: 'rubicon-trail',
  public_id: 'rubicon-trail',
  name: 'Rubicon Trail',
  center_latitude: 40.92,
  center_longitude: -123.65,
  distance_miles: 21,
  estimated_duration_minutes: 780,
  tags: ['Tahoe National Forest', 'Eldorado National Forest', 'rubicon', 'featured', 'day trip'],
  route_intelligence: {
    tripType: 'day_trip',
    aliases: ['rubicon', 'rubicon trail'],
  },
  route_geometry: {
    type: 'LineString',
    coordinates: [
      [-120.315, 39.006],
      [-120.23, 39.02],
      [-120.12, 39.04],
    ],
  },
});

const outsideRubicon = route({
  id: 'rubicon-outside',
  public_id: 'rubicon-outside',
  name: 'Rubicon Trail Far Fixture',
  center_latitude: 42.9,
  center_longitude: -124.2,
  tags: ['Rubicon Trail', 'featured'],
  route_geometry: {
    type: 'LineString',
    coordinates: [
      [-124.2, 42.9],
      [-124.1, 43],
    ],
  },
});

const obscureRoutes = Array.from({ length: 30 }, (_, index) =>
  route({
    id: `obscure-${index}`,
    public_id: `obscure-${index}`,
    name: `Obscure Nearby ${index}`,
    center_latitude: userNearTahoe.latitude + (index % 4) * 0.01,
    center_longitude: userNearTahoe.longitude + (index % 5) * 0.01,
    confidence_score: 96,
    tags: ['Tahoe National Forest', 'tahoe_nf', 'day trip'],
  }),
);

const catalog = [
  route(),
  stitched,
  trailheadOnly,
  missingRegion,
  missingDistanceDuration,
  rubiconTrail,
  ...obscureRoutes,
];

const audit = buildRouteCatalogAuditReport(catalog);
assert.strictEqual(audit.source, 'route_catalog');
assert.strictEqual(audit.totalCatalogRoutesLoaded, catalog.length);
assert(audit.totalRoutesWithValidGeometry >= 34, 'Audit should count routes with valid geometry.');
assert(audit.totalGuidanceReadyRoutes >= 34, 'Audit should count guidance-ready records.');
assert.strictEqual(audit.totalTrailheadOnlyRoutes, 1);
assert.strictEqual(audit.totalStitchedRoutes, 1);
assert.strictEqual(audit.totalRoutesMissingGeometry, 1);
assert.strictEqual(audit.totalRoutesMissingForestRegionTags, 1);
assert.strictEqual(audit.totalRoutesMissingDistanceDurationMetadata, 1);
assert(
  NORCAL_ROUTE_CATALOG_VISIBILITY_AREAS.some((area) => area.label === 'Tahoe National Forest') &&
    NORCAL_ROUTE_CATALOG_VISIBILITY_AREAS.some((area) => area.label === 'Eldorado National Forest') &&
    NORCAL_ROUTE_CATALOG_VISIBILITY_AREAS.some((area) => area.label === 'Plumas National Forest') &&
    NORCAL_ROUTE_CATALOG_VISIBILITY_AREAS.some((area) => area.label === 'Mendocino National Forest'),
  'Diagnostics should include major Northern California route areas.',
);

const exploreDiagnostic = buildExploreRouteCatalogQueryDiagnostic(catalog, {
  latitude: userNearTahoe.latitude,
  longitude: userNearTahoe.longitude,
  radiusMiles: 100,
  limit: 26,
  searchTerms: ['rubicon'],
  regionTags: ['tahoe national forest', 'eldorado national forest'],
});
assert.deepStrictEqual(exploreDiagnostic.userLocation, userNearTahoe);
assert.strictEqual(exploreDiagnostic.radiusMiles, 100);
assert.strictEqual(exploreDiagnostic.candidateRoutesBeforeFilters, catalog.length);
assert(exploreDiagnostic.finalResultCount <= 26);
assert(exploreDiagnostic.removedByFilter.resultLimit > 0, 'Diagnostic should expose records removed by final page limit.');
assert.strictEqual(exploreDiagnostic.removedByFilter.outsideRadius, 0);
assert(
  exploreDiagnostic.finalRouteIds.includes('rubicon-trail'),
  'Rubicon should appear when present and matching the 100-mile radius/region query.',
);

const missingRubiconDiagnostic = buildExploreRouteCatalogQueryDiagnostic(
  catalog.filter((item) => item.id !== 'rubicon-trail' && item.id !== 'rubicon-outside'),
  {
    latitude: userNearTahoe.latitude,
    longitude: userNearTahoe.longitude,
    radiusMiles: 100,
    limit: 26,
    searchTerms: ['rubicon'],
  },
);
assert(
  missingRubiconDiagnostic.topExcludedKnownRoutes.some((item) =>
    item.routeKey === 'rubicon_trail' && item.reason === 'missing_from_catalog'
  ),
  'Diagnostics should say Rubicon is missing from the catalog when no matching route exists.',
);

const outsideRubiconDiagnostic = buildExploreRouteCatalogQueryDiagnostic([outsideRubicon], {
  latitude: userNearTahoe.latitude,
  longitude: userNearTahoe.longitude,
  radiusMiles: 100,
  searchTerms: ['rubicon'],
});
assert(
  outsideRubiconDiagnostic.topExcludedKnownRoutes.some((item) =>
    item.routeKey === 'rubicon_trail' && /outside_radius/.test(item.reason)
  ),
  'Diagnostics should explain when a known route exists but is outside the query radius.',
);

const exploreResult = queryRouteCatalogDiscoveryRecords(catalog, {
  latitude: userNearTahoe.latitude,
  longitude: userNearTahoe.longitude,
  radiusMiles: 100,
  limit: 26,
  searchTerms: ['rubicon'],
});
assert(
  exploreResult.records.some((record) => record.id === 'rubicon-trail'),
  'Discovery helper should keep Rubicon in a 100-mile query even with an early visible limit.',
);

const dayTrip = classifyRouteCatalogTripType({
  name: '21 Mile Catalog Day Trip',
  distance_miles: 21,
  estimated_duration_minutes: 780,
  route_intelligence: { tripType: 'day_trip' },
});
assert.strictEqual(dayTrip.tripType, 'day_trip');
assert.strictEqual(dayTrip.estimatedDays, 1);

const viewportQuery = buildRouteCatalogViewportQuery({
  bbox: {
    minLng: -120.72,
    minLat: 39.18,
    maxLng: -120.28,
    maxLat: 39.42,
  },
  zoom: 11,
  regionTags: ['tahoe_nf', 'eldorado_nf', 'plumas_nf', 'mendocino_nf'],
});
const navigateResult = queryRouteCatalogViewportRecords(catalog, viewportQuery);
const navigateDiagnostic = buildNavigateRouteCatalogQueryDiagnostic(catalog, viewportQuery);
assert.deepStrictEqual(navigateDiagnostic.visibleMapBounds, viewportQuery.bbox);
assert(navigateDiagnostic.routeGeometriesIntersectingBounds >= 2);
assert.strictEqual(navigateDiagnostic.renderedLineCount, navigateResult.lineFeatureCount);
assert.strictEqual(navigateDiagnostic.renderedMarkerCount, navigateResult.markerFeatureCount);
assert(navigateDiagnostic.hiddenBecauseGeometryStatusIssues >= 1);
assert(navigateDiagnostic.renderedRouteIds.includes('tahoe-guidance'));

const trailheadFeature = navigateResult.featureCollection.features.find(
  (feature) => feature.properties.routeId === 'plumas-trailhead-only',
);
assert(trailheadFeature, 'Trailhead-only route should render in Navigate viewport.');
assert.strictEqual(trailheadFeature.geometry.type, 'Point');
assert.strictEqual(trailheadFeature.properties.guidanceReady, false);

const stitchedFeature = navigateResult.featureCollection.features.find(
  (feature) => feature.properties.routeId === 'eldorado-stitched',
);
assert(stitchedFeature, 'Stitched route should render in Navigate viewport.');
assert.deepStrictEqual(stitchedFeature.properties.segmentIds, ['seg-a', 'seg-b', 'seg-c']);
const stitchedSegments = routeCatalogViewportFeaturesToRouteGeometrySegments({
  type: 'FeatureCollection',
  features: [stitchedFeature],
});
assert.deepStrictEqual(
  stitchedSegments.map((segment) => segment.sourceMetadata.segmentIds),
  [
    ['seg-a', 'seg-b', 'seg-c'],
    ['seg-a', 'seg-b', 'seg-c'],
    ['seg-a', 'seg-b', 'seg-c'],
  ],
  'Stitched route overlay segments should preserve source segment IDs and route order.',
);

const closestTarget = findClosestViableRouteCatalogGeometryTarget(rubiconTrail, {
  latitude: 39.01,
  longitude: -120.4,
});
assert(closestTarget, 'Closest viable ECS route geometry target should be available for off-route return routing.');
assert.strictEqual(closestTarget.routeId, 'rubicon-trail');
assert(closestTarget.distanceMiles < 10);
assert.strictEqual(closestTarget.policy, 'closest_viable_point_on_ecs_route_geometry');

global.__ECS_ROUTE_CATALOG_DEBUG = false;
assert.strictEqual(isRouteCatalogDebugEnabled(), false, 'Route catalog diagnostics should be off by default.');
global.__ECS_ROUTE_CATALOG_DEBUG = true;
assert.strictEqual(isRouteCatalogDebugEnabled(), true, 'Route catalog diagnostics should honor the explicit debug flag.');
assert.strictEqual(ECS_ROUTE_CATALOG_DEBUG_FLAG, 'ECS_ROUTE_CATALOG_DEBUG');
const originalConsoleLog = console.log;
const capturedDebugLogs = [];
console.log = (...args) => {
  capturedDebugLogs.push(args);
};
try {
  logRouteCatalogVisibilityDiagnostic('test_visibility', exploreDiagnostic, { throttleMs: 0 });
} finally {
  console.log = originalConsoleLog;
}
assert(
  capturedDebugLogs.some((args) => String(args[0]).includes('[ECS:ROUTE_CATALOG]')),
  'Debug-gated logger should emit route catalog diagnostics only when the flag is enabled.',
);
delete global.__ECS_ROUTE_CATALOG_DEBUG;

const liveCatalogSource = fs.readFileSync(path.join(root, 'lib', 'explore', 'liveTrailPackCatalog.ts'), 'utf8');
const viewportClientSource = fs.readFileSync(path.join(root, 'lib', 'routeCatalogViewportClient.ts'), 'utf8');
assert(
  liveCatalogSource.includes("functions.invoke('route-catalog-search'") &&
    viewportClientSource.includes("functions.invoke('route-catalog-search'"),
  'Explore and Navigate should use the same authoritative route-catalog-search function.',
);
assert(
  liveCatalogSource.includes('logRouteCatalogVisibilityDiagnostic') &&
    viewportClientSource.includes('logRouteCatalogVisibilityDiagnostic'),
  'Explore and Navigate should emit debug-gated route catalog visibility diagnostics.',
);

const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
assert(
  navigateSource.includes('routeGeometryOverlayEnabled') &&
    navigateSource.includes('activeNavigationRunning') &&
    navigateSource.includes('offRouteReturnPolicy') &&
    navigateSource.includes('closest_viable_point_on_ecs_route_geometry'),
  'Navigate ECS route geometry toggle should coexist with active guidance and preserve closest-viable-point reroute policy.',
);

console.log('Route catalog visibility diagnostics checks passed.');
