const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;

function readSource(...segments) {
  return fs.readFileSync(path.join(root, ...segments), 'utf8').replace(/\r\n/g, '\n');
}

const sources = {
  widget: readSource('components', 'dashboard', 'WidgetRenderers.tsx'),
  activeRouteProgress: readSource('lib', 'activeRouteProgress.ts'),
  weather: readSource('lib', 'useOperationalWeather.ts'),
  routeStore: readSource('lib', 'routeStore.ts'),
  elevation: readSource('lib', 'dashboardElevationTerrain.ts'),
  powerWidget: readSource('components', 'dashboard', 'PowerSystemWidget.tsx'),
  powerDetail: readSource('components', 'dashboard', 'PowerSystemDetail.tsx'),
  registry: readSource('lib', 'widgetRegistry.ts'),
};

const selectors = require(path.join(root, 'lib', 'dashboard', 'dashboardRuntimeSelectors.ts'));

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

// Attitude Command remains selectable, while the default Dashboard now mounts the
// compact Attitude Monitor plus Quick Terrain and Vehicle Systems.
includes(
  sources.registry,
  "{ widgetId: 'attitude-monitor', widgetSize: '2x1' }",
  'The regression must reflect the current default Dashboard layout.',
);
includes(
  sources.widget,
  "case 'attitude-command': return <AttitudeCommandWidget data={data} options={options} />;",
  'The regression must exercise the actual Attitude Command renderer.',
);

const waitingWeatherData = {
  weatherSnapshot: {
    status: { kind: 'loading', updatedAt: null },
    current: null,
    hourly: [],
    daily: [],
    alerts: [],
  },
};
const noFixOptions = {
  gpsHasFix: false,
  gpsLatitude: null,
  gpsLongitude: null,
  gpsAccuracyM: null,
};
const validGpsOptions = {
  gpsHasFix: true,
  gpsLatitude: 34.0522,
  gpsLongitude: -118.2437,
  gpsAccuracyM: 8,
};
const waitingKey = selectors.selectDashboardWidgetRenderKey(
  'attitude-command',
  waitingWeatherData,
  noFixOptions,
);
const validGpsKey = selectors.selectDashboardWidgetRenderKey(
  'attitude-command',
  waitingWeatherData,
  validGpsOptions,
);
assert.notStrictEqual(
  validGpsKey,
  waitingKey,
  'Attitude Command must rerender when Dashboard GPS changes from no fix to a valid weather location.',
);
assert.notStrictEqual(
  selectors.selectDashboardWidgetRenderKey(
    'attitude-command',
    waitingWeatherData,
    { ...validGpsOptions, gpsLatitude: 34.1522, gpsLongitude: -118.1437 },
  ),
  validGpsKey,
  'Attitude Command must rerender after a material weather-location change.',
);
assert.notStrictEqual(
  selectors.selectDashboardWidgetRenderKey(
    'attitude-command',
    {
      weatherSnapshot: {
        status: { kind: 'live', updatedAt: '2026-07-15T12:00:00.000Z' },
        current: { temperatureF: 78, windSpeedMph: 9 },
        hourly: [],
        daily: [],
        alerts: [],
      },
    },
    validGpsOptions,
  ),
  validGpsKey,
  'Attitude Command must rerender when the shared weather snapshot becomes live.',
);

// Weather: shared normalized state should be signature-guarded, refreshable, and subscriber based.
includes(sources.weather, 'function sharedWeatherSignature', 'Weather shared state should use a stable signature.');
includes(sources.weather, 'const setResultIfChanged', 'Weather hook should skip repeated identical result writes.');
includes(sources.weather, 'subscribeSharedOperationalWeather', 'Weather consumers should subscribe to shared weather state.');
includes(sources.weather, 'sharedWeatherRefreshHandler();', 'Weather refresh should use the shared refresh handler.');
includes(sources.widget, 'function shouldUseOperationalWeatherSnapshot', 'Dashboard weather widgets should choose the fresher live operational snapshot when available.');
includes(sources.widget, 'enabled: injectedSnapshot == null,', 'The mounted Dashboard snapshot should prevent a duplicate widget-level weather consumer.');
includes(sources.widget, 'accuracyM: options?.gpsAccuracyM ?? null,', 'Dashboard weather widgets should pass GPS accuracy into the shared weather resolver.');
includes(sources.widget, 'const injectedSnapshot = isECSWeatherSnapshot(data.weatherSnapshot)', 'Dashboard weather widgets should identify the parent-owned canonical snapshot before registering a fallback consumer.');

