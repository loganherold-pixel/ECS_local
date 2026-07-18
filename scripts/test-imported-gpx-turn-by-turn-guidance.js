const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const moduleCache = new Map();

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  if (moduleCache.has(filename)) return moduleCache.get(filename).exports;

  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const mod = { exports: {} };
  moduleCache.set(filename, mod);

  function localRequire(request) {
    if (request === './mapConfig') {
      return {
        computeBounds(points) {
          return points.reduce(
            (bounds, point) => ({
              minLat: Math.min(bounds.minLat, point.lat),
              maxLat: Math.max(bounds.maxLat, point.lat),
              minLng: Math.min(bounds.minLng, point.lng),
              maxLng: Math.max(bounds.maxLng, point.lng),
            }),
            {
              minLat: Infinity,
              maxLat: -Infinity,
              minLng: Infinity,
              maxLng: -Infinity,
            },
          );
        },
      };
    }
    if (request === './routeGuidanceCopy') {
      return {
        buildHighlightedRouteInstruction(title) {
          return title ? `Follow highlighted route toward ${title}` : 'Follow highlighted route';
        },
      };
    }
    if (request.startsWith('.')) {
      const tsPath = path.relative(root, path.join(path.dirname(filename), `${request}.ts`));
      return loadTsModule(tsPath);
    }
    return require(request);
  }

  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(mod.exports, localRequire, mod, filename, path.dirname(filename));
  return mod.exports;
}

const mapboxRoadNavigation = loadTsModule(path.join('lib', 'mapboxRoadNavigation.ts'));
const importedRouteGuidance = loadTsModule(path.join('lib', 'importedRouteGuidance.ts'));
const matchingFixture = JSON.parse(
  fs.readFileSync(
    path.join(root, 'fixtures', 'navigation', 'turn-by-turn', 'named-street-route.json'),
    'utf8',
  ),
);
const fixtureGeometry = matchingFixture.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));

const payload = {
  id: 'imported-gpx-alpha',
  source: 'import',
  type: 'hybrid_route',
  title: 'Imported GPX Alpha',
  subtitle: 'Imported route',
  coordinate: fixtureGeometry.at(-1),
  trailheadCoordinate: fixtureGeometry[0],
  roadDestinationCoordinate: fixtureGeometry[0],
  trailGeometry: fixtureGeometry,
  trailLengthMiles: 0.3,
  trailCategory: 'Imported Trail',
  tripMode: 'hybrid',
  routeSource: 'gpx',
  requiresOnlineRouting: false,
  trailWaypoints: [],
  trailDecisionPoints: [],
  routeMetadata: { geometrySource: 'stored_gpx_geometry' },
  landmarkMetadata: null,
  raw: { source: 'fixture' },
  createdAt: '2026-07-12T12:00:00.000Z',
};

async function withMockedFetch(responseBody, callback) {
  const originalFetch = global.fetch;
  let requestedUrl = null;
  let requestCount = 0;
  global.fetch = async (input) => {
    requestCount += 1;
    requestedUrl = String(input);
    return {
      ok: true,
      json: async () => responseBody,
    };
  };
  try {
    return await callback(() => requestedUrl, () => requestCount);
  } finally {
    global.fetch = originalFetch;
  }
}

