const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

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
  getCampScoutConfidenceGrade,
  rankCampScoutCandidates,
  scoreCampScoutCandidate,
} = require(path.join(root, 'lib', 'campScout', 'campScoutScoring.ts'));

function blankBreakdown() {
  return {
    flatnessTerrain: 0,
    accessConfidence: 0,
    remotenessValue: 0,
    legalAccessConfidence: 0,
    safetyEnvironmentalRisk: 0,
    sourceSignal: 0,
    sourceQuality: 0,
    remoteness: 0,
    access: 0,
    legality: 0,
    terrain: 0,
    proximity: 0,
    confidence: 0,
    total: 0,
  };
}

function candidate(id, overrides = {}) {
  return {
    id,
    coordinate: {
      latitude: 39 + Number(id.replace(/\D/g, '') || 0) * 0.01,
      longitude: -120,
    },
    title: `Scout ${id}`,
    sourceType: 'official_mapped',
    confidenceScore: 0,
    confidenceGrade: 'D',
    scoreBreakdown: blankBreakdown(),
    reasons: [],
    cautions: [],
    distanceFromUserMiles: 22,
    distanceFromNearestRoadMiles: 1.2,
    distanceFromPavementMiles: 8,
    slopeEstimate: 2,
    terrainConfidence: 90,
    accessConfidence: 88,
    legalityConfidence: 90,
    remotenessScore: 84,
    safetyRiskScore: 8,
    environmentalRiskScore: 5,
    knownConflictRiskScore: 0,
    mapDataCompleteness: 95,
    sourceTimestamp: '2026-04-20T12:00:00.000Z',
    ...overrides,
  };
}

assert.strictEqual(getCampScoutConfidenceGrade(100), 'A');
assert.strictEqual(getCampScoutConfidenceGrade(85), 'A');
assert.strictEqual(getCampScoutConfidenceGrade(84), 'B');
assert.strictEqual(getCampScoutConfidenceGrade(70), 'B');
assert.strictEqual(getCampScoutConfidenceGrade(69), 'C');
assert.strictEqual(getCampScoutConfidenceGrade(50), 'C');
assert.strictEqual(getCampScoutConfidenceGrade(49), 'D');

const manyStrongCandidates = Array.from({ length: 12 }, (_, index) =>
  candidate(`strong-${index}`, {
    confidenceScore: 100 - index,
    remotenessScore: 90 - index,
  }),
);
const defaultRanked = rankCampScoutCandidates(manyStrongCandidates, {
  context: { nowIso: '2026-05-01T12:00:00.000Z' },
});
assert.strictEqual(defaultRanked.length, 5, 'Default results must never exceed five pins.');
assert.ok(defaultRanked.every((item) => ['A', 'B'].includes(item.confidenceGrade)));

const expandedRanked = rankCampScoutCandidates(manyStrongCandidates, {
  expandedResults: true,
  expandedLimit: 50,
  context: { nowIso: '2026-05-01T12:00:00.000Z' },
});
assert.strictEqual(expandedRanked.length, 10, 'Expanded results must never exceed ten pins.');

const mixedCandidates = [
  candidate('a-good', { sourceType: 'official_mapped' }),
  candidate('b-strong', { accessConfidence: 76, legalityConfidence: 82, remotenessScore: 76 }),
  candidate('b-weak', {
    sourceType: 'ecs_inferred',
    accessConfidence: 70,
    legalityConfidence: 72,
    remotenessScore: 70,
    slopeEstimate: 5,
    safetyRiskScore: 15,
  }),
  candidate('c-hidden', {
    sourceType: 'unknown',
    accessConfidence: 55,
    legalityConfidence: 55,
    remotenessScore: 55,
    slopeEstimate: 8,
    safetyRiskScore: 35,
  }),
  candidate('d-hidden', {
    sourceType: 'unknown',
    accessConfidence: 25,
    legalityConfidence: 25,
    remotenessScore: 25,
    slopeEstimate: 18,
    safetyRiskScore: 80,
  }),
];

const defaultFiltered = rankCampScoutCandidates(mixedCandidates, {
  includeUnknownSource: true,
  context: { nowIso: '2026-05-01T12:00:00.000Z' },
});
assert.ok(defaultFiltered.some((item) => item.id === 'a-good'));
assert.ok(defaultFiltered.some((item) => item.id === 'b-strong'));
assert.ok(!defaultFiltered.some((item) => item.id === 'c-hidden'));
assert.ok(!defaultFiltered.some((item) => item.id === 'd-hidden'));
assert.ok(
  defaultFiltered.every(
    (item) =>
      item.confidenceGrade &&
      item.reasons.length >= 2 &&
      item.reasons.length <= 4,
  ),
  'Every shown pin needs a confidence grade and 2-4 reasons.',
);

