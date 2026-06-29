const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const mapRendererPath = path.join(root, 'components', 'navigate', 'MapRenderer.tsx');
const mvumModulePath = path.join(root, 'src', 'features', 'navigate', 'mvum', 'index.ts');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
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

function includes(source, needle, message) {
  assert(source.includes(needle), `${message}: ${needle}`);
}

const mapRendererSource = fs.readFileSync(mapRendererPath, 'utf8');
const navigateSource = fs.readFileSync(navigatePath, 'utf8');
const discoverSource = fs.readFileSync(discoverPath, 'utf8');
const mvum = require(mvumModulePath);

assert.strictEqual(mvum.MVUM_OVERLAY_SOURCE_ID, 'navigate-mvum-source');
assert.strictEqual(mvum.MVUM_OVERLAY_SELECTED_SOURCE_ID, 'navigate-mvum-selected-source');
assert.strictEqual(mvum.NAVIGATE_STITCHED_ROUTE_SOURCE_ID, 'navigate-stitched-route-source');

[
  "EXPLORE_PREVIEW_ROUTE_SOURCE_ID = 'explore-preview-route-source'",
  "ACTIVE_GUIDANCE_ROUTE_SOURCE_ID = 'active-guidance-route-source'",
  "STAGED_ROUTE_OPTION_SOURCE_ID = 'staged-route-option-source'",
].forEach((needle) => includes(mapRendererSource, needle, 'MapRenderer should declare unique feature-area source IDs'));

[
  'NAVIGATE_STITCHED_ROUTE_SOURCE_ID',
  'MVUM_OVERLAY_SOURCE_ID',
  'MVUM_OVERLAY_SELECTED_SOURCE_ID',
].forEach((needle) => includes(mapRendererSource, needle, 'MapRenderer should consume Navigate MVUM source IDs from the MVUM module'));

[
  'function createMapSourceRegistry',
  'function createMapLayerRegistry',
  'function createMapListenerRegistry',
  '[ECS Map] source added',
  '[ECS Map] source already exists',
  '[ECS Map] layer added',
  '[ECS Map] listener attached',
  '[ECS Map] listener removed',
  '[ECS Map] duplicate prevented',
].forEach((needle) => includes(mapRendererSource, needle, 'MapRenderer should expose idempotent map lifecycle diagnostics'));

[
  'mapSourceRegistry.ensure(ACTIVE_GUIDANCE_ROUTE_SOURCE_ID',
  'mapSourceRegistry.ensure(EXPLORE_PREVIEW_ROUTE_SOURCE_ID',
  'mapSourceRegistry.ensure(STAGED_ROUTE_OPTION_SOURCE_ID',
  'mapSourceRegistry.ensure(MVUM_OVERLAY_SOURCE_ID',
  'mapSourceRegistry.ensure(NAVIGATE_STITCHED_ROUTE_SOURCE_ID',
  'mapLayerRegistry.ensure(ACTIVE_GUIDANCE_ROUTE_LAYER_ID',
  'mapLayerRegistry.ensure(EXPLORE_PREVIEW_ROUTE_LAYER_ID',
  'mapLayerRegistry.ensure(STAGED_ROUTE_OPTION_LAYER_ID',
  'mapLayerRegistry.ensure(MVUM_OVERLAY_LAYER_ID',
  'mapLayerRegistry.ensure(NAVIGATE_STITCHED_ROUTE_LAYER_ID',
  'mapListenerRegistry.attach(',
  'mapListenerRegistry.removeAll();',
].forEach((needle) => includes(mapRendererSource, needle, 'Mapbox source/layer/listener operations should go through lifecycle registries'));

assert(
  !mapRendererSource.includes("setGeoJson('route-source'") &&
    !mapRendererSource.includes("ensureSource('route-source'"),
  'Active/staged/preview route rendering must not share the legacy route-source.',
);
assert(
  !mapRendererSource.includes("source: 'segment-source',\n            filter: ['==', ['get', 'kind'], 'explore_route']"),
  'Explore preview routes should not be rendered through the generic segment-source.',
);
assert(
  !mapRendererSource.includes("source: 'segment-source',\n            filter: ['==', ['get', 'kind'], 'mvum_segment']"),
  'MVUM routes should not be rendered through generic segment-source.',
);
assert(
  !navigateSource.includes('EXPLORE_PREVIEW_ROUTE_SOURCE_ID') &&
    !navigateSource.includes('ACTIVE_GUIDANCE_ROUTE_SOURCE_ID') &&
    !navigateSource.includes('STAGED_ROUTE_OPTION_SOURCE_ID'),
  'Navigate should pass route state to MapRenderer instead of owning Mapbox route source IDs.',
);
assert(
  !discoverSource.includes('MVUM_OVERLAY_SOURCE_ID') &&
    !discoverSource.includes('navigate-mvum-source') &&
    !discoverSource.includes('navigate-stitched-route-source'),
  'Explore must not mount Navigate MVUM or stitched route sources.',
);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(
  packageJson.scripts['test:mapbox-source-layer-lifecycle'],
  'node ./scripts/test-mapbox-source-layer-lifecycle.js',
  'package.json should expose the Mapbox source/layer lifecycle regression.',
);

console.log('Mapbox source/layer lifecycle checks passed.');
