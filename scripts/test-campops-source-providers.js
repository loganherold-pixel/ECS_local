const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campopsPath = path.join(root, 'lib', 'campops', 'index.ts');

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

const {
  CampOpsSourceProviderRegistry,
  collectCampOpsSourceProviderBundle,
  applyCampOpsSourceSignalsToEnrichment,
  withCampOpsSearchPayload,
  CampOpsLegalAccessSourceProvider,
  CampOpsClosureSourceProvider,
  CampOpsFireRestrictionSourceProvider,
  CampOpsWeatherSourceProvider,
  CampOpsServiceSourceProvider,
} = require(campopsPath);

const context = {
  id: 'source-provider-test',
  currentTimeIso: '2026-04-30T18:00:00.000Z',
  riskTolerance: 'balanced',
  offlineMode: 'online',
};

const candidates = [
  {
    id: 'camp-a',
    name: 'Camp A',
    location: { latitude: 39.1, longitude: -119.9 },
    source: 'route_candidate',
    sourceConfidence: 'medium',
  },
];

function provider(id, displayName, sourceCategory, collectSignals, overrides = {}) {
  return {
    id,
    displayName,
    sourceCategory,
    sourceConfidence: overrides.sourceConfidence ?? 'medium',
    staleAfterMinutes: overrides.staleAfterMinutes ?? 60,
    collectSignals,
  };
}

function baseEnrichment(overrides = {}) {
  return {
    candidateId: 'camp-a',
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
    dataConfidence: 'unknown',
    ...overrides,
  };
}

function makeEngineCandidate(index, overrides = {}) {
  return {
    segmentIndex: index,
    coordinates: [39 + index * 0.01, -121 - index * 0.01],
    distanceMiles: 30,
    avgElevation: 5200,
    elevationGain: 20,
    candidateReason: ['Flat terrain'],
    segmentRange: '30-40 mi',
    difficulty: 'easy',
    qualityScore: 88,
    suitabilityScore: 10,
    rating: 'A',
    score: 88,
    remotenessScore: 80,
    campingSuitabilityScore: 86,
    legalAccessScore: 82,
    terrainScore: 88,
    routeProximityScore: 90,
    ratingFactors: [],
    suitabilityLevel: 'HIGH',
    estimatedArrivalHour: 5,
    scoringBreakdown: { reasons: [] },
    confidence: 'HIGH',
    confidenceReasons: [],
    fallbackStage: 0,
    fallbackMode: 'standard',
    criteriaBroadened: false,
    credibilityTier: 'preferred',
    ...overrides,
  };
}

function candidateResult() {
  const resultCandidates = [makeEngineCandidate(0)];
  return {
    id: 'campops-provider-search-result',
    routeIntelligenceId: 'route-1',
    routeName: 'Provider Route',
    totalDistanceMiles: 120,
    estimatedDriveTimeHours: 8,
    candidates: resultCandidates,
    suggestedCampsites: resultCandidates,
    candidateCount: resultCandidates.length,
    totalSegments: 8,
    excludedSegments: 0,
    analyzedAt: '2026-04-30T15:00:00.000Z',
    scoringApplied: true,
    isShortRoute: false,
    overnightUnlikely: false,
    hasHighConfidence: true,
    bestConfidence: 'HIGH',
    fallbackStage: 0,
    fallbackMode: 'standard',
    criteriaBroadened: false,
    healthyThreshold: 55,
    minimumAcceptableThreshold: 45,
    uiNotice: null,
    analysisSource: 'route',
    polygonId: null,
  };
}

