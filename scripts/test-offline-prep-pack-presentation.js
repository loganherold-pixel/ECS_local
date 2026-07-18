const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve('.');

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const {
  buildOfflineReadinessManifest,
} = require(path.join(root, 'lib', 'offlinePrepPack', 'offlineReadinessManifest.ts'));
const {
  buildOfflinePrepPackPresentation,
} = require(path.join(root, 'lib', 'offlinePrepPack', 'offlinePrepPackPresentation.ts'));

const generatedAt = '2026-07-17T12:00:00.000Z';

function item(overrides) {
  return {
    id: `item-${overrides.type}`,
    type: overrides.type,
    label: overrides.label ?? overrides.type,
    status: 'ready',
    availability: 'available',
    required: false,
    source: 'deterministic_fixture',
    summary: `${overrides.label ?? overrides.type} fixture summary.`,
    count: null,
    estimatedSizeMB: null,
    cacheKey: null,
    error: null,
    metadata: null,
    ...overrides,
  };
}

function baseItems() {
  return [
    item({
      type: 'offline_map',
      label: 'Offline Map',
      status: 'not_started',
      availability: 'pending_download',
      required: true,
      estimatedSizeMB: 42,
    }),
    item({
      type: 'route_line',
      label: 'Canonical Route Line',
      required: true,
      count: 40,
      estimatedSizeMB: 0.1,
    }),
    item({
      type: 'trip_itinerary',
      label: 'Trip Itinerary',
      required: true,
      count: 4,
    }),
    item({
      type: 'road_turn_guidance',
      label: 'Road Turn Guidance',
      required: true,
      count: 8,
    }),
    item({
      type: 'weather_snapshot',
      label: 'Weather Snapshot',
      status: 'unavailable',
      availability: 'not_set',
      summary: 'No weather snapshot was saved.',
    }),
  ];
}

function manifestFromItems(items, mutateReadiness) {
  const readinessManifest = buildOfflineReadinessManifest({
    packageId: 'presentation-pack',
    routeId: 'presentation-route',
    generatedAt,
    items,
  });
  if (mutateReadiness) mutateReadiness(readinessManifest);
  return {
    schemaVersion: 1,
    id: 'presentation-pack',
    generatedAt,
    routeId: 'presentation-route',
    routeName: 'Presentation Route',
    routeBounds: null,
    items,
    progress: {
      status: 'partially_ready',
      totalItems: items.length,
      readyItems: items.filter((entry) => entry.status === 'ready').length,
      unavailableItems: items.filter((entry) => entry.status === 'unavailable').length,
      failedItems: items.filter((entry) => entry.status === 'failed').length,
      percent: 60,
    },
    errors: items.map((entry) => entry.error).filter(Boolean),
    tripPlanId: 'trip-plan-fixture',
    routeAssetId: 'route-asset-fixture',
    lifecycle: {
      phase: 'offline_ready',
      identity: {},
      provenance: {},
    },
    readinessManifest,
  };
}

function queue(status, overrides = {}) {
  const active = status === 'queued' || status === 'downloading';
  return {
    status,
    label: status === 'complete' ? 'MAP READY' : `MAP ${status.toUpperCase()}`,
    message: status === 'downloading'
      ? 'Offline map tiles are downloading through the shared route-cache queue.'
      : `Map fixture state: ${status}.`,
    regionId: 'region-fixture',
    jobId: 'job-fixture',
    percent: status === 'complete' ? 100 : status === 'downloading' ? 45 : 0,
    totalTiles: 100,
    downloadedTiles: status === 'complete' ? 100 : status === 'downloading' ? 45 : 0,
    failedTiles: status === 'failed' ? 1 : 0,
    estimatedSizeMB: 42,
    downloadedSizeMB: status === 'complete' ? 42 : status === 'downloading' ? 18.9 : 0,
    errorMessage: status === 'failed' ? 'Tile provider transport failed.' : null,
    retryable: status === 'failed' || status === 'cancelled',
    active,
    source: 'sync_job',
    updatedAt: generatedAt,
    ...overrides,
  };
}

function present(items, mapQueueState, mutateReadiness) {
  return buildOfflinePrepPackPresentation({
    manifest: manifestFromItems(items, mutateReadiness),
    mapQueueState,
    now: generatedAt,
  });
}

const needsDownload = present(baseItems(), queue('not_requested'));
assert.strictEqual(needsDownload.kind, 'needs_download');
assert.strictEqual(needsDownload.primaryActionLabel, 'Download Offline Pack');
assert.strictEqual(needsDownload.navigationReady, false);
assert.strictEqual(needsDownload.mapStatus, 'not_requested');
assert.strictEqual(needsDownload.requiredReadyCount, 3);
assert.strictEqual(needsDownload.requiredCount, 4);

const preparing = present(baseItems(), queue('downloading'));
assert.strictEqual(preparing.kind, 'preparing');
assert.strictEqual(preparing.primaryActionEnabled, false);
assert.match(preparing.summary, /downloading through the shared route-cache queue/i);
assert.strictEqual(preparing.groups.find((group) => group.id === 'map').status, 'preparing');

