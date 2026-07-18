/* global __dirname */
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
  resolveOfflinePrepRetryRegionIds,
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

const multiRegionManifest = {
  ...manifest,
  readinessManifest: {
    assets: [{ kind: 'map_region', storageRefs: ['segment-region-1', 'segment-region-2'] }],
  },
};
const completeSegment = {
  id: 'segment-region-1',
  name: 'Low-signal segment 1',
  bounds: { minLat: 1, maxLat: 2, minLng: 3, maxLng: 4 },
  zoomMin: 10,
  zoomMax: 12,
  tileCount: 40,
  downloadedTiles: 40,
  estimatedSizeMB: 5,
  actualSizeMB: 4.8,
  downloadedAt: '2026-05-24T12:03:00.000Z',
  completedAt: '2026-05-24T12:03:00.000Z',
  styleKey: 'tactical',
  status: 'complete',
  sourceType: 'route-corridor',
  syncType: 'route',
  routeId: getOfflinePrepRouteCacheRunId('test-route'),
};
const failedSegment = {
  ...completeSegment,
  id: 'segment-region-2',
  name: 'Low-signal segment 2',
  tileCount: 60,
  downloadedTiles: 45,
  actualSizeMB: 5.1,
  status: 'error',
  errorMessage: '15 required tiles failed.',
  completedAt: undefined,
};
const mixedSegments = resolveOfflinePrepMapQueueState({
  manifest: multiRegionManifest,
  syncSnapshot: { jobs: [], activeJobs: [], latestJob: null, latestCompletedJob: null, backgroundSupport: 'app-process' },
  regions: [completeSegment, failedSegment],
});
assert.strictEqual(mixedSegments.status, 'failed');
assert.strictEqual(mixedSegments.requiredRegionCount, 2);
assert.strictEqual(mixedSegments.completedRegionCount, 1);
assert.strictEqual(mixedSegments.failedRegionCount, 1);
assert.strictEqual(mixedSegments.percent, 85);
assert.deepStrictEqual(mixedSegments.regionIds.sort(), ['segment-region-1', 'segment-region-2']);
assert.match(mixedSegments.message, /1 of 2 required route map regions failed or is incomplete/);

const activeSiblingManifest = {
  ...multiRegionManifest,
  readinessManifest: {
    assets: [{ kind: 'map_region', storageRefs: ['segment-region-1', 'segment-region-2', 'segment-region-3'] }],
  },
};
const activeWithFailure = resolveOfflinePrepMapQueueState({
  manifest: activeSiblingManifest,
  syncSnapshot: { jobs: [], activeJobs: [], latestJob: null, latestCompletedJob: null, backgroundSupport: 'app-process' },
  regions: [
    completeSegment,
    failedSegment,
    { ...failedSegment, id: 'segment-region-3', status: 'downloading', downloadedTiles: 12, errorMessage: undefined },
  ],
});
assert.strictEqual(activeWithFailure.status, 'downloading', 'A package is still active while any required sibling is downloading.');
assert.strictEqual(activeWithFailure.retryable, false, 'Retry remains disabled until active sibling downloads settle.');
assert.strictEqual(activeWithFailure.failedRegionCount, 1);

const allSegmentsComplete = resolveOfflinePrepMapQueueState({
  manifest: multiRegionManifest,
  syncSnapshot: { jobs: [], activeJobs: [], latestJob: null, latestCompletedJob: null, backgroundSupport: 'app-process' },
  regions: [completeSegment, {
    ...failedSegment,
    downloadedTiles: 60,
    status: 'complete',
    errorMessage: undefined,
    completedAt: '2026-05-24T12:04:00.000Z',
  }],
});
assert.strictEqual(allSegmentsComplete.status, 'complete');
assert.strictEqual(allSegmentsComplete.completedRegionCount, 2);
assert.strictEqual(allSegmentsComplete.percent, 100);

const incompleteCompleteJob = {
  ...runningJob,
  status: 'complete',
  progress: {
    ...runningJob.progress,
    status: 'complete',
    totalTiles: 100,
    downloadedTiles: 99,
    failedTiles: 1,
    percent: 100,
  },
  completedAt: '2026-05-24T12:05:00.000Z',
};
const incompleteJobState = resolveOfflinePrepMapQueueState({
  manifest,
  syncSnapshot: { jobs: [incompleteCompleteJob], activeJobs: [], latestJob: incompleteCompleteJob, latestCompletedJob: incompleteCompleteJob, backgroundSupport: 'app-process' },
  regions: [],
});
assert.strictEqual(incompleteJobState.status, 'failed');
assert.strictEqual(incompleteJobState.percent, 99);
assert.strictEqual(incompleteJobState.retryable, true);

const retryRegionIds = resolveOfflinePrepRetryRegionIds(mixedSegments, [completeSegment, failedSegment]);
assert.deepStrictEqual(retryRegionIds, ['segment-region-2']);
const boundedRetryRegionIds = resolveOfflinePrepRetryRegionIds({
  ...mixedSegments,
  regionIds: ['segment-region-1', 'segment-region-2', 'segment-region-3'],
}, [
  completeSegment,
  failedSegment,
  { ...failedSegment, id: 'segment-region-3', status: 'downloading', errorMessage: undefined },
]);
assert.deepStrictEqual(boundedRetryRegionIds, ['segment-region-2'], 'Retry must not restart an equivalent region that is still actively downloading.');

const screen = read('app/explore-offline-prep-pack.tsx');
assert.ok(screen.includes('resolveOfflinePrepMapQueueState({ manifest, syncSnapshot, regions: tileRegions })'));
assert.ok(screen.includes('testID="offline-prep-map-queue-state"'));
assert.ok(screen.includes('testID="offline-prep-retry-map-download"'));
assert.ok(screen.includes('resolveOfflinePrepRetryRegionIds(mapQueueState, tileCacheStore.getRegions())'));
assert.ok(screen.includes('tileCacheStore.subscribe(refreshSyncState)'));
assert.ok(screen.includes('offlineTileSyncCoordinator.subscribe(refreshSyncState)'));

const packageJson = JSON.parse(read('package.json'));
assert.strictEqual(
  packageJson.scripts['test:offline-prep-pack-queue'],
  'node ./scripts/test-offline-prep-pack-queue.js',
  'package.json should expose the Offline Prep Pack queue test.',
);

console.log('Offline Prep Pack queue/progress tests passed.');
