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

function lacks(content, needle, label) {
  assert(!content.includes(needle), `${label} must not include ${needle}`);
}

const bluTypes = read('lib/BluTypes.ts');
const bluStore = read('lib/BluStateStore.ts');
const nativeAdapter = read('lib/createNativeBleBluAdapter.ts');
const providerRegistry = read('lib/EcsProviderRegistry.ts');
const telemetryStore = read('src/telemetry/ECSTelemetryStore.ts');
const powerManager = read('src/power/telemetry/PowerTelemetryManager.ts');
const unifiedHook = read('lib/useUnifiedDeviceConnections.ts');
const ecoFlowAdapter = read('lib/EcoFlowBluAdapter.ts');

has(bluTypes, "export type BluMultiDeviceCapability", 'BLU shared types');
has(bluTypes, "export interface BluStreamState", 'BLU shared stream state');
has(bluTypes, "multiDeviceCapability: BluMultiDeviceCapability", 'BLU capability status');

has(powerManager, 'private currentByDeviceId: Map<string, PowerTelemetry>', 'canonical power manager per-device map');
has(powerManager, 'getCurrentByDeviceId(deviceId: string)', 'canonical power manager per-device accessor');
has(powerManager, 'getAllCurrentByDeviceId()', 'canonical power manager per-device snapshot accessor');
has(powerManager, 'subscribeAll(cb: TelemetryByDeviceSubscriber)', 'canonical power manager per-device subscription');
has(powerManager, 'this.currentByDeviceId.delete(deviceId)', 'canonical power disconnect is per device');
has(powerManager, "existing.device?.vendor", 'canonical power disconnect passes provider identity');

has(bluStore, 'private telemetryCache = new Map<DeviceKey, BluTelemetry>()', 'BLU store per-device telemetry cache');
has(bluStore, 'clearDeviceTelemetry(', 'BLU store per-device disconnect cleanup');
has(bluStore, "ecsTelemetryStore.markDeviceUnavailable(deviceId, 'power_device', reason, provider)", 'BLU store provider-keyed unavailable marker');
lacks(bluStore, "'non_primary_device'", 'BLU store telemetry validation');
lacks(bluStore, "'stale_session_primary'", 'BLU store telemetry validation');
lacks(bluStore, 'primary.provider !== provider || primary.device_id !== deviceId', 'BLU store telemetry validation');

has(providerRegistry, 'function makeReadingKey(provider: BluProviderId, deviceId: string)', 'provider registry per-provider cache key');
has(providerRegistry, 'makeReadingKey(normalizedReading.provider, normalizedReading.deviceId)', 'provider registry writes provider-keyed readings');
has(providerRegistry, 'getDeviceReading(deviceId: string, providerId?: BluProviderId)', 'provider registry provider-qualified lookup');
has(providerRegistry, 'makeReadingKey(providerId, deviceId)', 'provider registry provider lookup key');

has(telemetryStore, "`${event.sourceType}:${event.provider}:${event.sourceDeviceId}:${event.metricKey}`", 'unified telemetry metric key includes provider');
has(telemetryStore, "`${metric.sourceType}:${metric.provider}:${metric.sourceDeviceId}`", 'unified telemetry device key includes provider');
has(telemetryStore, 'sameTelemetryDevice(', 'unified telemetry provider-scoped cleanup');

has(nativeAdapter, 'activeDeviceIds: string[]', 'native BLE state active device ids');
has(nativeAdapter, 'telemetryByDeviceId: Record<string, BluTelemetry>', 'native BLE state telemetry map');
has(nativeAdapter, 'streamsByDeviceId: Record<string, BluStreamState>', 'native BLE state stream map');
has(nativeAdapter, "multiDeviceCapability: 'limited'", 'native BLE explicit capability limitation');
has(nativeAdapter, 'NATIVE_BLE_MULTI_DEVICE_LIMITATION_REASON', 'native BLE limitation reason');
has(nativeAdapter, 'native_ble_vendor_single_connection_replace', 'native BLE replacement logging');
has(nativeAdapter, 'native_ble_vendor_connect_all_limited', 'native BLE connect-all limitation logging');
has(nativeAdapter, 'this.telemetryByDeviceId.delete(previousDeviceId)', 'native BLE previous-device telemetry cleanup');
has(nativeAdapter, 'this.telemetryByDeviceId.clear()', 'native BLE disconnect clears provider-local streams');

has(unifiedHook, 'multiDeviceCapability?: BluMultiDeviceCapability', 'unified scanner exposes device capability');
has(unifiedHook, "const multiDeviceCapability: BluMultiDeviceCapability = isEcoFlowCloudDevice ? 'supported' : 'limited'", 'unified scanner marks EcoFlow cloud multi-device support');
has(unifiedHook, "powerTelemetryManager.clearDisconnectedDevice(device.rawId)", 'unified scanner disconnect clears only one power device');
lacks(unifiedHook, 'powerTelemetryManager.clearDisconnectedDevice()', 'unified scanner must not clear all power telemetry on single-device disconnect');
has(unifiedHook, 'Vehicle telemetry currently supports one active OBD2 adapter', 'unified scanner documents OBD2 one-adapter limitation');

has(ecoFlowAdapter, 'non-primary EcoFlow devices can update their own cache entry', 'EcoFlow adapter accepts per-device telemetry');
lacks(ecoFlowAdapter, 'Stale EcoFlow polling target ignored', 'EcoFlow adapter must not reject non-primary per-device polls');
lacks(ecoFlowAdapter, 'Stale EcoFlow telemetry response ignored', 'EcoFlow adapter must not reject non-primary responses');

console.log('BLU multi-device connection manager checks passed.');
