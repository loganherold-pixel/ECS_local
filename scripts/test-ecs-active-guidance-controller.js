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
    if (request === './ecsGuidanceModel') {
      return loadTsModule(path.join('lib', 'navigation', 'ecsGuidanceModel.ts'));
    }
    if (request.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filename), request);
      const candidate = path.extname(resolved) ? resolved : `${resolved}.ts`;
      if (fs.existsSync(candidate)) {
        return loadTsModule(path.relative(root, candidate));
      }
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

function step(id, globalStepIndex, instruction, roadName, start, end, maneuverType, maneuverModifier) {
  return {
    id,
    legIndex: 0,
    stepIndex: globalStepIndex,
    globalStepIndex,
    instruction,
    shortInstruction: instruction,
    maneuverType,
    ...(maneuverModifier ? { maneuverModifier } : null),
    roadName,
    displayRoadName: roadName,
    isUnnamedRoad: false,
    distanceMeters: Math.hypot(end[0] - start[0], end[1] - start[1]),
    durationSeconds: Math.max(1, Math.round(Math.hypot(end[0] - start[0], end[1] - start[1]) / 10)),
    maneuverLocation: lngLat(end[0], end[1]),
    bearingAfter:
      end[0] === start[0]
        ? end[1] >= start[1] ? 0 : 180
        : end[0] >= start[0] ? 90 : 270,
    geometry: [point(start[0], start[1]), point(end[0], end[1])],
  };
}

const routeSteps = [
  step('straight', 0, 'Continue on Main Street', 'Main Street', [0, 0], [0, 100], 'continue'),
  step('left', 1, 'Turn left onto Oak Trail', 'Oak Trail', [0, 100], [-80, 100], 'turn', 'left'),
  step('right', 2, 'Turn right onto Pine Road', 'Pine Road', [-80, 100], [-80, 180], 'turn', 'right'),
  step('uturn', 3, 'Make a U-turn onto Pine Road', 'Pine Road', [-80, 180], [-80, 120], 'turn', 'uturn'),
  step('arrive', 4, 'You have arrived at your destination', 'Field Office', [-80, 120], [-80, 120], 'arrive'),
];

const route = {
  id: 'mock-guidance-route',
  source: 'mapbox_directions',
  routeUuid: 'route-uuid',
  geometry: [
    point(0, 0),
    point(0, 100),
    point(-80, 100),
    point(-80, 180),
    point(-80, 120),
  ],
  distanceMeters: 320,
  durationSeconds: 32,
  legs: [
    {
      legIndex: 0,
      distanceMeters: 320,
      durationSeconds: 32,
      summary: 'Mock turn route',
      steps: routeSteps,
    },
  ],
  steps: routeSteps,
  createdAt: '2026-06-22T12:00:00.000Z',
  rerouteGeneration: 3,
  guidanceMode: 'turn_by_turn',
};

function progressAt(location, previousProgress, extra = {}) {
  return resolveEcsActiveGuidanceProgress({
    currentCoordinate: location,
    currentHeadingDegrees: extra.headingDegrees,
    currentSpeedMetersPerSecond: extra.speedMetersPerSecond,
    activeRoute: route,
    previousProgress,
    updatedAt: extra.updatedAt ?? '2026-06-22T12:00:00.000Z',
  });
}

const startProgress = progressAt(point(0, 10), null);
assert.strictEqual(startProgress.routeId, route.id);
assert.strictEqual(startProgress.rerouteGeneration, 3);
assert.strictEqual(startProgress.currentLegIndex, 0);
assert.strictEqual(startProgress.currentStepIndex, 0, 'Straight route start should stay on first step.');
assert.strictEqual(startProgress.currentInstruction, 'Continue on Main Street');
assert.strictEqual(startProgress.nextInstruction, 'Turn left onto Oak Trail');
assert.strictEqual(startProgress.nextStep.id, 'left');
assert.strictEqual(startProgress.followingStep.id, 'right');
assert.deepStrictEqual(
  startProgress.upcomingSteps.map((item) => item.id),
  ['straight', 'left', 'right', 'uturn', 'arrive'],
);
assert(startProgress.distanceToNextManeuverMeters > 85 && startProgress.distanceToNextManeuverMeters < 95);
assert(startProgress.distanceRemainingOnCurrentStepMeters > 85 && startProgress.distanceRemainingOnCurrentStepMeters < 95);
assert.strictEqual(startProgress.offRouteCandidate, false);
assert.strictEqual(startProgress.confidence, 'high');

