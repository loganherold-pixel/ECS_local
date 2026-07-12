const fs = require('fs');
const path = require('path');

const navigatePath = path.join(process.cwd(), 'app/(tabs)/navigate.tsx');
const source = fs.readFileSync(navigatePath, 'utf8').replace(/\r\n/g, '\n');
const campsiteFormPath = path.join(process.cwd(), 'components/navigate/RecommendCampsiteForm.tsx');
const campsiteFormSource = fs.readFileSync(campsiteFormPath, 'utf8').replace(/\r\n/g, '\n');
const toolSurfacePath = path.join(process.cwd(), 'components/navigate/NavigateToolSurface.tsx');
const toolSurfaceSource = fs.existsSync(toolSurfacePath)
  ? fs.readFileSync(toolSurfacePath, 'utf8').replace(/\r\n/g, '\n')
  : '';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requireIndex(haystack, needle, message) {
  const index = haystack.indexOf(needle);
  assert(index >= 0, message);
  return index;
}

const toolsPopupStart = source.indexOf("renderMapPopup(\n    toolsPopupVisible");
const toolsPopupEnd = source.indexOf("renderMapPopup(\n    campScoutIntroVisible", toolsPopupStart);
assert(toolsPopupStart >= 0 && toolsPopupEnd > toolsPopupStart, 'Navigate should render Tools and Camp Scout popup sections.');
const toolsPopupSource = source.slice(toolsPopupStart, toolsPopupEnd);
const savedRoutesPopupStart = source.indexOf("renderMapPopup(\n    savedRoutesModalVisible");
const savedRoutesPopupEnd = source.indexOf("renderMapPopup(\n    preflightPacketModalVisible", savedRoutesPopupStart);
assert(savedRoutesPopupStart >= 0 && savedRoutesPopupEnd > savedRoutesPopupStart, 'Navigate should render the Saved Routes popup.');
const savedRoutesPopupSource = source.slice(savedRoutesPopupStart, savedRoutesPopupEnd);
const recommendRoutePopupStart = source.indexOf("renderMapPopup(\n    recommendRouteModalVisible");
const recommendRoutePopupEnd = source.indexOf("renderMapPopup(\n  pinDrawerVisible", recommendRoutePopupStart);

assert(
  source.includes('const idleDestinationSearchVisible =') &&
    source.includes("navigationOverlayMode === 'idle'") &&
    source.includes("navigationOverlayMode === 'search'") &&
    source.includes('!toolsMenuOpen') &&
    source.includes('!activeTopPopup') &&
    source.includes('!roadNavigation.session.destination') &&
    source.includes('campScoutAreaMode === \'idle\''),
  'Navigate should gate the destination search banner to idle/search map state with no tools, guidance, route preview, or staged destination active.',
);

assert(
  source.includes('const mvumRouteStitchInProgress =') &&
    source.includes('selectedMvumSegmentIds.length > 0') &&
    source.includes("mvumStitchStatus !== 'ready' || !mvumStitchedRouteDraft?.geometry") &&
    source.includes('const navigateRouteCompositionActive =') &&
    source.includes('routeBuilderActive ||') &&
    source.includes('stitchModalVisible ||') &&
    source.includes('stitchSaving ||') &&
    source.includes('!navigateRouteCompositionActive'),
  'Navigate should hide destination search throughout route building and stitching, then restore it after cancel or a completed build.',
);

assert(
  source.includes('styles.idleDestinationSearchWrap') &&
    source.includes('styles.idleDestinationSearchShell') &&
    source.includes('styles.idleDestinationSearchFieldShell') &&
    source.includes('SEARCH ADDRESS OR PLACE') &&
    source.includes('Enter address, town, trailhead, or place') &&
    source.includes('accessibilityLabel: \'Search address or place\''),
  'Navigate should render a polished map-level destination search banner above the map body.',
);

