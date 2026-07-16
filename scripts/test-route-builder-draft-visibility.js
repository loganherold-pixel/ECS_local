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
require.extensions['.tsx'] = compileTypescript;

const builder = require(path.join(root, 'lib', 'navigatePointRouteBuilder.ts'));
const snapFinalization = require(path.join(root, 'lib', 'routeBuilderSnapFinalization.ts'));
const {
  buildMapOverlayPayloadPatch,
  buildRouteBuilderFallbackOverlay,
  buildWebPayload,
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
