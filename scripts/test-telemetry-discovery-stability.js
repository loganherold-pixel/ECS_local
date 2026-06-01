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

const control = read('src/vehicle-telemetry/TelemetryDiscoveryControl.ts');
for (const status of [
  'not_configured',
  'scanning',
  'connected',
  'reconnecting',
  'unavailable',
  'permission_required',
  'error',
]) {
  assert(control.includes(`| '${status}'`) || control.includes(`'${status}'`), `Telemetry source status must include ${status}`);
}
assert(control.includes('TELEMETRY_SCAN_THROTTLE_MS'), 'Telemetry discovery must define a scan throttle window');
assert(control.includes('normalizeTelemetryScanDurationMs'), 'Telemetry discovery must clamp scan duration');
assert(control.includes('mapObdStateToTelemetrySourceStatus'), 'Telemetry discovery must centralize OBD source status mapping');
assert(control.includes(": 'not_configured'"), 'Idle unconfigured telemetry must map to not_configured');
assert(control.includes("return 'permission_required'"), 'Permission failures must map to permission_required');

const adapter = read('src/vehicle-telemetry/OBD2Adapter.ts');
assert(adapter.includes("type TelemetryScanTrigger"), 'OBD adapter must accept explicit scan trigger types');
assert(adapter.includes('sourceStatus: TelemetrySourceStatus'), 'OBD adapter status must expose sourceStatus');
assert(adapter.includes('scanStartedAt: number | null'), 'OBD adapter status must expose scanStartedAt');
assert(adapter.includes('lastScanFinishedAt: number | null'), 'OBD adapter status must expose lastScanFinishedAt');
assert(adapter.includes('lastScanTrigger: TelemetryScanTrigger | null'), 'OBD adapter status must expose lastScanTrigger');
assert(adapter.includes("trigger: TelemetryScanTrigger = 'user_open_tools'"), 'OBD scans must default to user-opened tools');
assert(adapter.includes('isTelemetryScanThrottleActive'), 'OBD scans must be throttled');
assert(adapter.includes("reason: 'scan_throttled'"), 'Throttled scans must be represented as a quiet diagnostic');
assert(adapter.includes('finishScanLifecycle'), 'OBD scan lifecycle must be finalized on early failures');
assert(adapter.includes('if (this.isDestroyed || this.scanSessionId !== scanSessionId'), 'OBD scan callbacks must ignore stale/unmounted sessions');
assert(adapter.includes('if (this.resumeReconnectTimer)'), 'App-resume reconnect timers must be cancelable');
assert(adapter.includes('ECS_DEBUG_TELEMETRY_SCAN'), 'High-frequency telemetry scan logs must be behind an explicit debug flag');
assert(adapter.includes('ecsLog.dev'), 'High-frequency telemetry scan logs must use the dev logger');
assert(adapter.includes('ecsLog.warnOnce'), 'Repeated scan warnings must be deduped');
assert(adapter.includes('HIGH_FREQUENCY_SCAN_WARNINGS'), 'High-frequency scan warnings must be downgraded to debug diagnostics');

const bridge = read('src/vehicle-telemetry/VehicleTelemetryAdapterBridge.ts');
assert(bridge.includes("import { ecsLog } from '../../lib/ecsLogger';"), 'Telemetry adapter bridge must use the ECS logger');
assert(bridge.includes("ecsLog.debug('TELEMETRY'"), 'Telemetry adapter bridge debug output must route through ecsLog.debug');
assert(bridge.includes("ecsLog.warn('TELEMETRY'"), 'Telemetry adapter bridge warnings must route through ecsLog.warn');
assert(!bridge.includes('console.log('), 'Telemetry adapter bridge must not emit direct console.log output');
assert(!bridge.includes('console.warn('), 'Telemetry adapter bridge must not emit direct console.warn output');
assert(!bridge.includes('console.error('), 'Telemetry adapter bridge must not emit direct console.error output');
assert(bridge.includes('if (!this.debug) return;'), 'Telemetry adapter bridge routine logs must remain gated by the debug option');

const scannerHook = read('src/vehicle-telemetry/useOBD2Scanner.ts');
assert(scannerHook.includes('sourceStatus: TelemetrySourceStatus'), 'OBD scanner hook must expose sourceStatus');
assert(scannerHook.includes('mountedRef.current'), 'OBD scanner hook must guard state updates after unmount');
assert(scannerHook.includes("obd2Adapter.startScan(durationMs, 'user_open_tools')"), 'Hook startScan must mark scans as user-opened');

const unified = read('lib/useUnifiedDeviceConnections.ts');
assert(unified.includes('const rescan = useCallback(async () => {'), 'Unified device connection panel must keep manual rescan entry point');
assert(unified.includes('SCANNER_SCAN_WINDOW_DEBOUNCE_MS'), 'Unified device connection panel must debounce manual scan windows');
assert(unified.includes('scanInFlightRef.current'), 'Unified device connection panel must suppress overlapping scans');
assert(unified.includes('mountedRef.current') && unified.includes("obd2Adapter.stopScan('unified_panel_unmount')"), 'Unified scanner must cancel OBD scanning on panel unmount');
assert(!/useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]{0,240}startScan\(/.test(unified), 'Unified scanner must not start scanning from a mount/render effect');

console.log('Telemetry discovery stability checks passed.');
