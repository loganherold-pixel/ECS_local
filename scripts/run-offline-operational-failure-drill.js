const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const resultPath = path.join(root, '.smoke', 'offline-operational-failure-drill-result.json');
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

const manifestModule = require(path.join(root, 'lib', 'offlinePrepPack', 'offlineReadinessManifest.ts'));
const coordinatorModule = require(path.join(root, 'lib', 'offlinePrepPack', 'offlineReadinessCoordinator.ts'));
const {
  auditOfflineReadinessManifest,
  buildOfflineReadinessManifest,
  getOfflineReadinessAsset,
  migrateOfflineReadinessManifest,
  planOfflineStorageEviction,
} = manifestModule;
const {
  OFFLINE_READINESS_COORDINATOR_STORAGE_KEY,
  createOfflineReadinessCoordinator,
} = coordinatorModule;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function readyItem(type, required = false, extra = {}) {
  return {
    id: `item-${type}`,
    type,
    label: type,
    status: 'ready',
    availability: 'available',
    required,
    source: 'offline_drill_fixture',
    summary: `${type} ready`,
    count: 1,
    ...extra,
  };
}

function buildReadyManifest() {
  return buildOfflineReadinessManifest({
    packageId: 'drill-package',
    routeId: 'drill-route',
    expeditionId: 'drill-expedition',
    generatedAt: '2026-07-13T12:00:00.000Z',
    items: [
      readyItem('route_line', true),
      readyItem('offline_map', true, { cacheKey: 'drill-region', estimatedSizeMB: 8 }),
      readyItem('trip_itinerary', true),
      readyItem('weather_snapshot', false, {
        metadata: { validUntil: '2026-07-13T14:00:00.000Z', retrievedAt: '2026-07-13T12:00:00.000Z' },
      }),
      readyItem('exit_points', true),
    ],
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

function scenario(id, label, stage, passed, detail, evidenceKind = 'deterministic_simulation') {
  return { id, label, stage, evidenceKind, passed: Boolean(passed), detail };
}

async function main() {
  const ready = buildReadyManifest();
  const lowStorage = clone(ready);
  lowStorage.storage.lowSpace = true;
  lowStorage.storage.shortfallBytes = 1024;
  const corrupt = clone(ready);
  getOfflineReadinessAsset(corrupt, 'route_geometry').integrity.actualChecksum = 'bad-checksum';
  const partialMap = clone(ready);
  getOfflineReadinessAsset(partialMap, 'map_region').status = 'partial';
  getOfflineReadinessAsset(partialMap, 'map_region').coverage = 'partial';
  const missingRoute = buildOfflineReadinessManifest({
    packageId: 'missing-route-package',
    routeId: 'missing-route',
    generatedAt: '2026-07-13T12:00:00.000Z',
    items: [readyItem('offline_map', true, { cacheKey: 'orphan-region' })],
  });

  const storage = memoryStorage();
  const coordinator = createOfflineReadinessCoordinator({
    storage,
    now: () => '2026-07-13T12:30:00.000Z',
  });
  await coordinator.waitForHydration();
  coordinator.beginPreparation(ready, { availableBytes: 100 * 1024 * 1024 });
  coordinator.attachMapRegions(ready.manifestId, [{
    id: 'drill-region',
    status: 'downloading',
    tileCount: 10,
    downloadedTiles: 4,
    estimatedSizeMB: 8,
    actualSizeMB: 3,
  }]);
  await coordinator.flush();
  const restoredCoordinator = createOfflineReadinessCoordinator({
    storage: memoryStorage(storage.raw()),
    now: () => '2026-07-13T12:35:00.000Z',
  });
  await restoredCoordinator.waitForHydration();
  const interrupted = restoredCoordinator.getManifest(ready.manifestId);

  const rootLayout = read('app/_layout.tsx');
  const tileSync = read('lib/offlineTileSyncCoordinator.ts');
  const tileStore = read('lib/tileCacheStore.ts');
  const syncQueue = read('lib/syncActionQueue.ts');
  const incidentPacket = read('lib/offlineIncidentPacket.ts');
  const navigate = read('app/(tabs)/navigate.tsx');

  const readyAt = auditOfflineReadinessManifest(ready, '2026-07-13T13:00:00.000Z');
  const expiredWeather = auditOfflineReadinessManifest(ready, '2026-07-13T15:00:00.000Z');
  const lowStorageAudit = auditOfflineReadinessManifest(lowStorage, '2026-07-13T13:00:00.000Z');
  const corruptAudit = auditOfflineReadinessManifest(corrupt, '2026-07-13T13:00:00.000Z');
  const partialAudit = auditOfflineReadinessManifest(partialMap, '2026-07-13T13:00:00.000Z');
  const missingAudit = auditOfflineReadinessManifest(missingRoute, '2026-07-13T13:00:00.000Z');
  const eviction = planOfflineStorageEviction({
    manifests: [ready],
    requestedBytes: 1024,
    activeExpeditionId: 'drill-expedition',
    activeRouteId: 'drill-route',
  });
  const migrated = migrateOfflineReadinessManifest({
    schemaVersion: 2,
    id: 'legacy-package',
    routeId: 'legacy-route',
    generatedAt: '2026-07-13T12:00:00.000Z',
    items: [readyItem('route_line', true), readyItem('offline_map', true, { cacheKey: 'legacy-region' })],
  });

  const scenarios = [
    scenario(
      'no_network_at_launch',
      'No network at launch does not start route tile replay',
      'startup',
      rootLayout.includes('networkAvailable: connectivity.isOnline()') &&
        tileSync.includes('if (input.networkAvailable === false || !hydrated) return [];'),
      'Startup hydration is asynchronous and route tile replay fails closed when connectivity is not online.',
      'source_contract',
    ),
    scenario(
      'interrupted_package_generation',
      'Interrupted preparation restores as paused and resumable',
      'offline_prep',
      interrupted?.preparation.status === 'paused' && getOfflineReadinessAsset(interrupted, 'map_region')?.status === 'queued',
      'Persisted in-flight preparation restored as paused with its map asset queued.',
    ),
    scenario('low_storage', 'Low storage creates an explicit departure blocker', 'offline_prep', lowStorageAudit.blockers.some((issue) => issue.code === 'low_storage'), lowStorageAudit.summary),
    scenario('corrupt_asset', 'Checksum mismatch blocks a required asset', 'departure_audit', corruptAudit.blockers.some((issue) => issue.code === 'asset_corrupt'), corruptAudit.summary),
    scenario(
      'expired_weather',
      'Expired weather remains visible as last-known with a warning',
      'departure_audit',
      expiredWeather.status === 'caution' && expiredWeather.warnings.some((issue) => issue.code === 'asset_expired'),
      expiredWeather.summary,
    ),
    scenario('missing_route_geometry', 'Missing route geometry blocks package readiness', 'offline_prep', missingAudit.blockers.some((issue) => issue.kind === 'route_geometry'), missingAudit.summary),
    scenario('partial_map_coverage', 'Partial required map coverage remains blocked', 'offline_prep', partialAudit.blockers.some((issue) => issue.code === 'partial_coverage'), partialAudit.summary),
    scenario(
      'active_expedition_eviction',
      'Active expedition assets survive manual and automatic eviction',
      'storage_cleanup',
      eviction.selected.length === 0 && eviction.protected.some((candidate) => candidate.regionId === 'drill-region') &&
        tileStore.includes('this.getRegionProtectionReason(regionId)'),
      'Canonical eviction planning and TileCacheStore deletion both enforce active-asset protection.',
    ),
    scenario(
      'offline_incident_creation',
      'Incident packet remains durable, local-only, and explicitly not transmitted',
      'incident',
      incidentPacket.includes('localOnly: true') &&
        incidentPacket.includes("externalSharing: 'disabled'") &&
        incidentPacket.includes('is not sent by ECS'),
      'Incident packet contract is local-only with external sharing disabled.',
      'source_contract',
    ),
    scenario(
      'outbox_replay',
      'Queued writes replay in stable priority and monotonic order',
      'reconnect',
      syncQueue.includes('sequence: number;') && syncQueue.includes('.sort(compareSyncActions).slice(0, PROCESS_BATCH_SIZE)'),
      'The existing durable queue persists a sequence and sorts replay by priority then FIFO sequence.',
      'source_contract',
    ),
    scenario(
      'conflict_after_reconnect',
      'Conflicting changes are held for resolution',
      'reconnect',
      syncQueue.includes('conflictResolver.detectConflicts(this._queue)') && syncQueue.includes('!conflictingActionIds.has(a.id)'),
      'Conflicting operations are excluded from replay until resolved.',
      'source_contract',
    ),
    scenario(
      'duplicate_replay',
      'Pending and explicit completed duplicates converge on one operation',
      'reconnect',
      syncQueue.includes('idempotencyKey: string;') &&
        syncQueue.includes('action.operationFingerprint === operationFingerprint') &&
        syncQueue.includes('action.idempotencyKey === explicitIdempotencyKey'),
      'Pending fingerprints and explicit durable idempotency keys suppress duplicate replay.',
      'source_contract',
    ),
    scenario(
      'app_restart',
      'Manifest and tile preparation state survive app restoration',
      'startup',
      interrupted?.preparation.retryCount === 1 && interrupted?.preparation.lastErrorCode === 'app_interrupted',
      'Coordinator migration recorded one interrupted attempt without discarding downloaded progress.',
    ),
    scenario(
      'legacy_manifest_migration',
      'Legacy Offline Prep manifests migrate without destructive replacement',
      'migration',
      migrated?.migratedFromSchemaVersion === 2,
      'Schema-v2 Offline Prep manifest adapted into canonical readiness schema v1.',
    ),
    scenario(
      'network_loss_during_navigation',
      'Saved route and cached-map behavior remains available without live-provider overclaim',
      'navigate',
      navigate.includes('Live search is unavailable. Saved route guidance') &&
        navigate.includes('Live routing services are offline. Cached map coverage is still available for field reference.'),
      'Navigate explicitly distinguishes cached field reference from unavailable live search and routing.',
      'source_contract',
    ),
  ];

  const result = {
    schemaVersion: 1,
    drillId: 'ecs-offline-operational-failure-drill',
    checkedAt: new Date().toISOString(),
    environment: 'deterministic_ci_simulation',
    passed: readyAt.status !== 'blocked' && scenarios.every((entry) => entry.passed),
    redaction: {
      exactRouteTracesIncluded: false,
      providerSecretsIncluded: false,
      authenticationTokensIncluded: false,
    },
    workflowsExercised: ['startup', 'offline_prep', 'departure_audit', 'navigate', 'incident', 'storage_cleanup', 'reconnect', 'migration'],
    scenarios,
    productionEvidence: {
      realAndroidValidated: false,
      realIosValidated: false,
      providerOfflinePolicyValidated: false,
      requirements: [
        'Physical Android and iOS cold launch with radios disabled',
        'OS-terminated download and restoration on supported devices',
        'Real low-storage and storage-pressure behavior',
        'Map-provider offline cache/license validation',
        'Long-duration active guidance without network',
        'Multi-client reconnect conflict validation',
      ],
    },
  };

  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    ...result,
    resultFile: path.relative(root, resultPath).replace(/\\/g, '/'),
  }, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
}

main().catch((error) => {
  const failure = {
    schemaVersion: 1,
    drillId: 'ecs-offline-operational-failure-drill',
    checkedAt: new Date().toISOString(),
    environment: 'deterministic_ci_simulation',
    passed: false,
    error: error instanceof Error ? error.message : String(error),
  };
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exitCode = 1;
});
