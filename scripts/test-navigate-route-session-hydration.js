const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function loadTsModule(relativePath, mocks) {
  const filename = path.join(root, relativePath);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (request) => (
    Object.prototype.hasOwnProperty.call(mocks, request) ? mocks[request] : originalRequire(request)
  );
  loaded._compile(output, filename);
  return loaded.exports;
}

function snapshot(id, updatedAt) {
  return {
    version: 1,
    sessionId: `${id}-session`,
    lifecycle: 'active',
    source: 'road',
    routeId: id,
    routeTitle: id,
    routeSubtitle: null,
    statusLabel: 'Route active',
    instruction: 'Continue',
    routePoints: [
      { lat: 39, lng: -121 },
      { lat: 39.01, lng: -120.99 },
    ],
    progressPoints: [],
    currentLocation: null,
    headingDeg: null,
    remainingDistanceM: 1000,
    remainingDurationS: 600,
    etaIso: null,
    progressPercent: 10,
    nextInstructionDistanceM: 200,
    isRerouting: false,
    isOffRoute: false,
    offRouteDistanceM: null,
    routeStatusKind: 'nominal',
    updatedAt,
  };
}

async function main() {
  let releaseRead;
  let readCount = 0;
  const deferredRead = new Promise((resolve) => { releaseRead = resolve; });
  const writes = [];
  const storage = {
    read: async () => {
      readCount += 1;
      return deferredRead;
    },
    write: async (_key, value) => { writes.push(value); },
    remove: async () => {},
  };
  const storeModule = loadTsModule('lib/navigateRouteSessionStore.ts', {
    './roadNavigationStore': { loadRoadNavigationSession: async () => null },
    './trailNavigationStore': { loadTrailNavigationSession: async () => null },
    './nonSecureStorage': { createMigratingNonSecureStorage: () => storage },
    './routeGeometryLifecycle': {
      logRouteGeometryLifecycle: () => {},
      routeGeometryLineStringToLatLng: () => [],
      validateRouteGeometry: () => ({ valid: false, lineString: null }),
    },
    './expedition/expeditionTripRecordStore': {
      trackExpeditionTripFromGuidanceSnapshot: async () => {},
    },
    './lifecycle/routeTripExpeditionLifecycle': {
      buildGeometryFingerprint: (points) => `points:${points.length}`,
    },
  });
  const store = storeModule.navigateRouteSessionStore;
  assert.strictEqual(store.getHydrationState().status, 'idle');

  const hydration = store.hydrateFromPersistence();
  const joined = store.hydrateFromPersistence();
  assert.strictEqual(hydration, joined, 'Concurrent consumers must join one Navigate restore flight.');
  assert.strictEqual(store.getHydrationState().status, 'loading');

  const live = snapshot('live-route', '2026-07-16T12:05:00.000Z');
  delete live.version;
  store.setSnapshot(live);
  releaseRead(JSON.stringify(snapshot('persisted-route', '2026-07-16T12:00:00.000Z')));

  const resolved = await hydration;
  assert.strictEqual(resolved.routeId, 'live-route', 'A late persisted route must not overwrite newer live state.');
  assert.strictEqual(store.getSnapshot().routeId, 'live-route');
  assert.strictEqual(store.getHydrationState().status, 'ready');
  assert.strictEqual(store.getHydrationState().source, 'live');

  const lateConsumer = await store.hydrateFromPersistence();
  assert.strictEqual(lateConsumer.routeId, 'live-route');
  assert.strictEqual(readCount, 1, 'A late consumer must reuse completed hydration instead of rereading storage.');
  assert.strictEqual(
    store.getDiagnostics().latestProducerEvent.source,
    'live',
    'Safe diagnostics must identify the latest accepted producer without exposing route coordinates.',
  );
  assert.ok(writes.length >= 1, 'The accepted live route should still persist normally.');
}

main()
  .then(() => console.log('Navigate route session hydration checks passed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
