/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const {
  createOfflinePrepActionFingerprint,
  createOfflinePrepActionLifecycle,
  evaluateOfflinePrepActionEligibility,
  isCurrentOfflinePrepActionOutcome,
} = require(path.join(__dirname, '..', 'lib', 'offlinePrepPack', 'offlinePrepActionLifecycle.ts'));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function controlledClock(start = Date.parse('2026-07-17T12:00:00.000Z')) {
  let value = start;
  return {
    now: () => value,
    advance: (milliseconds = 1) => { value += milliseconds; },
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function testIdenticalRequestsShareOneExecution() {
  const clock = controlledClock();
  const lifecycle = createOfflinePrepActionLifecycle({ now: clock.now });
  const provider = deferred();
  const fingerprint = createOfflinePrepActionFingerprint({
    action: 'prepare_pack',
    routeId: 'route-42',
    manifestId: 'manifest-42',
    sourceRevision: 3,
  });
  let calls = 0;
  const execute = () => {
    calls += 1;
    return provider.promise;
  };

  const first = lifecycle.run({ action: 'prepare_pack', fingerprint, execute });
  const duplicate = lifecycle.run({ action: 'prepare_pack', fingerprint, execute });

  assert.strictEqual(first.decision, 'started');
  assert.strictEqual(duplicate.decision, 'shared');
  assert.strictEqual(duplicate.shared, true);
  assert.strictEqual(first.promise, duplicate.promise, 'Equivalent requests must share the terminal promise.');
  assert.strictEqual(calls, 0, 'Execution begins after synchronous ownership is established.');
  await flushMicrotasks();
  assert.strictEqual(calls, 1, 'Rapid duplicate activation must execute exactly once.');

  clock.advance(25);
  provider.resolve({ regionId: 'region-42' });
  const [firstOutcome, duplicateOutcome] = await Promise.all([first.promise, duplicate.promise]);
  assert.strictEqual(firstOutcome.status, 'succeeded');
  assert.strictEqual(duplicateOutcome, firstOutcome);
  assert.strictEqual(firstOutcome.accepted, true);
  assert.strictEqual(isCurrentOfflinePrepActionOutcome(lifecycle.getState(), firstOutcome), true);
  assert.strictEqual(lifecycle.getState().status, 'succeeded');

  const warmRepeat = lifecycle.run({ action: 'prepare_pack', fingerprint, execute });
  assert.strictEqual(warmRepeat.decision, 'reused');
  assert.strictEqual((await warmRepeat.promise).reused, true);
  assert.strictEqual(calls, 1, 'A warm identical prepare must not create another request.');
}

async function testRetryCreatesNewGeneration() {
  const clock = controlledClock();
  const lifecycle = createOfflinePrepActionLifecycle({ now: clock.now });
  const fingerprint = createOfflinePrepActionFingerprint({
    action: 'refresh_manifest',
    routeId: 'retry-route',
    manifestId: 'retry-manifest',
  });
  let calls = 0;

  const failed = lifecycle.run({
    action: 'refresh_manifest',
    fingerprint,
    execute: async () => {
      calls += 1;
      const error = new Error('Raw provider detail');
      error.safeCode = 'weather source failed';
      throw error;
    },
  });
  const failedOutcome = await failed.promise;
  assert.strictEqual(failedOutcome.status, 'failed');
  assert.strictEqual(failedOutcome.safeErrorCode, 'WEATHER_SOURCE_FAILED');
  assert.strictEqual(failedOutcome.retryEligible, true);

  const blockedRepeat = lifecycle.run({
    action: 'refresh_manifest',
    fingerprint,
    execute: async () => ({ ignored: true }),
  });
  assert.strictEqual(blockedRepeat.decision, 'blocked', 'Failure requires an explicit retry intent.');

  clock.advance(100);
  const retry = lifecycle.run({
    action: 'refresh_manifest',
    fingerprint,
    attempt: 'retry',
    execute: async () => {
      calls += 1;
      return { refreshed: true };
    },
  });
  const retryOutcome = await retry.promise;
  assert.strictEqual(retryOutcome.status, 'succeeded');
  assert.strictEqual(retryOutcome.request.generation, 2);
  assert.notStrictEqual(retryOutcome.request.requestId, failedOutcome.request.requestId);
  assert.strictEqual(calls, 2, 'Retry must issue one fresh execution.');

  clock.advance(100);
  const refresh = lifecycle.run({
    action: 'refresh_manifest',
    fingerprint,
    attempt: 'refresh',
    execute: async () => ({ refreshedAgain: true }),
  });
  assert.strictEqual((await refresh.promise).request.generation, 3);
}

async function testSupersededResultCannotOverwriteNewerRoute() {
  const clock = controlledClock();
  const lifecycle = createOfflinePrepActionLifecycle({ now: clock.now });
  const olderProvider = deferred();
  const newerProvider = deferred();
  let olderSignal;

  const older = lifecycle.run({
    action: 'prepare_pack',
    fingerprint: 'prepare_pack:older-route:manifest:1',
    execute: ({ signal }) => {
      olderSignal = signal;
      return olderProvider.promise;
    },
  });
  await flushMicrotasks();
  clock.advance(10);
  const newer = lifecycle.run({
    action: 'prepare_pack',
    fingerprint: 'prepare_pack:newer-route:manifest:1',
    execute: () => newerProvider.promise,
  });

  const olderOutcome = await older.promise;
  assert.strictEqual(olderOutcome.status, 'cancelled');
  assert.strictEqual(olderOutcome.accepted, false);
  assert.strictEqual(olderOutcome.cancellationReason, 'superseded');
  assert.strictEqual(olderSignal.aborted, true);

  clock.advance(10);
  newerProvider.resolve({ routeId: 'newer-route' });
  const newerOutcome = await newer.promise;
  assert.strictEqual(newerOutcome.status, 'succeeded');
  assert.strictEqual(newerOutcome.accepted, true);

  olderProvider.resolve({ routeId: 'older-route' });
  await flushMicrotasks();
  assert.strictEqual(lifecycle.getState().fingerprint, newerOutcome.request.fingerprint);
  assert.strictEqual(lifecycle.getState().status, 'succeeded');
}

async function testUnmountCancellationTerminatesIgnoredProvider() {
  const clock = controlledClock();
  const lifecycle = createOfflinePrepActionLifecycle({ now: clock.now });
  const provider = deferred();
  let signal;
  let calls = 0;

  const execution = lifecycle.run({
    action: 'export_manifest',
    fingerprint: 'export_manifest:route:manifest:1',
    execute: (context) => {
      calls += 1;
      signal = context.signal;
      return provider.promise;
    },
  });
  await flushMicrotasks();
  clock.advance(50);
  const cancelled = lifecycle.dispose();
  const outcome = await execution.promise;

  assert.ok(cancelled);
  assert.strictEqual(calls, 1);
  assert.strictEqual(signal.aborted, true);
  assert.strictEqual(outcome.status, 'cancelled');
  assert.strictEqual(outcome.cancellationReason, 'unmount');
  assert.strictEqual(outcome.accepted, false);
  assert.strictEqual(outcome.retryEligible, false);
  assert.strictEqual(lifecycle.getState().status, 'cancelled');
  assert.ok(lifecycle.getState().completedAt, 'Unmount must terminate even if the provider ignores AbortSignal.');

  const blocked = lifecycle.run({
    action: 'export_manifest',
    fingerprint: 'export_manifest:route:manifest:2',
    attempt: 'retry',
    execute: async () => {
      calls += 1;
      return { shouldNotRun: true };
    },
  });
  assert.strictEqual(blocked.decision, 'blocked');
  assert.strictEqual((await blocked.promise).accepted, false);
  assert.strictEqual(calls, 1);

  provider.resolve({ late: true });
  await flushMicrotasks();
  assert.strictEqual(lifecycle.getState().status, 'cancelled');
}

function testEligibilityIsPureAndExplicit() {
  const running = {
    status: 'running', action: 'prepare_pack', requestId: 'request-1', fingerprint: 'fingerprint-1',
    generation: 1, attempt: 'initial', startedAt: '2026-07-17T12:00:00.000Z', completedAt: null,
    safeErrorCode: null, retryEligible: false, cancellationReason: null,
  };
  assert.deepStrictEqual(
    evaluateOfflinePrepActionEligibility({ state: running, action: 'prepare_pack', fingerprint: 'fingerprint-1' }),
    { decision: 'shared', reason: 'identical_request_in_flight' },
  );
  assert.deepStrictEqual(
    evaluateOfflinePrepActionEligibility({ state: running, action: 'prepare_pack', fingerprint: 'fingerprint-2' }),
    { decision: 'started', reason: 'supersede_active_request' },
  );
}

(async () => {
  testEligibilityIsPureAndExplicit();
  await testIdenticalRequestsShareOneExecution();
  await testRetryCreatesNewGeneration();
  await testSupersededResultCannotOverwriteNewerRoute();
  await testUnmountCancellationTerminatesIgnoredProvider();
  console.log('Offline Prep action lifecycle behavior tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
