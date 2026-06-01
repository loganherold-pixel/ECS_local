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
const fallbackSurfaceSource = read('components/navigate/MapFallbackSurface.tsx');
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
  "ROUTE_PROGRESS_MINI_MAP_STYLE_URL",
  'RouteProgressMiniMap should document the ECS route-progress Mapbox style URL.',
);
includes(miniMapSource, "mapbox://styles/mapbox/dark-v11", 'RouteProgressMiniMap should document the tactical dark Mapbox style URL.');
notIncludes(miniMapSource, "mapbox://styles/mapbox/streets-v12", 'RouteProgressMiniMap should not fall back to a bright streets style.');
includes(miniMapSource, "getMapStyleUrl('route-progress')", 'RouteProgressMiniMap should render the ECS route-progress Mapbox style.');
includes(mapConfigSource, "key: 'route-progress'", 'Map config should expose the route-progress style key.');
includes(mapConfigSource, "mapbox://styles/mapbox/dark-v11", 'Map config should use the tactical dark style URL for route progress.');
includes(miniMapSource, 'getMapboxTokenSync()', 'RouteProgressMiniMap should use the existing ECS Mapbox token config.');
includes(miniMapSource, 'void getMapboxToken()', 'RouteProgressMiniMap should resolve Mapbox tokens asynchronously when needed.');
notIncludes(miniMapSource, 'pk.', 'RouteProgressMiniMap must not hardcode a public Mapbox token.');

