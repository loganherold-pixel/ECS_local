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
    discover.includes('ROUTE_CATALOG_COVERAGE_AREAS') &&
    discover.includes('const routeCatalogSearchAreaKey: RouteCatalogPresetSearchAreaKey | null = null') &&
    !discover.includes('buildManualRouteCatalogSearchArea') &&
    !discover.includes('getRouteCatalogCoverageSummary') &&
    !discover.includes('getRouteCatalogCoverageNotice') &&
    !discover.includes('routeCatalogManualSearchArea') &&
    !discover.includes('routeCatalogCoverageSummary') &&
    !discover.includes('routeCatalogCoverageNotice') &&
    !discover.includes('routeCatalogSearchAreaModalVisible') &&
    !discover.includes('setRouteCatalogSearchAreaKey'),
  'Explore should keep route source search area logic internal without exposing preset or manual catalog selectors.',
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
    discover.includes('Trail Packs need GPS or an internal search area to filter verified routes by radius.'),
  'Suggested Trailheads should require GPS or an internal search area before showing radius-filtered source results.',
);

assert(
  !discover.includes('testID="route-catalog-search-area-control"') &&
    !discover.includes('<View style={s.routeCatalogSearchAreaCard}') &&
    !discover.includes('ROUTE CATALOG AREA') &&
    !discover.includes('Suggested Trailheads only show verified catalog routes within the selected radius.') &&
    !discover.includes('Loading Route Catalog') &&
    !discover.includes('Route Catalog Unavailable') &&
    !discover.includes('verified catalog routes') &&
    !discover.includes('current trail catalog') &&
    discover.includes('Showing verified routes within') &&
    discover.includes('Loading Trail Source') &&
    discover.includes('Trail Source Unavailable') &&
    discover.includes('routeCatalogEffectiveSearchArea') &&
    discover.includes('routeCatalogHasSearchArea'),
  'Explore should keep route-source search logic available while hiding route catalog controls and copy from the user-visible Explorer surface.',
);

console.log('Explore route catalog search-area checks passed');
