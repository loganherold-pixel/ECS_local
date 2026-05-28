const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

global.__DEV__ = false;

function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypeScript;

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function loadTypeScriptModule(relativePath) {
  const fullPath = path.join(process.cwd(), relativePath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScript(mod, fullPath);
  return mod.exports;
}

const doc = read('docs/blu-power-vendor-verification.md');
const bluTypes = read('lib/BluTypes.ts');
const providerContract = read('lib/IEcsPowerProvider.ts');
const envelopeSource = read('lib/bluTelemetryEnvelope.ts');
const powerAdapters = read('lib/powerBrandConnectionAdapters.ts');
const nativeAdapter = read('lib/createNativeBleBluAdapter.ts');
const bluStateStore = read('lib/BluStateStore.ts');
const providerRegistry = read('lib/EcsProviderRegistry.ts');
const parserRegistry = read('lib/bluestack/bluestackTelemetryParserRegistry.ts');
const livePowerProviders = read('lib/livePowerBleProviders.ts');
const bootstrap = read('lib/ecsLiveSystemBootstrap.ts');

for (const row of [
  '| Bluetti |',
  '| Goal Zero |',
  '| Anker / Anker SOLIX |',
  '| Jackery |',
  '| Renogy |',
  '| REDARC |',
  '| Dakota Lithium |',
  '| Victron Energy |',
  '| EcoFlow |',
  '| Unknown power device |',
]) {
  assert(doc.includes(row), `vendor matrix must include ${row}`);
}

for (const marker of [
  'buildPowerBluTelemetryEnvelope',
  'buildBluPowerTelemetryEnvelope',
  'withBluPowerTelemetryEnvelope',
  'PowerBluTelemetryData',
  "source === 'mock'",
  "source === 'mock_dev'",
]) {
  assert(envelopeSource.includes(marker), `power envelope helper must include ${marker}`);
}

assert(
  bluTypes.includes('bluTelemetryEnvelope?: BluTelemetryEnvelope') &&
    providerContract.includes('bluTelemetryEnvelope?: BluTelemetryEnvelope'),
  'BLU and ECS power telemetry types must expose the shared BLU envelope.',
);

assert(
  powerAdapters.includes('buildPowerBluTelemetryEnvelope(reading)') &&
    powerAdapters.includes('withBluPowerTelemetryEnvelope({') &&
    nativeAdapter.includes('withBluPowerTelemetryEnvelope({') &&
    bluStateStore.includes('withBluPowerTelemetryEnvelope({') &&
    providerRegistry.includes('buildPowerBluTelemetryEnvelope(normalizedReading)'),
  'Power telemetry producers and stores must attach shared BLU envelopes.',
);

for (const provider of [
  'bluetti',
  'anker_solix',
  'jackery',
  'goal_zero',
  'renogy',
  'redarc',
  'dakota_lithium',
  'victron',
]) {
  assert(
    parserRegistry.includes(`'${provider}'`) &&
      parserRegistry.includes('canDecodeLiveTelemetry: true') &&
      parserRegistry.includes('canAttemptLiveConnection: true'),
    `${provider} must be promoted into the live-ready native BLE parser set.`,
  );
}

for (const marker of [
  'bluettiPowerProvider',
  'ankerSolixPowerProvider',
  'jackeryPowerProvider',
  'goalZeroPowerProvider',
  'renogyPowerProvider',
  'redarcPowerProvider',
  'dakotaLithiumPowerProvider',
  'victronPowerProvider',
]) {
  assert(livePowerProviders.includes(marker), `live power provider bridge must export ${marker}.`);
  assert(bootstrap.includes(marker), `ECS live bootstrap must register ${marker}.`);
}
assert(
  livePowerProviders.includes("telemetryUnsupported: !isLive") &&
    livePowerProviders.includes("telemetrySource: isLive ? 'ble_live'") &&
    livePowerProviders.includes('createNativeBleBluAdapter'),
  'live power provider bridge must promote only decoded native BLE power fields.',
);

for (const file of [
  'lib/BluettiBluAdapter.ts',
  'lib/AnkerSolixBluAdapter.ts',
  'lib/JackeryBluAdapter.ts',
  'lib/GoalZeroBluAdapter.ts',
  'lib/RenogyBluAdapter.ts',
]) {
  const source = read(file);
  assert(source.includes("source: 'mock_dev'"), `${file} must explicitly mark simulated telemetry as mock_dev.`);
  assert(source.includes('isLive: false'), `${file} must not mark simulated telemetry live.`);
  assert(source.includes('withBluPowerTelemetryEnvelope({'), `${file} must attach the BLU power envelope.`);
  assert(source.includes('simulated: true') && source.includes('mock: true'), `${file} must mark raw simulated/mock state.`);
}

const {
  buildBluPowerTelemetryEnvelope,
  buildPowerBluTelemetryEnvelope,
  hasDecodedPowerTelemetry,
} = loadTypeScriptModule('lib/bluTelemetryEnvelope.ts');

const mockEnvelope = buildBluPowerTelemetryEnvelope({
  timestamp: 1000,
  updatedAt: 1000,
  provider: 'bluetti',
  device_id: 'bluetti-sim-ac200max',
  source: 'mock_dev',
  isLive: false,
  battery_percent: 82,
  input_watts: 120,
  output_watts: 60,
  raw: { simulated: true, mock: true },
});
assert.strictEqual(mockEnvelope.source, 'mock');
assert.strictEqual(mockEnvelope.health, 'mock');
assert.strictEqual(mockEnvelope.connectionStatus, 'connected');
assert(mockEnvelope.data.telemetryKeys.includes('battery_percent'));
assert.strictEqual(
  hasDecodedPowerTelemetry({
    timestamp: 1000,
    provider: 'bluetti',
    device_id: 'bluetti-sim-ac200max',
    source: 'mock_dev',
    battery_percent: 82,
  }),
  true,
);

const unavailableEnvelope = buildBluPowerTelemetryEnvelope({
  timestamp: 2000,
  updatedAt: 2000,
  provider: 'goal_zero',
  device_id: 'yeti-parser-pending',
  source: 'unavailable',
  isLive: false,
  telemetryUnsupported: true,
  telemetryUnsupportedReason: 'Parser pending.',
});
assert.strictEqual(unavailableEnvelope.health, 'unavailable');
assert.strictEqual(unavailableEnvelope.error.code, 'TELEMETRY_UNSUPPORTED');

const cloudEnvelope = buildPowerBluTelemetryEnvelope({
  provider: 'ecoflow',
  providerDisplayName: 'EcoFlow',
  providerAccentColor: '#00A6FF',
  providerIcon: 'flash',
  deviceId: 'DELTA-1',
  deviceName: 'DELTA',
  model: 'DELTA',
  batteryPercent: 91,
  inputWatts: 110,
  outputWatts: 42,
  estimatedRuntimeMinutes: null,
  chargingState: 'charging',
  outputState: 'all_on',
  connectionState: 'connected',
  warningState: 'normal',
  isDisconnected: false,
  temperatureCelsius: null,
  solarInputWatts: null,
  acOutputWatts: null,
  dcOutputWatts: null,
  batteryVolts: null,
  batteryAmps: null,
  chargeCycles: null,
  healthPercent: null,
  capacityWh: null,
  lastUpdated: Date.now(),
  isStale: false,
  isPrimary: true,
  telemetrySource: 'provider_cloud',
  isLive: true,
});
assert.strictEqual(cloudEnvelope.source, 'cloud-api');
assert.strictEqual(cloudEnvelope.health, 'live');
assert.strictEqual(cloudEnvelope.connectionStatus, 'streaming');

console.log('BLU power vendor verification checks passed.');
