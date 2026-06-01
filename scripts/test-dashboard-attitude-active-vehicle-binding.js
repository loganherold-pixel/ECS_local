/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypeScriptModule(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(root, relPath);
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  compileTypeScriptModule(mod, fullPath);
  return mod.exports;
}

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

require.extensions['.ts'] = compileTypeScriptModule;
require.extensions['.tsx'] = compileTypeScriptModule;
require.extensions['.png'] = (mod, filename) => {
  mod.exports = filename;
};

const {
  getVehicleAttitudeAssets,
  resolveVehicleAttitudeAssetId,
} = loadTypeScriptModule('lib/vehicles/vehicleAttitudeAssets.ts');

function createContext(vehicle) {
  return {
    activeVehicleId: vehicle?.id ?? null,
    hasActiveVehicleId: Boolean(vehicle?.id),
    hasVehicleContext: Boolean(vehicle),
    vehicle: vehicle ?? null,
    spec: null,
    wizardConfig: vehicle?.wizard_config ?? null,
  };
}

function assertVehicleVisual(vehicle, expectedKey, expectedFilename, fallbackUsed) {
  const context = createContext(vehicle);
  const visual = getVehicleAttitudeAssets(context.vehicle);
  assert.strictEqual(resolveVehicleAttitudeAssetId(context.vehicle), expectedKey);
  assert.ok(visual, `${expectedKey} should resolve to an asset.`);
  assert.strictEqual(visual.vehicleKey, expectedKey);
  assert.strictEqual(visual.vehicleId, expectedKey);
  assert.strictEqual(visual.fallbackUsed, fallbackUsed);
  assert.strictEqual(visual.sourceFilename, expectedFilename);
  assert.strictEqual(visual.attitudeImageSrc, `assets/vehicles/attitude/clean/${expectedFilename}`);
  assert.ok(String(visual.attitudeImageSource).endsWith(path.join('assets', 'vehicles', 'attitude', 'clean', expectedFilename)));
}

assertVehicleVisual(
  { id: 'wrangler', name: 'Rubicon', type: 'suv', make: 'Jeep', model: 'Wrangler', year: 2024 },
  'jeep_wrangler',
  'Jeep_Wrangler.png',
  false,
);
assertVehicleVisual(
  { id: 'ram1500', name: 'Camp truck', type: 'truck', make: 'Ram', model: '1500', year: 2024 },
  'ram_1500',
  'Ram_1500.png',
  false,
);
assertVehicleVisual(
  { id: 'ram3500', name: 'Tow rig', type: 'truck', make: 'Ram', model: '3500', year: 2024 },
  'ram_2500_3500',
  'Ram_2500_3500.png',
  false,
);
assertVehicleVisual(
  { id: 'tundra', name: 'Trail truck', type: 'truck', make: 'Toyota', model: 'Tundra', year: 2024 },
  'toyota_tundra',
  'Toyota_Tundra.png',
  false,
);
assertVehicleVisual(
  { id: 'unknown-pickup', name: 'Shop build', type: 'truck', make: 'Unknown', model: 'Trail Rig' },
  'generic_pickup',
  'Generic_Pickup.png',
  true,
);

const noVehicleVisual = getVehicleAttitudeAssets(null);
assert.ok(noVehicleVisual, 'Null vehicle profile should resolve to the generic SUV manifest asset.');
assert.strictEqual(noVehicleVisual.vehicleKey, 'generic_suv');
assert.strictEqual(noVehicleVisual.sourceFilename, 'Generic_SUV.png');

const dashboardSource = read('app/(tabs)/dashboard.tsx');
assert.ok(
  dashboardSource.includes('const [activeVehicleContextRevision') &&
    dashboardSource.includes('vehicleSetupStore.subscribe(syncActiveVehicleContext)') &&
    dashboardSource.includes('activeVehicleContext,'),
  'Dashboard should subscribe to active Fleet vehicle changes and pass activeVehicleContext into widgetData.',
);

