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
  ECS5_ACTIVE_PROVIDER_IDS,
  ECS5_INTENTIONALLY_DISABLED_PROVIDER_IDS,
  assertProviderConfigured,
  createECS5ProviderRegistry,
  getProviderConfig,
  getProviderHealth,
  isProviderEnabled,
  isProviderIntentionallyDisabled,
  listProviderHealth,
  providerHealthSnapshotForAdmin,
} = loadTypeScriptModule('lib/ecs5ProviderRegistry.ts');

const now = new Date('2026-04-29T20:00:00.000Z');

function status(providerId, env, runtime = []) {
  const registry = createECS5ProviderRegistry(env, runtime, now);
  return getProviderHealth(providerId, registry).status;
}

let env = {
  ENABLE_OPENWEATHER: 'true',
  ENABLE_OPENWEATHER_ONECALL: 'true',
  OPENWEATHER_API_KEY: 'test-openweather-secret-key',
};
let registry = createECS5ProviderRegistry(env, [], now);
assert.strictEqual(getProviderConfig('openweather_onecall', registry).status, 'configured');
assert.strictEqual(isProviderEnabled('openweather_onecall', registry), true);
assert.doesNotThrow(() => assertProviderConfigured('openweather_onecall', registry));

env = {
  ENABLE_NWS: 'true',
  NWS_USER_AGENT: 'admin@example.com',
};
assert.strictEqual(status('nws', env), 'configured', 'NWS should configure with a User-Agent.');

env = { ENABLE_AIRNOW: 'true' };
assert.strictEqual(status('airnow', env), 'missing_config', 'AirNow enabled without key should be missing_config.');

env = { ENABLE_NASA_FIRMS: 'true' };
assert.strictEqual(status('nasa_firms', env), 'missing_config', 'NASA FIRMS enabled without MAP_KEY should be missing_config.');

env = { ENABLE_NPS: 'true' };
assert.strictEqual(status('nps', env), 'missing_config', 'NPS enabled without API key should be missing_config.');

env = {
  ENABLE_OPENWEATHER_ROAD_RISK: 'false',
  ENABLE_OPENWEATHER_AIR_POLLUTION: 'false',
  ENABLE_OPENWEATHER_FIRE_INDEX: 'false',
};
registry = createECS5ProviderRegistry(env, [], now);
assert.strictEqual(getProviderHealth('openweather_road_risk', registry).status, 'intentionally_disabled');
assert.strictEqual(getProviderHealth('openweather_air_pollution', registry).status, 'intentionally_disabled');
assert.strictEqual(getProviderHealth('openweather_fire_index', registry).status, 'intentionally_disabled');
assert.strictEqual(isProviderIntentionallyDisabled('openweather_fire_index', registry), true);

assert.doesNotThrow(
  () => listProviderHealth(registry),
  'Disabled OpenWeather add-ons must not fail startup health inspection.',
);

registry = createECS5ProviderRegistry({
  ENABLE_NWS: 'true',
  NWS_USER_AGENT: 'admin@example.com',
}, [{
  providerId: 'nws',
  lastSuccessfulFetchAt: '2026-04-29T15:00:00.000Z',
}], now);
assert.strictEqual(getProviderHealth('nws', registry).status, 'stale');

registry = createECS5ProviderRegistry({
  ENABLE_NWS: 'true',
  NWS_USER_AGENT: 'admin@example.com',
}, [{
  providerId: 'nws',
  lastCheckedAt: '2026-04-29T19:55:00.000Z',
  lastSuccessfulFetchAt: '2026-04-29T19:50:00.000Z',
  lastError: 'HTTP 429 token abcdefghijklmnopqrstuvwxyz123456',
}], now);
assert.strictEqual(getProviderHealth('nws', registry).status, 'degraded');
assert.ok(!JSON.stringify(providerHealthSnapshotForAdmin(registry)).includes('abcdefghijklmnopqrstuvwxyz123456'));
assert.ok(JSON.stringify(providerHealthSnapshotForAdmin(registry)).includes('[redacted]'));

registry = createECS5ProviderRegistry({
  ENABLE_COUNTY_EMERGENCY_FEEDS: 'true',
  COUNTY_EMERGENCY_PROVIDER: 'County Test',
  COUNTY_EMERGENCY_BASE_URL: 'https://example.invalid/feed',
}, [{
  providerId: 'county_emergency',
  unavailable: true,
}], now);
assert.strictEqual(getProviderHealth('county_emergency', registry).status, 'unavailable');

const healthJson = JSON.stringify(createECS5ProviderRegistry({
  ENABLE_OPENWEATHER: 'true',
  ENABLE_OPENWEATHER_ONECALL: 'true',
  OPENWEATHER_API_KEY: 'super-secret-openweather-key',
  ENABLE_AIRNOW: 'true',
  AIRNOW_API_KEY: 'super-secret-airnow-key',
}, [], now));
assert.ok(!healthJson.includes('super-secret-openweather-key'), 'Provider registry must not expose OpenWeather secrets.');
assert.ok(!healthJson.includes('super-secret-airnow-key'), 'Provider registry must not expose AirNow secrets.');

assert.ok(ECS5_ACTIVE_PROVIDER_IDS.includes('manual_agency_ingestion'));
assert.deepStrictEqual(ECS5_INTENTIONALLY_DISABLED_PROVIDER_IDS, [
  'openweather_road_risk',
  'openweather_air_pollution',
  'openweather_fire_index',
]);

const envExample = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
assert.ok(envExample.includes('OPENWEATHER_API_KEY=your-openweather-api-key'));
assert.ok(envExample.includes('ENABLE_OPENWEATHER_ROAD_RISK=false'));
assert.ok(envExample.includes('NWS_USER_AGENT=admin@example.com'));
assert.ok(!envExample.includes('dee2fb0f84208f6869cc72612ead94eb'), 'Do not commit live-looking OpenWeather keys in .env.example.');
assert.ok(!envExample.includes('8D2701CD-F06F-49B8-ADAC-2698C6F72663'), 'Do not commit live-looking AirNow keys in .env.example.');
assert.ok(!envExample.includes('ea7b025a75e0f3ec4b2807e10480ba47'), 'Do not commit live-looking FIRMS keys in .env.example.');

const source = fs.readFileSync(path.join(process.cwd(), 'lib/ecs5ProviderRegistry.ts'), 'utf8');
assert.ok(!source.includes('fetch('), 'Provider health checks must not make live calls in CI.');

console.log('ECS 5.0 provider registry tests passed.');