const approachingLeft = progressAt(point(0, 82), startProgress);
assert.strictEqual(approachingLeft.currentStepIndex, 0, 'Approaching maneuver should not advance early.');
assert(approachingLeft.distanceToNextManeuverMeters > 10 && approachingLeft.distanceToNextManeuverMeters < 25);
assert.strictEqual(approachingLeft.nextStep.id, 'left');

const completedLeft = progressAt(point(-18, 100), approachingLeft, { headingDegrees: 270 });
assert.strictEqual(completedLeft.currentStepIndex, 1, 'Completing left turn should advance to left-turn step.');
assert.strictEqual(completedLeft.currentInstruction, 'Turn left onto Oak Trail');
assert.strictEqual(completedLeft.nextInstruction, 'Turn right onto Pine Road');
assert.strictEqual(completedLeft.nextStep.id, 'right');
assert.deepStrictEqual(completedLeft.upcomingSteps.map((item) => item.id), ['left', 'right', 'uturn', 'arrive']);

const jitterBackNearIntersection = progressAt(point(2, 101), completedLeft, { headingDegrees: 268 });
assert.strictEqual(jitterBackNearIntersection.currentStepIndex, 1, 'GPS jitter near a completed left turn should not regress.');
assert(jitterBackNearIntersection.distanceFromRouteMeters < 10);

const approachingRight = progressAt(point(-80, 160), jitterBackNearIntersection, { headingDegrees: 0 });
assert.strictEqual(approachingRight.currentStepIndex, 2, 'Clearly being on Pine Road should advance to right-turn step.');
assert.strictEqual(approachingRight.nextStep.id, 'uturn');
assert(approachingRight.distanceToNextManeuverMeters > 15 && approachingRight.distanceToNextManeuverMeters < 30);

const completingUTurn = progressAt(point(-80, 175), approachingRight, { headingDegrees: 180 });
assert.strictEqual(completingUTurn.currentStepIndex, 3, 'U-turn completion should advance to the U-turn step.');
assert.strictEqual(completingUTurn.currentInstruction, 'Make a U-turn onto Pine Road');
assert.strictEqual(completingUTurn.nextStep.id, 'arrive');

const nearArrivalButNotArrived = progressAt(point(-80, 158), completingUTurn, { headingDegrees: 180 });
assert.strictEqual(nearArrivalButNotArrived.currentStepIndex, 3, 'Arrival should not advance before arrival threshold.');

const arrived = progressAt(point(-80, 121), nearArrivalButNotArrived, { headingDegrees: 180 });
assert.strictEqual(arrived.currentStepIndex, 4, 'Arrival should advance within threshold of destination.');
assert.strictEqual(arrived.currentInstruction, 'You have arrived at your destination');
assert.strictEqual(arrived.distanceToNextManeuverMeters, 0);
assert.strictEqual(arrived.nextStep, undefined);
assert.deepStrictEqual(arrived.upcomingSteps.map((item) => item.id), ['arrive']);

const offRoute = progressAt(point(120, 80), startProgress);
assert.strictEqual(offRoute.offRouteCandidate, true);
assert.strictEqual(offRoute.confidence, 'low');

function singleStepRoute(id, geometry, distanceMeters, routeVersion = `${id}:v1`) {
  const guidanceStep = {
    id: `${id}:step`,
    legIndex: 0,
    stepIndex: 0,
    globalStepIndex: 0,
    instruction: 'Continue on highlighted route',
    shortInstruction: 'Continue',
    maneuverType: 'continue',
    roadName: 'Canonical route',
    displayRoadName: 'Canonical route',
    isUnnamedRoad: false,
    distanceMeters,
    durationSeconds: Math.max(1, distanceMeters / 10),
    maneuverLocation: [geometry.at(-1).lng, geometry.at(-1).lat],
    bearingAfter: 90,
    geometry,
  };
  return {
    id,
    routeVersion,
    source: 'mapbox_directions',
    geometry,
    distanceMeters,
    durationSeconds: Math.max(1, distanceMeters / 10),
    legs: [{ legIndex: 0, distanceMeters, durationSeconds: distanceMeters / 10, steps: [guidanceStep] }],
    steps: [guidanceStep],
    createdAt: '2026-07-15T12:00:00.000Z',
    rerouteGeneration: 0,
    guidanceMode: 'turn_by_turn',
  };
}

