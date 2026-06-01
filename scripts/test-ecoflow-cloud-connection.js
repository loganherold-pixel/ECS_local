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

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'web' },
      AppState: {
        addEventListener: () => ({ remove() {} }),
        currentState: 'active',
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
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
  ECOFLOW_CLOUD_CONNECT_TOKEN,
  connectEcoFlowCloudDevice,
  normalizeEcoFlowCloudProductType,
  normalizeEcoFlowCloudTelemetry,
} = loadTypeScriptModule('lib/ecoflowCloudConnection.ts');

assert.strictEqual(normalizeEcoFlowCloudProductType('refrigerator', 'GLACIER'), 'refrigerator');
assert.strictEqual(normalizeEcoFlowCloudProductType('portable_ac', 'WAVE 2'), 'portable_ac');
assert.strictEqual(normalizeEcoFlowCloudProductType('charger', 'Alternator Charger'), 'charger');
assert.strictEqual(normalizeEcoFlowCloudProductType('power station', 'DELTA 3'), 'power_station');

const glacierTelemetry = normalizeEcoFlowCloudTelemetry(
  {
    rawId: 'BX11ZAB5EG1X1224',
    name: 'GLACIER-1224',
    subtype: 'GLACIER',
    category: 'refrigerator',
    signalStrength: -44,
  },
  {
    timestamp: 1700000000000,
    source: 'cloud',
    device: { id: 'BX11ZAB5EG1X1224', vendor: 'EcoFlow', model: 'GLACIER' },
    battery: { socPct: 81, wattsIn: 120, wattsOut: 45, tempC: 3 },
    solar: { watts: 0 },
    flags: { stale: false },
  },
  [],
  1700000000001,
);

assert.strictEqual(glacierTelemetry.productType, 'refrigerator');
assert.strictEqual(glacierTelemetry.telemetryActive, true);
assert.strictEqual(glacierTelemetry.batteryPct, 81);
assert.strictEqual(glacierTelemetry.inputWatts, 120);
assert.strictEqual(glacierTelemetry.outputWatts, 45);
assert.strictEqual(glacierTelemetry.fridgeTemperatureC, 3);
assert.strictEqual(glacierTelemetry.telemetry.source, 'cloud');
assert.strictEqual(glacierTelemetry.telemetry.sourceLabel, 'EcoFlow Cloud');
assert.strictEqual(glacierTelemetry.telemetry.isLive, true);
assert.strictEqual(glacierTelemetry.telemetry.device.id, 'BX11ZAB5EG1X1224');
assert.strictEqual(glacierTelemetry.telemetry.device.vendor, 'EcoFlow');

const waveTelemetry = normalizeEcoFlowCloudTelemetry(
  {
    rawId: 'WAVE2',
    name: 'WAVE 2',
    category: 'portable_ac',
    raw: {
      ac: { tempC: 19, mode: 'cool' },
    },
  },
  {
    source: 'cloud',
    device: { id: 'WAVE2', vendor: 'EcoFlow', model: 'WAVE 2' },
    battery: { socPct: 67 },
    flags: { stale: false },
  },
);

assert.strictEqual(waveTelemetry.productType, 'portable_ac');
assert.strictEqual(waveTelemetry.acTemperatureC, 19);
assert.strictEqual(waveTelemetry.acMode, 'cool');

(async () => {
  let connectedWithToken = null;
  const successProvider = {
    lastStatus: 'cloud_ok',
    async connect(deviceId, token) {
      assert.strictEqual(deviceId, 'BX11ZAB5EG1X1224');
      connectedWithToken = token;
    },
    async pollOnce() {
      return {
        source: 'cloud',
        device: { id: 'BX11ZAB5EG1X1224', vendor: 'EcoFlow', model: 'GLACIER' },
        battery: { socPct: 74, wattsIn: 33, wattsOut: 12, tempC: 4 },
        solar: { watts: 0 },
        flags: { stale: false },
      };
    },
    getPerDeviceTelemetry() {
      return [];
    },
  };

  const success = await connectEcoFlowCloudDevice(
    {
      rawId: 'BX11ZAB5EG1X1224',
      name: 'GLACIER-1224',
      category: 'refrigerator',
    },
    successProvider,
  );

  assert.strictEqual(connectedWithToken, ECOFLOW_CLOUD_CONNECT_TOKEN);
  assert.strictEqual(success.connected, true);
  assert.strictEqual(success.telemetryActive, true);
  assert.strictEqual(success.productType, 'refrigerator');
  assert.strictEqual(success.statusError, null);
  assert.strictEqual(success.batteryPct, 74);

  const statusFailure = await connectEcoFlowCloudDevice(
    {
      rawId: 'D361FAH4ZH9F5055',
      name: 'DELTA 3 1500',
      category: 'power_station',
    },
    {
      lastStatus: 'cloud_error',
      async connect() {},
      async pollOnce() {
        throw new Error('status endpoint unavailable');
      },
      getPerDeviceTelemetry() {
        return [];
      },
    },
  );

  assert.strictEqual(statusFailure.connected, true);
  assert.strictEqual(statusFailure.telemetryActive, false);
  assert.strictEqual(statusFailure.statusError, 'status endpoint unavailable');
  assert.match(statusFailure.statusLabel, /available/i);

  console.log('EcoFlow cloud connection checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
