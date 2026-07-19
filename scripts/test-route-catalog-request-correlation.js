/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
global.__DEV__ = true;

function compileTypescript(module, filename) {
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
}

require.extensions['.ts'] = compileTypescript;

const clientCorrelationPath = path.join(
  root,
  'lib',
  'explore',
  'routeCatalogRequestCorrelation.ts',
);
const edgeCorrelationPath = path.join(
  root,
  'supabase',
  'functions',
  'route-catalog-search',
  'correlation.ts',
);

const {
  ECS_ROUTE_CATALOG_CORRELATION_LOG_TAG,
  ECS_ROUTE_CATALOG_REQUEST_ID_HEADER: CLIENT_REQUEST_ID_HEADER,
  buildRouteCatalogClientCorrelationDiagnostic,
  createECSRouteCatalogRequestId,
  logRouteCatalogClientCorrelationDiagnostic,
  normalizeECSRouteCatalogRequestId,
  resolveECSRouteCatalogResponseRequestCorrelation,
  resolveECSRouteCatalogResponseRequestId,
} = require(clientCorrelationPath);

const {
  ECS_ROUTE_CATALOG_REQUEST_ID_HEADER: EDGE_REQUEST_ID_HEADER,
  createRouteCatalogEdgeTrace,
  isValidRouteCatalogRequestId,
  resolveRouteCatalogRequestId,
  routeCatalogCorrelationResponseHeaders,
  routeCatalogResponseMetadata,
  traceNearbyRouteCatalogRpc,
} = require(edgeCorrelationPath);

const CLIENT_REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000';
const SERVER_REQUEST_ID = '223e4567-e89b-42d3-a456-426614174001';
const REVALIDATION_REQUEST_ID = '323e4567-e89b-42d3-a456-426614174002';
const GENERATED_REQUEST_ID = '423e4567-e89b-42d3-a456-426614174003';

assert.strictEqual(CLIENT_REQUEST_ID_HEADER, 'x-ecs-request-id');
assert.strictEqual(EDGE_REQUEST_ID_HEADER, CLIENT_REQUEST_ID_HEADER);
assert.strictEqual(normalizeECSRouteCatalogRequestId(CLIENT_REQUEST_ID), CLIENT_REQUEST_ID);
assert.strictEqual(isValidRouteCatalogRequestId(CLIENT_REQUEST_ID), true);

for (const invalid of [
  undefined,
  null,
  '',
  'not-a-uuid',
  ` ${CLIENT_REQUEST_ID}`,
  `${CLIENT_REQUEST_ID}\n`,
  'a'.repeat(65),
]) {
  assert.strictEqual(normalizeECSRouteCatalogRequestId(invalid), null);
  assert.strictEqual(isValidRouteCatalogRequestId(invalid), false);
  assert.strictEqual(
    resolveRouteCatalogRequestId(invalid, () => GENERATED_REQUEST_ID),
    GENERATED_REQUEST_ID,
    'Absent, invalid, controlled, and oversized request IDs must be replaced.',
  );
}

assert.strictEqual(
  resolveRouteCatalogRequestId(CLIENT_REQUEST_ID, () => GENERATED_REQUEST_ID),
  CLIENT_REQUEST_ID,
  'A valid client UUID must cross the Edge boundary unchanged.',
);
assert.throws(
  () => resolveRouteCatalogRequestId(undefined, () => 'invalid-generated-id'),
  /valid ECS route-catalog request identifier/i,
  'The Edge helper must fail closed if its UUID generator is broken.',
);

const generatedClientRequestId = createECSRouteCatalogRequestId();
assert.strictEqual(
  normalizeECSRouteCatalogRequestId(generatedClientRequestId),
  generatedClientRequestId,
  'A fresh client request must receive a valid UUID.',
);

assert.deepStrictEqual(
  resolveECSRouteCatalogResponseRequestCorrelation({
    sentRequestId: CLIENT_REQUEST_ID,
    responseHeaderRequestId: SERVER_REQUEST_ID,
    responseMetaRequestId: REVALIDATION_REQUEST_ID,
  }),
  { requestId: SERVER_REQUEST_ID, source: 'response_header' },
  'A valid response header is the authoritative accepted correlation ID.',
);
assert.deepStrictEqual(
  resolveECSRouteCatalogResponseRequestCorrelation({
    sentRequestId: CLIENT_REQUEST_ID,
    responseHeaderRequestId: 'invalid-header',
    responseMetaRequestId: SERVER_REQUEST_ID,
  }),
  { requestId: SERVER_REQUEST_ID, source: 'response_meta' },
  'Safe response metadata is the fallback when the response header is unusable.',
);
assert.strictEqual(
  resolveECSRouteCatalogResponseRequestId({
    sentRequestId: CLIENT_REQUEST_ID,
    responseHeaderRequestId: 'invalid-header',
    responseMetaRequestId: 'invalid-meta',
  }),
  CLIENT_REQUEST_ID,
  'The client-generated UUID remains available when no server identifier can be read.',
);

