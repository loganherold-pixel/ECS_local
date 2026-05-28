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
const {
  EcoFlowCloudProvider,
} = loadTypeScriptModule('src/power/cloud/providers/EcoFlowCloudProvider.ts');
const ecoFlowEdgeFunctionSource = fs.readFileSync(
  path.join(process.cwd(), 'supabase', 'functions', 'ecoflow', 'index.ts'),
  'utf8',
);

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
assert.strictEqual(glacierTelemetry.telemetry.battery.estRuntimeMin, undefined);
assert.strictEqual(glacierTelemetry.fridgeTemperatureC, 3);
assert.strictEqual(glacierTelemetry.telemetry.source, 'cloud');
assert.strictEqual(glacierTelemetry.telemetry.sourceLabel, 'EcoFlow Cloud');
assert.strictEqual(glacierTelemetry.telemetry.isLive, true);
assert.strictEqual(glacierTelemetry.telemetry.device.id, 'BX11ZAB5EG1X1224');
assert.strictEqual(glacierTelemetry.telemetry.device.vendor, 'EcoFlow');

const deltaRuntimeTelemetry = normalizeEcoFlowCloudTelemetry(
  {
    rawId: 'DELTA3-1500',
    name: 'Delta 3 1500',
    subtype: 'DELTA 3 1500',
    category: 'power_station',
  },
  {
    timestamp: 1700000000002,
    source: 'cloud',
    device: { id: 'DELTA3-1500', vendor: 'EcoFlow', model: 'DELTA 3 1500' },
    battery: { socPct: 72, wattsIn: 80, wattsOut: 240, estRuntimeMin: 460 },
    solar: { watts: 120 },
    flags: { stale: false },
  },
  [],
  1700000000003,
);

assert.strictEqual(deltaRuntimeTelemetry.productType, 'power_station');
assert.strictEqual(deltaRuntimeTelemetry.inputWatts, 80);
assert.strictEqual(deltaRuntimeTelemetry.outputWatts, 240);
assert.strictEqual(deltaRuntimeTelemetry.solarWatts, 120);
assert.strictEqual(deltaRuntimeTelemetry.telemetry.battery.estRuntimeMin, 460);

const deltaPerDeviceOnlyTelemetry = normalizeEcoFlowCloudTelemetry(
  {
    rawId: 'D361FAH4ZH9F5055',
    name: 'EcoFlow DELTA 3 1500',
    subtype: 'DELTA 3 1500',
    category: 'power_station',
    signalStrength: -48,
  },
  null,
  [
    {
      deviceId: 'D361FAH4ZH9F5055',
      name: 'EcoFlow DELTA 3 1500',
      model: 'DELTA 3 1500',
      socPct: 100,
      wattsIn: 128,
      wattsOut: 0,
      solarWatts: 0,
      ok: true,
      pendingApproval: false,
      error: null,
      polledAt: 1700000000100,
    },
  ],
  1700000000200,
);

assert.strictEqual(deltaPerDeviceOnlyTelemetry.productType, 'power_station');
assert.strictEqual(deltaPerDeviceOnlyTelemetry.telemetryActive, true);
assert.strictEqual(deltaPerDeviceOnlyTelemetry.batteryPct, 100);
assert.strictEqual(deltaPerDeviceOnlyTelemetry.inputWatts, 128);
assert.strictEqual(deltaPerDeviceOnlyTelemetry.outputWatts, 0);
assert.strictEqual(deltaPerDeviceOnlyTelemetry.telemetry.source, 'cloud');
assert.strictEqual(deltaPerDeviceOnlyTelemetry.telemetry.isLive, true);
assert.strictEqual(deltaPerDeviceOnlyTelemetry.telemetry.battery.socPct, 100);
assert.strictEqual(deltaPerDeviceOnlyTelemetry.telemetry.battery.wattsIn, 128);
assert.strictEqual(deltaPerDeviceOnlyTelemetry.telemetry.battery.wattsOut, 0);
assert.strictEqual(deltaPerDeviceOnlyTelemetry.telemetry.quality.connection, 'connected');

const multiDeviceAggregateTelemetry = {
  timestamp: 1700000000250,
  source: 'cloud',
  device: { id: 'ecoflow:aggregate', vendor: 'EcoFlow', model: 'EcoFlow Aggregate' },
  battery: { socPct: 50, wattsIn: 127, wattsOut: 0 },
  solar: { watts: 0 },
  flags: { stale: false },
};

