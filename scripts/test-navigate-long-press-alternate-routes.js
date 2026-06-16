const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './mapConfig' || request.endsWith('/mapConfig') || request.endsWith('\\mapConfig')) {
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
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const mapboxRoadNavigation = require(path.join(root, 'lib', 'mapboxRoadNavigation.ts'));

const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8').replace(/\r\n/g, '\n');
const roadHookSource = fs.readFileSync(path.join(root, 'lib', 'useRoadNavigation.ts'), 'utf8').replace(/\r\n/g, '\n');
const roadOverlaySource = fs.readFileSync(path.join(root, 'components', 'navigate', 'RoadNavigationOverlay.tsx'), 'utf8').replace(/\r\n/g, '\n');

function assertIncludes(source, tokens, message) {
  const missing = tokens.filter((token) => !source.includes(token));
  assert.strictEqual(missing.length, 0, `${message} Missing: ${missing.join(', ')}`);
}

function makeRoute(distance, duration, lngOffset) {
  return {
    distance,
    duration,
    geometry: {
      coordinates: [
        [-121.2, 38.7],
        [-121.2 + lngOffset, 38.72],
        [-121.23, 38.74],
      ],
    },
    legs: [
      {
        steps: [
          {
            distance,
            duration,
            name: 'Test road',
            maneuver: {
              type: 'depart',
              instruction: 'Head toward selected point',
              location: [-121.2, 38.7],
            },
            geometry: {
              coordinates: [
                [-121.2, 38.7],
                [-121.2 + lngOffset, 38.72],
              ],
            },
          },
        ],
      },
    ],
  };
}

async function runMapboxAlternativeAssertions() {
  const originalFetch = global.fetch;
  let requestedUrl = null;
  global.fetch = async (input) => {
    requestedUrl = String(input);
    return {
      ok: true,
      json: async () => ({
        routes: [
          makeRoute(9000, 740, 0.01),
          makeRoute(7800, 420, 0.02),
          makeRoute(8100, 510, 0.03),
          makeRoute(7600, 650, 0.04),
        ],
      }),
    };
  };

  try {
    assert.strictEqual(typeof mapboxRoadNavigation.fetchRoadRouteAlternatives, 'function', 'mapboxRoadNavigation should export fetchRoadRouteAlternatives.');
    const routes = await mapboxRoadNavigation.fetchRoadRouteAlternatives({
      accessToken: 'test-token',
      origin: { lat: 38.7, lng: -121.2 },
      destination: {
        id: 'long-press-test',
        title: 'Selected map point',
        subtitle: 'Long-pressed map point',
        coordinate: { lat: 38.74, lng: -121.23 },
        sourceType: 'manual_selection',
      },
    });

    const url = new URL(requestedUrl);
    assert.ok(url.pathname.includes('/directions/v5/mapbox/driving-traffic/'), 'Mapbox directions should use the traffic-aware driving profile for road guidance alternatives.');
    assert.strictEqual(url.searchParams.get('alternatives'), 'true', 'Mapbox directions should request alternative routes.');
    assert.strictEqual(routes.length, 3, 'Navigate Here should retain at most three route choices.');
    assert.deepStrictEqual(
      routes.map((route) => route.durationS),
      [420, 510, 650],
      'Route choices should be sorted by shortest travel time.',
    );
  } finally {
    global.fetch = originalFetch;
  }
}

assertIncludes(
  roadHookSource,
  [
    'routeAlternatives: RoadNavRoute[];',
    'selectRouteAlternative: (routeId: string) => void;',
    'fetchRoadRouteAlternatives({',
    'routeAlternatives: nextRouteAlternatives',
    'const selectRouteAlternative = useCallback',
  ],
  'Road navigation state should expose up to three route choices and allow staged preview switching.',
);

assertIncludes(
  roadOverlaySource,
  [
    'alternateRoutes?: {',
    'Select alternate route',
    'styles.alternateRouteOption',
    'onSelectRouteAlternative?.(option.id)',
  ],
  'Road preview should render compact alternate-route choices.',
);

assertIncludes(
  navigateSource,
  [
    'alternateRoutes: roadNavigation.session.routeAlternatives',
    'onSelectRouteAlternative={roadNavigation.selectRouteAlternative}',
    "void previewRoadDestination(destination, 'manual_selection');",
  ],
  'Long-press Navigate Here should stage a route preview with selectable alternatives instead of immediately starting guidance.',
);

runMapboxAlternativeAssertions()
  .then(() => {
    console.log('Navigate long-press alternate route checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
