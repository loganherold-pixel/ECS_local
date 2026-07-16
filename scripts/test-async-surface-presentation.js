const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

global.__DEV__ = false;

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
};

function load(relativePath) {
  return require(path.join(process.cwd(), relativePath));
}

const {
  beginECSAsyncSurfaceRequest,
  cancelECSAsyncSurfaceRequest,
  createECSAsyncSurfaceState,
  disableECSAsyncSurface,
  settleECSAsyncSurfaceRequest,
} = load('lib/state/asyncSurfaceState.ts');

const {
  resolveECSAsyncSurfacePresentation,
} = load('lib/state/asyncSurfacePresentation.ts');

function begin(state, now = 100) {
  return beginECSAsyncSurfaceRequest(state, {
    now,
    provider: 'test-provider',
    fingerprintInput: { fixture: state.surfaceId, generation: state.generation + 1 },
  });
}

function settle(state, status, overrides = {}) {
  return settleECSAsyncSurfaceRequest(state, {
    requestId: state.requestId,
    generation: state.generation,
    requestFingerprint: state.requestFingerprint,
    status,
    now: overrides.now ?? 150,
    source: overrides.source ?? 'unavailable',
    freshness: overrides.freshness ?? 'unavailable',
    data: overrides.data,
    lastGoodData: overrides.lastGoodData,
    safeErrorCode: overrides.safeErrorCode,
    retryEligible: overrides.retryEligible,
    providerStatus: overrides.providerStatus,
    cancellationReason: overrides.cancellationReason,
    resultCount: overrides.resultCount,
  }).state;
}

function present(state, overrides = {}) {
  return resolveECSAsyncSurfacePresentation(state, {
    subject: 'Route catalog',
    ...overrides,
  });
}

const idle = createECSAsyncSurfaceState({
  surfaceId: 'presentation-fixture',
  provider: 'test-provider',
  now: 0,
});

const idlePresentation = present(idle);
assert.strictEqual(idlePresentation.kind, 'idle');
assert.strictEqual(idlePresentation.terminal, false);
assert.strictEqual(idlePresentation.showSpinner, false);

const loading = begin(idle);
const loadingPresentation = present(loading);
assert.strictEqual(loadingPresentation.kind, 'loading');
assert.strictEqual(loadingPresentation.terminal, false);
assert.strictEqual(loadingPresentation.showSpinner, true);
assert.strictEqual(loadingPresentation.showRetry, false);
assert.match(loadingPresentation.message, /route catalog/i);
assert.match(loadingPresentation.helper, /timeout/i);

const ready = settle(loading, 'ready', {
  data: [{ id: 'route-1' }],
  source: 'live',
  freshness: 'live',
  resultCount: 1,
});
const readyPresentation = present(ready);
assert.strictEqual(readyPresentation.kind, 'ready');
assert.strictEqual(readyPresentation.terminal, true);
assert.strictEqual(readyPresentation.renderState, false);
assert.strictEqual(readyPresentation.sourceLabel, 'Live / Current');

const validEmpty = settle(begin(idle, 200), 'empty', {
  data: [],
  source: 'live',
  freshness: 'live',
  resultCount: 0,
});
assert.strictEqual(present(validEmpty).kind, 'empty');
assert.strictEqual(present(validEmpty, { emptyReason: 'filtered' }).kind, 'no_results_after_filter');
assert.strictEqual(present(validEmpty).showRetry, false);

const stale = settle(begin(ready, 300), 'stale', {
  source: 'cached',
  freshness: 'stale',
  safeErrorCode: 'PROVIDER_UNAVAILABLE',
  retryEligible: true,
});
const stalePresentation = present(stale);
assert.strictEqual(stalePresentation.kind, 'stale');
assert.strictEqual(stalePresentation.showLastGoodData, true);
assert.strictEqual(stalePresentation.showRetry, true);
assert.strictEqual(stalePresentation.sourceLabel, 'Cached / Stale');

const offlineCachedPresentation = present(stale, { offline: true });
assert.strictEqual(offlineCachedPresentation.kind, 'offline_cached');
assert.match(offlineCachedPresentation.title, /saved/i);
assert.strictEqual(offlineCachedPresentation.showLastGoodData, true);

const partial = settle(begin(ready, 400), 'degraded', {
  source: 'cached',
  freshness: 'recent',
  safeErrorCode: 'PARTIAL_RESULT',
  retryEligible: true,
});
assert.strictEqual(present(partial).kind, 'partial');
assert.strictEqual(present(partial).tone, 'warning');

const rolloutDisabled = disableECSAsyncSurface(loading, {
  reason: 'feature_disabled',
  safeErrorCode: 'FEATURE_DISABLED',
  now: 500,
});
const rolloutPresentation = present(rolloutDisabled);
assert.strictEqual(rolloutPresentation.kind, 'disabled_by_rollout');
assert.strictEqual(rolloutPresentation.showRetry, false);
assert.match(rolloutPresentation.message, /rollout/i);

