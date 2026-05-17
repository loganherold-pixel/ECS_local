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

const root = path.resolve(__dirname, '..');
const componentPath = path.join(root, 'components', 'admin', 'ECS5RouteIntelligenceDebugPanel.tsx');
const moreTabPath = path.join(root, 'app', '(tabs)', 'more.tsx');
const packagePath = path.join(root, 'package.json');

const component = fs.readFileSync(componentPath, 'utf8');
const moreTab = fs.readFileSync(moreTabPath, 'utf8');
const pkg = fs.readFileSync(packagePath, 'utf8');

for (const fragment of [
  'ECS 5.0 Intelligence Debug',
  'Provider Health',
  'Ingestion Runs',
  'Observation Inspector',
  'Route Intelligence Debug',
  'Secret values are never rendered',
  'requiredEnvVars',
  'not required while intentionally disabled',
  'No verified closure found',
  'Likely passable',
  'Official closure detected',
  'Verify with managing agency',
  'Preliminary data',
  'Satellite detection',
  'Cached / Offline',
  'Raw payload ref/content hash',
  'Confidence breakdown',
  'Known limitations',
  'Conflicts:',
  'Duplicate',
  'Stale count',
  'Changed',
  'Evidence:',
]) {
  assert.ok(component.includes(fragment), `Admin debug panel should include ${fragment}.`);
}

for (const forbidden of [
  'OPENWEATHER_API_KEY=',
  'AIRNOW_API_KEY=',
  'NASA_FIRMS_MAP_KEY=',
  'NPS_API_KEY=',
  'safe route',
  'safe to travel',
]) {
  assert.ok(!component.includes(forbidden), `Admin debug panel should not expose or imply ${forbidden}.`);
}

assert.ok(moreTab.includes('ECS5RouteIntelligenceDebugPanel'), 'More tab should import ECS 5.0 debug panel.');
assert.ok(moreTab.includes("'ecs5-debug'"), 'More tab should register ecs5-debug subtab.');
assert.ok(moreTab.includes('ECS 5.0 Debug'), 'More tab should label the admin debug tab.');
assert.ok(moreTab.includes('<ECS5RouteIntelligenceDebugPanel colors={colors} />'), 'More tab should render admin debug panel behind admin access.');
assert.ok(pkg.includes('test:ecs5-admin-debug-ui'), 'Package scripts should expose admin debug UI regression test.');

const {
  createECS5ProviderRegistry,
  providerHealthSnapshotForAdmin,
} = loadTypeScriptModule('lib/ecs5ProviderRegistry.ts');

const registry = createECS5ProviderRegistry({
  ENABLE_OPENWEATHER_ONECALL: 'true',
  OPENWEATHER_API_KEY: 'real-looking-secret-value-that-must-not-render',
  ENABLE_AIRNOW: 'true',
}, [], new Date('2026-04-29T18:00:00.000Z'));
const providers = providerHealthSnapshotForAdmin(registry);
const roadRisk = providers.find((provider) => provider.id === 'openweather_road_risk');
const airPollution = providers.find((provider) => provider.id === 'openweather_air_pollution');
const fireIndex = providers.find((provider) => provider.id === 'openweather_fire_index');
const airNow = providers.find((provider) => provider.id === 'airnow');
const openWeather = providers.find((provider) => provider.id === 'openweather_onecall');

assert.strictEqual(roadRisk.status, 'intentionally_disabled');
assert.strictEqual(airPollution.status, 'intentionally_disabled');
assert.strictEqual(fireIndex.status, 'intentionally_disabled');
assert.strictEqual(openWeather.status, 'configured');
assert.strictEqual(airNow.status, 'missing_config');
assert.ok(JSON.stringify(providers).includes('OPENWEATHER_API_KEY'), 'Provider snapshot may include env var names.');
assert.ok(!JSON.stringify(providers).includes('real-looking-secret-value-that-must-not-render'), 'Provider snapshot must not expose secret values.');

console.log('ECS 5.0 admin debug UI tests passed.');
