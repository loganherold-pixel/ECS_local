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
  MIN_GUIDANCE_READY_ROUTE_MILES,
  filterByRadius,
  filterDiscoverableRoutes,
  isDiscoverableRoute,
} = loadTsModule(path.join('lib', 'discoverEngine.ts'));
const {
  getHiddenGemRecommendations,
  getPopularTrailRecommendations,
} = loadTsModule(path.join('lib', 'discoverCategoryEngine.ts'));

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
const zeroLengthTrail = route('zero-length-trail', { distanceMiles: 0 });
const missingDistanceTrail = route('missing-distance-trail', { distanceMiles: undefined });
const missingTrailhead = route('missing-trailhead', { startLat: Number.NaN });

assert.strictEqual(MIN_GUIDANCE_READY_ROUTE_MILES, 5, 'Explorer guidance-readiness threshold should remain 5 miles.');
assert.strictEqual(
  MIN_DISCOVERY_ROUTE_MILES,
  MIN_GUIDANCE_READY_ROUTE_MILES,
  'The legacy exported threshold should remain compatible without acting as a discovery gate.',
);
assert.strictEqual(
  isDiscoverableRoute(shortTrail),
  true,
  'A positive route under 5 miles should remain discoverable even when it is not guidance-ready.',
);
assert.strictEqual(isDiscoverableRoute(exactMinimumTrail), true, 'A 5.0 mile trail should remain eligible.');
assert.strictEqual(isDiscoverableRoute(longerTrail), true, 'Trails longer than 5 miles should remain eligible.');
assert.strictEqual(isDiscoverableRoute(zeroLengthTrail), false, 'A zero-length record should remain excluded.');
assert.strictEqual(isDiscoverableRoute(missingDistanceTrail), false, 'Missing trail distance should not enter Explore recommendations.');
assert.strictEqual(isDiscoverableRoute(missingTrailhead), false, 'Missing trailhead coordinates should remain excluded.');

assert.deepStrictEqual(
  filterDiscoverableRoutes([
    shortTrail,
    exactMinimumTrail,
    longerTrail,
    zeroLengthTrail,
    missingDistanceTrail,
  ]).map((item) => item.id),
  ['short-trail', 'exact-minimum-trail', 'longer-trail'],
  'Drivable Trails should retain positive short routes while excluding invalid or missing lengths.',
);

assert.deepStrictEqual(
  filterByRadius([shortTrail, exactMinimumTrail, longerTrail], 100).map((item) => item.id),
  ['short-trail', 'exact-minimum-trail', 'longer-trail'],
  'Radius filtering should not reinterpret the 5-mile guidance threshold as a discovery gate.',
);

assert.deepStrictEqual(
  getPopularTrailRecommendations([shortTrail, exactMinimumTrail, longerTrail], new Map(), {
    radiusMiles: 100,
    pageSize: 10,
  }).map((item) => item.id),
  ['exact-minimum-trail', 'longer-trail', 'short-trail'],
  'The background popularity classifier should retain positive short discoverable routes.',
);

const shortHiddenGem = route('short-hidden-gem', {
  distanceMiles: 2,
  popularityScore: 8,
  remotenessScore: 9,
  elevationGainFt: 5200,
  terrainType: 'remote 4x4 two-track',
  highlights: ['remote shelf', 'scenic ridge', 'technical wash'],
});
const shortHiddenGemPage = getHiddenGemRecommendations(
  [shortHiddenGem],
  new Map(),
  { radiusMiles: 100, pageSize: 10 },
);
assert.strictEqual(shortHiddenGemPage.evaluatedCandidates.length, 1);
assert(
  !shortHiddenGemPage.evaluatedCandidates[0].disqualificationReasons.includes('too_short'),
  'Hidden Gem discovery must not reinterpret the guidance minimum as a terminal route exclusion.',
);

