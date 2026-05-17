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
    id: 'ctx-score',
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
    groupCapacityEstimate: 4,
    etaIso: '2026-04-30T18:00:00.000Z',
    sunsetMarginMinutes: 80,
    fuelImpact: { value: 80, unit: 'miles', impact: 'neutral', confidence: 'high' },
    waterImpact: { value: 8, unit: 'gallons', impact: 'neutral', confidence: 'high' },
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

function hardGate(ctx, camp, enriched) {
  return campops.evaluateCampCandidateHardGates({
    context: ctx,
    candidate: camp,
    enrichment: enriched,
  });
}

function score(ctx, camp, enriched, options = {}) {
  return campops.scoreCampSuitability({
    context: ctx,
    candidate: camp,
    enrichment: enriched,
    hardGateEvaluation: options.hardGateEvaluation ?? hardGate(ctx, camp, enriched),
    operationalRole: options.operationalRole,
    config: options.config,
  });
}

const safeCtx = context();
const safeCamp = candidate('safe-legal');
const scenicRiskyCamp = candidate('scenic-risky');
const safeScore = score(safeCtx, safeCamp, enrichment('safe-legal', { privacyLikelihood: 'moderate' }));
const scenicRiskyScore = score(
  safeCtx,
  scenicRiskyCamp,
  enrichment('scenic-risky', {
    legalStatus: 'likely_allowed',
    legalConfidence: 'low',
    privacyLikelihood: 'high',
    terrainSlopeEstimate: { value: 1, unit: 'degrees', confidence: 'high', source: 'inferred' },
  }),
);
assert.ok(
  safeScore.rankScore > scenicRiskyScore.rankScore,
  'Safe legal camp should outrank scenic camp with weak legal confidence.',
);
assert.ok(scenicRiskyScore.scores.legal < safeScore.scores.legal);

const lateCtx = context();
const lateButComfortableCamp = candidate('late-comfortable');
const onTimePlainCamp = candidate('on-time-plain');
const planningLate = score(
  lateCtx,
  lateButComfortableCamp,
  enrichment('late-comfortable', {
    etaIso: '2026-04-30T20:00:00.000Z',
    lateArrivalRisk: 'caution',
    privacyLikelihood: 'high',
    terrainSlopeEstimate: { value: 1, unit: 'degrees', confidence: 'high', source: 'inferred' },
    fuelImpact: { value: 100, unit: 'miles', impact: 'positive', confidence: 'high' },
    waterImpact: { value: 12, unit: 'gallons', impact: 'positive', confidence: 'high' },
  }),
  {
    config: {
      mode: 'planning',
      weights: { privacy: 2.4, resources: 1.8, lateArrival: 0.4, time: 0.4 },
    },
  },
);
const planningOnTime = score(
  lateCtx,
  onTimePlainCamp,
  enrichment('on-time-plain', {
    privacyLikelihood: 'low',
    terrainSlopeEstimate: { value: 8, unit: 'degrees', confidence: 'medium', source: 'inferred' },
    fuelImpact: { value: 55, unit: 'miles', impact: 'neutral', confidence: 'medium' },
    waterImpact: { value: 5, unit: 'gallons', impact: 'neutral', confidence: 'medium' },
  }),
  {
    config: {
      mode: 'planning',
      weights: { privacy: 2.4, resources: 1.8, lateArrival: 0.4, time: 0.4 },
    },
  },
);
const fieldLate = score(lateCtx, lateButComfortableCamp, enrichment('late-comfortable', {
  etaIso: '2026-04-30T20:00:00.000Z',
  lateArrivalRisk: 'caution',
  privacyLikelihood: 'high',
  terrainSlopeEstimate: { value: 1, unit: 'degrees', confidence: 'high', source: 'inferred' },
  fuelImpact: { value: 100, unit: 'miles', impact: 'positive', confidence: 'high' },
  waterImpact: { value: 12, unit: 'gallons', impact: 'positive', confidence: 'high' },
}), {
  config: {
    mode: 'field',
    fieldModeLateArrivalWeightMultiplier: 8,
    weights: { privacy: 2.4, resources: 1.8, lateArrival: 0.4, time: 0.4 },
  },
});
const fieldOnTime = score(lateCtx, onTimePlainCamp, enrichment('on-time-plain', {
  privacyLikelihood: 'low',
  terrainSlopeEstimate: { value: 8, unit: 'degrees', confidence: 'medium', source: 'inferred' },
  fuelImpact: { value: 55, unit: 'miles', impact: 'neutral', confidence: 'medium' },
  waterImpact: { value: 5, unit: 'gallons', impact: 'neutral', confidence: 'medium' },
}), {
  config: {
    mode: 'field',
    fieldModeLateArrivalWeightMultiplier: 8,
    weights: { privacy: 2.4, resources: 1.8, lateArrival: 0.4, time: 0.4 },
  },
});
assert.ok(planningLate.rankScore > planningOnTime.rankScore, 'Planning mode may still prefer the more comfortable late camp.');
assert.ok(fieldOnTime.rankScore > fieldLate.rankScore, 'Field mode should penalize late-arrival risk enough to change ranking.');

