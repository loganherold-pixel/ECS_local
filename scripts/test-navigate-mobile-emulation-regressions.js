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
assert.ok(
  navigateSource.includes('deferredIdleDestinationSearchSuggestions.slice(0, idleDestinationSearchRenderLimit)'),
  'Visible Navigate search suggestions should be sliced from the deferred mobile list.',
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