const parallelGeometry = [
  point(0, 0),
  point(1000, 0),
  point(1000, 20),
  point(0, 20),
];
const parallelGuidanceRoute = singleStepRoute('parallel-guidance', parallelGeometry, 2020);
const parallelStart = resolveEcsActiveGuidanceProgress({
  currentCoordinate: point(100, 0),
  currentHeadingDegrees: 90,
  currentSpeedMetersPerSecond: 12,
  currentGpsAccuracyMeters: 5,
  activeRoute: parallelGuidanceRoute,
  updatedAt: '2026-07-15T12:00:00.000Z',
});
const parallelNoise = resolveEcsActiveGuidanceProgress({
  currentCoordinate: point(120, 13),
  currentHeadingDegrees: 90,
  currentSpeedMetersPerSecond: 12,
  currentGpsAccuracyMeters: 8,
  activeRoute: parallelGuidanceRoute,
  previousProgress: parallelStart,
  updatedAt: '2026-07-15T12:00:01.000Z',
});
assert.strictEqual(
  parallelNoise.progressRoutePoint.segmentIndex,
  0,
  'Mounted controller must retain the plausible outbound segment beside a parallel return leg.',
);
assert(
  parallelNoise.routeDistanceFromStartMeters < 200,
  `Parallel GPS noise must not jump canonical progress forward, got ${parallelNoise.routeDistanceFromStartMeters}m.`,
);
assert.deepStrictEqual(
  parallelNoise.completedRouteGeometry.at(-1),
  parallelNoise.remainingRouteGeometry[0],
  'Controller completed and remaining geometry must share one canonical split coordinate.',
);

const straightGuidanceRoute = singleStepRoute('straight-guidance', [point(0, 0), point(1000, 0)], 1000);
const forwardProgress = resolveEcsActiveGuidanceProgress({
  currentCoordinate: point(800, 0),
  currentHeadingDegrees: 90,
  currentGpsAccuracyMeters: 5,
  activeRoute: straightGuidanceRoute,
  updatedAt: '2026-07-15T12:00:00.000Z',
});
const regressedProgress = resolveEcsActiveGuidanceProgress({
  currentCoordinate: point(200, 0),
  currentHeadingDegrees: 90,
  currentGpsAccuracyMeters: 5,
  activeRoute: straightGuidanceRoute,
  previousProgress: forwardProgress,
  updatedAt: '2026-07-15T12:00:01.000Z',
});
assert(
  regressedProgress.routeDistanceFromStartMeters >= forwardProgress.routeDistanceFromStartMeters - 18,
  'Ordinary GPS regression must not materially move controller progress backward.',
);

const reverseFixOne = resolveEcsActiveGuidanceProgress({
  currentCoordinate: point(200, 0),
  currentHeadingDegrees: 270,
  currentSpeedMetersPerSecond: 5,
  currentGpsAccuracyMeters: 5,
  activeRoute: straightGuidanceRoute,
  previousProgress: forwardProgress,
  updatedAt: '2026-07-15T12:00:01.000Z',
});
const reverseFixTwo = resolveEcsActiveGuidanceProgress({
  currentCoordinate: point(190, 0),
  currentHeadingDegrees: 270,
  currentSpeedMetersPerSecond: 5,
  currentGpsAccuracyMeters: 5,
  activeRoute: straightGuidanceRoute,
  previousProgress: reverseFixOne,
  updatedAt: '2026-07-15T12:00:02.000Z',
});
const confirmedReverse = resolveEcsActiveGuidanceProgress({
  currentCoordinate: point(180, 0),
  currentHeadingDegrees: 270,
  currentSpeedMetersPerSecond: 5,
  currentGpsAccuracyMeters: 5,
  activeRoute: straightGuidanceRoute,
  previousProgress: reverseFixTwo,
  updatedAt: '2026-07-15T12:00:03.000Z',
});
assert(
  confirmedReverse.routeDistanceFromStartMeters < 220,
  'Three moving reverse-heading fixes should confirm deliberate backtracking.',
);

const replacementRoute = singleStepRoute(
  'replacement-guidance',
  [point(0, 100), point(1000, 100)],
  1000,
  'replacement-guidance:v2',
);
const replacementProgress = resolveEcsActiveGuidanceProgress({
  currentCoordinate: point(10, 100),
  currentHeadingDegrees: 90,
  currentGpsAccuracyMeters: 5,
  activeRoute: replacementRoute,
  previousProgress: forwardProgress,
  updatedAt: '2026-07-15T12:00:02.000Z',
});
assert(
  replacementProgress.routeDistanceFromStartMeters < 20,
  'Route identity replacement must reset prior projection state.',
);

console.log('ECS active guidance controller regression passed.');
