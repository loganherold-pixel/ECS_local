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

const hook = read('lib/useUnifiedDeviceConnections.ts');
const vtHook = read('src/vehicle-telemetry/useVehicleTelemetry.ts');
const vtScannerHook = read('src/vehicle-telemetry/useOBD2Scanner.ts');
const vtService = read('src/vehicle-telemetry/VehicleTelemetryService.ts');
const obd2Adapter = read('src/vehicle-telemetry/OBD2Adapter.ts');
const genericManager = read('lib/genericBluetoothAccessoryManager.ts');
const bleConnector = read('src/power/connectors/BleConnector.ts');
const nativeBleAdapter = read('lib/createNativeBleBluAdapter.ts');
const legacyPowerAdapters = [
  'lib/AnkerSolixBluAdapter.ts',
  'lib/BluettiBluAdapter.ts',
  'lib/EcoFlowBluAdapter.ts',
  'lib/GoalZeroBluAdapter.ts',
  'lib/JackeryBluAdapter.ts',
  'lib/RenogyBluAdapter.ts',
].map((file) => ({ file, source: read(file) }));

assert(
  hook.includes('const manualDisconnectRequestedRef = useRef<Record<string, boolean>>({})') &&
    hook.includes('function getManualDisconnectGuardKeys') &&
    hook.includes('const hasManualDisconnectRequest = useCallback') &&
    hook.includes('manualDisconnectRequestedRef.current[device.id] = true') &&
    hook.includes('manualDisconnectRequestedRef.current[device.id] === true') &&
    hook.includes('auto_reconnect_skipped_manual_disconnect') &&
    hook.includes('delete manualDisconnectRequestedRef.current[device.id]'),
  'Unified scanner must keep per-device and raw/provider manual disconnect guards, skip saved auto-reconnect, and clear them only for explicit reconnects.',
);

assert(
  hook.includes("setDeviceUiState(device.id, 'disconnecting', null)") &&
    hook.includes("await stopScan('disconnect_attempt')") &&
    hook.includes('disconnectInFlightRef.current.delete(device.id)') &&
    hook.includes('updateBusy(device.id, false)'),
  'Manual disconnect must enter disconnecting state, stop active scans, and release UI/busy guards in finally.',
);

assert(
  hook.includes('await disconnectProvider()') &&
    hook.includes("clearBluStreamHealthSnapshot(device.rawId, 'obd2')") &&
    hook.includes('powerTelemetryManager.clearDisconnectedDevice(device.rawId)') &&
    hook.includes('await genericBluetoothAccessoryManager.disconnect(device.rawId)') &&
    hook.includes('await adapter.disconnect({'),
  'Disconnect must clean the selected OBD2, power, EcoFlow/local BLE, and generic BLE paths without global teardown.',
);

assert(
  vtHook.includes('vehicleTelemetryService.disconnect({ manualDisconnectRequested: true })') &&
    vtHook.includes('vehicleTelemetryStore.clear()') &&
    !vtHook.includes('vehicleTelemetryService.removeDevice(device.device_id)'),
  'Vehicle telemetry hook disconnect must use the service lifecycle, clear live telemetry, and preserve saved devices.',
);

assert(
  vtScannerHook.includes('vehicleTelemetryService.disconnect({ manualDisconnectRequested: true })'),
  'OBD2 scanner hook disconnect must route through the telemetry service lifecycle.',
);

assert(
  vtService.includes('private manualDisconnectRequested = false') &&
    vtService.includes('this.clearRetryTimer()') &&
    vtService.includes('this.stopHeartbeat()') &&
    vtService.includes('vehicleTelemetryStore.setReconnecting(false)') &&
    vtService.includes('if (!this.started || this.manualDisconnectRequested) return') &&
    vtService.includes('manualDisconnectRequested ? \'user_disconnect\' : \'disconnect\''),
  'Vehicle telemetry service must cancel reconnect/heartbeat state and block retry timers during manual disconnect.',
);

assert(
  hook.includes('hasManualDisconnectRequest(device)') &&
    hook.includes("connectDevice(candidate.id, 'saved_auto_reconnect')") &&
    hook.includes("bluLog('[BLU_RECONNECT]', 'saved_power_auto_reconnect_attempt'"),
  'Saved power auto-reconnect must only run after checking the manual-disconnect guard.',
);

assert(
  obd2Adapter.includes('private manualDisconnectRequested = false') &&
    obd2Adapter.includes('this.cancelReconnect()') &&
    obd2Adapter.includes('this.stopHealthCheck()') &&
    obd2Adapter.includes('this.stopPidTelemetry()') &&
    obd2Adapter.includes('this.removeDisconnectionMonitor()') &&
    obd2Adapter.includes("sSet(OBD2_STORAGE_KEYS.AUTO_RECONNECT, 'false')") &&
    obd2Adapter.includes('await mgr.cancelDeviceConnection(deviceId)') &&
    obd2Adapter.includes('await mgr.isDeviceConnected(deviceId).catch(() => false)') &&
    obd2Adapter.includes('OBD-II adapter remained connected after disconnect request.'),
  'OBD2 adapter disconnect must stop reconnect loops, stream timers, subscriptions, native BLE, and verify release.',
);

assert(
  genericManager.includes("connectionState: 'disconnecting'") &&
    genericManager.includes('manager.cancelDeviceConnection(deviceId)') &&
    genericManager.includes('manager.isDeviceConnected?.(deviceId)') &&
    genericManager.includes('throw error'),
  'Generic BLE manager must mark disconnecting, cancel the selected device, verify native release, and surface failures.',
);

assert(
  nativeBleAdapter.includes('private manualDisconnectRequested = false') &&
    nativeBleAdapter.includes('this.manualDisconnectRequested = true') &&
    nativeBleAdapter.includes('native_ble_vendor_reconnect_skipped_manual_disconnect') &&
    nativeBleAdapter.includes('native_ble_vendor_reconnect_schedule_skipped_manual_disconnect'),
  'Native BLE power adapters must keep manual disconnect from being treated as an abrupt drop that starts reconnect.',
);

for (const { file, source } of legacyPowerAdapters) {
  assert(
    source.includes('private manualDisconnectRequested = false') &&
      source.includes('this.manualDisconnectRequested = true') &&
      source.includes('this.manualDisconnectRequested = false') &&
      source.includes('if (this.manualDisconnectRequested) return') &&
      source.includes('if (this.manualDisconnectRequested) {\n        this.cancelReconnect();'),
    `${file} must suppress pending quiet reconnect work after a manual disconnect.`,
  );
}

assert(
  bleConnector.includes('this.setState("disconnecting")') &&
    bleConnector.includes('this.removeDisconnectionMonitor()') &&
    bleConnector.includes('await mgr.cancelDeviceConnection(this.connectedDeviceId!)') &&
    bleConnector.includes('Device remained connected after disconnect request'),
  'Power BLE connector must clear subscriptions and verify native disconnect.',
);

console.log('BLU disconnect cleanup and reconnect guards passed.');
