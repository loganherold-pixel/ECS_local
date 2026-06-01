const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;

const {
  createECS5ProviderRegistry,
  getProviderConfig,
  getProviderHealth,
} = loadTypeScriptModule('lib/ecs5ProviderRegistry.ts');
const {
  ECS5ProviderAdapterRegistry,
} = loadTypeScriptModule('lib/ecs5ObservationPipeline.ts');
const {
  OPENWEATHER_ONECALL_KNOWN_LIMITATIONS,
  buildOpenWeatherOneCallServerUrl,
  createOpenWeatherOneCallAdapter,
  normalizeOpenWeatherOneCallPayload,
} = loadTypeScriptModule('lib/openWeatherOneCallAdapter.ts');
const {
  sampleRouteGeometry,
  sampleRouteWeatherRisk,
} = loadTypeScriptModule('lib/ecs5RouteWeatherSampler.ts');

const now = new Date('2026-04-29T22:00:00.000Z');
const providerRegistry = createECS5ProviderRegistry({
  ENABLE_OPENWEATHER: 'true',
  ENABLE_OPENWEATHER_ONECALL: 'true',
  OPENWEATHER_API_KEY: 'server-only-key',
}, [], now);
const provider = getProviderConfig('openweather_onecall', providerRegistry);
const oneCallFixture = {
  lat: 38.78,
  lon: -121.2,
  timezone: 'America/Los_Angeles',
  timezone_offset: -25200,
  current: {
    dt: 1777499700,
    temp: 46,
    humidity: 82,
    wind_speed: 12,
    weather: [{ id: 500, main: 'Rain', description: 'light rain' }],
    rain: { '1h': 1.2 },
  },
  minutely: [
    { dt: 1777499760, precipitation: 0.2 },
  ],
  hourly: [
    {
      dt: 1777500000,
      temp: 31,
      humidity: 90,
      wind_speed: 14,
      weather: [{ id: 600, main: 'Snow', description: 'snow' }],
      snow: { '1h': 8 },
      pop: 0.9,
    },
    {
      dt: 1777503600,
      temp: 50,
      humidity: 95,
      wind_speed: 18,
      weather: [{ id: 502, main: 'Rain', description: 'heavy intensity rain' }],
      rain: { '1h': 18 },
      pop: 1,
    },
  ],
  daily: [
    {
      dt: 1777507200,
      temp: { max: 101, min: 70 },
      humidity: 14,
      wind_speed: 34,
      weather: [{ id: 800, main: 'Clear', description: 'clear sky' }],
      rain: 0,
    },
  ],
  alerts: [{
    sender_name: 'National Weather Service',
    event: 'Winter Storm Warning',
    start: 1777500000,
    end: 1777520000,
    description: 'Heavy snow expected.',
    tags: ['Snow'],
  }],
};

let observations = normalizeOpenWeatherOneCallPayload(oneCallFixture, provider, {
  now,
  sourceUrl: 'https://api.openweathermap.org/data/3.0/onecall',
});
assert.strictEqual(observations.length, 2, 'Fixture should normalize forecast and alert observations.');
const forecast = observations.find((observation) => observation.subjectType === 'weather_forecast');
const alert = observations.find((observation) => observation.subjectType === 'weather_alert');
assert.ok(forecast.normalizedPayload.current);
assert.strictEqual(forecast.normalizedPayload.minutely.length, 1);
assert.strictEqual(forecast.normalizedPayload.hourly.length, 2);
assert.strictEqual(forecast.normalizedPayload.daily.length, 1);
assert.strictEqual(alert.normalizedPayload.sender_name, 'National Weather Service');
assert.strictEqual(alert.normalizedPayload.legalClosureSignal, false);
assert.strictEqual(alert.confidenceBreakdown.underlyingAgencySignal.detected, true);
assert.ok(alert.knownLimitations.includes('not_legal_authority'));
assert.ok(alert.knownLimitations.includes('not_closure_authority'));
assert.ok(alert.knownLimitations.includes('not_fire_perimeter_authority'));
assert.deepStrictEqual([...OPENWEATHER_ONECALL_KNOWN_LIMITATIONS], [
  'commercial_weather_provider',
  'not_legal_authority',
  'not_closure_authority',
  'not_fire_perimeter_authority',
]);
assert.ok(!JSON.stringify(observations).includes('server-only-key'), 'OpenWeather API key must not appear in observations.');

const missingConfigRegistry = createECS5ProviderRegistry({
  ENABLE_OPENWEATHER: 'true',
  ENABLE_OPENWEATHER_ONECALL: 'true',
}, [], now);
assert.strictEqual(getProviderHealth('openweather_onecall', missingConfigRegistry).status, 'missing_config');
assert.strictEqual(getProviderHealth('openweather_road_risk', providerRegistry).status, 'intentionally_disabled');
assert.ok(buildOpenWeatherOneCallServerUrl({
  lat: 38.78,
  lon: -121.2,
  units: 'imperial',
  exclude: ['alerts'],
}).includes('appid={{OPENWEATHER_API_KEY}}'), 'One Call URL builder should use a server-side placeholder.');

