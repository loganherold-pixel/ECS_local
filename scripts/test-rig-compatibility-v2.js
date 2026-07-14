/* eslint-disable no-undef */
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const v1Path = path.join(root, 'lib', 'rigCompatibilityEngine.ts');
const v2Path = path.join(root, 'lib', 'rigCompatibilityV2.ts');
const adapterPath = path.join(root, 'lib', 'rigCompatibilityV2Adapter.ts');
const configPath = path.join(root, 'lib', 'rigCompatibilityV2Config.ts');

process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';
global.__DEV__ = false;

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
  return originalLoad.call(this, request, parent, isMain);
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

const v1 = require(v1Path);
const v2 = require(v2Path);
const adapter = require(adapterPath);
const config = require(configPath);

const NOW = '2026-07-12T18:00:00.000Z';

function source(id, overrides = {}) {
  return {
    id,
    origin: overrides.origin ?? 'manual',
    authority: overrides.authority ?? 'Deterministic test evidence',
    provider: overrides.provider ?? null,
    observedAt: Object.prototype.hasOwnProperty.call(overrides, 'observedAt')
      ? overrides.observedAt
      : NOW,
    fetchedAt: overrides.fetchedAt ?? null,
    expiresAt: overrides.expiresAt ?? null,
    confidence: overrides.confidence ?? 'high',
    coverage: overrides.coverage ?? 'complete',
    availability: overrides.availability ?? 'usable',
    conflict: overrides.conflict ?? false,
    warningCodes: overrides.warningCodes ?? [],
  };
}

function sourceMap(overrides = {}) {
  return {
    vehicle_profile: {
      ref: source('test-vehicle-profile', overrides.vehicle ?? {}),
      policyKey: 'vehicle_profile',
    },
    route: {
      ref: source('test-route', { origin: 'cached', ...(overrides.route ?? {}) }),
      policyKey: 'offline_map_route_package',
    },
  };
}

const baseInput = {
  vehicle: {
    id: 'light-rig',
    label: 'Light rig',
    gvwrLbs: 6000,
    operatingWeightLbs: 4200,
    drivetrain: '4x4',
    tireDiameterInches: 33,
    suspensionLiftInches: 2,
    isLeveled: false,
    geometry: {
      groundClearanceInches: 10,
      wheelbaseInches: 120,
      overallWidthInches: 74,
      approachAngleDegrees: 32,
      breakoverAngleDegrees: 24,
      departureAngleDegrees: 28,
      turningDiameterFeet: 38,
    },
  },
  route: {
    id: 'route-1',
    label: 'Verified route',
    distanceMiles: 100,
    estimatedFuelRequiredGallons: 8,
    terrainType: 'mountain gravel',
    terrainDifficulty: 3,
    maxGradePercent: 7,
    remotenessScore: 5,
    tractionRequirement: 'four_wheel_drive',
    recommendedTireDiameterInches: 33,
    recommendedSuspensionLiftInches: 2,
    geometryRequirements: {
      minimumGroundClearanceInches: 9,
      maximumWheelbaseInches: 130,
      maximumVehicleWidthInches: 80,
      minimumApproachAngleDegrees: 28,
      minimumBreakoverAngleDegrees: 20,
      minimumDepartureAngleDegrees: 24,
      maximumTurningDiameterFeet: 42,
    },
    trailerAccess: 'allowed',
    maximumTrailerWeightLbs: null,
    maximumTrailerLengthFeet: null,
    fuelReserveRatio: 0.2,
    recoveryRequirement: 'basic',
  },
  trailer: { attached: false, weightLbs: null, lengthFeet: null },
  resources: {
    currentFuelGallons: 20,
    averageMpg: 15,
    fuelRangeMiles: 300,
    currentWaterGallons: 5,
    requiredWaterGallons: 4,
    availablePowerRuntimeHours: 12,
    requiredPowerRuntimeHours: 10,
  },
  recovery: {
    ratedRecoveryPoints: true,
    strapOrRope: true,
    shackles: true,
    tractionAids: true,
    fullSizeSpare: true,
    jack: true,
    winch: true,
  },
  sourceTruth: sourceMap(),
  now: NOW,
};

