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
  buildStagedActiveGuidanceRouteOptions,
} = loadTsModule(path.join('lib', 'navigation', 'stagedActiveGuidanceRouteOptions.ts'));
const {
  buildActiveGuidanceStateFromRoadRoute,
} = loadTsModule(path.join('lib', 'navigation', 'activeGuidanceState.ts'));

function formatDistance(meters) {
  return `${Math.round(meters / 1609.344)} mi`;
}

function formatDuration(seconds) {
  return `${Math.round(seconds / 60)} min`;
}

function formatEta(etaIso) {
  return etaIso ? etaIso.slice(11, 16) : '--';
}

const origin = { lat: 38.78, lng: -121.2 };
const destinationCoordinate = { lat: 38.84, lng: -121.1 };
const destination = {
  id: 'route-options-destination',
  title: 'Camp Route',
  subtitle: null,
  coordinate: destinationCoordinate,
  sourceType: 'manual_selection',
  raw: null,
};

function makeStep(routeId, index) {
  const coordinate = { lat: 38.78 + index * 0.01, lng: -121.2 + index * 0.01 };
  return {
    id: `${routeId}-step-${index}`,
    instruction: index === 0 ? 'Head toward the route' : 'Continue on selected route',
    distanceM: 3000,
    durationS: 300,
    startDistanceM: index * 3000,
    endDistanceM: (index + 1) * 3000,
    startDurationS: index * 300,
    endDurationS: (index + 1) * 300,
    maneuverType: index === 0 ? 'depart' : 'continue',
    modifier: null,
    roadName: `Option Road ${index + 1}`,
    location: coordinate,
    geometry: [coordinate, { lat: coordinate.lat + 0.005, lng: coordinate.lng + 0.005 }],
    bannerInstructions: [],
    voiceInstructions: [],
  };
}

function makeGuidanceStep(routeId, index) {
  const coordinate = { lat: 38.78 + index * 0.01, lng: -121.2 + index * 0.01 };
  return {
    id: `${routeId}-guidance-${index}`,
    legIndex: 0,
    stepIndex: index,
    globalStepIndex: index,
    instruction: index === 0 ? 'Head toward the route' : 'Continue on selected route',
    shortInstruction: index === 0 ? 'Head toward the route' : 'Continue',
    maneuverType: index === 0 ? 'depart' : 'continue',
    roadName: `Option Road ${index + 1}`,
    displayRoadName: `Option Road ${index + 1}`,
    isUnnamedRoad: false,
    distanceMeters: 3000,
    durationSeconds: 300,
    maneuverLocation: [coordinate.lng, coordinate.lat],
    geometry: [coordinate, { lat: coordinate.lat + 0.005, lng: coordinate.lng + 0.005 }],
  };
}

function makeRoute(id, selectedRouteIndex, durationS, distanceM, summary, geometry) {
  const steps = [makeStep(id, 0), makeStep(id, 1)];
  const guidanceSteps = [makeGuidanceStep(id, 0), makeGuidanceStep(id, 1)];
  return {
    id,
    routeVersion: `${id}-accepted-route-version`,
    routeIndex: selectedRouteIndex,
    mapboxRouteUuid: `${id}-uuid`,
    selectedRouteIndex,
    providerMetadata: {
      provider: 'mapbox_directions',
      profile: 'driving-traffic',
      routeUuid: `${id}-uuid`,
    },
    guidance: {
      id,
      source: 'mapbox_directions',
      routeUuid: `${id}-uuid`,
      geometry,
      distanceMeters: distanceM,
      durationSeconds: durationS,
      etaIso: '2026-06-29T18:00:00.000Z',
      legs: [
        {
          legIndex: 0,
          distanceMeters: distanceM,
          durationSeconds: durationS,
          summary,
          steps: guidanceSteps,
        },
      ],
      steps: guidanceSteps,
      createdAt: '2026-06-29T17:00:00.000Z',
      rerouteGeneration: 0,
      guidanceMode: 'turn_by_turn',
      guidanceSourceLabel: 'Mapbox turn-by-turn',
    },
    origin,
    destination,
    geometry,
    distanceM,
    durationS,
    steps,
    legs: [
      {
        id: `${id}-leg-0`,
        summary,
        distanceM,
        durationS,
        stepStartIndex: 0,
        stepEndIndex: steps.length,
        stepCount: steps.length,
      },
    ],
    guidanceMode: 'turn_by_turn',
    bounds: null,
    createdAt: '2026-06-29T17:00:00.000Z',
  };
}

