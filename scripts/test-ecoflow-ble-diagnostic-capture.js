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
  captureSource.includes('ECOFLOW_BLE_PROTOCOL_CHARACTERISTICS') &&
    captureSource.includes('detectEcoFlowBleProtocolSupport') &&
    captureSource.includes('ecoflow_ble_protocol_pair_present_auth_not_implemented'),
  'EcoFlow BLE diagnostics must identify the known write/notify protocol candidates.',
);
assert(
  unifiedConnections.includes('getPowerBrandConnectionAdapterForDevice') &&
    unifiedConnections.includes('adapter.connect({') &&
    !unifiedConnections.includes('LOCAL_BLE_PARSER_UNAVAILABLE') &&
    !unifiedConnections.includes("phase: 'local_parser_blocked'"),
  'EcoFlow local BLE must route through the native power adapter instead of the old parser-blocked generic probe branch.',
);
assert(
  captureSource.includes('rawPayloadLogged: false') &&
    captureSource.includes('manufacturerDataFingerprint') &&
    !captureSource.includes('manufacturerDataRaw'),
  'EcoFlow BLE capture must fingerprint sensitive evidence and never expose raw payload fields.',
);

const {
  buildEcoFlowBleCharacteristicProbe,
  buildEcoFlowBleProtocolFrameCapture,
  detectEcoFlowBleProtocolSupport,
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

const protocolSummary = summarizeEcoFlowBleServices([
  {
    uuid: '00000001-0000-1000-8000-00805f9b34fb',
    characteristicCount: 2,
    characteristics: [
      buildEcoFlowBleCharacteristicProbe('00000001-0000-1000-8000-00805f9b34fb', {
        uuid: '00000002-0000-1000-8000-00805f9b34fb',
        isWritableWithResponse: true,
      }),
      buildEcoFlowBleCharacteristicProbe('00000001-0000-1000-8000-00805f9b34fb', {
        uuid: '00000003-0000-1000-8000-00805f9b34fb',
        isNotifiable: true,
      }),
    ],
  },
]);
const protocolSupport = detectEcoFlowBleProtocolSupport(protocolSummary.services);
assert.strictEqual(protocolSupport.hasRfcommWrite, true);
assert.strictEqual(protocolSupport.hasRfcommNotify, true);
assert.strictEqual(protocolSupport.hasAnyProtocolPair, true);
assert.strictEqual(
  protocolSupport.protocolStatus,
  'ecoflow_ble_protocol_pair_present_auth_not_implemented',
);

const frame = buildEcoFlowBleProtocolFrameCapture({
  direction: 'notify',
  serviceUuid: '00000001-0000-1000-8000-00805f9b34fb',
  characteristicUuid: '00000003-0000-1000-8000-00805f9b34fb',
  valueBase64: Buffer.from([0x01, 0x02, 0x03]).toString('base64'),
  capturedAtOffsetMs: 12.4,
});
assert.strictEqual(frame.direction, 'notify');
assert.strictEqual(frame.valueLength, 3);
assert.strictEqual(frame.capturedAtOffsetMs, 12);
assert.strictEqual(frame.valueFingerprint.startsWith('fnv1a:'), true);

console.log('EcoFlow BLE diagnostic capture checks passed.');
