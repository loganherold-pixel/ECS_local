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
  id: 'weather-provider-test',
  currentTimeIso: '2026-04-30T18:00:00.000Z',
  riskTolerance: 'balanced',
  offlineMode: 'online',
  resourceState: {
    waterGallons: 8,
  },
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
    terrainSlopeEstimate: { value: 2, unit: 'degrees' },
    weatherExposure: 'neutral',
    fireRestrictionStatus: 'none_known',
    campfireAllowed: 'yes',
    stoveAllowed: 'yes',
    privacyLikelihood: 'moderate',
    occupancyLikelihood: 'unknown',
    lateArrivalRisk: 'neutral',
    reliableWaterRefillAvailable: true,
    waterImpact: { value: 4, unit: 'gallons', impact: 'safe', confidence: 'medium' },
    dataConfidence: 'high',
    dataLimitations: [],
    ...overrides,
  };
}

async function weatherBundle(records, ids) {
  const provider = new campops.CampOpsWeatherSourceProvider({
    records,
    staleAfterMinutes: 60,
  });
  return campops.collectCampOpsSourceProviderBundle({
    providers: [provider],
    context,
    candidates: ids.map((id) => candidate(id)),
  });
}

function mergeFor(candidateId, bundle, overrides = {}) {
  return campops.applyCampOpsSourceSignalsToEnrichment({
    enrichment: baseEnrichment(candidateId, overrides),
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

function score(candidateId, enrichment) {
  return campops.scoreCampSuitability({
    context,
    candidate: candidate(candidateId),
    enrichment,
    hardGateEvaluation: evaluate(candidateId, enrichment),
  });
}

function recommendationFor(enrichmentsByCandidateId) {
  const ids = Object.keys(enrichmentsByCandidateId);
  const candidates = ids.map((id) => candidate(id, id === 'ridge' ? 'Exposed Ridge Camp' : `Camp ${id}`));
  const hardGates = {};
  const scores = {};
  for (const id of ids) {
    hardGates[id] = evaluate(id, enrichmentsByCandidateId[id]);
    scores[id] = campops.scoreCampSuitability({
      context,
      candidate: candidates.find((item) => item.id === id),
      enrichment: enrichmentsByCandidateId[id],
      hardGateEvaluation: hardGates[id],
    });
  }
  return campops.generateCampRecommendationSet({
    context,
    candidates,
    enrichmentsByCandidateId,
    hardGateEvaluationsByCandidateId: hardGates,
    suitabilityScoresByCandidateId: scores,
  });
}

(async () => {
  const highWindBundle = await weatherBundle([
    {
      candidateId: 'ridge',
      source: 'offline_dataset',
      forecastTimeWindow: {
        startIso: '2026-04-30T19:00:00.000Z',
        endIso: '2026-05-01T03:00:00.000Z',
        label: 'arrival and overnight window',
      },
      windSpeedMph: 38,
      windGustMph: 48,
      windDirection: 'W',
      precipitationRisk: 'low',
      stormRisk: 'low',
      temperatureLowF: 44,
      temperatureHighF: 70,
      smokeOrAirQualityRisk: 'low',
      sourceConfidence: 'high',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      sourceSummary: 'Fixture indicates high wind exposure on the ridge.',
    },
    {
      candidateId: 'shelter',
      source: 'offline_dataset',
      forecastTimeWindow: { label: 'arrival and overnight window' },
      windSpeedMph: 8,
      windGustMph: 12,
      precipitationRisk: 'low',
      stormRisk: 'low',
      temperatureLowF: 49,
      temperatureHighF: 72,
      smokeOrAirQualityRisk: 'low',
      sourceConfidence: 'high',
      observedAtIso: '2026-04-30T17:45:00.000Z',
      sourceSummary: 'Fixture indicates sheltered weather exposure.',
    },
  ], ['ridge', 'shelter']);

  const ridge = mergeFor('ridge', highWindBundle);
  const shelter = mergeFor('shelter', highWindBundle);
  assert.strictEqual(ridge.weatherExposureLevel, 'high');
  assert.strictEqual(ridge.weatherExposure, 'critical');
  assert.strictEqual(ridge.windGustMph, 48);
  assert.strictEqual(ridge.lateArrivalRisk, 'critical');
  assert.strictEqual(shelter.weatherExposureLevel, 'low');
  assert.ok(score('ridge', ridge).scores.weather < score('shelter', shelter).scores.weather);
  const windRecommendations = recommendationFor({ ridge, shelter });
  assert.strictEqual(windRecommendations.weatherFallbackCamp.id, 'shelter');
  assert.ok(windRecommendations.warnings.some((warning) => warning.includes('high weather exposure')));

  const stormBundle = await weatherBundle([
    {
      candidateId: 'storm',
      source: 'offline_dataset',
      windSpeedMph: 18,
      windGustMph: 28,
      precipitationRisk: 'high',
      stormRisk: 'high',
      temperatureLowF: 50,
      temperatureHighF: 66,
      sourceConfidence: 'high',
      observedAtIso: '2026-04-30T17:45:00.000Z',
    },
  ], ['storm']);
  const storm = mergeFor('storm', stormBundle);
  assert.strictEqual(storm.stormRisk, 'high');
  assert.strictEqual(storm.weatherExposureLevel, 'high');
  const stormRecommendations = recommendationFor({ storm });
  assert.ok(stormRecommendations.warnings.some((warning) => warning.includes('high storm risk')));

  const heatBundle = await weatherBundle([
    {
      candidateId: 'heat',
      source: 'offline_dataset',
      windSpeedMph: 5,
      windGustMph: 8,
      precipitationRisk: 'low',
      stormRisk: 'low',
      temperatureLowF: 76,
      temperatureHighF: 108,
      sourceConfidence: 'medium',
      observedAtIso: '2026-04-30T17:45:00.000Z',
    },
  ], ['heat']);
  const heat = mergeFor('heat', heatBundle);
  assert.strictEqual(heat.heatRisk, 'high');
  assert.strictEqual(heat.waterImpact.impact, 'caution');
  const heatRecommendations = recommendationFor({ heat });
  assert.ok(heatRecommendations.warnings.some((warning) => warning.includes('water margin')));

  const coldBundle = await weatherBundle([
    {
      candidateId: 'cold',
      source: 'offline_dataset',
      windSpeedMph: 4,
      windGustMph: 7,
      precipitationRisk: 'low',
      stormRisk: 'low',
      temperatureLowF: 12,
      temperatureHighF: 41,
      sourceConfidence: 'medium',
      observedAtIso: '2026-04-30T17:45:00.000Z',
    },
  ], ['cold']);
  const cold = mergeFor('cold', coldBundle);
  assert.strictEqual(cold.coldRisk, 'high');
  const coldRecommendations = recommendationFor({ cold });
  assert.ok(coldRecommendations.warnings.some((warning) => warning.includes('cold risk')));

  const staleBundle = await weatherBundle([
    {
      candidateId: 'stale',
      source: 'offline_dataset',
      windSpeedMph: 4,
      windGustMph: 7,
      precipitationRisk: 'low',
      stormRisk: 'low',
      temperatureLowF: 55,
      temperatureHighF: 73,
      sourceConfidence: 'high',
      observedAtIso: '2026-04-30T15:00:00.000Z',
      staleAfterMinutes: 30,
      sourceSummary: 'Stale weather fixture said calm conditions.',
    },
  ], ['stale']);
  assert.strictEqual(staleBundle.providerResults[0].sourceFreshness, 'stale');
  const stale = mergeFor('stale', staleBundle);
  assert.strictEqual(stale.weatherExposureLevel, 'unknown');
  assert.strictEqual(stale.windSpeedMph, undefined);
  const staleRecommendations = recommendationFor({ stale });
  assert.ok(staleRecommendations.warnings.some((warning) => warning.includes('stale')));
  assert.notStrictEqual(staleRecommendations.confidenceSummary.level, 'high');

  const missingBundle = await weatherBundle([], ['missing']);
  assert.strictEqual(missingBundle.providerResults[0].sourceFreshness, 'missing');
  assert.ok(missingBundle.warnings.some((warning) => warning.includes('No weather record matched')));
  const missing = mergeFor('missing', missingBundle);
  assert.strictEqual(missing.weatherExposureLevel, undefined);
  const missingRecommendations = recommendationFor({ missing });
  assert.ok(missingRecommendations.warnings.some((warning) => warning.includes('weather exposure unknown')));

  const prompt = campops.buildCampOpsAiAssistPrompt({
    context,
    recommendationSet: windRecommendations,
  });
  assert.ok(prompt.includes('weatherExposureLevel: high'));
  assert.ok(prompt.includes('Fixture indicates high wind exposure on the ridge.'));
  assert.ok(prompt.includes('Do not treat stale weather as current weather.'));

  console.log('CampOps weather provider checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