const responseHeaders = routeCatalogCorrelationResponseHeaders(
  {
    'Content-Type': 'application/json',
    'Access-Control-Expose-Headers': EDGE_REQUEST_ID_HEADER,
  },
  CLIENT_REQUEST_ID,
);
assert.strictEqual(responseHeaders[EDGE_REQUEST_ID_HEADER], CLIENT_REQUEST_ID);
assert.strictEqual(responseHeaders['Content-Type'], 'application/json');
assert.strictEqual(responseHeaders['Access-Control-Expose-Headers'], EDGE_REQUEST_ID_HEADER);

const responseBody = { ok: true, meta: { returnedCount: 2, contractVersion: 'test-v1' } };
const correlatedResponseBody = routeCatalogResponseMetadata(responseBody, CLIENT_REQUEST_ID);
assert.deepStrictEqual(correlatedResponseBody, {
  ok: true,
  meta: {
    returnedCount: 2,
    contractVersion: 'test-v1',
    ecsRequestId: CLIENT_REQUEST_ID,
  },
});
assert.deepStrictEqual(
  responseBody,
  { ok: true, meta: { returnedCount: 2, contractVersion: 'test-v1' } },
  'Correlation metadata must not mutate the caller response object.',
);

const staleRenderDiagnostic = buildRouteCatalogClientCorrelationDiagnostic({
  event: 'explorer_surface_render',
  requestId: CLIENT_REQUEST_ID,
  responseRequestId: CLIENT_REQUEST_ID,
  responseIdSource: 'response_header',
  revalidationRequestId: REVALIDATION_REQUEST_ID,
  status: 'stale',
  surfaceKind: 'cards',
  candidateCount: 51,
  returnedCount: 20,
  blockedCount: 0,
  normalizedCount: 20,
  discoverableCount: 20,
  guidanceReadyCount: 0,
  visibleCount: 20,
  rpcUsed: true,
  durationMs: 12.345,
});
assert(staleRenderDiagnostic);
assert.strictEqual(staleRenderDiagnostic.requestId, CLIENT_REQUEST_ID);
assert.strictEqual(staleRenderDiagnostic.responseRequestId, CLIENT_REQUEST_ID);
assert.strictEqual(staleRenderDiagnostic.revalidationRequestId, REVALIDATION_REQUEST_ID);
assert.notStrictEqual(
  staleRenderDiagnostic.responseRequestId,
  staleRenderDiagnostic.revalidationRequestId,
  'A stale snapshot origin must remain distinguishable from its fresh revalidation.',
);
assert.strictEqual(staleRenderDiagnostic.surfaceKind, 'cards');
assert.strictEqual(staleRenderDiagnostic.visibleCount, 20);
assert.strictEqual(staleRenderDiagnostic.durationMs, 12.35);

const clientLogEvents = [];
assert.strictEqual(
  logRouteCatalogClientCorrelationDiagnostic({
    event: 'explorer_surface_render',
    requestId: CLIENT_REQUEST_ID,
    responseRequestId: CLIENT_REQUEST_ID,
    revalidationRequestId: REVALIDATION_REQUEST_ID,
    status: 'stale',
    surfaceKind: 'cards',
    visibleCount: 20,
  }, {
    enabled: true,
    logger: (tag, payload) => clientLogEvents.push({ tag, payload }),
  }),
  true,
);
assert.strictEqual(clientLogEvents.length, 1);
assert.strictEqual(clientLogEvents[0].tag, ECS_ROUTE_CATALOG_CORRELATION_LOG_TAG);
assert.strictEqual(clientLogEvents[0].payload.requestId, CLIENT_REQUEST_ID);
assert.strictEqual(clientLogEvents[0].payload.revalidationRequestId, REVALIDATION_REQUEST_ID);

const edgeLogLines = [];
const clockValues = [100, 115, 140, 180];
const trace = createRouteCatalogEdgeTrace({
  requestId: CLIENT_REQUEST_ID,
  startedAtMs: 100,
  now: () => clockValues.shift() ?? 180,
  logger: (line) => edgeLogLines.push(line),
});
trace.emit('request_start', {
  candidateCount: 0,
  returnedCount: 0,
  blockedCount: 0,
  rpcUsed: false,
  durationMs: 0,
});

