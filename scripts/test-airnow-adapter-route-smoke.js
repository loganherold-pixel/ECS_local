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
  AIRNOW_KNOWN_LIMITATIONS,
  buildAirNowCurrentLatLonUrl,
  buildAirNowForecastLatLonUrl,
  createAirNowAdapter,
  mapAirNowAqiRisk,
  normalizeAirNowPayload,
} = loadTypeScriptModule('lib/airNowAdapter.ts');
const {
  sampleRouteWeatherRisk,
} = loadTypeScriptModule('lib/ecs5RouteWeatherSampler.ts');

const now = new Date('2026-04-29T22:00:00.000Z');
const providerRegistry = createECS5ProviderRegistry({
  ENABLE_AIRNOW: 'true',
  AIRNOW_API_KEY: 'server-only-airnow-key',
}, [], now);
const airNowProvider = getProviderConfig('airnow', providerRegistry);

assert.strictEqual(getProviderHealth('airnow', providerRegistry).status, 'configured');
assert.strictEqual(getProviderHealth('airnow', createECS5ProviderRegistry({ ENABLE_AIRNOW: 'true' }, [], now)).status, 'missing_config');
assert.strictEqual(getProviderHealth('openweather_air_pollution', providerRegistry).status, 'intentionally_disabled');
assert.deepStrictEqual([...AIRNOW_KNOWN_LIMITATIONS], [
  'preliminary_air_quality_data',
  'not_regulatory_data',
  'not_legal_authority',
  'not_closure_authority',
  'may_have_delayed_updates',
]);
assert.strictEqual(mapAirNowAqiRisk(42, 'Good').risk, 'low');
assert.strictEqual(mapAirNowAqiRisk(88, 'Moderate').risk, 'moderate');
assert.strictEqual(mapAirNowAqiRisk(125, 'Unhealthy for Sensitive Groups').risk, 'moderate');
assert.strictEqual(mapAirNowAqiRisk(165, 'Unhealthy').risk, 'high');
assert.strictEqual(mapAirNowAqiRisk(230, 'Very Unhealthy').risk, 'severe');
assert.strictEqual(mapAirNowAqiRisk(330, 'Hazardous').risk, 'severe');
assert.ok(buildAirNowCurrentLatLonUrl({ lat: 38.78123, lon: -121.20761 }).includes('API_KEY={{AIRNOW_API_KEY}}'));
assert.ok(buildAirNowForecastLatLonUrl({ lat: 38.78123, lon: -121.20761 }).includes('API_KEY={{AIRNOW_API_KEY}}'));

const airNowFixture = {
  current: [{
    DateObserved: '2026-04-29',
    HourObserved: 15,
    LocalTimeZone: 'PDT',
    ReportingArea: 'Sacramento-Granite Bay',
    StateCode: 'CA',
    Latitude: 38.78,
    Longitude: -121.2,
    ParameterName: 'PM2.5',
    AQI: 168,
    Category: { Number: 4, Name: 'Unhealthy' },
  }],
  forecast: [{
    DateForecast: '2026-04-30',
    ReportingArea: 'Sacramento-Granite Bay',
    StateCode: 'CA',
    Latitude: 38.78,
    Longitude: -121.2,
    ParameterName: 'OZONE',
    AQI: 81,
    Category: { Number: 2, Name: 'Moderate' },
  }],
};

const observations = normalizeAirNowPayload(airNowFixture, airNowProvider, { now });
assert.strictEqual(observations.length, 2, 'AirNow current and forecast records should normalize.');
const pm25 = observations.find((observation) => observation.normalizedPayload.pollutant === 'PM2.5');
assert.strictEqual(pm25.sourceType, 'official_api');
assert.strictEqual(pm25.subjectType, 'smoke_aqi');
assert.strictEqual(pm25.normalizedPayload.aqi, 168);
assert.strictEqual(pm25.normalizedPayload.category, 'Unhealthy');
assert.strictEqual(pm25.normalizedPayload.pm25, 168);
assert.strictEqual(pm25.normalizedPayload.reportingArea, 'Sacramento-Granite Bay');
assert.strictEqual(pm25.normalizedPayload.stateCode, 'CA');
assert.strictEqual(pm25.normalizedPayload.legalClosureSignal, false);
assert.ok(pm25.knownLimitations.includes('preliminary_air_quality_data'));
assert.ok(pm25.knownLimitations.includes('not_regulatory_data'));
assert.ok(pm25.knownLimitations.includes('not_legal_authority'));
assert.ok(pm25.knownLimitations.includes('not_closure_authority'));
assert.ok(!JSON.stringify(observations).includes('server-only-airnow-key'));