// Route Progress: imported route fallback should be event-driven, not timer-driven.
includes(sources.routeStore, 'export type RouteStoreListener = () => void;', 'Route store should expose a listener type.');
includes(sources.routeStore, 'subscribe: subscribeRouteStore,', 'Route store should expose subscribe().');
includes(sources.routeStore, 'notifyRouteStoreListeners();', 'Route store should notify subscribers after persisted changes.');
includes(sources.widget, 'return routeStore.subscribe(syncRoute);', 'Route Progress should subscribe to routeStore updates.');
notIncludes(sources.widget, 'setInterval(syncRoute', 'Route Progress should not poll routeStore.');
notIncludes(sources.widget, 'clearInterval(intervalId', 'Route Progress should not depend on interval cleanup.');

// Active guidance, vehicle, and widget updates should keep equality guards.
includes(sources.activeRouteProgress, 'sameRoute(current, nextRoute)', 'Route Progress should avoid setting identical active routes.');
includes(sources.activeRouteProgress, 'sameNavigationData(current, next)', 'Route Progress should avoid setting identical vehicle navigation data.');
includes(sources.activeRouteProgress, 'subscribeActiveRoadNavigationSession', 'Route Progress should use road guidance subscription.');
includes(sources.activeRouteProgress, 'subscribeActiveTrailNavigationSession', 'Route Progress should use trail guidance subscription.');

// Elevation/Terrain: live must require a fresh GPS timestamp and expose stale/unavailable states.
includes(sources.elevation, "export type ElevationTerrainStatus = 'live' | 'stale' | 'route' | 'unavailable';", 'Elevation resolver should model live/stale/route/unavailable.');
includes(sources.elevation, 'const DEFAULT_STALE_AFTER_MS = 60_000;', 'Elevation resolver should define a stale threshold.');
includes(sources.elevation, 'const hasLiveElevation = hasGpsAltitude && hasFreshTimestamp;', 'Elevation live state should require fresh altitude.');
includes(sources.elevation, "badgeLabel: 'STALE ELEVATION'", 'Elevation resolver should expose stale state copy.');
includes(sources.elevation, "badgeLabel: 'ELEVATION PENDING'", 'Elevation resolver should expose unavailable state copy.');

// Power: live telemetry should be normalized, stale-gated, manually refreshable, and owned visually by ECS-native readouts.
includes(sources.powerWidget, 'export interface PowerTelemetrySummary', 'Power widget should normalize telemetry summary.');
includes(sources.powerWidget, 'export function normalizePowerTelemetrySummary', 'Power widget should share normalized power data.');
notIncludes(sources.powerWidget, 'function PowerFlowGraphic', 'Power monitor should not render the old center tick/flow graphic.');
notIncludes(sources.powerWidget, 'function usePowerFlowPulse', 'Power monitor should not keep the old inline flow animation loop.');
notIncludes(sources.powerWidget, 'useReducedMotion()', 'Power monitor should not add a separate animation loop.');
notIncludes(sources.powerWidget, "footer={<WidgetMetaLine", 'Power monitor should not show redundant live/source footer pills.');
notIncludes(sources.powerWidget, "import PowerModuleRiveWidget from './PowerModuleRiveWidget'", 'Power widget should not import the Rive module while Rive widgets are disabled.');
notIncludes(sources.powerWidget, "import { adaptPowerTelemetryForRive } from '../../lib/powerModuleRiveTelemetry'", 'Power widget should not adapt telemetry for Rive while Rive widgets are disabled.');
notIncludes(sources.powerWidget, '<PowerModuleRiveWidget', 'Power widget should not render a Rive module.');
notIncludes(sources.powerWidget, 'function PowerMonitorRiveHero', 'Power widget should not keep the old foreground Rive hero.');
includes(sources.powerWidget, 'function PowerMonitorTelemetryPanel', 'Power widget should centralize a native telemetry panel.');
includes(sources.powerWidget, "testID={compact ? 'power-monitor-telemetry-panel-compact' : 'power-monitor-telemetry-panel'}", 'Power compact/full widgets should expose native telemetry panel test IDs.');
includes(sources.powerWidget, 'canDisplayTelemetryValues', 'Power widget should truth-gate telemetry values before display.');
includes(sources.powerDetail, 'function PowerRefreshControl', 'Power detail should expose a refresh control.');
includes(sources.powerDetail, 'const refreshGuardRef = useRef(0);', 'Power refresh should guard repeated taps.');
includes(sources.powerDetail, 'usePowerTelemetryControls', 'Power detail should refresh through the provider boundary controls.');
includes(sources.powerDetail, 'await refreshTelemetry();', 'Power refresh should request provider telemetry refresh.');

console.log('Dashboard widget live-state and refresh consistency checks passed.');
