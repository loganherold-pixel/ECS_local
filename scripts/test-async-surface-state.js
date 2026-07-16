const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
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
  createECSAsyncRequestFingerprint,
  createECSAsyncSurfaceDiagnostic,
  createECSAsyncSurfaceState,
  disableECSAsyncSurface,
  settleECSAsyncSurfaceRequest,
} = load('lib/state/asyncSurfaceState.ts');

const {
  clearInFlightWeatherRequests,
  runDedupedWeatherRequest,
} = load('lib/weatherRequestDedupe.ts');

function start(state, now, fingerprintInput = { viewport: now }) {
  return beginECSAsyncSurfaceRequest(state, {
    now,
    fingerprintInput,
    provider: 'test-provider',
  });
}

function settle(state, status, options = {}) {
  return settleECSAsyncSurfaceRequest(state, {
    requestId: state.requestId,
    generation: state.generation,
    status,
    now: options.now ?? (state.startedAt ?? 0) + 25,
    source: options.source ?? (status === 'ready' ? 'live' : 'unavailable'),
    freshness: options.freshness ?? (status === 'ready' ? 'live' : 'unavailable'),
    data: options.data,
    resultCount: options.resultCount,
    safeErrorCode: options.safeErrorCode,
    retryEligible: options.retryEligible,
    cancellationReason: options.cancellationReason,
    providerStatus: options.providerStatus,
  });
}

