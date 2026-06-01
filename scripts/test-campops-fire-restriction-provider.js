const assert = require('assert');
require('./campops-react-native-test-shim');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campopsPath = path.join(root, 'lib', 'campops', 'index.ts');

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

const campops = require(campopsPath);

const context = {
  id: 'fire-restriction-provider-test',
  currentTimeIso: '2026-04-30T18:00:00.000Z',
  riskTolerance: 'balanced',
  offlineMode: 'online',
};

function candidate(id, name = id) {
  return {
    id,
    name,
    location: { latitude: 39.1, longitude: -119.9 },
    source: 'route_candidate',
    sourceConfidence: 'medium',
    lastVerifiedDate: '2026-04-30',
  };
}

function baseEnrichment(candidateId, overrides = {}) {
  return {
    candidateId,
    legalStatus: 'allowed',
    legalConfidence: 'high',
    closureStatus: 'open',
    publicAccessStatus: 'public',
    accessDifficulty: 'easy',
    vehicleFit: 'fit',
    trailerSuitability: 'fit',
    weatherExposure: 'neutral',
    fireRestrictionStatus: 'unknown',
    privacyLikelihood: 'moderate',
    occupancyLikelihood: 'unknown',
    lateArrivalRisk: 'neutral',
    dataConfidence: 'high',
    dataLimitations: [],
    ...overrides,
  };
}

async function fireBundle(records, ids) {
  const provider = new campops.CampOpsFireRestrictionSourceProvider({
    records,
    staleAfterMinutes: 60,
  });
  return campops.collectCampOpsSourceProviderBundle({
    providers: [provider],
    context,
    candidates: ids.map((id) => candidate(id)),
  });
}

function mergeFor(candidateId, bundle) {
  return campops.applyCampOpsSourceSignalsToEnrichment({
    enrichment: baseEnrichment(candidateId),
    signals: bundle.signalsByCandidateId[candidateId],
    currentTimeIso: context.currentTimeIso,
  });
}

function evaluate(candidateId, enrichment) {
  return campops.evaluateCampCandidateHardGates({
    context,
    candidate: candidate(candidateId),
    enrichment,
  });
}

function recommendationFor(candidateId, enrichment, hardGateEvaluation) {
  const campCandidate = candidate(candidateId, `Camp ${candidateId}`);
  const score = campops.scoreCampSuitability({
    context,
    candidate: campCandidate,
    enrichment,
    hardGateEvaluation,
  });
  return campops.generateCampRecommendationSet({
    context,
    candidates: [campCandidate],
    enrichmentsByCandidateId: { [candidateId]: enrichment },
    hardGateEvaluationsByCandidateId: { [candidateId]: hardGateEvaluation },
    suitabilityScoresByCandidateId: { [candidateId]: score },
  });
}

