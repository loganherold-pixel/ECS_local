const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function has(content, needle, label) {
  assert(content.includes(needle), `${label} must include ${needle}`);
}

const bluTypes = read('lib/BluTypes.ts');
const lifecycle = read('lib/bluStreamLifecycle.ts');
const nativeAdapter = read('lib/createNativeBleBluAdapter.ts');
const ecoflowCloud = read('lib/ecoflowCloudConnection.ts');
const unifiedHook = read('lib/useUnifiedDeviceConnections.ts');
const obd2Adapter = read('src/vehicle-telemetry/OBD2Adapter.ts');

has(bluTypes, "export type BluStreamPhase", 'BLU stream types');
has(bluTypes, "'awaitingFirstPacket'", 'BLU stream phase contract');
has(bluTypes, "'recovering'", 'BLU connection status contract');
has(bluTypes, "export type BluStreamHealth", 'BLU stream health contract');

has(lifecycle, 'export const DEFAULT_STALE_AFTER_MS = 10_000', 'shared stream lifecycle defaults');
has(lifecycle, 'export const DEFAULT_FIRST_PACKET_TIMEOUT_MS = 15_000', 'shared stream lifecycle defaults');
has(lifecycle, 'export const DEFAULT_RECONNECT_BACKOFF_MS = [1000, 3000, 8000, 15_000] as const', 'shared stream lifecycle defaults');
has(lifecycle, 'export class BluStreamLifecycle', 'shared stream lifecycle class');
has(lifecycle, 'recordPacket(', 'shared stream lifecycle packet tracking');
has(lifecycle, 'recordError(', 'shared stream lifecycle error tracking');
has(lifecycle, 'handleFirstPacketTimeout', 'shared stream lifecycle first-packet timeout');
has(lifecycle, 'scheduleStaleTimer', 'shared stream lifecycle stale timer');
has(lifecycle, 'scheduleRecovery', 'shared stream lifecycle bounded recovery');
has(lifecycle, 'this.reconnectAttempts < this.maxReconnectAttempts', 'shared stream lifecycle retry bound');
has(lifecycle, 'clearTimers()', 'shared stream lifecycle cleanup');
has(lifecycle, "blu_stream_stale", 'shared stream lifecycle stale diagnostics');
has(lifecycle, "blu_stream_recoverable_error", 'shared stream lifecycle timeout diagnostics');

has(nativeAdapter, 'private streamLifecycles = new Map<string, BluStreamLifecycle>()', 'native BLE lifecycle registry');
has(nativeAdapter, 'private pollingDeviceIds = new Set<string>()', 'native BLE duplicate poll guard');
has(nativeAdapter, 'ensureStreamLifecycle(deviceId: string)', 'native BLE lifecycle startup');
has(nativeAdapter, 'lifecycle.recordPacket(telemetry.timestamp)', 'native BLE packet freshness');
has(nativeAdapter, "lifecycle.recordError(\n            'telemetry_setup'", 'native BLE unsupported telemetry phase');
has(nativeAdapter, "lifecycle.recordError('telemetry_poll'", 'native BLE poll failure phase');
has(nativeAdapter, 'this.stopPolling(false)', 'native BLE polling restart keeps streams alive');
has(nativeAdapter, 'this.stopAllStreamLifecycles', 'native BLE disconnect stream cleanup');

has(ecoflowCloud, 'const activeEcoFlowCloudPollingSessions = new Map', 'EcoFlow cloud duplicate session guard');
has(ecoflowCloud, 'const streamLifecycle = new BluStreamLifecycle', 'EcoFlow cloud lifecycle startup');
has(ecoflowCloud, 'streamLifecycle.start()', 'EcoFlow cloud first-packet tracking');
has(ecoflowCloud, 'streamLifecycle.recordPacket', 'EcoFlow cloud packet freshness');
has(ecoflowCloud, 'streamLifecycle.recordError', 'EcoFlow cloud timeout/error tracking');
has(ecoflowCloud, "streamLifecycle.stop('cloud_polling_stopped')", 'EcoFlow cloud stream cleanup');

has(unifiedHook, "phase: 'awaitingTelemetry'", 'EcoFlow local BLE explicit telemetry wait phase');
has(unifiedHook, "phase: 'awaitingFirstPacket'", 'EcoFlow local BLE shared stream first-packet phase');
has(unifiedHook, "code: 'LOCAL_BLE_PARSER_UNAVAILABLE'", 'EcoFlow local BLE precise parser failure');
has(unifiedHook, "clearBluStreamHealthSnapshot(device.rawId, 'ecoflow')", 'EcoFlow local BLE stream cleanup');

has(obd2Adapter, 'private pidStreamLifecycle: BluStreamLifecycle | null = null', 'OBD2 stream lifecycle field');
has(obd2Adapter, 'this.pidStreamLifecycle = new BluStreamLifecycle', 'OBD2 stream lifecycle startup');
has(obd2Adapter, 'this.pidStreamLifecycle?.recordPacket(telemetry.timestamp)', 'OBD2 packet freshness');
has(obd2Adapter, "this.pidStreamLifecycle?.recordError(\n            'obd2_pid_polling'", 'OBD2 PID error phase');
has(obd2Adapter, "this.pidStreamLifecycle?.stop('pid_polling_stopped')", 'OBD2 stream cleanup');

console.log('BLU stream lifecycle reliability checks passed.');