(async () => {
  const legalProvider = provider('legal-fixture', 'Legal Fixture', 'legal', () => [
    {
      candidateId: 'camp-a',
      signal: {
        source: 'offline_dataset',
        confidence: 'high',
        observedAtIso: '2026-04-30T17:30:00.000Z',
        legalStatus: 'allowed',
        legalConfidence: 'high',
      },
      rawProviderStatus: { status: 'ok', apiKey: 'must-not-serialize' },
    },
  ]);

  const successBundle = await collectCampOpsSourceProviderBundle({
    providers: [legalProvider],
    context,
    candidates,
  });
  assert.strictEqual(successBundle.providerResults.length, 1);
  assert.strictEqual(successBundle.providerResults[0].providerId, 'legal-fixture');
  assert.strictEqual(successBundle.providerResults[0].providerDisplayName, 'Legal Fixture');
  assert.strictEqual(successBundle.providerResults[0].sourceCategory, 'legal');
  assert.strictEqual(successBundle.providerResults[0].sourceFreshness, 'fresh');
  assert.strictEqual(successBundle.providerResults[0].sourceTimestampIso, '2026-04-30T17:30:00.000Z');
  assert.strictEqual(successBundle.providerResults[0].rawProviderStatus.apiKey, undefined);
  assert.strictEqual(successBundle.signalsByCandidateId['camp-a'].length, 1);

  const weatherProvider = provider('weather-fixture', 'Weather Fixture', 'weather', () => [
    {
      candidateId: 'camp-a',
      signal: {
        source: 'manual',
        confidence: 'medium',
        observedAtIso: '2026-04-30T17:45:00.000Z',
        weatherExposure: 'caution',
      },
    },
  ]);
  const multiBundle = await collectCampOpsSourceProviderBundle({
    providers: [legalProvider, weatherProvider],
    context,
    candidates,
  });
  const merged = applyCampOpsSourceSignalsToEnrichment({
    enrichment: baseEnrichment(),
    signals: multiBundle.signalsByCandidateId['camp-a'],
    currentTimeIso: context.currentTimeIso,
  });
  assert.strictEqual(merged.legalStatus, 'allowed');
  assert.strictEqual(merged.weatherExposure, 'caution');

  const failureProvider = provider('failure-fixture', 'Failure Fixture', 'closure', () => {
    throw new Error('fixture unavailable');
  });
  const failureBundle = await collectCampOpsSourceProviderBundle({
    providers: [failureProvider],
    context,
    candidates,
  });
  assert.strictEqual(failureBundle.signalsByCandidateId['camp-a'], undefined);
  assert.ok(failureBundle.errors.some((error) => error.includes('fixture unavailable')));

  const staleProvider = provider('stale-fixture', 'Stale Fixture', 'fire', () => [
    {
      candidateId: 'camp-a',
      signal: {
        source: 'offline_dataset',
        confidence: 'medium',
        observedAtIso: '2026-04-30T15:00:00.000Z',
        staleAfterMinutes: 30,
        fireRestrictionStatus: 'none_known',
      },
    },
  ]);
  const staleBundle = await collectCampOpsSourceProviderBundle({
    providers: [staleProvider],
    context,
    candidates,
  });
  assert.strictEqual(staleBundle.providerResults[0].sourceFreshness, 'stale');
  assert.ok(staleBundle.warnings.some((warning) => warning.includes('Stale Fixture data is stale')));

  const restrictiveProvider = provider('restrictive-fixture', 'Restrictive Fixture', 'legal', () => [
    {
      candidateId: 'camp-a',
      signal: {
        source: 'offline_dataset',
        confidence: 'medium',
        observedAtIso: '2026-04-30T17:50:00.000Z',
        legalStatus: 'prohibited',
        legalConfidence: 'medium',
      },
    },
  ]);
  const conflictBundle = await collectCampOpsSourceProviderBundle({
    providers: [restrictiveProvider, legalProvider],
    context,
    candidates,
  });
  assert.ok(conflictBundle.warnings.some((warning) => warning.includes('Conflicting legalStatus')));
  const conflictMerged = applyCampOpsSourceSignalsToEnrichment({
    enrichment: baseEnrichment(),
    signals: conflictBundle.signalsByCandidateId['camp-a'],
    currentTimeIso: context.currentTimeIso,
  });
  assert.strictEqual(conflictMerged.legalStatus, 'prohibited', 'Restrictive legal source truth should win conflicts.');

  const missingProvider = provider('missing-fixture', 'Missing Fixture', 'service', () => [
    {
      candidateId: 'camp-a',
      signal: null,
      missingDataReason: 'No service data in coverage area.',
    },
  ]);
  const missingBundle = await collectCampOpsSourceProviderBundle({
    providers: [missingProvider],
    context,
    candidates,
  });
  assert.strictEqual(missingBundle.providerResults[0].sourceFreshness, 'missing');
  assert.ok(missingBundle.warnings.some((warning) => warning.includes('No service data')));

  const registry = new CampOpsSourceProviderRegistry([legalProvider, weatherProvider]);
  const registryBundle = await registry.collect({ context, candidates });
  assert.strictEqual(registryBundle.providerResults.length, 2);

  const disabledRegistryBundle = await registry.collect({
    context,
    candidates,
    config: { providersEnabled: false },
  });
  assert.strictEqual(disabledRegistryBundle.providerResults.length, 0);

  const fixtureLegalProvider = new CampOpsLegalAccessSourceProvider({
    records: [
      {
        candidateId: 'camp-a',
        source: 'offline_dataset',
        campingAllowed: 'yes',
        accessAllowed: 'yes',
        landStatus: 'public',
        legalConfidence: 'high',
        observedAtIso: '2026-04-30T17:50:00.000Z',
        sourceSummary: 'Fixture-backed public legal/access record.',
      },
    ],
  });
  const fixtureBundle = await collectCampOpsSourceProviderBundle({
    providers: [fixtureLegalProvider],
    context,
    candidates,
  });
  assert.strictEqual(fixtureBundle.providerResults[0].providerId, 'campops.fixture_legal_access');
  assert.strictEqual(fixtureBundle.signalsByCandidateId['camp-a'][0].legalStatus, 'allowed');

  const fixtureClosureProvider = new CampOpsClosureSourceProvider({
    records: [
      {
        candidateId: 'camp-a',
        source: 'offline_dataset',
        closureStatus: 'closed',
        closureReason: 'Fixture-backed active closure.',
        appliesToVehicleAccess: true,
        sourceConfidence: 'high',
        observedAtIso: '2026-04-30T17:50:00.000Z',
        sourceSummary: 'Fixture-backed active closure record.',
      },
    ],
  });
  const fixtureClosureBundle = await collectCampOpsSourceProviderBundle({
    providers: [fixtureClosureProvider],
    context,
    candidates,
  });
  assert.strictEqual(fixtureClosureBundle.providerResults[0].providerId, 'campops.fixture_closure');
  assert.strictEqual(fixtureClosureBundle.signalsByCandidateId['camp-a'][0].closureStatus, 'closed');

  const fixtureFireProvider = new CampOpsFireRestrictionSourceProvider({
    records: [
      {
        candidateId: 'camp-a',
        source: 'offline_dataset',
        campfireAllowed: 'no',
        stoveAllowed: 'yes',
        redFlagRisk: 'low',
        smokeOrAirQualityRisk: 'low',
        sourceConfidence: 'high',
        observedAtIso: '2026-04-30T17:50:00.000Z',
        sourceSummary: 'Fixture-backed campfire restriction record.',
      },
    ],
  });
  const fixtureFireBundle = await collectCampOpsSourceProviderBundle({
    providers: [fixtureFireProvider],
    context,
    candidates,
  });
  assert.strictEqual(fixtureFireBundle.providerResults[0].providerId, 'campops.fixture_fire_restriction');
  assert.strictEqual(fixtureFireBundle.signalsByCandidateId['camp-a'][0].campfireAllowed, 'no');

  const fixtureWeatherProvider = new CampOpsWeatherSourceProvider({
    records: [
      {
        candidateId: 'camp-a',
        source: 'offline_dataset',
        forecastTimeWindow: { label: 'arrival window' },
        windSpeedMph: 10,
        windGustMph: 14,
        windDirection: 'SW',
        precipitationRisk: 'low',
        stormRisk: 'low',
        temperatureLowF: 48,
        temperatureHighF: 72,
        heatRisk: 'low',
        coldRisk: 'low',
        smokeOrAirQualityRisk: 'low',
        sourceConfidence: 'high',
        observedAtIso: '2026-04-30T17:50:00.000Z',
        sourceSummary: 'Fixture-backed calm weather record.',
      },
    ],
  });
  const fixtureWeatherBundle = await collectCampOpsSourceProviderBundle({
    providers: [fixtureWeatherProvider],
    context,
    candidates,
  });
  assert.strictEqual(fixtureWeatherBundle.providerResults[0].providerId, 'campops.fixture_weather');
  assert.strictEqual(fixtureWeatherBundle.signalsByCandidateId['camp-a'][0].weatherExposureLevel, 'low');
  assert.strictEqual(fixtureWeatherBundle.signalsByCandidateId['camp-a'][0].windGustMph, 14);

  const fixtureServiceProvider = new CampOpsServiceSourceProvider({
    records: [
      {
        candidateId: 'camp-a',
        serviceType: 'fuel',
        name: 'Fixture Fuel',
        source: 'offline_dataset',
        routeAwareDistanceMiles: 12,
        distanceFromCampMiles: 10,
        confidence: 'high',
        status: 'open',
        operatingHours: { summary: 'Known open in fixture', isCurrentlyOpen: true },
        observedAtIso: '2026-04-30T17:50:00.000Z',
        sourceSummary: 'Fixture-backed fuel service record.',
      },
    ],
  });
  const fixtureServiceBundle = await collectCampOpsSourceProviderBundle({
    providers: [fixtureServiceProvider],
    context,
    candidates,
  });
  assert.strictEqual(fixtureServiceBundle.providerResults[0].providerId, 'campops.fixture_service_resupply');
  assert.strictEqual(fixtureServiceBundle.signalsByCandidateId['camp-a'][0].nearestFuel.name, 'Fixture Fuel');
  assert.strictEqual(fixtureServiceBundle.signalsByCandidateId['camp-a'][0].serviceDistanceMiles, 12);

  const sourceSignalCandidateId = 'generated:route_candidate:0:39.00000,-121.00000';
  const searchBundle = await collectCampOpsSourceProviderBundle({
    providers: [
      provider('search-closure', 'Search Closure', 'closure', () => [
        {
          candidateId: sourceSignalCandidateId,
          signal: {
            source: 'offline_dataset',
            confidence: 'high',
            observedAtIso: '2026-04-30T14:30:00.000Z',
            closureStatus: 'closed',
          },
        },
      ]),
    ],
    context: {
      ...context,
      id: 'search-source-provider-test',
      currentTimeIso: '2026-04-30T15:00:00.000Z',
    },
    candidates: [{ ...candidates[0], id: sourceSignalCandidateId }],
  });
  const searchResult = withCampOpsSearchPayload(candidateResult(), {
    source: 'route',
    rolloutConfig: {
      campopsRecommendationsEnabled: true,
      campopsProviderAdaptersEnabled: true,
      campopsSourceTransparencyEnabled: true,
    },
    context: {
      currentTimeIso: '2026-04-30T15:00:00.000Z',
      riskTolerance: 'balanced',
      offlineMode: 'online',
    },
    sourceProviderBundle: searchBundle,
  });
  assert.ok(
    searchResult.campOps.recommendationSet.rejectedCandidates.some((item) => item.candidate.id === sourceSignalCandidateId),
    'Precollected provider bundle should feed the existing CampOps search pipeline.',
  );

  console.log('CampOps source provider checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
