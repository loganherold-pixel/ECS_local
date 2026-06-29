const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const moduleDir = path.join(root, 'src', 'features', 'navigate', 'mvum');
const modulePath = path.join(moduleDir, 'index.ts');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const mapRendererPath = path.join(root, 'components', 'navigate', 'MapRenderer.tsx');
const discoverPath = path.join(root, 'app', '(tabs)', 'discover.tsx');

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;

assert(fs.existsSync(moduleDir), 'Navigate MVUM feature module directory should exist.');
assert(fs.existsSync(modulePath), 'Navigate MVUM feature module should expose an index.ts contract.');

const mvum = require(modulePath);

assert.strictEqual(mvum.MVUM_OVERLAY_SOURCE_ID, 'navigate-mvum-source');
assert.strictEqual(mvum.MVUM_OVERLAY_LAYER_ID, 'navigate-mvum-line-layer');
assert.strictEqual(mvum.MVUM_OVERLAY_SELECTED_LAYER_ID, 'navigate-mvum-selected-layer');
assert.strictEqual(mvum.MVUM_OVERLAY_SELECTED_SOURCE_ID, 'navigate-mvum-selected-source');
assert(mvum.MVUM_OVERLAY_MIN_ZOOM >= 10, 'MVUM overlay should defer rendering until useful zoom.');

const initial = mvum.createNavigateMvumOverlayState();
assert.strictEqual(initial.enabled, false, 'MVUM overlay should be off by default.');
assert.deepStrictEqual(initial.selectedSegmentIds, [], 'MVUM overlay should start with no selected segments.');

const bbox = {
  minLatitude: 38.8,
  minLongitude: -120.9,
  maxLatitude: 39.1,
  maxLongitude: -120.5,
};

assert.strictEqual(
  mvum.planNavigateMvumViewportFetch({ enabled: false, bbox, zoom: 12, online: true }).status,
  'disabled',
  'MVUM fetch planning should be disabled when the toggle is off.',
);
assert.strictEqual(
  mvum.planNavigateMvumViewportFetch({
    enabled: true,
    bbox,
    zoom: 12,
    online: true,
    vectorTileUrl: 'https://tiles.example.test/mvum/{z}/{x}/{y}.pbf',
  }).status,
  'vector_tiles',
  'MVUM should prefer vector tiles when a tile endpoint is available.',
);
assert.strictEqual(
  mvum.planNavigateMvumViewportFetch({ enabled: true, bbox, zoom: 8, online: true }).status,
  'zoom_deferred',
  'MVUM viewport loading should defer below the overlay minZoom.',
);
const viewportPlan = mvum.planNavigateMvumViewportFetch({ enabled: true, bbox, zoom: 12, online: true });
assert.strictEqual(viewportPlan.status, 'fetch_viewport');
assert(
  viewportPlan.cacheKey.includes('navigate.mvum.viewport'),
  'MVUM viewport cache key should be namespaced away from Explore and active route caches.',
);

const selectedOnce = mvum.toggleMvumSelectedSegmentId(initial.selectedSegmentIds, 'mvum-segment-1');
assert.deepStrictEqual(selectedOnce, ['mvum-segment-1']);
const selectedTwice = mvum.toggleMvumSelectedSegmentId(selectedOnce, 'mvum-segment-1');
assert.deepStrictEqual(selectedTwice, []);
assert(
  !JSON.stringify(selectedOnce).includes('coordinates'),
  'MVUM selection state should store segment IDs, not full geometry.',
);

const overlayPayload = mvum.buildNavigateMvumMapOverlay({
  enabled: true,
  selectedSegmentIds: ['mvum-segment-1'],
  vectorTileUrl: 'https://tiles.example.test/mvum/{z}/{x}/{y}.pbf',
  vectorSourceLayer: 'mvum_segments',
  viewportSegments: [],
});
assert.strictEqual(overlayPayload.enabled, true);
assert.strictEqual(overlayPayload.sourceType, 'vector');
assert.deepStrictEqual(overlayPayload.selectedSegmentIds, ['mvum-segment-1']);
assert.strictEqual(overlayPayload.featureCollection, null);

const navigateSource = fs.readFileSync(navigatePath, 'utf8');
const mapRendererSource = fs.readFileSync(mapRendererPath, 'utf8');
const discoverSource = fs.readFileSync(discoverPath, 'utf8');

[
  'createNavigateMvumOverlayState',
  'planNavigateMvumViewportFetch',
  'fetchNavigateMvumViewportSegments',
  'toggleMvumOverlay',
  'mvumOverlayEnabled',
  'selectedMvumSegmentIds',
  'mvumOverlay={navigateMvumMapOverlay}',
].forEach((needle) => {
  assert(navigateSource.includes(needle), `Navigate should wire dedicated MVUM overlay behavior: ${needle}`);
});

assert(
  !discoverSource.includes('fetchNavigateMvumViewportSegments') &&
    !discoverSource.includes('MVUM_OVERLAY_SOURCE_ID') &&
    !discoverSource.includes('src/features/navigate/mvum'),
  'Explore must not import or mount Navigate MVUM overlay logic.',
);

[
  'mvumOverlay?: NavigateMvumMapOverlayPayload | null',
  'MVUM_OVERLAY_SOURCE_ID',
  'ensureMvumOverlayLayers',
  'updateMvumOverlay(payload.mvumOverlay || null)',
  "map.queryRenderedFeatures(e.point, { layers: [MVUM_OVERLAY_SELECTED_LAYER_ID, MVUM_OVERLAY_LAYER_ID] })",
].forEach((needle) => {
  assert(mapRendererSource.includes(needle), `MapRenderer should use dedicated MVUM source/layer wiring: ${needle}`);
});

assert(
  !mapRendererSource.includes("source: 'segment-source',\n            filter: ['==', ['get', 'kind'], 'mvum_segment']"),
  'MVUM segments must not be rendered through the generic segment-source route overlay.',
);
assert(
  !mapRendererSource.includes("setGeoJson('navigate-mvum-source', selected"),
  'Selecting MVUM segments should not replace the full MVUM dataset.',
);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(
  packageJson.scripts['test:navigate-mvum-overlay-separation'],
  'node ./scripts/test-navigate-mvum-overlay-separation.js',
  'package.json should expose the Navigate MVUM overlay separation regression.',
);

console.log('Navigate MVUM overlay separation checks passed.');