assert(
  source.includes('value={idleDestinationSearchDraftQuery}') &&
    source.includes('onChangeText={handleIdleDestinationSearchChangeText}') &&
    source.includes('loading={idleDestinationSearchLoadingVisible}') &&
    source.includes('const idleDestinationSearchLoadingVisible =\n  roadNavigation.searchLoading && !destinationSearchInputActive;') &&
    source.includes("testID: 'navigate-destination-search-input'") &&
    source.includes('testID="navigate-destination-search-query-state"') &&
    source.includes("returnKeyType: 'search'") &&
    source.includes('const IDLE_DESTINATION_SEARCH_RENDER_LIMIT = 5;') &&
    source.includes('const IDLE_DESTINATION_SEARCH_KEYBOARD_RENDER_LIMIT = 1;') &&
    source.includes('const visibleIdleDestinationSearchSuggestions = useMemo(') &&
    source.includes('destinationSearchInputActive ? IDLE_DESTINATION_SEARCH_KEYBOARD_RENDER_LIMIT : IDLE_DESTINATION_SEARCH_RENDER_LIMIT') &&
    source.includes('.slice(0, idleDestinationSearchRenderLimit)') &&
    source.includes('idleDestinationSearchResultsLabel') &&
    source.includes('visibleIdleDestinationSearchSuggestions.map((suggestion) =>') &&
    source.includes('onPress={() => handleRoadOverlaySelectSuggestion(suggestion)}'),
  'Idle destination search should preserve draft-query typing, hidden focused spinner, and compact bounded result windows on mobile.',
);

assert(
  !toolsPopupSource.includes('styles.toolsSearchWrap') &&
    !toolsPopupSource.includes('SEARCH ADDRESS OR PLACE') &&
    !toolsPopupSource.includes('visibleIdleDestinationSearchSuggestions.map((suggestion) =>') &&
    !toolsPopupSource.includes('recentSearchesSectionVisible'),
  'Tools popup should no longer own address/place search input, search results, or recent destination rows.',
);

assert(
  source.includes('idleDestinationSearchFieldShell: {') &&
    source.includes("borderColor: 'rgba(196,138,44,0.36)'") &&
    source.includes('idleDestinationSearchField: {') &&
    source.includes('minHeight: 44'),
  'Map-level search should have mobile-friendly contrast and a compact tactical tap target.',
);

assert(
  toolSurfaceSource.includes('export function NavigateToolHero') &&
    toolSurfaceSource.includes('export function NavigateToolSection') &&
    toolSurfaceSource.includes('export function NavigateToolActionCard') &&
    toolSurfaceSource.includes('export function NavigateToolFooter') &&
    toolSurfaceSource.includes('export function NavigateToolBadgeRow'),
  'Navigate Tools polish should use shared child-popup surface primitives.',
);

assert(
  !toolsPopupSource.includes('Established Campgrounds') &&
    !toolsPopupSource.includes('Dispersed Camping Eligibility'),
  'Established Campgrounds and Dispersed Camping Eligibility should not live inside the Tools popup.',
);

assert(
    source.includes('const [campLayerMenuOpen, setCampLayerMenuOpen] = useState(false);') &&
    source.includes('const toggleCampLayerMenu = useCallback') &&
    source.includes('styles.campLayerMenuPopupContent') &&
    source.includes('testID="navigate-camp-layer-menu-toggle"') &&
    source.includes('testID="navigate-camp-layer-menu-panel"') &&
    source.includes('accessibilityLabel="Camp map layers"') &&
    source.includes('name="bonfire-outline"') &&
    source.includes('bottom: TOOLS_TRIGGER_BOTTOM, right: TOOLS_TRIGGER_RIGHT'),
  'Camp layers should be exposed through a dedicated camp icon button above the Tools icon.',
);

assert(
  !source.includes('accessibilityLabel="Draw area to search for campsites"\n          >') &&
    source.includes('testID="navigate-route-geometry-overlay-toggle"') &&
    source.includes("accessibilityValue={{ text: routeGeometryOverlayEnabled ? 'on' : 'off' }}"),
  'Right-side map control rail should not be grouped under a stale campsite label, and route geometry needs a stable stateful QA target.',
);

assert(
  !toolsPopupSource.includes('toolsMetricRow') &&
    !toolsPopupSource.includes('SPEED</Text>') &&
    !toolsPopupSource.includes('GPS</Text>') &&
    !toolsPopupSource.includes('MAP</Text>'),
  'Tools popup should not show duplicate Speed/GPS/Map metric cards.',
);

assert(
  !toolsPopupSource.includes('CAMPING') &&
    !toolsPopupSource.includes('CAMPSITE LAYERS') &&
    !toolsPopupSource.includes('Community</Text>') &&
    !toolsPopupSource.includes('Private</Text>') &&
    !toolsPopupSource.includes('Pending</Text>') &&
    !toolsPopupSource.includes('PENDING'),
  'Campsite layer buttons and redundant legend pills should stay out of the generic Tools popup.',
);

