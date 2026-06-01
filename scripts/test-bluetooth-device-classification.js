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
  classifyBluetoothDevice,
  formatBluetoothDisplayName,
} = loadTypeScriptModule('lib/bluetoothDevicePresentation.ts');
const {
  BLUETOOTH_BRAND_REGISTRY,
  matchBluetoothBrands,
} = loadTypeScriptModule('lib/bluetoothBrandRegistry.ts');
const { routeBluetoothDevice } = loadTypeScriptModule('lib/bluetoothDeviceRouting.ts');

for (const brandId of [
  'ecoflow',
  'bluetti',
  'anker_solix',
  'jackery',
  'goal_zero',
  'renogy',
  'redarc',
  'dakota_lithium',
  'veepeak_obd2',
]) {
  assert(
    BLUETOOTH_BRAND_REGISTRY.some((entry) => entry.id === brandId),
    `brand registry must include ${brandId}`,
  );
}

assert.strictEqual(
  formatBluetoothDisplayName({ id: 'AA:BB:CC:DD:EE:FF', name: '' }),
  'Unknown device EEFF',
  'unnamed devices should render a visible Unknown device fallback with a partial id',
);

const unnamedGeneric = classifyBluetoothDevice({
  id: 'AABBCCDDEEFF',
  name: '',
  isLikelyOBD: false,
  rssi: -67,
});
assert.strictEqual(unnamedGeneric.displayName, 'Unknown device EEFF');
assert.strictEqual(unnamedGeneric.providerBadge, null);
assert.strictEqual(unnamedGeneric.categoryHint, 'General Bluetooth device');

const bluettiByService = classifyBluetoothDevice({
  id: 'bluetti-1',
  name: '',
  isLikelyOBD: false,
  rssi: -58,
  serviceUUIDs: ['0000ff00-0000-1000-8000-00805f9b34fb'],
});
assert.strictEqual(bluettiByService.providerBadge, 'Bluetti');
assert.strictEqual(bluettiByService.brandLabel, 'Blue Eddy / BLUETTI');
assert.strictEqual(bluettiByService.categoryHint, 'Portable power station');

const blueEddyByName = classifyBluetoothDevice({
  id: 'blue-eddy-1',
  name: 'Blue Eddy AC200',
  isLikelyOBD: false,
  rssi: -61,
});
assert.strictEqual(blueEddyByName.providerBadge, 'Bluetti');
assert.strictEqual(blueEddyByName.brandLabel, 'Blue Eddy / BLUETTI');

const ankerSolixByName = classifyBluetoothDevice({
  id: 'solix-1',
  name: 'SOLIX C1000',
  isLikelyOBD: false,
  rssi: -59,
});
assert.strictEqual(ankerSolixByName.providerBadge, 'Anker SOLIX');
assert.strictEqual(ankerSolixByName.brandLabel, 'Anker / Solix');

const goalZeroByShortService = classifyBluetoothDevice({
  id: 'goal-zero-1',
  name: '',
  isLikelyOBD: false,
  rssi: -62,
  serviceUUIDs: ['ffd0'],
});
assert.strictEqual(goalZeroByShortService.providerBadge, 'Goal Zero');

const ecoflowByName = classifyBluetoothDevice({
  id: 'ecoflow-1',
  name: 'EcoFlow DELTA 2',
  isLikelyOBD: false,
  rssi: -61,
});
assert.strictEqual(ecoflowByName.providerBadge, 'EcoFlow');

const jackeryByName = classifyBluetoothDevice({
  id: 'jackery-1',
  name: 'Jackery Explorer 1000',
  isLikelyOBD: false,
  rssi: -72,
});
assert.strictEqual(jackeryByName.providerBadge, 'Jackery');

const renogyByManufacturer = classifyBluetoothDevice({
  id: 'renogy-1',
  name: '',
  isLikelyOBD: false,
  rssi: -71,
  manufacturerData: 'Renogy BT-2',
});
assert.strictEqual(renogyByManufacturer.providerBadge, 'Renogy');

const redarcByName = classifyBluetoothDevice({
  id: 'redarc-1',
  name: 'REDARC Manager30',
  isLikelyOBD: false,
  rssi: -66,
});
assert.strictEqual(redarcByName.providerBadge, 'Redarc');

const dakotaByName = classifyBluetoothDevice({
  id: 'dakota-1',
  name: 'Dakota Lithium Powerbox',
  isLikelyOBD: false,
  rssi: -64,
});
assert.strictEqual(dakotaByName.providerBadge, 'Dakota Lithium');
assert.strictEqual(dakotaByName.categoryHint, 'Lithium battery system');

