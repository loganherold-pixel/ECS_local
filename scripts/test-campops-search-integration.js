const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const storage = new Map();

global.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const {
  locateCampsiteResultForRoute,
} = require(path.join(__dirname, '..', 'lib', 'campsites', 'campsiteLocatorService.ts'));

const {
  withCampOpsSearchPayload,
} = require(path.join(__dirname, '..', 'lib', 'campops', 'index.ts'));

function makeEngineCandidate(index, overrides = {}) {
  return {
    segmentIndex: index,
    coordinates: [39 + index * 0.01, -121 - index * 0.01],
    distanceMiles: 30 + index * 10,
    avgElevation: 5200,
    elevationGain: 20,
    candidateReason: ['Flat terrain', 'Remote from major roadways'],
    segmentRange: `${30 + index * 10}-${40 + index * 10} mi`,
    difficulty: 'easy',
    qualityScore: 88 - index,
    suitabilityScore: 10 - index * 0.5,
    rating: 'A',
    score: 88 - index,
    remotenessScore: 80,
    campingSuitabilityScore: 86,
    legalAccessScore: 82,
    terrainScore: 88,
    routeProximityScore: 90,
    ratingFactors: [],
    suitabilityLevel: 'HIGH',
    estimatedArrivalHour: 5 + index,
    scoringBreakdown: {
      flatTerrainBonus: 3,
      remotenessBonus: 3,
      timingBonus: 4,
      elevationPenalty: 0,
      mountainPassPenalty: 0,
      idealTimingBonus: 4,
      tooEarlyPenalty: 0,
      tooLatePenalty: 0,
      shortRouteReduction: 0,
      overnightReduction: 0,
      reasons: [],
    },
    confidence: 'HIGH',
    confidenceReasons: [],
    fallbackStage: 0,
    fallbackMode: 'standard',
    criteriaBroadened: false,
    credibilityTier: 'preferred',
    ...overrides,
  };
}

