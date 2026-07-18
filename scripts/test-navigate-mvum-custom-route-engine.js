const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'src', 'features', 'navigate', 'mvum', 'index.ts');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const mapRendererPath = path.join(root, 'components', 'navigate', 'MapRenderer.tsx');

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

const mvum = require(modulePath);

const selectionStore = mvum.createNavigateMvumSelectionStore({
  now: () => '2026-07-17T18:00:00.000Z',
});
selectionStore.toggleSegment('segment-a');
selectionStore.toggleSegment('segment-b');
assert.deepStrictEqual(
  selectionStore.getSnapshot().selectedSegmentIds,
  ['segment-a', 'segment-b'],
  'Sequential MVUM taps should preserve both selected segments in route-building order.',
);

assert.deepStrictEqual(
  mvum.MVUM_SEGMENT_ID_PROPERTY_KEYS,
  ['segmentId', 'segment_id', 'routeSegmentId', 'route_segment_id', 'id'],
  'Map hit-testing and the selected-layer filter should accept canonical and provider segment ID spellings.',
);

const canonicalSegments = [
  {
    segmentId: 'segment-a',
    sourceLayer: 'mvum_segments',
    sourceQuality: 'canonical',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-120.1, 39.1],
        [-120.09, 39.1],
      ],
    },
    distanceMeters: null,
    estimatedDurationSeconds: null,
    warnings: [],
  },
  {
    segmentId: 'segment-b',
    sourceLayer: 'mvum_segments',
    sourceQuality: 'canonical',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-120.08, 39.1],
        [-120.09, 39.1],
      ],
    },
    distanceMeters: null,
    estimatedDurationSeconds: null,
    warnings: [],
  },
];

const draftA = mvum.buildMvumStitchedRouteDraft({
  selectedSegmentIds: ['segment-a', 'segment-b'],
  segments: canonicalSegments,
  now: '2026-07-17T18:01:00.000Z',
});
const draftB = mvum.buildMvumStitchedRouteDraft({
  selectedSegmentIds: ['segment-a', 'segment-b'],
  segments: canonicalSegments,
  now: '2026-07-17T18:02:00.000Z',
});

assert.strictEqual(draftA.geometry.type, 'LineString');
assert.strictEqual(draftA.geometry.coordinates.length, 3);
assert.strictEqual(draftA.geometrySourceState, 'canonical');
assert.deepStrictEqual(draftA.unresolvedGaps, []);
assert.strictEqual(
  mvum.buildMvumStitchedRoutePersistenceKey(draftA),
  mvum.buildMvumStitchedRoutePersistenceKey(draftB),
  'The same selected canonical geometry should have a stable persistence identity across rebuilds.',
);

const nearRouteOrigin = { lat: 39.10018, lng: -120.085 };
const nearRoutePlan = mvum.buildMvumGuidanceEntryPlan({
  draft: draftA,
  origin: nearRouteOrigin,
  accuracyM: 8,
});
assert.strictEqual(nearRoutePlan.status, 'ready_on_route');
assert(nearRoutePlan.entryCoordinate, 'A GPS projection should identify the nearest point on the selected route.');
assert(nearRoutePlan.trailGeometry.length >= 2);
assert.deepStrictEqual(
  nearRoutePlan.trailGeometry[0],
  nearRoutePlan.entryCoordinate,
  'Guidance geometry should begin at the projected route entry, not at raw GPS.',
);
assert.notDeepStrictEqual(
  nearRoutePlan.entryCoordinate,
  nearRouteOrigin,
  'Raw GPS must remain separate from the canonical snapped route coordinate.',
);

const offRoutePlan = mvum.buildMvumGuidanceEntryPlan({
  draft: draftA,
  origin: { lat: 39.12, lng: -120.085 },
  accuracyM: 8,
});
assert.strictEqual(offRoutePlan.status, 'ready_with_approach');
assert(offRoutePlan.distanceToEntryM > offRoutePlan.snapToleranceM);

const noLocationPlan = mvum.buildMvumGuidanceEntryPlan({
  draft: draftA,
  origin: null,
});
assert.strictEqual(noLocationPlan.status, 'location_unavailable');

const limitedDraft = mvum.buildMvumStitchedRouteDraft({
  selectedSegmentIds: ['segment-a'],
  segments: [{ ...canonicalSegments[0], sourceQuality: 'limited_tile_geometry' }],
  now: '2026-07-17T18:03:00.000Z',
});
assert.strictEqual(limitedDraft.geometrySourceState, 'limited_tile_geometry');
assert.strictEqual(
  mvum.buildMvumStitchedRoutePersistenceKey(limitedDraft),
  null,
  'Limited viewport geometry must not be persisted as an ordinary guidance-capable saved route.',
);
assert.strictEqual(
  mvum.buildMvumGuidanceEntryPlan({ draft: limitedDraft, origin: nearRouteOrigin }).status,
  'preview_only',
  'Limited viewport geometry may be previewed but must not silently become a saved guidance route.',
);

const unavailableSourceDraft = mvum.buildMvumStitchedRouteDraft({
  selectedSegmentIds: ['segment-a'],
  segments: [{ ...canonicalSegments[0], sourceQuality: 'unavailable' }],
  now: '2026-07-17T18:04:00.000Z',
});
assert.strictEqual(
  unavailableSourceDraft.geometrySourceState,
  'unavailable',
  'Preview geometry explicitly marked unavailable must never be promoted to canonical source truth.',
);
assert.strictEqual(
  mvum.buildMvumGuidanceEntryPlan({ draft: unavailableSourceDraft, origin: nearRouteOrigin }).status,
  'preview_only',
);

const navigateSource = fs.readFileSync(navigatePath, 'utf8');
const mapRendererSource = fs.readFileSync(mapRendererPath, 'utf8');

assert(navigateSource.includes('handleSaveMvumStitchedRoute'), 'Navigate should expose a save-only MVUM action.');
assert(navigateSource.includes('SAVE ROUTE'), 'The MVUM overlay should show an explicit Save Route control.');
assert(
  navigateSource.includes('buildMvumGuidanceEntryPlan'),
  'The mounted Start path should use canonical GPS-to-route projection.',
);
assert(
  navigateSource.includes('applyExploreNavigationPayload'),
  'MVUM guidance should use the canonical Navigate handoff/replacement guard path.',
);
assert(
  mapRendererSource.includes('MVUM_SEGMENT_ID_PROPERTY_KEYS'),
  'MapRenderer should share the provider segment-ID alias contract.',
);
assert(
  mapRendererSource.includes('mvumOverlayDataSignature') &&
    mapRendererSource.includes('mvumOverlaySelectionSignature'),
  'Selection-only updates should be tracked separately from the full MVUM source payload.',
);
assert(
  mapRendererSource.includes("'line-color': '#F2C24D'"),
  'Selected MVUM segments should remain visibly yellow.',
);

console.log('Navigate MVUM custom route engine checks passed.');
