const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  const source = read(relativePath);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(outputText, filename);
  return mod.exports;
}

const chase = loadTsModule('lib/dashboardNavigationChaseCamera.ts');
const dashboard = read('app/(tabs)/dashboard.tsx');
const widgetGrid = read('components/dashboard/WidgetGrid.tsx');
const widgetRenderers = read('components/dashboard/WidgetRenderers.tsx');
const navigateSurface = read('components/dashboard/NavigateSurfaceWidget.tsx');
const mapRenderer = read('components/navigate/MapRenderer.tsx');

assert.strictEqual(chase.normalizeNavigationBearingDeg(370), 10);
assert.strictEqual(chase.normalizeNavigationBearingDeg(-10), 350);
assert.strictEqual(typeof chase.resolveStableDashboardGpsCameraSnapshot, 'function');

const origin = { latitude: 39.0, longitude: -120.0 };
const eastBearing = chase.getDashboardNavigationBearingBetween(origin, {
  latitude: 39.0,
  longitude: -119.99,
});
assert(eastBearing > 85 && eastBearing < 95, 'Bearing helper should resolve eastbound travel.');

const gpsHeadingCamera = chase.resolveDashboardNavigationChaseCamera({
  currentLocation: origin,
  routePoints: [
    { lat: 39.0, lng: -120.0 },
    { lat: 39.01, lng: -120.0 },
  ],
  gpsHeadingDeg: 90,
  routeSessionHeadingDeg: 0,
  hasActiveGuidance: true,
  speedMph: 20,
});
assert.strictEqual(gpsHeadingCamera.bearingSource, 'route-ahead');
assert(
  gpsHeadingCamera.bearingDeg < 10 || gpsHeadingCamera.bearingDeg > 350,
  'Active chase camera should prefer route-ahead bearing over conflicting GPS heading.',
);
assert(gpsHeadingCamera.cameraTarget.latitude > origin.latitude, 'Active chase camera should look ahead along route/course travel.');

const routeAheadCamera = chase.resolveDashboardNavigationChaseCamera({
  currentLocation: origin,
  routePoints: [
    { lat: 38.9998, lng: -120.0 },
    { lat: 39.01, lng: -120.0 },
  ],
  gpsHeadingDeg: null,
  routeSessionHeadingDeg: 180,
  hasActiveGuidance: true,
  speedMph: 10,
});
assert.strictEqual(routeAheadCamera.bearingSource, 'route-ahead');
assert(
  routeAheadCamera.bearingDeg < 10 || routeAheadCamera.bearingDeg > 350,
  'Route-ahead bearing should beat a stale route-session heading during active guidance.',
);
assert(routeAheadCamera.cameraTarget.latitude > origin.latitude, 'Route-ahead camera target should sit ahead of the vehicle.');

const inactiveCamera = chase.resolveDashboardNavigationChaseCamera({
  currentLocation: origin,
  gpsHeadingDeg: 90,
  hasActiveGuidance: false,
});
assert.deepStrictEqual(inactiveCamera.cameraTarget, origin, 'Inactive/free-drive camera should not shift the target ahead of the user.');

const stableSmallDrift = chase.resolveStableDashboardGpsCameraSnapshot({
  previous: { location: origin, bearingDeg: 90 },
  nextLocation: { latitude: 39.00002, longitude: -120.00002 },
  nextBearingDeg: 96,
  speedMph: 1,
  accuracyM: 12,
});
assert.deepStrictEqual(
  stableSmallDrift.location,
  origin,
  'Dashboard map GPS smoothing should ignore sub-accuracy location drift.',
);
assert.strictEqual(
  stableSmallDrift.bearingDeg,
  90,
  'Dashboard map GPS smoothing should freeze heading wobble while nearly stationary.',
);

const stableMeaningfulMove = chase.resolveStableDashboardGpsCameraSnapshot({
  previous: stableSmallDrift,
  nextLocation: { latitude: 39.00018, longitude: -120.00018 },
  nextBearingDeg: 118,
  speedMph: 12,
  accuracyM: 8,
});
assert.notDeepStrictEqual(
  stableMeaningfulMove.location,
  origin,
  'Dashboard map GPS smoothing should still accept meaningful movement.',
);
assert.strictEqual(
  stableMeaningfulMove.bearingDeg,
  118,
  'Dashboard map GPS smoothing should still accept meaningful course changes while moving.',
);

