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
  buildTrailPackConfidenceInputFromFeedback,
  buildTrailPackConfidenceInputsFromFeedback,
  clearTrailPackFeedbackForTests,
  getTrailPackFeedbackSnapshot,
  mapTrailPackIssueReasonToFeedbackType,
  submitTrailPackFeedback,
} = require(path.join(root, 'lib', 'explore', 'trailPackFeedback.ts'));
const {
  scoreECSTrailPackConfidence,
} = require(path.join(root, 'lib', 'explore', 'trailPackConfidence.ts'));

function makePack(overrides = {}) {
  return {
    id: 'feedback-pack',
    name: 'Feedback Pack',
    source: 'community_reviewed',
    routeType: 'loop',
    centerCoordinate: { latitude: 39.25, longitude: -120.17 },
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-120.17, 39.25],
        [-120.16, 39.26],
        [-120.15, 39.25],
        [-120.17, 39.25],
      ],
    },
    distanceMiles: 10,
    estimatedDurationMinutes: 120,
    difficulty: 'moderate',
    vehicleFit: ['4x4 recommended'],
    confidenceScore: 0,
    confidenceReasons: [],
    lastVerifiedAt: new Date().toISOString(),
    positiveFeedbackCount: 1,
    negativeFeedbackCount: 0,
    completionCount: 0,
    reviewStatus: 'approved',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function withNavigatorOnline(value, run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: value },
    configurable: true,
  });
  try {
    run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, 'navigator', descriptor);
    } else {
      delete globalThis.navigator;
    }
  }
}

clearTrailPackFeedbackForTests();

const completed = submitTrailPackFeedback({
  trailPackId: 'feedback-pack',
  userId: 'driver-1',
  type: 'completed',
  source: 'guidance_completion',
});
assert.strictEqual(completed.ok, true, 'Completed feedback should be recorded');

const saved = submitTrailPackFeedback({
  trailPackId: 'feedback-pack',
  userId: 'driver-1',
  type: 'saved',
});
assert.strictEqual(saved.ok, true, 'Saved feedback should be recorded as a structured event');

const recommended = submitTrailPackFeedback({
  trailPackId: 'feedback-pack',
  userId: 'driver-1',
  type: 'recommended',
});
assert.strictEqual(recommended.ok, true, 'Recommend feedback should be recorded');

const duplicateRecommended = submitTrailPackFeedback({
  trailPackId: 'feedback-pack',
  userId: 'driver-1',
  type: 'recommended',
});
assert.strictEqual(duplicateRecommended.ok, false, 'Duplicate recommend should be prevented');
assert.strictEqual(duplicateRecommended.duplicate, true);

const snapshotAfterPositive = getTrailPackFeedbackSnapshot();
assert.strictEqual(snapshotAfterPositive.length, 3, 'Duplicate feedback should not create a fourth event');

const positiveInput = buildTrailPackConfidenceInputFromFeedback('feedback-pack', snapshotAfterPositive);
assert.strictEqual(positiveInput.saveCount, 1, 'Saved route feedback should feed confidence inputs');
assert.strictEqual(
  positiveInput.independentConfirmationCount,
  3,
  'Guidance-tied completion should carry extra confidence weight',
);

const baseConfidence = scoreECSTrailPackConfidence(makePack());
const feedbackConfidence = scoreECSTrailPackConfidence(makePack(), positiveInput);
assert(
  feedbackConfidence.score > baseConfidence.score,
  'Completed and recommended feedback should improve Trail Pack confidence',
);

assert.strictEqual(
  mapTrailPackIssueReasonToFeedbackType('closure'),
  'closure_concern',
  'Closure quick reason should map to structured closure feedback',
);

const closureReport = submitTrailPackFeedback({
  trailPackId: 'feedback-pack',
  userId: 'driver-2',
  type: 'closure_concern',
  note: 'Gate signed closed at the north spur.',
});
assert.strictEqual(closureReport.ok, true, 'Closure issue report should be recorded');

const privateLandReport = submitTrailPackFeedback({
  trailPackId: 'feedback-pack',
  userId: 'driver-4',
  type: mapTrailPackIssueReasonToFeedbackType('private_land'),
});
assert.strictEqual(privateLandReport.ok, true, 'Private land concern should be recorded');

const issueInput = buildTrailPackConfidenceInputFromFeedback('feedback-pack');
assert.strictEqual(issueInput.feedbackNeedsReview, true, 'Closure/private land reports should flag review');
assert.strictEqual(issueInput.closureStatus, 'restricted', 'Closure reports should reduce confidence immediately');
assert(
  issueInput.feedbackBlockers.includes('Community closure concern requires review'),
  'Closure concern should create a confidence blocker',
);
assert(
  issueInput.feedbackBlockers.includes('Community private-land concern requires review'),
  'Private land concern should create a confidence blocker',
);

const issueConfidence = scoreECSTrailPackConfidence(makePack(), issueInput);
assert.strictEqual(issueConfidence.band, 'low', 'Closure/private land reports should block public promotion');
assert(
  issueConfidence.blockers.includes('Community closure concern requires review'),
  'Feedback blockers should be visible in confidence output',
);

const byTrailPack = buildTrailPackConfidenceInputsFromFeedback(getTrailPackFeedbackSnapshot());
assert.strictEqual(
  byTrailPack['feedback-pack'].feedbackNeedsReview,
  true,
  'Feedback inputs should be buildable for Explore discovery',
);

withNavigatorOnline(false, () => {
  const offlineResult = submitTrailPackFeedback({
    trailPackId: 'feedback-pack',
    userId: 'driver-3',
    type: 'positive',
  });
  assert.strictEqual(offlineResult.ok, false, 'Feedback should fail cleanly when offline');
  assert.strictEqual(offlineResult.offline, true);
});

console.log('Trail Pack feedback checks passed');
