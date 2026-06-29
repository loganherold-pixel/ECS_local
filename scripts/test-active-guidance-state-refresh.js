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
  function localRequire(request) {
    if (request.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filename), request);
      for (const candidate of [resolved, `${resolved}.ts`, `${resolved}.tsx`, `${resolved}.js`]) {
        if (fs.existsSync(candidate)) {
          const relativeCandidate = path.relative(root, candidate);
          if (candidate.endsWith('.ts') || candidate.endsWith('.tsx')) {
            return loadTsModule(relativeCandidate);
          }
          return require(candidate);
        }
      }
    }
    return require(request);
  }
  fn(mod.exports, localRequire, mod, filename, path.dirname(filename));
  return mod.exports;
}

const {
  ACTIVE_GUIDANCE_REFRESHED_STEPS_UNAVAILABLE_MESSAGE,
  buildActiveGuidanceRouteFromState,
  buildActiveGuidanceStateFromRoadRoute,
  buildVersionedActiveGuidanceDirectionList,
} = loadTsModule(path.join('lib', 'navigation', 'activeGuidanceState.ts'));
const {
  resolveEcsActiveGuidanceProgress,
} = loadTsModule(path.join('lib', 'navigation', 'ecsActiveGuidanceController.ts'));

assert.strictEqual(
  ACTIVE_GUIDANCE_REFRESHED_STEPS_UNAVAILABLE_MESSAGE,
  'Guidance refreshed, but turn-by-turn steps are unavailable for this segment.',
);

const origin = { lat: 38.7807, lng: -121.2076 };
const destinationCoordinate = { lat: 38.7841, lng: -121.2029 };
const destination = {
  id: 'camp-bravo',
  title: 'Camp Bravo',
  subtitle: null,
  coordinate: destinationCoordinate,
  sourceType: 'manual_selection',
  raw: null,
};

function makeGuidanceStep(routeId, index, instruction) {
  return {
    id: `${routeId}-guidance-step-${index}`,
    legIndex: 0,
    stepIndex: index,
    globalStepIndex: index,
    instruction,
    shortInstruction: instruction,
    maneuverType: index === 0 ? 'depart' : index === 2 ? 'arrive' : 'turn',
    maneuverModifier: index === 1 ? 'right' : undefined,
    roadName: index === 2 ? 'Camp Bravo' : `Forest Road ${index + 1}`,
    displayRoadName: index === 2 ? 'Camp Bravo' : `Forest Road ${index + 1}`,
    isUnnamedRoad: false,
    distanceMeters: index === 2 ? 0 : 180 + index * 40,
    durationSeconds: index === 2 ? 0 : 55 + index * 10,
    maneuverLocation: [-121.2076 + index * 0.001, 38.7807 + index * 0.001],
    geometry: [
      { lat: 38.7807 + index * 0.001, lng: -121.2076 + index * 0.001 },
      { lat: 38.7812 + index * 0.001, lng: -121.207 + index * 0.001 },
    ],
  };
}

function makeRoadStep(routeId, index, instruction) {
  return {
    id: `${routeId}-road-step-${index}`,
    instruction,
    distanceM: index === 2 ? 0 : 180 + index * 40,
    durationS: index === 2 ? 0 : 55 + index * 10,
    startDistanceM: index * 200,
    endDistanceM: index === 2 ? index * 200 : index * 200 + 180 + index * 40,
    startDurationS: index * 60,
    endDurationS: index === 2 ? index * 60 : index * 60 + 55 + index * 10,
    maneuverType: index === 0 ? 'depart' : index === 2 ? 'arrive' : 'turn',
    modifier: index === 1 ? 'right' : null,
    roadName: index === 2 ? 'Camp Bravo' : `Forest Road ${index + 1}`,
    location: { lat: 38.7807 + index * 0.001, lng: -121.2076 + index * 0.001 },
    geometry: [
      { lat: 38.7807 + index * 0.001, lng: -121.2076 + index * 0.001 },
      { lat: 38.7812 + index * 0.001, lng: -121.207 + index * 0.001 },
    ],
    bannerInstructions: [],
    voiceInstructions: [],
  };
}

