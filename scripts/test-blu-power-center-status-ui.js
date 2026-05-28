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

const hook = read('lib/useUnifiedDeviceConnections.ts');
const screen = read('app/power/blu.tsx');
const providers = read('lib/useEcsProviders.ts');

for (const field of [
  'connectionSourceLabel: string',
  'statusPillLabel: string',
  'lastTelemetryAt: number | null',
  'diagnosticReason: string | null',
  'telemetryFields: Array<',
]) {
  has(hook, field, 'unified connection model');
}

for (const label of [
  "return 'Local BLE'",
  "return 'Cloud API'",
  "return 'Hybrid'",
  "return 'OBD2'",
  "return 'Mock'",
  "return 'Unknown'",
  "return 'Awaiting Data'",
  "return 'Auth Required'",
  "return 'Cloud Polling'",
]) {
  has(hook, label, 'truthful BLU status/source mapping');
}

has(hook, 'getBluStreamHealthSnapshot(rawId, providerId)', 'power device stream health lookup');
has(hook, 'getBluStreamHealthSnapshot(rawId, \'obd2\')', 'OBD2 stream health lookup');
has(hook, 'telemetryUnsupported:', 'awaiting data gating');
has(hook, "if (isLive) return 'Telemetry Active';", 'EcoFlow live status should override stale parser-pending diagnostics');
assert(
  hook.indexOf("if (args.isLive && args.telemetrySource === 'provider_cloud')") <
    hook.indexOf('if (args.ecoflowDiagnostic?.diagnosticReason)'),
  'decoded EcoFlow cloud telemetry should be described as current before local parser-pending diagnostics are considered.',
);
has(hook, 'actionLabel = \'Disconnect\'', 'per-device disconnect action');
lacks(hook, 'Disconnect Group', 'per-device disconnect action');

for (const field of [
  'batteryVolts: number | null',
  'batteryAmps: number | null',
  'batteryWatts: number | null',
  'acOutputWatts: number | null',
  'dcOutputWatts: number | null',
]) {
  has(providers, field, 'provider device summary extended telemetry');
}

for (const fragment of [
  'getStatusPillTone',
  'getSourceTone',
  'formatLastTelemetryLabel',
  'shouldShowDiagnosticReason',
  'device.statusPillLabel',
  'device.connectionSourceLabel',
  'device.telemetryFields.map',
  'device.diagnosticReason',
  'Last telemetry --',
  'Reason',
]) {
  has(screen, fragment, 'Power Center BLU diagnostic card UI');
}

has(screen, '{device.detailLabel || connectionPolicy.statusDetail}', 'device-specific status detail');
lacks(screen, 'Native BLE Diagnostics', 'Power Center production UI');
lacks(screen, 'Pipeline Diagnostics', 'Power Center production UI');

console.log('BLU Power Center status UI checks passed.');
