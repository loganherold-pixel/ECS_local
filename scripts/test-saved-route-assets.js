const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const storage = new Map();

global.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const { runStore } = require(path.join(root, 'lib', 'runStore.ts'));
const { routeStore } = require(path.join(root, 'lib', 'routeStore.ts'));
const {
  calculateSavedRouteAssetCounts,
  getSavedRouteAssets,
} = require(path.join(root, 'lib', 'savedRouteAssets.ts'));

storage.clear();

runStore.createFromParsedImport(
  {
    name: 'Imported GPX Run',
    routePoints: [
      { lat: 39, lng: -120, ele_m: null, time: null },
      { lat: 39.1, lng: -119.9, ele_m: null, time: null },
    ],
    trackPoints: [],
    primaryCoords: [],
    waypoints: [],
  },
  undefined,
  'gpx',
  'Imported GPX Run',
);

routeStore.createCustomRoute(
  [{
    coordinates: [
      [-120.2, 39.2],
      [-120.1, 39.3],
    ],
  }],
  { name: 'Custom Saved Route' },
);

runStore.createFromParsedImport(
  {
    name: 'Stitched Chain',
    routePoints: [
      { lat: 38.8, lng: -120.4, ele_m: null, time: null },
      { lat: 38.9, lng: -120.3, ele_m: null, time: null },
    ],
    trackPoints: [],
    primaryCoords: [],
    waypoints: [],
  },
  undefined,
  'stitch',
  'Stitched Chain',
);

const assets = getSavedRouteAssets();
const counts = calculateSavedRouteAssetCounts(assets);

assert.strictEqual(counts.all, 3, 'Saved route assets should include imported runs, custom routes, and stitched runs.');
assert.strictEqual(counts.imported, 1, 'Direct GPX/KML/GeoJSON imported runs should count as imported routes.');
assert.strictEqual(counts.custom, 1, 'Custom route-store assets should count as custom routes.');
assert.strictEqual(counts.stitched, 1, 'Stitched run-store assets should count as stitched routes.');
assert.strictEqual(counts.bookmarked, 0, 'No bookmarked Explore routes were created in this fixture.');

const importedRunAsset = assets.find((asset) => asset.title === 'Imported GPX Run');
assert(importedRunAsset, 'Imported GPX run should appear in saved route assets.');
assert.strictEqual(importedRunAsset.kind, 'imported', 'Imported GPX run asset should be classified as imported.');

console.log('Saved route asset count checks passed.');
