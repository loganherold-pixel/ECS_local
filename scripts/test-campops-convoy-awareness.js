const assert = require('assert');
require('./campops-react-native-test-shim');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campOpsPath = path.join(root, 'lib', 'campops', 'index.ts');

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
    id: 'ctx-convoy',
    currentTimeIso: '2026-04-30T16:00:00.000Z',
    desiredArrivalWindow: {
      startIso: '2026-04-30T17:00:00.000Z',
      endIso: '2026-04-30T19:00:00.000Z',
      latestAcceptableIso: '2026-04-30T19:30:00.000Z',
    },
    convoyProfile: {
      vehicleCount: 2,
      peopleCount: 3,
      petCount: 0,
      trailerCount: 0,
      trailerPresent: false,
    },
    riskTolerance: 'balanced',
    offlineMode: 'online',
    ...overrides,
  };
}

function candidate(id, overrides = {}) {
  return {
    id,
    name: id,
    location: { latitude: 39.1, longitude: -119.9 },
    source: 'manual',
    sourceConfidence: 'high',
    lastVerifiedDate: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function enrichment(candidateId, overrides = {}) {
  return {
    candidateId,
    legalStatus: 'allowed',
    legalConfidence: 'high',
    closureStatus: 'open',
    publicAccessStatus: 'public',
    accessDifficulty: 'easy',
    vehicleFit: 'fit',
    trailerSuitability: 'fit',
    turnaroundSuitability: 'fit',
    groupCapacityEstimate: 8,
    etaIso: '2026-04-30T18:00:00.000Z',
    sunsetMarginMinutes: 80,
    fuelImpact: { value: 85, unit: 'miles', impact: 'neutral', confidence: 'high' },
    waterImpact: { value: 12, unit: 'gallons', impact: 'neutral', confidence: 'high' },
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

function buildSet(ctx, candidateList, rawEnrichments, options = {}) {
  const enrichments = {};
  const hardGateEvaluationsByCandidateId = {};
  const suitabilityScoresByCandidateId = {};
  for (const camp of candidateList) {
    const enriched = campops.attachCampResourceDebt({
      context: ctx,
      candidate: camp,
      enrichment: rawEnrichments[camp.id],
      config: options.resourceDebtConfig,
    });
    enrichments[camp.id] = enriched;
    hardGateEvaluationsByCandidateId[camp.id] = campops.evaluateCampCandidateHardGates({
      context: ctx,
      candidate: camp,
      enrichment: enriched,
      config: options.hardGateConfig,
    });
    suitabilityScoresByCandidateId[camp.id] = campops.scoreCampSuitability({
      context: ctx,
      candidate: camp,
      enrichment: enriched,
      hardGateEvaluation: hardGateEvaluationsByCandidateId[camp.id],
      config: options.scoringConfig,
    });
  }
  return campops.generateCampRecommendationSet({
    context: ctx,
    candidates: candidateList,
    enrichmentsByCandidateId: enrichments,
    hardGateEvaluationsByCandidateId,
    suitabilityScoresByCandidateId,
    config: options.recommendationConfig,
  });
}

const lowFuelCtx = context({
  convoyProfile: {
    vehicleCount: 2,
    peopleCount: 3,
    lowestFuelReserveVehicle: {
      vehicleId: 'rig-low-fuel',
      label: 'low-fuel rig',
      fuelReserveMiles: 18,
      confidence: 'high',
    },
  },
});
const scenicRemote = candidate('scenic-remote');
const resupplyFriendly = candidate('resupply-friendly');
const lowFuelSet = buildSet(lowFuelCtx, [scenicRemote, resupplyFriendly], {
  'scenic-remote': enrichment('scenic-remote', {
    fuelImpact: { value: 45, unit: 'miles', impact: 'watch', confidence: 'medium' },
    privacyLikelihood: 'high',
  }),
  'resupply-friendly': enrichment('resupply-friendly', {
    fuelImpact: { value: 95, unit: 'miles', impact: 'positive', confidence: 'high' },
    waterImpact: { value: 16, unit: 'gallons', impact: 'positive', confidence: 'high' },
    reliableWaterRefillAvailable: true,
    privacyLikelihood: 'moderate',
  }),
});
assert.strictEqual(lowFuelSet.recommendedCamp.id, 'resupply-friendly');
assert.ok(lowFuelSet.assumptions.includes('Recommendation is based on the convoy’s limiting vehicle/resource.'));
assert.ok(
  lowFuelSet.enrichmentsByCandidateId['scenic-remote'].resourceDebt.fuel.reason.includes('convoy limiting vehicle/resource'),
);
assert.ok(
  !lowFuelSet.enrichmentsByCandidateId['scenic-remote'].resourceDebt.fuel.reason.includes('low-fuel rig'),
  'Resource debt explanations should not expose private convoy vehicle labels.',
);

const trailerCtx = context({
  convoyProfile: {
    vehicleCount: 2,
    peopleCount: 3,
    trailerPresent: true,
    trailerCount: 1,
    leastCapableVehicleProfile: { vehicleId: 'tow-rig', label: 'Tow rig', trailerAttached: true },
  },
});
const narrowDeadEnd = candidate('narrow-dead-end');
const trailerTurnaround = candidate('trailer-turnaround');
const trailerSet = buildSet(trailerCtx, [narrowDeadEnd, trailerTurnaround], {
  'narrow-dead-end': enrichment('narrow-dead-end', {
    accessDifficulty: 'technical',
    trailerSuitability: 'not_fit',
    privacyLikelihood: 'high',
  }),
  'trailer-turnaround': enrichment('trailer-turnaround', {
    accessDifficulty: 'easy',
    trailerSuitability: 'fit',
    turnaroundSuitability: 'fit',
    privacyLikelihood: 'moderate',
  }),
});
assert.strictEqual(trailerSet.recommendedCamp.id, 'trailer-turnaround');
assert.strictEqual(trailerSet.rejectedCandidates[0].candidate.id, 'narrow-dead-end');

const largeGroupCtx = context({
  convoyProfile: {
    vehicleCount: 4,
    peopleCount: 9,
    kidCount: 2,
    kidsPresent: true,
  },
});
const smallCamp = candidate('small-camp');
const groupCamp = candidate('group-camp');
const groupSet = buildSet(largeGroupCtx, [smallCamp, groupCamp], {
  'small-camp': enrichment('small-camp', {
    groupCapacityEstimate: 5,
    privacyLikelihood: 'high',
  }),
  'group-camp': enrichment('group-camp', {
    groupCapacityEstimate: 12,
    dataConfidence: 'high',
    privacyLikelihood: 'moderate',
  }),
});
assert.strictEqual(groupSet.recommendedCamp.id, 'group-camp');
assert.strictEqual(groupSet.rejectedCandidates[0].candidate.id, 'small-camp');

const mechanicalCtx = context({
  convoyProfile: {
    vehicleCount: 2,
    peopleCount: 3,
    mechanicalIssueFlag: true,
  },
});
const scenicButRemote = candidate('scenic-but-remote');
const recoveryFriendly = candidate('recovery-friendly');
const recoverySet = buildSet(mechanicalCtx, [scenicButRemote, recoveryFriendly], {
  'scenic-but-remote': enrichment('scenic-but-remote', {
    privacyLikelihood: 'high',
    accessDifficulty: 'moderate',
    recoveryFriendly: false,
    exitDistanceMiles: 35,
    serviceDistanceMiles: 75,
  }),
  'recovery-friendly': enrichment('recovery-friendly', {
    privacyLikelihood: 'moderate',
    accessDifficulty: 'easy',
    recoveryFriendly: true,
    exitDistanceMiles: 2,
    serviceDistanceMiles: 9,
  }),
});
assert.strictEqual(recoverySet.recommendedCamp.id, 'recovery-friendly');
assert.ok(recoverySet.assumptions.some((assumption) => assumption.includes('Mechanical issue flag')));

console.log('CampOps convoy awareness checks passed.');