function input(overrides = {}) {
  return {
    ...baseInput,
    ...overrides,
    vehicle: {
      ...baseInput.vehicle,
      ...(overrides.vehicle ?? {}),
      geometry: Object.prototype.hasOwnProperty.call(overrides.vehicle ?? {}, 'geometry')
        ? overrides.vehicle.geometry
        : { ...baseInput.vehicle.geometry },
    },
    route: {
      ...baseInput.route,
      ...(overrides.route ?? {}),
      geometryRequirements: Object.prototype.hasOwnProperty.call(overrides.route ?? {}, 'geometryRequirements')
        ? overrides.route.geometryRequirements
        : { ...baseInput.route.geometryRequirements },
    },
    trailer: Object.prototype.hasOwnProperty.call(overrides, 'trailer')
      ? overrides.trailer
      : { ...baseInput.trailer },
    resources: Object.prototype.hasOwnProperty.call(overrides, 'resources')
      ? { ...baseInput.resources, ...(overrides.resources ?? {}) }
      : { ...baseInput.resources },
    recovery: Object.prototype.hasOwnProperty.call(overrides, 'recovery')
      ? { ...baseInput.recovery, ...(overrides.recovery ?? {}) }
      : { ...baseInput.recovery },
    sourceTruth: Object.prototype.hasOwnProperty.call(overrides, 'sourceTruth')
      ? overrides.sourceTruth
      : sourceMap(),
  };
}

// V1 documentation and golden behavior remain stable.
const v1Source = fs.readFileSync(v1Path, 'utf8');
assert.ok(v1Source.includes('weighted composite (5 factors)'), 'V1 should accurately document five factors.');
assert.ok(v1Source.includes('Weights (5-factor model)'), 'V1 weights should accurately document five factors.');
assert.ok(!v1Source.includes('weighted composite (6 factors)'), 'The stale six-factor V1 comment should be gone.');

const v1Profile = {
  vehicleId: 'v1-golden',
  vehicleName: 'V1 Golden',
  vehicleType: 'truck',
  make: null,
  model: null,
  gvwr_lb: 7000,
  base_weight_lb: 5000,
  fuel_tank_capacity_gal: 20,
  fuel_type: 'gas',
  avg_mpg: 15,
  water_capacity_gal: 10,
  payload_capacity_lb: 2000,
  fuel_range_miles: 300,
  tireSizeInches: 33,
  suspensionLiftInches: 2,
  isLeveled: false,
  frontLevelInches: null,
};
const v1Opportunity = {
  id: 'v1-route',
  name: 'V1 Route',
  distanceMiles: 150,
  terrainType: 'mountain',
  remotenessScore: 6,
  estimatedFuelRequired: 10,
  elevationGainFt: 4000,
  recommendedTireSize: 33,
  recommendedLift: 2,
  terrainDifficulty: 6,
};
const v1Golden = v1.calculateRigCompatibility(v1Profile, v1Opportunity);
assert.strictEqual(v1Golden.score, 86);
assert.strictEqual(v1Golden.difficultyRating, 'MODERATE');
assert.deepStrictEqual(v1Golden.factors, {
  terrainMatch: 82,
  fuelRangeCoverage: 92,
  vehicleCapability: 81,
  tireSizeMatch: 90,
  suspensionLiftMatch: 88,
});
assert.strictEqual(Object.keys(v1Golden.factors).length, 5);
assert.strictEqual(v1Golden.isFullScore, true);

const baseline = v2.calculateRigCompatibilityV2(input());
assert.strictEqual(baseline.version, 'rig_compatibility.v2');
assert.strictEqual(Object.keys(baseline.factors).length, 9);
assert.strictEqual(baseline.posture, 'compatible');
assert.ok(baseline.score >= 85);
assert.strictEqual(baseline.confidence.level, 'high');
assert.strictEqual(baseline.deterministic, true);
assert.strictEqual(baseline.aiAuthority, 'explanation_only');
assert.strictEqual(baseline.factors.trailer_constraints.state, 'not_applicable');

