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

function walkFiles(dir, matcher, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, matcher, out);
    } else if (matcher(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

const { buildECSWeatherSnapshot } = loadTypeScriptModule('lib/ecsWeather.ts');

const weatherService = read('lib/weatherService.ts');
const useWeather = read('lib/useWeather.ts');
const useOperationalWeather = read('lib/useOperationalWeather.ts');
const weatherIntelPanel = read('components/weather/WeatherIntelPanel.tsx');
const routeCorridorWeather = read('components/navigate/RouteCorridorWeather.tsx');
const weatherStore = read('lib/weatherStore.ts');

assert(
  weatherService.includes('export async function fetchSharedWeatherForCoordinates'),
  'weatherService should expose the shared coordinate-first weather fetch facade.',
);
assert(
  weatherService.includes('resolveECSWeatherTarget') &&
    weatherService.includes('currentGps') &&
    weatherService.includes('activeRoute') &&
    weatherService.includes('selectedCoordinate') &&
    weatherService.includes('lastKnown'),
  'weatherService should resolve current GPS, active route, selected coordinate, and last-known weather targets.',
);
assert(
  weatherService.includes('No valid weather coordinate is available.'),
  'weatherService should expose an explicit unavailable state instead of a default city fallback.',
);
assert(
  weatherService.includes('normalizeWeatherCoordinates') &&
    weatherService.includes('isValidLatitude') &&
    weatherService.includes('isValidLongitude'),
  'weatherService should validate lat/lon before provider calls.',
);
assert(
  useWeather.includes('useOperationalWeather as useWeather') &&
    useWeather.includes('fetchSharedWeatherForCoordinates'),
  'lib/useWeather.ts should be the shared public hook/service entrypoint.',
);
assert(
  useOperationalWeather.includes('fetchSharedWeatherForCoordinates') &&
    useOperationalWeather.includes('getCachedSharedWeatherResult') &&
    !useOperationalWeather.includes('fetchWeatherForLocation'),
  'useOperationalWeather should use the shared service facade, not fetch provider/store location calls directly.',
);
assert(
  weatherIntelPanel.includes('fetchSharedWeatherForCoordinates') &&
    weatherIntelPanel.includes('getCachedSharedWeatherResult') &&
    !weatherIntelPanel.includes('fetchWeatherWithStatus'),
  'WeatherIntelPanel should use shared weather service APIs.',
);
assert(
  routeCorridorWeather.includes('fetchSharedWeatherForCoordinates') &&
    !routeCorridorWeather.includes('fetchWeatherWithStatus,'),
  'RouteCorridorWeather should use shared weather service APIs.',
);
assert(
  weatherStore.includes("supabase.functions.invoke('get-weather'") &&
    !weatherService.includes("supabase.functions.invoke('get-weather'"),
  'Only the low-level weather store should invoke the get-weather edge function.',
);

const sourceFiles = [
  ...walkFiles(path.join(process.cwd(), 'app'), (file) => /\.(ts|tsx)$/.test(file)),
  ...walkFiles(path.join(process.cwd(), 'components'), (file) => /\.(ts|tsx)$/.test(file)),
  ...walkFiles(path.join(process.cwd(), 'lib'), (file) => /\.(ts|tsx)$/.test(file)),
];
const directProviderParsers = sourceFiles
  .filter((file) => !/[\\/]lib[\\/]weather(Store|Service|EdgeFunctionSpec)\.ts$/.test(file))
  .filter((file) => read(path.relative(process.cwd(), file)).includes("supabase.functions.invoke('get-weather'"));
assert.deepStrictEqual(
  directProviderParsers.map((file) => path.relative(process.cwd(), file)),
  [],
  'No screen/widget should invoke or parse the OpenWeather edge response directly.',
);

const fetchedAt = '2026-05-04T12:00:00.000Z';
const cachedAt = Date.now() - 42_000;
const weatherResult = {
  source: 'live',
  cachedAt,
  error: null,
  data: {
    fetched_at: fetchedAt,
    units: 'imperial',
    results: [{
      lat: 39.7392,
      lng: -104.9903,
      label: 'Map Pin Alpha',
      error: null,
      current: {
        temp: 71,
        feels_like: 69,
        temp_min: 58,
        temp_max: 76,
        humidity: 34,
        pressure: 1014,
        visibility: 10000,
        wind_speed: 11,
        wind_deg: 240,
        wind_gust: 18,
        clouds: 10,
        weather_id: 800,
        weather_main: 'Clear',
        weather_description: 'clear sky',
        weather_icon: '01d',
        rain_1h: null,
        rain_3h: null,
        snow_1h: null,
        snow_3h: null,
        sunrise: 1777896000,
        sunset: 1777947600,
        location_name: 'Display Label Only',
        dt: 1777896000,
      },
      forecast: [{
        date: '2026-05-04',
        temp_min: 58,
        temp_max: 76,
        humidity: 34,
        pressure: 1014,
        wind_max: 14,
        wind_gust_max: 22,
        wind_deg: 240,
        pop: 10,
        rain_total: 0,
        snow_total: 0,
        weather_id: 800,
        weather_main: 'Clear',
        weather_description: 'clear sky',
        weather_icon: '01d',
      }],
      alerts: [],
      trail_conditions: { overall: 'good', factors: [] },
    }],
  },
};

const dashboardSnapshot = buildECSWeatherSnapshot({
  result: weatherResult,
  sourceType: 'current_location',
  locationFallback: 'Dashboard',
});
const navigateSnapshot = buildECSWeatherSnapshot({
  result: weatherResult,
  sourceType: 'current_location',
  locationFallback: 'Navigate',
});

assert.deepStrictEqual(
  {
    temp: dashboardSnapshot.current.temp,
    condition: dashboardSnapshot.current.condition,
    provider: dashboardSnapshot.provider,
    location: dashboardSnapshot.location,
    daily: dashboardSnapshot.daily,
  },
  {
    temp: navigateSnapshot.current.temp,
    condition: navigateSnapshot.current.condition,
    provider: navigateSnapshot.provider,
    location: navigateSnapshot.location,
    daily: navigateSnapshot.daily,
  },
  'The same coordinate/result should produce the same ECSWeatherSnapshot shape for every surface.',
);
assert.strictEqual(dashboardSnapshot.location.lat, 39.7392);
assert.strictEqual(dashboardSnapshot.location.lng, -104.9903);
assert.strictEqual(dashboardSnapshot.location.label, 'Map Pin Alpha');
assert(dashboardSnapshot.locationConfidence > 0.9, 'Live coordinate-backed weather should have high location confidence.');
assert.strictEqual(dashboardSnapshot.provider.id, 'ecs_weather');
assert.strictEqual(dashboardSnapshot.cache.cachedAt, cachedAt);
assert(dashboardSnapshot.cacheAgeMs >= 0, 'Snapshot should expose cacheAgeMs.');
assert.strictEqual(dashboardSnapshot.fetchedAt, fetchedAt);

const unavailableSnapshot = buildECSWeatherSnapshot({
  result: null,
  sourceType: 'selected_coordinate',
  locationFallback: 'No valid coordinate',
});
assert.strictEqual(unavailableSnapshot.raw, null);
assert.strictEqual(unavailableSnapshot.current.temp, null);
assert.strictEqual(unavailableSnapshot.normalized.source, 'unavailable');
assert.strictEqual(unavailableSnapshot.locationConfidence, 0);
assert.strictEqual(unavailableSnapshot.status.kind, 'unavailable');

console.log('shared weather source-of-truth checks passed');
