const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const moduleCache = new Map();

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
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(filename, module);

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
              minLat: Number.POSITIVE_INFINITY,
              maxLat: Number.NEGATIVE_INFINITY,
              minLng: Number.POSITIVE_INFINITY,
              maxLng: Number.NEGATIVE_INFINITY,
            },
          );
        },
      };
    }
    if (request.startsWith('.')) {
      const target = path.relative(root, path.join(path.dirname(filename), `${request}.ts`));
      return loadTsModule(target);
    }
    return require(request);
  }

  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(module.exports, localRequire, module, filename, path.dirname(filename));
  return module.exports;
}

const { buildRoadRouteFromCachedGeometry } = loadTsModule(path.join('lib', 'mapboxRoadNavigation.ts'));
const {
  ACTIVE_GUIDANCE_REFRESHED_STEPS_UNAVAILABLE_MESSAGE,
  buildActiveGuidanceStateFromRoadRoute,
  buildVersionedActiveGuidanceDirectionList,
} = loadTsModule(path.join('lib', 'navigation', 'activeGuidanceState.ts'));

const origin = { lat: 38.55, lng: -109.62 };
const destinationCoordinate = { lat: 38.68, lng: -109.48 };
const geometry = [origin, destinationCoordinate];

const cachedRoute = buildRoadRouteFromCachedGeometry({
  id: 'offline-sync-cached-route',
  origin,
  destination: {
    id: 'cached-route',
    title: 'Cached Route',
    subtitle: null,
    coordinate: destinationCoordinate,
    sourceType: 'offline_sync_open',
  },
  geometry,
  createdAt: '2026-06-03T12:00:00.000Z',
});

assert.strictEqual(
  cachedRoute.steps[0].instruction,
  'Follow highlighted route',
  'Cached/offline route source labels should not be promoted into active guidance maneuver copy.',
);
assert(
  !/cached route/i.test(cachedRoute.steps[0].instruction),
  'Active guidance should never read "cached route" as a destination.',
);
assert.strictEqual(
  cachedRoute.guidance.guidanceMode,
  'turn_by_turn',
  'Downloaded/cached route geometry should promote into active synthetic guidance when it has usable coordinates.',
);
assert.strictEqual(
  cachedRoute.guidance.guidanceSourceLabel,
  'ECS geometry guidance',
  'Cached geometry guidance should disclose that ECS synthesized directions from saved geometry.',
);
assert.ok(
  cachedRoute.guidance.steps.length >= 2,
  'Cached geometry guidance should include at least a proceed step and an arrival step.',
);

const cachedActiveGuidance = buildActiveGuidanceStateFromRoadRoute({
  route: cachedRoute,
  refreshReason: 'initial',
  refreshedAt: '2026-06-03T12:01:00.000Z',
});
const cachedActiveDirections = buildVersionedActiveGuidanceDirectionList({
  activeGuidance: cachedActiveGuidance,
  progress: null,
  status: 'navigation_active',
});
assert.strictEqual(
  cachedActiveDirections.state,
  'ready',
  'Active cached geometry guidance should render a ready direction list without waiting for live progress.',
);
assert.ok(
  cachedActiveDirections.items.length >= 2,
  'Active cached geometry guidance should expose route steps in the directions list.',
);
assert.notStrictEqual(
  cachedActiveDirections.emptyMessage,
  ACTIVE_GUIDANCE_REFRESHED_STEPS_UNAVAILABLE_MESSAGE,
  'Active cached geometry guidance must not show the false refreshed-steps-unavailable message.',
);

const namedRoute = buildRoadRouteFromCachedGeometry({
  id: 'offline-sync-named-route',
  origin,
  destination: {
    id: 'm1-ridge-road',
    title: 'M1 Ridge Road',
    subtitle: null,
    coordinate: destinationCoordinate,
    sourceType: 'offline_sync_open',
  },
  geometry,
  createdAt: '2026-06-03T12:00:00.000Z',
});

assert.strictEqual(
  namedRoute.steps[0].instruction,
  'Follow highlighted route toward M1 Ridge Road',
  'Named route destinations should still be visible in active guidance copy.',
);

const mapboxRoadNavigation = read('lib/mapboxRoadNavigation.ts');
const activeRouteProgress = read('lib/activeRouteProgress.ts');
const vehicleDisplayStore = read('lib/vehicleDisplayStore.ts');
const vehicleDisplayNavigationSelector = read('lib/automotive/vehicleDisplayNavigationSelector.ts');

assert(
  mapboxRoadNavigation.includes('buildHighlightedRouteInstruction(params.destination.title)'),
  'Cached geometry route building should route copy through the highlighted-route guidance helper.',
);
assert(
  !mapboxRoadNavigation.includes('Follow cached route toward'),
  'Cached/offline source wording must stay out of road-navigation instructions.',
);
assert(
  activeRouteProgress.includes('buildProceedRouteInstruction(destinationLabel)'),
  'Imported active route progress should sanitize waypoint labels before building Proceed copy.',
);
assert(
  !activeRouteProgress.includes('`Proceed to ${destinationLabel}`'),
  'Imported active route progress should not blindly read generic route labels as destinations.',
);
assert(
  vehicleDisplayStore.includes('selectVehicleDisplayNavigationData') &&
    vehicleDisplayNavigationSelector.includes('buildContinueRouteInstruction(roadDestination)') &&
    vehicleDisplayNavigationSelector.includes('buildReadyRouteInstruction(roadDestination)') &&
    vehicleDisplayNavigationSelector.includes('session.instruction'),
  'Vehicle display navigation should consume canonical Navigate instructions and sanitize legacy destination labels.',
);

const sparseCachedRoute = buildRoadRouteFromCachedGeometry({
  id: 'offline-sync-sparse-route',
  origin,
  destination: {
    id: 'sparse-route',
    title: 'Sparse Route',
    subtitle: null,
    coordinate: destinationCoordinate,
    sourceType: 'offline_sync_open',
  },
  geometry: [origin],
  createdAt: '2026-06-03T12:00:00.000Z',
});
assert.strictEqual(
  sparseCachedRoute.geometry.length,
  1,
  'Sparse cached geometry must not fabricate a raw-origin-to-destination line.',
);
assert.deepStrictEqual(
  {
    lat: sparseCachedRoute.geometry[0].lat,
    lng: sparseCachedRoute.geometry[0].lng,
  },
  origin,
  'Sparse cached geometry must preserve the stored canonical coordinate.',
);
assert.strictEqual(sparseCachedRoute.guidance.guidanceMode, 'unavailable');
assert.deepStrictEqual(sparseCachedRoute.steps, []);
assert(
  !vehicleDisplayNavigationSelector.includes('`Continue to ${roadDestination}`') &&
    !vehicleDisplayNavigationSelector.includes('`Proceed to ${nextWaypoint.name}`') &&
    !vehicleDisplayNavigationSelector.includes('`Ready to ${roadDestination}`'),
  'Vehicle display navigation copy should not blindly read generic cache labels as destinations.',
);

console.log('route guidance copy regression passed');
