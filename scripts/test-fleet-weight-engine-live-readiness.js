const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const domainPath = path.join(root, 'lib', 'fleet', 'fleetPremiumDomain.ts');
const buildLoadoutPath = path.join(root, 'lib', 'fleet', 'fleetBuildLoadout.ts');
const profilePath = path.join(root, 'lib', 'fleet', 'fleetVehicleProfile.ts');
const weightSummaryPath = path.join(root, 'lib', 'fleet', 'fleetWeightSummary.ts');
const activeVehicleStatePath = path.join(root, 'lib', 'fleet', 'activeVehicleState.ts');

process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
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

const fleet = require(domainPath);
const buildLoadout = require(buildLoadoutPath);
const profile = require(profilePath);
const weightSummary = require(weightSummaryPath);
const activeVehicleState = require(activeVehicleStatePath);

function legacyVehicle(id, overrides = {}) {
  return {
    id,
    owner_user_id: 'user-1',
    name: overrides.name || id,
    type: overrides.type || 'truck',
    make: overrides.make ?? null,
    model: overrides.model ?? null,
    year: overrides.year ?? 2024,
    notes: null,
    created_at: '2026-05-05T00:00:00.000Z',
    updated_at: '2026-05-05T00:00:00.000Z',
    ...overrides,
  };
}

function toFleetVehicle(id, vehicleOverrides = {}, specs = null) {
  return fleet.adaptLegacyVehicleToFleetVehicle({
    vehicle: legacyVehicle(id, vehicleOverrides),
    specs,
    now: '2026-05-05T00:00:00.000Z',
  });
}

function resultFor(vehicle, accessories = [], loadoutItems = []) {
  return fleet.calculateFleetWeightResult(vehicle, accessories, loadoutItems);
}

const verifiedBase = toFleetVehicle('verified-user', { make: 'Toyota', model: 'Tacoma', type: 'truck' });
const verifiedVehicle = weightSummary.applyFleetWeightVerification(
  verifiedBase,
  {
    id: 'verify-base',
    vehicleId: verifiedBase.id,
    target: 'baseNetWeight',
    method: 'scale_ticket',
    sourceLabel: 'Scale ticket',
    recordedAt: '2026-05-05T00:00:00.000Z',
    weight: fleet.createFleetWeightValue(4880, 'scale_ticket', { sourceLabel: 'Scale ticket' }),
  },
);

const verifiedVehicleWithGvwr = weightSummary.applyFleetWeightVerification(
  verifiedVehicle,
  {
    id: 'verify-gvwr',
    vehicleId: verifiedVehicle.id,
    target: 'gvwr',
    method: 'scale_ticket',
    sourceLabel: 'Door placard',
    recordedAt: '2026-05-05T00:00:00.000Z',
    weight: fleet.createFleetWeightValue(6100, 'scale_ticket', { sourceLabel: 'Door placard' }),
  },
);
const verifiedResult = resultFor(verifiedVehicleWithGvwr);
assert.strictEqual(verifiedResult.baseNetWeight.lbs, 4880);
assert.strictEqual(verifiedResult.gvwr.lbs, 6100);
assert.strictEqual(verifiedResult.confidenceMetadata.level, 'verified');
assert.strictEqual(verifiedResult.payloadCapacity.lbs, 1220);

const ramUserSpecs = toFleetVehicle('ram-user', { make: 'Ram', model: '2500', type: 'truck' }, {
  base_weight_lb: 8300,
  gvwr_lb: 12345,
  fuel_tank_capacity_gal: 31,
  fuel_type: 'diesel',
});
const ramUserResult = resultFor(ramUserSpecs);
assert.strictEqual(ramUserResult.baseNetWeight.lbs, 8300, 'Saved user base weight must beat Ram defaults.');
assert.strictEqual(ramUserResult.gvwr.lbs, 12345, 'Saved user GVWR must beat Ram defaults.');
assert.ok(ramUserResult.confidenceMetadata.copy.includes('Confirm') || ramUserResult.confidenceMetadata.copy.includes('estimated'));

const noGvwrVehicle = {
  ...toFleetVehicle('no-gvwr', { make: null, model: null, type: null }),
  buildProfile: {
    ...toFleetVehicle('no-gvwr', { make: null, model: null, type: null }).buildProfile,
    baseNetWeight: fleet.createFleetWeightValue(4200, 'user_estimate', { sourceLabel: 'User-entered base weight' }),
    gvwr: null,
  },
};
const noGvwrResult = resultFor(noGvwrVehicle);
assert.strictEqual(noGvwrResult.payloadRemaining, null);
assert.strictEqual(noGvwrResult.gvwrUsagePct, null);
assert.strictEqual(noGvwrResult.confidenceMetadata.level, 'incomplete');
assert.ok(noGvwrResult.validationFlags.some((flag) => flag.id === 'missing-gvwr'));

