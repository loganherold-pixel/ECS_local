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
} = loadTypeScriptModule('lib/ecs5ProviderRegistry.ts');
const {
  ECS5ObservationCache,
  ECS5ProviderAdapterRegistry,
  buildProviderCacheKey,
  createDefaultECS5ProviderAdapterRegistry,
  createGenericFixtureProviderAdapter,
  stableContentHash,
} = loadTypeScriptModule('lib/ecs5ObservationPipeline.ts');

const now = new Date('2026-04-29T21:00:00.000Z');
const env = {
  ENABLE_NWS: 'true',
  NWS_USER_AGENT: 'admin@example.com',
  ENABLE_AIRNOW: 'true',
  ENABLE_NASA_FIRMS: 'true',
  NASA_FIRMS_MAP_KEY: 'test-firms-key',
  ENABLE_OPENWEATHER_ROAD_RISK: 'false',
};
const providerRegistry = createECS5ProviderRegistry(env, [], now);

let registry = createDefaultECS5ProviderAdapterRegistry({ providerRegistry });
assert.ok(registry.getAdapter('nws'), 'Default adapter registry should register active providers.');
assert.ok(registry.getAdapter('openweather_road_risk'), 'Disabled providers should still be inspectable.');
assert.ok(registry.listAdapters().length >= 10);

(async () => {
  const fixturePayload = {
    items: [{
      id: 'alert-1',
      sourceType: 'official_api',
      subjectType: 'weather_alert',
      subjectId: 'route-7',
      observedAt: '2026-04-29T20:45:00.000Z',
      publishedAt: '2026-04-29T20:40:00.000Z',
      evidenceUrl: 'https://api.weather.gov/alerts/alert-1',
      headline: 'High wind warning',
      apiKey: 'must-not-survive-normalization',
      geometry: { type: 'Point', coordinates: [-121.2, 38.7] },
      bbox: [-121.3, 38.6, -121.1, 38.8],
    }],
  };

  let result = await registry.runAdapter('nws', {
    fixturePayload,
    lat: 38.7,
    lon: -121.2,
    timeWindow: 'today',
  }, {
    fixtureMode: true,
    now,
    sourceUrl: 'https://api.weather.gov/alerts',
  });

  assert.strictEqual(result.cacheStatus, 'miss');
  assert.strictEqual(result.observations.length, 1);
  const observation = result.observations[0];
  assert.strictEqual(observation.providerId, 'nws');
  assert.strictEqual(observation.sourceName, 'National Weather Service API');
  assert.strictEqual(observation.sourceType, 'official_api');
  assert.strictEqual(observation.subjectType, 'weather_alert');
  assert.strictEqual(observation.subjectId, 'route-7');
  assert.strictEqual(observation.observedAt, '2026-04-29T20:45:00.000Z');
  assert.strictEqual(observation.ingestedAt, now.toISOString());
  assert.ok(observation.rawPayloadRef.startsWith('hash:'));
  assert.ok(observation.contentHash.startsWith('obs_'));
  assert.ok(observation.confidenceScore > 0);
  assert.ok(observation.confidenceBreakdown);
  assert.ok(observation.knownLimitations.length > 0);
  assert.strictEqual(observation.offlineCacheEligible, true);
  assert.ok(!JSON.stringify(observation).includes('must-not-survive-normalization'), 'Normalized payload should not retain API key fields.');

  const repeatedHash = stableContentHash(fixturePayload);
  assert.strictEqual(repeatedHash, stableContentHash(fixturePayload), 'Content hash should be stable for dedupe.');

  result = await registry.runAdapter('nws', {
    fixturePayload,
    lat: 38.7,
    lon: -121.2,
    timeWindow: 'today',
  }, {
    fixtureMode: true,
    now: new Date('2026-04-29T21:05:00.000Z'),
  });
  assert.strictEqual(result.cacheStatus, 'hit_fresh', 'Same provider/query should use fresh cache.');

  const cache = new ECS5ObservationCache();
  const shortTtlProvider = {
    ...getProviderConfig('nws', providerRegistry),
    cacheTtlSeconds: 1,
  };
  registry = new ECS5ProviderAdapterRegistry({ providerRegistry, cache });
  registry.registerAdapter(createGenericFixtureProviderAdapter(shortTtlProvider));
  result = await registry.runAdapter('nws', { fixturePayload, query: 'winds' }, { fixtureMode: true, now });
  assert.strictEqual(result.cacheStatus, 'miss');
  result = await registry.runAdapter('nws', { fixturePayload, query: 'winds' }, {
    fixtureMode: true,
    now: new Date('2026-04-29T21:00:03.000Z'),
  });
  assert.strictEqual(result.cacheStatus, 'hit_stale', 'Expired cache should return stale status, not current.');
  assert.strictEqual(result.stale, true);
  assert.ok(result.warnings.some((warning) => warning.includes('stale')));
  assert.ok(result.observations[0].confidenceScore < observation.confidenceScore, 'Stale cached data should decay confidence.');

  registry = createDefaultECS5ProviderAdapterRegistry({ providerRegistry });
  result = await registry.runAdapter('openweather_road_risk', { fixturePayload }, { fixtureMode: true, now });
  assert.strictEqual(result.cacheStatus, 'disabled');
  assert.strictEqual(result.observations.length, 0);

  result = await registry.runAdapter('airnow', { fixturePayload }, { fixtureMode: true, now });
  assert.strictEqual(result.cacheStatus, 'missing_config');
  assert.strictEqual(result.observations.length, 0);

  const normalizedOnly = await registry.normalizeProviderPayload('nws', fixturePayload, {
    now,
    sourceUrl: 'https://api.weather.gov/alerts',
  });
  assert.strictEqual(normalizedOnly[0].providerId, 'nws');
  assert.ok(normalizedOnly[0].rawPayloadRef.startsWith('hash:'));

  const keyA = buildProviderCacheKey('nws', {
    lat: 38.71234,
    lon: -121.29876,
    bbox: [-121.3, 38.6, -121.1, 38.8],
    timeWindow: 'today',
  });
  const keyB = buildProviderCacheKey('nws', {
    lon: -121.29876,
    lat: 38.71234,
    bbox: [-121.3, 38.6, -121.1, 38.8],
    timeWindow: 'today',
  });
  assert.strictEqual(keyA, keyB, 'Cache key should be deterministic for provider, coordinates, bbox, and time window.');
  assert.ok(keyA.includes('38.7123'));
  assert.ok(keyA.includes('-121.2988'));

  const source = fs.readFileSync(path.join(process.cwd(), 'lib/ecs5ObservationPipeline.ts'), 'utf8');
  assert.ok(!source.includes('globalThis.fetch'), 'Observation pipeline must not make live calls in CI.');
  assert.ok(!source.includes('await fetch'), 'Observation pipeline must not make live calls in CI.');

  console.log('ECS 5.0 observation pipeline tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
