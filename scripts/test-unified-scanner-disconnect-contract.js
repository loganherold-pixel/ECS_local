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
const contract = read('lib/unifiedScannerContract.ts');
const powerScreen = read('app/power/blu.tsx');
const telemetryManager = read('src/power/telemetry/PowerTelemetryManager.ts');
const brandAdapters = read('lib/powerBrandConnectionAdapters.ts');
const genericManager = read('lib/genericBluetoothAccessoryManager.ts');
const obd2Adapter = read('src/vehicle-telemetry/OBD2Adapter.ts');
const bleConnector = read('src/power/connectors/BleConnector.ts');

assert(
  hook.includes("disconnectDevice: (deviceId: string, reason?: string) => Promise<void>"),
  'unified hook contract must expose canonical disconnectDevice(deviceId, reason?)',
);
assert(
  hook.includes("const disconnectInFlightRef = useRef<Set<string>>(new Set())") &&
    hook.includes('disconnectInFlightRef.current.has(device.id)') &&
    hook.includes('disconnectInFlightRef.current.delete(device.id)'),
  'unified disconnect must guard duplicate taps and release the guard in finally',
);
assert(
  hook.includes("setDeviceUiState(device.id, 'disconnecting', null)") &&
    hook.includes("await stopScan('disconnect_attempt')"),
  'unified disconnect must enter disconnecting state and stop active scans before cleanup',
);
assert(
  hook.includes('provider?.stopPolling()') &&
    hook.includes('await provider?.disconnect()') &&
    hook.includes('await genericBluetoothAccessoryManager.disconnect(device.rawId)') &&
    hook.includes('await adapter.disconnect({') &&
    hook.includes('await disconnectProvider()'),
  'unified disconnect must route power, EcoFlow cloud/BLE, generic BLE, and OBD2 through real disconnect paths',
);
assert(
  hook.includes("await bluDeviceRegistry.updateConnectionState(providerId, device.rawId, 'disconnected')") &&
    hook.includes('await bluDeviceRegistry.clearPrimary(providerId)') &&
    hook.includes("await updateManagedPowerOwnershipState(\n          providerId,\n          device.rawId,\n          'disconnected'") &&
    hook.includes('powerTelemetryManager.clearDisconnectedDevice()'),
  'power disconnect must clear registry ownership and stale telemetry after native/provider disconnect',
);
assert(
  contract.includes("device.actionKind === 'disconnecting'") &&
    contract.includes("case 'disconnecting':\n      return 'disconnecting'"),
  'scanner normalization must preserve disconnecting in canonical scanner state',
);
assert(
  powerScreen.includes("case 'disconnecting':\n      return 'Disconnecting...'") &&
    powerScreen.includes("device.actionKind === 'disconnecting'"),
  'device connection UI must render a stable disconnecting action state',
);
assert(
  telemetryManager.includes('clearDisconnectedDevice(deviceId?: string | null)') &&
    telemetryManager.includes('this.current = null') &&
    telemetryManager.includes('this.notifySubscribers()'),
  'power telemetry manager must notify widgets when disconnect clears stale live values',
);
assert(
  brandAdapters.includes('provider?.stopPolling()') &&
    brandAdapters.includes('await provider?.disconnect()'),
  'power brand adapters must stop provider polling before disconnect',
);
assert(
  genericManager.includes("connectionState: 'disconnecting'") &&
    genericManager.includes('manager.cancelDeviceConnection(deviceId)') &&
    genericManager.includes('manager.isDeviceConnected?.(deviceId)') &&
    genericManager.includes('throw error'),
  'generic BLE manager must mark disconnecting, call native cancel, verify native state, and surface failures',
);
assert(
  obd2Adapter.includes('private disconnectSubscription') &&
    obd2Adapter.includes('this.removeDisconnectionMonitor()') &&
    obd2Adapter.includes('this.stopPidTelemetry()') &&
    obd2Adapter.includes('vehicleTelemetryService.stopPolling()') &&
    obd2Adapter.includes('await mgr.cancelDeviceConnection(deviceId)') &&
    obd2Adapter.includes("this.clearPendingElmCommand(new Error('OBD-II telemetry stopped.'))"),
  'OBD2 disconnect must stop polling, monitors, pending commands, native connection, and disconnect listeners',
);
assert(
  bleConnector.includes('this.setState("disconnecting")') &&
    bleConnector.includes('this.removeDisconnectionMonitor()') &&
    bleConnector.includes('await mgr.cancelDeviceConnection(this.connectedDeviceId!)') &&
    bleConnector.includes('Device remained connected after disconnect request'),
  'BLE power connector must expose real disconnecting cleanup and native cancellation',
);

console.log('Unified scanner disconnect contract checks passed.');
