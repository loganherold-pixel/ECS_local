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

function context(overrides = {}) {
  return {
    id: 'service-provider-test',
    currentTimeIso: '2026-04-30T18:00:00.000Z',
    riskTolerance: 'balanced',
    offlineMode: 'online',
    convoyProfile: { peopleCount: 2, petCount: 0 },
    resourceState: {
      fuelReserveMiles: 70,
      waterGallons: 8,
      confidence: 'medium',
    },
    ...overrides,
  };
}

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
    groupCapacityEstimate: 4,
    etaIso: '2026-04-30T19:00:00.000Z',
    sunsetMarginMinutes: 90,
    fuelImpact: { value: 70, unit: 'miles', impact: 'neutral', confidence: 'medium' },
    waterImpact: { value: 8, unit: 'gallons', impact: 'neutral', confidence: 'medium' },
    reliableWaterRefillAvailable: false,
    terrainSlopeEstimate: { value: 2, unit: 'degrees', confidence: 'medium', source: 'inferred' },
    weatherExposure: 'neutral',
    weatherExposureLevel: 'low',
    fireRestrictionStatus: 'none_known',
    campfireAllowed: 'yes',
    stoveAllowed: 'yes',
    privacyLikelihood: 'moderate',
    occupancyLikelihood: 'unknown',
    lateArrivalRisk: 'neutral',
    dataConfidence: 'high',
    dataLimitations: [],
    ...overrides,
  };
}

async function serviceBundle(records, ids, ctx = context()) {
  const provider = new campops.CampOpsServiceSourceProvider({
    records,
    staleAfterMinutes: 24 * 60,
  });
  return campops.collectCampOpsSourceProviderBundle({
    providers: [provider],
    context: ctx,
    candidates: ids.map((id) => candidate(id)),
  });
}

function mergeAndDebt(candidateId, bundle, ctx, overrides = {}) {
  const merged = campops.applyCampOpsSourceSignalsToEnrichment({
    enrichment: baseEnrichment(candidateId, overrides),
    signals: bundle.signalsByCandidateId[candidateId],
    currentTimeIso: ctx.currentTimeIso,
  });
  return campops.attachCampResourceDebt({
    context: ctx,
    candidate: candidate(candidateId),
    enrichment: merged,
  });
}

function evaluate(ctx, candidateId, enrichment) {
  return campops.evaluateCampCandidateHardGates({
    context: ctx,
    candidate: candidate(candidateId),
    enrichment,
  });
}

function recommendationFor(ctx, enrichmentsByCandidateId) {
  const ids = Object.keys(enrichmentsByCandidateId);
  const candidates = ids.map((id) => candidate(id, `Camp ${id}`));
  const hardGates = {};
  const scores = {};
  for (const id of ids) {
    hardGates[id] = evaluate(ctx, id, enrichmentsByCandidateId[id]);
    scores[id] = campops.scoreCampSuitability({
      context: ctx,
      candidate: candidates.find((item) => item.id === id),
      enrichment: enrichmentsByCandidateId[id],
      hardGateEvaluation: hardGates[id],
    });
  }
  return campops.generateCampRecommendationSet({
    context: ctx,
    candidates,
    enrichmentsByCandidateId,
    hardGateEvaluationsByCandidateId: hardGates,
    suitabilityScoresByCandidateId: scores,
  });
}

function serviceRecord(candidateId, serviceType, distance, overrides = {}) {
  return {
    candidateId,
    serviceType,
    name: `${serviceType} ${candidateId}`,
    source: 'offline_dataset',
    distanceFromCampMiles: distance,
    routeAwareDistanceMiles: distance,
    confidence: 'high',
    status: 'open',
    operatingHours: { summary: 'Known open in fixture', isCurrentlyOpen: true },
    observedAtIso: '2026-04-30T17:30:00.000Z',
    sourceSummary: `${serviceType} fixture ${distance} miles from ${candidateId}.`,
    ...overrides,
  };
}

