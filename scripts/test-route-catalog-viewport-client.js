const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'lib', 'routeCatalogViewportClient.ts');
const servicePath = path.join(root, 'lib', 'routeCatalogViewport.ts');
const supabasePath = path.join(root, 'lib', 'supabase.ts');

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
let supabaseConfigured = true;
let routeCatalogSearchDeployed = true;
let defaultInvokeCount = 0;
const supabaseModuleExports = {
  EDGE_FUNCTION_UNAVAILABLE_CODE: 'EDGE_FUNCTION_UNAVAILABLE',
  SUPABASE_CONFIG_UNAVAILABLE_CODE: 'SUPABASE_CONFIG_UNAVAILABLE',
  get isSupabaseConfigured() {
    return supabaseConfigured;
  },
  isDeployedEdgeFunction: (name) => name === 'route-catalog-search' && routeCatalogSearchDeployed,
  supabase: {
    functions: {
      invoke: async () => {
        defaultInvokeCount += 1;
        throw new Error('Default Supabase client should not be used by this test.');
      },
    },
  },
};
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: supabaseModuleExports,
};

assert(fs.existsSync(modulePath), 'Route catalog viewport client should exist.');

const {
  buildRouteCatalogViewportSearchBody,
  fetchRouteCatalogViewportFeatures,
  getRouteCatalogViewportProviderAvailability,
  RouteCatalogViewportProviderUnavailableError,
  RouteCatalogViewportResponseError,
  RouteCatalogViewportTimeoutError,
} = require(modulePath);
const { buildRouteCatalogViewportQuery } = require(servicePath);

const query = buildRouteCatalogViewportQuery({
  bbox: {
    minLng: -120.72,
    minLat: 39.18,
    maxLng: -120.28,
    maxLat: 39.42,
  },
  zoom: 11,
  regionTags: ['tahoe_nf'],
  limit: 250,
});

const body = buildRouteCatalogViewportSearchBody(query);
assert.strictEqual(body.latitude, query.center.latitude);
assert.strictEqual(body.longitude, query.center.longitude);
assert.strictEqual(body.radiusMiles, query.radiusMiles);
assert.deepStrictEqual(
  body.viewportBbox,
  query.bbox,
  'The live map request must send the semantic viewport bbox so the server filters before top-20 selection.',
);
assert.deepStrictEqual(
  body.regionTags,
  query.regionTags,
  'The live map request must preserve normalized region tags used by the viewport inclusion predicate.',
);
assert.strictEqual(query.limit, 20, 'Viewport consumer limits above 20 must clamp to the total-search cap.');
assert.strictEqual(body.limit, 20);
assert.strictEqual(body.includeGeometry, true);
assert.strictEqual(body.includePreviewGeometry, true);
assert.strictEqual(body.includeAssessment, true);
assert.strictEqual(
  body.recommendationOnly,
  true,
  'Map-area searches must exclude non-recommendable rows before the server chooses its top 20.',
);
assert.strictEqual(body.locationSource, 'navigate_ecs_route_geometry_viewport');

let invokedName = null;
let invokedBody = null;
let invokedSignal = null;
const mockClient = {
  functions: {
    invoke: async (name, options) => {
      invokedName = name;
      invokedBody = options.body;
      invokedSignal = options.signal;
      return {
        data: {
          ok: true,
          records: [
            {
              id: 'route-a',
              public_id: 'route-a',
              name: 'Tahoe Connector',
              route_type: 'point_to_point',
              center_latitude: 39.3,
              center_longitude: -120.5,
              distance_miles: 12.4,
              official_access_coverage_pct: 100,
              unknown_access_coverage_pct: 0,
              restricted_access_coverage_pct: 0,
              active_closure_count: 0,
              seasonal_restriction_count: 0,
              verification_status: 'official_verified',
              recommendation_status: 'recommendable',
              review_status: 'approved',
              confidence_score: 92,
              tags: ['Tahoe National Forest', 'tahoe_nf'],
              source_records: [
                {
                  provider_id: 'usfs_mvum',
                  label: 'USFS MVUM',
                  source_type: 'federal_agency',
                  authority: 'USFS MVUM official agency source',
                  last_verified_at: new Date().toISOString(),
                },
              ],
              route_geometry_mode: 'full',
              route_geometry: {
                type: 'LineString',
                coordinates: [
                  [-120.66, 39.23],
                  [-120.52, 39.31],
                  [-120.34, 39.38],
                ],
              },
            },
          ],
        },
        error: null,
      };
    },
  },
};

