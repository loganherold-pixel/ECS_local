const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
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
};

const diagnostics = read('lib/bluetoothDiagnostics.ts');
const genericManager = read('lib/genericBluetoothAccessoryManager.ts');
const unifiedConnections = read('lib/useUnifiedDeviceConnections.ts');
const captureSource = read('lib/ecoflowBleDiagnosticCapture.ts');

assert(
  diagnostics.includes("'ecoflow_ble_probe'"),
  'Bluetooth diagnostics must include an EcoFlow BLE probe event type.',
);
assert(
  genericManager.includes('recordEcoFlowBleProbeEvent') &&
    genericManager.includes("phase: 'connect_requested'") &&
    genericManager.includes("phase: 'native_transport_connected'") &&
    genericManager.includes("phase: 'service_discovery_started'") &&
    genericManager.includes("phase: 'service_discovery_completed'") &&
    genericManager.includes('buildEcoFlowBleCharacteristicProbe') &&
    genericManager.includes("const characteristicSnapshots = options.owner === 'sensor'"),
  'Generic BLE manager must capture EcoFlow connect/GATT diagnostics without sampling characteristics for generic EcoFlow links.',
);
assert(
  unifiedConnections.includes("phase: 'local_parser_blocked'") &&
    unifiedConnections.includes('LOCAL_BLE_PARSER_UNAVAILABLE') &&
    unifiedConnections.includes('recordEcoFlowBleProbeEvent'),
  'EcoFlow local BLE parser block must be captured as a diagnostic probe event.',
);
assert(
  captureSource.includes('rawPayloadLogged: false') &&
    captureSource.includes('manufacturerDataFingerprint') &&
    !captureSource.includes('manufacturerDataRaw'),
  'EcoFlow BLE capture must fingerprint sensitive evidence and never expose raw payload fields.',
);

const {
  buildEcoFlowBleCharacteristicProbe,
  isEcoFlowBleDiagnosticTarget,
  summarizeEcoFlowBleServices,
} = loadTypeScriptModule('lib/ecoflowBleDiagnosticCapture.ts');

assert.strictEqual(isEcoFlowBleDiagnosticTarget({ providerId: 'ecoflow' }), true);
assert.strictEqual(isEcoFlowBleDiagnosticTarget({ displayName: 'DELTA 3 1500' }), true);
assert.strictEqual(isEcoFlowBleDiagnosticTarget({ displayName: 'Generic Speaker' }), false);

const characteristic = buildEcoFlowBleCharacteristicProbe('180F', {
  uuid: '2A19',
  isReadable: true,
  isNotifiable: false,
  isIndicatable: true,
});
assert.deepStrictEqual(characteristic, {
  serviceUuid: '180f',
  characteristicUuid: '2a19',
  isReadable: true,
  isWritableWithResponse: null,
  isWritableWithoutResponse: null,
  isNotifiable: false,
  isIndicatable: true,
});

const summary = summarizeEcoFlowBleServices([
  {
    uuid: ' 180F ',
    characteristicCount: 1,
    characteristics: [characteristic],
  },
]);
assert.strictEqual(summary.serviceCount, 1);
assert.strictEqual(summary.characteristicCount, 1);
assert.strictEqual(summary.notificationCandidateCount, 1);
assert.strictEqual(summary.services[0].uuid, '180f');

console.log('EcoFlow BLE diagnostic capture checks passed.');
