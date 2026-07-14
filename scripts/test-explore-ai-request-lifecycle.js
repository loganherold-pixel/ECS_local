const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const deferredByRadius = new Map();
let providerRequests = 0;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === './supabase' && parent?.filename.endsWith(path.join('lib', 'aiRouteStore.ts'))) {
    return {
      supabase: {
        functions: {
          invoke(_name, options) {
            providerRequests += 1;
            return deferredByRadius.get(options.body.radiusMiles).promise;
          },
        },
      },
      isDeployedEdgeFunction: () => true,
      isEdgeFunctionUnavailableError: () => false,
    };
  }
  if (request === './ecsLogger' && parent?.filename.endsWith(path.join('lib', 'aiRouteStore.ts'))) {
    return { ecsLog: { debug() {} } };
  }
  return originalLoad.apply(this, [request, parent, isMain]);
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
  aiRouteStore,
  createAIRouteRequestFingerprint,
} = require(path.join(root, 'lib', 'aiRouteStore.ts'));

function params(radiusMiles) {
  return {
    latitude: 39.01,
    longitude: -120.31,
    category: 'all-drivable-trails',
    radiusMiles,
    vehicleType: '4x4 SUV',
    vehicleBuild: '33 inch tires',
    count: 6,
    existingRouteNames: ['Rubicon Trail', 'Fordyce Creek'],
  };
}

function route(id, radiusMiles) {
  return {
    id,
    name: `AI route ${radiusMiles}`,
    region: 'Sierra Nevada',
    regionGroup: 'sierra-nevada',
    startLat: 39.01,
    startLng: -120.31,
    isAIGenerated: true,
  };
}

(async () => {
  aiRouteStore.clearAll();
  aiRouteStore.resetRequestDiagnosticsForTests();
  deferredByRadius.set(50, deferred());
  deferredByRadius.set(100, deferred());

  const request50 = aiRouteStore.fetchRoutes(params(50));
  const duplicate50 = aiRouteStore.fetchRoutes(params(50));
  assert.strictEqual(providerRequests, 1, 'Identical in-flight searches should share one provider request.');

  const request100 = aiRouteStore.fetchRoutes(params(100));
  assert.strictEqual(providerRequests, 2, 'Changed search criteria should supersede the old request.');

  deferredByRadius.get(100).resolve({
    data: { routes: [route('new-radius-route', 100)], category: 'expeditions', radiusMiles: 100, generatedAt: new Date().toISOString() },
    error: null,
  });
  await request100;

  deferredByRadius.get(50).resolve({
    data: { routes: [route('stale-radius-route', 50)], category: 'day-trips', radiusMiles: 50, generatedAt: new Date().toISOString() },
    error: null,
  });
  await Promise.all([request50, duplicate50]);

  assert.deepStrictEqual(
    aiRouteStore.getRoutes('all-drivable-trails').map((item) => item.id),
    ['new-radius-route'],
    'A stale response must not replace the newer search result.',
  );
  assert.strictEqual(aiRouteStore.isCacheValid('all-drivable-trails', params(100)), true);
  assert.strictEqual(aiRouteStore.isCacheValid('all-drivable-trails', params(50)), false);
  assert.notStrictEqual(
    createAIRouteRequestFingerprint(params(50)),
    createAIRouteRequestFingerprint(params(100)),
  );

  await aiRouteStore.fetchRoutes(params(100));
  assert.strictEqual(providerRequests, 2, 'A matching warm cache should avoid another provider request.');
  const diagnostics = aiRouteStore.getRequestDiagnostics();
  assert.deepStrictEqual(diagnostics, {
    providerRequests: 2,
    deduplicatedRequests: 1,
    supersededRequests: 1,
    staleResponsesIgnored: 1,
  });

  console.log(JSON.stringify({
    metric: 'explore_ai_provider_requests',
    identicalRapidRequests: providerRequests - 1,
    changedCriteriaRequests: providerRequests,
    staleResponsesCommitted: 0,
    diagnostics,
  }));
  console.log('Explore AI request lifecycle checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
