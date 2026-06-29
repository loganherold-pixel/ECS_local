const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const instrumentationPath = path.join(root, 'lib', 'performance', 'exploreNavigateSeparationInstrumentation.ts');
const contractsPath = path.join(root, 'lib', 'routeDataContracts.ts');
const mvumModulePath = path.join(root, 'src', 'features', 'navigate', 'mvum', 'index.ts');
const mvumClientPath = path.join(root, 'src', 'features', 'navigate', 'mvum', 'client.ts');
const mapRendererPath = path.join(root, 'components', 'navigate', 'MapRenderer.tsx');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const discoverPath = path.join(root, 'app', '(tabs)', 'discover.tsx');
const packagePath = path.join(root, 'package.json');

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

assert(fs.existsSync(instrumentationPath), 'Explore/Navigate separation instrumentation module should exist.');

const {
  createExploreNavigateSeparationRun,
  recordExploreInitialRender,
  recordExploreRouteDetailFetch,
  recordNavigateInitialRender,
  recordMvumToggleLoad,
  recordMvumSelectionUpdate,
  recordMapLifecycleSample,
  recordMvumStitchRoute,
  recordActiveGuidanceStart,
  buildExploreNavigateSeparationReport,
  formatExploreNavigateSeparationPerfLog,
  createMapLifecycleCounter,
} = require(instrumentationPath);
const {
  normalizeRouteCatalogSummary,
} = require(contractsPath);
const mvum = require(mvumModulePath);

const mapRendererSource = fs.readFileSync(mapRendererPath, 'utf8');
const navigateSource = fs.readFileSync(navigatePath, 'utf8');
const discoverSource = fs.readFileSync(discoverPath, 'utf8');
const mvumClientSource = fs.readFileSync(mvumClientPath, 'utf8');

function sampleSummary(index) {
  return {
    routeId: `route-${index}`,
    title: `Route ${index}`,
    region: index % 2 === 0 ? 'Tahoe' : 'Mojave',
    forestName: 'Test Forest',
    distanceMeters: 1800 + index,
    estimatedDurationSeconds: 900 + index,
    difficulty: 'moderate',
    popularityScore: index,
    communityRating: 4.2,
    sourceType: 'official',
    bbox: { minLng: -120.9, minLat: 38.9, maxLng: -120.7, maxLat: 39.1 },
    trailheadCoordinate: { latitude: 39, longitude: -120.8 },
    thumbnailUrl: null,
    updatedAt: '2026-06-29T00:00:00.000Z',
    tags: ['qa'],
  };
}

const largeSummaryCatalog = Array.from({ length: 500 }, (_, index) => normalizeRouteCatalogSummary(sampleSummary(index)));
assert.strictEqual(largeSummaryCatalog.filter(Boolean).length, 500);
assert.strictEqual(
  normalizeRouteCatalogSummary({ ...sampleSummary(999), geometry: { type: 'LineString', coordinates: [[-120, 39], [-121, 40]] } }),
  null,
  'RouteCatalogSummary must keep full geometry out of Explore initial render inputs.',
);

const run = createExploreNavigateSeparationRun({
  runId: 'qa-explore-navigate-separation',
  startedAtMs: 1_000,
});

recordExploreInitialRender(run, {
  startedAtMs: 1_000,
  endedAtMs: 1_086,
  summaryCount: largeSummaryCatalog.length,
  catalogFilesFetched: 1,
  fullGeometryFetches: 0,
  fullGeometryParsed: false,
  mvumModulesMounted: false,
});

recordExploreRouteDetailFetch(run, {
  startedAtMs: 1_200,
  endedAtMs: 1_242,
  routeId: 'route-42',
  detailFetches: 1,
  requestedRouteIds: ['route-42'],
});

const disabledPlan = mvum.planNavigateMvumViewportFetch({
  enabled: false,
  bbox: { minLng: -120.9, minLat: 38.9, maxLng: -120.7, maxLat: 39.1 },
  zoom: 12,
  online: true,
});
assert.strictEqual(disabledPlan.status, 'disabled');
recordNavigateInitialRender(run, {
  startedAtMs: 1_300,
  endedAtMs: 1_348,
  mvumEnabled: false,
  mvumFetches: 0,
  mvumPlanStatus: disabledPlan.status,
});

