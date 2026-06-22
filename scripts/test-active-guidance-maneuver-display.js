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
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(mod.exports, require, mod, filename, path.dirname(filename));
  return mod.exports;
}

const {
  buildActiveGuidanceManeuverDisplay,
  formatManeuverDistance,
  getManeuverIconName,
} = loadTsModule(path.join('lib', 'navigation', 'activeGuidanceManeuverDisplay.ts'));

function guidanceRoute(mode = 'turn_by_turn') {
  return {
    id: 'route-1',
    source: mode === 'turn_by_turn' ? 'mapbox_directions' : 'summary_only',
    geometry: [],
    distanceMeters: 5000,
    durationSeconds: 600,
    legs: [],
    steps: [],
    createdAt: '2026-06-22T12:00:00.000Z',
    rerouteGeneration: 0,
    guidanceMode: mode,
  };
}

function step(overrides) {
  return {
    id: overrides.id ?? 'step',
    legIndex: 0,
    stepIndex: overrides.globalStepIndex ?? 0,
    globalStepIndex: overrides.globalStepIndex ?? 0,
    instruction: overrides.instruction,
    shortInstruction: overrides.shortInstruction ?? overrides.instruction,
    maneuverType: overrides.maneuverType,
    maneuverModifier: overrides.maneuverModifier,
    roadName: overrides.roadName,
    displayRoadName: overrides.displayRoadName ?? overrides.roadName ?? 'Unnamed road',
    isUnnamedRoad: overrides.isUnnamedRoad ?? false,
    distanceMeters: overrides.distanceMeters ?? 0,
    durationSeconds: overrides.durationSeconds ?? 0,
  };
}

assert.strictEqual(formatManeuverDistance(45), '150 ft');
assert.strictEqual(formatManeuverDistance(183), '600 ft');
assert.strictEqual(formatManeuverDistance(643.7376), '0.4 mi');
assert.strictEqual(formatManeuverDistance(3379.6224), '2.1 mi');

const baseProgress = {
    routeId: 'route-1',
    rerouteGeneration: 0,
    currentLegIndex: 0,
    currentStepIndex: 0,
    distanceToNextManeuverMeters: 643.7376,
    distanceRemainingMeters: 4000,
    durationRemainingSeconds: 500,
    currentInstruction: 'Continue on Yankee Jim Road',
    currentRoadName: 'Yankee Jim Road',
    nextInstruction: 'Turn right onto Foresthill Road',
    offRouteCandidate: false,
    confidence: 'high',
    updatedAt: '2026-06-22T12:01:00.000Z',
    distanceFromRouteMeters: 4,
    distanceRemainingOnCurrentStepMeters: 643.7376,
    nearestRoutePoint: null,
    nearestStepPoint: null,
    currentStep: step({
      id: 'continue-yankee',
      instruction: 'Continue on Yankee Jim Road',
      maneuverType: 'continue',
      roadName: 'Yankee Jim Road',
    }),
    nextStep: step({
      id: 'right-foresthill',
      instruction: 'Turn right onto Foresthill Road',
      maneuverType: 'turn',
      maneuverModifier: 'right',
      roadName: 'Foresthill Road',
      globalStepIndex: 1,
    }),
    followingStep: step({
      id: 'left-canyon',
      instruction: 'Bear left onto Canyon Way',
      maneuverType: 'turn',
      maneuverModifier: 'slight left',
      roadName: 'Canyon Way',
      globalStepIndex: 2,
    }),
    upcomingSteps: [],
};

const rightTurnDisplay = buildActiveGuidanceManeuverDisplay({
  guidanceMode: 'turn_by_turn',
  route: guidanceRoute(),
  progress: baseProgress,
});

assert.strictEqual(rightTurnDisplay.mode, 'turn_by_turn');
assert.strictEqual(rightTurnDisplay.iconName, 'arrow-forward');
assert.strictEqual(rightTurnDisplay.eyebrow, 'NEXT TURN');
assert.strictEqual(rightTurnDisplay.distanceLabel, '0.4 mi');
assert.strictEqual(rightTurnDisplay.primaryText, 'In 0.4 mi, turn right onto Foresthill Road');
assert.strictEqual(rightTurnDisplay.roadName, 'Foresthill Road');
assert.strictEqual(rightTurnDisplay.followingText, 'Then bear left onto Canyon Way');

