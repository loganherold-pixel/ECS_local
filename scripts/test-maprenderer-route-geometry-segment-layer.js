const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mapRendererPath = path.join(root, 'components', 'navigate', 'MapRenderer.tsx');
const source = fs.readFileSync(mapRendererPath, 'utf8').replace(/\r\n/g, '\n');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  source.includes("kind?: 'explore_route' | 'route_geometry_segment'") ||
    source.includes("kind?: string"),
  'MapRenderer SegmentFeature should allow route_geometry_segment metadata.',
);

assert(
  source.includes('routeGeometrySourceKind?: string | null') &&
    source.includes('routeGeometryDataState?: string | null') &&
    source.includes('routeGeometryConfidence?: string | null') &&
    source.includes('routeGeometryWarningsJson?: string | null'),
  'MapRenderer segment payloads should carry route geometry source, state, confidence, and warning metadata.',
);

assert(
  source.includes("['==', ['get', 'kind'], 'route_geometry_segment']") &&
    source.includes("NAVIGATE_ROUTE_GEOMETRY_SOURCE_ID = 'navigate-route-geometry-source'") &&
    source.includes('route-geometry-halo-layer') &&
    source.includes('route-geometry-selected-layer'),
  'MapRenderer should style route geometry segments through a dedicated source and line/halo treatment.',
);
const baseLayerStart = source.indexOf('mapLayerRegistry.ensure(ROUTE_GEOMETRY_LAYER_ID');
const selectedLayerStart = source.indexOf('mapLayerRegistry.ensure(ROUTE_GEOMETRY_SELECTED_LAYER_ID');
const routeGeometryUpdateStart = source.indexOf('function updateRouteGeometryOverlay', selectedLayerStart);
assert(
  baseLayerStart >= 0 && selectedLayerStart > baseLayerStart && routeGeometryUpdateStart > selectedLayerStart,
  'Dedicated ECS route geometry base and selected layer definitions should exist.',
);
const baseLayerSource = source.slice(baseLayerStart, selectedLayerStart);
const selectedLayerSource = source.slice(selectedLayerStart, routeGeometryUpdateStart);
assert(
  baseLayerSource.includes("'line-color': '#F2C24D'") &&
    selectedLayerSource.includes("'line-color': '#2ECC71'"),
  'Unselected ECS routes should render yellow while the selected whole-route treatment renders green.',
);

assert(
  source.includes('findRouteGeometrySegmentFeatureAtPoint') &&
    source.includes('var routeGeometryTapRadius = 9;') &&
    source.includes('point.x - routeGeometryTapRadius') &&
    source.includes('point.x + routeGeometryTapRadius') &&
    source.includes('if (routeBuilderActive && findRouteGeometrySegmentFeatureAtPoint(point)) return false;'),
  'ECS route selection should use a bounded tap target and should not begin freehand drawing near selectable geometry.',
);

const clickStart = source.indexOf("mapListenerRegistry.attach('click', null, function(e)");
assert(clickStart >= 0, 'MapRenderer registered click handler should exist.');
const clickSource = source.slice(clickStart, clickStart + 4600);
assert(
  clickSource.includes("routeGeometryProps.kind === 'route_geometry_segment'") &&
    clickSource.indexOf("routeGeometryProps.kind === 'route_geometry_segment'") <
      clickSource.indexOf('MVUM_OVERLAY_SELECTED_LAYER_ID') &&
    clickSource.indexOf("routeGeometryProps.kind === 'route_geometry_segment'") <
      clickSource.indexOf("props.kind === 'explore_route'") &&
    clickSource.includes("send('segmentTap'") &&
    clickSource.includes('id: routeGeometryProps.sourceSegmentId || routeGeometryFeature.id || null') &&
    clickSource.includes('routeGeometrySourceKind: routeGeometryProps.routeGeometrySourceKind || null'),
  'MapRenderer should report route geometry taps before overlapping MVUM/Explore layers and return the original catalog segment ID.',
);

assert(
  source.includes('sourceSegmentId: String(segment.sourceSegmentId ?? segment.id ?? index)') &&
    source.includes('sourceSegmentId: segment.sourceSegmentId || segment.id || null'),
  'The dedicated Mapbox source should retain the unprefixed catalog segment identity through serialization and hit-testing.',
);

assert(
  source.includes('routeGeometrySelected') &&
    source.includes('selectedRouteGeometrySegmentIds'),
  'MapRenderer should preserve selected route geometry state for styling.',
);

const routeGeometryIdentityNames = [
  'NAVIGATE_ROUTE_GEOMETRY_SOURCE_ID',
  'NAVIGATE_ROUTE_GEOMETRY_HALO_LAYER_ID',
  'NAVIGATE_ROUTE_GEOMETRY_LAYER_ID',
  'NAVIGATE_ROUTE_GEOMETRY_SELECTED_LAYER_ID',
];
const routeGeometryIdentities = routeGeometryIdentityNames.map((constantName) => {
  const match = source.match(new RegExp(`export const ${constantName} = '([^']+)'`));
  return match ? match[1] : null;
});
assert(
  routeGeometryIdentities.every(Boolean) &&
    new Set(routeGeometryIdentities).size === routeGeometryIdentities.length &&
    source.includes("mapListenerRegistry.attach('style.load'") &&
    source.includes("replayPendingPayloadAfterStyleChange('style_load', 0)") &&
    source.includes('mapSourceExists(ROUTE_GEOMETRY_SOURCE_ID)') &&
    source.includes('mapLayerExists(ROUTE_GEOMETRY_SELECTED_LAYER_ID)'),
  'ECS route geometry should keep stable, unique source/layer identities and rebuild them after a style reload.',
);

assert(
  !source.includes('updateRouteGeometryOverlayCandidates') &&
    !source.includes('queryRenderedRouteGeometryCandidates'),
  'MapRenderer should not synthesize route geometry from raw rendered Mapbox features in v1.',
);

console.log('MapRenderer route geometry segment layer checks passed.');
