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
  formatSavedRouteAssetCountSummary,
  getSavedRouteAssetInventorySnapshot,
  getSavedRouteAssets,
  subscribeSavedRouteAssetInventory,
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

runStore.createFromParsedImport(
  {
    name: 'Recorded Trail Run',
    routePoints: [
      { lat: 38.6, lng: -120.6, ele_m: null, time: null },
      { lat: 38.7, lng: -120.5, ele_m: null, time: null },
    ],
    trackPoints: [],
    primaryCoords: [],
    waypoints: [],
  },
  undefined,
  'trail',
  'Recorded Trail Run',
);

const assets = getSavedRouteAssets();
const counts = calculateSavedRouteAssetCounts(assets);

assert.strictEqual(counts.all, 4, 'Saved route assets should include imported, custom, stitched, and recorded routes.');
assert.strictEqual(counts.imported, 1, 'Direct GPX/KML/GeoJSON imported runs should count as imported routes.');
assert.strictEqual(counts.custom, 1, 'Custom route-store assets should count as custom routes.');
assert.strictEqual(counts.stitched, 1, 'Stitched run-store assets should count as stitched routes.');
assert.strictEqual(counts.bookmarked, 0, 'No bookmarked Explore routes were created in this fixture.');
assert.strictEqual(counts.recorded, 1, 'Standalone trail/recorded runs should have an explicit recorded count.');
assert.strictEqual(counts.other, 0, 'Known route asset kinds should not fall into the exhaustiveness count.');

const importedRunAsset = assets.find((asset) => asset.title === 'Imported GPX Run');
assert(importedRunAsset, 'Imported GPX run should appear in saved route assets.');
assert.strictEqual(importedRunAsset.kind, 'imported', 'Imported GPX run asset should be classified as imported.');

const recordedRunAsset = assets.find((asset) => asset.title === 'Recorded Trail Run');
assert(recordedRunAsset, 'Recorded trail run should appear in saved route assets.');
assert.strictEqual(recordedRunAsset.kind, 'recorded', 'Trail run asset should be classified as recorded.');

const assetsWithOther = [
  ...assets,
  {
    ...importedRunAsset,
    id: 'other:future-route-kind',
    kind: 'other',
    title: 'Future Route Kind',
  },
];
const exhaustiveCounts = calculateSavedRouteAssetCounts(assetsWithOther);
assert.strictEqual(exhaustiveCounts.all, 5, 'The inventory total should include every visible asset.');
assert.strictEqual(exhaustiveCounts.other, 1, 'Unrecognized/future asset kinds should remain visible in an explicit other count.');
assert.strictEqual(
  exhaustiveCounts.all,
  exhaustiveCounts.imported +
    exhaustiveCounts.custom +
    exhaustiveCounts.stitched +
    exhaustiveCounts.bookmarked +
    exhaustiveCounts.recorded +
    exhaustiveCounts.other,
  'Typed Route Command Center counts should reconcile exactly to the visible inventory total.',
);

assert.strictEqual(
  formatSavedRouteAssetCountSummary(exhaustiveCounts),
  '5 total · 1 imported · 1 custom · 1 stitched · 1 recorded · 1 other',
  'Compact Route Command Center summary should include every nonzero asset category and omit zero-value noise.',
);

const initialInventory = getSavedRouteAssetInventorySnapshot();
assert.strictEqual(
  initialInventory.counts.all,
  assets.length,
  'The reactive Route Command Center snapshot should start from the authoritative visible inventory.',
);
assert.strictEqual(
  getSavedRouteAssetInventorySnapshot(),
  initialInventory,
  'Equivalent consumers should share one stable inventory snapshot until a source store changes.',
);

let inventoryNotifications = 0;
const unsubscribeInventory = subscribeSavedRouteAssetInventory(() => {
  inventoryNotifications += 1;
});
runStore.createFromParsedImport(
  {
    name: 'Late Recorded Trail',
    routePoints: [
      { lat: 38.4, lng: -120.8, ele_m: null, time: null },
      { lat: 38.5, lng: -120.7, ele_m: null, time: null },
    ],
    trackPoints: [],
    primaryCoords: [],
    waypoints: [],
  },
  undefined,
  'trail',
  'Late Recorded Trail',
);

const updatedInventory = getSavedRouteAssetInventorySnapshot();
assert.strictEqual(inventoryNotifications, 1, 'One route-source mutation should issue one inventory update.');
assert.notStrictEqual(updatedInventory, initialInventory, 'A changed source store should replace the shared snapshot.');
assert.strictEqual(updatedInventory.counts.all, initialInventory.counts.all + 1);
assert.strictEqual(updatedInventory.counts.recorded, initialInventory.counts.recorded + 1);
assert.strictEqual(
  updatedInventory.summary,
  '5 total · 1 imported · 1 custom · 1 stitched · 2 recorded',
  'The compact summary should update immediately when a recorded route arrives after initial render.',
);
assert.strictEqual(
  updatedInventory.counts.all,
  updatedInventory.assets.length,
  'The preview count and Command Center list must be derived from the same reactive snapshot.',
);
unsubscribeInventory();

console.log('Saved route asset count checks passed.');
