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
  }).outputText;
  const mod = { exports: {} };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(mod.exports, require, mod, filename, path.dirname(filename));
  return mod.exports;
}

const {
  resolveRoadNavigationProgress,
  ROAD_GUIDANCE_STEP_SNAP_DISTANCE_M,
} = loadTsModule(path.join('lib', 'roadNavigationProgress.ts'));

const origin = { lat: 38.7807, lng: -121.2076 };
const sierraTurn = { lat: 38.7816, lng: -121.2076 };
const rocklinTurn = { lat: 38.7816, lng: -121.2063 };
const destinationCoordinate = { lat: 38.7824, lng: -121.2063 };

const route = {
  id: 'southside-to-rocklin',
  origin,
  destination: {
    id: 'rocklin-road',
    title: 'Rocklin Road',
    subtitle: null,
    coordinate: destinationCoordinate,
    sourceType: 'manual_selection',
  },
  geometry: [origin, sierraTurn, rocklinTurn, destinationCoordinate],
  distanceM: 270,
  durationS: 120,
  bounds: null,
  createdAt: '2026-06-15T12:00:00.000Z',
  steps: [
    {
      id: 'head-southside',
      instruction: 'Head north on Southside Ranch Road',
      distanceM: 100,
      durationS: 40,
      startDistanceM: 0,
      endDistanceM: 100,
      startDurationS: 0,
      endDurationS: 40,
      maneuverType: 'depart',
      modifier: null,
      roadName: 'Southside Ranch Road',
      location: origin,
      geometry: [origin, sierraTurn],
    },
    {
      id: 'left-sierra',
      instruction: 'Turn left onto Sierra College Boulevard',
      distanceM: 90,
      durationS: 40,
      startDistanceM: 100,
      endDistanceM: 190,
      startDurationS: 40,
      endDurationS: 80,
      maneuverType: 'turn',
      modifier: 'left',
      roadName: 'Sierra College Boulevard',
      location: sierraTurn,
      geometry: [sierraTurn, rocklinTurn],
    },
    {
      id: 'left-rocklin',
      instruction: 'Turn left onto Rocklin Road',
      distanceM: 80,
      durationS: 40,
      startDistanceM: 190,
      endDistanceM: 270,
      startDurationS: 80,
      endDurationS: 120,
      maneuverType: 'turn',
      modifier: 'left',
      roadName: 'Rocklin Road',
      location: rocklinTurn,
      geometry: [rocklinTurn, destinationCoordinate],
    },
  ],
};

const beforeFirstTurn = resolveRoadNavigationProgress(route, {
  location: { lat: 38.78115, lng: -121.2076 },
  previousStepIndex: 0,
  previousRemainingDistanceM: null,
  lockForwardProgress: true,
});

assert.strictEqual(
  beforeFirstTurn.currentStepIndex,
  0,
  'Before the first turn, active road guidance should still be on the approach step.',
);
assert.strictEqual(
  beforeFirstTurn.nextInstruction,
  'Turn left onto Sierra College Boulevard',
  'Before the first turn, active road guidance should announce the Sierra College maneuver.',
);
assert(
  beforeFirstTurn.nextInstructionDistanceM > 35 &&
    beforeFirstTurn.nextInstructionDistanceM < 60,
  `Distance to the Sierra College maneuver should target the turn point, got ${beforeFirstTurn.nextInstructionDistanceM}.`,
);

const afterFirstTurn = resolveRoadNavigationProgress(route, {
  location: { lat: 38.7816, lng: -121.2069 },
  previousStepIndex: 0,
  previousRemainingDistanceM: 170,
  lockForwardProgress: true,
});

assert.strictEqual(
  afterFirstTurn.currentStepIndex,
  1,
  'After turning onto Sierra College, currentStepIndex should advance to the Sierra step.',
);
assert.strictEqual(
  afterFirstTurn.nextInstruction,
  'Turn left onto Rocklin Road',
  'After turning onto Sierra College, active guidance should immediately announce Rocklin Road.',
);
assert(
  afterFirstTurn.nextInstructionDistanceM > 35 &&
    afterFirstTurn.nextInstructionDistanceM < 70,
  `Distance to Rocklin Road should target the next maneuver point, got ${afterFirstTurn.nextInstructionDistanceM}.`,
);

const noisyGpsNearIntersection = resolveRoadNavigationProgress(route, {
  location: { lat: 38.78158, lng: -121.20755 },
  previousStepIndex: 1,
  previousRemainingDistanceM: 165,
  lockForwardProgress: true,
});

assert.strictEqual(
  noisyGpsNearIntersection.currentStepIndex,
  1,
  'A noisy point near the completed turn should not regress guidance to the prior Southside step.',
);
assert.strictEqual(
  noisyGpsNearIntersection.nextInstruction,
  'Turn left onto Rocklin Road',
  'A noisy point after step advancement should keep the next Rocklin Road maneuver visible.',
);
assert(
  ROAD_GUIDANCE_STEP_SNAP_DISTANCE_M >= 25 && ROAD_GUIDANCE_STEP_SNAP_DISTANCE_M <= 45,
  'Step geometry snap tolerance should be tight enough for roads but wide enough for mobile GPS drift.',
);

console.log('Road navigation turn progress regression passed.');
