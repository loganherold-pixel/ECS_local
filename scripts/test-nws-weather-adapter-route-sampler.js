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
  createOpenWeatherOneCallAdapter,
} = loadTypeScriptModule('lib/openWeatherOneCallAdapter.ts');
const {
  buildNwsPointAlertsUrl,
  buildNwsPointsUrl,
  createNwsWeatherAdapter,
  extractNwsEndpointRefs,
  normalizeNwsWeatherPayload,
  NWS_WEATHER_KNOWN_LIMITATIONS,
} = loadTypeScriptModule('lib/nwsWeatherAdapter.ts');
const {
  sampleRouteWeatherRisk,
} = loadTypeScriptModule('lib/ecs5RouteWeatherSampler.ts');

const now = new Date('2026-04-29T22:00:00.000Z');
const providerRegistry = createECS5ProviderRegistry({
  ENABLE_NWS: 'true',
  NWS_USER_AGENT: 'ecs-tests@example.com',
  ENABLE_OPENWEATHER: 'true',
  ENABLE_OPENWEATHER_ONECALL: 'true',
  OPENWEATHER_API_KEY: 'server-only-key',
}, [], now);
const nwsProvider = getProviderConfig('nws', providerRegistry);
const openWeatherProvider = getProviderConfig('openweather_onecall', providerRegistry);
assert.strictEqual(getProviderHealth('nws', providerRegistry).status, 'configured', 'NWS should configure with User-Agent.');
assert.strictEqual(getProviderHealth('nws', createECS5ProviderRegistry({ ENABLE_NWS: 'true' }, [], now)).status, 'missing_config');
assert.deepStrictEqual([...NWS_WEATHER_KNOWN_LIMITATIONS], [
  'us_only_or_us_territories',
  'weather_only',
  'not_legal_access_authority',
  'not_closure_authority',
]);
assert.strictEqual(buildNwsPointsUrl(38.78123, -121.20761), 'https://api.weather.gov/points/38.7812,-121.2076');
assert.strictEqual(buildNwsPointAlertsUrl(38.78123, -121.20761), 'https://api.weather.gov/alerts/active?point=38.7812,-121.2076');

const pointsFixture = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-121.2, 38.78] },
  bbox: [-121.25, 38.73, -121.15, 38.83],
  properties: {
    gridId: 'STO',
    gridX: 44,
    gridY: 78,
    forecast: 'https://api.weather.gov/gridpoints/STO/44,78/forecast',
    forecastHourly: 'https://api.weather.gov/gridpoints/STO/44,78/forecast/hourly',
    forecastZone: 'https://api.weather.gov/zones/forecast/CAZ069',
    county: 'https://api.weather.gov/zones/county/CAC061',
    fireWeatherZone: 'https://api.weather.gov/zones/fire/CAZ269',
  },
};
assert.deepStrictEqual(extractNwsEndpointRefs(pointsFixture, 38.78, -121.2), {
  forecast: 'https://api.weather.gov/gridpoints/STO/44,78/forecast',
  forecastHourly: 'https://api.weather.gov/gridpoints/STO/44,78/forecast/hourly',
  alerts: 'https://api.weather.gov/alerts/active?point=38.78,-121.2',
});

