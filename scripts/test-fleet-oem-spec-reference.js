const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

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

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

const {
  resolveFleetOemSpecReference,
  FLEET_OEM_SPEC_REFERENCES,
  getFleetOemSpecReferenceCatalogStats,
} = require(path.join(root, 'lib', 'fleet', 'oemVehicleSpecs.ts'));
const {
  resolveFleetVehicleProfileSuggestion,
  createEmptyFleetVehicleProfileDraft,
} = require(path.join(root, 'lib', 'fleet', 'fleetVehicleProfile.ts'));
const {
  adaptLegacyVehicleToFleetVehicle,
} = require(path.join(root, 'lib', 'fleet', 'fleetPremiumDomain.ts'));

assert.ok(
  FLEET_OEM_SPEC_REFERENCES.length >= 50,
  'Fleet OEM reference catalog should include a broad seed set for common expedition vehicles.',
);
const catalogStats = getFleetOemSpecReferenceCatalogStats();
assert.ok(catalogStats.referenceCount >= 50, 'Fleet OEM catalog stats should expose the expanded reference count.');
assert.ok(catalogStats.makeCount >= 12, 'Fleet OEM catalog should cover major truck, SUV, crossover, and van manufacturers.');
assert.ok(catalogStats.vehicleTypes.includes('truck'), 'Fleet OEM catalog should include trucks.');
assert.ok(catalogStats.vehicleTypes.includes('suv'), 'Fleet OEM catalog should include SUVs.');
assert.ok(catalogStats.vehicleTypes.includes('crossover'), 'Fleet OEM catalog should include crossovers.');
assert.ok(catalogStats.vehicleTypes.includes('van'), 'Fleet OEM catalog should include vans.');
assert.strictEqual(catalogStats.earliestYearStart, 2010, 'Fleet OEM catalog should include 2010-era generation windows.');

function assertOemMatch(input, expected) {
  const match = resolveFleetOemSpecReference(input);
  assert.strictEqual(match.status, 'matched', `${input.year} ${input.make} ${input.model} should match an OEM reference.`);
  assert.strictEqual(match.reference.vehicleType, expected.vehicleType, `${input.make} ${input.model} should resolve as ${expected.vehicleType}.`);
  assert.ok(match.reference.specs.gvwr_lb > 0, `${input.make} ${input.model} should include GVWR.`);
  assert.ok(match.reference.specs.base_weight_lb > 0, `${input.make} ${input.model} should include base weight.`);
  assert.ok(match.reference.specs.fuel_tank_capacity_gal > 0, `${input.make} ${input.model} should include fuel capacity.`);
  if (expected.idIncludes) {
    assert.ok(match.reference.id.includes(expected.idIncludes), `${input.make} ${input.model} should prefer the ${expected.idIncludes} generation record.`);
  }
  return match;
}

const modernBronco = resolveFleetOemSpecReference({
  year: 2021,
  make: 'Ford',
  model: 'Bronco',
  vehicleType: 'suv',
});
assert.strictEqual(modernBronco.status, 'matched', '2021 Ford Bronco should match the modern OEM reference.');
assert.ok(modernBronco.reference.specs.fuel_tank_capacity_gal > 0, 'Bronco reference should include fuel capacity.');
assert.ok(modernBronco.reference.specs.ground_clearance_inches > 0, 'Bronco reference should include ground clearance.');
assert.ok(modernBronco.reference.specs.wheelbase_in > 0, 'Bronco reference should include wheelbase.');
assert.ok(modernBronco.message.includes('door placard'), 'OEM reference copy should remind users to verify payload-critical specs.');

const impossibleBronco = resolveFleetOemSpecReference({
  year: 2019,
  make: 'Ford',
  model: 'Bronco',
  vehicleType: 'suv',
});
assert.strictEqual(
  impossibleBronco.status,
  'unsupported_year',
  '2019 Ford Bronco should not silently receive the 2021+ OEM reference.',
);

