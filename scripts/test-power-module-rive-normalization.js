const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

require.extensions['.ts'] = (module, filename) => {
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

const {
  resolveBluPowerModuleRuntime,
} = require(path.join(root, 'lib', 'bluPowerModuleRive.ts'));
const {
  adaptPowerTelemetryForRive,
} = require(path.join(root, 'lib', 'powerModuleRiveTelemetry.ts'));

function onlineTelemetry(overrides = {}) {
  return {
    canDisplayTelemetryValues: true,
    isStale: false,
    snapshot: { isStale: false },
    sourceState: { isStale: false, isUnavailable: false },
    batteryPercent: 50,
    inputWatts: 0,
    outputWatts: 0,
    ...overrides,
  };
}

function runtimeFromTelemetry(telemetry) {
  return resolveBluPowerModuleRuntime(adaptPowerTelemetryForRive(telemetry));
}

{
  const adapted = adaptPowerTelemetryForRive(null);
  const runtime = resolveBluPowerModuleRuntime(adapted);
  assert.deepStrictEqual(adapted, {
    hasEcsData: false,
    batteryPercent: null,
    inputWatts: null,
    outputWatts: null,
  });
  assert.strictEqual(runtime.offlinestatusopacity, 100);
  assert.strictEqual(runtime.batteryPercent, 0);
  assert.strictEqual(runtime.leftflowopacity, 0);
  assert.strictEqual(runtime.rightflowopacity, 0);
}

{
  const runtime = runtimeFromTelemetry(onlineTelemetry());
  assert.strictEqual(runtime.offlinestatusopacity, 0);
  assert.strictEqual(runtime.batteryPercent, 50);
  assert.strictEqual(runtime.leftflowopacity, 0);
  assert.strictEqual(runtime.rightflowopacity, 0);
}

{
  const runtime = runtimeFromTelemetry(onlineTelemetry({ inputWatts: 2, outputWatts: 0 }));
  assert.strictEqual(runtime.leftflowopacity, 100);
  assert.strictEqual(runtime.rightflowopacity, 0);
}

{
  const runtime = runtimeFromTelemetry(onlineTelemetry({ inputWatts: 0, outputWatts: 2 }));
  assert.strictEqual(runtime.leftflowopacity, 0);
  assert.strictEqual(runtime.rightflowopacity, 100);
}

{
  const runtime = runtimeFromTelemetry(onlineTelemetry({ inputWatts: 2, outputWatts: 3 }));
  assert.strictEqual(runtime.leftflowopacity, 100);
  assert.strictEqual(runtime.rightflowopacity, 100);
}

{
  assert.strictEqual(runtimeFromTelemetry(onlineTelemetry({ batteryPercent: -12 })).batteryPercent, 0);
  assert.strictEqual(runtimeFromTelemetry(onlineTelemetry({ batteryPercent: 145 })).batteryPercent, 100);
  assert.strictEqual(runtimeFromTelemetry(onlineTelemetry({ batteryPercent: null })).batteryPercent, 0);
  assert.strictEqual(runtimeFromTelemetry(onlineTelemetry({ batteryPercent: Number.NaN })).batteryPercent, 0);
}

{
  const staleCases = [
    onlineTelemetry({ isStale: true }),
    onlineTelemetry({ snapshot: { isStale: true } }),
    onlineTelemetry({ sourceState: { isStale: true, isUnavailable: false } }),
    onlineTelemetry({ sourceState: { isStale: false, isUnavailable: true } }),
    onlineTelemetry({ canDisplayTelemetryValues: false }),
  ];

  for (const telemetry of staleCases) {
    const adapted = adaptPowerTelemetryForRive(telemetry);
    const runtime = resolveBluPowerModuleRuntime(adapted);
    assert.strictEqual(adapted.hasEcsData, false);
    assert.strictEqual(runtime.offlinestatusopacity, 100);
    assert.strictEqual(runtime.leftflowopacity, 0);
    assert.strictEqual(runtime.rightflowopacity, 0);
  }
}

{
  const adapted = adaptPowerTelemetryForRive(onlineTelemetry({
    batteryPercent: 88.4,
    inputWatts: -9,
    outputWatts: Number.NaN,
  }));
  assert.deepStrictEqual(adapted, {
    hasEcsData: true,
    batteryPercent: 88,
    inputWatts: 0,
    outputWatts: null,
  });
}

console.log('Power module Rive normalization checks passed.');