const deltaMiniNoDecodedTelemetry = normalizeEcoFlowCloudTelemetry(
  {
    rawId: 'DELTA_MINI_IDLE',
    name: 'Delta Mini',
    subtype: 'DELTA Mini',
    category: 'power_station',
  },
  multiDeviceAggregateTelemetry,
  [
    {
      deviceId: 'D361FAH4ZH9F5055',
      name: 'EcoFlow DELTA 3 1500',
      model: 'DELTA 3 1500',
      socPct: 100,
      wattsIn: 127,
      wattsOut: 0,
      solarWatts: 0,
      ok: true,
      pendingApproval: false,
      error: null,
      polledAt: 1700000000250,
    },
    {
      deviceId: 'DELTA_MINI_IDLE',
      name: 'Delta Mini',
      model: 'DELTA Mini',
      ok: true,
      pendingApproval: false,
      error: null,
      polledAt: 1700000000250,
    },
  ],
  1700000000260,
);

assert.strictEqual(
  deltaMiniNoDecodedTelemetry.batteryPct,
  null,
  'Multi-device EcoFlow aggregate SOC must not be copied onto a per-device Delta Mini reading.',
);
assert.strictEqual(
  deltaMiniNoDecodedTelemetry.inputWatts,
  null,
  'Multi-device EcoFlow aggregate input watts must not be copied onto a per-device Delta Mini reading.',
);
assert.strictEqual(
  deltaMiniNoDecodedTelemetry.telemetryActive,
  false,
  'A per-device EcoFlow reading with no decoded values should remain awaiting data even if an aggregate packet has watts.',
);
assert.strictEqual(deltaMiniNoDecodedTelemetry.telemetry, null);

const delta3PartialPerDeviceTelemetry = normalizeEcoFlowCloudTelemetry(
  {
    rawId: 'D361FAH4ZH9F5055',
    name: 'EcoFlow DELTA 3 1500',
    subtype: 'DELTA 3 1500',
    category: 'power_station',
  },
  multiDeviceAggregateTelemetry,
  [
    {
      deviceId: 'D361FAH4ZH9F5055',
      name: 'EcoFlow DELTA 3 1500',
      model: 'DELTA 3 1500',
      wattsIn: 127,
      wattsOut: 0,
      solarWatts: 0,
      ok: true,
      pendingApproval: false,
      error: null,
      polledAt: 1700000000270,
    },
  ],
  1700000000280,
);

assert.strictEqual(delta3PartialPerDeviceTelemetry.inputWatts, 127);
assert.strictEqual(
  delta3PartialPerDeviceTelemetry.batteryPct,
  null,
  'A partial per-device EcoFlow cloud packet should not inherit aggregate/fallback SOC.',
);
assert.strictEqual(delta3PartialPerDeviceTelemetry.telemetryActive, true);
assert.strictEqual(delta3PartialPerDeviceTelemetry.telemetry.battery.wattsIn, 127);
assert.strictEqual(delta3PartialPerDeviceTelemetry.telemetry.battery.socPct, undefined);

const renamedDeltaPerDeviceTelemetry = normalizeEcoFlowCloudTelemetry(
  {
    rawId: 'USER_RENAMED_DELTA',
    name: 'Camp Power',
    model: 'EcoFlow Device',
    category: 'unknown',
  },
  null,
  [
    {
      deviceId: 'D361FAH4ZH9F5055',
      name: 'Camp Power',
      model: 'DELTA 3 1500',
      socPct: 87,
      wattsIn: 96,
      wattsOut: 42,
      solarWatts: 18,
      ok: true,
      pendingApproval: false,
      error: null,
      polledAt: 1700000000300,
    },
  ],
  1700000000400,
);