const primary = makeRoute('primary', 0, 1800, 20000, 'Via Main Canyon Road', [
  origin,
  { lat: 38.8, lng: -121.16 },
  destinationCoordinate,
]);
const alternateOne = makeRoute('alternate-one', 1, 2100, 23000, 'Via Ridge Road', [
  origin,
  { lat: 38.81, lng: -121.15 },
  destinationCoordinate,
]);
const alternateTwo = makeRoute('alternate-two', 2, 2520, 27000, 'Via River Road', [
  origin,
  { lat: 38.79, lng: -121.12 },
  destinationCoordinate,
]);

const commonFormatters = {
  formatDistance,
  formatDuration,
  formatEta,
  nowMs: Date.parse('2026-06-29T17:00:00.000Z'),
};

const threeRouteOptions = buildStagedActiveGuidanceRouteOptions({
  routes: [primary, alternateOne, alternateTwo],
  selectedRouteId: primary.id,
  ...commonFormatters,
});

assert.strictEqual(threeRouteOptions.length, 3);
assert.deepStrictEqual(
  threeRouteOptions.map((option) => option.label),
  ['Primary / Recommended', 'Alternate 1', 'Alternate 2'],
);
assert.deepStrictEqual(
  threeRouteOptions.map((option) => option.etaLabel),
  ['17:30', '17:35', '17:42'],
);
assert.deepStrictEqual(
  threeRouteOptions.map((option) => option.distanceLabel),
  ['12 mi', '14 mi', '17 mi'],
);
assert.strictEqual(threeRouteOptions[0].summaryLabel, 'Via Main Canyon Road');
assert.strictEqual(threeRouteOptions[1].summaryLabel, 'Via Ridge Road');
assert.strictEqual(threeRouteOptions[0].dataStatusLabel, 'Mapbox turn-by-turn');
assert.strictEqual(threeRouteOptions[0].routeVersion, primary.routeVersion);
assert.strictEqual(threeRouteOptions[1].routeVersion, alternateOne.routeVersion);
assert.strictEqual(threeRouteOptions[2].routeVersion, alternateTwo.routeVersion);
assert.strictEqual(threeRouteOptions[2].routeIndex, 2);
assert.deepStrictEqual(threeRouteOptions[2].geometry, alternateTwo.guidance.geometry);
assert.deepStrictEqual(
  threeRouteOptions[2].steps.map((step) => step.id),
  alternateTwo.guidance.steps.map((step) => step.id),
);
assert.deepStrictEqual(threeRouteOptions[1].providerMetadata, alternateOne.providerMetadata);
assert.strictEqual(threeRouteOptions[0].selected, true);
assert.strictEqual(threeRouteOptions[1].disabled, false);
assert.strictEqual(threeRouteOptions[2].disabled, false);

const oneRouteOptions = buildStagedActiveGuidanceRouteOptions({
  routes: [primary],
  selectedRouteId: primary.id,
  ...commonFormatters,
});
assert.strictEqual(oneRouteOptions.length, 3);
assert.strictEqual(oneRouteOptions[0].label, 'Primary / Recommended');
assert.strictEqual(oneRouteOptions[0].disabled, false);
assert.strictEqual(oneRouteOptions[1].label, 'Alternate unavailable');
assert.strictEqual(oneRouteOptions[1].disabled, true);
assert.strictEqual(oneRouteOptions[1].etaLabel, '--');
assert.strictEqual(oneRouteOptions[2].label, 'No safe alternate found');
assert.strictEqual(oneRouteOptions[2].disabled, true);
assert(
  !oneRouteOptions.slice(1).some((option) => option.routeId === primary.id),
  'Missing alternatives must not duplicate the primary route.',
);

const selectedAlternateOptions = buildStagedActiveGuidanceRouteOptions({
  routes: [primary, alternateOne, alternateTwo],
  selectedRouteId: alternateTwo.id,
  ...commonFormatters,
});
assert.strictEqual(selectedAlternateOptions[2].selected, true);
assert.strictEqual(selectedAlternateOptions[2].selectedRouteIndex, 2);

const selectedAlternateOneOptions = buildStagedActiveGuidanceRouteOptions({
  routes: [primary, alternateOne, alternateTwo],
  selectedRouteId: alternateOne.id,
  ...commonFormatters,
});
assert.strictEqual(selectedAlternateOneOptions[0].selected, false);
assert.strictEqual(selectedAlternateOneOptions[1].selected, true);
assert.strictEqual(selectedAlternateOneOptions[1].selectedRouteIndex, 1);
assert.strictEqual(selectedAlternateOneOptions[1].routeVersion, alternateOne.routeVersion);
assert.strictEqual(selectedAlternateOneOptions[1].etaLabel, '17:35');
assert.strictEqual(selectedAlternateOneOptions[1].distanceLabel, '14 mi');
assert.deepStrictEqual(
  selectedAlternateOneOptions[1].geometry,
  alternateOne.guidance.geometry,
  'Selecting Alternate 1 should expose Alternate 1 geometry for the staged preview line.',
);
assert.notDeepStrictEqual(
  selectedAlternateOneOptions[1].geometry,
  primary.guidance.geometry,
  'Selecting Alternate 1 must not keep the primary geometry on the staged preview line.',
);
assert.deepStrictEqual(
  selectedAlternateOneOptions[1].steps.map((step) => step.id),
  alternateOne.guidance.steps.map((step) => step.id),
  'Selecting Alternate 1 should expose Alternate 1 turn steps for staged guidance preview.',
);