const veepeakByName = classifyBluetoothDevice({
  id: 'veepeak-1',
  name: 'Veepeak BLE+ OBD2',
  isLikelyOBD: false,
  rssi: -65,
});
assert.strictEqual(veepeakByName.providerBadge, 'OBD');
assert.strictEqual(veepeakByName.brandLabel, 'V Peak / Veepeak OBD2');

const vPeakByName = classifyBluetoothDevice({
  id: 'vpeak-1',
  name: 'V Peak OBD2',
  isLikelyOBD: false,
  rssi: -65,
});
assert.strictEqual(vPeakByName.providerBadge, 'OBD');

const vPeakRouteFromName = routeBluetoothDevice({
  id: 'vpeak-route-name',
  name: 'V Peak OBD2',
  isLikelyOBD: false,
  rssi: -65,
});
assert.strictEqual(vPeakRouteFromName.owner, 'telemetry');
assert.strictEqual(vPeakRouteFromName.providerId, 'obd2');

const veepeakRouteFromManufacturer = routeBluetoothDevice({
  id: 'veepeak-route-manufacturer',
  name: '',
  manufacturerData: 'Veepeak OBDCheck BLE',
  isLikelyOBD: false,
  rssi: -65,
});
assert.strictEqual(veepeakRouteFromManufacturer.owner, 'telemetry');
assert.strictEqual(veepeakRouteFromManufacturer.providerId, 'obd2');

const ambiguousUart = classifyBluetoothDevice({
  id: 'uart-1',
  name: '',
  isLikelyOBD: false,
  rssi: -70,
  serviceUUIDs: ['ffe0'],
});
assert.strictEqual(
  ambiguousUart.providerBadge,
  null,
  'generic UART UUIDs should not be enough to misroute unnamed devices to a brand pipeline',
);

const bluettiRoute = routeBluetoothDevice({
  id: 'bluetti-route',
  name: '',
  isLikelyOBD: false,
  rssi: -58,
  serviceUUIDs: ['ff00'],
});
assert.strictEqual(bluettiRoute.owner, 'power');
assert.strictEqual(bluettiRoute.providerId, 'bluetti');

const dakotaRoute = routeBluetoothDevice({
  id: 'dakota-route',
  name: 'Dakota Lithium DL+',
  isLikelyOBD: false,
  rssi: -69,
});
assert.strictEqual(dakotaRoute.owner, 'power');
assert.strictEqual(dakotaRoute.providerId, 'dakota_lithium');

const unknownPowerRoute = routeBluetoothDevice({
  id: 'unknown-power-route',
  name: 'Portable Power Station 1500',
  isLikelyOBD: false,
  rssi: -63,
});
assert.strictEqual(unknownPowerRoute.owner, 'power');
assert.strictEqual(unknownPowerRoute.providerId, 'unknown_power');
assert.strictEqual(unknownPowerRoute.providerLabel, 'Unknown power device');
assert.strictEqual(unknownPowerRoute.supportLabel, 'Needs Identification');

const ambiguousMatch = classifyBluetoothDevice({
  id: 'ambiguous-route',
  name: 'Anker SOLIX OBD2',
  isLikelyOBD: true,
  rssi: -61,
});
assert.strictEqual(ambiguousMatch.providerBadge, null);
assert.strictEqual(ambiguousMatch.needsUserConfirmation, true);
assert(ambiguousMatch.matchedBrandLabels.includes('Anker / Solix'));
assert(ambiguousMatch.matchedBrandLabels.includes('V Peak / Veepeak OBD2'));

const ambiguousRoute = routeBluetoothDevice({
  id: 'ambiguous-route',
  name: 'Anker SOLIX OBD2',
  isLikelyOBD: true,
  rssi: -61,
});
assert.strictEqual(ambiguousRoute.owner, 'generic');
assert.strictEqual(ambiguousRoute.providerId, 'brand_confirmation');
assert.strictEqual(ambiguousRoute.needsUserConfirmation, true);

const providerServiceWins = routeBluetoothDevice({
  id: 'provider-service-wins',
  name: '',
  isLikelyOBD: true,
  rssi: -58,
  serviceUUIDs: ['0000ff00-0000-1000-8000-00805f9b34fb'],
});
assert.strictEqual(providerServiceWins.owner, 'power');
assert.strictEqual(providerServiceWins.providerId, 'bluetti');

const genericRoute = routeBluetoothDevice({
  id: 'generic-route',
  name: '',
  isLikelyOBD: false,
  rssi: -75,
});
assert.strictEqual(genericRoute.owner, 'generic');
assert.strictEqual(genericRoute.displayName, 'Unknown device OUTE');

const unknownBrandMatch = matchBluetoothBrands({
  id: 'unknown',
  name: '',
  isLikelyOBD: false,
});
assert.strictEqual(unknownBrandMatch.matches.length, 0);

console.log('Bluetooth device classification checks passed.');
