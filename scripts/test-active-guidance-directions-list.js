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
  buildActiveGuidanceDirectionList,
  buildFallbackActiveDirectionList,
  formatActiveDirectionDistance,
} = directionsModule;
const overlaySource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'RoadNavigationOverlay.tsx'),
  'utf8',
);

assert.strictEqual(typeof buildActiveGuidanceDirectionList, 'function');
assert.strictEqual(typeof buildFallbackActiveDirectionList, 'function');
assert.strictEqual(typeof formatActiveDirectionDistance, 'function');

function makeStep(index, overrides = {}) {
  const roadName =
    Object.prototype.hasOwnProperty.call(overrides, 'displayRoadName')
      ? overrides.displayRoadName
      : overrides.roadName ?? `Forest Service Road ${index + 1}`;
  return {
    id: overrides.id ?? `step-${index}`,
    legIndex: 0,
    stepIndex: index,
    globalStepIndex: index,
    instruction: overrides.instruction ?? `Continue on ${roadName}`,
    shortInstruction: overrides.shortInstruction ?? overrides.instruction ?? `Continue on ${roadName}`,
    maneuverType: overrides.maneuverType ?? (index === 0 ? 'depart' : 'continue'),
    maneuverModifier: overrides.maneuverModifier,
    roadName: overrides.roadName,
    displayRoadName: roadName || 'Unnamed road',
    isUnnamedRoad: overrides.isUnnamedRoad ?? roadName === 'Unnamed road',
    distanceMeters: overrides.distanceMeters ?? 250 + index * 10,
    durationSeconds: overrides.durationSeconds ?? 45 + index,
    maneuverLocation: [-121.2 + index * 0.001, 38.78 + index * 0.001],
    geometry: [
      { lat: 38.78 + index * 0.001, lng: -121.2 + index * 0.001 },
      { lat: 38.781 + index * 0.001, lng: -121.199 + index * 0.001 },
    ],
  };
}

function makeRoute({ id = 'route-a', rerouteGeneration = 0, guidanceMode = 'turn_by_turn', steps }) {
  return {
    id,
    source: guidanceMode === 'turn_by_turn' ? 'mapbox_directions' : 'summary_only',
    routeUuid: `${id}-uuid`,
    geometry: steps.flatMap((step) => step.geometry ?? []),
    distanceMeters: steps.reduce((sum, step) => sum + step.distanceMeters, 0),
    durationSeconds: steps.reduce((sum, step) => sum + step.durationSeconds, 0),
    legs: [
      {
        legIndex: 0,
        distanceMeters: steps.reduce((sum, step) => sum + step.distanceMeters, 0),
        durationSeconds: steps.reduce((sum, step) => sum + step.durationSeconds, 0),
        summary: 'Fixture route',
        steps,
      },
    ],
    steps,
    createdAt: '2026-06-22T12:00:00.000Z',
    rerouteGeneration,
    guidanceMode,
  };
}

function makeProgress(route, currentStepIndex) {
  const currentStep = route.steps[currentStepIndex];
  const nextStep = route.steps[currentStepIndex + 1];
  const followingStep = route.steps[currentStepIndex + 2];
  return {
    routeId: route.id,
    rerouteGeneration: route.rerouteGeneration,
    currentLegIndex: currentStep?.legIndex ?? 0,
    currentStepIndex,
    distanceToNextManeuverMeters: 120,
    distanceRemainingMeters: route.steps
      .slice(currentStepIndex)
      .reduce((sum, step) => sum + step.distanceMeters, 0),
    durationRemainingSeconds: route.steps
      .slice(currentStepIndex)
      .reduce((sum, step) => sum + step.durationSeconds, 0),
    currentInstruction: currentStep?.instruction ?? 'Continue on highlighted route',
    currentRoadName: currentStep?.displayRoadName ?? 'Unnamed road',
    nextInstruction: nextStep?.instruction,
    offRouteCandidate: false,
    confidence: 'high',
    updatedAt: '2026-06-22T12:01:00.000Z',
    distanceFromRouteMeters: 4,
    distanceRemainingOnCurrentStepMeters: currentStep?.distanceMeters ?? null,
    nearestRoutePoint: null,
    nearestStepPoint: null,
    currentStep,
    nextStep,
    followingStep,
    upcomingSteps: route.steps.slice(currentStepIndex),
  };
}

