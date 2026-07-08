const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  assert.ok(fs.existsSync(fullPath), `${relativePath} must exist`);
  return fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
}

const navigateSource = read('app/(tabs)/navigate.tsx');
const mapRendererSource = read('components/navigate/MapRenderer.tsx');
const mapFallbackSurfaceSource = read('components/navigate/MapFallbackSurface.tsx');
const compassRoseSource = read('components/navigate/CompassRose.tsx');
const supabaseSource = read('lib/supabase.ts');
const fullMapTileCacheMatch = mapRendererSource.match(/const FULL_MAP_MAX_TILE_CACHE_SIZE = (\d+)/);
const compactMapTileCacheMatch = mapRendererSource.match(/const COMPACT_MAP_MAX_TILE_CACHE_SIZE = (\d+)/);
const fullMapPixelRatioMatch = mapRendererSource.match(/const FULL_MAP_PIXEL_RATIO_CAP = ([0-9.]+)/);
const compactMapPixelRatioMatch = mapRendererSource.match(/const COMPACT_MAP_PIXEL_RATIO_CAP = ([0-9.]+)/);
const bootstrapTimeoutBranchMatch = mapRendererSource.match(
  /if \(payload\?\.reason === 'bootstrap_timeout'\) \{([\s\S]*?)\n        \}\n\n        clearFailSafeTimer/,
);
const routeContinuityFallbackBlockMatch = mapRendererSource.match(
  /const routeContinuityFallbackVisible =([\s\S]*?);\n  const fallbackVisible =/,
);
const webViewLoadStartBlockMatch = mapRendererSource.match(
  /onLoadStart=\{\(\) => \{([\s\S]*?)\n          \}\}/,
);
const roadNavigationSource = read('lib/useRoadNavigation.ts');
const commandDockSource = read('components/CommandDock.tsx');
const navigateProviderEvidenceTestSource = read('scripts/test-navigate-provider-android-evidence.mjs');
const navigateProviderEvidenceRunnerSource = read('scripts/run-navigate-provider-android-evidence.mjs');
const androidDeviceSweepSource = read('docs/qa/android-beta-device-sweep.md');
const releaseReadinessAuditSource = read('docs/release/readiness-gate-audit.md');
const packageJson = JSON.parse(read('package.json'));

assert.ok(
  roadNavigationSource.includes('SEARCH_PROXIMITY_REBUCKET_METERS'),
  'Navigate search should define a material-movement bucket before restarting Search Box suggestions.',
);
assert.ok(
  roadNavigationSource.includes('function distanceBetweenRoadNavigationCoordinatesMeters'),
  'Navigate search should compare GPS proximity by distance instead of raw object identity.',
);
assert.ok(
  roadNavigationSource.includes('const searchProximityRef = useRef<RoadNavigationLocation | null>(null);') &&
    roadNavigationSource.includes('const searchProximity = useMemo(() => {'),
  'useRoadNavigation should maintain a stable search proximity reference for destination suggestions.',
);
assert.ok(
  roadNavigationSource.includes('proximity: searchProximity,'),
  'Destination suggestions should use the stable search proximity, not every live GPS object update.',
);
assert.ok(
  roadNavigationSource.includes('}, [accessToken, enabled, liveServicesEnabled, query, searchProximity]);'),
  'Destination suggestion effect should depend on stable searchProximity instead of raw currentLocation.',
);
assert.ok(
  !roadNavigationSource.includes('}, [accessToken, currentLocation, enabled, liveServicesEnabled, query]);'),
  'Destination suggestion effect must not restart solely because currentLocation object identity changed.',
);
const searchDebounceIndex = roadNavigationSource.indexOf('const timer = setTimeout(() => {');
const searchLoadingIndex = roadNavigationSource.indexOf('setSearchLoading(true);');
assert.ok(
  searchDebounceIndex >= 0 && searchLoadingIndex > searchDebounceIndex,
  'Navigate destination search should only flip loading state after the debounce starts a real provider request.',
);
assert.ok(
  roadNavigationSource.includes('setSuggestions((current) => (current.length > 0 ? [] : current));'),
  'Navigate destination search should not publish fresh empty suggestion arrays on every short/failed query render.',
);

