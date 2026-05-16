const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

global.ECS_DEBUG_DISPATCH_WIRE = true;

require.extensions['.ts'] = function transpileTypeScript(module, filename) {
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
};

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

const { getWeatherFreshness } = loadTypeScriptModule('lib/weatherFreshness.ts');
const { buildECSWeatherSnapshot } = loadTypeScriptModule('lib/ecsWeather.ts');
const { buildUnifiedWeatherCorridor, getWeatherSnapshotStaleness } = loadTypeScriptModule('lib/weatherSurfaceSelectors.ts');
const { buildWeatherEvents } = loadTypeScriptModule('lib/dispatchLiveAggregator.ts');
const { assessDegradedOperations } = loadTypeScriptModule('lib/ai/degradedOperationsEngine.ts');

const weatherStore = fs.readFileSync(path.join(process.cwd(), 'lib', 'weatherStore.ts'), 'utf8');
const ecsIssueIntelligence = fs.readFileSync(path.join(process.cwd(), 'lib', 'ecsIssueIntelligence.ts'), 'utf8');

const now = Date.parse('2026-04-26T12:00:00.000Z');
const minutesAgo = minutes => now - minutes * 60 * 1000;

const live = getWeatherFreshness({
  source: 'live',
  fetchedAt: new Date(minutesAgo(1)).toISOString(),
  hasWeatherData: true,
  now,
});
assert.strictEqual(live.freshness, 'fresh', 'live weather success should be fresh');
assert.strictEqual(live.stale, false, 'live weather success should clear stale state');

const cacheFresh = getWeatherFreshness({
  source: 'cache_fresh',
  cachedAt: minutesAgo(10),
  fetchedAt: new Date(minutesAgo(180)).toISOString(),
  hasWeatherData: true,
  now,
});
assert.strictEqual(cacheFresh.freshness, 'fresh', 'fresh cache inside TTL should count as fresh');
assert.strictEqual(cacheFresh.stale, false, 'fresh cache inside TTL should clear stale state');

const cacheFreshWithOldProviderTimestamp = getWeatherFreshness({
  source: 'cache_fresh',
  cachedAt: minutesAgo(3),
  fetched_at: new Date(minutesAgo(240)).toISOString(),
  hasWeatherData: true,
  now,
});
assert.strictEqual(
  cacheFreshWithOldProviderTimestamp.freshness,
  'fresh',
  'fresh cache must use cachedAt before stale provider fetched_at values',
);
assert.strictEqual(
  cacheFreshWithOldProviderTimestamp.stale,
  false,
  'fresh cache with old provider timestamp should still clear stale state',
);

const oldCache = getWeatherFreshness({
  source: 'cache_stale',
  cachedAt: minutesAgo(120),
  hasWeatherData: true,
  now,
});
assert.strictEqual(oldCache.freshness, 'stale', 'old cache outside TTL should be stale');
assert.strictEqual(oldCache.stale, true, 'old cache outside TTL may emit stale warning');

const missing = getWeatherFreshness({
  source: 'fallback',
  fetchedAt: now,
  hasWeatherData: false,
  now,
});
assert.strictEqual(missing.freshness, 'missing', 'missing weather should be distinct from stale');
assert.strictEqual(missing.stale, true, 'missing weather may emit reduced-confidence warnings');

const weatherResponse = {
  fetched_at: new Date(minutesAgo(240)).toISOString(),
  units: 'imperial',
  results: [{
    lat: 37.1,
    lng: -122.1,
    label: 'Fresh cached test',
    error: null,
    current: {
      temp: 72,
      feels_like: 71,
      temp_min: 66,
      temp_max: 77,
      humidity: 40,
      pressure: 1015,
      visibility: 10000,
      wind_speed: 8,
      wind_deg: 240,
      wind_gust: 14,
      clouds: 10,
      weather_id: 800,
      weather_main: 'Clear',
      weather_description: 'clear sky',
      weather_icon: '01d',
      rain_1h: null,
      rain_3h: null,
      snow_1h: null,
      snow_3h: null,
      sunrise: Math.floor(minutesAgo(360) / 1000),
      sunset: Math.floor((now + 6 * 60 * 60 * 1000) / 1000),
      location_name: 'Fresh cached test',
      dt: Math.floor(minutesAgo(240) / 1000),
    },
    forecast: [],
    alerts: [],
    trail_conditions: null,
  }],
};

const originalLog = console.log;
const originalDateNow = Date.now;
Date.now = () => now;
const freshCacheSnapshot = buildECSWeatherSnapshot({
  result: {
    data: weatherResponse,
    source: 'cache_fresh',
    cachedAt: minutesAgo(3),
    error: null,
  },
  sourceType: 'current_location',
});
Date.now = originalDateNow;
assert.strictEqual(freshCacheSnapshot.status.freshness, 'fresh', 'snapshot should carry fresh cache freshness');
assert.strictEqual(freshCacheSnapshot.status.stale, false, 'snapshot should not mark fresh cache stale');
assert.strictEqual(freshCacheSnapshot.status.cachedAt, minutesAgo(3), 'snapshot should preserve cache timestamp');
assert.strictEqual(
  getWeatherSnapshotStaleness(freshCacheSnapshot),
  'fresh',
  'shared weather snapshot selector should classify the dashboard snapshot as fresh',
);

