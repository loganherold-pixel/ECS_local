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

const {
  buildDynamicPayload,
  buildMapBridgeBatchMessage,
  buildMapOverlayPayloadPatch,
  buildMapOverlayPayloadHash,
  buildWebPayload,
  makeMapHtml,
  mergeMapOverlayPayloadPatches,
  normalizeRenderedCampScoutMarkers,
} = require(mapRendererPath);

const mapHtml = makeMapHtml(
  'pk.syntax-test',
  'mapbox://styles/mapbox/dark-v11',
  [],
  1,
  'navigate',
);
const inlineMapScript = mapHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(inlineMapScript, 'MapRenderer should emit its inline Mapbox runtime script.');
assert.doesNotThrow(
  () => new Function(inlineMapScript),
  'The generated Mapbox runtime script must remain syntactically valid.',
);

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
  showTrailEntryEndpointMarker: true,
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
  ['Trail entry', 'Trail end'],
  'Renderer should synthesize trail entry/end route markers and dedupe destination markers at the same coordinate.',
);

const roadOnlyActiveRoute = buildWebPayload({
  mapboxToken: 'token',
  routeRenderMode: 'active',
  points: [
    { lat: 39.11, lng: -120.11 },
    { lat: 39.2, lng: -120.2 },
  ],
  userLocation: { lat: 39.11, lng: -120.11 },
  showUserLocation: true,
});
assert.deepStrictEqual(
  roadOnlyActiveRoute.waypoints.map((waypoint) => waypoint.title),
  ['Trail end'],
  'Road-only active guidance should not label the user GPS route start as Trail entry.',
);
assert.strictEqual(
  roadOnlyActiveRoute.waypoints[0]?.endpointRole,
  'trail_end',
  'Road-only active guidance should preserve the tappable trail-end marker.',
);