function makeRoadRoute({ id, rerouteGeneration, selectedRouteIndex, instructions, geometry }) {
  const guidanceSteps = instructions.map((instruction, index) =>
    makeGuidanceStep(id, index, instruction),
  );
  const roadSteps = instructions.map((instruction, index) =>
    makeRoadStep(id, index, instruction),
  );
  const distanceM = guidanceSteps.reduce((sum, step) => sum + step.distanceMeters, 0);
  const durationS = guidanceSteps.reduce((sum, step) => sum + step.durationSeconds, 0);
  return {
    id,
    routeVersion: `${id}-accepted-route-version`,
    routeIndex: selectedRouteIndex,
    mapboxRouteUuid: `${id}-uuid`,
    selectedRouteIndex,
    guidance: {
      id,
      source: 'mapbox_directions',
      routeUuid: `${id}-uuid`,
      geometry,
      distanceMeters: distanceM,
      durationSeconds: durationS,
      etaIso: '2026-06-29T18:10:00.000Z',
      legs: [
        {
          legIndex: 0,
          distanceMeters: distanceM,
          durationSeconds: durationS,
          summary: 'Fixture guidance',
          steps: guidanceSteps,
        },
      ],
      steps: guidanceSteps,
      createdAt: '2026-06-29T17:00:00.000Z',
      rerouteGeneration,
      guidanceMode: guidanceSteps.length > 0 ? 'turn_by_turn' : 'summary_only',
      guidanceSourceLabel: 'Mapbox turn-by-turn',
    },
    origin,
    destination,
    geometry,
    distanceM,
    durationS,
    steps: roadSteps,
    legs: [
      {
        id: `${id}-leg-0`,
        summary: 'Fixture road leg',
        distanceM,
        durationS,
        stepStartIndex: 0,
        stepEndIndex: roadSteps.length,
        stepCount: roadSteps.length,
      },
    ],
    guidanceMode: guidanceSteps.length > 0 ? 'turn_by_turn' : 'summary_only',
    bounds: null,
    createdAt: '2026-06-29T17:00:00.000Z',
  };
}

function makeProgress(state, currentStepIndex) {
  return {
    routeId: state.routeId,
    routeVersion: state.routeVersion,
    rerouteGeneration: state.rerouteGeneration,
    currentLegIndex: 0,
    currentStepIndex,
    distanceToNextManeuverMeters: 80,
    distanceRemainingMeters: state.distanceMeters,
    durationRemainingSeconds: state.durationSeconds,
    currentInstruction: state.steps[currentStepIndex]?.instruction ?? null,
    currentRoadName: state.steps[currentStepIndex]?.displayRoadName ?? null,
    nextInstruction: state.steps[currentStepIndex + 1]?.instruction ?? null,
    offRouteCandidate: false,
    confidence: 'high',
    updatedAt: '2026-06-29T17:01:00.000Z',
    distanceFromRouteMeters: 3,
    distanceRemainingOnCurrentStepMeters: 80,
    nearestRoutePoint: null,
    nearestStepPoint: null,
    currentStep: state.steps[currentStepIndex] ?? null,
    nextStep: state.steps[currentStepIndex + 1] ?? null,
    followingStep: state.steps[currentStepIndex + 2] ?? null,
    upcomingSteps: state.steps.slice(currentStepIndex),
  };
}

const initialRoute = makeRoadRoute({
  id: 'road-route-initial',
  rerouteGeneration: 0,
  selectedRouteIndex: 0,
  instructions: [
    'Head north on Yankee Jim Road',
    'Turn right onto Foresthill Road',
    'You have arrived at your destination',
  ],
  geometry: [
    origin,
    { lat: 38.7817, lng: -121.2068 },
    destinationCoordinate,
  ],
});

