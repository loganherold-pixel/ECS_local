const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'src', 'features', 'navigate', 'mvum', 'index.ts');
const clientPath = path.join(root, 'src', 'features', 'navigate', 'mvum', 'client.ts');
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

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), `${message}: ${needle}`);
}

const mvum = require(modulePath);

assert.strictEqual(
  mvum.NAVIGATE_STITCHED_ROUTE_SOURCE_ID,
  'navigate-stitched-route-source',
  'Stitched route preview should use the dedicated Navigate source id.',
);
assert.strictEqual(
  mvum.NAVIGATE_STITCHED_ROUTE_LAYER_ID,
  'navigate-stitched-route-layer',
  'Stitched route preview should use the dedicated Navigate layer id.',
);

const selectionStore = mvum.createNavigateMvumSelectionStore({
  now: () => '2026-06-29T17:00:00.000Z',
  sourceLayer: 'mvum_segments',
});
selectionStore.toggleSegment('mvum-101');
selectionStore.toggleSegment('mvum-203');
let selectionSnapshot = selectionStore.getSnapshot();
assert.deepStrictEqual(
  selectionSnapshot.selectedSegmentIds,
  ['mvum-101', 'mvum-203'],
  'MVUM selection store should preserve user selection order.',
);
assert.deepStrictEqual(
  selectionSnapshot.selectedSegments.map((segment) => segment.selectionOrder),
  [1, 2],
  'Selected segment records should carry stable selection order.',
);
assert(
  !JSON.stringify(selectionSnapshot).includes('coordinates'),
  'MVUM selection state should store segment IDs and metadata, not full geometry.',
);
selectionStore.toggleSegment('mvum-101');
selectionSnapshot = selectionStore.getSnapshot();
assert.deepStrictEqual(
  selectionSnapshot.selectedSegmentIds,
  ['mvum-203'],
  'Toggling an already selected MVUM segment should remove only that segment.',
);

const canonicalSegments = [
  {
    segmentId: 'mvum-101',
    sourceLayer: 'mvum_segments',
    sourceQuality: 'canonical',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-120.1, 39.1],
        [-120.09, 39.105],
      ],
    },
    distanceMeters: 1200,
    estimatedDurationSeconds: 540,
    warnings: [],
  },
  {
    segmentId: 'mvum-203',
    sourceLayer: 'mvum_segments',
    sourceQuality: 'canonical',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-120.09, 39.105],
        [-120.08, 39.11],
      ],
    },
    distanceMeters: 900,
    estimatedDurationSeconds: 420,
    warnings: [],
  },
  {
    segmentId: 'mvum-gap',
    sourceLayer: 'mvum_segments',
    sourceQuality: 'canonical',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-119.5, 38.9],
        [-119.49, 38.91],
      ],
    },
    distanceMeters: 1000,
    estimatedDurationSeconds: 500,
    warnings: [],
  },
];

const stitchedDraft = mvum.buildMvumStitchedRouteDraft({
  selectedSegmentIds: ['mvum-101', 'mvum-203'],
  segments: canonicalSegments.slice(0, 2),
  now: '2026-06-29T17:05:00.000Z',
});
assert.deepStrictEqual(stitchedDraft.selectedSegmentIds, ['mvum-101', 'mvum-203']);
assert.deepStrictEqual(stitchedDraft.orderedSegmentIds, ['mvum-101', 'mvum-203']);
assert.strictEqual(stitchedDraft.geometry.type, 'LineString');
assert.strictEqual(stitchedDraft.geometry.coordinates.length, 3, 'Connected segment endpoints should be de-duped.');
assert.strictEqual(stitchedDraft.distanceMeters, 2100);
assert.strictEqual(stitchedDraft.estimatedDurationSeconds, 960);
assert.deepStrictEqual(stitchedDraft.unresolvedGaps, []);