includes(miniMapSource, '<Image', 'Inactive RouteProgressMiniMap should render an image placeholder.');
includes(miniMapSource, 'resizeMode="cover"', 'Inactive placeholder must preserve aspect ratio with cover behavior.');
includes(miniMapSource, '<WebView', 'Active RouteProgressMiniMap should render a dedicated lightweight Mapbox WebView.');
includes(miniMapSource, 'const [mapReady, setMapReady] = useState(false)', 'RouteProgressMiniMap should track compact Mapbox readiness.');
includes(miniMapSource, 'const showFallbackMap = Boolean(hasRenderableMap && !mapReady && miniMapPayload)', 'RouteProgressMiniMap should switch to a native fallback map while compact Mapbox is pending.');
includes(miniMapSource, '<MapFallbackSurface', 'RouteProgressMiniMap should render a native fallback route map instead of only showing a static placeholder.');
includes(miniMapSource, 'testID={`${testID}-fallback-background`}', 'Active fallback map should keep the inactive route-guidance background behind the native route drawing.');
includes(miniMapSource, 'transparentBackground', 'Active fallback map should let the route-progress background texture show through.');
includes(miniMapSource, ': !hasRenderableMap || !mapReady ? (', 'RouteProgressMiniMap should keep the static placeholder available when no route fallback can be drawn.');
includes(miniMapSource, 'buildMiniMapHtml(mapToken, styleUrl)', 'RouteProgressMiniMap should boot a purpose-built mini-map HTML surface.');
includes(miniMapSource, 'window.__ECS_ROUTE_MINI_MAP_SET__', 'RouteProgressMiniMap should update route data without remounting the WebView.');
includes(miniMapSource, "message?.type === 'mapReady'", 'RouteProgressMiniMap should listen for WebView Mapbox readiness.');
includes(miniMapSource, "finishReady('bootstrap_timeout')", 'RouteProgressMiniMap should unblock the dashboard surface once the WebView Mapbox shell is initialized.');
includes(miniMapSource, "map.on('style.load'", 'RouteProgressMiniMap should accept style-load readiness when the full load event is delayed.');
includes(miniMapSource, 'styleCandidates', 'RouteProgressMiniMap should include Mapbox style fallbacks when the custom style is unavailable.');
includes(miniMapSource, 'const MINI_MAP_CONSTRUCTOR_RETRY_LIMIT = 2;', 'RouteProgressMiniMap should bound constructor retries.');
includes(miniMapSource, "const MINI_MAPBOX_GL_JS_VERSION = 'v2.15.0';", 'RouteProgressMiniMap should use the Android WebView-compatible Mapbox GL JS runtime.');
includes(miniMapSource, 'mapbox-gl-js/${MINI_MAPBOX_GL_JS_VERSION}/mapbox-gl.js', 'RouteProgressMiniMap should resolve Mapbox GL JS through the shared compatible version constant.');
includes(miniMapSource, 'mapboxgl.workerCount = 1;', 'RouteProgressMiniMap should lower Mapbox GL worker pressure inside Android WebView.');
includes(miniMapSource, 'const constructorRetryCountRef = useRef(0);', 'RouteProgressMiniMap should track constructor retry attempts.');
includes(miniMapSource, "key={`route-progress-mini-map-${webViewRevision}`}", 'RouteProgressMiniMap should remount the WebView when constructor recovery is needed.');
includes(miniMapSource, "String(reason).includes('constructor')", 'RouteProgressMiniMap should detect constructor failures from the WebView.');
includes(miniMapSource, "reason: 'constructor_failed'", 'RouteProgressMiniMap should keep constructor failures machine-readable instead of using the raw error as the reason.');
includes(miniMapSource, 'setMapBootIssue(detail ? `${reason}: ${detail}` : reason)', 'RouteProgressMiniMap should preserve constructor error detail for field diagnostics.');
includes(miniMapSource, 'setWebViewRevision((revision) => revision + 1)', 'RouteProgressMiniMap should retry constructor failures by remounting the WebView.');
includes(miniMapSource, 'antialias: false', 'RouteProgressMiniMap should lower WebGL pressure on Android WebView.');
includes(miniMapSource, 'failIfMajorPerformanceCaveat: false', 'RouteProgressMiniMap should allow Android WebView GL fallback paths.');
includes(miniMapSource, 'const ROUTE_PROGRESS_3D_PITCH = 56;', 'RouteProgressMiniMap should use a pitched 3D camera for active guidance.');
includes(miniMapSource, 'const ROUTE_PROGRESS_3D_MAX_ZOOM = 13.6;', 'RouteProgressMiniMap should keep active-route fit zoom bounded for compact widgets.');
includes(miniMapSource, 'mapbox://mapbox.mapbox-terrain-dem-v1', 'RouteProgressMiniMap should enable Mapbox terrain DEM when available.');
includes(miniMapSource, 'map.setTerrain({ source: ROUTE_PROGRESS_3D_TERRAIN_SOURCE_ID', 'RouteProgressMiniMap should apply terrain to the compact 3D map.');
includes(miniMapSource, 'function fitFullRouteBounds(payload)', 'RouteProgressMiniMap should fit the full active route, not only the current marker.');
includes(miniMapSource, 'getBoundsFromCoordinates(payload.routeCoords)', 'RouteProgressMiniMap should fall back to route geometry bounds when explicit bounds are unavailable.');
includes(miniMapSource, 'pitch: pitch', 'RouteProgressMiniMap should keep the full-route camera pitched after bounds fitting.');
includes(miniMapSource, 'bearing: bearing', 'RouteProgressMiniMap should rotate the compact camera using the active route bearing.');
includes(miniMapSource, 'const cameraBearing = useMemo(() => getRouteCameraBearing(routeFeature)', 'RouteProgressMiniMap should derive compact camera bearing from the full route.');
includes(
  miniMapSource,
  'const hasRenderableMap = Boolean(routeFeature && mapToken)',
  'RouteProgressMiniMap should render the Mapbox route surface whenever route geometry and a token are available.',
);
includes(
  miniMapSource,
  'explicitProgress != null && (explicitProgress > 0 || inferredProgress == null)',
  'RouteProgressMiniMap should infer progress from current location when upstream progress is still zero or unavailable.',
);
includes(
  miniMapSource,
  'const showMetricOverlay = overlayParts.length > 0',
  'RouteProgressMiniMap should keep the overlay visible for active guidance and no-route placeholder states.',
);
includes(miniMapSource, "const compactStatusText = isGuidanceActive", 'Mini-map should compact route progress status text for the top-right pill.');
includes(miniMapSource, "? 'Active'", 'Active guidance status should render as Active, not Guidance active.');
includes(miniMapSource, ": 'No active route'", 'Inactive route status should render as a compact No active route pill.');
includes(miniMapSource, 'interactive: false', 'Dashboard mini-map should disable user interaction.');
includes(miniMapSource, 'routeCoords: routeFeature.geometry.coordinates', 'Mini-map should pass full route geometry to Mapbox.');
includes(miniMapSource, 'progressCoords: split.completedRouteGeoJson?.geometry.coordinates ?? []', 'Mini-map should pass completed route geometry to Mapbox.');
includes(miniMapSource, "routeColor: 'rgba(95, 209, 255, 0.86)'", 'Mini-map should use a high-contrast route line over the Mapbox surface.');
includes(miniMapSource, 'maxZoom: ROUTE_PROGRESS_3D_MAX_ZOOM', 'Mini-map should use compact full-route zoom limits for long active guidance routes.');
includes(miniMapSource, 'pitch: ROUTE_PROGRESS_3D_PITCH', 'Mini-map payload should preserve the active 3D pitch.');
includes(miniMapSource, 'bearing: cameraBearing', 'Mini-map payload should preserve the active route camera bearing.');
includes(miniMapSource, 'top: 6', 'Mini-map metric overlay should sit at the top of the map away from the Mapbox watermark.');
includes(miniMapSource, 'right: 7', 'Mini-map metric overlay should sit on the top-right of the map away from the Mapbox watermark.');
includes(miniMapSource, 'zIndex: 12', 'Mini-map metric overlay should render above the fallback SVG map surface.');
includes(miniMapSource, 'marker: markerLocation', 'Mini-map should render a real current-location marker when available.');
includes(miniMapSource, 'map.fitBounds', 'Mini-map should fit the active route inside the widget surface.');
includes(fallbackSurfaceSource, 'transparentBackground?: boolean', 'Native fallback map should support transparent compact surfaces.');
includes(fallbackSurfaceSource, "fill={transparentBackground ? 'rgba(5,9,13,0.68)' : '#05090D'}", 'Native fallback map should dim, not erase, the route-progress background when embedded.');

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
includes(widgetSource, 'routeGeoJson={buildRouteProgressFeatureFromPoints(miniMapRoutePoints)}', 'Route Progress mini-map should receive real route geometry.');
includes(widgetSource, 'const routeEndpointFallbackPoints = [', 'Route Progress mini-map should fall back to origin/destination when route geometry is sparse.');
includes(widgetSource, 'routeEndpointFallbackPoints.length > 1', 'Route Progress mini-map should still render a point A to B line when only endpoints are available.');
includes(widgetSource, 'currentLocation={miniMapCurrentLocation}', 'Route Progress mini-map should receive current location.');
includes(widgetSource, 'progressPercent={progressSummary?.progressPercent ?? null}', 'Route Progress mini-map should receive route progress.');
includes(widgetSource, 'statusText={progressSummary?.stateLabel ?? null}', 'Route Progress mini-map should keep active guidance status visible.');
includes(widgetSource, 'inactivePlaceholderSource={ROUTE_PROGRESS_PLACEHOLDER}', 'Route Progress mini-map should use the provided inactive placeholder image.');
includes(widgetSource, 'useActiveRouteProgressSnapshot(options)', 'Route progress must come from ECS route state, not mock data.');
includes(miniMapSource, 'onHttpError={(event) => {', 'RouteProgressMiniMap should surface mini-map WebView HTTP failures without crashing.');
includes(miniMapSource, 'Map standby', 'RouteProgressMiniMap should show a compact standby state when Mapbox boot is delayed.');
notIncludes(widgetSource, "import RouteGuidanceProgressRive from './RouteGuidanceProgressRive'", 'Dashboard route progress should not import the old Rive wrapper.');
notIncludes(widgetSource, '<RouteGuidanceProgressRive', 'Dashboard route progress should not mount Rive.');
notIncludes(widgetSource, 'attitude-command-route-guidance-progress-rive', 'Dashboard route progress should not expose Rive test IDs.');
notIncludes(widgetSource, 'ROUTE_PROGRESS_PATH', 'Dashboard route progress should not use fake SVG route paths.');
notIncludes(widgetSource, 'Math.random()', 'Route progress must not animate from random values.');

