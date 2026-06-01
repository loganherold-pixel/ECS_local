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

const currentTimeIso = '2026-04-30T18:00:00.000Z';

function context(overrides = {}) {
  return {
    id: 'campops-offline-stale-test',
    currentTimeIso,
    riskTolerance: 'balanced',
    offlineMode: 'online',
    ...overrides,
  };
}

function candidate(id = 'camp-cache') {
  return {
    id,
    name: `Camp ${id}`,
    location: { latitude: 39.1, longitude: -119.9 },
    source: 'route_candidate',
    sourceConfidence: 'medium',
  };
}

function baseEnrichment(id = 'camp-cache', overrides = {}) {
  return {
    candidateId: id,
    legalStatus: 'unknown',
    legalConfidence: 'unknown',
    closureStatus: 'unknown',
    publicAccessStatus: 'unknown',
    accessDifficulty: 'unknown',
    vehicleFit: 'unknown',
    trailerSuitability: 'unknown',
    weatherExposure: 'unknown',
    fireRestrictionStatus: 'unknown',
    privacyLikelihood: 'unknown',
    occupancyLikelihood: 'unknown',
    lateArrivalRisk: 'unknown',
    dataConfidence: 'high',
    dataLimitations: [],
    ...overrides,
  };
}

function provider({ id, category, signal, missingDataReason }) {
  return {
    id,
    displayName: id,
    sourceCategory: category,
    sourceConfidence: 'high',
    staleAfterMinutes: 60,
    collectSignals: ({ candidates }) => candidates.map((item) => ({
      candidateId: item.id,
      providerId: id,
      providerDisplayName: id,
      sourceCategory: category,
      sourceConfidence: 'high',
      signal: signal ? { ...signal } : null,
      warnings: [],
      errors: [],
      missingDataReason: missingDataReason ?? null,
      rawProviderStatus: { status: signal ? 'cache_hit' : 'cache_miss' },
    })),
  };
}

async function collect(signal, overrides = {}) {
  return campops.collectCampOpsSourceProviderBundle({
    providers: [provider({ id: overrides.id ?? 'Legal Cache', category: overrides.category ?? 'legal', signal, missingDataReason: overrides.missingDataReason })],
    context: context(overrides.context ?? {}),
    candidates: [candidate(overrides.candidateId ?? 'camp-cache')],
  });
}

function merge(bundle, id = 'camp-cache', enrichmentOverrides = {}) {
  return campops.applyCampOpsSourceSignalsToEnrichment({
    enrichment: baseEnrichment(id, enrichmentOverrides),
    signals: bundle.signalsByCandidateId[id],
    currentTimeIso,
  });
}

function recommendationFor(enrichment, id = 'camp-cache') {
  const camp = candidate(id);
  const hardGate = campops.evaluateCampCandidateHardGates({
    context: context({ offlineMode: 'offline' }),
    candidate: camp,
    enrichment,
  });
  const score = campops.scoreCampSuitability({
    context: context({ offlineMode: 'offline' }),
    candidate: camp,
    enrichment,
    hardGateEvaluation: hardGate,
  });
  return campops.generateCampRecommendationSet({
    context: context({ offlineMode: 'offline' }),
    candidates: [camp],
    enrichmentsByCandidateId: { [id]: enrichment },
    hardGateEvaluationsByCandidateId: { [id]: hardGate },
    suitabilityScoresByCandidateId: { [id]: score },
  });
}

