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
  aggregateCampScoutCandidates,
} = require(path.join(root, 'lib', 'campScout', 'campScoutAggregator.ts'));

const area = {
  id: 'test-area',
  title: 'Test Camp Scout Area',
  bounds: {
    north: 39.2,
    south: 39,
    east: -104.8,
    west: -105,
  },
};

function strongCandidate(id, latitude, longitude, overrides = {}) {
  return {
    id,
    title: `Candidate ${id}`,
    coordinate: { latitude, longitude },
    accessConfidence: 88,
    legalityConfidence: 90,
    remotenessScore: 82,
    terrainConfidence: 92,
    slopeEstimate: 2,
    distanceFromNearestRoadMiles: 1.1,
    distanceFromPavementMiles: 7,
    safetyRiskScore: 5,
    environmentalRiskScore: 5,
    knownConflictRiskScore: 0,
    mapDataCompleteness: 95,
    sourceTimestamp: '2026-04-20T12:00:00.000Z',
    ...overrides,
  };
}

const duplicateOfficial = strongCandidate('same-place', 39.1, -104.9, {
  sourceLabel: 'Official POI',
  sourceNote: 'Mapped campground source',
});
const duplicateCommunity = strongCandidate('same-place-user', 39.1004, -104.9004, {
  sourceLabel: 'Community report',
  sourceNote: 'Community confirms a nearby pull-off',
  legalityConfidence: 76,
});

const result = aggregateCampScoutCandidates({
  area,
  generatedAt: '2026-05-01T12:00:00.000Z',
  officialMappedCandidates: [
    duplicateOfficial,
    strongCandidate('official-2', 39.13, -104.92),
  ],
  communitySuggestedCandidates: [
    duplicateCommunity,
    strongCandidate('community-2', 39.15, -104.93),
  ],
  ecsInferredCandidates: [
    strongCandidate('ecs-1', 39.17, -104.94, {
      legalityConfidence: 84,
      accessConfidence: 86,
      remotenessScore: 90,
    }),
    strongCandidate('ecs-low', 39.18, -104.95, {
      accessConfidence: 42,
      legalityConfidence: 35,
      remotenessScore: 45,
      terrainConfidence: 40,
      safetyRiskScore: 55,
    }),
  ],
  importedRouteCandidates: [
    strongCandidate('gpx-1', 39.19, -104.96, {
      legalityConfidence: 82,
      accessConfidence: 84,
    }),
  ],
});

assert.equal(result.totalCandidatesConsidered, 7);
assert.equal(result.officialMappedCount, 2);
assert.equal(result.communitySuggestedCount, 2);
assert.equal(result.ecsInferredCount, 2);
assert.ok(result.candidatesShown.length <= 5, 'Default aggregation must cap shown pins.');
assert.ok(result.warnings.some((warning) => warning.includes('duplicate')));
assert.ok(result.hiddenLowConfidenceCount >= 1);
assert.ok(result.scanBounds);

const mergedPin = result.candidatesShown.find((candidate) =>
  candidate.mergedSourceTypes?.includes('official_mapped') &&
  candidate.mergedSourceTypes?.includes('community_suggested')
);
assert.ok(mergedPin, 'Nearby official and community candidates should merge.');
assert.equal(mergedPin.sourceType, 'official_mapped');
assert.ok(mergedPin.sourceNotes.some((note) => note.includes('Community confirms')));

const emptyResult = aggregateCampScoutCandidates({
  area,
  generatedAt: '2026-05-01T12:00:00.000Z',
  ecsInferredCandidates: [
    strongCandidate('weak-only', 39.11, -104.91, {
      accessConfidence: 20,
      legalityConfidence: 20,
      remotenessScore: 30,
      terrainConfidence: 25,
      safetyRiskScore: 80,
    }),
  ],
});

assert.equal(emptyResult.candidatesShown.length, 0);
assert.equal(emptyResult.summary, 'No high-confidence camp candidates found in this area.');
assert.ok(
  emptyResult.warnings.some((warning) =>
    warning.includes('Try widening the area'),
  ),
);

const officialOnlyEmpty = aggregateCampScoutCandidates({
  area,
  generatedAt: '2026-05-01T12:00:00.000Z',
  ecsInferredCandidates: [
    strongCandidate('ecs-only', 39.12, -104.91, {
      accessConfidence: 90,
      legalityConfidence: 90,
      remotenessScore: 88,
    }),
  ],
  communitySuggestedCandidates: [
    strongCandidate('community-only', 39.13, -104.92, {
      accessConfidence: 90,
      legalityConfidence: 90,
      remotenessScore: 88,
    }),
  ],
  filterOptions: {
    filterMode: 'official_only',
  },
});

assert.equal(officialOnlyEmpty.candidatesShown.length, 0);
assert.ok(
  officialOnlyEmpty.warnings.some((warning) =>
    warning.includes('official mapped'),
  ),
);

console.log('Camp Scout aggregator checks passed.');