assert.ok(
  !fs.existsSync(path.join(root, 'components/dashboard/RouteGuidanceProgressRive.tsx')) &&
    !fs.existsSync(path.join(root, 'components/dashboard/RouteGuidanceProgressRive.native.tsx')) &&
    !fs.existsSync(path.join(root, 'lib/routeGuidanceProgressRive.ts')) &&
    !fs.existsSync(path.join(root, 'assets/route/guide_progress_map.riv')),
  'Route progress should not keep the retired Rive wrapper, runtime helper, or .riv asset.',
);

includes(activeRouteProgressSource, 'routePoints?: NavigateRouteMapPoint[]', 'Active route progress snapshots should expose route geometry.');
includes(activeRouteProgressSource, 'currentLocation?: { latitude: number; longitude: number } | null', 'Active route progress snapshots should expose current location.');
includes(activeRouteProgressSource, 'originLocation?: { latitude: number; longitude: number } | null', 'Active route progress snapshots should expose origin.');
includes(activeRouteProgressSource, 'destinationLocation?: { latitude: number; longitude: number } | null', 'Active route progress snapshots should expose destination.');

assert.strictEqual(
  packageJson.scripts['test:route-progress-minimap'],
  'node ./scripts/test-route-progress-minimap.js',
  'package.json should expose the route-progress mini-map regression script.',
);
assert.ok(
  !packageJson.scripts['test:route-guidance-progress-rive'],
  'package.json should not keep the retired route guidance Rive script.',
);

console.log('[route-progress-minimap] contract passed');
