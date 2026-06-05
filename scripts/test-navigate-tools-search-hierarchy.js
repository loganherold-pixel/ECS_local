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
  source.includes('styles.idleDestinationSearchWrap') &&
    source.includes('styles.idleDestinationSearchShell') &&
    source.includes('styles.idleDestinationSearchFieldShell') &&
    source.includes('SEARCH ADDRESS OR PLACE') &&
    source.includes('Enter address, town, trailhead, or place') &&
    source.includes('accessibilityLabel: \'Search address or place\''),
  'Navigate should render a polished map-level destination search banner above the map body.',
);

assert(
  source.includes('value={roadNavigation.query}') &&
    source.includes('onChangeText={roadNavigation.setQuery}') &&
    source.includes('loading={roadNavigation.searchLoading}') &&
    source.includes("returnKeyType: 'search'") &&
    source.includes('roadNavigation.suggestions.map((suggestion) =>') &&
    source.includes('onPress={() => handleRoadOverlaySelectSuggestion(suggestion)}'),
  'Idle destination search should preserve the road navigation query, keyboard, loading, and suggestion-selection wiring.',
);

assert(
  !toolsPopupSource.includes('styles.toolsSearchWrap') &&
    !toolsPopupSource.includes('SEARCH ADDRESS OR PLACE') &&
    !toolsPopupSource.includes('roadNavigation.suggestions.map((suggestion) =>') &&
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
    source.includes('styles.campLayerMenuPanel') &&
    source.includes('accessibilityLabel="Camp map layers"') &&
    source.includes('name="bonfire-outline"') &&
    source.includes('bottom: TOOLS_TRIGGER_BOTTOM, right: TOOLS_TRIGGER_RIGHT'),
  'Camp layers should be exposed through a dedicated camp icon button above the Tools icon.',
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
  toolsPopupSource.includes('STITCH ROUTES') &&
    toolsPopupSource.includes('MANUAL CAMP AREA REVIEW') &&
    !toolsPopupSource.includes('DRAW CAMP POTENTIAL AREA') &&
    toolsPopupSource.indexOf('STITCH ROUTES') < toolsPopupSource.indexOf('MANUAL CAMP AREA REVIEW'),
  'Stitch routes should stay in Route utilities while internal manual CampOps area review remains lower in Explore.',
);

assert(
  toolsPopupSource.includes('styles.toolsUtilityStack') &&
    toolsPopupSource.includes('title="ROUTE PLANNING"') &&
    toolsPopupSource.includes('title="COMMUNITY CONTRIBUTIONS"') &&
    toolsPopupSource.includes('title="FIELD OPS"') &&
    toolsPopupSource.includes('title="MAP AND OFFLINE"') &&
    toolsPopupSource.indexOf('title="ROUTE PLANNING"') < toolsPopupSource.indexOf('BUILD ROUTE PLAN') &&
    toolsPopupSource.indexOf('BUILD ROUTE PLAN') < toolsPopupSource.indexOf('STITCH ROUTES') &&
    toolsPopupSource.indexOf('STITCH ROUTES') < toolsPopupSource.indexOf("accessibilityLabel={routeBuilderActive ? 'Exit Build Route mode' : 'Build a route'}") &&
    toolsPopupSource.indexOf("accessibilityLabel={routeBuilderActive ? 'Exit Build Route mode' : 'Build a route'}") < toolsPopupSource.indexOf('IMPORT') &&
    !toolsPopupSource.includes('EXPLORE ROUTES') &&
    toolsPopupSource.indexOf('title="COMMUNITY CONTRIBUTIONS"') < toolsPopupSource.indexOf('RECOMMEND CAMPSITE') &&
    toolsPopupSource.indexOf('RECOMMEND CAMPSITE') < toolsPopupSource.indexOf('RECOMMEND ROUTE') &&
    toolsPopupSource.indexOf('RECOMMEND ROUTE') < toolsPopupSource.indexOf('MANUAL CAMP AREA REVIEW') &&
    toolsPopupSource.indexOf('title="FIELD OPS"') < toolsPopupSource.indexOf('RECORD TRAIL') &&
    toolsPopupSource.indexOf('RECORD TRAIL') < toolsPopupSource.indexOf('SUBMIT AS TRAIL PACK') &&
    toolsPopupSource.indexOf('SUBMIT AS TRAIL PACK') < toolsPopupSource.indexOf('DROP PIN') &&
    toolsPopupSource.indexOf('title="MAP AND OFFLINE"') > toolsPopupSource.indexOf('DROP PIN') &&
    toolsPopupSource.indexOf('OFFLINE MAPS') > toolsPopupSource.indexOf('title="MAP AND OFFLINE"') &&
    toolsPopupSource.includes('RECENT SEARCHES') &&
    toolsPopupSource.includes('PINS'),
  'Utilities should be grouped into Route Planning, Community Contributions, Field Ops, and Map and Offline while preserving existing Recent Searches and Pins utilities.',
);

assert(
  toolsPopupSource.includes('BUILD ROUTE PLAN') &&
    source.includes("router.push('/explore-trip-builder' as any)") &&
    toolsPopupSource.includes('onPress={handleOpenStitch}') &&
    toolsPopupSource.includes('onPress={() => runToolsAction(handleRouteBuilderTriggerPress)}') &&
    toolsPopupSource.includes('onPress={handleOpenImportRoute}') &&
    !toolsPopupSource.includes('onPress={toggleExploreRoutesOverlay}') &&
    toolsPopupSource.includes('onPress={openRecommendCampsiteChooser}') &&
    toolsPopupSource.includes('onPress={openRecommendRouteChooser}') &&
    toolsPopupSource.includes('onPress={() => runToolsAction(handleOpenCampScoutIntro)}') &&
    toolsPopupSource.includes("openToolsChildPopup('trail')") &&
    toolsPopupSource.includes('onPress={() => runToolsAction(handleSubmitActiveRouteAsTrailPack)}') &&
    toolsPopupSource.includes('onPress={() => runToolsAction(handleDropPinHere)}') &&
    toolsPopupSource.includes("openToolsChildPopup('offlineCache')"),
  'Grouped utilities should keep the existing button handlers wired.',
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
    recommendRoutePopupSource.includes('onPress={() => runToolsAction(handleRouteBuilderTriggerPress)}'),
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