assert.strictEqual(
  renamedDeltaPerDeviceTelemetry.telemetryActive,
  true,
  'EcoFlow per-device cloud telemetry should match renamed devices by name/model when ids differ.',
);
assert.strictEqual(renamedDeltaPerDeviceTelemetry.batteryPct, 87);
assert.strictEqual(renamedDeltaPerDeviceTelemetry.inputWatts, 96);
assert.strictEqual(renamedDeltaPerDeviceTelemetry.outputWatts, 42);
assert.strictEqual(renamedDeltaPerDeviceTelemetry.solarWatts, 18);

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
assert(
  ecoFlowEdgeFunctionSource.includes('productType: String(') &&
    ecoFlowEdgeFunctionSource.includes('model: String('),
  'EcoFlow edge device list should return non-secret product metadata when available.',
);
assert(
  !ecoFlowEdgeFunctionSource.includes('[ecoflow telemetry] sample') &&
    !ecoFlowEdgeFunctionSource.includes('JSON.stringify(json?.data'),
  'EcoFlow edge function must not log raw telemetry payload samples.',
);
assert(
  ecoFlowEdgeFunctionSource.includes('ECOFLOW_DEVICE_UNAUTHORIZED') &&
    ecoFlowEdgeFunctionSource.includes('device_not_authorized') &&
    ecoFlowEdgeFunctionSource.includes('source: "ecoflow-cloud"') &&
    ecoFlowEdgeFunctionSource.includes('phase') &&
    ecoFlowEdgeFunctionSource.includes('authRequired') &&
    ecoFlowEdgeFunctionSource.includes('deviceUnauthorized') &&
    ecoFlowEdgeFunctionSource.includes('retryable') &&
    ecoFlowEdgeFunctionSource.includes('ECOFLOW_API_BASE_URL') &&
    ecoFlowEdgeFunctionSource.includes('Verify the EcoFlow developer app has device access') &&
    ecoFlowEdgeFunctionSource.includes('safeSnippet(bodyText') &&
    !ecoFlowEdgeFunctionSource.includes('ECOFLOW_ACCESS_KEY=') &&
    !ecoFlowEdgeFunctionSource.includes('ECOFLOW_SECRET_KEY='),
  'EcoFlow edge function should return actionable non-secret authorization diagnostics for 401/403/device-denied responses.',
);

const provider = new EcoFlowCloudProvider();
provider.listedDeviceCatalog = new Map([
  [
    'DELTA_PRODUCT_LABEL',
    {
      provider: 'EcoFlow',
      deviceId: 'DELTA_PRODUCT_LABEL',
      name: 'Camp Power',
      model: 'DELTA 3 1500',
      productType: 'power_station',
      online: true,
      lastSeenAt: 1700000000000,
    },
  ],
  [
    'USER_RENAMED_DELTA',
    {
      provider: 'EcoFlow',
      deviceId: 'USER_RENAMED_DELTA',
      name: 'Camp Power',
      model: 'EcoFlow Device',
      productType: 'unknown',
      online: true,
      lastSeenAt: 1700000000000,
    },
  ],
  [
    'GLACIER123',
    {
      provider: 'EcoFlow',
      deviceId: 'GLACIER123',
      name: 'GLACIER',
      model: 'GLACIER',
      productType: 'refrigerator',
      online: true,
      lastSeenAt: 1700000000000,
    },
  ],
]);
assert.deepStrictEqual(
  provider.filterTelemetryCandidateIds(['DELTA_PRODUCT_LABEL', 'USER_RENAMED_DELTA', 'GLACIER123']),
  ['DELTA_PRODUCT_LABEL', 'USER_RENAMED_DELTA', 'GLACIER123'],
  'EcoFlow cloud telemetry should try known power stations, Glacier refrigerators, and unknown catalog types.',
);

const mappedNestedQuota = provider.mapEdgeTelemetry({
  ok: true,
  deviceId: 'USER_RENAMED_DELTA',
  telemetry: {
    pd: {
      soc: 68,
      wattsInSum: 124,
      wattsOutSum: 43,
      pvPower: 81,
      vol: 51200,
    },
    bmsMaster: {
      tmp: 241,
    },
  },
});
assert.strictEqual(mappedNestedQuota.battery.socPct, 68);
assert.strictEqual(mappedNestedQuota.battery.wattsIn, 124);
assert.strictEqual(mappedNestedQuota.battery.wattsOut, 43);
assert.strictEqual(mappedNestedQuota.solar.watts, 81);
assert.strictEqual(mappedNestedQuota.battery.volts, 51.2);
assert.strictEqual(mappedNestedQuota.battery.tempC, 24.1);