const vectorPlan = mvum.planNavigateMvumViewportFetch({
  enabled: true,
  bbox: { minLng: -120.9, minLat: 38.9, maxLng: -120.7, maxLat: 39.1 },
  zoom: 12,
  online: true,
  vectorTileUrl: 'https://tiles.example.test/mvum/{z}/{x}/{y}.pbf',
  vectorSourceLayer: 'mvum_segments',
});
assert.strictEqual(vectorPlan.status, 'vector_tiles');
const overlayPayload = mvum.buildNavigateMvumMapOverlay({
  enabled: true,
  selectedSegmentIds: [],
  vectorTileUrl: vectorPlan.tileUrl,
  vectorSourceLayer: vectorPlan.sourceLayer,
  viewportSegments: [],
});
assert.strictEqual(overlayPayload.sourceId, 'navigate-mvum-source');
assert.strictEqual(overlayPayload.sourceType, 'vector');
recordMvumToggleLoad(run, {
  startedAtMs: 1_400,
  endedAtMs: 1_462,
  planStatus: vectorPlan.status,
  sourceType: overlayPayload.sourceType,
  sourceId: overlayPayload.sourceId,
  layerIds: [mvum.MVUM_OVERLAY_LAYER_ID, mvum.MVUM_OVERLAY_SELECTED_LAYER_ID],
});

const mapLifecycle = createMapLifecycleCounter();
const beforeCycle = mapLifecycle.snapshot();
['explore-preview-route-source', 'active-guidance-route-source', 'navigate-mvum-source'].forEach((sourceId) =>
  mapLifecycle.ensureSource(sourceId),
);
['explore-preview-route-layer', 'active-guidance-route-layer', 'navigate-mvum-line-layer'].forEach((layerId) =>
  mapLifecycle.ensureLayer(layerId),
);
['map:load', 'map:click'].forEach((listenerId) => mapLifecycle.attachListener(listenerId));
for (let index = 0; index < 4; index += 1) {
  ['explore-preview-route-source', 'active-guidance-route-source', 'navigate-mvum-source'].forEach((sourceId) =>
    mapLifecycle.ensureSource(sourceId),
  );
  ['explore-preview-route-layer', 'active-guidance-route-layer', 'navigate-mvum-line-layer'].forEach((layerId) =>
    mapLifecycle.ensureLayer(layerId),
  );
  ['map:load', 'map:click'].forEach((listenerId) => mapLifecycle.attachListener(listenerId));
}
const afterCycle = mapLifecycle.snapshot();
recordMapLifecycleSample(run, {
  label: 'tab_cycle',
  before: beforeCycle,
  after: afterCycle,
});

let selectedIds = [];
['mvum-a', 'mvum-b', 'mvum-c'].forEach((segmentId, index) => {
  const before = selectedIds;
  selectedIds = mvum.toggleMvumSelectedSegmentId(selectedIds, segmentId);
  recordMvumSelectionUpdate(run, {
    selectedSegmentIds: selectedIds,
    selectedUpdateCount: index + 1,
    replacedFullMvumSource: false,
    previousSelectedCount: before.length,
  });
});
assert.deepStrictEqual(selectedIds, ['mvum-a', 'mvum-b', 'mvum-c']);

const stitchedDraft = mvum.buildMvumStitchedRouteDraft({
  selectedSegmentIds: selectedIds,
  segments: selectedIds.map((segmentId, index) => ({
    segmentId,
    sourceLayer: 'mvum_segments',
    sourceQuality: 'canonical',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-120.9 + index * 0.01, 39 + index * 0.01],
        [-120.89 + index * 0.01, 39.01 + index * 0.01],
      ],
    },
    distanceMeters: 100,
    estimatedDurationSeconds: 60,
    warnings: [],
  })),
});
const stitchedPreview = mvum.buildNavigateMvumStitchedRoutePreview(stitchedDraft);
assert(stitchedPreview, 'Stitched route preview should be produced from selected canonical segments.');
assert.strictEqual(stitchedPreview.sourceId, 'navigate-stitched-route-source');
recordMvumStitchRoute(run, {
  startedAtMs: 1_500,
  endedAtMs: 1_574,
  selectedSegmentIds: selectedIds,
  fetchedCanonicalSegmentIds: selectedIds,
  fullGeometryFetches: 1,
  previewSourceId: stitchedPreview.sourceId,
  previewLayerId: stitchedPreview.layerId,
});

