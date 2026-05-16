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
  applyTrailPackReviewAction,
  buildTrailPackReviewStatesFromFeedback,
  isTrailPackPubliclyDiscoverable,
  trailPackReviewQueueStore,
  TRAIL_PACK_REVIEW_REASON_LABELS,
} = require(path.join(root, 'lib', 'explore', 'trailPackReviewQueue.ts'));
const {
  clearTrailPackFeedbackForTests,
  getTrailPackFeedbackSnapshot,
  submitTrailPackFeedback,
} = require(path.join(root, 'lib', 'explore', 'trailPackFeedback.ts'));
const {
  getDiscoverableTrailPacks,
} = require(path.join(root, 'lib', 'explore', 'trailPacks.ts'));

function makePack(overrides = {}) {
  return {
    id: 'review-fixture',
    name: 'Review Fixture',
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
    distanceMiles: 6,
    estimatedDurationMinutes: 80,
    difficulty: 'moderate',
    vehicleFit: ['high clearance'],
    confidenceScore: 0,
    confidenceReasons: [],
    lastVerifiedAt: new Date().toISOString(),
    positiveFeedbackCount: 35,
    negativeFeedbackCount: 0,
    completionCount: 20,
    reviewStatus: 'approved',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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

const pending = makePack({ id: 'pending', reviewStatus: 'pending_review' });
const approved = makePack({ id: 'approved', reviewStatus: 'approved' });
const rejected = makePack({ id: 'rejected', reviewStatus: 'rejected' });
const needsMoreData = makePack({ id: 'needs-more-data', reviewStatus: 'needs_more_data' });

assert.strictEqual(isTrailPackPubliclyDiscoverable(approved), true);
assert.strictEqual(isTrailPackPubliclyDiscoverable(pending), false);
assert.strictEqual(isTrailPackPubliclyDiscoverable(rejected), false);
assert.strictEqual(isTrailPackPubliclyDiscoverable(needsMoreData), false);

const visible = getDiscoverableTrailPacks(
  [pending, approved, rejected, needsMoreData],
  userCoordinate,
  25,
  {
    confidenceInputsByTrailPackId: {
      approved: strongConfidenceInput,
    },
  },
);
assert.deepStrictEqual(
  visible.map((pack) => pack.id),
  ['approved'],
  'Only approved Trail Packs should appear in public Explore suggestions',
);

const approval = applyTrailPackReviewAction(pending, {
  reviewerId: 'reviewer-1',
  action: 'approve',
  reason: 'approved_with_caution',
  timestamp: '2026-02-01T00:00:00.000Z',
});
assert.strictEqual(approval.trailPack.reviewStatus, 'approved');
assert.strictEqual(approval.state.publicSuppressed, false);
assert.strictEqual(approval.event.reviewerId, 'reviewer-1');
assert.strictEqual(approval.event.reason, 'approved_with_caution');

const rejection = applyTrailPackReviewAction(approved, {
  action: 'reject',
  reason: 'poor_route_quality',
});
assert.strictEqual(rejection.trailPack.reviewStatus, 'rejected');
assert.strictEqual(rejection.state.publicSuppressed, true);

const moreData = applyTrailPackReviewAction(approved, {
  action: 'request_more_data',
  reason: 'insufficient_geometry',
});
assert.strictEqual(moreData.trailPack.reviewStatus, 'needs_more_data');
assert.strictEqual(moreData.state.publicSuppressed, true);

const duplicate = applyTrailPackReviewAction(approved, {
  action: 'merge_duplicate',
  reason: 'duplicate',
  duplicateOfTrailPackId: 'canonical-pack',
});
assert.strictEqual(duplicate.trailPack.reviewStatus, 'rejected');
assert.strictEqual(duplicate.state.duplicateOfTrailPackId, 'canonical-pack');
assert.strictEqual(duplicate.state.publicSuppressed, true);

clearTrailPackFeedbackForTests();
const issueReport = submitTrailPackFeedback({
  trailPackId: 'approved',
  userId: 'driver-issue',
  type: 'private_land_concern',
});
assert.strictEqual(issueReport.ok, true, 'Private-land feedback report should be stored');
const reviewStates = buildTrailPackReviewStatesFromFeedback([approved], getTrailPackFeedbackSnapshot());
assert.strictEqual(
  reviewStates.approved.reviewStatus,
  'needs_more_data',
  'Private-land feedback should move an approved Trail Pack back into review',
);
assert.strictEqual(reviewStates.approved.publicSuppressed, true);
assert.deepStrictEqual(
  getDiscoverableTrailPacks(
    [approved],
    userCoordinate,
    25,
    {
      confidenceInputsByTrailPackId: {
        approved: strongConfidenceInput,
      },
      reviewStatesByTrailPackId: reviewStates,
    },
  ),
  [],
  'Issue reports should suppress a route from public Explore recommendations',
);

trailPackReviewQueueStore.clearForTests();
const stored = trailPackReviewQueueStore.recordAction(approved, {
  reviewerId: 'reviewer-2',
  action: 'flag_closure',
  reason: 'seasonal_closure_issue',
});
const snapshot = trailPackReviewQueueStore.getSnapshot();
assert.strictEqual(stored.trailPack.reviewStatus, 'needs_more_data');
assert.strictEqual(snapshot.actions.length, 1, 'Review actions should be stored as queue events');
assert.strictEqual(snapshot.states.approved.reviewStatus, 'needs_more_data');

assert.strictEqual(TRAIL_PACK_REVIEW_REASON_LABELS.duplicate, 'Duplicate');
assert.strictEqual(TRAIL_PACK_REVIEW_REASON_LABELS.restricted_private_land, 'Restricted/private land');
assert.strictEqual(TRAIL_PACK_REVIEW_REASON_LABELS.sensitive_campsite_location, 'Sensitive campsite/location');

console.log('Trail Pack review queue checks passed');
