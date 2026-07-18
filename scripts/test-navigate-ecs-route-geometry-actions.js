const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
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
    return {
      Platform: { OS: 'web' },
      AppState: {
        currentState: 'active',
        addEventListener() { return { remove() {} }; },
      },
    };
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
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const {
  buildRouteCatalogViewportPersistencePlan,
  buildRouteCatalogViewportQuery,
  queryRouteCatalogViewportRecords,
} = require(path.join(root, 'lib', 'routeCatalogViewport.ts'));
const { routeStore } = require(path.join(root, 'lib', 'routeStore.ts'));
const { runStore } = require(path.join(root, 'lib', 'runStore.ts'));
const { getSavedRouteAssets } = require(path.join(root, 'lib', 'savedRouteAssets.ts'));
const { composeStitchedRoute } = require(path.join(root, 'lib', 'stitchRouteComposer.ts'));
const {
  readRouteCatalogViewportOfflineCache,
  writeRouteCatalogViewportOfflineCache,
} = require(path.join(root, 'lib', 'routeGeometryViewportCache.ts'));

storage.clear();

const bbox = {
  minLng: -120.72,
  minLat: 39.18,
  maxLng: -120.28,
  maxLat: 39.42,
};
const query = buildRouteCatalogViewportQuery({ bbox, zoom: 9 });
const catalogResult = queryRouteCatalogViewportRecords([{
  id: 'ecs-suggested-route',
  public_id: 'ecs-suggested-route',
  name: 'ECS Suggested Route',
  route_type: 'point_to_point',
  center_latitude: 39.3,
  center_longitude: -120.5,
  distance_miles: 12,
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
  tags: ['tahoe_nf'],
  source_records: [{
    provider_id: 'ecs_catalog_fixture',
    label: 'ECS source-backed fixture',
    source_type: 'official',
    authority: 'fixture',
    last_verified_at: new Date().toISOString(),
  }],
  route_geometry_mode: 'full',
  route_geometry: {
    type: 'LineString',
    coordinates: [
      [-120.66, 39.23],
      [-120.52, 39.31],
      [-120.34, 39.38],
    ],
  },
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
}], query);
const feature = catalogResult.featureCollection.features[0];
assert(feature && feature.properties.guidanceReady, 'Fixture should produce one guidance-ready ECS route.');

const persistencePlan = buildRouteCatalogViewportPersistencePlan(feature);
assert.strictEqual(persistencePlan.status, 'ready');
assert(persistencePlan.persistenceKey);
assert(persistencePlan.sourceMetadata);

const saveCatalogRoute = () => routeStore.createCustomRoute(
  [{
    coordinates: persistencePlan.coordinates,
    source_metadata: persistencePlan.sourceMetadata,
  }],
  {
    name: feature.properties.title,
    description: `Saved from the source-backed ECS route catalog. Source: ${feature.properties.sourceLabel}.`,
    sourceApp: 'ecs_navigate_route_catalog',
    externalSourceId: persistencePlan.persistenceKey,
    externalSourceType: 'ecs_route_catalog',
    idempotencyKey: persistencePlan.persistenceKey,
  },
);

const savedCatalogRoute = saveCatalogRoute();
const repeatedCatalogRoute = saveCatalogRoute();
assert.strictEqual(
  repeatedCatalogRoute.id,
  savedCatalogRoute.id,
  'Repeated Save Route activation should reuse the exact catalog route identity.',
);
const savedCatalogRun = runStore.createFromRoute(savedCatalogRoute);
const repeatedCatalogRun = runStore.createFromRoute(savedCatalogRoute);
assert.strictEqual(repeatedCatalogRun.id, savedCatalogRun.id, 'A saved ECS route should own one linked planning run.');
routeStore.attachRun(savedCatalogRoute.id, savedCatalogRun.id);

let savedAssets = getSavedRouteAssets();
const ecsAsset = savedAssets.find((asset) => asset.routeId === savedCatalogRoute.id);
assert(ecsAsset, 'The saved ECS route should appear in the authoritative Saved Routes inventory.');
assert.strictEqual(ecsAsset.runId, savedCatalogRun.id);
assert.strictEqual(ecsAsset.sourceLabel, 'ECS ROUTE CATALOG');
assert.strictEqual(ecsAsset.badgeLabel, 'ECS ROUTE');
assert.strictEqual(ecsAsset.capabilities.canStitch, true, 'Saved ECS route should be selectable in Tools Stitch.');
assert.strictEqual(
  savedAssets.filter((asset) => asset.runId === savedCatalogRun.id).length,
  1,
  'The linked run must not appear as a duplicate Saved Routes asset.',
);

