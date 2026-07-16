const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const originalModuleLoad = Module._load;
Module._load = function loadWithWeatherBrokerStubs(request, parent, isMain) {
  const normalized = request.replace(/\\/g, '/');
  if (normalized === './connectivity' || normalized.endsWith('/lib/connectivity')) {
    return { connectivity: { isOnline: () => true } };
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};

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
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod.load(fullPath);
  return mod.exports;
}

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');
}

const {
  buildOpenWeatherExclude,
  buildWeatherBucket,
  createWeatherBroker,
  getWeatherBrokerTtlMs,
} = loadTypeScriptModule('lib/weatherBroker.ts');

function makeWeatherResult(coords, units, nowMs, source = 'live', overrides = {}) {
  return {
    data: {
      results: coords.map((coord, index) => ({
        lat: coord.lat,
        lng: coord.lng,
        label: coord.label ?? null,
        error: overrides.error ?? null,
        current: overrides.current === null ? null : {
          temp: 70 + index,
          feels_like: 70 + index,
          temp_min: 60,
          temp_max: 78,
          humidity: 40,
          pressure: 1014,
          visibility: 10000,
          wind_speed: 8,
          wind_deg: 220,
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
          sunrise: 1777896000,
          sunset: 1777947600,
          location_name: coord.label ?? null,
          dt: 1777896000,
        },
        hourly: overrides.hourly ?? [],
        daily: overrides.daily ?? [],
        forecast: overrides.daily ?? [],
        alerts: overrides.alerts ?? [],
        trail_conditions: null,
      })),
      fetched_at: new Date(nowMs).toISOString(),
      units,
      provider: 'openweather',
      errors: overrides.errors ?? [],
    },
    source,
    cachedAt: nowMs,
    error: overrides.resultError ?? null,
  };
}

assert.deepStrictEqual(
  buildWeatherBucket({ lat: 39.1234, lng: -120.9876 }, 0.05),
  {
    key: '39.10_-121.00',
    normalizedCoordinate: { lat: 39.1, lng: -121 },
  },
  'coordinates should be rounded into coarse 0.05 degree weather buckets',
);
assert.strictEqual(getWeatherBrokerTtlMs('active_navigation'), 10 * 60 * 1000);
assert.strictEqual(getWeatherBrokerTtlMs('explore_list'), 45 * 60 * 1000);
assert.strictEqual(getWeatherBrokerTtlMs('route_planning'), 30 * 60 * 1000);
assert.strictEqual(getWeatherBrokerTtlMs('weather_alerts'), 10 * 60 * 1000);
assert.strictEqual(buildOpenWeatherExclude(['current']), 'minutely,hourly,daily,alerts');
assert.strictEqual(buildOpenWeatherExclude(['current', 'hourly', 'daily', 'alerts']), 'minutely');
assert.strictEqual(buildOpenWeatherExclude(['alerts']), 'current,minutely,hourly,daily');

