const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
      Platform: { OS: 'web', select: (values) => values?.web ?? values?.default },
    };
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

const { CampOpsRecommendationCoordinator } = require(path.join(
  root,
  'lib',
  'campops',
  'campOpsRecommendationCoordinator.ts',
));
const { dedupeEstablishedCampsitesForMapWithDiagnostics } = require(path.join(
  root,
  'lib',
  'map',
  'establishedCampsiteGeojsonAdapter.ts',
));

function established(id, latitude, longitude) {
  return {
    id,
    name: `Campground ${id}`,
    latitude,
    longitude,
    campsiteType: 'campground',
    source: 'RECREATION_GOV',
    feeStatus: 'paid',
    reservationStatus: 'reservable',
    amenities: [],
    sourceConfidence: 85,
    primaryProvider: 'RIDB',
    requiresVerification: true,
  };
}

const mapRecords = [];
for (let index = 0; index < 1_000; index += 1) {
  const row = Math.floor(index / 40);
  const column = index % 40;
  const latitude = 35 + row * 0.01;
  const longitude = -115 + column * 0.01;
  mapRecords.push(established(`base-${index}`, latitude, longitude));
  if (index % 5 === 0) {
    mapRecords.push(established(`duplicate-${index}`, latitude + 0.00025, longitude + 0.00025));
  }
}

const mapStartedAt = Date.now();
const mapResult = dedupeEstablishedCampsitesForMapWithDiagnostics(mapRecords);
const mapDurationMs = Date.now() - mapStartedAt;
const quadraticPairCount = (mapRecords.length * (mapRecords.length - 1)) / 2;
assert.strictEqual(mapResult.campsites.length, 1_000);
assert.strictEqual(mapResult.diagnostics.duplicateCount, 200);
assert.ok(
  mapResult.diagnostics.distanceCheckCount < quadraticPairCount * 0.05,
  'Viewport dedupe must stay well below a full pairwise scan.',
);

function candidate(index) {
  return {
    id: `camp-${index}`,
    name: `Operational camp ${index}`,
    location: { latitude: 38 + index * 0.01, longitude: -120 },
    source: 'manual',
    sourceConfidence: 'high',
    candidateClass: 'manual',
    recommendationVisibility: 'personal',
    score: 80 - (index % 20),
  };
}

function enrichment(id, index) {
  return {
    candidateId: id,
    legalStatus: 'allowed',
    legalConfidence: 'high',
    closureStatus: 'open',
    publicAccessStatus: 'public',
    accessDifficulty: 'easy',
    vehicleFit: 'fit',
    trailerSuitability: 'fit',
    turnaroundSuitability: 'fit',
    groupCapacityEstimate: 8,
    groupCapacityConfidence: 'high',
    etaIso: '2026-07-13T18:00:00.000Z',
    routeDistanceToCampMiles: index * 0.1,
    fuelImpact: { value: 100, unit: 'miles', impact: 'positive', confidence: 'high' },
    waterImpact: { value: 10, unit: 'gallons', impact: 'positive', confidence: 'high' },
    reliableWaterRefillAvailable: false,
    weatherExposure: 'positive',
    fireRestrictionStatus: 'none_known',
    privacyLikelihood: 'moderate',
    occupancyLikelihood: 'low',
    lateArrivalRisk: 'neutral',
    dataConfidence: 'high',
  };
}

const candidates = Array.from({ length: 250 }, (_, index) => candidate(index));
const enrichmentsByCandidateId = Object.fromEntries(
  candidates.map((item, index) => [item.id, enrichment(item.id, index)]),
);
const coordinator = new CampOpsRecommendationCoordinator({ cacheLimit: 4 });
const baseInput = {
  context: {
    id: 'performance-baseline',
    currentTimeIso: '2026-07-13T12:00:00.000Z',
    riskTolerance: 'balanced',
    offlineMode: 'online',
  },
  candidates,
  enrichmentsByCandidateId,
};

const first = coordinator.evaluate(baseInput);
const second = coordinator.evaluate(baseInput);
assert.strictEqual(first.diagnostics.cacheHit, false);
assert.strictEqual(second.diagnostics.cacheHit, true);
assert.strictEqual(second.diagnostics.fingerprint, first.diagnostics.fingerprint);
assert.strictEqual(coordinator.getMetrics().calculationCount, 1);

for (let index = 0; index < 8; index += 1) {
  coordinator.evaluate({
    ...baseInput,
    context: { ...baseInput.context, id: `performance-${index}` },
  });
}
const coordinatorMetrics = coordinator.getMetrics();
assert.ok(coordinatorMetrics.cacheSize <= coordinatorMetrics.cacheLimit);

console.log(JSON.stringify({
  schemaVersion: 1,
  workflow: 'campops-recommendation-and-map-layer',
  mapLayer: {
    inputCount: mapResult.diagnostics.inputCount,
    outputCount: mapResult.campsites.length,
    duplicateCount: mapResult.diagnostics.duplicateCount,
    distanceCheckCount: mapResult.diagnostics.distanceCheckCount,
    quadraticPairCount,
    comparisonRatio: Number((mapResult.diagnostics.distanceCheckCount / quadraticPairCount).toFixed(6)),
    durationMs: mapDurationMs,
  },
  recommendation: {
    candidateCount: candidates.length,
    firstDurationMs: first.diagnostics.durationMs,
    repeatedDurationMs: second.diagnostics.durationMs,
    cacheHit: second.diagnostics.cacheHit,
    metrics: coordinatorMetrics,
  },
}));
