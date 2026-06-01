const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

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

function loadTypeScriptModule(relativePath) {
  const fullPath = path.join(process.cwd(), relativePath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScript(mod, fullPath);
  return mod.exports;
}

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

const captureSource = read('lib/ecoflowBleDiagnosticCapture.ts');
const nativeAdapterSource = read('lib/createNativeBleBluAdapter.ts');
const replayScriptSource = read('scripts/replay-ecoflow-ble-capture.js');
const fixturePath = 'fixtures/ecoflow-ble/delta-readable-text-capture.json';
const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), fixturePath), 'utf8'));
const delta3FixturePath = 'fixtures/ecoflow-ble/delta3-1500-decoded-protocol-capture.json';
const delta3Fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), delta3FixturePath), 'utf8'));

assert(captureSource.includes('EcoFlowBleReplayCapture'), 'EcoFlow BLE capture contract must be typed.');
assert(captureSource.includes('buildEcoFlowBleReplayCapture'), 'EcoFlow BLE capture builder must exist.');
assert(captureSource.includes('isEcoFlowBleReplayCaptureEnabled'), 'EcoFlow BLE replay capture must be explicit opt-in.');
assert(captureSource.includes('rawManufacturerDataIncluded: false'), 'Replay capture must never include raw manufacturer data.');
assert(captureSource.includes('providerSecretsIncluded: false'), 'Replay capture must mark provider secrets absent.');
assert(captureSource.includes('protocol?: EcoFlowBleProtocolSupport'), 'Replay capture should preserve EcoFlow protocol-candidate diagnostics.');
assert(captureSource.includes('protocolFrames?: EcoFlowBleProtocolFrameCapture'), 'Replay capture should preserve opt-in EcoFlow protocol notification frames.');
assert(captureSource.includes('decodedProtocolPackets?: EcoFlowBleDecodedProtocolPacketCapture'), 'Replay capture should preserve decrypted opt-in EcoFlow protocol packets.');
assert(captureSource.includes('rawProtocolFramesIncluded'), 'Replay capture safety metadata must flag raw protocol frame inclusion.');
assert(captureSource.includes('decryptedProtocolPayloadsIncluded'), 'Replay capture safety metadata must flag decrypted protocol payload inclusion.');
assert(captureSource.includes('services?: EcoFlowBleServiceProbe'), 'Replay capture should preserve service probe metadata.');
assert(nativeAdapterSource.includes('[ECOFLOW_BLE_REPLAY_CAPTURE]'), 'Native BLE adapter must emit opt-in EcoFlow replay capture logs.');
assert(nativeAdapterSource.includes("config.provider === 'ecoflow' && isEcoFlowBleReplayCaptureEnabled()"), 'Replay capture logs must be EcoFlow-only and opt-in.');
assert(nativeAdapterSource.includes('probeEcoFlowBleServices'), 'Native BLE adapter must probe EcoFlow write/notify characteristic metadata.');
assert(nativeAdapterSource.includes('sampleEcoFlowBleProtocolNotifications'), 'Native BLE adapter must capture opt-in EcoFlow notify frames for clean-room decoder replay.');
assert(nativeAdapterSource.includes('EXPO_PUBLIC_ECS_ECOFLOW_BLE_PROBE_BASE64'), 'Native BLE adapter must support explicit opt-in active probe frames for silent EcoFlow protocols.');
assert(nativeAdapterSource.includes('ecoflow_ble_active_probe_start'), 'Native BLE adapter must log when explicit active probes are used.');
assert(nativeAdapterSource.includes('EXPO_PUBLIC_ECS_ECOFLOW_BLE_NOTIFICATION_CAPTURE_MS'), 'EcoFlow BLE notification capture window must be configurable for slow active-probe replies.');
assert(nativeAdapterSource.includes('EXPO_PUBLIC_ECS_ECOFLOW_BLE_NOTIFICATION_CAPTURE_MAX_FRAMES'), 'EcoFlow BLE notification capture frame cap must be configurable for active-probe replay evidence.');
assert(nativeAdapterSource.includes('ecoflow_ble_active_probe_write_start'), 'Active EcoFlow probe writes must log sanitized write intent metadata.');
assert(nativeAdapterSource.includes('ecoflow_ble_active_probe_write_succeeded'), 'Active EcoFlow probe writes must log sanitized write success metadata.');
assert(nativeAdapterSource.includes('ecoflow_ble_auth_status_response_missing'), 'EcoFlow BLE diagnostics must distinguish auth-status no-response from generic parser gaps.');
assert(nativeAdapterSource.includes('ecoflow_ble_account_auth_payload_ready'), 'EcoFlow BLE diagnostics must log sanitized account-auth broker readiness.');
assert(nativeAdapterSource.includes('ecoflow_ble_account_auth_response_missing'), 'EcoFlow BLE diagnostics must distinguish account-auth no-response from auth-status no-response.');
assert(nativeAdapterSource.includes('inferEcoFlowBlePacketVersionFromHints'), 'EcoFlow BLE dynamic probe must infer packet version from sanitized model hints.');
assert(nativeAdapterSource.includes('packetVersion: step.packetVersion'), 'EcoFlow BLE dynamic probe logs must include sanitized packet-version evidence.');
assert(nativeAdapterSource.includes('includeDecryptedPayloadBase64: true'), 'EcoFlow BLE dynamic probe must retain decrypted payloads for explicit replay capture.');
assert(nativeAdapterSource.includes('buildEcoFlowBleDecodedProtocolPacketCapture'), 'Native BLE adapter must capture decoded EcoFlow packets after dynamic session negotiation.');
assert(nativeAdapterSource.includes('writeCharacteristicWithResponseForService'), 'Active EcoFlow probe frames must be written through the protocol write characteristic.');
assert(replayScriptSource.includes('assertSafeCapture'), 'Replay CLI must validate capture safety metadata.');
assert(replayScriptSource.includes('decodeEcoFlowBleTelemetry'), 'Replay CLI must feed captures through the EcoFlow BLE decoder.');
assert(replayScriptSource.includes('decodedProtocolPackets'), 'Replay CLI must feed decrypted protocol packets through the EcoFlow BLE decoder.');

