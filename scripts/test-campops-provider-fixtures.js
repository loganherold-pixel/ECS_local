const assert = require('assert');
require('./campops-react-native-test-shim');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campopsPath = path.join(root, 'lib', 'campops', 'index.ts');
const fixtures = require(path.join(root, 'fixtures', 'campops', 'providerFixtures.js'));

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

const CONFIDENCE_ORDER = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function providerList(providerRecords = {}, options = {}) {
  const providers = [];
  if (providerRecords.legalAccess?.length) {
    providers.push(new campops.CampOpsLegalAccessSourceProvider({
      id: options.legalProviderId ?? 'fixture-legal-access',
      displayName: 'Fixture Legal Access',
      records: providerRecords.legalAccess,
      staleAfterMinutes: 60,
    }));
  }
  if (providerRecords.closure?.length) {
    providers.push(new campops.CampOpsClosureSourceProvider({
      id: options.closureProviderId ?? 'fixture-closure',
      displayName: 'Fixture Closure',
      records: providerRecords.closure,
      staleAfterMinutes: 60,
    }));
  }
  if (providerRecords.fire?.length) {
    providers.push(new campops.CampOpsFireRestrictionSourceProvider({
      id: options.fireProviderId ?? 'fixture-fire',
      displayName: 'Fixture Fire',
      records: providerRecords.fire,
      staleAfterMinutes: 60,
    }));
  }
  if (providerRecords.weather?.length) {
    providers.push(new campops.CampOpsWeatherSourceProvider({
      id: options.weatherProviderId ?? 'fixture-weather',
      displayName: 'Fixture Weather',
      records: providerRecords.weather,
      staleAfterMinutes: 60,
    }));
  }
  if (providerRecords.service?.length) {
    providers.push(new campops.CampOpsServiceSourceProvider({
      id: options.serviceProviderId ?? 'fixture-service',
      displayName: 'Fixture Service',
      records: providerRecords.service,
      staleAfterMinutes: 24 * 60,
    }));
  }
  return providers;
}

async function collectAndBuild({
  context,
  candidates,
  providerRecords = {},
  enrichmentOverrides = {},
  providers = null,
}) {
  const bundle = await campops.collectCampOpsSourceProviderBundle({
    providers: providers ?? providerList(providerRecords),
    context,
    candidates,
  });
  const enrichmentsByCandidateId = {};
  const hardGateEvaluationsByCandidateId = {};
  const suitabilityScoresByCandidateId = {};

  for (const candidate of candidates) {
    const merged = campops.applyCampOpsSourceSignalsToEnrichment({
      enrichment: fixtures.baseEnrichment(candidate.id, enrichmentOverrides[candidate.id] ?? {}),
      signals: bundle.signalsByCandidateId[candidate.id],
      currentTimeIso: context.currentTimeIso,
    });
    const enriched = campops.attachCampResourceDebt({
      context,
      candidate,
      enrichment: merged,
    });
    enrichmentsByCandidateId[candidate.id] = enriched;
    hardGateEvaluationsByCandidateId[candidate.id] = campops.evaluateCampCandidateHardGates({
      context,
      candidate,
      enrichment: enriched,
    });
    suitabilityScoresByCandidateId[candidate.id] = campops.scoreCampSuitability({
      context,
      candidate,
      enrichment: enriched,
      hardGateEvaluation: hardGateEvaluationsByCandidateId[candidate.id],
    });
  }

  const recommendationSet = campops.generateCampRecommendationSet({
    context,
    candidates,
    enrichmentsByCandidateId,
    hardGateEvaluationsByCandidateId,
    suitabilityScoresByCandidateId,
  });

  return {
    bundle,
    enrichmentsByCandidateId,
    hardGateEvaluationsByCandidateId,
    suitabilityScoresByCandidateId,
    recommendationSet,
  };
}

