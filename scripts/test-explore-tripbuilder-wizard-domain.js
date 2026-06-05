const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
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

const wizard = require(path.join(root, 'lib', 'explore', 'exploreTripBuilderWizard.ts'));
const planningSave = require(path.join(root, 'lib', 'explore', 'exploreRoutePlanningSave.ts'));
const favoritesStore = require(path.join(root, 'lib', 'exploreFavoritesStore.ts'));
const { routeStore } = require(path.join(root, 'lib', 'routeStore.ts'));
const { runStore } = require(path.join(root, 'lib', 'runStore.ts'));
const { getSavedRouteAssets } = require(path.join(root, 'lib', 'savedRouteAssets.ts'));

function makeRoute(id, name, overrides = {}) {
  return {
    id,
    name,
    region: 'Test Range',
    regionGroup: 'great-basin',
    distanceMiles: 42,
    terrainType: 'desert two-track',
    remotenessScore: 8,
    estimatedFuelRequired: 3,
    suggestedCamps: 1,
    description: `${name} test route`,
    highlights: ['wash crossing', 'ridge shelf'],
    elevationGainFt: 1000,
    estimatedDays: 2,
    bestSeason: 'Fall',
    permitRequired: false,
    imageTag: 'desert-canyon',
    startLat: 38,
    startLng: -110,
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-110, 38],
        [-109.92, 38.08],
        [-109.82, 38.18],
      ],
    },
    routeMetadata: {
      source: 'test_source',
      confidenceReasons: ['continuous geometry', 'verified source timestamp'],
      warnings: ['Verify current conditions before departure.'],
      dataUsed: [{ label: 'Test source', freshness: 'fresh' }],
    },
    ...overrides,
  };
}