(async () => {
  const freshSignal = {
    source: 'offline_dataset',
    confidence: 'high',
    observedAtIso: '2026-04-30T17:50:00.000Z',
    cachedAt: '2026-04-30T17:55:00.000Z',
    sourceGeneratedAt: '2026-04-30T17:50:00.000Z',
    retrievedAt: '2026-04-30T17:55:00.000Z',
    expiresAt: '2026-04-30T20:00:00.000Z',
    offlineAvailable: true,
    legalStatus: 'allowed',
    legalConfidence: 'high',
    publicAccessStatus: 'public',
  };
  const freshBundle = await collect(freshSignal);
  assert.strictEqual(freshBundle.providerResults[0].sourceFreshness, 'fresh');
  const freshMerged = merge(freshBundle);
  assert.strictEqual(freshMerged.sourceSignals[0].freshnessStatus, 'fresh');
  assert.strictEqual(freshMerged.sourceSignals[0].cachedAt, '2026-04-30T17:55:00.000Z');
  assert.strictEqual(freshMerged.legalStatus, 'allowed');

  const staleBundle = await collect({
    ...freshSignal,
    observedAtIso: '2026-04-30T15:00:00.000Z',
    cachedAt: '2026-04-30T15:05:00.000Z',
    sourceGeneratedAt: '2026-04-30T15:00:00.000Z',
    retrievedAt: '2026-04-30T15:05:00.000Z',
    expiresAt: '2026-04-30T22:00:00.000Z',
    staleAfterMinutes: 60,
  });
  assert.strictEqual(staleBundle.providerResults[0].sourceFreshness, 'stale');
  assert.ok(staleBundle.warnings.some((warning) => warning.includes('Legal/access source data is stale')));
  const staleMerged = merge(staleBundle);
  assert.strictEqual(staleMerged.sourceSignals[0].freshnessStatus, 'stale');
  assert.ok(staleMerged.dataLimitations.some((item) => item.includes('stale')));
  assert.ok(['medium', 'low', 'unknown'].includes(staleMerged.dataConfidence));

  const expiredBundle = await collect({
    ...freshSignal,
    expiresAt: '2026-04-30T17:00:00.000Z',
  });
  assert.strictEqual(expiredBundle.providerResults[0].sourceFreshness, 'expired');
  assert.ok(expiredBundle.warnings.some((warning) => warning.includes('expired')));
  const expiredMerged = merge(expiredBundle);
  assert.strictEqual(expiredMerged.sourceSignals[0].freshnessStatus, 'expired');
  assert.ok(expiredMerged.dataLimitations.some((item) => item.includes('expired')));

  const offlineCachedBundle = await collect({
    ...freshSignal,
    observedAtIso: '2026-04-30T16:30:00.000Z',
    cachedAt: '2026-04-30T16:40:00.000Z',
    sourceGeneratedAt: '2026-04-30T16:30:00.000Z',
    retrievedAt: '2026-04-30T16:40:00.000Z',
    staleAfterMinutes: 45,
  }, { context: { offlineMode: 'offline' } });
  const offlineCachedMerged = merge(offlineCachedBundle);
  assert.strictEqual(offlineCachedMerged.legalStatus, 'allowed');
  assert.ok(offlineCachedMerged.dataLimitations.some((item) => item.includes('stale')));

  const offlineNoLegalBundle = await collect(null, {
    context: { offlineMode: 'offline' },
    missingDataReason: 'No cached legal/access data exists for this camp.',
  });
  assert.strictEqual(offlineNoLegalBundle.providerResults[0].sourceFreshness, 'missing');
  assert.ok(offlineNoLegalBundle.warnings.some((warning) => warning.includes('No cached legal/access data')));
  const offlineNoLegalMerged = merge(offlineNoLegalBundle);
  assert.strictEqual(offlineNoLegalMerged.legalStatus, 'unknown');
  assert.strictEqual(offlineNoLegalMerged.dataConfidence, 'high');

  const weatherBundle = await collect({
    source: 'offline_dataset',
    confidence: 'high',
    observedAtIso: '2026-04-30T14:00:00.000Z',
    cachedAt: '2026-04-30T14:10:00.000Z',
    sourceGeneratedAt: '2026-04-30T14:00:00.000Z',
    retrievedAt: '2026-04-30T14:10:00.000Z',
    staleAfterMinutes: 60,
    offlineAvailable: true,
    weatherExposureLevel: 'high',
    weatherExposure: 'critical',
  }, { category: 'weather', id: 'Weather Cache', context: { offlineMode: 'offline' } });
  assert.ok(weatherBundle.warnings.some((warning) => warning.includes('Weather source data is stale')));
  const weatherMerged = merge(weatherBundle);
  assert.ok(weatherMerged.dataLimitations.some((item) => item.includes('Weather source data is stale')));

  const rec = recommendationFor(staleMerged);
  assert.ok(rec.warnings.some((warning) => warning.includes('stale')));
  const prompt = campops.buildCampOpsAiAssistPrompt({
    context: context({ offlineMode: 'offline' }),
    recommendationSet: rec,
    mode: 'field',
  });
  assert.ok(prompt.includes('Do not soften stale, expired, cached, missing, or unavailable source warnings.'));
  assert.ok(prompt.includes('source is stale') || prompt.includes('source data is stale'));
  const parsed = campops.parseCampOpsAiAssistOutput({}, {
    context: context({ offlineMode: 'offline' }),
    recommendationSet: rec,
    mode: 'field',
  });
  assert.ok(parsed.output.confidenceNote.includes('stale'));

  console.log('CampOps offline/stale source checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
