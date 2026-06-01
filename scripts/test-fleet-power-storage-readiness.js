const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

require.extensions['.ts'] = function compileTs(module, filename) {
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

const originalModuleLoad = Module._load;
Module._load = function patchedModuleLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

const { resolveFleetPowerStorageReadiness } = require(path.join(root, 'lib', 'fleet', 'fleetPowerStorageReadiness.ts'));

function reading(overrides = {}) {
  return {
    deviceId: 'power-1',
    deviceName: 'EcoFlow Glacier',
    provider: 'ecoflow',
    providerLabel: 'EcoFlow',
    transport: 'ble',
    quality: 'live',
    lastUpdated: Date.now(),
    batteryPercent: 78,
    capacityWh: null,
    inputWatts: 40,
    outputWatts: 12,
    solarWatts: null,
    temperatureCelsius: null,
    estimatedRuntimeMinutes: null,
    batteryVolts: null,
    batteryAmps: null,
    batteryWatts: null,
    acOutputWatts: null,
    dcOutputWatts: null,
    signalStrength: null,
    isLive: true,
    isStale: false,
    ...overrides,
  };
}

const liveBle = resolveFleetPowerStorageReadiness([reading()]);
assert.strictEqual(liveBle.hasLivePowerStorage, true, 'Live BLE power telemetry should satisfy Fleet power storage readiness.');
assert.strictEqual(liveBle.liveDeviceCount, 1);
assert.strictEqual(liveBle.primaryDeviceName, 'EcoFlow Glacier');

assert.strictEqual(
  resolveFleetPowerStorageReadiness([reading({ quality: 'stale', isLive: false, isStale: true })]).hasLivePowerStorage,
  false,
  'Stale power telemetry should not satisfy Fleet power storage readiness.',
);

assert.strictEqual(
  resolveFleetPowerStorageReadiness([reading({ transport: 'cloud' })]).hasLivePowerStorage,
  false,
  'Cloud telemetry should not be treated as attached Bluetooth power storage.',
);

assert.strictEqual(
  resolveFleetPowerStorageReadiness([reading({
    batteryPercent: null,
    capacityWh: null,
    inputWatts: null,
    outputWatts: null,
    solarWatts: null,
    estimatedRuntimeMinutes: null,
  })]).hasLivePowerStorage,
  false,
  'A live BLE connection with no decoded power values should not satisfy readiness.',
);

const fleetScreen = read('app', '(tabs)', 'fleet.tsx');
assert.ok(
  fleetScreen.includes('useECSPowerTelemetryReadings') &&
    fleetScreen.includes('resolveFleetPowerStorageReadiness') &&
    fleetScreen.includes('fleetPowerStorageReadiness.hasLivePowerStorage'),
  'Fleet screen should feed live BLU power telemetry into readiness inputs.',
);
assert.ok(
  /hasPowerStorage:\s*\(\s*resourceProfile\.batteryUsableWh[\s\S]*fleetPowerStorageReadiness\.hasLivePowerStorage/.test(fleetScreen),
  'Fleet readiness should satisfy power storage from saved capacity or live BLU power telemetry.',
);

console.log('Fleet power storage readiness checks passed.');
