const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const integrationPath = path.join(root, 'lib', 'vehicleEcsIntegration.ts');
const routeConfidencePath = path.join(root, 'lib', 'routeConfidencePresentation.ts');

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

const vehicleEcs = require(integrationPath);
const routeConfidence = require(routeConfidencePath);

function state(overrides = {}) {
  const base = {
    schemaVersion: 'ecs.vehicle-state.v1',
    status: 'ready',
    identity: {
      activeVehicleId: 'vehicle-1',
      vehicleId: 'vehicle-1',
      hasVehicle: true,
      displayName: 'Trail Tacoma',
      year: 2024,
      make: 'Toyota',
      model: 'Tacoma',
      trim: null,
      vehicleType: 'truck',
      updatedAt: '2026-05-05T00:00:00.000Z',
    },
    specs: { drivetrain: '4x4', engine: 'gas', groundClearanceInches: 9.4 },
    modifications: {
      accessoryCount: 1,
      accessoryWeightLbs: 120,
      containerZoneCount: 0,
      tireSizeInches: 33,
      suspensionLiftInches: 2,
      isLeveled: false,
      frontLevelInches: null,
    },
    loadout: {
      activeLoadoutId: 'loadout-1',
      activeLoadoutName: 'Weekend',
      itemCount: 2,
      cargoLoadoutWeightLbs: 160,
    },
    weight: {
      vehicleId: 'vehicle-1',
      baseWeightLbs: 4800,
      gvwrLbs: 6200,
      accessoryWeightLbs: 120,
      cargoLoadoutWeightLbs: 160,
      consumablesWeightLbs: 120,
      knownContributionsWeightLbs: 5200,
      estimatedOperatingWeightLbs: 5200,
      remainingPayloadLbs: 1000,
      payloadCapacityLbs: 1400,
      payloadUsedPct: 84,
      gvwrOverageRisk: 'watch',
      weightConfidence: 82,
      confidenceLabel: 'medium',
      confidenceLevel: 'catalog_estimate',
      confidenceCopy: 'Fleet weight is estimated from saved specs.',
      isEstimate: true,
      isPartial: false,
      sourceLabels: [],
      partialDataReasons: [],
      warnings: [],
    },
    capability: {
      vehicleId: 'vehicle-1',
      hasVehicle: true,
      fuelTankCapacityGal: 21,
      fuelType: 'gas',
      currentFuelPercent: 80,
      currentFuelGallons: 16.8,
      waterCapacityGal: null,
      currentWaterGallons: 0,
      batteryUsableWh: null,
      tireSizeInches: 33,
      suspensionLiftInches: 2,
      isLeveled: false,
      useCaseChips: ['trail'],
      confidenceLabel: 'medium',
    },
    centerOfGravity: {
      riskLevel: 'watch',
      topHeavyRisk: 'watch',
      frontAxleRisk: 'clear',
      rearAxleRisk: 'watch',
      x: null,
      y: null,
      z: null,
      totalKnownWeightLbs: 5200,
      dataQuality: 'estimated',
      warnings: [],
    },
    intelligence: {
      classification: {
        classId: 'mid_size_truck',
        label: 'Mid-size truck',
        confidence: 'high',
        reasons: ['Model matches mid-size truck patterns.'],
        traits: {
          wheelbase: 'medium',
          payloadProfile: 'moderate',
          trailManeuverability: 'balanced',
          clearanceBias: 'moderate',
        },
      },
      suggestions: ['Confirm payload after accessories and recovery gear.'],
    },
    confidence: {
      score: 82,
      label: 'medium',
      reasons: [],
    },
    updatedAt: '2026-05-05T00:00:00.000Z',
    signature: 'vehicle-1',
    vehicle: null,
    canonicalFleetState: null,
  };
  return {
    ...base,
    ...overrides,
    identity: { ...base.identity, ...(overrides.identity || {}) },
    weight: { ...base.weight, ...(overrides.weight || {}) },
    centerOfGravity: { ...base.centerOfGravity, ...(overrides.centerOfGravity || {}) },
    intelligence: { ...base.intelligence, ...(overrides.intelligence || {}) },
    confidence: { ...base.confidence, ...(overrides.confidence || {}) },
  };
}

const tacoma = state();
const suitability = vehicleEcs.scoreVehicleSuitabilityForEcs({
  activeVehicleState: tacoma,
  accessDemand: 'high_clearance',
});
assert.ok(['strong', 'workable', 'caution'].includes(suitability.level));
assert.ok(suitability.reasons.some((item) => item.includes('Mid-size truck')));

const overloaded = state({
  weight: {
    payloadUsedPct: 103,
    remainingPayloadLbs: -120,
    gvwrOverageRisk: 'critical',
  },
  centerOfGravity: {
    riskLevel: 'caution',
  },
});
const overloadedFit = vehicleEcs.scoreVehicleSuitabilityForEcs({
  activeVehicleState: overloaded,
  accessDemand: 'technical',
});
assert.ok(['limited', 'caution'].includes(overloadedFit.level));
assert.ok(overloadedFit.concerns.some((item) => /GVWR|Payload|Center/i.test(item)));

const advisories = vehicleEcs.buildVehicleSystemAdvisories(overloaded);
assert.ok(advisories.some((item) => item.kind === 'payload_over_gvwr'));
vehicleEcs.resetVehicleSystemAdvisoriesForTests();
const firstPublish = vehicleEcs.publishVehicleSystemAdvisories({ state: overloaded, now: 1000 });
const duplicatePublish = vehicleEcs.publishVehicleSystemAdvisories({ state: overloaded, now: 2000 });
assert.ok(firstPublish.length > 0, 'First vehicle advisories should publish.');
assert.strictEqual(duplicatePublish.length, 0, 'Duplicate vehicle advisories should be suppressed.');

const noVehicle = state({
  status: 'no_active_vehicle',
  identity: {
    activeVehicleId: null,
    vehicleId: null,
    hasVehicle: false,
    displayName: 'No active vehicle',
  },
  confidence: { score: 0, label: 'unverified', reasons: [] },
});
const noVehicleFit = vehicleEcs.scoreVehicleSuitabilityForEcs({ activeVehicleState: noVehicle });
assert.strictEqual(noVehicleFit.level, 'unknown');

const routeWithVehicle = routeConfidence.deriveRouteConfidence({
  routeLabel: 'ECS-curated',
  isCurated: true,
  hasCompleteGeometry: true,
  accessStatus: 'technical',
  vehicleState: overloaded,
});
assert.ok(routeWithVehicle.concerns.some((item) => /GVWR|Vehicle fit|Payload|Center/i.test(item)));
assert.notStrictEqual(routeWithVehicle.level, 'high');

console.log('Active vehicle ECS integration checks passed.');
