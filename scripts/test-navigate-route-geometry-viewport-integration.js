const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const domainPath = path.join(root, 'lib', 'routeCatalogViewport.ts');
const clientPath = path.join(root, 'lib', 'routeCatalogViewportClient.ts');
const mapRendererPath = path.join(root, 'components', 'navigate', 'MapRenderer.tsx');

const navigate = fs.readFileSync(navigatePath, 'utf8');
const domain = fs.existsSync(domainPath) ? fs.readFileSync(domainPath, 'utf8') : '';
const client = fs.existsSync(clientPath) ? fs.readFileSync(clientPath, 'utf8') : '';
const mapRenderer = fs.existsSync(mapRendererPath) ? fs.readFileSync(mapRendererPath, 'utf8') : '';

assert(domain.includes('ROUTE_CATALOG_VIEWPORT_DEFAULT_LIMIT = 500'), 'Viewport catalog query should request the full ECS route cap for the zoomed viewport.');
assert(domain.includes('buildRouteCatalogViewportQuery'), 'Viewport catalog service should build bbox/radius/region queries.');
assert(domain.includes('queryRouteCatalogViewportRecords'), 'Viewport catalog service should filter authoritative route catalog records by map bounds.');
assert(domain.includes('routeCatalogViewportFeaturesToRouteGeometrySegments'), 'Viewport catalog service should normalize catalog routes into Mapbox line segments.');
assert(domain.includes('featureKind') && domain.includes('trailhead_marker'), 'Viewport catalog service should emit point fallbacks only when route geometry is missing.');
assert(domain.includes('guidanceReady') && domain.includes('geometryStatus'), 'Viewport catalog features should expose guidance readiness and geometry status metadata.');
assert(
  client.includes("functions.invoke('route-catalog-search'") &&
    client.includes('includeGeometry: true') &&
    client.includes('includePreviewGeometry: true') &&
    client.includes('recommendationOnly: false'),
  'Navigate route geometry viewport should use route-catalog-search with full catalog geometry, not the segment-only endpoint.',
);
assert(
  navigate.includes('fetchRouteCatalogViewportFeatures') &&
    navigate.includes('buildRouteCatalogViewportQuery') &&
    navigate.includes('RouteCatalogViewportCache') &&
    navigate.includes('routeCatalogViewportFeaturesToRouteGeometrySegments'),
  'Navigate should wire the ECS route geometry toggle to the shared route catalog viewport service.',
);
assert(
  navigate.includes('routeCatalogViewportResult') &&
    navigate.includes('routeCatalogViewportPointMarkers') &&
    navigate.includes('routeGeometryViewportFetchCoordinatorRef') &&
    navigate.includes('routeGeometryViewportOverlayEnabled'),
  'Navigate should keep debounced viewport loading, line features, and trailhead/centroid marker fallbacks.',
);
assert(
  navigate.includes('Zoom to 10+ to show ECS catalog routes.'),
  'Navigate should show explicit zoom-too-low copy for ECS catalog routes.',
);
assert(
  navigate.includes('setRouteCatalogViewportResult') &&
    navigate.includes('routeCatalogViewportCacheRef.current.get') &&
    navigate.includes('routeCatalogViewportCacheRef.current.set'),
  'Navigate should cache repeated ECS route catalog viewport queries.',
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
  navigate.includes('selectedRouteCatalogViewportFeature') &&
    navigate.includes('handleRouteCatalogNavigateToTrailhead') &&
    navigate.includes('handleRouteCatalogStartHybridGuidance') &&
    navigate.includes('handleRouteCatalogBuildRouteFromTrail') &&
    navigate.includes('handleRouteCatalogAddOrStitchSegment') &&
    navigate.includes('NAVIGATE TO TRAILHEAD') &&
    navigate.includes('START HYBRID GUIDANCE') &&
    navigate.includes('BUILD ROUTE FROM TRAIL') &&
    navigate.includes('ADD/STITCH SEGMENT'),
  'Navigate should let operators select catalog routes and choose trailhead, hybrid guidance, build, or stitch actions.',
);
assert(
  navigate.includes('geometryStatusCopy') &&
    navigate.includes('TRAILHEAD ONLY') &&
    navigate.includes('INSUFFICIENT GEOMETRY') &&
    navigate.includes('GUIDANCE READY'),
  'Navigate should distinguish guidance-ready, trailhead-only, and insufficient-geometry catalog routes.',
);
assert(
  navigate.includes('resolveNearestRouteGeometryEndpoint') &&
    navigate.includes('ROUTE_GEOMETRY_VIEWPORT_PLANNING_SOURCE') &&
    navigate.includes('hasRouteGeometrySegmentBuild') &&
    navigate.includes("sourceApp:\n        options?.sourceApp ??") &&
    navigate.includes("'ecs_route_geometry_overlay'") &&
    navigate.includes("externalSourceType:\n        options?.externalSourceType ??") &&
    navigate.includes("'route_geometry_overlay'"),
  'Navigate Plan should resolve a nearest endpoint while preserving ECS route geometry planning metadata.',
);
assert(
  mapRenderer.includes('markerKind?: string') &&
    mapRenderer.includes('routeCatalogRouteId') &&
    mapRenderer.includes('geometryStatus') &&
    mapRenderer.includes('guidanceReady'),
  'MapRenderer should preserve route catalog marker metadata through pin tap payloads.',
);
assert(
  !navigate.includes('fitMapToRouteGeometrySegments(routeGeometryOverlaySegments);') ||
    navigate.includes('if (routeGeometryOverlayBuild.catalogViewportActive) return;'),
  'Navigate should not auto-fit the camera for viewport-fetched catalog geometry.',
);

console.log('Navigate route geometry viewport integration checks passed.');
