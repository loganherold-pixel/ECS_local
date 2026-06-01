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
