const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

global.__DEV__ = false;

const logs = [];
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './ecsLogger' || request.endsWith('/ecsLogger')) {
    return {
      ecsLog: {
        debug(scope, message, payload) {
          logs.push({ level: 'debug', scope, message, payload });
        },
        warn(scope, message, payload) {
          logs.push({ level: 'warn', scope, message, payload });
        },
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

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
  clearScannerDeviceList,
  getScannerDeviceStableKey,
  isLikelyPowerScannerDevice,
  pruneStaleScannerDevices,
  upsertScannerDeviceList,
} = loadTypeScriptModule('lib/scannerDeviceListState.ts');

const NOW = 1_700_000_000_000;

const first = {
  id: 'AA:BB:CC:DD:EE:FF',
  source: 'ble',
  displayName: 'Veepeak BLE+',
  brand: 'V Peak / Veepeak OBD2',
  rssi: -61,
  lastSeenAt: NOW,
};
const firstResult = upsertScannerDeviceList([], [first], {
  reason: 'first_ble_sighting',
  now: NOW,
});
assert.strictEqual(firstResult.devices.length, 1);
assert.strictEqual(firstResult.upserted, 1);
assert.strictEqual(firstResult.deduped, 0);
assert.strictEqual(firstResult.devices[0].id, first.id);

const duplicateResult = upsertScannerDeviceList(firstResult.devices, [{
  id: first.id,
  source: 'ble',
  displayName: 'Veepeak BLE+',
  brand: 'V Peak / Veepeak OBD2',
  rssi: -54,
  lastSeenAt: NOW + 500,
}], {
  reason: 'duplicate_ble_sighting',
  now: NOW + 500,
});
assert.strictEqual(duplicateResult.devices.length, 1);
assert.strictEqual(duplicateResult.upserted, 0);
assert.strictEqual(duplicateResult.deduped, 1);
assert.strictEqual(duplicateResult.devices[0].rssi, -54);
assert.strictEqual(duplicateResult.devices[0].lastSeenAt, NOW + 500);

const obdAllowlistResult = upsertScannerDeviceList([], [{
  id: 'vpeak-obd2',
  source: 'ble',
  displayName: 'V Peak OBD2',
  brand: 'V Peak / Veepeak OBD2',
  rssi: -62,
  lastSeenAt: NOW + 750,
}], {
  reason: 'release_scan_obd2',
  now: NOW + 750,
  requireBrandAllowlistMatch: true,
});
assert.strictEqual(
  obdAllowlistResult.devices.length,
  1,
  'release allowlist filtering must keep V Peak / Veepeak OBD2 telemetry candidates visible',
);

const obdCheckAllowlistResult = upsertScannerDeviceList([], [{
  id: 'obdcheck-ble',
  source: 'ble',
  displayName: 'OBDCheck BLE',
  brand: 'V Peak / Veepeak OBD2',
  rssi: -59,
  lastSeenAt: NOW + 800,
}], {
  reason: 'release_scan_obdcheck',
  now: NOW + 800,
  requireBrandAllowlistMatch: true,
});
assert.strictEqual(
  obdCheckAllowlistResult.devices.length,
  1,
  'release allowlist filtering must keep OBDCheck/VeePeak BLE candidates visible',
);

const mopekaUniversalManufacturerData = Buffer.from([
  0x59, 0x00,
  0x0c, 0x91, 0x45, 0x44, 0x11, 0x01, 0x00, 0x00, 0x00, 0x00,
]).toString('base64');
const anonymousMopekaWater = {
  id: '95F1',
  source: 'ble',
  displayName: 'Unknown device 95F1',
  rssi: -55,
  lastSeenAt: NOW + 850,
  raw: {
    manufacturerData: mopekaUniversalManufacturerData,
  },
};
assert.strictEqual(
  isLikelyPowerScannerDevice(anonymousMopekaWater),
  true,
  'release allowlist filtering must recognize Mopeka Universal water sensors from manufacturer data even when service UUIDs are omitted',
);
const mopekaWaterAllowlistResult = upsertScannerDeviceList([], [anonymousMopekaWater], {
  reason: 'release_scan_mopeka_water_signature',
  now: NOW + 850,
  requireBrandAllowlistMatch: true,
});
assert.strictEqual(
  mopekaWaterAllowlistResult.devices.length,
  1,
  'release scans must keep unknown-label Mopeka water sensors visible when their BLE signature is present',
);

const mopekaUniversalServiceData = Buffer.from([
  0x0c, 0x91, 0x45, 0x44, 0x11, 0x01, 0x00, 0x00, 0x00, 0x00,
]).toString('base64');
const anonymousMopekaWaterServiceData = {
  id: '1B4C7E',
  source: 'ble',
  displayName: 'Unknown device 4C7E',
  rssi: -56,
  lastSeenAt: NOW + 875,
  raw: {
    serviceData: {
      fee5: mopekaUniversalServiceData,
    },
  },
};
assert.strictEqual(
  isLikelyPowerScannerDevice(anonymousMopekaWaterServiceData),
  true,
  'release allowlist filtering must recognize Mopeka Universal water sensors from serviceData payloads',
);
const mopekaWaterServiceDataAllowlistResult = upsertScannerDeviceList([], [anonymousMopekaWaterServiceData], {
  reason: 'release_scan_mopeka_water_service_data',
  now: NOW + 875,
  requireBrandAllowlistMatch: true,
});
assert.strictEqual(
  mopekaWaterServiceDataAllowlistResult.devices.length,
  1,
  'release scans must keep unknown-label Mopeka water sensors visible when their BLE signature is exposed as serviceData',
);

const exactUnknownMopekaWaterServiceData = {
  id: '1B4C7F',
  source: 'ble',
  displayName: 'Unknown device',
  rssi: -56,
  lastSeenAt: NOW + 876,
  raw: {
    serviceData: {
      fee5: mopekaUniversalServiceData,
    },
  },
};
const exactUnknownMopekaWaterServiceDataResult = upsertScannerDeviceList([], [exactUnknownMopekaWaterServiceData], {
  reason: 'release_scan_exact_unknown_mopeka_water_service_data',
  now: NOW + 876,
  requireBrandAllowlistMatch: true,
});
assert.strictEqual(
  exactUnknownMopekaWaterServiceDataResult.devices.length,
  1,
  'release scans must not hide exact Unknown device labels when Mopeka liquid serviceData proves an approved tank sensor',
);
assert.deepStrictEqual(
  exactUnknownMopekaWaterServiceDataResult.dropReasons,
  [],
  'Mopeka liquid serviceData should bypass generic unknown-BLE suppression instead of being logged as unknown_ble_hidden',
);

const td40MopekaLiquidModel = {
  id: 'td40-liquid',
  source: 'ble',
  displayName: 'TD40',
  rssi: -57,
  lastSeenAt: NOW + 900,
};
assert.strictEqual(
  isLikelyPowerScannerDevice(td40MopekaLiquidModel),
  true,
  'release allowlist filtering must recognize Mopeka TD40 liquid model names as approved tank sensors',
);
const td40MopekaLiquidModelResult = upsertScannerDeviceList([], [td40MopekaLiquidModel], {
  reason: 'release_scan_mopeka_td40_liquid_model',
  now: NOW + 900,
  requireBrandAllowlistMatch: true,
});
assert.strictEqual(
  td40MopekaLiquidModelResult.devices.length,
  1,
  'release scans must keep Mopeka TD40 liquid model rows visible instead of dropping them as allowlist misses',
);
assert.deepStrictEqual(td40MopekaLiquidModelResult.dropReasons, []);

const anonymousWithHints = {
  source: 'ble',
  displayName: 'Unknown device A1B2',
  rssi: -47,
  lastSeenAt: NOW + 1_000,
  raw: {
    manufacturerData: 'ffee001122',
  },
};
const fallbackKey = getScannerDeviceStableKey(anonymousWithHints, NOW + 1_000);
assert(fallbackKey && fallbackKey.startsWith('temporary:ble:unknowndevicea1b2:ffee001122:-50:'));

const fallbackResult = upsertScannerDeviceList(duplicateResult.devices, [anonymousWithHints], {
  reason: 'unnamed_ble_fallback',
  now: NOW + 1_000,
});
assert.strictEqual(fallbackResult.devices.length, 2);
assert.strictEqual(fallbackResult.upserted, 1);
assert(
  fallbackResult.devices.some((device) => device.displayName === 'Unknown device A1B2'),
  'devices without hardware ids must remain visible when they have fallback hints',
);

const stalePruned = pruneStaleScannerDevices(fallbackResult.devices, {
  now: NOW + 91_000,
  staleAfterMs: 90_000,
});
assert.strictEqual(stalePruned.length, 1);
assert(
  stalePruned.every((device) => device.lastSeenAt >= NOW + 1_000),
  'stale scanner advertisements should be removed after the configured timeout',
);

const sourceFailureNoOp = upsertScannerDeviceList(fallbackResult.devices, [], {
  reason: 'ecoflow_api_failed',
  now: NOW + 2_000,
});
assert.strictEqual(sourceFailureNoOp.devices.length, 2);
assert.deepStrictEqual(sourceFailureNoOp.dropReasons, []);

const ecoflowCloudDevices = Array.from({ length: 5 }, (_, index) => ({
  id: `ecoflow-cloud-${index + 1}`,
  source: 'api',
  sources: ['api'],
  displayName: index === 0 ? 'GLACIER-1224' : `EcoFlow Device ${index + 1}`,
  brand: 'EcoFlow',
  model: index === 0 ? 'GLACIER' : 'DELTA',
  lastSeenAt: NOW + 2_500 + index,
}));
const ecoflowApiSuccess = upsertScannerDeviceList([], ecoflowCloudDevices, {
  reason: 'ecoflow_api_success',
  now: NOW + 2_500,
});
assert.strictEqual(ecoflowApiSuccess.devices.length, 5);
assert.strictEqual(ecoflowApiSuccess.upserted, 5);

const bleRuntimeUnsupportedAfterApiSuccess = upsertScannerDeviceList(ecoflowApiSuccess.devices, [], {
  reason: 'ble_runtime_unsupported',
  now: NOW + 2_750,
});
assert.strictEqual(
  bleRuntimeUnsupportedAfterApiSuccess.devices.length,
  5,
  'a failing BLE/OBD source must not clear successful EcoFlow API scan results',
);
assert(
  bleRuntimeUnsupportedAfterApiSuccess.devices.some((device) => device.displayName === 'GLACIER-1224'),
  'EcoFlow Glacier should remain visible after native BLE runtime_unsupported',
);
assert.strictEqual(bleRuntimeUnsupportedAfterApiSuccess.upserted, 0);
assert.strictEqual(bleRuntimeUnsupportedAfterApiSuccess.dropped, 0);

const droppedResult = upsertScannerDeviceList(sourceFailureNoOp.devices, [{
  source: 'ble',
  rssi: -50,
  lastSeenAt: NOW + 3_000,
}], {
  reason: 'no_identifier_or_hints',
  now: NOW + 3_000,
});
assert.strictEqual(droppedResult.devices.length, 2);
assert.strictEqual(droppedResult.dropped, 1);
assert.deepStrictEqual(droppedResult.dropReasons, ['unknown_ble_hidden']);

const cleared = clearScannerDeviceList(droppedResult.devices, 'user_clear');
assert.deepStrictEqual(cleared, []);

assert.strictEqual(
  logs.filter((entry) => entry.message.includes('device_upserted') || entry.message.includes('device_deduped')).length,
  0,
  'routine scanner upsert/dedupe logs should stay quiet unless debug is enabled',
);

logs.length = 0;
upsertScannerDeviceList([], [first], {
  reason: 'debug_scan',
  now: NOW + 4_000,
  debug: true,
});
assert(
  logs.some((entry) => entry.message.includes('device_upserted')),
  'debug scan should log upserts for scanner diagnostics',
);
logs.length = 0;
upsertScannerDeviceList([first], [{
  ...first,
  rssi: -52,
  lastSeenAt: NOW + 4_500,
}], {
  reason: 'debug_scan_duplicate',
  now: NOW + 4_500,
  debug: true,
});
assert(
  logs.some((entry) => entry.message.includes('device_deduped')),
  'debug scan should log dedupes for scanner diagnostics',
);
logs.length = 0;
upsertScannerDeviceList([], [{
  source: 'ble',
  rssi: -50,
  lastSeenAt: NOW + 5_000,
}], {
  reason: 'debug_scan_drop',
  now: NOW + 5_000,
  debug: true,
});
assert(
  logs.some((entry) => entry.message.includes('device_dropped')),
  'debug scan should log dropped devices with a reason',
);
logs.length = 0;
clearScannerDeviceList(droppedResult.devices, 'debug_user_clear');
assert(
  logs.some((entry) => entry.message.includes('list_cleared')),
  'explicit scanner list clears should be logged with a reason',
);

console.log('Scanner device list state checks passed.');
