/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypeScriptModule(relativePath, stubs) {
  const fullPath = path.join(root, relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const compiled = new Module(fullPath, module);
  compiled.filename = fullPath;
  compiled.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compiled.require = request => {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) {
      return stubs[request];
    }
    return Module._load(request, compiled);
  };
  compiled._compile(output.outputText, fullPath);
  return compiled.exports;
}

function toFiniteNumber(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeWeatherTemperatureF(current, units) {
  const fahrenheit = toFiniteNumber(current?.tempF ?? current?.temperatureF);
  if (fahrenheit != null) return fahrenheit;
  const value = toFiniteNumber(current?.temp ?? current?.temperature);
  if (value == null) return null;
  return units === 'metric' ? (value * 9) / 5 + 32 : value;
}

function normalizeWeatherTemperatureC(current, units) {
  const celsius = toFiniteNumber(current?.tempC ?? current?.temperatureC);
  if (celsius != null) return celsius;
  const value = toFiniteNumber(current?.temp ?? current?.temperature);
  if (value == null) return null;
  return units === 'metric' ? value : ((value - 32) * 5) / 9;
}

function createWeatherStore(edgeResponses) {
  const persisted = new Map();
  const inFlight = new Map();
  let providerCalls = 0;

  const weatherStore = compileTypeScriptModule('lib/weatherStore.ts', {
    './connectivity': { connectivity: { isOnline: () => true } },
    './ecsIssueIntelligence': {
      reportDegradedState() {},
      reportRecoverableFailure() {},
    },
    './ecsIssueRuntime': { setIssueRuntimeWeatherStatus() {} },
    './fallbackStateLabels': { ECS_FALLBACK_LABELS: { unavailable: 'Unavailable' } },
    './keyValuePersistence': {
      createPersistedKeyValueCache() {
        return {
          get: key => persisted.get(key) ?? null,
          set: (key, value) => persisted.set(key, value),
          delete: key => persisted.delete(key),
          waitForHydration: () => Promise.resolve(),
          flush: () => Promise.resolve(),
        };
      },
    },
    './weatherNormalization': {
      normalizeWeatherTemperatureC,
      normalizeWeatherTemperatureF,
      normalizeWindSpeed: value => toFiniteNumber(value),
      toFiniteNumber,
    },
    './weatherRequestDedupe': {
      buildWeatherRequestKey: input => JSON.stringify({
        mode: input.mode,
        coordinates: input.coordinates.map(({ lat, lng }) => [lat, lng]),
        units: input.units,
        forceRefresh: input.forceRefresh,
      }),
      clearInFlightWeatherRequests: () => inFlight.clear(),
      getInFlightWeatherRequestCount: () => inFlight.size,
      runDedupedWeatherRequest(key, request, onJoinedExisting) {
        const existing = inFlight.get(key);
        if (existing) {
          onJoinedExisting?.();
          return existing;
        }
        const next = Promise.resolve()
          .then(request)
          .finally(() => {
            if (inFlight.get(key) === next) inFlight.delete(key);
          });
        inFlight.set(key, next);
        return next;
      },
    },
    './weatherFreshness': {
      getWeatherFreshness({ source, fetchedAt, cachedAt, hasWeatherData }) {
        const timestampMs = cachedAt ?? Date.parse(fetchedAt ?? '');
        return {
          freshness: hasWeatherData ? (source === 'live' ? 'live' : 'cached') : 'missing',
          stale: source === 'cache_stale',
          timestampMs: Number.isFinite(timestampMs) ? timestampMs : null,
        };
      },
      parseWeatherTimestampMs: value => {
        const parsed = Date.parse(value ?? '');
        return Number.isFinite(parsed) ? parsed : null;
      },
    },
    './ecsLogger': {
      ecsLog: {
        breadcrumb() {},
        captureFailure() {},
        dev() {},
      },
    },
    './openWeatherClient': {
      ECS_WEATHER_DEBUG_FLAG: false,
      getOpenWeatherCoordinateBucketsForRequestBody: () => ['redacted_bucket'],
      async invokeOpenWeatherOneCallEdgeFunction() {
        const response = edgeResponses[providerCalls];
        providerCalls += 1;
        return { data: response, error: null };
      },
      recordOpenWeatherCacheHit() {},
      recordOpenWeatherCacheMiss() {},
      recordOpenWeatherDuplicateAvoided() {},
      recordOpenWeatherStaleCacheReturn() {},
    },
  });

  return {
    weatherStore,
    getProviderCalls: () => providerCalls,
  };
}

function structuredProviderFailure(coordinate) {
  return {
    error: 'Weather provider error',
    results: [{
      lat: coordinate.lat,
      lng: coordinate.lng,
      label: coordinate.label,
      error: 'provider temporarily unavailable',
      current: null,
      hourly: [],
      daily: [],
      forecast: [],
      alerts: [],
      trail_conditions: null,
    }],
    fetched_at: '2026-07-15T18:00:00.000Z',
    units: 'imperial',
    provider: 'openweather',
    errors: [{ status: 502, code: 'weather_fetch_failed', message: 'provider unavailable' }],
  };
}

function malformedEmptySuccess(coordinate) {
  return {
    results: [{
      lat: coordinate.lat,
      lng: coordinate.lng,
      label: coordinate.label,
      error: null,
      current: {},
      hourly: [],
      daily: [],
      forecast: [],
      alerts: [],
      trail_conditions: null,
    }],
    fetched_at: '2026-07-15T18:00:00.000Z',
    units: 'imperial',
    provider: 'openweather',
    errors: [],
  };
}

function liveForecast(coordinate) {
  return {
    results: [{
      lat: coordinate.lat,
      lng: coordinate.lng,
      label: coordinate.label,
      error: null,
      current: {
        temp: 72,
        feels_like: 71,
        humidity: 35,
        wind_speed: 6,
        weather_main: 'Clear',
        weather_description: 'clear sky',
        dt: 1784138400,
      },
      hourly: [{
        dt: 1784142000,
        temp: 73,
        feels_like: 72,
        humidity: 34,
        wind_speed: 7,
        weather_main: 'Clear',
      }],
      daily: [{
        dt: 1784138400,
        temp_min: 55,
        temp_max: 78,
        weather_main: 'Clear',
        weather_description: 'clear sky',
      }],
      forecast: [{
        dt: 1784138400,
        temp_min: 55,
        temp_max: 78,
        weather_main: 'Clear',
        weather_description: 'clear sky',
      }],
      alerts: [],
      trail_conditions: null,
    }],
    fetched_at: '2026-07-15T18:05:00.000Z',
    units: 'imperial',
    provider: 'openweather',
    errors: [],
  };
}

async function exerciseFailureThenRecovery(name, firstPayload) {
  const coordinate = { lat: 39.123, lng: -120.456, label: 'Current Position' };
  const harness = createWeatherStore([
    firstPayload(coordinate),
    liveForecast(coordinate),
  ]);
  const { weatherStore } = harness;

  const first = await weatherStore.fetchWeatherWithStatus(
    [coordinate],
    'imperial',
    false,
    { sourceType: 'current_location', screen: 'Dashboard' },
  );
  const cachedAfterFailure = weatherStore.getCachedWeatherResult(
    [coordinate],
    'imperial',
    { allowStale: true },
  );
  const second = await weatherStore.fetchWeatherWithStatus(
    [coordinate],
    'imperial',
    false,
    { sourceType: 'current_location', screen: 'Dashboard' },
  );

  const observation = {
    name,
    providerCalls: harness.getProviderCalls(),
    firstSource: first.source,
    firstError: first.error,
    firstUsable: weatherStore.hasUsableWeatherFetchResult(first),
    cachedAfterFailure: cachedAfterFailure?.source ?? null,
    secondSource: second.source,
    secondTemperature: second.data.results[0]?.current?.temp ?? null,
  };
  console.log(JSON.stringify(observation));
  return { first, cachedAfterFailure, second, observation, weatherStore };
}

async function main() {
  const structured = await exerciseFailureThenRecovery(
    'http_200_structured_provider_failure',
    structuredProviderFailure,
  );
  const malformed = await exerciseFailureThenRecovery(
    'http_200_malformed_empty_success',
    malformedEmptySuccess,
  );

  for (const scenario of [structured, malformed]) {
    const { first, cachedAfterFailure, second, observation, weatherStore } = scenario;
    assert.strictEqual(
      first.source,
      'fallback',
      `${observation.name}: unusable HTTP-200 weather must terminate as fallback/error, not live.`,
    );
    assert.ok(first.error, `${observation.name}: terminal provider failure must expose a safe error.`);
    assert.strictEqual(
      weatherStore.hasUsableWeatherFetchResult(first),
      false,
      `${observation.name}: derived data-availability guidance must not make missing weather usable.`,
    );
    assert.strictEqual(
      cachedAfterFailure,
      null,
      `${observation.name}: unusable provider output must never enter the last-good cache.`,
    );
    assert.strictEqual(
      observation.providerCalls,
      2,
      `${observation.name}: retry after a failed response must issue a new provider request.`,
    );
    assert.strictEqual(second.source, 'live', `${observation.name}: recovered provider data must be live.`);
    assert.strictEqual(second.error, null, `${observation.name}: recovered provider data must clear the error.`);
    assert.strictEqual(second.data.results[0]?.current?.temp, 72, `${observation.name}: recovered live data must reach the selector payload.`);
  }

  console.log('Dashboard weather structured-provider failure regression passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
