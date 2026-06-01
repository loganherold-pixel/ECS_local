const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const classificationPath = path.join(root, 'lib', 'fleet', 'vehicleClassification.ts');
const domainPath = path.join(root, 'lib', 'fleet', 'fleetPremiumDomain.ts');
const fabricPath = path.join(root, 'lib', 'fleet', 'fleetFabricService.ts');
const aiContextPath = path.join(root, 'lib', 'aiContextBuilder.ts');

process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' }, NativeModules: {}, AppState: { addEventListener: () => ({ remove() {} }) } };
  }
  if (request === 'expo-location' || request.startsWith('expo-location/')) {
    return {};
  }
  if (request === 'expo-modules-core' || request.startsWith('expo-modules-core/')) {
    return {};
  }
  if (request === 'expo-file-system' || request.startsWith('expo-file-system/')) {
    return {
      Paths: { document: { uri: 'file:///test-documents/' } },
      File: class MockFile {},
      Directory: class MockDirectory {},
    };
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

const { classifyVehicle, buildVehicleIntelligenceSuggestions } = require(classificationPath);
const fleet = require(domainPath);
const fabric = require(fabricPath);

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

function toFleetVehicle(id, overrides = {}, specs = null) {
  return fleet.adaptLegacyVehicleToFleetVehicle({
    vehicle: legacyVehicle(id, overrides),
    specs,
    now: '2026-05-05T00:00:00.000Z',
  });
}

const cases = [
  ['2019 Ram 2500 diesel', { make: 'Ram', model: '2500', year: 2019, type: 'truck', engine: 'Cummins diesel' }, 'full_size_hd_truck'],
  ['Jeep Wrangler', { make: 'Jeep', model: 'Wrangler', type: 'suv' }, 'short_wheelbase_4x4'],
  ['Toyota Tacoma', { make: 'Toyota', model: 'Tacoma', type: 'truck' }, 'mid_size_truck'],
  ['Ford F-150', { make: 'Ford', model: 'F-150', type: 'truck' }, 'full_size_half_ton_truck'],
  ['Toyota 4Runner', { make: 'Toyota', model: '4Runner', type: 'suv' }, 'mid_size_suv'],
  ['Ford Bronco', { make: 'Ford', model: 'Bronco', type: 'suv' }, 'short_wheelbase_4x4'],
  ['Chevy Colorado', { make: 'Chevy', model: 'Colorado', type: 'truck' }, 'mid_size_truck'],
  ['Subaru Outback', { make: 'Subaru', model: 'Outback', type: 'wagon' }, 'compact_suv_crossover'],
  ['Unknown custom', { make: null, model: null, type: null }, 'unknown_custom'],
];

for (const [label, vehicle, expectedClass] of cases) {
  const classification = classifyVehicle({
    vehicleType: vehicle.type,
    year: vehicle.year ?? 2024,
    make: vehicle.make,
    model: vehicle.model,
    engine: vehicle.engine,
  });
  assert.strictEqual(classification.classId, expectedClass, `${label} should classify as ${expectedClass}`);
}

const hdSuggestions = buildVehicleIntelligenceSuggestions({
  classification: classifyVehicle({ make: 'Ram', model: '2500', vehicleType: 'truck' }),
  payloadUsedPct: 72,
  confidenceLevel: 'catalog_estimate',
  confidenceScore: 82,
});
const jeepSuggestions = buildVehicleIntelligenceSuggestions({
  classification: classifyVehicle({ make: 'Jeep', model: 'Wrangler', vehicleType: 'suv' }),
  payloadUsedPct: 88,
  confidenceLevel: 'ecs_estimate',
  confidenceScore: 68,
});
const unknownSuggestions = buildVehicleIntelligenceSuggestions({
  classification: classifyVehicle({ make: null, model: null, vehicleType: null }),
  confidenceLevel: 'unknown',
  confidenceScore: 0,
});
assert.notDeepStrictEqual(hdSuggestions, jeepSuggestions, 'HD truck and Jeep suggestions should differ.');
assert.ok(hdSuggestions.some((item) => /width|turn-around|truck capability/i.test(item)));
assert.ok(jeepSuggestions.some((item) => /short wheelbase|roof|payload/i.test(item)));
assert.ok(unknownSuggestions.some((item) => /add GVWR|verify/i.test(item)));

const tacoma = toFleetVehicle('tacoma-ai', { make: 'Toyota', model: 'Tacoma', type: 'truck' }, {
  base_weight_lb: 4800,
  gvwr_lb: 6200,
  fuel_tank_capacity_gal: 21,
  fuel_type: 'gas',
  tire_size_inches: 33,
  ground_clearance_inches: 9.4,
});
const tacomaPayload = fabric.generatePremiumFleetFabricPayload({
  vehicle: tacoma,
  generatedAt: '2026-05-05T00:00:00.000Z',
});
assert.strictEqual(tacomaPayload.vehicleIntelligence.classification.classId, 'mid_size_truck');
assert.strictEqual(tacomaPayload.vehicleIntelligence.operatingWeightLbs, tacomaPayload.weight.operatingWeight.lbs);
assert.ok(tacomaPayload.vehicleIntelligence.suggestions.length > 0);
assert.notStrictEqual(tacomaPayload.weight.baseNetWeight.lbs, 7400, 'Tacoma must not inherit Ram 2500 base weight.');

(async () => {
  const aiContextSource = fs.readFileSync(aiContextPath, 'utf8');
  assert.ok(aiContextSource.includes('vehicleIntelligence'), 'AI context builder should expose vehicleIntelligence.');
  assert.ok(aiContextSource.includes('getActiveVehicleState'), 'AI context builder should read the shared active vehicle state.');
  assert.ok(aiContextSource.includes('vehicleClass'), 'AI context summary should include vehicle class.');
  assert.ok(aiContextSource.includes('vehicleWeightConfidence'), 'AI context summary should include vehicle weight confidence.');
  console.log('Fleet vehicle classification and AI context checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
