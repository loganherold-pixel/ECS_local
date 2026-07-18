const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'node' } };
  }
  if (request === './fsCompat') {
    return {
      getDocumentDirectory: async () => '',
      fsGetInfo: async (uri) => ({ exists: false, isDirectory: false, size: 0, uri }),
      fsEnsureDir: async () => true,
      fsWriteString: async () => undefined,
      fsReadString: async () => '',
    };
  }
  if (request === './nativeTileStorage') {
    return {
      downloadAndStoreNativeTile: async () => -1,
      hasNativeTile: async () => false,
      deleteNativeRegion: async () => 0,
      clearAllNativeTiles: async () => undefined,
      getNativeStorageStats: async () => ({ totalRegions: 0, totalTiles: 0, totalSizeBytes: 0, totalSizeMB: 0, regions: [] }),
      getDeviceStorageInfo: async () => null,
      isNativeStorageAvailable: () => false,
    };
  }
  if (request === './mapConfig') {
    return { getMapboxTokenSync: () => '' };
  }
  if (request === './connectivity') {
    return { connectivity: { isOnline: () => true } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

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

const {
  computeRouteCorridor,
  getTilesForBounds,
  getTilesForRouteCorridor,
  countTilesForRouteCorridor,
  estimateSizeMB,
  lngLatToTile,
  tileCacheStore,
} = require(path.join(root, 'lib', 'tileCacheStore.ts'));
const {
  analyzeRoute,
} = require(path.join(root, 'lib', 'routeTileCacheEngine.ts'));

function tileKey(tile) {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

const lShapeRoute = [
  { lat: 38.0, lng: -110.0 },
  { lat: 38.0, lng: -108.0 },
  { lat: 40.0, lng: -108.0 },
];
const corridorMiles = 5;
const zoom = 10;
const bbox = computeRouteCorridor(lShapeRoute, corridorMiles);

assert.ok(bbox, 'Buffered route bounds should be available for a valid route.');

const boundingBoxTiles = getTilesForBounds(bbox, zoom);
const corridorTiles = getTilesForRouteCorridor(lShapeRoute, corridorMiles, zoom);
const corridorTileKeys = new Set(corridorTiles.map(tileKey));
const northwestBoxCorner = lngLatToTile(bbox.minLng, bbox.maxLat, zoom);

assert.ok(corridorTiles.length > 0, 'Route corridor tile enumeration should include the route path.');
assert.ok(
  corridorTiles.length < boundingBoxTiles.length * 0.55,
  `Route corridor tiles should trim the empty bounding-box corners (${corridorTiles.length} vs ${boundingBoxTiles.length}).`,
);
assert.strictEqual(
  corridorTileKeys.has(tileKey({ ...northwestBoxCorner, z: zoom })),
  false,
  'A tile in the empty northwest corner of an L-shaped route bounds should not be downloaded.',
);

const routeTileCount = countTilesForRouteCorridor(lShapeRoute, corridorMiles, zoom, zoom);
assert.strictEqual(
  routeTileCount,
  corridorTiles.length,
  'Route corridor tile counts should match the route-filtered tile enumeration.',
);

tileCacheStore.clearAll();
const region = tileCacheStore.createFromRoute(
  'Route: L shape regression',
  lShapeRoute,
  corridorMiles,
  zoom,
  zoom,
  'tactical',
);

assert.ok(region, 'Route corridor regions should be created from valid route geometry.');
assert.strictEqual(region.sourceType, 'route-corridor');
assert.strictEqual(region.syncType, 'route');
assert.strictEqual(region.corridorMiles, corridorMiles);
assert.strictEqual(
  region.tileCount,
  routeTileCount,
  'Route-created regions should count only tiles intersecting the route corridor.',
);
assert.deepStrictEqual(
  region.routeGeometry,
  lShapeRoute,
  'Route-created regions should persist route geometry so the downloader can keep using the corridor filter.',
);

const run = {
  id: 'route-corridor-regression',
  title: 'Route Corridor Regression',
  source: 'built',
  created_at: '2026-06-20T12:00:00.000Z',
  updated_at: '2026-06-20T12:00:00.000Z',
  user_id: null,
  vehicle_id: null,
  build_snapshot: null,
  stats: {
    distance_m: 220000,
    distance_miles: 136.7,
    distance_km: 220,
    point_count: lShapeRoute.length,
    start_lat: lShapeRoute[0].lat,
    start_lng: lShapeRoute[0].lng,
    end_lat: lShapeRoute[lShapeRoute.length - 1].lat,
    end_lng: lShapeRoute[lShapeRoute.length - 1].lng,
    elevation_gain_ft: null,
    elevation_loss_ft: null,
    min_ele_ft: null,
    max_ele_ft: null,
  },
  points: lShapeRoute.map((point, index) => ({
    idx: index,
    lat: point.lat,
    lng: point.lng,
    ele_m: null,
    time: null,
    type: 'route',
  })),
  waypoints: [],
  is_active: false,
};

const analysis = analyzeRoute(run);
assert.ok(analysis, 'Route analysis should be available for valid route geometry.');
assert.strictEqual(
  analysis.tileCount,
  countTilesForRouteCorridor(lShapeRoute, analysis.bufferMiles, analysis.zoomMin, analysis.zoomMax),
  'Route analysis should estimate download size from the route corridor, not the full bounding box.',
);

tileCacheStore.updateRegion(region.id, {
  routeId: run.id,
  status: 'complete',
  downloadedTiles: region.tileCount,
});

const tacticalAliasAnalysis = analyzeRoute(run, 'tac');
assert.strictEqual(
  tacticalAliasAnalysis.cachedRegion?.id,
  region.id,
  'A tactical cache should satisfy the legacy TAC style alias for the same route.',
);

const ecsStyleAnalysis = analyzeRoute(run, 'ecs');
assert.strictEqual(
  ecsStyleAnalysis.cachedRegion,
  null,
  'A tactical cache must not satisfy the distinct ECS day style.',
);

const satelliteStyleAnalysis = analyzeRoute(run, 'sat');
assert.strictEqual(
  satelliteStyleAnalysis.cachedRegion,
  null,
  'A tactical cache must not satisfy the distinct satellite style.',
);
assert.strictEqual(
  satelliteStyleAnalysis.estimatedSizeMB,
  estimateSizeMB(satelliteStyleAnalysis.tileCount, 'satellite'),
  'Route analysis should estimate storage using the requested semantic map style.',
);
assert.ok(
  satelliteStyleAnalysis.estimatedSizeMB > analysis.estimatedSizeMB,
  'Satellite storage estimates should remain larger than the default tactical estimate.',
);

tileCacheStore.clearAll();
const legacyDayRegion = tileCacheStore.createFromRoute(
  'Route: Legacy day style',
  lShapeRoute,
  corridorMiles,
  zoom,
  zoom,
  'day',
);
assert.ok(legacyDayRegion, 'A legacy day-style fixture region should be created.');
tileCacheStore.updateRegion(legacyDayRegion.id, {
  routeId: run.id,
  status: 'complete',
  downloadedTiles: legacyDayRegion.tileCount,
});

const legacyDayAliasAnalysis = analyzeRoute(run, 'ecs');
assert.strictEqual(
  legacyDayAliasAnalysis.cachedRegion?.id,
  legacyDayRegion.id,
  'A legacy DAY cache should satisfy the canonical ECS day style.',
);
assert.strictEqual(
  analyzeRoute(run, 'tactical').cachedRegion,
  null,
  'A route-tagged day cache must not be reused for tactical rendering.',
);

tileCacheStore.clearAll();
const legacyOfflinePrepRegion = tileCacheStore.createFromRoute(
  'Route: Legacy Offline Prep tactical metadata',
  lShapeRoute,
  corridorMiles,
  zoom,
  zoom,
  'tactical',
);
assert.ok(legacyOfflinePrepRegion, 'A legacy Offline Prep fixture region should be created.');
tileCacheStore.updateRegion(legacyOfflinePrepRegion.id, {
  routeId: run.id,
  status: 'complete',
  downloadedTiles: legacyOfflinePrepRegion.tileCount,
  routeIntent: {
    syncType: 'route',
    mapContext: {
      styleKey: 'tactical',
      layerContext: ['offline_prep_pack', 'trip_builder_itinerary'],
    },
    readinessSnapshot: {
      offlinePrepManifest: { routeId: run.id },
    },
  },
});
assert.strictEqual(
  analyzeRoute(run, 'ecs').cachedRegion?.id,
  legacyOfflinePrepRegion.id,
  'A proven legacy Offline Prep tactical record should reuse its identical OSM raster tiles for ECS Day.',
);
tileCacheStore.updateRegion(legacyOfflinePrepRegion.id, {
  styleKey: 'ecs',
  routeIntent: {
    syncType: 'route',
    mapContext: {
      styleKey: 'ecs',
      layerContext: ['route-corridor', 'road-preview', 'offline_prep_pack', 'trip_builder_itinerary'],
    },
    readinessSnapshot: {
      offlinePrepManifest: { routeId: run.id },
    },
  },
});
assert.strictEqual(
  analyzeRoute(run, 'ecs').cachedRegion?.id,
  legacyOfflinePrepRegion.id,
  'Re-preparing a legacy pack should preserve ECS cache reuse after its style/intent metadata is canonicalized.',
);
assert.strictEqual(
  analyzeRoute(run, 'tactical').cachedRegion,
  null,
  'A migrated legacy pack must not revert to Tactical after new intent metadata replaces legacy provenance.',
);

tileCacheStore.clearAll();
const satelliteCoverageRegion = tileCacheStore.createFromRoute(
  'Area: Satellite corridor coverage',
  lShapeRoute,
  corridorMiles,
  zoom,
  zoom,
  'satellite',
);
assert.ok(satelliteCoverageRegion, 'A satellite coverage fixture region should be created.');
tileCacheStore.updateRegion(satelliteCoverageRegion.id, {
  routeId: 'another-route',
  status: 'complete',
  downloadedTiles: satelliteCoverageRegion.tileCount,
});

assert.strictEqual(
  analyzeRoute(run, 'sat').cachedRegion?.id,
  satelliteCoverageRegion.id,
  'Coverage-based reuse should accept the SAT alias for a satellite cache.',
);
assert.strictEqual(
  analyzeRoute(run, 'tac').cachedRegion,
  null,
  'Coverage-based reuse must ignore a geometrically matching cache for a different style.',
);
assert.strictEqual(
  analyzeRoute(run).cachedRegion?.id,
  satelliteCoverageRegion.id,
  'Callers that omit a requested style should retain the existing style-agnostic cache lookup behavior.',
);

console.log('Route tile corridor trimming regression passed.');
