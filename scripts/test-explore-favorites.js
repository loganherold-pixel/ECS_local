const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const storage = new Map();

global.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  if (request === 'expo-secure-store') {
    return {
      async getItemAsync(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      async setItemAsync(key, value) {
        storage.set(key, String(value));
      },
      async deleteItemAsync(key) {
        storage.delete(key);
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
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const favoritesStore = require(path.join(__dirname, '..', 'lib', 'exploreFavoritesStore.ts'));
const navigationStore = require(path.join(__dirname, '..', 'lib', 'navigationHandoffStore.ts'));
const discoverScreenSource = fs.readFileSync(
  path.join(__dirname, '..', 'app', '(tabs)', 'discover.tsx'),
  'utf8',
);

function makeRoute(id, name, overrides = {}) {
  return {
    id,
    name,
    region: 'Eastern Sierra',
    regionGroup: 'sierra',
    terrainType: 'trail',
    distanceMiles: 18.5,
    estimatedDays: 1,
    remotenessScore: 6,
    description: `${name} route`,
    highlights: ['ridge'],
    localHighlights: ['camp'],
    startLat: 37.123,
    startLng: -118.456,
    imageTag: 'ridge',
    ...overrides,
  };
}

async function main() {
  await favoritesStore.clearExploreFavoritesStore();
  await favoritesStore.hydrateExploreFavoritesStore(true);

  const routeA = makeRoute('alabama-hills', 'Alabama Hills');
  const routeB = makeRoute('cerro-gordo', 'Cerro Gordo', {
    distanceMiles: 22.4,
    startLat: 36.543,
    startLng: -117.808,
  });

  const added = favoritesStore.toggleFavoriteTrail(routeA);
  assert.strictEqual(added, true, 'First toggle should add the favorite.');
  assert.strictEqual(
    favoritesStore.getExploreFavoritesSnapshot().favorites.length,
    1,
    'Adding one favorite should create one record.',
  );

  favoritesStore.addFavoriteTrail(routeA);
  assert.strictEqual(
    favoritesStore.getExploreFavoritesSnapshot().favorites.length,
    1,
    'Duplicate add should not create duplicate favorite records.',
  );

  const favoriteA = favoritesStore.getExploreFavoritesSnapshot().favorites[0];
  await navigationStore.saveNavigationHandoffPayload(favoriteA.navigationPayload);
  const handoff = await navigationStore.loadNavigationHandoffPayload();
  assert.strictEqual(handoff?.title, 'Alabama Hills', 'Favorites must preserve Navigate handoff payloads.');

  favoritesStore.addFavoriteTrail(routeB);
  const snapshotWithTwo = favoritesStore.getExploreFavoritesSnapshot();
  assert.strictEqual(snapshotWithTwo.favorites.length, 2, 'Second unique favorite should persist.');

  const favoriteB = snapshotWithTwo.favorites.find((entry) => entry.sourceTrailId === 'cerro-gordo');
  assert.ok(favoriteB, 'Second favorite should be queryable by source trail id.');

  const plan = favoritesStore.upsertFavoriteTrailPlan({
    favoriteIds: [favoriteB.favoriteId, favoriteA.favoriteId],
  });
  assert.ok(plan, 'Selecting multiple favorites should create a stacked plan.');
  assert.deepStrictEqual(
    plan.orderedTrailIds,
    ['cerro-gordo', 'alabama-hills'],
    'Plan ordering must match the selected order.',
  );

  const updatedPlan = favoritesStore.upsertFavoriteTrailPlan({
    planId: plan.planId,
    favoriteIds: [favoriteA.favoriteId, favoriteB.favoriteId],
  });
  assert.ok(updatedPlan, 'Existing plans should be editable.');
  assert.deepStrictEqual(
    updatedPlan.orderedTrailIds,
    ['alabama-hills', 'cerro-gordo'],
    'Editing a plan should persist the new ordering.',
  );

  await favoritesStore.hydrateExploreFavoritesStore(true);
  const persistedSnapshot = favoritesStore.getExploreFavoritesSnapshot();
  assert.strictEqual(persistedSnapshot.favorites.length, 2, 'Favorites should survive hydration reload.');
  assert.strictEqual(persistedSnapshot.plans.length, 1, 'Plans should survive hydration reload.');
  assert.deepStrictEqual(
    persistedSnapshot.plans[0].orderedTrailIds,
    ['alabama-hills', 'cerro-gordo'],
    'Persisted plan ordering must remain stable.',
  );

  assert.ok(
    discoverScreenSource.includes('TRAILS') && discoverScreenSource.includes('PLANS'),
    'Favorites UI should expose Trails and Plans segments.',
  );
  assert.ok(
    discoverScreenSource.includes('CREATE STACK'),
    'Favorites UI should expose a dedicated stacked-plan create action.',
  );
  assert.ok(
    discoverScreenSource.includes('reorder-three-outline'),
    'Ordering UI should surface a clear reorder handle.',
  );
  assert.ok(
    discoverScreenSource.includes('current.filter((favoriteId) => favoriteTrailMap.has(favoriteId))'),
    'Favorites planning state should discard stale selections when saved trails change.',
  );

  favoritesStore.removeFavoriteTrailBySourceId('alabama-hills');
  const afterRemove = favoritesStore.getExploreFavoritesSnapshot();
  assert.strictEqual(afterRemove.favorites.length, 1, 'Removing a favorite should update the shared list.');
  assert.strictEqual(afterRemove.plans.length, 1, 'Removing a favorite should not destroy saved stacked plans.');
  assert.deepStrictEqual(
    afterRemove.plans[0].orderedTrailIds,
    ['alabama-hills', 'cerro-gordo'],
    'Saved plan snapshots should remain intact after unfavoriting one trail.',
  );

  await favoritesStore.clearExploreFavoritesStore();
  console.log('Explore favorites checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