(async () => {
  const campfireBanBundle = await fireBundle([
    {
      candidateId: 'campfire-ban',
      source: 'offline_dataset',
      campfireAllowed: 'no',
      stoveAllowed: 'yes',
      fireRestrictionLevel: 'stage_1',
      redFlagRisk: 'low',
      smokeOrAirQualityRisk: 'low',
      sourceConfidence: 'high',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      sourceSummary: 'Agency fixture prohibits campfires but allows camping and contained stoves.',
    },
  ], ['campfire-ban']);
  const campfireBanEnrichment = mergeFor('campfire-ban', campfireBanBundle);
  const campfireBanEvaluation = evaluate('campfire-ban', campfireBanEnrichment);
  assert.strictEqual(campfireBanEnrichment.campfireAllowed, 'no');
  assert.strictEqual(campfireBanEnrichment.fireRestrictionStatus, 'fire_ban');
  assert.strictEqual(campfireBanEvaluation.status, 'caution', 'Campfire prohibition should warn, not reject camping by itself.');
  assert.ok(campfireBanEvaluation.cautionGates.some((gate) => gate.gateId === 'campops.restrictions.fire_ban'));
  const campfireBanScore = campops.scoreCampSuitability({
    context,
    candidate: candidate('campfire-ban'),
    enrichment: campfireBanEnrichment,
    hardGateEvaluation: campfireBanEvaluation,
  });
  assert.ok(campfireBanScore.explanation.negativeFactors.some((item) => item.includes('Campfires are prohibited')));
  const campfireBanRecommendation = recommendationFor('campfire-ban', campfireBanEnrichment, campfireBanEvaluation);
  assert.ok(campfireBanRecommendation.warnings.some((warning) => warning.includes('campfires are prohibited')));

  const stoveBundle = await fireBundle([
    {
      candidateId: 'stove-restricted',
      source: 'offline_dataset',
      campfireAllowed: 'restricted',
      stoveAllowed: 'restricted',
      fireRestrictionLevel: 'stage_2',
      redFlagRisk: 'medium',
      smokeOrAirQualityRisk: 'low',
      sourceConfidence: 'high',
      observedAtIso: '2026-04-30T17:45:00.000Z',
    },
  ], ['stove-restricted']);
  const stoveEnrichment = mergeFor('stove-restricted', stoveBundle);
  const stoveEvaluation = evaluate('stove-restricted', stoveEnrichment);
  assert.strictEqual(stoveEnrichment.stoveAllowed, 'restricted');
  assert.strictEqual(stoveEvaluation.status, 'caution');
  assert.ok(stoveEvaluation.cautionGates.some((gate) => gate.gateId === 'campops.restrictions.stove_restricted'));

  const redFlagBundle = await fireBundle([
    {
      candidateId: 'red-flag',
      source: 'offline_dataset',
      campfireAllowed: 'unknown',
      stoveAllowed: 'yes',
      redFlagRisk: 'high',
      smokeOrAirQualityRisk: 'medium',
      sourceConfidence: 'medium',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      sourceSummary: 'NWS-style fixture indicates red flag fire weather.',
    },
  ], ['red-flag']);
  const redFlagEnrichment = mergeFor('red-flag', redFlagBundle);
  assert.strictEqual(redFlagEnrichment.redFlagRisk, 'high');
  assert.strictEqual(redFlagEnrichment.weatherExposure, 'critical');
  const redFlagRecommendation = recommendationFor('red-flag', redFlagEnrichment, evaluate('red-flag', redFlagEnrichment));
  assert.ok(redFlagRecommendation.warnings.some((warning) => warning.includes('red-flag')));

  const closureBundle = await fireBundle([
    {
      candidateId: 'fire-closure',
      source: 'offline_dataset',
      campfireAllowed: 'no',
      stoveAllowed: 'no',
      fireRestrictionLevel: 'emergency_closure',
      redFlagRisk: 'high',
      smokeOrAirQualityRisk: 'high',
      areaClosedDueToFire: true,
      closureReason: 'fire emergency area closure',
      sourceConfidence: 'high',
      observedAtIso: '2026-04-30T17:55:00.000Z',
    },
  ], ['fire-closure']);
  const closureEnrichment = mergeFor('fire-closure', closureBundle);
  const closureEvaluation = evaluate('fire-closure', closureEnrichment);
  assert.strictEqual(closureEnrichment.closureStatus, 'closed');
  assert.strictEqual(closureEvaluation.status, 'rejected');
  assert.ok(closureEvaluation.failedGates.some((gate) => gate.gateId === 'campops.access.closed'));

  const unknownBundle = await fireBundle([
    {
      candidateId: 'fire-unknown',
      source: 'offline_dataset',
      campfireAllowed: 'unknown',
      stoveAllowed: 'unknown',
      redFlagRisk: 'unknown',
      smokeOrAirQualityRisk: 'unknown',
      sourceConfidence: 'unknown',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      missingDataReason: 'No fire restriction fixture covers this camp.',
    },
  ], ['fire-unknown']);
  const unknownEnrichment = mergeFor('fire-unknown', unknownBundle);
  assert.strictEqual(unknownEnrichment.campfireAllowed, 'unknown');
  const unknownScore = campops.scoreCampSuitability({
    context,
    candidate: candidate('fire-unknown'),
    enrichment: unknownEnrichment,
    hardGateEvaluation: evaluate('fire-unknown', unknownEnrichment),
  });
  assert.ok(unknownScore.explanation.assumptions.some((item) => item.includes('Campfire status is unknown')));

  const staleBundle = await fireBundle([
    {
      candidateId: 'fire-stale',
      source: 'offline_dataset',
      campfireAllowed: 'yes',
      stoveAllowed: 'yes',
      redFlagRisk: 'low',
      smokeOrAirQualityRisk: 'low',
      sourceConfidence: 'high',
      observedAtIso: '2026-04-30T15:00:00.000Z',
      staleAfterMinutes: 30,
      sourceSummary: 'Stale fire fixture said no restrictions.',
    },
  ], ['fire-stale']);
  assert.strictEqual(staleBundle.providerResults[0].sourceFreshness, 'stale');
  const staleEnrichment = mergeFor('fire-stale', staleBundle);
  assert.strictEqual(staleEnrichment.campfireAllowed, 'unknown');
  assert.strictEqual(staleEnrichment.fireRestrictionStatus, 'unknown');
  const staleRecommendation = recommendationFor('fire-stale', staleEnrichment, evaluate('fire-stale', staleEnrichment));
  assert.ok(staleRecommendation.warnings.some((warning) => warning.includes('stale')));
  assert.notStrictEqual(staleRecommendation.confidenceSummary.level, 'high');

  const prompt = campops.buildCampOpsAiAssistPrompt({
    context,
    recommendationSet: campfireBanRecommendation,
  });
  assert.ok(prompt.includes('"campfireAllowed":"no"'));
  assert.ok(prompt.includes('If the source says campfires are prohibited'));

  console.log('CampOps fire restriction provider checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
