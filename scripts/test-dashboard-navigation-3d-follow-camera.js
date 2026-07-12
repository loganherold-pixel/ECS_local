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
const routeProgressMiniMap = read('components/dashboard/RouteProgressMiniMap.tsx');
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
  'Dashboard GPS smoothing should ignore sub-accuracy location drift.',
);

assert(dashboard.includes('gpsHeadingDeg: gps.position?.headingDeg ?? null'), 'Dashboard detail render options should include GPS heading.');
assert(dashboard.includes('gpsHeadingDeg={gps.position?.headingDeg ?? null}'), 'Dashboard grid should pass live GPS heading.');
assert(widgetGrid.includes('gpsHeadingDeg?: number | null;'), 'WidgetGrid props should carry GPS heading.');
assert(widgetRenderers.includes('gpsHeadingDeg?: number | null;'), 'Widget render options should expose GPS heading.');

assert(
  widgetRenderers.includes("<Mini3DFollowMap options={options} selected={mode === 'threeDNavigation'} />") &&
    (widgetRenderers.match(/<Mini3DFollowMap/g) || []).length === 1,
  'Dashboard command center should keep a single Navigation Command module entry.',
);

assert(
  navigateSurface.includes('function NavigationCommandStatusCard') &&
    navigateSurface.includes('dashboard-navigation-command-status-card') &&
    navigateSurface.includes('export function useNavigateSurfaceState(options?: WidgetRenderOptions, enabled = true)') &&
    navigateSurface.includes('useNavigateSurfaceState(options, selected)') &&
    navigateSurface.includes('resolveActiveGuidanceDisplayLocation'),
  'Dashboard navigation command should render route/GPS status from existing guidance state.',
);

assert(
  !navigateSurface.includes('MapRenderer') &&
    !navigateSurface.includes('MapFallbackSurface') &&
    !navigateSurface.includes('getMapboxToken') &&
    !navigateSurface.includes('mapboxToken') &&
    !navigateSurface.includes('cameraCommand'),
  'Dashboard navigation command must not load or control a map surface.',
);

assert(
  widgetRenderers.includes("const RouteProgressMiniMap = React.lazy(() => import('./RouteProgressMiniMap'));") &&
    widgetRenderers.includes('<RouteProgressMiniMap') &&
    routeProgressMiniMap.includes('<WebView') &&
    routeProgressMiniMap.includes('<MapFallbackSurface'),
  'Dashboard Route Progress mini-map should remain the only Dashboard map preview.',
);

assert(mapRenderer.includes('convoyMarkers?: ConvoyMapOverlayMarker[]'), 'Navigate MapRenderer should accept convoy overlay markers.');
assert(mapRenderer.includes('dispatchPingMarkers?: DispatchPingMapMarker[]'), 'Navigate MapRenderer should accept Dispatch GPS ping markers.');

console.log('Dashboard navigation command map-ownership checks passed.');