async function verifyRpcTrace() {
  const rpcResult = await traceNearbyRouteCatalogRpc(trace, async () => ({
    data: [
      { route_id: 'unit-route-1' },
      { route_id: 'unit-route-2' },
      { route_id: 'unit-route-3' },
    ],
    error: null,
  }));
  assert.strictEqual(rpcResult.data.length, 3);
  trace.emit('response_complete', {
    candidateCount: 3,
    returnedCount: 2,
    blockedCount: 1,
    rpcUsed: true,
    durationMs: 80,
  });

  const edgeEvents = edgeLogLines.map((line) => JSON.parse(line));
  assert.deepStrictEqual(
    edgeEvents.map((event) => event.event),
    ['request_start', 'nearby_rpc_start', 'nearby_rpc_complete', 'response_complete'],
  );
  edgeEvents.forEach((event) => {
    assert.strictEqual(event.component, 'route-catalog-search');
    assert.strictEqual(event.requestId, CLIENT_REQUEST_ID);
  });
  assert.strictEqual(edgeEvents[2].candidateCount, 3);
  assert.strictEqual(edgeEvents[2].returnedCount, 3);
  assert.strictEqual(edgeEvents[2].rpcUsed, true);
  assert.strictEqual(edgeEvents[2].durationMs, 15);
  assert.deepStrictEqual(
    {
      candidateCount: edgeEvents[3].candidateCount,
      returnedCount: edgeEvents[3].returnedCount,
      blockedCount: edgeEvents[3].blockedCount,
      rpcUsed: edgeEvents[3].rpcUsed,
    },
    {
      candidateCount: 3,
      returnedCount: 2,
      blockedCount: 1,
      rpcUsed: true,
    },
  );
  assert.deepStrictEqual(
    Object.keys(edgeEvents[3]).sort(),
    [
      'blockedCount',
      'candidateCount',
      'component',
      'durationMs',
      'event',
      'requestId',
      'returnedCount',
      'rpcUsed',
    ].sort(),
    'Edge completion logs must contain only the approved aggregate fields.',
  );

  const rejectedBeforeRpcLines = [];
  const rejectedBeforeRpcTrace = createRouteCatalogEdgeTrace({
    requestId: REVALIDATION_REQUEST_ID,
    startedAtMs: 200,
    now: () => 201,
    logger: (line) => rejectedBeforeRpcLines.push(line),
  });
  rejectedBeforeRpcTrace.emit('request_start', { rpcUsed: false, durationMs: 0 });
  rejectedBeforeRpcTrace.emit('response_complete', {
    candidateCount: 0,
    returnedCount: 0,
    blockedCount: 0,
    rpcUsed: rejectedBeforeRpcTrace.nearbyRpcStarted,
    durationMs: 1,
  });
  const rejectedBeforeRpcEvents = rejectedBeforeRpcLines.map((line) => JSON.parse(line));
  assert.deepStrictEqual(
    rejectedBeforeRpcEvents.map((event) => event.event),
    ['request_start', 'response_complete'],
  );
  assert.strictEqual(rejectedBeforeRpcEvents[1].rpcUsed, false);

  const privacyCanaries = {
    latitude: 38.123456,
    longitude: -120.654321,
    authorization: 'Bearer synthetic-test-credential',
    sourceUrl: 'https://private.example.test/source?id=secret',
    routeName: 'Private Route Canary',
    geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] },
    userEmail: 'private@example.test',
  };
  trace.emit('response_complete', {
    candidateCount: 4,
    returnedCount: 2,
    blockedCount: 2,
    rpcUsed: true,
    durationMs: 81,
    ...privacyCanaries,
  });
  const privacySerialized = edgeLogLines[edgeLogLines.length - 1];
  for (const forbidden of [
    '38.123456',
    '-120.654321',
    'synthetic-test-credential',
    'private.example.test',
    'Private Route Canary',
    'LineString',
    'coordinates',
    'private@example.test',
  ]) {
    assert.strictEqual(
      privacySerialized.includes(forbidden),
      false,
      `Structured Edge correlation logs must omit privacy canary: ${forbidden}`,
    );
  }

  const benchmarkIterations = 25_000;
  const benchmarkStartedAt = performance.now();
  let benchmarkChecksum = 0;
  for (let index = 0; index < benchmarkIterations; index += 1) {
    const normalized = normalizeECSRouteCatalogRequestId(CLIENT_REQUEST_ID);
    const diagnostic = buildRouteCatalogClientCorrelationDiagnostic({
      event: 'client_normalization_complete',
      requestId: normalized,
      returnedCount: index % 51,
      blockedCount: 0,
      rpcUsed: true,
      durationMs: index / 100,
    });
    benchmarkChecksum += diagnostic?.returnedCount ?? 0;
  }
  const benchmarkDurationMs = performance.now() - benchmarkStartedAt;
  assert(benchmarkChecksum > 0);
  assert(
    benchmarkDurationMs < 3_000,
    `Correlation helper microbenchmark exceeded its generous local bound: ${benchmarkDurationMs.toFixed(2)}ms.`,
  );

  console.log('Route catalog request correlation checks passed.', {
    benchmarkIterations,
    benchmarkDurationMs: Number(benchmarkDurationMs.toFixed(2)),
    averageMicrosecondsPerIteration: Number(
      ((benchmarkDurationMs * 1000) / benchmarkIterations).toFixed(3),
    ),
  });
}

verifyRpcTrace().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
