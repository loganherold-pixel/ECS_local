const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

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
  normalizeEcoFlowMqttQuotaTelemetry,
} = loadTypeScriptModule('lib/ecoflowMqttQuotaTelemetry.ts');

const deltaMini = normalizeEcoFlowMqttQuotaTelemetry({
  topic: '/open/open-account/DBABZ5XDA220341/quota',
  receivedAt: 1780085703867,
  payload: {
    addr: 0,
    cmdFunc: 0,
    cmdId: 0,
    id: 2279336596137860497,
    version: '1.0',
    timestamp: 1780085703867,
    params: {
      'bmsMaster.temp': 25,
      'bmsMaster.inputWatts': 0,
      'bmsMaster.outputWatts': 0,
      'bmsMaster.soc': 99,
      'pd.remainTime': 2636,
    },
  },
});

assert.strictEqual(deltaMini.deviceId, 'DBABZ5XDA220341');
assert.strictEqual(deltaMini.hasPowerValues, true);
assert.strictEqual(deltaMini.telemetry.source, 'cloud');
assert.strictEqual(deltaMini.telemetry.sourceLabel, 'EcoFlow MQTT');
assert.strictEqual(deltaMini.telemetry.isLive, true);
assert.strictEqual(deltaMini.telemetry.device.serial, 'DBABZ5XDA220341');
assert.strictEqual(deltaMini.telemetry.battery.socPct, 99);
assert.strictEqual(deltaMini.telemetry.battery.wattsIn, 0);
assert.strictEqual(deltaMini.telemetry.battery.wattsOut, 0);
assert.strictEqual(deltaMini.telemetry.battery.estRuntimeMin, 2636);
assert.strictEqual(deltaMini.telemetry.battery.tempC, 25);
assert.strictEqual(deltaMini.telemetry.capabilities.hasSOC, true);
assert.strictEqual(deltaMini.telemetry.capabilities.hasWattsIn, true);
assert.strictEqual(deltaMini.telemetry.capabilities.hasWattsOut, true);
assert.strictEqual(deltaMini.telemetry.capabilities.hasSolar, false);
assert.strictEqual(deltaMini.telemetry.capabilities.hasRuntimeEstimate, true);
assert.strictEqual(deltaMini.telemetry.truth.sourceTruth, 'live_provider');
assert.strictEqual(deltaMini.telemetry.truth.providerId, 'ecoflow');

const deltaMiniSolar = normalizeEcoFlowMqttQuotaTelemetry({
  topic: '/open/open-account/DBABZ5XDA220341/quota',
  receivedAt: 1780085705867,
  payload: {
    id: 2279336596137860498,
    version: '1.0',
    params: {
      'bmsMaster.inputWatts': 0,
      'bmsMaster.outputWatts': 18,
      'bmsMaster.soc': 99,
      'pd.pv1InputWatts': 64,
      'pd.pv2InputWatts': 41,
      'pd.remainTime': 2636,
    },
  },
});

assert.strictEqual(deltaMiniSolar.deviceId, 'DBABZ5XDA220341');
assert.strictEqual(deltaMiniSolar.hasPowerValues, true);
assert.strictEqual(deltaMiniSolar.telemetry.battery.wattsIn, 0);
assert.strictEqual(deltaMiniSolar.telemetry.battery.wattsOut, 18);
assert.strictEqual(deltaMiniSolar.telemetry.solar.watts, 105);
assert.strictEqual(deltaMiniSolar.telemetry.flags.charging, true);
assert.strictEqual(deltaMiniSolar.telemetry.capabilities.hasSolar, true);

const deltaMiniSolarHighLow = normalizeEcoFlowMqttQuotaTelemetry({
  topic: '/open/open-account/DBABZ5XDA220341/quota',
  receivedAt: 1780085706867,
  payload: {
    id: 2279336596137860499,
    version: '1.0',
    params: {
      'bmsMaster.soc': 98,
      'pd.pvHInputWatts': 72,
      'pd.pvLInputWatts': 36,
    },
  },
});

assert.strictEqual(deltaMiniSolarHighLow.telemetry.solar.watts, 108);
assert.strictEqual(deltaMiniSolarHighLow.telemetry.capabilities.hasSolar, true);

const deltaMiniCarInput = normalizeEcoFlowMqttQuotaTelemetry({
  topic: '/open/open-account/DBABZ5XDA220341/quota',
  receivedAt: 1780185785454,
  payload: {
    id: 2280196294087159673,
    version: '1.0',
    params: {
      'bmsMaster.soc': 99,
      'bmsMaster.outputWatts': 0,
      'mppt.carState': 1,
      'mppt.carInputWatts': 96,
      'mppt.cfgDcChgCurrent': 0,
    },
  },
});

assert.strictEqual(deltaMiniCarInput.telemetry.battery.socPct, 99);
assert.strictEqual(
  deltaMiniCarInput.telemetry.battery.wattsIn,
  96,
  'EcoFlow MQTT car/DC input should be normalized as battery input watts.',
);
assert.strictEqual(
  deltaMiniCarInput.telemetry.solar.watts,
  undefined,
  'EcoFlow MQTT car/DC input must not be mislabeled as solar watts.',
);
assert.strictEqual(deltaMiniCarInput.telemetry.capabilities.hasWattsIn, true);
assert.strictEqual(deltaMiniCarInput.telemetry.capabilities.hasSolar, false);

const glacier = normalizeEcoFlowMqttQuotaTelemetry({
  topic: '/open/open-account/BX11ZAB5EG1X1224/quota',
  receivedAt: 1780085474000,
  payload: JSON.stringify({
    moduleType: 4,
    needAck: 0,
    id: 416772271,
    time: 3864696990,
    params: {
      amp: 0,
      fullCap: 13800,
      soc: 100,
      vol: 25000,
      tmp: 34,
      remainTime: 0,
      inWatts: 0,
      outWatts: 0,
    },
    version: '1.0',
    typeCode: 'bmsStatus',
  }),
});

assert.strictEqual(glacier.deviceId, 'BX11ZAB5EG1X1224');
assert.strictEqual(glacier.typeCode, 'bmsStatus');
assert.strictEqual(glacier.telemetry.battery.socPct, 100);
assert.strictEqual(glacier.telemetry.battery.volts, 25);
assert.strictEqual(glacier.telemetry.battery.tempC, 34);
assert.strictEqual(glacier.telemetry.battery.wattsIn, 0);
assert.strictEqual(glacier.telemetry.battery.wattsOut, 0);
assert.strictEqual(glacier.telemetry.battery.estRuntimeMin, undefined);

const statusOnly = normalizeEcoFlowMqttQuotaTelemetry({
  topic: '/open/open-account/D361FAH4ZH9F5055/status',
  payload: '{"id":"status","params":{"status":1},"version":"1.0"}',
});

assert.strictEqual(statusOnly.deviceId, 'D361FAH4ZH9F5055');
assert.strictEqual(statusOnly.hasPowerValues, false);
assert.strictEqual(statusOnly.telemetry, null);

const providerSource = fs.readFileSync(
  path.join(process.cwd(), 'src/power/cloud/providers/EcoFlowCloudProvider.ts'),
  'utf8',
);
assert(
  providerSource.includes('"bmsMaster.inputWatts"') &&
    providerSource.includes('"bmsMaster.outputWatts"'),
  'EcoFlow cloud mapper must preserve DELTA Mini MQTT quota key aliases.',
);

console.log('EcoFlow MQTT quota telemetry checks passed.');
