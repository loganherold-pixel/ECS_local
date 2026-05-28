const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const mapRendererPath = path.join(root, 'components', 'navigate', 'MapRenderer.tsx');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');

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

const {
  buildMapOverlayPayloadHash,
  buildWebPayload,
  normalizeRenderedCampScoutMarkers,
} = require(mapRendererPath);

const collapsedRoute = buildWebPayload({
  mapboxToken: 'token',
  points: [
    { lat: 39.1, lng: -120.1 },
    { lat: 39.1, lng: -120.1 },
  ],
});
assert.deepStrictEqual(
  collapsedRoute.routeCoords,
  [],
  'Collapsed or single-point route geometry should not render a stale route line.',
);
assert.deepStrictEqual(
  collapsedRoute.waypoints,
  [],
  'Collapsed route geometry should not synthesize start/end markers.',
);

const previewRoute = buildWebPayload({
  mapboxToken: 'token',
  routeRenderMode: 'preview',
  points: [
    { lat: 39.1, lng: -120.1 },
    { lat: 39.1, lng: -120.1 },
    { lat: 39.2, lng: -120.2 },
  ],
  waypoints: [
    { id: 'destination', latitude: 39.2, longitude: -120.2, title: 'Trailhead' },
  ],
});
assert.deepStrictEqual(
  previewRoute.routeCoords,
  [
    [-120.1, 39.1],
    [-120.2, 39.2],
  ],
  'Route geometry should remove adjacent duplicate coordinates but preserve order.',
);
assert.strictEqual(previewRoute.routeRenderMode, 'preview', 'Preview route render mode should cross the map bridge.');
assert.strictEqual(previewRoute.routeColor, '#65D4FF', 'Preview routes should use a distinct route color by default.');
assert.deepStrictEqual(
  previewRoute.waypoints.map((waypoint) => waypoint.title),
  ['Start', 'End'],
  'Renderer should synthesize start/end route markers and dedupe destination markers at the same coordinate.',
);

const activeRoute = buildWebPayload({
  mapboxToken: 'token',
  routeRenderMode: 'active',
  points: [
    { lat: 39.1, lng: -120.1 },
    { lat: 39.2, lng: -120.2 },
  ],
  userLocation: { lat: 39.11, lng: -120.11 },
  showUserLocation: true,
});
const movedUserRoute = buildWebPayload({
  mapboxToken: 'token',
  routeRenderMode: 'active',
  points: [
    { lat: 39.1, lng: -120.1 },
    { lat: 39.2, lng: -120.2 },
  ],
  userLocation: { lat: 39.12, lng: -120.12 },
  showUserLocation: true,
});
assert.strictEqual(
  buildMapOverlayPayloadHash(activeRoute),
  buildMapOverlayPayloadHash(movedUserRoute),
  'GPS/user-location updates should not resend the full route overlay payload.',
);

const changedRoute = buildWebPayload({
  mapboxToken: 'token',
  routeRenderMode: 'active',
  points: [
    { lat: 39.1, lng: -120.1 },
    { lat: 39.3, lng: -120.3 },
  ],
  userLocation: { lat: 39.12, lng: -120.12 },
  showUserLocation: true,
});
assert.notStrictEqual(
  buildMapOverlayPayloadHash(activeRoute),
  buildMapOverlayPayloadHash(changedRoute),
  'Meaningful route geometry changes should resend the route overlay payload.',
);

const campPins = normalizeRenderedCampScoutMarkers([
  {
    id: 'camp-1',
    latitude: 39.1,
    longitude: -120.1,
    title: 'Camp 1',
    sourceType: 'ecs_inferred',
    confidenceGrade: 'A',
    confidenceScore: 90,
    rank: 1,
    rankLabel: '1',
    pinFamily: 'campops',
    campOpsRole: 'candidate',
    campOpsCandidateId: 'camp-1',
    campOpsRoleLabel: 'Camp 1',
  },
  {
    id: 'camp-1',
    latitude: 39.1,
    longitude: -120.1,
    title: 'Camp 1 duplicate',
    sourceType: 'ecs_inferred',
    confidenceGrade: 'A',
    confidenceScore: 90,
    rank: 1,
    rankLabel: '1',
    pinFamily: 'campops',
    campOpsRole: 'candidate',
    campOpsCandidateId: 'camp-1',
    campOpsRoleLabel: 'Camp 1',
  },
]);
assert.strictEqual(campPins.length, 1, 'Duplicate CampOps route pins should not render twice on the map.');
assert.strictEqual(campPins[0].rankLabel, '1', 'Camp route pins should keep the ranked tent-pin label.');
assert.strictEqual(campPins[0].pinFamily, 'campops', 'CampOps pins should keep the shared remote camp pin style family.');

const mapRendererSource = fs.readFileSync(mapRendererPath, 'utf8');
const navigateSource = fs.readFileSync(navigatePath, 'utf8');

assert(
  mapRendererSource.includes('function applyRouteRenderMode(mode)') &&
    mapRendererSource.includes("normalizedMode === 'preview' ? [1.4, 1.2] : [1, 0]"),
  'MapRenderer should visually distinguish preview route lines from active route lines.',
);
assert(
  mapRendererSource.includes('function promoteRouteGuidanceLayers()') &&
    mapRendererSource.includes("'route-progress-layer'") &&
    mapRendererSource.includes('promoteRouteGuidanceLayers();'),
  'MapRenderer should re-promote active route guidance layers after camp/search overlay updates.',
);
assert(
  mapRendererSource.includes('function markerPayloadChanged(key, items)') &&
    mapRendererSource.includes("markerPayloadChanged('campScoutPins'") &&
    mapRendererSource.includes('buildCampLayerHash') &&
    mapRendererSource.includes('buildFeatureCollectionSummaryHash'),
  'MapRenderer should avoid re-rendering unchanged camp pins or stringifying full camp GeoJSON on every active-guidance update.',
);
assert(
  navigateSource.includes('routeRenderMode={displayedRouteRenderMode}') &&
    navigateSource.includes("if (navigationOverlayMode === 'preview') return 'preview';") &&
    navigateSource.includes("if (navigationOverlayMode === 'preview') return '#65D4FF';"),
  'Navigate should pass the route render mode and preview color into MapRenderer.',
);

console.log('Map route rendering overlay checks passed.');
