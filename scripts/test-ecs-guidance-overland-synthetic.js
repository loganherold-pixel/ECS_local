const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
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

const {
  buildSyntheticEcsGuidanceRouteFromGeometry,
  getEcsGuidanceSourceLabel,
  normalizeMapboxDirectionsRouteToEcsGuidanceRoute,
} = loadTsModule(path.join('lib', 'navigation', 'ecsGuidanceModel.ts'));
const {
  buildActiveGuidanceDirectionList,
} = loadTsModule(path.join('lib', 'activeGuidanceDirections.ts'));
const {
  buildActiveGuidanceManeuverDisplay,
} = loadTsModule(path.join('lib', 'navigation', 'activeGuidanceManeuverDisplay.ts'));
const {
  buildRoadRouteFromCachedGeometry,
} = loadTsModule(path.join('lib', 'mapboxRoadNavigation.ts'));

assert.strictEqual(typeof buildSyntheticEcsGuidanceRouteFromGeometry, 'function');
assert.strictEqual(typeof getEcsGuidanceSourceLabel, 'function');

const mapboxRoute = normalizeMapboxDirectionsRouteToEcsGuidanceRoute(
  {
    uuid: 'mapbox-overland-1',
    distance: 420,
    duration: 80,
    geometry: {
      coordinates: [
        [-121.1, 38.7],
        [-121.099, 38.701],
      ],
    },
    legs: [
      {
        distance: 420,
        duration: 80,
        steps: [
          {
            distance: 200,
            duration: 35,
            name: 'Foresthill Road',
            maneuver: {
              type: 'depart',
              instruction: 'Head east on Foresthill Road',
              location: [-121.1, 38.7],
            },
          },
          {
            distance: 220,
            duration: 45,
            name: '',
            maneuver: {
              type: 'continue',
              location: [-121.099, 38.701],
            },
          },
        ],
      },
    ],
  },
  {
    id: 'mapbox-overland',
    destinationName: 'Trailhead',
    createdAt: '2026-06-22T12:00:00.000Z',
  },
);
assert.strictEqual(getEcsGuidanceSourceLabel(mapboxRoute), 'Mapbox turn-by-turn');
assert.strictEqual(mapboxRoute.guidanceSourceLabel, 'Mapbox turn-by-turn');
assert.strictEqual(mapboxRoute.steps[0].roadName, 'Foresthill Road');
assert.strictEqual(mapboxRoute.steps[0].displayRoadName, 'Foresthill Road');
assert.strictEqual(mapboxRoute.steps[1].displayRoadName, 'Unnamed road');
assert.strictEqual(mapboxRoute.steps[1].instruction, 'Continue on Unnamed road');

const importedTrace = buildSyntheticEcsGuidanceRouteFromGeometry({
  id: 'imported-gpx-no-names',
  source: 'imported_trace',
  geometry: [
    { lat: 38.7, lng: -121.1 },
    { lat: 38.704, lng: -121.1 },
    { lat: 38.704, lng: -121.095 },
  ],
  distanceMeters: 880,
  durationSeconds: 240,
  createdAt: '2026-06-22T12:05:00.000Z',
});
assert.strictEqual(importedTrace.guidanceMode, 'turn_by_turn');
assert.strictEqual(getEcsGuidanceSourceLabel(importedTrace), 'Imported route guidance');
assert(importedTrace.steps.length >= 3, 'Imported geometry should produce usable synthetic steps plus arrival.');
assert(importedTrace.steps.every((step) => step.displayRoadName && !/^(null|undefined)$/i.test(step.displayRoadName)));
assert(importedTrace.steps.some((step) => step.instruction === 'Continue on Unnamed road'));
assert(importedTrace.steps.some((step) => /^Turn right on Unnamed road$/.test(step.instruction)));