const mappedArrayQuota = provider.mapEdgeTelemetry({
  ok: true,
  deviceId: 'DELTA_ARRAY_QUOTA',
  telemetry: [
    { name: 'pd.soc', value: '69' },
    { name: 'pd.wattsInSum', value: 144 },
    { name: 'pd.wattsOutSum', value: 52 },
    { name: 'pd.pvPower', value: 88 },
    { name: 'pd.vol', value: 51200 },
    { name: 'bmsMaster.tmp', value: 236 },
  ],
});
assert.strictEqual(mappedArrayQuota.battery.socPct, 69);
assert.strictEqual(mappedArrayQuota.battery.wattsIn, 144);
assert.strictEqual(mappedArrayQuota.battery.wattsOut, 52);
assert.strictEqual(mappedArrayQuota.solar.watts, 88);
assert.strictEqual(mappedArrayQuota.battery.volts, 51.2);
assert.strictEqual(mappedArrayQuota.battery.tempC, 23.6);

const mappedDeltaMiniParamQuota = provider.mapEdgeTelemetry({
  ok: true,
  deviceId: 'DELTA_MINI_PARAM_QUOTA',
  telemetry: {
    quotas: [
      { paramName: 'socLevel', actualValue: '58' },
      { paramName: 'inputPowerSum', actualValue: 113 },
      { paramName: 'outputPowerSum', actualValue: 44 },
      { paramName: 'pv1Power', actualValue: 22 },
      { paramName: 'pv2Power', actualValue: 10 },
    ],
  },
});
assert.strictEqual(
  mappedDeltaMiniParamQuota.battery.socPct,
  58,
  'Delta Mini quota entries using paramName/actualValue should decode SOC.',
);
assert.strictEqual(mappedDeltaMiniParamQuota.battery.wattsIn, 113);
assert.strictEqual(mappedDeltaMiniParamQuota.battery.wattsOut, 44);
assert.strictEqual(
  mappedDeltaMiniParamQuota.solar.watts,
  32,
  'Delta Mini quota entries should sum pv1Power and pv2Power as solar input.',
);

const mappedDelta3QuotaCodePayload = provider.mapEdgeTelemetry({
  ok: true,
  deviceId: 'D361FAH4ZH9F5055',
  telemetry: {
    data: [
      { quotaCode: 'pd.batPct', valueNum: '79' },
      { quotaCode: 'pd.totalInPower', valueNum: 151 },
      { quotaCode: 'pd.totalOutPower', valueNum: 62 },
      { quotaCode: 'pd.pvTotalPower', valueNum: 97 },
    ],
  },
});
assert.strictEqual(
  mappedDelta3QuotaCodePayload.battery.socPct,
  79,
  'DELTA 3 1500 quotaCode/valueNum cloud payloads should decode SOC.',
);
assert.strictEqual(mappedDelta3QuotaCodePayload.battery.wattsIn, 151);
assert.strictEqual(mappedDelta3QuotaCodePayload.battery.wattsOut, 62);
assert.strictEqual(mappedDelta3QuotaCodePayload.solar.watts, 97);

const mappedNestedValueQuota = provider.mapEdgeTelemetry({
  ok: true,
  deviceId: 'D361FAH4ZH9F5055',
  telemetry: [
    ['pd.soc', { latestValue: { value: '82' } }],
    { property: 'pd.inputPowerSum', latestValue: { dataValue: '132' } },
    { propertyName: 'pd.outputPowerSum', current_value: { valueRaw: 57 } },
  ],
});
assert.strictEqual(
  mappedNestedValueQuota.battery.socPct,
  82,
  'EcoFlow tuple and nested value wrappers should unwrap before numeric decoding.',
);
assert.strictEqual(mappedNestedValueQuota.battery.wattsIn, 132);
assert.strictEqual(mappedNestedValueQuota.battery.wattsOut, 57);

const mappedDelta3Quota = provider.mapEdgeTelemetry({
  ok: true,
  deviceId: 'D361FAH4ZH9F5055',
  telemetry: {
    ems: {
      totalOutputWatts: 311,
      inputWatts: 92,
    },
    pd: {
      batPct: 77,
      pv1InputWatts: 64,
      vol: 51200,
    },
    inv: {
      acOutPower: 245,
    },
  },
});
assert.strictEqual(mappedDelta3Quota.battery.socPct, 77);
assert.strictEqual(mappedDelta3Quota.battery.wattsIn, 92);
assert.strictEqual(mappedDelta3Quota.battery.wattsOut, 311);
assert.strictEqual(mappedDelta3Quota.solar.watts, 64);
assert.strictEqual(mappedDelta3Quota.battery.volts, 51.2);

