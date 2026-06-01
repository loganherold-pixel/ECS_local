const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

require.extensions['.ts'] = function loadTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

const {
  getDeviceConnectionRouteLabel,
  getSavedAutoReconnectDecision,
  isUserInitiatedConnectionSource,
  shouldSkipAutoConnection,
} = loadTypeScriptModule('lib/deviceConnectionRequestPolicy.ts');

assert.strictEqual(
  shouldSkipAutoConnection('programmatic'),
  true,
  'scan/render driven programmatic calls must not connect discovered devices',
);
assert.strictEqual(shouldSkipAutoConnection('user_device_action'), false);
assert.strictEqual(shouldSkipAutoConnection('user_selected_batch'), false);
assert.strictEqual(shouldSkipAutoConnection('user_retry'), false);
assert.strictEqual(shouldSkipAutoConnection('saved_auto_reconnect'), false);

assert.strictEqual(isUserInitiatedConnectionSource('programmatic'), false);
assert.strictEqual(isUserInitiatedConnectionSource('saved_auto_reconnect'), false);
assert.strictEqual(isUserInitiatedConnectionSource('user_device_action'), true);

assert.strictEqual(
  getDeviceConnectionRouteLabel({
    kind: 'power',
    providerId: 'ecoflow',
    source: 'api',
    connectionType: 'api',
    requiresNativeBluetooth: false,
    connectableViaCloud: true,
  }),
  'cloud',
);
assert.strictEqual(
  getDeviceConnectionRouteLabel({
    kind: 'power',
    providerId: 'bluetti',
    source: 'ble',
    connectionType: 'ble',
  }),
  'ble',
);
assert.strictEqual(
  getDeviceConnectionRouteLabel({
    kind: 'telemetry',
    providerId: 'obd2',
    source: 'classic_bluetooth',
  }),
  'obd2',
);

const rememberedDiscoverablePowerDevice = {
  kind: 'power',
  providerId: 'bluetti',
  id: 'power:bluetti:ac180',
  rawId: 'ac180',
  isRemembered: true,
  isDiscoverable: true,
  isConnected: false,
  isConnecting: false,
  actionKind: 'connect',
};

const baseReconnectRequest = {
  device: rememberedDiscoverablePowerDevice,
  appState: 'active',
  isBusy: false,
  isScanning: false,
  hasManualDisconnectRequest: false,
  isCloudAuthBlocked: false,
  previousAttemptAt: 0,
  now: 60_000,
  cooldownMs: 30_000,
};

assert.deepStrictEqual(
  getSavedAutoReconnectDecision(baseReconnectRequest),
  { allowed: true, reason: 'allowed' },
  'remembered power devices that are actively advertising while ECS is active should auto-reconnect',
);

assert.deepStrictEqual(
  getSavedAutoReconnectDecision({
    ...baseReconnectRequest,
    appState: 'background',
  }),
  { allowed: false, reason: 'app_not_active' },
  'saved auto-reconnect must not run while ECS is backgrounded',
);

assert.deepStrictEqual(
  getSavedAutoReconnectDecision({
    ...baseReconnectRequest,
    device: {
      ...rememberedDiscoverablePowerDevice,
      isDiscoverable: false,
    },
  }),
  { allowed: false, reason: 'not_discoverable' },
  'saved auto-reconnect must wait until the user device is actively on and rediscovered',
);

assert.deepStrictEqual(
  getSavedAutoReconnectDecision({
    ...baseReconnectRequest,
    hasManualDisconnectRequest: true,
  }),
  { allowed: false, reason: 'manual_disconnect' },
  'manual disconnect must suppress saved auto-reconnect until the user explicitly reconnects',
);

assert.deepStrictEqual(
  getSavedAutoReconnectDecision({
    ...baseReconnectRequest,
    previousAttemptAt: 45_000,
  }),
  { allowed: false, reason: 'cooldown' },
  'saved auto-reconnect must respect cooldowns to avoid noisy reconnect loops',
);

console.log('Device connection request policy checks passed.');
