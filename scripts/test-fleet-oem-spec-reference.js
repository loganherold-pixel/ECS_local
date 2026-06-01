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
  resolveFleetOemSpecSuggestionCandidates,
  FLEET_OEM_SPEC_REFERENCES,
  getFleetOemSpecReferenceCatalogStats,
} = require(path.join(root, 'lib', 'fleet', 'oemVehicleSpecs.ts'));
const {
  applyFleetProfilePrefillOption,
  resolveFleetVehicleProfileFieldPlaceholder,
  resolveFleetVehicleProfileSuggestion,
  resolveFleetVehicleProfilePrefillOptions,
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
assert.ok(
  catalogStats.matchLevelCounts.configuration >= 12,
  'Fleet OEM catalog should include a practical seed set of trim/configuration-specific ECS vehicle picks.',
);
assert.ok(
  catalogStats.matchLevelCounts.trim >= 3,
  'Fleet OEM catalog should include trim-specific ECS vehicle picks where full configuration is not bundled.',
);

const configurationSeedTypes = new Set(
  FLEET_OEM_SPEC_REFERENCES
    .filter((reference) => reference.matchLevel === 'configuration')
    .map((reference) => reference.vehicleType),
);
assert.ok(configurationSeedTypes.has('truck'), 'Configuration seed catalog should include trucks.');
assert.ok(configurationSeedTypes.has('suv'), 'Configuration seed catalog should include SUVs.');
assert.ok(configurationSeedTypes.has('crossover'), 'Configuration seed catalog should include crossovers.');
assert.ok(configurationSeedTypes.has('van'), 'Configuration seed catalog should include vans.');

const requiredSeedIds = [
  'toyota-4runner-trd-off-road-4wd-2014-reference',
  'lexus-gx-460-4wd-2010-reference',
  'ford-bronco-badlands-4door-4x4-2021-reference',
  'jeep-wrangler-rubicon-unlimited-4x4-2018-reference',
  'subaru-outback-wilderness-2022-reference',
  'ford-transit-awd-148-high-roof-2020-reference',
  'mercedes-sprinter-2500-awd-144-high-roof-2023-reference',
  'chevrolet-colorado-zr2-crew-4wd-2023-reference',
  'nissan-frontier-pro-4x-crew-4wd-2022-reference',
  'toyota-tundra-trd-pro-crewmax-4x4-2022-reference',
];
for (const seedId of requiredSeedIds) {
  const seed = FLEET_OEM_SPEC_REFERENCES.find((reference) => reference.id === seedId);
  assert.ok(seed, `Fleet OEM configuration seed catalog should include ${seedId}.`);
  assert.ok(seed.confidence >= 88, `${seedId} should carry manufacturer-spec confidence.`);
  assert.ok(seed.engine, `${seedId} should include bundled engine identity.`);
  assert.ok(seed.drivetrain, `${seedId} should include bundled drivetrain identity.`);
  assert.ok(seed.specs.overall_width_in > 0, `${seedId} should include OEM width for vehicle fit.`);
  assert.ok(seed.specs.turning_diameter_ft > 0, `${seedId} should include turning diameter for maneuverability planning.`);
}

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

const partialTacomaCandidates = resolveFleetOemSpecSuggestionCandidates({
  year: 2024,
  make: 'Toyota',
  model: 'Tac',
  vehicleType: 'truck',
});
assert.ok(
  partialTacomaCandidates.length > 0,
  'Partial model typing should return ECS vehicle pick candidates.',
);
assert.strictEqual(
  partialTacomaCandidates[0].matchLevel,
  'configuration',
  'Trim/configuration-specific ECS vehicle picks should rank above generic model matches.',
);
assert.ok(
  /Tacoma/i.test(partialTacomaCandidates[0].label) && /TRD Pro/i.test(partialTacomaCandidates[0].label),
  'Top partial Tacoma pick should include the vehicle model and trim in the selectable label.',
);

const partial4RunnerCandidates = resolveFleetOemSpecSuggestionCandidates({
  year: 2024,
  make: 'Toyota',
  model: '4r',
  vehicleType: 'suv',
});
assert.ok(partial4RunnerCandidates.length > 0, 'Partial 4Runner typing should return ECS vehicle pick candidates.');
assert.strictEqual(
  partial4RunnerCandidates[0].id,
  'toyota-4runner-trd-off-road-4wd-2014-reference',
  'Trim/configuration seed picks should rank above the generic 4Runner model reference.',
);

const partialSprinterCandidates = resolveFleetOemSpecSuggestionCandidates({
  year: 2024,
  make: 'Mercedes',
  model: 'Spr',
  vehicleType: 'van',
});
assert.strictEqual(
  partialSprinterCandidates[0].id,
  'mercedes-sprinter-2500-awd-144-high-roof-2023-reference',
  'Van seed picks should support partial model typing and rank a full configuration first.',
);

const genericTacomaMatch = resolveFleetOemSpecReference({
  year: 2024,
  make: 'Toyota',
  model: 'Tacoma',
  vehicleType: 'truck',
});
const trimTacomaMatch = resolveFleetOemSpecReference({
  year: 2024,
  make: 'Toyota',
  model: 'Tacoma',
  trim: 'TRD Pro',
  engine: 'i-FORCE MAX hybrid turbo',
  drivetrain: '4x4',
  cab: 'Double Cab',
  bed: 'Short Bed',
  vehicleType: 'truck',
});
assert.strictEqual(trimTacomaMatch.status, 'matched', 'Trim/configuration Tacoma pick should resolve to an OEM reference.');
assert.strictEqual(trimTacomaMatch.reference.matchLevel, 'configuration', 'Trim/configuration pick should expose configuration match level.');
assert.ok(
  trimTacomaMatch.reference.confidence > genericTacomaMatch.reference.confidence,
  'Specific trim/config picks should carry higher catalog confidence than generic model matches.',
);

const partialProfileDraft = {
  ...createEmptyFleetVehicleProfileDraft(),
  nickname: 'Trail Tacoma',
  year: '2024',
  make: 'Toyota',
  model: 'Tac',
  vehicleType: 'truck',
  baseNetWeight: '6123',
};
const prefillOptions = resolveFleetVehicleProfilePrefillOptions(partialProfileDraft);
const tacomaPrefill = prefillOptions.find((option) => /Tacoma/i.test(option.label) && /TRD Pro/i.test(option.label));
assert.ok(tacomaPrefill, 'Fleet profile prefill should expose a trim-specific Tacoma ECS vehicle pick.');
const prefilledTacoma = applyFleetProfilePrefillOption(partialProfileDraft, tacomaPrefill.id);
assert.strictEqual(prefilledTacoma.model, 'Tacoma', 'Selecting an ECS vehicle pick should complete the model field.');
assert.strictEqual(prefilledTacoma.trim, 'TRD Pro', 'Selecting an ECS vehicle pick should populate trim.');
assert.ok(prefilledTacoma.engine, 'Selecting an ECS vehicle pick should populate engine when bundled.');
assert.strictEqual(prefilledTacoma.drivetrain, '4x4', 'Selecting an ECS vehicle pick should populate drivetrain when bundled.');
assert.strictEqual(prefilledTacoma.cab, 'Double Cab', 'Selecting an ECS vehicle pick should populate cab when bundled.');
assert.strictEqual(prefilledTacoma.bed, 'Short Bed', 'Selecting an ECS vehicle pick should populate bed when bundled.');
assert.strictEqual(
  prefilledTacoma.baseNetWeight,
  '6123',
  'Selecting an ECS vehicle pick should preserve manually entered base weight values.',
);
assert.ok(Number(prefilledTacoma.gvwr) > 0, 'Selecting an ECS vehicle pick should populate GVWR when the field was empty.');
assert.ok(prefilledTacoma.gearingLabel, 'Selecting an ECS vehicle pick should expose probable gearing context when bundled.');
assert.strictEqual(prefilledTacoma.gearingConfirmed, false, 'Probable gearing should require explicit confirmation.');
assert.strictEqual(
  resolveFleetVehicleProfileFieldPlaceholder('', 'Laramie', false),
  'Laramie',
  'Blank manual Fleet profile fields should keep example placeholders before an ECS vehicle pick is selected.',
);
assert.strictEqual(
  resolveFleetVehicleProfileFieldPlaceholder('', 'Laramie', true),
  '',
  'Blank Fleet profile fields should not keep example placeholders after an ECS vehicle pick is selected.',
);
assert.strictEqual(
  resolveFleetVehicleProfileFieldPlaceholder('TRD Pro', 'Laramie', true),
  'Laramie',
  'Filled Fleet profile fields can keep their placeholder prop because the entered value remains authoritative.',
);

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
    base_weight_source: 'manufacturer_spec',
    base_weight_confidence: modernBronco.reference.confidence,
    gvwr_lb: modernBronco.reference.specs.gvwr_lb,
    gvwr_source: 'manufacturer_spec',
    gvwr_confidence: modernBronco.reference.confidence,
    fuel_tank_capacity_gal: modernBronco.reference.specs.fuel_tank_capacity_gal,
  },
});
assert.strictEqual(
  fleetVehicle.buildProfile.baseNetWeight.source,
  'manufacturer_spec',
  'Saved OEM base weight should remain manufacturer-sourced downstream instead of degrading to a user estimate.',
);
assert.strictEqual(
  fleetVehicle.buildProfile.baseNetWeight.confidence,
  modernBronco.reference.confidence,
  'Saved OEM base weight should preserve catalog confidence downstream.',
);
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

