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
assert.strictEqual(getProviderConfig('nws', createECS5ProviderRegistry(env, [], now)).requiresApiKey, false);

const legacyUserAgentName = ['AWS', 'USER', 'AGENT'].join('_');
env = {
  ENABLE_NWS: 'true',
  [legacyUserAgentName]: 'admin@example.com',
};
registry = createECS5ProviderRegistry(env, [], now);
assert.strictEqual(getProviderHealth('nws', registry).status, 'missing_config', 'NWS should not be configured from the AWS-prefixed legacy user-agent name.');
assert.throws(
  () => assertProviderConfigured('nws', registry),
  (error) => error.message.includes('National Weather Service API is missing_config') &&
    !error.message.includes(legacyUserAgentName),
  'NWS startup failures must not mention the AWS-prefixed legacy user-agent name.',
);

env = { ENABLE_AIRNOW: 'true' };
assert.strictEqual(status('airnow', env), 'missing_config', 'AirNow enabled without key should be missing_config.');
assert.strictEqual(status('airnow', {}), 'intentionally_disabled', 'AirNow should not require a key when AIRNOW_ENABLED is unset.');
assert.strictEqual(status('airnow', { AIRNOW_ENABLED: 'false', AIRNOW_API_KEY: 'server-only-airnow-key' }), 'intentionally_disabled', 'AirNow should not require or activate a key when AIRNOW_ENABLED=false.');
assert.strictEqual(status('airnow', { AIRNOW_ENABLED: 'true' }), 'missing_config', 'AirNow should require AIRNOW_API_KEY only when AIRNOW_ENABLED=true.');
assert.strictEqual(status('airnow', { AIRNOW_ENABLED: 'true', AIRNOW_API_KEY: 'server-only-airnow-key' }), 'configured', 'AirNow should configure from runtime secret env when AIRNOW_ENABLED=true.');
registry = createECS5ProviderRegistry({ AIRNOW_ENABLED: 'true' }, [], now);
assert.throws(
  () => assertProviderConfigured('airnow', registry),
  (error) => error.message.includes('AIRNOW_API_KEY') && !error.message.includes('NPS_API_KEY'),
  'AirNow missing configuration should name AIRNOW_API_KEY exactly.',
);

assert.strictEqual(status('nasa_firms', {}), 'intentionally_disabled', 'NASA FIRMS should not require a key when NASA_FIRMS_ENABLED is unset.');
assert.strictEqual(status('nasa_firms', { NASA_FIRMS_ENABLED: 'false', NASA_FIRMS_API_KEY: 'server-only-firms-key' }), 'intentionally_disabled', 'NASA FIRMS should not require or activate a key when NASA_FIRMS_ENABLED=false.');
assert.strictEqual(status('nasa_firms', { NASA_FIRMS_ENABLED: 'true' }), 'missing_config', 'NASA FIRMS should require NASA_FIRMS_API_KEY only when NASA_FIRMS_ENABLED=true.');
assert.strictEqual(status('nasa_firms', { NASA_FIRMS_ENABLED: 'true', NASA_FIRMS_API_KEY: 'server-only-firms-key' }), 'configured', 'NASA FIRMS should configure from runtime secret env when NASA_FIRMS_ENABLED=true.');
assert.strictEqual(status('nasa_firms', { ENABLE_NASA_FIRMS: 'true', NASA_FIRMS_API_KEY: 'server-only-firms-key' }), 'configured', 'Legacy ENABLE_NASA_FIRMS should remain a deprecated enable alias.');
registry = createECS5ProviderRegistry({ NASA_FIRMS_ENABLED: 'true' }, [], now);
assert.throws(
  () => assertProviderConfigured('nasa_firms', registry),
  (error) => error.message.includes('Missing required NASA FIRMS configuration: NASA_FIRMS_API_KEY'),
  'NASA FIRMS missing configuration should name NASA_FIRMS_API_KEY exactly.',
);

env = { ENABLE_NPS: 'true' };
assert.strictEqual(status('nps', env), 'missing_config', 'NPS enabled without API key should be missing_config.');
assert.strictEqual(status('nps', {}), 'intentionally_disabled', 'NPS should not require a key when NPS_ENABLED is unset.');
assert.strictEqual(status('nps', { NPS_ENABLED: 'false', NPS_API_KEY: 'server-only-nps-key' }), 'intentionally_disabled', 'NPS should not require or activate a key when NPS_ENABLED=false.');
assert.strictEqual(status('nps', { NPS_ENABLED: 'true' }), 'missing_config', 'NPS should require NPS_API_KEY only when NPS_ENABLED=true.');
assert.strictEqual(status('nps', { NPS_ENABLED: 'true', NPS_API_KEY: 'server-only-nps-key' }), 'configured', 'NPS should configure from runtime secret env when NPS_ENABLED=true.');
registry = createECS5ProviderRegistry({ NPS_ENABLED: 'true' }, [], now);
assert.throws(
  () => assertProviderConfigured('nps', registry),
  (error) => error.message.includes('NPS_API_KEY') && !error.message.includes('AIRNOW_API_KEY'),
  'NPS missing configuration should name NPS_API_KEY exactly.',
);

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
  AIRNOW_ENABLED: 'true',
  AIRNOW_API_KEY: 'super-secret-airnow-key',
  NPS_ENABLED: 'true',
  NPS_API_KEY: 'super-secret-nps-key',
}, [], now));
assert.ok(!healthJson.includes('super-secret-openweather-key'), 'Provider registry must not expose OpenWeather secrets.');
assert.ok(!healthJson.includes('super-secret-airnow-key'), 'Provider registry must not expose AirNow secrets.');
assert.ok(!healthJson.includes('super-secret-nps-key'), 'Provider registry must not expose NPS secrets.');