const popularCandidates = Array.from({ length: 51 }, (_, index) => route(`popular-${String(index).padStart(2, '0')}`, {
  popularityScore: index === 50 ? 100 : 60,
  distanceFromUserMiles: 20 + index,
  elevationGainFt: index === 50 ? 7000 : 900,
  highlights: index === 50 ? ['Iconic destination', 'Legendary 4x4 trail'] : ['Drivable trail'],
}));
const cappedPopularTrails = getPopularTrailRecommendations(popularCandidates, new Map(), {
  radiusMiles: 100,
});
const cappedPopularTrailsFromReversedInput = getPopularTrailRecommendations(
  [...popularCandidates, { ...popularCandidates[0] }].reverse(),
  new Map(),
  { radiusMiles: 100 },
);
assert.strictEqual(
  cappedPopularTrails.length,
  20,
  'The local Popular Trails recommendation source must apply the total-search cap after ranking.',
);
assert.strictEqual(
  new Set(cappedPopularTrails.map((item) => item.id)).size,
  20,
  'Duplicate route identities must never consume more than one Popular Trails result position.',
);
assert.strictEqual(cappedPopularTrailsFromReversedInput.length, 20);
assert.strictEqual(new Set(cappedPopularTrailsFromReversedInput.map((item) => item.id)).size, 20);
assert.deepStrictEqual(
  cappedPopularTrailsFromReversedInput.map((item) => item.id),
  cappedPopularTrails.map((item) => item.id),
  'Popular Trails top-20 selection should be deterministic across provider order and duplicate input records.',
);
assert.ok(
  cappedPopularTrails.some((item) => item.id === 'popular-50'),
  'A high-quality candidate at the end of provider order must survive ranking before the top-20 slice.',
);

const hiddenGemCandidates = Array.from({ length: 25 }, (_, index) => route(`hidden-gem-${String(index).padStart(2, '0')}`, {
  popularityScore: 5,
  remotenessScore: 9,
  elevationGainFt: 5200 - index,
  terrainType: 'remote 4x4 two-track',
  highlights: ['remote shelf', 'scenic ridge', 'technical wash'],
}));
const defaultHiddenGemPage = getHiddenGemRecommendations(hiddenGemCandidates, new Map(), {
  radiusMiles: 100,
});
assert.strictEqual(defaultHiddenGemPage.pageSize, 20, 'Missing Hidden Gem page sizes should use the shared safe default.');
assert.strictEqual(defaultHiddenGemPage.eligibleCount, 20, 'Hidden Gem paging windows must be bounded by the total-search cap.');
assert.strictEqual(defaultHiddenGemPage.items.length, 20, 'The default Hidden Gem result window must not exceed 20 routes.');

for (const invalidPageSize of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 51]) {
  const normalizedPage = getHiddenGemRecommendations(hiddenGemCandidates, new Map(), {
    radiusMiles: 100,
    pageSize: invalidPageSize,
  });
  assert.strictEqual(
    normalizedPage.pageSize,
    20,
    `Hidden Gem page size ${String(invalidPageSize)} should resolve to the shared maximum/default.`,
  );
  assert.ok(normalizedPage.items.length <= 20, 'Normalized Hidden Gem windows must never exceed 20 routes.');
}

const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const readyInventorySource = fs.readFileSync(
  path.join(root, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts'),
  'utf8',
);
assert.ok(
  discoverSource.includes('() => filterByRadius(aiRoutes, activeDistanceRadius) as AIGeneratedRoute[]'),
  'ECS Route Ideas should pass through the shared radius/minimum-length filter.',
);
assert.ok(
  discoverSource.includes('const mapInventory = buildExploreGuidanceReadyInventory') &&
    readyInventorySource.includes('MIN_GUIDANCE_READY_ROUTE_MILES') &&
    readyInventorySource.includes('distanceMiles < MIN_GUIDANCE_READY_ROUTE_MILES') &&
    !discoverSource.includes('ECS filters out trails under ${MIN_DISCOVERY_ROUTE_MILES} miles'),
  'Explorer should retain the 5-mile guidance-readiness check without presenting it as a discovery filter.',
);

console.log('Explore minimum trail length checks passed.');
