const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
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

const { buildRouteBailoutCandidates } = require(path.join(root, 'lib', 'bailoutIntelligence.ts'));
const { buildRecoveryReadinessInput } = require(path.join(root, 'lib', 'readiness', 'recoveryReadinessAdapter.ts'));

const route = {
  id: 'test-route',
  name: 'Field Test Trail',
  waypoints: [
    { lat: 38.75, lon: -121.22, name: 'Last Fuel Before Dirt', time: null, ele: null, waypointType: 'fuel' },
    { lat: 38.77, lon: -121.2, name: 'Water Refill', time: null, ele: null, waypointType: 'water' },
    { lat: 38.81, lon: -121.18, name: 'Paved Junction', time: null, ele: null, waypointType: 'junction' },
  ],
  segments: [
    {
      points: [
        { lat: 38.74, lon: -121.23, ele: null },
        { lat: 38.77, lon: -121.2, ele: null },
        { lat: 38.82, lon: -121.17, ele: null },
      ],
    },
  ],
};

const candidates = buildRouteBailoutCandidates({
  routeId: route.id,
  routeName: route.name,
  importedRoute: route,
  sessionRoutePoints: [],
  manualBailouts: [],
});

assert(candidates.some((point) => point.id.includes('route-start-staging')), 'Route start should become a staging bailout reference.');
assert(candidates.some((point) => point.id.includes('route-finish-exit')), 'Route finish should become an exit bailout reference.');
assert(candidates.some((point) => point.type === 'fuel' && point.title === 'Last Fuel Before Dirt'), 'Fuel waypoints should enter bailout intelligence.');
assert(candidates.some((point) => point.type === 'water' && point.title === 'Water Refill'), 'Water waypoints should enter bailout intelligence.');
assert(candidates.some((point) => point.type === 'alternate_route' && point.title === 'Paved Junction'), 'Junction waypoints should become alternate-route bailout references.');

const recovery = buildRecoveryReadinessInput({
  route: {
    routeId: route.id,
    name: route.name,
    distanceMiles: 28,
    difficulty: 'moderate',
    riskLevel: 'moderate',
    source: 'cached',
    updatedAt: '2026-05-22T12:00:00.000Z',
  },
  currentLocation: {
    latitude: 38.76,
    longitude: -121.21,
    accuracyMeters: 12,
    source: 'live',
    updatedAt: '2026-05-22T12:00:00.000Z',
  },
  communications: { signalConfidence: 'medium' },
  routeBailouts: candidates,
  allBailouts: candidates,
  capturedAt: '2026-05-22T12:05:00.000Z',
});

assert.strictEqual(recovery.bailoutRoutesAvailable, true);
assert.strictEqual(recovery.routeBailoutOptionCount, candidates.length);
assert(recovery.nearestExitMiles != null, 'Recovery input should include nearest exit distance.');
assert(recovery.nearestFuelMiles != null, 'Recovery input should include nearest fuel bailout distance.');
assert(recovery.nearestWaterMiles != null, 'Recovery input should include nearest water bailout distance.');
assert(
  recovery.recommendedPrep.some((item) => item.includes('Fuel bailout: Last Fuel Before Dirt')),
  'Recovery prep should surface fuel bailout confidence copy.',
);
assert(
  recovery.recommendedPrep.some((item) => item.includes('Water bailout: Water Refill')),
  'Recovery prep should surface water bailout confidence copy.',
);
assert(
  !recovery.nearestBailoutSummary.includes('No indexed bailout point'),
  'Route-derived candidates should prevent false no-bailout summary.',
);

console.log('Bailout intelligence pipeline checks passed.');