assert.ok(
  navigateSource.includes('IDLE_DESTINATION_SEARCH_COMMIT_DELAY_MS'),
  'Navigate mobile search should define a short keyboard-visible commit delay for suggestion rows.',
);
assert.ok(
  navigateSource.includes('IDLE_DESTINATION_SEARCH_KEYBOARD_COMMIT_DELAY_MS'),
  'Navigate mobile search should define a separate keyboard-settled commit delay for Android input frames.',
);
assert.ok(
  navigateSource.includes('IDLE_DESTINATION_SEARCH_KEYBOARD_RENDER_LIMIT'),
  'Navigate mobile search should define a smaller keyboard-active render limit for suggestion rows.',
);
assert.ok(
  navigateSource.includes('IDLE_DESTINATION_SEARCH_QUERY_COMMIT_DELAY_MS'),
  'Navigate mobile search should define a short draft-query commit delay before waking provider-backed search.',
);
const commitDelayMatch = navigateSource.match(/const IDLE_DESTINATION_SEARCH_COMMIT_DELAY_MS = ([0-9]+);/);
assert.ok(commitDelayMatch, 'Navigate mobile search commit delay should be a named numeric constant.');
assert.ok(
  Number(commitDelayMatch[1]) >= 240,
  `Keyboard-visible search suggestions should wait until Android keyboard transition work settles; found ${commitDelayMatch[1]}ms.`,
);
const keyboardCommitDelayMatch = navigateSource.match(/const IDLE_DESTINATION_SEARCH_KEYBOARD_COMMIT_DELAY_MS = ([0-9]+);/);
assert.ok(keyboardCommitDelayMatch, 'Keyboard-active search commit delay should be a named numeric constant.');
assert.ok(
  Number(keyboardCommitDelayMatch[1]) >= 420,
  `Keyboard-active search commits should wait through the Android keyboard transition; found ${keyboardCommitDelayMatch[1]}ms.`,
);
const queryCommitDelayMatch = navigateSource.match(/const IDLE_DESTINATION_SEARCH_QUERY_COMMIT_DELAY_MS = ([0-9]+);/);
assert.ok(queryCommitDelayMatch, 'Navigate mobile search draft-query commit delay should be a named numeric constant.');
assert.ok(
  Number(queryCommitDelayMatch[1]) >= 260,
  `Keyboard-active query commits should wait past Android keyboard/input burst work before waking provider search; found ${queryCommitDelayMatch[1]}ms.`,
);
const keyboardRenderLimitMatch = navigateSource.match(/const IDLE_DESTINATION_SEARCH_KEYBOARD_RENDER_LIMIT = ([0-9]+);/);
assert.ok(keyboardRenderLimitMatch, 'Keyboard-active search render limit should be a named numeric constant.');
assert.ok(
  Number(keyboardRenderLimitMatch[1]) <= 1,
  `Keyboard-active search should render at most one suggestion row during the hot input path; found ${keyboardRenderLimitMatch[1]}.`,
);
assert.ok(
  navigateSource.includes("TOP MATCH | 1 OF ${deferredIdleDestinationSearchSuggestions.length}") &&
    navigateSource.includes('idleDestinationSearchResultsStatic') &&
    navigateSource.includes('destinationSearchInputActive ? (\n              <View style={[styles.idleDestinationSearchResultsStatic'),
  'Keyboard-active destination search should show a fixed top-match container instead of mounting a nested ScrollView during IME layout.',
);
assert.ok(
  navigateSource.includes('idleDestinationSearchDraftQuery') &&
    navigateSource.includes('setIdleDestinationSearchDraftQuery') &&
    navigateSource.includes('idleDestinationSearchQueryCommitTimerRef'),
  'Navigate mobile search should keep TextInput draft state separate from provider-backed roadNavigation.query.',
);
assert.ok(
  navigateSource.includes('setRoadNavigationQuery(idleDestinationSearchDraftQuery);') &&
    navigateSource.includes('IDLE_DESTINATION_SEARCH_QUERY_COMMIT_DELAY_MS'),
  'Navigate mobile search should debounce provider query commits while typing with the keyboard active.',
);
assert.ok(
  navigateSource.includes('const idleDestinationSearchQuerySettled =') &&
    navigateSource.includes('idleDestinationSearchQuerySettled &&') &&
    navigateSource.includes('QUERY | {idleDestinationSearchDraftQuery.trim()}'),
  'Navigate mobile search should render immediate draft query copy while deferring stale/no-match result transitions until provider query settles.',
);
assert.ok(
  navigateSource.includes('idleDestinationSearchCommitTimerRef') &&
    navigateSource.includes('deferredIdleDestinationSearchSuggestions') &&
    navigateSource.includes('setDeferredIdleDestinationSearchSuggestions'),
  'Navigate mobile search should defer suggestion row commits outside the raw RoadNavigation hook state.',
);
assert.ok(
  navigateSource.includes('destinationSearchInputActive ? IDLE_DESTINATION_SEARCH_KEYBOARD_COMMIT_DELAY_MS : 0'),
  'Navigate mobile search should use the keyboard-settled delay while the input/keyboard path is active.',
);
const suggestionCommitEffectStart = navigateSource.indexOf('useEffect(() => {\n  if (idleDestinationSearchCommitTimerRef.current)');
assert.ok(suggestionCommitEffectStart >= 0, 'Navigate suggestion commit effect should remain statically readable.');
const suggestionCommitDepsStart = navigateSource.indexOf('}, [', suggestionCommitEffectStart);
const suggestionCommitDepsEnd = navigateSource.indexOf(']);', suggestionCommitDepsStart);
assert.ok(
  suggestionCommitDepsStart > suggestionCommitEffectStart &&
    suggestionCommitDepsEnd > suggestionCommitDepsStart,
  'Navigate suggestion commit effect dependencies should remain statically readable.',
);
const suggestionCommitDeps = navigateSource.slice(suggestionCommitDepsStart, suggestionCommitDepsEnd);
assert.ok(
  !suggestionCommitDeps.includes('keyboardHeight'),
  'Navigate search should not restart deferred suggestion commits for every keyboard-height animation frame.',
);
assert.ok(
  navigateSource.includes('deferredIdleDestinationSearchSuggestions.slice(0, idleDestinationSearchRenderLimit)'),
  'Visible Navigate search suggestions should be sliced from the deferred mobile list.',
);
assert.ok(
  navigateSource.includes('const visibleRecentSearches = useMemo(') &&
    navigateSource.includes('recentSearches.slice(0, idleDestinationSearchRenderLimit)') &&
    navigateSource.includes('visibleRecentSearches.map((suggestion) => ('),
  'Visible Navigate recent-search rows should share the keyboard-active row budget instead of rendering every saved row during focus.',
);
assert.ok(
  navigateSource.includes('destinationSearchInputActive ? IDLE_DESTINATION_SEARCH_KEYBOARD_RENDER_LIMIT : IDLE_DESTINATION_SEARCH_RENDER_LIMIT'),
  'Keyboard-active destination search should use the smaller render budget before expanding after the keyboard path settles.',
);
assert.ok(
  navigateSource.includes('deferredIdleDestinationSearchSuggestions.length > 0') &&
    navigateSource.includes('deferredIdleDestinationSearchSuggestions.length === 0'),
  'Search result and empty states should key off deferred suggestions to avoid hot row churn.',
);
assert.ok(
  navigateSource.includes('const destinationSearchMapFrozen =') &&
    navigateSource.includes('destinationSearchInputFocused') &&
    navigateSource.includes('destinationSearchInputActive') &&
    navigateSource.includes("motionPriority: 'cold'") &&
    navigateSource.includes('allowLiveLocation: false') &&
    navigateSource.includes('allowDynamicCamera: false'),
  'Navigate should freeze live map motion from input focus, before Android reports keyboard height.',
);
assert.ok(
  navigateSource.includes('interactive={!destinationSearchMapFrozen}') &&
    navigateSource.includes('cameraMode={mapRendererCameraMode}') &&
    navigateSource.includes('cameraCommand={mapRendererCameraCommand}'),
  'MapRenderer should stop map interaction and dynamic camera work during active destination search input.',
);
assert.ok(
  navigateSource.includes('const mapRendererUserLocation = destinationSearchMapFrozen') &&
    navigateSource.includes('const mapRendererShowUserLocation = !destinationSearchMapFrozen') &&
    navigateSource.includes('const mapRendererVehicleHeading = destinationSearchMapFrozen') &&
    navigateSource.includes('userLocation={mapRendererUserLocation}') &&
    navigateSource.includes('vehicleHeading={mapRendererVehicleHeading}'),
  'MapRenderer should receive null/stable live-location props while destination search freezes the map.',
);
assert.ok(
    navigateSource.includes('destinationSearchMapOccluder') &&
    navigateSource.includes('floatingToolsVisible = mapOverlayStartupReady && !destinationSearchMapFrozen') &&
    navigateSource.includes('!destinationSearchMapFrozen') &&
    navigateSource.includes('bottom: destinationSearchMapOccluderBottom'),
  'Keyboard-visible destination search should occlude the WebView map and suppress floating controls behind the foreground search surface.',
);
assert.ok(
  navigateSource.includes('idleDestinationSearchShellKeyboardActive') &&
    navigateSource.includes('destinationSearchInputActive && styles.idleDestinationSearchShellKeyboardActive'),
  'Focused/keyboard-active destination search should use the cheaper mobile shell style instead of shadowed translucent redraws.',
);
assert.ok(
  navigateSource.includes('IDLE_DESTINATION_SEARCH_KEYBOARD_MAX_HEIGHT') &&
    navigateSource.includes('idleDestinationSearchPanelMaxHeight') &&
    navigateSource.includes('destinationSearchInputActive ?'),
  'Keyboard-active destination search should use a compact fixed max-height path instead of resizing the full surface around keyboardHeight.',
);
assert.ok(
  navigateSource.includes('const idleDestinationSearchLoadingVisible =') &&
    navigateSource.includes('roadNavigation.searchLoading && !destinationSearchInputActive') &&
    navigateSource.includes('loading={idleDestinationSearchLoadingVisible}'),
  'Navigate search should not animate the loading spinner during the hot keyboard/input transition.',
);
assert.ok(
  navigateSource.includes('const idleDestinationSearchOperationalTextVisible =') &&
    navigateSource.includes('!destinationSearchInputActive && idleDestinationSearchHasQuery') &&
    navigateSource.includes('{idleDestinationSearchOperationalTextVisible ? ('),
  'Navigate search should avoid dynamic query-copy text layout while Android keyboard/input frames are hot.',
);
assert.ok(
  navigateSource.includes('const campsiteSearchPolygonPayload = useMemo(') &&
    !navigateSource.includes('campsiteSearchPolygon={{'),
  'MapRenderer should receive a memoized campsite search polygon payload instead of a fresh object on every search keystroke.',
);
const mapRendererMemoStart = navigateSource.indexOf('const mapRendererElement = useMemo(() => (');
assert.ok(mapRendererMemoStart >= 0, 'Navigate should isolate MapRenderer in its own memoized element.');
const mapRendererMemoDepsStart = navigateSource.indexOf('), [', mapRendererMemoStart);
const mapRendererMemoDepsEnd = navigateSource.indexOf(']);', mapRendererMemoDepsStart);
assert.ok(mapRendererMemoDepsStart > mapRendererMemoStart && mapRendererMemoDepsEnd > mapRendererMemoDepsStart);
const mapRendererMemoDeps = navigateSource.slice(mapRendererMemoDepsStart, mapRendererMemoDepsEnd);
assert.ok(
  !mapRendererMemoDeps.includes('keyboardHeight') && !mapRendererMemoDeps.includes('roadNavigation'),
  'MapRenderer memo dependencies should exclude keyboardHeight and roadNavigation search state.',
);
assert.ok(
  navigateSource.includes('const idleDestinationSearchOverlay = useMemo(() => {') &&
    navigateSource.includes('{stableMapSurface}\n        {idleDestinationSearchOverlay}'),
  'Parked destination search should render through its own memoized overlay outside the broad map-surface memo.',
);
const stableMapSurfaceStart = navigateSource.indexOf('const stableMapSurface = useMemo(() => {');
assert.ok(stableMapSurfaceStart >= 0, 'Navigate should keep the broad map surface memo readable.');
const stableMapSurfaceDepsStart = navigateSource.indexOf('}, [\n  hasToken,', stableMapSurfaceStart);
const stableMapSurfaceDepsEnd = navigateSource.indexOf(']);', stableMapSurfaceDepsStart);
assert.ok(
  stableMapSurfaceDepsStart > stableMapSurfaceStart &&
    stableMapSurfaceDepsEnd > stableMapSurfaceDepsStart,
  'Navigate broad map-surface memo dependencies should remain statically readable.',
);
const stableMapSurfaceDeps = navigateSource.slice(stableMapSurfaceDepsStart, stableMapSurfaceDepsEnd);
[
  'idleDestinationSearchDraftQuery',
  'visibleIdleDestinationSearchSuggestions',
  'deferredIdleDestinationSearchSuggestions',
  'recentSearches',
  'recentSearchesVisible',
  'idleDestinationSearchResultsLabel',
  'idleDestinationSearchPanelMaxHeight',
  'idleDestinationSearchResultsMaxHeight',
  'idleDestinationSearchHasQuery',
  'roadNavigation,',
].forEach((hotDependency) => {
  assert.ok(
    !stableMapSurfaceDeps.includes(hotDependency),
    `Broad Navigate map surface should not rebuild from hot parked-search dependency: ${hotDependency}.`,
  );
});
assert.ok(
  navigateSource.includes('const HIDDEN_ROAD_NAVIGATION_SEARCH_QUERY = \'\'') &&
    navigateSource.includes('const EMPTY_ROAD_NAVIGATION_SEARCH_SUGGESTIONS: RoadNavSearchSuggestion[] =') &&
    navigateSource.includes('Object.freeze([]) as unknown as RoadNavSearchSuggestion[];') &&
    navigateSource.includes('query={HIDDEN_ROAD_NAVIGATION_SEARCH_QUERY}') &&
    navigateSource.includes('suggestions={EMPTY_ROAD_NAVIGATION_SEARCH_SUGGESTIONS}') &&
    navigateSource.includes('searchLoading={false}') &&
    navigateSource.includes('searchError={null}'),
  'Hidden RoadNavigationOverlay search props should be stable so parked typing does not invalidate active/preview overlay rendering.',
);
const mapRendererHtmlMemoStart = mapRendererSource.indexOf('const html = useMemo(');
assert.ok(mapRendererHtmlMemoStart >= 0, 'MapRenderer should memoize the WebView HTML source.');
const mapRendererHtmlMemoDepsStart = mapRendererSource.indexOf('), [', mapRendererHtmlMemoStart);
const mapRendererHtmlMemoDepsEnd = mapRendererSource.indexOf(']);', mapRendererHtmlMemoDepsStart);
assert.ok(
  mapRendererHtmlMemoDepsStart > mapRendererHtmlMemoStart &&
    mapRendererHtmlMemoDepsEnd > mapRendererHtmlMemoDepsStart,
  'MapRenderer HTML memo dependencies should be statically readable.',
);
const mapRendererHtmlMemoDeps = mapRendererSource.slice(mapRendererHtmlMemoDepsStart, mapRendererHtmlMemoDepsEnd);
assert.ok(
  !mapRendererHtmlMemoDeps.includes('interactive'),
  'MapRenderer should not rebuild the Android WebView HTML when destination search only toggles map interactivity.',
);
assert.ok(
  !mapRendererSource.includes('interactive !== false,\n          )'),
  'MapRenderer should not pass the live interactive prop into makeMapHtml.',
);
assert.ok(
  mapRendererSource.includes('interactive: props.interactive !== false') &&
    mapRendererSource.includes('function setMapInteractionEnabled(enabled)') &&
    mapRendererSource.includes('setMapInteractionEnabled(payload.interactive !== false);'),
  'MapRenderer should keep interactivity on the dynamic-state bridge instead of the WebView HTML source.',
);
assert.ok(
  mapRendererSource.includes('const androidLayerType = motionPriority ===') &&
    mapRendererSource.includes("motionPriority === 'hot' && interactive !== false ? 'hardware' : 'none'") &&
    mapRendererSource.includes('androidLayerType={androidLayerType}'),
  'MapRenderer should reserve Android hardware WebView layers for hot active-guidance motion and lower layer pressure for warm/cold idle or search surfaces.',
);
assert.ok(
    mapRendererSource.includes('function buildMapboxStaticImageUrl') &&
    mapRendererSource.includes("motionPriority === 'warm'") &&
    mapRendererSource.includes('!standbyMapHasOperationalOverlay') &&
    mapRendererSource.includes('const renderLiveWebView =') &&
    mapRendererSource.includes("motionPriority !== 'cold'") &&
    mapRendererSource.includes('!webRendererCrashBlocked'),
  'MapRenderer should place no-overlay warm idle maps into a static standby instead of keeping the live WebView renderer hot.',
);
assert.ok(
  mapRendererSource.includes("motionPriority === 'cold'") &&
    mapRendererSource.includes("standbyMapActive || motionPriority === 'cold' || webReady"),
  'Cold frozen map states should still report ready without mounting a live WebView during foreground search.',
);
assert.ok(
    mapRendererSource.includes('if (!renderLiveWebView) {') &&
    mapRendererSource.includes('failSafeArmedInstanceKeyRef.current = null;') &&
    mapRendererSource.includes('startupSettledRef.current = false;') &&
    !mapRendererSource.includes('if (!shouldLoadMap) return;\n    if (startupSettledRef.current) return;') &&
    mapRendererSource.includes('}, [') &&
    mapRendererSource.includes('renderLiveWebView,') &&
    mapRendererSource.includes('webViewInstanceKey,'),
  'MapRenderer must only arm WebView bootstrap timers while the live WebView is intentionally rendered, then clear them during standby/cold states.',
);
assert.ok(
  mapRendererSource.includes('const shouldRenderFallbackSurface = fallbackVisible && motionPriority !== \'cold\';') &&
    mapRendererSource.includes('const shouldRenderPlaceholder = !liveMapDisabled && !standbyMapActive && motionPriority !== \'cold\';') &&
    mapRendererSource.includes('const showBootOverlay =') &&
    mapRendererSource.includes('renderLiveWebView &&') &&
    mapRendererSource.includes('{shouldRenderFallbackSurface ? (') &&
    mapRendererSource.includes('{showBootOverlay && !shouldRenderFallbackSurface && ('),
  'MapRenderer should avoid drawing fallback, placeholder, or boot overlays for cold hidden/search map surfaces.',
);
assert.ok(
  mapRendererSource.includes('standbyWakeLayer') &&
    mapRendererSource.includes('setStandbyWakeRequested(true)') &&
    mapRendererSource.includes('accessibilityLabel={standbyWakeDisabled ? "Map standby" : "Activate map"}'),
  'Static standby maps should expose a full-area wake target for user map interaction.',
);
assert.ok(
  mapRendererSource.includes('standbyWakeDisabled?: boolean;') &&
    mapRendererSource.includes('standbyWakeDisabled = false') &&
    mapRendererSource.includes('if (standbyWakeDisabled) return;') &&
    mapRendererSource.includes('disabled={standbyWakeDisabled}') &&
    mapRendererSource.includes('accessibilityState={{ disabled: standbyWakeDisabled }}'),
  'Static standby maps should support disabling the live-WebView wake target during parked mobile search surfaces.',
);
assert.ok(
  mapRendererSource.includes('standbyStaticMapDisabled?: boolean;') &&
    mapRendererSource.includes('standbyStaticMapDisabled = false') &&
    mapRendererSource.includes('!standbyStaticMapDisabled &&') &&
    navigateSource.includes('standbyStaticMapDisabled={true}'),
  'Navigate should be able to keep the standby wake surface without loading a full-screen remote static map bitmap during tab cycling.',
);
assert.ok(
  mapRendererSource.includes('const FULL_MAP_PIXEL_RATIO_CAP =') &&
    mapRendererSource.includes('const COMPACT_MAP_PIXEL_RATIO_CAP =') &&
    mapRendererSource.includes("surfaceMode === 'compact' ? COMPACT_MAP_PIXEL_RATIO_CAP : FULL_MAP_PIXEL_RATIO_CAP") &&
    mapRendererSource.includes('var mapPixelRatioCap =') &&
    mapRendererSource.includes('var mapPixelRatio = Math.min(window.devicePixelRatio || 1, mapPixelRatioCap);') &&
    mapRendererSource.includes('pixelRatio: mapPixelRatio'),
  'MapRenderer should cap Mapbox WebView pixel ratio to reduce Android canvas/GPU pressure.',
);
assert.ok(
  navigateSource.includes('surfaceMode="compact"') &&
    navigateSource.includes('destinationSearchMapOccluder') &&
    navigateSource.includes('interactive={!destinationSearchMapFrozen}') &&
    !navigateSource.includes('style={destinationSearchMapFrozen ? styles.mapRendererFrozen : undefined}') &&
    !navigateSource.includes('mapRendererFrozen:'),
  'Navigate should keep the compact map in lightweight standby during parked search and pause interaction through the occluder without display-none layout churn.',
);
assert.ok(
  !navigateSource.includes('standbyMapDisabled={idleDestinationSearchVisible && !destinationSearchMapFrozen}'),
  'Idle destination search should not force a live WebView under the parked search panel.',
);
assert.ok(
  navigateSource.includes('standbyWakeDisabled={idleDestinationSearchVisible}'),
  'Parked idle destination search should keep the standby map visually useful without letting search-background taps wake the live WebView.',
);
assert.ok(
  navigateSource.includes('const activeRerouteMapStandby =') &&
    navigateSource.includes("Platform.OS === 'android'") &&
    navigateSource.includes("roadSession.status === 'rerouting'") &&
    navigateSource.includes("roadSession.routeConfidenceState === 'rerouting'") &&
    navigateSource.includes('liveMapDisabled={activeRerouteMapStandby}') &&
    !navigateSource.includes('activeRerouteWithoutMapGeometry'),
  'Navigate should keep the live WebView disabled during Android active reroutes and rely on the native fallback surface instead.',
);
assert.ok(
  navigateSource.includes('const mapStartupOverlayVisible =') &&
    navigateSource.includes('!activeRerouteMapStandby') &&
    navigateSource.includes('{mapStartupOverlayVisible && ('),
  'Navigate should not cover Android active-reroute native standby with the generic map startup overlay.',
);
assert.ok(
  navigateSource.includes('NAVIGATE_ROAD_PREVIEW_MAX_VISUAL_POINTS') &&
    navigateSource.includes('simplifyNavigateRoadPreviewPoints') &&
    navigateSource.includes('const previewRoadRouteLinePoints = useMemo('),
  'Navigate road destination previews should cap visual route geometry before sending it through the inactive map/render pipeline.',
);
assert.ok(
  navigateSource.includes('routeLifecycleState.phase !== \'navigating\'') &&
    navigateSource.includes('activeRoadRouteLinePoints.length > NAVIGATE_ROAD_PREVIEW_MAX_VISUAL_POINTS') &&
    navigateSource.includes('return previewRoadRouteLinePoints;'),
  'Inactive road previews should use the capped route line while active guidance keeps full route geometry.',
);
assert.ok(
  navigateSource.includes('NAVIGATE_ROAD_PREVIEW_DETAIL_SETTLE_MS') &&
    navigateSource.includes('roadPreviewDetailsSettled') &&
    navigateSource.includes('roadPreviewDetailSettleTimerRef'),
  'Navigate route preview should explicitly defer heavy detail blocks after destination-result selection.',
);
assert.ok(
  navigateSource.includes('roadPreviewDetailsSettled\n          ? buildStagedActiveGuidanceRouteOptions') &&
    navigateSource.includes('readinessStack: roadPreviewDetailsSettled ? navigationStartReadinessStack : null'),
  'Road preview route options and readiness rows should wait for the short settle window instead of rendering in the same burst as route selection.',
);
assert.ok(
  mapRendererSource.includes('standbyMapDisabled?: boolean;') &&
    mapRendererSource.includes('standbyMapDisabled = false') &&
    mapRendererSource.includes('!standbyMapDisabled'),
  'MapRenderer should keep an explicit escape hatch for flows that must wake the live compact map.',
);
assert.ok(
  mapRendererSource.includes('WEBVIEW_RENDER_PROCESS_RETRY_LIMIT') &&
    mapRendererSource.includes('renderProcessGoneCountRef') &&
    mapRendererSource.includes('webRendererCrashBlocked') &&
    mapRendererSource.includes('setWebRendererCrashBlocked(true)') &&
    mapRendererSource.includes("setWebBootIssue('webview_renderer_gone')") &&
    mapRendererSource.includes('renderProcessGoneCountRef.current = 0'),
  'MapRenderer should bound WebView renderer crash remounts and expose a stable fallback instead of looping on Android.',
);
assert.ok(
  navigateSource.includes('const compassPowerSaveActive = !isFocused || !activeNavigationRunning;') &&
    navigateSource.includes('enabled: !compassPowerSaveActive') &&
    !navigateSource.includes('setCompassPowerSaveActive'),
  'Idle or unfocused Navigate should power-save vehicle heading work instead of running the 20 Hz compass loop on the idle map.',
);
assert.ok(
  compassRoseSource.includes('if (!visible || paused || isStationaryLocked) return;') &&
    compassRoseSource.includes('}, [externalHeading, isStationaryLocked, paused, visible]);'),
  'CompassRose should not subscribe to native magnetometer updates while hidden, paused, or stationary-locked.',
);
assert.ok(
  compassRoseSource.includes('if (!visible || paused || isStationaryLocked || !followUser) return;') &&
    compassRoseSource.includes('}, [externalHeading, followUser, isStationaryLocked, paused, visible]);'),
  'CompassRose should not keep web GPS heading watches alive while hidden, paused, or stationary-locked.',
);
assert.ok(
  compassRoseSource.includes('if (!visible || paused || isStationaryLocked) {') &&
    compassRoseSource.includes('rotateAnim.stopAnimation();'),
  'CompassRose should freeze rotation animation work while hidden, paused, or stationary-locked.',
);
assert.ok(
  mapRendererSource.includes('FULL_MAP_MAX_TILE_CACHE_SIZE') &&
    mapRendererSource.includes('COMPACT_MAP_MAX_TILE_CACHE_SIZE') &&
    mapRendererSource.includes('var maxTileCacheSize =') &&
    mapRendererSource.includes('maxTileCacheSize: maxTileCacheSize') &&
    mapRendererSource.includes('renderWorldCopies: false') &&
    mapRendererSource.includes('trackResize: false') &&
    mapRendererSource.includes('refreshExpiredTiles: false') &&
    mapRendererSource.includes('crossSourceCollisions: false'),
  'MapRenderer should use lean Mapbox GL options to reduce idle WebView redraw and tile/cache pressure on mobile.',
);
assert.ok(
  fullMapTileCacheMatch &&
    Number(fullMapTileCacheMatch[1]) > 0 &&
    Number(fullMapTileCacheMatch[1]) <= 16 &&
    compactMapTileCacheMatch &&
    Number(compactMapTileCacheMatch[1]) <= 12 &&
    Number(compactMapTileCacheMatch[1]) <= Number(fullMapTileCacheMatch[1]) &&
    fullMapPixelRatioMatch &&
    Number(fullMapPixelRatioMatch[1]) > 0 &&
    Number(fullMapPixelRatioMatch[1]) <= 0.5 &&
    compactMapPixelRatioMatch &&
    Number(compactMapPixelRatioMatch[1]) <= Number(fullMapPixelRatioMatch[1]) &&
    Number(compactMapPixelRatioMatch[1]) <= 0.5 &&
    mapRendererSource.includes('FULL_MAP_PIXEL_RATIO_CAP') &&
    mapRendererSource.includes('COMPACT_MAP_PIXEL_RATIO_CAP') &&
    mapRendererSource.includes('var mapPixelRatioCap =') &&
    mapRendererSource.includes('var mapPixelRatio = Math.min(window.devicePixelRatio || 1, mapPixelRatioCap);'),
  'Full-screen active guidance maps should cap tile cache and pixel ratio to reduce Android WebView tile-memory pressure during dashboard handoff.',
);
assert.ok(
  mapRendererSource.includes('function scheduleMapResizePump(reason)') &&
    mapRendererSource.includes("var shouldResize = reason === 'constructor' || reason === 'load' || before !== lastResizeSignature;") &&
    mapRendererSource.includes('if (!shouldResize) return;') &&
    mapRendererSource.includes('resizePumpRemainingTicks = Math.max(resizePumpRemainingTicks, 4);') &&
    !mapRendererSource.includes('resizePumpRemainingTicks = Math.max(resizePumpRemainingTicks, 8);') &&
    mapRendererSource.includes("scheduleMapResizePump('constructor')") &&
    mapRendererSource.includes("scheduleMapResizePump('load')") &&
    mapRendererSource.includes("scheduleMapResizePump('style_load')") &&
    mapRendererSource.includes("resizeMapIfNeeded('payload_apply')") &&
    mapRendererSource.includes("window.addEventListener('resize'"),
  'MapRenderer should run a bounded resize pump so Android WebView maps recover from first-layout canvas sizing races.',
);
assert.ok(
  supabaseSource.includes('function shouldWarnMissingSupabaseConfig()') &&
    supabaseSource.includes('ECS_SUPABASE_SILENCE_CONFIG_WARNING') &&
    supabaseSource.includes("npm_lifecycle_event?.startsWith('test:')") &&
    supabaseSource.includes('if (shouldWarnMissingSupabaseConfig())'),
  'Supabase config warnings should remain visible in the app while staying quiet during automated npm test smoke runs.',
);
assert.ok(
  bootstrapTimeoutBranchMatch &&
    bootstrapTimeoutBranchMatch[1].includes('waiting for definitive map load') &&
    !bootstrapTimeoutBranchMatch[1].includes('setWebReady(true);') &&
    !bootstrapTimeoutBranchMatch[1].includes('hasEverReachedReadyRef.current = true;'),
  'MapRenderer should keep first-paint fallback visible after provisional bootstrap timeout until the Mapbox load event is definitive.',
);
assert.ok(
  mapRendererSource.includes('fallbackRoutePoints?: RoutePoint[];') &&
    mapRendererSource.includes('fallbackProgressPoints?: RoutePoint[];') &&
    mapRendererSource.includes('const fallbackRouteCoords = useMemo(') &&
    mapRendererSource.includes('normalizePointList(fallbackRoutePoints)') &&
    mapRendererSource.includes('routeCoords={fallbackRouteCoords}') &&
    mapRendererSource.includes('const routeContinuityFallbackVisible =') &&
    mapRendererSource.includes('payload.routeCoords.length < 2') &&
    navigateSource.includes('const fallbackRoutePointsForMap = useMemo(') &&
    navigateSource.includes('const roadNavigationStoredRouteFallbackPoints = useMemo<RoadNavCoordinate[]>') &&
    navigateSource.includes('const lastActiveRoadRouteLinePointsRef = useRef<RoadNavCoordinate[]>([])') &&
    navigateSource.includes('lastActiveRoadRouteLinePointsRef.current.length > 1') &&
    navigateSource.includes('roadNavigationStoredRouteFallbackPoints.length > 1') &&
    navigateSource.includes("routeLifecycleState.phase === 'navigating' && validatedRunPoints.length > 1") &&
    navigateSource.includes('fallbackRoutePoints={fallbackRoutePointsForMap}'),
  'Navigate active guidance should provide native-fallback-only route continuity while rerouting so first paint does not collapse to a blank WebView.',
);
assert.ok(
  routeContinuityFallbackBlockMatch &&
    !routeContinuityFallbackBlockMatch[1].includes('isCompactSurface') &&
    !routeContinuityFallbackBlockMatch[1].includes('webReady &&') &&
    routeContinuityFallbackBlockMatch[1].includes('!webReady') &&
    routeContinuityFallbackBlockMatch[1].includes('!hasEverReachedReadyRef.current'),
  'Full Navigate active guidance should keep native fallback route geometry visible while the WebView is still booting, not only after compact WebView readiness.',
);
assert.ok(
  webViewLoadStartBlockMatch &&
    webViewLoadStartBlockMatch[1].includes('resetWebDocumentLoadState();') &&
    mapRendererSource.includes('hasEverReachedReadyRef.current = false;') &&
    mapRendererSource.includes('bootstrapSentRef.current = false;') &&
    mapRendererSource.includes("lastPayloadHashRef.current = '';") &&
    !webViewLoadStartBlockMatch[1].includes('if (!hasEverReachedReadyRef.current)'),
  'Navigate WebView reloads should clear the previous ready/bootstrap latch so tab reselects redraw the native route fallback and resend the full route payload.',
);
assert.ok(
  mapRendererSource.includes('const routeGeometryPendingFallbackVisible =') &&
    mapRendererSource.includes('liveMapDisabled &&') &&
    mapRendererSource.includes('routeGeometryPendingFallbackVisible ||') &&
    mapRendererSource.includes('const fallbackStatusLabel =') &&
    mapRendererSource.includes("'Route geometry pending'") &&
    mapRendererSource.includes('showStatusLabel={!!fallbackStatusLabel}') &&
    mapRendererSource.includes('statusLabel={fallbackStatusLabel}'),
  'MapRenderer should present an explicit native fallback status while geometryless reroutes keep the live map disabled.',
);
assert.ok(
  mapFallbackSurfaceSource.includes("showStatusLabel && statusLabel ? statusLabel : 'Map ready'"),
  'MapFallbackSurface should surface explicit pending/fallback status copy even when it has no drawable route bounds yet.',
);
assert.ok(
  mapFallbackSurfaceSource.includes('const hasDrawableLineGeometry =') &&
    mapFallbackSurfaceSource.includes('const pendingGeometryStatus =') &&
    mapFallbackSurfaceSource.includes("statusLabel === 'Route geometry pending'") &&
    mapFallbackSurfaceSource.includes('!hasDrawableLineGeometry') &&
    mapFallbackSurfaceSource.includes('if (!bounds || pendingGeometryStatus)') &&
    mapFallbackSurfaceSource.includes('Guidance is holding current position while route geometry updates.'),
  'MapFallbackSurface should keep route-geometry-pending copy visible when it can draw only current position or markers.',
);
assert.ok(
  mapRendererSource.includes('compactRoutePreviewStandbyEligible') &&
    mapRendererSource.includes('standbyMapEligible || compactRoutePreviewStandbyEligible') &&
    mapRendererSource.includes("routeRenderMode === 'preview'") &&
    mapRendererSource.includes("motionPriority === 'warm'") &&
    mapRendererSource.includes('transparentBackground={standbyMapActive && compactRoutePreviewStandbyEligible}'),
  'Compact warm route previews should stay on the static standby map and draw the native fallback route first without affecting hot active guidance.',
);
assert.ok(
  mapRendererSource.includes('const standbyShouldUseStaticMapImage =') &&
    mapRendererSource.includes('standbyMapActive &&') &&
    mapRendererSource.includes('standbyMapEligible &&') &&
    mapRendererSource.includes('!compactRoutePreviewStandbyEligible') &&
    mapRendererSource.includes('if (!standbyShouldUseStaticMapImage) return null;'),
  'Compact route-preview standby should avoid loading a remote static map bitmap while the native route fallback is already drawing the preview.',
);
assert.ok(
  mapFallbackSurfaceSource.includes('const drawGrid = !transparentBackground;') &&
    mapFallbackSurfaceSource.includes("fill={transparentBackground ? 'rgba(5,9,13,0.68)' : '#05090D'}") &&
    mapFallbackSurfaceSource.includes('{drawGrid ? ('),
  'Transparent native fallback overlays should use one dim rect for route readability while skipping the heavier tactical grid.',
);
assert.ok(
  mapRendererSource.includes('!routeBuilderActive') &&
    mapRendererSource.includes('routeBuilderSegments.length === 0') &&
    mapRendererSource.includes('routeBuilderAnchors.length === 0') &&
    mapRendererSource.includes('!showCrosshair') &&
    mapRendererSource.includes('!campsiteSearchPolygon?.coordinates?.length'),
  'Compact WebView wake deferral must stay scoped away from route-builder and map-editing interactions.',
);