async function main() {
  const idle = createECSAsyncSurfaceState({
    surfaceId: 'async-regression',
    provider: 'test-provider',
    now: 0,
  });
  assert.strictEqual(idle.status, 'idle');
  assert.strictEqual(idle.data, null);
  assert.strictEqual(idle.lastGoodData, null);
  assert.strictEqual(idle.startedAt, null);
  assert.strictEqual(idle.completedAt, null);

  const loading = start(idle, 100, { lat: 38.123456, lng: -120.654321, filter: 'open' });
  assert.strictEqual(loading.status, 'loading');
  assert.strictEqual(loading.generation, 1);
  assert.strictEqual(loading.completedAt, null);
  assert.ok(loading.requestId);
  assert.ok(loading.requestFingerprint);
  assert(!loading.requestFingerprint.includes('38.123456'));
  assert(!loading.requestFingerprint.includes('-120.654321'));
  assert.strictEqual(
    loading.requestFingerprint,
    createECSAsyncRequestFingerprint({ lat: 38.123456, lng: -120.654321, filter: 'open' }),
  );

  const success = settle(loading, 'ready', {
    data: [{ id: 'one' }],
    resultCount: 1,
    now: 140,
  });
  assert.strictEqual(success.applied, true);
  assert.strictEqual(success.state.status, 'ready');
  assert.strictEqual(success.state.completedAt, 140);
  assert.deepStrictEqual(success.state.lastGoodData, [{ id: 'one' }]);
  assert.strictEqual(success.state.retryEligible, false);

  const emptyLoading = start(idle, 200);
  const empty = settle(emptyLoading, 'empty', {
    data: [],
    resultCount: 0,
    source: 'live',
    freshness: 'live',
  });
  assert.strictEqual(empty.state.status, 'empty');
  assert.deepStrictEqual(empty.state.data, []);
  assert.strictEqual(empty.state.safeErrorCode, null);

  const staleLoading = start(success.state, 300);
  const stale = settle(staleLoading, 'stale', {
    source: 'cached',
    freshness: 'stale',
    safeErrorCode: 'PROVIDER_UNAVAILABLE',
    retryEligible: true,
  });
  assert.strictEqual(stale.state.status, 'stale');
  assert.deepStrictEqual(stale.state.data, [{ id: 'one' }]);
  assert.deepStrictEqual(stale.state.lastGoodData, [{ id: 'one' }]);

  const degradedLoading = start(success.state, 400);
  const degraded = settle(degradedLoading, 'degraded', {
    source: 'cached',
    freshness: 'recent',
    safeErrorCode: 'PROVIDER_PARTIAL',
    retryEligible: true,
  });
  assert.strictEqual(degraded.state.status, 'degraded');
  assert.deepStrictEqual(degraded.state.data, [{ id: 'one' }]);

  const errorLoading = start(idle, 500);
  const providerError = settle(errorLoading, 'error', {
    safeErrorCode: 'PROVIDER_FAILED',
    retryEligible: true,
    providerStatus: 'unavailable',
  });
  assert.strictEqual(providerError.state.status, 'error');
  assert.strictEqual(providerError.state.safeErrorCode, 'PROVIDER_FAILED');
  assert.strictEqual(providerError.state.retryEligible, true);

  const timeoutLoading = start(idle, 600);
  const timeout = settle(timeoutLoading, 'error', {
    safeErrorCode: 'REQUEST_TIMEOUT',
    retryEligible: true,
  });
  assert.strictEqual(timeout.state.status, 'error');
  assert.strictEqual(timeout.state.safeErrorCode, 'REQUEST_TIMEOUT');
  assert.notStrictEqual(timeout.state.status, 'loading');

  const cancelledLoading = start(idle, 700);
  const cancelled = cancelECSAsyncSurfaceRequest(cancelledLoading, {
    requestId: cancelledLoading.requestId,
    generation: cancelledLoading.generation,
    reason: 'consumer_cancelled',
    now: 710,
  });
  assert.strictEqual(cancelled.applied, true);
  assert.strictEqual(cancelled.state.status, 'cancelled');
  assert.strictEqual(cancelled.state.cancellationReason, 'consumer_cancelled');
  const lateAfterCancel = settleECSAsyncSurfaceRequest(cancelled.state, {
    requestId: cancelledLoading.requestId,
    generation: cancelledLoading.generation,
    status: 'ready',
    data: [{ id: 'late' }],
    source: 'live',
    freshness: 'live',
    now: 800,
  });
  assert.strictEqual(lateAfterCancel.applied, false);

  const disabled = disableECSAsyncSurface(loading, {
    reason: 'feature_disabled',
    safeErrorCode: 'FEATURE_DISABLED',
    now: 150,
  });
  assert.strictEqual(disabled.status, 'disabled');
  assert.strictEqual(disabled.featureEnabled, false);
  assert.strictEqual(disabled.providerStatus, 'disabled');
  assert.strictEqual(disabled.retryEligible, false);

  const permissionDenied = disableECSAsyncSurface(loading, {
    reason: 'permission_denied',
    safeErrorCode: 'LOCATION_PERMISSION_DENIED',
    providerStatus: 'permission_denied',
    now: 160,
  });
  assert.strictEqual(permissionDenied.status, 'disabled');
  assert.strictEqual(permissionDenied.providerStatus, 'permission_denied');
  assert.strictEqual(permissionDenied.safeErrorCode, 'LOCATION_PERMISSION_DENIED');

  const requestA = start(idle, 900, { viewport: 'A' });
  const requestB = start(requestA, 901, { viewport: 'B' });
  const lateA = settleECSAsyncSurfaceRequest(requestB, {
    requestId: requestA.requestId,
    generation: requestA.generation,
    status: 'ready',
    data: [{ id: 'A' }],
    source: 'live',
    freshness: 'live',
    now: 950,
  });
  assert.strictEqual(lateA.applied, false);
  assert.strictEqual(lateA.state.requestId, requestB.requestId);
  const currentB = settle(requestB, 'ready', { data: [{ id: 'B' }], resultCount: 1, now: 940 });
  assert.strictEqual(currentB.applied, true);
  assert.deepStrictEqual(currentB.state.data, [{ id: 'B' }]);

  const unmountLoading = start(idle, 1000);
  const unmounted = cancelECSAsyncSurfaceRequest(unmountLoading, {
    requestId: unmountLoading.requestId,
    generation: unmountLoading.generation,
    reason: 'unmount',
    now: 1001,
  });
  assert.strictEqual(unmounted.state.status, 'cancelled');
  assert.strictEqual(unmounted.state.cancellationReason, 'unmount');

  const retryLoading = start(providerError.state, 1100);
  assert.strictEqual(retryLoading.status, 'loading');
  assert.strictEqual(retryLoading.safeErrorCode, null);
  assert.strictEqual(retryLoading.generation, providerError.state.generation + 1);
  const retryReady = settle(retryLoading, 'ready', { data: [{ id: 'retry' }], resultCount: 1 });
  assert.strictEqual(retryReady.state.status, 'ready');

  clearInFlightWeatherRequests();
  let providerCalls = 0;
  const sharedRequest = () => {
    providerCalls += 1;
    return Promise.resolve([{ id: 'shared' }]);
  };
  const [consumerOne, consumerTwo] = await Promise.all([
    runDedupedWeatherRequest('same-data', sharedRequest),
    runDedupedWeatherRequest('same-data', sharedRequest),
  ]);
  assert.strictEqual(providerCalls, 1);
  assert.strictEqual(consumerOne, consumerTwo);

  const diagnostic = createECSAsyncSurfaceDiagnostic(stale.state, 350);
  assert.deepStrictEqual(Object.keys(diagnostic).sort(), [
    'cancellationReason',
    'elapsedMs',
    'freshness',
    'provider',
    'requestFingerprint',
    'resultCount',
    'safeErrorCode',
    'source',
    'status',
    'surfaceId',
  ].sort());
  assert.strictEqual(diagnostic.surfaceId, 'async-regression');
  assert.strictEqual(diagnostic.status, 'stale');
  assert.strictEqual(diagnostic.elapsedMs, 25);

  console.log('ECS async surface-state regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