const passportTrailSport = resolveFleetOemSpecReference({
  year: 2023,
  make: 'Honda',
  model: 'Passport',
  trim: 'TrailSport',
  vehicleType: 'truck',
});
assert.strictEqual(passportTrailSport.status, 'matched', '2023 Honda Passport TrailSport should match the SUV OEM reference even if a stale draft says truck.');
assert.strictEqual(passportTrailSport.reference.vehicleType, 'suv', 'Passport TrailSport reference should classify as SUV.');
assert.strictEqual(passportTrailSport.reference.specs.fuel_tank_capacity_gal, 19.5, 'Passport TrailSport reference should include fuel capacity.');
assert.strictEqual(passportTrailSport.reference.specs.fuel_type, 'gas', 'Passport TrailSport reference should include gas fuel type.');
assertOemMatch({ year: 2013, make: 'Jeep', model: 'Wrangler' }, { vehicleType: 'suv', idIncludes: 'jk' });
assertOemMatch({ year: 2024, make: 'Ford', model: 'Bronco Sport' }, { vehicleType: 'crossover', idIncludes: 'bronco-sport' });
assertOemMatch({ year: 2024, make: 'Chevy', model: 'Silverado 1500' }, { vehicleType: 'truck', idIncludes: '2019' });
assertOemMatch({ year: 2016, make: 'GMC', model: 'Yukon' }, { vehicleType: 'suv', idIncludes: '2010' });
assertOemMatch({ year: 2024, make: 'RAM', model: 'ProMaster' }, { vehicleType: 'van', idIncludes: 'promaster' });
assertOemMatch({ year: 2024, make: 'Toyota', model: 'Sequoia' }, { vehicleType: 'suv', idIncludes: '2023' });
assertOemMatch({ year: 2023, make: 'Subaru', model: 'Forester' }, { vehicleType: 'crossover', idIncludes: 'forester' });

const draft = {
  ...createEmptyFleetVehicleProfileDraft(),
  nickname: 'Trail Bronco',
  year: '2021',
  make: 'Ford',
  model: 'Bronco',
  vehicleType: 'suv',
};
const suggestion = resolveFleetVehicleProfileSuggestion(draft);
assert.strictEqual(suggestion.oemMatchStatus, 'matched', 'Fleet profile suggestions should expose OEM match status.');
assert.ok(suggestion.oemReference, 'Fleet profile suggestions should expose the matched OEM reference.');
assert.strictEqual(
  suggestion.baseNetWeight.source,
  'manufacturer_spec',
  'OEM profile suggestions should use manufacturer_spec source confidence.',
);
assert.ok(
  suggestion.confidenceExplanation.includes('Manual entries'),
  'OEM profile suggestion copy should preserve manual override precedence.',
);

const passportDraft = {
  ...createEmptyFleetVehicleProfileDraft(),
  nickname: 'Passport',
  year: '2023',
  make: 'Honda',
  model: 'Passport',
  trim: 'TrailSport',
};
const passportSuggestion = resolveFleetVehicleProfileSuggestion(passportDraft);
assert.strictEqual(passportSuggestion.oemMatchStatus, 'matched', 'Passport profile suggestions should expose the OEM match.');
assert.strictEqual(passportSuggestion.oemReference.vehicleType, 'suv', 'Passport profile suggestions should override the default draft truck type.');
assert.strictEqual(passportSuggestion.oemReference.specs.fuel_tank_capacity_gal, 19.5, 'Passport profile suggestions should carry OEM fuel capacity.');

const fleetVehicle = adaptLegacyVehicleToFleetVehicle({
  vehicle: {
    id: 'bronco-oem-test',
    owner_user_id: 'local',
    name: 'Trail Bronco',
    type: 'suv',
    make: 'Ford',
    model: 'Bronco',
    year: 2021,
    notes: null,
    fuel_tank_capacity_gal: modernBronco.reference.specs.fuel_tank_capacity_gal,
    avg_mpg: null,
    current_fuel_percent: 100,
    water_capacity_gal: null,
    current_water_gal: 0,
    water_updated_at: null,
    created_at: '2026-05-22T00:00:00.000Z',
    updated_at: '2026-05-22T00:00:00.000Z',
  },
  specs: {
    ...modernBronco.reference.specs,
    base_weight_lb: modernBronco.reference.specs.base_weight_lb,
    gvwr_lb: modernBronco.reference.specs.gvwr_lb,
    fuel_tank_capacity_gal: modernBronco.reference.specs.fuel_tank_capacity_gal,
  },
});
assert.strictEqual(
  fleetVehicle.buildProfile.overallWidthIn,
  modernBronco.reference.specs.overall_width_in,
  'Fleet build profile should carry OEM width into downstream vehicle-fit data.',
);
assert.strictEqual(
  fleetVehicle.buildProfile.approachAngleDeg,
  modernBronco.reference.specs.approach_angle_deg,
  'Fleet build profile should carry OEM approach angle into downstream vehicle-fit data.',
);

const profileModal = read('components/fleet/FleetVehicleProfileModal.tsx');
assert.ok(profileModal.includes('OEM REFERENCE'), 'Fleet profile modal should present OEM reference state.');
assert.ok(profileModal.includes('suggestion.oemReference.specs.ground_clearance_inches'), 'Fleet profile modal should show OEM clearance.');
assert.ok(profileModal.includes('oem_reference_id'), 'Fleet profile save should persist OEM reference metadata.');
assert.ok(profileModal.includes('overall_width_in'), 'Fleet profile save should persist OEM vehicle fit dimensions.');

console.log('Fleet OEM spec reference checks passed.');