assert.ok(
  navigateSource.includes('RIGHT_RAIL_COMPASS_CLEARANCE') &&
    navigateSource.includes('const TOOLS_TRIGGER_BOTTOM = COMPASS_BOTTOM + COMPASS_SIZE + RIGHT_RAIL_COMPASS_CLEARANCE;'),
  'Right-side map controls should reserve an explicit gap above the compass/lock hint stack.',
);
assert.ok(
  navigateSource.includes('quickActionsTriggerUnavailable') &&
    navigateSource.includes('quickActionsUnavailableSlash') &&
    navigateSource.includes('testID="navigate-remoteness-overlay-toggle"'),
  'Disabled remoteness control should remain visibly identifiable and testable on mobile.',
);
assert.ok(
  navigateSource.includes("accessibilityValue={{ text: !remotenessOverlayAvailable && !showRemotenessOverlay ? 'unavailable' : showRemotenessOverlay ? 'on' : 'off' }}"),
  'Disabled remoteness control should expose explicit unavailable state to assistive tech.',
);

const outerOffsetMatch = commandDockSource.match(/const OUTER_DOCK_ITEM_VERTICAL_OFFSET = ([0-9.]+);/);
assert.ok(outerOffsetMatch, 'CommandDock should define OUTER_DOCK_ITEM_VERTICAL_OFFSET.');
assert.ok(
  Number(outerOffsetMatch[1]) <= 4,
  `Mobile dock labels should sit higher inside the touch lane; found offset ${outerOffsetMatch[1]}.`,
);

