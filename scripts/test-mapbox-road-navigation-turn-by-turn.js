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
          return `Continue to ${title || 'destination'}`;
        },
      };
    }
    if (request === './navigation/ecsGuidanceModel') {
      return loadTsModule(path.join('lib', 'navigation', 'ecsGuidanceModel.ts'));
    }
    return require(request);
  };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(mod.exports, localRequire, mod, filename, path.dirname(filename));
  return mod.exports;
}

const {
  fetchRoadRouteAlternatives,
} = loadTsModule(path.join('lib', 'mapboxRoadNavigation.ts'));

const destination = {
  id: 'field-office',
  title: 'Field Office',
  subtitle: 'QA route target',
  coordinate: { lat: 38.7824, lng: -121.2063 },
  sourceType: 'manual_selection',
};

function buildStep(overrides = {}) {
  return {
    distance: 120,
    duration: 55,
    name: 'Sierra College Boulevard',
    maneuver: {
      instruction: 'Turn right onto Sierra College Boulevard',
      type: 'turn',
      modifier: 'right',
      location: [-121.2076, 38.7816],
    },
    geometry: {
      coordinates: [
        [-121.2076, 38.7816],
        [-121.2063, 38.7816],
      ],
    },
    bannerInstructions: [
      {
        distanceAlongGeometry: 120,
        primary: {
          text: 'Sierra College Boulevard',
          type: 'turn',
          modifier: 'right',
        },
      },
    ],
    voiceInstructions: [
      {
        distanceAlongGeometry: 100,
        announcement: 'Turn right onto Sierra College Boulevard',
        ssmlAnnouncement: '<speak>Turn right onto Sierra College Boulevard</speak>',
      },
    ],
    ...overrides,
  };
}

function buildRoute(overrides = {}) {
  return {
    uuid: 'mapbox-route-uuid-123',
    distance: 270,
    duration: 120,
    geometry: {
      coordinates: [
        [-121.2076, 38.7807],
        [-121.2076, 38.7816],
        [-121.2063, 38.7816],
        [-121.2063, 38.7824],
      ],
    },
    legs: [
      {
        summary: 'Southside Ranch Road, Sierra College Boulevard',
        distance: 270,
        duration: 120,
        steps: [
          buildStep({
            distance: 100,
            duration: 40,
            name: 'Southside Ranch Road',
            maneuver: {
              instruction: 'Head north on Southside Ranch Road',
              type: 'depart',
              location: [-121.2076, 38.7807],
            },
          }),
          buildStep(),
        ],
      },
    ],
    ...overrides,
  };
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
    const result = await callback(() => requestedUrl);
    return result;
  } finally {
    global.fetch = originalFetch;
  }
}

async function fetchRoutes(payload, getUrlCallback) {
  return fetchRoadRouteAlternatives({
    accessToken: 'test-token',
    origin: { lat: 38.7807, lng: -121.2076 },
    destination,
  }).then((routes) => ({ routes, requestedUrl: getUrlCallback() }));
}

