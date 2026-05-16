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
  getCommunityCampCandidatesForArea,
} = require(path.join(root, 'lib', 'campScout', 'campScoutCommunityAdapter.ts'));

const area = {
  id: 'community-adapter-test',
  bounds: {
    north: 40.2,
    south: 40,
    east: -104.8,
    west: -105,
  },
};

async function run() {
  const noBackend = await getCommunityCampCandidatesForArea(area, {
    includeCommunitySuggestions: true,
  });
  assert.deepStrictEqual(noBackend, [], 'Missing community backend should safely return no candidates.');

  const adapter = {
    getCommunityCampCandidatesForArea: () => [
      {
        id: 'approved-strong',
        title: 'Approved community camp',
        latitude: 40.1,
        longitude: -104.9,
        moderationStatus: 'approved',
        recommendationCount: 7,
        verificationCount: 3,
        lastVerifiedAt: '2026-04-20T12:00:00.000Z',
        negativeReportsCount: 1,
        photoCount: 2,
        accessConfidence: 84,
        legalityConfidence: 82,
        terrainConfidence: 78,
        remotenessScore: 76,
      },
      {
        id: 'pending-hidden',
        latitude: 40.11,
        longitude: -104.91,
        moderationStatus: 'pending',
        confidenceScore: 95,
      },
      {
        id: 'reported-hidden',
        latitude: 40.12,
        longitude: -104.92,
        moderationStatus: 'trusted',
        confidenceScore: 95,
        negativeReportsCount: 5,
      },
      {
        id: 'outside-hidden',
        latitude: 41,
        longitude: -104.9,
        moderationStatus: 'approved',
        confidenceScore: 95,
      },
      {
        id: 'weak-hidden',
        latitude: 40.13,
        longitude: -104.93,
        moderationStatus: 'trusted',
        confidenceScore: 55,
      },
    ],
  };

  const candidates = await getCommunityCampCandidatesForArea(
    area,
    { includeCommunitySuggestions: true },
    adapter,
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, 'community_suggested:approved-strong');
  assert.equal(candidates[0].sourceType, 'community_suggested');
  assert.equal(candidates[0].moderationStatus, 'approved');
  assert.equal(candidates[0].recommendationCount, 7);
  assert.equal(candidates[0].verificationCount, 3);
  assert.equal(candidates[0].negativeReportsCount, 1);
  assert.equal(candidates[0].photoCount, 2);
  assert.ok(candidates[0].confidenceScore >= 70);

  const disabled = await getCommunityCampCandidatesForArea(
    area,
    { includeCommunitySuggestions: false },
    adapter,
  );
  assert.deepStrictEqual(disabled, []);

  const officialOnly = await getCommunityCampCandidatesForArea(
    area,
    { filterMode: 'official_only' },
    adapter,
  );
  assert.deepStrictEqual(officialOnly, []);

  const unavailable = await getCommunityCampCandidatesForArea(
    area,
    { includeCommunitySuggestions: true },
    {
      getCommunityCampCandidatesForArea: () => {
        throw new Error('backend unavailable');
      },
    },
  );
  assert.deepStrictEqual(unavailable, [], 'Community backend errors must not block Camp Scout.');

  console.log('Camp Scout community adapter checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