const mappedDeltaDisplayPropertyQuota = provider.mapEdgeTelemetry({
  ok: true,
  deviceId: 'D361FAH4ZH9F5055',
  telemetry: {
    bmsBattSoc: 100,
    bmsMaxCellTemp: 31,
    powInSumW: 148,
    powOutSumW: 27,
    powGetAcIn: 148,
    powGetAcLvOut: 19,
    powGet12v: 8,
    powGetPvL: 0,
  },
});
assert.strictEqual(mappedDeltaDisplayPropertyQuota.battery.socPct, 100);
assert.strictEqual(mappedDeltaDisplayPropertyQuota.battery.wattsIn, 148);
assert.strictEqual(mappedDeltaDisplayPropertyQuota.battery.wattsOut, 27);
assert.strictEqual(mappedDeltaDisplayPropertyQuota.solar.watts, 0);
assert.strictEqual(mappedDeltaDisplayPropertyQuota.battery.tempC, 31);

const mappedWrappedDeltaQuota = provider.mapEdgeTelemetry({
  ok: true,
  deviceId: 'D361FAH4ZH9F5055',
  telemetry: {
    'pd.soc': { value: '83' },
    'pd.wattsInSum': { value: 176, unit: 'W' },
    'pd.wattsOutSum': { data: '39' },
    'pd.vol': { currentValue: 51200 },
    bmsMaster: {
      tmp: { value: 243 },
    },
  },
});
assert.strictEqual(
  mappedWrappedDeltaQuota.battery.socPct,
  83,
  'EcoFlow wrapped quota values should decode SOC from the parent quota key.',
);
assert.strictEqual(mappedWrappedDeltaQuota.battery.wattsIn, 176);
assert.strictEqual(mappedWrappedDeltaQuota.battery.wattsOut, 39);
assert.strictEqual(mappedWrappedDeltaQuota.battery.volts, 51.2);
assert.strictEqual(mappedWrappedDeltaQuota.battery.tempC, 24.3);

const mappedDeltaMiniSolarQuota = provider.mapEdgeTelemetry({
  ok: true,
  deviceId: 'DELTA_MINI_SOLAR',
  telemetry: {
    pd: {
      soc: { value: 64 },
      pv1InputWatts: { value: 91 },
      pv2InputWatts: { value: 37 },
      outputPower: { value: 18 },
      vol: { value: 25200 },
    },
  },
});
assert.strictEqual(mappedDeltaMiniSolarQuota.battery.socPct, 64);
assert.strictEqual(
  mappedDeltaMiniSolarQuota.solar.watts,
  128,
  'Delta Mini solar should sum split PV quota channels instead of only reporting the first channel.',
);
assert.strictEqual(mappedDeltaMiniSolarQuota.battery.wattsIn, undefined);
assert.strictEqual(mappedDeltaMiniSolarQuota.battery.wattsOut, 18);
assert.strictEqual(mappedDeltaMiniSolarQuota.flags.charging, true);

const mappedAlternatorChargerQuota = provider.mapEdgeTelemetry({
  ok: true,
  deviceId: 'ALTERNATOR_CHARGER',
  telemetry: {
    batteryPercent: { value: 76 },
    totalInputPower: { value: 421 },
    outputPower: { value: 0 },
  },
});
assert.strictEqual(mappedAlternatorChargerQuota.battery.socPct, 76);
assert.strictEqual(mappedAlternatorChargerQuota.battery.wattsIn, 421);
assert.strictEqual(mappedAlternatorChargerQuota.battery.wattsOut, 0);

