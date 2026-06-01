const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const discover = read(path.join('app', '(tabs)', 'discover.tsx'));

assert(
  discover.includes('ROUTE_CATALOG_PRESET_SEARCH_AREAS') &&
    discover.includes('buildManualRouteCatalogSearchArea') &&
    discover.includes('routeCatalogManualSearchArea') &&
    discover.includes('routeCatalogSearchAreaModalVisible') &&
    discover.includes('routeCatalogSearchAreaKey') &&
    discover.includes('setRouteCatalogSearchAreaKey'),
  'Explore should expose preset and manual route catalog search areas.',
);

assert(
  discover.includes('routeCatalogEffectiveSearchArea') &&
    discover.includes('routeCatalogHasSearchArea') &&
    discover.includes('routeCatalogSearchCoordinate') &&
    discover.includes('routeCatalogEffectiveSearchArea.latitude') &&
    discover.includes('routeCatalogEffectiveSearchArea.longitude') &&
    discover.includes('radiusMiles: activeDistanceRadius') &&
    discover.includes("locationSource: routeCatalogEffectiveSearchArea ? routeCatalogEffectiveSearchArea.source : 'search_area_required'"),
  'Route catalog criteria should use the selected search area or live GPS, never the default fallback coordinate.',
);

assert(
    discover.includes('if (!routeCatalogHasSearchArea) return;') &&
    discover.includes('refreshLiveTrailPackCatalog(routeCatalogSearchCriteria)') &&
    discover.includes('routeCatalogHasSearchArea ? discoverableTrailPacks.filter(isPublicSuggestedTrailheadTrailPack) : []') &&
    discover.includes('Trail Packs need GPS or a selected search area to filter verified routes by radius.'),
  'Suggested Trailheads should require GPS or an explicit search area before showing radius-filtered catalog results.',
);

assert(
  discover.includes('testID="route-catalog-search-area-control"') &&
    discover.includes('ROUTE CATALOG AREA') &&
    discover.includes('TextInput') &&
    discover.includes('Manual Center') &&
    discover.includes('Apply Center') &&
    discover.includes('manual_search_center') &&
    discover.includes('Suggested Trailheads only show verified catalog routes within the selected radius.'),
  'Explore should show a compact search-area control with a manual CONUS center path.',
);

console.log('Explore route catalog search-area checks passed');
