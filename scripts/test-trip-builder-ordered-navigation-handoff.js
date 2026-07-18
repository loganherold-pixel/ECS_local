const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
global.__DEV__ = false;

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  if (
    request === './keyValuePersistence' &&
    parent?.filename.endsWith(path.join('lib', 'navigationHandoffStore.ts'))
  ) {
    return {
      createPersistedKeyValueCache: () => ({
        waitForHydration: async () => {},
        get: () => null,
        set: () => {},
      }),
    };
  }
  return originalLoad(request, parent, isMain);
};

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
  getNavigationHandoffPreparedRoadRoute,
  loadNavigationHandoffPayload,
  saveNavigationHandoffPayload,
} = require(path.join(root, 'lib', 'navigationHandoffStore.ts'));

const origin = { lat: 38.7, lng: -121.3 };
const fuel = { lat: 38.8, lng: -121.2 };
const trailhead = { lat: 38.9, lng: -121.1 };
const destination = {
  id: 'trip-plan-route',
  title: 'Selected trailhead',
  subtitle: 'Trip Builder approach',
  coordinate: trailhead,
  sourceType: 'explore_handoff',
};
const preparedRoadRoute = {
  id: 'prepared-road-route',
  routeVersion: 'prepared-road-route:v1',
  mapboxRouteUuid: 'fixture-route',
  providerMetadata: { provider: 'mapbox_directions', profile: 'driving-traffic' },
  guidance: {
    id: 'prepared-road-guidance',
    routeVersion: 'prepared-road-route:v1',
    geometry: [origin, fuel, trailhead],
    steps: [
      { id: 'fuel-guidance-step', instruction: 'Arrive at fuel' },
      { id: 'trailhead-guidance-step', instruction: 'Arrive at trailhead' },
    ],
    legs: [
      { legIndex: 0, steps: [{ id: 'fuel-guidance-step' }] },
      { legIndex: 1, steps: [{ id: 'trailhead-guidance-step' }] },
    ],
    guidanceMode: 'turn_by_turn',
  },
  origin,
  destination,
  geometry: [origin, fuel, trailhead],
  distanceM: 10000,
  durationS: 900,
  steps: [
    { id: 'fuel-step', instruction: 'Arrive at fuel', location: fuel },
    { id: 'trailhead-step', instruction: 'Arrive at trailhead', location: trailhead },
  ],
  legs: [
    {
      id: 'origin-fuel',
      summary: 'Origin to fuel',
      stepStartIndex: 0,
      stepEndIndex: 1,
      stepCount: 1,
      arrivalWaypoint: {
        id: 'fuel-stop',
        title: 'Last Fuel',
        subtitle: 'Fuel before remote entry',
        coordinate: fuel,
        role: 'fuel',
        routeDistanceFromStartM: 4000,
      },
    },
    {
      id: 'fuel-trailhead',
      summary: 'Fuel to trailhead',
      stepStartIndex: 1,
      stepEndIndex: 2,
      stepCount: 1,
      arrivalWaypoint: {
        id: 'trip-plan-route',
        title: 'Selected trailhead',
        subtitle: 'Trip Builder approach',
        coordinate: trailhead,
        role: 'destination',
      },
    },
  ],
  orderedWaypoints: [{
    id: 'fuel-stop',
    title: 'Last Fuel',
    subtitle: 'Fuel before remote entry',
    coordinate: fuel,
    role: 'fuel',
    routeDistanceFromStartM: 4000,
  }],
  guidanceMode: 'turn_by_turn',
  bounds: { north: 38.9, south: 38.7, east: -121.1, west: -121.3 },
  createdAt: '2026-07-17T12:00:00.000Z',
};

const payload = {
  id: 'trip-plan-route',
  source: 'explore',
  type: 'hybrid_route',
  title: 'Trip plan route',
  subtitle: 'Origin, fuel, trailhead, trail end',
  coordinate: { lat: 39, lng: -121 },
  trailheadCoordinate: trailhead,
  roadDestinationCoordinate: trailhead,
  trailGeometry: [trailhead, { lat: 39, lng: -121 }],
  trailLengthMiles: 12,
  trailCategory: 'Imported GPX',
  tripMode: 'hybrid',
  routeSource: 'built',
  requiresOnlineRouting: false,
  preparedRoadRoute,
  trailWaypoints: [],
  trailDecisionPoints: [],
  routeMetadata: { tripBuilderCanonicalState: 'ready' },
  landmarkMetadata: null,
  raw: null,
  createdAt: '2026-07-17T12:00:00.000Z',
};

(async () => {
  assert.strictEqual(
    getNavigationHandoffPreparedRoadRoute(payload),
    preparedRoadRoute,
    'A provider-normalized multi-leg road approach should remain eligible for Navigate.',
  );
  assert.strictEqual(
    getNavigationHandoffPreparedRoadRoute({
      preparedRoadRoute: { ...preparedRoadRoute, geometry: [origin] },
    }),
    null,
    'Malformed or incomplete prepared geometry must not enter Navigate.',
  );
  assert.strictEqual(
    getNavigationHandoffPreparedRoadRoute({
      preparedRoadRoute: {
        ...preparedRoadRoute,
        guidanceMode: 'summary_only',
        guidance: { ...preparedRoadRoute.guidance, guidanceMode: 'summary_only' },
      },
      trailheadCoordinate: trailhead,
    }),
    null,
    'A summary-only route must not be restored as cached turn-by-turn guidance.',
  );
  assert.strictEqual(
    getNavigationHandoffPreparedRoadRoute({
      preparedRoadRoute,
      trailheadCoordinate: { lat: 40, lng: -120 },
    }),
    null,
    'A cached road route whose destination no longer matches the selected trailhead must be rejected.',
  );

  const browserStorage = new Map();
  global.localStorage = {
    getItem: (key) => browserStorage.get(key) ?? null,
    setItem: (key, value) => browserStorage.set(key, String(value)),
    removeItem: (key) => browserStorage.delete(key),
  };
  await saveNavigationHandoffPayload(payload);
  const restored = await loadNavigationHandoffPayload();
  assert.ok(restored);
  assert.deepStrictEqual(
    restored.preparedRoadRoute.legs.map((leg) => leg.summary),
    ['Origin to fuel', 'Fuel to trailhead'],
    'Persisted handoff must preserve ordered road legs for stop-by-stop turn guidance.',
  );
  assert.deepStrictEqual(
    restored.preparedRoadRoute.geometry,
    [origin, fuel, trailhead],
    'Persisted handoff must preserve the seamless approach geometry through selected stops.',
  );
  assert.deepStrictEqual(
    restored.preparedRoadRoute.orderedWaypoints.map((waypoint) => ({
      id: waypoint.id,
      title: waypoint.title,
      role: waypoint.role,
    })),
    [{ id: 'fuel-stop', title: 'Last Fuel', role: 'fuel' }],
    'Persisted handoff must retain ordered waypoint descriptors for later reroutes.',
  );

  console.log('Trip Builder ordered navigation handoff regression passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
