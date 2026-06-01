const assert = require('assert');
require('./campops-react-native-test-shim');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const campOpsPath = path.join(root, 'lib', 'campops', 'index.ts');

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
  campOpsCandidateFromLegacySearchResult,
  campOpsEnrichmentDraftFromLegacyCandidate,
  campOpsIdForLegacyCandidate,
  campOpsRecommendationToLegacyDisplayFields,
  getCampOpsLegacyCandidateStatus,
  getCampOpsLegacyListNotice,
  orderLegacyCandidatesByCampOpsCompatibility,
} = require(campOpsPath);

function legacyCandidate(index, overrides = {}) {
  return {
    segmentIndex: index,
    coordinates: [39 + index * 0.01, -121 - index * 0.01],
    segmentRange: `Mile ${index}`,
    suitabilityScore: 90 - index,
    suitabilityLevel: 'HIGH',
    confidence: 'HIGH',
    difficulty: 'easy',
    distanceMiles: 50 + index,
    elevationGain: 20,
    avgElevation: 4200,
    estimatedArrivalHour: 6,
    candidateReason: ['Legacy search result'],
    confidenceReasons: [],
    qualityScore: 80 - index,
    legalAccessScore: 70,
    terrainScore: 76,
    credibilityTier: 'possible',
    ...overrides,
  };
}

function result(candidates) {
  return {
    analysisSource: 'route',
    source: 'route',
    suggestedCampsites: candidates,
  };
}

function campOpsCandidateFromLegacy(candidate, resultLike = result([candidate])) {
  const id = campOpsIdForLegacyCandidate(candidate, resultLike);
  return {
    id,
    name: candidate.segmentRange,
    location: {
      latitude: candidate.coordinates[0],
      longitude: candidate.coordinates[1],
    },
    source: 'route_candidate',
    sourceConfidence: 'medium',
  };
}

const legacyTop = legacyCandidate(0);
const legacySecond = legacyCandidate(1);
const routeResult = result([legacyTop, legacySecond]);
const topCampOps = campOpsCandidateFromLegacy(legacyTop, routeResult);
const recommendedCampOps = campOpsCandidateFromLegacy(legacySecond, routeResult);

const differsSet = {
  recommendedCamp: recommendedCampOps,
  backupCamp: null,
  emergencyCamp: null,
  rejectedCandidates: [],
  warnings: [],
  assumptions: [],
  confidenceSummary: {
    level: 'medium',
    score: 70,
    reasons: [],
    missingDataFields: [],
  },
  scoresByCandidateId: {
    [topCampOps.id]: { overall: 58 },
    [recommendedCampOps.id]: { overall: 82 },
  },
  enrichmentsByCandidateId: {},
  explanations: {
    keyTradeoffs: [],
  },
};

assert.strictEqual(
  getCampOpsLegacyCandidateStatus(legacySecond, routeResult, differsSet).kind,
  'recommended_endpoint',
  'Legacy item matching CampOps recommendation should be annotated as endpoint recommendation.',
);
assert.strictEqual(
  getCampOpsLegacyCandidateStatus(legacyTop, routeResult, differsSet).kind,
  'caution',
  'Low CampOps score should annotate prominent legacy result with caution.',
);
assert.ok(
  getCampOpsLegacyListNotice(routeResult, differsSet).includes('Endpoint recommendation differs from top search result'),
  'UI should warn when legacy top result differs from CampOps recommendation.',
);

const adaptedCampOpsCandidate = campOpsCandidateFromLegacySearchResult(legacySecond, routeResult);
assert.strictEqual(
  adaptedCampOpsCandidate.id,
  recommendedCampOps.id,
  'Legacy candidate adapter should produce the same generated CampOps candidate id used by recommendations.',
);
assert.strictEqual(
  adaptedCampOpsCandidate.source,
  'route_candidate',
  'Legacy route result should adapt to the route candidate CampOps source.',
);