const initialState = buildActiveGuidanceStateFromRoadRoute({
  route: initialRoute,
  refreshReason: 'initial',
  refreshedAt: '2026-06-29T17:00:00.000Z',
});

assert.strictEqual(initialState.routeId, initialRoute.id);
assert.strictEqual(
  initialState.routeVersion,
  initialRoute.routeVersion,
  'Active guidance state should preserve the accepted selected routeVersion.',
);
assert.strictEqual(initialState.selectedRouteIndex, 0);
assert.strictEqual(initialState.refreshReason, 'initial');
assert.strictEqual(initialState.generatedAt, initialRoute.createdAt);
assert.strictEqual(initialState.refreshedAt, '2026-06-29T17:00:00.000Z');
assert.deepStrictEqual(initialState.origin, origin);
assert.deepStrictEqual(initialState.destination, destinationCoordinate);
assert.deepStrictEqual(
  initialState.geometry,
  initialRoute.geometry.map((point) => ({
    ...point,
    routeVersion: initialRoute.routeVersion,
  })),
);
assert.strictEqual(initialState.steps.length, 3);
assert.strictEqual(initialState.maneuvers.length, 3);
assert.strictEqual(initialState.etaIso, '2026-06-29T18:10:00.000Z');
assert.strictEqual(initialState.distanceMeters, initialRoute.distanceM);
assert.strictEqual(initialState.durationSeconds, initialRoute.durationS);
assert.strictEqual(
  initialState.routeVersion,
  'road-route-initial-accepted-route-version',
  'routeVersion should preserve the accepted route token.',
);

const initialList = buildVersionedActiveGuidanceDirectionList({
  activeGuidance: initialState,
  progress: makeProgress(initialState, 0),
  status: 'navigation_active',
});
assert.strictEqual(initialList.state, 'ready');
assert.strictEqual(initialList.routeVersion, initialState.routeVersion);
assert.deepStrictEqual(
  initialList.items.map((item) => item.instruction),
  [
    'Head north on Yankee Jim Road',
    'Turn right onto Foresthill Road',
    'You have arrived at your destination',
  ],
);

const sameGenerationStaleVersionList = buildVersionedActiveGuidanceDirectionList({
  activeGuidance: initialState,
  progress: {
    ...makeProgress(initialState, 1),
    routeId: initialState.routeId,
    rerouteGeneration: initialState.rerouteGeneration,
    routeVersion: 'stale-route-version-for-same-generation',
    currentInstruction: 'Stale maneuver from previous route object',
    upcomingSteps: [
      {
        ...initialState.steps[1],
        id: 'stale-step',
        instruction: 'Stale maneuver from previous route object',
      },
    ],
  },
  status: 'navigation_active',
});
assert.strictEqual(sameGenerationStaleVersionList.stalePrevented, true);
assert(
  !sameGenerationStaleVersionList.items.some((item) =>
    item.instruction.includes('Stale maneuver'),
  ),
  'Turn-by-turn renderer should ignore progress steps whose routeVersion differs from active guidance.',
);

const reroutedRoute = makeRoadRoute({
  id: 'road-route-rerouted',
  rerouteGeneration: 1,
  selectedRouteIndex: 1,
  instructions: [
    'Continue on Auburn Ravine Road',
    'Turn right onto Mill Road',
    'You have arrived at your destination',
  ],
  geometry: [
    { lat: 38.781, lng: -121.206 },
    { lat: 38.7824, lng: -121.2044 },
    destinationCoordinate,
  ],
});

const reroutedState = buildActiveGuidanceStateFromRoadRoute({
  route: reroutedRoute,
  refreshReason: 'reroute',
  refreshedAt: '2026-06-29T17:03:00.000Z',
});

