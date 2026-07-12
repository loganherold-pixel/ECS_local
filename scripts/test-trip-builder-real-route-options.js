const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
global.__DEV__ = false;

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  return originalLoad(request, parent, isMain);
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

const {
  isRealTripBuilderRouteOption,
  mergeRealTripBuilderRouteOptions,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderRouteOptions.ts'));

function route(id, source, overrides = {}) {
  return {
    id,
    name: id,
    region: 'Test range',
    distanceMiles: 18,
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-109.6, 38.5],
        [-109.5, 38.6],
        [-109.4, 38.7],
      ],
    },
    routeMetadata: {
      source,
      isTrailGeometry: true,
    },
    ...overrides,
  };
}

const medanoSeed = {
  id: 'medano-pass',
  name: 'Medano Pass',
  region: 'Great Sand Dunes, Colorado',
  distanceMiles: 22,
  startLat: 37.75,
  startLng: -105.51,
};
const ouachitaSeed = {
  id: 'ouachita-backcountry',
  name: 'Ouachita Backcountry Byway',
  region: 'Ouachita Mountains, Arkansas',
  distanceMiles: 72,
  startLat: 34.67,
  startLng: -93.99,
};
const demoRoute = route('demo-route', 'demo_fixture', {
  routeMetadata: {
    source: 'demo_fixture',
    dataState: 'fixture',
    isDemoGeometry: true,
  },
});
const importedRoute = route('imported-route', 'trip_builder_import');
const savedRoute = route('saved-route', 'saved_built');
const liveRoute = route('live-route', 'trail_pack', {
  routeMetadata: {
    source: 'trail_pack',
    trailPackDataState: 'live',
    reviewStatus: 'approved',
    catalogVerification: { publicRecommendation: true, status: 'normal' },
  },
});

assert.strictEqual(isRealTripBuilderRouteOption(medanoSeed), false, 'Medano seed data must not appear in Trip Builder.');
assert.strictEqual(isRealTripBuilderRouteOption(ouachitaSeed), false, 'Ouachita seed data must not appear in Trip Builder.');
assert.strictEqual(isRealTripBuilderRouteOption(demoRoute), false, 'Demo geometry must not appear in Trip Builder.');
assert.strictEqual(isRealTripBuilderRouteOption(importedRoute), true, 'Operator-imported geometry should remain selectable.');
assert.strictEqual(isRealTripBuilderRouteOption(savedRoute), true, 'Saved local geometry should remain selectable.');
assert.strictEqual(isRealTripBuilderRouteOption(liveRoute), true, 'Approved source-backed geometry should remain selectable.');

assert.deepStrictEqual(
  mergeRealTripBuilderRouteOptions([
    [medanoSeed, importedRoute],
    [ouachitaSeed, savedRoute, liveRoute],
    [importedRoute],
  ]).map((item) => item.id),
  ['imported-route', 'saved-route', 'live-route'],
  'Trip Builder route merging should preserve real-source priority, deduplicate, and omit fixtures.',
);

const screen = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');
assert.ok(
  screen.includes('mergeRealTripBuilderRouteOptions([') &&
    screen.includes('routeStore.getAll()') &&
    screen.includes('runStore.getAll()') &&
    screen.includes('liveTrailPackCatalogStore.getSnapshot().trailPacks') &&
    !screen.includes('loadOpportunitiesWithCompatibility(null)'),
  'Trip Builder should populate from handoff, local assets, saved runs, and live catalog state without discoverEngine fixtures.',
);

console.log('Trip Builder real route option checks passed.');
