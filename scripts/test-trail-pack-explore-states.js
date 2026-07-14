const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('/discoverEngine') || request.endsWith('\\discoverEngine') || request === '../discoverEngine') {
    return {};
  }
  return originalLoad(request, parent, isMain);
};

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;
require.extensions['.tsx'] = compileTypescript;

const {
  getDiscoverableTrailPacks,
} = require(path.join(root, 'lib', 'explore', 'trailPacks.ts'));

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function makePack(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: 'trail-pack-state-fixture',
    name: 'Trail Pack State Fixture',
    source: 'ecs_validated',
    routeType: 'loop',
    centerCoordinate: { latitude: 38.5, longitude: -109.5 },
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-109.5, 38.5],
        [-109.51, 38.51],
        [-109.5, 38.5],
      ],
    },
    distanceMiles: 5,
    estimatedDurationMinutes: 70,
    difficulty: 'moderate',
    vehicleFit: ['high clearance'],
    confidenceScore: 0,
    confidenceReasons: [],
    positiveFeedbackCount: 0,
    negativeFeedbackCount: 0,
    completionCount: 0,
    reviewStatus: 'approved',
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const userCoordinate = { latitude: 38.5, longitude: -109.5 };
const strongConfidenceInput = {
  independentConfirmationCount: 6,
  closureStatus: 'clear',
  weatherStatus: 'clear',
  fireSmokeStatus: 'clear',
  routeSnapStatus: 'matched',
  offlineCacheReady: true,
};

const pending = makePack({ id: 'pending-owner-pack', reviewStatus: 'pending_review' });
const rejected = makePack({ id: 'rejected-pack', reviewStatus: 'rejected' });
const approved = makePack({ id: 'approved-pack', reviewStatus: 'approved', positiveFeedbackCount: 18, completionCount: 12 });

const publicVisible = getDiscoverableTrailPacks(
  [pending, rejected, approved],
  userCoordinate,
  25,
  {
    confidenceInputsByTrailPackId: {
      approved: strongConfidenceInput,
    },
  },
);
assert.deepStrictEqual(
  publicVisible.map((pack) => pack.id),
  ['approved-pack'],
  'Public Explore suggestions should only show approved Trail Packs',
);

const ownerVisible = getDiscoverableTrailPacks(
  [pending],
  userCoordinate,
  25,
  {
    includeOwnDrafts: true,
    ownTrailPackIds: ['pending-owner-pack'],
  },
);
assert.strictEqual(ownerVisible.length, 1, 'Owners should still see their own pending Trail Pack');
assert.strictEqual(ownerVisible[0].reviewStatus, 'pending_review');

const moderateOnly = makePack({
  id: 'moderate-only-pack',
  reviewStatus: 'approved',
  lastVerifiedAt: undefined,
});
assert.strictEqual(
  getDiscoverableTrailPacks([moderateOnly], userCoordinate, 25).length,
  0,
  'Moderate Trail Packs should not be promoted by default',
);
assert.strictEqual(
  getDiscoverableTrailPacks([moderateOnly], userCoordinate, 25, { includeBroaderResults: true }).length,
  1,
  'Broader Trail Pack discovery should detect nearby lower-confidence results',
);

const discover = read(path.join('app', '(tabs)', 'discover.tsx'));
const previewModal = read(path.join('components', 'trailPacks', 'TrailPackPreviewModal.tsx'));
assert(discover.includes('Scanning approved ECS Trail Packs within selected radius…'));
assert(discover.includes('No live reviewed Trail Packs found within this radius.'));
assert(discover.includes('Live Trail Packs are not available from reviewed sources yet.'));
assert(discover.includes('Trail Packs need GPS or an internal search area to filter verified routes by radius.'));
assert(discover.includes('Only lower-confidence Trail Packs were found nearby. Expand your radius or enable broader results.'));
assert(
  previewModal.includes('This is your pending route recommendation.') &&
    previewModal.includes('It is not visible to other users until ECS review approves it.'),
  'Pending Trail Packs should remain explicitly private until ECS review approves them.',
);

console.log('Trail Pack Explore state checks passed');