assert.strictEqual(fixture.schema, 'ecs.ecoflow_ble.replay_capture');
assert.strictEqual(fixture.providerId, 'ecoflow');
assert.strictEqual(fixture.safety.rawManufacturerDataIncluded, false);
assert.strictEqual(fixture.safety.providerSecretsIncluded, false);
assert.strictEqual(fixture.safety.preciseLocationIncluded, false);
assert(Array.isArray(fixture.characteristics) && fixture.characteristics.length > 0);
assert.strictEqual(delta3Fixture.schema, 'ecs.ecoflow_ble.replay_capture');
assert.strictEqual(delta3Fixture.providerId, 'ecoflow');
assert.strictEqual(delta3Fixture.safety.rawManufacturerDataIncluded, false);
assert.strictEqual(delta3Fixture.safety.providerSecretsIncluded, false);
assert.strictEqual(delta3Fixture.safety.preciseLocationIncluded, false);
assert.strictEqual(delta3Fixture.safety.decryptedProtocolPayloadsIncluded, true);
assert(Array.isArray(delta3Fixture.decodedProtocolPackets) && delta3Fixture.decodedProtocolPackets.length > 0);

const {
  buildEcoFlowBleReplayCapture,
  isEcoFlowBleReplayCaptureEnabled,
} = loadTypeScriptModule('lib/ecoflowBleDiagnosticCapture.ts');
const { decodeEcoFlowBleTelemetry } = loadTypeScriptModule('src/power/drivers/vendors/EcoFlowDriver.ts');

const previousCaptureEnv = process.env.EXPO_PUBLIC_ECS_ECOFLOW_BLE_CAPTURE;
const previousCapturePrivateEnv = process.env.ECS_ECOFLOW_BLE_CAPTURE;
delete process.env.EXPO_PUBLIC_ECS_ECOFLOW_BLE_CAPTURE;
delete process.env.ECS_ECOFLOW_BLE_CAPTURE;
assert.strictEqual(isEcoFlowBleReplayCaptureEnabled(), false);
global.__ECS_ECOFLOW_BLE_CAPTURE_ENABLED = true;
assert.strictEqual(isEcoFlowBleReplayCaptureEnabled(), true);
delete global.__ECS_ECOFLOW_BLE_CAPTURE_ENABLED;
if (previousCaptureEnv === undefined) {
  delete process.env.EXPO_PUBLIC_ECS_ECOFLOW_BLE_CAPTURE;
} else {
  process.env.EXPO_PUBLIC_ECS_ECOFLOW_BLE_CAPTURE = previousCaptureEnv;
}
if (previousCapturePrivateEnv === undefined) {
  delete process.env.ECS_ECOFLOW_BLE_CAPTURE;
} else {
  process.env.ECS_ECOFLOW_BLE_CAPTURE = previousCapturePrivateEnv;
}

