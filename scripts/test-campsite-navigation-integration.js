const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const {
  buildRouteCampsiteLocatorInput,
  buildRouteCampsiteLocatorSignature,
} = require(path.join(__dirname, '..', 'lib', 'campsites', 'routeCampsiteLocatorAdapter.ts'));
const { analyzeRoute } = require(path.join(__dirname, '..', 'lib', 'routeAnalysisEngine.ts'));

const navigateSource = fs.readFileSync(
  path.join(__dirname, '..', 'app', '(tabs)', 'navigate.tsx'),
  'utf8',
);
const campsiteCandidateEngineSource = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'campsiteCandidateEngine.ts'),
  'utf8',
);

function assertSourceIncludes(fragment, message) {
  assert.ok(navigateSource.includes(fragment), message);
}

const noGeometryInput = buildRouteCampsiteLocatorInput({
  routeId: 'empty-route',
  routeName: 'Empty Route',
  sourceType: 'custom',
  routeCoordinates: [{ latitude: 39, longitude: -121 }],
});
assert.strictEqual(noGeometryInput, null, 'Route overview without valid geometry must not build locator input.');

const routeA = {
  routeId: 'route-a',
  routeName: 'Route A',
  sourceType: 'custom',
  routeCoordinates: [
    { latitude: 39, longitude: -121 },
    { latitude: 39.1, longitude: -120.9 },
  ],
};
const routeB = {
  ...routeA,
  routeId: 'route-b',
  routeName: 'Route B',
  routeCoordinates: [
    { latitude: 39, longitude: -121 },
    { latitude: 39.2, longitude: -120.8 },
  ],
};

const validInput = buildRouteCampsiteLocatorInput(routeA);
assert.ok(validInput, 'Route overview with valid route geometry must build locator input.');
assert.strictEqual(validInput.routeId, 'route-a', 'Route locator input should preserve route identity.');
assert.strictEqual(validInput.routeSourceType, 'custom', 'Route locator input should preserve route source type for roadway/trail camp filtering.');
assert.ok(
  Array.isArray(validInput.routeCoordinates) && validInput.routeCoordinates.length >= 2,
  'Route locator input should include normalized route geometry.',
);
assert.notStrictEqual(
  buildRouteCampsiteLocatorSignature(routeA),
  buildRouteCampsiteLocatorSignature(routeB),
  'Changing route identity or geometry must refresh campsite locator signature.',
);

const duplicateRoutePoints = [
  { lat: 39, lon: -121, ele_m: null },
  { lat: 39.1, lon: -120.9, ele_m: null },
];
const firstRouteAnalysis = analyzeRoute(duplicateRoutePoints, 'dup-route', 'Duplicate Route');
const secondRouteAnalysis = analyzeRoute(duplicateRoutePoints, 'dup-route', 'Duplicate Route');
assert.strictEqual(
  secondRouteAnalysis,
  firstRouteAnalysis,
  'Duplicate route analysis for unchanged geometry should reuse the existing analysis result.',
);

const longRouteCoordinates = Array.from({ length: 160 }, (_, index) => ({
  latitude: 39 + index * 0.012,
  longitude: -121 + index * 0.012,
  ele_m: 1524,
}));
const longRouteAnalysis = analyzeRoute(
  longRouteCoordinates.map((point) => ({ lat: point.latitude, lon: point.longitude, ele_m: point.ele_m })),
  'analysis-owner-route',
  'Analyzed Owner Route',
);
const handoffInput = buildRouteCampsiteLocatorInput({
  routeId: 'ui-handoff-owner',
  routeName: 'Analyzed Owner Route',
  sourceType: 'trail',
  routeCoordinates: longRouteCoordinates,
  routeIntelligence: longRouteAnalysis,
});
assert.ok(handoffInput, 'Route handoff with analyzed geometry should build locator input.');
assert.strictEqual(
  handoffInput.routeIntelligence.id,
  longRouteAnalysis.id,
  'Route campsite input should preserve the active routeIntelligenceId when the UI owner ID differs but geometry matches.',
);
assert.strictEqual(
  buildRouteCampsiteLocatorSignature({
    routeId: 'stable-owner-route',
    routeName: 'Analyzed Owner Route',
    sourceType: 'trail',
    routeCoordinates: longRouteCoordinates,
    routeIntelligence: { ...longRouteAnalysis, id: 'route-intel-a', analyzedAt: '2026-01-01T00:00:00.000Z' },
  }),
  buildRouteCampsiteLocatorSignature({
    routeId: 'stable-owner-route',
    routeName: 'Analyzed Owner Route',
    sourceType: 'trail',
    routeCoordinates: longRouteCoordinates,
    routeIntelligence: { ...longRouteAnalysis, id: 'route-intel-b', analyzedAt: '2026-01-01T00:01:00.000Z' },
  }),
  'Route campsite signatures should stay stable across equivalent route-intelligence IDs to avoid duplicate camp scans.',
);

