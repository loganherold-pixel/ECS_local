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
            name: 'Trailhead Fuel',
            place_formatted: 'Moab, UT',
            feature_type: 'poi',
          },
          {
            mapbox_id: 'place.2',
            name: 'Rim Grocery',
            place_formatted: 'Moab, UT',
            feature_type: 'poi',
          },
        ],
      });
    }

    if (url.includes('/search/searchbox/v1/retrieve/place.1')) {
      return jsonResponse({
        features: [{
          properties: {
            name: 'Trailhead Fuel',
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
            name: 'Rim Grocery',
            full_address: '2 Rim Rd, Moab, UT',
          },
          geometry: { coordinates: [-109.56, 38.58] },
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

  const places = await provider.searchText({
    query: 'fuel near trailhead',
    categories: ['gas'],
    limit: 2,
    center: { lat: 38.57, lng: -109.55 },
  });

  assert.strictEqual(places.length, 2, 'The adapter should still resolve both Search Box suggestions.');
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

  const suggestions = await searchRoadDestinations({
    accessToken: 'mapbox-token',
    query: 'fallback fuel',
    sessionToken: 'operator-search-fallback',
    proximity: { lat: 38.56, lng: -109.54 },
  });

  assert.strictEqual(suggestions.length, 1, 'Forward geocode fallback should still produce a usable suggestion.');
  assert.strictEqual(suggestions[0].sourceType, 'forward_geocode');

  const destination = await resolveRoadDestination({
    accessToken: 'mapbox-token',
    sessionToken: 'operator-search-fallback',
    suggestion: suggestions[0],
  });

  assert.strictEqual(destination.sourceType, 'forward_geocode');
  assert.deepStrictEqual(destination.coordinate, { lat: 38.56, lng: -109.54 });
  assert.strictEqual(
    requestedUrls.some((url) => url.includes('/search/searchbox/v1/retrieve')),
    false,
    'Quota-limited fallback should not spend another Search Box call when geocoding already supplied coordinates.',
  );
}

(async () => {
  await runAdapterSessionReuseRegression();
  await runQuotaFallbackRegression();
  console.log('Mapbox Search Box session reuse regression passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
