const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

require.extensions['.ts'] = function compileTypeScript(module, filename) {
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

const lifecycle = require(path.join(root, 'lib/expedition/expeditionLifecycle.ts'));

const allowedTransitions = {
  draft: ['planned', 'cancelled'],
  planned: ['draft', 'ready', 'cancelled'],
  ready: ['planned', 'active', 'cancelled'],
  active: ['paused', 'completing', 'recovery-required', 'cancelled'],
  paused: ['active', 'completing', 'recovery-required', 'cancelled'],
  completing: ['completed', 'active', 'recovery-required'],
  completed: ['archived'],
  archived: [],
  cancelled: ['archived'],
  'recovery-required': ['active', 'paused', 'completing', 'cancelled'],
};

for (const [from, allowed] of Object.entries(allowedTransitions)) {
  assert.deepStrictEqual(lifecycle.getAllowedExpeditionTransitions(from), allowed);
  for (const to of Object.keys(allowedTransitions)) {
    const decision = lifecycle.decideExpeditionTransition(from, to);
    assert.strictEqual(
      decision.accepted,
      from === to || allowed.includes(to),
      `${from} -> ${to} should follow the canonical graph.`,
    );
    if (from === to) assert.strictEqual(decision.idempotent, true);
  }
}

assert.strictEqual(
  lifecycle.decideExpeditionTransition('completed', 'active').accepted,
  false,
  'Completed outcomes cannot reactivate through a normal transition.',
);
assert.strictEqual(
  lifecycle.decideExpeditionTransition('completed', 'active', 'correction').accepted,
  true,
  'A completed outcome can only reactivate through an explicit correction.',
);

const observedAt = '2026-07-12T12:00:00.000Z';
const missingPlan = lifecycle.createCanonicalExpeditionPlan({
  expeditionId: 'expedition-1',
  title: 'Canonical lifecycle test',
  createdAt: observedAt,
  updatedAt: observedAt,
});
assert.deepStrictEqual(
  lifecycle.validateCanonicalExpeditionPlan(missingPlan).blockers,
  ['missing_vehicle', 'missing_route'],
);
assert.strictEqual(missingPlan.sourceTruth.origin, 'manual');
assert.strictEqual(missingPlan.sourceTruth.policyKey, 'manual_user_state');

let document = lifecycle.createCanonicalExpeditionLifecycle({
  plan: missingPlan,
  initialState: 'planned',
  cause: 'wizard',
  occurredAt: observedAt,
});
let result = lifecycle.transitionExpeditionLifecycle(document, 'ready', {
  idempotencyKey: 'ready-without-inputs',
  cause: 'operator',
});
assert.strictEqual(result.decision.accepted, false);
assert.strictEqual(result.decision.reason, 'missing_vehicle');

document = lifecycle.updateCanonicalExpeditionPlan(document, {
  activeVehicleId: 'vehicle-1',
}, '2026-07-12T12:01:00.000Z');
result = lifecycle.transitionExpeditionLifecycle(document, 'ready', {
  idempotencyKey: 'ready-without-route',
  cause: 'operator',
});
assert.strictEqual(result.decision.reason, 'missing_route');

document = lifecycle.updateCanonicalExpeditionPlan(document, {
  routeAssetId: 'route-1',
}, '2026-07-12T12:02:00.000Z');
result = lifecycle.transitionExpeditionLifecycle(document, 'ready', {
  idempotencyKey: 'ready-with-inputs',
  cause: 'operator',
});
assert.strictEqual(result.decision.accepted, true);
document = result.lifecycle;
result = lifecycle.transitionExpeditionLifecycle(document, 'active', {
  idempotencyKey: 'activate-expedition-1',
  cause: 'operator',
});
assert.strictEqual(result.decision.accepted, true);
document = result.lifecycle;

const duplicateActivation = lifecycle.transitionExpeditionLifecycle(document, 'active', {
  idempotencyKey: 'activate-expedition-1',
  cause: 'operator',
});
assert.strictEqual(duplicateActivation.decision.idempotent, true);
const conflictingActivation = lifecycle.transitionExpeditionLifecycle(document, 'paused', {
  idempotencyKey: 'activate-expedition-1',
  cause: 'operator',
});
assert.strictEqual(conflictingActivation.decision.reason, 'idempotency_conflict');

const proposalResult = lifecycle.proposeExpeditionTransition(document, 'paused', {
  idempotencyKey: 'geofence-proposal-1',
  cause: 'geofence',
  reason: 'Test proposal',
});
const duplicateProposal = lifecycle.proposeExpeditionTransition(proposalResult.lifecycle, 'paused', {
  idempotencyKey: 'geofence-proposal-1',
  cause: 'geofence',
});
assert.strictEqual(duplicateProposal.idempotent, true);
const resolvedProposal = lifecycle.resolveExpeditionTransitionProposal(
  proposalResult.lifecycle,
  proposalResult.proposal.id,
  true,
  { cause: 'geofence', actor: 'geofence', allowDegradedPlanning: true },
);
assert.strictEqual(resolvedProposal.lifecycle.state, 'paused');
document = lifecycle.transitionExpeditionLifecycle(resolvedProposal.lifecycle, 'active', {
  idempotencyKey: 'resume-after-proposal',
  cause: 'operator',
  allowDegradedPlanning: true,
}).lifecycle;

document = lifecycle.transitionExpeditionLifecycle(document, 'recovery-required', {
  idempotencyKey: 'recovery-required-1',
  cause: 'recovery',
  reason: 'Recovery packet requires operator action.',
  allowDegradedPlanning: true,
}).lifecycle;
assert.strictEqual(document.state, 'recovery-required');
document = lifecycle.transitionExpeditionLifecycle(document, 'active', {
  idempotencyKey: 'recovery-cleared-1',
  cause: 'recovery',
  allowDegradedPlanning: true,
}).lifecycle;

const snapshot = lifecycle.buildCanonicalExpeditionDebriefSnapshot({
  lifecycle: document,
  capturedAt: '2026-07-12T13:00:00.000Z',
  summary: { readiness: { final_score: 82 } },
  routes: Array.from({ length: 25 }, (_, index) => ({
    id: `route-${index}`,
    name: `Route ${index}`,
    source: 'manual',
    distanceMiles: index,
    etaHours: null,
  })),
  waypoints: Array.from({ length: 120 }, (_, index) => ({
    id: `waypoint-${index}`,
    title: `Waypoint ${index}`,
    kind: 'waypoint',
    occurredAt: null,
  })),
});
assert.strictEqual(snapshot.privacy.exactCoordinatesIncluded, false);
assert.strictEqual(snapshot.privacy.restrictedFieldsRedacted, true);
assert.strictEqual(snapshot.routes.length, lifecycle.MAX_EXPEDITION_DEBRIEF_ROUTES);
assert.strictEqual(snapshot.waypoints.length, lifecycle.MAX_EXPEDITION_DEBRIEF_WAYPOINTS);

const completionKey = lifecycle.buildExpeditionCompletionIdempotencyKey(document);
let completion = lifecycle.beginExpeditionCompletionTransaction(document, {
  idempotencyKey: completionKey,
  fieldLogId: '11111111-1111-4111-8111-111111111111',
  snapshot,
  requestedAt: '2026-07-12T13:00:00.000Z',
  completedAt: '2026-07-12T13:00:00.000Z',
  undoWindowMs: 5000,
});
assert.strictEqual(completion.lifecycle.state, 'completing');
assert.strictEqual(completion.lifecycle.completion.status, 'pending');

const restored = lifecycle.normalizeCanonicalExpeditionLifecycle(
  JSON.parse(JSON.stringify(completion.lifecycle)),
  { expeditionId: 'expedition-1', title: 'Canonical lifecycle test', legacyStatus: 'active' },
);
assert.strictEqual(restored.state, 'completing', 'A crash/restart should restore the pending completion state.');
const duplicateCompletion = lifecycle.beginExpeditionCompletionTransaction(restored, {
  idempotencyKey: completionKey,
  fieldLogId: '11111111-1111-4111-8111-111111111111',
  snapshot,
});
assert.strictEqual(duplicateCompletion.decision.idempotent, true);

const undone = lifecycle.undoExpeditionCompletionTransaction(restored, {
  idempotencyKey: completionKey,
  revertedAt: '2026-07-12T13:00:03.000Z',
  reason: 'Operator correction test.',
});
assert.strictEqual(undone.lifecycle.state, 'active');
assert.strictEqual(undone.lifecycle.completion.status, 'reverted');
assert.strictEqual(undone.lifecycle.corrections.length, 1);

const secondKey = lifecycle.buildExpeditionCompletionIdempotencyKey(undone.lifecycle);
completion = lifecycle.beginExpeditionCompletionTransaction(undone.lifecycle, {
  idempotencyKey: secondKey,
  fieldLogId: '22222222-2222-4222-8222-222222222222',
  snapshot,
  requestedAt: '2026-07-12T14:00:00.000Z',
  completedAt: '2026-07-12T14:00:00.000Z',
  undoWindowMs: 0,
});
let committed = lifecycle.commitExpeditionCompletionTransaction(completion.lifecycle, {
  idempotencyKey: secondKey,
  committedAt: '2026-07-12T14:00:00.000Z',
});
assert.strictEqual(committed.lifecycle.state, 'completed');
assert.strictEqual(committed.lifecycle.completion.status, 'committed');
committed = lifecycle.commitExpeditionCompletionTransaction(committed.lifecycle, {
  idempotencyKey: secondKey,
  outcomeId: 'trip-outcome-1',
});
assert.strictEqual(committed.decision.idempotent, true);
assert.strictEqual(committed.lifecycle.completion.outcomeId, 'trip-outcome-1');

const archived = lifecycle.transitionExpeditionLifecycle(committed.lifecycle, 'archived', {
  idempotencyKey: 'archive-expedition-1',
  cause: 'archive',
});
assert.strictEqual(archived.lifecycle.state, 'archived');

const migrated = lifecycle.normalizeCanonicalExpeditionLifecycle(null, {
  expeditionId: 'legacy-completed',
  title: 'Legacy completed expedition',
  legacyStatus: 'completed',
  activeVehicleId: 'vehicle-legacy',
  routeAssetId: 'route-legacy',
});
assert.strictEqual(migrated.state, 'completed');
assert.strictEqual(migrated.schemaVersion, lifecycle.EXPEDITION_LIFECYCLE_SCHEMA_VERSION);

let boundedDocument = lifecycle.createCanonicalExpeditionLifecycle({
  plan: {
    expeditionId: 'bounded-expedition',
    activeVehicleId: 'vehicle-1',
    routeAssetId: 'route-1',
  },
  initialState: 'active',
  allowDegradedPlanning: true,
});
for (let index = 0; index < 100; index += 1) {
  const target = boundedDocument.state === 'active' ? 'paused' : 'active';
  boundedDocument = lifecycle.transitionExpeditionLifecycle(boundedDocument, target, {
    idempotencyKey: `bounded-${index}`,
    cause: 'system',
    allowDegradedPlanning: true,
  }).lifecycle;
}
assert.strictEqual(boundedDocument.transitions.length, lifecycle.MAX_EXPEDITION_TRANSITIONS);

console.log('Canonical Expedition lifecycle checks passed.');
