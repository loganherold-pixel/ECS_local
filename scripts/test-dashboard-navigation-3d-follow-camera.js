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

assert.strictEqual(chase.normalizeNavigationBearingDeg(370), 10);
assert.strictEqual(chase.normalizeNavigationBearingDeg(-10), 350);

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
assert.strictEqual(gpsHeadingCamera.bearingSource, 'gps-heading');
assert.strictEqual(Math.round(gpsHeadingCamera.bearingDeg), 90);
assert(gpsHeadingCamera.cameraTarget.longitude > origin.longitude, 'Active chase camera should look ahead along live GPS heading.');

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

assert(dashboard.includes('gpsHeadingDeg: gps.position?.headingDeg ?? null'), 'Dashboard detail render options should include GPS heading.');
assert(dashboard.includes('gpsHeadingDeg={gps.position?.headingDeg ?? null}'), 'Dashboard grid should pass live GPS heading.');
assert(widgetGrid.includes('gpsHeadingDeg?: number | null;'), 'WidgetGrid props should carry GPS heading.');
assert(widgetGrid.includes('renderOptions?.gpsHeadingDeg ??'), 'Navigate surface render key should include heading updates.');
assert(widgetRenderers.includes('gpsHeadingDeg?: number | null;'), 'Widget render options should expose GPS heading.');
assert(navigateSurface.includes('resolveDashboardNavigationChaseCamera'), '3D navigation command should use the chase-camera resolver.');
assert(navigateSurface.includes('COMMAND_3D_ACTIVE_FOLLOW_OFFSET'), 'Active guidance should use a lower marker chase-camera offset.');
assert(navigateSurface.includes("dashboard_command_3d_active_guidance:${chaseCamera.bearingSource}:${recenterRequestId}"), 'Camera command reason should include bearing source and recenter generation.');
assert(navigateSurface.includes("type Command3DMapViewKey = 'tactical' | 'day' | 'satellite';"), '3D follow map must expose tactical, day, and satellite view modes.');
assert(navigateSurface.includes("mapStyle: 'tactical'"), '3D follow map view menu must retain the tactical dark style.');
assert(navigateSurface.includes("mapStyle: 'ecs'"), '3D follow map view menu must offer the daytime map style.');
assert(navigateSurface.includes("mapStyle: 'satellite'"), '3D follow map view menu must offer the satellite map style.');
assert(navigateSurface.includes('const [followLocked, setFollowLocked] = useState(true);'), '3D follow map must start locked to live GPS follow.');
assert(navigateSurface.includes('if (!selected || !cameraCenter || !followLocked) return null;'), 'Manual map interaction must suspend automatic follow camera commands.');
assert(navigateSurface.includes('shouldFollowUser={followLocked && !!cameraCenter}'), 'Manual map interaction must also suppress legacy follow-user fallback camera movement.');
assert(navigateSurface.includes('setFollowLocked(true);') && navigateSurface.includes('setFollowLocked(false);'), 'Compass recenter should relock follow mode while user drag should unlock it.');
assert(navigateSurface.includes('onUserDrag={handleUserDrag}'), '3D follow map must listen for user drag/zoom events from MapRenderer.');
assert(navigateSurface.includes('accessibilityLabel="Open 3D follow map view menu"'), '3D follow map needs an accessible top-right view selector.');
assert(navigateSurface.includes('activeView={activeMapView}'), '3D follow map view selector should reflect the active map style.');

console.log('Dashboard Navigation 3D follow camera checks passed.');