function assertScenarioResult(scenario, result) {
  const expected = scenario.expected ?? {};
  const { recommendationSet, hardGateEvaluationsByCandidateId, suitabilityScoresByCandidateId, bundle } = result;
  const rejectedIds = recommendationSet.rejectedCandidates.map((item) => item.candidate.id);
  const warningText = [...recommendationSet.warnings, ...bundle.warnings].join(' | ');

  for (const candidateId of expected.allowedCandidateIds ?? []) {
    assert.notStrictEqual(
      hardGateEvaluationsByCandidateId[candidateId]?.status,
      'rejected',
      `${scenario.id}: ${candidateId} should not be rejected`,
    );
  }
  if (expected.recommendedCampId !== undefined) {
    assert.strictEqual(
      recommendationSet.recommendedCamp?.id ?? null,
      expected.recommendedCampId,
      `${scenario.id}: recommended camp mismatch`,
    );
  }
  if (expected.weatherFallbackCampId !== undefined) {
    assert.strictEqual(
      recommendationSet.weatherFallbackCamp?.id ?? null,
      expected.weatherFallbackCampId,
      `${scenario.id}: weather fallback mismatch`,
    );
  }
  if (expected.trailerSafeCampId !== undefined) {
    assert.strictEqual(
      recommendationSet.trailerSafeCamp?.id ?? null,
      expected.trailerSafeCampId,
      `${scenario.id}: trailer-safe camp mismatch`,
    );
  }
  if (expected.resupplyCampId !== undefined) {
    assert.strictEqual(
      recommendationSet.resupplyCamp?.id ?? null,
      expected.resupplyCampId,
      `${scenario.id}: resupply camp mismatch`,
    );
  }
  for (const candidateId of expected.rejectedCandidateIds ?? []) {
    assert.ok(rejectedIds.includes(candidateId), `${scenario.id}: expected ${candidateId} to be rejected`);
  }
  for (const candidateId of expected.notConfidentCandidateIds ?? []) {
    const score = suitabilityScoresByCandidateId[candidateId];
    assert.ok(
      score?.hardGateStatus === 'unknown' || (score?.scores.legal ?? 100) < 70,
      `${scenario.id}: ${candidateId} should not be treated as confidently legal`,
    );
  }
  if (expected.warningIncludes) {
    assert.ok(warningText.includes(expected.warningIncludes), `${scenario.id}: expected warning ${expected.warningIncludes}`);
  }
  if (expected.confidenceAtMost) {
    assert.ok(
      CONFIDENCE_ORDER[recommendationSet.confidenceSummary.level] <= CONFIDENCE_ORDER[expected.confidenceAtMost],
      `${scenario.id}: confidence ${recommendationSet.confidenceSummary.level} should be at most ${expected.confidenceAtMost}`,
    );
  }
}

