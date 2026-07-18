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
  const localRequire = (request) => {
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
          return `Continue to ${title || 'destination'}`;
        },
      };
    }
    if (request === './navigation/ecsGuidanceModel') {
      return loadTsModule(path.join('lib', 'navigation', 'ecsGuidanceModel.ts'));
    }
    if (request.startsWith('.')) {
      const target = path.relative(root, path.join(path.dirname(filename), `${request}.ts`));
      return loadTsModule(target);
    }
    return require(request);
  };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(mod.exports, localRequire, mod, filename, path.dirname(filename));
  return mod.exports;
}

const {
  fetchRoadRouteAlternatives,
  getValidatedRoadNavRoute,
  getRemainingRoadRouteWaypoints,
  ROAD_NAV_MAX_INTERMEDIATE_WAYPOINTS,
  ROAD_NAV_TOO_MANY_WAYPOINTS_SAFE_CODE,
} = loadTsModule(path.join('lib', 'mapboxRoadNavigation.ts'));

const destination = {
  id: 'field-office',
  title: 'Field Office',
  subtitle: 'QA route target',
  coordinate: { lat: 38.7824, lng: -121.2063 },
  sourceType: 'manual_selection',
};

function buildStep(overrides = {}) {
  return {
    distance: 120,
    duration: 55,
    name: 'Sierra College Boulevard',
    maneuver: {
      instruction: 'Turn right onto Sierra College Boulevard',
      type: 'turn',
      modifier: 'right',
      location: [-121.2076, 38.7816],
    },
    geometry: {
      coordinates: [
        [-121.2076, 38.7816],
        [-121.2063, 38.7816],
      ],
    },
    bannerInstructions: [
      {
        distanceAlongGeometry: 120,
        primary: {
          text: 'Sierra College Boulevard',
          type: 'turn',
          modifier: 'right',
        },
      },
    ],
    voiceInstructions: [
      {
        distanceAlongGeometry: 100,
        announcement: 'Turn right onto Sierra College Boulevard',
        ssmlAnnouncement: '<speak>Turn right onto Sierra College Boulevard</speak>',
      },
    ],
    ...overrides,
  };
}

function buildRoute(overrides = {}) {
  return {
    uuid: 'mapbox-route-uuid-123',
    distance: 270,
    duration: 120,
    geometry: {
      coordinates: [
        [-121.2076, 38.7807],
        [-121.2076, 38.7816],
        [-121.2063, 38.7816],
        [-121.2063, 38.7824],
      ],
    },
    legs: [
      {
        summary: 'Southside Ranch Road, Sierra College Boulevard',
        distance: 270,
        duration: 120,
        steps: [
          buildStep({
            distance: 100,
            duration: 40,
            name: 'Southside Ranch Road',
            maneuver: {
              instruction: 'Head north on Southside Ranch Road',
              type: 'depart',
              location: [-121.2076, 38.7807],
            },
          }),
          buildStep(),
        ],
      },
    ],
    ...overrides,
  };
}

async function withMockedFetch(payload, callback) {
  const originalFetch = global.fetch;
  let requestedUrl = null;
  global.fetch = async (input) => {
    requestedUrl = String(input);
    return {
      ok: true,
      json: async () => payload,
    };
  };

  try {
    const result = await callback(() => requestedUrl);
    return result;
  } finally {
    global.fetch = originalFetch;
  }
}

async function fetchRoutes(payload, getUrlCallback) {
  return fetchRoadRouteAlternatives({
    accessToken: 'test-token',
    origin: { lat: 38.7807, lng: -121.2076 },
    destination,
  }).then((routes) => ({ routes, requestedUrl: getUrlCallback() }));
}