const geometry = [
  { lat: 38.78, lon: -121.2 },
  { lat: 38.88, lon: -121.3 },
  { lat: 39.0, lon: -121.45 },
];
const samples = sampleRouteGeometry(geometry, { intervalMiles: 8, maxSamplePoints: 4 });
assert.deepStrictEqual(samples.map((sample) => sample.index), [0, 1, 2, 3]);
assert.strictEqual(samples[0].distanceMiles, 0);
assert.ok(samples[3].distanceMiles > samples[1].distanceMiles);

const adapterRegistry = new ECS5ProviderAdapterRegistry({ providerRegistry });
adapterRegistry.registerAdapter(createOpenWeatherOneCallAdapter(provider));

(async () => {
  const routeResult = await sampleRouteWeatherRisk({
    routeId: 'route-weather-1',
    geometry,
    tripStartTime: '2026-04-29T22:00:00.000Z',
    estimatedRouteDurationMinutes: 180,
    sampleIntervalMiles: 8,
    maxSamplePoints: 3,
    fixturePayloadBySample: (_point, index) => {
      if (index === 0) return oneCallFixture;
      if (index === 1) return {
        ...oneCallFixture,
        current: {
          dt: 1777503600,
          temp: 52,
          humidity: 95,
          wind_speed: 18,
          weather: [{ id: 502, main: 'Rain', description: 'heavy intensity rain' }],
          rain: { '1h': 22 },
        },
        hourly: [],
        daily: [],
        alerts: [],
      };
      return {
        ...oneCallFixture,
        current: {
          dt: 1777507200,
          temp: 102,
          humidity: 12,
          wind_speed: 42,
          weather: [{ id: 800, main: 'Clear', description: 'clear sky' }],
        },
        hourly: [],
        daily: [],
        alerts: [],
      };
    },
  }, adapterRegistry);

  assert.strictEqual(routeResult.segmentRisks.length, 3);
  assert.strictEqual(routeResult.segmentRisks[0].snowRisk, 'moderate');
  assert.ok(routeResult.segmentRisks[0].winterWeatherRisk === 'moderate' || routeResult.segmentRisks[0].winterWeatherRisk === 'high');
  assert.strictEqual(routeResult.segmentRisks[1].precipRisk, 'high');
  assert.strictEqual(routeResult.segmentRisks[1].floodRisk, 'high');
  assert.strictEqual(routeResult.segmentRisks[2].windRisk, 'high');
  assert.strictEqual(routeResult.segmentRisks[2].temperatureRisk, 'high');
  assert.strictEqual(routeResult.segmentRisks[2].fireWeatherContextFromForecast, 'critical');
  assert.ok(routeResult.segmentRisks.every((risk) => risk.evidenceObservationIds.length > 0));
  const routeJson = JSON.stringify(routeResult);
  assert.ok(!routeJson.includes('road_surface_temperature'));
  assert.ok(!routeJson.includes('black_ice_certainty'));

  const freezingRainResult = await sampleRouteWeatherRisk({
    routeId: 'route-black-ice',
    geometry: geometry.slice(0, 2),
    tripStartTime: '2026-04-29T22:00:00.000Z',
    estimatedRouteDurationMinutes: 30,
    sampleIntervalMiles: 50,
    maxSamplePoints: 1,
    fixturePayloadBySample: () => ({
      ...oneCallFixture,
      current: {
        dt: 1777500000,
        temp: 30,
        wind_speed: 8,
        humidity: 90,
        weather: [{ id: 511, main: 'Rain', description: 'freezing rain' }],
        rain: { '1h': 3 },
      },
      hourly: [],
      daily: [],
      alerts: [],
    }),
  }, adapterRegistry);
  assert.strictEqual(freezingRainResult.segmentRisks[0].blackIceInferred, true);
  assert.ok(freezingRainResult.segmentRisks[0].riskReasons.some((reason) => reason.includes('does not assert black ice certainty')));

  const emptyAdapterRegistry = new ECS5ProviderAdapterRegistry({ providerRegistry });
  emptyAdapterRegistry.registerAdapter(createOpenWeatherOneCallAdapter(provider));
  const missingResult = await sampleRouteWeatherRisk({
    routeId: 'route-timeout',
    geometry: geometry.slice(0, 2),
    tripStartTime: '2026-04-29T22:00:00.000Z',
    estimatedRouteDurationMinutes: 30,
    sampleIntervalMiles: 50,
    maxSamplePoints: 1,
  }, emptyAdapterRegistry);
  assert.strictEqual(missingResult.segmentRisks[0].weatherRiskLabel, 'unknown', 'Provider timeout/missing fixture should fall back to unknown.');

  const source = fs.readFileSync(path.join(process.cwd(), 'lib/openWeatherOneCallAdapter.ts'), 'utf8');
  assert.ok(!source.includes('road_surface_temperature'));
  assert.ok(!source.includes('black_ice_certainty'));
  assert.ok(!source.includes('OPENWEATHER_API_KEY='), 'Adapter source should not contain a real API key assignment.');

  console.log('OpenWeather One Call adapter and route sampler tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
