const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const vm = require('vm');
const styleSpec = require('mapbox-gl/src/style-spec');

const root = path.join(__dirname, '..');
const mapRendererPath = path.join(root, 'components', 'navigate', 'MapRenderer.tsx');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const mapRendererSource = fs.readFileSync(mapRendererPath, 'utf8');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      ActivityIndicator() { return null; },
      Platform: { OS: 'web', select: (values) => values?.web ?? values?.default },
      StyleSheet: {
        absoluteFillObject: {},
        create(styles) { return styles; },
      },
      Text() { return null; },
      View() { return null; },
    };
  }
  if (request === 'react-native-webview') {
    return { WebView() { return null; } };
  }
  if (request === 'react-native-svg') {
    function Svg() { return null; }
    return {
      __esModule: true,
      default: Svg,
      Circle() { return null; },
      Line() { return null; },
      Polyline() { return null; },
      Rect() { return null; },
      Text() { return null; },
    };
  }
  if (request === 'expo-constants') {
    return { default: { expoConfig: { extra: {} }, manifest: { extra: {} } } };
  }
  if (request.endsWith('/supabase') || request === './supabase') {
    return { supabase: null };
  }
  if (request.endsWith('/ecsIssueReporter') || request === './ecsIssueReporter') {
    return { reportRecoverableFailure() {} };
  }
  return originalLoad(request, parent, isMain);
};

