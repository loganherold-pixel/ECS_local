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
    id: 'ctx-recommend',
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

function buildSet(ctx, candidateList, enrichments, options = {}) {
  const hardGateEvaluationsByCandidateId = {};
  const suitabilityScoresByCandidateId = {};
  for (const camp of candidateList) {
    const enriched = enrichments[camp.id];
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

const plannedCtx = context({ plannedCampId: 'planned-camp' });
const plannedCamp = candidate('planned-camp', { location: { latitude: 39.1, longitude: -119.9 } });
const slightlyBetterCamp = candidate('slightly-better', { location: { latitude: 39.2, longitude: -119.85 } });
const plannedSet = buildSet(plannedCtx, [plannedCamp, slightlyBetterCamp], {
  'planned-camp': enrichment('planned-camp'),
  'slightly-better': enrichment('slightly-better', {
    privacyLikelihood: 'high',
    fuelImpact: { value: 95, unit: 'miles', impact: 'positive', confidence: 'high' },
  }),
});
assert.strictEqual(plannedSet.recommendedCamp.id, 'planned-camp');
assert.ok(plannedSet.explanations.whyRecommended.includes('planned-camp'));
assert.ok(plannedSet.rolesByCandidateId['planned-camp'].includes('primary'));

const delayCtx = context({ plannedCampId: 'scenic-planned', delayEstimateMinutes: 120 });
const scenicPlanned = candidate('scenic-planned', { location: { latitude: 39.1, longitude: -119.9 } });
const saferBackup = candidate('safer-backup', { location: { latitude: 39.35, longitude: -119.65 } });
const delaySet = buildSet(delayCtx, [scenicPlanned, saferBackup], {
  'scenic-planned': enrichment('scenic-planned', {
    etaIso: '2026-04-30T20:30:00.000Z',
    sunsetMarginMinutes: -20,
    lateArrivalRisk: 'caution',
    privacyLikelihood: 'high',
    terrainSlopeEstimate: { value: 1, unit: 'degrees', confidence: 'high', source: 'inferred' },
  }),
  'safer-backup': enrichment('safer-backup', {
    etaIso: '2026-04-30T18:20:00.000Z',
    sunsetMarginMinutes: 70,
    lateArrivalRisk: 'neutral',
    privacyLikelihood: 'moderate',
  }),
});
assert.strictEqual(delaySet.recommendedCamp.id, 'safer-backup');
assert.strictEqual(delaySet.backupCamp.id, 'scenic-planned');
assert.ok(delaySet.explanations.plannedCampDowngrade.includes('scenic-planned'));

const trailerCtx = context({
  vehicleProfile: { trailerAttached: true },
  convoyProfile: { peopleCount: 3, trailerCount: 1 },
});
const narrowCamp = candidate('narrow-dead-end');
const trailerSafeCamp = candidate('trailer-safe');
const trailerSet = buildSet(trailerCtx, [narrowCamp, trailerSafeCamp], {
  'narrow-dead-end': enrichment('narrow-dead-end', {
    trailerSuitability: 'limited',
    turnaroundSuitability: 'unknown',
    trailerTurnaroundConfidence: 'unknown',
    deadEndRisk: 'high',
    groupCapacityConfidence: 'high',
    accessDifficulty: 'technical',
    privacyLikelihood: 'high',
  }),
  'trailer-safe': enrichment('trailer-safe', {
    trailerSuitability: 'fit',
    turnaroundSuitability: 'fit',
    trailerTurnaroundConfidence: 'high',
    deadEndRisk: 'low',
    backingRequired: false,
    roadWidthConfidence: 'high',
    groupCapacityConfidence: 'high',
    accessDifficulty: 'easy',
    privacyLikelihood: 'moderate',
  }),
});
assert.strictEqual(trailerSet.trailerSafeCamp.id, 'trailer-safe');
assert.strictEqual(trailerSet.recommendedCamp.id, 'trailer-safe');
assert.ok(trailerSet.rolesByCandidateId['trailer-safe'].includes('trailer_safe'));
assert.ok(trailerSet.warnings.some((warning) => warning.includes('dead-end risk') || warning.includes('turnaround confidence')));

const groupCtx = context({ convoyProfile: { vehicleCount: 4, peopleCount: 8 } });
const smallSite = candidate('one-vehicle-site');
const groupSite = candidate('group-capable-site');
const groupSet = buildSet(groupCtx, [smallSite, groupSite], {
  'one-vehicle-site': enrichment('one-vehicle-site', {
    groupCapacityEstimate: 1,
    groupCapacityConfidence: 'high',
    privacyLikelihood: 'high',
  }),
  'group-capable-site': enrichment('group-capable-site', {
    groupCapacityEstimate: 9,
    groupCapacityConfidence: 'medium',
    privacyLikelihood: 'moderate',
  }),
});
assert.strictEqual(groupSet.recommendedCamp.id, 'group-capable-site');
assert.ok(groupSet.rejectedCandidates.some((item) => item.candidate.id === 'one-vehicle-site'));
assert.ok(groupSet.warnings.some((warning) => warning.includes('group capacity confidence')));

const fuelCtx = context({ resourceState: { fuelRangeMiles: 70, waterGallons: 6 } });
const remoteCamp = candidate('remote-camp');
const resupplyCamp = candidate('resupply-camp');
const fuelSet = buildSet(fuelCtx, [remoteCamp, resupplyCamp], {
  'remote-camp': enrichment('remote-camp', {
    fuelImpact: { value: 30, unit: 'miles', impact: 'watch', confidence: 'medium' },
    waterImpact: { value: 4, unit: 'gallons', impact: 'watch', confidence: 'medium' },
    privacyLikelihood: 'high',
  }),
  'resupply-camp': enrichment('resupply-camp', {
    fuelImpact: { value: 95, unit: 'miles', impact: 'positive', confidence: 'high' },
    waterImpact: { value: 12, unit: 'gallons', impact: 'positive', confidence: 'high' },
    reliableWaterRefillAvailable: true,
    privacyLikelihood: 'moderate',
  }),
});
assert.strictEqual(fuelSet.resupplyCamp.id, 'resupply-camp');
assert.strictEqual(fuelSet.recommendedCamp.id, 'resupply-camp');
assert.ok(fuelSet.explanations.whyResupply.includes('resource margin'));

const windCtx = context();
const exposedRidge = candidate('exposed-ridge');
const shelteredDraw = candidate('sheltered-draw');
const windSet = buildSet(windCtx, [exposedRidge, shelteredDraw], {
  'exposed-ridge': enrichment('exposed-ridge', {
    weatherExposure: 'critical',
    privacyLikelihood: 'high',
    terrainSlopeEstimate: { value: 1, unit: 'degrees', confidence: 'high', source: 'inferred' },
  }),
  'sheltered-draw': enrichment('sheltered-draw', {
    weatherExposure: 'neutral',
    privacyLikelihood: 'moderate',
  }),
});
assert.strictEqual(windSet.recommendedCamp.id, 'sheltered-draw');
assert.strictEqual(windSet.weatherFallbackCamp.id, 'sheltered-draw');
assert.notStrictEqual(windSet.recommendedCamp.id, 'exposed-ridge');

const noGoodCtx = context();
const illegalCamp = candidate('illegal-camp');
const closedCamp = candidate('closed-camp');
const noGoodSet = buildSet(noGoodCtx, [illegalCamp, closedCamp], {
  'illegal-camp': enrichment('illegal-camp', { legalStatus: 'prohibited' }),
  'closed-camp': enrichment('closed-camp', { closureStatus: 'closed' }),
});
assert.strictEqual(noGoodSet.recommendedCamp, null);
assert.strictEqual(noGoodSet.backupCamp, null);
assert.strictEqual(noGoodSet.rejectedCandidates.length, 2);
assert.ok(noGoodSet.warnings.some((warning) => warning.includes('No camp candidate')));
assert.ok(noGoodSet.confidenceSummary.reasons[0].includes('No recommended camp'));

const emergencyAccessCtx = context({ riskTolerance: 'emergency_only' });
const roughComfortCamp = candidate('rough-comfort');
const plainAccessCamp = candidate('plain-access');
const emergencyAccessSet = buildSet(emergencyAccessCtx, [roughComfortCamp, plainAccessCamp], {
  'rough-comfort': enrichment('rough-comfort', {
    accessDifficulty: 'technical',
    vehicleFit: 'limited',
    privacyLikelihood: 'high',
    terrainSlopeEstimate: { value: 1, unit: 'degrees', confidence: 'high', source: 'inferred' },
  }),
  'plain-access': enrichment('plain-access', {
    accessDifficulty: 'easy',
    vehicleFit: 'fit',
    privacyLikelihood: 'low',
    terrainSlopeEstimate: { value: 8, unit: 'degrees', confidence: 'medium', source: 'inferred' },
  }),
});
assert.strictEqual(emergencyAccessSet.emergencyCamp.id, 'plain-access');
assert.ok(emergencyAccessSet.explanations.whyEmergency.includes('prioritizes'));

assert.strictEqual(
  campops.isCampOpsRecommendationFeatureEnabled(
    campops.DEFAULT_CAMP_OPS_RECOMMENDATION_ROLLOUT_CONFIG,
    'campOpsRecommendationSetEnabled',
  ),
  false,
);

console.log('CampOps recommendation checks passed.');
