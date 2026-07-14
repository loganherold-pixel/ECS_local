const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function compileTypeScriptModule(mod, filename) {
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

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

require.extensions['.ts'] = compileTypeScriptModule;

const lifecycle = loadTypeScriptModule('lib/deviceTelemetryLifecycle.ts');
const { UnifiedScannerCoordinator } = loadTypeScriptModule('lib/unifiedScannerCoordinator.ts');

assert.deepStrictEqual(lifecycle.DEVICE_CONNECTION_LIFECYCLE_STATES, [
  'unknown', 'discovered', 'eligible', 'connecting', 'authenticating', 'connected',
  'streaming', 'degraded', 'reconnecting', 'disconnecting', 'disconnected', 'failed', 'unsupported',
]);
assert.deepStrictEqual(lifecycle.DEVICE_TELEMETRY_SOURCE_STATES, [
  'live', 'recent', 'stale', 'last-known', 'no-data', 'unsupported',
]);

const bleIdentity = lifecycle.createCanonicalDeviceIdentity({
  providerId: 'EcoFlow', category: 'power', displayName: 'DELTA Mini', model: 'DELTA Mini',
  sourceIds: { ble: 'raw-ble-id' },
});
const cloudIdentity = lifecycle.createCanonicalDeviceIdentity({
  providerId: 'EcoFlow', category: 'power', displayName: 'DELTA Mini', model: 'DELTA Mini',
  sourceIds: { cloud: 'raw-cloud-id' },
});
assert.strictEqual(bleIdentity.canonicalId, cloudIdentity.canonicalId, 'described BLE/cloud records should converge on one canonical identity');
assert.strictEqual(bleIdentity.confidence, 'heuristic');
assert.ok(bleIdentity.aliases[0].fingerprint.startsWith('fnv1a:'));
assert.ok(!JSON.stringify(bleIdentity).includes('raw-ble-id'), 'canonical identity diagnostics must not expose raw transport IDs');

const serialIdentity = lifecycle.createCanonicalDeviceIdentity({ providerId: 'bluetti', serial: 'serial-123' });
assert.strictEqual(serialIdentity.confidence, 'exact');
assert.ok(!serialIdentity.canonicalId.includes('serial-123'));

assert.strictEqual(lifecycle.canTransitionDeviceConnection('connected', 'streaming'), true);
assert.strictEqual(lifecycle.canTransitionDeviceConnection('streaming', 'authenticating'), false);
assert.throws(() => lifecycle.assertDeviceConnectionTransition('streaming', 'authenticating'));

const sourceBase = { transport: 'ble', telemetryTransport: 'ble', hasDecodedData: true, lastSampleAt: 1_000_000 };
assert.strictEqual(lifecycle.resolveDeviceTelemetrySourceState({ ...sourceBase, lifecycle: 'streaming', now: 1_005_000 }).state, 'live');
assert.strictEqual(lifecycle.resolveDeviceTelemetrySourceState({ ...sourceBase, lifecycle: 'connected', now: 1_045_000 }).state, 'recent');
assert.strictEqual(lifecycle.resolveDeviceTelemetrySourceState({ ...sourceBase, lifecycle: 'degraded', now: 1_120_000 }).state, 'stale');
assert.strictEqual(lifecycle.resolveDeviceTelemetrySourceState({ ...sourceBase, lifecycle: 'disconnected', now: 1_600_000 }).state, 'last-known');
assert.strictEqual(lifecycle.resolveDeviceTelemetrySourceState({ ...sourceBase, lifecycle: 'streaming', telemetryTransport: 'cloud', now: 1_005_000 }).state, 'no-data');
assert.strictEqual(lifecycle.resolveDeviceTelemetrySourceState({ ...sourceBase, lifecycle: 'unsupported', now: 1_005_000 }).state, 'unsupported');
assert.strictEqual(lifecycle.resolveDeviceTelemetrySourceState({ ...sourceBase, lifecycle: 'streaming', hasDecodedData: false, now: 1_005_000 }).state, 'no-data');

assert.deepStrictEqual([1, 2, 3, 4, 5, 6].map((attempt) => lifecycle.getDeviceReconnectDelayMs(attempt)), [1000, 3000, 8000, 15000, 30000, null]);
const typedError = lifecycle.normalizeDeviceAdapterError(
  new Error('Authorization token=secret-value denied'),
  { phase: 'authenticating', providerId: 'ecoflow', transport: 'cloud' },
);
assert.strictEqual(typedError.code, 'permission_denied');
assert.strictEqual(typedError.retryable, false);
assert.ok(!typedError.message.includes('secret-value'));

const fixturePath = path.join(process.cwd(), 'fixtures/device-telemetry/unified-adapter-replay.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
assert.deepStrictEqual(lifecycle.validateDeviceTelemetryReplayFixture(fixture), { valid: true, errors: [] });
assert.deepStrictEqual(
  lifecycle.replayDeviceTelemetryFixture(fixture).map((sample) => sample.sourceState),
  ['live', 'stale', 'last-known'],
);
assert.strictEqual(lifecycle.validateDeviceTelemetryReplayFixture({ ...fixture, safety: { providerSecretsIncluded: true } }).valid, false);

async function testScannerCoordinator() {
  let now = 10_000;
  const cancelled = [];
  const coordinator = new UnifiedScannerCoordinator({
    now: () => now,
    minDurationMs: 5,
    maxDurationMs: 100,
    cooldownMs: 50,
    cleanupGraceMs: 5,
    onCancel: (reason) => cancelled.push(reason),
  });

  assert.strictEqual((await coordinator.requestSession({ appState: 'background' })).reason, 'app_not_active');
  const permissionDenied = await coordinator.requestSession({
    appState: 'active',
    permissionPreflight: async () => ({ allowed: false, reason: 'denied' }),
  });
  assert.strictEqual(permissionDenied.reason, 'permission_denied');
  now += 50;

  const first = await coordinator.requestSession({ appState: 'active', durationMs: 50 });
  assert.strictEqual(first.started, true);
  assert.strictEqual((await coordinator.requestSession({ appState: 'active' })).reason, 'already_scanning');
  assert.strictEqual(await coordinator.cancel('manual'), true);
  assert.deepStrictEqual(cancelled, ['manual']);
  assert.strictEqual((await coordinator.requestSession({ appState: 'active' })).reason, 'cooldown');

  now += 50;
  const second = await coordinator.requestSession({ appState: 'active', durationMs: 5 });
  assert.strictEqual(second.started, true);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.strictEqual(coordinator.getActiveSession(), null);
  assert.deepStrictEqual(cancelled, ['manual', 'timeout']);
}

testScannerCoordinator().then(() => {
  console.log('Device telemetry lifecycle and scanner coordinator checks passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
