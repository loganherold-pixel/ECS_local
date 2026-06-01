const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

global.__DEV__ = false;

function compileTypeScript(mod, filename) {
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

require.extensions['.ts'] = compileTypeScript;

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

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
  EcoFlowCloudDiscoveryError,
  classifyEcoFlowCloudErrorSource,
  discoverEcoFlowDevicesForUnifiedScanner,
  normalizeEcoFlowScannerDevice,
} = loadTypeScriptModule('lib/ecoflowUnifiedScannerDiscovery.ts');

const glacier = normalizeEcoFlowScannerDevice({
  provider: 'EcoFlow',
  deviceId: 'GLACIER123',
  name: 'EcoFlow Glacier',
  model: 'unknown',
  productType: 'unknown',
  online: true,
  lastSeenAt: 1700000000000,
});

assert(glacier, 'EcoFlow Glacier should normalize into a scanner device');
assert.strictEqual(glacier.provider, 'ecoflow');
assert.strictEqual(glacier.providerId, 'ecoflow');
assert.strictEqual(glacier.name, 'EcoFlow Glacier');
assert.strictEqual(glacier.model, 'GLACIER');
assert.strictEqual(glacier.modelDisplayName, 'EcoFlow Glacier Refrigerator');
assert.strictEqual(glacier.productType, 'refrigerator');
assert.strictEqual(glacier.connectionType, 'api');
assert.strictEqual(glacier.requiresNativeBluetooth, false);
assert.strictEqual(glacier.connectableViaCloud, true);
assert.strictEqual(glacier.isOnline, true);
assert.strictEqual(glacier.discoveredAt, 1700000000000);
assert.strictEqual(glacier.raw.source, 'ecoflow_edge_function');

const unnamedPowerStation = normalizeEcoFlowScannerDevice({
  provider: 'EcoFlow',
  deviceId: 'DELTA2',
  name: '',
  model: 'DELTA 2',
  productType: 'power station',
  online: false,
});

assert(unnamedPowerStation, 'EcoFlow unnamed catalog devices should still normalize');
assert.strictEqual(unnamedPowerStation.name, 'EcoFlow DELTA 2');
assert.strictEqual(unnamedPowerStation.productType, 'power_station');
assert.strictEqual(unnamedPowerStation.connectionType, 'api');
assert.strictEqual(unnamedPowerStation.requiresNativeBluetooth, false);
assert.strictEqual(unnamedPowerStation.connectableViaCloud, true);
assert.strictEqual(unnamedPowerStation.isOnline, false);

const missingId = normalizeEcoFlowScannerDevice({
  provider: 'EcoFlow',
  deviceId: '',
  name: 'EcoFlow Glacier',
});
assert.strictEqual(missingId, null, 'devices without a stable cloud id should not enter the scanner list');

(async () => {
  const provider = {
    async listDevices() {
      return [
        {
          provider: 'EcoFlow',
          deviceId: 'GLACIER123',
          name: 'EcoFlow Glacier',
          model: 'GLACIER',
          productType: 'refrigerator',
          online: true,
          lastSeenAt: 1700000000000,
        },
      ];
    },
  };

  const devices = await discoverEcoFlowDevicesForUnifiedScanner(provider);
  assert.strictEqual(devices.length, 1);
  assert.strictEqual(devices[0].id, 'GLACIER123');
  assert.strictEqual(devices[0].productType, 'refrigerator');
  assert.strictEqual(devices[0].connectionType, 'api');

  assert.strictEqual(
    classifyEcoFlowCloudErrorSource(new Error('current device is not allowed to get device info')),
    'cloud_auth',
    'unauthorized EcoFlow device failures must be classified as cloud_auth, not native BLE',
  );
  assert.strictEqual(
    classifyEcoFlowCloudErrorSource(new Error('invalid access key or signature for region')),
    'cloud_config',
    'EcoFlow key/signature/region failures must be classified as cloud_config',
  );

  let failureVisible = false;
  let failureSource = null;
  try {
    await discoverEcoFlowDevicesForUnifiedScanner({
      async listDevices() {
        throw new Error('current device is not allowed to get device info');
      },
    });
  } catch (error) {
    failureVisible =
      error instanceof EcoFlowCloudDiscoveryError &&
      error.message === 'current device is not allowed to get device info';
    failureSource = error.errorSource;
  }
  assert.strictEqual(
    failureVisible,
    true,
    'EcoFlow edge function failure must be visible to the unified scanner source status while BLE discovery continues independently',
  );
  assert.strictEqual(failureSource, 'cloud_auth');

  console.log('EcoFlow unified scanner discovery checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