async function testTurnByTurnRequestAndParser() {
  const { routes, requestedUrl } = await withMockedFetch(
    { routes: [buildRoute()] },
    (getRequestedUrl) => fetchRoutes(null, getRequestedUrl),
  );

  const url = new URL(requestedUrl);
  assert.strictEqual(url.searchParams.get('steps'), 'true');
  assert.strictEqual(url.searchParams.get('banner_instructions'), 'true');
  assert.strictEqual(url.searchParams.get('voice_instructions'), 'true');
  assert.strictEqual(url.searchParams.get('voice_units'), 'imperial');
  assert.strictEqual(url.searchParams.get('language'), 'en');
  assert.strictEqual(url.searchParams.get('roundabout_exits'), 'true');
  assert.strictEqual(url.searchParams.get('overview'), 'full');
  assert.strictEqual(url.searchParams.get('geometries'), 'geojson');
  assert.strictEqual(url.searchParams.get('alternatives'), 'true');
  assert.strictEqual(url.searchParams.get('annotations'), 'distance,duration,speed');

  assert.strictEqual(routes.length, 1);
  assert.strictEqual(routes[0].guidanceMode, 'turn_by_turn');
  assert.strictEqual(routes[0].guidance.guidanceMode, 'turn_by_turn');
  assert.strictEqual(routes[0].guidance.source, 'mapbox_directions');
  assert.strictEqual(routes[0].guidance.routeUuid, 'mapbox-route-uuid-123');
  assert.strictEqual(routes[0].guidance.distanceMeters, 270);
  assert.strictEqual(routes[0].guidance.durationSeconds, 120);
  assert.strictEqual(routes[0].guidance.steps.length, 2);
  assert.strictEqual(routes[0].guidance.steps[1].displayRoadName, 'Sierra College Boulevard');
  assert.strictEqual(routes[0].mapboxRouteUuid, 'mapbox-route-uuid-123');
  assert.strictEqual(routes[0].legs.length, 1);
  assert.strictEqual(routes[0].legs[0].stepCount, 2);
  assert.strictEqual(routes[0].steps.length, 2);
  assert.strictEqual(routes[0].steps[1].instruction, 'Turn right onto Sierra College Boulevard');
  assert.strictEqual(routes[0].steps[1].bannerInstructions.length, 1);
  assert.strictEqual(routes[0].steps[1].bannerInstructions[0].primaryText, 'Sierra College Boulevard');
  assert.strictEqual(routes[0].steps[1].voiceInstructions.length, 1);
  assert.strictEqual(routes[0].steps[1].voiceInstructions[0].announcement, 'Turn right onto Sierra College Boulevard');
}

async function testSummaryOnlyWhenNoSteps() {
  const { routes } = await withMockedFetch(
    { routes: [buildRoute({ legs: [{ summary: 'Geometry only', distance: 270, duration: 120, steps: [] }] })] },
    (getRequestedUrl) => fetchRoutes(null, getRequestedUrl),
  );

  assert.strictEqual(routes.length, 1);
  assert.strictEqual(routes[0].guidanceMode, 'summary_only');
  assert.strictEqual(routes[0].guidance.guidanceMode, 'summary_only');
  assert.strictEqual(routes[0].guidance.steps.length, 0);
  assert.strictEqual(routes[0].legs.length, 1);
  assert.strictEqual(routes[0].legs[0].stepCount, 0);
  assert.strictEqual(routes[0].steps.length, 1);
  assert.strictEqual(routes[0].steps[0].maneuverType, 'summary');
  assert.match(routes[0].steps[0].instruction, /Continue to Field Office/);
}

async function testDefensiveMissingStepFields() {
  const { routes } = await withMockedFetch(
    {
      routes: [
        buildRoute({
          legs: [
            {
              summary: '',
              distance: 270,
              duration: 120,
              steps: [
                {
                  distance: 88,
                  duration: 44,
                  bannerInstructions: [],
                  voiceInstructions: [],
                },
              ],
            },
          ],
        }),
      ],
    },
    (getRequestedUrl) => fetchRoutes(null, getRequestedUrl),
  );

  assert.strictEqual(routes.length, 1);
  assert.strictEqual(routes[0].guidanceMode, 'turn_by_turn');
  assert.strictEqual(routes[0].steps.length, 1);
  assert.strictEqual(routes[0].steps[0].instruction, 'Continue');
  assert.strictEqual(routes[0].steps[0].maneuverType, 'continue');
  assert.deepStrictEqual(routes[0].steps[0].geometry, []);
  assert.deepStrictEqual(routes[0].steps[0].bannerInstructions, []);
  assert.deepStrictEqual(routes[0].steps[0].voiceInstructions, []);
}

