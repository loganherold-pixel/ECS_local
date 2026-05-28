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
  "timeoutKind: 'firstTelemetryTimeout'",
  'LOCAL_BLE_PARSER_UNAVAILABLE',
  'bluDeviceRegistry.registerDevice({\n            provider: \'ecoflow\'',
  "telemetry_capable: false",
  "await ensureManagedPowerOwnership(\n            'ecoflow'",
  "stopEcoFlowCloudTelemetryPolling(device.rawId)",
  'ecoflowDiagnosticReason',
]) {
  assert(unifiedSource.includes(marker), `Unified EcoFlow path must include ${marker}`);
}

assert(
  unifiedSource.includes('genericBluetoothAccessoryManager.connect') &&
    unifiedSource.includes('EcoFlow Bluetooth is attached, but ECS does not yet have a validated local telemetry parser'),
  'EcoFlow local BLE must remain a transport attachment path with parser-pending diagnostics.',
);

assert(
  ecoFlowDriverSource.includes('supports(') &&
    ecoFlowDriverSource.includes('return false'),
  'EcoFlow local BLE driver should remain parser-pending until validated model support exists.',
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