assert.ok(
  packageJson.scripts['test:navigate-mobile-emulation-regressions'],
  'package.json should expose the focused Navigate mobile emulation regression test.',
);
assert.ok(
  packageJson.scripts['test:navigate-provider-android-evidence'] &&
    packageJson.scripts['evidence:navigate-provider-android'] &&
    packageJson.scripts['gate:navigate-provider-android-evidence'],
  'package.json should expose focused Navigate provider-backed Android evidence test, manifest, and strict gate commands.',
);
[
  'provider-summary',
  'candidate-pin-screenshot',
  'active-route-line-screenshot',
  'search-freeze-artifact',
  '--strict',
].forEach((fragment) => {
  assert.ok(
    navigateProviderEvidenceRunnerSource.includes(fragment),
    `Navigate provider Android evidence runner should support operator artifact flag: ${fragment}`,
  );
});
[
  'real_provider_sanitized_summary',
  'provider_summary_contains_raw_payload_or_secret',
  'provider_summary_contains_precise_coordinates',
  'candidate_actions_incomplete',
].forEach((fragment) => {
  assert.ok(
    navigateProviderEvidenceTestSource.includes(fragment),
    `Navigate provider Android evidence regression should cover truthful provider evidence guard: ${fragment}`,
  );
});
[
  'Navigate Provider Android Sweep',
  '.smoke/navigate-provider-android-sweep/manifest.json',
  'search freeze/standby',
  'Do not commit raw provider payloads',
].forEach((fragment) => {
  assert.ok(
    androidDeviceSweepSource.includes(fragment),
    `Android device sweep runbook should document Navigate provider evidence requirement: ${fragment}`,
  );
});
assert.ok(
  releaseReadinessAuditSource.includes('gate:navigate-provider-android-evidence') &&
    releaseReadinessAuditSource.includes('.smoke/navigate-provider-android-sweep/manifest.json') &&
    releaseReadinessAuditSource.includes('broad rollout remains blocked'),
  'Release audit should tie the remaining Navigate validation gap to the strict provider-backed Android evidence gate.',
);

console.log('Navigate mobile emulation regression checks passed.');
