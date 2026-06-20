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

let directionsModule;
try {
  directionsModule = loadTsModule(path.join('lib', 'activeGuidanceDirections.ts'));
} catch (error) {
  assert.fail(`active guidance directions helper should exist and load: ${error.message}`);
}

const {
  buildActiveRoadDirectionList,
  buildFallbackActiveDirectionList,
  formatActiveDirectionDistance,
} = directionsModule;
const overlaySource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'RoadNavigationOverlay.tsx'),
  'utf8',
);

assert.strictEqual(typeof buildActiveRoadDirectionList, 'function');
assert.strictEqual(typeof buildFallbackActiveDirectionList, 'function');
assert.strictEqual(typeof formatActiveDirectionDistance, 'function');

const origin = { lat: 38.7807, lng: -121.2076 };
const firstTurn = { lat: 38.7816, lng: -121.2076 };
const secondTurn = { lat: 38.7816, lng: -121.2063 };
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
  geometry: [origin, firstTurn, secondTurn, destinationCoordinate],
  distanceM: 270,
  durationS: 120,
  bounds: null,
  createdAt: '2026-06-20T12:00:00.000Z',
  steps: [
    {
      id: 'depart-southside',
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
      geometry: [origin, firstTurn],
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
      location: firstTurn,
      geometry: [firstTurn, secondTurn],
    },
    {
      id: 'right-rocklin',
      instruction: 'Turn right onto Rocklin Road',
      distanceM: 80,
      durationS: 40,
      startDistanceM: 190,
      endDistanceM: 270,
      startDurationS: 80,
      endDurationS: 120,
      maneuverType: 'turn',
      modifier: 'right',
      roadName: 'Rocklin Road',
      location: secondTurn,
      geometry: [secondTurn, destinationCoordinate],
    },
    {
      id: 'arrive-rocklin',
      instruction: 'Arrive at Rocklin Road',
      distanceM: 0,
      durationS: 0,
      startDistanceM: 270,
      endDistanceM: 270,
      startDurationS: 120,
      endDurationS: 120,
      maneuverType: 'arrive',
      modifier: null,
      roadName: 'Rocklin Road',
      location: destinationCoordinate,
      geometry: [destinationCoordinate],
    },
  ],
};

const beforeFirstTurn = buildActiveRoadDirectionList({
  route,
  currentStepIndex: 0,
  remainingDistanceM: 220,
  nextInstructionDistanceM: 45,
});

assert.deepStrictEqual(
  beforeFirstTurn.map((item) => item.instruction),
  [
    'Turn left onto Sierra College Boulevard',
    'Turn right onto Rocklin Road',
    'Arrive at Rocklin Road',
  ],
  'Active directions should drop the current depart/status step and show only upcoming maneuvers to the end.',
);
assert.strictEqual(
  beforeFirstTurn[0].distanceM,
  45,
  'First active direction should use the live next-instruction distance so the dropdown matches the banner.',
);
assert.strictEqual(beforeFirstTurn[0].sequenceLabel, 'NEXT');
assert.strictEqual(beforeFirstTurn[1].sequenceLabel, '2');
assert.strictEqual(beforeFirstTurn[2].kind, 'arrival');

const afterFirstTurn = buildActiveRoadDirectionList({
  route,
  currentStepIndex: 1,
  remainingDistanceM: 150,
  nextInstructionDistanceM: 48,
});

assert.deepStrictEqual(
  afterFirstTurn.map((item) => item.instruction),
  ['Turn right onto Rocklin Road', 'Arrive at Rocklin Road'],
  'Completed maneuvers should fall off the active directions list as currentStepIndex advances.',
);

const reroutedRoute = {
  ...route,
  id: 'rerouted-southside',
  steps: [
    route.steps[0],
    {
      ...route.steps[1],
      id: 'right-southside',
      instruction: 'Turn right onto Southside Ranch Road',
      roadName: 'Southside Ranch Road',
    },
    route.steps[3],
  ],
};

const afterReroute = buildActiveRoadDirectionList({
  route: reroutedRoute,
  currentStepIndex: 0,
  remainingDistanceM: 240,
  nextInstructionDistanceM: 32,
});

assert.deepStrictEqual(
  afterReroute.map((item) => item.instruction),
  ['Turn right onto Southside Ranch Road', 'Arrive at Rocklin Road'],
  'Directions should be rebuilt from the current route object so reroutes replace stale maneuver lists.',
);

const fallback = buildFallbackActiveDirectionList({
  instruction: 'Stay on highlighted trail',
  distanceM: null,
  detail: 'Trail directions update from active guidance prompts.',
});

assert.strictEqual(fallback.length, 1);
assert.strictEqual(fallback[0].instruction, 'Stay on highlighted trail');
assert.strictEqual(fallback[0].kind, 'status');
assert.strictEqual(formatActiveDirectionDistance(45), '150 ft');
assert.strictEqual(formatActiveDirectionDistance(1609.344 * 6.2), '6.2 mi');

assert(
  overlaySource.includes("import {") &&
    overlaySource.includes("buildActiveRoadDirectionList") &&
    overlaySource.includes("formatActiveDirectionDistance") &&
    overlaySource.includes("'../../lib/activeGuidanceDirections'"),
  'RoadNavigationOverlay should import the active guidance directions helpers.',
);
assert(
  overlaySource.includes('const [directionsExpanded, setDirectionsExpanded] = useState(false);') &&
    overlaySource.includes('buildActiveRoadDirectionList({') &&
    overlaySource.includes('currentStepIndex: session.currentStepIndex') &&
    overlaySource.includes('remainingDistanceM: session.remainingDistanceM') &&
    overlaySource.includes('nextInstructionDistanceM: session.nextInstructionDistanceM'),
  'ActiveNavigationCard should rebuild directions from the live road navigation session.',
);
assert(
  overlaySource.includes('accessibilityLabel={directionsExpanded ? \'Hide active guidance directions\' : \'Show active guidance directions\'}') &&
    overlaySource.includes('Directions') &&
    overlaySource.includes('activeDirectionsDropdown') &&
    overlaySource.includes('activeDirectionsRow'),
  'Active guidance should expose a Directions button and popup list beside the top-right readiness control.',
);

console.log('Active guidance directions list regression passed.');