assert(
  !toolsPopupSource.includes('>INTEL</Text>') &&
    !toolsPopupSource.includes('REMOTE ON') &&
    !toolsPopupSource.includes('REMOTE UNAVAILABLE') &&
    source.includes('accessibilityLabel="Remoteness map overlay"'),
  'Intel should be removed from Tools and Remoteness should live on the map control rail.',
);

assert(
  toolsPopupSource.includes('<ScrollView') &&
    toolsPopupSource.includes('style={styles.toolsPopupScroll}') &&
    toolsPopupSource.includes('contentContainerStyle={styles.toolsPopupContent}') &&
    toolsPopupSource.includes('keyboardShouldPersistTaps="handled"') &&
    toolsPopupSource.includes('styles.toolsFixedContent'),
  'Main Tools popup should be scroll-owned so lower Community Contributions actions remain reachable on mobile.',
);

assert(
  toolsPopupSource.includes("placement: 'center'") &&
    toolsPopupSource.includes("fullBody: false") &&
    !toolsPopupSource.includes("snapToContent: true") &&
    source.includes('snapToContent?: boolean') &&
    source.includes("placement?: 'right' | 'center' | 'bottomRight'") &&
    source.includes('styles.mapPopupCloseButton') &&
    source.includes("accessibilityLabel={`Close ${title.toLowerCase()} popup`}"),
  'Main Tools popup should be centered in the map body with the shared top-right close button.',
);

assert(
  source.includes('const TOOLS_POPUP_WIDTH = Math.min(MAP_POPUP_WIDTH, adaptive.isExpanded ? 420 : 348);') &&
    source.includes('toolsDenseActionCard: {\n  width: \'48%\',\n  minHeight: 54') &&
    source.includes('toolsCommunityActionCard: {\n  width: \'100%\',\n  minHeight: 58') &&
    source.includes('toolsCommunityActionGrid: {\n  flexDirection: \'row\',\n  gap: 6') &&
    toolSurfaceSource.includes('actionTitleRow: {\n    flexDirection: \'row\',\n    alignItems: \'flex-start\'') &&
    toolSurfaceSource.includes('flexWrap: \'wrap\'') &&
    toolSurfaceSource.includes('alignSelf: \'flex-start\'') &&
    toolSurfaceSource.includes('actionTitleCompact: {\n    fontSize: 9.5,\n    lineHeight: 12'),
  'Tools popup should give Recommend Campsite and Recommend Route enough button height/width for full labels without clipping.',
);

assert(
  source.includes('toolsPopupContent: {\n  alignSelf:') &&
    source.includes('toolsPopupScroll: {\n  flex: 1') &&
    !source.includes('toolsPopupContent: {\n  flex: 1') &&
    !source.includes('toolsFixedContent: {\n  flex: 1'),
  'Tools popup should put flex on the ScrollView while keeping the command content naturally sized.',
);

const toolsSectionTitles = Array.from(
  toolsPopupSource.matchAll(/<NavigateToolSection\s+title="([^"]+)"/g),
).map((match) => match[1]);
assert(
  JSON.stringify(toolsSectionTitles) === JSON.stringify(['SAVED ROUTES', 'ROUTE PLANNING', 'COMMUNITY CONTRIBUTIONS']),
  `Main Tools sections should be Saved Routes, Route Planning, and Community Contributions only. Saw: ${toolsSectionTitles.join(', ')}`,
);

assert(
  source.includes('const refreshSavedRouteAssets = useCallback(() => {') &&
    source.includes('setSavedRoutesRefreshKey((key) => key + 1);') &&
    source.includes('const unsubscribeRoutes = routeStore.subscribe(refreshSavedRouteAssets);') &&
    source.includes('refreshSavedRouteAssets();') &&
    source.includes('[refreshSavedRouteAssets]'),
  'Route Command Center preview counts should subscribe to routeStore changes so imported/custom routes are counted before opening the center.',
);