const noTrailerCtx = context();
const trailerCtx = context({ vehicleProfile: { trailerAttached: true } });
const scenicLimitedTrailer = candidate('scenic-limited-trailer');
const plainTrailerFit = candidate('plain-trailer-fit');
const scenicLimitedNoTrailer = score(
  noTrailerCtx,
  scenicLimitedTrailer,
  enrichment('scenic-limited-trailer', {
    trailerSuitability: 'limited',
    privacyLikelihood: 'high',
    terrainSlopeEstimate: { value: 1, unit: 'degrees', confidence: 'high', source: 'inferred' },
  }),
);
const plainFitNoTrailer = score(
  noTrailerCtx,
  plainTrailerFit,
  enrichment('plain-trailer-fit', {
    trailerSuitability: 'fit',
    privacyLikelihood: 'low',
    terrainSlopeEstimate: { value: 7, unit: 'degrees', confidence: 'medium', source: 'inferred' },
  }),
);
const scenicLimitedWithTrailer = score(
  trailerCtx,
  scenicLimitedTrailer,
  enrichment('scenic-limited-trailer', {
    trailerSuitability: 'limited',
    privacyLikelihood: 'high',
    terrainSlopeEstimate: { value: 1, unit: 'degrees', confidence: 'high', source: 'inferred' },
  }),
);
const plainFitWithTrailer = score(
  trailerCtx,
  plainTrailerFit,
  enrichment('plain-trailer-fit', {
    trailerSuitability: 'fit',
    turnaroundSuitability: 'fit',
    trailerTurnaroundConfidence: 'high',
    deadEndRisk: 'low',
    backingRequired: false,
    roadWidthConfidence: 'high',
    privacyLikelihood: 'low',
    terrainSlopeEstimate: { value: 7, unit: 'degrees', confidence: 'medium', source: 'inferred' },
  }),
);
assert.ok(scenicLimitedNoTrailer.rankScore > plainFitNoTrailer.rankScore, 'Without a trailer, scenic camp can win.');
assert.ok(plainFitWithTrailer.rankScore > scenicLimitedWithTrailer.rankScore, 'With a trailer, trailer fit should dominate.');

const unknownTurnaroundWithTrailer = score(
  trailerCtx,
  candidate('unknown-turnaround'),
  enrichment('unknown-turnaround', {
    trailerSuitability: 'fit',
    turnaroundSuitability: 'unknown',
    trailerTurnaroundConfidence: 'unknown',
    deadEndRisk: 'unknown',
  }),
);
const knownTurnaroundWithTrailer = score(
  trailerCtx,
  candidate('known-turnaround'),
  enrichment('known-turnaround', {
    trailerSuitability: 'fit',
    turnaroundSuitability: 'fit',
    trailerTurnaroundConfidence: 'high',
    deadEndRisk: 'low',
    backingRequired: false,
    roadWidthConfidence: 'high',
  }),
);
assert.ok(knownTurnaroundWithTrailer.scores.trailerFit > unknownTurnaroundWithTrailer.scores.trailerFit);
assert.ok(unknownTurnaroundWithTrailer.explanation.assumptions.some((item) => item.includes('Trailer turnaround confidence is unknown')));

const largeGroupCtx = context({ convoyProfile: { vehicleCount: 4, peopleCount: 8 } });
const oneVehicleSiteScore = score(
  largeGroupCtx,
  candidate('one-vehicle-site'),
  enrichment('one-vehicle-site', {
    groupCapacityEstimate: 1,
    groupCapacityConfidence: 'high',
  }),
);
const groupSiteScore = score(
  largeGroupCtx,
  candidate('group-site'),
  enrichment('group-site', {
    groupCapacityEstimate: 9,
    groupCapacityConfidence: 'medium',
  }),
);
assert.ok(groupSiteScore.scores.groupFit > oneVehicleSiteScore.scores.groupFit, 'Group of four vehicles should downgrade one-vehicle site.');
assert.ok(oneVehicleSiteScore.explanation.negativeFactors.some((item) => item.toLowerCase().includes('group capacity')));