const gapDraft = mvum.buildMvumStitchedRouteDraft({
  selectedSegmentIds: ['mvum-101', 'mvum-gap'],
  segments: [canonicalSegments[0], canonicalSegments[2]],
  now: '2026-06-29T17:06:00.000Z',
});
assert.strictEqual(gapDraft.geometry.type, 'MultiLineString');
assert.strictEqual(gapDraft.unresolvedGaps.length, 1, 'Disconnected MVUM selections should produce an honest gap.');
assert.strictEqual(gapDraft.unresolvedGaps[0].reason, 'gap_detected');
assert(
  gapDraft.warnings.some((warning) => warning.toLowerCase().includes('gap')),
  'Gap warnings should be visible on the stitched route draft.',
);

const limitedSegments = mvum.buildMvumCanonicalSegmentsFromViewport(
  [
    {
      id: 'mvum-101',
      name: '101',
      sourceId: 'viewport',
      sourceLabel: 'MVUM viewport',
      lastVerifiedAt: null,
      confidence: 'planning_geometry',
      coordinates: [
        { latitude: 39.1, longitude: -120.1 },
        { latitude: 39.105, longitude: -120.09 },
      ],
      properties: {},
    },
  ],
  ['mvum-101'],
);
assert.strictEqual(limitedSegments.length, 1);
assert.strictEqual(limitedSegments[0].sourceQuality, 'limited_tile_geometry');
assert(
  limitedSegments[0].warnings.some((warning) => warning.toLowerCase().includes('limited')),
  'Viewport fallback geometry should be clearly marked as limited.',
);

const preview = mvum.buildNavigateMvumStitchedRoutePreview(stitchedDraft);
assert.strictEqual(preview.sourceId, 'navigate-stitched-route-source');
assert.strictEqual(preview.layerId, 'navigate-stitched-route-layer');
assert.strictEqual(preview.featureCollection.features.length, 1);

const navigateSource = fs.readFileSync(navigatePath, 'utf8');
const mapRendererSource = fs.readFileSync(mapRendererPath, 'utf8');
const discoverSource = fs.readFileSync(discoverPath, 'utf8');
const clientSource = fs.readFileSync(clientPath, 'utf8');

[
  'createNavigateMvumSelectionStore',
  'handleBuildMvumStitchedRoute',
  'handleStartMvumStitchedGuidance',
  'fetchNavigateMvumCanonicalSegments',
  'mvumStitchedRouteDraft',
  'navigateMvumStitchedRoutePreview',
  'stitchedRoutePreview={navigateMvumStitchedRoutePreview}',
  'BUILD ROUTE',
].forEach((needle) => {
  assertIncludes(navigateSource, needle, 'Navigate should wire MVUM segment stitching');
});

[
  'fetchNavigateMvumCanonicalSegments',
  'segmentIds',
  'navigate-mvum-segment-geometry',
].forEach((needle) => {
  assertIncludes(clientSource, needle, 'Navigate MVUM client should expose canonical geometry fetch');
});

[
  'stitchedRoutePreview?: NavigateMvumStitchedRoutePreviewPayload | null',
  'NAVIGATE_STITCHED_ROUTE_SOURCE_ID',
  'NAVIGATE_STITCHED_ROUTE_LAYER_ID',
  'updateStitchedRoutePreview(payload.stitchedRoutePreview || null)',
].forEach((needle) => {
  assertIncludes(mapRendererSource, needle, 'MapRenderer should isolate stitched-route preview rendering');
});

assert(
  !discoverSource.includes('fetchNavigateMvumCanonicalSegments') &&
    !discoverSource.includes('navigate-stitched-route-source') &&
    !discoverSource.includes('createNavigateMvumSelectionStore'),
  'Explore must not import or mutate Navigate MVUM stitching state.',
);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(
  packageJson.scripts['test:navigate-mvum-segment-stitching'],
  'node ./scripts/test-navigate-mvum-segment-stitching.js',
  'package.json should expose the Navigate MVUM segment stitching regression.',
);

console.log('Navigate MVUM segment stitching checks passed.');