const tenStepRoute = makeRoute({
  steps: [
    makeStep(0, {
      id: 'depart-yankee',
      instruction: 'Head north on Yankee Jim Road',
      maneuverType: 'depart',
      roadName: 'Yankee Jim Road',
    }),
    makeStep(1, {
      id: 'right-foresthill',
      instruction: 'Turn right onto Foresthill Road',
      maneuverType: 'turn',
      maneuverModifier: 'right',
      roadName: 'Foresthill Road',
    }),
    makeStep(2, {
      id: 'left-canyon',
      instruction: 'Turn left onto Canyon Way',
      maneuverType: 'turn',
      maneuverModifier: 'left',
      roadName: 'Canyon Way',
    }),
    makeStep(3, {
      id: 'bear-unnamed',
      instruction: 'Bear left onto Unnamed road',
      maneuverType: 'turn',
      maneuverModifier: 'slight left',
      displayRoadName: 'Unnamed road',
      roadName: undefined,
      isUnnamedRoad: true,
      distanceMeters: 183,
      durationSeconds: 72,
    }),
    makeStep(4, {
      id: 'continue-ridge',
      instruction: 'Continue on Ridge Track',
      maneuverType: 'continue',
      roadName: 'Ridge Track',
    }),
    makeStep(5, { id: 'right-quarry', instruction: 'Turn right onto Quarry Road', maneuverType: 'turn', maneuverModifier: 'right', roadName: 'Quarry Road' }),
    makeStep(6, { id: 'merge-80', instruction: 'Merge onto I-80 East', maneuverType: 'merge', maneuverModifier: 'right', roadName: 'I-80 East' }),
    makeStep(7, { id: 'roundabout', instruction: 'Enter the roundabout and take the second exit', maneuverType: 'roundabout', maneuverModifier: 'right', roadName: 'Town Center' }),
    makeStep(8, { id: 'left-service', instruction: 'Turn left onto Service Road', maneuverType: 'turn', maneuverModifier: 'left', roadName: 'Service Road' }),
    makeStep(9, { id: 'arrive-camp', instruction: 'You have arrived at your destination', maneuverType: 'arrive', roadName: 'Camp Alpha', distanceMeters: 0, durationSeconds: 0 }),
  ],
});

const initialList = buildActiveGuidanceDirectionList({
  route: tenStepRoute,
  progress: makeProgress(tenStepRoute, 0),
  status: 'navigation_active',
});

assert.strictEqual(initialList.state, 'ready');
assert.strictEqual(initialList.routeId, 'route-a');
assert.strictEqual(initialList.rerouteGeneration, 0);
assert.strictEqual(initialList.currentStepIndex, 0);
assert.strictEqual(initialList.items.length, 10, 'Initial dropdown should render all ten upcoming steps.');
assert.strictEqual(initialList.items[0].id, 'depart-yankee');
assert.strictEqual(initialList.items[0].isCurrent, true, 'Current step should be highlighted.');
assert.strictEqual(initialList.items[0].sequenceLabel, 'NOW');
assert.strictEqual(initialList.items[1].iconName, 'arrow-forward');
assert.strictEqual(initialList.items[2].iconName, 'arrow-back');
assert.strictEqual(initialList.items[3].roadName, 'Unnamed road');
assert.strictEqual(initialList.items[3].detail, 'Unnamed road');
assert.strictEqual(initialList.items[3].distanceM, 183);
assert.strictEqual(initialList.items[3].durationS, 72);
assert.strictEqual(initialList.emptyMessage, null);

