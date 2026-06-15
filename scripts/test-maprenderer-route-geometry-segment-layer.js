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
    source.includes('route-geometry-halo-layer') &&
    source.includes('route-geometry-selected-layer'),
  'MapRenderer should style route geometry segments through dedicated line/halo treatment.',
);
assert(
  source.includes("'line-color': '#F2C24D'") &&
    !source.includes("'line-color': ['get', 'color'],\n              'line-width': 2.75") &&
    !source.includes("'line-color': ['get', 'color'],\n              'line-width': 5.5"),
  'Route geometry segment layers should render in ECS gold/yellow rather than source-specific blue/green.',
);

assert(
  source.includes('findRouteGeometrySegmentFeatureAtPoint') &&
    source.includes('if (routeBuilderActive && findRouteGeometrySegmentFeatureAtPoint(point)) return false;'),
  'Route builder pointer start should not begin freehand drawing when pressing selectable route geometry.',
);

const clickStart = source.indexOf("map.on('click', function(e)");
assert(clickStart >= 0, 'MapRenderer click handler should exist.');
const clickSource = source.slice(clickStart, clickStart + 2800);
assert(
  clickSource.includes("routeGeometryProps.kind === 'route_geometry_segment'") &&
    clickSource.indexOf("routeGeometryProps.kind === 'route_geometry_segment'") <
      clickSource.indexOf("props.kind === 'explore_route'") &&
    clickSource.includes("send('segmentTap'") &&
    clickSource.includes('routeGeometrySourceKind: routeGeometryProps.routeGeometrySourceKind || null'),
  'MapRenderer should report route geometry segment taps before Explore route taps with metadata.',
);

assert(
  source.includes('routeGeometrySelected') &&
    source.includes('selectedRouteGeometrySegmentIds'),
  'MapRenderer should preserve selected route geometry state for styling.',
);

assert(
  !source.includes('updateRouteGeometryOverlayCandidates') &&
    !source.includes('queryRenderedRouteGeometryCandidates'),
  'MapRenderer should not synthesize route geometry from raw rendered Mapbox features in v1.',
);

console.log('MapRenderer route geometry segment layer checks passed.');
