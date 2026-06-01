const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'test' } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;

const {
  deriveIncidentCommunicationStatusFromContext,
  getIncidentRecoveryContextDefaultResources,
  getIncidentRecoveryContextSnapshot,
  getIncidentRecoveryContextVersion,
  subscribeIncidentRecoveryContext,
} = loadTypeScriptModule('lib/incidentRecoveryContextAdapter.ts');

const snapshot = getIncidentRecoveryContextSnapshot({
  gpsLocation: {
    latitude: 39.12345,
    longitude: -120.98765,
    source: 'gps',
    capturedAt: '2026-04-28T18:00:00.000Z',
  },
});

assert(snapshot.updatedAt, 'Context snapshot must include an update timestamp.');
assert(snapshot.route, 'Context snapshot must include route extension point.');
assert(snapshot.convoy, 'Context snapshot must include convoy extension point.');
assert(snapshot.vehicle, 'Context snapshot must include vehicle extension point.');
assert(snapshot.logistics, 'Context snapshot must include logistics extension point.');
assert(snapshot.connectivity, 'Context snapshot must include connectivity extension point.');
assert.deepStrictEqual(snapshot.route.currentLocation.latitude, 39.12345);
assert.strictEqual(snapshot.debrief.communityHazardReportRequiresUserAction, true);

assert.strictEqual(
  deriveIncidentCommunicationStatusFromContext({
    connectivity: { status: 'offline', level: 'no_service', online: false },
    updatedAt: '2026-04-28T18:00:00.000Z',
  }),
  'offline',
);
assert.strictEqual(
  deriveIncidentCommunicationStatusFromContext({
    connectivity: { status: 'reconnecting', level: 'limited', online: true },
    updatedAt: '2026-04-28T18:00:00.000Z',
  }),
  'degraded',
);
assert.strictEqual(
  deriveIncidentCommunicationStatusFromContext({
    connectivity: { status: 'online', level: 'normal', online: true },
    updatedAt: '2026-04-28T18:00:00.000Z',
  }),
  'available',
);

const defaults = getIncidentRecoveryContextDefaultResources({
  logistics: {
    fuelPercent: 12,
    waterGallons: 0.5,
    foodStatus: 'not indexed',
    shelterStatus: 'available',
    warmthStatus: 'not indexed',
    medicalKitAvailable: true,
  },
  updatedAt: '2026-04-28T18:00:00.000Z',
});

assert.strictEqual(defaults.fuelConcern, true);
assert.strictEqual(defaults.waterConcern, true);
assert.strictEqual(defaults.foodConcern, true);
assert.strictEqual(defaults.shelterConcern, false);
assert.strictEqual(defaults.warmthConcern, true);
assert.strictEqual(defaults.medicalKitAvailable, true);

const beforeVersion = getIncidentRecoveryContextVersion();
const unsubscribe = subscribeIncidentRecoveryContext(() => {});
assert.strictEqual(typeof unsubscribe, 'function');
unsubscribe();
assert.strictEqual(getIncidentRecoveryContextVersion() >= beforeVersion, true);

console.log('Incident Recovery context adapter checks passed.');
