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
  id: 'closure-provider-test',
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
    closureStatus: 'unknown',
    publicAccessStatus: 'public',
    accessDifficulty: 'easy',
    vehicleFit: 'fit',
    trailerSuitability: 'fit',
    weatherExposure: 'neutral',
    fireRestrictionStatus: 'none_known',
    privacyLikelihood: 'moderate',
    occupancyLikelihood: 'unknown',
    lateArrivalRisk: 'neutral',
    dataConfidence: 'high',
    dataLimitations: [],
    ...overrides,
  };
}

async function closureBundle(records, ids, providers = null) {
  const candidates = ids.map((id) => candidate(id));
  const closureProvider = new campops.CampOpsClosureSourceProvider({
    records,
    staleAfterMinutes: 60,
  });
  return campops.collectCampOpsSourceProviderBundle({
    providers: providers ?? [closureProvider],
    context,
    candidates,
  });
}

function mergeFor(candidateId, bundle, enrichmentOverrides = {}) {
  return campops.applyCampOpsSourceSignalsToEnrichment({
    enrichment: baseEnrichment(candidateId, enrichmentOverrides),
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
  const openBundle = await closureBundle([
    {
      candidateId: 'camp-open',
      source: 'offline_dataset',
      closureStatus: 'open',
      sourceConfidence: 'high',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      sourceSummary: 'Agency fixture reports no current closure order for this camp access.',
    },
  ], ['camp-open']);
  const openEnrichment = mergeFor('camp-open', openBundle);
  assert.strictEqual(openEnrichment.closureStatus, 'open');
  assert.strictEqual(evaluate('camp-open', openEnrichment).status, 'allowed');
  assert.ok(!JSON.stringify(openBundle).includes('guaranteed open'), 'Closure provider output must avoid overconfident open wording.');

  const closedBundle = await closureBundle([
    {
      candidateId: 'camp-closed',
      source: 'offline_dataset',
      closureStatus: 'closed',
      closureReason: 'active agency closure order',
      appliesToCamping: true,
      appliesToVehicleAccess: true,
      sourceConfidence: 'high',
      observedAtIso: '2026-04-30T17:50:00.000Z',
      sourceSummary: 'Agency fixture indicates an active closure order.',
    },
  ], ['camp-closed']);
  const closedEnrichment = mergeFor('camp-closed', closedBundle);
  const closedEvaluation = evaluate('camp-closed', closedEnrichment);
  assert.strictEqual(closedEnrichment.closureStatus, 'closed');
  assert.strictEqual(closedEvaluation.status, 'rejected');
  assert.ok(closedEvaluation.failedGates.some((gate) => gate.gateId === 'campops.access.closed'));

  const seasonalBundle = await closureBundle([
    {
      candidateId: 'camp-seasonal',
      source: 'offline_dataset',
      closureStatus: 'seasonal',
      closureReason: 'seasonal road closure',
      restrictionWindow: {
        startIso: '2026-04-01T00:00:00.000Z',
        endIso: '2026-05-31T23:59:59.000Z',
        label: 'spring thaw closure',
      },
      appliesToVehicleAccess: true,
      sourceConfidence: 'high',
      observedAtIso: '2026-04-30T17:50:00.000Z',
    },
  ], ['camp-seasonal']);
  const seasonalEvaluation = evaluate('camp-seasonal', mergeFor('camp-seasonal', seasonalBundle));
  assert.strictEqual(seasonalEvaluation.status, 'rejected');
  assert.ok(seasonalEvaluation.failedGates.some((gate) => gate.gateId === 'campops.access.seasonal_closure'));

  const futureWindowBundle = await closureBundle([
    {
      candidateId: 'camp-window',
      source: 'offline_dataset',
      closureStatus: 'restricted',
      closureReason: 'scheduled maintenance closure',
      restrictionWindow: {
        startIso: '2026-05-15T00:00:00.000Z',
        endIso: '2026-05-20T23:59:59.000Z',
        label: 'future maintenance window',
      },
      appliesToVehicleAccess: true,
      sourceConfidence: 'high',
      observedAtIso: '2026-04-30T17:50:00.000Z',
    },
  ], ['camp-window']);
  const futureWindowEnrichment = mergeFor('camp-window', futureWindowBundle);
  assert.strictEqual(futureWindowEnrichment.closureStatus, 'open');
  assert.ok(futureWindowEnrichment.dataLimitations.some((item) => item.includes('not active')));
  assert.strictEqual(evaluate('camp-window', futureWindowEnrichment).status, 'allowed');

  const unknownBundle = await closureBundle([
    {
      candidateId: 'camp-unknown',
      source: 'offline_dataset',
      closureStatus: 'unknown',
      sourceConfidence: 'unknown',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      missingDataReason: 'No agency closure fixture covers this camp access.',
    },
  ], ['camp-unknown']);
  const unknownEvaluation = evaluate('camp-unknown', mergeFor('camp-unknown', unknownBundle, { dataConfidence: 'medium' }));
  assert.strictEqual(unknownEvaluation.status, 'unknown');
  assert.ok(unknownEvaluation.unknownGates.some((gate) => gate.missingDataFields.includes('closureStatus')));

  const staleBundle = await closureBundle([
    {
      candidateId: 'camp-stale',
      source: 'offline_dataset',
      closureStatus: 'open',
      sourceConfidence: 'high',
      observedAtIso: '2026-04-30T15:00:00.000Z',
      staleAfterMinutes: 30,
      sourceSummary: 'Stale agency closure fixture said no current closure.',
    },
  ], ['camp-stale']);
  assert.strictEqual(staleBundle.providerResults[0].sourceFreshness, 'stale');
  const staleEnrichment = mergeFor('camp-stale', staleBundle);
  assert.strictEqual(staleEnrichment.closureStatus, 'unknown');
  const staleEvaluation = evaluate('camp-stale', staleEnrichment);
  const staleRecommendation = recommendationFor('camp-stale', staleEnrichment, staleEvaluation);
  assert.ok(staleRecommendation.warnings.some((warning) => warning.includes('stale')));
  assert.notStrictEqual(staleRecommendation.confidenceSummary.level, 'high');

  const legalOpenProvider = new campops.CampOpsLegalAccessSourceProvider({
    records: [
      {
        candidateId: 'camp-conflict',
        source: 'offline_dataset',
        campingAllowed: 'yes',
        accessAllowed: 'yes',
        landStatus: 'public',
        legalConfidence: 'high',
        observedAtIso: '2026-04-30T17:45:00.000Z',
      },
    ],
  });
  const closureClosedProvider = new campops.CampOpsClosureSourceProvider({
    records: [
      {
        candidateId: 'camp-conflict',
        source: 'offline_dataset',
        closureStatus: 'closed',
        closureReason: 'active temporary closure',
        appliesToVehicleAccess: true,
        sourceConfidence: 'high',
        observedAtIso: '2026-04-30T17:55:00.000Z',
      },
    ],
  });
  const conflictBundle = await closureBundle([], ['camp-conflict'], [legalOpenProvider, closureClosedProvider]);
  assert.ok(conflictBundle.warnings.some((warning) => warning.includes('Conflicting closureStatus')));
  const conflictEnrichment = mergeFor('camp-conflict', conflictBundle, { legalStatus: 'unknown', legalConfidence: 'unknown' });
  assert.strictEqual(conflictEnrichment.legalStatus, 'allowed');
  assert.strictEqual(conflictEnrichment.closureStatus, 'closed');
  assert.strictEqual(evaluate('camp-conflict', conflictEnrichment).status, 'rejected');

  const prompt = campops.buildCampOpsAiAssistPrompt({
    context,
    recommendationSet: recommendationFor('camp-stale', staleEnrichment, staleEvaluation),
  });
  assert.ok(prompt.includes('Closure source'), 'AI prompt should receive normalized closure source summaries.');

  console.log('CampOps closure provider checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