const ready = present(baseItems(), queue('complete'));
assert.strictEqual(ready.kind, 'ready', 'Optional field gaps must not block required navigation readiness.');
assert.strictEqual(ready.navigationReady, true);
assert.strictEqual(ready.mapReady, true);
assert.strictEqual(ready.routeGeometryReady, true);
assert.strictEqual(ready.turnGuidanceState, 'ready');
assert.strictEqual(ready.optionalGapCount, 1);
assert.match(ready.headline, /Ready for offline navigation/);
assert.match(ready.summary, /1 optional item is not included/);
assert.strictEqual(ready.groups.length, 4);
assert.strictEqual(
  ready.groups.reduce((count, group) => count + group.items.length, 0),
  baseItems().length,
  'Every manifest item should appear in exactly one presentation group.',
);
assert.strictEqual(ready.groups.find((group) => group.id === 'optional_field_context').status, 'degraded');

const lineOnlyItems = baseItems().map((entry) => (
  entry.type === 'road_turn_guidance'
    ? {
        ...entry,
        required: false,
        status: 'unavailable',
        availability: 'unavailable',
        summary: 'Detailed road turns were not cached.',
      }
    : entry
));
const degraded = present(lineOnlyItems, queue('complete'));
assert.strictEqual(degraded.kind, 'degraded');
assert.strictEqual(degraded.navigationReady, true, 'Map-and-line navigation should remain available without fabricated road turns.');
assert.strictEqual(degraded.turnGuidanceState, 'unavailable');
assert.match(degraded.summary, /detailed road turns are unavailable/i);
assert.ok(!/turn-by-turn.*ready/i.test(degraded.summary));

const requiredRoadTurnsMissing = baseItems().map((entry) => (
  entry.type === 'road_turn_guidance'
    ? {
        ...entry,
        status: 'unavailable',
        availability: 'unavailable',
        summary: 'Required road turns were not cached.',
      }
    : entry
));
const blockedGuidance = present(requiredRoadTurnsMissing, queue('complete'));
assert.strictEqual(blockedGuidance.kind, 'blocked');
assert.strictEqual(blockedGuidance.navigationReady, false);
assert.ok(blockedGuidance.attentionItems.some((entry) => entry.itemType === 'road_turn_guidance' && entry.severity === 'blocker'));

const missingGeometry = baseItems().map((entry) => (
  entry.type === 'route_line'
    ? {
        ...entry,
        status: 'unavailable',
        availability: 'unavailable',
        summary: 'Canonical route geometry is missing.',
      }
    : entry
));
const blockedGeometry = present(missingGeometry, queue('complete'));
assert.strictEqual(blockedGeometry.kind, 'blocked');
assert.strictEqual(blockedGeometry.routeGeometryReady, false);
assert.ok(blockedGeometry.attentionItems.some((entry) => entry.itemType === 'route_line'));

const failed = present(baseItems(), queue('failed'));
assert.strictEqual(failed.kind, 'error');
assert.strictEqual(failed.primaryActionLabel, 'Retry Offline Preparation');
assert.match(failed.summary, /Tile provider transport failed/);

const lowSignalFallbackItems = baseItems().map((entry) => (
  entry.type === 'offline_map'
    ? {
        ...entry,
        status: 'failed',
        availability: 'failed',
        metadata: { fullRouteTooLarge: true },
      }
    : entry
));
lowSignalFallbackItems.push(item({
  type: 'critical_offline_segments',
  label: 'Low-Signal Map Segments',
  status: 'not_started',
  availability: 'pending_download',
  count: 2,
}));
const lowSignalFallback = present(lowSignalFallbackItems, queue('failed'));
assert.strictEqual(lowSignalFallback.kind, 'needs_download');
assert.strictEqual(lowSignalFallback.primaryActionLabel, 'Download Low-Signal Map Segments');
assert.strictEqual(lowSignalFallback.navigationReady, false);

const partialLowSignalFallback = present(lowSignalFallbackItems, queue('complete'));
assert.strictEqual(partialLowSignalFallback.kind, 'degraded');
assert.strictEqual(partialLowSignalFallback.mapReady, false);
assert.strictEqual(partialLowSignalFallback.navigationReady, false);
assert.ok(
  partialLowSignalFallback.requiredReadyCount < partialLowSignalFallback.requiredCount,
  'Partial low-signal coverage must not count the required full-route map as ready.',
);
assert.match(partialLowSignalFallback.headline, /Partial offline map coverage/);
assert.match(partialLowSignalFallback.summary, /not present this pack as fully ready/i);

const unavailableMap = present(baseItems(), queue('unavailable'));
assert.strictEqual(unavailableMap.kind, 'blocked');
assert.strictEqual(unavailableMap.mapReady, false);

const lowStorage = present(baseItems(), queue('complete'), (readiness) => {
  readiness.storage.lowSpace = true;
  readiness.storage.shortfallBytes = 1024;
});
assert.strictEqual(lowStorage.kind, 'blocked');
assert.ok(lowStorage.attentionItems.some((entry) => /storage/i.test(entry.title)));

const indexSource = fs.readFileSync(path.join(root, 'lib', 'offlinePrepPack', 'index.ts'), 'utf8');
assert.ok(indexSource.includes("export * from './offlinePrepPackPresentation';"));

console.log('Offline Prep Pack presentation behavior tests passed.');