(async () => {
  assert.ok(fixtures.legalAccessSources.length >= 4, 'Legal/access fixture set should be present.');
  assert.ok(fixtures.closureSources.length >= 4, 'Closure fixture set should be present.');
  assert.ok(fixtures.fireRestrictionSources.length >= 2, 'Fire fixture set should be present.');
  assert.ok(fixtures.weatherSources.length >= 3, 'Weather fixture set should be present.');
  assert.ok(fixtures.serviceResupplySources.length >= 4, 'Service fixture set should be present.');

  const legalResult = await collectAndBuild({
    context: fixtures.context(),
    candidates: [
      fixtures.candidates.publicLegal,
      fixtures.candidates.privateLand,
      fixtures.candidates.unknownLegal,
    ],
    providerRecords: { legalAccess: fixtures.legalAccessSources },
    enrichmentOverrides: {
      'provider-unknown-legal': {
        legalStatus: 'unknown',
        legalConfidence: 'unknown',
        publicAccessStatus: 'unknown',
      },
    },
  });
  assert.strictEqual(legalResult.enrichmentsByCandidateId['provider-public-legal'].legalStatus, 'allowed');
  assert.strictEqual(legalResult.hardGateEvaluationsByCandidateId['provider-private-land'].status, 'rejected');
  assert.strictEqual(legalResult.hardGateEvaluationsByCandidateId['provider-unknown-legal'].status, 'unknown');

  const closureResult = await collectAndBuild({
    context: fixtures.context(),
    candidates: [fixtures.candidates.openCamp, fixtures.candidates.closedCamp],
    providerRecords: { closure: fixtures.closureSources },
  });
  assert.strictEqual(closureResult.enrichmentsByCandidateId['provider-open-camp'].closureStatus, 'open');
  assert.strictEqual(closureResult.hardGateEvaluationsByCandidateId['provider-closed-camp'].status, 'rejected');

  const fireResult = await collectAndBuild({
    context: fixtures.context(),
    candidates: [fixtures.candidates.fireBan, fixtures.candidates.fireClosure],
    providerRecords: { fire: fixtures.fireRestrictionSources },
  });
  assert.strictEqual(fireResult.hardGateEvaluationsByCandidateId['provider-fire-ban'].status, 'caution');
  assert.strictEqual(fireResult.hardGateEvaluationsByCandidateId['provider-fire-closure'].status, 'rejected');

  const weatherResult = await collectAndBuild({
    context: fixtures.context(),
    candidates: [fixtures.candidates.ridge, fixtures.candidates.shelter],
    providerRecords: { weather: fixtures.weatherSources },
  });
  assert.strictEqual(weatherResult.enrichmentsByCandidateId['provider-ridge'].weatherExposureLevel, 'high');
  assert.strictEqual(weatherResult.recommendationSet.weatherFallbackCamp.id, 'provider-shelter');

  const serviceResult = await collectAndBuild({
    context: fixtures.context({ resourceState: { fuelReserveMiles: 70, waterGallons: 8, confidence: 'medium' } }),
    candidates: [fixtures.candidates.fuelClose, fixtures.candidates.fuelRemote],
    providerRecords: { service: fixtures.serviceResupplySources },
  });
  assert.strictEqual(serviceResult.enrichmentsByCandidateId['provider-fuel-close'].nearestFuel.name, 'Fixture Fuel Close');
  assert.strictEqual(serviceResult.recommendationSet.resupplyCamp.id, 'provider-fuel-close');

  const officialClosed = fixtures.mixedSourceConflictCases.officialClosedVsUserOpen;
  const officialConflictResult = await collectAndBuild({
    context: fixtures.context(),
    candidates: [fixtures.candidates.closedCamp],
    providers: [
      new campops.CampOpsClosureSourceProvider({
        id: 'fixture-official-closure',
        displayName: 'Fixture Official Closure',
        records: [officialClosed.officialClosureRecord],
      }),
      new campops.CampOpsClosureSourceProvider({
        id: 'fixture-user-open',
        displayName: 'Fixture User Open',
        sourceConfidence: 'medium',
        records: [officialClosed.userOpenClosureRecord],
      }),
    ],
  });
  assert.strictEqual(
    officialConflictResult.enrichmentsByCandidateId[officialClosed.candidateId].closureStatus,
    officialClosed.expected.closureStatus,
  );
  assert.ok(
    officialConflictResult.enrichmentsByCandidateId[officialClosed.candidateId].sourceResolutions.some(
      (resolution) => resolution.field === 'closureStatus' && resolution.conflictDetected,
    ),
  );

  const staleResult = await collectAndBuild({
    context: fixtures.staleOfflineCases.staleClosureAndWeather.context,
    candidates: [fixtures.candidates.staleCamp],
    providerRecords: {
      closure: fixtures.staleOfflineCases.staleClosureAndWeather.closureRecords,
      weather: fixtures.staleOfflineCases.staleClosureAndWeather.weatherRecords,
    },
    enrichmentOverrides: {
      'provider-stale-camp': {
        closureStatus: 'unknown',
        weatherExposure: 'unknown',
        weatherExposureLevel: 'unknown',
        dataConfidence: 'medium',
      },
    },
  });
  assert.strictEqual(
    staleResult.enrichmentsByCandidateId['provider-stale-camp'].closureStatus,
    fixtures.staleOfflineCases.staleClosureAndWeather.expected.closureStatus,
  );
  assert.ok(staleResult.recommendationSet.warnings.some((warning) => warning.includes('stale')));

  for (const scenario of fixtures.providerRegressionScenarios) {
    const result = await collectAndBuild(scenario);
    assertScenarioResult(scenario, result);
  }

  const aiPayload = campops.buildCampOpsAiAssistPayload({
    context: fixtures.context(),
    recommendationSet: serviceResult.recommendationSet,
  });
  assert.strictEqual(aiPayload.source, 'campops_recommendation_set');
  assert.strictEqual(aiPayload.recommendedCamp.id, 'provider-fuel-close');
  assert.ok(JSON.stringify(aiPayload).includes('provider-fuel-close'));

  console.log('CampOps provider fixture checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
