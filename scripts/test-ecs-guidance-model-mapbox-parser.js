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
  normalizeMapboxDirectionsRouteToEcsGuidanceRoute,
} = loadTsModule(path.join('lib', 'navigation', 'ecsGuidanceModel.ts'));

const mockedMapboxRoute = {
  uuid: 'mapbox-guidance-route-1',
  distance: 1520,
  duration: 420,
  geometry: {
    coordinates: [
      [-121.2101, 38.7801],
      [-121.2092, 38.7811],
      [-121.2084, 38.7822],
      [-121.2075, 38.7833],
    ],
  },
  legs: [
    {
      summary: 'Main Street, State Route 49',
      distance: 1520,
      duration: 420,
      steps: [
        {
          distance: 180,
          duration: 45,
          name: 'Main Street',
          maneuver: {
            instruction: 'Head north on Main Street',
            type: 'depart',
            bearing_before: 0,
            bearing_after: 12,
            location: [-121.2101, 38.7801],
          },
          geometry: {
            coordinates: [
              [-121.2101, 38.7801],
              [-121.2099, 38.7806],
            ],
          },
        },
        {
          distance: 90,
          duration: 30,
          name: '',
          maneuver: {
            type: 'continue',
            location: [-121.2099, 38.7806],
          },
        },
        {
          distance: 240,
          duration: 80,
          name: 'Elm Street',
          maneuver: {
            type: 'turn',
            modifier: 'left',
            location: [-121.2092, 38.7811],
          },
        },
        {
          distance: 120,
          duration: 40,
          name: 'Depot Road',
          maneuver: {
            type: 'turn',
            modifier: 'uturn',
            location: [-121.2089, 38.7816],
          },
        },
        {
          distance: 320,
          duration: 110,
          name: 'State Route 49',
          maneuver: {
            type: 'roundabout',
            modifier: 'right',
            exit: 3,
            location: [-121.2084, 38.7822],
          },
        },
        {
          distance: 75,
          duration: 25,
        },
        {
          distance: 210,
          duration: 60,
          name: null,
          maneuver: {
            type: 'turn',
            modifier: 'right',
            location: [-121.2078, 38.7828],
          },
          bannerInstructions: [
            {
              distanceAlongGeometry: 210,
              primary: {
                text: 'Forest Road 14',
                type: 'turn',
                modifier: 'right',
              },
            },
          ],
          voiceInstructions: [
            {
              distanceAlongGeometry: 190,
              announcement: 'Turn right onto Forest Road 14',
              ssmlAnnouncement: '<speak>Turn right onto Forest Road 14</speak>',
            },
          ],
        },
        {
          distance: 0,
          duration: 0,
          name: '',
          maneuver: {
            type: 'arrive',
            modifier: 'straight',
            location: [-121.2075, 38.7833],
          },
        },
      ],
    },
  ],
};

const guidanceRoute = normalizeMapboxDirectionsRouteToEcsGuidanceRoute(mockedMapboxRoute, {
  id: 'ecs-guidance-test-route',
  destinationName: 'Field Office',
  createdAt: '2026-06-22T12:00:00.000Z',
  rerouteGeneration: 2,
});

assert.strictEqual(guidanceRoute.id, 'ecs-guidance-test-route');
assert.strictEqual(guidanceRoute.source, 'mapbox_directions');
assert.strictEqual(guidanceRoute.routeUuid, 'mapbox-guidance-route-1');
assert.strictEqual(guidanceRoute.distanceMeters, 1520);
assert.strictEqual(guidanceRoute.durationSeconds, 420);
assert.strictEqual(guidanceRoute.createdAt, '2026-06-22T12:00:00.000Z');
assert.strictEqual(guidanceRoute.rerouteGeneration, 2);
assert.strictEqual(guidanceRoute.guidanceMode, 'turn_by_turn');
assert.strictEqual(guidanceRoute.geometry.length, 4);
assert.strictEqual(guidanceRoute.legs.length, 1);
assert.strictEqual(guidanceRoute.legs[0].legIndex, 0);
assert.strictEqual(guidanceRoute.legs[0].steps.length, 8);
assert.strictEqual(guidanceRoute.steps.length, 8);
assert.deepStrictEqual(
  guidanceRoute.steps.map((step) => step.globalStepIndex),
  [0, 1, 2, 3, 4, 5, 6, 7],
);