async function testOrderedIntermediateStopsUseOneMultiLegRequest() {
  const fuelStop = { lat: 38.7811, lng: -121.2074 };
  const supplyStop = { lat: 38.7818, lng: -121.2069 };
  const fuelWaypoint = {
    id: 'fuel-stop',
    title: 'Last Fuel',
    subtitle: 'Fuel before remote entry',
    coordinate: fuelStop,
    role: 'fuel',
  };
  const supplyWaypoint = {
    id: 'supply-stop',
    title: 'Groceries and Supplies',
    subtitle: 'Final supply stop',
    coordinate: supplyStop,
    role: 'resupply',
  };
  const multiLegRoute = buildRoute({
    legs: [
      {
        summary: 'Origin to fuel',
        distance: 90,
        duration: 40,
        steps: [buildStep({
          distance: 90,
          duration: 40,
          maneuver: {
            instruction: 'Continue to fuel stop',
            type: 'arrive',
            location: [fuelStop.lng, fuelStop.lat],
          },
        })],
      },
      {
        summary: 'Fuel to supplies',
        distance: 80,
        duration: 35,
        steps: [buildStep({
          distance: 80,
          duration: 35,
          maneuver: {
            instruction: 'Continue to supply stop',
            type: 'arrive',
            location: [supplyStop.lng, supplyStop.lat],
          },
        })],
      },
      {
        summary: 'Supplies to trailhead',
        distance: 100,
        duration: 45,
        steps: [buildStep({
          distance: 100,
          duration: 45,
          maneuver: {
            instruction: 'Continue to trailhead',
            type: 'arrive',
            location: [destination.coordinate.lng, destination.coordinate.lat],
          },
        })],
      },
    ],
  });

  const { routes, requestedUrl } = await withMockedFetch(
    { routes: [multiLegRoute] },
    async (getRequestedUrl) => {
      const result = await fetchRoadRouteAlternatives({
        accessToken: 'test-token',
        origin: { lat: 38.7807, lng: -121.2076 },
        waypoints: [fuelWaypoint, supplyWaypoint],
        destination,
      });
      return { routes: result, requestedUrl: getRequestedUrl() };
    },
  );

  const encodedCoordinates = decodeURIComponent(new URL(requestedUrl).pathname);
  assert.match(
    encodedCoordinates,
    /-121\.2076,38\.7807;-121\.2074,38\.7811;-121\.2069,38\.7818;-121\.2063,38\.7824$/,
    'Directions must receive origin, ordered resupply stops, then trailhead in one request.',
  );
  assert.strictEqual(routes[0].legs.length, 3);
  assert.deepStrictEqual(
    routes[0].legs.map((leg) => leg.summary),
    ['Origin to fuel', 'Fuel to supplies', 'Supplies to trailhead'],
    'Normalized guidance must preserve the provider leg order through every itinerary stop.',
  );
  assert.deepStrictEqual(
    routes[0].orderedWaypoints.map((waypoint) => ({ id: waypoint.id, title: waypoint.title })),
    [
      { id: 'fuel-stop', title: 'Last Fuel' },
      { id: 'supply-stop', title: 'Groceries and Supplies' },
    ],
    'Prepared guidance must retain named ordered stop descriptors, not anonymous coordinates.',
  );
  assert.deepStrictEqual(
    routes[0].legs.map((leg) => leg.arrivalWaypoint?.title),
    ['Last Fuel', 'Groceries and Supplies', 'Field Office'],
    'Every provider leg should identify its named arrival, including the final destination.',
  );
  assert.deepStrictEqual(
    routes[0].steps.map((step) => step.instruction),
    ['Arrive at Last Fuel', 'Arrive at Groceries and Supplies', 'Arrive at Field Office'],
    'Arrival maneuvers should name the itinerary stop reached by that leg.',
  );
  assert.deepStrictEqual(
    routes[0].guidance.steps.map((step) => step.instruction),
    ['Arrive at Last Fuel', 'Arrive at Groceries and Supplies', 'Arrive at Field Office'],
    'The mounted active-guidance contract should receive the same named arrivals.',
  );
  assert.strictEqual(
    getValidatedRoadNavRoute(routes[0], { requireTurnByTurn: true }),
    routes[0],
    'The canonical persisted-route validator must retain valid ordered waypoint descriptors.',
  );
  assert.strictEqual(
    getValidatedRoadNavRoute({
      ...routes[0],
      orderedWaypoints: [{ ...routes[0].orderedWaypoints[0], coordinate: { lat: 999, lng: 999 } }],
    }),
    null,
    'Invalid persisted stop coordinates must not enter reroute guidance.',
  );

  return routes[0];
}