assert(dashboard.includes('gpsHeadingDeg: gps.position?.headingDeg ?? null'), 'Dashboard detail render options should include GPS heading.');
assert(dashboard.includes('gpsHeadingDeg={gps.position?.headingDeg ?? null}'), 'Dashboard grid should pass live GPS heading.');
assert(widgetGrid.includes('gpsHeadingDeg?: number | null;'), 'WidgetGrid props should carry GPS heading.');
assert(widgetGrid.includes('areCompactRenderOptionsEqualForSlot'), 'Compact widget memoization should compare slot-specific GPS render state.');
assert(widgetGrid.includes('getDashboardGpsRenderKey'), 'Dashboard compact map keys should bucket GPS updates instead of using raw samples.');
assert(widgetRenderers.includes('gpsHeadingDeg?: number | null;'), 'Widget render options should expose GPS heading.');
assert(navigateSurface.includes('resolveDashboardNavigationChaseCamera'), '3D navigation command should use the chase-camera resolver.');
assert(navigateSurface.includes('useStableDashboardGpsCameraLocation'), 'Dashboard navigation surfaces should smooth GPS marker/camera location changes.');
assert(navigateSurface.includes('resolveStableDashboardGpsCameraSnapshot'), '3D navigation command should smooth small location and bearing jitter.');
assert(navigateSurface.includes('COMMAND_3D_ACTIVE_FOLLOW_OFFSET'), 'Active guidance should use a lower marker chase-camera offset.');
assert(navigateSurface.includes("dashboard_command_3d_active_guidance:${chaseCamera.bearingSource}:${recenterRequestId}"), 'Camera command reason should include bearing source and recenter generation.');
assert(navigateSurface.includes("type Command3DMapViewKey = 'tactical' | 'day' | 'satellite';"), '3D follow map must expose tactical, day, and satellite view modes.');
assert(navigateSurface.includes("mapStyle: 'tactical'"), '3D follow map view menu must retain the tactical dark style.');
assert(navigateSurface.includes("mapStyle: 'ecs'"), '3D follow map view menu must offer the daytime map style.');
assert(navigateSurface.includes("mapStyle: 'satellite'"), '3D follow map view menu must offer the satellite map style.');
assert(navigateSurface.includes("const DEFAULT_COMMAND_3D_MAP_VIEW: Command3DMapViewKey = 'satellite';"), 'Dashboard command map should default to satellite presentation.');
assert(navigateSurface.includes("createPersistedKeyValueCache('ecs_dashboard_map_preferences')"), 'Dashboard command map should persist the user-selected presentation.');
assert(navigateSurface.includes('command3DMapViewPreference.waitForHydration()'), 'Dashboard command map should restore persisted native map presentation after hydration.');
assert(mapRenderer.includes('styleUrl: getMapStyleUrl(props.mapStyle || DEFAULT_MAP_STYLE)'), 'MapRenderer payload should include the selected map style so TAC/DAY/SAT changes reach the WebView.');
assert(mapRenderer.includes("ensureLineLayer('route-halo-layer', 'route-source'"), 'Active guidance route lines need a contrast halo so the path remains visible on DAY and SAT map views.');
assert(
  mapRenderer.includes('function promoteRouteGuidanceLayers()') &&
    mapRenderer.indexOf("'route-halo-layer'") < mapRenderer.indexOf("'route-layer'"),
  'Route halo must be promoted with the route layer after style or overlay changes.',
);
assert(mapRenderer.includes("map.setPaintProperty('route-halo-layer', 'line-width'"), 'Route halo styling should update with active/preview render mode changes.');
assert(navigateSurface.includes('const [followLocked, setFollowLocked] = useState(true);'), '3D follow map must start locked to live GPS follow.');
assert(navigateSurface.includes('if (!selected || !cameraCenter || !followLocked) return null;'), 'Manual map interaction must suspend automatic follow camera commands.');
assert(navigateSurface.includes('shouldFollowUser={followLocked && !!cameraCenter}'), 'Manual map interaction must also suppress legacy follow-user fallback camera movement.');
assert(navigateSurface.includes('setFollowLocked(true);') && navigateSurface.includes('setFollowLocked(false);'), 'Compass recenter should relock follow mode while user drag should unlock it.');
assert(navigateSurface.includes('onUserDrag={handleUserDrag}'), '3D follow map must listen for user drag/zoom events from MapRenderer.');
assert(navigateSurface.includes('accessibilityLabel="Open 3D follow map view menu"'), '3D follow map needs an accessible top-right view selector.');
assert(navigateSurface.includes('activeView={activeMapView}'), '3D follow map view selector should reflect the active map style.');
assert(navigateSurface.includes('top: 10,') && navigateSurface.includes('right: 92,'), 'Dashboard command turn guidance should sit at the top and clear the map presentation selector.');
assert(navigateSurface.includes('Navigation map paused'), 'Dashboard command map standby copy should not show redundant 3D Follow Map text.');

console.log('Dashboard Navigation 3D follow camera checks passed.');
