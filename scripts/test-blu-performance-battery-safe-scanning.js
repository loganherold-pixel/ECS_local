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

const config = read('lib/bluPerformanceConfig.ts');
const telemetryControl = read('src/vehicle-telemetry/TelemetryDiscoveryControl.ts');
const obd2Adapter = read('src/vehicle-telemetry/OBD2Adapter.ts');
const unifiedHook = read('lib/useUnifiedDeviceConnections.ts');
const ecoflowCloud = read('lib/ecoflowCloudConnection.ts');
const diagnosticsLog = read('lib/bluDiagnosticsLog.ts');
const powerTelemetryManager = read('src/power/telemetry/PowerTelemetryManager.ts');
const nativeBleAdapter = read('lib/createNativeBleBluAdapter.ts');

assert(
  config.includes('BLU_SCAN_WINDOW_MS = 10_000') &&
    config.includes('BLU_SCAN_COOLDOWN_MS = 5_000') &&
    config.includes('BLU_TELEMETRY_UI_UPDATE_MS = 750') &&
    config.includes('BLU_CLOUD_POLL_INTERVAL_MS = 15_000') &&
    config.includes('BLU_CLOUD_POLL_INTERVAL_MIN_MS = 10_000') &&
    config.includes('BLU_DEBUG_LOG_THROTTLE_MS = 2_000'),
  'BLU performance config must define battery-safe scan, UI, cloud, and debug throttles.',
);

assert(
  telemetryControl.includes('TELEMETRY_SCAN_THROTTLE_MS = BLU_SCAN_COOLDOWN_MS') &&
    telemetryControl.includes('TELEMETRY_SCAN_DEFAULT_DURATION_MS = BLU_SCAN_WINDOW_MS') &&
    telemetryControl.includes('TELEMETRY_SCAN_MAX_DURATION_MS = 30_000'),
  'OBD2 telemetry scan control must use bounded default windows and cooldowns.',
);

assert(
  obd2Adapter.includes('durationMs: number = TELEMETRY_SCAN_DEFAULT_DURATION_MS') &&
    obd2Adapter.includes('this.clearScanTimers()') &&
    obd2Adapter.includes('this.stopNativeDeviceScan('),
  'OBD2 scan lifecycle must use default scan windows and clean timers/native scans on teardown.',
);

assert(
  unifiedHook.includes('const UNIFIED_BLUETOOTH_SCAN_DURATION_MS = BLU_SCAN_WINDOW_MS') &&
    unifiedHook.includes('scanInFlightRef.current') &&
    unifiedHook.includes('SCANNER_SCAN_WINDOW_DEBOUNCE_MS') &&
    unifiedHook.includes("obd2Adapter.stopScan('unified_panel_unmount')") &&
    unifiedHook.includes("reason: 'debounced_scan_window'") &&
    !unifiedHook.includes('const UNIFIED_BLUETOOTH_SCAN_DURATION_MS = 60_000'),
  'Unified scanner must use the shared 10s scan window and suppress overlapping/manual repeat scans.',
);

assert(
  ecoflowCloud.includes('ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS = BLU_CLOUD_POLL_INTERVAL_MS') &&
    ecoflowCloud.includes('BLU_CLOUD_POLL_INTERVAL_MIN_MS') &&
    ecoflowCloud.includes('const existingSession = activeEcoFlowCloudPollingSessions.get(deviceId)') &&
    ecoflowCloud.includes('existingSession.replaceHandler(onTelemetry)') &&
    ecoflowCloud.includes('if (stopped || inFlight) return'),
  'EcoFlow cloud polling must be bounded, per-device, and must reuse existing sessions instead of duplicating loops.',
);

assert(
  diagnosticsLog.includes('DEFAULT_THROTTLE_MS = BLU_DEBUG_LOG_THROTTLE_MS') &&
    diagnosticsLog.includes('suppressedCount') &&
    diagnosticsLog.includes('isBluDebugEnabled()'),
  'BLU diagnostic logs must be gated and throttled by default.',
);

assert(
  powerTelemetryManager.includes('POWER_TELEMETRY_UI_UPDATE_MS = BLU_TELEMETRY_UI_UPDATE_MS') &&
    powerTelemetryManager.includes('private notifyTimer') &&
    powerTelemetryManager.includes('private flushNotifySubscribers') &&
    powerTelemetryManager.includes('this.notifySubscribers({ immediate: true })') &&
    powerTelemetryManager.includes('if (this.notifyTimer) return'),
  'Power telemetry subscribers must be throttled for UI updates while disconnect cleanup flushes immediately.',
);

assert(
  nativeBleAdapter.includes('const BLE_SCAN_DURATION_MS = BLU_SCAN_WINDOW_MS') &&
    nativeBleAdapter.includes('private scanPromise') &&
    nativeBleAdapter.includes('private lastScanFinishedAt') &&
    nativeBleAdapter.includes('native_ble_vendor_scan_suppressed_cooldown') &&
    nativeBleAdapter.includes('private async runScanForDevices'),
  'Native BLE vendor scans must reuse in-flight scan promises and enforce scan cooldowns.',
);

console.log('BLU performance and battery-safe scanning checks passed.');