const unconfirmedGearVehicle = adaptLegacyVehicleToFleetVehicle({
  vehicle: {
    id: 'tacoma-gearing-test',
    owner_user_id: 'local',
    name: 'Trail Tacoma',
    type: 'truck',
    make: 'Toyota',
    model: 'Tacoma',
    year: 2024,
    notes: null,
    fuel_tank_capacity_gal: 18.2,
    avg_mpg: null,
    current_fuel_percent: 100,
    water_capacity_gal: null,
    current_water_gal: 0,
    water_updated_at: null,
    created_at: '2026-05-22T00:00:00.000Z',
    updated_at: '2026-05-22T00:00:00.000Z',
  },
  specs: {
    base_weight_lb: 5100,
    gvwr_lb: 6780,
    fuel_tank_capacity_gal: 18.2,
    gearing_label: 'Probable gearing context',
    gearing_confidence: 88,
    gearing_confirmed: false,
  },
});
assert.strictEqual(
  unconfirmedGearVehicle.buildProfile.gearingConfirmed,
  false,
  'Probable gearing should remain unconfirmed until the user explicitly confirms it.',
);

const profileModal = read('components/fleet/FleetVehicleProfileModal.tsx');
assert.ok(profileModal.includes('OEM REFERENCE'), 'Fleet profile modal should present OEM reference state.');
assert.ok(profileModal.includes('suggestion.oemReference.specs.ground_clearance_inches'), 'Fleet profile modal should show OEM clearance.');
assert.ok(profileModal.includes('oem_reference_id'), 'Fleet profile save should persist OEM reference metadata.');
assert.ok(profileModal.includes('overall_width_in'), 'Fleet profile save should persist OEM vehicle fit dimensions.');
assert.ok(profileModal.includes('ECS vehicle picks'), 'Fleet profile modal should label selectable model/trim suggestions as ECS vehicle picks.');
assert.ok(profileModal.includes('Confirm gearing'), 'Fleet profile modal should require confirmation before probable gearing is saved.');
assert.ok(profileModal.includes('track_width_front_in'), 'Fleet profile modal should persist/display front track width when bundled.');
assert.ok(profileModal.includes('turning_radius_ft'), 'Fleet profile modal should surface derived turning radius from OEM turning diameter.');

console.log('Fleet OEM spec reference checks passed.');