function compileTypescript(module, filename) {
  let source = fs.readFileSync(filename, 'utf8');
  if (path.resolve(filename) === path.resolve(mapRendererPath)) {
    source = source.replace('function makeMapHtml(', 'export function makeMapHtml(');
  }
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
require.extensions['.tsx'] = compileTypescript;

const builder = require(path.join(root, 'lib', 'navigatePointRouteBuilder.ts'));
const snapFinalization = require(path.join(root, 'lib', 'routeBuilderSnapFinalization.ts'));
const {
  buildMapOverlayPayloadPatch,
  buildRouteBuilderFallbackOverlay,
  buildWebPayload,
  makeMapHtml,
} = require(mapRendererPath);

function addPoint(draft, latitude, longitude, availableSegments = []) {
  return builder.addAnchorToDraft(draft, {
    coordinate: { latitude, longitude },
    availableSegments,
  }).draft;
}

const emptyDraft = builder.createNavigateRouteDraft();
const pointADraft = addPoint(emptyDraft, 40, -120);
assert.strictEqual(
  builder.buildRouteBuilderPresentationSegmentsFromDraft(pointADraft).length,
  0,
  'A single valid draft point should not fabricate line geometry.',
);

const pointBDraft = addPoint(pointADraft, 40.1, -120.1);
const twoPointPresentation = builder.buildRouteBuilderPresentationSegmentsFromDraft(pointBDraft);
assert.strictEqual(twoPointPresentation.length, 1, 'The first valid point pair should produce a visible draft line.');
assert.deepStrictEqual(
  twoPointPresentation[0].coordinates,
  [[-120, 40], [-120.1, 40.1]],
  'Draft geometry must preserve GeoJSON longitude/latitude order and operator point order.',
);
assert.strictEqual(twoPointPresentation[0].geometryRole, 'raw_user_draft');
assert.strictEqual(twoPointPresentation[0].snapStatus, 'blocked');
assert.strictEqual(twoPointPresentation[0].provisional, true);
assert.strictEqual(
  builder.buildRouteBuilderSegmentsFromDraft(pointBDraft).length,
  0,
  'A visible raw draft must remain excluded from the verified save projection.',
);
assert.strictEqual(
  snapFinalization.canSaveRouteBuilderSegments(twoPointPresentation),
  false,
  'A raw user draft must never become guidance-ready merely because it is drawable.',
);

const pointCDraft = addPoint(pointBDraft, 40.2, -120.2);
const threePointPresentation = builder.buildRouteBuilderPresentationSegmentsFromDraft(pointCDraft);
assert.strictEqual(threePointPresentation.length, 2, 'Additional points should update the visible draft immediately.');
assert.deepStrictEqual(threePointPresentation[1].coordinates.at(-1), [-120.2, 40.2]);

let history = builder.createNavigateRouteDraftHistory(emptyDraft);
history = builder.recordNavigateRouteDraft(history, pointADraft);
history = builder.recordNavigateRouteDraft(history, pointBDraft);
history = builder.recordNavigateRouteDraft(history, pointCDraft);
const undoneHistory = builder.undoNavigateRouteDraftHistory(history);
assert.strictEqual(
  builder.buildRouteBuilderPresentationSegmentsFromDraft(undoneHistory.present).length,
  1,
  'Undo should remove the latest visible draft leg.',
);
const redoneHistory = builder.redoNavigateRouteDraftHistory(undoneHistory);
assert.deepStrictEqual(
  builder.buildRouteBuilderPresentationSegmentsFromDraft(redoneHistory.present),
  threePointPresentation,
  'Redo should restore the same visible draft geometry.',
);
assert.strictEqual(
  builder.buildRouteBuilderPresentationSegmentsFromDraft(builder.clearNavigateRouteDraft(pointCDraft)).length,
  0,
  'Clear or cancel cleanup should remove all presentation geometry.',
);

const invalidResult = builder.addAnchorToDraft(pointBDraft, {
  coordinate: { latitude: 91, longitude: -120.2 },
  availableSegments: [],
});
assert.strictEqual(invalidResult.draft, pointBDraft, 'Invalid points should not mutate the draft.');

const endpointClampSegment = {
  id: 'endpoint-clamp-road',
  coordinates: [
    { latitude: 38, longitude: -110 },
    { latitude: 38, longitude: -109.99 },
  ],
  provider: 'rendered_features',
  confidence: 'high',
};
let endpointClampDraft = addPoint(
  builder.createNavigateRouteDraft(),
  38,
  -110.0001,
  [endpointClampSegment],
);
endpointClampDraft = addPoint(endpointClampDraft, 38, -110.0002, [endpointClampSegment]);
assert.strictEqual(endpointClampDraft.legs.length, 1);
assert.strictEqual(
  endpointClampDraft.legs[0].status,
  'blocked',
  'Two taps that clamp to one provider endpoint must not become a one-coordinate snapped leg.',
);
assert.match(endpointClampDraft.legs[0].unavailableReason, /farther along/i);
assert.strictEqual(
  builder.buildRouteBuilderPresentationSegmentsFromDraft(endpointClampDraft).length,
  1,
  'A collapsed provider projection must retain a visible provisional operator leg.',
);
assert.strictEqual(
  builder.isNavigateRouteDraftFullyLinked(endpointClampDraft),
  false,
  'A draft with a collapsed provider projection must remain ineligible for save or guidance.',
);
const endpointClampThenValidDraft = addPoint(
  endpointClampDraft,
  38,
  -109.995,
  [endpointClampSegment],
);
assert.strictEqual(builder.buildRouteBuilderSegmentsFromDraft(endpointClampThenValidDraft).length, 1);
assert.strictEqual(
  builder.isNavigateRouteDraftFullyLinked(endpointClampThenValidDraft),
  false,
  'A later valid leg must not make a route saveable while an earlier waypoint leg is still provisional.',
);
const duplicateTap = builder.addAnchorToDraft(pointADraft, {
  coordinate: pointADraft.anchors[0].coordinate,
  availableSegments: [],
});
assert.strictEqual(duplicateTap.draft, pointADraft, 'A duplicate drop should not create an invisible waypoint or zero-length leg.');

const snappedGeometry = [
  { latitude: 38, longitude: -110 },
  { latitude: 38.01, longitude: -110.01 },
  { latitude: 38.02, longitude: -110.02 },
];
const snappedSegment = {
  id: 'ecs-segment-1',
  name: 'ECS planning geometry',
  coordinates: snappedGeometry,
  confidence: 'high',
  dataState: 'cached',
};
let snappedDraft = builder.createNavigateRouteDraft();
snappedDraft = addPoint(snappedDraft, 38, -110, [snappedSegment]);
snappedDraft = addPoint(snappedDraft, 38.02, -110.02, [snappedSegment]);
const snappedPresentation = builder.buildRouteBuilderPresentationSegmentsFromDraft(snappedDraft);
assert.strictEqual(snappedPresentation[0].geometryRole, 'snapped_draft');
assert.strictEqual(snappedPresentation[0].provisional, false);
assert.strictEqual(builder.buildRouteBuilderSegmentsFromDraft(snappedDraft).length, 1);
const conflictExitDraft = builder.clearNavigateRouteDraft(pointBDraft);
const reactivatedWithRouteGeometry = [
  ...builder.buildRouteBuilderPresentationSegmentsFromDraft(conflictExitDraft),
  ...snappedPresentation,
];
assert.deepStrictEqual(
  reactivatedWithRouteGeometry.map((segment) => segment.coordinates),
  snappedPresentation.map((segment) => segment.coordinates),
  'A conflicting-mode exit must not let an old raw A-B draft contaminate a later route-geometry builder session.',
);

const inactivePayload = buildWebPayload({
  mapboxToken: 'token',
  routeBuilderActive: false,
  routeBuilderMode: 'anchor_trace',
});
const drawingPayload = buildWebPayload({
  mapboxToken: 'token',
  routeBuilderActive: true,
  routeBuilderMode: 'anchor_trace',
  routeBuilderSegments: twoPointPresentation,
  routeBuilderAnchors: pointBDraft.anchors,
});
assert.deepStrictEqual(drawingPayload.routeCoords, [], 'Draft drawing must not require preview route geometry.');
assert.strictEqual(drawingPayload.routeBuilderSegments.length, 1);
assert.strictEqual(drawingPayload.routeBuilderSegments[0].geometryRole, 'raw_user_draft');

const routeBuilderPaintBlock = mapRendererSource.slice(
  mapRendererSource.indexOf("map.setPaintProperty(\n            'route-builder-layer'"),
  mapRendererSource.indexOf('          );', mapRendererSource.indexOf("map.setPaintProperty(\n            'route-builder-layer'")),
);
const routeBuilderDashSource = routeBuilderPaintBlock.match(/^\s*(\['case'.+\])\s*$/m)?.[1];
assert(routeBuilderDashSource, 'The mounted route-builder layer must define its provisional dash expression.');
const routeBuilderDashExpression = vm.runInNewContext(routeBuilderDashSource);
const dashStyleErrors = styleSpec.validate({
  version: 8,
  sources: {
    'route-builder-source': {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    },
  },
  layers: [{
    id: 'route-builder-layer',
    type: 'line',
    source: 'route-builder-source',
    paint: { 'line-dasharray': routeBuilderDashExpression },
  }],
});
assert.deepStrictEqual(
  dashStyleErrors.map((error) => error.message),
  [],
  'The actual MapRenderer draft dash expression must pass the bundled Mapbox style specification.',
);

const drawingPatch = buildMapOverlayPayloadPatch(inactivePayload, drawingPayload);
assert(drawingPatch?.patchFamilies.includes('routeBuilder'), 'A two-point draft should cross the live route-builder patch family.');
assert.strictEqual(drawingPatch.routeBuilderActive, true, 'Style replay state should retain active drawing mode.');
assert.strictEqual(drawingPatch.routeBuilderSegments?.length, 1);
const replayPayload = { ...inactivePayload, ...drawingPatch };
assert.strictEqual(replayPayload.routeBuilderActive, true, 'A replay snapshot must not reactivate stale inactive state.');
assert.strictEqual(replayPayload.routeBuilderSegments.length, 1, 'A replay snapshot must retain draft geometry.');

const fallbackOverlay = buildRouteBuilderFallbackOverlay(drawingPayload);
assert.strictEqual(fallbackOverlay.segments.length, 1, 'The fallback renderer should receive the draft before preview.');
assert.strictEqual(fallbackOverlay.segments[0].provisional, true, 'Raw fallback geometry should stay visually provisional.');
assert.deepStrictEqual(fallbackOverlay.markers.map((marker) => marker.mapChar), ['A', 'B']);

const mapHtml = makeMapHtml(
  'pk.route-builder-test',
  'mapbox://styles/mapbox/dark-v11',
  [],
  1,
  'navigate',
);
const inlineMapScript = mapHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(inlineMapScript, 'MapRenderer should emit its mounted inline Mapbox runtime.');
const optimisticFeedbackStart = inlineMapScript.indexOf(
  'function nextRouteBuilderAnchorLabel()',
);
const optimisticFeedbackEnd = inlineMapScript.indexOf(
  'function buildRenderedRouteableTraceNetworkAtPoint(point)',
  optimisticFeedbackStart,
);
assert(
  optimisticFeedbackStart >= 0 && optimisticFeedbackEnd > optimisticFeedbackStart,
  'The mounted map runtime must include immediate route-builder point feedback.',
);
const optimisticFeedbackSource = inlineMapScript.slice(
  optimisticFeedbackStart,
  optimisticFeedbackEnd,
);
const optimisticFeedbackContext = {
  routeBuilderActive: true,
  routeBuilderAnchors: [],
  routeBuilderDraftSegments: [],
  routeBuilderLastAnchorTapCoordinate: null,
  routeBuilderColor: '#65F0D4',
  snapshots: [],
  Date: { now: () => 1700000000000 },
  routeBuilderAnchorCoordinate(anchor) {
    const coordinate = anchor?.coordinate ?? anchor;
    const latitude = Number(coordinate?.latitude);
    const longitude = Number(coordinate?.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : null;
  },
  updateRouteBuilder(segments, color, anchors) {
    optimisticFeedbackContext.snapshots.push({
      segments: JSON.parse(JSON.stringify(segments)),
      anchors: JSON.parse(JSON.stringify(anchors)),
      color,
    });
  },
};
vm.runInNewContext(
  `${optimisticFeedbackSource}\n` +
    'appendOptimisticRouteBuilderAnchorFeedback({ latitude: 40, longitude: -120 });' +
    'appendOptimisticRouteBuilderAnchorFeedback({ latitude: 40.1, longitude: -120.1 });' +
    'appendOptimisticRouteBuilderAnchorFeedback({ latitude: 40.2, longitude: -120.2 });',
  optimisticFeedbackContext,
);
assert.deepStrictEqual(
  Array.from(optimisticFeedbackContext.routeBuilderAnchors, (anchor) => anchor.label),
  ['A', 'B', 'C'],
  'Each dropped route point should receive immediate, ordered visual feedback.',
);
assert.strictEqual(
  optimisticFeedbackContext.routeBuilderDraftSegments.length,
  2,
  'Three dropped points should immediately draw two connected provisional legs.',
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(optimisticFeedbackContext.routeBuilderDraftSegments[0].coordinates)),
  [[-120, 40], [-120.1, 40.1]],
  'Immediate feedback must preserve GeoJSON longitude/latitude order.',
);
const liveSourceUpdateStart = inlineMapScript.indexOf('function updateRouteBuilder(segments, color, anchors)');
const liveSourceUpdateEnd = inlineMapScript.indexOf(
  'function updateRouteProfileFocus(focus)',
  liveSourceUpdateStart,
);
assert(liveSourceUpdateStart >= 0 && liveSourceUpdateEnd > liveSourceUpdateStart);
const liveSourceContext = {
  routeBuilderAnchors: optimisticFeedbackContext.routeBuilderAnchors,
  routeBuilderColor: '#65F0D4',
  sources: {},
  featureCollection(features) { return { type: 'FeatureCollection', features }; },
  lineFeature(id, coordinates, properties) {
    return { type: 'Feature', id, properties, geometry: { type: 'LineString', coordinates } };
  },
  pointFeature(id, coordinates, properties) {
    return { type: 'Feature', id, properties, geometry: { type: 'Point', coordinates } };
  },
  setGeoJson(id, data) { liveSourceContext.sources[id] = data; },
  isFinite: Number.isFinite,
};
vm.runInNewContext(
  `${inlineMapScript.slice(liveSourceUpdateStart, liveSourceUpdateEnd)}\n` +
    `updateRouteBuilder(${JSON.stringify(optimisticFeedbackContext.routeBuilderDraftSegments)}, '#65F0D4', ${JSON.stringify(optimisticFeedbackContext.routeBuilderAnchors)});`,
  liveSourceContext,
);
assert.strictEqual(
  liveSourceContext.sources['route-builder-source'].features.length,
  2,
  'The mounted live GeoJSON source should contain one visual line for each dropped waypoint leg.',
);
assert.deepStrictEqual(
  Array.from(
    liveSourceContext.sources['route-builder-endpoint-source'].features,
    (feature) => feature.properties.label,
  ),
  ['A', 'B', 'C'],
  'The mounted live endpoint source should contain every dropped waypoint label.',
);
assert(
  inlineMapScript.includes("id: 'route-builder-anchor-label-layer'") &&
    inlineMapScript.includes("'text-field': ['coalesce', ['get', 'label'], '']"),
  'The live Mapbox source must render visible A/B/C labels, not only unlabeled endpoint dots.',
);

const pendingPatchStart = inlineMapScript.indexOf('function mergePendingOverlayPatch(base, patch)');
const pendingPatchEnd = inlineMapScript.indexOf(
  'function applyGuidanceRoutePayload(payload)',
  pendingPatchStart,
);
assert(pendingPatchStart >= 0 && pendingPatchEnd > pendingPatchStart);
const pendingPatchContext = {
  map: { isStyleLoaded: () => false },
  styleGeneration: 4,
  lastReplayedStyleGeneration: 4,
  pendingOverlayPatch: null,
  appliedPatches: [],
  applyPayloadPatch(patch) {
    pendingPatchContext.appliedPatches.push(JSON.parse(JSON.stringify(patch)));
  },
};
vm.runInNewContext(
  `${inlineMapScript.slice(pendingPatchStart, pendingPatchEnd)}\n` +
    "pendingOverlayPatch = mergePendingOverlayPatch(pendingOverlayPatch, { patchFamilies: ['routeBuilder'], routeBuilderAnchors: [{ label: 'A' }] });" +
    "pendingOverlayPatch = mergePendingOverlayPatch(pendingOverlayPatch, { patchFamilies: ['routeBuilder'], routeBuilderAnchors: [{ label: 'A' }, { label: 'B' }], routeBuilderSegments: [{ id: 'AB' }] });" +
    'flushPendingOverlayPatch();',
  pendingPatchContext,
);
assert.strictEqual(
  pendingPatchContext.appliedPatches.length,
  1,
  'A same-style route-builder patch must apply even while unrelated Mapbox sources are loading.',
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(pendingPatchContext.appliedPatches[0].routeBuilderAnchors.map((anchor) => anchor.label))),
  ['A', 'B'],
  'Coalesced source-busy patches must apply the latest waypoint set instead of losing point B.',
);
assert.strictEqual(pendingPatchContext.appliedPatches[0].routeBuilderSegments.length, 1);

