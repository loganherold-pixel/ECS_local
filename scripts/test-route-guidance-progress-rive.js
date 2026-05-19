const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

const widgetSource = read('components/dashboard/WidgetRenderers.tsx');
const miniMapSource = read('components/dashboard/RouteProgressMiniMap.tsx');
const geometrySource = read('components/dashboard/routeGeometryUtils.ts');
const activeRouteProgressSource = read('lib/activeRouteProgress.ts');
const mapConfigSource = read('lib/mapConfig.ts');
const packageJson = JSON.parse(read('package.json'));

assert.ok(
  fs.existsSync(path.join(root, 'assets/dashboard/route-progress-placeholder.png')),
  'route-progress-placeholder.png must be bundled under assets/dashboard.',
);

includes(
  miniMapSource,
  "ROUTE_PROGRESS_MINI_MAP_STYLE_URL =\n  'mapbox://styles/expeditioncommand/cmpax1px3005a01sq5doe9xml'",
  'RouteProgressMiniMap should document the ECS route-progress Mapbox style URL.',
);
includes(miniMapSource, "mapStyle=\"route-progress\"", 'RouteProgressMiniMap should render the ECS route-progress Mapbox style.');
includes(mapConfigSource, "key: 'route-progress'", 'Map config should expose the route-progress style key.');
includes(mapConfigSource, "mapbox://styles/expeditioncommand/cmpax1px3005a01sq5doe9xml", 'Map config should use the requested style URL.');
includes(miniMapSource, 'getMapboxTokenSync()', 'RouteProgressMiniMap should use the existing ECS Mapbox token config.');
includes(miniMapSource, 'void getMapboxToken()', 'RouteProgressMiniMap should resolve Mapbox tokens asynchronously when needed.');
notIncludes(miniMapSource, 'pk.', 'RouteProgressMiniMap must not hardcode a public Mapbox token.');

includes(miniMapSource, '<Image', 'Inactive RouteProgressMiniMap should render an image placeholder.');
includes(miniMapSource, 'resizeMode="cover"', 'Inactive placeholder must preserve aspect ratio with cover behavior.');
includes(miniMapSource, '<MapRenderer', 'Active RouteProgressMiniMap should render the existing ECS Mapbox renderer.');
includes(
  miniMapSource,
  'const hasActiveMap = Boolean(isGuidanceActive && routeFeature && mapToken)',
  'Active RouteProgressMiniMap should not fall back to the static placeholder solely because GPS/currentLocation is temporarily missing.',
);
includes(miniMapSource, 'interactive={false}', 'Dashboard mini-map should disable user interaction.');
includes(miniMapSource, 'points={routePoints}', 'Mini-map should pass remaining route geometry to Mapbox.');
includes(miniMapSource, 'progressPoints={progressPoints}', 'Mini-map should pass completed route geometry to Mapbox.');
includes(miniMapSource, 'showUserLocation={Boolean(markerLocation)}', 'Mini-map should render a real current-location marker when available.');
includes(miniMapSource, 'cameraCommand={cameraCommand}', 'Mini-map should fit and orient the active route with a camera command.');

includes(geometrySource, 'normalizeRouteFeature', 'Route geometry utilities should normalize LineString inputs.');
includes(geometrySource, 'getRouteDistance', 'Route geometry utilities should calculate route distance.');
includes(geometrySource, 'splitRouteAtProgress', 'Route geometry utilities should split completed and remaining route segments.');
includes(geometrySource, 'projectLocationToRouteProgress', 'Route geometry utilities should derive progress from current location.');
includes(geometrySource, 'getRouteCameraBearing', 'Route geometry utilities should calculate left-to-right camera bearing.');
includes(geometrySource, 'getRouteBounds', 'Route geometry utilities should calculate fit bounds.');
includes(geometrySource, 'getCurrentPointOnRoute', 'Route geometry utilities should expose current point by progress.');

includes(widgetSource, "import RouteProgressMiniMap, { buildRouteProgressFeatureFromPoints } from './RouteProgressMiniMap'", 'Dashboard should import RouteProgressMiniMap.');
includes(widgetSource, "require('../../assets/dashboard/route-progress-placeholder.png')", 'Dashboard should use the dark topographical placeholder asset.');
includes(widgetSource, '<RouteProgressMiniMap', 'Route Progress visual should mount RouteProgressMiniMap.');
includes(widgetSource, 'routeGeoJson={route?.routeGeoJson ?? null}', 'Route Progress mini-map should receive real route geometry.');
includes(widgetSource, 'currentLocation={route?.currentLocation ?? null}', 'Route Progress mini-map should receive current location.');
includes(widgetSource, 'progressPercent={route?.progressPercent ?? null}', 'Route Progress mini-map should receive route progress.');
includes(widgetSource, 'inactivePlaceholderSource={ROUTE_PROGRESS_PLACEHOLDER}', 'Route Progress mini-map should use the provided inactive placeholder image.');
includes(widgetSource, 'useActiveRouteProgressSnapshot(options)', 'Route progress must come from ECS route state, not mock data.');
notIncludes(widgetSource, "import RouteGuidanceProgressRive from './RouteGuidanceProgressRive'", 'Dashboard route progress should not import the old Rive wrapper.');
notIncludes(widgetSource, '<RouteGuidanceProgressRive', 'Dashboard route progress should not mount Rive.');
notIncludes(widgetSource, 'attitude-command-route-guidance-progress-rive', 'Dashboard route progress should not expose Rive test IDs.');
notIncludes(widgetSource, 'ROUTE_PROGRESS_PATH', 'Dashboard route progress should not use fake SVG route paths.');
notIncludes(widgetSource, 'Math.random()', 'Route progress must not animate from random values.');

includes(activeRouteProgressSource, 'routePoints?: NavigateRouteMapPoint[]', 'Active route progress snapshots should expose route geometry.');
includes(activeRouteProgressSource, 'currentLocation?: { latitude: number; longitude: number } | null', 'Active route progress snapshots should expose current location.');
includes(activeRouteProgressSource, 'originLocation?: { latitude: number; longitude: number } | null', 'Active route progress snapshots should expose origin.');
includes(activeRouteProgressSource, 'destinationLocation?: { latitude: number; longitude: number } | null', 'Active route progress snapshots should expose destination.');

assert.strictEqual(
  packageJson.scripts['test:route-progress-minimap'],
  'node ./scripts/test-route-guidance-progress-rive.js',
  'package.json should expose the route-progress mini-map regression script.',
);

console.log('[route-progress-minimap] contract passed');
