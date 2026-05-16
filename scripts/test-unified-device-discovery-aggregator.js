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
    return { Platform: { OS: 'ios' } };
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
  discoverClassicBluetoothDevicesForUnifiedScanner,
  mergeDiscoveredDevices,
  normalizeDiscoveredDevice,
} = loadTypeScriptModule('lib/unifiedDeviceDiscoveryAggregator.ts');

const bleVeepeak = normalizeDiscoveredDevice({
  id: 'AA:BB:CC:DD:EE:FF',
  source: 'ble',
  brand: 'V Peak / Veepeak OBD2',
  model: 'Veepeak BLE+',
  displayName: 'Veepeak BLE+ OBD2',
  category: 'obd2',
  connectionType: 'ble',
  rssi: -61,
  lastSeenAt: 1000,
});
assert(bleVeepeak);
assert.strictEqual(bleVeepeak.source, 'ble');
assert.strictEqual(bleVeepeak.connectionType, 'ble');
assert.strictEqual(bleVeepeak.displayName, 'Veepeak BLE+ OBD2');

const unnamed = normalizeDiscoveredDevice({
  id: '11:22:33:44:55:66',
  source: 'classic_bluetooth',
  brand: 'Unknown',
  model: '',
  category: 'unknown',
});
assert(unnamed);
assert.strictEqual(unnamed.displayName, 'Unknown device 5566');
assert.strictEqual(unnamed.connectionType, 'classic_bluetooth');

const idlessNamedBle = normalizeDiscoveredDevice({
  source: 'ble',
  displayName: 'Unknown device A1B2',
  brand: 'Unknown',
  category: 'unknown',
  rssi: -47,
  lastSeenAt: 1700000000000,
  raw: {
    manufacturerData: 'ffee001122',
  },
}, 1700000000000);
assert(idlessNamedBle, 'idless BLE devices with usable name/manufacturer hints should still normalize');
assert(idlessNamedBle.id.startsWith('temporary:ble:unknowndevicea1b2:ffee001122:-50:'));
assert.strictEqual(idlessNamedBle.displayName, 'Unknown device A1B2');

const apiGlacier = normalizeDiscoveredDevice({
  id: 'GLACIER123',
  apiDeviceId: 'GLACIER123',
  source: 'api',
  serial: 'SN-GLACIER-1',
  brand: 'EcoFlow',
  model: 'GLACIER',
  displayName: 'EcoFlow Glacier',
  category: 'refrigerator',
  connectionType: 'api',
  online: true,
  lastSeenAt: 2000,
});
const bleGlacier = normalizeDiscoveredDevice({
  id: 'EF:00:00:00:00:01',
  bleDeviceId: 'EF:00:00:00:00:01',
  source: 'ble',
  serial: 'SN-GLACIER-1',
  brand: 'EcoFlow',
  model: 'GLACIER',
  displayName: 'EcoFlow Glacier',
  category: 'refrigerator',
  connectionType: 'ble',
  rssi: -54,
  lastSeenAt: 1500,
});
const separateEcoFlowBle = normalizeDiscoveredDevice({
  id: 'EF:00:00:00:00:02',
  bleDeviceId: 'EF:00:00:00:00:02',
  source: 'ble',
  brand: 'EcoFlow',
  model: 'DELTA 2',
  displayName: 'EcoFlow DELTA 2',
  category: 'power_station',
  connectionType: 'ble',
  rssi: -63,
  lastSeenAt: 1600,
});

const merged = mergeDiscoveredDevices([
  apiGlacier,
  bleGlacier,
  separateEcoFlowBle,
  bleVeepeak,
]);

const glacier = merged.find((device) => device.displayName === 'EcoFlow Glacier');
assert(glacier, 'API and BLE records for the same serial Glacier should merge');
assert.deepStrictEqual(glacier.sources.sort(), ['api', 'ble']);
assert.strictEqual(glacier.connectionType, 'hybrid');
assert.strictEqual(glacier.online, true);
assert.strictEqual(glacier.sourceIds.api, 'GLACIER123');
assert.strictEqual(glacier.sourceIds.ble, 'EF:00:00:00:00:01');

assert(
  merged.some((device) => device.displayName === 'EcoFlow DELTA 2'),
  'a BLE EcoFlow device must not be hidden just because another EcoFlow API device exists',
);
assert(
  merged.some((device) => device.brand === 'V Peak / Veepeak OBD2'),
  'V Peak/Veepeak OBD2 devices must remain visible in the unified list',
);

(async () => {
  const classic = await discoverClassicBluetoothDevicesForUnifiedScanner();
  assert.strictEqual(classic.source, 'classic_bluetooth');
  assert.strictEqual(classic.status, 'unsupported');
  assert.deepStrictEqual(classic.devices, []);

  console.log('Unified device discovery aggregator checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