const permissionDenied = disableECSAsyncSurface(loading, {
  reason: 'permission_denied',
  safeErrorCode: 'LOCATION_PERMISSION_DENIED',
  providerStatus: 'permission_denied',
  now: 510,
});
const permissionPresentation = present(permissionDenied);
assert.strictEqual(permissionPresentation.kind, 'permission_required');
assert.strictEqual(permissionPresentation.showRetry, false);
assert.match(permissionPresentation.message, /permission/i);

const permissionError = settle(begin(idle, 520), 'error', {
  safeErrorCode: 'LOCATION_PERMISSION_DENIED',
  retryEligible: false,
  providerStatus: 'permission_denied',
});
assert.strictEqual(present(permissionError).kind, 'permission_required');

const providerUnavailable = settle(begin(idle, 600), 'error', {
  safeErrorCode: 'PROVIDER_UNAVAILABLE',
  retryEligible: true,
  providerStatus: 'unavailable',
});
const providerPresentation = present(providerUnavailable);
assert.strictEqual(providerPresentation.kind, 'provider_unavailable');
assert.strictEqual(providerPresentation.showRetry, true);
assert.strictEqual(providerPresentation.accessibilityLiveRegion, 'assertive');
assert.doesNotMatch(providerPresentation.title, /no results/i);
assert.strictEqual(providerPresentation.sourceLabel, 'Unavailable');

const recoverable = settle(begin(idle, 700), 'error', {
  safeErrorCode: 'REQUEST_TIMEOUT',
  retryEligible: true,
});
const recoverablePresentation = present(recoverable);
assert.strictEqual(recoverablePresentation.kind, 'recoverable_error');
assert.strictEqual(recoverablePresentation.showRetry, true);
assert.match(recoverablePresentation.message, /failed/i);

const nonrecoverable = settle(begin(idle, 800), 'error', {
  safeErrorCode: 'INVALID_PROVIDER_RESPONSE',
  retryEligible: false,
});
const nonrecoverablePresentation = present(nonrecoverable);
assert.strictEqual(nonrecoverablePresentation.kind, 'nonrecoverable_error');
assert.strictEqual(nonrecoverablePresentation.showRetry, false);

const wrongIdentityTarget = begin(idle, 900);
const cancelled = cancelECSAsyncSurfaceRequest(wrongIdentityTarget, {
  requestId: `${wrongIdentityTarget.requestId}-stale`,
  generation: wrongIdentityTarget.generation,
  requestFingerprint: wrongIdentityTarget.requestFingerprint,
  reason: 'consumer_cancelled',
  now: 901,
});
// Use one matching identity so cancellation itself remains a behavioral check.
const cancellable = begin(idle, 910);
const cancelledState = cancelECSAsyncSurfaceRequest(cancellable, {
  requestId: cancellable.requestId,
  generation: cancellable.generation,
  requestFingerprint: cancellable.requestFingerprint,
  reason: 'consumer_cancelled',
  now: 911,
}).state;
assert.strictEqual(cancelled.applied, false);
assert.strictEqual(present(cancelledState).kind, 'cancelled');
assert.strictEqual(present(cancelledState).terminal, true);

const longMessage = 'A deliberately long deterministic state message '.repeat(12).trim();
const longPresentation = present(recoverable, {
  copy: {
    recoverable_error: {
      title: 'Route catalog needs attention',
      message: longMessage,
      helper: 'Retry when provider access returns.',
    },
  },
});
assert.strictEqual(longPresentation.message, longMessage);
assert.ok(longPresentation.message.length > 300);

const requiredKinds = new Set([
  'idle',
  'loading',
  'ready',
  'empty',
  'no_results_after_filter',
  'provider_unavailable',
  'offline_cached',
  'stale',
  'partial',
  'disabled_by_rollout',
  'permission_required',
  'cancelled',
  'recoverable_error',
  'nonrecoverable_error',
]);

for (const presentation of [
  idlePresentation,
  loadingPresentation,
  readyPresentation,
  present(validEmpty),
  present(validEmpty, { emptyReason: 'filtered' }),
  providerPresentation,
  offlineCachedPresentation,
  stalePresentation,
  present(partial),
  rolloutPresentation,
  permissionPresentation,
  present(cancelledState),
  recoverablePresentation,
  nonrecoverablePresentation,
]) {
  requiredKinds.delete(presentation.kind);
  assert.ok(presentation.title.length > 0);
  assert.ok(presentation.message.length > 0);
}
assert.deepStrictEqual([...requiredKinds], []);

console.log('ECS async surface presentation checks passed');
