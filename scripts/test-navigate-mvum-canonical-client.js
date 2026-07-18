const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const clientPath = path.join(root, 'src', 'features', 'navigate', 'mvum', 'client.ts');
const supabasePath = path.join(root, 'lib', 'supabase.ts');
const viewportClientPath = path.join(root, 'lib', 'routeGeometryViewportClient.ts');

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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

let invokeImplementation = null;
const providerCalls = [];
const supabase = {
  functions: {
    invoke(name, options) {
      providerCalls.push({ name, options });
      assert(invokeImplementation, 'Each scenario must install a provider implementation.');
      return invokeImplementation(name, options);
    },
  },
};

require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { supabase },
};
require.cache[viewportClientPath] = {
  id: viewportClientPath,
  filename: viewportClientPath,
  loaded: true,
  exports: {
    fetchRouteGeometryViewportSegments() {
      throw new Error('Viewport loading is outside this canonical-detail client test.');
    },
  },
};

const {
  NavigateMvumCanonicalRequestError,
  fetchNavigateMvumCanonicalSegments,
} = require(clientPath);

const segmentFixture = (segmentId, longitudeOffset = 0) => ({
  segmentId,
  sourceLayer: 'mvum_segments',
  sourceQuality: 'canonical',
  geometry: {
    type: 'LineString',
    coordinates: [
      [-120.1 + longitudeOffset, 39.1],
      [-120.09 + longitudeOffset, 39.105],
    ],
  },
  distanceMeters: 1200,
  estimatedDurationSeconds: 540,
  warnings: [],
});

async function captureSafeError(promise, expectedSafeCode) {
  try {
    await promise;
    assert.fail(`Expected ${expectedSafeCode}.`);
  } catch (error) {
    assert(
      error instanceof NavigateMvumCanonicalRequestError,
      `Expected a typed MVUM error, received ${error?.constructor?.name ?? typeof error}.`,
    );
    assert.strictEqual(error.safeCode, expectedSafeCode);
    return error;
  }
}

async function run() {
  // Equivalent concurrent requests share one provider execution, even when ID order differs.
  providerCalls.length = 0;
  const sharedProvider = deferred();
  invokeImplementation = () => sharedProvider.promise;
  const sharedFirst = fetchNavigateMvumCanonicalSegments({
    segmentIds: ['segment-b', 'segment-a', 'segment-a'],
  });
  const sharedSecond = fetchNavigateMvumCanonicalSegments({
    segmentIds: ['segment-a', 'segment-b'],
  });
  assert.strictEqual(providerCalls.length, 1, 'Equivalent consumers must share one provider request.');
  assert.strictEqual(providerCalls[0].name, 'navigate-mvum-segment-geometry');
  assert.deepStrictEqual(
    providerCalls[0].options.body.segmentIds,
    ['segment-b', 'segment-a'],
    'The provider request should receive de-duplicated segment IDs.',
  );
  sharedProvider.resolve({
    data: { segments: [segmentFixture('segment-a'), segmentFixture('segment-b', 0.01)] },
    error: null,
  });
  const [sharedFirstResult, sharedSecondResult] = await Promise.all([sharedFirst, sharedSecond]);
  assert.deepStrictEqual(sharedFirstResult, sharedSecondResult);
  assert.strictEqual(sharedFirstResult.length, 2);

  // Cancelling one consumer must not abort work still needed by another consumer.
  providerCalls.length = 0;
  const cancellationProvider = deferred();
  invokeImplementation = () => cancellationProvider.promise;
  const firstController = new AbortController();
  const secondController = new AbortController();
  const cancelledConsumer = fetchNavigateMvumCanonicalSegments({
    segmentIds: ['segment-c'],
    signal: firstController.signal,
  });
  const retainedConsumer = fetchNavigateMvumCanonicalSegments({
    segmentIds: ['segment-c'],
    signal: secondController.signal,
  });
  assert.strictEqual(providerCalls.length, 1);
  const cancelledOutcome = captureSafeError(cancelledConsumer, 'MVUM_DETAIL_CANCELLED');
  firstController.abort('consumer_unmounted');
  await cancelledOutcome;
  assert.strictEqual(
    providerCalls[0].options.signal.aborted,
    false,
    'The shared provider request must remain active for the retained consumer.',
  );
  cancellationProvider.resolve({
    data: { segments: [segmentFixture('segment-c')] },
    error: null,
  });
  const retainedResult = await retainedConsumer;
  assert.strictEqual(retainedResult[0].segmentId, 'segment-c');

  // An immediately retried fingerprint must not join the just-aborted shared execution.
  providerCalls.length = 0;
  let retryProviderCall = 0;
  invokeImplementation = (_name, options) => {
    retryProviderCall += 1;
    if (retryProviderCall === 1) {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('provider aborted')), { once: true });
      });
    }
    return Promise.resolve({
      data: { segments: [segmentFixture('segment-retry')] },
      error: null,
    });
  };
  const supersededController = new AbortController();
  const supersededRequest = fetchNavigateMvumCanonicalSegments({
    segmentIds: ['segment-retry'],
    signal: supersededController.signal,
  });
  const supersededOutcome = captureSafeError(supersededRequest, 'MVUM_DETAIL_CANCELLED');
  supersededController.abort('rapid_retry');
  const immediateRetry = fetchNavigateMvumCanonicalSegments({
    segmentIds: ['segment-retry'],
  });
  await supersededOutcome;
  const immediateRetryResult = await immediateRetry;
  assert.strictEqual(providerCalls.length, 2, 'A rapid retry must issue a fresh provider request.');
  assert.strictEqual(immediateRetryResult[0].segmentId, 'segment-retry');

  // Provider failures expose a stable safe code and never leak the raw provider error.
  providerCalls.length = 0;
  invokeImplementation = async () => ({
    data: null,
    error: { message: 'secret upstream payload and coordinates' },
  });
  const providerError = await captureSafeError(
    fetchNavigateMvumCanonicalSegments({ segmentIds: ['segment-provider-error'] }),
    'MVUM_DETAIL_PROVIDER_ERROR',
  );
  assert(!providerError.message.includes('secret upstream payload'));
  assert(!providerError.message.includes('coordinates'));

  // A provider that ignores AbortSignal must still lose the race to the hard timeout.
  providerCalls.length = 0;
  invokeImplementation = () => new Promise(() => {});
  const timeoutStartedAt = Date.now();
  let deadlineTimer = null;
  let timeoutError;
  try {
    timeoutError = await Promise.race([
      captureSafeError(
        fetchNavigateMvumCanonicalSegments({
          segmentIds: ['segment-timeout'],
          timeoutMs: 250,
        }),
        'MVUM_DETAIL_TIMEOUT',
      ),
      new Promise((_, reject) => {
        deadlineTimer = setTimeout(
          () => reject(new Error('MVUM client did not reach a terminal timeout state.')),
          1500,
        );
      }),
    ]);
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
  }
  const timeoutElapsedMs = Date.now() - timeoutStartedAt;
  assert(timeoutError instanceof NavigateMvumCanonicalRequestError);
  assert(timeoutElapsedMs >= 200, `Timeout fired unexpectedly early after ${timeoutElapsedMs}ms.`);
  assert(timeoutElapsedMs < 1500, `Timeout was not bounded (${timeoutElapsedMs}ms).`);
  assert.strictEqual(
    providerCalls[0].options.signal.aborted,
    true,
    'The shared provider signal should still be aborted when the hard timeout fires.',
  );

  console.log('Navigate MVUM canonical client behavioral checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
