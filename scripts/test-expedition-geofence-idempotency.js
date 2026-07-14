const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const memoryStorage = new Map();

global.localStorage = {
  getItem(key) { return memoryStorage.has(key) ? memoryStorage.get(key) : null; },
  setItem(key, value) { memoryStorage.set(key, String(value)); },
  removeItem(key) { memoryStorage.delete(key); },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'web' },
      AppState: { currentState: 'active', addEventListener() { return { remove() {} }; } },
    };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTypeScript(module, filename) {
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

const storePath = path.join(root, 'lib/expeditionStateStore.ts');
let { expeditionStateStore } = require(storePath);

expeditionStateStore.reset();
expeditionStateStore.clearTimeline();
expeditionStateStore.clearGeofenceTransitionProposalsForTests();

const startProposal = expeditionStateStore.proposeGeofenceTransition({
  direction: 'start',
  vehicleId: 'vehicle-1',
});
assert.strictEqual(startProposal.idempotent, false);
assert.strictEqual(startProposal.proposal.status, 'pending');
const started = expeditionStateStore.beginExpedition({
  idempotencyKey: startProposal.proposal.idempotencyKey,
  activeVehicleId: 'vehicle-1',
  vehicleName: 'Geofence vehicle',
  latitude: 39.1,
  longitude: -120.1,
  transitionCause: 'geofence',
});
assert.strictEqual(started.state, 'active');
assert.strictEqual(started.canonicalLifecycle.state, 'active');
expeditionStateStore.resolveGeofenceTransitionProposal(startProposal.proposal.id, 'accepted');

const duplicateStart = expeditionStateStore.proposeGeofenceTransition({
  direction: 'start',
  vehicleId: 'vehicle-1',
});
assert.strictEqual(duplicateStart.idempotent, true);
assert.strictEqual(duplicateStart.proposal.id, startProposal.proposal.id);
assert.strictEqual(duplicateStart.proposal.status, 'accepted');

const endProposal = expeditionStateStore.proposeGeofenceTransition({
  direction: 'end',
  vehicleId: 'vehicle-1',
  expeditionId: started.id,
});
const completed = expeditionStateStore.endExpedition({
  transitionCause: 'geofence',
  idempotencyKey: endProposal.proposal.idempotencyKey,
});
assert.strictEqual(completed.state, 'complete');
assert.strictEqual(completed.canonicalLifecycle.state, 'completed');
expeditionStateStore.resolveGeofenceTransitionProposal(endProposal.proposal.id, 'accepted');

const duplicateEnd = expeditionStateStore.proposeGeofenceTransition({
  direction: 'end',
  vehicleId: 'vehicle-1',
  expeditionId: started.id,
});
assert.strictEqual(duplicateEnd.idempotent, true);
assert.strictEqual(duplicateEnd.proposal.status, 'accepted');

expeditionStateStore.reset();
const nextCycleStart = expeditionStateStore.proposeGeofenceTransition({
  direction: 'start',
  vehicleId: 'vehicle-1',
});
assert.notStrictEqual(
  nextCycleStart.proposal.idempotencyKey,
  startProposal.proposal.idempotencyKey,
  'An accepted end proposal should open a new departure cycle.',
);

delete require.cache[require.resolve(storePath)];
({ expeditionStateStore } = require(storePath));
const restoredProposal = expeditionStateStore.proposeGeofenceTransition({
  direction: 'start',
  vehicleId: 'vehicle-1',
});
assert.strictEqual(restoredProposal.idempotent, true, 'Proposal identity should survive a module restart.');
assert.strictEqual(restoredProposal.proposal.id, nextCycleStart.proposal.id);
assert(expeditionStateStore.getGeofenceTransitionProposals().length <= 24);

console.log('Expedition geofence idempotency checks passed.');
