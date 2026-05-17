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

const adapter = read('src/vehicle-telemetry/OBD2Adapter.ts');
const poller = read('src/vehicle-telemetry/OBD2PIDPoller.ts');
const types = read('src/vehicle-telemetry/VehicleTelemetryTypes.ts');
const store = read('src/vehicle-telemetry/VehicleTelemetryStore.ts');
const widget = read('components/dashboard/VehicleTelemetryWidget.tsx');

assert(
  adapter.indexOf("await this.startPidTelemetry(deviceId)") <
    adapter.indexOf("vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'connected')"),
  'OBD adapter must only mark connected after ELM/PID telemetry startup succeeds.',
);
assert(
  adapter.includes("vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'reading')"),
  'OBD adapter must expose the handshake/PID initialization phase as reading before connected.',
);
assert(
  adapter.includes('await mgr.cancelDeviceConnection(deviceId)') &&
    adapter.includes('return false;'),
  'OBD adapter must cancel native connection and fail cleanly when telemetry initialization fails.',
);
assert(
  adapter.includes('vehicleTelemetryStore.clear()'),
  'OBD adapter disconnect must clear/age live values instead of leaving stale live data current.',
);
assert(
  adapter.includes("throw new Error('OBD-II native transport is not connected.')"),
  'OBD PID startup must fail when native transport is unavailable.',
);
assert(
  adapter.includes("vehicleTelemetryService.signalReconnected(lastDeviceId)") &&
    adapter.indexOf('await this.startPidTelemetry(lastDeviceId)') <
      adapter.indexOf('vehicleTelemetryService.signalReconnected(lastDeviceId)'),
  'OBD reconnect must not signal connected before telemetry startup succeeds.',
);

for (const marker of [
  'ELM327_VERIFY_COMMANDS',
  'verifyAdapterReady',
  'NO_PID_DATA_MESSAGE',
  'await this.executePollCycle()',
  'if (this.lastDataAt <= 0)',
]) {
  assert(poller.includes(marker), `OBD PID poller must include ${marker}`);
}

for (const pid of ['0C', '0D', '05', '04', '11']) {
  assert(poller.includes(`pid: '${pid}'`), `OBD PID poller must support PID ${pid}`);
}
assert(poller.includes("'ATRV'"), 'OBD PID poller must read adapter/vehicle voltage with ATRV.');
assert(poller.includes("source: 'bluetooth_obd_live'"), 'OBD telemetry must be labeled as live Bluetooth OBD.');
assert(poller.includes('obd2_values: this.currentObd2Values'), 'OBD telemetry must include normalized per-PID values.');

for (const field of ['pid', 'label', 'value', 'unit', 'timestamp', 'sourceDeviceId', 'quality']) {
  assert(types.includes(`${field}:`), `OBD2TelemetryValue must include ${field}.`);
}
assert(types.includes('obd2_values?: OBD2TelemetryValue[]'), 'Normalized telemetry must carry per-PID OBD values.');

assert(
  store.includes("inputSource === 'mock_dev'") && store.includes('!isDevMockTelemetryAllowed()'),
  'Vehicle telemetry store must still block production mock telemetry.',
);
assert(
  widget.includes('vt.snapshot.isLive') && widget.includes('buildVehicleTelemetryMetrics(vt.snapshot)'),
  'Vehicle telemetry widgets must render from normalized live snapshot data.',
);

console.log('OBD2 live pipeline checks passed.');
