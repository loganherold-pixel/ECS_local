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

for (const method of [
  'canClassifyAdvertisement(advertisement',
  'canHandle(device',
  'connect(device',
  'discoverCapabilities(connection',
  'startTelemetry(',
  'stopTelemetry(connection',
  'disconnect(device',
  'readStatus(device',
  'subscribeTelemetry',
  'normalizeTelemetry(raw',
]) {
  assert(adapters.includes(method), `power brand adapter contract must include ${method}`);
}

for (const providerId of [
  "'bluetti'",
  "'anker_solix'",
  "'jackery'",
  "'goal_zero'",
  "'renogy'",
  "'redarc'",
  "'dakota_lithium'",
]) {
  assert(adapters.includes(providerId), `power brand adapter registry must include ${providerId}`);
}

assert(adapters.includes('ApiRequiredPowerAdapter'), 'EcoFlow must remain routed through the API/hybrid adapter path');
assert(adapters.includes("'api_required'"), 'adapter layer must expose API-required capability');
assert(adapters.includes("'capability_error'"), 'adapter layer must expose provider capability errors');
assert(adapters.includes("'connection_support_pending'"), 'adapter layer must expose connection-support-pending capability');
assert(adapters.includes("errorCode: 'TELEMETRY_UNAVAILABLE'"), 'adapter layer must fail connection when telemetry setup does not produce live readings');
assert(adapters.includes('Cloud authorization is not Bluetooth proof'), 'EcoFlow cloud auth must not be presented as local Bluetooth proof');

for (const canonicalField of [
  'batteryPercent',
  'inputWatts',
  'outputWatts',
  'temperatureCelsius',
  'batteryVolts',
  'batteryAmps',
  'solarInputWatts',
  'chargingState',
]) {
  assert(adapters.includes(canonicalField), `normalizeTelemetry must map ${canonicalField}`);
}

const hook = read('lib/useUnifiedDeviceConnections.ts');
assert(
  hook.includes('getPowerBrandConnectionAdapterForDevice') &&
    hook.includes('getPowerBrandConnectionStatus'),
  'unified scanner must use the power brand adapter registry',
);
assert(
  hook.includes('adapter.connect({') &&
    hook.includes('adapter.disconnect({'),
  'unified scanner power connect/disconnect must route through the adapter contract',
);
assert(
  hook.includes("actionKind = 'none';") &&
    hook.includes('actionLabel = support.supportLabel'),
  'unsupported power brands must render a clear non-connectable state instead of crashing',
);
assert(
  hook.includes("'Telemetry Active'"),
  'power UI must expose a clear telemetry-active state',
);

console.log('Power brand connection adapter checks passed.');
