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

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function loadTypeScriptModule(relativePath) {
  const fullPath = path.join(process.cwd(), relativePath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScript(mod, fullPath);
  return mod.exports;
}

const diagnosticsSource = read('lib/ecoflowConnectionDiagnostics.ts');
const cloudConnectionSource = read('lib/ecoflowCloudConnection.ts');
const unifiedSource = read('lib/useUnifiedDeviceConnections.ts');
const ecoFlowDriverSource = read('src/power/drivers/vendors/EcoFlowDriver.ts');
const edgeFunctionSource = read('supabase/functions/ecoflow/index.ts');
const troubleshootingDoc = read('docs/ecoflow-blu-troubleshooting.md');

for (const marker of [
  "'discovered'",
  "'connecting'",
  "'connected'",
  "'handshaking'",
  "'awaitingTelemetry'",
  "'streaming'",
  "'cloudPolling'",
  "'timeout'",
  "'failed'",
  "'disconnected'",
  "'scanTimeout'",
  "'connectTimeout'",
  "'handshakeTimeout'",
  "'firstTelemetryTimeout'",
  "'streamStaleTimeout'",
  "'cloudPollTimeout'",
  "'local-ble'",
  "'ecoflow-cloud'",
  "'hybrid'",
  "'unavailable'",
  'requiresCloudAuth',
  'requiresNativeBle',
]) {
  assert(diagnosticsSource.includes(marker), `EcoFlow diagnostics contract must include ${marker}`);
}

assert(
  cloudConnectionSource.includes('const activeEcoFlowCloudPollingSessions = new Map<string, ActiveEcoFlowCloudPollingSession>()') &&
    !cloudConnectionSource.includes('let activeEcoFlowCloudPollingSession: ActiveEcoFlowCloudPollingSession | null = null') &&
    cloudConnectionSource.includes('activeEcoFlowCloudPollingSessions.get(deviceId)') &&
    cloudConnectionSource.includes('activeEcoFlowCloudPollingSessions.set(deviceId, session)') &&
    cloudConnectionSource.includes('stopEcoFlowCloudTelemetryPolling(deviceId?: string | null)'),
  'EcoFlow cloud polling must be keyed per device, not a global singleton session.',
);

for (const marker of [
  "recordEcoFlowConnectionPhase({",
  "phase: 'connecting'",
  "phase: 'handshaking'",
  "phase: 'awaitingTelemetry'",
  "phase: 'streaming'",
  "timeoutKind: 'firstTelemetryTimeout'",
  "timeoutKind: 'cloudPollTimeout'",
  'requiresCloudAuth: authFailure',
]) {
  assert(cloudConnectionSource.includes(marker), `EcoFlow cloud connection must record ${marker}`);
}

for (const marker of [
  "deviceId: device.id",
  "source: String(device.connectionType ?? '') === 'hybrid' ? 'hybrid' : 'ecoflow-cloud'",
  "deviceId: 'ecoflow_cloud_discovery'",
  "timeoutKind: 'scanTimeout'",
  "deviceId: device.rawId",
  "adapter.connect({",
  "power_provider_stream_ready",
  "await ensureManagedPowerOwnership(\n          device.providerId as BluProviderId",
  "stopEcoFlowCloudTelemetryPolling(device.rawId)",
  'ecoflowDiagnosticReason',
]) {
  assert(unifiedSource.includes(marker), `Unified EcoFlow path must include ${marker}`);
}

assert(
  unifiedSource.includes('getPowerBrandConnectionAdapterForDevice') &&
    !unifiedSource.includes('LOCAL_BLE_PARSER_UNAVAILABLE') &&
    !unifiedSource.includes('EcoFlow Bluetooth is attached, but ECS does not yet have a validated local telemetry parser'),
  'EcoFlow local BLE must use the power adapter path instead of the old parser-unavailable generic attachment branch.',
);

assert(
  ecoFlowDriverSource.includes('ecoflow_native_ble_v1') &&
    ecoFlowDriverSource.includes('decodeEcoFlowBleTelemetry') &&
    ecoFlowDriverSource.includes('isEcoFlowBleDevice') &&
    !ecoFlowDriverSource.includes('supports(_deviceInfo') &&
    !ecoFlowDriverSource.includes('return false;\n  }'),
  'EcoFlow local BLE driver must expose a native parser and device matcher.',
);

assert(
  !edgeFunctionSource.includes('console.log') &&
    !edgeFunctionSource.includes('ECOFLOW_ACCESS_KEY=') &&
    !edgeFunctionSource.includes('ECOFLOW_SECRET_KEY=') &&
    edgeFunctionSource.includes('getEnvOrNull("ECOFLOW_ACCESS_KEY")') &&
    edgeFunctionSource.includes('getEnvOrNull("ECOFLOW_SECRET_KEY")'),
  'EcoFlow Edge Function must keep credentials server-side and avoid raw secret logging.',
);

for (const marker of [
  '# EcoFlow BLU Troubleshooting',
  'Glacier can advertise over BLE',
  'firstTelemetryTimeout',
  'cloudPollTimeout',
  'Cloud/API Failure Modes',
  'Per-Device Telemetry State',
  'Local BLE Current Status',
  'VeePeak OBD2 remains the reference',
]) {
  assert(troubleshootingDoc.includes(marker), `EcoFlow troubleshooting doc must include ${marker}`);
}

const {
  clearEcoFlowConnectionState,
  getAllEcoFlowConnectionStates,
  getEcoFlowConnectionState,
  recordEcoFlowConnectionPhase,
  recordEcoFlowTimeout,
} = loadTypeScriptModule('lib/ecoflowConnectionDiagnostics.ts');
const {
  EcoFlowDriver,
  decodeEcoFlowBleTelemetry,
  isEcoFlowBleDevice,
  parseEcoFlowBleTelemetry,
} = loadTypeScriptModule('src/power/drivers/vendors/EcoFlowDriver.ts');

const driver = new EcoFlowDriver();
assert.strictEqual(driver.supports({ name: 'EcoFlow DELTA 3 1500' }), true);
assert.strictEqual(driver.supports({ name: 'Generic Speaker' }), false);
assert.strictEqual(isEcoFlowBleDevice({ localName: 'RIVER 3 Plus' }), true);
assert.strictEqual(isEcoFlowBleDevice({ localName: 'EF-BX11224' }), true);
assert.strictEqual(isEcoFlowBleDevice({ name: 'EF-D36F5055' }), true);

const structuredTelemetry = parseEcoFlowBleTelemetry({
  deviceId: 'DELTA-1',
  batteryPercent: 77,
  inputWatts: 245,
  outputWatts: 93,
  solarWatts: 110,
  temperatureCelsius: 31,
});
assert.strictEqual(structuredTelemetry.battery_percent, 77);
assert.strictEqual(structuredTelemetry.input_watts, 245);
assert.strictEqual(structuredTelemetry.output_watts, 93);
assert.strictEqual(structuredTelemetry.solar_input_watts, 110);
assert.strictEqual(structuredTelemetry.temperature_celsius, 31);
assert.deepStrictEqual(structuredTelemetry.raw.decodedKeys.sort(), [
  'battery_percent',
  'input_watts',
  'output_watts',
  'solar_input_watts',
  'temperature_celsius',
].sort());

const jsonPayload = Buffer.from(JSON.stringify({
  soc: 64,
  wattsIn: 180,
  wattsOut: 52,
  runtime: 210,
}), 'utf8').toString('base64');
const decodedBle = decodeEcoFlowBleTelemetry({
  device: { id: 'RIVER-1', name: 'RIVER 3 Plus' },
  characteristicMap: new Map([
    ['fff0:fff1', {
      serviceUuid: 'fff0',
      characteristicUuid: 'fff1',
      valueBase64: jsonPayload,
    }],
  ]),
  rssi: -48,
});
assert.strictEqual(decodedBle.battery_percent, 64);
assert.strictEqual(decodedBle.input_watts, 180);
assert.strictEqual(decodedBle.output_watts, 52);
assert.strictEqual(decodedBle.estimated_runtime_minutes, 210);
assert.strictEqual(decodedBle.signal_strength, -48);

const canonicalPower = driver.parse({ deviceId: 'DELTA-1', soc: 88, wattsOut: 45 });
assert.strictEqual(canonicalPower.source, 'ble');
assert.strictEqual(canonicalPower.isLive, true);
assert.strictEqual(canonicalPower.battery.socPct, 88);
assert.strictEqual(canonicalPower.battery.wattsOut, 45);
assert.deepStrictEqual(driver.parse({ deviceId: 'DELTA-1', opaque: true }), {});

clearEcoFlowConnectionState();
recordEcoFlowConnectionPhase({
  deviceId: 'GLACIER-1',
  deviceName: 'GLACIER',
  productType: 'refrigerator',
  phase: 'connected',
  source: 'local-ble',
  now: 1000,
});
recordEcoFlowTimeout({
  deviceId: 'GLACIER-1',
  deviceName: 'GLACIER',
  productType: 'refrigerator',
  source: 'local-ble',
  timeoutKind: 'firstTelemetryTimeout',
  reason: 'local parser unavailable',
  canRetry: false,
  requiresCloudAuth: true,
  requiresNativeBle: false,
  lastSuccessfulPhase: 'connected',
  lastPacketAt: null,
  now: 2000,
});
recordEcoFlowConnectionPhase({
  deviceId: 'DELTA-1',
  deviceName: 'DELTA',
  productType: 'power_station',
  phase: 'streaming',
  source: 'ecoflow-cloud',
  lastPacketAt: 3000,
  now: 3000,
});

assert.strictEqual(getAllEcoFlowConnectionStates().length, 2, 'EcoFlow diagnostics must keep separate per-device states.');
assert.strictEqual(getEcoFlowConnectionState('GLACIER-1').timeoutKind, 'firstTelemetryTimeout');
assert.strictEqual(getEcoFlowConnectionState('GLACIER-1').diagnosticReason.requiresCloudAuth, true);
assert.strictEqual(getEcoFlowConnectionState('DELTA-1').phase, 'streaming');
assert.strictEqual(getEcoFlowConnectionState('DELTA-1').lastPacketAt, 3000);

clearEcoFlowConnectionState('GLACIER-1');
assert.strictEqual(getEcoFlowConnectionState('GLACIER-1'), null);
assert.strictEqual(getEcoFlowConnectionState('DELTA-1').phase, 'streaming');
clearEcoFlowConnectionState();

console.log('EcoFlow driver diagnostics checks passed.');
