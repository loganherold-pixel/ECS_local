const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

global.__DEV__ = false;

require.extensions['.ts'] = function compileTypeScript(module, filename) {
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

const { buildBluTelemetryLogDetails } = require(path.join(process.cwd(), 'lib/bluDiagnosticsLog.ts'));

const waveTelemetry = {
  timestamp: Date.now(),
  source: 'cloud',
  battery: { tempC: 19 },
  solar: { watts: 0 },
  capabilities: {
    hasSOC: false,
    hasWattsIn: false,
    hasWattsOut: false,
    hasSolar: true,
    hasRuntimeEstimate: false,
    controllable: false,
  },
};

const details = buildBluTelemetryLogDetails({
  deviceId: 'KT21FAH5HGB70041',
  vendor: 'ecoflow',
  telemetry: waveTelemetry,
  streamMode: 'cloud_poll',
});

assert.strictEqual(details.hasBatteryPercent, false, 'capabilities.hasSOC=false must not be logged as decoded SOC telemetry');
assert.strictEqual(details.hasTemperature, true, 'battery.tempC should be logged as decoded temperature telemetry');
assert.strictEqual(details.hasWatts, true, 'solar.watts should be logged as decoded watts telemetry');

console.log('BLU diagnostics log checks passed.');