const zeroFlowAggregate = provider.aggregateTelemetry(
  [
    {
      deviceId: 'D361FAH4ZH9F5055',
      ok: true,
      pendingApproval: false,
      unauthorized: false,
      failureState: null,
      telemetry: {
        timestamp: 1700000000500,
        source: 'cloud',
        device: { id: 'D361FAH4ZH9F5055', vendor: 'EcoFlow', model: 'DELTA 3 1500' },
        battery: { socPct: 100, wattsIn: 0, wattsOut: 0 },
        solar: { watts: 0 },
        flags: { stale: false },
      },
      error: null,
      polledAt: 1700000000500,
    },
    {
      deviceId: 'DELTA_EXTRA_BATTERY',
      ok: true,
      pendingApproval: false,
      unauthorized: false,
      failureState: null,
      telemetry: {
        timestamp: 1700000000500,
        source: 'cloud',
        device: { id: 'DELTA_EXTRA_BATTERY', vendor: 'EcoFlow', model: 'DELTA 3 Extra Battery' },
        battery: { socPct: 100, wattsIn: 0, wattsOut: 0 },
        solar: { watts: 0 },
        flags: { stale: false },
      },
      error: null,
      polledAt: 1700000000500,
    },
  ],
  false,
);
assert.strictEqual(
  zeroFlowAggregate.battery.wattsIn,
  0,
  'EcoFlow aggregate telemetry must preserve real 0W input instead of treating it as missing.',
);
assert.strictEqual(
  zeroFlowAggregate.battery.wattsOut,
  0,
  'EcoFlow aggregate telemetry must preserve real 0W output instead of treating it as missing.',
);
assert.strictEqual(
  zeroFlowAggregate.solar.watts,
  0,
  'EcoFlow aggregate telemetry must preserve real 0W solar instead of treating it as missing.',
);
assert(
  fs.readFileSync(path.join(process.cwd(), 'src', 'power', 'cloud', 'providers', 'EcoFlowCloudProvider.ts'), 'utf8').includes('delta31500'),
  'EcoFlow provider should include a DELTA 3 1500 profile for route/runtime calculations.',
);

const mappedEmptyQuota = provider.mapEdgeTelemetry({
  ok: true,
  deviceId: 'EMPTY_DELTA',
  telemetry: {},
});
assert.strictEqual(
  mappedEmptyQuota.solar.watts,
  undefined,
  'EcoFlow telemetry mapper must not fabricate solar=0 as a live reading.',
);
assert.strictEqual(
  normalizeEcoFlowCloudTelemetry(
    { rawId: 'EMPTY_DELTA', name: 'Empty Delta', category: 'unknown' },
    mappedEmptyQuota,
  ).telemetryActive,
  false,
  'empty EcoFlow quota payloads should not be marked telemetry-active.',
);

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
  assert.strictEqual(success.cloudState, null);
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
  assert.strictEqual(statusFailure.cloudState, 'cloudUnavailable');
  assert.match(statusFailure.statusLabel, /available/i);

  const unauthorizedFailure = await connectEcoFlowCloudDevice(
    {
      rawId: 'D361FAH4ZH9F5055',
      name: 'DELTA 3 1500',
      category: 'power_station',
    },
    {
      lastStatus: 'cloud_error',
      async connect() {},
      async pollOnce() {
        throw new Error('[EcoFlowCloudProvider] All devices failed: D361FAH4ZH9F5055: EcoFlow cloud access is not authorized for this device.');
      },
      getPerDeviceTelemetry() {
        return [];
      },
    },
  );

  assert.strictEqual(unauthorizedFailure.connected, false);
  assert.strictEqual(unauthorizedFailure.telemetryActive, false);
  assert.strictEqual(unauthorizedFailure.cloudState, 'deviceUnauthorized');
  assert.match(unauthorizedFailure.statusLabel, /authorization required/i);
  assert.match(unauthorizedFailure.statusError, /not authorized/i);

  const authRequiredWithoutPackets = await connectEcoFlowCloudDevice(
    {
      rawId: 'AUTH_REQUIRED_DELTA',
      name: 'DELTA 2',
      category: 'power_station',
    },
    {
      lastStatus: 'pending_approval',
      lastCloudFailure: 'authRequired',
      async connect() {},
      async pollOnce() {
        return {
          source: 'cloud',
          device: { id: 'AUTH_REQUIRED_DELTA', vendor: 'EcoFlow', model: 'DELTA 2' },
          flags: { stale: true },
        };
      },
      getPerDeviceTelemetry() {
        return [
          {
            deviceId: 'AUTH_REQUIRED_DELTA',
            ok: false,
            pendingApproval: true,
            unauthorized: false,
            failureState: 'authRequired',
            error: 'EcoFlow cloud authorization is pending approval.',
            polledAt: Date.now(),
          },
        ];
      },
    },
  );

  assert.strictEqual(authRequiredWithoutPackets.connected, true);
  assert.strictEqual(authRequiredWithoutPackets.telemetryActive, false);
  assert.strictEqual(authRequiredWithoutPackets.cloudState, 'authRequired');

  console.log('EcoFlow cloud connection checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