assertSourceIncludes(
  'const routeOverviewCampsiteContext = useMemo<RouteCampsiteContext | null>',
  'Navigate must maintain a route overview campsite context.',
);
assertSourceIncludes(
  'buildRouteCampsiteLocatorInput(routeOverviewCampsiteContext)',
  'Route overview flow must normalize route context before locating campsites.',
);
assertSourceIncludes(
  'locateCampsiteResultForRoute(campOpsInput, { publish: false })',
  'Route overview flow must call the centralized route campsite locator.',
);
assertSourceIncludes(
  'CAMPOPS_ROUTE_PINS_ENABLED',
  'Route overview campsite locating should keep CampOps route pins behind the explicit rollout flag.',
);
assertSourceIncludes(
  'const trailGeometry = exploreNavigationPayload.trailGeometry ?? []',
  'Hybrid route campsite discovery must inspect only the trail/off-road geometry, not the main-road approach.',
);
assertSourceIncludes(
  "sourceType: explorePreviewMode === 'road' || !exploreNavigationPayload ? 'road' : 'explore'",
  'Road-only route previews must be marked as road-sourced so campsite discovery can exclude main-road candidates.',
);
assertSourceIncludes(
  'routeMetadata: exploreNavigationPayload?.routeMetadata ?? null',
  'Explore road previews should pass route metadata so supported forest-road/dispersed-camping context can produce cautious camp candidates.',
);
assertSourceIncludes(
  'scheduleRouteCampsiteClear',
  'Navigate must debounce transient route-context loss before clearing route-owned campsite candidates.',
);
assertSourceIncludes(
  "clearOwnedCampsiteCandidates('route_context_changed'",
  'Changing route identity must clear only route-owned campsite candidates through the owner-aware helper.',
);
assertSourceIncludes(
  "clearOwnedCampsiteCandidates('route_handoff_applied', { clearRoute: true })",
  'Explore/saved route handoffs must clear route-owned candidates without treating polygon candidates as route churn.',
);
assertSourceIncludes(
  'const campsiteTimer = setTimeout(() => {',
  'Route campsite locating should defer until after route geometry has a chance to render.',
);
assert.ok(
  !navigateSource.includes('routeOverviewEligible'),
  'Obsolete passive campsite route gate must be removed.',
);
assert.ok(
  !navigateSource.includes('Campsite candidate detection failed'),
  'Obsolete passive campsite detection effect must be removed.',
);
assertSourceIncludes(
  'if (!routeOverviewCampsiteContext || !routeOverviewCampsiteSignature)',
  'Route overview flow must handle no-route/no-geometry state.',
);
const noContextBranchStart = navigateSource.indexOf(
  'if (!routeOverviewCampsiteContext || !routeOverviewCampsiteSignature)',
);
const repeatedSignatureBranchStart = navigateSource.indexOf(
  'if (lastCampsiteInputRef.current === routeOverviewCampsiteSignature)',
);
const noContextBranch = navigateSource.slice(noContextBranchStart, repeatedSignatureBranchStart);
assert.ok(
  noContextBranch.includes("scheduleRouteCampsiteClear('route_context_unavailable'"),
  'Unavailable route context should debounce route-owned campsite candidate clearing.',
);
assert.ok(
  !noContextBranch.includes('applyCampsiteCandidates(current)'),
  'Unavailable route context must not reapply stale route campsite candidates.',
);
assertSourceIncludes(
  "clearOwnedCampsiteCandidates('route_locator_input_unavailable'",
  'Route overview clearing path must use a reasoned clear when locator input is unavailable.',
);
assertSourceIncludes(
  'const input = buildRouteCampsiteLocatorInput(routeOverviewCampsiteContext);',
  'Route overview flow should build locator input before starting a route-owned candidate refresh.',
);
assertSourceIncludes(
  'routeIntelligenceId: input.routeIntelligence.id',
  'Route-owned campsite scans should begin with a resolved routeIntelligenceId instead of route:unknown.',
);
const routeLocatorInputIndex = navigateSource.indexOf(
  'const input = buildRouteCampsiteLocatorInput(routeOverviewCampsiteContext);',
);
const routeRefreshIndex = navigateSource.indexOf(
  'const requestToken = campsiteCandidateEngine.beginRefresh({',
  routeLocatorInputIndex,
);
assert.ok(
  routeLocatorInputIndex >= 0 &&
    routeRefreshIndex > routeLocatorInputIndex,
  'Route locator input must be built before beginRefresh so owner keys are stable.',
);
assertSourceIncludes(
  'clearPolygon: !campsiteDrawingId',
  'Polygon candidates should clear when the polygon owner is explicitly unavailable or removed.',
);
assertSourceIncludes(
  'options?.activeRouteIntelligenceId != null',
  'Route-sourced campsite candidates should not clear on transient missing route context before the debounce expires.',
);
assertSourceIncludes(
  'options?.activePolygonId != null',
  'Polygon-sourced campsite candidates should not clear just because route context is unavailable.',
);
assert.ok(
  !navigateSource.includes('clearStalePolygonForRoute'),
  'Route context changes should not use the old broad polygon-clearing cleanup path.',
);
assert.ok(
  !navigateSource.includes('const result = locateCampsiteResultForRoute(input);'),
  'Route campsite locating should publish once through the centralized engine instead of applying the same result twice.',
);
const routeLocateCall = navigateSource.indexOf('locateCampsiteResultForRoute(campOpsInput, { publish: false });');
const routeLocateCatch = navigateSource.indexOf("} catch (e) {", routeLocateCall);
assert.ok(
  routeLocateCall >= 0 &&
    routeLocateCatch > routeLocateCall &&
    !navigateSource.slice(routeLocateCall, routeLocateCatch).includes('applyCampsiteCandidates'),
  'Route campsite locating should rely on the engine subscription instead of applying the same result twice.',
);
assertSourceIncludes(
  "reason: 'route_scan_refresh_started'",
  'Route campsite locating should start a generation-tokened refresh before publishing candidates.',
);
assertSourceIncludes(
  "reason: 'polygon_scan_refresh_started'",
  'Polygon campsite scans should start a generation-tokened refresh before publishing candidates.',
);
assert.ok(
  navigateSource.includes('campsiteCandidateEngine.publishResult(result, { requestToken })') &&
    navigateSource.includes('campsiteCandidateEngine.publishResult(result, { requestToken });'),
  'Route and polygon scan results should publish with the active request token.',
);
assert.ok(
  !navigateSource.includes("clearOwnedCampsiteCandidates('camp_scout_view_scan_started', { clearPolygon: true })"),
  'View scan refreshes should not clear candidate state before replacement results publish.',
);
assert.ok(
  campsiteCandidateEngineSource.includes("logCampsiteCandidateDebug('clear_completed'"),
  'Campsite candidate clears should log completion with reason and previous count.',
);
assert.ok(
  campsiteCandidateEngineSource.includes("logCampsiteCandidateDebug('viability_filter'"),
  'Campsite candidate engine should log generated/accepted/rejected viability counts before set.',
);
assert.ok(
  campsiteCandidateEngineSource.includes('prepareCampsiteResultForDisplay'),
  'Campsite candidate engine should apply viability filtering before publishing/storing display candidates.',
);
assert.ok(
  campsiteCandidateEngineSource.includes("logCampsiteCandidateDebug('stale_generation_ignored'") &&
    campsiteCandidateEngineSource.includes("logCampsiteCandidateDebug('refresh_started'"),
  'Campsite candidate engine should log refresh tokens and ignored stale generations.',
);
assertSourceIncludes(
  '[CAMPSITE_CANDIDATE] render count=',
  'Navigate should log candidate render counts for route guidance diagnostics.',
);