const verifiedRoute = buildSyntheticEcsGuidanceRouteFromGeometry({
  id: 'ecs-verified-named-segments',
  source: 'ecs_verified_route',
  routeKind: 'road',
  geometry: [
    { lat: 38.7, lng: -121.1 },
    { lat: 38.704, lng: -121.1 },
    { lat: 38.704, lng: -121.096 },
    { lat: 38.706, lng: -121.096 },
  ],
  segmentNames: ['M1 Ridge Road', 'Soda Creek Connector', 'Soda Creek Connector'],
  createdAt: '2026-06-22T12:10:00.000Z',
});
assert.strictEqual(getEcsGuidanceSourceLabel(verifiedRoute), 'ECS verified route guidance');
assert.strictEqual(verifiedRoute.steps[0].displayRoadName, 'M1 Ridge Road');
assert(
  verifiedRoute.steps.some((step) => step.displayRoadName === 'Soda Creek Connector'),
  'Known ECS segment names should be used when available.',
);
assert(
  verifiedRoute.steps.every((step) => !/fake|made up|trail name/i.test(step.displayRoadName)),
  'Synthetic guidance must not invent route names.',
);

const trailSynthetic = buildSyntheticEcsGuidanceRouteFromGeometry({
  id: 'trail-synthetic',
  source: 'ecs_verified_route',
  routeKind: 'trail',
  geometry: [
    { lat: 38.7, lng: -121.1 },
    { lat: 38.7015, lng: -121.1 },
    { lat: 38.7017, lng: -121.0998 },
  ],
  createdAt: '2026-06-22T12:15:00.000Z',
});
assert.strictEqual(trailSynthetic.steps[0].displayRoadName, 'Unnamed trail');
assert.strictEqual(trailSynthetic.steps[0].instruction, 'Follow the trail');
assert(
  !trailSynthetic.steps.some((step) => step.displayRoadName === 'Unnamed trail') ||
    trailSynthetic.source === 'ecs_verified_route',
  'Unnamed trail should only appear when route metadata marks the route as trail/path/off-road.',
);

const trailheadOnly = buildSyntheticEcsGuidanceRouteFromGeometry({
  id: 'trailhead-only',
  source: 'summary_only',
  routeKind: 'trail',
  geometry: [
    { lat: 38.7, lng: -121.1 },
    { lat: 38.706, lng: -121.098 },
  ],
  limitedTrailGuidance: true,
  createdAt: '2026-06-22T12:20:00.000Z',
});
assert.strictEqual(trailheadOnly.guidanceMode, 'summary_only');
assert.strictEqual(trailheadOnly.steps.length, 0);
assert.strictEqual(trailheadOnly.guidanceSourceLabel, 'Summary only');
assert.strictEqual(
  trailheadOnly.guidanceLimitationLabel,
  'Verified trail geometry available, turn-by-turn detail limited',
);

const trailheadList = buildActiveGuidanceDirectionList({
  route: trailheadOnly,
  progress: null,
  status: 'navigation_active',
});
assert.strictEqual(
  trailheadList.emptyMessage,
  'Verified trail geometry available, turn-by-turn detail limited',
);

const trailheadDisplay = buildActiveGuidanceManeuverDisplay({
  guidanceMode: 'summary_only',
  route: trailheadOnly,
  progress: null,
});
assert.strictEqual(trailheadDisplay.detailText, 'Verified trail geometry available, turn-by-turn detail limited');

const cachedImportedRoute = buildRoadRouteFromCachedGeometry({
  id: 'cached-imported-gpx',
  origin: { lat: 38.7, lng: -121.1 },
  destination: {
    id: 'gpx-end',
    title: 'Imported GPX Endpoint',
    subtitle: null,
    coordinate: { lat: 38.704, lng: -121.095 },
    sourceType: 'offline_sync_open',
  },
  geometry: [
    { lat: 38.7, lng: -121.1 },
    { lat: 38.704, lng: -121.1 },
    { lat: 38.704, lng: -121.095 },
  ],
  source: 'imported_trace',
  createdAt: '2026-06-22T12:25:00.000Z',
});
assert.strictEqual(cachedImportedRoute.guidance.guidanceMode, 'turn_by_turn');
assert.strictEqual(cachedImportedRoute.guidance.source, 'imported_trace');
assert.strictEqual(cachedImportedRoute.guidance.guidanceSourceLabel, 'Imported route guidance');
assert(
  cachedImportedRoute.guidance.steps.some((step) => step.instruction.includes('Unnamed road')),
  'Cached imported geometry should generate honest unnamed-road guidance.',
);
assert.strictEqual(cachedImportedRoute.guidance.steps.at(-1).instruction, 'You have arrived at your destination');

console.log('ECS overland synthetic guidance regression passed.');
