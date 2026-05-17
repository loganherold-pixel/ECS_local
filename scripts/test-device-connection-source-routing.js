const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

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
  isCloudConnectionType,
  isEcoFlowCloudDeviceConnection,
  normalizeDeviceConnectionType,
  shouldUseNativeBluetoothConnection,
} = loadTypeScriptModule('lib/deviceConnectionSourceRouting.ts');

assert.strictEqual(normalizeDeviceConnectionType('Cloud API'), 'cloud_api');
assert.strictEqual(isCloudConnectionType('api'), true);
assert.strictEqual(isCloudConnectionType('cloud'), true);
assert.strictEqual(isCloudConnectionType('ble'), false);

const glacierCloudDevice = {
  kind: 'power',
  providerId: 'ecoflow',
  source: 'api',
  connectionType: 'api',
  requiresNativeBluetooth: false,
  connectableViaCloud: true,
};
assert.strictEqual(isEcoFlowCloudDeviceConnection(glacierCloudDevice), true);
assert.strictEqual(
  shouldUseNativeBluetoothConnection(glacierCloudDevice),
  false,
  'EcoFlow cloud/API devices must not route through the native Bluetooth manager.',
);

const sourceBadgeCloudDevice = {
  kind: 'power',
  providerId: 'ecoflow',
  sourceBadges: ['API'],
  connectionType: 'api',
};
assert.strictEqual(isEcoFlowCloudDeviceConnection(sourceBadgeCloudDevice), true);

const ecoflowBleDevice = {
  kind: 'power',
  providerId: 'ecoflow',
  source: 'ble',
  connectionType: 'ble',
  requiresNativeBluetooth: true,
};
assert.strictEqual(isEcoFlowCloudDeviceConnection(ecoflowBleDevice), false);
assert.strictEqual(shouldUseNativeBluetoothConnection(ecoflowBleDevice), true);

const ecoflowHybridDevice = {
  kind: 'power',
  providerId: 'ecoflow',
  sources: ['api', 'ble'],
  sourceBadges: ['API', 'BLE'],
  connectionType: 'hybrid',
  requiresNativeBluetooth: true,
  connectableViaCloud: true,
};
assert.strictEqual(
  isEcoFlowCloudDeviceConnection(ecoflowHybridDevice),
  false,
  'EcoFlow BLE advertisements must remain native Bluetooth connectable even when cloud metadata is also present.',
);
assert.strictEqual(shouldUseNativeBluetoothConnection(ecoflowHybridDevice), true);

const bluettiDevice = {
  kind: 'power',
  providerId: 'bluetti',
  source: 'ble',
  connectionType: 'ble',
};
assert.strictEqual(isEcoFlowCloudDeviceConnection(bluettiDevice), false);
assert.strictEqual(shouldUseNativeBluetoothConnection(bluettiDevice), true);

console.log('Device connection source routing checks passed.');