const adaptedEnrichment = campOpsEnrichmentDraftFromLegacyCandidate(
  legacyCandidate(2, {
    difficulty: 'challenging',
    legalAccessScore: 80,
    distanceMiles: 64,
  }),
  routeResult,
);
assert.strictEqual(
  adaptedEnrichment.accessDifficulty,
  'high_clearance',
  'Legacy challenging terrain should become a high-clearance CampOps access draft.',
);
assert.strictEqual(
  adaptedEnrichment.legalConfidence,
  'high',
  'Legacy legal score should be normalized into CampOps confidence.',
);
assert.strictEqual(
  adaptedEnrichment.routeDistanceToCampMiles,
  64,
  'Legacy route distance should be preserved for CampOps enrichment drafts.',
);

const recommendedDisplayFields = campOpsRecommendationToLegacyDisplayFields(legacySecond, routeResult, differsSet);
assert.strictEqual(
  recommendedDisplayFields.status.kind,
  'recommended_endpoint',
  'Display adapter should preserve the CampOps endpoint status for legacy UI consumers.',
);
assert.strictEqual(
  recommendedDisplayFields.recommendedDisplayRank,
  1,
  'Recommended CampOps endpoint should get a recommendation display rank distinct from legacy search rank.',
);
assert.strictEqual(
  recommendedDisplayFields.legacyRankCopy,
  'Search result rank',
  'Compatibility copy should avoid implying legacy ranking is the CampOps recommendation.',
);
assert.strictEqual(
  recommendedDisplayFields.displayScoreMeaning,
  'campops_suitability_score',
  'Display adapter should prefer CampOps suitability score when present.',
);

const rejectedSet = {
  ...differsSet,
  rejectedCandidates: [
    {
      candidate: topCampOps,
      reasons: ['Known closure blocks access.'],
      gates: [],
    },
  ],
  scoresByCandidateId: {
    [recommendedCampOps.id]: { overall: 82 },
  },
};

assert.strictEqual(
  getCampOpsLegacyCandidateStatus(legacyTop, routeResult, rejectedSet).kind,
  'not_recommended',
  'Rejected CampOps candidate should not appear as an unqualified primary result.',
);
assert.ok(
  getCampOpsLegacyListNotice(routeResult, rejectedSet).includes('Top search result is not recommended by CampOps'),
  'UI should not let rejected legacy top result contradict CampOps.',
);
const rejectedDisplayFields = campOpsRecommendationToLegacyDisplayFields(legacyTop, routeResult, rejectedSet);
assert.strictEqual(
  rejectedDisplayFields.shouldDeemphasizeLegacyRank,
  true,
  'Rejected or caution CampOps statuses should tell legacy consumers not to emphasize old rank.',
);
assert.ok(
  rejectedDisplayFields.displayReasons.includes('Known closure blocks access.'),
  'Rejected display fields should preserve deterministic rejection reasons.',
);

const downgradedSet = {
  ...differsSet,
  explanations: {
    plannedCampDowngrade: 'Planned camp arrival moved after sunset.',
    keyTradeoffs: [],
  },
};
assert.ok(
  getCampOpsLegacyListNotice(routeResult, downgradedSet).includes('Planned camp was downgraded by CampOps'),
  'Downgraded planned camp copy should not be contradicted by legacy search order.',
);

assert.strictEqual(
  getCampOpsLegacyCandidateStatus(legacyTop, routeResult, null),
  null,
  'Feature flag off/no CampOps set should preserve legacy UI with no annotation.',
);
assert.strictEqual(
  getCampOpsLegacyListNotice(routeResult, null),
  null,
  'Feature flag off/no CampOps set should preserve legacy UI with no coexistence notice.',
);

const compatibilityOrder = orderLegacyCandidatesByCampOpsCompatibility(routeResult, rejectedSet);
assert.strictEqual(
  compatibilityOrder[0].segmentIndex,
  legacySecond.segmentIndex,
  'Future compatibility ordering should put the CampOps recommendation before a rejected legacy top result.',
);
assert.strictEqual(
  compatibilityOrder[compatibilityOrder.length - 1].segmentIndex,
  legacyTop.segmentIndex,
  'Future compatibility ordering should keep rejected candidates out of the primary position.',
);
assert.deepStrictEqual(
  orderLegacyCandidatesByCampOpsCompatibility(routeResult, null),
  routeResult.suggestedCampsites,
  'No CampOps recommendation set should preserve legacy candidate order exactly.',
);

console.log('CampOps legacy coexistence checks passed.');
