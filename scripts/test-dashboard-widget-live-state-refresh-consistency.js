const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

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
  riveAdapter: readSource('lib', 'powerModuleRiveTelemetry.ts'),
  powerDetail: readSource('components', 'dashboard', 'PowerSystemDetail.tsx'),
};

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

// Weather: shared normalized state should be signature-guarded, refreshable, and subscriber based.
includes(sources.weather, 'function sharedWeatherSignature', 'Weather shared state should use a stable signature.');
includes(sources.weather, 'const setResultIfChanged', 'Weather hook should skip repeated identical result writes.');
includes(sources.weather, 'subscribeSharedOperationalWeather', 'Weather consumers should subscribe to shared weather state.');
includes(sources.weather, 'sharedWeatherRefreshHandler?.();', 'Weather refresh should use the shared refresh handler.');
includes(sources.widget, 'function shouldUseOperationalWeatherSnapshot', 'Dashboard weather widgets should choose the fresher live operational snapshot when available.');
includes(sources.widget, 'enabled: true,\n    gps:', 'Dashboard weather widgets should keep the shared operational weather hook active even when injected snapshot data exists.');
includes(sources.widget, 'accuracyM: options?.gpsAccuracyM ?? null,', 'Dashboard weather widgets should pass GPS accuracy into the shared weather resolver.');
notIncludes(sources.widget, 'enabled: !isECSWeatherSnapshot(data.weatherSnapshot)', 'Dashboard weather widgets should not disable live weather because a hydrated snapshot exists.');

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

// Power: live telemetry should be normalized, stale-gated, manually refreshable, and reduced-motion aware.
includes(sources.powerWidget, 'export interface PowerTelemetrySummary', 'Power widget should normalize telemetry summary.');
includes(sources.powerWidget, 'export function normalizePowerTelemetrySummary', 'Power widget should share normalized power data.');
includes(sources.powerWidget, 'useReducedMotion()', 'Power flow animation should respect reduced motion.');
includes(sources.powerWidget, 'const activeInput = inputWatts > 0 && !isStale && allowAnimation;', 'Power input animation should stop when stale/inactive or not truth-approved.');
includes(sources.powerWidget, 'const activeOutput = outputWatts > 0 && !isStale && allowAnimation;', 'Power output animation should stop when stale/inactive or not truth-approved.');
includes(sources.powerWidget, 'function usePowerFlowPulse(active: boolean, duration: number)', 'Power flow animation should use ref-driven Animated values, not state loops.');
includes(sources.powerWidget, 'const inputFlowPulse = usePowerFlowPulse(activeInput && shouldAnimate, 1250);', 'Power input flow should animate independently.');
includes(sources.powerWidget, 'const outputFlowPulse = usePowerFlowPulse(activeOutput && shouldAnimate, 1250);', 'Power output flow should animate independently.');
includes(sources.powerWidget, 'outputRange: [-28, 28]', 'Power flow pulses should travel toward the battery for input and away for output.');
includes(
  sources.powerWidget,
  "import PowerModuleRiveWidget from './PowerModuleRiveWidget'",
  'Power widget should render the shared reusable Rive module.',
);
includes(
  sources.riveAdapter,
  'export function adaptPowerTelemetryForRive',
  'Power widget should adapt normalized ECS telemetry before passing it to Rive.',
);
includes(
  sources.powerWidget,
  'hasEcsData={riveTelemetry.hasEcsData}',
  'Power widget should pass freshness-gated ECS availability to Rive.',
);
includes(
  sources.powerWidget,
  'function PowerMonitorRiveHero',
  'Power widget should centralize the foreground Rive hero.',
);
includes(
  sources.powerWidget,
  'inputWatts={riveTelemetry.inputWatts}',
  'Power Rive hero should receive adapted truth-gated input watts.',
);
includes(
  sources.powerWidget,
  'outputWatts={riveTelemetry.outputWatts}',
  'Power Rive hero should receive adapted truth-gated output watts.',
);
includes(
  sources.powerWidget,
  "testID={compact ? 'power-monitor-blu-rive-compact' : 'power-monitor-blu-rive'}",
  'Power compact/full widgets should expose direct Rive test IDs.',
);
includes(sources.powerDetail, 'function PowerRefreshControl', 'Power detail should expose a refresh control.');
includes(sources.powerDetail, 'const refreshGuardRef = useRef(0);', 'Power refresh should guard repeated taps.');
includes(sources.powerDetail, 'usePowerTelemetryControls', 'Power detail should refresh through the provider boundary controls.');
includes(sources.powerDetail, 'await refreshTelemetry();', 'Power refresh should request provider telemetry refresh.');

console.log('Dashboard widget live-state and refresh consistency checks passed.');