(async () => {
  const result = await fetchRouteCatalogViewportFeatures(query, { client: mockClient });
  assert.strictEqual(invokedName, 'route-catalog-search');
  assert.deepStrictEqual(invokedBody, body);
  assert(invokedSignal instanceof AbortSignal, 'The route catalog request should receive a cancellable signal.');
  assert.strictEqual(invokedSignal.aborted, false);
  assert.strictEqual(result.featureCollection.features.length, 1);
  assert.strictEqual(result.featureCollection.features[0].properties.routeId, 'route-a');
  assert.strictEqual(result.featureCollection.features[0].properties.geometryStatus, 'guidance_ready');

  const clientReturning = (data) => ({
    functions: {
      invoke: async () => ({ data, error: null }),
    },
  });
  const validEmpty = await fetchRouteCatalogViewportFeatures(query, {
    client: clientReturning({ ok: true, records: [] }),
  });
  assert.strictEqual(validEmpty.returnedCount, 0, 'An explicit successful empty envelope should remain a valid empty result.');
  await assert.rejects(
    fetchRouteCatalogViewportFeatures(query, { client: clientReturning(null) }),
    (error) => error instanceof RouteCatalogViewportResponseError
      && error.safeErrorCode === 'ROUTE_CATALOG_MALFORMED_RESPONSE',
    'A null 200 response must not be presented as no catalog routes.',
  );
  await assert.rejects(
    fetchRouteCatalogViewportFeatures(query, {
      client: clientReturning({ ok: false, error: 'provider unavailable', records: [] }),
    }),
    (error) => error instanceof RouteCatalogViewportResponseError
      && error.safeErrorCode === 'ROUTE_CATALOG_PROVIDER_REJECTED',
    'A provider rejection envelope must terminate as an error rather than an empty result.',
  );
  await assert.rejects(
    fetchRouteCatalogViewportFeatures(query, {
      client: clientReturning({ ok: true, records: { id: 'not-an-array' } }),
    }),
    (error) => error instanceof RouteCatalogViewportResponseError
      && error.safeErrorCode === 'ROUTE_CATALOG_MALFORMED_RESPONSE',
    'A malformed records field must not be presented as a valid empty result.',
  );

  let preAbortedInvokeCount = 0;
  const preAbortedController = new AbortController();
  preAbortedController.abort();
  await assert.rejects(
    fetchRouteCatalogViewportFeatures(query, {
      client: {
        functions: {
          invoke: async () => {
            preAbortedInvokeCount += 1;
            return { data: [], error: null };
          },
        },
      },
      signal: preAbortedController.signal,
    }),
    (error) => error instanceof Error && error.name === 'AbortError',
  );
  assert.strictEqual(preAbortedInvokeCount, 0, 'A pre-cancelled request must not invoke the provider.');

  let cancellationReachedProvider = false;
  let cancellationAbortedProvider = false;
  const callerController = new AbortController();
  const cancelledRequest = fetchRouteCatalogViewportFeatures(query, {
    client: {
      functions: {
        invoke: async (_name, options) => {
          cancellationReachedProvider = true;
          return new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => {
              cancellationAbortedProvider = true;
              const error = new Error('provider aborted');
              error.name = 'AbortError';
              reject(error);
            }, { once: true });
          });
        },
      },
    },
    signal: callerController.signal,
    timeoutMs: 1_000,
  });
  callerController.abort();
  await assert.rejects(
    cancelledRequest,
    (error) => error instanceof Error && error.name === 'AbortError',
  );
  assert.strictEqual(cancellationReachedProvider, true);
  assert.strictEqual(cancellationAbortedProvider, true, 'Caller cancellation should abort the provider request.');

  let timeoutAbortedProvider = false;
  await assert.rejects(
    fetchRouteCatalogViewportFeatures(query, {
      client: {
        functions: {
          invoke: async (_name, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => {
              timeoutAbortedProvider = true;
              const error = new Error('provider aborted');
              error.name = 'AbortError';
              reject(error);
            }, { once: true });
          }),
        },
      },
      timeoutMs: 10,
    }),
    (error) => error instanceof RouteCatalogViewportTimeoutError && error.timeoutMs === 10,
  );
  assert.strictEqual(timeoutAbortedProvider, true, 'Timeout should abort the provider request.');

  supabaseConfigured = false;
  assert.deepStrictEqual(getRouteCatalogViewportProviderAvailability(), {
    available: false,
    safeErrorCode: 'SUPABASE_CONFIG_UNAVAILABLE',
    reason: 'supabase_not_configured',
  });
  await assert.rejects(
    fetchRouteCatalogViewportFeatures(query),
    (error) => error instanceof RouteCatalogViewportProviderUnavailableError
      && error.safeErrorCode === 'SUPABASE_CONFIG_UNAVAILABLE'
      && error.reason === 'supabase_not_configured',
  );
  assert.strictEqual(defaultInvokeCount, 0, 'Missing configuration should terminate before provider invocation.');

  supabaseConfigured = true;
  routeCatalogSearchDeployed = false;
  assert.deepStrictEqual(getRouteCatalogViewportProviderAvailability(), {
    available: false,
    safeErrorCode: 'EDGE_FUNCTION_UNAVAILABLE',
    reason: 'edge_function_unavailable',
  });
  await assert.rejects(
    fetchRouteCatalogViewportFeatures(query),
    (error) => error instanceof RouteCatalogViewportProviderUnavailableError
      && error.safeErrorCode === 'EDGE_FUNCTION_UNAVAILABLE'
      && error.reason === 'edge_function_unavailable',
  );
  assert.strictEqual(defaultInvokeCount, 0, 'An undeployed Edge Function should terminate before invocation.');

  routeCatalogSearchDeployed = true;
  assert.deepStrictEqual(getRouteCatalogViewportProviderAvailability(), {
    available: true,
    safeErrorCode: null,
    reason: 'active',
  });
  console.log('Route catalog viewport client checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
