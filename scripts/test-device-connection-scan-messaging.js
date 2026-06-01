const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

global.__DEV__ = false;

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

const {
  getSourceStatusDetail,
  getSourceStatusLabel,
  isNativeBluetoothRuntimeUnsupported,
  NATIVE_BLUETOOTH_RUNTIME_MESSAGE,
} = loadTypeScriptModule('lib/deviceConnectionScanMessaging.ts');

assert.strictEqual(
  isNativeBluetoothRuntimeUnsupported('runtime_unsupported missing=["runtime.expo_go"] bluetoothState=null'),
  true,
);
assert.strictEqual(isNativeBluetoothRuntimeUnsupported('Bluetooth powered off'), false);
const readinessSource = fs.readFileSync(path.join(process.cwd(), 'src/power/ble/BleScanReadiness.ts'), 'utf8');
const unifiedSource = fs.readFileSync(path.join(process.cwd(), 'lib/useUnifiedDeviceConnections.ts'), 'utf8');
assert.match(readinessSource, /export function isBleRuntimeUnsupported/);
assert.match(unifiedSource, /isBleRuntimeUnsupported\(\)/);
assert.match(unifiedSource, /runtime_unsupported/);

const ecoflowSuccess = {
  key: 'ecoflow_api',
  label: 'EcoFlow API',
  status: 'success',
  deviceCount: 5,
  rawCount: 5,
  normalizedCount: 5,
  addedCount: 5,
  failedReason: null,
  detail: 'EcoFlow API returned devices.',
};
assert.strictEqual(getSourceStatusLabel(ecoflowSuccess), '5 cloud devices found');
assert.strictEqual(getSourceStatusDetail(ecoflowSuccess), 'EcoFlow API returned 5 cloud devices.');

const bleUnsupported = {
  key: 'ble',
  label: 'BLE',
  status: 'unsupported',
  deviceCount: 0,
  rawCount: 0,
  normalizedCount: 0,
  addedCount: 0,
  failedReason: 'runtime_unsupported',
  detail: NATIVE_BLUETOOTH_RUNTIME_MESSAGE,
};
assert.strictEqual(getSourceStatusLabel(bleUnsupported), 'Native Bluetooth unavailable');
assert.match(getSourceStatusDetail(bleUnsupported), /development\/native build/);
assert.match(getSourceStatusDetail(bleUnsupported), /Cloud\/API devices remain available/);

const obdUnsupported = {
  key: 'obd2',
  label: 'OBD2',
  status: 'unsupported',
  deviceCount: 0,
  rawCount: 0,
  normalizedCount: 0,
  addedCount: 0,
  failedReason: 'runtime_unsupported',
  detail: 'OBD2 telemetry adapters require a development/native build in this runtime.',
};
assert.strictEqual(getSourceStatusLabel(obdUnsupported), 'OBD2 unavailable');
assert.match(getSourceStatusDetail(obdUnsupported), /native BLE bridge/);
assert.match(getSourceStatusDetail(obdUnsupported), /Classic Bluetooth\/SPP/);

console.log('Device connection scan messaging checks passed.');
