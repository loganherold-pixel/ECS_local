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

function baseContext(overrides = {}) {
  return {
    id: 'ctx-1',
    currentTimeIso: '2026-04-30T16:00:00.000Z',
    desiredArrivalWindow: {
      startIso: '2026-04-30T17:00:00.000Z',
      endIso: '2026-04-30T19:00:00.000Z',
      latestAcceptableIso: '2026-04-30T19:30:00.000Z',
    },
    riskTolerance: 'balanced',
    offlineMode: 'online',
    ...overrides,
  };
}

function baseCandidate(overrides = {}) {
  return {
    id: 'camp-1',
    name: 'Bench camp',
    location: { latitude: 39.1, longitude: -119.9 },
    source: 'manual',
    sourceConfidence: 'high',
    ...overrides,
  };
}

function baseEnrichment(overrides = {}) {
  return {
    candidateId: 'camp-1',
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
    fuelImpact: { value: 60, unit: 'miles', impact: 'neutral', confidence: 'high' },
    waterImpact: { value: 5, unit: 'gallons', impact: 'neutral', confidence: 'high' },
    reliableWaterRefillAvailable: false,
    terrainSlopeEstimate: { value: 2, unit: 'degrees', confidence: 'medium', source: 'inferred' },
    weatherExposure: 'neutral',
    fireRestrictionStatus: 'none_known',
    privacyLikelihood: 'moderate',
    occupancyLikelihood: 'low',
    lateArrivalRisk: 'neutral',
    dataConfidence: 'high',
    ...overrides,
  };
}

function evaluate(overrides = {}) {
  return campops.evaluateCampCandidateHardGates({
    context: overrides.context ?? baseContext(),
    candidate: overrides.candidate ?? baseCandidate(),
    enrichment: overrides.enrichment ?? baseEnrichment(),
    config: overrides.config,
  });
}

const allowed = evaluate();
assert.strictEqual(allowed.status, 'allowed');
assert.deepStrictEqual(allowed.failedGates, []);
assert.strictEqual(allowed.severity, 'info');

const legalReject = evaluate({
  enrichment: baseEnrichment({ legalStatus: 'prohibited' }),
});
assert.strictEqual(legalReject.status, 'rejected');
assert.ok(legalReject.failedGates.some((gate) => gate.gateId === 'campops.legal.prohibited'));
assert.strictEqual(legalReject.severity, 'critical');

const closureReject = evaluate({
  enrichment: baseEnrichment({ closureStatus: 'closed' }),
});
assert.strictEqual(closureReject.status, 'rejected');
assert.ok(closureReject.failedGates.some((gate) => gate.gateId === 'campops.access.closed'));

const trailerReject = evaluate({
  context: baseContext({
    vehicleProfile: { trailerAttached: true },
  }),
  enrichment: baseEnrichment({ trailerSuitability: 'not_fit' }),
});
assert.strictEqual(trailerReject.status, 'rejected');
assert.ok(trailerReject.failedGates.some((gate) => gate.gateId === 'campops.trailer.not_fit'));

const trailerNoTurnaroundReject = evaluate({
  context: baseContext({
    vehicleProfile: { trailerAttached: true },
  }),
  enrichment: baseEnrichment({
    trailerSuitability: 'fit',
    turnaroundSuitability: 'not_fit',
    trailerTurnaroundConfidence: 'high',
  }),
});
assert.strictEqual(trailerNoTurnaroundReject.status, 'rejected');
assert.ok(trailerNoTurnaroundReject.failedGates.some((gate) => gate.gateId === 'campops.trailer.no_turnaround'));

const trailerUnknownTurnaroundCaution = evaluate({
  context: baseContext({
    vehicleProfile: { trailerAttached: true },
  }),
  enrichment: baseEnrichment({
    trailerSuitability: 'fit',
    turnaroundSuitability: 'unknown',
    trailerTurnaroundConfidence: 'unknown',
  }),
});
assert.strictEqual(trailerUnknownTurnaroundCaution.status, 'unknown');
assert.ok(trailerUnknownTurnaroundCaution.unknownGates.some((gate) => gate.gateId === 'campops.trailer.turnaround_unknown'));

const capacityCaution = evaluate({
  context: baseContext({
    convoyProfile: { peopleCount: 5 },
  }),
  enrichment: baseEnrichment({ groupCapacityEstimate: 4 }),
});
assert.strictEqual(capacityCaution.status, 'caution');
assert.ok(capacityCaution.cautionGates.some((gate) => gate.gateId === 'campops.group.capacity_tight'));

