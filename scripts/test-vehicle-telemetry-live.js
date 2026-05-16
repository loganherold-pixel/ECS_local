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

const centralTypes = read('src/types/telemetry.ts');
const types = read('src/vehicle-telemetry/VehicleTelemetryTypes.ts');
for (const source of [
  'bluetooth_obd_live',
  'native_vehicle_live',
  'manual',
  'cache',
  'unavailable',
  'mock_dev',
]) {
  assert(centralTypes.includes(`'${source}'`), `vehicle telemetry source must include ${source}`);
}
for (const sourceType of [
  'obd_live',
  'ble_live',
  'device_sensor',
  'blu_power_live',
  'manual',
  'cached',
  'simulated',
  'unavailable',
]) {
  assert(centralTypes.includes(`'${sourceType}'`), `ECS telemetry sourceType must include ${sourceType}`);
}
assert(centralTypes.includes('VehicleTelemetrySnapshot'), 'normalized vehicle telemetry snapshot type must exist');
assert(centralTypes.includes('freshness: ECSTelemetryFreshness'), 'snapshot must include normalized freshness');
assert(centralTypes.includes('confidence: ECSTelemetryConfidence'), 'snapshot must include normalized confidence');
assert(centralTypes.includes('warnings: VehicleTelemetryWarning[]'), 'snapshot must include warnings');
assert(types.includes('TelemetryConnectionState'), 'telemetry connection state contract must exist');
assert(types.includes('source?: VehicleTelemetrySource'), 'normalized OBD telemetry must carry an explicit live source when available');

const store = read('src/vehicle-telemetry/VehicleTelemetryStore.ts');
for (const marker of [
  '[VEHICLE_TELEMETRY] source_selected',
  '[VEHICLE_TELEMETRY] mock_blocked',
  '[VEHICLE_TELEMETRY] live_update',
  '[OBD2] telemetry_store_updated',
  '[VEHICLE_TELEMETRY] cache_used',
  '[VEHICLE_TELEMETRY] unavailable',
]) {
  assert(store.includes(marker), `vehicle telemetry store must log ${marker}`);
}
assert(
  store.includes("inputSource === 'mock_dev'") && store.includes('!isDevMockTelemetryAllowed()'),
  'vehicle telemetry store must reject disabled mock_dev telemetry',
);
assert(
  store.includes("source: 'cache'") && store.includes("source: 'unavailable'"),
  'vehicle telemetry store must expose cache and unavailable source states',
);
assert(
  store.includes('Connected — telemetry not yet decoded'),
  'vehicle telemetry store must expose truthful connected-not-decoded state',
);

const widget = read('components/dashboard/VehicleTelemetryWidget.tsx');
const renderers = read('components/dashboard/WidgetRenderers.tsx');
const sourceStateHelper = read('lib/telemetrySourceState.ts');
assert(widget.includes('[VEHICLE_TELEMETRY_WIDGET] render'), 'vehicle telemetry widget must log source-aware render state');
assert(widget.includes('vt.snapshot.isLive'), 'vehicle telemetry widget must gate live display on snapshot.isLive');
assert(widget.includes('resolveTelemetrySourceState'), 'vehicle telemetry widget must use shared telemetry source-state labels');
assert(widget.includes('buildVehicleTelemetryMetrics(vt.snapshot).slice(0, 2)'), 'compact vehicle telemetry must display available normalized snapshot fields only');
assert(!widget.includes('formatBatteryVoltage(vt.summary.battery_voltage)'), 'compact vehicle telemetry must not read legacy summary battery values');
assert(!widget.includes('formatFuelLevel(vt.summary.fuel_level)'), 'compact vehicle telemetry must not read legacy summary fuel values');
assert(renderers.includes("case 'vehicle-systems': return <VehicleTelemetryCompact />;"), 'Vehicle Systems tile must render the normalized telemetry compact widget');
assert(
  renderers.includes("case 'vehicle-systems': return <VehicleTelemetryDetailView onClose={options?.onCloseDetail} />;"),
  'Vehicle Systems detail must open the telemetry detail panel',
);
assert(sourceStateHelper.includes("obd_live: 'OBD Live'"), 'source-state helper must label OBD live telemetry compactly');
assert(sourceStateHelper.includes("return buildState('Recent'"), 'source-state helper must distinguish recent telemetry from live');
assert(sourceStateHelper.includes("return buildState('Stale'"), 'source-state helper must distinguish stale telemetry from live');
assert(sourceStateHelper.includes("return buildState('Manual'"), 'source-state helper must distinguish manual telemetry from live');
assert(sourceStateHelper.includes("return buildState('Simulation'"), 'source-state helper must distinguish simulated telemetry from live');
assert(widget.includes('Connected — telemetry not yet decoded'), 'vehicle telemetry widget must show connected-not-decoded state');
assert(!widget.includes("scanner.isConnected && vt.hasData) {\n    return { label: 'TELEMETRY LIVE'"), 'widget must not mark generic hasData as live');

const adapter = read('src/vehicle-telemetry/OBD2Adapter.ts');
for (const marker of [
  '[OBD_SCAN]',
  '[OBD_CONNECT]',
  '[OBD2]',
  'device_discovered',
  'connect_start',
  'init_start',
  'init_success',
  'telemetry_received',
  'connect_error',
  'classified',
  'services_discovered',
  'notifications_subscribed',
  'telemetry_decoded',
  'unsupported',
  'failure',
]) {
  assert(adapter.includes(marker), `OBD adapter must log ${marker}`);
}
assert(
  adapter.includes("const failedState = /transport|characteristic|service|unsupported/i.test(unsupportedReason)") &&
    adapter.includes("vehicleTelemetryService.updateDeviceConnectionState(deviceId, failedState)"),
  'OBD adapter must classify unsupported transport separately from no-data handshake failure',
);
assert(
  adapter.includes('vehicleTelemetryService.changePrimaryDevice(deviceId)'),
  'connected OBD2 devices must become the primary telemetry source so live readings are not ignored',
);
assert(
  adapter.includes('/vee\\s*peak/i') && adapter.includes('/veepeak/i') && adapter.includes('/v\\s*peak/i'),
  'OBD adapter must support V Peak and Veepeak naming variants',
);
assert(
  adapter.includes('return true;') && adapter.includes('await this.startPidTelemetry(deviceId)'),
  'OBD adapter must connect before attempting live telemetry reads',
);

const pidPoller = read('src/vehicle-telemetry/OBD2PIDPoller.ts');
assert(
  pidPoller.includes("source: 'bluetooth_obd_live'"),
  'OBD PID poller must mark decoded telemetry as bluetooth_obd_live',
);

const unified = read('lib/useUnifiedDeviceConnections.ts');
assert(unified.includes("type DeviceCategory = 'telemetry' | 'obd' | 'sensor' | 'power' | 'unknown'"), 'unified device model must expose required device categories');
assert(unified.includes("deviceCategory: 'obd'"), 'OBD scanner rows must be categorized as obd');
assert(unified.includes("deviceCategory: 'power'"), 'power rows must be categorized as power');
assert(unified.includes("deviceCategory: kind === 'sensor' ? 'sensor' : 'unknown'"), 'unknown scanner rows must remain visible with unknown category');
assert(unified.includes('vehicleTelemetrySnapshot.isLive'), 'unified device connections must use the live telemetry snapshot');
assert(unified.includes('Classic Bluetooth OBD2 discovery is not available in this runtime'), 'unified scanner must surface unsupported Classic Bluetooth OBD2 discovery clearly');

console.log('Vehicle telemetry live wiring checks passed.');
