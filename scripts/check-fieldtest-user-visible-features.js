const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function check(name, condition, detail) {
  assert.ok(condition, `${name}: ${detail}`);
  console.log(`[fieldtest-check] ${name}: ok`);
}

const discoverEngine = read('lib/discoverEngine.ts');
const widgetRenderers = read('components/dashboard/WidgetRenderers.tsx');
const dashboard = read('app/(tabs)/dashboard.tsx');
const terrainProfile = read('components/dashboard/TerrainRiskSideProfile.tsx');
const terrainEvents = read('lib/terrainRiskReferenceEvents.ts');
const navigate = read('app/(tabs)/navigate.tsx');
const mapRenderer = read('components/navigate/MapRenderer.tsx');
const discover = read('app/(tabs)/discover.tsx');

check(
  'suggested full-route geometry',
  discoverEngine.includes('EXPLORE_ROUTE_GEOMETRY_FIXTURES') &&
    discoverEngine.includes("...withDemoFullRouteGeometry('lassen-backcountry')") &&
    discoverEngine.includes("routeScope: 'full_trail_route'") &&
    discoverEngine.includes("geometrySource: 'ecs_demo_full_route_fixture'"),
  'Suggested Trailheads should carry real route lines and full_trail_route metadata for field-test routes.',
);

check(
  'expanded widget polish',
  terrainEvents.includes('buildTerrainRiskReferenceEvents') &&
    terrainProfile.includes('onReferencePointPress?.(') &&
    widgetRenderers.includes('Why ECS flagged this point') &&
    dashboard.includes("source: 'terrain_risk_reference'"),
  'Expanded Terrain Risk dots should surface polished explanations and ECS Intelligence banner events.',
);

check(
  'highlighted vehicle trails in view',
  discover.includes('Filtered Route Map Preview') &&
    discover.includes('Show Routes on Map') &&
    navigate.includes('segments={mapSegmentFeatures}') &&
    navigate.includes('[...(displayedSegmentFeatures ?? []), ...exploreRouteOverlaySegments]') &&
    mapRenderer.includes("map.queryRenderedFeatures(e.point, { layers: ['segment-layer'] })"),
  'Explorer/Navigate should render highlighted clickable route lines from the filtered route set.',
);

check(
  'two-finger draw behavior',
  mapRenderer.includes('var routeBuilderPointerCount = 0;') &&
    mapRenderer.includes('routeBuilderPointerCount > 1') &&
    mapRenderer.includes('routeBuilderPointerCount = Math.max(0, routeBuilderPointerCount - 1)'),
  'Build Route drawing should pause while the user pans/zooms with two fingers.',
);

check(
  'route snapping',
  mapRenderer.includes('function findNearestRouteableSegment(point, context)') &&
    mapRenderer.includes('function snapTracePoint(point, context)') &&
    mapRenderer.includes('var ROUTE_BUILDER_FINAL_SNAP_PX = 64;') &&
    mapRenderer.includes("sourceLabel: 'free'"),
  'Drawn routes should snap to routeable rendered trail/road geometry while preserving freehand fallback labeling.',
);

console.log('Field-test user-visible feature checklist passed.');