const mapPresentationIndex = requireIndex(toolsPopupSource, 'MAP PRESENTATION', 'Tools should put the map presentation selector first.');
const styleSelectorIndex = requireIndex(toolsPopupSource, 'MAP_STYLE_MODE_OPTIONS.map', 'Tools should preserve the existing map style selector options.');
const forecastIndex = requireIndex(toolsPopupSource, 'CURRENT LOCATION FORECAST', 'Tools should render a compact current-location forecast row.');
const savedRoutesIndex = requireIndex(toolsPopupSource, 'title="SAVED ROUTES"', 'Tools should expose a Saved Routes section.');
const routePlanningIndex = requireIndex(toolsPopupSource, 'title="ROUTE PLANNING"', 'Tools should expose a Route Planning section.');
const communityIndex = requireIndex(toolsPopupSource, 'title="COMMUNITY CONTRIBUTIONS"', 'Tools should expose a Community Contributions section.');
assert(
  mapPresentationIndex < styleSelectorIndex &&
    styleSelectorIndex < forecastIndex &&
    forecastIndex < savedRoutesIndex &&
    savedRoutesIndex < routePlanningIndex &&
    routePlanningIndex < communityIndex,
  'Tools panel order should be map presentation, forecast, saved routes, route planning, then community contributions.',
);

assert(
  !toolsPopupSource.includes('FIELD OPS') &&
    !toolsPopupSource.includes('MAP AND OFFLINE') &&
    !toolsPopupSource.includes('MY CAMPSITES') &&
    !toolsPopupSource.includes('SUBMIT AS TRAIL PACK') &&
    !toolsPopupSource.includes('MANUAL CAMP AREA REVIEW') &&
    !toolsPopupSource.includes('DRAW CAMP POTENTIAL AREA') &&
    !toolsPopupSource.includes('EXPLORE ROUTES'),
  'Primary Tools panel should not include removed Field Ops, Map and Offline, My Campsites, Trail Pack, CampOps review, or Explore Routes entries.',
);

assert(
  routePlanningIndex < requireIndex(toolsPopupSource, 'BUILD ROUTE PLAN', 'Route Planning should include Build Route Plan.') &&
    requireIndex(toolsPopupSource, 'BUILD ROUTE PLAN', 'Route Planning should include Build Route Plan.') <
      requireIndex(toolsPopupSource, 'STITCH ROUTES', 'Route Planning should include Stitch Routes.') &&
    requireIndex(toolsPopupSource, 'STITCH ROUTES', 'Route Planning should include Stitch Routes.') <
      requireIndex(toolsPopupSource, 'IMPORT', 'Route Planning should include Import.') &&
    toolsPopupSource.includes('RECORD TRAIL') &&
    toolsPopupSource.includes('RECENT SEARCHES') &&
    toolsPopupSource.includes('DROP PIN') &&
    toolsPopupSource.includes('OFFLINE MAPS') &&
    toolsPopupSource.includes('PINS'),
  'Route Planning should keep build, stitch, import, record, recent searches, pin, pins, and offline map actions together.',
);

assert(
  toolsPopupSource.includes('BUILD ROUTE PLAN') &&
    source.includes("router.push('/explore-trip-builder' as any)") &&
    toolsPopupSource.includes('onPress={handleOpenStitch}') &&
    !toolsPopupSource.includes('onPress={() => runToolsAction(handleRouteBuilderTriggerPress)}') &&
    source.includes('handleLongPressDrawRoute') &&
    toolsPopupSource.includes('onPress={handleOpenImportRoute}') &&
    toolsPopupSource.includes("openToolsChildPopup('trail')") &&
    toolsPopupSource.includes('onPress={() => runToolsAction(handleDropPinHere)}') &&
    toolsPopupSource.includes("openToolsChildPopup('offlineCache')") &&
    !toolsPopupSource.includes('onPress={toggleExploreRoutesOverlay}') &&
    !toolsPopupSource.includes('onPress={() => runToolsAction(handleOpenCampScoutIntro)}') &&
    !toolsPopupSource.includes('onPress={() => runToolsAction(handleSubmitActiveRouteAsTrailPack)}') &&
    toolsPopupSource.includes('onPress={openRecommendCampsiteChooser}') &&
    toolsPopupSource.includes('onPress={openRecommendRouteChooser}'),
  'Grouped utilities should keep route/community handlers wired while removing primary Trail Pack and manual CampOps actions.',
);