const approachActiveRoute = buildWebPayload({
  mapboxToken: 'token',
  routeRenderMode: 'active',
  showTrailEntryEndpointMarker: true,
  points: [
    { lat: 39.11, lng: -120.11 },
    { lat: 39.2, lng: -120.2 },
  ],
  userLocation: { lat: 39.11, lng: -120.11 },
  showUserLocation: true,
});
assert.deepStrictEqual(
  approachActiveRoute.waypoints.map((waypoint) => waypoint.title),
  ['Trail entry', 'Trail end'],
  'Approach active guidance should keep the translucent trail-entry endpoint for GPS-to-trailhead routing.',
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

const longActiveRoutePoints = Array.from({ length: 5000 }, (_, index) => ({
  lat: 39.1 + index * 0.00004,
  lng: -120.1 + Math.sin(index / 18) * 0.004 + index * 0.00003,
}));
const longActiveCompactRoute = buildWebPayload({
  mapboxToken: 'token',
  surfaceMode: 'compact',
  routeRenderMode: 'active',
  points: longActiveRoutePoints,
  userLocation: longActiveRoutePoints[0],
  showUserLocation: true,
});
assert.ok(
  longActiveCompactRoute.routeCoords.length <= 512,
  'Compact active guidance should send a bounded route line to the WebView for long road routes.',
);
assert.deepStrictEqual(
  longActiveCompactRoute.routeCoords[0],
  [longActiveRoutePoints[0].lng, longActiveRoutePoints[0].lat],
  'Bounded compact active guidance route rendering should preserve the route start.',
);
assert.deepStrictEqual(
  longActiveCompactRoute.routeCoords[longActiveCompactRoute.routeCoords.length - 1],
  [
    longActiveRoutePoints[longActiveRoutePoints.length - 1].lng,
    longActiveRoutePoints[longActiveRoutePoints.length - 1].lat,
  ],
  'Bounded compact active guidance route rendering should preserve the route end.',
);

const activeProgressRoute = buildWebPayload({
  mapboxToken: 'token',
  routeRenderMode: 'active',
  points: [
    { lat: 39.1, lng: -120.1 },
    { lat: 39.2, lng: -120.2 },
  ],
  progressPoints: [
    { lat: 39.1, lng: -120.1 },
    { lat: 39.10001, lng: -120.10001 },
  ],
});
assert.deepStrictEqual(
  activeProgressRoute.progressRouteCoords.at(-1),
  activeProgressRoute.routeCoords[0],
  'Mounted MapRenderer completed and remaining guidance sources should meet at one canonical split point.',
);
const smallProgressNudgeRoute = buildWebPayload({
  mapboxToken: 'token',
  routeRenderMode: 'active',
  points: [
    { lat: 39.1, lng: -120.1 },
    { lat: 39.2, lng: -120.2 },
  ],
  progressPoints: [
    { lat: 39.1, lng: -120.1 },
    { lat: 39.10004, lng: -120.10004 },
  ],
});
assert.strictEqual(
  buildMapOverlayPayloadHash(activeProgressRoute),
  buildMapOverlayPayloadHash(smallProgressNudgeRoute),
  'Sub-threshold active progress-line movement should not resend route-family geometry over the WebView bridge.',
);
const meaningfulProgressRoute = buildWebPayload({
  mapboxToken: 'token',
  routeRenderMode: 'active',
  points: [
    { lat: 39.1, lng: -120.1 },
    { lat: 39.2, lng: -120.2 },
  ],
  progressPoints: [
    { lat: 39.1, lng: -120.1 },
    { lat: 39.1002, lng: -120.1002 },
  ],
});
assert.notStrictEqual(
  buildMapOverlayPayloadHash(activeProgressRoute),
  buildMapOverlayPayloadHash(meaningfulProgressRoute),
  'Meaningful active progress-line movement should still update the progress geometry.',
);

const dynamicPayload = buildDynamicPayload({
  userLocation: { lat: 39.100001, lng: -120.100001 },
  showUserLocation: true,
  vehicleHeading: 90.2,
  motionPriority: 'hot',
  cameraMode: 'follow_user',
});
const dynamicPayloadJitter = buildDynamicPayload({
  userLocation: { lat: 39.100004, lng: -120.100004 },
  showUserLocation: true,
  vehicleHeading: 90.4,
  motionPriority: 'hot',
  cameraMode: 'follow_user',
});
assert.deepStrictEqual(
  dynamicPayload,
  dynamicPayloadJitter,
  'Sub-meter GPS and sub-degree heading jitter should not create a new dynamicState bridge payload.',
);
const dynamicPayloadMoved = buildDynamicPayload({
  userLocation: { lat: 39.10008, lng: -120.10008 },
  showUserLocation: true,
  vehicleHeading: 94,
  motionPriority: 'hot',
  cameraMode: 'follow_user',
});
assert.notDeepStrictEqual(
  dynamicPayload,
  dynamicPayloadMoved,
  'Meaningful GPS or heading movement should still update the dynamic map state.',
);

assert.deepStrictEqual(
  buildMapBridgeBatchMessage([{ type: 'dynamicState', payload: dynamicPayload }]),
  { type: 'dynamicState', payload: dynamicPayload },
  'Single hot bridge messages should inject without a wrapper.',
);
assert.deepStrictEqual(
  buildMapBridgeBatchMessage([
    { type: 'overlayPatch', payload: { patchFamilies: ['presentation'], showCrosshair: true } },
    { type: 'dynamicState', payload: dynamicPayloadMoved },
    { type: 'cameraCommand', payload: { mode: 'follow_user', center: dynamicPayloadMoved.userLocation } },
  ]),
  {
    type: 'bridgeBatch',
    messages: [
      { type: 'overlayPatch', payload: { patchFamilies: ['presentation'], showCrosshair: true } },
      { type: 'dynamicState', payload: dynamicPayloadMoved },
      { type: 'cameraCommand', payload: { mode: 'follow_user', center: dynamicPayloadMoved.userLocation } },
    ],
  },
  'Same-frame hot bridge work should batch into one WebView injection while preserving message order.',
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
const routePatch = buildMapOverlayPayloadPatch(activeRoute, changedRoute);
assert.ok(routePatch, 'Meaningful route geometry changes should produce a bridge patch after bootstrap.');
assert.ok(
  routePatch.patchFamilies.includes('route'),
  'Route geometry changes should mark the route patch family.',
);
assert.ok(
  Array.isArray(routePatch.routeCoords) && routePatch.routeCoords.length > 1,
  'Route geometry patches should include the next route coordinates.',
);

const campSearchChangedRoute = buildWebPayload({
  mapboxToken: 'token',
  routeRenderMode: 'active',
  points: [
    { lat: 39.1, lng: -120.1 },
    { lat: 39.2, lng: -120.2 },
  ],
  userLocation: { lat: 39.12, lng: -120.12 },
  showUserLocation: true,
  campEndpointMarkers: [
    {
      id: 'camp-bridge-1',
      latitude: 39.16,
      longitude: -120.16,
      title: 'Camp Bridge',
      sourceType: 'ecs_inferred',
      confidenceGrade: 'B',
      confidenceScore: 78,
      pinFamily: 'campops',
      campOpsRole: 'candidate',
      campOpsCandidateId: 'camp-bridge-1',
      campOpsRoleLabel: 'Camp Bridge',
    },
  ],
  campsiteSearchPolygon: {
    closed: true,
    coordinates: [
      { latitude: 39.13, longitude: -120.13 },
      { latitude: 39.14, longitude: -120.13 },
      { latitude: 39.14, longitude: -120.14 },
    ],
  },
});
const campSearchPatch = buildMapOverlayPayloadPatch(activeRoute, campSearchChangedRoute);
assert.ok(campSearchPatch, 'Camp/search overlay changes should produce a bridge patch after bootstrap.');
assert.ok(
  campSearchPatch.patchFamilies.includes('markers') &&
    campSearchPatch.patchFamilies.includes('campSearch'),
  'Camp/search overlay changes should mark marker and camp-search patch families.',
);
assert.ok(
  !Object.prototype.hasOwnProperty.call(campSearchPatch, 'routeCoords') &&
    !Object.prototype.hasOwnProperty.call(campSearchPatch, 'progressRouteCoords') &&
    !Object.prototype.hasOwnProperty.call(campSearchPatch, 'segments'),
  'Camp/search overlay patches must not resend route geometry or segment payloads.',
);

const mergedPatch = mergeMapOverlayPayloadPatches(
  {
    patchFamilies: ['markers'],
    pins: [{ id: 'pin-1', latitude: 39.12, longitude: -120.12, title: 'Pin 1' }],
  },
  {
    patchFamilies: ['route', 'presentation'],
    routeCoords: [[-120.1, 39.1], [-120.2, 39.2]],
    showCrosshair: true,
  },
);
assert.deepStrictEqual(
  mergedPatch.patchFamilies,
  ['markers', 'route', 'presentation'],
  'Merged overlay patches should preserve every changed family in frame order.',
);
assert.ok(
  Array.isArray(mergedPatch.pins) &&
    Array.isArray(mergedPatch.routeCoords) &&
    mergedPatch.showCrosshair === true,
  'Merged overlay patches should retain marker, route, and presentation payload fields.',
);

const styleChangedRoute = buildWebPayload({
  mapboxToken: 'token',
  mapStyle: 'satellite',
  routeRenderMode: 'active',
  points: [
    { lat: 39.1, lng: -120.1 },
    { lat: 39.2, lng: -120.2 },
  ],
});
assert.strictEqual(
  buildMapOverlayPayloadPatch(activeRoute, styleChangedRoute),
  null,
  'Map style changes should keep using a full update so style replay has a complete payload.',
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
    mapRendererSource.includes('ACTIVE_GUIDANCE_ROUTE_PROGRESS_LAYER_ID') &&
    mapRendererSource.includes('promoteRouteGuidanceLayers();'),
  'MapRenderer should re-promote active route guidance layers after camp/search overlay updates.',
);
const promotionBlock = mapRendererSource.slice(
  mapRendererSource.indexOf('function promoteRouteGuidanceLayers()'),
  mapRendererSource.indexOf('function removeDispersedCampingEligibilityLayer()'),
);
assert(
  promotionBlock.indexOf("'trail-layer'") < promotionBlock.indexOf('ACTIVE_GUIDANCE_ROUTE_LAYER_ID') &&
    promotionBlock.indexOf('ACTIVE_GUIDANCE_ROUTE_LAYER_ID') <
      promotionBlock.indexOf('ACTIVE_GUIDANCE_ROUTE_PROGRESS_LAYER_ID'),
  'Raw breadcrumb trails should remain below the canonical guidance line, with completed progress above both.',
);
assert(
  mapRendererSource.includes('function markerPayloadChanged(key, items)') &&
    mapRendererSource.includes("markerPayloadChanged('campScoutPins'") &&
    mapRendererSource.includes('buildCampLayerHash') &&
    mapRendererSource.includes('buildFeatureCollectionSummaryHash'),
  'MapRenderer should avoid re-rendering unchanged camp pins or stringifying full camp GeoJSON on every active-guidance update.',
);
assert(
  mapRendererSource.includes("new Set(['dynamicState', 'cameraCommand', 'overlayPatch'])") &&
    mapRendererSource.includes('mergeMapOverlayPatchMessages(existingMessage, message)'),
  'MapRenderer should coalesce and merge overlay patches before injecting them into the WebView.',
);
assert(
  navigateSource.includes('routeRenderMode={displayedRouteRenderMode}') &&
    navigateSource.includes("if (navigationOverlayMode === 'preview') return 'preview';") &&
    navigateSource.includes("if (navigationOverlayMode === 'preview') return '#65D4FF';"),
  'Navigate should pass the route render mode and preview color into MapRenderer.',
);

console.log('Map route rendering overlay checks passed.');