async function testReroutePreservesOnlyUnreachedStops() {
  const preparedRoute = await testOrderedIntermediateStopsUseOneMultiLegRequest();
  const remaining = getRemainingRoadRouteWaypoints(preparedRoute, {
    currentLegIndex: 1,
    currentStepIndex: 1,
    routeDistanceFromStartM: 100,
  });
  assert.deepStrictEqual(
    remaining.map((waypoint) => waypoint.id),
    ['supply-stop'],
    'After reaching fuel, reroute must retain the unreached supply stop and omit the completed stop.',
  );

  const rerouteOrigin = { lat: 38.7813, lng: -121.2072 };
  const rerouteResponse = buildRoute({
    legs: [
      {
        summary: 'Current location to supplies',
        distance: 70,
        duration: 30,
        steps: [buildStep({
          distance: 70,
          duration: 30,
          maneuver: {
            instruction: 'Arrive at supply stop',
            type: 'arrive',
            location: [-121.2069, 38.7818],
          },
        })],
      },
      {
        summary: 'Supplies to trailhead',
        distance: 100,
        duration: 45,
        steps: [buildStep({
          distance: 100,
          duration: 45,
          maneuver: {
            instruction: 'Arrive at trailhead',
            type: 'arrive',
            location: [destination.coordinate.lng, destination.coordinate.lat],
          },
        })],
      },
    ],
  });
  const { routes, requestedUrl } = await withMockedFetch(
    { routes: [rerouteResponse] },
    async (getRequestedUrl) => {
      const result = await fetchRoadRouteAlternatives({
        accessToken: 'test-token',
        origin: rerouteOrigin,
        waypoints: remaining,
        destination,
        rerouteGeneration: 1,
      });
      return { routes: result, requestedUrl: getRequestedUrl() };
    },
  );
  const encodedCoordinates = decodeURIComponent(new URL(requestedUrl).pathname);
  assert.match(
    encodedCoordinates,
    /-121\.2072,38\.7813;-121\.2069,38\.7818;-121\.2063,38\.7824$/,
    'Reroute must request current location, remaining supply stop, then the final trailhead.',
  );
  assert.ok(!encodedCoordinates.includes('-121.2074,38.7811'));
  assert.deepStrictEqual(routes[0].orderedWaypoints.map((waypoint) => waypoint.id), ['supply-stop']);
}

async function testWaypointLimitTerminatesWithoutDroppingStops() {
  const tooManyWaypoints = Array.from(
    { length: ROAD_NAV_MAX_INTERMEDIATE_WAYPOINTS + 1 },
    (_, index) => ({
      id: `stop-${index + 1}`,
      title: `Stop ${index + 1}`,
      subtitle: null,
      role: 'resupply',
      coordinate: {
        lat: 38.7808 + index * 0.00002,
        lng: -121.2075 + index * 0.00002,
      },
    }),
  );
  let fetchCount = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    fetchCount += 1;
    throw new Error('Provider request should not run');
  };
  try {
    await assert.rejects(
      fetchRoadRouteAlternatives({
        accessToken: 'test-token',
        origin: { lat: 38.7807, lng: -121.2076 },
        destination,
        waypoints: tooManyWaypoints,
      }),
      (error) => (
        error?.safeCode === ROAD_NAV_TOO_MANY_WAYPOINTS_SAFE_CODE &&
        /up to 23 ordered intermediate stops/i.test(error.message)
      ),
      'More than 23 intermediate stops must produce an explicit terminal error.',
    );
  } finally {
    global.fetch = originalFetch;
  }
  assert.strictEqual(fetchCount, 0, 'An over-limit itinerary must not issue a truncated provider request.');
}

Promise.resolve()
  .then(testTurnByTurnRequestAndParser)
  .then(testSummaryOnlyWhenNoSteps)
  .then(testDefensiveMissingStepFields)
  .then(testReroutePreservesOnlyUnreachedStops)
  .then(testWaypointLimitTerminatesWithoutDroppingStops)
  .then(() => {
    console.log('Mapbox road navigation turn-by-turn request/parser regression passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
