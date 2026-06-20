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

console.log('Route tile corridor trimming regression passed.');
