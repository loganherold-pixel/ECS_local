const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');

global.__DEV__ = false;
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'test-anon-key';

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  if (request === 'expo-file-system' || request === 'expo-file-system/legacy') {
    return {};
  }
  if (request === 'expo-secure-store') {
    return {
      getItemAsync: async () => null,
      setItemAsync: async () => undefined,
      deleteItemAsync: async () => undefined,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
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

function loadTsModule(relPath) {
  const filename = path.join(root, relPath);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  require.extensions['.ts'](mod, filename);
  return mod.exports;
}

const {
  MIN_DISCOVERY_ROUTE_MILES,
  filterByRadius,
  filterDiscoverableRoutes,
  isDiscoverableRoute,
} = loadTsModule(path.join('lib', 'discoverEngine.ts'));
const { getPopularTrailRecommendations } = loadTsModule(path.join('lib', 'discoverCategoryEngine.ts'));

function route(id, overrides = {}) {
  return {
    id,
    name: id,
    region: 'Regression Range',
    regionGroup: 'great-basin',
    distanceMiles: 12,
    terrainType: 'forest road',
    remotenessScore: 6,
    estimatedFuelRequired: 2,
    suggestedCamps: 1,
    description: 'Drivable Explore route regression fixture.',
    highlights: ['Drivable trail'],
    elevationGainFt: 900,
    estimatedDays: 1,
    bestSeason: 'spring-fall',
    permitRequired: false,
    imageTag: 'regression',
    startLat: 39.1,
    startLng: -111.1,
    distanceFromUserMiles: 20,
    popularityScore: 80,
    ...overrides,
  };
}

const shortTrail = route('short-trail', { distanceMiles: 4.9 });
const exactMinimumTrail = route('exact-minimum-trail', { distanceMiles: 5 });
const longerTrail = route('longer-trail', { distanceMiles: 12 });
const missingDistanceTrail = route('missing-distance-trail', { distanceMiles: undefined });
const missingTrailhead = route('missing-trailhead', { startLat: Number.NaN });

assert.strictEqual(MIN_DISCOVERY_ROUTE_MILES, 5, 'Explorer minimum route length should be 5 miles.');
assert.strictEqual(isDiscoverableRoute(shortTrail), false, 'Trails under 5 miles should not be discoverable.');
assert.strictEqual(isDiscoverableRoute(exactMinimumTrail), true, 'A 5.0 mile trail should remain eligible.');
assert.strictEqual(isDiscoverableRoute(longerTrail), true, 'Trails longer than 5 miles should remain eligible.');
assert.strictEqual(isDiscoverableRoute(missingDistanceTrail), false, 'Missing trail distance should not enter Explore recommendations.');
assert.strictEqual(isDiscoverableRoute(missingTrailhead), false, 'Missing trailhead coordinates should remain excluded.');

assert.deepStrictEqual(
  filterDiscoverableRoutes([shortTrail, exactMinimumTrail, longerTrail, missingDistanceTrail]).map((item) => item.id),
  ['exact-minimum-trail', 'longer-trail'],
  'Drivable Trails should exclude short and incomplete-distance routes from counts.',
);

assert.deepStrictEqual(
  filterByRadius([shortTrail, exactMinimumTrail, longerTrail], 100).map((item) => item.id),
  ['exact-minimum-trail', 'longer-trail'],
  'Radius filtering should preserve the 5-mile minimum filter.',
);

assert.deepStrictEqual(
  getPopularTrailRecommendations([shortTrail, exactMinimumTrail, longerTrail], new Map(), {
    radiusMiles: 100,
    pageSize: 10,
  }).map((item) => item.id),
  ['exact-minimum-trail', 'longer-trail'],
  'Popular Trails should use the same discoverable-route minimum.',
);

const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
assert.ok(
  discoverSource.includes('() => filterByRadius(aiRoutes, activeDistanceRadius) as AIGeneratedRoute[]'),
  'ECS Route Ideas should pass through the shared radius/minimum-length filter.',
);
assert.ok(
  discoverSource.includes('MIN_DISCOVERY_ROUTE_MILES') &&
    discoverSource.includes('ECS filters out trails under ${MIN_DISCOVERY_ROUTE_MILES} miles'),
  'Explorer footer notice should stay tied to the actual minimum-length constant.',
);

console.log('Explore minimum trail length checks passed.');