const namedStreet = guidanceRoute.steps[0];
assert.strictEqual(namedStreet.displayRoadName, 'Main Street');
assert.strictEqual(namedStreet.isUnnamedRoad, false);
assert.strictEqual(namedStreet.instruction, 'Head north on Main Street');
assert.strictEqual(namedStreet.shortInstruction, 'Head north on Main Street');
assert.deepStrictEqual(namedStreet.maneuverLocation, [-121.2101, 38.7801]);
assert.strictEqual(namedStreet.bearingBefore, 0);
assert.strictEqual(namedStreet.bearingAfter, 12);

const unnamedRoad = guidanceRoute.steps[1];
assert.strictEqual(unnamedRoad.displayRoadName, 'Unnamed road');
assert.strictEqual(unnamedRoad.isUnnamedRoad, true);
assert.strictEqual(unnamedRoad.instruction, 'Continue on Unnamed road');
assert.notStrictEqual(unnamedRoad.displayRoadName, '');
assert.notStrictEqual(unnamedRoad.displayRoadName.toLowerCase(), 'null');
assert.notStrictEqual(unnamedRoad.displayRoadName.toLowerCase(), 'undefined');

const turnLeft = guidanceRoute.steps[2];
assert.strictEqual(turnLeft.instruction, 'Turn left onto Elm Street');
assert.strictEqual(turnLeft.maneuverType, 'turn');
assert.strictEqual(turnLeft.maneuverModifier, 'left');

const uTurn = guidanceRoute.steps[3];
assert.strictEqual(uTurn.instruction, 'Make a U-turn onto Depot Road');
assert.strictEqual(uTurn.shortInstruction, 'U-turn onto Depot Road');

const roundabout = guidanceRoute.steps[4];
assert.strictEqual(roundabout.instruction, 'At the roundabout, take exit 3 onto State Route 49');
assert.strictEqual(roundabout.maneuverType, 'roundabout');

const missingManeuver = guidanceRoute.steps[5];
assert.strictEqual(missingManeuver.maneuverType, 'continue');
assert.strictEqual(missingManeuver.displayRoadName, 'Unnamed road');
assert.strictEqual(missingManeuver.instruction, 'Continue on Unnamed road');
assert.strictEqual(missingManeuver.maneuverLocation, undefined);
assert.strictEqual(missingManeuver.geometry, undefined);

const missingStepName = guidanceRoute.steps[6];
assert.strictEqual(missingStepName.displayRoadName, 'Forest Road 14');
assert.strictEqual(missingStepName.isUnnamedRoad, false);
assert.strictEqual(missingStepName.instruction, 'Turn right onto Forest Road 14');
assert.strictEqual(missingStepName.bannerInstructions?.[0]?.primaryText, 'Forest Road 14');
assert.strictEqual(missingStepName.voiceInstructions?.[0]?.announcement, 'Turn right onto Forest Road 14');

const arrival = guidanceRoute.steps[7];
assert.strictEqual(arrival.displayRoadName, 'Field Office');
assert.strictEqual(arrival.instruction, 'You have arrived at your destination');
assert.strictEqual(arrival.shortInstruction, 'Arrived');
assert.strictEqual(arrival.maneuverType, 'arrive');

const summaryOnlyRoute = normalizeMapboxDirectionsRouteToEcsGuidanceRoute(
  {
    uuid: 'summary-only-route',
    distance: 600,
    duration: 90,
    geometry: {
      coordinates: [
        [-121.21, 38.78],
        [-121.2, 38.79],
      ],
    },
    legs: [],
  },
  {
    id: 'summary-only-guidance',
    source: 'summary_only',
    destinationName: 'Fallback Camp',
    createdAt: '2026-06-22T12:30:00.000Z',
  },
);

assert.strictEqual(summaryOnlyRoute.source, 'summary_only');
assert.strictEqual(summaryOnlyRoute.guidanceMode, 'summary_only');
assert.strictEqual(summaryOnlyRoute.legs.length, 0);
assert.strictEqual(summaryOnlyRoute.steps.length, 0);
assert.strictEqual(summaryOnlyRoute.distanceMeters, 600);
assert.strictEqual(summaryOnlyRoute.durationSeconds, 90);

console.log('ECS guidance model Mapbox parser regression passed.');