const unchangedInput = input();
const beforeJson = JSON.stringify(unchangedInput);
const firstDeterministic = v2.calculateRigCompatibilityV2(unchangedInput);
const secondDeterministic = v2.calculateRigCompatibilityV2(unchangedInput);
assert.deepStrictEqual(firstDeterministic, secondDeterministic);
assert.strictEqual(JSON.stringify(unchangedInput), beforeJson, 'V2 must not mutate normalized inputs.');

// Equivalent payload utilization produces the same score regardless of vehicle mass.
const light = v2.calculateRigCompatibilityV2(input({
  vehicle: { id: 'light', gvwrLbs: 5000, operatingWeightLbs: 3500 },
}));
const heavy = v2.calculateRigCompatibilityV2(input({
  vehicle: { id: 'heavy', gvwrLbs: 10000, operatingWeightLbs: 7000 },
}));
assert.strictEqual(light.factors.payload_readiness.score, heavy.factors.payload_readiness.score);
assert.strictEqual(light.score, heavy.score);
assert.strictEqual(light.factors.terrain_grade_exposure.score, heavy.factors.terrain_grade_exposure.score);

// Payload policy threshold boundaries are exact and independent of absolute GVWR.
const payloadAt90 = v2.calculateRigCompatibilityV2(input({ vehicle: { operatingWeightLbs: 5400 } }));
const payloadAt95 = v2.calculateRigCompatibilityV2(input({ vehicle: { operatingWeightLbs: 5700 } }));
const payloadAt100 = v2.calculateRigCompatibilityV2(input({ vehicle: { operatingWeightLbs: 6000 } }));
const payloadOver = v2.calculateRigCompatibilityV2(input({ vehicle: { operatingWeightLbs: 6001 } }));
assert.strictEqual(payloadAt90.factors.payload_readiness.score, 60);
assert.strictEqual(payloadAt95.factors.payload_readiness.score, 35);
assert.strictEqual(payloadAt100.factors.payload_readiness.score, 20);
assert.strictEqual(payloadOver.factors.payload_readiness.score, 0);
assert.ok(payloadOver.warnings.includes('gvwr_exceeded'));

const lowLoad = v2.calculateRigCompatibilityV2(input({ vehicle: { operatingWeightLbs: 3600 } }));
const nearGvwr = v2.calculateRigCompatibilityV2(input({ vehicle: { operatingWeightLbs: 5850 } }));
assert.ok(lowLoad.factors.payload_readiness.score > nearGvwr.factors.payload_readiness.score);
assert.ok(lowLoad.score > nearGvwr.score);

const unknownTires = v2.calculateRigCompatibilityV2(input({ vehicle: { tireDiameterInches: null } }));
assert.strictEqual(unknownTires.factors.tire_suitability.state, 'unknown');
assert.strictEqual(unknownTires.factors.tire_suitability.score, null);
assert.ok(unknownTires.missingData.includes('verified tire diameter'));
assert.ok(unknownTires.confidence.factorCoveragePct < baseline.confidence.factorCoveragePct);

const unknownSuspension = v2.calculateRigCompatibilityV2(input({ vehicle: { suspensionLiftInches: null } }));
assert.strictEqual(unknownSuspension.factors.suspension_lift.state, 'unknown');
assert.ok(unknownSuspension.factors.suspension_lift.reason.includes('does not assume'));

const missingDrivetrain = v2.calculateRigCompatibilityV2(input({
  vehicle: { gvwrLbs: 14000, operatingWeightLbs: 7000, drivetrain: null },
}));
assert.strictEqual(missingDrivetrain.factors.drivetrain_traction.state, 'unknown');
assert.strictEqual(missingDrivetrain.factors.drivetrain_traction.score, null);
assert.ok(missingDrivetrain.missingData.includes('verified drivetrain'));

const attachedTrailer = v2.calculateRigCompatibilityV2(input({
  trailer: { attached: true, weightLbs: 3000, lengthFeet: 16 },
}));
assert.strictEqual(attachedTrailer.factors.trailer_constraints.state, 'watch');
assert.ok(attachedTrailer.warnings.includes('trailer_numeric_limits_unknown'));

