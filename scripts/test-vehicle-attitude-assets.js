const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = process.cwd();

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

function readPngDimensions(filename) {
  const buffer = fs.readFileSync(filename);
  assert.strictEqual(buffer.toString('hex', 0, 8), '89504e470d0a1a0a', `${filename} should be a PNG.`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

require.extensions['.ts'] = compileTypeScriptModule;
require.extensions['.png'] = (mod, filename) => {
  mod.exports = filename;
};

const EXPECTED_MANIFEST = {
  jeep_wrangler: 'Jeep_Wrangler.png',
  jeep_gladiator: 'Jeep_Gladiator.png',
  toyota_tacoma: 'Toyota_Tacoma.png',
  toyota_4runner: 'Toyota_4Runner.png',
  toyota_land_cruiser: 'Toyota_Landcruiser.png',
  ford_bronco: 'Ford_Bronco.png',
  ford_f150: 'Ford_F150.png',
  chevy_colorado: 'Chevy_Colorado.png',
  subaru_outback: 'Subaru_Outback.png',
  generic_suv: 'Generic_SUV.png',
  generic_pickup: 'Generic_Pickup.png',
  generic_van: 'Generic_Van.png',
  ram_1500: 'Ram_1500.png',
  toyota_sequoia: 'Toyota_Sequoia.png',
  lexus_lx: 'Lexus_Lx.png',
  ram_2500_3500: 'Ram_2500_3500.png',
  ford_super_duty: 'Ford_Super_Duty.png',
  nissan_frontier: 'Nissan_Frontier.png',
  nissan_xterra: 'Nissan_Xterra.png',
  mercedes_benz_sprinter: 'Mercedes_Sprinter.png',
  toyota_tundra: 'Toyota_Tundra.png',
};
const EXPECTED_ATTITUDE_COMPOSITE_DIMENSIONS = { width: 1448, height: 1086 };

const manifestSource = read('src/features/attitude/vehicleAttitudeAssetManifest.ts');
const registrySource = read('src/features/attitude/vehicleAttitudeAssets.ts');
const resolverSource = read('lib/vehicles/vehicleAttitudeAssets.ts');
const activeBackdropResolverSource = read('lib/attitudeMonitorVehicleVisual.ts');
const surfaceSource = read('components/attitude/AttitudeMonitorSurface.tsx');
const stageSource = read('src/features/attitude/components/VehicleAttitudeStage.tsx');
const gaugeAssetsSource = read('src/features/attitude/attitudeGaugeAssets.ts');
const monitorWidgetSource = read('components/detail/AttitudeMonitorWidget.tsx');
const widgetRenderersSource = read('components/dashboard/WidgetRenderers.tsx');

assert.ok(
  manifestSource.includes('VEHICLE_ATTITUDE_ASSET_MANIFEST'),
  'Composite attitude image manifest should exist.',
);
assert.ok(
  registrySource.includes('VEHICLE_ATTITUDE_ASSETS') &&
    registrySource.includes('DEFAULT_ATTITUDE_GEOMETRY') &&
    registrySource.includes('Object.entries(VEHICLE_ATTITUDE_ASSET_MANIFEST)'),
  'Registry should combine the explicit manifest with shared attitude geometry.',
);
assert.ok(
  registrySource.includes('Missing vehicle attitude asset for vehicleId') &&
    registrySource.includes('Falling back to Toyota Tacoma'),
  'Registry should warn when falling back for missing vehicle IDs.',
);
assert.ok(
  stageSource.includes('getVehicleAttitudeAsset(vehicleId)') &&
    stageSource.includes('source={asset.attitudeImageSource}') &&
    stageSource.includes("import AttitudeGauge from '../../../components/attitudeCommand/AttitudeGauge'") &&
    stageSource.includes('<AttitudeGauge') &&
    stageSource.includes('valueDeg={value}') &&
    stageSource.includes('pointerEvents="none"') &&
    stageSource.includes('vehicle-attitude-stage-missing-asset'),
  'VehicleAttitudeStage should resolve images by vehicleId, use the reusable AttitudeGauge component, and report missing assets.',
);
assert.ok(
  gaugeAssetsSource.includes('export const GAUGE_COMPLETE_SRC') &&
    gaugeAssetsSource.includes('export const GAUGE_TICKS_SRC') &&
    gaugeAssetsSource.includes('export const GAUGE_NUMBERS_SRC') &&
    gaugeAssetsSource.includes('export const GAUGE_INDICATOR_SRC') &&
    gaugeAssetsSource.includes("require('../../../assets/ecs/attitude/gauge-complete.png')") &&
    gaugeAssetsSource.includes("require('../../../assets/ecs/attitude/gauge-ticks.png')") &&
    gaugeAssetsSource.includes("require('../../../assets/ecs/attitude/gauge-numbers.png')") &&
    gaugeAssetsSource.includes("require('../../../assets/ecs/attitude/gauge-indicator.png')") &&
    !gaugeAssetsSource.includes('Ram_2500_3500') &&
    !gaugeAssetsSource.includes('FALLBACK_ATTITUDE_BACKDROP_SRC'),
  'Gauge asset constants should expose only the static reusable gauge layers and no production vehicle backdrop.',
);

const {
  VEHICLE_ATTITUDE_ASSET_MANIFEST,
  VEHICLE_ATTITUDE_ASSET_MANIFEST_COUNT,
} = loadTypeScriptModule('src/features/attitude/vehicleAttitudeAssetManifest.ts');
const {
  VEHICLE_ATTITUDE_ASSETS,
  VEHICLE_ATTITUDE_ASSET_COUNT,
  DEFAULT_ATTITUDE_GEOMETRY,
  getVehicleAttitudeAsset,
} = loadTypeScriptModule('src/features/attitude/vehicleAttitudeAssets.ts');
const {
  DEFAULT_MAX_PITCH_DEG,
  DEFAULT_MAX_ROLL_DEG,
  DEFAULT_TICK_TRAVEL_Y,
  LANDSCAPE_LEFT_SIGN,
  LANDSCAPE_RIGHT_SIGN,
  PITCH_UI_SIGN,
  ROLL_UI_SIGN,
  clamp,
  safeDeg,
} = loadTypeScriptModule('src/features/attitude/vehicleAttitudeTuning.ts');
const {
  getVehicleAttitudeAssets,
  resolveVehicleAttitudeAssetId,
} = loadTypeScriptModule('lib/vehicles/vehicleAttitudeAssets.ts');

assert.strictEqual(VEHICLE_ATTITUDE_ASSET_MANIFEST_COUNT, 21, 'Manifest should contain exactly 21 composite attitude images.');
assert.strictEqual(VEHICLE_ATTITUDE_ASSET_COUNT, 21, 'Registry should expose exactly 21 composite attitude assets.');
assert.strictEqual(DEFAULT_MAX_PITCH_DEG, 30, 'Default pitch travel limit should remain easy to tune from the shared module.');
assert.strictEqual(DEFAULT_MAX_ROLL_DEG, 30, 'Default roll travel limit should remain easy to tune from the shared module.');
assert.strictEqual(DEFAULT_TICK_TRAVEL_Y, 170, 'Default cyan tick travel should remain easy to tune from the shared module.');
assert.strictEqual(PITCH_UI_SIGN, -1, 'Pitch UI sign should preserve the existing ECS convention.');
assert.strictEqual(ROLL_UI_SIGN, -1, 'Roll UI sign should preserve the existing ECS convention.');
assert.strictEqual(LANDSCAPE_LEFT_SIGN, 1, 'Landscape-left attitude mapping sign should remain easy to tune.');
assert.strictEqual(LANDSCAPE_RIGHT_SIGN, 1, 'Landscape-right attitude mapping sign should remain easy to tune.');
assert.strictEqual(clamp(42, -10, 10), 10, 'clamp should constrain high values.');
assert.strictEqual(clamp(-42, -10, 10), -10, 'clamp should constrain low values.');
assert.strictEqual(clamp(4.2, -10, 10), 4.2, 'clamp should preserve in-range values.');
assert.strictEqual(safeDeg(null), 0, 'safeDeg should normalize null telemetry.');
assert.strictEqual(safeDeg(undefined), 0, 'safeDeg should normalize undefined telemetry.');
assert.strictEqual(safeDeg(Number.NaN), 0, 'safeDeg should normalize NaN telemetry.');
assert.strictEqual(safeDeg(Number.POSITIVE_INFINITY), 0, 'safeDeg should normalize infinite telemetry.');
assert.strictEqual(safeDeg('4.2'), 4.2, 'safeDeg should accept finite numeric telemetry strings.');

const expectedGaugeAssets = {
  'gauge-complete.png': { width: 1288, height: 395 },
  'gauge-ticks.png': { width: 1316, height: 422 },
  'gauge-numbers.png': { width: 1298, height: 282 },
  'gauge-indicator.png': { width: 142, height: 644 },
};
for (const [filename, dimensions] of Object.entries(expectedGaugeAssets)) {
  const assetPath = path.join(root, 'assets', 'ecs', 'attitude', filename);
  assert.ok(fs.existsSync(assetPath), `${filename} should exist as a local offline attitude gauge asset.`);
  assert.deepStrictEqual(readPngDimensions(assetPath), dimensions, `${filename} should keep its expected transparent PNG dimensions.`);
}
assert.deepStrictEqual(
  Object.keys(VEHICLE_ATTITUDE_ASSET_MANIFEST).sort(),
  Object.keys(EXPECTED_MANIFEST).sort(),
  'Manifest should map the expected ECS vehicle IDs.',
);

for (const [vehicleId, sourceFilename] of Object.entries(EXPECTED_MANIFEST)) {
  const manifestEntry = VEHICLE_ATTITUDE_ASSET_MANIFEST[vehicleId];
  const registryEntry = VEHICLE_ATTITUDE_ASSETS[vehicleId];
  assert.ok(manifestEntry, `${vehicleId} should be in the manifest.`);
  assert.ok(registryEntry, `${vehicleId} should be in the registry.`);
  assert.strictEqual(manifestEntry.vehicleId, vehicleId, `${vehicleId} manifest vehicleId mismatch.`);
  assert.strictEqual(manifestEntry.sourceFilename, sourceFilename, `${vehicleId} should use exact filename ${sourceFilename}.`);
  assert.strictEqual(
    manifestEntry.attitudeImageSrc,
    `assets/vehicles/attitude/clean/${sourceFilename}`,
    `${vehicleId} should expose the exact manifest image path.`,
  );
  assert.ok(
    String(manifestEntry.attitudeImageSource).endsWith(path.join('assets', 'vehicles', 'attitude', 'clean', sourceFilename)),
    `${vehicleId} bundled source should resolve to ${sourceFilename}.`,
  );
  assert.strictEqual(registryEntry.sourceFilename, sourceFilename, `${vehicleId} registry filename mismatch.`);
  assert.strictEqual(registryEntry.aspectRatio, 1753 / 1024, `${vehicleId} should inherit default aspect ratio.`);
  assert.deepStrictEqual(registryEntry.viewBox, DEFAULT_ATTITUDE_GEOMETRY.viewBox, `${vehicleId} should inherit default viewBox.`);
  assert.deepStrictEqual(registryEntry.pitchPanel, DEFAULT_ATTITUDE_GEOMETRY.pitchPanel, `${vehicleId} should inherit pitch panel geometry.`);
  assert.deepStrictEqual(registryEntry.rollPanel, DEFAULT_ATTITUDE_GEOMETRY.rollPanel, `${vehicleId} should inherit roll panel geometry.`);
  assert.deepStrictEqual(registryEntry.zeroButtonAnchor, DEFAULT_ATTITUDE_GEOMETRY.zeroButtonAnchor, `${vehicleId} should inherit zero button anchor.`);

  const assetPath = path.join(root, 'assets', 'vehicles', 'attitude', 'clean', sourceFilename);
  assert.ok(fs.existsSync(assetPath), `${sourceFilename} should exist on disk.`);
  assert.deepStrictEqual(
    readPngDimensions(assetPath),
    EXPECTED_ATTITUDE_COMPOSITE_DIMENSIONS,
    `${sourceFilename} should be the standardized ${EXPECTED_ATTITUDE_COMPOSITE_DIMENSIONS.width}x${EXPECTED_ATTITUDE_COMPOSITE_DIMENSIONS.height} composite image.`,
  );
}

function assertResolved(profile, expectedVehicleId, expectedFilename, fallbackUsed) {
  assert.strictEqual(resolveVehicleAttitudeAssetId(profile), expectedVehicleId);
  const resolved = getVehicleAttitudeAssets(profile);
  assert.ok(resolved, `${expectedVehicleId} should resolve to a registry asset.`);
  assert.strictEqual(resolved.vehicleKey, expectedVehicleId);
  assert.strictEqual(resolved.vehicleId, expectedVehicleId);
  assert.strictEqual(resolved.fallbackUsed, fallbackUsed);
  assert.strictEqual(resolved.sourceFilename, expectedFilename);
  assert.strictEqual(
    resolved.attitudeImageSrc,
    `assets/vehicles/attitude/clean/${expectedFilename}`,
    `${expectedVehicleId} should expose the exact manifest image path.`,
  );
  assert.ok(
    String(resolved.attitudeImageSource).endsWith(path.join('assets', 'vehicles', 'attitude', 'clean', expectedFilename)),
    `${expectedVehicleId} should resolve to ${expectedFilename}.`,
  );
}

assertResolved({ make: 'Jeep', model: 'Wrangler' }, 'jeep_wrangler', 'Jeep_Wrangler.png', false);
assertResolved({ make: 'Toyota', model: 'Tacoma' }, 'toyota_tacoma', 'Toyota_Tacoma.png', false);
assertResolved({ make: 'Toyota', model: 'Land Cruiser' }, 'toyota_land_cruiser', 'Toyota_Landcruiser.png', false);
assertResolved({ make: 'Ford', model: 'F-150' }, 'ford_f150', 'Ford_F150.png', false);
assertResolved({ make: 'Ford', model: 'F-350' }, 'ford_super_duty', 'Ford_Super_Duty.png', false);
assertResolved({ make: 'Ram', model: '3500' }, 'ram_2500_3500', 'Ram_2500_3500.png', false);
assertResolved({ make: 'Nissan', model: 'Frontier' }, 'nissan_frontier', 'Nissan_Frontier.png', false);
assertResolved({ make: 'Toyota', model: 'Tundra' }, 'toyota_tundra', 'Toyota_Tundra.png', false);
assertResolved({ make: 'Unknown', model: 'Trail Rig', bodyType: 'truck' }, 'generic_pickup', 'Generic_Pickup.png', true);

const missingFallback = getVehicleAttitudeAsset('missing_vehicle_id');
assert.strictEqual(missingFallback.vehicleId, 'toyota_tacoma', 'Missing vehicleId should fall back to Toyota Tacoma.');
assert.strictEqual(missingFallback.sourceFilename, 'Toyota_Tacoma.png', 'Missing vehicleId fallback should use the Toyota Tacoma composite.');

assert.ok(
  !resolverSource.includes("require('../../assets/vehicles/attitude") &&
    !resolverSource.includes('sideAsset') &&
    !resolverSource.includes('rearAsset'),
  'Vehicle attitude resolver should not hardcode image paths or side/rear assets.',
);
assert.ok(
  activeBackdropResolverSource.includes('export function resolveVehicleAttitudeBackdrop') &&
    activeBackdropResolverSource.includes('export function getVehicleAttitudeBackdropSrc') &&
    activeBackdropResolverSource.includes('export function useActiveVehicleAttitudeBackdrop') &&
    activeBackdropResolverSource.includes('createVehicleAttitudeProfileInput(context)') &&
    activeBackdropResolverSource.includes('getVehicleAttitudeAssets(vehicleProfile)') &&
    activeBackdropResolverSource.includes('vehicleSetupStore.subscribe(sync)') &&
    activeBackdropResolverSource.includes('vehicleSpecStore.subscribe(sync)') &&
    activeBackdropResolverSource.includes('vehicleStore.subscribe(() => sync())'),
  'Active attitude backdrop resolver should derive from active Fleet vehicle context and subscribe to vehicle changes.',
);
assert.ok(
  !activeBackdropResolverSource.includes('FALLBACK_ATTITUDE_BACKDROP_SRC') &&
    !activeBackdropResolverSource.includes('Ram_2500_3500.png') &&
    !activeBackdropResolverSource.includes("attitudeVehicleId: 'ram_2500_3500'") &&
    !activeBackdropResolverSource.includes('backdropSrc: "assets/vehicles/attitude/clean/Ram_2500_3500.png"'),
  'Active attitude backdrop resolver should not hardcode the Ram reference asset as the production backdrop.',
);
assert.ok(
  surfaceSource.includes('VehicleAttitudeStage') &&
    surfaceSource.includes('vehicleId?: string | null') &&
    surfaceSource.includes('vehicleId={resolvedVehicleId}') &&
    !surfaceSource.includes('sideAsset=') &&
    !surfaceSource.includes('rearAsset='),
  'Attitude surface should render VehicleAttitudeStage by vehicleId without old side/rear image assets.',
);
assert.ok(
  monitorWidgetSource.includes('useActiveAttitudeMonitorVehicleId()') &&
    monitorWidgetSource.includes('vehicleId={attitudeVehicleId}') &&
    !monitorWidgetSource.includes('heroVehicle='),
  'Detail AttitudeMonitorWidget should pass only the resolved vehicleId into the attitude surface.',
);
assert.ok(
  widgetRenderersSource.includes('useDashboardActiveVehicleContext') &&
    widgetRenderersSource.includes('resolveAttitudeMonitorVehicleId(activeVehicleContext)') &&
    widgetRenderersSource.includes('vehicleId={attitudeVehicleId}') &&
    !widgetRenderersSource.includes('heroVehicle={heroVisual}'),
  'Dashboard Attitude Monitor and Attitude Command widgets should pass the live active vehicleId, not hardcoded paths or hero assets.',
);

console.log('Vehicle attitude composite asset manifest checks passed.');