const selectedAlternateOneActiveGuidance = buildActiveGuidanceStateFromRoadRoute({
  route: alternateOne,
  refreshReason: 'initial',
  refreshedAt: '2026-06-29T17:01:00.000Z',
});
assert.strictEqual(selectedAlternateOneActiveGuidance.selectedRouteIndex, 1);
assert.strictEqual(selectedAlternateOneActiveGuidance.routeVersion, alternateOne.routeVersion);
assert.strictEqual(selectedAlternateOneActiveGuidance.etaIso, alternateOne.guidance.etaIso);
assert.strictEqual(selectedAlternateOneActiveGuidance.distanceMeters, alternateOne.guidance.distanceMeters);
assert.strictEqual(selectedAlternateOneActiveGuidance.durationSeconds, alternateOne.guidance.durationSeconds);
assert.deepStrictEqual(
  selectedAlternateOneActiveGuidance.geometry,
  alternateOne.guidance.geometry.map((point) => ({
    ...point,
    routeVersion: alternateOne.routeVersion,
  })),
  'Starting guidance from Alternate 1 should promote Alternate 1 versioned geometry exactly.',
);
assert.deepStrictEqual(
  selectedAlternateOneActiveGuidance.steps.map((step) => step.id),
  alternateOne.guidance.steps.map((step) => step.id),
  'Starting guidance from Alternate 1 should promote Alternate 1 steps exactly.',
);

const selectedActiveGuidance = buildActiveGuidanceStateFromRoadRoute({
  route: alternateTwo,
  refreshReason: 'initial',
  refreshedAt: '2026-06-29T17:01:00.000Z',
});
assert.strictEqual(selectedActiveGuidance.selectedRouteIndex, 2);
assert.strictEqual(
  selectedActiveGuidance.routeVersion,
  alternateTwo.routeVersion,
  'Starting guidance from an alternate should preserve that exact selected routeVersion.',
);
assert.deepStrictEqual(
  selectedActiveGuidance.geometry,
  alternateTwo.guidance.geometry.map((point) => ({
    ...point,
    routeVersion: alternateTwo.routeVersion,
  })),
  'Starting guidance from an alternate should use that alternate versioned geometry.',
);
assert.deepStrictEqual(
  selectedActiveGuidance.steps.map((step) => step.id),
  alternateTwo.guidance.steps.map((step) => step.id),
  'Starting guidance from an alternate should use that alternate turn steps.',
);

const overlaySource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'RoadNavigationOverlay.tsx'),
  'utf8',
);
const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
const hookSource = fs.readFileSync(path.join(root, 'lib', 'useRoadNavigation.ts'), 'utf8');
const mapboxSource = fs.readFileSync(path.join(root, 'lib', 'mapboxRoadNavigation.ts'), 'utf8');
const helperSource = fs.readFileSync(
  path.join(root, 'lib', 'navigation', 'stagedActiveGuidanceRouteOptions.ts'),
  'utf8',
);

assert(
  navigateSource.includes('buildStagedActiveGuidanceRouteOptions') &&
    navigateSource.includes('selectedRouteId: route?.id ?? null'),
  'Navigate should derive staged route option cards from the selected preview route.',
);
assert(
  overlaySource.includes('option.disabled') &&
    overlaySource.includes('option.etaLabel') &&
    overlaySource.includes('Start Guidance'),
  'RoadNavigationOverlay should render glanceable ETA-forward route option cards and keep Start Guidance visible.',
);
assert(
  helperSource.includes('Primary / Recommended') &&
    helperSource.includes('Alternate unavailable') &&
    helperSource.includes('No safe alternate found'),
  'Staged route option labels should live in the route option builder.',
);
assert(
  hookSource.includes('applyRoute(') &&
    hookSource.includes('selectedRoute') &&
    hookSource.includes("activeSession.status !== 'route_preview'"),
  'Selecting an alternate should replace the staged preview route before Start Guidance reads session.route.',
);
assert(
  mapboxSource.includes("url.searchParams.set('alternatives', 'true')") &&
    mapboxSource.includes("url.searchParams.set('steps', 'true')") &&
    mapboxSource.includes("url.searchParams.set('overview', 'full')"),
  'Mapbox route preview should request real alternatives, steps, and full geometry.',
);

console.log('Staged active guidance route option checks passed.');
