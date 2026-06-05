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
  "'ecoflow'",
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

assert(adapters.includes('ApiRequiredPowerAdapter'), 'EcoFlow cloud scanner normalization must keep a cloud/API adapter path');
assert(adapters.includes("'api_required'"), 'adapter layer must expose API-required capability');
assert(adapters.includes("'capability_error'"), 'adapter layer must expose provider capability errors');
assert(adapters.includes("'connection_support_pending'"), 'adapter layer must expose connection-support-pending capability');
assert(adapters.includes("? 'Parser Pending'"), 'connection-support-pending rows must use the Bluestack parser-pending label');
assert(adapters.includes('getBluestackParserDecision'), 'adapter layer must read Bluestack parser promotion decisions');
assert(adapters.includes("errorCode: 'PARSER_PENDING'"), 'parser-pending brands must fail before provider handshakes');
assert(adapters.includes('parserAction: parserDecision.action'), 'parser-pending diagnostics must include parser action');
assert(adapters.includes('supportsLiveTelemetry: parserDecision.canDecodeLiveTelemetry'), 'adapter capabilities must follow parser decisions');
assert(adapters.includes('if (!parserDecision.canDecodeLiveTelemetry) return null;'), 'parser-pending brands must not normalize raw payloads into live telemetry');
assert(adapters.includes("source === 'cloud' || source === 'api' || source === 'ecoflow_cloud'"), 'scanner normalization must keep EcoFlow cloud payloads on the cloud adapter path');
assert(adapters.includes("source !== 'cloud' && source !== 'api' && source !== 'ecoflow_cloud'"), 'EcoFlow scanner normalization must not treat local raw BLE payloads as cloud telemetry');
assert(adapters.includes('telemetryUnsupportedReason: parserDecision.reason'), 'pending telemetry rows must expose the parser decision reason');
assert(adapters.includes('parserId: parserDecision.parserId'), 'pending telemetry rows must include parser identity metadata');
assert(adapters.includes('parserStatus: parserDecision.status'), 'pending telemetry rows must include parser status metadata');
assert(adapters.includes("errorCode: 'TELEMETRY_UNAVAILABLE'"), 'adapter layer must fail connection when telemetry setup does not produce live readings');
assert(adapters.includes('Cloud authorization is not Bluetooth proof'), 'EcoFlow cloud auth must not be presented as local Bluetooth proof');
assert(adapters.includes('provider.getLatestReadings?.()'), 'adapter layer must inspect first-poll snapshots before polling again');
assert(adapters.includes('await ecsProviderRegistry.fetchAllTelemetry().catch(() => [])'), 'adapter layer must retain a fresh-poll fallback');
assert(adapters.includes('if (provider.isPolling()) {\n        provider.stopPolling();'), 'unsupported telemetry cleanup must not stop inactive polling');
const telemetrySnapshotIndex = adapters.indexOf('const snapshotReadings = provider.getLatestReadings?.()');
const telemetryConfirmedPollingIndex = adapters.indexOf('provider.startPolling(15_000);', telemetrySnapshotIndex);
assert(
  telemetrySnapshotIndex >= 0 &&
    telemetryConfirmedPollingIndex > telemetrySnapshotIndex &&
    telemetryConfirmedPollingIndex > adapters.indexOf('if (!hasLiveTelemetry)', telemetrySnapshotIndex),
  'provider polling must start only after decoded live telemetry is confirmed',
);

const contract = read('lib/IEcsPowerProvider.ts');
assert(contract.includes('getLatestReadings?(): EcsNormalizedReading[]'), 'provider contract must expose optional no-poll reading snapshots');
const nativeProviders = read('lib/livePowerBleProviders.ts');
assert(nativeProviders.includes('getLatestReadings: (): EcsNormalizedReading[]'), 'native BLE providers must expose latest readings without polling');

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
  hook.includes('connect_blocked_by_bluestack_policy') &&
    hook.includes('getBluestackConnectionPolicy(device).canAttemptConnection'),
  'Bluestack readiness policy must block parser-pending rows from connect/batch selection',
);
assert(
  hook.includes("'Telemetry Active'"),
  'power UI must expose a clear telemetry-active state',
);

console.log('Power brand connection adapter checks passed.');
