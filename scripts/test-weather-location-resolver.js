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

const {
  resolveWeatherLocation,
  resolveWeatherLocationWithReverseGeocode,
  WEATHER_LOCATION_UNAVAILABLE,
} = loadTypeScriptModule('lib/weatherLocationResolver.ts');
const { buildECSWeatherSnapshot } = loadTypeScriptModule('lib/ecsWeather.ts');

const rocklin = { lat: 38.7907, lng: -121.2358 };
const sacramento = { lat: 38.5816, lng: -121.4944 };

const previousSacramento = resolveWeatherLocation({
  selectedCoordinate: {
    coordinate: sacramento,
    label: 'Sacramento',
    labelSource: 'reverse_geocode',
  },
});

const movedToRocklinWithoutReverseGeocode = resolveWeatherLocation({
  currentGps: {
    coordinate: rocklin,
    hasFix: true,
    accuracyM: 25,
  },
  previousLocation: previousSacramento,
});

assert.strictEqual(
  movedToRocklinWithoutReverseGeocode.displayLabel,
  '38.79, -121.24',
  'Coordinate changes without a matching reverse geocode should not keep a stale city label.',
);
assert.notStrictEqual(movedToRocklinWithoutReverseGeocode.displayLabel, 'Sacramento');
assert.strictEqual(movedToRocklinWithoutReverseGeocode.shouldInvalidateLabel, true);
assert.strictEqual(movedToRocklinWithoutReverseGeocode.shouldRefreshWeather, true);
assert.strictEqual(movedToRocklinWithoutReverseGeocode.forceRefreshWeather, true);
assert.strictEqual(movedToRocklinWithoutReverseGeocode.labelConfidence, 'low');

const reverseResolvedRocklin = resolveWeatherLocation({
  currentGps: {
    coordinate: rocklin,
    label: 'Rocklin',
    labelSource: 'reverse_geocode',
    hasFix: true,
    accuracyM: 20,
  },
  previousLocation: previousSacramento,
});
assert.strictEqual(reverseResolvedRocklin.displayLabel, 'Rocklin');
assert.strictEqual(reverseResolvedRocklin.labelConfidence, 'high');

const routeWinsWhenGpsAccuracyIsPoor = resolveWeatherLocation({
  currentGps: {
    coordinate: rocklin,
    hasFix: true,
    accuracyM: 1200,
  },
  activeRoute: {
    coordinate: { lat: 39.1, lng: -121.2, label: 'Route Weather Point' },
    label: 'Route Weather Point',
    labelSource: 'route',
  },
});
assert.strictEqual(routeWinsWhenGpsAccuracyIsPoor.source, 'active_route');
assert.strictEqual(routeWinsWhenGpsAccuracyIsPoor.displayLabel, 'Route Weather Point');
assert.strictEqual(routeWinsWhenGpsAccuracyIsPoor.labelConfidence, 'medium');

const poorGpsOnly = resolveWeatherLocation({
  currentGps: {
    coordinate: rocklin,
    hasFix: true,
    accuracyM: 1600,
  },
});
assert.strictEqual(poorGpsOnly.source, 'current_gps');
assert.strictEqual(poorGpsOnly.accuracyM, 1600);
assert.strictEqual(poorGpsOnly.labelConfidence, 'low');
assert(poorGpsOnly.staleReason.includes('gps_accuracy_poor'));

const recentLastKnown = resolveWeatherLocation({
  lastKnown: {
    coordinate: { lat: 38.79, lng: -121.24, label: 'Last Known Weather Location' },
    cachedAt: Date.now() - 30 * 60 * 1000,
  },
});
assert.strictEqual(recentLastKnown.source, 'last_known');
assert.strictEqual(recentLastKnown.stale, true);
assert.strictEqual(recentLastKnown.labelConfidence, 'medium');

const staleLastKnownUnavailable = resolveWeatherLocation({
  lastKnown: {
    coordinate: { lat: 38.79, lng: -121.24, label: 'Old Weather Location' },
    cachedAt: Date.now() - 3 * 60 * 60 * 1000,
  },
});
assert.strictEqual(staleLastKnownUnavailable.status, 'unavailable');
assert.strictEqual(staleLastKnownUnavailable.displayLabel, WEATHER_LOCATION_UNAVAILABLE);

const implicitManualFallback = resolveWeatherLocation({
  manualFallback: {
    coordinate: { lat: 40, lng: -120, label: 'Manual Default City' },
    label: 'Manual Default City',
    labelSource: 'manual',
    explicitlySelected: false,
  },
});
assert.strictEqual(implicitManualFallback.status, 'unavailable');

const explicitManualFallback = resolveWeatherLocation({
  manualFallback: {
    coordinate: { lat: 40, lng: -120, label: 'Manual Weather Point' },
    label: 'Manual Weather Point',
    labelSource: 'manual',
    explicitlySelected: true,
  },
});
assert.strictEqual(explicitManualFallback.source, 'manual');
assert.strictEqual(explicitManualFallback.labelConfidence, 'low');

const providerSaysSacramento = {
  source: 'live',
  cachedAt: Date.now(),
  error: null,
  data: {
    fetched_at: new Date().toISOString(),
    units: 'imperial',
    results: [{
      lat: rocklin.lat,
      lng: rocklin.lng,
      label: null,
      error: null,
      current: {
        temp: 70,
        feels_like: 70,
        temp_min: 60,
        temp_max: 75,
        humidity: 20,
        pressure: 1010,
        visibility: 10000,
        wind_speed: 8,
        wind_deg: 180,
        wind_gust: null,
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
        location_name: 'Sacramento',
        dt: null,
      },
      forecast: [],
      alerts: [],
      trail_conditions: null,
    }],
  },
};

const snapshot = buildECSWeatherSnapshot({
  result: providerSaysSacramento,
  sourceType: 'current_location',
  locationResolution: movedToRocklinWithoutReverseGeocode,
});
assert.strictEqual(snapshot.locationName, '38.79, -121.24');
assert.strictEqual(snapshot.location.labelConfidence, 'low');
assert.strictEqual(snapshot.location.accuracyM, 25);
assert.strictEqual(snapshot.location.stale, true);

resolveWeatherLocationWithReverseGeocode(
  {
    currentGps: {
      coordinate: rocklin,
      hasFix: true,
      accuracyM: 20,
    },
  },
  async () => 'Rocklin',
).then((reverseResolved) => {
  assert.strictEqual(reverseResolved.displayLabel, 'Rocklin');
  assert.strictEqual(reverseResolved.labelConfidence, 'high');
  assert.strictEqual(reverseResolved.labelSource, 'reverse_geocode');
  console.log('weather location resolver checks passed');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
