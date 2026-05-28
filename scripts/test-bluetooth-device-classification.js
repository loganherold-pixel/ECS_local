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
const {
  isReleaseScannerBluetoothRoute,
} = loadTypeScriptModule('lib/bluetoothDeviceRouting.ts');

for (const brandId of [
  'ecoflow',
  'bluetti',
  'anker_solix',
  'jackery',
  'goal_zero',
  'renogy',
  'redarc',
  'dakota_lithium',
  'victron',
  'veepeak_obd2',
  'mopeka_propane',
  'water_level_monitor',
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

const ecoflowDelta3ByName = classifyBluetoothDevice({
  id: 'ecoflow-delta3',
  name: 'Delta 3-1500-5055',
  isLikelyOBD: false,
  rssi: -60,
});
assert.strictEqual(ecoflowDelta3ByName.providerBadge, 'EcoFlow');

const ecoflowAlternatorByName = classifyBluetoothDevice({
  id: 'ecoflow-alternator',
  name: 'EcoFlow 800W Alternator Charger',
  isLikelyOBD: false,
  rssi: -60,
});
assert.strictEqual(ecoflowAlternatorByName.providerBadge, 'EcoFlow');

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

const renologyTypoByName = classifyBluetoothDevice({
  id: 'renology-1',
  name: 'Renology BT-2 Solar Controller',
  isLikelyOBD: false,
  rssi: -66,
});
assert.strictEqual(renologyTypoByName.providerBadge, 'Renogy');

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

const victronByName = classifyBluetoothDevice({
  id: 'victron-1',
  name: 'Victron SmartShunt',
  isLikelyOBD: false,
  rssi: -60,
});
assert.strictEqual(victronByName.providerBadge, 'Victron Energy');
const victronRoute = routeBluetoothDevice({
  id: 'victron-route',
  name: 'Victron SmartSolar',
  isLikelyOBD: false,
  rssi: -62,
});
assert.strictEqual(victronRoute.owner, 'power');
assert.strictEqual(victronRoute.providerId, 'victron');

const veepeakByName = classifyBluetoothDevice({
  id: 'veepeak-1',
  name: 'Veepeak BLE+ OBD2',
  isLikelyOBD: false,
  rssi: -65,
});
assert.strictEqual(veepeakByName.providerBadge, 'OBD');
assert.strictEqual(veepeakByName.brandLabel, 'V Peak / Veepeak OBD2');

for (const [id, name] of [
  ['obdcheck', 'OBDCheck BLE'],
  ['vp11', 'VP11 BLE'],
  ['vpake', 'VPake BLE'],
  ['vepeak', 'VePeak BLE'],
  ['ios-vlink', 'IOS-Vlink'],
  ['android-vlink', 'Android-Vlink'],
]) {
  const route = routeBluetoothDevice({
    id,
    name,
    isLikelyOBD: false,
    rssi: -63,
  });
  assert.strictEqual(route.owner, 'telemetry', `${name} should route to OBD2 telemetry`);
  assert.strictEqual(route.providerId, 'obd2');
  assert.strictEqual(isReleaseScannerBluetoothRoute(route), true);
}

const veepBleUartCandidate = routeBluetoothDevice({
  id: 'veepeak-uart-service',
  name: '',
  isLikelyOBD: true,
  rssi: -60,
  serviceUUIDs: ['0000ffe0-0000-1000-8000-00805f9b34fb'],
});
assert.strictEqual(veepBleUartCandidate.owner, 'telemetry');
assert.strictEqual(veepBleUartCandidate.providerId, 'obd2');
assert.strictEqual(veepBleUartCandidate.providerLabel, 'OBD2 Telemetry');
assert.strictEqual(isReleaseScannerBluetoothRoute(veepBleUartCandidate), true);

const propaneByName = classifyBluetoothDevice({
  id: 'propane-1',
  name: 'Mopeka Pro Check Propane',
  isLikelyOBD: false,
  rssi: -57,
});
assert.strictEqual(propaneByName.providerBadge, 'Propane');
assert.strictEqual(propaneByName.categoryHint, 'Propane level monitor');

const propaneRoute = routeBluetoothDevice({
  id: 'propane-route',
  name: 'Mopeka Tank Check',
  isLikelyOBD: false,
  rssi: -58,
});
assert.strictEqual(propaneRoute.owner, 'sensor');
assert.strictEqual(propaneRoute.providerId, 'propane_monitor');
assert.strictEqual(propaneRoute.deviceCategory, 'propane_monitor');
assert.strictEqual(propaneRoute.supportLabel, 'Live Sensor');
assert.strictEqual(isReleaseScannerBluetoothRoute(propaneRoute), true);

const waterByName = classifyBluetoothDevice({
  id: 'water-1',
  name: 'SeeLevel Fresh Water Tank Sensor',
  isLikelyOBD: false,
  rssi: -59,
});
assert.strictEqual(waterByName.providerBadge, 'Water');
assert.strictEqual(waterByName.categoryHint, 'Water / fluid level monitor');

const waterRoute = routeBluetoothDevice({
  id: 'water-route',
  name: 'Fresh Water Level Monitor',
  isLikelyOBD: false,
  rssi: -59,
});
assert.strictEqual(waterRoute.owner, 'sensor');
assert.strictEqual(waterRoute.providerId, 'water_monitor');
assert.strictEqual(waterRoute.deviceCategory, 'water_tank_monitor');
assert.strictEqual(waterRoute.supportLabel, 'Live Sensor');
assert.strictEqual(isReleaseScannerBluetoothRoute(waterRoute), true);

for (const [id, name] of [
  ['obdlink', 'OBDLink MX+'],
  ['vgate', 'Vgate iCar Pro'],
  ['bluedriver', 'BlueDriver OBDII'],
  ['konnwei', 'KONNWEI KW902'],
]) {
  const route = routeBluetoothDevice({
    id,
    name,
    isLikelyOBD: false,
    rssi: -64,
  });
  assert.strictEqual(route.owner, 'telemetry', `${name} should route to OBD2 telemetry`);
  assert.strictEqual(route.providerId, 'obd2');
  assert.strictEqual(isReleaseScannerBluetoothRoute(route), true);
}

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
assert.strictEqual(bluettiRoute.supportLabel, 'Native BLE');
assert(
  /decoded power fields/i.test(bluettiRoute.supportNote || ''),
  'BLUETTI route should explain live-ready decoded telemetry promotion instead of generic setup wording',
);
assert.strictEqual(isReleaseScannerBluetoothRoute(bluettiRoute), true);

const dakotaRoute = routeBluetoothDevice({
  id: 'dakota-route',
  name: 'Dakota Lithium DL+',
  isLikelyOBD: false,
  rssi: -69,
});
assert.strictEqual(dakotaRoute.owner, 'power');
assert.strictEqual(dakotaRoute.providerId, 'dakota_lithium');
assert.strictEqual(dakotaRoute.supportLabel, 'Native BLE');
assert.strictEqual(isReleaseScannerBluetoothRoute(dakotaRoute), true);

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
assert.strictEqual(isReleaseScannerBluetoothRoute(unknownPowerRoute), true);

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
assert.strictEqual(
  isReleaseScannerBluetoothRoute(ambiguousRoute),
  false,
  'ambiguous or noisy Bluetooth rows should not be visible in release scanner results',
);

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
assert.strictEqual(isReleaseScannerBluetoothRoute(genericRoute), false);

const headsetRoute = routeBluetoothDevice({
  id: 'consumer-headset',
  name: 'Logan Headphones',
  isLikelyOBD: false,
  rssi: -50,
});
assert.strictEqual(headsetRoute.owner, 'generic');
assert.strictEqual(isReleaseScannerBluetoothRoute(headsetRoute), false);

const tvRoute = routeBluetoothDevice({
  id: 'living-room-tv',
  name: 'Living Room TV',
  isLikelyOBD: false,
  rssi: -52,
});
assert.strictEqual(tvRoute.owner, 'generic');
assert.strictEqual(isReleaseScannerBluetoothRoute(tvRoute), false);

const unknownBrandMatch = matchBluetoothBrands({
  id: 'unknown',
  name: '',
  isLikelyOBD: false,
});
assert.strictEqual(unknownBrandMatch.matches.length, 0);

console.log('Bluetooth device classification checks passed.');