assert(
  toolsPopupSource.includes('style={styles.toolsCommunityActionGrid}') &&
    toolsPopupSource.includes('[styles.toolsDenseActionCard, styles.toolsCommunityActionCard]') &&
    requireIndex(toolsPopupSource, 'title="COMMUNITY CONTRIBUTIONS"', 'Tools should expose a Community Contributions section.') <
      requireIndex(toolsPopupSource, 'RECOMMEND CAMPSITE', 'Community Contributions should include Recommend Campsite.') &&
    requireIndex(toolsPopupSource, 'RECOMMEND CAMPSITE', 'Community Contributions should include Recommend Campsite.') <
      requireIndex(toolsPopupSource, 'RECOMMEND ROUTE', 'Community Contributions should include Recommend Route.'),
  'Community contribution actions should use full-row action cards so Recommend Campsite and Recommend Route fit inside their buttons.',
);

assert(
  recommendRoutePopupStart >= 0 && recommendRoutePopupEnd > recommendRoutePopupStart,
  'Navigate should render a Recommend Route child popup from Tools.',
);
const recommendRoutePopupSource = source.slice(recommendRoutePopupStart, recommendRoutePopupEnd);

assert(
  source.includes("'recommendRoute'") &&
    source.includes('const recommendRouteModalVisible =') &&
    recommendRoutePopupSource.includes('TRAIL PACK-BACKED CONTRIBUTION') &&
    recommendRoutePopupSource.includes('Recommend Route') &&
    recommendRoutePopupSource.includes('Submit as Trail Pack') &&
    recommendRoutePopupSource.includes('onPress={() => runToolsAction(handleSubmitActiveRouteAsTrailPack)}') &&
    recommendRoutePopupSource.includes('onPress={() => runToolsAction(handleSubmitImportedRouteAsTrailPack)}') &&
    recommendRoutePopupSource.includes('onPress={handleOpenBuildRoutePlan}') &&
    recommendRoutePopupSource.includes("openToolsChildPopup('trail')") &&
    !recommendRoutePopupSource.includes('onPress={() => runToolsAction(handleRouteBuilderTriggerPress)}') &&
    source.includes('handleLongPressDrawRoute'),
  'Recommend Route should explain the phase-1 Trail Pack path and expose staged/imported/build/record route sources.',
);

assert(
  campsiteFormSource.includes('Step 2: Verify Campsite Details') &&
    campsiteFormSource.includes('Step 3: Choose Visibility') &&
    campsiteFormSource.includes('Step 4: Submit Or Save') &&
    campsiteFormSource.includes('Community submissions remain pending until ECS review.') &&
    campsiteFormSource.includes('Private and group saves stay scoped to you or your selected group.'),
  'Recommend Campsite form should read as a guided community contribution flow without changing submission logic.',
);

assert(
  !toolsPopupSource.includes('CAMP INTEL ON') &&
    !toolsPopupSource.includes('CAMP INTEL OFF') &&
    !toolsPopupSource.includes('bed-outline'),
  'Tools utilities should remove the old Camp Intel toggle button and its on/off copy.',
);

assert(
  source.includes('autoStoppedTrailRecordingRef') &&
    source.includes("trailNavigation.uiMode !== 'arrived'") &&
    source.includes("trailStore.getStatus()") &&
    source.includes('trailStore.stop(activeExpeditionName || trailSession.payload?.title || null)') &&
    source.includes('Trail complete. ECS saved the recording in Trail Status.'),
  'Trail recording should auto-stop and save when trail navigation reaches arrival.',
);

assert(
  !savedRoutesPopupSource.includes('savedRouteAssetCounts.imported} imported') &&
    !savedRoutesPopupSource.includes('savedRouteAssetCounts.custom} custom') &&
    !savedRoutesPopupSource.includes('savedRouteAssetCounts.stitched} stitched') &&
    !savedRoutesPopupSource.includes('savedRouteAssetCounts.bookmarked} saved'),
  'Saved Routes command center should not repeat imported/custom/stitched/saved pills above the filter row.',
);

assert(
  source.includes('toggleEstablishedCampsites') &&
    source.includes('toggleDispersedCampingEligibility') &&
    source.includes('accessibilityRole="checkbox"') &&
    source.includes('Shows known fixed campgrounds, RV parks, and pay-per-night camping locations.') &&
    source.includes('Always verify current local rules, posted closures, fire restrictions, permits, and agency guidance before camping.'),
  'Camp layer panel should reuse existing checkbox state and preserve campground/dispersed warning copy.',
);

console.log('navigate tools search hierarchy regression passed');