(async () => {
  const lowFuelContext = context({ resourceState: { fuelReserveMiles: 70, waterGallons: 8, confidence: 'medium' } });
  const lowFuelBundle = await serviceBundle([
    serviceRecord('fuel-close', 'fuel', 8),
    serviceRecord('fuel-close', 'town_exit', 9),
    serviceRecord('fuel-remote', 'fuel', 55),
    serviceRecord('fuel-remote', 'town_exit', 58),
  ], ['fuel-close', 'fuel-remote'], lowFuelContext);
  const fuelClose = mergeAndDebt('fuel-close', lowFuelBundle, lowFuelContext);
  const fuelRemote = mergeAndDebt('fuel-remote', lowFuelBundle, lowFuelContext);
  assert.strictEqual(fuelClose.nearestFuel.name, 'fuel fuel-close');
  assert.strictEqual(fuelClose.resourceDebt.fuel.status, 'safe');
  assert.strictEqual(fuelRemote.resourceDebt.fuel.status, 'critical');
  const fuelRecommendations = recommendationFor(lowFuelContext, { 'fuel-close': fuelClose, 'fuel-remote': fuelRemote });
  assert.strictEqual(fuelRecommendations.recommendedCamp.id, 'fuel-close');
  assert.strictEqual(fuelRecommendations.resupplyCamp.id, 'fuel-close');

  const lowWaterContext = context({
    convoyProfile: { peopleCount: 4, petCount: 0 },
    resourceState: { fuelReserveMiles: 100, waterGallons: 3, confidence: 'medium' },
  });
  const waterBundle = await serviceBundle([
    serviceRecord('water-close', 'potable_water', 4),
    serviceRecord('water-remote', 'potable_water', 42),
  ], ['water-close', 'water-remote'], lowWaterContext);
  const waterClose = mergeAndDebt('water-close', waterBundle, lowWaterContext, {
    waterImpact: { value: 3, unit: 'gallons', impact: 'caution', confidence: 'medium' },
  });
  const waterRemote = mergeAndDebt('water-remote', waterBundle, lowWaterContext, {
    waterImpact: { value: 3, unit: 'gallons', impact: 'caution', confidence: 'medium' },
  });
  assert.strictEqual(waterClose.resourceDebt.water.status, 'tight');
  assert.strictEqual(waterRemote.resourceDebt.water.status, 'critical');
  const waterRecommendations = recommendationFor(lowWaterContext, { 'water-close': waterClose, 'water-remote': waterRemote });
  assert.strictEqual(waterRecommendations.recommendedCamp.id, 'water-close');

  const repairContext = context({
    convoyProfile: { peopleCount: 2, mechanicalIssueFlag: true },
    resourceState: { fuelReserveMiles: 100, waterGallons: 8, serviceNeeded: true, confidence: 'medium' },
  });
  const repairBundle = await serviceBundle([
    serviceRecord('repair-close', 'mechanic_repair', 6),
    serviceRecord('repair-remote', 'mechanic_repair', 65),
  ], ['repair-close', 'repair-remote'], repairContext);
  const repairClose = mergeAndDebt('repair-close', repairBundle, repairContext);
  const repairRemote = mergeAndDebt('repair-remote', repairBundle, repairContext);
  assert.strictEqual(repairClose.recoveryFriendly, true);
  const repairRecommendations = recommendationFor(repairContext, { 'repair-close': repairClose, 'repair-remote': repairRemote });
  assert.strictEqual(repairRecommendations.recommendedCamp.id, 'repair-close');
  assert.ok(repairRecommendations.rolesByCandidateId['repair-close'].includes('recovery'));

  const unknownBundle = await serviceBundle([
    serviceRecord('unknown-service', 'fuel', 12, {
      status: 'unknown',
      operatingHours: null,
      confidence: 'low',
    }),
  ], ['unknown-service']);
  const unknownService = mergeAndDebt('unknown-service', unknownBundle, context());
  const unknownScore = campops.scoreCampSuitability({
    context: context(),
    candidate: candidate('unknown-service'),
    enrichment: unknownService,
    hardGateEvaluation: evaluate(context(), 'unknown-service', unknownService),
  });
  assert.strictEqual(unknownService.nearestFuel.status, 'unknown');
  assert.ok(unknownScore.scores.dataConfidence < 80);
  const unknownRecommendations = recommendationFor(context(), { 'unknown-service': unknownService });
  assert.ok(unknownRecommendations.warnings.some((warning) => warning.includes('nearest fuel status is unknown')));

  const staleBundle = await serviceBundle([
    serviceRecord('stale-service', 'fuel', 10, {
      observedAtIso: '2026-04-28T17:30:00.000Z',
      staleAfterMinutes: 60,
      sourceSummary: 'Stale fuel fixture.',
    }),
  ], ['stale-service']);
  assert.strictEqual(staleBundle.providerResults[0].sourceFreshness, 'stale');
  const staleService = mergeAndDebt('stale-service', staleBundle, context());
  assert.strictEqual(staleService.nearestFuel, undefined);
  const staleRecommendations = recommendationFor(context(), { 'stale-service': staleService });
  assert.ok(staleRecommendations.warnings.some((warning) => warning.includes('stale')));

  const prompt = campops.buildCampOpsAiAssistPrompt({
    context: context(),
    recommendationSet: fuelRecommendations,
  });
  assert.ok(prompt.includes('"nearestFuel"'));
  assert.ok(prompt.includes('Do not promise a service is open unless the CampOps payload says it is open.'));

  console.log('CampOps service provider checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
