const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/(tabs)/navigate.tsx'), 'utf8');

function sliceBetween(start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(startIndex >= 0 && endIndex > startIndex, `Expected Navigate source block: ${start}`);
  return source.slice(startIndex, endIndex);
}

assert(
  source.includes("| 'mapSelection'") &&
    source.includes("| 'mapPointActions'") &&
    source.includes("| 'campLayers'") &&
    source.includes("| 'tools'") &&
    source.includes("| 'topPopup'") &&
    source.includes("| 'dispatchSelection'"),
  'Navigate should register every interactive map popup family in one surface-layer stack.',
);

assert(
  source.includes('return [...stack.filter((item) => item !== layer), layer];') &&
    source.includes('const latestLayer = navigateSurfaceLayerStack[navigateSurfaceLayerStack.length - 1];'),
  'Opening a Navigate surface should move it to the top, and back dismissal should read the latest layer.',
);

const openTopPopupSource = sliceBetween('const openTopPopup = useCallback', '  useEffect(() => {');
assert(
  openTopPopupSource.includes("raiseNavigateLayer('topPopup')") &&
    openTopPopupSource.includes('setTopPopupHistory') &&
    !openTopPopupSource.includes('setCampLayerMenuOpen(false)') &&
    !openTopPopupSource.includes('setToolsMenuOpen(false)'),
  'Opening a main popup should preserve older map/menu surfaces and retain nested popup history.',
);

const campToggleSource = sliceBetween('const toggleCampLayerMenu = useCallback', 'const routeBuilderPointCount');
assert(
  campToggleSource.includes("raiseNavigateLayer('campLayers')") &&
    campToggleSource.includes("removeNavigateLayer('campLayers')") &&
    !campToggleSource.includes('setToolsMenuOpen(false)') &&
    !campToggleSource.includes('setActiveTopPopup((prev)'),
  'Camp Layers should raise and dismiss itself without erasing another selected surface.',
);

const pinTapSource = sliceBetween('const handlePinTap = useCallback', '  const handleCampIntelTap');
const campTapSource = sliceBetween('const handleCampIntelTap = useCallback', '  const handleCampScoutTap');
assert(
  pinTapSource.includes("raiseNavigateLayer('mapSelection')") &&
    campTapSource.includes("raiseNavigateLayer('mapSelection')") &&
    !pinTapSource.includes('closeTopPopup()') &&
    !campTapSource.includes('closeTopPopup()'),
  'Selecting a map point should raise its detail surface without closing the menu underneath it.',
);

assert(
  source.includes('const toolsPopupVisible = mapOverlayStartupReady && toolsMenuOpen;') &&
    source.includes('const [topPopupHistory, setTopPopupHistory]') &&
    source.includes('const previousPopup = topPopupHistory[topPopupHistory.length - 1] ?? null;'),
  'Nested Tools child panels should close back through their individual popup history.',
);

assert(
  source.includes('layerId?: NavigateSurfaceLayerId;') &&
    source.includes("const layerId = options?.layerId ?? 'topPopup';") &&
    source.includes("layerId: 'campLayers'") &&
    source.includes("layerId: 'tools'") &&
    source.includes('styles.mapSelectionLayer') &&
    source.includes('mapOverlayLayerZIndex > 0'),
  'Map selections, Camp Layers, Tools, and child panels should all receive dynamic stack ordering.',
);

assert(
  !source.includes('if (navigateMajorPanelVisible || roadStepListExpanded || !campIntelVisible)') &&
    source.includes('if (roadStepListExpanded || !campIntelVisible)'),
  'Opening a newer major popup should no longer discard the selected map-point detail underneath it.',
);

console.log('navigate popup layer stack regression passed');
