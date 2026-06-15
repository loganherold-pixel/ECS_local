const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const domainPath = path.join(root, 'lib', 'routeGeometryViewport.ts');
const clientPath = path.join(root, 'lib', 'routeGeometryViewportClient.ts');

const navigate = fs.readFileSync(navigatePath, 'utf8');
const domain = fs.existsSync(domainPath) ? fs.readFileSync(domainPath, 'utf8') : '';
const client = fs.existsSync(clientPath) ? fs.readFileSync(clientPath, 'utf8') : '';

assert(domain.includes('ROUTE_GEOMETRY_VIEWPORT_MIN_ZOOM = 10'), 'Viewport domain should define zoom 10+ gate.');
assert(domain.includes('ROUTE_GEOMETRY_VIEWPORT_DEFAULT_LIMIT = 500'), 'Viewport geometry should request the full ECS segment cap for the zoomed viewport.');
assert(
  client.includes("return normalized !== '0' && normalized !== 'false' && normalized !== 'off';"),
  'Route geometry viewport overlay should be enabled by default unless explicitly disabled.',
);
assert(
  navigate.includes('fetchRouteGeometryViewportSegments') &&
    navigate.includes('routeGeometryViewportUiState') &&
    navigate.includes('routeGeometryViewportFetchCoordinatorRef') &&
    navigate.includes('routeGeometryViewportOverlayEnabled'),
  'Navigate should wire a dedicated route geometry viewport fetcher behind the Route Geometry overlay.',
);
assert(
  navigate.includes('Zoom to 10+ to show ECS trail segments.'),
  'Navigate should show explicit zoom-too-low copy for ECS trail segments.',
);
assert(
  navigate.includes('routeGeometryViewportSelectedSegmentsRef') &&
    navigate.includes('mergeRouteGeometryViewportSegmentsWithSelected') &&
    navigate.includes('selectedRouteGeometrySegmentIds'),
  'Navigate should preserve selected viewport segments after panning/zooming.',
);
assert(
  !navigate.includes('localRouteGeometryOverlayBuild') &&
    navigate.includes('catalogRouteGeometryOverlaySegments') &&
    !navigate.includes('buildRouteGeometryOverlaySegments({') &&
    navigate.includes('routeGeometryOverlayBuild = useMemo'),
  'Route Geometry button should use zoomed ECS catalog viewport segments instead of local Explorer/Favorite inventory.',
);
assert(
  navigate.includes('resolveNearestRouteGeometryEndpoint') &&
    navigate.includes('ROUTE_GEOMETRY_VIEWPORT_PLANNING_SOURCE') &&
    navigate.includes('sourceApp: options?.sourceApp ?? (hasRouteGeometrySegmentBuild ?'),
  'Navigate Plan should resolve a nearest endpoint while preserving ECS route geometry planning metadata.',
);
assert(
  !navigate.includes('fitMapToRouteGeometrySegments(routeGeometryOverlaySegments);') ||
    navigate.includes('if (routeGeometryOverlayBuild.catalogViewportActive) return;'),
  'Navigate should not auto-fit the camera for viewport-fetched catalog geometry.',
);

console.log('Navigate route geometry viewport integration checks passed.');