const previewPayload = buildWebPayload({
  mapboxToken: 'token',
  routeRenderMode: 'preview',
  points: [{ lat: 39, lng: -111 }, { lat: 39.1, lng: -111.1 }],
  routeBuilderActive: true,
  routeBuilderMode: 'anchor_trace',
  routeBuilderSegments: snappedPresentation,
  routeBuilderAnchors: snappedDraft.anchors,
});
assert.strictEqual(previewPayload.routeGeometryRole, 'preview_route');
assert.strictEqual(previewPayload.routeCoords.length, 2);
assert.strictEqual(previewPayload.routeBuilderSegments.length, 1, 'Preview must not replace or duplicate the draft source.');

const activeGuidancePayload = buildWebPayload({
  mapboxToken: 'token',
  routeRenderMode: 'active',
  points: [{ lat: 39, lng: -111 }, { lat: 39.1, lng: -111.1 }],
  routeBuilderActive: true,
  routeBuilderMode: 'anchor_trace',
  routeBuilderSegments: twoPointPresentation,
  routeBuilderAnchors: pointBDraft.anchors,
});
assert.strictEqual(activeGuidancePayload.routeGeometryRole, 'active_guidance_route');
assert.strictEqual(activeGuidancePayload.routeCoords.length, 2);
assert.strictEqual(activeGuidancePayload.routeBuilderSegments.length, 1, 'Active guidance and draft geometry must coexist.');