async function testTurnByTurnRequestAndParser() {
  const { routes, requestedUrl } = await withMockedFetch(
    { routes: [buildRoute()] },
    (getRequestedUrl) => fetchRoutes(null, getRequestedUrl),
  );

  const url = new URL(requestedUrl);
  assert.strictEqual(url.searchParams.get('steps'), 'true');
  assert.strictEqual(url.searchParams.get('banner_instructions'), 'true');
  assert.strictEqual(url.searchParams.get('voice_instructions'), 'true');
  assert.strictEqual(url.searchParams.get('voice_units'), 'imperial');
  assert.strictEqual(url.searchParams.get('language'), 'en');
  assert.strictEqual(url.searchParams.get('roundabout_exits'), 'true');
  assert.strictEqual(url.searchParams.get('overview'), 'full');
  assert.strictEqual(url.searchParams.get('geometries'), 'geojson');
  assert.strictEqual(url.searchParams.get('alternatives'), 'true');
  assert.strictEqual(url.searchParams.get('annotations'), 'distance,duration,speed');

  assert.strictEqual(routes.length, 1);
  assert.strictEqual(routes[0].guidanceMode, 'turn_by_turn');
  assert.strictEqual(routes[0].guidance.guidanceMode, 'turn_by_turn');
  assert.strictEqual(routes[0].guidance.source, 'mapbox_directions');
  assert.strictEqual(routes[0].guidance.routeUuid, 'mapbox-route-uuid-123');
  assert.strictEqual(routes[0].guidance.distanceMeters, 270);
  assert.strictEqual(routes[0].guidance.durationSeconds, 120);
  assert.strictEqual(routes[0].guidance.steps.length, 2);
  assert.strictEqual(routes[0].guidance.steps[1].displayRoadName, 'Sierra College Boulevard');
  assert.strictEqual(routes[0].mapboxRouteUuid, 'mapbox-route-uuid-123');
  assert.strictEqual(routes[0].legs.length, 1);
  assert.strictEqual(routes[0].legs[0].stepCount, 2);
  assert.strictEqual(routes[0].steps.length, 2);
  assert.strictEqual(routes[0].steps[1].instruction, 'Turn right onto Sierra College Boulevard');
  assert.strictEqual(routes[0].steps[1].bannerInstructions.length, 1);
  assert.strictEqual(routes[0].steps[1].bannerInstructions[0].primaryText, 'Sierra College Boulevard');
  assert.strictEqual(routes[0].steps[1].voiceInstructions.length, 1);
  assert.strictEqual(routes[0].steps[1].voiceInstructions[0].announcement, 'Turn right onto Sierra College Boulevard');
}

async function testSummaryOnlyWhenNoSteps() {
  const { routes } = await withMockedFetch(
    { routes: [buildRoute({ legs: [{ summary: 'Geometry only', distance: 270, duration: 120, steps: [] }] })] },
    (getRequestedUrl) => fetchRoutes(null, getRequestedUrl),
  );

  assert.strictEqual(routes.length, 1);
  assert.strictEqual(routes[0].guidanceMode, 'summary_only');
  assert.strictEqual(routes[0].guidance.guidanceMode, 'summary_only');
  assert.strictEqual(routes[0].guidance.steps.length, 0);
  assert.strictEqual(routes[0].legs.length, 1);
  assert.strictEqual(routes[0].legs[0].stepCount, 0);
  assert.strictEqual(routes[0].steps.length, 1);
  assert.strictEqual(routes[0].steps[0].maneuverType, 'summary');
  assert.match(routes[0].steps[0].instruction, /Continue to Field Office/);
}

async function testDefensiveMissingStepFields() {
  const { routes } = await withMockedFetch(
    {
      routes: [
        buildRoute({
          legs: [
            {
              summary: '',
              distance: 270,
              duration: 120,
              steps: [
                {
                  distance: 88,
                  duration: 44,
                  bannerInstructions: [],
                  voiceInstructions: [],
                },
              ],
            },
          ],
        }),
      ],
    },
    (getRequestedUrl) => fetchRoutes(null, getRequestedUrl),
  );

  assert.strictEqual(routes.length, 1);
  assert.strictEqual(routes[0].guidanceMode, 'turn_by_turn');
  assert.strictEqual(routes[0].steps.length, 1);
  assert.strictEqual(routes[0].steps[0].instruction, 'Continue');
  assert.strictEqual(routes[0].steps[0].maneuverType, 'continue');
  assert.deepStrictEqual(routes[0].steps[0].geometry, []);
  assert.deepStrictEqual(routes[0].steps[0].bannerInstructions, []);
  assert.deepStrictEqual(routes[0].steps[0].voiceInstructions, []);
}

Promise.resolve()
  .then(testTurnByTurnRequestAndParser)
  .then(testSummaryOnlyWhenNoSteps)
  .then(testDefensiveMissingStepFields)
  .then(() => {
    console.log('Mapbox road navigation turn-by-turn request/parser regression passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