const capacityReject = evaluate({
  context: baseContext({
    convoyProfile: { peopleCount: 7 },
  }),
  enrichment: baseEnrichment({ groupCapacityEstimate: 4 }),
});
assert.strictEqual(capacityReject.status, 'rejected');
assert.ok(capacityReject.failedGates.some((gate) => gate.gateId === 'campops.group.capacity_exceeded'));

const vehicleCapacityReject = evaluate({
  context: baseContext({
    convoyProfile: { vehicleCount: 4, peopleCount: 4 },
  }),
  enrichment: baseEnrichment({
    groupCapacityEstimate: 1,
    groupCapacityConfidence: 'high',
  }),
});
assert.strictEqual(vehicleCapacityReject.status, 'rejected');
assert.ok(vehicleCapacityReject.failedGates.some((gate) => gate.gateId === 'campops.group.capacity_exceeded'));

const lateArrivalReject = evaluate({
  enrichment: baseEnrichment({
    etaIso: '2026-04-30T21:00:00.000Z',
    lateArrivalRisk: 'critical',
  }),
});
assert.strictEqual(lateArrivalReject.status, 'rejected');
assert.ok(lateArrivalReject.failedGates.some((gate) => gate.gateId === 'campops.time.late_arrival'));

const fuelReject = evaluate({
  context: baseContext({
    resourceState: { fuelRangeMiles: 90 },
  }),
  enrichment: baseEnrichment({
    fuelImpact: { value: 12, unit: 'miles', impact: 'critical', confidence: 'high' },
  }),
});
assert.strictEqual(fuelReject.status, 'rejected');
assert.ok(fuelReject.failedGates.some((gate) => gate.gateId === 'campops.resources.fuel_margin'));

const waterReject = evaluate({
  context: baseContext({
    resourceState: { waterGallons: 1 },
  }),
  enrichment: baseEnrichment({
    waterImpact: { value: 1, unit: 'gallons', impact: 'critical', confidence: 'high' },
    reliableWaterRefillAvailable: false,
  }),
});
assert.strictEqual(waterReject.status, 'rejected');
assert.ok(waterReject.failedGates.some((gate) => gate.gateId === 'campops.resources.water_margin'));

const missingDataUnknown = evaluate({
  enrichment: baseEnrichment({
    legalStatus: 'unknown',
    legalConfidence: 'unknown',
    publicAccessStatus: 'unknown',
    vehicleFit: 'unknown',
    dataConfidence: 'unknown',
  }),
});
assert.strictEqual(missingDataUnknown.status, 'unknown');
assert.strictEqual(missingDataUnknown.failedGates.length, 0);
assert.ok(missingDataUnknown.missingData.includes('legalStatus'));
assert.ok(missingDataUnknown.unknownGates.some((gate) => gate.gateId === 'campops.data.missing'));

const lowRiskMissingData = evaluate({
  context: baseContext({
    riskTolerance: 'permissive',
    offlineMode: 'online',
  }),
  enrichment: baseEnrichment({
    legalStatus: 'unknown',
    publicAccessStatus: 'unknown',
    dataConfidence: 'unknown',
  }),
});
assert.notStrictEqual(lowRiskMissingData.status, 'rejected');
assert.strictEqual(lowRiskMissingData.failedGates.length, 0);

const highRiskMissingDataReject = evaluate({
  context: baseContext({
    riskTolerance: 'emergency_only',
  }),
  enrichment: baseEnrichment({
    legalStatus: 'unknown',
    publicAccessStatus: 'unknown',
    dataConfidence: 'unknown',
  }),
});
assert.strictEqual(highRiskMissingDataReject.status, 'rejected');
assert.ok(highRiskMissingDataReject.failedGates.some((gate) => gate.gateId === 'campops.data.insufficient_high_risk'));

const batch = campops.evaluateCampHardGateCandidates({
  context: baseContext(),
  candidates: [baseCandidate({ id: 'camp-1' }), baseCandidate({ id: 'camp-2' })],
  enrichmentsByCandidateId: {
    'camp-1': baseEnrichment({ candidateId: 'camp-1' }),
    'camp-2': baseEnrichment({ candidateId: 'camp-2', legalStatus: 'prohibited' }),
  },
});
assert.deepStrictEqual(batch.map((item) => item.status), ['allowed', 'rejected']);

assert.strictEqual(
  campops.isCampOpsHardGateFeatureEnabled(
    campops.DEFAULT_CAMP_OPS_HARD_GATE_ROLLOUT_CONFIG,
    'campOpsHardGateFilteringEnabled',
  ),
  false,
);

console.log('CampOps hard-gate checks passed.');