const forecastFixture = {
  properties: {
    generatedAt: '2026-04-29T21:45:00+00:00',
    expires: '2026-04-30T01:45:00+00:00',
    periods: [{
      name: 'This Afternoon',
      startTime: '2026-04-29T22:00:00+00:00',
      endTime: '2026-04-30T00:00:00+00:00',
      temperature: 78,
      temperatureUnit: 'F',
      windSpeed: '5 to 10 mph',
      shortForecast: 'Sunny',
      detailedForecast: 'Sunny and dry.',
      probabilityOfPrecipitation: { value: 5 },
    }],
  },
};
const severeAlertFixture = {
  type: 'FeatureCollection',
  features: [{
    id: 'urn:oid:severe-thunderstorm',
    geometry: {
      type: 'Polygon',
      coordinates: [[[-121.3, 38.7], [-121.1, 38.7], [-121.1, 38.9], [-121.3, 38.9], [-121.3, 38.7]]],
    },
    bbox: [-121.3, 38.7, -121.1, 38.9],
    properties: {
      id: 'urn:oid:severe-thunderstorm',
      '@id': 'https://api.weather.gov/alerts/urn:oid:severe-thunderstorm',
      event: 'Severe Thunderstorm Warning',
      headline: 'Severe Thunderstorm Warning issued by NWS Sacramento',
      severity: 'Severe',
      certainty: 'Likely',
      urgency: 'Immediate',
      onset: '2026-04-29T22:10:00+00:00',
      effective: '2026-04-29T22:00:00+00:00',
      expires: '2026-04-29T23:00:00+00:00',
      sent: '2026-04-29T21:58:00+00:00',
      instruction: 'Move to a sturdy shelter.',
      description: 'Severe thunderstorm with damaging wind and lightning.',
    },
  }],
};
const redFlagAlertFixture = {
  type: 'FeatureCollection',
  features: [{
    geometry: { type: 'Polygon', coordinates: [[[-121.6, 38.9], [-121.4, 38.9], [-121.4, 39.1], [-121.6, 39.1], [-121.6, 38.9]]] },
    properties: {
      id: 'urn:oid:red-flag',
      '@id': 'https://api.weather.gov/alerts/urn:oid:red-flag',
      event: 'Red Flag Warning',
      headline: 'Red Flag Warning issued by NWS Sacramento',
      severity: 'Severe',
      certainty: 'Likely',
      urgency: 'Expected',
      onset: '2026-04-30T00:00:00+00:00',
      expires: '2026-04-30T08:00:00+00:00',
      sent: '2026-04-29T21:00:00+00:00',
      instruction: 'Use caution with open flame and equipment.',
      description: 'Critical fire weather conditions from gusty wind and low humidity.',
    },
  }],
};

let observations = normalizeNwsWeatherPayload({
  points: pointsFixture,
  forecast: forecastFixture,
  forecastHourly: forecastFixture,
  alerts: severeAlertFixture,
}, nwsProvider, { now });
const forecast = observations.find((observation) => observation.subjectType === 'weather_forecast');
const alert = observations.find((observation) => observation.subjectType === 'weather_alert');
assert.ok(forecast, 'NWS forecast should normalize.');
assert.strictEqual(forecast.sourceType, 'federal_agency');
assert.strictEqual(forecast.normalizedPayload.sourceEndpoints.forecast, pointsFixture.properties.forecast);
assert.strictEqual(alert.normalizedPayload.event, 'Severe Thunderstorm Warning');
assert.strictEqual(alert.normalizedPayload.headline, 'Severe Thunderstorm Warning issued by NWS Sacramento');
assert.strictEqual(alert.normalizedPayload.severity, 'Severe');
assert.strictEqual(alert.normalizedPayload.certainty, 'Likely');
assert.strictEqual(alert.normalizedPayload.urgency, 'Immediate');
assert.strictEqual(alert.normalizedPayload.instruction, 'Move to a sturdy shelter.');
assert.strictEqual(alert.geometry.type, 'Polygon');
assert.strictEqual(alert.expiresAt, '2026-04-29T23:00:00.000Z');
assert.strictEqual(alert.normalizedPayload.legalClosureSignal, false);
assert.ok(alert.confidenceScore > 90, 'NWS alert should carry higher official alert confidence than OpenWeather-delivered alerts.');