const finalizedPayload = buildWebPayload({
  mapboxToken: 'token',
  routeRenderMode: 'selected',
  points: [{ lat: 39, lng: -111 }, { lat: 39.1, lng: -111.1 }],
});
assert.strictEqual(finalizedPayload.routeGeometryRole, 'finalized_route');

const styleReloadPayload = buildWebPayload({
  mapboxToken: 'token',
  mapStyle: 'satellite',
  routeBuilderActive: true,
  routeBuilderMode: 'anchor_trace',
  routeBuilderSegments: twoPointPresentation,
  routeBuilderAnchors: pointBDraft.anchors,
});
assert.deepStrictEqual(
  styleReloadPayload.routeBuilderSegments,
  drawingPayload.routeBuilderSegments,
  'Map style or orientation-driven payload rebuilds should preserve the draft source data.',
);
assert.deepStrictEqual(
  buildRouteBuilderFallbackOverlay(styleReloadPayload),
  fallbackOverlay,
  'Fallback projection should remain stable across map presentation rebuilds.',
);

const cancelledPayload = buildWebPayload({
  mapboxToken: 'token',
  routeBuilderActive: false,
  routeBuilderMode: 'anchor_trace',
  routeBuilderSegments: [],
  routeBuilderAnchors: [],
});
const cancelPatch = buildMapOverlayPayloadPatch(drawingPayload, cancelledPayload);
assert.strictEqual(cancelPatch.routeBuilderActive, false);
assert.deepStrictEqual(cancelPatch.routeBuilderSegments, []);
assert.deepStrictEqual(cancelPatch.routeBuilderAnchors, []);
assert(
  mapRendererSource.includes('routeBuilderAnchors = routeBuilderPayloadActive ? (payload.routeBuilderAnchors || []) : [];') &&
    mapRendererSource.includes('routeBuilderDraftSegments = [];'),
  'An inactive live route-builder payload must clear presentation geometry even before dynamic-state cleanup runs.',
);