assert.notStrictEqual(reroutedState.routeVersion, initialState.routeVersion);
assert.strictEqual(reroutedState.routeId, reroutedRoute.id);
assert.strictEqual(reroutedState.selectedRouteIndex, 1);
assert.deepStrictEqual(
  reroutedState.geometry,
  reroutedRoute.geometry.map((point) => ({
    ...point,
    routeVersion: reroutedRoute.routeVersion,
  })),
);
assert.deepStrictEqual(
  reroutedState.steps.map((step) => step.instruction),
  reroutedRoute.guidance.steps.map((step) => step.instruction),
  'Reroute state should carry turn steps from the same route response as the new geometry.',
);

const staleList = buildVersionedActiveGuidanceDirectionList({
  activeGuidance: reroutedState,
  progress: makeProgress(initialState, 1),
  status: 'navigation_active',
});
assert.strictEqual(staleList.state, 'ready');
assert.strictEqual(staleList.routeVersion, reroutedState.routeVersion);
assert.strictEqual(staleList.stalePrevented, true);
assert(!staleList.items.some((item) => item.instruction.includes('Foresthill')));
assert.deepStrictEqual(
  staleList.items.map((item) => item.instruction),
  [
    'Continue on Auburn Ravine Road',
    'Turn right onto Mill Road',
    'You have arrived at your destination',
  ],
  'Stale old-route progress must not keep old directions visible under a refreshed route header.',
);

const hydratedRoute = buildActiveGuidanceRouteFromState(
  JSON.parse(JSON.stringify(reroutedState)),
);
assert.strictEqual(hydratedRoute.id, reroutedState.routeId);
assert.strictEqual(hydratedRoute.routeVersion, reroutedState.routeVersion);
assert.strictEqual(hydratedRoute.rerouteGeneration, reroutedState.rerouteGeneration);
assert.deepStrictEqual(
  hydratedRoute.steps.map((step) => step.id),
  reroutedState.steps.map((step) => step.id),
  'Screen-focus hydration should reconstruct the latest active guidance steps.',
);

const tabReturnRoute = makeRoadRoute({
  id: 'road-route-tab-return',
  rerouteGeneration: 2,
  selectedRouteIndex: 0,
  instructions: [
    'Stay left on Hidden Valley Road',
    'Continue to the signed camp spur',
    'You have arrived at your destination',
  ],
  geometry: [
    { lat: 38.7813, lng: -121.2057 },
    { lat: 38.7829, lng: -121.2039 },
    destinationCoordinate,
  ],
});
const tabReturnState = buildActiveGuidanceStateFromRoadRoute({
  route: tabReturnRoute,
  refreshReason: 'screen_focus',
  refreshedAt: '2026-06-29T17:05:00.000Z',
});
const tabReturnList = buildVersionedActiveGuidanceDirectionList({
  activeGuidance: tabReturnState,
  progress: makeProgress(reroutedState, 0),
  status: 'navigation_active',
});
assert.strictEqual(tabReturnList.state, 'ready');
assert.strictEqual(tabReturnList.routeVersion, tabReturnState.routeVersion);
assert.strictEqual(tabReturnList.stalePrevented, true);
assert.deepStrictEqual(
  tabReturnList.items.map((item) => item.instruction),
  tabReturnRoute.guidance.steps.map((step) => step.instruction),
  'Tab return should rehydrate the visible maneuver list from the latest active guidance routeVersion.',
);
assert(
  !tabReturnList.items.some(
    (item) =>
      item.instruction.includes('Auburn Ravine') ||
      item.instruction.includes('Yankee Jim') ||
      item.instruction.includes('Foresthill'),
  ),
  'Tab return must not resurrect stale directions from an older routeVersion.',
);

const summaryRoute = makeRoadRoute({
  id: 'road-route-summary',
  rerouteGeneration: 2,
  selectedRouteIndex: 0,
  instructions: [],
  geometry: [
    origin,
    destinationCoordinate,
  ],
});
summaryRoute.guidance.steps = [];
summaryRoute.guidance.legs = [];
summaryRoute.guidance.guidanceMode = 'summary_only';
summaryRoute.guidance.guidanceLimitationLabel =
  ACTIVE_GUIDANCE_REFRESHED_STEPS_UNAVAILABLE_MESSAGE;