const expandedFiltered = rankCampScoutCandidates(mixedCandidates, {
  expandedResults: true,
  includeUnknownSource: true,
  context: { nowIso: '2026-05-01T12:00:00.000Z' },
});
assert.ok(expandedFiltered.some((item) => item.id === 'c-hidden'));
assert.ok(!expandedFiltered.some((item) => item.id === 'd-hidden'));

const cautionCandidate = scoreCampScoutCandidate(
  candidate('caution', {
    sourceType: 'ecs_inferred',
    accessConfidence: 45,
    legalityConfidence: 62,
    terrainConfidence: 40,
    slopeEstimate: undefined,
    isMapDataStale: true,
    mapDataCompleteness: 45,
    seasonalRiskPossible: true,
    offlineEstimate: true,
  }),
  { nowIso: '2026-05-01T12:00:00.000Z' },
);
assert.ok(cautionCandidate.cautions.some((text) => text.includes('Legal status uncertain')));
assert.ok(cautionCandidate.cautions.some((text) => text.includes('Access uncertain')));
assert.ok(cautionCandidate.cautions.some((text) => text.includes('Terrain confidence limited')));
assert.ok(cautionCandidate.cautions.some((text) => text.includes('ECS inferred')));
assert.ok(cautionCandidate.cautions.some((text) => text.includes('Low data coverage')));
assert.ok(cautionCandidate.cautions.some((text) => text.includes('Seasonal risk possible')));
assert.ok(cautionCandidate.cautions.some((text) => text.includes('Offline estimate')));

const tieRanked = rankCampScoutCandidates([
  candidate('tie-b'),
  candidate('tie-a'),
]);
assert.deepStrictEqual(
  tieRanked.map((item) => item.id).slice(0, 2),
  ['tie-a', 'tie-b'],
  'Stable tie ranking should fall back to candidate id.',
);

const remoteRanked = rankCampScoutCandidates([
  candidate('remote-close', {
    sourceType: 'ecs_inferred',
    remotenessScore: 78,
    distanceFromPavementMiles: 0.5,
    distanceFromNearestRoadMiles: 0.4,
    accessConfidence: 82,
    legalityConfidence: 82,
  }),
  candidate('remote-deep', {
    sourceType: 'ecs_inferred',
    remotenessScore: 82,
    distanceFromPavementMiles: 9,
    distanceFromNearestRoadMiles: 1.8,
    accessConfidence: 80,
    legalityConfidence: 82,
    crowdingScore: 8,
  }),
], {
  filterMode: 'remote',
  context: { nowIso: '2026-05-01T12:00:00.000Z' },
});
assert.equal(remoteRanked[0].id, 'remote-deep', 'Remote mode should prefer deeper pavement separation.');

const easierAccessRanked = rankCampScoutCandidates([
  candidate('access-hard', {
    distanceFromNearestRoadMiles: 4.8,
    accessConfidence: 62,
    slopeEstimate: 9,
    remotenessScore: 90,
  }),
  candidate('access-easy', {
    distanceFromNearestRoadMiles: 0.6,
    accessConfidence: 88,
    slopeEstimate: 3,
    remotenessScore: 68,
  }),
], {
  filterMode: 'easier_access',
  context: { nowIso: '2026-05-01T12:00:00.000Z' },
});
assert.equal(easierAccessRanked[0].id, 'access-easy', 'Easier Access should prefer plausible approach access.');

const officialOnlyRanked = rankCampScoutCandidates([
  candidate('official-kept', { sourceType: 'official_mapped' }),
  candidate('community-hidden', { sourceType: 'community_suggested' }),
  candidate('ecs-hidden', { sourceType: 'ecs_inferred' }),
], {
  filterMode: 'official_only',
  context: { nowIso: '2026-05-01T12:00:00.000Z' },
});
assert.deepStrictEqual(officialOnlyRanked.map((item) => item.id), ['official-kept']);
const officialOnlyNoFallback = rankCampScoutCandidates([
  candidate('ecs-fallback-blocked', {
    sourceType: 'ecs_inferred',
    accessConfidence: 40,
    legalityConfidence: 35,
    remotenessScore: 50,
    legalityStatus: 'unknown_needs_verification',
  }),
], {
  filterMode: 'official_only',
  expandedResults: true,
  allowLowConfidenceFallback: true,
  context: { nowIso: '2026-05-01T12:00:00.000Z' },
});
assert.deepStrictEqual(
  officialOnlyNoFallback.map((item) => item.id),
  [],
  'Official Only mode must not show inferred/fallback candidates when no official source exists.',
);

const communityOffRanked = rankCampScoutCandidates([
  candidate('official-visible', { sourceType: 'official_mapped' }),
  candidate('community-off', { sourceType: 'community_suggested' }),
], {
  includeCommunitySuggestions: false,
  context: { nowIso: '2026-05-01T12:00:00.000Z' },
});
assert.ok(!communityOffRanked.some((item) => item.id === 'community-off'));

console.log('Camp Scout scoring checks passed.');