const navigateSource = fs.readFileSync(navigatePath, 'utf8');
assert(
  navigateSource.includes('buildRouteBuilderPresentationSegmentsFromDraft(routeBuilderDraft)') &&
    navigateSource.includes('routeBuilderSegments={routeBuilderMapSegments}'),
  'The mounted Navigate screen must pass presentation geometry—not only savable geometry—to MapRenderer.',
);
const mountedBuilderControls = navigateSource.slice(
  navigateSource.indexOf('{routeBuilderActive ? ('),
  navigateSource.indexOf('{renderMapPopup(', navigateSource.indexOf('{routeBuilderActive ? (')),
);
assert(
  mountedBuilderControls.includes('onPress={redoLastRouteBuilderSegment}') &&
    mountedBuilderControls.includes('REDO'),
  'Redo must be reachable from the mounted Draw Route controls.',
);
const campScoutExitBlock = navigateSource.slice(
  navigateSource.indexOf('const startCampScoutDrawing = useCallback(() => {'),
  navigateSource.indexOf('const saveCampsiteDrawing', navigateSource.indexOf('const startCampScoutDrawing = useCallback(() => {')),
);
assert(
  campScoutExitBlock.includes('resetBuildRouteDraft({ clearDesignContext: true });'),
  'Starting the conflicting Camp Scout drawing mode must reset draft state and history, not only hide its source.',
);
const navigationConflictExitBlock = navigateSource.slice(
  navigateSource.indexOf('if (!roadNavigationActive && !trailNavigationActive && !pendingHybridTrailTransition) return;'),
  navigateSource.indexOf('useFocusEffect(', navigateSource.indexOf('if (!roadNavigationActive && !trailNavigationActive && !pendingHybridTrailTransition) return;')),
);
assert(
  navigationConflictExitBlock.includes('resetBuildRouteDraft();'),
  'Starting an incompatible navigation lifecycle must clear the draft before it can be reactivated.',
);
const focusExitBlock = navigateSource.slice(
  navigateSource.indexOf('useFocusEffect(', navigateSource.indexOf('if (!roadNavigationActive && !trailNavigationActive && !pendingHybridTrailTransition) return;')),
  navigateSource.indexOf('const runToolsAction', navigateSource.indexOf('useFocusEffect(', navigateSource.indexOf('if (!roadNavigationActive && !trailNavigationActive && !pendingHybridTrailTransition) return;'))),
);
assert(
  focusExitBlock.includes('resetBuildRouteDraft();'),
  'Leaving Navigate must clear the draft state, history, and in-flight snapping work.',
);

console.log('Route builder draft visibility checks passed.');