const summaryState = buildActiveGuidanceStateFromRoadRoute({
  route: summaryRoute,
  refreshReason: 'manual_refresh',
  refreshedAt: '2026-06-29T17:06:00.000Z',
});
const summaryList = buildVersionedActiveGuidanceDirectionList({
  activeGuidance: summaryState,
  progress: null,
  status: 'navigation_active',
});
assert.strictEqual(summaryList.state, 'unavailable');
assert.deepStrictEqual(summaryList.items, []);
assert.strictEqual(
  summaryList.emptyMessage,
  ACTIVE_GUIDANCE_REFRESHED_STEPS_UNAVAILABLE_MESSAGE,
);
assert.strictEqual(summaryList.routeVersion, summaryState.routeVersion);

const progressRoute = buildActiveGuidanceRouteFromState(reroutedState);
const routeVersionedProgress = resolveEcsActiveGuidanceProgress({
  currentCoordinate: reroutedState.geometry[0],
  activeRoute: progressRoute,
  updatedAt: '2026-06-29T17:04:00.000Z',
});
assert.strictEqual(
  routeVersionedProgress.routeVersion,
  reroutedState.routeVersion,
  'Generated active guidance progress should carry the active routeVersion for renderer guards.',
);

const overlaySource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'RoadNavigationOverlay.tsx'),
  'utf8',
);
const hookSource = fs.readFileSync(path.join(root, 'lib', 'useRoadNavigation.ts'), 'utf8');
const storeSource = fs.readFileSync(path.join(root, 'lib', 'roadNavigationStore.ts'), 'utf8');
const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');

assert(
  hookSource.includes('activeGuidance: ActiveGuidanceState | null') &&
    hookSource.includes('buildActiveGuidanceStateFromRoadRoute') &&
    hookSource.includes('refreshReason'),
  'useRoadNavigation should keep a versioned activeGuidance object in the session.',
);
assert(
  hookSource.includes('[ECS Guidance] routeVersion updated') &&
    hookSource.includes('[ECS Guidance] maneuvers replaced') &&
    hookSource.includes('[ECS Guidance] stale route response ignored'),
  'Reroute/manual refresh should emit development diagnostics when state and maneuvers are replaced or stale responses are ignored.',
);
assert(
  hookSource.includes('routeRequestSeqRef.current !== requestSeq') &&
    hookSource.includes('inFlightRouteKeyRef.current !== routeKey') &&
    hookSource.includes('[ECS Guidance] stale route response ignored'),
  'Reroute race guard should ignore superseded route responses so request A cannot overwrite newer request B.',
);
assert(
  hookSource.includes('prev.activeGuidance.routeVersion !== activeGuidance.routeVersion') &&
    hookSource.includes('restoredRefreshMs <= currentRefreshMs') &&
    hookSource.includes('[ECS Guidance] stale guidance prevented'),
  'Focus rehydrate should prevent older persisted active guidance from replacing a newer in-memory routeVersion.',
);
assert(
  overlaySource.includes('buildVersionedActiveGuidanceDirectionList') &&
    overlaySource.includes('ACTIVE_GUIDANCE_REFRESHED_STEPS_UNAVAILABLE_MESSAGE') &&
    overlaySource.includes('[ECS Guidance] stale guidance prevented'),
  'RoadNavigationOverlay should render directions from versioned active guidance and prevent stale lists.',
);
assert(
  storeSource.includes('activeGuidance?: ActiveGuidanceState | null'),
  'Persisted road navigation session should store the latest active guidance snapshot for tab/screen rehydration.',
);
assert(
  navigateSource.includes('rehydrateActiveGuidance') &&
    navigateSource.includes('[ECS Guidance] focus rehydrate'),
  'Navigate focus lifecycle should rehydrate from active guidance state on tab return.',
);

console.log('Active guidance state refresh regression passed.');