assert.ok(ECS5_ACTIVE_PROVIDER_IDS.includes('manual_agency_ingestion'));
assert.deepStrictEqual(ECS5_INTENTIONALLY_DISABLED_PROVIDER_IDS, [
  'openweather_road_risk',
  'openweather_air_pollution',
  'openweather_fire_index',
]);

const envExample = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
assert.ok(envExample.includes('OPENWEATHER_API_KEY=your-openweather-api-key'));
assert.ok(envExample.includes('ENABLE_OPENWEATHER_ROAD_RISK=false'));
assert.ok(envExample.includes('NWS_API_BASE_URL=https://api.weather.gov'));
assert.ok(envExample.includes('NWS_USER_AGENT=ECS/1.0.0 (admin@example.com)'));
assert.ok(envExample.includes('NWS_ACCEPT=application/geo+json'));
assert.ok(envExample.includes('AIRNOW_ENABLED=true'));
assert.ok(envExample.includes('AIRNOW_API_BASE_URL=https://www.airnowapi.org/aq'));
assert.ok(envExample.includes('NASA_FIRMS_ENABLED=true'));
assert.ok(envExample.includes('NASA_FIRMS_API_KEY='));
assert.ok(envExample.includes('NASA_FIRMS_API_BASE_URL=https://firms.modaps.eosdis.nasa.gov'));
assert.ok(envExample.includes('NASA_FIRMS_DEFAULT_SOURCE=VIIRS_SNPP_NRT'));
assert.ok(envExample.includes('NASA_FIRMS_DEFAULT_DAY_RANGE=1'));
assert.ok(envExample.includes('NPS_ENABLED=true'));
assert.ok(envExample.includes('NPS_API_BASE_URL=https://developer.nps.gov/api/v1'));
assert.ok(!/^AIRNOW_API_KEY=/m.test(envExample), 'AirNow API key must not be listed as a normal env assignment in .env.example.');
assert.ok(!/^NPS_API_KEY=/m.test(envExample), 'NPS API key must not be listed as a normal env assignment in .env.example.');
assert.ok(!envExample.includes('dee2fb0f84208f6869cc72612ead94eb'), 'Do not commit live-looking OpenWeather keys in .env.example.');
assert.ok(!envExample.includes('8D2701CD-F06F-49B8-ADAC-2698C6F72663'), 'Do not commit live-looking AirNow keys in .env.example.');
assert.ok(!envExample.includes('ea7b025a75e0f3ec4b2807e10480ba47'), 'Do not commit live-looking FIRMS keys in .env.example.');

const dockerCompose = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
assert.ok(dockerCompose.includes('NWS_API_BASE_URL: ${NWS_API_BASE_URL:-https://api.weather.gov}'));
assert.ok(dockerCompose.includes('NWS_USER_AGENT: ${NWS_USER_AGENT:-ECS/1.0.0 (admin@example.com)}'));
assert.ok(dockerCompose.includes('NWS_ACCEPT: ${NWS_ACCEPT:-application/geo+json}'));

const ecsTaskDefinitionPath = path.join(process.cwd(), 'infra', 'ecs', 'ecs5-task-definition.json');
assert.ok(fs.existsSync(ecsTaskDefinitionPath), 'ECS task definition source of truth should exist.');
const ecsTaskDefinition = JSON.parse(fs.readFileSync(ecsTaskDefinitionPath, 'utf8'));
const ecsContainer = ecsTaskDefinition.containerDefinitions?.[0];
assert.ok(ecsContainer, 'ECS task definition should include a container definition.');
const ecsEnv = new Map((ecsContainer.environment ?? []).map((entry) => [entry.name, entry.value]));
const ecsSecrets = new Map((ecsContainer.secrets ?? []).map((entry) => [entry.name, entry.valueFrom]));
assert.strictEqual(ecsEnv.get('AIRNOW_ENABLED'), 'true');
assert.strictEqual(ecsEnv.get('NPS_ENABLED'), 'true');
assert.strictEqual(ecsEnv.get('AIRNOW_API_BASE_URL'), 'https://www.airnowapi.org/aq');
assert.strictEqual(ecsEnv.get('NPS_API_BASE_URL'), 'https://developer.nps.gov/api/v1');
assert.ok(ecsSecrets.has('AIRNOW_API_KEY'), 'ECS task definition should inject AIRNOW_API_KEY through secrets.');
assert.ok(ecsSecrets.has('NPS_API_KEY'), 'ECS task definition should inject NPS_API_KEY through secrets.');
assert.ok(/arn:aws:(secretsmanager|ssm):/.test(String(ecsSecrets.get('AIRNOW_API_KEY'))), 'AIRNOW_API_KEY should come from Secrets Manager or SSM.');
assert.ok(/arn:aws:(secretsmanager|ssm):/.test(String(ecsSecrets.get('NPS_API_KEY'))), 'NPS_API_KEY should come from Secrets Manager or SSM.');
assert.ok(!(ecsContainer.environment ?? []).some((entry) => entry.name === 'AIRNOW_API_KEY' || entry.name === 'NPS_API_KEY'), 'AirNow/NPS API keys must not be plain ECS environment variables.');

const source = fs.readFileSync(path.join(process.cwd(), 'lib/ecs5ProviderRegistry.ts'), 'utf8');
assert.ok(!source.includes('fetch('), 'Provider health checks must not make live calls in CI.');

console.log('ECS 5.0 provider registry tests passed.');
