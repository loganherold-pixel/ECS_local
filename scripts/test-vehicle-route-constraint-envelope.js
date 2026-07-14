/* eslint-disable no-undef */
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const enginePath = path.join(root, 'lib', 'vehicleRouteConstraintEnvelope.ts');
const adapterPath = path.join(root, 'lib', 'vehicleRouteConstraintEnvelopeAdapter.ts');
const presentationPath = path.join(root, 'lib', 'vehicleRouteConstraintEnvelopePresentation.ts');
const selectorPath = path.join(root, 'lib', 'vehicleRouteConstraintEnvelopeSelector.ts');

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

const engine = require(enginePath);
const adapter = require(adapterPath);
const presentation = require(presentationPath);
const selector = require(selectorPath);

const NOW = '2026-07-12T18:00:00.000Z';

function source(id, overrides = {}) {
  return {
    id,
    origin: overrides.origin ?? 'manual',
    authority: overrides.authority ?? 'Verified test evidence',
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

function sourceEvidence(id, policyKey = 'vehicle_profile', overrides = {}) {
  return { ref: source(id, overrides), policyKey };
}

function sourceMap() {
  const map = {
    vehicle_profile: sourceEvidence('vehicle-profile'),
    route: sourceEvidence('route', 'offline_map_route_package', { origin: 'cached' }),
  };
  for (const factor of [
    'payload_readiness',
    'drivetrain_traction',
    'tire_suitability',
    'suspension_lift',
    'vehicle_geometry',
    'trailer_constraints',
    'fuel_resource_range',
    'recovery_readiness',
    'terrain_grade_exposure',
  ]) {
    map[factor] = sourceEvidence(`factor:${factor}`);
  }
  return map;
}

function baseRigInput(overrides = {}) {
  return {
    vehicle: {
      id: 'rig-1',
      label: 'Verified Rig',
      gvwrLbs: 7000,
      operatingWeightLbs: 5200,
      drivetrain: '4x4',
      tireDiameterInches: 33,
      suspensionLiftInches: 2,
      isLeveled: false,
      geometry: null,
      ...(overrides.vehicle ?? {}),
    },
    route: {
      id: 'route-1',
      label: 'Envelope Route',
      distanceMiles: 10,
      estimatedFuelRequiredGallons: null,
      terrainType: 'moderate',
      terrainDifficulty: 4,
      maxGradePercent: 4,
      remotenessScore: 1,
      tractionRequirement: 'unknown',
      recommendedTireDiameterInches: null,
      recommendedSuspensionLiftInches: null,
      geometryRequirements: null,
      trailerAccess: 'allowed',
      maximumTrailerWeightLbs: null,
      maximumTrailerLengthFeet: null,
      fuelReserveRatio: 0.2,
      recoveryRequirement: null,
      ...(overrides.route ?? {}),
    },
    trailer: { attached: false, weightLbs: null, lengthFeet: null, ...(overrides.trailer ?? {}) },
    resources: {
      currentFuelGallons: 25,
      averageMpg: 20,
      fuelRangeMiles: 500,
      currentWaterGallons: null,
      requiredWaterGallons: null,
      availablePowerRuntimeHours: null,
      requiredPowerRuntimeHours: null,
      ...(overrides.resources ?? {}),
    },
    recovery: {
      ratedRecoveryPoints: true,
      strapOrRope: true,
      shackles: true,
      tractionAids: true,
      fullSizeSpare: true,
      jack: true,
      winch: true,
      ...(overrides.recovery ?? {}),
    },
    sourceTruth: overrides.sourceTruth ?? sourceMap(),
    now: NOW,
  };
}

function baseSegment(index = 0, overrides = {}) {
  const start = index * 10;
  return {
    id: `segment-${index}`,
    index,
    label: `Segment ${index + 1}`,
    distanceStartMiles: start,
    distanceEndMiles: start + 10,
    averageElevationFeet: 4200,
    maximumElevationFeet: 4600,
    elevationGainFeet: 500,
    maximumGradePercent: 4,
    elevationDataAvailable: true,
    terrainClass: 'moderate',
    remotenessScore: 1,
    nearestBailoutDistanceMiles: 1,
    bailoutDataAvailable: true,
    advisories: [],
    advisoryCoverage: 'complete',
    knownConstraints: {
      minimumTireDiameterInches: 32,
      minimumSuspensionLiftInches: 1,
      trailerAccess: 'allowed',
    },
    sourceTruth: source(`route-segment-${index}`, { origin: 'cached' }),
    bailoutSourceTruth: source(`bailout-segment-${index}`, { origin: 'cached' }),
    ...overrides,
  };
}

function baseEnvelopeInput(overrides = {}) {
  return {
    routeId: 'route-1',
    routeLabel: 'Envelope Route',
    rigCompatibilityInput: overrides.rigCompatibilityInput ?? baseRigInput(),
    segments: overrides.segments ?? [baseSegment()],
    loadDistribution: overrides.loadDistribution ?? {
      available: true,
      topHeavyRisk: 'clear',
      frontAxleRisk: 'clear',
      rearAxleRisk: 'clear',
      dataQuality: 'verified',
      sourceTruth: source('load-distribution'),
      warnings: [],
    },
  };
}

function factor(result, segmentIndex, factorId) {
  return result.segments[segmentIndex].factors.find((item) => item.id === factorId);
}

const allWithin = engine.evaluateVehicleRouteConstraintEnvelope(baseEnvelopeInput());
assert.strictEqual(allWithin.posture, 'within_envelope', 'All verified passing factors should remain within the known envelope.');
assert.strictEqual(allWithin.earliestWorseningSegment, null);
assert.strictEqual(allWithin.previewOnly, true);
assert.strictEqual(allWithin.deterministic, true);
assert.strictEqual(allWithin.aiAuthority, 'explanation_only');

const oneWatch = engine.evaluateVehicleRouteConstraintEnvelope(baseEnvelopeInput({
  segments: [baseSegment(0), baseSegment(1, { maximumGradePercent: 12 })],
}));
assert.strictEqual(oneWatch.segments[0].posture, 'within_envelope');
assert.strictEqual(oneWatch.segments[1].posture, 'watch');
assert.strictEqual(oneWatch.earliestWorseningSegment.index, 1);

const payloadExceeded = engine.evaluateVehicleRouteConstraintEnvelope(baseEnvelopeInput({
  rigCompatibilityInput: baseRigInput({ vehicle: { gvwrLbs: 7000, operatingWeightLbs: 7100 } }),
}));
assert.strictEqual(payloadExceeded.posture, 'exceeds_known_envelope');
assert.strictEqual(factor(payloadExceeded, 0, 'payload_weight').posture, 'exceeds_known_envelope');
assert.ok(payloadExceeded.warningCodes.includes('gvwr_exceeded'));

const tireExceeded = engine.evaluateVehicleRouteConstraintEnvelope(baseEnvelopeInput({
  segments: [baseSegment(0, { knownConstraints: { minimumTireDiameterInches: 35, minimumSuspensionLiftInches: 1, trailerAccess: 'allowed' } })],
}));
assert.strictEqual(factor(tireExceeded, 0, 'tire_suitability').posture, 'exceeds_known_envelope');
assert.ok(tireExceeded.warningCodes.includes('segment_tire_minimum_not_met'));

const trailerExceeded = engine.evaluateVehicleRouteConstraintEnvelope(baseEnvelopeInput({
  rigCompatibilityInput: baseRigInput({ trailer: { attached: true, weightLbs: 2500, lengthFeet: 18 } }),
  segments: [baseSegment(0, { knownConstraints: { minimumTireDiameterInches: 32, minimumSuspensionLiftInches: 1, trailerAccess: 'prohibited' } })],
}));
assert.strictEqual(factor(trailerExceeded, 0, 'trailer_constraints').posture, 'exceeds_known_envelope');

const fuelExceeded = engine.evaluateVehicleRouteConstraintEnvelope(baseEnvelopeInput({
  rigCompatibilityInput: baseRigInput({ resources: { currentFuelGallons: 5, averageMpg: 20, fuelRangeMiles: 100 } }),
  segments: [baseSegment(0, { distanceEndMiles: 100 })],
}));
assert.strictEqual(factor(fuelExceeded, 0, 'fuel_range').posture, 'exceeds_known_envelope');
assert.ok(fuelExceeded.warningCodes.includes('fuel_range_below_policy'));

const recoveryExceeded = engine.evaluateVehicleRouteConstraintEnvelope(baseEnvelopeInput({
  rigCompatibilityInput: baseRigInput({
    recovery: {
      ratedRecoveryPoints: false,
      strapOrRope: false,
      shackles: false,
      tractionAids: false,
      fullSizeSpare: false,
      jack: false,
      winch: false,
    },
  }),
  segments: [baseSegment(0, { remotenessScore: 9, nearestBailoutDistanceMiles: 12 })],
}));
assert.strictEqual(factor(recoveryExceeded, 0, 'recovery_readiness').posture, 'exceeds_known_envelope');

const unknownRoute = engine.evaluateVehicleRouteConstraintEnvelope(baseEnvelopeInput({
  segments: [baseSegment(0, {
    maximumGradePercent: null,
    elevationDataAvailable: false,
    terrainClass: null,
    nearestBailoutDistanceMiles: null,
    bailoutDataAvailable: false,
    advisories: null,
    advisoryCoverage: 'unknown',
    knownConstraints: null,
  })],
}));
assert.strictEqual(unknownRoute.posture, 'unknown');
assert.ok(unknownRoute.missingInputs.includes('segment maximum grade from route geometry'));

const unknownVehicle = engine.evaluateVehicleRouteConstraintEnvelope(baseEnvelopeInput({
  rigCompatibilityInput: baseRigInput({
    vehicle: {
      gvwrLbs: null,
      operatingWeightLbs: null,
      tireDiameterInches: null,
      suspensionLiftInches: null,
    },
  }),
}));
assert.strictEqual(unknownVehicle.posture, 'unknown');
assert.strictEqual(factor(unknownVehicle, 0, 'payload_weight').posture, 'unknown');
assert.strictEqual(factor(unknownVehicle, 0, 'tire_suitability').posture, 'unknown');

const degradedConfidence = engine.evaluateVehicleRouteConstraintEnvelope(baseEnvelopeInput({
  segments: [baseSegment(0, {
    sourceTruth: source('conflicting-route', {
      confidence: 'low',
      coverage: 'partial',
      availability: 'degraded',
      conflict: true,
      warningCodes: ['source_conflict'],
    }),
  })],
}));
assert.ok(degradedConfidence.confidence.score < allWithin.confidence.score);
assert.strictEqual(degradedConfidence.confidence.level, 'low');

const earliestWorsening = engine.evaluateVehicleRouteConstraintEnvelope(baseEnvelopeInput({
  segments: [
    baseSegment(0),
    baseSegment(1, { maximumGradePercent: 11 }),
    baseSegment(2, { knownConstraints: { minimumTireDiameterInches: 37, minimumSuspensionLiftInches: 1, trailerAccess: 'allowed' } }),
  ],
}));
assert.strictEqual(earliestWorsening.posture, 'exceeds_known_envelope');
assert.strictEqual(earliestWorsening.earliestWorseningSegment.index, 1, 'Earliest worsening is chronological, not simply the worst segment.');

const scenarioInput = baseEnvelopeInput({
  rigCompatibilityInput: baseRigInput({ trailer: { attached: true, weightLbs: 2500, lengthFeet: 18 } }),
  segments: [baseSegment(0, { knownConstraints: { minimumTireDiameterInches: 32, minimumSuspensionLiftInches: 1, trailerAccess: 'prohibited' } })],
});
const scenarioBefore = JSON.stringify(scenarioInput);
const noTrailerPreview = engine.previewVehicleRouteConstraintScenario(scenarioInput, { kind: 'remove_trailer' });
assert.strictEqual(JSON.stringify(scenarioInput), scenarioBefore, 'Scenario preview must not mutate its input or Fleet state.');
assert.strictEqual(noTrailerPreview.scenario.kind, 'remove_trailer');
assert.strictEqual(factor(noTrailerPreview, 0, 'trailer_constraints').posture, 'within_envelope');
assert.ok(noTrailerPreview.sourceTruth.some((item) => item.origin === 'simulated'));

const unsupportedInference = engine.evaluateVehicleRouteConstraintEnvelope(baseEnvelopeInput({
  segments: [baseSegment(0, {
    maximumGradePercent: 24,
    terrainClass: 'difficult',
    knownConstraints: null,
  })],
}));
assert.strictEqual(unsupportedInference.posture, 'watch', 'Difficult terrain and grade are exposure watches, not unsupported passability failures.');
for (const unsupported of [
  'water_fording_depth',
  'exact_ground_clearance_requirement',
  'trail_width',
  'bridge_capacity',
  'surface_traction',
  'passability',
  'legal_access',
]) {
  assert.ok(unsupportedInference.unsupportedConstraints.includes(unsupported));
}

const presentationModel = presentation.buildVehicleRouteConstraintEnvelopePresentation(earliestWorsening);
assert.strictEqual(presentationModel.segments.length, 3);
assert.ok(presentationModel.earliestWorseningLabel.includes('Segment 2'));
assert.strictEqual(
  presentation.sortVehicleRouteConstraintFactors(earliestWorsening.segments[2].factors)[0].posture,
  'exceeds_known_envelope',
);

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
    tire_size_inches: null,
    suspension_lift_inches: null,
    updated_at: NOW,
  },
  spec: {
    gvwr_lb: 7000,
    base_weight_lb: 5000,
    fuel_tank_capacity_gal: 24,
    fuel_type: 'gas',
    drivetrain: '4WD',
    tire_size_inches: 33,
    suspension_lift_inches: 2,
    is_leveled: false,
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
  resourceProfile: { currentFuelGallons: 12, currentWaterGallons: 4 },
  accessorySummary: [],
  loadout: { updated_at: NOW },
  loadoutItems: [],
  vehicleState: {
    updatedAt: NOW,
    confidence: { score: 90 },
    identity: { displayName: 'Active Rig' },
    canonicalFleetState: { fleetVehicle: { buildProfile: { drivetrain: '4WD' } } },
    centerOfGravity: {
      riskLevel: 'clear',
      topHeavyRisk: 'clear',
      frontAxleRisk: 'clear',
      rearAxleRisk: 'clear',
      totalKnownWeightLbs: 5600,
      dataQuality: 'verified',
      warnings: [],
    },
  },
  weightSnapshot: {
    gvwrLbs: 7000,
    estimatedOperatingWeightLbs: 5600,
    weightConfidence: 88,
    isEstimate: false,
    isPartial: false,
  },
};
const routeIntelligence = {
  id: 'analysis-1',
  sourceId: 'route-1',
  routeName: 'Analyzed Route',
  totalDistanceMiles: 10,
  estimatedDriveTimeHours: 1,
  elevationGainFeet: 500,
  elevationLossFeet: 300,
  highestElevationFeet: 4800,
  lowestElevationFeet: 4000,
  avgElevationFeet: 4400,
  totalPoints: 20,
  segments: [{
    segmentIndex: 0,
    distanceStart: 0,
    distanceEnd: 10,
    avgElevation: 4400,
    elevationGain: 500,
    elevationLoss: 300,
    maxElevation: 4800,
    minElevation: 4000,
    coordinates: [40, -120],
    pointCount: 20,
    avgGradePercent: 4,
    maxGradePercent: 9,
    difficulty: 'moderate',
    estimatedDriveTimeHours: 1,
  }],
  segmentCount: 1,
  overallDifficulty: 'moderate',
  bounds: null,
  elevationProfile: [],
  analyzedAt: NOW,
  hasElevation: true,
  avgSpeedAssumption: 35,
};
const adaptedInput = adapter.buildVehicleRouteConstraintEnvelopeInputFromRouteAnalysis(
  routeIntelligence,
  activeContext,
  {
    routeRiskSegments: [{
      run_id: 'route-1',
      cumulative_distance_m: 10 * 1609.344,
      distance_m: 10 * 1609.344,
      bailout_dist_m: 4 * 1609.344,
      remoteness_score: 16,
    }],
    trailer: { attached: false, weightLbs: null, lengthFeet: null },
    segmentEvidenceByIndex: {
      0: {
        advisoryCoverage: 'complete',
        advisories: [],
        knownConstraints: {
          minimumTireDiameterInches: 32,
          minimumSuspensionLiftInches: 1,
          trailerAccess: 'allowed',
        },
      },
    },
  },
);
assert.strictEqual(adaptedInput.segments[0].nearestBailoutDistanceMiles, 4);
assert.strictEqual(adaptedInput.segments[0].remotenessScore, 4);
assert.strictEqual(adaptedInput.segments[0].maximumGradePercent, 9);
assert.strictEqual(adaptedInput.rigCompatibilityInput.route.tractionRequirement, 'unknown');
assert.strictEqual(adaptedInput.rigCompatibilityInput.route.geometryRequirements, null);
const mismatchedRouteInput = adapter.buildVehicleRouteConstraintEnvelopeInputFromRouteAnalysis(
  routeIntelligence,
  activeContext,
  {
    routeRiskSegments: [{
      run_id: 'different-route',
      cumulative_distance_m: 10 * 1609.344,
      distance_m: 10 * 1609.344,
      bailout_dist_m: 1 * 1609.344,
      remoteness_score: 4,
    }],
  },
);
assert.strictEqual(mismatchedRouteInput.segments[0].bailoutDataAvailable, false);
assert.strictEqual(mismatchedRouteInput.segments[0].nearestBailoutDistanceMiles, null);

const previousRolloutValue = process.env.EXPO_PUBLIC_ECS_RIG_COMPATIBILITY_V2;
process.env.EXPO_PUBLIC_ECS_RIG_COMPATIBILITY_V2 = '0';
assert.strictEqual(selector.selectVehicleRouteConstraintEnvelope({
  routeIntelligence,
  vehicleContext: activeContext,
  routeRiskSegments: null,
}), null, 'Envelope rollout must default to no Navigate presentation when disabled.');
process.env.EXPO_PUBLIC_ECS_RIG_COMPATIBILITY_V2 = '1';
assert.ok(selector.selectVehicleRouteConstraintEnvelope({
  routeIntelligence,
  vehicleContext: activeContext,
  routeRiskSegments: null,
}), 'Enabled rollout should return the isolated envelope without selecting V2 for legacy cards.');
if (previousRolloutValue == null) delete process.env.EXPO_PUBLIC_ECS_RIG_COMPATIBILITY_V2;
else process.env.EXPO_PUBLIC_ECS_RIG_COMPATIBILITY_V2 = previousRolloutValue;

const uiSource = fs.readFileSync(path.join(root, 'components', 'navigate', 'VehicleRouteConstraintEnvelope.tsx'), 'utf8');
const routePanelSource = fs.readFileSync(path.join(root, 'components', 'navigate', 'RouteAnalysisPanel.tsx'), 'utf8');
const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
assert.match(uiSource, /ECSModalShell/);
assert.match(uiSource, /SourceTruthInspectorTrigger/);
assert.match(uiSource, /Preview only\. No route, guidance, vehicle, loadout, or trailer state has changed\./);
assert.doesNotMatch(uiSource, /routeStore|vehicleStore|navigateRouteSessionStore/);
assert.match(routePanelSource, /constraintEnvelope/);
assert.match(routePanelSource, /VehicleRouteConstraintEnvelope/);
assert.match(navigateSource, /selectVehicleRouteConstraintEnvelope/);
assert.match(navigateSource, /routeRiskSegments: enrichedProfile\?\.segments \?\? null/);
assert.doesNotMatch(navigateSource, /rigCompatibilityV2/, 'Navigate must remain decoupled from V2 selection and existing V1 cards.');

console.log('Vehicle Route Constraint Envelope engine, adapter, scenario, presentation, and UI contract checks passed.');