const unnamedBearLeftDisplay = buildActiveGuidanceManeuverDisplay({
  guidanceMode: 'turn_by_turn',
  route: guidanceRoute(),
  progress: {
    ...baseProgress,
    nextStep: step({
      id: 'bear-left-unnamed',
      instruction: 'Bear left onto Unnamed road',
      maneuverType: 'turn',
      maneuverModifier: 'slight left',
      displayRoadName: 'Unnamed road',
      isUnnamedRoad: true,
      globalStepIndex: 1,
    }),
    followingStep: undefined,
    distanceToNextManeuverMeters: 183,
  },
});
assert.strictEqual(unnamedBearLeftDisplay.iconName, 'arrow-back');
assert.strictEqual(unnamedBearLeftDisplay.primaryText, 'In 600 ft, bear left onto Unnamed road');
assert.strictEqual(unnamedBearLeftDisplay.followingText, null);

const continueDisplay = buildActiveGuidanceManeuverDisplay({
  guidanceMode: 'turn_by_turn',
  route: guidanceRoute(),
  progress: {
    ...baseProgress,
    currentStep: step({
      id: 'continue-yankee',
      instruction: 'Continue on Yankee Jim Road',
      maneuverType: 'continue',
      roadName: 'Yankee Jim Road',
    }),
    nextStep: undefined,
    followingStep: undefined,
    distanceToNextManeuverMeters: 3379.6224,
  },
});
assert.strictEqual(continueDisplay.iconName, 'arrow-up');
assert.strictEqual(continueDisplay.primaryText, 'Continue 2.1 mi on Yankee Jim Road');

const uTurnDisplay = buildActiveGuidanceManeuverDisplay({
  guidanceMode: 'turn_by_turn',
  route: guidanceRoute(),
  progress: {
    ...baseProgress,
    nextStep: step({
      id: 'uturn',
      instruction: 'Make a U-turn onto Foresthill Road',
      maneuverType: 'turn',
      maneuverModifier: 'uturn',
      roadName: 'Foresthill Road',
    }),
    followingStep: undefined,
    distanceToNextManeuverMeters: 20,
  },
});
assert.strictEqual(uTurnDisplay.iconName, 'refresh');
assert.strictEqual(uTurnDisplay.primaryText, 'Make a U-turn when safe');

const arrivalDisplay = buildActiveGuidanceManeuverDisplay({
  guidanceMode: 'turn_by_turn',
  route: guidanceRoute(),
  progress: {
    ...baseProgress,
    currentStep: step({
      id: 'arrive',
      instruction: 'You have arrived at your destination',
      maneuverType: 'arrive',
      roadName: 'Field Office',
    }),
    nextStep: undefined,
    distanceToNextManeuverMeters: 0,
  },
});
assert.strictEqual(arrivalDisplay.iconName, 'flag');
assert.strictEqual(arrivalDisplay.primaryText, 'You have arrived at your destination');

const summaryOnly = buildActiveGuidanceManeuverDisplay({
  guidanceMode: 'summary_only',
  route: guidanceRoute('summary_only'),
  progress: null,
});
assert.strictEqual(summaryOnly.mode, 'summary_only');
assert.strictEqual(summaryOnly.primaryText, 'Turn-by-turn unavailable for this route');
assert.strictEqual(summaryOnly.detailText, 'Showing route summary.');

const unavailable = buildActiveGuidanceManeuverDisplay({
  guidanceMode: 'unavailable',
  route: null,
  progress: null,
});
assert.strictEqual(unavailable.mode, 'unavailable');
assert.strictEqual(unavailable.primaryText, 'Guidance unavailable');

const calculating = buildActiveGuidanceManeuverDisplay({
  guidanceMode: 'turn_by_turn',
  route: null,
  progress: null,
  status: 'destination_selected',
  previewLoading: true,
});
assert.strictEqual(calculating.primaryText, 'Calculating route...');

const rerouting = buildActiveGuidanceManeuverDisplay({
  guidanceMode: 'turn_by_turn',
  route: guidanceRoute(),
  progress: baseProgress,
  status: 'rerouting',
});
assert.strictEqual(rerouting.primaryText, 'Recalculating route...');

const overlaySource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'RoadNavigationOverlay.tsx'),
  'utf8',
);
assert(
  overlaySource.includes('buildActiveGuidanceManeuverDisplay') &&
    overlaySource.includes('activeGuidanceManeuverBanner') &&
    overlaySource.includes('activeGuidanceFollowingManeuver'),
  'RoadNavigationOverlay should render the active maneuver banner from the normalized display model.',
);

assert.strictEqual(getManeuverIconName('turn', 'right'), 'arrow-forward');
assert.strictEqual(getManeuverIconName('turn', 'left'), 'arrow-back');
assert.strictEqual(getManeuverIconName('turn', 'uturn'), 'refresh');
assert.strictEqual(getManeuverIconName('arrive', null), 'flag');

console.log('Active guidance maneuver display regression passed.');
