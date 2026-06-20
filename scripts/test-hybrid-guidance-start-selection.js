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
  hybridRoadRouteHasPendingManeuver,
  shouldHybridStartWithTrail,
} = loadTsModule(path.join('lib', 'hybridGuidanceStart.ts'));

const routeWithStreetTurn = {
  id: 'hybrid-road-approach',
  distanceM: 260000,
  steps: [
    {
      id: 'depart',
      instruction: 'Head east on Cedar Street',
      distanceM: 120,
      startDistanceM: 0,
      endDistanceM: 120,
      maneuverType: 'depart',
      roadName: 'Cedar Street',
    },
    {
      id: 'turn-southside',
      instruction: 'Turn left onto Southside Ranch Road',
      distanceM: 900,
      startDistanceM: 120,
      endDistanceM: 1020,
      maneuverType: 'turn',
      modifier: 'left',
      roadName: 'Southside Ranch Road',
    },
    {
      id: 'continue',
      instruction: 'Continue on Forest Road 14N',
      distanceM: 258980,
      startDistanceM: 1020,
      endDistanceM: 260000,
      maneuverType: 'continue',
      roadName: 'Forest Road 14N',
    },
  ],
};

assert.strictEqual(
  hybridRoadRouteHasPendingManeuver(routeWithStreetTurn),
  true,
  'A hybrid road approach with a street turn should be treated as maneuver-capable.',
);
assert.strictEqual(
  shouldHybridStartWithTrail({
    fullRouteStatus: 'ready',
    startSource: 'gps_on_trail',
    trailStartIndex: 0,
    roadRoute: routeWithStreetTurn,
  }),
  false,
  'Hybrid guidance must not skip road turn-by-turn when a road approach has pending maneuvers.',
);
assert.strictEqual(
  shouldHybridStartWithTrail({
    fullRouteStatus: 'ready',
    startSource: 'gps_on_trail',
    trailStartIndex: 4,
    roadRoute: routeWithStreetTurn,
  }),
  true,
  'Hybrid guidance may start directly on trail when GPS is already forward on the route spine.',
);

assert.strictEqual(
  shouldHybridStartWithTrail({
    fullRouteStatus: 'ready',
    startSource: 'gps_on_trail',
    trailStartIndex: 0,
    roadRoute: {
      id: 'already-at-trail',
      distanceM: 24,
      steps: [
        {
          id: 'arrive',
          instruction: 'Arrive at trailhead',
          distanceM: 24,
          startDistanceM: 0,
          endDistanceM: 24,
          maneuverType: 'arrive',
          roadName: null,
        },
      ],
    },
  }),
  true,
  'Hybrid guidance may start directly on trail when the road approach is only an arrival stub.',
);
assert.strictEqual(
  shouldHybridStartWithTrail({
    fullRouteStatus: 'ready',
    startSource: 'road_approach',
    roadRoute: routeWithStreetTurn,
  }),
  false,
  'Hybrid guidance should only start directly on trail from a GPS-on-trail full-route state.',
);

const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
assert(
    navigateSource.includes('shouldHybridStartWithTrail({') &&
    navigateSource.includes('roadRoute: roadNavigation.session.route') &&
    navigateSource.includes('trailStartIndex: fullRouteGuidanceModel.trailStartIndex') &&
    navigateSource.includes("explorePreviewMode === 'hybrid' && !hybridStartCanUseTrail"),
  'Navigate should use the shared hybrid start selector before choosing road or trail guidance.',
);

console.log('Hybrid guidance start selection checks passed.');
