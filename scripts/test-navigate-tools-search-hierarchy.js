const fs = require('fs');
const path = require('path');

const navigatePath = path.join(process.cwd(), 'app/(tabs)/navigate.tsx');
const source = fs.readFileSync(navigatePath, 'utf8').replace(/\r\n/g, '\n');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  source.includes('styles.toolsSearchHeader') &&
    source.includes('styles.toolsSearchTitleRow') &&
    source.includes('SEARCH ADDRESS OR PLACE') &&
    source.includes('Build custom road navigation from a destination search.'),
  'Tools popup search should have a visible route-building label and helper line.',
);

assert(
  source.includes('styles.toolsSearchFieldShell') &&
    source.includes('style={styles.toolsSearchField}') &&
    source.includes('Enter address, town, trailhead, or place'),
  'Tools popup search input should sit in a distinct shell with clearer placeholder copy.',
);

assert(
  source.includes('value={roadNavigation.query}') &&
    source.includes('onChangeText={roadNavigation.setQuery}') &&
    source.includes('loading={roadNavigation.searchLoading}') &&
    source.includes("returnKeyType: 'search'"),
  'Tools popup search behavior and keyboard wiring should remain unchanged.',
);

assert(
  source.includes('toolsSearchFieldShell: {') &&
    source.includes("borderColor: 'rgba(196,138,44,0.36)'") &&
    source.includes('toolsSearchField: {') &&
    source.includes('minHeight: 44'),
  'Tools popup search should have mobile-friendly contrast and a slightly tighter tap height.',
);

const toolsPopupStart = source.indexOf("renderMapPopup(\n    toolsPopupVisible");
const toolsPopupEnd = source.indexOf("renderMapPopup(\n    campScoutIntroVisible", toolsPopupStart);
assert(toolsPopupStart >= 0 && toolsPopupEnd > toolsPopupStart, 'Navigate should render Tools and Camp Scout popup sections.');
const toolsPopupSource = source.slice(toolsPopupStart, toolsPopupEnd);
const savedRoutesPopupStart = source.indexOf("renderMapPopup(\n    savedRoutesModalVisible");
const savedRoutesPopupEnd = source.indexOf("renderMapPopup(\n    preflightPacketModalVisible", savedRoutesPopupStart);
assert(savedRoutesPopupStart >= 0 && savedRoutesPopupEnd > savedRoutesPopupStart, 'Navigate should render the Saved Routes popup.');
const savedRoutesPopupSource = source.slice(savedRoutesPopupStart, savedRoutesPopupEnd);

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
    !toolsPopupSource.includes('Community</Text>') &&
    !toolsPopupSource.includes('Private</Text>') &&
    !toolsPopupSource.includes('Pending</Text>'),
  'Campsite layer buttons should not be followed by redundant legend pills.',
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
    toolsPopupSource.includes('DRAW CAMP POTENTIAL AREA') &&
    toolsPopupSource.indexOf('STITCH ROUTES') < toolsPopupSource.indexOf('DRAW CAMP POTENTIAL AREA'),
  'Stitch routes should replace the old Draw Area position, with Draw Camp Potential Area moved lower.',
);

assert(
  toolsPopupSource.includes('styles.toolsUtilityStack') &&
    toolsPopupSource.includes('styles.toolsUtilitySection') &&
    toolsPopupSource.includes('styles.toolsUtilitySectionLabel') &&
    toolsPopupSource.includes('>ROUTE</Text>') &&
    toolsPopupSource.includes('>EXPLORE</Text>') &&
    toolsPopupSource.includes('>FIELD OPS</Text>') &&
    toolsPopupSource.indexOf('>ROUTE</Text>') < toolsPopupSource.indexOf('BUILD ROUTE PLAN') &&
    toolsPopupSource.indexOf('BUILD ROUTE PLAN') < toolsPopupSource.indexOf('STITCH ROUTES') &&
    toolsPopupSource.indexOf('STITCH ROUTES') < toolsPopupSource.indexOf('DRAW ROUTE') &&
    toolsPopupSource.indexOf('DRAW ROUTE') < toolsPopupSource.indexOf('IMPORT') &&
    !toolsPopupSource.includes('EXPLORE ROUTES') &&
    toolsPopupSource.indexOf('>EXPLORE</Text>') < toolsPopupSource.indexOf('Recommend Campsite') &&
    toolsPopupSource.indexOf('Recommend Campsite') < toolsPopupSource.indexOf('DRAW CAMP POTENTIAL AREA') &&
    toolsPopupSource.indexOf('>FIELD OPS</Text>') < toolsPopupSource.indexOf('RECORD TRAIL') &&
    toolsPopupSource.indexOf('RECORD TRAIL') < toolsPopupSource.indexOf('SUBMIT AS TRAIL PACK') &&
    toolsPopupSource.indexOf('SUBMIT AS TRAIL PACK') < toolsPopupSource.indexOf('DROP PIN') &&
    toolsPopupSource.indexOf('OFFLINE') > toolsPopupSource.indexOf('DROP PIN') &&
    toolsPopupSource.includes('RECENT SEARCHES') &&
    toolsPopupSource.includes('PINS') &&
    source.includes('toolsUtilitySectionLabel:') &&
    source.includes('color: TACTICAL.goldMedium'),
  'Utilities should be grouped into Route, Explore, and Field Ops while preserving existing Recent Searches and Pins utilities.',
);

assert(
  toolsPopupSource.includes('BUILD ROUTE PLAN') &&
    source.includes("router.push('/explore-trip-builder' as any)") &&
    toolsPopupSource.includes('onPress={handleOpenStitch}') &&
    toolsPopupSource.includes('onPress={() => runToolsAction(handleRouteBuilderTriggerPress)}') &&
    toolsPopupSource.includes('onPress={handleOpenImportRoute}') &&
    !toolsPopupSource.includes('onPress={toggleExploreRoutesOverlay}') &&
    toolsPopupSource.includes('onPress={openRecommendCampsiteChooser}') &&
    toolsPopupSource.includes('onPress={() => runToolsAction(handleOpenCampScoutIntro)}') &&
    toolsPopupSource.includes("openToolsChildPopup('trail')") &&
    toolsPopupSource.includes('onPress={() => runToolsAction(handleSubmitActiveRouteAsTrailPack)}') &&
    toolsPopupSource.includes('onPress={() => runToolsAction(handleDropPinHere)}') &&
    toolsPopupSource.includes("openToolsChildPopup('offlineCache')"),
  'Grouped utilities should keep the existing button handlers wired.',
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
