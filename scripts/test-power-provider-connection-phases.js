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

const adapters = read('lib/powerBrandConnectionAdapters.ts');
const hook = read('lib/useUnifiedDeviceConnections.ts');

for (const phase of [
  "'discovered'",
  "'connecting_native_transport'",
  "'discovering_services'",
  "'provider_handshake'",
  "'telemetry_setup'",
  "'streaming'",
  "'error'",
  "'disconnected'",
]) {
  assert(adapters.includes(phase), `power provider connection phases must include ${phase}`);
}

for (const method of [
  'canClassifyAdvertisement(advertisement',
  'discoverCapabilities(connection',
  'startTelemetry(',
  'stopTelemetry(connection',
]) {
  assert(adapters.includes(method), `provider adapter interface must expose ${method}`);
}

assert(
  adapters.includes('ecsProviderRegistry.fetchAllTelemetry()') &&
    adapters.includes('reading.provider === this.providerId') &&
    adapters.includes('reading.isLive === true') &&
    adapters.includes('reading.telemetryUnsupported !== true'),
  'provider connect success must require normalized live telemetry from the provider being connected',
);

assert(
  adapters.includes("errorCode: 'TELEMETRY_UNAVAILABLE'") &&
    adapters.includes('provider.stopPolling()') &&
    adapters.includes('await provider.disconnect().catch(() => undefined)'),
  'telemetry setup failure must stop polling, disconnect provider resources, and fail the connection',
);

assert(
  adapters.includes("'capability_error'") &&
    adapters.includes('did not receive decoded live telemetry'),
  'missing provider telemetry must be surfaced as a provider capability error',
);

assert(
  adapters.includes("`${this.displayName} is connected and decoded telemetry is streaming.`") &&
    adapters.includes("'telemetry_active'") &&
    adapters.includes("'streaming'"),
  'connected provider status must mean decoded telemetry is streaming',
);

assert(
  adapters.includes('Cloud authorization is not Bluetooth proof') &&
    adapters.includes('cloud-only here and does not prove local Bluetooth connectivity') &&
    adapters.includes('supportsBle: false') &&
    adapters.includes('supportsCloud: true'),
  'EcoFlow cloud-only adapter must not masquerade as a local BLE proof path',
);

assert(
  hook.includes("await genericBluetoothAccessoryManager.disconnect(device.rawId).catch(() => undefined)") &&
    hook.includes("setDeviceUiState(device.id, 'failed', capabilityError)") &&
    hook.includes('[BT_CONNECT] provider_capability_unavailable') &&
    !hook.includes('EcoFlow BLE connected; telemetry parser not yet decoded.'),
  'EcoFlow BLE fallback must not mark a battery connected when no telemetry handshake exists',
);

assert(
  adapters.includes('const unsubscribe = provider.onTelemetry(callback)') &&
    adapters.includes('return () => {') &&
    adapters.includes('unsubscribe();') &&
    adapters.includes('provider.stopPolling();'),
  'telemetry subscription cleanup must unsubscribe and stop provider polling',
);

console.log('Power provider connection phase checks passed.');
