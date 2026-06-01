const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

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

const { normalizeRouteLifecycle } = require(path.join(root, 'lib/routeLifecycleState.ts'));

function phase(input) {
  return normalizeRouteLifecycle(input);
}

assert.deepStrictEqual(
  phase({}).phase,
  'idle',
  'No route sources should normalize to idle.',
);

assert.deepStrictEqual(
  phase({ routeBuilderActive: true, routeBuilderDrawing: true }).phase,
  'building',
  'Build Route mode should normalize to building without implying a preview route exists.',
);

assert.deepStrictEqual(
  phase({
    routeBuilderActive: true,
    roadStatus: 'route_preview',
    roadHasDestination: true,
    roadHasRoute: true,
  }).source,
  'route_builder',
  'Build Route mode should own the lifecycle instead of competing with stale road previews.',
);

assert.deepStrictEqual(
  phase({ roadStatus: 'route_preview', roadHasDestination: true, roadHasRoute: true }).phase,
  'preview',
  'A road route with fetched geometry should normalize to preview.',
);

assert.deepStrictEqual(
  phase({ roadStatus: 'route_preview', roadHasDestination: true, roadPreviewLoading: true }).phase,
  'building',
  'A road destination still waiting on route geometry should normalize to building.',
);

assert.strictEqual(
  phase({ roadStatus: 'route_preview', roadHasDestination: true, roadPreviewLoading: true }).isLoading,
  true,
  'Route generation should expose a loading state.',
);

assert.deepStrictEqual(
  phase({ roadStatus: 'destination_selected', roadHasDestination: true, roadError: 'GPS required' }),
  {
    phase: 'ready',
    source: 'road',
    isLoading: false,
    error: 'GPS required',
    canStartGuidance: false,
    canCancel: true,
    shouldRenderPreview: true,
    shouldRenderGuidance: false,
  },
  'A selected destination without GPS should be ready, cancellable, and honest about the blocker.',
);

assert.strictEqual(
  phase({ roadStatus: 'navigation_active', roadHasRoute: true }).phase,
  'navigating',
  'Active road guidance should normalize to navigating.',
);

assert.strictEqual(
  phase({ roadStatus: 'rerouting', roadHasRoute: true }).isLoading,
  true,
  'Rerouting should be treated as a loading substate of navigating.',
);

assert.strictEqual(
  phase({ roadStatus: 'arrived', roadHasRoute: true }).phase,
  'completed',
  'Arrived road sessions should normalize to completed.',
);

assert.strictEqual(
  phase({ roadStatus: 'error', roadError: 'Route unavailable' }).phase,
  'failed',
  'Road errors should normalize to failed.',
);

assert.strictEqual(
  phase({ trailUiMode: 'preview', trailHasPayload: true }).phase,
  'preview',
  'Trail preview handoffs should normalize to preview.',
);

assert.strictEqual(
  phase({ trailUiMode: 'active', trailHasPayload: true }).phase,
  'navigating',
  'Active trail guidance should normalize to navigating.',
);

assert.strictEqual(
  phase({ explorePreviewMode: 'hybrid', pendingHybridTrailTransition: true }).source,
  'hybrid',
  'Hybrid transitions should preserve source identity.',
);

assert.strictEqual(
  phase({ hasActiveRun: true, hasDisplayedRouteGeometry: true }).phase,
  'ready',
  'Saved/imported route geometry staged from a run should normalize to ready.',
);

console.log('Route lifecycle model checks passed.');