const catalogEnd = persistencePlan.coordinates[persistencePlan.coordinates.length - 1];
const savedMvumRoute = routeStore.createCustomRoute(
  [{
    coordinates: [catalogEnd, [-120.30, 39.40]],
    source_metadata: {
      kind: 'mvum_segment_stitch',
      sourceLabel: 'Navigate MVUM segment stitch',
      routeGeometrySourceKind: 'mvum',
      guidanceReady: true,
      segmentIds: ['mvum-fixture-1'],
    },
  }],
  {
    name: 'MVUM Custom Segment Route',
    sourceApp: 'ecs_navigate_mvum_stitch',
    externalSourceId: 'mvum-fixture-route',
    externalSourceType: 'mvum_segment_stitch',
    idempotencyKey: 'mvum-fixture-route',
  },
);
const savedMvumRun = runStore.createFromRoute(savedMvumRoute);
routeStore.attachRun(savedMvumRoute.id, savedMvumRun.id);

savedAssets = getSavedRouteAssets();
for (const routeId of [savedCatalogRoute.id, savedMvumRoute.id]) {
  const asset = savedAssets.find((candidate) => candidate.routeId === routeId);
  assert(asset?.capabilities.canStitch, 'Both saved ECS routes and MVUM builds must feed the same Tools Stitch inventory.');
}

const ecsGuidanceHandlerStart = navigateSource.indexOf('const handleRouteCatalogStartHybridGuidance');
const ecsGuidanceHandlerEnd = navigateSource.indexOf('const handleSaveRouteCatalogSelection', ecsGuidanceHandlerStart);
const ecsGuidanceHandler = navigateSource.slice(ecsGuidanceHandlerStart, ecsGuidanceHandlerEnd);
assert(
  ecsGuidanceHandlerStart >= 0 &&
    ecsGuidanceHandler.includes('shouldProtectActiveGuidanceFromHandoff(payload, activeGuidanceSnapshot)') &&
    ecsGuidanceHandler.indexOf('shouldProtectActiveGuidanceFromHandoff(payload, activeGuidanceSnapshot)') <
      ecsGuidanceHandler.indexOf('pendingAutoStartRouteIdRef.current = payload.id'),
  'Mounted ECS route guidance must protect an active session before mutating auto-start state or reporting success.',
);
assert(
  ecsGuidanceHandler.includes("payload.requiresOnlineRouting === true && !routeGeometryViewportFetchOnline"),
  'An off-route ECS approach must fail truthfully offline while on-route stored canonical geometry remains usable.',
);

(async () => {
  const cacheNow = Date.UTC(2026, 6, 17, 12, 0, 0);
  writeRouteCatalogViewportOfflineCache({
    bbox,
    cacheKey: query.cacheKey,
    result: catalogResult,
    now: cacheNow,
  });
  const cachedCatalog = await readRouteCatalogViewportOfflineCache(query.cacheKey, cacheNow + 1);
  assert.strictEqual(
    cachedCatalog?.result.featureCollection.features[0].properties.routeId,
    feature.properties.routeId,
    'Offline ECS cache should restore the same whole-route result shape.',
  );
  assert.strictEqual(
    await readRouteCatalogViewportOfflineCache(query.cacheKey, cacheNow + 31 * 24 * 60 * 60 * 1000),
    null,
    'Expired ECS route catalog cache must settle as unavailable instead of being treated as current.',
  );

  let bridgeCalls = 0;
  const stitched = await composeStitchedRoute({
    title: 'Combined ECS and MVUM Route',
    selectedRuns: [savedCatalogRun, savedMvumRun],
    fetchBridge: async () => {
      bridgeCalls += 1;
      return null;
    },
  });
  assert.strictEqual(stitched.blocked, false, 'Touching ECS and MVUM routes should compose in Tools Stitch.');
  assert.strictEqual(bridgeCalls, 0, 'Touching canonical routes should not invent or request connector geometry.');
  assert.strictEqual(stitched.segmentCount, 2);
  assert(
    stitched.parsed.routePoints.length >= persistencePlan.coordinates.length + 1,
    'Combined stitch output should preserve both canonical route bodies while de-duplicating the join.',
  );
  console.log('Navigate ECS Route Geometry save, Tools Stitch, and dedupe checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
