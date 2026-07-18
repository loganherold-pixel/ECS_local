const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const mvumDomainPath = path.join(root, 'lib', 'routeGeometryViewport.ts');
const mvumClientPath = path.join(root, 'lib', 'routeGeometryViewportClient.ts');
const catalogDomainPath = path.join(root, 'lib', 'routeCatalogViewport.ts');
const catalogClientPath = path.join(root, 'lib', 'routeCatalogViewportClient.ts');
const cachePath = path.join(root, 'lib', 'routeGeometryViewportCache.ts');
const mapRendererPath = path.join(root, 'components', 'navigate', 'MapRenderer.tsx');
const layerCoordinatorPath = path.join(root, 'lib', 'map', 'navigateMapLayerCoordinator.ts');

const read = (filename) => fs.readFileSync(filename, 'utf8').replace(/\r\n/g, '\n');
const navigate = read(navigatePath);
const mvumDomain = read(mvumDomainPath);
const mvumClient = read(mvumClientPath);
const catalogDomain = read(catalogDomainPath);
const catalogClient = read(catalogClientPath);
const cache = read(cachePath);
const mapRenderer = read(mapRendererPath);
const layerCoordinator = read(layerCoordinatorPath);

assert(
  layerCoordinator.includes('class NavigateMapLayerCoordinator') &&
    layerCoordinator.includes('maxCacheEntriesPerLayer') &&
    layerCoordinator.includes('staleResponseCount'),
  'Navigate must preserve the one bounded layer coordinator for MVUM and ECS routes.',
);

assert(
  mvumDomain.includes('normalizeRouteGeometryViewportResponse') &&
    mvumClient.includes("functions.invoke('route-geometry-segments'") &&
    !mvumClient.includes("functions.invoke('route-catalog-search'"),
  'MVUM must keep the close-detail route-geometry-segments provider path.',
);
assert(
  catalogDomain.includes('ROUTE_CATALOG_VIEWPORT_MIN_ZOOM = 8') &&
    catalogDomain.includes('resolveRouteCatalogViewportSelection') &&
    catalogDomain.includes('routeCatalogViewportFeaturesToRouteGeometrySegments') &&
    catalogClient.includes("functions.invoke('route-catalog-search'") &&
    !catalogClient.includes("functions.invoke('route-geometry-segments'"),
  'ECS Route Geometry must use whole route-catalog features rather than MVUM segments.',
);

assert(
  navigate.includes('fetchRouteGeometryViewportSegments') &&
    navigate.includes('setMvumViewportResult') &&
    navigate.includes("layer: 'mvum'"),
  'The mounted Navigate MVUM effect must keep its own segment client, result, and coordinator layer.',
);
assert(
  navigate.includes('fetchRouteCatalogViewportFeatures') &&
    navigate.includes('buildRouteCatalogViewportQuery') &&
    navigate.includes('setRouteCatalogViewportResult') &&
    navigate.includes("layer: 'route_geometry'"),
  'The mounted ECS Route Geometry effect must fetch whole route catalog records through the shared coordinator.',
);
assert.strictEqual(
  (navigate.match(/new NavigateMapLayerCoordinator\(\)/g) ?? []).length,
  1,
  'Navigate must mount exactly one map-layer coordinator.',
);
assert(
  navigate.includes('const routeGeometryViewportZoomReady = isRouteCatalogViewportZoomEligible(mapZoom)') &&
    navigate.includes('const mvumViewportZoomReady = mapZoom >= MVUM_OVERLAY_MIN_ZOOM'),
  'ECS suggested routes and MVUM segments must retain independent zoom eligibility.',
);

assert(
  cache.includes('readRouteCatalogViewportOfflineCache') &&
    cache.includes('writeRouteCatalogViewportOfflineCache') &&
    cache.includes('readRouteGeometryViewportOfflineCache') &&
    navigate.includes('readRouteCatalogViewportOfflineCache(cacheKey)') &&
    navigate.includes('writeRouteCatalogViewportOfflineCache({') &&
    navigate.includes('readRouteGeometryViewportOfflineCache') &&
    navigate.includes('writeRouteGeometryViewportOfflineCache({'),
  'Both overlays must preserve truthful offline caches without sharing result shapes.',
);

assert(
  navigate.includes('RouteCatalogViewportProviderUnavailableError') &&
    navigate.includes('RouteCatalogViewportTimeoutError') &&
    navigate.includes("safeErrorCode: 'OFFLINE_NO_CACHE'") &&
    navigate.includes("safeErrorCode: 'REQUEST_START_FAILED'") &&
    navigate.includes("status: resultForCache.returnedCount > 0 ? 'ready' : 'empty'"),
  'The mounted ECS route request must terminate for provider, timeout, offline miss, start failure, ready, and empty results.',
);

assert(
  navigate.includes('resolveRouteCatalogViewportSelection(') &&
    navigate.includes('routeCatalogViewportSelection?.overlaySegmentIds ?? []') &&
    navigate.includes('setSelectedRouteCatalogViewportFeatureId(selection.routeId)') &&
    !navigate.slice(
      navigate.indexOf('const handleRouteGeometrySegmentTap = useCallback'),
      navigate.indexOf('const handleBuildMvumStitchedRoute = useCallback'),
    ).includes('routeGeometrySegmentToRouteBuilderSegment'),
  'Selecting an ECS line must select its stable whole-route identity instead of entering the MVUM/custom-segment builder.',
);

assert(
  navigate.includes('handleSaveRouteCatalogSelection') &&
    navigate.includes("sourceApp: 'ecs_navigate_route_catalog'") &&
    navigate.includes('routeStore.createCustomRoute') &&
    navigate.includes('runStore.createFromRoute') &&
    navigate.includes('routeStore.attachRun') &&
    navigate.includes('ECS ROUTE SAVED - AVAILABLE IN TOOLS STITCH'),
  'Save Route must persist one canonical route and linked run through the existing Tools Stitch inventory path.',
);
assert(
  catalogDomain.includes('buildRouteCatalogViewportGuidancePlan') &&
    catalogDomain.includes('findNearestPlausibleRouteProjection') &&
    catalogDomain.includes('splitGuidanceRouteAtProjection') &&
    navigate.includes('buildRouteCatalogViewportGuidancePlan') &&
    navigate.includes('handleRouteCatalogStartHybridGuidance') &&
    navigate.includes('applyExploreNavigationPayload(payload)') &&
    navigate.includes('CURRENT GPS LOCATION REQUIRED TO NAVIGATE TO THIS ROUTE'),
  'Navigate to Route must project GPS onto canonical geometry and use the existing guidance handoff.',
);
assert(
  catalogDomain.includes('buildRouteCatalogViewportPersistencePlan') &&
    catalogDomain.includes('normalizeNavigationGuidanceGeometry(feature.geometry') &&
    navigate.includes('buildRouteCatalogViewportPersistencePlan') &&
    navigate.includes('!feature.properties.guidanceReady') &&
    navigate.includes('selectedRouteCatalogViewportBuildUnavailableReason'),
  'Preview or otherwise non-guidance-ready catalog geometry must remain blocked from save/guidance.',
);

assert(
  mapRenderer.includes('route-geometry-halo-layer') &&
    mapRenderer.includes('route-geometry-selected-layer') &&
    mapRenderer.includes('findRouteGeometrySegmentFeatureAtPoint') &&
    mapRenderer.includes('selectedRouteGeometrySegmentIds'),
  'The actual mounted renderer must expose stable selectable ECS route layers.',
);

console.log('Navigate ECS route catalog viewport integration checks passed.');