const payload = Buffer.from(JSON.stringify({ soc: 71, wattsIn: 144, wattsOut: 32 }), 'utf8').toString('base64');
const builtCapture = buildEcoFlowBleReplayCapture({
  providerId: 'ecoflow',
  providerLabel: 'EcoFlow',
  deviceId: 'private-device-id',
  displayName: 'EcoFlow fixture',
  model: 'DELTA fixture',
  serviceUuids: ['FFF0'],
  manufacturerData: 'raw-manufacturer-data',
  rssi: -42,
  services: [
    {
      uuid: '00000001-0000-1000-8000-00805f9b34fb',
      characteristicCount: 2,
      characteristics: [
        {
          serviceUuid: '00000001-0000-1000-8000-00805f9b34fb',
          characteristicUuid: '00000002-0000-1000-8000-00805f9b34fb',
          isReadable: false,
          isWritableWithResponse: true,
          isWritableWithoutResponse: false,
          isNotifiable: false,
          isIndicatable: false,
        },
        {
          serviceUuid: '00000001-0000-1000-8000-00805f9b34fb',
          characteristicUuid: '00000003-0000-1000-8000-00805f9b34fb',
          isReadable: false,
          isWritableWithResponse: false,
          isWritableWithoutResponse: false,
          isNotifiable: true,
          isIndicatable: false,
        },
      ],
    },
  ],
  protocolFrames: [
    {
      direction: 'notify',
      serviceUuid: '00000001-0000-1000-8000-00805f9b34fb',
      characteristicUuid: '00000003-0000-1000-8000-00805f9b34fb',
      valueBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
      valueLength: 4,
      valueFingerprint: 'fnv1a:test',
      capturedAtOffsetMs: 25,
    },
  ],
  decodedProtocolPackets: [
    {
      direction: 'notify',
      valid: true,
      src: 0x03,
      dst: 0x21,
      cmdSet: 0x20,
      cmdId: 0x02,
      version: 2,
      payloadLength: 3,
      payloadFirstByte: 1,
      payloadBase64: Buffer.from([1, 2, 3]).toString('base64'),
      payloadFingerprint: 'fnv1a:payload',
      packetBase64: Buffer.from([0xaa, 2, 3]).toString('base64'),
      packetFingerprint: 'fnv1a:packet',
      capturedAtOffsetMs: 30,
    },
  ],
  characteristicMap: new Map([
    ['fff0:fff1', { serviceUuid: 'fff0', characteristicUuid: 'fff1', valueBase64: payload }],
  ]),
});
assert.strictEqual(builtCapture.device.idFingerprint.startsWith('fnv1a:'), true);
assert.strictEqual(builtCapture.device.manufacturerDataPresent, true);
assert.strictEqual(builtCapture.safety.rawManufacturerDataIncluded, false);
assert.strictEqual(builtCapture.characteristics[0].valueBase64, payload);
assert.strictEqual(builtCapture.protocol.hasAnyProtocolPair, true);
assert.strictEqual(builtCapture.protocolFrames.length, 1);
assert.strictEqual(builtCapture.decodedProtocolPackets.length, 1);
assert.strictEqual(builtCapture.decodedProtocolPackets[0].payloadBase64, Buffer.from([1, 2, 3]).toString('base64'));
assert.strictEqual(builtCapture.safety.rawProtocolFramesIncluded, true);
assert.strictEqual(builtCapture.safety.decryptedProtocolPayloadsIncluded, true);
assert.strictEqual(
  builtCapture.protocol.protocolStatus,
  'ecoflow_ble_protocol_pair_present_auth_not_implemented',
);
assert.strictEqual(builtCapture.services[0].characteristics.length, 2);
assert(!JSON.stringify(builtCapture).includes('raw-manufacturer-data'), 'Raw manufacturer data must not be serialized.');
assert(!JSON.stringify(builtCapture).includes('private-device-id'), 'Raw device id must not be serialized.');

const decoded = decodeEcoFlowBleTelemetry({
  device: { name: fixture.device.name },
  characteristicMap: new Map(fixture.characteristics.map((entry) => [
    `${entry.serviceUuid}:${entry.characteristicUuid}`,
    entry,
  ])),
  rssi: fixture.device.rssi,
});
assert.strictEqual(decoded.battery_percent, fixture.expected.battery_percent);
assert.strictEqual(decoded.input_watts, fixture.expected.input_watts);
assert.strictEqual(decoded.output_watts, fixture.expected.output_watts);
assert.strictEqual(decoded.solar_input_watts, fixture.expected.solar_input_watts);
assert.strictEqual(decoded.estimated_runtime_minutes, fixture.expected.estimated_runtime_minutes);
assert.strictEqual(decoded.temperature_celsius, fixture.expected.temperature_celsius);

const decodedDelta3 = decodeEcoFlowBleTelemetry({
  device: { name: delta3Fixture.device.name },
  characteristicMap: new Map(),
  decodedProtocolPackets: delta3Fixture.decodedProtocolPackets,
  rssi: delta3Fixture.device.rssi,
});
assert.strictEqual(decodedDelta3.battery_percent, delta3Fixture.expected.battery_percent);
assert.strictEqual(decodedDelta3.input_watts, delta3Fixture.expected.input_watts);
assert.strictEqual(decodedDelta3.output_watts, delta3Fixture.expected.output_watts);
assert.strictEqual(decodedDelta3.solar_input_watts, delta3Fixture.expected.solar_input_watts);
assert.strictEqual(decodedDelta3.estimated_runtime_minutes, delta3Fixture.expected.estimated_runtime_minutes);
assert.strictEqual(decodedDelta3.raw.parserStatus, 'decoded_protocol_packets_delta2_delta3_v1');

assert(replayScriptSource.includes('printUsage()'), 'Replay CLI must provide usage help.');
assert(replayScriptSource.includes('readCaptureFiles(options.target)'), 'Replay CLI must read a capture file or directory.');
assert(replayScriptSource.includes("process.exitCode = 1"), 'Replay CLI must fail when no fields decode unless --allow-empty is set.');

console.log('EcoFlow BLE replay capture checks passed.');