(async () => {
  const captured = [];
  const adapter = createNwsWeatherAdapter(nwsProvider);
  await adapter.fetch({ lat: 38.78, lon: -121.2 }, {
    serverFetch: async ({ url, headers }) => {
      captured.push({ url, headers });
      if (url.includes('/points/')) return pointsFixture;
      if (url.endsWith('/forecast/hourly')) return forecastFixture;
      if (url.endsWith('/forecast')) return forecastFixture;
      if (url.includes('/alerts/active')) return severeAlertFixture;
      throw new Error(`Unexpected URL ${url}`);
    },
  });
  assert.ok(captured.length >= 4, 'NWS live fetch should use points, forecast, hourly, and alerts endpoints.');
  assert.ok(captured.every((request) => request.headers['User-Agent'] === '{{NWS_USER_AGENT}}'));

  const registry = new ECS5ProviderAdapterRegistry({ providerRegistry });
  registry.registerAdapter(createNwsWeatherAdapter(nwsProvider));
  registry.registerAdapter(createOpenWeatherOneCallAdapter(openWeatherProvider));
  const geometry = [
    { lat: 38.78, lon: -121.2 },
    { lat: 39.0, lon: -121.5 },
  ];
  const routeResult = await sampleRouteWeatherRisk({
    routeId: 'route-nws-alerts',
    geometry,
    tripStartTime: '2026-04-29T22:00:00.000Z',
    estimatedRouteDurationMinutes: 120,
    sampleIntervalMiles: 30,
    maxSamplePoints: 2,
    providerPriorityList: ['nws', 'openweather_onecall'],
    fixturePayloadBySample: (_point, index, providerId) => {
      if (providerId === 'nws') {
        return {
          points: pointsFixture,
          forecast: forecastFixture,
          forecastHourly: forecastFixture,
          alerts: index === 0 ? severeAlertFixture : redFlagAlertFixture,
        };
      }
      return {
        lat: 38.78,
        lon: -121.2,
        current: { dt: 1777500000, temp: 72, humidity: 45, wind_speed: 6, weather: [{ main: 'Clear', description: 'clear' }] },
        hourly: [],
        daily: [],
        alerts: [],
      };
    },
  }, registry);
  assert.strictEqual(routeResult.segmentRisks[0].thunderstormRisk, 'high');
  assert.ok(routeResult.segmentRisks[0].weatherRiskLabel === 'high' || routeResult.segmentRisks[0].weatherRiskLabel === 'severe');
  assert.ok(routeResult.segmentRisks[0].riskReasons.some((reason) => reason.includes('Severe convective weather alert')));
  assert.strictEqual(routeResult.segmentRisks[1].fireWeatherContextFromForecast, 'critical');
  assert.ok(routeResult.segmentRisks[1].riskReasons.some((reason) => reason.includes('not an active fire status')));
  assert.ok(!JSON.stringify(routeResult).includes('active_fire'));

  const fallbackRegistry = new ECS5ProviderAdapterRegistry({ providerRegistry });
  fallbackRegistry.registerAdapter(createNwsWeatherAdapter(nwsProvider));
  fallbackRegistry.registerAdapter(createOpenWeatherOneCallAdapter(openWeatherProvider));
  const fallbackResult = await sampleRouteWeatherRisk({
    routeId: 'route-nws-fallback',
    geometry: geometry.slice(0, 1),
    tripStartTime: '2026-04-29T22:00:00.000Z',
    estimatedRouteDurationMinutes: 30,
    sampleIntervalMiles: 50,
    maxSamplePoints: 1,
    providerPriorityList: ['nws', 'openweather_onecall'],
    fixturePayloadBySample: (_point, _index, providerId) => providerId === 'openweather_onecall'
      ? {
        lat: 38.78,
        lon: -121.2,
        current: { dt: 1777500000, temp: 70, humidity: 50, wind_speed: 4, weather: [{ main: 'Clear', description: 'clear' }] },
        hourly: [],
        daily: [],
        alerts: [],
      }
      : undefined,
  }, fallbackRegistry);
  assert.notStrictEqual(fallbackResult.segmentRisks[0].weatherRiskLabel, 'unknown', 'NWS unavailable should fall back to OpenWeather when available.');
  assert.ok(fallbackResult.providerWarnings.some((warning) => warning.includes('NWS live fetch requires serverFetch')));

  const source = fs.readFileSync(path.join(process.cwd(), 'lib/nwsWeatherAdapter.ts'), 'utf8');
  assert.ok(!source.includes('road_surface_temperature'));
  assert.ok(!source.includes('black_ice_certainty'));
  assert.ok(!source.includes('NWS_USER_AGENT='), 'NWS adapter should not assign env values in source.');

  console.log('NWS weather adapter and route sampler tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
