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
const compassRoseSource = read('components/navigate/CompassRose.tsx');
const roadNavigationSource = read('lib/useRoadNavigation.ts');
const commandDockSource = read('components/CommandDock.tsx');
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
  Number(keyboardRenderLimitMatch[1]) <= 2,
  `Keyboard-active search should render at most two suggestion rows during the hot input path; found ${keyboardRenderLimitMatch[1]}.`,
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
    mapRendererSource.includes("const renderLiveWebView = shouldLoadMap && !standbyMapActive && motionPriority !== 'cold' && !webRendererCrashBlocked;"),
  'MapRenderer should place no-overlay warm idle maps into a static standby instead of keeping the live WebView renderer hot.',
);
assert.ok(
  mapRendererSource.includes("motionPriority === 'cold'") &&
    mapRendererSource.includes("standbyMapActive || motionPriority === 'cold' || webReady"),
  'Cold frozen map states should still report ready without mounting a live WebView during foreground search.',
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
  mapRendererSource.includes('var mapPixelRatio = Math.min(window.devicePixelRatio || 1') &&
    mapRendererSource.includes('compactTileCacheSize ? 0.75 : 1') &&
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
  navigateSource.includes('standbyWakeDisabled={idleDestinationSearchVisible && !destinationSearchMapFrozen}'),
  'Parked idle destination search should keep the standby map visually useful without letting map-background taps wake the live WebView.',
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

console.log('Navigate mobile emulation regression checks passed.');
