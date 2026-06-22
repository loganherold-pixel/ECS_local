const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const fixtureDir = path.join(root, 'fixtures', 'navigation', 'turn-by-turn');
const moduleCache = new Map();

function readJson(fileName) {
  const fullPath = path.join(fixtureDir, fileName);
  assert(fs.existsSync(fullPath), `Missing turn-by-turn fixture: ${fileName}`);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

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

  function localRequire(request) {
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
          return title && !/cached route/i.test(title)
            ? `Follow highlighted route toward ${title}`
            : 'Follow highlighted route';
        },
      };
    }
    if (request.startsWith('.')) {
      const tsPath = path.relative(root, path.join(path.dirname(filename), `${request}.ts`));
      return loadTsModule(tsPath);
    }
    return require(request);
  }

  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(mod.exports, localRequire, mod, filename, path.dirname(filename));
  return mod.exports;
}

const requiredFixtures = [
  'named-street-route.json',
  'unnamed-road-route.json',
  'uturn-route.json',
  'roundabout-route.json',
  'imported-trail-route.json',
  'reroute-before.json',
  'reroute-after.json',
];
for (const fixture of requiredFixtures) {
  readJson(fixture);
}

const {
  fetchRoadRouteAlternatives,
} = loadTsModule(path.join('lib', 'mapboxRoadNavigation.ts'));
const {
  buildSyntheticEcsGuidanceRouteFromGeometry,
  normalizeMapboxDirectionsRouteToEcsGuidanceRoute,
} = loadTsModule(path.join('lib', 'navigation', 'ecsGuidanceModel.ts'));
const {
  resolveEcsActiveGuidanceProgress,
} = loadTsModule(path.join('lib', 'navigation', 'ecsActiveGuidanceController.ts'));
const {
  buildActiveGuidanceDirectionList,
} = loadTsModule(path.join('lib', 'activeGuidanceDirections.ts'));
const {
  buildActiveGuidanceRouteLineSync,
} = loadTsModule(path.join('lib', 'navigation', 'activeGuidanceRouteLineSync.ts'));
const {
  buildActiveGuidanceDebugDiagnostics,
} = loadTsModule(path.join('lib', 'navigation', 'activeGuidanceDebugDiagnostics.ts'));

const destination = {
  id: 'qa-destination',
  title: 'QA Destination',
  subtitle: 'Turn-by-turn QA endpoint',
  coordinate: { lat: 38.783, lng: -121.206 },
  sourceType: 'manual_selection',
};

function normalizeFixtureRoute(fileName, overrides = {}) {
  const fixture = readJson(fileName);
  return normalizeMapboxDirectionsRouteToEcsGuidanceRoute(fixture, {
    id: overrides.id ?? fileName.replace(/\.json$/, ''),
    destinationName: overrides.destinationName ?? destination.title,
    createdAt: '2026-06-22T12:00:00.000Z',
    rerouteGeneration: overrides.rerouteGeneration ?? 0,
  });
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
    return await callback(() => requestedUrl);
  } finally {
    global.fetch = originalFetch;
  }
}

function progressFor(route, coordinate, previousProgress = null, extra = {}) {
  return resolveEcsActiveGuidanceProgress({
    currentCoordinate: coordinate,
    activeRoute: route,
    previousProgress,
    currentHeadingDegrees: extra.heading,
    currentSpeedMetersPerSecond: extra.speed ?? 8,
    currentGpsAccuracyMeters: extra.accuracy ?? 6,
    rerouteStatus: extra.rerouteStatus,
    updatedAt: extra.updatedAt ?? '2026-06-22T12:01:00.000Z',
  });
}