async function run() {
  let nowMs = Date.parse('2026-06-22T12:00:00.000Z');
  let online = true;
  const providerCalls = [];
  const scheduled = [];
  const broker = createWeatherBroker({
    bucketSizeDegrees: 0.05,
    dailyBudget: 2,
    sessionBudget: 2,
    nowMs: () => nowMs,
    isOnline: () => online,
    scheduleBackgroundRefresh: (refresh) => {
      scheduled.push(refresh);
    },
    providerFetch: async (coords, units, forceRefresh, context) => {
      providerCalls.push({ coords, units, forceRefresh, context, at: nowMs });
      return makeWeatherResult(coords, units, nowMs);
    },
    cachedFetch: async () => null,
  });

  const first = await broker.fetchWeather([
    { lat: 39.1234, lng: -120.9876, label: 'GPS A' },
    { lat: 39.1249, lng: -120.9901, label: 'GPS B' },
  ], 'imperial', {
    useCase: 'active_navigation',
    sections: ['current', 'alerts'],
    sourceType: 'route_segment',
  });
  assert.strictEqual(providerCalls.length, 1, 'nearby coordinates in one bucket should produce one provider call');
  assert.strictEqual(first.data.results.length, 2, 'broker should fan cached bucket weather back to all source coordinates');
  assert.strictEqual(first.broker.entries[0].bucketKey, '39.10_-121.00');
  assert.strictEqual(first.broker.cacheHit, false);
  assert.strictEqual(first.broker.stale, false);
  assert.strictEqual(first.broker.providerCostMetadata.providerCallsAttempted, 1);
  assert.strictEqual(providerCalls[0].context.providerExclude, 'minutely,hourly,daily');

  const second = await broker.fetchWeather([
    { lat: 39.124, lng: -120.989, label: 'Still same cell' },
  ], 'imperial', {
    useCase: 'active_navigation',
    sections: ['current', 'alerts'],
    sourceType: 'current_location',
  });
  assert.strictEqual(providerCalls.length, 1, 'moving within the same bucket should hit cache');
  assert.strictEqual(second.source, 'cache_fresh');
  assert.strictEqual(second.broker.cacheHit, true);

  nowMs += 11 * 60 * 1000;
  const stale = await broker.fetchWeather([
    { lat: 39.1234, lng: -120.9876, label: 'GPS A' },
  ], 'imperial', {
    useCase: 'active_navigation',
    sections: ['current', 'alerts'],
    sourceType: 'route_segment',
  });
  assert.strictEqual(stale.source, 'cache_stale', 'stale usable data should return immediately');
  assert.strictEqual(stale.broker.stale, true);
  assert.strictEqual(scheduled.length, 1, 'stale usable data should schedule one background refresh');
  await scheduled.shift()();
  assert.strictEqual(providerCalls.length, 2, 'background refresh should make the provider call after stale return');

  let releaseProvider;
  const dedupeBroker = createWeatherBroker({
    bucketSizeDegrees: 0.05,
    dailyBudget: 10,
    sessionBudget: 10,
    nowMs: () => nowMs,
    providerFetch: async (coords, units) => {
      providerCalls.push({ coords, units, at: nowMs, dedupe: true });
      await new Promise(resolve => { releaseProvider = resolve; });
      return makeWeatherResult(coords, units, nowMs);
    },
    cachedFetch: async () => null,
  });
  const p1 = dedupeBroker.fetchWeather([{ lat: 40.01, lng: -121.01 }], 'imperial', { useCase: 'explore_list' });
  const p2 = dedupeBroker.fetchWeather([{ lat: 40.02, lng: -121.02 }], 'imperial', { useCase: 'explore_list' });
  await Promise.resolve();
  releaseProvider();
  const [d1, d2] = await Promise.all([p1, p2]);
  assert.strictEqual(d1.broker.entries[0].bucketKey, d2.broker.entries[0].bucketKey);
  assert.strictEqual(providerCalls.filter(call => call.dedupe).length, 1, 'in-flight bucket requests should dedupe to one provider call');

  const staleProviderCachedAt = nowMs - 60 * 60 * 1000;
  const staleProviderError = 'Live provider unavailable; retained last-good weather.';
  let staleProviderCalls = 0;
  const staleProviderBroker = createWeatherBroker({
    bucketSizeDegrees: 0.05,
    dailyBudget: 10,
    sessionBudget: 10,
    nowMs: () => nowMs,
    providerFetch: async (coords, units) => {
      staleProviderCalls += 1;
      return makeWeatherResult(coords, units, staleProviderCachedAt, 'cache_stale', {
        resultError: staleProviderError,
      });
    },
    cachedFetch: async () => null,
  });
  const staleProviderResult = await staleProviderBroker.fetchWeather([
    { lat: 40.51, lng: -121.51 },
  ], 'imperial', {
    useCase: 'active_navigation',
    sections: ['current'],
  });
  assert.strictEqual(staleProviderResult.source, 'cache_stale', 'usable provider fallback must remain cache_stale');
  assert.strictEqual(staleProviderResult.cachedAt, staleProviderCachedAt, 'broker must preserve the provider cache timestamp');
  assert.strictEqual(staleProviderResult.error, staleProviderError, 'broker must preserve provider failure context');
  assert.strictEqual(staleProviderResult.broker.stale, true, 'broker diagnostics must report the retained result as stale');

  const repeatedStaleProviderResult = await staleProviderBroker.fetchWeather([
    { lat: 40.51, lng: -121.51 },
  ], 'imperial', {
    useCase: 'active_navigation',
    sections: ['current'],
  });
  assert.strictEqual(staleProviderCalls, 2, 'degraded cached provider results must not be admitted to the broker live cache');
  assert.strictEqual(repeatedStaleProviderResult.source, 'cache_stale');
  assert.strictEqual(repeatedStaleProviderResult.cachedAt, staleProviderCachedAt);

  online = false;
  const offlineCached = await broker.fetchWeather([{ lat: 39.124, lng: -120.989 }], 'imperial', {
    useCase: 'active_navigation',
    sections: ['current'],
  });
  assert.strictEqual(offlineCached.source, 'cache_stale', 'offline mode should return last cached bucket weather');
  assert.strictEqual(providerCalls.length, 3, 'offline mode should not make a new provider call');

  const offlineMiss = await broker.fetchWeather([{ lat: 41.5, lng: -122.5 }], 'imperial', {
    useCase: 'active_navigation',
    sections: ['current'],
  });
  assert.strictEqual(offlineMiss.source, 'fallback');
  assert.match(offlineMiss.error, /offline/i);

  online = true;
  const budgetDenied = await broker.fetchWeather([{ lat: 42.5, lng: -123.5 }], 'imperial', {
    useCase: 'active_navigation',
    sections: ['current'],
  });
  assert.strictEqual(budgetDenied.source, 'fallback');
  assert.strictEqual(budgetDenied.broker.providerCostMetadata.budgetDenied, true);
  assert.strictEqual(providerCalls.length, 3, 'budget denial should not call the provider');

  const cooldownCalls = [];
  const cooldownBroker = createWeatherBroker({
    bucketSizeDegrees: 0.05,
    dailyBudget: 10,
    sessionBudget: 10,
    nowMs: () => nowMs,
    providerFetch: async (coords, units) => {
      cooldownCalls.push({ coords, units, at: nowMs });
      return makeWeatherResult(coords, units, nowMs, 'fallback', {
        current: null,
        error: 'OpenWeather 429',
        resultError: 'OpenWeather rate limit',
        errors: [{ status: 429, code: 'rate_limit', message: 'Too many requests' }],
      });
    },
    cachedFetch: async () => null,
  });
  const limited = await cooldownBroker.fetchWeather([{ lat: 43.01, lng: -124.01 }], 'imperial', {
    useCase: 'weather_alerts',
    sections: ['alerts'],
  });
  assert.strictEqual(limited.broker.providerCostMetadata.rateLimited, true);
  const cooldown = await cooldownBroker.fetchWeather([{ lat: 43.02, lng: -124.02 }], 'imperial', {
    useCase: 'weather_alerts',
    sections: ['alerts'],
  });
  assert.strictEqual(cooldown.broker.providerCostMetadata.cooldownActive, true);
  assert.strictEqual(cooldownCalls.length, 1, '429 cooldown should prevent retry storms');

  const weatherServiceSource = read('lib/weatherService.ts');
  assert(weatherServiceSource.includes('fetchWeatherThroughBroker'), 'shared weather service should route provider requests through the broker');
  assert(!weatherServiceSource.includes('fetchWeatherWithStatus,'), 'shared weather service should not import direct weatherStore fetches');

  console.log('weather broker checks passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