const trailerOverLimit = v2.calculateRigCompatibilityV2(input({
  route: { maximumTrailerWeightLbs: 2500 },
  trailer: { attached: true, weightLbs: 3000, lengthFeet: 16 },
}));
assert.strictEqual(trailerOverLimit.factors.trailer_constraints.state, 'incompatible');
assert.strictEqual(trailerOverLimit.posture, 'incompatible');
assert.ok(trailerOverLimit.limitingFactors.includes('trailer_constraints'));

const geometryUnknown = v2.calculateRigCompatibilityV2(input({
  route: { geometryRequirements: null },
}));
assert.strictEqual(geometryUnknown.factors.vehicle_geometry.state, 'unknown');
assert.ok(geometryUnknown.missingData.includes('route dimensional/geometry constraints'));

const poorRecovery = v2.calculateRigCompatibilityV2(input({
  route: { recoveryRequirement: 'remote' },
  recovery: {
    ratedRecoveryPoints: false,
    strapOrRope: false,
    shackles: false,
    tractionAids: false,
    fullSizeSpare: false,
    jack: false,
    winch: false,
  },
}));
assert.strictEqual(poorRecovery.factors.recovery_readiness.score, 0);
assert.strictEqual(poorRecovery.factors.recovery_readiness.state, 'incompatible');
assert.strictEqual(poorRecovery.posture, 'incompatible');
assert.ok(poorRecovery.warnings.includes('recovery_items_missing'));

const fuelConstrained = v2.calculateRigCompatibilityV2(input({
  resources: { currentFuelGallons: 5, fuelRangeMiles: 75 },
}));
assert.strictEqual(fuelConstrained.factors.fuel_resource_range.score, 0);
assert.strictEqual(fuelConstrained.factors.fuel_resource_range.state, 'incompatible');
assert.ok(fuelConstrained.warnings.includes('fuel_range_below_policy'));

const lowConfidenceSources = sourceMap({
  vehicle: { origin: 'estimated', confidence: 'low', coverage: 'partial' },
  route: { origin: 'estimated', confidence: 'low', coverage: 'partial' },
});
const strongButLowConfidence = v2.calculateRigCompatibilityV2(input({ sourceTruth: lowConfidenceSources }));
assert.strictEqual(strongButLowConfidence.score, baseline.score);
assert.strictEqual(strongButLowConfidence.posture, 'compatible');
assert.strictEqual(strongButLowConfidence.confidence.level, 'low');
assert.ok(strongButLowConfidence.confidence.score < baseline.confidence.score);

const manualRecent = v2.calculateRigCompatibilityV2(input({
  sourceTruth: sourceMap({ vehicle: { origin: 'manual', observedAt: NOW } }),
}));
assert.strictEqual(
  manualRecent.sourceTruth.find((item) => item.id === 'test-vehicle-profile').origin,
  'manual',
  'A recent edit timestamp must not reinterpret manual data as live.',
);

const conflict = v2.calculateRigCompatibilityV2(input({
  sourceTruth: sourceMap({ route: { conflict: true, warningCodes: ['provider_conflict'] } }),
}));
assert.strictEqual(conflict.confidence.level, 'low');
assert.ok(conflict.confidence.score <= 35);
assert.ok(conflict.warnings.includes('source_conflict'));
assert.ok(conflict.warnings.includes('provider_conflict'));

const diagnostics = adapter.compareRigCompatibilityVersions(v1Golden, baseline);
assert.strictEqual(diagnostics.v1FactorCount, 5);
assert.strictEqual(diagnostics.v2FactorCount, 9);
assert.strictEqual(diagnostics.v1CapabilityUsesGvwrProxy, true);
assert.strictEqual(diagnostics.v2CapabilityUsesGvwrProxy, false);
assert.strictEqual(diagnostics.scoreDelta, baseline.score - v1Golden.score);