(async () => {
  const namedFixture = readJson('named-street-route.json');
  const fetchResult = await withMockedFetch(
    { routes: [namedFixture] },
    async (getRequestedUrl) => {
      const routes = await fetchRoadRouteAlternatives({
        accessToken: 'test-token',
        origin: { lat: 38.78, lng: -121.21 },
        destination,
      });
      return { routes, requestedUrl: getRequestedUrl() };
    },
  );

  const requestUrl = new URL(fetchResult.requestedUrl);
  assert.strictEqual(requestUrl.searchParams.get('steps'), 'true');
  assert.strictEqual(requestUrl.searchParams.get('banner_instructions'), 'true');
  assert.strictEqual(requestUrl.searchParams.get('voice_instructions'), 'true');
  assert.strictEqual(requestUrl.searchParams.get('voice_units'), 'imperial');
  assert.strictEqual(requestUrl.searchParams.get('language'), 'en');
  assert.strictEqual(requestUrl.searchParams.get('roundabout_exits'), 'true');
  assert.strictEqual(requestUrl.searchParams.get('overview'), 'full');
  assert.strictEqual(requestUrl.searchParams.get('geometries'), 'geojson');
  assert.strictEqual(requestUrl.searchParams.get('annotations'), 'distance,duration,speed');

  assert.strictEqual(fetchResult.routes.length, 1);
  assert.strictEqual(fetchResult.routes[0].guidance.guidanceMode, 'turn_by_turn');
  assert.strictEqual(fetchResult.routes[0].guidance.source, 'mapbox_directions');
  assert.strictEqual(fetchResult.routes[0].guidance.steps.length, 3);
  assert.strictEqual(fetchResult.routes[0].guidance.steps[1].displayRoadName, 'Foresthill Road');

  const unnamedRoute = normalizeFixtureRoute('unnamed-road-route.json');
  assert.strictEqual(unnamedRoute.steps[0].displayRoadName, 'Unnamed road');
  assert.strictEqual(unnamedRoute.steps[0].instruction, 'Continue on Unnamed road');
  assert(unnamedRoute.steps.every((step) => step.displayRoadName.trim().length > 0));
  assert(!unnamedRoute.steps.some((step) => /^(null|undefined)$/i.test(step.displayRoadName)));

  const fallbackInstructionStep = unnamedRoute.steps[1];
  assert.strictEqual(fallbackInstructionStep.maneuverType, 'turn');
  assert.strictEqual(fallbackInstructionStep.maneuverModifier, 'left');
  assert.strictEqual(fallbackInstructionStep.instruction, 'Turn left onto Unnamed road');

  const uturnRoute = normalizeFixtureRoute('uturn-route.json');
  assert.strictEqual(uturnRoute.steps[0].maneuverModifier, 'uturn');
  assert.match(uturnRoute.steps[0].instruction, /u-turn/i);

  const roundaboutRoute = normalizeFixtureRoute('roundabout-route.json');
  assert.strictEqual(roundaboutRoute.steps[0].maneuverType, 'roundabout');
  assert.match(roundaboutRoute.steps[0].instruction, /roundabout/i);

  const importedTrailFixture = readJson('imported-trail-route.json');
  const importedTrailRoute = buildSyntheticEcsGuidanceRouteFromGeometry(importedTrailFixture);
  assert.strictEqual(importedTrailRoute.source, 'imported_trace');
  assert.strictEqual(importedTrailRoute.guidanceMode, 'turn_by_turn');
  assert.strictEqual(importedTrailRoute.guidanceSourceLabel, 'Imported route guidance');
  assert(importedTrailRoute.steps.some((step) => step.instruction === 'Follow the trail'));

  const stepRoute = normalizeFixtureRoute('named-street-route.json');
  const approachProgress = progressFor(stepRoute, { lat: 38.7802, lng: -121.2099 }, null, { heading: 0 });
  const advancedProgress = progressFor(stepRoute, { lat: 38.7815, lng: -121.2084 }, approachProgress, { heading: 90 });
  assert(
    advancedProgress.currentStepIndex >= approachProgress.currentStepIndex,
    'Current step index should advance or hold steady as GPS moves forward.',
  );
  assert(advancedProgress.distanceToNextManeuverMeters != null);

  const offRouteCandidate = progressFor(stepRoute, { lat: 38.781, lng: -121.214 }, approachProgress, {
    heading: 270,
  });
  assert.strictEqual(offRouteCandidate.offRouteStatus, 'off_route_candidate');
  assert.strictEqual(offRouteCandidate.offRouteCandidate, true);

  const confirmedOffRoute = progressFor(stepRoute, { lat: 38.7812, lng: -121.2144 }, offRouteCandidate, {
    heading: 270,
  });
  assert.strictEqual(confirmedOffRoute.offRouteStatus, 'off_route_confirmed');
  assert(confirmedOffRoute.offRouteUpdateCount >= 2);

  const beforeRoute = normalizeFixtureRoute('reroute-before.json', {
    id: 'reroute-before',
    rerouteGeneration: 0,
  });
  const afterRoute = normalizeFixtureRoute('reroute-after.json', {
    id: 'reroute-after',
    rerouteGeneration: 1,
  });
  const beforeProgress = progressFor(beforeRoute, beforeRoute.geometry[0], null, { heading: 0 });
  const afterProgress = progressFor(afterRoute, afterRoute.geometry[0], null, {
    heading: 90,
    rerouteStatus: 'reroute_applied',
  });
  const beforeList = buildActiveGuidanceDirectionList({
    route: beforeRoute,
    progress: beforeProgress,
    status: 'navigation_active',
  });
  const afterList = buildActiveGuidanceDirectionList({
    route: afterRoute,
    progress: afterProgress,
    status: 'navigation_active',
  });
  assert.strictEqual(afterList.routeId, 'reroute-after');
  assert.strictEqual(afterList.rerouteGeneration, 1);
  assert.notDeepStrictEqual(
    afterList.items.map((item) => item.id),
    beforeList.items.map((item) => item.id),
    'Dropdown directions should refresh after reroute and not keep old steps.',
  );
  assert(!afterList.items.some((item) => item.instruction.includes('Old Mill Road')));

  const beforeLine = buildActiveGuidanceRouteLineSync({
    route: beforeRoute,
    navigationStatus: 'navigation_active',
    routeConfidenceState: 'on_route',
  });
  const afterLine = buildActiveGuidanceRouteLineSync({
    route: afterRoute,
    navigationStatus: 'navigation_active',
    routeConfidenceState: 'reroute_applied',
    routeStatusLabel: 'Route updated',
  });
  assert.notStrictEqual(afterLine.routeLineKey, beforeLine.routeLineKey);
  assert.deepStrictEqual(afterLine.geometry, afterRoute.geometry);

  const failedLine = buildActiveGuidanceRouteLineSync({
    route: beforeRoute,
    navigationStatus: 'navigation_active',
    routeConfidenceState: 'reroute_failed',
    routeStatusLabel: 'Unable to recalculate route',
  });
  assert.strictEqual(failedLine.status, 'reroute_failed');
  assert.deepStrictEqual(failedLine.geometry, beforeRoute.geometry);

  const previousDev = global.__DEV__;
  const previousDebug = global.__ECS_DEBUG_ACTIVE_GUIDANCE__;
  global.__DEV__ = false;
  global.__ECS_DEBUG_ACTIVE_GUIDANCE__ = false;
  assert.strictEqual(
    buildActiveGuidanceDebugDiagnostics({
      route: beforeRoute,
      progress: beforeProgress,
      rerouteStatus: 'on_route',
    }),
    null,
    'Active guidance diagnostics should be gated off outside dev/debug mode.',
  );
  global.__ECS_DEBUG_ACTIVE_GUIDANCE__ = true;
  const diagnostics = buildActiveGuidanceDebugDiagnostics({
    route: afterRoute,
    progress: afterProgress,
    rerouteStatus: 'reroute_applied',
    lastRouteParseError: null,
  });
  assert(diagnostics, 'Debug diagnostics should be available when the active guidance debug flag is enabled.');
  assert.strictEqual(diagnostics.devOnly, true);
  assert.strictEqual(diagnostics.guidanceMode, 'turn_by_turn');
  assert.strictEqual(diagnostics.routeId, 'reroute-after');
  assert.strictEqual(diagnostics.routeUuid, 'reroute-after-uuid');
  assert.strictEqual(diagnostics.rerouteGeneration, 1);
  assert.strictEqual(diagnostics.routeSource, 'mapbox_directions');
  assert.strictEqual(diagnostics.legCount, 1);
  assert.strictEqual(diagnostics.stepCount, 3);
  assert.strictEqual(diagnostics.currentStepIndex, afterProgress.currentStepIndex);
  assert.strictEqual(diagnostics.currentInstruction, afterProgress.currentInstruction);
  assert.strictEqual(diagnostics.distanceToNextManeuverMeters, afterProgress.distanceToNextManeuverMeters);
  assert.strictEqual(diagnostics.distanceFromRouteMeters, afterProgress.distanceFromRouteMeters);
  assert.strictEqual(diagnostics.offRouteStatus, afterProgress.offRouteStatus);
  assert.strictEqual(diagnostics.rerouteStatus, 'reroute_applied');
  assert.strictEqual(diagnostics.lastRouteParseError, null);
  if (previousDev === undefined) delete global.__DEV__;
  else global.__DEV__ = previousDev;
  if (previousDebug === undefined) delete global.__ECS_DEBUG_ACTIVE_GUIDANCE__;
  else global.__ECS_DEBUG_ACTIVE_GUIDANCE__ = previousDebug;

  const diagnosticsSource = fs.readFileSync(
    path.join(root, 'lib', 'navigation', 'activeGuidanceDebugDiagnostics.ts'),
    'utf8',
  );
  assert(
    diagnosticsSource.includes('__DEV__') &&
      diagnosticsSource.includes('__ECS_DEBUG_ACTIVE_GUIDANCE__'),
    'Active guidance diagnostics must stay behind an explicit dev/debug gate.',
  );

  const qaDocPath = path.join(root, 'docs', 'navigation', 'TURN_BY_TURN_QA.md');
  assert(fs.existsSync(qaDocPath), 'Manual Android turn-by-turn QA checklist should exist.');
  const qaDoc = fs.readFileSync(qaDocPath, 'utf8');
  [
    'Start navigation from current GPS to destination',
    'Confirm active card shows next maneuver',
    'Confirm road name appears',
    'Confirm unnamed road fallback appears',
    'Confirm dropdown lists upcoming directions',
    'Confirm current step advances',
    'Go off-route and confirm recalculating indicator',
    'Confirm route line updates',
    'Confirm dropdown refreshes',
    'Confirm ETA/mileage remains visible',
    'Confirm no crash when route has no steps',
    'Confirm summary-only fallback works',
  ].forEach((line) => {
    assert(qaDoc.includes(line), `QA checklist missing: ${line}`);
  });

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.strictEqual(
    packageJson.scripts['test:turn-by-turn-navigation-qa'],
    'node ./scripts/test-turn-by-turn-navigation-qa.js',
  );

  console.log('Turn-by-turn navigation QA suite passed.');
})();
