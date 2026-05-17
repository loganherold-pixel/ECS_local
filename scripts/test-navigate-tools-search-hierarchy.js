const fs = require('fs');
const path = require('path');

const navigatePath = path.join(process.cwd(), 'app/(tabs)/navigate.tsx');
const source = fs.readFileSync(navigatePath, 'utf8');

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
    source.includes('minHeight: 48'),
  'Tools popup search should have mobile-friendly contrast and tap height.',
);

const toolsPopupStart = source.indexOf("renderMapPopup(\n    toolsPopupVisible");
const toolsPopupEnd = source.indexOf("renderMapPopup(\n    campScoutIntroVisible", toolsPopupStart);
assert(toolsPopupStart >= 0 && toolsPopupEnd > toolsPopupStart, 'Navigate should render Tools and Camp Scout popup sections.');
const toolsPopupSource = source.slice(toolsPopupStart, toolsPopupEnd);

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
  source.includes('toggleEstablishedCampsites') &&
    source.includes('toggleDispersedCampingEligibility') &&
    source.includes('accessibilityRole="checkbox"') &&
    source.includes('Shows known fixed campgrounds, RV parks, and pay-per-night camping locations.') &&
    source.includes('Always verify current local rules, posted closures, fire restrictions, permits, and agency guidance before camping.'),
  'Camp layer panel should reuse existing checkbox state and preserve campground/dispersed warning copy.',
);

console.log('navigate tools search hierarchy regression passed');
