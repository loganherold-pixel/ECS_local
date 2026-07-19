const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(process.cwd());
const storage = new Map();

global.__DEV__ = false;
global.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTypeScript(module, filename) {
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

const {
  readRouteCatalogViewportOfflineCache,
  readRouteGeometryViewportOfflineCache,
  writeRouteCatalogViewportOfflineCache,
  writeRouteGeometryViewportOfflineCache,
} = require(path.join(root, 'lib', 'routeGeometryViewportCache.ts'));
const {
  loadExploreRoutesMapHandoff,
  saveExploreRoutesMapHandoff,
} = require(path.join(root, 'lib', 'exploreRoutesMapHandoff.ts'));

const now = Date.now();
const bbox = { minLng: -111.2, minLat: 38.1, maxLng: -111.0, maxLat: 38.3 };

function makeViewportSegment(routeIndex, idSuffix = '') {
  return {
    id: `segment-${routeIndex}${idSuffix}`,
    name: `Route ${routeIndex}`,
    sourceKind: 'route_catalog',
    sourceId: `route-${routeIndex}`,
    sourceLabel: 'Public fixture',
    dataState: 'cached',
    confidence: 'high',
    legalityStatus: 'legal_verified',
    publicAccessStatus: 'open',
    warnings: [],
    coordinates: [
      { latitude: 38.2, longitude: -111.1 },
      { latitude: 38.21, longitude: -111.09 },
    ],
  };
}

function makeViewportFeature(routeIndex, idSuffix = '') {
  const isMarker = routeIndex % 3 === 0;
  const geometryStatus = routeIndex % 4 === 0
    ? 'trailhead_only'
    : routeIndex % 4 === 1
      ? 'insufficient_geometry'
      : 'guidance_ready';
  return {
    type: 'Feature',
    id: `feature-${routeIndex}${idSuffix}`,
    geometry: isMarker
      ? { type: 'Point', coordinates: [-111.1, 38.2] }
      : { type: 'LineString', coordinates: [[-111.1, 38.2], [-111.09, 38.21]] },
    properties: {
      routeId: `route-${routeIndex}`,
      title: `Route ${routeIndex}`,
      name: `Route ${routeIndex}`,
      forest: null,
      region: null,
      distanceMiles: routeIndex,
      tripType: 'point_to_point',
      geometryStatus,
      guidanceReady: routeIndex % 2 === 0,
      source: 'route_catalog',
      sourceLabel: 'Public fixture',
      routeGeometryMode: isMarker ? null : 'full',
      segmentIds: [`route-${routeIndex}`],
      confidence: 'high',
      dataState: 'cached',
      warnings: [],
      featureKind: isMarker ? 'trailhead_marker' : 'route_line',
    },
  };
}

function makeOverlaySegment(routeIndex, idSuffix = '') {
  return {
    id: `explore-route:hidden_gem:route-${routeIndex}${idSuffix}`,
    name: `Route ${routeIndex}`,
    category: 'hidden_gem',
    categoryLabel: 'Hidden Gem',
    kind: 'explore_route',
    coordinates: [
      { latitude: 38.2, longitude: -111.1 },
      { latitude: 38.21, longitude: -111.09 },
    ],
    color: '#F2C24D',
    route: { id: `route-${routeIndex}`, name: `Route ${routeIndex}` },
  };
}

function firstOccurrenceFixture(makeItem) {
  return [
    makeItem(0),
    makeItem(0, '-duplicate'),
    ...Array.from({ length: 21 }, (_, index) => makeItem(index + 1)),
  ];
}

function assertFirstTwentyRouteOrder(routeIds, label) {
  assert.deepStrictEqual(
    routeIds,
    Array.from({ length: 20 }, (_, index) => `route-${index}`),
    `${label} should preserve first-occurrence ranked order while deduplicating.`,
  );
}

async function run() {
  storage.clear();

  const geometryCacheKey = 'geometry-cap-fixture';
  const geometrySegments = firstOccurrenceFixture(makeViewportSegment);
  writeRouteGeometryViewportOfflineCache({
    lookup: { bbox, cacheKey: geometryCacheKey },
    now,
    result: {
      segments: geometrySegments,
      candidateCount: geometrySegments.length,
      cappedCount: 0,
      skippedMissingGeometryCount: 0,
      skippedClosedCount: 0,
      bboxFilterApplied: true,
      degraded: false,
    },
  });
  const persistedGeometry = JSON.parse(storage.get(geometryCacheKey));
  assert.strictEqual(persistedGeometry.result.segments.length, 20);
  assert.strictEqual(persistedGeometry.result.cappedCount, 2);
  assert.strictEqual(persistedGeometry.result.candidateCount, 23);
  assertFirstTwentyRouteOrder(
    persistedGeometry.result.segments.map((segment) => segment.sourceId),
    'Geometry cache write',
  );

  const geometryRead = await readRouteGeometryViewportOfflineCache(geometryCacheKey, now);
  assert.strictEqual(geometryRead.result.segments.length, 20);
  assertFirstTwentyRouteOrder(
    geometryRead.result.segments.map((segment) => segment.sourceId),
    'Geometry cache read',
  );

  const legacyGeometryKey = 'geometry-cap-legacy-fixture';
  storage.set(legacyGeometryKey, JSON.stringify({
    bbox,
    cacheKey: legacyGeometryKey,
    cachedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    result: {
      ...persistedGeometry.result,
      segments: geometrySegments,
      candidateCount: 0,
      cappedCount: 0,
    },
  }));
  const legacyGeometryRead = await readRouteGeometryViewportOfflineCache(legacyGeometryKey, now);
  assert.strictEqual(legacyGeometryRead.result.segments.length, 20);
  assert.strictEqual(legacyGeometryRead.result.cappedCount, 2);
  assert.strictEqual(legacyGeometryRead.result.candidateCount, 23);
  assert.strictEqual(legacyGeometryRead.result.qualifyingUniqueCount, 22);
  assert.strictEqual(legacyGeometryRead.result.deduplicatedCount, 1);
  assert.strictEqual(legacyGeometryRead.result.additionalMatchesAvailable, true);

  const catalogCacheKey = 'catalog-cap-fixture';
  const catalogFeatures = firstOccurrenceFixture(makeViewportFeature);
  writeRouteCatalogViewportOfflineCache({
    bbox,
    cacheKey: catalogCacheKey,
    now,
    result: {
      featureCollection: { type: 'FeatureCollection', features: catalogFeatures },
      candidateCount: catalogFeatures.length,
      returnedCount: catalogFeatures.length,
      lineFeatureCount: 999,
      markerFeatureCount: 999,
      guidanceReadyCount: 999,
      trailheadOnlyCount: 999,
      insufficientGeometryCount: 999,
      skippedOutsideViewportCount: 0,
      bboxFilterApplied: true,
      source: 'route_catalog',
    },
  });
  const persistedCatalog = JSON.parse(storage.get(catalogCacheKey));
  const persistedCatalogFeatures = persistedCatalog.result.featureCollection.features;
  assert.strictEqual(persistedCatalog.result.returnedCount, 20);
  assert.strictEqual(persistedCatalogFeatures.length, 20);
  assertFirstTwentyRouteOrder(
    persistedCatalogFeatures.map((feature) => feature.properties.routeId),
    'Catalog cache write',
  );
  assert.strictEqual(
    persistedCatalog.result.lineFeatureCount + persistedCatalog.result.markerFeatureCount,
    20,
  );
  assert.strictEqual(
    persistedCatalog.result.guidanceReadyCount,
    persistedCatalogFeatures.filter((feature) => feature.properties.guidanceReady).length,
  );
  assert.strictEqual(
    persistedCatalog.result.trailheadOnlyCount,
    persistedCatalogFeatures.filter(
      (feature) => feature.properties.geometryStatus === 'trailhead_only',
    ).length,
  );
  assert.strictEqual(
    persistedCatalog.result.insufficientGeometryCount,
    persistedCatalogFeatures.filter(
      (feature) => feature.properties.geometryStatus === 'insufficient_geometry',
    ).length,
  );

  storage.set('catalog-cap-legacy-fixture', JSON.stringify({
    bbox,
    cacheKey: 'catalog-cap-legacy-fixture',
    cachedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    result: {
      ...persistedCatalog.result,
      featureCollection: { type: 'FeatureCollection', features: catalogFeatures },
      candidateCount: 0,
      returnedCount: 999,
    },
  }));
  const legacyCatalogRead = await readRouteCatalogViewportOfflineCache(
    'catalog-cap-legacy-fixture',
    now,
  );
  assert.strictEqual(legacyCatalogRead.result.featureCollection.features.length, 20);
  assert.strictEqual(legacyCatalogRead.result.returnedCount, 20);
  assert.strictEqual(legacyCatalogRead.result.candidateCount, 22);

  const handoffSegments = firstOccurrenceFixture(makeOverlaySegment);
  const savedHandoff = await saveExploreRoutesMapHandoff({
    label: 'Ranked routes',
    radiusMiles: 100,
    refinementLabel: null,
    categories: ['hidden_gem'],
    segments: handoffSegments,
    candidateCount: handoffSegments.length,
    skippedMissingGeometryCount: 0,
    cappedCount: 0,
  });
  assert.strictEqual(savedHandoff.segments.length, 20);
  assert.strictEqual(savedHandoff.cappedCount, 2);
  assert.strictEqual(savedHandoff.candidateCount, 23);
  assertFirstTwentyRouteOrder(
    savedHandoff.segments.map((segment) => segment.route.id),
    'Explore map handoff write',
  );
  const persistedHandoff = JSON.parse(storage.get('ecs_explore_routes_map_handoff_v1'));
  assert.strictEqual(persistedHandoff.segments.length, 20);

  storage.set('ecs_explore_routes_map_handoff_v1', JSON.stringify({
    ...persistedHandoff,
    segments: handoffSegments,
    candidateCount: -1,
    cappedCount: -1,
  }));
  const legacyHandoffRead = await loadExploreRoutesMapHandoff();
  assert.strictEqual(legacyHandoffRead.segments.length, 20);
  assert.strictEqual(legacyHandoffRead.cappedCount, 2);
  assert.strictEqual(legacyHandoffRead.candidateCount, 22);
  assertFirstTwentyRouteOrder(
    legacyHandoffRead.segments.map((segment) => segment.route.id),
    'Explore map handoff legacy read',
  );

  console.log('Explore/Navigate persisted map result cap tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
