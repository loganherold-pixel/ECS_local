const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

Module._extensions['.ts'] = function compileTypeScript(module, filename) {
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

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');
}

const {
  buildECSWeatherSnapshot,
} = loadTypeScriptModule('lib/ecsWeather.ts');

const now = Date.now();
const baseWaypoint = {
  lat: 38.79,
  lng: -121.24,
  label: '38.79, -121.24',
  error: null,
  current: {
    temp: 72,
    feels_like: 71,
    temp_min: 58,
    temp_max: 76,
    humidity: 30,
    pressure: 1012,
    visibility: 10000,
    wind_speed: 8,
    wind_deg: 190,
    wind_gust: 12,
    clouds: 0,
    weather_id: 800,
    weather_main: 'Clear',
    weather_description: 'clear sky',
    weather_icon: '01d',
    rain_1h: null,
    rain_3h: null,
    snow_1h: null,
    snow_3h: null,
    sunrise: null,
    sunset: null,
    location_name: null,
    dt: null,
  },
  forecast: [{
    date: '2026-05-05',
    temp_day: 72,
    temp_min: 58,
    temp_max: 76,
    humidity: 30,
    pressure: 1012,
    wind_max: 10,
    wind_gust_max: 14,
    wind_deg: 190,
    pop: 5,
    rain_total: 0,
    snow_total: 0,
    weather_id: 800,
    weather_main: 'Clear',
    weather_description: 'clear sky',
    weather_icon: '01d',
  }],
  alerts: [],
  trail_conditions: null,
};

function result(source, cachedAt, error = null, waypoint = baseWaypoint) {
  return {
    source,
    cachedAt,
    error,
    data: {
      fetched_at: new Date(cachedAt).toISOString(),
      units: 'imperial',
      results: waypoint ? [waypoint] : [],
    },
  };
}

const liveSnapshot = buildECSWeatherSnapshot({
  result: result('live', now),
  sourceType: 'current_location',
});
assert.strictEqual(liveSnapshot.status.kind, 'live');

const cachedSnapshot = buildECSWeatherSnapshot({
  result: result('cache_fresh', now - 5 * 60 * 1000),
  sourceType: 'current_location',
});
assert.strictEqual(cachedSnapshot.status.kind, 'cached');
assert.strictEqual(cachedSnapshot.cache.freshness, 'fresh');

const staleSnapshot = buildECSWeatherSnapshot({
  result: result('cache_stale', now - 3 * 60 * 60 * 1000),
  sourceType: 'current_location',
});
assert.strictEqual(staleSnapshot.status.kind, 'stale');
assert.strictEqual(staleSnapshot.status.stale, true);

const providerErrorSnapshot = buildECSWeatherSnapshot({
  result: result('fallback', now, 'Weather provider error (500)', null),
  sourceType: 'current_location',
});
assert.strictEqual(providerErrorSnapshot.status.kind, 'provider_error');
assert.strictEqual(providerErrorSnapshot.current.temp, null);

const permissionSnapshot = buildECSWeatherSnapshot({
  result: null,
  sourceType: 'current_location',
  permissionBlocked: true,
});
assert.strictEqual(permissionSnapshot.status.kind, 'permission_required');

const unavailableSnapshot = buildECSWeatherSnapshot({
  result: null,
  sourceType: 'selected_coordinate',
});
assert.strictEqual(unavailableSnapshot.status.kind, 'unavailable');

const weatherService = read('lib/weatherService.ts');
assert(weatherService.includes('lastValidSnapshotCache'), 'weatherService should cache last valid ECSWeatherSnapshot by coordinate key.');
assert(weatherService.includes('snapshotCacheKey'), 'weatherService should use deterministic rounded coordinate snapshot cache keys.');
assert(weatherService.includes('hasUsableWeatherFetchResult'), 'weatherService should retain snapshots only from usable weather fetch results.');

const weatherFreshness = read('lib/weatherFreshness.ts');
assert(weatherFreshness.includes('WEATHER_CURRENT_FRESH_TTL_MS = 10 * 60 * 1000'), 'current weather TTL should be 10 minutes.');
assert(weatherFreshness.includes('WEATHER_HOURLY_FRESH_TTL_MS = 30 * 60 * 1000'), 'hourly weather TTL should be 30 minutes.');
assert(weatherFreshness.includes('WEATHER_DAILY_FRESH_TTL_MS = 2 * 60 * 60 * 1000'), 'daily weather TTL should be 2 hours.');

const edgeFunction = read('supabase/functions/get-weather/index.ts');
assert(edgeFunction.includes('data/3.0/onecall'), 'get-weather should prefer OpenWeather One Call 3.0.');
assert(!edgeFunction.includes('data/2.5/weather'), 'get-weather should not call the basic OpenWeather current weather endpoint.');
assert(!edgeFunction.includes('data/2.5/forecast'), 'get-weather should not call the basic OpenWeather forecast endpoint.');
assert(edgeFunction.includes('buildHourlyForecastFromOneCall'), 'get-weather should normalize One Call hourly forecast data.');
assert(edgeFunction.includes('buildDailyForecastFromOneCall'), 'get-weather should normalize One Call daily forecast data.');
assert(!edgeFunction.includes('appid=${coord'), 'provider key must not be derived from coordinates or logged.');

console.log('weather forecast resilience checks passed');
