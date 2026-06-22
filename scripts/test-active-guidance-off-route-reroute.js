const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
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
  const localRequire = (request) => {
    if (request === './ecsGuidanceModel' || request === './navigation/ecsGuidanceModel') {
      return loadTsModule(path.join('lib', 'navigation', 'ecsGuidanceModel.ts'));
    }
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
    return require(request);
  };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(mod.exports, localRequire, mod, filename, path.dirname(filename));
  return mod.exports;
}

const {
  resolveEcsActiveGuidanceProgress,
} = loadTsModule(path.join('lib', 'navigation', 'ecsActiveGuidanceController.ts'));
const {
  fetchRoadRouteAlternatives,
} = loadTsModule(path.join('lib', 'mapboxRoadNavigation.ts'));

const ORIGIN_LAT = 38;
const ORIGIN_LNG = -121;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos((ORIGIN_LAT * Math.PI) / 180);

function point(eastMeters, northMeters) {
  return {
    lat: ORIGIN_LAT + northMeters / M_PER_DEG_LAT,
    lng: ORIGIN_LNG + eastMeters / M_PER_DEG_LNG,
  };
}

function lngLat(eastMeters, northMeters) {
  const p = point(eastMeters, northMeters);
  return [p.lng, p.lat];
}

function step(id, index, instruction, roadName, start, end, maneuverType = 'continue', modifier) {
  return {
    id,
    legIndex: 0,
    stepIndex: index,
    globalStepIndex: index,
    instruction,
    shortInstruction: instruction,
    maneuverType,
    ...(modifier ? { maneuverModifier: modifier } : null),
    roadName,
    displayRoadName: roadName,
    isUnnamedRoad: false,
    distanceMeters: Math.hypot(end[0] - start[0], end[1] - start[1]),
    durationSeconds: 30,
    maneuverLocation: lngLat(end[0], end[1]),
    bearingAfter:
      end[0] === start[0]
        ? end[1] >= start[1] ? 0 : 180
        : end[0] >= start[0] ? 90 : 270,
    geometry: [point(start[0], start[1]), point(end[0], end[1])],
  };
}

const routeSteps = [
  step('north-main', 0, 'Continue on Main Street', 'Main Street', [0, 0], [0, 300]),
  step('right-oak', 1, 'Turn right onto Oak Road', 'Oak Road', [0, 300], [140, 300], 'turn', 'right'),
  step('arrive', 2, 'You have arrived at your destination', 'Field Office', [140, 300], [140, 300], 'arrive'),
];

const route = {
  id: 'off-route-test-route',
  source: 'mapbox_directions',
  routeUuid: 'route-uuid',
  geometry: [point(0, 0), point(0, 300), point(140, 300)],
  distanceMeters: 440,
  durationSeconds: 90,
  legs: [{ legIndex: 0, distanceMeters: 440, durationSeconds: 90, steps: routeSteps }],
  steps: routeSteps,
  createdAt: '2026-06-22T12:00:00.000Z',
  rerouteGeneration: 2,
  guidanceMode: 'turn_by_turn',
};

function progressAt(location, previousProgress, extra = {}) {
  return resolveEcsActiveGuidanceProgress({
    currentCoordinate: location,
    currentHeadingDegrees: extra.headingDegrees,
    currentSpeedMetersPerSecond: extra.speedMetersPerSecond,
    currentGpsAccuracyMeters: extra.gpsAccuracyMeters,
    activeRoute: route,
    previousProgress,
    updatedAt: extra.updatedAt ?? '2026-06-22T12:00:00.000Z',
  });
}

const onRoute = progressAt(point(1, 60), null, {
  headingDegrees: 0,
  speedMetersPerSecond: 8,
  gpsAccuracyMeters: 6,
});
assert.strictEqual(onRoute.offRouteStatus, 'on_route');
assert.strictEqual(onRoute.offRouteUpdateCount, 0);
assert.strictEqual(onRoute.offRouteCandidate, false);
assert.strictEqual(onRoute.gpsAccuracyMeters, 6);
assert(onRoute.distanceFromRouteMeters < 5);

const singleJump = progressAt(point(44, 120), onRoute, {
  headingDegrees: 90,
  speedMetersPerSecond: 10,
  gpsAccuracyMeters: 5,
});
assert.strictEqual(singleJump.offRouteStatus, 'off_route_candidate');
assert.strictEqual(singleJump.offRouteUpdateCount, 1);
assert.strictEqual(singleJump.offRouteCandidate, true);
assert(singleJump.distanceFromRouteMeters > 35);
assert(singleJump.headingDivergenceDegrees > 60);