const accessory = buildLoadout.buildFleetAccessoryInstall({
  accessoryId: 'roof_rack_platform',
  vehicleId: 'accessory-cargo',
  knowledgeMode: 'manual_weight',
  manualWeightLb: 120,
});
const cargo = {
  id: 'cargo-1',
  vehicleId: 'accessory-cargo',
  name: 'Recovery kit',
  category: 'recovery',
  quantity: 2,
  weight: fleet.createFleetWeightValue(40, 'scale_ticket', { sourceLabel: 'Measured recovery kit' }),
  loadZone: 'rearLow',
  isCritical: true,
  isPacked: true,
  display: fleet.buildFleetDisplayMetadata({ title: 'Recovery kit', vehicleType: 'cargo' }),
};
const accessoryCargoResult = resultFor(
  toFleetVehicle('accessory-cargo', { make: 'Toyota', model: 'Tacoma', type: 'truck' }, {
    base_weight_lb: 5000,
    gvwr_lb: 6200,
    fuel_tank_capacity_gal: 21,
    fuel_type: 'gas',
  }),
  [{
    id: accessory.id,
    vehicleId: 'accessory-cargo',
    name: accessory.name,
    installedWeight: fleet.createFleetWeightValue(accessory.installedWeightLb, accessory.source, {
      confidence: accessory.confidence,
      sourceLabel: accessory.name,
    }),
    loadZone: accessory.mountZone,
    display: fleet.buildFleetDisplayMetadata({ title: accessory.name, vehicleType: 'accessory' }),
  }],
  [cargo],
);
assert.strictEqual(accessoryCargoResult.installedAccessoryWeight.lbs, 120);
assert.strictEqual(accessoryCargoResult.activeLoadoutWeight.lbs, 80);
assert.strictEqual(accessoryCargoResult.operatingWeight.lbs, 5200);

const overloaded = resultFor(
  toFleetVehicle('overloaded', { make: 'Subaru', model: 'Outback', type: 'wagon' }, {
    base_weight_lb: 4500,
    gvwr_lb: 5000,
    fuel_tank_capacity_gal: 18,
    fuel_type: 'gas',
  }),
  [],
  [{
    ...cargo,
    id: 'heavy-cargo',
    weight: fleet.createFleetWeightValue(700, 'user_estimate', { sourceLabel: 'Heavy cargo estimate' }),
  }],
);
assert.ok(overloaded.payloadRemaining.lbs < 0);
assert.strictEqual(overloaded.gvwrOverageRisk, 'critical');
assert.ok(overloaded.validationFlags.some((flag) => flag.id === 'gvwr-overage'));

const expectedProfiles = [
  ['ram', { make: 'Ram', model: '2500', type: 'truck' }],
  ['tacoma', { make: 'Toyota', model: 'Tacoma', type: 'truck' }],
  ['wrangler', { make: 'Jeep', model: 'Wrangler', type: 'suv' }],
  ['f150', { make: 'Ford', model: 'F-150', type: 'truck' }],
  ['bronco', { make: 'Ford', model: 'Bronco', type: 'suv' }],
  ['colorado', { make: 'Chevy', model: 'Colorado', type: 'truck' }],
  ['4runner', { make: 'Toyota', model: '4Runner', type: 'suv' }],
  ['outback', { make: 'Subaru', model: 'Outback', type: 'wagon' }],
  ['generic-suv', { make: null, model: null, type: 'suv' }],
];
for (const [id, values] of expectedProfiles) {
  const vehicle = toFleetVehicle(`profile-${id}`, values);
  const result = resultFor(vehicle);
  assert.ok(result.baseNetWeight.lbs > 0, `${id} should have a usable base/class estimate.`);
  assert.ok(result.gvwr.lbs > 0, `${id} should have a usable GVWR/class estimate.`);
  if (id !== 'ram') {
    assert.notStrictEqual(result.baseNetWeight.sourceLabel, 'RAM 2500 unknown configuration ECS default');
    assert.notStrictEqual(result.baseNetWeight.lbs, 7400, `${id} must not inherit Ram 2500 base weight.`);
  }
}

const bigPayloadDraft = {
  ...profile.createEmptyFleetVehicleProfileDraft(),
  nickname: 'Implausible payload',
  make: 'Example',
  model: 'Huge',
  baseNetWeight: '2,000',
  gvwr: '15,000',
};
assert.ok(
  profile.validateFleetVehicleProfileDraft(bigPayloadDraft).some((error) => error.includes('10,000')),
  'Payload capacity over 10,000 lb should require explicit confirmation.',
);

const noVehicle = activeVehicleState.getActiveVehicleState(null);
assert.strictEqual(noVehicle.status, 'no_active_vehicle');
assert.strictEqual(noVehicle.weight.estimatedOperatingWeightLbs, null);

console.log('Fleet weight engine live-readiness checks passed.');
