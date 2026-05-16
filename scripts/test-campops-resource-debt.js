const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campOpsPath = path.join(root, 'lib', 'campops', 'index.ts');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web', select: (values) => values?.web ?? values?.default } };
  }
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

const campops = require(campOpsPath);

function context(overrides = {}) {
  return {
    id: 'ctx-resource-debt',
    currentTimeIso: '2026-04-30T16:00:00.000Z',
    desiredArrivalWindow: {
      startIso: '2026-04-30T17:00:00.000Z',
      endIso: '2026-04-30T19:00:00.000Z',
      latestAcceptableIso: '2026-04-30T19:30:00.000Z',
    },
    convoyProfile: { peopleCount: 2, petCount: 0 },
    riskTolerance: 'balanced',
    offlineMode: 'online',
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return {
    id: 'camp-resource',
    name: 'Resource camp',
    location: { latitude: 39.1, longitude: -119.9 },
    source: 'manual',
    sourceConfidence: 'high',
    lastVerifiedDate: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function enrichment(overrides = {}) {
  return {
    candidateId: 'camp-resource',
    legalStatus: 'allowed',
    legalConfidence: 'high',
    closureStatus: 'open',
    publicAccessStatus: 'public',
    accessDifficulty: 'easy',
    vehicleFit: 'fit',
    trailerSuitability: 'fit',
    groupCapacityEstimate: 4,
    etaIso: '2026-04-30T18:00:00.000Z',
    sunsetMarginMinutes: 80,
    fuelImpact: { value: 80, unit: 'miles', impact: 'neutral', confidence: 'high' },
    waterImpact: { value: 5, unit: 'gallons', impact: 'neutral', confidence: 'high' },
    reliableWaterRefillAvailable: false,
    terrainSlopeEstimate: { value: 2, unit: 'degrees', confidence: 'high', source: 'inferred' },
    weatherExposure: 'neutral',
    fireRestrictionStatus: 'none_known',
    privacyLikelihood: 'moderate',
    occupancyLikelihood: 'low',
    lateArrivalRisk: 'neutral',
    dataConfidence: 'high',
    ...overrides,
  };
}

const safeDebt = campops.calculateCampResourceDebt({
  context: context(),
  candidate: candidate(),
  enrichment: enrichment(),
});
assert.strictEqual(safeDebt.fuel.status, 'safe');
assert.strictEqual(safeDebt.water.status, 'safe');
assert.strictEqual(safeDebt.daylight.status, 'safe');
assert.strictEqual(safeDebt.campUncertainty.status, 'safe');
assert.strictEqual(safeDebt.margins.fuelExitMargin.status, 'comfortable');
assert.strictEqual(safeDebt.margins.waterNextDayMargin.status, 'comfortable');

const routeAwareFuelDebt = campops.calculateCampResourceDebt({
  context: context({
    resourceState: { fuelReserveMiles: 100, confidence: 'high' },
    routeProgress: { confidence: 'high' },
  }),
  candidate: candidate(),
  enrichment: enrichment({
    routeDistanceToCampMiles: 40,
    fuelImpact: { value: 90, unit: 'miles', impact: 'neutral', confidence: 'high' },
    nearestFuel: {
      serviceType: 'fuel',
      name: 'Route Fuel',
      routeAwareDistanceMiles: 30,
      distanceFromCampMiles: 8,
      confidence: 'high',
      status: 'open',
    },
  }),
});
assert.strictEqual(routeAwareFuelDebt.margins.fuelToCamp.basis, 'route_aware');
assert.strictEqual(routeAwareFuelDebt.margins.fuelToCamp.value, 40);
assert.strictEqual(routeAwareFuelDebt.margins.fuelToNextKnownFuel.value, 30);
assert.strictEqual(routeAwareFuelDebt.margins.fuelExitMargin.value, 30);
assert.strictEqual(routeAwareFuelDebt.fuel.status, 'tight', 'Route-aware distance should change fuel margin instead of using provided reserve.');

const straightLineFallbackDebt = campops.calculateCampResourceDebt({
  context: context({
    currentLocation: {
      value: { latitude: 39.0, longitude: -119.9 },
      source: 'manual',
      confidence: 'medium',
    },
    resourceState: { fuelReserveMiles: 80, confidence: 'medium' },
  }),
  candidate: candidate({ location: { latitude: 39.1, longitude: -119.9 } }),
  enrichment: enrichment({
    fuelImpact: undefined,
    nearestFuel: {
      serviceType: 'fuel',
      name: 'Fallback Fuel',
      distanceFromCampMiles: 12,
      confidence: 'medium',
      status: 'open',
    },
  }),
});
assert.strictEqual(straightLineFallbackDebt.margins.fuelToCamp.basis, 'straight_line');
assert.ok(straightLineFallbackDebt.margins.fuelToCamp.missingDataFields.includes('routeDistanceToCampMiles'));
assert.ok(straightLineFallbackDebt.fuel.value < 80, 'Straight-line fallback should still reduce the fuel margin.');

const convoyLimiterDebt = campops.calculateCampResourceDebt({
  context: context({
    resourceState: { fuelReserveMiles: 120, confidence: 'high' },
    convoyProfile: {
      peopleCount: 2,
      lowestFuelReserveVehicle: { fuelReserveMiles: 55, confidence: 'medium' },
    },
    routeProgress: { confidence: 'high' },
  }),
  candidate: candidate(),
  enrichment: enrichment({
    routeDistanceToCampMiles: 30,
    fuelImpact: { value: 110, unit: 'miles', impact: 'neutral', confidence: 'high' },
    nearestFuel: {
      serviceType: 'fuel',
      name: 'Next Fuel',
      routeAwareDistanceMiles: 20,
      confidence: 'high',
      status: 'open',
    },
  }),
});
assert.strictEqual(convoyLimiterDebt.margins.fuelAfterCamp.value, 25);
assert.strictEqual(convoyLimiterDebt.margins.fuelExitMargin.value, 5);
assert.strictEqual(convoyLimiterDebt.fuel.status, 'critical', 'Lowest-fuel convoy vehicle should drive fuel debt.');

const coolWaterDebt = campops.calculateCampResourceDebt({
  context: context({ convoyProfile: { peopleCount: 2, petCount: 0 } }),
  candidate: candidate(),
  enrichment: enrichment({
    routeDistanceToCampMiles: 12,
    waterImpact: { value: 5, unit: 'gallons', impact: 'neutral', confidence: 'high' },
    heatRisk: 'low',
  }),
});
const hotWaterDebt = campops.calculateCampResourceDebt({
  context: context({ convoyProfile: { peopleCount: 2, petCount: 0 } }),
  candidate: candidate(),
  enrichment: enrichment({
    routeDistanceToCampMiles: 12,
    waterImpact: { value: 5, unit: 'gallons', impact: 'neutral', confidence: 'high' },
    heatRisk: 'high',
  }),
});
assert.ok(hotWaterDebt.water.value < coolWaterDebt.water.value, 'High heat should increase water concern.');
assert.ok(hotWaterDebt.margins.assumptions.some((assumption) => assumption.includes('high heat risk')));

const missingRouteDebt = campops.calculateCampResourceDebt({
  context: context({ resourceState: { fuelReserveMiles: 80, confidence: 'medium' } }),
  candidate: candidate(),
  enrichment: enrichment({
    fuelImpact: { value: 80, unit: 'miles', impact: 'neutral', confidence: 'medium' },
    routeDistanceToCampMiles: null,
    straightLineDistanceToCampMiles: null,
  }),
});
assert.strictEqual(missingRouteDebt.margins.fuelToCamp.status, 'unknown');
assert.strictEqual(missingRouteDebt.margins.fuelExitMargin.basis, 'provided_margin');
assert.ok(missingRouteDebt.margins.assumptions.some((assumption) => assumption.includes('fallback data')));

const tightFuelDebt = campops.calculateCampResourceDebt({
  context: context(),
  candidate: candidate(),
  enrichment: enrichment({
    fuelImpact: { value: 30, unit: 'miles', impact: 'watch', confidence: 'medium' },
  }),
});
assert.strictEqual(tightFuelDebt.fuel.status, 'tight');

const criticalFuelDebt = campops.calculateCampResourceDebt({
  context: context(),
  candidate: candidate(),
  enrichment: enrichment({
    fuelImpact: { value: 12, unit: 'miles', impact: 'critical', confidence: 'medium' },
  }),
});
assert.strictEqual(criticalFuelDebt.fuel.status, 'critical');

const waterDebt = campops.calculateCampResourceDebt({
  context: context({ convoyProfile: { peopleCount: 4, petCount: 1 } }),
  candidate: candidate(),
  enrichment: enrichment({
    waterImpact: { value: 4, unit: 'gallons', impact: 'caution', confidence: 'medium' },
  }),
});
assert.strictEqual(waterDebt.water.status, 'critical');
assert.ok(waterDebt.water.value < 0);

const tightDaylightDebt = campops.calculateCampResourceDebt({
  context: context(),
  candidate: candidate(),
  enrichment: enrichment({ sunsetMarginMinutes: 25 }),
});
assert.strictEqual(tightDaylightDebt.daylight.status, 'tight');

const afterDarkDebt = campops.calculateCampResourceDebt({
  context: context(),
  candidate: candidate(),
  enrichment: enrichment({
    etaIso: '2026-04-30T20:00:00.000Z',
    sunsetMarginMinutes: -15,
  }),
});
assert.strictEqual(afterDarkDebt.daylight.status, 'after_dark');

const uncertaintyDebt = campops.calculateCampResourceDebt({
  context: context(),
  candidate: candidate({ sourceConfidence: 'low', lastVerifiedDate: null }),
  enrichment: enrichment({
    legalConfidence: 'low',
    occupancyLikelihood: 'high',
    dataConfidence: 'low',
  }),
});
assert.strictEqual(uncertaintyDebt.campUncertainty.status, 'critical');
assert.ok(uncertaintyDebt.campUncertainty.missingDataFields.includes('lastVerifiedDate'));

const unknownDebt = campops.calculateCampResourceDebt({
  context: context({ convoyProfile: {} }),
  candidate: candidate({ lastVerifiedDate: null }),
  enrichment: enrichment({
    fuelImpact: undefined,
    waterImpact: undefined,
    etaIso: null,
    sunsetMarginMinutes: null,
    dataConfidence: 'unknown',
    legalConfidence: 'unknown',
    occupancyLikelihood: 'unknown',
  }),
});
assert.strictEqual(unknownDebt.fuel.status, 'unknown');
assert.strictEqual(unknownDebt.water.status, 'unknown');
assert.strictEqual(unknownDebt.daylight.status, 'unknown');
assert.ok(unknownDebt.fuel.missingDataFields.includes('fuelImpact.value'));

const enrichedWithDebt = campops.attachCampResourceDebt({
  context: context({ convoyProfile: { peopleCount: 4 } }),
  candidate: candidate(),
  enrichment: enrichment({
    fuelImpact: { value: 20, unit: 'miles', impact: 'critical', confidence: 'medium' },
    waterImpact: { value: 3, unit: 'gallons', impact: 'caution', confidence: 'medium' },
    sunsetMarginMinutes: -5,
  }),
});
assert.strictEqual(enrichedWithDebt.resourceDebt.fuel.status, 'critical');
assert.strictEqual(enrichedWithDebt.resourceDebt.daylight.status, 'after_dark');

const hardGate = campops.evaluateCampCandidateHardGates({
  context: context({ convoyProfile: { peopleCount: 4 } }),
  candidate: candidate(),
  enrichment: enrichedWithDebt,
});
const score = campops.scoreCampSuitability({
  context: context({ convoyProfile: { peopleCount: 4 } }),
  candidate: candidate(),
  enrichment: enrichedWithDebt,
  hardGateEvaluation: hardGate,
});
assert.strictEqual(score.explanation.resourceDebt.fuel.status, 'critical');
assert.ok(score.explanation.negativeFactors.some((factor) => factor.includes('fuel margin')));
assert.ok(score.explanation.negativeFactors.some((factor) => factor.includes('daylight')));

assert.strictEqual(
  campops.isCampOpsResourceDebtFeatureEnabled(
    campops.DEFAULT_CAMP_OPS_RESOURCE_DEBT_ROLLOUT_CONFIG,
    'campOpsResourceDebtEnabled',
  ),
  false,
);

console.log('CampOps resource debt checks passed.');