const previousFlag = process.env.EXPO_PUBLIC_ECS_RIG_COMPATIBILITY_V2;
delete process.env.EXPO_PUBLIC_ECS_RIG_COMPATIBILITY_V2;
assert.strictEqual(config.isRigCompatibilityV2Enabled(), false, 'V2 must default off.');
assert.strictEqual(config.isRigCompatibilityV2Enabled({ rigCompatibilityV2Enabled: true }), true);
assert.strictEqual(config.isRigCompatibilityV2Enabled({ rigCompatibilityV2Enabled: false }), false);
process.env.EXPO_PUBLIC_ECS_RIG_COMPATIBILITY_V2 = 'true';
assert.strictEqual(config.isRigCompatibilityV2Enabled(), true);
if (previousFlag == null) delete process.env.EXPO_PUBLIC_ECS_RIG_COMPATIBILITY_V2;
else process.env.EXPO_PUBLIC_ECS_RIG_COMPATIBILITY_V2 = previousFlag;

const disabledSelection = adapter.resolveVersionedRigCompatibility({
  v1: v1Golden,
  v2Input: input(),
  flags: { rigCompatibilityV2Enabled: false },
});
assert.strictEqual(disabledSelection.activeVersion, 'v1');
assert.strictEqual(disabledSelection.presentationResult, v1Golden, 'Disabled rollout must preserve the exact V1 object.');
assert.strictEqual(disabledSelection.v2, null);
assert.strictEqual(disabledSelection.diagnostics, null);

const enabledSelection = adapter.resolveVersionedRigCompatibility({
  v1: v1Golden,
  v2Input: input(),
  flags: { rigCompatibilityV2Enabled: true },
});
assert.strictEqual(enabledSelection.activeVersion, 'v2');
assert.strictEqual(enabledSelection.v2.version, 'rig_compatibility.v2');
assert.strictEqual(enabledSelection.presentationResult.explanation, null, 'Migration must not let AI override V2.');
assert.strictEqual(enabledSelection.diagnostics.v2CapabilityUsesGvwrProxy, false);

