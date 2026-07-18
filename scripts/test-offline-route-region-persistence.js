/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const storage = new Map();
global.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  if (parent?.filename.endsWith(path.join('lib', 'offlineRouteCacheService.ts'))) {
    if (request === './fsCompat') {
      return {
        getDocumentDirectory: async () => '',
        fsEnsureDir: async () => {},
        fsReadString: async () => '[]',
        fsWriteString: async () => {},
      };
    }
    if (request === './remote/offlineRemoteCache') {
      return {
        REMOTE_CACHE_GROUP_ID: 'ecs-remote-v1',
        buildOfflineRemoteCacheManifest: () => null,
      };
    }
    if (request === './runStore') {
      return {
        computeRunHealth: () => ({ overall: 'green', range: null, roof: null, hitch: null, warnings: [] }),
        generateRunGPX: () => '<gpx />',
      };
    }
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

const servicePath = path.join(root, 'lib', 'offlineRouteCacheService.ts');
const service = require(servicePath);
const now = '2026-07-17T20:00:00.000Z';
const run = {
  id: 'multi-region-offline-route',
  user_id: null,
  title: 'Multi-region Offline Route',
  source: 'offline_prep_pack',
  created_at: now,
  updated_at: now,
  vehicle_id: null,
  build_snapshot: {
    vehicle_name: 'Fixture vehicle', vehicle_id: null, estimated_range_miles: 300,
    total_weight_lb: 0, roof_weight_lb: 0, hitch_weight_lb: 0,
    limits: { roof_limit_lb: 0, hitch_limit_lb: 0 }, captured_at: now,
  },
  stats: {
    distance_m: 16093.44, distance_miles: 10, distance_km: 16.09344, point_count: 2,
    start_lat: 38.7, start_lng: -121.3, end_lat: 38.9, end_lng: -121.1,
    elevation_gain_ft: null, elevation_loss_ft: null, min_ele_ft: null, max_ele_ft: null,
  },
  points: [
    { idx: 0, lat: 38.7, lng: -121.3, ele_m: null, time: null, type: 'route' },
    { idx: 1, lat: 38.9, lng: -121.1, ele_m: null, time: null, type: 'route' },
  ],
  waypoints: [],
  is_active: false,
};

(async () => {
  await service.cacheOfflineRoute({
    run,
    offlineTileRegionId: 'segment-region-1',
    offlineTileRegionIds: ['segment-region-1', 'segment-region-2'],
    tileCacheStatus: 'downloading',
    includeRemoteConnectivityCache: false,
  });
  let route = (await service.listOfflineCachedRoutes())[0];
  assert.deepStrictEqual(route.offlineTileRegionIds, ['segment-region-1', 'segment-region-2']);
  assert.strictEqual(route.tileCacheStatus, 'downloading');

  await service.cacheOfflineRoute({
    run,
    offlineTileRegionId: 'segment-region-1',
    tileCacheStatus: 'complete',
    includeRemoteConnectivityCache: false,
  });
  route = (await service.listOfflineCachedRoutes())[0];
  assert.strictEqual(route.offlineTileRegionStatuses['segment-region-1'], 'complete');
  assert.strictEqual(route.offlineTileRegionStatuses['segment-region-2'], 'downloading');
  assert.strictEqual(route.tileCacheStatus, 'downloading', 'One complete region must not promote a multi-region package while another is active.');

  await service.cacheOfflineRoute({
    run,
    offlineTileRegionId: 'segment-region-2',
    tileCacheStatus: 'complete',
    includeRemoteConnectivityCache: false,
  });
  route = (await service.listOfflineCachedRoutes())[0];
  assert.strictEqual(route.tileCacheStatus, 'complete');
  assert.strictEqual(route.offlineTileRegionId, 'segment-region-2', 'Legacy single-region consumers retain the most recently updated region.');

  const projection = service.offlineCachedRouteToRunCacheManifest(route, run);
  assert.deepStrictEqual(projection.tile_region_ids, ['segment-region-1', 'segment-region-2']);
  assert.deepStrictEqual(projection.tile_region_statuses, {
    'segment-region-1': 'complete',
    'segment-region-2': 'complete',
  });

  delete require.cache[require.resolve(servicePath)];
  const restoredService = require(servicePath);
  const restored = (await restoredService.listOfflineCachedRoutes())[0];
  assert.deepStrictEqual(restored.offlineTileRegionIds, ['segment-region-1', 'segment-region-2']);
  assert.strictEqual(restored.tileCacheStatus, 'complete');

  const failed = await restoredService.cacheOfflineRoute({
    run,
    offlineTileRegionId: 'segment-region-2',
    tileCacheStatus: 'failed',
    tileCacheError: 'Required tile failed.',
    includeRemoteConnectivityCache: false,
  });
  assert.strictEqual(failed.tileCacheStatus, 'failed');
  assert.strictEqual(failed.offlineTileRegionStatuses['segment-region-1'], 'complete');
  assert.strictEqual(failed.offlineTileRegionStatuses['segment-region-2'], 'failed');
  assert.strictEqual(failed.tileCacheError, 'Required tile failed.');

  const activeWithFailure = await restoredService.cacheOfflineRoute({
    run,
    offlineTileRegionId: 'segment-region-1',
    tileCacheStatus: 'downloading',
    includeRemoteConnectivityCache: false,
  });
  assert.strictEqual(activeWithFailure.tileCacheStatus, 'downloading', 'Persisted package state remains active while a sibling is downloading.');
  assert.strictEqual(activeWithFailure.tileCacheError, 'Required tile failed.');

  const siblingUpdate = await restoredService.cacheOfflineRoute({
    run,
    offlineTileRegionId: 'segment-region-1',
    tileCacheStatus: 'complete',
    includeRemoteConnectivityCache: false,
  });
  assert.strictEqual(siblingUpdate.tileCacheStatus, 'failed');
  assert.strictEqual(siblingUpdate.tileCacheError, 'Required tile failed.', 'A sibling completion must not erase an unresolved region failure.');

  const retrying = await restoredService.cacheOfflineRoute({
    run,
    offlineTileRegionId: 'segment-region-2',
    tileCacheStatus: 'downloading',
    tileCacheError: null,
    includeRemoteConnectivityCache: false,
  });
  assert.strictEqual(retrying.tileCacheStatus, 'downloading');
  assert.strictEqual(retrying.tileCacheError, null, 'Starting a retry clears the old terminal error.');

  const replacement = await restoredService.cacheOfflineRoute({
    run,
    offlineTileRegionId: 'replacement-region',
    offlineTileRegionIds: ['replacement-region'],
    tileCacheStatus: 'downloading',
    includeRemoteConnectivityCache: false,
  });
  assert.deepStrictEqual(
    replacement.offlineTileRegionIds,
    ['replacement-region'],
    'A new preparation package replaces stale region membership instead of inheriting prior failed regions.',
  );

  console.log('Offline route multi-region persistence tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