const confirmedOffRoute = progressAt(point(52, 135), singleJump, {
  headingDegrees: 92,
  speedMetersPerSecond: 10,
  gpsAccuracyMeters: 5,
});
assert.strictEqual(confirmedOffRoute.offRouteStatus, 'off_route_confirmed');
assert.strictEqual(confirmedOffRoute.offRouteUpdateCount, 2);

const poorAccuracyRoad = progressAt(point(48, 170), onRoute, {
  headingDegrees: 0,
  speedMetersPerSecond: 28,
  gpsAccuracyMeters: 40,
});
assert.strictEqual(
  poorAccuracyRoad.offRouteStatus,
  'on_route',
  'High-speed poor-accuracy road pings near the threshold should not immediately become off-route candidates.',
);
assert(poorAccuracyRoad.offRouteThresholdMeters > 35);

const reroutingStatus = resolveEcsActiveGuidanceProgress({
  currentCoordinate: point(55, 145),
  activeRoute: route,
  previousProgress: confirmedOffRoute,
  rerouteStatus: 'rerouting',
});
assert.strictEqual(reroutingStatus.offRouteStatus, 'rerouting');
assert.strictEqual(reroutingStatus.offRouteUpdateCount, 2);

const destination = {
  id: 'field-office',
  title: 'Field Office',
  subtitle: 'QA route target',
  coordinate: { lat: 38.7824, lng: -121.2063 },
  sourceType: 'manual_selection',
};

function buildMapboxStep(overrides = {}) {
  return {
    distance: 120,
    duration: 55,
    name: 'Main Street',
    maneuver: {
      instruction: 'Make a U-turn when safe',
      type: 'turn',
      modifier: 'uturn',
      location: [-121.2076, 38.7816],
    },
    geometry: {
      coordinates: [
        [-121.2076, 38.7816],
        [-121.2076, 38.7807],
      ],
    },
    bannerInstructions: [],
    voiceInstructions: [],
    ...overrides,
  };
}

async function withMockedFetch(payload, callback) {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => payload,
  });
  try {
    return await callback();
  } finally {
    global.fetch = originalFetch;
  }
}

(async () => {
  const routes = await withMockedFetch(
    {
      routes: [
        {
          uuid: 'reroute-uuid',
          distance: 120,
          duration: 55,
          geometry: {
            coordinates: [
              [-121.2076, 38.7816],
              [-121.2076, 38.7807],
            ],
          },
          legs: [
            {
              summary: 'Backtrack',
              distance: 120,
              duration: 55,
              steps: [buildMapboxStep()],
            },
          ],
        },
      ],
    },
    () => fetchRoadRouteAlternatives({
      accessToken: 'test-token',
      origin: { lat: 38.7816, lng: -121.2076 },
      destination,
      rerouteGeneration: 3,
    }),
  );

  assert.strictEqual(routes.length, 1);
  assert.strictEqual(routes[0].guidance.rerouteGeneration, 3);
  assert.strictEqual(routes[0].guidance.steps[0].instruction, 'Make a U-turn when safe');
  assert.strictEqual(routes[0].steps[0].instruction, 'Make a U-turn when safe');

  const controllerSource = fs.readFileSync(
    path.join(root, 'lib', 'navigation', 'ecsActiveGuidanceController.ts'),
    'utf8',
  );
  assert(
    controllerSource.includes('offRouteStatus') &&
      controllerSource.includes('offRouteUpdateCount') &&
      controllerSource.includes('headingDivergenceDegrees') &&
      controllerSource.includes('currentGpsAccuracyMeters'),
    'ActiveGuidanceController should expose off-route status and diagnostics.',
  );

  const hookSource = fs.readFileSync(path.join(root, 'lib', 'useRoadNavigation.ts'), 'utf8');
  assert(
    hookSource.includes("nextConfidenceState === 'off_route_confirmed'") &&
      hookSource.includes("routeStatusLabel: 'Recalculating route...'") &&
      hookSource.includes("routeStatusLabel: 'Unable to recalculate route'") &&
      hookSource.includes("nextInstruction: 'Return to the highlighted route when safe'") &&
      hookSource.includes('lastRerouteError'),
    'useRoadNavigation should trigger reroute from confirmed off-route, expose recalculation/failure copy, and preserve old route on failure.',
  );

  console.log('Active guidance off-route reroute regression passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