const renderersSource = read('components/dashboard/WidgetRenderers.tsx');
const monitorWidgetStart = renderersSource.indexOf('const AttitudeMonitorWidget');
const monitorWidgetEnd = renderersSource.indexOf('}, areAttitudeMonitorWidgetPropsEqual);', monitorWidgetStart);
assert.ok(monitorWidgetStart >= 0 && monitorWidgetEnd > monitorWidgetStart, 'Dashboard AttitudeMonitorWidget block should be discoverable.');
const monitorWidgetSource = renderersSource.slice(monitorWidgetStart, monitorWidgetEnd);
assert.ok(
  renderersSource.includes('useDashboardActiveVehicleContext') &&
    renderersSource.includes('subscribeActiveVehicleState(bumpRevision)') &&
    renderersSource.includes('waitForActiveVehicleStateHydration()') &&
    renderersSource.includes('resolveAttitudeMonitorVehicleId(activeVehicleContext)') &&
    renderersSource.includes('vehicleId={attitudeVehicleId}') &&
    !renderersSource.includes('heroVehicle={heroVisual}'),
  'Dashboard attitude widgets should subscribe to the authoritative active Fleet vehicle context before resolving attitude imagery.',
);
assert.ok(
  renderersSource.includes('VEHICLE_PROFILE_IMAGE_KEY_BY_ATTITUDE_KEY') &&
    renderersSource.includes('function getVehicleProfileImageKeyFromAttitudeKey(vehicleKey: VehicleAttitudeKey): VehicleProfileImageKey') &&
    renderersSource.includes('imageKey: getVehicleProfileImageKeyFromAttitudeKey(attitudeVehicleId)') &&
    !renderersSource.includes('imageKey: getVehicleProfileImageKey(vehicleImageProfileInput)') &&
    !renderersSource.includes('function getAttitudeVehicleImageProfileInput'),
  'Dashboard Vehicle Profile imagery should derive from the same resolved active vehicle key as the Attitude Monitor image.',
);
assert.ok(
  renderersSource.includes("VehicleAttitudeStage from '../../src/features/attitude/components/VehicleAttitudeStage'") &&
    monitorWidgetSource.includes('<VehicleAttitudeStage') &&
    monitorWidgetSource.includes('pitchDeg={stagePitchDeg}') &&
    monitorWidgetSource.includes('rollDeg={stageRollDeg}') &&
    monitorWidgetSource.includes('showLiveHashIndicators={sensorLive}') &&
    monitorWidgetSource.includes('onZero={sensorLive ? handleZeroAttitudeStage : undefined}') &&
    monitorWidgetSource.includes('onPress={handleToggleSound}') &&
    monitorWidgetSource.includes('pointerEvents="box-none"') &&
    monitorWidgetSource.includes('setLocalZeroOffset({ rollDeg: attitudeTelemetry.rollDeg, pitchDeg: attitudeTelemetry.pitchDeg })') &&
    !monitorWidgetSource.includes('<AttitudeMonitorSurface'),
  'Dashboard AttitudeMonitorWidget should render VehicleAttitudeStage directly and keep zero fallback scoped to the widget.',
);

const fleetSource = read('app/(tabs)/fleet.tsx');
assert.ok(
  fleetSource.includes('vehicleSetupStore.setActiveVehicleId(vehicleId)') &&
    fleetSource.includes('vehicleSetupStore.setActiveVehicleId(result.vehicles[0].id)'),
  'Fleet should write the selected vehicle to vehicleSetupStore instead of a duplicate selected-vehicle source.',
);

const activeContextSource = read('lib/activeVehicleContext.ts');
assert.ok(activeContextSource.includes('vehicleMake'), 'Active vehicle context signature should include make.');
assert.ok(activeContextSource.includes('vehicleModel'), 'Active vehicle context signature should include model.');
assert.ok(activeContextSource.includes('vehicleType'), 'Active vehicle context signature should include body/type.');

console.log('Dashboard attitude active vehicle binding checks passed.');