const activeContext = {
  activeVehicleId: 'active-rig',
  hasActiveVehicleId: true,
  hasVehicleContext: true,
  hasVehicleRecord: true,
  vehicle: {
    id: 'active-rig',
    name: 'Active Rig',
    type: 'truck',
    avg_mpg: 12,
    current_fuel_percent: null,
    current_water_gal: null,
    tire_size_inches: null,
    suspension_lift_inches: null,
    ground_clearance_inches: null,
    wheelbase_in: null,
    overall_width_in: null,
    approach_angle_deg: null,
    breakover_angle_deg: null,
    departure_angle_deg: null,
    turning_diameter_ft: null,
    updated_at: NOW,
  },
  spec: {
    gvwr_lb: 7000,
    base_weight_lb: 5000,
    fuel_tank_capacity_gal: 24,
    fuel_type: 'gas',
    drivetrain: '4WD',
    tire_size_inches: 31,
    suspension_lift_inches: 0,
    is_leveled: false,
    ground_clearance_inches: 9.5,
    wheelbase_in: 126,
    overall_width_in: 76,
    approach_angle_deg: 30,
    breakover_angle_deg: 22,
    departure_angle_deg: 25,
    turning_diameter_ft: 40,
    oem_reference_id: 'oem-active-rig',
    oem_reference_label: 'Saved OEM reference',
    oem_reference_confidence: 90,
  },
  consumables: {
    fuel_percent_current: 50,
    fuel_gal_current: 12,
    fuel_source: 'manual',
    fuel_gal_updated_at: Date.parse(NOW),
    water_gal_current: 4,
    water_source: 'manual',
    water_updated_at: Date.parse(NOW),
  },
  tiresLift: {
    tireSizeInches: 33,
    suspensionLiftInches: 2,
    isLeveled: false,
    frontLevelInches: null,
    updatedAt: NOW,
  },
  resourceProfile: {
    currentFuelGallons: 12,
    currentWaterGallons: 4,
  },
  accessorySummary: [
    { label: 'Winch', status: 'installed', color: '#fff' },
  ],
  loadout: { updated_at: NOW },
  loadoutItems: [
    { name: 'Kinetic recovery rope', category: 'recovery', notes: null, is_packed: true },
    { name: 'Soft shackles pair', category: 'recovery', notes: null, is_packed: true },
    { name: 'Traction boards pair', category: 'recovery', notes: null, is_packed: true },
  ],
  vehicleState: {
    updatedAt: NOW,
    confidence: { score: 90 },
    identity: { displayName: 'Active Rig' },
    canonicalFleetState: { fleetVehicle: { buildProfile: { drivetrain: '4WD' } } },
  },
  weightSnapshot: {
    gvwrLbs: 7000,
    estimatedOperatingWeightLbs: 5600,
    weightConfidence: 88,
    isEstimate: false,
    isPartial: false,
  },
};
const adapted = adapter.buildRigCompatibilityV2InputFromActiveVehicleContext(
  activeContext,
  {
    id: 'adapter-route',
    name: 'Adapter Route',
    distanceMiles: 80,
    terrainType: 'gravel',
    remotenessScore: 6,
    estimatedFuelRequired: 7,
    elevationGainFt: 2200,
    recommendedTireSize: 33,
    recommendedLift: 2,
    terrainDifficulty: 4,
  },
  {
    now: NOW,
    routeIntelligence: {
      totalDistanceMiles: 82,
      analyzedAt: NOW,
      hasElevation: true,
      segments: [
        { maxGradePercent: 8 },
        { maxGradePercent: 13 },
      ],
    },
  },
);
assert.strictEqual(adapted.vehicle.gvwrLbs, 7000);
assert.strictEqual(adapted.vehicle.operatingWeightLbs, 5600);
assert.strictEqual(adapted.vehicle.drivetrain, '4WD');
assert.strictEqual(adapted.vehicle.tireDiameterInches, 33);
assert.strictEqual(adapted.vehicle.suspensionLiftInches, 2);
assert.strictEqual(adapted.vehicle.geometry.groundClearanceInches, 9.5);
assert.strictEqual(adapted.route.distanceMiles, 82);
assert.strictEqual(adapted.route.maxGradePercent, 13);
assert.strictEqual(adapted.route.tractionRequirement, 'unknown');
assert.strictEqual(adapted.resources.averageMpg, 12);
assert.strictEqual(adapted.resources.fuelRangeMiles, 144);
assert.strictEqual(adapted.trailer.attached, null);
assert.strictEqual(adapted.recovery.strapOrRope, true);
assert.strictEqual(adapted.recovery.shackles, true);
assert.strictEqual(adapted.recovery.tractionAids, true);
assert.strictEqual(adapted.recovery.winch, true);
assert.strictEqual(adapted.recovery.ratedRecoveryPoints, null, 'A winch must not invent rated recovery points.');
assert.strictEqual(adapted.sourceTruth.vehicle_profile.ref.origin, 'manual');
assert.strictEqual(adapted.sourceTruth.vehicle_geometry.ref.origin, 'cached');

const noMpgContext = {
  ...activeContext,
  vehicle: { ...activeContext.vehicle, avg_mpg: null },
};
const noMpgAdapted = adapter.buildRigCompatibilityV2InputFromActiveVehicleContext(noMpgContext, v1Opportunity);
assert.strictEqual(noMpgAdapted.resources.averageMpg, null);
assert.strictEqual(noMpgAdapted.resources.fuelRangeMiles, null, 'V2 adapter must not use the V1 15 MPG fallback.');

for (const relativePath of [
  'lib/discoverEngine.ts',
  'lib/remoteExplorerEngine.ts',
  'app/(tabs)/discover.tsx',
  'app/(tabs)/navigate.tsx',
]) {
  const sourceText = fs.readFileSync(path.join(root, relativePath), 'utf8');
  assert.ok(
    !sourceText.includes('rigCompatibilityV2'),
    `${relativePath} should remain on V1 until the default-off rollout is deliberately migrated.`,
  );
}

console.log('Rig Compatibility V2 domain, adapter, rollout, and V1 regression checks passed.');