function makeCandidateResult(candidates) {
  return {
    id: 'campops-search-result',
    routeIntelligenceId: 'route-1',
    routeName: 'CampOps Test Route',
    totalDistanceMiles: 120,
    estimatedDriveTimeHours: 8,
    candidates,
    suggestedCampsites: candidates,
    candidateCount: candidates.length,
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

function makeRouteIntelligence() {
  const segments = Array.from({ length: 8 }, (_, index) => {
    const start = index * 15;
    const end = start + 15;
    return {
      segmentIndex: index,
      distanceStart: start,
      distanceEnd: end,
      avgElevation: 4800,
      elevationGain: 20,
      elevationLoss: 10,
      maxElevation: 4850,
      minElevation: 4750,
      coordinates: [39 + index * 0.01, -121 - index * 0.01],
      pointCount: 5,
      avgGradePercent: 1,
      maxGradePercent: 3,
      difficulty: 'easy',
      estimatedDriveTimeHours: 1,
    };
  });
  return {
    id: 'route-flow',
    sourceId: 'route-flow-source',
    routeName: 'Route Flow Fixture',
    totalDistanceMiles: 120,
    estimatedDriveTimeHours: 8,
    elevationGainFeet: 160,
    elevationLossFeet: 80,
    highestElevationFeet: 4850,
    lowestElevationFeet: 4750,
    avgElevationFeet: 4800,
    totalPoints: 40,
    segments,
    segmentCount: segments.length,
    overallDifficulty: 'easy',
    bounds: {
      north: 39.08,
      south: 39,
      east: -121,
      west: -121.08,
    },
    elevationProfile: [],
    analyzedAt: '2026-04-30T15:00:00.000Z',
    hasElevation: true,
    avgSpeedAssumption: 15,
  };
}

function integrationContext(overrides = {}) {
  return {
    currentTimeIso: '2026-04-30T15:00:00.000Z',
    desiredArrivalWindow: {
      startIso: '2026-04-30T18:00:00.000Z',
      endIso: '2026-04-30T21:00:00.000Z',
      latestAcceptableIso: '2026-04-30T22:00:00.000Z',
    },
    daylightInfo: {
      sunsetIso: '2026-05-01T02:00:00.000Z',
      source: 'manual',
      confidence: 'medium',
    },
    resourceState: {
      fuelReserveMiles: 90,
      waterGallons: 8,
      source: 'manual',
      confidence: 'medium',
    },
    riskTolerance: 'balanced',
    offlineMode: 'online',
    ...overrides,
  };
}

async function main() {
  const baseResult = makeCandidateResult([
    makeEngineCandidate(0),
    makeEngineCandidate(1, { estimatedArrivalHour: 6, score: 84 }),
  ]);

  const disabled = withCampOpsSearchPayload(baseResult, {
    source: 'route',
    context: integrationContext(),
  });
  assert.strictEqual(disabled, baseResult, 'Disabled CampOps integration must return the original result object.');
  assert.strictEqual(disabled.campOps, undefined, 'Disabled CampOps integration must not add runtime payloads.');

  const legacyShortcutIgnored = withCampOpsSearchPayload(baseResult, {
    source: 'route',
    enabled: true,
    context: integrationContext(),
  });
  assert.strictEqual(
    legacyShortcutIgnored,
    baseResult,
    'Legacy enabled shortcut must not bypass explicit CampOps rollout flags.',
  );

  const enabled = withCampOpsSearchPayload(baseResult, {
    source: 'route',
    rolloutConfig: {
      campopsRecommendationsEnabled: true,
    },
    context: integrationContext(),
  });
  assert.notStrictEqual(enabled, baseResult, 'Enabled CampOps integration may return an enriched result object.');
  assert.strictEqual(enabled.candidates, baseResult.candidates, 'Existing candidate list must be preserved.');
  assert.strictEqual(enabled.campOps.enabled, true, 'Enabled CampOps integration should mark payload enabled.');
  assert.ok(enabled.campOps.recommendationSet, 'Enabled CampOps integration should generate recommendations.');
  assert.ok(
    enabled.campOps.recommendationSet.scoresByCandidateId,
    'CampOps recommendation set should expose serializable suitability scores.',
  );
  assert.ok(
    enabled.campOps.recommendationSet.enrichmentsByCandidateId,
    'CampOps recommendation set should expose serializable enrichments.',
  );
  assert.ok(
    Array.isArray(enabled.campOps.recommendationSet.rankedCandidates),
    'CampOps recommendation set should expose ranked map candidates.',
  );
  assert.ok(
    enabled.campOps.recommendationSet.rankedCandidates.length <= enabled.candidates.length,
    'CampOps ranked map candidates should come from the generated candidate set.',
  );

  const sourceSignalCandidateId = 'generated:route_candidate:0:39.00000,-121.00000';
  const sourceSignalResult = withCampOpsSearchPayload(baseResult, {
    source: 'route',
    rolloutConfig: {
      campopsRecommendationsEnabled: true,
      campopsProviderAdaptersEnabled: true,
      campopsSourceTransparencyEnabled: true,
    },
    context: integrationContext(),
    sourceSignalsByCandidateId: {
      [sourceSignalCandidateId]: [
        {
          source: 'offline_dataset',
          confidence: 'high',
          observedAtIso: '2026-04-30T14:30:00.000Z',
          staleAfterMinutes: 240,
          closureStatus: 'closed',
          legalStatus: 'prohibited',
          legalConfidence: 'high',
          fireRestrictionStatus: 'fire_ban',
        },
      ],
    },
  });
  const sourceSignalRejection = sourceSignalResult.campOps.recommendationSet.rejectedCandidates.find(
    (item) => item.candidate.id === sourceSignalCandidateId,
  );
  assert.ok(sourceSignalRejection, 'External source signals should feed deterministic hard gates.');
  assert.ok(
    sourceSignalRejection.gates.some((gate) => gate.gateId === 'campops.access.closed'),
    'Closed source signal should reject the candidate through CampOps hard gates.',
  );
  assert.ok(
    sourceSignalResult.campOps.recommendationSet.enrichmentsByCandidateId[sourceSignalCandidateId].sourceSignals.length > 0,
    'Merged source signals should be preserved for UI and AI explanation.',
  );

  const routeInput = {
    routeId: 'route-flow',
    routeIntelligence: makeRouteIntelligence(),
    routeSourceType: 'trail',
    routeBufferMiles: 10,
  };
  const legacyFlow = locateCampsiteResultForRoute(routeInput, { publish: false });
  const campOpsFlow = locateCampsiteResultForRoute(
    {
      ...routeInput,
      campopsRecommendationsEnabled: true,
      campOps: {
        context: integrationContext(),
      },
    },
    { publish: false },
  );

  assert.strictEqual(legacyFlow.campOps, undefined, 'Locator flow should keep CampOps absent while the flag is disabled.');
  assert.strictEqual(campOpsFlow.campOps.enabled, true, 'Locator flow should attach CampOps when the flag is enabled.');
  assert.deepStrictEqual(
    campOpsFlow.candidates.map((candidate) => candidate.segmentIndex),
    legacyFlow.candidates.map((candidate) => candidate.segmentIndex),
    'CampOps wiring must not reorder or replace the existing candidate list.',
  );

  console.log('CampOps search integration tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
