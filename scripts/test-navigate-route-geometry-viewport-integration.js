const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const domainPath = path.join(root, 'lib', 'routeGeometryViewport.ts');
const clientPath = path.join(root, 'lib', 'routeGeometryViewportClient.ts');
const contractsPath = path.join(root, 'lib', 'routeDataContracts.ts');
const mapRendererPath = path.join(root, 'components', 'navigate', 'MapRenderer.tsx');
const layerCoordinatorPath = path.join(root, 'lib', 'map', 'navigateMapLayerCoordinator.ts');

const navigate = fs.readFileSync(navigatePath, 'utf8');
const domain = fs.existsSync(domainPath) ? fs.readFileSync(domainPath, 'utf8') : '';
const client = fs.existsSync(clientPath) ? fs.readFileSync(clientPath, 'utf8') : '';
const contracts = fs.existsSync(contractsPath) ? fs.readFileSync(contractsPath, 'utf8') : '';
const mapRenderer = fs.existsSync(mapRendererPath) ? fs.readFileSync(mapRendererPath, 'utf8') : '';
const layerCoordinator = fs.existsSync(layerCoordinatorPath)
  ? fs.readFileSync(layerCoordinatorPath, 'utf8')
  : '';

assert(
  domain.includes('ROUTE_GEOMETRY_VIEWPORT_DEFAULT_LIMIT = 500') &&
    domain.includes('normalizeRouteGeometryViewportResponse') &&
    domain.includes('routeGeometryViewportSegmentsToOverlaySegments'),
  'MVUM viewport domain should own segment normalization and overlay conversion.',
);
assert(
  layerCoordinator.includes('class NavigateMapLayerCoordinator') &&
    layerCoordinator.includes('maxCacheEntriesPerLayer') &&
    layerCoordinator.includes('staleResponseCount'),
  'Navigate layer coordination should own bounded caching, cancellation, and stale response accounting.',
);
assert(
  client.includes("functions.invoke('route-geometry-segments'") &&
    client.includes('includeReferenceGeometry') &&
    client.includes('ROUTE_GEOMETRY_VIEWPORT_DEFAULT_LIMIT'),
  'Navigate MVUM overlay should use the route-geometry-segments endpoint.',
);
assert(
  !client.includes("functions.invoke('route-catalog-search'"),
  'MVUM geometry segment client must not call the Explore/catalog search endpoint.',
);
assert(
  contracts.includes('export type RouteCatalogSummary') &&
    contracts.includes('export type RouteDetail') &&
    contracts.includes('export type MvumSegmentSummary') &&
    contracts.includes('export type MvumSelectedSegment') &&
    contracts.includes('export type StitchedRouteDraft'),
  'Shared route contracts should expose separate Explore and Navigate runtime models.',
);
assert(
  navigate.includes('fetchRouteGeometryViewportSegments') &&
    navigate.includes('routeGeometryViewportResult') &&
    navigate.includes("readCache<RouteGeometryViewportResult>(") &&
    navigate.includes("layer: 'route_geometry'") &&
    navigate.includes('routeGeometryViewportSegmentsToOverlaySegments'),
  'Navigate should fetch, cache, and render MVUM viewport segments through the geometry segment runtime path.',
);
assert(
  navigate.includes('MvumSegmentSummary') &&
    navigate.includes('MvumSelectedSegment') &&
    navigate.includes('StitchedRouteDraft') &&
    navigate.includes('navigateRouteRuntimeContract'),
  'Navigate should adapt MVUM overlay state to the Navigate route runtime contract.',
);
assert(
  !navigate.includes('fetchRouteCatalogViewportFeatures') &&
    !navigate.includes('buildRouteCatalogViewportQuery') &&
    !navigate.includes('RouteCatalogViewportCache') &&
    !navigate.includes('routeCatalogViewportFeaturesToRouteGeometrySegments'),
  'Navigate MVUM overlay must not depend on the route catalog viewport fetch/cache/conversion path.',
);
assert(
  navigate.includes('MVUM segments need live coverage or a cached viewport for this map view.') &&
    navigate.includes('ECS route geometry needs live coverage or a cached viewport for this map view.'),
  'Navigate should present independent MVUM and Route Geometry offline availability copy.',
);
assert(
  navigate.includes('ECS catalog route service is disabled in this build.') &&
    navigate.includes("routeGeometryViewportUiState.status === 'empty'") &&
    navigate.includes('No ECS catalog routes in this map view. Pan or zoom to inspect nearby trails.'),
  'Navigate should reserve the empty-catalog message for a completed empty fetch and identify disabled builds explicitly.',
);
assert(
  navigate.includes('routeGeometryViewportSelectedSegmentsRef') &&
    navigate.includes('mergeRouteGeometryViewportSegmentsWithSelected') &&
    navigate.includes('selectedRouteGeometrySegmentIds'),
  'Navigate should preserve selected MVUM segments after panning/zooming.',
);
assert(
  !navigate.includes('localRouteGeometryOverlayBuild') &&
    navigate.includes('catalogRouteGeometryOverlaySegments') &&
    !navigate.includes('buildRouteGeometryOverlaySegments({') &&
    navigate.includes('routeGeometryOverlayBuild = useMemo'),
  'Route Geometry button should use zoomed MVUM viewport segments instead of local Explore/Favorite inventory.',
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
  mapRenderer.includes('route-geometry-halo-layer') &&
    mapRenderer.includes('route-geometry-selected-layer') &&
    mapRenderer.includes('findRouteGeometrySegmentFeatureAtPoint') &&
    mapRenderer.includes('selectedRouteGeometrySegmentIds'),
  'MapRenderer should expose selectable route geometry line layers for MVUM segment stitching.',
);
assert(
  !navigate.includes('fitMapToRouteGeometrySegments(routeGeometryOverlaySegments);') ||
    navigate.includes('if (routeGeometryOverlayBuild.catalogViewportActive) return;'),
  'Navigate should not auto-fit the camera for viewport-fetched MVUM geometry.',
);

console.log('Navigate route geometry viewport integration checks passed.');
