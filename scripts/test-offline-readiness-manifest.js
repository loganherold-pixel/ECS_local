/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'node' } };
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
  auditOfflineReadinessManifest,
  buildOfflineReadinessManifest,
  getOfflineReadinessAsset,
  migrateOfflineReadinessManifest,
  planOfflineStorageEviction,
  redactOfflineReadinessManifestForSupport,
} = require(path.join(root, 'lib', 'offlinePrepPack', 'offlineReadinessManifest.ts'));
const {
  OFFLINE_READINESS_COORDINATOR_STORAGE_KEY,
  createOfflineReadinessCoordinator,
} = require(path.join(root, 'lib', 'offlinePrepPack', 'offlineReadinessCoordinator.ts'));

const generatedAt = '2026-07-13T12:00:00.000Z';
const routeId = 'restricted-route-42';
const packageId = 'offline-package-42';

function readyItem(type, required = false, extra = {}) {
  return {
    id: `item-${type}`,
    type,
    label: type,
    status: 'ready',
    availability: 'available',
    required,
    source: 'test_fixture',
    summary: `${type} is ready.`,
    count: 1,
    ...extra,
  };
}

function buildReadyManifest() {
  return buildOfflineReadinessManifest({
    packageId,
    routeId,
    routeAssetId: 'route-asset-42',
    tripPlanId: 'trip-plan-42',
    expeditionId: 'expedition-42',
    generatedAt,
    items: [
      readyItem('route_line', true),
      readyItem('offline_map', true, { cacheKey: 'tile-region-42', estimatedSizeMB: 12 }),
      readyItem('trip_itinerary', true),
      readyItem('gpx_export'),
      readyItem('campsites'),
      readyItem('weather_snapshot', false, {
        metadata: {
          provider: 'weather_fixture',
          observedAt: '2026-07-13T11:30:00.000Z',
          validUntil: '2026-07-13T18:00:00.000Z',
          retrievedAt: generatedAt,
        },
      }),
      readyItem('emergency_notes', false, { source: 'operator_emergency_notes' }),
      readyItem('vehicle_readiness_summary'),
      readyItem('exit_points', true),
      readyItem('waypoints'),
    ],
    contentFingerprints: {
      route_geometry: [[-119.1, 35.1], [-119.2, 35.2]],
      map_region: { regionId: 'tile-region-42', tileCount: 20 },
      navigation_assets: { itineraryId: 'trip-plan-42' },
      camp_candidates: [{ id: 'camp-1' }],
      weather_snapshot: { tempF: 64 },
      emergency_recovery_packet: { editable: true },
      vehicle_loadout_snapshot: { vehicleId: 'vehicle-42' },
      waypoints_bailouts: [{ id: 'exit-1' }],
    },
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function memoryStorage(initial = null) {
  const values = new Map();
  if (initial) values.set(OFFLINE_READINESS_COORDINATOR_STORAGE_KEY, initial);
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => values.set(key, value),
    flush: async () => undefined,
    waitForHydration: async () => undefined,
    raw: () => values.get(OFFLINE_READINESS_COORDINATOR_STORAGE_KEY) ?? null,
  };
}

function deferredStorage(initial = null) {
  const values = new Map();
  if (initial) values.set(OFFLINE_READINESS_COORDINATOR_STORAGE_KEY, initial);
  let hydrated = false;
  let setCalls = 0;
  let releaseHydration;
  const hydration = new Promise((resolve) => {
    releaseHydration = resolve;
  });
  return {
    get: (key) => hydrated ? values.get(key) ?? null : null,
    set: (key, value) => {
      setCalls += 1;
      values.set(key, value);
    },
    flush: async () => undefined,
    waitForHydration: () => hydration,
    resolveHydration: () => {
      hydrated = true;
      releaseHydration();
    },
    setCalls: () => setCalls,
    raw: () => values.get(OFFLINE_READINESS_COORDINATOR_STORAGE_KEY) ?? null,
  };
}

async function main() {
  const ready = buildReadyManifest();
  assert.strictEqual(ready.schemaVersion, 1);
  assert.strictEqual(ready.assets.length, 8, 'Canonical manifest should expose every required asset class.');
  assert.ok(ready.assets.every((asset) => asset.integrity.mechanism), 'Every asset should declare an integrity mechanism.');
  assert.strictEqual(getOfflineReadinessAsset(ready, 'emergency_recovery_packet').source.cacheState, 'manual');

  const readyAudit = auditOfflineReadinessManifest(ready, '2026-07-13T13:00:00.000Z');
  assert.strictEqual(readyAudit.status, 'ready');
  assert.strictEqual(readyAudit.blockers.length, 0);

  const expiredWeatherAudit = auditOfflineReadinessManifest(ready, '2026-07-13T19:00:00.000Z');
  assert.strictEqual(expiredWeatherAudit.status, 'caution', 'Expired optional weather should remain usable as last-known data with a warning.');
  assert.ok(expiredWeatherAudit.warnings.some((issue) => issue.code === 'asset_expired'));
  assert.ok(!expiredWeatherAudit.blockers.some((issue) => issue.kind === 'weather_snapshot'));

  const corrupt = clone(ready);
  const corruptRoute = getOfflineReadinessAsset(corrupt, 'route_geometry');
  corruptRoute.integrity.actualChecksum = 'corrupt-value';
  const corruptAudit = auditOfflineReadinessManifest(corrupt, '2026-07-13T13:00:00.000Z');
  assert.strictEqual(corruptAudit.status, 'blocked');
  assert.ok(corruptAudit.blockers.some((issue) => issue.code === 'asset_corrupt'));

  const partialMap = clone(ready);
  const partialMapAsset = getOfflineReadinessAsset(partialMap, 'map_region');
  partialMapAsset.status = 'partial';
  partialMapAsset.coverage = 'partial';
  const partialAudit = auditOfflineReadinessManifest(partialMap, '2026-07-13T13:00:00.000Z');
  assert.ok(partialAudit.blockers.some((issue) => issue.code === 'partial_coverage'));

  const missingRoute = buildOfflineReadinessManifest({
    packageId: 'missing-route-package',
    routeId: 'missing-route',
    generatedAt,
    items: [readyItem('offline_map', true, { cacheKey: 'orphan-region' })],
  });
  assert.ok(auditOfflineReadinessManifest(missingRoute, generatedAt).blockers.some((issue) => (
    issue.kind === 'route_geometry' && issue.code === 'required_asset_missing'
  )));

  const lowStorage = clone(ready);
  lowStorage.storage.lowSpace = true;
  lowStorage.storage.shortfallBytes = 4096;
  assert.ok(auditOfflineReadinessManifest(lowStorage, generatedAt).blockers.some((issue) => issue.code === 'low_storage'));

  const redacted = JSON.stringify(redactOfflineReadinessManifestForSupport(ready));
  assert.ok(!redacted.includes(routeId), 'Support evidence must redact exact route identity.');
  assert.ok(!redacted.includes('tile-region-42'), 'Support evidence must omit exact storage references.');
  assert.ok(!redacted.includes('expectedChecksum'), 'Support evidence must omit raw checksum values.');

  const eviction = planOfflineStorageEviction({
    manifests: [ready],
    requestedBytes: 1024,
    activeExpeditionId: 'expedition-42',
    activeRouteId: routeId,
  });
  assert.strictEqual(eviction.selected.length, 0);
  assert.ok(eviction.protected.some((candidate) => candidate.regionId === 'tile-region-42'));

  const legacy = {
    schemaVersion: 2,
    id: packageId,
    routeId,
    routeAssetId: 'route-asset-42',
    tripPlanId: 'trip-plan-42',
    generatedAt,
    items: [readyItem('route_line', true), readyItem('offline_map', true, { cacheKey: 'legacy-region' })],
    lifecycle: { identity: { expeditionId: 'expedition-42' } },
  };
  const migrated = migrateOfflineReadinessManifest(legacy);
  assert.ok(migrated, 'Legacy Offline Prep manifests should migrate without destructive rewrites.');
  assert.strictEqual(migrated.migratedFromSchemaVersion, 2);

  const storage = memoryStorage();
  const coordinator = createOfflineReadinessCoordinator({
    storage,
    now: () => '2026-07-13T13:00:00.000Z',
  });
  await coordinator.waitForHydration();
  coordinator.beginPreparation(ready, { availableBytes: 100 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 });
  coordinator.attachMapRegions(ready.manifestId, [{
    id: 'tile-region-42',
    status: 'downloading',
    tileCount: 20,
    downloadedTiles: 8,
    estimatedSizeMB: 12,
    actualSizeMB: 4,
    bounds: { minLat: 35, maxLat: 36, minLng: -120, maxLng: -119 },
    zoomMin: 9,
    zoomMax: 15,
    styleKey: 'tactical',
  }]);
  await coordinator.flush();

  const restored = createOfflineReadinessCoordinator({
    storage: memoryStorage(storage.raw()),
    now: () => '2026-07-13T13:05:00.000Z',
  });
  await restored.waitForHydration();
  const interrupted = restored.getManifest(ready.manifestId);
  assert.strictEqual(interrupted.preparation.status, 'paused');
  assert.strictEqual(getOfflineReadinessAsset(interrupted, 'map_region').status, 'queued');

  restored.beginPreparation(interrupted, { availableBytes: 100 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 });
  restored.reconcileTileState([{ regionId: 'tile-region-42', status: 'complete' }], [{
    id: 'tile-region-42',
    status: 'complete',
    tileCount: 20,
    downloadedTiles: 20,
    estimatedSizeMB: 12,
    actualSizeMB: 11,
    bounds: { minLat: 35, maxLat: 36, minLng: -120, maxLng: -119 },
    zoomMin: 9,
    zoomMax: 15,
    styleKey: 'tactical',
  }]);
  const completed = restored.getManifest(ready.manifestId);
  assert.strictEqual(getOfflineReadinessAsset(completed, 'map_region').integrity.status, 'verified');
  assert.strictEqual(getOfflineReadinessAsset(completed, 'map_region').coverage, 'complete');
  assert.ok(restored.getRegionProtectionReason('tile-region-42', { activeExpeditionId: 'expedition-42' }));

  const cachedOnly = clone(ready);
  const cachedRaw = JSON.stringify({
    schemaVersion: 1,
    manifests: [cachedOnly],
    updatedAt: cachedOnly.updatedAt,
  });
  const delayedStorage = deferredStorage(cachedRaw);
  const delayedCoordinator = createOfflineReadinessCoordinator({
    storage: delayedStorage,
    now: () => '2026-07-13T13:10:00.000Z',
  });
  assert.deepStrictEqual(delayedCoordinator.getHydrationState(), {
    status: 'restoring',
    source: 'restoring',
    startedAt: '2026-07-13T13:10:00.000Z',
    completedAt: null,
    safeErrorCode: null,
  });
  assert.deepStrictEqual(
    delayedCoordinator.listManifests(),
    [],
    'Cold startup must remain explicitly restoring instead of reporting a valid empty manifest list.',
  );

  let hydrationNotifications = 0;
  delayedCoordinator.subscribe(() => {
    hydrationNotifications += 1;
  });
  assert.strictEqual(delayedCoordinator.getDiagnostics().subscriberCount, 1);
  const localBeforeHydration = buildOfflineReadinessManifest({
    packageId: 'local-package-before-hydration',
    routeId: 'local-route-before-hydration',
    generatedAt: '2026-07-13T13:09:00.000Z',
    items: [
      readyItem('route_line', true),
      readyItem('offline_map', true, { cacheKey: 'local-tile-region' }),
    ],
  });
  delayedCoordinator.upsertManifest(localBeforeHydration);
  assert.strictEqual(
    delayedStorage.setCalls(),
    0,
    'Aggregate manifest state must not overwrite disk before hydration can merge cached and live mutations.',
  );
  assert.ok(delayedCoordinator.getManifest(localBeforeHydration.manifestId));

  const firstHydrationWait = delayedCoordinator.waitForHydration();
  assert.strictEqual(
    firstHydrationWait,
    delayedCoordinator.waitForHydration(),
    'Concurrent readiness consumers must join one hydration flight.',
  );
  delayedStorage.resolveHydration();
  await firstHydrationWait;

  assert.strictEqual(delayedCoordinator.getHydrationState().status, 'ready');
  assert.strictEqual(delayedCoordinator.getHydrationState().source, 'cached_and_live');
  assert.ok(delayedCoordinator.getManifest(cachedOnly.manifestId), 'Cached disk manifest must survive hydration.');
  assert.ok(
    delayedCoordinator.getManifest(localBeforeHydration.manifestId),
    'A manifest added before hydration must survive and merge over restored disk state.',
  );
  assert.ok(hydrationNotifications >= 2, 'Pre-hydration mutation and late hydration must both notify consumers.');
  assert.deepStrictEqual(
    {
      status: delayedCoordinator.getDiagnostics().hydration.status,
      manifestCount: delayedCoordinator.getDiagnostics().manifestCount,
      pendingPersistence: delayedCoordinator.getDiagnostics().pendingPersistence,
    },
    { status: 'ready', manifestCount: 2, pendingPersistence: false },
  );

  const lateConsumerSnapshot = {
    hydration: delayedCoordinator.getHydrationState(),
    manifests: delayedCoordinator.listManifests(),
  };
  assert.strictEqual(lateConsumerSnapshot.hydration.status, 'ready');
  assert.strictEqual(lateConsumerSnapshot.manifests.length, 2);

  const emptyDelayedStorage = deferredStorage();
  const emptyDelayedCoordinator = createOfflineReadinessCoordinator({
    storage: emptyDelayedStorage,
    now: () => '2026-07-13T13:15:00.000Z',
  });
  assert.strictEqual(emptyDelayedCoordinator.getHydrationState().status, 'restoring');
  emptyDelayedStorage.resolveHydration();
  await emptyDelayedCoordinator.waitForHydration();
  assert.strictEqual(emptyDelayedCoordinator.getHydrationState().status, 'ready');
  assert.strictEqual(emptyDelayedCoordinator.getHydrationState().source, 'empty');
  assert.deepStrictEqual(emptyDelayedCoordinator.listManifests(), []);

  console.log('Offline readiness manifest tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
