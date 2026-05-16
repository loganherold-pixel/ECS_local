const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campOpsPath = path.join(root, 'lib', 'campops', 'index.ts');
const mapPinsPath = path.join(root, 'lib', 'campops', 'campOpsMapPins.ts');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'web', select: (values) => values?.web ?? values?.default },
      StyleSheet: { create(styles) { return styles; } },
    };
  }
  if (request === 'expo-constants') {
    return { default: { expoConfig: { extra: {} }, manifest: { extra: {} } } };
  }
  return originalLoad(request, parent, isMain);
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
const { buildCampOpsCampScoutMapPins } = require(mapPinsPath);

function context(id = 'ctx-filtering') {
  return {
    id,
    currentTimeIso: '2026-05-04T16:00:00.000Z',
    desiredArrivalWindow: {
      startIso: '2026-05-04T17:00:00.000Z',
      endIso: '2026-05-04T19:00:00.000Z',
      latestAcceptableIso: '2026-05-04T19:30:00.000Z',
    },
    riskTolerance: 'balanced',
    offlineMode: 'online',
  };
}

function candidate(id, latitude, longitude, overrides = {}) {
  return {
    id,
    name: id,
    location: { latitude, longitude },
    source: 'route_candidate',
    sourceConfidence: 'high',
    lastVerifiedDate: '2026-05-01T00:00:00.000Z',
    score: 86,
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
    etaIso: '2026-05-04T18:00:00.000Z',
    sunsetMarginMinutes: 80,
    routeDistanceToCampMiles: 3,
    straightLineDistanceToCampMiles: 2,
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

function score(candidateId, overall = 86, overrides = {}) {
  const scores = {
    overall,
    legal: overall,
    access: overall,
    time: overall,
    resources: overall,
    terrain: overall,
    weather: overall,
    groupFit: overall,
    trailerFit: overall,
    lateArrival: overall,
    privacy: overall,
    dataConfidence: overall,
    ...overrides.scores,
  };
  return {
    candidateId,
    scores,
    rankScore: overrides.rankScore ?? scores.overall,
    recommendationEligible: overrides.recommendationEligible ?? true,
    hardGateStatus: overrides.hardGateStatus ?? 'allowed',
    explanation: {
      positiveFactors: ['High confidence route-adjacent camp candidate.'],
      negativeFactors: [],
      missingData: [],
      assumptions: [],
      confidenceNote: 'All beta threshold fields are present.',
      ...overrides.explanation,
    },
  };
}

function buildSet(ctx, camps, enrichments, scores) {
  return campops.generateCampRecommendationSet({
    context: ctx,
    candidates: camps,
    enrichmentsByCandidateId: enrichments,
    hardGateEvaluationsByCandidateId: {},
    suitabilityScoresByCandidateId: scores,
  });
}

function byId(values) {
  return Object.fromEntries(values.map((value) => [value.candidateId ?? value.id, value]));
}

const noQualifying = buildSet(
  context('ctx-zero'),
  [candidate('weak-a', 39.1, -120.1), candidate('weak-b', 39.2, -120.2)],
  byId([enrichment('weak-a'), enrichment('weak-b')]),
  byId([
    score('weak-a', 69),
    score('weak-b', 82, { scores: { terrain: 66 } }),
  ]),
);
assert.strictEqual(noQualifying.rankedCandidates.length, 0, 'Below-threshold camps should not be surfaced.');
assert.strictEqual(buildCampOpsCampScoutMapPins(noQualifying).length, 0, 'Below-threshold camps should not create pins.');
assert.ok(
  noQualifying.warnings.some((warning) => warning.includes('No camp candidate')),
  'No qualifying candidates should produce an actionable warning.',
);

const oneQualifying = buildSet(
  context('ctx-one'),
  [candidate('solid-a', 39.1, -120.1), candidate('low-legal', 39.2, -120.2)],
  byId([enrichment('solid-a'), enrichment('low-legal')]),
  byId([
    score('solid-a', 88),
    score('low-legal', 84, { scores: { legal: 55 } }),
  ]),
);
assert.deepStrictEqual(
  oneQualifying.rankedCandidates.map((camp) => camp.id),
  ['solid-a'],
  'Only the high-confidence candidate should remain after legal/source thresholding.',
);
assert.ok(
  oneQualifying.rejectedCandidates.some((item) => item.candidate.id === 'low-legal'),
  'Low legal/source confidence should be captured as a rejected candidate.',
);

const manyCamps = Array.from({ length: 7 }, (_, index) =>
  candidate(`top-${index + 1}`, 39 + index * 0.01, -120 - index * 0.01),
);
const manySet = buildSet(
  context('ctx-many'),
  manyCamps,
  byId(manyCamps.map((camp, index) => enrichment(camp.id, { routeDistanceToCampMiles: index + 1 }))),
  byId(manyCamps.map((camp, index) => score(camp.id, 95 - index))),
);
assert.strictEqual(manySet.rankedCandidates.length, 5, 'CampOps should cap route candidates at five.');
assert.deepStrictEqual(
  manySet.rankedCandidates.map((camp) => camp.id),
  ['top-1', 'top-2', 'top-3', 'top-4', 'top-5'],
  'Top five candidates should preserve ranking order.',
);

const duplicateSet = buildSet(
  context('ctx-duplicate'),
  [
    candidate('verified-nearby', 39.1, -120.1, { source: 'community', sourceConfidence: 'high', score: 88 }),
    candidate('inferred-nearby', 39.1005, -120.1005, { source: 'inferred', sourceConfidence: 'medium', score: 89 }),
    candidate('distinct-site', 39.25, -120.25, { score: 84 }),
  ],
  byId([
    enrichment('verified-nearby', { routeDistanceToCampMiles: 4 }),
    enrichment('inferred-nearby', { routeDistanceToCampMiles: 4.02 }),
    enrichment('distinct-site', { routeDistanceToCampMiles: 5 }),
  ]),
  byId([
    score('verified-nearby', 88),
    score('inferred-nearby', 89),
    score('distinct-site', 84),
  ]),
);
assert.deepStrictEqual(
  duplicateSet.rankedCandidates.map((camp) => camp.id),
  ['verified-nearby', 'distinct-site'],
  'Nearby practical duplicates should collapse while preferring stronger source confidence when scores are similar.',
);

const routeASet = buildSet(
  context('ctx-route-a'),
  [candidate('route-a-camp', 39.1, -120.1)],
  byId([enrichment('route-a-camp')]),
  byId([score('route-a-camp', 87)]),
);
const routeBSet = buildSet(
  context('ctx-route-b'),
  [candidate('route-b-camp', 40.1, -121.1)],
  byId([enrichment('route-b-camp')]),
  byId([score('route-b-camp', 90)]),
);
assert.deepStrictEqual(routeASet.rankedCandidates.map((camp) => camp.id), ['route-a-camp']);
assert.deepStrictEqual(routeBSet.rankedCandidates.map((camp) => camp.id), ['route-b-camp']);

const demoBlocked = buildSet(
  context('ctx-demo-blocked'),
  [candidate('demo-fallback', 39.1, -120.1, { source: 'inferred', sourceConfidence: 'high', score: 95 })],
  byId([enrichment('demo-fallback', { dataLimitations: ['Demo fallback fixture; not provider-backed.'] })]),
  byId([score('demo-fallback', 95)]),
);
assert.strictEqual(demoBlocked.rankedCandidates.length, 0, 'Demo fallback data should not surface as production route pins.');
assert.strictEqual(buildCampOpsCampScoutMapPins(demoBlocked).length, 0, 'Demo fallback data should not render map pins.');

const emptyRankedWithRoles = {
  ...oneQualifying,
  recommendedCamp: oneQualifying.rankedCandidates[0],
  emergencyCamp: oneQualifying.rankedCandidates[0],
  rankedCandidates: [],
};
assert.strictEqual(
  buildCampOpsCampScoutMapPins(emptyRankedWithRoles).length,
  0,
  'An explicit empty ranked candidate list should not fall back to role pins.',
);

const navigateSource = fs.readFileSync(navigatePath, 'utf8');
assert(
  navigateSource.includes('CAMPOPS_NO_ROUTE_CANDIDATES_MESSAGE'),
  'Navigate should expose the non-blocking no-candidate CampOps message.',
);

console.log('CampOps candidate filtering checks passed.');