const advancedList = buildActiveGuidanceDirectionList({
  route: tenStepRoute,
  progress: makeProgress(tenStepRoute, 4),
  status: 'navigation_active',
});

assert.strictEqual(advancedList.items.length, 6);
assert.strictEqual(advancedList.currentStepIndex, 4);
assert.strictEqual(advancedList.items[0].id, 'continue-ridge');
assert.strictEqual(advancedList.items[0].isCurrent, true);
assert(!advancedList.items.some((item) => item.id === 'bear-unnamed'), 'Completed steps must not remain in the active dropdown.');

const reroutedRoute = makeRoute({
  id: 'route-b',
  rerouteGeneration: 1,
  steps: [
    makeStep(0, { id: 'reroute-depart', instruction: 'Continue on Auburn Ravine Road', maneuverType: 'continue', roadName: 'Auburn Ravine Road' }),
    makeStep(1, { id: 'reroute-right', instruction: 'Turn right onto Mill Road', maneuverType: 'turn', maneuverModifier: 'right', roadName: 'Mill Road' }),
    makeStep(2, { id: 'reroute-arrive', instruction: 'You have arrived at your destination', maneuverType: 'arrive', roadName: 'Camp Bravo', distanceMeters: 0, durationSeconds: 0 }),
  ],
});

const reroutingPending = buildActiveGuidanceDirectionList({
  route: tenStepRoute,
  progress: makeProgress(tenStepRoute, 4),
  status: 'rerouting',
});

assert.strictEqual(reroutingPending.state, 'pending');
assert.deepStrictEqual(reroutingPending.items, []);
assert.strictEqual(reroutingPending.emptyMessage, 'Directions will appear when route calculation completes');

const reroutedList = buildActiveGuidanceDirectionList({
  route: reroutedRoute,
  progress: makeProgress(reroutedRoute, 0),
  status: 'navigation_active',
});

assert.strictEqual(reroutedList.routeId, 'route-b');
assert.strictEqual(reroutedList.rerouteGeneration, 1);
assert.deepStrictEqual(
  reroutedList.items.map((item) => item.id),
  ['reroute-depart', 'reroute-right', 'reroute-arrive'],
  'Reroute should replace the list instead of mixing old and new route steps.',
);
assert(!reroutedList.items.some((item) => item.id === 'continue-ridge'), 'Old route steps must not survive the reroute list.');

const summaryOnlyRoute = makeRoute({
  id: 'summary-route',
  guidanceMode: 'summary_only',
  steps: [],
});
const summaryOnlyList = buildActiveGuidanceDirectionList({
  route: summaryOnlyRoute,
  progress: null,
  status: 'navigation_active',
});
assert.strictEqual(summaryOnlyList.state, 'summary_only');
assert.deepStrictEqual(summaryOnlyList.items, []);
assert.strictEqual(summaryOnlyList.emptyMessage, 'No turn-by-turn directions available for this route');

const calculatingList = buildActiveGuidanceDirectionList({
  route: null,
  progress: null,
  status: 'destination_selected',
});
assert.strictEqual(calculatingList.state, 'pending');
assert.deepStrictEqual(calculatingList.items, []);
assert.strictEqual(calculatingList.emptyMessage, 'Directions will appear when route calculation completes');

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
  overlaySource.includes('buildVersionedActiveGuidanceDirectionList') &&
    overlaySource.includes('activeGuidance: session.activeGuidance') &&
    overlaySource.includes('progress: session.activeGuidanceProgress') &&
    overlaySource.includes('status: session.status'),
  'RoadNavigationOverlay should build dropdown rows from the versioned active guidance state and EcsActiveGuidanceProgress.',
);
assert(
  overlaySource.includes('activeDirectionsRowCurrent') &&
    overlaySource.includes('activeDirectionsEmptyText') &&
    overlaySource.includes('activeDirectionsDuration'),
  'Active directions dropdown should render current highlighting, empty states, and optional duration metadata.',
);

console.log('Active guidance directions list regression passed.');