async function main() {
  storage.clear();
  await favoritesStore.clearExploreFavoritesStore();
  await favoritesStore.hydrateExploreFavoritesStore(true);

  const readyTrailPack = makeRoute('trail-pack:ready-pack', 'Ready Trail Pack');
  const readyHiddenGem = makeRoute('hidden-ready', 'Hidden Ready');
  const ecsReady = makeRoute('ecs-ready', 'ECS Ready');
  const savedReady = makeRoute('favorite-ready', 'Saved Ready');
  const importedReady = makeRoute('imported-ready', 'Imported Ready');
  const unavailable = makeRoute('no-geometry', 'No Geometry', {
    routeGeometry: undefined,
    trailGeometry: [],
    startLat: undefined,
    startLng: undefined,
    routeMetadata: {
      source: 'test_source',
      activeGuidanceUnavailableReason: 'Active guidance requires route geometry.',
    },
  });
  const previewOnly = makeRoute('preview-only', 'Preview Only', {
    routeGeometry: {
      type: 'MultiLineString',
      coordinates: [
        [
          [-110, 38],
          [-109.98, 38.02],
        ],
        [
          [-109.9, 38.1],
          [-109.86, 38.14],
        ],
      ],
    },
  });

  const normalized = wizard.normalizeExploreWizardRouteCandidates({
    trailPacks: [readyTrailPack, unavailable],
    hiddenGemRoutes: [readyHiddenGem, previewOnly],
    ecsRouteIdeas: [ecsReady],
    favoriteRoutes: [savedReady],
    savedRouteAssets: [importedReady],
  });

  assert.deepStrictEqual(
    normalized.candidates.map((candidate) => candidate.sourceKind),
    ['trail_pack', 'hidden_gem', 'ecs_idea', 'saved_built', 'imported_stitched'],
    'All guidance-ready source groups should be included in stable source order.',
  );
  assert.strictEqual(normalized.candidates.length, 5, 'Only active-guidance-ready routes should be visible.');
  assert.strictEqual(normalized.hiddenTotal, 2, 'Unavailable geometry should be hidden and counted.');
  assert.strictEqual(normalized.hiddenBySource.trail_pack, 1, 'Trail Pack hidden count should be tracked.');
  assert.strictEqual(normalized.hiddenBySource.hidden_gem, 1, 'Preview-only split geometry should be hidden.');
  assert.ok(
    normalized.hiddenReasons.some((entry) => /route geometry/i.test(entry.reason)),
    'Hidden reasons should preserve active-guidance unavailable language.',
  );
  assert.ok(
    normalized.candidates.every((candidate) => candidate.guidanceReady && candidate.unavailableReason === null),
    'Visible candidates should all be guidance-ready.',
  );

  const sameTerrainRoutes = Array.from({ length: 4 }, (_, index) =>
    makeRoute(`wizard-desert-${index}`, `Wizard Desert ${index}`, {
      imageTag: undefined,
      terrainType: 'Desert canyon',
      regionGroup: 'utah-canyonlands',
    }),
  );
  const thumbnailCandidateSet = wizard.normalizeExploreWizardRouteCandidates({
    trailPacks: sameTerrainRoutes,
  });
  const thumbnailUris = thumbnailCandidateSet.candidates.map((candidate) => candidate.thumbnail?.uri ?? null);
  assert.strictEqual(
    new Set(thumbnailUris).size,
    thumbnailUris.length,
    'TripBuilder wizard should assign unique thumbnails across visible guidance-ready routes while suitable fallbacks remain.',
  );
  assert.ok(
    thumbnailUris.every((uri) => typeof uri === 'string' && /[?&]w=960\b/.test(uri) && /[?&]h=640\b/.test(uri) && /[?&]q=88\b/.test(uri)),
    'TripBuilder thumbnails should use high-resolution photo URLs.',
  );

  const draft = wizard.createExploreWizardDraft(normalized.candidates[0], {
    gps: null,
  });
  assert.strictEqual(draft.step, 'select_route', 'Draft starts at route selection.');
  assert.strictEqual(draft.routeLocked, true, 'Build Trip should lock the selected route.');
  assert.strictEqual(draft.origin.status, 'missing', 'Missing GPS should remain explicit.');
  assert.strictEqual(draft.resupply.preference, 'fuel_supplies', 'Smart resupply should default to fuel plus supplies.');
  assert.strictEqual(draft.campBailout.bailout.enabled, true, 'Remote routes should default bailout planning on.');
  assert.strictEqual(draft.campBailout.camp.enabled, true, 'Overnight or camp-capable routes should default camp planning on.');
  assert.ok(
    draft.campBailout.camp.message.toLowerCase().includes('verify'),
    'Camp defaults should avoid claiming legal suitability.',
  );

  const manualDraft = wizard.createExploreWizardDraft(normalized.candidates[0], {
    manualOrigin: { latitude: 37.9, longitude: -110.1, label: 'Manual staging area' },
  });
  assert.strictEqual(manualDraft.origin.status, 'manual', 'Manual origin should be labeled as manual.');
  assert.strictEqual(manualDraft.origin.label, 'Manual staging area');

  const saveResultA = await planningSave.saveExploreRouteForPlanning(normalized.candidates[0]);
  const saveResultB = await planningSave.saveExploreRouteForPlanning(normalized.candidates[0]);
  assert.strictEqual(saveResultA.route.id, saveResultB.route.id, 'Explore Save should reuse the same route asset.');
  assert.strictEqual(saveResultA.run.id, saveResultB.run.id, 'Explore Save should reuse the linked run.');
  assert.strictEqual(routeStore.getAll().length, 1, 'Idempotent save should not duplicate route records.');
  assert.strictEqual(runStore.getAll().length, 1, 'Idempotent save should not duplicate linked runs.');
  assert.strictEqual(saveResultA.route.source_app, 'ecs_explore_save', 'Saved route should record Explore source app.');
  assert.strictEqual(saveResultA.route.external_source_id, normalized.candidates[0].id);
  assert.strictEqual(saveResultA.route.external_source_type, normalized.candidates[0].sourceKind);
  assert.ok(saveResultA.route.linked_run_id, 'Saved route should link to a local run.');

  const savedAssets = getSavedRouteAssets();
  const routeAsset = savedAssets.find((asset) => asset.routeId === saveResultA.route.id);
  assert.ok(routeAsset, 'Saved route should appear in Saved Route assets.');
  assert.strictEqual(routeAsset.capabilities.canStitch, true, 'Explore-saved route asset should be stitch-capable.');
  assert.ok(
    favoritesStore.getExploreFavoritesSnapshot().favorites.some((favorite) => favorite.sourceTrailId === normalized.candidates[0].route.id),
    'Explore Save should also upsert favorite/bookmark state.',
  );

  const existingRouteAsset = routeStore.createCustomRoute(
    [{
      coordinates: [
        [-111, 39],
        [-110.94, 39.06],
        [-110.88, 39.12],
      ],
    }],
    {
      name: 'Existing Local Route Asset',
      sourceApp: 'ecs_route_builder',
    },
  );
  const existingAssetOpportunity = wizard.importedRouteToExploreWizardRoute(existingRouteAsset);
  assert.ok(existingAssetOpportunity, 'Existing local route asset should normalize into an Explore wizard route.');
  const existingAssetCandidateSet = wizard.normalizeExploreWizardRouteCandidates({
    favoriteRoutes: [existingAssetOpportunity],
  });
  const existingAssetSave = await planningSave.saveExploreRouteForPlanning(existingAssetCandidateSet.candidates[0]);
  assert.strictEqual(existingAssetSave.route.id, existingRouteAsset.id, 'Explore Save should reuse an existing local route asset.');
  assert.strictEqual(
    routeStore.getAll().filter((route) => route.name === 'Existing Local Route Asset').length,
    1,
    'Saving an existing local route asset should not create a duplicate route copy.',
  );
  assert.ok(existingAssetSave.route.linked_run_id, 'Reused local route asset should receive a linked run when missing.');

  console.log('Explore TripBuilder wizard domain checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
