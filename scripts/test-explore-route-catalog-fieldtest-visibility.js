const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const discover = read(path.join('app', '(tabs)', 'discover.tsx'));
const liveCatalog = read(path.join('lib', 'explore', 'liveTrailPackCatalog.ts'));

assert(
  liveCatalog.includes('ROUTE_CATALOG_VEHICLE_CLASS_ALIASES') &&
    liveCatalog.includes('export function resolveRouteCatalogVehicleClass') &&
    liveCatalog.includes('resolveRouteCatalogVehicleClass(criteria.vehicleClass)') &&
    liveCatalog.includes('truck:') &&
    liveCatalog.includes('suv:') &&
    liveCatalog.includes('jeep:') &&
    liveCatalog.includes('motorcycle:') &&
    liveCatalog.includes('vehicleClass }'),
  'Route catalog search should normalize Fleet vehicle types into catalog vehicle_fit classes instead of forwarding raw app labels that can filter every route out.',
);

assert(
  discover.includes('routeCatalogLocationCriteria') &&
    discover.includes('routeCatalogHasSearchArea') &&
    discover.includes('stableRouteCatalogSearchCoordinate') &&
    discover.includes('latitude: stableRouteCatalogSearchCoordinate.latitude') &&
    discover.includes('longitude: stableRouteCatalogSearchCoordinate.longitude') &&
    discover.includes("locationSource: routeCatalogEffectiveSearchArea?.source ?? 'search_area_required'"),
  'Explore should only send radius-bounded route-catalog searches from a stable live GPS/search-area bucket, never around the Kansas fallback or raw GPS jitter.',
);

assert(
  discover.includes('routeCatalogHasSearchArea') &&
    discover.includes('routeCatalogSearchAreaKey') &&
    discover.includes('ROUTE_CATALOG_PRESET_SEARCH_AREAS') &&
    !discover.includes('routeCatalogManualSearchArea') &&
    discover.includes('if (!routeCatalogHasSearchArea)') &&
    discover.includes('Search Area Needed'),
  'Suggested Trailheads should require GPS or an internal search area without exposing the old manual route catalog selector.',
);

assert(
  !discover.includes('testID="route-catalog-search-area-control"') &&
    !discover.includes('Suggested Trailheads only show verified catalog routes within the selected radius.') &&
    !discover.includes('ROUTE CATALOG AREA') &&
    discover.includes('Showing verified routes within'),
  'Selected search areas should remain internally radius-filtered without exposing route catalog controls on the Explorer surface.',
);

assert(
  discover.includes('routeCatalogCurationCoverageNotice') &&
    discover.includes('liveTrailPackCatalogSnapshot.searchMeta?.curationCandidateCount') &&
    discover.includes('liveTrailPackCatalogSnapshot.searchMeta?.anySourceBackedCandidateCount') &&
    discover.includes('source-backed route record') &&
    discover.includes('do not currently satisfy ECS public guidance requirements') &&
    discover.includes('testID="explore-route-catalog-not-guidance-ready-state"'),
  'Explore should surface curation-only route catalog coverage without treating those records as public Suggested Trailheads.',
);

console.log('Explore route catalog field-test visibility checks passed');
