const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

require.extensions['.ts'] = function compileTs(module, filename) {
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

const originalLoad = Module._load;
Module._load = function loadWithMapboxRoadNavigationShims(request, parent, isMain) {
  if (request === './mapConfig' && parent?.filename?.endsWith(path.join('lib', 'mapboxRoadNavigation.ts'))) {
    return {
      computeBounds: () => ({
        minLat: 0,
        maxLat: 0,
        minLng: 0,
        maxLng: 0,
      }),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  createMapboxPlacesProviderAdapter,
} = require(path.join(root, 'lib', 'tripBuilder', 'mapboxRouteContextAdapters.ts'));
const {
  resolveRoadDestination,
  searchRoadDestinations,
} = require(path.join(root, 'lib', 'mapboxRoadNavigation.ts'));
const {
  classifyApproachResupplyProviderCoverage,
} = require(path.join(root, 'lib', 'tripBuilder', 'approachResupplyPlanner.ts'));

const billingGuardPath = path.join(root, 'lib', 'mapboxSearchBillingGuard.ts');
assert.ok(
  fs.existsSync(billingGuardPath),
  'Missing Mapbox Search Box billing guard instrumentation module.',
);
const {
  analyzeMapboxSearchBillingEvents,
  formatMapboxSearchBillingReadinessReport,
  setMapboxSearchBillingEventSink,
  clearMapboxSearchBillingEventSink,
} = require(billingGuardPath);

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function searchBoxSessionTokens(urls) {
  return urls
    .map((url) => new URL(url))
    .filter((url) => url.hostname === 'api.mapbox.com' && url.pathname.includes('/search/searchbox/v1/'))
    .map((url) => url.searchParams.get('session_token'))
    .filter(Boolean);
}

async function captureBillingEvents(run) {
  const events = [];
  setMapboxSearchBillingEventSink((event) => events.push(event));
  try {
    await run(events);
  } finally {
    clearMapboxSearchBillingEventSink();
  }
  return events;
}

function assertBillingPass(events, scenario) {
  const result = analyzeMapboxSearchBillingEvents(events);
  assert.strictEqual(
    result.status,
    'pass',
    `${scenario} should not carry Mapbox billing risk.\n${formatMapboxSearchBillingReadinessReport(result)}`,
  );
  return result;
}

async function runAdapterSessionReuseRegression() {
  const requestedUrls = [];
  global.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url.includes('/search/searchbox/v1/suggest')) {
      return jsonResponse({
        suggestions: [
          {
            mapbox_id: 'place.1',
            name: 'Approach Fuel Stop',
            place_formatted: 'Moab, UT',
            feature_type: 'poi',
          },
          {
            mapbox_id: 'place.2',
            name: 'Rim Fuel Station',
            place_formatted: 'Moab, UT',
            feature_type: 'poi',
          },
          {
            mapbox_id: 'place.3',
            name: 'Fuel Cafe',
            place_formatted: 'Moab, UT',
            feature_type: 'poi',
            poi_category: ['restaurant'],
          },
        ],
      });
    }

    if (url.includes('/search/searchbox/v1/retrieve/place.1')) {
      return jsonResponse({
        features: [{
          properties: {
            name: 'Approach Fuel Stop',
            full_address: '1 Trail Rd, Moab, UT',
          },
          geometry: { coordinates: [-109.55, 38.57] },
        }],
      });
    }

    if (url.includes('/search/searchbox/v1/retrieve/place.2')) {
      return jsonResponse({
        features: [{
          properties: {
            name: 'Rim Fuel Station',
            full_address: '2 Rim Rd, Moab, UT',
          },
          geometry: { coordinates: [-109.56, 38.58] },
        }],
      });
    }

    if (url.includes('/search/searchbox/v1/retrieve/place.3')) {
      return jsonResponse({
        features: [{
          properties: {
            name: 'Fuel Cafe',
            full_address: '3 Cafe Rd, Moab, UT',
            poi_category: ['restaurant'],
          },
          geometry: { coordinates: [-109.57, 38.59] },
        }],
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  let tokenFactoryCalls = 0;
  const provider = createMapboxPlacesProviderAdapter('mapbox-token', () => {
    tokenFactoryCalls += 1;
    return `operator-search-${tokenFactoryCalls}`;
  });

  const events = await captureBillingEvents(async () => {
    const places = await provider.searchText({
      query: 'fuel near trailhead',
      categories: ['gas'],
      limit: 2,
      center: { lat: 38.57, lng: -109.55 },
    });

    assert.strictEqual(places.length, 2, 'The adapter should keep valid fuel POIs and reject a restaurant returned for the fuel query.');
    assert.ok(places.every((place) => !/cafe/i.test(place.name)));
  });

  assert.strictEqual(
    tokenFactoryCalls,
    1,
    'A single operator search interaction should allocate exactly one Search Box session token.',
  );
  assert.deepStrictEqual(
    [...new Set(searchBoxSessionTokens(requestedUrls))],
    ['operator-search-1'],
    'Suggest and all retrieve calls in one search interaction should share the same Search Box session token.',
  );
  const result = assertBillingPass(events, 'Route Context places adapter');
  assert.ok(
    result.flowSummaries.some((summary) => summary.flow === 'trip_builder_route_context_places'),
    'Route Context places adapter should emit flow-labeled billing telemetry.',
  );
}

function runSearchFallbackLatencyContract() {
  const source = fs.readFileSync(path.join(root, 'lib', 'mapboxRoadNavigation.ts'), 'utf8');
  assert(
      source.includes('const SEARCHBOX_SUGGEST_TIMEOUT_MS = 2000;') &&
      source.includes('const FORWARD_GEOCODE_TIMEOUT_MS = 2500;') &&
      source.includes('const SEARCHBOX_SUGGEST_DEFAULT_LIMIT = 5;') &&
      source.includes('const SEARCHBOX_SUGGEST_MAX_LIMIT = 10;') &&
      source.includes('params.limit ?? SEARCHBOX_SUGGEST_DEFAULT_LIMIT') &&
      source.includes('Math.min(params.limit ?? SEARCHBOX_SUGGEST_DEFAULT_LIMIT, SEARCHBOX_SUGGEST_MAX_LIMIT)'),
    'Road search should keep bounded timeouts, retain the compact default, and allow the provider-supported ten-result maximum.',
  );
}

async function runExpandedSuggestLimitContract() {
  let requestedUrl = null;
  global.fetch = async (input) => {
    requestedUrl = String(input);
    return jsonResponse({ suggestions: [] });
  };
  const suggestions = await searchRoadDestinations({
    accessToken: 'mapbox-token',
    query: 'fuel station',
    sessionToken: 'expanded-limit-session',
    proximity: { lat: 38.56, lng: -109.54 },
    limit: 20,
    forwardGeocodeFallback: false,
    billingContext: {
      flow: 'trip_builder_smart_resupply',
      surface: 'Trip Builder',
      operatorAction: 'expanded result window regression',
    },
  });
  assert.deepStrictEqual(suggestions, []);
  assert.strictEqual(
    new URL(requestedUrl).searchParams.get('limit'),
    '10',
    'Smart Resupply should receive the provider-supported ten suggestions instead of the old five-result clamp.',
  );
}

function runMobileInteractionBudgetContract() {
  const source = fs.readFileSync(path.join(root, 'lib', 'useRoadNavigation.ts'), 'utf8');
  assert(
    source.includes('const SEARCH_DEBOUNCE_MS = 180;') &&
      source.includes('const REROUTE_COOLDOWN_MS = 3500;') &&
      source.includes('const ROUTE_REQUEST_TIMEOUT_MS = 12000;'),
    'Road navigation should keep mobile search, off-route recalculation, and route-request budgets responsive.',
  );
}

function runBillingReadinessGateContract() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(
    fs.existsSync(path.join(root, 'scripts', 'check-mapbox-searchbox-billing-readiness.mjs')),
    'A focused Mapbox Search Box billing readiness gate should exist for pre-ship checks.',
  );
  assert.strictEqual(
    packageJson.scripts['gate:mapbox-searchbox-billing'],
    'node scripts/check-mapbox-searchbox-billing-readiness.mjs',
    'package.json should expose a Mapbox Search Box billing readiness gate.',
  );
}

async function runQuotaFallbackRegression() {
  const requestedUrls = [];
  global.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url.includes('/search/searchbox/v1/suggest')) {
      return jsonResponse({ message: 'Rate limit exceeded' }, 429);
    }

    if (url.includes('/geocoding/v5/mapbox.places/')) {
      return jsonResponse({
        features: [{
          id: 'poi.123',
          text: 'Fallback Fuel',
          place_name: 'Fallback Fuel, Moab, Utah',
          center: [-109.54, 38.56],
        }],
      });
    }

    if (url.includes('/search/searchbox/v1/retrieve')) {
      throw new Error('Search Box retrieve should not be called for a geocoding fallback coordinate.');
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const events = await captureBillingEvents(async () => {
    const suggestions = await searchRoadDestinations({
      accessToken: 'mapbox-token',
      query: 'fallback fuel',
      sessionToken: 'operator-search-fallback',
      proximity: { lat: 38.56, lng: -109.54 },
      billingContext: {
        flow: 'navigate_destination_search',
        surface: 'Navigate',
        operatorAction: 'quota fallback search',
      },
    });

    assert.strictEqual(suggestions.length, 1, 'Forward geocode fallback should still produce a usable suggestion.');
    assert.strictEqual(suggestions[0].sourceType, 'forward_geocode');

    const destination = await resolveRoadDestination({
      accessToken: 'mapbox-token',
      sessionToken: 'operator-search-fallback',
      suggestion: suggestions[0],
      billingContext: {
        flow: 'navigate_destination_search',
        surface: 'Navigate',
        operatorAction: 'quota fallback selection',
      },
    });

    assert.strictEqual(destination.sourceType, 'forward_geocode');
    assert.deepStrictEqual(destination.coordinate, { lat: 38.56, lng: -109.54 });
  });
  assert.strictEqual(
    requestedUrls.some((url) => url.includes('/search/searchbox/v1/retrieve')),
    false,
    'Quota-limited fallback should not spend another Search Box call when geocoding already supplied coordinates.',
  );
  assert.ok(
    events.some((event) => event.operation === 'forward_geocode_fallback'),
    'Quota-limited search should emit an explicit geocode fallback billing event.',
  );
  assert.ok(
    !events.some((event) => event.operation === 'searchbox_retrieve'),
    'Quota-limited fallback with coordinates should not emit a Search Box retrieve billing event.',
  );
  assertBillingPass(events, 'Navigate quota fallback');
}

async function runSearchboxFailureSurfaceContract() {
  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/search/searchbox/v1/suggest')) {
      return jsonResponse({ message: 'Provider unavailable' }, 503);
    }
    throw new Error(`Unexpected fallback request: ${url}`);
  };

  let failedAnchorCount = 0;
  let coveredAnchorCount = 0;
  try {
    await searchRoadDestinations({
      accessToken: 'mapbox-token',
      query: 'fuel',
      sessionToken: 'resupply-provider-failure',
      proximity: { lat: 38.56, lng: -109.54 },
      forwardGeocodeFallback: false,
      throwOnSearchboxError: true,
      billingContext: {
        flow: 'trip_builder_smart_resupply',
        surface: 'Trip Builder',
        operatorAction: 'provider failure fixture',
      },
    });
    coveredAnchorCount += 1;
  } catch (error) {
    failedAnchorCount += 1;
    assert.match(String(error), /suggestion request failed/i);
  }

  assert.strictEqual(coveredAnchorCount, 0, 'A failed Search Box request must not count as valid empty anchor coverage.');
  assert.strictEqual(failedAnchorCount, 1);
  assert.strictEqual(
    classifyApproachResupplyProviderCoverage({
      expectedAnchorCount: 1,
      coveredAnchorCount,
      failedAnchorCount,
      resultCount: 0,
    }),
    'retryable_error',
    'Search Box failure with no fallback results must remain provider error, not no-results.',
  );
}

function runFlowLevelRiskFixtureRegression() {
  const risky = analyzeMapboxSearchBillingEvents([
    {
      flow: 'trip_builder_smart_resupply',
      surface: 'Trip Builder',
      operatorAction: 'fuel search',
      operation: 'searchbox_suggest',
      outcome: 'success',
      sessionToken: 'trip-token-1',
      requestSignature: 'fuel:38.570,-109.550',
      resultCount: 5,
    },
    {
      flow: 'trip_builder_smart_resupply',
      surface: 'Trip Builder',
      operatorAction: 'fuel search duplicate',
      operation: 'searchbox_suggest',
      outcome: 'success',
      sessionToken: 'trip-token-1',
      requestSignature: 'fuel:38.570,-109.550',
      resultCount: 5,
    },
    {
      flow: 'trip_builder_smart_resupply',
      surface: 'Trip Builder',
      operatorAction: 'supplies search',
      operation: 'searchbox_suggest',
      outcome: 'success',
      sessionToken: 'trip-token-2',
      requestSignature: 'supplies:38.580,-109.560',
      resultCount: 4,
    },
    {
      flow: 'navigate_destination_search',
      surface: 'Navigate',
      operatorAction: 'destination fallback',
      operation: 'forward_geocode_fallback',
      outcome: 'success',
      sessionToken: 'nav-token-1',
      requestSignature: 'fallback fuel',
      reason: 'quota_limited',
      resultCount: 1,
    },
    {
      flow: 'navigate_destination_search',
      surface: 'Navigate',
      operatorAction: 'destination fallback selection',
      operation: 'searchbox_retrieve',
      outcome: 'success',
      sessionToken: 'nav-token-1',
      requestSignature: 'fallback fuel',
      suggestionId: 'fallback-fuel',
    },
  ]);

  assert.strictEqual(risky.status, 'fail', 'Billing guard should fail high-risk fixture flows.');
  assert.ok(
    risky.risks.some((risk) => risk.flow === 'trip_builder_smart_resupply' && /2 Search Box sessions/.test(risk.message)),
    'Billing guard should explain when Trip Builder opens more than one Search Box session.',
  );
  assert.ok(
    risky.risks.some((risk) => risk.flow === 'trip_builder_smart_resupply' && /duplicate suggest/i.test(risk.message)),
    'Billing guard should explain duplicate suggest calls inside a flow.',
  );
  assert.ok(
    risky.risks.some((risk) => risk.flow === 'navigate_destination_search' && /retrieve after quota fallback/i.test(risk.message)),
    'Billing guard should catch fallback paths that still perform Search Box retrieve.',
  );
  const unlabeled = analyzeMapboxSearchBillingEvents([{
    flow: 'unlabeled_mapbox_search',
    operation: 'searchbox_suggest',
    outcome: 'success',
    sessionToken: 'unlabeled-token',
    requestSignature: 'unlabeled-query',
    resultCount: 1,
  }]);
  assert.strictEqual(unlabeled.status, 'fail', 'Unlabeled Mapbox Search Box usage should fail readiness.');
  assert.ok(
    unlabeled.risks.some((risk) => /lacks a billing flow label/i.test(risk.message)),
    'Unlabeled Search Box usage should explain that a flow label is required.',
  );
  const report = formatMapboxSearchBillingReadinessReport(risky);
  assert.ok(
    report.includes('trip_builder_smart_resupply') &&
      report.includes('navigate_destination_search') &&
      report.includes('Remediation:'),
    'Billing report should include flow names and remediation text for shipping review.',
  );
}

(async () => {
  runSearchFallbackLatencyContract();
  runMobileInteractionBudgetContract();
  runBillingReadinessGateContract();
  await runAdapterSessionReuseRegression();
  await runExpandedSuggestLimitContract();
  await runQuotaFallbackRegression();
  await runSearchboxFailureSurfaceContract();
  runFlowLevelRiskFixtureRegression();
  console.log('Mapbox Search Box session reuse regression passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