assertSourceIncludes(
  'DRAW AREA',
  'Draw button must be present and enter polygon draw mode.',
);
assertSourceIncludes(
  'setCampsiteDrawingPoints((current) => [...current, nextPoint])',
  'Polygon draw mode must add vertices from map taps.',
);
assertSourceIncludes(
  'locateCampsitesForCompletedPolygon(campsiteDrawingPoints)',
  'Completing a polygon must trigger polygon campsite locating.',
);
assertSourceIncludes(
  'loadDrawAreaKnownCampsiteSources(polygonId, points)',
  'Completing a polygon must also load known campsite sources scoped to the drawn area.',
);
assertSourceIncludes(
  'loadRouteKnownCampsiteSources(routeOverviewCampsiteSignature, routeOverviewCampsiteContext)',
  'Route campsite discovery must also load known campsite sources scoped to the route buffer.',
);
assertSourceIncludes(
  'campsitePointNearRoute(item, routePoints, bufferMiles)',
  'Route known-source campsite markers must use geographic route-buffer filtering.',
);
assertSourceIncludes(
  'locateCampsiteResultForPolygon(',
  'Polygon locating must go through the centralized polygon campsite locator.',
);
assertSourceIncludes(
  'drawAreaKnownCampsiteMarkers',
  'Draw Area discovery must merge polygon-scoped established/community/private/group campsite markers.',
);
assertSourceIncludes(
  'routeKnownCampsiteMarkers',
  'Route discovery must merge route-buffer established/community/private/group campsite markers.',
);
assertSourceIncludes(
  'toDrawAreaCommunityCampsiteMarkerPayload',
  'Draw Area discovery must distinguish established campsite markers from approved community recommendations.',
);
assertSourceIncludes(
  'campsiteLayerVisibility.pending',
  'Pending campsite submissions should only render when the pending layer is explicitly enabled.',
);
assertSourceIncludes(
  'campsiteLayerVisibility.reviewer_pending',
  'Reviewer pending campsite submissions should only render when the review layer is explicitly enabled.',
);
assertSourceIncludes(
  'mergeUniqueCampMarkers<CampMapMarker>',
  'Campsite source aggregation must dedupe repeated records before map rendering.',
);
assertSourceIncludes(
  'getCampMarkerCoordinateKey',
  'Campsite source aggregation must dedupe near-duplicate source records by coordinate.',
);
assertSourceIncludes(
  'setCampsiteDrawingPoints([])',
  'Clear Drawing must remove polygon vertices.',
);
assertSourceIncludes(
  "clearOwnedCampsiteCandidates('user_cleared_drawing', { clearPolygon: true })",
  'Clear Drawing must target polygon-sourced campsite markers with a clear reason.',
);
assertSourceIncludes(
  "clearOwnedCampsiteCandidates('point_undone', { clearPolygon: true })",
  'Undo Point must clear polygon-sourced campsite markers with a clear reason.',
);
assertSourceIncludes(
  'setRouteDesignContext({',
  'Build Route Over Drawing must create polygon route-design context.',
);
assertSourceIncludes(
  'setRouteBuilderActive(true)',
  'Build Route Over Drawing must enter route design mode.',
);
assertSourceIncludes(
  'campsiteCandidates: activePolygonCampsiteSuggestions',
  'Build Route Over Drawing must preserve polygon campsite context.',
);

console.log('Campsite navigation integration checks passed.');
