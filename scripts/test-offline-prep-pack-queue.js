const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'node' } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const {
  getOfflinePrepRouteCacheRunId,
  resolveOfflinePrepMapQueueState,
} = require(path.join(root, 'lib', 'offlinePrepPack', 'offlinePrepPackQueue.ts'));

const manifest = {
  id: 'offline-prep-test-route',
  generatedAt: '2026-05-24T12:00:00.000Z',
  routeId: 'test-route',
  routeName: 'Test Route',
  routeBounds: null,
  items: [
    {
      id: 'offline-prep-offline_map',
      type: 'offline_map',
      label: 'Offline Map',
      status: 'not_started',
      availability: 'pending_download',
      required: true,
      source: 'tile_cache_store',
      summary: 'Offline map preparation can start from Explore.',
      estimatedSizeMB: 12,
      cacheKey: null,
      error: null,
      metadata: null,
    },
  ],
  progress: {
    status: 'partially_ready',
    totalItems: 1,
    readyItems: 0,
    unavailableItems: 0,
    failedItems: 0,
    percent: 0,
  },
  errors: [],
};

assert.strictEqual(getOfflinePrepRouteCacheRunId('Test Route!'), 'offline-prep-test-route');

const notRequested = resolveOfflinePrepMapQueueState({
  manifest,
  syncSnapshot: { jobs: [], activeJobs: [], latestJob: null, latestCompletedJob: null, backgroundSupport: 'app-process' },
  regions: [],
});
assert.strictEqual(notRequested.status, 'not_requested');
assert.strictEqual(notRequested.retryable, false);

const runningJob = {
  jobId: 'job-1',
  regionId: 'region-1',
  regionName: 'Route: Test Route',
  source: 'route-corridor',
  syncType: 'route',
  routeIntent: { readinessSnapshot: { offlinePrepManifest: manifest } },
  status: 'running',
  progress: {
    regionId: 'region-1',
    status: 'downloading',
    totalTiles: 100,
    downloadedTiles: 42,
    failedTiles: 1,
    percent: 42,
    estimatedSizeMB: 12,
    downloadedSizeMB: 5,
    message: 'Downloading zoom 12...',
    currentZoom: 12,
    speed: 4,
    eta: 20,
  },
  createdAt: '2026-05-24T12:00:00.000Z',
  updatedAt: '2026-05-24T12:01:00.000Z',
  completedAt: null,
  errorMessage: null,
  appProcessBackgroundOnly: true,
};

const downloading = resolveOfflinePrepMapQueueState({
  manifest,
  syncSnapshot: { jobs: [runningJob], activeJobs: [runningJob], latestJob: runningJob, latestCompletedJob: null, backgroundSupport: 'app-process' },
  regions: [],
});
assert.strictEqual(downloading.status, 'downloading');
assert.strictEqual(downloading.percent, 42);
assert.strictEqual(downloading.source, 'sync_job');
assert.strictEqual(downloading.retryable, false);

const failedJob = {
  ...runningJob,
  jobId: 'job-2',
  status: 'error',
  progress: { ...runningJob.progress, status: 'error', message: 'Quota check failed.', percent: 42 },
  errorMessage: 'Quota check failed.',
  updatedAt: '2026-05-24T12:02:00.000Z',
  completedAt: '2026-05-24T12:02:00.000Z',
};

const failed = resolveOfflinePrepMapQueueState({
  manifest,
  syncSnapshot: { jobs: [failedJob], activeJobs: [], latestJob: failedJob, latestCompletedJob: null, backgroundSupport: 'app-process' },
  regions: [],
});
assert.strictEqual(failed.status, 'failed');
assert.strictEqual(failed.retryable, true);
assert.strictEqual(failed.errorMessage, 'Quota check failed.');

const regionComplete = resolveOfflinePrepMapQueueState({
  manifest,
  syncSnapshot: { jobs: [], activeJobs: [], latestJob: null, latestCompletedJob: null, backgroundSupport: 'app-process' },
  regions: [{
    id: 'region-2',
    name: 'Route: Test Route',
    bounds: { minLat: 1, maxLat: 2, minLng: 3, maxLng: 4 },
    zoomMin: 10,
    zoomMax: 12,
    tileCount: 50,
    downloadedTiles: 50,
    estimatedSizeMB: 6,
    actualSizeMB: 5.8,
    downloadedAt: '2026-05-24T12:03:00.000Z',
    completedAt: '2026-05-24T12:03:00.000Z',
    styleKey: 'tactical',
    status: 'complete',
    sourceType: 'route-corridor',
    syncType: 'route',
    routeId: getOfflinePrepRouteCacheRunId('test-route'),
  }],
});
assert.strictEqual(regionComplete.status, 'complete');
assert.strictEqual(regionComplete.percent, 100);
assert.strictEqual(regionComplete.source, 'tile_region');

const screen = read('app/explore-offline-prep-pack.tsx');
assert.ok(screen.includes('resolveOfflinePrepMapQueueState({ manifest, syncSnapshot, regions: tileRegions })'));
assert.ok(screen.includes('testID="offline-prep-map-queue-state"'));
assert.ok(screen.includes('testID="offline-prep-retry-map-download"'));
assert.ok(screen.includes('Offline map retry started. Progress is shown here and in the shared ECS sync banner.'));
assert.ok(screen.includes('tileCacheStore.subscribe(refreshSyncState)'));
assert.ok(screen.includes('offlineTileSyncCoordinator.subscribe(refreshSyncState)'));

const packageJson = JSON.parse(read('package.json'));
assert.strictEqual(
  packageJson.scripts['test:offline-prep-pack-queue'],
  'node ./scripts/test-offline-prep-pack-queue.js',
  'package.json should expose the Offline Prep Pack queue test.',
);

console.log('Offline Prep Pack queue/progress tests passed.');
