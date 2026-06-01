const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const doc = read('docs/blu-veepeak-reference-pipeline.md');
const bluTypes = read('lib/BluTypes.ts');
const envelope = read('lib/bluTelemetryEnvelope.ts');
const adapter = read('src/vehicle-telemetry/OBD2Adapter.ts');
const poller = read('src/vehicle-telemetry/OBD2PIDPoller.ts');
const vehicleTypes = read('src/vehicle-telemetry/VehicleTelemetryTypes.ts');
const store = read('src/vehicle-telemetry/VehicleTelemetryStore.ts');
const telemetryAdapters = read('src/telemetry/telemetryAdapters.ts');
const widget = read('components/dashboard/VehicleTelemetryWidget.tsx');
const renderers = read('components/dashboard/WidgetRenderers.tsx');

for (const section of [
  '# BLU VeePeak OBD2 Reference Pipeline',
  '## Shared BLU Telemetry Contract',
  '## Discovery',
  '## Connection',
  '## ELM327 Initialization',
  '## PID Polling',
  '## Stream Lifecycle',
  '## Stale Telemetry Detection',
  '## Store Update Path',
  '## UI Consumers',
  '## Disconnect Lifecycle',
  '## Reconnection Behavior',
  '## What Power Vendors Should Copy',
]) {
  assert(doc.includes(section), `reference doc must include ${section}`);
}

for (const marker of [
  'export type BluConnectionStatus',
  "'handshaking'",
  "'streaming'",
  "'timeout'",
  'export type BluTelemetryHealth',
  "'live'",
  "'recent'",
  "'stale'",
  "'unavailable'",
  "'mock'",
  'export type BluTelemetryEnvelopeSource',
  "'obd2'",
  'export type BluTelemetryEnvelope<TData extends Record<string, unknown> = Record<string, unknown>>',
]) {
  assert(bluTypes.includes(marker), `BLU types must include ${marker}`);
}

for (const marker of [
  'BLU_OBD2_REFERENCE_LIVE_AFTER_MS = 30_000',
  'BLU_OBD2_REFERENCE_STALE_AFTER_MS = 90_000',
  'buildObd2BluTelemetryEnvelope',
  'buildUnavailableBluTelemetryEnvelope',
  'mapVehicleConnectionStateToBluStatus',
  'resolveBluTelemetryHealth',
  'hasDecodedVehicleTelemetry',
  'getObd2BluTelemetryData',
  "source === 'mock_dev'",
  "telemetry.source === 'bluetooth_obd_live'",
  "provider === 'obd2'",
]) {
  assert(envelope.includes(marker), `BLU envelope helper must include ${marker}`);
}

assert(
  envelope.includes("import type {\n  NormalizedVehicleTelemetry") &&
    !envelope.includes("from '../src/vehicle-telemetry/OBD2Adapter'"),
  'BLU envelope helper must remain side-effect free and not import the OBD2 runtime adapter.',
);

for (const marker of [
  '/vee\\s*peak/i',
  '/veepeak/i',
  '/v\\s*peak/i',
  '/\\bvpake\\b/i',
  '/\\bvp\\s*11\\b/i',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
]) {
  assert(adapter.includes(marker), `OBD2 discovery/reference path must keep ${marker}`);
}

assert(adapter.includes('await mgr.connectToDevice(deviceId, {'), 'OBD2 connect must use native BLE connectToDevice.');
assert(adapter.includes('requestMTU: 512'), 'OBD2 connect must request 512 MTU.');
assert(adapter.includes('timeout: 15000'), 'OBD2 first connect timeout must remain 15000 ms.');
assert(adapter.includes('timeout: 10000'), 'OBD2 reconnect timeout must remain 10000 ms.');
assert(adapter.includes('MAX_RECONNECT_ATTEMPTS = 8'), 'OBD2 reconnect attempts must remain bounded at 8.');
assert(adapter.includes('await this.startPidTelemetry(deviceId)'), 'OBD2 connect must start PID telemetry.');
assert(
  adapter.indexOf('await this.startPidTelemetry(deviceId)') <
    adapter.indexOf("vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'connected')"),
  'OBD2 adapter must not mark connected before PID telemetry starts.',
);
assert(adapter.includes('vehicleTelemetryStore.clear()'), 'OBD2 disconnect must clear vehicle telemetry store.');

for (const marker of [
  "'ATZ'",
  "'ATE0'",
  "'ATL0'",
  "'ATS0'",
  "'ATH0'",
  "'ATSP0'",
  "'ATRV'",
  "pid: '0C'",
  "pid: '0D'",
  "pid: '05'",
  "pid: '04'",
  "pid: '2F'",
  "intervalMs: number = 2500",
  "source: 'bluetooth_obd_live'",
  'obd2_values: this.currentObd2Values',
]) {
  assert(poller.includes(marker), `OBD2 PID poller must keep ${marker}`);
}

assert(vehicleTypes.includes('obd2_values?: OBD2TelemetryValue[]'), 'Normalized vehicle telemetry must keep OBD2 per-PID values.');
assert(store.includes('const FRESH_WINDOW_MS = 30_000'), 'Vehicle telemetry store must keep 30 second live freshness window.');
assert(store.includes('const GRACE_WINDOW_MS = 90_000'), 'Vehicle telemetry store must keep 90 second stale grace window.');
assert(store.includes("inputSource === 'mock_dev'") && store.includes('!isDevMockTelemetryAllowed()'), 'Store must block production mock telemetry.');
assert(store.includes('vehicleTelemetryToEcsTelemetryEvents(telemetry)'), 'Store must bridge OBD2 telemetry into ECS telemetry events.');
assert(telemetryAdapters.includes('vehicleTelemetryToEcsTelemetryEvents'), 'ECS telemetry adapter must keep vehicle telemetry bridge.');
assert(widget.includes('vt.snapshot.isLive'), 'Vehicle telemetry widget must gate live display on normalized snapshot state.');
assert(renderers.includes("case 'vehicle-systems'"), 'Dashboard widget renderers must keep vehicle systems consumer.');

console.log('BLU VeePeak reference pipeline checks passed.');