recordActiveGuidanceStart(run, {
  routeId: stitchedDraft.draftId,
  routeVersion: 'route-v-stitch-1',
  sourceKind: 'stitched_route',
  usesExploreStore: false,
  usesMvumOverlayStore: false,
  hasGeometry: !!stitchedDraft.geometry,
  stepCount: 0,
});

const report = buildExploreNavigateSeparationReport(run, { completedAtMs: 1_600 });
assert.strictEqual(report.explore.initialRenderMs, 86);
assert.strictEqual(report.explore.catalogFilesFetchedOnMount, 1);
assert.strictEqual(report.explore.fullGeometryFetchedOnInitialRender, false);
assert.strictEqual(report.explore.mvumMountedOnInitialRender, false);
assert.deepStrictEqual(report.explore.detailRequestedRouteIds, ['route-42']);
assert.strictEqual(report.navigate.initialRenderWithMvumOffMs, 48);
assert.strictEqual(report.navigate.mvumFetchesWithOverlayOff, 0);
assert.strictEqual(report.navigate.mvumToggleLoadMs, 62);
assert.strictEqual(report.navigate.mvumToggleSourceType, 'vector');
assert.strictEqual(report.navigate.selectedSegmentUpdateCount, 3);
assert.strictEqual(report.navigate.fullMvumSourceReplacedDuringSelection, false);
assert.strictEqual(report.navigate.canonicalGeometryFetchesForStitch, 1);
assert.deepStrictEqual(report.navigate.canonicalGeometryFetchedSegmentIds, selectedIds);
assert.strictEqual(report.map.duplicateSourceCount, 0);
assert.strictEqual(report.map.duplicateLayerCount, 0);
assert.strictEqual(report.map.duplicateListenerCount, 0);
assert.strictEqual(report.activeGuidance.usesExploreStore, false);
assert.strictEqual(report.activeGuidance.usesMvumOverlayStore, false);
assert.strictEqual(report.blockers.length, 0, report.blockers.join('\n'));

[
  'recordExploreInitialRender',
  'recordExploreRouteDetailFetch',
  'recordNavigateInitialRender',
  'recordMvumToggleLoad',
  'recordMvumSelectionUpdate',
  'recordMapLifecycleSample',
  'recordMvumStitchRoute',
  'recordActiveGuidanceStart',
].forEach((needle) => {
  assert(discoverSource.includes(needle) || navigateSource.includes(needle) || mapRendererSource.includes(needle), `Runtime should wire separation instrumentation: ${needle}`);
});

assert(!discoverSource.includes('src/features/navigate/mvum'), 'Explore must not mount or import MVUM modules.');
assert(!navigateSource.includes('RouteCatalogSummaryCard'), 'Navigate must not render Explore catalog cards.');
assert(
  mvumClientSource.includes('segmentIds') &&
    mvumClientSource.includes("supabase.functions.invoke('navigate-mvum-segment-geometry'") &&
    !mvumClientSource.includes('includeAllSegments'),
  'MVUM stitch geometry fetch must be constrained to selected segment IDs.',
);
assert(
  mapRendererSource.includes('mapLifecycleCounters') &&
    mapRendererSource.includes("send('mapLifecycleMetrics'"),
  'MapRenderer should emit source/layer/listener lifecycle metrics for tab cycling diagnostics.',
);
assert(
  !mapRendererSource.includes("setGeoJson(MVUM_OVERLAY_SOURCE_ID, selected") &&
    !mapRendererSource.includes("setGeoJson('navigate-mvum-source', selected"),
  'Selected MVUM segment changes must not replace the full MVUM source.',
);

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
assert.strictEqual(
  packageJson.scripts['test:explore-navigate-separation-performance'],
  'node ./scripts/test-explore-navigate-separation-performance.js',
  'package.json should expose the Explore/Navigate separation performance regression.',
);

const beforeReport = buildExploreNavigateSeparationReport(createExploreNavigateSeparationRun({
  runId: 'qa-before-separation-baseline',
  startedAtMs: 0,
}), { completedAtMs: 0 });
console.log(formatExploreNavigateSeparationPerfLog('before', beforeReport));
console.log(formatExploreNavigateSeparationPerfLog('after', report));
console.log('Explore/Navigate separation performance checks passed.');