const lowLegalScore = score(
  safeCtx,
  candidate('low-legal'),
  enrichment('low-legal', { legalStatus: 'likely_allowed', legalConfidence: 'low' }),
);
assert.ok(lowLegalScore.scores.legal < 75);
assert.ok(lowLegalScore.rankScore < safeScore.rankScore);

const resourceDebtScore = score(
  safeCtx,
  candidate('resource-debt'),
  enrichment('resource-debt', {
    fuelImpact: { value: 28, unit: 'miles', impact: 'caution', confidence: 'medium' },
    waterImpact: { value: 3, unit: 'gallons', impact: 'watch', confidence: 'medium' },
  }),
);
assert.ok(resourceDebtScore.scores.resources < safeScore.scores.resources);
assert.ok(resourceDebtScore.explanation.negativeFactors.some((item) => item.includes('Fuel or water debt')));

const emergencyCtx = context({ riskTolerance: 'emergency_only' });
const emergencyCamp = candidate('emergency-safe');
const comfortCamp = candidate('comfort-but-not-emergency');
const emergencyResult = score(
  emergencyCtx,
  emergencyCamp,
  enrichment('emergency-safe', {
    privacyLikelihood: 'low',
    terrainSlopeEstimate: { value: 8, unit: 'degrees', confidence: 'medium', source: 'inferred' },
    fuelImpact: { value: 100, unit: 'miles', impact: 'positive', confidence: 'high' },
    waterImpact: { value: 10, unit: 'gallons', impact: 'positive', confidence: 'high' },
  }),
  { operationalRole: 'emergency' },
);
const comfortResult = score(
  emergencyCtx,
  comfortCamp,
  enrichment('comfort-but-not-emergency', {
    legalStatus: 'likely_allowed',
    legalConfidence: 'medium',
    accessDifficulty: 'moderate',
    privacyLikelihood: 'high',
    terrainSlopeEstimate: { value: 1, unit: 'degrees', confidence: 'high', source: 'inferred' },
    fuelImpact: { value: 30, unit: 'miles', impact: 'watch', confidence: 'medium' },
    waterImpact: { value: 3, unit: 'gallons', impact: 'watch', confidence: 'medium' },
  }),
);
assert.strictEqual(emergencyResult.operationalRole, 'emergency');
assert.strictEqual(emergencyResult.recommendationEligible, true);
assert.ok(emergencyResult.rankScore >= comfortResult.rankScore, 'Emergency role should let a safe endpoint beat comfort.');
assert.ok(emergencyResult.explanation.positiveFactors.some((item) => item.includes('emergency endpoint')));

const missingDataCamp = candidate('missing-data', { sourceConfidence: 'low', lastVerifiedDate: null });
const missingGate = {
  state: 'unknown',
  gateId: 'campops.data.missing',
  severity: 'watch',
  reason: 'Some hard-gate data is missing.',
  missingDataFields: ['publicAccessStatus', 'closureStatus'],
};
const missingDataScore = campops.scoreCampSuitability({
  context: safeCtx,
  candidate: missingDataCamp,
  enrichment: enrichment('missing-data', {
    publicAccessStatus: 'unknown',
    dataConfidence: 'low',
    dataLimitations: ['No recent verification.'],
  }),
  hardGates: [missingGate],
});
assert.ok(missingDataScore.scores.dataConfidence < safeScore.scores.dataConfidence);
assert.ok(missingDataScore.explanation.missingData.includes('publicAccessStatus'));
assert.ok(missingDataScore.explanation.confidenceNote.includes('missing data'));

const rejectedGate = {
  state: 'rejected',
  gateId: 'campops.legal.prohibited',
  severity: 'critical',
  reason: 'Known legal status prohibits camping here.',
  missingDataFields: [],
};
const rejectedScore = campops.scoreCampSuitability({
  context: safeCtx,
  candidate: candidate('rejected'),
  enrichment: enrichment('rejected', { legalStatus: 'prohibited' }),
  hardGates: [rejectedGate],
});
assert.strictEqual(rejectedScore.rankScore, null);
assert.strictEqual(rejectedScore.scores.overall, null);
assert.strictEqual(rejectedScore.recommendationEligible, false);

assert.strictEqual(
  campops.isCampOpsScoringFeatureEnabled(
    campops.DEFAULT_CAMP_OPS_SCORING_ROLLOUT_CONFIG,
    'campOpsSuitabilityScoringEnabled',
  ),
  false,
);

console.log('CampOps suitability scoring checks passed.');