(async () => {
  const registry = new ECS5ProviderAdapterRegistry({ providerRegistry });
  registry.registerAdapter(createAirNowAdapter(airNowProvider));

  const routeResult = await sampleRouteWeatherRisk({
    routeId: 'route-smoke-aqi',
    geometry: [
      { lat: 38.78, lon: -121.2 },
      { lat: 39.0, lon: -121.5 },
    ],
    tripStartTime: '2026-04-29T22:00:00.000Z',
    estimatedRouteDurationMinutes: 120,
    sampleIntervalMiles: 30,
    maxSamplePoints: 2,
    providerPriorityList: ['airnow'],
    fixturePayloadBySample: (_point, index) => index === 0
      ? airNowFixture
      : {
        current: [{
          DateObserved: '2026-04-29',
          HourObserved: 15,
          LocalTimeZone: 'PDT',
          ReportingArea: 'Foothill Smoke Corridor',
          StateCode: 'CA',
          Latitude: 39.0,
          Longitude: -121.5,
          ParameterName: 'PM2.5',
          AQI: 315,
          Category: { Number: 6, Name: 'Hazardous' },
        }],
      },
  }, registry);

  assert.strictEqual(routeResult.segmentRisks[0].smokeAqiRisk, 'high');
  assert.strictEqual(routeResult.segmentRisks[0].crewHealthRisk, 'high');
  assert.strictEqual(routeResult.segmentRisks[0].aqi, 168);
  assert.strictEqual(routeResult.segmentRisks[0].weatherRiskLabel, 'high');
  assert.ok(routeResult.segmentRisks[0].riskReasons.some((reason) => reason.includes('does not imply legal closure')));
  assert.ok(!JSON.stringify(routeResult).includes('legalClosureSignal":true'));
  assert.strictEqual(routeResult.segmentRisks[1].smokeAqiRisk, 'severe');
  assert.strictEqual(routeResult.segmentRisks[1].weatherRiskLabel, 'severe');
  assert.ok(routeResult.segmentRisks[1].riskReasons.some((reason) => reason.includes('bailout reevaluation')));

  const cacheRegistry = new ECS5ProviderAdapterRegistry({ providerRegistry });
  cacheRegistry.registerAdapter(createAirNowAdapter(airNowProvider));
  const input = {
    lat: 38.78,
    lon: -121.2,
    fixturePayload: airNowFixture,
  };
  const fresh = await cacheRegistry.runAdapter('airnow', input, {
    fixtureMode: true,
    now,
  });
  assert.strictEqual(fresh.cacheStatus, 'miss');
  assert.strictEqual(fresh.observations[0].confidenceScore, 88);
  const stale = await cacheRegistry.runAdapter('airnow', input, {
    fixtureMode: true,
    now: new Date(now.getTime() + 3 * 60 * 60 * 1000),
  });
  assert.strictEqual(stale.cacheStatus, 'hit_stale');
  assert.ok(stale.observations[0].confidenceScore < fresh.observations[0].confidenceScore);
  assert.ok(stale.warnings.some((warning) => warning.includes('stale')));

  const source = fs.readFileSync(path.join(process.cwd(), 'lib/airNowAdapter.ts'), 'utf8');
  assert.ok(!source.includes('OPENWEATHER_AIR_POLLUTION'));
  assert.ok(!source.includes('AIRNOW_API_KEY='));

  console.log('AirNow adapter and route smoke/AQI tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