(async () => {
  const longTrace = Array.from({ length: 180 }, (_, index) => ({
    lat: 38.78 + index * 0.00001,
    lng: -121.21 + index * 0.00001,
  }));
  const sampled = mapboxRoadNavigation.sampleImportedTraceForMapMatching(longTrace);
  assert(sampled.length <= 100, 'Imported trace matching must stay within Mapbox coordinate limits.');
  assert.deepStrictEqual(sampled[0], longTrace[0], 'Map Matching must preserve the trace start.');
  assert.deepStrictEqual(sampled.at(-1), longTrace.at(-1), 'Map Matching must preserve the trace end.');

  const matched = await withMockedFetch(
    { code: 'Ok', matchings: [{ ...matchingFixture, confidence: 0.92 }] },
    async (getRequestedUrl) => {
      const route = await mapboxRoadNavigation.fetchImportedTraceRoadRoute({
        accessToken: 'test-token',
        origin: fixtureGeometry[0],
        destination: {
          id: payload.id,
          title: payload.title,
          subtitle: payload.subtitle,
          coordinate: fixtureGeometry.at(-1),
          sourceType: 'explore_handoff',
        },
        geometry: fixtureGeometry,
      });
      return { route, requestUrl: getRequestedUrl() };
    },
  );

  assert(matched.route, 'A confident imported trace match should produce a road guidance route.');
  const requestUrl = new URL(matched.requestUrl);
  assert.match(requestUrl.pathname, /matching\/v5\/mapbox\/driving\//);
  assert.strictEqual(requestUrl.searchParams.get('steps'), 'true');
  assert.strictEqual(requestUrl.searchParams.get('banner_instructions'), 'true');
  assert.strictEqual(requestUrl.searchParams.get('voice_instructions'), 'true');
  assert.strictEqual(requestUrl.searchParams.get('waypoints'), `0;${fixtureGeometry.length - 1}`);
  assert.strictEqual(matched.route.guidance.source, 'imported_trace');
  assert.strictEqual(matched.route.guidance.guidanceMode, 'turn_by_turn');
  assert.strictEqual(matched.route.providerMetadata.provider, 'mapbox_map_matching');
  assert.strictEqual(matched.route.guidance.steps.length, 3);
  assert.strictEqual(
    matched.route.guidance.steps[1].instruction,
    'Turn right onto Foresthill Road',
    'Imported GPX guidance should expose real named-road maneuvers.',
  );

  const lowConfidenceRoute = await withMockedFetch(
    { code: 'Ok', matchings: [{ ...matchingFixture, confidence: 0.1 }] },
    () => mapboxRoadNavigation.fetchImportedTraceRoadRoute({
      accessToken: 'test-token',
      origin: fixtureGeometry[0],
      destination: {
        id: payload.id,
        title: payload.title,
        subtitle: payload.subtitle,
        coordinate: fixtureGeometry.at(-1),
        sourceType: 'explore_handoff',
      },
      geometry: fixtureGeometry,
    }),
  );
  assert.strictEqual(lowConfidenceRoute, null, 'Low-confidence trace matches must not become guidance.');

  const liveResolution = await withMockedFetch(
    { code: 'Ok', matchings: [{ ...matchingFixture, confidence: 0.92 }] },
    () => importedRouteGuidance.resolveImportedRouteGuidance({
      payload,
      origin: fixtureGeometry[0],
      accessToken: 'test-token',
      liveServicesEnabled: true,
    }),
  );
  assert(liveResolution, 'Imported route resolver should return live matched guidance.');
  assert.strictEqual(liveResolution.source, 'mapbox_map_matching');
  const promoted = importedRouteGuidance.promoteImportedTracePayloadToRoadGuidance(
    payload,
    liveResolution,
  );
  assert.strictEqual(promoted.tripMode, 'road');
  assert.strictEqual(promoted.routeMetadata.activeGuidanceStepCount, 3);

  const offlineResolution = await importedRouteGuidance.resolveImportedRouteGuidance({
    payload,
    origin: fixtureGeometry[0],
    accessToken: null,
    liveServicesEnabled: false,
  });
  assert(offlineResolution, 'An on-trace GPX start should retain geometry guidance offline.');
  assert.strictEqual(offlineResolution.source, 'synthetic_geometry');
  assert(offlineResolution.route.guidance.steps.length >= 2);
  const nearTraceOrigin = {
    lat: fixtureGeometry[0].lat + 0.00008,
    lng: fixtureGeometry[0].lng + 0.00008,
  };
  const preparedNearTrace = importedRouteGuidance.prepareImportedTraceGuidanceGeometry({
    origin: nearTraceOrigin,
    geometry: fixtureGeometry,
  });
  assert(preparedNearTrace, 'A near-trace start should retain stored canonical geometry.');
  assert.deepStrictEqual(
    preparedNearTrace.geometry[0],
    fixtureGeometry[0],
    'Imported guidance must not prepend raw GPS or a straight GPS-to-trace connector.',
  );

  const farOfflineResolution = await importedRouteGuidance.resolveImportedRouteGuidance({
    payload,
    origin: { lat: 39.78, lng: -122.21 },
    accessToken: null,
    liveServicesEnabled: false,
  });
  assert.strictEqual(
    farOfflineResolution,
    null,
    'Offline guidance must not invent a straight road connector from a distant GPS position.',
  );

  const farLiveResolution = await withMockedFetch(
    { code: 'Ok', matchings: [{ ...matchingFixture, confidence: 0.99 }] },
    async (_getRequestedUrl, getRequestCount) => {
      const resolution = await importedRouteGuidance.resolveImportedRouteGuidance({
        payload,
        origin: { lat: 39.78, lng: -122.21 },
        accessToken: 'test-token',
        liveServicesEnabled: true,
      });
      return { resolution, requestCount: getRequestCount() };
    },
  );
  assert.strictEqual(
    farLiveResolution.resolution,
    null,
    'A distant user must retain the hybrid origin-to-trailhead approach instead of promoting the trace to a road route.',
  );
  assert.strictEqual(
    farLiveResolution.requestCount,
    0,
    'A distant user must not issue whole-trace Map Matching because that request omits the user-to-trailhead approach.',
  );

  const navigateSource = fs.readFileSync(
    path.join(root, 'app', '(tabs)', 'navigate.tsx'),
    'utf8',
  );
  assert(navigateSource.includes('resolveImportedRouteGuidance({'));
  assert(navigateSource.includes("await previewRoadRoute(importedTraceGuidance.route, 'explore_handoff')"));
  assert(navigateSource.includes('promoteImportedTracePayloadToRoadGuidance('));
  assert(
    navigateSource.includes('requiresOnlineRouting: usesStoredRouteGeometry ? false : isCustomRoute'),
    'Stored GPX geometry should remain available without a live provider.',
  );

  console.log('Imported GPX turn-by-turn guidance regression passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