const staleRouteOnlyContext = {
  source: 'cache_stale',
  lastFetchAt: minutesAgo(180),
  allAlerts: [],
  points: [],
  hazardousCount: 0,
  cautionCount: 0,
  summary: {
    activePoint: null,
    headline: null,
    detail: null,
    severeLine: null,
    statusText: null,
  },
};
const unifiedFreshCurrentWeather = buildUnifiedWeatherCorridor({
  snapshot: freshCacheSnapshot,
  result: {
    data: weatherResponse,
    source: 'cache_fresh',
    cachedAt: minutesAgo(3),
    error: null,
  },
  routeWeather: staleRouteOnlyContext,
});
assert.strictEqual(
  unifiedFreshCurrentWeather.currentStaleness,
  'fresh',
  'unified weather should preserve current-location freshness for the dashboard widget source',
);
assert.strictEqual(
  unifiedFreshCurrentWeather.routeStaleness,
  'unknown',
  'missing route weather evidence should not masquerade as stale current weather',
);
assert.strictEqual(
  unifiedFreshCurrentWeather.staleness,
  'fresh',
  'ECS Brief weather freshness should not be downgraded when the dashboard current-weather snapshot is fresh',
);

const loggedWeatherReasons = [];
console.log = (...args) => {
  if (String(args[0]).includes('[DISPATCH_WIRE]') && String(args[1]).includes('weather_events reason')) {
    loggedWeatherReasons.push(String(args[2]?.reason ?? ''));
  }
};
try {
  Date.now = () => now;
  const events = buildWeatherEvents(freshCacheSnapshot);
  assert.strictEqual(events.length, 0, 'stable fresh weather should not create dispatch events');
} finally {
  Date.now = originalDateNow;
  console.log = originalLog;
}
assert(
  loggedWeatherReasons.includes('no_alerts') || loggedWeatherReasons.includes('below_threshold'),
  'fresh stable weather should log no_alerts/below_threshold rather than stale_suppressed',
);
assert(
  !loggedWeatherReasons.includes('stale_suppressed'),
  'fresh stable weather should not be reported as stale_suppressed',
);

const baseDegradedInput = {
  gpsStatus: 'ACTIVE',
  telemetryAvailable: true,
  telemetryState: 'LIVE',
  connectivityOnline: true,
  connectivityLevel: 'online',
  hasCachedMapData: true,
  weatherAvailable: true,
  hasActiveRoute: true,
  hasRouteGeometry: true,
  routeGuidanceRequested: false,
  routeRiskAvailable: false,
  forecastAvailable: true,
};

const freshAdvisory = assessDegradedOperations({
  ...baseDegradedInput,
  weatherStaleness: 'fresh',
});
assert(
  !freshAdvisory.summary.toLowerCase().includes('weather is stale'),
  'fresh weather should not produce the stale-weather advisory copy',
);
assert(freshAdvisory.workingSystems.includes('Weather'), 'fresh weather should remain a working system');

const staleAdvisory = assessDegradedOperations({
  ...baseDegradedInput,
  weatherStaleness: 'stale',
});
assert(
  staleAdvisory.summary.toLowerCase().includes('weather data is stale'),
  'stale weather should still produce source-driven stale-weather advisory copy',
);
assert(staleAdvisory.degradedSystems.includes('Weather'), 'stale weather should remain degraded');

const staleWithGuidance = assessDegradedOperations({
  ...baseDegradedInput,
  routeGuidanceRequested: true,
  weatherStaleness: 'stale',
});
assert(
  staleWithGuidance.summary.includes('Route guidance available.'),
  'stale weather copy should use explicit route guidance availability when guidance is available',
);

const staleWithoutGuidance = assessDegradedOperations({
  ...baseDegradedInput,
  routeGuidanceRequested: true,
  hasRouteGeometry: false,
  weatherStaleness: 'stale',
});
assert(
  staleWithoutGuidance.summary.includes('Route guidance unavailable') ||
    staleWithoutGuidance.unavailableSystems.includes('Route guidance'),
  'route guidance unavailable state should stay explicit when route geometry is missing',
);

assert(
  weatherStore.includes('setIssueRuntimeWeatherFromResult'),
  'weather store should derive runtime weather status from canonical freshness',
);
assert(
  weatherStore.includes("stale: freshness.stale"),
  'weather store should explicitly update stale=false/true from canonical freshness',
);
assert(
  weatherStore.includes("cachedAt: result.cachedAt"),
  'weather store should preserve cachedAt on runtime weather status updates',
);
assert(
  weatherStore.includes("empty_weather_update_ignored"),
  'weather store should ignore empty weather updates instead of poisoning fresh runtime status',
);
assert(
  ecsIssueIntelligence.includes("if (freshness === 'fresh' || freshness === 'aging') return 'live';"),
  'ECS issue intelligence should prefer canonical fresh weather over stale runtime fallbacks',
);

console.log('weather freshness checks passed');
