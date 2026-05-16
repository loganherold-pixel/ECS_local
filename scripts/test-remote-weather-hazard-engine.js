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

const enginePath = path.join(process.cwd(), 'lib/remote/remoteWeatherHazardEngine.ts');
const engineSource = fs.readFileSync(enginePath, 'utf8');
const { assessRemoteWeatherHazard } = loadTypeScriptModule('lib/remote/remoteWeatherHazardEngine.ts');

const baseInput = {
  routeId: 'route-1',
  segmentId: 'segment-1',
  remotenessScore: 25,
  routeConfidence: 85,
  weatherRisk: 0.1,
  windMph: 8,
  precipProb: 0.1,
  tempF: 72,
  smokeRisk: 0.1,
  fireRisk: 0.1,
  signalLossMiles: 0,
  cacheReady: true,
  powerHours: 12,
  distanceAheadMi: 4,
  etaMinutes: 18,
};

function assess(overrides) {
  return assessRemoteWeatherHazard({ ...baseInput, ...overrides });
}

assert.ok(!engineSource.includes('fetch('), 'Remote weather hazard engine must not call network fetch.');
assert.ok(!engineSource.includes('await '), 'Remote weather hazard engine must not use async/await.');
assert.ok(!engineSource.includes('useState') && !engineSource.includes('react'), 'Remote weather hazard engine must not depend on UI/React.');
assert.ok(
  engineSource.includes("import type {\n  ECSBriefSeverity,\n  RemoteWeatherHazardType,") ||
    engineSource.includes('RemoteWeatherHazardType'),
  'Remote weather hazard engine must use ECS Brief remote hazard types.',
);

assert.deepStrictEqual(assess({}), {
  shouldEmit: false,
  severity: 'info',
  type: 'remote_weather_exposure',
  title: 'Remote hazard watch clear',
  message: 'No predictive remote weather hazard crossed the advisory threshold.',
  recommendedAction: 'Continue monitoring remoteness, weather, signal, cache, and power readiness.',
  confidence: 0.6,
});

let output = assess({ remotenessScore: 70, weatherRisk: 0.6 });
assert.strictEqual(output.shouldEmit, true);
assert.strictEqual(output.severity, 'warning');
assert.strictEqual(output.type, 'remote_weather_exposure');
assert.ok(output.message.includes('70'), 'Weather exposure message should explain remoteness evidence.');
assert.ok(output.recommendedAction.includes('forecast'), 'Weather exposure action should be actionable.');

output = assess({ remotenessScore: 85, weatherRisk: 0.75 });
assert.strictEqual(output.severity, 'critical');
assert.strictEqual(output.type, 'remote_weather_exposure');

output = assess({ remotenessScore: 65, signalLossMiles: 10 });
assert.strictEqual(output.severity, 'watch');
assert.strictEqual(output.type, 'remote_signal_loss');

output = assess({ remotenessScore: 66, signalLossMiles: 25, weatherRisk: 0.5 });
assert.strictEqual(output.severity, 'warning');
assert.strictEqual(output.type, 'remote_signal_loss');

output = assess({ remotenessScore: 60, cacheReady: false });
assert.strictEqual(output.severity, 'warning');
assert.strictEqual(output.type, 'offline_readiness_gap');
assert.ok(output.message.includes('Offline cache'), 'Offline readiness output should explain cache readiness.');

output = assess({ remotenessScore: 65, windMph: 35 });
assert.strictEqual(output.severity, 'warning');
assert.strictEqual(output.type, 'remote_wind_exposure');

output = assess({ remotenessScore: 60, tempF: 100 });
assert.strictEqual(output.severity, 'warning');
assert.strictEqual(output.type, 'remote_heat_risk');

output = assess({ remotenessScore: 60, tempF: 20 });
assert.strictEqual(output.severity, 'warning');
assert.strictEqual(output.type, 'remote_snow_ice');

output = assess({ remotenessScore: 60, smokeRisk: 0.6 });
assert.strictEqual(output.severity, 'warning');
assert.strictEqual(output.type, 'remote_fire_smoke');

output = assess({ remotenessScore: 60, fireRisk: 0.7 });
assert.strictEqual(output.severity, 'critical');
assert.strictEqual(output.type, 'remote_fire_smoke');
assert.ok(output.recommendedAction.includes('Do not enter'), 'Critical fire output should be conservative.');

output = assess({ remotenessScore: 65, routeConfidence: 44 });
assert.strictEqual(output.severity, 'warning');
assert.strictEqual(output.type, 'remote_bailout_gap');
assert.ok(output.message.includes('44%'), 'Low route confidence output should explain confidence evidence.');

output = assess({
  remotenessScore: 90,
  weatherRisk: 0.8,
  signalLossMiles: 25,
  routeConfidence: 30,
  cacheReady: false,
});
assert.strictEqual(output.severity, 'critical', 'Highest severity must win when multiple rules apply.');
assert.strictEqual(output.type, 'remote_weather_exposure');

for (const scenario of [
  assess({ remotenessScore: 85, weatherRisk: 0.75 }),
  assess({ remotenessScore: 65, signalLossMiles: 10 }),
  assess({ remotenessScore: 60, cacheReady: false }),
]) {
  assert.ok(scenario.confidence >= 0 && scenario.confidence <= 1, 'Confidence must be normalized 0-1.');
  assert.ok(scenario.title && scenario.message && scenario.recommendedAction, 'Hazard output must be explainable.');
}

console.log('Remote weather hazard engine checks passed.');
