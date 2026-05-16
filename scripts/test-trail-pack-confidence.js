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
  scoreECSTrailPackConfidence,
  shouldPromoteTrailPackByDefault,
} = require(path.join(root, 'lib', 'explore', 'trailPackConfidence.ts'));
const {
  getDiscoverableTrailPacks,
} = require(path.join(root, 'lib', 'explore', 'trailPacks.ts'));

function makePack(overrides = {}) {
  return {
    id: 'confidence-fixture',
    name: 'Confidence Fixture',
    source: 'ecs_submitted',
    routeType: 'point_to_point',
    centerCoordinate: { latitude: 38.5, longitude: -109.5 },
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-109.5, 38.5],
        [-109.51, 38.51],
        [-109.52, 38.52],
      ],
    },
    distanceMiles: 8,
    estimatedDurationMinutes: 95,
    difficulty: 'moderate',
    vehicleFit: ['high clearance'],
    confidenceScore: 0,
    confidenceReasons: [],
    lastVerifiedAt: new Date().toISOString(),
    positiveFeedbackCount: 0,
    negativeFeedbackCount: 0,
    completionCount: 0,
    reviewStatus: 'approved',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const noFeedback = scoreECSTrailPackConfidence(makePack());
assert.strictEqual(noFeedback.band, 'moderate', 'No-feedback route should not be high confidence by default');
assert(
  noFeedback.warnings.includes('Community confirmations limited'),
  'No-feedback route should honestly warn about limited community validation',
);
assert(
  noFeedback.warnings.includes('Closure validation unavailable') &&
    noFeedback.warnings.includes('Weather context unavailable'),
  'Unavailable provider context should be represented as warnings, not invented validation',
);
assert.strictEqual(shouldPromoteTrailPackByDefault(noFeedback), false);

const highPositive = scoreECSTrailPackConfidence(
  makePack({
    id: 'high-positive',
    source: 'ecs_validated',
    positiveFeedbackCount: 30,
    completionCount: 16,
    lastVerifiedAt: new Date().toISOString(),
  }),
  {
    independentConfirmationCount: 5,
    saveCount: 12,
    lastCompletedAt: new Date().toISOString(),
    closureStatus: 'clear',
    weatherStatus: 'clear',
    fireSmokeStatus: 'clear',
    routeSnapStatus: 'matched',
    offlineCacheReady: true,
    vehicleFitMatchesSelectedProfile: true,
  },
);
assert.strictEqual(highPositive.band, 'verified', 'Strong positive signal should reach verified confidence');
assert.strictEqual(shouldPromoteTrailPackByDefault(highPositive), true);
assert(
  highPositive.reasons.some((reason) => /completed by 16/.test(reason)) &&
    highPositive.reasons.includes('No active closure conflict found'),
  'High confidence reasons should cite real positive and closure-clear inputs',
);

const negativeFeedback = scoreECSTrailPackConfidence(
  makePack({
    id: 'negative-feedback',
    positiveFeedbackCount: 2,
    negativeFeedbackCount: 12,
    completionCount: 1,
  }),
);
assert(
  negativeFeedback.score < noFeedback.score,
  'Negative feedback should reduce Trail Pack confidence',
);
assert(
  negativeFeedback.warnings.some((warning) => /negative report/.test(warning)),
  'Negative feedback should produce a review warning',
);

const staleRoute = scoreECSTrailPackConfidence(
  makePack({
    id: 'stale-route',
    positiveFeedbackCount: 8,
    completionCount: 4,
    lastVerifiedAt: '2023-01-01T00:00:00.000Z',
    createdAt: '2023-01-01T00:00:00.000Z',
  }),
);
assert(
  staleRoute.warnings.includes('Trail Pack verification is stale'),
  'Stale route should carry a stale verification warning',
);
assert.notStrictEqual(staleRoute.band, 'verified', 'Stale route should not be verified');

const missingGeometry = scoreECSTrailPackConfidence(
  makePack({
    id: 'missing-geometry',
    routeGeometry: undefined,
    distanceMiles: 5,
  }),
);
assert.strictEqual(missingGeometry.band, 'low');
assert(
  missingGeometry.blockers.includes('Route geometry is incomplete'),
  'Missing geometry should be a blocker',
);
assert.strictEqual(shouldPromoteTrailPackByDefault(missingGeometry), false);

const impossibleJump = scoreECSTrailPackConfidence(
  makePack({
    id: 'impossible-jump',
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-109.5, 38.5],
        [-70.0, 45.0],
      ],
    },
  }),
);
assert(
  impossibleJump.blockers.includes('Route geometry contains impossible jumps'),
  'Impossible geometry jumps should block promotion',
);

const restricted = scoreECSTrailPackConfidence(
  makePack({
    id: 'restricted',
    positiveFeedbackCount: 20,
    completionCount: 8,
  }),
  { closureStatus: 'restricted' },
);
assert.strictEqual(restricted.band, 'low');
assert(
  restricted.blockers.includes('Route crosses restricted area'),
  'Restricted closure conflicts should block public suggestions',
);

const user = { latitude: 38.5, longitude: -109.5 };
const discoverable = getDiscoverableTrailPacks([
  makePack({ id: 'moderate-only', positiveFeedbackCount: 0, completionCount: 0 }),
  makePack({
    id: 'promoted',
    source: 'ecs_validated',
    positiveFeedbackCount: 30,
    completionCount: 16,
  }),
], user, 50, {
  confidenceInputsByTrailPackId: {
    promoted: {
      independentConfirmationCount: 4,
      closureStatus: 'clear',
      weatherStatus: 'clear',
      fireSmokeStatus: 'clear',
      routeSnapStatus: 'matched',
      offlineCacheReady: true,
    },
  },
});
assert.deepStrictEqual(
  discoverable.map((pack) => pack.id),
  ['promoted'],
  'Explore discovery should promote only high/verified Trail Packs by default',
);
assert.strictEqual(discoverable[0].evaluatedConfidence.band, 'verified');

const broader = getDiscoverableTrailPacks([
  makePack({ id: 'moderate-only', positiveFeedbackCount: 0, completionCount: 0 }),
], user, 50, { includeBroaderResults: true });
assert.strictEqual(broader.length, 1, 'Broader results can include moderate Trail Packs');
assert.strictEqual(broader[0].evaluatedConfidence.band, 'moderate');

console.log('Trail Pack confidence checks passed');
